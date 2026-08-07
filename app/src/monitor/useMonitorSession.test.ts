import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKOUTSTATE_INTERVALREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_WORKOUTEND,
} from "../../domain/monitor/pm5/parse.js";
import {
  GENERAL_STATUS_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import type {
  DiscoveredMonitor,
  MonitorFrame,
  Transport,
} from "../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { loadRun, saveRun, type SessionRun } from "../session/run";
import { createEventLog } from "./eventLog";
import { loadMonitorRun } from "./monitorRun";
import {
  createFakeTransport,
  type FakeControls,
  type FakeScript,
  type FakeTimelineEvent,
} from "./transports/fake";
import {
  isPausedRun,
  nextFreezeRun,
  useMonitorSession,
  type FreezeRun,
  type MonitorSessionDeps,
  type RunIdentity,
} from "./useMonitorSession";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE_NAME = "PM5 432331249";

/** The realistic fixture the repo convention requires (a real seeded
 *  library workout through the real assembly — `buildDraft` -> `buildRun`
 *  -> `compileProgram`), not a hand-built minimum. "Filling Low" compiles
 *  to four intervals with both duration kinds and real rests: an 8:00
 *  warmup (no rest) then 3 x 2000 m / 3:00 rest. The full happy walk below
 *  runs on exactly this. */
function fillingLow(): { program: WorkoutProgram; title: string; id: string } {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "filling-low",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const compiled = compileProgram(buildRun(draft, baselines, t0).phases);
  if ("code" in compiled) {
    throw new Error(`fixture failed to compile: ${compiled.code}`);
  }
  return { program: compiled, title: w.title, id: "filling-low" };
}

const LIBRARY = fillingLow();
const LIBRARY_IDENTITY: RunIdentity = {
  workoutId: LIBRARY.id,
  title: LIBRARY.title,
};

/** A two-interval program for the tests whose subject is the hook's own
 *  state machine rather than a realistic workout's shape — short enough
 *  that a timeline stays readable. */
const TWO_INTERVALS: WorkoutProgram = {
  intervals: [
    {
      kind: "time",
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 0,
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

const TWO_IDENTITY: RunIdentity = { workoutId: "two", title: "Two Intervals" };

function status(
  atMs: number,
  over: Partial<Omit<FakeTimelineEvent & { kind: "status" }, "kind" | "atMs">>,
): FakeTimelineEvent {
  return {
    atMs,
    kind: "status",
    workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    elapsedSeconds: 0,
    distanceMeters: 0,
    spm: 22,
    currentSplit: 120,
    heartRateBpm: 140,
    programIntervalIndex: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Wraps a transport so a test can count what the hook's driver actually
 *  did to the radio: how many wire writes the whole conversation produced
 *  (the double-fire pin's assertion), how many subscriptions are
 *  outstanding, and whether the hook hung up on unmount.
 *
 *  **The fake exposes no subscription introspection of its own** (the task
 *  brief says it does; it does not — `notifyCbs` is private and there is no
 *  accessor), so the counting lives here instead. Reported as a brief
 *  correction rather than by widening the fake's public surface for one
 *  test. */
function spyTransport(inner: Transport & FakeControls): Transport &
  FakeControls & {
    wireWrites: number;
    subscriptions: number;
    disconnects: number;
    scans: number;
    /** Drops General Status notifications on the floor from here on — a
     *  notification lost in the radio. The fake models the protocol
     *  correctly and so cannot be made to lose one on cue, which is
     *  exactly what the P3b walk needs: `program()`'s own leading
     *  Terminate makes a real PM report `terminated`, and that report
     *  would close the run through the ORDINARY path before the
     *  rejection this test is about ever surfaces. */
    deaf: boolean;
  } {
  const spy = {
    ...inner,
    wireWrites: 0,
    subscriptions: 0,
    disconnects: 0,
    scans: 0,
    deaf: false,
    async scan(): Promise<DiscoveredMonitor[]> {
      spy.scans += 1;
      return inner.scan();
    },
    async write(characteristicId: string, bytes: Uint8Array): Promise<void> {
      if (characteristicId === RECEIVE_CHARACTERISTIC_UUID) spy.wireWrites += 1;
      return inner.write(characteristicId, bytes);
    },
    subscribe(
      characteristicId: string,
      cb: (bytes: Uint8Array) => void,
    ): () => void {
      spy.subscriptions += 1;
      const off = inner.subscribe(characteristicId, (bytes) => {
        if (spy.deaf && characteristicId === GENERAL_STATUS_UUID) return;
        cb(bytes);
      });
      return () => {
        spy.subscriptions -= 1;
        off();
      };
    },
    async disconnect(): Promise<void> {
      spy.disconnects += 1;
      return inner.disconnect();
    },
  };
  return spy;
}

function harness(
  script: FakeScript,
  deps: Omit<MonitorSessionDeps, "createTransport"> = {},
) {
  const fake = createFakeTransport({ deviceName: DEVICE_NAME, ...script });
  const transport = spyTransport(fake);
  const rendered = renderHook(() =>
    useMonitorSession({
      createTransport: () => transport,
      now: () => t0,
      // The fake sends exactly one status alongside a terminate ack, and it
      // arrives before `terminate()` has registered its settle wait — so
      // the driver's default 3-tick settle would never resolve here.
      // `driver.test.ts`'s own `harness` makes the same call for the same
      // reason; the settle itself is pinned by that file, not this one.
      //
      // `prepareSettleTicks: 0` for the mirrored reason (session 4b's own
      // "detection row" passes exactly this): a program DISPATCHED while
      // the machine is still rowing — which every re-program test below
      // does — otherwise has to walk a ten-status-tick budget that belongs
      // to `driver.test.ts`'s subject, not this file's.
      driverOptions: { settleTicks: 0, prepareSettleTicks: 0 },
      ...deps,
    }),
  );
  return { fake, transport, ...rendered };
}

/** Drains the microtask queue generously — the whole prepare+send exchange
 *  is chunk-by-chunk microtask-hopped, never timed (`driver.test.ts`'s own
 *  `programAndArm` comment). */
async function flush(): Promise<void> {
  for (let i = 0; i < 200; i += 1) await Promise.resolve();
}

type Session = ReturnType<typeof harness>["result"];

async function connect(result: Session): Promise<void> {
  await act(async () => {
    await result.current.connect();
  });
}

/** One complete `program()` through the hook, driven to whatever end it
 *  reaches (armed, or a typed failure — the hook's `program()` never
 *  rejects; it maps).
 *
 *  Ticks, plural, and pumped rather than counted: the fake withholds its
 *  WAITTOBEGIN bundle until a real `tick()` (fix-round 1's F1 — see
 *  `FakeControls.tick`'s own doc comment), and a program DISPATCHED while
 *  the machine is still rowing additionally has to wait out the driver's
 *  own prepare-settle budget (design spec §1b) before its real send even
 *  goes out. `tick(0)` advances no scripted time, so pumping costs the
 *  script nothing. */
async function programAndArm(
  result: Session,
  fake: FakeControls,
  program: WorkoutProgram,
  identity: RunIdentity,
): Promise<void> {
  await act(async () => {
    let settled = false;
    const pending = result.current.program(program, identity).finally(() => {
      settled = true;
    });
    await flush();
    for (let i = 0; i < 25 && !settled; i += 1) {
      fake.tick(0);
      await flush();
    }
    await pending;
  });
}

function tick(fake: FakeControls, ms: number): void {
  act(() => {
    fake.tick(ms);
  });
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

describe("useMonitorSession: connect", () => {
  it("no transport on this platform: transport-missing, and no picker is opened", async () => {
    const { result } = renderHook(() =>
      useMonitorSession({ createTransport: () => null }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.phase).toBe("failed");
    expect(result.current.error).toStrictEqual({
      reason: "transport-missing",
      detail: "This device has no Bluetooth transport.",
    });
    expect(result.current.deviceName).toBeNull();
  });

  it("picking -> pairing, and the driver is built around the PICKED device's real name", async () => {
    const { result, transport } = harness({ program: TWO_INTERVALS });

    await connect(result);

    expect(result.current.phase).toBe("pairing");
    expect(result.current.deviceName).toBe(DEVICE_NAME);
    expect(result.current.error).toBeNull();
    expect(transport.scans).toBe(1);
  });

  it("a second connect while one is already up opens no second picker", async () => {
    const { result, transport } = harness({ program: TWO_INTERVALS });

    await connect(result);
    await connect(result);

    expect(transport.scans).toBe(1);
  });

  it("the rower dismisses the OS picker (NotFoundError): scan-dismissed, not an error about the machine", async () => {
    const dismissed = new Error("User cancelled the requestDevice() chooser.");
    dismissed.name = "NotFoundError";
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () =>
          stubRadio({ scan: () => Promise.reject(dismissed) }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.phase).toBe("failed");
    expect(result.current.error?.reason).toBe("scan-dismissed");
  });

  it("a picker that returns nothing at all is also scan-dismissed", async () => {
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => stubRadio({ scan: () => Promise.resolve([]) }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error?.reason).toBe("scan-dismissed");
  });

  it("Bluetooth switched off: bluetooth-off, even though the adapter throws the same NotFoundError name", async () => {
    const off = new Error("Bluetooth adapter not available.");
    off.name = "NotFoundError";
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => stubRadio({ scan: () => Promise.reject(off) }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toStrictEqual({
      reason: "bluetooth-off",
      detail: "Bluetooth isn't available.",
      raw: "Bluetooth adapter not available.",
    });
  });

  it("a rejection that isn't even an Error is still typed, with whatever it was kept verbatim", async () => {
    const { result } = renderHook(() =>
      useMonitorSession({
        // A plugin that rejects with a bare string — nothing in
        // `Transport`'s contract promises an `Error`.
        createTransport: () =>
          stubRadio({ scan: () => Promise.reject("le is not enabled") }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toStrictEqual({
      reason: "bluetooth-off",
      detail: "Bluetooth isn't available.",
      raw: "le is not enabled",
    });
  });

  it("a connect() that fails after the pick is typed too, with the raw string kept", async () => {
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () =>
          stubRadio({
            connect: () => Promise.reject(new Error("GATT operation failed")),
          }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toMatchObject({
      reason: "bluetooth-off",
      raw: "GATT operation failed",
    });
  });
});

describe("useMonitorSession: the default transport (no factory injected)", () => {
  it("no navigator.bluetooth at all: transport-missing", async () => {
    vi.stubGlobal("navigator", { ...navigator, bluetooth: undefined });
    const { result } = renderHook(() => useMonitorSession());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error?.reason).toBe("transport-missing");
    vi.unstubAllGlobals();
  });

  it("Chromium with a radio: the Web Bluetooth transport is built and its picker is opened", async () => {
    const cancelled = new Error("User cancelled the requestDevice() chooser.");
    cancelled.name = "NotFoundError";
    const requestDevice = vi.fn(() => Promise.reject(cancelled));
    vi.stubGlobal("navigator", { ...navigator, bluetooth: { requestDevice } });
    const { result } = renderHook(() => useMonitorSession());

    await act(async () => {
      await result.current.connect();
    });

    // The real adapter really was constructed and really did open the
    // browser's own chooser — the laptop path (interface-notes.md §17)
    // that the missing `transports/index.ts` seam (Task 8) will eventually
    // choose between.
    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(result.current.error?.reason).toBe("scan-dismissed");
    vi.unstubAllGlobals();
  });
});

/** A bare `Transport` for the connect-failure paths — the fake models a
 *  machine that is present and healthy, which is exactly what these tests
 *  need NOT to have. */
function stubRadio(over: Partial<Transport> = {}): Transport {
  return {
    scan: () => Promise.resolve([{ id: "x", name: DEVICE_NAME }]),
    connect: () => Promise.resolve(),
    write: () => Promise.resolve(),
    subscribe: () => () => undefined,
    disconnect: () => Promise.resolve(),
    onDisconnect: () => () => undefined,
    ...over,
  };
}

describe("useMonitorSession: the happy walk, on a real library workout", () => {
  /** Filling Low: 8:00 warmup (no rest) then 3 x 2000 m with 3:00 rest.
   *  Session-cumulative numbers throughout, the way the machine reports
   *  them; each boundary for an interval WITH a trailing rest is delivered
   *  while the machine already reads `resting`, because that is what the
   *  hardware does (interface-notes.md §18 #3, enforced by the fake). */
  function fillingLowTimeline(): FakeTimelineEvent[] {
    return [
      status(100, { elapsedSeconds: 240, distanceMeters: 800 }),
      status(200, { elapsedSeconds: 480, distanceMeters: 1600 }),
      {
        atMs: 200,
        kind: "boundary",
        actual: {
          index: 0,
          elapsedSeconds: 480,
          distanceMeters: 1600,
          avgSplit: 150,
          avgSpm: 22,
          avgHeartRateBpm: 140,
        },
        cumulativeElapsedSeconds: 480,
        cumulativeDistanceMeters: 1600,
      },
      status(300, {
        elapsedSeconds: 720,
        distanceMeters: 2600,
        programIntervalIndex: 1,
      }),
      status(400, {
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 1000,
        distanceMeters: 3600,
        spm: 0,
        currentSplit: 0,
        programIntervalIndex: 1,
      }),
      {
        atMs: 450,
        kind: "boundary",
        actual: {
          index: 1,
          elapsedSeconds: 480,
          distanceMeters: 2000,
          avgSplit: 120,
          avgSpm: 24,
          avgHeartRateBpm: 150,
        },
        cumulativeElapsedSeconds: 1140,
        cumulativeDistanceMeters: 3600,
      },
      status(500, {
        elapsedSeconds: 1380,
        distanceMeters: 4600,
        programIntervalIndex: 2,
      }),
      status(600, {
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 1700,
        distanceMeters: 5600,
        spm: 0,
        currentSplit: 0,
        programIntervalIndex: 2,
      }),
      {
        atMs: 650,
        kind: "boundary",
        actual: {
          index: 2,
          elapsedSeconds: 480,
          distanceMeters: 2000,
          avgSplit: 120,
          avgSpm: 24,
          avgHeartRateBpm: 155,
        },
        cumulativeElapsedSeconds: 1800,
        cumulativeDistanceMeters: 5600,
      },
      status(700, {
        elapsedSeconds: 2040,
        distanceMeters: 6600,
        programIntervalIndex: 3,
      }),
      status(800, {
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 2300,
        distanceMeters: 7600,
        spm: 0,
        currentSplit: 0,
        programIntervalIndex: 3,
      }),
      {
        atMs: 850,
        kind: "boundary",
        actual: {
          index: 3,
          elapsedSeconds: 480,
          distanceMeters: 2000,
          avgSplit: 120,
          avgSpm: 24,
          avgHeartRateBpm: 158,
        },
        cumulativeElapsedSeconds: 2460,
        cumulativeDistanceMeters: 7600,
      },
      status(900, {
        workoutState: WORKOUTSTATE_WORKOUTEND,
        elapsedSeconds: 2460,
        distanceMeters: 7600,
        spm: 0,
        currentSplit: 0,
        programIntervalIndex: 3,
      }),
    ];
  }

  it("picking -> pairing -> programming -> ready -> live -> ended, with the record written the whole way", async () => {
    const { result, fake } = harness({
      program: LIBRARY.program,
      events: fillingLowTimeline(),
    });

    await connect(result);
    expect(result.current.phase).toBe("pairing");

    await programAndArm(result, fake, LIBRARY.program, LIBRARY_IDENTITY);
    // `armed` — the driver's own event, emitted only after `verifyArmed`
    // has confirmed the machine holds THIS program's structure.
    expect(result.current.phase).toBe("ready");
    // Nothing is on record yet: a programmed-but-never-rowed workout leaves
    // no `MonitorRun` behind (and destroys no `SessionRun`).
    expect(loadMonitorRun()).toBeNull();

    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    expect(result.current.frame).toMatchObject({
      elapsedSeconds: 240,
      distanceMeters: 800,
      state: "rowing",
    });

    const opened = loadMonitorRun();
    expect(opened).toMatchObject({
      workoutId: "filling-low",
      title: "Filling Low",
      deviceName: DEVICE_NAME,
      startedAt: t0.toISOString(),
      completedAt: null,
      terminated: false,
    });
    expect(opened?.program.intervals).toHaveLength(4);

    for (let i = 0; i < 8; i += 1) tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    expect(result.current.actuals).toHaveLength(4);

    const closed = loadMonitorRun();
    expect(closed?.completedAt).toBe(t0.toISOString());
    // An honest WORKOUTEND, not a rower cutting it short — the distinction
    // 7C needs ("logged 4 of 4" vs "abandoned at 2").
    expect(closed?.terminated).toBe(false);
    expect(closed?.actuals).toHaveLength(4);
    expect(closed?.actuals[0]).toMatchObject({
      elapsedSeconds: 480,
      distanceMeters: 1600,
      avgSpm: 22,
    });
  });

  it("a boundary the machine reports after the run closed is never appended", async () => {
    const timeline = fillingLowTimeline();
    // One more boundary, after WORKOUTEND — the PM's own post-run
    // housekeeping, which the driver still emits (it never goes deaf) and
    // the record must still refuse.
    timeline.push({
      atMs: 1000,
      kind: "boundary",
      // Interval 0 (the warmup, no trailing rest) — the one index the fake
      // will deliver in a non-`resting` state, which is what a post-run
      // housekeeping boundary arriving on a FINISHED machine has to be.
      actual: {
        index: 0,
        elapsedSeconds: 12,
        distanceMeters: 40,
        avgSplit: 200,
        avgSpm: 18,
        avgHeartRateBpm: 90,
      },
      cumulativeElapsedSeconds: 2472,
      cumulativeDistanceMeters: 7640,
    });
    const { result, fake } = harness({
      program: LIBRARY.program,
      events: timeline,
    });

    await connect(result);
    await programAndArm(result, fake, LIBRARY.program, LIBRARY_IDENTITY);
    for (let i = 0; i < 11; i += 1) tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.actuals).toHaveLength(4);
    expect(loadMonitorRun()?.actuals).toHaveLength(4);
  });
});

describe("useMonitorSession: ending", () => {
  const timeline: FakeTimelineEvent[] = [
    status(100, { elapsedSeconds: 20, distanceMeters: 70 }),
    status(200, { elapsedSeconds: 40, distanceMeters: 140 }),
  ];

  it("the rower's End closes the record, terminates the erg, and reports endedBy user", async () => {
    const { result, fake, transport } = harness({
      program: TWO_INTERVALS,
      events: timeline,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    const before = transport.wireWrites;

    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("user");
    // A real terminate went out (the erg is left terminated, not still
    // counting) — the only write this action produces.
    expect(transport.wireWrites).toBeGreaterThan(before);
    expect(loadMonitorRun()).toMatchObject({
      completedAt: t0.toISOString(),
      terminated: true,
    });
  });

  it("End is idempotent against the terminal event its own terminate() provokes", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: timeline,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);

    // The fake reports TERMINATE the instant it acks the terminate frame,
    // so the driver emits `{kind: "terminated"}` while `endSession()` is
    // still awaiting — the exact race spec §2 requires this to survive.
    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.endedBy).toBe("user");
    expect(loadMonitorRun()?.completedAt).toBe(t0.toISOString());

    // ...and pressing it again does nothing at all.
    await act(async () => {
      await result.current.endSession();
    });
    expect(result.current.endedBy).toBe("user");
  });

  it("End after the link is gone attempts no terminate, and the run is still closeable", async () => {
    const { result, fake, transport } = harness({
      program: TWO_INTERVALS,
      events: timeline,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);

    act(() => {
      fake.injectDisconnect();
    });
    expect(result.current.phase).toBe("disconnected");
    // The record stays OPEN on a drop: the erg is still counting, and the
    // rower's recovery is End -> log (spec's lose-and-degrade).
    expect(loadMonitorRun()?.completedAt).toBeNull();
    const before = transport.wireWrites;

    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("user");
    expect(transport.wireWrites).toBe(before);
    expect(loadMonitorRun()).toMatchObject({
      completedAt: t0.toISOString(),
      terminated: true,
    });
  });

  it("the machine's own TERMINATE (ended on the PM5's menu) reaches ended too, marked terminated", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, { elapsedSeconds: 20, distanceMeters: 70 }),
        status(200, {
          workoutState: 11, // WORKOUTSTATE_TERMINATE
          elapsedSeconds: 40,
          distanceMeters: 140,
          spm: 0,
          currentSplit: 0,
        }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    expect(loadMonitorRun()).toMatchObject({
      completedAt: t0.toISOString(),
      terminated: true,
    });
  });
});

describe("useMonitorSession: the double-fire pin", () => {
  it("two program() calls on the same tick produce ONE wire conversation", async () => {
    const { result, fake, transport } = harness({ program: TWO_INTERVALS });
    await connect(result);
    const before = transport.wireWrites;

    // Both fired before anything is awaited — a double-tap on Try again,
    // or a component that fires its effect twice.
    let first: Promise<void> | null = null;
    let second: Promise<void> | null = null;
    await act(async () => {
      first = result.current.program(TWO_INTERVALS, TWO_IDENTITY);
      second = result.current.program(TWO_INTERVALS, TWO_IDENTITY);
    });

    // The moment that matters, read at the first render after both
    // presses: ONE attempt is under way and NOTHING has failed. This is
    // what the synchronous flip buys and the only place it is visible —
    // flip the phase one microtask late and the second call reaches the
    // driver, whose single-flight gate refuses it with `ProgramBusyError`.
    // The wire count would still come out right (the gate refuses before
    // any byte), but the rower gets a state-6 FAILED screen for a press
    // they were entitled to make, cleared a moment later by the first
    // call's own success.
    expect(result.current.phase).toBe("programming");
    expect(result.current.error).toBeNull();

    await act(async () => {
      await flush();
      fake.tick(0);
      await Promise.all([first, second]);
    });

    expect(result.current.phase).toBe("ready");
    expect(result.current.error).toBeNull();
    // One prepare frame + the programming sequence, once. A second
    // conversation would roughly double this; the exact count is the
    // program's own chunk count and is asserted as "the same as one call".
    const oneConversation = transport.wireWrites - before;
    expect(oneConversation).toBeGreaterThan(0);

    // What one conversation costs, measured against a fresh session
    // programming the same program exactly once.
    const solo = harness({ program: TWO_INTERVALS });
    await connect(solo.result);
    await programAndArm(solo.result, solo.fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(oneConversation).toBe(solo.transport.wireWrites);
  });
});

describe("useMonitorSession: failures", () => {
  it("a rejected program lands on failed with the machine's own typed reason and its hex trace", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      failNextProgramFrame: "reject",
    });
    await connect(result);

    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);

    expect(result.current.phase).toBe("failed");
    expect(result.current.error?.reason).toBe("nak");
    expect(result.current.error?.raw).toContain("write");
  });

  /**
   * `ProgramBusyError` is the DRIVER's single-flight gate, and the hook's
   * own synchronous phase flip is supposed to make it unreachable — a
   * rower's double-tap never gets that far (the pin above). What is left
   * is the window where the phase moves OFF `"programming"` for a reason
   * that is not the program finishing, and there is exactly one: a
   * terminal event for the run that is still open.
   *
   * That is session 3's own recorded shape, not a constructed one
   * (interface-notes.md §18 Step 5): `program-many` went out ~52 s into a
   * running workout and the trace shows `{"kind":"terminated"}` firing
   * MID-SEND. Here the piece ends on the machine while the new program is
   * still waiting for an ack, the hook honestly reports `ended`, and the
   * rower — looking at a session the app says is over — taps program
   * again. The driver refuses it before a single byte goes out.
   */
  it("busy: the piece ends on the machine mid-program and the rower fires again", async () => {
    const { result, fake, transport } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, { elapsedSeconds: 20, distanceMeters: 70 }),
        status(200, {
          workoutState: WORKOUTSTATE_WORKOUTEND,
          elapsedSeconds: 60,
          distanceMeters: 200,
          spm: 0,
          currentSplit: 0,
        }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");

    // The monitor stops answering (the link is UP — no disconnect; this is
    // the fake's `injectTimeout`, a mid-sequence silence), so the second
    // program never settles...
    fake.injectTimeout();
    let writesAtRetry = 0;
    await act(async () => {
      void result.current.program(TWO_INTERVALS, TWO_IDENTITY);
      await flush();
      // ...the piece ends on the machine while it is in flight...
      fake.tick(100);
      await flush();
      writesAtRetry = transport.wireWrites;
      // ...and the rower fires again.
      await result.current.program(TWO_INTERVALS, TWO_IDENTITY);
      await flush();
    });

    expect(result.current.error?.reason).toBe("busy");
    // Never "PM5 rejected"-class copy: the machine never saw this call...
    expect(result.current.error?.detail).not.toContain("PM5");
    // ...and no byte went out for it either.
    expect(transport.wireWrites).toBe(writesAtRetry);
  });

  it("program() with nothing connected is transport-missing, not a crash", async () => {
    const { result } = renderHook(() => useMonitorSession({}));

    await act(async () => {
      await result.current.program(TWO_INTERVALS, TWO_IDENTITY);
    });

    expect(result.current.phase).toBe("failed");
    expect(result.current.error?.reason).toBe("transport-missing");
  });

  it("an untyped throw out of program() is still typed by the time a screen sees it", async () => {
    const { result, fake } = harness({ program: TWO_INTERVALS });
    await connect(result);

    // D6: while the link is down every cached GATT handle is dead and a
    // write on one throws — `sendSequence` does not wrap that, so a raw
    // Error escapes `program()`. The record is not open yet, so no P3b
    // close is involved; this is purely the mapping.
    act(() => {
      fake.injectDisconnect();
    });
    await act(async () => {
      await result.current.program(TWO_INTERVALS, TWO_IDENTITY);
      await flush();
    });

    expect(result.current.phase).toBe("failed");
    expect(result.current.error?.reason).toBe("bluetooth-off");
    expect(result.current.error?.raw).toContain("no longer valid");
  });
});

describe("useMonitorSession: P3b — a failed program with a run open", () => {
  const liveTimeline: FakeTimelineEvent[] = [
    status(100, { elapsedSeconds: 20, distanceMeters: 70 }),
    // The machine finishes the piece it was still running, well after our
    // own record closed. The DRIVER's run is still open (it never saw the
    // terminate we sent — see the lost notification below), so it emits a
    // perfectly real `workoutComplete` here. That is the event the pin is
    // about.
    status(400, {
      workoutState: WORKOUTSTATE_WORKOUTEND,
      elapsedSeconds: 60,
      distanceMeters: 200,
      spm: 0,
      currentSplit: 0,
    }),
  ];

  it("closes the RECORD, terminates the erg, and IGNORES the terminal event that follows", async () => {
    const { result, fake, transport } = harness({
      program: TWO_INTERVALS,
      events: liveTimeline,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    expect(loadMonitorRun()?.completedAt).toBeNull();

    // The one thing standing between this walk and P3b: a real PM answers
    // `program()`'s leading Terminate by reporting `terminated`, which
    // would close the run through the ORDINARY path (a real event) before
    // the rejection ever surfaces. Lose that one notification — the radio
    // does — and the run is genuinely still open when the reject lands,
    // which is the state P3b is about. Everything else stays honest.
    transport.deaf = true;

    // A second program, rejected. `program()`'s own leading Terminate has
    // already torn down what was loaded by the time this surfaces — so
    // there is no reason for which keeping the run open is safe.
    fake.injectNak(0);
    const beforeRetry = transport.wireWrites;
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);

    expect(result.current.phase).toBe("failed");
    expect(result.current.error?.reason).toBe("nak");
    expect(loadMonitorRun()).toMatchObject({
      completedAt: t0.toISOString(),
      terminated: true,
    });
    // ...and the erg was left terminated rather than holding an orphan.
    // (The nak's own conversation plus this terminate; the count only has
    // to prove something further went out AFTER the rejection.)
    expect(transport.wireWrites).toBeGreaterThan(beforeRetry + 1);

    // THE PIN: the driver's own `activeRun` cannot be closed from outside,
    // so it will still report the run it considers open. Our record is
    // already finished — the phase must not move to "ended", and the
    // record must not be re-stamped.
    transport.deaf = false;
    for (let i = 0; i < 4; i += 1) tick(fake, 100);
    expect(result.current.phase).toBe("failed");
    expect(result.current.endedBy).toBeNull();
    expect(loadMonitorRun()?.completedAt).toBe(t0.toISOString());
  });

  it("on a disconnected rejection no terminate is attempted — but the record still closes", async () => {
    const { result, fake, transport } = harness({
      program: TWO_INTERVALS,
      events: liveTimeline,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    // Same lost notification as the walk above, and for the same reason:
    // without it the prepare's own Terminate closes the run through the
    // ordinary path and this is no longer a P3b walk at all.
    transport.deaf = true;

    await act(async () => {
      const pending = result.current.program(TWO_INTERVALS, TWO_IDENTITY);
      await flush();
      const atDrop = transport.wireWrites;
      fake.injectDisconnect();
      await pending;
      await flush();
      // The link is gone: nothing further was even attempted over it.
      expect(transport.wireWrites).toBe(atDrop);
    });

    expect(result.current.error?.reason).toBe("disconnected");
    expect(loadMonitorRun()).toMatchObject({
      completedAt: t0.toISOString(),
      terminated: true,
    });
  });
});

describe("useMonitorSession: cancel", () => {
  it("before programming, Cancel is free — no wire traffic, back to idle, radio released", async () => {
    const { result, transport } = harness({ program: TWO_INTERVALS });
    await connect(result);
    const before = transport.wireWrites;

    await act(async () => {
      await result.current.cancel();
    });

    expect(transport.wireWrites).toBe(before);
    expect(result.current.phase).toBe("idle");
    expect(result.current.deviceName).toBeNull();
    expect(transport.disconnects).toBe(1);
  });

  it("from ready, Cancel terminates what we armed and closes nothing (no run is open yet)", async () => {
    const { result, fake, transport } = harness({ program: TWO_INTERVALS });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    const before = transport.wireWrites;

    await act(async () => {
      await result.current.cancel();
    });

    expect(transport.wireWrites).toBeGreaterThan(before);
    expect(result.current.phase).toBe("idle");
    // Nothing of ours was lost: no run had opened, so there is no record to
    // close and none was written.
    expect(loadMonitorRun()).toBeNull();
  });

  it("once live, Cancel is inert — End owns that side", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.phase).toBe("live");
    expect(loadMonitorRun()?.completedAt).toBeNull();
  });
});

describe("useMonitorSession: the seams and their defaults", () => {
  it("no identity and no injected clock: the record still opens, anonymous and stamped now", async () => {
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      deviceName: DEVICE_NAME,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    // The log the diagnostics sheet (Task 7) will own: injected here, so
    // the caller — not this hook — decides what `exportLog()` reads.
    const log = createEventLog();
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => fake,
        createLog: () => log,
        driverOptions: { settleTicks: 0, prepareSettleTicks: 0 },
      }),
    );
    const before = Date.now();

    await connect(result);
    await act(async () => {
      let settled = false;
      const pending = result.current.program(TWO_INTERVALS).finally(() => {
        settled = true;
      });
      await flush();
      for (let i = 0; i < 25 && !settled; i += 1) {
        fake.tick(0);
        await flush();
      }
      await pending;
    });
    tick(fake, 100);

    const run = loadMonitorRun();
    expect(run).toMatchObject({ workoutId: null, title: "" });
    expect(Date.parse(run!.startedAt)).toBeGreaterThanOrEqual(before);
    // The injected log really is the one the driver wrote its trace into.
    expect(log.entries().length).toBeGreaterThan(0);
    expect(log.exportLog()).toContain("write");
  });

  it("a boundary arriving before the first stroke belongs to no record of ours", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        // The machine reports a split while still armed — a rower's own
        // JustRow auto-split, or post-terminate housekeeping. Interval 0
        // has no trailing rest, which is what lets the machine send this
        // outside a `resting` state at all.
        {
          atMs: 100,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: 30,
            distanceMeters: 100,
            avgSplit: 150,
            avgSpm: 20,
            avgHeartRateBpm: 120,
          },
          cumulativeElapsedSeconds: 30,
          cumulativeDistanceMeters: 100,
        },
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);

    tick(fake, 100);

    expect(result.current.phase).toBe("ready");
    expect(result.current.actuals).toStrictEqual([]);
    expect(loadMonitorRun()).toBeNull();
  });

  it("End at the ready screen: nothing to close, and the machine's answering terminate is ignored", async () => {
    const { result, fake } = harness({ program: TWO_INTERVALS });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");

    // No run ever opened (nobody rowed), so there is no record — and the
    // `terminated` the erg reports in answer to our own terminate must not
    // conjure one, nor re-end an already-ended session.
    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("user");
    expect(loadMonitorRun()).toBeNull();

    for (let i = 0; i < 3; i += 1) tick(fake, 100);
    expect(result.current.endedBy).toBe("user");
    expect(loadMonitorRun()).toBeNull();
  });

  it("a link that comes back by itself does NOT resume the session — reconnect is descoped", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, { elapsedSeconds: 20, distanceMeters: 70 }),
        status(200, { elapsedSeconds: 40, distanceMeters: 140 }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);

    act(() => {
      fake.injectDisconnect();
    });
    expect(result.current.phase).toBe("disconnected");

    // The driver DOES notice resumption and announces it (`reconnected`).
    // 7B ships lose-and-degrade (spec's C5 ruling): the hook hears it and
    // deliberately does nothing — no phase change, no resume, no promise
    // of one. Recovery is End -> log, or leave and re-Connect fresh.
    act(() => {
      fake.tick(100);
      fake.completeReconnect();
    });

    expect(result.current.phase).toBe("disconnected");
    expect(loadMonitorRun()?.completedAt).toBeNull();
  });

  it("a link drop after the session ended does not drag it back to disconnected", async () => {
    const { result, fake } = harness({ program: TWO_INTERVALS });
    await connect(result);
    await act(async () => {
      await result.current.endSession();
    });
    expect(result.current.phase).toBe("ended");

    act(() => {
      fake.injectDisconnect();
    });

    expect(result.current.phase).toBe("ended");
  });

  it("a radio that refuses to hang up does not take the unmount down with it", async () => {
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      deviceName: DEVICE_NAME,
    });
    const transport: Transport = {
      ...fake,
      scan: () => fake.scan(),
      write: (id, bytes) => fake.write(id, bytes),
      subscribe: (id, cb) => fake.subscribe(id, cb),
      disconnect: () => Promise.reject(new Error("radio is wedged")),
    };
    const { result, unmount } = renderHook(() =>
      useMonitorSession({ createTransport: () => transport, now: () => t0 }),
    );
    await connect(result);

    expect(() => {
      unmount();
    }).not.toThrow();
    // The rejection is swallowed rather than escaping as an unhandled one.
    await act(async () => {
      await flush();
    });
  });
});

