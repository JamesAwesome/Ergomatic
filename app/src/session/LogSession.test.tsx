import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import type { Step, WorkoutType } from "../../domain/types.js";
import { compileProgram } from "../../domain/monitor/program.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
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
import { buildLogSeed, formatLogDate } from "./logDraft";
import { loadRun, RUN_KEY, saveRun, type SessionRun } from "./run";
import {
  loadMonitorRun,
  saveMonitorRun,
  type MonitorRun,
} from "../monitor/monitorRun";
// Pure function (task brief: "export the pure helper ... for tests") — a
// static top-level import is safe here (unlike every other `./LogSession`
// reference in this file, which goes through a per-test dynamic `import()`
// because the DEFAULT export's hooks need whatever `vi.doMock` a given test
// registered first): `monitorModeRun` touches no hook, no mocked module,
// nothing `vi.resetModules()` below would ever need to invalidate.
import { monitorModeRun } from "./LogSession";

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
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
 *  deliberately dropped. Phases: 0 work (time, 6k+12), 1
 *  rest (5'), 2 work (distance, 6k+12) — the LAST phase gets a real
 *  recorded (stopwatch) actual; the time phase never does (the engine only
 *  ever records one for a distance phase), so this fixture covers BOTH of
 *  `buildLogSteps`' actual rules in one run. Under the post-workout-summary
 *  model (Task 4/5): the time phase's "assumed" actual is NOT a stopwatch
 *  reading, so it renders as a PRESCRIBED (unmeasured) row; the distance
 *  phase's real stopwatch reading renders MEASURED — but since it's the
 *  ONLY measured row, `avgSplit.count === 1` and review finding 5 (a lone
 *  measured row is never judged) means it carries no deviation bar either. */
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
    steps: [timeWork, distanceWork],
  });
  const started = startDraft(draft);
  saveDraft(started);
  const built = buildRun(started, BASELINES, FIXED_NOW);
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

// Phase 6I: the real "First 6k" seed workout (server/seed/library/
// onboarding.ts) — effort ref, no baselines needed (domain/needsBaselines.ts)
// — driven through the same buildDraft/startDraft/buildRun/saveRun pipeline
// as `buildSessionFixture` above, `null` baselines rather than a real pair
// since this workout needs none.
function buildOnboardingSessionFixture(): {
  run: SessionRun;
  workout: LibraryWorkout;
} {
  const seed = ONBOARDING_LIBRARY_WORKOUTS.find((w) => w.title === "First 6k")!;
  const draft = buildDraft({
    id: "id-first6k-fixture",
    title: seed.title,
    type: seed.type,
    steps: seed.steps,
  });
  const started = startDraft(draft);
  saveDraft(started);
  const built = buildRun(started, null, FIXED_NOW);
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt: new Date(FIXED_NOW.getTime() + 25 * 60 * 1000).toISOString(),
    actuals: {
      1: { elapsedSeconds: 1500, splitSeconds: 125, actualSource: "stopwatch" },
    },
  };
  saveRun(run);
  const workout: LibraryWorkout = {
    id: "id-first6k-fixture",
    title: seed.title,
    type: seed.type,
    difficulty: seed.difficulty,
    pain: seed.pain,
    steps: started.steps,
    isGlobal: true,
    lastDoneDaysAgo: null,
  };
  return { run, workout };
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
// tests that override the plan state — registered ONCE at module load time,
// closing over a mutable ref, rather than re-registered per test (proved
// flaky under a heavily parallel coverage run).
let planStateRef: PlanState = readyPlanState(NO_PLAN);
vi.doMock("../api/usePlan", () => ({ usePlan: () => planStateRef }));

function mockPlan(state: PlanState = readyPlanState(NO_PLAN)) {
  planStateRef = state;
}

// `choose`/`reset` are never exercised by anything in this file (the summary
// only ever READS `usePlan()`'s data) — `vi.fn()` stubs satisfy `PlanState`'s
// own ready-state shape (usePlan.ts) without implying either function is
// under test here.
function readyPlanState(plan: PlanData): PlanState {
  return { state: "ready", plan, choose: vi.fn(), reset: vi.fn() };
}

// A minimal but real-shaped active plan — `sequence` entries mirror the
// server's own `planResponse` shape (routes/data.ts), not a hand-built
// minimum missing fields the save button's own position text actually
// reads (`doneN`, `sequence.length`).
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
// here rather than a hand-built minimum. Unlike `buildSessionFixture`,
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
    steps: [timeWork, distanceWork],
    isGlobal: true,
    lastDoneDaysAgo: 2,
  };
}

// Same guard `logDraft.test.ts`'s own `compileOrThrow` uses for its
// `buildMonitorLogSteps` fixtures — `compileProgram` returns a
// discriminated union (a real `WorkoutProgram` or a `CompileError`), and a
// test fixture that fails to compile should say so loudly, not produce a
// `WorkoutProgram`-shaped `undefined` some assertion three lines down would
// blame on the wrong thing.
function compileOrThrow(
  phases: Parameters<typeof compileProgram>[0],
): WorkoutProgram {
  const result = compileProgram(phases);
  if ("code" in result) {
    throw new Error(
      `test fixture failed to compile (${result.code}): ${result.message}`,
    );
  }
  return result;
}

const MONITOR_WORKOUT_ID = "id-monitor-fixture";

// The 7C monitor-mode fixture — the SAME two real library steps
// (`buildSessionFixture`/`manualWorkoutFixture`'s own Hoarfrost time-work +
// Calm Sea distance-work) run through the REAL `buildDraft -> buildRun ->
// compileProgram -> buildLogSeed` pipeline. Program intervals: [0] warmup,
// [1] work (time, Hoarfrost), [2] work (distance, Calm Sea) —
// `IntervalActual.index` below is a position in THAT array, so a "both
// measured" actuals list uses index 1 and 2, never 0.
function buildMonitorFixture(
  overrides: { actuals?: IntervalActual[]; deviceName?: string } = {},
): { run: MonitorRun; workout: LibraryWorkout } {
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
  const draft = buildDraft({
    id: MONITOR_WORKOUT_ID,
    title: hoarfrost.title,
    type: hoarfrost.type as WorkoutType,
    steps: [timeWork, distanceWork],
  });
  const started = startDraft(draft);
  const built = buildRun(started, BASELINES, FIXED_NOW, {
    kind: "time",
    minutes: 4,
  });
  const program = compileOrThrow(built.phases);
  const logSeed = buildLogSeed(built.phases, BASELINES);
  const completedAt = new Date(
    FIXED_NOW.getTime() + 20 * 60 * 1000,
  ).toISOString();
  // Both intervals measured by default (the "ALL 2" case) — deliberately
  // NOT equal to their own targets (132s both) so a measured pace is
  // genuinely new information, not a repeat of the target.
  const defaultActuals: IntervalActual[] = [
    {
      index: 1,
      elapsedSeconds: 705,
      distanceMeters: 2000,
      avgSplit: 140,
      avgSpm: 24,
      avgHeartRateBpm: 138,
      restDistanceMeters: 0,
    },
    {
      index: 2,
      elapsedSeconds: 2500,
      distanceMeters: 10000,
      avgSplit: 125,
      avgSpm: 26,
      avgHeartRateBpm: 150,
      restDistanceMeters: 0,
    },
  ];
  const run: MonitorRun = {
    v: 2,
    workoutId: MONITOR_WORKOUT_ID,
    title: hoarfrost.title,
    program,
    logSeed,
    actuals: overrides.actuals ?? defaultActuals,
    // Real hardware's own BLE advertising name, "Row" suffix and all
    // (Concept2's own naming, verbatim).
    deviceName: overrides.deviceName ?? "PM5 432331249 Row",
    startedAt: FIXED_NOW.toISOString(),
    completedAt,
    terminated: false,
  };
  const workout: LibraryWorkout = {
    id: MONITOR_WORKOUT_ID,
    title: hoarfrost.title,
    type: hoarfrost.type as WorkoutType,
    difficulty: hoarfrost.difficulty,
    pain: hoarfrost.pain,
    steps: started.steps,
    isGlobal: true,
    lastDoneDaysAgo: 2,
  };
  return { run, workout };
}

