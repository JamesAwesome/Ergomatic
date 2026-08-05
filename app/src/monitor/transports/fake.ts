// The simulator (design spec §4): implements `Transport` end-to-end over
// the SAME wire format the driver decodes (CSAFE frames + the five status
// characteristics), so a CI run exercises the exact bytes a real PM5 would
// exchange. Verifies each programming chunk byte-for-byte against Task 3's
// `buildProgrammingSequence` output (asserts — a wrong byte is a test
// failure, not a tolerated write); acks via `pm5/response.ts`'s
// `buildAckFrame`; plays a tick-driven session timeline (no wall clock —
// `tick(ms)` is the only thing that ever advances time); five injection
// hooks (design spec §4, plan Task 4).
//
// Concept2 byte-level knowledge stays confined to what this file calls INTO
// `pm5/` (`buildProgrammingSequence`, `buildTerminate`, `buildAckFrame`,
// `reassemble`, the `buildXBytes` encoders in `pm5/statusFrames.ts`, the
// `WORKOUTSTATE_*` ordinals `pm5/parse.ts` exports for exactly this
// purpose) — this file never computes a checksum, a byte offset, or a scale
// factor itself.

import {
  buildProgrammingSequence,
  buildTerminate,
} from "../../../domain/monitor/pm5/commands.js";
import { reassemble } from "../../../domain/monitor/pm5/framer.js";
import {
  WORKOUTSTATE_TERMINATE,
  WORKOUTSTATE_WAITTOBEGIN,
  type AdditionalSplitIntervalData,
  type AdditionalStatus1,
  type AdditionalStatus2,
  type GeneralStatus,
  type SplitIntervalData,
} from "../../../domain/monitor/pm5/parse.js";
import { buildAckFrame } from "../../../domain/monitor/pm5/response.js";
import {
  buildAdditionalSplitIntervalDataBytes,
  buildAdditionalStatus1Bytes,
  buildAdditionalStatus2Bytes,
  buildGeneralStatusBytes,
  buildSplitIntervalDataBytes,
} from "../../../domain/monitor/pm5/statusFrames.js";
import {
  ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
  ADDITIONAL_STATUS_1_UUID,
  ADDITIONAL_STATUS_2_UUID,
  GENERAL_STATUS_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  SAMPLE_RATE_UUID,
  SPLIT_INTERVAL_DATA_UUID,
  TRANSMIT_CHARACTERISTIC_UUID,
} from "../../../domain/monitor/pm5/uuids.js";
import type {
  DiscoveredMonitor,
  IntervalActual,
  Transport,
} from "../../../domain/monitor/types.js";
import type { WorkoutProgram } from "../../../domain/monitor/program.js";

/** One "tick" in the script's timeline: a full rowing/resting status
 *  update, delivered once `virtualClock` reaches `atMs`. `intervalIndex` is
 *  the 0-based interval this sample belongs to (mirrors `ProgramInterval`'s
 *  own indexing) — the fake writes it straight into 0x0033's "Interval
 *  Count" field (`AdditionalStatus2.intervalCount`), which is the field
 *  `parse.ts`'s `toMonitorFrame` reads into `MonitorFrame.intervalIndex`
 *  while `rowing`/`resting` (interface-notes.md §14/§15 #1). `workoutState`
 *  is a raw `OBJ_WORKOUTSTATE_T` ordinal — use the `WORKOUTSTATE_*`
 *  constants `pm5/parse.ts` exports rather than a bare number. */
export interface FakeStatusEvent {
  atMs: number;
  kind: "status";
  workoutState: number;
  elapsedSeconds: number;
  distanceMeters: number;
  spm: number;
  currentSplit: number;
  heartRateBpm: number | null;
  intervalIndex: number;
}

/** One interval-boundary event: the completed interval's actuals, matching
 *  `IntervalActual`'s own shape (design spec §2) — delivered on 0x0037/
 *  0x0038 (`toIntervalActual`'s source pair, `pm5/parse.ts`).
 *
 *  `cumulativeElapsedSeconds`/`cumulativeDistanceMeters` are a SEPARATE
 *  pair from `actual.elapsedSeconds`/`distanceMeters`: 0x0037/0x0038 each
 *  carry BOTH a per-interval field (`splitIntervalTimeSeconds`/
 *  `splitIntervalDistanceMeters` — what `actual` is built from,
 *  `pm5/parse.ts`'s own `toIntervalActual`) AND a top-level, SESSION-
 *  cumulative `elapsedSeconds`/`distanceMeters` field on the very same
 *  characteristic (interface-notes.md §10). The driver's
 *  `computeRemainingForFrame` roots its next-interval checkpoint in the
 *  cumulative pair at the moment of the boundary — conflating the two
 *  (an earlier version of this file sent the per-interval value for BOTH)
 *  makes every interval after the first compute a wrong `intervalRemaining`
 *  the moment the session isn't just "one interval starting at zero". */
