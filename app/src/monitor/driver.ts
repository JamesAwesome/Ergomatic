// The PM5 runtime driver (design spec §2-§3): wires a `Transport` to the
// `pm5/` codec and exposes the normalized `MonitorDriver` seam. Owns
// ack-gated write sequencing (with a pending-ack QUEUE — a coalesced BLE
// notification can carry two response frames in one callback turn, and the
// second must not be dropped just because nothing was awaiting it yet), the
// state machine (program -> armed -> the frame stream -> interval
// boundaries -> finished/terminated, where a terminal state closes the
// RUN — `activeRun`, opened only by `program()` — and never the driver
// itself, Phase 7A-fix-2 Task 4 / spec §4 / interface-notes.md §19.4), an
// optional tick-driven ack-timeout policy distinct from a transport
// disconnect, and `intervalRemaining`'s computation.
//
// `program()`'s three-phase lifecycle (design spec §3, interface-notes.md
// §18/§19.4/§19.5, progress.md's D1/D2): a leading PREPARE step
// (`sendPrepare` — renamed from "clear" by Phase 7A-fix-2 Task 3, since
// nothing here clears anything; it is the documented exit to WaitToBegin,
// see that function's own doc comment) whose outcome, apart from a
// confirmed disconnect, is swallowed as routine (fix-round 1's F3), an
// optional PREPARE-SETTLE wait (`waitForPrepareSettle`, fix-3 Task 2, design
// spec §1b) that only arms when the prepare fired against a machine still
// `rowing`/`resting` — session 3's hardware traces (interface-notes.md §18)
// showed that cycle passing through `terminated`/`idle` before ever
// reaching `armed`, and a program sent into that window arms structurally
// EMPTY — the real ack-gated programming send (`sendSequence`), then a
// tick-bounded VERIFICATION (`verifyArmed`) against the machine's own
// reported state AND 0x0031's own readback of the armed workout's
// STRUCTURE (fix-3 Task 4, on session 4a's hardware readings — armed alone
// was never enough; three hardware arms have reported "armed" while
// holding nothing), observed STRICTLY AFTER the send FULLY COMPLETED — the
// last frame's ack, not the first frame going out (fix-round 2; fix-round
// 1's own snapshot point was too early for a multi-frame program, so a
// stale "armed" tick from partway through the send could satisfy it). The
// ack is never trusted alone — the same ack byte has meant both
// "programmed" and "nothing happened at all" on real hardware.
//
// Phase 7A-fix-2 Task 3 gave the ack path its real vocabulary
// (`pm5/response.ts` §19.1's bitfield, already parsed by Task 2): success
// is `frameStatus === "ok"` alone; a genuine reject during the real
// programming send fires ONE documented `GetErrorType` follow-up
// (`sendGetErrorType`, interface-notes.md §19.7) logged as raw hex; and
// `terminate()` waits a tick-bounded SETTLE delay after its own ack
// before resolving, since a `SetScreenState` ack means queued, not done
// (interface-notes.md §19.6).
//
// Every Concept2 byte this file ever touches arrives pre-decoded through
// `pm5/parse.ts` (`parseGeneralStatus` et al., `toMonitorFrame`,
// `toIntervalActual`) or `pm5/response.ts` (`parseCsafeResponse`) — this
// file never inspects a raw opcode, offset, or checksum itself (design
// spec §Layering: "pm5/ is the only home of Concept2 bytes"; the Task 3
// review's own obligation on this task). The places that could tempt a
// raw-byte shortcut — building the ack-gated write sequence, or the
// one-off `GetErrorType` send — instead call `pm5/commands.ts`'s
// `buildProgrammingSequence`/`buildTerminate`/`buildGetErrorType` and
// `pm5/framer.ts`'s `chunkFrames`, reading nothing but their byte-array
// shapes.

import {
  buildGetErrorType,
  buildJustRowProgram,
  buildProgrammingSequence,
  buildSampleRateConfig,
  buildTerminate,
  expectedArmedStructure,
  type ArmedStructure,
} from "../../domain/monitor/pm5/commands.js";
import { chunkFrames, reassemble } from "../../domain/monitor/pm5/framer.js";
import {
  toActualIndex,
  toProgramIndex,
} from "../../domain/monitor/pm5/intervalIndex.js";
import {
  parseAdditionalSplitIntervalData,
  parseAdditionalStatus1,
  parseAdditionalStatus2,
  parseAdditionalSummaryRest,
  parseEndOfWorkoutSummary,
  parseGeneralStatus,
  parseSplitIntervalData,
  parseSummaryLogStamp,
  toIntervalActual,
  toMonitorFrame,
  toMonitorState,
  WORKOUTSTATE_INTERVALWORKDISTANCE,
  WORKOUTSTATE_INTERVALWORKDISTANCETOREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_INTERVALWORKTIMETOREST,
  type Pm5ParseError,
  type RawPm5Status,
  type WorkoutSummary,
} from "../../domain/monitor/pm5/parse.js";
import {
  parseCsafeResponse,
  type CsafeFrameStatus,
  type CsafeResponse,
} from "../../domain/monitor/pm5/response.js";
import {
  ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
  ADDITIONAL_STATUS_1_UUID,
  ADDITIONAL_STATUS_2_UUID,
  END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
  GENERAL_STATUS_UUID,
  LOGGED_WORKOUT_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  SAMPLE_RATE_UUID,
  SPLIT_INTERVAL_DATA_UUID,
  TRANSMIT_CHARACTERISTIC_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import type {
  ProgramInterval,
  WorkoutProgram,
} from "../../domain/monitor/program.js";
import type {
  IntervalActual,
  MonitorCapabilities,
  MonitorDriver,
  MonitorEvent,
  MonitorFrame,
  Transport,
} from "../../domain/monitor/types.js";
import type { MonitorEventLog } from "./eventLog";
import { NAMELESS_MONITOR_CAPTION } from "./deviceCaption.js";
// RC-9a (design spec 2026-08-25-free-oracles §1, fix round 1): imported
// rather than re-declared — a local copy had nothing binding it to
// `summaryModel.ts`'s own value, so a future change there would silently
// stop this verdict mirroring `monitorAvgSplit`'s exclusion while this
// file's own comments kept claiming it does. This is the one place
// `src/monitor/` reaches into `src/session/` — no `no-restricted-imports`
// rule forbids it (checked), and the value is a SCALAR the two modules
// must agree on, not an architectural premise.
import { MIN_MEASURABLE_ELAPSED_SECONDS } from "../session/summaryModel";

/** A programming/terminate write that never got acked "ok", OR a
 *  programming call whose verification phase never saw the machine report
 *  "armed" (design spec §1/§3), for exactly EIGHT distinct reasons —
 *  Phase 7A-fix-2 Task 3 split what used to be a single `"nak"` bucket
 *  into the four the wire actually distinguishes (`pm5/response.ts`
 *  §19.1's bitfield):
 *  - `"nak"`: a GENUINE reject — `(status & 0x30) === 0x10`,
 *    `CsafeFrameStatus` `"reject"`. The PM explicitly said no. On a
 *    programming send (never the prepare/terminate steps) this also fires
 *    ONE `buildGetErrorType()` and logs the raw reply
 *    (`sendGetErrorType`'s own doc comment) — CSAFE-DEF p.50
 *    (interface-notes.md §19.7): "the entire workout configuration
 *    operation is aborted resulting in a 'PrevReject' frame status. The
 *    Master must issue a PM-specific GetErrorType command" — a reject is
 *    not self-describing.
 *  - `"bad"`: the PM's own "Bad" status — `(status & 0x30) === 0x20`. A
 *    different machine statement than a reject, never folded into it.
 *  - `"not-ready"`: the PM's own "Not ready" status —
 *    `(status & 0x30) === 0x30`.
 *  - `"garbled"`: the response frame could not even be PARSED (bad
 *    checksum, missing flags, too short — `pm5/response.ts`'s
 *    `{kind: "unparseable"}`). Distinct from `"nak"` ON PURPOSE: a frame
 *    this driver cannot validate at all is a strictly different situation
 *    from the PM explicitly answering "reject" to a well-formed one — the
 *    exact conflation (both used to collapse onto `"nak"`) this task
 *    fixes.
 *  - `"disconnected"`: the transport's `onDisconnect` fired before any
 *    response arrived (send phase) or before verification ever observed
 *    "armed" (verify phase) — the link itself is down, so nothing further
 *    is ever coming.
 *  - `"timeout"`: the link stayed UP (no disconnect), but the caller-
 *    supplied `ackTimeout` policy's tick budget elapsed with no response —
 *    a genuinely different failure mode than a disconnect (the spec's own
 *    "mid-sequence timeout" injection, distinct from "disconnect mid-
 *    write"; fix-round HIGH-2). Neither "no response is coming" signal
 *    reads a wall clock: `"disconnected"` is learned from the transport's
 *    own event, `"timeout"` is counted in general-status TICKS (see
 *    `createPm5Driver`'s `ackTimeout` option), never `Date.now()`/
 *    `setTimeout`. (Hardware walk 5 added the file's ONE clock reading —
 *    `DriverOptions.now`, now read by three predicates, listed on that
 *    option — and fast-follow Task 2 added the file's ONE timer,
 *    `DriverOptions.schedule`, for the summary-fallback gate's single
 *    deadline. NOTHING ON THIS PATH READS EITHER: every programming budget
 *    is still ticks and only ticks.)
 *  - `"not-observed"`: plan Task 2 (interface-notes.md §18, progress.md's
 *    D2) — the ack said "ok", but `options.verifyTicks` GENERAL_STATUS
 *    ticks elapsed without the machine ever reporting `state === "armed"`.
 *    The ack is not sufficient evidence on its own: the identical `0x01`
 *    ack byte came back from both a real program and a complete no-op on
 *    real hardware.
 *  - `"structure-mismatch"`: fix-3 Task 4 (interface-notes.md §18 "SESSION
 *    4a", 2026-08-07 — the reading that ANSWERED interface-notes.md §17
 *    item 12). The machine DID report `"armed"`,
 *    and 0x0031's own structure fields say it armed something OTHER than
 *    the program we just sent. `"not-observed"` is deliberately NOT reused
 *    for this: a monitor that never armed and a monitor that armed the
 *    WRONG THING are different failures with different fixes, and the
 *    second one is the failure hardware has actually produced — three
 *    separate `:00` empty arms (§19.13's two, plus 4a's captured repro)
 *    every one of which passed the old state-only check. See
 *    `verifyArmed`'s own doc comment for the predicate, and
 *    `STRUCTURE_MISMATCH_TICKS`/`STRUCTURE_MISMATCH_WINDOW_MS` for the
 *    two-part rule (a stable wrong payload AND a wall-clock window) a
 *    rejection has needed since hardware walk 5.
 *
 *  `atFrame` is the 0-based index into the ack-gated sequence
 *  (`buildProgrammingSequence`'s outer array, or 0 for `buildTerminate`'s
 *  single frame) that failed during the SEND phase; it is `-1` for EVERY
 *  verify-phase failure — `"not-observed"`, `"structure-mismatch"`, or
 *  `"disconnected"` while verifying — since verification has no frames of
 *  its own, only ticks, so there is no frame index to report. `hexTrace`
 *  is every write/ack exchanged during a send-phase failure (already
 *  recorded to the event log too), or a description of what verification
 *  observed instead — for `"structure-mismatch"` that is the
 *  observed-vs-expected triple `describeStructureMismatch` formats. (The
 *  field name has outlived its literal meaning for the verify-phase
 *  reasons; renaming it is a consumer-facing change, not this task's.) */
export interface ProgramRejection {
  reason: ProgramRejectionReason;
  atFrame: number;
  hexTrace: string;
}

export type ProgramRejectionReason =
  | "nak"
  | "bad"
  | "not-ready"
  | "garbled"
  | "disconnected"
  | "timeout"
  | "not-observed"
  | "structure-mismatch";

const REJECTION_VERBS: Record<ProgramRejectionReason, string> = {
  nak: "rejected",
  bad: "reported the frame as malformed (bad)",
  "not-ready": "reported not ready",
  garbled: "returned a frame this driver could not even parse",
  disconnected: "disconnected before completing",
  timeout: "never acked (ack-timeout policy)",
  "not-observed":
    'never reported "armed" after programming (verification timed out)',
  "structure-mismatch":
    'reported "armed" while holding a different workout than the one just sent',
};

/** `pm5/response.ts` §19.1's bitfield -> this driver's typed reason, for
 *  the three `CsafeFrameStatus` values that are NOT `"ok"` — `"garbled"`
 *  (the `{kind: "unparseable"}` case, no `CsafeFrameStatus` to look up at
 *  all) is handled separately by `sendSequence`, not through this map. */
const REJECTION_REASON_BY_FRAME_STATUS: Record<
  Exclude<CsafeFrameStatus, "ok">,
  ProgramRejectionReason
> = {
  reject: "nak",
  bad: "bad",
  "not-ready": "not-ready",
};

export class ProgramRejectionError extends Error implements ProgramRejection {
  readonly reason: ProgramRejectionReason;
  readonly atFrame: number;
  readonly hexTrace: string;

  constructor(rejection: ProgramRejection) {
    // Verify-phase failures (`atFrame: -1`) have no frame index worth
    // printing — "frame -1" would read as a bug, not a deliberate sentinel.
    super(
      rejection.atFrame >= 0
        ? `PM5 ${REJECTION_VERBS[rejection.reason]} frame ${rejection.atFrame}`
        : `PM5 ${REJECTION_VERBS[rejection.reason]}`,
    );
    this.name = "ProgramRejectionError";
    this.reason = rejection.reason;
    this.atFrame = rejection.atFrame;
    this.hexTrace = rejection.hexTrace;
  }
}

/**
 * Thrown BEFORE `program()`'s lifecycle ever begins (before `sendPrepare`,
 * before any write) when a PREVIOUS `program()` call on this same driver
 * is still in flight — the fix this task pays off (ROADMAP: "a second
 * `program()` call during the prepare-settle wait strands the first",
 * fix-3 Task 2's own Probes C/C3). `program()` was never designed to be
 * called concurrently with itself — the single in-flight slots
 * (`pendingAck`/`pendingVerify`/`pendingPrepareSettle`) below all assume
 * exactly one call is ever using them — and a caller that tries anyway
 * used to have the SECOND call's writes interleave with the first's,
 * silently stranding whichever call's promise never got resolved.
 *
 * Deliberately NOT a `ProgramRejectionReason` member: that union is
 * machine-statements-only (`ProgramRejection`'s own doc comment) — every
 * existing member describes something the PM5 itself said or failed to
 * say over the wire. This is neither: no frame was ever sent for the
 * rejected call, so there is nothing the machine could have said about
 * it. The message is worded to match — it never attributes this to the
 * PM5 (contrast `ProgramRejectionError`'s own `"PM5 <verb>"` phrasing).
 */
export class ProgramBusyError extends Error {
  override readonly name = "ProgramBusyError";

  /** `inFlight` names what is holding the slot — `program()`, or
   *  `beginFreeRow()`'s detached p.80 send (spec 2026-09-02 ruling 4).
   *  `program()` refuses with this while either is live. `terminate()`
   *  refuses for NEITHER holder (spec rev 5, after the 2026-09-03 walk):
   *  it WAITS for the free-row send to settle — a bounded wait, because
   *  that send races `FREE_ROW_PROGRAM_DEADLINE_MS` — and it interleaves
   *  with `program()` on purpose (`programInFlight`'s own doc comment).
   *  Refusing WOULD leave the erg sitting in the Just Row session the app
   *  had just armed. That is a REACHABLE defect, not an observed one, and
   *  this comment used to blur the two: the 2026-09-03 walk's finding 4
   *  never entered this refusal — ring 3's Cancel ran 1589 ms after the
   *  send had settled, so `programInFlight` was already `false`. What the
   *  walk actually caught was the hook's own `mode !== "justrow"`
   *  exclusion. The refusal is fixed beside it as hardening, because both
   *  callers swallow a rejection, so refusing could only ever mean "the
   *  erg is not told"
   *  (`docs/monitor/sessions/walk-2026-09-03-jr-connect/`, finding 4). */
  constructor(inFlight = "program()") {
    super(
      `${inFlight} is already in flight on this driver. A second call must wait for the first to settle (resolve or reject) before it may be dispatched`,
    );
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * `MonitorFrame.intervalRemaining`'s computation (design spec §2: "COMPUTED
 * by the driver — program value minus quantized progress"; no characteristic
 * reports it, rev 1.30 has no "remaining" field, H3). Pure and exported
 * standalone specifically so it is unit-testable without any transport —
 * plan Task 4's own requirement ("expose the computation as a pure function
 * for testability"). `progress` is the interval's own quantized elapsed
 * value in ITS unit (seconds for a time interval, meters for a distance
 * one) — never negative-clamped on the way in, but the result is always
 * clamped to >= 0 (a quantization overshoot at the very last tick before a
 * boundary must never render as a negative countdown).
 */
export function computeIntervalRemaining(
  interval: ProgramInterval | undefined,
  progress: number,
): MonitorFrame["intervalRemaining"] {
  if (!interval) return null;
  return { kind: interval.kind, value: Math.max(0, interval.value - progress) };
}

/**
 * `MonitorFrame.intervalAccrued`'s computation (ROADMAP CL item 7;
 * `docs/design/DEVIATIONS.md`'s pane-C active-row row, task-7 review
 * adjudication 4) — the complement of `computeIntervalRemaining` above, for
 * the dimension the interval does NOT count down: a time-programmed
 * interval accrues distance here, a distance-programmed one accrues time.
 * `progress` is that OTHER dimension's own quantized elapsed value in ITS
 * unit — never the interval's own kind's progress, which
 * `computeIntervalRemaining` already owns. Same absence/clamping rules as
 * its sibling: `null` with no interval, the result never negative (a
 * quantization edge at a boundary crossing could otherwise read a hair
 * below zero on the complement dimension exactly as it can on the
 * programmed one).
 */
export function computeIntervalAccrued(
  interval: ProgramInterval | undefined,
  progress: number,
): MonitorFrame["intervalAccrued"] {
  if (!interval) return null;
  const kind = interval.kind === "distance" ? "time" : "distance";
  return { kind, value: Math.max(0, progress) };
}

/**
 * `recordRestDistanceVerdict`'s own all-or-nothing gate (RC-9d, fix round
 * 1) — exported as a pure function, same pattern as
 * `computeIntervalRemaining`/`computeIntervalAccrued` above, because this
 * predicate is the one place the review found real drift risk: it must
 * check the SAME PAIR `monitorRun.ts`'s own `computeWorkRestSums`
 * (monitorRun.ts:765-767) and `summaryModel.ts`'s `monitorRest`
 * (summaryModel.ts:693-695) check on the STORED record, or a future write
 * site could produce a plausible-looking but wrong sum — exactly the
 * "two rest populations under one line" shape this repo has already
 * shipped once (fix-round I2, cited at summaryModel.ts:611-614).
 *
 * `restSeconds`/`restDistanceMeters` are typed INDEPENDENTLY optional on
 * `IntervalActual` (`domain/monitor/types.ts:295`/`:328`), and that type's
 * own doc comment (types.ts:323-327) warns a future reconciler "must not
 * treat 'rest' as one population just because the two live under one
 * heading" — this function is that warning, enforced. Checking only
 * `restDistanceMeters` (fix round 1's own finding) would have been TRUE
 * today only by accident: both of `driver.ts`'s write sites into
 * `recordedActuals` (the summary-fallback synthesis, which omits BOTH
 * fields together, and the boundary path, which sets BOTH together from
 * one `IntervalActual` — see those two call sites' own comments) always
 * keep the pair together, so a single-field check and a pair check agree
 * on every actual this driver can build TODAY. They would disagree the
 * moment either write site's own coupling breaks — the exact shape the
 * type was widened to allow and the exact drift the review caught.
 *
 * Genuinely UNREACHABLE through this driver's own wire-simulated test
 * surface as of this task (`toIntervalActual`, `domain/monitor/pm5/
 * parse.ts:653-676`, always sets both fields together from one decoded
 * 0x0037 frame — `SplitIntervalData`'s own fields are both required,
 * non-optional `number`s). Tested directly, as a pure predicate, for
 * exactly that reason — the same testability trade `computeIntervalRemaining`/
 * `computeIntervalAccrued` above already made.
 */
export function restPairComplete(
  actuals: readonly {
    restSeconds?: number;
    restDistanceMeters?: number;
  }[],
): boolean {
  return actuals.every(
    (a) => a.restSeconds !== undefined && a.restDistanceMeters !== undefined,
  );
}

/** One arrived response frame on 0x0022: the RAW bytes alongside the
 *  decoded `CsafeResponse` — `sendSequence`'s own ack-gating reads
 *  `response`, but `sendGetErrorType` needs `raw` too (its own log entry
 *  is RAW HEX with no decode claims, per that function's doc comment;
 *  `CsafeResponse` throws away the exact bytes a `"parsed"` frame arrived
 *  as, and an `"unparseable"` one never had a decode to keep in the first
 *  place). `handleAckFrame` is this shape's one producer. */
interface AckArrival {
  raw: Uint8Array;
  response: CsafeResponse;
}

/** `"disconnected"`/`"timeout"` are the two ways an ack-await can end
 *  without a real response (see `ProgramRejection`'s own doc comment for
 *  the distinction); anything else is a genuine arrived frame. */
type PendingAckOutcome = "disconnected" | "ack-timeout" | AckArrival;

/** Fix-round HIGH-2: an optional, tick-driven ack-timeout policy — no wall
 *  clock. `ticks` counts GENERAL_STATUS_UUID notifications (this driver's
 *  established "tick pulse", `maybeEmitFrame`'s own comment) that arrive
 *  while a write is awaiting its ack; once that many have arrived with no
 *  response, the pending ack is resolved as `"ack-timeout"` — distinct
 *  from `"disconnected"` (the link stays up the whole time; a real PM that
 *  simply never responds to one particular command, not a radio drop).
 *  Omitted entirely (the default) means the original, still-supported
 *  behavior: wait for either a real response or a disconnect, with no
 *  bound of its own. The real radio adapters (`webBluetooth.ts`,
 *  `capacitorBle.ts`) are expected to translate their own real-time
 *  polling cadence into this same tick unit; this driver only ever counts
 *  them, never a clock. */
export interface DriverOptions {
  ackTimeout?: { ticks: number };
  /**
   * Bounds `program()`'s verification phase (design spec §1, plan Task 2)
   * in GENERAL_STATUS_UUID ticks — the same tick pulse `ackTimeout` counts,
   * but tracked as a SEPARATE budget on purpose: a monitor that is merely
   * SLOW to ack (`ackTimeout`'s job) and one that acks instantly but never
   * actually arms (`"not-observed"` — the identical `0x01` ack byte came
   * back from both a real program and a complete no-op on real hardware,
   * interface-notes.md §18/progress.md's D2) are two genuinely different
   * failures. Collapsing them onto one shared budget would make a
   * fast-but-lying monitor and a slow-but-honest one produce the SAME
   * typed reason, purely depending on which clock happened to win —
   * exactly the ambiguity a typed `ProgramRejectionReason` exists to
   * remove.
   *
   * **SEMANTICS CHANGED, fix-3 Task 4: omitting this no longer means "no
   * bound" — it means the DEFAULT, `30`** (`DEFAULT_VERIFY_TICKS`, the
   * value `scripts/pm5-lab.ts` reasoned its way to on hardware cadence and
   * still passes explicitly, now redundantly). Until this task,
   * verification's only success condition was `state === "armed"`, so an
   * omitted bound merely meant "wait for a state word that a live PM
   * reliably produces". Verification now also requires the STRUCTURE to
   * match (`verifyArmed`'s own doc comment), and under a structure
   * predicate an unbounded wait is a genuinely different hazard: the case
   * it would hang on — a machine that arms the WRONG workout and keeps
   * saying so — is precisely the case this task exists to detect, so
   * "unbounded" would convert a caught defect into a silent hang. A caller
   * that wants a longer leash passes a bigger number; there is no way to
   * ask for "forever" any more, on purpose. 7B inherits the safe default
   * rather than having to remember the option exists. Still ticks, never a
   * wall clock.
   */
  verifyTicks?: number;
  /**
   * Bounds `terminate()`'s post-ack SETTLE wait (design spec §7,
   * interface-notes.md §19.6) in GENERAL_STATUS_UUID ticks — the same
   * pulse `ackTimeout`/`verifyTicks` count, but its own budget again, for
   * the same reason those two are separate from each other.
   * `SetScreenState`'s ack means the command was received and QUEUED, not
   * that the PM has actually acted on it yet (CSAFE-DEF p.65: the comms
   * task answers immediately, the UI task applies it later at 2-5 Hz).
   * The documented fix is polling `CSAFE_PM_GET_SCREENSTATESTATUS` until
   * `_INACTIVE` — NOT built here, deliberately (design spec §7): that GET
   * lives in the same unconfirmed pull-command space as
   * `buildGetErrorType` (interface-notes.md §17 item 14, the pull-path
   * wrapper question). This settles for the document's own WEAKER
   * fallback instead — "delay sufficiently long (e.g. 1 second or more)"
   * — expressed as a tick
   * count rather than a literal wall-clock second, same rule as every other
   * tick budget in this file. (Every BUDGET here is still ticks and only
   * ticks. Since hardware walk 5 the file does read a clock in exactly one
   * place, and it is not a budget: `DriverOptions.now`, for the structure
   * gate's persistence window — see `STRUCTURE_MISMATCH_WINDOW_MS`.)
   *
   * UNLIKE `ackTimeout`/`verifyTicks`, omitting this is never "no
   * bound" — it means the default, `3`, not an unbounded wait
   * (`terminate()` has no failure reason of its own to report if this
   * ticked forever, so an unbounded settle would just be a silent hang
   * with no reason typed for it). Passing `0` explicitly skips the wait
   * entirely (resolves the instant the ack lands) — the escape hatch for
   * a caller/test with no further ticks to offer and no need to model
   * this hazard.
   */
  settleTicks?: number;
  /**
   * Bounds `program()`'s PREPARE-SETTLE wait (design spec §1b, fix-3 plan
   * Task 2) in GENERAL_STATUS_UUID ticks — `waitForPrepareSettle`'s own
   * doc comment carries the full citation. A DIFFERENT, STATE-KEYED
   * mechanism from `settleTicks` above (which counts blindly, regardless of
   * what the machine reports): this wait only ever arms when the machine's
   * state AT THE MOMENT `program()`'s prepare step was sent was `rowing` or
   * `resting` — i.e. only when `sendPrepare()`'s leading terminate is
   * actually closing a RUNNING piece, the exact condition session 3's
   * hardware traces reproduced twice with unrelated program shapes
   * (interface-notes.md §18 "Live bisect": REPRO and Step 5 both landed a
   * structurally EMPTY arm — `verifyArmed` passing regardless — while the
   * machine was still `rowing`). For a program DISPATCHED from any state
   * other than `rowing`/`resting` — armed/idle/finished/terminated, the
   * ordinary main-menu case — this wait never registers at all and costs
   * ZERO ticks (latency pin, `waitForPrepareSettle`'s own doc comment).
   *
   * Two different senses of "settled" are in play here, on purpose — name
   * them so neither reads as contradicting the other. The paragraph above
   * is the ENTRY gate's question only: "was a piece genuinely running AT
   * DISPATCH?" Both hardware observations answer that with `rowing`
   * (§19.13); there is no observation, in either direction, of a dispatch
   * that instead catches the machine already reading `terminated`/`idle`
   * FROM AN EARLIER terminate, still mid-auto-cycle. This gate stays narrow
   * on purpose (widening it would tax 7B's ordinary "program the next
   * workout" flow on zero evidence) — that is a design choice, not a
   * finding that such a dispatch is safe. It is unobserved territory,
   * flagged for a future hardware reading, not ruled on here.
   *
   * `terminated` and `idle` do NOT satisfy the RELEASE condition, once this
   * wait IS already running — a DIFFERENT question from the entry gate
   * above ("has the machine finished reacting to OUR terminate?"). The
   * traces show the PM's own Terminate -> Rearm -> WaitToBegin auto-cycle
   * (CSAFE-DEF Appendix E) passing through BOTH on its way to `armed`, so
   * treating either as the release signal would resolve while the machine
   * is still mid-cycle. The end condition is `armed` FOLLOWED BY one
   * further tick (any state) —
   * the observed clean arms all needed at least one more tick after `armed`
   * before the structure genuinely reflected the new program (the same
   * "never trust an already-cached tick" discipline `verifyArmed` already
   * applies), so this wait holds itself to the identical standard rather
   * than resolving on the very tick that first reports `armed`.
   *
   * Omitting this is never "no bound" — it means the default, `10`
   * (`waitForPrepareSettle`'s own doc comment has the exact observed spans
   * this covers), the same shape `verifyTicks` itself now has since fix-3
   * Task 4 gave that option a default too. Passing `0` disables the wait
   * entirely (session 4b's own "detection row" needs exactly this: settle
   * OFF, confirming the empty arm still reproduces so the structural
   * readback has something real to catch). On expiry without ever observing
   * `armed`, this NEVER rejects: `program()` proceeds and logs
   * `prepare-settle-expired` — a 2Hz sampler CAN coalesce the whole
   * terminated/idle/armed cycle into fewer ticks than expected (session 3's
   * own Step 5: idle and armed shared one elapsed reading), so a bound that
   * never fires would just trade one hazard (an unconfirmed empty arm) for
   * another (a `program()` call that never resolves) — the structural
   * readback (`verifyArmed`'s own predicate, built by fix-3 Task 4) is what
   * actually catches an empty arm; this wait is prevention, not the last
   * line of defense.
   */
  prepareSettleTicks?: number;
  /**
   * Bounds `sendGetErrorType`'s own reply wait (Task 3 review,
   * IMPORTANT-1) in GENERAL_STATUS_UUID ticks — ALWAYS ACTIVE, unlike
   * `ackTimeout`'s bound on every OTHER write, which only counts when the
   * caller opts in. A genuine reject fires `GetErrorType` unconditionally
   * (`sendSequence`'s own `fetchErrorTypeOnNak` gate), so an operator who
   * never configured `ackTimeout` (the real call site, `pm5-lab.ts`, only
   * ever passes `verifyTicks`) would otherwise have NO bound on this one
   * wait — proven by the review: a stub transport, no `ackTimeout`, a
   * genuine `0x11` reject, and the outer rejection never settles. The
   * wrapper is itself unconfirmed (`buildGetErrorType`'s own doc
   * comment's 0x1A-vs-0x7F conflict), and CSAFE-DEF p.10 says a slave
   * "merely disregards" an unrecognized command — so a real PM may simply
   * never reply at all, making an unbounded wait a LIKELY hang, not a
   * theoretical one.
   *
   * Same principle as `settleTicks` (that field's own doc comment):
   * omitting this is never "no bound" — it means the default, `3`. On
   * expiry, `sendGetErrorType` logs the same `"no reply (ack-timeout)"`
   * marker a configured `ackTimeout` would have produced, and the ORIGINAL
   * `"nak"` rejection proceeds exactly as it would have without
   * `GetErrorType` at all — this bound only stops the wait from hanging,
   * it never changes the outer outcome.
   */
  errorTypeTicks?: number;
  /**
   * **THE ONE WALL CLOCK IN THIS FILE** (hardware walk 5, 2026-08-10, phone
   * BLE at the erg — PM5 432331249; interface-notes.md §21 items 2-3, whose
   * item 3 states the rule directly: "Tick-count-calibrated logic is
   * transport-relative; wall-clock windows are not"), and the one place the "ticks, never a
   * clock" rule stated on every budget above is deliberately broken. It
   * exists for exactly three predicates, each forced by its own hardware
   * reading and none expressible as a tick count:
   *   - the post-program structure gate's persistence window
   *     (`STRUCTURE_MISMATCH_WINDOW_MS`, walk 5),
   *   - the FINISH GRACE's own expiry (`FINISH_GRACE_MS`, walk day 3 — it
   *     used to expire on the machine's next status sample, which measured
   *     the PM's tick rate rather than the split's arrival and was dead
   *     before the data it existed for arrived), and
   *   - the summary-fallback gate's in-window test on 0x0039 (fast-follow
   *     Task 2, design spec §5) — the same grace deadline read from the
   *     other side, which is why it asks `graceIsOpen()` rather than
   *     keeping a second window of its own.
   * Every BUDGET here still counts ticks; none of these is a budget.
   *
   * Why a clock had to appear at all: every other budget in this file bounds
   * something whose meaning does not change with the notification rate ("how
   * many samples am I willing to wait?"). The structure gate is different —
   * it decides that a machine is holding the WRONG WORKOUT, and walk 5
   * caught it deciding that DURING the PM5's own two-step structure update,
   * purely because iOS delivers status notifications 3-6x faster than the
   * desktop radio the rule was tuned on. A verdict a faster radio can win is
   * not a verdict about the machine. The finish grace's expiry is the same
   * lesson learned a second time, one layer over: a window that closes on
   * the machine's next tick closes on the machine's CADENCE, and the thing
   * it was supposed to be waiting for does not keep that schedule.
   *
   * Injectable so tests can hold or advance it deterministically (the driver
   * tests' own `manualClock()`); defaults to `Date.now`. Only ever read for
   * DIFFERENCES between two readings, never for absolute time, so any
   * monotonically non-decreasing millisecond source will do.
   */
  now?: () => number;
  /**
   * **THE ONE TIMER SEAM IN THIS FILE** (fast-follow Task 2, design spec
   * §5) — a schedule-and-cancel pair returning the canceller, the same
   * shape and the same injection reason `useMonitorSession.ts`'s
   * `MonitorSessionDeps.schedule` has. Defaults to `setTimeout` /
   * `clearTimeout`.
   *
   * It serves exactly TWO deadlines: the summary-fallback gate's
   * reconcile at `FINISH_GRACE_MS` after a natural finish
   * (`armSummaryReconcile`), and — since spec 2026-09-02 — the bound on
   * `beginFreeRow()`'s detached p.80 send, `FREE_ROW_PROGRAM_DEADLINE_MS`
   * (that constant's own doc comment says why a tick budget cannot bound
   * a send to a transport that never ticks). Every OTHER budget in this
   * file is still counted in GENERAL_STATUS ticks and nothing about
   * `program()` reads a timer at all — the rule stated on
   * `ackTimeout`/`verifyTicks`/`settleTicks` above is intact for all of
   * them.
   *
   * Why the gate could not be a tick count, when every budget here is:
   * the reconcile's whole job is to decide, at a MOMENT, that a split has
   * not arrived — and the thing it is waiting for keeps no relationship to
   * the PM's notification cadence (walk day 3's measurement, cited in full
   * on `FINISH_GRACE_MS`). A tick-keyed reconcile would fire early on the
   * fast iOS radio and late on the slow desktop one, i.e. the verdict
   * would be decided by whichever radio the rower happened to be on. It
   * also must match `FINISH_GRACE_MS` EXACTLY: the gate fires when the
   * grace it mirrors has just closed, so the two must be one number read
   * off one clock, not two approximations of the same instant.
   */
  schedule?: (cb: () => void, ms: number) => () => void;
  /**
   * The advertised name `Transport.scan()` returned for the device the
   * caller connected to (`DiscoveredMonitor.name`, `domain/monitor/
   * types.ts` — e.g. "PM5 432331249") — 7B's scan/connect flow is expected
   * to thread its own scan result straight through here (ROADMAP's own
   * obligation: `createPm5Driver`'s old two-argument signature had no
   * `DiscoveredMonitor` to source a real name from at all). Flows verbatim
   * into `capabilities.deviceName`. Omitted (the constructor is still
   * reachable with no name at all — a caller mid-migration, or a test with
   * nothing to assert about the name) falls back to the literal
   * `NAMELESS_MONITOR_CAPTION` (RC-18: `"MONITOR"`, not `"PM5"` — an
   * invented brand this door never advertises), same as before this option
   * existed; never fabricated from anything else.
   */
  deviceName?: string;
}

/** RC-18's neutral caption, now defined in the LEAF module
 *  `deviceCaption.ts` (door PR A's whole-branch review, M-3 — that file's
 *  own comment has the why) and RE-EXPORTED here so this module's existing
 *  consumers, the transports included, keep importing it from where they
 *  always did. New READ-side consumers should import the leaf directly. */
export { NAMELESS_MONITOR_CAPTION } from "./deviceCaption.js";

/** `DriverOptions.settleTicks`'s own default — see that field's doc
 *  comment for why "omitted" means this number, not "no bound". */
const DEFAULT_SETTLE_TICKS = 3;

/** `DriverOptions.verifyTicks`'s own default (fix-3 Task 4) — originally
 *  `20`, the number `scripts/pm5-lab.ts` reasoned its way to against the
 *  OBSERVED ~2 Hz status cadence (interface-notes.md §18), i.e. ~10 real
 *  seconds: generous enough to absorb the PM's own Appendix-E auto-cycle
 *  plus BLE jitter, still bounded. Promoted from "the lab's local constant"
 *  to the driver's default because verification now carries a STRUCTURE
 *  predicate and an unbounded verify under one is a hang, not a leniency —
 *  see `DriverOptions.verifyTicks`'s own doc comment.
 *
 *  **RAISED 20 -> 30 (fix round 1 after hardware walk 5, review I-1), and
 *  the number is now a FUNCTION of `STRUCTURE_MISMATCH_WINDOW_MS` rather
 *  than of anything about the bound itself.** This budget and that window
 *  race each other: whichever fires first decides, and BOTH settle the same
 *  `"structure-mismatch"` reason once an armed tick has disagreed
 *  (`settleVerifyFailure`'s two call sites). At `20` the race was already
 *  lost at the fast end of §21 item 3's recorded cadence — 20 x 90 ms =
 *  1800 ms, so the bound pre-empted the 2000 ms window and the verdict went
 *  back to being decided by a tick COUNT, which is the exact defect class
 *  walk 5 opened. The window can only be the deciding rule while
 *
 *      DEFAULT_VERIFY_TICKS x (fastest observed tick spacing)
 *          > STRUCTURE_MISMATCH_WINDOW_MS
 *
 *  i.e. `> 2000 / 90 = 22.2`, so at least 23. `30` takes that with headroom
 *  (2700 ms at 90 ms/tick) rather than sitting one jittery tick away from
 *  the boundary. What it costs is latency on the OTHER failure — a machine
 *  that never arms at all now reports `"not-observed"` after 30 ticks
 *  instead of 20 (~2.7-5.4 s on iOS, ~15 s at the desktop's ~2 Hz), which
 *  is a wait on an already-broken program, not a cost any healthy arm pays.
 *  `scripts/pm5-lab.ts` still passes `20` EXPLICITLY, and that is now a
 *  real (no longer redundant) choice: the lab runs over the desktop radio,
 *  where 20 ticks is ~10 s and no cadence anyone has measured can pre-empt
 *  the window. */
const DEFAULT_VERIFY_TICKS = 30;

/** How many CONSECUTIVE armed ticks must report the SAME wrong structure
 *  before `verifyArmed` rejects (fix-3 Task 4). Three. What the number
 *  actually rests on, kept strictly separate from what was merely asserted:
 *
 *  RECORDED (interface-notes.md §18 "SESSION 4a", 2026-08-07) — the two
 *  observations that justify N > 1 on their own:
 *  - **MID-CYCLE TRANSIENTS**: 4a captured `workoutType=1` carrying stale,
 *    NON-ZERO durations between the accept and the steady state. A mismatch
 *    whose own payload keeps changing is a machine still settling, not a
 *    machine holding the wrong workout — which is both why `1` would reject
 *    healthy programs and why the rule counts STABLE ticks rather than
 *    merely mismatched ones (a changed payload restarts the count).
 *  - **A MULTI-TICK UNSETTLED WINDOW IS NORMAL**: 4a's own settle
 *    validation measured `"armed" observed on tick 4`, twice, at the exact
 *    session-3 repro. Several ticks between the ack and a trustworthy
 *    reading is the observed normal, not a pathology.
 *
 *  ASSERTED, NOT LOCATED (review I-1): the fix-3 plan and this task's brief
 *  both state that "2 of session 3's 5 clean arms carried the previous
 *  program's 0x0031 payload on their first armed tick". **No source for it
 *  exists in this repo** — §18's session-3 record contains no such reading,
 *  and it could not: Task 1 of THIS phase built the first log able to
 *  record a 0x0031 payload at all (see `lastLoggedStructure`'s own comment,
 *  "no 0x0031 payload has ever been recorded before now"), so session 3
 *  predates the instrument. What session 3 genuinely showed was a related
 *  but DIFFERENT observable — `verifyArmed` resolving on frames whose
 *  ELAPSED fields still carried the previous workout. Treat the 2-of-5
 *  figure as a plan assertion pending confirmation; **session 4b is the row
 *  that confirms or retires it**, and this driver's own
 *  `"structure-mismatch"` first-sighting entry is the instrument that will
 *  answer it (a healthy lagging arm logs exactly one and still succeeds).
 *  The rule does not depend on it either way.
 *
 *  Three is comfortably above a single-tick lag of any origin, and far
 *  below `DEFAULT_VERIFY_TICKS` so the streak (not the outer bound) is what
 *  normally reports a genuine empty arm — the outer bound stays the
 *  backstop for a machine whose wrong payload never stabilizes at all.
 *
 *  **NO LONGER SUFFICIENT ON ITS OWN (hardware walk 5, 2026-08-10 —
 *  interface-notes.md §21 items 2-3).** Three ticks is a duration only if
 *  you know the tick rate, and the phone's is 3-6x the desktop's (§21 item
 *  3: "Status ticks arrive at ~90-180ms spacing on iOS") — three of them fit inside the PM5's own two-step
 *  structure update, which is exactly the false `"structure-mismatch"` the
 *  walk produced. This count now carries only the STABILITY half of the
 *  verdict ("the payload held still"); `STRUCTURE_MISMATCH_WINDOW_MS`
 *  carries the DURATION half ("...for longer than any transition anyone has
 *  recorded"), and a rejection needs both. */
const STRUCTURE_MISMATCH_TICKS = 3;

/** How long the SAME wrong structure must persist, in WALL-CLOCK
 *  milliseconds, before `verifyArmed` rejects — the second half of the
 *  mismatch verdict, and the reason the tick streak above is no longer
 *  sufficient on its own.
 *
 *  RECORDED (hardware walk 5, 2026-08-10, phone BLE, PM5 432331249, 0x0031
 *  read tick by tick — interface-notes.md §21 item 2: "The PM5 updates its
 *  0x0031 structure report in TWO steps after programming... Verification
 *  gates must tolerate the transition by wall clock, not tick count"): after the program ack the PM5's general-status frames
 *  update the armed structure in **TWO STEPS**. First `workoutType` flips to
 *  the programmed value while `workoutDurationRaw` stays `0` at
 *  `workoutDurationType` `0x80` — the idle pattern, i.e. the machine reports
 *  the new TYPE before it reports the new DURATION. Roughly 180 ms (~2
 *  ticks) later the duration populates (`70 17 00`, type `0`) and stays
 *  correct for the rest of the session. The intermediate reading is a
 *  perfectly stable, perfectly wrong structure: `observed workoutType=8
 *  durationRaw=0 durationType=128` against `expected workoutType=8
 *  durationRaw=6000 durationType=0`.
 *
 *  Why the tick streak alone was WINNABLE BY TICK RATE. On iOS the CCCD
 *  setup completes in milliseconds, so status ticks arrive every ~90-180 ms
 *  and the transport SEES the transition window: three of them can elapse
 *  INSIDE the PM5's own two-step update, and `program()` fails
 *  `"structure-mismatch"` on a machine that armed correctly. It fired
 *  intermittently on the phone — some connects showed 2 stale ticks (pass),
 *  some 3 or more (fail). The desktop transport has never produced it, for a
 *  reason that is an accident rather than a defence: CCCD setup there takes
 *  >1.5 s, so the FIRST status notification the driver ever sees already
 *  arrives after the transition has completed.
 *
 *  2000 ms is ~10x the observed 180 ms transition and still an order of
 *  magnitude short of a rower noticing. A CORRECT observation still resolves
 *  on the tick it arrives — nothing about the success path waits — so this
 *  window only ever delays a REJECTION, and only for a machine that keeps
 *  saying the same wrong thing.
 *
 *  **BOTH DIRECTIONS, because the outer `verifyTicks` bound settles the
 *  SAME reason** (review I-1 — an earlier version of this comment reasoned
 *  only about the slow one):
 *  - SLOW transport: the bound still ends the phase on ticks, so a radio
 *    that goes quiet cannot turn this window into a hang. That is why the
 *    bound was left tick-only.
 *  - FAST transport: the bound must not fire BEFORE this window can, or the
 *    verdict is a tick count again wearing the same typed reason — the
 *    defect walk 5 opened, one constant over. `DEFAULT_VERIFY_TICKS` is
 *    what keeps that from happening, and it is sized off this number (30
 *    ticks x 90 ms = 2700 ms > 2000 ms; its own doc comment carries the
 *    arithmetic). **Changing either constant without re-checking the other
 *    silently hands the verdict back to whichever radio is fastest.**
 *
 *  This pairing is the STRUCTURE gate's alone. `FINISH_GRACE_MS` (walk day
 *  3) is a separate clock with a separate job and no relationship to
 *  `verifyTicks` at all — programming and finishing are different moments,
 *  and nothing bounds them together. */
const STRUCTURE_MISMATCH_WINDOW_MS = 2000;

/** How many `"structure-mismatch-recovered"` entries `armedWatch` may log
 *  per RUN (RC-37 fix round 1, finding 2). The spec's own instruction is
 *  "log the START of a streak and its RESOLUTION, never per tick" — this
 *  file already does that (one entry per streak-CYCLE, not per tick) — but
 *  a wire that keeps bouncing between the sent structure and a wrong one
 *  produces one streak cycle every couple of ticks, and nothing bounded
 *  how many CYCLES one run could log. A pathological run could otherwise
 *  fill a meaningful fraction of the 500-entry ring with near-misses alone,
 *  evicting the evidence the design spec's own §1b instruction exists to
 *  preserve (whether a rest-bearing piece's near-misses read as
 *  "comfortable" or "lucky"). Five is enough to answer that question —
 *  more entries would not change the verdict, only crowd the ring — and
 *  matches this file's own "log a representative sample, not everything"
 *  idiom (`refusedKeysLogged`/`clampedKeysLogged`'s per-key dedup is the
 *  same instinct applied to a different axis: bounding WHAT gets logged
 *  rather than HOW MANY times). */
const STRUCTURE_RECOVERED_LOG_CAP = 5;

/** How long after a natural finish a boundary still belongs to the run that
 *  just ended — the FINISH GRACE's own clock (`activeRun.finishGraceUntil`).
 *
 *  MEASURED (hardware walk day 3, 2026-08-11, PM5 432331249; the device's
 *  own wire-log stash, recorded in interface-notes.md §22 item 5). The
 *  sequence, verbatim from the stash:
 *
 *      seq 19  terminal            finished
 *      seq 20  handoff-hold        (the app holds its ended hand-off)
 *      seq 21  notify-first        0x0037
 *      seq 22  split-half          0x0037 Split/Interval Number 1
 *                                  (run closed, state=finished)
 *      seq 23  notify-first        0x0038
 *      seq 24  split-half          0x0038, same boundary
 *      seq 25  boundary-out-of-run no open run — index=null
 *
 *  Two facts kill the previous bound. The PM5 keeps sending identical
 *  `finished` status frames after the terminal one (the log dedupes them on
 *  state change; the emit path sees every one), and the split pair arrives
 *  LATER THAN ONE OF THEM — but well inside 3 s. A grace that expires "on
 *  the machine's next status sample" is therefore keyed to the tick rate,
 *  not to the split, and on this hardware it is always dead before the data
 *  it exists for arrives (seq 25 is exactly that, with the run's own actual
 *  in hand).
 *
 *  3000 ms is the widened window day 3 measured the arrival inside, taken as
 *  the bound rather than a tighter estimate of it: the cost of being late is
 *  zero (the grace is CONSUMED by the boundary it was for, and the app's
 *  hand-off releases on that same boundary — nothing waits out this window
 *  in the ordinary case), while the cost of being early is the whole defect,
 *  twice shipped. Nothing about correctness rests on the number: what keeps
 *  a stranger's boundary out is the set of bounds that never depended on
 *  timing at all — natural-finish-only (never post-terminate, footnote 12),
 *  a real observed active state to normalize against, an index the offset
 *  rule explains, an interval this run is still MISSING, consumed once, and
 *  the record's own independent re-derivation of the last two
 *  (`monitorRun.ts`'s `acceptableFinalBoundary`).
 *
 *  COUPLED CONSTANT: `useMonitorSession.ts`'s `FINISH_HANDOFF_HOLD_MS` is
 *  3500 and NOT by coincidence — both windows open in the same synchronous
 *  emit (the `finished` branch below opens this grace, arms the summary
 *  reconcile, and then emits `workoutComplete`; the hook's handler
 *  schedules its backstop inside that emit), so the hook's backstop can
 *  only fire after this grace has expired: a vouched boundary can never
 *  land AFTER the hand-off already released. Shorten THIS constant and that
 *  stays true; lengthen it to or past the hold and a boundary can be accepted
 *  into a record the log screen has already snapshotted — change the two
 *  together or not at all (clock-grace review, scrutiny 5).
 *
 *  **THE INEQUALITY IS STRICT SINCE FAST-FOLLOW TASK 2: hold > grace**
 *  (design spec §5), where `>=` used to do. Equality worked while every
 *  vouched boundary was a NOTIFICATION arriving strictly inside this
 *  window. The summary fallback puts an event ON the deadline itself: the
 *  reconcile (`armSummaryReconcile`) fires at exactly `FINISH_GRACE_MS` and
 *  synthesizes the final interval right there when the split was dropped.
 *  Equal constants would make that fill and the hand-off's backstop two
 *  timers due at the same millisecond, i.e. the fill racing the navigation
 *  it exists to beat. The hold carries the margin, not this window: this
 *  one is a measurement (walk day 3) and must not be padded to make room. */
const FINISH_GRACE_MS = 3000;

/** How long `beginFreeRow()`'s detached p.80 send may hold `programInFlight`
 *  waiting for its ack before it is ABANDONED and `free-row-program-
 *  unanswered` is recorded (spec 2026-09-02 ruling 4, harden lens 2).
 *  A wall-clock deadline, not a tick budget, on purpose: the transports
 *  that never answer (the replay transport, a PM5 that has gone quiet)
 *  are exactly the ones whose ticks cannot be counted on, and production
 *  configures no `ackTimeout`, so without this the flag would hold for the
 *  driver's life and `terminate()` would WAIT on it forever.
 *
 *  MEASURED, not reasoned (spec rev 5): the walk
 *  `docs/monitor/sessions/walk-2026-09-03-jr-connect/` timed write→ack at
 *  **1968 / 2060 / 1788 ms** across its three sessions — the Just Row
 *  frame's ack arrives after the PM's three `notify-first` lines, not in
 *  the ~90 ms a workout program's ack takes (the figure this constant was
 *  first written against, and the one the walk falsified for THIS frame).
 *  3000 ms left under a second of margin over a 2.06 s worst case; 5000 ms
 *  is ~2.4x the slowest ack observed. It is a ceiling, not a delay: every
 *  ack that lands clears the flag the moment it arrives.
 *
 *  RAISING IT IS NOT FREE, and this comment used to say it was — written,
 *  as the delta pass on PR #278 pointed out, on the one constant that
 *  exists for machines that do NOT answer. On a machine that never acks,
 *  this number is exactly how long `terminate()` sits before it writes,
 *  and that wait races the app's own teardown. Measured on the walk's ring
 *  1 (offsets from its own p.80 write): END at `ready` closes the record
 *  and opens the burst hold at +66903, which releases at +68905 (2002 ms);
 *  release, navigation and the unmount take 2025 ms more, reaching
 *  `disconnect-requested` at +70930 — 4027 ms from END. The Ready screen
 *  is up at +1159, so the earliest END puts the hang-up at about
 *  write+5186 ms against a terminate released at write+5000 ms. About
 *  186 ms apart. The ordering is held by `terminateWritesOwed` (a hang-up waits
 *  for a terminate that still owes its write), NOT by this number, which
 *  is why the number did not move to buy margin. Anyone raising it further
 *  is lengthening that wait, not padding a safety factor.
 *
 *  While it holds, an END or a Cancel from the app WAITS for the send
 *  rather than being refused (`terminate()`'s own comment) — bounded here,
 *  and the erg is told either way. */
const FREE_ROW_PROGRAM_DEADLINE_MS = 5000;

/** RC-9a (design spec 2026-08-25-free-oracles §1) — the live average-pace
 *  verdict's own band. The pre-spec pass measured a 0.07-0.20 s MEDIAN
 *  disagreement between 0x0032's `averageSplit` and our own quotient
 *  across seven captures, plus an unexplained terminal step of up to
 *  1.02 s (never sampled here — see `lastWorkStateAverageSplit`'s own
 *  comment). 1.0 s clears both with room and is far inside what a single
 *  lost interval would move the quotient by — worked below (the ONLY
 *  place this derivation lives; `recordAvgPaceVerdict`'s own "BAND:"
 *  line points HERE, not the reverse).
 *
 *  THE LOST-INTERVAL DERIVATION. `ours` (`recordAvgPaceVerdict`) is the
 *  RATIO `500 * ΣT / ΣD` over whatever this run's `recordedActuals`
 *  holds — never a count. Let `ΣT`/`ΣD` be the TRUE totals (what they
 *  would be with a missing interval `i`, time `t_i`, distance `d_i`,
 *  included), `P = 500·ΣT/ΣD` the true average pace, `P_i = 500·t_i/d_i`
 *  interval `i`'s OWN pace, and `ours = 500·(ΣT-t_i)/(ΣD-d_i)` what this
 *  function actually computes without it. Substituting `ΣT = P·ΣD/500`
 *  and clearing denominators:
 *
 *      ours - P  =  d_i · (P - P_i) / (ΣD - d_i)
 *
 *  **The verdict is INSENSITIVE to a lost interval whose own pace equals
 *  the run's average**: `P_i = P` drives the shift to exactly ZERO at
 *  ANY band width, however large the missing interval — `ours` is a
 *  ratio of sums, not a population count, and losing a data point that
 *  was already sitting on the mean cannot move a ratio. This is why the
 *  three checks above this verdict's own suppression list (actuals vs.
 *  `recordedActuals.size`, the final-interval-recorded check, the
 *  mid-terminate shape) are load-bearing on their own: they catch a lost
 *  interval STRUCTURALLY, by population, and this ratio check must never
 *  be read as a substitute — "agree" proves the two computed pace
 *  numbers match, never that no interval went missing.
 *
 *  Worked from a real run — the exit-7 walk capture
 *  (`docs/monitor/sessions/walk-2026-08-24/README.md`): interval 1
 *  67.9 s/250 m (`P_1` = 135.8 s/500m), interval 2 56.1 s/250 m (`P_2` =
 *  112.2 s/500m), true average `P` = 124.0 s/500m (2:04.0/500m,
 *  `ΣD` = 500). Losing interval 2 (`d_i` = 250, `P_i` = 112.2, the
 *  FASTER of the two, `P - P_i` = +11.8): `ours - P` = 250·11.8/250 =
 *  **+11.8 s/500m** (`ours` reads 135.8, the SLOWER of the two — losing
 *  a fast interval makes what's left LOOK slower) — 11.8× the 1.0 s
 *  band, easily caught. Losing interval 1 instead (`P_i` = 135.8,
 *  `P - P_i` = -11.8) shifts the other way by the same 11.8 s magnitude
 *  (`ours` reads 112.2) — also caught. Neither
 *  interval sat exactly on this run's own 124.0 s/500m average, which is
 *  the ordinary case and why this band catches real losses in practice;
 *  it is not a guarantee, only the population checks above are. */
const AVG_PACE_VERDICT_BAND_SECONDS = 1.0;

/** RC-9d (design spec 2026-08-25-free-oracles §3) — the rest-distance
 *  verdict's own band. Both sides are whole-metre, unscaled wire integers
 *  with no natural rounding source between them — 0x003A's own running
 *  Total Rest Distance against Σ 0x0037's own per-interval Interval Rest
 *  Distance — unlike (a)'s two independently-timed quotients. Both
 *  committed captures agree EXACTLY: 242 vs 242 (exit-7 walk, seq 63) and
 *  0 vs 0 (the r0 keystone piece, seq 517). 1 m is generous headroom for a
 *  one-count truncation difference at a boundary the two committed
 *  captures never happened to exercise, never evidence of a real
 *  disagreement that size. */
const REST_DISTANCE_VERDICT_BAND_METERS = 1;

/**
 * Final-review fix wave, HIGH-2: the verification hash's own tiny
 * sub-window. `maybeReconcileImmediately` re-arms the ONE deadline slot
 * to this duration (never a second, independent timer — `armSummaryReconcile`'s
 * own cancel-then-schedule discipline is reused, not duplicated) when the
 * split and summary are both in hand but 0x003F is not: draining
 * unconditionally when it elapses, hash or not, so firmware that never
 * sends 0x003F (or a native BLE stack that dropped the notification) is
 * never stranded on `BURST_LINGER_MS`'s full 2s for a byte that was never
 * coming.
 *
 * 200ms is ~5.2× the ONE measured gap between 0x0039 and 0x003F —
 * pm5-interface-notes.md §24 item 1: +269.6ms and +307.8ms from the
 * split, a 38.2ms difference — the same n=1 caveat `BURST_LINGER_MS`
 * carries verbatim: this is the only capture with both bytes. The margin
 * ratio deliberately matches `BURST_LINGER_MS`'s own ~5.0× precedent
 * rather than inventing a new one.
 */
const HASH_SUBWINDOW_MS = 200;

/** `DriverOptions.prepareSettleTicks`'s own default — see that field's doc
 *  comment for the full citation. `10`, not `3` (`DEFAULT_SETTLE_TICKS`
 *  above): session 3's two dispatch-to-armed spans were PM-clock durations
 *  of ~0.85s and ~0.06s (design spec §1b — `waitForPrepareSettle`'s own doc
 *  comment carries the full citation; §18's own table does not, contra an
 *  earlier draft of this comment). A literal TICK COUNT is not directly
 *  recoverable from that record — the event log carries no timestamps by
 *  design (`eventLog.ts`) and logs 0x0031 on state change only — so "4 and
 *  5 status ticks" (an earlier draft of this comment, and of design spec
 *  §1b) was a derived estimate stated as an observation, review-corrected.
 *  At the ~2Hz sample rate those two spans put the REAL ticks-to-armed at
 *  roughly 0-2, not 4-5. Either way, both spans exceed the state-blind
 *  `settleTicks` default (3) — this wait needs its own, larger budget, not
 *  a shared one — and `10` is comfortably ahead of the real spans, not
 *  tight against an inflated one. The new `"prepare-settled"` log entry
 *  (`waitForPrepareSettle`'s own tick-pulse handler) is the first thing in
 *  this file able to measure the real number on a future hardware run. */
const DEFAULT_PREPARE_SETTLE_TICKS = 10;

/** `DriverOptions.errorTypeTicks`'s own default — same rationale as
 *  `DEFAULT_SETTLE_TICKS`, a separate constant so the two budgets can
 *  diverge independently if a future finding ever needs them to. */
const DEFAULT_ERROR_TYPE_TICKS = 3;

/** `lastLoggedTwd`'s own sampling bucket (review I1). A whole-METRE change
 *  guard sounded coarse but is not: 0x0031's `totalWorkDistanceMeters` is an
 *  INTEGER, and at any rowing pace faster than ~4:10/500 it advances at
 *  least 1 m per status tick — the guard fired on nearly every 0x0031
 *  arrival, the exact ~2/second flood `"twd-sample"` exists to avoid
 *  (comment above `lastLoggedFrameState`, driver.ts, "the first laptop
 *  session… evicted the whole programming trace… from the 500-entry ring
 *  inside about four minutes" — this was the SAME defect, on a different
 *  field, that comment already documents fixing once). Quantising to 25 m
 *  buckets (`Math.floor(twd / TWD_SAMPLE_BUCKET_METERS)`) bounds the entry
 *  count independently of pace: a 6000 m (6 km) piece — a long but not
 *  extreme single row — produces at most `6000 / 25 = 240` `"twd-sample"`
 *  entries, leaving more than half the 500-entry ring (`eventLog.ts`'s
 *  `DEFAULT_CAPACITY`) for every other kind this file logs (`"frame"`,
 *  `"structure"`, `"divergence"`, boundary/summary entries, writes/acks).
 *  25 was chosen, not derived from a hardware measurement: coarse enough
 *  that even a sub-2:00/500 pace (order 500 m in 120s, ~4.2 m/s) crosses a
 *  bucket roughly once every 6 seconds rather than every tick, fine enough
 *  that the TWD trend is still legible in the log. */
const TWD_SAMPLE_BUCKET_METERS = 25;

export function createPm5Driver(
  t: Transport,
  log: MonitorEventLog,
  options: DriverOptions = {},
): MonitorDriver {
  // PM5-intrinsic capabilities — a PM5 always programs, always reports
  // stroke rate, always reports intervals; `deviceName` carries whatever
  // `options.deviceName` the caller threaded through from its own
  // `Transport.scan()` result (`DriverOptions.deviceName`'s own doc
  // comment — the picked device's real advertised name, e.g.
  // "PM5 432331249"). Falls back to `NAMELESS_MONITOR_CAPTION` (RC-18's
  // `"MONITOR"`, not the invented `"PM5"` this comment used to name) ONLY
  // when no name was given at all — never fabricated from anything else,
  // and never shown to a screen that had a real name available. This IS
  // the second-order default that reaches storage
  // (`capabilities.deviceName` -> `useMonitorSession.ts`'s
  // `createMonitorRun` call, after the picker's own fallback below it).
  /** The only clock reading this driver ever takes — see `DriverOptions.now`
   *  for why one exists at all, and for the three predicates that read it
   *  (`STRUCTURE_MISMATCH_WINDOW_MS`, the finish grace's own expiry, and
   *  the summary gate's in-window test). */
  const now = options.now ?? ((): number => Date.now());
  /** The only timer seam this driver has — see `DriverOptions.schedule`
   *  for why one exists at all, and `armSummaryReconcile` /
   *  `beginFreeRow` for its two uses. */
  const schedule =
    options.schedule ??
    ((cb: () => void, ms: number): (() => void) => {
      const id = setTimeout(cb, ms);
      return () => clearTimeout(id);
    });

  const capabilities: MonitorCapabilities = {
    canProgram: true,
    hasStrokeRate: true,
    reportsIntervals: true,
    deviceName: options.deviceName ?? NAMELESS_MONITOR_CAPTION,
  };

  /**
   * THE RUN (Phase 7A-fix-2 Task 4, spec §4) — this driver's single unit of
   * session lifetime, and the thing a terminal state closes. It replaces
   * the old `terminalLatched` boolean, which latched the whole DRIVER:
   * every subscription callback short-circuited forever once
   * finished/terminated arrived, so the driver went permanently deaf and
   * only a reconnect revived it. Hardware session 2 caught exactly that
   * (interface-notes.md §19.4, three times): zero frames after
   * `workoutComplete`, instant resumption on reconnect — a minute of
   * rowing at the erg with nothing on screen. The monitor never stops
   * responding; the silence was ours.
   *
   * What the latch got RIGHT survives here, scoped to the run instead of
   * the driver: a completed run's record must not be re-opened or added to
   * by the PM's own housekeeping. That hazard is real and documented —
   * after a TERMINATED workout the PM walks Terminate -> Rearm ->
   * WaitToBegin entirely unaided (CSAFE-DEF Appendix E, cited via
   * interface-notes.md §19.4/§19.5), so it reports "armed", then "rowing"
   * again, with nobody having asked for anything.
   *
   * Hence the ownership rule, which is the whole point of this shape:
   * **a run is opened by `program()` and ONLY by `program()`** (see this
   * driver's `program` method, after `verifyArmed()` resolves). There is
   * deliberately no state-driven opening — a rule like "an `armed` tick
   * starts a run" would let the auto-rearm cycle above FABRICATE runs out
   * of machine noise. A JustRow-follow mode would be its own designed
   * feature (spec's own out-of-scope list), not an inference from a state
   * word.
   *
   * `closed` is set by the first terminal state observed while the run is
   * open, and never unset — `activeRun` is only ever REPLACED (by the next
   * successful `program()`), never cleared, so `program` survives a close
   * and live frames keep normalizing against the workout the machine is
   * still holding. Everything else about the driver keeps running:
   * subscriptions stay live, frames keep emitting, `program()` works
   * again with no reconnect.
   */
  let activeRun: {
    program: WorkoutProgram;
    /**
     * Phase JR PR 2: this run was opened by `beginFreeRow()`, not by
     * `program()` — the rower is on the PM5's own Just Row and we sent it
     * nothing.
     *
     * **Why a marker rather than `program.intervals.length === 0`.**
     * `compileProgram` cannot emit a zero-interval program (its own no-work
     * guard), so a length test would be a predicate with no second producer
     * today and a silent trap the day one appears. This says what it means.
     *
     * **What it is FOR.** Opening a run at all is what buys back the
     * machine close, the 0x0039 summary and correct boundary routing, all
     * three of which are behind `runIsOpen()`. The cost is that
     * `armedProgram()` is `activeRun?.program ?? null`, so opening one makes
     * it NON-null — which switches on two subsystems that compare the
     * machine against a program we never sent. Both consult this flag: the
     * divergence escalation in `maybeEmitFrame`, and the structure watchdog
     * in the status handler. Nothing else reads it; a free row is otherwise
     * an ordinary open run, deliberately.
     */
    freeRow: boolean;
    closed: boolean;
    /** How many actuals this run has accumulated — kept only so the
     *  `run-replaced` entry can say what a silently-replaced run was
     *  holding (fix round: an open run replaced by a new `program()` is
     *  the one lifecycle transition with no event of its own). Counted at
     *  the single in-run `intervalComplete` emission; out-of-run
     *  boundaries belong to no run and are counted nowhere. */
    actuals: number;
    /** WHICH of this run's own program indices already have an actual, and
     *  WHAT each of them measured — `actuals` above is the count, this is
     *  the identity plus the two fields the summary gate subtracts.
     *
     *  Read by the finish grace (`finishGraceUntil`, below), which only ever
     *  attributes a post-close boundary to an interval this run is still
     *  MISSING: the PM's own post-run housekeeping re-reports an index that
     *  has already been filed, and that is the discriminator between "the
     *  final interval's data, one notification late" and "the machine
     *  talking again about a boundary we already have".
     *
     *  A `Map` rather than the `Set<number>` this was until fast-follow
     *  Task 2, and deliberately not a Set PLUS a parallel map: the summary
     *  gate's derivation needs "is every prior interval recorded?" and
     *  "what did those priors measure?" to be the same question asked of
     *  the same structure, or the two answers can drift. Originally only
     *  the two SUBTRACTABLE fields were kept — an average is not
     *  subtractable, which is the whole of B3's finding, so storing one
     *  here would only invite a future caller to try.
     *
     *  **WIDENED to four, RC-9d (design spec 2026-08-25-free-oracles §3):**
     *  `restSeconds`/`restDistanceMeters` ride along too, additive-optional
     *  exactly as `IntervalActual`'s own same-named fields are
     *  (`domain/monitor/types.ts`) — present on a boundary-derived actual
     *  (`emitIntervalComplete`'s own write below), absent on the
     *  summary-fallback synthesis (`deriveFinalIntervalFromSummary`'s
     *  caller omits both — 0x0039 carries no per-interval rest of its
     *  own). B3's argument does not apply to this pair: unlike an average,
     *  a rest DISTANCE is exactly as subtractable/summable as the work
     *  fields already kept here. `recordRestDistanceVerdict` is the one
     *  reader, and treats the pair the SAME all-or-nothing way
     *  `monitorRun.ts`'s own `computeWorkRestSums` treats the identical
     *  fields on the STORED record: summed only when every recorded actual
     *  carries both, never partially. */
    recordedActuals: Map<
      number,
      {
        elapsedSeconds: number;
        distanceMeters: number;
        restSeconds?: number;
        restDistanceMeters?: number;
      }
    >;
    /** The last `"rowing"`/`"resting"` state observed while this run was
     *  open, or `null` if it never reported one. The finish grace normalizes
     *  its boundary against THIS rather than the terminal state word the
     *  machine is showing by then — see `finishGraceIndex`'s own comment on
     *  why (`toActualIndex` declines to name an interval while the machine
     *  reads `finished`, a business rule about which interval is CURRENT,
     *  and the boundary belongs to the one that just ended).
     *
     *  Only the NULL-vs-not distinction is behavioural: `toActualIndex`
     *  applies the actuals characteristic's minus-one offset identically for
     *  `"rowing"` and `"resting"` (`intervalIndex.ts` — the offset is a
     *  property of 0x0037/38, not of the resting state, §19.8). The state
     *  WORD is kept anyway because the grace's own log entry reports it, and
     *  a trace that says which reading the index was normalized against is
     *  the only way a future walk can argue with this. Do not read the
     *  rowing/resting distinction here as load-bearing. */
    lastActiveState: MonitorFrame["state"] | null;
    /** THE FINISH GRACE (hardware walk 5, 2026-08-10; RE-BOUNDED on walk day
     *  3, 2026-08-11 — interface-notes.md §22 item 5). `now()` plus
     *  `FINISH_GRACE_MS` at the general-status tick that closed this run
     *  with a natural `"finished"`: the DEADLINE past which a boundary is no
     *  longer this run's. `null` when no grace is open — never opened, or
     *  already consumed by the boundary it was for.
     *
     *  WHY IT EXISTS: at the finish the PM5 delivers the final interval's
     *  0x0037 and 0x0038 **after** the general-status frame that says the
     *  workout ended, and every gate downstream keys on "the run is over" —
     *  so a 1-interval piece rowed to completion logged `0 OF 1 INTERVALS
     *  MEASURED`: the boundary took the out-of-run path, lost its index, and
     *  the record (closed by the terminal event a moment earlier) would have
     *  refused it anyway. The data is the run's; only its arrival order says
     *  otherwise.
     *
     *  WHY A CLOCK, not the machine's next sample (which is what this was
     *  until walk day 3, and what made the fix miss on device — twice):
     *  "the split belongs to the same sample instant as the terminal
     *  reading" was an INFERENCE from day 1's 1 ms capture, and day 3
     *  measured the real thing. The PM5 keeps ticking identical `finished`
     *  frames after the terminal one, and the split lands LATER than one of
     *  them — the day-3 stash has the terminal at seq 19 and the split pair
     *  at seq 21-24, with post-finish status ticks in between and the whole
     *  thing inside 3 s. A next-sample bound is therefore a bound on the
     *  PM's tick rate, not on the split, and it expires while the data is
     *  still in flight. `FINISH_GRACE_MS`'s own doc comment carries the
     *  sequence.
     *
     *  Post-finish status ticks are IRRELEVANT to it now — they neither
     *  extend nor consume it. `terminated` never opens one either:
     *  CSAFE-DEF footnote 12 (p.25, via interface-notes.md §19.8) says the
     *  Split/Interval Number "will change depending on where you are in the
     *  interval when the workout is terminated", so a mid-terminate boundary
     *  has no stable identity to attribute and keeps the out-of-run path it
     *  has always taken. */
    finishGraceUntil: number | null;
    /** THE SUMMARY-FALLBACK GATE's held evidence (fast-follow Task 2,
     *  design spec §5): the most recent 0x0039 decoded INSIDE this run's
     *  finish grace, or `null` if none has arrived. Stored, never acted on
     *  at receipt — review I4's precedence ruling is that a split is
     *  authoritative and immediate any time inside the window, and the
     *  summary may only fill at the deadline, so a value here means "if the
     *  split never comes, this is what we know", not "this is the answer".
     *
     *  The LATEST one wins while the window is open (a second 0x0039 inside
     *  3 s is the machine refining its own reading, not a different
     *  workout). A 0x0039 arriving outside the window is USUALLY never
     *  stored at all — it is logged `out-of-window` and dropped, which is
     *  what makes the ~1-minute HRM re-fire inert (ecosystem review:
     *  420-422). **CORRECTED (storage-spine design spec §2, early side):**
     *  the one exception is a 0x0039 arriving while this run is still
     *  OPEN and already in its FINAL interval — the burst can beat our
     *  own terminal transition (§1's PRIMARY research: 3 of 5 committed
     *  finishes). That case is buffered here too, through this SAME field
     *  (`noteSummary`'s own gate), so the natural close this driver
     *  eventually observes reconciles it exactly like an ordinary
     *  in-grace arrival — no separate storage. */
    summaryInGrace: WorkoutSummary | null;
    /** 0x003F's raw, undecoded bytes — the most recent one received while
     *  THIS run was the active run (storage-spine design spec §2, delta-
     *  pass B3). No decode logic lives here or in `pm5/parse.ts`: the
     *  characteristic's own byte order is disputed in the BLE spec itself
     *  (`uuids.ts`'s own doc comment), so this driver carries bytes only.
     *  `null` until (and unless) 0x003F ever arrives for this run. The
     *  hook's burst linger (`useMonitorSession.ts`'s `BURST_LINGER_MS`) is
     *  what keeps the transport subscribed long enough to hear it, on
     *  natural finishes and — since the summary-record design spec's §1 —
     *  rower-ended closes alike. Folded onto the
     *  `summary-observations` event (`reconcileSummary`, and
     *  `noteTerminateObservations`) as
     *  `verificationBytes`, omitted entirely when still `null` — the same
     *  additive-optional shape `IntervalActual.restDistanceMeters` uses. */
    verificationBytes: readonly number[] | null;
    /** Has a boundary already CLAIMED this run's finish grace? (fix round
     *  1, review Minor-2.) Set wherever `finishGraceUntil` is consumed —
     *  the split path's vouched emit and the summary gate's own fill —
     *  and never unset, because a grace is claimed once per run.
     *
     *  Purely diagnostic: nothing branches on it. It exists because
     *  `finishGraceUntil === null` has TWO causes that a stash reader must
     *  tell apart and the field alone cannot — a run that ended by
     *  `terminated` (which opens no grace at all, footnote 12) and a run
     *  whose grace a boundary consumed — and the discrimination is exactly
     *  what a walk needs when a 0x0039 turns up to a shut gate
     *  (`describeClosedGrace`). */
    graceClaimed: boolean;
    /** **GATE 2 of the terminate admission (summary-record design spec §1).**
     *  `true` from the instant this run was closed by a `terminated`
     *  terminal frame until its burst's 0x0039 is admitted (or the run is
     *  replaced). It is the ONLY thing that opens `noteSummary`'s
     *  observations-only door, and it is deliberately a SEPARATE field from
     *  `finishGraceUntil`/`summaryInGrace`:
     *
     *  - it never touches `graceIsOpen`, so the terminate's own partial
     *    0x0037 keeps taking `boundary-out-of-run` exactly as it always has
     *    (CSAFE-DEF footnote 12 via interface-notes.md §19.8 — post-terminate
     *    housekeeping has no stable Split/Interval Number and must never be
     *    filed as an interval actual);
     *  - the summary it admits is NEVER stored in `summaryInGrace`, which is
     *    the only field `reconcileSummary` reads. That is gate 3, and it is
     *    STRUCTURAL rather than a guard: there is no path by which a
     *    terminate's 0x0039 can reach `filled-from-summary` and synthesize a
     *    completed final interval onto an ABANDONED run.
     *
     *  Cleared the moment the door admits (once per run), so the ~1-minute
     *  HRM re-fire (`pm5-ble-ecosystem-review.md:420-422`) finds it shut and
     *  falls through to the ordinary `out-of-window` verdict.
     *
     *  MUTUALLY EXCLUSIVE with an armed `armSummaryReconcile` by
     *  construction, not by luck: the deadline is armed only in
     *  `maybeEmitFrame`'s `finished` branch and this flag only in its
     *  `terminated` sibling, both behind the same `runIsOpen()` guard that a
     *  run's FIRST terminal frame consumes — a run cannot take both. */
    terminatedAwaitingSummary: boolean;
    /** RC-9a (design spec 2026-08-25-free-oracles §1) — `true` once
     *  `reconcileSummary`'s `deriveFinalIntervalFromSummary` branch has
     *  actually filled this run's final interval (`filled-from-summary`).
     *  The ONLY reader is `recordAvgPaceVerdict`: that path builds OUR side
     *  of the comparison FROM 0x0039's own totals, so comparing it back
     *  against a machine reading would be tautological in exactly the case
     *  the verdict exists to catch (evidence base, "a fill path can make an
     *  oracle tautological"). Never set on the ordinary split-derived path,
     *  never unset once true — a run's final interval is filled once. */
    finalFilledFromSummary: boolean;
  } | null = null;
  /** The live reconcile deadline's canceller, or `null` when none is armed
   *  — one at a time, because a run finishes once (`armSummaryReconcile`).
   *  Cancelled when a new `program()` replaces the run it belongs to and
   *  when the caller hangs up: a deadline whose run is gone has nothing
   *  left to decide, and firing it anyway would be the timer talking about
   *  someone else's workout. */
  let pendingSummaryReconcile: (() => void) | null = null;
  /** The terminate path's own one-at-a-time pending emit (summary-record
   *  design spec §1), or `null` when none is armed — its timer's
   *  `cancel`ler paired with the `emit` that timer would have run, so
   *  either trigger (the window elapsing, or 0x003F arriving early) can
   *  reach the same body.
   *
   *  A SEPARATE slot from `pendingSummaryReconcile` above, deliberately:
   *  that one's drain calls `reconcileSummary`, and gate 3 is that a
   *  terminate's summary can never reach that function at all. What this
   *  one holds is the observations-only emit, waiting out
   *  `HASH_SUBWINDOW_MS` for 0x003F — the identical "the hash is part of
   *  complete too" problem the natural path solves with its own sub-window
   *  (`maybeReconcileImmediately`'s own doc comment): the burst's 0x0039
   *  arrives BEFORE its 0x003F every time, and `appendSummaryObservations`
   *  is write-once, so emitting at 0x0039 would lose the verification hash
   *  permanently. */
  let pendingTerminateObservations: {
    cancel: () => void;
    emit: () => void;
  } | null = null;
  let reconnectPending = false;
  /** This task's single-flight gate (`ProgramBusyError`'s own doc comment,
   *  ROADMAP's "a second `program()` call ... strands the first"): `true`
   *  for exactly the span of one `program()` call, from before its first
   *  await to whichever of resolve/reject settles it — checked FIRST, at
   *  the very top of `program()`, before `sendPrepare` or any wire
   *  traffic. Cleared on EVERY exit path via `program()`'s own
   *  `try`/`finally` (a JS `finally` runs whether the `try` block returned
   *  normally or threw, so a rejection — a genuine NAK, a disconnect, a
   *  `"structure-mismatch"`, anything `sendPrepare`/`sendSequence`/
   *  `verifyArmed` can throw — clears this exactly like a clean resolve
   *  does; there is deliberately no separate "only on success" branch to
   *  get wrong).
   *
   *  SECOND HOLDER (spec 2026-09-02 ruling 4), and why this is a LABEL
   *  rather than a boolean: `beginFreeRow()`'s detached p.80 send holds it
   *  for the send's duration, bounded by `FREE_ROW_PROGRAM_DEADLINE_MS`,
   *  and clears it in its own `finally`. It gates `program()`'s re-entry
   *  and the RC-37 watch (truthiness) exactly as `program()`'s own hold
   *  does. `terminate()` refuses for NEITHER holder: it interleaves with
   *  `program()` on purpose (the hook's teardown does it — "best-effort by
   *  design — including the case where a `program()` is still in flight" —
   *  so the erg is not left holding a workout the rower backed out of),
   *  and it WAITS OUT the free-row send (`freeRowSendSettled`, just below).
   *  Lifetime of the free-row hold: minted after the run is open and the
   *  sequence built, cleared on ack, NAK, deadline, or disconnect (the
   *  disconnect hatch resolves `pendingAck` as `"disconnected"`, which
   *  rejects the send). */
  let programInFlight: false | "program()" | "beginFreeRow()" = false;
  /** The SETTLED promise of `beginFreeRow()`'s detached p.80 send — the
   *  whole chain, so it resolves (never rejects: both handlers are
   *  attached, and neither throws) on ack, NAK, deadline or disconnect,
   *  whichever comes first. `terminate()` awaits it instead of refusing
   *  (spec rev 5). The refusal it replaces was never observed FAILING —
   *  the walk's finding 4 was the hook's free-row exclusion, and its ring
   *  3 Cancel ran 1589 ms after the send had settled — but it is reachable
   *  on its own (an END or a Cancel inside the ~2 s ack window), and both
   *  callers swallow the rejection, so it could only ever mean "the erg is
   *  not told". The WAIT is what the ack matcher needs — it is arrival-order
   *  only, never reading the ack's command byte, so a terminate
   *  interleaved with the live send would share the one `pendingAck` slot
   *  and strand whichever registered first, with no `ackTimeout` in
   *  production to expire the orphan. It is bounded because the send is:
   *  `FREE_ROW_PROGRAM_DEADLINE_MS` is the ceiling on this await.
   *
   *  LIFETIME. Mint: inside `beginFreeRow()`, the same statement that sets
   *  `programInFlight` — one site. It cannot be overwritten while live,
   *  and the guard that holds that is the HOOK's, not this file's: the
   *  driver's own `runIsOpen()` refusal at the top of `beginFreeRow()` is
   *  NOT sufficient, because the machine's terminal frame can set
   *  `activeRun.closed` during the ~2 s send (the rower presses Menu),
   *  after which `runIsOpen()` is false and a second call would be
   *  accepted. What actually holds is `useMonitorSession`'s
   *  `beginFreeRow`, which returns early at `programming`/`ready`/`live`/
   *  `ended` — and the phase is `ready` for the whole send, flipped
   *  synchronously by the same call. Clear: the chain's own `finally`,
   *  beside `programInFlight = false`. Survives nothing — it belongs to one send on one driver
   *  instance, and a driver does not outlive its connection. `null`
   *  whenever no free-row send is in flight, which is every workout
   *  session and every free row after its send settles. */
  let freeRowSendSettled: Promise<void> | null = null;
  /** HOW MANY `terminate()` calls have entered but not yet put their frame
   *  on the wire (or given up trying). `disconnect()` refuses to hang up
   *  while this is non-zero — see `awaitTerminateWrites` just below.
   *
   *  WHY IT EXISTS (the delta pass on PR #278, 2026-09-03). `terminate()`
   *  can now SUSPEND before it writes anything: it waits out
   *  `freeRowSendSettled`, up to `FREE_ROW_PROGRAM_DEADLINE_MS`. That wait
   *  races the hook's own teardown, which hangs up. MEASURED on the walk's
   *  ring 1 (`docs/monitor/sessions/walk-2026-09-03-jr-connect/`, all
   *  offsets from its own p.80 write): END flips to `ended` and opens the
   *  burst hold at +66903 (`handoff-hold`), which releases 2002 ms later
   *  at +68905 (`handoff-released`); release, navigation and the `JustRow`
   *  unmount then take 2025 ms more, reaching `disconnect-requested` at
   *  +70930. That is 4027 ms from END to hang-up. The Ready screen is up
   *  at that ring's first `frame`, +1159 ms, so the EARLIEST END puts the
   *  hang-up at about write+5186 ms — against a terminate the deadline
   *  releases at write+5000 ms. About 186 ms, on the wrong side of a wait
   *  nobody tuned for it. If the hang-up wins, the
   *  resumed terminate writes to a dead transport, rejects, and the hook's
   *  best-effort catch swallows it: the erg stays in the Just Row session,
   *  which is the exact defect this PR exists to fix, one path over.
   *
   *  Apple's own contract is why a hang-up can abort a write rather than
   *  merely reorder it: `cancelPeripheralConnection(_:)` is nonblocking and
   *  "any pending commands ... may not complete" (`CBCentralManager`
   *  reference) — the same citation `useMonitorSession.ts`'s `fail()` gives
   *  for chaining ITS disconnect behind a terminate. This is that rule
   *  generalized to the driver, where it holds for every caller of
   *  `disconnect()` rather than the two hook paths that remembered.
   *
   *  LIFETIME. Mint: `terminate()`'s entry, one site, one increment per
   *  call. Clear: that call's own release, run exactly once (the closure
   *  latches), from `sendSequence`'s `onFrameWritten` when the frame is on
   *  the wire, or from `terminate()`'s `finally` if the call failed or was
   *  abandoned before it could write. A counter rather than a boolean so
   *  two overlapping terminates cannot mask each other, and so this file
   *  owes no claim about callers never overlapping. Survives nothing: it
   *  belongs to the driver instance, and a driver does not outlive its
   *  connection. */
  let terminateWritesOwed = 0;
  /** Resolves when `terminateWritesOwed` reaches zero — `null` whenever it
   *  is already zero, so `disconnect()` awaits nothing in the ordinary
   *  case. One deferred shared by however many terminates are owed. */
  let terminateWritesDrained: Promise<void> | null = null;
  let releaseTerminateWrites: (() => void) | null = null;

  /** Called by `terminate()` on entry; the returned function is that
   *  call's own release, idempotent. */
  function noteTerminateWriteOwed(): () => void {
    terminateWritesOwed += 1;
    terminateWritesDrained ??= new Promise<void>((resolve) => {
      releaseTerminateWrites = resolve;
    });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      terminateWritesOwed -= 1;
      if (terminateWritesOwed > 0) return;
      const resolve = releaseTerminateWrites;
      releaseTerminateWrites = null;
      terminateWritesDrained = null;
      resolve?.();
    };
  }
  let raw: Partial<RawPm5Status> = {};
  // The last RAW machine interval index this driver has actually SEEN on
  // 0x0033 (Interval Count) — deliberately the UNNORMALIZED value (not
  // `MonitorFrame.intervalIndex`, which is our own program index after the
  // D3 fix below), because this variable's one job is the fix-round MED-2
  // comparison against `IntervalActual`'s own raw Split/Interval Number
  // (0x0037/0x0038) at every boundary, logging `"divergence"` if the two
  // disagree. The two fields are independently-incrementing per
  // interface-notes.md §15 #1/#8 — this driver correlates them but does not
  // assume they can't skew — and that comparison is only meaningful in the
  // machine's OWN numbering, not ours (interface-notes.md §18 #3: D3's own
  // defect was two RAW fields agreeing with EACH OTHER while both disagreed
  // with the program — a comparison in OUR numbering would have hidden that
  // exact shape instead of catching it).
  let lastRawFrameIntervalIndex: number | null = null;
  let lastLoggedFrameState: MonitorFrame["state"] | null = null;
  /** The last raw 0x0031 payload, byte-for-byte — see the 0x0031 handler's
   *  own comment; read by the terminal-raw entry and, since Task 8, by
   *  `suspicious-terminal` too (the same bytes, deliberately — see that
   *  entry's own comment). */
  let lastRaw0x0031: Uint8Array | null = null;
  /** RC-9a (design spec 2026-08-25-free-oracles §1) — the last WORK-state
   *  (`workoutState` 4/5, `WORKOUTSTATE_INTERVALWORKTIME`/`_DISTANCE`)
   *  0x0032 `averageSplit` observed this run's life, already descaled to
   *  SECONDS by `parseAdditionalStatus1` (0.01 s/lsb — 0x0039's own Avg
   *  Pace is a DIFFERENT characteristic at 0.1 s/lsb, never read here; see
   *  `recordAvgPaceVerdict`'s own comment for the scale trap). Tracked live
   *  by the 0x0032 merge callback below, sampled by `recordAvgPaceVerdict`
   *  — NEVER read at the terminal frame itself: the evidence base's own
   *  "unexplained terminal step" (up to 1.02 s, session-2 129.78→128.76,
   *  keystone 138.44→138.23) is exactly what sampling live avoids. A
   *  genuine `0.00` reading (the interval-reset artifact the evidence base
   *  documents — this driver's own decode of `session-2-wu-4unequal.jsonl`
   *  found it recurs at MULTIPLE boundaries, not the single frame the
   *  spec's prose names, which is noted in this task's own report) is
   *  excluded on purpose so it can never overwrite a real reading with a
   *  false zero. `null` before any qualifying sample. Reset to `null` on
   *  every fresh `program()` (see that method's own per-run diagnostic
   *  reset block) — a stale reading from a PRIOR run must never leak into
   *  a NEW run's comparison. */
  let lastWorkStateAverageSplit: number | null = null;
  /** THE SESSION REGISTER MAP (CR2 spec 1, replacing walk 4's fold).
   *
   *  0x0031's Elapsed Time and Distance are PER-INTERVAL. The fold this
   *  replaces detected a new interval by watching the clock DROP, which is
   *  edge-triggered, and a missed or misread edge is permanent: a Terminate
   *  re-bases elapsed to a smaller non-zero value while distance stands
   *  still (CSAFE-DEF footnote 12), and the fold banked a distance the
   *  machine never cleared — an exact 2.00x, six times in the record.
   *
   *  This holds each interval's reading under the key the frame already
   *  carries, merged by MAXIMUM. No edge is detected, so none can be missed.
   *
   *  Maximum, not last-write-wins, for two independently-found reasons:
   *  `toProgramIndex` clamps at both ends so the key is not injective; and
   *  at a work->work boundary with NO intervening rest, 0x0031's counters
   *  reset one notification BEFORE 0x0033's Interval Count increments, so a
   *  (0,0) frame still carrying the completed interval's key would clobber
   *  it (pm5-session4b L2835-2838, 74.4m). The counters are monotone within
   *  an interval, so maximum equals last in every honest case.
   *
   *  HONEST LIMITS — one still open, two closed (CR2 spec 1 Task 5, a
   *  controller ruling after Task 4's own review; and Task 11, the walk's
   *  own falsification), all three bounded and the first two reported
   *  WHENEVER THE MACHINE DELIVERS AN END-OF-WORKOUT SUMMARY (0x0039) —
   *  never on every run (review I2 scoped this: `logSummaryTotals` has
   *  exactly one call site, `noteSummary`, which only runs off the 0x0039
   *  handler. A run that ends without one — link death, terminate — gets
   *  no check at all, silently):
   *  - STILL OPEN: an interval that produces ZERO frames is lost, because
   *    nothing ever writes its key. Bounded (it cannot compound) and errs
   *    SAFE — an undercount makes TOTAL LEFT read high, where the old
   *    defect made it read zero mid-session. Reported at the finish IF a
   *    0x0039 arrives: see the interval-count divergence in
   *    `logSummaryTotals`.
   *  - CLOSED (Task 5): the final counter bump that arrives ON the
   *    WORKOUTEND tick itself used to be lost too — a `"finished"` frame's
   *    `intervalIndex` is always `null` (`toProgramIndex` never names an
   *    interval outside rowing/resting) and the old write rule only covered
   *    rowing/resting, so the run's very last reading wrote no key at all
   *    (observed 3.63 s/8.7 m on walk-4 hardware; WALK_4's own fixture:
   *    finished 33.07/109.7 against a last resting reading of 29.44/101 —
   *    the old walk-4 FOLD passed this reading through, so this was a small
   *    regression this map introduced, not a limit it inherited). Now
   *    CAPTURED: `maybeEmitFrame`'s `activeKey` fallback treats `"finished"`
   *    the same as `"rowing"`/`"resting"`, max-merged into the highest
   *    existing key — safe for the same reason every other write here is,
   *    since a finished frame with a dishonest SMALLER reading cannot lower
   *    anything. `"terminated"`/`"idle"`/`"armed"` stay excluded; a
   *    mid-terminate boundary has no stable identity to capture in the
   *    first place (CSAFE-DEF footnote 12).
   *  - CLOSED (Task 11, `docs/monitor/sessions/walk-2026-08-15/` session B):
   *    a stale tick from an un-reset 0x0031 pair could OPEN a key that did
   *    not exist yet (rather than merely growing one that did), banking a
   *    completed interval's own pair as the next interval's opening
   *    register — permanent once written, since max-merge cannot lower it
   *    again. The open-on-reset guard (`maybeEmitFrame`'s own comment,
   *    right before the write below) closes this: a NEW key may open only
   *    when this tick's elapsed is a genuine reset relative to the highest
   *    existing key's own register. Its own disclosed, still-bounded edge —
   *    a genuinely new interval's first observed tick landing exactly on
   *    (or past) the previous key's own gap-truncated register, which
   *    misattributes into the old key instead of opening the new one — is
   *    logged as a "divergence" on refusal, never silent (see the guard's
   *    own comment for the full argument and the walk citation).
   */
  let session = {
    seen: new Map<number, { elapsedSeconds: number; distanceMeters: number }>(),
  };
  /** FIRST-SIGHTING GATE for the open-on-reset guard's "refused open"
   *  divergence (CR2 spec 1 Task 11 fix round, review IMPORTANT-3) — same
   *  idiom as `seenCharacteristics` above (a `Set` recording the first
   *  arrival of something, silent after). The disclosed-edge scenario the
   *  guard's own comment names refuses on EVERY tick of the affected
   *  interval, not just the poison tick: once a key is wrongly refused, the
   *  open key it folds into keeps growing to match each new (still
   *  climbing) reading, so the NEXT tick refuses too — self-sustaining for
   *  as long as the interval runs, at the ~2/s status-tick rate, which at a
   *  240s interval is up to ~480 entries into the SAME 500-entry ring the
   *  `"frame"`/`"twd-sample"`/`"structure"` on-change gates above already
   *  exist to protect (their own comments cite the identical flood
   *  mechanism). Logged once per DISTINCT refused key, not once ever: a
   *  second key refused later in the same run is a second, genuinely new
   *  fact and still gets its own entry. Reset alongside `session` on every
   *  successful `program()` (below) — a re-armed run's own first refusal
   *  is a new fact too, not a repeat of the outgoing run's. */
  let refusedKeysLogged = new Set<number>();
  /** The stale-count rest clamp's own throttle (rest-keying spec,
   *  2026-08-16), the same idiom as `refusedKeysLogged` right above it: one
   *  `"divergence"` entry per distinct clamped key, not once per tick — a
   *  clamped resting frame recurs at the ~2/s status-tick rate for as long
   *  as the poisoned key stays newest, which would otherwise flood the same
   *  ring buffer `refusedKeysLogged`'s own comment describes. Reset
   *  alongside `session` and `refusedKeysLogged` on every successful
   *  `program()` (below) — a re-armed run's own first clamp is a new fact
   *  too, not a repeat of the outgoing run's. */
  let clampedKeysLogged = new Set<number>();
  /** SPLIT AVG PACE'S OWN PROVENANCE (interval-referent-monotone spec,
   *  2026-08-18 Task 2; LEVEL-triggered as of fix round 1, finding B —
   *  replaces an earlier edge-triggered "did the referent just advance"
   *  check that only protected the first frame after a boundary, leaving a
   *  DROPPED 0x0033 notify free to extend the same lie into a second
   *  frame). Updated ONLY from the 0x0033 (Additional Status 2) `after`
   *  callback (below) — never from `maybeEmitFrame`, which runs on 0x0031's
   *  own, independent cadence — to exactly the program index that AS2
   *  sample's OWN `intervalCount` byte names, translated through
   *  `toProgramIndex` using the STATE ACTIVE AT THAT SAME MOMENT (`raw.
   *  workoutState`, whatever the most recently merged 0x0031 sample set it
   *  to — `raw` is updated before `after` runs, `mergeStatus`'s own doc
   *  comment). That "state at arrival" qualifier is load-bearing, not
   *  decorative: 0x0033's Interval Count is the SAME raw byte value on
   *  both sides of a work→rest or rest→work boundary (the wire's own
   *  forward-attribution convention, `intervalIndex.ts`'s own doc comment),
   *  so the byte alone cannot distinguish "this sample is interval N's own
   *  reading" from "this sample is stale, still interval N-1's" — only
   *  pairing it with the state that was live when THIS SPECIFIC sample
   *  arrived can. Comparing this against `emittedIntervalIndex` at
   *  frame-build time (below) is what replaces the edge check: whenever
   *  they disagree, `splitAvgPace` was captured before the referent it is
   *  about to be attached to; that comparison is re-run FRESH on every
   *  frame from state alone, needing no memory of the previous frame (the
   *  file's own level-triggered idiom, `driver.ts:1965`'s comment on the
   *  open-on-reset guard). A DELIBERATE non-goal: using the CURRENT tick's
   *  own `toProgramIndex(status.intervalCount, base.state, ...)` output
   *  instead (i.e. comparing `intervalIndex` itself, which already exists)
   *  was tried and rejected — at a rest's own FIRST tick, that computation
   *  reads one interval behind the very same clamp this task's own rest fix
   *  raises the referent to (by construction: that lag is what the clamp
   *  exists to correct), so it would wrongly null a splitAvgPace value that
   *  is, in fact, already correct (`session-2-wu-4unequal.jsonl` GS seq
   *  1489: splitAvgPace=129.89, genuinely interval 2's own settled average,
   *  captured by the AS2 sample most recently merged BEFORE this GS tick,
   *  while state was still `"rowing"`). Reset alongside `session` and
   *  `clampedKeysLogged` on every successful `program()` (below) — a
   *  re-armed run's own first interval is a new fact too, not a
   *  continuation of the outgoing run's numbering. */
  let splitAvgPaceProvenanceIndex: number | null = null;
  /** R0 (CR2 spec 1, Task 1). The last totals actually PUT ON A FRAME.
   *  `logSummaryTotals` fires on 0x0039, which carries no per-interval pair
   *  of its own, so the value the rower last saw has to be remembered
   *  rather than recomputed — `logSummaryTotals` has no `base` frame in
   *  hand to sum `session.seen`'s registers itself.
   *  Set in `maybeEmitFrame` right after `frame` is built; read only in
   *  `logSummaryTotals`. Diagnostics only, same as `session` above: nothing
   *  here decides anything. */
  let lastEmittedTotals = { elapsedSeconds: 0, distanceMeters: 0 };
  /**
   * Task 1 (fix-3, interface-notes.md §17 item 12): the machine's own idea
   * of the ARMED workout's shape — `workoutType`/`workoutDurationRaw`/
   * `workoutDurationType`, decoded by `parseGeneralStatus` from 0x0031
   * (interface-notes.md §10) but until now dropped on the floor before
   * anything logged them (`toMonitorFrame` never carries them into
   * `MonitorFrame`, and the raw-hex `notify` branch above deliberately
   * excludes 0x0031 — it notifies ~2/second, a flood the 500-entry ring
   * cannot survive). Tracks the last COMBINATION of the three fields this
   * driver has logged, so a `"structure"` entry (below) fires only on an
   * actual change in one of them — the same on-change discipline `"frame"`
   * uses for `state`, and for the identical flood reason.
   */
  let lastLoggedStructure: {
    workoutType: number;
    workoutDurationRaw: number;
    workoutDurationType: number;
  } | null = null;
  /** R0 (CR2 spec 1). 0x0031 carries an absolute Total Work Distance that
   *  `parseGeneralStatus` has always decoded and this driver has always
   *  thrown away, so the one field that could retire the accumulator has
   *  never been observed mid-piece — an absence that was OURS, not the
   *  machine's (see the spec's own correction). Sampled on a 25 m BUCKET
   *  CHANGE (`TWD_SAMPLE_BUCKET_METERS`'s own comment has the budget
   *  arithmetic and review I1's finding), not on-change like
   *  `lastLoggedStructure`: TWD is an integer that itself changes on nearly
   *  every 0x0031 arrival at ordinary rowing pace, so a whole-metre guard
   *  degenerates to logging almost every tick — the exact flood this field
   *  exists to avoid, caught once already for `"frame"`/state (comment
   *  above `lastLoggedFrameState`) and repeated here until I1. */
  let lastLoggedTwd: number | null = null;
  /** THE SUSPICION VERDICT's own half of "in hand at the terminal tick"
   *  (Task 8, log-only, fail-open). Set unconditionally at the very top of
   *  `noteSummary`, before that gate's decode/`run`/`graceIsOpen` checks —
   *  never read `run.summaryInGrace` for this, which is `null` on exactly
   *  the shape this flag exists to catch (walk 2026-08-15, re-walk row 1 /
   *  session-c: the 0x0039 arrived BEFORE the terminal frame, so no grace
   *  was open yet, `noteSummary`'s `!graceIsOpen` branch logged
   *  `out-of-window` and stored nothing — a `summaryInGrace`-based flag
   *  would read `null` there and convict a run that is not suspicious at
   *  all). "0x0039 seen" is a fact about the NOTIFICATION arriving, not
   *  about whether the gate accepted it. */
  let summarySeen = false;
  const seen = { general: false, as1: false, as2: false };
  /**
   * D4 (Task 1's hardware verdict, interface-notes.md §18 #3): the
   * Split/Interval Number each half of the pending boundary reported, or
   * `null` for a half that has not arrived since the last emission. An
   * interval boundary is reported on two separate characteristics — 0x0037
   * (identity: Split/Interval Number, time, distance) and 0x0038 (the
   * averages, and its OWN copy of the Split/Interval Number) — and the
   * observed PM5 sends them in that order, one notification apart.
   *
   * The version of this driver that met the erg emitted from 0x0037's
   * arrival, gated on a flag only 0x0038 ever set. Both halves of that were
   * wrong, and a two-interval session showed both:
   * - the FIRST boundary's 0x0037 arrived before 0x0038 had ever been seen,
   *   so it was decoded, merged into `raw`, and then never emitted — one
   *   `intervalComplete` for a workout that crossed two boundaries
   *   ("arrives-discarded", the diagnosis Task 1 confirmed over
   *   "never-arrives");
   * - the emission that DID fire read `raw`'s 0x0038 fields from the
   *   PREVIOUS boundary, because this boundary's 0x0038 was still one
   *   notification away — interval 2's identity carried interval 1's
   *   averages.
   *
   * Both are fixed by the same rule: emit when the two halves of the SAME
   * boundary have merged into `raw`, whichever order they arrive in, then
   * reset for the next one. Order-agnostic on purpose — the observed order
   * is firmware behaviour, not a documented guarantee, and a driver that
   * silently depended on it would be one firmware revision from repeating
   * exactly this defect.
   *
   * Matching on the NUMBER, not merely on "one of each has arrived", is the
   * fix round's own correction (Task 4 review, IMPORTANT-1): a pair-by-
   * arrival gate still mixed boundaries in a narrower way. If a boundary's
   * 0x0037 is lost, the orphaned 0x0038 sitting in the slot pairs with the
   * NEXT boundary's 0x0037 and emits that boundary's identity carrying the
   * orphan's averages — D4's second cause, surviving. Comparing the two
   * halves' own Split/Interval Numbers (both characteristics carry one,
   * `pm5/parse.ts`) makes a cross-boundary pairing impossible to construct.
   */
  const boundaryHalves: { split: number | null; asSplit: number | null } = {
    split: null,
    asSplit: null,
  };
  const listeners = new Set<(e: MonitorEvent) => void>();
  let pendingAck: ((outcome: PendingAckOutcome) => void) | null = null;
  // Fix-round MED-1: responses that arrive with NOTHING awaiting them yet
  // are queued here rather than discarded. This is not merely defensive —
  // it is REQUIRED for correctness: a coalesced BLE notification can carry
  // two complete response frames in one callback turn (the drain loop
  // below empties `controlReassembler` synchronously); the FIRST frame
  // resolves whatever `pendingAck` is currently set, but resolving a
  // promise never synchronously resumes its awaiter — `sendSequence` only
  // gets a chance to register the NEXT `pendingAck` on a later microtask.
  // The second frame is therefore drained while `pendingAck` is still
  // null, even though it is a perfectly real ack for the very next await.
  // Buffering it here (and `awaitAck` checking the buffer FIRST, before
  // ever creating a new promise) means that ack is still there when
  // `sendSequence` asks for it, instead of program() hanging forever.
  //
  // Fix-round 2 (post-MED-1 regression): this buffer is per-DRIVER, not
  // per-sequence — `program()` and `terminate()` share it. A stray or
  // duplicate ack that arrives with nothing pending AFTER one sequence
  // has already fully resolved used to sit here indefinitely; the NEXT
  // sequence's `awaitAck()` would then silently consume it as if it were
  // that sequence's own first-frame ack, and the REAL ack (arriving
  // later) would land buffered as poison for whatever comes after THAT.
  // `sendSequence` now clears (and logs) anything already sitting here
  // the moment it starts — see its own comment.
  //
  // Only ever holds real `AckArrival` values: `"disconnected"`/
  // `"ack-timeout"` are resolved directly against `pendingAck` (the
  // `onDisconnect` handler, the ack-timeout tick counter below), never
  // pushed here — `handleAckFrame` is this buffer's one producer, and it
  // only ever has an arrived frame to offer.
  const pendingAckBuffer: AckArrival[] = [];
  // Ticks (GENERAL_STATUS_UUID arrivals) counted against the CURRENT
  // pending ack, reset every time a new one is awaited — see `awaitAck`
  // and `DriverOptions.ackTimeout`'s own doc comment.
  let pendingAckTicks = 0;
  // Registered while `program()`'s verification phase (`verifyArmed`,
  // below) is waiting for the machine to report "armed" — `null` whenever
  // no `program()` call is currently in that phase. A single slot, not a
  // queue: mirrors `pendingAck`'s own one-at-a-time design, since
  // `program()` calls are never expected to overlap.
  let pendingVerify: {
    resolve: () => void;
    reject: (err: unknown) => void;
    ticks: number;
    /** What 0x0031 must report for THIS `program()` call's own program to
     *  count as armed (fix-3 Task 4) — captured per call from
     *  `expectedArmedStructure(p)` (`pm5/commands.ts`, which owns the
     *  ordinals and the scales), never re-read at tick time. */
    expected: ArmedStructure;
    /** The mismatched structure the last armed tick reported, or `null`
     *  when the previous tick was not a mismatched armed tick at all —
     *  the STABILITY half of `STRUCTURE_MISMATCH_TICKS`'s rule. */
    lastMismatch: ArmedStructure | null;
    /** How many CONSECUTIVE armed ticks have now reported `lastMismatch`.
     *  Reset to 0 by any tick that is not a mismatched armed tick, and to
     *  1 by a mismatched armed tick whose payload differs from the last
     *  one. */
    mismatchStreak: number;
    /** `now()` at the tick that STARTED the current streak (the reading
     *  `mismatchStreak` counted as `1`), or `null` while no streak is
     *  running — the wall-clock half of the verdict
     *  (`STRUCTURE_MISMATCH_WINDOW_MS`, walk 5's two-step structure update).
     *  Reset in lockstep with `mismatchStreak`, so the window is always
     *  measured over the SAME payload the streak is counting: a changed
     *  payload restarts both, because a machine whose wrong answer keeps
     *  changing is settling, not holding. */
    mismatchSince: number | null;
    /** Whether the ONE `"structure-mismatch"` log entry for this verify
     *  phase has already been written — the entry fires at FIRST sighting,
     *  never per tick (0x0031 notifies ~2/second; a per-tick entry is the
     *  exact flood that evicted the programming trace from the 500-entry
     *  ring in §18 session 1). */
    mismatchLogged: boolean;
    /** Whether ANY armed tick in this verify phase disagreed about the
     *  structure — what the OUTER `verifyTicks` bound reads to choose
     *  between `"structure-mismatch"` and `"not-observed"`.
     *
     *  Deliberately a SECOND flag rather than reusing `mismatchLogged`
     *  (review L-4), even though the two are set on the same line today.
     *  They answer different questions — "has the trace been written?" vs
     *  "what did we actually see?" — and a future change to the log-once
     *  policy (a re-log on a changed payload, say, or suppression under a
     *  quiet mode) would silently re-point the typed rejection reason if
     *  the two shared one boolean. The typed reason is the part callers
     *  branch on; it must not depend on a logging decision. */
    sawArmedMismatch: boolean;
  } | null = null;
  /** RC-37 (design spec 2026-08-27-link-authority-design.md §1, [R5]): the
   *  general-status structure comparison, extended past `verifyArmed`'s own
   *  fixed-tick verify window — for as long as the machine keeps reporting
   *  `"armed"`, not only during the one program() call that just verified.
   *  **A NEW comparator, not a lifetime extension of `pendingVerify`'s
   *  own** — that state is scoped to a single verify phase and nulled the
   *  instant it resolves (its own doc comment), so this watch needs its
   *  own persistent streak/window state, compared against
   *  `expectedArmedStructure(armedProgram())` computed fresh each tick (a
   *  pure function of the program `armedProgram()` already retains — no
   *  separate cached copy to keep in sync). Reset to this same shape
   *  whenever a NEW program() succeeds (`program()`'s own per-run reset
   *  block, alongside `session`/`refusedKeysLogged` et al.) — a fresh arm's
   *  leftover streak from the OUTGOING program would otherwise misread the
   *  incoming one's own settling reads as a continuation of somebody
   *  else's mismatch. */
  let armedWatch: {
    lastMismatch: ArmedStructure | null;
    mismatchStreak: number;
    mismatchSince: number | null;
  } = { lastMismatch: null, mismatchStreak: 0, mismatchSince: null };
  /** Guards `armedWatch` from firing a second `"programDropped"` off stale
   *  notifications that arrive between the detector's own emit and the
   *  consumer actually tearing the transport down (best-effort, not
   *  synchronous) — reset alongside `armedWatch` at the next successful
   *  program(), same "per-run state" lifecycle as every other flag in that
   *  block. */
  let armedWatchFired = false;
  /** How many `"structure-mismatch-recovered"` entries THIS run has already
   *  logged (`STRUCTURE_RECOVERED_LOG_CAP`'s own doc comment) — reset
   *  alongside `armedWatch`/`armedWatchFired` at the next successful
   *  program(), same per-run lifecycle as every field in that block. */
  let armedWatchRecoveredLogged = 0;
  /** Registered while `terminate()`'s post-ack settle wait (design spec
   *  §7, interface-notes.md §19.6) is counting — `null` whenever no
   *  `terminate()` call is currently in that phase. A single slot, same
   *  one-at-a-time design as `pendingAck`/`pendingVerify`. `ticksNeeded`
   *  is captured per-call (not read from `options` again at tick time) so
   *  a settle-in-progress isn't affected by anything else. */
  let pendingSettle: {
    resolve: () => void;
    ticks: number;
    ticksNeeded: number;
  } | null = null;
  /** Registered while `program()`'s PREPARE-SETTLE wait
   *  (`waitForPrepareSettle`, design spec §1b, fix-3 plan Task 2) is
   *  counting — `null` whenever no `program()` call is currently in that
   *  phase. A NEW, single-purpose slot — deliberately NOT `pendingSettle`
   *  above, whose disconnect handling RESOLVES (routine for `terminate()`,
   *  which already got its own ack and has nothing left to protect). THIS
   *  wait sits before the real programming send ever goes out, so a
   *  disconnect here means genuinely fatal work is still pending — the
   *  `onDisconnect` handler below REJECTS it instead, with the identical
   *  `ProgramRejectionError({reason: "disconnected"})` shape `sendSequence`
   *  itself would produce for a disconnect during the real send, so the
   *  wait's own failure is indistinguishable from "the send's disconnected
   *  failure" to any caller. `armedSeen` tracks the end condition's own two
   *  halves (`armed`, then one further tick of any kind) — see
   *  `waitForPrepareSettle`'s doc comment. */
  let pendingPrepareSettle: {
    resolve: () => void;
    reject: (err: unknown) => void;
    ticks: number;
    ticksNeeded: number;
    armedSeen: boolean;
  } | null = null;
  /** Task 3 review, IMPORTANT-1: registered ONLY while `sendGetErrorType`'s
   *  own `awaitAck()` is outstanding — an ALWAYS-ACTIVE bound, independent
   *  of whether the caller configured `options.ackTimeout` (see
   *  `DriverOptions.errorTypeTicks`'s own doc comment for why an unbounded
   *  wait here is a likely hang, not a theoretical one). Counted on the
   *  same raw GENERAL_STATUS_UUID subscription as `pendingSettle` (below),
   *  which resolves `pendingAck` directly with `"ack-timeout"` on expiry —
   *  the exact same outcome a configured `ackTimeout` would have produced,
   *  so `sendGetErrorType` needs no extra branch to tell the two apart. */
  let pendingErrorTypeTimeout: { ticks: number; ticksNeeded: number } | null =
    null;
  /** "Is a run this driver opened active and not yet closed?" — the one
   *  question the frame, boundary and disconnect paths ask about run
   *  lifetime (and, per Task 4's own interface note, the question Task 5's
   *  index normalization asks before it normalizes anything). `false` both
   *  before the first `program()` of a driver's life and after the current
   *  run's terminal state; the two are distinguished where it matters by
   *  reading `activeRun` directly (the disconnect classification below).
   *
   *  Since hardware walk 5 the boundary path asks ONE further question
   *  after this one answers `false`: `finishGraceIndex`, the bounded window
   *  in which the just-finished run still owns the split pair the PM5 sends
   *  a notification later. This predicate is unchanged — a run in its
   *  finish grace is CLOSED, and everything else that reads this still sees
   *  it that way. */
  function runIsOpen(): boolean {
    return activeRun !== null && !activeRun.closed;
  }

  /** The workout the machine is holding, per the last successful
   *  `program()` — `null` until one has ever succeeded. Deliberately
   *  SURVIVES the run's close (`activeRun` is replaced, never cleared):
   *  a finished PM5 parks in `WorkoutLogged` still holding the workout it
   *  just ran, so the frames that keep arriving afterwards still have a
   *  real program to size `intervalRemaining` and normalize
   *  `intervalIndex` against. */
  function armedProgram(): WorkoutProgram | null {
    return activeRun?.program ?? null;
  }

  /** Discards anything left in `pendingAckBuffer` from a PREVIOUS, already-
   *  resolved sequence — see the buffer's own comment for why a leftover
   *  here is never a legitimate answer to a NEW sequence's first frame.
   *  Logged as `"frame-error"` (the same kind an actually-malformed frame
   *  gets) with a `"stale-ack"` marker in the detail, clearly distinct
   *  from the benign in-sequence `"ack-buffered"` case — a leftover here
   *  is always an anomaly worth seeing, never routine. */
  function discardStaleAcks(): void {
    while (pendingAckBuffer.length > 0) {
      const stale = pendingAckBuffer.shift()!;
      log.record(
        "frame-error",
        `stale-ack: leftover from a previous sequence, discarded (${describeResponse(stale.response)})`,
      );
    }
  }

  /** Renders a `CsafeResponse` for the event log (`discardStaleAcks`,
   *  `sendSequence`'s own trace) — one place for the two log call sites to
   *  agree on the format, covering both union members (`pm5/response.ts`
   *  §19.1: an `"unparseable"` frame carries no bitfield to print). */
  function describeResponse(response: CsafeResponse): string {
    if (response.kind === "unparseable") return "unparseable";
    return `frameStatus=${response.frameStatus} slaveState=${response.slaveState} frameToggle=${response.frameToggle} commandIds=[${response.commandIds.join(",")}]`;
  }

  /** The single place `sendSequence` gets its next ack outcome from — the
   *  buffer (MED-1) is checked first; only if it is empty does this
   *  register a fresh `pendingAck` (and reset the tick counter for the
   *  ack-timeout policy, HIGH-2). Called BEFORE any write goes out for the
   *  frame it is awaiting — see `sendSequence`'s own comment on why that
   *  ordering, not just this buffer, is what makes a same-turn ack safe.
   *  Never called before `sendSequence` has already run `discardStaleAcks`
   *  for THIS sequence, so any buffered entry `awaitAck` finds here was
   *  genuinely produced during the current sequence's own execution. */
  function awaitAck(): Promise<PendingAckOutcome> {
    const buffered = pendingAckBuffer.shift();
    if (buffered !== undefined) {
      return Promise.resolve(buffered);
    }
    pendingAckTicks = 0;
    return new Promise((resolve) => {
      pendingAck = resolve;
    });
  }

  function emit(e: MonitorEvent): void {
    for (const cb of listeners) cb(e);
  }

  // Fire-and-forget: the fastest documented sample rate (interface-notes.md
  // §4) so a live countdown isn't stuck at the 500 ms default. A write
  // failure here is logged, not thrown — it would otherwise turn
  // `createPm5Driver` into something that can reject before returning,
  // which the `MonitorDriver` interface (a synchronous constructor) has no
  // way to surface.
  t.write(SAMPLE_RATE_UUID, buildSampleRateConfig()).catch((err: unknown) => {
    log.record("transport-error", `sample rate write failed: ${String(err)}`);
  });

  const controlReassembler = reassemble();
  t.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (bytes) => {
    // The drain contract (`pm5/framer.ts`'s `reassemble` JSDoc): after a
    // real push, keep draining with empty pushes until null — a coalesced
    // BLE notification can carry two complete response frames.
    let frame = controlReassembler.push(bytes);
    while (frame) {
      handleAckFrame(frame);
      frame = controlReassembler.push(new Uint8Array(0));
    }
  });

  function handleAckFrame(frame: Uint8Array): void {
    const response = parseCsafeResponse(frame);
    // Task 3: slave state joins the existing "ack" log detail (still the
    // same kind, still leading with the same raw hex) — every parsed ack
    // now shows what the PM said its OWN state was, not only whether the
    // frame status was ok. An unparseable frame has no bitfield to add
    // (response.ts §19.1) — hex alone, same as before this task.
    log.record(
      "ack",
      response.kind === "parsed"
        ? `${toHex(frame)} slaveState=${response.slaveState}`
        : toHex(frame),
    );
    const arrival: AckArrival = { raw: frame, response };
    if (pendingAck) {
      const resolve = pendingAck;
      pendingAck = null;
      resolve(arrival);
    } else {
      // A response frame with nothing CURRENTLY awaiting one — queued
      // (MED-1), not discarded: the classic case is the second frame of a
      // coalesced notification, arriving before `sendSequence` has had a
      // microtask to register the next `pendingAck`. Never crashes the
      // read loop either way.
      log.record(
        "ack-buffered",
        `no pending ack yet — queued: ${toHex(frame)}`,
      );
      pendingAckBuffer.push(arrival);
    }
  }

  t.onDisconnect((reason) => {
    // M-3 (final-review), empirically proven: resolve any `pendingAck`
    // BEFORE the expected-disconnect early-return below, not after. A
    // sequence sent AFTER the current run closed (a plausible 7B cleanup
    // path — e.g. calling `terminate()` again on unmount) still registers
    // a `pendingAck`, and for a caller that configured no `ackTimeout`
    // policy at all (the real call site, `scripts/pm5-lab.ts`, passes only
    // `verifyTicks`) a disconnect is the ONLY remaining signal that no
    // response is coming. Before this fix, the early-return below
    // discarded that signal silently, hanging `sendSequence` forever.
    // Resolving with `"disconnected"` here is accurate whether or not a
    // run is open — the transport genuinely did drop before this frame's
    // ack arrived.
    //
    // Task 4 NOTE on how this bug used to present: the ack-timeout hatch
    // was ALSO disabled after a terminal state, because `mergeStatus`'s
    // own `if (terminalLatched) return` swallowed the GENERAL_STATUS ticks
    // that counter runs on. That half is gone — the run-scoped rewrite
    // keeps every subscription live, so a configured `ackTimeout` now
    // times a post-run write out on its own. This hatch stays because it
    // is the unconfigured case's only exit, not because the other one is
    // still broken.
    if (pendingAck) {
      const resolve = pendingAck;
      pendingAck = null;
      resolve("disconnected");
    }
    // Same reasoning as the `pendingAck` hatch just above (M-3): a
    // verification in progress has no other way to learn the link is gone
    // — GENERAL_STATUS ticks (`verifyTicks`'s own bound) simply stop
    // arriving, which would otherwise hang `program()` forever rather than
    // report the real failure.
    if (pendingVerify) {
      settleVerifyFailure(
        "disconnected",
        `link disconnected during verification: ${reason}`,
      );
    }
    // Same reasoning as the two hatches just above: `terminate()`'s
    // settle wait (`pendingSettle`, design spec §7) has no other way to
    // learn the link is gone either — it counts raw GENERAL_STATUS_UUID
    // arrivals (below), which simply stop coming. Unlike `pendingVerify`,
    // this RESOLVES rather than rejects: `terminate()` already got its
    // ack (the only thing it was ever going to report success/failure
    // on), and the settle wait is purely "give the queued command a
    // little time" — a dead link is not a reason to hang the caller
    // forever waiting for ticks that will never arrive.
    if (pendingSettle) {
      const resolve = pendingSettle.resolve;
      pendingSettle = null;
      resolve();
    }
    // `program()`'s PREPARE-SETTLE wait (`pendingPrepareSettle`, design
    // spec §1b) — UNLIKE `pendingSettle` just above, this REJECTS rather
    // than resolves: the real programming send has not gone out yet, so a
    // dead link here is not "a queued command probably landed", it is a
    // genuine failure of the work `program()` still has left to do. Same
    // `ProgramRejectionError({reason: "disconnected"})` shape `sendSequence`
    // produces for a disconnect during the real send — a caller sees the
    // identical failure whichever phase the link actually died in.
    if (pendingPrepareSettle) {
      const reject = pendingPrepareSettle.reject;
      pendingPrepareSettle = null;
      log.record(
        "program-rejection",
        `disconnected during prepare-settle wait: ${reason}`,
      );
      reject(
        new ProgramRejectionError({
          reason: "disconnected",
          atFrame: -1,
          hexTrace: reason,
        }),
      );
    }
    // THE SUMMARY GATE's deadline (F7, architecture review). Only its
    // ability to WAIT for more wire evidence is cancelled here — never a
    // verdict it can already reach. The radio is gone, so no 0x0039 or
    // split can arrive after this point to change today's answer; that
    // much of fix round 1's reasoning (review Minor-5) still holds, and is
    // why the scheduled callback is always cancelled below, whatever
    // happens next. What does NOT hold, and is why this used to throw the
    // verdict away outright: "cancelling costs the run nothing it still
    // had" is false whenever a summary already arrived — the fill is
    // synthesized entirely from `run.summaryInGrace`/`run.recordedActuals`,
    // evidence already in hand, and needs no further wire traffic to
    // complete. "A screen that is being torn down" is false too: the
    // hand-off hold that keeps that screen mounted
    // (`useMonitorSession.ts`'s `FINISH_HANDOFF_HOLD_MS`, 3500ms) exists for
    // precisely this window and outlives it — both deadlines open in the
    // same synchronous emit (`FINISH_GRACE_MS`'s own doc comment) and the
    // hold is STRICTLY the longer of the two, so a reconcile run
    // synchronously here — necessarily before this grace's own scheduled
    // firing, which a still-pending `pendingSummaryReconcile` proves has not
    // happened yet — always lands inside the hold. So: cancel the wait,
    // then let the reconcile answer with whatever evidence this run has
    // already earned — filled, split-won, or declined; a link death is not
    // a reason to keep a resolvable verdict out of the trace. Extracted to
    // `drainSummaryReconcile` (Task 7): `disconnect()` below now applies
    // this identical rule for a caller-initiated hang-up, which used to
    // discard the same verdict this comment refuses to.
    drainSummaryReconcile();
    if (activeRun !== null && activeRun.closed) {
      // The old `terminalLatched` flag's SECOND consumer, re-scoped to the
      // run (Task 4, spec §4: replaced, never deleted). Appendix E (cited
      // via interface-notes.md §19.4): the PM auto-cycles
      // Terminate -> Rearm -> WaitToBegin on its own after a terminated
      // workout; a transport drop that happens to land during that
      // housekeeping (or any time after the run this driver opened has
      // closed) is expected, not an error — that RUN is over, even though
      // this driver is emphatically still listening.
      //
      // Scoped to the CURRENT run on purpose: a drop with no run ever
      // opened (`activeRun === null` — e.g. during 7B's connect flow,
      // before any `program()` call) is a genuine disconnect and still
      // announces itself below, and so is a drop during a run that is
      // open. Only "this run already finished" is the expected case.
      log.record(
        "disconnect",
        `after the current run closed, ignored: ${reason}`,
      );
      return;
    }
    reconnectPending = true;
    log.record("disconnected", reason);
    emit({ kind: "disconnected", reason });
  });

  const seenCharacteristics = new Set<string>();

  function mergeStatus<T extends object>(
    uuid: string,
    characteristic: Pm5ParseError["characteristic"],
    decode: (bytes: Uint8Array) => T | { error: Pm5ParseError },
    after: (decoded: T, bytes: Uint8Array) => void,
  ): void {
    t.subscribe(uuid, (bytes) => {
      // NO run/terminal gate here, ever (Task 4, spec §4): this callback
      // used to `return` forever once `terminalLatched` was set, which is
      // precisely how the driver went deaf after `workoutComplete`
      // (interface-notes.md §19.4). Every characteristic stays subscribed
      // and every notification is decoded for the whole life of the
      // transport; what a closed run changes is what the EMISSION paths
      // below do with the decode (`maybeEmitFrame`'s terminal branch,
      // `emitIntervalComplete`'s out-of-run branch), never whether bytes
      // are heard at all.
      // Laptop session 1 (interface-notes.md §18): a real two-interval
      // workout crossed a real boundary and NO intervalComplete fired, and
      // the log could not say whether 0x0037 never arrived or arrived and
      // was discarded — the two have completely different fixes. Record
      // the FIRST arrival of every characteristic (proves the subscription
      // is live) and EVERY arrival of the two interval-data ones (they are
      // boundary-rare, so they cannot flood the ring the way 0x0031 did).
      if (!seenCharacteristics.has(characteristic)) {
        seenCharacteristics.add(characteristic);
        log.record("notify-first", `${characteristic} (${bytes.length}B)`);
      } else if (characteristic === "0x0037" || characteristic === "0x0038") {
        log.record("notify", `${characteristic} ${toHex(bytes)}`);
      }
      const decoded = decode(bytes);
      if ("error" in decoded) {
        // The parse length guards return typed errors — logged, never
        // thrown; the stream lives (plan Task 4's own requirement).
        log.record(
          "frame-error",
          `${characteristic}: expected ${decoded.error.expected} bytes, got ${decoded.error.actual}`,
        );
        return;
      }
      raw = { ...raw, ...decoded };
      after(decoded, bytes);
    });
  }

  function announceReconnectIfPending(): void {
    if (!reconnectPending) return;
    reconnectPending = false;
    log.record("reconnected", "notification stream resumed");
    emit({ kind: "reconnected" });
  }

  /**
   * `intervalRemaining`'s "quantized progress" input (design spec §2/§3):
   * how far INTO the current interval `frame` represents, in the
   * interval's own unit.
   *
   * Task 6 (CR2 spec 2a, interface-notes.md §20 items 17/24): NO checkpoint
   * subtraction — `frame.distanceMeters`/`elapsedSeconds` (0x0031's own
   * Distance/Elapsed Time pair) IS progress into the current interval
   * already, because that pair is per-interval on the wire to begin with
   * (item 12: it resets at every boundary). A fix-round HIGH-2 predecessor
   * of this function subtracted 0x0033's "Last Split Time"/"Last Split
   * Distance" fields from this same pair on the theory that they were
   * session-cumulative and 0x0031 was too — correct by construction against
   * the fake's own self-consistent fiction of the day, but never checked
   * against a real capture. The inversion (225+161 frames replayed off
   * `docs/monitor/sessions/walk-2026-08-15/`, zero mismatches) settled
   * item 24's open question the other way: the checkpoint reads ZERO
   * through interval indices 0 and 1, then LAGS one boundary behind from
   * index 2 on, which makes the old subtraction a harmless no-op at
   * indices 0-1 (0 subtracted is nothing) and a genuine wrong answer from
   * index 2 on — walk 4's own "intervalRemaining correct as it stood"
   * verdict, cited by the code this replaces, was drawn from a
   * single-interval capture that could never have exercised the lag at
   * all. No driver-local state is needed here now, same as before: every
   * input is read straight from the current merged `raw`/`frame`.
   */
  function computeRemainingForFrame(
    frame: MonitorFrame,
  ): MonitorFrame["intervalRemaining"] {
    const p = armedProgram();
    if (!p || frame.intervalIndex === null) return null;
    const interval = p.intervals[frame.intervalIndex];
    const progress =
      interval?.kind === "distance"
        ? frame.distanceMeters
        : frame.elapsedSeconds;
    return computeIntervalRemaining(interval, progress);
  }

  /**
   * `intervalAccrued`'s per-frame wiring — the exact mirror of
   * `computeRemainingForFrame` above, reading the SAME 0x0031 per-interval
   * pair's OTHER field for the complement dimension (ROADMAP CL item 7):
   * whichever of `elapsedSeconds`/`distanceMeters`
   * `computeRemainingForFrame` does NOT read, this one does, with no
   * checkpoint subtraction here either (Task 6, same citation as its
   * sibling above). Same guard as its sibling — `!p || frame.intervalIndex
   * === null` — so the two fields are always both-null or both-set on any
   * given frame.
   */
  function computeAccruedForFrame(
    frame: MonitorFrame,
  ): MonitorFrame["intervalAccrued"] {
    const p = armedProgram();
    if (!p || frame.intervalIndex === null) return null;
    const interval = p.intervals[frame.intervalIndex];
    const progress =
      interval?.kind === "distance"
        ? frame.elapsedSeconds
        : frame.distanceMeters;
    return computeIntervalAccrued(interval, progress);
  }

  function maybeEmitFrame(): void {
    // No run gate on the EMISSION itself (Task 4, spec §4): a `frame`
    // event is the machine's current reading, which stays true and stays
    // useful whether or not a run this driver opened is still open — the
    // rower can see their numbers between runs, and 7B can show a live
    // erg it has not programmed. Only the RUN-scoped consequences below
    // (workoutComplete/terminated) care about `runIsOpen()`.
    if (!(seen.general && seen.as1 && seen.as2)) return;
    announceReconnectIfPending();

    const status = raw as RawPm5Status;
    const base = toMonitorFrame(status);
    // D3 fix (interface-notes.md §18 #3, intervalIndex.ts's own doc
    // comment): `base.intervalIndex` is still the RAW 0x0033 Interval
    // Count (parse.ts never changed) — `toProgramIndex` translates it into
    // OUR program index before it ever reaches `frame` (a consumer-facing
    // value, per this task's own contract: intervalIndex/actual.index
    // carry OUR index everywhere they reach a consumer).
    //
    // Storage-spine design spec §4 (delta D6, PR 3 Task 1): `frame.
    // rawIntervalCount` below is the ONE deliberate, named exception to
    // that contract — the raw 0x0033 byte, unclamped and un-normalized,
    // read straight off `status.intervalCount` (the merged raw state) and
    // carried through to every consumer, not just the event log below.
    // F2b's interval-count bound (§4) needs exactly what the old contract
    // withheld: an unclamped, monotonic-per-session reading, so a genuine
    // mid-stream machine reset shows up as `after < before` instead of
    // being hidden by `toProgramIndex`'s clamp-to-program-edge behavior (a
    // real backward jump can land on the same clamped value as the
    // reading before it). `MonitorFrame.rawIntervalCount`'s own doc
    // comment (`domain/monitor/types.ts`) and `intervalIndex.ts`'s header
    // comment record the same reversal.
    const p = armedProgram();
    const programLength = p?.intervals.length ?? 0;
    const intervalIndex = toProgramIndex(
      status.intervalCount,
      base.state,
      programLength,
    );
    // THE EMITTED REFERENT (interval-referent-monotone spec, 2026-08-18
    // Task 2). Starts equal to `intervalIndex` above and is raised below
    // wherever the stale-count rest clamp raises `activeKey` — the SAME
    // condition, not a second rule (this spec's own "one monotone answer"
    // requirement). Provably safe to mirror: the clamp's own `if` only
    // ever fires when `activeKey === intervalIndex` already (non-null) —
    // the OTHER way `activeKey` can start (the rowing/resting/finished
    // fallback a few lines down) sets it directly to a key already in
    // `session.seen`, which short-circuits the clamp's own `< newestKey`
    // gate before it ever runs.
    //
    // This is the fix for the defect the design doc's "Which interval do
    // these numbers belong to?" section names: before this field existed,
    // `frameWithIndex` below built its `intervalIndex` straight from the
    // unclamped constant, so a late 0x0033 left the FIRST resting frame of
    // a rest naming the interval BEFORE the one that just finished, for
    // one status tick (~450-540ms, `session-2-wu-4unequal.jsonl` GS seq
    // 1489 and seq 2430 — `registerReplay.test.ts`'s own regression
    // tests). Only 0x0031's own `mergeStatus` callback (below) calls
    // `maybeEmitFrame`; 0x0033's own callback only sets `seen.as2` — so a
    // 0x0033 sample that has not yet caught up to a state flip 0x0031
    // already reported gets no frame of its own to correct the one
    // already built.
    //
    // FIX ROUND 1, FINDING A — tried and NARROWED, not adopted whole: the
    // task review named a second source of the same class of bug, the
    // open-on-reset guard below (`activeKey = openKey`), citing a
    // hardware-documented poison tick (walk-2026-08-15 session B) where
    // 0x0033's Interval Count increments EARLY, while state is still the
    // ephemeral `WORKOUTSTATE_INTERVALWORKTIMETOREST` — `toProgramIndex`
    // resolves a too-HIGH next-interval index for that one tick, the guard
    // correctly refuses to OPEN a register key with it, and (before this
    // fix round) `emittedIntervalIndex` kept the too-high value regardless,
    // so the next honest tick's lower value read as the referent going
    // backward. Mirroring `emittedIntervalIndex = openKey` UNCONDITIONALLY
    // alongside that guard's own fold (the review's literal instruction)
    // was implemented, self-tested green, and then found to REGRESS TWO
    // pre-existing, unrelated `driver.test.ts` tests ("a reconnect
    // timeline SPANNING a boundary", "the walk signature" checkpoint-lag
    // test) — both are the guard's OWN documented "disclosed bounded edge"
    // (its own comment, below): a genuinely NEW interval whose first tick
    // collides with a STALE, gap-truncated register, where the raw
    // `intervalIndex` computed above IS the true interval identity and
    // only the session-total fold is the guard's accepted compromise.
    // Mirroring it onto the emitted field there corrupted an otherwise-
    // correct countdown/target with no wire fact behind it — trading one
    // real defect for a worse one. The two shapes ARE distinguishable:
    // Finding A's own cited mechanism is specifically the raw wire byte
    // `WORKOUTSTATE_INTERVALWORKTIMETOREST` (8); neither regressing test's
    // fixture uses it (both use plain `WORKOUTSTATE_INTERVALWORKTIME`, a
    // genuine reset). The guard's own mirror (below) is gated on that
    // exact byte for this reason — see its own comment for the full
    // argument, the state-9 sibling case left un-gated for lack of
    // evidence, and the synthetic regression test
    // (`sessionTotals.test.ts`, "finding A").
    let emittedIntervalIndex = intervalIndex;
    // THE REGISTER WRITE (CR2 spec 1 — see `session`'s own doc comment).
    // Done BEFORE the frame is finished so the emitted frame already carries
    // the totals, and deliberately AFTER `computeRemainingForFrame`'s
    // inputs are untouched: `intervalRemaining` reads the RAW per-interval
    // pair and walk 4 proved that countdown correct exactly as it stands.
    let activeKey =
      intervalIndex ??
      // Two genuinely different reasons land in this fallback, both
      // resolved by the same rule:
      // (1) the machine is rowing/resting but reports an identity the armed
      //     program cannot explain. Attributing to the newest key keeps the
      //     rower's number MOVING (freezing it reproduces the very symptom
      //     this change exists to fix).
      // (2) the machine has reported `"finished"` (controller ruling after
      //     Task 4's own review, CR2 spec 1 Task 5). `toProgramIndex`
      //     ALWAYS returns `null` for a terminal state
      //     (`intervalIndex.ts`'s own doc comment: "states outside
      //     rowing/resting ... always return null"), so without this arm
      //     the WORKOUTEND tick's own reading writes no key at all and its
      //     final counter bump is lost — observed 3.63 s/8.7 m on walk-4
      //     hardware, WALK_4's own fixture: finished 33.07/109.7 against a
      //     last resting reading of 29.44/101. The old fold (walk 4)
      //     passed the finished frame's reading straight through; the
      //     register map dropped it until this fix. `"terminated"`,
      //     `"idle"`, and `"armed"` stay OUT on purpose — a terminated
      //     workout's own boundary has no stable identity to begin with
      //     (CSAFE-DEF footnote 12), so there is nothing comparable to
      //     lose for those states.
      //     WALK_4 is a SINGLE-interval capture (that describe block never
      //     arms a program), so on its own it cannot discriminate "the
      //     finished frame carries the LAST INTERVAL's own reading" from
      //     "the finished frame carries a session-cumulative sum" — with
      //     one interval the two are the same number. The multi-interval
      //     record settles it (review I4): `docs/monitor/sessions/
      //     pm5-session4b-final.log.gz` L418, a 3+-interval row
      //     (`intervalIndex: 2` on the frames immediately before it, so the
      //     armed program has at least three intervals) whose finished
      //     frame reads `elapsedSeconds: 64.3, distanceMeters: 194.1` —
      //     identical to interval 2's own last "resting" reading just
      //     above it in the capture, not any larger session-wide sum. The
      //     same file's L2475 (a 2-interval row) shows the identical shape:
      //     finished 86.57/104.8 matches interval 1's own last reading
      //     exactly, not the two intervals' combined total (88 + 82 = 170).
      //     Checked against every one of the 10,408 frames in that same
      //     file (`captureReplay.test.ts`'s full record): of the 96 frames
      //     where state transitions INTO `"finished"`, none reads more than
      //     20 m over the immediately preceding frame — the WALK_4-shaped
      //     terminal bump this arm exists to capture stays small and
      //     bounded everywhere in the record; nowhere does a finished
      //     frame jump by anything resembling a multi-interval sum.
      // Both are, being a max into an existing key, safe: a dishonest
      // smaller reading (rowing/resting OR finished) cannot lower the
      // total, only a genuinely higher one can raise it. Logged as
      // divergence below, never silent.
      ((base.state === "rowing" ||
        base.state === "resting" ||
        base.state === "finished") &&
      session.seen.size > 0
        ? Math.max(...session.seen.keys())
        : null);

    // THE STALE-COUNT REST CLAMP (rest-keying spec, 2026-08-16). The PM5
    // notifies 0x0031 before 0x0033 in every measured burst (983/983,
    // walk-2026-08-16), so the first resting tick of interval N's rest can
    // still carry count N; the resting -1 arm then keys N-1 and max-merge
    // would keep the poison. Rest always belongs to the newest key (the
    // machine numbers rests forward; keys only grow within a run), so a
    // resting frame below max(seen) is the stale window by construction.
    // Placed BEFORE the refused-open guard: the clamp's output is a key
    // already in `seen`, which short-circuits that guard's own gate — the
    // value is order-independent (both orders simulated), the LOG is not,
    // and this order makes the specific diagnosis win the log. A stale
    // ROWING frame needs no clamp: it keys its own just-finished interval,
    // where its pair is a max-merge no-op — do not generalise this.
    if (
      base.state === "resting" &&
      activeKey !== null &&
      session.seen.size > 0
    ) {
      const newestKey = Math.max(...session.seen.keys());
      if (activeKey < newestKey) {
        if (!clampedKeysLogged.has(activeKey)) {
          clampedKeysLogged.add(activeKey);
          log.record(
            "divergence",
            `stale-count rest clamp: resting key ${activeKey} lifted to ` +
              `${newestKey} (count lags state at the boundary)`,
          );
        }
        activeKey = newestKey;
        // `emittedIntervalIndex`'s own comment above: same clamp, same
        // condition, applied to the consumer-facing field too.
        emittedIntervalIndex = newestKey;
      }
    }

    // THE OPEN-ON-RESET GUARD (CR2 spec 1 Task 11 — the walk's own
    // falsification, `docs/monitor/sessions/walk-2026-08-15/` session B, a
    // 2x1:00 @6k (r30/r0): ~23s into interval 2 the PM5 read 19m into the
    // interval while TOTAL M read 353, against an honest 195.5-198.7m).
    //
    // The mechanism: `parse.ts`'s WORKOUTSTATE_INTERVALWORKTIMETOREST (8) is
    // an ephemeral work->rest transition state that still maps to "rowing".
    // `session-a-multitest.json` seq 26 is a captured 0x0031 sample in that
    // exact state, one entry before the "resting" flip, still carrying the
    // COMPLETED interval's own pair. If 0x0033's Interval Count has already
    // incremented at that tick (the one unrecorded half — SECONDARY, no
    // capture shows the byte itself at that instant), `toProgramIndex`
    // resolves the NEXT interval's program index while the reading on the
    // wire still belongs to the interval that just finished — opening that
    // next key with the completed interval's own (larger) pair, which the
    // max-merge below then makes PERMANENT: the genuine next interval's own
    // honest, smaller readings could never lower it again.
    //
    // The guard: a NEW key (one `session.seen` does not already hold) may
    // open only when `session.seen` is empty, or when this tick's elapsed is
    // STRICTLY LESS than the elapsed already on record for the highest
    // existing key. Otherwise the reading folds into that highest key
    // instead (the same safe max-merge every other write here already
    // performs) and is logged as a refused open, never silently dropped.
    //
    // Why the elapsed comparison is guaranteed, not lucky: within one
    // un-reset 0x0031 pair, elapsed is monotone non-decreasing, and the
    // highest key's register is a max over readings from THAT SAME PAIR —
    // so a poison tick (a later sample of the same pair) always has
    // elapsed >= the register, and strict-`<` refuses it, while a genuinely
    // new interval's first tick comes from a RESET pair and is strictly
    // smaller. The predicate is exactly "has the pair reset since the
    // highest key was last written?" — level-triggered, no constants, no
    // edge memory.
    //
    // N-1 poisons: `toProgramIndex`'s own clamp folds a final-boundary
    // candidate onto the last EXISTING index (never opens a key beyond
    // `programLength - 1`), so this guard only ever has to refuse the
    // programLength - 1 NON-final boundaries — consistent with session A (3
    // intervals, "ours higher than the erg", 2 poisons) and session B (1
    // poison, photographed above).
    //
    // Deliberately NO distance clause: distance re-bases only on Terminate,
    // already excluded from writes by the state gate above (`"terminated"`
    // is neither `"rowing"` nor `"resting"` nor `"finished"`), and a
    // distance-based guard would collapse two genuinely different keys
    // whenever a previous interval's own register holds <=0.8m (a rower who
    // never pulled) — losing ~60s of session elapsed for nothing the elapsed
    // clause does not already catch.
    //
    // Disclosed bounded edge: a genuinely new interval whose FIRST seen tick
    // already has elapsed >= the previous key's register (needs a boundary
    // into a restSeconds:0 interval AND a multi-second frame gap AND a short
    // previous interval's own last-seen reading) misattributes into the old
    // key. The total stays monotone; the undercount is bounded by that one
    // tick's own reading, and the divergence log below is what a future
    // capture can use to tell this apart from the poison it guards against.
    //
    // The LOG is gated by `refusedKeysLogged` (its own comment, above) —
    // ONE entry the first time a given key is refused, silent on every
    // later refusal of that SAME key. The WRITE below (folding into
    // `openKey`) is never gated: every refused tick's reading still
    // max-merges in, so the total stays exactly as accurate as it would be
    // with the log unthrottled — only the trace volume changes.
    if (
      activeKey !== null &&
      session.seen.size > 0 &&
      !session.seen.has(activeKey)
    ) {
      const openKey = Math.max(...session.seen.keys());
      const openRegister = session.seen.get(openKey)!;
      if (!(base.elapsedSeconds < openRegister.elapsedSeconds)) {
        if (!refusedKeysLogged.has(activeKey)) {
          refusedKeysLogged.add(activeKey);
          log.record(
            "divergence",
            `key ${activeKey} refused open: elapsed=${base.elapsedSeconds} ` +
              `distance=${base.distanceMeters} is not before key ${openKey}'s ` +
              `own elapsed register (${openRegister.elapsedSeconds}) — merged ` +
              `into key ${openKey} instead`,
          );
        }
        activeKey = openKey;
        // `emittedIntervalIndex`'s own comment above (fix round 1, finding
        // A) — narrowed, NOT unconditional, after this exact mirror broke
        // two pre-existing, legitimate regression tests (`driver.test.ts`:
        // "a reconnect timeline SPANNING a boundary", "the walk signature"
        // checkpoint-lag test). Both are the guard's OWN documented
        // "disclosed bounded edge" — a genuinely NEW interval whose first
        // tick collides with a STALE (gap-truncated) register — where the
        // raw `intervalIndex` computed above is the TRUE interval identity
        // and only the SESSION-TOTAL fold is the accepted compromise;
        // mirroring it onto the emitted field there was corrupting an
        // otherwise-correct countdown/target with no wire fact supporting
        // it. Finding A's own cited mechanism is narrower than "any
        // refused open": specifically the ephemeral `WORKOUTSTATE_
        // INTERVALWORKTIMETOREST` (8) state, where the RAW tick has NOT
        // genuinely reset (state 8 still reports the completed interval's
        // own continuing pair, per the guard's own comment above) — so
        // gating on that exact raw byte is what distinguishes "the
        // computed index is a genuine lie" (mirror it) from "the computed
        // index is the truth, only the register-fold is a disclosed
        // compromise" (leave it). Neither `driver.test.ts` regression uses
        // state 8 (both use `WORKOUTSTATE_INTERVALWORKTIME`, a genuine
        // reset), confirming the two shapes are in fact distinguishable by
        // this signal. State 9 (`WORKOUTSTATE_INTERVALWORKDISTANCETOREST`,
        // the same ephemeral shape for a distance-kind interval) used to be
        // named here as "the symmetric, plausible sibling case — NOT gated
        // here, since no capture or existing test evidences it either way
        // ... the same one-line extension if a future walk shows it". This
        // walk is that capture: `docs/monitor/sessions/
        // walk-2026-08-24/phone-exit7-ring.json` seq 27/28, a 2x250m r60
        // row (distance-kind intervals) where state 9 poisoned the same
        // way state 8 does — the refused-open guard above correctly kept
        // the SESSION TOTALS honest, but (before this fix, series-truth
        // design spec §A) left the emitted referent at the too-high key it
        // never opened. Gated on both ordinals now, by the same reasoning:
        // neither `driver.test.ts` regression this narrowing exists to
        // protect uses state 8 OR state 9 (both use plain
        // `WORKOUTSTATE_INTERVALWORKTIME`/`WORKOUTSTATE_INTERVALWORKDISTANCE`
        // — a genuine reset), so extending the gate to 9 cannot reintroduce
        // either regression.
        if (
          status.workoutState === WORKOUTSTATE_INTERVALWORKTIMETOREST ||
          status.workoutState === WORKOUTSTATE_INTERVALWORKDISTANCETOREST
        ) {
          emittedIntervalIndex = openKey;
        }
      }
    }

    if (activeKey !== null) {
      const prior = session.seen.get(activeKey);
      session.seen.set(activeKey, {
        elapsedSeconds: Math.max(
          prior?.elapsedSeconds ?? 0,
          base.elapsedSeconds,
        ),
        distanceMeters: Math.max(
          prior?.distanceMeters ?? 0,
          base.distanceMeters,
        ),
      });
    }

    // THE CARRY-OVER GUARD (interval-referent-monotone spec, 2026-08-18
    // Task 2, the OTHER direction from the clamp above; LEVEL-triggered as
    // of fix round 1, finding B — `splitAvgPaceProvenanceIndex`'s own doc
    // comment has the full mechanism and why the obvious CURRENT-tick
    // computation was rejected). Nulls `splitAvgPace` whenever its own
    // provenance interval is BEHIND the referent this frame is about to
    // name — re-evaluated fresh every frame from `splitAvgPaceProvenanceIndex`
    // alone, no memory of the previous frame, so a dropped 0x0033 notify
    // extending the lag past one tick still gets caught on every frame it
    // touches, not just the first.
    const splitAvgPaceIsStale =
      emittedIntervalIndex !== null &&
      splitAvgPaceProvenanceIndex !== null &&
      splitAvgPaceProvenanceIndex < emittedIntervalIndex;
    const frameWithIndex: MonitorFrame = {
      ...base,
      intervalIndex: emittedIntervalIndex,
      splitAvgPace: splitAvgPaceIsStale ? null : base.splitAvgPace,
      // series-truth design spec §B′ (Task 2): `activeKey` IS the key the
      // register write above (`session.seen.set(activeKey, ...)`)
      // used for this exact tick — the stale-count rest clamp and the
      // open-on-reset guard above both reassign `activeKey` itself (not a
      // parallel value), so reading it here rather than re-deriving
      // anything is what makes this field EQUAL the register key by
      // construction, not by a second, potentially-diverging mirror.
      // Deliberately UNGATED by the state-8/9 mirror condition that
      // `emittedIntervalIndex` above uses: that gate exists only to keep
      // `intervalIndex` (a countdown/target-facing field) from moving on
      // the guard's OWN disclosed bounded edge (see the guard's comment) —
      // `attributedIntervalIndex` has no such caveat to inherit, since it
      // is defined as "whatever key the accumulator used," full stop, for
      // every state including the ones `intervalIndex` intentionally
      // leaves alone. `null` (no write this tick — armed/idle/terminated,
      // or rowing/resting/finished with no prior key to fall back to) maps
      // to `undefined`, the field's own documented "no opinion" value
      // (`domain/monitor/types.ts`).
      attributedIntervalIndex: activeKey ?? undefined,
      // D6 (storage-spine spec §4, Task 1) — the raw sibling of
      // `intervalIndex` above; see this function's own comment a few
      // lines up and the field's own doc comment for why this one stays
      // unclamped and un-normalized.
      rawIntervalCount: status.intervalCount,
    };
    const totals = [...session.seen.values()];
    const frame: MonitorFrame = {
      ...frameWithIndex,
      intervalRemaining: computeRemainingForFrame(frameWithIndex),
      intervalAccrued: computeAccruedForFrame(frameWithIndex),
      // An EMPTY map falls back to the raw pair: a JustRow with no program
      // armed has no interval identity at all, and there per-interval IS the
      // session.
      sessionElapsedSeconds:
        totals.length === 0
          ? base.elapsedSeconds
          : totals.reduce((a, r) => a + r.elapsedSeconds, 0),
      sessionDistanceMeters:
        totals.length === 0
          ? base.distanceMeters
          : totals.reduce((a, r) => a + r.distanceMeters, 0),
    };
    // R0 (CR2 spec 1, Task 1): cache the pair `logSummaryTotals` cannot
    // recompute for itself (`lastEmittedTotals`'s own doc comment).
    lastEmittedTotals = {
      elapsedSeconds: frame.sessionElapsedSeconds,
      distanceMeters: frame.sessionDistanceMeters,
    };
    // Raw tracking for the OLD (fix-round MED-2) raw-vs-raw comparison —
    // see `lastRawFrameIntervalIndex`'s own doc comment for why this stays
    // in the machine's numbering, not `frame.intervalIndex`'s new one.
    lastRawFrameIntervalIndex = base.intervalIndex;
    // The NEW divergence trigger this task adds: a machine index that
    // CANNOT be explained by the armed program's own length, while a real
    // interval is supposedly current (`intervalActive`) — exactly the blind
    // spot D3 exposed (both raw fields agreeing with each other, so the OLD
    // raw-vs-raw check below never fires, while both disagree with the
    // program). Gated on a program actually being armed: with none,
    // `programLength` is 0 and `toProgramIndex` always returns `null` by
    // its own contract — informative about nothing, since there is no
    // program to diverge FROM yet.
    const intervalActive = base.state === "rowing" || base.state === "resting";
    // The last state in which an interval was genuinely current — what the
    // finish grace normalizes its boundary against once the machine has
    // moved on to `finished` (`activeRun.lastActiveState`'s own comment).
    if (intervalActive && activeRun !== null && !activeRun.closed) {
      activeRun.lastActiveState = base.state;
    }
    // `activeRun.freeRow` opts out (Phase JR PR 2). The guard above reads
    // "a program is armed", which a free row's own open run now satisfies —
    // `armedProgram()` returns its `{ intervals: [] }` — while the thing
    // this entry exists to report, a machine interval with no counterpart in
    // the program we sent, cannot happen when we sent NO INTERVAL STRUCTURE.
    // (Since spec 2026-09-02 a free row does send the machine a frame — the
    // p.80 JustRow program — but that frame carries a workout TYPE and a
    // screen state, never intervals, so there is still nothing here to
    // disagree with.) Without this, every frame of every free row logs one.
    if (p && !activeRun?.freeRow && intervalActive && intervalIndex === null) {
      log.record(
        "divergence",
        `intervalIndex=${status.intervalCount} (0x0033, state=${base.state}) has no corresponding interval in a ${programLength}-interval program`,
      );
    }
    // Log a frame ONLY when the machine's state word changes. Observed in
    // the first laptop session (interface-notes.md §18, 2026-08-05): status
    // notifications arrive ~2/second, so recording every one evicted the
    // whole programming trace — the write/ack pairs the log exists for —
    // from the 500-entry ring inside about four minutes. A trace that
    // cannot survive a warm-up is not observability. State transitions are
    // the frame-side fact worth keeping; the live values belong to the
    // `frame` EVENT (below), which every pane already consumes.
    const stateChanged = frame.state !== lastLoggedFrameState;
    if (stateChanged) {
      lastLoggedFrameState = frame.state;
      // rowingActive and spm ride along since walk 3 (2026-08-08): the
      // ready-gate postmortem needed exactly these two on the flip frame
      // and the capture did not carry them.
      log.record(
        "frame",
        `state=${frame.state} elapsed=${frame.elapsedSeconds} distance=${frame.distanceMeters} rowingActive=${frame.rowingActive} spm=${frame.spm}`,
      );
    }
    emit({ kind: "frame", frame });

    // A terminal state closes THE RUN (Task 4, spec §4) — not the driver,
    // not the subscriptions, not this function. Everything above still
    // ran, and will run again on the very next notification.
    if (!(frame.state === "finished" || frame.state === "terminated")) return;
    if (!runIsOpen()) {
      // A terminal state with no open run to close: either this run's own
      // terminal state already closed it (the PM keeps reporting
      // "finished" for as long as it sits in WorkoutLogged, so this is the
      // COMMON case — `workoutComplete` fires exactly once per run), or no
      // `program()` ever opened one (a workout the rower started on the
      // machine itself). Logged only on a state CHANGE: at ~2 status
      // notifications/second an unconditional entry here would evict the
      // whole programming trace from the 500-entry ring in minutes, the
      // same flood the frame log above already guards against.
      if (stateChanged) {
        log.record(
          "terminal-out-of-run",
          `machine reported "${frame.state}" with no open run — no workoutComplete/terminated event (a run is opened by program() alone, spec §4)`,
        );
      }
      return;
    }
    activeRun!.closed = true;
    // finished and terminated BOTH close the run, but they are NOT the
    // same machine shape afterwards, and this driver must not assume they
    // are (CSAFE-DEF Appendix E, cited via interface-notes.md §19.4):
    // - "finished" (WORKOUTEND -> WorkoutLogged) PARKS. The PM stays in
    //   WorkoutLogged, answering CSAFE the whole time, and leaves only on
    //   the user pressing Menu or the master sending Terminate — which is
    //   exactly what `program()`'s own leading prepare step does, and why
    //   a rower can start a second workout from this app without touching
    //   the erg.
    // - "terminated" (TERMINATE) AUTO-REARMS: Terminate -> Rearm ->
    //   WaitToBegin, unaided, so the machine reports "armed" and then
    //   "rowing" again all by itself. That noise is precisely why a run is
    //   opened by `program()` and never by a state word (`activeRun`'s own
    //   doc comment).
    // The run-close is symmetric; the CONSUMER-facing event is not, because
    // 7C has to tell "logged 12 of 12" from "abandoned at 8"
    // (`domain/monitor/types.ts`'s own note on why the pair exists).
    // THE FINAL TOTALS, into the ring, at the terminal transition itself
    // (James's walk protocol change, 2026-08-15). Two facts orphaned every
    // other route to this comparison: the PM5 has no live session-cumulative
    // view during interval workouts (vendor docs — every Display view is
    // split-scoped, so the only machine total is the finish summary screen),
    // and the hook auto-navigates to the log screen at the hand-off release,
    // which both takes TOTAL M off the phone's screen and tears down the
    // link before 0x0039 usually arrives (`summary-totals` loses that race
    // on-device; both walk rings end without one). The ring survives via the
    // sessionStorage stash, so writing the finals HERE means a re-walk needs
    // exactly one photograph (the PM5 summary) and zero phone timing.
    //
    // ONE OF TWO CALL SITES (Task 7, "one terminal path" — `recordFinalTotals`'s
    // own doc comment names the other, `terminate()`). This one fires on the
    // machine's OWN terminal frame — the ordinary path, and the one a natural
    // finish always takes. The END/cancel path takes the other: that frame
    // routinely arrives after teardown has already stashed and hung up
    // (spec 1's walk evidence), so it cannot be the only place these totals
    // are written.
    recordFinalTotals(activeRun!);
    // THE TERMINAL FRAME'S OWN BYTES (walk 2026-08-15, the mid-rest
    // finished frame — see `lastRaw0x0031`'s declaration comment). One
    // entry per session end, so the flood argument that keeps 0x0031 out
    // of the raw-hex notify branch does not apply here.
    const terminalRawDetail =
      lastRaw0x0031 === null
        ? `state=${frame.state} 0x0031=never seen`
        : `state=${frame.state} 0x0031=${toHex(lastRaw0x0031)}`;
    log.record("terminal-raw", terminalRawDetail);
    // THE SUSPICION VERDICT (Task 8, spec §2, PM/antagonist-corrected) —
    // LOG-ONLY and FAIL-OPEN: nothing below this block, and nothing this
    // block itself does, changes any close behaviour — no field on `run`
    // is touched, no event is altered, `workoutComplete`/`terminated` still
    // emit exactly as before. `terminated` is NEVER suspicious (a
    // mid-terminate boundary carries no stable identity, CSAFE-DEF
    // footnote 12 via interface-notes.md §19.8 — a short terminate is the
    // ORDINARY shape for that ending, not evidence of a kill), so this
    // gates on `frame.state === "finished"` and does not run at all for
    // the other branch below.
    //
    // A `finished` is UNSUSPICIOUS iff EITHER a 0x0039 was seen for this
    // run (`summarySeen`, set unconditionally at the top of `noteSummary` —
    // deliberately NOT `run.summaryInGrace`, which is `null` on exactly
    // the shape this OR exists to catch: session-c, walk 2026-08-15, the
    // 0x0039 arrived BEFORE the terminal frame and was discarded
    // `out-of-window` because no grace was open yet) OR this run has
    // recorded at least `programmed − 1` of its own intervals — one short
    // is the ordinary "final boundary lands one notification after the
    // terminal frame" shape the finish grace right below already exists
    // for, not a kill. All four committed rings clear this bar (session-a
    // 2 of 3, session-b 1 of 2 — both exactly N−1; session-c by the
    // summary half; session-d 2 of 2) — see `sessionTotals.test.ts`'s own
    // "suspicion verdict" describe block, which also carries the one shape
    // that DOES trip it (mid-program, no summary, well short of N−1 — the
    // afternoon walk's session-killer signature, hand-built there since
    // that ring itself was never committed).
    //
    // Admitted residual, not silently accepted: a 1-interval program can
    // never trip this (`programmed − 1 === 0`, and an actuals count is
    // never negative, so the OR's right side is always already satisfied).
    if (frame.state === "finished") {
      const programmedCount = activeRun!.program.intervals.length;
      const unsuspicious =
        summarySeen || activeRun!.recordedActuals.size >= programmedCount - 1;
      if (!unsuspicious) {
        log.record("suspicious-terminal", terminalRawDetail);
      }
      // THE FINISH GRACE opens here and nowhere else (walk 5, re-bounded on
      // walk day 3 — `activeRun.finishGraceUntil`'s own doc comment carries
      // the capture and `FINISH_GRACE_MS` the measurement).
      // Opened BEFORE the terminal event goes out, because the boundary it
      // exists for arrives while this same tick's listeners have already
      // been told the workout ended: the grace decides which RUN the next
      // notification belongs to, not when the consumer hears the news.
      activeRun!.finishGraceUntil = now() + FINISH_GRACE_MS;
      // ...and the SUMMARY-FALLBACK GATE's deadline with it (fast-follow
      // Task 2, design spec §5). Armed here and only here, for the same
      // reason the grace is: a natural finish is the one ending whose
      // missing final interval the summary is allowed to speak for. Armed
      // BEFORE the `workoutComplete` emit below so it is scheduled ahead of
      // the hook's own hand-off hold, which is scheduled inside that emit —
      // the two windows are coupled constants and their ORDER of arming is
      // what makes "the fill happens before navigation" a fact about the
      // code rather than about the event loop.
      armSummaryReconcile(activeRun!);
      log.record("terminal", "finished");
      emit({ kind: "workoutComplete" });
      // Review fix round 1, HIGH finding: fired AFTER the emit above, not
      // before — `workoutComplete` is what the hook's own `closeRecord`
      // runs off of, and a `summary-observations` event synchronously
      // emitted BEFORE that would reach `appendSummaryObservations` while
      // the hook's own record still reads `completedAt: null`, declining
      // permanently (decline #3, `monitorRun.ts`'s own doc comment) on
      // exactly the run this call exists to serve fastest. Covers the
      // PURE early side: split and summary both already in hand by the
      // moment our own terminal transition happens.
      maybeReconcileImmediately(activeRun!);
    } else {
      // GATE 2 ARMS HERE (summary-record design spec §1) — and nowhere
      // else. A `terminated` close still opens NO finish grace and arms NO
      // reconcile deadline (footnote 12, and `armSummaryReconcile`'s own
      // "NATURAL-FINISH-ONLY is enforced at THIS call site"): the ONLY
      // thing this run gains is permission for its own 0x0039 to be
      // recorded as an OBSERVATION. Set BEFORE the emit, because the emit
      // is what drives the hook's `closeRecord`/navigation and the burst
      // that follows it can, on the fake's own timing, arrive inside the
      // same tick.
      activeRun!.terminatedAwaitingSummary = true;
      log.record("terminal", "terminated");
      emit({ kind: "terminated" });
      // THE EARLY-BURST ORDERING (fix round 1, review IMPORTANT). Gate 2's
      // flag only opens `noteSummary`'s door, which is no use at all when
      // 0x0039 ALREADY CAME AND WENT: the burst beating our own terminal
      // transition is the documented common case (§1's PRIMARY research
      // measured it in 3 of 5 committed finishes), and on a run still
      // reporting its final interval `noteSummary` files it in
      // `summaryInGrace` as "buffered — held for this run's own natural
      // close". A single-interval program is in its final interval from
      // the instant it opens, so this is the DEFAULT shape there, not an
      // edge.
      //
      // Nothing else on a terminate would ever read that buffer: no
      // `pendingSummaryReconcile` is armed, `noteSummary` has already run
      // for these bytes and will not run again, and the hook's own
      // `reconcile()` drains a deadline that does not exist. The run
      // therefore ended with the machine's numbers in hand, no event, no
      // record, and NO LOG ENTRY — a silent loss, strictly worse than the
      // `out-of-window` one this spec set out to fix.
      //
      // So the close picks the buffer up and routes it through the SAME
      // observations-only path the late ordering uses. `summaryInGrace` is
      // emptied here, which also keeps gate 3 exactly as strong as before
      // (nothing is left in the one field `reconcileSummary` reads), and
      // the flag is cleared because this summary IS the run's one
      // admission — a later re-fire must find the door shut.
      //
      // AFTER the `terminated` emit, never before, for the same reason
      // `maybeReconcileImmediately` sits after `workoutComplete` in the
      // sibling branch above: the emit is what drives the hook's
      // `closeRecord`, and an observations event reaching
      // `appendSummaryObservations` while the record still reads
      // `completedAt: null` would be declined permanently.
      const heldBeforeTerminal = activeRun!.summaryInGrace;
      if (heldBeforeTerminal !== null) {
        activeRun!.terminatedAwaitingSummary = false;
        noteTerminateObservations(activeRun!, heldBeforeTerminal, "early");
      }
      // RC-9a: a `terminated` close opens no finish grace (this branch's
      // own leading comment) — no further split can ever reach
      // `recordedActuals` after this point (`emitIntervalComplete`'s own
      // out-of-run branch takes over, index=null, untouched by this
      // driver's own bookkeeping), so this run's recorded population is
      // already final RIGHT HERE. Unlike the `finished` sibling, this
      // verdict runs synchronously at the terminal transition itself —
      // there is no async fill to wait for.
      recordAvgPaceVerdict(activeRun!);
    }
  }

  /**
   * Records the arrival of one half of a boundary, carrying that half's own
   * Split/Interval Number, and emits once BOTH halves of the SAME boundary
   * are in — see `boundaryHalves`'s own doc comment (D4). The reset happens
   * BEFORE the emission, not after, so a listener that somehow re-entered
   * could never see a half-consumed pair.
   *
   * **A half whose partner never comes is DISCARDED, never emitted and
   * never paired forward.** The moment a half belonging to a different
   * boundary arrives, the stale one is dropped and logged
   * (`boundary-orphan`) — including the case where the same characteristic
   * reports twice in a row, which means the OTHER one was lost. The
   * consequence is deliberate and is the lesser of the two evils available:
   * that boundary's `intervalComplete` is lost (its data genuinely is —
   * half of it never arrived, and `MonitorRun.actuals` is already
   * documented as possibly shorter than `program.intervals`), while every
   * LATER boundary stays intact. The alternative — emitting an identity
   * with someone else's averages — is the D4 corruption itself, and it is
   * silent: nothing downstream could tell such an actual from a real one.
   * The log entry is what makes the loss visible instead.
   */
  function noteBoundaryHalf(half: "split" | "asSplit", boundary: number): void {
    // RECEIPT AT THE PAIRING LAYER (hardware walk day 2, 2026-08-11).
    // What the `notify` entry above already gives, and this does not
    // duplicate: that the bytes ARRIVED, in full hex, for every
    // 0x0037/0x0038 (a length failure logs `frame-error` instead). The
    // absence of a `notify` entry was already the evidence behind the walk's
    // ordering diagnosis, and this entry does not change that.
    // What `notify` CANNOT say, and this does: that the half reached the
    // pairing gate at all, which Split/Interval Number it claims, whether a
    // run of ours was open when it got here, and what state the machine was
    // reading at that moment — the three facts that decide the half's fate
    // one line further down. Two entries per boundary is nothing against the
    // 500-entry ring (a boundary is per-interval, not per-tick, unlike the
    // ~2/second status flood the `frame` log guards against).
    log.record(
      "split-half",
      `${half === "split" ? "0x0037" : "0x0038"} for Split/Interval Number ${boundary} received (run ${runIsOpen() ? "open" : "closed"}, state=${toMonitorFrame(raw as RawPm5Status).state})`,
    );
    const otherHalf = half === "split" ? "asSplit" : "split";
    const superseded = boundaryHalves[half];
    if (superseded !== null && superseded !== boundary) {
      // This same characteristic reported twice with nothing from its
      // partner in between: the partner for `superseded` was lost.
      recordOrphanedHalf(half, superseded);
    }
    boundaryHalves[half] = boundary;

    const waiting = boundaryHalves[otherHalf];
    if (waiting === null) return;
    if (waiting !== boundary) {
      recordOrphanedHalf(otherHalf, waiting);
      boundaryHalves[otherHalf] = null;
      return;
    }
    boundaryHalves.split = null;
    boundaryHalves.asSplit = null;
    emitIntervalComplete();
  }

  function recordOrphanedHalf(
    half: "split" | "asSplit",
    boundary: number,
  ): void {
    log.record(
      "boundary-orphan",
      `${half === "split" ? "0x0037" : "0x0038"} for Split/Interval Number ${boundary} never found its partner — discarded rather than paired with another boundary (that interval's actual is lost)`,
    );
  }

  /**
   * Fast-follow Task 1 (design spec §5, review I5/I6): records the arrival
   * of EITHER end-of-workout summary characteristic — deliberately NOT
   * paired the way `noteBoundaryHalf` pairs 0x0037/0x0038. Gating the
   * reconcile on BOTH halves would recreate the exact drop-fragility the
   * summary pair exists to fix (review I5: "every field the spec's list
   * needs sits on 0x0039 alone... a reconcile that waits for both
   * `summary-half`s dies when 0x003A drops even though 0x0039 arrived
   * complete"). **UPDATED, RC-9d (design spec 2026-08-25-free-oracles
   * §3):** 0x003A's bytes were observability-only when this comment was
   * first written — that changed. `recordRestDistanceVerdict` (called
   * alongside this function at 0x003A's own subscribe site, below) now
   * decodes two of its fields for a RING-ONLY diagnostic oracle. What
   * has NOT changed is the RECONCILE gate this paragraph's own reasoning
   * protects: nothing about the summary-fallback reconcile GATES on
   * 0x003A's arrival or content — Task 2's gate (`noteSummary` below)
   * still decodes 0x0039 alone, and a diagnostic that reports "no reading
   * yet" when 0x003A is late or missing carries none of the drop-fragility
   * risk a reconcile gated on it would.
   *
   * Mirrors `noteBoundaryHalf`'s own log site and voice deliberately
   * (`split-half`'s "characteristic ... received (run open/closed,
   * state=...)" shape) so the stash reads the same way for both pairs.
   *
   * `bytes` (Phase LL Task 1, link-truth design spec §1: "not even their
   * hex could reach it, and 0x003A's callback takes no bytes parameter at
   * all") — the RING now gets the raw hex for both halves, mirroring
   * `mergeStatus`'s own full-hex logging for 0x0037/0x0038 (that
   * function's own comment: "boundary-rare, so they cannot flood the
   * ring"). 0x0039/0x003A are rarer still — once per workout end, with an
   * occasional HRM re-fire — so the same no-flood argument applies with
   * more room to spare. This function's OWN job is unchanged: it always
   * only logs RECEIPT (`summary-half`), for both characteristics, exactly
   * as before; `recordRestDistanceVerdict` is a separate call the 0x003A
   * subscribe site now also makes, not a second thing this function does.
   */
  function noteSummaryHalf(
    characteristic: "0x0039" | "0x003A",
    bytes: Uint8Array,
  ): void {
    const label =
      characteristic === "0x0039"
        ? "end-of-workout summary"
        : "end-of-workout additional summary";
    log.record(
      "summary-half",
      `${characteristic} ${label} received (run ${runIsOpen() ? "open" : "closed"}, state=${toMonitorFrame(raw as RawPm5Status).state}) raw=${toHex(bytes)}`,
    );
  }

  /**
   * 0x0039's own handler (fast-follow Task 2, design spec §5) — the
   * SUMMARY-FALLBACK GATE's entrance, and the only place this driver
   * decodes an end-of-workout summary.
   *
   * It files NOTHING. Its whole job is to decide whether this notification
   * is evidence about the run that just finished, and if so to hold it
   * until the deadline — review I4's precedence ruling in one function:
   * "the split is authoritative and IMMEDIATE, any time inside the grace
   * window. The summary fills ONLY AT GRACE EXPIRY." A gate that acted
   * here would displace a split that was merely late, which is the exact
   * loss R1 exists to prevent (the split carries per-interval averages
   * that no whole-workout summary can reconstruct).
   *
   * `summarySeen` (Task 8) is set UNCONDITIONALLY on the very first line,
   * before the decode below and before any of the three gates that follow
   * it — deliberately not derived from anything this function decides.
   * "0x0039 arrived" and "0x0039's evidence was accepted" are different
   * facts (session-c, walk 2026-08-15: the notification arrived and was
   * discarded `out-of-window` in the same tick, because no grace was open
   * yet) and only the first one is what the suspicion verdict needs.
   */
  function noteSummary(bytes: Uint8Array): void {
    summarySeen = true;
    const summary = parseEndOfWorkoutSummary(bytes);
    if (summary === null) {
      // A RECEIPT-LEVEL note, under its own kind, NOT a `summary-reconciled`
      // verdict (fix round 1, review Minor-7). `summary-reconciled` carries
      // exactly the four words spec §5 names — `split-won`,
      // `filled-from-summary`, `declined`, `out-of-window` — and `declined`
      // is the DEADLINE's verdict on a run. A parse failure happens at
      // arrival, before any window question is even asked, and a run whose
      // 0x0039 was garbled would otherwise log `declined` twice for one
      // failure: a reader counting verdicts would double-count it.
      log.record(
        "summary-undecodable",
        `0x0039 arrived with ${bytes.length} byte(s) and could not be decoded (the layout is 20, interface-notes.md §23); nothing stored, and the deadline will report its own verdict on the run`,
      );
      return;
    }
    // RC-2 (storage-spine design spec §2, PR 1 Task 3): the log date/time
    // stamp, recorded as its own ring entry on EVERY successful 0x0039
    // decode — including the re-fire (spec exit criterion 3: one entry per
    // NOTIFICATION, not one per run). DIAGNOSTIC only, per
    // `parseSummaryLogStamp`'s own doc comment: the wire carries no
    // seconds, and this is never an identity. `wall=` is this driver's own
    // clock seam (`now()`, this function's closure), never a bare
    // `Date.now()` — matches every other timestamp this driver logs.
    const stamp = parseSummaryLogStamp(bytes);
    // `stamp === null` is unreachable HERE by construction, same shape as
    // `reconcileSummary`'s own `lastIndex < 0` guard below: this call site
    // is only ever reached after `parseEndOfWorkoutSummary(bytes)` already
    // succeeded, which requires `bytes.length >= 20`; `parseSummaryLogStamp`
    // only returns `null` for `bytes.length < 4`. Kept explicit (matching
    // the brief's own null-checking idiom, `parseSummaryLogStamp`'s
    // general-purpose `| null` return) rather than asserted away, so this
    // never silently reads garbage if the two layouts' minimum lengths ever
    // diverge — the cost of the guard is one branch, uncovered on purpose.
    if (stamp !== null) {
      const pad = (n: number): string => String(n).padStart(2, "0");
      log.record(
        "summary-log-stamp",
        `wire=${stamp.year}-${pad(stamp.month)}-${pad(stamp.day)} ${pad(stamp.hours)}:${pad(stamp.minutes)} wall=${new Date(now()).toISOString()} (wire carries no seconds; DIAGNOSTIC only, never an identity - spec S2)`,
      );
    }
    const run = activeRun;
    // THE WALK'S OWN INSTRUMENT (final review IMP-1), logged BEFORE any
    // window question so it fires on every path a 0x0039 can take: stored,
    // redundant-because-the-split-already-won, out-of-window, re-fire.
    //
    // Why it has to be here and not in the verdict. Until this entry
    // existed, the only place 0x0039's decoded totals reached the stash was
    // `filled-from-summary` — which fires only when the final split
    // genuinely DROPS, a radio flake nobody can arrange at the erg. So on
    // the healthy row the walk was asked to settle §23's walk items 2 and
    // 4 from a trace containing no number to settle them with, and the
    // ROADMAP's exit line promised more than the row could deliver. This is
    // the briefing's `rowingActive` pattern: an unobserved premise ships
    // with the log line that lets the next hardware session settle it.
    logSummaryTotals(summary, run);
    if (run === null) {
      log.record(
        "summary-reconciled",
        "out-of-window — 0x0039 arrived before any program() ever opened a run (a workout the rower started on the machine itself, or a summary left over from before we connected); nothing filed",
      );
      return;
    }
    // ── THE OBSERVATIONS-ONLY DOOR (summary-record design spec §1, gates
    // 2+3) ─────────────────────────────────────────────────────────────
    // Checked BEFORE every closed-run branch below, because none of them
    // can serve this shape: `graceIsOpen` is false on a terminate (no
    // grace is ever opened), the early-side branch needs an OPEN run, and
    // the late-side branch requires `pendingSummaryReconcile !== null` —
    // which a terminate never arms, since `armSummaryReconcile`'s one call
    // site is the `finished` branch. (CORRECTED, fix round 1 m1: this used
    // to say the late-side branch was ruled out because a terminated piece
    // "by construction" has no final split recorded. That is FALSE — a
    // Menu press during the trailing rest of the last interval leaves the
    // final 0x0037 already filed — and it was not the load-bearing reason
    // anyway. The pending-deadline conjunct is.) Without this door the
    // burst falls through to `out-of-window` and is lost, which is exactly
    // what production did.
    //
    // What passes through it is the OBSERVATION SET ALONE. `summaryInGrace`
    // stays `null` on this path — the summary lives in `emitTerminate`'s
    // closure, not on the run — so `reconcileSummary` (the only reader of
    // that field, and the only writer of a synthesized
    // `intervalComplete{finalBoundary: true}`) has nothing to consume even
    // if some future call site reached it. That is gate 3, structural: an
    // abandoned run can never gain a COMPLETED final interval it did not
    // row.
    //
    // No `run.closed` conjunct, and that is not an omission: this flag is
    // written on exactly one line, immediately after `activeRun!.closed =
    // true` in the same branch, and nothing anywhere reopens a closed run.
    // A `run.closed &&` here would be a guard on a condition that cannot
    // be false — unreachable code wearing a guard's clothes.
    if (run.terminatedAwaitingSummary) {
      run.terminatedAwaitingSummary = false; // once per run — the re-fire finds it shut
      noteTerminateObservations(run, summary, "late");
      return;
    }
    if (!graceIsOpen(run)) {
      // CORRECTED (storage-spine design spec §2, early side — the antagonist
      // pass's own PRIMARY research): this used to be true without
      // exception: "no natural finish of ours is currently waiting on a
      // final interval." It no longer is. §1's keystone capture read the
      // burst BEATING our own terminal transition in 3 of 5 committed
      // finishes (0x0039 at t=172129.5, our terminal at t=172309.3) — the
      // machine has already flipped to WORKOUTLOGGED while this driver
      // still considers the run open, because `maybeEmitFrame` has not yet
      // seen the general-status frame that would tell it so. A 0x0039
      // landing in that exact gap is NOT the re-fire and not a stray
      // out-of-run reading: it is this run's own finish, one notification
      // early instead of late. The one condition that can tell that case
      // apart from an ordinary mid-row 0x0039 is checked first, below.
      if (!run.closed) {
        const lastIndex = run.program.intervals.length - 1;
        const status = raw as RawPm5Status;
        const currentIndex = toProgramIndex(
          status.intervalCount,
          toMonitorFrame(status).state,
          run.program.intervals.length,
        );
        // `currentIndex === lastIndex` is the ONLY signal available here
        // that this run is in its final interval right now — the same
        // computation `maybeEmitFrame` does for `frame.intervalIndex`,
        // read off the same merged `raw`. `lastIndex >= 0` guards the
        // no-intervals program `reconcileSummary` itself guards
        // (unreachable via `compileProgram`'s own no-work check, kept for
        // the same reason that guard is). A single-interval program is
        // ALWAYS in its final interval the instant it opens (§2's own
        // "single-interval blindness" note) — buffering here is bounded
        // either way, since nothing FILES until the natural close this
        // driver eventually observes for itself.
        if (lastIndex >= 0 && currentIndex === lastIndex) {
          log.record(
            "summary-reconciled",
            `buffered — 0x0039 arrived while this run is still open, already reporting its final interval (index ${currentIndex} of ${run.program.intervals.length}); held for this run's own natural close (storage-spine design spec §2, early side)`,
          );
          run.summaryInGrace = summary;
          return;
        }
      } else if (
        run.program.intervals.length - 1 >= 0 &&
        run.recordedActuals.has(run.program.intervals.length - 1) &&
        pendingSummaryReconcile !== null
      ) {
        // FINAL-REVIEW FIX WAVE, HIGH-1: the genuine late side. The run IS
        // closed and `graceIsOpen(run)` is FALSE — not because nothing is
        // pending, but because the final split ALREADY claimed the grace
        // (`emitIntervalComplete` nulls `finishGraceUntil` the instant its
        // own finish-grace boundary lands, ~270ms BEFORE 0x0039 arrives on
        // the wire every time, notes §24 item 1) — while the deferred
        // reconcile has not drained yet (`pendingSummaryReconcile !==
        // null`).
        //
        // NARROWER THAN "reconcile just hasn't drained yet" — deliberately
        // — because `recordedActuals.has(lastIndex)` is required TOO: this
        // is precisely `maybeReconcileImmediately`'s own split-won
        // precondition, checked here before admitting rather than left for
        // it to discover, so admission and "will this actually get used"
        // can never diverge. A summary arriving late on a run whose split
        // is STILL missing does NOT take this branch — it stays
        // `out-of-window`, unchanged, because admitting it here would let
        // a summary racing in one JS tick ahead of the deadline's own
        // callback answer the DERIVE path's question ("did the split fail
        // to arrive before the grace expired?") on the deadline's behalf,
        // which is exactly the premature-consumption failure mode this
        // whole design exists to prevent — `graceIsOpen`/`graceClaimed`
        // still guard that path, entirely undisturbed, because this branch
        // can only ever be reached once the split has ALREADY made the
        // question moot.
        //
        // Once admitted, a summary arriving after the split already won is
        // real data about a run that already has everything else
        // `reconcileSummary`'s split-won branch needs; discarding it as
        // `out-of-window` was the defect.
        log.record(
          "summary-reconciled",
          `buffered — 0x0039 arrived after this run's finish grace already closed (${describeClosedGrace(run)}), but the final split already recorded and its reconcile has not drained yet; held for observations (storage-spine design spec §2, HIGH-1 fix)`,
        );
        run.summaryInGrace = summary;
        maybeReconcileImmediately(run);
        return;
      }
      // TWO LOSS MODES FUNNEL INTO THIS FALLBACK, both losing the burst's
      // observations here (bounded: never worse than before this task) —
      // 0x0033 never having arrived yet for this run (`status.intervalCount`
      // undefined, `toProgramIndex` returns `null`), and the likelier one in
      // practice, a STALE `intervalCount` (defined but still naming a PRIOR
      // interval, `currentIndex !== lastIndex`): the burst's own
      // ~142-449ms window (§1) can sit entirely inside 0x0033's own sample
      // gap. PR 3/F2b's interval-count work is what sharpens this field
      // enough to close that gap.
      // Every OTHER reason lands here and they are all the same answer:
      // no natural finish of ours is currently waiting on a final
      // interval and this run (if any) is not observably in its last one
      // either (the early-side branch above); OR the run IS closed with
      // its split still genuinely missing (the late-side branch above
      // requires the split to already be recorded — deliberately, so a
      // summary cannot answer the DERIVE path's own question on the
      // deadline's behalf); OR the reconcile has already drained, split
      // recorded or not, so there is nothing left to feed. The one that
      // will actually happen at the erg is the re-fire — 0x0039 notifies a
      // SECOND time roughly a minute after the workout ends when an HRM is
      // paired (`pm5-ble-ecosystem-review.md:420-422`), long after any
      // reconcile has drained, and without this branch the stash would
      // show a spurious divergence on every walk with a belt on.
      log.record(
        "summary-reconciled",
        `out-of-window — 0x0039 arrived with no open finish grace (${describeClosedGrace(run)}); nothing filed`,
      );
      return;
    }
    run.summaryInGrace = summary;
    // Review fix round 1, HIGH finding: the LATE side's own immediate
    // trigger — this summary just arrived AFTER our own terminal
    // transition, while the final split had already landed earlier (this
    // function's own `graceIsOpen` branch means the run is closed and the
    // grace has not yet elapsed). If the split is the one still missing,
    // this is a genuine no-op (`maybeReconcileImmediately`'s own guard) —
    // the deadline stays the fallback, unchanged.
    maybeReconcileImmediately(run);
  }

  /**
   * 0x0039's DECODED TOTALS in the stash, with the comparison already set
   * up (final review IMP-1) — the entry that makes a walk able to settle
   * `docs/monitor/pm5-interface-notes.md` §23's walk items 2 and 4 from an
   * ORDINARY row, instead of needing the final split to drop first.
   *
   * It states three numbers and the rule that reads them: 0x0039's own
   * elapsed/distance, what this run has recorded from 0x0037/0x0038 so far,
   * and the program's own rest allowance. On a healthy multi-interval row
   * with rest, every interval is already recorded by the time the summary
   * lands, so the three-way comparison below settles both premises in one
   * read — which is exactly what neither the verdict entries nor a
   * PM5-screen photograph could do on their own.
   *
   * R0 (CR2 spec 1, Task 1) adds the comparison spec 1 exists for: the
   * frame accumulator this driver has emitted (`lastEmittedTotals`,
   * deliberately BROKEN — see that variable's own comment and Task 4) next
   * to 0x0031's own `totalWorkDistanceMeters`/`workoutDurationType`, read
   * off `raw` the same way every other closure function in this file does.
   * Landing the instrumentation on the defect is the point: it makes the
   * before/after of Task 4's fix measurable instead of asserted.
   *
   * Diagnostics only: nothing here decides anything, and the numbers are
   * reported, never reconciled. `deriveFinalIntervalFromSummary` remains
   * the only place either premise is USED.
   */
  function logSummaryTotals(
    summary: WorkoutSummary,
    run: typeof activeRun,
  ): void {
    const recorded = [...(run?.recordedActuals.values() ?? [])];
    const recordedElapsed = recorded.reduce((a, r) => a + r.elapsedSeconds, 0);
    const recordedMeters = recorded.reduce((a, r) => a + r.distanceMeters, 0);
    const programmedRest =
      run?.program.intervals.reduce((t, i) => t + i.restSeconds, 0) ?? 0;
    const against =
      run === null
        ? "no run of ours is open, so there is nothing here to compare these totals against"
        : `this run has recorded ${recorded.length} interval(s) totalling ${recordedElapsed}s/${recordedMeters}m from 0x0037/0x0038, over a program with ${programmedRest}s of rest`;
    log.record(
      "summary-totals",
      `0x0039 decoded: elapsed=${summary.elapsedSeconds}s distance=${summary.meters}m ` +
        `workoutType=${summary.workoutType} | accumulator=${lastEmittedTotals.distanceMeters}m ` +
        `accumulatorElapsed=${lastEmittedTotals.elapsedSeconds}s ` +
        `machineTotal=${raw.totalWorkDistanceMeters ?? "?"}m ` +
        `durationType=${raw.workoutDurationType ?? "?"} (${against}). ` +
        `§23 walk items 2 and 4 settle HERE, by comparing the two elapsed figures: equal = cumulative AND rest-exclusive, both premises hold; equal to the recorded total plus ${programmedRest}s = item 4 mismatch (0x0039 counts rest, 0x0037 does not); equal to the LAST interval's own elapsed alone = item 2 false (0x0039 is per-interval, not cumulative)`,
    );

    // THE INTERVAL-COUNT DIVERGENCE (CR2 spec 1, Task 5). The finish is the
    // one moment `session`'s own HONEST LIMIT (its own doc comment) can be
    // checked against ground truth: how many of the ARMED program's
    // intervals actually produced a frame, versus how many the program
    // declares. An interval that produced zero frames writes no key
    // (`maybeEmitFrame`'s register write) and is missing from
    // `sessionDistanceMeters`/`sessionElapsedSeconds` with nothing on
    // screen to say so — this is the entry that says so, at the one point
    // in the run's life where the true denominator (`programIntervals`) is
    // known and stable. Gated on a program actually being armed (`run`
    // non-null and non-empty), same reason every other program-shaped
    // divergence in this file is: with none, there is no denominator to
    // diverge from.
    const programIntervals = run?.program.intervals.length ?? 0;
    if (programIntervals > 0 && session.seen.size !== programIntervals) {
      log.record(
        "divergence",
        `${session.seen.size} intervals seen of ${programIntervals} programmed — ` +
          `the session total is missing any interval that produced no frames ` +
          `(bounded loss, CR2 spec 1). Keys seen: ${[...session.seen.keys()].join(",")}`,
      );
    }

    // The accumulator-vs-machine VERDICT used to live here too, and the
    // re-walk's first row proved ITS TIMING wrong (2026-08-15, seq 36): the
    // 0x0039 can arrive BEFORE the machine's own totalWorkDistanceMeters
    // has ticked past the previous interval's value — it fired "differ by
    // 183.8m" one tick before TWD settled at 367 against an accumulator of
    // 367.8. Moving it to the terminal transition fixed the timing, but not
    // the premise: RC-9c retired the verdict outright (design spec
    // 2026-08-25-free-oracles §2) — 0x0031's Total Work Distance is an
    // odometer of metres genuinely rowed, work plus rest coast, the same
    // quantity our own accumulator sums, so a green comparison certified
    // nothing about the stored row. The unconditional print above stays:
    // raw numbers at 0x0039-time are evidence; a verdict comparing two
    // mirrors of the same number is not.
  }

  /** THE `final-totals` ENTRY, ONE BUILDER FOR BOTH TRIGGERS (Task 7, "one
   *  terminal path"). Two call sites need the identical shape and must
   *  never drift apart:
   *  - `maybeEmitFrame`'s own terminal branch, at the machine's OWN
   *    finished/terminated status frame — the ordinary path (James's walk
   *    protocol change, 2026-08-15, that entry's own doc comment carries
   *    the full reasoning for writing these into the ring at all).
   *  - `terminate()`, at TERMINATE-DISPATCH time. The END/cancel path's
   *    own terminated status frame routinely arrives AFTER teardown has
   *    already stashed and hung up the radio (spec 1's re-walk: "the ring
   *    ended at the terminate write") — waiting for that frame here would
   *    lose the entry the exact same way it did before this task, so the
   *    caller-initiated ending writes it itself, from whatever this run
   *    has accumulated so far.
   *
   *  GUARDED AT ONLY ONE OF THE TWO CALL SITES (I-2, final whole-branch
   *  review — this doc comment used to claim both, which was false).
   *  `terminate()`'s own call is the guarded one: `if (activeRun !== null
   *  && !activeRun.closed)`. The `maybeEmitFrame` terminal branch above has
   *  NO guard of its own — it reaches this call unconditionally once
   *  `runIsOpen()` has let it into that branch, having just set
   *  `activeRun.closed = true` two lines earlier in THIS pass, not in a
   *  prior one.
   *
   *  The gap this leaves: `terminate()` (the END/cancel path) never sets
   *  `activeRun.closed` itself — only the machine-frame branch does. So
   *  END-then-the-machine's-own-terminal-frame is a real double-write: (1)
   *  `terminate()` fires, sees `!activeRun.closed`, writes `final-totals`,
   *  and returns without closing the run; (2) the machine's own
   *  finished/terminated status frame arrives shortly after (the ordinary
   *  shape once END has already sent Terminate), `runIsOpen()` is still
   *  true, so this branch sets `closed = true` and calls
   *  `recordFinalTotals` a SECOND time for the same run, unguarded — two
   *  near-identical `final-totals` entries in the ring. Empirically
   *  reproduced (Task 7 review, progress.md's own CARRY line: "END +
   *  machine-frame-arrives writes TWO identical final-totals entries...
   *  diagnostic-only, no consumer"). DIAGNOSTIC-ONLY: nothing reads this
   *  ring entry programmatically, only a human auditing a walk's log — nothing
   *  computational disagrees with itself. Dedupe stays DEFERRED, per that
   *  same ledger line ("fast-follow: assert 2-ok or dedupe") — not fixed by
   *  this task, which corrects the comment's claim, not the mechanism. */
  function recordFinalTotals(run: NonNullable<typeof activeRun>): void {
    const n = (v: number): number => Number(v.toFixed(1));
    const regs = [...session.seen.entries()]
      .sort(([a], [b]) => a - b)
      .map(([k, r]) => `${k}:(${n(r.elapsedSeconds)}s,${n(r.distanceMeters)}m)`)
      .join(" ");
    const programmed = run.program.intervals.length;
    log.record(
      "final-totals",
      `accumulator=${n(lastEmittedTotals.distanceMeters)}m ` +
        `accumulatorElapsed=${n(lastEmittedTotals.elapsedSeconds)}s ` +
        `machineTotal=${raw.totalWorkDistanceMeters ?? "?"}m ` +
        `durationType=${raw.workoutDurationType ?? "?"} ` +
        `registers=${session.seen.size} of ${programmed} programmed ${regs}`,
    );
  }

  /** THE LIVE AVERAGE-PACE VERDICT (RC-9a, design spec
   *  2026-08-25-free-oracles §1) — the accumulator-vs-machine verdict
   *  `recordTwdVerdict` used to be (RC-9c retired that one, see this file's
   *  own comment above), but genuinely independent this time: 0x0032's
   *  `averageSplit` is the machine's OWN cumulative, WORK-ONLY 500 m pace
   *  (evidence base, all seven captures: tracks `500·ΣT_work/ΣD_work` to a
   *  median 0.07-0.20 s, freezes solid through rest, never resets at a
   *  boundary) — the SAME quantity the Concept2 logbook stores for an
   *  interval workout ("distance/time are work-only", PRIMARY) and the
   *  same our own `monitorAvgSplit` (`src/session/summaryModel.ts`)
   *  computes, off a DIFFERENT characteristic (0x0032 there is 0x0037/38's
   *  own boundary sums here) — two genuinely independent computers of one
   *  authority-defined quantity, unlike the retired TWD verdict where both
   *  sides were the identical fused work+rest odometer.
   *
   *  NEVER compared against the rendered tier-A hero: post-RC-5 that hero
   *  IS 0x0039's own `avgPaceSecondsPer500m` field (0.1 s/lsb — A
   *  DIFFERENT CHARACTERISTIC), and the one capture carrying both reads
   *  138.7 there against 138.44/138.23 here — a 0.47 s spread the evidence
   *  base already explains as machine-vs-machine, not a defect. This
   *  verdict's "our side" is always `run.recordedActuals`'s own weighted
   *  quotient, which exists on every run regardless of whether a 0x0039
   *  ever arrives.
   *
   *  SCALE (stated here AND at `lastWorkStateAverageSplit`'s own
   *  declaration, per the Global Constraints rule to name both scales
   *  wherever either appears): 0x0032's `averageSplit` is 0.01 s/lsb;
   *  0x0039's Avg Pace (never read by this function) is 0.1 s/lsb — both
   *  already descaled to SECONDS by `parse.ts` before either reaches this
   *  driver. Everything below compares descaled seconds only.
   *
   *  SUPPRESSED (with the reason in the ring entry) when:
   *   - no qualifying 0x0032 sample was ever observed this run
   *     (`lastWorkStateAverageSplit === null`) — nothing to compare against;
   *   - the final interval was filled from 0x0039
   *     (`run.finalFilledFromSummary`) — `deriveFinalIntervalFromSummary`
   *     builds OUR side FROM the machine's own summary, so the comparison
   *     would be tautological in exactly the case it exists to catch;
   *   - an actual this run saw could not be attributed to a program
   *     interval and never reached `recordedActuals` at all
   *     (`emitIntervalComplete`'s own "only if `normalizedIndex !== null`"
   *     gate) — detected as `run.actuals` counting more emitted boundaries
   *     than `recordedActuals` holds, the live analogue of
   *     `monitorAvgSplit`'s `index === null` exclusion (that function
   *     reads a PERSISTED `IntervalActual[]` where a null-index entry
   *     still exists to be filtered; this driver's live `recordedActuals`
   *     Map is keyed by index and structurally never holds one, so the
   *     population-count mismatch is the honest live equivalent) — this
   *     check alone is NOT sufficient (fix round 1): a mid-work
   *     `terminated` close loses its own final, still-in-progress
   *     interval WITHOUT incrementing `run.actuals` at all
   *     (`emitIntervalComplete`'s out-of-run branch returns before either
   *     counter moves), so the next check below is required too;
   *   - this run's own FINAL program interval (`program.intervals.length
   *     - 1`) was never recorded in `recordedActuals` — covers the
   *     mid-work-terminate shape the check above cannot see, and the
   *     natural-finish shape where neither a split nor a summary ever
   *     arrived (`reconcileSummary`'s "declined ... still missing"
   *     branch, run.actuals never incremented for that index either);
   *   - a recorded actual measured below `MIN_MEASURABLE_ELAPSED_SECONDS`
   *     — mirrors `monitorAvgSplit`'s identical exclusion. (No live
   *     analogue of that function's THIRD exclusion, a legacy warm-up
   *     interval: post-Phase-WU `compileProgram` never produces one, so no
   *     run this driver opens can carry it — nothing to check.)
   *   - nothing this run recorded measures any distance at all (Σd = 0).
   *
   *  BAND: `AVG_PACE_VERDICT_BAND_SECONDS`'s own comment. */
  function recordAvgPaceVerdict(run: NonNullable<typeof activeRun>): void {
    if (lastWorkStateAverageSplit === null) {
      log.record(
        "avg-pace-verdict",
        "suppressed — no work-state (0x0032) averageSplit observed this run",
      );
      return;
    }
    if (run.finalFilledFromSummary) {
      log.record(
        "avg-pace-verdict",
        "suppressed — the final interval was filled from 0x0039 " +
          "(deriveFinalIntervalFromSummary fired); our own quotient would " +
          "be built partly FROM the machine's summary, so the comparison " +
          "is tautological",
      );
      return;
    }
    // FIX ROUND 1 (review, minor): this comparison can also over-suppress
    // — TWO boundaries landing on the SAME normalized index (a duplicate
    // Split/Interval Number, the `recordedActuals.set` overwrite) reads
    // identically to one lost to a null index (`actuals` counts both,
    // `recordedActuals.size` counts the index once), so a genuinely sound
    // run could suppress here too. Left as is: the safe direction — a
    // false suppression costs a missing walk-log line, never a false
    // DIFFER/agree — and a duplicate index has no committed capture either.
    if (run.actuals > run.recordedActuals.size) {
      log.record(
        "avg-pace-verdict",
        `suppressed — an actual this run saw could not be attributed to a ` +
          `program interval (${run.actuals} actual(s) emitted, only ` +
          `${run.recordedActuals.size} indexed) and is excluded from our ` +
          `own quotient`,
      );
      return;
    }
    // FIX ROUND 1 (review): a mid-work `terminated` close has NO capture
    // evidence in this repo (no committed capture ends in workoutState 11)
    // and a KNOWN false-DIFFER shape the check above cannot see. On a
    // terminate mid-interval, the still-in-progress interval's own boundary
    // (if it arrives at all) takes `emitIntervalComplete`'s OUT-OF-RUN
    // branch (the run already closed, and a `terminated` close opens no
    // grace to route it through instead) — which returns BEFORE either
    // `run.actuals` or `run.recordedActuals` is touched (that branch's own
    // comment: "a closed run's actuals can therefore never grow THIS WAY").
    // So `run.actuals` and `run.recordedActuals.size` stay EQUAL — the
    // check above sees nothing wrong — while 0x0032's cumulative average
    // has already kept counting the rower's real, unrecorded strokes. A
    // DIFFERENT, ALREADY-AVOIDED version of this same false-DIFFER shape is
    // why this verdict is called at all after `reconcileSummary` on the
    // `finished` path rather than synchronously at the terminal transition
    // (this function's own doc comment, "NEVER compared against..." —
    // review-verified against `session-2-wu-4unequal.jsonl`: sampling
    // synchronously at that capture's own terminal frame would compare the
    // correct machine reading, 129.78, against an INCOMPLETE 4-boundary
    // quotient of 131.16 — the 5th interval's own split lands ~83ms later
    // — a 1.38s gap past the 1.0s band). This guard is the general form of
    // the same underlying shape for the case that placement fix does NOT
    // cover: whenever this run's own FINAL program interval was never
    // recorded at all — a mid-work terminate, or a natural finish whose
    // split AND summary both genuinely never arrived
    // (`reconcileSummary`'s own "declined ... still missing" branch) — our
    // quotient is missing an unknown amount of real work the machine's own
    // average already counts, and no amount of correct TIMING fixes that;
    // the population itself is short.
    if (!run.recordedActuals.has(run.program.intervals.length - 1)) {
      log.record(
        "avg-pace-verdict",
        `suppressed — this run's own final interval (index ` +
          `${run.program.intervals.length - 1}) was never recorded; the ` +
          `machine's cumulative average may already include work ours has ` +
          `no record of (mid-work terminate is the ordinary way this ` +
          `happens — its boundary, if any, is discarded out-of-run and ` +
          `touches neither run.actuals nor recordedActuals)`,
      );
      return;
    }
    let excludedSubThreshold = false;
    let workSeconds = 0;
    let workMeters = 0;
    for (const actual of run.recordedActuals.values()) {
      if (actual.elapsedSeconds < MIN_MEASURABLE_ELAPSED_SECONDS) {
        excludedSubThreshold = true;
        continue;
      }
      workSeconds += actual.elapsedSeconds;
      workMeters += actual.distanceMeters;
    }
    if (excludedSubThreshold) {
      log.record(
        "avg-pace-verdict",
        `suppressed — a recorded actual measured under ` +
          `${MIN_MEASURABLE_ELAPSED_SECONDS}s and is excluded from our own ` +
          `quotient (mirrors summaryModel.ts's monitorAvgSplit rule)`,
      );
      return;
    }
    if (workMeters <= 0) {
      log.record(
        "avg-pace-verdict",
        "suppressed — nothing measured this run (Σd = 0)",
      );
      return;
    }
    const ours = (500 * workSeconds) / workMeters;
    const delta = Math.abs(lastWorkStateAverageSplit - ours);
    const agrees = delta <= AVG_PACE_VERDICT_BAND_SECONDS;
    log.record(
      "avg-pace-verdict",
      `machine(0x0032)=${lastWorkStateAverageSplit.toFixed(2)}s/500m ` +
        `ours=${ours.toFixed(2)}s/500m delta=${delta.toFixed(2)}s — ` +
        `${agrees ? "agree" : "DIFFER"} (band ${AVG_PACE_VERDICT_BAND_SECONDS.toFixed(1)}s)`,
    );
  }

  /** THE REST-DISTANCE ORACLE (RC-9d, design spec 2026-08-25-free-oracles
   *  §3) — the first external check on the rest population RC-1 just
   *  started storing and RC-10 must POST; nothing external checks it
   *  today. Compares 0x003A's own Total Rest Distance (a RUNNING TOTAL
   *  across the whole workout) against Σ `restDistanceMeters` over this
   *  run's own `recordedActuals` (0x0037's own per-interval trailing-rest
   *  reading, RC-1).
   *
   *  **FIX ROUND 2 (whole-branch review) CORRECTED this paragraph's own
   *  claim.** It used to say this comparison is safe because it is "two
   *  genuinely independent computers of the identical quantity, unlike the
   *  retired TWD verdict" — WRONG, and the review named it as the wrong
   *  reason to ship: structurally this IS the same shape TWD had
   *  (machine-total-on-one-side vs sum-of-machine-parts-on-the-other,
   *  0x003A's own running total against a sum of 0x0037's own per-interval
   *  fields — both sides ultimately wire-derived, exactly like TWD's own
   *  accumulator-vs-TWD comparison was). What actually saves this verdict
   *  from being a mirror is the QUANTITY, not the computation shape: rest
   *  distance is a field the AUTHORITY (Concept2's own logbook) stores
   *  SEPARATELY from work distance — RC-1's storage spine exists because
   *  RC-10 must POST `rest_distance`/`rest_time` as their own fields — so
   *  this verdict checks a number the authority actually DEFINES, unlike
   *  TWD's fused work+rest sum, which the evidence base found no external
   *  system stores or verifies at all ("Concept2's logbook — the actual
   *  authority for what the row was — stores work only").
   *
   *  ALL-OR-NOTHING, via `restPairComplete` (own doc comment, above,
   *  carries the fix-round-1 history): summed only when every recorded
   *  actual carries BOTH `restSeconds` AND `restDistanceMeters` — the SAME
   *  pair `monitorRun.ts`'s own `computeWorkRestSums` requires for the
   *  STORED record (RC-1, identical reason). A run whose final interval
   *  fell back to the summary synthesis (`deriveFinalIntervalFromSummary`'s
   *  caller OMITS both rest fields — 0x0039 carries no per-interval rest of
   *  its own) suppresses rather than silently reading that missing
   *  interval's rest as a real zero.
   *
   *  **FIX ROUND 2, the Important finding:** `restPairComplete` only
   *  checks entries that ARE present in `recordedActuals` — it says
   *  nothing about whether the run's own FINAL interval is present AT
   *  ALL. This function runs SYNCHRONOUSLY from 0x003A's own subscribe
   *  callback, which arrives ~1ms after 0x0039 on the committed captures
   *  (walk-2026-08-23 seq 516/517) — well before `reconcileSummary`'s
   *  3000ms grace deadline could ever fire the summary-fallback synthesis,
   *  and racing the SAME late final-split notification the finish grace
   *  exists to catch (hardware walk 5: the PM5 sends the final interval's
   *  0x0037/0x0038 pair AFTER the "finished" status frame, not before).
   *  The exit-7 capture's own race went the SAFE way this one time (final
   *  split accepted at seq 58, 0x003A only at seq 63) — but 161 of 300
   *  seeded workouts compile with a trailing rest on their own final
   *  interval (`domain/monitor/program.ts:281-286`), and nothing pins the
   *  race outcome the other way: had 0x003A arrived first, this verdict
   *  would have summed only the SURVIVING (non-final) actuals — DIFFER,
   *  on a perfectly healthy run, the first external check on the RC-1
   *  rest population crying wolf on the exact walk it exists to validate.
   *  Fixed with the SAME population-completeness guard `recordAvgPaceVerdict`
   *  needed for the identical class of bug (that function's own
   *  `!run.recordedActuals.has(run.program.intervals.length - 1)` check,
   *  own comment carries the full fix-round-1 history) — chosen over
   *  DEFERRING this verdict's own call site the way (a) defers (waiting on
   *  `reconcileSummary`'s outcome): deferring would need buffering the
   *  decoded 0x003A payload across up to 3000ms and re-firing from (a)'s
   *  own two call sites, a real structural change to a ring-only
   *  diagnostic; the guard is a two-line, purely-additive fix with the
   *  SAME safety property (a)'s own fix-round-1 comment already accepted
   *  for this exact tradeoff: "a false suppression costs a missing
   *  walk-log line, never a false DIFFER/agree."
   *
   *  ZERO IS A REAL VALUE, never a suppression trigger (evidence base: the
   *  r0 keystone capture decodes 0 and a genuinely rest-free run's own sum
   *  is 0 too — an r0 piece has no rest, and the verdict must agree on
   *  that, not read it as "nothing to compare").
   *
   *  `Interval Rest Time` (offsets 15-16) is REPORTED in every entry this
   *  function writes, but NEVER GATES anything here: it reads 0 on BOTH
   *  committed captures, including the exit-7 walk's own genuine r60
   *  rests, so whether that is a firmware quirk of this specific field or
   *  the programmed value read back is UNKNOWN (`AdditionalSummaryRest`'s
   *  own doc comment, `pm5/parse.ts`) — asserting either would be a guess
   *  this driver has no evidence for.
   *
   *  BAND: `REST_DISTANCE_VERDICT_BAND_METERS`'s own comment. */
  function recordRestDistanceVerdict(bytes: Uint8Array): void {
    const decoded = parseAdditionalSummaryRest(bytes);
    if (decoded === null) {
      log.record(
        "rest-distance-verdict",
        `suppressed — 0x003A arrived with ${bytes.length} byte(s), fewer ` +
          `than the 17 this narrow parser requires (offsets 12-16)`,
      );
      return;
    }
    const run = activeRun;
    if (run === null || run.recordedActuals.size === 0) {
      log.record(
        "rest-distance-verdict",
        `reported only — Interval Rest Time=${decoded.intervalRestSeconds}s; ` +
          `distance suppressed — no run's actuals to compare against ` +
          `(0x003A arrived with none recorded)`,
      );
      return;
    }
    // FIX ROUND 2 (whole-branch review, Important): the guard `(a)`'s own
    // fix-round-1 needed for the identical class of bug — this function's
    // own doc comment above carries the full evidence and reasoning.
    if (!run.recordedActuals.has(run.program.intervals.length - 1)) {
      log.record(
        "rest-distance-verdict",
        `reported only — Interval Rest Time=${decoded.intervalRestSeconds}s; ` +
          `distance suppressed — this run's own final interval (index ` +
          `${run.program.intervals.length - 1}) was not yet recorded when ` +
          `0x003A arrived; 0x003A can race ahead of a late-arriving final ` +
          `split (the finish grace's own late side — see this function's ` +
          `own doc comment), and a mid-work terminate or a genuinely lost ` +
          `split produce the identical shape`,
      );
      return;
    }
    const actuals = [...run.recordedActuals.values()];
    if (!restPairComplete(actuals)) {
      log.record(
        "rest-distance-verdict",
        `reported only — Interval Rest Time=${decoded.intervalRestSeconds}s; ` +
          `distance suppressed — an actual this run recorded is missing ` +
          `restSeconds and/or restDistanceMeters (the summary-fallback ` +
          `synthesis path omits both; 0x0039 carries no per-interval rest)`,
      );
      return;
    }
    const ours = actuals.reduce(
      (sum, a) => sum + (a.restDistanceMeters ?? 0),
      0,
    );
    const delta = Math.abs(decoded.totalRestDistanceMeters - ours);
    const agrees = delta <= REST_DISTANCE_VERDICT_BAND_METERS;
    log.record(
      "rest-distance-verdict",
      `machine(0x003A)=${decoded.totalRestDistanceMeters}m ours=${ours}m ` +
        `delta=${delta}m — ${agrees ? "agree" : "DIFFER"} ` +
        `(band ${REST_DISTANCE_VERDICT_BAND_METERS}m); ` +
        `Interval Rest Time=${decoded.intervalRestSeconds}s (reported only ` +
        `— reads 0 on both committed captures including a real r60, so ` +
        `firmware-quirk-vs-programmed-value is unresolved; never gated on)`,
    );
  }

  /** WHY the summary gate was shut when a 0x0039 turned up — four genuinely
   *  different situations that a single "out of window" would flatten into
   *  one unreadable entry. The last three are the ones a walk has to tell
   *  apart, and they are genuinely distinguishable here (fix round 1,
   *  review Minor-2 — an earlier version collapsed the middle two into one
   *  disjunction, because both leave `finishGraceUntil === null`, and
   *  `graceClaimed` exists to separate them): a grace a boundary already
   *  CLAIMED (the split won, and the summary is redundant), a run that
   *  ended by TERMINATE (no grace was ever opened), and a grace that
   *  EXPIRED — the ~1-minute HRM re-fire, or a summary that took longer
   *  than 3 s to arrive, which would be a real finding. */
  function describeClosedGrace(run: NonNullable<typeof activeRun>): string {
    if (!run.closed) return "the run is still open — no finish has happened";
    if (run.graceClaimed) {
      return "a boundary has already claimed this run's grace — the final interval is recorded and this summary is redundant";
    }
    if (run.finishGraceUntil === null) {
      return "this run ended by terminate, which opens no grace at all (CSAFE-DEF footnote 12)";
    }
    return `the grace expired ${now() - run.finishGraceUntil}ms ago (${FINISH_GRACE_MS}ms window) — the ~1 minute HRM re-fire lands here`;
  }

  /**
   * Schedules the summary gate's reconcile for the instant the finish grace
   * closes (fast-follow Task 2, design spec §5). `FINISH_GRACE_MS` (the
   * default `ms`) is the delay for a reason that is not convenience: the
   * reconcile's question is "did the split fail to arrive before the grace
   * expired?", so it must ask at exactly the moment the grace stopped
   * accepting one — a shorter delay would answer while a split could still
   * legitimately land, and a longer one would answer after the hand-off
   * hold released (`useMonitorSession.ts`'s `FINISH_HANDOFF_HOLD_MS`, the
   * coupled constant this ordering depends on).
   *
   * **`ms` IS THE ONE-DEADLINE SLOT'S OWN PARAMETER, not a second timer**
   * (final-review fix wave, HIGH-2): `maybeReconcileImmediately` re-arms
   * THIS function with `HASH_SUBWINDOW_MS` when split and summary are both
   * in hand but the verification hash is not — same cancel-then-schedule
   * body, same single `pendingSummaryReconcile` slot, same
   * `activeRun !== run` guard on fire. The two calls this function ever
   * receives (the natural-finish branch's own `FINISH_GRACE_MS`, and
   * `maybeReconcileImmediately`'s narrower `HASH_SUBWINDOW_MS`) can never
   * both be pending at once, because arming either one cancels whatever
   * was armed before it.
   *
   * NATURAL-FINISH-ONLY is enforced at THIS call site — the one call from
   * `maybeEmitFrame` is inside the `frame.state === "finished"` branch,
   * itself behind `if (!runIsOpen()) return`, so the FIRST arming happens
   * at most once per run and never on a terminate (test (f) pins it). One
   * residual path exists and is CORRECT, not a defect (fix round 1, the
   * reviewer's own ruling): a natural finish, a summary held, and then a
   * `terminated` arriving inside the 3 s (the rower presses Menu, or the
   * caller issues `terminate()`). Nothing cancels, and the fill happens at
   * the deadline — rightly so. The finish was real, the evidence arrived
   * inside its own grace, and a later terminate says nothing about a
   * workout that already ended naturally. No guard is wanted here; this
   * paragraph exists so the next reader does not have to re-derive that.
   */
  function armSummaryReconcile(
    run: NonNullable<typeof activeRun>,
    ms: number = FINISH_GRACE_MS,
  ): void {
    pendingSummaryReconcile?.();
    pendingSummaryReconcile = schedule(() => {
      pendingSummaryReconcile = null;
      // The run this deadline was armed FOR, captured — never `activeRun`
      // as it stands when the timer fires. A `program()` that landed in
      // between cancels this timer outright (see its call site), and this
      // guard is the belt to that braces: a deadline may only ever speak
      // about its own workout.
      if (activeRun !== run) return;
      reconcileSummary(run);
      // RC-9a: called HERE, not at the terminal transition — by the time
      // `reconcileSummary` returns, this run's finish grace has fully
      // resolved (a late split recorded ordinarily, the summary fill, or
      // neither), so `recordedActuals`/`finalFilledFromSummary` are as
      // final as they will ever get. Placed inline rather than the
      // terminal-transition call site the retired TWD verdict used,
      // because THIS verdict (unlike that synchronous wire read) depends
      // on evidence that can still be in flight when the terminal frame
      // itself arrives.
      recordAvgPaceVerdict(run);
    }, ms);
  }

  /** THE F7 RULE, AS ITS OWN FUNCTION (Task 7, "one terminal path" — this
   *  used to be inline, only inside `t.onDisconnect`'s callback below,
   *  whose own doc comment still carries the full reasoning for why a
   *  still-pending deadline is DRAINED rather than merely cancelled: the
   *  radio going away only costs the run its ability to WAIT for more wire
   *  evidence, never a verdict already reachable from evidence already in
   *  hand, and a synchronous reconcile always lands inside the hand-off
   *  hold because that hold is strictly the longer of the two coupled
   *  windows.
   *
   *  THE TWIN THIS TASK GIVES A SECOND CALL SITE TO FIX: `disconnect()`
   *  below used to apply a DIFFERENT rule for the exact same situation —
   *  a caller-initiated hang-up just cancelled the deadline and threw the
   *  verdict away, because `Transport.onDisconnect`'s own contract
   *  (`domain/monitor/types.ts`) is explicit that a caller-initiated
   *  `disconnect()` never fires it (`webBluetooth.ts`'s own guard against
   *  double-firing, M-2), so this callback was never going to run for
   *  that path on its own. `disconnect()` and the hook's new `reconcile()`
   *  method (`MonitorDriver.reconcile`) both call this function now, so a
   *  reconcile-eligible verdict gets the SAME answer whichever way the
   *  link ends. Idempotent by construction: a second call after
   *  `pendingSummaryReconcile` is already `null` is a no-op, so calling it
   *  from more than one of those three sites in the same teardown costs
   *  nothing. */
  function drainSummaryReconcile(): void {
    // The terminate path's own pending emit drains here too (summary-record
    // design spec §1). Same rule as the sentence above, applied to the
    // other slot: the link going away costs this run its ability to WAIT
    // for 0x003F, never the observations it already holds. Without this, a
    // terminate whose 0x003F never comes would have its 0x0039 stranded
    // behind a `HASH_SUBWINDOW_MS` timer that fires after the hook has
    // unsubscribed — the burst heard and then thrown away, which is the
    // whole defect this spec exists to fix, one layer further in. First,
    // because the emit reaches the record and the reconcile below can only
    // ever concern a DIFFERENT run's shape (the two are mutually exclusive
    // — `terminatedAwaitingSummary`'s own doc comment).
    flushTerminateObservations();
    if (pendingSummaryReconcile !== null) {
      pendingSummaryReconcile();
      pendingSummaryReconcile = null;
      // `armSummaryReconcile` is armed from exactly one call site (the
      // `finished` branch in `maybeEmitFrame`, immediately after
      // `activeRun!.closed = true`), and `program()`'s own replacement
      // path cancels this same field before a new run ever opens — so a
      // deadline still pending here can only name the CURRENT `activeRun`,
      // closed and non-null.
      if (activeRun !== null) {
        reconcileSummary(activeRun);
        // RC-9a: the same pairing `armSummaryReconcile`'s own scheduled
        // callback makes (its own comment) — this is the SECOND of the two
        // places `reconcileSummary` is ever called, and this verdict must
        // follow it here too, or a drained run (disconnect, the hook's
        // `reconcile()`) would never get one at all.
        recordAvgPaceVerdict(activeRun);
      }
    }
  }

  /**
   * FIRES THE MOMENT THIS RUN'S EVIDENCE IS ACTUALLY COMPLETE, rather than
   * always waiting out `FINISH_GRACE_MS` on a run that already has
   * everything `reconcileSummary`'s split-won branch needs (task-3 review
   * fix round 1, HIGH finding). `useMonitorSession.ts`'s `BURST_LINGER_MS`
   * is 2000ms — strictly SHORTER than `FINISH_GRACE_MS`'s 3000ms — so
   * before this fix a burst landing at, say, 400ms after the terminal was
   * unreachable by anything but the hook's own linger cap force-draining
   * at 2000ms: the "burst completion" early exit that cap exists to allow
   * could never fire on real timing, because nothing between 0ms and
   * 3000ms ever called `reconcileSummary` early. This closes that gap AT
   * THE SOURCE.
   *
   * "Complete" means the split-won branch's own precondition — the final
   * interval's actual is recorded (`recordedActuals.has(lastIndex)`) AND a
   * summary is currently held (`summaryInGrace !== null`) — and NEVER fires
   * on the summary-alone shape (a split still possibly in flight, within
   * grace): firing then would reproduce the exact bug this whole design
   * exists to fix, consuming the deadline before evidence that is still
   * legitimately on its way has a chance to arrive. That shape keeps
   * waiting for `FINISH_GRACE_MS`, unchanged — the deadline remains the
   * fallback for genuinely incomplete inputs (the no-split path
   * `deriveFinalIntervalFromSummary` serves, never observed at a real erg
   * per §1, but kept).
   *
   * **THE HASH IS PART OF "COMPLETE" TOO (final-review fix wave, HIGH-2)**
   * — split + summary alone used to drain right here, building the
   * `summary-observations` event with `verificationBytes` omitted
   * (write-once makes that loss permanent), and the hook's own early exit
   * would then disconnect ~38ms before 0x003F — the ONE measured gap,
   * pm5-interface-notes.md §24 item 1 — ever arrived. Split + summary
   * complete but `verificationBytes === null` no longer drains: it
   * RE-ARMS the same one-deadline slot to `HASH_SUBWINDOW_MS`
   * (`armSummaryReconcile`'s own cancel-then-schedule discipline, reused
   * rather than duplicated), draining unconditionally when THAT elapses —
   * hash or not, so firmware that never sends 0x003F still finishes
   * promptly rather than riding `BURST_LINGER_MS`'s full 2s. The
   * `LOGGED_WORKOUT_UUID` subscriber calls this SAME function again on
   * 0x003F's own arrival, which this time finds `verificationBytes !==
   * null` and drains immediately, cancelling the sub-window before it
   * ever fires.
   *
   * `drainSummaryReconcile` is the mechanism for the drain half, not a
   * duplicate of its logic: it is already idempotent (Task 7's own F7
   * rule — a no-op once `pendingSummaryReconcile` is `null`) and already
   * cancels the real timer before calling `reconcileSummary`, so calling
   * this from more than one of ITS four production call sites below costs
   * nothing on a run that settles the other way, and guarantees
   * `reconcileSummary` still runs AT MOST ONCE per run whichever site
   * fires it.
   */
  function maybeReconcileImmediately(run: NonNullable<typeof activeRun>): void {
    const lastIndex = run.program.intervals.length - 1;
    if (lastIndex < 0) return;
    if (!run.recordedActuals.has(lastIndex)) return;
    if (run.summaryInGrace === null) return;
    if (run.verificationBytes === null) {
      armSummaryReconcile(run, HASH_SUBWINDOW_MS);
      return;
    }
    drainSummaryReconcile();
  }

  /**
   * DERIVATION, AND ITS TWO PREMISES (design spec §5's B3 ruling).
   *
   * **BOTH PREMISES ARE NOW SETTLED ON THE WIRE (RC-12, Phase RC
   * close-out).** This comment described them as unobserved for as long as
   * every committed 0x0039 came off a zero-rest piece. That stopped being
   * true on 2026-08-25, and the reconciliation lives in
   * `docs/monitor/pm5-interface-notes.md` §27.1, which supersedes §23's
   * walk items 2 and 4.
   *
   * **PREMISE 1: 0x0039's Elapsed Time and Distance are WHOLE-WORKOUT
   * CUMULATIVE totals — HELD.**
   * `walk-2026-08-25/rests-finished-recording.jsonl.gz`'s 0x0039 reads
   * 254.8 s / 935 m against three recorded intervals summing to exactly
   * 254.8 s / 935 m — cumulative, not the last interval's own — and
   * `walk-2026-08-28/rest-boundary-recording.jsonl.gz` reproduces the
   * shape (60 s / 198 m against one recorded interval). Pinned by
   * `oracleCorpusReplay.test.ts`'s RC-9(b) block, which decodes 0x0039
   * straight off the capture's bytes and compares it against the actuals
   * this driver assembled from 0x0037/0x0038. The parser's own field names
   * stay neutral (`elapsedSeconds`/`meters`, not `total*`): renaming them
   * is a larger change than this reconciliation, and cautious names cost
   * nothing.
   *
   * **PREMISE 2: 0x0039's totals and 0x0037's per-interval values MEASURE
   * THE SAME SPAN with respect to REST — HELD, and both are WORK-ONLY.**
   * The subtraction below is `summary_total − Σ(recorded per-interval
   * values)`, which is only arithmetic if both sides treat each interval's
   * trailing rest the same way. The same capture settles it: its program
   * carried 120 s of programmed rest and 0x0039 excludes every second of
   * it (a rest-inclusive reading would have read 374.8 s). §27.2 closes
   * the loop from the other side — 935 m of work plus 0x003A's own 274 m
   * of rest is exactly the 1209 m Total Work Distance the same stream
   * reported.
   *
   * **WHY PREMISE 2 WAS THE MORE DANGEROUS OF THE TWO**, kept because it
   * is why the guard below is shaped as it is, and because it would matter
   * again on firmware that answers differently. Premise 1 fails LOUDLY:
   * under a per-interval reading the summary carries the last interval's
   * own (smaller) numbers, the subtraction goes non-positive, and the
   * guard below declines with the premise named. Premise 2 fails QUIETLY:
   * a rest-inclusive total over rest-exclusive priors yields a final
   * interval that is too LONG by the total rest — positive, plausible, and
   * invisible to that guard. That asymmetry is why the `how` string below
   * still names the program's own rest allowance beside its result: it
   * costs a clause, and it keeps an erg-side hand-check to one
   * subtraction.
   *
   * **THIS FUNCTION IS THE ONLY PLACE EITHER PREMISE IS USED. If the walk
   * falsifies either, this function alone changes** — the caller below
   * files whatever this returns and knows nothing about where the numbers
   * came from, and no other call site reads `WorkoutSummary.elapsedSeconds`
   * or `.meters` at all.
   *
   * Two cases, and only the second rests on either premise:
   *   - **SINGLE INTERVAL** (`priors.length === 0`): cumulative and
   *     per-interval READINGS COINCIDE, and there is no prior whose rest
   *     could be double-counted or missed — one interval's own totals are
   *     the workout's totals under every reading of both premises. This
   *     arm is correct whatever the walk finds, and it is the
   *     tester-common shape (walk 5's own 1-interval piece,
   *     `WALK_5_PROGRAM` in the driver tests).
   *   - **MULTI-INTERVAL**: the final interval = the summary MINUS every
   *     recorded prior, and ONLY when every prior interval is recorded.
   *     The evidence says it is the FINAL split that drops (the ecosystem
   *     review's failure mode), so a run missing an EARLIER interval is a
   *     different, unexplained loss — subtracting over that gap would file
   *     the missing interval's meters into the last one, the same D4
   *     corruption shape one door over. It declines instead, with the
   *     missing indices named.
   *
   * Averages are absent by construction — see the caller. A workout's
   * average pace/rate/HR is not the final interval's, and nothing in this
   * function could make it so.
   *
   * `programmedRestSeconds` is the ARMED PROGRAM's own total rest, not a
   * wire reading — it never enters the arithmetic (premise 2 holds, so
   * there is nothing to add or subtract, and a machine that broke it
   * would need a wire reading rather than the program's own figure) and
   * exists solely so the `how` string can name it.
   */
  function deriveFinalIntervalFromSummary(
    summary: WorkoutSummary,
    priors: { elapsedSeconds: number; distanceMeters: number }[],
    missingPriors: number[],
    programmedRestSeconds: number,
  ):
    | { ok: true; elapsedSeconds: number; distanceMeters: number; how: string }
    | { ok: false; why: string } {
    if (missingPriors.length > 0) {
      return {
        ok: false,
        why: `interval(s) ${missingPriors.join(", ")} were never recorded, so the summary cannot be subtracted down to the final interval without folding a missing interval's work into it`,
      };
    }
    if (priors.length === 0) {
      return {
        ok: true,
        elapsedSeconds: summary.elapsedSeconds,
        distanceMeters: summary.meters,
        how: `the SINGLE interval's own totals, taken from 0x0039 verbatim (elapsed=${summary.elapsedSeconds}s distance=${summary.meters}m) — with one interval there is no prior to subtract and no prior rest to mis-count, so this arm holds under either reading of interface-notes §27.1's two premises`,
      };
    }
    const priorElapsed = priors.reduce((a, p) => a + p.elapsedSeconds, 0);
    const priorMeters = priors.reduce((a, p) => a + p.distanceMeters, 0);
    const elapsedSeconds = summary.elapsedSeconds - priorElapsed;
    const distanceMeters = summary.meters - priorMeters;
    if (elapsedSeconds <= 0 || distanceMeters < 0) {
      return {
        ok: false,
        why: `the subtraction produced elapsed=${elapsedSeconds}s distance=${distanceMeters}m, which is not a workout anyone rowed — 0x0039's totals (${summary.elapsedSeconds}s/${summary.meters}m) do not exceed the ${priors.length} recorded prior interval(s) (${priorElapsed}s/${priorMeters}m). The cumulative premise (interface-notes.md §27.1, settled on the wire 2026-08-25 and pinned by oracleCorpusReplay.test.ts) does not hold on this machine`,
      };
    }
    return {
      ok: true,
      elapsedSeconds,
      distanceMeters,
      // THE REST NUMBER IS PART OF THE ANSWER, not decoration. It used to
      // print as an UNVERIFIED PREMISE because nothing on the wire had
      // shown whether 0x0039 counts rest; §27.1 settled that it does not
      // (this function's own doc comment, premise 2), so the entry states
      // the same number as the CHECK a walk can run rather than as a caveat
      // on the result.
      //
      // AN UPPER BOUND, NOT A POINT VALUE, and the distinction is load-
      // bearing (exit pass, finding M-1). An earlier version of this string
      // printed `elapsedSeconds - programmedRestSeconds` as "the true final
      // interval". `programmedRestSeconds` reduces over EVERY interval's
      // `restSeconds`, including the final interval's own trailing rest,
      // which by construction never elapses — and 161 of 300 seeded
      // workouts carry one (`recordRestDistanceVerdict`'s own note above,
      // citing `domain/monitor/program.ts:281-286`). On `rests-finished`'s
      // committed shape that subtraction prints -60s: a negative duration,
      // in a diagnostic whose whole job is to be read at an erg.
      how: `0x0039's totals (${summary.elapsedSeconds}s/${summary.meters}m) MINUS ${priors.length} recorded prior interval(s) (${priorElapsed}s/${priorMeters}m) = ${elapsedSeconds}s/${distanceMeters}m${
        programmedRestSeconds > 0
          ? `. Both sides are work-only (interface-notes §27.1, settled on the wire 2026-08-25), so this subtraction is like-for-like. This program's own rest totals ${programmedRestSeconds}s, of which the final interval's own trailing rest never elapses: on a machine where §27.1 did NOT hold, this ${elapsedSeconds}s would be too long by up to that much and no guard here could tell`
          : ". This program has no programmed rest, so the work-only question (interface-notes §27.1) cannot bite on this run either way"
      }`,
    };
  }

  /**
   * Builds the `summary-observations` event (storage-spine design spec
   * §2, `detail` added RC-3 Task 3): 0x0039's own work-only totals, its
   * other nine fields, plus 0x003F's raw bytes if this run ever heard one.
   * The ONLY thing that varies between its three callers —
   * `reconcileSummary`'s two branches and `noteTerminateObservations` —
   * is `totals`/`summary` — `verificationBytes` always reads off
   * `run` itself, never a caller's local, so a stray 0x003F arriving
   * anywhere between `program()` and this call is picked up identically by
   * whichever branch fires. Omits the `verificationBytes` key outright
   * when `null` (never `verificationBytes: undefined`) — the same
   * additive-optional shape `IntervalActual.restDistanceMeters` uses,
   * and the shape `Object.keys`/`JSON.stringify` treat as "absent",
   * unlike an explicit `undefined` value.
   *
   * `detail` is built as a field-by-field literal off `summary`, never a
   * spread (`{ ...summary }` would leak `summary`'s own
   * `elapsedSeconds`/`meters` onto the event alongside `totals`' — the
   * exact duplicate-source-of-truth this event's own shape forbids).
   */
  function summaryObservationsEvent(
    run: NonNullable<typeof activeRun>,
    totals: { workElapsedSeconds: number; workDistanceMeters: number },
    summary: WorkoutSummary,
  ): MonitorEvent {
    const detail = {
      avgStrokeRate: summary.avgStrokeRate,
      endingHeartRateBpm: summary.endingHeartRateBpm,
      avgHeartRateBpm: summary.avgHeartRateBpm,
      minHeartRateBpm: summary.minHeartRateBpm,
      maxHeartRateBpm: summary.maxHeartRateBpm,
      dragFactorAverage: summary.dragFactorAverage,
      workoutType: summary.workoutType,
      recoveryHeartRateBpm: summary.recoveryHeartRateBpm,
      avgPaceSecondsPer500m: summary.avgPaceSecondsPer500m,
    };
    return run.verificationBytes === null
      ? { kind: "summary-observations", totals, detail }
      : {
          kind: "summary-observations",
          totals,
          detail,
          verificationBytes: run.verificationBytes,
        };
  }

  /**
   * THE TERMINATE PATH'S OWN EMIT (summary-record design spec §1, gate 3's
   * other half) — the observations-only sibling of `reconcileSummary`,
   * kept deliberately separate from it rather than folded in as another
   * branch. `reconcileSummary`'s job is to decide WHICH SOURCE FED THE
   * RECORD's final interval; a terminated run has no final interval to
   * feed and never will, so it has no business in that function at all.
   *
   * **Why this waits instead of emitting on the spot.** 0x003F lands AFTER
   * 0x0039 on every capture we hold (the natural-finish keystone measured
   * +269.6ms and +307.8ms off the split, notes §24 item 1; the lab
   * terminate ring has all three in one ~1s-late group with 0x003F last),
   * and `appendSummaryObservations` is WRITE-ONCE on `summaryTotals` — one
   * door for the whole observation set. Emitting the moment 0x0039 decodes
   * would therefore lose the verification hash PERMANENTLY, the exact
   * defect the final-review fix wave's HIGH-2 found on the natural path
   * and fixed with `HASH_SUBWINDOW_MS`. This is that same fix, on this
   * path, using the same constant: hold for at most `HASH_SUBWINDOW_MS`,
   * emit early the instant 0x003F arrives, and emit ANYWAY when the window
   * elapses so firmware that never sends one is not stranded.
   *
   * (The brief for this task prescribed a synchronous emit inside
   * `noteSummary` and a test asserting the hash was stored — the two could
   * not both hold. Recorded here rather than silently worked around.)
   *
   * TWO CALLERS, one per ARRIVAL ORDER, and `ordering` is which — recorded
   * in the verdict because a walk reading the ring needs to know whether
   * this burst beat our terminal transition or followed it (the same fact
   * §1's own 3-of-5 research is about, and the one a future timing change
   * would move). `"late"` is `noteSummary`'s door; `"early"` is
   * `maybeEmitFrame`'s terminated branch picking up a summary that was
   * already buffered before the close.
   */
  function noteTerminateObservations(
    run: NonNullable<typeof activeRun>,
    summary: WorkoutSummary,
    ordering: "early" | "late",
  ): void {
    // GATE 3'S INVARIANT HAS ONE OWNER, and it is this line (fix round 1).
    // `reconcileSummary` reads exactly one field to decide whether it may
    // synthesize an interval — `run.summaryInGrace` — so "a terminate's
    // summary is not reachable from there" is true iff that field is empty
    // on this path. The `"late"` caller never filled it; the `"early"`
    // caller is handing us what was in it. Clearing it HERE rather than at
    // each call site means a third caller cannot be added that forgets.
    //
    // Untestable from outside today, and said plainly rather than dressed
    // up: with no reconcile deadline armed on a terminate,
    // `drainSummaryReconcile` short-circuits and nothing else reads the
    // field, so a version of this line that did nothing would pass every
    // test in the suite. It is here to make the structural claim TRUE
    // instead of accidentally-true — the same reason `reconcileSummary`'s
    // own `run.finishGraceUntil = null` sits beside a `recordedActuals`
    // bound that already covers it.
    run.summaryInGrace = null;
    const emitTerminate = (): void => {
      pendingTerminateObservations = null;
      log.record(
        "summary-reconciled",
        `terminate-observations — 0x0039 ${ordering === "early" ? "held from before our own terminal transition (buffered while the run was still open in its final interval)" : "arrived after a rower-ended close"} (${summary.elapsedSeconds}s/${summary.meters}m, hash ${run.verificationBytes === null ? "never arrived" : "included"}) and is recorded as OBSERVATIONS ONLY; no interval is derived from it and none ever can be — this run was abandoned, not finished (summary-record design spec §1)`,
      );
      emit(
        summaryObservationsEvent(
          run,
          {
            workElapsedSeconds: summary.elapsedSeconds,
            workDistanceMeters: summary.meters,
          },
          summary,
        ),
      );
    };
    if (run.verificationBytes !== null) {
      // The hash was already in hand (a 0x003F that beat its own 0x0039, or
      // a stray one earlier in this run) — nothing to wait for.
      emitTerminate();
      return;
    }
    const cancel = schedule(() => {
      // A `program()` in between replaced the run this emit belongs to.
      // Same identity guard, and the same belt-to-`program()`'s-braces
      // reasoning, as `armSummaryReconcile`'s own: `program()` already
      // cancels this timer before it swaps `activeRun`, and nothing else in
      // this driver ever reassigns that variable, so this branch is
      // UNREACHABLE today and is uncovered on purpose (the same trade
      // `reconcileSummary`'s `lastIndex < 0` guard states: one branch
      // against a timer speaking about someone else's workout).
      if (activeRun !== run) {
        pendingTerminateObservations = null;
        return;
      }
      emitTerminate();
    }, HASH_SUBWINDOW_MS);
    pendingTerminateObservations = { cancel, emit: emitTerminate };
  }

  /** Fires a pending terminate-observations emit EARLY (summary-record
   *  design spec §1). Two call sites, mirroring the natural path's own two:
   *  0x003F's subscriber (the byte the wait exists for has landed) and
   *  `drainSummaryReconcile` (the link is going down — `reconcile()`,
   *  `disconnect()`, `onDisconnect` — so waiting for more wire evidence is
   *  no longer a thing this run can do). Idempotent: a no-op once the slot
   *  is `null`, exactly like `drainSummaryReconcile` itself. */
  function flushTerminateObservations(): void {
    const pending = pendingTerminateObservations;
    if (pending === null) return;
    pending.cancel();
    // Nulled BEFORE the emit, not after: `emit` runs the hook's listener
    // synchronously, and this slot must already read "nothing pending" by
    // the time anything that listener touches could call back in here.
    pendingTerminateObservations = null;
    pending.emit();
  }

  /**
   * THE RECONCILE (fast-follow Task 2, design spec §5) — fired once, by the
   * deadline `armSummaryReconcile` set, at the instant the finish grace
   * closed. It answers one question in the trace, whatever it decides:
   * WHICH SOURCE FED THE RECORD.
   *
   *   - `split-won`: the final interval is already recorded. The summary is
   *     the fallback and never the authority, so this is the verdict on
   *     every healthy finish (and, deliberately, the verdict logged even
   *     when no summary ever arrived to lose — the entry says the split
   *     path worked, which is worth reading at the erg).
   *   - `filled-from-summary`: the split was dropped and the derivation
   *     succeeded. Carries the numbers it derived and how.
   *   - `declined`: the split was dropped and the summary could not
   *     honestly stand in. Carries why. Nothing is written.
   *
   * The synthesized boundary rides the EXISTING vouched channel — the same
   * `{kind: "intervalComplete", actual, finalBoundary: true}` event
   * `emitIntervalComplete` emits, the same hook release, the same
   * `acceptableFinalBoundary` re-derivation in the record (which passes:
   * the index is real, it is the program's last, and the record does not
   * hold it yet). Nothing downstream learns that this one came from a
   * different characteristic, and nothing downstream needs to: what makes
   * it acceptable is what has always made a final boundary acceptable.
   *
   * It does NOT log `interval-complete`. That entry means "0x0037/0x0038
   * paired and produced an actual", and no such pair arrived here — the
   * `summary-reconciled` entry is this boundary's own provenance, and a
   * stash that claimed a split had landed would be lying about the one
   * thing this whole gate exists to make honest.
   *
   * **`summary-observations` (storage-spine design spec §2, PR 1):** BOTH
   * branches below now also fold 0x0039's totals onto the run as an
   * OBSERVATION, separate from whatever `IntervalActual` they file — even
   * `split-won`, which used to discard a held summary unread (review I4's
   * ruling was always about the ACTUAL, never about whether the totals
   * were worth keeping at all: a split is authoritative for what the
   * interval measured, not for what the machine itself said the whole
   * workout summed to). Emitted AT MOST ONCE per run, since this whole
   * function runs at most once per run (`armSummaryReconcile` arms a
   * single deadline; `pendingSummaryReconcile`'s own doc comment).
   */
  function reconcileSummary(run: NonNullable<typeof activeRun>): void {
    const lastIndex = run.program.intervals.length - 1;
    // A program with NO intervals, guarded rather than assumed away — the
    // one shape where this function could fabricate an identity. With
    // `lastIndex === -1` the priors loop never runs, the single-interval
    // arm below would hand back the summary's own totals, and the actual
    // would be filed under index `-1` — which `acceptableFinalBoundary`
    // would ACCEPT, since `-1 === program.intervals.length - 1` holds for
    // an empty program. Unreachable by construction (`compileProgram`'s
    // no-work guard cannot produce one and `program()` is the only opener),
    // and therefore uncovered — but the cost of the guard is one line and
    // the cost of its absence is a fabricated interval in a rower's log.
    if (lastIndex < 0) return;
    if (run.recordedActuals.has(lastIndex)) {
      const held = run.summaryInGrace;
      log.record(
        "summary-reconciled",
        `split-won — interval ${lastIndex} was already recorded when the ${FINISH_GRACE_MS}ms finish grace closed${held === null ? ' (no 0x0039 was being held — one may still have ARRIVED and been refused storage; check for an out-of-window entry above before reading this as "the summary never came")' : " (a 0x0039 was held; its totals are recorded as observations alongside the split — the split stays authoritative for the interval ACTUAL, review I4)"}`,
      );
      if (held !== null) {
        run.summaryInGrace = null;
        emit(
          summaryObservationsEvent(
            run,
            {
              workElapsedSeconds: held.elapsedSeconds,
              workDistanceMeters: held.meters,
            },
            held,
          ),
        );
      }
      return;
    }
    const summary = run.summaryInGrace;
    if (summary === null) {
      log.record(
        "summary-reconciled",
        `declined — interval ${lastIndex} is still missing and no 0x0039 arrived inside the ${FINISH_GRACE_MS}ms finish grace; nothing filed (this run logs one interval short, and the trace says why)`,
      );
      return;
    }
    const priors: { elapsedSeconds: number; distanceMeters: number }[] = [];
    const missingPriors: number[] = [];
    for (let i = 0; i < lastIndex; i += 1) {
      const prior = run.recordedActuals.get(i);
      if (prior === undefined) missingPriors.push(i);
      else priors.push(prior);
    }
    // The ARMED PROGRAM's own rest allowance — a fact about what we asked
    // the machine for, never a wire reading, and never part of the
    // arithmetic (§23 walk item 4: choosing to add or subtract it would be
    // picking a side of an unobserved premise). It travels only into the
    // `how` string, where a reader at the erg can hand-check the fill
    // against it.
    const programmedRestSeconds = run.program.intervals.reduce(
      (total, interval) => total + interval.restSeconds,
      0,
    );
    const derived = deriveFinalIntervalFromSummary(
      summary,
      priors,
      missingPriors,
      programmedRestSeconds,
    );
    if (!derived.ok) {
      log.record(
        "summary-reconciled",
        `declined — interval ${lastIndex} cannot be derived from 0x0039: ${derived.why}; nothing filed`,
      );
      return;
    }
    // THE AVERAGES ARE NULL, NOT ZERO, AND NOT THE WORKOUT'S (B3). 0x0039
    // carries an average pace, stroke rate and heart rate — for the WHOLE
    // WORKOUT. `IntervalActual`'s three average fields are per-interval and
    // are typed `number | null` (REQUIRED, not optional —
    // `domain/monitor/types.ts`), so "omitted" can only be expressed as
    // `null` here, which is precisely the value every consumer already
    // reads as "no reading": `logDraft.ts`'s `buildMonitorLogSteps` drops
    // the field from the log step entirely, and `surfaceModel.ts` renders a
    // dash. A zero would be a claim (and `avgSplit: 0` specifically is the
    // wire's own "no reading" sentinel the log builder already filters), a
    // workout average would be a lie.
    const actual: IntervalActual = {
      index: lastIndex,
      elapsedSeconds: derived.elapsedSeconds,
      distanceMeters: derived.distanceMeters,
      avgSplit: null,
      avgSpm: null,
      avgHeartRateBpm: null,
      // 0x0039 (the summary this fallback derives from) carries no
      // PER-INTERVAL rest distance field of its own — that number only ever
      // arrives on the 0x0037 this branch exists BECAUSE it was lost.
      // **OMITTED, not `0` (RC-7, storage-spine design spec §2):** `0`
      // used to sit here, and it was a claim this path has no wire reading
      // to back — indistinguishable from a genuine rest-free interval to
      // every reader that trusted the type's old "always a number"
      // promise. `restDistanceMeters` is additive-optional now
      // (`domain/monitor/types.ts`); every existing consumer already reads
      // it `?? 0` for the OTHER reason optional-in-practice was already
      // true (an old persisted record). If the final interval had a
      // trailing rest, the summary-reconciled DISTANCE hero still
      // undercounts it by exactly that many metres, same as this
      // function's own documented elapsed-time gap two lines up (§23 walk
      // item 4) — a real gap, now stated as an absence instead of
      // papered over with a number that looks measured.
      //
      // RC-1 (storage-spine design spec §3): `restSeconds`/`type` are
      // OMITTED here too, for the identical reason — 0x0039 carries no
      // per-interval Rest Time or Split/Interval Type either, only the
      // 0x0037 this branch exists BECAUSE it was lost carries those. This
      // object is built as a literal, not `{ ...rawActual, ... }`, so the
      // omission is structural: there is no `rawActual` in scope on this
      // path to spread from.
    };
    run.actuals += 1;
    // RC-9d: `restDistanceMeters` stays OMITTED here too, same reason as
    // `restSeconds`/`type` just above — this run's `recordedActuals` is
    // therefore incomplete for `recordRestDistanceVerdict`'s all-or-nothing
    // rule, and that verdict suppresses rather than reading the gap as a
    // real zero (`recordedActuals`'s own doc comment).
    run.recordedActuals.set(lastIndex, {
      elapsedSeconds: derived.elapsedSeconds,
      distanceMeters: derived.distanceMeters,
    });
    // CONSUMED ONCE, ACROSS BOTH SOURCES (design spec §5). The grace's own
    // clock has just expired anyway, so this is belt to the clock's braces
    // — but `recordedActuals` above is the bound that actually holds: bound
    // 5 of `finishGraceIndex` now refuses a split naming this index, and
    // `acceptableFinalBoundary` re-derives the same refusal in the record.
    run.finishGraceUntil = null;
    run.graceClaimed = true;
    run.summaryInGrace = null;
    // RC-9a: this run's final interval is now built FROM 0x0039, not from a
    // genuine split — `recordAvgPaceVerdict`'s only reader, so its
    // comparison suppresses rather than certifying a tautology.
    run.finalFilledFromSummary = true;
    log.record(
      "summary-reconciled",
      `filled-from-summary — the final split never arrived, so interval ${lastIndex} is synthesized from 0x0039: elapsed=${derived.elapsedSeconds}s distance=${derived.distanceMeters}m (${derived.how}). Avg split/spm/HR are OMITTED (null): 0x0039's averages are the whole workout's, not this interval's (design spec §5, B3)`,
    );
    emit({ kind: "intervalComplete", actual, finalBoundary: true });
    // The OBSERVATION rides separately from the ACTUAL above (storage-spine
    // design spec §2): `summary`'s own elapsed/distance are 0x0039's
    // work-only totals, exactly as received — never `derived`'s numbers,
    // which have already had `deriveFinalIntervalFromSummary`'s premises
    // (priors subtracted, possibly a rest allowance) applied to them.
    emit(
      summaryObservationsEvent(
        run,
        {
          workElapsedSeconds: summary.elapsedSeconds,
          workDistanceMeters: summary.meters,
        },
        summary,
      ),
    );
  }

  /**
   * THE FINISH GRACE's own predicate (hardware walk 5, 2026-08-10,
   * interface-notes.md §21 item 4 and §22 items 1/5 — the end-of-workout
   * split race; `activeRun.finishGraceUntil`'s doc comment carries the
   * capture). Answers "does this boundary belong to the run that
   * just finished?" and, if so, to WHICH of that run's interval indices —
   * `null` means "no, take the out-of-run path", which is every case that
   * existed before this function did.
   *
   * All five conditions must hold, and each rules out a boundary a looser
   * rule would misfile:
   *   1. a run exists and is CLOSED — an open run needs no grace, it is the
   *      ordinary in-run path below;
   *   2. it was closed by a natural `"finished"` less than
   *      `FINISH_GRACE_MS` ago, ON THE CLOCK — walk day 3 measured the split
   *      arriving later than one status tick but well inside 3 s, so the
   *      machine's own ticking cannot be what closes this door (that was the
   *      previous bound, and it is why the fix missed twice). A `terminated`
   *      close never opens a grace at all (footnote 12, cited on
   *      `finishGraceUntil`), and the grace is consumed by the first
   *      boundary that uses it;
   *   3. the run actually saw an interval RUNNING, so there is a real
   *      observed state to normalize against rather than the terminal word
   *      `toActualIndex` (correctly) refuses to name an interval from;
   *   4. the offset rule explains the machine's Split/Interval Number
   *      against THIS program's length — an unexplainable number is exactly
   *      as unexplainable at the finish as anywhere else;
   *   5. **the run is still MISSING that interval's actual.** This is the
   *      discriminator between the final interval's data arriving one
   *      notification late and the PM's own post-run housekeeping
   *      re-reporting a boundary already filed (`recordedActuals`) — the
   *      hazard `runIsOpen()` alone used to cover, and the one this grace
   *      must not reopen.
   *
   * Conditions 1 and 2 live in `graceIsOpen` below, shared with the summary
   * gate (fast-follow Task 2). They are one question — "is this run inside
   * its finish grace right now?" — and two copies of it could drift; the
   * summary gate answering that question differently from this one is
   * precisely how a fallback starts filing things the split path would have
   * refused. Conditions 3-5 stay here: they are about a BOUNDARY's index,
   * and the summary carries no index to ask about (B2 — its synthesized
   * index comes from the armed program, never off the wire).
   */
  function finishGraceIndex(rawIndex: number): number | null {
    const run = activeRun;
    if (run === null || !graceIsOpen(run)) return null;
    if (run.lastActiveState === null) return null;
    const index = toActualIndex(
      rawIndex,
      run.lastActiveState,
      run.program.intervals.length,
    );
    if (index === null || run.recordedActuals.has(index)) return null;
    return index;
  }

  /** Conditions 1 and 2 of the finish grace, extracted so the split path
   *  (`finishGraceIndex`) and the summary gate (`noteSummary`) ask the
   *  identical question of the identical clock: the run is CLOSED, it was
   *  closed by a natural `"finished"` (a `terminated` close never sets
   *  `finishGraceUntil` at all), the grace has not been consumed, and
   *  `FINISH_GRACE_MS` has not elapsed on `now()`. Read
   *  `finishGraceIndex`'s doc comment for the evidence behind each. */
  function graceIsOpen(run: NonNullable<typeof activeRun>): boolean {
    if (!run.closed) return false;
    if (run.finishGraceUntil === null) return false;
    return now() < run.finishGraceUntil;
  }

  function emitIntervalComplete(): void {
    announceReconnectIfPending();
    const status = raw as RawPm5Status;
    const rawActual = toIntervalActual(status);
    const state = toMonitorFrame(status).state;
    // The finish grace, decided BEFORE the out-of-run gate below: this is
    // the one boundary a CLOSED run still owns.
    //
    // `rawActual.index` is `number | null` on the type and never `null` in
    // fact (`pm5/parse.ts` always assigns 0x0037/38's own decoded byte, and
    // the in-run path below asserts past the type on exactly that basis) —
    // but this door does NOT take that assertion, because of where the two
    // differ if the premise ever breaks (review M-5). `toActualIndex(null,
    // ...)` computes `candidate = -1` and CLAMPS to `0`, so an unknown index
    // arriving here would be filed as interval 0 of a finished run — a
    // fabricated identity through the one door that writes into a closed
    // record, which is the precise thing `IntervalActual.index`'s `null`
    // widening exists to prevent. A `null` here therefore opens no grace at
    // all: the boundary drops through to the out-of-run branch below, which
    // emits it with `index: null` and logs `boundary-out-of-run` — the same
    // honest "unknown, and here is the trace" answer every other
    // unattributable boundary gets.
    const graceIndex =
      rawActual.index === null ? null : finishGraceIndex(rawActual.index);

    // OUT-OF-RUN BOUNDARIES (Task 4, spec §4). 0x0037/0x0038 are not
    // ours: a PM5 auto-splits a user-started JustRow piece and reports
    // those splits on the very same pair, and its own post-terminate
    // housekeeping can produce a boundary too (CSAFE-DEF footnote 12
    // p.25: the Split/Interval Number "will change depending on where you
    // are in the interval when the workout is terminated"). If no run this
    // driver opened is currently open, this boundary belongs to no program
    // of ours, so:
    // - it is EMITTED (7B/observability still want to see that the erg
    //   crossed a split — silence is what §19.4 cost us),
    // - with `index: null`, never normalized against a program it has
    //   nothing to do with, and never fabricated into a number
    //   (`IntervalActual.index`'s own contract: `null` means "unknown",
    //   NOT "interval 0"),
    // - and it is identifiable as such by a consumer: `index: null` plus
    //   this `boundary-out-of-run` log entry (the `MonitorEvent` contract
    //   comment in `domain/monitor/types.ts` states this pairing).
    // A closed run's `actuals` can therefore never grow THIS WAY: the only
    // actual this path produces carries no interval identity to file under,
    // and `monitorRun.ts`'s own `recordActual` refuses a completed record.
    // The single exception is the finish grace above — a boundary belonging
    // to the run that ended one notification ago, emitted with its real
    // index and `finalBoundary: true` so the record can tell it apart from
    // everything this branch handles.
    if (!runIsOpen() && graceIndex === null) {
      log.record(
        "boundary-out-of-run",
        `machine reported Split/Interval Number ${rawActual.index} (state=${state}) with no open run — emitted with index=null, normalized against nothing, never added to a closed run's actuals`,
      );
      emit({ kind: "intervalComplete", actual: { ...rawActual, index: null } });
      return;
    }

    // `rawActual.index` is 0x0037/38's own Split/Interval Number, UNCHANGED
    // (`toIntervalActual` never touched by this task). Normalized below via
    // the CURRENT machine state, same as `maybeEmitFrame`'s own
    // `base.state` — but via `toActualIndex`, NOT `toProgramIndex`
    // (`maybeEmitFrame`'s own call, above, untouched): Task 5
    // (interface-notes.md §19.8, answering §17 item 13) found the two wire
    // fields disagree at a no-rest work→work boundary — 0x0033 read `0`
    // (identity, matching `toProgramIndex`'s rowing branch) while 0x0037/38
    // read `1` (forward-attributed anyway) — which means the rest-keyed
    // rule this function used to share with `maybeEmitFrame` is WRONG for
    // the actuals characteristic specifically. `toActualIndex`'s own doc
    // comment carries the full evidence table and the honesty note about
    // the one program shape both hardware readings come from.
    //
    // Past the gate above, a driver-opened run is active BY CONSTRUCTION,
    // so its program is non-null — no `?? 0` fallback and no second
    // "is a program armed?" guard is needed anywhere below (both existed
    // before Task 4, when this function could run with no run at all;
    // keeping them would be unreachable code pretending to be a check).
    const programLength = activeRun!.program.intervals.length;
    // `rawActual.index` is `IntervalActual`'s own (now `number | null`)
    // field, but `toIntervalActual` (`pm5/parse.ts`) always assigns it a
    // real decoded byte (`raw.splitIntervalNumber`) — the wire has no null
    // sentinel here, so this can never actually be `null`. Asserted past
    // the type rather than branched on (an earlier version branched here;
    // coverage never exercised the `null` side through any real call path,
    // the same unreachable-by-construction shape the `activeRun!` on the
    // `programLength` line above has) — same established pattern as this
    // file's own `raw as RawPm5Status` casts elsewhere.
    // `graceIndex` (walk 5) is the SAME `toActualIndex` call, already made
    // by `finishGraceIndex` against the run's last ACTIVE state — the one
    // substitution the finish grace makes, and what lets it name an interval
    // on a tick whose state word reads `finished`. With no grace open this
    // is exactly the call it has always been.
    const normalizedIndex =
      graceIndex ??
      toActualIndex(rawActual.index as number, state, programLength);
    // DEVIATION from design spec §2's verbatim `IntervalActual.index:
    // number` (Task 3 review; recorded in `docs/design/DEVIATIONS.md`'s
    // "Domain spec deviations (non-UI)" table and on the type itself,
    // `domain/monitor/types.ts`) — `null` survives here rather than being
    // fabricated into a number. A future 7C log screen prefilling from
    // `MonitorRun.actuals` (`src/monitor/monitorRun.ts`) must never read
    // `null` as "interval 0"; the true value is unknown, not zero.
    const actual: IntervalActual = {
      ...rawActual,
      index: normalizedIndex,
    };
    log.record(
      "interval-complete",
      graceIndex === null
        ? `index=${actual.index} (machine reported ${rawActual.index})`
        : `index=${actual.index} (machine reported ${rawActual.index}) — THE FINISH GRACE: this boundary arrived after the run's own "finished" tick, inside the gap before the machine's next sample, and is the final interval's own data (walk 5). Normalized against the run's last active state "${activeRun!.lastActiveState}", since the machine itself now reads "${state}"`,
    );
    activeRun!.actuals += 1;
    if (normalizedIndex !== null) {
      // The two SUBTRACTABLE fields ride along since fast-follow Task 2
      // (`recordedActuals`'s own doc comment): the summary gate's
      // multi-interval derivation subtracts the recorded priors, and this
      // is where a prior becomes recorded. The averages deliberately do
      // not — an average is not subtractable, which is B3's whole finding.
      // RC-9d: `restSeconds`/`restDistanceMeters` ride along too, straight
      // off this same boundary-derived `actual` — additive-optional,
      // `undefined` whenever `actual`'s own (additive-optional) fields are
      // (`recordedActuals`'s own doc comment has the full reasoning).
      activeRun!.recordedActuals.set(normalizedIndex, {
        elapsedSeconds: actual.elapsedSeconds,
        distanceMeters: actual.distanceMeters,
        restSeconds: actual.restSeconds,
        restDistanceMeters: actual.restDistanceMeters,
      });
    }
    // One boundary per grace, consumed here — a second notification arriving
    // in the same gap cannot also claim it. `graceClaimed` records WHICH
    // way it closed, for the stash alone (`graceClaimed`'s own comment).
    if (graceIndex !== null) {
      activeRun!.finishGraceUntil = null;
      activeRun!.graceClaimed = true;
    }
    emit(
      graceIndex === null
        ? { kind: "intervalComplete", actual }
        : { kind: "intervalComplete", actual, finalBoundary: true },
    );
    // Review fix round 1, HIGH finding: the LATE side's other direction —
    // this boundary is the finish-grace one (`graceIndex !== null`), and a
    // summary may already be held from an earlier arrival. Fired AFTER the
    // `intervalComplete` emit above so the hook's own record has already
    // filed this actual (`recordActual`'s own finish-grace door) before
    // any observation write is attempted — the same "cause event first"
    // ordering the arm-time call site uses. A genuine no-op
    // (`maybeReconcileImmediately`'s own guard) whenever no summary is
    // held yet; the deadline stays the fallback, unchanged.
    if (graceIndex !== null) maybeReconcileImmediately(activeRun!);

    // Fix-round MED-2 (UNCHANGED by this task, deliberately still comparing
    // RAW values): 0x0033's Interval Count (tracked in the machine's own
    // numbering as `lastRawFrameIntervalIndex`) and 0x0037/38's Split/
    // Interval Number (`rawActual.index`) are documented as two SEPARATE,
    // independently-incrementing fields (interface-notes.md §15 #1/#8) —
    // nothing guarantees they agree. This never corrects either value
    // (there is no documented rule for which one would be "right"); it only
    // surfaces the disagreement so a bug report / diagnostics view (7B) can
    // see it happened, via the trace, without a screen silently trusting a
    // skewed pairing. Comparing the NORMALIZED values instead would hide
    // exactly the shape D3 exposed — see `lastRawFrameIntervalIndex`'s own
    // doc comment.
    if (
      lastRawFrameIntervalIndex !== null &&
      lastRawFrameIntervalIndex !== rawActual.index
    ) {
      log.record(
        "divergence",
        `intervalIndex=${lastRawFrameIntervalIndex} (0x0033) vs actual.index=${rawActual.index} (0x0037/38)`,
      );
    }

    // The divergence trigger for `toActualIndex` itself returning `null`
    // (Task 4 introduced this trigger for `toProgramIndex`'s own
    // more-than-one-step-out `null`; Task 5 re-homes it here for
    // `toActualIndex`'s own, now-mirrored `null` contract — re-review
    // MUST-1). Unlike `maybeEmitFrame`'s mirror of this check (which still
    // guards on `intervalActive` — a program can be armed with `base.state`
    // outside rowing/resting, and that is NOT divergence-worthy there), no
    // `stateActive` GATE is needed here: past the run gate above,
    // `programLength > 0` always (`activeRun!.program` is non-null by
    // construction), so `toActualIndex` never returns `null` for lack of a
    // program — every `null` reaching this point is genuinely one of its
    // two remaining causes, and both deserve a log entry.
    //
    // The DETAIL, though, must fork on WHICH cause fired (re-review
    // MUST-1(c)) — a single hard-coded string would read as
    // self-contradicting once `toActualIndex` can return `null` for an
    // in-range-looking state too:
    //   - `state` outside `"rowing"`/`"resting"` — most reachably
    //     `"terminated"` (CSAFE-DEF footnote 12 p.25, cited via
    //     interface-notes.md §19.8: the Split/Interval Number "will change
    //     depending on where you are in the interval" once a workout is
    //     terminated mid-interval) — a boundary with no stable interval to
    //     name.
    //   - `state` WAS rowing/resting but the raw index is more than one
    //     step outside the program's own length — the actuals-path
    //     analogue of `maybeEmitFrame`'s own D3 trigger, and reworded to
    //     match it verbatim ("has no corresponding interval in a
    //     N-interval program") on purpose: same finding, same wording,
    //     wherever it is logged.
    const stateActive = state === "rowing" || state === "resting";
    if (normalizedIndex === null) {
      if (stateActive) {
        log.record(
          "divergence",
          `actual.index=${rawActual.index} (0x0037/38, state=${state}) has no corresponding interval in a ${programLength}-interval program`,
        );
      } else {
        log.record(
          "divergence",
          `actual.index=${rawActual.index} (0x0037/38) arrived while state=${state} — toActualIndex declines to normalize outside rowing/resting (a ${programLength}-interval program was armed, so this is not a missing program)`,
        );
      }
    }
  }

  // AS1/AS2 only merge into `raw` and mark themselves `seen` — they do NOT
  // themselves trigger a `frame` event. `GENERAL_STATUS_UUID`'s handler
  // below is the sole "tick pulse" for `frame` events (interface-notes.md
  // §4: General/AdditionalStatus1/2 are all sampled at the same rate, so
  // treating any ONE of them as the trigger and merging the other two's
  // latest values in is sufficient — and necessary: wiring `maybeEmitFrame`
  // to all three would fire three redundant `frame` events per real tick
  // once every characteristic has been `seen` at least once, which is
  // exactly what an earlier version of this function did and a test caught
  // (see the report).
  mergeStatus(
    ADDITIONAL_STATUS_1_UUID,
    "0x0032",
    parseAdditionalStatus1,
    (decoded) => {
      seen.as1 = true;
      // RC-9a (`lastWorkStateAverageSplit`'s own doc comment carries the
      // full reasoning): `raw` is already merged with `decoded` by the
      // time this callback runs (`mergeStatus`'s own doc comment), but
      // `raw.workoutState` is 0x0031's own field — this tick's 0x0032
      // sample is judged against whichever 0x0031 reading is most recently
      // merged, same "sampled at the same rate" idiom
      // `splitAvgPaceProvenanceIndex`'s own callback (0x0033, below) already
      // uses. `!== 0` excludes the interval-reset artifact — see the field's
      // own comment for why this driver's own decode shows it is not
      // actually a single frame.
      if (
        (raw.workoutState === WORKOUTSTATE_INTERVALWORKTIME ||
          raw.workoutState === WORKOUTSTATE_INTERVALWORKDISTANCE) &&
        decoded.averageSplit !== 0
      ) {
        lastWorkStateAverageSplit = decoded.averageSplit;
      }
    },
  );
  mergeStatus(
    ADDITIONAL_STATUS_2_UUID,
    "0x0033",
    parseAdditionalStatus2,
    (decoded) => {
      seen.as2 = true;
      // `splitAvgPaceProvenanceIndex`'s own doc comment (fix round 1,
      // finding B): stamp THIS sample's own `intervalCount` with the
      // state that was live the moment it arrived (`raw.workoutState` —
      // `raw` is already merged with `decoded` by the time this callback
      // runs, `mergeStatus`'s own doc comment, but `decoded.intervalCount`
      // is used directly rather than re-reading it off `raw` so this stays
      // correct even if a later merge races it, which nothing in this
      // driver does today but nothing should have to prove). `undefined`
      // `workoutState` (no 0x0031 ever seen yet) leaves this `null` — "no
      // claim yet", not a fabricated interval.
      splitAvgPaceProvenanceIndex =
        raw.workoutState === undefined
          ? null
          : toProgramIndex(
              decoded.intervalCount,
              toMonitorState(raw.workoutState),
              armedProgram()?.intervals.length ?? 0,
            );
    },
  );
  mergeStatus(
    ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
    "0x0038",
    parseAdditionalSplitIntervalData,
    (decoded) => {
      noteBoundaryHalf("asSplit", decoded.splitIntervalNumber);
    },
  );
  mergeStatus(
    GENERAL_STATUS_UUID,
    "0x0031",
    parseGeneralStatus,
    (decoded, bytes) => {
      seen.general = true;
      // The walk's mid-rest finished frame (2026-08-15): a payload our
      // parser read as finished/elapsed=60/distance=0 killed a session 16s
      // into interval 1's rest, and the ring had no bytes to decode after
      // the fact — the raw-hex notify branch excludes 0x0031 as a flood,
      // and frame entries carry decoded fields only. Kept here per tick
      // (a 19-byte copy, no hex work) and logged ONLY at a terminal
      // transition, so each session end costs one ring entry and the next
      // mid-rest terminal convicts its own state byte.
      lastRaw0x0031 = bytes.slice();
      // Task 1 (fix-3): the machine's idea of the armed workout's structure,
      // already decoded by `parseGeneralStatus` (interface-notes.md §10) —
      // recorded ON CHANGE ONLY, comparing the three DECODED fields rather
      // than the raw bytes (`elapsed`/`distance`/HR etc. inside the same 19
      // bytes change on nearly every tick regardless of whether the program
      // structure itself did, and 0x0031 notifies ~2/second — the exact flood
      // the raw-hex `notify` branch above already excludes it for). This is
      // the prerequisite interface-notes.md §17 item 12 has been waiting on:
      // no 0x0031 payload has ever been recorded before now.
      const structure = {
        workoutType: decoded.workoutType,
        workoutDurationRaw: decoded.workoutDurationRaw,
        workoutDurationType: decoded.workoutDurationType,
      };
      if (
        !lastLoggedStructure ||
        structure.workoutType !== lastLoggedStructure.workoutType ||
        structure.workoutDurationRaw !==
          lastLoggedStructure.workoutDurationRaw ||
        structure.workoutDurationType !==
          lastLoggedStructure.workoutDurationType
      ) {
        lastLoggedStructure = structure;
        log.record(
          "structure",
          `workoutType=${structure.workoutType} durationRaw=${structure.workoutDurationRaw} durationType=${structure.workoutDurationType} raw=${toHex(bytes)}`,
        );
      }
      // R0 (CR2 spec 1): the machine's own Total Work Distance, sampled on
      // a 25 m BUCKET CHANGE (review I1; `TWD_SAMPLE_BUCKET_METERS`'s own
      // comment and `lastLoggedTwd`'s own comment have the full reasoning
      // and the ring-budget arithmetic) — NOT on whole-metre change, which
      // degenerates to one entry per tick at any pace faster than ~4:10/500
      // and evicted the programming trace exactly like the defect
      // `lastLoggedFrameState`'s own comment already documents fixing once.
      // `workoutState`/`durationType` ride along on purpose: the antagonist
      // established that characterising when this field appears without
      // decoding the state byte is exactly how the last wrong conclusion
      // was reached.
      const twdBucket = Math.floor(
        decoded.totalWorkDistanceMeters / TWD_SAMPLE_BUCKET_METERS,
      );
      const lastLoggedTwdBucket =
        lastLoggedTwd === null
          ? null
          : Math.floor(lastLoggedTwd / TWD_SAMPLE_BUCKET_METERS);
      if (twdBucket !== lastLoggedTwdBucket) {
        lastLoggedTwd = decoded.totalWorkDistanceMeters;
        log.record(
          "twd-sample",
          `machineTotal=${decoded.totalWorkDistanceMeters}m at elapsed=${decoded.elapsedSeconds}s ` +
            `distance=${decoded.distanceMeters}m workoutState=${decoded.workoutState} ` +
            `durationRaw=${decoded.workoutDurationRaw} durationType=${decoded.workoutDurationType}`,
        );
      }
      // The ack-timeout policy's tick pulse (`DriverOptions.ackTimeout`,
      // HIGH-2): only counts while a write is genuinely awaiting its ack
      // (`pendingAck` set) AND a policy was actually configured — otherwise
      // a fully-connected, un-timed-out session just counts nothing, ever.
      if (pendingAck && options.ackTimeout) {
        pendingAckTicks += 1;
        if (pendingAckTicks >= options.ackTimeout.ticks) {
          const resolve = pendingAck;
          pendingAck = null;
          resolve("ack-timeout");
        }
      }
      maybeEmitFrame();

      // `program()`'s PREPARE-SETTLE tick pulse (`waitForPrepareSettle`,
      // below, design spec §1b) — STATE-KEYED, unlike `pendingSettle`'s raw
      // tick-blind subscription (below): needs the DECODED state this same
      // arrival just merged into `raw`, exactly like `pendingVerify`'s own
      // pulse just below reads it. Ticks are counted only while the end
      // condition's first half (`armed`) has not yet been observed — the
      // instant it is, the very NEXT arrival (any state at all) satisfies
      // the second half and resolves, uncounted against `ticksNeeded`
      // (`waitForPrepareSettle`'s own doc comment: `ticksNeeded` bounds the
      // ticks spent waiting to REACH `armed`, not the one grace tick after).
      if (pendingPrepareSettle) {
        const settleState = toMonitorFrame(raw as RawPm5Status).state;
        if (pendingPrepareSettle.armedSeen) {
          // Review finding I4: the success path used to record nothing —
          // the ONE number a future hardware session most needs (how many
          // ticks this wait actually consumed) was computed here and then
          // silently discarded. `ticks` counts every arrival since the wait
          // began UP TO AND INCLUDING the one that first reported `armed`
          // (incremented once more per arrival, below, before that
          // arrival's own state is even checked — never incremented again
          // once `armedSeen` is set) — i.e. the tick NUMBER, within this
          // wait, at which `armed` was observed. This is the genuine,
          // live-measured dispatch-to-armed span the historical session-3
          // log could never produce (no timestamps, on-change logging
          // only, per `DEFAULT_PREPARE_SETTLE_TICKS`'s own doc comment).
          const { resolve, ticks } = pendingPrepareSettle;
          pendingPrepareSettle = null;
          log.record(
            "prepare-settled",
            `"armed" observed on tick ${ticks} of the wait; released one tick later (that tick's state: "${settleState}")`,
          );
          resolve();
        } else {
          pendingPrepareSettle.ticks += 1;
          if (pendingPrepareSettle.ticks >= pendingPrepareSettle.ticksNeeded) {
            const { resolve, ticks } = pendingPrepareSettle;
            pendingPrepareSettle = null;
            // Whole-branch review M1: `ticks` is incremented above BEFORE
            // this same arrival's own state is checked, so the bound can be
            // hit on the very tick that reports "armed" — the one case
            // where the generic "no armed state observed" headline would be
            // false (`armedSeen` is only set below, on a tick that never
            // gets here). Behaviour is unchanged (this still expires rather
            // than granting the +1 grace — that grace is earned by an
            // EARLIER tick's `armedSeen`, not this one); only the message
            // is branched, so it never asserts an absence it just
            // contradicted in the same breath.
            log.record(
              "prepare-settle-expired",
              settleState === "armed"
                ? `${ticks} tick(s) elapsed; "armed" was first observed on this very (final) tick — one short of the required +1 grace tick — proceeding without confirmation; the structural readback (verifyArmed, fix-3 Task 4) is the net`
                : `${ticks} tick(s) elapsed with no "armed" state observed (last state: ${settleState}) — proceeding without confirmation; the structural readback (verifyArmed, fix-3 Task 4) is the net`,
            );
            resolve();
          } else if (settleState === "armed") {
            pendingPrepareSettle.armedSeen = true;
          }
        }
      }

      // `program()`'s verification tick pulse (`verifyArmed`, below) — the
      // SAME GENERAL_STATUS_UUID arrival `maybeEmitFrame` just used, per
      // `DriverOptions.verifyTicks`'s own doc comment on why this is a
      // separate budget from `pendingAckTicks` above. Reads `raw.workoutState`
      // directly via `toMonitorFrame` rather than waiting on `maybeEmitFrame`'s
      // own `seen.general && seen.as1 && seen.as2` gate: verification only
      // ever needs `state`, which 0x0031 alone determines, so it must not be
      // held hostage by AS1/AS2 notifications that a real PM sends on the
      // same cadence but that carry fields verification doesn't use.
      //
      // Fix-3 Task 4: the predicate is now `armed` AND the STRUCTURE, read
      // from THIS arrival's own decode (`structure` above — the same tap
      // Task 1's log takes, deliberately not routed through `MonitorFrame`,
      // which has never carried these three fields and gains nothing by
      // starting to; consumers are unchanged by this task).
      if (pendingVerify) {
        const armed = toMonitorFrame(raw as RawPm5Status).state === "armed";
        if (armed && sameStructure(structure, pendingVerify.expected)) {
          const resolve = pendingVerify.resolve;
          pendingVerify = null;
          resolve();
        } else {
          // The N-consecutive-STABLE-mismatch rule
          // (`STRUCTURE_MISMATCH_TICKS`'s own doc comment carries both
          // hardware facts it is built on). A tick that is not a
          // mismatched ARMED tick — the machine mid-cycle, still
          // terminated/idle/rowing — makes no claim about the armed
          // workout at all and restarts the count; so does a mismatched
          // armed tick whose payload differs from the previous one.
          if (armed) {
            const continues =
              pendingVerify.lastMismatch !== null &&
              sameStructure(structure, pendingVerify.lastMismatch);
            pendingVerify.mismatchStreak = continues
              ? pendingVerify.mismatchStreak + 1
              : 1;
            // The wall clock starts with the streak and restarts with it
            // (`mismatchSince`'s own comment): a new payload is a new claim,
            // and the window measures how long ONE claim has held.
            if (!continues) pendingVerify.mismatchSince = now();
            pendingVerify.lastMismatch = structure;
            // The OBSERVATION (what the outer bound's typed reason reads)
            // and the TRACE (written once, at first sighting) are recorded
            // separately on purpose — see `sawArmedMismatch`'s own comment.
            pendingVerify.sawArmedMismatch = true;
            if (!pendingVerify.mismatchLogged) {
              pendingVerify.mismatchLogged = true;
              log.record(
                "structure-mismatch",
                `first sighting — ${describeStructureMismatch(structure, pendingVerify.expected)} (one entry per verify phase, never per tick; a HEALTHY arm whose first tick lagged leaves exactly this entry and still resolves)`,
              );
            }
          } else {
            pendingVerify.mismatchStreak = 0;
            pendingVerify.lastMismatch = null;
            pendingVerify.mismatchSince = null;
          }
          pendingVerify.ticks += 1;
          const { ticks, mismatchStreak, sawArmedMismatch, mismatchSince } =
            pendingVerify;
          const bounded =
            ticks >= (options.verifyTicks ?? DEFAULT_VERIFY_TICKS);
          // BOTH halves, or no verdict (walk 5 —
          // `STRUCTURE_MISMATCH_WINDOW_MS`'s own doc comment carries the
          // two-step structure update this second condition exists for). The
          // streak says the machine is holding STILL; the window says it has
          // held still for longer than any transition anyone has recorded.
          // Three ticks alone was a verdict a faster radio could win: iOS's
          // ~90-180 ms cadence fits three of them inside the PM5's own
          // ~180 ms two-step update, and did, intermittently, at the erg.
          const heldMs = mismatchSince === null ? null : now() - mismatchSince;
          if (
            mismatchStreak >= STRUCTURE_MISMATCH_TICKS &&
            heldMs !== null &&
            heldMs >= STRUCTURE_MISMATCH_WINDOW_MS
          ) {
            settleVerifyFailure(
              "structure-mismatch",
              `${mismatchStreak} consecutive armed tick(s) over ${heldMs}ms reporting the same wrong structure — ${describeStructureMismatch(structure, pendingVerify.expected)}`,
            );
          } else if (bounded) {
            // Which reason the OUTER bound reports depends on what was
            // actually seen. A machine that reached `armed` at least once
            // and disagreed about the structure has told us something
            // specific, even if its wrong payload never held still long
            // enough for the streak to fire; a machine that never armed at
            // all has said nothing about structure and must not be
            // reported as though it had.
            settleVerifyFailure(
              sawArmedMismatch ? "structure-mismatch" : "not-observed",
              sawArmedMismatch
                ? `${ticks} tick(s) elapsed without a matching armed structure — last ${describeStructureMismatch(structure, pendingVerify.expected)}`
                : `${ticks} tick(s) elapsed with no "armed" state observed (last raw workoutState: ${raw.workoutState})`,
            );
          }
        }
      } else if (!armedWatchFired && !programInFlight) {
        // RC-37's own watch (`armedWatch`'s doc comment) — runs on every
        // tick OUTSIDE a verify phase, for as long as a program has ever
        // armed.
        //
        // **`!programInFlight` is NOT redundant with the `pendingVerify`
        // check above (fix round 1, MUST-FIX — an earlier version of this
        // comment claimed the re-arm window was already covered; it was
        // not, and the claim itself was the worse half of the bug).**
        // `pendingVerify` is non-null only during `verifyArmed`, the LAST
        // of `program()`'s four phases (`sendPrepare` ->
        // `waitForPrepareSettle` -> `sendSequence` -> `verifyArmed`).
        // Through the first three, `pendingVerify` is null and
        // `armedProgram()` still returns the OUTGOING program —
        // `activeRun` is replaced only on the success path, after
        // `verifyArmed` resolves. Left ungated, a re-arm in flight ran
        // straight into this watch: `sendPrepare()`'s own Terminate drives
        // the machine through Terminate -> Rearm -> WaitToBegin (state 0,
        // "armed") holding its UNPROGRAMMED default
        // (workoutType=1/durationRaw=0/durationType=128 — RC-37's OWN
        // POSITIVE SHAPE), stably, for as long as the real `sendSequence`
        // send takes — comparing that against the OUTGOING program's
        // now-stale expectation fires a false `structure-left` mid-arm,
        // tearing the driver down while the rower is watching "SENDING THE
        // WORKOUT". `programInFlight` (already used to gate re-entrant
        // `program()` calls, `:5782`/`:5934`) is true across all four
        // phases and false only once `program()`'s own `finally` runs, so
        // gating on it closes the window `pendingVerify` alone does not.
        const armedWorkout = armedProgram();
        const armed = toMonitorFrame(raw as RawPm5Status).state === "armed";
        // `activeRun.freeRow` opts out (Phase JR PR 2), for the same reason
        // the divergence escalation does: this watchdog exists to notice the
        // machine quietly ceasing to hold the workout WE armed, and a free
        // row arms no interval structure to stop holding (the p.80 frame it
        // does send since spec 2026-09-02 carries none — see the divergence
        // opt-out's own note). Opening its run makes `armedWorkout` non-null,
        // so without this the watchdog would compare the machine's readback
        // against a zero-interval program and could report the program
        // dropped on a row that never had one.
        if (armedWorkout !== null && !activeRun?.freeRow) {
          if (!armed) {
            // Left "armed" (rowing/resting/finished/terminated/idle) with
            // no verdict reached — the rower pulled, or the machine cycled
            // on its own. Not itself suspicious (the `armed` gate's own
            // reason, `verifyArmed`'s comment: the structural quadruple
            // legitimately moves mid-session outside "armed"); a streak
            // that had started is the NEAR-MISS worth a ring line.
            if (armedWatch.mismatchStreak > 0) {
              recordArmedWatchRecovered(
                `${armedWatch.mismatchStreak} consecutive armed tick(s) over ${now() - armedWatch.mismatchSince!}ms reporting the wrong structure, then the machine left "armed" before either threshold — ${describeStructureMismatch(armedWatch.lastMismatch!, expectedArmedStructure(armedWorkout))}`,
              );
              armedWatch = {
                lastMismatch: null,
                mismatchStreak: 0,
                mismatchSince: null,
              };
            }
          } else {
            const expected = expectedArmedStructure(armedWorkout);
            if (sameStructure(structure, expected)) {
              // The common case, every armed tick once a program has
              // settled: no allocation unless there was a streak to close
              // out (the near-miss, same reasoning as the `!armed` branch
              // above — a healthy arm whose first tick or two lagged the
              // PM5's own two-step structure update, `STRUCTURE_MISMATCH_
              // WINDOW_MS`'s own doc comment, self-corrects here).
              if (armedWatch.mismatchStreak > 0) {
                recordArmedWatchRecovered(
                  `${armedWatch.mismatchStreak} consecutive armed tick(s) over ${now() - armedWatch.mismatchSince!}ms reporting the wrong structure, then a matching armed tick arrived before either threshold — ${describeStructureMismatch(armedWatch.lastMismatch!, expected)}`,
                );
                armedWatch = {
                  lastMismatch: null,
                  mismatchStreak: 0,
                  mismatchSince: null,
                };
              }
            } else {
              // The N-consecutive-STABLE-mismatch rule, identical to
              // `pendingVerify`'s own above (`STRUCTURE_MISMATCH_TICKS`'s
              // doc comment carries the hardware facts): a payload that
              // keeps changing is a machine still settling, not a machine
              // holding the wrong workout, so only a REPEATED identical
              // wrong reading extends the streak.
              const continues =
                armedWatch.lastMismatch !== null &&
                sameStructure(structure, armedWatch.lastMismatch);
              const mismatchStreak = continues
                ? armedWatch.mismatchStreak + 1
                : 1;
              const mismatchSince = continues
                ? armedWatch.mismatchSince!
                : now();
              const heldMs = now() - mismatchSince;
              // BOTH halves, never one alone (`STRUCTURE_MISMATCH_WINDOW_
              // MS`'s own doc comment — the false economy an antagonist
              // pass already caught in an earlier revision of this spec).
              if (
                mismatchStreak >= STRUCTURE_MISMATCH_TICKS &&
                heldMs >= STRUCTURE_MISMATCH_WINDOW_MS
              ) {
                log.record(
                  "structure-left",
                  `${mismatchStreak} consecutive armed tick(s) over ${heldMs}ms reporting a structure that does not match the sent program — ${describeStructureMismatch(structure, expected)}`,
                );
                armedWatch = {
                  lastMismatch: null,
                  mismatchStreak: 0,
                  mismatchSince: null,
                };
                armedWatchFired = true;
                emit({ kind: "programDropped" });
              } else {
                armedWatch = {
                  lastMismatch: structure,
                  mismatchStreak,
                  mismatchSince,
                };
              }
            }
          }
        }
      }
    },
  );
  mergeStatus(
    SPLIT_INTERVAL_DATA_UUID,
    "0x0037",
    parseSplitIntervalData,
    (decoded) => {
      noteBoundaryHalf("split", decoded.splitIntervalNumber);
    },
  );

  // Fast-follow Task 1 (design spec §5): RAW subscriptions, deliberately
  // NOT routed through `mergeStatus` — 0x0039/0x003A have their own decode
  // (`parseEndOfWorkoutSummary`, not `mergeStatus`'s `Pm5ParseError`-typed
  // idiom) and are never merged into `raw`/`RawPm5Status` (`WorkoutSummary`
  // is a whole-workout total, not a per-tick status field).
  //
  // Receipt is logged for BOTH (`summary-half`, mirroring
  // `noteBoundaryHalf`'s own site/voice) and only 0x0039 GATES the
  // reconcile (Task 2's gate, `noteSummary` — review I5: every field the
  // gate needs rides 0x0039, and waiting on 0x003A would rebuild the drop
  // fragility R1 exists to fix). Receipt is logged FIRST on purpose: a
  // stash must show that the bytes arrived even when the verdict below is
  // that they change nothing.
  t.subscribe(END_OF_WORKOUT_SUMMARY_UUID, (bytes) => {
    noteSummaryHalf("0x0039", bytes);
    noteSummary(bytes);
  });
  // `bytes` (Phase LL Task 1): this callback used to take NO parameter at
  // all — 0x003A's own hex could never reach the ring no matter what
  // (`noteSummaryHalf`'s own updated doc comment has the full reasoning).
  // RC-9d (design spec 2026-08-25-free-oracles §3): `recordRestDistanceVerdict`
  // now reads that hex too, same call-order discipline as 0x0039 above —
  // receipt (`summary-half`) logged first, the decode/verdict second, so a
  // stash always shows the bytes arrived even if the verdict itself
  // suppresses. This is still NOT the reconcile gate: `recordRestDistanceVerdict`
  // writes its own `rest-distance-verdict` ring entry and nothing else,
  // never touching `run.recordedActuals`/`finishGraceUntil` or any other
  // state `noteSummary`'s gate depends on.
  t.subscribe(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, (bytes) => {
    noteSummaryHalf("0x003A", bytes);
    recordRestDistanceVerdict(bytes);
  });

  // 0x003F, the PRODUCTION subscriber (storage-spine design spec §2,
  // delta-pass B3): raw bytes only, same as the two above — no decode
  // lives here (`uuids.ts`'s own doc comment: the byte order is disputed
  // WITHIN the BLE spec itself, unsettled until a hardware walk reads
  // it). Non-critical by omission: this UUID is not in either transport's
  // `CRITICAL_CHARACTERISTICS` set, so a subscribe rejection here degrades
  // (`onCharacteristicDegraded` — LL's existing mechanism, unchanged by
  // this task) rather than ending the session, exactly like the two
  // summary characteristics above. Attributed to whichever run is open AT
  // RECEIPT, same as `noteSummary`'s own `activeRun` read — `null` (no
  // run open) simply leaves nothing to attribute it to, since a bare
  // reading with no workout of ours to belong to is not evidence about
  // any run's finish.
  t.subscribe(LOGGED_WORKOUT_UUID, (bytes) => {
    log.record(
      "verification-received",
      `0x003F received (run ${runIsOpen() ? "open" : "closed"}, state=${toMonitorFrame(raw as RawPm5Status).state}) raw=${toHex(bytes)}`,
    );
    if (activeRun !== null) {
      activeRun.verificationBytes = Array.from(bytes);
      // CALL SITE 4 (final-review fix wave, HIGH-2): the hash's own
      // arrival is the fourth place `maybeReconcileImmediately`'s
      // completeness can newly become true — split and summary may
      // already be in hand, waiting out the short `HASH_SUBWINDOW_MS` this
      // exact byte exists to shorten. A no-op whenever split/summary are
      // not both already held (this run's own guard), same as every other
      // call site.
      maybeReconcileImmediately(activeRun);
      // CALL SITE 5, the terminate path's own (summary-record design spec
      // §1). NOTHING above this line was ever finished-gated — the bytes
      // are attributed to whichever run is open at receipt, closed or not,
      // and `activeRun !== null` is the whole admission — so a rower-ended
      // run's hash already landed on the run object correctly today; what
      // it had no way to do was reach the RECORD, because nothing on the
      // terminate path ever emitted an observations event to carry it.
      // This is that missing trigger: the byte the observations emit is
      // waiting for has arrived, so it goes out NOW rather than at the end
      // of its `HASH_SUBWINDOW_MS`. A no-op on every other run.
      flushTerminateObservations();
    }
  });

  // `terminate()`'s settle-wait tick pulse (design spec §7, interface-
  // notes.md §19.6) AND `sendGetErrorType`'s always-active reply bound
  // (Task 3 review, IMPORTANT-1) — a RAW subscription, deliberately NOT
  // routed through `mergeStatus`. The ORIGINAL reason is gone with Task
  // 4: `mergeStatus` used to `return` on `terminalLatched`, swallowing
  // exactly the ticks the settle wait needs (terminate()'s own ack is
  // usually what CAUSED the latch), and it no longer gates on anything.
  // The reason this stays raw is the OTHER one, which survives intact:
  // neither counter needs a DECODE. `mergeStatus` returns before its
  // `after()` callback whenever a notification fails its length guard, so
  // a garbled General Status would not tick a counter placed in there —
  // yet a garbled frame still proves the radio is alive, which is the
  // only thing these two budgets are counting.
  t.subscribe(GENERAL_STATUS_UUID, () => {
    if (pendingSettle) {
      pendingSettle.ticks += 1;
      if (pendingSettle.ticks >= pendingSettle.ticksNeeded) {
        const resolve = pendingSettle.resolve;
        pendingSettle = null;
        resolve();
      }
    }
    // Only counts while a real ack is still outstanding — if the
    // configured `options.ackTimeout` (a SEPARATE, opt-in bound on the
    // very same `pendingAck`) already fired first, `pendingAck` is
    // already `null` here and this is a no-op, never a double-resolve.
    if (pendingErrorTypeTimeout && pendingAck) {
      pendingErrorTypeTimeout.ticks += 1;
      if (
        pendingErrorTypeTimeout.ticks >= pendingErrorTypeTimeout.ticksNeeded
      ) {
        const resolve = pendingAck;
        pendingAck = null;
        pendingErrorTypeTimeout = null;
        resolve("ack-timeout");
      }
    }
  });

  /** Are two 0x0031 structure triples the same reading? (fix-3 Task 4.)
   *  All three fields, compared exactly — no tolerance anywhere: session
   *  4a read the duration back in the SAME unit this codec encodes it in
   *  (`expectedArmedStructure`'s own doc comment), so a near-miss is a real
   *  disagreement, not rounding. */
  function sameStructure(a: ArmedStructure, b: ArmedStructure): boolean {
    return (
      a.workoutType === b.workoutType &&
      a.workoutDurationRaw === b.workoutDurationRaw &&
      a.workoutDurationType === b.workoutDurationType
    );
  }

  /** The observed-vs-expected phrasing every structural log entry and
   *  rejection detail shares (fix-3 Task 4) — one formatter so the event
   *  log and `ProgramRejectionError.hexTrace` can never describe the same
   *  disagreement two different ways. Both sides carry all three fields
   *  explicitly: "structure mismatch" alone is undiagnosable at the erg,
   *  which is the whole reason this task exists. */
  function describeStructureMismatch(
    observed: ArmedStructure,
    expected: ArmedStructure,
  ): string {
    return `observed workoutType=${observed.workoutType} durationRaw=${observed.workoutDurationRaw} durationType=${observed.workoutDurationType}; expected workoutType=${expected.workoutType} durationRaw=${expected.workoutDurationRaw} durationType=${expected.workoutDurationType} (the sent program's interval 0)`;
  }

  /** Logs one `armedWatch` near-miss, capped at
   *  `STRUCTURE_RECOVERED_LOG_CAP` per run (fix round 1, finding 2) — the
   *  two call sites (self-correction, leaving "armed") share this so the
   *  cap can never drift between them. The CALLER still resets `armedWatch`
   *  unconditionally regardless of whether the cap was already hit: the cap
   *  bounds what gets WRITTEN to the ring, never the detector's own state
   *  machine. */
  function recordArmedWatchRecovered(detail: string): void {
    if (armedWatchRecoveredLogged >= STRUCTURE_RECOVERED_LOG_CAP) return;
    armedWatchRecoveredLogged += 1;
    log.record("structure-mismatch-recovered", detail);
  }

  /** Settles `pendingVerify` with a typed rejection: the general-status
   *  tick handler above calls this on `verifyTicks` expiry
   *  (`reason: "not-observed"`, or `"structure-mismatch"` once an armed
   *  tick has disagreed about the structure) and on the stable-mismatch
   *  rule firing (N consecutive ticks AND the wall-clock window — walk 5,
   *  `STRUCTURE_MISMATCH_WINDOW_MS`); `onDisconnect` calls it with
   *  `reason: "disconnected"` so a real link drop during verification fails
   *  loudly instead of waiting on ticks that will now never arrive. Always
   *  logs the failure (design spec §1: "the full trace in the event log")
   *  before rejecting, same as `sendSequence`'s own `"program-rejection"`
   *  entries for a send-phase failure. */
  function settleVerifyFailure(
    reason: "not-observed" | "disconnected" | "structure-mismatch",
    detail: string,
  ): void {
    // No `if (!pendingVerify) return` guard here: both call sites (the
    // general-status tick handler above, `onDisconnect` below) already
    // check `pendingVerify` before calling — a second check here would be
    // dead code no test path can reach (the same
    // unreachable-by-construction reasoning `emitIntervalComplete`'s
    // `activeRun!` carries).
    const reject = pendingVerify!.reject;
    pendingVerify = null;
    log.record("program-rejection", `${reason} during verify: ${detail}`);
    reject(
      new ProgramRejectionError({ reason, atFrame: -1, hexTrace: detail }),
    );
  }

  /**
   * `program()`'s verification phase (design spec §1, design spec §3:
   * "prepare, ignore rejection, verify"). The ack is not trusted on its own — the
   * first laptop session saw the SAME ack byte (`0x01`) accompany both a
   * real program and a complete no-op (interface-notes.md §18, progress.md's
   * D2). This instead waits for the machine's OWN reported state to reach
   * "armed" (WAITTOBEGIN/COUNTDOWNPAUSE, `pm5/parse.ts`'s `toMonitorFrame`)
   * **AND for 0x0031's own structure fields to describe the workout we just
   * sent** (fix-3 Task 4 — the predicate, the stable-mismatch rule and the
   * hardware that forced both are all spelled out further down; walk 5 added
   * the wall-clock half of that rule, `STRUCTURE_MISMATCH_WINDOW_MS`).
   *
   * NEVER checks the already-cached `raw` value at call time — it always
   * registers `pendingVerify` and waits for the NEXT GENERAL_STATUS_UUID
   * arrival, however soon that turns out to be. Combined with `program()`
   * only ever calling this AFTER `sendSequence` has fully resolved (i.e.
   * after the LAST frame's ack — fix-round 2; fix-round 1's own call site
   * called this BEFORE the first frame even went out), that guarantees the
   * evidence is a status arrival STRICTLY AFTER THE COMPLETE PROGRAM WAS
   * DELIVERED — never a stale reading from before, or from partway
   * through, the send. Two hardware shapes this closes:
   * - Trusting whatever `raw` already said: a STALE cached value satisfies
   *   verification for free. A review reproduced this exactly — the
   *   prepare step gets ACCEPTED (progress.md's D1 update: this happens), the PM's
   *   own Appendix-E auto-cycle (Terminate -> Rearm -> WaitToBegin) reports
   *   "armed" on its own, and a stale read of THAT would satisfy
   *   verification for a completely separate program write that was
   *   actually a total no-op — D2 resurrected through the very phase
   *   built to stop it.
   * - Calling this before the send finished (fix-round 1's own mistake): a
   *   SECOND review reproduced a multi-frame program (several ack-gated
   *   frames) where a stale "armed" tick landing after only the FIRST
   *   frame's ack satisfied verification, with no fresh tick ever
   *   required after the LAST frame — the very property being checked
   *   ("this send" landed) was never actually true for frames 2+.
   *
   * Trade-off accepted on purpose: status frames arrive roughly 2/second
   * continuously on real hardware (interface-notes.md §18), so a machine
   * that reaches "armed" DURING the send still reports it again on its
   * very next tick, well under a second later — waiting for a fresh
   * arrival costs at most one extra tick of latency to make the evidence
   * unambiguous, never a meaningfully longer wait.
   *
   * **THE STRUCTURAL PREDICATE (fix-3 Task 4).** Until this task the check
   * was `state === "armed"` and nothing else, for an honest reason: no
   * hardware session had ever read 0x0031's `workoutType`/
   * `workoutDurationRaw`/`workoutDurationType` back after an accepted
   * program, so gating on them would have been gating on a guess. **SESSION
   * 4a (2026-08-07, PM5 432331249) read them** — interface-notes.md §18
   * "SESSION 4a" is the record, and it ANSWERS interface-notes.md §17 item
   * 12. What it found, and what this function now requires of a fresh
   * post-send arrival:
   * - `state === "armed"`, exactly as before, AND
   * - `workoutType === 8` — stable across TIME, DISTANCE and rest-0 arms,
   *   with no normalization to a rest-less sibling ordinal, so the type is
   *   a real check rather than noise, AND
   * - `workoutDurationRaw`/`workoutDurationType` equal to INTERVAL 0's own
   *   value in its confirmed unit — seconds × 100 at identifier `0` for a
   *   time interval (60s → 6000), whole metres at identifier `128` for a
   *   distance one (500 → 500). The prediction is computed by
   *   `expectedArmedStructure` (`pm5/commands.ts`), which reuses the very
   *   constants the ENCODER puts on the wire, so the two can never drift.
   * The fields also refresh while the machine is merely armed — no rowing
   * is needed for this reading to be current, which is what makes the
   * check usable at all.
   *
   * Why it matters: three separate hardware arms have now reported
   * `"armed"` while holding NOTHING (§19.13's two `:00` empty arms, plus
   * session 4a's own deliberate repro). Every one of them passed the
   * state-only check with clean acks throughout. 4a captured the empty
   * arm's steady state on the wire — `workoutType=1 durationRaw=0
   * durationType=128` — so the shape this predicate rejects is an observed
   * one, not an imagined one.
   *
   * **A SINGLE MISMATCHED TICK NEVER REJECTS**, on 4a's own recorded
   * evidence: it captured MID-CYCLE TRANSIENTS (`type=1` carrying stale,
   * non-zero durations) between the accept and the steady state, and its
   * settle validation measured `"armed" observed on tick 4` twice — a
   * several-tick unsettled window is the observed normal. Rejection needs
   * `STRUCTURE_MISMATCH_TICKS` (3) CONSECUTIVE armed ticks reporting the
   * SAME wrong structure — that constant's own doc comment carries the full
   * provenance, INCLUDING which part of the usual justification is a plan
   * assertion this repo holds no source for (review I-1) — or the outer
   * `verifyTicks` bound, whichever comes first. The mismatch is logged ONCE
   * per verify phase, at first sighting; a healthy arm whose first tick
   * lagged therefore leaves exactly one observation entry and still
   * succeeds.
   *
   * **What this does NOT cover (review L-2), and how 2026-08-09's warmup
   * setting WIDENED it.** 0x0031 carries ONE duration pair, so only
   * INTERVAL 0 can be compared — 4a supports nothing wider. A stale
   * readback from a PREVIOUS program whose interval 0 happens to match
   * therefore passes.
   *
   * When 7B shipped, that collision was INCIDENTAL: library workouts each
   * carried their own `wu` step and many happened to share a 300 s
   * warm-up, so "program Sea Fret, then program the next O2 workout" was
   * the shape to watch. Since the warmup setting (the `wu` step type is
   * gone; `src/session/engine.ts`'s `buildRun` prepends the rower's own
   * preference instead) the collision is SYSTEMATIC for any rower who has
   * a warm-up set: every session they start opens with the SAME
   * preference-derived interval 0, whatever the workout, so every
   * back-to-back program in that rower's day is a false-verify candidate.
   * A warm-up-OFF rower is the opposite case and is now strictly safer
   * than before — interval 0 is the workout's own first work interval,
   * which differs between workouts far more often than a shared warm-up
   * did.
   *
   * What actually mitigates it is unchanged and is NOT this widening's
   * cure: the prepare-settle wait (`waitForPrepareSettle`) is the other
   * half of the defence, and this check still rejects a readback whose
   * TYPE or SCALE is wrong even when the value collides (the
   * expected-structure triple compares `workoutType` and
   * `workoutDurationType` too, so a stale DISTANCE program never passes as
   * a TIME warm-up, and vice versa). What it cannot catch is a stale
   * readback of a program whose interval 0 is byte-identical — which, for
   * a warm-up-on rower, is now the common case rather than a coincidence.
   * 4b carries this on its watch list (`docs/monitor/
   * pm5-interface-notes.md` §18's item-12 entry); widening the comparison
   * is still not available on the evidence.
   *
   * `intervalIndex` genuinely has no such upgrade path, and did not gain
   * one here: it is business-NULL for the entire armed window
   * (`toMonitorFrame`'s own rule — an interval is only ever "current" while
   * rowing/resting). Nor do the three structure fields enter `MonitorFrame`
   * — they are read straight off this arrival's own decode, the same tap
   * Task 1's `"structure"` log entry takes, so no consumer's type changes
   * for a check that is entirely the driver's business.
   *
   * Bounded by `options.verifyTicks` GENERAL_STATUS_UUID ticks — the BOUND
   * is still ticks and only ticks (same tick pulse as `ackTimeout`, tracked
   * as its own budget; see `DriverOptions.verifyTicks`'s doc comment for
   * why). The mismatch VERDICT inside that bound is the one thing here that
   * also reads a clock, since walk 5 proved a tick count cannot express "the
   * machine held still for longer than its own transition takes".
   * **Omitting it means `DEFAULT_VERIFY_TICKS` (30), NOT "no bound"**
   * (semantics changed by this task, for the reason that field's doc
   * comment gives: unbounded + a structure predicate = a hang exactly where
   * detection was wanted). On expiry, on the stable-mismatch rule firing, or
   * on a disconnect first, rejects with `ProgramRejectionError({ reason:
   * "not-observed" | "structure-mismatch" | "disconnected", atFrame: -1 })`
   * — verification has no frames of its own, only ticks.
   */
  function verifyArmed(p: WorkoutProgram): Promise<void> {
    return new Promise((resolve, reject) => {
      pendingVerify = {
        resolve,
        reject,
        ticks: 0,
        expected: expectedArmedStructure(p),
        lastMismatch: null,
        mismatchStreak: 0,
        mismatchSince: null,
        mismatchLogged: false,
        sawArmedMismatch: false,
      };
    });
  }

  /** `terminate()`'s post-ack SETTLE wait (`DriverOptions.settleTicks`'s
   *  own doc comment carries the full citation). Registers fresh and
   *  waits for `ticksNeeded` NEW arrivals — same "never trust an
   *  already-cached tick" discipline as `verifyArmed` — via the raw
   *  GENERAL_STATUS_UUID subscription above, which keeps counting through
   *  the terminal state terminate()'s own ack usually causes (as, since
   *  Task 4, does every other subscription in this file). `ticksNeeded <= 0`
   *  resolves immediately without registering anything — "wait zero
   *  ticks" needs no tick to ever arrive to be satisfied. */
  function settleAfterTerminate(): Promise<void> {
    const ticksNeeded = options.settleTicks ?? DEFAULT_SETTLE_TICKS;
    if (ticksNeeded <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      pendingSettle = { resolve, ticks: 0, ticksNeeded };
    });
  }

  /**
   * `program()`'s PREPARE-SETTLE wait (design spec §1b, fix-3 plan Task 2).
   * Session 3's hardware traces (interface-notes.md §18 "Live bisect")
   * reproduced, twice, with unrelated program shapes, a structurally EMPTY
   * arm — `verifyArmed` passing regardless — whenever `program()`'s leading
   * `sendPrepare()` terminate closed a machine that was still `rowing`. Both
   * traces show the PM's own Terminate -> Rearm -> WaitToBegin auto-cycle
   * (CSAFE-DEF Appendix E) passing through `terminated` AND `idle` before
   * ever reaching `armed` — the confirmed shape (design spec §1b) is
   * **REPRO: rowing → terminated → idle → armed, a ~0.85s PM-clock span;
   * step 5: the same shape, ~0.06s.** (An earlier draft of this comment
   * additionally claimed "terminated ×2" for REPRO and "4 and 5 status
   * ticks" for both — review-corrected: the event log records a `frame`
   * entry only on a state CHANGE, so a repeated `terminated` reading could
   * never appear twice even if the wire sent it twice, and no tick COUNT is
   * recoverable from a log with no timestamps at all. The two PM-clock
   * spans above are the real, verified observations; `DEFAULT_PREPARE_SETTLE_TICKS`'s
   * own comment has the honest tick-budget reasoning.) Neither `terminated`
   * nor `idle` satisfies this wait's RELEASE condition — see below.
   *
   * Arms ONLY when `priorState` (the machine's decoded state read from
   * `raw` at the MOMENT `program()` called `sendPrepare()`, before that
   * step's terminate ever went out) is `"rowing"` or `"resting"` — a
   * program DISPATCHED from any other state (armed/idle/finished/
   * terminated, the ordinary main-menu case) never registers a wait at all,
   * costing zero ticks (the latency pin `DriverOptions.prepareSettleTicks`'s
   * own doc comment names). This is the ENTRY gate's question ("was a piece
   * genuinely running at dispatch?"), answered `rowing` by both hardware
   * observations (§19.13) — a dispatch that instead catches the machine
   * ALREADY reading `terminated`/`idle` from an earlier terminate, still
   * mid-auto-cycle, is unobserved territory this gate deliberately does not
   * rule on (`DriverOptions.prepareSettleTicks`'s own doc comment states
   * the asymmetry explicitly; a 4a runsheet question, not a closed one).
   * `ticksNeeded <= 0` (`prepareSettleTicks: 0`, session 4b's own
   * "detection row") also resolves immediately, same "escape hatch" shape
   * as `settleAfterTerminate`'s own `ticksNeeded <= 0` branch.
   *
   * Task 2 review M2, landed: this wait does NOT borrow `settleTicks`'s
   * "blind ticks after the ack" discipline (`DriverOptions.settleTicks`'s
   * own doc comment — that wait counts ticks regardless of what the
   * machine reports, precisely because its ack means QUEUED, not APPLIED).
   * This wait instead trusts the very FIRST `"armed"` reading it sees after
   * the prepare's own ack, even though that ack carries the identical
   * "queued, not applied" caveat (CSAFE-DEF p.65) — so an `armed` tick CAN
   * predate the PM actually acting on OUR terminate (Probe F: the piece
   * ends naturally just before dispatch, `raw` still reads stale `rowing`
   * so this gate arms, the PM's OWN auto-cycle reaches `armed` while our
   * terminate is still queued, and armed+1 releases before the terminate is
   * even applied). Deliberate, not an oversight: unlike `terminate()`,
   * which has no downstream check of its own and so needs `settleTicks`'
   * blind buffer as its only defence, this wait already has the structural
   * readback (`verifyArmed`, fix-3 Task 4) as the actual net underneath it
   * — a predating `armed` reading here is caught the same way a
   * terminated/idle-skipping one would be. Narrow and unobserved; session
   * 4b's watch-list below carries it.
   *
   * End condition, once armed: an `"armed"` tick FOLLOWED BY one further
   * tick of ANY state — the same "never trust an already-cached tick"
   * discipline `verifyArmed` already applies, here applied to the settle's
   * own evidence rather than final verification's. On SUCCESS, this logs
   * `"prepare-settled"` carrying the tick NUMBER (within this wait) at
   * which `armed` was observed and the +1 tick's own state — review
   * finding I4: this live tick pulse is the first thing in the codebase
   * actually able to MEASURE a dispatch-to-armed span (unlike the
   * historical session-3 log,
   * which carries no timestamps), so a future hardware run gets a real
   * number instead of another derived estimate. On expiry with `armed`
   * never observed, this PROCEEDS (never rejects) and logs
   * `prepare-settle-expired`: the structural readback (`verifyArmed`'s own
   * predicate, built by fix-3 Task 4 — it now really is a net, not a
   * planned one) is the actual net under this wait, so a `program()` that
   * never resolves would trade a survivable, detectable hazard for an
   * unsurvivable one. (Whole-branch review M1: the counter above increments
   * BEFORE this same arrival's own state is checked, so the bound can be
   * hit on the very tick that FIRST reports `armed` — one short of the +1
   * grace this doc comment describes above. The log message branches on
   * that case rather than claiming "no armed state observed" against an
   * arrival that just reported one.)
   *
   * Session 4a VALIDATED this wait twice at the exact session-3 repro:
   * `prepare-settled` reported "armed observed on tick 4" on both runs (the
   * derived 4-5 estimate `DEFAULT_PREPARE_SETTLE_TICKS`'s own comment
   * flagged as UNMEASURED is now measured), and the monitor showed the real
   * workout both times rather than `:00`.
   *
   * A disconnect while this wait is outstanding is the ONE outcome that
   * does NOT proceed — `createPm5Driver`'s `onDisconnect` handler rejects
   * `pendingPrepareSettle` with the same `ProgramRejectionError({reason:
   * "disconnected"})` shape `sendSequence` produces for a disconnect during
   * the real send (see `pendingPrepareSettle`'s own doc comment for why
   * this, unlike `pendingSettle`, cannot simply resolve).
   */
  function waitForPrepareSettle(
    priorState: MonitorFrame["state"],
  ): Promise<void> {
    const ticksNeeded =
      options.prepareSettleTicks ?? DEFAULT_PREPARE_SETTLE_TICKS;
    if (ticksNeeded <= 0) return Promise.resolve();
    if (priorState !== "rowing" && priorState !== "resting") {
      return Promise.resolve();
    }
    log.record(
      "prepare-settle",
      `waiting up to ${ticksNeeded} tick(s) for "armed" (+1 tick) before the real send — prior state was "${priorState}"`,
    );
    return new Promise((resolve, reject) => {
      pendingPrepareSettle = {
        resolve,
        reject,
        ticks: 0,
        ticksNeeded,
        armedSeen: false,
      };
    });
  }

  /**
   * Fires ONE `buildGetErrorType()` after a GENUINE reject during the
   * real programming send (never the prepare/terminate steps — see
   * `sendSequence`'s own `fetchErrorTypeOnNak` option), per CSAFE-DEF
   * p.50 (interface-notes.md §19.7): a `SetProgram` reject is not
   * self-describing, and "the Master must issue a PM-specific
   * GetErrorType command to determine the specific error information".
   *
   * Reuses the SAME `awaitAck()`/`pendingAck` queue every other write goes
   * through — 0xC8's reply arrives on the SAME characteristic (0x0022)
   * every other ack does — but does NOT rely on the caller's OPT-IN
   * `options.ackTimeout` for its own bound: `DriverOptions.errorTypeTicks`
   * (default 3, that field's own doc comment) is ALWAYS active,
   * independent of whatever `ackTimeout` is or isn't configured (Task 3
   * review, IMPORTANT-1 — proven on review with a stub transport, no
   * `ackTimeout`, and a genuine reject: the outer rejection never settled
   * without this). Logged as kind `"error-type"`, RAW HEX ONLY
   * (`buildGetErrorType`'s own doc comment: the pull path's decode is
   * unconfirmed, interface-notes.md §17 item 14) — no claim is
   * ever made about what the bytes MEAN, only what they WERE, or that
   * none arrived. No retries: a second reject here would just be more of
   * the same unconfirmed signal, never new information. The CSAFE-DEF
   * Table 10 ≥50ms inter-frame gap (cited via interface-notes.md §19) is
   * already satisfied by the BLE round trip the FAILED frame's own ack
   * took — nothing here adds a wall-clock delay of any kind.
   *
   * Never throws: whatever this observes (a reply, either timeout, or a
   * disconnect) is logged and this simply returns — the caller's own
   * `"nak"` rejection is unconditional and unaffected either way.
   */
  async function sendGetErrorType(): Promise<void> {
    pendingErrorTypeTimeout = {
      ticks: 0,
      ticksNeeded: options.errorTypeTicks ?? DEFAULT_ERROR_TYPE_TICKS,
    };
    const ackPromise = awaitAck();
    for (const chunk of chunkFrames([buildGetErrorType()])) {
      await t.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    const outcome = await ackPromise;
    // Cleared regardless of which path resolved `outcome` — a real reply,
    // a disconnect, `options.ackTimeout` (if configured), or this
    // function's own always-active bound above all funnel through the
    // same `pendingAck`, and none of them leave anything else to time out.
    pendingErrorTypeTimeout = null;
    log.record(
      "error-type",
      outcome === "disconnected" || outcome === "ack-timeout"
        ? `no reply (${outcome})`
        : toHex(outcome.raw),
    );
  }

  /**
   * `program()`'s LEADING prepare step (design spec §3, interface-notes.md
   * §19.4/§19.5) — this is NOT a clear, and nothing here clears anything.
   * A search of both source documents finds no command that clears or
   * unloads a programmed workout (interface-notes.md §19.5): terminate's
   * documented destination is *Rearm* — Concept2's own word for making
   * the SAME workout ready again — never an empty slot. What terminate
   * actually documents, and why `program()` still leads with it: it is
   * the exit CSAFE-DEF's own Appendix E names from a naturally-finished,
   * parked `WorkoutLogged` state (or any mid-session state) back to
   * `WaitToBegin` (interface-notes.md §19.4 — "the documented client
   * recovery path, and we were not using it"). Without this step, a PM
   * parked in `WorkoutLogged` after a natural finish has no other
   * documented way back to a programmable state; §19.5 additionally
   * records that the WorkoutLogged exit skips Rearm entirely (a straight
   * shot to WaitToBegin), an asymmetry `program()` has to work correctly
   * across either way, which is exactly why this step is unconditional
   * rather than only sent when a session is believed to still be open.
   *
   * ANY non-`"disconnected"` outcome is swallowed here as informational
   * `"prepare-rejected"`, never an error, never a throw (fix-round 1, F3,
   * broadened by Task 3 from "nak or timeout" to "anything but
   * disconnected" now that `sendSequence` can produce `"bad"`/
   * `"not-ready"`/`"garbled"` too — the ORIGINAL rule was always "only a
   * confirmed dead link is fatal here", these two lines just make the
   * code match that stated rule now that more reasons exist).
   *
   * A refusal (`"nak"`) here has **NEVER BEEN OBSERVED ON HARDWARE**
   * (interface-notes.md §18 session 3, item 15) — an earlier version of
   * this comment called it the "expected, routine" case, which was the
   * withdrawn whole-byte parse talking. Item 15 captured the one byte the
   * claim rested on (a standalone terminate to a machine with nothing
   * running: `f1 81 76 01 13 e5 f2`) and it decodes to an ACCEPT. The
   * PM has never refused a terminate, in any state anyone has put it in.
   * The swallow rule below is unchanged and does not depend on that claim
   * either way: it is justified by the broadened rule already stated —
   * only a confirmed dead link is fatal here — and it stays because a
   * prepare step whose outcome we cannot verify must never be the thing
   * that fails a `program()` call. The fake models the refusal only
   * through an explicitly synthetic, never-observed hook
   * (`FakeScript.refuseNextPrepare`), which is what exercises these lines.
   * Only `"disconnected"` propagates: that
   * means the link itself is confirmed down, a genuinely different and
   * fatal condition regardless of which step hit it — attempting to write
   * a whole program onto a link already known to be down would just hang
   * the SEND phase instead of failing where the problem actually is.
   *
   * Whatever this step's outcome, it proves NOTHING about whether the PM
   * is now reachable — no read exists to confirm that. `program()`'s own
   * verification phase (`verifyArmed`, above) is what actually decides
   * success, from the machine's own state after the real programming
   * write.
   */
  async function sendPrepare(): Promise<void> {
    try {
      await sendSequence(buildTerminate(), "prepare-sent", {
        isPrepareStep: true,
      });
    } catch (err) {
      if (
        err instanceof ProgramRejectionError &&
        err.reason !== "disconnected"
      ) {
        log.record(
          "prepare-rejected",
          `PM's response to the prepare step was "${err.reason}" — swallowed, never fatal on its own, and NOT expected: no hardware session has ever seen this machine refuse a terminate (interface-notes.md §18 session 3 item 15; §19.4/§19.5): ${err.hexTrace}`,
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Ack-gated write sequencing (design spec §3): write every chunk of one
   * frame, await exactly one response frame on 0x0022, then move to the
   * next frame — never issuing the next frame's writes before the current
   * one acks. Success is `kind === "parsed" && frameStatus === "ok"`
   * ALONE — toggle and slave state never gate it (`pm5/response.ts`
   * §19.1: the toggle bit alternates on every frame regardless of
   * outcome, and is never a failure signal). Anything else throws a typed
   * `ProgramRejectionError` carrying the full hex trace of everything
   * written/received during this call, with a reason that now tells apart
   * exactly what the wire distinguishes (Task 3, `ProgramRejection`'s own
   * doc comment has the full breakdown): a genuine reject (`"nak"`), the
   * PM's own "bad" or "not ready" statuses, an unparseable frame
   * (`"garbled"` — NOT folded into `"nak"`, today's fixed bug), or the
   * link going down / an ack-timeout policy tripping before any response
   * arrives at all (`"disconnected"`/`"timeout"`).
   *
   * `isPrepareStep` (fix-round 1, F7; renamed with the step itself, Task
   * 3) suppresses the generic `"program-rejection"` log entry for
   * anything but a disconnect — `sendPrepare`'s own caller already logs
   * those as informational `"prepare-rejected"`, and one log entry per
   * refusal is enough (the entry `sendPrepare` writes carries the reason
   * and the hex; this one would add nothing but noise at a severity the
   * step does not have). A
   * `"disconnected"` failure still logs `"program-rejection"` regardless
   * — that one is never swallowed, by either this function or
   * `sendPrepare`.
   *
   * `fetchErrorTypeOnNak` (Task 3, interface-notes.md §19.7) fires ONE
   * `sendGetErrorType()` when — and only when — the failure reason is a
   * genuine `"nak"`: `true` only for the real programming send
   * (`program()`'s own call site), never the prepare or terminate steps,
   * whose `SET_SCREENSTATE` command carries no workout-configuration
   * validation for a GetErrorType to explain (CSAFE-DEF p.50's own
   * "PrevReject" wording is specific to `SetProgram`).
   */
  async function sendSequence(
    sequence: Uint8Array[][],
    completionKind: string,
    options_: {
      isPrepareStep?: boolean;
      fetchErrorTypeOnNak?: boolean;
      /** Fired once every chunk of a frame has been handed to the
       *  transport, BEFORE that frame's ack is awaited. `terminate()` is
       *  the only caller: it is how `disconnect()`'s wait ends at the
       *  moment the bytes are out rather than at the moment the machine
       *  answers — an ack whose only production exit, when the PM5 has
       *  gone quiet, is that very disconnect (`t.onDisconnect`'s M-3
       *  hatch). Called per frame; `terminate()` sends one, and the
       *  release it passes is idempotent, so a multi-frame caller would
       *  simply see the first frame's dispatch. */
      onFrameWritten?: () => void;
    } = {},
  ): Promise<void> {
    const {
      isPrepareStep = false,
      fetchErrorTypeOnNak = false,
      onFrameWritten,
    } = options_;
    // Fix-round 2: purge anything left over from a PREVIOUS sequence
    // before this one's own first frame ever asks the buffer for
    // anything — see `discardStaleAcks`'s own comment. Once, here, not
    // per-frame: a buffered entry that arrives DURING this sequence's own
    // execution (the MED-1 coalescing case) is still legitimate and must
    // survive to the next `awaitAck()` call within this same loop.
    discardStaleAcks();

    const trace: string[] = [];
    for (let frameIndex = 0; frameIndex < sequence.length; frameIndex += 1) {
      const chunks = sequence[frameIndex]!;

      // `awaitAck()` is called — and, on the path where it registers a
      // fresh `pendingAck` rather than serving a buffered response,
      // `pendingAck` is assigned — BEFORE any write goes out, never after.
      // A fake (or a real radio) may deliver its ack notification
      // synchronously from inside `write()`, before that call's returned
      // promise even settles; registering `pendingAck` only after the
      // writes/`await`s would race that delivery and could drop the ack
      // on the floor (observed while building the fake: a same-turn ack
      // arrived while `pendingAck` was still null, and the wait below
      // never resolved — MED-1's buffer is the OTHER half of this fix, for
      // when a SECOND coalesced frame arrives in that same gap). Setting
      // it up first makes the ordering safe regardless of whether the
      // transport acks synchronously or on a later tick.
      const ackPromise = awaitAck();

      for (const chunk of chunks) {
        const hex = toHex(chunk);
        trace.push(`write ${hex}`);
        // Every chunk written is logged as its own entry (kind "write"), in
        // addition to `handleAckFrame`'s "ack" entries — together these
        // give `log.entries()` an exact, directly-filterable command/ack
        // trace ("programming emitted exactly these command/ack pairs",
        // plan Task 4's own required test idiom), independent of the
        // `ProgramRejectionError.hexTrace` string this same data also
        // feeds on a rejection.
        log.record("write", hex);
        await t.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
      }
      onFrameWritten?.();

      const outcome = await ackPromise;

      if (outcome === "disconnected" || outcome === "ack-timeout") {
        const reason = outcome === "disconnected" ? "disconnected" : "timeout";
        trace.push(
          outcome === "disconnected"
            ? "(link down — no ack)"
            : // `options.ackTimeout` is guaranteed set here: "ack-timeout" is
              // only ever produced by the GENERAL_STATUS_UUID handler's own
              // `if (pendingAck && options.ackTimeout)` guard above, so
              // reaching this branch at all proves it was configured.
              `(ack-timeout policy: ${options.ackTimeout!.ticks} tick(s) with no ack)`,
        );
        const hexTrace = trace.join(" | ");
        // F7: "disconnected" always logs (never swallowed by anyone); a
        // prepare-step "timeout" is swallowed by `sendPrepare` (F3), so
        // it's suppressed here too — see this function's own doc comment.
        if (!isPrepareStep || reason === "disconnected") {
          log.record(
            "program-rejection",
            `${reason} at frame ${frameIndex}: ${hexTrace}`,
          );
        }
        throw new ProgramRejectionError({
          reason,
          atFrame: frameIndex,
          hexTrace,
        });
      }

      const response = outcome.response;
      trace.push(`ack ${describeResponse(response)}`);
      if (response.kind === "unparseable" || response.frameStatus !== "ok") {
        // Task 3 (pm5/response.ts §19.1): the wire distinguishes FOUR
        // non-"ok" shapes, and this driver now keeps them apart rather
        // than folding every one of them into `"nak"` (the bug this task
        // fixes) — `"garbled"` in particular MUST stay distinct from
        // `"nak"`: a frame this driver could not even validate is not the
        // same statement as the PM explicitly answering "reject".
        const reason: ProgramRejectionReason =
          response.kind === "unparseable"
            ? "garbled"
            : // TS can't carry "the outer `||` proved `frameStatus !== 'ok'`"
              // through this ternary's own re-check of `kind` — the cast
              // states what the outer condition already guarantees rather
              // than re-deriving it with a redundant runtime branch.
              REJECTION_REASON_BY_FRAME_STATUS[
                response.frameStatus as Exclude<CsafeFrameStatus, "ok">
              ];
        const hexTrace = trace.join(" | ");
        // F7: a prepare-step refusal is never fatal (`sendPrepare`'s own
        // doc comment — and, per §18 s3 item 15, never observed either) and
        // it already logs "prepare-rejected" itself, so logging THIS too
        // would double-report one swallowed outcome as a rejection.
        if (!isPrepareStep) {
          log.record(
            "program-rejection",
            `${reason} at frame ${frameIndex}: ${hexTrace}`,
          );
        }
        // interface-notes.md §19.7 (CSAFE-DEF p.50): a genuine reject
        // during the real programming send is not self-describing — fire
        // the one documented follow-up before rejecting. Never for
        // `"bad"`/`"not-ready"`/`"garbled"`, and never for the
        // prepare/terminate steps (`fetchErrorTypeOnNak` is `true` only
        // at `program()`'s own real-send call site).
        if (reason === "nak" && fetchErrorTypeOnNak) {
          await sendGetErrorType();
        }
        throw new ProgramRejectionError({
          reason,
          atFrame: frameIndex,
          hexTrace,
        });
      }
    }
    log.record(completionKind, `${sequence.length} frame(s) acked`);
  }

  return {
    capabilities,

    /**
     * Phase JR PR 2: open a run for the PM5's own Just Row — and, since
     * spec 2026-09-02, put the erg INTO it: send Concept2's p.80 JustRow
     * program (`buildJustRowProgram`) so the PM5 leaves its main menu when
     * the link comes up, instead of waiting for the first pull.
     *
     * This is the free row's counterpart to `program()`, and it exists
     * because `activeRun` had exactly one assignment — inside `program()` —
     * so a rower on the machine's own mode left this driver holding no run
     * at all. Everything gated on `runIsOpen()` was therefore dark for the
     * whole row: no `terminated` on the rower's Menu press, no 0x0039 filed,
     * and boundaries routed as if they belonged to nobody.
     *
     * DELIBERATELY SYNCHRONOUS in everything the hook reads, unlike
     * `program()`: the run opens and this returns before any ack, so the
     * hook's `ready` flip stays one indivisible step with it. The send is
     * DETACHED — `void`, its only effects ring entries — and NOTHING on the
     * phone branches on its outcome (ruling 2): the erg's own screen is the
     * acknowledgment, and the readback that would verify it
     * (0x0031 `workoutType = 1`) is also the machine's idle-after-terminate
     * default (`EMPTY_ARM_STRUCTURE`), so it verifies nothing. `program()`'s
     * prepare-settle wait and structural readback establish that the
     * machine holds OUR workout, a question a free row does not raise.
     *
     * NO PREPARE, and this is load-bearing (spec §Research): `program()`
     * sends `buildTerminate()` before any run exists, but this call opens
     * the run FIRST, and a terminate with a run open is the row's own END
     * byte for byte — `maybeEmitFrame`'s terminal branch would close the
     * run on the machine's `terminated`. The `freeRow` opt-outs (the
     * divergence escalation and the RC-37 watch) do not cover that branch.
     * So the p.80 frame goes alone; a program replaces a loaded workout
     * (interface-notes.md §19.1 verdict (b)).
     *
     * ORDER: the run is open (and `free-row-open` recorded) before the
     * first byte is written — `activeRun.freeRow` is what holds the RC-37
     * watch and the divergence escalation off during the send, and
     * `sendSequence` issues its first write synchronously, inside this
     * call. The sequence is built BEFORE `programInFlight` is set, so a
     * builder throw can never strand the flag. The send holds
     * `programInFlight` for its duration (so `terminate()` WAITS it out on
     * `freeRowSendSettled` rather than sharing the one ack slot) and races
     * a `FREE_ROW_PROGRAM_DEADLINE_MS` deadline (so a transport that never
     * answers cannot hold it forever). Outcomes, all to the ring:
     * `free-row-program-sent` (written by `sendSequence` itself as its
     * completion kind — not logged twice here), `free-row-program-
     * unanswered` on the deadline, `free-row-program-failed` with the hex
     * trace on a NAK/garble/disconnect, or `String(err)` for the
     * transport's own plain rejections (the fake's "unexpected write",
     * `capacitorBle`'s post-disconnect throw), which carry no `hexTrace`.
     * The handlers never throw — a throwing handler on a `void` chain is
     * an unhandled rejection.
     *
     * Idempotent against an open run: a second call while one is live is
     * ignored rather than replacing it, so a stray re-entry cannot silently
     * discard a row in progress.
     */
    beginFreeRow(): void {
      if (runIsOpen()) {
        log.record(
          "free-row-ignored",
          "beginFreeRow() while a run is already open — ignored",
        );
        return;
      }
      activeRun = {
        program: { intervals: [] },
        freeRow: true,
        closed: false,
        actuals: 0,
        recordedActuals: new Map(),
        lastActiveState: null,
        finishGraceUntil: null,
        summaryInGrace: null,
        graceClaimed: false,
        verificationBytes: null,
        terminatedAwaitingSummary: false,
        finalFilledFromSummary: false,
      };
      log.record(
        "free-row-open",
        "opened a free row; sending the PM5 its Just Row program (CSAFE-DEF p.80), no prepare",
      );
      const sequence = buildJustRowProgram();
      programInFlight = "beginFreeRow()";
      let cancelDeadline: (() => void) | null = null;
      const deadline = new Promise<"unanswered">((resolve) => {
        cancelDeadline = schedule(
          () => resolve("unanswered"),
          FREE_ROW_PROGRAM_DEADLINE_MS,
        );
      });
      freeRowSendSettled = Promise.race([
        sendSequence(sequence, "free-row-program-sent").then(
          (): "sent" => "sent",
        ),
        deadline,
      ])
        .then(
          (outcome) => {
            if (outcome === "unanswered") {
              log.record(
                "free-row-program-unanswered",
                `no ack within ${FREE_ROW_PROGRAM_DEADLINE_MS}ms — send abandoned, the row proceeds regardless (ruling 2)`,
              );
            }
          },
          (err: unknown) => {
            log.record(
              "free-row-program-failed",
              err instanceof ProgramRejectionError ? err.hexTrace : String(err),
            );
          },
        )
        .finally(() => {
          cancelDeadline?.();
          programInFlight = false;
          // Cleared here, in the same statement's own `finally`, so the
          // wait `terminate()` takes is exactly as long as the send is
          // live and not one microtask longer (`freeRowSendSettled`'s own
          // lifetime paragraph). A `terminate()` already suspended on this
          // chain holds its own reference and resumes normally.
          freeRowSendSettled = null;
        });
    },

    // D1 IS WITHDRAWN (interface-notes.md §19.2, on §19.1's per-send
    // re-derivation table), and this comment used to assert it: "a REJECTED
    // program WIPES whatever workout was already loaded", plus the rule
    // that the PM "accepts only when idle". Both were our own parse bug —
    // every byte §18 recorded as a rejection decodes to an ACCEPT under the
    // CSAFE bitfield, so the rule had no evidence and the wipe was only the
    // mechanism invented to explain the toggle's alternation. What §19.1's
    // Verdict (b) established instead: a program over a loaded workout is
    // accepted and REPLACES it.
    //
    // Nothing below ever depended on either claim: prepare/send/verify was
    // designed to survive not knowing the state model, and still is. The
    // one thing 7B should still do before calling — confirm with the rower
    // that the monitor is theirs to overwrite — now rests on §19.1's
    // Verdict (a), the `:00` display that is STANDING OPEN, rather than on
    // a destruction claim that did not survive (`MonitorDriver.program`'s
    // own JSDoc, `domain/monitor/types.ts`, carries the full statement).
    //
    // Three phases, plus one conditional one (design spec §3, §1b):
    // `sendPrepare()` is the documented exit to WaitToBegin (interface-
    // notes.md §19.4/§19.5) — NOT a clear, nothing here clears anything —
    // with any non-disconnect outcome swallowed as routine (fix-round 1,
    // F3; broadened by Task 3, see `sendPrepare`'s own doc comment);
    // `waitForPrepareSettle` (fix-3 Task 2) then waits for the machine to
    // finish reacting to that terminate, but ONLY if it was still
    // `rowing`/`resting` when the terminate was sent — see that function's
    // own doc comment for the hardware traces this exists to survive;
    // `sendSequence` is the real ack-gated programming send, now firing
    // `sendGetErrorType` on a genuine reject (Task 3); `verifyArmed` is what
    // actually decides
    // success, from the machine's OWN reported state observed STRICTLY
    // AFTER the COMPLETE send (fix-round 2 — fix-round 1's own snapshot
    // point, taken before the first frame went out, was too early: a
    // reviewer showed a stale "armed" tick landing after only frame 1 of
    // a multi-frame program satisfied verification with no fresh tick
    // ever required after the LAST frame) — never the ack alone (D2: the
    // identical ack byte has meant both "programmed" and "nothing
    // happened at all" on real hardware), and never a stale observation
    // from any point during the send either (verifyArmed's own doc
    // comment).
    async program(p: WorkoutProgram): Promise<void> {
      // This task's single-flight gate (`ProgramBusyError`'s own doc
      // comment) — checked FIRST, before anything else in this method,
      // including the `stateAtPrepare` snapshot below: a busy rejection
      // must cost NOTHING, not even a read of `raw`, so it can never be
      // mistaken for genuine progress on the call it is refusing to start.
      if (programInFlight) {
        throw new ProgramBusyError(programInFlight);
      }
      programInFlight = "program()";
      try {
        // Fix-3 Task 2 (design spec §1b): the machine's state AT THE MOMENT
        // the prepare is about to be sent — read from `raw` directly (never
        // from a fresh notification; this is a snapshot of whatever the
        // driver already knows, the same source `verifyArmed`'s tick pulse
        // reads), BEFORE `sendPrepare()` ever dispatches its terminate. This
        // is what `waitForPrepareSettle` gates on: only a machine that was
        // genuinely `rowing`/`resting` right now can have its terminate land
        // on a RUNNING piece, the one condition session 3 reproduced the
        // empty arm from (`waitForPrepareSettle`'s own doc comment).
        const stateAtPrepare = toMonitorFrame(raw as RawPm5Status).state;
        await sendPrepare();
        await waitForPrepareSettle(stateAtPrepare);
        await sendSequence(buildProgrammingSequence(p), "programmed", {
          fetchErrorTypeOnNak: true,
        });
        // Fix-round 2: called only AFTER the full send resolves — i.e.
        // after the LAST frame's ack, not before the first frame went out.
        // A multi-frame program's send can itself span several general-status
        // ticks; an "armed" reading from partway through it is not evidence
        // that THIS complete program landed, only that the machine was armed
        // at SOME point before the send finished (see verifyArmed's own doc
        // for why waiting here, never trusting anything already cached, is
        // the correct trade-off, not an overcorrection).
        await verifyArmed(p);
        // THE ONE PLACE A RUN IS OPENED (Task 4, spec §4 — `activeRun`'s own
        // doc comment has the full reasoning). Deliberately here, on the
        // success path past verification, and deliberately nowhere else: no
        // state word, no `armed` tick, no boundary and no reconnect ever
        // opens a run, because the PM's own Terminate -> Rearm ->
        // WaitToBegin cycle produces all of those unaided and would
        // otherwise fabricate runs out of housekeeping.
        //
        // Any PREVIOUS run — open or closed — is replaced outright, which is
        // what makes a second workout possible in one driver lifetime with
        // no reconnect (the §19.4 regression this task fixes). Replacing an
        // OPEN one is the single lifecycle transition with no event of its
        // own: that run closes without a `workoutComplete`/`terminated`
        // (stated on `MonitorEvent`, `domain/monitor/types.ts`), so it gets
        // a `run-replaced` entry instead — every other transition here is
        // already visible in the trace, and a run ending in silence is the
        // exact class of invisibility §19.4 punished. The realistic
        // hardware path does NOT reach this branch: `program()`'s own
        // leading prepare Terminate makes the PM report "terminated" first,
        // which closes run 1 through the normal path with a real event. So
        // this entry marks the shape that would otherwise be a mystery in a
        // trace, not the common one. A boundary
        // half still waiting for its partner belongs to the run being
        // replaced, so it is dropped here rather than left to pair with the
        // NEW run's first boundary: `noteBoundaryHalf`'s pairing gate
        // matches on the Split/Interval NUMBER, and both runs number their
        // splits from the same low integers, so a cross-run pairing is
        // otherwise entirely constructible (it would emit this run's
        // identity carrying the last run's averages — D4's corruption, one
        // level up).
        if (runIsOpen()) {
          log.record(
            "run-replaced",
            `program() replaced a run that was still OPEN (its ${activeRun!.program.intervals.length}-interval program had accumulated ${activeRun!.actuals} actual(s)) — that run closes here with no workoutComplete/terminated event of its own`,
          );
        }
        if (boundaryHalves.split !== null || boundaryHalves.asSplit !== null) {
          log.record(
            "boundary-orphan",
            `a boundary half was still pending when a new run opened (0x0037=${boundaryHalves.split}, 0x0038=${boundaryHalves.asSplit}) — discarded rather than paired with the new run's first boundary`,
          );
        }
        boundaryHalves.split = null;
        boundaryHalves.asSplit = null;
        // The session register map is per-RUN state for the same reason a
        // pending boundary half is (`session`'s own doc comment): a new
        // program's totals start at zero, and the outgoing run's keys must
        // not be carried into it — the new run's first frame would otherwise
        // max-merge into a key that belongs to a workout it never saw.
        session = { seen: new Map() };
        // `refusedKeysLogged`'s own comment: the gate is per-run state,
        // same as `session` it rides alongside — a re-armed run's own
        // first refusal is a new fact, not a repeat of the outgoing run's.
        refusedKeysLogged = new Set();
        // `clampedKeysLogged`'s own comment: the gate is per-run state,
        // same as `session` and `refusedKeysLogged` it rides alongside — a
        // re-armed run's own first clamp is a new fact, not a repeat of
        // the outgoing run's.
        clampedKeysLogged = new Set();
        // `splitAvgPaceProvenanceIndex`'s own comment: per-run state, same
        // reason — the outgoing run's last AS2 sample says nothing about
        // the new run's own interval numbering.
        splitAvgPaceProvenanceIndex = null;
        // Diagnostics-only (R0, Task 1's own doc comment): the outgoing
        // run's last-seen totals belong to that run, not the new one.
        lastEmittedTotals = { elapsedSeconds: 0, distanceMeters: 0 };
        // M5 (review): `lastLoggedTwd` is the same kind of per-run
        // diagnostic state as `lastEmittedTotals` right above it — reset it
        // alongside its siblings so a re-arm's very first `"twd-sample"`
        // entry is judged against nothing carried from the outgoing run,
        // not against a bucket that workout happened to leave `twd` in.
        lastLoggedTwd = null;
        // RC-9a: the outgoing run's last work-state 0x0032 reading says
        // nothing about the new run's own average — same "per-run
        // diagnostic, reset on re-arm" reasoning as every field in this
        // block.
        lastWorkStateAverageSplit = null;
        // `summarySeen`'s own comment (Task 8): whether a 0x0039 arrived is
        // a fact about THIS run, and a re-arm's own summary has not arrived
        // yet just because the outgoing run's did.
        summarySeen = false;
        // RC-37 (`armedWatch`'s own doc comment): the outgoing program's
        // leftover mismatch streak says nothing about the incoming one —
        // same per-run reset discipline as every field in this block.
        armedWatch = {
          lastMismatch: null,
          mismatchStreak: 0,
          mismatchSince: null,
        };
        armedWatchFired = false;
        // Fix round 1, finding 2: the near-miss log cap is per-run state
        // too, same reset discipline as `armedWatch`/`armedWatchFired`
        // immediately above.
        armedWatchRecoveredLogged = 0;
        // A reconcile deadline still standing belongs to the run being
        // replaced, and is cancelled here for the same reason a pending
        // boundary half is dropped above (fast-follow Task 2): both are
        // the OUTGOING run's unfinished business, and letting either reach
        // the new run would have it speak about a workout it never saw.
        // `armSummaryReconcile`'s own identity guard is the second line of
        // defence; this is the first.
        pendingSummaryReconcile?.();
        pendingSummaryReconcile = null;
        // The terminate path's own deadline, cancelled for the identical
        // reason one line up (summary-record design spec §1): an
        // observations emit still waiting on 0x003F belongs to the run
        // being replaced, and firing it against the new one would fold a
        // dead workout's numbers onto a live record.
        pendingTerminateObservations?.cancel();
        pendingTerminateObservations = null;
        activeRun = {
          program: p,
          freeRow: false,
          closed: false,
          actuals: 0,
          recordedActuals: new Map(),
          lastActiveState: null,
          finishGraceUntil: null,
          summaryInGrace: null,
          graceClaimed: false,
          verificationBytes: null,
          terminatedAwaitingSummary: false,
          finalFilledFromSummary: false,
        };
        log.record("armed", `programmed ${p.intervals.length} interval(s)`);
        emit({ kind: "armed" });
      } finally {
        // Cleared on EVERY exit — resolve, every reject (a typed
        // `ProgramRejectionError` of any reason including `"disconnected"`,
        // or anything else the three phases above could throw) — never
        // only on the success path (`programInFlight`'s own doc comment).
        programInFlight = false;
      }
    },

    // `terminate()`'s ack means the documented `SET_SCREENSTATE` command
    // was received and QUEUED, never that the PM has actually acted on it
    // (interface-notes.md §19.6, CSAFE-DEF p.65) — so this waits
    // `settleAfterTerminate()`'s tick-bounded delay (design spec §7,
    // `DriverOptions.settleTicks`'s own doc comment) before resolving,
    // rather than reporting success the instant the ack lands. The
    // documented, precise fix (`CSAFE_PM_GET_SCREENSTATESTATUS`) is
    // deliberately NOT built — its pull-command wrapper is itself an
    // unresolved conflict between the two source documents, the same one
    // `buildGetErrorType` cites at its own definition (interface-notes.md
    // §17 item 14).
    async terminate(): Promise<void> {
      // Spec 2026-09-02 ruling 4, REVISED rev 5 by the 2026-09-03 walk:
      // this WAITS OUT `beginFreeRow()`'s bounded p.80 send; it does not
      // refuse it. The wait is what the ONE `pendingAck` slot needs (the
      // matcher is arrival-order only and never reads the ack's command
      // byte, so an interleaved terminate would strand whichever
      // registered first), and it is bounded by the send's own
      // `FREE_ROW_PROGRAM_DEADLINE_MS` ceiling.
      //
      // It refused until this revision. BE PRECISE ABOUT WHAT THE WALK
      // SAW, because an earlier draft of this comment was not: the
      // 2026-09-03 walk's finding 4 — James at the erg, watching the
      // monitor not move after Cancel — did NOT come through here. Its
      // ring 3 shows the Cancel 1589 ms after the send's own ack, so
      // `programInFlight` was already `false` and nothing refused; the
      // cause was the hook's `mode !== "justrow"` exclusion, fixed in
      // `useMonitorSession.ts`. The refusal is a SEPARATELY reachable
      // defect (an END or a Cancel inside the ~2 s ack window), fixed here
      // as hardening rather than as an observed cause. There is no caller
      // for whom "your END did not reach the machine" is a better answer
      // than a wait of at most one deadline — both swallow the rejection,
      // so a refusal is silent by construction. `program()`'s hold is not waited on for the
      // separate reason its own doc comment gives: the hook's teardown
      // interleaves a terminate with a live `program()` on purpose.
      //
      // FIRST, before the finals below, so that everything after this line
      // — the finals and the terminate write they describe — runs in one
      // uninterrupted stretch. The finals are a snapshot of the run this
      // call is ending; taking it before a wait that can last a deadline
      // would date it.
      //
      // THE HANG-UP CANNOT OVERTAKE THIS (delta pass, PR #278). Because
      // this call can suspend below before it has written a byte, it
      // registers the write it OWES first — `disconnect()` waits for that
      // debt to clear before it hangs up, so the ordering holds no matter
      // how long the wait runs or which caller fires the hang-up.
      // `terminateWritesOwed`'s own comment carries the measured race.
      const terminateWritten = noteTerminateWriteOwed();
      try {
        if (freeRowSendSettled !== null) {
          await freeRowSendSettled;
        }
        // TERMINATE-DISPATCH FINALS (Task 7, "one terminal path" — spec 1's
        // re-walk: "the ring ended at the terminate write"). The END/cancel
        // path's own terminated status frame — the trigger `maybeEmitFrame`'s
        // terminal branch waits for — routinely arrives AFTER the hook's
        // teardown has already stashed and hung up the radio, so waiting for
        // it here would lose the `final-totals` entry the same way it did
        // before this task. Writing it from THIS call instead means the
        // caller-initiated ending's own totals are in the ring before this
        // promise even resolves, however long the machine's own frame takes.
        //
        // Guarded on an OPEN run (`recordFinalTotals`'s own doc comment):
        // nothing to summarize before `program()` ever opened one, and a run
        // the machine's own frame already closed already told its one story
        // through that call site — this never re-tells a shorter version of
        // it.
        if (activeRun !== null && !activeRun.closed) {
          recordFinalTotals(activeRun);
        }
        await sendSequence(buildTerminate(), "terminate-sent", {
          onFrameWritten: terminateWritten,
        });
        await settleAfterTerminate();
      } finally {
        // Belt to `onFrameWritten`'s braces: a call that threw before its
        // write — a builder throw, a transport that rejects the write
        // itself — still owes nothing, and leaving the debt standing would
        // hang the next `disconnect()` instead of merely ordering it. The
        // release is idempotent, so the ordinary path runs it twice to no
        // effect.
        terminateWritten();
      }
    },

    events(cb: (e: MonitorEvent) => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    // Task 7: applies the F7 rule (`drainSummaryReconcile`'s own doc
    // comment carries the full reasoning) rather than merely cancelling —
    // the twin defect this task fixes was this method throwing away a
    // reconcile-eligible verdict just because the caller hung up first,
    // where a passive drop (`t.onDisconnect` above) already answered it.
    // Idempotent with the hook's own `reconcile()` call, which normally
    // runs first (`useMonitorSession.ts`'s `teardown`, while the listener
    // is still live) and leaves nothing here to drain — this call is the
    // belt to that braces for any OTHER caller of `disconnect()`.
    reconcile(): void {
      drainSummaryReconcile();
    },

    async disconnect(): Promise<void> {
      log.record("disconnect-requested", "caller-initiated");
      // A TERMINATE STILL OWED ITS WRITE GOES FIRST (delta pass, PR #278 —
      // `terminateWritesOwed`'s own comment carries the measured race and
      // Apple's "any pending commands ... may not complete"). The wait is
      // bounded by exactly what `terminate()` can block on before it
      // writes: `freeRowSendSettled`, itself capped at
      // `FREE_ROW_PROGRAM_DEADLINE_MS`. It deliberately does NOT cover the
      // rest of `terminate()` — its ack and its settle ticks, whose only
      // production exit (no `ackTimeout` is configured) is the
      // `t.onDisconnect` hatch this very call is about to fire. Waiting on
      // those would not be a longer bound; it would be a deadlock.
      if (terminateWritesOwed > 0) {
        log.record(
          "disconnect-deferred",
          `${terminateWritesOwed} terminate write(s) still owed — holding the hang-up`,
        );
        await terminateWritesDrained;
      }
      // The caller is done with this driver, so its one timer goes with it
      // either way (fast-follow Task 2) — draining rather than merely
      // cancelling (Task 7) answers it first, using whatever evidence this
      // run has already earned, rather than discarding a verdict the radio
      // going away could not actually invalidate. No summary can arrive
      // after the radio really is hung up below, so nothing is deferred
      // past this line — and a driver that leaves live timers behind is a
      // driver a test cannot finish cleanly.
      drainSummaryReconcile();
      await t.disconnect();
    },
  };
}