// Phase 6I close-out fold: the real "First 6k" seed workout — an
// effort-only workout (`needsBaselines()` reads false), unlike
// `manualWorkoutFixture()`'s split-ref mix above.
function onboardingManualWorkoutFixture(
  id = "id-first6k-manual",
): LibraryWorkout {
  const seed = ONBOARDING_LIBRARY_WORKOUTS.find((w) => w.title === "First 6k")!;
  return {
    id,
    title: seed.title,
    type: seed.type,
    difficulty: seed.difficulty,
    pain: seed.pain,
    steps: seed.steps,
    isGlobal: true,
    lastDoneDaysAgo: null,
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
// export reads via `useParams`. 7C: `search` (default "") appends a query
// string — `?from=monitor` is how a real connected session's own hand-off
// (`WorkoutDetail.tsx`'s `handleConnectedEnded`) reaches this exact route.
async function renderManualLog(workoutId: string, search = "") {
  const { default: LogSession } = await import("./LogSession");
  return render(
    <MemoryRouter initialEntries={[`/library/${workoutId}/log${search}`]}>
      <Routes>
        <Route path="/library/:id/log" element={<LogSession />} />
        <Route path="/library/:id" element={<p>WORKOUT DETAIL SCREEN</p>} />
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
  // keeps every plan-agnostic test in this file passing unmodified.
  mockPlan();
});

async function chooseHeldAndPain() {
  await userEvent.click(screen.getByRole("button", { name: "HELD" }));
  await userEvent.click(screen.getByRole("button", { name: "Pain 2" }));
}

// The default (no active plan) save button — §2F: "No plan: Log against
// plan hidden (not disabled); Save without logging leads." Every save/
// discard-mechanics test in this file runs under the default `mockPlan()`
// (no active plan) unless it explicitly calls `mockPlan(readyPlanState(...))`
// itself, so this is the button those tests click.
const SAVE_BUTTON = "Save without logging";

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
  it("shows the title (no 'Log' prefix), the date · time · TIMER meta, the PACES OFF caption, the row list, and EXPECTED N/5", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();

    expect(
      await screen.findByRole("heading", { name: "Hoarfrost" }),
    ).toBeInTheDocument();
    // dateLabel from completedAt (FIXED_NOW + 30 min -> "AUG 1"); timeLabel
    // is device-locale-dependent (§2A), so only its SHAPE is pinned here —
    // the exact clock reading is Task 4's own `summaryModel.test.ts` concern.
    expect(
      screen.getByText(/^AUG 1 · \d{1,2}:\d{2} · TIMER$/),
    ).toBeInTheDocument();

    // PACES OFF (F1: only the bases actually referenced render — no step in
    // this fixture references "2k" at all, both work steps are 6k-based).
    // The 6k value is recovered EXACTLY from the time phase's own frozen
    // targetSplit (132 - 12 - 0 = 120, BASELINES.k6Seconds itself).
    expect(screen.getByText("PACES OFF 6K 2:00.0")).toBeInTheDocument();

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(2);
    // Row 1: the time/split step never records an actual (the engine only
    // ever records one for a DISTANCE phase) — renders PRESCRIBED: duration,
    // target split, and the ref chip in the offset slot.
    expect(within(rows[0]!).getByText("12:00")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("2:12.0")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("6k +12")).toBeInTheDocument();
    // Row 2: the distance/split step's real stopwatch actual (125.0s/500m)
    // renders MEASURED — elapsed 2500s -> "41:40", pace "2:05.0". It is the
    // ONLY measured row, so review finding 5 (a lone measured row is never
    // judged) means no deviation bar/number renders for it either.
    expect(within(rows[1]!).getByText("41:40")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("2:05.0")).toBeInTheDocument();

    // EXPECTED N/5 — Hoarfrost's own `pain` (2), sourced via useWorkouts by
    // run.workoutId, not the rower's own (still-unset) selection.
    expect(screen.getByText("EXPECTED 2/5")).toBeInTheDocument();

    // Nothing pre-selected; Save is enabled anyway — post-workout-summary
    // spec (2026-08-17), §3: the redesigned reflection card makes every
    // answer optional, so Save is never gated on HELD/PAIN being chosen.
    expect(screen.getByRole("button", { name: "HELD" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON }),
    ).not.toBeDisabled();
  });

  // Post-workout-summary spec (2026-08-17), §3 ruling: Save is never
  // disabled by an empty reflection. Choosing HELD/PAIN is still fully
  // possible; it just no longer gates Save. Clicking the SELECTED option a
  // second time now CLEARS it (§2D: every reflection control clearable).
  it("Save stays enabled throughout, whether or not Held and Pain are chosen, and each is independently clearable", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const save = screen.getByRole("button", { name: SAVE_BUTTON });
    expect(save).not.toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "UNDER · FASTER" }),
    );
    expect(save).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Pain 3" }));
    expect(save).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "UNDER · FASTER" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pain 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Clearable: tapping the SAME selected option again returns to null.
    await userEvent.click(
      screen.getByRole("button", { name: "UNDER · FASTER" }),
    );
    expect(
      screen.getByRole("button", { name: "UNDER · FASTER" }),
    ).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Pain 3" }));
    expect(screen.getByRole("button", { name: "Pain 3" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows both bases in the PACES OFF caption when both are derivable (a 2k off=0 and a 6k off=0 step)", async () => {
    const draft = buildDraft({
      id: "id-both-bases",
      title: "Both Bases",
      type: "AT",
      steps: [
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
    const built = buildRun(started, BASELINES, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 6 * 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Both Bases" });
    // BASELINES.k2Seconds (100) -> "1:40.0"; BASELINES.k6Seconds (120) ->
    // "2:00.0" — both recovered exactly, off=0 on each.
    expect(
      screen.getByText("PACES OFF 2K 1:40.0 · 6K 2:00.0"),
    ).toBeInTheDocument();
  });

  it("recovers the exact baseline even when the step carries a nudge — the nudge is folded into the per-step target/label, not into the recovered baseline", async () => {
    const base = buildDraft({
      id: "id-nudged",
      title: "Nudged",
      type: "AT",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    // +5s nudge on the work step (index 0).
    const nudged = withNudge(base, 0, 5);
    const started = startDraft(nudged);
    saveDraft(started);
    const built = buildRun(started, BASELINES, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 3 * 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Nudged" });
    const row = document.querySelector(".summary-row")!;
    // targetSplit = 120 (baseline) + 0 (off) + 5 (nudge) = 125 -> the
    // prescribed row's own target column shows the NUDGED number.
    expect(within(row as HTMLElement).getByText("2:05.0")).toBeInTheDocument();
    // F2: the label folds the nudge into its own offset ("6k +5", not the
    // raw authored "6k") — shown in the row's offset slot.
    expect(within(row as HTMLElement).getByText("6k +5")).toBeInTheDocument();
    // PACES OFF recovers the TRUE baseline (120), not the nudged split.
    expect(screen.getByText("PACES OFF 6K 2:00.0")).toBeInTheDocument();
  });

  it("renders an empty target cell for an effort step (5G rule: an effort phase's frozen number is an estimate, never a real target) — the trailing dash still shows", async () => {
    const forkLightning = library("Fork Lightning");
    const effortWork = forkLightning.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    const draft = buildDraft({
      id: "id-fork-lightning-fixture",
      title: forkLightning.title,
      type: forkLightning.type as WorkoutType,
      steps: [effortWork],
    });
    const started = startDraft(draft);
    saveDraft(started);
    const built = buildRun(started, BASELINES, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 5 * 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Fork Lightning" });
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("MAX")).toBeInTheDocument();
    expect(rows[0]!.querySelector(".summary-row-target")?.textContent).toBe("");
    expect(rows[0]!.querySelector(".summary-row-dash")?.textContent).toBe("—");
    // F1: an all-effort workout references neither base at all — the whole
    // PACES OFF caption is omitted, not a doubly-dashed one.
    expect(screen.queryByText(/PACES OFF/)).not.toBeInTheDocument();
  });

  it("a null run.workoutId (a malformed/legacy record) skips the library lookup and falls back honestly, with no EXPECTED line", async () => {
    const { run } = buildSessionFixture();
    saveRun({ ...run, workoutId: null });
    clearDraft();
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(screen.queryByText(/EXPECTED/)).not.toBeInTheDocument();
  });

  it("shows LOADING… when there is no matched draft and workouts are still resolving", async () => {
    buildSessionFixture({ type: "AT" });
    clearDraft();
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    await renderLog();

    expect(await screen.findByText("LOADING…")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Hoarfrost" }),
    ).not.toBeInTheDocument();
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

    expect(
      await screen.findByRole("heading", { name: "Hoarfrost" }),
    ).toBeInTheDocument();
  });
});

// The ledger residual routed to this task (Task 1's progress.md): a
// same-shaped but FOREIGN draft (a real SessionDraft, just for a different
// workoutId) must not be trusted for step labels, the PACES OFF
// reconstruction, or the workoutType fallback — all three read `run` and
// `draft`'s matching `workoutId` as one gate (`matchedDraft`).
describe("LogSession: the ledger residual (workoutId mismatch)", () => {
  it("ignores a foreign draft — fallback labels render and the PACES OFF caption is omitted entirely (F1: no bare dash)", async () => {
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
    await screen.findByRole("heading", { name: "Hoarfrost" });

    // Neither base is recoverable without a matching draft — F1: the whole
    // caption is omitted, not a dashed "PACES OFF 2K — · 6K —".
    expect(screen.queryByText(/PACES OFF/)).not.toBeInTheDocument();

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(2);
    // Fallback label: `matchedDraft` gates on `workoutId`, so `draftStep`
    // resolves to `undefined` for this mismatched draft — but `phase.ref`
    // is still present on a run built through the normal `buildRun` path,
    // so the fallback reconstructs the SAME chip the preferred path would
    // have: "6k +12" for both rows. Row 0 (prescribed) shows it as visible
    // text in its own offset cell; row 1 (measured — Calm Sea's real
    // stopwatch actual) has no offset cell at all (§2E's measured-row
    // geometry), so its own accessible name is what carries the label.
    expect(within(rows[0]!).getByText("6k +12")).toBeInTheDocument();
    expect(rows[1]!.getAttribute("aria-label")).toContain("6k +12");
  });
});

describe("LogSession: the monitor log's quiet door (7B iteration)", () => {
  it("absent entirely when no rowed stash exists — the manual path never sees it", async () => {
    sessionStorage.removeItem("ergomatic:last-rowed-log");
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(document.querySelector(".log-monitor-diag")).toBeNull();
  });

  it("with a stash: one mono line, and tapping it copies the stash byte-for-byte", async () => {
    const stash = JSON.stringify([{ seq: 0, kind: "write", detail: "f1" }]);
    sessionStorage.setItem("ergomatic:last-rowed-log", stash);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const row = screen.getByRole("button", { name: "MONITOR LOG · COPY" });
    await userEvent.click(row);

    expect(writeText).toHaveBeenCalledWith(stash);
    expect(
      await screen.findByRole("button", { name: "MONITOR LOG · COPIED" }),
    ).toBeInTheDocument();
    sessionStorage.removeItem("ergomatic:last-rowed-log");
  });
});

// The recording's quiet door (walk-2026-08-16 close-out). The walk proved
// the in-session sheet's Download button is UNREACHABLE at the moment a
// rower actually wants it: the finish auto-navigates here (now the summary,
// not SessionComplete), the sheet dies with the session, and James fell
// back to a console call that silently dropped the header's program. The
// seam itself survives navigation (latest-session-wins), so THIS screen —
// where the operator already lands — gets a sibling of the monitor log's
// own quiet door.
describe("LogSession: the recording's quiet door (walk-2026-08-16 close-out)", () => {
  afterEach(() => {
    delete (window as { __pm5Recording__?: unknown }).__pm5Recording__;
  });

  it("absent entirely when no recording seam exists — production and the manual path never see it", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.queryByRole("button", { name: "RECORDING · DOWNLOAD" }),
    ).toBeNull();
  });

  it("with the seam: tapping it invokes the seam's own download and reports the save", async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    (
      window as {
        __pm5Recording__?: {
          lines(): string[];
          eventCount(): number;
          download(): Promise<void>;
        };
      }
    ).__pm5Recording__ = {
      lines: () => [],
      eventCount: () => 0,
      download,
    };
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const row = screen.getByRole("button", { name: "RECORDING · DOWNLOAD" });
    await userEvent.click(row);

    expect(download).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "RECORDING · DOWNLOADED" }),
    ).toBeInTheDocument();
  });
});

