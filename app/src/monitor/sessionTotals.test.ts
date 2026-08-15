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
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_TERMINATE,
  WORKOUTSTATE_WAITTOBEGIN,
  WORKOUTSTATE_WORKOUTEND,
} from "../../domain/monitor/pm5/parse.js";
import {
  ADDITIONAL_STATUS_1_UUID,
  ADDITIONAL_STATUS_2_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
  GENERAL_STATUS_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  TRANSMIT_CHARACTERISTIC_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import {
  buildAdditionalStatus2Bytes,
  buildGeneralStatusBytes,
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
    steps: workout.steps,
  });
  const run = buildRun(
    draft,
    { k2Seconds: 100, k6Seconds: 120 },
    new Date("2026-01-01"),
    { kind: "time", minutes: 5 },
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

/** A single 500 m work interval — CR2 spec 1 Task 5's own distance-goal
 *  suppression fixture. Only `kind` differs from `MINIMAL_PROGRAM` above;
 *  it exists so the accumulator-vs-machine divergence's suppression rule
 *  (`logSummaryTotals`'s own doc comment: "the armed program contains ANY
 *  distance interval") can be exercised without needing `workoutDurationType
 *  === 128` on the wire, which this file's `tick()` helper cannot produce
 *  (hardcoded to `0`, time). The suppression is an OR of the two conditions,
 *  and this fixture tests the program-shape half on its own. */
const DISTANCE_PROGRAM: WorkoutProgram = {
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
 *  so a test can feed `128` (distance) and isolate `logSummaryTotals`'s
 *  `distanceGoal`'s WIRE arm (`raw.workoutDurationType === 128`) from its
 *  PROGRAM-SHAPE arm (`run?.program.intervals.some(kind === "distance")`)
 *  — the two are independently reachable halves of one OR, and only the
 *  program-shape half had a program fixture (`DISTANCE_PROGRAM`) able to
 *  drive it before this change. */
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
// R0's TWD comparison gets its verdict (CR2 spec 1, Task 5). `logSummaryTotals`
// states the raw numbers unconditionally (`summary-totals`, R0 — Task 1); this
// task adds the RULING on them: a `"divergence"` entry when the frame
// accumulator (`lastEmittedTotals.distanceMeters`) and the machine's own
// `totalWorkDistanceMeters` (0x0031) disagree by more than 5 m, suppressed on
// a distance goal (`workoutDurationType === 128` OR the armed program
// contains any `kind: "distance"` interval) — the brief's own reasoning for
// 5 m ABSOLUTE, not a percentage: a percentage would grow LESS sensitive as
// the session lengthens, and one lost 500 m interval in a 20x500 m session is
// exactly 5% of the total, precisely the failure mode this design introduces.
// ---------------------------------------------------------------------------

describe("session accumulator: accumulator-vs-machine divergence (CR2 spec 1 Task 5)", () => {
  it(
    "logs a divergence when the accumulator and the machine's own total " +
      "differ by more than 5 m (no distance goal)",
    async () => {
      const h = await programmed(MINIMAL_PROGRAM);

      // The accumulator banks 50 m (this tick's own distance); the machine's
      // own totalWorkDistanceMeters (`twd`) is fed a deliberately different
      // 100 m — a 50 m gap, comfortably past the 5 m tolerance.
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

      h.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));

      const div = h.log
        .entries()
        .filter(
          (e) =>
            e.kind === "divergence" &&
            e.detail.includes("accumulator and machine total differ"),
        );
      expect(div).toHaveLength(1);
      expect(div[0]!.detail).toContain("50.0m");
    },
  );

  it(
    "does NOT log the accumulator-vs-machine divergence when the armed " +
      "program contains a distance interval, however large the gap " +
      "(distance-goal suppression, program-shape half of the OR)",
    async () => {
      const h = await programmed(DISTANCE_PROGRAM);

      // Same 50 m accumulator, but the machine's own total is fed a huge
      // gap (950 m) — this would fire the divergence above the 5 m
      // tolerance many times over if the suppression were not applied.
      await tick(
        h,
        {
          elapsed: 30,
          distance: 50,
          twd: 1000,
          state: WORKOUTSTATE_INTERVALWORKTIME,
        },
        0,
      );

      h.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));

      const div = h.log
        .entries()
        .filter(
          (e) =>
            e.kind === "divergence" &&
            e.detail.includes("accumulator and machine total differ"),
        );
      expect(div).toHaveLength(0);
    },
  );

  it(
    "does NOT log the accumulator-vs-machine divergence when 0x0031's own " +
      "workoutDurationType reads 128 (distance goal), ISOLATED from the " +
      "program-shape arm — a time-kind program armed throughout, so only " +
      "the wire byte can be suppressing this (review IMPORTANT-1: the prior " +
      "suite had no test able to reach this arm on its own, since tick()'s " +
      "workoutDurationType was hardcoded to 0)",
    async () => {
      const h = await programmed(MINIMAL_PROGRAM); // kind: "time" throughout

      // Same shape as the "logs a divergence" test above (50 m accumulator,
      // 100 m machine total, a 50 m gap past the 5 m tolerance) — the ONLY
      // difference is `workoutDurationType: 128` on the wire. If this test
      // passes for any reason OTHER than the wire arm, MINIMAL_PROGRAM's own
      // kind ("time") rules out the program-shape arm as an explanation.
      await tick(
        h,
        {
          elapsed: 30,
          distance: 50,
          twd: 100,
          state: WORKOUTSTATE_INTERVALWORKTIME,
          workoutDurationType: 128,
        },
        0,
      );

      h.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));

      const div = h.log
        .entries()
        .filter(
          (e) =>
            e.kind === "divergence" &&
            e.detail.includes("accumulator and machine total differ"),
        );
      expect(div).toHaveLength(0);
    },
  );

  it(
    "does NOT log the accumulator-vs-machine divergence when the two agree " +
      "within the 5 m tolerance",
    async () => {
      const h = await programmed(MINIMAL_PROGRAM);

      // twd omitted -> defaults to the same 50 m the accumulator itself
      // banks (`tick()`'s own doc comment: "f.twd ?? f.distance").
      await tick(
        h,
        { elapsed: 30, distance: 50, state: WORKOUTSTATE_INTERVALWORKTIME },
        0,
      );

      h.transport.notify(END_OF_WORKOUT_SUMMARY_UUID, new Uint8Array(20));

      const div = h.log
        .entries()
        .filter(
          (e) =>
            e.kind === "divergence" &&
            e.detail.includes("accumulator and machine total differ"),
        );
      expect(div).toHaveLength(0);
    },
  );
});