export interface FakeBoundaryEvent {
  atMs: number;
  kind: "boundary";
  actual: IntervalActual;
  cumulativeElapsedSeconds: number;
  cumulativeDistanceMeters: number;
}

export type FakeTimelineEvent = FakeStatusEvent | FakeBoundaryEvent;

export interface FakeScript {
  /** The program the driver is expected to send via `program()` — the fake
   *  precomputes `buildProgrammingSequence(program)` at construction and
   *  asserts every incoming write against it chunk-by-chunk. A test that
   *  calls `driver.program(p)` with a DIFFERENT `p` than the one given here
   *  fails loudly (byte mismatch), by design. */
  program: WorkoutProgram;
  /** Advertised device name — `scan()`'s single result. */
  deviceName?: string;
  /** The post-"armed" session timeline, ascending by `atMs`. `tick(ms)`
   *  advances a purely virtual clock (no timers, no wall clock anywhere in
   *  this file) and delivers every event whose `atMs` has now been
   *  reached. */
  events?: FakeTimelineEvent[];
}

export interface FakeControls {
  /** Advances the fake's internal virtual clock by `ms` and delivers every
   *  scripted event now due. While disconnected (`injectDisconnect()`,
   *  before `completeReconnect()`), the clock still advances and due
   *  events are still consumed from the script (the PM keeps rowing
   *  regardless of the phone's radio — design spec §4's iOS note) but are
   *  NOT delivered as notifications; only their values are cached for
   *  `completeReconnect()` to flush, which is what makes the reconnect
   *  path re-derive position instead of assuming continuity. */
  tick(ms: number): void;
  /** The NEXT programming ack-gated frame written (0-based index into
   *  `buildProgrammingSequence`'s outer array — the same index a driver's
   *  ack-gated loop advances one-per-frame, not one-per-20-byte-chunk) gets
   *  a reject status instead of success. */
  injectNak(atChunk: number): void;
  /** Simulates an unexpected link drop: fires the driver's `onDisconnect`
   *  callback and stops delivering scheduled notifications until
   *  `completeReconnect()`. If a program/terminate write is awaiting its
   *  ack at the moment this is called, that ack now never arrives — the
   *  same "link is down, no response is coming" signal a real disconnect
   *  mid-write would produce. */
  injectDisconnect(): void;
  /** Delivers one deliberately too-short General Status (0x0031)
   *  notification RIGHT NOW, regardless of the script/clock — exercises
   *  `pm5/parse.ts`'s length-guard `Pm5ParseError` path end-to-end. */
  injectGarbledFrame(): void;
  /** Clears the disconnected flag and immediately flushes the fake's
   *  current (possibly time-jumped) state as a fresh status/boundary
   *  notification — "the machine's next status frame" the driver's
   *  reconnect path re-derives position from. */
  completeReconnect(): void;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

/** Builds the merged General/AdditionalStatus1/AdditionalStatus2 triple for
 *  one `FakeStatusEvent` — the "full bundle" this fake always sends
 *  together for a status tick, in this fixed order, so the driver (which
 *  gates its `frame` event on having seen all three at least once) is
 *  always warmed up by the time a real session begins. */
function statusBundle(
  program: WorkoutProgram,
  e: FakeStatusEvent,
): { general: GeneralStatus; as1: AdditionalStatus1; as2: AdditionalStatus2 } {
  const interval = program.intervals[e.intervalIndex];
  const isDistance = interval?.kind === "distance";
  return {
    as2: {
      elapsedSeconds: e.elapsedSeconds,
      intervalCount: e.intervalIndex,
      averagePowerWatts: 0,
      totalCalories: 0,
      splitAvgPace: 0,
      splitAvgPowerWatts: 0,
      splitAvgCalories: 0,
      lastSplitTimeSeconds: 0,
      lastSplitDistanceMeters: 0,
    },
    as1: {
      elapsedSeconds: e.elapsedSeconds,
      speedMetersPerSecond: 0,
      spm: e.spm,
      heartRateBpm: e.heartRateBpm,
      currentSplit: e.currentSplit,
      averageSplit: e.currentSplit,
      restDistanceMeters: 0,
      restSeconds: 0,
      ergMachineType: 1,
    },
    general: {
      elapsedSeconds: e.elapsedSeconds,
      distanceMeters: e.distanceMeters,
      workoutType: 8, // WORKOUTTYPE_VARIABLE_INTERVAL (interface-notes.md §11)
      intervalType: isDistance ? 1 : 0,
      workoutState: e.workoutState,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: e.distanceMeters,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    },
  };
}

function boundaryBundle(e: FakeBoundaryEvent): {
  split: SplitIntervalData;
  asSplit: AdditionalSplitIntervalData;
} {
  const { actual } = e;
  return {
    asSplit: {
      elapsedSeconds: e.cumulativeElapsedSeconds,
      splitIntervalAvgStrokeRate: actual.avgSpm ?? 0,
      splitIntervalWorkHeartRateBpm: actual.avgHeartRateBpm,
      splitIntervalRestHeartRateBpm: null,
      splitIntervalAvgPace: actual.avgSplit ?? 0,
      splitIntervalTotalCalories: 0,
      splitIntervalAvgCalories: 0,
      splitIntervalSpeedMetersPerSecond: 0,
      splitIntervalPowerWatts: 0,
      splitAvgDragFactor: 130,
      splitIntervalNumber: actual.index,
      ergMachineType: 1,
    },
    split: {
      elapsedSeconds: e.cumulativeElapsedSeconds,
      distanceMeters: e.cumulativeDistanceMeters,
      splitIntervalTimeSeconds: actual.elapsedSeconds,
      splitIntervalDistanceMeters: actual.distanceMeters,
      intervalRestTimeSeconds: 0,
      intervalRestDistanceMeters: 0,
      splitIntervalType: 0,
      splitIntervalNumber: actual.index,
    },
  };
}

/** The fixed WAITTOBEGIN bundle the fake sends the instant programming
 *  finishes (design spec §2: "armed" = WAITTOBEGIN) — zeroed progress, no
 *  interval active yet. */
function armedBundle(): {
  general: GeneralStatus;
  as1: AdditionalStatus1;
  as2: AdditionalStatus2;
} {
  return statusBundle(
    { intervals: [] },
    {
      atMs: 0,
      kind: "status",
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: null,
      intervalIndex: 0,
    },
  );
}

export function createFakeTransport(
  script: FakeScript,
): Transport & FakeControls {
  const programSequence = buildProgrammingSequence(script.program);
  // Flattened purely for the byte-for-byte chunk assertion below (each
  // individual `write()` call checked against the next expected chunk,
  // regardless of which frame it belongs to) — frame BOUNDARIES (when to
  // ack) are detected separately, by `incoming` (`reassemble()`) actually
  // finding a stop flag, not by counting chunks against a precomputed
  // length table.
  const flatProgramChunks = programSequence.flat();
  const terminateChunks = buildTerminate()[0]!;

  const timeline = [...(script.events ?? [])].sort((a, b) => a.atMs - b.atMs);
  let eventCursor = 0;
  let virtualClock = 0;

  let phase: "programming" | "armed" = "programming";
  let programChunkCursor = 0;
  let programFrameCursor = 0;
  let terminateChunkCursor = 0;
  let nakAtChunk: number | null = null;

  let linkDown = false;
  let disconnectCb: ((reason: string) => void) | null = null;
  const notifyCbs = new Map<string, Set<(bytes: Uint8Array) => void>>();

  // Cached "current known state" — used by `completeReconnect()` to flush
  // whatever the script has advanced to (possibly skipped ahead while
  // disconnected) as a single fresh notification, per this file's own
  // `tick`/`completeReconnect` doc comments.
  let latestStatus: FakeStatusEvent | null = null;
  let latestBoundary: FakeBoundaryEvent | null = null;

  const incoming = reassemble();

  function notify(uuid: string, bytes: Uint8Array): void {
    for (const cb of notifyCbs.get(uuid) ?? []) cb(bytes);
  }

  function deliverStatus(e: FakeStatusEvent): void {
    const { general, as1, as2 } = statusBundle(script.program, e);
    notify(ADDITIONAL_STATUS_2_UUID, buildAdditionalStatus2Bytes(as2));
    notify(ADDITIONAL_STATUS_1_UUID, buildAdditionalStatus1Bytes(as1));
    notify(GENERAL_STATUS_UUID, buildGeneralStatusBytes(general));
  }

  function deliverBoundary(e: FakeBoundaryEvent): void {
    const { split, asSplit } = boundaryBundle(e);
    notify(
      ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
      buildAdditionalSplitIntervalDataBytes(asSplit),
    );
    notify(SPLIT_INTERVAL_DATA_UUID, buildSplitIntervalDataBytes(split));
  }

  function deliverArmedBundle(): void {
    const { general, as1, as2 } = armedBundle();
    notify(ADDITIONAL_STATUS_2_UUID, buildAdditionalStatus2Bytes(as2));
    notify(ADDITIONAL_STATUS_1_UUID, buildAdditionalStatus1Bytes(as1));
    notify(GENERAL_STATUS_UUID, buildGeneralStatusBytes(general));
    latestStatus = {
      atMs: virtualClock,
      kind: "status",
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: null,
      intervalIndex: 0,
    };
  }

  function sendAck(status: "ok" | "reject"): void {
    notify(TRANSMIT_CHARACTERISTIC_UUID, buildAckFrame(status, []));
  }

  // Byte-for-byte verification happens on every individual WRITE (BLE
  // chunk granularity, <=20 bytes) — independently of frame reassembly.
  // `incoming` (below) is used ONLY to detect "a complete frame has now
  // arrived" as a trigger for acking; its own reassembled bytes are never
  // compared against anything here, since by the time it signals
  // completion every one of the frame's chunks has already been asserted
  // correct one at a time. (An earlier version of this file compared
  // `incoming.push()`'s reassembled FULL FRAME against a single expected
  // CHUNK and always failed on the second chunk of any multi-chunk frame —
  // fixed by this split.)
  function assertProgrammingChunk(chunk: Uint8Array): void {
    const expected = flatProgramChunks[programChunkCursor];
    if (!expected) {
      throw new Error(
        `fake transport: unexpected extra programming write ${toHex(chunk)} — the expected sequence (${flatProgramChunks.length} chunks) is already complete`,
      );
    }
    if (!bytesEqual(chunk, expected)) {
      throw new Error(
        `fake transport: programming chunk ${programChunkCursor} mismatch — expected ${toHex(expected)}, got ${toHex(chunk)}`,
      );
    }
    programChunkCursor += 1;
  }

  /** Called once per COMPLETE programming frame (not per chunk) — decides
   *  the ack and, on success, whether the whole sequence is now done. */
  function onProgrammingFrameComplete(): void {
    const shouldNak = nakAtChunk === programFrameCursor;
    sendAck(shouldNak ? "reject" : "ok");
    if (!shouldNak) {
      programFrameCursor += 1;
      if (programFrameCursor === programSequence.length) {
        phase = "armed";
        deliverArmedBundle();
      }
    }
  }

  function assertArmedChunk(chunk: Uint8Array): void {
    const expected = terminateChunks[terminateChunkCursor];
    if (!expected || !bytesEqual(chunk, expected)) {
      throw new Error(
        `fake transport: unexpected write while armed ${toHex(chunk)} — only the documented terminate sequence is accepted here`,
      );
    }
    terminateChunkCursor += 1;
  }

  /** Called once the terminate frame's chunks have all arrived — acks and
   *  immediately reports the TERMINATE status (the fake's own synchronous
   *  stand-in for the PM's real, near-instant response). `latestStatus` is
   *  guaranteed non-null here: `phase` only ever becomes `"armed"` (the
   *  only way a terminate write reaches this function at all) immediately
   *  after `deliverArmedBundle()` sets it, and nothing ever clears it back
   *  to null afterward — so this reads the fields directly rather than
   *  guarding against a case the state machine can't produce (an earlier,
   *  defensively-`??`-guarded version left that unreachable fallback
   *  branch permanently uncovered). */
  function onArmedFrameComplete(): void {
    terminateChunkCursor = 0; // a script could call terminate() only once in practice, but reset defensively
    sendAck("ok");
    const previous = latestStatus!;
    const terminated: FakeStatusEvent = {
      atMs: virtualClock,
      kind: "status",
      workoutState: WORKOUTSTATE_TERMINATE,
      elapsedSeconds: previous.elapsedSeconds,
      distanceMeters: previous.distanceMeters,
      spm: 0,
      currentSplit: previous.currentSplit,
      heartRateBpm: previous.heartRateBpm,
      intervalIndex: previous.intervalIndex,
    };
    latestStatus = terminated;
    deliverStatus(terminated);
  }

  function deliverOrCache(event: FakeTimelineEvent): void {
    if (event.kind === "status") {
      latestStatus = event;
      if (!linkDown) deliverStatus(event);
    } else {
      latestBoundary = event;
      if (!linkDown) deliverBoundary(event);
    }
  }

  function runDueEvents(): void {
    while (
      eventCursor < timeline.length &&
      timeline[eventCursor]!.atMs <= virtualClock
    ) {
      deliverOrCache(timeline[eventCursor]!);
      eventCursor += 1;
    }
  }

  return {
    scan(): Promise<DiscoveredMonitor[]> {
      return Promise.resolve([
        { id: "fake-pm5", name: script.deviceName ?? "PM5 (fake)" },
      ]);
    },
    connect(): Promise<void> {
      return Promise.resolve();
    },
    // `async` deliberately, even though nothing inside ever awaits
    // anything: `assertProgrammingChunk`/`assertArmedChunk` THROW
    // synchronously on a byte mismatch (this is the "asserts, not
    // accepts" behaviour design spec §4 requires), and only an `async`
    // function automatically turns a synchronous throw into a REJECTED
    // promise — `Transport.write` is typed `Promise<void>`, and a caller
    // doing `await t.write(...)` must see a rejection, not an uncaught
    // synchronous exception escaping the `await` expression itself.
    async write(characteristicId: string, bytes: Uint8Array): Promise<void> {
      if (characteristicId === SAMPLE_RATE_UUID) {
        return;
      }
      if (characteristicId !== RECEIVE_CHARACTERISTIC_UUID) {
        throw new Error(
          `fake transport: unexpected write target ${characteristicId}`,
        );
      }
      if (phase === "programming") {
        assertProgrammingChunk(bytes);
      } else {
        assertArmedChunk(bytes);
      }

      // `incoming` (`pm5/framer.ts`'s `reassemble()`) is used ONLY to
      // detect "a complete frame has now arrived" — real start/stop-flag
      // boundary detection, not a second byte comparison — per the drain
      // contract, keep pushing empty chunks until it returns null.
      let complete = incoming.push(bytes);
      while (complete) {
        if (phase === "programming") {
          onProgrammingFrameComplete();
        } else {
          onArmedFrameComplete();
        }
        complete = incoming.push(new Uint8Array(0));
      }
    },
    subscribe(
      characteristicId: string,
      cb: (bytes: Uint8Array) => void,
    ): () => void {
      let set = notifyCbs.get(characteristicId);
      if (!set) {
        set = new Set();
        notifyCbs.set(characteristicId, set);
      }
      set.add(cb);
      return () => set!.delete(cb);
    },
    disconnect(): Promise<void> {
      return Promise.resolve();
    },
    onDisconnect(cb: (reason: string) => void): () => void {
      disconnectCb = cb;
      return () => {
        if (disconnectCb === cb) disconnectCb = null;
      };
    },

    tick(ms: number): void {
      virtualClock += ms;
      runDueEvents();
    },
    injectNak(atChunk: number): void {
      nakAtChunk = atChunk;
    },
    injectDisconnect(): void {
      linkDown = true;
      disconnectCb?.("fake transport: injected disconnect");
    },
    injectGarbledFrame(): void {
      // Two bytes where 0x0031 (General Status) requires 19 — always too
      // short regardless of the session's current state, exercising
      // `pm5/parse.ts`'s length guard (`Pm5ParseError`) rather than any
      // particular field's value.
      notify(GENERAL_STATUS_UUID, Uint8Array.from([0x00, 0x00]));
    },
    completeReconnect(): void {
      linkDown = false;
      if (latestStatus) deliverStatus(latestStatus);
      if (latestBoundary) deliverBoundary(latestBoundary);
    },
  };
}
