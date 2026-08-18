// Task 4 (2026-08-15-record-replay-stage-a, §A3): the integration shakeout
// for the whole record/replay harness. A fake-driven session is recorded
// through `createRecordingTransport`, serialized, parsed back, and REPLAYED
// through a SECOND, independently-constructed `createPm5Driver` — proving
// the tap records faithfully AND the replay scheduler drives the real
// driver through `program()` to a terminal state with zero divergences,
// producing an event stream identical to the one recorded.
//
// What this does NOT prove (spec §A3): hardware fidelity. `transports/
// fake.ts` has zero inter-characteristic skew (every status tick's three
// characteristics land in the same synchronous burst, a real radio never
// guarantees that), emits 0x0033-first (§18's own boundary-ordering
// finding is about 0x0037/0x0038, not the General/AdditionalStatus triple),
// and its `t` column is a purely virtual millisecond counter this file
// drives by hand — none of that stands in for a hardware walk. This test's
// only claim is that the record/replay MACHINERY is transparent: a driver
// wired to a real transport and a driver wired to a replay of that same
// transport's traffic see the same thing.

import { describe, expect, it } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { MonitorEvent } from "../../domain/monitor/types.js";
import {
  WORKOUTSTATE_INTERVALREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_WORKOUTEND,
} from "../../domain/monitor/pm5/parse.js";
import { createEventLog } from "./eventLog";
import { createPm5Driver } from "./driver";
import { createFakeTransport, type FakeTimelineEvent } from "./transports/fake";
import {
  buildRecordingFile,
  createRecordingTransport,
  parseRecording,
} from "./transports/recording";
import { createReplayTransport } from "./transports/replay";

const DEVICE = "PM5 432331249";

/** Two 60s work intervals, the first with a 30s trailing rest — copied from
 *  `sessionTotals.test.ts`'s own `TWO_INTERVAL_REST_PROGRAM` literal (task
 *  brief: copy the shape into this file rather than import a test file).
 *  This shape exercises both `toProgramIndex`/`toActualIndex` branches the
 *  driver has (a rest-keyed boundary for interval 0, a work->work-adjacent
 *  finish for interval 1) in one session — the round trip has something
 *  real to be faithful to. */
