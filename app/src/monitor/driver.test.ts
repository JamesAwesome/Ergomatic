import { describe, expect, it } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { compileProgram } from "../../domain/monitor/program.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { buildProgrammingSequence } from "../../domain/monitor/pm5/commands.js";
import {
  WORKOUTSTATE_INTERVALREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_REARM,
  WORKOUTSTATE_WAITTOBEGIN,
  WORKOUTSTATE_WORKOUTEND,
} from "../../domain/monitor/pm5/parse.js";
import {
  ADDITIONAL_STATUS_1_UUID,
  ADDITIONAL_STATUS_2_UUID,
  GENERAL_STATUS_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  SAMPLE_RATE_UUID,
  SPLIT_INTERVAL_DATA_UUID,
  TRANSMIT_CHARACTERISTIC_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import { buildGeneralStatusBytes } from "../../domain/monitor/pm5/statusFrames.js";
import { buildAckFrame } from "../../domain/monitor/pm5/response.js";
import type {
  DiscoveredMonitor,
  MonitorEvent,
  Transport,
} from "../../domain/monitor/types.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { createEventLog } from "./eventLog";
import {
  computeIntervalRemaining,
  createPm5Driver,
  ProgramRejectionError,
} from "./driver";
import { createFakeTransport, type FakeTimelineEvent } from "./transports/fake";

// The realistic fixture (briefing: "at least one test per client task
// starts from a real library workout ... not a hand-built minimum"): Sea
// Fret ("O2: 2x4' at 6k+12 with 1' rest"), run through the EXACT assembly
// `startSession` uses (`buildDraft` -> `buildRun` -> `compileProgram`),
// matching `src/monitor/program.sweep.test.ts`'s own pattern. Compiles to
// 3 intervals: a 300s warmup (no target/rest), then two 240s work
// intervals at 6k+12 (targetSplit 132s/500m) each followed by a 60s rest —
// confirmed against this exact fixture before writing the test (see the
// task report).
function seaFretProgram(): WorkoutProgram {
  const workout = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret");
  if (!workout)
    throw new Error("fixture workout 'Sea Fret' missing from the library seed");
  const draft = buildDraft({
    id: "driver-test-sea-fret",
    title: workout.title,
    type: workout.type,
    steps: workout.steps,
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
      kind: "time",
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 0,
    },
  ],
};

function harness(script: Parameters<typeof createFakeTransport>[0]) {
  const fake = createFakeTransport(script);
  const log = createEventLog();
  const driver = createPm5Driver(fake, log);
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
  it("reports fixed PM5 capabilities", () => {
    const { driver } = harness({ program: MINIMAL_PROGRAM });
    expect(driver.capabilities).toStrictEqual({
      canProgram: true,
      hasStrokeRate: true,
      reportsIntervals: true,
      deviceName: "PM5",
    });
  });
});

describe("createPm5Driver: computeIntervalRemaining (pure)", () => {
  const interval = {
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
    expect(frames[0]).toMatchObject({
      frame: { intervalIndex: 0, intervalRemaining: null },
    });
  });
});

describe("createPm5Driver: distance-kind interval — intervalRemaining uses distanceMeters progress", () => {
  it("computes remaining meters from the checkpoint, not elapsed seconds", async () => {
    const program: WorkoutProgram = {
      intervals: [
        {
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
        intervalIndex: 0,
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
        intervalIndex: 0,
      },
    ];
    const { fake, driver, events } = harness({ program, events: timeline });
    await driver.program(program);
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
    // this manually acks the single frame a 1-interval program produces.
    const pending = driver.program(program);
    transport.notify(TRANSMIT_CHARACTERISTIC_UUID, buildAckFrame("ok", []));
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
          kind: "distance",
          value: 500,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
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
        intervalIndex: 0,
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
          avgSplit: 110,
          avgSpm: 22,
          avgHeartRateBpm: 140,
        },
        cumulativeElapsedSeconds: 100,
        cumulativeDistanceMeters: 500,
      },
      // The interval-1 tick also happens while disconnected — 200m into
      // the new 1000m interval (700 session-cumulative - 500 checkpoint).
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 140,
        distanceMeters: 700,
        spm: 22,
        currentSplit: 108,
        heartRateBpm: 145,
        intervalIndex: 1,
      },
    ];
    const { fake, driver, events } = harness({ program, events: timeline });

    await driver.program(program);
    fake.tick(100); // interval-0 tick lands normally
    fake.injectDisconnect();
    fake.tick(200); // the boundary AND the interval-1 tick both elapse while disconnected
    fake.completeReconnect(); // flushes both — boundary first, then the fresh interval-1 status

    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(1);

    const frames = events.filter((e) => e.kind === "frame");
    const latest = frames[frames.length - 1];
    // 1000m interval, checkpoint at 500 (from the boundary that happened
    // while disconnected), now at session distance 700 -> 200m progress
    // -> 800m remaining. An earlier design would have checkpointed at
    // THIS tick itself (progress 0, remaining the full 1000m) since it's
    // the first tick the driver ever observed for interval 1.
    expect(latest).toMatchObject({
      kind: "frame",
      frame: {
        intervalIndex: 1,
        distanceMeters: 700,
        intervalRemaining: { kind: "distance", value: 800 },
      },
    });
  });
});

