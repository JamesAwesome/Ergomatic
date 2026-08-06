// The simulator (design spec §4): implements `Transport` end-to-end over
// the SAME wire format the driver decodes (CSAFE frames + the five status
// characteristics), so a CI run exercises the exact bytes a real PM5 would
// exchange.
//
// Phase 7A-fix Task 4: this file is a MODEL OF THE MACHINE WE MET
// (interface-notes.md §18, PM5 432331249, 2026-08-05), not an idealized
// PM5. Everything the erg did differently from what CI assumed is
// reproduced here on purpose, so each hardware finding has a permanent
// test:
//   - it numbers rests FORWARD, the way the real one does, and emits the
//     phantom index past the end of a program (D3);
//   - it delivers a boundary's 0x0037 BEFORE its 0x0038, the order the
//     trace showed (D4 — the order that hid an entire interval);
//   - it sends `0`, not the documented `255`, for a beltless heart rate
//     (D5);
//   - it REJECTS a program while a workout is loaded, and wipes what it
//     held doing so (D1);
//   - its writes fail while the link is down, the way an invalidated GATT
//     handle does (D6).
//
// Verifies each programming chunk byte-for-byte against
// `buildProgrammingSequence`'s output (asserts — a wrong byte is a test
// failure, not a tolerated write); acks via `pm5/response.ts`'s
// `buildAckFrame`; plays a tick-driven session timeline (no wall clock —
// `tick(ms)` is the only thing that ever advances time); six injection
// hooks (design spec §4, plan Task 4, plus fix-round HIGH-2's
// `injectTimeout`, distinct from `injectDisconnect`: the link stays up,
// only the ack never comes); a leading "clearing" phase (plan Task 2)
// modeling `program()`'s own best-effort clear step, rejected (0x81) when
// nothing is loaded and ACCEPTED when something is (D1's own two observed
// outcomes) before the real programming sequence begins.
//
// Concept2 byte-level knowledge stays confined to what this file calls INTO
// `pm5/` (`buildProgrammingSequence`, `buildTerminate`, `buildAckFrame`,
// `reassemble`, the `buildXBytes` encoders in `pm5/statusFrames.ts`,
// `intervalIndex.ts`'s `toMachineIndex`, and the `WORKOUTSTATE_*` ordinals
// / `toMonitorState` / `HEARTRATE_NO_BELT` that `pm5/parse.ts` exports for
// exactly this purpose) — this file never computes a checksum, a byte
// offset, a scale factor, or a numbering offset itself.

import {
  buildProgrammingSequence,
  buildTerminate,
} from "../../../domain/monitor/pm5/commands.js";
import { reassemble } from "../../../domain/monitor/pm5/framer.js";
import { toMachineIndex } from "../../../domain/monitor/pm5/intervalIndex.js";
import {
  HEARTRATE_NO_BELT,
  toMonitorState,
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
  MonitorFrame,
  Transport,
} from "../../../domain/monitor/types.js";
import type { WorkoutProgram } from "../../../domain/monitor/program.js";

/** One "tick" in the script's timeline: a full rowing/resting status
 *  update, delivered once `virtualClock` reaches `atMs`. `workoutState` is
 *  a raw `OBJ_WORKOUTSTATE_T` ordinal — use the `WORKOUTSTATE_*` constants
 *  `pm5/parse.ts` exports rather than a bare number.
 *
 *  `programIntervalIndex` is OUR 0-based-per-work-interval index — the
 *  interval of `script.program` this sample belongs to. It is deliberately
 *  NOT what goes on the wire: D3 (interface-notes.md §18 #3) showed a real
 *  PM5 attributes a REST FORWARD, to the interval it is counting down TO,
 *  so the byte written into 0x0033's "Interval Count"
 *  (`AdditionalStatus2.intervalCount`) is `pm5/intervalIndex.ts`'s
 *  `toMachineIndex(programIntervalIndex, state)` — one HIGHER than this
 *  field during a rest, this field exactly during work. The driver's
 *  `toProgramIndex` has to undo that to get back to the number authored
 *  here, which is what makes every fake-driven driver test an end-to-end
 *  exercise of the normalization rather than a pre-normalized fiction
 *  shared by both sides (this interface's predecessor named the field
 *  `intervalIndex` and put it on the wire verbatim — the shape the
 *  hardware was proven not to produce).
 *
 *  `heartRateBpm: null` means NO BELT PAIRED, and the fake sends the byte
 *  the real machine sent for that: `0` (`HEARTRATE_NO_BELT`, D5), not the
 *  documented `255`. */
