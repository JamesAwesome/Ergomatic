import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKOUTSTATE_INTERVALREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_REARM,
  WORKOUTSTATE_TERMINATE,
  WORKOUTSTATE_WAITTOBEGIN,
  WORKOUTSTATE_WORKOUTEND,
} from "../../domain/monitor/pm5/parse.js";
import { buildTerminate } from "../../domain/monitor/pm5/commands.js";
import { buildGeneralStatusBytes } from "../../domain/monitor/pm5/statusFrames.js";
import { buildAckFrame } from "../../domain/monitor/pm5/response.js";
import {
  ADDITIONAL_STATUS_1_UUID,
  GENERAL_STATUS_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  TRANSMIT_CHARACTERISTIC_UUID,
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
import { loadMonitorRun, MONITOR_RUN_KEY, type MonitorRun } from "./monitorRun";
import {
  resetForTests as resetHandoffStore,
  currentUnretired as currentUnretiredHandoffForTest,
  retire as retireHandoffForTest,
  commit as commitHandoffForTest,
  read as readHandoffForTest,
  stageRetire as stageRetireForTest,
  takeStagedRetire as takeStagedRetireForTest,
} from "./handoffStore";
import { buildMonitorLogSteps } from "../session/logDraft";
import { monitorModeRun } from "../session/LogSession";
import {
  createFakeTransport,
  type FakeBoundaryEvent,
  type FakeControls,
  type FakeScript,
  type FakeTimelineEvent,
} from "./transports/fake";
import {
  SILENCE_THRESHOLD_MS,
  withLiveness,
  type LivenessDeps,
  type LivenessSnapshot,
} from "./transports/liveness";
import { fromHexString, parseRecording } from "./transports/recording";
import {
  parseAdditionalStatus2,
  parseGeneralStatus,
  toMonitorState,
} from "../../domain/monitor/pm5/parse.js";
import { check as checkContinuity } from "./continuity";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  applyContinuityCheck,
  BANNER_RETRACT_HYSTERESIS_MS,
  BURST_HANDOFF_HOLD_MS,
  BURST_LINGER_MS,
  decideResumeLatch,
  defaultLivenessSchedule,
  handleFrameRecovery,
  handleFrameSilence,
  isPausedRun,
  nextFreezeRun,
  nextRowingStreak,
  PAUSED_FRAME_HOLD,
  programHasDistanceGoal,
  PULL_EVIDENCE_FRAMES,
  recordLivenessRecovery,
  recordLivenessSilence,
  useMonitorSession,
  type ConnectedPhase,
  type FreezeRun,
  type MonitorSessionDeps,
  type RunIdentity,
} from "./useMonitorSession";

// series-truth Task 4: the hook only ever READS `backwardBucketCount()` off
// whichever recorder `createSeriesRecorder()` handed it at close — it never
// derives the count itself (the recorder does, spec §C′, pinned by
// `seriesRecorder.test.ts`). The genuinely-poisoned wire shape that produces
// a nonzero count is no longer reachable through the FIXED driver+recorder
// pair this branch ships (that is the whole point of B′), so the one
// hook-level test that needs a nonzero count FORCES it through this
// passthrough wrapper rather than trying to reconstruct an unreachable wire
// sequence — it exists to test the hook's OWN wiring (read count, write one
// ring entry), not to re-prove the counting logic seriesRecorder.test.ts
// already owns. Every other test in this file gets the real, un-forced
// recorder: `forced` stays `null` unless a test sets it, and the describe
// block that uses it resets it in its own `afterEach`.
const seriesRecorderControl = vi.hoisted(() => ({
  forced: null as number | null,
}));

vi.mock("./seriesRecorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./seriesRecorder")>();
  return {
    ...actual,
    createSeriesRecorder: (): ReturnType<
      typeof actual.createSeriesRecorder
    > => {
      const real = actual.createSeriesRecorder();
      return {
        ...real,
        backwardBucketCount: (): number =>
          seriesRecorderControl.forced ?? real.backwardBucketCount(),
      };
    },
  };
});

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
    // `kind: "warmup"` is deliberate, not stale: Phase WU removed the
    // producer, but `LogSeed` is PERSISTED, so a `MonitorRun` stored
    // before Phase WU still carries this exact value. Keeping it here
    // exercises `buildMonitorLogSteps`' legacy skip (`logDraft.ts`) —
    // do not "modernize" this to a plain step, that changes what the
    // function under test emits and moves assertions below.
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
    // Filling Low's 8:00 opener was a `wu` step in the seed until
    // 2026-08-09, then the rower's warm-up PREFERENCE, and Phase WU removed
    // that too. It is an authored 8' EASY step here, which compiles to the
    // identical interval (`compileProgram` nulls an effort phase's target
    // exactly as it nulled a warm-up's), so the program is still
    // interval 0 = time 480 then 3 x distance 2000 and every index and
    // count below is unchanged.
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { effort: "min" },
      },
      ...w.steps,
    ],
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
  ...TEST_SEED,
};

/** A two-interval program for the tests whose subject is the hook's own
 *  state machine rather than a realistic workout's shape — short enough
 *  that a timeline stays readable. */
const TWO_INTERVALS: WorkoutProgram = {
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
      //
      // TIMER HYGIENE (fix round 1, review Minor-4): the driver arms a real
      // `setTimeout` at `FINISH_GRACE_MS` on every natural finish since the
      // summary-fallback gate, and most tests in this file finish a workout
      // without caring about it. This default stub means no test here
      // leaves a live multi-second timer behind; the deadline simply never
      // arrives, which is exactly what those tests already assumed. The one
      // test that DOES care passes its own `driverOptions` (this whole
      // object is replaced by `...deps` below when a test supplies one) and
      // fires the deadline by hand. File-wide `vi.useFakeTimers()` was
      // tried first and is not usable here — React Testing Library's `act`
      // integration needs the real clock, and 19 tests fail under it.
      driverOptions: {
        settleTicks: 0,
        prepareSettleTicks: 0,
        schedule: () => (): void => undefined,
      },
      // TIMER HYGIENE, the identical reasoning one field up (storage-spine
      // design spec §2's late side, Task 3): `teardown` now arms its own
      // `BURST_LINGER_MS` timer at a natural-finish unmount whose burst has
      // not yet landed, and most tests here reach exactly that unmount
      // without caring about the burst at all. This default stub means the
      // linger's timer is scheduled but never fires in any test that does
      // not supply its own `burstLingerSchedule` — STEPS 1/3/4 simply stay
      // deferred forever, which no assertion in those tests depends on.
      burstLingerSchedule: () => (): void => undefined,
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

/** F1 fix round 1: `injectDisconnect()` now disposes `driverRef` itself
 *  (the CRITICAL fix), so it can no longer reproduce D6's "a write against
 *  a dead GATT handle throws untyped" — `program()` finds `driverRef`
 *  already null and reports `transport-missing` before any write is
 *  attempted (see the F1 tests above). This wraps a real fake transport
 *  with a `write()` that throws the identical D6 message directly,
 *  independent of `linkDown`/disconnect — the file's own established
 *  idiom for a scenario the fake's public API cannot otherwise produce
 *  (`withOutcome`, `stubRadio`, below). Keeps `mapProgramFailure`'s
 *  untyped-throw branch and `fail()`'s own disposal semantics covered by
 *  their own mechanism, decoupled from the disconnected-event disposal
 *  this fix round adds. A minimal counter, not the full `spyTransport`
 *  (which requires a `FakeControls` this bare `Transport` no longer
 *  carries), for the one assertion (test 2) that needs to see `fail()`'s
 *  own `driver.disconnect()` reach the transport. */
function deadHandleTransport(fake: Transport): Transport & {
  disconnects: number;
  writeAttempts: number;
} {
  const spy = {
    ...fake,
    disconnects: 0,
    writeAttempts: 0,
    async write(): Promise<void> {
      spy.writeAttempts += 1;
      throw new Error(
        "fake transport: InvalidStateError: Characteristic 0000002a-0000-1000-8000-00805f9b34fb is no longer valid. Remember to retrieve the characteristic again after reconnecting.",
      );
    },
    async disconnect(): Promise<void> {
      spy.disconnects += 1;
      return fake.disconnect();
    },
  };
  return spy;
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

/** A hand-driven stand-in for `setTimeout`, so a one-shot `schedule` dep
 *  (the hand-off hold's backstop, the burst linger, either driver-level
 *  timer test files inject) is a thing a test FIRES rather than waits
 *  for. Records every schedule so a test can assert the delay and whether
 *  it was cancelled. Hoisted to module scope (originally local to "the
 *  ended hand-off" describe block) so storage-spine design spec §2's own
 *  teardown tests can reuse it without a second hand-rolled copy. */
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
    /** Storage-spine design spec §2, Task 3: the hand-off hold's SPLIT
     *  (`FINISH_HANDOFF_HOLD_MS`) and BURST (`BURST_HANDOFF_HOLD_MS`)
     *  backstops now share this one `schedule` seam, so a natural finish
     *  can leave TWO live timers here at once and `pending()`'s "most
     *  recent" answer no longer names a specific condition. This picks the
     *  most recent still-live timer scheduled for exactly `ms` — the one a
     *  test means when it wants "the split condition's own backstop" or
     *  "the burst condition's own backstop" specifically. */
    pendingWithMs(
      ms: number,
    ): { ms: number; fire: () => void; cancelled: boolean } | null {
      const live = calls.filter((c) => !c.cancelled && c.ms === ms);
      return live[live.length - 1] ?? null;
    },
  };
}

/** The walk's own piece: one 1:00 interval, rowed out. Hoisted to module
 *  scope (originally local to "the ended hand-off" describe block) so
 *  storage-spine design spec §2's own teardown tests share the identical
 *  fixture rather than a near-duplicate. */
