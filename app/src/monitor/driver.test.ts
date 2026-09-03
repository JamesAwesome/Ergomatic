import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { compileProgram } from "../../domain/monitor/program.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import {
  buildGetErrorType,
  buildProgrammingSequence,
  buildTerminate,
} from "../../domain/monitor/pm5/commands.js";
import {
  parseGeneralStatus,
  WORKOUTSTATE_INTERVALREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_REARM,
  WORKOUTSTATE_TERMINATE,
  WORKOUTSTATE_WAITTOBEGIN,
  WORKOUTSTATE_WORKOUTEND,
} from "../../domain/monitor/pm5/parse.js";
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
import {
  buildAdditionalSplitIntervalDataBytes,
  buildAdditionalStatus1Bytes,
  buildAdditionalStatus2Bytes,
  buildEndOfWorkoutSummaryBytes,
  buildGeneralStatusBytes,
  buildSplitIntervalDataBytes,
} from "../../domain/monitor/pm5/statusFrames.js";
import {
  buildAckFrame,
  echoedCommandIds,
} from "../../domain/monitor/pm5/response.js";
import type {
  DiscoveredMonitor,
  IntervalActual,
  MonitorEvent,
  MonitorFrame,
  Transport,
} from "../../domain/monitor/types.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { createEventLog } from "./eventLog";
import {
  computeIntervalAccrued,
  computeIntervalRemaining,
  createPm5Driver,
  ProgramBusyError,
  ProgramRejectionError,
  restPairComplete,
} from "./driver";
import { createFakeTransport, type FakeTimelineEvent } from "./transports/fake";

// TIMER HYGIENE, file-wide (fix round 1, review Minor-4). The driver grew
// its first real timer with the summary-fallback gate — one `setTimeout` at
// `FINISH_GRACE_MS`, armed by every natural finish. The gate's own tests
// inject `DriverOptions.schedule` and fire it by hand, but the ~24 other
// natural-finish paths in this file do not, and each of those was leaving a
// live 3-second timer behind: inert today only because the suite finishes
// long before one is due, which is a property of how fast the tests run
// rather than of anything the tests assert.
//
// Faking the clock file-wide is the cheapest form that is actually correct.
// Nothing here waits on real time — the whole prepare/send exchange is
// microtask-hopped (`waitUntil` and `flush` both drain `Promise.resolve()`,
// which fake timers do not touch) and no test in this file calls
// `setTimeout` itself — so this changes no behaviour, and
// `vi.useRealTimers()` discards every pending timer at the end of each
// test. Tests that need to CONTROL the reconcile deadline still inject
// their own `schedule` and ignore this entirely.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// The realistic fixture (briefing: "at least one test per client task
// starts from a real library workout ... not a hand-built minimum"): Sea
// Fret ("O2: 2x4' at 6k+12 with 1' rest"), run through the EXACT assembly
// `startSession` uses (`buildDraft` -> `buildRun` -> `compileProgram`),
// matching `src/monitor/program.sweep.test.ts`'s own pattern. Compiles to
// 3 intervals: a 300s target-less opener (no rest), then two 240s work
// intervals at 6k+12 (targetSplit 132s/500m) each followed by a 60s rest —
// values read off `compileProgram`'s own output for this fixture, not off
// a wire capture (see the provenance note below).
//
// WHERE INTERVAL 0 COMES FROM. It was Sea Fret's own `wu` step until the
// seeds were stripped (2026-08-09), then the rower's warm-up PREFERENCE
// passed as `buildRun`'s fourth argument, and Phase WU removed that too.
// It is now an authored 5' EASY step prepended to the draft's own steps
// below. That reproduces the SAME compiled interval byte for byte —
// `compileProgram` nulls an effort phase's target exactly as it nulled a
// warm-up's, so `{type: "work", kind: "time", value: 300, targetSplit:
// null, displaySpm: null, restSeconds: 0}` is unchanged apart from the
// type word — and keeping interval 0 at all is a deliberate choice:
//
// **Interval 0 is the only rest-0 leading interval compiled from a real
// workout in this file.** (Synthetic rest-0 fixtures exist elsewhere —
// `twoIntervalNoRest`, `restlessProgram`, SESSION 4a's `REST_ZERO_PROGRAM`
// — and independently pin the `toActualIndex(0, "rowing", 3)` clamp branch
// itself; this fixture's distinct value is exercising that same boundary
// through the full compiled-library-workout happy path.) The opener
// compiles with `restSeconds: 0` (nothing follows it but the first work
// phase), which makes its boundary a WORK->WORK one — no rest tick
// separates it from interval 1, so the state word is still "rowing" when
// 0x0037/38 arrive. Sea Fret's own two work steps each carry a 60s rest,
// so a fixture that dropped the opener would remove that case from the
// file entirely. See the timeline comment at the "program -> armed ->
// frames" walk below, which spells the boundary out.
//
// NO HARDWARE PROVENANCE IS CLAIMED FOR THIS FIXTURE, and none should be
// (arc review F1): Sea Fret appears nowhere in `docs/monitor/`, and the
// structural readback this file asserts is COMPUTED, not captured —
// `healthyArmedStructureFor` below applies SESSION 4a's documented RULE
// (`value * 100` at duration type 0 for a time interval) to whatever
// program it is handed. 4a's own committed capture
// (`docs/monitor/pm5-interface-notes.md` SESSION 4a) used three synthetic
// lab programs and read 6000, not 30000. What makes this fixture honest is
// that a rower who opens Sea Fret with five easy minutes really does
// program exactly
// this three-interval shape — a real production configuration, applied to
// a documented rule.
function seaFretProgram(): WorkoutProgram {
  const workout = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret");
  if (!workout)
    throw new Error("fixture workout 'Sea Fret' missing from the library seed");
  const draft = buildDraft({
    id: "driver-test-sea-fret",
    title: workout.title,
    type: workout.type,
    // The 5' EASY opener — see this fixture's own header for why it is an
    // authored step now and why the compiled interval is unchanged.
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { effort: "min" },
      },
      ...workout.steps,
    ],
  });
  const run = buildRun(
    draft,
    { k2Seconds: 100, k6Seconds: 120 },
    new Date("2026-01-01"),
  );
  const result = compileProgram(run.phases);
  if (!("intervals" in result)) {
    throw new Error(`fixture workout failed to compile: ${result.message}`);
  }
  return result;
}

const MINIMAL_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 0,
    },
  ],
};

/** A 3-interval program — used where a test's own scripted machine index
 *  needs to land on a REAL interval (post-D3-fix, `toProgramIndex` clamps
 *  or nulls a machine index that overshoots `MINIMAL_PROGRAM`'s single
 *  interval, `domain/monitor/pm5/intervalIndex.ts`'s own contract), not
 *  `MINIMAL_PROGRAM`'s one. */
const THREE_INTERVAL_PROGRAM: WorkoutProgram = {
  intervals: Array.from({ length: 3 }, () => ({
    type: "work" as const,
    kind: "time" as const,
    value: 60,
    targetSplit: 120,
    displaySpm: 22,
    restSeconds: 30,
  })),
};

/** Repo-root recordings, resolved relative to THIS file — the same idiom
 *  `registerReplay.test.ts` uses (`captureReplay.test.ts:112-117`'s own
 *  reasoning: plain string surgery on `import.meta.url`, never the global
 *  `URL` constructor, since this project's jsdom environment resolves
 *  `new URL(...)` against `http://localhost:3000/` instead of the given
 *  `file://` base). `docs/monitor/sessions/walk-2026-08-16/` lives three
 *  directories above `app/src/monitor/`. */
const RC1_SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/driver\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-16/",
  );

// Plan Task 2: `program()` now sends `buildTerminate()` as its own
// best-effort prepare step BEFORE the real programming sequence — every
// `stubTransport`-driven test below that drives acks by hand must account
// for that leading exchange too, not just the programming sequence's own.
const prepareChunkCount = buildTerminate()[0]!.length;

/**
 * The three 0x0031 readback fields `verifyArmed` compares against the
 * program it just sent (fix-3 Task 4) — `workoutType` (offset 6),
 * `workoutDurationRaw` (14-16, little-endian) and `workoutDurationType`
 * (17), interface-notes.md §10.
 */
interface ArmedStructureFixture {
  workoutType: number;
  workoutDurationRaw: number;
  workoutDurationType: number;
}

/**
 * What a HEALTHY armed PM5 reads back for `p` — hardware-confirmed by
 * SESSION 4a (2026-08-07, PM5 432331249; interface-notes.md §18, "SESSION
 * 4a"):
 *   - `workoutType` is `8` for every shape (TIME, DISTANCE, rest-0 — no
 *     normalization to 6/7/9);
 *   - a TIME interval 0 reads back seconds × 100 (`60s -> 6000`) with
 *     `workoutDurationType = 0`;
 *   - a DISTANCE interval 0 reads back WHOLE METRES (`500 -> 500`) with
 *     `workoutDurationType = 128`.
 *
 * Restated here as literals ON PURPOSE: computing the fixture through the
 * production helper (`expectedArmedStructure`, `pm5/commands.ts`) would
 * make every assertion below tautological — the tests would agree with the
 * driver about a wrong scale just as happily as a right one.
 */
function healthyArmedStructureFor(p: WorkoutProgram): ArmedStructureFixture {
  const first = p.intervals[0]!;
  return {
    workoutType: 8,
    workoutDurationRaw: first.kind === "time" ? first.value * 100 : first.value,
    workoutDurationType: first.kind === "time" ? 0 : 128,
  };
}

/** A General Status payload in the given machine state carrying an EXPLICIT
 *  structure triple — the by-hand 0x0031 the fix-3 Task 4 tests below need.
 *  The shared fake DOES put structure on its own wire since fix-3 Task 5
 *  (`src/monitor/transports/fake.ts`'s `armedStructureFields`/
 *  `EMPTY_ARM_STRUCTURE`) — the block below stays stub-driven anyway
 *  because it needs EXACT, arbitrary payloads (a mid-cycle transient, a
 *  streak-breaking reset) the fake's own honest protocol has no script hook
 *  for; the fake-driven end-to-end rows (including the lag knob) live in
 *  the "fix-3 Task 3" describe block above. */
function statusWithStructure(
  structure: ArmedStructureFixture,
  workoutState: number = WORKOUTSTATE_WAITTOBEGIN,
): Uint8Array {
  return buildGeneralStatusBytes({
    elapsedSeconds: 0,
    distanceMeters: 0,
    workoutType: structure.workoutType,
    intervalType: structure.workoutDurationType === 0 ? 0 : 1,
    workoutState,
    rowingState: 0,
    strokeState: 0,
    totalWorkDistanceMeters: 0,
    workoutDurationRaw: structure.workoutDurationRaw,
    workoutDurationType: structure.workoutDurationType,
    dragFactor: 130,
  });
}

/** The armed 0x0031 a healthy machine sends back for `p` — what
 *  `verifyArmed` now requires before `program()` may resolve. */
function armedStatusFor(p: WorkoutProgram): Uint8Array {
  return statusWithStructure(healthyArmedStructureFor(p));
}

/** A WAITTOBEGIN (armed) General Status payload — `program()`'s
 *  verification phase (`verifyArmed`, driver.ts) resolves the instant this
 *  arrives, regardless of when relative to the ack: it merges straight
 *  into the driver's persistent `raw` state, so it is always safe to send
 *  right after (or even interleaved with) a `stubTransport` test's own ack
 *  notifications rather than needing precise interleaving.
 *
 *  Fix-3 Task 4: the payload now carries `MINIMAL_PROGRAM`'s OWN structure
 *  (`60s -> 6000`, duration type Time), because armed alone is no longer
 *  enough — the machine must report the workout we actually sent. Every
 *  test below that uses this constant programs `MINIMAL_PROGRAM`,
 *  `THREE_INTERVAL_PROGRAM` or another all-60s-first-interval fixture, so
 *  one shared constant still serves them all; anything else builds its own
 *  through `armedStatusFor`. */
const ARMED_GENERAL_STATUS = armedStatusFor(MINIMAL_PROGRAM);

/** Polls the microtask queue until `check()` passes (bounded, never a real
 *  wait). `stubTransport`'s writes/acks all resolve through chained
 *  Promises, never a real timer — but SEVERAL microtask hops separate
 *  "an ack was just notified" from "the NEXT sequence's own `awaitAck()`
 *  has registered its `pendingAck`" (prepare step -> `sendPrepare` returns ->
 *  `program()`'s next `sendSequence` call -> `discardStaleAcks()` ->
 *  `awaitAck()`). Sending the next ack before that registration completes
 *  would have it discarded as a stale leftover from the PREVIOUS sequence
 *  (fix-round 2's own protection working exactly as designed) rather than
 *  consumed as the new sequence's own first-frame response — this is what
 *  callers use to cross that gap deterministically instead of guessing a
 *  fixed number of `await Promise.resolve()` hops. */
async function waitUntil(check: () => boolean, maxTicks = 50): Promise<void> {
  for (let i = 0; i < maxTicks && !check(); i += 1) {
    await Promise.resolve();
  }
}

/**
 * Fix-round 1, F1: `createFakeTransport` no longer delivers its WAITTOBEGIN
 * bundle synchronously inside the last programming ack (that hid the very
 * tick-driven wait `verifyArmed()` exists to exercise — every fake-driven
 * test was taking the immediate-check fast path). A real `tick()` call is
 * now required before `program()` can resolve. This drains the microtask
 * queue generously first — the ENTIRE prepare+send exchange is chunk-by-chunk
 * microtask-hopped (never a real timer), and a multi-frame program can
 * need dozens of hops to fully land — THEN calls `fake.tick(0)` (no
 * scripted time elapses) to flush the now-pending armed delivery, then
 * awaits `program()` itself. Every `harness()`-driven `program()` call in
 * this file goes through this helper instead of a bare `await
 * driver.program(...)`, for exactly this reason.
 */
async function programAndArm(
  driver: ReturnType<typeof createPm5Driver>,
  fake: ReturnType<typeof createFakeTransport>,
  p: WorkoutProgram,
): Promise<void> {
  const pending = driver.program(p);
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
  fake.tick(0);
  await pending;
}

/**
 * The `stubTransport` counterpart to `programAndArm`: drives one complete
 * `program()` call by hand — a refused prepare step, the real send's
 * `"ok"` ack, then a FRESH post-send "armed" status for `verifyArmed()` to
 * observe (never a cached one; that is the whole point of that phase).
 *
 * **The refusal is NOT what the machine does** (§18 s3 item 15: the one
 * byte ever captured for a terminate sent with nothing running decodes to
 * an ACCEPT, and fix-3 Task 3 retired the fake's always-refuse default for
 * that reason). It is kept here only because every test below cares about
 * ACK TIMING rather than the prepare's outcome, `sendPrepare` swallows any
 * non-disconnect answer identically, and flipping this default would
 * re-point dozens of by-hand exchanges for no behavioural gain. Read it as
 * "an outcome the prepare survives", never as the machine's normal answer;
 * the fake-driven tests are the ones that model what the PM actually
 * sends. (Flagged for 7B: if this helper is ever rewritten, the accept is
 * the honest default.)
 *
 * Needed wherever a test must control the TIMING of individual acks and
 * status frames by hand — an ack that never comes, one that arrives before
 * `verifyArmed()` has registered its wait, a terminal state injected
 * between two frames of a sequence. `transports/fake.ts` models the
 * protocol correctly and therefore cannot be made to misbehave on cue; that
 * is exactly what these tests need.
 *
 * NOT needed for a second `program()` any more (Task 6): the fake now takes
 * a whole new programming sequence after a terminate, with no reconnect,
 * the way the machine does (interface-notes.md §19.4/§19.5). The
 * fake-driven second-workout test further down this file is the primary
 * proof of that lifecycle; the stub-driven re-program tests here remain as
 * the by-hand variants, for the run-replacement and ack-timing edges the
 * fake's own honest protocol will not produce.
 */
async function programViaStub(
  driver: ReturnType<typeof createPm5Driver>,
  transport: ReturnType<typeof stubTransport>,
  p: WorkoutProgram,
): Promise<void> {
  const sent = (): number =>
    transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
      .length;
  const start = sent();
  const pending = driver.program(p);
  await waitUntil(() => sent() > start);
  // A refusal — never-observed on hardware (§18 s3 item 15), used here
  // only because `sendPrepare` swallows anything but a disconnect and
  // these tests are about ack TIMING, not the prepare's outcome. See this
  // helper's own doc comment.
  transport.notify(
    TRANSMIT_CHARACTERISTIC_UUID,
    buildAckFrame({ frameStatus: "reject" }),
  );
  await waitUntil(() => sent() > start + prepareChunkCount);
  transport.notify(
    TRANSMIT_CHARACTERISTIC_UUID,
    buildAckFrame({ frameStatus: "ok" }),
  );
  // Drain until `verifyArmed()` has registered its wait — an "armed"
  // status delivered before that merges into `raw` and is never counted,
  // which would hang this helper rather than fail it.
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
  // The armed readback for `p` ITSELF (`armedStatusFor`), not the shared
  // `ARMED_GENERAL_STATUS` constant: every caller before walk 5 happened to
  // pass a program whose interval 0 is 60s (so the two are the same bytes),
  // and a caller that passes anything else — Sea Fret's 300s opener, say —
  // would otherwise hang here waiting for a structure the machine was never
  // told to hold.
  transport.notify(GENERAL_STATUS_UUID, armedStatusFor(p));
  await pending;
}

/** A General Status payload in an arbitrary machine state — the by-hand
 *  lifecycles below need more than `ARMED_GENERAL_STATUS` alone. */
function generalStatusIn(
  workoutState: number,
  elapsedSeconds = 0,
  distanceMeters = 0,
): Uint8Array {
  return buildGeneralStatusBytes({
    elapsedSeconds,
    distanceMeters,
    workoutType: 8,
    intervalType: 0,
    workoutState,
    rowingState: 0,
    strokeState: 0,
    totalWorkDistanceMeters: distanceMeters,
    workoutDurationRaw: 0,
    workoutDurationType: 0,
    dragFactor: 130,
  });
}

/** A 0x0033 (Additional Status 2) payload naming ONLY the Interval Count
 *  (storage-spine design spec §2, early side) — the byte `noteSummary`'s
 *  new final-interval gate reads via `toProgramIndex`, merged into `raw`
 *  the same way `generalStatusIn`'s 0x0031 payloads are. Every other field
 *  is zeroed; nothing downstream of this gate reads them. */
function additionalStatus2In(intervalCount: number): Uint8Array {
  return buildAdditionalStatus2Bytes({
    elapsedSeconds: 0,
    intervalCount,
    averagePowerWatts: 0,
    totalCalories: 0,
    splitAvgPace: 0,
    splitAvgPowerWatts: 0,
    splitAvgCalories: 0,
    lastSplitTimeSeconds: 0,
    lastSplitDistanceMeters: 0,
  });
}

/** A 0x0032 (Additional Status 1) payload naming ONLY `averageSplit` (RC-9a)
 *  — every other field zeroed, mirroring `additionalStatus2In` immediately
 *  above. `averageSplit` is passed already in SECONDS (0.01 s/lsb — this
 *  builder's own `buildAdditionalStatus1Bytes` does the re-scale to the
 *  wire's u16, and `parseAdditionalStatus1` undoes it symmetrically on
 *  receipt, so a caller here never touches the raw byte scale directly). */
function additionalStatus1With(averageSplit: number): Uint8Array {
  return buildAdditionalStatus1Bytes({
    elapsedSeconds: 0,
    speedMetersPerSecond: 0,
    spm: 0,
    heartRateBpm: null,
    currentSplit: 0,
    averageSplit,
    restDistanceMeters: 0,
    restSeconds: 0,
    ergMachineType: 0,
  });
}

/** One half of a boundary, addressed to a specific Split/Interval Number
 *  and carrying values distinctive enough to tell boundaries apart in an
 *  assertion. Built through the pm5 encoders, so these are the real bytes
 *  the driver's own decoders read. (Module-scoped since Task 4 — the
 *  run-scoping tests need the same two halves the D4 block does.) */
function splitHalf(
  boundary: number,
  seconds: number,
  meters: number,
  // R-B: defaults to 0 so every existing caller (none of which cares about
  // rest distance) is unaffected; the ramp test below is the one caller
  // that passes something else.
  restDistanceMeters = 0,
  // RC-1 (storage-spine design spec §3): defaults to 0/0 so every
  // existing caller (none of which cares about rest time/type) is
  // unaffected — the RC-1 ramp test below is the one caller that passes
  // something else.
  restSeconds = 0,
  type = 0,
) {
  return buildSplitIntervalDataBytes({
    elapsedSeconds: seconds,
    distanceMeters: meters,
    splitIntervalTimeSeconds: seconds,
    splitIntervalDistanceMeters: meters,
    intervalRestTimeSeconds: restSeconds,
    intervalRestDistanceMeters: restDistanceMeters,
    splitIntervalType: type,
    splitIntervalNumber: boundary,
  });
}

function asSplitHalf(boundary: number, avgSpm: number) {
  return buildAdditionalSplitIntervalDataBytes({
    elapsedSeconds: 0,
    splitIntervalAvgStrokeRate: avgSpm,
    splitIntervalWorkHeartRateBpm: 150,
    splitIntervalRestHeartRateBpm: 120,
    splitIntervalAvgPace: 120,
    splitIntervalTotalCalories: 0,
    splitIntervalAvgCalories: 0,
    splitIntervalSpeedMetersPerSecond: 0,
    splitIntervalPowerWatts: 0,
    splitAvgDragFactor: 130,
    splitIntervalNumber: boundary,
    // RC-8 (storage-spine design spec §3): 0, not the old 1 this fixture
    // used to carry — the real machine reads 0 in 3448 of 3448 committed
    // frames (docs/monitor/pm5-ble-ecosystem-review.md:389; fake.ts's own
    // `ergMachineType` comment has the same citation).
    ergMachineType: 0,
  });
}

/**
 * A hand-advanced millisecond clock for `DriverOptions.now` — the driver's
 * one wall-clock reading (hardware walk 5, 2026-08-10:
 * `STRUCTURE_MISMATCH_WINDOW_MS`, driver.ts). Time does not pass on its own
 * in these tests, which is the point: a test that fires three status
 * notifications in one synchronous burst is a test of the TICK STREAK, and
 * the walk's whole finding is that a tick streak is not a duration. Only a
 * test that means "the machine held the wrong structure for longer than its
 * own transition takes" advances this.
 */
function manualClock(startMs = 0): {
  now: () => number;
  advance(by: number): void;
} {
  let ms = startMs;
  return {
    now: (): number => ms,
    advance(by: number): void {
      ms += by;
    },
  };
}

function harness(
  script: Parameters<typeof createFakeTransport>[0],
  // Task 3: `terminate()` now waits `settleTicks` GENERAL_STATUS ticks
  // after its own ack before resolving (default 3) — the fake only ever
  // sends ONE such tick synchronously alongside a terminate ack (no
  // continuous heartbeat model), which arrives before `terminate()` even
  // registers its own wait, so it is never enough on its own. Tests whose
  // focus is NOT settle behaviour pass `{ settleTicks: 0 }` here to keep
  // `terminate()` resolving right after its ack, exactly like before this
  // task; the settle wait itself is pinned by dedicated `stubTransport`
  // tests below with full manual tick control.
  driverOptions: Parameters<typeof createPm5Driver>[2] = {},
) {
  const fake = createFakeTransport(script);
  const log = createEventLog();
  const driver = createPm5Driver(fake, log, driverOptions);
  const events: MonitorEvent[] = [];
  driver.events((e) => events.push(e));
  return { fake, log, driver, events };
}

/** A bare hand-rolled `Transport` for edge cases the shared fake can't
 *  reach on its own (an unsolicited ack, a notification arriving before
 *  its sibling characteristics have ever been seen, a sample-rate write
 *  that fails) — direct control over exactly what's subscribed/notified,
 *  independent of the fake's own protocol/timeline modeling. */
function stubTransport(opts: { sampleRateFails?: boolean } = {}) {
  const subs = new Map<string, Set<(bytes: Uint8Array) => void>>();
  let disconnectCb: ((reason: string) => void) | null = null;
  const writes: { uuid: string; bytes: Uint8Array }[] = [];

  const transport: Transport & {
    notify(uuid: string, bytes: Uint8Array): void;
    fireDisconnect(reason: string): void;
    writes: typeof writes;
    /** Every characteristic with at least one live `subscribe()` callback
     *  right now — fast-follow Task 1's subscription-list pin needs to
     *  assert WHICH characteristics the driver subscribed at construction,
     *  not merely a count (`fake.ts`'s `subscriptionCount()` gives only a
     *  count, not membership). */
    subscribedUuids(): string[];
  } = {
    scan(): Promise<DiscoveredMonitor[]> {
      return Promise.resolve([]);
    },
    connect(): Promise<void> {
      return Promise.resolve();
    },
    write(uuid, bytes): Promise<void> {
      writes.push({ uuid, bytes });
      if (uuid === SAMPLE_RATE_UUID && opts.sampleRateFails) {
        return Promise.reject(new Error("radio busy"));
      }
      return Promise.resolve();
    },
    subscribe(uuid, cb): () => void {
      let set = subs.get(uuid);
      if (!set) {
        set = new Set();
        subs.set(uuid, set);
      }
      set.add(cb);
      return () => set!.delete(cb);
    },
    disconnect(): Promise<void> {
      return Promise.resolve();
    },
    onDisconnect(cb): () => void {
      disconnectCb = cb;
      return () => {
        if (disconnectCb === cb) disconnectCb = null;
      };
    },
    notify(uuid, bytes) {
      for (const cb of subs.get(uuid) ?? []) cb(bytes);
    },
    fireDisconnect(reason) {
      disconnectCb?.(reason);
    },
    subscribedUuids(): string[] {
      return Array.from(subs.entries())
        .filter(([, set]) => set.size > 0)
        .map(([uuid]) => uuid);
    },
    writes,
  };
  return transport;
}

/** Waits for the current microtask queue to drain — used only to let a
 *  fire-and-forget `.catch()` (the driver's sample-rate write) settle
 *  before asserting on its side effect. Not a simulated session timer. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createPm5Driver: capabilities", () => {
  it("reports fixed PM5 capabilities, falling back to the 'MONITOR' placeholder when no device name was given (RC-18 retarget: this pin was 'PM5')", () => {
    const { driver } = harness({ program: MINIMAL_PROGRAM });
    expect(driver.capabilities).toStrictEqual({
      canProgram: true,
      hasStrokeRate: true,
      reportsIntervals: true,
      // RF21 first corollary (fix round 1): pinned with the independent
      // literal, not the imported production symbol — a retune of
      // NAMELESS_MONITOR_CAPTION's own value must not retune this pin.
      deviceName: "MONITOR",
    });
  });

  // The realistic fixture (briefing: "at least one test per client task
  // starts from a real library workout"): Sea Fret, the same compiled
  // program `seaFretProgram()` builds for the busy-error tests below.
  it("carries the picked device's own name (options.deviceName) in capabilities — never the placeholder — when one was provided", () => {
    const { driver } = harness(
      { program: seaFretProgram() },
      { deviceName: "PM5 432331249" },
    );
    expect(driver.capabilities).toStrictEqual({
      canProgram: true,
      hasStrokeRate: true,
      reportsIntervals: true,
      deviceName: "PM5 432331249",
    });
  });
});

describe("createPm5Driver: computeIntervalRemaining (pure)", () => {
  const interval = {
    type: "work" as const,
    kind: "time" as const,
    value: 60,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 0,
  };

  it("returns null with no interval (armed/idle/finished/terminated)", () => {
    expect(computeIntervalRemaining(undefined, 30)).toBeNull();
  });

  it("subtracts progress from the interval's value", () => {
    expect(computeIntervalRemaining(interval, 25)).toStrictEqual({
      kind: "time",
      value: 35,
    });
  });

  it("clamps at zero rather than going negative on a quantization overshoot", () => {
    expect(computeIntervalRemaining(interval, 61)).toStrictEqual({
      kind: "time",
      value: 0,
    });
  });

  it("carries the interval's own kind (distance)", () => {
    const distanceInterval = {
      ...interval,
      kind: "distance" as const,
      value: 500,
    };
    expect(computeIntervalRemaining(distanceInterval, 200)).toStrictEqual({
      kind: "distance",
      value: 300,
    });
  });
});

describe("createPm5Driver: computeIntervalAccrued (pure)", () => {
  // ROADMAP CL item 7 / DEVIATIONS' pane-C active-row row: the complement of
  // `computeIntervalRemaining` above — the dimension the interval does NOT
  // count down. `interval` fixtures are the same shapes that block uses.
  const timeInterval = {
    type: "work" as const,
    kind: "time" as const,
    value: 60,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 0,
  };
  const distanceInterval = {
    type: "work" as const,
    kind: "distance" as const,
    value: 500,
    targetSplit: null,
    displaySpm: null,
    restSeconds: 0,
  };

  it("returns null with no interval (armed/idle/finished/terminated) — same absence rule as its sibling", () => {
    expect(computeIntervalAccrued(undefined, 30)).toBeNull();
  });

  it("a TIME interval accrues DISTANCE — the complement kind, not its own", () => {
    expect(computeIntervalAccrued(timeInterval, 137)).toStrictEqual({
      kind: "distance",
      value: 137,
    });
  });

  it("a DISTANCE interval accrues TIME — the complement kind, not its own", () => {
    expect(computeIntervalAccrued(distanceInterval, 42)).toStrictEqual({
      kind: "time",
      value: 42,
    });
  });

  it("clamps at zero rather than going negative (a quantization edge, mirroring its sibling's clamp)", () => {
    expect(computeIntervalAccrued(timeInterval, -5)).toStrictEqual({
      kind: "distance",
      value: 0,
    });
  });
});

describe("createPm5Driver: a rowing-state frame arriving before program() was ever called", () => {
  it("computes intervalRemaining as null (no program to size the interval against) without crashing", () => {
    // A real device wouldn't produce this shape unprompted, but nothing in
    // `Transport` guarantees it can't — `computeRemainingForFrame`'s own
    // `!program` guard exists for exactly this defensive case. AS1/AS2 are
    // notified first (arbitrary valid bytes) purely to satisfy the "seen"
    // gate so `maybeEmitFrame` actually reaches `computeRemainingForFrame`.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(
      GENERAL_STATUS_UUID,
      buildGeneralStatusBytes({
        elapsedSeconds: 30,
        distanceMeters: 100,
        workoutType: 8,
        intervalType: 0,
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        rowingState: 1,
        strokeState: 1,
        totalWorkDistanceMeters: 100,
        workoutDurationRaw: 0,
        workoutDurationType: 0,
        dragFactor: 130,
      }),
    );

    const frames = events.filter((e) => e.kind === "frame");
    expect(frames).toHaveLength(1);
    // D3 fix (`intervalIndex.ts`): with no program armed, `programLength`
    // is 0 and `toProgramIndex` returns `null` by its own contract — there
    // is no program for a raw machine index to be explained against, so
    // "no interval is current" is the correct reading, same conclusion
    // `intervalRemaining`'s own `!program` guard already reaches.
    expect(frames[0]).toMatchObject({
      frame: { intervalIndex: null, intervalRemaining: null },
    });
    // ROADMAP CL item 7: `intervalAccrued` shares `intervalRemaining`'s own
    // `!program` guard, so it is null under the identical condition.
    expect(frames[0]).toMatchObject({ frame: { intervalAccrued: null } });
  });
});

describe("createPm5Driver: distance-kind interval — intervalRemaining uses distanceMeters progress", () => {
  it("computes remaining meters from the checkpoint, not elapsed seconds", async () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "distance",
          value: 1000,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 60,
        distanceMeters: 300,
        spm: 22,
        currentSplit: 100,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 120,
        distanceMeters: 700,
        spm: 22,
        currentSplit: 100,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
    ];
    const { fake, driver, events } = harness({ program, events: timeline });
    await programAndArm(driver, fake, program);
    fake.tick(200);

    const frames = events.filter((e) => e.kind === "frame");
    // No boundary ever occurs in this program (one interval only), so
    // 0x0033's Last Split Distance stays at its session-start value (0)
    // throughout — progress at the second tick is simply the session's
    // own cumulative distanceMeters (700), using distanceMeters, never
    // elapsedSeconds: remaining = 1000 - 700 = 300.
    expect(frames[frames.length - 1]).toMatchObject({
      frame: { intervalRemaining: { kind: "distance", value: 300 } },
    });
    // ROADMAP CL item 7: the OTHER dimension (time) accrues from the SAME
    // Last Split checkpoint (0, same reasoning as above) against
    // elapsedSeconds, never distanceMeters: accrued = 120 - 0 = 120.
    expect(frames[frames.length - 1]).toMatchObject({
      frame: { intervalAccrued: { kind: "time", value: 120 } },
    });
  });

  it("a TIME interval accrues DISTANCE the mirror way — the complement dimension, not a second copy of the countdown", async () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "time",
          value: 300,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 60,
        distanceMeters: 300,
        spm: 22,
        currentSplit: 100,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
    ];
    const { fake, driver, events } = harness({ program, events: timeline });
    await programAndArm(driver, fake, program);
    fake.tick(100);

    const frames = events.filter((e) => e.kind === "frame");
    // The programmed dimension (time) counts down: remaining = 300 - 60 =
    // 240. The complement (distance) accrues from the SAME checkpoint (0,
    // no boundary yet): accrued = 300 - 0 = 300.
    expect(frames[frames.length - 1]).toMatchObject({
      frame: {
        intervalRemaining: { kind: "time", value: 240 },
        intervalAccrued: { kind: "distance", value: 300 },
      },
    });
  });
});

describe("createPm5Driver: HIGH-1 fix — intervalRemaining is correct on the FIRST observed tick", () => {
  it("a late-arriving first tick (300m into a 1000m interval) reports the true 700m remaining, not the full 1000m", async () => {
    // The exact defect the fix-round review pinned: an earlier checkpoint
    // design rooted itself at whichever tick the driver happened to see
    // first, so a first observation arriving well after the interval
    // actually started reported the FULL interval value as "remaining"
    // forever. 0x0033's Last Split Distance (0, since no boundary has
    // ever happened yet) needs no observation history to get this right.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    const program: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "distance",
          value: 1000,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    // `stubTransport` never auto-acks — the driver only sets its internal
    // `program` (needed for `computeRemainingForFrame`'s `!program` guard
    // to pass) once `program()`'s ack-gated sequence actually resolves, so
    // this manually acks the prepare step, then the single frame a
    // 1-interval program produces, then supplies the WAITTOBEGIN status
    // `verifyArmed` (driver.ts) is waiting on before `program()` resolves.
    const pending = driver.program(program);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    // Fix-round 2: `verifyArmed`'s snapshot is now taken AFTER the send
    // fully resolves (not before it starts) — drain until that has
    // actually happened, or this "armed" notify would land BEFORE the
    // snapshot and not count (see verifyArmed's own doc comment).
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    // Fix-3 Task 4: `verifyArmed` now also requires 0x0031 to report THIS
    // program's own structure — a DISTANCE 1000m interval 0, i.e. raw 1000
    // at duration type Distance — so the shared `ARMED_GENERAL_STATUS`
    // (`MINIMAL_PROGRAM`'s 60s/Time) will not arm this one.
    transport.notify(GENERAL_STATUS_UUID, armedStatusFor(program));
    await pending;

    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20)); // lastSplitDistanceMeters = 0
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(
      GENERAL_STATUS_UUID,
      buildGeneralStatusBytes({
        elapsedSeconds: 60,
        distanceMeters: 300,
        workoutType: 8,
        intervalType: 1,
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        rowingState: 1,
        strokeState: 1,
        totalWorkDistanceMeters: 300,
        workoutDurationRaw: 0,
        workoutDurationType: 0,
        dragFactor: 130,
      }),
    );

    const frames = events.filter((e) => e.kind === "frame");
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      frame: { intervalRemaining: { kind: "distance", value: 700 } },
    });
  });

  it("a reconnect timeline SPANNING a boundary re-derives the correct remaining for the NEW interval, not the full interval value", async () => {
    // The case the plain "disconnect mid-interval" reconnect test dodges
    // (a 1-interval program has no boundary to span at all). Two distance
    // intervals: 500m then 1000m.
    const program: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "distance",
          value: 500,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          type: "work",
          kind: "distance",
          value: 1000,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 40,
        distanceMeters: 200,
        spm: 22,
        currentSplit: 110,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
      // The interval-0 boundary happens WHILE disconnected — never
      // delivered live, only tracked internally by the fake.
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 100,
          distanceMeters: 500,
          avgSpm: 22,
          avgHeartRateBpm: 140,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 100,
        cumulativeDistanceMeters: 500,
      },
      // The interval-1 tick also happens while disconnected — 200m into
      // the new 1000m interval. Task 6 (interface-notes.md §20 items
      // 17/24): 0x0031's own elapsed/distance pair is PER-INTERVAL on real
      // hardware, so the wire itself already reads 200m/40s here — not the
      // 700m/140s session-cumulative figure an earlier (falsified) model
      // of this fixture used, re-derived only by subtracting a checkpoint.
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 40,
        distanceMeters: 200,
        spm: 22,
        currentSplit: 108,
        heartRateBpm: 145,
        programIntervalIndex: 1,
      },
    ];
    const { fake, driver, events } = harness({ program, events: timeline });

    await programAndArm(driver, fake, program);
    fake.tick(100); // interval-0 tick lands normally
    fake.injectDisconnect();
    fake.tick(200); // the boundary AND the interval-1 tick both elapse while disconnected
    fake.completeReconnect(); // flushes both — boundary first, then the fresh interval-1 status

    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(1);

    const frames = events.filter((e) => e.kind === "frame");
    const latest = frames[frames.length - 1];
    // 1000m interval, 200m already read straight off 0x0031's own
    // per-interval pair (no checkpoint subtraction, Task 6) -> 800m
    // remaining. An earlier design would have checkpointed at THIS tick
    // itself (progress 0, remaining the full 1000m) since it's the first
    // tick the driver ever observed for interval 1 — this reconnect case is
    // what that earlier HIGH-1 fix exists to cover, unaffected by Task 6
    // deleting the (separately falsified) checkpoint subtraction.
    expect(latest).toMatchObject({
      kind: "frame",
      frame: {
        intervalIndex: 1,
        distanceMeters: 200,
        intervalRemaining: { kind: "distance", value: 800 },
      },
    });
    // ROADMAP CL item 7 (and Task 6): `intervalAccrued` (time, the
    // complement of this distance interval) reads the SAME per-interval
    // pair's other field directly — accrued = 40, the wire's own
    // `elapsedSeconds` for this tick, no re-checkpointing needed now that
    // there is no checkpoint to re-derive.
    expect(latest).toMatchObject({
      frame: { intervalAccrued: { kind: "time", value: 40 } },
    });
  });
});

describe("createPm5Driver: Task 6 — the interval clock stops subtracting a checkpoint the wire lags", () => {
  // The inversion result (225+161 frames replayed, zero mismatches;
  // interface-notes.md §20 items 17/24): 0x0033's Last Split checkpoint
  // reads ZERO through interval indices 0 and 1, then LAGS one boundary
  // behind from index 2 on — the cumulative point at which the PREVIOUS
  // interval began, not the current one. `computeRemainingForFrame`/
  // `computeAccruedForFrame` (driver.ts) no longer read this field at all:
  // progress is the interval's own 0x0031 pair directly (item 12: it is
  // already per-interval on the wire). These tests exercise the fake as the
  // wire model (Step 2 taught it the measured semantics first, `fake.ts`'s
  // own `wireLastSplit`) so a regression that reintroduces the subtraction
  // fails against a checkpoint the wire genuinely reports, not a
  // self-consistent fiction that would paper over it.

  it("the walk signature: a distance interval at index 2, checkpoint lagging to interval 0's own end, reads 397.3m remaining — not 578.3m", async () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          type: "work",
          kind: "distance",
          value: 500,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 90,
        spm: 24,
        currentSplit: 120,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
      // Interval 0 ends at 181m (whole meters — the wire field cannot carry
      // a fraction, interface-notes.md §10). This cumulative total is what
      // interval 2's own checkpoint LAGS to, two boundaries later.
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 58,
          distanceMeters: 181,
          avgSpm: 24,
          avgHeartRateBpm: 140,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 58,
        cumulativeDistanceMeters: 181,
      },
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 28,
        distanceMeters: 85,
        spm: 24,
        currentSplit: 121,
        heartRateBpm: 141,
        programIntervalIndex: 1,
      },
      // Interval 1's own boundary — this is the ONE the wire checkpoint
      // will lag BEHIND once interval 2 starts: it shifts `wireLastSplit`
      // to interval 0's boundary (181m) rather than rooting it here.
      {
        atMs: 400,
        kind: "boundary",
        actual: {
          index: 1,
          elapsedSeconds: 55,
          distanceMeters: 150,
          avgSpm: 24,
          avgHeartRateBpm: 141,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 113,
        cumulativeDistanceMeters: 331,
      },
      // Interval 2 (distance, 500m goal): the walk signature's own numbers.
      {
        atMs: 500,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 45,
        distanceMeters: 102.7,
        spm: 26,
        currentSplit: 115,
        heartRateBpm: 145,
        programIntervalIndex: 2,
      },
    ];
    const { fake, driver, events } = harness({ program, events: timeline });
    await programAndArm(driver, fake, program);
    for (let i = 0; i < 5; i += 1) fake.tick(100);

    const interval2Frame = events.find(
      (e) => e.kind === "frame" && e.frame.intervalIndex === 2,
    );
    expect(interval2Frame).toBeDefined();
    // 500m goal, 102.7m read straight off 0x0031's own per-interval
    // Distance (no checkpoint subtraction) -> 397.3m remaining. TODAY (the
    // falsified subtraction still in place) reads 578.3m instead:
    // progress = 102.7 - 181 (interval 0's lagged checkpoint) = -78.3,
    // remaining = 500 - (-78.3) = 578.3.
    expect(interval2Frame).toMatchObject({
      kind: "frame",
      frame: { intervalRemaining: { kind: "distance", value: 397.3 } },
    });
    // The complement dimension (time) reads the SAME per-interval pair's
    // other field directly: accrued = 45, this tick's own `elapsedSeconds`.
    expect(interval2Frame).toMatchObject({
      frame: { intervalAccrued: { kind: "time", value: 45 } },
    });
  });

  it("the same-dimension case: a 3x1:00 program at index 2 reads 60-elapsed remaining — not 120-elapsed", async () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 20,
        spm: 22,
        currentSplit: 130,
        heartRateBpm: 138,
        programIntervalIndex: 0,
      },
      // Interval 0 completes at exactly its own 60s duration — the lab
      // number this test's own checkpoint (60) comes from.
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 45,
          avgSpm: 22,
          avgHeartRateBpm: 138,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 45,
      },
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 22,
        spm: 22,
        currentSplit: 129,
        heartRateBpm: 139,
        programIntervalIndex: 1,
      },
      {
        atMs: 400,
        kind: "boundary",
        actual: {
          index: 1,
          elapsedSeconds: 60,
          distanceMeters: 46,
          avgSpm: 22,
          avgHeartRateBpm: 139,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 120,
        cumulativeDistanceMeters: 91,
      },
      // Interval 2's live tick — 25s/90m into it.
      {
        atMs: 500,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 25,
        distanceMeters: 90,
        spm: 23,
        currentSplit: 128,
        heartRateBpm: 140,
        programIntervalIndex: 2,
      },
    ];
    const { fake, driver, events } = harness({ program, events: timeline });
    await programAndArm(driver, fake, program);
    for (let i = 0; i < 5; i += 1) fake.tick(100);

    const interval2Frame = events.find(
      (e) => e.kind === "frame" && e.frame.intervalIndex === 2,
    );
    expect(interval2Frame).toBeDefined();
    // 60s interval, 25s read straight off 0x0031's own per-interval Elapsed
    // Time -> 35s remaining (60 - elapsed). TODAY (the falsified
    // subtraction) reads 120 - elapsed = 95s instead: progress = 25 - 60
    // (interval 0's lagged checkpoint) = -35, remaining = 60 - (-35) = 95.
    expect(interval2Frame).toMatchObject({
      kind: "frame",
      frame: { intervalRemaining: { kind: "time", value: 35 } },
    });
    // The complement dimension (distance) reads the SAME per-interval
    // pair's other field directly: accrued = 90, this tick's own
    // `distanceMeters` — TODAY it would instead be 90 - 45 (interval 0's
    // lagged distance checkpoint) = 45.
    expect(interval2Frame).toMatchObject({
      frame: { intervalAccrued: { kind: "distance", value: 90 } },
    });
  });

  it("intervals 0-1 are a no-op: a REALISTIC (per-interval-reset) 3-interval program reads the same remaining/accrued whether or not the checkpoint subtraction exists", async () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    const timeline: FakeTimelineEvent[] = [
      // Interval 0: checkpoint is 0 on hardware from the very first tick a
      // session can ever have (nothing has completed yet) — the ORIGINAL
      // no-op case fix-round HIGH-1 already covers, re-pinned here.
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 18,
        distanceMeters: 60,
        spm: 22,
        currentSplit: 130,
        heartRateBpm: 138,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 22,
          avgHeartRateBpm: 138,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 200,
      },
      // Interval 1: checkpoint is ALSO 0 on hardware (interface-notes.md
      // §20 item 17/24's own inversion result) — this is the row the
      // pre-Task-6 code got wrong for any program with a real boundary
      // before it (see the reconnect-boundary test above, fixed by Task 6
      // to a REALISTIC per-interval fixture), pinned here with a freshly
      // realistic one of its own.
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 22,
        distanceMeters: 75,
        spm: 22,
        currentSplit: 129,
        heartRateBpm: 139,
        programIntervalIndex: 1,
      },
    ];
    const { fake, driver, events } = harness({ program, events: timeline });
    await programAndArm(driver, fake, program);
    for (let i = 0; i < 3; i += 1) fake.tick(100);

    const frames = events.filter((e) => e.kind === "frame");
    const interval0Frame = frames.find((f) => f.frame.intervalIndex === 0);
    const interval1Frame = frames.find((f) => f.frame.intervalIndex === 1);
    expect(interval0Frame).toBeDefined();
    expect(interval1Frame).toBeDefined();
    // Interval 0: no boundary has ever fired, checkpoint 0 either way ->
    // remaining = 60 - 18 = 42, accrued = 60 (this tick's own distance).
    expect(interval0Frame).toMatchObject({
      frame: {
        intervalRemaining: { kind: "time", value: 42 },
        intervalAccrued: { kind: "distance", value: 60 },
      },
    });
    // Interval 1: ONE boundary has fired, but the checkpoint still reads 0
    // (the inversion result's "through interval indices 0 AND 1") ->
    // remaining = 60 - 22 = 38, accrued = 75, identical to a driver that
    // never had a checkpoint to subtract in the first place.
    expect(interval1Frame).toMatchObject({
      frame: {
        intervalRemaining: { kind: "time", value: 38 },
        intervalAccrued: { kind: "distance", value: 75 },
      },
    });
  });
});

describe("createPm5Driver: the full happy path over a real compiled workout (Sea Fret)", () => {
  it("program -> armed -> frames (with re-derived intervalRemaining) -> boundaries -> complete", async () => {
    const program = seaFretProgram();
    const timeline: FakeTimelineEvent[] = [
      // Interval 0 (the 300s easy opener): one live tick 120s in.
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 120,
        distanceMeters: 400,
        spm: 20,
        currentSplit: 130,
        heartRateBpm: 130,
        programIntervalIndex: 0,
      },
      // Interval 0's boundary is a WORK->WORK one: the opener compiles with
      // `restSeconds: 0`, so no rest tick ever separates it from interval 1
      // and the state word is still "rowing" when 0x0037/38 arrive. Task 5
      // (interface-notes.md §19.8, answering §17 item 13): the fake's
      // `toMachineIndex(0, "rowing")` puts a plain `0` on the wire here (its
      // own model is unaffected by this task), and `toActualIndex(0,
      // "rowing", 3)` clamps `0 - 1` back up to `0` — this boundary happens
      // to land on the same number either way the offset is applied, so it
      // does not by itself discriminate old vs. new (the discriminating row
      // is pinned separately, driver-test-side, in the Task 5 describe
      // block below).
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 300,
          distanceMeters: 1000,
          avgSpm: 20,
          avgHeartRateBpm: 135,
          restDistanceMeters: 0,
        },
        // The session's first interval starts at cumulative 0, so its
        // boundary's cumulative totals equal its own per-interval ones.
        // These `cumulative*` fields are fake-INTERNAL bookkeeping only
        // (`lastBoundaryCumulative`/`wireLastSplit`, `fake.ts`) since Task 6
        // deleted the driver-side checkpoint subtraction that used to read a
        // derivative of them — nothing below depends on this number any
        // more; it exists purely to keep 0x0033's own wire model honest.
        cumulativeElapsedSeconds: 300,
        cumulativeDistanceMeters: 1000,
      },
      // Interval 1 (240s work): one live tick 60s into THIS interval —
      // session-cumulative elapsed is 300 (interval 0) + 60 = 360. Left
      // session-cumulative deliberately (interface-notes.md §20 item 24,
      // the "One EXCEPTION" note below this timeline): this fixture's own
      // 0x0031 pair is a KNOWN, already-flagged unrealism, not fixed by
      // Task 6 — fully resetting it per interval (item 12) is blocked by a
      // SEPARATE, out-of-scope gap this task found but did not fix (the
      // fake's `totalWorkDistanceFor` derives 0x0031's session-cumulative
      // TWD field from this SAME per-tick `distanceMeters`, so genuinely
      // separate per-interval keys made the (now-retired, RC-9c) TWD
      // verdict's accumulator check unsatisfiable by any fixture choice —
      // proved by exhaustion, not left unresearched).
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 360,
        distanceMeters: 1400,
        spm: 22,
        currentSplit: 132,
        heartRateBpm: 150,
        programIntervalIndex: 1,
      },
      // Interval 1's TRAILING REST (60s, folded into interval 1 by
      // `compileProgram`). This is where the machine's own numbering
      // diverges from ours: 0x0033's Interval Count reads 2 here, not 1 —
      // it is counting down TO interval 2 (interface-notes.md §18 #3), and
      // the fake puts that forward-attributed value on the wire. Every
      // assertion below sees OUR 1, which is `toProgramIndex` doing its job.
      {
        atMs: 350,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 570,
        distanceMeters: 2000,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 140,
        programIntervalIndex: 1,
      },
      // ...and the boundary lands DURING that rest, exactly as the observed
      // trace has it ("20 resting -> 21 notify 0x0037"), so 0x0037/38's own
      // Split/Interval Number is forward-attributed too: the wire says 2
      // for the interval we call 1.
      {
        atMs: 400,
        kind: "boundary",
        actual: {
          index: 1,
          elapsedSeconds: 240,
          distanceMeters: 1000,
          avgSpm: 22,
          avgHeartRateBpm: 155,
          restDistanceMeters: 0,
        },
        // Fake-internal bookkeeping only (see interval 0's boundary above) —
        // checkpoint(300) + this interval's 240s work + its 60s rest —
        // roots 600s/2000m, unused by the driver since Task 6.
        cumulativeElapsedSeconds: 600,
        cumulativeDistanceMeters: 2000,
      },
      // Interval 2 (240s work): one live tick.
      {
        atMs: 500,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 660,
        distanceMeters: 2400,
        spm: 22,
        currentSplit: 132,
        heartRateBpm: 152,
        programIntervalIndex: 2,
      },
      // Interval 2's trailing rest — the LAST interval's own, which §17
      // item 8 confirmed the machine counts down in full. Here the machine
      // emits the PHANTOM: 0x0033 reads 3 on a three-interval program,
      // counting down to an interval that does not exist. This is D3's
      // exact observed shape (a 2-interval session ended on machine index
      // 2), and the value `toProgramIndex` clamps back onto interval 2.
      {
        atMs: 550,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 870,
        distanceMeters: 3000,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 145,
        programIntervalIndex: 2,
      },
      {
        atMs: 600,
        kind: "boundary",
        actual: {
          index: 2,
          elapsedSeconds: 240,
          distanceMeters: 1000,
          avgSpm: 22,
          avgHeartRateBpm: 158,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 900,
        cumulativeDistanceMeters: 3000,
      },
      // Workout end — no belt was ever worn for the closing tick, so this
      // is also the D5 path: `null` here means the fake writes `0` on the
      // wire (the byte the real machine sent), never the documented 255.
      {
        atMs: 700,
        kind: "status",
        workoutState: WORKOUTSTATE_WORKOUTEND,
        elapsedSeconds: 900,
        distanceMeters: 3400,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        programIntervalIndex: 2,
      },
    ];
    const { fake, driver, events, log } = harness({
      program,
      events: timeline,
    });

    await programAndArm(driver, fake, program);
    // The fake's WAITTOBEGIN status (flushed by `programAndArm`'s own
    // `tick(0)` call, fix-round 1, F1) lands as a "frame" event before this
    // driver's own synthesized `{kind: "armed"}` event, which only fires
    // once `verifyArmed()` — and so `program()`'s promise — actually
    // resolves. Both convey the same transition; presence, not position,
    // is what matters.
    expect(events[0]).toMatchObject({
      kind: "frame",
      frame: { state: "armed" },
    });
    expect(events.some((e) => e.kind === "armed")).toBe(true);

    for (let i = 0; i < 7; i += 1) fake.tick(100);

    // Trace-assertion #1: programming emitted exactly these command/ack
    // pairs — one "write" per BLE chunk, then one "ack" — filtered
    // straight out of the injectable event log. Scoped to entries AFTER
    // the prepare step's own "prepare-sent" marker (plan Task 2/design
    // spec §3: `program()` now sends `buildTerminate()` as a leading
    // prepare, which contributes its own write/ack pair to the SAME log
    // kinds first). The marker used to be "prepare-rejected" — fix-3 Task
    // 3 retired the fake's always-refuse prepare (§18 s3 item 15's
    // captured byte is an ACCEPT), so a clean-state `program()` no longer
    // records one, and "prepare-sent" is the entry that now ends the
    // prepare exchange.
    const prepareSeq = log
      .entries()
      .find((e) => e.kind === "prepare-sent")!.seq;
    const trace = log
      .entries()
      .filter(
        (e) => e.seq > prepareSeq && (e.kind === "write" || e.kind === "ack"),
      );
    expect(trace.length).toBeGreaterThan(0);
    expect(trace[trace.length - 1]!.kind).toBe("ack");
    expect(
      trace.every((e, i) => (i < trace.length - 1 ? e.kind === "write" : true)),
    ).toBe(true);

    const kinds = events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "intervalComplete")).toHaveLength(3);
    expect(kinds.filter((k) => k === "workoutComplete")).toHaveLength(1);
    expect(kinds[kinds.length - 1]).toBe("workoutComplete");

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    // The repo's end-to-end index assertion across a full multi-interval
    // program. Since Task 4 the fake puts the MACHINE's own numbers on the
    // wire (forward-attributed rests, phantom index and all), so this
    // sequence is now produced by `toProgramIndex` actually undoing that —
    // not by both sides agreeing on a pre-normalized fiction. The log
    // assertion immediately below shows the two numberings side by side,
    // which is what makes that claim checkable rather than asserted.
    expect(
      boundaries.map((e) =>
        e.kind === "intervalComplete" ? e.actual.index : -1,
      ),
    ).toStrictEqual([0, 1, 2]);
    // Machine numbering vs ours, straight out of the trace: interval 0's
    // boundary fired while still rowing (no rest to attribute forward), the
    // other two fired mid-rest and carry the +1 — the last of them being
    // the phantom `3` on a three-interval program.
    expect(
      log
        .entries()
        .filter((e) => e.kind === "interval-complete")
        .map((e) => e.detail),
    ).toStrictEqual([
      "index=0 (machine reported 0)",
      "index=1 (machine reported 2)",
      "index=2 (machine reported 3)",
    ]);
    // The rest ticks themselves normalize too, not just the boundaries:
    // 0x0033 read 2 and 3 during those two rests.
    expect(
      events
        .filter((e) => e.kind === "frame" && e.frame.state === "resting")
        .map((e) => (e.kind === "frame" ? e.frame.intervalIndex : -1)),
    ).toStrictEqual([1, 2]);
    // Nothing in this session is unexplainable — every machine number lands
    // on a real interval once normalized, so the D3 divergence trigger
    // stays quiet and the MED-2 raw-vs-raw one has nothing to report
    // either (0x0033 and 0x0037/38 agree at every boundary, which is
    // precisely why the raw values alone could never have caught D3).
    //
    // One EXCEPTION, carved out by name rather than by a narrowed allowlist
    // (task-11 fix round, review IMPORTANT-1: an allowlist of two kinds
    // goes silent on every future divergence kind this test would
    // otherwise still catch): CR2 spec 1 Task 11's open-on-reset guard also
    // logs kind "divergence", and this fixture's own 0x0031 elapsed/
    // distance values do not reset at interval 1's own opening tick
    // (elapsed continues 120 -> 360 rather than dropping back near zero).
    // That is NOT an open question about the wire — 0x0031's elapsed/
    // distance being PER-INTERVAL is hardware-settled (walk 4;
    // re-confirmed twice in the very walk this task cites:
    // `walk-2026-08-15/session-b-poisoned.json` seq 26 "elapsed=60
    // distance=173.3" -> seq 28 "elapsed=0 distance=0.8", and
    // `session-a-multitest.json` seq 27 "elapsed=60.4 distance=182" -> seq
    // 29 "elapsed=0.03 distance=0", both genuine boundary resets). This
    // fixture's own elapsed/distance values are still deliberately left
    // session-cumulative here: Task 6 (interface-notes.md §20 items 17/24)
    // deleted the driver-side checkpoint subtraction that used to recover
    // per-interval progress from a pair like this one, and its own
    // `intervalRemaining` assertion below documents the clamped-to-zero
    // consequence of that on this fixture's known-unrealistic elapsed
    // value.
    //
    // A SECOND carve-out used to live here, added by the 2026-08-18
    // connected-metrics spec's Task 1: this fixture's own already-disclosed
    // wire-impossibility (every key beyond 0 refused open, above) made the
    // driver's own accumulator read the last tick's raw session-cumulative
    // total (3400 m) while the fake's honest, boundary-derived TWD read the
    // real work total (3000 m, 0 rest scripted) — a 400 m gap the (now
    // retired, RC-9c) TWD verdict would have logged as "accumulator and
    // machine total differ". RC-9c removed that verdict outright (design
    // spec 2026-08-25-free-oracles §2), so no divergence entry of that
    // shape can fire any more and the carve-out is gone with it — this
    // fixture's known unrealism otherwise remains, unaffected, and still
    // documents the `intervalRemaining` clamp above.
    expect(
      log
        .entries()
        .filter(
          (e) => e.kind === "divergence" && !e.detail.includes("refused open"),
        ),
    ).toHaveLength(0);
    // D5, end to end over a real workout: the closing tick had no belt, and
    // the fake sent the byte the machine sent for that — `0`, not 255.
    // Either way this must reach a consumer as "no reading".
    const finalFrame = events.filter((e) => e.kind === "frame").at(-1);
    expect(finalFrame).toMatchObject({
      kind: "frame",
      frame: { state: "finished", heartRateBpm: null },
    });

    // Controller ruling (review IMPORTANT-3, Task 6 fix round): this
    // assertion's `value: 0` is ACCEPTED as-is, on four conditions, all
    // recorded here rather than scattered:
    //
    // (a) THE INPUT IS WIRE-IMPOSSIBLE. This fixture's elapsed is still
    //     session-cumulative (300 -> 360 across the interval-0/1 boundary,
    //     not a reset near zero) — a real PM5 does not produce this
    //     (item 12: "Both fields reset together at each new work
    //     interval"). Proved unfixable this round, not merely left alone:
    //     task-6-report.md's "Deviation from the brief" section works the
    //     algebra showing NO choice of this fixture's numbers can satisfy
    //     the (now-retired, RC-9c) TWD verdict's own check once real
    //     per-interval accumulator keys open (exhaustion proof, condition
    //     (d) below is why).
    // (b) THE ASSERTED 0 IS THE CLAMP'S HONEST OUTPUT FOR THAT INPUT.
    //     `computeIntervalRemaining`'s `Math.max(0, interval.value -
    //     progress)` — its own doc comment: "a quantization overshoot ...
    //     must never render as a negative countdown" — turns 240 - 360 into
    //     0, not a negative number. This is the clamp working correctly on
    //     a bad input, not a new defect.
    // (c) THIS LINE IS MUTATION-BLIND AT INDEX 1, BY MEASUREMENT, not by
    //     assumption: the wire's own checkpoint reads 0 at interval index 1
    //     regardless of whether the (deleted) subtraction still existed —
    //     reintroducing it here would subtract 0 from 360 and still clamp
    //     to 0, so THIS assertion cannot discriminate Task 6's fix from its
    //     absence. It documents clamp behavior on a known-bad input, not a
    //     regression guard; the real regression coverage for the fix is the
    //     dedicated index-2 tests in the "Task 6" describe block below,
    //     whose self-mutation this task's report shows biting.
    // (d) THE REALISTIC-FIXTURE REWORK IS A NAMED FOLLOW-UP, not silently
    //     deferred: "the fake's independent machine total" — giving
    //     `fake.ts`'s `totalWorkDistanceFor` a TWD field
    //     that tracks a real running session total independent of the
    //     per-tick `distanceMeters` item 12 says must be per-interval,
    //     rather than deriving one from the other. Tracked as the CARRY-2
    //     ledger line in `.superpowers/sdd/2026-08-15-connected-axes-2a/
    //     progress.md`'s T6 entry.
    const interval1Frame = events.find(
      (e) => e.kind === "frame" && e.frame.intervalIndex === 1,
    );
    expect(interval1Frame).toBeDefined();
    expect(interval1Frame).toMatchObject({
      kind: "frame",
      frame: { intervalRemaining: { kind: "time", value: 0 } },
    });
  });
});

describe("createPm5Driver: terminate + Appendix-E — the RUN closes, the driver does not", () => {
  it("terminate() acks, reports terminated once, and the PM's own auto Rearm->WaitToBegin cycle re-opens NOTHING — while frames keep flowing", async () => {
    // Appendix E (CSAFE p.162, interface-notes.md §19.4/§19.5): after
    // Terminate, the PM auto-cycles Rearm -> WaitToBegin on its own, with
    // no further driver action — pinned here by literally scripting that
    // exact sequence as additional timeline events AFTER terminate().
    //
    // Task 4 changed what "the driver never un-finishes" is allowed to
    // cost. It used to mean total deafness (`terminalLatched`): against
    // that code this test's frame assertions below fail, because ZERO
    // events of any kind arrived after the terminal state. The run-scoped
    // rule keeps the protection (no second `terminated`, no numbered
    // actual for the closed run) while the stream stays live.
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_REARM,
        elapsedSeconds: 60,
        distanceMeters: 200,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_WAITTOBEGIN,
        elapsedSeconds: 0,
        distanceMeters: 0,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        programIntervalIndex: 0,
      },
      // A boundary event too — the machine's own post-terminate split
      // (CSAFE-DEF footnote 12 p.25). It must reach a listener (the
      // driver is not deaf) but carry NO interval identity: the run it
      // would otherwise be filed against is closed.
      {
        atMs: 300,
        kind: "boundary",
        actual: {
          index: 5,
          elapsedSeconds: 1,
          distanceMeters: 1,
          avgSpm: null,
          avgHeartRateBpm: null,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 1,
        cumulativeDistanceMeters: 1,
      },
    ];
    // settleTicks: 0 — this test's own focus is Appendix-E LATCHING, not
    // the settle wait (pinned separately, with full manual tick control,
    // by the "terminate() settle wait" describe block below); the fake
    // only ever delivers ONE status tick synchronously alongside a
    // terminate ack, which is never enough for the real settleTicks
    // default on its own.
    const { fake, driver, events, log } = harness(
      { program: MINIMAL_PROGRAM, events: timeline },
      { settleTicks: 0 },
    );

    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    await driver.terminate();

    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);
    // terminate()'s own final status frame IS a regular "frame" event too
    // (the last frame before the run closes is still observable, e.g. for
    // a final elapsed/distance summary) — captured here as the baseline
    // the post-terminal ticks below now ADD to (they used to be swallowed
    // entirely).
    const frameCountAtClose = events.filter((e) => e.kind === "frame").length;
    expect(events[events.length - 1]).toStrictEqual({ kind: "terminated" });

    // Trace-assertion #2 (distinct from the happy-path test): terminate's
    // own command/ack pair, isolated by looking only at entries recorded
    // after "armed".
    const armedSeq = log.entries().find((e) => e.kind === "armed")!.seq;
    const terminateTrace = log
      .entries()
      .filter(
        (e) => e.seq > armedSeq && (e.kind === "write" || e.kind === "ack"),
      );
    expect(terminateTrace.map((e) => e.kind)).toStrictEqual(["write", "ack"]);

    fake.tick(500); // plays REARM -> WAITTOBEGIN -> the boundary, all post-terminal

    // The driver KEEPS CONSUMING: both auto-cycle ticks emit frames, the
    // way §19.4 says a real PM5 keeps reporting. Against the pre-Task-4
    // latch this is 0, not 2.
    expect(events.filter((e) => e.kind === "frame")).toHaveLength(
      frameCountAtClose + 2,
    );
    // ...and the run stays closed regardless of what the machine's own
    // housekeeping says: Rearm (idle) then WaitToBegin (armed) re-open
    // nothing, so there is no second terminal event and never a
    // `workoutComplete`.
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(0);
    // The trailing boundary IS delivered — but out of run, so it carries
    // no index at all rather than being normalized into the finished
    // workout's numbering, and it says so in the trace.
    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toStrictEqual({
      kind: "intervalComplete",
      actual: {
        index: null,
        elapsedSeconds: 1,
        distanceMeters: 1,
        // `avgSplit` is DERIVED by the fake itself (`500 * t / d`,
        // `derivedAvgSplit`, `transports/fake.ts`) from this same
        // elapsedSeconds/distanceMeters pair — 500 * 1 / 1 — never an
        // independently-scripted number (PM final-PR gate, condition
        // round). `avgSpm` is still the script's own field: the fake wrote
        // 0 for it (the script authored `null`, and 0x0038 has no null
        // sentinel for a rate) — carried through verbatim, since an
        // out-of-run boundary is emitted unchanged apart from its index.
        avgSplit: 500,
        avgSpm: 0,
        avgHeartRateBpm: null,
        restDistanceMeters: 0,
        // RC-1: `completed` (`program.intervals[actual.index]`,
        // `transports/fake.ts`'s `boundaryBundle`) is `undefined` here —
        // the script's own `index: 5` names no real interval of
        // `MINIMAL_PROGRAM`'s single one — so both fields fall to
        // `boundaryBundle`'s own `?? 0`/`: 0` defaults, same as
        // `restDistanceMeters` above.
        restSeconds: 0,
        type: 0,
      },
    });
    const outOfRun = log
      .entries()
      .filter((e) => e.kind === "boundary-out-of-run");
    expect(outOfRun).toHaveLength(1);
    expect(outOfRun[0]!.detail).toContain("Split/Interval Number 5");
    // No `interval-complete` entry either — that kind means "an actual was
    // filed against a run", and none was.
    expect(log.entries().some((e) => e.kind === "interval-complete")).toBe(
      false,
    );
  });

  it("a disconnect that arrives AFTER the current run closed is logged, not treated as an error (no 'disconnected' event)", async () => {
    const { fake, driver, events, log } = harness(
      { program: MINIMAL_PROGRAM },
      { settleTicks: 0 }, // unrelated to this test's own focus; see the sibling test's comment
    );
    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    await driver.terminate();
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);

    fake.injectDisconnect();

    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(0);
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "disconnect" &&
            e.detail.includes("after the current run closed"),
        ),
    ).toBe(true);
  });

  it("a disconnect with NO run ever opened is a REAL disconnect — the expected-disconnect classification is scoped to a closed run, not to 'the driver has seen a terminal state'", () => {
    // The other side of the run-scoped replacement for `terminalLatched`'s
    // second consumer (spec §4). 7B's connect flow drops the link before
    // ever calling `program()` all the time; that is an error worth
    // surfacing, and it must not be swallowed by the same branch that
    // (correctly) ignores a drop after a finished run.
    const { fake, events, log } = harness({ program: MINIMAL_PROGRAM });

    fake.injectDisconnect();

    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(1);
    expect(log.entries().some((e) => e.kind === "disconnected")).toBe(true);
    expect(log.entries().some((e) => e.kind === "disconnect")).toBe(false);
  });

  it("M-3 (final-review, empirically proven): a second terminate() call after the run closed resolves via the disconnect hatch when no ackTimeout policy is configured at all", async () => {
    // The M-3 fix, re-pinned for the run-scoped world. The ORIGINAL test
    // relied on the ack-timeout hatch being DISABLED post-terminal
    // (`mergeStatus`'s own `if (terminalLatched) return` swallowed the
    // GENERAL_STATUS ticks that counter runs on) — Task 4 deletes that
    // half, and the sibling test below now proves those ticks land. The
    // hatch this test guards is the one that still matters: with NO
    // `ackTimeout` configured — the real call site's shape
    // (`scripts/pm5-lab.ts` passes only `verifyTicks`) — a disconnect is
    // the only signal that no ack is coming, and dropping it hangs
    // `sendSequence` forever.
    const fake = createFakeTransport({ program: MINIMAL_PROGRAM });
    const log = createEventLog();
    // settleTicks: 0 — this test's own focus is the ack-await hatch, not
    // the settle wait; see the sibling "terminate() acks..." test's
    // comment for why the fake can't supply the real default on its own.
    const driver = createPm5Driver(fake, log, { settleTicks: 0 });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    await driver.terminate();
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);

    // A second terminate() call after the run has already closed (a
    // plausible 7B cleanup path — e.g. calling terminate() defensively on
    // unmount). The fake's own ack is withheld (injectTimeout) so this
    // reproduces the empirically-proven hang.
    fake.injectTimeout();
    const pending = driver.terminate();

    // No policy configured and (this script having no post-terminate
    // events of its own) no ticks scripted either — virtual time passing
    // changes nothing at all here. The sibling test below scripts the
    // ticks and configures the policy, to prove the OTHER hatch now works
    // through a closed run.
    fake.tick(5000);
    let settled = false;
    void pending.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    // The disconnect hatch must still resolve it — this is the fix.
    fake.injectDisconnect();

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("disconnected");
      expect((err as ProgramRejectionError).atFrame).toBe(0);
      return true;
    });

    // Still no 'disconnected' MonitorEvent — a drop after the current run
    // closed stays silent to any listener, unchanged from the existing
    // "no 'disconnected' event fires" test above.
    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(0);
  });

  it("the ack-timeout policy now counts GENERAL_STATUS ticks AFTER the run closed — the half of M-3's hang that Task 4 removes at the source", async () => {
    // Against the pre-Task-4 latch this hangs forever: `mergeStatus`
    // swallowed every notification once a terminal state landed, so the
    // `ackTimeout` counter (which counts GENERAL_STATUS arrivals) never
    // saw a single tick and only a disconnect could settle a post-terminal
    // write. The ticks below are scripted post-terminate housekeeping —
    // exactly what a real PM5 keeps sending (§19.4).
    const timeline: FakeTimelineEvent[] = [1, 2].map((i) => ({
      atMs: i * 100,
      kind: "status" as const,
      workoutState: WORKOUTSTATE_REARM,
      elapsedSeconds: 60,
      distanceMeters: 200,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: null,
      programIntervalIndex: 0,
    }));
    const { fake, driver, events } = harness(
      { program: MINIMAL_PROGRAM, events: timeline },
      { ackTimeout: { ticks: 2 }, settleTicks: 0 },
    );

    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    await driver.terminate();
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);

    fake.injectTimeout();
    const pending = driver.terminate();
    fake.tick(200); // two post-run status ticks, the configured budget

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("timeout");
      return true;
    });
    // The link never went down — this is the timeout path, not the
    // disconnect one.
    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(0);
  });
});

describe("createPm5Driver: Phase 7A-fix-2 Task 4 — a finished piece stops the RUN, not the driver (spec §4, interface-notes.md §19.4)", () => {
  it("frames KEEP ARRIVING after workoutComplete — session 2's exact shape, over a real library workout (today: silence)", async () => {
    // [S2], three times: "after `{kind:workoutComplete}` fires, ZERO
    // further frame events are emitted — not a slowed stream, not stale
    // repeats, nothing", and a reconnect resumed them instantly. The
    // monitor never stopped; the latch did. This is that trace as a test:
    // a real compiled workout run to its natural end, then three more
    // status ticks of the kind a PM5 parked in WorkoutLogged keeps
    // sending. Against the pre-Task-4 driver `framesAfterComplete` is 0.
    const program = seaFretProgram();
    const finishedTick = (atMs: number): FakeTimelineEvent => ({
      atMs,
      kind: "status",
      workoutState: WORKOUTSTATE_WORKOUTEND,
      elapsedSeconds: 900,
      distanceMeters: 3400,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: null,
      programIntervalIndex: 2,
    });
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 120,
        distanceMeters: 400,
        spm: 20,
        currentSplit: 130,
        heartRateBpm: 130,
        programIntervalIndex: 0,
      },
      finishedTick(200),
      // WorkoutLogged: the PM sits here answering CSAFE until Menu or a
      // Terminate command (Appendix E via §19.4), reporting all the while.
      finishedTick(300),
      finishedTick(400),
      finishedTick(500),
    ];
    const { fake, driver, events, log } = harness({
      program,
      events: timeline,
    });

    await programAndArm(driver, fake, program);
    for (let i = 0; i < 5; i += 1) fake.tick(100);

    const kinds = events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "workoutComplete")).toHaveLength(1);
    const framesAfterComplete = events
      .slice(kinds.indexOf("workoutComplete") + 1)
      .filter((e) => e.kind === "frame");
    expect(framesAfterComplete).toHaveLength(3);
    expect(framesAfterComplete[2]).toMatchObject({
      kind: "frame",
      frame: { state: "finished", elapsedSeconds: 900, distanceMeters: 3400 },
    });
    // Once per run, never once per tick: the terminal entry is written by
    // the close, and the repeated `finished` ticks that follow change no
    // state word, so they add nothing to the 500-entry ring.
    expect(log.entries().filter((e) => e.kind === "terminal")).toHaveLength(1);
    expect(log.entries().some((e) => e.kind === "terminal-out-of-run")).toBe(
      false,
    );
  });

  it("program() succeeds again after a completed run, with NO reconnect anywhere — and the new run's boundaries are numbered again (today: dead)", async () => {
    // §19.4's second half: "after an explicit disconnect() + re-scan() +
    // connect(), frames resume instantly. We had been reading this as the
    // monitor going quiet." Nothing here disconnects — same driver, same
    // transport, same subscriptions, second workout. Against the
    // pre-Task-4 driver this test hangs at the second `program()`: the
    // ARMED status it waits on is swallowed by the latch, so verification
    // never observes "armed".
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    // AS1/AS2 once, purely to satisfy the "seen" gate so status ticks
    // below actually produce `frame` events.
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(1);

    // The second run, on the same everything.
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    expect(events.filter((e) => e.kind === "armed")).toHaveLength(2);
    expect(
      events.filter(
        (e) => e.kind === "disconnected" || e.kind === "reconnected",
      ),
    ).toHaveLength(0);

    // ...and it is a genuinely OPEN run, not just a resolved promise: a
    // boundary inside it is normalized and filed, where the same pair
    // arriving a moment earlier (between the two runs) would have been
    // `index: null` + `boundary-out-of-run`.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(0, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(0, 22));
    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, avgSpm: 22 },
    });
    expect(log.entries().some((e) => e.kind === "boundary-out-of-run")).toBe(
      false,
    );

    // The second run closes on its own terminal state — one
    // workoutComplete per run, exactly.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(2);
  });

  it("the PM's own auto-rearm noise opens NO run: armed -> rowing ticks after a terminated run produce frames and nothing else", async () => {
    // Appendix E's Terminate -> Rearm -> WaitToBegin happens UNAIDED, and
    // a rower can then pull the handle. Every ingredient of "a workout is
    // starting" is present on the wire — armed, then rowing, then a
    // boundary, then an end — with nobody having called `program()`. A
    // state-driven run trigger would fabricate a whole run out of it.
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_WAITTOBEGIN,
        elapsedSeconds: 0,
        distanceMeters: 0,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 20,
        distanceMeters: 80,
        spm: 24,
        currentSplit: 118,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
      {
        atMs: 300,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 40,
          distanceMeters: 160,
          avgSpm: 24,
          avgHeartRateBpm: 142,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 40,
        cumulativeDistanceMeters: 160,
      },
      // ...and the rower stops. A terminal state with no run to close:
      // the log says so once, and no event goes out.
      {
        atMs: 400,
        kind: "status",
        workoutState: WORKOUTSTATE_WORKOUTEND,
        elapsedSeconds: 60,
        distanceMeters: 240,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        programIntervalIndex: 0,
      },
    ];
    const { fake, driver, events, log } = harness(
      { program: MINIMAL_PROGRAM, events: timeline },
      { settleTicks: 0 },
    );

    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    await driver.terminate();
    const framesAtClose = events.filter((e) => e.kind === "frame").length;
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);

    fake.tick(400);

    // Frames still emit for every one of the three status ticks (the
    // fourth timeline entry is the boundary) — the driver hears all of it.
    expect(events.filter((e) => e.kind === "frame")).toHaveLength(
      framesAtClose + 3,
    );
    // But no run was opened, so nothing was completed, and no actual
    // carries a number.
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(0);
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);
    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: null },
    });
    expect(
      log.entries().filter((e) => e.kind === "boundary-out-of-run"),
    ).toHaveLength(1);
    // The out-of-run terminal state is recorded exactly once, on the
    // transition into it — never per tick.
    const outOfRunTerminal = log
      .entries()
      .filter((e) => e.kind === "terminal-out-of-run");
    expect(outOfRunTerminal).toHaveLength(1);
    expect(outOfRunTerminal[0]!.detail).toContain('"finished"');
  });

  it("a boundary with NO run ever opened (a rower's own JustRow splits) emits index: null plus the log — the never-programmed case, not just the closed one", () => {
    // The `activeRun === null` half of the out-of-run gate. A PM5
    // auto-splits a user-started piece and reports those splits on the
    // very same 0x0037/0x0038 pair; they are real, they are worth seeing,
    // and they belong to no program of ours.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 120, 500));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 26));

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toMatchObject({
      kind: "intervalComplete",
      // The values are real; only the identity is unknown.
      actual: { index: null, elapsedSeconds: 120, distanceMeters: 500 },
    });
    const outOfRun = log
      .entries()
      .filter((e) => e.kind === "boundary-out-of-run");
    expect(outOfRun).toHaveLength(1);
    expect(outOfRun[0]!.detail).toContain("Split/Interval Number 1");
    expect(log.entries().some((e) => e.kind === "interval-complete")).toBe(
      false,
    );
  });

  it("a boundary half still pending when a NEW run opens is discarded, never paired with the new run's first boundary", async () => {
    // A hazard Task 4 itself creates: before this, a second run in one
    // driver lifetime was impossible, so a leftover half could only ever
    // meet its own run's traffic. Both runs number their splits from the
    // same low integers, and `noteBoundaryHalf` pairs on that number — so
    // without this the old run's orphaned averages would emit carrying
    // the NEW run's identity (D4's corruption, one level up).
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    // Run 1's averages for Split/Interval Number 1 arrive; its 0x0037 is
    // lost, so the half sits pending.
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 20));
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(0);

    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    const orphans = log.entries().filter((e) => e.kind === "boundary-orphan");
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.detail).toContain("new run opened");

    // Run 2's own first boundary identity, same Split/Interval Number.
    // Nothing pairs with it — the stale averages are gone.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(0);
  });

  it("replacing an OPEN run says so in the trace: 'run-replaced' names what that run was holding, since it closes with no terminal event at all", async () => {
    // Review L1. Every other lifecycle transition writes an entry
    // (`armed`, `terminal`, `terminal-out-of-run`, `boundary-out-of-run`,
    // `boundary-orphan`); a run REPLACED mid-flight was the one that
    // vanished silently — no closing event by design (the contract on
    // `MonitorEvent` states it) and, before this, nothing in the log
    // either. The realistic hardware path never reaches this branch:
    // `program()`'s leading prepare Terminate makes the PM report
    // "terminated" first, closing run 1 with a real event.
    //
    // `prepareSettleTicks: 0` — this test's own focus is `run-replaced`
    // logging, not fix-3 Task 2's settle: without this, the SECOND
    // `program()` call below (dispatched while `raw` still reports
    // "rowing" from run 1) would arm `waitForPrepareSettle`'s wait, and
    // `programViaStub` does not know to feed it the extra ticks — same
    // convention `harness()`'s own doc comment already documents for
    // `settleTicks: 0`.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { prepareSettleTicks: 0 });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    // Run 1 gets one real, numbered actual before it is replaced.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(0, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(0, 22));
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(1);
    // Run 1 is still open — no terminal state ever arrived.
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(0);

    await programViaStub(driver, transport, MINIMAL_PROGRAM);

    const replaced = log.entries().filter((e) => e.kind === "run-replaced");
    expect(replaced).toHaveLength(1);
    expect(replaced[0]!.detail).toContain("1-interval program");
    expect(replaced[0]!.detail).toContain("accumulated 1 actual(s)");
    // ...and still no terminal event for run 1: the log is the ONLY
    // record that it ended, which is exactly why it has to exist.
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(0);
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(0);
    // The replacement entry precedes the new run's own `armed` entry —
    // the trace reads in lifecycle order.
    const armedSeqs = log
      .entries()
      .filter((e) => e.kind === "armed")
      .map((e) => e.seq);
    expect(replaced[0]!.seq).toBeGreaterThan(armedSeqs[0]!);
    expect(replaced[0]!.seq).toBeLessThan(armedSeqs[1]!);
  });

  it("replacing an ALREADY-CLOSED run writes no 'run-replaced' entry — that run closed loudly, with its own terminal event", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(1);

    await programViaStub(driver, transport, MINIMAL_PROGRAM);

    expect(log.entries().some((e) => e.kind === "run-replaced")).toBe(false);
  });
});

describe("createPm5Driver: NAK during programming", () => {
  it("throws a typed ProgramRejectionError (reason 'nak') with a hex trace, and logs it", async () => {
    const { fake, driver, log } = harness({ program: MINIMAL_PROGRAM });
    fake.injectNak(0);

    await expect(driver.program(MINIMAL_PROGRAM)).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ProgramRejectionError);
        const rejection = err as ProgramRejectionError;
        expect(rejection.reason).toBe("nak");
        expect(rejection.atFrame).toBe(0);
        expect(rejection.hexTrace).toContain("write");
        expect(rejection.hexTrace).toContain("ack frameStatus=reject");
        return true;
      },
    );

    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "program-rejection" &&
            e.detail.startsWith("nak at frame 0"),
        ),
    ).toBe(true);
  });

  it('a garbled ack (bad checksum — pm5/response.ts §19.1\'s {kind: "unparseable"}) rejects with reason "garbled", DISTINCT from an explicit "nak" — never crashes, and its trace says so', async () => {
    // Task 3's own pinned defect: today's (pre-Task-3) code folds EVERY
    // non-"ok" response, including one it could not even parse, onto the
    // single reason "nak" — the exact conflation this task fixes. Against
    // that code, this test's `reason` assertion below fails (`"nak"`
    // where this now expects `"garbled"`), which is the whole point: a
    // frame this driver cannot validate at all is not the same statement
    // as the PM explicitly answering "reject" — no GetErrorType should
    // ever fire for it either (only a genuine `"nak"` does).
    //
    // The fake has no hook to emit a genuinely unparseable frame (it only
    // ever builds well-formed acks via `buildAckFrame`), so this drives a
    // bare `stubTransport()` directly — same pattern as the other
    // hand-rolled-transport tests in this file (e.g. "resolves only after
    // the machine reports 'armed'" above).
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.program(MINIMAL_PROGRAM);
    // Prepare step: accept it so the real programming frame is what fails.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    // R1's frame (interface-notes.md §6) with its checksum byte flipped —
    // the same shape `domain/monitor/pm5/response.test.ts` uses to prove
    // `parseCsafeResponse` returns `{kind: "unparseable"}`, not a parsed
    // reject, for a frame it cannot even validate.
    const unparseableAck = Uint8Array.from([
      0xf1, 0x01, 0x1a, 0x00, 0xff, 0xf2,
    ]);
    transport.notify(TRANSMIT_CHARACTERISTIC_UUID, unparseableAck);

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      const rejection = err as ProgramRejectionError;
      expect(rejection.reason).toBe("garbled");
      expect(rejection.atFrame).toBe(0);
      expect(rejection.hexTrace).toContain("ack unparseable");
      return true;
    });
    // No GetErrorType send for a garbled frame — only a GENUINE "nak"
    // fires one (`sendSequence`'s own `fetchErrorTypeOnNak` gate).
    expect(log.entries().some((e) => e.kind === "error-type")).toBe(false);
  });
});

describe("createPm5Driver: ProgramBusyError — program() is single-flight (ROADMAP: fix-3 Task 2's Probe C stranding)", () => {
  const programFrame0ChunkCount =
    buildProgrammingSequence(MINIMAL_PROGRAM)[0]!.length;

  /** RECEIVE-characteristic writes only — the unit both `acceptPrepare`
   *  and `acceptProgrammingFrame0` wait on, so their own `receiveWritesSoFar`
   *  argument must be counted the same way, never mixed with
   *  `transport.writes.length` (which also counts the sample-rate write). */
  function receiveWriteCount(transport: ReturnType<typeof stubTransport>) {
    return transport.writes.filter(
      (w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID,
    ).length;
  }

  /** Drives the prepare step of a `program()` call to completion — an
   *  "ok" ack, then a wait for the full prepare frame's chunk(s) to have
   *  actually left the wire. Every test below needs this exact prefix
   *  before it may safely dispatch a SECOND `program()` call or inspect
   *  write counts around one. `receiveWritesSoFar` is `receiveWriteCount`
   *  immediately before THIS call's own prepare chunk began (`0` for a
   *  transport's very first `program()` call) — a retry after an earlier
   *  rejection is not the transport's first prepare, so it must pass its
   *  own current watermark rather than reusing a bare `prepareChunkCount`
   *  against the whole transport's accumulated history. */
  async function acceptPrepare(
    transport: ReturnType<typeof stubTransport>,
    receiveWritesSoFar: number,
  ): Promise<void> {
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    await waitUntil(
      () =>
        receiveWriteCount(transport) > receiveWritesSoFar + prepareChunkCount,
    );
  }

  /** Drives frame 0 of the real programming send to completion — an "ok"
   *  ack, then a wait for ALL of frame 0's chunks (not merely the first
   *  one) to have actually left the wire, since `sendSequence` writes
   *  every chunk of a frame before it ever awaits that frame's single
   *  ack. `receiveWritesSoFar` is `receiveWriteCount` immediately before
   *  this frame's own chunks began (so this helper works identically for a
   *  program's first send and a later retry after a rejection). */
  async function acceptProgrammingFrame0(
    transport: ReturnType<typeof stubTransport>,
    receiveWritesSoFar: number,
  ): Promise<void> {
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    await waitUntil(
      () =>
        receiveWriteCount(transport) >
        receiveWritesSoFar + programFrame0ChunkCount,
    );
  }

  it("a concurrent program() rejects ProgramBusyError immediately, with the write count UNCHANGED (today: both proceed and the first strands — Probe C's stranding)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const first = driver.program(MINIMAL_PROGRAM);
    await acceptPrepare(transport, 0); // genuine wire traffic belonging to the FIRST call
    const receiveWritesAfterPrepare = receiveWriteCount(transport);

    const writesBefore = transport.writes.length;
    await expect(driver.program(MINIMAL_PROGRAM)).rejects.toBeInstanceOf(
      ProgramBusyError,
    );
    // ZERO wire traffic from the busy call — not "no NEW frame started",
    // literally no write of any kind (any UUID, hence the TOTAL count here,
    // not `receiveWriteCount` alone).
    expect(transport.writes.length).toBe(writesBefore);

    // Drive the first call to its own real "armed" outcome so it doesn't
    // dangle across tests.
    await acceptProgrammingFrame0(transport, receiveWritesAfterPrepare);
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await expect(first).resolves.toBeUndefined();
  });

  it("the first program()'s outcome is unaffected by the rejected second — it still resolves on its own merits", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    const first = driver.program(MINIMAL_PROGRAM);
    await acceptPrepare(transport, 0);
    const receiveWritesAfterPrepare = receiveWriteCount(transport);

    await expect(driver.program(MINIMAL_PROGRAM)).rejects.toBeInstanceOf(
      ProgramBusyError,
    );

    // The first call proceeds exactly as if the second had never happened.
    await acceptProgrammingFrame0(transport, receiveWritesAfterPrepare);
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await first;
    expect(events).toContainEqual({ kind: "armed" });
  });

  it("the in-flight flag clears after a failure — a third program() call after a typed rejection succeeds normally (mutation target: clearing only on resolve)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    // Call 1: settles with a genuine NAK on the real programming send.
    const first = driver.program(MINIMAL_PROGRAM);
    await acceptPrepare(transport, 0);
    const receiveWritesAfterPrepare = receiveWriteCount(transport);

    // Call 2: dispatched while call 1 is still in flight — busy, zero
    // wire traffic of its own.
    const writesBeforeBusy = transport.writes.length;
    await expect(driver.program(MINIMAL_PROGRAM)).rejects.toBeInstanceOf(
      ProgramBusyError,
    );
    expect(transport.writes.length).toBe(writesBeforeBusy);

    // A GENUINE reject on call 1's real send — `(status & 0x30) === 0x10`
    // (response.ts §19.1) — which fires the documented GetErrorType
    // follow-up (Task 3) that must be answered before call 1 settles.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        receiveWriteCount(transport) >
        receiveWritesAfterPrepare + programFrame0ChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({
        frameStatus: "ok",
        slaveState: "error",
        commandIds: [0xc8],
      }),
    ); // GetErrorType reply
    await expect(first).rejects.toBeInstanceOf(ProgramRejectionError);

    // Call 3: dispatched AFTER call 1's REJECTION (never a resolve) — the
    // in-flight flag must have cleared on that failure too, or this call
    // throws ProgramBusyError forever.
    const receiveWritesBeforeThird = receiveWriteCount(transport);
    const third = driver.program(MINIMAL_PROGRAM);
    await acceptPrepare(transport, receiveWritesBeforeThird);
    const receiveWritesAfterThirdPrepare = receiveWriteCount(transport);
    await acceptProgrammingFrame0(transport, receiveWritesAfterThirdPrepare);
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await expect(third).resolves.toBeUndefined();
  });

  it("the busy error's own message never attributes the refusal to the PM5 (NOT a ProgramRejectionReason — that union stays machine-statements-only)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const first = driver.program(MINIMAL_PROGRAM);
    await acceptPrepare(transport, 0);
    const receiveWritesAfterPrepare = receiveWriteCount(transport);

    await expect(driver.program(MINIMAL_PROGRAM)).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ProgramBusyError);
        expect((err as Error).message).not.toContain("PM5");
        expect((err as Error).name).toBe("ProgramBusyError");
        return true;
      },
    );

    await acceptProgrammingFrame0(transport, receiveWritesAfterPrepare);
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await first;
  });
});

describe("createPm5Driver: Phase 7A-fix-2 Task 3 — the wire's four non-'ok' reasons", () => {
  it.each([
    ["bad", "bad"],
    ["not-ready", "not-ready"],
  ] as const)(
    "a genuine '%s' frame status rejects with reason '%s' — never folded into 'nak' (today's code, pre-Task-3, would report 'nak' here)",
    async (frameStatus, expectedReason) => {
      const transport = stubTransport();
      const log = createEventLog();
      const driver = createPm5Driver(transport, log);

      const pending = driver.program(MINIMAL_PROGRAM);
      transport.notify(
        TRANSMIT_CHARACTERISTIC_UUID,
        buildAckFrame({ frameStatus: "reject" }),
      ); // prepare step — any non-disconnect outcome is swallowed
      await waitUntil(
        () =>
          transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
            .length > prepareChunkCount,
      );
      transport.notify(
        TRANSMIT_CHARACTERISTIC_UUID,
        buildAckFrame({ frameStatus }),
      );
      // Drain generously before the defensive ticks below: under a
      // mutant that fires `sendGetErrorType` for this frame status, its
      // OWN write (and `awaitAck()` registration) needs several
      // microtask hops to happen — sending ticks before that write is
      // even out would just be discarded as a stray GENERAL_STATUS_UUID
      // arrival with nothing pending yet, not consumed as the bound this
      // test means to satisfy.
      for (let i = 0; i < 20; i += 1) await Promise.resolve();

      // Defensive, ahead of the over-fire guard below: if a mutant makes
      // THIS frame status also fire `sendGetErrorType` (Task 3 review,
      // Mutation B), that wait is bounded by its own always-active
      // `errorTypeTicks` (default 3, IMPORTANT-1) rather than
      // `options.ackTimeout` (unset here) — these ticks satisfy that
      // bound so the mutant dies on the assertion below instead of
      // hanging the test. Under CORRECT code nothing is pending to
      // resolve, so they are plain no-ops.
      const tick = buildGeneralStatusBytes({
        elapsedSeconds: 0,
        distanceMeters: 0,
        workoutType: 8,
        intervalType: 0,
        workoutState: WORKOUTSTATE_REARM,
        rowingState: 0,
        strokeState: 0,
        totalWorkDistanceMeters: 0,
        workoutDurationRaw: 0,
        workoutDurationType: 0,
        dragFactor: 130,
      });
      transport.notify(GENERAL_STATUS_UUID, tick);
      transport.notify(GENERAL_STATUS_UUID, tick);
      transport.notify(GENERAL_STATUS_UUID, tick);

      await expect(pending).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ProgramRejectionError);
        expect((err as ProgramRejectionError).reason).toBe(expectedReason);
        expect((err as ProgramRejectionError).atFrame).toBe(0);
        return true;
      });
      // Only a GENUINE reject ("nak") fires GetErrorType — CSAFE-DEF p.50's
      // own "PrevReject" wording (interface-notes.md §19.7) is specific to
      // that one status, not "bad"/"not-ready".
      expect(log.entries().some((e) => e.kind === "error-type")).toBe(false);
    },
  );
});

describe("createPm5Driver: Phase 7A-fix-2 Task 3 — GetErrorType on a genuine reject", () => {
  it('fires ONE buildGetErrorType() send and logs the raw reply as hex (no decode claims), then still rejects "nak" as before', async () => {
    // Against today's (pre-Task-3) code, no GetErrorType exists at all —
    // this test's own write-count/log assertions below fail outright
    // there (there is no extra write to find, no "error-type" log entry).
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const programFrame0ChunkCount =
      buildProgrammingSequence(MINIMAL_PROGRAM)[0]!.length;

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    ); // prepare step accepted
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );

    // A GENUINE reject — `(status & 0x30) === 0x10`, the real `0x11` shape
    // (response.ts §19.1), never the old, wrong `0x81`.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );

    // The driver now sends buildGetErrorType() — one more RECEIVE write,
    // beyond the prepare step's and the rejected programming frame's own.
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length >
        prepareChunkCount + programFrame0ChunkCount,
    );
    const receiveWrites = transport.writes.filter(
      (w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID,
    );
    expect(Array.from(receiveWrites.at(-1)!.bytes)).toStrictEqual(
      Array.from(buildGetErrorType()),
    );

    // A scripted reply (this codec has never captured a real one — the
    // pull path is interface-notes.md §17's own open hardware item). The
    // driver must log it as RAW HEX, making no claim about its meaning.
    const errorTypeReply = buildAckFrame({
      frameStatus: "ok",
      slaveState: "error",
      commandIds: [0xc8],
    });
    transport.notify(TRANSMIT_CHARACTERISTIC_UUID, errorTypeReply);

    // No retries: the outer rejection is exactly what it would have been
    // without GetErrorType at all.
    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("nak");
      expect((err as ProgramRejectionError).atFrame).toBe(0);
      return true;
    });

    const errorTypeEntries = log
      .entries()
      .filter((e) => e.kind === "error-type");
    expect(errorTypeEntries).toHaveLength(1); // exactly once — no retries
    const expectedHex = Array.from(errorTypeReply, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(" ");
    expect(errorTypeEntries[0]!.detail).toBe(expectedHex);
  });

  it("logs 'no reply (disconnected)' if the link drops before GetErrorType's own reply arrives, and still rejects nak", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const programFrame0ChunkCount =
      buildProgrammingSequence(MINIMAL_PROGRAM)[0]!.length;

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    ); // prepare step accepted
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    ); // genuine reject
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length >
        prepareChunkCount + programFrame0ChunkCount,
    ); // GetErrorType's own write went out

    transport.fireDisconnect("radio out of range");

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("nak");
      return true;
    });
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "error-type" && e.detail === "no reply (disconnected)",
        ),
    ).toBe(true);
  });

  it("logs 'no reply (ack-timeout)' if the ack-timeout policy elapses waiting for GetErrorType's own reply, and still rejects nak", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, {
      ackTimeout: { ticks: 2 },
    });
    const programFrame0ChunkCount =
      buildProgrammingSequence(MINIMAL_PROGRAM)[0]!.length;

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    ); // prepare step accepted
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    ); // genuine reject
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length >
        prepareChunkCount + programFrame0ChunkCount,
    ); // GetErrorType's own write went out

    const tick = buildGeneralStatusBytes({
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_REARM,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
    transport.notify(GENERAL_STATUS_UUID, tick);
    transport.notify(GENERAL_STATUS_UUID, tick);

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("nak");
      return true;
    });
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "error-type" && e.detail === "no reply (ack-timeout)",
        ),
    ).toBe(true);
  });

  it("with NO ackTimeout configured at all, GetErrorType's own always-active errorTypeTicks bound (default 3) still rejects nak rather than hanging forever", async () => {
    // Task 3 review, IMPORTANT-1: proven on review that this exact
    // scenario hung FOREVER against the pre-fix code — `awaitAck()`'s own
    // ack-timeout tick counter only counts while `options.ackTimeout` is
    // configured (`if (pendingAck && options.ackTimeout)`), and the sole
    // real call site (`app/scripts/pm5-lab.ts`) never configures one.
    // `errorTypeTicks` is a SEPARATE, always-active bound for exactly
    // this reason — it must fire with no `ackTimeout` anywhere in sight.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log); // no ackTimeout at all
    const programFrame0ChunkCount =
      buildProgrammingSequence(MINIMAL_PROGRAM)[0]!.length;

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    ); // prepare step accepted
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    ); // genuine reject
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length >
        prepareChunkCount + programFrame0ChunkCount,
    ); // GetErrorType's own write went out — and NO reply is ever sent

    let settled = false;
    void pending.catch(() => {
      settled = true;
    });
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(settled).toBe(false); // no ticks yet — must not resolve on its own

    const tick = buildGeneralStatusBytes({
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_REARM,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
    transport.notify(GENERAL_STATUS_UUID, tick);
    transport.notify(GENERAL_STATUS_UUID, tick);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(settled).toBe(false); // 2 of the default 3 — still not enough

    transport.notify(GENERAL_STATUS_UUID, tick);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(settled).toBe(true); // the 3rd tick — MED-4: was a 5s timeout, not this assertion

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("nak");
      return true;
    });
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "error-type" && e.detail === "no reply (ack-timeout)",
        ),
    ).toBe(true);
  });

  it("a custom errorTypeTicks bound is honored", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { errorTypeTicks: 1 });
    const programFrame0ChunkCount =
      buildProgrammingSequence(MINIMAL_PROGRAM)[0]!.length;

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length >
        prepareChunkCount + programFrame0ChunkCount,
    );

    transport.notify(
      GENERAL_STATUS_UUID,
      buildGeneralStatusBytes({
        elapsedSeconds: 0,
        distanceMeters: 0,
        workoutType: 8,
        intervalType: 0,
        workoutState: WORKOUTSTATE_REARM,
        rowingState: 0,
        strokeState: 0,
        totalWorkDistanceMeters: 0,
        workoutDurationRaw: 0,
        workoutDurationType: 0,
        dragFactor: 130,
      }),
    );

    // MED-4: this test used to go straight to the `rejects` assertion below,
    // which died as a 5000ms timeout (not this assertion) under a mutant
    // that removes the errorTypeTicks bound — the single configured tick
    // (errorTypeTicks: 1) must be enough on its own.
    let settled = false;
    void pending.catch(() => {
      settled = true;
    });
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(settled).toBe(true);

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("nak");
      return true;
    });
  });

  it("a configured ackTimeout that fires FIRST still lets errorTypeTicks' own counter observe pendingAck already cleared (no double-resolve)", async () => {
    // Exercises the raw tick handler's `pendingErrorTypeTimeout &&
    // pendingAck` guard on its FALSE side: `options.ackTimeout` (opt-in,
    // smaller) resolves `pendingAck` first; errorTypeTicks' own counter
    // (always-active, larger here) must find nothing left to resolve on
    // its own later ticks rather than throwing or double-resolving.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, {
      ackTimeout: { ticks: 1 },
      errorTypeTicks: 3,
    });
    const programFrame0ChunkCount =
      buildProgrammingSequence(MINIMAL_PROGRAM)[0]!.length;

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length >
        prepareChunkCount + programFrame0ChunkCount,
    );

    const tick = buildGeneralStatusBytes({
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_REARM,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
    // Tick 1: `options.ackTimeout` resolves `pendingAck` first (registered
    // ahead of the raw subscription); errorTypeTicks' own counter, on the
    // SAME tick, must see `pendingAck` already null and no-op rather than
    // resolve again.
    transport.notify(GENERAL_STATUS_UUID, tick);
    // Two more ticks — errorTypeTicks would fire on the 3rd if it hadn't
    // already been superseded; must not crash or re-resolve anything.
    transport.notify(GENERAL_STATUS_UUID, tick);
    transport.notify(GENERAL_STATUS_UUID, tick);

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("nak");
      return true;
    });
    // Exactly one "no reply" entry — not two.
    expect(log.entries().filter((e) => e.kind === "error-type")).toHaveLength(
      1,
    );
  });
});

describe("createPm5Driver: Phase 7A-fix-2 Task 3 — toggle and slave state never gate success", () => {
  it("an ack with frameToggle=true and a non-'ready' slave state still succeeds, and the ack log records that slave state", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    ); // prepare step
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({
        frameStatus: "ok",
        frameToggle: true,
        slaveState: "offline",
      }),
    );
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);

    await expect(pending).resolves.toBeUndefined();
    expect(
      log
        .entries()
        .some(
          (e) => e.kind === "ack" && e.detail.includes("slaveState=offline"),
        ),
    ).toBe(true);
  });

  it("a 2-frame program whose acks are 0x01 (toggle low) then 0x81 (toggle high) completes successfully — VERIFIED per the brief's own instruction: already true after Task 2's parse fix, not a NEW Task 3 behaviour", async () => {
    // Task 2 (response.ts §19.1) already corrected the parse so `0x81`
    // decodes as an ACCEPT (toggle-high, prev-OK), and this driver's own
    // ack-success condition has been `frameStatus === "ok"` — never gated
    // on the toggle bit — since that same commit. This test pins the
    // regression for Task 3 without claiming it as a Task-3-fixed defect.
    const fiveIntervalProgram: WorkoutProgram = {
      intervals: Array.from({ length: 5 }, () => ({
        type: "work" as const,
        kind: "time" as const,
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 30,
      })),
    };
    const seq = buildProgrammingSequence(fiveIntervalProgram);
    expect(seq).toHaveLength(2); // confirms this fixture is genuinely 2 frames

    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.program(fiveIntervalProgram);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    ); // prepare step
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    // Frame 0's ack: the "0x01" shape (toggle low).
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok", frameToggle: false }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length >
        prepareChunkCount + seq[0]!.length,
    );
    // Frame 1's ack: the "0x81" shape (toggle high) — the exact byte a
    // pre-Task-2 parser misread as a reject.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok", frameToggle: true }),
    );

    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);

    await expect(pending).resolves.toBeUndefined();
  });
});

describe("createPm5Driver: Phase 7A-fix-2 Task 3 — terminate()'s post-ack settle wait", () => {
  /** Any GENERAL_STATUS payload — the settle counter (driver.ts's raw
   *  GENERAL_STATUS_UUID subscription) counts arrivals only, never
   *  content, so what this contains is irrelevant to every test below. */
  function settleTick(): Uint8Array {
    return buildGeneralStatusBytes({
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_REARM,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
  }

  it("resolves only after settleTicks GENERAL_STATUS ticks (default 3), never on the ack alone", async () => {
    // Against today's (pre-Task-3) code, terminate() resolves the instant
    // the ack arrives — this test's first assertion (`settled` still
    // false after the ack, and again after only 2 of 3 ticks) fails
    // there, since today's promise would already be resolved by then.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.terminate();
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(settled).toBe(false); // the ack alone must never be enough

    transport.notify(GENERAL_STATUS_UUID, settleTick());
    transport.notify(GENERAL_STATUS_UUID, settleTick());
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(settled).toBe(false); // 2 of the default 3 — still not enough

    transport.notify(GENERAL_STATUS_UUID, settleTick());
    await expect(pending).resolves.toBeUndefined();
  });

  it("a custom settleTicks bound is honored", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { settleTicks: 1 });

    const pending = driver.terminate();
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    transport.notify(GENERAL_STATUS_UUID, settleTick());
    await expect(pending).resolves.toBeUndefined();
  });

  it("settleTicks: 0 resolves immediately after the ack, with no wait at all", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { settleTicks: 0 });

    const pending = driver.terminate();
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    await expect(pending).resolves.toBeUndefined();
  });

  it("a disconnect during the settle wait resolves terminate() rather than hanging it forever", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.terminate();
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    transport.fireDisconnect("radio out of range");
    await expect(pending).resolves.toBeUndefined();
  });
});

describe("createPm5Driver: plan Task 2/design spec §3 — prepare, ignore rejection, verify", () => {
  it("a REFUSED prepare step still proceeds to program the real workout — swallowed, logged, never fatal (interface-notes.md §19.4; the refusal itself is synthetic, §18 s3 item 15)", async () => {
    // Realistic fixture (briefing: "at least one test per client task
    // starts from a real library workout"): Sea Fret, not a hand-built
    // minimum.
    //
    // Fix-3 Task 3: the refusal is no longer the fake's DEFAULT — item
    // 15's captured byte proved the PM accepts a terminate with nothing
    // running (`f1 81 76 01 13 e5 f2`, an accept) — so this test asks for
    // one explicitly through the never-observed `refuseNextPrepare` hook.
    // Against a fake without the hook the prepare acks "ok" and the
    // `prepare-rejected` assertion below fails.
    const program = seaFretProgram();
    const { fake, driver, log, events } = harness({
      program,
      refuseNextPrepare: true,
    });

    await programAndArm(driver, fake, program);

    // `program()` must treat a refused prepare as informational, not
    // fatal: it logs and proceeds straight into the real send.
    expect(log.entries().some((e) => e.kind === "prepare-rejected")).toBe(true);
    // The real program still landed and was verified: `createFakeTransport`
    // itself asserts every programming byte against
    // `buildProgrammingSequence` (a mismatch throws synchronously), so
    // reaching "armed" here is proof the real sequence was actually sent —
    // not skipped, not corrupted by the leading prepare attempt.
    expect(events.some((e) => e.kind === "armed")).toBe(true);
    // F7 (fix-round 1): a swallowed prepare-step refusal must never show
    // up as a spurious "program-rejection" on an otherwise healthy call.
    expect(log.entries().some((e) => e.kind === "program-rejection")).toBe(
      false,
    );
  });

  it("the same program with NO hook records no rejection at all — the always-refuse default is gone (§18 s3 item 15: the captured byte is an accept)", async () => {
    // The blast-radius test, stated as a behaviour rather than left
    // implicit in the suite: every clean-state `program()` in this file
    // now takes the ACCEPTED-prepare path. Restoring the fake's old
    // nothing-loaded refusal makes this fail.
    const program = seaFretProgram();
    const { fake, driver, log, events } = harness({ program });

    await programAndArm(driver, fake, program);

    expect(log.entries().some((e) => e.kind === "prepare-rejected")).toBe(
      false,
    );
    expect(log.entries().some((e) => e.kind === "prepare-sent")).toBe(true);
    expect(events.some((e) => e.kind === "armed")).toBe(true);
  });

  it.each([
    ["bad", () => buildAckFrame({ frameStatus: "bad" })],
    ["not-ready", () => buildAckFrame({ frameStatus: "not-ready" })],
    ["garbled", () => Uint8Array.from([0xf1, 0x01, 0x1a, 0x00, 0xff, 0xf2])],
  ] as const)(
    "Task 3 review, IMPORTANT-2: a '%s' prepare-step response is swallowed too (broadened from the pre-Task-3 nak/timeout-only rule) — program() still proceeds to the real send and logs 'prepare-rejected'",
    async (_label, buildPrepareAck) => {
      // Reverting `sendPrepare`'s condition to the pre-Task-3
      // `reason === "nak" || reason === "timeout"` rule makes this test
      // fail: a "bad"/"not-ready"/"garbled" prepare response would
      // escape `sendPrepare` uncaught and surface through `program()`'s
      // own programming-failure channel — a prepare-step outcome dressed
      // as a programming failure — instead of being swallowed here.
      const transport = stubTransport();
      const log = createEventLog();
      const driver = createPm5Driver(transport, log);

      const pending = driver.program(MINIMAL_PROGRAM);
      transport.notify(TRANSMIT_CHARACTERISTIC_UUID, buildPrepareAck());
      await waitUntil(
        () =>
          transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
            .length > prepareChunkCount,
      );
      // The real programming send proceeds normally — accept it.
      transport.notify(
        TRANSMIT_CHARACTERISTIC_UUID,
        buildAckFrame({ frameStatus: "ok" }),
      );
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);

      await expect(pending).resolves.toBeUndefined();
      expect(log.entries().some((e) => e.kind === "prepare-rejected")).toBe(
        true,
      );
      expect(log.entries().some((e) => e.kind === "program-rejection")).toBe(
        false,
      );
    },
  );

  it("a disconnect DURING the prepare step still propagates as a fatal rejection — the one outcome sendPrepare never swallows", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.fireDisconnect("radio out of range");

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("disconnected");
      return true;
    });
  });

  it("resolves only after the machine reports 'armed', not merely after the ack (D2: the ack alone is not evidence of success)", async () => {
    // Against TODAY's code, `program()` resolves the instant the ack
    // arrives — this test's first assertion (`settled` still `false` after
    // the ack) fails there, since today's promise would already be
    // resolved by that point.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    // Drain generously: nothing in this test will ever settle `pending` on
    // its own without an "armed" status or a `verifyTicks` bound (neither
    // configured/sent yet) — no flakiness risk either way.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(settled).toBe(false);

    // NOW the machine reports armed — only this unblocks `program()`.
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await expect(pending).resolves.toBeUndefined();
  });

  it("verify() times out after verifyTicks with no 'armed' state ever observed -> rejects 'not-observed', never a false success", async () => {
    // Against TODAY's code, `verifyTicks` doesn't exist and `program()`
    // resolves right after the ack — this test's `.rejects` expectation
    // fails there (it would resolve instead).
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { verifyTicks: 3 });

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    // Drain until `program()`'s own code has actually reached `verifyArmed()`
    // and registered its tick counter — a status notification sent before
    // that point updates `raw` but is never COUNTED as a verify tick (there
    // is nothing yet to count it against), which would silently swallow
    // ticks this test is relying on to trip the `verifyTicks` bound.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    // Three general-status ticks arrive — the link is genuinely fine — but
    // none of them ever reports "armed": stuck showing the PM's own
    // post-terminal REARM housekeeping (interface-notes.md §14/Appendix E),
    // never WaitToBegin.
    const stuckIdle = buildGeneralStatusBytes({
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_REARM,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
    for (let i = 0; i < 3; i += 1) {
      transport.notify(GENERAL_STATUS_UUID, stuckIdle);
    }

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("not-observed");
      expect((err as ProgramRejectionError).atFrame).toBe(-1);
      return true;
    });
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "program-rejection" && e.detail.includes("not-observed"),
        ),
    ).toBe(true);
  });

  it("an ack of 0x01 ('ok') that never becomes armed rejects 'not-observed' (D2's exact silent failure: the identical ack byte accompanied both a real program and a total no-op on real hardware)", async () => {
    // Against TODAY's code, this ack alone resolves `program()`
    // successfully — the exact D2 defect (interface-notes.md §18): live
    // hardware saw the identical `0x01` ack come back from a send that
    // programmed nothing, with the monitor never reaching "armed".
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { verifyTicks: 2 });

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    // Drain until `verifyArmed()` has actually registered its tick counter
    // (see the sibling "verify() times out" test's identical comment).
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    // The machine keeps reporting its PRIOR state — still mid a live Just
    // Row session, exactly the hardware trace — never WaitToBegin.
    const stillRowing = buildGeneralStatusBytes({
      elapsedSeconds: 812,
      distanceMeters: 3100,
      workoutType: 0,
      intervalType: 0,
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      rowingState: 1,
      strokeState: 1,
      totalWorkDistanceMeters: 3100,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
    for (let i = 0; i < 2; i += 1) {
      transport.notify(GENERAL_STATUS_UUID, stillRowing);
    }

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("not-observed");
      return true;
    });
  });

  it("a real disconnect DURING verification rejects with reason 'disconnected', not a hang (verification has no other way to learn the link is gone)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    // Drain until `verifyArmed()` has actually registered — see the
    // sibling "verify() times out" test's identical comment.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    transport.fireDisconnect("radio out of range");

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("disconnected");
      expect((err as ProgramRejectionError).atFrame).toBe(-1);
      return true;
    });
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "program-rejection" &&
            e.detail.includes("disconnected during verify"),
        ),
    ).toBe(true);
  });

  it("F1 (fix-round 1): a STALE pre-send 'armed' observation never satisfies verification on its own — only a fresh POST-send one does", async () => {
    // Reviewer-reproduced hardware shape (interface-notes.md §18,
    // progress.md's D1 update/reviewer finding): the prepare step gets
    // ACCEPTED, the PM's own Appendix-E auto-cycle (Terminate -> Rearm ->
    // WaitToBegin) reports "armed" ENTIRELY ON ITS OWN, and that stale
    // observation must never be reused as evidence for a SEPARATE program
    // write that hasn't even been sent yet — D2 resurrected through the
    // very phase built to stop it. Against the pre-fix code (verifyArmed()
    // trusting whatever `raw` already said), this "already armed" value
    // would satisfy verification the instant the ack arrives; this test's
    // first assertion (`settled` still `false`) fails there.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    // "Armed" arrives BEFORE program() is even called.
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    // D2's exact silent no-op shape: the program's own ack says "ok", but
    // NO general-status tick ever arrives after this point.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(settled).toBe(false); // the STALE armed status must not count

    // A genuinely NEW, post-send observation — THIS is what should
    // actually satisfy verification.
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await expect(pending).resolves.toBeUndefined();
  });

  it("F1 (fix-round 2): a stale 'armed' tick landing after only the FIRST frame of a multi-frame send does not satisfy verification — only a tick after the LAST frame does", async () => {
    // Re-review finding: fix-round 1's own snapshot (taken BEFORE the
    // first frame went out) was still too early — a tick landing anywhere
    // during a multi-frame program's send already counted as "post
    // snapshot", so a stale "armed" reading after only frame 1's ack
    // satisfied verification with no fresh tick EVER required after the
    // LAST frame. Against fix-round 1's code, this test's final assertion
    // (reason "not-observed") fails: that code resolves successfully
    // instead, using the stale mid-send tick as its only evidence.
    const fiveIntervalProgram: WorkoutProgram = {
      intervals: Array.from({ length: 5 }, () => ({
        type: "work" as const,
        kind: "time" as const,
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 30,
      })),
    };
    const seq = buildProgrammingSequence(fiveIntervalProgram);
    expect(seq.length).toBeGreaterThan(1); // confirms this fixture is genuinely multi-frame

    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { verifyTicks: 3 });

    const pending = driver.program(fiveIntervalProgram);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    ); // prepare step
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );

    // Frame 0's own ack — only the FIRST of several frames this program
    // needs.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    // A stale "armed" tick lands HERE — after frame 0's ack, but well
    // before the program is actually complete (frames 1..N-1 haven't even
    // been written yet). This is the exact tick fix-round 1's own
    // too-early snapshot would have accepted.
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);

    // The remaining frames' acks — completing the send normally, with no
    // further "armed" observation at any point.
    for (let frame = 1; frame < seq.length; frame += 1) {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      transport.notify(
        TRANSMIT_CHARACTERISTIC_UUID,
        buildAckFrame({ frameStatus: "ok" }),
      );
    }
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    // NO tick ever follows the LAST frame's ack — three non-armed ticks
    // trip the `verifyTicks` bound instead.
    const stillIdle = buildGeneralStatusBytes({
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_REARM,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
    transport.notify(GENERAL_STATUS_UUID, stillIdle);
    transport.notify(GENERAL_STATUS_UUID, stillIdle);
    transport.notify(GENERAL_STATUS_UUID, stillIdle);

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("not-observed");
      return true;
    });
  });

  it("F3 (fix-round 1): a prepare-step TIMEOUT (not just a NAK) is swallowed too — the real clear command is unknown, so an unanswered one is not fatal either", async () => {
    // `ProgramRejection`'s own doc comment: "timeout" means the link
    // stayed UP but the PM never answered ONE command — exactly the
    // profile of the prepare step (its real command is UNFOUND, D1 update),
    // not evidence of a broken transport. Only "disconnected" (a confirmed
    // dead link) stays fatal for the prepare step; this asserts the RULE,
    // not merely a byproduct of the fake's own phase modeling (the
    // reviewer's M3b finding).
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, {
      ackTimeout: { ticks: 2 },
    });

    const pending = driver.program(MINIMAL_PROGRAM);
    // The prepare step's OWN ack never arrives — two general-status ticks
    // trip the ack-timeout policy (reason "timeout"), not a disconnect.
    const preSendTick = buildGeneralStatusBytes({
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_REARM,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
    transport.notify(GENERAL_STATUS_UUID, preSendTick);
    transport.notify(GENERAL_STATUS_UUID, preSendTick);

    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    // The REAL program's own ack — swallowing the prepare step's timeout must not
    // block the send that follows it.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    // Fix-round 2: drain until the send has fully resolved and
    // `verifyArmed`'s snapshot has actually been captured (see that
    // function's own doc comment) before supplying a fresh post-send
    // "armed" observation (F1's own requirement).
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);

    await expect(pending).resolves.toBeUndefined();
    expect(
      log
        .entries()
        .some(
          (e) => e.kind === "prepare-rejected" && e.detail.includes("timeout"),
        ),
    ).toBe(true);
    // F7: the swallowed prepare timeout must not ALSO show up as a spurious
    // "program-rejection" — only "prepare-rejected" should record it.
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "program-rejection" && e.detail.startsWith("timeout"),
        ),
    ).toBe(false);
  });
});

describe("createPm5Driver: disconnected (link down before any ack arrives)", () => {
  it("a disconnect while a programming ack is pending rejects with reason 'disconnected'", async () => {
    // Uses a bare stub, not the fake: the fake always acks synchronously
    // inside write() (the same-turn ordering this file's `sendSequence`
    // comment documents), so to get a write whose ack genuinely never
    // arrives, the stub simply never notifies TRANSMIT_CHARACTERISTIC_UUID
    // at all, then the test fires the disconnect callback directly.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.fireDisconnect("radio out of range");

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("disconnected");
      expect((err as ProgramRejectionError).atFrame).toBe(0);
      return true;
    });
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "program-rejection" &&
            e.detail.startsWith("disconnected at frame 0"),
        ),
    ).toBe(true);
    // Fix-round HIGH-2: a genuine disconnect is distinguishable from an
    // ack-timeout precisely because it ALSO fires a `disconnected`
    // MonitorEvent (the transport's own onDisconnect signal) — see the
    // "distinguishable outcomes" describe block below for the contrast.
    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(1);
  });
});

describe("createPm5Driver: HIGH-2 — ack-timeout policy, distinct from disconnect", () => {
  it("injectTimeout() + enough general-status ticks rejects with reason 'timeout', link never disconnects", async () => {
    // Uses a bare stub, not the fake: a `stubTransport`-driven prepare step
    // is let through first (fix-round 1, F3 now swallows a PREPARE-step
    // timeout too, so this test must aim its own timeout at the REAL
    // programming write specifically, not the prepare step's) — then the
    // PROGRAM's own frame-0 ack is withheld and two general-status ticks
    // trip the ack-timeout policy for THAT write, a genuine "mid-sequence
    // timeout" (spec §4's own phrasing, mirroring "mid-sequence NAK").
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, {
      ackTimeout: { ticks: 2 },
    });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    // The PROGRAM's own ack never arrives — two general-status ticks trip
    // the ack-timeout policy for THIS write.
    const midProgrammingTick = buildGeneralStatusBytes({
      elapsedSeconds: 1,
      distanceMeters: 1,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      rowingState: 1,
      strokeState: 1,
      totalWorkDistanceMeters: 1,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
    transport.notify(GENERAL_STATUS_UUID, midProgrammingTick);
    transport.notify(GENERAL_STATUS_UUID, midProgrammingTick);

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("timeout");
      expect((err as ProgramRejectionError).hexTrace).toContain(
        "ack-timeout policy",
      );
      return true;
    });
    // The distinguishing observable: no disconnect ever happened.
    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(0);
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "program-rejection" &&
            e.detail.startsWith("timeout at frame 0"),
        ),
    ).toBe(true);
  });

  it("with no ackTimeout option configured, general-status ticks never time out an ack-await (original, still-supported behavior)", async () => {
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 1,
        distanceMeters: 1,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        programIntervalIndex: 0,
      },
    ];
    const fake = createFakeTransport({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    const log = createEventLog();
    const driver = createPm5Driver(fake, log); // no options — the default

    fake.injectTimeout();
    const pending = driver.program(MINIMAL_PROGRAM);
    fake.tick(1000); // as many ticks as it likes — nothing ever times this out

    let settled = false;
    void pending.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false); // still hanging, exactly as documented — no policy, no bound
  });
});

describe("createPm5Driver: disconnect mid-interval -> reconnect with re-derived position", () => {
  it("advances two intervals while disconnected; the driver re-derives position from the first post-reconnect frame rather than assuming continuity", async () => {
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 100,
        spm: 22,
        currentSplit: 120,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
      // Two more intervals' worth of progress happen while disconnected —
      // never delivered live, only cached by the fake.
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 65,
        distanceMeters: 100,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 130,
        programIntervalIndex: 0,
      },
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 500,
        distanceMeters: 2000,
        spm: 24,
        currentSplit: 118,
        heartRateBpm: 160,
        programIntervalIndex: 2,
      },
    ];
    // A real 1-interval program (MINIMAL_PROGRAM) can't host a genuine
    // "interval 2" — the machine's own jumped-ahead index (below) needs a
    // program with enough intervals to make it a REAL one under the D3 fix
    // (`toProgramIndex` clamps/nulls anything MINIMAL_PROGRAM's single
    // interval can't explain); THREE_INTERVAL_PROGRAM exists for exactly
    // this.
    const { fake, driver, events } = harness({
      program: THREE_INTERVAL_PROGRAM,
      events: timeline,
    });

    await programAndArm(driver, fake, THREE_INTERVAL_PROGRAM);
    fake.tick(100); // the interval-0 live tick lands normally

    fake.injectDisconnect();
    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(1);

    fake.tick(200); // both later events elapse while disconnected — suppressed
    const framesWhileDisconnected = events.filter(
      (e) => e.kind === "frame",
    ).length;

    fake.completeReconnect(); // flushes the LATEST cached state (intervalIndex 2, elapsed 500)

    expect(events.filter((e) => e.kind === "reconnected")).toHaveLength(1);
    // Exactly one NEW frame arrived from the reconnect flush — no frames
    // were silently delivered while disconnected.
    expect(events.filter((e) => e.kind === "frame").length).toBe(
      framesWhileDisconnected + 1,
    );

    const latest = events.filter((e) => e.kind === "frame").at(-1);
    // Re-derived straight from the jumped-ahead status frame — index 2,
    // elapsed 500 — never interpolated from the pre-disconnect index
    // 0 / elapsed 30 baseline.
    expect(latest).toMatchObject({
      kind: "frame",
      frame: { intervalIndex: 2, elapsedSeconds: 500 },
    });
  });
});

describe("createPm5Driver: garbled frame — logged, stream lives", () => {
  it("a too-short General Status notification is logged as frame-error, not thrown; the next VALID one still emits normally (L1)", async () => {
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 45,
        distanceMeters: 150,
        spm: 22,
        currentSplit: 115,
        heartRateBpm: 138,
        programIntervalIndex: 0,
      },
    ];
    const { fake, driver, events, log } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    const framesAfterArm = events.filter((e) => e.kind === "frame").length;

    expect(() => fake.injectGarbledFrame()).not.toThrow();
    expect(events.filter((e) => e.kind === "frame").length).toBe(
      framesAfterArm,
    ); // no new frame from the garbage

    const errorEntry = log.entries().find((e) => e.kind === "frame-error");
    expect(errorEntry).toBeDefined();
    expect(errorEntry?.detail).toContain("0x0031");

    // The stream LIVES: this scripted, genuinely valid notification is
    // delivered and DOES produce a real "frame" event with its own
    // decoded values — not merely "ticking doesn't throw".
    fake.tick(100);
    const frames = events.filter((e) => e.kind === "frame");
    expect(frames.length).toBe(framesAfterArm + 1);
    expect(frames[frames.length - 1]).toMatchObject({
      kind: "frame",
      frame: { state: "rowing", elapsedSeconds: 45, distanceMeters: 150 },
    });
  });
});

describe("createPm5Driver: MED-2 — divergence logging", () => {
  it("logs a 'divergence' entry when frame.intervalIndex (0x0033) disagrees with actual.index (0x0037/38)", async () => {
    const timeline: FakeTimelineEvent[] = [
      // General-status tick reports intervalIndex 0.
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 100,
        spm: 22,
        currentSplit: 120,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
      // Boundary reports a DIFFERENT split number (2) — a skew that can't
      // happen in this fake's own book-keeping by construction, so it's
      // authored directly here to pin the driver's own comparison.
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 2,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 22,
          avgHeartRateBpm: 140,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 200,
      },
    ];
    const { fake, driver, log } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    // `program()` IS awaited here (Task 4): the raw-vs-raw comparison
    // lives on the in-run boundary path, and since a run is opened only
    // by `program()`, a boundary arriving without one is emitted with
    // `index: null` + `boundary-out-of-run` and compared against nothing
    // (pinned by its own test above). This test's subject is the skew
    // between the two RAW fields within a real run.
    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    fake.tick(200);

    const divergence = log.entries().find((e) => e.kind === "divergence");
    expect(divergence).toBeDefined();
    expect(divergence?.detail).toContain("intervalIndex=0");
    expect(divergence?.detail).toContain("actual.index=2");
  });

  it("logs nothing when the two fields agree", async () => {
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 100,
        spm: 22,
        currentSplit: 120,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 22,
          avgHeartRateBpm: 140,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 200,
      },
    ];
    const { fake, driver, log } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    // A real run, for the same reason as the sibling test above — a
    // silent log has to mean "the comparison ran and found nothing", not
    // "there was no run for the comparison to happen in".
    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    fake.tick(200);
    expect(log.entries().some((e) => e.kind === "divergence")).toBe(false);
    expect(log.entries().some((e) => e.kind === "interval-complete")).toBe(
      true,
    );
  });
});

describe("createPm5Driver: R-B — Interval Rest Distance (0x0037 offset 14-15) rides intervalComplete's actual", () => {
  it("three sequential boundaries with an honest, unequal ramp (8m/12m/6m) each carry their OWN restDistanceMeters through to actual — never a shared constant", async () => {
    // Raw bytes via stubTransport, not the fake's scripted timeline: this
    // is the parse-through-driver path in isolation (`splitHalf`'s own
    // `intervalRestDistanceMeters` param, `pm5/parse.ts`'s
    // `parseSplitIntervalData` -> `toIntervalActual`), independent of
    // `transports/fake.ts`'s own honest ramp (`fake.test.ts` covers that
    // door separately). Nonzero AND unequal on purpose (briefing: a
    // constant makes a suite agree with itself regardless of whether the
    // field is really wired through boundary-to-boundary).
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    await programViaStub(driver, transport, THREE_INTERVAL_PROGRAM);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    // Raw machine numbers, not our program indices: `toActualIndex`
    // subtracts one UNCONDITIONALLY for the actuals characteristic
    // (`domain/monitor/pm5/intervalIndex.ts`'s own doc comment — the offset
    // is a property of 0x0037/38 itself, not of resting state), so machine
    // 1/2/3 normalize to our 0/1/2.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200, 8));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(2, 60, 200, 12));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(2, 22));
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(3, 60, 200, 6));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(3, 22));

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(3);
    expect(boundaries[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, restDistanceMeters: 8 },
    });
    expect(boundaries[1]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 1, restDistanceMeters: 12 },
    });
    expect(boundaries[2]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 2, restDistanceMeters: 6 },
    });
  });

  it("the fake's OWN encode path (transports/fake.ts's boundaryBundle, real 0x0037 bytes via buildSplitIntervalDataBytes) carries the SAME honest, unequal ramp end to end — not a constant, and not only reachable through the stub", async () => {
    // THREE_INTERVAL_PROGRAM's own restSeconds (30) means each boundary
    // below is legitimately preceded by a RESTING status tick
    // (`boundaryBundle`'s own enforced rule, `transports/fake.ts`) — this
    // is what the sibling test above (raw stubTransport bytes) does not
    // exercise: the fake's own `intervalRestDistanceMeters:
    // actual.restDistanceMeters` wiring.
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 100,
        spm: 20,
        currentSplit: 130,
        heartRateBpm: 130,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 70,
        distanceMeters: 200,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 128,
        programIntervalIndex: 0,
      },
      {
        atMs: 300,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 20,
          avgHeartRateBpm: 130,
          restDistanceMeters: 8,
        },
        cumulativeElapsedSeconds: 90,
        cumulativeDistanceMeters: 200,
      },
      {
        atMs: 400,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 120,
        distanceMeters: 320,
        spm: 30,
        currentSplit: 100,
        heartRateBpm: 170,
        programIntervalIndex: 1,
      },
      {
        atMs: 500,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 160,
        distanceMeters: 420,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 165,
        programIntervalIndex: 1,
      },
      {
        atMs: 600,
        kind: "boundary",
        actual: {
          index: 1,
          elapsedSeconds: 60,
          distanceMeters: 220,
          avgSpm: 30,
          avgHeartRateBpm: 170,
          restDistanceMeters: 12,
        },
        cumulativeElapsedSeconds: 180,
        cumulativeDistanceMeters: 420,
      },
      {
        atMs: 700,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 220,
        distanceMeters: 540,
        spm: 24,
        currentSplit: 110,
        heartRateBpm: 150,
        programIntervalIndex: 2,
      },
      {
        atMs: 800,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 260,
        distanceMeters: 640,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 145,
        programIntervalIndex: 2,
      },
      {
        atMs: 900,
        kind: "boundary",
        actual: {
          index: 2,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 24,
          avgHeartRateBpm: 150,
          restDistanceMeters: 6,
        },
        cumulativeElapsedSeconds: 280,
        cumulativeDistanceMeters: 640,
      },
    ];
    const { fake, driver, events } = harness({
      program: THREE_INTERVAL_PROGRAM,
      events: timeline,
    });
    await programAndArm(driver, fake, THREE_INTERVAL_PROGRAM);
    for (let i = 0; i < 9; i += 1) fake.tick(100);

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(3);
    expect(
      boundaries.map((e) =>
        e.kind === "intervalComplete" ? e.actual.restDistanceMeters : -1,
      ),
    ).toStrictEqual([8, 12, 6]);
  });
});

describe("createPm5Driver: RC-1 — Interval Rest Time and Split/Interval Type (0x0037 offsets 12/16) ride intervalComplete's actual", () => {
  it("three sequential boundaries with unequal restSeconds/type — including a rest-free (0) one — each carry their OWN values through to actual, never a shared constant (raw stubTransport bytes, parse-through-driver path in isolation)", async () => {
    // Same shape as the sibling R-B ramp test above: raw bytes via
    // stubTransport, not the fake's scripted timeline. Unequal AND
    // includes a genuine 0 on purpose — a constant (or a hardcoded 0)
    // here would make the suite agree with itself regardless of whether
    // the field is really wired boundary-to-boundary (RC-1's own Step
    // 1a/1d).
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    await programViaStub(driver, transport, THREE_INTERVAL_PROGRAM);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200, 0, 40, 0));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(2, 60, 200, 0, 25, 1));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(2, 22));
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(3, 60, 200, 0, 0, 0));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(3, 22));

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(3);
    expect(boundaries[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, restSeconds: 40, type: 0 },
    });
    expect(boundaries[1]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 1, restSeconds: 25, type: 1 },
    });
    // Step 1d: the rest-free boundary's restSeconds is PRESENT and 0, not
    // absent — the field rides through whenever the wire delivered it,
    // and the wire delivering 0 is a real reading, not silence.
    expect(boundaries[2]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 2, restSeconds: 0, type: 0 },
    });
    const lastEvent = boundaries[2]!;
    const lastActual =
      lastEvent.kind === "intervalComplete" ? lastEvent.actual : null;
    expect(lastActual).not.toBeNull();
    expect(Object.keys(lastActual!)).toContain("restSeconds");
  });

  it("the fake's OWN encode path (transports/fake.ts's boundaryBundle, corrected in Task 1) sources restSeconds/type honestly from the program's own restSeconds/kind — not a constant, and not only reachable through the stub", async () => {
    // A 2-interval program with UNEQUAL restSeconds and DIFFERENT kinds
    // (time then distance). Both intervals carry a trailing rest so both
    // boundaries are delivered during a RESTING tick, same as the sibling
    // R-B fake test above — `boundaryBundle`'s own enforced rule requires
    // this whenever `restSeconds > 0`, and `toMachineIndex`'s own
    // resting-conditional +1 (shared with 0x0033's forward-attribution
    // rule, `domain/monitor/pm5/intervalIndex.ts`) only round-trips
    // through `toActualIndex`'s UNCONDITIONAL -1 when the boundary is
    // delivered resting — a rest-free interval's own boundary needs a
    // different fixture shape (this file's raw-bytes RC-1 tests above
    // already cover restSeconds: 0, off the parse-through-driver path in
    // isolation from this asymmetry).
    const program: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 40,
        },
        {
          type: "work",
          kind: "distance",
          value: 500,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 25,
        },
      ],
    };
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 60,
        distanceMeters: 200,
        spm: 20,
        currentSplit: 130,
        heartRateBpm: 130,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 100,
        distanceMeters: 200,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 128,
        programIntervalIndex: 0,
      },
      {
        atMs: 300,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 20,
          avgHeartRateBpm: 130,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 100,
        cumulativeDistanceMeters: 200,
      },
      {
        atMs: 400,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 160,
        distanceMeters: 700,
        spm: 24,
        currentSplit: 100,
        heartRateBpm: 150,
        programIntervalIndex: 1,
      },
      {
        atMs: 500,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 185,
        distanceMeters: 700,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 145,
        programIntervalIndex: 1,
      },
      {
        atMs: 600,
        kind: "boundary",
        actual: {
          index: 1,
          elapsedSeconds: 100,
          distanceMeters: 500,
          avgSpm: 24,
          avgHeartRateBpm: 150,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 200,
        cumulativeDistanceMeters: 700,
      },
    ];
    const { fake, driver, events } = harness({ program, events: timeline });
    await programAndArm(driver, fake, program);
    for (let i = 0; i < 6; i += 1) fake.tick(100);

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, restSeconds: 40, type: 0 },
    });
    expect(boundaries[1]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 1, restSeconds: 25, type: 1 },
    });
  });

  it("a rest-bearing committed capture's boundary folds restSeconds/type off the wire's own bytes — walk-2026-08-16 session 2 (wu+4unequal), seq 1666, decoded independently in THIS test, never via parseSplitIntervalData", async () => {
    const raw = readFileSync(
      `${RC1_SESSIONS_DIR}session-2-wu-4unequal.jsonl`,
      "utf8",
    );
    const line = raw
      .split("\n")
      .find(
        (l) => l.includes('"seq":1666') && l.includes(SPLIT_INTERVAL_DATA_UUID),
      );
    if (!line) {
      throw new Error(
        "seq 1666's 0x0037 frame was not found in session-2-wu-4unequal.jsonl — the capture-replay pin has nothing to decode",
      );
    }
    const record = JSON.parse(line) as { hex: string };
    const bytes = Uint8Array.from(
      record.hex
        .trim()
        .split(/\s+/)
        .map((b) => parseInt(b, 16)),
    );
    expect(bytes).toHaveLength(18);

    // INDEPENDENT DECODE, re-implemented here from the wire layout
    // (interface-notes.md §10) rather than calling `parseSplitIntervalData`
    // — offset 12-13 little-endian is Interval Rest Time (whole seconds),
    // offset 16 is Split/Interval Type. Cross-checks
    // `domain/monitor/pm5/parse.test.ts`'s own committed decode of these
    // SAME verbatim bytes (intervalRestTimeSeconds: 30, splitIntervalType: 0).
    const independentRestSeconds = bytes[12]! | (bytes[13]! << 8);
    const independentType = bytes[16]!;
    expect(independentRestSeconds).toBe(30);
    expect(independentType).toBe(0);

    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    await programViaStub(driver, transport, THREE_INTERVAL_PROGRAM);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    // The capture's own splitIntervalNumber (offset 17, byte value 3)
    // rides verbatim in `bytes`; the 0x0038 half is synthetic (0x0038
    // carries no rest time/type field of its own — nothing this test
    // checks lives there), matched on the same wire number so the two
    // halves pair.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, bytes);
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(3, 22));

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toMatchObject({
      kind: "intervalComplete",
      actual: {
        restSeconds: independentRestSeconds,
        type: independentType,
      },
    });
  });
});

describe("createPm5Driver: RC-1 — the synthesized-final fallback omits restSeconds/type (no wire reading for either, RC-7's own precedent for restDistanceMeters)", () => {
  it("the summary-derived final interval carries NO restSeconds/type keys at all — absent, not 0 (0x0039 has no per-interval Rest Time or Split/Interval Type)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    // A minimal inline scheduler — `manualSchedule` is defined inside the
    // THE SUMMARY-FALLBACK GATE describe block further down this file and
    // is not reachable from module scope; this test needs only the one
    // deadline call, fired by hand.
    const scheduled: { ms: number; fire: () => void }[] = [];
    const timer = {
      schedule: (cb: () => void, ms: number): (() => void) => {
        scheduled.push({ ms, fire: cb });
        return () => {};
      },
      pending: () => scheduled[scheduled.length - 1] ?? null,
    };
    const driver = createPm5Driver(transport, log, {
      now: clock.now,
      schedule: timer.schedule,
    });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));

    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
    // The split never arrives; only the summary does, and only the
    // deadline (never claimed by a split) fires the synthesis.
    transport.notify(
      END_OF_WORKOUT_SUMMARY_UUID,
      buildEndOfWorkoutSummaryBytes({
        elapsedSeconds: 62.5,
        meters: 214,
        avgStrokeRate: 24,
        endingHeartRateBpm: 150,
        avgHeartRateBpm: 150,
        minHeartRateBpm: 130,
        maxHeartRateBpm: 160,
        dragFactorAverage: 130,
        recoveryHeartRateBpm: 100,
        workoutType: 1,
        avgPaceSecondsPer500m: 120,
      }),
    );
    expect(timer.pending()?.ms).toBe(3000);
    timer.pending()!.fire();

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(1);
    const synthesized = boundaries[0]!;
    expect(synthesized).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, elapsedSeconds: 62.5, distanceMeters: 214 },
      finalBoundary: true,
    });
    const actualKeys = Object.keys(
      synthesized.kind === "intervalComplete" ? synthesized.actual : {},
    );
    expect(actualKeys).not.toContain("restSeconds");
    expect(actualKeys).not.toContain("type");
  });
});

describe("createPm5Driver: D3 — a machine index the armed program's length cannot explain logs 'divergence' (the new trigger this task adds)", () => {
  // Against TODAY's (pre-fix) code, both assertions below fail: `frame.
  // intervalIndex` would be the RAW machine value (5) passed straight
  // through, never `null`, and no "divergence" entry mentioning "has no
  // corresponding interval" would exist at all — this is exactly D3's own
  // blind spot (interface-notes.md §18 #3): a machine index the program
  // can't explain, with nothing today to notice.
  it("frame emission: a rowing machineIndex far past the armed program's length normalizes to null and logs divergence", async () => {
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 100,
        spm: 22,
        currentSplit: 120,
        heartRateBpm: 140,
        // MINIMAL_PROGRAM has exactly 1 interval — 5 is FOUR past its only
        // valid index, not the offset rule's own one-past-the-end shape.
        programIntervalIndex: 5,
      },
    ];
    const { fake, driver, events, log } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    const framesBeforeTick = events.filter((e) => e.kind === "frame").length;

    fake.tick(100);

    const frames = events.filter((e) => e.kind === "frame");
    expect(frames.length).toBe(framesBeforeTick + 1);
    expect(frames[frames.length - 1]).toMatchObject({
      kind: "frame",
      frame: { intervalIndex: null },
    });
    const divergence = log
      .entries()
      .find(
        (e) =>
          e.kind === "divergence" &&
          e.detail.includes("has no corresponding interval"),
      );
    expect(divergence).toBeDefined();
    expect(divergence?.detail).toContain("intervalIndex=5");
    expect(divergence?.detail).toContain("0x0033");
    expect(divergence?.detail).toContain("state=rowing");
    expect(divergence?.detail).toContain("1-interval program");
  });

  // Re-review MUST-1: `toActualIndex` mirrors `toProgramIndex`'s own
  // boundary shape — one step outside either end clamps, MORE than one step
  // out is `null` + `divergence`, never a fabricated interval identity. The
  // two tests below (originally Task 4's own) pin that for the actuals path
  // exactly as `toProgramIndex`'s own D3 tests pin it for 0x0033.
  it("intervalComplete emission: an actual.index far past the armed program's length normalizes to null (never a fabricated number) and logs divergence", async () => {
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 100,
        spm: 22,
        currentSplit: 120,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          // THREE_INTERVAL_PROGRAM has 3 intervals — 9 is far past the
          // offset rule's own one-past-the-end shape (candidate 8, two
          // steps past the last valid index 2) — unexplainable by
          // `toActualIndex`, same as it would be for `toProgramIndex`.
          index: 9,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 22,
          avgHeartRateBpm: 140,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 200,
      },
    ];
    const { fake, driver, events, log } = harness({
      program: THREE_INTERVAL_PROGRAM,
      events: timeline,
    });
    await programAndArm(driver, fake, THREE_INTERVAL_PROGRAM);

    fake.tick(200);

    const complete = events.find((e) => e.kind === "intervalComplete");
    expect(complete).toMatchObject({
      kind: "intervalComplete",
      // Widened type (Task 3 review, `docs/design/DEVIATIONS.md`) — the raw
      // machine value (9) is never assigned here, and neither is a
      // fabricated stand-in number; `null` is the honest signal, with the
      // raw value surviving in the "divergence" entry asserted below.
      actual: { index: null },
    });
    const divergence = log
      .entries()
      .find(
        (e) =>
          e.kind === "divergence" &&
          e.detail.includes("has no corresponding interval"),
      );
    expect(divergence).toBeDefined();
    expect(divergence?.detail).toContain("actual.index=9");
    expect(divergence?.detail).toContain("0x0037/38");
    expect(divergence?.detail).toContain("state=rowing");
    expect(divergence?.detail).toContain("3-interval program");
  });

  it("intervalComplete emission: the same unexplainable check also applies while resting, not only while rowing", async () => {
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 65,
        distanceMeters: 100,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 130,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          // Authored as OUR index; the fake puts 10 on the wire (the rest's
          // own forward attribution). Far past THREE_INTERVAL_PROGRAM's 3
          // intervals either way, which is the point.
          index: 9,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 22,
          avgHeartRateBpm: 140,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 200,
      },
    ];
    const { fake, driver, events, log } = harness({
      program: THREE_INTERVAL_PROGRAM,
      events: timeline,
    });
    await programAndArm(driver, fake, THREE_INTERVAL_PROGRAM);

    fake.tick(200);

    const complete = events.find((e) => e.kind === "intervalComplete");
    expect(complete).toMatchObject({
      kind: "intervalComplete",
      actual: { index: null },
    });
    const divergence = log
      .entries()
      .find(
        (e) =>
          e.kind === "divergence" &&
          e.detail.includes("has no corresponding interval"),
      );
    expect(divergence).toBeDefined();
    expect(divergence?.detail).toContain("state=resting");
  });
});

describe("createPm5Driver: storage-spine PR3 Task 1 — the machine's raw interval count rides `frame.rawIntervalCount` (design spec §4, delta D6)", () => {
  it("a frame emitted after a 0x0033 carries rawIntervalCount equal to the wire byte, while intervalIndex's existing normalized behavior stays byte-identical", async () => {
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 20,
        distanceMeters: 150,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 130,
        // Resting forward-attributes one past this on the wire
        // (`toMachineIndex`, interface-notes.md §18 #3) — the scripted RAW
        // wire value is 2, while the driver's own PRE-EXISTING
        // `toProgramIndex` undoes that back to 1. This is the "existing
        // case" being pinned byte-identical, not a new fixture invented
        // for this task.
        programIntervalIndex: 1,
      },
    ];
    const { fake, driver, events } = harness({
      program: THREE_INTERVAL_PROGRAM,
      events: timeline,
    });
    await programAndArm(driver, fake, THREE_INTERVAL_PROGRAM);

    fake.tick(100);

    const frames = events.filter((e) => e.kind === "frame");
    const latest = frames[frames.length - 1];
    expect(latest).toMatchObject({
      kind: "frame",
      frame: {
        // The RAW 0x0033 byte the fake put on the wire
        // (`toMachineIndex(1, "resting")` = 2) — unclamped, never
        // `toProgramIndex`'d.
        rawIntervalCount: 2,
        // `toProgramIndex(2, "resting", 3)` = 1 — the SAME normalized
        // value this codebase already produced for this exact scripted
        // tick before this task; unchanged by `rawIntervalCount`'s
        // addition.
        intervalIndex: 1,
      },
    });
  });

  it("no 'frame' event exists before the run's first 0x0033 — nothing for the field to be absent FROM until the very first frame, which already carries it", () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 10, 40),
    );
    // `maybeEmitFrame`'s own `seen.general && seen.as1 && seen.as2` gate:
    // as2 hasn't arrived yet, so no frame — the machine's own contract,
    // not a special case this task adds.
    expect(events.filter((e) => e.kind === "frame")).toHaveLength(0);

    // The run's first 0x0033 arrives now — the very next frame already
    // carries the field, no second tick needed.
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(3));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 11, 42),
    );
    const frames = events.filter((e) => e.kind === "frame");
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      kind: "frame",
      frame: { rawIntervalCount: 3 },
    });
  });

  it("capture replay: session-2-wu-4unequal.jsonl seq 245 and seq 601's 0x0033 bytes, decoded independently in THIS test (offset 3, interface-notes.md §10), match the frame's rawIntervalCount", async () => {
    const contents = readFileSync(
      `${RC1_SESSIONS_DIR}session-2-wu-4unequal.jsonl`,
      "utf8",
    );
    const lines = contents.split("\n");
    const as2BytesForSeq = (seq: number): Uint8Array => {
      const line = lines.find(
        (l) =>
          l.includes(`"seq":${seq},`) && l.includes(ADDITIONAL_STATUS_2_UUID),
      );
      if (!line) {
        throw new Error(
          `seq ${seq}'s 0x0033 frame was not found in session-2-wu-4unequal.jsonl — the capture-replay pin has nothing to decode`,
        );
      }
      const record = JSON.parse(line) as { hex: string };
      const bytes = Uint8Array.from(
        record.hex
          .trim()
          .split(/\s+/)
          .map((b) => parseInt(b, 16)),
      );
      expect(bytes).toHaveLength(20);
      return bytes;
    };

    const bytesSeq245 = as2BytesForSeq(245);
    const bytesSeq601 = as2BytesForSeq(601);
    // INDEPENDENT DECODE, re-implemented here from the wire layout
    // (interface-notes.md §10's table — offset 3 is Interval Count) rather
    // than calling `parseAdditionalStatus2`, the same idiom the RC-1
    // capture-replay pin above uses for 0x0037's own offsets.
    const independentCount245 = bytesSeq245[3]!;
    const independentCount601 = bytesSeq601[3]!;
    expect(independentCount245).toBe(1);
    expect(independentCount601).toBe(2);

    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    transport.notify(ADDITIONAL_STATUS_2_UUID, bytesSeq245);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 10, 40),
    );
    transport.notify(ADDITIONAL_STATUS_2_UUID, bytesSeq601);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 20, 80),
    );

    const frames = events.filter((e) => e.kind === "frame");
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      kind: "frame",
      frame: { rawIntervalCount: independentCount245 },
    });
    expect(frames[1]).toMatchObject({
      kind: "frame",
      frame: { rawIntervalCount: independentCount601 },
    });
  });
});

describe("createPm5Driver: Task 5 — toActualIndex's own null (state outside rowing/resting) still logs divergence", () => {
  it("a boundary that completes while the general-status word already reads TERMINATE (but the run has not yet closed) normalizes to null and logs divergence — CSAFE-DEF footnote 12 p.25 via §19.8", async () => {
    // This exploits `maybeEmitFrame`'s own `seen.general && seen.as1 &&
    // seen.as2` gate (its own comment, driver.ts): a General Status
    // notification always merges `workoutState` into `raw` immediately, but
    // the terminal-state-closes-the-run logic sits BEHIND that "seen all
    // three" gate. `program()` here is armed via `programViaStub`, which
    // resolves `verifyArmed()` from a bare GENERAL_STATUS_UUID notification
    // alone (no AS1/AS2 ever sent) — so by the time a lone TERMINATE status
    // arrives, `raw.workoutState` reads "terminated" while `activeRun`
    // stays open (the close logic never runs, for lack of AS1/AS2). This is
    // the one reachable way to observe `state === "terminated"` with
    // `runIsOpen()` still true inside `emitIntervalComplete` — the shape
    // CSAFE-DEF's footnote 12 describes, where a boundary's own value has no
    // stable meaning at a mid-terminate moment.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    await programViaStub(driver, transport, THREE_INTERVAL_PROGRAM);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 90, 300),
    );

    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));

    const complete = events.find((e) => e.kind === "intervalComplete");
    expect(complete).toMatchObject({
      kind: "intervalComplete",
      actual: { index: null },
    });
    const divergence = log
      .entries()
      .find(
        (e) => e.kind === "divergence" && e.detail.includes("state=terminated"),
      );
    expect(divergence).toBeDefined();
    expect(divergence?.detail).toContain("actual.index=1");
    expect(divergence?.detail).toContain("3-interval program was armed");
    // Never the out-of-run path: the run genuinely never closed here.
    expect(log.entries().some((e) => e.kind === "boundary-out-of-run")).toBe(
      false,
    );
  });
});

describe("createPm5Driver: Task 5 — actuals normalize via toActualIndex (minus-1, state-free within the gate; interface-notes.md §19.8)", () => {
  // THE HEADLINE DEFECT TEST. Session 2's own reading (§19.8, answering §17
  // item 13): at a no-rest work->work boundary, 0x0037/38 read `1` while
  // state stayed "rowing" throughout. Against TODAY's code (`toProgramIndex`
  // shared for both paths — its rowing branch passes the machine index
  // through UNADJUSTED), this exact input normalizes to `1`, not `0`: driven
  // through `stubTransport` directly (raw `splitHalf(1, ...)`/`asSplitHalf(1,
  // ...)`) rather than the fake, because `transports/fake.ts`'s own
  // `toMachineIndex(programIndex, "rowing")` is an identity pass-through —
  // it cannot put a forward-attributed `1` on the wire for a rowing boundary
  // at all, which is exactly the model gap this hardware reading exposed and
  // which is out of this task's scope to fix (fake.ts is not in Task 5's
  // file list). Talking to the raw characteristics lets this test pin the
  // exact wire value session 2 actually saw.
  it("a no-rest work->work boundary (machine 1, rowing, 2-interval program) normalizes to 0 — the forward-attributed 1 must not pass through", async () => {
    const twoIntervalNoRest: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0, // no rest -- the state word never becomes "resting"
        },
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0,
        },
      ],
    };
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    await programViaStub(driver, transport, twoIntervalNoRest);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 50, 180),
    );

    // The exact session-2 wire value: Split/Interval Number 1, arriving
    // while the machine has never left "rowing".
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));

    const complete = events.find((e) => e.kind === "intervalComplete");
    expect(complete).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0 },
    });
    expect(
      log.entries().find((e) => e.kind === "interval-complete")?.detail,
    ).toBe("index=0 (machine reported 1)");
    // Nothing in this session is unexplainable, and the two raw fields
    // never disagreed with each other either (0x0033 was never sampled in
    // this stub-driven test) — no divergence of any kind fires.
    expect(log.entries().some((e) => e.kind === "divergence")).toBe(false);
    // `index-unverified` is RETIRED — this exact boundary shape is what
    // retired it (§17 item 13 is answered).
    expect(log.entries().some((e) => e.kind === "index-unverified")).toBe(
      false,
    );
  });

  // A REGRESSION PIN, not a defect test: this shape happens to clamp to the
  // same value (0) whether the old rest-keyed rule or the new state-free
  // one is applied (`toMachineIndex(0, "rowing")` puts a plain `0` on the
  // wire via the fake, and `0 - 1` clamps right back to `0`), so it does not
  // discriminate old from new — it only proves the fake-driven path still
  // behaves once `index-unverified` is gone.
  it("a work->work boundary with restSeconds: 0 and machine index 0 still normalizes to 0, with no divergence and no retired log kind", async () => {
    const restlessProgram: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0, // no rest -- the state word never becomes "resting"
        },
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0,
        },
      ],
    };
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME, // rowing, never resting
        elapsedSeconds: 50,
        distanceMeters: 180,
        spm: 22,
        currentSplit: 120,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 22,
          avgHeartRateBpm: 140,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 200,
      },
      // The machine rows straight on into interval 1 with no state change
      // of any kind — the whole point of the shape. Elapsed/distance reset
      // (5/20, not a continuation of interval 0's own 50/180-then-60/200)
      // because 0x0031's fields are PER-INTERVAL (`session`'s own doc
      // comment, driver.ts) — CR2 spec 1 Task 11's open-on-reset guard
      // relies on exactly this reset to tell a genuine new interval from a
      // poison tick, and a non-resetting fixture here would trip its
      // "refused open" divergence for a reason unrelated to what this test
      // actually checks (`toActualIndex` normalization, below).
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 5,
        distanceMeters: 20,
        spm: 22,
        currentSplit: 120,
        heartRateBpm: 141,
        programIntervalIndex: 1,
      },
    ];
    const { fake, driver, events, log } = harness({
      program: restlessProgram,
      events: timeline,
    });
    await programAndArm(driver, fake, restlessProgram);

    fake.tick(300);

    const complete = events.find((e) => e.kind === "intervalComplete");
    expect(complete).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0 },
    });
    expect(log.entries().some((e) => e.kind === "divergence")).toBe(false);
    expect(log.entries().some((e) => e.kind === "index-unverified")).toBe(
      false,
    );
  });

  it("a boundary that DOES follow a rest tick keeps normalizing the same way (regression pin: today's rest-keyed rule already agreed here)", async () => {
    const timeline: FakeTimelineEvent[] = [
      // Interval 1's trailing rest: the machine's own counter reads 2 here
      // (forward-attributed), and so does the Split/Interval Number on the
      // boundary that follows — the confirmed half of the (now-retired)
      // rest-keyed rule, and `toActualIndex` produces the identical answer.
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 65,
        distanceMeters: 100,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 130,
        programIntervalIndex: 1,
      },
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 1,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 22,
          avgHeartRateBpm: 140,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 200,
      },
    ];
    const { fake, driver, events, log } = harness({
      program: THREE_INTERVAL_PROGRAM,
      events: timeline,
    });
    await programAndArm(driver, fake, THREE_INTERVAL_PROGRAM);

    fake.tick(200);

    // OUR 1, from a wire that said 2 — the row both the old rest-keyed rule
    // and the new state-free rule agree on.
    expect(events.find((e) => e.kind === "intervalComplete")).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 1 },
    });
    expect(
      log.entries().find((e) => e.kind === "interval-complete")?.detail,
    ).toBe("index=1 (machine reported 2)");
    expect(log.entries().some((e) => e.kind === "index-unverified")).toBe(
      false,
    );
  });
});

describe("createPm5Driver: 'seen' gating — a notification before its siblings have ever arrived", () => {
  it("a General Status notification alone (before AS1/AS2 ever arrived) produces no 'frame' event", () => {
    const transport = stubTransport();
    const log = createEventLog();
    // This test only needs the raw notify + the log's own record of
    // whether a "frame" entry was written — no need to also subscribe via
    // `driver.events()`.
    createPm5Driver(transport, log);

    transport.notify(
      GENERAL_STATUS_UUID,
      buildGeneralStatusBytes({
        elapsedSeconds: 10,
        distanceMeters: 20,
        workoutType: 8,
        intervalType: 0,
        workoutState: WORKOUTSTATE_WAITTOBEGIN,
        rowingState: 0,
        strokeState: 0,
        totalWorkDistanceMeters: 20,
        workoutDurationRaw: 0,
        workoutDurationType: 0,
        dragFactor: 130,
      }),
    );

    expect(log.entries().some((e) => e.kind === "frame")).toBe(false);
  });

  it("a Split/Interval notification alone (before AdditionalSplitIntervalData ever arrived) produces no intervalComplete", () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    // A minimal, valid-length (18-byte) 0x0037 payload — content doesn't
    // matter, only that it decodes without error.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, new Uint8Array(18));

    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(0);
  });
});

describe("createPm5Driver: MED-1 — the pending-ack queue", () => {
  it("an ack notification with nothing awaiting it is BUFFERED (logged, not thrown or discarded)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    expect(() =>
      transport.notify(
        TRANSMIT_CHARACTERISTIC_UUID,
        buildAckFrame({ frameStatus: "ok", commandIds: [0x01] }),
      ),
    ).not.toThrow();
    expect(
      log
        .entries()
        .some((e) => e.kind === "ack-buffered" && e.detail.includes("queued")),
    ).toBe(true);
  });

  it("a coalesced notification carrying TWO complete ack frames does not hang program() on a multi-frame sequence", async () => {
    // The exact defect the fix-round review proved both ways: the drain
    // loop pulls both frames out of one notification synchronously, but
    // resolving the first frame's `pendingAck` does not synchronously let
    // `sendSequence` register the next one — so, before this fix, the
    // second frame was discarded as "unsolicited" and the write it was
    // really for (frame 1) waited forever.
    const fiveIntervalProgram: WorkoutProgram = {
      intervals: Array.from({ length: 5 }, () => ({
        type: "work" as const,
        kind: "time" as const,
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 30,
      })),
    };
    const seq = buildProgrammingSequence(fiveIntervalProgram);
    expect(seq.length).toBeGreaterThan(1); // confirms this fixture is genuinely multi-frame

    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.program(fiveIntervalProgram);

    // The prepare step's own ack (plan Task 2) first — and fully drained
    // before the coalesced notification below, or `sendSequence`'s own
    // `discardStaleAcks()` (fix-round 2) would purge the FIRST of the two
    // coalesced acks as a stale leftover from the prepare sequence instead
    // of consuming it as the real programming sequence's own frame-0
    // response.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );

    // Both frames' acks, concatenated into ONE raw byte stream — a
    // single BLE notification that happened to coalesce two responses.
    const ack1 = buildAckFrame({ frameStatus: "ok" });
    const ack2 = buildAckFrame({ frameStatus: "ok" });
    const coalesced = new Uint8Array(ack1.length + ack2.length);
    coalesced.set(ack1, 0);
    coalesced.set(ack2, ack1.length);
    transport.notify(TRANSMIT_CHARACTERISTIC_UUID, coalesced);
    // Fix-round 2: drain until the send has fully resolved and
    // `verifyArmed`'s snapshot has actually been captured (its own doc
    // comment) before supplying a fresh post-send "armed" observation.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS); // verifyArmed()'s own requirement

    await expect(pending).resolves.toBeUndefined();
    // Both frames' chunks actually went out — this isn't a case where the
    // driver merely accepted the buffered ack without ever writing the
    // second frame's own bytes. `prepareChunkCount` accounts for the leading
    // prepare step's own chunks, which target the same characteristic.
    expect(
      transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID),
    ).toHaveLength(prepareChunkCount + seq.flat().length);
  });
});

describe("createPm5Driver: fix-round 2 — stale acks never cross a sequence boundary", () => {
  it("a stray ack delivered AFTER program() resolves is discarded (logged as stale), not consumed by terminate()'s own sequence", async () => {
    // The regression the MED-1 fix introduced: `pendingAckBuffer` is
    // per-driver, shared by every `program()`/`terminate()` call. Without
    // clearing it at each `sendSequence()` entry, this stray "reject"
    // (buffered here with nothing awaiting it — program() has already
    // fully resolved) would be silently handed to terminate()'s OWN
    // `awaitAck()` as if it were terminate's real response, rejecting
    // terminate() with a NAK it never actually received — and terminate's
    // REAL ack (sent below) would then itself become the NEXT stale
    // leftover, poisoning whatever comes after.
    const transport = stubTransport();
    const log = createEventLog();
    // settleTicks: 0 — this test's own focus is the stale-ack buffer, not
    // the settle wait; a stub transport supplies no ticks after the ack
    // otherwise, so `terminatePending` would never settle.
    const driver = createPm5Driver(transport, log, { settleTicks: 0 });

    const programPending = driver.program(MINIMAL_PROGRAM);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    ); // prepare step (plan Task 2)
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    // Fix-round 2: drain until the send has fully resolved and
    // `verifyArmed`'s snapshot has actually been captured (its own doc
    // comment) before supplying a fresh post-send "armed" observation.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS); // verifyArmed()'s own requirement
    await programPending;

    // No sequence is running right now — this is genuinely stray. Body
    // deliberately encodes a REJECT with a distinctive opcode (0x99) so a
    // wrongly-consumed outcome (terminate() rejecting with "nak") is
    // unambiguous, not a coincidence of some other default.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject", commandIds: [0x99] }),
    );

    const terminatePending = driver.terminate();
    // terminate()'s REAL ack — sent AFTER the stale one, proving the
    // sequence actually waited for and consumed THIS one, not the stray.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );

    await expect(terminatePending).resolves.toBeUndefined();
    expect(
      log.entries().some(
        (e) =>
          e.kind === "frame-error" &&
          e.detail.includes("stale-ack") &&
          e.detail.includes("reject") &&
          e.detail.includes("153"), // 0x99 decimal — the stale frame's own commandId, proving THIS is the one discarded
      ),
    ).toBe(true);
  });

  it("the existing coalesced in-sequence case still resolves normally (the fix only clears BETWEEN sequences)", async () => {
    // Same scenario as the MED-1 describe block above, re-run here to pin
    // that `discardStaleAcks()` firing once at `sendSequence` entry does
    // NOT also purge a legitimately coalesced buffered ack that arrives
    // mid-sequence (between this same sequence's own frames).
    const fiveIntervalProgram: WorkoutProgram = {
      intervals: Array.from({ length: 5 }, () => ({
        type: "work" as const,
        kind: "time" as const,
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 30,
      })),
    };
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.program(fiveIntervalProgram);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    ); // prepare step (plan Task 2)
    await waitUntil(
      () =>
        transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
          .length > prepareChunkCount,
    );
    const ack1 = buildAckFrame({ frameStatus: "ok" });
    const ack2 = buildAckFrame({ frameStatus: "ok" });
    const coalesced = new Uint8Array(ack1.length + ack2.length);
    coalesced.set(ack1, 0);
    coalesced.set(ack2, ack1.length);
    transport.notify(TRANSMIT_CHARACTERISTIC_UUID, coalesced);
    // Fix-round 2: drain until the send has fully resolved and
    // `verifyArmed`'s snapshot has actually been captured (its own doc
    // comment) before supplying a fresh post-send "armed" observation.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS); // verifyArmed()'s own requirement

    await expect(pending).resolves.toBeUndefined();
    // No stale-ack anomaly here — the buffered second frame was consumed
    // as a legitimate in-sequence ack, not discarded.
    expect(log.entries().some((e) => e.detail.includes("stale-ack"))).toBe(
      false,
    );
  });
});

describe("createPm5Driver: sample-rate write failure", () => {
  it("a failed sample-rate write is logged, not thrown, and doesn't block construction", async () => {
    const transport = stubTransport({ sampleRateFails: true });
    const log = createEventLog();
    expect(() => createPm5Driver(transport, log)).not.toThrow();
    await flushMicrotasks();
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "transport-error" && e.detail.includes("sample rate"),
        ),
    ).toBe(true);
  });
});

describe("createPm5Driver: L3 — exact write/ack byte-pair trace on a multi-frame program", () => {
  function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
  }

  /** The whole CSAFE frame a `buildProgrammingSequence` entry's chunks
   *  reassemble into — what the PM actually acks, and what its echo is
   *  derived from. */
  function joinChunks(chunks: Uint8Array[]): Uint8Array {
    const frame = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      frame.set(chunk, offset);
      offset += chunk.length;
    }
    return frame;
  }

  it("log.entries() shows exactly buildProgrammingSequence's chunks, each frame paired with one 'ok' ack", async () => {
    const program: WorkoutProgram = {
      intervals: Array.from({ length: 13 }, () => ({
        type: "work" as const,
        kind: "time" as const,
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 30,
      })),
    };
    const seq = buildProgrammingSequence(program);
    expect(seq).toHaveLength(4); // confirms this fixture is genuinely multi-frame

    const { fake, driver, log } = harness({ program });
    await programAndArm(driver, fake, program);

    // Scoped to entries AFTER the prepare step's own "prepare-sent"
    // marker (plan Task 2/design spec §3) — `program()`'s leading
    // `buildTerminate()` prepare contributes its own write/ack pair to
    // these SAME log kinds first. ("prepare-rejected" until fix-3 Task 3
    // retired the fake's always-refuse prepare — item 15's byte is an
    // accept, so a clean-state program() records no rejection at all.)
    const prepareSeq = log
      .entries()
      .find((e) => e.kind === "prepare-sent")!.seq;
    const trace = log
      .entries()
      .filter(
        (e) => e.seq > prepareSeq && (e.kind === "write" || e.kind === "ack"),
      );
    // Task 3: the "ack" log detail carries the parsed slave state
    // alongside the raw hex it always showed. Task 6: every ack in that
    // trace is now a DIFFERENT frame — the toggle bit alternates
    // ([CSAFE-DEF] p.11 Table 9, interface-notes.md §19.1/§19.2) and each
    // one echoes its own frame's opcodes. Four identical `f1 01 76 00 77
    // f2` acks is precisely the shape the old fake produced and no PM ever
    // sent. The prepare step's own ack came first and took toggle-low, so
    // the programming sequence starts toggle-HIGH and alternates from
    // there.
    let frameToggle = true;

    let cursor = 0;
    for (const frame of seq) {
      for (const chunk of frame) {
        expect(trace[cursor]).toMatchObject({
          kind: "write",
          detail: hex(chunk),
        });
        cursor += 1;
      }
      const expectedAck = buildAckFrame({
        frameStatus: "ok",
        frameToggle,
        commandIds: echoedCommandIds(joinChunks(frame)),
      });
      expect(trace[cursor]).toMatchObject({
        kind: "ack",
        detail: `${hex(expectedAck)} slaveState=ready`,
      });
      cursor += 1;
      frameToggle = !frameToggle;
    }
    expect(trace).toHaveLength(cursor);
    // Not a tautology against the fake: the echo really is this frame's own
    // command list, and the four acks really are four distinct frames.
    expect(
      new Set(trace.filter((e) => e.kind === "ack").map((e) => e.detail)).size,
    ).toBe(seq.length);
  });
});

describe("createPm5Driver: events() subscription and disconnect()", () => {
  it("unsubscribing stops further delivery to that listener", async () => {
    const { fake, driver } = harness({ program: MINIMAL_PROGRAM });
    const events: MonitorEvent[] = [];
    const unsubscribe = driver.events((e) => events.push(e));
    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    // The WAITTOBEGIN "frame" event plus this driver's own "armed" event.
    expect(events).toHaveLength(2);
    const countBeforeUnsubscribe = events.length;
    unsubscribe();
    fake.injectGarbledFrame(); // wouldn't emit anyway, but proves no crash post-unsubscribe
    expect(events).toHaveLength(countBeforeUnsubscribe);
  });

  it("disconnect() calls the transport's disconnect and logs the request; no 'disconnected' event fires (that's onDisconnect's job)", async () => {
    const { driver, events, log } = harness({ program: MINIMAL_PROGRAM });
    await driver.disconnect();
    expect(log.entries().some((e) => e.kind === "disconnect-requested")).toBe(
      true,
    );
    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 7A-fix Task 4: the erg's own findings, as tests. Each suite below
// exists because a real PM5 (432331249, 2026-08-05 — interface-notes.md §18)
// did something this suite's fake could not do beforehand, so CI could not
// have caught the defect it caused.
// ---------------------------------------------------------------------------

describe("createPm5Driver: D4 — a boundary's two halves, in the order the machine sends them", () => {
  /** Two boundaries with DELIBERATELY different averages, each preceded by
   *  the rest tick the machine sends first — the exact session shape that
   *  produced ONE `intervalComplete` for a two-boundary workout, carrying
   *  the wrong interval's numbers. */
  function twoBoundaryTimeline(): FakeTimelineEvent[] {
    return [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 100,
        spm: 20,
        currentSplit: 130,
        heartRateBpm: 130,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 70,
        distanceMeters: 200,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 128,
        programIntervalIndex: 0,
      },
      {
        atMs: 300,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 20,
          avgHeartRateBpm: 130,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 90,
        cumulativeDistanceMeters: 200,
      },
      {
        atMs: 400,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 120,
        distanceMeters: 320,
        spm: 30,
        currentSplit: 100,
        heartRateBpm: 170,
        programIntervalIndex: 1,
      },
      {
        atMs: 500,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 160,
        distanceMeters: 420,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: 165,
        programIntervalIndex: 1,
      },
      {
        atMs: 600,
        kind: "boundary",
        actual: {
          // Nothing about this interval resembles the previous one — that
          // is the point: a stale-0x0038 read is unmistakable in the values.
          index: 1,
          elapsedSeconds: 60,
          distanceMeters: 220,
          avgSpm: 30,
          avgHeartRateBpm: 170,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 180,
        cumulativeDistanceMeters: 420,
      },
    ];
  }

  it("the FIRST boundary is not lost — both boundaries emit, even though 0x0037 arrives before 0x0038 has ever been seen", async () => {
    const { fake, driver, events, log } = harness({
      program: THREE_INTERVAL_PROGRAM,
      events: twoBoundaryTimeline(),
    });
    await programAndArm(driver, fake, THREE_INTERVAL_PROGRAM);
    for (let i = 0; i < 6; i += 1) fake.tick(100);

    // The observed session produced exactly ONE of these two. The trace
    // below is what made that diagnosable: 0x0037 arriving first at BOTH
    // boundaries, which is the arrival order the fake now reproduces.
    expect(
      log
        .entries()
        .filter((e) => e.kind === "notify" || e.kind === "notify-first")
        .map((e) => e.detail.slice(0, 6))
        .filter((c) => c === "0x0037" || c === "0x0038"),
    ).toStrictEqual(["0x0037", "0x0038", "0x0037", "0x0038"]);

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    expect(boundaries).toHaveLength(2);
    expect(
      boundaries.map((e) =>
        e.kind === "intervalComplete" ? e.actual.index : -1,
      ),
    ).toStrictEqual([0, 1]);
  });

  it("each emission carries ITS OWN boundary's averages, never the previous boundary's stale 0x0038", async () => {
    const { fake, driver, events } = harness({
      program: THREE_INTERVAL_PROGRAM,
      events: twoBoundaryTimeline(),
    });
    await programAndArm(driver, fake, THREE_INTERVAL_PROGRAM);
    for (let i = 0; i < 6; i += 1) fake.tick(100);

    const boundaries = events.filter((e) => e.kind === "intervalComplete");
    // The mixed-boundary defect (Task 1's unpredicted second finding): the
    // one emission the erg produced carried interval 2's identity with
    // interval 1's averages, because 0x0038 was still one notification
    // behind. Identity AND averages must come from the same boundary.
    // `avgSplit` is now DERIVED by the fake from each boundary's OWN
    // elapsed/distance (500 * t / d, `derivedAvgSplit`, `transports/
    // fake.ts`) rather than an independently-scripted number — interval
    // 0's 60s/200m gives 150.0 exactly; interval 1's 60s/220m gives 136.4
    // (rounded to the wire's 0.1s resolution). Still distinct per boundary,
    // which is the property this test exists to pin.
    expect(boundaries[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, avgSpm: 20, avgHeartRateBpm: 130, avgSplit: 150 },
    });
    expect(boundaries[1]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 1, avgSpm: 30, avgHeartRateBpm: 170, avgSplit: 136.4 },
    });
  });

  it("an ORPHANED 0x0038 never pairs with the NEXT boundary's 0x0037 — the next boundary emits its own averages, and the orphan is logged, not merged", () => {
    // Task 4 review, IMPORTANT-1: pairing "one of each has arrived" is not
    // enough. Boundary A's 0x0038 arrives, A's 0x0037 is LOST, and B's
    // 0x0037 arrives next — a driver that pairs by arrival emits B's
    // identity carrying A's averages, which is D4's corruption surviving in
    // a narrower form. Driven through `stubTransport` because the fake only
    // ever sends complete, correctly-ordered pairs.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    // Boundary A: only its averages arrive (avgSpm 20). Its 0x0037 is lost.
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 20));
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(0);

    // Boundary B's identity: 120s/200m, Split/Interval Number 2. This must
    // NOT emit — the only averages in `raw` belong to A.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(2, 120, 200));
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(0);
    expect(
      log.entries().filter((e) => e.kind === "boundary-orphan"),
    ).toHaveLength(1);
    expect(log.entries().at(-1)?.detail).toContain("0x0038");
    expect(log.entries().at(-1)?.detail).toContain("Number 1");

    // B's own averages (avgSpm 30) complete B, and B emits with ITS pair.
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(2, 30));
    const emitted = events.filter((e) => e.kind === "intervalComplete");
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { elapsedSeconds: 120, distanceMeters: 200, avgSpm: 30 },
    });
    // A is simply gone — its data genuinely was. One actual lost beats one
    // actual fabricated, and the log says which happened.
    expect(
      log.entries().filter((e) => e.kind === "boundary-orphan"),
    ).toHaveLength(1);
  });

  it("the same characteristic reporting twice in a row orphans the first — the partner it was waiting for was the lost one", () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 20));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(2, 30));
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(0);
    expect(
      log.entries().filter((e) => e.kind === "boundary-orphan"),
    ).toHaveLength(1);

    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(2, 120, 200));
    const emitted = events.filter((e) => e.kind === "intervalComplete");
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { avgSpm: 30 },
    });
  });

  it("the mirror case — an orphaned 0x0037 is discarded just the same (the gate has no preferred half)", () => {
    // The observed order is 0x0037 first, so this is the LESS likely loss —
    // but the gate is symmetric on purpose: the arrival order is firmware
    // behaviour, not a documented guarantee.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 100));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(2, 30));
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(0);
    const orphans = log.entries().filter((e) => e.kind === "boundary-orphan");
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.detail).toContain("0x0037");
    expect(orphans[0]!.detail).toContain("Number 1");

    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(2, 120, 200));
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(1);
  });

  it("a REPEATED half of the boundary still pending is not an orphan — the same notification twice changes nothing", () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(3, 60, 100));
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(3, 60, 100));
    expect(log.entries().some((e) => e.kind === "boundary-orphan")).toBe(false);

    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(3, 25));
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(1);
  });
});

// D1 IS WITHDRAWN (interface-notes.md §19.2, on Task 1's per-send
// re-derivation table in §19.1). This block used to pin the opposite of
// what it pins now: that programming over a loaded workout was REJECTED and
// DESTROYED what the monitor held. Both halves were our own parse bug —
// every byte §18 recorded as a rejection decodes to an accept, and the
// "wipe" was the mechanism invented to explain the toggle's alternation.
// §19.1's Verdict (b) then settled the positive claim behaviourally,
// corrected in the whole-branch fix wave: a rest-0 program landed over
// whatever a rest-30 send and a reconnect had left loaded, and produced a
// work→work row with no `resting` state anywhere — the second program
// replaced the first. The clean single-connection observation (no
// reconnect between the two sends) is still pending, §17's merge-gate row,
// session 3, Step 3.
describe("createPm5Driver: programming over a loaded workout ACCEPTS and REPLACES (D1 withdrawn, interface-notes.md §19.2)", () => {
  it("lands over a workout the rower already had, and what the monitor holds is the NEW program (today: rejected, and the old one destroyed)", async () => {
    const { fake, driver, events, log } = harness({
      program: MINIMAL_PROGRAM,
      // A workout the rower had already set up on the monitor.
      loadedWorkout: { intervalCount: 4 },
    });
    expect(fake.loadedIntervals()).toBe(4);

    await programAndArm(driver, fake, MINIMAL_PROGRAM);

    // Replaced, not wiped and not left alone: the machine holds exactly the
    // program that was just sent.
    expect(fake.loadedIntervals()).toBe(MINIMAL_PROGRAM.intervals.length);
    expect(events.filter((e) => e.kind === "armed")).toHaveLength(1);
    expect(log.entries().some((e) => e.kind === "armed")).toBe(true);
    expect(log.entries().some((e) => e.kind === "program-rejection")).toBe(
      false,
    );
  });

  it("the prepare step is ACCEPTED while a workout is loaded (no 'prepare-rejected'), and the program that follows still lands", async () => {
    const { fake, driver, log } = harness({
      program: MINIMAL_PROGRAM,
      loadedWorkout: { intervalCount: 2 },
    });

    await programAndArm(driver, fake, MINIMAL_PROGRAM);

    // §19.1's `S2 D2`/`S2 D3` rows: terminate acked "ok" with a workout
    // loaded — raw captured bytes, `f1 01 76 01 13 65 f2` /
    // `f1 81 76 01 13 e5 f2`. This is the LOADED half of the accept, and
    // it is a different byte source from item 15's empty-machine capture
    // that the sibling removal test rests on — two independent
    // observations of the same behaviour, which is why both tests stay.
    //
    // The old "unlike every clean-state program() in this file, which
    // meets the nothing-loaded refusal instead" contrast is GONE with the
    // refusal itself (fix-3 Task 3, review IMPORTANT-3); what this test
    // still holds on its own is the `loadedWorkout` fixture's behaviour
    // below — the prepare does NOT clear (§19.5: it routes to Rearm), and
    // the program that follows REPLACES the two-interval workout the
    // machine was holding.
    expect(log.entries().some((e) => e.kind === "prepare-rejected")).toBe(
      false,
    );
    expect(log.entries().some((e) => e.kind === "prepare-sent")).toBe(true);
    expect(log.entries().some((e) => e.kind === "program-rejection")).toBe(
      false,
    );
    expect(log.entries().some((e) => e.kind === "programmed")).toBe(true);
    expect(fake.loadedIntervals()).toBe(MINIMAL_PROGRAM.intervals.length);
  });
});

// Task 4 review's CARRIED OBLIGATION, discharged here: Task 4 proved a
// second workout in one driver lifetime only through a hand-rolled stub,
// because the fake modelled one program per connection and threw
// "unexpected write while armed" on the second send. The fake now models
// the loop the machine actually runs (interface-notes.md §19.4/§19.5:
// terminate is the documented exit back to a programmable state), so the
// regression §19.4 punished — the driver going deaf after a finished piece
// — is now pinned END TO END over real CSAFE bytes.
describe("createPm5Driver: a SECOND workout over the same fake, no reconnect (interface-notes.md §19.4)", () => {
  it("two coherent runs: the second run's actuals are numbered from 0 again (today: the fake's single-program model throws)", async () => {
    const program = seaFretProgram();
    // Sea Fret's interval 0 is the 300s easy opener, restSeconds 0 — so its
    // boundary is legitimately delivered while the machine still reads
    // `rowing` (a trailing rest would require a `resting` tick first,
    // `boundaryBundle`'s own enforced rule).
    const rowingTick = (
      atMs: number,
      programIntervalIndex: number,
      elapsedSeconds: number,
      distanceMeters: number,
    ): FakeTimelineEvent => ({
      atMs,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds,
      distanceMeters,
      spm: 24,
      currentSplit: 110,
      heartRateBpm: null,
      programIntervalIndex,
    });
    const firstBoundary = (atMs: number): FakeTimelineEvent => ({
      atMs,
      kind: "boundary",
      actual: {
        index: 0,
        elapsedSeconds: 300,
        distanceMeters: 1200,
        avgSpm: 22,
        avgHeartRateBpm: null,
        restDistanceMeters: 0,
      },
      cumulativeElapsedSeconds: 300,
      cumulativeDistanceMeters: 1200,
    });

    const { fake, driver, events, log } = harness({
      program,
      events: [
        // Run 1: row the opener out, complete it, then finish the piece.
        rowingTick(1000, 0, 100, 400),
        firstBoundary(2000),
        rowingTick(3000, 1, 320, 1300),
        {
          atMs: 4000,
          kind: "status",
          workoutState: WORKOUTSTATE_WORKOUTEND,
          elapsedSeconds: 900,
          distanceMeters: 3400,
          spm: 0,
          currentSplit: 0,
          heartRateBpm: null,
          programIntervalIndex: 2,
        },
        // Run 2, on the same connection: the same piece, rowed again.
        rowingTick(6000, 0, 100, 400),
        firstBoundary(7000),
      ],
    });

    /** The first ROWING frame emitted after `from` — a run's own opening
     *  reading, past the WAITTOBEGIN frame `program()` arms on. */
    const firstRowingFrameAfter = (from: number): MonitorFrame | undefined => {
      for (const e of events.slice(from)) {
        if (e.kind === "frame" && e.frame.state === "rowing") return e.frame;
      }
      return undefined;
    };

    await programAndArm(driver, fake, program);
    const run1Start = events.length;
    fake.tick(4000);
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(1);

    // Run 1's opening reading, as the baseline run 2 has to match: 100
    // seconds into Sea Fret's 300s opener, 200 to go.
    expect(firstRowingFrameAfter(run1Start)?.intervalRemaining).toStrictEqual({
      kind: "time",
      value: 200,
    });
    const run1Actual = events.find((e) => e.kind === "intervalComplete");

    // No reconnect, no new transport, no new driver — just another
    // program() on the machine that has just finished a piece.
    await programAndArm(driver, fake, program);
    const run2Start = events.length;
    fake.tick(3000);

    expect(events.filter((e) => e.kind === "armed")).toHaveLength(2);
    expect(log.entries().filter((e) => e.kind === "programmed")).toHaveLength(
      2,
    );

    // Review MED-2 (historical — MINOR-4, Task 6 fix round): run 2 must
    // not inherit run 1's SESSION bookkeeping. AT THE TIME this test was
    // written, `computeRemainingForFrame` subtracted 0x0033's Last Split
    // Time/Distance — "where the interval currently running began",
    // session-cumulative — from 0x0031's own elapsed, so a checkpoint left
    // standing at run 1's final boundary (300s/1200m) made run 2's very
    // first frame report `{kind:"time", value:500}`: 500 seconds remaining
    // of a 300-second interval, from progress computed as 100 - 300 = -200.
    // Task 6 (interface-notes.md §20 items 17/24) deleted that subtraction
    // entirely — `intervalRemaining` now reads 0x0031's own per-interval
    // pair directly, with no checkpoint of any kind to inherit wrongly.
    // This assertion stays a genuine regression guard regardless: it is at
    // interval index 0 (both runs' own opening tick), where the checkpoint
    // was always 0 even before Task 6, so nothing here moved — but the
    // ORIGINAL defect this test pins (run 2 silently carrying run 1's
    // internal state) still has a live analogue: `fake.ts`'s own
    // `lastBoundaryCumulative`/`wireLastSplit` reset on re-arm, which
    // `fake.test.ts`'s dedicated re-arm test (Task 6) now pins directly at
    // the fake level, self-mutation included. The number below is the same
    // one run 1 reported from the identical tick.
    expect(firstRowingFrameAfter(run2Start)?.intervalRemaining).toStrictEqual({
      kind: "time",
      value: 200,
    });

    // Both runs number their first actual 0 — the second run does not carry
    // the first one's numbering forward, and neither is `null`.
    const completions = events.filter((e) => e.kind === "intervalComplete");
    expect(
      completions.map(
        (e) => (e as { actual: { index: number | null } }).actual.index,
      ),
    ).toStrictEqual([0, 0]);
    // And run 1's own record is exactly what it was when it was emitted,
    // with run 2's standing beside it on its own values — two runs, two
    // records, no cross-contamination in either direction.
    expect(completions).toHaveLength(2);
    expect(completions[0]).toStrictEqual(run1Actual);
    expect(completions[1]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, elapsedSeconds: 300, distanceMeters: 1200 },
    });

    // Nothing was left open or silently replaced, and the link never moved.
    expect(log.entries().some((e) => e.kind === "run-replaced")).toBe(false);
    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(0);
    // The machine holds the program it was last given, both times.
    expect(fake.loadedIntervals()).toBe(program.intervals.length);
  });

  it("a reconnect early in run 2 does not resurrect run 1's last boundary (the fake's cached half goes with the old program)", async () => {
    // The other half of review MED-2's state leak. `completeReconnect()`
    // flushes the fake's CACHED boundary — "the machine's next status frame
    // after the radio came back". Cached across a program, that is run 1's
    // final boundary arriving inside run 2 as if it had just happened: an
    // extra `intervalComplete` carrying the previous workout's numbers,
    // attributed to the new run.
    const program = seaFretProgram();
    const { fake, driver, events } = harness({
      program,
      events: [
        {
          atMs: 1000,
          kind: "status",
          workoutState: WORKOUTSTATE_INTERVALWORKTIME,
          elapsedSeconds: 100,
          distanceMeters: 400,
          spm: 24,
          currentSplit: 110,
          heartRateBpm: null,
          programIntervalIndex: 0,
        },
        {
          atMs: 2000,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: 300,
            distanceMeters: 1200,
            avgSpm: 22,
            avgHeartRateBpm: null,
            restDistanceMeters: 0,
          },
          cumulativeElapsedSeconds: 300,
          cumulativeDistanceMeters: 1200,
        },
        {
          atMs: 3000,
          kind: "status",
          workoutState: WORKOUTSTATE_WORKOUTEND,
          elapsedSeconds: 900,
          distanceMeters: 3400,
          spm: 0,
          currentSplit: 0,
          heartRateBpm: null,
          programIntervalIndex: 2,
        },
      ],
    });

    await programAndArm(driver, fake, program);
    fake.tick(3000);
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(1);

    await programAndArm(driver, fake, program);
    fake.injectDisconnect();
    fake.completeReconnect();

    // Run 2 has completed no interval. Run 1's boundary belongs to run 1.
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(1);
  });
});

// SYNTHETIC failure paths (`FakeScript.failNextProgramFrame`) — never observed on
// hardware, and the fake says so at the field's own definition
// (interface-notes.md §19.1: not one of the twelve captured status bytes is
// a rejection, and nothing ever arrived unparseable). They exist because
// the driver has distinct code for each, and Task 3 built that code against
// a hand-rolled stub for want of any way to make the shared fake produce
// either byte.
describe("createPm5Driver: the fake's synthetic reject/garbled paths, driven end to end", () => {
  it("failNextProgramFrame 'reject' → reason 'nak' AND the documented GetErrorType follow-up in the trace (today: no such hook)", async () => {
    const { fake, driver, log } = harness({
      program: MINIMAL_PROGRAM,
      failNextProgramFrame: "reject",
    });

    const rejection = await driver.program(MINIMAL_PROGRAM).catch((e) => e);

    expect(rejection).toBeInstanceOf(ProgramRejectionError);
    expect(rejection).toMatchObject({ reason: "nak", atFrame: 0 });
    expect((rejection as ProgramRejectionError).hexTrace).toContain(
      "ack frameStatus=reject",
    );
    // CSAFE-DEF p.50 (interface-notes.md §19.7): a reject is not
    // self-describing, so the driver asks. The fake absorbs the 0xC8 write
    // and answers it, so the reply is a real logged frame, not a timeout.
    const errorType = log.entries().filter((e) => e.kind === "error-type");
    expect(errorType).toHaveLength(1);
    expect(errorType[0]!.detail).not.toContain("no reply");
    // One-shot: the hook fired once and is spent.
    expect(fake.loadedIntervals()).toBeNull();
  });

  it("failNextProgramFrame 'garbled' → reason 'garbled', NOT 'nak', and no GetErrorType is sent (today: no such hook)", async () => {
    const { fake, driver, log } = harness({
      program: MINIMAL_PROGRAM,
      failNextProgramFrame: "garbled",
    });

    const rejection = await driver.program(MINIMAL_PROGRAM).catch((e) => e);

    expect(rejection).toBeInstanceOf(ProgramRejectionError);
    expect(rejection).toMatchObject({ reason: "garbled", atFrame: 0 });
    expect((rejection as ProgramRejectionError).hexTrace).toContain(
      "ack unparseable",
    );
    // The distinction Task 3 exists to keep: a frame we could not validate
    // is not the PM saying "reject", so the reject-only follow-up does not
    // fire.
    expect(log.entries().some((e) => e.kind === "error-type")).toBe(false);
    expect(fake.loadedIntervals()).toBeNull();
  });

  it("the one-shot is spent: a retry of the same program after a synthetic reject lands normally", async () => {
    const { fake, driver, events } = harness({
      program: MINIMAL_PROGRAM,
      failNextProgramFrame: "reject",
    });

    await expect(driver.program(MINIMAL_PROGRAM)).rejects.toBeInstanceOf(
      ProgramRejectionError,
    );
    await programAndArm(driver, fake, MINIMAL_PROGRAM);

    expect(events.filter((e) => e.kind === "armed")).toHaveLength(1);
    expect(fake.loadedIntervals()).toBe(MINIMAL_PROGRAM.intervals.length);
  });
});

describe("createPm5Driver: D6 — a write on a link that has gone down", () => {
  it("fails loudly with the invalidated-handle error instead of quietly succeeding", async () => {
    const { fake, driver } = harness({ program: MINIMAL_PROGRAM });
    await programAndArm(driver, fake, MINIMAL_PROGRAM);

    fake.injectDisconnect();

    // On the laptop this was Chrome refusing to use a characteristic
    // handle cached before the drop. A transport that hands the driver a
    // dead handle produces exactly this, and the driver must surface it
    // rather than report a write that never reached the radio.
    await expect(driver.terminate()).rejects.toThrow(/InvalidStateError/);
  });

  it("writes work again once the transport has re-established (the fake's stand-in for re-fetching its characteristics)", async () => {
    // settleTicks: 0 — this test's own focus is the reconnect/write path,
    // not the settle wait; see the "terminate() acks... LATCHES" test's
    // comment for why the fake can't supply the real default on its own.
    const { fake, driver } = harness(
      { program: MINIMAL_PROGRAM },
      { settleTicks: 0 },
    );
    await programAndArm(driver, fake, MINIMAL_PROGRAM);

    fake.injectDisconnect();
    fake.completeReconnect();

    await expect(driver.terminate()).resolves.toBeUndefined();
  });
});

describe("createPm5Driver: the log records frame STATE CHANGES, not every frame", () => {
  it("a 10-tick burst in one state yields exactly one 'frame' entry (the flood that evicted the programming trace)", async () => {
    // interface-notes.md §18: status notifications arrive ~2/second, so one
    // log entry per frame filled the 500-entry ring — and evicted the
    // write/ack trace the log exists for — inside about four minutes. A
    // trace that cannot survive a five-minute easy piece is not
    // observability.
    const timeline: FakeTimelineEvent[] = Array.from(
      { length: 10 },
      (_, i) => ({
        atMs: 100 * (i + 1),
        kind: "status" as const,
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 10 + i,
        distanceMeters: 40 + i * 4,
        spm: 22,
        currentSplit: 120,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      }),
    );
    const { fake, driver, events, log } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    const framesLoggedWhileArming = log
      .entries()
      .filter((e) => e.kind === "frame").length;

    for (let i = 0; i < 10; i += 1) fake.tick(100);

    // All ten frames still reach the CONSUMER — the live values belong to
    // the event, which every pane already reads. Only the log is thinned.
    expect(
      events.filter((e) => e.kind === "frame" && e.frame.state === "rowing"),
    ).toHaveLength(10);
    expect(
      log.entries().filter((e) => e.kind === "frame").length -
        framesLoggedWhileArming,
    ).toBe(1);
    expect(
      log
        .entries()
        .find((e) => e.kind === "frame" && e.detail.includes("state=rowing"))
        ?.detail,
    ).toContain("state=rowing");
  });
});

describe("createPm5Driver: Task 1 (fix-3) — the 'structure' log entry makes 0x0031's fields legible (interface-notes.md §17 item 12)", () => {
  /** Mirrors `driver.ts`'s own module-private `toHex` byte-for-byte — kept
   *  local rather than exported, the same choice `L3`'s own `hex` helper
   *  above already made for the same reason (no test-only export of an
   *  internal formatting detail). */
  function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
  }

  /** A full 0x0031 payload with the three structure fields under direct
   *  control — `generalStatusIn` above hardcodes them, so this task's tests
   *  need their own builder. Everything else is an arbitrary-but-valid
   *  filler value, matching `generalStatusIn`'s own choices. */
  function structureStatus(fields: {
    workoutType: number;
    workoutDurationRaw: number;
    workoutDurationType: number;
    workoutState?: number;
    elapsedSeconds?: number;
    distanceMeters?: number;
  }): Uint8Array {
    return buildGeneralStatusBytes({
      elapsedSeconds: fields.elapsedSeconds ?? 0,
      distanceMeters: fields.distanceMeters ?? 0,
      workoutType: fields.workoutType,
      intervalType: 0,
      workoutState: fields.workoutState ?? WORKOUTSTATE_INTERVALWORKTIME,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: fields.distanceMeters ?? 0,
      workoutDurationRaw: fields.workoutDurationRaw,
      workoutDurationType: fields.workoutDurationType,
      dragFactor: 130,
    });
  }

  it("a fresh 0x0031 notification yields a 'structure' entry carrying the decoded fields and the raw hex (today: no such kind exists)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    const bytes = structureStatus({
      workoutType: 8,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
    });
    transport.notify(GENERAL_STATUS_UUID, bytes);

    const entries = log.entries().filter((e) => e.kind === "structure");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toBe(
      `workoutType=8 durationRaw=6000 durationType=0 raw=${hex(bytes)}`,
    );
  });

  it("a 10-tick burst with unchanged structure yields exactly ONE entry (the flood pin — 0x0031 notifies ~2/second, exactly why the raw-hex 'notify' branch above already excludes it)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    for (let i = 0; i < 10; i += 1) {
      transport.notify(
        GENERAL_STATUS_UUID,
        structureStatus({
          workoutType: 8,
          workoutDurationRaw: 6000,
          workoutDurationType: 0,
          // Elapsed/distance change on EVERY tick, same as a real machine —
          // proving the change-gate compares the three DECODED fields, not
          // the raw bytes (which never repeat here).
          elapsedSeconds: i,
          distanceMeters: i * 4,
        }),
      );
    }

    expect(log.entries().filter((e) => e.kind === "structure")).toHaveLength(1);
  });

  it("a change in any one of the three fields yields a fresh entry", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    const base = {
      workoutType: 8,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
    };
    const typeChanged = { ...base, workoutType: 1 };
    const durationChanged = { ...typeChanged, workoutDurationRaw: 3000 };
    const durationTypeChanged = { ...durationChanged, workoutDurationType: 1 };
    const script = [base, typeChanged, durationChanged, durationTypeChanged];

    for (const fields of script) {
      transport.notify(GENERAL_STATUS_UUID, structureStatus(fields));
    }

    const entries = log.entries().filter((e) => e.kind === "structure");
    expect(entries.map((e) => e.detail)).toStrictEqual(
      script.map(
        (fields) =>
          `workoutType=${fields.workoutType} durationRaw=${fields.workoutDurationRaw} durationType=${fields.workoutDurationType} raw=${hex(structureStatus(fields))}`,
      ),
    );
  });

  it("interleaves correctly with the existing state-change 'frame' entries — a 'structure' entry logs BEFORE the 'frame' entry on a tick where both change (ordering pin)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    // Satisfy `maybeEmitFrame`'s `seen.general && seen.as1 && seen.as2` gate
    // once, up front — arbitrary-but-valid-length AS1/AS2 bytes, same as
    // the "rowing-state frame arriving before program()" test above.
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));

    const base = {
      workoutType: 8,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
    };
    // Tick 1: state null -> armed (a change) AND structure null -> base (a
    // change) — both entries fire on the SAME notification.
    transport.notify(
      GENERAL_STATUS_UUID,
      structureStatus({ ...base, workoutState: WORKOUTSTATE_WAITTOBEGIN }),
    );
    // Tick 2: state armed -> rowing (a change); structure unchanged.
    transport.notify(
      GENERAL_STATUS_UUID,
      structureStatus({ ...base, workoutState: WORKOUTSTATE_INTERVALWORKTIME }),
    );
    // Tick 3: state unchanged (still rowing); structure changes
    // (workoutType only).
    transport.notify(
      GENERAL_STATUS_UUID,
      structureStatus({
        ...base,
        workoutType: 1,
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      }),
    );
    // Tick 4: BOTH change again (rowing -> armed; durationRaw changes) —
    // the ordering pin repeats a second time.
    transport.notify(
      GENERAL_STATUS_UUID,
      structureStatus({
        ...base,
        workoutType: 1,
        workoutDurationRaw: 3000,
        workoutState: WORKOUTSTATE_WAITTOBEGIN,
      }),
    );

    const kinds = log
      .entries()
      .filter((e) => e.kind === "structure" || e.kind === "frame")
      .map((e) => e.kind);
    expect(kinds).toStrictEqual([
      "structure",
      "frame",
      "frame",
      "structure",
      "structure",
      "frame",
    ]);
  });

  // Briefing's realistic-fixture rule: at least one of this task's tests
  // starts from a real library workout via `fromWorkout`'s own assembly
  // (`seaFretProgram`, defined at the top of this file), not a hand-built
  // minimum — run through the fake's honest protocol rather than a stub.
  it("real fixture (Sea Fret): arming and rowing several ticks logs exactly one 'structure' entry — the fake's own 0x0031 structure fields never change across a session", async () => {
    const program = seaFretProgram();
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 120,
        distanceMeters: 400,
        spm: 20,
        currentSplit: 130,
        heartRateBpm: 130,
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 180,
        distanceMeters: 600,
        spm: 21,
        currentSplit: 128,
        heartRateBpm: 132,
        programIntervalIndex: 0,
      },
    ];
    const { fake, driver, log } = harness({ program, events: timeline });
    await programAndArm(driver, fake, program);
    fake.tick(100);
    fake.tick(100);

    // The arm tick itself is the FIRST 0x0031 this driver ever sees, so it
    // is a change from `null` — exactly one entry, never zero. Two more
    // ticks with a different elapsed/distance but the SAME
    // workoutType/durationRaw/durationType must add nothing further.
    //
    // Fix-3 Task 4 changed WHAT those three fields are, not how often they
    // are logged: the fake used to hardcode `8/0/0` on every tick, and now
    // reports the structure of the workout it is actually holding — Sea
    // Fret's interval 0 is the 300s opener, so `durationRaw=30000` at
    // duration type Time. Unchanged across the session, hence still one
    // entry.
    const entries = log.entries().filter((e) => e.kind === "structure");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toMatch(
      /^workoutType=8 durationRaw=30000 durationType=0 raw=([0-9a-f]{2} ){18}[0-9a-f]{2}$/,
    );
  });
});

describe("createPm5Driver: fix-3 Task 2 — prepareSettleTicks (armed+1 before the real send, design spec §1b)", () => {
  // Every test below drives a bare `stubTransport` by hand: they pin the
  // WAIT's own mechanics (which tick counts, which states release it, what
  // a disconnect mid-wait does), and that needs tick-by-tick control the
  // fake's honest protocol will not hand over. The END-TO-END pair — the
  // same program over a rowing FAKE, settle off vs settle on, where the
  // fake itself synthesizes the terminate → idle → armed cycle — is Task
  // 3's, further down this file ("fix-3 Task 3 — the settle and the empty
  // arm, end to end over the honest fake").

  function sentCount(transport: ReturnType<typeof stubTransport>): number {
    return transport.writes.filter(
      (w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID,
    ).length;
  }

  /** Delivers a General Status tick in the given state BEFORE `program()`
   *  is ever called, so the driver's persistent `raw` — the value
   *  `program()` snapshots as `stateAtPrepare` — already reflects it. */
  function primeState(
    transport: ReturnType<typeof stubTransport>,
    workoutState: number,
  ): void {
    transport.notify(GENERAL_STATUS_UUID, generalStatusIn(workoutState));
  }

  /** Drives `program()` through its prepare step's own ack and returns the
   *  still-pending `program()` promise — every test below starts from
   *  immediately after this, the exact point where `waitForPrepareSettle`
   *  registers (or skips) its wait. */
  // Returns `{ pending }` rather than the bare promise: an `async function`
  // that `return`s a thenable value has its OWN returned promise ADOPT that
  // thenable's state (plain JS semantics, not a TS quirk) — `await
  // driveThroughPrepareAck(...)` would then block until `program()` itself
  // resolved, defeating the entire point of handing the still-open promise
  // back for further manual tick-driving. Wrapping it in a plain object
  // sidesteps that adoption.
  async function driveThroughPrepareAck(
    transport: ReturnType<typeof stubTransport>,
    driver: ReturnType<typeof createPm5Driver>,
    p: WorkoutProgram,
  ): Promise<{ pending: Promise<void> }> {
    const start = sentCount(transport);
    const pending = driver.program(p);
    await waitUntil(() => sentCount(transport) > start);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    return { pending };
  }

  /** Drains enough microtask hops for a (possibly buggy) settle resolution
   *  to have actually scheduled `sendSequence`'s first write, if one was
   *  going to happen — resolving a Promise never synchronously resumes its
   *  awaiter. */
  async function flush(): Promise<void> {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  }

  /** Finishes a `program()` call already past its prepare-settle wait: the
   *  real send's own ack, then ONE fresh "armed" status for `verifyArmed`. */
  async function finishRealSend(
    transport: ReturnType<typeof stubTransport>,
    pending: Promise<void>,
  ): Promise<void> {
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await expect(pending).resolves.toBeUndefined();
  }

  it(
    "REPRO's confirmed trace (§18 session 3 Live bisect / design spec §1b: " +
      "'rowing → terminated → idle → armed', a ~0.85s PM-clock span) — waits " +
      "through terminated/idle and sends frames only after armed+1 (today: " +
      "frames go out immediately after the prepare ack)",
    async () => {
      const transport = stubTransport();
      const log = createEventLog();
      const driver = createPm5Driver(transport, log);

      primeState(transport, WORKOUTSTATE_INTERVALWORKTIME); // rowing, at prepare-send
      const { pending } = await driveThroughPrepareAck(
        transport,
        driver,
        MINIMAL_PROGRAM,
      );
      const afterPrepare = sentCount(transport);

      // The gate armed — `program()`'s captured `stateAtPrepare` was
      // "rowing", not a fresh notification.
      expect(
        log
          .entries()
          .some(
            (e) => e.kind === "prepare-settle" && e.detail.includes('"rowing"'),
          ),
      ).toBe(true);

      // Review finding I5/L2: the confirmed trace shape (design spec §1b,
      // cross-checked against the raw session-3 log) is a single
      // rowing→terminated→idle→armed transition — the event log records a
      // `frame` entry only on a state CHANGE, so a repeated `terminated`
      // reading could never surface as two entries even if the wire sent it
      // twice, and no tick COUNT is recoverable from a log with no
      // timestamps at all (only the ~0.85s PM-clock span is a real,
      // verified observation). This replay is therefore a DELIBERATELY
      // stricter reconstruction, not a literal quotation: a leading
      // still-"rowing" reading (representing the gap before the PM reacts
      // to our terminate), then "terminated" a SECOND time (one extra
      // non-armed tick beyond the confirmed shape, making this replay's
      // bound requirement strictly harder than the trace demands), then
      // "idle". No programming frame may go out at any point during this
      // replay.
      for (const workoutState of [
        WORKOUTSTATE_INTERVALWORKTIME, // rowing (reconstructed leading tick)
        WORKOUTSTATE_TERMINATE, // terminated
        WORKOUTSTATE_TERMINATE, // terminated again (extra tick, not itself an observation)
        WORKOUTSTATE_REARM, // idle
      ]) {
        transport.notify(GENERAL_STATUS_UUID, generalStatusIn(workoutState));
        await flush();
        expect(sentCount(transport)).toBe(afterPrepare);
      }

      // "armed" alone is NOT the end condition — one further tick is owed
      // (write-ordering assertion: no frame yet).
      transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
      await flush();
      expect(sentCount(transport)).toBe(afterPrepare);

      // The one further tick (any state) completes the wait — frames go
      // out now, not before.
      transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
      await waitUntil(() => sentCount(transport) > afterPrepare);
      expect(sentCount(transport)).toBeGreaterThan(afterPrepare);

      await finishRealSend(transport, pending);
    },
  );

  it("7A-fix-3 Task 2 review, parked minor #3: the 'prepare-settle' entry names its own configured tick bound, not just the prior state", async () => {
    // A custom, non-default bound (default is 10, DEFAULT_PREPARE_SETTLE_
    // TICKS) so the assertion below cannot pass by accident against
    // whatever the default happens to be.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { prepareSettleTicks: 7 });

    primeState(transport, WORKOUTSTATE_INTERVALWORKTIME);
    const { pending } = await driveThroughPrepareAck(
      transport,
      driver,
      MINIMAL_PROGRAM,
    );

    const entry = log
      .entries()
      .find(
        (e) => e.kind === "prepare-settle" && e.detail.includes('"rowing"'),
      );
    expect(entry).toBeDefined();
    expect(entry!.detail).toContain("7");

    transport.fireDisconnect("radio out of range");
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it(
    "step 5's confirmed trace (§18 session 3 Live bisect / design spec §1b: " +
      "'terminated → idle → armed', a ~0.06s PM-clock span) — waits through " +
      "terminated/idle and sends frames only after armed+1",
    async () => {
      const transport = stubTransport();
      const log = createEventLog();
      const driver = createPm5Driver(transport, log);

      primeState(transport, WORKOUTSTATE_INTERVALWORKTIME); // rowing, at prepare-send
      const { pending } = await driveThroughPrepareAck(
        transport,
        driver,
        MINIMAL_PROGRAM,
      );
      const afterPrepare = sentCount(transport);

      // Step 5's confirmed trace (design spec §1b) is the same
      // rowing→terminated→idle→armed shape as REPRO, over a much shorter
      // ~0.06s PM-clock span — no tick COUNT is recoverable from either
      // trace (review finding I5: the event log has no timestamps and logs
      // on state change only), so this replay does not claim a specific
      // number of ticks was observed. Same reconstruction choice as REPRO's
      // own replay above: a leading still-"rowing" reading (the gap before
      // the PM reacts to our terminate) is included for symmetry, not
      // because it was itself measured.
      for (const workoutState of [
        WORKOUTSTATE_INTERVALWORKTIME, // rowing (reconstructed leading tick)
        WORKOUTSTATE_TERMINATE, // terminated
        WORKOUTSTATE_REARM, // idle
      ]) {
        transport.notify(GENERAL_STATUS_UUID, generalStatusIn(workoutState));
        await flush();
        expect(sentCount(transport)).toBe(afterPrepare);
      }

      transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
      await flush();
      expect(sentCount(transport)).toBe(afterPrepare); // armed alone: not yet

      transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
      await waitUntil(() => sentCount(transport) > afterPrepare);
      expect(sentCount(transport)).toBeGreaterThan(afterPrepare);

      await finishRealSend(transport, pending);
    },
  );

  it("resting at prepare-send also arms the wait (the gate's other half)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    primeState(transport, WORKOUTSTATE_INTERVALREST); // resting
    const { pending } = await driveThroughPrepareAck(
      transport,
      driver,
      MINIMAL_PROGRAM,
    );
    const afterPrepare = sentCount(transport);

    expect(
      log
        .entries()
        .some(
          (e) => e.kind === "prepare-settle" && e.detail.includes('"resting"'),
        ),
    ).toBe(true);
    expect(sentCount(transport)).toBe(afterPrepare); // still waiting

    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await flush();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS); // +1
    await waitUntil(() => sentCount(transport) > afterPrepare);

    await finishRealSend(transport, pending);
  });

  it("the settle's own success path logs 'prepare-settled' with the ticks actually waited and the +1 tick's state (review finding I4 — the only mechanism able to measure this on hardware)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    primeState(transport, WORKOUTSTATE_INTERVALWORKTIME); // rowing
    const { pending } = await driveThroughPrepareAck(
      transport,
      driver,
      MINIMAL_PROGRAM,
    );

    // Two non-armed ticks, then "armed", then a distinctive +1 tick state
    // ("resting") so the logged detail is unambiguous about which tick it
    // names.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE),
    );
    transport.notify(GENERAL_STATUS_UUID, generalStatusIn(WORKOUTSTATE_REARM)); // idle
    await flush();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await flush();
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALREST), // resting — the +1 tick
    );
    await flush();

    // Two non-armed ticks (terminated, idle) then the tick that reports
    // "armed" itself — `ticks` counts that arrival too, landing on 3.
    const settled = log.entries().filter((e) => e.kind === "prepare-settled");
    expect(settled).toHaveLength(1);
    expect(settled[0]!.detail).toContain("tick 3");
    expect(settled[0]!.detail).toContain('"resting"');
    // No "prepare-settle-expired" — this is the SUCCESS path, not the gamble.
    expect(log.entries().some((e) => e.kind === "prepare-settle-expired")).toBe(
      false,
    );

    await finishRealSend(transport, pending);
  });

  it("expiry PROCEEDS (never rejects) and logs 'prepare-settle-expired' when the bound is hit with no 'armed' ever observed", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { prepareSettleTicks: 3 });

    primeState(transport, WORKOUTSTATE_INTERVALWORKTIME);
    const { pending } = await driveThroughPrepareAck(
      transport,
      driver,
      MINIMAL_PROGRAM,
    );
    const afterPrepare = sentCount(transport);

    // Exactly `prepareSettleTicks` (3) ticks, "armed" never observed —
    // session 3's own step 5 showed a 2Hz sampler CAN coalesce the whole
    // cycle, so this must proceed, not hang or reject.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE),
    );
    transport.notify(GENERAL_STATUS_UUID, generalStatusIn(WORKOUTSTATE_REARM));
    await waitUntil(() => sentCount(transport) > afterPrepare);

    expect(log.entries().some((e) => e.kind === "prepare-settle-expired")).toBe(
      true,
    );

    await finishRealSend(transport, pending);
  });

  it("expiry with 'armed' arriving ON the final budgeted tick does not contradict itself (whole-branch review M1, proven: the entry used to read 'no \"armed\" state observed (last state: armed)')", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { prepareSettleTicks: 3 });

    primeState(transport, WORKOUTSTATE_INTERVALWORKTIME);
    const { pending } = await driveThroughPrepareAck(
      transport,
      driver,
      MINIMAL_PROGRAM,
    );
    const afterPrepare = sentCount(transport);

    // Two non-armed ticks, then "armed" ITSELF on the third (final
    // budgeted) tick — the exact one-tick-early shape M1 proved: `ticks`
    // increments before this same arrival's own state is checked, so the
    // bound fires on the tick that FIRST reports "armed", one short of the
    // +1 grace `armedSeen` would otherwise earn on a LATER arrival.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE),
    );
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    await waitUntil(() => sentCount(transport) > afterPrepare);

    // Behaviour is unchanged: still expires and proceeds without
    // confirmation rather than granting the grace tick.
    const expired = log
      .entries()
      .filter((e) => e.kind === "prepare-settle-expired");
    expect(expired).toHaveLength(1);
    expect(sentCount(transport)).toBeGreaterThan(afterPrepare);
    // The instrument must not lie: it may never claim no "armed" state was
    // observed in the same entry that names the last state as "armed".
    expect(expired[0]!.detail).not.toMatch(/no "armed" state observed/);
    expect(expired[0]!.detail).toContain('"armed"');

    await finishRealSend(transport, pending);
  });

  it("prepareSettleTicks: 0 disables the wait entirely, even from a rowing state (session 4b's own detection row)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { prepareSettleTicks: 0 });

    primeState(transport, WORKOUTSTATE_INTERVALWORKTIME);
    const { pending } = await driveThroughPrepareAck(
      transport,
      driver,
      MINIMAL_PROGRAM,
    );

    // No wait was ever registered — the real send's frames already went
    // out, right after the prepare's own ack.
    expect(sentCount(transport)).toBeGreaterThan(prepareChunkCount);
    expect(log.entries().some((e) => e.kind === "prepare-settle")).toBe(false);
    expect(log.entries().some((e) => e.kind === "prepare-settle-expired")).toBe(
      false,
    );

    await finishRealSend(transport, pending);
  });

  it("latency pin: a main-menu-state program() (state 'armed' at prepare-send) consumes ZERO prepare-settle ticks — exactly today's sequence (prepare ack, send ack, ONE fresh armed tick)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log); // default prepareSettleTicks (10)

    primeState(transport, WORKOUTSTATE_WAITTOBEGIN); // armed — a settled, main-menu state

    // `programViaStub`'s own sequence, inlined rather than called (7A-fix-3
    // Task 2 review, parked minor #2): that helper ends in a bare
    // `await pending`, which — if the settle machinery ever consumed a
    // tick here, since this drives EXACTLY ONE fresh "armed" status and no
    // more — would simply HANG rather than fail with a message, so the
    // only signal a regression here ever produced was the test runner's
    // own generic timeout. Tracking `resolved` via `.then()` and asserting
    // it BEFORE ever awaiting `pending` turns that silent hang into a real,
    // fast, named assertion failure.
    const sent = (): number =>
      transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
        .length;
    const start = sent();
    let resolved = false;
    const pending = driver.program(MINIMAL_PROGRAM).then(() => {
      resolved = true;
    });
    await waitUntil(() => sent() > start);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(() => sent() > start + prepareChunkCount);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
    for (let i = 0; i < 50; i += 1) await Promise.resolve();

    expect(resolved).toBe(true);
    await pending;

    expect(log.entries().some((e) => e.kind === "prepare-settle")).toBe(false);
    expect(log.entries().some((e) => e.kind === "prepare-settle-expired")).toBe(
      false,
    );
  });

  it("a disconnect during the prepare-settle wait rejects with reason 'disconnected' — the identical failure the real send would produce, without ever sending the real programming frames", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    primeState(transport, WORKOUTSTATE_INTERVALWORKTIME);
    const { pending } = await driveThroughPrepareAck(
      transport,
      driver,
      MINIMAL_PROGRAM,
    );
    const afterPrepare = sentCount(transport);
    expect(log.entries().some((e) => e.kind === "prepare-settle")).toBe(true);

    transport.fireDisconnect("radio out of range");

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("disconnected");
      return true;
    });

    // The real programming frames were never written — the wait's own
    // rejection short-circuited `program()` before `sendSequence` ever ran
    // (NOT `pendingSettle`'s "resolve and proceed" shape — that would have
    // sent frames onto a link already known to be down).
    expect(sentCount(transport)).toBe(afterPrepare);
  });
});

describe("createPm5Driver: fix-3 Task 3 — the settle and the empty arm, end to end over the honest fake (design spec §1c, interface-notes.md §19.13)", () => {
  // Task 2 could only pin the settle against a hand-driven
  // `stubTransport`, because the fake's prepare step acked and changed
  // nothing. Now that it reacts the way the wire command actually makes
  // the machine react, these two tests run the SAME program over the SAME
  // rowing machine and differ only in whether the settle is on — which is
  // exactly the pair sessions 4a/4b take to the erg.

  function rowingAt(atMs: number, elapsedSeconds: number): FakeTimelineEvent {
    return {
      atMs,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds,
      distanceMeters: elapsedSeconds * 4,
      spm: 24,
      currentSplit: 120,
      heartRateBpm: 140,
      programIntervalIndex: 0,
    };
  }

  /** The machine going on reporting WaitToBegin at its own ~2Hz — the tick
   *  the settle's "armed AND one further tick" end condition needs after
   *  the auto-cycle has finished. */
  function stillArmedAt(atMs: number): FakeTimelineEvent {
    return {
      atMs,
      kind: "status",
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: 140,
      programIntervalIndex: 0,
    };
  }

  /** Sea Fret's interval 0 (a 300 s easy opener, no trailing rest) completing. */
  function boundaryAt(atMs: number): FakeTimelineEvent {
    return {
      atMs,
      kind: "boundary",
      actual: {
        index: 0,
        elapsedSeconds: 300,
        distanceMeters: 1100,
        avgSpm: 22,
        avgHeartRateBpm: 140,
        restDistanceMeters: 0,
      },
      cumulativeElapsedSeconds: 300,
      cumulativeDistanceMeters: 1100,
    };
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 100; i += 1) await Promise.resolve();
  }

  function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  /** A WaitToBegin tick carrying nothing — the shape this machine's own
   *  steady state holds while empty-armed (§19.13): fix-3 Task 5 makes the
   *  fake report SESSION 4a's captured anatomy (`workoutType=1
   *  durationRaw=0 durationType=128`) for every such tick, independent of
   *  whatever the driver actually sent, for as long as `armedEmpty` stays
   *  true. */
  function stillArmedEmpty(atMs: number): FakeTimelineEvent {
    return {
      atMs,
      kind: "status",
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: null,
      programIntervalIndex: 0,
    };
  }

  it("settle DISABLED (prepareSettleTicks: 0 — session 4b's own detection row): a program sent over a ROWING machine arms EMPTY, and fix-3 Task 5's honest wire gets it caught end to end, 'structure-mismatch'", async () => {
    const program = seaFretProgram();
    // Two more WaitToBegin ticks after the arm's own — the N=3 rule
    // (`STRUCTURE_MISMATCH_TICKS`, driver.ts) needs three CONSECUTIVE
    // stable mismatched ARMED ticks, and an empty-armed machine's own
    // steady state holds still exactly like this (session 4a's ledger:
    // "fields refresh while merely ARMED"). Walk 5 added the second half of
    // the rule: those three ticks must also SPAN the persistence window
    // (`STRUCTURE_MISMATCH_WINDOW_MS`), so this clock is advanced between
    // them — an empty arm is a machine that keeps saying the wrong thing,
    // not one caught mid-transition.
    const clock = manualClock();
    const { fake, driver, events } = harness(
      {
        program,
        events: [rowingAt(0, 10), stillArmedEmpty(1), stillArmedEmpty(2)],
      },
      { prepareSettleTicks: 0, now: clock.now },
    );

    fake.tick(0); // the machine is genuinely mid-piece at dispatch

    const pending = driver.program(program);
    for (let i = 0; i < 100; i += 1) await Promise.resolve();
    fake.tick(0); // flushes the empty arm's own WAITTOBEGIN bundle — mismatch #1
    await Promise.resolve();
    clock.advance(1200);
    fake.tick(1); // stillArmedEmpty(1) — mismatch #2, same wrong structure
    await Promise.resolve();
    clock.advance(1200); // 2400ms of the SAME wrong structure: past the window
    fake.tick(1); // stillArmedEmpty(2) — mismatch #3: the rule fires
    await Promise.resolve();

    const err = await pending.then(
      () => {
        throw new Error("program() resolved — the empty arm was not caught");
      },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProgramRejectionError);
    expect((err as ProgramRejectionError).reason).toBe("structure-mismatch");

    // …and the machine really is holding a workout with NOTHING in it —
    // `0`, not `null`: something IS loaded, it just has nothing in it. The
    // fake's own introspection agrees with what the wire just proved.
    expect(fake.loadedIntervals()).toBe(0);
    expect(events.some((e) => e.kind === "armed")).toBe(false);
  });

  it("settle ON (the default): the same program over the same rowing machine holds its frames until the machine reports armed — and the arm is real, boundaries and all", async () => {
    // NOT a strict A/B against the test above (review LOW-2): this fixture
    // carries one extra scripted status the settle-OFF one does not —
    // `stillArmedAt(1)`, the "+1 tick" the settle's end condition needs,
    // which the fake cannot produce on its own (no heartbeat model, see
    // `tick()`'s doc comment) — and it builds its transport by hand to get
    // the write spy. The PROGRAM and the machine's state at dispatch are
    // identical; the timelines are not.
    const program = seaFretProgram();
    const fake = createFakeTransport({
      program,
      events: [
        rowingAt(0, 10),
        stillArmedAt(1),
        rowingAt(1500, 20),
        boundaryAt(2000),
      ],
    });

    // One ordered trace of BOTH sides of the race this test exists to
    // decide: every status the machine reports, and the moment the first
    // programming chunk is written.
    const order: string[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (bytes) => {
      const decoded = parseGeneralStatus(bytes);
      if ("error" in decoded) throw new Error("unparseable fixture status");
      order.push(`state:${decoded.workoutState}`);
    });
    const firstProgramChunk = buildProgrammingSequence(program)[0]![0]!;
    const spy: Transport = {
      ...fake,
      async write(uuid: string, bytes: Uint8Array): Promise<void> {
        if (
          uuid === RECEIVE_CHARACTERISTIC_UUID &&
          sameBytes(bytes, firstProgramChunk)
        ) {
          order.push("programming-frames-out");
        }
        await fake.write(uuid, bytes);
      },
    };
    const log = createEventLog();
    const driver = createPm5Driver(spy, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    fake.tick(0); // rowing at dispatch — the settle's entry condition
    const pending = driver.program(program);
    await flush();

    // The prepare has gone out and the wait is registered: not one
    // programming byte has been written.
    expect(order).toStrictEqual([`state:${WORKOUTSTATE_INTERVALWORKTIME}`]);
    expect(log.entries().some((e) => e.kind === "prepare-settle")).toBe(true);

    // The machine's own reaction, one status tick at a time…
    for (let i = 0; i < 3; i += 1) {
      fake.tick(0);
      await flush();
    }
    expect(order).toStrictEqual([
      `state:${WORKOUTSTATE_INTERVALWORKTIME}`,
      `state:${WORKOUTSTATE_TERMINATE}`,
      `state:${WORKOUTSTATE_REARM}`,
      `state:${WORKOUTSTATE_WAITTOBEGIN}`,
    ]);

    // …and the one further tick the settle holds out for before releasing.
    fake.tick(1);
    await flush();

    // THE ORDERING: every programming frame went out after the machine had
    // finished changing its mind. Without the settle (the test above) this
    // marker sits between the rowing tick and the terminate one.
    expect(order.indexOf("programming-frames-out")).toBe(5);
    expect(order.indexOf(`state:${WORKOUTSTATE_WAITTOBEGIN}`)).toBeLessThan(
      order.indexOf("programming-frames-out"),
    );
    expect(
      log
        .entries()
        .some(
          (e) => e.kind === "prepare-settled" && e.detail.includes("tick 3"),
        ),
    ).toBe(true);

    fake.tick(0); // the armed bundle the real send produced
    await expect(pending).resolves.toBeUndefined();

    // The arm is REAL: the whole program is loaded, and rowing it produces
    // the boundary the empty arm never could.
    expect(fake.loadedIntervals()).toBe(program.intervals.length);
    expect(events.some((e) => e.kind === "armed")).toBe(true);
    fake.tick(2000);
    expect(events.some((e) => e.kind === "intervalComplete")).toBe(true);
  });

  it("fix-3 Task 5: FakeScript.lagStructureOneTick exercises the driver's N=3 rule against the FAKE's OWN wire — not only stubTransport (SESSION 4a's recorded mid-cycle transients)", async () => {
    // The machine is idle at dispatch (no rowing scripted), so
    // `waitForPrepareSettle` resolves immediately (its own doc comment:
    // only a prior "rowing"/"resting" state waits) and this program lands
    // as a genuine, non-empty arm — this test is about the LAG, not the
    // empty arm.
    const program = seaFretProgram();
    // `stillArmedEmpty` (not a separately-named `stillArmedAtZero`, deduped
    // per ROADMAP CL item 8's own item 1: the two were byte-for-byte
    // identical — same WaitToBegin/null-heart-rate shape, just declared
    // twice in this same describe block) — the "machine going on reporting
    // armed" shape `stillArmedAt` above uses, without that name's own
    // non-zero heart rate (irrelevant here).
    const { fake, log, driver } = harness({
      program,
      lagStructureOneTick: true,
      events: [stillArmedEmpty(1)],
    });

    const pending = driver.program(program);
    for (let i = 0; i < 100; i += 1) await Promise.resolve();
    // The accept's own WAITTOBEGIN bundle — LAGGED: SESSION 4a's pre-arm
    // baseline (`workoutType=0`), mismatched against Sea Fret's real
    // structure (`workoutType=8 durationRaw=30000 durationType=0`). One
    // tick is the observed lag, never a reject on its own.
    fake.tick(0);
    await Promise.resolve();

    // The scripted second WaitToBegin tick — the lag is spent, so this one
    // carries the TRUE structure and resolves `program()` immediately (a
    // MATCH needs no streak at all, only a mismatch does).
    fake.tick(1);
    await expect(pending).resolves.toBeUndefined();

    // The lag was SEEN and recorded once — observation, not verdict — and
    // then survived, exactly like `driver.test.ts`'s stub-driven sibling
    // ("the 1-tick payload LAG resolves SUCCESS", fix-3 Task 4's own
    // block). No `program-rejection` entry exists anywhere in this trace.
    expect(
      log.entries().filter((e) => e.kind === "structure-mismatch"),
    ).toHaveLength(1);
    expect(log.entries().some((e) => e.kind === "program-rejection")).toBe(
      false,
    );
  });
});

describe("createPm5Driver: D5 — the beltless heart rate never reaches a consumer as a number", () => {
  it("both the live frame and the interval's own average read null, from a wire that carried 0", async () => {
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 30,
        distanceMeters: 100,
        spm: 22,
        currentSplit: 120,
        heartRateBpm: null, // no belt: the fake sends the byte 0
        programIntervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 65,
        distanceMeters: 200,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        programIntervalIndex: 0,
      },
      {
        atMs: 300,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSpm: 22,
          // The exact field the machine sent `0` on (§18's new-defect note).
          avgHeartRateBpm: null,
          restDistanceMeters: 0,
        },
        cumulativeElapsedSeconds: 90,
        cumulativeDistanceMeters: 200,
      },
    ];
    const { fake, driver, events } = harness({
      program: THREE_INTERVAL_PROGRAM,
      events: timeline,
    });
    await programAndArm(driver, fake, THREE_INTERVAL_PROGRAM);
    for (let i = 0; i < 3; i += 1) fake.tick(100);

    const rowing = events.find(
      (e) => e.kind === "frame" && e.frame.state === "rowing",
    );
    expect(rowing).toMatchObject({ frame: { heartRateBpm: null } });
    // `IntervalActual.avgHeartRateBpm` is what a 7C log screen would write
    // down. "0 bpm" is not a reading a session can produce.
    expect(events.find((e) => e.kind === "intervalComplete")).toMatchObject({
      kind: "intervalComplete",
      actual: { avgHeartRateBpm: null },
    });
  });
});

describe("createPm5Driver: fix-3 Task 4 — armed means armed WITH the workout we sent (the structural readback; §17 item 12 ANSWERED by SESSION 4a)", () => {
  /**
   * SESSION 4a's captured EMPTY ARM, verbatim (2026-08-07, PM5 432331249;
   * settle-off, `program-short` over a running two-time piece, the monitor
   * showing `:00`, the driver reporting acked-armed): **steady state
   * `workoutType=1 durationRaw=0 durationType=128`.** Both halves of the I7
   * hypothesis confirmed on the wire — the duration reads 0 AND the type
   * degrades from 8 to 1. This is the anatomy Stage 2 exists to catch.
   */
  const EMPTY_ARM: ArmedStructureFixture = {
    workoutType: 1,
    workoutDurationRaw: 0,
    workoutDurationType: 128,
  };

  /** SESSION 4a's other captured wrong shape: a MID-CYCLE TRANSIENT —
   *  `type=1` carrying stale (non-zero) durations, seen while the machine
   *  was still working through its own cycle. A second reason single-tick
   *  rejection is wrong, and the reason the N-consecutive rule counts
   *  STABLE ticks rather than merely mismatched ones. */
  const MID_CYCLE_TRANSIENT: ArmedStructureFixture = {
    workoutType: 1,
    workoutDurationRaw: 3000,
    workoutDurationType: 0,
  };

  /** SESSION 4a's DISTANCE row's own shape (3×500m r60): `type=8
   *  durationRaw=500 durationType=128` — whole metres read-side, i.e.
   *  read/write symmetric, now observed rather than assumed. */
  const DISTANCE_PROGRAM: WorkoutProgram = {
    intervals: Array.from({ length: 3 }, () => ({
      type: "work" as const,
      kind: "distance" as const,
      value: 500,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 60,
    })),
  };

  /** SESSION 4a's REST-0 row (2×60s r0) — the shape that proved
   *  `workoutType` does NOT normalize to a rest-less sibling ordinal. */
  const REST_ZERO_PROGRAM: WorkoutProgram = {
    intervals: Array.from({ length: 2 }, () => ({
      type: "work" as const,
      kind: "time" as const,
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 0,
    })),
  };

  async function drain(hops = 30): Promise<void> {
    for (let i = 0; i < hops; i += 1) await Promise.resolve();
  }

  /**
   * Drives `program()` up to — and no further than — the point where
   * `verifyArmed` has registered its tick counter: the prepare step's ack,
   * then every programming frame's own `"ok"` ack, then a generous
   * microtask drain. Each test below then feeds exactly the 0x0031 ticks it
   * wants and asserts on WHEN (and how) the returned promise settles.
   *
   * The outcome is tracked through a mutable record rather than returned as
   * a bare promise on purpose: every "must fail today" assertion in this
   * block is about a promise NOT having settled yet, which cannot be
   * written as `await expect(...)` without hanging the run on today's code
   * instead of failing it.
   */
  async function driveToVerify(
    driver: ReturnType<typeof createPm5Driver>,
    transport: ReturnType<typeof stubTransport>,
    p: WorkoutProgram,
  ): Promise<{
    pending: Promise<void>;
    outcome: { settled: boolean; error: unknown };
  }> {
    const sent = (): number =>
      transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
        .length;
    const pending = driver.program(p);
    const outcome: { settled: boolean; error: unknown } = {
      settled: false,
      error: null,
    };
    void pending.then(
      () => {
        outcome.settled = true;
      },
      (err: unknown) => {
        outcome.settled = true;
        outcome.error = err;
      },
    );
    // The prepare step's own ack (accepted — §18 s3 item 15's captured
    // byte), then one ack per programming frame.
    await waitUntil(() => sent() > 0);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    const frameCount = buildProgrammingSequence(p).length;
    for (let frame = 0; frame < frameCount; frame += 1) {
      await drain(50);
      transport.notify(
        TRANSMIT_CHARACTERISTIC_UUID,
        buildAckFrame({ frameStatus: "ok" }),
      );
    }
    await drain(50);
    return { pending, outcome };
  }

  function rejection(outcome: { error: unknown }): ProgramRejectionError {
    expect(outcome.error).toBeInstanceOf(ProgramRejectionError);
    return outcome.error as ProgramRejectionError;
  }

  /** A successful `program()` must leave NO rejection in the trace. */
  function rejectionsLogged(log: ReturnType<typeof createEventLog>): number {
    return log.entries().filter((e) => e.kind === "program-rejection").length;
  }

  /** How many `"structure-mismatch"` entries this verify phase produced —
   *  at most ONE, by the first-sighting rule, whatever the tick count. A
   *  LAGGING arm legitimately produces one and still succeeds: the entry
   *  is the observation, not the verdict. */
  function structureEntries(log: ReturnType<typeof createEventLog>): number {
    return log.entries().filter((e) => e.kind === "structure-mismatch").length;
  }

  it("the CAPTURED empty arm (type=1, durationRaw=0, durationType=128) rejects 'structure-mismatch' inside the bound — never the false success hardware has now produced three times", async () => {
    // TODAY: the very first armed tick resolves `program()` successfully —
    // `verifyArmed` asks only `state === "armed"`. The `outcome.settled`
    // assertion below therefore FAILS ON AN ASSERTION (not a timeout) on
    // today's code, which is the point of tracking settlement by flag.
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 20,
      now: clock.now,
    });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    const empty = statusWithStructure(EMPTY_ARM);
    transport.notify(GENERAL_STATUS_UUID, empty);
    await drain();
    expect(outcome.settled).toBe(false); // one tick is the OBSERVED lag — never a reject
    // The wrong structure is still there 2.4 s later — past the walk-5
    // persistence window, so this is a machine holding a workout, not one
    // mid-transition. The STREAK is what is still missing.
    clock.advance(2400);
    transport.notify(GENERAL_STATUS_UUID, empty);
    await drain();
    expect(outcome.settled).toBe(false); // two is still not evidence

    transport.notify(GENERAL_STATUS_UUID, empty); // the third CONSECUTIVE, STABLE mismatch
    await drain();
    expect(outcome.settled).toBe(true);

    const err = rejection(outcome);
    expect(err.reason).toBe("structure-mismatch");
    expect(err.atFrame).toBe(-1);
    // Well inside the 20-tick outer bound: the N-consecutive rule fired,
    // not the timeout.
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "program-rejection" &&
            e.detail.includes("structure-mismatch"),
        ),
    ).toBe(true);
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("the 1-tick payload LAG resolves SUCCESS — the first armed tick carrying the PREVIOUS program's payload must never reject (session 4a's recorded mid-cycle transients)", async () => {
    // The shape a settling machine produces. Session 4a RECORDED mid-cycle
    // transients between the accept and the steady state, and measured
    // `"armed" observed on tick 4` twice — so a first armed tick that does
    // not yet describe the new program is a normal reading, and rejecting
    // on it would fail healthy programs.
    //
    // NOT cited to "2 of session 3's 5 clean arms" (review I-1): that
    // figure is asserted by the fix-3 plan and this task's brief but has no
    // source in this repo, and session 3 predates the first log able to
    // record a 0x0031 payload at all. `STRUCTURE_MISMATCH_TICKS`'s own doc
    // comment carries the full provenance; 4b confirms or retires it.
    //
    // Written FIRST against a naive first-armed-tick-reject implementation,
    // where it fails with reason "structure-mismatch" instead of resolving
    // (see the task report's mutation table).
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { verifyTicks: 20 });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      DISTANCE_PROGRAM,
    );

    // Tick 1: the PRIOR program's payload — session 4a's TIME row
    // (2×60s r30 -> 6000, duration type Time), still sitting in 0x0031.
    transport.notify(
      GENERAL_STATUS_UUID,
      statusWithStructure({
        workoutType: 8,
        workoutDurationRaw: 6000,
        workoutDurationType: 0,
      }),
    );
    await drain();
    expect(outcome.settled).toBe(false);

    // Tick 2: the payload catches up — 500 whole metres, duration type
    // Distance (session 4a's DISTANCE row).
    transport.notify(GENERAL_STATUS_UUID, armedStatusFor(DISTANCE_PROGRAM));
    await expect(pending).resolves.toBeUndefined();
    expect(rejectionsLogged(log)).toBe(0);
    // The lag was SEEN and recorded — one first-sighting entry — and then
    // survived. Observation, not verdict: a trace that stayed silent here
    // would hide the very phenomenon the N-consecutive rule exists for.
    expect(structureEntries(log)).toBe(1);
  });

  it("verifyTicks OMITTED is BOUNDED at 30 — under a structure predicate an unbounded verify turns a wrong success into an infinite hang", async () => {
    // TODAY: `options.verifyTicks === undefined` means NO bound at all, so
    // this never-arming stub leaves `program()` pending forever. Both
    // assertions below are settlement-flag assertions, so today's code
    // fails the `expect(outcome.settled).toBe(true)` line rather than
    // hanging the suite.
    //
    // The number is 30 since fix round 1 (review I-1), and it is 30 because
    // of `STRUCTURE_MISMATCH_WINDOW_MS`, not because of anything about this
    // bound: at 20 it fired at 1800 ms on iOS's fastest observed cadence and
    // pre-empted the 2000 ms window entirely (both constants' doc comments
    // carry the arithmetic). The BOUND itself is still ticks and only ticks,
    // which is what this test is about.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log); // NO verifyTicks
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    const stuck = generalStatusIn(WORKOUTSTATE_REARM);
    for (let i = 0; i < 29; i += 1)
      transport.notify(GENERAL_STATUS_UUID, stuck);
    await drain();
    expect(outcome.settled).toBe(false); // 29 ticks: still inside the default

    transport.notify(GENERAL_STATUS_UUID, stuck); // the 30th
    await drain();
    expect(outcome.settled).toBe(true);
    // Never armed at all, so the reason stays "not-observed" — a machine
    // that never reached WaitToBegin has not told us anything about
    // STRUCTURE, and must not be reported as if it had.
    expect(rejection(outcome).reason).toBe("not-observed");
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("the 3-consecutive counter RESETS on a tick that is not a mismatched armed tick — the streak must be CONSECUTIVE, not cumulative", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    // A slow machine: 2.5 s between every tick, so the walk-5 persistence
    // window is never what holds this back — the STREAK is the whole
    // subject, and it has to survive being the only thing under test.
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 20,
      now: clock.now,
    });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    const empty = statusWithStructure(EMPTY_ARM);
    const slowTick = (bytes: Uint8Array): void => {
      clock.advance(2500);
      transport.notify(GENERAL_STATUS_UUID, bytes);
    };
    slowTick(empty);
    slowTick(empty);
    // A NON-armed tick — the machine is mid-cycle, not making a claim about
    // the armed workout at all. The streak restarts from here.
    slowTick(generalStatusIn(WORKOUTSTATE_REARM));
    slowTick(empty);
    slowTick(empty);
    await drain();
    // Five ticks, FOUR of them mismatched-and-armed: a cumulative counter
    // would already have rejected.
    expect(outcome.settled).toBe(false);

    slowTick(empty); // third CONSECUTIVE since the reset
    await drain();
    expect(outcome.settled).toBe(true);
    expect(rejection(outcome).reason).toBe("structure-mismatch");
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("the counter also resets when the mismatched payload CHANGES — 'stable' is part of the rule (session 4a's mid-cycle transients)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    // Again slow ticks (2.5 s apart), so the persistence window is satisfied
    // throughout and the PAYLOAD's stability is the only thing being tested.
    // Note what this proves about the window itself: it restarts with the
    // streak, so five wrong ticks spanning 12 s still do not reject while
    // the payload keeps changing.
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 20,
      now: clock.now,
    });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    const empty = statusWithStructure(EMPTY_ARM);
    const transient = statusWithStructure(MID_CYCLE_TRANSIENT);
    const slowTick = (bytes: Uint8Array): void => {
      clock.advance(2500);
      transport.notify(GENERAL_STATUS_UUID, bytes);
    };
    slowTick(empty);
    slowTick(empty);
    slowTick(transient); // a DIFFERENT wrong payload
    slowTick(transient);
    await drain();
    expect(outcome.settled).toBe(false);

    slowTick(transient); // third stable transient
    await drain();
    expect(outcome.settled).toBe(true);
    expect(rejection(outcome).reason).toBe("structure-mismatch");
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("the rejection detail carries OBSERVED and EXPECTED for all three fields — a trace that says only 'mismatch' cannot be diagnosed at the erg", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 20,
      now: clock.now,
    });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      DISTANCE_PROGRAM,
    );

    const empty = statusWithStructure(EMPTY_ARM);
    for (let i = 0; i < 3; i += 1) {
      clock.advance(1500); // three ticks spanning 4.5 s — past the window
      transport.notify(GENERAL_STATUS_UUID, empty);
    }
    await drain();

    const detail = rejection(outcome).hexTrace;
    // OBSERVED — the empty arm's own three fields, verbatim.
    expect(detail).toContain(
      "observed workoutType=1 durationRaw=0 durationType=128",
    );
    // EXPECTED — interval 0 of the DISTANCE program, in its confirmed unit.
    expect(detail).toContain(
      "expected workoutType=8 durationRaw=500 durationType=128",
    );
    // And the same pair reaches the event log, not only the thrown error.
    const logged = log
      .entries()
      .find(
        (e) => e.kind === "program-rejection" && e.detail.includes("observed"),
      );
    expect(logged?.detail).toContain("durationRaw=0");
    expect(logged?.detail).toContain("durationRaw=500");
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("exactly ONE 'structure-mismatch' log entry across a long mismatch run — logged at first sighting, never per tick (0x0031 notifies ~2/s; the 500-entry ring does not survive per-tick entries)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { verifyTicks: 20 });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    // Alternating wrong payloads: every tick is armed-and-mismatched, but
    // no THREE consecutive ones are stable, so the streak never fires and
    // the run goes all the way to the outer bound.
    const a = statusWithStructure(EMPTY_ARM);
    const b = statusWithStructure(MID_CYCLE_TRANSIENT);
    for (let i = 0; i < 19; i += 1) {
      transport.notify(GENERAL_STATUS_UUID, i % 2 === 0 ? a : b);
    }
    await drain();
    expect(outcome.settled).toBe(false);
    expect(
      log.entries().filter((e) => e.kind === "structure-mismatch"),
    ).toHaveLength(1);

    transport.notify(GENERAL_STATUS_UUID, a); // the 20th tick — the outer bound
    await drain();
    expect(outcome.settled).toBe(true);
    // The bound fired while a structural mismatch was in evidence, so the
    // typed reason is the structural one, not the state-only
    // "not-observed": the machine DID reach armed, it just armed the wrong
    // thing.
    expect(rejection(outcome).reason).toBe("structure-mismatch");
    expect(
      log.entries().filter((e) => e.kind === "structure-mismatch"),
    ).toHaveLength(1);
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("the TYPE check is IN: durations correct but workoutType=1 still rejects (session 4a: the type is STABLE at 8 across TIME, DISTANCE and rest-0 — a 1 is a real signal, not normalization)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 20,
      now: clock.now,
    });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    const typeOnly = statusWithStructure({
      workoutType: 1,
      workoutDurationRaw: 6000, // MINIMAL_PROGRAM's own 60s, correct
      workoutDurationType: 0, // correct
    });
    for (let i = 0; i < 3; i += 1) {
      clock.advance(1500);
      transport.notify(GENERAL_STATUS_UUID, typeOnly);
    }
    await drain();
    expect(outcome.settled).toBe(true);
    expect(rejection(outcome).reason).toBe("structure-mismatch");
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("the DURATION TYPE check is IN: 500 read back as a TIME duration rejects, even though the number matches", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 20,
      now: clock.now,
    });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      DISTANCE_PROGRAM,
    );

    const wrongUnit = statusWithStructure({
      workoutType: 8,
      workoutDurationRaw: 500,
      workoutDurationType: 0, // Time, not the confirmed 128 for distance
    });
    for (let i = 0; i < 3; i += 1) {
      clock.advance(1500);
      transport.notify(GENERAL_STATUS_UUID, wrongUnit);
    }
    await drain();
    expect(outcome.settled).toBe(true);
    expect(rejection(outcome).reason).toBe("structure-mismatch");
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("the rest-0 shape still expects type 8 and the plain TIME duration (session 4a: 2×60s r0 read back type=8 dur=6000 durType=0 — no normalization)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 20,
      now: clock.now,
    });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      REST_ZERO_PROGRAM,
    );

    expect(healthyArmedStructureFor(REST_ZERO_PROGRAM)).toStrictEqual({
      workoutType: 8,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
    });

    // A rest-less sibling ordinal is NOT an acceptable rest-0 readback:
    // session 4a's own rest-0 row read back `8`, so the normalization
    // hypothesis (6/7/9 for the rest-less variants) is refuted, and a `6`
    // arriving here means the machine armed something we did not send.
    const normalizedType = statusWithStructure({
      workoutType: 6,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
    });
    for (let i = 0; i < 3; i += 1) {
      clock.advance(1500);
      transport.notify(GENERAL_STATUS_UUID, normalizedType);
    }
    await drain();
    expect(outcome.settled).toBe(true);
    expect(rejection(outcome).reason).toBe("structure-mismatch");
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("the healthy rest-0 readback resolves — the same 8/6000/Time triple a rest-30 program produces (no rest-keyed difference on the wire)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { verifyTicks: 20 });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      REST_ZERO_PROGRAM,
    );

    transport.notify(GENERAL_STATUS_UUID, armedStatusFor(REST_ZERO_PROGRAM));
    await expect(pending).resolves.toBeUndefined();
    expect(outcome.settled).toBe(true);
    expect(rejectionsLogged(log)).toBe(0);
    // A clean arm on the FIRST tick: nothing to observe, nothing logged.
    expect(structureEntries(log)).toBe(0);
  });

  it("a REAL library workout arms for real: Sea Fret's 300s opener reads back 30000/Time and program() resolves", async () => {
    // The briefing's realistic-fixture rule — Sea Fret through the exact
    // `buildDraft -> buildRun -> compileProgram` assembly `startSession`
    // uses, not a hand-built minimum. Its interval 0 is the 300s easy
    // opener the draft authors (see `seaFretProgram`'s own note), so
    // the readback the machine owes us — by SESSION 4a's documented rule,
    // applied here, not quoted from a capture of this workout — is 30000 at
    // duration type Time.
    const program = seaFretProgram();
    expect(program.intervals[0]).toMatchObject({ kind: "time", value: 300 });
    expect(healthyArmedStructureFor(program)).toStrictEqual({
      workoutType: 8,
      workoutDurationRaw: 30000,
      workoutDurationType: 0,
    });

    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { verifyTicks: 20 });
    const { pending, outcome } = await driveToVerify(
      driver,
      transport,
      program,
    );

    // A near-miss first: 30000 metres instead of 30000 centiseconds. One
    // tick of it must not reject (the lag rule), and the correct payload
    // that follows resolves normally.
    transport.notify(
      GENERAL_STATUS_UUID,
      statusWithStructure({
        workoutType: 8,
        workoutDurationRaw: 30000,
        workoutDurationType: 128,
      }),
    );
    await drain();
    expect(outcome.settled).toBe(false);

    transport.notify(GENERAL_STATUS_UUID, armedStatusFor(program));
    await expect(pending).resolves.toBeUndefined();
    expect(rejectionsLogged(log)).toBe(0);
    expect(structureEntries(log)).toBe(1); // the near-miss, seen and survived
  });
});

// ---------------------------------------------------------------------------
// HARDWARE WALK 5 (2026-08-10, phone BLE at the erg — PM5 432331249;
// `docs/monitor/pm5-interface-notes.md` §21, items 2-4). Two
// findings, both of them races the desktop transport's slower timing hid:
// the structure gate striking out inside the PM5's own two-step structure
// update, and the final interval's split pair arriving one notification
// AFTER the frame that ends the workout.
// ---------------------------------------------------------------------------

describe("createPm5Driver: walk 5 — the structure gate forgives the PM5 its own transition", () => {
  /** The walk's INTERMEDIATE reading, verbatim: the type has flipped to the
   *  programmed value, the duration has not caught up yet, and the duration
   *  type still reads the idle `0x80`. Stable, wrong, and entirely healthy —
   *  ~180 ms later the same machine reports `6000`/`0` and keeps doing so. */
  const TWO_STEP_INTERMEDIATE = statusWithStructure({
    workoutType: 8,
    workoutDurationRaw: 0,
    workoutDurationType: 128,
  });

  async function drainHops(hops = 30): Promise<void> {
    for (let i = 0; i < hops; i += 1) await Promise.resolve();
  }

  /** The fix-3 block's own three read-outs, repeated here because they live
   *  inside that block's closure: the typed error, how many rejections the
   *  trace holds (a healthy arm leaves none), and how many
   *  `"structure-mismatch"` entries it holds (a lagging-but-healthy arm
   *  leaves exactly one — the observation, never the verdict). */
  function rejectionOf(outcome: { error: unknown }): ProgramRejectionError {
    expect(outcome.error).toBeInstanceOf(ProgramRejectionError);
    return outcome.error as ProgramRejectionError;
  }

  function rejectionsIn(log: ReturnType<typeof createEventLog>): number {
    return log.entries().filter((e) => e.kind === "program-rejection").length;
  }

  function structureEntriesIn(log: ReturnType<typeof createEventLog>): number {
    return log.entries().filter((e) => e.kind === "structure-mismatch").length;
  }

  /** Session 4a's captured empty arm, for the changing-payload row below —
   *  the same triple the fix-3 block's own `EMPTY_ARM` carries. */
  const EMPTY_ARM_STATUS = statusWithStructure({
    workoutType: 1,
    workoutDurationRaw: 0,
    workoutDurationType: 128,
  });

  function verifyOutcome(pending: Promise<void>): {
    settled: boolean;
    error: unknown;
  } {
    const outcome = { settled: false, error: undefined as unknown };
    void pending.then(
      () => {
        outcome.settled = true;
      },
      (e: unknown) => {
        outcome.settled = true;
        outcome.error = e;
      },
    );
    return outcome;
  }

  /** Drives `program()` up to (and no further than) its verification phase —
   *  the stub twin of the fix-3 block's own `driveToVerify`, repeated here so
   *  this block reads on its own. */
  async function toVerify(
    driver: ReturnType<typeof createPm5Driver>,
    transport: ReturnType<typeof stubTransport>,
    p: WorkoutProgram,
  ): Promise<{
    pending: Promise<void>;
    outcome: ReturnType<typeof verifyOutcome>;
  }> {
    const sent = (): number =>
      transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
        .length;
    const start = sent();
    const pending = driver.program(p);
    const outcome = verifyOutcome(pending);
    await waitUntil(() => sent() > start);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(() => sent() > start + prepareChunkCount);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    await drainHops(50);
    return { pending, outcome };
  }

  it("iOS cadence, the walk's own shape: FOUR ~90ms ticks of the stale structure then the real one — program() RESOLVES (today: rejects on the third)", async () => {
    // THE REGRESSION. Against the tick-count-only rule this test fails on
    // the third notification with reason "structure-mismatch" — `observed
    // workoutType=8 durationRaw=0 durationType=128; expected workoutType=8
    // durationRaw=6000 durationType=0`, the exact string the phone produced
    // at the erg. Nothing about the machine is wrong in this timeline; only
    // the radio is faster than the one the rule was tuned on.
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 20,
      now: clock.now,
    });
    const { pending, outcome } = await toVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    // The transition window, at the phone's measured cadence.
    for (let i = 0; i < 4; i += 1) {
      transport.notify(GENERAL_STATUS_UUID, TWO_STEP_INTERMEDIATE);
      await drainHops();
      expect(outcome.settled).toBe(false);
      clock.advance(90);
    }

    // ...and the duration populates, as it did on every one of the walk's
    // connects, and stays correct.
    transport.notify(GENERAL_STATUS_UUID, armedStatusFor(MINIMAL_PROGRAM));
    await expect(pending).resolves.toBeUndefined();
    expect(rejectionsIn(log)).toBe(0);
    // Seen and recorded once — the observation survives, only the verdict
    // is withdrawn.
    expect(structureEntriesIn(log)).toBe(1);
  });

  it("the gate did NOT die: the same stale structure held past the 2000ms window still rejects 'structure-mismatch'", async () => {
    // The other side of the same rule. `verifyTicks: 100` keeps the OUTER
    // bound out of the way so it is unambiguously the streak-plus-window
    // rule firing, not the timeout wearing its reason.
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 100,
      now: clock.now,
    });
    const { pending, outcome } = await toVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    // Four ticks over 1.5 s: the streak is long past 3, the window is not.
    for (const at of [0, 500, 1000, 1500]) {
      clock.advance(at === 0 ? 0 : 500);
      transport.notify(GENERAL_STATUS_UUID, TWO_STEP_INTERMEDIATE);
      await drainHops();
      expect(outcome.settled).toBe(false);
    }

    clock.advance(500); // 2000 ms of one unchanging wrong answer
    transport.notify(GENERAL_STATUS_UUID, TWO_STEP_INTERMEDIATE);
    await drainHops();
    expect(outcome.settled).toBe(true);
    const err = rejectionOf(outcome);
    expect(err.reason).toBe("structure-mismatch");
    expect(err.hexTrace).toContain(
      "observed workoutType=8 durationRaw=0 durationType=128",
    );
    // The trace says how long, not just how many — the number a future walk
    // needs in order to argue about this window at all.
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "program-rejection" && e.detail.includes("over 2000ms"),
        ),
    ).toBe(true);
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("a wrong payload that keeps CHANGING restarts the window too — 12 seconds of settling is still not a verdict", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 100,
      now: clock.now,
    });
    const { pending, outcome } = await toVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    const a = EMPTY_ARM_STATUS;
    const b = TWO_STEP_INTERMEDIATE;
    for (let i = 0; i < 6; i += 1) {
      clock.advance(2500); // each tick alone is past the window
      transport.notify(GENERAL_STATUS_UUID, i % 2 === 0 ? a : b);
      await drainHops();
    }
    expect(outcome.settled).toBe(false);

    // A healthy readback still resolves after all of that.
    transport.notify(GENERAL_STATUS_UUID, armedStatusFor(MINIMAL_PROGRAM));
    await expect(pending).resolves.toBeUndefined();
    expect(rejectionsIn(log)).toBe(0);
  });

  it("AT THE SHIPPED DEFAULTS, 90ms ticks: the WINDOW decides the healthy case — 20 stale ticks inside 2000ms then the real one resolves", async () => {
    // Review I-1. Every test above pins the rule with `verifyTicks` passed
    // explicitly; production passes NOTHING (`useMonitorSession`'s
    // `driverOptions` sets `settleTicks`/`prepareSettleTicks` only), so this
    // pair is the only proof about what actually ships. The cadence is §21
    // item 3's fast end, 90 ms, which is where the old default lost the race:
    // 20 ticks x 90 ms = 1800 ms, so the tick bound reached its verdict
    // BEFORE the 2000 ms window could reach its own, and the reason the
    // rower saw was decided by radio speed again.
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, { now: clock.now }); // NO verifyTicks
    const { pending, outcome } = await toVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    // Far longer than the PM5 has ever taken to finish its two-step update
    // (~180 ms), and still inside the window: 20 ticks, 1800 ms — the exact
    // span the old default converted into a rejection.
    for (let i = 0; i < 20; i += 1) {
      transport.notify(GENERAL_STATUS_UUID, TWO_STEP_INTERMEDIATE);
      await drainHops();
      clock.advance(90);
    }
    expect(outcome.settled).toBe(false);

    transport.notify(GENERAL_STATUS_UUID, armedStatusFor(MINIMAL_PROGRAM));
    await expect(pending).resolves.toBeUndefined();
    expect(rejectionsIn(log)).toBe(0);
  });

  it("AT THE SHIPPED DEFAULTS, 90ms ticks: the WINDOW decides the failing case too — the rejection is the rule's, not the tick bound's", async () => {
    // The other half: a machine that really is holding the wrong workout
    // still gets convicted, and the conviction must come from the
    // streak-plus-window RULE (its detail reads "N consecutive armed tick(s)
    // over Nms") rather than from the outer bound wearing the same typed
    // reason (whose detail reads "N tick(s) elapsed without a matching armed
    // structure"). Distinguishing them is the whole point of I-1: at the old
    // default this assertion would have caught the bound's wording.
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, { now: clock.now }); // NO verifyTicks
    const { pending, outcome } = await toVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    // 2000 / 90 = 22.2, so tick 24 (t = 2070 ms) is the first that can
    // convict — comfortably inside the 30-tick bound, which is why 30.
    let ticks = 0;
    while (!outcome.settled && ticks < 30) {
      transport.notify(GENERAL_STATUS_UUID, TWO_STEP_INTERMEDIATE);
      await drainHops();
      ticks += 1;
      if (!outcome.settled) clock.advance(90);
    }

    expect(outcome.settled).toBe(true);
    expect(ticks).toBe(24); // the window's tick, not the bound's 30
    const err = rejectionOf(outcome);
    expect(err.reason).toBe("structure-mismatch");
    expect(err.hexTrace).toContain("consecutive armed tick(s) over 2070ms");
    expect(err.hexTrace).not.toContain("tick(s) elapsed");
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });

  it("the window RESTARTS with the payload: a long-standing wrong answer that changes buys the new one its own 2000ms", async () => {
    // The two halves have to measure the SAME claim. A machine that sat on
    // one wrong structure for three seconds and then moved to a different
    // one is still settling — the new payload has been up for 200 ms, and a
    // window that kept counting from the OLD one would convict on its third
    // tick. (This is the mutant a test that only alternates payloads cannot
    // catch: there, the streak alone is already enough to hold the verdict
    // back, so the clock's own reset is never load-bearing.)
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, {
      verifyTicks: 100,
      now: clock.now,
    });
    const { pending, outcome } = await toVerify(
      driver,
      transport,
      MINIMAL_PROGRAM,
    );

    // Three seconds of payload A — long past the window, but only two ticks
    // of it, so no verdict yet.
    transport.notify(GENERAL_STATUS_UUID, EMPTY_ARM_STATUS);
    await drainHops();
    clock.advance(3000);
    transport.notify(GENERAL_STATUS_UUID, EMPTY_ARM_STATUS);
    await drainHops();
    expect(outcome.settled).toBe(false);

    // Payload B arrives and holds for three CONSECUTIVE ticks — but only
    // 200 ms of them.
    for (const step of [100, 100, 100]) {
      clock.advance(step);
      transport.notify(GENERAL_STATUS_UUID, TWO_STEP_INTERMEDIATE);
      await drainHops();
    }
    expect(outcome.settled).toBe(false);

    // ...and once B has held for its own 2000 ms, it is a verdict.
    clock.advance(2000);
    transport.notify(GENERAL_STATUS_UUID, TWO_STEP_INTERMEDIATE);
    await drainHops();
    expect(outcome.settled).toBe(true);
    expect(rejectionOf(outcome).reason).toBe("structure-mismatch");
    // Measured from B's own first tick (2200 ms), never from A's.
    expect(rejectionOf(outcome).hexTrace).toContain(
      "observed workoutType=8 durationRaw=0 durationType=128",
    );
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "program-rejection" && e.detail.includes("over 2200ms"),
        ),
    ).toBe(true);
    await expect(pending).rejects.toBeInstanceOf(ProgramRejectionError);
  });
});

describe("createPm5Driver: RC-37 — the armed-state structure watch, past verifyArmed's own window (design spec 2026-08-27-link-authority-design.md §1, [R5])", () => {
  /** A wrong structure, distinct from `MINIMAL_PROGRAM`'s own armed reading
   *  (`healthyArmedStructureFor` — workoutType=8, durationRaw=6000,
   *  durationType=0) — the same session-4a "empty arm" shape the fix-3
   *  block's own `EMPTY_ARM` fixture carries, redeclared here per this
   *  file's own per-describe-block scoping (module-level constants are
   *  shared; fixtures built FROM them are not). */
  const WRONG_STRUCTURE = {
    workoutType: 1,
    workoutDurationRaw: 0,
    workoutDurationType: 128,
  };
  const ANOTHER_WRONG_STRUCTURE = {
    workoutType: 8,
    workoutDurationRaw: 0,
    workoutDurationType: 128,
  };

  function structureLeftEntries(log: ReturnType<typeof createEventLog>) {
    return log.entries().filter((e) => e.kind === "structure-left");
  }

  function recoveredEntries(log: ReturnType<typeof createEventLog>) {
    return log
      .entries()
      .filter((e) => e.kind === "structure-mismatch-recovered");
  }

  /** Programs `MINIMAL_PROGRAM` to a clean resolve (a healthy, matching
   *  armed readback) and returns the driver/transport/log/events trio every
   *  test below starts from — the post-verify watch this describe block is
   *  about only ever begins running once `program()` has already
   *  succeeded. */
  async function armed(): Promise<{
    transport: ReturnType<typeof stubTransport>;
    log: ReturnType<typeof createEventLog>;
    clock: ReturnType<typeof manualClock>;
    driver: ReturnType<typeof createPm5Driver>;
    events: MonitorEvent[];
  }> {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, { now: clock.now });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    return { transport, log, clock, driver, events };
  }

  it("pins the armed gate: a structural change while the machine reports ROWING never fires, however long it persists — the quadruple legitimately moves outside armed (verifyArmed's own reason for the same gate)", async () => {
    const { transport, log, clock, events } = await armed();

    // Six consecutive, STABLE, wrong-structure ticks, each 1000ms apart —
    // both thresholds (3 ticks, 2000ms) are comfortably cleared BY THE
    // NUMBERS. The only thing standing between this and a false "the
    // machine dropped the program" is the `armed` gate: every tick below
    // reports "rowing", not "armed".
    for (let i = 0; i < 6; i += 1) {
      clock.advance(1000);
      transport.notify(
        GENERAL_STATUS_UUID,
        statusWithStructure(WRONG_STRUCTURE, WORKOUTSTATE_INTERVALWORKTIME),
      );
    }
    await flushMicrotasks();

    expect(structureLeftEntries(log)).toStrictEqual([]);
    expect(events.filter((e) => e.kind === "programDropped")).toStrictEqual([]);
  });

  it("pins BOTH constants (1 of 2): three consecutive stable mismatches INSIDE the 2000ms window never fires — the PM5's own two-step post-program transition (STRUCTURE_MISMATCH_WINDOW_MS's own doc comment) can recur on any fresh arm this watch keeps running through", async () => {
    const { transport, log, clock, events } = await armed();

    // Three consecutive, stable, wrong-structure ARMED ticks — the tick
    // count alone is satisfied — but only 300ms apart, well under the
    // 2000ms window.
    for (let i = 0; i < 3; i += 1) {
      clock.advance(300);
      transport.notify(
        GENERAL_STATUS_UUID,
        statusWithStructure(WRONG_STRUCTURE),
      );
    }
    await flushMicrotasks();

    expect(structureLeftEntries(log)).toStrictEqual([]);
    expect(events.filter((e) => e.kind === "programDropped")).toStrictEqual([]);
  });

  it("pins BOTH constants (2 of 2): held past the 2000ms window but never 3 CONSECUTIVE identical stable ticks never fires — an alternating payload is a machine still settling, not one holding the wrong workout", async () => {
    const { transport, log, clock, events } = await armed();

    // Five armed ticks, ALTERNATING between two different wrong structures,
    // spanning 5000ms — the window is cleared by a wide margin, but no
    // THREE consecutive ticks ever agree, so the streak never reaches 3.
    const sequence = [
      WRONG_STRUCTURE,
      ANOTHER_WRONG_STRUCTURE,
      WRONG_STRUCTURE,
      ANOTHER_WRONG_STRUCTURE,
      WRONG_STRUCTURE,
    ];
    for (const structure of sequence) {
      clock.advance(1000);
      transport.notify(GENERAL_STATUS_UUID, statusWithStructure(structure));
    }
    await flushMicrotasks();

    expect(structureLeftEntries(log)).toStrictEqual([]);
    expect(events.filter((e) => e.kind === "programDropped")).toStrictEqual([]);
  });

  // Self-mutation found this gap (report): "pins BOTH constants (2 of 2)"
  // above does NOT discriminate a tick-count-removed mutant — an
  // ALTERNATING payload resets `mismatchSince` on every tick (a changed
  // payload is a new claim, `mismatchSince`'s own doc comment), so `heldMs`
  // never clears the window regardless of whether the tick-count half is
  // even checked. This test isolates the OTHER shape: the SAME wrong
  // structure, held long enough to clear the window on its own, but never
  // reaching 3 consecutive ticks.
  it("pins BOTH constants (3 of 3): the SAME wrong structure held well past the 2000ms window on just 2 ticks never fires — the window alone is not a verdict either", async () => {
    const { transport, log, clock, events } = await armed();

    clock.advance(1500);
    transport.notify(GENERAL_STATUS_UUID, statusWithStructure(WRONG_STRUCTURE));
    // Tick 2, 2500ms after tick 1 — `heldMs` alone already clears the
    // 2000ms window, but the streak is only 2.
    clock.advance(2500);
    transport.notify(GENERAL_STATUS_UUID, statusWithStructure(WRONG_STRUCTURE));
    await flushMicrotasks();

    expect(structureLeftEntries(log)).toStrictEqual([]);
    expect(events.filter((e) => e.kind === "programDropped")).toStrictEqual([]);
  });

  it("fires 'structure-left' and emits programDropped exactly once both thresholds are met (RC-37's own trigger, walk-2026-08-27: 112 consecutive frames over 56.4s)", async () => {
    const { transport, log, clock, events } = await armed();

    for (let i = 0; i < 3; i += 1) {
      clock.advance(1000); // three ticks spanning 3000ms — both thresholds
      transport.notify(
        GENERAL_STATUS_UUID,
        statusWithStructure(WRONG_STRUCTURE),
      );
    }
    await flushMicrotasks();

    const entries = structureLeftEntries(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("3 consecutive armed tick(s)");
    // mismatchSince is stamped on tick 1 (now=1000); tick 3 arrives at
    // now=3000, so the streak has held for 2000ms — not 3000, the raw sum
    // of the three 1000ms gaps advanced.
    expect(entries[0]!.detail).toContain("2000ms");
    expect(entries[0]!.detail).toContain(
      "observed workoutType=1 durationRaw=0 durationType=128",
    );
    expect(entries[0]!.detail).toContain(
      "expected workoutType=8 durationRaw=6000 durationType=0",
    );
    const fired = events.filter((e) => e.kind === "programDropped");
    expect(fired).toHaveLength(1);

    // IDEMPOTENT (the `armedWatchFired` guard): more of the identical wrong
    // structure keeps arriving — a real radio does not stop notifying just
    // because the app decided to leave — and it must not double-fire.
    for (let i = 0; i < 3; i += 1) {
      clock.advance(1000);
      transport.notify(
        GENERAL_STATUS_UUID,
        statusWithStructure(WRONG_STRUCTURE),
      );
    }
    await flushMicrotasks();
    expect(structureLeftEntries(log)).toHaveLength(1);
    expect(events.filter((e) => e.kind === "programDropped")).toHaveLength(1);
  });

  it("the near-miss (1 of 2): a mismatch that reaches the tick count and then SELF-CORRECTS before the window logs 'structure-mismatch-recovered', never 'structure-left' — the near-miss the design spec's own §1b calls out as the entry that matters most", async () => {
    const { transport, log, clock, events } = await armed();

    // Three consecutive stable wrong ticks, 300ms apart (well under the
    // window)...
    for (let i = 0; i < 3; i += 1) {
      clock.advance(300);
      transport.notify(
        GENERAL_STATUS_UUID,
        statusWithStructure(WRONG_STRUCTURE),
      );
    }
    // ...then the CORRECT structure arrives before the window ever closes.
    clock.advance(300);
    transport.notify(GENERAL_STATUS_UUID, armedStatusFor(MINIMAL_PROGRAM));
    await flushMicrotasks();

    expect(structureLeftEntries(log)).toStrictEqual([]);
    expect(events.filter((e) => e.kind === "programDropped")).toStrictEqual([]);
    const recovered = recoveredEntries(log);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.detail).toContain("3 consecutive armed tick(s)");
    expect(recovered[0]!.detail).toContain("a matching armed tick arrived");
  });

  it("the near-miss (2 of 2): a mismatch streak that ends because the machine LEFT armed (the rower pulled) logs 'structure-mismatch-recovered' too — distinguishing 'stayed silent' from 'got lucky on the thresholds' needs both exits covered", async () => {
    const { transport, log, clock, events } = await armed();

    clock.advance(300);
    transport.notify(GENERAL_STATUS_UUID, statusWithStructure(WRONG_STRUCTURE));
    clock.advance(300);
    transport.notify(GENERAL_STATUS_UUID, statusWithStructure(WRONG_STRUCTURE));
    // The rower pulls before the third tick ever arrives.
    clock.advance(300);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME),
    );
    await flushMicrotasks();

    expect(structureLeftEntries(log)).toStrictEqual([]);
    expect(events.filter((e) => e.kind === "programDropped")).toStrictEqual([]);
    const recovered = recoveredEntries(log);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.detail).toContain("2 consecutive armed tick(s)");
    expect(recovered[0]!.detail).toContain('left "armed"');
  });

  it("a fresh program() resets this watch — a leftover streak from the OUTGOING program, old enough that its own window is already spent, must not combine with the incoming program's first mismatched tick to fire early", async () => {
    const { transport, log, clock, driver, events } = await armed();

    // Two mismatched ticks under the FIRST program, 2500ms then 100ms
    // apart — the streak (2) is short of the 3-tick bar on its own, so
    // nothing fires. `mismatchSince` now reads 2500 (the streak's own
    // start), deliberately left FAR enough in the past that, if it ever
    // survived a re-arm uncleared, the very next mismatched tick would
    // already clear `STRUCTURE_MISMATCH_WINDOW_MS` against it.
    clock.advance(2500);
    transport.notify(GENERAL_STATUS_UUID, statusWithStructure(WRONG_STRUCTURE));
    clock.advance(100);
    transport.notify(GENERAL_STATUS_UUID, statusWithStructure(WRONG_STRUCTURE));
    await flushMicrotasks();
    expect(structureLeftEntries(log)).toStrictEqual([]);

    // A SECOND program() succeeds — a clean re-arm, no reconnect (matches
    // `program()`'s own per-run reset block, `armedWatch`'s doc comment).
    await programViaStub(driver, transport, MINIMAL_PROGRAM);

    // A single mismatched tick under the NEW arm, well clear of
    // STRUCTURE_MISMATCH_WINDOW_MS relative to the OLD streak's own
    // `mismatchSince` (2500 -> now 5100, a 2600ms gap — comfortably past
    // 2000ms). A correctly-reset watch reads this as tick 1 of a FRESH
    // streak (short of the 3-tick bar, so no fire regardless of timing). A
    // watch that failed to reset would read it as tick 3 of the OLD one,
    // held for 2600ms — BOTH thresholds met, firing on the wrong program's
    // history.
    clock.advance(2500);
    transport.notify(GENERAL_STATUS_UUID, statusWithStructure(WRONG_STRUCTURE));
    await flushMicrotasks();
    expect(structureLeftEntries(log)).toStrictEqual([]);
    expect(events.filter((e) => e.kind === "programDropped")).toStrictEqual([]);
  });

  // MUST-FIX, fix round 1 (spec-compliance review): `pendingVerify` is
  // non-null only during `verifyArmed`, the LAST of `program()`'s four
  // phases (`sendPrepare` -> `waitForPrepareSettle` -> `sendSequence` ->
  // `verifyArmed`, `driver.ts:5793-5807`). Through the first three,
  // `pendingVerify` is null and `armedProgram()` still returns the
  // OUTGOING program (`activeRun` is replaced only at the very end of the
  // success path) — so a re-arm in flight used to run straight into this
  // watch, comparing the machine's own Terminate -> Rearm -> WaitToBegin
  // unprogrammed default (`sendPrepare`'s own Terminate causes exactly
  // this cycle) against the OUTGOING program's expectation. That default
  // is workoutType=1/durationRaw=0/durationType=128 — RC-37's own positive
  // shape — held stably while the real `sendSequence` send is still in
  // flight. Guarded by `!programInFlight` (true across all four phases,
  // reset in `program()`'s own `finally`).
  it("MUST-FIX: a re-arm in flight (a SECOND program() call, before its own verifyArmed resolves) never fires on the OUTGOING program's now-stale expectation — the machine's own Terminate/Rearm/WaitToBegin unprogrammed default is RC-37's own positive shape, and it recurs on every re-arm", async () => {
    const { transport, log, clock, driver, events } = await armed();

    // A genuinely DIFFERENT incoming program — so a reader can see the
    // interim readback (WRONG_STRUCTURE) mismatches BOTH the outgoing
    // program's own structure AND the incoming one's, not merely happening
    // to coincide with either.
    const DIFFERENT_PROGRAM: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "distance",
          value: 500,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0,
        },
      ],
    };

    const sent = (): number =>
      transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
        .length;
    const start = sent();
    const pending = driver.program(DIFFERENT_PROGRAM);
    await waitUntil(() => sent() > start);
    // The prepare's own Terminate, acked (swallowed regardless of the
    // answer — `sendPrepare`'s own doc comment).
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "reject" }),
    );
    await waitUntil(() => sent() > start + prepareChunkCount);
    // `sendSequence` has now sent DIFFERENT_PROGRAM's own first chunk and
    // is awaiting ITS ack — `pendingVerify` is still null, `verifyArmed`
    // has not even been called yet. This is exactly the window fix round
    // 1 found unguarded: the Terminate -> Rearm -> WaitToBegin cycle
    // reporting its unprogrammed default, three consecutive stable ticks
    // over the full window.
    for (let i = 0; i < 3; i += 1) {
      clock.advance(1000);
      transport.notify(
        GENERAL_STATUS_UUID,
        statusWithStructure(WRONG_STRUCTURE),
      );
    }
    await flushMicrotasks();

    // MUST NOT have fired — this is normal re-programming, not RC-37.
    expect(structureLeftEntries(log)).toStrictEqual([]);
    expect(events.filter((e) => e.kind === "programDropped")).toStrictEqual([]);

    // Let the re-arm actually finish clean, so this test proves the guard
    // is scoped to the IN-FLIGHT window only, not a permanent suppression:
    // once DIFFERENT_PROGRAM genuinely arms, the watch must resume.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    transport.notify(GENERAL_STATUS_UUID, armedStatusFor(DIFFERENT_PROGRAM));
    await pending;

    // Post-resolve, the watch runs again: three more of the SAME stable
    // wrong structure, now compared against DIFFERENT_PROGRAM's own
    // expectation, over the window — fires normally.
    for (let i = 0; i < 3; i += 1) {
      clock.advance(1000);
      transport.notify(
        GENERAL_STATUS_UUID,
        statusWithStructure(WRONG_STRUCTURE),
      );
    }
    await flushMicrotasks();
    expect(structureLeftEntries(log)).toHaveLength(1);
    expect(events.filter((e) => e.kind === "programDropped")).toHaveLength(1);
  });

  // Fix round 1, finding 2 (spec-compliance review): a bouncing wire — one
  // mismatched tick, then a matching one, repeated — produces one
  // streak-CYCLE per pair of ticks. Uncapped, that is one
  // `"structure-mismatch-recovered"` entry roughly every second at the
  // real ~2Hz cadence, into a 500-entry ring. `STRUCTURE_RECOVERED_LOG_CAP`
  // (5, `driver.ts`) bounds it per run.
  it("caps 'structure-mismatch-recovered' entries at 5 per run — a bouncing wire (8 mismatch/recover cycles) logs only the first 5, never all 8", async () => {
    const { transport, log, clock, events } = await armed();

    const CYCLES = 8;
    for (let i = 0; i < CYCLES; i += 1) {
      clock.advance(300);
      transport.notify(
        GENERAL_STATUS_UUID,
        statusWithStructure(WRONG_STRUCTURE),
      ); // mismatch: streak=1
      clock.advance(300);
      transport.notify(GENERAL_STATUS_UUID, armedStatusFor(MINIMAL_PROGRAM)); // matches: closes the streak, logs "recovered"
    }
    await flushMicrotasks();

    // Never fired — every streak is 1 tick, nowhere near either threshold.
    expect(structureLeftEntries(log)).toStrictEqual([]);
    expect(events.filter((e) => e.kind === "programDropped")).toStrictEqual([]);
    // 8 genuine cycles occurred; only the cap's worth reached the ring.
    expect(recoveredEntries(log)).toHaveLength(5);
  });
});

describe("createPm5Driver: walk 5 — the last split always lands (the end-of-workout split race)", () => {
  /** The walk's own workout: a single 1:00 interval, rowed to completion.
   *  The PM5 delivered 0x0037 and 0x0038 at the finish, 1 ms apart
   *  (02:23:12.491/.492), AFTER the general-status frame that reported the
   *  end — and the log screen said "0 OF 1 INTERVALS MEASURED". */
  const WALK_5_PROGRAM: WorkoutProgram = {
    intervals: [
      {
        type: "work",
        kind: "time",
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 0,
      },
    ],
  };

  function primed(): {
    transport: ReturnType<typeof stubTransport>;
    log: ReturnType<typeof createEventLog>;
    driver: ReturnType<typeof createPm5Driver>;
    events: MonitorEvent[];
    clock: ReturnType<typeof manualClock>;
  } {
    const transport = stubTransport();
    const log = createEventLog();
    // The finish grace runs on the clock since walk day 3 — hand-advanced
    // here, so "how long after the finish" is a thing these tests SAY rather
    // than a thing they hope for. Time never passes on its own.
    const clock = manualClock();
    const driver = createPm5Driver(transport, log, { now: clock.now });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    // AS1/AS2 once, so status ticks actually produce frames.
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    return { transport, log, driver, events, clock };
  }

  function boundaries(events: MonitorEvent[]) {
    return events.filter((e) => e.kind === "intervalComplete");
  }

  it("THE WALK: the split pair arrives AFTER the finished tick and still records — index 0, finalBoundary, no out-of-run", async () => {
    // Against today's driver this test fails on `actual.index`: the run is
    // already closed when the pair lands, so the boundary takes the
    // out-of-run path and is emitted with `index: null` — which
    // `buildMonitorLogSteps` drops, which is the "0 OF 1" the rower saw.
    const { transport, log, driver, events } = primed();
    await programViaStub(driver, transport, WALK_5_PROGRAM);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(1);

    // 1 ms later on the wire, and in the same gap before the next status
    // sample: the machine's Split/Interval Number for a 1-interval piece is
    // 1 (§19.8's minus-one offset lands it on interval 0).
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));

    expect(boundaries(events)).toHaveLength(1);
    expect(boundaries(events)[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, avgSpm: 24, elapsedSeconds: 60, distanceMeters: 200 },
      finalBoundary: true,
    });
    // The ORDER the record depends on is still terminal-then-boundary: the
    // fix is that the boundary is still the run's, not that it overtakes.
    const kinds = events.map((e) => e.kind);
    expect(kinds.lastIndexOf("workoutComplete")).toBeLessThan(
      kinds.lastIndexOf("intervalComplete"),
    );
    expect(log.entries().some((e) => e.kind === "boundary-out-of-run")).toBe(
      false,
    );
    expect(
      log
        .entries()
        .some(
          (e) =>
            e.kind === "interval-complete" &&
            e.detail.includes("THE FINISH GRACE"),
        ),
    ).toBe(true);
    // RECEIPT, pinned next to the code that writes it (walk day 2, review
    // M-5): both halves are logged as they arrive, with the run's state at
    // that moment — the entry whose absence made the day-2 stash readable
    // only as ordering evidence.
    const halves = log.entries().filter((e) => e.kind === "split-half");
    expect(halves.map((e) => e.detail.slice(0, 6))).toStrictEqual([
      "0x0037",
      "0x0038",
    ]);
    expect(halves[0]!.detail).toContain("run closed");
  });

  it("a REAL library workout's final interval too: Sea Fret's boundary 3 after the finish files as interval 2", async () => {
    // The briefing's realistic-fixture rule, and a non-clamped index: a
    // 3-interval program whose machine Split/Interval Number 3 normalizes to
    // our interval 2 through the ordinary minus-one offset, not through the
    // low-edge clamp `WALK_5_PROGRAM` exercises above.
    const program = seaFretProgram();
    expect(program.intervals).toHaveLength(3);
    const { transport, log, driver, events } = primed();
    await programViaStub(driver, transport, program);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 200, 700),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 240, 900),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(3, 240, 900));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(3, 26));

    expect(boundaries(events)).toHaveLength(1);
    expect(boundaries(events)[0]).toMatchObject({
      actual: { index: 2, avgSpm: 26 },
      finalBoundary: true,
    });
    expect(log.entries().some((e) => e.kind === "boundary-out-of-run")).toBe(
      false,
    );
  });

  it("the DESKTOP order is untouched: a split BEFORE the finished tick records exactly as it always did, with no finalBoundary flag", async () => {
    const { transport, log, driver, events } = primed();
    await programViaStub(driver, transport, WALK_5_PROGRAM);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );

    expect(boundaries(events)).toHaveLength(1);
    const only = boundaries(events)[0]!;
    expect(only).toMatchObject({ actual: { index: 0, avgSpm: 24 } });
    // No flag at all on an ordinary in-run boundary — the record's late-actual
    // door stays shut for everything but the grace.
    expect("finalBoundary" in only).toBe(false);
    expect(events.filter((e) => e.kind === "workoutComplete")).toHaveLength(1);
    expect(log.entries().some((e) => e.kind === "boundary-out-of-run")).toBe(
      false,
    );
  });

  it("WALK DAY 3, THE REGRESSION: post-finish status ticks do NOT expire the grace — the split arrives after several of them and still records", async () => {
    // The device sequence this inverts, from the day-3 stash: `terminal
    // finished` (seq 19), then the PM5's own repeat `finished` frames, then
    // the split pair (seq 21-24) — and under the previous "expires at the
    // machine's next status sample" bound, seq 25 read `boundary-out-of-run
    // — no open run, index=null`, with the run's own actual in hand. The
    // machine's cadence is not the split's schedule; only the clock is.
    const { transport, log, driver, events, clock } = primed();
    await programViaStub(driver, transport, WALK_5_PROGRAM);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
    // The PM keeps reporting "finished" for as long as it sits in
    // WorkoutLogged (§19.4) — five of them here, 90 ms apart, the iOS
    // cadence §21 item 3 recorded.
    for (let i = 0; i < 5; i += 1) {
      clock.advance(90);
      transport.notify(
        GENERAL_STATUS_UUID,
        generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
      );
    }
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));

    expect(boundaries(events)).toHaveLength(1);
    expect(boundaries(events)[0]).toMatchObject({
      actual: { index: 0, avgSpm: 24 },
      finalBoundary: true,
    });
    expect(log.entries().some((e) => e.kind === "boundary-out-of-run")).toBe(
      false,
    );
  });

  it("...but the CLOCK still bounds it: a pair arriving past the 3s grace is out-of-run again", async () => {
    const { transport, log, driver, events, clock } = primed();
    await programViaStub(driver, transport, WALK_5_PROGRAM);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );

    // Three seconds later — whatever this boundary is, it is not the finish
    // of the piece that ended back then.
    clock.advance(3000);
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));

    expect(boundaries(events)).toHaveLength(1);
    expect(boundaries(events)[0]).toMatchObject({ actual: { index: null } });
    expect("finalBoundary" in boundaries(events)[0]!).toBe(false);
    expect(log.entries().some((e) => e.kind === "boundary-out-of-run")).toBe(
      true,
    );
  });

  it("just inside the window still counts — the bound is 3000ms, not 'about three seconds'", async () => {
    const { transport, driver, events, clock } = primed();
    await programViaStub(driver, transport, WALK_5_PROGRAM);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );

    clock.advance(2999);
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));

    expect(boundaries(events)[0]).toMatchObject({
      actual: { index: 0 },
      finalBoundary: true,
    });
  });

  it("a TERMINATED close opens no grace — footnote 12's unstable Split/Interval Number keeps the out-of-run path", async () => {
    const { transport, log, driver, events } = primed();
    await programViaStub(driver, transport, WALK_5_PROGRAM);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 40, 130),
    );
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 40, 130));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));

    expect(boundaries(events)).toHaveLength(1);
    expect(boundaries(events)[0]).toMatchObject({ actual: { index: null } });
    expect(log.entries().some((e) => e.kind === "boundary-out-of-run")).toBe(
      true,
    );
  });

  it("post-run HOUSEKEEPING is still refused: an index this run already filed does not come back through the grace", async () => {
    const { transport, log, driver, events } = primed();
    await programViaStub(driver, transport, WALK_5_PROGRAM);

    // The whole boundary, in-run, the desktop way — interval 0 is now filed.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
    // ...and the machine's own post-run housekeeping repeats it, inside the
    // very gap the grace covers. The run is not missing this interval, so it
    // is not this run's to take.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));

    expect(boundaries(events)).toHaveLength(2);
    expect(boundaries(events)[0]).toMatchObject({ actual: { index: 0 } });
    expect(boundaries(events)[1]).toMatchObject({ actual: { index: null } });
    expect(
      log.entries().filter((e) => e.kind === "boundary-out-of-run"),
    ).toHaveLength(1);
  });

  it("a run that never reported a rowing interval has nothing to normalize against — the grace declines rather than guess", async () => {
    // The third of the grace's five conditions, on its own: a run whose
    // machine went straight from armed to finished (nobody rowed) has no
    // observed active state, and `toActualIndex` will not name an interval
    // from the terminal word. Declining is the honest answer — the same one
    // `IntervalActual.index`'s `null` contract exists to express.
    const { transport, log, driver, events } = primed();
    await programViaStub(driver, transport, WALK_5_PROGRAM);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 0, 0),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 0, 0));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 0));

    expect(boundaries(events)).toHaveLength(1);
    expect(boundaries(events)[0]).toMatchObject({ actual: { index: null } });
    expect(log.entries().some((e) => e.kind === "boundary-out-of-run")).toBe(
      true,
    );
  });

  it("the grace is consumed ONCE: a second, different boundary in the same gap is still out-of-run", async () => {
    const program = seaFretProgram();
    const { transport, log, driver, events } = primed();
    await programViaStub(driver, transport, program);

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 200, 700),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 240, 900),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(3, 240, 900));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(3, 26));
    // A second pair in the same gap, naming a different interval: whatever
    // that is, it is not one more piece of this run's finish.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(2, 120, 400));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(2, 20));

    expect(boundaries(events)).toHaveLength(2);
    expect(boundaries(events)[0]).toMatchObject({ actual: { index: 2 } });
    expect(boundaries(events)[1]).toMatchObject({ actual: { index: null } });
    expect(
      log.entries().filter((e) => e.kind === "boundary-out-of-run"),
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 7B — the session accumulator (hardware walk 4, 2026-08-08,
// interface-notes.md §18). 0x0031's Elapsed Time and Distance are
// PER-INTERVAL: a 2x100m produced `state=resting elapsed=37.81
// distance=101.8` and then `state=rowing elapsed=0 distance=0.7`. Every
// consumer that wanted a session total was reading a field that falls back
// to the floor mid-piece.
// ---------------------------------------------------------------------------

// CR2 spec 1, Task 4: this describe block's own tests never arm a program
// (`replayWalk4`/the backwards-noise test both build a bare driver and skip
// `programViaStub` — a deliberate choice predating this task, testing the
// accumulator in isolation from program state). Under the OLD fold that made
// no difference: the reset was detected on the raw elapsed drop alone,
// program or no program. Under the register map it matters completely —
// `session`'s own doc comment: "an EMPTY map falls back to the raw pair: a
// JustRow with no program armed has no interval identity at all, and there
// per-interval IS the session" — because `toProgramIndex` returns `null`
// unconditionally whenever `programLength <= 0`
// (`domain/monitor/pm5/intervalIndex.ts`), so nothing ever seeds a key and
// every one of these frames falls back to the raw pair verbatim. The four
// tests below that asserted CROSS-RESET ACCUMULATION are rewritten to pin
// that fallback instead — genuine armed-program accumulation is now
// `sessionTotals.test.ts`'s job (Task 2/3/4's own suite, which arms a real
// program on every case). Confirmed by tracing `driver.ts`'s
// `maybeEmitFrame` this session, not assumed.
describe("createPm5Driver: sessionElapsedSeconds/sessionDistanceMeters with NO program armed (walk 4) — CR2 spec 1 falls back to the raw pair", () => {
  /** Brings `seen.as1`/`seen.as2` up so that the general-status
   *  notifications below actually produce frames. Content is irrelevant to
   *  the accumulator — zero-filled payloads of the documented lengths, the
   *  same shortcut the 'seen' gating tests above take. */
  function primeSiblings(transport: ReturnType<typeof stubTransport>): void {
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
  }

  function framesFrom(events: MonitorEvent[]): MonitorFrame[] {
    return events.flatMap((e) => (e.kind === "frame" ? [e.frame] : []));
  }

  /** Walk 4's own trace, state word by state word and value by value: the
   *  arm, one early rowing tick, the end of interval 1's rest, the RESET
   *  into interval 2, that interval's own rest, and the finish. No program
   *  is armed anywhere in this describe block (see its own header comment),
   *  so `session.seen` never gets a key and every frame below reports its
   *  own raw `(elapsed, distance)` unchanged — there is no "banked reading"
   *  under CR2 spec 1 without a program to key against. */
  const WALK_4: { state: number; elapsed: number; distance: number }[] = [
    { state: WORKOUTSTATE_WAITTOBEGIN, elapsed: 0, distance: 0 },
    { state: WORKOUTSTATE_INTERVALWORKTIME, elapsed: 1.23, distance: 3.5 },
    { state: WORKOUTSTATE_INTERVALREST, elapsed: 37.81, distance: 101.8 },
    { state: WORKOUTSTATE_INTERVALWORKTIME, elapsed: 0, distance: 0.7 },
    { state: WORKOUTSTATE_INTERVALREST, elapsed: 29.44, distance: 101 },
    { state: WORKOUTSTATE_WORKOUTEND, elapsed: 33.07, distance: 109.7 },
  ];

  function replayWalk4(): MonitorFrame[] {
    const transport = stubTransport();
    const driver = createPm5Driver(transport, createEventLog());
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    primeSiblings(transport);
    for (const tick of WALK_4) {
      transport.notify(
        GENERAL_STATUS_UUID,
        generalStatusIn(tick.state, tick.elapsed, tick.distance),
      );
    }
    return framesFrom(events);
  }

  it("emits the raw per-interval pair unchanged — the reset is real and stays visible", () => {
    const frames = replayWalk4();

    expect(frames).toHaveLength(WALK_4.length);
    expect(frames.map((f) => f.elapsedSeconds)).toStrictEqual(
      WALK_4.map((t) => t.elapsed),
    );
    expect(frames.map((f) => f.distanceMeters)).toStrictEqual(
      WALK_4.map((t) => t.distance),
    );
  });

  it("the session pair EQUALS the raw pair, resets included — no program means no key to accumulate into", () => {
    const frames = replayWalk4();

    // Not monotone: frame 3's raw elapsed (0) is genuinely less than frame
    // 2's (37.81), and with no program armed the session pair tracks it
    // exactly rather than banking across the drop.
    expect(frames.map((f) => f.sessionElapsedSeconds)).toStrictEqual(
      WALK_4.map((t) => t.elapsed),
    );
    expect(frames.map((f) => f.sessionDistanceMeters)).toStrictEqual(
      WALK_4.map((t) => t.distance),
    );
  });

  it("ends at the finish tick's own raw reading, not a sum of the two intervals", () => {
    const last = replayWalk4().at(-1)!;

    // Was 37.81 + 33.07 / 101.8 + 109.7 under the old fold; with no program
    // armed there is no key for either interval's final reading to bank
    // into, so the last frame reports exactly its own raw pair.
    expect(last.sessionElapsedSeconds).toBe(33.07);
    expect(last.sessionDistanceMeters).toBe(109.7);
  });

  it("the reset frame carries only its own reading — nothing from before it survives", () => {
    const frames = replayWalk4();

    // Frame 3 is the reset frame (`elapsed=0 distance=0.7`). Was
    // 37.81 / 101.8+0.7 under the old fold (interval 1's whole reading
    // banked underneath it); with no program armed nothing is banked.
    expect(frames[3]!.sessionElapsedSeconds).toBe(0);
    expect(frames[3]!.sessionDistanceMeters).toBe(0.7);
  });

  it("the interval countdown is NOT touched — it still reads the raw per-interval pair", () => {
    // MINOR-4, Task 6 fix round: corrected from present to past tense. AT
    // THE TIME this test (CR2 spec 1, Task 1) was written, walk 4's
    // single-interval capture had proved `intervalRemaining` correct as it
    // stood — a checkpoint-subtracting `computeRemainingForFrame` that this
    // capture's own checkpoint (always 0, no boundary in a one-interval
    // session) could never distinguish from having no checkpoint at all —
    // so nothing in THAT task was allowed to re-source it. Task 6
    // (interface-notes.md §20 items 17/24) later did re-source it: the
    // checkpoint subtraction is gone, `intervalRemaining` reads 0x0031's
    // own per-interval pair directly. This assertion is untouched by that
    // change regardless — with no program armed, `computeRemainingForFrame`
    // returns `null` on its own `!p` guard, before either version's
    // progress math ever runs.
    expect(replayWalk4().every((f) => f.intervalRemaining === null)).toBe(true);
  });

  it("a BACKWARDS-NOISE tick does not fold — the capture's own worst case is -0.57 s", () => {
    const transport = stubTransport();
    const driver = createPm5Driver(transport, createEventLog());
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    primeSiblings(transport);

    // `pm5-session3-final.log:4632-4633` — the largest backwards elapsed
    // tick anywhere in the record. Distance moves forward across it, which
    // is what makes a spurious fold obvious: folding would add the previous
    // frame's 40.2 m on top of this frame's own.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 20.5, 40.2),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 19.93, 40.5),
    );

    const frames = framesFrom(events);
    expect(frames[1]!.elapsedSeconds).toBe(19.93); // the noise is real
    expect(frames[1]!.sessionElapsedSeconds).toBe(19.93);
    expect(frames[1]!.sessionDistanceMeters).toBe(40.5);
  });

  it("a new program() resets the accumulator — the next run starts from zero", async () => {
    const transport = stubTransport();
    const driver = createPm5Driver(transport, createEventLog());
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    primeSiblings(transport);

    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    // MINIMAL_PROGRAM has exactly one interval, so there is no genuine
    // mid-run reset to construct (CR2 spec 1 removed the old fold's
    // elapsed-drop heuristic, the only thing that ever let a single-key
    // sequence "reset" at all). This climbs the one key to a genuinely
    // nonzero total, then ends on WORKOUTEND — required so the second
    // `programViaStub` below does not hang waiting for
    // `waitForPrepareSettle` (`:1861`'s own comment: a still-rowing machine
    // arms that wait).
    //
    // UPDATED, CR2 spec 1 Task 5 (controller ruling after this task's own
    // review — the ruling `session`'s own doc comment cites): a `"finished"`
    // tick is neither `"rowing"` nor `"resting"`, but it is NOT excluded from
    // `activeKey` any more — the WORKOUTEND tick's own final reading is now
    // max-merged into the highest existing key, same as every other write.
    // This test's own trailing reading (was 25/60, LOWER than the 45/110
    // rowing tick before it, so the old exclusion and the new inclusion were
    // numerically indistinguishable here) is changed to 50/115 — HIGHER than
    // 45/110 — specifically so this test can tell the two rules apart: the
    // expected total below is the finished tick's own bump, not the last
    // rowing tick's.
    for (const tick of [
      { state: WORKOUTSTATE_INTERVALWORKTIME, elapsed: 20, distance: 50 },
      { state: WORKOUTSTATE_INTERVALWORKTIME, elapsed: 45, distance: 110 },
      { state: WORKOUTSTATE_WORKOUTEND, elapsed: 50, distance: 115 },
    ]) {
      transport.notify(
        GENERAL_STATUS_UUID,
        generalStatusIn(tick.state, tick.elapsed, tick.distance),
      );
    }
    expect(framesFrom(events).at(-1)!.sessionElapsedSeconds).toBe(50);
    expect(framesFrom(events).at(-1)!.sessionDistanceMeters).toBe(115);

    // ...and run 2 must not inherit a metre or a second of it.
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 5, 10),
    );

    const last = framesFrom(events).at(-1)!;
    expect(last.sessionElapsedSeconds).toBe(5);
    expect(last.sessionDistanceMeters).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// CR2 spec 1, Task 8: `transports/fake.ts`'s own `synthesizeTerminated()` now
// reproduces CSAFE-DEF footnote 12's re-base (elapsed jumps BACKWARD to a
// smaller non-zero value, distance stands exactly still) as its honest
// DEFAULT reaction to a terminate — not a hand-built byte sequence. This is
// the fake-driven counterpart to `sessionTotals.test.ts`'s own terminate
// reproduction (that file's own `stubTransport` comment, written before this
// task, says the shape is "not a shape any scripted fake transport's
// timeline can produce" — this test is the proof that claim no longer holds
// for a genuine `driver.terminate()` reaction, even though that file still
// needs the stub for its OTHER hand-picked shapes; see its own updated
// comment). Drives the REAL `createPm5Driver` through the REAL fake, not
// synthesized bytes.
// ---------------------------------------------------------------------------

describe("createPm5Driver: the fake's own terminate re-base does not double the session total (CR2 spec 1 Task 8)", () => {
  function framesFrom(events: MonitorEvent[]): MonitorFrame[] {
    return events.flatMap((e) => (e.kind === "frame" ? [e.frame] : []));
  }

  it("driver.terminate() mid-piece: the fake re-bases elapsed backward to a smaller non-zero value while distance stands still, and sessionDistanceMeters does not double (today's design: was exactly 2.00x under the old elapsed-drop fold)", async () => {
    // Same numbers as sessionTotals.test.ts's own terminate reproduction
    // (pm5-session4b's own capture, state-architecture-review.md §7.5):
    // 33.57s/23.9m rowing, distance UNCHANGED at the terminate.
    const timeline: FakeTimelineEvent[] = [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 33.57,
        distanceMeters: 23.9,
        spm: 24,
        currentSplit: 110,
        heartRateBpm: null,
        programIntervalIndex: 0,
      },
    ];
    const { fake, driver, events } = harness(
      { program: MINIMAL_PROGRAM, events: timeline },
      { settleTicks: 0 }, // unrelated to this test's own focus; see the sibling tests' comment
    );

    await programAndArm(driver, fake, MINIMAL_PROGRAM);
    fake.tick(100); // delivers the rowing tick above

    const before = framesFrom(events).at(-1)!;
    expect(before.state).toBe("rowing");
    expect(before.sessionElapsedSeconds).toBeCloseTo(33.57, 2);
    expect(before.sessionDistanceMeters).toBeCloseTo(23.9, 1);

    await driver.terminate();

    const after = framesFrom(events).at(-1)!;
    expect(after.state).toBe("terminated");
    // The SHAPE this task teaches the fake: elapsed jumps BACKWARD to a
    // smaller, non-zero value; distance stands EXACTLY still.
    expect(after.elapsedSeconds).toBeLessThan(before.elapsedSeconds);
    expect(after.elapsedSeconds).toBeGreaterThan(0);
    expect(after.distanceMeters).toBe(before.distanceMeters);

    // The consequence CR2 spec 1's register map exists to fix: the total
    // does not double, and does not regress either. Under the OLD fold this
    // exact shape reported 47.8 (2.00x); the register map writes no key for
    // a "terminated" frame at all (`toProgramIndex` returns `null` for
    // every state that is not rowing/resting), so BOTH session totals stay
    // exactly what interval 0's rowing tick already registered — including
    // `sessionElapsedSeconds`, which a write-rule that let a terminated
    // frame's own (rebased, smaller) elapsed overwrite the key would pull
    // backward (see this task's own report for the self-mutation proving
    // this pair of assertions bites).
    expect(after.sessionElapsedSeconds).toBeCloseTo(33.57, 2);
    expect(after.sessionDistanceMeters).toBeCloseTo(23.9, 1);
  });
});

describe("createPm5Driver: construction-time subscriptions (fast-follow Task 1, design spec §5)", () => {
  it("subscribes 0x0039, 0x003A AND NOW 0x003F alongside every existing characteristic — the full pinned list", () => {
    const transport = stubTransport();
    createPm5Driver(transport, createEventLog());

    // Every characteristic this driver has ever subscribed at
    // construction — TRANSMIT (ack stream), the four status
    // characteristics, the two split-boundary halves, the two summary
    // halves, and now 0x003F (storage-spine design spec §2, delta-pass
    // B3). SAMPLE_RATE_UUID is written, never subscribed, so it does not
    // belong here. A removal of any of these three from this list is
    // exactly the regression this pin exists to catch — see the task
    // report's self-mutation evidence.
    expect(transport.subscribedUuids().sort()).toStrictEqual(
      [
        TRANSMIT_CHARACTERISTIC_UUID,
        GENERAL_STATUS_UUID,
        ADDITIONAL_STATUS_1_UUID,
        ADDITIONAL_STATUS_2_UUID,
        SPLIT_INTERVAL_DATA_UUID,
        ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
        END_OF_WORKOUT_SUMMARY_UUID,
        END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
        LOGGED_WORKOUT_UUID,
      ].sort(),
    );
  });
});

describe("createPm5Driver: summary-half receipt logging (fast-follow Task 1, design spec §5, mirrors split-half)", () => {
  it("0x0039 receipt logs summary-half with 'run closed' before any program() ever ran", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));

    const halves = log.entries().filter((e) => e.kind === "summary-half");
    expect(halves).toHaveLength(1);
    expect(halves[0]!.detail).toContain("0x0039");
    expect(halves[0]!.detail).toContain("run closed");
  });

  it("0x003A receipt logs summary-half too, independently of 0x0039 — no pairing gate (review I5)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    // 0x003A arrives ALONE — no 0x0039 notification at all. If the driver
    // paired the two the way it pairs 0x0037/0x0038, this would emit
    // nothing (or worse, hang waiting for a partner); the summary pair is
    // deliberately unpaired precisely so a dropped 0x0039 or 0x003A never
    // costs the other's own receipt log.
    transport.notify(
      END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
      new Uint8Array(19),
    );

    const halves = log.entries().filter((e) => e.kind === "summary-half");
    expect(halves).toHaveLength(1);
    expect(halves[0]!.detail).toContain("0x003A");
  });

  it("0x003F receipt logs verification-received with 'run closed' before any program() ever ran, and stores nothing (no run to attribute it to)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    transport.notify(LOGGED_WORKOUT_UUID, Uint8Array.from([0xaa, 0xbb]));

    const entries = log
      .entries()
      .filter((e) => e.kind === "verification-received");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("0x003F");
    expect(entries[0]!.detail).toContain("run closed");
  });

  it("0x003F receipt logs 'run open' while a program is armed", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);

    transport.notify(LOGGED_WORKOUT_UUID, Uint8Array.from([0xaa, 0xbb]));

    const entries = log
      .entries()
      .filter((e) => e.kind === "verification-received");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("run open");
  });

  it("logs 'run open' while a program is armed, and both a re-fire and 0x003A never touch the count or content of the OTHER characteristic's own entries", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);

    transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));
    // The re-fire wrinkle (review I5, ecosystem review): 0x0039 notifies a
    // SECOND time ~1 minute later when an HRM is active. This task logs
    // every receipt — consuming the re-fire "once" is a later task's
    // reconciliation-gate job, not this one's.
    transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));
    transport.notify(
      END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
      new Uint8Array(19),
    );

    const halves = log.entries().filter((e) => e.kind === "summary-half");
    expect(halves).toHaveLength(3);
    expect(halves[0]!.detail).toContain("0x0039");
    expect(halves[0]!.detail).toContain("run open");
    expect(halves[1]!.detail).toContain("0x0039");
    expect(halves[1]!.detail).toContain("run open");
    expect(halves[2]!.detail).toContain("0x003A");
    expect(halves[2]!.detail).toContain("run open");
  });

  /** Mirrors `driver.ts`'s own module-private `toHex` byte-for-byte — the
   *  established local-helper idiom this file already uses (Task 1
   *  fix-3's own `hex()`, same file, same reasoning: no test-only export
   *  of an internal formatting detail). */
  function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
  }

  it("Phase LL Task 1 (link-truth §1): 0x0039's ring entry now carries its own hex, not just the narrative line", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    const bytes = new Uint8Array(20);
    bytes.set([0xaa, 0xbb, 0xcc, 0xdd], 0);
    transport.notify(END_OF_WORKOUT_SUMMARY_UUID, bytes);

    const halves = log.entries().filter((e) => e.kind === "summary-half");
    expect(halves).toHaveLength(1);
    expect(halves[0]!.detail).toContain(`raw=${hex(bytes)}`);
  });

  it("Phase LL Task 1: 0x003A's ring entry now carries hex too — its own callback used to take NO bytes parameter at all, so this hex could never reach the ring by any path", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    const bytes = new Uint8Array(19);
    bytes.set([0x11, 0x22, 0x33], 0);
    transport.notify(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, bytes);

    const halves = log.entries().filter((e) => e.kind === "summary-half");
    expect(halves).toHaveLength(1);
    expect(halves[0]!.detail).toContain("0x003A");
    expect(halves[0]!.detail).toContain(`raw=${hex(bytes)}`);
  });

  it("a 0x0039 notification produces exactly one summary-log-stamp ring entry carrying the decoded wire= stamp and wall= (RC-2, storage-spine design spec §2, PR 1 Task 3)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log, { now: () => 0 });

    // Walk-2026-08-23 keystone's own seq 516 raw bytes (interface-notes.md
    // §24), date/time at offsets 0-3: `78 35 1c 09` decodes to
    // 2026-08-23 09:28 (`parseSummaryLogStamp`'s own formula, re-derived by
    // hand in `burstReplay.test.ts`'s own comment on the same bytes) — the
    // rest of the 20-byte layout is left zeroed, which `parseEndOfWorkout
    // Summary` still decodes (this entry fires off the stamp, independent
    // of what the other nine fields read).
    const bytes = new Uint8Array(20);
    bytes.set([0x78, 0x35, 0x1c, 0x09], 0);
    transport.notify(END_OF_WORKOUT_SUMMARY_UUID, bytes);

    const stamps = log.entries().filter((e) => e.kind === "summary-log-stamp");
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.detail).toContain("wire=2026-08-23 09:28");
    expect(stamps[0]!.detail).toContain("wall=");
  });

  it("a second 0x0039 (the recovery-HR re-fire) produces a SECOND summary-log-stamp entry — one per NOTIFICATION, not one per run (spec exit criterion 3)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));
    transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));

    const stamps = log.entries().filter((e) => e.kind === "summary-log-stamp");
    expect(stamps).toHaveLength(2);
  });

  it("a garbled (too-short) 0x0039 produces NO summary-log-stamp entry — the stamp is derived off the same successful parse gate as the totals", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);

    transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(19));

    const stamps = log.entries().filter((e) => e.kind === "summary-log-stamp");
    expect(stamps).toHaveLength(0);
  });
});

describe("createPm5Driver: THE SUMMARY-FALLBACK GATE (fast-follow Task 2, design spec §5, adversarial B2/B3/I4/I5)", () => {
  // What this gate is, in one line: when the final 0x0037/0x0038 split is
  // DROPPED (the ecosystem review's own failure mode), the run's last
  // interval is synthesized from 0x0039's end-of-workout summary — but only
  // at grace EXPIRY, only from numbers it can honestly derive, and never
  // over a split that merely ran late (review I4's precedence ruling).
  //
  // Every arm below drives the REAL wire bytes through the REAL decoders
  // (`buildEndOfWorkoutSummaryBytes` -> `parseEndOfWorkoutSummary`), the
  // same end-to-end discipline the split-path tests above hold to.

  const ONE_INTERVAL_PROGRAM: WorkoutProgram = {
    intervals: [
      {
        type: "work",
        kind: "time",
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 0,
      },
    ],
  };

  /** Storage-spine design spec §2 (early side): a 2-interval program so
   *  "still open, not YET in the final interval" and "still open, in its
   *  final interval already" are two genuinely different, observable
   *  machine states — `ONE_INTERVAL_PROGRAM` above cannot tell them apart
   *  (every tick of a 1-interval program IS its final one, the spec's own
   *  "single-interval blindness" note). */
  const TWO_INTERVAL_PROGRAM: WorkoutProgram = {
    intervals: [
      {
        type: "work",
        kind: "time",
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 30,
      },
      {
        type: "work",
        kind: "time",
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 0,
      },
    ],
  };

  /** A hand-fired stand-in for the driver's reconcile timer
   *  (`DriverOptions.schedule`) — the same shape and the same reason
   *  `useMonitorSession.test.ts`'s own `manualSchedule` exists: a test
   *  FIRES the deadline rather than waiting 3 real seconds, and an
   *  unfinished test leaves no live timer behind. */
  function manualSchedule() {
    const calls: { ms: number; fire: () => void; cancelled: boolean }[] = [];
    return {
      calls,
      schedule: (cb: () => void, ms: number): (() => void) => {
        const call = { ms, fire: cb, cancelled: false };
        calls.push(call);
        return () => {
          call.cancelled = true;
        };
      },
      pending(): { ms: number; fire: () => void; cancelled: boolean } | null {
        const live = calls.filter((c) => !c.cancelled);
        return live[live.length - 1] ?? null;
      },
    };
  }

  // Doubles as `summary-observations`' own `detail` fixture (RC-3 Task 3):
  // its nine fields are exactly `MachineSummaryDetail`'s nine, field for
  // field — `summaryObservationsEvent` builds `detail` from the SAME
  // `WorkoutSummary` this object seeds `summaryBytes` from, so every
  // `detail:` expectation below reuses this constant rather than
  // hand-duplicating its values.
  const FULL_SUMMARY = {
    avgStrokeRate: 24,
    endingHeartRateBpm: 168,
    avgHeartRateBpm: 152,
    minHeartRateBpm: 96,
    maxHeartRateBpm: 175,
    dragFactorAverage: 128,
    recoveryHeartRateBpm: 120,
    workoutType: 8,
    avgPaceSecondsPer500m: 125,
  };

  /** 0x003F's eight bytes, the keystone capture's own
   *  (`walk-2026-08-23`'s `photo-w4-verification-code.jpeg` reads
   *  `6EF3-D827 5B55-52E1` off the PM5's own screen against exactly
   *  these). Shared by the terminate-door tests below; the natural-finish
   *  tests above keep their own inline copies, which predate this. */
  const VERIFICATION_BYTES = Uint8Array.from([
    0x27, 0xd8, 0xf3, 0x6e, 0xe1, 0x52, 0x55, 0x5b,
  ]);

  /** 0x0039's real 20 bytes for a workout that covered `elapsedSeconds` /
   *  `meters`. Every average field is deliberately POPULATED with a
   *  distinctive value — the gate must drop them, and a fixture that left
   *  them at zero could not tell "dropped" from "copied a zero". */
  function summaryBytes(elapsedSeconds: number, meters: number): Uint8Array {
    return buildEndOfWorkoutSummaryBytes({
      ...FULL_SUMMARY,
      elapsedSeconds,
      meters,
    });
  }

  function primedGate(): {
    transport: ReturnType<typeof stubTransport>;
    log: ReturnType<typeof createEventLog>;
    driver: ReturnType<typeof createPm5Driver>;
    events: MonitorEvent[];
    clock: ReturnType<typeof manualClock>;
    timer: ReturnType<typeof manualSchedule>;
  } {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    const timer = manualSchedule();
    const driver = createPm5Driver(transport, log, {
      now: clock.now,
      schedule: timer.schedule,
    });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    return { transport, log, driver, events, clock, timer };
  }

  function boundaries(events: MonitorEvent[]) {
    return events.filter((e) => e.kind === "intervalComplete");
  }

  function verdicts(log: ReturnType<typeof createEventLog>) {
    return log.entries().filter((e) => e.kind === "summary-reconciled");
  }

  /** Rows the single-interval piece to a natural finish: one rowing tick,
   *  then WORKOUTEND. Leaves the grace open and the reconcile armed. */
  async function rowToFinish(
    g: Awaited<ReturnType<typeof primedGate>>,
    program: WorkoutProgram = ONE_INTERVAL_PROGRAM,
  ): Promise<void> {
    await programViaStub(g.driver, g.transport, program);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
  }

  it("(a) PRECEDENCE / THE CANONICAL LATE SIDE: a split at t+200ms claims the grace, and the summary that follows is now ADMITTED for observations instead of discarded — final-review fix wave, HIGH-1, the reviewer's own probe shape", async () => {
    const g = primedGate();
    await rowToFinish(g);

    // The split is merely LATE, not lost — the case review I4 says must
    // never be displaced (its per-interval averages are real data the
    // summary's whole-workout averages cannot reconstruct). It also
    // CLAIMS the finish grace the instant it lands (`emitIntervalComplete`
    // nulls `finishGraceUntil`), which is exactly what used to shut the
    // door on every summary that followed it — the genuine late side,
    // HIGH-1's own finding: on the real wire the split precedes 0x0039 by
    // ~270ms EVERY time (notes §24 item 1), so this ordering is not an
    // edge case, it is the ordinary one.
    g.clock.advance(200);
    g.transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    g.transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));
    expect(boundaries(g.events)).toHaveLength(1);

    // ...and the summary lands afterwards, inside the same window — now
    // ADMITTED (HIGH-1's fix): the split already recorded the final
    // interval, so this can only ever feed observations, never a
    // derivation the grace's own closure would make premature.
    g.clock.advance(300);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(60, 200));
    // Complete on split + summary, but the hash has not arrived — HIGH-2's
    // sub-window, not the fallback deadline.
    expect(g.timer.pending()?.ms).toBe(200);

    // The hash arrives (+38ms, the measured 0x0039->0x003F gap, notes §24
    // item 1) — the canonical late-side fixture's third wire event, and
    // what finally drains this run for real.
    const verificationBytes = Uint8Array.from([
      0x27, 0xd8, 0xf3, 0x6e, 0xe1, 0x52, 0x55, 0x5b,
    ]);
    g.clock.advance(38);
    g.transport.notify(LOGGED_WORKOUT_UUID, verificationBytes);
    expect(g.timer.pending()).toBeNull();

    expect(boundaries(g.events)).toHaveLength(1);
    expect(boundaries(g.events)[0]).toMatchObject({
      actual: { index: 0, avgSpm: 24, elapsedSeconds: 60, distanceMeters: 200 },
      finalBoundary: true,
    });
    // TWO entries, and the pair is the whole story: the split claimed the
    // grace, so the summary that followed found the gate already shut —
    // but the split it lost to is ALSO what makes this summary admissible
    // for observations (`buffered`, not `out-of-window` any more), and the
    // drain then reported `split-won` with those observations folded in.
    expect(verdicts(g.log).map((e) => e.detail.split(" ")[0])).toStrictEqual([
      "buffered",
      "split-won",
    ]);
    // The SPECIFIC reason, not a disjunction: "a boundary claimed it" and
    // "this run ended by terminate" both leave `finishGraceUntil === null`,
    // and a stash reader has to tell them apart (review Minor-2). Test (f)
    // pins the other side of the same discrimination.
    expect(verdicts(g.log)[0]!.detail).toContain(
      "a boundary has already claimed this run's grace",
    );
    expect(verdicts(g.log)[0]!.detail).not.toContain("terminate");
    // WHAT USED TO BE LOST, NOW STORED: the exact defect HIGH-1 found —
    // this record used to carry zero `summary-observations` events.
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 60, workDistanceMeters: 200 },
        detail: FULL_SUMMARY,
        verificationBytes: Array.from(verificationBytes),
      },
    ]);
  });

  it("(a2) PRECEDENCE, THE HARD ORDER: the summary arrives FIRST and a split still beats it — held evidence is discarded unread, never filed ahead of the real thing", async () => {
    // The inversion that matters (review I4): the ecosystem's own ordering
    // evidence says splits-then-summaries, but that is emulation-derived
    // and has never been read off OUR wire. If 0x0039 can land first, a
    // gate that filed on receipt would permanently displace the split's
    // per-interval averages with a workout average — the data loss R1
    // exists to prevent, caused by R1.
    const g = primedGate();
    await rowToFinish(g);

    g.clock.advance(200);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(999, 9999));
    // Nothing is filed on receipt. Nothing may be.
    expect(boundaries(g.events)).toHaveLength(0);
    expect(verdicts(g.log)).toHaveLength(0);

    g.clock.advance(300);
    g.transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    g.transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));
    // Review fix round 1, HIGH finding: `maybeReconcileImmediately` fires
    // the INSTANT this second notification completes the split-won
    // precondition (the summary was already held above) — but final-review
    // fix wave HIGH-2 widens "complete" to include the verification hash:
    // with no 0x003F yet, this RE-ARMS the one deadline slot to the short
    // `HASH_SUBWINDOW_MS` (200ms) instead of draining straight to `null`.
    expect(g.timer.pending()?.ms).toBe(200);
    // The SPLIT's own boundary already filed — that emission is
    // independent of the reconcile/drain, which only decides the
    // OBSERVATIONS event below.
    expect(boundaries(g.events)).toHaveLength(1);

    // The hash arrives — the measured +38.2ms gap from 0x0039
    // (pm5-interface-notes.md §24 item 1), now the canonical late-side
    // fixture's own third wire event. `LOGGED_WORKOUT_UUID`'s own
    // subscriber calls `maybeReconcileImmediately` again, finds
    // `verificationBytes` set this time, and drains — for real, to `null`
    // — right here.
    const verificationBytes = Uint8Array.from([
      0x27, 0xd8, 0xf3, 0x6e, 0xe1, 0x52, 0x55, 0x5b,
    ]);
    g.clock.advance(38);
    g.transport.notify(LOGGED_WORKOUT_UUID, verificationBytes);
    expect(g.timer.pending()).toBeNull();

    // The SPLIT's numbers, including the averages only it carries.
    expect(boundaries(g.events)).toHaveLength(1);
    expect(boundaries(g.events)[0]).toMatchObject({
      actual: { index: 0, elapsedSeconds: 60, distanceMeters: 200, avgSpm: 24 },
      finalBoundary: true,
    });
    expect(verdicts(g.log)).toHaveLength(1);
    expect(verdicts(g.log)[0]!.detail).toContain("split-won");
    // CORRECTED (storage-spine design spec §2, PR 1): the split still wins
    // the ACTUAL — review I4's ruling above is untouched — but a held
    // 0x0039 is no longer thrown away. `"discarded unread"` is GONE from
    // this branch's own log line, and the totals it used to describe as
    // lost now ride a `summary-observations` event instead.
    expect(verdicts(g.log)[0]!.detail).not.toContain("discarded unread");
    expect(verdicts(g.log)[0]!.detail).toContain("recorded as observations");
    // NOW carries the hash too (final-review fix wave, HIGH-2) — omitted
    // entirely before this fix, since the drain used to fire on 0x0039
    // alone, 38ms before this byte ever arrived.
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 999, workDistanceMeters: 9999 },
        detail: FULL_SUMMARY,
        verificationBytes: Array.from(verificationBytes),
      },
    ]);
  });

  it("(b) THE DROPPED SPLIT: no split ever arrives, and at the 3000ms deadline the summary fills the final interval from its own totals", async () => {
    const g = primedGate();
    await rowToFinish(g);

    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));

    // NOT YET. The summary is stored, not filed — a split still has until
    // the deadline to arrive and win.
    expect(boundaries(g.events)).toHaveLength(0);
    expect(g.timer.pending()?.ms).toBe(3000);

    g.clock.advance(2600);
    g.timer.pending()!.fire();

    expect(boundaries(g.events)).toHaveLength(1);
    expect(boundaries(g.events)[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, elapsedSeconds: 62.5, distanceMeters: 214 },
      finalBoundary: true,
    });
    const verdict = verdicts(g.log);
    expect(verdict).toHaveLength(1);
    expect(verdict[0]!.detail).toContain("filled-from-summary");
    // The derivation NUMBERS ride the entry — the stash must answer "which
    // source fed the record, and from what" in one read.
    expect(verdict[0]!.detail).toContain("62.5");
    expect(verdict[0]!.detail).toContain("214");
  });

  it("(b2) THE TWIN (Task 7): disconnect() drains a still-pending reconcile into a LIVE listener instead of discarding it, the same F7 rule onDisconnect already applies to a passive drop", async () => {
    // `stubTransport().disconnect()` never fires the driver's own
    // `onDisconnect` callback — exactly `Transport.onDisconnect`'s
    // documented contract for a caller-initiated hang-up
    // (`domain/monitor/types.ts`, `webBluetooth.ts`'s own M-2 guard) — so
    // this exercises `disconnect()`'s OWN drain, not the passive-drop path
    // test "A LINK DROP BEFORE ANY SUMMARY ARRIVES" above already covers.
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));

    // NOT YET — same as (b): the deadline has not fired, so nothing is
    // filed and the summary is only held.
    expect(boundaries(g.events)).toHaveLength(0);
    expect(g.timer.pending()?.ms).toBe(3000);

    // The caller hangs up before the deadline — before this task this
    // discarded the held summary outright (`disconnect()` used to just
    // cancel `pendingSummaryReconcile`, never call `reconcileSummary`).
    await g.driver.disconnect();

    // The verdict reached the STILL-SUBSCRIBED listener.
    expect(boundaries(g.events)).toHaveLength(1);
    expect(boundaries(g.events)[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, elapsedSeconds: 62.5, distanceMeters: 214 },
      finalBoundary: true,
    });
    // The timer is consumed, not left dangling — `disconnect()` still
    // clears `pendingSummaryReconcile` the way it always did.
    expect(g.timer.pending()).toBeNull();
    const verdict = verdicts(g.log);
    expect(verdict).toHaveLength(1);
    expect(verdict[0]!.detail).toContain("filled-from-summary");
  });

  it("RC-9a (design spec 2026-08-25-free-oracles §1): the final interval filled from 0x0039 suppresses the avg-pace verdict too — deriveFinalIntervalFromSummary builds our side FROM the machine's own summary, so the comparison would be tautological", async () => {
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    // A genuine work-state 0x0032 sample so the suppression below is proven
    // to fire for THE SUMMARY-FILL REASON specifically, not merely "no
    // data was ever observed" — a strictly weaker assertion this same run
    // could otherwise satisfy by accident.
    // GENERAL STATUS FIRST, matching the real wire order this task's own
    // decode confirmed (`session-2-wu-4unequal.jsonl` seq 2975→2976→2977 —
    // 0x0031 always precedes 0x0032/0x0033 for the same tick): the 0x0032
    // merge callback judges its own `averageSplit` against `raw.workoutState`
    // AS ALREADY MERGED, so this order is what makes it see workoutState 4
    // rather than the armed readback's stale WAITTOBEGIN.
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    g.transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(130.5));
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );

    // THE DROPPED SPLIT, same shape as (b) above: no split ever arrives, so
    // the deadline fills the final interval from 0x0039's own totals.
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    g.clock.advance(2600);
    g.timer.pending()!.fire();

    expect(verdicts(g.log)[0]!.detail).toContain("filled-from-summary");

    const avgPace = g.log
      .entries()
      .filter((e) => e.kind === "avg-pace-verdict");
    expect(avgPace).toHaveLength(1);
    expect(avgPace[0]!.detail).toContain("suppressed");
    expect(avgPace[0]!.detail).toContain("filled from 0x0039");
    expect(avgPace[0]!.detail).toContain("tautological");
  });

  /** Sea Fret rowed with its first two intervals recorded the ordinary way
   *  and the FINAL split dropped — the shape every multi-interval arm
   *  below needs, with the two priors' own measured values as the
   *  parameter, because what those values MEAN (work-only or work plus
   *  trailing rest) is the whole subject of §23 walk item 4.
   *
   *  Sea Fret compiles to three intervals: a 300 s opener with no rest,
   *  then 2x240 s work each carrying a 60 s rest — so the program's own
   *  total rest allowance is 120 s, verified off `compileProgram`'s output
   *  for this fixture, and that is the number the two readings below
   *  differ by. */
  async function seaFretWithTwoPriorsRecorded(
    g: ReturnType<typeof primedGate>,
    priors: { seconds: number; meters: number }[],
  ): Promise<WorkoutProgram> {
    const program = seaFretProgram();
    expect(program.intervals).toHaveLength(3);
    expect(
      program.intervals.reduce((total, i) => total + i.restSeconds, 0),
    ).toBe(120);
    await programViaStub(g.driver, g.transport, program);

    // Intervals 0 and 1 arrive the ordinary way, in-run: machine
    // Split/Interval Numbers 1 and 2 normalize to our 0 and 1 through
    // §19.8's minus-one offset.
    let cumulativeSeconds = 0;
    let cumulativeMeters = 0;
    priors.forEach((prior, i) => {
      cumulativeSeconds += prior.seconds;
      cumulativeMeters += prior.meters;
      g.transport.notify(
        GENERAL_STATUS_UUID,
        generalStatusIn(
          WORKOUTSTATE_INTERVALWORKTIME,
          cumulativeSeconds,
          cumulativeMeters,
        ),
      );
      g.transport.notify(
        SPLIT_INTERVAL_DATA_UUID,
        splitHalf(i + 1, prior.seconds, prior.meters),
      );
      g.transport.notify(
        ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
        asSplitHalf(i + 1, 22 + i),
      );
    });
    expect(boundaries(g.events)).toHaveLength(priors.length);

    // The piece ends and the LAST split is the one that drops.
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 900, 3350),
    );
    return program;
  }

  /** The two priors as WORK-ONLY readings — 0x0037's Split/Interval Time
   *  carrying each interval's rowing and none of its trailing rest. Both
   *  multi-interval arms below use the identical priors; only the SUMMARY
   *  changes between them, which is what isolates §23 walk item 4's
   *  question to one number. */
  const SEA_FRET_WORK_ONLY_PRIORS = [
    { seconds: 300, meters: 1000 }, // the opener, which carries no rest anyway
    { seconds: 240, meters: 1200 }, // work interval 1, its 60s rest excluded
  ];
  /** 300 + 240 + 240: the three intervals' WORK, with the programmed 120 s
   *  of rest excluded — the reading the derivation assumes. */
  const SEA_FRET_REST_EXCLUSIVE_ELAPSED = 780;
  /** The same piece read the OTHER way: work plus the programmed 120 s of
   *  rest. Distance is deliberately IDENTICAL in both readings — a rower
   *  sitting through a rest banks no meters, so the disagreement lives in
   *  elapsed alone, which is also why no meters check could ever catch it. */
  const SEA_FRET_REST_INCLUSIVE_ELAPSED = 900;
  const SEA_FRET_TOTAL_METERS = 3350;

  it("(c) MULTI-INTERVAL, every prior recorded: the final interval is the summary MINUS the priors, to the exact value (Sea Fret, a real library workout)", async () => {
    const g = primedGate();
    await seaFretWithTwoPriorsRecorded(g, SEA_FRET_WORK_ONLY_PRIORS);

    // THE PREMISE THIS ARM PINS (§23 walk item 4): the summary's totals and
    // the recorded priors measure the same span — here, both rest-EXCLUSIVE.
    g.clock.advance(500);
    g.transport.notify(
      END_OF_WORKOUT_SUMMARY_UUID,
      summaryBytes(SEA_FRET_REST_EXCLUSIVE_ELAPSED, SEA_FRET_TOTAL_METERS),
    );
    g.clock.advance(2500);
    g.timer.pending()!.fire();

    expect(boundaries(g.events)).toHaveLength(3);
    expect(boundaries(g.events)[2]).toMatchObject({
      actual: {
        index: 2,
        // 780 - (300 + 240) = 240, the final interval's programmed work
        // exactly; 3350 - (1000 + 1200) = 1150.
        elapsedSeconds: 240,
        distanceMeters: 1150,
      },
      finalBoundary: true,
    });
    const detail = verdicts(g.log)[0]!.detail;
    expect(detail).toContain("filled-from-summary");
    expect(detail).toContain("1150");
    // ...and the entry NAMES the program's own rest, so an erg-side reader
    // can hand-check the premise this arm asserts rather than trusting it
    // (review Important-1, leg 3). The premise is no longer unobserved —
    // interface-notes §27.1 settled it on the wire, RC-12 reconciled the
    // string — so the citation moved with it and the number stayed.
    expect(detail).toContain("120s");
    expect(detail).toContain("§27.1");
  });

  it("(c2) THE WALK'S DISCRIMINATOR: read the SAME piece rest-inclusively and the fill is 120s too long — positive, plausible, and past every guard", async () => {
    // This test does not assert desired behaviour. It PINS THE EXPOSURE, so
    // that the consequence of the losing answer is written down and
    // measured (review Important-1, leg 4).
    //
    // THE WIRE HAS SINCE ANSWERED (interface-notes §27.1, RC-12): on this
    // firmware 0x0039 is work-only, so the losing branch is not what our
    // machine does. The test stays, and stays named a discriminator,
    // because the exposure is a property of the SUBTRACTION and not of the
    // firmware: nothing in this driver would notice a machine that answered
    // the other way, which is exactly what the assertion below records.
    //
    // Same program, same recorded priors, same meters — the ONLY change is
    // the summary's Elapsed Time, read as work-plus-rest (900) instead of
    // work-only (780). The subtraction stays positive, so
    // `elapsedSeconds <= 0` never fires: the rower would be handed a final
    // interval of 360s for a 240s piece, and nothing in the driver could
    // tell. That is why the answer is a walk item and a `how` string rather
    // than a predicate.
    const g = primedGate();
    await seaFretWithTwoPriorsRecorded(g, SEA_FRET_WORK_ONLY_PRIORS);

    g.clock.advance(500);
    g.transport.notify(
      END_OF_WORKOUT_SUMMARY_UUID,
      summaryBytes(SEA_FRET_REST_INCLUSIVE_ELAPSED, SEA_FRET_TOTAL_METERS),
    );
    g.clock.advance(2500);
    g.timer.pending()!.fire();

    // Filled, not declined — the exposure, stated as an assertion.
    expect(boundaries(g.events)).toHaveLength(3);
    expect(boundaries(g.events)[2]).toMatchObject({
      actual: {
        index: 2,
        // 900 - 540 = 360. The programmed work is 240; the excess is 120,
        // which is the program's total rest to the second.
        elapsedSeconds: 360,
        // The meters are RIGHT even so — the mismatch is a time-only
        // failure, which is the other half of why it is silent.
        distanceMeters: 1150,
      },
      finalBoundary: true,
    });
    expect(360 - 240).toBe(120);

    // WHAT MAKES IT FINDABLE AT THE ERG: the verdict carries both the
    // derived number and the program's own rest, so the check James runs on
    // the stash is one subtraction.
    const detail = verdicts(g.log)[0]!.detail;
    expect(detail).toContain("filled-from-summary");
    expect(detail).toContain("360s");
    expect(detail).toContain("This program's own rest totals 120s");
    // And the clause spells out the losing answer's own consequence as an
    // UPPER BOUND on the error, naming the derived figure it applies to.
    // It is deliberately not a point value: `programmedRestSeconds` counts
    // the final interval's own trailing rest, which never elapses, so a
    // subtraction would under-state the answer and can print a negative
    // duration on a real seeded shape (exit pass, finding M-1).
    expect(detail).toContain("this 360s would be too long by up to that much");
  });

  it("A REST-FREE MULTI-INTERVAL PROGRAM says so: with no rest to mis-count, the entry states that instead of a warning it cannot justify", async () => {
    // The other side of the `how` string's rest clause. §23 walk item 4's
    // premise can only bite where there IS rest, so a continuous piece
    // gets the plain statement rather than a caveat about a hazard its own
    // program cannot produce — a warning printed on every run is a warning
    // nobody reads at the erg.
    const restFree: WorkoutProgram = {
      intervals: Array.from({ length: 2 }, () => ({
        type: "work" as const,
        kind: "time" as const,
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 0,
      })),
    };
    const g = primedGate();
    await programViaStub(g.driver, g.transport, restFree);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 250),
    );
    g.transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 250));
    g.transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 120, 505),
    );
    g.clock.advance(500);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(120, 505));
    g.clock.advance(2500);
    g.timer.pending()!.fire();

    expect(boundaries(g.events)[1]).toMatchObject({
      actual: { index: 1, elapsedSeconds: 60, distanceMeters: 255 },
      finalBoundary: true,
    });
    const detail = verdicts(g.log)[0]!.detail;
    expect(detail).toContain("no programmed rest");
    expect(detail).not.toContain("too long");
  });

  it("(d) A MISSING PRIOR DECLINES: with interval 1 never recorded the subtraction would file someone else's meters, so nothing is written", async () => {
    const g = primedGate();
    // Only interval 0 is recorded. Interval 1's boundary was lost too —
    // a different, unexplained loss from the final-split drop this gate is
    // built for, and not one it may paper over.
    await seaFretWithTwoPriorsRecorded(g, [SEA_FRET_WORK_ONLY_PRIORS[0]!]);

    g.clock.advance(500);
    g.transport.notify(
      END_OF_WORKOUT_SUMMARY_UUID,
      summaryBytes(SEA_FRET_REST_EXCLUSIVE_ELAPSED, SEA_FRET_TOTAL_METERS),
    );
    g.clock.advance(2500);
    g.timer.pending()!.fire();

    // One boundary in total: interval 0's own, and nothing else.
    expect(boundaries(g.events)).toHaveLength(1);
    expect(boundaries(g.events)[0]).toMatchObject({ actual: { index: 0 } });
    const verdict = verdicts(g.log);
    expect(verdict).toHaveLength(1);
    expect(verdict[0]!.detail).toContain("declined");
    // The REASON, named: which interval is missing is the whole diagnosis.
    expect(verdict[0]!.detail).toContain("interval(s) 1 were never recorded");
    expect(verdict[0]!.detail).toContain("nothing filed");
  });

  it("THE WALK'S OWN INSTRUMENT (final review IMP-1): a HEALTHY multi-interval row with rest puts 0x0039's decoded totals in the stash, next to what the splits recorded", async () => {
    // The row Task 7 actually rows: nothing drops, the final split claims
    // the grace, and the summary is redundant to the RECORD. It is not
    // redundant to the WALK — §23's walk items 2 and 4 can only be settled
    // by comparing 0x0039's own numbers against the splits', and before
    // this entry existed those numbers reached the stash on exactly one
    // path (`filled-from-summary`), which requires the radio to misbehave.
    const g = primedGate();
    await seaFretWithTwoPriorsRecorded(g, SEA_FRET_WORK_ONLY_PRIORS);

    // The final split arrives the ordinary way, inside the grace, and wins.
    g.clock.advance(200);
    g.transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(3, 240, 1150));
    g.transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(3, 26));
    expect(boundaries(g.events)).toHaveLength(3);

    // ...and 0x0039 lands afterwards, as the ecosystem's own ordering says
    // it does (splits-then-summaries).
    g.clock.advance(200);
    g.transport.notify(
      END_OF_WORKOUT_SUMMARY_UUID,
      summaryBytes(SEA_FRET_REST_EXCLUSIVE_ELAPSED, SEA_FRET_TOTAL_METERS),
    );

    const totals = g.log.entries().filter((e) => e.kind === "summary-totals");
    expect(totals).toHaveLength(1);
    // 0x0039's own decoded numbers — the thing the walk hand-checks against
    // the PM5's own end-of-workout screen.
    expect(totals[0]!.detail).toContain("elapsed=780s");
    expect(totals[0]!.detail).toContain("distance=3350m");
    expect(totals[0]!.detail).toContain("workoutType=8");
    // ...beside what the SPLITS recorded, so the comparison needs no
    // arithmetic off-screen: 300 + 240 + 240 = 780, and 120s of rest sits
    // between them.
    expect(totals[0]!.detail).toContain(
      "recorded 3 interval(s) totalling 780s/3350m",
    );
    expect(totals[0]!.detail).toContain("120s of rest");
    // ...and the rule that reads them, so the verdict is reached at the erg
    // rather than carried home.
    expect(totals[0]!.detail).toContain("§23 walk items 2 and 4 settle HERE");

    // The record is untouched by any of this: the split won, and the
    // entry is diagnostics. HIGH-1's fix (final-review fix wave): the
    // split already recorded the final interval, so this late summary is
    // now ADMITTED (`buffered`, never `out-of-window`) — it just still
    // changes nothing about the ACTUAL, which the split alone already
    // filed.
    expect(boundaries(g.events)).toHaveLength(3);
    g.clock.advance(2600);
    g.timer.pending()!.fire();
    expect(boundaries(g.events)).toHaveLength(3);
    expect(verdicts(g.log).map((e) => e.detail.split(" ")[0])).toStrictEqual([
      "buffered",
      "split-won",
    ]);
  });

  it("...and it fires on EVERY path a 0x0039 can take, including with no run at all and on the minute-later re-fire", async () => {
    // One entry, before the window question, so no reachable ordering
    // leaves the walk without its numbers (final review IMP-1).
    const noRun = primedGate();
    noRun.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(60, 250));
    const orphan = noRun.log
      .entries()
      .filter((e) => e.kind === "summary-totals");
    expect(orphan).toHaveLength(1);
    expect(orphan[0]!.detail).toContain("elapsed=60s");
    expect(orphan[0]!.detail).toContain("nothing here to compare");

    // The stored path and the re-fire path, on one run.
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    g.clock.advance(2600);
    g.timer.pending()!.fire();
    g.clock.advance(60_000);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));

    expect(
      g.log.entries().filter((e) => e.kind === "summary-totals"),
    ).toHaveLength(2);
    // A garbled 0x0039 is the ONE path with no totals to state — it has no
    // decoded values to report, and says so under its own kind instead.
    const garbled = primedGate();
    await rowToFinish(garbled);
    garbled.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(19));
    expect(
      garbled.log.entries().filter((e) => e.kind === "summary-totals"),
    ).toHaveLength(0);
    expect(
      garbled.log.entries().filter((e) => e.kind === "summary-undecodable"),
    ).toHaveLength(1);
  });

  it("(e) THE RE-FIRE IS INERT: 0x0039 again a minute later logs out-of-window and files nothing", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    g.clock.advance(2600);
    g.timer.pending()!.fire();
    expect(boundaries(g.events)).toHaveLength(1);

    // The HRM wrinkle (ecosystem review:420-422): 0x0039 notifies a SECOND
    // time roughly a minute after the finish, carrying late recovery-HR
    // data. Different numbers, deliberately — if this one were ever filed
    // the record would show it.
    g.clock.advance(60_000);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(999, 9999));

    expect(boundaries(g.events)).toHaveLength(1);
    expect(boundaries(g.events)[0]).toMatchObject({
      actual: { elapsedSeconds: 62.5, distanceMeters: 214 },
    });
    const outOfWindow = verdicts(g.log).filter((e) =>
      e.detail.includes("out-of-window"),
    );
    expect(outOfWindow).toHaveLength(1);
    // Receipt is still logged for both — the re-fire is inert, not invisible.
    expect(
      g.log.entries().filter((e) => e.kind === "summary-half"),
    ).toHaveLength(2);
  });

  it("(f) A TERMINATED ending still never arms the RECONCILE gate — and its summary now rides the observations-only door instead of being lost out-of-window (summary-record design spec §1, gates 2+3)", async () => {
    // REWRITTEN, not deleted: this test used to pin the summary as
    // `out-of-window`, which was the loss spec §1 exists to fix. What it
    // pinned that is UNCHANGED — no finish grace, no reconcile deadline, no
    // synthesized interval — is all still pinned below, because those are
    // the three things the new door must not disturb.
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 40, 130),
    );
    expect(g.events.filter((e) => e.kind === "terminated")).toHaveLength(1);

    // UNCHANGED: no grace, therefore no reconcile deadline. Footnote 12's
    // unstable Split/Interval Number is why a terminate opens no grace at
    // all, and gate 2 deliberately does not share `graceIsOpen` with it.
    expect(g.timer.calls).toHaveLength(0);

    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(40, 130));

    // GATE 3, the whole point: NO interval was synthesized. An abandoned
    // run must never gain a completed final interval it did not row.
    expect(boundaries(g.events)).toHaveLength(0);

    // The emit waits for 0x003F (the hash sub-window, `HASH_SUBWINDOW_MS`)
    // exactly as the natural path does — nothing has gone out yet, and the
    // verdict is deliberately not written yet either: it reports what was
    // actually emitted, so it cannot claim a run was recorded before it
    // was (a `program()` landing inside the window abandons the emit).
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([]);
    expect(verdicts(g.log)).toHaveLength(0);
    expect(g.timer.pending()?.ms).toBe(200);

    g.transport.notify(LOGGED_WORKOUT_UUID, VERIFICATION_BYTES);

    // 0x003F drains it early — one event, the totals verbatim, the nine
    // fields, and the hash.
    expect(g.timer.pending()).toBeNull();
    expect(verdicts(g.log)).toHaveLength(1);
    expect(verdicts(g.log)[0]!.detail).toContain("terminate-observations");
    expect(verdicts(g.log)[0]!.detail).not.toContain("filled-from-summary");
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 40, workDistanceMeters: 130 },
        detail: FULL_SUMMARY,
        verificationBytes: Array.from(VERIFICATION_BYTES),
      },
    ]);
  });

  it("(f2) THE TERMINATE DOOR SHUTS BEHIND ITSELF (summary-record design spec §1): the ~1-minute HRM re-fire finds it closed and lands out-of-window, carrying the terminate wording Minor-2's discrimination depends on", async () => {
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 40, 130),
    );
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(40, 130));
    g.transport.notify(LOGGED_WORKOUT_UUID, VERIFICATION_BYTES);
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toHaveLength(1);

    // The HRM re-fire (ecosystem review:420-422), with DIFFERENT numbers —
    // if the door were still open the record would show these instead.
    g.clock.advance(60_000);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(999, 9999));

    // Still exactly one event, still the first one's numbers.
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 40, workDistanceMeters: 130 },
        detail: FULL_SUMMARY,
        verificationBytes: Array.from(VERIFICATION_BYTES),
      },
    ]);
    expect(boundaries(g.events)).toHaveLength(0);
    // The TERMINATE side of Minor-2's discrimination, preserved: a run that
    // never had a grace reads differently from one whose grace a boundary
    // claimed (test (a) pins that one).
    const lastVerdict = verdicts(g.log).at(-1)!;
    expect(lastVerdict.detail).toContain("out-of-window");
    expect(lastVerdict.detail).toContain(
      "ended by terminate, which opens no grace at all",
    );
    expect(lastVerdict.detail).not.toContain("already claimed");
  });

  it("(f3) A TERMINATE WHOSE 0x003F NEVER COMES is not stranded (summary-record design spec §1): the hash sub-window elapses and the observations go out without it, key omitted rather than null", async () => {
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 40, 130),
    );
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(40, 130));
    expect(g.timer.pending()?.ms).toBe(200);

    g.timer.pending()!.fire();

    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 40, workDistanceMeters: 130 },
        detail: FULL_SUMMARY,
      },
    ]);
    expect(boundaries(g.events)).toHaveLength(0);
  });

  it("(f4) THE LINK DYING DURING THE HASH WAIT still delivers the observations (summary-record design spec §1): `reconcile()` drains the terminate slot, so a teardown cannot throw away a burst the driver already heard", async () => {
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 40, 130),
    );
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(40, 130));
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([]);

    // `useMonitorSession.ts`'s teardown STEP 1, the same method the hook
    // calls before it unsubscribes.
    g.driver.reconcile();

    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 40, workDistanceMeters: 130 },
        detail: FULL_SUMMARY,
      },
    ]);
    // Drained, not merely cancelled: nothing is left to fire after the
    // radio is gone.
    expect(g.timer.pending()).toBeNull();
  });

  it("(f5) 0x003F ARRIVING FIRST needs no wait at all (summary-record design spec §1): the hash is already on the run when 0x0039 decodes, so the observations go out synchronously and no sub-window is ever armed", async () => {
    // The ordering is not hypothetical bookkeeping: `verificationBytes` is
    // written by 0x003F's subscriber for ANY open run, closed or not, so a
    // stray hash earlier in this run — or a burst whose two notifications
    // land the other way round — leaves it populated before the summary
    // ever decodes. Waiting `HASH_SUBWINDOW_MS` for a byte already in hand
    // would delay the record for nothing.
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 40, 130),
    );
    g.transport.notify(LOGGED_WORKOUT_UUID, VERIFICATION_BYTES);
    expect(g.timer.calls).toHaveLength(0);

    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(40, 130));

    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 40, workDistanceMeters: 130 },
        detail: FULL_SUMMARY,
        verificationBytes: Array.from(VERIFICATION_BYTES),
      },
    ]);
    // NO sub-window was ever armed — this is the branch, not just the
    // outcome.
    expect(g.timer.calls).toHaveLength(0);
    expect(boundaries(g.events)).toHaveLength(0);
  });

  it("(f6) THE EARLY-BURST TERMINATE ORDERING (fix round 1, IMPORTANT): a 0x0039 that beats our own `terminated` frame is BUFFERED first, and the terminate must pick that buffer up — before this fix it sat in `summaryInGrace` forever, unread and unlogged", async () => {
    // The burst beating our terminal transition is not exotic: §1's own
    // PRIMARY research measured it in 3 of 5 committed natural finishes,
    // and a SINGLE-INTERVAL program is the most exposed shape of all,
    // because `noteSummary`'s early-side branch fires whenever
    // `currentIndex === lastIndex` — always true from the instant a
    // one-interval run opens. On a Menu terminate the whole burst can
    // therefore be filed as "buffered — held for this run's own natural
    // close" a moment before the close turns out not to be natural at all.
    //
    // Nothing then drained it. `terminatedAwaitingSummary` only opens
    // `noteSummary`'s door, and by this ordering `noteSummary` has already
    // run and will not run again; no `pendingSummaryReconcile` exists on a
    // terminate; so the run ended with the bytes in hand, no
    // `summary-observations` event, no verdict entry, and a record with no
    // `summaryTotals` — a SILENT loss, worse than the out-of-window one
    // this spec set out to fix, because that one at least logged.
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );

    // THE BURST ARRIVES FIRST, while the run is still open and reporting
    // its only (therefore final) interval.
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(40, 130));
    g.transport.notify(LOGGED_WORKOUT_UUID, VERIFICATION_BYTES);
    expect(verdicts(g.log).map((e) => e.detail)[0]).toContain("buffered");
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([]);

    // ...and only THEN does the rower's Menu press reach us.
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 40, 130),
    );

    // The held summary is picked up and delivered by the SAME
    // observations-only path the late ordering uses — the hash was already
    // on the run, so it goes out synchronously with no sub-window.
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 40, workDistanceMeters: 130 },
        detail: FULL_SUMMARY,
        verificationBytes: Array.from(VERIFICATION_BYTES),
      },
    ]);
    // GATE 3 HOLDS ON THIS ORDERING TOO: still no synthesized interval,
    // and the buffer is emptied so nothing can consume it a second time.
    expect(boundaries(g.events)).toHaveLength(0);
    // A VERDICT EITHER WAY (the silence was half the defect): the trace
    // names both the buffering and what became of it.
    const details = verdicts(g.log).map((e) => e.detail);
    expect(details).toHaveLength(2);
    expect(details[1]).toContain("terminate-observations");
    expect(details[1]).toContain("held from before our own terminal");
    expect(details.some((d) => d.includes("filled-from-summary"))).toBe(false);
  });

  it("(f7) THE EARLY-BURST ORDERING, HASH STILL OUTSTANDING (fix round 1): the terminate picks the buffer up and waits out the same sub-window, rather than emitting without a hash that is 38ms away", async () => {
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(40, 130));
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 40, 130),
    );

    // Nothing out yet — the sub-window is armed, exactly as on the late
    // ordering.
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([]);
    expect(g.timer.pending()?.ms).toBe(200);

    g.transport.notify(LOGGED_WORKOUT_UUID, VERIFICATION_BYTES);

    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 40, workDistanceMeters: 130 },
        detail: FULL_SUMMARY,
        verificationBytes: Array.from(VERIFICATION_BYTES),
      },
    ]);
    expect(g.timer.pending()).toBeNull();
    expect(boundaries(g.events)).toHaveLength(0);
  });

  it("(g) THE AVERAGES ARE NOT DERIVABLE, so they are not invented: the synthesized actual carries null, never a whole-workout average and never zero", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    // The fixture's own averages: spm 24, pace 125s, HR 152. None of them
    // is THIS interval's — every one is the whole workout's (B3).
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    g.clock.advance(2600);
    g.timer.pending()!.fire();

    const only = boundaries(g.events)[0]!;
    expect(only.kind).toBe("intervalComplete");
    const actual = (only as { actual: IntervalActual }).actual;
    // `IntervalActual` types these three as `number | null`, REQUIRED, not
    // optional (`domain/monitor/types.ts`) — so "omitted" can only mean
    // `null` here, which is the same value every downstream consumer
    // already treats as "no reading" (`logDraft.ts` drops the field,
    // `surfaceModel.ts` renders a dash). See the task report's finding.
    expect(actual.avgSplit).toBeNull();
    expect(actual.avgSpm).toBeNull();
    expect(actual.avgHeartRateBpm).toBeNull();
    expect(actual.avgSpm).not.toBe(24);
    expect(actual.avgSpm).not.toBe(0);
  });

  it("(g2) RC-7 (storage-spine design spec §2): the synthesized final interval OMITS restDistanceMeters entirely — never a wire-looking `0` for a quantity this path has no reading of", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    g.clock.advance(2600);
    g.timer.pending()!.fire();

    const only = boundaries(g.events)[0]!;
    const actual = (only as { actual: IntervalActual }).actual;
    expect("restDistanceMeters" in actual).toBe(false);
    expect(actual.restDistanceMeters).toBeUndefined();
  });

  it("THE DEADLINE IS A CLOCK, NOT A TICK COUNT: the machine's own repeat finished frames never trigger the fill early", async () => {
    // The walk-day-3 lesson, one layer over (interface-notes.md §22 item 5):
    // a reconcile keyed to the PM's status cadence is a reconcile keyed to
    // whichever radio is fastest. Only the timer decides.
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));

    for (let i = 0; i < 10; i += 1) {
      g.clock.advance(90);
      g.transport.notify(
        GENERAL_STATUS_UUID,
        generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
      );
    }

    expect(boundaries(g.events)).toHaveLength(0);
    expect(verdicts(g.log)).toHaveLength(0);

    g.timer.pending()!.fire();
    expect(boundaries(g.events)).toHaveLength(1);
  });

  it("NO SUMMARY EITHER: the deadline still reports, and reports honestly — declined, with the run's loss named", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(3000);
    g.timer.pending()!.fire();

    expect(boundaries(g.events)).toHaveLength(0);
    expect(verdicts(g.log)).toHaveLength(1);
    expect(verdicts(g.log)[0]!.detail).toContain("declined");
    expect(verdicts(g.log)[0]!.detail).toContain("no 0x0039");
  });

  it("A SUMMARY ARRIVING WHILE THE RUN IS STILL OPEN, and NOT YET in its final interval, is out-of-window — the gate is armed by the natural finish or by the run's own final interval, never by a bare characteristic", async () => {
    // CORRECTED by storage-spine design spec §2 (early side): this test
    // used to program `ONE_INTERVAL_PROGRAM`, whose every tick is
    // trivially "the final interval" (§2's own "single-interval
    // blindness" note) — so it could never actually distinguish "still
    // open" from "still open AND in the final interval", and now asserts
    // the WRONG thing for that case (see the buffering test right below).
    // A 2-interval program held on interval 0 is the genuine negative.
    const g = primedGate();
    await programViaStub(g.driver, g.transport, TWO_INTERVAL_PROGRAM);
    g.transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(30, 100));

    expect(verdicts(g.log)).toHaveLength(1);
    expect(verdicts(g.log)[0]!.detail).toContain("out-of-window");
    expect(g.timer.calls).toHaveLength(0);
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toHaveLength(0);
  });

  it("(a) storage-spine design spec §2 EARLY SIDE, single-interval case: a 0x0039 arriving while an open run is ALREADY in its (only, therefore final) interval is buffered — no out-of-window/discard log — and the natural close still emits summary-observations with the decoded totals", async () => {
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    // The burst beats OUR terminal transition: 0x0039 arrives while this
    // driver still considers the run open.
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(30, 100));

    const details = verdicts(g.log).map((e) => e.detail);
    expect(details).toHaveLength(1);
    expect(details[0]).toContain("buffered");
    expect(details.some((d) => d.includes("out-of-window"))).toBe(false);
    expect(details.some((d) => d.includes("discard"))).toBe(false);
    // No grace has opened yet — our own terminal transition has not
    // happened — so nothing is armed. This is a HOLD, not a fill.
    expect(g.timer.calls).toHaveLength(0);
    expect(boundaries(g.events)).toHaveLength(0);
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toHaveLength(0);

    // OUR terminal transition arrives; the final split never does — the
    // buffered summary reconciles the ordinary way once the grace closes.
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 30, 100),
    );
    g.timer.pending()!.fire();

    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 30, workDistanceMeters: 100 },
        detail: FULL_SUMMARY,
      },
    ]);
  });

  it("(a2) storage-spine design spec §2 EARLY SIDE, multi-interval case: the identical buffering, driven on a 2-interval program held in its FINAL interval — a mid-row interval never buffers", async () => {
    const g = primedGate();
    await programViaStub(g.driver, g.transport, TWO_INTERVAL_PROGRAM);

    // Interval 0 rows and completes the ordinary way — the status frame
    // establishing `lastActiveState: "rowing"` MUST precede the split
    // (`seaFretWithTwoPriorsRecorded`'s own established pattern), or
    // `toActualIndex` has no machine state to normalize the boundary
    // against and the actual files with `index: null` instead.
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    g.transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    g.transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));
    expect(boundaries(g.events)).toHaveLength(1);

    // Interval 1 (the final one) is under way per the machine's own 0x0033
    // — but OUR terminal transition (the WORKOUTEND 0x0031 frame) has not
    // arrived yet. This is the exact race §1's keystone capture read:
    // 0x0039 at t=172129.5, our terminal at t=172309.3, 142-449ms apart.
    g.transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(1));
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 90, 300),
    );
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(150, 500));

    const details = verdicts(g.log).map((e) => e.detail);
    expect(details.some((d) => d.includes("buffered"))).toBe(true);
    expect(details.some((d) => d.includes("out-of-window"))).toBe(false);
    expect(g.timer.calls).toHaveLength(0);

    // OUR terminal transition; the final split never arrives, so the
    // no-split (filled-from-summary) path derives interval 1 and folds
    // the SAME buffered summary onto the run as an observation — using
    // 0x0039's own totals (150/500) UNTRANSFORMED, not the derived actual
    // (which subtracts interval 0's priors down to 90/300).
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 150, 500),
    );
    g.timer.pending()!.fire();

    expect(boundaries(g.events)).toHaveLength(2);
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 150, workDistanceMeters: 500 },
        detail: FULL_SUMMARY,
      },
    ]);
  });

  it("(b) storage-spine design spec §2: the split-won path (final 0x0037 arrives, then 0x0039, then OUR terminal) emits summary-observations instead of logging 'discarded unread' — the exact keystone ordering (§1)", async () => {
    const g = primedGate();
    await programViaStub(g.driver, g.transport, TWO_INTERVAL_PROGRAM);

    // Interval 0, the ordinary way.
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    g.transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    g.transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 24));

    // Interval 1's REAL final split arrives FIRST (5 of 5 committed
    // finishes, §1) — an ordinary in-run boundary, recorded normally.
    g.transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(1));
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 90, 300),
    );
    g.transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(2, 90, 300));
    g.transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(2, 26));
    expect(boundaries(g.events)).toHaveLength(2);

    // THEN 0x0039 — the run is still open (the machine has already
    // committed the log; OUR terminal has not arrived), so it buffers via
    // the SAME early-side gate, whether or not a split already won.
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(150, 500));
    expect(verdicts(g.log).some((e) => e.detail.includes("buffered"))).toBe(
      true,
    );

    // THEN our terminal transition, opening the grace. Review fix round 1,
    // HIGH finding: `maybeReconcileImmediately` (armed right after this
    // frame's own `workoutComplete` emit) finds interval 1 already
    // recorded AND the summary already held — both halves of split-won's
    // own precondition are already true. Final-review fix wave, HIGH-2:
    // "complete" now ALSO needs the verification hash, which has not
    // arrived yet — so this notification re-arms the one deadline slot to
    // `HASH_SUBWINDOW_MS` (200ms) instead of draining straight away.
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 150, 500),
    );
    expect(g.timer.pending()?.ms).toBe(200);
    expect(boundaries(g.events)).toHaveLength(2); // not filed until the drain

    // The hash arrives (the measured +38.2ms gap from 0x0039,
    // pm5-interface-notes.md §24 item 1) — `LOGGED_WORKOUT_UUID`'s own
    // subscriber calls `maybeReconcileImmediately` again, finds
    // `verificationBytes` set this time, and drains for real, right here.
    // No `g.timer.pending()!.fire()` needed; the pin for that is
    // `g.timer.pending()` reading `null` past this line.
    const verificationBytes = Uint8Array.from([
      0x27, 0xd8, 0xf3, 0x6e, 0xe1, 0x52, 0x55, 0x5b,
    ]);
    g.transport.notify(LOGGED_WORKOUT_UUID, verificationBytes);
    expect(g.timer.pending()).toBeNull();

    const splitWon = verdicts(g.log).find((e) =>
      e.detail.startsWith("split-won"),
    )!;
    expect(splitWon.detail).not.toContain("discarded unread");
    expect(splitWon.detail).toContain("recorded as observations");
    // No THIRD boundary — split-won never files an actual off the summary.
    expect(boundaries(g.events)).toHaveLength(2);
    // NOW carries the hash too (final-review fix wave, HIGH-2) — omitted
    // before this fix, since the drain used to fire on 0x0039 alone.
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 150, workDistanceMeters: 500 },
        detail: FULL_SUMMARY,
        verificationBytes: Array.from(verificationBytes),
      },
    ]);
  });

  it("(d) 0x003F's raw bytes ride the summary-observations event when this run heard one during it", async () => {
    const g = primedGate();
    await rowToFinish(g);
    const verificationBytes = Uint8Array.from([
      0x27, 0xd8, 0xf3, 0x6e, 0xe1, 0x52, 0x55, 0x5b,
    ]);
    g.transport.notify(LOGGED_WORKOUT_UUID, verificationBytes);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    g.clock.advance(2600);
    g.timer.pending()!.fire();

    const observations = g.events.find(
      (e) => e.kind === "summary-observations",
    );
    expect(observations).toStrictEqual({
      kind: "summary-observations",
      totals: { workElapsedSeconds: 62.5, workDistanceMeters: 214 },
      detail: FULL_SUMMARY,
      verificationBytes: Array.from(verificationBytes),
    });
  });

  it("(d2) verificationBytes is OMITTED, not present-and-undefined, when no 0x003F ever arrived this run", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    g.clock.advance(2600);
    g.timer.pending()!.fire();

    const observations = g.events.find(
      (e) => e.kind === "summary-observations",
    )!;
    expect("verificationBytes" in observations).toBe(false);
  });

  it("(e) A TERMINATE AFTER AN EARLY-SIDE BUFFER now DELIVERS those bytes as observations (summary-record design spec §1 — this test used to assert the opposite, and the opposite was the defect)", async () => {
    // **THE PREMISE THIS TEST WAS BUILT ON IS OVERTURNED, and the old
    // title is left quoted here so the change is not silent.** It read
    // "NATURAL-FINISH-ONLY: … the bytes are simply abandoned, never filed
    // off a run that never naturally finished", and it passed for the
    // reason it stated: `reconcileSummary` was the only builder of a
    // `summary-observations` event, and a terminate never reaches it.
    //
    // Storage-spine §2 was right that a terminate's summary must never
    // reach `reconcileSummary` — that ruling is INTACT and is now gate 3,
    // enforced structurally. What it got wrong was "and therefore the
    // bytes are abandoned": the machine sends a full, honest burst after a
    // Menu terminate (notes §25, `lab-terminate-ring.json`), and throwing
    // it away is a loss, not a safeguard. The summary-record spec's §1
    // separates the two questions — an ABANDONED run may still be
    // OBSERVED, it just may never gain a derived interval.
    //
    // This ordering (buffer first, terminate second) is the one the review
    // caught as still silently lossy after the first implementation: gate
    // 2's flag opens `noteSummary`'s door, and by this ordering that door
    // has already been walked through.
    const g = primedGate();
    await programViaStub(g.driver, g.transport, ONE_INTERVAL_PROGRAM);
    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    // EARLY SIDE: buffered while the run is still open, in its final
    // (only) interval.
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(30, 100));
    expect(verdicts(g.log).some((e) => e.detail.includes("buffered"))).toBe(
      true,
    );

    g.transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 40, 130),
    );
    expect(g.events.filter((e) => e.kind === "terminated")).toHaveLength(1);

    // STILL TRUE, and still what matters: no finish grace, and the ONE
    // timer now armed is the hash sub-window, not a reconcile deadline —
    // `reconcileSummary` is never scheduled and never runs for this run.
    expect(g.timer.pending()?.ms).toBe(200);
    g.timer.pending()!.fire();

    // NEWLY TRUE: the bytes reach the consumer instead of dying on the run.
    expect(
      g.events.filter((e) => e.kind === "summary-observations"),
    ).toStrictEqual([
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 30, workDistanceMeters: 100 },
        detail: FULL_SUMMARY,
      },
    ]);
    // ...and gate 3 is untouched by that: no interval was derived.
    expect(boundaries(g.events)).toHaveLength(0);
  });

  it("A SUMMARY PAST THE 3000ms WINDOW is not stored: the deadline finds nothing and declines", async () => {
    const g = primedGate();
    await rowToFinish(g);
    // Exactly at the bound — the grace's own `now() >= until` rule, which
    // the split path pins the same way one test above.
    g.clock.advance(3000);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    g.timer.pending()!.fire();

    expect(boundaries(g.events)).toHaveLength(0);
    const details = verdicts(g.log).map((e) => e.detail);
    expect(details.some((d) => d.includes("out-of-window"))).toBe(true);
    expect(details.some((d) => d.includes("declined"))).toBe(true);
  });

  it("A TOO-SHORT 0x0039 stores nothing and says so — under its OWN kind, so one failure is not two declines", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(19));
    g.clock.advance(2600);
    g.timer.pending()!.fire();

    expect(boundaries(g.events)).toHaveLength(0);
    // A receipt-level note, not a verdict (review Minor-7): the four words
    // `summary-reconciled` carries are the spec's four, and `declined` is
    // the DEADLINE's verdict on the run. A garbled 0x0039 that also logged
    // `declined` would have a reader counting one run's single failure
    // twice.
    const undecodable = g.log
      .entries()
      .filter((e) => e.kind === "summary-undecodable");
    expect(undecodable).toHaveLength(1);
    expect(undecodable[0]!.detail).toContain("19 byte(s)");
    expect(undecodable[0]!.detail).toContain("could not be decoded");
    // Exactly ONE verdict, and it is the deadline's own.
    expect(verdicts(g.log)).toHaveLength(1);
    expect(verdicts(g.log)[0]!.detail).toContain("declined");
    expect(verdicts(g.log)[0]!.detail).toContain("no 0x0039 arrived");
  });

  it("A NEGATIVE SUBTRACTION DECLINES: the one cheap on-wire test of the cumulative premise (interface-notes §27.1), and it refuses rather than files nonsense", async () => {
    // If 0x0039's Elapsed Time/Distance are PER-INTERVAL (the trap 0x0031
    // sprang on walk 4) rather than whole-workout totals, a multi-interval
    // subtraction goes negative — and this is the arm that fires. Our own
    // machine answered CUMULATIVE on the wire (§27.1, RC-12), so this arm
    // now guards a firmware difference rather than an open question; it
    // stays for exactly that reason. It is deliberately a DECLINE plus a log entry, not a clamp:
    // the walk needs the evidence, and the rower must not get a fabricated
    // interval either way.
    //
    // The contrast with (c2) is the point of both tests existing: premise 1
    // (cumulative-vs-per-interval) fails LOUDLY, right here; premise 2
    // (rest) fails silently and can only be caught by a reader.
    const g = primedGate();
    await seaFretWithTwoPriorsRecorded(g, SEA_FRET_WORK_ONLY_PRIORS);

    g.clock.advance(500);
    // A PER-INTERVAL reading: the final interval's own 240s/1150m, which is
    // far smaller than the 540s of priors this gate would subtract from it.
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(240, 1150));
    g.clock.advance(2500);
    g.timer.pending()!.fire();

    expect(boundaries(g.events)).toHaveLength(2); // intervals 0 and 1 only
    const detail = verdicts(g.log)[0]!.detail;
    expect(detail).toContain("declined");
    expect(detail).toContain("cumulative");
    expect(detail).toContain("§27.1");
  });

  it("A LINK DROP INSIDE THE GRACE cancels the WAIT, not a verdict already in hand: a summary that already arrived still fills (F7)", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    expect(g.timer.pending()).not.toBeNull();
    // Not yet filed — a split still has until the deadline (or, now, the
    // drop) to arrive and win (test (b)'s own precedence).
    expect(boundaries(g.events)).toHaveLength(0);

    // The radio drops while the deadline is still standing, well inside
    // BOTH windows (400ms, against a 3000ms grace and a 3500ms hand-off
    // hold — `FINISH_HANDOFF_HOLD_MS` in `useMonitorSession.ts`). Cancelled
    // on the TRANSPORT's own disconnect, not only on a caller-initiated
    // `disconnect()` — and handled ahead of the "after the current run
    // closed, ignored" early-return, which this case would otherwise skip.
    g.transport.fireDisconnect("fixture: the radio dropped mid-grace");

    // The SCHEDULED WAIT is still cancelled: in production `schedule`'s
    // default is `setTimeout`/`clearTimeout`, so a live timer never outlives
    // the driver either way — that half of the old contract survives.
    expect(g.timer.calls[0]!.cancelled).toBe(true);
    expect(g.timer.pending()).toBeNull();

    // The VERDICT it could already reach does NOT die with the wait: the
    // summary was already in hand, so the drop runs the reconcile right
    // there instead of discarding it — the rower's log screen gets its real
    // numbers, not "0 OF 1 INTERVALS MEASURED" over a trace that had them
    // the whole time.
    expect(boundaries(g.events)).toHaveLength(1);
    expect(boundaries(g.events)[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, elapsedSeconds: 62.5, distanceMeters: 214 },
      finalBoundary: true,
    });
    const verdict = verdicts(g.log);
    expect(verdict).toHaveLength(1);
    expect(verdict[0]!.detail).toContain("filled-from-summary");
  });

  it("A LINK DROP BEFORE ANY SUMMARY ARRIVES declines synchronously instead of leaving the trace silent — no more evidence is ever coming either way", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    // No 0x0039 this time — the split simply never showed up and neither did
    // the summary before the radio died.
    expect(g.timer.pending()).not.toBeNull();

    g.transport.fireDisconnect(
      "fixture: the radio dropped with no summary held",
    );

    expect(g.timer.calls[0]!.cancelled).toBe(true);
    // Nothing to fill — the trace says so instead of staying silent about a
    // deadline that quietly vanished.
    expect(boundaries(g.events)).toHaveLength(0);
    const verdict = verdicts(g.log);
    expect(verdict).toHaveLength(1);
    expect(verdict[0]!.detail).toContain("declined");
    expect(verdict[0]!.detail).toContain("no 0x0039 arrived");
  });

  it("A REPLACED RUN takes its deadline with it: the stale reconcile fires into nothing and cannot fill the NEW run's last interval", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(400);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    const stale = g.timer.calls[0]!;

    // A second workout on the same driver, no reconnect (the §19.4
    // regression's own fix): `program()` replaces the run outright.
    await programViaStub(g.driver, g.transport, seaFretProgram());
    stale.fire();

    expect(boundaries(g.events)).toHaveLength(0);
    expect(stale.cancelled).toBe(true);
  });

  it("THE LATEST SUMMARY IN THE WINDOW WINS: two 0x0039s inside the grace, and the second one's numbers are what get filed", async () => {
    const g = primedGate();
    await rowToFinish(g);
    g.clock.advance(200);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(60, 200));
    g.clock.advance(200);
    g.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, summaryBytes(62.5, 214));
    g.clock.advance(2600);
    g.timer.pending()!.fire();

    expect(boundaries(g.events)[0]).toMatchObject({
      actual: { elapsedSeconds: 62.5, distanceMeters: 214 },
    });
  });
});

describe("createPm5Driver: R0 instrumentation (CR2 spec 1) — the accumulator lands beside the numbers it contradicts", () => {
  // This task lands on the BROKEN accumulator deliberately (CR2 spec 1
  // Task 1). Nothing about the accumulator's own arithmetic changes here —
  // the point is only that the instrumentation exists on the defect, so
  // Task 4's fix has a measurable before/after.

  const R0_SUMMARY_FIELDS = {
    avgStrokeRate: 24,
    endingHeartRateBpm: 168,
    avgHeartRateBpm: 152,
    minHeartRateBpm: 96,
    maxHeartRateBpm: 175,
    dragFactorAverage: 128,
    recoveryHeartRateBpm: 120,
    avgPaceSecondsPer500m: 125,
  };

  /** `stubTransport` idiom (driver.test.ts:492), not the fake's own
   *  scripted timeline: both tests below need `distanceMeters` and
   *  `totalWorkDistanceMeters` set to two INDEPENDENT values on the same
   *  0x0031 payload, which only direct control over the encoded bytes can
   *  give. Brings `seen.as1`/`seen.as2` up first, the same shortcut the
   *  'seen' gating tests and `primedGate()` above take, so the General
   *  Status notifications below actually reach `maybeEmitFrame`. */
  function r0Harness(): {
    transport: ReturnType<typeof stubTransport>;
    log: ReturnType<typeof createEventLog>;
    driver: ReturnType<typeof createPm5Driver>;
  } {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, {});
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    return { transport, log, driver };
  }

  it("prints the accumulator and the machine's own total beside 0x0039's", async () => {
    const { transport, log, driver } = r0Harness();
    await programViaStub(driver, transport, MINIMAL_PROGRAM);

    // Row far enough to put something in the accumulator.
    transport.notify(
      GENERAL_STATUS_UUID,
      buildGeneralStatusBytes({
        elapsedSeconds: 30,
        distanceMeters: 120.5,
        workoutType: 8,
        intervalType: 0,
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        rowingState: 1,
        strokeState: 2,
        totalWorkDistanceMeters: 120,
        workoutDurationRaw: 6000,
        workoutDurationType: 0,
        dragFactor: 130,
      }),
    );
    transport.notify(
      END_OF_WORKOUT_SUMMARY_UUID,
      buildEndOfWorkoutSummaryBytes({
        ...R0_SUMMARY_FIELDS,
        elapsedSeconds: 30,
        meters: 120,
        workoutType: 8,
      }),
    );

    const entry = log.entries().find((e) => e.kind === "summary-totals");
    expect(entry).toBeDefined();
    // The consequence, not the existence: all five numbers are present.
    expect(entry!.detail).toContain("distance=120m");
    expect(entry!.detail).toContain("accumulator=120.5m");
    expect(entry!.detail).toContain("accumulatorElapsed=30s");
    expect(entry!.detail).toContain("machineTotal=120m");
  });

  it(
    "samples the machine's own total mid-piece, at a bounded cadence " +
      "(review I1: a PRODUCTION-shaped fixture — no one rows 8:20/500)",
    async () => {
      // No `programViaStub` here (unlike the test above): the twd-sample
      // check runs unconditionally in the 0x0031 handler, gated on nothing
      // but `lastLoggedTwd`'s own bucket comparison — arming a program
      // first would notify one extra General Status of its own (the armed
      // readback, `totalWorkDistanceMeters=0`), a REAL, correctly logged
      // sample that would shift every count below by one. Skipping the arm
      // keeps this test's only 0x0031 traffic the 30 notifications below.
      const { transport, log } = r0Harness();

      const status = (elapsed: number, d: number, twd: number): Uint8Array =>
        buildGeneralStatusBytes({
          elapsedSeconds: elapsed,
          distanceMeters: d,
          workoutType: 8,
          intervalType: 0,
          workoutState: WORKOUTSTATE_INTERVALWORKTIME,
          rowingState: 1,
          strokeState: 2,
          totalWorkDistanceMeters: twd,
          workoutDurationRaw: 6000,
          workoutDurationType: 0,
          dragFactor: 130,
        });

      // 30 ticks at a 2:00/500 split (500 m / 120 s = 4.1667 m/s), fed at
      // 0.5 s/tick — 2.0833 m/tick, comfortably inside "rowing" territory
      // and nowhere near the review's flagged 0.4-0.6 m/tick (8:20/500)
      // fixture that certified the broken guard. `distanceMeters` (0x0031's
      // decimal field) and the rounded integer `totalWorkDistanceMeters`
      // both climb tick over tick, exactly as the wire reports them.
      // [elapsedSeconds, distanceMeters, totalWorkDistanceMeters]
      const ticks: readonly [number, number, number][] = [
        [0.5, 2.1, 2],
        [1, 4.2, 4],
        [1.5, 6.3, 6],
        [2, 8.3, 8],
        [2.5, 10.4, 10],
        [3, 12.5, 13],
        [3.5, 14.6, 15],
        [4, 16.7, 17],
        [4.5, 18.8, 19],
        [5, 20.8, 21],
        [5.5, 22.9, 23],
        [6, 25, 25],
        [6.5, 27.1, 27],
        [7, 29.2, 29],
        [7.5, 31.3, 31],
        [8, 33.3, 33],
        [8.5, 35.4, 35],
        [9, 37.5, 38],
        [9.5, 39.6, 40],
        [10, 41.7, 42],
        [10.5, 43.8, 44],
        [11, 45.8, 46],
        [11.5, 47.9, 48],
        [12, 50, 50],
        [12.5, 52.1, 52],
        [13, 54.2, 54],
        [13.5, 56.3, 56],
        [14, 58.3, 58],
        [14.5, 60.4, 60],
        [15, 62.5, 63],
      ];
      for (const [elapsed, d, twd] of ticks) {
        transport.notify(GENERAL_STATUS_UUID, status(elapsed, d, twd));
      }

      const samples = log.entries().filter((e) => e.kind === "twd-sample");
      // Hand-derived from the fixture's own `twd` column above (not
      // re-run through the driver's own formula — that would be the exact
      // tautology `intervalIndex.ts`'s header warns against): the 25 m
      // bucket (`Math.floor(twd / 25)`) is 0 for ticks 1-11 (twd 2..23), a
      // NEW bucket 1 the instant twd reaches 25 at tick 12, still 1 through
      // tick 23 (twd 23..48), and a NEW bucket 2 the instant twd reaches 50
      // at tick 24. Three bucket VALUES visited (0, 1, 2) -> three log
      // entries, at ticks 1, 12 and 24 — over all 30 notifications. Budget
      // check: this 62.5 m stretch produced 3 entries; a full 6000 m piece
      // at the same cadence would produce 6000 / 25 = 240, the number
      // `TWD_SAMPLE_BUCKET_METERS`'s own comment states and stays well
      // inside the 500-entry ring.
      expect(samples).toHaveLength(3);
      expect(samples[0]!.detail).toContain("machineTotal=2m");
      expect(samples[1]!.detail).toContain("machineTotal=25m");
      expect(samples[2]!.detail).toContain("machineTotal=50m");
    },
  );
});

// ---------------------------------------------------------------------------
// RC-9a (design spec 2026-08-25-free-oracles §1) — the live average-pace
// verdict: 0x0032's own `averageSplit` (the machine's cumulative, work-only
// 500m pace) against `run.recordedActuals`'s own weighted quotient. The
// rest-bearing, real-numbers exit-criterion-1 pin lives in
// `avgPaceVerdict.replay.test.ts` (a committed capture, per this repo's own
// "read what the FAKE puts in that field" standing check — `fake.ts`'s
// `averageSplit` was a fabrication until this task, so a capture is the
// safer oracle for the flagship pin even though the fake is fixed too).
// These tests cover the code paths a capture cannot cheaply isolate:
// suppression conditions and the 0x0032-vs-0x0039 scale trap.
// ---------------------------------------------------------------------------

describe("createPm5Driver: the live average-pace verdict (RC-9a, design spec 2026-08-25-free-oracles §1)", () => {
  function avgPaceVerdicts(log: ReturnType<typeof createEventLog>) {
    return log.entries().filter((e) => e.kind === "avg-pace-verdict");
  }

  it("agrees with the machine's own last work-state 0x0032 averageSplit within the 1.0s band, at the terminated transition — and would fail 10x-wrong under the 0x0039 scale (the scale trap)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);

    // The seen-gate (`maybeEmitFrame`'s own "having seen all three at least
    // once" rule) — `programViaStub`'s own armed readback already primes
    // `seen.general`.
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    // 0x0032's own averageSplit, 150.00 s/500m — a raw u16 of 15000 at
    // 0x0032's DOCUMENTED 0.01 s/lsb (`buildAdditionalStatus1Bytes`/
    // `parseAdditionalStatus1` do the re-scale symmetrically; this test
    // proves THIS VERDICT never re-scales the already-descaled value a
    // second time). If the verdict compared it as though it were 0x0039's
    // OWN 0.1 s/lsb pace instead, the effective reading would be 10x too
    // large (1500.0s) and the exact-match assertion below would fail by
    // ~1350s — nowhere close to the 1.0s band.
    // GENERAL STATUS FIRST — the real wire order this task's own decode of
    // `session-2-wu-4unequal.jsonl` confirmed (seq 2975→2976→2977: 0x0031
    // always precedes 0x0032/0x0033 for the same tick). The 0x0032 merge
    // callback judges `averageSplit` against `raw.workoutState` as ALREADY
    // MERGED, so this order is what lets it see workoutState 4.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(150.0));
    // OUR side: one recorded actual, 60s/200m -> 500*60/200 = 150.00s/500m
    // exactly — the machine and our own quotient agree by construction,
    // delta 0.00s.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 60, 200),
    );

    const entries = avgPaceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).not.toContain("suppressed");
    expect(entries[0]!.detail).toContain("machine(0x0032)=150.00s/500m");
    expect(entries[0]!.detail).toContain("ours=150.00s/500m");
    expect(entries[0]!.detail).toContain("delta=0.00s");
    expect(entries[0]!.detail).toContain("agree");
  });

  it("DIFFERS, naming both numbers, when the machine's own average disagrees with our quotient beyond the 1.0s band — the alarm arm, which nothing asserted before", async () => {
    // Added at Phase RC's antagonist exit pass (finding M-2): a repo-wide
    // grep for `toContain("DIFFER")` returned exactly ONE hit, and it was
    // the REST-distance oracle. `recordAvgPaceVerdict`'s false arm had no
    // positive assertion anywhere — the corpus replay pins only `agree`
    // and `suppressed`, because no committed capture disagrees. A band
    // that has never been seen to bite is the shape recurring failure 21
    // exists to refuse, even when a mutation shows it can.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    // The machine says 160.00 s/500m; our own single actual (60s/200m)
    // quotients to 150.00. A 10s gap — the lost-interval shape, ten times
    // the band, not noise.
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(160.0));
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 60, 200),
    );

    const entries = avgPaceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).not.toContain("suppressed");
    expect(entries[0]!.detail).toContain("machine(0x0032)=160.00s/500m");
    expect(entries[0]!.detail).toContain("ours=150.00s/500m");
    expect(entries[0]!.detail).toContain("delta=10.00s");
    expect(entries[0]!.detail).toContain("DIFFER");
    expect(entries[0]!.detail).not.toContain("agree");
    // And it names the band it judged against, so a walk reading this line
    // knows what "DIFFER" cost rather than only that it fired.
    expect(entries[0]!.detail).toContain("band 1.0s");
  });

  it("suppresses, naming the reason, when a recorded actual measured under MIN_MEASURABLE_ELAPSED_SECONDS — mirrors summaryModel.ts's monitorAvgSplit exclusion", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    // GENERAL STATUS FIRST — see the scale-trap test's own comment for why.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(130.0));
    // A genuine reading, but below the 1s floor (review finding 1's own
    // "nobody covers meaningful ground in under a second" reasoning,
    // `MIN_MEASURABLE_ELAPSED_SECONDS`'s own declaration comment) — this
    // driver's own `recordedActuals` keeps it (the meters genuinely
    // happened), but the AVG SPLIT quotient must exclude it, same as
    // `monitorAvgSplit` does for a stored row.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 0.5, 3));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 0.5, 3),
    );

    const entries = avgPaceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("suppressed");
    expect(entries[0]!.detail).toContain("under 1s");
  });

  it("suppresses, naming the reason, when a boundary this run saw could not be attributed to a program interval (the live analogue of monitorAvgSplit's index===null exclusion)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    // GENERAL STATUS FIRST — see the scale-trap test's own comment for why.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(130.0));
    // `toActualIndex(machineIndex, "rowing", programLength=1)`
    // (`domain/monitor/pm5/intervalIndex.ts`): candidate = machineIndex-1.
    // A candidate more than one step outside [0,1) returns null — machine
    // index 5 (candidate 4) is the "has no corresponding interval" shape,
    // never attributed to `MINIMAL_PROGRAM`'s single interval. `run.actuals`
    // still counts it; `recordedActuals` never does.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(5, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(5, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 60, 200),
    );

    const entries = avgPaceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("suppressed");
    expect(entries[0]!.detail).toContain("could not be attributed");
    expect(entries[0]!.detail).toContain("1 actual(s) emitted, only 0 indexed");
  });

  it("FIX ROUND 1 (review): suppresses, naming the reason, on a MID-WORK terminate — the still-open final interval's boundary never arrives, and takes the out-of-run branch (touching neither run.actuals nor recordedActuals) even if it does, so the 'unattributable actual' check above cannot see it", async () => {
    const TWO_INTERVAL_PROGRAM: WorkoutProgram = {
      intervals: [
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0,
        },
        {
          type: "work",
          kind: "time",
          value: 60,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0,
        },
      ],
    };
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, TWO_INTERVAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    // Interval 0 completes ORDINARILY: 60s/180m, machine averageSplit
    // 166.67s/500m (500*60/180) — the whole session's own average so far,
    // nothing banked before it.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 180),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(166.67));
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 180));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));

    // Interval 1 — this program's OWN FINAL interval (index 1) — starts
    // rowing and the rower pulls another 30s/120m before hitting Terminate.
    // The machine's own 0x0032 already reflects that real, partial work:
    // cumulative 90s/300m -> 500*90/300 = 150.00s/500m.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 120),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(150.0));

    // TERMINATE, mid-interval-1 — no 0x0037/0x0038 for interval 1 EVER
    // arrives (this test scripts none): the ordinary shape a rower's own
    // "stop early" produces, not a wire error.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 30, 120),
    );

    const entries = avgPaceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("suppressed");
    expect(entries[0]!.detail).toContain("final interval");
    expect(entries[0]!.detail).toContain("never recorded");
    // Bug-independent negative check: WITHOUT this fix, the verdict would
    // have compared 150.00 (machine) against interval 0 ALONE (166.67,
    // since interval 1 is entirely missing from `recordedActuals`) — a
    // 16.67s gap, loudly wrong, not silently close. Neither number appears
    // in a suppressed entry.
    expect(entries[0]!.detail).not.toContain("166.67");
    expect(entries[0]!.detail).not.toContain("150.00");
  });

  it("suppresses, naming the reason, when no work-state 0x0032 sample was ever observed this run", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 60, 200),
    );

    const entries = avgPaceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toBe(
      "suppressed — no work-state (0x0032) averageSplit observed this run",
    );
  });

  it("suppresses, naming the reason, when the run's own recorded actuals measure zero distance total (Σd = 0) — a real elapsed-time reading with nothing rowed, not excluded by any check above", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 5, 0),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(150.0));
    // 5s elapsed (clears MIN_MEASURABLE_ELAPSED_SECONDS, so NOT excluded as
    // sub-threshold) but 0m rowed — this run's own final (and only)
    // interval, so the "final interval never recorded" check above does not
    // fire either. The only remaining reason to suppress is Σd itself.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 5, 0));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 5, 0),
    );

    const entries = avgPaceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toBe(
      "suppressed — nothing measured this run (Σd = 0)",
    );
  });

  it("ignores a 0.00 work-state 0x0032 reading (the interval-reset artifact) rather than letting it overwrite the last REAL reading", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    // The real reading — this is what the verdict must still compare
    // against.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(150.0));
    // The artifact: a genuine 0.00 reading, still work-state, one tick
    // later. If this were allowed to overwrite `lastWorkStateAverageSplit`,
    // the verdict below would compare against 0, not 150 — a huge,
    // unmissable delta rather than a suppression, so this test discriminates
    // cleanly from every suppression path above.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 45, 150),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(0));

    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 60, 200),
    );

    const entries = avgPaceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).not.toContain("suppressed");
    expect(entries[0]!.detail).toContain("machine(0x0032)=150.00s/500m");
  });

  it("samples ONLY workoutState 4/5 — a REST-state 0x0032 reading never becomes lastWorkStateAverageSplit, even though 0x0032's own averageSplit freezes through a rest on the real wire", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    // The real work-state reading FIRST...
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(150.0));

    // ...then a REST-state 0x0032 reading, AFTER it, carrying a value
    // nothing else in this test would ever produce. Ordered to arrive
    // LAST on purpose: if the workoutState gate were dropped, this would
    // OVERWRITE `lastWorkStateAverageSplit` (a later write always wins),
    // and the assertion below would see 300, not the real work-state
    // reading — a rest-state reading arriving BEFORE the real one (the
    // opposite order) would pass even under that mutation, since the real
    // one would win the overwrite regardless of the gate.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALREST, 90, 200),
    );
    transport.notify(ADDITIONAL_STATUS_1_UUID, additionalStatus1With(300.0));

    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 60, 200),
    );

    const entries = avgPaceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("machine(0x0032)=150.00s/500m");
    expect(entries[0]!.detail).not.toContain("300.00");
  });
});

describe("createPm5Driver: the rest-distance oracle (RC-9d, design spec 2026-08-25-free-oracles §3)", () => {
  function restDistanceVerdicts(log: ReturnType<typeof createEventLog>) {
    return log.entries().filter((e) => e.kind === "rest-distance-verdict");
  }

  // The exit-7 walk's own committed 0x003A frame (seq 63,
  // docs/monitor/sessions/walk-2026-08-24/phone-exit7-ring.json):
  // 88 35 03 0f 02 fa 00 02 20 00 b8 00 f2 00 00 00 00 a3 03
  // offsets 12-14 (u24 LE, 1 m/lsb): f2 00 00 -> 242
  // offsets 15-16 (u16 LE, whole seconds): 00 00 -> 0
  const EXIT7_0X003A = new Uint8Array([
    0x88, 0x35, 0x03, 0x0f, 0x02, 0xfa, 0x00, 0x02, 0x20, 0x00, 0xb8, 0x00,
    0xf2, 0x00, 0x00, 0x00, 0x00, 0xa3, 0x03,
  ]);
  // The r0 keystone piece's own committed 0x003A frame (seq 517,
  // walk-2026-08-23): 78 35 1c 09 01 fa 00 02 1c 00 83 00 00 00 00 00 00
  // ef 02 — offsets 12-14 and 15-16 both 0 (no rest was programmed).
  const KEYSTONE_0X003A = new Uint8Array([
    0x78, 0x35, 0x1c, 0x09, 0x01, 0xfa, 0x00, 0x02, 0x1c, 0x00, 0x83, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0xef, 0x02,
  ]);

  /** Names ONLY Total Rest Distance/Interval Rest Time — every other byte
   *  zeroed, mirroring `additionalStatus1With`'s own convention above. Used
   *  where a test needs a value NEITHER committed capture happens to
   *  carry (a non-zero Interval Rest Time), so it cannot borrow the two
   *  literal frames above. */
  function additionalSummaryRestBytes(
    totalRestDistanceMeters: number,
    intervalRestSeconds = 0,
  ): Uint8Array {
    const bytes = new Uint8Array(19);
    bytes[12] = totalRestDistanceMeters & 0xff;
    bytes[13] = (totalRestDistanceMeters >> 8) & 0xff;
    bytes[14] = (totalRestDistanceMeters >> 16) & 0xff;
    bytes[15] = intervalRestSeconds & 0xff;
    bytes[16] = (intervalRestSeconds >> 8) & 0xff;
    return bytes;
  }

  const TWO_INTERVAL_R60_PROGRAM: WorkoutProgram = {
    intervals: [
      {
        type: "work",
        kind: "time",
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 60,
      },
      {
        type: "work",
        kind: "time",
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 60,
      },
    ],
  };

  it("agrees with the machine's own 0x003A Total Rest Distance — exit-7 walk's own captured frame, PM5 memory screen 147 + 95 = 242 m", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, TWO_INTERVAL_R60_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 68, 250),
    );
    // Interval 1's own trailing rest (PM5 View Detail, exit-7 README): 147 m.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 68, 250, 147));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 25));

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 56, 250),
    );
    // Interval 2's own trailing rest (PM5 View Detail, exit-7 README): 95 m.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(2, 56, 250, 95));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(2, 28));

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 124, 500),
    );
    // 147 + 95 = 242, exactly the exit-7 frame's own decoded value.
    transport.notify(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, EXIT7_0X003A);

    const entries = restDistanceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).not.toContain("suppressed");
    expect(entries[0]!.detail).toContain("machine(0x003A)=242m");
    expect(entries[0]!.detail).toContain("ours=242m");
    expect(entries[0]!.detail).toContain("delta=0m");
    expect(entries[0]!.detail).toContain("agree");
    expect(entries[0]!.detail).not.toContain("DIFFER");
    expect(entries[0]!.detail).toContain("Interval Rest Time=0s");
  });

  it("DIFFERS, naming both numbers, when our own sum genuinely disagrees with the machine's Total Rest Distance beyond the 1 m band — a lost-interval shape, not noise", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    // Our own sum: 100 m. The exit-7 frame decodes 242 m — a 142 m gap,
    // nowhere close to the 1 m band.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200, 100));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 60, 200),
    );
    transport.notify(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, EXIT7_0X003A);

    const entries = restDistanceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).not.toContain("suppressed");
    expect(entries[0]!.detail).toContain("machine(0x003A)=242m");
    expect(entries[0]!.detail).toContain("ours=100m");
    expect(entries[0]!.detail).toContain("delta=142m");
    expect(entries[0]!.detail).toContain("DIFFER");
    expect(entries[0]!.detail).not.toContain("agree");
  });

  it("handles the r0 zero without a false alarm — the keystone piece's own captured frame decodes 0 m, and a genuinely rest-free run's own sum agrees rather than reading it as nothing to compare", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    // r0 — no programmed rest; restDistanceMeters=0 is a REAL wire reading,
    // not an absence.
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200, 0));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 60, 200),
    );
    transport.notify(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, KEYSTONE_0X003A);

    const entries = restDistanceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).not.toContain("suppressed");
    expect(entries[0]!.detail).toContain("machine(0x003A)=0m");
    expect(entries[0]!.detail).toContain("ours=0m");
    expect(entries[0]!.detail).toContain("delta=0m");
    expect(entries[0]!.detail).toContain("agree");
  });

  it("suppresses, naming the reason, when 0x003A arrives too short for the narrow parser (under 17 bytes)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);
    transport.notify(
      END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
      new Uint8Array(16),
    );

    const entries = restDistanceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toBe(
      "suppressed — 0x003A arrived with 16 byte(s), fewer than the 17 this narrow parser requires (offsets 12-16)",
    );
  });

  it("reports Interval Rest Time but suppresses the distance half, naming the reason, when no run's actuals exist to compare against (0x003A before any program() ever ran)", () => {
    const transport = stubTransport();
    const log = createEventLog();
    createPm5Driver(transport, log);
    transport.notify(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, EXIT7_0X003A);

    const entries = restDistanceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("reported only");
    expect(entries[0]!.detail).toContain("Interval Rest Time=0s");
    expect(entries[0]!.detail).toContain("distance suppressed");
    expect(entries[0]!.detail).toContain("no run's actuals");
  });

  it("reports Interval Rest Time without ever gating on it — a reading neither committed capture has shown still agrees on distance, unaffected", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 60, 200),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 60, 200, 50));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 22));
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_TERMINATE, 60, 200),
    );
    // Total Rest Distance 50 (matches ours); Interval Rest Time 45s — a
    // value neither committed capture has ever shown (both read 0),
    // proving this field changes nothing about the distance verdict.
    transport.notify(
      END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
      additionalSummaryRestBytes(50, 45),
    );

    const entries = restDistanceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).not.toContain("suppressed");
    expect(entries[0]!.detail).toContain("machine(0x003A)=50m");
    expect(entries[0]!.detail).toContain("ours=50m");
    expect(entries[0]!.detail).toContain("agree");
    expect(entries[0]!.detail).toContain("Interval Rest Time=45s");
  });

  // FIX ROUND 2 (whole-branch review, Important finding): the test that
  // used to live here fired the 3000ms grace deadline BEFORE notifying
  // 0x003A — the REVERSE of the TYPICAL wire order. On the committed
  // captures (walk-2026-08-23 seq 516/517; exit-7's own leg, README's
  // "+361ms" summary burst), 0x003A arrives ~1ms after 0x0039 — long
  // before the 3000ms deadline could ever fire the summary-fallback
  // synthesis. Reordered below to that typical order; the summary-fallback
  // shape now suppresses via the POPULATION guard (the final interval
  // simply is not recorded yet), not `restPairComplete`.
  //
  // **CORRECTED (same fix round, self-review against the coverage report):
  // `restPairComplete`'s own call site inside `recordRestDistanceVerdict`
  // is NOT unreachable through the wire** — an earlier draft of this
  // comment claimed it was and deleted driver-level coverage of it,
  // which the coverage report caught (driver.ts dropped from 99.43% to
  // 99.15% branches). It IS reachable: both write sites keep EACH ACTUAL
  // internally coupled (Task 1's own finding), but `restPairComplete`
  // checks EVERY recorded actual, and only the run's own FINAL index can
  // ever be synthesized — so the population guard passing (final index
  // present) does not guarantee the pair is complete: it is exactly the
  // case where 0x003A arrives LATE ENOUGH for the synthesis to have
  // already filled that final index (whether an unusually slow 0x003A
  // notification, or the terminate-path observations door taking longer).
  // The single committed capture only pins ~1ms as ONE observed gap, not a
  // protocol guarantee — kept below as the LESS COMMON but still real
  // order, restoring the branch's own coverage.
  it("suppresses — final interval not yet recorded — when 0x003A arrives at its REAL timing (~1ms after 0x0039), before the 3000ms grace deadline has any chance to fire the summary-fallback synthesis", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    // A minimal inline scheduler — `manualSchedule` is defined inside THE
    // SUMMARY-FALLBACK GATE describe block elsewhere in this file and is
    // not reachable from this describe; this test needs only the one
    // deadline call, fired by hand (mirrors the RC-1 fallback-omission
    // describe's own copy of this pattern, above).
    const scheduled: { ms: number; fire: () => void }[] = [];
    const timer = {
      schedule: (cb: () => void, ms: number): (() => void) => {
        scheduled.push({ ms, fire: cb });
        return () => {};
      },
      pending: () => scheduled[scheduled.length - 1] ?? null,
    };
    const driver = createPm5Driver(transport, log, {
      now: clock.now,
      schedule: timer.schedule,
    });
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));

    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
    // The split never arrives. 0x0039 arrives, and 0x003A follows ~1ms
    // later — the REAL order — well before the 3000ms deadline below ever
    // fires, so `recordedActuals` is still completely EMPTY at verdict
    // time (no synthesis has happened yet; nothing was ever recorded).
    transport.notify(
      END_OF_WORKOUT_SUMMARY_UUID,
      buildEndOfWorkoutSummaryBytes({
        elapsedSeconds: 62.5,
        meters: 214,
        avgStrokeRate: 24,
        endingHeartRateBpm: 150,
        avgHeartRateBpm: 150,
        minHeartRateBpm: 130,
        maxHeartRateBpm: 160,
        dragFactorAverage: 130,
        recoveryHeartRateBpm: 100,
        workoutType: 1,
        avgPaceSecondsPer500m: 120,
      }),
    );
    transport.notify(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, EXIT7_0X003A);

    const entries = restDistanceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("reported only");
    expect(entries[0]!.detail).toContain("Interval Rest Time=0s");
    expect(entries[0]!.detail).toContain("distance suppressed");
    expect(entries[0]!.detail).toContain("no run's actuals");
    expect(entries[0]!.detail).not.toContain("DIFFER");

    // The deadline fires AFTER the verdict already ran — matching the real
    // order in full ("0x0039 then 0x003A ~1ms later, deadline after") —
    // and must not produce a second verdict entry or throw.
    expect(timer.pending()?.ms).toBe(3000);
    timer.pending()!.fire();
    expect(restDistanceVerdicts(log)).toHaveLength(1);
  });

  it("FIX ROUND 2 (whole-branch review, the Important finding, reproduced and disproved): does NOT DIFFER on a dropped-final-split, otherwise HEALTHY multi-interval run — 0x003A racing ahead of the still-in-flight final split, the exact exit-7 shape (161 of 300 seeded workouts compile with a trailing rest on their own final interval, domain/monitor/program.ts:281-286)", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    await programViaStub(driver, transport, TWO_INTERVAL_R60_PROGRAM);
    transport.notify(ADDITIONAL_STATUS_2_UUID, additionalStatus2In(0));

    // Interval 1 completes ORDINARILY, full rest pair recorded — the exact
    // exit-7 numbers (PM5 View Detail): 147 m.
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 68, 250),
    );
    transport.notify(SPLIT_INTERVAL_DATA_UUID, splitHalf(1, 68, 250, 147));
    transport.notify(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, asSplitHalf(1, 25));

    // Interval 2 (this program's own FINAL interval) never gets its own
    // split before 0x003A arrives — the dropped-final-split shape: the
    // machine's own summary burst (0x0039 then 0x003A ~1ms later) wins the
    // race against the still-in-flight late final split, which the finish
    // grace has NOT yet delivered (before this fix, `ours` would have
    // summed only interval 1's 147 m against the machine's own 242 m — a
    // false 95 m DIFFER on a perfectly healthy run).
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 124, 500),
    );
    transport.notify(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, EXIT7_0X003A);

    const entries = restDistanceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("distance suppressed");
    expect(entries[0]!.detail).toContain(
      "this run's own final interval (index 1) was not yet recorded",
    );
    expect(entries[0]!.detail).not.toContain("DIFFER");
    expect(entries[0]!.detail).not.toContain("agree");
    // Bug-independent negative check: the pre-fix code would have named
    // 147 (interval 1 alone) as "ours" inside a DIFFER entry — neither
    // number appears here, because the verdict never reaches the compare
    // step at all.
    expect(entries[0]!.detail).not.toContain("147");
    expect(entries[0]!.detail).not.toContain("242");
  });

  it("suppresses the distance half, naming the reason, when 0x003A arrives LATE ENOUGH for the summary-fallback synthesis to have already filled the final interval — that path has no per-interval wire rest reading (RC-7's own precedent, restSeconds/type), so the population guard PASSES (the final index is present) but `restPairComplete` still catches the missing pair", async () => {
    const transport = stubTransport();
    const log = createEventLog();
    const clock = manualClock();
    // A minimal inline scheduler — `manualSchedule` is defined inside THE
    // SUMMARY-FALLBACK GATE describe block elsewhere in this file and is
    // not reachable from this describe; this test needs only the one
    // deadline call, fired by hand (mirrors the RC-1 fallback-omission
    // describe's own copy of this pattern, above).
    const scheduled: { ms: number; fire: () => void }[] = [];
    const timer = {
      schedule: (cb: () => void, ms: number): (() => void) => {
        scheduled.push({ ms, fire: cb });
        return () => {};
      },
      pending: () => scheduled[scheduled.length - 1] ?? null,
    };
    const driver = createPm5Driver(transport, log, {
      now: clock.now,
      schedule: timer.schedule,
    });
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));

    await programViaStub(driver, transport, MINIMAL_PROGRAM);
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_INTERVALWORKTIME, 30, 100),
    );
    transport.notify(
      GENERAL_STATUS_UUID,
      generalStatusIn(WORKOUTSTATE_WORKOUTEND, 60, 200),
    );
    // The split never arrives; only the summary does, and only the
    // deadline (never claimed by a split) fires the synthesis — the
    // synthesized actual carries no restDistanceMeters at all (0x0039 has
    // no per-interval rest field), so `recordedActuals` HAS the final
    // index (the population guard passes) but the pair is incomplete.
    transport.notify(
      END_OF_WORKOUT_SUMMARY_UUID,
      buildEndOfWorkoutSummaryBytes({
        elapsedSeconds: 62.5,
        meters: 214,
        avgStrokeRate: 24,
        endingHeartRateBpm: 150,
        avgHeartRateBpm: 150,
        minHeartRateBpm: 130,
        maxHeartRateBpm: 160,
        dragFactorAverage: 130,
        recoveryHeartRateBpm: 100,
        workoutType: 1,
        avgPaceSecondsPer500m: 120,
      }),
    );
    expect(timer.pending()?.ms).toBe(3000);
    // 0x003A arrives LATE here — AFTER the deadline already fired the
    // synthesis — the less common order per this describe block's own
    // fix-round-2 comment, kept specifically to exercise this branch.
    timer.pending()!.fire();
    transport.notify(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, EXIT7_0X003A);

    const entries = restDistanceVerdicts(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toContain("reported only");
    expect(entries[0]!.detail).toContain("Interval Rest Time=0s");
    expect(entries[0]!.detail).toContain("distance suppressed");
    expect(entries[0]!.detail).toContain(
      "missing restSeconds and/or restDistanceMeters",
    );
    expect(entries[0]!.detail).toContain("summary-fallback synthesis");
    // Proves this suppression came from `restPairComplete`, NOT the
    // population guard — the wording is disjoint from that guard's own
    // "was not yet recorded" message.
    expect(entries[0]!.detail).not.toContain("was not yet recorded");
  });
});

describe("restPairComplete (pure) — RC-9d fix round 1: the all-or-nothing gate checks the PAIR, mirroring monitorRun.ts's computeWorkRestSums and summaryModel.ts's monitorRest on the stored record, never restDistanceMeters alone", () => {
  it("true for an empty array — vacuously complete, same as Array.prototype.every's own contract (the caller's own actuals.length===0 gate handles 'nothing to compare' separately)", () => {
    expect(restPairComplete([])).toBe(true);
  });

  it("true when every actual carries BOTH restSeconds and restDistanceMeters", () => {
    expect(
      restPairComplete([
        { restSeconds: 60, restDistanceMeters: 147 },
        { restSeconds: 60, restDistanceMeters: 95 },
      ]),
    ).toBe(true);
  });

  it("false when restDistanceMeters is set but restSeconds is UNSET — the exact shape fix round 1 found untested and unchecked by the original single-field guard", () => {
    expect(
      restPairComplete([{ restSeconds: undefined, restDistanceMeters: 95 }]),
    ).toBe(false);
  });

  it("false when restSeconds is set but restDistanceMeters is UNSET — the mirror direction, so the gate is proven to check BOTH fields, not just swap which one it checks", () => {
    expect(
      restPairComplete([{ restSeconds: 60, restDistanceMeters: undefined }]),
    ).toBe(false);
  });

  it("false when even one actual in a multi-actual run is incomplete — the ALL in all-or-nothing, not merely 'the last one'", () => {
    expect(
      restPairComplete([
        { restSeconds: 60, restDistanceMeters: 147 },
        { restSeconds: undefined, restDistanceMeters: 95 },
      ]),
    ).toBe(false);
  });

  it("true when both fields are genuinely 0 — a real r0 reading is complete, not treated as missing", () => {
    expect(restPairComplete([{ restSeconds: 0, restDistanceMeters: 0 }])).toBe(
      true,
    );
  });
});

/**
 * PHASE JR PR 2, TASK 1 — the free row's own driver run.
 *
 * `activeRun` is assigned in exactly one place, inside `program()`
 * (`driver.ts:5992`). A free row never runs `program()`, so without
 * `beginFreeRow` the driver holds no run and `runIsOpen()` is false for the
 * whole row —
 * which silently costs three things the rower's row depends on: the machine
 * close never emits (`:2579` returns first), the machine's own 0x0039 is
 * discarded ("nothing filed", `:2974`), and auto-split boundaries take the
 * out-of-run branch.
 *
 * Opening the run buys those back and costs two things, because
 * `armedProgram()` is `activeRun?.program ?? null` (`:1774`) and therefore
 * becomes NON-null: the divergence escalation (`:2548`) and the structure
 * watchdog (`:4948`) both start evaluating against a zero-interval program.
 * Hence the explicit `freeRow` marker, and hence the last two tests here.
 */
describe("beginFreeRow", () => {
  /** A free row's own status frame: rowing, no program, workoutType 8 as the
   *  walk observed it (`docs/monitor/sessions/walk-2026-08-31-justrow/`). */
  function freeRowStatus(elapsedSeconds: number, distanceMeters: number) {
    return buildGeneralStatusBytes({
      elapsedSeconds,
      distanceMeters,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      rowingState: 1,
      strokeState: 1,
      totalWorkDistanceMeters: Math.round(distanceMeters),
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    });
  }

  function freeRowDriver() {
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
    return { transport, log, driver, events };
  }

  /**
   * CONNECT PROGRAMS THE ERG (spec 2026-09-02, exit criterion 2). The
   * free row now sends Concept2's p.80 JustRow frame — alone, no prepare —
   * as a DETACHED send whose only effects are ring entries, so every
   * assertion below reads `log.entries()`. Both literals are TYPED from
   * `docs/monitor/pm5-interface-notes.md` (§12 example 2 and §13), never
   * derived from the builders, and the fake keeps no write log of its own.
   */
  const JUST_ROW_FRAME_HEX = "f1 76 07 01 01 01 13 02 01 01 61 f2";
  const TERMINATE_FRAME_HEX = "f1 76 04 13 02 01 02 60 f2";

  function freeRowFake(
    script: Partial<Parameters<typeof createFakeTransport>[0]> = {},
  ) {
    // `settleTicks: 0` for the same reason `harness`'s own comment gives —
    // the fake sends one status tick per terminate ack, never a heartbeat.
    return harness({ program: MINIMAL_PROGRAM, ...script }, { settleTicks: 0 });
  }

  function kinds(log: ReturnType<typeof createEventLog>): string[] {
    return log.entries().map((e) => e.kind);
  }

  it("opens the run BEFORE the first byte goes out: `free-row-open` precedes the first `write` in the ring", () => {
    const { log, driver } = freeRowFake();

    driver.beginFreeRow();

    // `sendSequence` issues its first write synchronously, inside this
    // call — so the ring is the only witness to the ORDER, and the order
    // is the whole point: `activeRun.freeRow` is what holds the RC-37
    // watch and the divergence escalation off during the send.
    const ring = kinds(log);
    const open = ring.indexOf("free-row-open");
    const firstWrite = ring.indexOf("write");
    expect(open).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeGreaterThan(open);
  });

  it("writes exactly Concept2's p.80 JustRow frame, NO terminate, and the fake's ack lands as `free-row-program-sent`", async () => {
    const { log, driver } = freeRowFake();

    driver.beginFreeRow();
    await waitUntil(() => kinds(log).includes("free-row-program-sent"));

    const writes = log
      .entries()
      .filter((e) => e.kind === "write")
      .map((e) => e.detail);
    expect(writes).toStrictEqual([JUST_ROW_FRAME_HEX]);
    expect(writes).not.toContain(TERMINATE_FRAME_HEX);
    expect(
      kinds(log).filter((k) => k === "free-row-program-sent"),
    ).toHaveLength(1);
    expect(kinds(log)).not.toContain("free-row-program-failed");
  });

  it("a NAK'd program leaves the row OPEN and records `free-row-program-failed` carrying the hex trace", async () => {
    const { log, driver } = freeRowFake({ failNextProgramFrame: "reject" });

    driver.beginFreeRow();
    await waitUntil(() => kinds(log).includes("free-row-program-failed"));

    const failed = log
      .entries()
      .find((e) => e.kind === "free-row-program-failed")!;
    expect(failed.detail).toContain(`write ${JUST_ROW_FRAME_HEX}`);
    expect(failed.detail).toContain("ack ");
    expect(kinds(log)).not.toContain("free-row-program-sent");
    // Still open — nothing on the phone branches on the send's outcome
    // (ruling 2). `runIsOpen()` has one public witness: a second call is
    // refused as a re-entry, which it can only be while the first run lives.
    driver.beginFreeRow();
    expect(kinds(log).at(-1)).toBe("free-row-ignored");
  });

  /**
   * TERMINATE DURING THE SEND WAITS — it does not refuse (spec rev 5).
   * It refused until the 2026-09-03 walk, but NOT as that walk's observed
   * cause: finding 4's Cancel ran 1589 ms after the send's own ack (ring
   * 3), so the refusal was never entered and the hook's
   * `mode !== "justrow"` exclusion is what left the erg armed. The refusal
   * is a separately reachable sibling — an END or a Cancel inside the ~2 s
   * ack window, silent because both callers swallow it — fixed in the same
   * PR as hardening. The wait is bounded by the send's own deadline (the
   * test below holds that end), so "wait" can never mean "hang".
   *
   * The ORDER is the assertion, read off the ring: the p.80 write, its
   * ack, the send's own completion entry, and only THEN the terminate
   * write. `free-row-program-sent` is the entry that bites — the ack lands
   * synchronously inside `write()` (the fake's own honest asymmetry:
   * `delayWrites` defers the returned promise, never the notification), so
   * a terminate that skipped the wait would still land after the ACK while
   * landing before the send finished.
   */
  it("terminate() during the send WAITS for it: the ring shows the p.80 write, its ack and the send's completion BEFORE the terminate write", async () => {
    const { fake, log, driver } = freeRowFake();
    // Holds each write's own promise open for 50 ms so `sendSequence` is
    // provably still running when END arrives. Without the wait,
    // `terminate()` proceeds immediately and its `awaitAck` overwrites the
    // single `pendingAck` slot unchecked.
    fake.delayWrites(50);

    driver.beginFreeRow();
    const ending = driver.terminate();
    // Two windows, one per delayed write: the p.80's, then the
    // terminate's — the terminate's cannot even start until the first has
    // settled, which is the property under test.
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);
    await ending;

    const ring = log.entries();
    const justRowWrite = ring.findIndex(
      (e) => e.kind === "write" && e.detail === JUST_ROW_FRAME_HEX,
    );
    const ack = ring.findIndex((e, i) => e.kind === "ack" && i > justRowWrite);
    const sent = ring.findIndex((e) => e.kind === "free-row-program-sent");
    const terminateWrite = ring.findIndex(
      (e) => e.kind === "write" && e.detail === TERMINATE_FRAME_HEX,
    );
    expect(justRowWrite).toBeGreaterThanOrEqual(0);
    expect(ack).toBeGreaterThan(justRowWrite);
    expect(sent).toBeGreaterThan(ack);
    expect(terminateWrite).toBeGreaterThan(sent);
    expect(kinds(log)).toContain("terminate-sent");
  });

  it("abandons an unanswered send at the deadline — and a terminate issued mid-window waits exactly that long, then goes out", async () => {
    // The stub never acks — the replay transport's shape, and a PM5 that
    // never answers. Production configures no `ackTimeout`, so without the
    // deadline `programInFlight` would hold for the driver's life and the
    // wait below would never end (harden lens 2). This test is the OTHER
    // half of the one above: that one proves terminate waits, this one
    // proves the wait is bounded.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { settleTicks: 0 });
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    const written = (): number =>
      transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
        .length;

    driver.beginFreeRow();
    const afterJustRow = written();
    // Issued INSIDE the window, while the send still holds the slot.
    let ended = false;
    const ending = driver.terminate().then(() => {
      ended = true;
    });

    // INDEPENDENT literals, never the driver's constant (RF21: a test that
    // imports the number it gates retunes itself with it). Held at 4999,
    // released at 5000.
    await vi.advanceTimersByTimeAsync(4999);
    expect(kinds(log)).not.toContain("free-row-program-unanswered");
    // Still waiting: nothing of the terminate has reached the wire, and its
    // promise has not settled.
    expect(written()).toBe(afterJustRow);
    expect(ended).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await waitUntil(() => kinds(log).includes("free-row-program-unanswered"));
    expect(kinds(log)).toContain("free-row-program-unanswered");
    expect(kinds(log)).not.toContain("free-row-program-sent");
    expect(kinds(log)).not.toContain("free-row-program-failed");
    // Released BY the deadline: the terminate write is now on the wire.
    // Its own promise still waits on the ack this stub only sends when
    // told, which is the next two lines.
    await waitUntil(() => written() > afterJustRow);
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame({ frameStatus: "ok" }),
    );
    await ending;
    expect(ended).toBe(true);
    expect(kinds(log)).toContain("terminate-sent");
  });

  /**
   * THE HANG-UP CANNOT OVERTAKE THE TERMINATE (delta pass on PR #278).
   * Waiting the send out gave `terminate()` something it never had before:
   * a suspension BEFORE it writes anything. The app's own teardown hangs
   * up on a timer that knows nothing about it — measured on the walk's
   * ring 1, an END at `ready` reaches `disconnect()` about 186 ms after
   * the deadline would release the terminate (first `frame` +1159 ms after
   * the p.80 write; `handoff-hold` +66903 -> `handoff-released` +68905 ->
   * `disconnect-requested` +70930, so END->hang-up is 4027 ms), which is
   * not a margin, it is a coin toss. A hang-up that wins aborts the write (Apple:
   * `cancelPeripheralConnection(_:)` is nonblocking and "any pending
   * commands ... may not complete"), the terminate rejects, and both hook
   * callers swallow it — leaving the erg in the Just Row session, which is
   * the defect this PR exists to fix, one path over.
   *
   * The stub never acks, so the ONLY thing that can release the terminate
   * here is the deadline: the wait `disconnect()` takes is pinned at its
   * full ceiling, which is also the proof that the ceiling is what bounds
   * it. `writesAtHangUp` is read INSIDE the transport's own `disconnect()`
   * — the one place that can say what had reached the wire at the moment
   * the radio went away.
   *
   * WHAT IT CANNOT DISTINGUISH (measured, not assumed): both this test and
   * its hook sibling count a write when the transport's `write()` is
   * CALLED, so moving `sendSequence`'s `onFrameWritten` from after the
   * awaited chunk loop to before it leaves both green. The release is
   * placed after the await anyway — the stronger position, and the one a
   * real radio needs — but no assertion here holds it there.
   */
  it("disconnect() does not overtake a terminate that still owes its write — the hang-up waits out the deadline first", async () => {
    const base = stubTransport();
    const written = (): number =>
      base.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID).length;
    let writesAtHangUp = -1;
    const transport = {
      ...base,
      async disconnect(): Promise<void> {
        writesAtHangUp = written();
        return base.disconnect();
      },
    };
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { settleTicks: 0 });
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    driver.beginFreeRow();
    const afterJustRow = written();
    // Suspended on the send: nothing of it is on the wire yet.
    const ending = driver.terminate().catch(() => undefined);
    const hangingUp = driver.disconnect();

    // INDEPENDENT literals, never the driver's constant (RF21). Held at
    // 4999, released at 5000 — the same pin the test above uses, applied
    // here to the HANG-UP rather than to the terminate.
    await vi.advanceTimersByTimeAsync(4999);
    expect(writesAtHangUp).toBe(-1);
    expect(kinds(log)).toContain("disconnect-deferred");

    await vi.advanceTimersByTimeAsync(1);
    await hangingUp;

    // The terminate frame was on the wire BEFORE the radio went away.
    expect(writesAtHangUp).toBe(afterJustRow + 1);
    const ring = kinds(log);
    const requested = ring.indexOf("disconnect-requested");
    const deferred = ring.indexOf("disconnect-deferred");
    const terminateWrite = log
      .entries()
      .findIndex((e) => e.kind === "write" && e.detail === TERMINATE_FRAME_HEX);
    expect(deferred).toBeGreaterThan(requested);
    expect(terminateWrite).toBeGreaterThan(deferred);

    // Housekeeping: the stub's `disconnect()` fires no drop callback, so
    // release the terminate's still-pending ack by hand rather than
    // leaving a promise dangling past the test.
    transport.fireDisconnect("hung up");
    await ending;
  });

  it("the free row stays open through the send on a fake that reacts to ANY terminate — because nothing in the send is one", async () => {
    // The fake's default reaction to a terminate at an idle machine is a
    // plain accept (§18 s3 item 15), which is exactly why a prepare
    // re-added here could never go red on it (harden lens 1). Opting the
    // reaction in makes the fake deliver `terminated` for a terminate in
    // any state — and a `terminated` frame with this run open CLOSES it.
    const { log, driver, events } = freeRowFake({
      terminateReactsWhileIdle: true,
    });

    driver.beginFreeRow();
    await waitUntil(() => kinds(log).includes("free-row-program-sent"));

    expect(kinds(log)).toContain("free-row-program-sent");
    expect(events.some((e) => e.kind === "terminated")).toBe(false);
    expect(kinds(log)).not.toContain("terminal");
    driver.beginFreeRow();
    expect(kinds(log).at(-1)).toBe("free-row-ignored");
  });

  it("emits `terminated` when the rower backs out on the erg", () => {
    const { transport, driver, events } = freeRowDriver();
    driver.beginFreeRow();
    transport.notify(GENERAL_STATUS_UUID, freeRowStatus(60, 200));

    // The walk's own ending: workoutState 1 -> 11. Without an open run this
    // returns at `:2579` and the rower's Menu press reaches the hook as
    // nothing at all.
    transport.notify(
      GENERAL_STATUS_UUID,
      buildGeneralStatusBytes({
        elapsedSeconds: 60,
        distanceMeters: 200,
        workoutType: 8,
        intervalType: 0,
        workoutState: WORKOUTSTATE_TERMINATE,
        rowingState: 0,
        strokeState: 0,
        totalWorkDistanceMeters: 200,
        workoutDurationRaw: 0,
        workoutDurationType: 0,
        dragFactor: 130,
      }),
    );

    expect(events.some((e) => e.kind === "terminated")).toBe(true);
  });

  it("logs NO divergence entry across a free row's frames", () => {
    const { transport, log, driver } = freeRowDriver();
    driver.beginFreeRow();

    // `toProgramIndex` returns null for every one of these (programLength is
    // 0 by its own contract), so the escalation at `:2548` would fire on
    // each frame if the free row were not opted out of it.
    transport.notify(GENERAL_STATUS_UUID, freeRowStatus(10, 30));
    transport.notify(GENERAL_STATUS_UUID, freeRowStatus(20, 70));
    transport.notify(GENERAL_STATUS_UUID, freeRowStatus(30, 110));

    const divergences = log.entries().filter((e) => e.kind === "divergence");
    expect(divergences).toStrictEqual([]);
  });

  it("never reports the program dropped, because nothing was armed", () => {
    // THE CLOCK IS THE POINT OF THIS SETUP. The watchdog needs BOTH halves
    // of its rule — 3 consecutive identical mismatching armed ticks AND
    // 2000ms held — and a first cut of this test notified twelve frames
    // against a real clock, where `heldMs` never left single digits. It
    // passed with the opt-out deleted: a gate that could not go red.
    let clock = 0;
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log, { now: () => clock });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));
    transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));
    transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));

    driver.beginFreeRow();

    // WAITTOBEGIN maps to `armed` (`parse.ts:518`), and the structure the
    // watchdog compares is decoded from these very bytes — workout type and
    // the duration pair. A real Just Row sits here reporting a structure of
    // its own, which cannot match `expectedArmedStructure({intervals: []})`.
    // Four identical ticks over 4 seconds clears both halves of the rule.
    for (let i = 0; i < 4; i += 1) {
      clock += 1000;
      transport.notify(
        GENERAL_STATUS_UUID,
        buildGeneralStatusBytes({
          elapsedSeconds: 0,
          distanceMeters: 0,
          workoutType: 8,
          intervalType: 0,
          workoutState: WORKOUTSTATE_WAITTOBEGIN,
          rowingState: 0,
          strokeState: 0,
          totalWorkDistanceMeters: 0,
          workoutDurationRaw: 12000,
          workoutDurationType: 0,
          dragFactor: 130,
        }),
      );
    }

    expect(events.some((e) => e.kind === "programDropped")).toBe(false);
  });
});