export interface FakeStatusEvent {
  atMs: number;
  kind: "status";
  workoutState: number;
  elapsedSeconds: number;
  distanceMeters: number;
  spm: number;
  currentSplit: number;
  heartRateBpm: number | null;
  programIntervalIndex: number;
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
  // `IntervalActual.index`'s type is `number | null` (Task 3 review,
  // `docs/design/DEVIATIONS.md`) to carry the DRIVER's post-normalization
  // "unexplainable" case. Narrowed back to `number` here — and, since Task
  // 4, carrying OUR program index rather than a wire value, exactly like
  // `FakeStatusEvent.programIntervalIndex`: the number 0x0037/38's
  // "Split/Interval Number" actually receives is
  // `toMachineIndex(actual.index, <the machine's state right now>)`, so a
  // boundary that lands while the PM has already rolled into its rest gets
  // the forward-attributed value the hardware sent (interface-notes.md §18
  // #3's own trace: the final boundary of a TWO-interval workout carried a
  // Split/Interval Number of `2`). Authoring OUR index here also means a
  // script typo can't silently author `null` and have it misread as "this
  // is what the machine sent."
  actual: Omit<IntervalActual, "index"> & { index: number };
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
  /**
   * D1 (interface-notes.md §18 #6, observed twice): the machine already
   * has a workout loaded when this session starts — the state in which a
   * real PM5 REJECTS a program and **wipes what it was holding while doing
   * so**. Give it the loaded workout's interval count; `loadedIntervals()`
   * reports what the fake still holds, so a test can watch it go.
   *
   * What this models, all of it observed:
   * - the programming sequence's FIRST frame is rejected (0x81) while
   *   something is loaded — and that rejection is DESTRUCTIVE: the fake
   *   drops the loaded workout, the same way a real 2-interval send
   *   visibly wiped a working 1-minute program and left the monitor
   *   showing an empty `:00`;
   * - the clear step (`buildTerminate()`) is ACCEPTED while a workout is
   *   loaded (the D1 UPDATE row) and REJECTED when nothing is
   *   (the clean-run observation, which is what a scriptless fake models);
   * - terminate does NOT clear the loaded workout — accepting it changed
   *   nothing about the following program's rejection.
   *
   * What this deliberately does NOT model, because it is not understood:
   * the D1 UPDATE also saw a SECOND program rejected after the first
   * rejection had already wiped the monitor. Under this model the wipe
   * leaves nothing loaded, so a retry succeeds. Reproducing the real
   * behaviour would mean inventing a state machine behind accept/reject
   * that no observation has pinned down — the top open question for the
   * next hardware row (§18 #6). A fake that guessed would teach CI a
   * fiction, which is the exact failure this whole phase exists to undo.
   */
  loadedWorkout?: { intervalCount: number };
  /** The post-"armed" session timeline, ascending by `atMs`. `tick(ms)`
   *  advances a purely virtual clock (no timers, no wall clock anywhere in
   *  this file) and delivers every event whose `atMs` has now been
   *  reached. */
  events?: FakeTimelineEvent[];
}