describe("useMonitorSession: teardown", () => {
  it("unmount drops the listener and hangs up: a later boundary reaches no record", async () => {
    const { result, fake, transport, unmount } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, { elapsedSeconds: 20, distanceMeters: 70 }),
        {
          atMs: 200,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: 60,
            distanceMeters: 200,
            avgSplit: 150,
            avgSpm: 22,
            avgHeartRateBpm: 140,
          },
          cumulativeElapsedSeconds: 60,
          cumulativeDistanceMeters: 200,
        },
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(loadMonitorRun()?.actuals).toHaveLength(0);
    const subscriptionsWhileLive = transport.subscriptions;

    unmount();

    expect(transport.disconnects).toBe(1);
    // The machine keeps talking (the fake's own notifications are not
    // gated on our hang-up, exactly like a PM5 that hasn't noticed yet) —
    // and nothing of ours listens any more. localStorage is the witness: a
    // leaked listener would append this boundary to the record.
    fake.tick(100);
    expect(loadMonitorRun()?.actuals).toHaveLength(0);
    // The driver's OWN transport subscriptions are never released (it has
    // no API for that) — pinned as the honest current boundary, so a future
    // change that adds one is visible rather than silent.
    expect(transport.subscriptions).toBe(subscriptionsWhileLive);
  });
});