// IMP-2 (whole-branch review): before this fix, the session door had NO
// non-destructive way to leave this screen at all. Post-workout-summary
// spec §2A: the label changes from `← BACK` to `← DONE`, and every door's
// fallback is now uniformly `/today` (a spec-driven change from the old
// per-door fallback — the manual door used to fall back to `/library`).
describe("LogSession: BackLink exit (IMP-2, relabeled ← DONE by §2A)", () => {
  it("the session door falls back to /today", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(screen.getByRole("link", { name: "← DONE" })).toHaveAttribute(
      "href",
      "/today",
    );
  });

  it("the manual door's main, ready-to-save state also falls back to /today (§2A's uniform fallback)", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(screen.getByRole("link", { name: "← DONE" })).toHaveAttribute(
      "href",
      "/today",
    );
  });
});

describe("LogSession: workoutType sourcing", () => {
  // IMP-3 (whole-branch review): every fixture below overrides `type` away
  // from Hoarfrost's real "O2" — the SAME value `resolveWorkoutType`'s own
  // last-resort fallback returns. The summary no longer renders a visible
  // type badge (dropped per the post-workout-summary spec's §2A table,
  // which names no such element) — the only observable surface left is the
  // POSTed wire body, so these tests save and inspect it.
  it("sources workoutType from the library when there is no usable draft, not the last-resort default", async () => {
    const { workout } = buildSessionFixture({ type: "AT" });
    clearDraft(); // simulate a missing draft — the run alone survives.
    mockWorkouts([workout]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-1" }), { status: 201 }),
      ),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");
    expect(parsedBodies(apiFn)[0]!.workoutType).toBe("AT");
  });

  it("falls back to O2 only when both the draft AND the library lookup fail", async () => {
    buildSessionFixture({ type: "AT" });
    clearDraft();
    mockWorkouts([]); // the workout is gone from the library too.
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-1" }), { status: 201 }),
      ),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");
    expect(parsedBodies(apiFn)[0]!.workoutType).toBe("O2");
  });

  it("prefers matchedDraft.type over the library lookup when both exist but disagree", async () => {
    const { workout } = buildSessionFixture({ type: "AT" }); // draft.type is "AT"
    mockWorkouts([{ ...workout, type: "AN" }]); // the library disagrees
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-1" }), { status: 201 }),
      ),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");
    // Neither "AN" (the library's disagreeing value) nor "O2" (the
    // fallback default) — only a real draft-preference read produces "AT".
    expect(parsedBodies(apiFn)[0]!.workoutType).toBe("AT");
  });
});

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
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.type(screen.getByLabelText("NOTES"), "Felt strong.");
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

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

  it("POSTs held/pain/thumbs as null when nothing is chosen (spec: reflection is optional)", async () => {
    const { run, workout } = buildSessionFixture();
    mockWorkouts([workout]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-1" }), { status: 201 }),
      ),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    const [, init] = apiFn.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      workoutId: run.workoutId,
      held: null,
      pain: null,
      thumbs: null,
      notes: null,
    });
  });

  // §2D: HOW DID IT FEEL (thumbs up/down) is now a real control — its own
  // wire shape, alongside held/pain/notes.
  it("POSTs thumbs:'up'/'down' when chosen, clearable the same way as held/pain", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-thumbs" }), { status: 201 }),
      ),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await userEvent.click(
      screen.getByRole("button", { name: "↑ MORE LIKE THIS" }),
    );
    expect(
      screen.getByRole("button", { name: "↑ MORE LIKE THIS" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Clear it, then pick the opposite.
    await userEvent.click(
      screen.getByRole("button", { name: "↑ MORE LIKE THIS" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Less like this" }),
    );

    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");
    expect(parsedBodies(apiFn)[0]!.thumbs).toBe("down");
  });

  // IMP-5 (whole-branch review): a wire-shape test, through an actual Save
  // click and the real posted JSON — not just `buildLogSteps`'s own return
  // value (already unit-pinned in logDraft.test.ts) — proving the 5G
  // omission rules survive all the way to the bytes on the wire.
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
    const built = buildRun(started, BASELINES, FIXED_NOW);
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
    await screen.findByRole("heading", { name: "Wire Shape Fixture" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    const steps = body.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(2);

    expect(Object.keys(steps[0]!).sort()).toStrictEqual(
      ["label", "seconds", "spm"].sort(),
    );
    expect(steps[0]).not.toHaveProperty("targetSplit");
    expect(steps[0]).not.toHaveProperty("actualSplit");
    expect(steps[0]).not.toHaveProperty("actualSource");

    expect(steps[1]).not.toHaveProperty("actualSplit");
    expect(steps[1]).not.toHaveProperty("actualSource");
    expect(Object.keys(steps[1]!).sort()).toStrictEqual(
      ["label", "targetSplit", "spm", "meters"].sort(),
    );
  });

  it("IMP-1: a completed run whose only qualifying step is a test piece still saves — no dead end, no empty steps array", async () => {
    const draft = buildDraft({
      id: "id-test-only-session",
      title: "2k Test Day",
      type: "AN",
      steps: [{ k: "test", label: "2k test" }],
    });
    const started = startDraft(draft);
    saveDraft(started);
    const built = buildRun(started, BASELINES, FIXED_NOW);
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
    await screen.findByRole("heading", { name: "2k Test Day" });
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("2k test")).toBeInTheDocument();

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON }),
    ).not.toBeDisabled();
  });

  it("treats an unparseable 400 body as 'no field named' — no retry, a genuine failure surfaces", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(new Response("not json", { status: 400 })),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[0]!.workoutId).toBe(run.workoutId);
    expect(bodies[1]!.workoutId).toBeNull();
    expect(bodies[0]!.workoutId).not.toBeNull();
    expect(bodies[1]).toStrictEqual({ ...bodies[0], workoutId: null });
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[1]).toStrictEqual({ ...bodies[0], workoutId: null });
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON }),
    ).not.toBeDisabled();
  });

  it("does not retry when the 400 names a different field — surfaces the failure instead of silently stripping workoutId", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: "pain must be an integer 1..5 or null",
            field: "pain",
          }),
          { status: 400 },
        ),
      ),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
  });
});

