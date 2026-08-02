import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
import type { Step, WorkoutType } from "../../domain/types.js";
import { buildDraft, saveDraft, startDraft, type SessionDraft } from "./draft";
import { buildRun, type EnginePhase } from "./engine";
import { saveRun, type SessionRun } from "./run";
import { actualRows, totalElapsedSeconds } from "./SessionComplete";

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
const TOL = 1;
const FIXED_NOW = new Date("2026-08-01T12:00:00.000Z");

function starter(title: string) {
  const w = STARTER_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing starter fixture: ${title}`);
  return w;
}

// A real starter workout (Doldrums: wu + a split-ref work/rest pair, per
// repo convention — not a hand-built minimum) with ONE distance step
// appended directly (not after its own live "reps" marker, which would
// repeat it too — the same "reps marker deliberately not reused" call
// Timer.test.tsx's own kindMatrixDraft fixture makes and explains). Resulting
// phases: 0 warmup, 1 work (time, split), 2 rest, 3 work (distance) — the
// LAST phase is the one this module's own actuals list has anything to show
// for, since 6B's engine only ever records an actual for a distance phase.
function completeDraftAndRun(): { draft: SessionDraft; run: SessionRun } {
  const doldrums = starter("Doldrums");
  const splitWork = doldrums.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;
  const draft = buildDraft({
    id: "id-complete-fixture",
    title: doldrums.title,
    type: doldrums.type as WorkoutType,
    steps: [
      { k: "wu", minutes: 4 },
      splitWork,
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 0 },
      },
    ],
  });
  const started = startDraft(draft);
  saveDraft(started);
  const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
  const distanceIndex = built.phases.length - 1;
  // Completion is a CONSTRUCTION here, not a derivation — engine.test.ts and
  // Timer.test.tsx already own proving tick/advance walk to this state
  // correctly; SessionComplete.tsx's own job is rendering an already-
  // complete SessionRun. 20 minutes real elapsed (FIXED_NOW -> +20min),
  // one recorded actual for the appended distance phase — the same
  // elapsedSeconds/splitSeconds shape `nextDistance` itself produces
  // (452s on a 2000m piece -> splitSeconds 113.0 exactly, engine.ts's own
  // hand-pinned example).
  const completedAt = new Date(
    FIXED_NOW.getTime() + 20 * 60 * 1000,
  ).toISOString();
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt,
    actuals: {
      [distanceIndex]: {
        elapsedSeconds: 452,
        splitSeconds: 113,
        actualSource: "stopwatch",
      },
    },
  };
  saveRun(run);
  return { draft: started, run };
}

// A real-shaped two-piece workout (warm-up + TWO distance work steps,
// TR-type race pace — the community-canon "two pieces" shape, not a
// hand-built minimum) with a recorded actual on BOTH distance phases —
// fix round (whole-branch review, F2): the render-level list was only ever
// exercised with exactly one actual, which can't tell "renders the list"
// apart from "renders the list correctly when it has more than one row."
function multiActualDraftAndRun(): { draft: SessionDraft; run: SessionRun } {
  const draft = buildDraft({
    id: "id-two-pieces",
    title: "Two Pieces",
    type: "TR",
    steps: [
      { k: "wu", minutes: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 0 },
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 6000 },
        ref: { base: "6k", off: 0 },
      },
    ],
  });
  const started = startDraft(draft);
  saveDraft(started);
  const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
  // Phases: 0 warmup, 1 work (2000m), 2 work (6000m).
  const completedAt = new Date(
    FIXED_NOW.getTime() + 40 * 60 * 1000,
  ).toISOString();
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt,
    actuals: {
      // 452/2000*500 = 113.0 exactly (engine.ts's own hand-pinned example).
      1: { elapsedSeconds: 452, splitSeconds: 113, actualSource: "stopwatch" },
      // 1464/6000*500 = 122.0 exactly.
      2: {
        elapsedSeconds: 1464,
        splitSeconds: 122,
        actualSource: "stopwatch",
      },
    },
  };
  saveRun(run);
  return { draft: started, run };
}

function mockKeepAwake() {
  const keepAwakeOn = vi.fn(async () => {});
  const keepAwakeOff = vi.fn(async () => {});
  vi.doMock("../adapters/keepAwake", () => ({ keepAwakeOn, keepAwakeOff }));
  return { keepAwakeOn, keepAwakeOff };
}

async function renderComplete(initialPath = "/session/complete") {
  const { default: SessionComplete } = await import("./SessionComplete");
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/session/complete" element={<SessionComplete />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function phase(overrides: Partial<EnginePhase>): EnginePhase {
  return { type: "work", label: "", originalIndex: 0, ...overrides };
}

describe("totalElapsedSeconds", () => {
  it("is completedAt minus startedAt, in whole seconds", () => {
    const run = {
      startedAt: "2026-08-01T12:00:00.000Z",
      completedAt: "2026-08-01T12:20:00.000Z",
    } as SessionRun;
    expect(totalElapsedSeconds(run)).toBe(1200);
  });

  it("is 0 when completedAt is still null (defensive — SessionComplete's own render guard never actually lets this happen)", () => {
    const run = {
      startedAt: "2026-08-01T12:00:00.000Z",
      completedAt: null,
    } as SessionRun;
    expect(totalElapsedSeconds(run)).toBe(0);
  });

  it("floors at 0 rather than going negative", () => {
    const run = {
      startedAt: "2026-08-01T12:20:00.000Z",
      completedAt: "2026-08-01T12:00:00.000Z",
    } as SessionRun;
    expect(totalElapsedSeconds(run)).toBe(0);
  });
});

describe("actualRows", () => {
  it("orders by phase index, not object key insertion order", () => {
    const phases: EnginePhase[] = [
      phase({ meters: 500, label: "a" }),
      phase({ meters: 1000, label: "b" }),
      phase({ meters: 2000, label: "c" }),
    ];
    const run = {
      phases,
      actuals: {
        2: { elapsedSeconds: 10, splitSeconds: 1, actualSource: "stopwatch" },
        0: { elapsedSeconds: 20, splitSeconds: 2, actualSource: "stopwatch" },
        1: { elapsedSeconds: 30, splitSeconds: 3, actualSource: "stopwatch" },
      },
    } as unknown as SessionRun;
    expect(actualRows(run).map((r) => r.phase.label)).toStrictEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("is empty for a run with no recorded actuals (every phase was time-based)", () => {
    const run = { phases: [phase({})], actuals: {} } as SessionRun;
    expect(actualRows(run)).toStrictEqual([]);
  });

  it("skips an actual whose index doesn't resolve to a phase (defensive, not reachable via the engine's own contract)", () => {
    const run = {
      phases: [phase({ label: "only" })],
      actuals: {
        5: { elapsedSeconds: 1, splitSeconds: 1, actualSource: "stopwatch" },
      },
    } as unknown as SessionRun;
    expect(actualRows(run)).toStrictEqual([]);
  });
});

describe("SessionComplete", () => {
  it("redirects to /today when there's no draft", async () => {
    mockKeepAwake();
    saveRun({
      v: 1,
      phases: [],
      index: 0,
      phaseStartedAt: FIXED_NOW.toISOString(),
      pausedAt: null,
      pausedTotalMs: 0,
      actuals: {},
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
    });
    await renderComplete();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("redirects to /today when there's no run record", async () => {
    mockKeepAwake();
    saveDraft(startDraft(buildDraft({ ...starter("Doldrums"), id: "id-x" })));
    await renderComplete();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("redirects to /today when the run exists but isn't actually complete yet (direct/deep nav mid-session)", async () => {
    mockKeepAwake();
    const { run } = completeDraftAndRun();
    saveRun({ ...run, index: run.phases.length - 1, completedAt: null });
    await renderComplete();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("shows the workout name, TOTAL in house format, and the recorded distance actual's split", async () => {
    mockKeepAwake();
    const { draft } = completeDraftAndRun();
    await renderComplete();
    expect(
      await screen.findByRole("heading", { name: draft.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("TOTAL")).toBeInTheDocument();
    // 20 minutes real elapsed (FIXED_NOW -> completedAt), fmtDuration's own
    // house format.
    expect(screen.getByText("20:00")).toBeInTheDocument();
    // 452s / 2000m * 500 = 113.0s -> fmtSplit "1:53.0".
    expect(screen.getByText("1:53.0")).toBeInTheDocument();
  });

  it("renders every recorded actual, in phase order, when a run has more than one (fix round F2)", async () => {
    mockKeepAwake();
    multiActualDraftAndRun();
    await renderComplete();
    await screen.findByText("TOTAL");

    const rows = Array.from(document.querySelectorAll(".complete-actual-row"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("WORK · 2000M");
    expect(rows[0]).toHaveTextContent("1:53.0");
    expect(rows[1]).toHaveTextContent("WORK · 6000M");
    expect(rows[1]).toHaveTextContent("2:02.0");
  });

  it("omits the meters suffix for a recorded actual on a phase with no meters (defensive — the engine's own contract only ever keys `actuals` off a distance phase, but the label's ternary still has both branches)", async () => {
    mockKeepAwake();
    const { run } = completeDraftAndRun();
    // Phase 0 is the fixture's warm-up (no `meters`) — not a shape the real
    // engine ever produces an actual for (only `nextDistance`/Timer.tsx's
    // frozen-elapsed paths write to `actuals`, and both require
    // `phase.meters !== undefined`), constructed directly here purely to
    // exercise SessionComplete.tsx's own label ternary's other branch.
    saveRun({
      ...run,
      actuals: {
        0: { elapsedSeconds: 240, splitSeconds: 60, actualSource: "stopwatch" },
      },
    });
    await renderComplete();
    await screen.findByText("TOTAL");
    expect(screen.getByText("WARM-UP")).toBeInTheDocument();
    expect(screen.queryByText(/WARM-UP ·/)).not.toBeInTheDocument();
  });

  it("hides the actuals list entirely when the run has none recorded (every phase was time-based)", async () => {
    mockKeepAwake();
    const { run } = completeDraftAndRun();
    saveRun({ ...run, actuals: {} });
    await renderComplete();
    await screen.findByText("TOTAL");
    expect(document.querySelector(".complete-actuals")).not.toBeInTheDocument();
  });

  it("releases keep-awake on mount", async () => {
    const { keepAwakeOff } = mockKeepAwake();
    completeDraftAndRun();
    await renderComplete();
    await screen.findByText("TOTAL");
    expect(keepAwakeOff).toHaveBeenCalledTimes(1);
  });

  it("Back to Today navigates to /today and leaves the run record and draft in storage — 6C's own log-save is what eventually clears them, not this screen", async () => {
    mockKeepAwake();
    const user = userEvent.setup();
    completeDraftAndRun();
    await renderComplete();
    await screen.findByText("TOTAL");

    await user.click(screen.getByRole("button", { name: "Back to Today" }));
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();

    const { loadDraft } = await import("./draft");
    const { loadRun } = await import("./run");
    expect(loadDraft()).not.toBeNull();
    const run = loadRun();
    expect(run).not.toBeNull();
    expect(run!.completedAt).not.toBeNull();
  });
});
