import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import {
  buildDraft,
  loadDraft,
  saveDraft,
  startDraft,
  type SessionDraft,
} from "./draft";
import { buildRun } from "./engine";
import { loadRun, saveRun, type SessionRun } from "./run";
import {
  loadMonitorRun,
  saveMonitorRun,
  type MonitorRun,
} from "../monitor/monitorRun";
import { compileProgram } from "../../domain/monitor/program.js";
import { useStartWorkout, type StartableWorkout } from "./useStartWorkout";

// Realistic fixture (repo convention): shaped like a real seeded library
// workout — a distance work step at a split ref — not a bare minimum.
// (It carried a lead `wu` step until 2026-08-09's warmup setting removed
// that step kind; a real seeded workout has none now, and the rower's own
// warm-up SETTING is prepended at `buildRun` instead.)
const WORKOUT: StartableWorkout = {
  id: "w1",
  title: "Ladder Sets",
  type: "AT",
  steps: [
    {
      k: "w",
      duration: { kind: "distance", meters: 2500 },
      ref: { base: "2k", off: -4 },
    },
  ],
};

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route path="/start" element={<>{children}</>} />
        <Route path="/session/confirm" element={<p>CONFIRM SCREEN</p>} />
      </Routes>
    </MemoryRouter>
  );
}

// Same fixture shape as WorkoutDetail.test.tsx's own `completedRunFor` — a
// JSON round-trip, not the raw built object, so this matches exactly what
// `loadRun()` would actually hand back through localStorage.
function completedRunFor(draft: SessionDraft): SessionRun {
  const now = new Date("2026-08-01T12:00:00.000Z");
  const built = buildRun(draft, BASELINES, now);
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt: new Date("2026-08-01T12:20:00.000Z").toISOString(),
  };
  return JSON.parse(JSON.stringify(run)) as SessionRun;
}

function monitorRunFor(completedAt: string | null): MonitorRun {
  const t0 = new Date("2026-08-05T12:00:00.000Z");
  const phases = buildRun(buildDraft(WORKOUT), BASELINES, t0).phases;
  const compiled = compileProgram(phases);
  if ("code" in compiled) {
    throw new Error(`fixture failed to compile: ${compiled.code}`);
  }
  const run: MonitorRun = {
    v: 1,
    workoutId: WORKOUT.id,
    title: WORKOUT.title,
    program: compiled,
    actuals: [],
    deviceName: "PM5 430123456",
    startedAt: t0.toISOString(),
    completedAt,
    terminated: false,
  };
  return JSON.parse(JSON.stringify(run)) as MonitorRun;
}

beforeEach(() => {
  localStorage.clear();
});

describe("useStartWorkout", () => {
  it("starts clean: handleStart builds and saves a draft, cross-clears, and navigates to /session/confirm", async () => {
    const { result } = renderHook(() => useStartWorkout(WORKOUT), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(await screen.findByText("CONFIRM SCREEN")).toBeInTheDocument();
    expect(result.current.replaceStage).toBeNull();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.workoutId).toBe("w1");
    expect(draft!.startedAt).toBeNull();
  });

  it("stages 'unlogged' for a completed-but-unlogged SessionRun and touches nothing on the first call", () => {
    const draftA = startDraft(
      buildDraft({
        id: "w-other",
        title: "Other",
        type: "AN",
        // An inert stand-in for "some OTHER draft exists" — a rest row,
        // not the `wu` row this was before 2026-08-09, which would now
        // expand to zero phases and make `completedRunFor` vacuous.
        steps: [{ k: "r", minutes: 5 }],
      }),
    );
    const runA = completedRunFor(draftA);
    saveDraft(draftA);
    saveRun(runA);
    const { result } = renderHook(() => useStartWorkout(WORKOUT), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("unlogged");
    expect(loadDraft()).toStrictEqual(draftA);
    expect(loadRun()).toStrictEqual(runA);
  });

  it("stages 'in-progress' for a started-but-not-finished draft with no run record", () => {
    const notStarted = startDraft(
      buildDraft({
        id: "w-other",
        title: "Other",
        type: "AN",
        // An inert stand-in for "some OTHER draft exists" — a rest row,
        // not the `wu` row this was before 2026-08-09, which would now
        // expand to zero phases and make `completedRunFor` vacuous.
        steps: [{ k: "r", minutes: 5 }],
      }),
    );
    saveDraft(notStarted);
    const { result } = renderHook(() => useStartWorkout(WORKOUT), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("in-progress");
  });

  it("stages 'unlogged' for a finished-but-unlogged MonitorRun, ranked above a live one", () => {
    saveMonitorRun(monitorRunFor("2026-08-05T12:41:00.000Z"));
    const { result } = renderHook(() => useStartWorkout(WORKOUT), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("unlogged");
  });

  it("stages 'in-progress' for a LIVE MonitorRun (completedAt null)", () => {
    saveMonitorRun(monitorRunFor(null));
    const { result } = renderHook(() => useStartWorkout(WORKOUT), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("in-progress");
  });

  it("cancelReplace clears the staged panel and touches no storage", () => {
    const live = monitorRunFor(null);
    saveMonitorRun(live);
    const { result } = renderHook(() => useStartWorkout(WORKOUT), {
      wrapper,
    });
    act(() => result.current.handleStart());
    expect(result.current.replaceStage).toBe("in-progress");

    act(() => result.current.cancelReplace());

    expect(result.current.replaceStage).toBeNull();
    expect(loadMonitorRun()).toStrictEqual(live);
  });

  it("confirmReplace clears both stale records, saves a fresh draft, and navigates — the reverse cross-clear", async () => {
    const draftA = startDraft(
      buildDraft({
        id: "w-other",
        title: "Other",
        type: "AN",
        // An inert stand-in for "some OTHER draft exists" — a rest row,
        // not the `wu` row this was before 2026-08-09, which would now
        // expand to zero phases and make `completedRunFor` vacuous.
        steps: [{ k: "r", minutes: 5 }],
      }),
    );
    saveDraft(draftA);
    saveRun(completedRunFor(draftA));
    saveMonitorRun(monitorRunFor("2026-08-05T12:41:00.000Z"));
    const { result } = renderHook(() => useStartWorkout(WORKOUT), {
      wrapper,
    });
    act(() => result.current.handleStart());
    expect(result.current.replaceStage).toBe("unlogged");

    act(() => result.current.confirmReplace());

    expect(await screen.findByText("CONFIRM SCREEN")).toBeInTheDocument();
    expect(loadRun()).toBeNull();
    expect(loadMonitorRun()).toBeNull();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.workoutId).toBe("w1");
    expect(draft!.startedAt).toBeNull();
  });

  it("no MonitorRun at all: the cross-clear inside confirmReplace is a no-op removeItem, not an error", async () => {
    const { result } = renderHook(() => useStartWorkout(WORKOUT), {
      wrapper,
    });

    act(() => result.current.confirmReplace());

    expect(await screen.findByText("CONFIRM SCREEN")).toBeInTheDocument();
    expect(loadMonitorRun()).toBeNull();
  });

  it("surfaces an inline error and does not navigate when saveDraft fails (quota)", async () => {
    const { vi } = await import("vitest");
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    const { result } = renderHook(() => useStartWorkout(WORKOUT), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.startError).toBe(
      "Couldn't start this session. Try again.",
    );
    expect(screen.queryByText("CONFIRM SCREEN")).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