// Task 3 (ui-fix round): staged discard, in-place L4/L4-armed idiom. §2F
// (post-workout-summary spec): the RESTING label reads `DISCARD WITHOUT
// SAVING` now (the mock's own literal copy, borderless mono) — the armed
// copy keeps the house `Tap again to discard` (the mock never designed its
// own armed state, PROVENANCE item 4). The two-tap safety itself, and the
// clear-both-records-then-navigate behaviour, are unchanged.
describe("LogSession: staged discard", () => {
  it("arms on the first press without clearing anything or firing a network request", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await userEvent.click(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    );
    expect(
      screen.getByRole("button", { name: "Tap again to discard" }),
    ).toBeInTheDocument();
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("disarms on blur — a second press after focus moves away arms again instead of discarding", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const discardBtn = screen.getByRole("button", {
      name: "DISCARD WITHOUT SAVING",
    });
    await userEvent.click(discardBtn);
    expect(
      screen.getByRole("button", { name: "Tap again to discard" }),
    ).toBeInTheDocument();

    fireEvent.blur(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );
    expect(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loadRun()).not.toBeNull();
  });

  it("clears both records and navigates to /today only once the armed press lands — with no POST ever fired", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await userEvent.click(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("LogSession: the manual door (Task 3)", () => {
  it("shows the title, the PACES OFF caption (referenced bases only), the row list with every actual 'assumed' (rendered as PRESCRIBED — the manual door never sets actualSource: stopwatch), and EXPECTED N/5 — with no Discard button at all", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);

    expect(
      await screen.findByRole("heading", { name: "Hoarfrost" }),
    ).toBeInTheDocument();
    // Only "6k" renders — neither step references "2k" at all.
    expect(screen.getByText("PACES OFF 6K 2:00.0")).toBeInTheDocument();

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(2);
    // Row 1: Hoarfrost's own time/split step — current baselines resolve
    // the target directly (120 + 12 = 132 -> "2:12.0").
    expect(within(rows[0]!).getByText("12:00")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("2:12.0")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("6k +12")).toBeInTheDocument();
    // Row 2: Calm Sea's own distance/split step (120 + 12 = 132 ->
    // "2:12.0").
    expect(within(rows[1]!).getByText("10000 m")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("2:12.0")).toBeInTheDocument();

    expect(screen.getByText("EXPECTED 2/5")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON }),
    ).not.toBeDisabled();
    // The brief's own words: "no Discard button (nothing to discard)."
    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
  });

  it("has no hero block at all — the manual door has no run and no measurement of any kind (§2B's own date-only fallback)", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(screen.queryByText("AVG SPLIT")).not.toBeInTheDocument();
    expect(screen.queryByText("TIME")).not.toBeInTheDocument();
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();
    // Meta reads date + LOGGED BY HAND, no time-of-day segment.
    expect(
      screen.getByText(
        `${formatLogDate(new Date().toISOString())} · LOGGED BY HAND`,
      ),
    ).toBeInTheDocument();
  });

  it("shows the BY FEEL hint unconditionally (§2D: by-hand manual door never uses the single-target rule)", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(screen.getByText("BY FEEL")).toBeInTheDocument();
  });

  it("shows LOADING… while workouts or baselines are still resolving", async () => {
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    mockBaselines();
    await renderManualLog("w1");

    expect(screen.getByText("LOADING…")).toBeInTheDocument();
  });

  it("shows LOADING… when baselines alone are still resolving (workouts already ready)", async () => {
    mockWorkouts([manualWorkoutFixture()]);
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "loading" }),
    }));
    await renderManualLog("id-manual-fixture");

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

    // This early-return degraded state is its own small screen, never the
    // summary (PostWorkoutSummary never mounts here — there is nothing to
    // log yet) — Task 5 left it untouched, so it keeps the pre-existing
    // "Log {title}" heading and the bare BackLink's own default fallback.
    expect(
      await screen.findByRole("heading", { name: "Log Hoarfrost" }),
    ).toBeInTheDocument();
    expect(screen.getByText("no target")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /set baselines/i }),
    ).toHaveAttribute("href", "/you");
    // Nothing to save against — no form at all in this degraded state.
    expect(
      screen.queryByRole("button", { name: SAVE_BUTTON }),
    ).not.toBeInTheDocument();
  });

  it("Phase 6I: an effort-only workout (needsBaselines() false) opens the form with null baselines instead of the no-target block", async () => {
    const workout = onboardingManualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    await renderManualLog(workout.id);

    expect(
      await screen.findByRole("heading", { name: "First 6k" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("no target")).not.toBeInTheDocument();
    // The effort step's target renders empty (5G rule), the trailing dash
    // still shows.
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("MIN")).toBeInTheDocument();
    expect(rows[0]!.querySelector(".summary-row-target")?.textContent).toBe("");
    expect(rows[0]!.querySelector(".summary-row-dash")?.textContent).toBe("—");
    // No PACES OFF caption — an effort-only workout references neither
    // base.
    expect(screen.queryByText(/PACES OFF/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON }),
    ).toBeInTheDocument();
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
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.type(
      screen.getByLabelText("NOTES"),
      "Rowed it on the erg at home.",
    );
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole("button", { name: "SIMULATE BROWSER BACK" }),
    );

    expect(
      await screen.findByText("WORKOUT DETAIL SCREEN"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Hoarfrost" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: SAVE_BUTTON }),
    ).not.toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
  });

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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON }),
    ).not.toBeDisabled();
  });

  it("IMP-1: a workout whose only qualifying step is a test piece still saves — no dead end, no empty steps array", async () => {
    const workout: LibraryWorkout = {
      id: "id-test-only-manual",
      title: "2k Test Day",
      type: "AN",
      difficulty: "hard",
      pain: 4,
      steps: [{ k: "test", label: "2k test" }],
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
    await screen.findByRole("heading", { name: "2k Test Day" });
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("2k test")).toBeInTheDocument();

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    const body = parsedBodies(apiFn)[0]!;
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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[0]!.workoutId).toBe(workout.id);
    expect(bodies[1]!.workoutId).toBeNull();
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
            error: "pain must be an integer 1..5 or null",
            field: "pain",
          }),
          { status: 400 },
        ),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
  });

  it("treats an unparseable 400 body as 'no field named' — no retry, a genuine failure surfaces", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(new Response("not json", { status: 400 })),
    );
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
  });

  it("resolves each PACES OFF base from its OWN matching baseline when a workout references both", async () => {
    const workout: LibraryWorkout = {
      id: "id-manual-both-bases",
      title: "Manual Both Bases",
      type: "AT",
      difficulty: "medium",
      pain: 3,
      steps: [
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

    await screen.findByRole("heading", { name: "Manual Both Bases" });
    expect(
      screen.getByText("PACES OFF 2K 1:40.0 · 6K 2:00.0"),
    ).toBeInTheDocument();
  });
});

