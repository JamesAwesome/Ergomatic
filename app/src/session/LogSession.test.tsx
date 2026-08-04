import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Step, WorkoutType } from "../../domain/types.js";
import type { api } from "../api";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { PlanData, PlanKey, PlanState } from "../api/usePlan";
import type { PlanCode } from "../../domain/plans.js";
import {
  buildDraft,
  clearDraft,
  DRAFT_KEY,
  loadDraft,
  saveDraft,
  startDraft,
  withNudge,
  type SessionDraft,
} from "./draft";
import { buildRun } from "./engine";
import { formatLogDate } from "./logDraft";
import { loadRun, RUN_KEY, saveRun, type SessionRun } from "./run";

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
const TOL = 1;
const FIXED_NOW = new Date("2026-08-01T12:00:00.000Z");

function library(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return w;
}

/** A real, mixed-kind fixture — Hoarfrost's own time/split work step (6k+12,
 *  restMinutes 5 — its auto-inserted rest phase) plus Calm Sea's own
 *  distance/split work step (6k+12), assembled from two real library
 *  workouts' own step OBJECTS rather than a hand-built minimum (the same
 *  "no single library workout has this shape" idiom Task 1's own F1b test
 *  used). The reps marker Hoarfrost is normally authored with is
 *  deliberately dropped — SessionComplete.test.tsx's own
 *  `completeDraftAndRun` does the same for the identical reason: a live
 *  reps marker would repeat the APPENDED distance step too, which isn't the
 *  shape this fixture wants. Phases: 0 warm-up, 1 work (time, 6k+12), 2
 *  rest (5'), 3 work (distance, 6k+12) — the LAST phase gets a real
 *  recorded (stopwatch) actual; the time phase never does (the engine only
 *  ever records one for a distance phase), so this fixture covers BOTH of
 *  `buildLogSteps`' actual rules in one run. */
// IMP-3 (whole-branch review): `type` defaults to Hoarfrost's own real type
// ("O2") for every caller that doesn't care about workoutType resolution
// specifically — but that default is ALSO `resolveWorkoutType`'s
// (`LogSession.tsx`) last-resort fallback value, so the "workoutType
// sourcing" describe block below overrides it to a non-"O2" type. Without
// the override, a `resolveWorkoutType` regressed to a bare `() => "O2"`
// would still pass every one of those tests — the fixture's own real type
// and the fallback's placeholder were indistinguishable.
function buildSessionFixture(overrides: { type?: WorkoutType } = {}): {
  draft: SessionDraft;
  run: SessionRun;
  workout: LibraryWorkout;
} {
  const hoarfrost = library("Hoarfrost");
  const type = overrides.type ?? (hoarfrost.type as WorkoutType);
  const timeWork = hoarfrost.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;
  const calmSea = library("Calm Sea");
  const distanceWork = calmSea.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;

  const draft = buildDraft({
    id: "id-doldrums-fixture",
    title: hoarfrost.title,
    type,
    steps: [{ k: "wu", minutes: 4 }, timeWork, distanceWork],
  });
  const started = startDraft(draft);
  saveDraft(started);
  const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
  const distanceIndex = built.phases.length - 1;
  const completedAt = new Date(
    FIXED_NOW.getTime() + 30 * 60 * 1000,
  ).toISOString();
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt,
    actuals: {
      // 2500s / 10000m * 500 = 125.0s exactly — deliberately NOT equal to
      // the 132s target, so a stopwatch actual reads as genuinely
      // different information, not a repeat of the target line.
      [distanceIndex]: {
        elapsedSeconds: 2500,
        splitSeconds: 125,
        actualSource: "stopwatch",
      },
    },
  };
  saveRun(run);
  const workout: LibraryWorkout = {
    id: "id-doldrums-fixture",
    title: hoarfrost.title,
    type,
    difficulty: hoarfrost.difficulty,
    pain: hoarfrost.pain,
    steps: started.steps,
    isGlobal: true,
    lastDoneDaysAgo: 2,
  };
  return { draft: started, run, workout };
}

function mockWorkouts(workouts: LibraryWorkout[]) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
}

// Task 3 (the manual door): same `vi.doMock` idiom as `mockWorkouts` above,
// for the second hook the manual door reads (`useBaselines`) that the
// session door never needed.
function mockBaselines(
  baselines: { k2Seconds: number | null; k6Seconds: number | null } = BASELINES,
) {
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines }),
  }));
}

const NO_PLAN: PlanData = { planKey: null, doneN: 0, sequence: [] };

// Task 3 (outside-plan logging): unlike `mockWorkouts`/`mockBaselines`
// (each called at most once per test), `mockPlan` needs to run TWICE in
// tests that override the plan state — once implicitly via `beforeEach`'s
// default, once explicitly in the test body — since most tests in this
// file never touch the plan at all and should keep seeing the pre-Task-3
// "no active plan" shape unmodified. Registering `vi.doMock` itself twice
// per test (the naive version of this helper) proved unreliable under a
// full, heavily parallel coverage run (flaky in a way a single-file run
// never reproduced) — this registers the mock factory exactly ONCE, at
// this module's own load time, closing over a mutable ref instead;
// `mockPlan(state)` just reassigns the ref, and `beforeEach` below resets
// it to the default before every test. One registration, many reads —
// structurally immune to whatever race repeated `vi.doMock` calls hit.
let planStateRef: PlanState = readyPlanState(NO_PLAN);
vi.doMock("../api/usePlan", () => ({ usePlan: () => planStateRef }));

function mockPlan(state: PlanState = readyPlanState(NO_PLAN)) {
  planStateRef = state;
}

// `choose`/`reset` are never exercised by anything in this file (the Log
// screen only ever READS `usePlan()`'s data, per LogSession.tsx's own
// comment on why its error state must not block Save) — `vi.fn()` stubs
// satisfy `PlanState`'s own ready-state shape (usePlan.ts) without
// implying either function is under test here.
function readyPlanState(plan: PlanData): PlanState {
  return { state: "ready", plan, choose: vi.fn(), reset: vi.fn() };
}