const ONE_INTERVAL: WorkoutProgram = {
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
/** A seed whose one WORK step aligns with `ONE_INTERVAL`'s one interval —
 *  `TEST_SEED`'s placeholder is a warm-up, and `buildMonitorLogSteps`
 *  skips warm-ups, so a run seeded with it has no log step for the
 *  measured interval to land in. */
const ONE_IDENTITY: RunIdentity = {
  workoutId: "walk-day-2",
  title: "1:00",
  logSeed: {
    steps: [{ label: "1:00 at 2k+4", kind: "work" }],
    paces: { k2: 112 },
  },
};

/** `ONE_INTERVAL`'s own final (and only) boundary, as the fake puts it on
 *  the wire. */
function finalBoundary(atMs: number): FakeBoundaryEvent {
  return {
    atMs,
    kind: "boundary",
    actual: {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 200,
      avgSpm: 24,
      avgHeartRateBpm: 142,
      restDistanceMeters: 0,
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

// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  // Hand-off store design spec §1, plan Task 3: `handoffStore.ts` is a
  // module-level singleton — `localStorage.clear()` alone leaves its
  // in-memory `current`/`tombstones` state (and the fixed `t0` clock this
  // file's tests overwhelmingly share) to leak between `it()` blocks that
  // do not each get their own `vi.resetModules()`. See
  // `resetForTests`'s own doc comment in `handoffStore.ts` for the full
  // reasoning and the empirical evidence.
  resetHandoffStore();
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

  it("the web bluetooth connect timeout (R2-web): same literal, same classification as the iOS plugin (one vocabulary)", async () => {
    // Fast-follow Task 3: webBluetooth.ts wraps gatt.connect() in a 10s race,
    // rejecting with the SAME literal "Connection timeout." the iOS plugin uses.
    // This test pins that a web-transport timeout classifies as link-failed,
    // proving the "one vocabulary" design (spec §6, ecosystem review R2).
    const webTimeout = new Error("Connection timeout.");
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () =>
          stubRadio({ connect: () => Promise.reject(webTimeout) }),
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    // Exactly the same classification as the native case above: link-failed.
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
          avgSpm: 22,
          avgHeartRateBpm: 140,
          restDistanceMeters: 0,
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
          avgSpm: 24,
          avgHeartRateBpm: 150,
          restDistanceMeters: 0,
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
          avgSpm: 24,
          avgHeartRateBpm: 155,
          restDistanceMeters: 0,
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
          avgSpm: 24,
          avgHeartRateBpm: 158,
          restDistanceMeters: 0,
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
          avgSpm: 24,
          avgHeartRateBpm: 161,
          restDistanceMeters: 0,
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
          type: "work",
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
            avgSpm: 24,
            avgHeartRateBpm: 142,
            restDistanceMeters: 0,
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
        avgSpm: 18,
        avgHeartRateBpm: 90,
        restDistanceMeters: 0,
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
    //
    // Storage-spine design spec §2, Task 3: this natural finish ALSO owes
    // the BURST condition now (this script never delivers a summary, so
    // `summaryTotals` stays `undefined`) — the same `schedule` seam carries
    // both, so `pendingWithMs` targets the split condition's own backstop
    // by value rather than `pending()`'s now-ambiguous "most recent".
    expect(timer.calls).toHaveLength(2);
    expect(timer.pendingWithMs(3500)?.ms).toBe(3500);
    expect(timer.pendingWithMs(BURST_HANDOFF_HOLD_MS)?.ms).toBe(
      BURST_HANDOFF_HOLD_MS,
    );

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
    // Storage-spine design spec §2, Task 3: the split condition is resolved
    // — its own backstop is cancelled — but the BURST condition is still
    // owed (this script never hears a summary), so the WHOLE hold stays up
    // ("releasing the hold only if the burst condition is not also owed").
    expect(result.current.handoffHeld).toBe(true);
    expect(timer.pendingWithMs(3500)).toBeNull(); // the split backstop was cancelled
    expect(timer.pendingWithMs(BURST_HANDOFF_HOLD_MS)).not.toBeNull(); // burst's is still live

    // Nothing else ever comes for the burst either — its own backstop is
    // what finally frees the hand-off.
    act(() => {
      timer.pendingWithMs(BURST_HANDOFF_HOLD_MS)!.fire();
    });
    // ...and the hold is over the moment nothing is left to wait for.
    expect(result.current.handoffHeld).toBe(false);
    expect(timer.pending()).toBeNull(); // both backstops are now cancelled

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
    // 150, not a hand-picked figure: `finalBoundary`'s own 60s/200m is what
    // the fake derives `avgSplit` FROM (`derivedAvgSplit`, `transports/
    // fake.ts`, PM final-PR gate condition round) — 500 * 60 / 200 exactly.
    const steps = buildMonitorLogSteps(seen!);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.actualSource).toBe("pm5");
    expect(steps[0]?.actualSplit).toBe(150);
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

    // Nothing else ever comes — no split, no summary, no further tick, no
    // disconnect. Storage-spine design spec §2, Task 3: this natural finish
    // owes BOTH conditions now, so BOTH backstops must fire before the
    // hand-off is free. Fired ONE AT A TIME (review finding, not
    // `timer.calls.forEach`, which cannot distinguish "both backstops
    // needed" from "either one alone releases the hold" — a mutation
    // letting the burst's own timeout release an owed split would pass a
    // `forEach` just as well): the burst's own backstop first —
    // `handoffHeld` must STILL be true, because the split is still owed —
    // then the split's own.
    expect(timer.calls).toHaveLength(2);
    act(() => {
      timer.pendingWithMs(BURST_HANDOFF_HOLD_MS)!.fire();
    });
    expect(result.current.handoffHeld).toBe(true);
    act(() => {
      timer.pendingWithMs(3500)!.fire();
    });

    expect(result.current.handoffHeld).toBe(false);
    expect(result.current.phase).toBe("ended");
    // Honest about what was lost: the record is handed over as it stands.
    expect(loadMonitorRun()?.actuals).toHaveLength(0);
  });

  it("a burst TIMING OUT does not release an owed split — and when the split then genuinely arrives, its own resolution is the ring's release reason 'final-boundary' (Task 3 review finding)", async () => {
    // Task-3-review finding, recorded here rather than worked around
    // silently: the reviewer's own framing was "burst-first ARRIVAL —
    // burst resolves first, split releases last with final-boundary".
    // Traced exhaustively against `driver.ts` (every `summaryObservations
    // Event` call site: `noteTerminateObservations`'s `emitTerminate`
    // (terminate/rower-ended door, no split condition ever exists to
    // race), `reconcileSummary`'s "split-won, held !== null" branch
    // (split already resolved earlier, at its own real arrival), and
    // `reconcileSummary`'s "filled-from-summary" branch (emits
    // `intervalComplete` — resolving split — immediately before its own
    // `summaryObservationsEvent`, same synchronous call, `driver.ts:4302`
    // then `:4308`)), a burst that genuinely ARRIVES cannot resolve before
    // an open split: every dual-emit site puts the split's own resolution
    // first by explicit, commented design ("cause event first",
    // `driver.ts:4536`). What IS reachable, and is what this test proves:
    // a burst that never arrives at all TIMES OUT (2000ms) well before a
    // genuinely late split's own window closes (3500ms) — an ordinary
    // shape spec §2's own timing arithmetic names ("up to 3.5s when the
    // split condition is also owed"). The burst's timeout resolves ONLY
    // the burst condition (the hold stays up, split still owed); the
    // split's own LATER, genuine arrival is what actually releases the
    // hold, and its reason is `"final-boundary"`.
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

    expect(result.current.phase).toBe("ended");
    expect(result.current.handoffHeld).toBe(true);
    expect(timer.calls).toHaveLength(2);

    // No summary is ever delivered in this script — the burst's own
    // backstop is what resolves it, first (2000 < 3500).
    act(() => {
      timer.pendingWithMs(BURST_HANDOFF_HOLD_MS)!.fire();
    });
    // Resolves ONLY the burst condition: the split is still owed, so the
    // WHOLE hold stays up and no `handoff-released` entry exists yet.
    expect(result.current.handoffHeld).toBe(true);
    const beforeSplit = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      beforeSplit.find((e) => e.kind === "handoff-released"),
    ).toBeUndefined();

    // The real split finally arrives, still within its own window.
    tick(fake, 100);

    expect(result.current.actuals).toHaveLength(1);
    // Burst already resolved (by timeout) — the split's own resolution is
    // what releases the hold now, and it is the LAST word in the ring.
    expect(result.current.handoffHeld).toBe(false);
    const afterSplit = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const released = afterSplit.find((e) => e.kind === "handoff-released");
    expect(released?.detail).toContain("final-boundary");
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

  it("the DESKTOP order pays nothing ON THE SPLIT — but storage-spine design spec §2, Task 3 widened the hold, so it now still waits for the machine's own summary burst", async () => {
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
    expect(result.current.actuals).toHaveLength(1);
    expect(loadMonitorRun()?.actuals).toHaveLength(1);
    // Nothing is missing on the SPLIT, so `openHandoffHold` opens nothing —
    // pre-Task-3 this was the whole hold, and the hand-off really was
    // immediate. Task 3 widened what the hold OWES: `summaryTotals` is
    // still `undefined` here (this script never delivers one), so the
    // BURST condition opens regardless — exactly the "typical machine
    // finish ... total added wait ~0.3-0.6s over today" case spec §2's own
    // timing arithmetic names, at its zero-split-wait extreme.
    expect(result.current.handoffHeld).toBe(true);
    expect(timer.calls).toHaveLength(1);
    expect(timer.calls[0]).toMatchObject({
      ms: BURST_HANDOFF_HOLD_MS,
      cancelled: false,
    });

    // The burst never arrives either, so its own backstop is what finally
    // frees the hand-off — same bounded exit every other condition gets.
    act(() => {
      timer.pending()!.fire();
    });
    expect(result.current.handoffHeld).toBe(false);
  });

  it("a MACHINE-TERMINATED ending never holds the SPLIT — the driver opens no finish grace for it — but storage-spine design spec §2, Task 3 makes it hold for the BURST, the arm the corpus's own worst case lives on", async () => {
    // The rower stopped the piece at the erg: the machine reports
    // TERMINATE, not WORKOUTEND. `driver.ts` opens no finish grace on that
    // path (CSAFE-DEF footnote 12 — a mid-terminate Split/Interval Number
    // has no stable interval to name), so no SPLIT boundary of ours is
    // coming and the split condition never opens. Task 3: a Menu terminate
    // is still burst-eligible (`endedBy: "rower"`, `driver.ts:2724`'s
    // `terminated` emit) — this is the exact defect `:2201` used to
    // hardcode away (`held = false` on this branch, unconditionally) and
    // the arm the corpus's own worst case (542 ms, `smoke-terminated`)
    // lives on.
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
    expect(result.current.handoffHeld).toBe(true);
    expect(timer.calls).toHaveLength(1);
    expect(timer.calls[0]).toMatchObject({
      ms: BURST_HANDOFF_HOLD_MS,
      cancelled: false,
    });
    expect(loadMonitorRun()?.terminated).toBe(true);

    // The burst never arrives in this script either — its own backstop is
    // the bounded exit, same as every other condition.
    act(() => {
      timer.pending()!.fire();
    });
    expect(result.current.handoffHeld).toBe(false);
  });

  it("BURST_HANDOFF_HOLD_MS is pinned at exactly 2000ms — held at 1999, released at 2000 (PR #228 review finding 2)", async () => {
    // James's own mutation, PR #228 review: changed `BURST_HANDOFF_HOLD_MS`
    // 2000 -> 2400 and all 205 scoped monitor tests (including
    // `summaryHoldReplay.test.ts`'s own leg 3, which imports the constant
    // and advances the virtual clock past it) stayed GREEN — every
    // existing check compared production to itself, none pinned the
    // NUMBER. This test uses two LITERALS (1999, 2000), independent of the
    // imported constant entirely, so a retune goes red here specifically.
    //
    // Real `vi.useFakeTimers()`, not `manualSchedule()`: a manual fake's
    // `fire()` is triggered by the TEST, not by elapsed time, so it cannot
    // distinguish "the backstop is due at 1999ms" from "due at 2000ms" —
    // there is no elapsed-time semantics to violate. `openBurstHold`'s own
    // DEFAULT fallback (real `setTimeout`, used here by supplying no
    // `schedule` override at all) is the one seam where an exact
    // millisecond boundary is a real, testable fact. Not `harness()` (this
    // file's own header on it: "File-wide `vi.useFakeTimers()` ... is not
    // usable here ... 19 tests fail under it") — the manual
    // `createFakeTransport` + `renderHook` composition the two existing
    // `vi.useFakeTimers()` tests above in this file already use (the
    // watchdog tests, "a suppressed stream trips the REAL watchdog").
    vi.useFakeTimers();
    try {
      const fake = createFakeTransport({
        deviceName: DEVICE_NAME,
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
      });
      const { result } = renderHook(() =>
        useMonitorSession({
          createTransport: () => fake,
          now: () => t0,
          driverOptions: {
            settleTicks: 0,
            prepareSettleTicks: 0,
            schedule: () => (): void => undefined,
          },
          // No `schedule` override here — this hook-level default
          // fallback (real `setTimeout`) is the exact seam under test.
        }),
      );

      await connect(result);
      await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
      tick(fake, 100);
      tick(fake, 100);

      expect(result.current.phase).toBe("ended");
      expect(result.current.handoffHeld).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(result.current.handoffHeld).toBe(true); // HELD at 1999ms

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.handoffHeld).toBe(false); // RELEASED at 2000ms
    } finally {
      vi.useRealTimers();
    }
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

  it("the rower's own End never holds the SPLIT — End is a decision, not a finish — but storage-spine design spec §2, Task 3 makes a link-up End the THIRD burst-eligible arm", async () => {
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
    // `endSession` never opens the SPLIT condition (End is a decision, not
    // a finish — there is no boundary of that kind to wait for), but the
    // link is up (`endedBy: "rower"` on the record), so `openBurstHold()`
    // owes the BURST condition exactly like a Menu terminate does.
    expect(result.current.handoffHeld).toBe(true);
    expect(timer.calls).toHaveLength(1);
    expect(timer.calls[0]).toMatchObject({
      ms: BURST_HANDOFF_HOLD_MS,
      cancelled: false,
    });

    act(() => {
      timer.pending()!.fire();
    });
    expect(result.current.handoffHeld).toBe(false);
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
    // Storage-spine design spec §2, Task 3: this natural finish owes BOTH
    // conditions (missing split, and no summary heard yet) — both live on
    // the same `schedule` seam.
    expect(timer.calls).toHaveLength(2);

    act(() => {
      fake.injectDisconnect();
    });

    // Still held — nothing was emitted to release it...
    expect(result.current.handoffHeld).toBe(true);
    // ...and the rower is not stranded on the ended frame either: BOTH
    // backstops must fire before the hand-off is free — fired one at a
    // time (review finding), not `forEach`, which cannot distinguish
    // "both needed" from "either one alone releases the hold".
    act(() => {
      timer.pendingWithMs(BURST_HANDOFF_HOLD_MS)!.fire();
    });
    expect(result.current.handoffHeld).toBe(true);
    act(() => {
      timer.pendingWithMs(3500)!.fire();
    });
    expect(result.current.handoffHeld).toBe(false);
    // The ending stands: a drop AFTER the machine finished does not drag the
    // session back out of `ended` (spec's C5 ruling, unchanged).
    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
  });

  it("unmounting during the hold cancels its backstop — no timer outlives the burst linger (storage-spine design spec §2, Task 3: this natural finish never hears a burst, so the deferred release is what finally cancels it)", async () => {
    const timer = manualSchedule();
    const burstTimer = manualSchedule();
    const { result, fake, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
        ],
      },
      { schedule: timer.schedule, burstLingerSchedule: burstTimer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.handoffHeld).toBe(true);

    unmount();

    // Task 3: the backstops are NOT cancelled synchronously any more — this
    // run's `summaryTotals` is still unset (no burst ever arrives in this
    // script), so teardown defers STEP 1 — and `releaseHandoff("teardown")`
    // stays glued to it (the same glue that keeps a genuine fill's
    // "final-boundary" reason from being pre-empted) — to the burst
    // linger's own timeout instead. TWO backstops now, not one: the split
    // condition's own (missing actual) AND the burst condition's own (no
    // summary heard yet) — both opened on this same natural finish.
    expect(timer.calls).toHaveLength(2);
    expect(timer.calls[0]!.cancelled).toBe(false);
    expect(timer.calls[1]!.cancelled).toBe(false);
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);

    // The linger's own cap elapses — no burst ever came — and NOW BOTH
    // backstops are cancelled, no timer left outliving the session.
    act(() => {
      burstTimer.pending()!.fire();
    });
    expect(timer.calls[0]!.cancelled).toBe(true);
    expect(timer.calls[1]!.cancelled).toBe(true);

    // ...and it says so IN THE STASH: the release runs as the deferred
    // path's first statement, above the (second) export, so a session torn
    // down mid-hold leaves a trace that accounts for the hold instead of
    // one that just stops (review M-1). This is the ordering, asserted
    // through the artifact the operator actually reads at the erg.
    const stashed = sessionStorage.getItem("ergomatic:last-rowed-log") ?? "[]";
    const kinds = (JSON.parse(stashed) as { kind: string; detail: string }[])
      .filter((e) => e.kind.startsWith("handoff"))
      .map((e) => `${e.kind}:${e.detail.slice(0, 8)}`);
    // Storage-spine design spec §2, Task 3: TWO `handoff-hold` entries now
    // (split, then burst — the order `endByMachine` opens them in), still
    // ONE `handoff-released` (the hold itself releases once, when neither
    // condition remains owed).
    expect(kinds).toStrictEqual([
      "handoff-hold:machine ",
      "handoff-hold:burst-el",
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
    // The record's own verdict on the late actual — settled the instant the
    // split lands, independent of the hold's own fate.
    const filed = entries.find((e) => e.kind === "record-actual");
    expect(filed?.detail).toContain("accepted");
    expect(filed?.detail).toContain("index=0");

    // Storage-spine design spec §2, Task 3: this natural finish ALSO owes
    // the BURST condition (no summary is ever delivered in this script), so
    // the split's own resolution ("resolve the split condition") no longer
    // releases the WHOLE hold by itself — that only happens "when no owed
    // condition remains". Both conditions were opened (their own
    // `handoff-hold` entries), but no `handoff-released` entry exists yet.
    expect(kinds.filter((k) => k === "handoff-hold")).toHaveLength(2);
    expect(entries.find((e) => e.kind === "handoff-released")).toBeUndefined();
    expect(result.current.handoffHeld).toBe(true);

    // The burst never arrives either; its own backstop is what finally
    // frees the hand-off, and the ring records THAT reason.
    act(() => {
      timer.pendingWithMs(BURST_HANDOFF_HOLD_MS)!.fire();
    });
    expect(result.current.handoffHeld).toBe(false);
    const afterBurst = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const released = afterBurst.find((e) => e.kind === "handoff-released");
    expect(released?.detail).toContain("burst-timeout");
    // ...and it reports what the rower is actually being handed.
    expect(released?.detail).toContain("1 actual(s) measured");
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
    // before 3500. Storage-spine design spec §2, Task 3: this natural
    // finish ALSO owes the BURST condition (`summaryTotals` still
    // undefined) on the same `schedule` seam as the split's own — hence
    // `pendingWithMs` rather than `pending()`'s now-ambiguous "most recent".
    expect(driverTimer.pending()?.ms).toBe(3000);
    expect(timer.calls).toHaveLength(2);
    expect(timer.pendingWithMs(3500)?.ms).toBe(3500);
    expect(timer.pendingWithMs(BURST_HANDOFF_HOLD_MS)?.ms).toBe(
      BURST_HANDOFF_HOLD_MS,
    );

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
    // RC-7 (storage-spine design spec §2): the synthesized-final fallback
    // OMITS `restDistanceMeters` rather than asserting the wire's own
    // "no rest" `0` for a quantity it never measured.
    expect(result.current.actuals[0]).not.toHaveProperty("restDistanceMeters");
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
    // The MEASURED averages are ABSENT from the log step, not zero and not
    // the workout's: `buildMonitorLogSteps` drops a null average field
    // entirely, which is exactly what an omitted-average actual is supposed
    // to produce downstream (design spec §5's B3 — the fake sends real
    // non-zero averages on 0x0039, so this proves a drop, not an echo).
    expect(steps[0]).not.toHaveProperty("actualSplit");
    expect(steps[0]).not.toHaveProperty("actualSpm");
    expect(steps[0]).not.toHaveProperty("avgHr");
    // Phase LT spec 1, §2, AMENDED at Task 1 review: `spm` is ALSO
    // absent here, even though ONE_INTERVAL authors `displaySpm: 22` —
    // this actual IS matched (the gate synthesized it at the deadline),
    // so the amended rule applies: on a matched actual, `spm` is written
    // ONLY alongside `actualSpm`, never alone. avgSpm is null on this
    // synthesized actual (no reading at all, same as the split/HR
    // averages above), so the target copy is suppressed too — a
    // dropped measurement must never let the authored target stand in
    // for a reading that didn't happen (`buildMonitorLogSteps`'s own
    // doc comment carries the full rationale). Before the amendment this
    // assertion read `.toBe(22)`; that was the exact defect the review
    // caught — a NEW row, shaped like an OLD pre-split one.
    expect(steps[0]).not.toHaveProperty("spm");

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
    // Storage-spine design spec §2, Task 3: `reconcileSummary`'s single
    // synchronous callback (fired by `driverTimer.pending()!.fire()` above)
    // both synthesizes the actual (resolving the SPLIT condition — held,
    // because the BURST condition, opened on this same natural finish, is
    // still owed) AND — since the hash was already in hand from the
    // `deliverSummary` call above — immediately calls
    // `noteTerminateObservations`, which resolves the BURST condition
    // right after. The burst resolves LAST, so its reason is what the
    // hold's own single release entry names.
    expect(
      entries.find((e) => e.kind === "handoff-released")?.detail,
    ).toContain("burst-heard");
  });

  it("Task 7, THE ORDERING PIN, UPDATED FOR THE BURST LINGER (storage-spine design spec §2, Task 3): a reconcile that fires at DEFERRAL END — not at teardown itself any more — still lands in the SECOND STASH SNAPSHOT, not merely the in-memory ring (§22's own recorded trap: an entry written after a stash is taken dies with the tab)", async () => {
    // Same shape as "THE DROPPED SPLIT, END TO END" above, but the rower
    // leaves BEFORE the driver's own deadline ever fires. Before Task 3
    // this was the exact window the twin defect lost — `disconnect()` used
    // to just cancel the pending reconcile — and teardown's own immediate
    // `driver.reconcile()` call closed it. Task 3 now DEFERS that call for
    // exactly this shape (a natural finish whose burst has not landed):
    // the fix this test pins is real, but it now fires at the burst
    // linger's own deferral end, not synchronously inside `unmount()`.
    const timer = manualSchedule();
    const driverTimer = manualSchedule();
    const burstTimer = manualSchedule();
    let driverMs = 0;
    const { result, fake, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
        ],
      },
      {
        schedule: timer.schedule,
        burstLingerSchedule: burstTimer.schedule,
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

    // 0x0039 arrives inside the grace and is HELD — nothing is filed yet,
    // and the deadline that would normally file it is still pending.
    driverMs = 400;
    act(() => {
      fake.deliverSummary({ elapsedSeconds: 62.5, meters: 214 });
    });
    expect(driverTimer.pending()?.ms).toBe(3000);
    expect(result.current.actuals).toHaveLength(0);

    // The rower leaves. STEPS 1/3/4 do NOT run synchronously here any
    // more — the record is naturally-finished with no burst observation
    // recorded yet, so teardown defers and arms its own `BURST_LINGER_MS`
    // timer instead.
    unmount();
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);
    expect(driverTimer.pending()).not.toBeNull(); // not yet consumed

    // The FIRST stash (teardown's own STEP 2, still at t=0) cannot see the
    // fill — nothing has drained it yet.
    const firstStash = JSON.parse(
      sessionStorage.getItem("ergomatic:last-monitor-log")!,
    ) as { kind: string; detail: string }[];
    expect(firstStash.some((e) => e.kind === "summary-reconciled")).toBe(false);

    // The linger's own deadline elapses. Teardown must reconcile BEFORE it
    // takes the SECOND stash: if it stashed first, that snapshot would be
    // serialized before the fill ever reached the ring, and every
    // assertion below would fail even though the in-memory ring
    // (unreachable from this test, and unread by design — the RING is not
    // the artifact that survives the tab) had gone on to record it a line
    // later.
    act(() => {
      burstTimer.pending()!.fire();
    });

    const stashed = sessionStorage.getItem("ergomatic:last-monitor-log");
    expect(stashed).not.toBeNull();
    const entries = JSON.parse(stashed!) as { kind: string; detail: string }[];
    const verdict = entries.find((e) => e.kind === "summary-reconciled");
    expect(verdict?.detail).toContain("filled-from-summary");
    const filed = entries.find((e) => e.kind === "record-actual");
    expect(filed?.detail).toContain("accepted");
    expect(filed?.detail).toContain("finalBoundary=true");
    // Storage-spine design spec §2, Task 3: `driver.reconcile()` (called
    // from `reconcileAndReleaseHandoff` at the top of this deferred
    // `finish`) runs the identical synchronous chain "THE DROPPED SPLIT"
    // pins — the fill resolves the SPLIT condition (still held, burst
    // outstanding), then `noteTerminateObservations` (hash already in
    // hand from `deliverSummary` above) resolves the BURST condition right
    // after, which is what actually releases the hold. The subsequent
    // `releaseHandoff("teardown")` call in `reconcileAndReleaseHandoff`
    // finds both conditions already resolved and is a no-op, so the ring's
    // one `handoff-released` entry still names the condition that
    // genuinely resolved last.
    expect(
      entries.find((e) => e.kind === "handoff-released")?.detail,
    ).toContain("burst-heard");
    // The deadline was CONSUMED at deferral end, not left dangling — the
    // same timer-hygiene bar every other test in this file holds
    // `teardown` to.
    expect(driverTimer.pending()).toBeNull();
  });

  it("MENU TERMINATE RELEASES ON BURST-HEARD (Task 5, storage-spine design spec §2): the arm `:2201` used to hardcode away, still mounted throughout — no unmount, no backstop, the write attempt alone frees the hand-off", async () => {
    // `noteTerminateObservations` (driver.ts) never emits synchronously when
    // the hash hasn't arrived yet (`deliverSummary` sends 0x0039 alone, same
    // as (g)/(h) below) — it waits out its own `HASH_SUBWINDOW_MS` (200ms)
    // on the DRIVER's schedule seam, separate from the hook's own hand-off
    // backstop (`BURST_HANDOFF_HOLD_MS`, 2000ms) on `timer` below. Both are
    // driven by hand here, deliberately kept apart, so this test proves the
    // release comes from the WRITE ATTEMPT (driverTimer fired at 200ms) and
    // not from the hold's own much-longer backstop (timer, at 2000ms,
    // which never fires in this script).
    const timer = manualSchedule();
    const driverTimer = manualSchedule();
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
      {
        schedule: timer.schedule,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    // The Menu terminate opened the burst condition — `:2201`'s own old
    // hardcoded `held = false` would fail this line outright.
    expect(result.current.handoffHeld).toBe(true);
    expect(timer.calls).toHaveLength(1);
    expect(timer.calls[0]).toMatchObject({
      ms: BURST_HANDOFF_HOLD_MS,
      cancelled: false,
    });

    act(() => {
      fake.deliverSummary({ elapsedSeconds: 40, meters: 130 });
    });
    // Buffered, waiting on the hash sub-window — not yet resolved.
    expect(result.current.handoffHeld).toBe(true);
    expect(driverTimer.pending()?.ms).toBe(200);

    act(() => {
      driverTimer.pending()!.fire();
    });

    // The write attempt is what frees the hand-off — STILL MOUNTED, no
    // navigation-driven teardown involved — and it cancels the hook's own
    // 2000ms backstop rather than waiting for it.
    expect(result.current.handoffHeld).toBe(false);
    expect(timer.calls[0]!.cancelled).toBe(true);
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(entries.find((e) => e.kind === "handoff-hold")?.detail).toContain(
      "burst-eligible",
    );
    const recorded = entries.find((e) => e.kind === "summary-recorded");
    expect(recorded?.detail).toContain("workDistanceMeters");
    const released = entries.find((e) => e.kind === "handoff-released");
    expect(released?.detail).toContain("burst-heard");
    expect(loadMonitorRun()?.summaryTotals).toStrictEqual({
      workElapsedSeconds: 40,
      workDistanceMeters: 130,
    });
  });

  // FORMERLY "APPEND-REJECTED": gate 4's write-once refusal, DELETED at the
  // hook-integration level (hand-off store design spec §1/§3, plan Task 3).
  // The original fixture forced the refusal by seeding `summaryTotals`
  // directly onto STORAGE, bypassing the hook's own in-memory `runRef`
  // entirely — that technique only worked because `appendSummaryObservations`
  // used to re-read storage fresh (`stillLive`, now deleted). Under this
  // design the pure gate reads whatever the CALLER (this hook) passes —
  // its own `runRef.current` — never storage, so a raw storage write can no
  // longer reach the guard at all. The only other way to reach it — the
  // driver delivering `summary-observations` TWICE — is independently
  // blocked by the driver's own "`reconcileSummary` runs AT MOST ONCE per
  // run whichever site" contract (`driver.ts`), confirmed empirically: a
  // second `fake.deliverSummary()` call in this same script never produces
  // a second event at this hook at all. Gate 4's write-once behavior is
  // still covered, at the layer that can actually exercise it directly:
  // `monitorRun.test.ts`'s "write-once door still keyed on summaryTotals"
  // test calls `appendSummaryObservations` twice with an explicit base.

  it("SUMMARY-NO-RUN (Task 5, storage-spine design spec §2/§5): a burst arriving with no run identity resolves nothing and opens nothing — the fourth code path, not an exit of its own", async () => {
    // The driver's OWN `activeRun` opens at ARM, independent of this hook's
    // `runRef` (which opens only at the first genuinely-rowing frame,
    // `openHandoffHold`'s own doc comment). A Menu terminate pressed before
    // any rowing frame ever arrives closes the driver's run — and still
    // reaches `endByMachine(true)` (this file's "a piece that finished
    // without anyone rowing it" test proves the natural-finish sibling of
    // this same shape) — while this hook's `runRef.current` has stayed
    // `null` the whole time. The burst, delivered afterward, is still
    // decoded and forwarded by the driver (`noteSummary`'s "late" door,
    // gated only on the DRIVER's own `terminatedAwaitingSummary`), and the
    // hook's own handler finds no identity to attempt a write against.
    const driverTimer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, {
            workoutState: WORKOUTSTATE_TERMINATE,
            elapsedSeconds: 0,
            distanceMeters: 0,
            spm: 0,
            currentSplit: 0,
          }),
        ],
      },
      {
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    // No record ever existed — `openBurstHold`'s own `run === null` branch
    // (a "never-rowed close", its own doc comment) opens nothing.
    expect(result.current.handoffHeld).toBe(false);
    expect(loadMonitorRun()).toBeNull();

    act(() => {
      fake.deliverSummary({ elapsedSeconds: 40, meters: 130 });
    });
    expect(driverTimer.pending()?.ms).toBe(200);
    act(() => {
      driverTimer.pending()!.fire();
    });

    expect(result.current.handoffHeld).toBe(false);
    expect(loadMonitorRun()).toBeNull();
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(entries.find((e) => e.kind === "handoff-hold")).toBeUndefined();
    const noRun = entries.find((e) => e.kind === "summary-no-run");
    expect(noRun?.detail).toContain("no run identity");
  });
});

// Hand-off store design spec §1/§7, plan Task 3's own gate rows (§10 rows
// 4/5/7) — the hook's sole-committer discipline, the held-error state
// machine, and `retryHandoffSave`/`proceedHandoff`. Row 5 (tombstone
// refusal) lives in the "teardown — the burst linger" describe block above,
// scenario (d) — retargeted there rather than duplicated here, since it
// needs that block's own burst-linger fixture.
describe("useMonitorSession: the hand-off store (design spec §1/§7, plan Task 3)", () => {
  /** Denies every `localStorage.setItem` call for `MONITOR_RUN_KEY`
   *  matching `predicate` against the parsed payload — the same
   *  payload-inspecting idiom `handoffStoreReplay.test.ts`'s own
   *  `installClosedWriteDenial` established (spec §3: "deny by content,
   *  never by count alone"). Returns the restore function. */
  function installMonitorRunWriteDenial(
    predicate: (parsed: unknown) => boolean,
  ): () => void {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (
      this: Storage,
      key: string,
      value: string,
    ): void {
      if (key === MONITOR_RUN_KEY) {
        const parsed: unknown = JSON.parse(value);
        if (predicate(parsed)) {
          throw new Error("simulated storage failure");
        }
      }
      original.call(this, key, value);
    };
    return () => {
      Storage.prototype.setItem = original;
    };
  }

  /** Drives ONE_INTERVAL live, then ends it through the ONE genuinely
   *  no-conditions-owed door: End with the link already gone (`endSession`,
   *  `endedBy: "link-lost"`). `openBurstHold`'s own predicate excludes
   *  `link-lost` outright and `endSession` never calls `openHandoffHold`
   *  at all — so NEITHER hold opens, and the verify runs synchronously in
   *  this SAME `ended` patch, the exact row this describe block's tests
   *  target (an existing pin, "End after the link is gone stores endedBy
   *  link-lost", already proves `handoffHeld: false` for this shape on a
   *  HEALTHY write; these tests are its denied-write sibling). */
  async function driveToTerminatedEnd(): Promise<Session> {
    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [status(100, { elapsedSeconds: 30, distanceMeters: 100 })],
    });
    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    act(() => {
      fake.injectDisconnect();
    });
    expect(result.current.phase).toBe("disconnected");
    await act(async () => {
      await result.current.endSession();
    });
    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("user");
    return result;
  }

  it("a denied durable write on the no-conditions-owed close enters held-error, with a receipt — row 7's first shape (denied-from-close)", async () => {
    const restore = installMonitorRunWriteDenial(
      (parsed) =>
        (parsed as { completedAt: string | null }).completedAt !== null,
    );
    try {
      const result = await driveToTerminatedEnd();
      expect(result.current.handoffHeld).toBe(true);
      expect(result.current.holdError).toBe("storage-failed");
      const entries = JSON.parse(result.current.exportLog()) as {
        kind: string;
        detail: string;
      }[];
      expect(
        entries.find((e) => e.kind === "hold-error-entered"),
      ).toBeDefined();
    } finally {
      restore();
    }
  });

  it("retryHandoffSave heals a denied write, releases, and NEVER bumps revision — a follow-on producer commit is still accepted (the headline-loss case, pinned)", async () => {
    let deny = true;
    const restore = installMonitorRunWriteDenial(() => deny);
    try {
      const result = await driveToTerminatedEnd();
      expect(result.current.holdError).toBe("storage-failed");
      const beforeRetry = currentUnretiredHandoffForTest();
      expect(beforeRetry).not.toBeNull();
      const revisionBeforeRetry = beforeRetry!.revision;

      // Heals: the NEXT durable attempt (Retry's own) succeeds.
      deny = false;
      await act(async () => {
        await result.current.retryHandoffSave();
      });
      expect(result.current.holdError).toBeNull();
      expect(result.current.handoffHeld).toBe(false);
      expect(loadMonitorRun()?.completedAt).not.toBeNull();

      // THE PIN, asserted directly (not merely inferred from the release):
      // the heal must NOT have bumped the store's own revision for this
      // key — `retryDurable`'s own contract (spec §1: "modelling Retry as
      // `commit` would stale the hook's own ref and refuse the next
      // producer commit").
      const afterRetry = currentUnretiredHandoffForTest();
      expect(afterRetry).not.toBeNull();
      expect(afterRetry!.revision).toBe(revisionBeforeRetry);

      // THE HEADLINE-LOSS CASE ITSELF: a follow-on producer commit, using
      // the SAME `expectedRevision` the hook's own `lastAcceptedRevisionRef`
      // still believes (unbumped by the heal), must be ACCEPTED — modelling
      // Retry as `commit` would have bumped the store's revision, making
      // this late write's CAS check stale and refusing exactly the write
      // the design's headline scenario depends on landing.
      const followOn = commitHandoffForTest(
        afterRetry!.sessionKey,
        afterRetry!.revision,
        { ...afterRetry!.run, title: "a late follow-on commit" },
      );
      expect(followOn.accepted).toBe(true);

      // A no-op call once already released — idempotent, same posture as
      // `releaseHandoff`/`resolveHandoffCondition`.
      await act(async () => {
        await result.current.retryHandoffSave();
      });
      expect(result.current.holdError).toBeNull();
    } finally {
      restore();
    }
  });

  it("retryHandoffSave that fails again STAYS held — no timer, no auto-exit", async () => {
    const restore = installMonitorRunWriteDenial(() => true);
    try {
      const result = await driveToTerminatedEnd();
      expect(result.current.holdError).toBe("storage-failed");

      await act(async () => {
        await result.current.retryHandoffSave();
      });
      // Still denied: stays held.
      expect(result.current.holdError).toBe("storage-failed");
      expect(result.current.handoffHeld).toBe(true);
    } finally {
      restore();
    }
  });

  it("proceedHandoff releases WITHOUT a confirmed write — no stash calls exist anymore, the memory tier is already current", async () => {
    const restore = installMonitorRunWriteDenial(() => true);
    try {
      const result = await driveToTerminatedEnd();
      expect(result.current.holdError).toBe("storage-failed");

      await act(async () => {
        await result.current.proceedHandoff();
      });
      expect(result.current.holdError).toBeNull();
      expect(result.current.handoffHeld).toBe(false);
      const entries = JSON.parse(result.current.exportLog()) as {
        kind: string;
        detail: string;
      }[];
      expect(
        entries.find((e) => e.kind === "hold-error-proceed"),
      ).toBeDefined();
      // The durable tier is STILL denied — proceeding does not retry it.
      expect(loadMonitorRun()).toBeNull();
    } finally {
      restore();
    }
  });

  it("retryHandoffSave/proceedHandoff are no-ops when nothing is held", async () => {
    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [status(100, { elapsedSeconds: 30, distanceMeters: 100 })],
    });
    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    expect(result.current.holdError).toBeNull();

    await act(async () => {
      await result.current.retryHandoffSave();
    });
    expect(result.current.holdError).toBeNull();

    await act(async () => {
      await result.current.proceedHandoff();
    });
    expect(result.current.holdError).toBeNull();
  });

  it("a `saved-without-series` heal is still a release, not a hold — a degraded-but-landed write is a landed write", async () => {
    // Deny the FULL write (series present) but let the sacrifice retry
    // (without series) land — `performDurableWrite`'s own ordering,
    // `handoffStore.ts`. The verify reads the cached verdict, which is
    // `"saved-without-series"`, not `"failed"` — no hold at all.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (
      this: Storage,
      key: string,
      value: string,
    ): void {
      if (key === MONITOR_RUN_KEY) {
        const parsed = JSON.parse(value) as { series?: unknown };
        if (parsed.series !== undefined) {
          throw new Error("simulated quota error (series present)");
        }
      }
      original.call(this, key, value);
    };
    try {
      const result = await driveToTerminatedEnd();
      // The sacrifice DID run — `SeriesRecorder`'s own "first-frame-wins
      // bucket 0" guarantee means the one live frame this script delivers
      // already left a sample by the time `endSession`'s `closeRecord`
      // attaches it (`withSeries`), so the FULL write (with series) was
      // genuinely denied and the smaller retry (without it) is what
      // landed — confirmed directly, not inferred from a null holdError
      // alone (which a script that never attached a series at all would
      // also produce, for the wrong reason).
      const stored = loadMonitorRun();
      expect(stored?.series).toBeUndefined();
      expect(stored?.seriesDropped).toBe(true);
      // A degraded-but-landed write is still a landed write — no hold.
      expect(result.current.holdError).toBeNull();
      expect(result.current.handoffHeld).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("cached-verdict CURRENCY — row 7: the close write lands healthy, but the LATER burst write is denied; the release must read the verdict AS OF release time, not a stale snapshot taken at close", async () => {
    // Deny ONLY the summary's own fold-in write (the one carrying
    // `summaryTotals`) — the close write itself (no `summaryTotals` field
    // yet) lands healthy. Spec §7's own words: "the release funnel reads
    // the CACHED verdict — the last accepted commit's, not the close
    // commit's ... up to two durable writes land between close and
    // release." A verify that re-checked only the close's own verdict
    // (rather than re-reading the cache fresh at release time) would
    // wrongly release here.
    const restore = installMonitorRunWriteDenial(
      (parsed) =>
        (parsed as { summaryTotals?: unknown }).summaryTotals !== undefined,
    );
    try {
      const driverTimer = manualSchedule();
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
        {
          driverOptions: {
            settleTicks: 0,
            prepareSettleTicks: 0,
            schedule: driverTimer.schedule,
          },
        },
      );

      await connect(result);
      await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
      tick(fake, 100);
      tick(fake, 100); // the Menu press — closes healthy, burst hold opens
      expect(result.current.phase).toBe("ended");
      expect(result.current.handoffHeld).toBe(true);
      // The CLOSE landed fine — proving this is not simply "everything is
      // denied" (the earlier, broader-predicate test's own shape).
      expect(loadMonitorRun()?.completedAt).not.toBeNull();
      expect(result.current.holdError).toBeNull();

      // The burst arrives and its OWN write is denied — the release
      // funnel (`resolveHandoffCondition`) is what runs the verify here,
      // and it must see THIS failure, not the close's own healthy one.
      act(() => {
        fake.deliverSummary({ elapsedSeconds: 40, meters: 130 });
      });
      expect(driverTimer.pending()?.ms).toBe(200);
      act(() => {
        driverTimer.pending()!.fire();
      });

      expect(result.current.handoffHeld).toBe(true);
      expect(result.current.holdError).toBe("storage-failed");
    } finally {
      restore();
    }
  });

  // §10 ROW 2, THE WIRE AXIS — added at the final fix round (2026-08-30)
  // after the antagonist's §10 audit proved the row had NO gate at all: its
  // OWN named mutation ("gate the post-release commit on a window
  // predicate") passed 0 of 5638 tests even as a bare `throw`, because no
  // test in the repo ever let a producer commit follow a release.
  //
  // **THE ROW'S DIRECTION, read off the spec rather than paraphrased.**
  // §10 row 2: "Producer update after release, four orderings ... ALL REACH
  // `commit`". §4 invariant 4: "Every accepted producer update AFTER
  // RELEASE either reaches the current consumer, or remains recoverable."
  // §9.1 names the only thing that stops one — the delivery window's own
  // end, not the release. So the invariant is that a late producer update
  // LANDS; the mutation the row names is what would break it. A guard
  // refusing post-release commits is not the fix for this gap, it IS the
  // mutation: it would delete §1's "headline case" (the late burst) and
  // row 3's whole premise (R1 committed from the OLD hook's teardown,
  // AFTER the new route rendered).
  //
  // The ordering driven here is release-before-teardown, before navigation:
  // the burst backstop times the hold out while the rower is still on the
  // connected surface and the subscription is still live, and the machine's
  // summary arrives afterwards. The store must take it.
  it("row 2 — A PRODUCER UPDATE ARRIVING AFTER THE HAND-OFF RELEASED STILL REACHES `commit`: the burst backstop frees the surface, THEN the machine's summary lands, and the store accepts it (revision advances, receipt after the release)", async () => {
    const timer = manualSchedule();
    const driverTimer = manualSchedule();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
          finalBoundary(300),
        ],
      },
      {
        schedule: timer.schedule,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100); // the natural finish — BOTH conditions open
    tick(fake, 100); // the split lands, resolving the split condition only
    expect(result.current.actuals).toHaveLength(1);
    expect(result.current.handoffHeld).toBe(true);

    // THE RELEASE, with nothing committed after it yet: the burst never
    // came inside its own backstop, so the hold times out and the surface
    // is freed (`handoff-released ... burst-timeout`).
    act(() => {
      timer.pendingWithMs(BURST_HANDOFF_HOLD_MS)!.fire();
    });
    expect(result.current.handoffHeld).toBe(false);
    const atRelease = currentUnretiredHandoffForTest();
    expect(atRelease).not.toBeNull();
    expect(atRelease!.run.summaryTotals).toBeUndefined();
    const receiptsAtRelease = (
      JSON.parse(result.current.exportLog()) as { kind: string }[]
    ).filter((e) => e.kind === "store-receipt:commit-accepted").length;

    // ...AND NOW THE MACHINE'S SUMMARY, off the wire, after all of that:
    // the subscription is still up (no unmount, no disconnect), so the
    // driver's own reconcile drains it and the hook folds it onto the
    // record through `applyProducerCommit`.
    act(() => {
      fake.deliverSummary({ elapsedSeconds: 60, meters: 200 });
    });
    act(() => {
      driverTimer.pending()!.fire();
    });

    // THE ROW: the commit LANDED. Revision advanced by exactly one (an
    // independent count — this test made exactly one further producer
    // write, so the number is the test's own arithmetic, not a value read
    // back out of production), the observations are on the record, and the
    // durable tier carries them too.
    const afterBurst = currentUnretiredHandoffForTest();
    expect(afterBurst).not.toBeNull();
    expect(afterBurst!.revision).toBe(atRelease!.revision + 1);
    expect(afterBurst!.run.summaryTotals).toStrictEqual({
      workElapsedSeconds: 60,
      workDistanceMeters: 200,
    });
    expect(loadMonitorRun()?.summaryTotals).toStrictEqual({
      workElapsedSeconds: 60,
      workDistanceMeters: 200,
    });

    // ...and it is genuinely AFTER the release in the ring's own ordering,
    // not merely "at some point during the run": a fresh
    // `store-receipt:commit-accepted` exists at an index BEYOND the last
    // `handoff-released` entry. This is the half a mutation gating the
    // commit on a release predicate cannot survive.
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const releasedAt = entries.findLastIndex(
      (e) => e.kind === "handoff-released",
    );
    expect(releasedAt).toBeGreaterThanOrEqual(0);
    const acceptedAfter = entries
      .slice(releasedAt + 1)
      .filter((e) => e.kind === "store-receipt:commit-accepted");
    expect(acceptedAfter).toHaveLength(1);
    expect(
      entries.filter((e) => e.kind === "store-receipt:commit-accepted"),
    ).toHaveLength(receiptsAtRelease + 1);
    // The record itself says the fold-in happened, so a mutant that
    // silently dropped the write while still emitting a receipt for some
    // OTHER commit cannot pass on the receipt assertions alone.
    expect(entries.some((e) => e.kind === "summary-recorded")).toBe(true);
  });

  it("stale-commit refusal: a commit racing UNDER the hook's own lastAcceptedRevisionRef is refused, runRef unchanged, with a receipt — row 4", async () => {
    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [
        status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
        finalBoundary(150),
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
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    const openedTitle = loadMonitorRun()?.title;
    expect(openedTitle).toBeDefined();
    expect(result.current.actuals).toHaveLength(0);

    // Race the store DIRECTLY underneath the hook's own
    // `lastAcceptedRevisionRef` — a commit this hook never made, bumping
    // the key's revision to 1 while the hook still believes it is 0.
    const current = currentUnretiredHandoffForTest();
    expect(current).not.toBeNull();
    const raced = commitHandoffForTest(current!.sessionKey, current!.revision, {
      ...current!.run,
      title: "RACED — not the hook's own write",
    });
    expect(raced.accepted).toBe(true);

    // THE HOOK'S OWN NEXT PRODUCER COMMIT: a genuine boundary, driving
    // `recordActual` -> `applyProducerCommit`. Its own `expectedRevision`
    // (still 0, `lastAcceptedRevisionRef`'s own belief) is now stale
    // against the store's real current (1, the RACED write's own) —
    // refused. Checked at BOTH the store (storage) and the hook's own
    // PUBLISHED state (`result.current.actuals`) — a mutant that lets
    // `runRef`/`lastAcceptedRevisionRef` update anyway on refusal would
    // pass the storage check alone (the racer already wrote *some* title
    // there) but fail this one, since `actuals` would then show the
    // boundary the store never actually accepted.
    tick(fake, 50);
    expect(loadMonitorRun()?.title).toBe("RACED — not the hook's own write");
    expect(result.current.actuals).toHaveLength(0);
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      entries.some(
        (e) =>
          e.kind === "store-receipt:commit-refused" &&
          e.detail.includes('"reason":"stale"'),
      ),
    ).toBe(true);

    // A SECOND, INDEPENDENT observable: `runRef.current` itself must stay
    // the pre-race value, not merely "the store wasn't touched" — the
    // workout's own natural finish reads `runRef.current` DIRECTLY
    // (`openHandoffHold`'s own `run.actuals.some(a => a.index ===
    // lastIndex)` check) to decide whether the split hold still has
    // something to wait for, with NO commit gating in between. If
    // `runRef.current` had been corrupted to the REFUSED candidate (which
    // already carries the boundary), this would wrongly see the split as
    // already present and skip the hold.
    tick(fake, 50);
    expect(result.current.phase).toBe("ended");
    expect(result.current.handoffHeld).toBe(true);
    const holdEntries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      holdEntries.some(
        (e) => e.kind === "handoff-hold" && e.detail.includes("unmeasured"),
      ),
    ).toBe(true);
  });

  it("the immutability pin: a committed entry is never mutated in place — an OLD reference to it, held across a LATER accepted commit, still reads its own original values (the exact comparison the store's own claim/snapshot discipline depends on)", async () => {
    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [
        status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
        finalBoundary(150),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);

    // A consumer-shaped read, held across the NEXT accepted producer
    // commit — exactly what `LogSession.tsx`'s own mount snapshot does
    // (Task 4's scope; this hook must never break the guarantee that
    // makes it safe: spec §6, "the snapshot retains the entry").
    const held = readHandoffForTest(loadMonitorRun()!.startedAt);
    expect(held).not.toBeNull();
    const heldRun = held!.run;
    const heldActualsLength = heldRun.actuals.length;
    expect(heldActualsLength).toBe(0);
    const heldRevision = held!.revision;

    // THE BOUNDARY LANDS: a genuinely new object per `commit`'s own
    // contract (`handoffStore.ts`: "commit stores `next` BY REFERENCE ...
    // reference identity implements revision identity").
    tick(fake, 50);
    const after = readHandoffForTest(loadMonitorRun()!.startedAt);
    expect(after).not.toBeNull();
    expect(after!.revision).toBeGreaterThan(heldRevision);
    expect(after!.run).not.toBe(heldRun);
    expect(after!.run.actuals).toHaveLength(1);

    // THE PIN: the OLD reference is untouched — its own `actuals` array
    // (and the object itself) still reads exactly what it did the instant
    // it was captured, proving the writer gates return NEW objects rather
    // than mutating the one a consumer might still be holding.
    expect(heldRun.actuals).toHaveLength(heldActualsLength);
    expect(heldRun).toBe(held!.run);
  });

  // Task 5 review fix round (2026-08-30): §5's "armed acceptance" row,
  // EXECUTION half. `ConnectAction.tsx`'s own tests (`ConnectAction.
  // test.tsx`) prove the AUTHORIZATION half — staging at press time — but
  // that file has no real hook/transport to reach the wire "armed" event
  // with, so the retire itself is this describe block's own to prove. A
  // first draft executed the retire at "Connect anyway" press time
  // instead, which the reviewer's own probe showed destroyed a stale
  // record even when the connect attempt then failed or was cancelled —
  // these tests pin the corrected mechanism directly against the real
  // driver/hook composition.
  function fakeLeftoverRun(startedAt: string): MonitorRun {
    return {
      v: 2,
      workoutId: "leftover-workout",
      title: "Leftover",
      program: ONE_INTERVAL,
      logSeed: { steps: [], paces: {} },
      actuals: [],
      deviceName: "PM5 leftover",
      startedAt,
      completedAt: new Date(
        new Date(startedAt).getTime() + 600_000,
      ).toISOString(),
      terminated: false,
    };
  }

  it("the armed leg: a staged Connect-guard authorization is retired exactly at the wire 'armed' event, never earlier", async () => {
    const leftoverKey = new Date(t0.getTime() - 3_600_000).toISOString();
    const created = commitHandoffForTest(
      leftoverKey,
      null,
      fakeLeftoverRun(leftoverKey),
    );
    expect(created.accepted).toBe(true);
    // What `ConnectAction.tsx`'s own `handleConnect` would have staged at
    // press time, well before this hook's own connect()/program() ever
    // ran — the store, not a prop, is how that authorization survives to
    // reach the hook (see `handoffStore.ts`'s own `stagedRetireSet` doc
    // comment).
    stageRetireForTest([{ sessionKey: leftoverKey, revision: 0 }]);

    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [status(100, { elapsedSeconds: 30, distanceMeters: 100 })],
    });
    await connect(result);

    // MID-FLIGHT (pairing/programming, before "armed"): UNTOUCHED — the
    // regression the review caught destroyed this at "Connect anyway"
    // press time, well before this point.
    expect(currentUnretiredHandoffForTest()?.sessionKey).toBe(leftoverKey);

    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    expect(result.current.phase).toBe("ready");

    // ARMED HAS FIRED: retired, consumed, receipted.
    expect(currentUnretiredHandoffForTest()).toBeNull();
    expect(takeStagedRetireForTest()).toStrictEqual([]);
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      entries.some(
        (e) =>
          e.kind === "store-receipt:retire" &&
          e.detail.includes(leftoverKey) &&
          e.detail.includes('"reason":"connect-guard-armed"'),
      ),
    ).toBe(true);
  });

  it("a revision superseded between stage and armed still retires — superseded:true, receipted, not rejected (§1)", async () => {
    const leftoverKey = new Date(t0.getTime() - 3_600_000).toISOString();
    const created = commitHandoffForTest(
      leftoverKey,
      null,
      fakeLeftoverRun(leftoverKey),
    );
    expect(created.accepted).toBe(true);
    const createdRevision = created.accepted ? created.revision : -1;
    stageRetireForTest([{ sessionKey: leftoverKey, revision: 0 }]);

    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [status(100, { elapsedSeconds: 30, distanceMeters: 100 })],
    });
    await connect(result);

    // THE RACE: an unrelated, already-torn-down hook's own linger-window
    // burst lands WHILE this hook is still pairing/programming — after
    // the guard staged revision 0, before "armed" ever consumes it.
    const bumped = commitHandoffForTest(leftoverKey, createdRevision, {
      ...fakeLeftoverRun(leftoverKey),
      title: "Raced — a late burst",
    });
    expect(bumped).toMatchObject({ accepted: true, revision: 1 });

    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);

    expect(currentUnretiredHandoffForTest()).toBeNull();
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const retireEntry = entries.find((e) => e.kind === "store-receipt:retire");
    expect(retireEntry).toBeDefined();
    const receipt = JSON.parse(retireEntry!.detail) as {
      authorizedRevision: number;
      retiredRevision: number;
      superseded: boolean;
    };
    // Never rejected — §1: "a superseded revision... does NOT reject."
    expect(receipt).toMatchObject({
      authorizedRevision: 0,
      retiredRevision: 1,
      superseded: true,
    });
  });

  it("cancel before armed DISCARDS the staged set — the record SURVIVES, both tiers (the reviewer's own probe, promoted to a permanent regression test)", async () => {
    const leftoverKey = new Date(t0.getTime() - 3_600_000).toISOString();
    commitHandoffForTest(leftoverKey, null, fakeLeftoverRun(leftoverKey));
    stageRetireForTest([{ sessionKey: leftoverKey, revision: 0 }]);

    const { result } = harness({
      program: ONE_INTERVAL,
      events: [],
    });
    await connect(result);
    // Never reaches "armed" — Cancel fires from mid-flight, the exact
    // shape a real transport-missing/program failure or a rower's own
    // Cancel press produces (every interstitial state's own doc comment:
    // "Cancel... always lands back on Workout detail with nothing lost").
    await act(async () => {
      await result.current.cancel();
    });

    // THE PROBE: the leftover record is untouched on BOTH tiers — not
    // retired, not superseded, simply still there.
    const survivor = currentUnretiredHandoffForTest();
    expect(survivor).not.toBeNull();
    expect(survivor!.sessionKey).toBe(leftoverKey);
    expect(survivor!.revision).toBe(0);
    expect(loadMonitorRun()?.startedAt).toBe(leftoverKey);
    // The staged set is DISCARDED, not merely "still there waiting" — a
    // LATER, unrelated Connect attempt's own "armed" must not inherit it
    // (rev-3 antagonist: "a set staged for attempt 1 must not authorize
    // attempt 2's retire").
    expect(takeStagedRetireForTest()).toStrictEqual([]);
    // F-4 (Task 5 re-review, 2026-08-30): the discard itself is receipted
    // ("the module receipts rarer things") — distinct from a `retire`
    // receipt, since nothing was actually removed from either tier here.
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      entries.some(
        (e) =>
          e.kind === "store-receipt:staged-retire-discarded" &&
          e.detail.includes(leftoverKey),
      ),
    ).toBe(true);
  });

  // Task 5 re-review (F-1, 2026-08-30): "arm then Cancel" is the ACCEPTED
  // loss, not the Critical recurring — spec §5 sanctions "armed" as the
  // acceptance point, so a rower who reaches the "ready" screen and then
  // Cancels without ever rowing cannot get the staged record back. This
  // pin exists so the next reader finds intent (the record is gone
  // BECAUSE armed fired, verified by the retire receipt's own reason)
  // rather than mistaking the sibling "cancel BEFORE armed" test above
  // for the whole story.
  it("arm then Cancel: the accepted loss — both tiers null, the retire receipt already named 'connect-guard-armed' before Cancel ever ran", async () => {
    const leftoverKey = new Date(t0.getTime() - 3_600_000).toISOString();
    commitHandoffForTest(leftoverKey, null, fakeLeftoverRun(leftoverKey));
    stageRetireForTest([{ sessionKey: leftoverKey, revision: 0 }]);

    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [],
    });
    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    expect(result.current.phase).toBe("ready");

    // THE RETIRE ALREADY HAPPENED, before Cancel is ever pressed.
    expect(currentUnretiredHandoffForTest()).toBeNull();
    expect(loadMonitorRun()).toBeNull();
    const entriesAtArmed = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      entriesAtArmed.some(
        (e) =>
          e.kind === "store-receipt:retire" &&
          e.detail.includes(leftoverKey) &&
          e.detail.includes('"reason":"connect-guard-armed"'),
      ),
    ).toBe(true);

    // Cancel from "ready" cannot undo it — still null on both tiers, no
    // SECOND retire receipt (nothing left to retire again).
    await act(async () => {
      await result.current.cancel();
    });
    expect(currentUnretiredHandoffForTest()).toBeNull();
    expect(loadMonitorRun()).toBeNull();
    const entriesAfterCancel = JSON.parse(result.current.exportLog()) as {
      kind: string;
    }[];
    expect(
      entriesAfterCancel.filter((e) => e.kind === "store-receipt:retire"),
    ).toHaveLength(1);
  });

  it("nothing staged: an UNRELATED unretired entry survives armed untouched by THIS hook's own retire — proves armed is bound to the staged set, never a blind 'whatever's there' sweep (§10 row 1's own mutation target)", async () => {
    // An entry that exists in the store but was NEVER staged by anything
    // — the shape a mutant "armed retires currentUnretired() directly"
    // would wrongly treat as fair game.
    const unrelatedKey = new Date(t0.getTime() - 7_200_000).toISOString();
    commitHandoffForTest(unrelatedKey, null, fakeLeftoverRun(unrelatedKey));
    expect(takeStagedRetireForTest()).toStrictEqual([]); // nothing staged

    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [status(100, { elapsedSeconds: 30, distanceMeters: 100 })],
    });
    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    expect(result.current.phase).toBe("ready");

    // Still there after "armed" — the CORRECT armed handler found nothing
    // staged and did nothing. `createMonitorRun`'s own unchanged defense
    // (this describe block's OWN sibling test, immediately below) is what
    // eventually clears it, at the first real rowing frame, labelled
    // "createMonitorRun-defense" — a DIFFERENT reason than an armed-time
    // retire would carry, which is exactly the observable a mutant
    // collapsing the two would break.
    const stillThere = currentUnretiredHandoffForTest();
    expect(stillThere).not.toBeNull();
    expect(stillThere!.sessionKey).toBe(unrelatedKey);
    const entriesAtArmed = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      entriesAtArmed.some(
        (e) =>
          e.kind === "store-receipt:retire" && e.detail.includes(unrelatedKey),
      ),
    ).toBe(false);

    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    const entriesAfterFrame = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      entriesAfterFrame.some(
        (e) =>
          e.kind === "store-receipt:retire" &&
          e.detail.includes(unrelatedKey) &&
          e.detail.includes('"reason":"createMonitorRun-defense"'),
      ),
    ).toBe(true);
  });

  it("createMonitorRun's own defense retire (spec §5): a leftover unretired entry for a DIFFERENT key is retired before the new create-commit, which then succeeds", async () => {
    // Session 1 opens and is left OPEN (never retired) — the store is a
    // process-wide singleton, so its leftover `current` entry is what
    // session 2's own create is about to collide with.
    const session1 = harness({
      program: ONE_INTERVAL,
      events: [status(100, { elapsedSeconds: 30, distanceMeters: 100 })],
    });
    await connect(session1.result);
    await programAndArm(
      session1.result,
      session1.fake,
      ONE_INTERVAL,
      ONE_IDENTITY,
    );
    tick(session1.fake, 100);
    expect(session1.result.current.phase).toBe("live");
    const firstKey = loadMonitorRun()?.startedAt;
    expect(firstKey).toBe(t0.toISOString());

    // Session 2, a SEPARATE hook instance, a DIFFERENT clock — a genuinely
    // later session's own key, the real-world shape (two sessions never
    // share a `startedAt`). Without the defense retire this create-commit
    // would be refused `"second-key"` (the single-unretired-session
    // invariant, spec §1) against session 1's still-unretired leftover.
    // FOUND while writing this test, and FIXED at the review round (M6):
    // using the SAME key here (this describe block's own `harness`
    // default, `now: () => t0`) used to make the defense retire TOMBSTONE
    // that exact key, so the create that followed was refused `"retired"`
    // instead of succeeding. `createMonitorRun`'s own call site now
    // detects that same-key case and adopts the entry's revision instead
    // of retiring it — see the sibling test below ("the same-key defense
    // guard") for that scenario directly; this one keeps the DIFFERENT-key
    // shape its own title names.
    const t1 = new Date(t0.getTime() + 60_000);
    const session2 = harness(
      {
        program: ONE_INTERVAL,
        events: [status(100, { elapsedSeconds: 50, distanceMeters: 250 })],
      },
      { now: () => t1 },
    );
    await connect(session2.result);
    await programAndArm(
      session2.result,
      session2.fake,
      ONE_INTERVAL,
      ONE_IDENTITY,
    );
    tick(session2.fake, 100);

    expect(session2.result.current.phase).toBe("live");
    // Session 2's own record is what's live now, at revision 0 again (a
    // fresh create, not an update) — the defense retire's own receipt
    // (`retire`, piped to the ring as `store-receipt:retire`) is what
    // proves the leftover was cleared rather than silently overwritten.
    const entries = JSON.parse(session2.result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      entries.some(
        (e) =>
          e.kind === "store-receipt:retire" &&
          e.detail.includes("createMonitorRun-defense"),
      ),
    ).toBe(true);
    expect(loadMonitorRun()?.startedAt).toBe(t1.toISOString());
  });

  it("the same-key defense guard (M6): a leftover entry sharing the NEW run's own key is ADOPTED (an update-shaped commit), never retired-then-refused", async () => {
    // Session 1 opens and is left OPEN — same singleton-store shape as
    // the sibling test above, but session 2 below reuses the IDENTICAL
    // clock (`harness`'s own default `now: () => t0`), so its own
    // `startedAt` collides with session 1's leftover key exactly.
    const session1 = harness({
      program: ONE_INTERVAL,
      events: [status(100, { elapsedSeconds: 30, distanceMeters: 100 })],
    });
    await connect(session1.result);
    await programAndArm(
      session1.result,
      session1.fake,
      ONE_INTERVAL,
      ONE_IDENTITY,
    );
    tick(session1.fake, 100);
    expect(session1.result.current.phase).toBe("live");
    const collidingKey = loadMonitorRun()?.startedAt;
    expect(collidingKey).toBe(t0.toISOString());

    // Session 2, a SEPARATE hook instance, the SAME clock — the exact
    // collision retiring-then-creating cannot survive (retire always
    // tombstones; a create against a just-tombstoned key is refused
    // "retired"). The defense at `createMonitorRun`'s own call site
    // detects `stale.sessionKey === run.startedAt` and adopts the
    // entry's own revision instead — an UPDATE, never a retire.
    const session2 = harness({
      program: ONE_INTERVAL,
      events: [status(100, { elapsedSeconds: 50, distanceMeters: 250 })],
    });
    await connect(session2.result);
    await programAndArm(
      session2.result,
      session2.fake,
      ONE_INTERVAL,
      ONE_IDENTITY,
    );
    tick(session2.fake, 100);

    expect(session2.result.current.phase).toBe("live");
    // Session 2's own record IS live now, at the NEXT revision (1) — an
    // update over session 1's own revision-0 entry, not a fresh create
    // (which would itself be refused "retired" if a retire had run).
    const afterSession2 = currentUnretiredHandoffForTest();
    expect(afterSession2).not.toBeNull();
    expect(afterSession2!.sessionKey).toBe(collidingKey);
    expect(afterSession2!.revision).toBe(1);
    expect(loadMonitorRun()?.startedAt).toBe(collidingKey);
    // No "createMonitorRun-defense" RETIRE receipt this time — the guard
    // skipped it on purpose (retiring here would have tombstoned the key
    // this very commit needed).
    const entries = JSON.parse(session2.result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      entries.some(
        (e) =>
          e.kind === "store-receipt:retire" &&
          e.detail.includes("createMonitorRun-defense"),
      ),
    ).toBe(false);
    // The commit itself DID land, as an accepted update — confirmed via
    // the store's own receipt rather than inferred from `phase` alone.
    expect(
      entries.some(
        (e) =>
          e.kind === "store-receipt:commit-accepted" &&
          e.detail.includes(`"revision":1`),
      ),
    ).toBe(true);
  });

  it("the receipt-channel ownership guard (M7): an unmount racing a LATER mount must not clobber the successor's own channel", async () => {
    // Session A mounts first and claims the channel via its own effect.
    const sessionA = harness({
      program: ONE_INTERVAL,
      events: [status(100, { elapsedSeconds: 30, distanceMeters: 100 })],
    });
    await connect(sessionA.result);

    // Session B mounts SECOND, a genuinely separate hook instance — its
    // own mount effect steals ownership of the ONE module-level channel
    // (`handoffStore.ts`'s own "one process, one store" header).
    const t1 = new Date(t0.getTime() + 120_000);
    const sessionB = harness(
      {
        program: ONE_INTERVAL,
        events: [status(100, { elapsedSeconds: 50, distanceMeters: 250 })],
      },
      { now: () => t1 },
    );
    await connect(sessionB.result);

    // Session A UNMOUNTS while B is still live — without the ownership
    // guard, A's own cleanup would unconditionally null the channel B
    // now owns.
    sessionA.unmount();

    // Drive B to `live` — its own create-commit emits a REAL receipt.
    // Without the guard this receipt would go nowhere (the channel was
    // nulled by A's unmount), and B's own ring would never see it.
    await programAndArm(
      sessionB.result,
      sessionB.fake,
      ONE_INTERVAL,
      ONE_IDENTITY,
    );
    tick(sessionB.fake, 100);
    expect(sessionB.result.current.phase).toBe("live");

    const entries = JSON.parse(sessionB.result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      entries.some(
        (e) =>
          e.kind === "store-receipt:commit-accepted" &&
          e.detail.includes(t1.toISOString()),
      ),
    ).toBe(true);
  });

  it("A REFUSED SUMMARY COMMIT MUST STILL RESOLVE THE BURST CONDITION (plan Task 3 review, I3 — the #228 invariant this task's own deletion of APPEND-REJECTED left with no assertion): the key is retired WHILE the burst hold is open, then the summary arrives — the store refuses the commit, but the hold still releases", async () => {
    // Row 5's own "tombstone refusal reaching the hook's discipline" gets
    // its FIRST real assertion here too: the SAME retire-while-open shape
    // is exactly what a Save/Discard racing a still-lingering burst would
    // produce once Task 4 routes those doors through `retire()`.
    const driverTimer = manualSchedule();
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
      {
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100); // the Menu press — closes healthy, burst hold opens
    expect(result.current.phase).toBe("ended");
    expect(result.current.handoffHeld).toBe(true);
    expect(result.current.holdError).toBeNull();

    // THE RACE: retire the key directly through the store WHILE the burst
    // hold is still open — the shape a Save/Discard produces once Task 4
    // routes those doors through `retire()` instead of the legacy
    // `clearMonitorRun()` (ROADMAP's own AUD-016 open condition on Task 4).
    const current = currentUnretiredHandoffForTest();
    expect(current).not.toBeNull();
    retireHandoffForTest(
      [{ sessionKey: current!.sessionKey, revision: current!.revision }],
      "test-simulated-save-while-burst-open",
    );

    // THE SUMMARY ARRIVES: the writer gate accepts (it still reads
    // `runRef.current`, which has no idea it was just retired), but the
    // STORE refuses the commit — tombstoned.
    act(() => {
      fake.deliverSummary({ elapsedSeconds: 40, meters: 130 });
    });
    expect(driverTimer.pending()?.ms).toBe(200);
    act(() => {
      driverTimer.pending()!.fire();
    });

    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    // The refusal receipt, from the store itself (piped to the ring).
    expect(
      entries.some(
        (e) =>
          e.kind === "store-receipt:commit-refused" &&
          e.detail.includes('"reason":"retired"'),
      ),
    ).toBe(true);
    // THE INVARIANT ITSELF: a refused summary write still resolves the
    // burst condition — "waiting longer cannot help a write that was
    // refused" — so the hold does not strand the rower on a session that
    // has already been dispatched elsewhere.
    const released = entries.find((e) => e.kind === "handoff-released");
    expect(released?.detail).toContain("burst-heard");
    expect(result.current.handoffHeld).toBe(false);
    expect(result.current.holdError).toBeNull();
  });

  it("the burst-first-race ordering (test (h)'s own shape) under denial: the summary's OWN commit is what's refused, and resolveHandoffCondition's release funnel is what catches it — endByMachine's own no-conditions-owed branch stays unreachable here (burst is still open when it runs)", async () => {
    // CORRECTION, found empirically while building this test: `endByMachine`
    // ALWAYS finds `run.summaryTotals === undefined` at its own
    // `openBurstHold()` check, even in test (h)'s "whole burst before the
    // Menu press" ordering — the driver emits `terminated` BEFORE
    // `summary-observations` (test (h)'s own comment: the pickup "must run
    // AFTER the `terminated` event or the record is still open and
    // declines the write forever"), so `endByMachine`'s own verify branch
    // ALWAYS sees the burst hold already open and is genuinely UNREACHABLE
    // for a real run (documented at its own call site instead of forced
    // here). What test (h)'s ordering DOES exercise under denial is
    // `resolveHandoffCondition`'s own release funnel: the burst hold opens
    // (summary not yet heard), then the summary's OWN commit — itself
    // denied by this test's broad predicate — resolves the condition via
    // `resolveHandoffCondition("burst", "burst-heard")`, whose own verify
    // reads the now-`"failed"` cached verdict and holds instead of
    // releasing. This is the SAME funnel the earlier "denied durable
    // write" test exercises via `endSession`'s link-lost door — this one
    // proves it ALSO catches the three-burst-holding-arms path, on real
    // wire timing.
    const restore = installMonitorRunWriteDenial(
      (parsed) =>
        (parsed as { completedAt: string | null }).completedAt !== null,
    );
    try {
      const driverTimer = manualSchedule();
      const { result, fake } = harness(
        {
          program: ONE_INTERVAL,
          events: [
            status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
            {
              ...finalBoundary(150),
              burst: { summaryAtMsOffset: 10, verificationAtMsOffset: 20 },
            },
            status(200, {
              workoutState: WORKOUTSTATE_TERMINATE,
              elapsedSeconds: 60,
              distanceMeters: 200,
              spm: 0,
              currentSplit: 0,
            }),
          ],
        },
        {
          driverOptions: {
            settleTicks: 0,
            prepareSettleTicks: 0,
            schedule: driverTimer.schedule,
          },
        },
      );

      await connect(result);
      await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
      tick(fake, 100); // t=100: rowing
      tick(fake, 50); // t=150: the final split
      tick(fake, 20); // t=170: 0x0039 (buffered) and 0x003F (stored on the run)
      tick(fake, 30); // t=200: the Menu press; burst opens, then resolves same tick

      expect(result.current.phase).toBe("ended");
      expect(result.current.endedBy).toBe("machine");
      expect(result.current.handoffHeld).toBe(true);
      expect(result.current.holdError).toBe("storage-failed");
      const entries = JSON.parse(result.current.exportLog()) as {
        kind: string;
        detail: string;
      }[];
      // The burst DID open — confirming the correction above, not silently
      // dropping the original (wrong) expectation.
      expect(entries.find((e) => e.kind === "handoff-hold")).toBeDefined();
      expect(
        entries.find((e) => e.kind === "hold-error-entered"),
      ).toBeDefined();
    } finally {
      restore();
    }
  });

  // NOT COVERED HERE, disclosed rather than forced (RF13's own rule):
  // the continuity-reset close is a THIRD genuinely-reachable no-hold
  // site (`link-lost` is never burst-eligible, so it never opens a hold
  // either) — architecturally identical code to the two sites tested
  // above (the SAME `verifyHandoffWritable()` call, at a third call
  // site). Reaching it at the hook level requires latching `frameSilence`
  // first, which this file's own existing tests only ever do via the
  // heavier `vi.doMock("../adapters/appLifecycle")` + `Date.now()`-spoofing
  // resume-gap harness (`resumeAfterGap`, further down this file) — the
  // simple `harness()`/fake-timeline composition this describe block uses
  // has no injection point for the REAL watchdog clock `frameSilence`
  // latches on, confirmed by trying (`tick()` only advances the FAKE's own
  // scripted wire time, never real wall-clock milliseconds). Judged not
  // worth replicating that separate harness for a call site that reuses,
  // verbatim, a function two OTHER tests in this describe block already
  // exercise both ways.
});