// 7C Task 4: `monitorModeRun`'s own four-condition gate (spec §4), tested
// directly against the pure function first — cheaper than driving the
// whole screen four times over — with the full screen describe block below
// proving the wiring on top of it. UNAFFECTED by Task 5: `monitorModeRun`
// is a pure function this task's own screen rewrite never touched.
describe("LogSession: monitorModeRun (7C spec §4's four-condition gate)", () => {
  it("engages when all four conditions hold", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun(run);
    const search = new URLSearchParams("from=monitor");
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toStrictEqual(run);
  });

  it("condition 1 (flag) removed: no from=monitor param falls through, even with a real completed matching record", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun(run);
    const search = new URLSearchParams(); // no "from" at all
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toBeNull();
  });

  it("condition 1 (flag) wrong value: from=elsewhere also falls through", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun(run);
    const search = new URLSearchParams("from=elsewhere");
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toBeNull();
  });

  it("condition 2 (record) removed: the flag alone, no MonitorRun in storage at all, falls through — THE HIJACK PIN's mirror image (intent with no evidence)", () => {
    const search = new URLSearchParams("from=monitor");
    expect(loadMonitorRun()).toBeNull();
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toBeNull();
  });

  it("condition 2 (record finished) removed: a LIVE MonitorRun (completedAt: null) falls through — the flag is intent, not evidence of a finished session", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun({ ...run, completedAt: null });
    const search = new URLSearchParams("from=monitor");
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toBeNull();
  });

  it("condition 3 (workoutId match) removed: a completed record for a DIFFERENT workout falls through — THE HIJACK PIN, live form", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun({ ...run, workoutId: "some-other-workout" });
    const search = new URLSearchParams("from=monitor");
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toBeNull();
  });

  it("condition 4 (seed alignment) removed: a missing logSeed disqualifies the record (MonitorLogSeedError caught, not thrown)", () => {
    const { run } = buildMonitorFixture();
    const { logSeed: _drop, ...v1Shaped } = run;
    saveMonitorRun({ ...v1Shaped, v: 1 });
    const search = new URLSearchParams("from=monitor");
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toBeNull();
  });

  it("condition 4 (seed alignment) removed: a logSeed whose length no longer matches program.intervals disqualifies the record", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun({
      ...run,
      logSeed: {
        steps: run.logSeed!.steps.slice(1),
        paces: run.logSeed!.paces,
      },
    });
    const search = new URLSearchParams("from=monitor");
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toBeNull();
  });

  it("condition 4 (seed alignment) removed: a malformed actuals ITEM (not caught by isMonitorRun's own shallow validator) disqualifies the record instead of throwing", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun({
      ...run,
      actuals: [null as unknown as IntervalActual],
    });
    const search = new URLSearchParams("from=monitor");
    expect(() => monitorModeRun(search, MONITOR_WORKOUT_ID)).not.toThrow();
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toBeNull();
  });

  it("THE HIJACK PIN itself: no flag + a stale (but otherwise perfectly valid) completed record for the SAME workout still falls through", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun(run);
    const search = new URLSearchParams(); // reload/bookmark: no from=monitor
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toBeNull();
  });
});

function mockMonitorRunClearSpy() {
  const spy = vi.fn();
  vi.doMock("../monitor/monitorRun", async () => {
    const actual = await vi.importActual<
      typeof import("../monitor/monitorRun")
    >("../monitor/monitorRun");
    return {
      ...actual,
      clearMonitorRun: () => {
        spy();
        actual.clearMonitorRun();
      },
    };
  });
  return spy;
}

