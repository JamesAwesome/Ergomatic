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
import { buildFreeRowRun, buildRun } from "./engine";
import { loadRun, saveRun, type SessionRun } from "./run";
import {
  loadMonitorRun,
  saveMonitorRun,
  type MonitorRun,
} from "../monitor/monitorRun";
import {
  commit as commitHandoff,
  resetForTests as resetHandoffStoreForTests,
} from "../monitor/handoffStore";
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
        <Route path="/session/countdown" element={<p>COUNTDOWN SCREEN</p>} />
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
  resetHandoffStoreForTests();
});

describe("useStartWorkout", () => {
  it("starts clean: handleStart builds and saves a STARTED draft, cross-clears, and navigates to /session/countdown", async () => {
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    expect(result.current.replaceStage).toBeNull();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.workoutId).toBe("w1");
    // Fast-follow spec §3 (adversarial B1): every rewired entry point stamps
    // `startedAt` at this exact moment — ConfirmTargets used to be the sole
    // stamper, and it's gone.
    expect(draft!.startedAt).not.toBeNull();
    expect(new Date(draft!.startedAt!).toISOString()).toBe(draft!.startedAt);
  });

  it("threads the live nudge map into the saved draft (fast-follow spec §3, entry 1)", async () => {
    const { result } = renderHook(() => useStartWorkout(WORKOUT, { 0: 2 }), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    const draft = loadDraft();
    expect(draft!.nudges).toStrictEqual({ 0: 2 });
  });

  it("an empty nudge map ({} — a caller with no preview surface) saves an un-nudged draft", async () => {
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    expect(loadDraft()!.nudges).toStrictEqual({});
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
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("unlogged");
    expect(loadDraft()).toStrictEqual(draftA);
    expect(loadRun()).toStrictEqual(runA);
  });

  // Just Row without the monitor (spec 2026-09-02, lifetime table ⟨F8⟩;
  // exit criterion 6, the second direction): a LIVE free-row run has NO
  // draft, so the started-draft check below never sees it, and before this
  // guard Start reached `confirmReplace()`'s `clearRun()` mid-row. The
  // stored bytes are compared verbatim — the first press and the cancel
  // must both leave the record exactly as the door wrote it.
  it("stages 'in-progress' for a LIVE mode-justrow SessionRun with no draft, and neither the press nor cancel touches the stored bytes (criterion 6)", () => {
    saveRun(buildFreeRowRun(new Date("2026-09-02T12:00:00.000Z")));
    expect(loadDraft()).toBeNull();
    const before = localStorage.getItem("ergomatic.sessionRun");
    expect(before).not.toBeNull();
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("in-progress");
    expect(localStorage.getItem("ergomatic.sessionRun")).toBe(before);
    expect(screen.queryByText("COUNTDOWN SCREEN")).not.toBeInTheDocument();

    act(() => result.current.cancelReplace());

    expect(result.current.replaceStage).toBeNull();
    expect(localStorage.getItem("ergomatic.sessionRun")).toBe(before);
  });

  it("a COMPLETED mode-justrow SessionRun (finished, not yet saved at the log door) stages 'unlogged', ranked above in-progress", () => {
    const run = buildFreeRowRun(new Date("2026-09-02T12:00:00.000Z"));
    saveRun({
      ...run,
      index: 1,
      actuals: {
        0: { actualSource: "stopwatch-elapsed", elapsedSeconds: 754 },
      },
      completedAt: "2026-09-02T12:12:34.000Z",
    });
    const before = localStorage.getItem("ergomatic.sessionRun");
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("unlogged");
    expect(localStorage.getItem("ergomatic.sessionRun")).toBe(before);
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
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("in-progress");
  });

  it("stages 'unlogged' for a finished-but-unlogged MonitorRun, ranked above a live one", () => {
    saveMonitorRun(monitorRunFor("2026-08-05T12:41:00.000Z"));
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("unlogged");
  });

  it("stages 'unlogged' for a LIVE-looking MonitorRun (completedAt null): any MonitorRun at this door is dead (queue item 3, F6 spec 2b, exit criterion 5)", () => {
    saveMonitorRun(monitorRunFor(null));
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("unlogged");
  });

  // Hand-off store design spec §5, plan Task 5 (the P1-1 hole AT THIS
  // SECOND DOOR, closed — §10 row 1's own "guard reads one tier -> fails"
  // mutation target). A record whose DURABLE write was denied
  // (memory-only) is exactly what Today's own store-backed row already
  // renders for (Task 4) — Start's guard now agrees, where
  // `loadMonitorRun()` (durable tier only) would have seen nothing.
  it("stages 'unlogged' for a memory-only MonitorRun (durable write denied) — same visibility as Today's own row", async () => {
    const { vi } = await import("vitest");
    const memoryOnly = monitorRunFor(null);
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    const created = commitHandoff(memoryOnly.startedAt, null, memoryOnly);
    setItemSpy.mockRestore();
    expect(created).toMatchObject({ accepted: true, verdict: "failed" });
    expect(loadMonitorRun()).toBeNull();

    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.replaceStage).toBe("unlogged");
  });

  it("cancelReplace clears the staged panel and touches no storage", () => {
    const live = monitorRunFor(null);
    saveMonitorRun(live);
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });
    act(() => result.current.handleStart());
    expect(result.current.replaceStage).toBe("unlogged");

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
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });
    act(() => result.current.handleStart());
    expect(result.current.replaceStage).toBe("unlogged");

    act(() => result.current.confirmReplace());

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    expect(loadRun()).toBeNull();
    expect(loadMonitorRun()).toBeNull();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.workoutId).toBe("w1");
    expect(draft!.startedAt).not.toBeNull();
  });

  // Hand-off store design spec §5, plan Task 5 (the NAMED Task 5 exit
  // condition, ROADMAP's AUD-016 item): confirmReplace routes through
  // `retire()`, not the legacy `clearMonitorRun()`, so the key is
  // tombstoned — a late producer burst (the dead hook's own linger
  // window) racing this confirm is REFUSED instead of resurrecting the
  // record. Real UI path: `handleStart` -> `confirmReplace` via the
  // returned hook API, exactly what the "Replace session" button calls.
  it("the door leg — confirmReplace tombstones the key, so a late producer burst can no longer resurrect it", async () => {
    const monitorRun = monitorRunFor("2026-08-05T12:41:00.000Z");
    saveMonitorRun(monitorRun);
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });
    act(() => result.current.handleStart());
    expect(result.current.replaceStage).toBe("unlogged");

    act(() => result.current.confirmReplace());

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    expect(loadMonitorRun()).toBeNull();

    // THE LATE BURST: the dead hook's own linger-window commit, racing the
    // replace that already fired for the identical key/revision.
    const lateBurst = {
      ...monitorRun,
      completedAt: "2026-08-05T12:41:05.000Z",
    };
    const result2 = commitHandoff(monitorRun.startedAt, 0, lateBurst);

    expect(result2).toStrictEqual({ accepted: false, reason: "retired" });
    // No resurrection.
    expect(loadMonitorRun()).toBeNull();
  });

  it("no MonitorRun at all: the cross-clear inside confirmReplace is a no-op removeItem, not an error", async () => {
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.confirmReplace());

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    expect(loadMonitorRun()).toBeNull();
  });

  it("surfaces an inline error and does not navigate when saveDraft fails (quota)", async () => {
    const { vi } = await import("vitest");
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    const { result } = renderHook(() => useStartWorkout(WORKOUT, {}), {
      wrapper,
    });

    act(() => result.current.handleStart());

    expect(result.current.startError).toBe(
      "Couldn't start this session. Try again.",
    );
    expect(screen.queryByText("COUNTDOWN SCREEN")).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
