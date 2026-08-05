import { describe, it, expect, beforeEach, vi } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { saveRun, loadRun, RUN_KEY, type SessionRun } from "../session/run";
import {
  saveMonitorRun,
  loadMonitorRun,
  clearMonitorRun,
  createMonitorRun,
  anyLiveSession,
  MONITOR_RUN_KEY,
  type MonitorRun,
} from "./monitorRun";

// Realistic fixture, per repo convention (session/run.test.ts's own
// comment): Filling Low (AT) — wu 8' + 3x2000m @ 6k+4 with 3' rest,
// compiled through the REAL assembly a session would use
// (buildDraft -> buildRun -> compileProgram(run.phases), the same path
// program.sweep.test.ts sweeps all 300 workouts through) rather than a
// hand-built minimum WorkoutProgram.
const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const t0 = new Date("2026-08-05T12:00:00.000Z");

function fillingLowProgram(): WorkoutProgram {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: `fl-${Math.random()}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const run = buildRun(draft, baselines, t0);
  const result = compileProgram(run.phases);
  if ("code" in result) {
    throw new Error(`fixture failed to compile: ${result.code}`);
  }
  return result;
}

function freshMonitorRun(): MonitorRun {
  return {
    v: 1,
    workoutId: "fl-workout-id",
    title: "Filling Low",
    program: fillingLowProgram(),
    actuals: [],
    deviceName: "PM5 12345",
    startedAt: t0.toISOString(),
    completedAt: null,
    terminated: false,
  };
}

const actual1: IntervalActual = {
  index: 0,
  elapsedSeconds: 452,
  distanceMeters: 2000,
  avgSplit: 113,
  avgSpm: 24,
  avgHeartRateBpm: 150,
};

function viaJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// A minimal, distinctly-shaped SessionRun for the cross-clear/truth-table
// tests below — these only care about presence and `completedAt`, not the
// engine's real phase content, so a hand-built shape (matching run.test.ts's
// own field set) is legitimate here rather than a full buildRun call.
function fakeSessionRun(completedAt: string | null): SessionRun {
  return {
    v: 1,
    workoutId: "sr-workout-id",
    title: "Some Session",
    phases: [],
    index: 0,
    phaseStartedAt: t0.toISOString(),
    pausedAt: null,
    pausedTotalMs: 0,
    actuals: {},
    startedAt: t0.toISOString(),
    completedAt,
  };
}

describe("saveMonitorRun / loadMonitorRun / clearMonitorRun", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a fresh monitor run byte-identical", () => {
    const run = freshMonitorRun();
    saveMonitorRun(run);
    expect(loadMonitorRun()).toStrictEqual(viaJson(run));
  });

  it("round-trips a run with recorded interval actuals and a terminated finish", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      actuals: [actual1],
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
      terminated: true,
    };
    saveMonitorRun(run);
    const loaded = loadMonitorRun();
    expect(loaded).toStrictEqual(viaJson(run));
    expect(loaded!.terminated).toBe(true);
    expect(loaded!.actuals).toStrictEqual([actual1]);
  });

  it("returns null when nothing is stored", () => {
    expect(loadMonitorRun()).toBeNull();
  });

  it("returns null and clears the key for garbage JSON", () => {
    localStorage.setItem(MONITOR_RUN_KEY, "{not json");
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for an unknown version, leaving a SessionRun (a separate key) untouched", () => {
    const run = freshMonitorRun();
    const sessionRun = fakeSessionRun(null);
    saveRun(sessionRun);
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify({ ...run, v: 2 }));

    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
    expect(loadRun()).toStrictEqual(sessionRun);
  });

  it("returns null and clears the key for a bare {v:1} with none of the load-bearing fields", () => {
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify({ v: 1 }));
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that isn't a plain record (a bare number)", () => {
    localStorage.setItem(MONITOR_RUN_KEY, "42");
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that's null", () => {
    localStorage.setItem(MONITOR_RUN_KEY, "null");
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that's an array, not an object", () => {
    localStorage.setItem(MONITOR_RUN_KEY, "[]");
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with workoutId as the wrong shape (a number — neither null nor a string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, workoutId: 5 }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("round-trips workoutId: null (a hand-built program, not a library workout) same as a real id", () => {
    const run = { ...freshMonitorRun(), workoutId: null };
    saveMonitorRun(run);
    expect(loadMonitorRun()).toStrictEqual(viaJson(run));
  });

  it("returns null for v:1 with title as the wrong shape (missing/non-string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify({ ...run, title: 5 }));
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with program as the wrong shape (an array, not a record)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, program: [] }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with program.intervals as the wrong shape (an object, not an array)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, program: { intervals: {} } }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with actuals as the wrong shape (an object, not an array)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, actuals: {} }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with deviceName as the wrong shape (missing/non-string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, deviceName: 5 }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with startedAt as the wrong shape (missing/non-string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, startedAt: 1 }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with completedAt as the wrong shape (a number — neither null nor a string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, completedAt: 5 }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with terminated as the wrong shape (a string, not a boolean)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, terminated: "true" }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("clearMonitorRun removes the stored run", () => {
    saveMonitorRun(freshMonitorRun());
    clearMonitorRun();
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("never throws when localStorage.setItem fails (quota) — saveMonitorRun is void, best-effort", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    const run = freshMonitorRun();
    expect(() => saveMonitorRun(run)).not.toThrow();
    spy.mockRestore();
  });

  it("exposes the storage key used", () => {
    expect(MONITOR_RUN_KEY).toBe("ergomatic.monitorRun");
  });

  it("MONITOR_RUN_KEY / RUN_KEY are distinct storage keys — the two records never collide", () => {
    expect(MONITOR_RUN_KEY).not.toBe(RUN_KEY);
  });
});

describe("createMonitorRun", () => {
  beforeEach(() => localStorage.clear());

  it("builds a fresh, persisted MonitorRun stamped from its arguments and `now`", () => {
    const program = fillingLowProgram();
    const created = createMonitorRun(
      {
        workoutId: "fl-workout-id",
        title: "Filling Low",
        program,
        deviceName: "PM5 98765",
      },
      t0,
    );
    expect(created).toStrictEqual({
      v: 1,
      workoutId: "fl-workout-id",
      title: "Filling Low",
      program,
      actuals: [],
      deviceName: "PM5 98765",
      startedAt: t0.toISOString(),
      completedAt: null,
      terminated: false,
    });
    expect(loadMonitorRun()).toStrictEqual(viaJson(created));
  });

  it("cross-clear: creating a MonitorRun clears an existing SessionRun outright", () => {
    saveRun(fakeSessionRun(null));
    expect(loadRun()).not.toBeNull();

    createMonitorRun(
      {
        workoutId: null,
        title: "Filling Low",
        program: fillingLowProgram(),
        deviceName: "PM5",
      },
      t0,
    );

    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("cross-clear: also clears a completed-but-unlogged SessionRun, not just a live one", () => {
    saveRun(fakeSessionRun(new Date("2026-08-05T13:00:00.000Z").toISOString()));

    createMonitorRun(
      {
        workoutId: null,
        title: "Filling Low",
        program: fillingLowProgram(),
        deviceName: "PM5",
      },
      t0,
    );

    expect(loadRun()).toBeNull();
  });

  it("is a no-op on the SessionRun side when none exists — clearRun on an absent key never throws", () => {
    expect(loadRun()).toBeNull();
    expect(() =>
      createMonitorRun(
        {
          workoutId: null,
          title: "Filling Low",
          program: fillingLowProgram(),
          deviceName: "PM5",
        },
        t0,
      ),
    ).not.toThrow();
    expect(loadRun()).toBeNull();
  });
});

describe("anyLiveSession: the coexistence truth table", () => {
  beforeEach(() => localStorage.clear());

  function setSessionRun(state: "absent" | "live" | "unlogged"): void {
    if (state === "absent") return;
    saveRun(
      fakeSessionRun(
        state === "live"
          ? null
          : new Date("2026-08-05T13:00:00.000Z").toISOString(),
      ),
    );
  }

  function setMonitorRun(state: "absent" | "live" | "unlogged"): void {
    if (state === "absent") return;
    saveMonitorRun({
      ...freshMonitorRun(),
      completedAt:
        state === "live"
          ? null
          : new Date("2026-08-05T13:00:00.000Z").toISOString(),
    });
  }

  const cases: Array<{
    sessionRun: "absent" | "live" | "unlogged";
    monitorRun: "absent" | "live" | "unlogged";
    expected: "none" | "phone" | "monitor";
  }> = [
    { sessionRun: "absent", monitorRun: "absent", expected: "none" },
    { sessionRun: "absent", monitorRun: "live", expected: "monitor" },
    { sessionRun: "absent", monitorRun: "unlogged", expected: "none" },
    { sessionRun: "live", monitorRun: "absent", expected: "phone" },
    { sessionRun: "live", monitorRun: "live", expected: "monitor" },
    { sessionRun: "live", monitorRun: "unlogged", expected: "phone" },
    { sessionRun: "unlogged", monitorRun: "absent", expected: "none" },
    { sessionRun: "unlogged", monitorRun: "live", expected: "monitor" },
    { sessionRun: "unlogged", monitorRun: "unlogged", expected: "none" },
  ];

  it.each(cases)(
    "sessionRun=$sessionRun monitorRun=$monitorRun -> $expected",
    ({ sessionRun, monitorRun, expected }) => {
      setSessionRun(sessionRun);
      setMonitorRun(monitorRun);
      expect(anyLiveSession()).toBe(expected);
    },
  );

  it("all nine cells are covered exactly once (guards the table itself from drifting)", () => {
    expect(cases).toHaveLength(9);
    const keys = new Set(cases.map((c) => `${c.sessionRun}/${c.monitorRun}`));
    expect(keys.size).toBe(9);
  });
});
