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

/** A programming/terminate write that never got acked "ok" (design spec
 *  §3), for exactly THREE distinct reasons:
 *  - `"nak"`: a response frame arrived with a non-"ok" status — the PM
 *    explicitly rejected it.
 *  - `"disconnected"`: the transport's `onDisconnect` fired before any
 *    response arrived — the link itself is down, so no response is ever
 *    coming.
 *  - `"timeout"`: the link stayed UP (no disconnect), but the caller-
 *    supplied `ackTimeout` policy's tick budget elapsed with no response —
 *    a genuinely different failure mode than a disconnect (the spec's own
 *    "mid-sequence timeout" injection, distinct from "disconnect mid-
 *    write"; fix-round HIGH-2). There is no wall clock anywhere in this
 *    driver for either "no response is coming" signal: `"disconnected"`
 *    is learned from the transport's own event, `"timeout"` is counted in
 *    general-status TICKS (see `createPm5Driver`'s `ackTimeout` option),
 *    never `Date.now()`/`setTimeout`.
 *
 *  `atFrame` is the 0-based index into the ack-gated sequence
 *  (`buildProgrammingSequence`'s outer array, or 0 for `buildTerminate`'s
 *  single frame) that failed; `hexTrace` is every write/ack exchanged
 *  during that call, already recorded to the event log too. */
export interface ProgramRejection {
  reason: "nak" | "disconnected" | "timeout";
  atFrame: number;
  hexTrace: string;
}

const REJECTION_VERBS: Record<ProgramRejection["reason"], string> = {
  nak: "rejected",
  disconnected: "disconnected before acking",
  timeout: "never acked (ack-timeout policy)",
};

export class ProgramRejectionError extends Error implements ProgramRejection {
  readonly reason: "nak" | "disconnected" | "timeout";
  readonly atFrame: number;
  readonly hexTrace: string;

  constructor(rejection: ProgramRejection) {
    super(
      `PM5 ${REJECTION_VERBS[rejection.reason]} frame ${rejection.atFrame}`,
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
 *  bound of its own. Real radio adapters (Task 5) are expected to
 *  translate their own real-time polling cadence into this same tick
 *  unit; this driver only ever counts them, never a clock. */
export interface DriverOptions {
  ackTimeout?: { ticks: number };
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
  const pendingAckBuffer: PendingAckOutcome[] = [];
  // Ticks (GENERAL_STATUS_UUID arrivals) counted against the CURRENT
  // pending ack, reset every time a new one is awaited — see `awaitAck`
  // and `DriverOptions.ackTimeout`'s own doc comment.
  let pendingAckTicks = 0;

  /** The single place `sendSequence` gets its next ack outcome from — the
   *  buffer (MED-1) is checked first; only if it is empty does this
   *  register a fresh `pendingAck` (and reset the tick counter for the
   *  ack-timeout policy, HIGH-2). Called BEFORE any write goes out for the
   *  frame it is awaiting — see `sendSequence`'s own comment on why that
   *  ordering, not just this buffer, is what makes a same-turn ack safe.
   */
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
    if (terminalLatched) {
      // Appendix E (CSAFE p.162): the PM auto-cycles
      // Terminate -> Rearm -> WaitToBegin on its own after a workout ends;
      // a transport drop that happens to land during that housekeeping (or
      // any time after) is expected, not an error — the session is already
      // over from this driver's point of view.
      log.record("disconnect", `post-terminal, ignored: ${reason}`);
      return;
    }
    if (pendingAck) {
      // No wall clock anywhere in this driver — an unexpected link drop is
      // the ONLY signal that turns "no ack yet" into "no ack ever coming"
      // via THIS path, i.e. `ProgramRejection`'s "disconnected" reason
      // (see this file's own header comment and `ProgramRejection`'s doc
      // comment — distinct from the tick-counted "timeout" reason, whose
      // link stays up the whole time).
      const resolve = pendingAck;
      pendingAck = null;
      resolve("disconnected");
    }
    reconnectPending = true;
    log.record("disconnected", reason);
    emit({ kind: "disconnected", reason });
  });

  function mergeStatus<T extends object>(
    uuid: string,
    characteristic: Pm5ParseError["characteristic"],
    decode: (bytes: Uint8Array) => T | { error: Pm5ParseError },
    after: (decoded: T) => void,
  ): void {
    t.subscribe(uuid, (bytes) => {
      if (terminalLatched) return;
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
    log.record("frame", `state=${frame.state} elapsed=${frame.elapsedSeconds}`);
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
  });
  mergeStatus(
    SPLIT_INTERVAL_DATA_UUID,
    "0x0037",
    parseSplitIntervalData,
    () => {
      maybeEmitIntervalComplete();
    },
  );

  /**
   * Ack-gated write sequencing (design spec §3): write every chunk of one
   * frame, await exactly one response frame on 0x0022, then move to the
   * next frame — never issuing the next frame's writes before the current
   * one acks. A NAK (`status !== "ok"`) or the link going down before any
   * response arrives both throw a typed `ProgramRejectionError` carrying
   * the full hex trace of everything written/received during this call.
   */
  async function sendSequence(
    sequence: Uint8Array[][],
    completionKind: string,
  ): Promise<void> {
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
        log.record(
          "program-rejection",
          `${reason} at frame ${frameIndex}: ${hexTrace}`,
        );
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
        log.record(
          "program-rejection",
          `nak at frame ${frameIndex}: ${hexTrace}`,
        );
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

    async program(p: WorkoutProgram): Promise<void> {
      await sendSequence(buildProgrammingSequence(p), "programmed");
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