// A minimal but real-shaped active plan — `sequence` entries mirror the
// server's own `planResponse` shape (routes/data.ts), not a hand-built
// minimum missing fields the toggle's copy actually reads (`doneN`,
// `sequence.length`).
function activePlan(overrides: Partial<PlanData> = {}): PlanData {
  const planKey: PlanKey = "sprint";
  const doneN = 3;
  const sequence: PlanData["sequence"] = Array.from({ length: 84 }, (_, i) => ({
    index: i,
    code: "O2" as PlanCode,
    status: i < doneN ? "done" : i === doneN ? "today" : "upcoming",
  }));
  return { planKey, doneN, sequence, ...overrides };
}

// A real, mixed-kind fixture for the manual door — the SAME two library
// workouts' own work steps `buildSessionFixture` above assembles (Hoarfrost's
// time/split step, restMinutes 5; Calm Sea's distance/split step), reused
// here rather than a hand-built minimum (this file's own established "no
// single library workout has this shape" idiom). Unlike `buildSessionFixture`,
// this never touches the draft/run stores at all — the manual door has no
// draft or run to build, just a `LibraryWorkout` fetched by id.
function manualWorkoutFixture(id = "id-manual-fixture"): LibraryWorkout {
  const hoarfrost = library("Hoarfrost");
  const timeWork = hoarfrost.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;
  const calmSea = library("Calm Sea");
  const distanceWork = calmSea.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;
  return {
    id,
    title: hoarfrost.title,
    type: hoarfrost.type as WorkoutType,
    difficulty: hoarfrost.difficulty,
    pain: hoarfrost.pain,
    steps: [{ k: "wu", minutes: 4 }, timeWork, distanceWork],
    isGlobal: true,
    lastDoneDaysAgo: 2,
  };
}