// Task 5's own defensive catch (LogSession.tsx's monitor branch, wrapping
// `buildSummaryModel`): documented as unreachable in practice — the SAME
// deterministic `buildMonitorLogSteps` call `monitorModeRun` already made
// once, against the SAME immutable record, cannot fail the second time —
// but `summaryModel.ts`'s own header requires every consumer to handle its
// throw contract explicitly, and an unexercised catch block is exactly the
// shape this repo's own "definition of done" rule (self-mutation) exists to
// catch. `buildSummaryModel` is mocked directly (the only way to reach this
// branch at all) rather than driven end to end.
describe("LogSession: the manual door's monitor mode — buildSummaryModel's own throw contract (defensive coverage)", () => {
  // `vi.doMock` registrations are NOT cleared by `beforeEach`'s own
  // `vi.resetModules()` (that only drops the module CACHE, not pending
  // mock factories) — left unmocked, this file's own module id would keep
  // intercepting every later test's `import("./summaryModel")` in this
  // same file, silently breaking unrelated tests below. `vi.doUnmock`
  // undoes exactly that registration once each test here is done.
  afterEach(() => {
    vi.doUnmock("./summaryModel");
  });

  it("a MonitorLogSeedError from buildSummaryModel falls through to /today rather than crashing", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    vi.doMock("./summaryModel", async () => {
      const actual =
        await vi.importActual<typeof import("./summaryModel")>(
          "./summaryModel",
        );
      // The class reference matters here, not just the shape: LogSession.tsx
      // checks `err instanceof MonitorLogSeedError`, and this file's own
      // TOP-LEVEL static import of that class was resolved BEFORE
      // `beforeEach`'s `vi.resetModules()` ran for this test — a fresh
      // dynamic re-import (matching whatever generation `./LogSession`
      // itself sees below) is what makes `instanceof` actually true.
      const { MonitorLogSeedError: FreshMonitorLogSeedError } =
        await import("./logDraft");
      return {
        ...actual,
        buildSummaryModel: () => {
          throw new FreshMonitorLogSeedError("forced for coverage");
        },
      };
    });

    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("a non-MonitorLogSeedError from buildSummaryModel is rethrown, never silently swallowed", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    vi.doMock("./summaryModel", async () => {
      const actual =
        await vi.importActual<typeof import("./summaryModel")>(
          "./summaryModel",
        );
      return {
        ...actual,
        buildSummaryModel: () => {
          throw new Error("an unrelated, genuinely unexpected failure");
        },
      };
    });
    // React logs the uncaught render error to console.error; expected here,
    // not a real assertion target.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor"),
    ).rejects.toThrow("an unrelated, genuinely unexpected failure");

    consoleError.mockRestore();
  });
});