describe("useMonitorSession: coexistence with a phone SessionRun (Task 2's M-2)", () => {
  /** A `SessionRun` created the way `Countdown.tsx` creates one — the deep
   *  link that has NO cross-clear in front of it (only destruction is
   *  guarded, in both directions; the review explicitly declined to add a
   *  clear at Countdown). */
  function deepLinkedSessionRun(): SessionRun {
    const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low")!;
    const draft = buildDraft({
      id: "deep-link",
      title: w.title,
      type: w.type as WorkoutType,
      steps: w.steps,
    });
    return JSON.parse(
      JSON.stringify(buildRun(draft, baselines, t0)),
    ) as SessionRun;
  }

  it("a live SessionRun appearing mid-session corrupts nothing, and neither record clears the other", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, { elapsedSeconds: 20, distanceMeters: 70 }),
        status(150, { elapsedSeconds: 60, distanceMeters: 200 }),
        {
          atMs: 200,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: 60,
            distanceMeters: 200,
            avgSplit: 150,
            avgSpm: 22,
            avgHeartRateBpm: 140,
          },
          cumulativeElapsedSeconds: 60,
          cumulativeDistanceMeters: 200,
        },
        status(300, {
          workoutState: WORKOUTSTATE_WORKOUTEND,
          elapsedSeconds: 120,
          distanceMeters: 400,
          spm: 0,
          currentSplit: 0,
          programIntervalIndex: 1,
        }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    // Opening the monitor run cleared whatever phone session existed —
    // that is `createMonitorRun`'s documented, guarded destruction.
    expect(loadRun()).toBeNull();

    // ...and now a phone session appears anyway, from the one door that
    // has no cross-clear.
    const phone = deepLinkedSessionRun();
    saveRun(phone);

    for (let i = 0; i < 3; i += 1) tick(fake, 100);

    // The monitor side finished its own run, intact.
    expect(result.current.phase).toBe("ended");
    expect(result.current.actuals).toHaveLength(1);
    expect(loadMonitorRun()).toMatchObject({
      completedAt: t0.toISOString(),
      terminated: false,
    });
    expect(loadMonitorRun()?.actuals).toHaveLength(1);
    // ...and the phone's record is still exactly where it was. This hook
    // destroys nothing outside its own key once a session is under way.
    expect(loadRun()).toStrictEqual(phone);
  });
});