const ROUNDTRIP_PROGRAM: WorkoutProgram = {
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

/** work0 (elapsed 30/60) -> resting (interval0's 30s rest, boundary lands
 *  here per the fake's own ENFORCED rule: a trailing rest means the
 *  boundary MUST be delivered while the machine reads "resting") -> work1
 *  -> its boundary (restSeconds 0, no rest tick required) -> WORKOUTEND.
 *  Every boundary lands strictly BEFORE the terminal tick that closes the
 *  run, so this timeline never touches the finish-grace clock at all — that
 *  is deliberately this file's SECOND test's job, not this one's. */
const ROUNDTRIP_TIMELINE: FakeTimelineEvent[] = [
  {
    atMs: 100,
    kind: "status",
    workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    elapsedSeconds: 30,
    distanceMeters: 150,
    spm: 22,
    currentSplit: 120,
    heartRateBpm: 150,
    programIntervalIndex: 0,
  },
  {
    atMs: 200,
    kind: "status",
    workoutState: WORKOUTSTATE_INTERVALREST,
    elapsedSeconds: 75,
    distanceMeters: 280,
    spm: 0,
    currentSplit: 0,
    heartRateBpm: 140,
    programIntervalIndex: 0,
  },
  {
    atMs: 300,
    kind: "boundary",
    actual: {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 280,
      avgSpm: 22,
      avgHeartRateBpm: 150,
      restDistanceMeters: 0,
    },
    cumulativeElapsedSeconds: 90,
    cumulativeDistanceMeters: 280,
  },
  {
    atMs: 400,
    kind: "status",
    workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    elapsedSeconds: 120,
    distanceMeters: 420,
    spm: 23,
    currentSplit: 118,
    heartRateBpm: 155,
    programIntervalIndex: 1,
  },
  {
    atMs: 500,
    kind: "boundary",
    actual: {
      index: 1,
      elapsedSeconds: 60,
      distanceMeters: 280,
      avgSpm: 23,
      avgHeartRateBpm: 158,
      restDistanceMeters: 0,
    },
    cumulativeElapsedSeconds: 150,
    cumulativeDistanceMeters: 560,
  },
  {
    atMs: 600,
    kind: "status",
    workoutState: WORKOUTSTATE_WORKOUTEND,
    elapsedSeconds: 150,
    distanceMeters: 560,
    spm: 0,
    currentSplit: 0,
    heartRateBpm: null,
    programIntervalIndex: 1,
  },
];

/** A single 60s work interval — the second test's own fixture. Deliberately
 *  minimal: that test's whole point is the finish-grace CLOCK, not the
 *  interval-index normalization the first test already covers. */
const GRACE_PROGRAM: WorkoutProgram = {
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

/** Wraps a fresh `createFakeTransport` with a hand-driven virtual clock this
 *  file controls directly — `advance(ms)` bumps BOTH the fake's own
 *  `tick(ms)` (which delivers whatever scripted event is now due) and the
 *  counter the recording tap timestamps every event against, in lockstep,
 *  so a recorded event's `t` always means "this many `advance()`-ms after
 *  the tap was created", never wall-clock time (no wall clock exists
 *  anywhere in this file — `fake.ts`'s own header rule, honored here too). */
function clockedFake(script: Parameters<typeof createFakeTransport>[0]): {
  fake: ReturnType<typeof createFakeTransport>;
  advance: (ms: number) => void;
  now: () => number;
} {
  const fake = createFakeTransport(script);
  let virtualNow = 0;
  return {
    fake,
    advance: (ms: number): void => {
      virtualNow += ms;
      fake.tick(ms);
    },
    now: (): number => virtualNow,
  };
}

/** The repo's established programming pump (`driver.test.ts`'s own
 *  `programAndArm`): drain the ack-gated chunk exchange's microtask hops,
 *  then one `advance(0)` to flush the fake's WAITTOBEGIN bundle (fix-round
 *  1, F1 — it is no longer delivered synchronously inside the last
 *  programming ack), then await `program()` itself. */
async function programAndArm(
  driver: ReturnType<typeof createPm5Driver>,
  advance: (ms: number) => void,
  p: WorkoutProgram,
): Promise<void> {
  const pending = driver.program(p);
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
  advance(0);
  await pending;
}

describe("record -> replay round trip (A3): a recorded session replays into a second driver, event for event", () => {
  it("records a fake-driven session through a real driver, then replays it into a second real driver with zero divergences and an identical event stream", async () => {
    // --- record ----------------------------------------------------------
    const { fake, advance, now } = clockedFake({
      program: ROUNDTRIP_PROGRAM,
      deviceName: DEVICE,
      events: ROUNDTRIP_TIMELINE,
    });
    const tap = createRecordingTransport(fake, now);
    const recLog = createEventLog();
    // No timer this recording driver sets is ever awaited by this test (the
    // natural finish arms a summary-fallback reconcile no assertion below
    // needs) — a no-op `schedule` means no dangling real-or-fake timer
    // survives the test rather than a 3-second one this file would
    // otherwise never clean up.
    const recDriver = createPm5Driver(tap.transport, recLog, {
      deviceName: DEVICE,
      schedule: () => () => {},
    });
    const recorded: MonitorEvent[] = [];
    recDriver.events((e) => recorded.push(e));

    // MonitorDriver has no connect() — connection is Transport-level
    // (controller ruling), the same order `ConnectedSurface.test.tsx`'s
    // fake-driven walk uses.
    const [dev] = await tap.transport.scan();
    await tap.transport.connect(dev.id);

    await programAndArm(recDriver, advance, ROUNDTRIP_PROGRAM);
    expect(recorded.some((e) => e.kind === "armed")).toBe(true);

    for (const step of [100, 100, 100, 100, 100, 100]) advance(step);

    expect(recorded.filter((e) => e.kind === "intervalComplete")).toHaveLength(
      2,
    );
    expect(recorded.filter((e) => e.kind === "workoutComplete")).toHaveLength(
      1,
    );
    expect(recorded[recorded.length - 1]).toMatchObject({
      kind: "workoutComplete",
    });

    // --- serialize / parse -------------------------------------------------
    const file = buildRecordingFile(tap, {
      app: "roundtrip-test",
      transport: "fake",
      program: ROUNDTRIP_PROGRAM,
    });
    const parsed = parseRecording(file);
    // B4: the replayed program comes from the header, not from the local
    // `ROUNDTRIP_PROGRAM` constant a second time — asserted equal to it so
    // that using it below is provably the same program that was recorded.
    expect(parsed.header.program).toStrictEqual(ROUNDTRIP_PROGRAM);

    // --- replay into a SECOND, independent driver --------------------------
    const replay = createReplayTransport(parsed);
    const [rdev] = await replay.transport.scan();
    await replay.transport.connect(rdev.id);
    const repDriver = createPm5Driver(replay.transport, createEventLog(), {
      deviceName: DEVICE,
      // B2: the driver's clock IS the replay clock — bound here even though
      // this particular timeline never crosses the finish grace, so that a
      // future edit to this test inherits the correct wiring by default.
      now: () => replay.clock.now(),
      schedule: (cb, ms) => replay.clock.schedule(cb, ms),
    });
    const replayed: MonitorEvent[] = [];
    repDriver.events((e) => replayed.push(e));

    const programPending = repDriver.program(parsed.header.program!);
    const result = await replay.run();
    await programPending;

    expect(result.divergences).toStrictEqual([]);
    expect(replayed).toStrictEqual(recorded);
  });

  it("the replay clock expires the finish grace: a boundary recorded well outside the 3s grace window is refused by BOTH drivers only when now()/schedule are bound to the replay clock", async () => {
    // --- record, with the RECORDING driver's own clock under this file's
    // control too (not just the tap's) — the finish grace is a `now()`
    // decision (`graceIsOpen`, driver.ts), and with no wall clock anywhere
    // in this file the only way to make that decision MEAN anything
    // reproducible is to drive it off the same virtual clock the tap
    // timestamps events with. -------------------------------------------
    const { fake, advance, now } = clockedFake({
      program: GRACE_PROGRAM,
      deviceName: DEVICE,
      events: [
        {
          atMs: 100,
          kind: "status",
          workoutState: WORKOUTSTATE_INTERVALWORKTIME,
          elapsedSeconds: 30,
          distanceMeters: 150,
          spm: 22,
          currentSplit: 120,
          heartRateBpm: 150,
          programIntervalIndex: 0,
        },
        // The natural finish. `activeRun.finishGraceUntil` is armed at
        // `now() + FINISH_GRACE_MS` (3000) the instant this lands — i.e. at
        // virtual ms 200, the grace closes at virtual ms 3200.
        {
          atMs: 200,
          kind: "status",
          workoutState: WORKOUTSTATE_WORKOUTEND,
          elapsedSeconds: 60,
          distanceMeters: 300,
          spm: 0,
          currentSplit: 0,
          heartRateBpm: null,
          programIntervalIndex: 0,
        },
        // The interval's own boundary, arriving 3500 virtual ms AFTER the
        // finish — i.e. at virtual ms 3700, outside the 3s window. A real
        // machine's own post-run housekeeping can produce a boundary like
        // this (§4's own "OUT-OF-RUN boundaries" case); the grace exists to
        // accept the ONE boundary that arrives promptly, not every stray
        // one forever.
        {
          atMs: 3700,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: 60,
            distanceMeters: 300,
            avgSpm: 22,
            avgHeartRateBpm: 150,
            restDistanceMeters: 0,
          },
          cumulativeElapsedSeconds: 60,
          cumulativeDistanceMeters: 300,
        },
      ],
    });
    const tap = createRecordingTransport(fake, now);
    const recLog = createEventLog();
    const recDriver = createPm5Driver(tap.transport, recLog, {
      deviceName: DEVICE,
      now,
      schedule: () => () => {},
    });
    const recorded: MonitorEvent[] = [];
    recDriver.events((e) => recorded.push(e));

    const [dev] = await tap.transport.scan();
    await tap.transport.connect(dev.id);

    await programAndArm(recDriver, advance, GRACE_PROGRAM);

    advance(100); // the one live work tick
    advance(100); // WORKOUTEND -> workoutComplete; grace opens, closes at vNow 3200
    advance(3500); // the boundary lands at vNow 3700 — outside the grace

    // The recorded truth: the grace was CLOSED by the time the boundary
    // arrived, so it took the out-of-run door — `index: null`, no
    // `finalBoundary`, per `emitIntervalComplete`'s own "the finish grace,
    // decided BEFORE the out-of-run gate" branch (driver.ts).
    expect(recorded.some((e) => e.kind === "workoutComplete")).toBe(true);
    const recordedBoundary = recorded.find(
      (e) => e.kind === "intervalComplete",
    );
    expect(recordedBoundary).toBeDefined();
    expect(recordedBoundary).toMatchObject({
      kind: "intervalComplete",
      actual: { index: null },
    });
    expect(
      recordedBoundary && "finalBoundary" in recordedBoundary
        ? recordedBoundary.finalBoundary
        : undefined,
    ).toBeUndefined();

    // --- replay, driver clock bound to replay.clock -----------------------
    const file = buildRecordingFile(tap, {
      app: "roundtrip-grace-test",
      transport: "fake",
      program: GRACE_PROGRAM,
    });
    const parsed = parseRecording(file);

    const replay = createReplayTransport(parsed);
    const [rdev] = await replay.transport.scan();
    await replay.transport.connect(rdev.id);
    const repDriver = createPm5Driver(replay.transport, createEventLog(), {
      deviceName: DEVICE,
      now: () => replay.clock.now(),
      schedule: (cb, ms) => replay.clock.schedule(cb, ms),
    });
    const replayed: MonitorEvent[] = [];
    repDriver.events((e) => replayed.push(e));

    const programPending = repDriver.program(parsed.header.program!);
    const result = await replay.run();
    await programPending;

    expect(result.divergences).toStrictEqual([]);
    // THE PIN: replay reproduces the SAME grace-closed verdict — this is
    // exactly the assertion that would fail if `now`/`schedule` were left
    // on `Date.now`/real `setTimeout` instead of `replay.clock`, since a
    // replay's rx events land within microtasks of each other in real time
    // regardless of how far apart their recorded `t` values are, and an
    // unbound `Date.now()` would then read the grace as still open.
    expect(replayed).toStrictEqual(recorded);
  });
});
