import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKOUTSTATE_INTERVALREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_TERMINATE,
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
import type { LogSeed } from "../session/logDraft";
import { loadRun, saveRun, type SessionRun } from "../session/run";
import { createEventLog } from "./eventLog";
import { loadMonitorRun } from "./monitorRun";
import { buildMonitorLogSteps } from "../session/logDraft";
import { monitorModeRun } from "../session/LogSession";
import {
  createFakeTransport,
  type FakeControls,
  type FakeScript,
  type FakeTimelineEvent,
} from "./transports/fake";
import {
  isPausedRun,
  nextFreezeRun,
  nextRowingStreak,
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

// 7C Task 1: `RunIdentity.logSeed` is REQUIRED now (this file's own
// `RunIdentity` doc comment explains why — the same silent-failure
// reasoning as `identity` itself). This suite's subject is the hook's state
// machine, not seed content, so one placeholder object fills every identity
// fixture below via a spread, rather than a bespoke seed per test.
// DELIBERATELY NON-EMPTY (not `{ steps: [], paces: {} }`): the hook's own
// `identityRef`/`ANONYMOUS_RUN` fallback (`useMonitorSession.ts`) uses an
// EMPTY seed for its "never actually read" placeholder, and an empty
// `TEST_SEED` here would be structurally indistinguishable from that
// fallback silently winning instead of the real `identity.logSeed` being
// threaded through — a mutation that swapped one for the other passed
// every test in this file until this fixture grew real content.
const TEST_SEED: { logSeed: LogSeed } = {
  logSeed: {
    steps: [{ label: "8:00 warm-up", kind: "warmup" }],
    paces: { k6: 120 },
  },
};

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
  // 2026-08-09's warmup setting: Filling Low's 8:00 warm-up is the rower's
  // PREFERENCE now, not a `wu` step in the seed — `buildRun`'s fourth
  // argument is its one producer. The compiled program is identical to
  // what this fixture always produced (interval 0 = time 480, then 3 x
  // distance 2000), so every index and count below is unchanged.
  const compiled = compileProgram(
    buildRun(draft, baselines, t0, { kind: "time", minutes: 8 }).phases,
  );
  if ("code" in compiled) {
    throw new Error(`fixture failed to compile: ${compiled.code}`);
  }
  return { program: compiled, title: w.title, id: "filling-low" };
}