// ---------------------------------------------------------------------------
// The paused derivation, against the record
// ---------------------------------------------------------------------------

/** Frames lifted VERBATIM from `docs/monitor/sessions/pm5-session3-final.log.gz`
 *  (gzcat it; §18 session 3 names the file). Only the fields the predicate
 *  reads are kept — the log lines carry `intervalIndex`/`intervalRemaining`
 *  too, which are not part of the four metrics and are irrelevant here. */
function frame(over: Partial<MonitorFrame>): MonitorFrame {
  return {
    elapsedSeconds: 0,
    distanceMeters: 0,
    currentSplit: null,
    spm: null,
    heartRateBpm: null,
    intervalIndex: 0,
    intervalRemaining: null,
    state: "rowing",
    ...over,
  };
}

/** log lines 2836-2842: the last rowing frame of interval 0, the boundary's
 *  own reset frame (carrying the PREVIOUS interval's split and spm over a
 *  zeroed clock), THREE identical zeroed frames, then the clock resuming.
 *  The no-rest changeover — the recorded FALSE POSITIVE. */
const RECORDED_BOUNDARY_RESET: MonitorFrame[] = [
  frame({
    elapsedSeconds: 59.83,
    distanceMeters: 74.4,
    currentSplit: 338.97,
    spm: 66,
    heartRateBpm: 94,
  }),
  frame({
    elapsedSeconds: 0,
    distanceMeters: 0,
    currentSplit: 338.97,
    spm: 66,
    heartRateBpm: 94,
  }),
  frame({ currentSplit: 0, spm: 0, heartRateBpm: 94, intervalIndex: 1 }),
  frame({ currentSplit: 0, spm: 0, heartRateBpm: 94, intervalIndex: 1 }),
  frame({ currentSplit: 0, spm: 0, heartRateBpm: 91, intervalIndex: 1 }),
  frame({
    elapsedSeconds: 0.34,
    currentSplit: 0,
    spm: 0,
    heartRateBpm: 91,
    intervalIndex: 1,
  }),
];

