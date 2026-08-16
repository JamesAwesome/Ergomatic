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
    ];
    expect(events.map((e) => e.kind)).toStrictEqual([
      "frame",
      "armed",
      "intervalComplete",
      "workoutComplete",
      "terminated",
      "disconnected",
      "reconnected",
    ]);
  });
});

describe("MonitorDriver", () => {
  it("has no start() — program()/terminate()/events/reconcile()/disconnect only", () => {
    const driver: MonitorDriver = {
      capabilities: {
        canProgram: true,
        hasStrokeRate: true,
        reportsIntervals: true,
        deviceName: "fake",
      },
      program: async () => {},
      terminate: async () => {},
      events: () => () => {},
      reconcile: () => {},
      disconnect: async () => {},
    };
    expect("start" in driver).toBe(false);
    expect(typeof driver.program).toBe("function");
    expect(typeof driver.terminate).toBe("function");
    // Task 7 (CR2 spec 2a): the reconcile step teardown calls BEFORE it
    // unsubscribes, so a still-pending summary-gate deadline reaches a
    // live listener instead of an empty one.
    expect(typeof driver.reconcile).toBe("function");
  });
});

describe("Transport / DiscoveredMonitor", () => {
  it("a minimal implementation satisfies the shape", () => {
    const discovered: DiscoveredMonitor = { id: "device-1", name: "PM5 12345" };
    const transport: Transport = {
      scan: async () => [discovered],
      connect: async () => {},
      write: async () => {},
      subscribe: () => () => {},
      disconnect: async () => {},
      onDisconnect: () => () => {},
    };
    expect(typeof transport.scan).toBe("function");
    expect(typeof transport.subscribe).toBe("function");
    expect(typeof transport.onDisconnect).toBe("function");
  });
});