const LIBRARY = fillingLow();
const LIBRARY_IDENTITY: RunIdentity = {
  workoutId: LIBRARY.id,
  title: LIBRARY.title,
  ...TEST_SEED,
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

const TWO_IDENTITY: RunIdentity = {
  workoutId: "two",
  title: "Two Intervals",
  ...TEST_SEED,
};

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
 *  The fake has since grown its own `subscriptionCount()` accessor (Task 8,
 *  for the parked-pin work), but this spy predates it and stays: it also
 *  counts wire writes, disconnects, and scans — none of which the fake
 *  exposes — and it wraps ANY transport, not only the fake. */
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
    /** Delivers notifications on a LATER microtask instead of inline
     *  inside `write()` — the fix wave's H1 pin. The fake answers a
     *  terminate synchronously (`onArmedFrameComplete` echoes the ack AND
     *  the `WORKOUTSTATE_TERMINATE` status before `write()` returns
     *  anything), and that single fake-only property is what made
     *  MEDIUM-9's double terminate unreachable from this file. A real PM5
     *  delivers both as later BLE notifications; with this set, `cancel()`
     *  genuinely suspends on `await driver.terminate()` with the phase
     *  still reading `"ready"`, which is the window an interleaved unmount
     *  lands in. */
    deferNotifications: boolean;
  } {
  const spy = {
    ...inner,
    wireWrites: 0,
    subscriptions: 0,
    disconnects: 0,
    scans: 0,
    deaf: false,
    deferNotifications: false,
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
        if (spy.deferNotifications) {
          queueMicrotask(() => cb(bytes));
          return;
        }
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

  it("iOS declines the Bluetooth permission: permission-denied, with the §7 door copy", async () => {
    const denied = Object.assign(new Error("BLE permission denied"), {
      name: "BluetoothPermissionError",
    });
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () =>
          stubRadio({ scan: () => Promise.reject(denied) }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toStrictEqual({
      reason: "permission-denied",
      detail:
        "Ergomatic can't reach your PM5 without Bluetooth. Allow Bluetooth for Ergomatic in Settings, then come back and try again.",
      raw: "BLE permission denied",
    });
  });

  it("ORDERING PIN: a BluetoothPermissionError whose message ALSO matches the bluetooth-off regex still classifies permission-denied", async () => {
    const denied = Object.assign(
      new Error("BLE permission denied (adapter unavailable)"),
      { name: "BluetoothPermissionError" },
    );
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () =>
          stubRadio({ scan: () => Promise.reject(denied) }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error?.reason).toBe("permission-denied");
  });

  it("a scan that times out: scan-dismissed, with its own detail line", async () => {
    const timedOut = Object.assign(new Error("scan timed out"), {
      name: "ScanTimeoutError",
    });
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () =>
          stubRadio({ scan: () => Promise.reject(timedOut) }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toStrictEqual({
      reason: "scan-dismissed",
      detail: "The search took too long. Try again.",
      raw: "scan timed out",
    });
  });

  it("the plugin's own native connect timeout ('Connection timeout.', 10s, Plugin.swift CONNECTION_TIMEOUT): link-failed with the retry, never a hang and never mis-binned by the regexes (ecosystem review R2)", async () => {
    const nativeTimeout = new Error("Connection timeout.");
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () =>
          stubRadio({ connect: () => Promise.reject(nativeTimeout) }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toStrictEqual({
      reason: "link-failed",
      detail: "The link to the monitor failed.",
      raw: "Connection timeout.",
    });
    expect(result.current.phase).toBe("failed");
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

    // `link-failed`, NOT `bluetooth-off`: the picker worked and the rower
    // picked a device, so the adapter is demonstrably fine — telling them
    // to check Bluetooth would be advice for a problem they do not have
    // (task-4 review, MEDIUM-4).
    expect(result.current.error).toStrictEqual({
      reason: "link-failed",
      detail: "The link to the monitor failed.",
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
  /** Filling Low: 8:00 warmup (no rest) then 4 x 2000 m with 3:00 rest
   *  (retuned from 3 reps in Task 3, 2026-08-10 library-rebalance, to
   *  reach its new 45-60 band). Session-cumulative numbers throughout, the
   *  way the machine reports them; each boundary for an interval WITH a
   *  trailing rest is delivered while the machine already reads `resting`,
   *  because that is what the hardware does (interface-notes.md §18 #3,
   *  enforced by the fake). */
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
      // The fourth rep (index 4), following the same per-rep pattern every
      // earlier rep used: +240s/+1000m into the work, +520s/+2000m into the
      // trailing rest, +660s/+2000m cumulative at the boundary (480s work +
      // 180s rest, 2000m of it banked).
      status(900, {
        elapsedSeconds: 2700,
        distanceMeters: 8600,
        programIntervalIndex: 4,
      }),
      status(1000, {
        workoutState: WORKOUTSTATE_INTERVALREST,
        elapsedSeconds: 2980,
        distanceMeters: 9600,
        spm: 0,
        currentSplit: 0,
        programIntervalIndex: 4,
      }),
      {
        atMs: 1050,
        kind: "boundary",
        actual: {
          index: 4,
          elapsedSeconds: 480,
          distanceMeters: 2000,
          avgSplit: 120,
          avgSpm: 24,
          avgHeartRateBpm: 161,
        },
        cumulativeElapsedSeconds: 3120,
        cumulativeDistanceMeters: 9600,
      },
      status(1100, {
        workoutState: WORKOUTSTATE_WORKOUTEND,
        elapsedSeconds: 3120,
        distanceMeters: 9600,
        spm: 0,
        currentSplit: 0,
        programIntervalIndex: 4,
      }),
    ];
  }

  it("a rowing-state frame without FLYWHEEL evidence holds ready, even with the workout clock running — the real PM5 runs the clock at 'row to begin' (the two 2026-08-08 recordings)", async () => {
    // The regression the erg found TWICE: first the state ordinal alone
    // (a just-armed PM5 reports a rowing-mapped state before any pull),
    // then elapsed (the PM5 runs the workout clock at row-to-begin:
    // TOTAL LEFT read 1:52 with 0 meters and rate 0). Only flywheel
    // evidence — banked distance or a registered stroke rate — is the
    // pull, and only the pull may open the record.
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, {
          elapsedSeconds: 0,
          distanceMeters: 0,
          spm: 0,
          currentSplit: 0,
        }),
        // The clock runs; the flywheel has not moved. Still not a pull.
        status(200, {
          elapsedSeconds: 8,
          distanceMeters: 0,
          spm: 0,
          currentSplit: 0,
        }),
        status(300, { elapsedSeconds: 8.4, distanceMeters: 1.1, spm: 14 }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");

    tick(fake, 100);
    // Rowing state, no flywheel evidence: still READY, still no record.
    expect(result.current.phase).toBe("ready");
    expect(loadMonitorRun()).toBeNull();

    tick(fake, 100);
    // The clock advancing on its own is STILL not a pull.
    expect(result.current.phase).toBe("ready");
    expect(loadMonitorRun()).toBeNull();

    tick(fake, 100);
    // Banked distance and a stroke rate: the pull, at last.
    expect(result.current.phase).toBe("live");
    expect(loadMonitorRun()).not.toBeNull();
  });

  it("the COASTING flywheel holds ready — meters accrue, but 0x0031's own Rowing State byte says Inactive (walk 3: 'the pm5 knew i didnt start the interval')", async () => {
    // The mid-session reprogram capture, verbatim shape: one tick after
    // armed, `state=rowing elapsed=0.78 distance=1.2` — real meters,
    // banked by a wheel still spinning from the previous piece, on a
    // workout the PM5's own glass did not consider started. Flywheel
    // evidence alone is not enough; the machine's Active declaration is
    // the third required leg.
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, {
          elapsedSeconds: 0.78,
          distanceMeters: 1.2,
          spm: 0,
          currentSplit: 0,
          rowingState: 0,
        }),
        status(200, {
          elapsedSeconds: 1.5,
          distanceMeters: 3.4,
          spm: 18,
          rowingState: 1,
        }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");

    tick(fake, 100);
    // Meters on the wire, Inactive on the machine's own byte: the coast.
    expect(result.current.phase).toBe("ready");
    expect(loadMonitorRun()).toBeNull();

    tick(fake, 100);
    // Active + a stroke: the rower, not the wheel.
    expect(result.current.phase).toBe("live");
    expect(loadMonitorRun()).not.toBeNull();
  });

  it("a CARRIED-OVER stroke rate is not flywheel evidence: Active plus spm with zero distance holds ready (erg-day review, MEDIUM-2)", async () => {
    // `spm > 0` used to be a disjunctive second form of flywheel evidence.
    // The record kills it: at `pm5-session3-final.log:5582` an `idle ->
    // armed` frame reads `distance 0 / split 413.4 / spm 43`, and at the
    // no-rest boundary (`:2837`) a ROWING frame reads `distance 0 / split
    // 338.97 / spm 66` — both the PREVIOUS piece's rate over a zeroed
    // clock and a zeroed distance. Walk 1 recorded the same thing
    // independently (the rate holds its last value through a stop). So a
    // frame that lands rowing-mapped and Active while spm is still pinned
    // carries no evidence at all about THIS piece; only banked distance
    // does, and every real first-rowing frame in the record has it.
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        // Line 2837's shape exactly, with the Active byte set — the
        // strongest form of the mistake, since two of three legs pass.
        status(100, {
          elapsedSeconds: 0,
          distanceMeters: 0,
          currentSplit: 338.97,
          spm: 66,
          rowingState: 1,
        }),
        status(200, {
          elapsedSeconds: 0.34,
          distanceMeters: 0,
          currentSplit: 338.97,
          spm: 66,
          rowingState: 1,
        }),
        // Meters at last: the pull.
        status(300, {
          elapsedSeconds: 0.84,
          distanceMeters: 1.9,
          currentSplit: 338.97,
          spm: 66,
          rowingState: 1,
        }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);

    tick(fake, 100);
    expect(result.current.phase).toBe("ready");
    expect(loadMonitorRun()).toBeNull();
    tick(fake, 100);
    expect(result.current.phase).toBe("ready");
    expect(loadMonitorRun()).toBeNull();

    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    expect(loadMonitorRun()).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // The `rowingActive` fallback (erg-day review, HIGH-1)
  // -------------------------------------------------------------------------
  //
  // The gate's Active leg rests on a byte the repo has never captured on a
  // real first-pull frame, and the replay of session 3 shows the OTHER two
  // legs are satisfied on the first rowing frame of all eight recorded arms
  // — so a stuck Inactive byte would silently produce no record at all for
  // a whole piece. Five consecutive strictly-progressing rowing frames
  // promote anyway. See `ROWING_ACTIVE_FALLBACK_FRAMES`.

  function logKinds(result: Session): string[] {
    return (JSON.parse(result.current.exportLog()) as { kind: string }[]).map(
      (e) => e.kind,
    );
  }

  it("the STUCK Inactive byte does not cost the session: five frames of strictly increasing distance promote to live anyway, and the log says so", async () => {
    // The unobserved-premise failure, made survivable. `rowingState: 0` on
    // every frame — a real rower whose PM5 never declares Active.
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, { elapsedSeconds: 0.5, distanceMeters: 1.2, spm: 0 }),
        status(200, { elapsedSeconds: 1.0, distanceMeters: 2.5, spm: 14 }),
        status(300, { elapsedSeconds: 1.5, distanceMeters: 4.1, spm: 18 }),
        status(400, { elapsedSeconds: 2.0, distanceMeters: 6.0, spm: 20 }),
        status(500, { elapsedSeconds: 2.5, distanceMeters: 8.2, spm: 21 }),
      ].map((e) => ({ ...e, rowingState: 0 })),
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");

    // Frames 1-4: the streak is building and the machine still says
    // Inactive, so READY holds — the coast is still refused this whole time.
    for (let i = 0; i < 4; i += 1) {
      tick(fake, 100);
      expect(result.current.phase).toBe("ready");
      expect(loadMonitorRun()).toBeNull();
    }
    expect(logKinds(result)).not.toContain("rowing-active-fallback");

    // Frame 5 — five consecutive strictly-progressing rowing frames. The
    // record opens even though `rowingActive` never once read true.
    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    expect(result.current.frame?.rowingActive).toBe(false);
    const opened = loadMonitorRun();
    expect(opened).not.toBeNull();
    expect(opened?.completedAt).toBeNull();

    // The one entry the hook itself writes: what a stashed trace needs to
    // answer "did the machine ever say Active?" after the fact.
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const fallback = entries.filter((e) => e.kind === "rowing-active-fallback");
    expect(fallback).toHaveLength(1);
    expect(fallback[0]!.detail).toContain("rowingActive=false");
    expect(fallback[0]!.detail).toContain("distance=8.2");
    expect(fallback[0]!.detail).toContain("state=rowing");
  });

  it("the COASTING flywheel, extended: meters that stop climbing break the streak, and ready holds indefinitely", async () => {
    // Walk 3's coast, run past the fallback's own window. The wheel banks
    // two more meters and then stalls — from there no frame can strictly
    // beat the one before it, so the streak restarts at one every frame and
    // never reaches five. This is the whole reason the fallback keys on
    // STRICT increase rather than on "a rowing frame".
    const stalled = [4.7, 4.7, 4.7, 4.7, 4.7, 4.7, 4.7];
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, { elapsedSeconds: 0.78, distanceMeters: 1.2, spm: 0 }),
        status(200, { elapsedSeconds: 1.3, distanceMeters: 3.1, spm: 0 }),
        status(300, { elapsedSeconds: 1.8, distanceMeters: 4.7, spm: 0 }),
        ...stalled.map((d, i) =>
          status(400 + i * 100, {
            elapsedSeconds: 2.3 + i * 0.5,
            distanceMeters: d,
            spm: 0,
          }),
        ),
      ].map((e) => ({ ...e, rowingState: 0 })),
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);

    // Ten frames — twice the fallback's window — and the session never
    // leaves ready.
    for (let i = 0; i < 10; i += 1) {
      tick(fake, 100);
      expect(result.current.phase).toBe("ready");
      expect(loadMonitorRun()).toBeNull();
    }
    expect(logKinds(result)).not.toContain("rowing-active-fallback");
  });

  it("the INSTANT path is untouched: Active plus banked distance promotes on the very first frame, with no fallback entry", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, {
          elapsedSeconds: 0.6,
          distanceMeters: 2.7,
          spm: 0,
          rowingState: 1,
        }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");

    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    expect(loadMonitorRun()).not.toBeNull();
    // The fallback never ran: the machine's own word was there on frame one.
    expect(logKinds(result)).not.toContain("rowing-active-fallback");
  });

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
    expect(opened?.program.intervals).toHaveLength(5);
    // 7C Task 1: `identity.logSeed` (the caller's `RunIdentity`) is threaded
    // straight through onto the record `createMonitorRun` writes — not
    // dropped, not re-derived from the program.
    expect(opened?.v).toBe(2);
    expect(opened?.logSeed).toStrictEqual(LIBRARY_IDENTITY.logSeed);

    for (let i = 0; i < 10; i += 1) tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    expect(result.current.actuals).toHaveLength(5);

    const closed = loadMonitorRun();
    expect(closed?.completedAt).toBe(t0.toISOString());
    // An honest WORKOUTEND, not a rower cutting it short — the distinction
    // 7C needs ("logged 5 of 5" vs "abandoned at 2").
    expect(closed?.terminated).toBe(false);
    expect(closed?.actuals).toHaveLength(5);
    expect(closed?.actuals[0]).toMatchObject({
      elapsedSeconds: 480,
      distanceMeters: 1600,
      avgSpm: 22,
    });
  });

  it("WALK 5: the final interval's split pair arrives AFTER the finish and still reaches the record", async () => {
    // The end-to-end shape of the walk's own defect (2026-08-10, phone BLE,
    // PM5 432331249 — interface-notes.md §21 item 4): a single 1:00 interval rowed to completion, both split
    // frames delivered 1 ms apart AFTER the general-status frame that ended
    // the workout — and 7C's log screen prefilled "0 OF 1 INTERVALS
    // MEASURED" with the actual sitting in the wire trace. Against the
    // pre-walk-5 code this test fails on `actuals`: the hook has already
    // closed the record by the time the boundary arrives, and the driver has
    // already stripped its index.
    const oneInterval: WorkoutProgram = {
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
    const { result, fake } = harness({
      program: oneInterval,
      events: [
        status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
        // The finish...
        status(200, {
          workoutState: WORKOUTSTATE_WORKOUTEND,
          elapsedSeconds: 60,
          distanceMeters: 200,
          spm: 0,
          currentSplit: 0,
        }),
        // ...and the interval's own data, in the same gap before the
        // machine's next sample, exactly as the capture has it.
        {
          atMs: 200,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: 60,
            distanceMeters: 200,
            avgSplit: 120,
            avgSpm: 24,
            avgHeartRateBpm: 142,
          },
          cumulativeElapsedSeconds: 60,
          cumulativeDistanceMeters: 200,
        },
      ],
    });

    await connect(result);
    await programAndArm(result, fake, oneInterval, {
      workoutId: "walk-5",
      title: "1:00",
      ...TEST_SEED,
    });
    for (let i = 0; i < 3; i += 1) tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    expect(result.current.actuals).toHaveLength(1);
    expect(result.current.actuals[0]).toMatchObject({
      index: 0,
      avgSpm: 24,
      distanceMeters: 200,
    });
    // The RECORD is what 7C prefills from — "1 of 1", not "0 of 1".
    const closed = loadMonitorRun();
    expect(closed?.completedAt).toBe(t0.toISOString());
    expect(closed?.terminated).toBe(false);
    expect(closed?.actuals).toHaveLength(1);
    expect(closed?.actuals[0]).toMatchObject({ index: 0, avgSpm: 24 });
  });

  it("a boundary the machine reports after the run closed is never appended", async () => {
    const timeline = fillingLowTimeline();
    // One more boundary, after WORKOUTEND — the PM's own post-run
    // housekeeping, which the driver still emits (it never goes deaf) and
    // the record must still refuse.
    timeline.push({
      atMs: 1200,
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
      cumulativeElapsedSeconds: 3132,
      cumulativeDistanceMeters: 9640,
    });
    const { result, fake } = harness({
      program: LIBRARY.program,
      events: timeline,
    });

    await connect(result);
    await programAndArm(result, fake, LIBRARY.program, LIBRARY_IDENTITY);
    for (let i = 0; i < 13; i += 1) tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.actuals).toHaveLength(5);
    expect(loadMonitorRun()?.actuals).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// HARDWARE WALK DAY 2 (2026-08-11, phone BLE, PM5 432331249). Walk 5's
// driver-level finish grace shipped and the save screen STILL read "0 OF 1
// INTERVALS MEASURED" after a completed 1:00 piece. The grace never got a
// chance: the machine's `finished` tick flips this hook to `ended`, the
// surface fires `onEnded` on that render, the caller navigates, the
// interstitial unmounts, and `teardown` unsubscribes the driver listener and
// hangs up the radio — all inside the microtask flush that follows the tick,
// i.e. before the split pair the PM5 sends ~1 ms later can arrive. The
// rowed-log stash (exported inside that same `teardown`) proved it by what
// it did NOT contain: `terminal finished` was its last entry, no split of any
// kind after it.
// ---------------------------------------------------------------------------

describe("useMonitorSession: the ended hand-off waits for the last split (walk day 2)", () => {
  /** The walk's own piece: one 1:00 interval, rowed out. */
  const ONE_INTERVAL: WorkoutProgram = {
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
  /** A seed whose one WORK step aligns with the program's one interval —
   *  `TEST_SEED`'s placeholder is a warm-up, and `buildMonitorLogSteps`
   *  skips warm-ups, so a run seeded with it has no log step for the
   *  measured interval to land in. The whole point of this block is what
   *  the log screen ends up showing, so its fixture has to be able to show
   *  something. */
  const ONE_IDENTITY: RunIdentity = {
    workoutId: "walk-day-2",
    title: "1:00",
    logSeed: {
      steps: [{ label: "1:00 at 2k+4", kind: "work" }],
      paces: { k2: 112 },
    },
  };

  /** The final interval's own boundary, as the fake puts it on the wire. */
  function finalBoundary(atMs: number): FakeTimelineEvent {
    return {
      atMs,
      kind: "boundary",
      actual: {
        index: 0,
        elapsedSeconds: 60,
        distanceMeters: 200,
        avgSplit: 120,
        avgSpm: 24,
        avgHeartRateBpm: 142,
      },
      cumulativeElapsedSeconds: 60,
      cumulativeDistanceMeters: 200,
    };
  }

  function finishedAt(atMs: number): FakeTimelineEvent {
    return status(atMs, {
      workoutState: WORKOUTSTATE_WORKOUTEND,
      elapsedSeconds: 60,
      distanceMeters: 200,
      spm: 0,
      currentSplit: 0,
    });
  }

  /** A hand-driven stand-in for `setTimeout`, so the hold's backstop is a
   *  thing a test FIRES rather than waits for. Records every schedule so a
   *  test can assert the delay and whether it was cancelled. */
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
      /** The most recent, still-live timer. */
      pending(): { ms: number; fire: () => void; cancelled: boolean } | null {
        const live = calls.filter((c) => !c.cancelled);
        return live[live.length - 1] ?? null;
      },
    };
  }

  it("THE WALK DAY 3 SEQUENCE, replayed: finished -> the PM's own repeat ticks -> the split -> recorded, with the hand-off held across all of it", async () => {
    // The device stash, event for event (2026-08-11, PM5 432331249): the
    // terminal frame, the machine's own repeat `finished` samples, THEN the
    // split pair — and under either of the two tick-keyed bounds this used
    // to carry (the hook's next-tick release, the driver's next-sample grace
    // expiry) the run's own actual was refused with `index=null` while the
    // bytes sat in the trace. Both bounds are clocks now, and the repeat
    // ticks below are the regression: they must move nothing.
    const timer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
          // The PM5 keeps reporting `finished` while it sits in
          // WorkoutLogged (§19.4) — the frames that used to end the wait.
          finishedAt(250),
          finishedAt(300),
          finishedAt(350),
          // ...and only now the pair the whole chain exists for.
          finalBoundary(400),
        ],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);

    // The machine has finished. The session is ENDED — the rower sees that
    // frame immediately, exactly as before — but the HAND-OFF is held.
    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    expect(result.current.handoffHeld).toBe(true);
    expect(result.current.actuals).toHaveLength(0);
    expect(loadMonitorRun()?.actuals).toHaveLength(0);
    // 3500, not the driver's 3000: the hold must STRICTLY outlive the
    // finish grace since fast-follow Task 2, because the summary fallback
    // fills the final interval AT the grace's expiry and that fill has to
    // beat the navigation this hold is what delays (`FINISH_HANDOFF_HOLD_MS`
    // and `FINISH_GRACE_MS` both carry the reasoning).
    expect(timer.pending()?.ms).toBe(3500);

    // Three more `finished` samples from the machine. THE REGRESSION: each
    // of these used to release the hold (and, one layer down, expire the
    // driver's grace) on the premise that the split shared the terminal
    // frame's sample instant.
    tick(fake, 50);
    tick(fake, 50);
    tick(fake, 50);
    expect(result.current.handoffHeld).toBe(true);
    expect(result.current.actuals).toHaveLength(0);

    // The split the PM5 always sends at the finish, arriving when it
    // actually arrives.
    tick(fake, 50);

    expect(result.current.actuals).toHaveLength(1);
    expect(loadMonitorRun()?.actuals).toHaveLength(1);
    // ...and the hold is over the moment its reason to exist is gone.
    expect(result.current.handoffHeld).toBe(false);
    expect(timer.pending()).toBeNull(); // the backstop was cancelled, not left to fire

    // THE SEAM THAT FAILED ON DEVICE: what the log screen's own prefill gate
    // sees at the instant the hand-off releases (this is the function
    // `LogSession` runs in its mount-time `useState`, so this is exactly the
    // snapshot the caption is built from).
    const seen = monitorModeRun(
      new URLSearchParams("from=monitor"),
      "walk-day-2",
    );
    expect(seen?.actuals).toHaveLength(1);
    // ...and the prefill really carries the measurement, not just the
    // record: `actualSource: "pm5"` is what the caption counts as MEASURED
    // and what puts an ACTUAL line under the interval on the log screen.
    const steps = buildMonitorLogSteps(seen!);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.actualSource).toBe("pm5");
    expect(steps[0]?.actualSplit).toBe(120);
  });

  it("the hold is BOUNDED: a piece whose split never arrives hands off anyway, on the backstop", async () => {
    const timer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
        ],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.handoffHeld).toBe(true);

    // Nothing else ever comes — no split, no further tick, no disconnect.
    act(() => {
      timer.pending()!.fire();
    });

    expect(result.current.handoffHeld).toBe(false);
    expect(result.current.phase).toBe("ended");
    // Honest about what was lost: the record is handed over as it stands.
    expect(loadMonitorRun()?.actuals).toHaveLength(0);
  });

  it("a further status tick does NOT release the hold (walk day 3): the machine's cadence is not the split's schedule", async () => {
    // The exact pin this file used to carry, inverted by measurement. Every
    // affected device session logged `handoff-released: next-tick` with not
    // one `split-half` entry behind it — the door shut before the split
    // existed. Ten repeat samples here; the hold outlasts all of them.
    const timer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
          ...Array.from({ length: 10 }, (_, i) => finishedAt(250 + i * 50)),
        ],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.handoffHeld).toBe(true);

    for (let i = 0; i < 10; i += 1) tick(fake, 50);

    expect(result.current.handoffHeld).toBe(true);
    expect(timer.pending()).not.toBeNull(); // still the backstop's to end
  });

  it("the DESKTOP order pays nothing: a run whose final interval is already measured hands off on the finish itself", async () => {
    const timer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finalBoundary(150),
          finishedAt(200),
        ],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    // Nothing is missing, so there is nothing to wait for and no timer at all
    // — the hand-off is as immediate as it has always been.
    expect(result.current.handoffHeld).toBe(false);
    expect(timer.calls).toHaveLength(0);
    expect(result.current.actuals).toHaveLength(1);
    expect(loadMonitorRun()?.actuals).toHaveLength(1);
  });

  it("a MACHINE-TERMINATED ending never holds — the driver opens no finish grace for it, so there is nothing to wait for", async () => {
    // The rower stopped the piece at the erg: the machine reports
    // TERMINATE, not WORKOUTEND. `driver.ts` opens no finish grace on that
    // path (CSAFE-DEF footnote 12 — a mid-terminate Split/Interval Number
    // has no stable interval to name), so no boundary of ours is coming and
    // holding the hand-off would only delay the log screen for nothing.
    const timer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          status(200, {
            workoutState: WORKOUTSTATE_TERMINATE,
            elapsedSeconds: 40,
            distanceMeters: 130,
            spm: 0,
            currentSplit: 0,
          }),
        ],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    // Interval 0 is unmeasured — the ONLY thing separating this from the
    // walk's own sequence is how the machine ended it.
    expect(result.current.actuals).toHaveLength(0);
    expect(result.current.handoffHeld).toBe(false);
    expect(timer.calls).toHaveLength(0);
    expect(loadMonitorRun()?.terminated).toBe(true);
  });

  it("a piece that finished without anyone rowing it holds nothing — there is no record to be missing an actual", async () => {
    // `live` is downstream of the first rowing frame, so a program that
    // armed and then went straight to WORKOUTEND (the rower walked away,
    // the machine timed the piece out) leaves this hook with no `MonitorRun`
    // at all. The session still ends; there is simply nothing to wait for.
    const timer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [finishedAt(200)],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 200);

    expect(result.current.phase).toBe("ended");
    expect(result.current.handoffHeld).toBe(false);
    expect(timer.calls).toHaveLength(0);
    expect(loadMonitorRun()).toBeNull();
  });

  it("the rower's own End never holds either — End is a decision, not a finish", async () => {
    const timer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [status(100, { elapsedSeconds: 30, distanceMeters: 100 })],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);

    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("user");
    expect(result.current.handoffHeld).toBe(false);
    expect(timer.calls).toHaveLength(0);
  });

  it("a link that DIES inside the hold is exactly what the backstop is for — the drop itself is silent by design", async () => {
    // The driver does not announce a disconnect once its run has closed
    // (`driver.ts`'s `onDisconnect`: after a terminal state the PM5's own
    // Appendix-E auto-cycle makes a drop expected housekeeping, not an
    // error), and a hold only exists AFTER that close. So there is no event
    // to release on here, by construction — which is the whole argument for
    // the hold having a bounded backstop rather than trusting events alone.
    const timer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
        ],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.handoffHeld).toBe(true);

    act(() => {
      fake.injectDisconnect();
    });

    // Still held — nothing was emitted to release it...
    expect(result.current.handoffHeld).toBe(true);
    // ...and the rower is not stranded on the ended frame either.
    act(() => {
      timer.pending()!.fire();
    });
    expect(result.current.handoffHeld).toBe(false);
    // The ending stands: a drop AFTER the machine finished does not drag the
    // session back out of `ended` (spec's C5 ruling, unchanged).
    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
  });

  it("unmounting during the hold cancels its backstop — no timer outlives the session", async () => {
    const timer = manualSchedule();
    const { result, fake, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
        ],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.handoffHeld).toBe(true);

    unmount();

    expect(timer.calls).toHaveLength(1);
    expect(timer.calls[0]!.cancelled).toBe(true);
    // ...and it says so IN THE STASH: the release runs as teardown's first
    // statement, above the export, so a session torn down mid-hold leaves a
    // trace that accounts for the hold instead of one that just stops
    // (review M-1). This is the ordering, asserted through the artifact the
    // operator actually reads at the erg.
    const stashed = sessionStorage.getItem("ergomatic:last-rowed-log") ?? "[]";
    const kinds = (JSON.parse(stashed) as { kind: string; detail: string }[])
      .filter((e) => e.kind.startsWith("handoff"))
      .map((e) => `${e.kind}:${e.detail.slice(0, 8)}`);
    expect(kinds).toStrictEqual([
      "handoff-hold:machine ",
      "handoff-released:teardown",
    ]);
  });

  it("the wire log answers the question the device stash could not: split receipt, the record's verdict, and the hold's own fate", async () => {
    // Observability (walk day 2): yesterday's stash ended at `terminal
    // finished` with no entry of any kind about a split, so it could not
    // distinguish "never delivered" from "delivered and dropped". These
    // three entries make the next stash answer it in one read — and they are
    // inside the stash's own window, because `teardown` (which exports it)
    // now runs after the hold.
    const timer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
          finalBoundary(300),
        ],
      },
      { schedule: timer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    tick(fake, 100);

    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const kinds = entries.map((e) => e.kind);
    // Both halves of the pair, logged on arrival — the entry that would have
    // settled yesterday's question on its own.
    expect(entries.filter((e) => e.kind === "split-half")).toHaveLength(2);
    expect(entries.find((e) => e.kind === "split-half")?.detail).toContain(
      "0x0037",
    );
    // The hold, opened and released with its reason.
    expect(kinds).toContain("handoff-hold");
    const released = entries.find((e) => e.kind === "handoff-released");
    expect(released?.detail).toContain("final-boundary");
    // ...and it reports what the rower is actually being handed.
    expect(released?.detail).toContain("1 actual(s) measured");
    // The record's own verdict on the late actual.
    const filed = entries.find((e) => e.kind === "record-actual");
    expect(filed?.detail).toContain("accepted");
    expect(filed?.detail).toContain("index=0");
  });

  it("THE DROPPED SPLIT, END TO END (fast-follow Task 2, design spec §5): the summary fills the final interval at the deadline, the record accepts it, and the hold releases with 1 measured", async () => {
    // The failure R1 exists to fix, replayed through the whole stack: the
    // machine finishes, the final 0x0037/0x0038 pair is DROPPED ENTIRELY
    // (the ecosystem review's own reported failure mode — this script has
    // no `finalBoundary` event at all), and 0x0039 arrives instead. Without
    // the gate this run reaches the log screen reading "0 OF 1 INTERVALS
    // MEASURED" with the workout's real numbers sitting in the trace.
    //
    // Two injected timers, deliberately separate, because the whole ordering
    // question lives between them: `driverTimer` is the driver's reconcile
    // deadline (3000, the finish grace), `timer` is this hook's hand-off
    // hold (3500). The fill has to happen while the hold is still up.
    const timer = manualSchedule();
    const driverTimer = manualSchedule();
    let driverMs = 0;
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
        ],
      },
      {
        schedule: timer.schedule,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          now: () => driverMs,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.handoffHeld).toBe(true);
    // THE STRICT INEQUALITY, as two live timers rather than as two
    // constants: the fill is due at 3000 and the hand-off cannot release
    // before 3500.
    expect(driverTimer.pending()?.ms).toBe(3000);
    expect(timer.pending()?.ms).toBe(3500);

    // 0x0039 arrives inside the grace. Still nothing filed — the summary is
    // the fallback, and a split has until the deadline to win.
    driverMs = 400;
    act(() => {
      fake.deliverSummary({ elapsedSeconds: 62.5, meters: 214 });
    });
    expect(result.current.actuals).toHaveLength(0);

    // The deadline. No split ever came, so the gate synthesizes.
    driverMs = 3000;
    act(() => {
      driverTimer.pending()!.fire();
    });

    expect(result.current.actuals).toHaveLength(1);
    expect(result.current.actuals[0]).toMatchObject({
      index: 0,
      elapsedSeconds: 62.5,
      distanceMeters: 214,
      avgSplit: null,
      avgSpm: null,
      avgHeartRateBpm: null,
    });
    expect(loadMonitorRun()?.actuals).toHaveLength(1);
    // ...and the hand-off is free, on the fill rather than on its backstop.
    expect(result.current.handoffHeld).toBe(false);
    expect(timer.pending()).toBeNull();

    // WHAT THE ROWER ACTUALLY GETS: the log screen's own prefill, from the
    // same snapshot `LogSession` takes at mount.
    const seen = monitorModeRun(
      new URLSearchParams("from=monitor"),
      "walk-day-2",
    );
    const steps = buildMonitorLogSteps(seen!);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.actualSource).toBe("pm5");
    expect(steps[0]?.actualSeconds).toBe(62.5);
    expect(steps[0]?.actualMeters).toBe(214);
    // The averages are ABSENT from the log step, not zero and not the
    // workout's: `buildMonitorLogSteps` drops a null average field
    // entirely, which is exactly what an omitted-average actual is supposed
    // to produce downstream (design spec §5's B3 — the fake sends real
    // non-zero averages on 0x0039, so this proves a drop, not an echo).
    expect(steps[0]).not.toHaveProperty("actualSplit");
    expect(steps[0]).not.toHaveProperty("spm");
    expect(steps[0]).not.toHaveProperty("avgHr");

    // ONE READ OF THE STASH ANSWERS "WHICH SOURCE FED THE RECORD".
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(entries.filter((e) => e.kind === "split-half")).toHaveLength(0);
    expect(entries.filter((e) => e.kind === "summary-half")).toHaveLength(1);
    const verdict = entries.find((e) => e.kind === "summary-reconciled");
    expect(verdict?.detail).toContain("filled-from-summary");
    expect(verdict?.detail).toContain("62.5");
    const filed = entries.find((e) => e.kind === "record-actual");
    expect(filed?.detail).toContain("accepted");
    expect(filed?.detail).toContain("finalBoundary=true");
    expect(
      entries.find((e) => e.kind === "handoff-released")?.detail,
    ).toContain("final-boundary");
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

  it("the wire log survives the session: teardown stashes exportLog into sessionStorage (2026-08-08, walk 2: the ended frame navigated away and the trace died with it)", async () => {
    sessionStorage.removeItem("ergomatic:last-monitor-log");
    const { result, fake, unmount } = harness({
      program: TWO_INTERVALS,
      events: timeline,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");

    await act(async () => {
      await result.current.endSession();
    });
    // Teardown is the unmount's; the ended frame itself has not stashed.
    unmount();

    const stashed = sessionStorage.getItem("ergomatic:last-monitor-log");
    expect(stashed).not.toBeNull();
    const entries = JSON.parse(stashed!) as { seq: number; kind: string }[];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.kind === "write")).toBe(true);
    // This session OPENED A RECORD, so it also keeps the rowed-only copy —
    // the one a later never-rowed attempt (a failed pairing, a
    // connect-then-cancel) cannot clobber.
    expect(sessionStorage.getItem("ergomatic:last-rowed-log")).toBe(stashed);
  });

  it("a session that never rowed does NOT touch the rowed-only stash", async () => {
    sessionStorage.setItem(
      "ergomatic:last-rowed-log",
      "THE ROW I MEANT TO COPY",
    );
    const { result, fake, unmount } = harness({
      program: TWO_INTERVALS,
      events: timeline,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    // Armed, never pulled: cancel and leave.
    await act(async () => {
      await result.current.cancel();
    });
    unmount();

    // The general key holds the attempt's trace; the rowed key is intact.
    expect(sessionStorage.getItem("ergomatic:last-monitor-log")).not.toBeNull();
    expect(sessionStorage.getItem("ergomatic:last-rowed-log")).toBe(
      "THE ROW I MEANT TO COPY",
    );
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

  it("End while the monitor has gone silent still closes the record", async () => {
    // The ordering pin (task-4 review, MEDIUM-1): `endSession()` stamps
    // `completedAt` BEFORE it awaits `terminate()`, and this is the walk
    // that proves the ordering is load-bearing rather than stylistic. The
    // link is UP but the machine stops acking, so `terminate()` never
    // settles — close the record after the await instead and it stays
    // permanently OPEN, and 7C later reads an unclosed record for a
    // session the rower ended.
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");

    fake.injectTimeout();
    await act(async () => {
      void result.current.endSession();
      await flush();
    });

    expect(result.current.phase).toBe("ended");
    expect(loadMonitorRun()?.completedAt).toBe(t0.toISOString());
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
    // One prepare frame + the programming sequence, once. DEFENCE IN
    // DEPTH, not the discriminator (task-4 review, LOW-8: measured at 5
    // writes vs 5 under the late-flip mutant): the driver's own
    // single-flight gate keeps this count right no matter what the hook
    // does, so it would only move if that gate went too. The render
    // assertion above is what actually pins the hook's behaviour.
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
    // Same distinction as the connect-side one above: the handle died, the
    // radio did not.
    expect(result.current.error?.reason).toBe("link-failed");
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

  // Task 5 re-review, MEDIUM-9. **This pin does NOT close MEDIUM-9** — the
  // whole-branch review (H1) showed the reason it is green is fake-only,
  // and the account below, though accurate about the mechanism, drew the
  // wrong conclusion from it. The real close is the next test down
  // ("…even when the monitor answers asynchronously"), which removes the
  // one fake-only property and makes the double terminate appear. This one
  // is kept as-is because the SYNCHRONOUS-echo path is still a path worth
  // pinning; it just is not the hardware one.
  //
  // Original note, `delayWrites` making the race real rather than
  // hand-waved: `ConnectedInterstitial
  // .tsx`'s own `handleCancel` does `void session.cancel(); onExit();` —
  // fire-and-forget, immediately followed by a synchronous `setConnecting
  // (null)` that unmounts this hook while `cancel()`'s own promise is still
  // in flight.
  //
  // WHAT THIS PIN ACTUALLY FOUND (debugged with a temporary instrumented
  // run, not left in): even with `delayWrites(50)` making `driver
  // .terminate()`'s own PROMISE take 50 real ms, the SYNCHRONOUS side effect
  // of dispatching that single-chunk terminate frame — `fake.ts`'s own
  // `onArmedFrameComplete`, which echoes the ack AND delivers a
  // `WORKOUTSTATE_TERMINATE` status tick, both inline, before `write()`
  // returns anything — reaches the hook's `handleEvent` and moves `phase`
  // to `"ended"` on the SAME synchronous call that dispatches the write, well
  // before `cancel()`'s own `await` ever suspends. So by the time the
  // interleaved `unmount()` actually runs `teardown()`, `phase` already
  // reads `"ended"`, not `"ready"` — `teardown`'s own phase check
  // (`"programming" | "ready"`) closes the door on its own, independent of
  // the `alreadyTerminated` flag `cancel()` hasn't even gotten around to
  // passing yet. The guard holds for a REASON different from the one
  // MEDIUM-9 pictured (the machine's own echo beats the clock, not a flag
  // beating a flag) — and, as H1 pointed out, that reason is available only
  // to a fake. Since the fix wave, `cancel()` claims the ref synchronously
  // and this pin passes for BOTH reasons.
  it("cancel() racing an interleaved unmount sends at most ONE physical terminate on the wire, even under realistic write latency (the fake's synchronous-echo path)", async () => {
    const { result, fake, transport, unmount } = harness({
      program: TWO_INTERVALS,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");
    // Real latency from here on.
    fake.delayWrites(50);
    const writesAtReady = transport.wireWrites;

    // Fire-and-forget, exactly like `ConnectedInterstitial.tsx`'s own
    // `handleCancel` — NOT awaited before the unmount that follows it.
    const cancelling = result.current.cancel();
    unmount();

    await act(async () => {
      await cancelling;
      fake.tick(0);
      await flush();
    });

    expect(transport.wireWrites - writesAtReady).toBe(1);
    expect(transport.disconnects).toBe(1);
  });

  // Fix wave H1. The pin above was recorded as closing MEDIUM-9; the
  // whole-branch review showed it passes for a FAKE-ONLY reason (see its own
  // comment: the fake's synchronous terminate echo moves `phase` to
  // `"ended"` before `cancel()` ever suspends, so `teardown`'s phase guard
  // is what holds — not anything `cancel()` does). The one condition making
  // it green cannot occur on the hardware this phase exists for: a real PM5
  // delivers the ack and the TERMINATE status as later BLE notifications.
  //
  // `deferNotifications` reproduces exactly that one difference, and with it
  // the double terminate is real: `cancel()` suspends on
  // `await driver.terminate()` with `driverRef.current` still populated and
  // the phase still `"ready"`, so the interleaved unmount's `teardown()`
  // finds a live driver in an armed phase and sends a SECOND physical
  // terminate. The fix is MEDIUM-9's own: `cancel()` CLAIMS the ref
  // synchronously, before its first `await`, and hands the captured driver
  // to `teardown` so the disconnect still happens exactly once.
  it("cancel() racing an interleaved unmount sends at most ONE physical terminate even when the monitor answers asynchronously, as real hardware does (MEDIUM-9, for real this time)", async () => {
    const { result, fake, transport, unmount } = harness({
      program: TWO_INTERVALS,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");
    fake.delayWrites(50);
    transport.deferNotifications = true;
    const writesAtReady = transport.wireWrites;

    const cancelling = result.current.cancel();
    // The phase has NOT moved — this is the property the previous pin was
    // silently relying on the fake to break, and the reason it could not
    // see the defect.
    expect(result.current.phase).toBe("ready");
    unmount();

    // Deliberately NOT a bare `await cancelling`. Against the unfixed hook
    // that promise never settles at all — `sendSequence()` opens with
    // `discardStaleAcks()`, so `teardown`'s second terminate purges the
    // `pendingAck` the FIRST one is still waiting on and `cancel()`'s own
    // `await driver.terminate()` deadlocks. Fire-and-forget hides that from
    // the rower, but a 5-second test timeout is a useless failure message,
    // so the settlement is asserted explicitly and on a budget.
    const settled = await act(async () => {
      const outcome = await Promise.race([
        cancelling.then(() => "settled" as const),
        new Promise<"deadlocked">((resolve) =>
          setTimeout(() => resolve("deadlocked"), 600),
        ),
      ]);
      fake.tick(0);
      await flush();
      return outcome;
    });

    expect(settled).toBe("settled");
    expect(transport.wireWrites - writesAtReady).toBe(1);
    expect(transport.disconnects).toBe(1);
  });
});

describe("useMonitorSession: the seams and their defaults", () => {
  it("an explicitly anonymous identity and no injected clock: the record still opens, stamped now", async () => {
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
      const pending = result.current
        .program(TWO_INTERVALS, { workoutId: null, title: "", ...TEST_SEED })
        .finally(() => {
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

  // Task 5 review, Probe D: before this fix, unmounting while ARMED
  // (programming/ready) hung up the radio with no terminate at all, leaving
  // the PM5 holding a workout nobody was going to row — DEVIATIONS row 63's
  // own documented harm, reachable from every exit except a Cancel press.
  it("unmount while armed (ready) terminates BEFORE hanging up — the erg is not left with an orphan workout", async () => {
    const { result, fake, transport, unmount } = harness({
      program: TWO_INTERVALS,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");
    const writesAtReady = transport.wireWrites;

    unmount();
    await act(async () => {
      await flush();
    });

    expect(transport.wireWrites).toBeGreaterThan(writesAtReady);
    expect(transport.disconnects).toBe(1);
  });

  it("unmount while programming (before armed) also terminates first", async () => {
    const { result, fake, transport, unmount } = harness({
      program: TWO_INTERVALS,
    });
    await connect(result);
    let settled = false;
    void result.current.program(TWO_INTERVALS, TWO_IDENTITY).finally(() => {
      settled = true;
    });
    await act(async () => {
      await flush();
    });
    expect(result.current.phase).toBe("programming");
    const writesWhileProgramming = transport.wireWrites;

    unmount();
    await act(async () => {
      await flush();
    });

    expect(transport.wireWrites).toBeGreaterThan(writesWhileProgramming);
    expect(transport.disconnects).toBe(1);
    // Drains the in-flight program() so it doesn't leak a rejection into a
    // later test — the driver is already torn down, so this settles one way
    // or another rather than hanging.
    if (!settled) {
      fake.tick(0);
      await flush();
    }
  });

  // Live/paused/ended are UNCHANGED by this fix — End (not an unmount) owns
  // closing the record once rowing has started, and `teardown`'s new
  // terminate-first branch is gated on phase === "programming" | "ready"
  // specifically so it never fires once a run is actually open.
  it("unmount while live sends NO terminate — the SAME behaviour as before this fix", async () => {
    const { result, fake, transport, unmount } = harness({
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    const writesWhileLive = transport.wireWrites;

    unmount();
    await act(async () => {
      await flush();
    });

    expect(transport.wireWrites).toBe(writesWhileLive);
    expect(transport.disconnects).toBe(1);
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
 *  too, which are not part of the three keyed metrics and are irrelevant
 *  here. */
function frame(over: Partial<MonitorFrame>): MonitorFrame {
  // The session pair mirrors the raw pair unless a case overrides it — and
  // it is irrelevant to everything in this block on purpose: the paused
  // derivation and the ready gate are both INTERVAL-scoped (see
  // `freezeKey`'s and the gate's own comments in `useMonitorSession.ts`),
  // so these recorded fixtures deliberately never exercise the accumulated
  // pair.
  const f: MonitorFrame = {
    elapsedSeconds: 0,
    distanceMeters: 0,
    sessionElapsedSeconds: 0,
    sessionDistanceMeters: 0,
    currentSplit: null,
    spm: null,
    heartRateBpm: null,
    intervalIndex: 0,
    intervalRemaining: null,
    intervalAccrued: null,
    state: "rowing",
    rowingActive: true,
    ...over,
  };
  return {
    ...f,
    sessionElapsedSeconds: over.sessionElapsedSeconds ?? f.elapsedSeconds,
    sessionDistanceMeters: over.sessionDistanceMeters ?? f.distanceMeters,
  };
}

/** log line 2835 and lines 2837-2841 (2836 is the `intervalComplete`
 *  between them): the last rowing frame of interval 0, the boundary's
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

/** log lines 3546-3551, plus one later frame from the same stretch: the
 *  rower stops. Two moving frames, then the three keyed metrics freeze at
 *  `108.4 / 236.75 / 16` (the elapsed `57.78` alongside them is the empty
 *  arm's own artifact, not part of the key) — and stay frozen for 216 consecutive
 *  frames (3548-3763, where split and spm finally zero), with the heart
 *  rate moving the whole time. The seventh fixture frame below (HR 60) is
 *  a real frame from further down that stretch, not line 3552 — HR 60
 *  occurs 24 times inside it; it is here to carry the HR movement into the
 *  fixture, and its keyed metrics are the same frozen three. spm PINNED at
 *  16, not zeroed: the observation that killed the original `spm === 0`
 *  predicate. */
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

/** log lines 4632-4633: elapsed ticking BACKWARDS, `0.75 -> 0.18` — the
 *  −0.57 s the spec's own M2 note cites, and the largest of the five
 *  intra-stream backwards ticks in the whole capture. */
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
  it("the recorded no-rest boundary reset NEVER fires it — every changeover frame carries a zeroed distance, and zero-distance frames do not count", () => {
    const { runs, everPaused } = replay(RECORDED_BOUNDARY_RESET);

    expect(everPaused).toBe(false);
    // Before §17 item 20's answer, elapsed in the key cleared this by a
    // one-frame margin (the resume frame's fresh clock). With elapsed OUT
    // of the key — the clock runs while a stopped rower sits still — the
    // `distanceMeters > 0` guard clears it STRUCTURALLY instead: only the
    // old interval's last frame (d 74.4) ever counts, as a fresh 1; the
    // reset frame and the zeros all carry d 0 and reset the run outright.
    expect(runs.map((r) => r.frames)).toStrictEqual([1, 0, 0, 0, 0, 0]);
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

  it("heart rate is not one of the three: the stop holds through every HR change in it", () => {
    // The last recorded frame of the stop fixture drops HR from 81 to 60
    // while the three stay frozen — if HR were in the key, the rower would
    // flicker out of PAUSED every few frames for the whole 216-frame stop.
    const { runs } = replay(RECORDED_STOP);
    expect(isPausedRun(runs[runs.length - 1]!)).toBe(true);
  });

  /**
   * THE KEY'S COMPOSITION, one metric at a time (task-4 review, MEDIUM-2).
   * The threshold mutants (`PAUSED_FRAME_HOLD` 2 and 3) pin HOW LONG the
   * hold is; nothing pinned WHAT it holds on. The recorded fixtures cannot:
   * in the boundary reset, the reset frame (`0|0|338.97|66`) differs from
   * the three zeroed ones by BOTH split and spm, so dropping either alone
   * from the key stays invisible — the review measured three clean green
   * runs against exactly that. Each row below is the frame pair that only
   * ONE metric distinguishes, so dropping that metric makes the hold run on
   * through a machine that is visibly still moving.
   *
   * Deltas are the record's own: the stop fixture's frozen values
   * (`57.78 / 108.4 / 236.75 / 16`) against the kind of step the frames
   * either side of it take (`pm5-session3-final.log:3546-3547` moves
   * elapsed ~0.5 s and distance ~0.8 m per frame).
   */
  const FROZEN = {
    elapsedSeconds: 57.78,
    distanceMeters: 108.4,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 61,
  };

  it.each([
    ["distanceMeters", { distanceMeters: 109.2 }],
    ["currentSplit", { currentSplit: 231.4 }],
    ["spm", { spm: 17 }],
  ] as const)(
    "a frame that changes ONLY %s breaks a three-frame hold",
    (_metric, moved) => {
      const held = frame(FROZEN);
      let run = nextFreezeRun(null, held);
      run = nextFreezeRun(run, held);
      run = nextFreezeRun(run, held);
      expect(run.frames).toBe(3);

      run = nextFreezeRun(run, frame({ ...FROZEN, ...moved }));

      // Drop this metric from the key and the count reaches 4 here — the
      // session renders PAUSED at a rower who is still moving.
      expect(run.frames).toBe(1);
      expect(isPausedRun(run)).toBe(false);
    },
  );

  it("...and a frame that changes ONLY the heart rate does not break it", () => {
    // The deliberate asymmetry, from the same stretch of record: HR is the
    // one field that keeps moving while the three freeze, so it is the one
    // field the key must NOT contain.
    const held = frame(FROZEN);
    let run = nextFreezeRun(null, held);
    run = nextFreezeRun(run, held);
    run = nextFreezeRun(run, held);
    run = nextFreezeRun(run, frame({ ...FROZEN, heartRateBpm: 59 }));

    expect(run.frames).toBe(4);
    expect(isPausedRun(run)).toBe(true);
  });

  it("a frame that changes ONLY elapsedSeconds SUSTAINS the hold — the clock runs while a stopped rower sits still (§17 item 20, the 2026-08-08 recording)", () => {
    // THE fix the erg demanded: on a real programmed interval, LEFT IN
    // INTERVAL counted 4:38 -> 3:47 while meters sat pinned at 30, split
    // at 4:16.1, rate at 68. With elapsed in the key, the key never
    // repeats on real hardware and PAUSED can never fire at all.
    const held = frame(FROZEN);
    let run = nextFreezeRun(null, held);
    run = nextFreezeRun(run, held);
    run = nextFreezeRun(run, held);
    run = nextFreezeRun(run, frame({ ...FROZEN, elapsedSeconds: 58.28 }));

    expect(run.frames).toBe(4);
    expect(isPausedRun(run)).toBe(true);
  });

  it("zero-distance rowing frames never count, whatever their elapsed does — the recorded backwards tick lands on the guard, not the key", () => {
    // RECORDED_BACKWARDS (elapsed 0.75 -> 0.18, the capture's largest
    // backwards tick) sits at distance 0: under the old key this pair was
    // the backwards-tick-is-a-change pin; under the guard neither frame
    // accumulates at all.
    const frozen: FreezeRun = { key: "", frames: 0 };
    const first = nextFreezeRun(frozen, RECORDED_BACKWARDS[0]!);
    const second = nextFreezeRun(first, RECORDED_BACKWARDS[1]!);

    expect(first.frames).toBe(0);
    expect(second.frames).toBe(0);
    expect(isPausedRun(second)).toBe(false);
  });

  it("a non-rowing frame resets the count outright — a rest cannot lend its frames to the next stroke", () => {
    // Three frozen rowing frames, a rest, then the same frozen values
    // again. Merely NOT COUNTING the rest would leave the run standing and
    // let that fourth frame tip the session into PAUSED across a REST
    // boundary. A SECOND mechanism from the 4-frame hold, guarding a
    // different shape (task-4 review, Audit 3): every frame of the
    // recorded no-rest reset reads `state: "rowing"`, so the hold alone
    // clears that one — this clears the rest-boundary one, which the hold
    // cannot see.
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

describe("nextRowingStreak: the rowingActive fallback's own counter", () => {
  it("a NON-ROWING frame resets outright — an armed or resting frame cannot lend its position to the next pull", () => {
    // The same discipline `nextFreezeRun` applies for the same reason: a
    // rest's frames are not the next interval's first strokes. Without the
    // reset, four rowing frames either side of a rest would add up to the
    // fallback's five and open a record on a machine that is resting.
    let streak = nextRowingStreak(null, frame({ distanceMeters: 1 }));
    streak = nextRowingStreak(streak, frame({ distanceMeters: 2 }));
    streak = nextRowingStreak(streak, frame({ distanceMeters: 3 }));
    streak = nextRowingStreak(streak, frame({ distanceMeters: 4 }));
    expect(streak?.frames).toBe(4);

    streak = nextRowingStreak(
      streak,
      frame({ state: "resting", distanceMeters: 5 }),
    );
    expect(streak).toBeNull();

    // ...and the next rowing frame starts over at one, not five.
    streak = nextRowingStreak(streak, frame({ distanceMeters: 6 }));
    expect(streak?.frames).toBe(1);
  });

  it("a frame that merely MATCHES the previous distance restarts the count at one, so a stalled wheel can never reach the threshold", () => {
    let streak = nextRowingStreak(null, frame({ distanceMeters: 4.7 }));
    streak = nextRowingStreak(streak, frame({ distanceMeters: 4.7 }));
    streak = nextRowingStreak(streak, frame({ distanceMeters: 4.7 }));
    expect(streak).toStrictEqual({ frames: 1, distanceMeters: 4.7 });
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

// ---------------------------------------------------------------------------
// exportLog — the diagnostics sheet's one read-only window (Task 7)
// ---------------------------------------------------------------------------

describe("useMonitorSession: exportLog", () => {
  it("reads `[]` before a connect has ever built a log", () => {
    const { result } = renderHook(() => useMonitorSession());
    // No null branch for a caller to get wrong — the honest empty value is
    // the same shape an empty log exports.
    expect(result.current.exportLog()).toBe("[]");
  });

  it("returns the LIVE driver's own trace, byte-identical to the log's", async () => {
    const log = createEventLog();
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      deviceName: DEVICE_NAME,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => fake,
        createLog: () => log,
        now: () => t0,
        driverOptions: { settleTicks: 0, prepareSettleTicks: 0 },
      }),
    );

    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);

    expect(log.entries().length).toBeGreaterThan(0);
    // The SAME STRING the log produces, not a re-serialization of it: the
    // sheet's `COPY LOG` copies whatever this returns, verbatim.
    expect(result.current.exportLog()).toBe(log.exportLog());
  });

  it("is a WINDOW, not a subscription: two reads see two different logs", async () => {
    const log = createEventLog();
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      deviceName: DEVICE_NAME,
      events: [
        status(100, { elapsedSeconds: 20, distanceMeters: 70 }),
        status(200, { elapsedSeconds: 40, distanceMeters: 140 }),
      ],
    });
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => fake,
        createLog: () => log,
        now: () => t0,
        driverOptions: { settleTicks: 0, prepareSettleTicks: 0 },
      }),
    );
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    const first = result.current.exportLog();
    expect(first).toBe(log.exportLog());

    // Nothing was pushed and nothing was cached: a SECOND read simply sees
    // whatever the log holds now, which is exactly what "the sheet reads on
    // open" means and why re-opening it shows more.
    log.record("probe", "one more entry, after the first read");
    const second = result.current.exportLog();
    expect(second).not.toBe(first);
    expect(second).toBe(log.exportLog());
    expect(second).toContain("one more entry, after the first read");
  });

  it("survives the session it belongs to: the trace outlives the teardown", async () => {
    // The sheet is openable on the ended and disconnected frames, and a
    // trace of the attempt that just failed is the one a bug report needs.
    const log = createEventLog();
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      deviceName: DEVICE_NAME,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => fake,
        createLog: () => log,
        now: () => t0,
        driverOptions: { settleTicks: 0, prepareSettleTicks: 0 },
      }),
    );
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    await act(async () => {
      await result.current.endSession();
    });
    expect(result.current.phase).toBe("ended");
    expect(result.current.exportLog()).toBe(log.exportLog());
    expect(result.current.exportLog()).not.toBe("[]");
  });
});