/** log lines 3546-3552: the rower stops. Two moving frames, then the four
 *  metrics freeze at `57.78 / 108.4 / 236.75 / 16` — and stay frozen for
 *  215 consecutive frames (to line 3762), with the heart rate moving the
 *  whole time. spm PINNED at 16, not zeroed: the observation that killed
 *  the original `spm === 0` predicate. */
const RECORDED_STOP: MonitorFrame[] = [
  frame({
    elapsedSeconds: 57.04,
    distanceMeters: 107.3,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 82,
  }),
  frame({
    elapsedSeconds: 57.56,
    distanceMeters: 108.1,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 82,
  }),
  frame({
    elapsedSeconds: 57.78,
    distanceMeters: 108.4,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 82,
  }),
  frame({
    elapsedSeconds: 57.78,
    distanceMeters: 108.4,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 82,
  }),
  frame({
    elapsedSeconds: 57.78,
    distanceMeters: 108.4,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 81,
  }),
  frame({
    elapsedSeconds: 57.78,
    distanceMeters: 108.4,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 81,
  }),
  frame({
    elapsedSeconds: 57.78,
    distanceMeters: 108.4,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 60,
  }),
];

/** log lines 4631-4635: elapsed ticking BACKWARDS, twice — `0.75 -> 0.18`
 *  is the −0.57 s the spec's own M2 note cites. */
