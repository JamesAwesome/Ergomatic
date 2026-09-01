import { describe, expect, it } from "vitest";
import type {
  DiscoveredMonitor,
  IntervalActual,
  MonitorCapabilities,
  MonitorDriver,
  MonitorEvent,
  MonitorFrame,
  Transport,
} from "./types.js";

// types.ts is declarations only (no runtime code) — these tests exist as a
// regression guard: a sample value satisfying each exported shape, checked
// by TypeScript at compile time (a field renamed/dropped/retyped on either
// side fails `tsc`, not just a runtime assertion) and asserted at runtime
// so the file isn't silently dead in the test run.

describe("MonitorCapabilities", () => {
  it("has no hasHeartRate field (belt presence is per-frame, not a capability)", () => {
    const caps: MonitorCapabilities = {
      canProgram: true,
      hasStrokeRate: true,
      reportsIntervals: true,
      deviceName: "PM5 12345",
    };
    expect("hasHeartRate" in caps).toBe(false);
    expect(Object.keys(caps).sort()).toStrictEqual([
      "canProgram",
      "deviceName",
      "hasStrokeRate",
      "reportsIntervals",
    ]);
  });
});

describe("MonitorFrame", () => {
  it("has no paused state and intervalRemaining/intervalAccrued are nullable", () => {
    const frame: MonitorFrame = {
      elapsedSeconds: 12.3,
      distanceMeters: 45.6,
      sessionElapsedSeconds: 12.3,
      sessionDistanceMeters: 45.6,
      currentSplit: 105,
      spm: 24,
      heartRateBpm: null,
      rowingActive: true,
      splitAvgPace: null,
      restSeconds: 0,
      intervalIndex: 1,
      intervalRemaining: { kind: "time", value: 30 },
      intervalAccrued: { kind: "distance", value: 850 },
      state: "rowing",
    };
    expect(frame.state).not.toBe("paused");
    const finished: MonitorFrame = {
      ...frame,
      state: "finished",
      intervalRemaining: null,
      intervalAccrued: null,
    };
    expect(finished.intervalRemaining).toBeNull();
    expect(finished.intervalAccrued).toBeNull();
  });
});

describe("MonitorEvent", () => {
  it("every documented variant constructs and discriminates on kind", () => {
    const actual: IntervalActual = {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 300,
      avgSplit: 100,
      avgSpm: 24,
      avgHeartRateBpm: 150,
      restDistanceMeters: 20,
    };
    const events: MonitorEvent[] = [
      {
        kind: "frame",
        frame: {
          elapsedSeconds: 0,
          distanceMeters: 0,
          sessionElapsedSeconds: 0,
          sessionDistanceMeters: 0,
          currentSplit: null,
          spm: null,
          rowingActive: false,
          heartRateBpm: null,
          splitAvgPace: null,
          restSeconds: 0,
          intervalIndex: null,
          intervalRemaining: null,
          intervalAccrued: null,
          state: "idle",
        },
      },
      { kind: "armed" },
      { kind: "intervalComplete", actual },
      { kind: "workoutComplete" },
      { kind: "terminated" },
      { kind: "disconnected", reason: "radio out of range" },
      { kind: "reconnected" },
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 62.5, workDistanceMeters: 214 },
        detail: {
          avgStrokeRate: 24,
          endingHeartRateBpm: 168,
          avgHeartRateBpm: 152,
          minHeartRateBpm: 96,
          maxHeartRateBpm: 175,
          dragFactorAverage: 128,
          workoutType: 8,
          recoveryHeartRateBpm: 120,
          avgPaceSecondsPer500m: 125,
        },
      },
      {
        kind: "summary-observations",
        totals: { workElapsedSeconds: 62.5, workDistanceMeters: 214 },
        detail: {
          avgStrokeRate: 24,
          endingHeartRateBpm: 168,
          avgHeartRateBpm: 152,
          minHeartRateBpm: 96,
          maxHeartRateBpm: 175,
          dragFactorAverage: 128,
          workoutType: 8,
          recoveryHeartRateBpm: 120,
          avgPaceSecondsPer500m: 125,
        },
        verificationBytes: [0x27, 0xd8, 0xf3, 0x6e],
      },
    ];
    expect(events.map((e) => e.kind)).toStrictEqual([
      "frame",
      "armed",
      "intervalComplete",
      "workoutComplete",
      "terminated",
      "disconnected",
      "reconnected",
      "summary-observations",
      "summary-observations",
    ]);
  });
});

