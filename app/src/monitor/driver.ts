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
// `program()`'s three-phase lifecycle (plan Task 2, "clear, ignore
// rejection, verify" — interface-notes.md §18, progress.md's D1/D2): a
// best-effort clear (`sendClear`, nak/timeout swallowed as routine — only a
// confirmed disconnect still propagates, fix-round 1's F3), the existing
// ack-gated send (`sendSequence`, unchanged), then a tick-bounded
// VERIFICATION (`verifyArmed`) against the machine's own reported state,
// observed STRICTLY AFTER the send began (fix-round 1's F1 — a snapshot
// taken any earlier lets a stale, unrelated "armed" reading count). The ack
// is never trusted alone — the same ack byte has meant both "programmed"
// and "nothing happened at all" on real hardware.
//
// Every Concept2 byte this file ever touches arrives pre-decoded through
// `pm5/parse.ts` (`parseGeneralStatus` et al., `toMonitorFrame`,
// `toIntervalActual`) or `pm5/response.ts` (`parseCsafeResponse`) — this
// file never inspects a raw opcode, offset, or checksum itself (design
// spec §Layering: "pm5/ is the only home of Concept2 bytes"; the Task 3
// review's own obligation on this task). The one place that could tempt a
// raw-byte shortcut — building the ack-gated write sequence — instead calls
// `pm5/commands.ts`'s `buildProgrammingSequence`/`buildTerminate` and reads
// nothing but their `Uint8Array[][]` shape.

import {
  buildProgrammingSequence,
  buildSampleRateConfig,
  buildTerminate,
} from "../../domain/monitor/pm5/commands.js";
import { reassemble } from "../../domain/monitor/pm5/framer.js";
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
  MonitorCapabilities,
  MonitorDriver,
  MonitorEvent,
  MonitorFrame,
  Transport,
} from "../../domain/monitor/types.js";
import type { MonitorEventLog } from "./eventLog";

/** A programming/terminate write that never got acked "ok", OR a
 *  programming call whose verification phase never saw the machine report
 *  "armed" (design spec §1/§3), for exactly FOUR distinct reasons:
 *  - `"nak"`: a response frame arrived with a non-"ok" status — the PM
 *    explicitly rejected it.
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
  "nak" | "disconnected" | "timeout" | "not-observed";

const REJECTION_VERBS: Record<ProgramRejectionReason, string> = {
  nak: "rejected",
  disconnected: "disconnected before completing",
  timeout: "never acked (ack-timeout policy)",
  "not-observed":
    'never reported "armed" after programming (verification timed out)',
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

/** `"disconnected"`/`"timeout"` are the two ways an ack-await can end
 *  without a real response (see `ProgramRejection`'s own doc comment for
 *  the distinction); anything else is a genuine parsed response. */
