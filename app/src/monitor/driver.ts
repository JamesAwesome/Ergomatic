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
  parseGeneralStatus,
  parseSplitIntervalData,
  toIntervalActual,
  toMonitorFrame,
  type Pm5ParseError,
  type RawPm5Status,
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
  GENERAL_STATUS_UUID,
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
 *    write"; fix-round HIGH-2). There is no wall clock anywhere in this
 *    driver for either "no response is coming" signal: `"disconnected"`
 *    is learned from the transport's own event, `"timeout"` is counted in
 *    general-status TICKS (see `createPm5Driver`'s `ackTimeout` option),
 *    never `Date.now()`/`setTimeout`.
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
 *    `verifyArmed`'s own doc comment for the predicate and the
 *    N-consecutive rule.
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
  readonly name = "ProgramBusyError";

  constructor() {
    super(
      "program() is already in flight on this driver — a second call must wait for the first to settle (resolve or reject) before it may be dispatched",
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
   * bound" — it means the DEFAULT, `20`** (`DEFAULT_VERIFY_TICKS`, the
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
   * count rather than a literal wall-clock second, same "no wall clock,
   * ever" rule as every other tick budget in this file.
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
   * The advertised name `Transport.scan()` returned for the device the
   * caller connected to (`DiscoveredMonitor.name`, `domain/monitor/
   * types.ts` — e.g. "PM5 432331249") — 7B's scan/connect flow is expected
   * to thread its own scan result straight through here (ROADMAP's own
   * obligation: `createPm5Driver`'s old two-argument signature had no
   * `DiscoveredMonitor` to source a real name from at all). Flows verbatim
   * into `capabilities.deviceName`. Omitted (the constructor is still
   * reachable with no name at all — a caller mid-migration, or a test with
   * nothing to assert about the name) falls back to the literal `"PM5"`
   * placeholder, same as before this option existed; never fabricated from
   * anything else.
   */
  deviceName?: string;
}

/** `DriverOptions.settleTicks`'s own default — see that field's doc
 *  comment for why "omitted" means this number, not "no bound". */
const DEFAULT_SETTLE_TICKS = 3;

/** `DriverOptions.verifyTicks`'s own default (fix-3 Task 4) — the number
 *  `scripts/pm5-lab.ts` already reasoned its way to against the OBSERVED
 *  ~2 Hz status cadence (interface-notes.md §18), i.e. ~10 real seconds:
 *  generous enough to absorb the PM's own Appendix-E auto-cycle plus BLE
 *  jitter, still bounded. Promoted from "the lab's local constant" to the
 *  driver's default because verification now carries a STRUCTURE predicate
 *  and an unbounded verify under one is a hang, not a leniency — see
 *  `DriverOptions.verifyTicks`'s own doc comment. The lab's explicit `20`
 *  is now redundant and deliberately left in place: it documents the
 *  reasoning at the call site that first needed it. */
const DEFAULT_VERIFY_TICKS = 20;

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
 *  backstop for a machine whose wrong payload never stabilizes at all. */
const STRUCTURE_MISMATCH_TICKS = 3;

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
  // "PM5 432331249"). Falls back to the literal `"PM5"` placeholder ONLY
  // when no name was given at all — never fabricated from anything else,
  // and never shown to a screen that had a real name available.
  const capabilities: MonitorCapabilities = {
    canProgram: true,
    hasStrokeRate: true,
    reportsIntervals: true,
    deviceName: options.deviceName ?? "PM5",
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
    closed: boolean;
    /** How many actuals this run has accumulated — kept only so the
     *  `run-replaced` entry can say what a silently-replaced run was
     *  holding (fix round: an open run replaced by a new `program()` is
     *  the one lifecycle transition with no event of its own). Counted at
     *  the single in-run `intervalComplete` emission; out-of-run
     *  boundaries belong to no run and are counted nowhere. */
    actuals: number;
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
   *  get wrong). */
  let programInFlight = false;
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
   *  reading `activeRun` directly (the disconnect classification below). */
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
   * Fix-round HIGH-2 (re-rooted per review): sourced from 0x0033's own
   * "Last Split Time"/"Last Split Distance" fields (`RawPm5Status.
   * lastSplitTimeSeconds`/`lastSplitDistanceMeters`, interface-notes.md
   * §10 offset 14-19) — the session-cumulative point at which the CURRENT
   * interval began, reported on EVERY regular status tick, needing no
   * local observation history at all. `frame.elapsedSeconds`/
   * `distanceMeters` minus that pair is "how far into this interval",
   * correct on the VERY FIRST tick the driver ever observes for a given
   * interval (unlike an earlier version of this function, which rooted a
   * checkpoint at whichever tick it happened to see first — permanently
   * wrong for any interval whose first observed tick wasn't also its
   * true start, e.g. a late-arriving first tick, or a reconnect that
   * skipped straight into the interval already in progress; see the
   * report and interface-notes.md §15 #8 for the assumption this now
   * rests on instead). No driver-local state is needed to compute this —
   * every input is read straight from the current merged `raw`/`frame`.
   */
  function computeRemainingForFrame(
    frame: MonitorFrame,
  ): MonitorFrame["intervalRemaining"] {
    const p = armedProgram();
    if (!p || frame.intervalIndex === null) return null;
    const interval = p.intervals[frame.intervalIndex];
    const status = raw as RawPm5Status;
    const progress =
      interval?.kind === "distance"
        ? frame.distanceMeters - status.lastSplitDistanceMeters
        : frame.elapsedSeconds - status.lastSplitTimeSeconds;
    return computeIntervalRemaining(interval, progress);
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
    // value, per this task's own contract: intervalIndex/actual.index carry
    // OUR index everywhere they reach a consumer, the raw value survives
    // only in the event log below).
    const p = armedProgram();
    const programLength = p?.intervals.length ?? 0;
    const intervalIndex = toProgramIndex(
      status.intervalCount,
      base.state,
      programLength,
    );
    const frameWithIndex: MonitorFrame = { ...base, intervalIndex };
    const frame: MonitorFrame = {
      ...frameWithIndex,
      intervalRemaining: computeRemainingForFrame(frameWithIndex),
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
    if (p && intervalActive && intervalIndex === null) {
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
      log.record(
        "frame",
        `state=${frame.state} elapsed=${frame.elapsedSeconds} distance=${frame.distanceMeters}`,
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
    if (frame.state === "finished") {
      log.record("terminal", "finished");
      emit({ kind: "workoutComplete" });
    } else {
      log.record("terminal", "terminated");
      emit({ kind: "terminated" });
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

  function emitIntervalComplete(): void {
    announceReconnectIfPending();
    const status = raw as RawPm5Status;
    const rawActual = toIntervalActual(status);
    const state = toMonitorFrame(status).state;

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
    // A closed run's `actuals` can therefore never grow: the only actual
    // this path produces carries no interval identity to file under, and
    // `monitorRun.ts`'s own `recordActual` refuses a completed record
    // outright.
    if (!runIsOpen()) {
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
    const normalizedIndex = toActualIndex(
      rawActual.index as number,
      state,
      programLength,
    );
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
      `index=${actual.index} (machine reported ${rawActual.index})`,
    );
    activeRun!.actuals += 1;
    emit({ kind: "intervalComplete", actual });

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
    () => {
      seen.as1 = true;
    },
  );
  mergeStatus(
    ADDITIONAL_STATUS_2_UUID,
    "0x0033",
    parseAdditionalStatus2,
    () => {
      seen.as2 = true;
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
            pendingVerify.mismatchStreak =
              pendingVerify.lastMismatch !== null &&
              sameStructure(structure, pendingVerify.lastMismatch)
                ? pendingVerify.mismatchStreak + 1
                : 1;
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
          }
          pendingVerify.ticks += 1;
          const { ticks, mismatchStreak, sawArmedMismatch } = pendingVerify;
          const bounded =
            ticks >= (options.verifyTicks ?? DEFAULT_VERIFY_TICKS);
          if (mismatchStreak >= STRUCTURE_MISMATCH_TICKS) {
            settleVerifyFailure(
              "structure-mismatch",
              `${mismatchStreak} consecutive armed tick(s) reporting the same wrong structure — ${describeStructureMismatch(structure, pendingVerify.expected)}`,
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

  /** Settles `pendingVerify` with a typed rejection: the general-status
   *  tick handler above calls this on `verifyTicks` expiry
   *  (`reason: "not-observed"`, or `"structure-mismatch"` once an armed
   *  tick has disagreed about the structure) and on the N-consecutive
   *  stable-mismatch rule firing; `onDisconnect` calls it with
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
   * sent** (fix-3 Task 4 — the predicate, the N-consecutive rule and the
   * hardware that forced both are all spelled out further down).
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
   * **What this does NOT cover (review L-2).** 0x0031 carries ONE duration
   * pair, so only INTERVAL 0 can be compared — 4a supports nothing wider.
   * A stale readback from a PREVIOUS program whose interval 0 happens to
   * match therefore passes. That is not hypothetical for 7B: library
   * workouts routinely share a 300 s warmup, so "program Sea Fret, then
   * program the next O2 workout" is exactly the shape where a lagging
   * payload could verify falsely. The prepare-settle wait
   * (`waitForPrepareSettle`) is the other half of the defence, and 4b
   * carries this on its watch list; widening the comparison is not
   * available on the evidence.
   *
   * `intervalIndex` genuinely has no such upgrade path, and did not gain
   * one here: it is business-NULL for the entire armed window
   * (`toMonitorFrame`'s own rule — an interval is only ever "current" while
   * rowing/resting). Nor do the three structure fields enter `MonitorFrame`
   * — they are read straight off this arrival's own decode, the same tap
   * Task 1's `"structure"` log entry takes, so no consumer's type changes
   * for a check that is entirely the driver's business.
   *
   * Bounded by `options.verifyTicks` GENERAL_STATUS_UUID ticks — no wall
   * clock, ever (same tick pulse as `ackTimeout`, tracked as its own
   * budget; see `DriverOptions.verifyTicks`'s doc comment for why).
   * **Omitting it means `DEFAULT_VERIFY_TICKS` (20), NOT "no bound"**
   * (semantics changed by this task, for the reason that field's doc
   * comment gives: unbounded + a structure predicate = a hang exactly where
   * detection was wanted). On expiry, on the N-consecutive rule firing, or
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
      `waiting for "armed" (+1 tick) before the real send — prior state was "${priorState}"`,
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
    options_: { isPrepareStep?: boolean; fetchErrorTypeOnNak?: boolean } = {},
  ): Promise<void> {
    const { isPrepareStep = false, fetchErrorTypeOnNak = false } = options_;
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
        throw new ProgramBusyError();
      }
      programInFlight = true;
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
        activeRun = { program: p, closed: false, actuals: 0 };
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
      await sendSequence(buildTerminate(), "terminate-sent");
      await settleAfterTerminate();
    },

    events(cb: (e: MonitorEvent) => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async disconnect(): Promise<void> {
      log.record("disconnect-requested", "caller-initiated");
      await t.disconnect();
    },
  };
}