// Same `vi.doMock` + returned-spy idiom as WorkoutDetail.test.tsx's own
// `mockApi` — a real `Response`, not a bare object, so `.ok`/`.status`/
// `.json()` all behave exactly like the real fetch this replaces.
function mockApi(
  handler: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn<typeof api>(async (path, init) => handler(path, init));
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

function parsedBodies(
  fn: ReturnType<typeof mockApi>,
): Record<string, unknown>[] {
  return fn.mock.calls.map(([, init]) =>
    JSON.parse((init as RequestInit).body as string),
  );
}

async function renderLog(initialPath = "/session/log") {
  const { default: LogSession } = await import("./LogSession");
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/session/log" element={<LogSession />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Task 3: the manual door's own render helper, registering `:id/log`
// instead of the session door's fixed `/session/log` — `workoutId`'s
// presence in the URL is the door-detection signal LogSession's own default
// export reads via `useParams`.
async function renderManualLog(workoutId: string) {
  const { default: LogSession } = await import("./LogSession");
  return render(
    <MemoryRouter initialEntries={[`/library/${workoutId}/log`]}>
      <Routes>
        <Route path="/library/:id/log" element={<LogSession />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Must-fix minor (whole-branch review): a button that fires the exact same
// history transition a real browser BACK press does (`navigate(-1)`) — RTL
// has no way to trigger the actual browser back button, so this is the
// established way to prove a `replace: true` navigation's effect on the
// history STACK itself, not just the string it navigated to.
function BackTrigger() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      SIMULATE BROWSER BACK
    </button>
  );
}

// Renders the manual door with a REAL entry beneath it in history (the
// workout's own detail screen, standing in for wherever "Log it after" was
// clicked from) rather than `renderManualLog`'s single-entry stack — needed
// to prove what a browser BACK press after a successful save actually lands
// on, which a single-entry history can't distinguish from a fresh reload.
async function renderManualLogWithHistory(workoutId: string) {
  const { default: LogSession } = await import("./LogSession");
  return render(
    <MemoryRouter
      initialEntries={[`/library/${workoutId}`, `/library/${workoutId}/log`]}
      initialIndex={1}
    >
      <Routes>
        <Route path="/library/:id" element={<p>WORKOUT DETAIL SCREEN</p>} />
        <Route path="/library/:id/log" element={<LogSession />} />
        <Route
          path="/today"
          element={
            <>
              <p>TODAY SCREEN</p>
              <BackTrigger />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  // Default: no active plan — see `mockPlan`'s own comment on why this
  // keeps every pre-Task-3 test in this file passing unmodified.
  mockPlan();
});

describe("LogSession: deep-link/reload guards", () => {
  it("redirects to /today when there is no run record at all", async () => {
    mockWorkouts([]);
    await renderLog();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("redirects to /today when the run exists but hasn't finished yet", async () => {
    const { run } = buildSessionFixture();
    saveRun({ ...run, index: run.phases.length - 1 });
    mockWorkouts([]);
    await renderLog();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });
});

describe("LogSession: prefill from a real completed run", () => {
  it("shows the title, type badge, date+duration, the PACES LOCKED panel, the per-step list, and EXPECTED N/5", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();

    expect(
      await screen.findByRole("heading", { name: "Log Hoarfrost" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
    // completedAt = FIXED_NOW + 30 minutes -> "AUG 1"; totalMinutes = 30.
    expect(screen.getByText("AUG 1 · 30 MIN")).toBeInTheDocument();

    // PACES LOCKED (F1: only the bases actually referenced render — no
    // step in this fixture references "2k" at all, both work steps are
    // 6k-based, so the panel shows 6K alone, never "2K —"). The 6k value
    // is recovered EXACTLY from the time phase's own frozen targetSplit
    // (132 - 12 - 0 = 120, BASELINES.k6Seconds itself) -> fmtSplit(120) =
    // "2:00.0".
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "6K 2:00.0",
    );

    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(2);
    // Row 1: the time/split step — label composes from the DRAFT's real ref
    // (matchedDraft present), target is the frozen split; a completed time
    // phase's actual is "assumed" (identical to target), which this screen
    // deliberately does NOT print a second time.
    expect(rows[0]).toHaveTextContent("12:00 @ 6k +12");
    expect(rows[0]).toHaveTextContent("2:12.0");
    expect(rows[0]).not.toHaveTextContent("ACTUAL");
    // Row 2: the distance/split step — a REAL stopwatch actual (125.0s)
    // that differs from the 132.0s target earns its own ACTUAL line.
    expect(rows[1]).toHaveTextContent("10000 m @ 6k +12");
    expect(rows[1]).toHaveTextContent("2:12.0");
    expect(rows[1]).toHaveTextContent("ACTUAL 2:05.0");

    // EXPECTED N/5 — Hoarfrost's own `pain` (2), sourced via useWorkouts by
    // run.workoutId, not the rower's own (still-unset) selection.
    expect(screen.getByText("EXPECTED 2/5")).toBeInTheDocument();

    // Nothing pre-selected; Save is disabled until both are chosen.
    expect(screen.getByRole("button", { name: "HELD" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Save session" })).toBeDisabled();
  });

  it("Save enables once both Held and Pain are chosen", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    const save = screen.getByRole("button", { name: "Save session" });
    await userEvent.click(screen.getByRole("button", { name: "UNDER" }));
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Pain 3" }));
    expect(save).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "UNDER" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Pain 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows both PACES LOCKED bases when both are derivable (a 2k off=0 and a 6k off=0 step)", async () => {
    const draft = buildDraft({
      id: "id-both-bases",
      title: "Both Bases",
      type: "AT",
      steps: [
        { k: "wu", minutes: 4 },
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "2k", off: 0 },
        },
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    const started = startDraft(draft);
    saveDraft(started);
    const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 6 * 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Log Both Bases" });
    // BASELINES.k2Seconds (100) -> "1:40.0"; BASELINES.k6Seconds (120) ->
    // "2:00.0" — both recovered exactly, off=0 on each.
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "2K 1:40.0 · 6K 2:00.0",
    );
  });

  it("recovers the exact baseline even when the step carries a nudge — the nudge is folded into the per-step target, not into the recovered baseline", async () => {
    const base = buildDraft({
      id: "id-nudged",
      title: "Nudged",
      type: "AT",
      steps: [
        { k: "wu", minutes: 4 },
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    // +5s nudge on the work step (index 1) — the same confirm-time
    // adjustment ConfirmTargets.tsx's own nudge buttons apply.
    const nudged = withNudge(base, 1, 5);
    const started = startDraft(nudged);
    saveDraft(started);
    const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 3 * 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Log Nudged" });
    // targetSplit = 120 (baseline) + 0 (off) + 5 (nudge) = 125 -> the
    // per-step row shows the NUDGED number.
    expect(document.querySelector(".log-step-target")?.textContent).toBe(
      "2:05.0",
    );
    // F2: the label folds the nudge into its own offset ("6k +5", not the
    // raw authored "6k") — 120 (baseline) + 5 (folded offset) = 125,
    // reconciling with the target split above.
    expect(document.querySelector(".log-step-label")?.textContent).toBe(
      "3:00 @ 6k +5",
    );
    // PACES LOCKED recovers the TRUE baseline (120), not the nudged split
    // (F1: only 6K renders at all — this fixture's only step is 6k-based) —
    // proves the reconstruction subtracts BOTH the off and the nudge, not
    // just one of them.
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "6K 2:00.0",
    );
  });

  it("renders '—' for an effort step's target split (5G rule: an effort phase's frozen number is an estimate, never a real target)", async () => {
    const forkLightning = library("Fork Lightning");
    const effortWork = forkLightning.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    const draft = buildDraft({
      id: "id-fork-lightning-fixture",
      title: forkLightning.title,
      type: forkLightning.type as WorkoutType,
      steps: [{ k: "wu", minutes: 4 }, effortWork],
    });
    const started = startDraft(draft);
    saveDraft(started);
    const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 5 * 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Log Fork Lightning" });
    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("0:30 @ MAX");
    expect(document.querySelector(".log-step-target")?.textContent).toBe("—");
    expect(rows[0]).not.toHaveTextContent("ACTUAL");
    // F1: an all-effort workout references neither base at all — the whole
    // PACES LOCKED panel is omitted, not a doubly-dashed one.
    expect(document.querySelector(".log-paces-panel")).not.toBeInTheDocument();
  });

  it("a null run.workoutId (a malformed/legacy record) skips the library lookup and falls back honestly, with no EXPECTED line", async () => {
    const { run } = buildSessionFixture();
    saveRun({ ...run, workoutId: null });
    clearDraft();
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Log Hoarfrost" });
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
    expect(screen.queryByText(/EXPECTED/)).not.toBeInTheDocument();
  });

  // Must-fix minor (whole-branch review): this used to render the full form
  // immediately, using the "O2" fallback default because `library` reads as
  // `[]` while `useWorkouts()` is loading — a fast Save in that window
  // would have POSTed "O2" as the session's real type even though the
  // library lookup (once it resolved) would have found something else. The
  // fixture's own real type ("AT") is deliberately not "O2" for the same
  // IMP-3 reason as the "workoutType sourcing" block above.
  it("shows LOADING… (not the O2 fallback) when there is no matched draft and workouts are still resolving", async () => {
    buildSessionFixture({ type: "AT" });
    clearDraft();
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    await renderLog();

    expect(await screen.findByText("LOADING…")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Log Hoarfrost" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".type-badge")).not.toBeInTheDocument();
  });

  it("does not gate on a still-loading workouts hook when a matched draft already supplies the type", async () => {
    // Draft kept (not cleared) — `resolveWorkoutType`'s first, preferred
    // branch reads `matchedDraft.type` directly and never touches the
    // library at all, so there is nothing to wait for here.
    buildSessionFixture({ type: "AT" });
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    await renderLog();

    await screen.findByRole("heading", { name: "Log Hoarfrost" });
    expect(document.querySelector(".type-badge")?.textContent).toBe("AT");
  });
});

// The ledger residual routed to this task (Task 1's progress.md): a
// same-shaped but FOREIGN draft (a real SessionDraft, just for a different
// workoutId) must not be trusted for step labels, the PACES LOCKED
// reconstruction, or the workoutType fallback — all three read `run` and
// `draft`'s matching `workoutId` as one gate (`matchedDraft`).
describe("LogSession: the ledger residual (workoutId mismatch)", () => {
  it("ignores a foreign draft — fallback labels render and the PACES LOCKED panel is omitted entirely (F1: no bare dash)", async () => {
    const { workout } = buildSessionFixture();
    // A real, validly-shaped draft — just for a DIFFERENT workout than the
    // one this run was built from.
    const foreign = buildDraft({
      id: "a-completely-different-workout",
      title: "Foreign Workout",
      type: "AN",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { effort: "max" },
        },
      ],
    });
    saveDraft(startDraft(foreign));
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    // Neither base is recoverable without a matching draft — F1: the whole
    // panel is omitted, not a dashed "2K — · 6K —".
    expect(document.querySelector(".log-paces-panel")).not.toBeInTheDocument();

    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(2);
    // Fallback label: the phase's own frozen (already-resolved) label, not
    // the draft's chip idiom — proves the mismatch guard actually changed
    // behavior rather than passing vacuously. targetSplit 132 for BOTH
    // Hoarfrost (6k+12) and Calm Sea (6k+12, same offset) at TOL=1 ->
    // toleranceRange labels "2:11.0–2:13.0" for each — the point here is
    // the fallback FORMAT (a resolved range, not the "@ 6k +12" chip idiom
    // the matched-draft tests pin), not that the two rows differ.
    expect(rows[0]).toHaveTextContent("12:00 @ 2:11.0–2:13.0");
    expect(rows[1]).toHaveTextContent("10000 m @ 2:11.0–2:13.0");
  });
});

// IMP-2 (whole-branch review): before this fix, the session door had NO
// non-destructive way to leave this screen at all (tab bar hidden, no back
// link — only Save or a destructive staged Discard); the manual door's
// OTHER states (workout-not-found, baselines-unset) already had a BackLink,
// but its own main, ready-to-save state didn't (a Must-fix minor from Task
// 3's own deferred review list: "BackLink on the manual door's main state =
// strictly-better exit"). Both now render one via `LogScreen`'s shared
// `backFallback` prop.
describe("LogSession: BackLink exit (IMP-2)", () => {
  it("the session door's main state renders a BackLink falling back to /today (neither of its two real entry points carries a `from` today)", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/today",
    );
  });

  it("the manual door's main, ready-to-save state renders a BackLink falling back to /library", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);

    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/library",
    );
  });
});

describe("LogSession: workoutType sourcing", () => {
  // IMP-3 (whole-branch review): every fixture below overrides `type` away
  // from Hoarfrost's real "O2" — the SAME value `resolveWorkoutType`'s own
  // last-resort fallback returns. Before this fix all three tests expected
  // "O2" throughout, so a `resolveWorkoutType` regressed to a bare
  // `() => "O2"` (ignoring the draft AND the library entirely) would have
  // passed every one of them.
  it("sources workoutType from the library when there is no usable draft, not the last-resort default", async () => {
    const { workout } = buildSessionFixture({ type: "AT" });
    clearDraft(); // simulate a missing draft — the run alone survives.
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Log Hoarfrost" });
    expect(document.querySelector(".type-badge")?.textContent).toBe("AT");
  });

  it("falls back to O2 only when both the draft AND the library lookup fail", async () => {
    // The fixture's own real type is "AT", not "O2" — proves the fallback
    // is genuinely engaged (an "O2" result can't be coming from anywhere
    // else on this path) rather than happening to match a real value.
    buildSessionFixture({ type: "AT" });
    clearDraft();
    mockWorkouts([]); // the workout is gone from the library too.
    await renderLog();
    await screen.findByRole("heading", { name: "Log Hoarfrost" });
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
  });

  it("prefers matchedDraft.type over the library lookup when both exist but disagree", async () => {
    const { workout } = buildSessionFixture({ type: "AT" }); // draft.type is "AT"
    mockWorkouts([{ ...workout, type: "AN" }]); // the library disagrees
    await renderLog();
    await screen.findByRole("heading", { name: "Log Hoarfrost" });
    // Neither "AN" (the library's disagreeing value) nor "O2" (the
    // fallback default) — only a real draft-preference read produces "AT".
    expect(document.querySelector(".type-badge")?.textContent).toBe("AT");
  });
});

async function chooseHeldAndPain() {
  await userEvent.click(screen.getByRole("button", { name: "HELD" }));
  await userEvent.click(screen.getByRole("button", { name: "Pain 2" }));
}

describe("LogSession: save", () => {
  it("POSTs the built steps plus held/pain/notes, clears the draft and run, and navigates to /today", async () => {
    const { run, workout } = buildSessionFixture();
    mockWorkouts([workout]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-1" }), { status: 201 }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    await chooseHeldAndPain();
    await userEvent.type(screen.getByLabelText("NOTES"), "Felt strong.");
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    const [path, init] = apiFn.mock.calls[0]!;
    expect(path).toBe("/api/logs");
    const body = JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      workoutId: run.workoutId,
      workoutTitle: "Hoarfrost",
      workoutType: "O2",
      held: "held",
      pain: 2,
      notes: "Felt strong.",
    });
    expect(Array.isArray(body.steps)).toBe(true);
    expect((body.steps as unknown[]).length).toBe(2);

    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  // IMP-5 (whole-branch review): a wire-shape test, through an actual Save
  // click and the real posted JSON — not just `buildLogSteps`'s own return
  // value (already unit-pinned in logDraft.test.ts) — proving the 5G
  // omission rules survive all the way to the bytes on the wire, not just
  // to an in-memory object a later step might still widen. Real library
  // workouts' own step OBJECTS (Fork Lightning's effort step, Calm Sea's
  // distance step), assembled directly (no reps marker, no wu) — same "real
  // step objects, synthetic combination" idiom `buildSessionFixture`'s own
  // doc comment establishes — with `actuals: {}` so the distance phase reads
  // as a DISCARDED suspect split (no stopwatch reading was ever recorded for
  // it), not a kept one.
  it("posts an effort step with no targetSplit and a discarded distance step with no actualSplit/actualSource — the exact keys, not just their values", async () => {
    const forkLightning = library("Fork Lightning");
    const effortWork = forkLightning.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    const calmSea = library("Calm Sea");
    const distanceWork = calmSea.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    const draft = buildDraft({
      id: "id-wire-shape-fixture",
      title: "Wire Shape Fixture",
      type: "AN",
      steps: [effortWork, distanceWork],
    });
    const started = startDraft(draft);
    saveDraft(started);
    const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 5 * 60 * 1000).toISOString(),
      actuals: {}, // no recorded actual anywhere -> the distance phase reads as discarded.
    };
    saveRun(run);
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-wire-shape" }), {
          status: 201,
        }),
      ),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Log Wire Shape Fixture" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    const steps = body.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(2);

    // Effort step (5G rule): label/spm/seconds only. `targetSplit` would be
    // `estimationSplit`'s internal guess, never a real prescription, and
    // there is no actual to attribute to a target that was never set.
    expect(Object.keys(steps[0]!).sort()).toStrictEqual(
      ["label", "seconds", "spm"].sort(),
    );
    expect(steps[0]).not.toHaveProperty("targetSplit");
    expect(steps[0]).not.toHaveProperty("actualSplit");
    expect(steps[0]).not.toHaveProperty("actualSource");

    // Discarded distance step: `targetSplit`/`spm`/`meters` (the
    // prescription) but neither `actualSplit` nor `actualSource` — absence
    // here is deliberate (a suspect split the rower discarded), not a
    // logged zero.
    expect(steps[1]).not.toHaveProperty("actualSplit");
    expect(steps[1]).not.toHaveProperty("actualSource");
    expect(Object.keys(steps[1]!).sort()).toStrictEqual(
      ["label", "targetSplit", "spm", "meters"].sort(),
    );
  });

  // IMP-1 (whole-branch review): the dead end this fixes is WORST on the
  // session door specifically — before the fix, a completed run whose only
  // qualifying step was a test piece built `steps: []`, Save would have
  // hard-400ed at the server, and the ONLY other control on this screen was
  // the destructive staged Discard (no BackLink existed yet either, see
  // IMP-2). Proves the real fix end to end: a non-empty steps array, and a
  // genuine successful save that clears the records like any other.
  it("IMP-1: a completed run whose only qualifying step is a test piece still saves — no dead end, no empty steps array", async () => {
    const draft = buildDraft({
      id: "id-test-only-session",
      title: "2k Test Day",
      type: "AN",
      steps: [{ k: "test", label: "2k test" }],
    });
    const started = startDraft(draft);
    saveDraft(started);
    const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-test-only-session" }), {
          status: 201,
        }),
      ),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Log 2k Test Day" });
    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("2k test");

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    const body = parsedBodies(apiFn)[0]!;
    expect(body.steps).toStrictEqual([{ label: "2k test" }]);
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  it("sends notes:null when the NOTES field is left blank", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-1" }), { status: 201 }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    expect(parsedBodies(apiFn)[0]!.notes).toBeNull();
  });

  it("keeps the draft and run intact and shows an inline error on a genuine failure — retry stays possible", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Save session" }),
    ).not.toBeDisabled();
  });

  it("treats an unparseable 400 body as 'no field named' — no retry, a genuine failure surfaces", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    // A 400 whose body isn't valid JSON at all — `res.json()` itself
    // rejects, exercising the inner catch that falls back to `field:
    // undefined` (never "workoutId", so no retry fires).
    const apiFn = mockApi(() =>
      Promise.resolve(new Response("not json", { status: 400 })),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
  });

  it("catches a thrown network error and surfaces the same inline failure, records intact", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() => {
      throw new Error("network down");
    });
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
  });

  it("retries once with workoutId:null when the 400 names workoutId specifically, and saves on the retry", async () => {
    const { run, workout } = buildSessionFixture();
    mockWorkouts([workout]);
    let calls = 0;
    const apiFn = mockApi(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "workoutId does not exist",
              field: "workoutId",
            }),
            { status: 400 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: "log-2" }), { status: 201 }),
      );
    });
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[0]!.workoutId).toBe(run.workoutId);
    expect(bodies[1]!.workoutId).toBeNull();
    // IMP-4 (whole-branch review): the retry must be the SAME body with
    // ONLY `workoutId` swapped to `null` — not, say, a body missing
    // `steps`/`held`/`pain`/`notes` because the retry accidentally
    // reconstructed a fresh (and incomplete) payload instead of spreading
    // the original one. `bodies[0]!.workoutId` is real (not null), so this
    // also proves the two bodies genuinely differ on that one field, not
    // that the equality check is vacuous.
    expect(bodies[0]!.workoutId).not.toBeNull();
    expect(bodies[1]).toStrictEqual({ ...bodies[0], workoutId: null });
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  // IMP-4 (whole-branch review): the sibling test above only proves the
  // retry-then-SUCCEED path; this proves retry-then-FAIL still surfaces a
  // genuine error (not a silent swallow) and leaves the draft/run records
  // untouched, the same guarantee every other failure test in this
  // describe block already pins for a first-attempt failure.
  it("surfaces a genuine failure when the workoutId retry ALSO fails, records intact", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    let calls = 0;
    const apiFn = mockApi(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "workoutId does not exist",
              field: "workoutId",
            }),
            { status: 400 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      );
    });
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[1]).toStrictEqual({ ...bodies[0], workoutId: null });
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Save session" }),
    ).not.toBeDisabled();
  });

  it("does not retry when the 400 names a different field — surfaces the failure instead of silently stripping workoutId", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: "pain must be an integer 1..5",
            field: "pain",
          }),
          { status: 400 },
        ),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
  });
});

