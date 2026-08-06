// The PM5 runtime driver (design spec §2-§3): wires a `Transport` to the
// `pm5/` codec and exposes the normalized `MonitorDriver` seam. Owns
// ack-gated write sequencing (with a pending-ack QUEUE — a coalesced BLE
// notification can carry two response frames in one callback turn, and the
// second must not be dropped just because nothing was awaiting it yet), the
// state machine (program -> armed -> the frame stream -> interval
// boundaries -> finished/terminated, with terminal states LATCHED per the
// Task 3 review's Appendix-E finding), an optional tick-driven ack-timeout
// policy distinct from a transport disconnect, and `intervalRemaining`'s
// computation.
//
// `program()`'s three-phase lifecycle (design spec §3, interface-notes.md
// §18/§19.4/§19.5, progress.md's D1/D2): a leading PREPARE step
// (`sendPrepare` — renamed from "clear" by Phase 7A-fix-2 Task 3, since
// nothing here clears anything; it is the documented exit to WaitToBegin,
// see that function's own doc comment) whose outcome, apart from a
// confirmed disconnect, is swallowed as routine (fix-round 1's F3), the
// real ack-gated programming send (`sendSequence`), then a tick-bounded
// VERIFICATION (`verifyArmed`) against the machine's own reported state,
// observed STRICTLY AFTER the send FULLY COMPLETED — the last frame's ack,
// not the first frame going out (fix-round 2; fix-round 1's own snapshot
// point was too early for a multi-frame program, so a stale "armed" tick
// from partway through the send could satisfy it). The ack is never
// trusted alone — the same ack byte has meant both "programmed" and
// "nothing happened at all" on real hardware.
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
} from "../../domain/monitor/pm5/commands.js";
import { chunkFrames, reassemble } from "../../domain/monitor/pm5/framer.js";
import { toProgramIndex } from "../../domain/monitor/pm5/intervalIndex.js";
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
 *  "armed" (design spec §1/§3), for exactly SEVEN distinct reasons —
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
 *
 *  `atFrame` is the 0-based index into the ack-gated sequence
 *  (`buildProgrammingSequence`'s outer array, or 0 for `buildTerminate`'s
 *  single frame) that failed during the SEND phase; it is `-1` for a
 *  verify-phase failure (`"not-observed"`, or `"disconnected"` while
 *  verifying) — verification has no frames of its own, only ticks, so
 *  there is no frame index to report. `hexTrace` is every write/ack
 *  exchanged during a send-phase failure (already recorded to the event
 *  log too), or a description of what verification observed instead. */
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
  | "not-observed";