describe("createPm5Driver: the full happy path over a real compiled workout (Sea Fret)", () => {
  it("program -> armed -> frames (with re-derived intervalRemaining) -> boundaries -> complete", async () => {
    const program = seaFretProgram();
    const timeline: FakeTimelineEvent[] = [
      // Interval 0 (the 300s warmup): one live tick 120s in.
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 120,
        distanceMeters: 400,
        spm: 20,
        currentSplit: 130,
        heartRateBpm: 130,
        intervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 300,
          distanceMeters: 1000,
          avgSplit: 130,
          avgSpm: 20,
          avgHeartRateBpm: 135,
        },
        // The session's first interval starts at cumulative 0, so its
        // boundary's cumulative totals equal its own per-interval ones —
        // this is what roots interval 1's checkpoint at 300s/1000m.
        cumulativeElapsedSeconds: 300,
        cumulativeDistanceMeters: 1000,
      },
      // Interval 1 (240s work): one live tick 60s into THIS interval —
      // session-cumulative elapsed is 300 (interval 0) + 60 = 360.
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 360,
        distanceMeters: 1400,
        spm: 22,
        currentSplit: 132,
        heartRateBpm: 150,
        intervalIndex: 1,
      },
      {
        atMs: 400,
        kind: "boundary",
        actual: {
          index: 1,
          elapsedSeconds: 240,
          distanceMeters: 1000,
          avgSplit: 132,
          avgSpm: 22,
          avgHeartRateBpm: 155,
        },
        // Checkpoint(300) + this interval's 240s work + its 60s rest —
        // roots interval 2's checkpoint at 600s/2000m.
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
        intervalIndex: 2,
      },
      {
        atMs: 600,
        kind: "boundary",
        actual: {
          index: 2,
          elapsedSeconds: 240,
          distanceMeters: 1000,
          avgSplit: 132,
          avgSpm: 22,
          avgHeartRateBpm: 158,
        },
        cumulativeElapsedSeconds: 840,
        cumulativeDistanceMeters: 3000,
      },
      // Workout end.
      {
        atMs: 700,
        kind: "status",
        workoutState: WORKOUTSTATE_WORKOUTEND,
        elapsedSeconds: 840,
        distanceMeters: 3400,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        intervalIndex: 2,
      },
    ];
    const { fake, driver, events, log } = harness({
      program,
      events: timeline,
    });

    await driver.program(program);
    // The fake reports the WAITTOBEGIN status the instant programming acks
    // (synchronously, inside that last write) — so the wire-level "frame"
    // event (state: "armed") lands before this driver's own synthesized
    // `{kind: "armed"}` event, which only fires once `program()`'s promise
    // itself resolves. Both convey the same transition; presence, not
    // position, is what matters.
    expect(events[0]).toMatchObject({
      kind: "frame",
      frame: { state: "armed" },
    });
    expect(events.some((e) => e.kind === "armed")).toBe(true);

    for (let i = 0; i < 7; i += 1) fake.tick(100);

    // Trace-assertion #1: programming emitted exactly these command/ack
    // pairs — one "write" per BLE chunk, then one "ack" — filtered
    // straight out of the injectable event log.
    const trace = log
      .entries()
      .filter((e) => e.kind === "write" || e.kind === "ack");
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
    expect(
      boundaries.map((e) =>
        e.kind === "intervalComplete" ? e.actual.index : -1,
      ),
    ).toStrictEqual([0, 1, 2]);

    // intervalRemaining, re-derived from the checkpoint at each interval's
    // first tick: interval 1's live tick is 60s into a 240s interval.
    const interval1Frame = events.find(
      (e) => e.kind === "frame" && e.frame.intervalIndex === 1,
    );
    expect(interval1Frame).toBeDefined();
    expect(interval1Frame).toMatchObject({
      kind: "frame",
      frame: { intervalRemaining: { kind: "time", value: 180 } },
    });
  });
});