describe("LogSession: staged discard", () => {
  it("stages a confirm on the first press; Cancel restores the plain button without clearing anything", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
    );
    expect(
      screen.getByRole("button", { name: "Discard session" }),
    ).toBeInTheDocument();
    expect(loadRun()).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("button", { name: "Discard session" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Discard without logging" }),
    ).toBeInTheDocument();
  });

  it("clears both records and navigates to /today only once the staged press is confirmed", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Discard session" }),
    );

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });
});

// Task 3: the manual door (`/library/:id/log`) — logging an off-app row
// straight from a workout's own detail screen ("Log it after"). Its header
// date is real "today" (`new Date()`, computed at render — there's no
// `now` param to inject, unlike the session door's pure `logTotals`), so
// `MANUAL_TOTAL_LABEL` composes the expected header text from the SAME
// `formatLogDate` LogSession.tsx itself calls, applied to the real clock at
// module-load time, rather than a hardcoded date string that would go
// stale (and silently pass for the wrong reason) the next time this suite
// runs. `vi.useFakeTimers()` was tried and reverted: it hangs every
// `userEvent` interaction in this describe block (RTL's async `findBy*`/
// user-event's own internal delays both need real timers to resolve) — not
// worth it for a header line whose wall-clock risk (a run straddling
// midnight) is negligible for a test suite that completes in well under a
// second.
// wu 4' (240s) + Hoarfrost's time work (12' = 720s) + its own restMinutes
// (5' = 300s) + Calm Sea's distance work (10,000m @ 6k+12 = 132 s/500m ->
// 20*132 = 2640s) = 3900s -> 65 MIN exactly.
const MANUAL_TOTAL_LABEL = `${formatLogDate(new Date().toISOString())} · 65 MIN`;

