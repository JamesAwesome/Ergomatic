import { describe, expect, it } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { compileProgram } from "../../domain/monitor/program.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import {
  buildGetErrorType,
  buildProgrammingSequence,
  buildTerminate,
} from "../../domain/monitor/pm5/commands.js";
import {
  WORKOUTSTATE_INTERVALREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_REARM,
  WORKOUTSTATE_WAITTOBEGIN,
  WORKOUTSTATE_WORKOUTEND,
} from "../../domain/monitor/pm5/parse.js";
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
import {
  buildAdditionalSplitIntervalDataBytes,
  buildGeneralStatusBytes,
  buildSplitIntervalDataBytes,
} from "../../domain/monitor/pm5/statusFrames.js";
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

/** A 3-interval program — used where a test's own scripted machine index
 *  needs to land on a REAL interval (post-D3-fix, `toProgramIndex` clamps
 *  or nulls a machine index that overshoots `MINIMAL_PROGRAM`'s single
 *  interval, `domain/monitor/pm5/intervalIndex.ts`'s own contract), not
 *  `MINIMAL_PROGRAM`'s one. */
const THREE_INTERVAL_PROGRAM: WorkoutProgram = {
  intervals: Array.from({ length: 3 }, () => ({
    kind: "time" as const,
    value: 60,
    targetSplit: 120,
    displaySpm: 22,
    restSeconds: 30,
  })),
};

// Plan Task 2: `program()` now sends `buildTerminate()` as its own
// best-effort prepare step BEFORE the real programming sequence — every
// `stubTransport`-driven test below that drives acks by hand must account
// for that leading exchange too, not just the programming sequence's own.
const prepareChunkCount = buildTerminate()[0]!.length;

/** A WAITTOBEGIN (armed) General Status payload — `program()`'s
 *  verification phase (`verifyArmed`, driver.ts) resolves the instant this
 *  arrives, regardless of when relative to the ack: it merges straight
 *  into the driver's persistent `raw` state, so it is always safe to send
 *  right after (or even interleaved with) a `stubTransport` test's own ack
 *  notifications rather than needing precise interleaving. */
const ARMED_GENERAL_STATUS = buildGeneralStatusBytes({
  elapsedSeconds: 0,
  distanceMeters: 0,
  workoutType: 8,
  intervalType: 0,
  workoutState: WORKOUTSTATE_WAITTOBEGIN,
  rowingState: 0,
  strokeState: 0,
  totalWorkDistanceMeters: 0,
  workoutDurationRaw: 0,
  workoutDurationType: 0,
  dragFactor: 130,
});

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
 * `program()` call by hand — the prepare step's routine refusal, the real
 * send's `"ok"` ack, then a FRESH post-send "armed" status for
 * `verifyArmed()` to observe (never a cached one; that is the whole point
 * of that phase).
 *
 * Needed wherever the shared fake cannot go, which since Task 4 includes
 * the most important case of all: a SECOND `program()` on the same
 * transport. `transports/fake.ts` models one program per fake — its
 * `phase` reaches `"armed"` and every write afterwards is asserted against
 * the terminate sequence alone, so a second programming send throws
 * "unexpected write while armed". Rewriting the fake is spec §6 / Task
 * 6's job, deliberately not this task's, so the re-program tests below
 * drive the protocol by hand instead.
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
  // A refusal is the prepare step's expected answer (`sendPrepare`
  // swallows anything but a disconnect).
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
  transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
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

/** One half of a boundary, addressed to a specific Split/Interval Number
 *  and carrying values distinctive enough to tell boundaries apart in an
 *  assertion. Built through the pm5 encoders, so these are the real bytes
 *  the driver's own decoders read. (Module-scoped since Task 4 — the
 *  run-scoping tests need the same two halves the D4 block does.) */