describe("LogSession: the manual door's monitor mode (7C Task 4)", () => {
  it("shows the title/EXPECTED, PACES OFF from the frozen seed, and every row MEASURED with a real pm5 pace — the widened render gate", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");

    expect(
      await screen.findByRole("heading", { name: "Hoarfrost" }),
    ).toBeInTheDocument();
    expect(screen.getByText("EXPECTED 2/5")).toBeInTheDocument();
    expect(screen.getByText("PACES OFF 6K 2:00.0")).toBeInTheDocument();

    // Row 0 is the fixture's own warm-up row (`buildRun`'s 4-minute warm-up
    // setting) — measured-shaped but never judged (R-C). Rows 1/2 are the
    // two work intervals: both carry a real avgSplit reading -> both
    // MEASURED, each showing its own elapsed time and pace (fmtDuration/
    // fmtSplit of the actual reading — the deviation NUMBERS/colors are
    // `summaryModel.test.ts`'s own concern, this screen only proves the
    // pace/time text renders).
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]!.className).toContain("summary-row-warmup");
    expect(within(rows[1]!).getByText("11:45")).toBeInTheDocument(); // 705s
    expect(within(rows[1]!).getByText("2:20.0")).toBeInTheDocument(); // avgSplit 140
    expect(within(rows[2]!).getByText("41:40")).toBeInTheDocument(); // 2500s
    expect(within(rows[2]!).getByText("2:05.0")).toBeInTheDocument(); // avgSplit 125

    // Unlike the ordinary manual door, this mode DOES have a Discard.
    expect(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    ).toBeInTheDocument();
  });

  it("partial: one interval measured, one not — the unmeasured interval renders PRESCRIBED (no ACTUAL reading, target/offset only)", async () => {
    const { run, workout } = buildMonitorFixture({
      actuals: [
        {
          index: 1,
          elapsedSeconds: 705,
          distanceMeters: 2000,
          avgSplit: 140,
          avgSpm: 24,
          avgHeartRateBpm: 138,
          restDistanceMeters: 0,
        },
        // index 2 (Calm Sea's distance work) never reached.
      ],
    });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(3); // warm-up + 2 work intervals
    expect(within(rows[1]!).getByText("11:45")).toBeInTheDocument();
    // Row 2 (Calm Sea) has no matched actual at all -> PRESCRIBED: target
    // split shown, never an assumed/measured reading (unlike the
    // phone-timer door, a monitor interval with no boundary gets no "held
    // the target" guess).
    expect(within(rows[2]!).getByText("2:12.0")).toBeInTheDocument();
    expect(rows[2]!.querySelector(".summary-row-dash")?.textContent).toBe("—");
  });

  it("an unusable avgSplit (0 — 'the wire had no reading') still renders the row MEASURED (actualSource: pm5), just with no pace text", async () => {
    const { run, workout } = buildMonitorFixture({
      actuals: [
        {
          index: 1,
          elapsedSeconds: 705,
          distanceMeters: 2000,
          avgSplit: 0,
          avgSpm: 24,
          avgHeartRateBpm: 138,
          restDistanceMeters: 0,
        },
        {
          index: 2,
          elapsedSeconds: 2500,
          distanceMeters: 10000,
          avgSplit: 125,
          avgSpm: 26,
          avgHeartRateBpm: 150,
          restDistanceMeters: 0,
        },
      ],
    });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    // Row 1 (Hoarfrost, after the warm-up row) carries no `actualSplit`
    // (avgSplit 0 -> dropped, `logDraft.ts`'s own rule) but IS still
    // `measured: true` in the model's own row shape — `.summary-row-time`
    // still shows the elapsed reading.
    expect(within(rows[1]!).getByText("11:45")).toBeInTheDocument();
    expect(rows[1]!.querySelector(".summary-row-pace")?.textContent).toBe("");
    expect(within(rows[2]!).getByText("2:05.0")).toBeInTheDocument();
  });

  // THE HIJACK PIN, at the screen level (unit-level coverage lives in the
  // `monitorModeRun` describe block above): a stale completed MonitorRun
  // for the SAME workout, reached with NO `from=monitor` flag, must render
  // the manual form.
  it("THE HIJACK PIN: no from=monitor flag + a stale completed MonitorRun for the SAME workout renders the manual form", async () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun(run);
    const workout = manualWorkoutFixture(MONITOR_WORKOUT_ID);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID); // no search string at all

    await screen.findByRole("heading", { name: "Hoarfrost" });
    // The manual door's own hero-less, BY FEEL-hinted shape — proves the
    // ordinary `buildManualLogSteps` path ran, not the monitor one.
    expect(screen.getByText("BY FEEL")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
  });

  it("a shallowly-valid MonitorRun with a malformed actuals entry never crashes the log door — it falls through to the manual form", async () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun({ ...run, actuals: [null as unknown as IntervalActual] });
    const workout = manualWorkoutFixture(MONITOR_WORKOUT_ID);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");

    expect(
      await screen.findByRole("heading", { name: "Hoarfrost" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BY FEEL")).toBeInTheDocument();
  });

  it("a legacy v1 interrupted MonitorRun falls through gate 4 to the manual door, intended (queue item 2)", async () => {
    const { run } = buildMonitorFixture();
    const { logSeed: _drop, ...v1Shaped } = run;
    saveMonitorRun({
      ...v1Shaped,
      v: 1,
      endedBy: "interrupted",
    });
    const workout = manualWorkoutFixture(MONITOR_WORKOUT_ID);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");

    expect(
      await screen.findByRole("heading", { name: "Hoarfrost" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BY FEEL")).toBeInTheDocument();
  });

  it("POSTs the pm5 steps verbatim (actualSource, avgHr, actualSeconds, actualMeters) plus deviceName, and clears MonitorRun exactly once on success", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const clearSpy = mockMonitorRunClearSpy();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-monitor-1" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    const body = parsedBodies(apiFn)[0]!;
    expect(body.workoutId).toBe(MONITOR_WORKOUT_ID);
    expect(body.deviceName).toBe("PM5 432331249 Row");
    const steps = body.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      expect(step.actualSource).toBe("pm5");
      expect(typeof step.avgHr).toBe("number");
      expect(typeof step.actualSeconds).toBe("number");
      expect(typeof step.actualMeters).toBe("number");
    }

    expect(loadMonitorRun()).toBeNull();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("an empty or >64-char deviceName is omitted from the POST body — the save still succeeds (branch review Minor)", async () => {
    const { run: emptyRun, workout } = buildMonitorFixture({ deviceName: "" });
    saveMonitorRun(emptyRun);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-monitor-empty" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    const body = parsedBodies(apiFn)[0]!;
    expect("deviceName" in body).toBe(false);
  });

  it("a failed save does NOT clear MonitorRun — the record survives so a retry can still prefill", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const clearSpy = mockMonitorRunClearSpy();
    mockApi(() => Promise.resolve(new Response(null, { status: 500 })));
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(loadMonitorRun()).not.toBeNull();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("Discard clears MonitorRun and navigates back to the workout's detail screen, with no POST ever fired", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await userEvent.click(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );

    expect(
      await screen.findByText("WORKOUT DETAIL SCREEN"),
    ).toBeInTheDocument();
    expect(loadMonitorRun()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Discard is staged: the first press only arms (button text flips, no clear, no navigation) — the record survives untouched", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await userEvent.click(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    );

    expect(
      screen.getByRole("button", { name: "Tap again to discard" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("WORKOUT DETAIL SCREEN")).not.toBeInTheDocument();
    expect(loadMonitorRun()).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the plain manual door (no monitor run at all) still has no Discard slot — discardSlot stays null outside monitor mode", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
  });

  it("leaving via BackLink (unmount) leaves the MonitorRun standing — loadMonitorRun() is still non-null after unmount", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const { unmount } = await renderManualLog(
      MONITOR_WORKOUT_ID,
      "?from=monitor",
    );
    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(screen.getByRole("link", { name: "← DONE" })).toBeInTheDocument();

    unmount();

    expect(loadMonitorRun()).not.toBeNull();
  });

  it("leaves an unrelated live run/draft byte-identical in storage after a monitor-mode save", async () => {
    buildSessionFixture();
    const draftBefore = localStorage.getItem(DRAFT_KEY);
    const runBefore = localStorage.getItem(RUN_KEY);
    expect(draftBefore).not.toBeNull();
    expect(runBefore).not.toBeNull();

    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-monitor-2" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");

    expect(localStorage.getItem(DRAFT_KEY)).toBe(draftBefore);
    expect(localStorage.getItem(RUN_KEY)).toBe(runBefore);
  });

  it("leaves an unrelated live run/draft byte-identical in storage after the monitor-mode discard fires", async () => {
    buildSessionFixture();
    const draftBefore = localStorage.getItem(DRAFT_KEY);
    const runBefore = localStorage.getItem(RUN_KEY);

    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await userEvent.click(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );
    await screen.findByText("WORKOUT DETAIL SCREEN");

    expect(localStorage.getItem(DRAFT_KEY)).toBe(draftBefore);
    expect(localStorage.getItem(RUN_KEY)).toBe(runBefore);
  });

  it("does not gate on baselines at all — the monitor branch renders even when baselines are unset (a stale bookmark elsewhere never blocks it)", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");

    expect(
      await screen.findByRole("heading", { name: "Hoarfrost" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("no target")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON }),
    ).toBeInTheDocument();
  });

  it("shows both bases in the PACES OFF caption when the frozen seed carries both (a 2k off=0 and a 6k off=0 step)", async () => {
    const draft = buildDraft({
      id: "id-monitor-both-bases",
      title: "Monitor Both Bases",
      type: "AT",
      steps: [
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
    const built = buildRun(started, BASELINES, FIXED_NOW);
    const run: MonitorRun = {
      v: 2,
      workoutId: draft.workoutId,
      title: draft.title,
      program: compileOrThrow(built.phases),
      logSeed: buildLogSeed(built.phases, BASELINES),
      actuals: [],
      deviceName: "PM5 432331249 Row",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: new Date(FIXED_NOW.getTime() + 6 * 60 * 1000).toISOString(),
      terminated: false,
    };
    saveMonitorRun(run);
    const workout: LibraryWorkout = {
      id: "id-monitor-both-bases",
      title: "Monitor Both Bases",
      type: "AT",
      difficulty: "medium",
      pain: 3,
      steps: started.steps,
      isGlobal: true,
      lastDoneDaysAgo: null,
    };
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog("id-monitor-both-bases", "?from=monitor");

    await screen.findByRole("heading", { name: "Monitor Both Bases" });
    expect(
      screen.getByText("PACES OFF 2K 1:40.0 · 6K 2:00.0"),
    ).toBeInTheDocument();
  });

  it("shows only 2K in the PACES OFF caption when the frozen seed never references 6k at all", async () => {
    const draft = buildDraft({
      id: "id-monitor-2k-only",
      title: "Monitor 2K Only",
      type: "AT",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "2k", off: 0 },
        },
      ],
    });
    const started = startDraft(draft);
    const built = buildRun(started, BASELINES, FIXED_NOW);
    const run: MonitorRun = {
      v: 2,
      workoutId: draft.workoutId,
      title: draft.title,
      program: compileOrThrow(built.phases),
      logSeed: buildLogSeed(built.phases, BASELINES),
      actuals: [],
      deviceName: "PM5 432331249 Row",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: new Date(FIXED_NOW.getTime() + 3 * 60 * 1000).toISOString(),
      terminated: false,
    };
    saveMonitorRun(run);
    const workout: LibraryWorkout = {
      id: "id-monitor-2k-only",
      title: "Monitor 2K Only",
      type: "AT",
      difficulty: "medium",
      pain: 3,
      steps: started.steps,
      isGlobal: true,
      lastDoneDaysAgo: null,
    };
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog("id-monitor-2k-only", "?from=monitor");

    await screen.findByRole("heading", { name: "Monitor 2K Only" });
    expect(screen.getByText("PACES OFF 2K 1:40.0")).toBeInTheDocument();
  });

  it("with an active plan, Log against plan posts advancesPlan absent (default true) — Save without logging posts advancesPlan:false", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-monitor-plan" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const lead = screen.getByRole("button", {
      name: "Log against plan · SESSION 4 OF 84",
    });
    await chooseHeldAndPain();
    await userEvent.click(lead);
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body).not.toHaveProperty("advancesPlan");
  });
});