describe("useMonitorSession: teardown — the burst linger (storage-spine design spec §2, PR 1 Task 3)", () => {
  it("(a) THE CANONICAL LATE SIDE, PRODUCTION TIMING (final-review fix wave, HIGH-1 + HIGH-2 — the reviewer's own probe shape): terminal, THEN the split claims the grace, THEN the burst (0x0039 at +269.6ms, 0x003F at +307.8ms off the split — FakeBurst's own keystone-measured defaults) — observations AND the verification hash are both stored, and disconnect happens at burst completion, never the full BURST_LINGER_MS", async () => {
    // Before this fix wave: `summary-observations` events across this
    // exact ordering = `[]` (the reviewer's own reproduced probe). The
    // OLD version of this test used a different, non-failing shape (split
    // BEFORE terminal) — the reviewer's own "why no test caught it"
    // finding. This is the true wire ordering: our terminal transition
    // arrives BEFORE the final split, the split CLAIMS the finish grace
    // the instant it lands, and only THEN does the burst follow — using
    // `FakeBurst`'s own default offsets, not hand-picked numbers.
    const driverTimer = manualSchedule();
    const burstTimer = manualSchedule();
    let driverMs = 0;
    const lateBoundary: FakeTimelineEvent = {
      ...finalBoundary(290),
      burst: {},
    };
    const { result, fake, transport, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200), // OUR TERMINAL FIRST — the genuine late side
          lateBoundary, // the split arrives 90ms later, claiming the grace
        ],
      },
      {
        burstLingerSchedule: burstTimer.schedule,
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
    tick(fake, 100); // t=100: status
    tick(fake, 100); // t=200: terminal

    // The split has not landed — the hand-off hold opens, and the deadline
    // is armed at its ordinary 3000ms (nothing about the hold changes it).
    expect(result.current.phase).toBe("ended");
    expect(result.current.handoffHeld).toBe(true);
    expect(driverTimer.pending()?.ms).toBe(3000);

    driverMs = 290;
    tick(fake, 90); // t=290: the split — CLAIMS the grace

    // Storage-spine design spec §2, Task 3: the SPLIT condition resolves on
    // the boundary itself — nothing has touched the deadline yet (no
    // summary held) — but the BURST condition (this natural finish's
    // `summaryTotals` is still `undefined`) is still owed, so the WHOLE
    // hold stays up. Pre-Task-3 this was the whole hold and it really did
    // release here; Task 3 widened what it owes.
    expect(result.current.handoffHeld).toBe(true);
    expect(result.current.actuals).toHaveLength(1);
    expect(driverTimer.pending()?.ms).toBe(3000);

    unmount();
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);
    expect(transport.disconnects).toBe(0);

    // +269.6ms off the split: 0x0039 arrives. HIGH-1's fix admits it (the
    // split already claimed the grace, but the deferred reconcile has not
    // drained) instead of `out-of-window`. HIGH-2's fix: complete on
    // split+summary but the hash is missing, so this RE-ARMS the deadline
    // to the short `HASH_SUBWINDOW_MS` (200ms) rather than draining blind.
    driverMs = 560;
    tick(fake, 270); // t=560, past the summary's 559.6ms due time
    expect(driverTimer.pending()?.ms).toBe(200);
    expect(transport.disconnects).toBe(0); // still not disconnected
    expect(loadMonitorRun()?.summaryTotals).toBeUndefined(); // not written yet

    // +307.8ms off the split (+38.2ms after the summary): 0x003F arrives.
    // `LOGGED_WORKOUT_UUID`'s subscriber finds split+summary+hash all
    // complete now and drains for real — cancelling the sub-window,
    // emitting `summary-observations` WITH the hash, and finishing the
    // hook's own linger early.
    driverMs = 598;
    tick(fake, 38); // t=598, past the hash's 597.8ms due time

    // THE EARLY EXIT IS REAL: disconnect at burst completion (~400ms after
    // the terminal), nowhere near the 2000ms cap — and both timers that
    // could have fired later are settled, not dangling.
    expect(transport.disconnects).toBe(1);
    expect(driverTimer.pending()).toBeNull();
    expect(burstTimer.pending()).toBeNull();
    // Storage-spine design spec §2, Task 3: the BURST condition — still
    // owed since the split resolved at t=290 — is what this arrival
    // finally resolves, and it is what actually releases the hold (the
    // split's own backstop, on this test's unbound default `schedule`, was
    // already cancelled when the split landed). Not asserted via
    // `result.current.handoffHeld` here — the component unmounted above,
    // so React Testing Library freezes `result.current` at its last render
    // and this would only ever read stale state; the ring's own
    // `handoff-released` entry (checked below, via the second stash) is
    // the real evidence.

    const stored = loadMonitorRun();
    expect(stored?.summaryTotals).toStrictEqual({
      workElapsedSeconds: 60,
      workDistanceMeters: 200,
    });
    // THE HASH, STORED (HIGH-2's own fix — omitted entirely before it,
    // since the drain used to fire on 0x0039 alone, 38ms before this byte
    // ever arrived).
    expect(stored?.verificationBytes).toStrictEqual([
      0x27, 0xd8, 0xf3, 0x6e, 0xe1, 0x52, 0x55, 0x5b, 0xf8, 0x14, 0x01, 0x00,
      0x94, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    // TWO entries, and the pair is the whole story now: HIGH-1's own
    // admission ("buffered" — the split already claimed the grace, but
    // the summary is still admissible for observations) and the eventual
    // drain's own verdict ("split-won", with the observations folded in).
    // `reconcileSummary` itself still ran exactly once — the pin for that
    // is the SINGLE `split-won` entry, not the entry count, since the
    // admission log line is a different function (`noteSummary`) logging
    // a different event (the arrival) under the same `summary-reconciled`
    // kind.
    const verdicts = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const reconciled = verdicts.filter((e) => e.kind === "summary-reconciled");
    expect(reconciled).toHaveLength(2);
    expect(reconciled[0]!.detail).toContain("buffered");
    expect(
      reconciled.filter((e) => e.detail.startsWith("split-won")),
    ).toHaveLength(1);

    // THE SECOND STASH: the ring entries the drain itself produced,
    // unreachable from the FIRST (t=0) stash taken before any of this
    // happened.
    const stashed = sessionStorage.getItem("ergomatic:last-monitor-log");
    expect(stashed).not.toBeNull();
    const entries = JSON.parse(stashed!) as { kind: string; detail: string }[];
    expect(entries.some((e) => e.kind === "summary-half")).toBe(true);
    const verdict = entries.find((e) => e.kind === "summary-reconciled");
    expect(verdict?.detail).toContain("buffered");
    // Storage-spine design spec §2, Task 3: the burst is the condition that
    // actually released the hold here (the split already had, at t=290).
    expect(
      entries.find((e) => e.kind === "handoff-released")?.detail,
    ).toContain("burst-heard");
  });

  it("(a-cap) LATE SIDE, PRODUCTION TIMING, NOTHING EVER ARRIVES: the driver's own 3000ms deadline would elapse LONG after the hook's 2000ms linger cap — the cap drains first, and the deadline never gets the chance to double-fire", async () => {
    // The other half of the reviewer's required pairing: BURST_LINGER_MS
    // (2000) beats FINISH_GRACE_MS (3000) when NOTHING ever arrives to
    // complete the evidence early, so the linger's own timeout is what
    // decides it — and the driver's own deadline, still pending at that
    // moment, must come out SETTLED (drained), never left alive to fire a
    // second, later reconcile against a driver that has already
    // disconnected.
    const driverTimer = manualSchedule();
    const burstTimer = manualSchedule();
    const { result, fake, transport, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
        ],
      },
      {
        burstLingerSchedule: burstTimer.schedule,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.phase).toBe("ended");
    expect(driverTimer.pending()?.ms).toBe(3000);

    unmount();
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);
    expect(transport.disconnects).toBe(0);

    // The hook's own 2000ms cap elapses — strictly BEFORE the driver's own
    // 3000ms deadline ever would, on real production timing.
    act(() => {
      burstTimer.pending()!.fire();
    });

    expect(transport.disconnects).toBe(1);
    // SETTLED, NOT DANGLING: the drain the cap triggered (`teardown`'s own
    // `driver.reconcile()`) consumed the driver's own pending deadline —
    // it is not still sitting there waiting for a 3000ms that, on real
    // hardware, would arrive 1000ms after this driver has already hung up.
    expect(driverTimer.pending()).toBeNull();
    expect(loadMonitorRun()).not.toHaveProperty("summaryTotals");

    // NO DOUBLE-FIRE: exactly one verdict in the trace, whatever it says —
    // not two, which is what the deadline ALSO firing later would have
    // produced.
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(entries.filter((e) => e.kind === "summary-reconciled")).toHaveLength(
      1,
    );
  });

  it("(a-ring) RING PRESSURE (review fix round 1, MEDIUM finding): at the eventLog's 500-entry cap, the second stash gains the burst-era entries but is NOT a strict superset of the first — whatever was oldest at first-stash time is evicted by the time the second one is taken", async () => {
    // The comment this test pins was rewritten from a false claim (the
    // second stash "strictly contains everything the first one did") to
    // an honest one: it is the ring's CURRENT window at drain time, and a
    // ring at capacity evicts its oldest entry for every new one recorded
    // — burst-era entries are guaranteed present (they are the newest),
    // but nothing else is.
    const log = createEventLog(500, () => 0);
    for (let i = 0; i < 500; i += 1) log.record("filler", `junk-${i}`);

    const burstTimer = manualSchedule();
    const driverTimer = manualSchedule();
    const boundaryWithBurst: FakeBoundaryEvent = {
      ...finalBoundary(150),
      burst: {},
    };
    const { result, fake, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          boundaryWithBurst,
          finishedAt(200),
        ],
      },
      {
        createLog: () => log,
        burstLingerSchedule: burstTimer.schedule,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.phase).toBe("ended");

    unmount();
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);

    const firstStash = JSON.parse(
      sessionStorage.getItem("ergomatic:last-monitor-log")!,
    ) as { seq: number; kind: string; detail: string }[];
    // The ring was pre-filled to its exact cap, so it is STILL at cap here
    // (every real entry logged since — connect, program, arm, the two
    // status ticks, teardown's own first stash) evicted one filler entry
    // one-for-one). The oldest entry THIS stash can see is what a later
    // stash's eviction will be measured against.
    expect(firstStash).toHaveLength(500);
    const oldestAtFirstStash = firstStash[0]!;

    // The burst arrives (`FakeBurst`'s own keystone-measured offsets off
    // the boundary at t=150: 0x0039 at 419.6, 0x003F at 457.8) — split
    // already recorded, so 0x0039 alone re-arms the short hash sub-window
    // (final-review fix wave, HIGH-2), and 0x003F is what actually drains
    // — logging at least one NEW entry (`summary-half`,
    // `summary-reconciled`) each, evicting more of the ring's oldest
    // entries.
    tick(fake, 220); // t=420: past the summary's 419.6ms due time
    expect(driverTimer.pending()?.ms).toBe(200);
    tick(fake, 40); // t=460: past the hash's 457.8ms due time
    expect(driverTimer.pending()).toBeNull();

    const secondStash = JSON.parse(
      sessionStorage.getItem("ergomatic:last-monitor-log")!,
    ) as { seq: number; kind: string; detail: string }[];
    expect(secondStash).toHaveLength(500);

    // GUARANTEED PRESENT: the burst-era entries this second stash exists
    // FOR really are in it.
    expect(secondStash.some((e) => e.kind === "summary-half")).toBe(true);
    expect(
      secondStash.some(
        (e) =>
          e.kind === "summary-reconciled" && e.detail.includes("split-won"),
      ),
    ).toBe(true);

    // NOT A SUPERSET: what was oldest in the FIRST stash is gone from the
    // SECOND — the exact claim the old comment wrongly denied.
    expect(secondStash.some((e) => e.seq === oldestAtFirstStash.seq)).toBe(
      false,
    );
  });

  it("(b) EARLY SIDE: the burst arrives before the terminal and is already reconciled by the time this screen unmounts — NO added latency (disconnect timing unchanged from today's pin), observations still stored", async () => {
    const driverTimer = manualSchedule();
    const burstTimer = manualSchedule();
    let driverMs = 0;
    const { result, fake, transport, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
        ],
      },
      {
        burstLingerSchedule: burstTimer.schedule,
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

    // The burst beats OUR terminal transition (§1's own "3 of 5"): 0x0039
    // arrives while the driver still considers the run open, in its one
    // (therefore final) interval.
    act(() => {
      fake.deliverSummary({ elapsedSeconds: 62.5, meters: 214 });
    });

    // Now the terminal — no split ever arrives for this program, so the
    // hand-off hold opens.
    tick(fake, 100);
    expect(result.current.phase).toBe("ended");
    expect(result.current.handoffHeld).toBe(true);

    // The grace's own deadline resolves WHILE STILL MOUNTED — the hold's
    // whole reason to exist is to keep this screen up long enough for
    // exactly this. No split ever came, so the no-split path synthesizes
    // the final interval from the burst's own totals.
    driverMs = 3000;
    act(() => {
      driverTimer.pending()!.fire();
    });
    expect(result.current.actuals).toHaveLength(1);
    expect(result.current.handoffHeld).toBe(false);
    expect(loadMonitorRun()?.summaryTotals).toStrictEqual({
      workElapsedSeconds: 62.5,
      workDistanceMeters: 214,
    });

    // By the time this screen unmounts, the burst is ALREADY recorded —
    // teardown takes the IMMEDIATE path, no linger, no added latency.
    unmount();

    expect(burstTimer.calls).toHaveLength(0);
    expect(transport.disconnects).toBe(1);
  });

  it("(c) NO BURST: disconnect happens at exactly BURST_LINGER_MS, and the record stays byte-identical to today's (no summaryTotals/verificationBytes field at all)", async () => {
    const burstTimer = manualSchedule();
    const { result, fake, transport, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          finishedAt(200),
        ],
      },
      { burstLingerSchedule: burstTimer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.phase).toBe("ended");
    expect(result.current.handoffHeld).toBe(true);

    unmount();
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);
    expect(transport.disconnects).toBe(0);

    // Nothing ever arrives. The linger's own cap is what finally decides
    // it — this hook's own `driverOptions.schedule` default (the harness's
    // no-op stub) never fires the driver's OWN grace on its own, so this
    // pins the burst linger's timer as the ONLY thing moving this forward.
    act(() => {
      burstTimer.pending()!.fire();
    });

    expect(transport.disconnects).toBe(1);
    const stored = loadMonitorRun();
    expect(stored).not.toBeNull();
    expect(stored).not.toHaveProperty("summaryTotals");
    expect(stored).not.toHaveProperty("verificationBytes");
  });

  it("(d) THE RESURRECTION RACE, RETARGETED (hand-off store design spec §1, plan Task 3): the run is RETIRED (tombstoned) during the linger — the burst's own commit is refused by the store, and nothing reappears in storage", async () => {
    // RETARGETED from `clearMonitorRun()` (the legacy raw key-removal
    // `LogSession.tsx`/`Today.tsx` still call today, Tasks 4/5's own scope)
    // to `handoffStore.retire()` — the mechanism THIS hook's own commits
    // actually answer to (spec §1's tombstone). `clearMonitorRun()` alone no
    // longer has this effect under the new design: `appendSummaryObservations`
    // is pure and builds on the hook's own `runRef.current`, never a
    // storage re-read (`stillLive` is deleted), so a raw physical removal
    // the store's own bookkeeping never hears about would NOT stop the
    // hook's own late-burst commit from landing (a real, but TEMPORARY,
    // gap this branch's own sequencing closes: Task 4 retargets
    // `LogSession.tsx`'s save-success/monitor-discard onto
    // `handoffStore.retire()`, at which point this exact door produces the
    // tombstone this test now simulates directly).
    const driverTimer = manualSchedule();
    const burstTimer = manualSchedule();
    const boundaryWithBurst: FakeBoundaryEvent = {
      ...finalBoundary(150),
      burst: {},
    };
    const { result, fake, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          boundaryWithBurst,
          finishedAt(200),
        ],
      },
      {
        burstLingerSchedule: burstTimer.schedule,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.phase).toBe("ended");
    expect(loadMonitorRun()).not.toBeNull();

    unmount();
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);

    // THE ROWER DISCARDS OR LOGS THIS RUN from another screen, entirely
    // independent of this (unmounted) hook instance — retired through the
    // STORE directly, the mechanism `LogSession.tsx`/`Today.tsx` route
    // through once Task 4/5 land.
    const staged = currentUnretiredHandoffForTest();
    expect(staged).not.toBeNull();
    retireHandoffForTest(
      [{ sessionKey: staged!.sessionKey, revision: staged!.revision }],
      "test-simulated-discard",
    );
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();

    // THEN the burst arrives (`FakeBurst`'s own keystone offsets off the
    // boundary at t=150) — the split was already recorded, so 0x0039
    // alone re-arms the short hash sub-window (final-review fix wave,
    // HIGH-2), and 0x003F is what actually drains, right here.
    tick(fake, 220); // t=420: past the summary's 419.6ms due time
    expect(driverTimer.pending()?.ms).toBe(200);
    tick(fake, 40); // t=460: past the hash's 457.8ms due time
    expect(driverTimer.pending()).toBeNull();

    // The commit lands on a TOMBSTONED key — the store refuses it
    // (`reason: "retired"`) and nothing reappears.
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("(e) TERMINATE teardown LINGERS TOO (summary-record spec §1 gate 1 — this used to pin the opposite): the link stays up for the burst, and a terminate that never sends one still disconnects at the cap with a byte-identical record", async () => {
    // REWRITTEN, not deleted. Until spec §1 gate 1 this test asserted
    // `burstTimer.calls` was EMPTY — that a rower-ended close took the
    // immediate teardown path — and that assertion is precisely the
    // production defect: walk-2026-08-23's `ring-phone-3-menu-terminate.json`
    // ends at `terminal terminated` with no 0x0039/0x003A/0x003F, because
    // the phone had already hung up ~1s before the burst the machine does
    // send (notes §25). The linger now arms for `"rower"` as well as
    // `"finished"`; what is UNCHANGED, and is what this test still pins, is
    // the outcome when nothing arrives — the cap fires, the disconnect
    // happens, and the record gains nothing.
    const burstTimer = manualSchedule();
    const { result, fake, transport, unmount } = harness(
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
      { burstLingerSchedule: burstTimer.schedule },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100);
    tick(fake, 100);
    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    expect(loadMonitorRun()?.endedBy).toBe("rower"); // TERMINATE, not finished

    unmount();

    // GATE 1: the link is held open for the burst instead of being dropped
    // at t=0, exactly as a natural finish already was.
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);
    expect(transport.disconnects).toBe(0);

    act(() => {
      burstTimer.pending()!.fire();
    });

    expect(transport.disconnects).toBe(1);
    expect(loadMonitorRun()).not.toHaveProperty("summaryTotals");
  });

  // docs/monitor/sessions/walk-2026-08-24/lab-terminate-ring.json, byte for
  // byte — the same three payloads `fake.test.ts`'s own terminate-burst
  // script carries (Task 5), read straight off the committed capture.
  const LAB_SUMMARY = Uint8Array.from([
    0x88, 0x35, 0x0e, 0x0f, 0x7e, 0x09, 0x00, 0xf8, 0x02, 0x00, 0x2c, 0x00,
    0x00, 0x00, 0x00, 0x64, 0x00, 0x01, 0x3e, 0x06,
  ]);
  const LAB_ADDITIONAL_SUMMARY = Uint8Array.from([
    0x88, 0x35, 0x0e, 0x0f, 0x00, 0x4c, 0x00, 0x01, 0x04, 0x00, 0x56, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x53, 0x02,
  ]);
  const LAB_VERIFICATION = Uint8Array.from([
    0x76, 0x78, 0xe6, 0x7e, 0x23, 0xe3, 0xe4, 0x01, 0x16, 0x17, 0x01, 0x00,
    0x52, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  it("(f) THE MENU-TERMINATE CAPTURE, ALL FOUR GATES (summary-record spec §1): the burst that lands ~1s after a rower-ended close is stored as OBSERVATIONS ONLY — nine fields, the hash, and NOT one synthesized interval", async () => {
    // The production shape this exists for, end to end through the REAL
    // hook teardown: rowing ~24s into a 1-interval piece, the rower presses
    // Menu (0x0031 state 11), the machine sends its partial 0x0037/0x0038,
    // the app navigates away (unmount) — and only THEN, ~1s later, does the
    // same 0x0039/0x003A/0x003F burst a natural finish gets arrive.
    // Production heard none of it (walk-2026-08-23 ring-phone-3).
    const driverTimer = manualSchedule();
    const burstTimer = manualSchedule();
    const { result, fake, transport, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 12, distanceMeters: 40 }),
          status(200, {
            workoutState: WORKOUTSTATE_TERMINATE,
            elapsedSeconds: 24.26,
            distanceMeters: 75.6,
            spm: 0,
            currentSplit: 0,
          }),
          {
            atMs: 200,
            kind: "boundary",
            actual: {
              index: 0,
              elapsedSeconds: 24.3,
              distanceMeters: 76,
              avgSpm: 22,
              avgHeartRateBpm: null,
              restDistanceMeters: 0,
            },
            cumulativeElapsedSeconds: 24.26,
            cumulativeDistanceMeters: 75.6,
            burst: {
              summaryAtMsOffset: 1000,
              verificationAtMsOffset: 1000,
              summaryBytes: LAB_SUMMARY,
              additionalSummaryBytes: LAB_ADDITIONAL_SUMMARY,
              verificationBytes: LAB_VERIFICATION,
            },
          },
        ],
      },
      {
        burstLingerSchedule: burstTimer.schedule,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100); // t=100: rowing
    tick(fake, 100); // t=200: the Menu terminate, then its partial boundary

    expect(result.current.phase).toBe("ended");
    const closed = loadMonitorRun();
    expect(closed?.endedBy).toBe("rower");
    // CSAFE-DEF footnote 12: the terminate's own partial 0x0037 is NOT an
    // interval actual and never was — `boundary-out-of-run`, unchanged.
    expect(closed?.actuals).toHaveLength(0);
    expect(closed).not.toHaveProperty("summaryTotals");

    // The app navigates: the REAL unmount teardown runs. GATE 1 defers the
    // unsubscribe/disconnect instead of hanging up at t=0.
    unmount();
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);
    expect(transport.disconnects).toBe(0);

    // ~1s later the whole burst lands in one tick, lab ordering
    // (0x0039, 0x003A, 0x003F).
    tick(fake, 1000);

    // GATES 2+3+4, AS AN EXACT RECORD EQUALITY (fix round 1, m2 — this
    // used to assert the three added fields plus `actuals.length === 0` as
    // a proxy for "nothing else moved", which cannot see a change to
    // `terminated`, `endedBy`, `completedAt`, `series`, the work/rest sums,
    // or anything else on the record). The stored run must be the run this
    // terminate closed, PLUS exactly three fields and not one byte more.
    const stored = loadMonitorRun();
    expect(stored).toStrictEqual({
      ...closed,
      summaryTotals: { workElapsedSeconds: 24.3, workDistanceMeters: 76 },
      summaryDetail: {
        // PINNED ANOMALY (spec §1 rider c): the same burst's 0x0038 reads
        // 22 and 0x0032 reads 29 instantaneous, and 22 is the physically
        // true value (8.5 m/stroke vs an impossible 4.3). Stored verbatim
        // anyway, and pinned HERE so the anomaly stays visible rather than
        // being quietly normalised by some later "fix".
        avgStrokeRate: 44,
        endingHeartRateBpm: null,
        avgHeartRateBpm: null,
        minHeartRateBpm: null,
        maxHeartRateBpm: null,
        dragFactorAverage: 100,
        recoveryHeartRateBpm: null,
        workoutType: 1,
        avgPaceSecondsPer500m: 159.8,
      },
      verificationBytes: Array.from(LAB_VERIFICATION),
    });

    // OBSERVATIONS ONLY — the abandoned run gained NO synthesized interval.
    // `reconcileSummary`'s `filled-from-summary` branch would have filed one
    // (`intervalComplete{finalBoundary: true}`), corrupting an abandoned
    // record's meaning, its heroes and `buildMonitorLogSteps`. Implied by
    // the equality above (`closed.actuals` is empty), asserted separately
    // because it is the SPEC's claim, not an incidental consequence — and
    // because the hook's own live view must agree with storage.
    expect(stored?.actuals).toHaveLength(0);
    expect(result.current.actuals).toHaveLength(0);

    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const verdicts = entries.filter((e) => e.kind === "summary-reconciled");
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.detail).toContain("terminate-observations");
    expect(entries.some((e) => e.detail.includes("filled-from-summary"))).toBe(
      false,
    );

    // The link comes down at burst completion, and nothing is left ticking.
    expect(transport.disconnects).toBe(1);
    expect(driverTimer.pending()).toBeNull();
    expect(burstTimer.pending()).toBeNull();
  });

  it("(g) THE EARLY-BURST TERMINATE ORDERING REACHES THE RECORD TOO (fix round 1, IMPORTANT): a 0x0039 that beats the Menu press is buffered, and the terminate picks it up — the record still gains the observations", async () => {
    // `driver.test.ts`'s (f6)/(f7) pin the ORDERING mechanics at the layer
    // that owns them. This one exists because the loss this fix repairs
    // ended at the RECORD, and only the hook can show a record: before the
    // fix the summary sat in `run.summaryInGrace` unread, and
    // `loadMonitorRun()` came back with no `summaryTotals` and no verdict
    // in the ring to say why.
    const driverTimer = manualSchedule();
    const burstTimer = manualSchedule();
    const { result, fake, transport, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 12, distanceMeters: 40 }),
          status(200, {
            workoutState: WORKOUTSTATE_TERMINATE,
            elapsedSeconds: 24.26,
            distanceMeters: 75.6,
            spm: 0,
            currentSplit: 0,
          }),
        ],
      },
      {
        burstLingerSchedule: burstTimer.schedule,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100); // t=100: rowing

    // THE BURST BEATS THE MENU PRESS. `deliverSummary` puts 0x0039 on the
    // wire out of band, which is exactly what this ordering is — the run is
    // still open and (being single-interval) always in its final interval,
    // so `noteSummary` BUFFERS it.
    act(() => {
      fake.deliverSummary({ elapsedSeconds: 24.3, meters: 76 });
    });
    expect(loadMonitorRun()).not.toHaveProperty("summaryTotals");

    tick(fake, 100); // t=200: the Menu terminate
    expect(result.current.phase).toBe("ended");
    expect(loadMonitorRun()?.endedBy).toBe("rower");

    // The app navigates; the linger holds the link (gate 1).
    unmount();
    expect(burstTimer.pending()?.ms).toBe(BURST_LINGER_MS);

    // No 0x003F on this fixture (`deliverSummary` sends 0x0039 alone), so
    // the sub-window is what delivers — hash or not, nothing is stranded.
    expect(driverTimer.pending()?.ms).toBe(200);
    act(() => {
      driverTimer.pending()!.fire();
    });

    const stored = loadMonitorRun();
    expect(stored?.summaryTotals).toStrictEqual({
      workElapsedSeconds: 24.3,
      workDistanceMeters: 76,
    });
    // The hash never came, so the key is ABSENT — not null, not undefined.
    expect(stored).not.toHaveProperty("verificationBytes");
    expect(stored?.summaryDetail?.avgStrokeRate).toBe(24); // deliverSummary's own default
    // Gate 3 on this ordering as well.
    expect(stored?.actuals).toHaveLength(0);
    expect(transport.disconnects).toBe(1);
    expect(burstTimer.pending()).toBeNull();
  });

  it("(h) THE WHOLE BURST BEFORE THE MENU PRESS, hash included (fix round 1): the pickup emits SYNCHRONOUSLY inside the terminated close, and it must run AFTER the `terminated` event or the record is still open and declines the write forever", async () => {
    // The ordering hazard this pins is the terminate-branch twin of the
    // `finished` branch's own HIGH finding: `emit({kind:"terminated"})` is
    // what drives the hook's `closeRecord`, and an observations event that
    // reached `appendSummaryObservations` first would find
    // `completedAt: null` and decline PERMANENTLY (decline #3,
    // `monitorRun.ts`). Test (g) cannot see this — its emit is deferred to
    // the hash sub-window, long after the close — so it takes a fixture
    // where the hash is ALREADY on the run when the Menu press lands,
    // which makes the pickup's emit synchronous.
    //
    // Realistic, not contrived: this is the rower pressing Menu during the
    // trailing rest AFTER the last interval's split already filed —
    // exactly the shape that disproved the first implementation's claim
    // that a terminated piece "by construction" has no final split.
    const driverTimer = manualSchedule();
    const burstTimer = manualSchedule();
    const { result, fake, transport, unmount } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
          // The final split lands while the run is still open, and its
          // burst follows a hair later: 0x0039 at t=160, 0x003F at t=170.
          {
            ...finalBoundary(150),
            burst: { summaryAtMsOffset: 10, verificationAtMsOffset: 20 },
          },
          status(200, {
            workoutState: WORKOUTSTATE_TERMINATE,
            elapsedSeconds: 60,
            distanceMeters: 200,
            spm: 0,
            currentSplit: 0,
          }),
        ],
      },
      {
        burstLingerSchedule: burstTimer.schedule,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: driverTimer.schedule,
        },
      },
    );

    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, ONE_IDENTITY);
    tick(fake, 100); // t=100: rowing
    tick(fake, 50); // t=150: the final split
    tick(fake, 20); // t=170: 0x0039 (buffered) and 0x003F (stored on the run)

    // Still nothing written — the run has not closed, so there is nothing
    // to fold observations onto yet.
    expect(loadMonitorRun()?.actuals).toHaveLength(1);
    expect(loadMonitorRun()).not.toHaveProperty("summaryTotals");

    tick(fake, 30); // t=200: the Menu press

    // Written SYNCHRONOUSLY inside the close, hash and all — no timer was
    // needed, because nothing was outstanding.
    expect(driverTimer.pending()).toBeNull();
    const stored = loadMonitorRun();
    expect(stored?.endedBy).toBe("rower");
    expect(stored?.summaryTotals).toStrictEqual({
      workElapsedSeconds: 60,
      workDistanceMeters: 200,
    });
    expect(stored?.verificationBytes).toHaveLength(19);
    // Gate 3: the split the rower actually rowed is the ONLY actual — the
    // summary added no second one.
    expect(stored?.actuals).toHaveLength(1);

    // And because the burst was already heard, the unmount takes the
    // IMMEDIATE teardown path with no linger at all (`burstAlreadyHeard`).
    unmount();
    expect(burstTimer.calls).toHaveLength(0);
    expect(transport.disconnects).toBe(1);
  });
});