function splitHalf(boundary: number, seconds: number, meters: number) {
  return buildSplitIntervalDataBytes({
    elapsedSeconds: seconds,
    distanceMeters: meters,
    splitIntervalTimeSeconds: seconds,
    splitIntervalDistanceMeters: meters,
    intervalRestTimeSeconds: 0,
    intervalRestDistanceMeters: 0,
    splitIntervalType: 0,
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
    ergMachineType: 1,
  });
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
    // D3 fix (`intervalIndex.ts`): with no program armed, `programLength`
    // is 0 and `toProgramIndex` returns `null` by its own contract — there
    // is no program for a raw machine index to be explained against, so
    // "no interval is current" is the correct reading, same conclusion
    // `intervalRemaining`'s own `!program` guard already reaches.
    expect(frames[0]).toMatchObject({
      frame: { intervalIndex: null, intervalRemaining: null },
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
    transport.notify(GENERAL_STATUS_UUID, ARMED_GENERAL_STATUS);
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
        programIntervalIndex: 0,
      },
      // Interval 0's boundary is a WORK->WORK one: the warmup compiles with
      // `restSeconds: 0`, so no rest tick ever separates it from interval 1
      // and the state word is still "rowing" when 0x0037/38 arrive. This is
      // the shape with NO hardware evidence behind it (§17 item 13) — the
      // fake puts the index through unadjusted, which is what today's code
      // ASSUMES rather than knows, and the driver's "index-unverified"
      // entry (asserted below) is the only thing that says so.
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
          avgSplit: 132,
          avgSpm: 22,
          avgHeartRateBpm: 158,
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
    // the prepare step's own "prepare-rejected" marker (plan Task 2/
    // design spec §3: `program()` now sends `buildTerminate()` as a
    // leading prepare, which contributes its own write/ack pair to the
    // SAME log kinds first).
    const prepareSeq = log
      .entries()
      .find((e) => e.kind === "prepare-rejected")!.seq;
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
    expect(log.entries().some((e) => e.kind === "divergence")).toBe(false);
    // ...but the ONE boundary with no hardware evidence behind its
    // numbering says so, exactly once: interval 0's work->work boundary.
    const unverified = log
      .entries()
      .filter((e) => e.kind === "index-unverified");
    expect(unverified).toHaveLength(1);
    expect(unverified[0]!.detail).toContain("actual.index=0");
    // D5, end to end over a real workout: the closing tick had no belt, and
    // the fake sent the byte the machine sent for that — `0`, not 255.
    // Either way this must reach a consumer as "no reading".
    const finalFrame = events.filter((e) => e.kind === "frame").at(-1);
    expect(finalFrame).toMatchObject({
      kind: "frame",
      frame: { state: "finished", heartRateBpm: null },
    });

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
          avgSplit: null,
          avgSpm: null,
          avgHeartRateBpm: null,
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
        // The fake wrote 0 for these (the script authored `null`, and
        // 0x0038 has no null sentinel for a pace/rate) — carried through
        // verbatim, since an out-of-run boundary is emitted unchanged
        // apart from its index.
        avgSplit: 0,
        avgSpm: 0,
        avgHeartRateBpm: null,
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
          avgSplit: 118,
          avgSpm: 24,
          avgHeartRateBpm: 142,
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
    const transport = stubTransport();
    const log = createEventLog();
    const driver = createPm5Driver(transport, log);
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
  it("a prepare-rejected step still proceeds to program the real workout (interface-notes.md §18/§19.4: expected, never fatal)", async () => {
    // Realistic fixture (briefing: "at least one test per client task
    // starts from a real library workout"): Sea Fret, not a hand-built
    // minimum. Against TODAY's code (no prepare step at all), `program()`
    // never records a "prepare-rejected" entry — this assertion fails there.
    const program = seaFretProgram();
    const { fake, driver, log, events } = harness({ program });

    await programAndArm(driver, fake, program);

    // The fake's clearing phase ALWAYS rejects — the common
    // "nothing was loaded" case (interface-notes.md §18) — and `program()`
    // must treat that as informational, not fatal: it logs and proceeds
    // straight into the real send.
    expect(log.entries().some((e) => e.kind === "prepare-rejected")).toBe(true);
    // The real program still landed and was verified: `createFakeTransport`
    // itself asserts every programming byte against
    // `buildProgrammingSequence` (a mismatch throws synchronously), so
    // reaching "armed" here is proof the real sequence was actually sent —
    // not skipped, not corrupted by the leading prepare attempt.
    expect(events.some((e) => e.kind === "armed")).toBe(true);
    // F7 (fix-round 1): a HEALTHY program must never show a spurious
    // "program-rejection" from its own routine, swallowed prepare-step nak.
    expect(log.entries().some((e) => e.kind === "program-rejection")).toBe(
      false,
    );
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
          avgSplit: 120,
          avgSpm: 22,
          avgHeartRateBpm: 140,
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
          avgSplit: 120,
          avgSpm: 22,
          avgHeartRateBpm: 140,
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
          // offset rule's own one-past-the-end shape.
          index: 9,
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
          avgSplit: 120,
          avgSpm: 22,
          avgHeartRateBpm: 140,
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

describe("createPm5Driver: D3 review — no-rest boundary logs 'index-unverified' instead of staying silent", () => {
  // Task 3's review finding, and the shape with the least evidence behind
  // it anywhere in this driver: with `restSeconds: 0` the state word never
  // leaves "rowing" at a work->work boundary (no rest tick ever fires in
  // between), so `toProgramIndex`'s only hardware-confirmed branch — the
  // resting offset — never engages, and the machine's number passes through
  // UNADJUSTED. Nothing else in the trace can flag that: the value is
  // in-range, and both raw fields agree with each other, so neither
  // divergence check fires. The `"index-unverified"` entry the second
  // assertion below demands is therefore the ONE observable that this
  // boundary's numbering is an assumption rather than a reading — and the
  // only thing that would reveal a wrong assumption here, since if the
  // machine really does attribute forward at a work->work boundary too,
  // every actual in such a program is filed one interval late in silence.
  // §17 item 13 is the reading that would settle it.
  //
  // NOTE for anyone reading the mutation log: the `machineState`-hardcode
  // mutant CANNOT fail on this shape by construction — the state here IS
  // "rowing", so hardcoding the literal is a no-op. This shape is guarded
  // by the log assertion below and nothing else.
  it("a work->work boundary with restSeconds: 0 stays in 'rowing' the whole time and logs 'index-unverified', not silence", async () => {
    const restlessProgram: WorkoutProgram = {
      intervals: [
        {
          kind: "time",
          value: 60,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0, // no rest -- the state word never becomes "resting"
        },
        {
          kind: "time",
          value: 60,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0,
        },
      ],
    };
    const timeline: FakeTimelineEvent[] = [
      // Interval 0, rowing. There is no rest to follow it, so the state
      // word never becomes "resting" at any point in this program and
      // nothing is ever forward-attributed (`toMachineIndex` adjusts a REST
      // and nothing else) — both raw fields agree with each other AND with
      // us, which is exactly why no divergence of any kind can fire: the
      // reviewer's reproduction, "NO-REST DIVERGENCE []".
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
        // The interval that just finished is 0, and — under the ONLY rule
        // available for this shape — the machine puts a plain `0` on
        // 0x0037/38 for it. The fake deliberately does NOT invent a
        // forward-attributed value here: no hardware reading exists for a
        // work->work boundary (§17 item 13), and a fake that guessed would
        // teach CI a number nobody has ever seen. If the machine turns out
        // to attribute forward here too, EVERY actual in a `restSeconds: 0`
        // program is filed one interval late and the only thing in the
        // trace that would have hinted at it is the "index-unverified"
        // entry asserted below.
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
      // The machine rows straight on into interval 1 with no state change
      // of any kind — the whole point of the shape.
      {
        atMs: 300,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 90,
        distanceMeters: 320,
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

    // The boundary still fires and still normalizes to SOMETHING plausible
    // (never invents a NEW offset for this shape, per the review's explicit
    // instruction) -- this is not a defect fix, only a visibility fix.
    const complete = events.find((e) => e.kind === "intervalComplete");
    expect(complete).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0 },
    });

    const unverified = log.entries().find((e) => e.kind === "index-unverified");
    expect(unverified).toBeDefined();
    expect(unverified?.detail).toContain("actual.index=0");
    expect(unverified?.detail).toContain("state=rowing");
    expect(unverified?.detail).toContain("§17 item 13");

    // No divergence of either kind fires -- the value is perfectly in
    // range and both raw fields agree with each other, exactly the silent
    // shape the review's critical finding described.
    expect(log.entries().some((e) => e.kind === "divergence")).toBe(false);
  });

  it("a boundary that DOES follow a rest tick never logs 'index-unverified' (the rule has a real hardware-confirmed signal there)", async () => {
    const timeline: FakeTimelineEvent[] = [
      // Interval 1's trailing rest: the machine's own counter reads 2 here
      // (forward-attributed), and so does the Split/Interval Number on the
      // boundary that follows — the confirmed half of the rule.
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
          avgSplit: 120,
          avgSpm: 22,
          avgHeartRateBpm: 140,
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

    // OUR 1, from a wire that said 2 — the discriminating row (a value the
    // clamp cannot also produce), and the one the D3 fix exists for.
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

    const { fake, driver, log } = harness({ program });
    await programAndArm(driver, fake, program);

    // Scoped to entries AFTER the prepare step's own "prepare-rejected"
    // marker (plan Task 2/design spec §3) — `program()`'s leading
    // `buildTerminate()` prepare contributes its own write/ack pair to
    // these SAME log kinds first.
    const prepareSeq = log
      .entries()
      .find((e) => e.kind === "prepare-rejected")!.seq;
    const trace = log
      .entries()
      .filter(
        (e) => e.seq > prepareSeq && (e.kind === "write" || e.kind === "ack"),
      );
    // Task 3: the "ack" log detail now also carries the parsed slave
    // state (`buildAckFrame`'s own default, "ready") alongside the raw
    // hex it always showed.
    const expectedAckHex = `${hex(buildAckFrame({ frameStatus: "ok" }))} slaveState=ready`;

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
          avgSplit: 130,
          avgSpm: 20,
          avgHeartRateBpm: 130,
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
          avgSplit: 100,
          avgSpm: 30,
          avgHeartRateBpm: 170,
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
    expect(boundaries[0]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 0, avgSpm: 20, avgHeartRateBpm: 130, avgSplit: 130 },
    });
    expect(boundaries[1]).toMatchObject({
      kind: "intervalComplete",
      actual: { index: 1, avgSpm: 30, avgHeartRateBpm: 170, avgSplit: 100 },
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

describe("createPm5Driver: D1 — programming over a loaded workout is rejected, and destroys what was loaded", () => {
  it("rejects at frame 0 and the monitor's own workout is GONE (the confirmed destructive half)", async () => {
    const { fake, driver, events, log } = harness({
      program: MINIMAL_PROGRAM,
      // A workout the rower had already set up on the monitor.
      loadedWorkout: { intervalCount: 4 },
    });
    expect(fake.loadedIntervals()).toBe(4);

    const rejection = await driver.program(MINIMAL_PROGRAM).catch((e) => e);

    expect(rejection).toBeInstanceOf(ProgramRejectionError);
    expect(rejection).toMatchObject({ reason: "nak", atFrame: 0 });
    // This is the fact `MonitorDriver.program`'s JSDoc requires 7B to warn
    // about BEFORE calling: by the time the caller sees this error, the
    // rower's loaded workout has already been wiped. A caller that treats a
    // rejection as "nothing happened, we can retry safely" is wrong about
    // the machine.
    expect(fake.loadedIntervals()).toBeNull();
    // And nothing was armed: no armed event, no armed log entry.
    expect(events.some((e) => e.kind === "armed")).toBe(false);
    expect(log.entries().some((e) => e.kind === "armed")).toBe(false);
  });

  it("the prepare step is ACCEPTED while a workout is loaded, and still does not save the program (terminate is not a clear)", async () => {
    const { fake, driver, log } = harness({
      program: MINIMAL_PROGRAM,
      loadedWorkout: { intervalCount: 2 },
    });

    await expect(driver.program(MINIMAL_PROGRAM)).rejects.toBeInstanceOf(
      ProgramRejectionError,
    );

    // The D1 UPDATE row exactly: terminate acked "ok" with a workout
    // loaded — so NO "prepare-rejected" entry, unlike every clean-state
    // program() in this file — and the program that followed was rejected
    // anyway.
    expect(log.entries().some((e) => e.kind === "prepare-rejected")).toBe(
      false,
    );
    expect(log.entries().some((e) => e.kind === "prepare-sent")).toBe(true);
    expect(log.entries().some((e) => e.kind === "program-rejection")).toBe(
      true,
    );
    expect(fake.loadedIntervals()).toBeNull();
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
    // trace that cannot survive a warm-up is not observability.
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
        .find((e) => e.kind === "frame" && e.detail.includes("rowing"))?.detail,
    ).toContain("state=rowing");
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
          avgSplit: 120,
          avgSpm: 22,
          // The exact field the machine sent `0` on (§18's new-defect note).
          avgHeartRateBpm: null,
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