describe("LogSession: the manual door (Task 3)", () => {
  it("shows the title, type badge, TODAY's date + the estimated total, the PACES LOCKED panel (referenced bases only), the per-step list with every actual 'assumed', and EXPECTED N/5 — with no Discard button at all", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);

    expect(
      await screen.findByRole("heading", { name: "Log Hoarfrost" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
    // estimateMinutes over wu(4') + work(12') + auto rest(5') +
    // distance(10000m @ 132s/500m = 2640s) = 3900s -> 65 exactly
    // (verified independently against domain/expand.ts's own
    // estimateMinutes before writing this number in).
    expect(screen.getByText(MANUAL_TOTAL_LABEL)).toBeInTheDocument();

    // Only "6k" renders — neither step references "2k" at all (F1's own
    // "never a bare dash" rule, shared with the session door via the same
    // `pacesLockedText` join).
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "6K 2:00.0",
    );

    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(2);
    // Row 1: Hoarfrost's own time/split step — current baselines resolve
    // the target directly (120 + 12 = 132 -> "2:12.0"), same label idiom
    // the session door's draft-based branch produces for the identical
    // step.
    expect(rows[0]).toHaveTextContent("12:00 @ 6k +12");
    expect(rows[0]).toHaveTextContent("2:12.0");
    // Manual-door actuals are ALWAYS "assumed" (buildManualLogSteps' own
    // rule) — never a second ACTUAL line, unlike a real stopwatch reading.
    expect(rows[0]).not.toHaveTextContent("ACTUAL");
    // Row 2: Calm Sea's own distance/split step (120 + 12 = 132 ->
    // "2:12.0") — also "assumed", also no ACTUAL line.
    expect(rows[1]).toHaveTextContent("10000 m @ 6k +12");
    expect(rows[1]).toHaveTextContent("2:12.0");
    expect(rows[1]).not.toHaveTextContent("ACTUAL");

    // EXPECTED N/5 — Hoarfrost's own `pain` (2), read straight off the
    // fetched `LibraryWorkout`, no fallback chain needed (unlike the
    // session door's `resolveWorkoutType`/`expectedPain`).
    expect(screen.getByText("EXPECTED 2/5")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Save session" })).toBeDisabled();
    // The brief's own words: "no Discard button (nothing to discard)."
    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
  });

  it("shows LOADING… while workouts or baselines are still resolving", async () => {
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    mockBaselines();
    await renderManualLog("w1");

    expect(screen.getByText("LOADING…")).toBeInTheDocument();
  });

  it("shows a retry control when the library fails to load", async () => {
    const retry = vi.fn();
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "error", retry }),
    }));
    mockBaselines();
    await renderManualLog("w1");

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows a retry control when baselines fail to load", async () => {
    mockWorkouts([manualWorkoutFixture()]);
    const retry = vi.fn();
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "error", retry }),
    }));
    await renderManualLog("id-manual-fixture");

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows 'not in your library' with a way back when the route id doesn't resolve", async () => {
    mockWorkouts([]);
    mockBaselines();
    await renderManualLog("missing-id");

    expect(
      await screen.findByText("That workout isn't in your library."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← BACK" })).toBeInTheDocument();
  });

  it("degrades to the no-target/Set baselines idiom instead of crashing when baselines are unset (a stale bookmark)", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    await renderManualLog(workout.id);

    expect(
      await screen.findByRole("heading", { name: "Log Hoarfrost" }),
    ).toBeInTheDocument();
    expect(screen.getByText("no target")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /set baselines/i }),
    ).toHaveAttribute("href", "/you");
    // Nothing to save against — no form at all in this degraded state.
    expect(
      screen.queryByRole("button", { name: "Save session" }),
    ).not.toBeInTheDocument();
  });

  it("POSTs workoutId/title/type straight from the fetched workout plus held/pain/notes, and navigates to /today", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-manual-1" }), { status: 201 }),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);

    await chooseHeldAndPain();
    await userEvent.type(
      screen.getByLabelText("NOTES"),
      "Rowed it on the erg at home.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    const body = parsedBodies(apiFn)[0]!;
    expect(body).toMatchObject({
      workoutId: workout.id,
      workoutTitle: "Hoarfrost",
      workoutType: "O2",
      held: "held",
      pain: 2,
      notes: "Rowed it on the erg at home.",
    });
    expect(Array.isArray(body.steps)).toBe(true);
    expect((body.steps as unknown[]).length).toBe(2);
  });

  // Must-fix minor (whole-branch review): a browser BACK press after a
  // successful save used to re-mount this exact route with a fresh, still-
  // fillable form (this door touches no draft/run records to clear, unlike
  // the session door) — a second Save click would post a genuine duplicate
  // log and advance `doneN` a second time for the same real session. The
  // fix (`navigate("/today", { replace: true })`) swaps this history entry
  // out instead of pushing a new one, so BACK from `/today` lands on
  // whatever came before this screen instead of remounting it.
  it("a browser BACK press after a successful save lands on the prior screen, not a re-submittable form (replace-navigation)", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-manual-back" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLogWithHistory(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole("button", { name: "SIMULATE BROWSER BACK" }),
    );

    // Lands on the workout's own detail screen (what was ACTUALLY beneath
    // the log route in history) — not the log form again. Without
    // `replace: true`, this would instead re-show "Log Hoarfrost" with an
    // empty, clickable "Save session" button.
    expect(
      await screen.findByText("WORKOUT DETAIL SCREEN"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Log Hoarfrost" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save session" }),
    ).not.toBeInTheDocument();
    // Still exactly one POST — a second Save was never even reachable.
    expect(apiFn).toHaveBeenCalledTimes(1);
  });

  // THE hard constraint (task brief's own words): "must NOT touch the
  // draft/run records — an in-progress session elsewhere survives logging
  // an off-app row." Seeds a REAL completed-but-unlogged run (the same
  // fixture the session-door describe block above uses) for a DIFFERENT
  // workout than the one this test logs manually, then proves both storage
  // keys come out BYTE-IDENTICAL (raw string equality, not just deep-equal)
  // — not merely "still present," which a buggy re-serialize-and-rewrite
  // could satisfy while still being a real (silent) mutation.
  it("leaves an unrelated live run/draft byte-identical in storage after a manual log saves", async () => {
    buildSessionFixture();
    const draftBefore = localStorage.getItem(DRAFT_KEY);
    const runBefore = localStorage.getItem(RUN_KEY);
    expect(draftBefore).not.toBeNull();
    expect(runBefore).not.toBeNull();

    const workout = manualWorkoutFixture("id-manual-other");
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-manual-2" }), { status: 201 }),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(draftBefore);
    expect(localStorage.getItem(RUN_KEY)).toBe(runBefore);
  });

  it("keeps the form intact and shows an inline error on a genuine save failure — retry stays possible", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Save session" }),
    ).not.toBeDisabled();
  });

  // IMP-1 (whole-branch review): the dead end this fixes, proved at the full
  // component level (not just `buildManualLogSteps`' own unit tests in
  // logDraft.test.ts) — before the fix, a workout authored with a test step
  // as its ONLY qualifying step built `steps: []` here, and Save would have
  // hard-400ed at the server ("steps must be a non-empty array") with
  // nothing on this door to recover with (the manual door has no Discard at
  // all, per the brief). Proves both the non-empty step list AND a genuine
  // successful save.
  it("IMP-1: a workout whose only qualifying step is a test piece still saves — no dead end, no empty steps array", async () => {
    const workout: LibraryWorkout = {
      id: "id-test-only-manual",
      title: "2k Test Day",
      type: "AN",
      difficulty: "hard",
      pain: 4,
      steps: [
        { k: "wu", minutes: 5 },
        { k: "test", label: "2k test" },
      ],
      isGlobal: true,
      lastDoneDaysAgo: null,
    };
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-test-only" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Log 2k Test Day" });
    // The wu never becomes a row; the test step does, as a bare label.
    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("2k test");

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    const body = parsedBodies(apiFn)[0]!;
    // The exact shape that used to hard-400: now a real, non-empty array.
    expect(body.steps).toStrictEqual([{ label: "2k test" }]);
  });

  it("retries once with workoutId:null when the 400 names workoutId specifically, and saves on the retry", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    let calls = 0;
    const apiFn = mockApi(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "workoutId does not exist",
              field: "workoutId",
            }),
            { status: 400 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: "log-manual-3" }), { status: 201 }),
      );
    });
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[0]!.workoutId).toBe(workout.id);
    expect(bodies[1]!.workoutId).toBeNull();
    // IMP-4 (whole-branch review): the SAME full-body-minus-workoutId
    // assertion the session door's own retry test now carries — the shared
    // `useLogForm` retry policy (`LogSession.tsx`) must behave identically
    // on both doors.
    expect(bodies[1]).toStrictEqual({ ...bodies[0], workoutId: null });
  });

  it("does not retry when the 400 names a different field — surfaces the failure instead of silently stripping workoutId", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: "pain must be an integer 1..5",
            field: "pain",
          }),
          { status: 400 },
        ),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
  });

  it("treats an unparseable 400 body as 'no field named' — no retry, a genuine failure surfaces", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    // A 400 whose body isn't valid JSON at all — `res.json()` itself
    // rejects, exercising the inner catch that falls back to `field:
    // undefined` (never "workoutId", so no retry fires) — same edge case
    // the session door's own identical test covers.
    const apiFn = mockApi(() =>
      Promise.resolve(new Response("not json", { status: 400 })),
    );
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
  });

  it("catches a thrown network error and surfaces the same inline failure", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() => {
      throw new Error("network down");
    });
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
  });

  // Boundary case for `manualLockedBaseline`'s own `base === "2k"` branch:
  // every other manual-door test's fixture references "6k" only, which
  // would pass vacuously even if that branch silently returned k6Seconds
  // for BOTH bases (a real bug the ternary's structure makes easy to get
  // wrong). A workout referencing both bases at once, each off=0, is the
  // same shape the session door's own "shows both PACES LOCKED bases" test
  // uses, adapted to a `LibraryWorkout` (no draft/run needed here at all).
  it("resolves each PACES LOCKED base from its OWN matching baseline when a workout references both", async () => {
    const workout: LibraryWorkout = {
      id: "id-manual-both-bases",
      title: "Manual Both Bases",
      type: "AT",
      difficulty: "medium",
      pain: 3,
      steps: [
        { k: "wu", minutes: 4 },
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "2k", off: 0 },
        },
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "6k", off: 0 },
        },
      ],
      isGlobal: true,
      lastDoneDaysAgo: null,
    };
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);

    await screen.findByRole("heading", { name: "Log Manual Both Bases" });
    // BASELINES.k2Seconds (100) -> "1:40.0"; BASELINES.k6Seconds (120) ->
    // "2:00.0" — each read straight off its OWN base, off=0 on each.
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "2K 1:40.0 · 6K 2:00.0",
    );
  });
});