type PendingAckOutcome = "disconnected" | "ack-timeout" | CsafeResponse;

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
}

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
  // The last `MonitorFrame.intervalIndex` this driver has actually SEEN
  // (0x0033's Interval Count) — compared against `IntervalActual.index`
  // (0x0037/0x0038's Split/Interval Number) at every boundary to log a
  // `"divergence"` if the two disagree (fix-round MED-2; the two fields
  // are independently-incrementing per interface-notes.md §15 #1/#8 — this
  // driver correlates them but does not assume they can't skew).
  let lastFrameIntervalIndex: number | null = null;
  let lastLoggedFrameState: MonitorFrame["state"] | null = null;
  const seen = { general: false, as1: false, as2: false, asSplit: false };
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
  // Only ever holds real `CsafeResponse` values: `"disconnected"`/
  // `"ack-timeout"` are resolved directly against `pendingAck` (the
  // `onDisconnect` handler, the ack-timeout tick counter below), never
  // pushed here — `handleAckFrame` is this buffer's one producer, and it
  // only ever has a parsed response frame to offer.
  const pendingAckBuffer: CsafeResponse[] = [];
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
  // Fix-round 1, F1: a monotonic count of every GENERAL_STATUS_UUID arrival
  // this driver has ever seen — incremented unconditionally, first thing,
  // regardless of `pendingAck`/`pendingVerify`/`seen` state. `verifyArmed`
  // snapshots this BEFORE the real programming write and only accepts an
  // "armed" observation whose arrival strictly postdates that snapshot
  // (see `verifyArmed`'s own doc for the exact hardware shape this
  // closes: the reviewer reproduced a completely stale "armed" — left
  // over from the CLEAR step's own Appendix-E auto-cycle — satisfying the
  // OLD immediate check for a program that was actually a total no-op).
  let generalStatusTickCount = 0;

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
        `stale-ack: leftover from a previous sequence, discarded (status=${stale.status} commandIds=[${stale.commandIds.join(",")}])`,
      );
    }
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
    log.record("ack", toHex(frame));
    if (pendingAck) {
      const resolve = pendingAck;
      pendingAck = null;
      resolve(response);
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
      pendingAckBuffer.push(response);
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

    const base = toMonitorFrame(raw as RawPm5Status);
    const frame: MonitorFrame = {
      ...base,
      intervalRemaining: computeRemainingForFrame(base),
    };
    lastFrameIntervalIndex = frame.intervalIndex;
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

  function maybeEmitIntervalComplete(): void {
    // Same reasoning as `maybeEmitFrame`: `mergeStatus` already gates on
    // `terminalLatched` before this function is ever reached.
    if (!seen.asSplit) return;
    announceReconnectIfPending();
    const status = raw as RawPm5Status;
    const actual = toIntervalActual(status);
    log.record("interval-complete", `index=${actual.index}`);
    emit({ kind: "intervalComplete", actual });

    // Fix-round MED-2: 0x0033's Interval Count (`MonitorFrame.
    // intervalIndex`, tracked as `lastFrameIntervalIndex`) and 0x0037/38's
    // Split/Interval Number (`actual.index`) are documented as two
    // SEPARATE, independently-incrementing fields (interface-notes.md §15
    // #1/#8) — nothing guarantees they agree. This never corrects either
    // value (there is no documented rule for which one would be "right");
    // it only surfaces the disagreement so a bug report / diagnostics
    // view (7B) can see it happened, via the trace, without a screen
    // silently trusting a skewed pairing.
    if (
      lastFrameIntervalIndex !== null &&
      lastFrameIntervalIndex !== actual.index
    ) {
      log.record(
        "divergence",
        `intervalIndex=${lastFrameIntervalIndex} (0x0033) vs actual.index=${actual.index} (0x0037/38)`,
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
    () => {
      seen.asSplit = true;
    },
  );
  mergeStatus(GENERAL_STATUS_UUID, "0x0031", parseGeneralStatus, () => {
    // Fix-round 1, F1: counted BEFORE anything else in this handler, for
    // every arrival unconditionally — `verifyArmed`'s snapshot comparison
    // depends on this being a strict, gapless count of 0x0031 decodes.
    generalStatusTickCount += 1;
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
    () => {
      maybeEmitIntervalComplete();
    },
  );

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
   * `program()`'s verification phase (design spec §1, plan Task 2: "clear,
   * ignore rejection, verify"). The ack is not trusted on its own — the
   * first laptop session saw the SAME ack byte (`0x01`) accompany both a
   * real program and a complete no-op (interface-notes.md §18, progress.md's
   * D2). This instead waits for the machine's OWN reported state to reach
   * "armed" (WAITTOBEGIN/COUNTDOWNPAUSE, `pm5/parse.ts`'s `toMonitorFrame`)
   * before `program()` is allowed to resolve.
   *
   * `since` is `generalStatusTickCount`'s value captured BEFORE the real
   * programming write (fix-round 1, F1) — an "armed" observation only
   * counts if its arrival's count is strictly greater than `since`. Without
   * this, a STALE cached `raw` satisfies verification for free: a review
   * reproduced the hardware shape exactly — the clear step gets ACCEPTED
   * (progress.md's D1 update: this happens), the PM's own Appendix-E
   * auto-cycle (Terminate -> Rearm -> WaitToBegin) reports "armed" on its
   * own, and a stale read of THAT observation would satisfy verification
   * for a completely separate program write that was actually a total
   * no-op — D2 resurrected through the very phase built to stop it.
   * Requiring a POST-snapshot arrival is what makes "armed" evidence FOR
   * THIS SEND, not evidence some workout, at some point, was loaded.
   *
   * What "the machine reporting the programmed structure" (design spec §1)
   * concretely checks TODAY: `state === "armed"` (from a post-snapshot
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
  function verifyArmed(since: number): Promise<void> {
    if (
      generalStatusTickCount > since &&
      toMonitorFrame(raw as RawPm5Status).state === "armed"
    ) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      pendingVerify = { resolve, reject, ticks: 0 };
    });
  }

  /**
   * `program()`'s clear step (design spec §1, plan Task 2: "clear, ignore
   * rejection, verify"). Sends the documented terminate command
   * (`buildTerminate()`) — the closest thing to a "clear the PM's loaded
   * workout" command this codec has, though the laptop sessions proved it
   * is NOT actually one: `terminate()` was ACCEPTED once with a completed
   * workout loaded, and the FOLLOWING program was still rejected — twice
   * (interface-notes.md §18, progress.md's D1 update). The real clear
   * command, if one exists, is UNKNOWN.
   *
   * Both `"nak"` (0x81 — the EXPECTED, common case: hardware showed the PM
   * rejects a terminate when nothing is currently running or loaded,
   * interface-notes.md §18's clean-run observation) AND `"timeout"` are
   * swallowed here as informational `"clear-rejected"`, never an error,
   * never a throw (fix-round 1, F3). `ProgramRejection`'s own doc comment
   * defines `"timeout"` as "the link stayed UP, but the PM never answered
   * this ONE command" — which is exactly the profile of sending a command
   * whose real semantics are unconfirmed (the clear command is UNKNOWN,
   * per the D1 update above), not evidence of a broken transport. Only
   * `"disconnected"` propagates: that means the link itself is confirmed
   * down, a genuinely different and fatal condition regardless of which
   * step hit it — attempting to write a whole program onto a link already
   * known to be down would just hang the SEND phase instead of failing
   * where the problem actually is.
   *
   * Whatever this step's outcome, it proves NOTHING about whether the PM
   * is now actually clear — no read exists to confirm that. `program()`'s
   * own verification phase (`verifyArmed`, above) is what actually decides
   * success, from the machine's own state after the real programming
   * write.
   */
  async function sendClear(): Promise<void> {
    try {
      await sendSequence(buildTerminate(), "clear-sent", true);
    } catch (err) {
      if (
        err instanceof ProgramRejectionError &&
        (err.reason === "nak" || err.reason === "timeout")
      ) {
        log.record(
          "clear-rejected",
          err.reason === "nak"
            ? `PM rejected the clear (0x81) — expected when nothing was loaded (interface-notes.md §18): ${err.hexTrace}`
            : `PM never answered the clear (timeout) — the real clear command is unknown (interface-notes.md §18, progress.md's D1 update): ${err.hexTrace}`,
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
   * one acks. A NAK (`status !== "ok"`) or the link going down before any
   * response arrives both throw a typed `ProgramRejectionError` carrying
   * the full hex trace of everything written/received during this call.
   *
   * `isClearStep` (fix-round 1, F7) suppresses the generic
   * `"program-rejection"` log entry for a NAK/timeout — `sendClear`'s own
   * caller already logs those as informational `"clear-rejected"`, and
   * without this every HEALTHY `program()` call would show a spurious
   * rejection in the trace (the clear step's own NAK is the routine case).
   * A `"disconnected"` failure still logs `"program-rejection"` regardless
   * — that one is never swallowed, by either this function or `sendClear`.
   */
  async function sendSequence(
    sequence: Uint8Array[][],
    completionKind: string,
    isClearStep = false,
  ): Promise<void> {
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
        // clear-step "timeout" is swallowed by `sendClear` (F3), so it's
        // suppressed here too — see this function's own doc comment.
        if (!isClearStep || reason === "disconnected") {
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

      trace.push(
        `ack status=${outcome.status} commandIds=[${outcome.commandIds.join(",")}]`,
      );
      if (outcome.status !== "ok") {
        const hexTrace = trace.join(" | ");
        // F7: a clear-step NAK is the routine, expected case (`sendClear`'s
        // own doc comment) — it already logs "clear-rejected" itself, so
        // logging THIS too would make every healthy `program()` call show
        // a spurious rejection in the trace.
        if (!isClearStep) {
          log.record(
            "program-rejection",
            `nak at frame ${frameIndex}: ${hexTrace}`,
          );
        }
        throw new ProgramRejectionError({
          reason: "nak",
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
    // assumes the rule — clear/send/verify is designed to survive not
    // knowing it.
    //
    // Three phases (plan Task 2, "clear, ignore rejection, verify"):
    // `sendClear()` is a best-effort clear — nak/timeout swallowed as
    // routine (fix-round 1, F3), only a confirmed disconnect still fatal;
    // `sendSequence` is the existing ack-gated send, unchanged; `verifyArmed`
    // is what actually decides success, from the machine's OWN reported
    // state observed STRICTLY AFTER this send (fix-round 1, F1) — never
    // the ack alone (D2: the identical ack byte has meant both "programmed"
    // and "nothing happened at all" on real hardware), and never a stale
    // pre-send observation either (verifyArmed's own doc comment).
    async program(p: WorkoutProgram): Promise<void> {
      await sendClear();
      // F1: snapshot taken AFTER the clear resolves, BEFORE the real
      // programming write — see verifyArmed's doc for exactly which
      // hardware shape this excludes.
      const armedSince = generalStatusTickCount;
      await sendSequence(buildProgrammingSequence(p), "programmed");
      await verifyArmed(armedSince);
      program = p;
      log.record("armed", `programmed ${p.intervals.length} interval(s)`);
      emit({ kind: "armed" });
    },

    async terminate(): Promise<void> {
      await sendSequence(buildTerminate(), "terminate-sent");
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