describe("createPm5Driver: terminate + Appendix-E terminal-state latching", () => {
  it("terminate() acks, reports terminated, and LATCHES through the PM's own auto Rearm->WaitToBegin cycle", async () => {
    // Appendix E (CSAFE p.162): after Terminate, the PM auto-cycles
    // Rearm -> WaitToBegin on its own, with no further driver action —
    // pinned here by literally scripting that exact sequence as
    // additional timeline events AFTER terminate() and asserting the
    // driver never un-finishes.
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
        intervalIndex: 0,
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
        intervalIndex: 0,
      },
      // A boundary event too, to prove intervalComplete is ALSO latched.
      {
        atMs: 300,
        kind: "boundary",
        actual: {
          index: 5,
          elapsedSeconds: 1,
          distanceMeters: 1,
          avgSplit: null,
          avgSpm: null,
          avgHeartRateBpm: null,
        },
        cumulativeElapsedSeconds: 1,
        cumulativeDistanceMeters: 1,
      },
    ];
    const { fake, driver, events, log } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });

    await driver.program(MINIMAL_PROGRAM);
    await driver.terminate();

    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);
    // terminate()'s own final status frame IS a regular "frame" event too
    // (design choice: the last frame before latching is still observable,
    // e.g. for a final elapsed/distance summary) — captured here as the
    // baseline the post-terminal tick below must not add to.
    const eventCountAfterTerminate = events.length;
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

    // LATCHED: not one further event of any kind — the terminal state
    // never un-fires, and no frame/intervalComplete sneaks in from the
    // PM's own auto Rearm->WaitToBegin cycle or the trailing boundary.
    expect(events).toHaveLength(eventCountAfterTerminate);
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "intervalComplete")).toHaveLength(0);
    expect(events[events.length - 1]).toStrictEqual({ kind: "terminated" });
  });

  it("a disconnect that arrives AFTER the terminal state is logged, not treated as an error (no 'disconnected' event)", async () => {
    const { fake, driver, events, log } = harness({ program: MINIMAL_PROGRAM });
    await driver.program(MINIMAL_PROGRAM);
    await driver.terminate();
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);

    fake.injectDisconnect();

    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(0);
    expect(
      log
        .entries()
        .some(
          (e) => e.kind === "disconnect" && e.detail.includes("post-terminal"),
        ),
    ).toBe(true);
  });

  it("M-3 (final-review, empirically proven): a second terminate() call after 'terminated' has already latched resolves via the disconnect hatch, even though the ack-timeout hatch is disabled post-terminal", async () => {
    // ackTimeout is configured but deliberately never saves the day here —
    // `mergeStatus`'s own `if (terminalLatched) return` stops every
    // GENERAL_STATUS notification before it ever reaches the tick counter,
    // regardless of how much virtual time passes, once terminalLatched is
    // set. This test proves BOTH halves of the empirically-proven bug: the
    // ack-timeout hatch stays disabled (5000ms of ticks change nothing) AND
    // the disconnect hatch — broken before this fix — now resolves it.
    const fake = createFakeTransport({ program: MINIMAL_PROGRAM });
    const log = createEventLog();
    const driver = createPm5Driver(fake, log, { ackTimeout: { ticks: 1 } });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    await driver.program(MINIMAL_PROGRAM);
    await driver.terminate();
    expect(events.filter((e) => e.kind === "terminated")).toHaveLength(1);

    // A second terminate() call after the terminal state has already
    // latched (a plausible 7B cleanup path — e.g. calling terminate()
    // defensively on unmount). The fake's own ack is withheld
    // (injectTimeout) so this reproduces the empirically-proven hang:
    // neither escape hatch fires on its own once this write goes out.
    fake.injectTimeout();
    const pending = driver.terminate();

    fake.tick(5000); // the ack-timeout hatch: disabled post-terminal, proven inert
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

    // Still no 'disconnected' MonitorEvent — post-terminal disconnects stay
    // silent to any listener, unchanged from the existing "no 'disconnected'
    // event fires" test above.
    expect(events.filter((e) => e.kind === "disconnected")).toHaveLength(0);
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
        expect(rejection.hexTrace).toContain("ack status=reject");
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
    // Scripted so that TWO general-status ticks become due — nothing in
    // the fake gates timeline delivery on `phase`, so these deliver mid-
    // "programming" (before "armed"), exercising a genuine "mid-sequence
    // timeout" (spec §4's own phrasing, mirroring "mid-sequence NAK")
    // rather than only being testable after the session is armed.
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
        intervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 2,
        distanceMeters: 2,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        intervalIndex: 0,
      },
    ];
    const fake = createFakeTransport({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    const log = createEventLog();
    const driver = createPm5Driver(fake, log, { ackTimeout: { ticks: 2 } });
    const events: MonitorEvent[] = [];
    driver.events((e) => events.push(e));

    fake.injectTimeout();
    const pending = driver.program(MINIMAL_PROGRAM);
    fake.tick(200); // delivers both scheduled general-status ticks in one call

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
        intervalIndex: 0,
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
        intervalIndex: 0,
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
        intervalIndex: 0,
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
        intervalIndex: 2,
      },
    ];
    const { fake, driver, events } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });

    await driver.program(MINIMAL_PROGRAM);
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
        intervalIndex: 0,
      },
    ];
    const { fake, driver, events, log } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    await driver.program(MINIMAL_PROGRAM);
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
        intervalIndex: 0,
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
          avgSplit: 120,
          avgSpm: 22,
          avgHeartRateBpm: 140,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 200,
      },
    ];
    const { fake, log } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    // Note: `driver.program()` is deliberately never called here — the
    // divergence check depends only on the "seen" status/split
    // characteristics having arrived at least once (satisfied by ticking
    // the scripted timeline below), not on the driver's own `program`
    // state, so there is nothing to await first.
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
        intervalIndex: 0,
      },
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 200,
          avgSplit: 120,
          avgSpm: 22,
          avgHeartRateBpm: 140,
        },
        cumulativeElapsedSeconds: 60,
        cumulativeDistanceMeters: 200,
      },
    ];
    const { fake, log } = harness({
      program: MINIMAL_PROGRAM,
      events: timeline,
    });
    fake.tick(200);
    expect(log.entries().some((e) => e.kind === "divergence")).toBe(false);
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
        buildAckFrame("ok", [0x01]),
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

    // Both frames' acks, concatenated into ONE raw byte stream — a
    // single BLE notification that happened to coalesce two responses.
    const ack1 = buildAckFrame("ok", []);
    const ack2 = buildAckFrame("ok", []);
    const coalesced = new Uint8Array(ack1.length + ack2.length);
    coalesced.set(ack1, 0);
    coalesced.set(ack2, ack1.length);
    transport.notify(TRANSMIT_CHARACTERISTIC_UUID, coalesced);

    await expect(pending).resolves.toBeUndefined();
    // Both frames' chunks actually went out — this isn't a case where the
    // driver merely accepted the buffered ack without ever writing the
    // second frame's own bytes.
    expect(
      transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID),
    ).toHaveLength(seq.flat().length);
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
    const driver = createPm5Driver(transport, log);

    const programPending = driver.program(MINIMAL_PROGRAM);
    transport.notify(TRANSMIT_CHARACTERISTIC_UUID, buildAckFrame("ok", []));
    await programPending;

    // No sequence is running right now — this is genuinely stray. Body
    // deliberately encodes a REJECT with a distinctive opcode (0x99) so a
    // wrongly-consumed outcome (terminate() rejecting with "nak") is
    // unambiguous, not a coincidence of some other default.
    transport.notify(
      TRANSMIT_CHARACTERISTIC_UUID,
      buildAckFrame("reject", [0x99]),
    );

    const terminatePending = driver.terminate();
    // terminate()'s REAL ack — sent AFTER the stale one, proving the
    // sequence actually waited for and consumed THIS one, not the stray.
    transport.notify(TRANSMIT_CHARACTERISTIC_UUID, buildAckFrame("ok", []));

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
    const ack1 = buildAckFrame("ok", []);
    const ack2 = buildAckFrame("ok", []);
    const coalesced = new Uint8Array(ack1.length + ack2.length);
    coalesced.set(ack1, 0);
    coalesced.set(ack2, ack1.length);
    transport.notify(TRANSMIT_CHARACTERISTIC_UUID, coalesced);

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

  it("log.entries() shows exactly buildProgrammingSequence's chunks, each frame paired with one 'ok' ack", async () => {
    const program: WorkoutProgram = {
      intervals: Array.from({ length: 13 }, () => ({
        kind: "time" as const,
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 30,
      })),
    };
    const seq = buildProgrammingSequence(program);
    expect(seq).toHaveLength(4); // confirms this fixture is genuinely multi-frame

    const { driver, log } = harness({ program });
    await driver.program(program);

    const trace = log
      .entries()
      .filter((e) => e.kind === "write" || e.kind === "ack");
    const expectedAckHex = hex(buildAckFrame("ok", []));

    let cursor = 0;
    for (const frame of seq) {
      for (const chunk of frame) {
        expect(trace[cursor]).toMatchObject({
          kind: "write",
          detail: hex(chunk),
        });
        cursor += 1;
      }
      expect(trace[cursor]).toMatchObject({
        kind: "ack",
        detail: expectedAckHex,
      });
      cursor += 1;
    }
    expect(trace).toHaveLength(cursor);
  });
});

describe("createPm5Driver: events() subscription and disconnect()", () => {
  it("unsubscribing stops further delivery to that listener", async () => {
    const { fake, driver } = harness({ program: MINIMAL_PROGRAM });
    const events: MonitorEvent[] = [];
    const unsubscribe = driver.events((e) => events.push(e));
    await driver.program(MINIMAL_PROGRAM);
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
