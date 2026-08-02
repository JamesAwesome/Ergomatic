import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
import type { Step, WorkoutType } from "../../domain/types.js";
import {
  buildDraft,
  loadDraft,
  saveDraft,
  startDraft,
  type SessionDraft,
} from "./draft";
import { buildRun, type EnginePhase } from "./engine";
import { loadRun, saveRun, type SessionRun } from "./run";
import { isSuspectActual, totalSessionSeconds } from "./Timer";

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
const TOL = 1;
const FIXED_NOW = new Date("2026-08-01T12:00:00.000Z");

function starter(title: string) {
  const w = STARTER_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing starter fixture: ${title}`);
  return w;
}

// The phase-kind matrix fixture — the brief's own "a real starter workout
// with an added effort step via the draft," extended one further step for
// distance (no single starter step list otherwise exercises wu/work-split/
// rest/work-effort/distance all in one run). Doldrums' own real split-ref
// work step (time, spm 18, its own embedded 3' rest) supplies wu/
// work-split/rest; a distance split-ref step and an effort-ref step are
// appended directly onto the draft. The reps marker is deliberately NOT
// reused here — appending steps after a LIVE "reps" marker would repeat
// them too (domain/expand.ts's own `liveIndices`), doubling the appended
// phases for no reason; this fixture wants each kind exactly once.
//
// Resulting phases (baselines {k2:100,k6:120}, tol 1):
//   0 warmup   240s   "Easy"
//   1 work     1200s  split  "2:16.0" / "2:15.0–2:17.0"  spm 18
//   2 rest     180s   "Rest"
//   3 work     —      distance 500m, split "1:40.0" / "1:39.0–1:41.0"
//   4 work     60s    effort "ALL OUT"
function kindMatrixDraft(): SessionDraft {
  const doldrums = starter("Doldrums");
  const splitWork = doldrums.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;
  return buildDraft({
    id: "id-kind-matrix",
    title: doldrums.title,
    type: doldrums.type as WorkoutType,
    steps: [
      { k: "wu", minutes: 4 },
      splitWork,
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 0 },
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
      },
    ],
  });
}

// No starter workout authors a "test" (open-ended) step (Task 1's own
// report: none exists in the seeded library) — a hand-built minimal draft,
// the same exception draft.test.ts's own "Warm-up only" fixture takes.
function testKindDraft(): SessionDraft {
  return buildDraft({
    id: "id-test-kind",
    title: "Sprint Check",
    type: "AN",
    steps: [
      { k: "wu", minutes: 2 },
      { k: "test", label: "2k test" },
    ],
  });
}

function buildAndSaveRun(
  draft: SessionDraft,
  now = FIXED_NOW,
  baselines = BASELINES,
): SessionRun {
  saveDraft(startDraft(draft));
  const run = buildRun(draft, baselines, TOL, now);
  saveRun(run);
  return run;
}

// Re-seeds `run` at a given phase index as if it had just started at
// `startedAt` — a direct construction for test SETUP only. engine.test.ts
// already owns proving `tick`/`advance` walk to a state like this
// correctly; Timer.tsx's own job is rendering a `SessionRun`, not deriving
// one.
function runAtIndex(
  run: SessionRun,
  index: number,
  startedAt: Date = FIXED_NOW,
): SessionRun {
  const seeded: SessionRun = {
    ...run,
    index,
    phaseStartedAt: startedAt.toISOString(),
    pausedAt: null,
    pausedTotalMs: 0,
  };
  saveRun(seeded);
  return seeded;
}

function mockKeepAwake() {
  const keepAwakeOn = vi.fn(async () => {});
  const keepAwakeOff = vi.fn(async () => {});
  vi.doMock("../adapters/keepAwake", () => ({ keepAwakeOn, keepAwakeOff }));
  return { keepAwakeOn, keepAwakeOff };
}

async function renderTimer(initialPath = "/session/run") {
  const { default: Timer } = await import("./Timer");
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/session/run" element={<Timer />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
        <Route path="/session/complete" element={<p>COMPLETE SCREEN</p>} />
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

// A minimal but realistic EnginePhase builder, mirroring
// TimerTargets.test.tsx's own — every field the real engine always stamps,
// with the caller overriding only what a given test cares about.
function phase(overrides: Partial<EnginePhase>): EnginePhase {
  return { type: "work", label: "", originalIndex: 0, ...overrides };
}

describe("isSuspectActual", () => {
  // 500m @ 2k+0 (baselines k2=100) -> estimate = (500/500)*100 = 100s.
  const distancePhase = phase({ meters: 500, targetSplit: 100 });

  it("is false EXACTLY at 2x the estimate — the boundary itself is not suspect", () => {
    expect(isSuspectActual(distancePhase, 200)).toBe(false);
  });

  it("is true one second past 2x the estimate", () => {
    expect(isSuspectActual(distancePhase, 201)).toBe(true);
  });

  it("is false well within the estimate", () => {
    expect(isSuspectActual(distancePhase, 50)).toBe(false);
  });

  it("is false for a phase with no estimate at all (phaseSeconds returns null)", () => {
    const openEnded = phase({ type: "test", label: "All out" }); // no seconds, no meters
    expect(isSuspectActual(openEnded, 999_999)).toBe(false);
  });
});

describe("totalSessionSeconds", () => {
  it("sums every phase's full duration from the start: fixed seconds + a distance estimate + zero for an open-ended phase", () => {
    const phases: EnginePhase[] = [
      phase({ type: "warmup", seconds: 300, label: "Easy" }),
      // (2000/500)*120 = 480
      phase({ meters: 2000, targetSplit: 120, label: "2:00.0" }),
      phase({ type: "test", label: "All out" }), // no seconds/meters -> 0
    ];
    const run = { phases } as SessionRun; // only `.phases` is read
    expect(totalSessionSeconds(run)).toBe(300 + 480 + 0);
  });

  it("is 0 for a run with no phases (never divides by a negative/undefined)", () => {
    expect(totalSessionSeconds({ phases: [] } as unknown as SessionRun)).toBe(
      0,
    );
  });
});

describe("Timer — guards", () => {
  // Real timers: these two only need <Navigate>'s own effect to settle,
  // the same precedent Countdown.test.tsx's identical guard tests use.
  it("redirects to /today when there is no draft and no run", async () => {
    mockKeepAwake();
    await renderTimer();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  // Resilience 5 (spec): "sessionRun with unknown v or malformed shape ->
  // null + clear, the timer redirects to /today, the DRAFT survives." A
  // draft with no run record at all is the simplest instance of this —
  // `run.ts`'s own `loadRun` already turns "malformed" into exactly this
  // "null" case, so this is Timer's own contribution: react to a null run.
  it("redirects to /today when a draft exists but the run record doesn't", async () => {
    mockKeepAwake();
    saveDraft(startDraft(kindMatrixDraft()));
    await renderTimer();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    // The draft survives — Resilience 5's other half.
    expect(loadDraft()).not.toBeNull();
  });
});

describe("Timer — phase-kind rendering (never a dash, per kind)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  it("warm-up: 'Easy' target, 'rate free', count-DOWN remaining", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 0);
    await renderTimer();

    expect(screen.getByText("STEP 1 OF 5 · WARM-UP")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("4:00")).toBeInTheDocument(); // 240s remaining
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.getByText("rate free")).toBeInTheDocument();
    expect(screen.getByText("WORK · 2:15.0–2:17.0")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("work (split, time): the resolved central value + range, spm", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 1);
    await renderTimer();

    expect(screen.getByText("STEP 2 OF 5 · WORK")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument(); // 1200s remaining
    expect(screen.getByText("2:16.0")).toBeInTheDocument();
    expect(screen.getByText("2:15.0–2:17.0")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("spm")).toBeInTheDocument();
    expect(screen.getByText("REST · Rest")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  // Doldrums' OWN unmodified reps block (`{k:"reps",count:2}` repeating its
  // one work+rest pair) — the SET N/M segment of the STEP line only ever
  // appears on a phase produced by a live reps marker (domain/expand.ts's
  // own `set` stamping), which `kindMatrixDraft` deliberately avoids
  // reusing (see its own comment) to keep that fixture's phase count exact.
  it("a repeated (SET) phase folds SET i/j into the STEP line", async () => {
    mockKeepAwake();
    const doldrums = starter("Doldrums");
    const draft = buildDraft({
      id: "id-doldrums-set",
      title: doldrums.title,
      type: doldrums.type as WorkoutType,
      steps: doldrums.steps,
    });
    const run = buildAndSaveRun(draft);
    // Phases: [0 wu, 1 work(set 1/2), 2 rest(set 1/2), 3 work(set 2/2), 4 rest(set 2/2)].
    runAtIndex(run, 1);
    await renderTimer();

    expect(
      screen.getByText("STEP 2 OF 5 · WORK · SET 1/2"),
    ).toBeInTheDocument();
  });

  it("rest: 'Rest' target, 'rate free'", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 2);
    await renderTimer();

    expect(screen.getByText("STEP 3 OF 5 · REST")).toBeInTheDocument();
    expect(screen.getByText("3:00")).toBeInTheDocument(); // 180s remaining
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("rate free")).toBeInTheDocument();
    expect(screen.getByText("WORK · 1:39.0–1:41.0")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("distance: meters folded into the STEP line, count-UP stopwatch, full-width NEXT →", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 3);
    await renderTimer();

    expect(screen.getByText("STEP 4 OF 5 · WORK · 500M")).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument(); // elapsed, not remaining
    expect(screen.getByText("1:40.0")).toBeInTheDocument();
    expect(screen.getByText("1:39.0–1:41.0")).toBeInTheDocument();
    expect(screen.getByText("rate free")).toBeInTheDocument();
    expect(screen.getByText("WORK · ALL OUT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "NEXT →" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Previous phase" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pause" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("work (effort): the word only, NEVER the numeric estimate; FINISH past the last phase", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 4);
    await renderTimer();

    expect(screen.getByText("STEP 5 OF 5 · WORK")).toBeInTheDocument();
    // Both the numeral (60s remaining) AND TOTAL LEFT read "1:00" here —
    // this is the LAST phase, so TOTAL LEFT is just its own remainder —
    // scoped to the numeral to avoid colliding with the duplicate text.
    expect(document.querySelector(".timer-time")).toHaveTextContent("1:00");
    expect(screen.getByText("ALL OUT")).toBeInTheDocument();
    expect(screen.getByText("rate free")).toBeInTheDocument();
    expect(screen.getByText("FINISH")).toBeInTheDocument();
    // The estimate behind an effort target (baselines.k2Seconds=100, per
    // pace.ts's estimationSplit for "max") must never surface as text.
    expect(screen.queryByText("1:40.0")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("test (open-ended): 'All out' (lowercase, distinct from effort's ALL OUT), 'rate free', count-UP, empty phase bar, standard controls", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(testKindDraft());
    runAtIndex(run, 1);
    await renderTimer();

    expect(screen.getByText("STEP 2 OF 2 · TEST")).toBeInTheDocument();
    // Both the big numeral (elapsed) AND TOTAL LEFT read "0:00" here (a
    // "test" phase has no `seconds`/`meters` for `phaseSeconds` to price,
    // per engine.ts's own `totalRemainingSeconds` doc — it contributes
    // nothing), so this scopes to the numeral specifically rather than
    // colliding on the duplicate text.
    expect(document.querySelector(".timer-time")).toHaveTextContent("0:00");
    expect(document.querySelector(".timer-total-value")).toHaveTextContent(
      "0:00",
    );
    // The phase bar stays empty — nothing to divide an open-ended phase's
    // elapsed time by.
    expect(
      (document.querySelector(".timer-phase-bar span") as HTMLElement).style
        .width,
    ).toBe("0%");
    expect(screen.getByText("All out")).toBeInTheDocument();
    expect(screen.getByText("rate free")).toBeInTheDocument();
    expect(screen.getByText("FINISH")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous phase" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "NEXT →" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

describe("Timer — controls", () => {
  // `toFake: ["Date"]` only — NOT setTimeout/setInterval: this repo's
  // installed @testing-library/user-event (14.6.1) + vitest (4.1.10)
  // combination hangs indefinitely on `userEvent.click` once
  // `vi.useFakeTimers()` fakes timer scheduling too (confirmed with a
  // minimal repro outside this component before writing these tests around
  // it — even `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`
  // or `{ delay: null }` still hung). Freezing only `Date` keeps every
  // engine computation deterministic (`new Date()` inside Timer.tsx's
  // handlers always returns the frozen instant) while leaving REAL
  // `setInterval`/`setTimeout` for userEvent's own internals to use
  // normally — the repaint interval this component installs won't fire
  // within a synchronous test's real few milliseconds regardless.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });

  it("Pause freezes the displayed remaining time regardless of how long the pause lasts; Resume continues it", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft(), FIXED_NOW);
    runAtIndex(run, 1, FIXED_NOW);
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 10_000)); // 10s in
    await renderTimer();
    expect(screen.getByText("19:50")).toBeInTheDocument(); // 1200 - 10
    // The phase-progress bar's fill: 10s elapsed of the phase's 1200s full
    // duration — a genuine non-zero, non-trivial fraction (unlike every
    // phase-kind-rendering test above, which all render at elapsed=0).
    const phaseBarWidth = parseFloat(
      (document.querySelector(".timer-phase-bar span") as HTMLElement).style
        .width,
    );
    expect(phaseBarWidth).toBeCloseTo((10 / 1200) * 100, 6);

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    expect(screen.getByText("19:50")).toBeInTheDocument();

    // Time passes while paused — advancing the frozen clock directly and
    // forcing a repaint via `visibilitychange` exercises the SAME
    // recompute-against-`now` path the real 1s interval uses, without
    // needing setInterval itself to be fake (it isn't, in this describe
    // block — see the comment above).
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 40_000));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("19:50")).toBeInTheDocument(); // still frozen

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByText("RUNNING")).toBeInTheDocument();

    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 45_000));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("19:45")).toBeInTheDocument(); // 1200 - 15
  });

  it("◀ rewinds to the previous phase, re-seeding its clock (not partially elapsed)", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 1);
    await renderTimer();
    screen.getByText("STEP 2 OF 5 · WORK");

    await userEvent.click(
      screen.getByRole("button", { name: "Previous phase" }),
    );

    expect(screen.getByText("STEP 1 OF 5 · WARM-UP")).toBeInTheDocument();
    expect(screen.getByText("4:00")).toBeInTheDocument();
  });

  it("▶ advances to the next phase, re-seeding its clock", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 1);
    await renderTimer();
    screen.getByText("STEP 2 OF 5 · WORK");

    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));

    expect(screen.getByText("STEP 3 OF 5 · REST")).toBeInTheDocument();
    expect(screen.getByText("3:00")).toBeInTheDocument();
  });

  it("navigates to /session/complete once ▶ advances past the final phase", async () => {
    mockKeepAwake();
    const draft = buildDraft({
      id: "id-one-phase",
      title: "One And Done",
      type: "AN",
      steps: [{ k: "wu", minutes: 1 }],
    });
    const run = buildAndSaveRun(draft);
    runAtIndex(run, 0);
    await renderTimer();
    screen.getByText("STEP 1 OF 1 · WARM-UP");

    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));

    expect(screen.getByText("COMPLETE SCREEN")).toBeInTheDocument();
  });

  it("END stages an abandon confirm (BaselineEditor idiom) and pauses meanwhile; Keep going stays paused; Abandon clears the draft + run and returns to Today", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 1);
    await renderTimer();
    screen.getByText("RUNNING");

    await userEvent.click(screen.getByRole("button", { name: "END →" }));

    expect(screen.getByText(/Abandon this session\?/)).toBeInTheDocument();
    expect(screen.getByText("PAUSED")).toBeInTheDocument(); // paused first

    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(
      screen.queryByText(/Abandon this session\?/),
    ).not.toBeInTheDocument();
    // Deliberately stays paused — Keep going is not an implicit resume,
    // same rule Pause/Resume already follows everywhere else.
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "END →" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "END →" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Abandon session" }),
    );

    expect(screen.getByText("TODAY SCREEN")).toBeInTheDocument();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  it("turns keep-awake on while mounted and off on unmount", async () => {
    const { keepAwakeOn, keepAwakeOff } = mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 0);
    const { unmount } = await renderTimer();
    screen.getByText("RUNNING");

    expect(keepAwakeOn).toHaveBeenCalledOnce();
    expect(keepAwakeOff).not.toHaveBeenCalled();

    unmount();
    expect(keepAwakeOff).toHaveBeenCalledOnce();
  });
});

describe("Timer — distance mode: the suspect-actual seam", () => {
  // Fixture's distance phase (index 3): 500m @ 2k+0 (baselines k2=100) ->
  // estimate = (500/500) * 100 = 100s; the ledger's own threshold is
  // "elapsed > 2x the estimate", i.e. suspect past 200s. `toFake: ["Date"]`
  // only — see the "Timer — controls" describe block's own comment for why.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });

  it("records the actual normally when elapsed is within 2x the estimate (no staged choice)", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 3, new Date(FIXED_NOW.getTime() - 150_000)); // 150s < 200s
    await renderTimer();
    screen.getByText("STEP 4 OF 5 · WORK · 500M");

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));

    expect(screen.getByText("STEP 5 OF 5 · WORK")).toBeInTheDocument();
    expect(screen.queryByText(/Keep split/)).not.toBeInTheDocument();
    const saved = loadRun()!;
    expect(saved.actuals[3]).toBeDefined();
    expect(saved.actuals[3]!.elapsedSeconds).toBe(150);
    expect(saved.actuals[3]!.splitSeconds).toBe(150); // (150/500)*500
    expect(saved.actuals[3]!.actualSource).toBe("stopwatch");
  });

  it("stages a Keep/Discard choice past 2x the estimate; Keep records the (suspect) actual and advances", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 3, new Date(FIXED_NOW.getTime() - 250_000)); // 250s > 200s
    await renderTimer();
    screen.getByText("STEP 4 OF 5 · WORK · 500M");

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));

    expect(
      screen.getByText(/took a lot longer than expected/),
    ).toBeInTheDocument();
    // Not advanced yet — still on the distance phase.
    expect(screen.getByText("STEP 4 OF 5 · WORK · 500M")).toBeInTheDocument();
    expect(loadRun()!.actuals[3]).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: "Keep split" }));

    expect(screen.getByText("STEP 5 OF 5 · WORK")).toBeInTheDocument();
    const saved = loadRun()!;
    expect(saved.actuals[3]).toBeDefined();
    expect(saved.actuals[3]!.elapsedSeconds).toBe(250);
    expect(saved.actuals[3]!.splitSeconds).toBe(250);
  });

  it("Discard records NO actual but still advances", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(kindMatrixDraft());
    runAtIndex(run, 3, new Date(FIXED_NOW.getTime() - 250_000));
    await renderTimer();
    screen.getByText("STEP 4 OF 5 · WORK · 500M");

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));
    screen.getByText(/took a lot longer than expected/);

    await userEvent.click(
      screen.getByRole("button", { name: "Discard split" }),
    );

    expect(screen.getByText("STEP 5 OF 5 · WORK")).toBeInTheDocument();
    const saved = loadRun()!;
    expect(saved.actuals[3]).toBeUndefined();
  });
});

describe("Timer — the repaint loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  it("auto-advances a short phase after enough 1s repaints (tick() on the interval)", async () => {
    mockKeepAwake();
    const draft = buildDraft({
      id: "id-short-phase",
      title: "Quick Check",
      type: "AN",
      steps: [
        { k: "wu", minutes: 0.5 }, // 30s
        { k: "wu", minutes: 1 },
      ],
    });
    buildAndSaveRun(draft);
    await renderTimer();
    screen.getByText("STEP 1 OF 2 · WARM-UP");

    await act(() => vi.advanceTimersByTimeAsync(31_000));

    expect(screen.getByText("STEP 2 OF 2 · WARM-UP")).toBeInTheDocument();
  });

  // A locked screen waking up: the catch-up walk must fire from
  // `visibilitychange`, not only from the next 1s interval tick.
  it("catches up multiple phases on visibilitychange (a simulated lock)", async () => {
    mockKeepAwake();
    const mackerelSky = starter("Mackerel Sky");
    const draft = buildDraft({
      id: "id-mackerel",
      title: mackerelSky.title,
      type: mackerelSky.type as WorkoutType,
      steps: mackerelSky.steps,
    });
    const run = buildAndSaveRun(draft);
    // wu 300s + work1 900s = 1200s boundary; 10s into work2 (index 2).
    runAtIndex(run, 0, new Date(FIXED_NOW.getTime() - 1_210_000));
    await renderTimer();

    // Before any tick fires, the stale phase 0 is still what renders.
    expect(screen.getByText(/^STEP 1 OF 4/)).toBeInTheDocument();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByText(/^STEP 3 OF 4/)).toBeInTheDocument();
  });
});