const REJECTION_VERBS: Record<ProgramRejectionReason, string> = {
  nak: "rejected",
  bad: "reported the frame as malformed (bad)",
  "not-ready": "reported not ready",
  garbled: "returned a frame this driver could not even parse",
  disconnected: "disconnected before completing",
  timeout: "never acked (ack-timeout policy)",
  "not-observed":
    'never reported "armed" after programming (verification timed out)',
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
   * remove. Omitted entirely (the default, matching `ackTimeout`'s own
   * precedent) means no bound: verification waits for "armed" or a
   * disconnect, forever, never a wall clock.
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
   * `buildGetErrorType` (interface-notes.md §17's pull-path item). This
   * settles for the document's own WEAKER fallback instead — "delay
   * sufficiently long (e.g. 1 second or more)" — expressed as a tick
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
}

/** `DriverOptions.settleTicks`'s own default — see that field's doc
 *  comment for why "omitted" means this number, not "no bound". */
const DEFAULT_SETTLE_TICKS = 3;

export function createPm5Driver(
  t: Transport,
  log: MonitorEventLog,
  options: DriverOptions = {},
): MonitorDriver {
  // PM5-intrinsic capabilities — a PM5 always programs, always reports
  // stroke rate, always reports intervals; `deviceName` has no source in
  // this constructor's signature (createPm5Driver(t, log) — no
  // DiscoveredMonitor passed in), so it is a placeholder pending the
  // scan/connect wiring a screen (7B) will do ahead of constructing this
  // driver. Not something this task's brief specifies further.
  const capabilities: MonitorCapabilities = {
    canProgram: true,
    hasStrokeRate: true,
    reportsIntervals: true,
    deviceName: "PM5",
  };

  let program: WorkoutProgram | null = null;
  let terminalLatched = false;
  let reconnectPending = false;
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
    // BEFORE the terminal-latch early-return below, not after. A sequence
    // sent AFTER the terminal state has already latched (a plausible 7B
    // cleanup path — e.g. calling `terminate()` again on unmount) still
    // registers a `pendingAck`, and `mergeStatus`'s own
    // `if (terminalLatched) return` stops the GENERAL_STATUS tick that
    // would otherwise resolve it via the ack-timeout policy (see
    // `DriverOptions.ackTimeout`) — a disconnect is then the ONLY
    // remaining signal. Before this fix, the early-return below discarded
    // that signal silently, hanging `sendSequence` forever: proved with
    // 5000ms of general-status ticks (the ack-timeout hatch, disabled by
    // `terminalLatched`) PLUS an injected disconnect (this hatch,
    // previously also disabled), neither settling the promise. Resolving
    // with `"disconnected"` here is accurate even post-terminal — the
    // transport genuinely did drop before this frame's ack arrived.
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
    if (terminalLatched) {
      // Appendix E (CSAFE p.162): the PM auto-cycles
      // Terminate -> Rearm -> WaitToBegin on its own after a workout ends;
      // a transport drop that happens to land during that housekeeping (or
      // any time after) is expected, not an error — the session is already
      // over from this driver's point of view.
      log.record("disconnect", `post-terminal, ignored: ${reason}`);
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
    after: (decoded: T) => void,
  ): void {
    t.subscribe(uuid, (bytes) => {
      if (terminalLatched) return;
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
      after(decoded);
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
    if (!program || frame.intervalIndex === null) return null;
    const interval = program.intervals[frame.intervalIndex];
    const status = raw as RawPm5Status;
    const progress =
      interval?.kind === "distance"
        ? frame.distanceMeters - status.lastSplitDistanceMeters
        : frame.elapsedSeconds - status.lastSplitTimeSeconds;
    return computeIntervalRemaining(interval, progress);
  }

  function maybeEmitFrame(): void {
    // No `terminalLatched` check here: this function is only ever invoked
    // from `mergeStatus`'s own subscription callback, which ALREADY
    // returns before calling `after()` (and therefore this function) once
    // `terminalLatched` is set — a second check here would be dead code
    // (confirmed: an earlier version had one, and coverage never exercised
    // its `true` branch through any real call path).
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
    const programLength = program?.intervals.length ?? 0;
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
    // program). Gated on `program` actually being set: with no program
    // armed, `programLength` is 0 and `toProgramIndex` always returns
    // `null` by its own contract — informative about nothing, since there
    // is no program to diverge FROM yet.
    const intervalActive = base.state === "rowing" || base.state === "resting";
    if (program && intervalActive && intervalIndex === null) {
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
    if (frame.state !== lastLoggedFrameState) {
      lastLoggedFrameState = frame.state;
      log.record(
        "frame",
        `state=${frame.state} elapsed=${frame.elapsedSeconds} distance=${frame.distanceMeters}`,
      );
    }
    emit({ kind: "frame", frame });

    // Terminal-state latching (Task 3 review): once finished/terminated
    // fires, LATCH — Appendix E's own auto-cycle (terminated -> idle
    // (Rearm) -> armed (WaitToBegin)) must never un-finish the session.
    // `terminalLatched` short-circuits every subscription callback above,
    // so no further frame/state event is possible after this point.
    if (frame.state === "finished") {
      terminalLatched = true;
      log.record("terminal", "finished");
      emit({ kind: "workoutComplete" });
    } else if (frame.state === "terminated") {
      terminalLatched = true;
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
    // Same reasoning as `maybeEmitFrame`: `mergeStatus` already gates on
    // `terminalLatched` before this function is ever reached.
    announceReconnectIfPending();
    const status = raw as RawPm5Status;
    // `rawActual.index` is 0x0037/38's own Split/Interval Number, UNCHANGED
    // (`toIntervalActual` never touched by this task). Normalized below via
    // the CURRENT machine state, same as `maybeEmitFrame`'s own
    // `base.state`. This is an INFERENCE, not an observed fact: §18 #3's
    // hardware session only ever directly OBSERVED one 0x0037/38 index
    // value (the phantom `2` at the session's FINAL boundary). The
    // session's FIRST boundary's own 0x0037 DID arrive and WAS decoded and
    // merged — what failed was the emission gate above, which then held no
    // record of the value (Task 1's "arrives-discarded" verdict; Task 1 was
    // diagnosis only, and the gate is fixed in this function's own caller,
    // `noteBoundaryHalf`). So no earlier boundary's raw value was ever
    // reported, and this rule's generality is unconfirmed. Applying the
    // SAME forward-attribution rule 0x0033 is confirmed to use is the most
    // defensible inference available, not a second confirmed fact.
    // See the OPEN hardware question below for the one shape (a work→work
    // boundary with no intervening rest) where even this inference has no
    // grounding at all.
    const rawActual = toIntervalActual(status);
    const state = toMonitorFrame(status).state;
    const programLength = program?.intervals.length ?? 0;
    // `rawActual.index` is `IntervalActual`'s own (now `number | null`)
    // field, but `toIntervalActual` (`pm5/parse.ts`) always assigns it a
    // real decoded byte (`raw.splitIntervalNumber`) — the wire has no null
    // sentinel here, so this can never actually be `null`. Asserted past
    // the type rather than branched on (an earlier version branched here;
    // coverage never exercised the `null` side through any real call path,
    // the same unreachable-by-construction shape `maybeEmitFrame`'s own
    // comment describes for its `terminalLatched` check) — same established
    // pattern as this file's own `raw as RawPm5Status` casts elsewhere.
    const normalizedIndex = toProgramIndex(
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
    emit({ kind: "intervalComplete", actual });

    // OPEN HARDWARE QUESTION (Task 3 review, critical finding —
    // interface-notes.md §17 item 13): with `restSeconds: 0` the state word
    // never leaves `"rowing"` at a work→work boundary (no rest tick ever
    // fires in between), so `toProgramIndex`'s ONLY confirmed-by-hardware
    // branch (the resting offset) never engages here — the rowing branch
    // (pass `machineIndex` through unadjusted) runs instead, purely because
    // it's the fallback for lack of a confirmed alternative, NOT because
    // this specific shape has ever been observed correct. `seaFretProgram()`'s
    // own 300s warmup interval and `MINIMAL_PROGRAM` both have this shape.
    // Deliberately NOT inventing a new offset for this case — this whole
    // phase exists to stop guessing at PM5 semantics from documented text
    // or code-review inference alone (design spec's own layering rule).
    // Logged so the assumption is visible in the trace, never silent; §17
    // item 13 is the runsheet entry that would settle it with a real
    // reading.
    if (state === "rowing") {
      log.record(
        "index-unverified",
        `actual.index=${actual.index} (0x0037/38) normalized while state=rowing — no rest tick preceded this boundary (restSeconds may be 0 on the completed interval), so the machine's work-to-work numbering at this exact boundary shape is UNCONFIRMED by hardware (interface-notes.md §17 item 13)`,
      );
    }

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

    // The NEW divergence trigger this task adds (mirrors `maybeEmitFrame`'s
    // own — see that comment for the full reasoning): the machine's actual
    // index cannot be explained by the armed program's own length, while a
    // real interval was supposedly current. Gated on `program` being set
    // for the same reason as `maybeEmitFrame`'s check.
    const stateActive = state === "rowing" || state === "resting";
    if (program && stateActive && normalizedIndex === null) {
      log.record(
        "divergence",
        `actual.index=${rawActual.index} (0x0037/38, state=${state}) has no corresponding interval in a ${programLength}-interval program`,
      );
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
  mergeStatus(GENERAL_STATUS_UUID, "0x0031", parseGeneralStatus, () => {
    seen.general = true;
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

    // `program()`'s verification tick pulse (`verifyArmed`, below) — the
    // SAME GENERAL_STATUS_UUID arrival `maybeEmitFrame` just used, per
    // `DriverOptions.verifyTicks`'s own doc comment on why this is a
    // separate budget from `pendingAckTicks` above. Reads `raw.workoutState`
    // directly via `toMonitorFrame` rather than waiting on `maybeEmitFrame`'s
    // own `seen.general && seen.as1 && seen.as2` gate: verification only
    // ever needs `state`, which 0x0031 alone determines, so it must not be
    // held hostage by AS1/AS2 notifications that a real PM sends on the
    // same cadence but that carry fields verification doesn't use.
    if (pendingVerify) {
      if (toMonitorFrame(raw as RawPm5Status).state === "armed") {
        const resolve = pendingVerify.resolve;
        pendingVerify = null;
        resolve();
      } else {
        pendingVerify.ticks += 1;
        const ticks = pendingVerify.ticks;
        if (options.verifyTicks !== undefined && ticks >= options.verifyTicks) {
          settleVerifyFailure(
            "not-observed",
            `${ticks} tick(s) elapsed with no "armed" state observed (last raw workoutState: ${raw.workoutState})`,
          );
        }
      }
    }
  });
  mergeStatus(
    SPLIT_INTERVAL_DATA_UUID,
    "0x0037",
    parseSplitIntervalData,
    (decoded) => {
      noteBoundaryHalf("split", decoded.splitIntervalNumber);
    },
  );

  // `terminate()`'s settle-wait tick pulse (design spec §7, interface-
  // notes.md §19.6) — a RAW subscription, deliberately NOT routed through
  // `mergeStatus`: that helper's own `if (terminalLatched) return` gate
  // would swallow exactly the ticks this needs, since terminate()'s own
  // ack is usually what CAUSES `terminalLatched` to become true (the very
  // next status tick reports "terminated") — every tick after the first
  // would otherwise never reach a counter placed inside `mergeStatus`'s
  // gated callback. No decode needed either: this only counts arrivals,
  // it never reads a field, so a garbled General Status notification
  // still proves the radio is alive and still counts as a tick.
  t.subscribe(GENERAL_STATUS_UUID, () => {
    if (!pendingSettle) return;
    pendingSettle.ticks += 1;
    if (pendingSettle.ticks >= pendingSettle.ticksNeeded) {
      const resolve = pendingSettle.resolve;
      pendingSettle = null;
      resolve();
    }
  });

  /** Settles `pendingVerify` with a typed rejection: the general-status
   *  tick handler above calls this on `verifyTicks` expiry
   *  (`reason: "not-observed"`); `onDisconnect` calls it with
   *  `reason: "disconnected"` so a real link drop during verification fails
   *  loudly instead of waiting on ticks that will now never arrive. Always
   *  logs the failure (design spec §1: "the full trace in the event log")
   *  before rejecting, same as `sendSequence`'s own `"program-rejection"`
   *  entries for a send-phase failure. */
  function settleVerifyFailure(
    reason: "not-observed" | "disconnected",
    detail: string,
  ): void {
    // No `if (!pendingVerify) return` guard here: both call sites (the
    // general-status tick handler above, `onDisconnect` below) already
    // check `pendingVerify` before calling — a second check here would be
    // dead code no test path can reach (same reasoning `maybeEmitFrame`'s
    // own comment gives for omitting a redundant `terminalLatched` check).
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
   * before `program()` is allowed to resolve.
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
   * What "the machine reporting the programmed structure" (design spec §1)
   * concretely checks TODAY: `state === "armed"` (from a post-send
   * arrival), nothing more. This is NOT because no stronger signal exists
   * on the wire — 0x0031 already decodes `workoutType` (our own writes
   * always send `WORKOUTTYPE_VARIABLE_INTERVAL`) and `workoutDurationRaw`/
   * `workoutDurationType`, which a real structural check could compare
   * against `p`. It is because no laptop session has yet read those three
   * fields back AFTER an accepted program to confirm they echo what was
   * sent (interface-notes.md §17's runsheet now carries this as an open
   * item) — gating on unconfirmed bytes would be a worse dishonesty than
   * this narrower check. `intervalIndex` genuinely has no such upgrade
   * path: it is business-NULL for the entire armed window (`toMonitorFrame`'s
   * own rule — an interval is only ever "current" while rowing/resting).
   *
   * Bounded by `options.verifyTicks` GENERAL_STATUS_UUID ticks — no wall
   * clock, ever (same tick pulse as `ackTimeout`, tracked as its own
   * budget; see `DriverOptions.verifyTicks`'s doc comment for why).
   * Omitted entirely (like `ackTimeout`) means no bound: waits for "armed"
   * or a disconnect, forever. On expiry, or a disconnect first, rejects
   * with `ProgramRejectionError({ reason: "not-observed" | "disconnected",
   * atFrame: -1 })` — verification has no frames of its own, only ticks.
   */
  function verifyArmed(): Promise<void> {
    return new Promise((resolve, reject) => {
      pendingVerify = { resolve, reject, ticks: 0 };
    });
  }

  /** `terminate()`'s post-ack SETTLE wait (`DriverOptions.settleTicks`'s
   *  own doc comment carries the full citation). Registers fresh and
   *  waits for `ticksNeeded` NEW arrivals — same "never trust an
   *  already-cached tick" discipline as `verifyArmed` — via the raw
   *  GENERAL_STATUS_UUID subscription above, which (unlike `mergeStatus`'s
   *  gated ones) keeps counting even after `terminalLatched` engages,
   *  which terminate()'s own ack usually causes. `ticksNeeded <= 0`
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
   * Fires ONE `buildGetErrorType()` after a GENUINE reject during the
   * real programming send (never the prepare/terminate steps — see
   * `sendSequence`'s own `fetchErrorTypeOnNak` option), per CSAFE-DEF
   * p.50 (interface-notes.md §19.7): a `SetProgram` reject is not
   * self-describing, and "the Master must issue a PM-specific
   * GetErrorType command to determine the specific error information".
   *
   * Reuses the SAME `awaitAck()`/`pendingAck` queue and `ackTimeout` tick
   * policy every other write goes through — 0xC8's reply arrives on the
   * SAME characteristic (0x0022) every other ack does, so there is no
   * need for a second waiting mechanism. Logged as kind `"error-type"`,
   * RAW HEX ONLY (`buildGetErrorType`'s own doc comment: the pull path's
   * decode is unconfirmed, interface-notes.md §17's pull-path item) — no
   * claim is ever made about what the bytes MEAN, only what they WERE. No
   * retries: a second reject here would just be more of the same
   * unconfirmed signal, never new information. The CSAFE-DEF Table 10
   * ≥50ms inter-frame gap (cited via interface-notes.md §19) is already
   * satisfied by the BLE round trip the FAILED frame's own ack took —
   * nothing here adds a wall-clock delay of any kind.
   *
   * Never throws: whatever this observes (a reply, a timeout, or a
   * disconnect) is logged and this simply returns — the caller's own
   * `"nak"` rejection is unconditional and unaffected either way.
   */
  async function sendGetErrorType(): Promise<void> {
    const ackPromise = awaitAck();
    for (const chunk of chunkFrames([buildGetErrorType()])) {
      await t.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    const outcome = await ackPromise;
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
   * code match that stated rule now that more reasons exist). A refusal
   * (`"nak"`) is the EXPECTED, common case — hardware showed the PM
   * refuses a terminate when nothing is currently running or loaded
   * (interface-notes.md §18's clean-run observation, now understood as a
   * legible machine statement — "nothing needs terminating" — rather than
   * a mystery byte, §19.1/§19.5). Only `"disconnected"` propagates: that
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
          `PM's response to the prepare step was "${err.reason}" — swallowed as routine, not a clear and never fatal on its own (interface-notes.md §19.4/§19.5): ${err.hexTrace}`,
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
   * those as informational `"prepare-rejected"`, and without this every
   * HEALTHY `program()` call would show a spurious rejection in the trace
   * (the prepare step's own refusal is the routine case). A
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
        // F7: a prepare-step refusal is the routine, expected case
        // (`sendPrepare`'s own doc comment) — it already logs
        // "prepare-rejected" itself, so logging THIS too would make every
        // healthy `program()` call show a spurious rejection in the trace.
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

    // CONFIRMED destructive fact (interface-notes.md §18, progress.md's
    // clean A/B run): a REJECTED program WIPES whatever workout was
    // already loaded on the monitor — a failed `program()` call can
    // therefore cost the rower a workout they had, not merely fail to add
    // a new one. Callers (7B's connect flow) MUST warn the rower BEFORE
    // calling this, never react to a rejection afterward — by the time
    // this call rejects, the previous workout may already be gone.
    //
    // The simple RULE that first explained the above ("accepts only when
    // idle") is NOT equally confirmed: Task 1's D1 update found a
    // terminate ACCEPTED with a workout loaded, yet the FOLLOWING program
    // was still rejected — twice. The state model behind accept/reject is
    // still not understood; only the destructive half is. Nothing below
    // assumes the rule — prepare/send/verify is designed to survive not
    // knowing it.
    //
    // Three phases (design spec §3): `sendPrepare()` is the documented
    // exit to WaitToBegin (interface-notes.md §19.4/§19.5) — NOT a clear,
    // nothing here clears anything — with any non-disconnect outcome
    // swallowed as routine (fix-round 1, F3; broadened by Task 3, see
    // `sendPrepare`'s own doc comment); `sendSequence` is the real
    // ack-gated programming send, now firing `sendGetErrorType` on a
    // genuine reject (Task 3); `verifyArmed` is what actually decides
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
      await sendPrepare();
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
      await verifyArmed();
      program = p;
      log.record("armed", `programmed ${p.intervals.length} interval(s)`);
      emit({ kind: "armed" });
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
    // §17's pull-path item).
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