// THE COMPILER IS THE ASSERTION IN BOTH BLOCKS BELOW, not `expect`.
//
// They used to end in `expect(typeof driver.program).toBe("function")` and
// nine siblings — each one checking an object literal the test itself had
// just written with `program: async () => {}` on the line above. That passes
// whether or not the interface still declares the member, so it asserted the
// FIXTURE and never the TYPE. It is the pattern docs/TESTING.md §3 and §11
// ban by name, and it was living in the one directory pinned at 100%.
//
// `@ts-expect-error` is the version that can fail: if the surface it pins
// stops being an error, tsc reports the directive as unused and
// `pnpm typecheck` goes red. The idiom, and the reasoning for preferring it
// to a runtime check, come from `src/monitor/connectedAxes.test.ts`'s own
// tenth-phase pin.

describe("MonitorDriver", () => {
  it("requires program/beginFreeRow/terminate/events/reconcile/disconnect, and rejects start()", () => {
    const driver: MonitorDriver = {
      capabilities: {
        canProgram: true,
        hasStrokeRate: true,
        reportsIntervals: true,
        deviceName: "fake",
      },
      program: async () => {},
      // Phase JR PR 2: a free row's own way to open a run, sending the
      // machine nothing. Synchronous on purpose — there is no ack to wait
      // for — which this pin also fixes: a `Promise`-returning one would
      // not satisfy the interface.
      beginFreeRow: () => {},
      terminate: async () => {},
      events: () => () => {},
      // Task 7 (CR2 spec 2a): the reconcile step teardown calls BEFORE it
      // unsubscribes, so a still-pending summary-gate deadline reaches a
      // live listener instead of an empty one.
      reconcile: () => {},
      disconnect: async () => {},
    };

    // `reconcile` is the member that matters most here: it arrived late, and
    // making it optional would silently reinstate the teardown-ordering bug
    // the comment above records. Dropping it must not type-check.
    // @ts-expect-error — `reconcile` is missing, so this is not a MonitorDriver
    const missingReconcile: MonitorDriver = {
      capabilities: driver.capabilities,
      program: driver.program,
      terminate: driver.terminate,
      events: driver.events,
      disconnect: driver.disconnect,
    };

    // A driver is programmed and terminated, never started. Excess-property
    // checking on a fresh literal is what rejects `start`.
    // @ts-expect-error — `start` is not a member of MonitorDriver
    const withStart: MonitorDriver = { ...driver, start: async () => {} };

    // The two bindings exist only to carry their directives; referencing them
    // keeps no-unused-vars quiet without a second suppression.
    expect([missingReconcile, withStart]).toHaveLength(2);
  });
});

describe("Transport / DiscoveredMonitor", () => {
  it("requires all six transport methods, and a DiscoveredMonitor carries id and name", () => {
    const discovered: DiscoveredMonitor = { id: "device-1", name: "PM5 12345" };
    const transport: Transport = {
      scan: async () => [discovered],
      connect: async () => {},
      write: async () => {},
      subscribe: () => () => {},
      disconnect: async () => {},
      onDisconnect: () => () => {},
    };

    // `onDisconnect` is the one worth pinning: it is the seam every
    // link-loss path in the app hangs off, and an optional one would let a
    // transport ship that can never report a drop.
    // @ts-expect-error — `onDisconnect` is missing, so this is not a Transport
    const missingOnDisconnect: Transport = {
      scan: transport.scan,
      connect: transport.connect,
      write: transport.write,
      subscribe: transport.subscribe,
      disconnect: transport.disconnect,
    };

    // Both fields of a DiscoveredMonitor are required — an id with no name
    // is what the picker would render as a blank row.
    // @ts-expect-error — `name` is missing, so this is not a DiscoveredMonitor
    const nameless: DiscoveredMonitor = { id: "device-2" };

    expect([missingOnDisconnect, nameless]).toHaveLength(2);
  });
});
