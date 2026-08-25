// CR2 spec 1, Task 2 — THE STOP-GATE. `docs/monitor/state-architecture-review.md`
// §F2 published three numbers the session accumulator (`driver.ts`'s `session`
// fold, R0-instrumented by Task 1) produces on real captured shapes, and its own
// Appendix ("Replay through the real driver") is the authoritative reproduction
// recipe — "independently reproduced three times, twice through the real
// `createPm5Driver`". This file re-derives all three through the ACTUAL driver
// (not a re-implementation) via a hand-driven `Transport`, and stops the plan if
// any of them disagrees (task-2-brief.md, Step 5).
//
// §F2's table (state-architecture-review.md:429-433):
//
//   | Replayed segment                                     | Truth   | The driver reports        |
//   | 3 x 1:00 with rest, both fields resetting together   | 455.1 m | 455.1 m, exact            |
//   | a 24 m piece ended by Terminate                      | 23.9 m  | 47.8 m, exactly 2.00x     |
//   | a segment with no completed interval at all          | 0 m     | 108.4 m                   |
//
// All three reproduced below (VERDICT: all three agree — see each test's own
// comment). Because they agree, the plan is NOT halted; Tasks 3/4 may proceed.
//
// These are PERMANENT tests documenting the accumulator, not throwaway
// scratch: Task 3 adds the seven-shape suite (four more today-passing shapes,
// three more that fail). Task 4 (CR2 spec 1's register-map fix) flips ONLY the
// terminate row (47.8 -> 23.9) — the row this task's brief actually names.
// The "no completed interval" row does NOT flip: the register map, like the
// fold it replaces, has no notion of "completed" at all — it accumulates
// whatever key is currently active, finished or not — so 108.4 stays
// correct. That row's own 0 m "truth" measures a different quantity (the
// completed-`IntervalActual` oracle from finding #3 above), not what
// `sessionDistanceMeters` reports; this file originally predicted (wrongly)
// that Task 4 would flip it too, corrected here once the fixed
// implementation was run against it (Task 4 report, "the plan is right"
// deviation). The 3x1:00 row already matched its own truth and stays a
// permanent regression guard.

import { describe, expect, it } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { compileProgram } from "../../domain/monitor/program.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import {
  buildTerminate,
  expectedArmedStructure,
} from "../../domain/monitor/pm5/commands.js";
import {
  WORKOUTSTATE_INTERVALREST,
  WORKOUTSTATE_INTERVALWORKDISTANCE,
  WORKOUTSTATE_INTERVALWORKDISTANCETOREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_INTERVALWORKTIMETOREST,
  WORKOUTSTATE_TERMINATE,
  WORKOUTSTATE_WAITTOBEGIN,
  WORKOUTSTATE_WORKOUTEND,
} from "../../domain/monitor/pm5/parse.js";
import {
  ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
  ADDITIONAL_STATUS_1_UUID,
  ADDITIONAL_STATUS_2_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
  GENERAL_STATUS_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  SPLIT_INTERVAL_DATA_UUID,
  TRANSMIT_CHARACTERISTIC_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import {
  buildAdditionalSplitIntervalDataBytes,
  buildAdditionalStatus2Bytes,
  buildGeneralStatusBytes,
  buildSplitIntervalDataBytes,
} from "../../domain/monitor/pm5/statusFrames.js";
import { buildAckFrame } from "../../domain/monitor/pm5/response.js";
import type {
  DiscoveredMonitor,
  MonitorEvent,
  MonitorFrame,
  Transport,
} from "../../domain/monitor/types.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { createEventLog } from "./eventLog";
import { createPm5Driver } from "./driver";
import { createSeriesRecorder } from "./seriesRecorder.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A real library workout (repo convention: at least one test per client task
 *  starts from a seeded workout, not a hand-built minimum — used for the
 *  terminate reproduction below). The fold's arithmetic never inspects the
 *  armed program's own content (it reads only 0x0031's elapsed/distance/state
 *  pair), so which real workout is armed cannot change the numbers this file
 *  checks — using one here is a fixture-realism choice, not a precision one.
 *  The other two reproductions (no-completed-interval, the 3x1:00 sound
 *  segment) need an EXACT interval count/shape the fold's own math depends
 *  on, so they stay on hand-built minimal programs deliberately — see each
 *  test's own comment. */
function seaFretProgram(): WorkoutProgram {
  const workout = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret");
  if (!workout) {
    throw new Error("fixture workout 'Sea Fret' missing from the library seed");
  }
  const draft = buildDraft({
    id: "session-totals-sea-fret",
    title: workout.title,
    type: workout.type,
    // Phase WU: interval 0 used to come from the rower's warm-up SETTING,
    // via `buildRun`'s (now deleted) fourth argument. An authored 5' EASY
    // step compiles to the identical interval — `compileProgram` nulls an
    // effort phase's target exactly as it nulled a warm-up's — so every
    // index, count and total in this file is unchanged.
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

/** A single 60s work interval — used only where the fold's math needs a
 *  minimal, EXACT program (the no-completed-interval reproduction: a
 *  structurally trivial armed program is closer to session 4a's own
 *  "structurally empty" capture than a real multi-step workout would be). */
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

/** Three 60s work intervals with a 30s rest each — the "sound segment" shape
 *  (§F2's 3x1:00-with-rest row). A hand-built program, not a library one: the
 *  test needs to feed EXACTLY three work+rest cycles with numbers chosen to
 *  sum precisely, which a real workout's own step values would not let this
 *  test control. */
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

/** Two 60s work intervals with NO trailing rest on either (task-3-brief.md
 *  Step 2's own name; `restSeconds: 0` compiles per
 *  `domain/monitor/program.test.ts:761`) — the no-rest work->work boundary
 *  shape, where state never visits `"resting"` at all and 0x0033's own
 *  index is the only signal a boundary happened. */
const TWO_INTERVAL_NO_REST_PROGRAM: WorkoutProgram = {
  intervals: Array.from({ length: 2 }, () => ({
    type: "work" as const,
    kind: "time" as const,
    value: 60,
    targetSplit: 120,
    displaySpm: 22,
    restSeconds: 0,
  })),
};

/** Two 60s work intervals, the first with a 30s trailing rest — Step 3's
 *  "clean rest boundary" shape: unlike `TWO_INTERVAL_NO_REST_PROGRAM` above,
 *  this genuinely visits `"resting"` between the two work intervals, so a
 *  test built on it exercises `toProgramIndex`'s resting-state (`index - 1`)
 *  path, not just its rowing (identity) one. */
const TWO_INTERVAL_REST_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work" as const,
      kind: "time" as const,
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 30,
    },
    {
      type: "work" as const,
      kind: "time" as const,
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 0,
    },
  ],
};

/** 2x250m r60, distance-kind both legs — the armed shape of the walk-2026-
 *  08-24 exit-7 capture (`docs/monitor/sessions/walk-2026-08-24/
 *  phone-exit7-ring.json`, README's own `v250m/1:00r...2` PM5 View Detail
 *  header). Used only by the series-truth Task 3 oracle below: every other
 *  program in this file is time-kind (this file's own `tick()` harness
 *  defaults `workoutDurationType` to 0/time; the oracle passes `128`
 *  explicitly per tick, matching the ring's own `durationType=128`). */
const EXIT7_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work" as const,
      kind: "distance" as const,
      value: 250,
      targetSplit: null,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work" as const,
      kind: "distance" as const,
      value: 250,
      targetSplit: null,
      displaySpm: null,
      restSeconds: 60,
    },
  ],
};

// ---------------------------------------------------------------------------
// The harness (task-2-brief.md Step 1). `tick`/`Harness` are the names Task 3
// consumes (its own brief's Step 1 code block already writes against them) —
// governing over this brief's own "Interfaces" line, which named
// `feedShape`/`totalsFor` before Task 1's real driver.test.ts idiom was read.
// ---------------------------------------------------------------------------

/** A bare hand-rolled `Transport`, ported from `driver.test.ts`'s own
 *  `stubTransport` (that file's helpers are module-private, not importable) —
 *  direct control over exactly which characteristic fires with exactly which
 *  bytes, which every reproduction below needs: arbitrary, hand-picked
 *  elapsed/distance/0x0033-index combinations at each tick this file
 *  chooses, not a machine's own reaction to a command.
 *
 *  CR2 spec 1 Task 8 taught `transports/fake.ts` the terminate-elapsed
 *  re-base ITSELF (`synthesizeTerminated()`, its own doc comment) — as the
 *  fake's honest default reaction to a genuine `driver.terminate()` call or
 *  `program()`'s prepare step landing on a running machine, exercised
 *  end-to-end in `driver.test.ts`'s own "the fake's own terminate re-base…"
 *  test. That is a REACTION the fake computes from what it last reported;
 *  it is not a substitute for this file's ability to hand-author an
 *  arbitrary tick — the "no completed interval" and "3x1:00" shapes below
 *  need exact machine-index/elapsed/distance triples no scripted timeline
 *  event or terminate reaction can produce on demand, which is why this
 *  file keeps the stub. */