const RECORDED_BACKWARDS: MonitorFrame[] = [
  frame({ elapsedSeconds: 0.75, currentSplit: 0, spm: 0, heartRateBpm: 63 }),
  frame({ elapsedSeconds: 0.18, currentSplit: 0, spm: 0, heartRateBpm: 63 }),
];

function replay(frames: MonitorFrame[]): {
  runs: FreezeRun[];
  everPaused: boolean;
} {
  const runs: FreezeRun[] = [];
  let current: FreezeRun | null = null;
  for (const f of frames) {
    current = nextFreezeRun(current, f);
    runs.push(current);
  }
  return { runs, everPaused: runs.some(isPausedRun) };
}

describe("the paused derivation, replayed frame by frame from the record", () => {
  it("the recorded no-rest boundary reset NEVER fires it — three identical frames, one short", () => {
    const { runs, everPaused } = replay(RECORDED_BOUNDARY_RESET);

    expect(everPaused).toBe(false);
    // Exactly how close it gets: the margin is one frame wide, and it is
    // the record's margin, not a chosen one.
    expect(Math.max(...runs.map((r) => r.frames))).toBe(3);
  });

  it("the recorded stop DOES fire it, on the fourth frozen frame", () => {
    const { runs, everPaused } = replay(RECORDED_STOP);

    expect(everPaused).toBe(true);
    // Frames 0-1 are still moving; the freeze starts at index 2, so the
    // fourth frozen frame is index 5.
    expect(runs.map(isPausedRun)).toStrictEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it("heart rate is not one of the four: the stop holds through every HR change in it", () => {
    // The last recorded frame of the stop fixture drops HR from 81 to 60
    // while the four stay frozen — if HR were in the key, the rower would
    // flicker out of PAUSED every few frames for the whole 215-frame stop.
    const { runs } = replay(RECORDED_STOP);
    expect(isPausedRun(runs[runs.length - 1]!)).toBe(true);
  });

  it("a backwards elapsed tick is a CHANGE, not a hold", () => {
    const frozen: FreezeRun = { key: "", frames: 0 };
    const first = nextFreezeRun(frozen, RECORDED_BACKWARDS[0]!);
    const second = nextFreezeRun(first, RECORDED_BACKWARDS[1]!);

    expect(second.frames).toBe(1);
    expect(isPausedRun(second)).toBe(false);
  });

  it("a non-rowing frame resets the count outright — a rest cannot lend its frames to the next stroke", () => {
    // Three frozen rowing frames, a rest, then the same frozen values
    // again. Merely NOT COUNTING the rest would leave the run standing and
    // let that fourth frame tip the session into PAUSED across a
    // changeover — which is the false positive the whole derivation exists
    // to avoid. The rest has to clear it.
    const rowing = frame({
      elapsedSeconds: 10,
      distanceMeters: 30,
      currentSplit: 120,
      spm: 20,
    });
    const resting = frame({ state: "resting", currentSplit: 0, spm: 0 });
    let run: FreezeRun | null = null;
    for (let i = 0; i < 3; i += 1) run = nextFreezeRun(run, rowing);
    expect(run!.frames).toBe(3);

    run = nextFreezeRun(run, resting);
    expect(run.frames).toBe(0);

    run = nextFreezeRun(run, rowing);
    expect(run.frames).toBe(1);
    expect(isPausedRun(run)).toBe(false);
  });
});

describe("useMonitorSession: paused, end to end", () => {
  /** The recorded stop, delivered as real status ticks through the fake so
   *  the whole path — wire bytes, driver, hook — is exercised, not just the
   *  predicate. */
  it("four frozen frames put the session in paused; the next change puts it back", async () => {
    const frozen = {
      elapsedSeconds: 57.78,
      distanceMeters: 108.4,
      currentSplit: 236,
      spm: 16,
    };
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, {
          elapsedSeconds: 57.04,
          distanceMeters: 107.3,
          spm: 16,
          currentSplit: 236,
        }),
        status(200, frozen),
        status(300, frozen),
        status(400, frozen),
        status(500, frozen),
        status(600, { ...frozen, elapsedSeconds: 58.3, distanceMeters: 109 }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);

    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    tick(fake, 100);
    tick(fake, 100);
    tick(fake, 100);
    // Three frozen frames is still LIVE — the boundary-reset margin.
    expect(result.current.phase).toBe("live");

    tick(fake, 100);
    expect(result.current.phase).toBe("paused");

    tick(fake, 100);
    expect(result.current.phase).toBe("live");
  });

  it("the recorded no-rest boundary reset keeps the session LIVE all the way through", async () => {
    // The same shape the log shows at the changeover: the reset frame
    // carrying the previous interval's split/spm, then three identical
    // zeroed frames, then the clock resuming.
    const zeroed = {
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: 0,
      currentSplit: 0,
      programIntervalIndex: 1,
    };
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, {
          elapsedSeconds: 59.83,
          distanceMeters: 74.4,
          spm: 66,
          currentSplit: 338,
        }),
        status(200, {
          elapsedSeconds: 0,
          distanceMeters: 0,
          spm: 66,
          currentSplit: 338,
          programIntervalIndex: 1,
        }),
        status(300, zeroed),
        status(400, zeroed),
        status(500, zeroed),
        status(600, { ...zeroed, elapsedSeconds: 0.34 }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);

    for (let i = 0; i < 6; i += 1) {
      tick(fake, 100);
      expect(result.current.phase).toBe("live");
    }
  });
});