describe("useMonitorSession: ending", () => {
  const timeline: FakeTimelineEvent[] = [
    status(100, { elapsedSeconds: 20, distanceMeters: 70 }),
    status(200, { elapsedSeconds: 40, distanceMeters: 140 }),
  ];

  /** Task 1 (lost-monitor design spec): the flagship shape this phase
   *  exists for — connected, programmed, armed, and never pulled (the
   *  ready gate never sees flywheel evidence, so no run ever opens).
   *  `teardown` drives the REAL `endSession()` path (not `cancel()`), so
   *  both `closeRecord`'s own null-run branch and the ordinary teardown
   *  stash run for real, then unmounts (the hook's own `teardown()` runs
   *  from the unmount effect, same as every other test in this file). */
  async function arriveArmedWithoutRowing(): Promise<{
    result: Session;
    teardown: () => Promise<void>;
  }> {
    const { result, fake, unmount } = harness({
      program: TWO_INTERVALS,
      events: timeline,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");
    return {
      result,
      teardown: async (): Promise<void> => {
        await act(async () => {
          await result.current.endSession();
        });
        unmount();
      },
    };
  }

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
      // Phase LL Task 4 (design spec §4's writer table): "End button with
      // the link up -> rower".
      endedBy: "rower",
    });
  });

  it("Phase LL Task 4: End after the link is gone stores endedBy link-lost, distinguishable from the rower's own End", async () => {
    const { result, fake, transport } = harness({
      program: TWO_INTERVALS,
      events: timeline,
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    act(() => {
      fake.injectDisconnect();
    });
    expect(result.current.phase).toBe("disconnected");
    const before = transport.wireWrites;

    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.phase).toBe("ended");
    // No terminate attempted — the link is gone (spec's C5 lose-and-degrade).
    expect(transport.wireWrites).toBe(before);
    expect(loadMonitorRun()).toMatchObject({
      completedAt: t0.toISOString(),
      terminated: true,
      endedBy: "link-lost",
    });
    // Task 5 (unit-test extensions), storage-spine design spec §2: a
    // `link-lost` close is NOT burst-eligible (the link the burst would
    // arrive on is gone) — `openBurstHold`'s own predicate rejects
    // `endedBy: "link-lost"` outright, so `endSession` here opens NOTHING,
    // unlike its `rower`-arm sibling above.
    expect(result.current.handoffHeld).toBe(false);
    const entries = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(entries.find((e) => e.kind === "handoff-hold")).toBeUndefined();
  });

  it("Phase LL Task 4: an honest WORKOUTEND stores endedBy finished", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [
        status(100, { elapsedSeconds: 30, distanceMeters: 100 }),
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
    tick(fake, 100);

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("machine");
    expect(loadMonitorRun()).toMatchObject({
      completedAt: t0.toISOString(),
      terminated: false,
      endedBy: "finished",
    });
  });

  it("Phase LL Task 4: a machine TERMINATE (the rower stopped the piece at the erg, not through End) stores endedBy rower — a TERMINATE reaching this hook at all means the link was up", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
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
      endedBy: "rower",
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

  it("Task 7: END mid-session writes final-totals at TERMINATE-DISPATCH time — the machine's own terminated frame need not arrive at all (spec 1's own walk evidence: 'the ring ended at the terminate write'; a real library workout, Filling Low)", async () => {
    sessionStorage.removeItem("ergomatic:last-monitor-log");
    const { result, fake, unmount } = harness({
      program: LIBRARY.program,
      events: [status(100, { elapsedSeconds: 60, distanceMeters: 300 })],
    });
    await connect(result);
    await programAndArm(result, fake, LIBRARY.program, LIBRARY_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");

    // The monitor goes silent (fix-round HIGH-2's `injectTimeout`): no ack
    // for the terminate ever comes back, so the fake's own synthetic
    // terminated-status echo (`onArmedFrameComplete`, `fake.ts`) — the
    // trigger the ORDINARY `final-totals` write (`maybeEmitFrame`'s
    // terminal branch) waits for — never fires either. This is the walk's
    // own shape, not a fake-only artifact: on real hardware the machine's
    // GENERAL_STATUS report of its own "terminated" state is a separate,
    // independently-timed notification that spec 1's re-walk found arrived
    // AFTER teardown had already stashed and hung up.
    fake.injectTimeout();
    await act(async () => {
      void result.current.endSession();
      await flush();
    });
    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("user");

    unmount();

    const stashed = sessionStorage.getItem("ergomatic:last-monitor-log");
    expect(stashed).not.toBeNull();
    const entries = JSON.parse(stashed!) as { kind: string; detail: string }[];
    const finalTotals = entries.filter((e) => e.kind === "final-totals");
    // Exactly one — but NOT because both call sites guard against a
    // double-write (I-2, final whole-branch review: `recordFinalTotals`'s
    // own doc comment used to claim that and it was false). This test
    // passes because `fake.injectTimeout()` above suppresses the machine's
    // own terminal status frame from ever arriving, so `maybeEmitFrame`'s
    // terminal branch — the ONLY call site with no guard of its own — never
    // runs at all; the entry below comes solely from `terminate()`'s
    // guarded call. A run where the machine's own terminal frame DOES
    // arrive after `terminate()` has already written one gets a SECOND,
    // near-identical entry (empirically reproduced, progress.md's own CARRY
    // line) — dedupe stays deferred, this test does not exercise that path.
    expect(finalTotals).toHaveLength(1);
    expect(finalTotals[0]!.detail).toContain("accumulator=");
    expect(finalTotals[0]!.detail).toContain("accumulatorElapsed=");
    expect(finalTotals[0]!.detail).toContain("machineTotal=");
    // The real program this run was armed with, not a placeholder count.
    expect(finalTotals[0]!.detail).toContain(
      `of ${LIBRARY.program.intervals.length} programmed`,
    );
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

  it("stashes the diagnostics log even when no run was ever created (the never-rowed case)", async () => {
    const { teardown } = await arriveArmedWithoutRowing();
    await teardown();

    const stash = localStorage.getItem("ergomatic:last-session-log");
    expect(stash).not.toBeNull();
    expect((JSON.parse(stash!) as unknown[]).length).toBeGreaterThan(0);
  });

  it("Task 1 (lost-monitor design spec): endSession closing with no record open writes a close-no-record entry naming what was closed, not why nothing was there", async () => {
    const { teardown } = await arriveArmedWithoutRowing();
    await teardown();

    const stash = localStorage.getItem("ergomatic:last-session-log");
    const entries = JSON.parse(stash!) as { kind: string; detail: string }[];
    const closeNoRecord = entries.find((e) => e.kind === "close-no-record");
    expect(closeNoRecord).toBeDefined();
    // Observed call parameters only — endedBy/terminated, never a reason
    // for why the record was never opened (the hard constraint against
    // stating a cause for the silence).
    expect(closeNoRecord!.detail).toBe("endedBy=rower terminated=true");
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

// ---------------------------------------------------------------------------
// Whole-branch review, BLOCKING B1 (RULED): `endSession`'s own `linkGone`
// (`phase === "disconnected"` alone) predates Task 2, which widened what
// "lost" means for the SCREEN (watchdog silence, an app-lifecycle resume)
// while the record kept the old, narrower test — so a rower pressing End
// under a LOST THE MONITOR banner stored `"rower"`, the exact conflation
// `endedBy` exists to end. Design spec §4's invariant: "whatever fires the
// banner defines the close." This reproduces the watchdog half (mechanism
// 1/2's shape: `frameSilence` latches while `phase` stays `"live"`, never
// `"disconnected"`) through the REAL liveness decorator composition (spec
// §6: "tests must assert the COMPOSITION, not just the decorator"), same
// `vi.doMock` + fresh-import idiom Task 1/2's own composition suites use.
// ---------------------------------------------------------------------------

describe('Whole-branch review B1: End under a watchdog-fired banner (phase still "live") stores endedBy link-lost', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("a suppressed stream trips the REAL watchdog, latching frameSilence while phase stays live — End then stores link-lost, not rower", async () => {
    vi.useFakeTimers();
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    // Composes the REAL decorator around the fake — the same thing
    // `defaultTransport` does in production — so this reaches the REAL
    // watchdog `setTimeout`, never a stub call to `onSilence`.
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(fake, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    // Delivers the one scripted status (arms the watchdog on this, its
    // first 0x0031) and moves both clocks together, same discipline the
    // mechanism-2 "REVIEWER'S PROBE" test uses — `fake.tick` is a virtual
    // script clock, `vi.advanceTimersByTime` is the decorator's own real
    // one, and in production a BLE notification arriving IS real
    // wall-clock time.
    act(() => {
      fake.tick(100);
      vi.advanceTimersByTime(100);
    });
    expect(result.current.phase).toBe("live");
    expect(result.current.frameSilence).toBe(false);

    // No further frame is ever delivered — real time alone crosses the
    // watchdog's 2500ms threshold. THE POINT: phase stays "live" through
    // this whole span. It never becomes "disconnected" — this is
    // mechanism 1/2's silent-freeze shape, not a radio drop.
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(result.current.frameSilence).toBe(true);
    expect(result.current.phase).toBe("live");

    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.phase).toBe("ended");
    // THE BUG (pre-fix): `linkGone` read only `phase === "disconnected"`,
    // which is false here, so this stored `endedBy: "rower"` — the exact
    // conflation the field exists to end, reintroduced by this phase's own
    // left hand (spec §4's own account of the bug).
    expect(loadMonitorRun()).toMatchObject({
      endedBy: "link-lost",
    });
  });

  // RC-29 (design spec 2026-08-27-link-authority-design.md §2): `|| linkGone`
  // deleted from `endSession`'s own terminate guard. A FALSE latch (the
  // stream is merely suspect, never confirmed gone — the exact case this
  // whole describe block builds) used to skip the terminate outright: the
  // rower presses End, the record closes, and the erg keeps running while
  // they are standing at it. Attended human intent (a press, right now) is
  // not a verdict about the link.
  it("End terminates the machine even with frameSilence latched (RC-29 — the fix, in the direction it was broken)", async () => {
    vi.useFakeTimers();
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    const transport = spyTransport(fake);
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(transport, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    act(() => {
      fake.tick(100);
      vi.advanceTimersByTime(100);
    });
    expect(result.current.phase).toBe("live");
    // Same watchdog trip as the test above — real time alone, no dropped
    // link, `phase` stays "live" throughout.
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(result.current.frameSilence).toBe(true);
    expect(result.current.phase).toBe("live");

    const before = transport.wireWrites;
    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.phase).toBe("ended");
    // THE ERG ACTUALLY STOPS — a real wire write happened, not merely a
    // best-effort attempt swallowed by the guard this task deletes.
    expect(transport.wireWrites).toBeGreaterThan(before);
  });

  it("the existing link-up behaviour is unchanged: End with the link genuinely up (frameSilence false) still terminates, same as before this task", async () => {
    const { result, fake, transport } = harness({
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    expect(result.current.frameSilence).toBe(false);

    const before = transport.wireWrites;
    await act(async () => {
      await result.current.endSession();
    });

    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("user");
    expect(loadMonitorRun()).toMatchObject({ endedBy: "rower" });
    expect(transport.wireWrites).toBeGreaterThan(before);
  });
});

// RC-37 ([R5], design spec 2026-08-27-link-authority-design.md §1): the
// consumer's own defensive guard — `if (phase !== "programming" && phase
// !== "ready") return;` — for a `programDropped` event arriving OUTSIDE the
// two phases Cancel itself is valid from. The driver's OWN `armed` gate
// (`driver.test.ts`'s own pin) makes this genuinely hard to trigger through
// an ordinary session — the structure watch only ever runs while the
// machine reports "armed", which live/resting/rowing never is — but it is
// not unreachable: a run that goes live, ends, and then the SAME machine
// re-arms (Appendix E's own auto-cycle) holding a stale/different structure
// is a real shape (this session's driver never replaces `armedProgram()`
// just because the hook moved on), and there is no fake-transport script
// hook for it (`FakeStatusEvent` carries no structure fields at all — the
// fake derives them honestly from whatever program is armed). A hand-rolled
// stub transport, mirroring `driver.test.ts`'s own `stubTransport`, is what
// drives it here.
describe("RC-37: the programDropped consumer guard, outside programming/ready", () => {
  /** A minimal hand-rolled `Transport` — NOT `transports/fake.ts`'s honest
   *  protocol simulator, which cannot be scripted into reporting a
   *  structure the armed program did not send. Mirrors `driver.test.ts`'s
   *  own `stubTransport`/`statusWithStructure` idiom (this file's own
   *  per-test-file convention: no cross-file test imports). */
  function rawTransport(): Transport & {
    notify(uuid: string, bytes: Uint8Array): void;
    writes: { uuid: string; bytes: Uint8Array }[];
  } {
    const subs = new Map<string, Set<(bytes: Uint8Array) => void>>();
    const writes: { uuid: string; bytes: Uint8Array }[] = [];
    return {
      writes,
      scan: () => Promise.resolve([{ id: "stub", name: "PM5 STUB" }]),
      connect: () => Promise.resolve(),
      write(uuid, bytes) {
        writes.push({ uuid, bytes });
        return Promise.resolve();
      },
      subscribe(uuid, cb) {
        let set = subs.get(uuid);
        if (!set) {
          set = new Set();
          subs.set(uuid, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
      disconnect: () => Promise.resolve(),
      onDisconnect: () => () => undefined,
      notify(uuid, bytes) {
        for (const cb of subs.get(uuid) ?? []) cb(bytes);
      },
    };
  }

  const RAW_MINIMAL_PROGRAM: WorkoutProgram = {
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

  /** Session 4a's confirmed armed readback for `RAW_MINIMAL_PROGRAM` — a
   *  TIME interval 0 reads `value * 100` at duration identifier 0
   *  (`pm5/commands.ts#expectedArmedStructure`'s own doc comment carries
   *  the hardware confirmation). */
  function armedStatus(): Uint8Array {
    return buildGeneralStatusBytes({
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 8,
      intervalType: 0,
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
      dragFactor: 130,
    });
  }

  /** A DIFFERENT armed structure — the same "empty arm" shape
   *  `driver.test.ts`'s own `EMPTY_ARM` fixture carries. */
  function wrongArmedStatus(): Uint8Array {
    return buildGeneralStatusBytes({
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 1,
      intervalType: 1,
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 128,
      dragFactor: 130,
    });
  }

  function rearmStatus(): Uint8Array {
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

  async function waitUntil(check: () => boolean, maxTicks = 50): Promise<void> {
    for (let i = 0; i < maxTicks && !check(); i += 1) {
      await Promise.resolve();
    }
  }

  /** A hand-advanced ms clock for `DriverOptions.now` — `STRUCTURE_MISMATCH_
   *  WINDOW_MS` (2000ms) needs REAL elapsed time between ticks, not three
   *  notifications landing in the same synchronous burst (`driver.test.ts`'s
   *  own `manualClock`, redeclared here per this project's per-test-file
   *  convention). */
  function manualClock(startMs = 0): {
    now: () => number;
    advance(by: number): void;
  } {
    let ms = startMs;
    return {
      now: () => ms,
      advance(by: number): void {
        ms += by;
      },
    };
  }

  it("a structural mismatch reported once the session has already ENDED does nothing — phase stays 'ended', programDropped stays false, the record already closed is left alone", async () => {
    const transport = rawTransport();
    const clock = manualClock();
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => transport,
        now: () => t0,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          now: clock.now,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    // Ack-gated writes counted on `RECEIVE_CHARACTERISTIC_UUID` alone
    // (`driver.test.ts`'s own `programViaStub`'s `sent()` helper) — the
    // driver also writes `SAMPLE_RATE_UUID` at connect, which must not be
    // confused with the programming sequence's own chunks. The prepare
    // step (a best-effort `buildTerminate()`, `sendPrepare`'s own doc
    // comment — ANY non-disconnect answer is swallowed, `frameStatus:
    // "reject"` included) first, then the real programming send's own
    // `"ok"` ack, then generous microtask drain (the exact
    // `programViaStub` sequence, reproduced here per this file's own "no
    // cross-file test imports" convention), THEN a fresh armed readback
    // for `verifyArmed` to observe.
    const sentCount = (): number =>
      transport.writes.filter((w) => w.uuid === RECEIVE_CHARACTERISTIC_UUID)
        .length;
    const prepareChunkCount = buildTerminate()[0]!.length;
    await act(async () => {
      const start = sentCount();
      const pending = result.current.program(RAW_MINIMAL_PROGRAM, TWO_IDENTITY);
      await waitUntil(() => sentCount() > start);
      transport.notify(
        TRANSMIT_CHARACTERISTIC_UUID,
        buildAckFrame({ frameStatus: "reject" }),
      );
      await waitUntil(() => sentCount() > start + prepareChunkCount);
      transport.notify(
        TRANSMIT_CHARACTERISTIC_UUID,
        buildAckFrame({ frameStatus: "ok" }),
      );
      for (let i = 0; i < 50; i += 1) await Promise.resolve();
      transport.notify(GENERAL_STATUS_UUID, armedStatus());
      await pending;
    });
    expect(result.current.phase).toBe("ready");

    // End, straight from READY — `endSession()`'s own guard is only
    // `phase === "ended"` (idempotence), never a "must be live first" rule,
    // and it deliberately does NOT unsubscribe from the driver (its own
    // doc comment: only `teardown()`/`cancel()` do that), so the hook is
    // still listening afterward.
    //
    // End's own terminate needs its own ack — `settleTicks: 0` skips the
    // wait AFTER it, not the ack itself.
    await act(async () => {
      const start = sentCount();
      const pending = result.current.endSession();
      await waitUntil(() => sentCount() > start);
      transport.notify(
        TRANSMIT_CHARACTERISTIC_UUID,
        buildAckFrame({ frameStatus: "ok" }),
      );
      await pending;
    });
    expect(result.current.phase).toBe("ended");

    // The machine cycles back through REARM to WaitToBegin holding a
    // DIFFERENT structure — three consecutive stable mismatched armed
    // ticks, exactly RC-37's own threshold, with the guard's own
    // reasoning: `armedProgram()` still points at `RAW_MINIMAL_PROGRAM`
    // (nothing has replaced it — no second `program()` call happened), so
    // the driver's watch has every reason to fire.
    act(() => {
      transport.notify(GENERAL_STATUS_UUID, rearmStatus());
    });
    act(() => {
      clock.advance(1000);
      transport.notify(GENERAL_STATUS_UUID, wrongArmedStatus());
    });
    act(() => {
      clock.advance(1000);
      transport.notify(GENERAL_STATUS_UUID, wrongArmedStatus());
    });
    act(() => {
      clock.advance(1000); // three ticks spanning 2000ms — both thresholds
      transport.notify(GENERAL_STATUS_UUID, wrongArmedStatus());
    });

    // THE GUARD: phase is still "ended", not reset to "idle" — the event
    // reached the handler and was deliberately ignored. `endedBy` stays
    // "user" (End's own verdict, never overwritten) — a pre-row End opens
    // no record at all (Phase LM's own finding), so `loadMonitorRun()`
    // being `null` here is the correct baseline, unperturbed by the
    // mismatch.
    expect(result.current.phase).toBe("ended");
    expect(result.current.endedBy).toBe("user");
    expect(result.current.programDropped).toBe(false);
    expect(loadMonitorRun()).toBeNull();
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
    // D6: while the link is down every cached GATT handle is dead and a
    // write on one throws — `sendSequence` does not wrap that, so a raw
    // Error escapes `program()`. Reproduced directly on `write()`
    // (`deadHandleTransport`, F1 fix round 1's own doc comment) rather
    // than via `injectDisconnect()`: that path now disposes `driverRef`
    // itself (the CRITICAL fix — see the F1 tests above), so it reaches
    // `transport-missing` before any write is even attempted, and can no
    // longer produce THIS mapping. The record is not open yet, so no P3b
    // close is involved; this is purely the mapping.
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
    });
    const transport = deadHandleTransport(fake);
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => transport,
        now: () => t0,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );
    await connect(result);

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

  // Phase LL Task 3 (§3), exit criterion 2. The 2026-08-20 walk's actual
  // root cause, reproduced against TODAY's code and then closed: the
  // review corrected the walk README's own diagnosis — `connect()`'s catch
  // never cleared `driverRef`, and never did — so a failed `program()`
  // left BOTH the driver ref AND `session.deviceName` (the field
  // `ConnectedInterstitial.tsx`'s retry actually branches on) standing.
  // Try Again then called `program()` again against the SAME dead driver
  // forever: the LINK-FAILED loop that cost James a reinstall.
  //
  // F1 fix round 1: reproduced via `deadHandleTransport` (see the test
  // above), not `injectDisconnect()` — that path disposes `driverRef`
  // itself now, which is a DIFFERENT disposal (this test's subject is
  // `fail()`'s own, Phase LL Task 3, unchanged by this fix round; the F1
  // tests above cover the disconnected-event one).
  it("a failed program() disposes: deviceName clears, the transport goes down, and the driver ref is gone (no longer reachable by a further program())", async () => {
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
    });
    const transport = deadHandleTransport(fake);
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => transport,
        now: () => t0,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );
    await connect(result);
    expect(result.current.deviceName).toBe(DEVICE_NAME);

    // The same D6 link-failed reproduction the test above uses: the GATT
    // handle dies, program() throws synchronously, `fail()` runs.
    const disconnectsBefore = transport.disconnects;
    await act(async () => {
      await result.current.program(TWO_INTERVALS, TWO_IDENTITY);
      await flush();
    });
    expect(result.current.phase).toBe("failed");
    expect(result.current.error?.reason).toBe("link-failed");

    // 1. `deviceName` cleared — the field Try Again's retry branches on.
    expect(result.current.deviceName).toBeNull();
    // 2. The transport is down — `driver.disconnect()` ran, which is this
    // spy's own `disconnect()` wrapper on the SAME transport `connect()`
    // built (not a second, unrelated transport instance).
    expect(transport.disconnects).toBeGreaterThan(disconnectsBefore);

    // 3. The driver ref is gone. Nothing exports it directly, so this is
    // the FUNCTIONAL proof (this file's own established idiom, e.g. the
    // "transport-missing" tests above): a further program() call against
    // a cleared ref fails `transport-missing` immediately, rather than
    // reaching the SAME stale, already-dead driver a second time (which
    // today would repeat `link-failed` forever — the loop itself).
    const writeAttemptsBefore = transport.writeAttempts;
    await act(async () => {
      await result.current.program(TWO_INTERVALS, TWO_IDENTITY);
      await flush();
    });
    expect(result.current.error?.reason).toBe("transport-missing");
    expect(transport.writeAttempts).toBe(writeAttemptsBefore);
  });

  // Phase LL Task 3 (§3, F-6): the already-connected guard's outcome is a
  // structural extension on the transport (`capacitorBle.ts`'s own
  // `describeLastScan()`, mirroring `onCharacteristicDegraded`/
  // `markSuspect` immediately above it in this file) — `fake.ts` does not
  // implement it (the guard is Apple-API-specific, pinned instead by
  // `capacitorBle.test.ts`'s own mocked `BleClient`), so this is proven
  // here with a bespoke `createTransport` override carrying it, the same
  // pattern `hasLivenessSnapshot`'s own doc comment describes for a test
  // transport that does NOT carry an extension.
  it("when the transport names its last scan's outcome, connect() writes it to the ring", async () => {
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
    });
    const withOutcome: Transport & { describeLastScan(): string | null } = {
      ...fake,
      describeLastScan: () => "offered the already-held device; no picker",
    };
    const { result } = renderHook(() =>
      useMonitorSession({ createTransport: () => withOutcome }),
    );

    await connect(result);

    const entries: { kind: string; detail: string }[] = JSON.parse(
      result.current.exportLog(),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        kind: "already-connected-guard",
        detail: "offered the already-held device; no picker",
      }),
    );
  });

  // `describeLastScan()`'s own doc comment (`capacitorBle.ts`): `null`
  // before any `scan()` has run. Unreachable through the REAL transport
  // (this hook always calls `scan()` before this log-wiring code runs),
  // but the extension is structural, not a guarantee — a transport that
  // carries the method yet has nothing to say must not write a ring entry
  // with no `detail`.
  it("the extension present but nothing to say yet (null): no ring entry, no throw", async () => {
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
    });
    const withNullOutcome: Transport & { describeLastScan(): string | null } = {
      ...fake,
      describeLastScan: () => null,
    };
    const { result } = renderHook(() =>
      useMonitorSession({ createTransport: () => withNullOutcome }),
    );

    await connect(result);

    const entries: { kind: string }[] = JSON.parse(result.current.exportLog());
    expect(entries.some((e) => e.kind === "already-connected-guard")).toBe(
      false,
    );
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
      // Phase LL Task 4 (design spec §4's writer table): "a failed
      // program() closing an open run -> program-failed" — the
      // previously-unmapped path.
      endedBy: "program-failed",
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
      // Phase LL Task 4: still `"program-failed"` even on the
      // disconnected-rejection variant — the CLOSE REASON is "what closed
      // this record" (a failed program with a run open), independent of
      // whether a terminate could be attempted afterward.
      endedBy: "program-failed",
    });
  });

  // Review round (P3b's own hazard, named against `teardown()`'s existing
  // pattern): `fail()`'s disposal must not race the terminate P3b just
  // fired. `driver.terminate()` here is fire-and-forget from `program()`'s
  // own catch — `fail()` used to disconnect in the SAME TICK regardless,
  // with no ordering against it at all. Apple documents
  // `cancelPeripheralConnection` as nonblocking with pending commands
  // POSSIBLY NOT COMPLETING (CoreBluetooth reference,
  // `CBCentralManager.cancelPeripheralConnection(_:)`), so an immediate
  // disconnect can plausibly abort the terminate write in flight — leaving
  // the erg ARMED with the just-rejected program, silently (DEVIATIONS row
  // 63's own documented harm). `teardown()` in this same file already
  // avoids exactly this shape (`driver.terminate().finally(() =>
  // bestEffort(driver.disconnect()))`); this pins `fail()` to the same
  // rule for the ONE path that fires a terminate of its own — P3b.
  //
  // A REAL race is unprovable (this is client-side JS, not CoreBluetooth),
  // but the ORDERING is: a hand-rolled write() interceptor holds the
  // TERMINATE frame's own write pending — indistinguishable, from
  // `sendSequence`'s point of view, from a real slow radio — so
  // `driver.terminate()` cannot settle until the test releases it. Byte
  // match, not a call-count/order guess: the retry's own NAK'd program
  // frames go through the REAL fake at full (same-microtask) speed, and
  // only the frame matching `buildTerminate()`'s own bytes is intercepted.
  it.each([["resolve", true] as const, ["reject", false] as const])(
    "P3b: disconnect() waits for the in-flight terminate to settle before firing — %s case",
    async (_label, shouldResolve) => {
      const { result, fake, transport } = harness({
        program: TWO_INTERVALS,
        events: liveTimeline,
      });
      await connect(result);
      await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
      tick(fake, 100);
      expect(result.current.phase).toBe("live");
      // Same P3b precondition as the suite above: the machine's own
      // terminated report must not race in and close the run through the
      // ordinary path before the NAK'd retry ever gets there.
      transport.deaf = true;
      fake.injectNak(0);

      const terminateChunk = buildTerminate()[0]![0]!;
      function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
        return a.length === b.length && a.every((v, i) => v === b[i]);
      }
      // `buildTerminate()`'s own bytes are reused TWICE in this one retry:
      // `program()`'s own leading "clear" step (its own doc comment —
      // `driver.terminate()`'s doc comment on `program()` names it) is the
      // FIRST occurrence, sent and acked normally before the NAK'd
      // programming frame ever goes out; the catch's OWN `driver.terminate
      // ()` call — the one this test is about — is the SECOND. A bare byte
      // match alone cannot tell them apart; counting occurrences can.
      let terminateWriteCount = 0;
      const originalWrite = transport.write.bind(transport);
      let settleHeldWrite: (() => void) | null = null;
      transport.write = (
        characteristicId: string,
        bytes: Uint8Array,
      ): Promise<void> => {
        if (
          characteristicId === RECEIVE_CHARACTERISTIC_UUID &&
          bytesEqual(bytes, terminateChunk)
        ) {
          terminateWriteCount += 1;
          if (terminateWriteCount === 2) {
            return new Promise<void>((resolve, reject) => {
              settleHeldWrite = () => {
                if (shouldResolve) {
                  originalWrite(characteristicId, bytes).then(resolve, reject);
                } else {
                  reject(new Error("simulated: write failed mid-terminate"));
                }
              };
            });
          }
        }
        return originalWrite(characteristicId, bytes);
      };

      let programming: Promise<void>;
      await act(async () => {
        programming = result.current.program(TWO_INTERVALS, TWO_IDENTITY);
        await flush();
      });

      // `program()` itself never awaits the terminate it fires (it is
      // fire-and-forget from that catch) — its own promise is already
      // settled here, independent of the held write above.
      expect(result.current.phase).toBe("failed");
      expect(result.current.error?.reason).toBe("nak");
      // THE PIN: the terminate write is still held — `driver.terminate()`
      // cannot have settled — so disconnect() must not have fired yet.
      expect(transport.disconnects).toBe(0);

      await act(async () => {
        settleHeldWrite?.();
        await flush();
      });

      // Once the terminate settles — however it settles — the disposal's
      // disconnect follows.
      expect(transport.disconnects).toBe(1);
      await programming!;
    },
  );
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
            avgSpm: 20,
            avgHeartRateBpm: 120,
            restDistanceMeters: 0,
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

  // F1 fix round 1 (cohort-unlock spec §1 review, CRITICAL): before this
  // fix, `disconnected` left `driverRef` populated with the dead driver
  // forever — nothing but `teardown()`/`fail()`/`cancel()` ever cleared
  // it — so `connect()`'s own opening guard (`driverRef.current !==
  // null`) silently no-op'd a retry from this exact state. The component
  // side (`ConnectedInterstitial.test.tsx`) proves the button renders
  // enabled and taps `connect()` once; this proves that call is not a
  // no-op — a real second scan/connect/driver happens, the same as the
  // walk's own Cancel -> Connect recovery.
  it("F1: connect() again after a disconnected event reaches a genuinely fresh scan, not a driverRef !== null no-op", async () => {
    const { result, fake, transport } = harness({
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    expect(transport.scans).toBe(1);

    act(() => {
      fake.injectDisconnect();
    });
    expect(result.current.phase).toBe("disconnected");
    // The disposal itself: the dead driver's `disconnect()` reaches the
    // transport — proof the fix actually clears `driverRef`, not merely
    // that a later `connect()` happens to work despite it.
    expect(transport.disconnects).toBe(1);

    await connect(result);

    // Before this fix: `connect()`'s `driverRef.current !== null` guard
    // returned immediately, `transport.scans` stayed at 1, and `phase`
    // stayed stuck at `"disconnected"` forever — exactly the walk's dead
    // button, at the hook layer.
    expect(transport.scans).toBe(2);
    expect(result.current.phase).toBe("pairing");
  });

  it("F1: deviceName survives the disconnected-event disposal — the LOST header's own data", async () => {
    const { result, fake } = harness({
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 20, distanceMeters: 70 })],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 100);
    expect(result.current.deviceName).toBe(DEVICE_NAME);

    act(() => {
      fake.injectDisconnect();
    });

    // Unlike `fail()`, which clears `deviceName` in the same `update()` as
    // its phase flip, the disconnected-event disposal must NOT: the
    // disconnected-WITH-run surface renders its LOST header
    // ("PM5 … · LOST") straight from `session.deviceName`.
    expect(result.current.phase).toBe("disconnected");
    expect(result.current.deviceName).toBe(DEVICE_NAME);
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
            avgSpm: 22,
            avgHeartRateBpm: 140,
            restDistanceMeters: 0,
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
            avgSpm: 22,
            avgHeartRateBpm: 140,
            restDistanceMeters: 0,
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
    splitAvgPace: null,
    restSeconds: 0,
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

/** log lines 3542-3551, plus one later frame from the same stretch: the
 *  rower stops. SIX moving frames, then the three keyed metrics freeze at
 *  `108.4 / 236.75 / 16` (the elapsed `57.78` alongside them is the empty
 *  arm's own artifact, not part of the key) — and stay frozen for 216 consecutive
 *  frames (3548-3763, where split and spm finally zero), with the heart
 *  rate moving the whole time. The last fixture frame below (HR 60) is
 *  a real frame from further down that stretch, not line 3552 — HR 60
 *  occurs 24 times inside it; it is here to carry the HR movement into the
 *  fixture, and its keyed metrics are the same frozen three. spm PINNED at
 *  16, not zeroed: the observation that killed the original `spm === 0`
 *  predicate.
 *
 *  IT STARTS FOUR FRAMES EARLIER THAN IT USED TO (`:3542-3545`, still
 *  verbatim), because the predicate now asks whether THIS interval has
 *  seen a pull before it will call anything a pause (`PULL_EVIDENCE_FRAMES`).
 *  The old six-frame window opened two frames before the stop, which is
 *  less rowing than a real stopped rower has ever done — the fixture was
 *  shorter than the behaviour it stands for, recurring failure #3. These
 *  four lines are the same continuous stretch of the same recording, not a
 *  hand-built runway. */
const RECORDED_STOP: MonitorFrame[] = [
  frame({
    elapsedSeconds: 55.06,
    distanceMeters: 103.8,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 83,
  }),
  frame({
    elapsedSeconds: 55.53,
    distanceMeters: 104.7,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 83,
  }),
  frame({
    elapsedSeconds: 56.05,
    distanceMeters: 105.6,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 83,
  }),
  frame({
    elapsedSeconds: 56.54,
    distanceMeters: 106.4,
    currentSplit: 236.75,
    spm: 16,
    heartRateBpm: 83,
  }),
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
    // Frames 0-5 are still moving; the freeze starts at index 6, so the
    // fourth frozen frame is index 9.
    expect(runs.map(isPausedRun)).toStrictEqual([
      false,
      false,
      false,
      false,
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

  /** The recorded stop's own five progressing frames (`:3542-3546`,
   *  103.8 -> 107.3), folded in before a hand-built hold. The predicate
   *  will not call anything a pause until THIS interval has produced pull
   *  evidence (`PULL_EVIDENCE_FRAMES`), so a hold assembled out of nothing
   *  but identical frames is a rower who never started — the case the
   *  false-pause tests below own. Every assertion here is about the KEY, so
   *  each one starts from a rower who genuinely rowed first. */
  function afterAPull(): FreezeRun {
    let run: FreezeRun | null = null;
    for (const f of RECORDED_STOP.slice(0, 5)) run = nextFreezeRun(run, f);
    return run!;
  }

  it.each([
    ["distanceMeters", { distanceMeters: 109.2 }],
    ["currentSplit", { currentSplit: 231.4 }],
    ["spm", { spm: 17 }],
  ] as const)(
    "a frame that changes ONLY %s breaks a three-frame hold",
    (_metric, moved) => {
      const held = frame(FROZEN);
      let run = nextFreezeRun(afterAPull(), held);
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
    let run = nextFreezeRun(afterAPull(), held);
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
    let run = nextFreezeRun(afterAPull(), held);
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
    const frozen: FreezeRun = {
      key: "",
      frames: 0,
      pull: null,
      pulled: false,
    };
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

  // TASK 5 STEP 4 (connected-axes 2a): "rest suppression is NOT new code" —
  // `deriveActivity`'s own `"unknown"` for a non-`live` phase already
  // covers a rest that happens BEFORE the erg ever goes live, and this
  // predicate's `distanceMeters <= 0` guard (above) already covers a rest
  // mid-session, which is the case pinned here. Not a new mechanism, one
  // extra frame count on the existing guard: a REST that runs far longer
  // than `PAUSED_FRAME_HOLD` — the shape a real 3:00 rest between work
  // pieces actually has, not the single reset frame the test above uses —
  // never accumulates a single frame toward the hold, because every one of
  // those frames resets the count outright rather than merely skipping the
  // increment. `isPausedRun` can therefore never see anything but `frames:
  // 0` from a resting stream, however long it runs.
  //
  // THE COMMENT THE BRIEF ASKS FOR: this guarantee lives ENTIRELY in
  // `nextFreezeRun`'s `frame.state !== "rowing"` branch (above) — the
  // moment `activity`/`frozen` is re-derived from anything else (a status
  // word, a different frame field, a second freeze predicate written for a
  // different screen), this pin stops proving anything about THAT path and
  // must be re-derived alongside it, not assumed to still hold.
  it("a resting STREAM, arbitrarily long, never accumulates a single frame toward frozen", () => {
    // `distanceMeters: 30`, NOT the factory's default 0 — a real rest holds
    // "distance-still" (this predicate's own doc comment: "resting
    // legitimately freezes spm 0 / split 0 / distance-still for its whole
    // duration"), i.e. banked at whatever the just-finished work interval
    // left it, not reset to zero. A resting fixture at distance 0 would
    // pass this test off the `distanceMeters <= 0` guard ALONE and never
    // exercise the `state !== "rowing"` branch at all — this value is
    // chosen specifically so the mutation below (dropping the state check)
    // is the one thing that can make this test fail.
    const resting = frame({
      state: "resting",
      distanceMeters: 30,
      currentSplit: 0,
      spm: 0,
    });
    let run: FreezeRun | null = null;
    // Ten resting frames — well past `PAUSED_FRAME_HOLD` (4) — is a real
    // rest bout's own shape, not a synthetic edge case.
    for (let i = 0; i < 10; i += 1) {
      run = nextFreezeRun(run, resting);
      expect(run.frames).toBe(0);
      expect(isPausedRun(run)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// THE WORK INTERVAL NOBODY HAS PULLED IN YET (Phase LM fix round 2, task 5)
//
// Reported on hardware, 2026-08-26: `PULL TO RESUME` appeared about two
// seconds into a work interval, while the flywheel was still coasting and
// before the rower had taken a stroke in it. The rower's own conditions,
// from the walk card's leg 2b: take a pull or two DURING the rest, then stop
// as the work interval starts.
//
// EVIDENCE CLASS, STATED HONESTLY. This is an OBSERVATION with conditions,
// not a wire capture — a device build cannot produce a recording (the
// download row is dev-gated), and the whole committed corpus contains no
// boundary of this shape: every recorded rest-to-work changeover in
// `docs/monitor/sessions/` has the rower pulling immediately (measured, this
// session, by decoding 0x0031 and 0x0032 across all nine committed
// recordings — the two identical-key runs that exist in the corpus are both
// mid-interval stops, pinned as such below). So the sequence below is
// SYNTHETIC, built frame by frame from readings the record does contain:
//   - the resting frames hold the just-finished interval's distance
//     ("distance-still", `nextFreezeRun`'s own doc comment);
//   - the first frame of the new interval reads `d 0.1` with the PREVIOUS
//     interval's split and rate carried over a zeroed clock — verbatim from
//     `walk-2026-08-25/rests-finished-recording.jsonl.gz` (its second
//     rest-to-work changeover: `d 0.1 / split 195.6 / spm 24`, the frame
//     right after two resting frames at `d 348.6`);
//   - the frames after it hold `d 0.1 / split 0 / rate 0` while the workout
//     clock keeps running, which is a coast that has fallen below the wire's
//     own 0.1 m resolution (`parse.ts` divides the raw field by 10).
// The synthetic part is only that the rower does NOT pull. Nothing here
// asserts a cause for what the machine reports; it asserts what the app may
// say about it.
// ---------------------------------------------------------------------------

/** Two resting frames, then a work interval whose flywheel is still turning
 *  too slowly to move the wire's own resolution. `d 0.1 > 0`, so the
 *  `distanceMeters <= 0` guard is ALREADY clear on the interval's first
 *  frame — which is why that guard alone never stood between this rower and
 *  a pause declaration. */
const COASTED_BOUNDARY: MonitorFrame[] = [
  frame({ state: "resting", elapsedSeconds: 0, distanceMeters: 348.6 }),
  frame({ state: "resting", elapsedSeconds: 0, distanceMeters: 348.6 }),
  frame({
    elapsedSeconds: 0.09,
    distanceMeters: 0.1,
    currentSplit: 195.6,
    spm: 24,
  }),
  ...Array.from({ length: 6 }, (_, i) =>
    frame({
      elapsedSeconds: 0.6 + i * 0.5,
      distanceMeters: 0.1,
      currentSplit: 0,
      spm: 0,
    }),
  ),
];

describe("the interval that has not been pulled in yet", () => {
  it("a dying coast into a fresh work interval NEVER declares a pause, however long it holds the same reading", () => {
    const { runs, everPaused } = replay(COASTED_BOUNDARY);

    expect(everPaused).toBe(false);
    // The hold itself is real and is NOT what changed: six identical frames
    // still accumulate exactly as they always did. What the session may
    // conclude from them is what changed.
    expect(runs[runs.length - 1]!.frames).toBeGreaterThanOrEqual(
      PAUSED_FRAME_HOLD,
    );
  });

  it("...and the SAME coast declares one the moment the interval has actually been rowed", () => {
    // The other direction, on the same fixture shape: five progressing
    // frames — a rower who pulled — and then the identical dead hold. This
    // is the feature, and it must survive the fix: a rower who stops
    // MID-INTERVAL still gets told to pull.
    // 1.8 / 3.8 / 5.7 / 7.5 / 9.3 and the split beside them are the record's
    // own: the third rest-to-work changeover in
    // `walk-2026-08-25/rests-finished-recording.jsonl.gz`, where the rower
    // pulls straight away. Note the RATE reads 0 through all five of them
    // while the metres climb — the machine takes about four seconds to
    // report a stroke rate after a changeover, which is why the rate can
    // never be what "this interval has been pulled in" is read from.
    const rowed: MonitorFrame[] = [
      ...COASTED_BOUNDARY.slice(0, 3),
      ...[1.8, 3.8, 5.7, 7.5, 9.3].map((distanceMeters, i) =>
        frame({
          elapsedSeconds: 0.6 + i * 0.5,
          distanceMeters,
          currentSplit: distanceMeters < 5 ? 0 : 138.34,
          spm: 0,
        }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        frame({
          elapsedSeconds: 3.1 + i * 0.5,
          distanceMeters: 9.3,
          currentSplit: 138.34,
          spm: 0,
        }),
      ),
    ];

    expect(replay(rowed).everPaused).toBe(true);
  });

  /** The threshold itself, from both sides — the mutant that survived the
   *  first pass through this block was `>=` for `>`, because every other
   *  fixture here happens to carry a frame or two more runway than the
   *  constant needs. One frame short of `PULL_EVIDENCE_FRAMES` is not
   *  evidence; exactly `PULL_EVIDENCE_FRAMES` is. Distances are the real
   *  post-rest ramp (`walk-2026-08-25`, third changeover), truncated to the
   *  frame count each case needs. */
  function rampThenHold(progressingFrames: number): MonitorFrame[] {
    const ramp = [0.1, 1.8, 3.8, 5.7, 7.5, 9.3].slice(0, progressingFrames);
    const last = ramp[ramp.length - 1]!;
    return [
      ...ramp.map((distanceMeters, i) =>
        frame({ elapsedSeconds: 0.1 + i * 0.5, distanceMeters, spm: 0 }),
      ),
      ...Array.from({ length: PAUSED_FRAME_HOLD }, (_, i) =>
        frame({
          elapsedSeconds: 3.1 + i * 0.5,
          distanceMeters: last,
          spm: 0,
        }),
      ),
    ];
  }

  it("five progressing frames earn a pause and four do not", () => {
    // LITERALS, not `PULL_EVIDENCE_FRAMES ± 1`: written in terms of the
    // constant, this test moves with it and pins nothing — a silent ratchet
    // to 4 or 6 stays green. Five is what ships, and the number is a
    // judgement (`PULL_EVIDENCE_FRAMES`'s own comment says where it came
    // from and which way its two costs run), so changing it should cost a
    // red test and a fresh derivation rather than an edit.
    expect(PULL_EVIDENCE_FRAMES).toBe(5);
    expect(replay(rampThenHold(5)).everPaused).toBe(true);
    expect(replay(rampThenHold(4)).everPaused).toBe(false);
  });

  it("the PREVIOUS interval's rowing does not count as this one's pull", () => {
    // The rower rows interval 0 in full, rests, and coasts into interval 1
    // without pulling. Pull evidence has to be per-INTERVAL or it is
    // worthless here: anything session-scoped is already satisfied by the
    // frames above the rest, and the false pause is straight back.
    const previousInterval = RECORDED_STOP.slice(0, 6);
    const rest = Array.from({ length: 4 }, () =>
      frame({ state: "resting", distanceMeters: 108.4 }),
    );

    expect(
      replay([...previousInterval, ...rest, ...COASTED_BOUNDARY.slice(2)])
        .everPaused,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase LL minor 3 (design spec §2b, task-2-report.md's own finding):
// §2b's suspected mechanism — a flywheel-gated work-interval open reading
// as PAUSED because the clock is legally stationary before the first pull
// — was investigated and FALSIFIED, not fixed: replaying the corpus
// through `nextFreezeRun`/`isPausedRun` found zero PAUSED firings at any
// post-rest work-interval start (the `distanceMeters<=0` guard already
// excludes it structurally). No speculative fix shipped. That negative
// result lived only in a task report until now — this pins it as a
// committed regression, so a future change to the guard cannot silently
// reopen the mechanism without a red test naming it.
//
// Corpus reader: the SAME 6 committed captures `liveness.test.ts`'s own
// `CORPUS_FILES` sweeps (`step-1` excluded there for the identical reason
// — a 2-line disconnect-only fragment with no 0x0031 at all). Decodes
// 0x0031 (GENERAL_STATUS_UUID) ALONE, through the real `parseGeneralStatus`/
// `toMonitorState` — never hand-rolled. That is deliberately sufficient:
// `nextFreezeRun`'s outer guard (`state !== "rowing" || distanceMeters <=
// 0`) is entirely a function of those two 0x0031 fields, which is exactly
// the mechanism under test here. `currentSplit`/`spm` come from a
// DIFFERENT characteristic (0x0032) this reader never touches, so
// `freezeKey`'s other two components are held at a fixed placeholder
// deliberately — real values could only make the key diverge MORE often
// frame to frame (more resets), never less, so a placeholder cannot
// manufacture a false-negative PAUSED firing the guard itself would have
// prevented at the boundary this test actually probes.
// ---------------------------------------------------------------------------

const LL_CORPUS_FILES = [
  "walk-2026-08-16/session-1-keystone-2x250r0.jsonl",
  "walk-2026-08-16/session-2-wu-4unequal.jsonl",
  "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl",
  "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
  "walk-2026-08-17/step-4-pm5-recording-1786974067695.jsonl",
  "walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz",
  // LOW-5, Task 5's review: the sweep covered 6 of 9 committed recordings and
  // omitted the file the whole diagnosis is drawn from. Adding all three —
  // and the keystone one is the file whose no-rest changeover skips `d 0`
  // entirely (MEDIUM-1), which this sweep would have surfaced.
  "walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz",
  "walk-2026-08-25/rests-finished-recording.jsonl.gz",
  "walk-2026-08-25/smoke-terminated-recording.jsonl.gz",
];

const LL_SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/useMonitorSession\.test\.ts$/,
    "../docs/monitor/sessions/",
  );

function loadCorpusFreezeFrames(fileName: string): MonitorFrame[] {
  const path = `${LL_SESSIONS_DIR}${fileName}`;
  const text = fileName.endsWith(".gz")
    ? gunzipSync(readFileSync(path)).toString("utf8")
    : readFileSync(path, "utf8");
  const recording = parseRecording(text);
  const frames: MonitorFrame[] = [];
  for (const event of recording.events) {
    if (!("dir" in event) || event.dir !== "rx") continue;
    if (event.char !== GENERAL_STATUS_UUID) continue;
    const bytes = fromHexString(event.hex);
    const gs = parseGeneralStatus(bytes);
    if ("error" in gs) continue;
    frames.push(
      frame({
        distanceMeters: gs.distanceMeters,
        state: toMonitorState(gs.workoutState),
      }),
    );
  }
  return frames;
}

describe("Phase LL minor 3: §2b's falsification, pinned as a committed regression — zero PAUSED firings at any post-rest work-interval start, across the full committed corpus", () => {
  it.each(LL_CORPUS_FILES)(
    "%s: every resting -> rowing transition stays clear of PAUSED through the guard's own window",
    (fileName) => {
      const frames = loadCorpusFreezeFrames(fileName);
      expect(frames.length).toBeGreaterThan(0);
      const { runs } = replay(frames);

      // Every frame index where the decoded state transitions FROM
      // resting TO rowing — a post-rest work-interval start, the exact
      // boundary §2b's suspected mechanism would have to fire at.
      const postRestStarts: number[] = [];
      for (let i = 1; i < frames.length; i += 1) {
        if (
          frames[i - 1]!.state === "resting" &&
          frames[i]!.state === "rowing"
        ) {
          postRestStarts.push(i);
        }
      }

      for (const start of postRestStarts) {
        // `PAUSED_FRAME_HOLD` frames is the guard's own window (plus a
        // 2-frame margin) — the mutation this test guards against is
        // dropping `nextFreezeRun`'s `distanceMeters <= 0` half of the
        // guard, which would let the zero-distance flywheel-gated frames
        // right after a rest start accumulating toward PAUSED instead of
        // resetting on every one of them.
        const windowEnd = Math.min(runs.length, start + PAUSED_FRAME_HOLD + 2);
        for (let i = start; i < windowEnd; i += 1) {
          expect(isPausedRun(runs[i]!)).toBe(false);
        }
      }
    },
  );

  /** Where a pause is DECLARED in the committed corpus, measured this
   *  session by replaying every recording frame by frame. Two, in two files,
   *  and both are the same shape: metres climbing frame after frame, then
   *  the three keyed metrics dead while the workout clock keeps running —
   *  a rower who stopped mid-interval. This is the half of the record the
   *  false-pause fix must NOT touch, so it is pinned as a positive: the
   *  negative sweep above would stay green if the predicate stopped firing
   *  at all. */
  const LL_RECORDED_MID_INTERVAL_STOPS: Record<string, number[]> = {
    "walk-2026-08-16/session-1-keystone-2x250r0.jsonl": [],
    "walk-2026-08-16/session-2-wu-4unequal.jsonl": [],
    "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl": [],
    "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl": [
      246,
    ],
    "walk-2026-08-17/step-4-pm5-recording-1786974067695.jsonl": [],
    "walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz": [
      1080,
    ],
    // The three added at Task 5's review (LOW-5). Empty is a FINDING, not a
    // gap: across all nine committed recordings the corpus contains exactly
    // two identical-key runs, both above. The rest-bearing file is the one
    // the whole false-pause diagnosis was drawn from, and it contains no
    // mid-interval stop of its own — the rower rowed straight through both
    // of its boundaries.
    "walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz": [],
    "walk-2026-08-25/rests-finished-recording.jsonl.gz": [],
    "walk-2026-08-25/smoke-terminated-recording.jsonl.gz": [],
  };

  it.each(LL_CORPUS_FILES)(
    "%s: every mid-interval stop the recording contains still declares a pause, at the frame it always did",
    (fileName) => {
      const { runs } = replay(loadCorpusFreezeFrames(fileName));
      const onsets: number[] = [];
      for (let i = 0; i < runs.length; i += 1) {
        if (isPausedRun(runs[i]!) && (i === 0 || !isPausedRun(runs[i - 1]!))) {
          onsets.push(i);
        }
      }

      expect(onsets).toStrictEqual(LL_RECORDED_MID_INTERVAL_STOPS[fileName]);
    },
  );

  it("sanity: the corpus genuinely contains post-rest work-interval starts — a suite where this were 0 for every file would prove nothing", () => {
    const total = LL_CORPUS_FILES.reduce((sum, fileName) => {
      const frames = loadCorpusFreezeFrames(fileName);
      let count = 0;
      for (let i = 1; i < frames.length; i += 1) {
        if (
          frames[i - 1]!.state === "resting" &&
          frames[i]!.state === "rowing"
        ) {
          count += 1;
        }
      }
      return sum + count;
    }, 0);
    expect(total).toBeGreaterThan(0);
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

describe("useMonitorSession: frozen (the freeze predicate), end to end", () => {
  /** The recorded stop, delivered as real status ticks through the fake so
   *  the whole path — wire bytes, driver, hook — is exercised, not just the
   *  predicate. `phase` stays `"live"` throughout (task 5, connected-axes
   *  2a: `"paused"` retired off `ConnectedPhase` — a frozen session never
   *  actually left `"live"`, so this test now pins `frozen` instead of a
   *  phase transition that no longer happens). */
  it("four frozen frames publish frozen:true; the next change clears it — phase never leaves live", async () => {
    const frozen = {
      elapsedSeconds: 57.78,
      distanceMeters: 108.4,
      currentSplit: 236,
      spm: 16,
    };
    // The recording's own five progressing frames ahead of the stop
    // (`pm5-session3-final.log:3542-3546`) — a rower who actually rowed
    // this interval, which is what `PULL_EVIDENCE_FRAMES` requires before
    // anything may be called a pause. The fixture used to open two frames
    // before the freeze; that is less rowing than any real stopped rower
    // has done, and it is the same lengthening `RECORDED_STOP` took.
    const rowed = [103.8, 104.7, 105.6, 106.4, 107.3].map((distanceMeters, i) =>
      status(100 + i * 100, {
        elapsedSeconds: 55.06 + i * 0.5,
        distanceMeters,
        spm: 16,
        currentSplit: 236,
      }),
    );
    const { result, fake, unmount } = harness({
      program: TWO_INTERVALS,
      events: [
        ...rowed,
        status(600, frozen),
        status(700, frozen),
        status(800, frozen),
        status(900, frozen),
        // RC-25: two MORE frozen frames so the pause HOLDS past its onset.
        // Without them the pause lasts a single frame, and "exactly one
        // pause-declared entry" cannot tell an edge-triggered log from a
        // per-frame one — a mutation to `if (nowPaused)` stayed green until
        // these were added.
        status(1000, frozen),
        status(1100, frozen),
        status(1200, { ...frozen, elapsedSeconds: 58.3, distanceMeters: 109 }),
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);

    for (let i = 0; i < rowed.length; i += 1) {
      tick(fake, 100);
      expect(result.current.phase).toBe("live");
      expect(result.current.frozen).toBe(false);
    }

    tick(fake, 100);
    tick(fake, 100);
    tick(fake, 100);
    // Three frozen frames is still NOT frozen — the boundary-reset margin.
    expect(result.current.phase).toBe("live");
    expect(result.current.frozen).toBe(false);

    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    expect(result.current.frozen).toBe(true);

    // The pause HOLDS across further identical frames (RC-25's fixture
    // extension) — this is what makes the edge-vs-per-frame check below real.
    tick(fake, 100);
    expect(result.current.frozen).toBe(true);
    tick(fake, 100);
    expect(result.current.frozen).toBe(true);

    tick(fake, 100);
    expect(result.current.phase).toBe("live");
    expect(result.current.frozen).toBe(false);

    // RC-25 (James: "Add the instrument now"). The pause is DERIVED and used
    // to be logged nowhere, which is why a false PULL TO RESUME at the erg
    // left no trace and had to be provoked to be seen. The edge is now
    // recorded with the evidence the predicate weighed, so the next NATURAL
    // occurrence is diagnosable from a COPY tap instead of a walk.
    // The ring reaches sessionStorage at TEARDOWN, so unmount first — the
    // pause assertions above are already done.
    unmount();
    const stash = sessionStorage.getItem("ergomatic:last-monitor-log");
    const declared = (
      JSON.parse(stash ?? "[]") as { kind: string; detail: string }[]
    ).filter((e) => e.kind === "pause-declared");
    // EXACTLY ONE: the edge, not every frame the pause holds for. A per-frame
    // entry would bury the ring it is written into.
    expect(declared).toHaveLength(1);
    // The evidence, not a verdict — and no cause asserted.
    expect(declared[0]!.detail).toContain("frames=4");
    expect(declared[0]!.detail).toContain("pulled=true");
    expect(declared[0]!.detail).toContain("d=");
  });

  // THE ENUM-READER PIN'S OWN COMPILE-TIME HALF (task 5 step 1, requirement
  // 4 — the source-sweep pin lives in `connectedPhaseReaders.test.ts`; this
  // is the type-level guarantee a grep cannot give). Same idiom
  // `connectedAxes.test.ts`'s own `@ts-expect-error` pin uses for "an
  // eleventh phase" (now "a tenth"): if `"paused"` were ever re-added to
  // `ConnectedPhase`, this line would stop erroring, `@ts-expect-error`
  // would become an UNUSED directive, and `pnpm typecheck` would fail on
  // that alone — a regression this test catches without ever running.
  it('ConnectedPhase no longer admits "paused" (compile-time pin)', () => {
    // @ts-expect-error — "paused" was removed from `ConnectedPhase`
    // (connected-axes 2a, task 5): the freeze predicate now publishes
    // through `frozen` (Task 1's fact) with `phase` staying `"live"`, never
    // through a ninth phase value.
    const phase: ConnectedPhase = "paused";
    expect(phase).toBe("paused");
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

// ---------------------------------------------------------------------------
// Phase LT spec 2, Task 2. `docs/superpowers/specs/
// 2026-08-19-series-capture-design.md` §2 (the flush policy), §3 (the
// localStorage sacrifice — this file's own share of it lives in
// `monitorRun.test.ts`, inside `saveMonitorRun`'s own catch), §4 (S1/S6).
// ---------------------------------------------------------------------------

/** A hand-driven stand-in for `setInterval`, matching `manualSchedule()`'s
 *  own shape one describe block up (that helper is function-scoped to its
 *  own `describe`, so this is a deliberate, small duplication rather than a
 *  shared export — nothing here needs the handoff hold's own timer). The
 *  ONE difference that matters: `fire()` can be called MORE THAN ONCE per
 *  registration, the same way a real `setInterval`'s callback re-fires on
 *  every tick from the SAME `setInterval()` call — this hook only ever
 *  calls `seriesFlushSchedule()` once per run (`startSeriesFlush`'s own
 *  doc comment), so `calls` should stay at length 1 for the life of a
 *  session regardless of how many times a test fires it. */
function manualInterval() {
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
  };
}

describe("useMonitorSession: series capture — recorder wiring and the three flush points (Phase LT spec 2, Task 2)", () => {
  const ONE_INTERVAL: WorkoutProgram = {
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
  const TWO_LOCAL: WorkoutProgram = {
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
  const IDENTITY: RunIdentity = {
    workoutId: "series-wiring",
    title: "Series wiring",
    ...TEST_SEED,
  };

  it("the boundary flush merges the trace into the SAME write that lands the accepted actual — nothing is written before the first flush point", async () => {
    const { result, fake } = harness({
      program: TWO_LOCAL,
      events: [
        status(100, { elapsedSeconds: 10, distanceMeters: 40 }),
        status(200, { elapsedSeconds: 22, distanceMeters: 90 }),
        {
          atMs: 200,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: 22,
            distanceMeters: 90,
            avgSpm: 24,
            avgHeartRateBpm: 140,
            restDistanceMeters: 0,
          },
          cumulativeElapsedSeconds: 22,
          cumulativeDistanceMeters: 90,
        },
      ],
    });
    await connect(result);
    await programAndArm(result, fake, TWO_LOCAL, IDENTITY);

    tick(fake, 100);
    // The run just opened (the create write), and the recorder already has
    // one sample — but nothing has flushed it yet: no boundary, no timer
    // tick, no close.
    expect(loadMonitorRun()?.series).toBeUndefined();

    tick(fake, 100);
    // The second frame lands, then the boundary — still open (interval 1 of
    // 2 has not started reporting yet), so the ONLY thing that could have
    // written a series this far is the boundary flush.
    const midSession = loadMonitorRun();
    expect(midSession?.completedAt).toBeNull();
    expect(midSession?.actuals).toHaveLength(1);
    expect(midSession?.series?.samples.map((s) => s.t)).toStrictEqual([
      100, 220,
    ]);
  });

  it("the 30-second timer flush fires independent of any boundary", async () => {
    const flushTimer = manualInterval();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 10, distanceMeters: 40 }),
          status(200, { elapsedSeconds: 22, distanceMeters: 90 }),
        ],
      },
      { seriesFlushSchedule: flushTimer.schedule },
    );
    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, IDENTITY);
    // No run yet — the timer has not started.
    expect(flushTimer.calls).toHaveLength(0);

    tick(fake, 100);
    // The run opened: the flush timer registers exactly once, at 30s.
    expect(flushTimer.calls).toHaveLength(1);
    expect(flushTimer.calls[0]!.ms).toBe(30_000);
    expect(loadMonitorRun()?.series).toBeUndefined();

    act(() => flushTimer.calls[0]!.fire());
    expect(loadMonitorRun()?.series?.samples.map((s) => s.t)).toStrictEqual([
      100,
    ]);

    tick(fake, 100);
    // A second frame is fed, but nothing flushes it — no boundary, no
    // second timer registration (still the same one, re-fired).
    expect(flushTimer.calls).toHaveLength(1);
    expect(loadMonitorRun()?.series?.samples.map((s) => s.t)).toStrictEqual([
      100,
    ]);

    act(() => flushTimer.calls[0]!.fire());
    expect(loadMonitorRun()?.series?.samples.map((s) => s.t)).toStrictEqual([
      100, 220,
    ]);
  });

  it("stop-at-close cancels the flush timer, and a post-close finish-grace actual does not grow the series", async () => {
    // The WALK 5 shape, extended: two live frames before the finish (both
    // feed the recorder), then the general-status frame that ends the
    // workout (a THIRD live frame — still `phase === "live"` at the instant
    // it arrives, so it feeds the recorder too), then the finish-grace
    // actual, one notification later.
    const flushTimer = manualInterval();
    const { result, fake } = harness(
      {
        program: ONE_INTERVAL,
        events: [
          status(100, { elapsedSeconds: 10, distanceMeters: 40 }),
          status(200, { elapsedSeconds: 30, distanceMeters: 100 }),
          {
            atMs: 300,
            kind: "status",
            workoutState: WORKOUTSTATE_WORKOUTEND,
            elapsedSeconds: 60,
            distanceMeters: 200,
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
              distanceMeters: 200,
              avgSpm: 24,
              avgHeartRateBpm: 142,
              restDistanceMeters: 0,
            },
            cumulativeElapsedSeconds: 60,
            cumulativeDistanceMeters: 200,
          },
        ],
      },
      { seriesFlushSchedule: flushTimer.schedule },
    );
    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, IDENTITY);

    tick(fake, 100); // -> live, t=100
    tick(fake, 100); // t=300
    expect(flushTimer.calls).toHaveLength(1);
    expect(flushTimer.calls[0]!.cancelled).toBe(false);

    tick(fake, 100); // the WORKOUTEND frame (t=600), the close, and the
    // finish-grace actual, all in this one tick.

    expect(result.current.phase).toBe("ended");
    expect(result.current.actuals).toHaveLength(1);
    // THE STOP: the flush timer was cancelled the instant the record
    // closed — still registered (nothing removes the entry, the same
    // `setInterval`-style idiom the handoff hold's own backstop uses), but
    // marked cancelled.
    expect(flushTimer.calls).toHaveLength(1);
    expect(flushTimer.calls[0]!.cancelled).toBe(true);

    const closed = loadMonitorRun();
    expect(closed?.actuals).toHaveLength(1);
    // All three PRE-close frames landed (100, 300, 600) — the close flush
    // carries everything the recorder had at the instant it stopped.
    expect(closed?.series?.samples.map((s) => s.t)).toStrictEqual([
      100, 300, 600,
    ]);

    // Firing the (cancelled) timer by hand must not resurrect anything —
    // belt-and-braces against the SAME outcome the cancellation above
    // already prevents in production (a real cancelled `setInterval` never
    // fires again at all).
    act(() => flushTimer.calls[0]!.fire());
    expect(loadMonitorRun()?.series?.samples.map((s) => s.t)).toStrictEqual([
      100, 300, 600,
    ]);
  });
});

describe("useMonitorSession: series-truth Task 4 — the ring's own backward-buckets entry (spec §C′, written at closeRecord)", () => {
  const ONE_INTERVAL: WorkoutProgram = {
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
  const IDENTITY: RunIdentity = {
    workoutId: "series-backward-ring",
    title: "Series backward ring",
    ...TEST_SEED,
  };

  function ringEntries(
    result: Session,
  ): { seq: number; kind: string; detail: string }[] {
    return JSON.parse(result.current.exportLog()) as {
      seq: number;
      kind: string;
      detail: string;
    }[];
  }

  afterEach(() => {
    seriesRecorderControl.forced = null;
  });

  it("a nonzero backwardBucketCount at close writes exactly one series-backward-buckets entry, naming the count and the spec that governs it", async () => {
    seriesRecorderControl.forced = 12;
    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [
        status(100, { elapsedSeconds: 10, distanceMeters: 40 }),
        {
          atMs: 200,
          kind: "status",
          workoutState: WORKOUTSTATE_WORKOUTEND,
          elapsedSeconds: 60,
          distanceMeters: 200,
          spm: 0,
          currentSplit: 0,
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
            avgSpm: 24,
            avgHeartRateBpm: 142,
            restDistanceMeters: 0,
          },
          cumulativeElapsedSeconds: 60,
          cumulativeDistanceMeters: 200,
        },
      ],
    });
    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, IDENTITY);

    tick(fake, 100); // -> live
    tick(fake, 100); // the WORKOUTEND frame + close, in one tick

    expect(result.current.phase).toBe("ended");
    const entries = ringEntries(result).filter(
      (e) => e.kind === "series-backward-buckets",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toBe(
      "12 sample(s) refused because the work clock went backwards - attribution defect upstream, series is missing data (series-truth spec C')",
    );
  });

  it("a clean session (backwardBucketCount 0) writes no series-backward-buckets entry at all", async () => {
    // `seriesRecorderControl.forced` stays `null` here — the REAL recorder,
    // driven by real (non-poisoned) frames, reports 0 for the whole run.
    const { result, fake } = harness({
      program: ONE_INTERVAL,
      events: [
        status(100, { elapsedSeconds: 10, distanceMeters: 40 }),
        {
          atMs: 200,
          kind: "status",
          workoutState: WORKOUTSTATE_WORKOUTEND,
          elapsedSeconds: 60,
          distanceMeters: 200,
          spm: 0,
          currentSplit: 0,
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
            avgSpm: 24,
            avgHeartRateBpm: 142,
            restDistanceMeters: 0,
          },
          cumulativeElapsedSeconds: 60,
          cumulativeDistanceMeters: 200,
        },
      ],
    });
    await connect(result);
    await programAndArm(result, fake, ONE_INTERVAL, IDENTITY);

    tick(fake, 100); // -> live
    tick(fake, 100); // the WORKOUTEND frame + close, in one tick

    expect(result.current.phase).toBe("ended");
    expect(
      ringEntries(result).filter((e) => e.kind === "series-backward-buckets"),
    ).toHaveLength(0);
  });
});

describe("useMonitorSession: S1 — the write-count witness (design spec §4)", () => {
  // LOW-1 (task-2 review): the `Storage.prototype.setItem` spy below is
  // never restored, and there is no file-wide `restoreMocks` config — the
  // exact hazard the sacrifice describe block's own fix round found one
  // block over (`monitorRun.test.ts`'s `afterEach(vi.restoreAllMocks())`).
  // `afterEach` always runs, pass or fail, unlike a tail-of-test restore.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("total localStorage writes for MONITOR_RUN_KEY ≈ boundaries + timer-flushes + 2 — collapsed writes, not one per sample", async () => {
    const flushTimer = manualInterval();
    const THREE_INTERVALS: WorkoutProgram = {
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
    const { result, fake } = harness(
      {
        program: THREE_INTERVALS,
        events: [
          status(100, { elapsedSeconds: 10, distanceMeters: 40 }),
          status(200, { elapsedSeconds: 22, distanceMeters: 90 }),
          {
            atMs: 200,
            kind: "boundary",
            actual: {
              index: 0,
              elapsedSeconds: 22,
              distanceMeters: 90,
              avgSpm: 24,
              avgHeartRateBpm: 140,
              restDistanceMeters: 0,
            },
            cumulativeElapsedSeconds: 22,
            cumulativeDistanceMeters: 90,
          },
          status(300, { elapsedSeconds: 8, distanceMeters: 30 }),
          status(400, { elapsedSeconds: 19, distanceMeters: 80 }),
          {
            atMs: 400,
            kind: "boundary",
            actual: {
              index: 1,
              elapsedSeconds: 19,
              distanceMeters: 80,
              avgSpm: 24,
              avgHeartRateBpm: 145,
              restDistanceMeters: 0,
            },
            cumulativeElapsedSeconds: 41,
            cumulativeDistanceMeters: 170,
          },
          status(500, {
            workoutState: WORKOUTSTATE_WORKOUTEND,
            elapsedSeconds: 5,
            distanceMeters: 15,
            spm: 0,
            currentSplit: 0,
          }),
        ],
      },
      { seriesFlushSchedule: flushTimer.schedule },
    );

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const monitorWrites = (): number =>
      setItemSpy.mock.calls.filter(([key]) => key === MONITOR_RUN_KEY).length;

    await connect(result);
    await programAndArm(result, fake, THREE_INTERVALS, {
      workoutId: "s1",
      title: "S1",
      ...TEST_SEED,
    });
    expect(monitorWrites()).toBe(0);

    tick(fake, 100); // live: the create write (1)
    expect(monitorWrites()).toBe(1);

    act(() => flushTimer.calls[0]!.fire()); // timer flush (2)
    tick(fake, 100); // frame + boundary 0, merged write (3)
    act(() => flushTimer.calls[0]!.fire()); // timer flush (4)
    tick(fake, 100); // frame only — no boundary at this atMs, no write
    tick(fake, 100); // frame + boundary 1, merged write (5)
    tick(fake, 100); // the WORKOUTEND frame + close, merged write (6)

    expect(result.current.phase).toBe("ended");
    const boundaries = 2;
    const timerFlushes = 2;
    // §4 S1's own approximate formula, EXACT for this replayed session
    // because the boundary and close writes are MERGED with their series
    // snapshot rather than chased by a second write — a per-sample flush
    // (this test's own self-mutation target) would instead write on every
    // one of the six frames plus the boundaries and close, far past this
    // number.
    expect(monitorWrites()).toBe(boundaries + timerFlushes + 2);
    expect(monitorWrites()).toBe(6);
  });
});

describe("useMonitorSession: S6 — navigator.storage.persist() at first connect (design spec §4)", () => {
  afterEach(() => {
    // jsdom's own default (no Storage Manager API at all) is `undefined` —
    // undo whichever test below added one, so later tests in this file see
    // the same clean slate.
    Reflect.deleteProperty(navigator, "storage");
  });

  it("calls persist() exactly once per connect, and logs a GRANTED outcome to the ring", async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persist: persistMock },
    });
    const log = createEventLog();
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      deviceName: DEVICE_NAME,
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
    await act(async () => {
      await flush();
    });

    expect(persistMock).toHaveBeenCalledTimes(1);
    const persistEntries = log
      .entries()
      .filter((e) => e.kind === "storage-persist");
    expect(persistEntries).toHaveLength(1);
    expect(persistEntries[0]!.detail).toBe("granted");
  });

  it("a denial — or a browser with no Storage Manager API at all, jsdom's own default — is tolerated: no behavior change, logged as denied", async () => {
    // No `navigator.storage` at all here: exactly the "probably DENIED...
    // on iOS" case §4 S6 names, and the shape this repo's own test
    // environment already presents without any setup.
    const log = createEventLog();
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      deviceName: DEVICE_NAME,
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
    await act(async () => {
      await flush();
    });

    // No behavior change: the ordinary connect flow reached exactly where
    // it always does.
    expect(result.current.phase).toBe("pairing");
    const persistEntries = log
      .entries()
      .filter((e) => e.kind === "storage-persist");
    expect(persistEntries).toHaveLength(1);
    expect(persistEntries[0]!.detail).toContain("denied");
  });

  it("a persist() that resolves false is logged as denied too, not just an absent API", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persist: vi.fn().mockResolvedValue(false) },
    });
    const log = createEventLog();
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      deviceName: DEVICE_NAME,
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
    await act(async () => {
      await flush();
    });

    const persistEntries = log
      .entries()
      .filter((e) => e.kind === "storage-persist");
    expect(persistEntries).toHaveLength(1);
    expect(persistEntries[0]!.detail).toContain("denied");
  });

  it("a persist() that throws SYNCHRONOUSLY (no runtime is documented to do this, but tolerated the same as any other denial) never escapes into connect()'s own error handling", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persist: (): never => {
          throw new Error("synchronous storage failure");
        },
      },
    });
    const log = createEventLog();
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      deviceName: DEVICE_NAME,
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
    await act(async () => {
      await flush();
    });

    // Not mapped through `mapRadioFailure` as a radio failure — the connect
    // flow reached exactly where it always does.
    expect(result.current.phase).toBe("pairing");
    expect(result.current.error).toBeNull();
    const persistEntries = log
      .entries()
      .filter((e) => e.kind === "storage-persist");
    expect(persistEntries).toHaveLength(1);
    expect(persistEntries[0]!.detail).toContain("threw synchronously");
  });
});

// ---------------------------------------------------------------------------
// Phase LL Task 1 (link-truth design spec §1): the hook's own production
// liveness deps — `defaultLivenessSchedule`/`recordLivenessSilence`/
// `recordLivenessRecovery`. Hoisted to module scope and exported
// specifically so they are reachable WITHOUT driving the full `connect()`
// -> real `defaultTransport` -> `withLiveness` -> an actual 0x0031 chain,
// which every OTHER test in this file's own `createTransport` override
// deliberately bypasses (`MonitorSessionDeps.createTransport`'s own doc
// comment) — that bypass is exactly why these three needed their own
// direct tests rather than relying on coverage from the rest of the file.
// ---------------------------------------------------------------------------

describe("Phase LL Task 1: the hook's own liveness deps", () => {
  it("defaultLivenessSchedule fires fn after ms and its canceller stops it", () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const cancel = defaultLivenessSchedule(fn, 2500);

      vi.advanceTimersByTime(2499);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledOnce();

      // A second, independent instance — cancelling it must never fire.
      const fn2 = vi.fn();
      const cancel2 = defaultLivenessSchedule(fn2, 1000);
      cancel2();
      vi.advanceTimersByTime(1000);
      expect(fn2).not.toHaveBeenCalled();
      cancel(); // no-op post-fire, must not throw
    } finally {
      vi.useRealTimers();
    }
  });

  it("recordLivenessSilence writes into the given log, and is a no-op against null", () => {
    // No log yet (pre-connect) — a no-op, never a throw.
    recordLivenessSilence(null, 2500);

    const log = createEventLog();
    recordLivenessSilence(log, 2500);

    const entries = log.entries().filter((e) => e.kind === "liveness-silence");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toBe("frame stream silent for 2500ms");
  });

  it("recordLivenessRecovery writes into the given log, and is a no-op against null", () => {
    recordLivenessRecovery(null); // pre-connect: no-op

    const log = createEventLog();
    recordLivenessRecovery(log);

    const entries = log.entries().filter((e) => e.kind === "liveness-recovery");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toBe("frame stream resumed");
  });
});

// ---------------------------------------------------------------------------
// Phase LL Task 2 (§2a): `handleFrameSilence`/`handleFrameRecovery`, tested
// as PURE FUNCTIONS — same reasoning `recordLivenessSilence`/
// `recordLivenessRecovery` above already established (directly reachable
// without driving `connect()` -> `defaultTransport` -> `withLiveness`).
// These wrap that pair with the hysteresis; the full-hook composition test
// further below proves the WIRING (`livenessDepsRef`'s own `onSilence`/
// `onRecovery` closures) reaches `session.frameSilence`.
// ---------------------------------------------------------------------------

describe("Phase LL Task 2: handleFrameSilence/handleFrameRecovery (the hysteresis, pure)", () => {
  it("handleFrameSilence latches frameSilence:true, cancels a pending retract timer, and records to the log", () => {
    const patches: { frameSilence: boolean }[] = [];
    const update = (p: { frameSilence: boolean }): void => {
      patches.push(p);
    };
    const cancel = vi.fn();
    const log = createEventLog();

    handleFrameSilence(update, cancel, log, 2500);

    expect(patches).toStrictEqual([{ frameSilence: true }]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(log.entries().some((e) => e.kind === "liveness-silence")).toBe(true);
  });

  it("handleFrameSilence with no pending timer (cancel: null) does not throw", () => {
    const update = vi.fn();
    expect(() => handleFrameSilence(update, null, null, 2500)).not.toThrow();
    expect(update).toHaveBeenCalledExactlyOnceWith({ frameSilence: true });
  });

  it("handleFrameRecovery does NOT clear frameSilence itself — it schedules a retract timer at BANNER_RETRACT_HYSTERESIS_MS and records to the log", () => {
    const update = vi.fn();
    const cancel = vi.fn();
    const scheduled: { fn: () => void; ms: number }[] = [];
    const schedule = (fn: () => void, ms: number): (() => void) => {
      scheduled.push({ fn, ms });
      return vi.fn();
    };
    const log = createEventLog();

    handleFrameRecovery(update, cancel, schedule, log);

    // THE BANNER CANNOT BLINK (spec §2a): recovery alone never calls
    // `update` — only the timer, once it fires, does.
    expect(update).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.ms).toBe(BANNER_RETRACT_HYSTERESIS_MS);
    expect(log.entries().some((e) => e.kind === "liveness-recovery")).toBe(
      true,
    );

    // Firing the scheduled callback is what actually retracts the banner.
    scheduled[0]!.fn();
    expect(update).toHaveBeenCalledExactlyOnceWith({ frameSilence: false });
  });

  it("handleFrameRecovery cancels a PRIOR pending retract timer before scheduling a new one — a second recovery restarts the clock rather than stacking two", () => {
    const update = vi.fn();
    const priorCancel = vi.fn();
    const schedule = vi.fn(() => vi.fn());

    handleFrameRecovery(update, priorCancel, schedule, null);

    expect(priorCancel).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Phase LM PR 1 fix round 2 (design spec `2026-08-26-lost-monitor-trigger-
// design.md`, Task 1): `decideResumeLatch` — the predicate that replaced an
// unconditional latch on a lifecycle edge. The 2026-08-26 walk raised the
// banner nine times over a link that never dropped, while the snapshot that
// refutes every one of them was already in hand three lines further down.
// EVALUATE, never assert.
// ---------------------------------------------------------------------------

describe("Phase LM: decideResumeLatch (pure) — the resume alarm keys on a measurement", () => {
  /** A snapshot shaped exactly as `withLiveness` builds one, with the
   *  0x0031 arrival `gapMs` before the snapshot's own clock reading (or
   *  no arrival at all when `gapMs` is `null`). */
  function snapshotWith(
    gapMs: number | null,
    silent = false,
  ): LivenessSnapshot {
    const atMs = 1_000_000;
    return {
      atMs,
      armed: gapMs !== null,
      silent,
      characteristics:
        gapMs === null
          ? {}
          : {
              [GENERAL_STATUS_UUID]: {
                lastArrivalMs: atMs - gapMs,
                count: 42,
              },
            },
      recentEvents: [],
    };
  }

  it("a stream that never stopped does NOT latch — the nine-false-alarm case, with the walk's own shortest observed gap", () => {
    // `docs/monitor/sessions/walk-2026-08-26/README.md`: 233 frames arrived
    // across the nine supposed gaps, and `liveness-recovery` followed every
    // latch within 3-72 ms. A frame 500 ms ago is a healthy stream.
    expect(
      decideResumeLatch(snapshotWith(500), SILENCE_THRESHOLD_MS),
    ).toStrictEqual({
      latch: false,
      gapMs: 500,
    });
  });

  it("the worst in-stream gap the whole committed corpus contains (810 ms) still does NOT latch — the threshold's own 3.09x margin, not a number picked here", () => {
    expect(
      decideResumeLatch(snapshotWith(810), SILENCE_THRESHOLD_MS),
    ).toStrictEqual({
      latch: false,
      gapMs: 810,
    });
  });

  it("one millisecond under the threshold does NOT latch, and the threshold exactly DOES — the boundary, both sides", () => {
    expect(
      decideResumeLatch(snapshotWith(2499), SILENCE_THRESHOLD_MS),
    ).toStrictEqual({
      latch: false,
      gapMs: 2499,
    });
    expect(
      decideResumeLatch(snapshotWith(2500), SILENCE_THRESHOLD_MS),
    ).toStrictEqual({
      latch: true,
      gapMs: 2500,
    });
  });

  it("a genuine multi-second gap latches — a real suspension is exactly what this alarm is for", () => {
    expect(
      decideResumeLatch(snapshotWith(9000), SILENCE_THRESHOLD_MS),
    ).toStrictEqual({
      latch: true,
      gapMs: 9000,
    });
  });

  it("a snapshot already reporting `silent` latches whatever the gap says — the watchdog got there first and its verdict stands", () => {
    // The `silent` arm cannot be inferred from the gap: `markSuspect()` and
    // a matured watchdog timer both set it, and a drained backlog can
    // rearm the timer (spec: "stale arrivals can silence the very watchdog
    // we would be handing the whole job to"). Gap of 10 ms, latches anyway.
    expect(
      decideResumeLatch(snapshotWith(10, true), SILENCE_THRESHOLD_MS),
    ).toStrictEqual({ latch: true, gapMs: 10 });
  });

  it("a NEGATIVE gap is no evidence and does NOT latch — a wall clock stepped backwards (NTP) says nothing about the stream; the watchdog owns that case", () => {
    expect(
      decideResumeLatch(snapshotWith(-4000), SILENCE_THRESHOLD_MS),
    ).toStrictEqual({ latch: false, gapMs: -4000 });
  });

  it("no snapshot at all reports an UNMEASURED gap and does not latch — an alarm needs evidence, and a transport with no liveness decorator supplies none", () => {
    expect(decideResumeLatch(null, SILENCE_THRESHOLD_MS)).toStrictEqual({
      latch: false,
      gapMs: null,
    });
  });

  it("a snapshot with no 0x0031 arrival yet reports an UNMEASURED gap and does not latch — the pre-stream window belongs to the connect/program timeouts, not this alarm", () => {
    expect(
      decideResumeLatch(snapshotWith(null), SILENCE_THRESHOLD_MS),
    ).toStrictEqual({
      latch: false,
      gapMs: null,
    });
  });

  it("reads the 0x0031 arrival specifically — an arrival on some OTHER characteristic is not evidence the status stream is alive", () => {
    const stale: LivenessSnapshot = {
      atMs: 1_000_000,
      armed: true,
      silent: false,
      characteristics: {
        [ADDITIONAL_STATUS_1_UUID]: {
          lastArrivalMs: 999_990,
          count: 7,
        },
      },
      recentEvents: [],
    };
    expect(decideResumeLatch(stale, SILENCE_THRESHOLD_MS)).toStrictEqual({
      latch: false,
      gapMs: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Phase LL Task 1: THE HOOK'S OWN WIRING — proving `livenessDepsRef`'s
// `onSilence`/`onRecovery` closures (built inside the hook, never passed
// `logRef` itself — `react-hooks/refs` forbids that) really do write into
// THIS session's log once one exists. Every other test in this file
// overrides `MonitorSessionDeps.createTransport`, which bypasses
// `defaultTransport` (and therefore `livenessDepsRef`) entirely — this is
// the one test that does NOT, via the same `vi.doMock` + fresh-import
// idiom `adapters/monitorTransport.test.ts` already established, so the
// hook reaches its own real default and this test can capture exactly the
// `LivenessDeps` object it built.
// ---------------------------------------------------------------------------

describe("Phase LL Task 1: the hook's own composition with defaultTransport", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("passes real onSilence/onRecovery to defaultTransport, and they write into THIS session's own log", async () => {
    const stubTransport: Transport = {
      scan: vi.fn(async () => [{ id: "dev-1", name: DEVICE_NAME }]),
      connect: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
      disconnect: vi.fn(async () => undefined),
      onDisconnect: vi.fn(() => () => undefined),
    };
    const mockDefaultTransport = vi.fn((_deps: LivenessDeps) => stubTransport);
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    // The file's own STATIC `import { useMonitorSession } from
    // "./useMonitorSession"` (top of file, used by every other test) has
    // already loaded that module — and everything it statically imports,
    // `defaultTransport` included — into Vitest's module cache before this
    // test ever runs. `vi.doMock` only changes what a FUTURE resolution
    // returns; without clearing the cache first, the dynamic `import()`
    // below would just hand back the ALREADY-CACHED module, still bound to
    // the real `defaultTransport`. `resetModules()` here (not just in
    // `afterEach`) is what makes the re-import genuinely fresh — the same
    // reason `adapters/monitorTransport.test.ts` resets before, not only
    // after, though that file never had a competing static import to race.
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    // The hook really did reach `defaultTransport` — never `createTransport`
    // (undefined here, the zero-argument production call every real screen
    // makes) — and passed it a REAL `LivenessDeps`, not a stub.
    expect(mockDefaultTransport).toHaveBeenCalledOnce();
    const deps = mockDefaultTransport.mock.calls[0]![0];
    expect(typeof deps.now).toBe("function");
    expect(typeof deps.schedule).toBe("function");
    expect(typeof deps.onSilence).toBe("function");
    expect(typeof deps.onRecovery).toBe("function");

    // `connect()` has resolved past `transport.connect()`, so this
    // session's own log exists (`useMonitorSession.ts`'s own ordering:
    // `createLog` runs right after `transport.connect()`). Invoking the
    // EXACT closures the hook built (not a reimplementation) is what
    // covers `livenessDepsRef`'s own `onSilence`/`onRecovery` lines.
    deps.onSilence(2500);
    deps.onRecovery();

    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      exported.some(
        (e) =>
          e.kind === "liveness-silence" &&
          e.detail === "frame stream silent for 2500ms",
      ),
    ).toBe(true);
    expect(
      exported.some(
        (e) =>
          e.kind === "liveness-recovery" && e.detail === "frame stream resumed",
      ),
    ).toBe(true);
  });

  it("exit criterion 7: fail() appends the transport's own liveness snapshot to the ring — proven with a REAL snapshot-carrying transport, not a stub without one", async () => {
    const snapshotValue = {
      atMs: 4200,
      armed: true,
      silent: true,
      characteristics: {},
      recentEvents: [],
    };
    // A stub that DOES carry `snapshot()` — every real production
    // transport does (`withLiveness`'s own return type), which is exactly
    // what `hasLivenessSnapshot`'s structural check exists to detect.
    //
    // `subscribe` THROWS: `createPm5Driver`'s own constructor calls
    // `t.subscribe(...)` synchronously, many times, right at construction
    // (`driver.ts`'s `mergeStatus`/raw subscriptions) — so this throw
    // propagates out of `connect()`'s own `try` block and lands in its
    // `catch (err) { fail(mapRadioFailure(err)); ... }`, the SAME catch a
    // real driver-construction failure would hit. Picked deliberately over
    // `scan-dismissed`/a `connect()` throw: BOTH of those fail before
    // `logRef.current` is ever assigned (device not yet picked, or
    // `transport.connect()` not yet resolved) — the ring literally has
    // nothing to append into yet, which would make this test pass whether
    // or not the append logic is correct. Failing here, AFTER `logRef
    // .current = log` (the line right before `createPm5Driver` runs), is
    // what actually exercises the append.
    const stubTransport: Transport & { snapshot(): unknown } = {
      scan: vi.fn(async () => [{ id: "dev-1", name: DEVICE_NAME }]),
      connect: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      subscribe: vi.fn(() => {
        throw new Error("driver construction boom");
      }),
      disconnect: vi.fn(async () => undefined),
      onDisconnect: vi.fn(() => () => undefined),
      snapshot: vi.fn(() => snapshotValue),
    };
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: vi.fn(() => stubTransport),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.phase).toBe("failed");
    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const snapshotEntry = exported.find((e) => e.kind === "liveness-snapshot");
    expect(snapshotEntry).toBeDefined();
    expect(JSON.parse(snapshotEntry!.detail)).toStrictEqual(snapshotValue);
  });

  it("Phase LL Task 2 review fix (task-1-report Minor): a SECOND connect() that fails transport-missing does not carry the FIRST connection's liveness snapshot", async () => {
    const snapshotValue = {
      atMs: 4200,
      armed: true,
      silent: true,
      characteristics: {},
      recentEvents: [],
    };
    // Same construction-throw shape as the criterion-7 test above — fails
    // AFTER `logRef.current = log` so the ring genuinely has something to
    // append into.
    const firstTransport: Transport & { snapshot(): unknown } = {
      scan: vi.fn(async () => [{ id: "dev-1", name: DEVICE_NAME }]),
      connect: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      subscribe: vi.fn(() => {
        throw new Error("driver construction boom");
      }),
      disconnect: vi.fn(async () => undefined),
      onDisconnect: vi.fn(() => () => undefined),
      snapshot: vi.fn(() => snapshotValue),
    };
    const mockDefaultTransport = vi
      .fn()
      .mockReturnValueOnce(firstTransport)
      // Second attempt: no transport resolves at all — `transport-missing`,
      // exactly the path `fail()` reaches BEFORE `livenessRef.current` is
      // ever reassigned this attempt.
      .mockReturnValueOnce(null);
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.phase).toBe("failed");
    const afterFirst = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const countAfterFirst = afterFirst.filter(
      (e) => e.kind === "liveness-snapshot",
    ).length;
    expect(countAfterFirst).toBe(1);

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.phase).toBe("failed");
    expect(result.current.error?.reason).toBe("transport-missing");
    const afterSecond = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const countAfterSecond = afterSecond.filter(
      (e) => e.kind === "liveness-snapshot",
    ).length;
    // THE BUG: before the fix, `livenessRef.current` still held the FIRST
    // transport's `snapshot()` (never cleared) — this second failure,
    // which never resolved a transport at all, would ALSO append a
    // `liveness-snapshot` entry describing the PREVIOUS connection's own
    // diagnostics as if they belonged to this one.
    expect(countAfterSecond).toBe(countAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// Phase LL Task 2: THE BANNER CANNOT BLINK (§2a), proven through the FULL
// hook composition — `livenessDepsRef`'s real `onSilence`/`onRecovery`
// closures reaching `session.frameSilence`, not just the pure functions
// above. Same `vi.doMock` + fresh-import idiom the Task 1 composition
// describe block already established.
// ---------------------------------------------------------------------------

describe("Phase LL Task 2: the banner's hysteresis, through the real hook composition", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("silence latches frameSilence immediately; one healthy frame does NOT clear it; a second silence inside the window restarts the clock; only a full, uninterrupted 10s window retracts it", async () => {
    vi.useFakeTimers();
    const stubTransport: Transport = {
      scan: vi.fn(async () => [{ id: "dev-1", name: DEVICE_NAME }]),
      connect: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
      disconnect: vi.fn(async () => undefined),
      onDisconnect: vi.fn(() => () => undefined),
    };
    const mockDefaultTransport = vi.fn((_deps: LivenessDeps) => stubTransport);
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });
    const deps = mockDefaultTransport.mock.calls[0]![0];
    expect(result.current.frameSilence).toBe(false);

    act(() => {
      deps.onSilence(2500);
    });
    expect(result.current.frameSilence).toBe(true);

    // One healthy frame — the banner must NOT retract on this alone.
    act(() => {
      deps.onRecovery();
    });
    expect(result.current.frameSilence).toBe(true);

    // Just under the hysteresis window: still latched.
    act(() => {
      vi.advanceTimersByTime(BANNER_RETRACT_HYSTERESIS_MS - 1);
    });
    expect(result.current.frameSilence).toBe(true);

    // A SECOND silence inside the window restarts the clock — the whole
    // window must run again, uninterrupted, from here.
    act(() => {
      deps.onSilence(2500);
    });
    act(() => {
      deps.onRecovery();
    });
    act(() => {
      vi.advanceTimersByTime(BANNER_RETRACT_HYSTERESIS_MS - 1);
    });
    expect(result.current.frameSilence).toBe(true);

    // The full window, uninterrupted this time, finally retracts it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.frameSilence).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase LL Task 2 mechanism 3 (§2): the degraded-characteristic wiring,
// through the fake — proving `useMonitorSession.ts`'s own
// `hasCharacteristicDegraded`/`onCharacteristicDegraded` registration, not
// just `capacitorBle.ts`'s routing (already pinned in
// `capacitorBle.test.ts`). `harness()`'s fake carries the SAME structural
// extension (`fake.ts`'s own `onCharacteristicDegraded`), reached through
// `spyTransport`'s `...inner` spread exactly the way `liveness.ts`'s own
// spread reaches it in production.
// ---------------------------------------------------------------------------

describe("Phase LL Task 2 mechanism 3: the degraded-characteristic wiring (useMonitorSession.ts's own half)", () => {
  it("a non-critical characteristic's failSubscribe records a characteristic-degraded ring entry and leaves the session untouched", async () => {
    const { result, fake } = harness({ program: TWO_INTERVALS });
    await connect(result);
    expect(result.current.phase).toBe("pairing");

    act(() => {
      fake.failSubscribe(ADDITIONAL_STATUS_1_UUID);
    });

    // The session continues — no phase change, no error.
    expect(result.current.phase).toBe("pairing");
    expect(result.current.error).toBeNull();
    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const entry = exported.find((e) => e.kind === "characteristic-degraded");
    expect(entry).toBeDefined();
    expect(entry!.detail).toContain(ADDITIONAL_STATUS_1_UUID);
  });

  it("the CSAFE control characteristic's failSubscribe stays FATAL end to end, through the hook — the hang guard survives mechanism 3's split", async () => {
    const { result, fake } = harness({ program: TWO_INTERVALS });
    await connect(result);
    expect(result.current.phase).toBe("pairing");

    act(() => {
      fake.failSubscribe(TRANSMIT_CHARACTERISTIC_UUID);
    });

    expect(result.current.phase).toBe("disconnected");
  });
});

// ---------------------------------------------------------------------------
// Phase LL Task 2 mechanism 2 (§2, "iOS backgrounding"): the app-lifecycle
// listener's wiring — `harness()`'s own `createTransport` override still
// reaches the REAL `registerAppLifecycleListener` (it is not part of
// `MonitorSessionDeps`, by design — the same choice `requestStoragePersistence`
// already made), so every test using `harness()` exercises the WEB arm
// (jsdom's `isNative()` is always false); the native arm gets its own
// `vi.doMock` composition test, same idiom as Task 1's own.
// ---------------------------------------------------------------------------

describe("Phase LL Task 2 mechanism 2: the app-lifecycle listener (background/resume)", () => {
  function setVisibility(state: "visible" | "hidden"): void {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    // `vi.doMock`'s module-factory override is NOT cleared by
    // `resetModules()`/`restoreAllMocks()` (those affect the module
    // REGISTRY and spy IMPLEMENTATIONS respectively, never a `doMock`
    // factory) — without this, the NATIVE-arm test's own mock of
    // `../adapters/appLifecycle` silently governs every OTHER test in
    // this block that runs after it, since they all dynamically
    // re-import `useMonitorSession.ts`. Caught by the REVIEWER'S PROBE
    // test below failing only in file-order, never in isolation.
    vi.doUnmock("../adapters/appLifecycle");
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("backgrounding alone does nothing — the risk is on RESUME, not on suspend", async () => {
    const { result } = harness({ program: TWO_INTERVALS });
    await connect(result);
    expect(result.current.frameSilence).toBe(false);

    act(() => {
      setVisibility("hidden");
    });

    expect(result.current.frameSilence).toBe(false);
  });

  it("Phase LL minor 9 (RULED, spec amendment 2026-08-22): a WEB foreground resume does NOT treat the stream as suspect any more — lifecycle-suspect marking is native-only now, and harness() exercises the web arm (jsdom's isNative() is always false)", async () => {
    const { result } = harness({ program: TWO_INTERVALS });
    await connect(result);

    act(() => {
      setVisibility("hidden");
      setVisibility("visible");
    });

    // THE BUG this ruling closes: before minor 9, this same web
    // visibilitychange sequence latched `frameSilence:true` — a routine
    // browser tab switch showed LOST THE MONITOR for 10s. The mutation
    // this test guards against is `appLifecycle.ts`'s web branch falling
    // back to `registerWebAppLifecycleListener`, which would flip this
    // back to `true` and log an `app-lifecycle` ring entry again.
    expect(result.current.frameSilence).toBe(false);
    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(exported.some((e) => e.kind === "app-lifecycle")).toBe(false);
  });

  it("teardown does not throw on a post-unmount visibilitychange — the web arm's no-op unsubscribe (minor 9) is still a well-behaved callable, same contract shape a real listener's own teardown would need", async () => {
    const { result, unmount } = harness({ program: TWO_INTERVALS });
    await connect(result);
    unmount();

    expect(() => {
      setVisibility("hidden");
      setVisibility("visible");
    }).not.toThrow();
  });

  it("Task 1 (lost-monitor design spec): resume records frames seen while hidden and what the ready gate saw — driven through the NATIVE dispatch, same reason the reviewer's probe below needs it (minor 9: the web arm never calls back at all)", async () => {
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    // One status frame, never satisfying the ready gate (no rowingActive,
    // no banked distance) — the exact shape the flagship defect leaves
    // behind: a frame arrived, but nothing about it looked like a pull.
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events: [status(100, { rowingState: 0 })],
    });
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        createTransport: () => fake,
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    expect(result.current.phase).toBe("ready");

    act(() => {
      lifecycleCb!("background");
    });
    tick(fake, 100); // the one frame arrives while "hidden"
    expect(result.current.phase).toBe("ready"); // the gate never opened
    act(() => {
      lifecycleCb!("foreground");
    });

    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const resumeEntry = exported.find((e) => e.kind === "resume-frames");
    expect(resumeEntry).toBeDefined();
    // Observed values only: what arrived and what the gate saw — never a
    // claim about why the gate stayed shut.
    expect(resumeEntry!.detail).toBe(
      "phase=ready framesWhileHidden=1 rowingActive=false distanceIncreased=false",
    );
  });

  it("NATIVE arm: registerAppLifecycleListener resolves via the async native path, and its unsubscribe reaches lifecycleUnsubRef (the Promise branch)", async () => {
    const nativeUnsub = vi.fn();
    let nativeCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          nativeCb = cb;
          return Promise.resolve(nativeUnsub);
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
    });
    const { result, unmount } = renderHook(() =>
      freshUseMonitorSession({ createTransport: () => fake }),
    );

    await act(async () => {
      await result.current.connect();
    });
    // The Promise resolved and its unsubscribe was stored — proven by
    // teardown actually calling it.
    await act(async () => {
      unmount();
      await Promise.resolve();
    });
    expect(nativeUnsub).toHaveBeenCalledOnce();
    expect(nativeCb).toBeDefined();

    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("PHASE LM, THE FIX AT THE HOOK LEVEL: a resume over a stream that never stopped raises NOTHING — no banner, no markSuspect, and a ring entry that reports the measured gap instead of asserting a cause", async () => {
    vi.useFakeTimers();
    const events: FakeTimelineEvent[] = [];
    for (let i = 1; i <= 10; i += 1) {
      events.push(
        status(i * 500, { elapsedSeconds: i * 0.5, distanceMeters: i * 2 }),
      );
    }
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events,
    });
    // The REAL decorator, composed exactly as `defaultTransport` does — so
    // the snapshot the resume handler reads is the production one.
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(fake, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() => freshUseMonitorSession());

    await act(async () => {
      await result.current.connect();
    });

    // Two healthy frames: the first arms the watchdog, the second leaves a
    // 0x0031 arrival 500 ms in the past — well inside SILENCE_THRESHOLD_MS,
    // and comfortably inside the 810 ms worst in-stream gap the committed
    // corpus contains.
    for (let i = 0; i < 2; i += 1) {
      act(() => {
        fake.tick(500);
        vi.advanceTimersByTime(500);
      });
    }
    expect(result.current.frameSilence).toBe(false);

    expect(lifecycleCb).toBeDefined();
    act(() => {
      lifecycleCb!("background");
      lifecycleCb!("foreground");
    });

    // THE DEFECT THIS PINS: nine of these fired on 2026-08-26 while 233
    // frames were arriving (`docs/monitor/sessions/walk-2026-08-26/`). The
    // rower loses far more than a banner when this latches — `deriveLink()`
    // goes "lost", every judged value greys, pace and rate blank.
    expect(result.current.frameSilence).toBe(false);

    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    // EXIT CRITERION 4: the resume IS recorded — silence here would be its
    // own failure — with the number the decision came from, and no cause.
    const entry = exported.find((e) => e.kind === "app-lifecycle");
    expect(entry).toBeDefined();
    expect(entry!.detail).toBe(
      `resume gap=500ms threshold=${SILENCE_THRESHOLD_MS}ms silent=false latched=false`,
    );

    // `markSuspect()` was NOT called. Proven by CONSEQUENCE, not by
    // spying: `markSuspect` sets the decorator's own `silent`, and the
    // very next 0x0031 arrival would then take `noteStatusArrival`'s
    // recovery branch and write a `liveness-recovery` entry. So feed one
    // more healthy frame and check the ring stayed quiet — nothing was
    // ever declared suspect, so there is nothing to recover from.
    act(() => {
      fake.tick(500);
      vi.advanceTimersByTime(500);
    });
    const afterFrame = JSON.parse(result.current.exportLog()) as {
      kind: string;
    }[];
    expect(afterFrame.some((e) => e.kind === "liveness-recovery")).toBe(false);
    expect(afterFrame.some((e) => e.kind === "liveness-silence")).toBe(false);
    expect(result.current.frameSilence).toBe(false);
  });

  it("PHASE LM, THE FAIL-SAFE: after a resume that did NOT latch, a stream that then genuinely goes silent still raises the banner — the watchdog was left armed, because markSuspect() would have disarmed it", async () => {
    vi.useFakeTimers();
    const events: FakeTimelineEvent[] = [];
    for (let i = 1; i <= 10; i += 1) {
      events.push(
        status(i * 500, { elapsedSeconds: i * 0.5, distanceMeters: i * 2 }),
      );
    }
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events,
    });
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(fake, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() => freshUseMonitorSession());

    await act(async () => {
      await result.current.connect();
    });
    for (let i = 0; i < 2; i += 1) {
      act(() => {
        fake.tick(500);
        vi.advanceTimersByTime(500);
      });
    }

    expect(lifecycleCb).toBeDefined();
    act(() => {
      lifecycleCb!("background");
      lifecycleCb!("foreground");
    });
    expect(result.current.frameSilence).toBe(false);

    // Now the link really does die. THE MUTATION THIS PINS (the design
    // spec's own named trap): calling `markSuspect()` on a resume that did
    // not latch does `stopTimer(); silent = true` — and with no latch and
    // no further arrival to rearm, `onSilence` could NEVER fire again. A
    // rower whose monitor genuinely dropped one second after a Control
    // Centre swipe would be shown nothing at all.
    act(() => {
      vi.advanceTimersByTime(SILENCE_THRESHOLD_MS + 1);
    });
    expect(result.current.frameSilence).toBe(true);
    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
    }[];
    expect(exported.some((e) => e.kind === "liveness-silence")).toBe(true);
  });

  it("PHASE LM: a healthy resume ARRIVING MID-RETRACT does not strand the banner — the watchdog's own silence is still retracted on its own schedule, because a non-latching resume cancels nothing", async () => {
    vi.useFakeTimers();
    // 60 frames, 500ms apart: enough to arm, then recover, then carry the
    // full 10s hysteresis window.
    const events: FakeTimelineEvent[] = [];
    for (let i = 1; i <= 60; i += 1) {
      events.push(
        status(i * 500, { elapsedSeconds: i * 0.5, distanceMeters: i * 2 }),
      );
    }
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events,
    });
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(fake, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() => freshUseMonitorSession());

    await act(async () => {
      await result.current.connect();
    });

    function healthyFrame(): void {
      act(() => {
        fake.tick(500);
        vi.advanceTimersByTime(500);
      });
    }

    // Arm on the first 0x0031, then let the REAL watchdog trip on a REAL
    // silence — no lifecycle event involved at all.
    healthyFrame();
    act(() => {
      vi.advanceTimersByTime(SILENCE_THRESHOLD_MS + 1);
    });
    expect(result.current.frameSilence).toBe(true);

    // One healthy frame: the decorator's recovery branch fires and the
    // hook schedules its BANNER_RETRACT_HYSTERESIS_MS retract window.
    healthyFrame();
    expect(result.current.frameSilence).toBe(true);

    // A routine resume lands mid-window, over a stream that is now
    // healthy. THE MUTATION THIS PINS: cancelling `hysteresisCancelRef`
    // unconditionally (as this handler used to, before Phase LM moved the
    // cancel inside the latch) kills the only timer that can ever clear
    // `frameSilence` — with no latch to re-arm one, the banner would stay
    // up for the rest of the session over a stream nothing is wrong with.
    expect(lifecycleCb).toBeDefined();
    act(() => {
      lifecycleCb!("background");
      lifecycleCb!("foreground");
    });
    expect(result.current.frameSilence).toBe(true);

    // The window runs to completion on its ORIGINAL schedule and the
    // banner retracts.
    for (let i = 0; i < 25; i += 1) healthyFrame();
    expect(result.current.frameSilence).toBe(false);
  });

  it("REVIEWER'S PROBE (review fix), driven through the NATIVE dispatch (Phase LL minor 9: lifecycle-suspect marking is native-only, so a web visibilitychange can no longer drive this — this probe's own value was always about markSuspect()'s routing, not which platform triggered it, so it moves to the native arm): a resume whose MEASURED gap reached SILENCE_THRESHOLD_MS latches (Phase LM: it is the measurement that latches, never the resume) and then clears frameSilence after BANNER_RETRACT_HYSTERESIS_MS of healthy frames, because markSuspect() routes through the decorator instead of around it", async () => {
    vi.useFakeTimers();
    // 40 events, 500ms apart — the first arms the watchdog (Task 1's
    // arming rule); the rest are the post-resume "healthy frames" the
    // reviewer's own probe fed (30 over 15s).
    const events: FakeTimelineEvent[] = [];
    for (let i = 1; i <= 40; i += 1) {
      events.push(
        status(i * 500, { elapsedSeconds: i * 0.5, distanceMeters: i * 2 }),
      );
    }
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events,
    });
    // Composes the REAL decorator around the fake — the same thing
    // `defaultTransport` does in production — so this test reaches the
    // REAL `markSuspect`/`silent`/`armed` state machine, not a bypass.
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(fake, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    // NATIVE-shaped dispatch (same idiom as the "NATIVE arm" test above):
    // captures the hook's own callback so this test can fire a
    // "foreground" transition directly, without going through
    // `document.visibilityState` at all — the web arm no longer reaches
    // this code path (minor 9), so a real probe of the SHORT-resume
    // clearing bug has to look like this now.
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() => freshUseMonitorSession());

    await act(async () => {
      await result.current.connect();
    });

    // `fake.tick()` advances a VIRTUAL clock (frame delivery timing);
    // `vi.advanceTimersByTime` advances the REAL/mocked wall clock the
    // decorator's own watchdog AND the hook's hysteresis timer both run
    // on (`defaultLivenessSchedule`, real `setTimeout`). In production
    // these are the SAME clock (a real BLE notification arriving IS real
    // wall-clock time) — every advance below moves them together so a
    // "frame every 500ms" in this test means exactly that on BOTH clocks,
    // never a burst of virtual frames against a frozen real clock (which
    // would let the watchdog's own 2500ms timer mature independently and
    // produce a spurious SECOND silence — a test-harness artifact, not a
    // production one, caught while writing this test).
    function healthyFrame(): void {
      act(() => {
        fake.tick(500);
        vi.advanceTimersByTime(500);
      });
    }

    // Arms the watchdog on the first 0x0031 (event #1).
    healthyFrame();
    expect(result.current.frameSilence).toBe(false);

    // A GENUINE suspension: the wall clock advances 3000 ms across it
    // while no frame arrives, so the resume handler MEASURES a gap past
    // SILENCE_THRESHOLD_MS and latches. (Phase LM: the resume alone no
    // longer does — the test immediately above pins that half. What this
    // probe was always about is what happens AFTER a latch, and it needs a
    // latch to happen, honestly.) The decorator's own 2500 ms timer is
    // still merely pending here: fake timers are not advanced, only the
    // clock `livenessDepsRef.now` reads — which is exactly the shape of an
    // iOS suspension, where wall time passes and nothing runs.
    expect(lifecycleCb).toBeDefined();
    const resumeAt = Date.now() + 3000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(resumeAt);
    act(() => {
      lifecycleCb!("background");
      lifecycleCb!("foreground");
    });
    nowSpy.mockRestore();
    expect(result.current.frameSilence).toBe(true);

    // The FIRST post-resume healthy frame: `noteStatusArrival` sees
    // `silent === true` (set by `markSuspect`) and fires `onRecovery`,
    // which schedules the hysteresis retract — but does not clear
    // `frameSilence` itself.
    healthyFrame();
    expect(result.current.frameSilence).toBe(true);

    // Well under the hysteresis window (5 more healthy frames = 2500ms
    // more of real time, ~3000ms since recovery, far short of 10s) —
    // still latched. Proves retraction is hysteresis-gated, not instant
    // on the first post-resume frame.
    for (let i = 0; i < 5; i += 1) healthyFrame();
    expect(result.current.frameSilence).toBe(true);

    // Enough further healthy frames to carry real elapsed time past the
    // full BANNER_RETRACT_HYSTERESIS_MS window since the recovery frame
    // above (25 more x 500ms = 12500ms, comfortably past 10s) — the
    // reviewer's own probe, reproduced and now actually retracting.
    for (let i = 0; i < 25; i += 1) healthyFrame();
    expect(result.current.frameSilence).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Whole-branch review, minor 1: the native lifecycle unsub race. The
// NATIVE arm's own `registerAppLifecycleListener` returns a `Promise`, so
// its resolution can land AFTER `fail()`/`teardown()` already nulled
// `lifecycleUnsubRef` for that attempt — a `.then()` with no cancellation
// check would then blindly overwrite the ref, and if a LATER attempt had
// already registered its own real listener by then, that write silently
// replaces the new attempt's unsub with the stale one, leaking the new
// listener forever. Driven with a CONTROLLABLE (deferred) promise per
// attempt so this test can resolve them in the exact adversarial order —
// same `vi.doMock("../adapters/appLifecycle")` idiom the "NATIVE arm" test
// above uses, but with the resolution under this test's own control
// instead of resolving eagerly.
// ---------------------------------------------------------------------------

describe("Whole-branch review minor 1: the native lifecycle unsub race, driven with a controllable promise", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
  } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  it("a STALE attempt's late-resolving promise unregisters itself instead of overwriting a LATER attempt's own real unsub", async () => {
    const attempts: {
      resolve: (unsub: () => void) => void;
    }[] = [];
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(() => {
        const d = deferred<() => void>();
        attempts.push(d);
        return d.promise;
      }),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
    });
    const { result, unmount } = renderHook(() =>
      freshUseMonitorSession({ createTransport: () => fake }),
    );

    // ATTEMPT 1: connects (registers its own pending native listener),
    // then is cancelled — `cancel()` reaches `teardown()` synchronously
    // for the pre-`programming` phase this lands in (no `driver.terminate
    // ()` await in the way), which is where the token gets marked
    // cancelled. The native promise itself is still unresolved.
    await act(async () => {
      await result.current.connect();
    });
    expect(attempts).toHaveLength(1);
    await act(async () => {
      await result.current.cancel();
    });

    // ATTEMPT 2: a fresh connect() on the SAME hook instance — legal once
    // `cancel()`'s `teardown()` has nulled `driverRef` — registers its OWN
    // pending native listener. Its promise stays unresolved too; `connect
    // ()` never awaits it (`void lifecycleResult.then(...)`).
    await act(async () => {
      await result.current.connect();
    });
    expect(attempts).toHaveLength(2);

    const unsub1 = vi.fn();
    const unsub2 = vi.fn();

    // THE ADVERSARIAL ORDER: attempt 1's stale promise resolves AFTER
    // attempt 2 has already registered — exactly the race a real native
    // `addListener` can produce (nothing orders two Promise resolutions
    // against each other).
    await act(async () => {
      attempts[0]!.resolve(unsub1);
      await Promise.resolve();
      await Promise.resolve();
    });
    // THE FIX'S OWN SIGNATURE: attempt 1's `unsub` is called IMMEDIATELY
    // on its own late resolution (the cancellation branch calling it
    // directly), never merely stored. Before the fix this assertion is
    // false — `unsub1` is silently written into `lifecycleUnsubRef`
    // instead, uncalled, and only invoked (wrongly) by a LATER teardown.
    expect(unsub1).toHaveBeenCalledOnce();

    await act(async () => {
      attempts[1]!.resolve(unsub2);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Final teardown (unmount) must reach attempt 2's REAL unsub — proof
    // the ref was never clobbered by attempt 1's stale write. Before the
    // fix, `lifecycleUnsubRef` ends up holding `unsub1` (the last write
    // wins with no cancellation check), so `unsub2` is never called at
    // all here — the leaked listener minor 1 describes.
    unmount();
    expect(unsub2).toHaveBeenCalledOnce();
    // And `unsub1` was not invoked a second time by this teardown — it
    // was already fully handled at its own resolution, above.
    expect(unsub1).toHaveBeenCalledOnce();
  });
});

describe("Phase LL Task 4: programHasDistanceGoal (pure)", () => {
  it("false for an all-time program", () => {
    expect(programHasDistanceGoal(TWO_INTERVALS)).toBe(false);
  });

  it("true whenever ANY interval is distance-kind, even in a mixed program", () => {
    const mixed: WorkoutProgram = {
      intervals: [
        TWO_INTERVALS.intervals[0]!,
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
    expect(programHasDistanceGoal(mixed)).toBe(true);
  });
});

describe("Phase LL Task 4: applyContinuityCheck (pure — the resumed-stream consumption seam), widened to three axes by F2a", () => {
  const startedAt = t0.toISOString();

  function openRun(overrides: Partial<MonitorRun> = {}): MonitorRun {
    return {
      v: 2,
      workoutId: "w1",
      title: "Continuity Fixture",
      program: TWO_INTERVALS,
      actuals: [],
      deviceName: DEVICE_NAME,
      startedAt,
      completedAt: null,
      terminated: false,
      ...overrides,
    };
  }

  /** A "prior reading" snapshot — the shape `lastContinuityRef` now
   *  carries in `useMonitorSession.ts`. */
  const LAST = {
    totalWorkDistanceMeters: 1599,
    elapsedSeconds: 120,
    distanceMeters: 400,
  };

  /** All three axes backward against `LAST` — the genuine reset
   *  signature (`continuity.ts`'s own `check`). */
  const RESET_FRAME = frame({
    totalWorkDistanceMeters: 100,
    elapsedSeconds: 10,
    distanceMeters: 40,
  });

  it("not suspect: returns run UNCHANGED (same reference), whatever the readings say", () => {
    const run = openRun();
    const result = applyContinuityCheck(
      run,
      LAST,
      RESET_FRAME,
      false,
      t0,
      null,
    );
    expect(result).toBe(run);
  });

  it("no run open: null in, null out", () => {
    expect(
      applyContinuityCheck(null, LAST, RESET_FRAME, true, t0, null),
    ).toBeNull();
  });

  it("an already-closed run is returned UNCHANGED — never re-closed or re-stamped", () => {
    const closed = openRun({
      completedAt: new Date("2026-08-07T09:30:00.000Z").toISOString(),
      endedBy: "finished",
    });
    const result = applyContinuityCheck(
      closed,
      LAST,
      RESET_FRAME,
      true,
      t0,
      null,
    );
    expect(result).toBe(closed);
  });

  it("no prior reading yet (last null): continuation, unchanged", () => {
    const run = openRun();
    expect(applyContinuityCheck(run, null, RESET_FRAME, true, t0, null)).toBe(
      run,
    );
  });

  it("this frame carries no totalWorkDistanceMeters (frame.totalWorkDistanceMeters undefined): continuation, unchanged", () => {
    const run = openRun();
    const noTwdFrame = frame({ elapsedSeconds: 10, distanceMeters: 40 });
    expect(applyContinuityCheck(run, LAST, noTwdFrame, true, t0, null)).toBe(
      run,
    );
  });

  it("a forward or equal reading on every axis: continuation, unchanged, even while suspect", () => {
    const run = openRun();
    const equalFrame = frame({ ...LAST });
    const forwardFrame = frame({
      totalWorkDistanceMeters: 5000,
      elapsedSeconds: 200,
      distanceMeters: 900,
    });
    expect(applyContinuityCheck(run, LAST, equalFrame, true, t0, null)).toBe(
      run,
    );
    expect(applyContinuityCheck(run, LAST, forwardFrame, true, t0, null)).toBe(
      run,
    );
  });

  it("F2a: TWD alone backward while elapsed AND distance both advance — continuation, unchanged (the ring-phone-2 false-kill shape, at the pure level)", () => {
    const run = openRun();
    const twdOnlyBackward = frame({
      totalWorkDistanceMeters: LAST.totalWorkDistanceMeters - 1,
      elapsedSeconds: LAST.elapsedSeconds + 5,
      distanceMeters: LAST.distanceMeters + 10,
    });
    expect(
      applyContinuityCheck(run, LAST, twdOnlyBackward, true, t0, null),
    ).toBe(run);
  });

  it("two of three axes backward, one forward: still continuation — the conjunction requires ALL three", () => {
    const run = openRun();
    const twoOfThreeBackward = frame({
      totalWorkDistanceMeters: LAST.totalWorkDistanceMeters - 1,
      elapsedSeconds: LAST.elapsedSeconds - 1,
      distanceMeters: LAST.distanceMeters + 10,
    });
    expect(
      applyContinuityCheck(run, LAST, twoOfThreeBackward, true, t0, null),
    ).toBe(run);
  });

  it("suppressed on a distance-goal program, even for a genuine three-axis backward jump", () => {
    const distanceProgram: WorkoutProgram = {
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
    const run = openRun({ program: distanceProgram });
    const result = applyContinuityCheck(run, LAST, RESET_FRAME, true, t0, null);
    expect(result).toBe(run);
    expect(result?.completedAt).toBeNull();
  });

  it("a genuine backward jump on all three axes while suspect closes the run as link-lost (RULED at Task 4's own review, F1/I1 — the STRONGEST-evidence close, never the absence-of-evidence value), and records the ring entry naming all three axes — the mutation this test guards against: dropping any one of the three `<` comparisons so a partial change closes the run", () => {
    const run = openRun();
    const log = createEventLog();
    const now = new Date("2026-08-07T09:31:00.000Z");

    const result = applyContinuityCheck(run, LAST, RESET_FRAME, true, now, log);

    expect(result).not.toBe(run);
    expect(result?.completedAt).toBe(now.toISOString());
    // §4: "preserve the interrupted record, start clean, never merge" —
    // `terminated` stays whatever it already was
    // (`completeContinuityReset`'s own contract, unchanged by this task),
    // only `completedAt`/`endedBy` move.
    expect(result?.terminated).toBe(false);
    expect(result?.endedBy).toBe("link-lost");
    expect(result?.actuals).toStrictEqual(run.actuals);

    const entries = JSON.parse(log.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const resetEntry = entries.find((e) => e.kind === "continuity-reset");
    expect(resetEntry).toBeDefined();
    expect(resetEntry!.detail).toContain("twd 1599 -> 100");
    expect(resetEntry!.detail).toContain("elapsed 120 -> 10");
    expect(resetEntry!.detail).toContain("distance 400 -> 40");
  });

  it("a null log is tolerated — no throw, the close still happens", () => {
    const run = openRun();
    const result = applyContinuityCheck(run, LAST, RESET_FRAME, true, t0, null);
    expect(result?.completedAt).not.toBeNull();
  });

  it("idempotent in practice: calling again against the NOW-CLOSED result is a no-op (the completedAt guard, not a second-check special case)", () => {
    const run = openRun();
    const once = applyContinuityCheck(run, LAST, RESET_FRAME, true, t0, null);
    const twice = applyContinuityCheck(
      once,
      { totalWorkDistanceMeters: 100, elapsedSeconds: 10, distanceMeters: 40 },
      frame({
        totalWorkDistanceMeters: 50,
        elapsedSeconds: 5,
        distanceMeters: 20,
      }),
      true,
      t0,
      null,
    );
    expect(twice).toBe(once);
  });

  it("F2b production-path pin (design spec §4, PR 3 Task 2 Step 2(e)): session-2-wu-4unequal.jsonl's own real backward count (seq 24->29, the leftover-register PRE-RUN shape `.claude/agents/antagonist-ledger.md`'s 'Phase RC delta pass' names) never reaches a conviction through `applyContinuityCheck`, because `run === null` short-circuits before `check` is ever called — the SAME pair, fed straight into `check` with no such guard, DOES convict, so 'no conviction' here is `run === null` doing the work, not an accident of the readings themselves", () => {
    const text = readFileSync(
      `${LL_SESSIONS_DIR}walk-2026-08-16/session-2-wu-4unequal.jsonl`,
      "utf8",
    );
    const { events } = parseRecording(text);
    const eventAt = (seq: number) => {
      const e = events.find((ev) => ev.seq === seq);
      if (!e || !("dir" in e) || e.dir !== "rx") {
        throw new Error(
          `seq ${seq} is not an rx event — the pin has nothing to decode`,
        );
      }
      return e;
    };
    // The merged snapshot each side of the pair represents: the count from
    // AS2 seq 24/29, carried onto the NEXT General Status tick (seq
    // 27/30) — the identical driver.ts merge order `continuity.test.ts`'s
    // own PART 5 `loadCountSamples` reproduces for the corpus sweep.
    const gsBefore = parseGeneralStatus(fromHexString(eventAt(27).hex));
    const gsAfter = parseGeneralStatus(fromHexString(eventAt(30).hex));
    const as2Before = parseAdditionalStatus2(fromHexString(eventAt(24).hex));
    const as2After = parseAdditionalStatus2(fromHexString(eventAt(29).hex));
    if (
      "error" in gsBefore ||
      "error" in gsAfter ||
      "error" in as2Before ||
      "error" in as2After
    ) {
      throw new Error(
        "session-2 fixture bytes failed to decode — the pin is broken",
      );
    }
    expect(as2Before.intervalCount).toBe(3);
    expect(as2After.intervalCount).toBe(0);
    // Both ticks are genuinely pre-run: WAITTOBEGIN, no run has opened.
    expect(toMonitorState(gsBefore.workoutState)).toBe("armed");
    expect(toMonitorState(gsAfter.workoutState)).toBe("armed");

    const last = {
      totalWorkDistanceMeters: gsBefore.totalWorkDistanceMeters,
      elapsedSeconds: gsBefore.elapsedSeconds,
      distanceMeters: gsBefore.distanceMeters,
      intervalCount: as2Before.intervalCount,
    };
    const frameAfter = frame({
      totalWorkDistanceMeters: gsAfter.totalWorkDistanceMeters,
      elapsedSeconds: gsAfter.elapsedSeconds,
      distanceMeters: gsAfter.distanceMeters,
      rawIntervalCount: as2After.intervalCount,
    });

    // The production path: run === null (no MonitorRun open yet at
    // WAITTOBEGIN) — applyContinuityCheck's own short-circuit, unchanged
    // by this task, fires before `check` is ever reached.
    expect(
      applyContinuityCheck(null, last, frameAfter, true, t0, null),
    ).toBeNull();

    // Belt and braces: prove this is NOT vacuous — the identical pair,
    // handed straight to `check` (bypassing applyContinuityCheck's guard
    // entirely), DOES convict on the count axis. `distanceGoal: false`
    // here is deliberate, not the readings' own wire truth (both are
    // actually distance-goal, session-2's own armed program contains a
    // 500m interval — PART 5's own documented citation in
    // continuity.test.ts): forcing it false isolates exactly the
    // mechanism THIS pin is about (`run === null`), not a second,
    // unrelated suppression that would convict either way.
    expect(
      checkContinuity(
        {
          totalWorkDistanceMeters: last.totalWorkDistanceMeters,
          elapsedSeconds: last.elapsedSeconds,
          distanceMeters: last.distanceMeters,
          distanceGoal: false,
          intervalCount: last.intervalCount,
        },
        {
          totalWorkDistanceMeters: gsAfter.totalWorkDistanceMeters,
          elapsedSeconds: gsAfter.elapsedSeconds,
          distanceMeters: gsAfter.distanceMeters,
          distanceGoal: false,
          intervalCount: as2After.intervalCount,
        },
      ),
    ).toBe("reset");
  });
});

describe("Phase LL Task 4: the continuity consumption seam, through the real hook composition — a healthy resume never false-positives", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/appLifecycle");
    vi.doUnmock("../adapters/monitorTransport");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("a resume after a genuine gap, followed by ordinary forward-moving live frames, never closes the record (companion to continuity.test.ts's own corpus sweep, at the hook level)", async () => {
    const events: FakeTimelineEvent[] = [];
    for (let i = 1; i <= 10; i += 1) {
      events.push(
        status(i * 500, { elapsedSeconds: i * 0.5, distanceMeters: i * 2 }),
      );
    }
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events,
    });
    // Phase LM: `applyContinuityCheck` is ARMED by `frameSilence`, and
    // `frameSilence` now needs a measured gap — so this test composes the
    // REAL liveness decorator (the same thing `defaultTransport` does) and
    // gives it a real gap below. Before Phase LM it could arm the check by
    // firing a bare resume; that path no longer exists, and reaching for a
    // shortcut here would leave this test arming nothing at all.
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(fake, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    // Phase LL minor 9: lifecycle-suspect marking is native-only now, so
    // this test's own resume trigger has to look like the native dispatch
    // (same idiom the "NATIVE arm"/REVIEWER'S PROBE tests use) rather than
    // a web `visibilitychange` — `harness()`'s own web arm can no longer
    // produce this transition at all.
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() => freshUseMonitorSession());

    await connect(result);
    await programAndArm(result, fake, TWO_INTERVALS, TWO_IDENTITY);
    tick(fake, 500);
    expect(result.current.phase).toBe("live");

    expect(lifecycleCb).toBeDefined();
    // A genuine suspension: the wall clock the decorator reads advances
    // 4000 ms while nothing arrives, so the resume MEASURES a real gap.
    const resumeAt = Date.now() + 4000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(resumeAt);
    act(() => {
      lifecycleCb!("background");
      lifecycleCb!("foreground");
    });
    nowSpy.mockRestore();
    expect(result.current.frameSilence).toBe(true);

    // Ordinary forward-moving frames post-resume — the fake's own
    // `totalWorkDistanceFor` model never reports backward on a healthy
    // time-programmed session (`continuity.test.ts`'s corpus derivation
    // proves this against real hardware captures; this proves the WIRING
    // doesn't misfire against it either).
    for (let i = 0; i < 8; i += 1) tick(fake, 500);

    expect(result.current.phase).toBe("live");
    expect(loadMonitorRun()?.completedAt).toBeNull();
    expect(loadMonitorRun()?.endedBy).toBeUndefined();
  });
});

describe("Phase LL Task 4 review fix (F3/I6): the continuity reset, end to end through the real driver + hook composition — real bytes, artificial order", () => {
  // Same walk-2026-08-16/session-2-wu-4unequal.jsonl this file's OWN
  // `continuity.ts` pure-level pin already cites (`continuity.test.ts`'s
  // "ONE true reset, built from a real capture's own frames" describe
  // block) — reused here rather than re-picked. The exact two samples
  // differ from that pin (see `REAL_TAIL_HEX`'s own comment below): the
  // pure pin only feeds `check()`, which never looks at `workoutState`;
  // this test delivers the bytes through the REAL driver, which does.
  //
  // **FINDING, reported rather than routed around silently: F3's own
  // instruction names `transports/replay.ts` against a REAL committed
  // capture's own recorded acks. That path was attempted first and hits a
  // genuine architecture conflict, not a shortcut avoided for
  // convenience: EVERY committed capture with any non-distance-goal
  // segment at all (`session-2-wu-4unequal.jsonl`,
  // `step-3-pm5-recording-second-rest...jsonl` — `continuity.ts`'s own
  // header comment and this task's corpus derivation) is itself a MIXED
  // program (both carry a distance interval), and `programHasDistanceGoal`
  // suppresses on the WHOLE program, by design (the same whole-program
  // widening `driver.ts`'s per-run TWD verdict used to apply too, before
  // RC-9c retired it — narrowing it to per-frame to dodge this would be
  // the review's own class of regression, not a fix). Driving `program()`
  // with that REAL mixed program replays cleanly but leaves the
  // continuity check permanently suppressed for the whole run — nothing
  // to observe. Driving it with an ALL-TIME substitute instead (tried,
  // reverted) reaches a REAL rejection: the recording's own armed-echo
  // bytes report the REAL 5-interval structure, `driver.ts`'s own
  // `verifyArmed` correctly calls that a `structure-mismatch` against a
  // 2-interval program that was never actually sent to this machine —
  // `program()` genuinely fails, not a test-harness artifact.
  // **Resolution:** the programming HANDSHAKE (protocol machinery, not
  // evidence) uses `transports/fake.ts` — this file's own established,
  // protocol-correct harness, used by every other test here — for an
  // honestly ALL-TIME 2-interval program; the two frames the continuity
  // RULE actually reads are real hardware bytes from the same session
  // `continuity.test.ts`'s pure pin cites, delivered through the REAL
  // driver's decode pipeline via a minimal interception seam (below)
  // rather than `replay.ts`'s barrier engine. Every byte the continuity
  // check evaluates is still 100% real and hardware-captured; only the
  // plumbing that carries them differs from the letter of the
  // instruction, for a reason grounded in the corpus, not convenience.

  // Two REAL 0x0031 samples from `session-2-wu-4unequal.jsonl`, both
  // `workoutState: 4` (rowing) — deliberately NOT the file's own literal
  // last sample (which `continuity.test.ts`'s pure pin uses, twd=1599):
  // that byte's own `workoutState` decodes to 10/WORKOUTEND, and an
  // earlier version of this test delivered it verbatim, triggering a
  // genuine, honest NATURAL FINISH the instant it arrived —
  // `driver.ts`'s own `maybeEmitFrame` reacts to `state === "finished"`
  // regardless of WHY the frame showed up, which is correct production
  // behaviour, not a test bug; the fix is choosing frames that are
  // honestly mid-session on BOTH ends, so nothing but the continuity rule
  // itself reacts to them. "before" is this file's own LAST rowing-state,
  // non-distance-goal sample (twd=1354); "after" is its own FIRST
  // rowing-state, non-distance-goal sample (twd=100) — the SAME hex the
  // pure pin uses for "after" (that one frame's own `workoutState`
  // happens to already be rowing, which is why it needed no swap).
  const REAL_TAIL_HEX =
    "52 17 00 89 09 00 08 00 04 01 04 4a 05 00 70 17 00 00 68"; // twd=1354, workoutState=4 (rowing)
  const REAL_HEAD_HEX =
    "00 00 00 00 00 00 08 00 04 00 01 64 00 00 70 17 00 00 68"; // twd=100, workoutState=4 (rowing)

  // F2a (design spec 2026-08-23-continuity-corroboration §4 tests 1-2, at
  // the hook level): three synthetic 0x0031 payloads encoding the EXACT
  // decoded readings `docs/monitor/sessions/walk-2026-08-23/ring-phone-2-
  // background-continuity-kill.json` reports at seq 30/33 (also quoted in
  // `continuity.ts`'s own F2a header comment) — that capture is a decoded
  // `MonitorEventLog` export, not a raw-byte recording like
  // `session-2-wu-4unequal.jsonl` above, so there are no captured bytes to
  // replay verbatim; these bytes are HAND-ENCODED from its own numbers
  // (elapsed*100/distance*10/twd whole-metres per `parse.ts`'s own
  // `parseGeneralStatus`, `workoutState=4`/`durationRaw=18000`/
  // `durationType=0` copied straight off the capture's own log lines),
  // not a claim that these are the machine's original bytes.
  const RING_PHONE_2_BEFORE_HEX =
    "eb 15 00 2c 03 00 08 00 04 01 04 51 00 00 50 46 00 00 68"; // twd=81, elapsed=56.11, distance=81.2 (seq 30)
  const RING_PHONE_2_AFTER_HEALTHY_HEX =
    "2d 17 00 41 03 00 08 00 04 01 04 00 00 00 50 46 00 00 68"; // twd=0, elapsed=59.33, distance=83.3 (seq 33 — TWD alone backward)
  const RING_PHONE_2_AFTER_FULL_RESET_HEX =
    "00 00 00 00 00 00 08 00 04 01 04 00 00 00 50 46 00 00 68"; // zeros on all three — the genuine-reset counterfactual

  /** Delegates every `Transport` method to `inner` unchanged EXCEPT
   *  `subscribe`, which additionally remembers each characteristic's own
   *  live callback set — `deliverRaw` below is what lets this test push
   *  the two real byte payloads above straight into the REAL driver's
   *  decode pipeline, the same call shape a genuine BLE notification
   *  arrives through (`characteristicId`, `Uint8Array`), without asking
   *  `fake.ts` to model a wire-impossible reading (its own doc comments
   *  already refuse to do that for other fields — this seam sits AT the
   *  boundary those comments describe, not inside the fake itself). */
  /** PHASE LM: `frameSilence` is the arming gate for
   *  `applyContinuityCheck` (`useMonitorSession.ts`, `if (!frameSilence)
   *  return`), and it no longer latches on a lifecycle resume by itself —
   *  only on a MEASURED gap. Every test in this block is about what the
   *  continuity check does ONCE ARMED, so each suspends for a genuine
   *  `gapMs` of wall clock (the same `Date.now` the liveness decorator
   *  reads through `livenessDepsRef.now`) with no frame arriving in it —
   *  the shape of a real iOS suspension, where wall time passes and
   *  nothing runs. Faking the latch instead would arm the gate without
   *  exercising the predicate that guards it. */
  function resumeAfterGap(
    cb: (event: "background" | "foreground") => void,
    gapMs = 4000,
  ): void {
    const resumeAt = Date.now() + gapMs;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(resumeAt);
    act(() => {
      cb("background");
      cb("foreground");
    });
    nowSpy.mockRestore();
  }

  function interceptingTransport(
    inner: Transport,
  ): Transport & { deliverRaw(char: string, bytes: Uint8Array): void } {
    const subs = new Map<string, Set<(bytes: Uint8Array) => void>>();
    return {
      ...inner,
      subscribe(char: string, cb: (bytes: Uint8Array) => void) {
        const off = inner.subscribe(char, cb);
        let set = subs.get(char);
        if (set === undefined) {
          set = new Set();
          subs.set(char, set);
        }
        set.add(cb);
        return () => {
          set!.delete(cb);
          off();
        };
      },
      deliverRaw(char: string, bytes: Uint8Array): void {
        for (const cb of subs.get(char) ?? []) cb(bytes);
      },
    };
  }

  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.doUnmock("../adapters/appLifecycle");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("closes as link-lost, tells the surface, and preserves the actuals — the F1/F2 ruling proven through the REAL driver + REAL hook composition, not just the pure function", async () => {
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      // One ordinary scripted rowing tick to open the run and reach
      // `live` honestly — the fake's own protocol-correct model, exactly
      // like every other test in this file. The REAL captured bytes
      // (below) arrive AFTER this, as ordinary subsequent frame updates
      // through the same decode pipeline, never as the frame that opens
      // the run.
      events: [status(100, { elapsedSeconds: 10, distanceMeters: 40 })],
    });
    const intercepting = interceptingTransport(fake);

    // Same COMPOSITION-proving idiom as the REVIEWER'S PROBE test above:
    // the REAL decorator, composed around this test's own transport, the
    // same thing `defaultTransport` does in production — so `frameSilence`
    // is the genuine production wiring, not a bypass.
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(intercepting, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    // Phase LL minor 9: lifecycle-suspect marking is native-only now — the
    // resume trigger below has to look like the native dispatch, same as
    // every other test in this file that used to rely on a web
    // `visibilitychange`.
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      let settled = false;
      const pending = result.current
        .program(TWO_INTERVALS, TWO_IDENTITY)
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
    act(() => {
      fake.tick(100);
    });
    expect(result.current.phase).toBe("live");

    // "before": the run's own first live frame (the fake's own scripted
    // tick) already seeded `lastContinuityRef` with an irrelevant value.
    // Overwrite it with the capture's own real, later, still-rowing
    // reading, delivered the SAME way any other frame is — through the
    // driver's decode pipeline, not by poking a ref directly.
    act(() => {
      intercepting.deliverRaw(
        GENERAL_STATUS_UUID,
        fromHexString(REAL_TAIL_HEX),
      );
    });
    expect(result.current.phase).toBe("live");

    // The resume: a measured gap marks the stream suspect (Task 2's own
    // mechanism, native-only per minor 9, keyed on a measurement per
    // Phase LM) — the identical trigger a real suspension fires.
    expect(lifecycleCb).toBeDefined();
    resumeAfterGap(lifecycleCb!);
    expect(result.current.frameSilence).toBe(true);

    // "after": the capture's own real, EARLIER reading — a genuine
    // backward jump on the SAME wire quantity, real bytes, artificial
    // (replayed-out-of-order) position.
    act(() => {
      intercepting.deliverRaw(
        GENERAL_STATUS_UUID,
        fromHexString(REAL_HEAD_HEX),
      );
    });

    expect(result.current.phase).toBe("ended");
    // F2 (RULED at Task 4's own review): paired with the SAME surface
    // update every other close uses.
    expect(result.current.runOpen).toBe(false);
    expect(result.current.endedBy).toBe("user");

    // F1 (RULED at Task 4's own review): the STRONGEST-evidence close,
    // never the absence-of-evidence value.
    const stored = loadMonitorRun();
    expect(stored?.completedAt).not.toBeNull();
    expect(stored?.endedBy).toBe("link-lost");
    // "preserve the interrupted record" — actuals banked before the
    // reset are untouched (none banked yet in this short fixture, but the
    // record itself — not a fresh one — is what's closed).
    expect(stored?.workoutId).toBe(TWO_IDENTITY.workoutId);

    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const resetEntry = exported.find((e) => e.kind === "continuity-reset");
    expect(resetEntry).toBeDefined();
    expect(resetEntry!.detail).toContain("1354");
    expect(resetEntry!.detail).toContain("100");
  }, 15000);

  // -------------------------------------------------------------------
  // F2a (design spec 2026-08-23-continuity-corroboration §2, §4 tests
  // 1-2): the ring-phone-2 false kill, replayed through the real hook
  // composition end to end. Before Task 2's wiring, `applyContinuityCheck`
  // only ever tracked ONE axis (`lastTwd`/`frameTwd`), so this exact
  // shape — TWD alone backward, elapsed and distance both genuinely
  // advancing, the stream never stopped rowing — convicted and closed a
  // healthy row. `continuity.ts`'s three-axis `check` alone can't prove
  // the WIRING passes real per-frame elapsed/distance through instead of
  // reusing the TWD scalar for all three axes (Task 1's own bridge did
  // exactly that and would still convict this shape) — only a replay at
  // this level can.
  // -------------------------------------------------------------------
  it("F2a: TWD alone going backward while elapsed and distance both advance no longer convicts — the ring-phone-2 false kill stays open", async () => {
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 10, distanceMeters: 40 })],
    });
    const intercepting = interceptingTransport(fake);
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(intercepting, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      let settled = false;
      const pending = result.current
        .program(TWO_INTERVALS, TWO_IDENTITY)
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
    act(() => {
      fake.tick(100);
    });
    expect(result.current.phase).toBe("live");

    // "before": the capture's own healthy reading (twd=81, elapsed=56.11,
    // distance=81.2, seq 30 — `RING_PHONE_2_BEFORE_HEX`'s own comment).
    act(() => {
      intercepting.deliverRaw(
        GENERAL_STATUS_UUID,
        fromHexString(RING_PHONE_2_BEFORE_HEX),
      );
    });
    expect(result.current.phase).toBe("live");

    expect(lifecycleCb).toBeDefined();
    resumeAfterGap(lifecycleCb!);
    expect(result.current.frameSilence).toBe(true);

    // "after": the capture's own seq 33 reading — TWD backward
    // (81 -> 0) alone; elapsed (56.11 -> 59.33) and distance
    // (81.2 -> 83.3) both genuinely advance. This is the exact
    // shape that closed a rowing stream mid-pull before F2a.
    act(() => {
      intercepting.deliverRaw(
        GENERAL_STATUS_UUID,
        fromHexString(RING_PHONE_2_AFTER_HEALTHY_HEX),
      );
    });

    expect(result.current.phase).toBe("live");
    expect(loadMonitorRun()?.completedAt).toBeNull();
    expect(loadMonitorRun()?.endedBy).toBeUndefined();
    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
    }[];
    expect(exported.find((e) => e.kind === "continuity-reset")).toBeUndefined();
  }, 15000);

  it("F2a: a genuine full-reset signature (zeros on all three axes) still convicts, and the ring entry now names all three axes", async () => {
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      events: [status(100, { elapsedSeconds: 10, distanceMeters: 40 })],
    });
    const intercepting = interceptingTransport(fake);
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(intercepting, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      let settled = false;
      const pending = result.current
        .program(TWO_INTERVALS, TWO_IDENTITY)
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
    act(() => {
      fake.tick(100);
    });
    expect(result.current.phase).toBe("live");

    act(() => {
      intercepting.deliverRaw(
        GENERAL_STATUS_UUID,
        fromHexString(RING_PHONE_2_BEFORE_HEX),
      );
    });
    expect(result.current.phase).toBe("live");

    expect(lifecycleCb).toBeDefined();
    resumeAfterGap(lifecycleCb!);
    expect(result.current.frameSilence).toBe(true);

    // The genuine-reset counterfactual: all three axes read lower —
    // zeros against real progress, the reset signature `continuity.ts`'s
    // own `check` still convicts.
    act(() => {
      intercepting.deliverRaw(
        GENERAL_STATUS_UUID,
        fromHexString(RING_PHONE_2_AFTER_FULL_RESET_HEX),
      );
    });

    expect(result.current.phase).toBe("ended");
    expect(result.current.runOpen).toBe(false);
    expect(result.current.endedBy).toBe("user");

    const stored = loadMonitorRun();
    expect(stored?.completedAt).not.toBeNull();
    expect(stored?.endedBy).toBe("link-lost");

    const exported = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const resetEntry = exported.find((e) => e.kind === "continuity-reset");
    expect(resetEntry).toBeDefined();
    // The ring entry now names all three axes, not TWD alone (Task 1's
    // bridge only ever logged `totalWorkDistanceMeters` — the mutation
    // this guards against is dropping the elapsed/distance clauses from
    // the log message).
    expect(resetEntry!.detail).toContain("twd 81 -> 0");
    expect(resetEntry!.detail).toContain("elapsed 56.11 -> 0");
    expect(resetEntry!.detail).toContain("distance 81.2 -> 0");
  }, 15000);

  // -------------------------------------------------------------------
  // Whole-branch review minor 2: the continuity reset was closing the
  // record through `completeContinuityReset` directly — a pure transform
  // that never touches `withSeries`/`stopSeriesFlush`/the recorder at
  // all — instead of the SAME folding path every other close in this file
  // uses (`closeRecord`'s own three steps). Up to 30s of trace could be
  // lost on the one close whose whole point is preserving the record
  // ("preserve the interrupted record" — §4's own words), and the flush
  // timer kept running into a record that could never accept another
  // write. Same fixture shape as the test above (real driver + real hook
  // composition), plus a `seriesFlushSchedule` so the timer's own
  // cancellation is directly observable too.
  // -------------------------------------------------------------------
  it("minor 2: a continuity reset folds the recorder's trace into the closed record and cancels the flush timer — the SAME three steps closeRecord already does for every other close", async () => {
    const flushTimer = manualInterval();
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
      // Two ordinary scripted frames, crossing a whole-second bucket
      // (elapsed 10 -> 30), so the recorder banks TWO samples before the
      // reset — a trivial one-sample fixture could pass even with the
      // fold silently dropped, if the recorder's own "always has at
      // least one sample" guarantee papered over it.
      events: [
        status(100, { elapsedSeconds: 10, distanceMeters: 40 }),
        status(200, { elapsedSeconds: 30, distanceMeters: 100 }),
      ],
    });
    const intercepting = interceptingTransport(fake);
    const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
      withLiveness(intercepting, deps),
    );
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: mockDefaultTransport,
    }));
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(
        (cb: (event: "background" | "foreground") => void) => {
          lifecycleCb = cb;
          return () => undefined;
        },
      ),
    }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const { result } = renderHook(() =>
      freshUseMonitorSession({
        driverOptions: {
          settleTicks: 0,
          prepareSettleTicks: 0,
          schedule: () => (): void => undefined,
        },
        seriesFlushSchedule: flushTimer.schedule,
      }),
    );

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      let settled = false;
      const pending = result.current
        .program(TWO_INTERVALS, TWO_IDENTITY)
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
    act(() => {
      fake.tick(100);
    });
    act(() => {
      fake.tick(100);
    });
    expect(result.current.phase).toBe("live");
    // Two whole-second buckets banked (10 -> 30) — the recorder has more
    // than the trivial "always at least one" sample before the reset.
    expect(flushTimer.calls).toHaveLength(1);
    expect(flushTimer.calls[0]!.cancelled).toBe(false);

    act(() => {
      intercepting.deliverRaw(
        GENERAL_STATUS_UUID,
        fromHexString(REAL_TAIL_HEX),
      );
    });
    expect(lifecycleCb).toBeDefined();
    resumeAfterGap(lifecycleCb!);
    expect(result.current.frameSilence).toBe(true);

    act(() => {
      intercepting.deliverRaw(
        GENERAL_STATUS_UUID,
        fromHexString(REAL_HEAD_HEX),
      );
    });
    expect(result.current.phase).toBe("ended");

    const stored = loadMonitorRun();
    expect(stored?.endedBy).toBe("link-lost");
    // THE FIX: the trace banked before the reset survives the close — the
    // mutation this guards against is `handleFrame`'s live branch writing
    // `closed` straight into `runRef.current` without folding
    // `withSeries` first, which leaves `series` `undefined` here.
    expect(stored?.series?.samples.length).toBeGreaterThan(1);
    // THE FLUSH TIMER: cancelled by the SAME `stopSeriesFlush()` call
    // `closeRecord` already makes for every other close — before the fix
    // this timer kept running (registered, uncancelled) into a record
    // that could never accept another write.
    expect(flushTimer.calls[0]!.cancelled).toBe(true);
  }, 15000);
});