// F6 Task 3 (spec 2b): the monitor door's own TIME hero stops reading
// wall-clock (`completedAt - startedAt`) entirely for a run the rower ended
// through Today's row (`endedBy: "interrupted"`) — that gap can span days
// between the row and the moment "Log it" was pressed, and none of it
// happened. `measuredSessionSeconds` (Task 4's `buildSummaryModel`, R-D)
// computes work + programmed rest for completed intervals instead, and the
// date comes from the run's OWN `startedAt`.
describe("LogSession: the interrupted header stops reading wall-clock (F6/R-D)", () => {
  it("an interrupted record shows measured minutes (work + completed rest) as the TIME hero, not the day-long wall-clock gap, dated from startedAt", async () => {
    const { run, workout } = buildMonitorFixture({
      // Only interval 1 (Hoarfrost's time work, restSeconds 300 per its own
      // auto-inserted rest phase) measured — interval 2 never reached.
      // work 360s + rest 300s = 660s = 11:00 exactly: nowhere near the
      // day-long wall-clock gap below.
      actuals: [
        {
          index: 1,
          elapsedSeconds: 360,
          distanceMeters: 1200,
          avgSplit: 150,
          avgSpm: 22,
          avgHeartRateBpm: 130,
          restDistanceMeters: 0,
        },
      ],
    });
    const interrupted: MonitorRun = {
      ...run,
      startedAt: "2026-08-01T12:00:00.000Z",
      completedAt: "2026-08-02T12:05:00.000Z",
      endedBy: "interrupted",
    };
    saveMonitorRun(interrupted);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(screen.getByText("TIME")).toBeInTheDocument();
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.queryByText(/1440:00/)).not.toBeInTheDocument();
    expect(screen.getByText(/^AUG 1 ·/)).toBeInTheDocument();
    expect(screen.queryByText(/^AUG 2/)).not.toBeInTheDocument();
  });

  it("inverse pin: a normal-completion record (no endedBy) still shows wall-clock minutes and dateLabel from completedAt", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    // work 705+2500=3205s + restSeconds (300 for interval1, 0 for
    // interval2) = 3505s -> "58:25".
    expect(screen.getByText("58:25")).toBeInTheDocument();
  });
});

// Post-workout-summary spec §2F: the old separate toggle ("COUNTS TOWARD
// PLAN"/"OUTSIDE THE PLAN") is gone — the choice between advancing and not
// advancing the plan is now made by WHICH save button the rower taps.
describe("LogSession: the save stack's plan position (§2F, replaces the outside-plan toggle)", () => {
  it("renders only Save without logging (as the lead) when there's no active plan", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.queryByRole("button", { name: /Log against plan/ }),
    ).not.toBeInTheDocument();
    const lead = screen.getByRole("button", { name: "Save without logging" });
    expect(lead.className).toContain("summary-save-lead");
  });

  it("manual door: renders only Save without logging when there's no active plan", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.queryByRole("button", { name: /Log against plan/ }),
    ).not.toBeInTheDocument();
  });

  it("session door: renders the form immediately while the plan is still loading, with no Log against plan button, and Save posts no advancesPlan key", async () => {
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

    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(
      screen.queryByRole("button", { name: /Log against plan/ }),
    ).not.toBeInTheDocument();

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    // §2F's "Save without logging" ALWAYS sends advancesPlan:false, even
    // with no plan resolved yet — harmless (the server's own plan_state
    // upsert is a no-op with no plan to advance), and simpler than the old
    // toggle's tri-state ("no plan" / "counts" / "outside").
    expect(body.advancesPlan).toBe(false);
  });

  it("renders the plan position on Log against plan, sourced from doneN/sequence.length, when a plan is active", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const lead = screen.getByRole("button", {
      name: "Log against plan · SESSION 4 OF 84",
    });
    expect(lead.className).toContain("summary-save-lead");
    expect(
      screen.getByRole("button", { name: "Save without logging" }).className,
    ).toContain("summary-save-secondary");
  });

  // Phase 6I: the designated onboarding workout's own summary swaps which
  // button leads — Save without logging leads, Log against plan demotes —
  // rather than pre-toggling a state (spec: "a baseline test must not
  // silently consume plan session 1").
  it("Phase 6I: a designated onboarding workout's summary leads with Save without logging", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildOnboardingSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "First 6k" });

    const lead = screen.getByRole("button", { name: "Save without logging" });
    expect(lead.className).toContain("summary-save-lead");
    const secondary = screen.getByRole("button", {
      name: /Log against plan/,
    });
    expect(secondary.className).toContain("summary-save-secondary");
  });

  it("Phase 6I: an ordinary (non-onboarding) workout's summary still leads with Log against plan", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.getByRole("button", { name: "Log against plan · SESSION 4 OF 84" })
        .className,
    ).toContain("summary-save-lead");
  });

  it("wire shape: Log against plan posts NO advancesPlan key at all (the server's own ?? true default)", async () => {
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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Log against plan · SESSION 4 OF 84",
      }),
    );
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body).not.toHaveProperty("advancesPlan");
  });

  it("wire shape: Save without logging posts advancesPlan: false", async () => {
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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body.advancesPlan).toBe(false);
  });

  // Fix round 2 (whole-branch review, L3, retained under the new button
  // model): the workoutId-retry policy (`useLogForm`'s `submit`,
  // `LogSession.tsx`) rebuilds the retry body by SPREADING the original
  // body with only `workoutId` overridden — this pins that
  // `advancesPlan: false` survives that spread untouched.
  it("Save without logging survives the workoutId retry: the retry body still carries advancesPlan: false", async () => {
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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[0]!.workoutId).toBe(run.workoutId);
    expect(bodies[0]!.advancesPlan).toBe(false);
    expect(bodies[1]!.workoutId).toBeNull();
    expect(bodies[1]!.advancesPlan).toBe(false);
    expect(bodies[1]).toStrictEqual({ ...bodies[0], workoutId: null });
  });

  it("manual door wire shape: Log against plan posts NO advancesPlan key at all", async () => {
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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Log against plan · SESSION 4 OF 84",
      }),
    );
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body).not.toHaveProperty("advancesPlan");
  });

  it("manual door wire shape: Save without logging posts advancesPlan: false", async () => {
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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body.advancesPlan).toBe(false);
  });

  // Logging must never be hostage to the plan fetch: an errored plan hook
  // degrades to "no Log against plan button" — the SAME observable shape
  // as "no active plan" — rather than blocking Save or crashing.
  it("plan-hook error: no Log against plan button renders, and Save still succeeds", async () => {
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
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.queryByRole("button", { name: /Log against plan/ }),
    ).not.toBeInTheDocument();

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");

    expect(apiFn).toHaveBeenCalledTimes(1);
  });

  it("manual door: plan-hook error renders no Log against plan button either", async () => {
    mockPlan({ state: "error", retry: vi.fn() });
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.queryByRole("button", { name: /Log against plan/ }),
    ).not.toBeInTheDocument();
  });

  // The reflection quintet (held/pain/thumbs/notes) survives a failed save
  // unchanged — proved elsewhere; here the concern is narrower: a failed
  // save must not reset which button LEADS (there is no state to reset —
  // button order is a pure render-time computation from plan/isOnboarding,
  // neither of which a failed save touches).
  it("a failed save leaves the save stack's button order unchanged", async () => {
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
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Log against plan · SESSION 4 OF 84" })
        .className,
    ).toContain("summary-save-lead");
  });
});
