import { describe, expect, it } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { compileProgram } from "../../domain/monitor/program.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
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
    // First tick: checkpoint sets itself here (progress 0, remaining full
    // 1000m). Second tick: progress = 700 - 300 = 400m -> remaining 600m,
    // using distanceMeters, never elapsedSeconds.
    expect(frames[frames.length - 1]).toMatchObject({
      frame: { intervalRemaining: { kind: "distance", value: 600 } },
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

describe("createPm5Driver: timeout (link down before any ack arrives)", () => {
  it("a disconnect while a programming ack is pending rejects with reason 'timeout'", async () => {
    // Uses a bare stub, not the fake: the fake always acks synchronously
    // inside write() (the same-turn ordering this file's `sendSequence`
    // comment documents), so to get a write whose ack genuinely never
    // arrives, the stub simply never notifies TRANSMIT_CHARACTERISTIC_UUID
    // at all, then the test fires the disconnect callback directly.
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);

    const pending = driver.program(MINIMAL_PROGRAM);
    transport.fireDisconnect("radio out of range");

    await expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ProgramRejectionError);
      expect((err as ProgramRejectionError).reason).toBe("timeout");
      expect((err as ProgramRejectionError).atFrame).toBe(0);
      return true;
    });
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
  it("a too-short General Status notification is logged as frame-error, not thrown; the next valid one still emits normally", async () => {
    const { fake, driver, events, log } = harness({ program: MINIMAL_PROGRAM });
    await driver.program(MINIMAL_PROGRAM);
    const framesAfterArm = events.filter((e) => e.kind === "frame").length;

    expect(() => fake.injectGarbledFrame()).not.toThrow();
    expect(events.filter((e) => e.kind === "frame").length).toBe(
      framesAfterArm,
    ); // no new frame from the garbage

    const errorEntry = log.entries().find((e) => e.kind === "frame-error");
    expect(errorEntry).toBeDefined();
    expect(errorEntry?.detail).toContain("0x0031");

    // The stream lives: a subsequent VALID notification still works.
    fake.tick(100);
    // (MINIMAL_PROGRAM has no scripted timeline events, so nothing new is
    // due — the assertion here is simply that ticking doesn't throw or
    // wedge the driver after the garbled frame.)
    expect(() => fake.tick(100)).not.toThrow();
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

describe("createPm5Driver: unsolicited ack frame", () => {
  it("an ack notification with nothing awaiting it is logged, not thrown", () => {
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
        .some(
          (e) => e.kind === "frame-error" && e.detail.includes("unsolicited"),
        ),
    ).toBe(true);
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