function stubTransport(): Transport & {
  notify(uuid: string, bytes: Uint8Array): void;
  writes: { uuid: string; bytes: Uint8Array }[];
} {
  const subs = new Map<string, Set<(bytes: Uint8Array) => void>>();
  let disconnectCb: ((reason: string) => void) | null = null;
  const writes: { uuid: string; bytes: Uint8Array }[] = [];

  const transport: Transport & {
    notify(uuid: string, bytes: Uint8Array): void;
    writes: typeof writes;
  } = {
    scan(): Promise<DiscoveredMonitor[]> {
      return Promise.resolve([]);
    },
    connect(): Promise<void> {
      return Promise.resolve();
    },
    write(uuid, bytes): Promise<void> {
      writes.push({ uuid, bytes });
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
    writes,
  };
  // `disconnectCb` is registered by `createPm5Driver`'s own `onDisconnect`
  // subscription but never fired by anything in this file — no reproduction
  // below needs a disconnect mid-flight. `writes` still records the
  // driver's `SAMPLE_RATE_UUID` write at construction (driver.ts:1390)
  // even though nothing here asserts on it.
  return transport;
}

/** Polls the microtask queue until `check()` passes — the same bounded-hop
 *  idiom `driver.test.ts`'s own `waitUntil` uses, needed because
 *  `stubTransport`'s writes/acks resolve through chained Promises across
 *  several microtask hops. */
async function waitUntil(check: () => boolean, maxTicks = 50): Promise<void> {
  for (let i = 0; i < maxTicks && !check(); i += 1) {
    await Promise.resolve();
  }
}

/** The 0x0031 a healthy machine reads back once `p` is genuinely armed —
 *  built from `commands.ts`'s own `expectedArmedStructure` (the production
 *  prediction `verifyArmed` checks the wire against), not restated by hand:
 *  this harness is not testing `verifyArmed` itself, only using it to get a
 *  driver into a state where `program()` resolves. */
function armedStatusFor(p: WorkoutProgram): Uint8Array {
  const structure = expectedArmedStructure(p);
  return buildGeneralStatusBytes({
    elapsedSeconds: 0,
    distanceMeters: 0,
    workoutType: structure.workoutType,
    intervalType: structure.workoutDurationType === 0 ? 0 : 1,
    workoutState: WORKOUTSTATE_WAITTOBEGIN,
    rowingState: 0,
    strokeState: 0,
    totalWorkDistanceMeters: 0,
    workoutDurationRaw: structure.workoutDurationRaw,
    workoutDurationType: structure.workoutDurationType,
    dragFactor: 130,
  });
}

interface Harness {
  transport: ReturnType<typeof stubTransport>;
  log: ReturnType<typeof createEventLog>;
  driver: ReturnType<typeof createPm5Driver>;
  /** Every `MonitorEvent` this driver has emitted so far, in order —
   *  `tick()` reads the trailing `"frame"` ones off this; a reproduction
   *  test reads `"intervalComplete"` off it directly for the TRUTH side of
   *  a §F2 row (a segment with zero completed intervals has zero of
   *  these). */
  events: MonitorEvent[];
  program: WorkoutProgram;
}

/** Builds a driver, programs `p` onto it via the ack-gated stub exchange
 *  (context note: "program via the stub, then feed hand-built 0x0031
 *  payloads"), then primes the `seen.as1`/`seen.as2` gate `maybeEmitFrame`
 *  requires before any frame ever emits (`driver.ts:1674`) — with
 *  zero-filled 0x0032/0x0033, the same shortcut `driver.test.ts`'s own
 *  `r0Harness`/`primedGate` take.
 *
 *  ORDERING MATTERS: the priming notifications fire AFTER `program()` has
 *  already resolved, not before. `program()`'s own armed-readback 0x0031
 *  merges into the driver's internal `raw` state regardless of the `seen`
 *  gate (`verifyArmed` reads `raw` directly), but `maybeEmitFrame` — the
 *  function that would otherwise treat that armed readback as the session
 *  register map's first-ever write — returns immediately while
 *  `seen.as1`/`seen.as2` are still false. So by the time `tick()` fires the
 *  first REAL frame, `session.seen` is still empty, exactly the fresh-driver
 *  starting condition the review's own §5.2 replay recipe describes ("build
 *  a fresh driver per segment"). Confirmed by reading `driver.ts`'s
 *  `maybeEmitFrame` this session, not assumed. */
/** The prepare/sequence/verify ack exchange `program()` always runs,
 *  factored out of `programmed()` (below) so Task 3's Step 5 ("re-arm after
 *  terminate") can drive a SECOND `program()` call on an already-built
 *  harness — same driver, same transport, same subscriptions, per
 *  `driver.test.ts`'s own precedent for exactly this shape
 *  (`programViaStub`, reused there for its "program() succeeds again after
 *  a completed run" test). Identical wire choreography either time:
 *  `program()`'s own `waitForPrepareSettle` short-circuits once the prior
 *  machine state is anything but rowing/resting (`driver.ts:3293`), which a
 *  terminated or freshly-armed machine always is. */
async function armProgram(h: Harness, p: WorkoutProgram): Promise<void> {
  const prepareChunkCount = buildTerminate()[0]!.length;
  const sent = (): number =>
    h.transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
      .length;
  const start = sent();
  const pending = h.driver.program(p);
  await waitUntil(() => sent() > start);
  // The prepare step's own outcome is swallowed unconditionally by
  // `sendPrepare` (anything but a disconnect) — an "ok" ack here is the
  // HONEST default (interface-notes.md §18 s3 item 15: the one byte ever
  // captured for a terminate sent with nothing running decodes to an
  // ACCEPT), unlike `driver.test.ts`'s own long-legacy "reject" default
  // (that file's own comment flags the accept as the honest choice for any
  // NEW helper).
  h.transport.notify(
    TRANSMIT_CHARACTERISTIC_UUID,
    buildAckFrame({ frameStatus: "ok" }),
  );
  await waitUntil(() => sent() > start + prepareChunkCount);
  h.transport.notify(
    TRANSMIT_CHARACTERISTIC_UUID,
    buildAckFrame({ frameStatus: "ok" }),
  );
  // Drain until `verifyArmed()` has registered its wait, so the armed
  // status below is never merged before anything is watching for it.
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
  h.transport.notify(GENERAL_STATUS_UUID, armedStatusFor(p));
  await pending;
}

async function programmed(p: WorkoutProgram): Promise<Harness> {
  const transport = stubTransport();
  const log = createEventLog();
  const driver = createPm5Driver(transport, log, {});
  const events: MonitorEvent[] = [];
  driver.events((e) => events.push(e));
  const h: Harness = { transport, log, driver, events, program: p };

  await armProgram(h, p);

  transport.notify(ADDITIONAL_STATUS_1_UUID, new Uint8Array(17));
  transport.notify(ADDITIONAL_STATUS_2_UUID, new Uint8Array(20));

  return h;
}

/** Re-arms an ALREADY-BUILT harness with a second `program()` call (Step 5:
 *  "re-arm after terminate writes no key"). AS1/AS2 are deliberately NOT
 *  re-notified: `seen.as1`/`seen.as2` (`driver.ts:1130`) are set true once
 *  and never reset by the driver itself — `driver.test.ts`'s own
 *  second-run test notifies them only once, before the FIRST `program()`
 *  call, for the same reason. */
async function reprogram(h: Harness, p: WorkoutProgram): Promise<void> {
  await armProgram(h, p);
  h.program = p;
}

/** Feeds one 0x0031 (and optionally a 0x0033 interval-count update) and
 *  returns the frame the driver emitted. 0x0033 is SEPARATE on purpose:
 *  the no-rest boundary in Task 3 depends on withholding it for one tick,
 *  which is the whole mechanism — when `intervalCount` is omitted, this
 *  function touches 0x0033 not at all, leaving whatever the machine's own
 *  Interval Count last reported. When given, the 0x0033 update is notified
 *  BEFORE the 0x0031 (so the frame this tick returns already reflects the
 *  new count) — `maybeEmitFrame` itself confirms AS1/AS2 merges never
 *  trigger a `"frame"` event (`driver.ts:2639-2648`, "AS1/AS2 only merge
 *  into `raw`... they do NOT themselves trigger a frame event"), so this
 *  ordering is the only one that lets a single `tick()` call both update the
 *  count and observe its effect in the SAME returned frame.
 *
 *  `f.workoutDurationType` (CR2 spec 1 Task 5 review, IMPORTANT-1): defaults
 *  to `0` (time), the value every prior caller relied on implicitly. Added
 *  so a test can feed `128` (distance) on the wire independently of the
 *  armed program's own shape — used below to build realistic distance-goal
 *  frames (e.g. the exit-7 replay). The distance-goal WIRE arm this was
 *  originally added to isolate lived in `driver.ts`'s per-run TWD verdict,
 *  retired by RC-9c (design spec 2026-08-25-free-oracles §2); the surviving
 *  distance-goal predicate, `useMonitorSession.ts`'s `programHasDistanceGoal`,
 *  reads the armed PROGRAM's shape only, not this per-frame byte. */
async function tick(
  h: Harness,
  f: {
    elapsed: number;
    distance: number;
    state: number;
    twd?: number;
    workoutDurationType?: number;
  },
  intervalCount?: number,
): Promise<MonitorFrame> {
  if (intervalCount !== undefined) {
    h.transport.notify(
      ADDITIONAL_STATUS_2_UUID,
      buildAdditionalStatus2Bytes({
        elapsedSeconds: f.elapsed,
        intervalCount,
        averagePowerWatts: 0,
        totalCalories: 0,
        splitAvgPace: 0,
        splitAvgPowerWatts: 0,
        splitAvgCalories: 0,
        lastSplitTimeSeconds: 0,
        lastSplitDistanceMeters: 0,
      }),
    );
  }
  const before = h.events.filter((e) => e.kind === "frame").length;
  h.transport.notify(
    GENERAL_STATUS_UUID,
    buildGeneralStatusBytes({
      elapsedSeconds: f.elapsed,
      distanceMeters: f.distance,
      workoutType: 8,
      intervalType: 0,
      workoutState: f.state,
      rowingState: 1,
      strokeState: 2,
      totalWorkDistanceMeters: f.twd ?? f.distance,
      workoutDurationRaw: 6000,
      workoutDurationType: f.workoutDurationType ?? 0,
      dragFactor: 130,
    }),
  );
  const frames = h.events.filter(
    (e): e is Extract<MonitorEvent, { kind: "frame" }> => e.kind === "frame",
  );
  if (frames.length === before) {
    throw new Error(
      "tick(): driver did not emit a frame — seen-gate not satisfied (AS1/AS2 never primed)?",
    );
  }
  return frames[frames.length - 1]!.frame;
}

/** One full boundary — 0x0037 then 0x0038, the pair `emitIntervalComplete`
 *  files into `run.recordedActuals` (ported from `driver.test.ts`'s own
 *  `splitHalf`/`asSplitHalf`, module-private there). Task 8's suspicion
 *  verdict reads `recordedActuals`, not `session.seen` (`tick()`'s own
 *  registers) — the "final totals" describe block above never needed this
 *  helper because it only asserted on `session.seen` via `tick()` alone.
 *
 *  `machineIndex` is the raw Split/Interval Number to put on the wire —
 *  callers pass `programIndex + 1` (`toActualIndex`'s own doc comment:
 *  `candidate = machineIndex - 1`, unconditionally, in `[0, programLength)`
 *  needs no clamping for that input) rather than the normalized program
 *  index, so a reader checking this file against `intervalIndex.ts` sees
 *  the same arithmetic, not a restated one. */
function emitBoundary(
  h: Harness,
  machineIndex: number,
  seconds: number,
  meters: number,
): void {
  h.transport.notify(
    SPLIT_INTERVAL_DATA_UUID,
    buildSplitIntervalDataBytes({
      elapsedSeconds: seconds,
      distanceMeters: meters,
      splitIntervalTimeSeconds: seconds,
      splitIntervalDistanceMeters: meters,
      intervalRestTimeSeconds: 0,
      intervalRestDistanceMeters: 0,
      splitIntervalType: 0,
      splitIntervalNumber: machineIndex,
    }),
  );
  h.transport.notify(
    ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
    buildAdditionalSplitIntervalDataBytes({
      elapsedSeconds: 0,
      splitIntervalAvgStrokeRate: 22,
      splitIntervalWorkHeartRateBpm: 150,
      splitIntervalRestHeartRateBpm: 120,
      splitIntervalAvgPace: 120,
      splitIntervalTotalCalories: 0,
      splitIntervalAvgCalories: 0,
      splitIntervalSpeedMetersPerSecond: 0,
      splitIntervalPowerWatts: 0,
      splitAvgDragFactor: 130,
      splitIntervalNumber: machineIndex,
      // RC-8 (storage-spine design spec §3): 0, not the old 1 this fixture
      // used to carry — the real machine reads 0 in 3448 of 3448 committed
      // frames (docs/monitor/pm5-ble-ecosystem-review.md:389; fake.ts's own
      // `ergMachineType` comment has the same citation).
      ergMachineType: 0,
    }),
  );
}

// ---------------------------------------------------------------------------
// The three §F2 reproductions (task-2-brief.md Steps 2-4)
// ---------------------------------------------------------------------------

describe("session accumulator: §F2 stop-gate — reproducing the architecture review's three published numbers", () => {
  it(
    "a 24 m piece ended by Terminate: the register map reports 23.9 m for " +
      "23.9 m rowed, no double count (CR2 spec 1 fix; was 47.8 m, exactly " +
      "2.00x, before Task 4)",
    async () => {
      // §F2 row 2 / state-architecture-review.md:432. Shape: CSAFE-DEF
      // footnote 12 — a Terminate frame's Elapsed Time jumps BACKWARDS to a
      // smaller NON-ZERO value while Distance stands exactly still (six of
      // these are in the committed captures, per §F2's own count). The OLD
      // fold triggered its reset on the elapsed drop ALONE — it never
      // checked that distance also reset — so it banked the pre-terminate
      // reading into `offsetDistance` and then added the terminate frame's
      // OWN (unchanged) distance on top: exactly a double count. The
      // register map has no edge to misread: `"terminated"` is neither
      // `"rowing"` nor `"resting"`, so `activeKey` is `null` for the
      // terminate frame itself (`driver.ts`'s own `activeKey` derivation)
      // and nothing is written — the total stays exactly what interval 0's
      // one work tick already registered. Numbers taken verbatim from
      // task-3-brief.md's own Step 1 (the corrected version of this same
      // test), so Task 3 could reuse this exact tick sequence unmodified.
      const h = await programmed(seaFretProgram());

      await tick(
        h,
        {
          elapsed: 33.57,
          distance: 23.9,
          state: WORKOUTSTATE_INTERVALWORKTIME,
        },
        0,
      );
      const f = await tick(h, {
        elapsed: 21.51,
        distance: 23.9,
        state: WORKOUTSTATE_TERMINATE,
      });

      // §F2: 23.9 truth -> 23.9 reported, 1.00x (was 47.8, 2.00x).
      expect(f.sessionDistanceMeters).toBeCloseTo(23.9, 1);
      expect(f.sessionDistanceMeters / 23.9).toBeCloseTo(1.0, 2);
    },
  );

  it(
    "a segment with no completed interval at all: the register map still " +
      "reports the raw 108.4 m against a truth of 0 completed intervals " +
      "(NOT a defect the register map fixes — see this file's own header)",
    async () => {
      // §F2 row 3 / state-architecture-review.md:433, citing session 4a
      // (pm5-interface-notes.md §19.13 / :2615-2630): a program armed over a
      // machine still mid-piece can arm STRUCTURALLY EMPTY — "rowed to 108.4
      // m: intervalIndex stayed pinned at 0 and state stayed rowing the
      // entire way — no resting transition, no boundary, no
      // intervalComplete at all." The shape is therefore the SIMPLEST
      // possible one: state=rowing throughout, elapsed/distance climbing
      // monotonically, one key (0) the whole time — which is exactly why
      // this row is instructive despite being arithmetically trivial: the
      // register map has no notion of "completed" at all, only "the key
      // currently active", so it reports interval 0's own running register
      // as the total, same as the raw wire value. That is not the bug this
      // task fixes and the map does not change it — see this file's own
      // header for why the "0 m" truth column is a different quantity
      // (completed-`IntervalActual` sum) from what `sessionDistanceMeters`
      // reports. Asserted directly below via zero `intervalComplete`
      // events, not inferred.
      const h = await programmed(MINIMAL_PROGRAM);

      await tick(
        h,
        { elapsed: 25, distance: 52.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      const f = await tick(
        h,
        {
          elapsed: 52.5,
          distance: 108.4,
          state: WORKOUTSTATE_INTERVALWORKTIME,
        },
        0,
      );

      // The driver's own reported number: §F2's 108.4 m.
      expect(f.sessionDistanceMeters).toBeCloseTo(108.4, 1);
      // The truth side of the same row: zero completed intervals, because
      // no boundary characteristic ever notified.
      const completed = h.events.filter((e) => e.kind === "intervalComplete");
      expect(completed).toHaveLength(0);
    },
  );

  it(
    "3 x 1:00 with rest, both fields resetting together: the total equals " +
      "the sum of the three per-interval finals under both the old fold " +
      "and the new register map (permanent regression guard, not a defect " +
      "to flip)",
    async () => {
      // §F2 row 1 / state-architecture-review.md:431: the ONE row where
      // truth and report already agree. Shape, per task-2-brief.md Step 4:
      // three work+rest intervals, each ending with a "final" pre-reset
      // reading where BOTH elapsed AND distance have climbed together
      // (unlike the terminate row, a genuine rest->work boundary resets
      // BOTH fields on the same frame — driver.ts's own premise, correct
      // for exactly this shape per state-architecture-review.md §7.5: "the
      // clock runs on" through a rest, and both fields reset together at
      // the next work interval). The literal 455.1 in §F2 comes from one
      // specific capture slice the antagonist could not derive from the
      // Appendix recipe (task-2-brief.md's own note) — this synthetic shape
      // is built to AGREE (fold total == sum of finals), not to reproduce
      // that literal number; the three finals below happen to sum to 455.1
      // for continuity with the cited figure, but the assertion is against
      // the computed sum, never the constant.
      const h = await programmed(THREE_INTERVAL_PROGRAM);

      const interval0Final = { elapsed: 87.3, distance: 150.0 };
      const interval1Final = { elapsed: 85.9, distance: 152.0 };
      const interval2Final = { elapsed: 86.0, distance: 153.1 };

      // Interval 0: work, then its trailing rest's own final reading. The
      // REST tick's own 0x0033 Interval Count is forward-attributed to the
      // interval it is heading INTO (`intervalIndex.ts`'s own doc comment,
      // interface-notes.md §18 #3: "rest-after-work0, resting, machineIndex
      // 1 -> our 0") — machine index 1, not 0, even though this reading
      // still belongs to (and finalizes) our interval 0. Corrected here
      // (Task 4): the pre-Task-4 fixture used machineIndex 0 for this tick,
      // which happened to be inconsequential only because `toProgramIndex`
      // clamps machineIndex 0 while resting to the same key (0) that the
      // correct forward-attributed value also produces — an equivalence
      // that stops holding at the two interior boundaries below, where
      // getting this wrong silently overwrote the WRONG key once the
      // register map (unlike the old fold) started reading 0x0033 at all.
      await tick(
        h,
        { elapsed: 30, distance: 75.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      await tick(
        h,
        {
          elapsed: interval0Final.elapsed,
          distance: interval0Final.distance,
          state: WORKOUTSTATE_INTERVALREST,
        },
        1,
      );

      // rest -> work boundary: BOTH fields reset together (unlike the
      // terminate row above, where only elapsed dropped).
      await tick(
        h,
        { elapsed: 0.5, distance: 1.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        1,
      );
      await tick(
        h,
        { elapsed: 30, distance: 76.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        1,
      );
      // Interval 1's own trailing rest: forward-attributed to machine index
      // 2 (heading into interval 2), same rule as above — this is the
      // interior boundary where the pre-Task-4 fixture's machineIndex 1 was
      // genuinely wrong (no clamp rescues it): it wrote interval1Final onto
      // KEY 0, clobbering interval 0's own final reading instead of
      // finalizing interval 1's.
      await tick(
        h,
        {
          elapsed: interval1Final.elapsed,
          distance: interval1Final.distance,
          state: WORKOUTSTATE_INTERVALREST,
        },
        2,
      );

      // Second rest -> work boundary.
      await tick(
        h,
        { elapsed: 0.4, distance: 0.9, state: WORKOUTSTATE_INTERVALWORKTIME },
        2,
      );
      await tick(
        h,
        { elapsed: 30, distance: 76.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        2,
      );
      // Interval 2's own trailing rest: forward-attributed to machine index
      // 3 (heading into a fourth interval that does not exist), which
      // `toProgramIndex`'s own upper clamp (`candidate === programLength`)
      // brings back to key 2 — the same clamp-equivalence Task 3's
      // "clean rest boundary" shape relies on, cited in that test's own
      // comment.
      const f = await tick(
        h,
        {
          elapsed: interval2Final.elapsed,
          distance: interval2Final.distance,
          state: WORKOUTSTATE_INTERVALREST,
        },
        3,
      );

      const expectedTotal =
        interval0Final.distance +
        interval1Final.distance +
        interval2Final.distance;
      expect(f.sessionDistanceMeters).toBeCloseTo(expectedTotal, 1);
      expect(f.sessionDistanceMeters).toBeCloseTo(455.1, 1);
    },
  );
});

// ---------------------------------------------------------------------------
// Task 3 — the seven shapes the wire actually produces (task-3-brief.md).
// Ran against the OLD (broken) accumulator when Task 3 wrote this file. Per
// the brief's own split: Steps 1 and 7 were marked `it.fails` — they
// documented the current defect. Task 4 (CR2 spec 1's register-map fix)
// removed Step 1's `.fails`: the terminate shape now reports correctly, no
// edge to misread. Step 7's own `.fails` is removed by TASK 5 (this file's
// current task): its numeric half was already fixed by the register map,
// and Task 5 adds the `"intervals seen"` divergence entry
// (`driver.ts`'s `logSummaryTotals`) that test asserts — see that test's own
// comment for how it reaches that entry (0x0039 notify, since that is where
// the entry is logged). Steps 2, 3, 5, 6 passed under the old fold and are
// regression guards this task keeps green. Step 4 was written per the
// brief's exact code but, traced and RUN against the old fold, PASSED then
// (see task-3-report.md for the full trace) — contrary to the brief's own
// prediction that it would fail; reported there as a discrepancy, not
// silently corrected away. It stays green under the register map too.
// ---------------------------------------------------------------------------

describe("session accumulator: seven shapes (Task 3) — all green as of Task 5", () => {
  it(
    "a terminate does not double the session distance " +
      "(CR2 spec 1 fix, Task 4: was `it.fails`, documenting the old " +
      "fold's exact-2x defect; the register map has no edge to misread)",
    async () => {
      // CSAFE-DEF footnote 12: elapsed jumps BACK to a smaller non-zero
      // value, distance stands exactly still. Six of these are in the
      // record (task-3-brief.md Step 1, same tick shape as the §F2
      // terminate reproduction above, on the minimal program instead of
      // Sea Fret).
      const h = await programmed(MINIMAL_PROGRAM);
      await tick(
        h,
        {
          elapsed: 33.57,
          distance: 23.9,
          state: WORKOUTSTATE_INTERVALWORKTIME,
        },
        0,
      );
      const f = await tick(h, {
        elapsed: 21.51,
        distance: 23.9,
        state: WORKOUTSTATE_TERMINATE,
      });
      expect(f.sessionDistanceMeters).toBeCloseTo(23.9, 1); // was 47.8
    },
  );

  it(
    "keeps a completed interval when 0x0033's index lags 0x0031's reset " +
      "(passes today — a regression guard the fold's real design must " +
      "keep green, since last-write-wins would flip it)",
    async () => {
      const h = await programmed(TWO_INTERVAL_NO_REST_PROGRAM);
      await tick(
        h,
        {
          elapsed: 59.83,
          distance: 74.4,
          state: WORKOUTSTATE_INTERVALWORKTIME,
        },
        0,
      );
      // pm5-session4b L2837: the counters reset one notification BEFORE
      // the interval count increments, so this frame still carries key 0.
      await tick(
        h,
        { elapsed: 0, distance: 0, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      // L2838: the index catches up.
      const f = await tick(
        h,
        { elapsed: 0.5, distance: 1.2, state: WORKOUTSTATE_INTERVALWORKTIME },
        1,
      );
      // 74.4 must survive. Last-write-wins writes (0,0) onto key 0 and
      // reports 1.2.
      expect(f.sessionDistanceMeters).toBeGreaterThan(74);
    },
  );

  it(
    "a clean rest boundary sums both intervals, driven through a resting " +
      "tick so toProgramIndex's state-keyed (resting) path is exercised " +
      "(passes today)",
    async () => {
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      const interval0Final = { elapsed: 87.3, distance: 150.0 };
      const interval1Final = { elapsed: 59.0, distance: 130.0 };

      await tick(
        h,
        { elapsed: 30, distance: 75.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      await tick(
        h,
        {
          elapsed: interval0Final.elapsed,
          distance: interval0Final.distance,
          state: WORKOUTSTATE_INTERVALREST,
        },
        0,
      );

      // rest -> work boundary: both fields reset together (unlike the
      // no-rest shape above, this frame's own state is genuinely
      // "resting" beforehand, exercising toProgramIndex's index-1 branch).
      await tick(
        h,
        { elapsed: 0.5, distance: 1.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        1,
      );
      await tick(
        h,
        { elapsed: 30, distance: 76.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        1,
      );
      const f = await tick(
        h,
        {
          elapsed: interval1Final.elapsed,
          distance: interval1Final.distance,
          state: WORKOUTSTATE_INTERVALWORKTIME,
        },
        1,
      );

      const expectedTotal = interval0Final.distance + interval1Final.distance;
      expect(f.sessionDistanceMeters).toBeCloseTo(expectedTotal, 1);
    },
  );

  it(
    "keeps the total moving when the machine reports no interval identity " +
      "(brief predicts FAIL today; traced and run, this PASSES today — " +
      "see task-3-report.md)",
    async () => {
      const h = await programmed(MINIMAL_PROGRAM);
      await tick(
        h,
        { elapsed: 30, distance: 100, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      // An interval count the armed program cannot explain -> toProgramIndex
      // returns null while the machine is genuinely rowing. 21% of rowing
      // frames in the record look like this.
      const f = await tick(
        h,
        { elapsed: 40, distance: 140, state: WORKOUTSTATE_INTERVALWORKTIME },
        99,
      );
      expect(f.sessionDistanceMeters).toBeGreaterThan(100); // must NOT freeze
    },
  );

  it(
    "a re-arm after terminate starts the total fresh, no carried key " +
      "(passes today — program()'s own success path unconditionally " +
      "resets `session`, driver.ts:3728)",
    async () => {
      const h = await programmed(MINIMAL_PROGRAM);

      // Bank the same doubled offset Step 1 documents, deliberately, so
      // this test would catch a re-arm that forgot to clear `session` —
      // not just one that happens to start small anyway.
      await tick(
        h,
        { elapsed: 30, distance: 80, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      await tick(h, {
        elapsed: 15,
        distance: 80,
        state: WORKOUTSTATE_TERMINATE,
      });

      await reprogram(h, MINIMAL_PROGRAM);

      const f = await tick(
        h,
        { elapsed: 5, distance: 11, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );

      // Only the new run's own reading — nothing carried from the
      // terminated run.
      expect(f.sessionDistanceMeters).toBeCloseTo(11, 1);
    },
  );

  it(
    "a gap inside an interval converges on the resumed reading, not the " +
      "sum (passes today)",
    async () => {
      const h = await programmed(MINIMAL_PROGRAM);

      await tick(
        h,
        { elapsed: 10, distance: 20, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      // Several ticks skipped here — a genuine connection gap mid-interval,
      // same key (0) on both sides of the gap.
      const f = await tick(
        h,
        { elapsed: 45, distance: 95, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );

      // The resumed reading alone, not 20 + 95.
      expect(f.sessionDistanceMeters).toBeCloseTo(95, 1);
    },
  );

  it(
    "loses an interval it never saw, and logs that it did " +
      "(Task 5: the numeric half already passed under Task 4's register " +
      "map — this test's own history is the removed `.fails`; the " +
      "'intervals seen' divergence entry is logged in `logSummaryTotals`, " +
      "which fires on 0x0039, so this test notifies END_OF_WORKOUT_SUMMARY_UUID " +
      "once the run has something to diverge from)",
    async () => {
      const h = await programmed(THREE_INTERVAL_PROGRAM);

      // Interval 0: worked and rested normally.
      await tick(
        h,
        { elapsed: 30, distance: 75.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      await tick(
        h,
        { elapsed: 87.3, distance: 150.0, state: WORKOUTSTATE_INTERVALREST },
        0,
      );

      // Interval 1 (its whole work+rest span) is never fed a single tick —
      // a genuine connection gap spanning an entire interval.

      // Resume mid-interval-2, rowing.
      const f = await tick(
        h,
        { elapsed: 5.0, distance: 10.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        2,
      );

      const expectedWithoutInterval1 = 150.0 + 10.0;
      expect(f.sessionDistanceMeters).toBeCloseTo(expectedWithoutInterval1, 1);

      // `logSummaryTotals` (`driver.ts`) is where the interval-count
      // divergence is recorded, and it only ever runs on 0x0039 — a
      // zero-filled 20-byte payload decodes fine (`parseEndOfWorkoutSummary`
      // only checks length), and the content is irrelevant to this
      // assertion, same shortcut `driver.test.ts`'s own summary tests take
      // where the values don't matter.
      h.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));

      const div = h.log.entries().filter((e) => e.kind === "divergence");
      expect(div.some((e) => e.detail.includes("intervals seen"))).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// SANCTIONED SCOPE ADDITION (controller ruling after Task 4's own review,
// disclosed as a spec deviation — task-5-brief.md's own dispatch note):
// Task 4's `activeKey` write rule dropped the final counter bump that
// arrives ON the WORKOUTEND tick itself. `driver.test.ts`'s own WALK_4
// describe block never arms a program (see that block's own header
// comment), so it could not exercise this — an armed program is required
// before `session.seen` has a key for a finished frame to max-merge into at
// all. This file arms one, reproducing WALK_4's own shape (finished
// 33.07/109.7 after a last resting reading of 29.44/101 — the exact
// hardware-observed gap, 3.63 s/8.7 m).
// ---------------------------------------------------------------------------

describe("session accumulator: the finish's own reading (CR2 spec 1 Task 5, controller ruling)", () => {
  it(
    "captures the WORKOUTEND tick's own bump over the last resting reading " +
      "(WALK_4-shaped: rest 29.44/101, finished 33.07/109.7 — the total " +
      "must include the bump, not stop at the rest reading)",
    async () => {
      const h = await programmed(MINIMAL_PROGRAM);

      // The last resting reading before the finish (WALK_4's own trace).
      // MINIMAL_PROGRAM has one interval, so `toProgramIndex`'s own resting
      // clamp (`machineIndex - 1` clamped to 0) puts this on key 0 exactly
      // like a genuine trailing rest would.
      await tick(
        h,
        { elapsed: 29.44, distance: 101, state: WORKOUTSTATE_INTERVALREST },
        0,
      );

      // The WORKOUTEND tick itself, reading HIGHER than the rest tick above
      // — the terminal bump this ruling exists to capture. `toProgramIndex`
      // returns `null` for `"finished"` regardless of the 0x0033 value, so
      // no `intervalCount` is fed here; the fallback in `activeKey` is what
      // must attribute this reading to key 0.
      const f = await tick(h, {
        elapsed: 33.07,
        distance: 109.7,
        state: WORKOUTSTATE_WORKOUTEND,
      });

      // Before this ruling: sessionDistanceMeters stayed at 101 (the rest
      // tick's own reading) and sessionElapsedSeconds at 29.44 — the
      // finished tick wrote no key at all, and the run's own final bump
      // never reached the rower's screen.
      expect(f.sessionElapsedSeconds).toBeCloseTo(33.07, 2);
      expect(f.sessionDistanceMeters).toBeCloseTo(109.7, 1);
    },
  );

  it(
    "a finished reading LOWER than the running max cannot pull the total " +
      "down (max-merge, same rule as every other register write)",
    async () => {
      const h = await programmed(MINIMAL_PROGRAM);

      await tick(
        h,
        { elapsed: 40, distance: 120, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      // A dishonest/late finished reading, smaller than the tick above —
      // the PM5 is not observed to do this, but the rule must be safe
      // against it regardless (`activeKey`'s own comment: "a dishonest
      // smaller reading cannot lower anything").
      const f = await tick(h, {
        elapsed: 10,
        distance: 30,
        state: WORKOUTSTATE_WORKOUTEND,
      });

      expect(f.sessionElapsedSeconds).toBeCloseTo(40, 2);
      expect(f.sessionDistanceMeters).toBeCloseTo(120, 1);
    },
  );
});

// ---------------------------------------------------------------------------
// RC-9c (design spec 2026-08-25-free-oracles §2): the accumulator-vs-machine
// TWD verdict this block used to pin (CR2 spec 1 Task 5's `recordTwdVerdict`)
// is RETIRED, not fixed. Both sides of that comparison were the identical
// quantity — 0x0031's Total Work Distance is an odometer of metres genuinely
// rowed, work plus rest coast, same as our own accumulator — so a green
// verdict certified nothing about the stored row, and RC-5 moved every
// displayed number off that quantity anyway. This pin proves the retirement:
// the exact scenario that used to log "accumulator and machine total differ
// by 50.0m" (a 50 m gap, comfortably past the old 5 m tolerance) now produces
// no `"divergence"` entry of that shape at all — inverted from the old
// assertion (`toHaveLength(1)` -> `toHaveLength(0)`), red against
// unmodified `recordTwdVerdict`.
// ---------------------------------------------------------------------------

describe("session accumulator: the TWD verdict is retired (RC-9c)", () => {
  it("a 50 m accumulator/machine gap that used to fire the TWD divergence now logs nothing of the kind", async () => {
    const h = await programmed(MINIMAL_PROGRAM);

    // The accumulator banks 50 m (this tick's own distance); the machine's
    // own totalWorkDistanceMeters (`twd`) is fed a deliberately different
    // 100 m — the exact gap the retired verdict used to convict on.
    await tick(
      h,
      {
        elapsed: 30,
        distance: 50,
        twd: 100,
        state: WORKOUTSTATE_INTERVALWORKTIME,
      },
      0,
    );
    await tick(h, {
      elapsed: 30,
      distance: 50,
      twd: 100,
      state: WORKOUTSTATE_WORKOUTEND,
    });

    const div = h.log
      .entries()
      .filter(
        (e) =>
          e.kind === "divergence" &&
          e.detail.includes("accumulator and machine total differ"),
      );
    expect(div).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Review I3 (spec exit criterion 10): §5.2's outage table
// (state-architecture-review.md:930-952) named FOUR outage shapes against a
// session whose truth is 155.61s/455.1m — "none" and "5s, inside one
// interval" are already covered (the §F2/seven-shapes suites above; the
// latter is this file's own "a gap inside an interval converges on the
// resumed reading" test). The other two — "spans one boundary" and "spans
// the boundary and the finish" — were never given a test against the
// CURRENT driver. §5.2's own Reported column (431.1 m / 237.0 m) measured
// the OLD FOLD, replaced by this spec's register map; those numbers do not
// carry over; each test below derives the register map's OWN number by
// hand, from `session.seen`'s own max-merge-per-key rule
// (`driver.ts`'s own doc comment), not by re-deriving §5.2's fold-era
// figures.
// ---------------------------------------------------------------------------

describe("session accumulator: review I3 — outage shapes 2 and 3 (§5.2, spec exit criterion 10)", () => {
  it(
    "shape 2 — a gap spanning ONE boundary, into a restSeconds:0 interval, " +
      "is CR2 spec 1 Task 11's own disclosed bounded edge: interval 1's " +
      "opening reading cannot prove a reset against key 0's own " +
      "gap-truncated register, so it folds into key 0 instead of opening " +
      "key 1 (REVISED post-Task-11 — see this test's own history below)",
    async () => {
      // TWO_INTERVAL_REST_PROGRAM, same fixture and same interval-0/1
      // finals ({87.3, 150.0} / {59.0, 130.0}, truth 280.0 m) as this
      // file's own "a clean rest boundary sums both intervals" test above
      // — reused rather than restated so the truth figure is traceable to
      // an already-verified shape.
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      // Interval 0's own mid-work reading is recorded (key 0 = 75.0 m) —
      // then the CONNECTION GAP opens: no further notification arrives
      // until well after the boundary. Interval 0's own true final rest
      // reading (87.3s/150.0m) is never reported at all — the gap
      // swallows it, the boundary transition, AND interval 1's opening —
      // and the radio resumes only once interval 1 has ALREADY reached
      // its own true final rest reading (59.0s/130.0m), fed directly with
      // no intermediate tick.
      await tick(
        h,
        { elapsed: 30, distance: 75.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      // (the gap: no ticks fed for interval 0's rest, the boundary, or
      // interval 1's own work phase)
      //
      // intervalCount is 2, not 1: `intervalIndex.ts`'s own observed table
      // ("rest after work1 -> machine 2, the phantom") forward-attributes a
      // REST tick to the interval it is heading INTO, and `toProgramIndex`'s
      // upper clamp (`candidate === programLength`) brings machine index 2
      // back to our own index 1 on this 2-interval program — the same
      // upper-clamp equivalence THREE_INTERVAL_PROGRAM's own §F2
      // reproduction cites for its own trailing rest above.
      const f = await tick(
        h,
        {
          elapsed: 59.0,
          distance: 130.0,
          state: WORKOUTSTATE_INTERVALREST,
        },
        2,
      );

      // PRE-TASK-11: `session.seen`'s own max-merge-per-key rule opened
      // key 1 unconditionally on this tick (interval 1 had never been seen
      // before), banking its own true final (59.0s/130.0m) directly. Key 0
      // stayed frozen at its own last-seen-before-the-gap reading
      // (30s/75.0m — nothing between there and interval 0's true final
      // 87.3s/150.0m was ever observed). Reported total was 75.0 + 130.0 =
      // 205.0 against a 280.0 truth — a 75.0 m bounded loss, exactly
      // interval 0's own un-banked tail (150.0 - 75.0).
      //
      // POST-TASK-11 (task-11-brief.md's own "Disclosed bounded edge",
      // verbatim): this exact shape is the named edge case — a genuinely
      // new interval (1, restSeconds:0, an "r0 boundary") whose FIRST seen
      // tick already has elapsed (59.0) NOT strictly less than the
      // previous key's own register (key 0's gap-truncated 30.0), because
      // a multi-second frame gap ate the reset tick the guard needs to see.
      // The open-on-reset guard therefore CANNOT tell this tick apart from
      // a state-8 poison and, by its own contract, folds it into key 0
      // instead of opening key 1 — logged as a "refused open" divergence,
      // never silent. Key 0 becomes {59.0, 130.0} (max-merged over its own
      // {30, 75.0}); key 1 never opens. Reported total is now 130.0
      // (key 0 alone) against the same 280.0 truth — 150.0 m bounded loss,
      // strictly larger than before but still monotone and still bounded:
      // this is the guard trading a smaller, silent misattribution (the
      // pre-Task-11 shape) for a larger, LOGGED one, in exchange for
      // closing the walk's own falsification (task-11-brief.md's own
      // 353m-vs-195.5-198.7m photograph). The total can never go DOWN from
      // here; the loss is fully accounted by the divergence entries below.
      const reportedTotal = 130.0;
      const truth = 280.0;
      const boundedLoss = 150.0;
      expect(truth - reportedTotal).toBeCloseTo(boundedLoss, 1);
      expect(f.sessionDistanceMeters).toBeCloseTo(reportedTotal, 1);

      // The refused-open divergence fires on the very tick that redirects.
      const refused = h.log
        .entries()
        .filter((e) => e.kind === "divergence" && e.detail.includes("refused"));
      expect(refused).toHaveLength(1);
      expect(refused[0]!.detail).toContain("key 1");
      expect(refused[0]!.detail).toContain("key 0");

      // `session.seen.size` is now 1, not 2 (key 1 never opened), so
      // `logSummaryTotals`'s "intervals seen" divergence — the check that
      // exists specifically to catch a lost interval — now DOES fire
      // (pre-Task-11 it stayed quiet: both intervals had their own key).
      // This is the same trade the total's own comment above describes:
      // the guard turns a silent misattribution into a logged one. (A
      // SEPARATE divergence — accumulator-vs-machine-TWD — also fires
      // here, an orthogonal, already-tested check: `tick()`'s own default
      // wires 0x0031's TWD to each call's own per-tick `distance`, not a
      // realistic monotonic session TWD, so the raw 0x0031 field this
      // fixture produces is not the shape that check is about; it is not
      // this test's concern.)
      h.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));
      const div = h.log
        .entries()
        .filter(
          (e) => e.kind === "divergence" && e.detail.includes("intervals seen"),
        );
      expect(div).toHaveLength(1);
    },
  );

  it(
    "shape 3 — a gap spanning the boundary AND the finish: no " +
      "workoutComplete ever fires, and per review I2's scoping the " +
      "interval-count divergence check never runs either (it lives only " +
      "on the 0x0039 path) — the loss is currently silent, undocumented " +
      "by any log entry",
    async () => {
      // THREE_INTERVAL_PROGRAM — its own truth (455.1 m) is §5.2's own
      // cited truth figure (155.61s/455.1m) for continuity with the
      // table's numbers, even though this shape's REPORTED figure does
      // not (§5.2's 237.0 m measured the old fold; see this describe
      // block's own header).
      const h = await programmed(THREE_INTERVAL_PROGRAM);
      const events: import("../../domain/monitor/types.js").MonitorEvent[] = [];
      h.driver.events((e) => events.push(e));

      const f = await tick(
        h,
        { elapsed: 30, distance: 75.0, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );

      // The gap opens here and NEVER closes: the connection dies for
      // good mid-interval-0. No further General Status notification, no
      // interval boundary, no finish, no 0x0039 — the run is simply
      // truncated. Nothing else is fed.

      // BY HAND: key 0 is the only key ever written, frozen at 75.0 (the
      // one reading before the connection died). Truth = 455.1 (all
      // three intervals' true finals, summed as this file's own §F2
      // "3 x 1:00" reproduction establishes). Bounded loss = 455.1 -
      // 75.0 = 380.1 m — 83.5% of the truth, and NOTHING in the trace
      // says so.
      const reportedTotal = 75.0;
      const truth = 455.1;
      const boundedLoss = 380.1;
      expect(truth - reportedTotal).toBeCloseTo(boundedLoss, 1);
      expect(f.sessionDistanceMeters).toBeCloseTo(reportedTotal, 1);

      // No workoutComplete: a terminal state (`"finished"`/`"terminated"`)
      // never arrived, and that MonitorEvent only fires off one
      // (`driver.ts`'s own "a terminal state closes THE RUN" comment).
      expect(events.some((e) => e.kind === "workoutComplete")).toBe(false);
      // No divergence entry either — review I2's scoping made this
      // honest: `logSummaryTotals` (the ONLY place the interval-count
      // divergence is computed) has exactly one call site, the 0x0039
      // handler, and no 0x0039 ever arrived here. The bounded loss above
      // is real and entirely unreported.
      const div = h.log.entries().filter((e) => e.kind === "divergence");
      expect(div).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Task 11 — the walk's falsification (CR2 spec 1, 2026-08-15).
// `docs/monitor/sessions/walk-2026-08-15/` session B, a 2x1:00 @6k (r30/r0):
// ~23s into interval 2 the PM5 read 19m into the interval while the phone
// read TOTAL M 353 — honest total 195.5-198.7m. The mechanism: WORKOUTSTATE_
// INTERVALWORKTIMETOREST (8) is an ephemeral work->rest transition state
// that still maps to "rowing" (`parse.ts`'s own `WORKOUTSTATE_TO_STATE`).
// `session-a-multitest.json` seq 26 is a captured 0x0031 sample in exactly
// this state, one entry before the "resting" flip, carrying the COMPLETED
// interval's own pair. If 0x0033's Interval Count has already incremented at
// that tick (the one unrecorded half — SECONDARY, inferred from the capture
// window rather than directly observed on this exact byte), `toProgramIndex`
// resolves the NEXT interval's program index while the reading on the wire
// still belongs to the interval that just finished — opening that next key
// with the completed interval's own (larger) pair, which max-merge then
// makes permanent.
// ---------------------------------------------------------------------------

describe("session accumulator: the walk's falsification (CR2 spec 1 Task 11)", () => {
  it(
    "a state-8 poison tick cannot open the next interval's register " +
      "(HEAD: 353.0m/150.05s — a state-8 poison opens key 1 with the " +
      "completed interval's own pair, permanent via max-merge; fixed: " +
      "198.7m/113s, both fields)",
    async () => {
      // TWO_INTERVAL_REST_PROGRAM: work0 r30 / work1 r0 — the exact shape
      // walk session B rowed. programLength 2.
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      // #1 — key0 opens normally.
      await tick(
        h,
        {
          elapsed: 52.14,
          distance: 173.3,
          state: WORKOUTSTATE_INTERVALWORKTIME,
        },
        0,
      );

      // #2 — THE POISON TICK. State 8 still maps to "rowing"
      // (`WORKOUTSTATE_TO_STATE`'s own `8: "rowing"` row), but 0x0033's own
      // Interval Count has already incremented to 1 — the one unrecorded
      // half this session's own capture window implies (SECONDARY: no
      // capture shows this exact byte at this exact instant, only the
      // resulting frame shape). `toProgramIndex(1, "rowing", 2)` resolves
      // program index 1, a key `session.seen` does not hold yet — without
      // the guard this OPENS key 1 with interval 0's own completed pair.
      await tick(
        h,
        {
          elapsed: 60.05,
          distance: 173.3,
          state: WORKOUTSTATE_INTERVALWORKTIMETOREST,
        },
        1,
      );

      // #3 — the genuine rest tick. `toProgramIndex(1, "resting", 2)` folds
      // back to program index 0 (the resting -1 offset), so this always
      // grows key 0 regardless of the guard.
      await tick(
        h,
        { elapsed: 61.48, distance: 175, state: WORKOUTSTATE_INTERVALREST },
        1,
      );

      // #4 — key 0's true final rest reading.
      await tick(
        h,
        { elapsed: 90, distance: 179.7, state: WORKOUTSTATE_INTERVALREST },
        1,
      );

      // #5 — interval 2 genuinely starts: elapsed resets to 0, distance to
      // 0.8. 0x0033's Interval Count still reads 1 here (the same
      // unrecorded half noted above) so `toProgramIndex(1, "rowing", 2)`
      // resolves program index 1 again. HEAD: key 1 already exists
      // (poisoned by #2), so this is a max no-op — 0 < 60.05 and
      // 0.8 < 173.3 change nothing. FIXED: key 1 does not exist yet (the
      // guard redirected #2 into key 0), and 0 IS strictly less than key
      // 0's own elapsed register (90) — a genuine reset — so the guard
      // OPENS key 1 here instead, honestly.
      await tick(
        h,
        { elapsed: 0, distance: 0.8, state: WORKOUTSTATE_INTERVALWORKTIME },
        1,
      );

      // #6 — 23s into interval 2, matching the photographed moment.
      const f = await tick(
        h,
        { elapsed: 23, distance: 19, state: WORKOUTSTATE_INTERVALWORKTIME },
        1,
      );

      // Post-fix: key0 = (90, 179.7), key1 = (23, 19).
      // 179.7 = 353 - 173.3 (HEAD's own key-0 register, derived rather than
      // independently re-measured) and is bounded by the max-merge order
      // constraint key0 >= key1 the ledger entry works through; 198.7 is
      // 179.7 + 19, the honest sum this fix restores.
      expect(f.sessionDistanceMeters).toBeCloseTo(198.7, 1); // was 353.0
      expect(f.sessionElapsedSeconds).toBeCloseTo(113, 1); // was 150.05
    },
  );

  it(
    "interval-referent-monotone fix round 1, finding A: the SAME state-8 " +
      "poison tick that the guard correctly refuses to OPEN a register key " +
      "with must not leave the EMITTED referent at the too-high value it " +
      "never legitimately opened either — no committed capture exercises " +
      "this path (walk-2026-08-15 session B predates the recording format " +
      "`registerReplay.test.ts` replays), so this reproduces the same " +
      "shape the sibling test above uses, synthetically, and checks " +
      "`frame.intervalIndex` instead of the session totals",
    async () => {
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      // #1 — key0 opens normally, rowing, program index 0.
      const f1 = await tick(
        h,
        {
          elapsed: 52.14,
          distance: 173.3,
          state: WORKOUTSTATE_INTERVALWORKTIME,
        },
        0,
      );
      expect(f1.intervalIndex).toBe(0);

      // #2 — THE POISON TICK (identical to the sibling test above): state 8
      // still maps to "rowing", but 0x0033's Interval Count has already
      // incremented to 1, so `toProgramIndex(1, "rowing", 2)` resolves
      // program index 1 — a key `session.seen` does not hold yet. The
      // open-on-reset guard correctly refuses to OPEN it (elapsed 60.05 is
      // not before key 0's own register, 52.14) and folds `activeKey` back
      // to 0 for the SESSION TOTALS. Before fix round 1, `emittedIntervalIndex`
      // was untouched by that fold and stayed at the too-high 1 — the bug
      // this test pins.
      const f2 = await tick(
        h,
        {
          elapsed: 60.05,
          distance: 173.3,
          state: WORKOUTSTATE_INTERVALWORKTIMETOREST,
        },
        1,
      );
      expect(f2.intervalIndex).toBe(0); // RED before the fix: was 1.

      // #3 — the genuine rest tick. `toProgramIndex(1, "resting", 2)` folds
      // back to program index 0 (the resting -1 offset) regardless of the
      // guard, so this frame was ALWAYS correct — the defect is entirely in
      // #2's own emitted value being wrong, which makes #2 -> #3 a backward
      // step (1 -> 0) before the fix and a flat one (0 -> 0) after.
      const f3 = await tick(
        h,
        { elapsed: 61.48, distance: 175, state: WORKOUTSTATE_INTERVALREST },
        1,
      );
      expect(f3.intervalIndex).toBe(0);
      // The property finding A names directly: the referent sequence across
      // these three frames must never decrease.
      expect(f2.intervalIndex! >= f1.intervalIndex!).toBe(true);
      expect(f3.intervalIndex! >= f2.intervalIndex!).toBe(true);
    },
  );

  it(
    "logs a divergence naming the refused key and the register it merged " +
      "into, on the poison tick itself",
    async () => {
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      await tick(
        h,
        {
          elapsed: 52.14,
          distance: 173.3,
          state: WORKOUTSTATE_INTERVALWORKTIME,
        },
        0,
      );
      await tick(
        h,
        {
          elapsed: 60.05,
          distance: 173.3,
          state: WORKOUTSTATE_INTERVALWORKTIMETOREST,
        },
        1,
      );

      const div = h.log
        .entries()
        .filter((e) => e.kind === "divergence" && e.detail.includes("refused"));
      expect(div).toHaveLength(1);
      // Names the refused key, the reading (elapsed + distance), and the
      // register it merged into.
      expect(div[0]!.detail).toContain("key 1");
      expect(div[0]!.detail).toContain("60.05");
      expect(div[0]!.detail).toContain("173.3");
      expect(div[0]!.detail).toContain("key 0");
    },
  );

  it(
    "the guard's own boundary is strict: elapsed EXACTLY equal to the " +
      "open key's register does not prove a reset, and is refused " +
      "(mutation pin — a non-strict `<=` would let this tick open the " +
      "next key instead, and no other test in this file distinguishes " +
      "strict-`<` from `<=`)",
    async () => {
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      await tick(
        h,
        { elapsed: 30, distance: 75, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      // Elapsed exactly 30 — equal to, not less than, key 0's own register.
      // Monotonicity only guarantees a poison tick has elapsed >= the
      // register; equality is squarely inside that "cannot prove a reset"
      // zone, so the guard must refuse here too.
      const f = await tick(
        h,
        { elapsed: 30, distance: 76, state: WORKOUTSTATE_INTERVALREST },
        2,
      );

      // Refused: folds into key 0, does not open key 1.
      expect(f.sessionDistanceMeters).toBeCloseTo(76, 1);
      const div = h.log
        .entries()
        .filter((e) => e.kind === "divergence" && e.detail.includes("refused"));
      expect(div).toHaveLength(1);
    },
  );

  it(
    "the refusal divergence is a FIRST-SIGHTING gate per refused key, not " +
      "unthrottled (fix round review IMPORTANT-3): the disclosed-edge " +
      "shape refuses on EVERY tick of the affected interval (~2/s), which " +
      "would otherwise evict the 500-entry ring's programming trace and " +
      "walk evidence — only the first refusal of a given key logs",
    async () => {
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      await tick(
        h,
        { elapsed: 30, distance: 75, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );

      // Six consecutive ticks that all resolve to program index 1 (a NEW
      // key relative to `session.seen`, which only ever holds key 0 here)
      // and all refuse: key 0 keeps absorbing each reading by max-merge,
      // growing to match it exactly, so the NEXT tick's own (still
      // climbing) elapsed is never less than key 0's own just-updated
      // register — the self-sustaining shape the review named. Every one
      // of these six is individually a genuine refusal (traced by hand,
      // not merely repeated inputs): 59 refused against key 0's 30, then
      // 65 against 59, 70 against 65, 75 against 70, 80 against 75, 85
      // against 80 — six distinct comparisons, six distinct refusals.
      const readings = [
        { elapsed: 59, distance: 130 },
        { elapsed: 65, distance: 140 },
        { elapsed: 70, distance: 150 },
        { elapsed: 75, distance: 160 },
        { elapsed: 80, distance: 170 },
        { elapsed: 85, distance: 180 },
      ];
      for (const r of readings) {
        await tick(
          h,
          {
            elapsed: r.elapsed,
            distance: r.distance,
            state: WORKOUTSTATE_INTERVALREST,
          },
          2,
        );
      }

      // Exactly ONE "refused open" entry for key 1 despite six refusing
      // ticks — the first sighting, then silence for the rest of this run.
      const refused = h.log
        .entries()
        .filter((e) => e.kind === "divergence" && e.detail.includes("refused"));
      expect(refused).toHaveLength(1);
      expect(refused[0]!.detail).toContain("key 1");
      // The FIRST refused tick's own reading (59/130), not a later one —
      // first sighting means the earliest occurrence is what's on record.
      expect(refused[0]!.detail).toContain("59");
      expect(refused[0]!.detail).toContain("130");

      // The total still reflects every refused reading (max-merge keeps
      // growing key 0 on every tick; only the LOG is throttled, never the
      // write).
      const f = await tick(
        h,
        { elapsed: 85, distance: 180, state: WORKOUTSTATE_INTERVALREST },
        2,
      );
      expect(f.sessionDistanceMeters).toBeCloseTo(180, 1);
    },
  );

  it(
    "a re-armed run's own first refusal logs again — the first-sighting " +
      "gate is per-RUN state, not permanent process state",
    async () => {
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      await tick(
        h,
        { elapsed: 30, distance: 75, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      await tick(
        h,
        { elapsed: 59, distance: 130, state: WORKOUTSTATE_INTERVALREST },
        2,
      );
      const firstRunRefusals = h.log
        .entries()
        .filter((e) => e.kind === "divergence" && e.detail.includes("refused"));
      expect(firstRunRefusals).toHaveLength(1);

      // Close the run before re-arming (`reprogram`'s own doc comment cites
      // this file's other re-arm test doing the same) — a terminate first,
      // matching the one other re-arm test in this file.
      await tick(h, {
        elapsed: 60,
        distance: 130,
        state: WORKOUTSTATE_TERMINATE,
      });
      await reprogram(h, TWO_INTERVAL_REST_PROGRAM);

      await tick(
        h,
        { elapsed: 20, distance: 50, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );
      // Same shape, same key (1), in the NEW run — if the gate were global
      // (not reset alongside `session` on re-arm) this would stay silent.
      await tick(
        h,
        { elapsed: 40, distance: 90, state: WORKOUTSTATE_INTERVALREST },
        2,
      );

      const allRefusals = h.log
        .entries()
        .filter((e) => e.kind === "divergence" && e.detail.includes("refused"));
      expect(allRefusals).toHaveLength(2);
    },
  );
});

// ---------------------------------------------------------------------------
// series-truth design spec §A/§B′ (task-2-brief.md Step 1(a)) — state 9's
// own sibling fix. `docs/monitor/sessions/walk-2026-08-24/phone-exit7-ring.
// json` seq 27/28 (a 2x250m r60 row, all distance-kind intervals) hit the
// SAME poison shape Task 11 above pins for state 8
// (`WORKOUTSTATE_INTERVALWORKTIMETOREST`), but through
// `WORKOUTSTATE_INTERVALWORKDISTANCETOREST` (9) — the guard's own comment
// (`driver.ts`'s `maybeEmitFrame`) named this as "the symmetric, plausible
// sibling case ... the same one-line extension if a future walk shows it";
// this walk is that capture. Ring seq 27 is interval 1's own honest final
// tick (elapsed=67.91s, distance=250.2m, machineTotal=250m, machine count
// still 0); ring seq 28 is the poison tick itself (elapsed=68.02s,
// distance=250.6m) with the ring's own "divergence" entry recording the
// driver refusing to open key 1 with it and merging into key 0 instead —
// the machine count at that tick (1) is the "one unrecorded half" the
// sibling Task-11 test above also has to infer (SECONDARY: no capture shows
// 0x0033's own byte at that exact instant, only the resulting refusal).
// ---------------------------------------------------------------------------

describe(
  "session accumulator: state 9's own poison tick (series-truth spec §A, " +
    "walk-2026-08-24 exit-7)",
  () => {
    it(
      "a state-9 poison tick (distance-kind interval boundary) is mirrored " +
        "exactly like state 8: the emitted intervalIndex AND the new " +
        "attributedIntervalIndex field both stay at the register key the " +
        "guard actually used (0), not the too-high key it refused to open " +
        "(1) — ring seq 27/28's own numbers",
      async () => {
        const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

        // Ring seq 27 — interval 1's own honest final tick before the
        // boundary. series-truth review rider (task-3-brief.md): ring seq
        // 27's own decoded byte is ALREADY `workoutState=9`
        // (`WORKOUTSTATE_INTERVALWORKDISTANCETOREST` — the machine reports
        // the ephemeral transition at this exact tick, not a plain state-5
        // rowing reading), corrected here from the prior state-5 fixture
        // (which overclaimed "ring seq 27's own numbers" while using a
        // byte the ring never shows at that seq). Functionally identical
        // either way: `session.seen` is still empty at this, the first-
        // ever write (`programmed()`'s own doc comment), so the
        // refused-open guard's state-8/9 mirror — the only place this
        // byte matters — never runs regardless of which state f1 carries;
        // this fixes the fixture's fidelity to the ring, not its
        // assertions.
        const f1 = await tick(
          h,
          {
            elapsed: 67.91,
            distance: 250.2,
            state: WORKOUTSTATE_INTERVALWORKDISTANCETOREST,
          },
          0,
        );
        expect(f1.intervalIndex).toBe(0);
        expect(f1.attributedIntervalIndex).toBe(0);

        // Ring seq 28 — THE POISON TICK: elapsed=68.02s, distance=250.6m,
        // machine count already 1. `toProgramIndex(1, "rowing", 2)`
        // resolves program index 1, a key `session.seen` does not hold yet
        // — the open-on-reset guard correctly refuses to OPEN it (elapsed
        // 68.02 is not before key 0's own register, 67.91) and folds
        // `activeKey` back to 0 for the session totals, exactly as ring seq
        // 28's own "divergence" entry records in production. Before this
        // fix, the mirror gate named only
        // `WORKOUTSTATE_INTERVALWORKTIMETOREST` (8) — state 9 fell through
        // untouched, leaving `intervalIndex` at the too-high 1, and
        // `attributedIntervalIndex` did not exist at all. Both are the bugs
        // this test pins.
        const f2 = await tick(
          h,
          {
            elapsed: 68.02,
            distance: 250.6,
            state: WORKOUTSTATE_INTERVALWORKDISTANCETOREST,
          },
          1,
        );
        expect(f2.intervalIndex).toBe(0); // RED before fix A: was 1.
        expect(f2.attributedIntervalIndex).toBe(0); // RED before fix A+B′: was undefined.

        // The register the guard actually wrote to (key 0, max-merged) is
        // exactly what `attributedIntervalIndex` must equal — the identity
        // fix B′ exists for. `session` is a driver-internal closure
        // variable with no public accessor, so this is asserted via the
        // session totals `tick()` already returns: key 0's register grew
        // to the poison tick's own (larger) pair by max-merge, so
        // `sessionDistanceMeters`/`sessionElapsedSeconds` read the poison
        // tick's own numbers directly.
        expect(f2.sessionDistanceMeters).toBeCloseTo(250.6, 1);
        expect(f2.sessionElapsedSeconds).toBeCloseTo(68.02, 1);
      },
    );
  },
);

// ---------------------------------------------------------------------------
// series-truth design spec §E / exit criterion 1 (task-3-brief.md Step 1a,
// controller pre-flight ruling) — the exit-7 oracle. Synthesized FROM the
// ring (`docs/monitor/sessions/walk-2026-08-24/phone-exit7-ring.json`, no
// replayable BLE capture of this defect exists — production build, no
// instrument), replayed through the REAL driver -> REAL
// `createSeriesRecorder`, asserting ONLY ring-sourced facts (spec §E: the
// pace assertion the earlier draft carried was killed by the antagonist
// pass — `currentSplit` is invented by this fixture, so asserting it would
// test the fixture, not the fix).
//
// Checkpoints taken verbatim off the ring:
//   seq 27  elapsed=67.91 distance=250.2 state=9 count=0 (honest final
//           interval-1 tick, ALREADY state 9 — the machine reports the
//           ephemeral work->rest state before its own count increments)
//   seq 28  elapsed=68.02 distance=250.6 state=9 count=1 (THE POISON TICK
//           — count has now incremented; the open-on-reset guard refuses
//           to open key 1 and folds into key 0 instead, ring's own
//           "divergence" entry)
//   seq 49  final-totals: registers 0:(129.5s,397.2m) 1:(101s,345.5m),
//           accumulator=742.7m accumulatorElapsed=230.5s
//   seq 48  frame state=finished elapsed=100.97 distance=345.5 (the
//           source of key 1's own final register reading, 101s rounded)
// Everything between those checkpoints is a 1 Hz synthetic fill (no ring
// entry exists for every second — the ring is a throttled diagnostic
// buffer, not a full capture), linearly interpolated between the named
// checkpoints and carrying the correct wire STATE for its phase (§18's own
// toProgramIndex table: work states 4/5/8/9 pass the raw count through
// unchanged; resting subtracts one) — chosen so the driver's own key
// resolution reaches the exact same two final registers the ring shows,
// not merely a plausible-looking approximation.
// ---------------------------------------------------------------------------

describe("createSeriesRecorder — series-truth Task 3: the exit-7 oracle, real driver -> real recorder (spec §E, exit criterion 1)", () => {
  it(
    "a synthetic replay of the ring's own checkpoints (interval 1 to " +
      "67.91s/250.2m, the state-9 poison tick at 68.02s/250.6m, an " +
      "advancing rest to 129.5s/397.2m, interval 2 reset to 0 then " +
      "56.2s/250.3m, a trailing rest to a finished tick at " +
      "100.97s/345.5m) reaches ~230 samples, t~230.5s, final d within 1m " +
      "of 742.7, TWO rest runs, zero backward buckets, and interval 2's " +
      "own samples present",
    async () => {
      const h = await programmed(EXIT7_PROGRAM);
      const rec = createSeriesRecorder();
      const round1 = (n: number): number => Math.round(n * 10) / 10;

      // --- interval 1 work: count 0, state 5 (INTERVALWORKDISTANCE) ---
      for (let t = 0; t <= 67; t++) {
        const f = await tick(
          h,
          {
            elapsed: t,
            distance: round1((t / 67.91) * 250.2),
            state: WORKOUTSTATE_INTERVALWORKDISTANCE,
            workoutDurationType: 128,
          },
          t === 0 ? 0 : undefined,
        );
        rec.onFrame(f);
      }
      // seq 27 — honest final tick, ALREADY state 9, count still 0.
      rec.onFrame(
        await tick(h, {
          elapsed: 67.91,
          distance: 250.2,
          state: WORKOUTSTATE_INTERVALWORKDISTANCETOREST,
          workoutDurationType: 128,
        }),
      );
      // seq 28 — THE POISON TICK: count increments to 1, the guard
      // refuses to open key 1 (elapsed 68.02 is not before key 0's own
      // register, 67.91) and folds into key 0 instead — exactly the
      // ring's own "divergence" entry.
      rec.onFrame(
        await tick(
          h,
          {
            elapsed: 68.02,
            distance: 250.6,
            state: WORKOUTSTATE_INTERVALWORKDISTANCETOREST,
            workoutDurationType: 128,
          },
          1,
        ),
      );

      // --- rest after interval 1: count 1, state 3 (INTERVALREST) — the
      // resting-minus-one rule keys this straight back to interval 0
      // (`toProgramIndex(1, "resting", 2) === 0`), so key 0 keeps
      // growing until the genuine reset below. ---
      for (let t = 69; t <= 129; t++) {
        const f = await tick(
          h,
          {
            elapsed: t,
            distance: round1(
              250.6 + ((t - 68.02) / (129.5 - 68.02)) * (397.2 - 250.6),
            ),
            state: WORKOUTSTATE_INTERVALREST,
            workoutDurationType: 128,
          },
          t === 69 ? 1 : undefined,
        );
        rec.onFrame(f);
      }
      rec.onFrame(
        await tick(h, {
          elapsed: 129.5,
          distance: 397.2,
          state: WORKOUTSTATE_INTERVALREST,
          workoutDurationType: 128,
        }),
      );

      // --- interval 2 work: elapsed genuinely resets to 0 (the register
      // 129.5/397.2 is strictly less than 0? no — the OPEN guard's own
      // rule is `elapsed < openRegister.elapsed`, and 0 < 129.5, so key 1
      // genuinely opens here). count stays 1 (`toProgramIndex(1,
      // "rowing", 2) === 1`, already the newly-opened key). ---
      for (let t = 0; t <= 56; t++) {
        const f = await tick(
          h,
          {
            elapsed: t,
            distance: round1((t / 56.2) * 250.3),
            state: WORKOUTSTATE_INTERVALWORKDISTANCE,
            workoutDurationType: 128,
          },
          t === 0 ? 1 : undefined,
        );
        rec.onFrame(f);
      }
      // interval 2's own boundary — state 9 again, but count is STILL 1
      // here (no second poison: `toProgramIndex(1, "rowing", 2) === 1`,
      // already in `session.seen`, so the open-on-reset guard never
      // fires — matching the ring's own single "divergence" entry, not
      // two).
      rec.onFrame(
        await tick(h, {
          elapsed: 56.2,
          distance: 250.3,
          state: WORKOUTSTATE_INTERVALWORKDISTANCETOREST,
          workoutDurationType: 128,
        }),
      );

      // --- rest after interval 2: count 2, state 3 — resting-minus-one
      // keys this to interval 1 (`toProgramIndex(2, "resting", 2) === 1`).
      // seq 43's own frame (elapsed=56.44 distance=251.2) is the first
      // resting tick. ---
      rec.onFrame(
        await tick(
          h,
          {
            elapsed: 56.44,
            distance: 251.2,
            state: WORKOUTSTATE_INTERVALREST,
            workoutDurationType: 128,
          },
          2,
        ),
      );
      for (let t = 57; t <= 100; t++) {
        const f = await tick(h, {
          elapsed: t,
          distance: round1(
            251.2 + ((t - 56.44) / (100.97 - 56.44)) * (345.5 - 251.2),
          ),
          state: WORKOUTSTATE_INTERVALREST,
          workoutDurationType: 128,
        });
        rec.onFrame(f);
      }
      // seq 48 — the machine finishes mid-rest. `activeKey`'s own
      // "finished" fallback arm (`driver.ts`, Math.max(session.seen.keys()))
      // keeps this reading folding into key 1, exactly matching the
      // ring's own final register (101s rounded from 100.97, 345.5m).
      rec.onFrame(
        await tick(h, {
          elapsed: 100.97,
          distance: 345.5,
          state: WORKOUTSTATE_WORKOUTEND,
          workoutDurationType: 128,
        }),
      );

      const series = rec.snapshot()!;

      // ~230 samples (ring: 230.5s of work-clock, ~1 sample/work-second).
      expect(series.samples.length).toBeGreaterThan(220);
      expect(series.samples.length).toBeLessThan(235);

      // t reaching ~230.5s (129.5 + 100.97 = 230.47s of work clock).
      const lastSample = series.samples[series.samples.length - 1]!;
      expect(lastSample.t / 10).toBeGreaterThan(229);
      expect(lastSample.t / 10).toBeLessThan(231);

      // final d within 1m of 742.7 (397.2 + 345.5, the ring's own
      // "final-totals" line).
      expect(Math.abs(lastSample.d / 10 - 742.7)).toBeLessThan(1);

      // interval 2's own samples exist — the structural fact the killed
      // pace assertion proxied for (spec §E). Interval 2's work-clock
      // base is 129.5s, running to 129.5+56.2=185.7s.
      const interval2Samples = series.samples.filter(
        (s) => s.t / 10 >= 130 && s.t / 10 <= 186,
      );
      expect(interval2Samples.length).toBeGreaterThan(50);

      // TWO rest runs (spec §3: rests are DRAWN but MARKED) — count
      // maximal consecutive runs of `r === true`, never one merged run.
      let restRuns = 0;
      let inRun = false;
      for (const s of series.samples) {
        if (s.r === true) {
          if (!inRun) restRuns++;
          inRun = true;
        } else {
          inRun = false;
        }
      }
      expect(restRuns).toBe(2);

      // Zero backward buckets — this exact scenario never regresses the
      // work clock once the driver's own attribution is trusted (exit
      // criterion 3's "healthy exit-7 counterfactual").
      expect(rec.backwardBucketCount()).toBe(0);
    },
  );
});

// ---------------------------------------------------------------------------
// series-truth design spec §B′ (fix round 2, controller review Important
// 1) — the recorder's disclosed bounded edge, PINNED, not merely asserted
// unreachable. `driver.ts`'s own refused-open guard mirrors `intervalIndex`
// back onto the open key ONLY for states 8/9 (the ephemeral work->rest
// transition); outside those two states the mirror is deliberately UNGATED
// (`driver.ts`'s own comment: unconditional mirroring there "corrupted an
// otherwise-correct countdown/target with no wire fact supporting it"),
// so a genuinely NEW interval whose FIRST OBSERVED tick already collides
// with a stale, gap-truncated register — exactly the shape
// `driver.test.ts`'s "a reconnect timeline SPANNING a boundary" regression
// exercises — leaves `intervalIndex` rising (the TRUE interval identity)
// while `attributedIntervalIndex` stays folded on the still-open key (the
// session accumulator's own accepted compromise). `seriesRecorder`, keying
// on attribution alone, inherits exactly that compromise: the series
// max-merges the new interval's own readings into the PRIOR key, short by
// the whole gap — the SAME undercount the session accumulator itself
// reports, "visible against the machine's own totals" (spec §B′). This is
// the "one-deriver trade James accepted (consistent-with-the-accumulator
// over independently-diverging)" the spec names — pinned here, never
// described as unreachable.
// ---------------------------------------------------------------------------

describe("createSeriesRecorder — series-truth Task 3 fix round 2: the recorder's disclosed bounded edge, pinned as the accepted one-deriver cost (spec §B′)", () => {
  it("a reconnect-spanning-shaped tick (post-gap first observation landing at elapsed == the open key's own register, state 4 — outside the 8/9 mirror) makes intervalIndex and attributedIntervalIndex DISAGREE through the real driver, and the recorder's series max-merges the new interval into the prior key, short by the gap, matching the accumulator exactly", async () => {
    const h = await programmed(TWO_INTERVAL_NO_REST_PROGRAM);

    // Interval 1's own final observed reading — key 0's register.
    const f1 = await tick(
      h,
      { elapsed: 60, distance: 300, state: WORKOUTSTATE_INTERVALWORKTIME },
      0,
    );
    expect(f1.intervalIndex).toBe(0);
    expect(f1.attributedIntervalIndex).toBe(0);

    // THE RECONNECT-SPANNING TICK: interval 2's own first observed
    // reading already reads elapsed=60 — EQUAL to key 0's own register
    // (not less), the guard's own strict-`<` boundary — and count has
    // already advanced to 1 (the machine's own genuinely correct new
    // index; no poison, no wire lie). `toProgramIndex(1, "rowing", 2)`
    // resolves 1 (identity — state 4 is a plain rowing tick, not the
    // ephemeral 8/9 transition), a key `session.seen` does not hold —
    // the guard refuses to open it (elapsed 60 is not STRICTLY before
    // key 0's own register, 60) and folds into key 0 instead. Because
    // this refusal is on the disclosed bounded edge (state 4, not 8/9),
    // the mirror does NOT fire: `intervalIndex` keeps its own,
    // un-mirrored, TRUE value (1) while `attributedIntervalIndex`
    // stays on the folded key (0) — the disagreement.
    const f2 = await tick(
      h,
      { elapsed: 60, distance: 310, state: WORKOUTSTATE_INTERVALWORKTIME },
      1,
    );
    expect(f2.intervalIndex).toBe(1); // rises — the TRUE interval identity
    expect(f2.attributedIntervalIndex).toBe(0); // stays — the accumulator's own compromise

    // A further interval-2 tick, still folding (silently — the refusal
    // log is first-sighting-only, `driver.ts`'s own `refusedKeysLogged`).
    const f3 = await tick(h, {
      elapsed: 65,
      distance: 330,
      state: WORKOUTSTATE_INTERVALWORKTIME,
    });
    expect(f3.intervalIndex).toBe(1);
    expect(f3.attributedIntervalIndex).toBe(0);
    // The accumulator's OWN accepted undercount: 65, not the true
    // 60 (interval 1) + 65 (interval 2's own progress since ITS OWN
    // start) = 125 — short by exactly interval 1's own full duration,
    // the "short by the whole skipped interval" cost register maps
    // have always carried on this disclosed edge.
    expect(f3.sessionElapsedSeconds).toBeCloseTo(65, 1);
    expect(f3.sessionDistanceMeters).toBeCloseTo(330, 1);

    const rec = createSeriesRecorder();
    rec.onFrame(f1);
    rec.onFrame(f2);
    rec.onFrame(f3);
    const series = rec.snapshot()!;

    // The series matches the accumulator's own compromise EXACTLY — the
    // same undercount, never an independently-diverging one (spec §B′'s
    // own "consistent-with-the-accumulator over independently-
    // diverging" framing). Key never genuinely changes (attribution
    // stays 0 throughout), so this is the LAST bucket, at f3's own raw
    // elapsed/distance (base = 0, nothing below key 0).
    const last = series.samples[series.samples.length - 1]!;
    expect(last.t / 10).toBeCloseTo(f3.sessionElapsedSeconds!, 1);
    expect(last.d / 10).toBeCloseTo(f3.sessionDistanceMeters!, 1);
    expect(last.t / 10).toBeCloseTo(65, 1);
    expect(last.d / 10).toBeCloseTo(330, 1);

    // Short by the gap, spelled out: the true combined total (interval
    // 1's own 60s plus interval 2's own 65s-since-its-start) is 125;
    // the recorder (like the accumulator) reports 65 — a 60s shortfall,
    // exactly interval 1's own full duration, permanently lost to this
    // one run (never self-correcting — every later interval-2 tick
    // folds the same way, since key 1 never opens).
    const trueCombinedSeconds = f1.elapsedSeconds + f3.elapsedSeconds;
    expect(trueCombinedSeconds - last.t / 10).toBeCloseTo(f1.elapsedSeconds, 1);

    // Never a C′ alarm: the key never actually MOVES (attribution stays
    // 0 the whole run), so there is no backward bucket to observe —
    // this is a SILENT undercount, exactly the accepted cost's own
    // shape (a loud C′ entry would be the wrong signal here; nothing
    // was lost from an already-open span, the span itself just never
    // opened).
    expect(rec.backwardBucketCount()).toBe(0);
  });
});

describe("session accumulator: splitAvgPace provenance is LEVEL-triggered (interval-referent-monotone fix round 1, finding B)", () => {
  it(
    "a dropped 0x0033 notify leaves the stale verdict standing for AS MANY " +
      "frames as AS2 stays silent, not just the first one after the " +
      "referent advances — the gap an edge-triggered 'did the referent " +
      "just change' check (fix round 1's own committed history) would " +
      "have missed on the SECOND frame",
    async () => {
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      // #1 — interval 0's own genuine average (140s/500m), established
      // directly (not via tick()'s own zero-filled AS2 default) so this
      // test controls the exact value under test. No prior 0x0031 exists
      // yet, so this sample's own provenance resolves `null` ("no state to
      // judge it against yet") — irrelevant here since the frame it
      // precedes reads it as index 0 either way.
      h.transport.notify(
        ADDITIONAL_STATUS_2_UUID,
        buildAdditionalStatus2Bytes({
          elapsedSeconds: 50,
          intervalCount: 0,
          averagePowerWatts: 0,
          totalCalories: 0,
          splitAvgPace: 140,
          splitAvgPowerWatts: 0,
          splitAvgCalories: 0,
          lastSplitTimeSeconds: 0,
          lastSplitDistanceMeters: 0,
        }),
      );
      const f1 = await tick(h, {
        elapsed: 50,
        distance: 170,
        state: WORKOUTSTATE_INTERVALWORKTIME,
      });
      expect(f1.intervalIndex).toBe(0);
      expect(f1.splitAvgPace).toBe(140);

      // #2 — interval 0's rest begins. NO fresh 0x0033 accompanies it (the
      // machine has not yet forward-attributed its count to the rest) —
      // `toProgramIndex(0, "resting", 2)` clamps to 0 (its own boundary
      // rule), still matching interval 0, so 140 stays correctly shown.
      const f2 = await tick(h, {
        elapsed: 52,
        distance: 172,
        state: WORKOUTSTATE_INTERVALREST,
      });
      expect(f2.intervalIndex).toBe(0);
      expect(f2.splitAvgPace).toBe(140);

      // #3 — a fresh 0x0033 NOW arrives (count forward-attributed to 1,
      // the standing rest convention), captured while `raw.workoutState`
      // is ALREADY `"resting"` (set by #2, above) — its own provenance is
      // `toProgramIndex(1, "resting", 2) === 0`, still interval 0. Its
      // `splitAvgPace` is STILL 140: the machine's own average field has
      // not reset (matches the real capture, where this value legitimately
      // holds through a whole rest — `MonitorFrame.splitAvgPace`'s own doc
      // comment). Correctly not stale.
      h.transport.notify(
        ADDITIONAL_STATUS_2_UUID,
        buildAdditionalStatus2Bytes({
          elapsedSeconds: 55,
          intervalCount: 1,
          averagePowerWatts: 0,
          totalCalories: 0,
          splitAvgPace: 140,
          splitAvgPowerWatts: 0,
          splitAvgCalories: 0,
          lastSplitTimeSeconds: 0,
          lastSplitDistanceMeters: 0,
        }),
      );
      const f3 = await tick(h, {
        elapsed: 55,
        distance: 175,
        state: WORKOUTSTATE_INTERVALREST,
      });
      expect(f3.intervalIndex).toBe(0);
      expect(f3.splitAvgPace).toBe(140);

      // #4 — interval 1 GENUINELY begins (elapsed/distance reset). THE
      // DROPPED NOTIFY: no fresh 0x0033 accompanies this transition, or
      // the tick after it (#5, below) — the machine's own direct-rowing
      // sample for interval 1 (which would read count=1, splitAvgPace
      // reset toward 0) is delayed. The raw byte is still "1" from #3, but
      // NOW read with `"rowing"` state: `toProgramIndex(1, "rowing", 2)
      // === 1` directly — the referent genuinely, correctly advances with
      // no clamp even needed. `splitAvgPaceProvenanceIndex` is UNCHANGED
      // since #3 (0, stamped with `"resting"`), so `0 < 1` — correctly
      // flagged stale.
      const f4 = await tick(h, {
        elapsed: 0,
        distance: 0.5,
        state: WORKOUTSTATE_INTERVALWORKTIME,
      });
      expect(f4.intervalIndex).toBe(1);
      expect(f4.splitAvgPace).toBeNull();

      // #5 — a SECOND consecutive rowing tick of interval 1, STILL with no
      // fresh 0x0033. The referent (1) has not changed since #4, so an
      // edge-triggered "did the referent just advance past the PREVIOUS
      // FRAME's" check would see no change and let 140 back through here —
      // exactly the gap this fix round closed. The level-triggered check
      // re-derives the same verdict from `splitAvgPaceProvenanceIndex`
      // alone (still frozen at 0, still `< 1`), independent of frame
      // history, so this stays correctly null too.
      const f5 = await tick(h, {
        elapsed: 2,
        distance: 6,
        state: WORKOUTSTATE_INTERVALWORKTIME,
      });
      expect(f5.intervalIndex).toBe(1);
      expect(f5.splitAvgPace).toBeNull();
    },
  );
});

describe("session accumulator: final totals reach the ring (walk 2026-08-15, James's protocol change)", () => {
  // The walk established two facts that together orphaned the app's half of
  // the totals comparison: the PM5 has NO live session-cumulative view
  // during interval workouts (vendor docs — every Display view is
  // split-scoped), and the app auto-navigates to the log screen at the
  // finish, so the phone's TOTAL M is off-screen by the time the machine's
  // summary appears. The 0x0039 route (`summary-totals`) loses a race to
  // that same navigation. James's ruling: put the finals in the ring, which
  // survives navigation via the sessionStorage stash — so the re-walk needs
  // exactly one photograph (the PM5 summary screen) and zero phone timing.
  it("records final-totals at a natural finish, carrying the accumulator, the registers, and the machine's own total", async () => {
    const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

    await tick(
      h,
      {
        elapsed: 52,
        distance: 490.4,
        state: WORKOUTSTATE_INTERVALWORKTIME,
        twd: 490,
      },
      0,
    );
    await tick(
      h,
      {
        elapsed: 60,
        distance: 500.1,
        state: WORKOUTSTATE_INTERVALREST,
        twd: 500,
      },
      1,
    );
    await tick(
      h,
      {
        elapsed: 0.5,
        distance: 2.1,
        state: WORKOUTSTATE_INTERVALWORKTIME,
        twd: 502,
      },
      1,
    );
    await tick(
      h,
      {
        elapsed: 58,
        distance: 499.8,
        state: WORKOUTSTATE_INTERVALWORKTIME,
        twd: 999,
      },
      1,
    );
    await tick(h, {
      elapsed: 60,
      distance: 500.2,
      state: WORKOUTSTATE_WORKOUTEND,
      twd: 1000,
    });

    const finals = h.log.entries().filter((e) => e.kind === "final-totals");
    expect(finals).toHaveLength(1);
    // The consequence, not the existence: the numbers a re-walk reads.
    expect(finals[0]!.detail).toContain("accumulator=1000.3m");
    expect(finals[0]!.detail).toContain("accumulatorElapsed=120s");
    expect(finals[0]!.detail).toContain("machineTotal=1000m");
    expect(finals[0]!.detail).toContain("registers=2 of 2 programmed");
    expect(finals[0]!.detail).toContain("0:(60s,500.1m)");
    expect(finals[0]!.detail).toContain("1:(60s,500.2m)");
  });

  it("records final-totals on a terminate too, since an abandoned session's numbers are the ones nobody can re-read", async () => {
    const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

    await tick(
      h,
      {
        elapsed: 30,
        distance: 120.5,
        state: WORKOUTSTATE_INTERVALWORKTIME,
        twd: 120,
      },
      0,
    );
    // CSAFE-DEF footnote 12: elapsed re-bases backwards, distance stands.
    await tick(h, {
      elapsed: 21.5,
      distance: 120.5,
      state: WORKOUTSTATE_TERMINATE,
    });

    const finals = h.log.entries().filter((e) => e.kind === "final-totals");
    expect(finals).toHaveLength(1);
    expect(finals[0]!.detail).toContain("accumulator=120.5m");
    expect(finals[0]!.detail).toContain("registers=1 of 2 programmed");
  });
});

describe("session accumulator: the terminal frame's own raw bytes reach the ring (walk 2026-08-15, the mid-rest finished frame)", () => {
  // The re-walk's first session was killed 16s into interval 1's rest by a
  // frame our parser read as finished/elapsed=60/distance=0 — a
  // finished-family state mid-rest on a 2-interval program, in no prior
  // capture. The ring carried no raw bytes for it (frames log decoded
  // fields only; the raw-hex notify branch excludes 0x0031 as a flood), so
  // whether the machine sent ordinal 10, 12, or garbage is unknowable.
  // This entry records the raw 19-byte 0x0031 payload at TERMINAL
  // transitions only — bounded to one entry per session end — so the next
  // occurrence convicts the actual state byte.
  it("records terminal-raw with the exact payload that produced the terminal", async () => {
    const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

    await tick(
      h,
      {
        elapsed: 30,
        distance: 120.5,
        state: WORKOUTSTATE_INTERVALWORKTIME,
        twd: 120,
      },
      0,
    );
    const finishBytes = buildGeneralStatusBytes({
      elapsedSeconds: 60,
      distanceMeters: 0,
      workoutType: 8,
      intervalType: 255,
      workoutState: WORKOUTSTATE_WORKOUTEND,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 120,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
      dragFactor: 130,
    });
    // The stub's notify is synchronous — the terminal fires inside this call.
    h.transport.notify(GENERAL_STATUS_UUID, finishBytes);

    const raws = h.log.entries().filter((e) => e.kind === "terminal-raw");
    expect(raws).toHaveLength(1);
    const expectedHex = Array.from(finishBytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(" ");
    // The consequence: the ring holds the byte-exact payload, so a
    // mid-rest finished frame on hardware can be decoded after the fact.
    expect(raws[0]!.detail).toBe(`state=finished 0x0031=${expectedHex}`);
  });
});

// RC-9c (design spec 2026-08-25-free-oracles §2): this file used to carry a
// second pin here — "the TWD comparison runs at the terminal, not at 0x0039"
// (walk 2026-08-15 re-row, seq 36) — regression-guarding the timing fix for
// `recordTwdVerdict`. The verdict it timed is retired outright (the block
// above), so there is nothing left for a timing pin to guard.

// ---------------------------------------------------------------------------
// Task 8 — the suspicion verdict, log-only and fail-open
// (`docs/monitor/sessions/walk-2026-08-15/README.md` names the four
// committed rings; the fifth shape — mid-program `finished`, no summary,
// well short of the program — is the afternoon walk's session-killer
// signature, hand-built here since that ring itself was never committed).
// ---------------------------------------------------------------------------

describe("session accumulator: the suspicion verdict (Task 8, log-only, fail-open)", () => {
  it(
    "the killer-shaped fixture (mid-program finished, no summary, 0 of 2 " +
      "actuals) convicts itself with exactly ONE suspicious-terminal " +
      "entry, carrying terminal-raw's own bytes, and the run still closes " +
      "exactly as today",
    async () => {
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      // Some progress into interval 0 — never a completed boundary.
      await tick(h, {
        elapsed: 20,
        distance: 60,
        state: WORKOUTSTATE_INTERVALWORKTIME,
      });
      // The kill: a "finished" frame lands mid-program, no 0x0037/0x0038
      // ever arrived, no 0x0039 either.
      await tick(h, {
        elapsed: 20,
        distance: 60,
        state: WORKOUTSTATE_WORKOUTEND,
      });

      const suspicious = h.log
        .entries()
        .filter((e) => e.kind === "suspicious-terminal");
      expect(suspicious).toHaveLength(1);
      const raw = h.log.entries().filter((e) => e.kind === "terminal-raw");
      expect(raw).toHaveLength(1);
      // The consequence, not just the existence: the SAME bytes, verbatim.
      expect(suspicious[0]!.detail).toBe(raw[0]!.detail);

      // The close's own observable consequences are unchanged — the
      // verdict is log-only. Exactly one workoutComplete, no terminated,
      // and final-totals still reports the honest (short) count.
      expect(h.events.filter((e) => e.kind === "workoutComplete")).toHaveLength(
        1,
      );
      expect(h.events.filter((e) => e.kind === "terminated")).toHaveLength(0);
      // `final-totals` still fires exactly once, unaffected by the new
      // entry above it — its own count is `session.seen` (the frame
      // accumulator's registers), a DIFFERENT counter from the predicate's
      // `recordedActuals` (no boundary ever completed here, so
      // `recordedActuals` is 0; `session.seen` gained one register from
      // the mid-piece tick alone — see `session`'s own doc comment on why
      // the two counters diverge).
      const finals = h.log.entries().filter((e) => e.kind === "final-totals");
      expect(finals).toHaveLength(1);
      expect(finals[0]!.detail).toContain("registers=1 of 2 programmed");
    },
  );

  it("session-a's own shape (2 of 3 recorded — exactly N-1) is unsuspicious", async () => {
    const h = await programmed(THREE_INTERVAL_PROGRAM);

    await tick(h, {
      elapsed: 60,
      distance: 200,
      state: WORKOUTSTATE_INTERVALWORKTIME,
    });
    emitBoundary(h, 1, 60, 200); // -> program index 0
    await tick(h, {
      elapsed: 60,
      distance: 200,
      state: WORKOUTSTATE_INTERVALWORKTIME,
    });
    emitBoundary(h, 2, 60, 200); // -> program index 1
    // Interval 2 (the third) never gets its own boundary before the finish.
    await tick(h, {
      elapsed: 60,
      distance: 200,
      state: WORKOUTSTATE_WORKOUTEND,
    });

    expect(
      h.log.entries().filter((e) => e.kind === "suspicious-terminal"),
    ).toHaveLength(0);
  });

  it("session-b's own shape (1 of 2 recorded — exactly N-1) is unsuspicious", async () => {
    const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

    await tick(h, {
      elapsed: 60,
      distance: 200,
      state: WORKOUTSTATE_INTERVALWORKTIME,
    });
    emitBoundary(h, 1, 60, 200); // -> program index 0
    // Interval 1 never gets its own boundary before the finish.
    await tick(h, {
      elapsed: 60,
      distance: 200,
      state: WORKOUTSTATE_WORKOUTEND,
    });

    expect(
      h.log.entries().filter((e) => e.kind === "suspicious-terminal"),
    ).toHaveLength(0);
  });

  it(
    "session-c's own shape (0x0039 seen BEFORE the terminal frame, 0 of 2 " +
      "recorded — the exact killer-fixture actuals shape) is unsuspicious " +
      "ONLY because of the flag: this is why summarySeen cannot be " +
      "`run.summaryInGrace`",
    async () => {
      const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

      await tick(h, {
        elapsed: 20,
        distance: 60,
        state: WORKOUTSTATE_INTERVALWORKTIME,
      });
      // The 0x0039 arrives while the run is still OPEN — before any grace
      // has ever opened, so `noteSummary`'s own `!graceIsOpen` branch fires
      // and discards it (`summary-reconciled` "out-of-window"). Nothing is
      // stored in `summaryInGrace`; only the unconditional `summarySeen`
      // flag survives this.
      h.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));
      const outOfWindow = h.log
        .entries()
        .filter(
          (e) =>
            e.kind === "summary-reconciled" &&
            e.detail.includes("out-of-window"),
        );
      expect(outOfWindow).toHaveLength(1);

      // Same actuals shape as the killer fixture (0 of 2) — and NO
      // boundary ever arrives either.
      await tick(h, {
        elapsed: 20,
        distance: 60,
        state: WORKOUTSTATE_WORKOUTEND,
      });

      expect(
        h.log.entries().filter((e) => e.kind === "suspicious-terminal"),
      ).toHaveLength(0);
    },
  );

  it("session-d's own shape (2 of 2 recorded — full count) is unsuspicious", async () => {
    const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

    await tick(h, {
      elapsed: 60,
      distance: 200,
      state: WORKOUTSTATE_INTERVALWORKTIME,
    });
    emitBoundary(h, 1, 60, 200); // -> program index 0
    await tick(h, {
      elapsed: 60,
      distance: 200,
      state: WORKOUTSTATE_INTERVALWORKTIME,
    });
    emitBoundary(h, 2, 60, 200); // -> program index 1
    await tick(h, {
      elapsed: 60,
      distance: 200,
      state: WORKOUTSTATE_WORKOUTEND,
    });

    expect(
      h.log.entries().filter((e) => e.kind === "suspicious-terminal"),
    ).toHaveLength(0);
  });

  it("`terminated` is NEVER suspicious, even with 0 actuals recorded and no summary", async () => {
    const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

    await tick(h, {
      elapsed: 10,
      distance: 20,
      state: WORKOUTSTATE_INTERVALWORKTIME,
    });
    // CSAFE-DEF footnote 12: elapsed re-bases backwards, distance stands.
    await tick(h, {
      elapsed: 5,
      distance: 20,
      state: WORKOUTSTATE_TERMINATE,
    });

    expect(h.events.filter((e) => e.kind === "terminated")).toHaveLength(1);
    expect(
      h.log.entries().filter((e) => e.kind === "suspicious-terminal"),
    ).toHaveLength(0);
  });
});

describe("session accumulator: the stale-count rest clamp's resting conjunct (rest-keying spec, 2026-08-16)", () => {
  // The spec's own directed-fixture bullet ("The directed fixture (the
  // conjunct no capture can test)"): dropping the clamp's
  // `base.state === "resting"` conjunct is SILENT on BOTH committed walk
  // recordings (identical registers, totals, and logs — antagonist F2
  // finding). No replay can ever catch that specific deletion; this shape
  // is the only test in the suite that can, and must be built by hand.
  it("a stale rowing frame never lifts to the newest key", async () => {
    const h = await programmed(TWO_INTERVAL_REST_PROGRAM);

    // Establish key 0's register via an ordinary rowing tick.
    await tick(
      h,
      { elapsed: 200, distance: 500, state: WORKOUTSTATE_INTERVALWORKTIME },
      0,
    );
    // Establish key 1's register the same way — rowing passes through
    // `toProgramIndex` UNADJUSTED (identity), so intervalCount 1 keys
    // program index 1 directly, no rest boundary needed to open it.
    await tick(
      h,
      { elapsed: 60, distance: 150, state: WORKOUTSTATE_INTERVALWORKTIME },
      1,
    );

    // THE STALE FRAME: still `"rowing"`, still keyed to program index 0
    // (0x0033's count has not yet advanced past the just-finished
    // interval), carrying a reading smaller than key 0's own register.
    // `session.seen.size > 0` and `activeKey (0) < max(seen) (1)` are both
    // true here — exactly the shape the clamp's first two conjuncts alone
    // would fire on. Only the (correctly absent) `state === "resting"`
    // conjunct keeps this frame out of the clamp: a stale ROWING frame
    // keys its own just-finished interval, where the pair is a max-merge
    // no-op, not an inflation.
    const f = await tick(
      h,
      { elapsed: 100, distance: 300, state: WORKOUTSTATE_INTERVALWORKTIME },
      0,
    );

    // Correct behaviour: the stale reading merges into key 0 (a no-op,
    // 100 < 200 and 300 < 500) and key 1 is untouched. A clamp that
    // dropped the resting conjunct would instead lift this frame's
    // activeKey to 1 and inflate key 1's register to (100, 300) — silent
    // on both recordings, caught only here.
    expect(f.sessionDistanceMeters).toBeCloseTo(650, 1); // 500 + 150, unchanged

    await tick(h, {
      elapsed: 60,
      distance: 150,
      state: WORKOUTSTATE_WORKOUTEND,
      twd: 650,
    });
    const finals = h.log.entries().filter((e) => e.kind === "final-totals");
    expect(finals).toHaveLength(1);
    expect(finals[0]!.detail).toContain("registers=2 of 2 programmed");
    // Key 0 unchanged (max-merge no-op): still (200s, 500m).
    expect(finals[0]!.detail).toContain("0:(200s,500m)");
    // Key 1 unchanged: still (60s, 150m), NOT (100s, 300m) — the exact
    // inflation the dropped conjunct would produce.
    expect(finals[0]!.detail).toContain("1:(60s,150m)");
    expect(finals[0]!.detail).not.toContain("1:(100s,300m)");

    // No clamp fired at all: this frame never satisfied `state ===
    // "resting"`, so no divergence entry for the clamp exists.
    const clampLogs = h.log
      .entries()
      .filter(
        (e) =>
          e.kind === "divergence" &&
          e.detail.includes("stale-count rest clamp"),
      );
    expect(clampLogs).toHaveLength(0);
  });
});