export interface FakeControls {
  /** Advances the fake's internal virtual clock by `ms` and delivers every
   *  scripted event now due — ALSO flushes a pending WAITTOBEGIN bundle
   *  first, if `program()`'s last frame has acked since the previous call
   *  (fix-round 1, F1). That armed delivery used to happen SYNCHRONOUSLY
   *  inside the programming write itself; a reviewer found that this made
   *  every fake-driven test take driver.ts's IMMEDIATE-check fast path in
   *  `verifyArmed()`, so the tick-driven WAIT it exists to exercise (the
   *  actual protection against a stale/pre-send "armed" observation) was
   *  only ever reached by hand-rolled `stubTransport` tests. Requiring a
   *  real `tick()` call here — even `tick(0)`, which advances no scripted
   *  time — makes every fake-driven `program()` call genuinely exercise
   *  that wait too. While disconnected (`injectDisconnect()`, before
   *  `completeReconnect()`), the clock still advances and due events are
   *  still consumed from the script (the PM keeps rowing regardless of the
   *  phone's radio — design spec §4's iOS note) but are NOT delivered as
   *  notifications; only their values are cached for `completeReconnect()`
   *  to flush, which is what makes the reconnect path re-derive position
   *  instead of assuming continuity. */
  tick(ms: number): void;
  /** The NEXT programming ack-gated FRAME written (0-based index into
   *  `buildProgrammingSequence`'s outer array — the same index a driver's
   *  ack-gated loop advances one-per-frame, not one-per-20-byte-chunk) gets
   *  a reject status instead of success. Named `atFrame` (not `atChunk`,
   *  fix-round L2): "chunk" in this codebase means one <=20-byte BLE
   *  write, and a NAK is a response to a whole ack-gated FRAME (which may
   *  span several chunks), never a partial one. */
  injectNak(atFrame: number): void;
  /** Simulates an unexpected link drop: fires the driver's `onDisconnect`
   *  callback and stops delivering scheduled notifications until
   *  `completeReconnect()`. If a program/terminate write is awaiting its
   *  ack at the moment this is called, that ack now never arrives — the
   *  same "link is down, no response is coming" signal a real disconnect
   *  mid-write would produce.
   *
   *  D6 (interface-notes.md §18's "also fixed live" list): from here until
   *  `completeReconnect()`, every `write()` REJECTS rather than quietly
   *  succeeding. On the real laptop this was Chrome's
   *  `InvalidStateError: Characteristic ... is no longer valid. Remember to
   *  retrieve the characteristic again after reconnecting.` — the handles a
   *  transport cached before the drop are dead objects afterward. The fake
   *  had no such behaviour, which is precisely why `webBluetooth.ts`'s
   *  cached-characteristic bug passed every CI run while breaking every
   *  post-reconnect write on hardware. `completeReconnect()` is this fake's
   *  stand-in for a transport that re-fetched: writes work again after it,
   *  never before. */
  injectDisconnect(): void;
  /** Simulates a mid-sequence ack timeout DISTINCT from a disconnect
   *  (fix-round HIGH-2, spec §4's own separately-listed injection hook):
   *  the link stays fully up — notifications keep flowing normally, and
   *  `onDisconnect` never fires — but every ack this fake would otherwise
   *  send from now on is silently withheld. Combined with the driver's
   *  optional `ackTimeout` policy and enough `tick()` calls to deliver the
   *  configured number of General Status ticks, the pending write
   *  eventually rejects with `reason: "timeout"`, never `"disconnected"`. */
  injectTimeout(): void;
  /** Delivers one deliberately too-short General Status (0x0031)
   *  notification RIGHT NOW, regardless of the script/clock — exercises
   *  `pm5/parse.ts`'s length-guard `Pm5ParseError` path end-to-end. */
  injectGarbledFrame(): void;
  /** Clears the disconnected flag and immediately flushes the fake's
   *  current (possibly time-jumped) state as a fresh status/boundary
   *  notification — "the machine's next status frame" the driver's
   *  reconnect path re-derives position from. */
  completeReconnect(): void;
  /**
   * Fix-round 1, F1: forces the WAITTOBEGIN bundle out RIGHT NOW instead
   * of waiting for the next `tick()` — the escape hatch for a test that
   * genuinely needs the OLD synchronous timing (matching a real PM's own
   * near-instant response) rather than exercising `program()`'s
   * tick-driven wait. A no-op if no armed delivery is currently pending
   * (nothing was withheld, or it was already flushed). Most tests should
   * prefer a real `tick()` call — see `tick()`'s own doc comment for why
   * this fake no longer delivers armed synchronously inside the write.
   */
  deliverArmedNow(): void;
  /** What the machine is currently holding (D1): the `loadedWorkout` the
   *  script started with, or `null` once a rejected program has WIPED it —
   *  the destructive half of D1, which is the half that was confirmed.
   *  `null` for a fake that never had one. */
  loadedIntervals(): number | null;
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
 *  always warmed up by the time a real session begins.
 *
 *  `lastSplit` is 0x0033's "Last Split Time"/"Last Split Distance" pair
 *  (interface-notes.md §10, §15 #8) — the session-cumulative point at
 *  which the CURRENT interval began, i.e. wherever the most recent
 *  boundary (if any) left off. The driver's `computeRemainingForFrame`
 *  (fix-round HIGH-1) subtracts this from the live `elapsedSeconds`/
 *  `distanceMeters` above to recover "progress into this interval" with
 *  no observation history of its own — an earlier version of this fake
 *  hardcoded both fields to 0 forever, which made every interval after
 *  the first compute a wrong (too-generous) `intervalRemaining` the
 *  moment it wasn't the interval that started the whole session. */
function statusBundle(
  program: WorkoutProgram,
  e: FakeStatusEvent,
  lastSplit: { elapsedSeconds: number; distanceMeters: number },
): { general: GeneralStatus; as1: AdditionalStatus1; as2: AdditionalStatus2 } {
  const interval = program.intervals[e.programIntervalIndex];
  const isDistance = interval?.kind === "distance";
  return {
    as2: {
      elapsedSeconds: e.elapsedSeconds,
      // D3: the MACHINE's number, not the script's — forward-attributed
      // during a rest (`FakeStatusEvent.programIntervalIndex`'s own doc
      // comment). This is the byte the driver's `toProgramIndex` has to
      // undo.
      intervalCount: toMachineIndex(
        e.programIntervalIndex,
        toMonitorState(e.workoutState),
      ),
      averagePowerWatts: 0,
      totalCalories: 0,
      splitAvgPace: 0,
      splitAvgPowerWatts: 0,
      splitAvgCalories: 0,
      lastSplitTimeSeconds: lastSplit.elapsedSeconds,
      lastSplitDistanceMeters: lastSplit.distanceMeters,
    },
    as1: {
      elapsedSeconds: e.elapsedSeconds,
      speedMetersPerSecond: 0,
      spm: e.spm,
      // D5: a beltless tick puts `0` on the wire, the byte the real machine
      // sent — NOT the documented 255 (`HEARTRATE_NO_BELT`, cited in
      // `pm5/parse.ts`; interface-notes.md §18's new-defect note).
      // `writeHeartRate`'s own `null` path would encode 255, which is the
      // sentinel CI already believed in and the machine never sent.
      heartRateBpm: e.heartRateBpm ?? HEARTRATE_NO_BELT,
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

/** `machineState` is the state the PM is in AT THE MOMENT OF DELIVERY (the
 *  last status tick it sent), which is what decides the forward attribution
 *  of the Split/Interval Number this boundary carries — see
 *  `FakeBoundaryEvent.actual`'s own comment. The observed trace has the
 *  boundary notifications arriving while the state word already reads
 *  `resting` (interface-notes.md §18 #3: "20 resting → 21 notify 0x0037"),
 *  so a script that wants the hardware's own numbering puts a resting tick
 *  before its boundary event, exactly as the machine does.
 *
 *  ENFORCED, not merely documented (Task 4 review, IMPORTANT-4): a script
 *  that completes an interval WITH a trailing rest while the state word
 *  still says anything other than `resting` describes a machine we have
 *  never met — the real one had already rolled into that rest and was
 *  reporting the forward-attributed number by the time either
 *  characteristic went out. Left as a comment, the rule was already broken
 *  once by this file's own test suite, and the cost of a silently
 *  identity-numbered boundary is a fixture that "proves" the D3
 *  normalization against a wire value the hardware would not have sent. */
function boundaryBundle(
  e: FakeBoundaryEvent,
  machineState: MonitorFrame["state"],
  program: WorkoutProgram,
): {
  split: SplitIntervalData;
  asSplit: AdditionalSplitIntervalData;
} {
  const { actual } = e;
  const completed = program.intervals[actual.index];
  if (completed && completed.restSeconds > 0 && machineState !== "resting") {
    throw new Error(
      `fake transport: boundary for interval ${actual.index} delivered while the machine reads "${machineState}", but that interval has a ${completed.restSeconds}s trailing rest — a real PM5 is already RESTING (and numbering forward) when it sends 0x0037/0x0038 for it (interface-notes.md §18 #3). Put a resting status tick before this boundary event.`,
    );
  }
  const wireIndex = toMachineIndex(actual.index, machineState);
  return {
    asSplit: {
      elapsedSeconds: e.cumulativeElapsedSeconds,
      splitIntervalAvgStrokeRate: actual.avgSpm ?? 0,
      // D5, same as the status bundle's own heart-rate byte: `0` for no
      // belt. This is the exact field the machine sent `0` on.
      splitIntervalWorkHeartRateBpm:
        actual.avgHeartRateBpm ?? HEARTRATE_NO_BELT,
      splitIntervalRestHeartRateBpm: HEARTRATE_NO_BELT,
      splitIntervalAvgPace: actual.avgSplit ?? 0,
      splitIntervalTotalCalories: 0,
      splitIntervalAvgCalories: 0,
      splitIntervalSpeedMetersPerSecond: 0,
      splitIntervalPowerWatts: 0,
      splitAvgDragFactor: 130,
      splitIntervalNumber: wireIndex,
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
      splitIntervalNumber: wireIndex,
    },
  };
}

/** The fixed WAITTOBEGIN bundle the fake sends the instant programming
 *  finishes (design spec §2: "armed" = WAITTOBEGIN) — zeroed progress, no
 *  interval active yet, and no split has ever completed (`lastSplit` is
 *  always `{0, 0}` here — nothing to root it at before the session's own
 *  first interval even starts). */
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
      programIntervalIndex: 0,
    },
    { elapsedSeconds: 0, distanceMeters: 0 },
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

  // Plan Task 2: `program()` now sends `buildTerminate()` as a best-effort
  // CLEAR step before the real programming sequence — so the very first
  // write(s) this fake ever sees are the SAME bytes as `terminateChunks`
  // (below), not `flatProgramChunks`. `"clearing"` models exactly that
  // window. Its ack now depends on what the machine is HOLDING (D1, Task
  // 4): rejected (0x81) when nothing is loaded — the clean-run observation,
  // and the common case for a fresh connection — but ACCEPTED when a
  // workout is loaded, which the D1 UPDATE row observed directly (and which
  // changed nothing about the following program still being rejected;
  // terminate is not a clear). `injectNak` deliberately does NOT reach into
  // this phase — `nakAtFrame` addresses the PROGRAMMING sequence's own
  // frames only (its own doc comment), and the load state is what decides
  // this one. `injectTimeout` DOES still apply here — its own "every ack
  // this fake would otherwise send" wording is phase-agnostic by design.
  let phase: "clearing" | "programming" | "armed" = "clearing";
  let clearChunkCursor = 0;
  let programChunkCursor = 0;
  let programFrameCursor = 0;
  let terminateChunkCursor = 0;
  let nakAtFrame: number | null = null;
  // `injectTimeout()` (fix-round HIGH-2): once set, every ack this fake
  // would otherwise send is withheld — link stays up, `linkDown` stays
  // false, notifications keep flowing, only acks stop. Sticky (not a
  // one-shot), matching "the ack never comes" literally: nothing in this
  // fake's own state machine would ever clear it back to sending acks.
  let timeoutInjected = false;
  // Fix-round 1, F1: set the instant the programming sequence's LAST frame
  // acks (`onProgrammingFrameComplete`), flushed by the NEXT `tick()` call
  // (or `deliverArmedNow()`) rather than delivered synchronously — see
  // `tick()`'s own doc comment for why.
  let armedBundlePending = false;

  // D1: what the machine is holding right now (`FakeScript.loadedWorkout`'s
  // own doc comment). Set to `null` by the destructive rejection, never by
  // the clear step — terminate was observed accepted with a workout loaded
  // and the following program was still rejected.
  let loadedIntervalCount: number | null =
    script.loadedWorkout?.intervalCount ?? null;

  let linkDown = false;
  let disconnectCb: ((reason: string) => void) | null = null;
  const notifyCbs = new Map<string, Set<(bytes: Uint8Array) => void>>();

  // Cached "current known state" — used by `completeReconnect()` to flush
  // whatever the script has advanced to (possibly skipped ahead while
  // disconnected) as a single fresh notification, per this file's own
  // `tick`/`completeReconnect` doc comments.
  let latestStatus: FakeStatusEvent | null = null;
  let latestBoundary: FakeBoundaryEvent | null = null;
  // The MACHINE's own last-known "where did the current interval start"
  // checkpoint (0x0033's Last Split Time/Distance, fed to every
  // `statusBundle()` call — see that function's own doc comment). Updated
  // in `deliverOrCache` the moment a boundary is PROCESSED, regardless of
  // `linkDown` — the real PM keeps this bookkeeping up to date whether or
  // not the phone is currently connected to hear about it (design spec §4's
  // iOS note), which is exactly what makes the reconnect path's very first
  // post-reconnect status tick already carry the correct value.
  let lastBoundaryCumulative = { elapsedSeconds: 0, distanceMeters: 0 };
  // The machine's CURRENT state word, in `MonitorFrame` terms — updated
  // from every status event this fake processes (delivered or merely
  // cached; the PM keeps rowing whether or not the phone is listening).
  // Read by `deliverBoundary` to decide the forward attribution of the
  // Split/Interval Number it puts on the wire (D3) — see `boundaryBundle`'s
  // own doc comment. Starts at `"idle"`: nothing has been programmed yet,
  // and no boundary can precede the first status tick on a real machine.
  let machineState: MonitorFrame["state"] = "idle";

  const incoming = reassemble();

  function notify(uuid: string, bytes: Uint8Array): void {
    for (const cb of notifyCbs.get(uuid) ?? []) cb(bytes);
  }

  /** The single place `latestStatus` (and with it the machine's own current
   *  state word) is assigned — every path that decides "this is what the
   *  machine now reads" goes through here, so `machineState` can never
   *  drift from the status the fake last committed to. */
  function setLatestStatus(e: FakeStatusEvent): void {
    latestStatus = e;
    machineState = toMonitorState(e.workoutState);
  }

  function deliverStatus(e: FakeStatusEvent): void {
    const { general, as1, as2 } = statusBundle(
      script.program,
      e,
      lastBoundaryCumulative,
    );
    notify(ADDITIONAL_STATUS_2_UUID, buildAdditionalStatus2Bytes(as2));
    notify(ADDITIONAL_STATUS_1_UUID, buildAdditionalStatus1Bytes(as1));
    notify(GENERAL_STATUS_UUID, buildGeneralStatusBytes(general));
  }

  /** D4 (Task 1's verdict, interface-notes.md §18 #3): **0x0037 first, then
   *  0x0038** — the order the real machine used at every boundary of the
   *  observed session ("seq 25 notify 0x0037 → seq 26 interval-complete →
   *  seq 27 notify 0x0038"). This file used to send them the other way
   *  round, which is why CI never saw either half of the defect that order
   *  causes: the driver's first boundary was DISCARDED (its emission gate
   *  was satisfied only by 0x0038, which had not arrived yet), and the
   *  emission that did fire read its averages from the PREVIOUS boundary's
   *  0x0038 — one `intervalComplete` for a two-interval workout, carrying
   *  interval 2's identity with interval 1's numbers. */
  function deliverBoundary(e: FakeBoundaryEvent): void {
    const { split, asSplit } = boundaryBundle(e, machineState, script.program);
    notify(SPLIT_INTERVAL_DATA_UUID, buildSplitIntervalDataBytes(split));
    notify(
      ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
      buildAdditionalSplitIntervalDataBytes(asSplit),
    );
  }

  function deliverArmedBundle(): void {
    const { general, as1, as2 } = armedBundle();
    notify(ADDITIONAL_STATUS_2_UUID, buildAdditionalStatus2Bytes(as2));
    notify(ADDITIONAL_STATUS_1_UUID, buildAdditionalStatus1Bytes(as1));
    notify(GENERAL_STATUS_UUID, buildGeneralStatusBytes(general));
    setLatestStatus({
      atMs: virtualClock,
      kind: "status",
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: null,
      programIntervalIndex: 0,
    });
  }

  /** Fix-round 1, F1: the single place `armedBundlePending` is consumed —
   *  called from `tick()` (the normal path) and `deliverArmedNow()` (the
   *  synchronous escape hatch). A no-op when nothing is pending, so both
   *  callers can invoke it unconditionally. */
  function flushArmedIfPending(): void {
    if (!armedBundlePending) return;
    armedBundlePending = false;
    deliverArmedBundle();
  }

  function sendAck(status: "ok" | "reject"): void {
    notify(TRANSMIT_CHARACTERISTIC_UUID, buildAckFrame(status, []));
  }

  /** The clear step's own chunk assertion (plan Task 2) — reuses
   *  `terminateChunks`, the SAME bytes `assertArmedChunk` below checks for
   *  the app's own, later, explicit `terminate()` call. Separate cursor
   *  (`clearChunkCursor`, not `terminateChunkCursor`) so a test that later
   *  exercises a real `terminate()` after arming isn't left with a cursor
   *  already partway advanced by `program()`'s own internal clear. */
  function assertClearingChunk(chunk: Uint8Array): void {
    const expected = terminateChunks[clearChunkCursor];
    if (!expected || !bytesEqual(chunk, expected)) {
      throw new Error(
        `fake transport: unexpected write during the clear step ${toHex(chunk)} — only the documented terminate sequence is accepted here`,
      );
    }
    clearChunkCursor += 1;
  }

  /** Called once the clear step's chunks have all arrived. The ack depends
   *  on the machine's LOAD STATE, both halves observed (D1,
   *  interface-notes.md §18 #6): rejected (0x81) with nothing loaded — the
   *  clean-run case — and ACCEPTED with a workout loaded. Either way the
   *  loaded workout SURVIVES: an accepted terminate did not clear the PM
   *  (the following program was still rejected, twice), which is the whole
   *  reason `program()` can't trust its own clear step. Advances into
   *  `"programming"` regardless — the driver sends the program next no
   *  matter which ack it got. `timeoutInjected` short-circuits this exactly
   *  like the other two frame-complete handlers below: the bytes were
   *  already verified correct, but no ack goes out and `phase` does not
   *  advance. */
  function onClearingFrameComplete(): void {
    if (timeoutInjected) return;
    sendAck(loadedIntervalCount === null ? "reject" : "ok");
    phase = "programming";
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
   *  the ack and, on success, whether the whole sequence is now done.
   *  `timeoutInjected` (fix-round HIGH-2) short-circuits ALL of that: the
   *  frame's bytes were already verified correct (by
   *  `assertProgrammingChunk`, before this ever runs), but no ack is sent
   *  and nothing advances — the link simply goes quiet on this one
   *  response, exactly the "mid-sequence timeout" the spec's own §4
   *  injection hook describes, distinct from `injectDisconnect()` (which
   *  also flips `linkDown` and fires `onDisconnect`; this does neither). */
  function onProgrammingFrameComplete(): void {
    if (timeoutInjected) return;
    // D1, the confirmed destructive fact (interface-notes.md §18 #6,
    // observed twice): programming over a loaded workout is REJECTED, and
    // the rejection WIPES what was loaded. Not "rejected, try again with
    // your workout still safe" — the rower's loaded session is gone by the
    // time the caller sees the error, which is why `MonitorDriver.program`'s
    // own JSDoc requires 7B to warn BEFORE calling, never after.
    if (loadedIntervalCount !== null) {
      loadedIntervalCount = null;
      sendAck("reject");
      return;
    }
    const shouldNak = nakAtFrame === programFrameCursor;
    sendAck(shouldNak ? "reject" : "ok");
    if (!shouldNak) {
      programFrameCursor += 1;
      if (programFrameCursor === programSequence.length) {
        phase = "armed";
        // Fix-round 1, F1: withheld until a subsequent `tick()` (or
        // `deliverArmedNow()`) — see `tick()`'s own doc comment for why
        // this is no longer synchronous with the ack itself.
        armedBundlePending = true;
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
    if (timeoutInjected) return; // same short-circuit as onProgrammingFrameComplete
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
      programIntervalIndex: previous.programIntervalIndex,
    };
    latestStatus = terminated;
    deliverStatus(terminated);
  }

  function deliverOrCache(event: FakeTimelineEvent): void {
    if (event.kind === "status") {
      setLatestStatus(event);
      if (!linkDown) deliverStatus(event);
    } else {
      latestBoundary = event;
      // The machine's own bookkeeping updates HERE, unconditionally —
      // never gated on `linkDown` (see `lastBoundaryCumulative`'s own
      // comment). This is what a later status tick (live or, after
      // `completeReconnect()`, the very first post-reconnect one) picks up
      // automatically, with no separate reconnect-specific logic needed.
      lastBoundaryCumulative = {
        elapsedSeconds: event.cumulativeElapsedSeconds,
        distanceMeters: event.cumulativeDistanceMeters,
      };
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
      // D6 (interface-notes.md §18's "also fixed live" list): while the
      // link is down every handle a transport is holding is dead, and a
      // write on one throws — Chrome's own wording reproduced verbatim
      // below, because that string IS the observation. Checked before the
      // sample-rate early-return: an invalidated handle does not care which
      // characteristic it points at. See `injectDisconnect`'s doc comment
      // for why the fake having none of this hid the session's worst bug.
      if (linkDown) {
        throw new Error(
          `fake transport: InvalidStateError: Characteristic ${characteristicId} is no longer valid. Remember to retrieve the characteristic again after reconnecting.`,
        );
      }
      if (characteristicId === SAMPLE_RATE_UUID) {
        return;
      }
      if (characteristicId !== RECEIVE_CHARACTERISTIC_UUID) {
        throw new Error(
          `fake transport: unexpected write target ${characteristicId}`,
        );
      }
      if (phase === "clearing") {
        assertClearingChunk(bytes);
      } else if (phase === "programming") {
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
        if (phase === "clearing") {
          onClearingFrameComplete();
        } else if (phase === "programming") {
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
      // Fix-round 1, F1: flush a pending armed delivery BEFORE any due
      // scripted event, so a script's own first timeline entry is never
      // delivered "ahead of" the session actually arming.
      flushArmedIfPending();
      runDueEvents();
    },
    deliverArmedNow(): void {
      flushArmedIfPending();
    },
    loadedIntervals(): number | null {
      return loadedIntervalCount;
    },
    injectNak(atFrame: number): void {
      nakAtFrame = atFrame;
    },
    injectTimeout(): void {
      timeoutInjected = true;
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
      // Boundary FIRST, then status: a boundary that elapsed while
      // disconnected chronologically precedes any later status tick this
      // fake also has cached, and delivering it first keeps the driver's
      // own last-seen-`intervalIndex` bookkeeping (fed by status ticks,
      // used for the "divergence" check, fix-round MED-2) from briefly
      // looking skewed against a boundary that is actually still in order.
      if (latestBoundary) deliverBoundary(latestBoundary);
      if (latestStatus) deliverStatus(latestStatus);
    },
  };
}
