// The PM5 runtime driver (design spec §2-§3): wires a `Transport` to the
// `pm5/` codec and exposes the normalized `MonitorDriver` seam. Owns
// ack-gated write sequencing, the state machine (program -> armed -> the
// frame stream -> interval boundaries -> finished/terminated, with terminal
// states LATCHED per the Task 3 review's Appendix-E finding), and
// `intervalRemaining`'s computation.
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
 *  §3): either the PM explicitly rejected it (`reason: "nak"`), or the
 *  link went down before any response arrived at all (`reason: "timeout"`
 *  — there is no wall clock anywhere in this driver, so the ONLY way it
 *  ever learns "no response is coming" rather than merely "no response
 *  YET" is the transport's own `onDisconnect` signal; see `sendSequence`'s
 *  own comment). `atFrame` is the 0-based index into the ack-gated sequence
 *  (`buildProgrammingSequence`'s outer array, or 0 for `buildTerminate`'s
 *  single frame) that failed; `hexTrace` is every write/ack exchanged
 *  during that call, already recorded to the event log too. */
export interface ProgramRejection {
  reason: "nak" | "timeout";
  atFrame: number;
  hexTrace: string;
}

export class ProgramRejectionError extends Error implements ProgramRejection {
  readonly reason: "nak" | "timeout";
  readonly atFrame: number;
  readonly hexTrace: string;

  constructor(rejection: ProgramRejection) {
    super(
      `PM5 ${rejection.reason === "nak" ? "rejected" : "never acked"} frame ${rejection.atFrame}`,
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

type PendingAckOutcome = "link-down" | CsafeResponse;

export function createPm5Driver(
  t: Transport,
  log: MonitorEventLog,
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
  // The session-cumulative elapsed/distance readings at the moment the
  // CURRENT interval began — see `computeRemainingForFrame`'s own comment
  // for why this checkpoint approach, not 0x0037's fields, is what feeds
  // `computeIntervalRemaining`'s "quantized progress" argument.
  let intervalStart: {
    index: number;
    elapsedSeconds: number;
    distanceMeters: number;
  } | null = null;
  const seen = { general: false, as1: false, as2: false, asSplit: false };
  const listeners = new Set<(e: MonitorEvent) => void>();
  let pendingAck: ((outcome: PendingAckOutcome) => void) | null = null;

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
      // A response frame with no write awaiting one — logged, never
      // crashes the read loop (this could be a real PM's unsolicited
      // status echo, or a test's injected garble landing on the wrong
      // channel).
      log.record("frame-error", `unsolicited ack frame: ${toHex(frame)}`);
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
      // the ONLY signal that turns "no ack yet" into "no ack ever coming",
      // i.e. `ProgramRejection`'s "timeout" reason (see this file's own
      // header comment and `ProgramRejection`'s doc comment).
      const resolve = pendingAck;
      pendingAck = null;
      resolve("link-down");
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
   * interval's own unit. Sourced from a CHECKPOINT (the session-cumulative
   * `elapsedSeconds`/`distanceMeters` recorded the moment `intervalIndex`
   * last changed), not from 0x0037/0x0038's fields — those characteristics
   * are the boundary-completion pair (`toIntervalActual`'s own source,
   * interface-notes.md §10) and, per this task's own build (see
   * `src/monitor/transports/fake.ts`'s header comment), are never
   * documented or modeled as a LIVE mid-interval feed; treating their
   * last-known (boundary) values as "current progress" would show the
   * PREVIOUS interval's final numbers throughout the whole of the next
   * one. The checkpoint approach instead only needs fields EVERY general/
   * additional-status tick already carries (`elapsedSeconds`,
   * `distanceMeters`, `intervalIndex`), works identically for a
   * time-kind or distance-kind interval, and needs no assumption about a
   * characteristic's update cadence at all.
   */
  function computeRemainingForFrame(
    frame: MonitorFrame,
  ): MonitorFrame["intervalRemaining"] {
    if (frame.intervalIndex === null) {
      intervalStart = null; // no interval active — armed/idle/finished/terminated
      return null;
    }
    if (!intervalStart || intervalStart.index !== frame.intervalIndex) {
      intervalStart = {
        index: frame.intervalIndex,
        elapsedSeconds: frame.elapsedSeconds,
        distanceMeters: frame.distanceMeters,
      };
    }
    if (!program) return null;
    const interval = program.intervals[frame.intervalIndex];
    const progress =
      interval?.kind === "distance"
        ? frame.distanceMeters - intervalStart.distanceMeters
        : frame.elapsedSeconds - intervalStart.elapsedSeconds;
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

    // Root the NEXT interval's checkpoint at this exact boundary, using
    // 0x0037's own SESSION-cumulative `elapsedSeconds`/`distanceMeters`
    // fields (a separate pair from `actual`'s per-interval ones — see
    // `computeRemainingForFrame`'s comment) rather than waiting for that
    // next interval's own first live tick to set it. Without this, the
    // first tick of every interval after the first would checkpoint
    // itself (progress 0, i.e. the full interval value shown as
    // "remaining") instead of picking up where the completed interval
    // left off.
    intervalStart = {
      index: actual.index + 1,
      elapsedSeconds: status.elapsedSeconds,
      distanceMeters: status.distanceMeters,
    };
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

      // The ack-await promise is created and `pendingAck` assigned BEFORE
      // any write goes out — never after. A fake (or a real radio) may
      // deliver its ack notification synchronously from inside `write()`,
      // before that call's returned promise even settles; registering
      // `pendingAck` only after the writes/`await`s would race that
      // delivery and could drop the ack on the floor (observed while
      // building the fake: a same-turn ack arrived while `pendingAck` was
      // still null, logged as "unsolicited", and the real wait below never
      // resolved). Setting it up first makes the ordering safe regardless
      // of whether the transport acks synchronously or on a later tick.
      const ackPromise = new Promise<PendingAckOutcome>((resolve) => {
        pendingAck = resolve;
      });

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

      if (outcome === "link-down") {
        trace.push("(link down — no ack)");
        const hexTrace = trace.join(" | ");
        log.record(
          "program-rejection",
          `timeout at frame ${frameIndex}: ${hexTrace}`,
        );
        throw new ProgramRejectionError({
          reason: "timeout",
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