// Task 3 (outside-plan logging): both doors share `useLogForm`'s
// `outsidePlan` state and `LogScreen`'s own toggle markup verbatim (see
// LogSession.tsx's own header comments on why the toggle lives in the
// shared hook rather than per-door) — this describe block proves the
// SAME battery of cases against both, rather than duplicating each case
// twice with only the render helper swapped.
describe("LogSession: outside-plan toggle (Task 3)", () => {
  it("renders no toggle at all when there's no active plan (this file's own default mockPlan())", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    expect(
      screen.queryByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /OUTSIDE THE PLAN/ }),
    ).not.toBeInTheDocument();
  });

  it("manual door: renders no toggle at all when there's no active plan", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);

    expect(
      screen.queryByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    ).not.toBeInTheDocument();
  });

  // Fix round 2 (whole-branch review, M1/M2): both doors used to OR
  // `planState.state === "loading"` into their pre-existing loading gate,
  // which parked the whole form at LOADING… — with no Retry and no
  // BackLink — for as long as (or forever, if `/api/plan` stalled) the
  // plan fetch took. The fix removes `planState` from the gate entirely:
  // the form renders regardless of plan state, and the toggle itself
  // appears only once the plan resolves with an active plan. These two
  // tests replace the old "holds at LOADING…" pair, pinning the NEW
  // behaviour instead: a still-loading plan renders the form immediately,
  // with no toggle, and Save posts with no `advancesPlan` key — the same
  // observable shape as "no active plan" or "plan hook errored" (see the
  // plan-hook-error tests below, unchanged).
  it("session door: renders the form immediately while the plan is still loading, with no toggle, and Save posts no advancesPlan key", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    mockPlan({ state: "loading" });
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-plan-still-loading" }), {
          status: 201,
        }),
      ),
    );
    await renderLog();

    await screen.findByText("AUG 1 · 30 MIN");
    expect(
      screen.queryByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /OUTSIDE THE PLAN/ }),
    ).not.toBeInTheDocument();

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body).not.toHaveProperty("advancesPlan");
  });

  it("manual door: renders the form immediately while the plan is still loading, with no toggle, and Save posts no advancesPlan key", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    mockPlan({ state: "loading" });
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-manual-plan-still-loading" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(workout.id);

    await screen.findByText(MANUAL_TOTAL_LABEL);
    expect(
      screen.queryByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    ).not.toBeInTheDocument();

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body).not.toHaveProperty("advancesPlan");
  });

  it("renders the default COUNTS TOWARD PLAN copy, sourced from doneN/sequence.length, when a plan is active", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    const toggle = screen.getByRole("button", {
      name: "COUNTS TOWARD PLAN · SESSION 4 OF 84",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("tapping the toggle flips it to OUTSIDE THE PLAN — won't advance, and back again", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    const toggle = screen.getByRole("button", {
      name: "COUNTS TOWARD PLAN · SESSION 4 OF 84",
    });
    await userEvent.click(toggle);
    const toggled = screen.getByRole("button", {
      name: "OUTSIDE THE PLAN — won't advance",
    });
    expect(toggled).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(toggled);
    expect(
      screen.getByRole("button", {
        name: "COUNTS TOWARD PLAN · SESSION 4 OF 84",
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  // Wire-shape: proves the ABSENT key on the default/counting path, not
  // merely `advancesPlan: true` — the 6C wire-shape idiom this file's own
  // "posts an effort step..." test established, applied to the new field.
  it("wire shape: leaving the toggle untouched posts NO advancesPlan key at all", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-plan-default" }), {
          status: 201,
        }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body).not.toHaveProperty("advancesPlan");
  });

  it("wire shape: toggling OFF posts advancesPlan: false", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-plan-outside" }), {
          status: 201,
        }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await userEvent.click(
      screen.getByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    );
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body.advancesPlan).toBe(false);
  });

  // Fix round 2 (whole-branch review, L3): the workoutId-retry policy
  // (`useLogForm`'s `submit`, `LogSession.tsx`) rebuilds the retry body by
  // SPREADING the original body with only `workoutId` overridden — this
  // pins that `advancesPlan: false` survives that spread untouched, the
  // same way the sibling "retries once with workoutId:null" test above
  // pins `steps`/`held`/`pain`/`notes` surviving it. Nothing before this
  // test exercised the retry path with the toggle on: a future refactor
  // that rebuilt the retry body from `fields` instead of spreading `body`
  // would silently convert an outside-plan retry into a plan-advancing
  // log, and this is the only test that would catch it.
  it("outside-plan toggle survives the workoutId retry: the retry body still carries advancesPlan: false", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { run, workout } = buildSessionFixture();
    mockWorkouts([workout]);
    let calls = 0;
    const apiFn = mockApi(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "workoutId does not exist",
              field: "workoutId",
            }),
            { status: 400 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: "log-retry-outside" }), {
          status: 201,
        }),
      );
    });
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await userEvent.click(
      screen.getByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    );
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[0]!.workoutId).toBe(run.workoutId);
    expect(bodies[0]!.advancesPlan).toBe(false);
    expect(bodies[1]!.workoutId).toBeNull();
    expect(bodies[1]!.advancesPlan).toBe(false);
    expect(bodies[1]).toStrictEqual({ ...bodies[0], workoutId: null });
  });

  // Fix round 1 (M1): this used to be ONE test titled "untouched posts no
  // key, toggled posts advancesPlan: false" whose body only ever clicked
  // the toggle and exercised the toggled-off arm — the "untouched posts no
  // key" half of the title was never actually asserted. Split into the
  // same two-test shape as the session door's own pair above, each test
  // now asserting exactly what its own title promises. The absent-key
  // assertion uses the same `.not.toHaveProperty` idiom the session door's
  // "leaving the toggle untouched" test already uses above — a real
  // property-existence check on the parsed wire body, not a truthiness
  // check on `body.advancesPlan` (which would also pass for an explicit
  // `false`).
  it("manual door wire shape: leaving the toggle untouched posts NO advancesPlan key at all", async () => {
    mockPlan(readyPlanState(activePlan()));
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-manual-plan-default" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body).not.toHaveProperty("advancesPlan");
  });

  it("manual door wire shape: toggling OFF posts advancesPlan: false", async () => {
    mockPlan(readyPlanState(activePlan()));
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-manual-plan-outside" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await userEvent.click(
      screen.getByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    );
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body.advancesPlan).toBe(false);
  });

  // Logging must never be hostage to the plan fetch (LogSession.tsx's own
  // comment on this): an errored plan hook degrades to "no toggle, no key"
  // — the SAME observable shape as "no active plan" — rather than blocking
  // Save or crashing on an undefined `plan`.
  it("plan-hook error: no toggle renders, and Save still succeeds with no advancesPlan key", async () => {
    mockPlan({ state: "error", retry: vi.fn() });
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-plan-error" }), {
          status: 201,
        }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    expect(
      screen.queryByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /OUTSIDE THE PLAN/ }),
    ).not.toBeInTheDocument();

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body).not.toHaveProperty("advancesPlan");
  });

  it("manual door: plan-hook error renders no toggle either", async () => {
    mockPlan({ state: "error", retry: vi.fn() });
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);

    expect(
      screen.queryByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    ).not.toBeInTheDocument();
  });

  // The toggle is part of `useLogForm`'s own state quintet lifecycle (see
  // its header comment) — a failed save must not silently reset it, the
  // same guarantee held/pain/notes already had before this task.
  it("a failed save keeps the toggle in its OUTSIDE THE PLAN state", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "server exploded" }), {
          status: 500,
        }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await userEvent.click(
      screen.getByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    );
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "OUTSIDE THE PLAN — won't advance" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("manual door: a failed save keeps the toggle in its OUTSIDE THE PLAN state", async () => {
    mockPlan(readyPlanState(activePlan()));
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "server exploded" }), {
          status: 500,
        }),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);
    await userEvent.click(
      screen.getByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    );
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "OUTSIDE THE PLAN — won't advance" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
