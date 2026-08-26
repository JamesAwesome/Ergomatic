import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import type { Step, WorkoutType } from "../../domain/types.js";
import { fmtDuration } from "../../domain/duration.js";
import { compileProgram } from "../../domain/monitor/program.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import type { api } from "../api";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { PlanData, PlanKey, PlanState } from "../api/usePlan";
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
import { buildLogSeed, buildLogSteps, formatLogDate } from "./logDraft";
import { loadRun, RUN_KEY, saveRun, type SessionRun } from "./run";
import { buildSummaryModel } from "./summaryModel";
import {
  connectGuardStage,
  loadMonitorRun,
  saveMonitorRun,
  type MachineSummaryDetail,
  type MonitorRun,
} from "../monitor/monitorRun";
import type { SeriesData } from "../monitor/seriesRecorder";
import type { MonitorLogEntry } from "../monitor/eventLog";
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

// Phase 6I: the real "6K Test" seed workout (server/seed/library/
// onboarding.ts) — effort ref, no baselines needed (domain/needsBaselines.ts)
// — driven through the same buildDraft/startDraft/buildRun/saveRun pipeline
// as `buildSessionFixture` above, `null` baselines rather than a real pair
// since this workout needs none.
function buildOnboardingSessionFixture(): {
  run: SessionRun;
  workout: LibraryWorkout;
} {
  const seed = ONBOARDING_LIBRARY_WORKOUTS.find(
    (w) => w.title === ONBOARDING_TITLES.k6,
  )!;
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
    code: "O2",
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
// compileProgram -> buildLogSeed` pipeline. Program intervals: [0] a 4'
// EASY opener, [1] work (time, Hoarfrost), [2] work (distance, Calm Sea) —
// `IntervalActual.index` below is a position in THAT array, so a "both
// measured" actuals list uses index 1 and 2, never 0.
function buildMonitorFixture(
  overrides: {
    actuals?: IntervalActual[];
    deviceName?: string;
    series?: SeriesData;
    endedBy?: MonitorRun["endedBy"];
    workSeconds?: number;
    workMeters?: number;
    restSeconds?: number;
    restMeters?: number;
    summaryTotals?: {
      workElapsedSeconds: number;
      workDistanceMeters: number;
    };
    summaryDetail?: MachineSummaryDetail;
    verificationBytes?: readonly number[];
  } = {},
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
    // Interval 0 used to come from `buildRun`'s warm-up SETTING argument,
    // which Phase WU deleted. An authored 4' EASY step compiles to the
    // identical interval (`compileProgram` nulls an effort phase's target
    // exactly as it nulled a warm-up's), so every `IntervalActual.index`
    // and every row position in this file is unchanged. What DID change is
    // how it RENDERS: a warm-up seeded `kind: "warmup"`, which
    // `buildMonitorLogSteps` skipped and `summaryModel` prepended as an
    // unnumbered WARM-UP row. It is an ordinary numbered row now.
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { effort: "min" },
      },
      timeWork,
      distanceWork,
    ],
  });
  const started = startDraft(draft);
  const built = buildRun(started, BASELINES, FIXED_NOW);
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
    // Series capture spec (2026-08-19), §3: the KEY itself is omitted
    // entirely (not `series: undefined`) when no override is given — a
    // real `loadMonitorRun()` read (through a genuine JSON round trip)
    // can never produce a present-but-undefined key, and an existing
    // `toStrictEqual` comparison against this fixture object (the
    // four-condition-gate test) would otherwise see a shape localStorage
    // itself never produces.
    ...(overrides.series !== undefined ? { series: overrides.series } : {}),
    // Phase LL Task 4: same "omit the key entirely unless given" idiom as
    // `series` above, same reason.
    ...(overrides.endedBy !== undefined ? { endedBy: overrides.endedBy } : {}),
    // RC-1 (storage-spine design spec §3): same "omit the key entirely
    // unless given" idiom as `series`/`endedBy` above, same reason — a
    // real `completeMonitorRun` only ever writes these four together
    // (`endedBy === "finished"`), so a fixture must be able to represent
    // "absent" as genuinely absent, not `undefined`-valued.
    ...(overrides.workSeconds !== undefined
      ? { workSeconds: overrides.workSeconds }
      : {}),
    ...(overrides.workMeters !== undefined
      ? { workMeters: overrides.workMeters }
      : {}),
    ...(overrides.restSeconds !== undefined
      ? { restSeconds: overrides.restSeconds }
      : {}),
    ...(overrides.restMeters !== undefined
      ? { restMeters: overrides.restMeters }
      : {}),
    // RC-3 (storage-spine design spec §2, PR 1 Task 7): same "omit the key
    // entirely unless given" idiom as `series`/`endedBy`/the four RC-1
    // fields above, same reason — a real `appendSummaryObservations` only
    // ever writes `summaryTotals`/`summaryDetail` together (Task 2's own
    // write-once contract); `verificationBytes` is separately optional
    // (only the burst-eligible producer sets it).
    ...(overrides.summaryTotals !== undefined
      ? { summaryTotals: overrides.summaryTotals }
      : {}),
    ...(overrides.summaryDetail !== undefined
      ? { summaryDetail: overrides.summaryDetail }
      : {}),
    ...(overrides.verificationBytes !== undefined
      ? { verificationBytes: overrides.verificationBytes }
      : {}),
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

// Phase 6I close-out fold: the real "6K Test" seed workout — an
// effort-only workout (`needsBaselines()` reads false), unlike
// `manualWorkoutFixture()`'s split-ref mix above.
function onboardingManualWorkoutFixture(
  id = "id-first6k-manual",
): LibraryWorkout {
  const seed = ONBOARDING_LIBRARY_WORKOUTS.find(
    (w) => w.title === ONBOARDING_TITLES.k6,
  )!;
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

  // Trace-rendering spec (Phase LT spec 3), §1: the timer door has no PM5
  // — `PostWorkoutSummary`'s own `series` prop is never even passed here
  // (`LogSession.tsx`'s timer-door call site), the same "absent means
  // nothing" idiom the manual door below shares.
  it("renders no trace chart — the timer door has no series to draw", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(document.querySelector(".trace-figure")).not.toBeInTheDocument();
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
    localStorage.removeItem("ergomatic:last-session-log");
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(document.querySelector(".log-monitor-diag")).toBeNull();
  });

  // Task 1 (lost-monitor design spec): the flagship case — armed, never
  // pulled, so no `MonitorRun` and no rowed-only sessionStorage key ever
  // existed — is exactly the case `ergomatic:last-rowed-log` cannot serve
  // (`MonitorLogRow`'s own header comment used to claim, falsely as of
  // this task, that such a session "has no key at mount and none ever
  // materializes later either"). The unconditional `ergomatic:
  // last-session-log` stash now covers it.
  //
  // FIX ROUND (whole-branch review, MEDIUM): the arrival this must serve is
  // a `?from=monitor` one — `WorkoutDetail.tsx`'s `handleConnectedEnded`
  // sends every finished connected session, rowed or not, to
  // `/library/:id/log?from=monitor`. The test used to prove it on the
  // SESSION door instead, which is the door a connected session never
  // reaches, and that mismatch is what let the fallback become permanent
  // furniture on every log screen in the app.
  it("renders from the never-rowed stash on the connected arrival when no rowed record was ever saved, and copies IT", async () => {
    sessionStorage.removeItem("ergomatic:last-rowed-log");
    const stash = JSON.stringify([
      {
        seq: 0,
        atMs: 1000,
        kind: "close-no-record",
        detail: "endedBy=rower terminated=true",
      },
    ]);
    localStorage.setItem("ergomatic:last-session-log", stash);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const row = screen.getByRole("button", { name: "MONITOR LOG · COPY" });
    await userEvent.click(row);

    // The whole story in one artifact: the session's own ring, plus the
    // `log-door-miss` this very arrival appended (no record in storage, so
    // `monitorModeRun` missed on `no-run`).
    const copied = JSON.parse(
      writeText.mock.calls[0]![0] as string,
    ) as MonitorLogEntry[];
    expect(copied[0]).toMatchObject({ kind: "close-no-record" });
    expect(copied[1]).toMatchObject({
      kind: "log-door-miss",
      detail: "no-run",
    });
    localStorage.removeItem("ergomatic:last-session-log");
  });

  // The merge degrades to the ring rather than losing it: a diagnostics
  // reader must never come away with LESS than it would have had before
  // the misses key existed. Both malformed shapes a hand-edited or
  // half-written key can take.
  it.each([
    ["unparseable JSON", "{not json"],
    ["a parseable non-array", JSON.stringify({ seq: 0 })],
    ["an entry-shaped object, not a list", JSON.stringify({ kind: "x" })],
  ])(
    "a misses key holding %s still copies the session ring, unchanged",
    async (_label, misses) => {
      sessionStorage.removeItem("ergomatic:last-rowed-log");
      const ring = JSON.stringify([
        { seq: 0, atMs: 1000, kind: "write", detail: "f1" },
      ]);
      localStorage.setItem("ergomatic:last-session-log", ring);
      localStorage.setItem("ergomatic:log-door-misses", misses);
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      const workout = manualWorkoutFixture();
      mockWorkouts([workout]);
      mockBaselines();
      // A record IS in storage, so this is not the never-rowed shape — the
      // malformed misses key is the only thing under test. (A malformed
      // key is unwritable as well as unreadable: `recordLogDoorMiss`'s own
      // parse throws and its catch swallows the append, so the key stays
      // exactly as seeded whether or not a miss was attempted.)
      const { run } = buildMonitorFixture();
      saveMonitorRun({ ...run, workoutId: workout.id });
      await renderManualLog(workout.id, "?from=monitor");
      await screen.findByRole("heading", { name: "Hoarfrost" });

      await userEvent.click(
        screen.getByRole("button", { name: "MONITOR LOG · COPY" }),
      );
      expect(writeText).toHaveBeenCalledWith(ring);
      localStorage.removeItem("ergomatic:last-session-log");
      localStorage.removeItem("ergomatic:log-door-misses");
    },
  );

  // FIX ROUND (whole-branch review, MEDIUM) — THE REGRESSION THIS CLOSES.
  // `ergomatic:last-session-log` is localStorage, written on EVERY
  // connected teardown (a failed pairing and a connect-then-cancel
  // included) and never cleared. Ungated, that made `MONITOR LOG · COPY`
  // permanent furniture on every log screen in the app for the life of the
  // install, after a rower's first ever Connect — including on a by-hand
  // entry that has nothing to do with a monitor. The one place in this
  // phase a rower was straightforwardly worse off.
  it("the plain by-hand door does NOT show the row just because a connected session once tore down on this device", async () => {
    sessionStorage.removeItem("ergomatic:last-rowed-log");
    localStorage.setItem(
      "ergomatic:last-session-log",
      JSON.stringify([{ seq: 0, atMs: 1000, kind: "write", detail: "f1" }]),
    );
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(document.querySelector(".log-monitor-diag")).toBeNull();
    localStorage.removeItem("ergomatic:last-session-log");
  });

  it("the timer's own session door does not show it either", async () => {
    sessionStorage.removeItem("ergomatic:last-rowed-log");
    localStorage.setItem(
      "ergomatic:last-session-log",
      JSON.stringify([{ seq: 0, atMs: 1000, kind: "write", detail: "f1" }]),
    );
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(document.querySelector(".log-monitor-diag")).toBeNull();
    localStorage.removeItem("ergomatic:last-session-log");
  });

  // The rowed key still wins when BOTH exist (a rowed session's own
  // teardown writes both) — this pins that the fallback never shadows the
  // more specific key a rowed session already had.
  it("the rowed-only stash still wins when both keys exist", async () => {
    const rowed = JSON.stringify([{ seq: 0, kind: "write", detail: "f1" }]);
    const general = JSON.stringify([
      { seq: 0, kind: "write", detail: "SOMETHING ELSE" },
    ]);
    sessionStorage.setItem("ergomatic:last-rowed-log", rowed);
    localStorage.setItem("ergomatic:last-session-log", general);
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

    expect(writeText).toHaveBeenCalledWith(rowed);
    sessionStorage.removeItem("ergomatic:last-rowed-log");
    localStorage.removeItem("ergomatic:last-session-log");
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
    // Review finding C1: the className this row renders must actually
    // resolve to styled rules (index.css's own `.log-monitor-diag`), not
    // just exist as a string — `e2e/design.spec.ts`'s own "quiet diagnostics
    // doors" block proves the resolved live styles; this pins the class
    // name itself at the component layer (jsdom never applies index.css).
    expect(row.className).toContain("log-monitor-diag");
    await userEvent.click(row);

    expect(writeText).toHaveBeenCalledWith(stash);
    expect(
      await screen.findByRole("button", { name: "MONITOR LOG · COPIED" }),
    ).toBeInTheDocument();
    sessionStorage.removeItem("ergomatic:last-rowed-log");
  });

  // I2 fix (final-review): the hold-open instrument (Phase RC spec 1)
  // appends to this SAME key up to 90s AFTER this screen has already
  // mounted (the finish hand-off navigates here well before the window
  // closes) — the OLD `useState` lazy initializer captured the stash ONCE
  // at mount, so this button could never surface a hold's appended
  // window. Simulates exactly that: the stash mutates AFTER mount, BEFORE
  // the click.
  it("a stash that changes AFTER mount (the hold-open window landing late) is still what gets copied — the button reads live, not the mount-time snapshot", async () => {
    const mountTimeStash = JSON.stringify([
      { seq: 0, kind: "write", detail: "f1" },
    ]);
    sessionStorage.setItem("ergomatic:last-rowed-log", mountTimeStash);
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

    // The hold-open window lands AFTER this screen mounted — the exact
    // shape `holdOpen.ts`'s own `release()`/expiry stash produces, up to
    // HOLD_OPEN_MS after the finish hand-off already navigated here.
    const withHoldOpenWindow = JSON.stringify([
      { seq: 0, kind: "write", detail: "f1" },
      {
        seq: 1,
        kind: "hold-open",
        detail: "--- hold-open window (instrument) ---",
      },
      { seq: 2, kind: "hold-open", detail: "+4s ce06003f-... fa ce" },
    ]);
    sessionStorage.setItem("ergomatic:last-rowed-log", withHoldOpenWindow);

    await userEvent.click(row);

    // THE FIX: copies the LATE value, not the mount-time one.
    expect(writeText).toHaveBeenCalledWith(withHoldOpenWindow);
    expect(writeText).not.toHaveBeenCalledWith(mountTimeStash);
    sessionStorage.removeItem("ergomatic:last-rowed-log");
  });

  // I2 fix, the fallback branch: if sessionStorage becomes unreadable
  // BETWEEN mount and click (private-mode Safari revoking access
  // mid-session, same class `ConnectedInterstitial.test.tsx`'s own
  // "getItem failure" test covers elsewhere), the click handler must not
  // throw or copy `null` — it falls back to the mount-time snapshot,
  // never worse than the pre-I2-fix behaviour.
  it("a live read that THROWS at click time falls back to the mount-time stash, never crashes or copies null", async () => {
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
    // Mount already happened (and read successfully) above — only the
    // CLICK-time read throws.
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("sessionStorage unavailable");
      });

    await userEvent.click(row);

    expect(writeText).toHaveBeenCalledWith(stash);
    getItemSpy.mockRestore();
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
    // Review finding C1: same pin as the monitor log row above — the class
    // name that resolves the restored `.log-monitor-diag` styling.
    expect(row.className).toContain("log-monitor-diag");
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

  // From-the-log spec (2026-08-18), §2: "the client posts the model's
  // NUMBERS, not its strings" — proven here through a real Save click,
  // against the SAME `buildSummaryModel` call this door's own render path
  // makes (summaryModel.ts is the one place the number-string pairing is
  // decided; this test only proves the POST site never re-derives one).
  // The `typeof` assertions are the mutation guard: a body that posted the
  // pre-formatted STRING instead of the number goes red here first.
  it("posts avgSplitSeconds/timeSeconds as the model's own NUMBERS (not its display strings); distanceMeters stays absent (timer door: no machine total)", async () => {
    const { draft, run, workout } = buildSessionFixture();
    mockWorkouts([workout]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-heroes-timer" }), {
          status: 201,
        }),
      ),
    );
    const model = buildSummaryModel({
      door: "timer",
      run,
      steps: buildLogSteps(run, draft),
    });
    expect(model.heroes.avgSplitSeconds).toBeDefined();
    expect(model.heroes.timeSeconds).toBeDefined();

    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();

    const body = parsedBodies(apiFn)[0]!;
    expect(typeof body.avgSplitSeconds).toBe("number");
    expect(body.avgSplitSeconds).toBe(model.heroes.avgSplitSeconds);
    expect(typeof body.timeSeconds).toBe("number");
    expect(body.timeSeconds).toBe(model.heroes.timeSeconds);
    // Never the pre-formatted strings on these keys.
    expect(body.avgSplitSeconds).not.toBe(model.heroes.avgSplit);
    expect(body.timeSeconds).not.toBe(model.heroes.time);
    expect("distanceMeters" in body).toBe(false);
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
  it("shows the title, the PACES OFF caption (referenced bases only), the row list with every actual 'assumed' (rendered as PRESCRIBED — the manual door never sets actualSource: stopwatch), and EXPECTED N/5 — with a Discard button present (LT-0)", async () => {
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
    // Review FIX-7: the test's own title claims "every actual 'assumed'
    // (rendered as PRESCRIBED)" but the old `not.toHaveTextContent("ACTUAL")`
    // pair was dropped in the Task 5 rewrite — and restoring that literal
    // text is now a vacuous check: the pre-Task-5 UI had a literal "ACTUAL
    // n:nn.n" line (deleted with SessionComplete/`.log-step-*`, see the
    // Task 5 commit), but PostWorkoutSummary.tsx never renders the word
    // "ACTUAL" anywhere, measured or prescribed. `.summary-row-dash` (the
    // "—" cell) and the absence of `.summary-row-pace` ARE the current
    // component's own PRESCRIBED-row markers (module header: "§2E's own
    // unmeasured-row geometry") — assert those instead, so this actually
    // fails if a row were ever wrongly rendered MEASURED-shaped.
    expect(rows[0]!.querySelector(".summary-row-dash")).toBeInTheDocument();
    expect(rows[0]!.querySelector(".summary-row-pace")).not.toBeInTheDocument();
    // Row 2: Calm Sea's own distance/split step (120 + 12 = 132 ->
    // "2:12.0").
    expect(within(rows[1]!).getByText("10000 m")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("2:12.0")).toBeInTheDocument();
    expect(rows[1]!.querySelector(".summary-row-dash")).toBeInTheDocument();
    expect(rows[1]!.querySelector(".summary-row-pace")).not.toBeInTheDocument();

    expect(screen.getByText("EXPECTED 2/5")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON }),
    ).not.toBeDisabled();
    // LT-0: the last discard-less save surface now has one, same idiom as
    // the other two doors — dedicated behavioural tests live in the
    // "LogSession: the manual door's own staged discard (LT-0)" describe
    // block below; this is just proof the button renders on the ordinary
    // path.
    expect(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    ).toBeInTheDocument();
  });

  // Trace-rendering spec (Phase LT spec 3), §1: the by-hand door has no
  // PM5 either — same "prop never passed" idiom as the timer door above.
  it("renders no trace chart — the by-hand door has no series to draw", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(document.querySelector(".trace-figure")).not.toBeInTheDocument();
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
      await screen.findByRole("heading", { name: "6K Test" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("no target")).not.toBeInTheDocument();
    // The effort step's target renders empty (5G rule), the trailing dash
    // still shows.
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(1);
    // MAX since James's 2026-08-22 correction of the 6K's effort ref
    // (server/seed/library/onboarding.ts) — the fixture is the REAL seed.
    expect(within(rows[0]!).getByText("MAX")).toBeInTheDocument();
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

  // From-the-log spec §2: the by-hand door has no run record and no
  // measurement of any kind — `summaryModel.ts`'s manual door always
  // returns `heroes: {}` — so its own `SummaryHeroes` carries no numbers
  // to post in the first place. The wire keys are simply ABSENT (the
  // `deviceName` optional-key pattern), never `null`.
  it("posts no hero keys at all (avgSplitSeconds/timeSeconds/distanceMeters) — the manual door's model shows no heroes", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-manual-no-heroes" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();

    const body = parsedBodies(apiFn)[0]!;
    expect("avgSplitSeconds" in body).toBe(false);
    expect("timeSeconds" in body).toBe(false);
    expect("distanceMeters" in body).toBe(false);
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

// Phase LM PR 1, Task 4 (lost-monitor design spec) — THE FLAGSHIP ARRIVAL.
// A rower connected, programmed the workout, rowed, and the app never
// opened a record at all (`createMonitorRun`'s only call site sits behind
// the ready gate — `useMonitorSession.ts`). End therefore hands this route
// `?from=monitor` with NOTHING behind it: `monitorModeRun`'s condition 2,
// the `no-run` miss Task 1 already writes to the diagnostics stash. The
// screen falls through to the manual door, and until this task the row it
// showed said the rower had typed it in by hand.
//
// THE FIXTURE IS "NO RECORD AT ALL", deliberately — never a record with
// zero actuals, which is a different and currently-working path (a real
// `MonitorRun` reaches the monitor branch and renders `PM5 <name>`). A
// test built on that shape passes while this arrival fails (recurring
// failure #3).
describe("LogSession: a connected arrival with no record (Phase LM Task 4)", () => {
  it("never says LOGGED BY HAND — the source reads NO MONITOR READING instead", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    // The fixture, stated as an assertion rather than assumed: storage is
    // empty, so there is no record for this arrival to find.
    expect(loadMonitorRun()).toBeNull();

    await renderManualLog(workout.id, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.getByText(
        `${formatLogDate(new Date().toISOString())} · NO MONITOR READING`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/LOGGED BY HAND/)).not.toBeInTheDocument();
  });

  it("does not claim the row was rowed BY FEEL — it shows the workout's own single target", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();

    await renderManualLog(workout.id, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    // Both of this fixture's steps resolve to the same target (6k + 12 =
    // 132 -> 2:12.0), so the single-target rule fires — the same hint the
    // connected door itself would have shown for this workout.
    expect(screen.getByText("TARGET 2:12.0")).toBeInTheDocument();
    expect(screen.queryByText("BY FEEL")).not.toBeInTheDocument();
  });

  it("keeps all three exits, with Log against plan LEADING and undemoted (James's ruling: the rower did the work)", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    mockPlan(readyPlanState(activePlan()));

    await renderManualLog(workout.id, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const logAgainstPlan = screen.getByRole("button", {
      name: /^Log against plan/,
    });
    const saveWithout = screen.getByRole("button", {
      name: "Save without logging",
    });
    expect(logAgainstPlan.className).toContain("summary-save-lead");
    expect(saveWithout.className).toContain("summary-save-secondary");
    expect(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    ).toBeInTheDocument();
    // Undemoted means it also comes FIRST in the stack, not merely that it
    // carries the lead class.
    expect(
      logAgainstPlan.compareDocumentPosition(saveWithout) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("an ordinary by-hand visit to the same route is untouched — no from=monitor, still LOGGED BY HAND and BY FEEL", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();

    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.getByText(
        `${formatLogDate(new Date().toISOString())} · LOGGED BY HAND`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("BY FEEL")).toBeInTheDocument();
  });

  it("a from=monitor arrival that DOES have a record — one for another workout — still reads LOGGED BY HAND: the label is pinned to 'no record at all', never to 'the gate missed'", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const { run } = buildMonitorFixture();
    saveMonitorRun({ ...run, workoutId: "some-other-workout" });

    await renderManualLog(workout.id, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    expect(
      screen.getByText(
        `${formatLogDate(new Date().toISOString())} · LOGGED BY HAND`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NO MONITOR READING/)).not.toBeInTheDocument();
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

// Task 1 (lost-monitor design spec): a `from=monitor` arrival that finds no
// usable record is exactly the flagship shape ("a from=monitor arrival with
// NO record") — each of `monitorModeRun`'s four remaining conditions (the
// flag itself is condition 1 and never logged: it means this page load was
// never a monitor arrival at all, not that evidence went missing) now
// appends WHICH one missed onto its own `ergomatic:log-door-misses` stash,
// which `readMonitorLogStash` merges onto the session's exported ring — so
// the never-rowed case's evidence is reachable through ONE copy affordance
// as a single artifact. Records only which condition, never why.
//
// FIX ROUND (whole-branch review, MEDIUM): these entries used to be
// appended straight onto `ergomatic:last-session-log`, which
// `useMonitorSession.ts`'s teardown overwrites wholesale milliseconds
// later — see the ordering describe below for the sequence, and
// `recordLogDoorMiss`'s own comment for why a SEPARATE key is the fix
// rather than a merge.
describe("LogSession: monitorModeRun logs which condition missed onto the log-door stash", () => {
  function missEntries(): { kind: string; detail: string }[] {
    const raw = localStorage.getItem("ergomatic:log-door-misses");
    return raw === null
      ? []
      : (JSON.parse(raw) as { kind: string; detail: string }[]);
  }

  it("condition 1 (no from=monitor flag at all) logs nothing — an ordinary manual visit is not the silence this stash exists to catch", () => {
    const search = new URLSearchParams();
    monitorModeRun(search, MONITOR_WORKOUT_ID);
    expect(missEntries()).toHaveLength(0);
  });

  it("condition 2 (no record at all): logs no-run", () => {
    const search = new URLSearchParams("from=monitor");
    expect(loadMonitorRun()).toBeNull();
    monitorModeRun(search, MONITOR_WORKOUT_ID);
    const entries = missEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "log-door-miss",
      detail: "no-run",
    });
  });

  it("condition 2 (record not completed): logs not-completed", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun({ ...run, completedAt: null });
    const search = new URLSearchParams("from=monitor");
    monitorModeRun(search, MONITOR_WORKOUT_ID);
    expect(missEntries()[0]).toMatchObject({
      kind: "log-door-miss",
      detail: "not-completed",
    });
  });

  it("condition 3 (workoutId mismatch): logs workout-id-mismatch", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun({ ...run, workoutId: "some-other-workout" });
    const search = new URLSearchParams("from=monitor");
    monitorModeRun(search, MONITOR_WORKOUT_ID);
    expect(missEntries()[0]).toMatchObject({
      kind: "log-door-miss",
      detail: "workout-id-mismatch",
    });
  });

  it("condition 4 (buildMonitorLogSteps throws): logs log-steps-build-failed", () => {
    const { run } = buildMonitorFixture();
    const { logSeed: _drop, ...v1Shaped } = run;
    saveMonitorRun({ ...v1Shaped, v: 1 });
    const search = new URLSearchParams("from=monitor");
    monitorModeRun(search, MONITOR_WORKOUT_ID);
    expect(missEntries()[0]).toMatchObject({
      kind: "log-door-miss",
      detail: "log-steps-build-failed",
    });
  });

  it("a real, engaging arrival logs nothing at all", () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun(run);
    const search = new URLSearchParams("from=monitor");
    expect(monitorModeRun(search, MONITOR_WORKOUT_ID)).toStrictEqual(run);
    expect(missEntries()).toHaveLength(0);
  });

  // Same discipline `recordPostSacrifice`'s own capacity cap already has a
  // dedicated test for (this file's "POST sacrifice" describe block) —
  // `recordLogDoorMiss` caps this stash the same way `eventLog.ts`'s own
  // `record()` caps the ring: oldest entry dropped first, count never
  // grows past capacity.
  it("caps the stash at 500 entries, oldest dropped first", () => {
    const seeded = Array.from({ length: 500 }, (_, i) => ({
      seq: i,
      atMs: i,
      kind: "log-door-miss",
      detail: `entry ${i}`,
    }));
    localStorage.setItem("ergomatic:log-door-misses", JSON.stringify(seeded));
    const search = new URLSearchParams("from=monitor");
    expect(loadMonitorRun()).toBeNull();

    monitorModeRun(search, MONITOR_WORKOUT_ID);

    const entries = missEntries();
    expect(entries).toHaveLength(500);
    expect(entries[0]).toMatchObject({ seq: 1, detail: "entry 1" });
    expect(entries[499]).toMatchObject({
      kind: "log-door-miss",
      detail: "no-run",
    });
  });
});

// FIX ROUND (whole-branch review, MEDIUM) — THE ORDERING, WHICH THE TESTS
// ABOVE CANNOT SEE. They call `monitorModeRun` directly, so nothing in them
// ever exercises the one sequence the entry exists for: a `?from=monitor`
// hand-off. React runs the NEW route's render (where the miss is appended,
// out of `ManualDoorLog`'s lazy `useState`) before the OLD subtree's
// PASSIVE unmount cleanup — and `useMonitorSession.ts`'s `teardown` is
// exactly such a cleanup (`useEffect(() => teardown, [teardown])`), whose
// stash does a full `localStorage.setItem` of the same key the miss used to
// be appended onto. The entry was written and clobbered milliseconds later,
// on the one path it was built for, and every unit test passed.
describe("LogSession: the log-door miss survives the teardown that follows it", () => {
  /** Stands in for `ConnectedInterstitial`: a component whose PASSIVE
   *  unmount cleanup overwrites `ergomatic:last-session-log` with the
   *  session's exported ring, which is what `useMonitorSession.ts`'s own
   *  `teardown` does. Nothing here mocks the ordering — React's own commit
   *  order produces it. */
  function ConnectedStandIn({
    workoutId,
    exported,
  }: {
    workoutId: string;
    exported: string;
  }) {
    const navigate = useNavigate();
    useEffect(
      () => () => {
        localStorage.setItem("ergomatic:last-session-log", exported);
      },
      [exported],
    );
    return (
      <button
        type="button"
        onClick={() => navigate(`/library/${workoutId}/log?from=monitor`)}
      >
        HAND OFF
      </button>
    );
  }

  async function renderHandOff(workoutId: string, exported: string) {
    const { default: LogSession } = await import("./LogSession");
    return render(
      <MemoryRouter initialEntries={["/connected"]}>
        <Routes>
          <Route
            path="/connected"
            element={
              <ConnectedStandIn workoutId={workoutId} exported={exported} />
            }
          />
          <Route path="/library/:id/log" element={<LogSession />} />
          <Route path="/library/:id" element={<p>WORKOUT DETAIL SCREEN</p>} />
          <Route path="/today" element={<p>TODAY SCREEN</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("the connected hand-off's own teardown does not destroy the miss the log door just recorded", async () => {
    sessionStorage.removeItem("ergomatic:last-rowed-log");
    localStorage.removeItem("ergomatic:log-door-misses");
    // The flagship: armed, never pulled, so no `MonitorRun` was ever
    // created and the arrival misses on `no-run`.
    expect(loadMonitorRun()).toBeNull();
    // A device that has connected before — which is what the tester who
    // lost the workout had (recurring failure #3: the emptier fixture is
    // not the production one). This is also what makes the row RENDER:
    // `MonitorLogRow` gates on a mount-time read, and this session's own
    // teardown has not written yet at that moment. See the fix-round
    // report for the narrower gap that leaves on a device's very first
    // connected session.
    localStorage.setItem(
      "ergomatic:last-session-log",
      JSON.stringify([
        { seq: 0, atMs: 500, kind: "write", detail: "a previous session" },
      ]),
    );
    const exported = JSON.stringify([
      {
        seq: 0,
        atMs: 1000,
        kind: "close-no-record",
        detail: "endedBy=rower terminated=true",
      },
    ]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderHandOff(workout.id, exported);

    await userEvent.click(screen.getByRole("button", { name: "HAND OFF" }));
    await screen.findByRole("heading", { name: "Hoarfrost" });

    // The teardown DID run and DID overwrite the session key — this test
    // proves the miss survives it, not that it never happened.
    expect(localStorage.getItem("ergomatic:last-session-log")).toBe(exported);

    await userEvent.click(
      screen.getByRole("button", { name: "MONITOR LOG · COPY" }),
    );
    const copied = JSON.parse(
      writeText.mock.calls[0]![0] as string,
    ) as MonitorLogEntry[];
    expect(copied.map((e) => e.kind)).toStrictEqual([
      "close-no-record",
      "log-door-miss",
    ]);
    expect(copied[1]).toMatchObject({ detail: "no-run" });
    localStorage.removeItem("ergomatic:last-session-log");
    localStorage.removeItem("ergomatic:log-door-misses");
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
  // Trace-rendering spec (Phase LT spec 3), §1: the LIVE host's own
  // wiring — `PostWorkoutSummary`'s `series` prop is fed straight off
  // `monitorRun.series` at this door's own call site (`LogSession.tsx`).
  // `<TraceChart>` (Task 2) owns the chart's own math/gates; this test's
  // only job is proving the WIRING carries a real series through to a
  // visible chart, below the intervals block.
  it("renders the trace chart below the intervals block when the loaded run carries a series", async () => {
    const series: SeriesData = {
      samples: [
        { t: 0, d: 0, p: 1400, spm: 22, hr: 128 },
        { t: 200, d: 80, p: 1350, spm: 23, hr: 132 },
        { t: 400, d: 165, p: 1250, spm: 24, hr: 138 },
        { t: 600, d: 255, p: 1200, spm: 25, hr: 142 },
        { t: 800, d: 350, p: 1150, spm: 26, hr: 148 },
      ],
    };
    const { run, workout } = buildMonitorFixture({ series });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const figure = document.querySelector(".trace-figure");
    const intervals = document.querySelector(".summary-intervals");
    expect(figure).not.toBeNull();
    expect(intervals).not.toBeNull();
    expect(
      intervals!.compareDocumentPosition(figure!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders no trace chart when the loaded run has no series (a pre-spec-2 record, or one sacrificed at save time)", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(document.querySelector(".trace-figure")).not.toBeInTheDocument();
  });

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

    // Row 0 is the fixture's 4' EASY opener — an ordinary numbered row
    // since Phase WU (it was an unnumbered WARM-UP row before, measured-
    // shaped but never judged). Rows 1/2 are the two prescribed work
    // intervals: both carry a real avgSplit reading -> both
    // MEASURED, each showing its own elapsed time and pace (fmtDuration/
    // fmtSplit of the actual reading — the deviation NUMBERS/colors are
    // `summaryModel.test.ts`'s own concern, this screen only proves the
    // pace/time text renders).
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".summary-row"),
    );
    expect(rows).toHaveLength(3);
    // Phase WU replaced `expect(rows[0].className).toContain(
    // "summary-row-warmup")` here: that class, and the unnumbered row it
    // styled, no longer exist. Row 0 is numbered `1` like every other row.
    expect(rows[0]!.className).not.toContain("summary-row-warmup");
    expect(rows[0]!.querySelector(".summary-row-index")?.textContent).toBe("1");
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
    expect(rows).toHaveLength(3); // the easy opener + 2 work intervals
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
    // Row 1 (Hoarfrost, after the opener's row) carries no `actualSplit`
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
  // the manual form. LT-0: that form's own Discard now renders (it always
  // does, on this branch) — and, since a real record IS sitting in
  // storage, firing it clears that record too (`handleManualDiscardClick`'s
  // own doc comment: "a real, completed MonitorRun can be sitting in
  // MONITOR_RUN_KEY right now"). Behavioural proof of the fire lives in the
  // dedicated "own staged discard (LT-0)" describe block below; this test
  // stays scoped to what it always proved — the manual form (not the
  // monitor one) rendered — plus the one-line fact that Discard is no
  // longer absent.
  it("THE HIJACK PIN: no from=monitor flag + a stale completed MonitorRun for the SAME workout renders the manual form, now with Discard present (LT-0)", async () => {
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
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    ).toBeInTheDocument();
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
    // EVERY interval measured, including the 4' opener at index 0. Before
    // Phase WU this test used the fixture's default two actuals: interval 0
    // was a warm-up, `buildMonitorLogSteps` dropped its seed step, and only
    // two steps were ever POSTed. The opener is a real logged piece now, so
    // the fixture has to measure it — the alternative would have been to
    // relax the per-step assertions below, which is the wrong direction:
    // this test exists to prove every pm5 step carries its own readings.
    const { run, workout } = buildMonitorFixture({
      actuals: [
        {
          index: 0,
          elapsedSeconds: 240,
          distanceMeters: 800,
          avgSplit: 150,
          avgSpm: 20,
          avgHeartRateBpm: 120,
          restDistanceMeters: 0,
        },
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
      ],
    });
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
    // 3, not 2: Phase WU made the opener an ordinary logged step rather
    // than a warm-up seed step `buildMonitorLogSteps` skipped.
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.actualSource).toBe("pm5");
      expect(typeof step.avgHr).toBe("number");
      expect(typeof step.actualSeconds).toBe("number");
      expect(typeof step.actualMeters).toBe("number");
    }

    expect(loadMonitorRun()).toBeNull();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  // From-the-log spec §2: the monitor door is the one door with all THREE
  // heroes (avgSplit/time/distance — the machine's own total). Posted
  // straight from the same `buildSummaryModel` call this door's own
  // render path makes; `typeof` guards are the mutation catch (a body that
  // posted the pre-formatted STRING instead of the number goes red here).
  it("posts avgSplitSeconds/timeSeconds/distanceMeters as the model's own NUMBERS (not its display strings) — the monitor door's own three heroes", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-heroes-monitor" }), {
          status: 201,
        }),
      ),
    );
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.avgSplitSeconds).toBeDefined();
    expect(model.heroes.timeSeconds).toBeDefined();
    expect(model.heroes.distanceMeters).toBeDefined();

    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();

    const body = parsedBodies(apiFn)[0]!;
    expect(typeof body.avgSplitSeconds).toBe("number");
    expect(body.avgSplitSeconds).toBe(model.heroes.avgSplitSeconds);
    expect(typeof body.timeSeconds).toBe("number");
    expect(body.timeSeconds).toBe(model.heroes.timeSeconds);
    expect(typeof body.distanceMeters).toBe("number");
    expect(body.distanceMeters).toBe(model.heroes.distanceMeters);
    // Never the pre-formatted strings on these keys.
    expect(body.avgSplitSeconds).not.toBe(model.heroes.avgSplit);
    expect(body.timeSeconds).not.toBe(model.heroes.time);

    // Fix round 1, I5: the `=== model.heroes.X` checks above are
    // tautological against the SAME `buildSummaryModel` call — they'd
    // pass even if the tier logic were wrong. Pin the actual NUMBERS this
    // save writes to the row's own `distance_meters`/`time_seconds`/
    // `avg_split_seconds` columns, so a regression in what those columns
    // MEAN (work-only tier B here — `buildMonitorFixture`'s own
    // `defaultActuals`, no `summaryTotals`, restDistanceMeters 0 on both)
    // fails HERE, not only in `summaryModel.test.ts`'s own unit coverage.
    // Work-only: Σdistance 2000+10000=12000, Σelapsed 705+2500=3205,
    // avgSplit 500×3205/12000 (ONE quotient over the summed pair).
    expect(body.distanceMeters).toBe(12000);
    expect(body.timeSeconds).toBe(3205);
    expect(body.avgSplitSeconds).toBeCloseTo((500 * 3205) / 12000, 10);
  });

  // Phase LL Task 4 (design spec §4): the monitor door's own third
  // addition to the wire body, same optional-key idiom `deviceName`/
  // `series` already proved out — spread straight from `monitorRun.
  // endedBy`, never re-derived here.
  it("posts endedBy straight from the loaded MonitorRun when present", async () => {
    const { run, workout } = buildMonitorFixture({ endedBy: "link-lost" });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-endedby-monitor" }), {
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
    expect(body.endedBy).toBe("link-lost");
  });

  it("a MonitorRun with no endedBy at all (a v1/v2 record predating this task, or a run no writer has closed a new way) omits the key from the POST body", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-no-endedby-monitor" }), {
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
    expect("endedBy" in body).toBe(false);
  });

  // RC-1 (storage-spine design spec §3): the monitor door's fourth
  // addition to the wire body, same optional-key idiom `deviceName`/
  // `series`/`endedBy` already proved out — spread straight from
  // `monitorRun`'s own four fields, never re-derived here.
  //
  // **REAL, capture-derived, FRACTIONAL values (final whole-branch
  // review, BLOCKER-1) — not a hand-picked whole number.** These are
  // `walk-2026-08-16/session-2-wu-4unequal.jsonl`'s own seq
  // 246/779/1666/2607/2981, decoded through the branch's real
  // `toIntervalActual`/`computeWorkRestSums` (independently re-verified
  // during this fix wave, matching the review's own numbers exactly):
  // work 29.7+60.0+120.0+128.7+60.0 = 398.4s / 1535m, rest 0+30+30+30+0 =
  // 90s / 0+30+22+12+0 = 64m. `workSeconds` is fractional BY CONSTRUCTION
  // (0x0037's Split/Interval Time is tenths-precision,
  // `domain/monitor/pm5/parse.ts:232`) — a hand-picked integer here would
  // never have caught the route rejecting every real natural finish.
  it("posts workSeconds/workMeters/restSeconds/restMeters straight from the loaded MonitorRun when present — REAL fractional capture values, not a hand-picked whole number", async () => {
    const { run, workout } = buildMonitorFixture({
      workSeconds: 398.4,
      workMeters: 1535,
      restSeconds: 90,
      restMeters: 64,
    });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-workrest-monitor" }), {
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
    expect(body.workSeconds).toBe(398.4);
    expect(body.workMeters).toBe(1535);
    expect(body.restSeconds).toBe(90);
    expect(body.restMeters).toBe(64);
  });

  it("a MonitorRun with none of the four RC-1 fields (a record predating this PR, or closed some other way than a natural finish) omits all four keys from the POST body", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-no-workrest-monitor" }), {
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
    expect("workSeconds" in body).toBe(false);
    expect("workMeters" in body).toBe(false);
    expect("restSeconds" in body).toBe(false);
    expect("restMeters" in body).toBe(false);
  });

  // RC-3 (storage-spine design spec §2, PR 1 Task 7): the monitor door's
  // fifth addition to the wire body, same optional-key idiom
  // `deviceName`/`series`/`endedBy`/the four RC-1 fields already proved
  // out — spread straight from `monitorRun.summaryTotals`/`summaryDetail`/
  // `verificationBytes` (Tasks 2-4), never re-derived here.
  //
  // **REAL, capture-derived values — the terminate capture Task 4's own
  // brief cites (`lab-terminate-ring.json`) and the exact fixture
  // `machineSummary.integration.test.ts`'s `REALISTIC_SUMMARY` already
  // uses for the server round trip**: 24.3s/76m, avgStrokeRate 44 (the
  // capture's own pinned anomaly), dragFactorAverage 100, workoutType 1,
  // avgPaceSecondsPer500m 159.8, every heart-rate field null (no strap
  // worn), and the FULL 19-byte 0x003F verification payload (the real 8
  // captured bytes, zero-padded to the field's fixed width).
  const REALISTIC_VERIFICATION_BYTES = [
    118, 120, 230, 126, 35, 227, 228, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ] as const;
  const REALISTIC_SUMMARY_DETAIL: MachineSummaryDetail = {
    avgStrokeRate: 44,
    endingHeartRateBpm: null,
    avgHeartRateBpm: null,
    minHeartRateBpm: null,
    maxHeartRateBpm: null,
    dragFactorAverage: 100,
    workoutType: 1,
    recoveryHeartRateBpm: null,
    avgPaceSecondsPer500m: 159.8,
  };

  it("posts machineWorkSeconds/machineWorkMeters/machineSummary straight from the loaded MonitorRun's summary observations when present — REAL capture values, not hand-picked round fixtures", async () => {
    const { run, workout } = buildMonitorFixture({
      summaryTotals: { workElapsedSeconds: 24.3, workDistanceMeters: 76 },
      summaryDetail: REALISTIC_SUMMARY_DETAIL,
      verificationBytes: REALISTIC_VERIFICATION_BYTES,
    });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-machinesummary-monitor" }), {
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
    expect(body.machineWorkSeconds).toBe(24.3);
    expect(body.machineWorkMeters).toBe(76);
    expect(body.machineSummary).toStrictEqual({
      verificationBytes: [...REALISTIC_VERIFICATION_BYTES],
      ...REALISTIC_SUMMARY_DETAIL,
    });

    // Fix round 1, I5: this run is TIER A (summaryTotals present) — the
    // row's own `distance_meters`/`time_seconds`/`avg_split_seconds`
    // columns (posted as `distanceMeters`/`timeSeconds`/`avgSplitSeconds`)
    // now mean the MACHINE's own totals, verbatim, not a quotient of
    // ours: `Math.round(76)`, the raw 24.3, and the machine's own
    // `avgPaceSecondsPer500m` (159.8) straight off `summaryDetail`.
    expect(body.distanceMeters).toBe(76);
    expect(body.timeSeconds).toBe(24.3);
    expect(body.avgSplitSeconds).toBe(159.8);
  });

  it("a MonitorRun with no summaryTotals (a record predating this PR, or closed without the burst) omits machineWorkSeconds/machineWorkMeters/machineSummary from the POST body", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-no-machinesummary-monitor" }), {
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
    expect("machineWorkSeconds" in body).toBe(false);
    expect("machineWorkMeters" in body).toBe(false);
    expect("machineSummary" in body).toBe(false);
  });

  it("a build-738-era record (summaryTotals/verificationBytes present, summaryDetail absent — that build's writer never produced the field) posts a machineSummary carrying verificationBytes only", async () => {
    const { run, workout } = buildMonitorFixture({
      summaryTotals: { workElapsedSeconds: 24.3, workDistanceMeters: 76 },
      verificationBytes: REALISTIC_VERIFICATION_BYTES,
    });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-bytesonly-monitor" }), {
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
    expect(body.machineSummary).toStrictEqual({
      verificationBytes: [...REALISTIC_VERIFICATION_BYTES],
    });
  });

  // Step 1c: `machineWorkMeters` is `Math.round(workDistanceMeters)`, never
  // the raw tenths-precision wire value truncated or passed through as-is
  // — 0x0039's own meters field is `readU24LE/10`
  // (`domain/monitor/pm5/parse.ts`), so a genuine reading can land on a
  // half-metre boundary. 500.5 is chosen specifically because floor and
  // round disagree on it (floor -> 500, round -> 501), so this assertion
  // cannot pass by accident of a wrong-but-adjacent implementation.
  // NOT capture-derived, unlike `REALISTIC_SUMMARY_DETAIL`/
  // `REALISTIC_VERIFICATION_BYTES` above: no committed capture in this
  // branch has a fractional `workDistanceMeters` example to cite
  // verbatim. It is wire-plausible (the field's own tenths precision
  // makes a value like this a genuine possible reading) but invented for
  // this test, chosen for the round/floor boundary it forces.
  it("machineWorkMeters is Math.round(summaryTotals.workDistanceMeters), not the raw fractional wire value", async () => {
    const { run, workout } = buildMonitorFixture({
      summaryTotals: { workElapsedSeconds: 199.9, workDistanceMeters: 500.5 },
    });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-roundmeters-monitor" }), {
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
    expect(body.machineWorkMeters).toBe(501);
    expect(body.machineWorkSeconds).toBe(199.9);
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

  // Series capture spec (2026-08-19), §3: the POST body attaches `series`
  // straight from the loaded run when present.
  it("omits series from the POST body when the run has none", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-no-series" }), {
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
    expect("series" in body).toBe(false);
  });

  it("attaches series on the wire body when the run has one — the success leg", async () => {
    const series: SeriesData = {
      samples: [
        { t: 10, d: 23, p: 1400, spm: 24, hr: 138 },
        { t: 20, d: 47, p: 1350, spm: 25 },
      ],
    };
    const { run, workout } = buildMonitorFixture({ series });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const clearSpy = mockMonitorRunClearSpy();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-with-series" }), {
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
    expect(body.series).toStrictEqual(series);
    expect(loadMonitorRun()).toBeNull();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  // Series capture spec (2026-08-19), §3: THE POST SACRIFICE — the
  // red-provable 413 leg. A non-ok response to a body carrying `series`
  // retries ONCE with the key omitted; the log saves series-less rather
  // than failing outright.
  it("the sacrifice retry: a 413 on the first POST retries once without series, and the log saves series-less", async () => {
    const series: SeriesData = {
      samples: [{ t: 10, d: 23, p: 1400, spm: 24, hr: 138 }],
    };
    const { run, workout } = buildMonitorFixture({ series });
    saveMonitorRun(run);
    // LOW-3 (fix round, RULED): seed the diagnostics stash a real rowed
    // session would already carry (`useMonitorSession.ts`'s own teardown
    // write) — proves the sacrifice APPENDS to it, never replaces or
    // ignores whatever the live session already logged. `beforeEach`
    // above clears localStorage, never sessionStorage (this file's own
    // "quiet door" describe block above uses the identical
    // remove-then-set idiom for the same reason), so this removes any
    // leftover key from a prior test before seeding a known value.
    sessionStorage.removeItem("ergomatic:last-rowed-log");
    sessionStorage.setItem(
      "ergomatic:last-rowed-log",
      JSON.stringify([
        { seq: 0, kind: "session-start", detail: "prior entry" },
      ]),
    );
    mockWorkouts([workout]);
    mockBaselines();
    const clearSpy = mockMonitorRunClearSpy();
    let calls = 0;
    const apiFn = mockApi(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "payload too large" }), {
            status: 413,
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: "log-sacrificed" }), {
          status: 201,
        }),
      );
    });
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[0]!.series).toStrictEqual(series);
    expect("series" in bodies[1]!).toBe(false);
    // The retried body is otherwise byte-identical — only `series` is
    // genuinely gone (not present-and-undefined: `bodies[1]` came back
    // through a real JSON.parse, so the key is truly absent, and the
    // comparison object below is built the same way — a spread with an
    // `undefined` value would leave the key PRESENT and fail
    // `toStrictEqual` against a body that never had it).
    const { series: _droppedSeries, ...firstWithoutSeries } = bodies[0]!;
    expect(bodies[1]).toStrictEqual(firstWithoutSeries);
    // A genuine 201 (even on the retry) clears MonitorRun exactly once,
    // same as the ordinary success leg.
    expect(loadMonitorRun()).toBeNull();
    expect(clearSpy).toHaveBeenCalledTimes(1);

    // LOW-3: the POST sacrifice ring-logs itself — the prior entry
    // survives (APPEND, not overwrite), and one new entry names the
    // sacrifice with the status (413) that triggered it.
    const ring = JSON.parse(
      sessionStorage.getItem("ergomatic:last-rowed-log")!,
    ) as { seq: number; kind: string; detail: string }[];
    expect(ring).toHaveLength(2);
    expect(ring[0]).toStrictEqual({
      seq: 0,
      kind: "session-start",
      detail: "prior entry",
    });
    expect(ring[1]!.kind).toBe("post-sacrifice");
    expect(ring[1]!.detail).toContain("413");
    expect(ring[1]!.seq).toBe(1);
    sessionStorage.removeItem("ergomatic:last-rowed-log");
  });

  // Task 4 handoff (task-2 review): `recordPostSacrifice` appends to the
  // SAME stash `eventLog.ts`'s own live `record()` writes to, but it is a
  // second, independent writer — without its own cap it would let the
  // stash grow unboundedly across repeated sacrifices in one sitting
  // (retried saves after a workout deletion, a flaky network), unlike
  // every entry `record()` itself ever wrote. Same ring discipline
  // `eventLog.ts`'s own `record()` applies (`DEFAULT_CAPACITY`, 500):
  // oldest entries drop first, `seq` numbers are never rewritten (the
  // dropped entries' own seqs are simply gone, exactly like the live
  // log's own ring).
  it("the POST sacrifice's own ring append is capped at 500 entries, oldest dropped first — the same discipline eventLog.ts's record() applies", async () => {
    const series: SeriesData = {
      samples: [{ t: 10, d: 23, p: 1400, spm: 24, hr: 138 }],
    };
    const { run, workout } = buildMonitorFixture({ series });
    saveMonitorRun(run);
    // Seed a stash already AT capacity (500 entries, seq 0..499) — one
    // more sacrifice append must drop the oldest (seq 0), not grow past
    // 500.
    sessionStorage.removeItem("ergomatic:last-rowed-log");
    const seeded = Array.from({ length: 500 }, (_, i) => ({
      seq: i,
      kind: "session-start",
      detail: `entry ${i}`,
    }));
    sessionStorage.setItem("ergomatic:last-rowed-log", JSON.stringify(seeded));
    mockWorkouts([workout]);
    mockBaselines();
    mockMonitorRunClearSpy();
    let calls = 0;
    const apiFn = mockApi(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "payload too large" }), {
            status: 413,
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: "log-capped" }), { status: 201 }),
      );
    });
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);

    const ring = JSON.parse(
      sessionStorage.getItem("ergomatic:last-rowed-log")!,
    ) as { seq: number; kind: string; detail: string }[];
    // Still exactly 500 — the append pushed the count to 501, then the
    // cap trimmed the OLDEST one entry off the front.
    expect(ring).toHaveLength(500);
    // seq 0 (the oldest seeded entry) is gone; seq 1 (the next-oldest) is
    // now the first surviving entry.
    expect(ring[0]).toStrictEqual({
      seq: 1,
      kind: "session-start",
      detail: "entry 1",
    });
    // The newest surviving entry is the sacrifice itself, seq 500 — never
    // renumbered by the cap.
    const newest = ring[ring.length - 1]!;
    expect(newest.kind).toBe("post-sacrifice");
    expect(newest.seq).toBe(500);
    expect(newest.detail).toContain("413");
    sessionStorage.removeItem("ergomatic:last-rowed-log");
  });

  it("the sacrifice retry ALSO fails: surfaces the genuine error, MonitorRun survives for a real retry", async () => {
    const series: SeriesData = {
      samples: [{ t: 10, d: 23, p: 1400, spm: 24, hr: 138 }],
    };
    const { run, workout } = buildMonitorFixture({ series });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const clearSpy = mockMonitorRunClearSpy();
    let calls = 0;
    const apiFn = mockApi(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "payload too large" }), {
            status: 413,
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      );
    });
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    expect(loadMonitorRun()).not.toBeNull();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  // Fix round (MED-1): the two retries must COMPOSE — a workout deleted
  // mid-session (400 workoutId) followed by a genuine failure on the
  // CORRECTED body (which still carries `series`) must sacrifice `series`
  // from that corrected body, never re-post the original's now-stale
  // workoutId. Before the fix, the sacrifice rebuilt from the ORIGINAL
  // `body` — the corrected retry's own body was discarded, so the
  // "sacrifice" re-sent the stale workoutId and 400ed again, guaranteed,
  // surfacing a failure §3 promises can never happen.
  it("MED-1: workoutId correction survives into the sacrifice — deleted workout + series both recoverable, the log saves series-less", async () => {
    const series: SeriesData = {
      samples: [{ t: 10, d: 23, p: 1400, spm: 24, hr: 138 }],
    };
    const { run, workout } = buildMonitorFixture({ series });
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const clearSpy = mockMonitorRunClearSpy();
    let calls = 0;
    const apiFn = mockApi(() => {
      calls++;
      if (calls === 1) {
        // Leg 1: the workout was deleted mid-session — 400, field
        // workoutId.
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
      if (calls === 2) {
        // Leg 2: the CORRECTED body (workoutId: null, series still
        // present) still fails — a 413, this route's own ceiling.
        return Promise.resolve(
          new Response(JSON.stringify({ error: "payload too large" }), {
            status: 413,
          }),
        );
      }
      // Leg 3: the sacrifice — corrected workoutId AND no series — saves.
      return Promise.resolve(
        new Response(JSON.stringify({ id: "log-med1" }), { status: 201 }),
      );
    });
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(3);
    const bodies = parsedBodies(apiFn);
    expect(bodies[0]!.workoutId).toBe(MONITOR_WORKOUT_ID);
    expect(bodies[0]!.series).toStrictEqual(series);
    // Leg 2: the correction carried forward — workoutId null, series
    // STILL present (this is what the original bug discarded).
    expect(bodies[1]!.workoutId).toBeNull();
    expect(bodies[1]!.series).toStrictEqual(series);
    // Leg 3: BOTH corrections present at once — the workoutId fix from
    // leg 2 survives, AND series is now gone.
    expect(bodies[2]!.workoutId).toBeNull();
    expect("series" in bodies[2]!).toBe(false);
    expect(loadMonitorRun()).toBeNull();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("a non-ok response with no series present never triggers a second POST", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      ),
    );
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
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

  it("LT-0: the plain manual door (no monitor run at all) now HAS a Discard — firing it navigates with storage byte-identical before and after (nothing was ever stored to clear)", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const clearSpy = mockMonitorRunClearSpy();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });

    // Nothing stored under either key before Discard fires — the pure
    // by-hand case the task brief names.
    expect(loadMonitorRun()).toBeNull();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );

    expect(
      await screen.findByText("WORKOUT DETAIL SCREEN"),
    ).toBeInTheDocument();
    // Byte-identical: still nothing stored under any of the three keys —
    // the discard had nothing real to clear, and cleared nothing.
    expect(loadMonitorRun()).toBeNull();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
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

  // Final-review FIX-3: the session and manual doors each have a real
  // "Save without logging posts advancesPlan:false" witness; the monitor
  // door only had one for the LEAD button ("Log against plan" ->
  // advancesPlan absent, above). This is the monitor door's own missing
  // half — clicking the demoted "Save without logging" button and reading
  // the posted body, not just trusting the test title above it.
  it("monitor door wire shape: with an active plan, Save without logging posts advancesPlan: false", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-monitor-plan-outside" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body.advancesPlan).toBe(false);
  });
});

// LT-0 (2026-08-18-target-truth-design.md §3, phase-open gates' own
// diagnosis): the manual door's plain (non-monitor) render was the app's
// only discard-less save surface — AND exactly where `monitorModeRun`'s
// four-condition gate falls through on any miss, including its own
// catch-all `catch {}`. James's early-END repro is almost certainly that
// fallthrough (a TestFlight binary, unproven against main — this file only
// pins main's own behaviour, per the task brief's own diagnosis note).
// Each force below drives the REAL UI through a genuine gate miss (never
// hand-calling `monitorModeRun` — that pure function already has its own
// describe block above) to the CONSEQUENCE the recurring-failures list
// requires: the stranded record actually gone from storage, not merely "a
// button exists."
describe("LogSession: the manual door's own staged discard (LT-0)", () => {
  // Force (a): the logSeed/program.intervals alignment check fails (the
  // same fixture shape as "condition 4 ... a logSeed whose length no
  // longer matches" in the monitorModeRun describe block above, driven
  // through the whole screen this time). `connectGuardStage()` is the
  // real, verified-against-code consequence a cleared MonitorRun produces
  // for the rower: Today.tsx itself renders NO row for any COMPLETED
  // MonitorRun (`UnloggedMonitorRow`'s own render-site guard is
  // `completedAt === null` — read at source, this file's own top-level
  // Today.tsx sweep) — the record's only visible trace is the "You have an
  // unlogged session" warning `ConnectAction`/`connectGuardStage` stage the
  // next time Connect (or Start) is pressed. The task brief's own looser
  // "Today shows no unlogged-session row" phrasing does not describe an
  // existing Today UI element for a completed run either way — noted here
  // rather than asserted on a screen that never renders one.
  it("force (a) corrupt logSeed.steps.length: the fallthrough door renders with Discard, and firing it clears the stranded MonitorRun", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun({
      ...run,
      logSeed: {
        steps: run.logSeed!.steps.slice(1),
        paces: run.logSeed!.paces,
      },
    });
    mockWorkouts([workout]);
    mockBaselines();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    // The plain manual shape rendered (BY FEEL), never the monitor one —
    // proves the gate genuinely missed rather than this test accidentally
    // exercising the monitor branch.
    expect(screen.getByText("BY FEEL")).toBeInTheDocument();
    expect(loadMonitorRun()).not.toBeNull();
    expect(connectGuardStage()).toBe("unlogged");

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
    expect(connectGuardStage()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Force (b): the same fixture shape as "condition 3 (workoutId match)
  // removed" above — the stored record's own workoutId disagrees with this
  // route's :id.
  it("force (b) mismatched workoutId: the fallthrough door renders with Discard, and firing it clears the stranded MonitorRun", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun({ ...run, workoutId: "some-other-workout" });
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(screen.getByText("BY FEEL")).toBeInTheDocument();
    expect(loadMonitorRun()).not.toBeNull();

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
  });

  // Force (catch-all): the same fixture shape as the "never crashes the log
  // door" test above (a malformed `actuals` entry `buildMonitorLogSteps`
  // never anticipated) — `monitorModeRun`'s own condition-4 `catch {}`
  // disqualifies the record on ANY exception, not only its documented
  // `MonitorLogSeedError`.
  it("force (catch-all) malformed actuals entry: Discard still clears the stranded MonitorRun", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun({ ...run, actuals: [null as unknown as IntervalActual] });
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(screen.getByText("BY FEEL")).toBeInTheDocument();
    expect(loadMonitorRun()).not.toBeNull();

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
  });

  // (c): a genuine off-app entry with nothing under either key at all.
  it("(c) the pure by-hand door: Discard navigates with storage byte-identical (nothing before, nothing after) — clearMonitorRun is never even called", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const clearSpy = mockMonitorRunClearSpy();
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(loadMonitorRun()).toBeNull();

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
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("arms on the first press without clearing anything or navigating — the fallthrough record survives untouched", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun({ ...run, workoutId: "some-other-workout" });
    mockWorkouts([workout]);
    mockBaselines();
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
  });

  it("disarms on blur — a second press after focus moves away arms again instead of discarding", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun({ ...run, workoutId: "some-other-workout" });
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    const discardBtn = screen.getByRole("button", {
      name: "DISCARD WITHOUT SAVING",
    });
    await userEvent.click(discardBtn);
    fireEvent.blur(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );

    expect(
      screen.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    ).toBeInTheDocument();
    expect(loadMonitorRun()).not.toBeNull();
  });

  // Mirrors "leaves an unrelated live run/draft byte-identical in storage
  // after the monitor-mode discard fires" above, one door over: this
  // branch's own qualified exception (`clearMonitorRun()` directly, never
  // `discard.fire()`) must never touch an unrelated phone-timer session
  // sitting in `./draft`/`./run` while this door clears its own fallen-
  // through record.
  it("leaves an unrelated live draft/run byte-identical after the plain-manual door's discard clears a fallen-through MonitorRun", async () => {
    buildSessionFixture();
    const draftBefore = localStorage.getItem(DRAFT_KEY);
    const runBefore = localStorage.getItem(RUN_KEY);
    expect(draftBefore).not.toBeNull();
    expect(runBefore).not.toBeNull();

    const { run, workout } = buildMonitorFixture();
    saveMonitorRun({ ...run, workoutId: "some-other-workout" });
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

    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(draftBefore);
    expect(localStorage.getItem(RUN_KEY)).toBe(runBefore);
  });
});

// F6 Task 3 (spec 2b): the monitor door's own TIME hero stops reading
// wall-clock (`completedAt - startedAt`) entirely for a run the rower ended
// through Today's row (`endedBy: "interrupted"`) — that gap can span days
// between the row and the moment "Log it" was pressed — and the date comes
// from the run's OWN `startedAt`. RC-5 (hero-truth design spec,
// 2026-08-25) later redefines WHAT the TIME hero measures for a tier B
// (non-legacy) run — work-only, `tierBWorkTimeSeconds` in
// `summaryModel.ts` — rather than R-D's old work-plus-programmed-rest
// formula; the old formula's own number still renders, just on the TOTAL
// line beneath instead of the hero.
describe("LogSession: the interrupted header stops reading wall-clock (F6/R-D)", () => {
  it("an interrupted record shows measured minutes (work only, RC-5) as the TIME hero, not the day-long wall-clock gap, dated from startedAt", async () => {
    const { run, workout } = buildMonitorFixture({
      // Only interval 1 (Hoarfrost's time work, restSeconds 300 per its own
      // auto-inserted rest phase) measured — interval 2 never reached.
      // work 360s = 6:00 exactly (RC-5: work-only, the rest goes to the
      // TOTAL line instead): nowhere near the day-long wall-clock gap
      // below.
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
    // Scoped to the hero value specifically — this fixture's own interval
    // row ALSO reads "6:00" (the same 360s actual, rendered a second time
    // as its own row's time cell), so a bare `getByText("6:00")` is
    // ambiguous.
    expect(
      screen.getByText("6:00", { selector: ".summary-hero-value" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1440:00/)).not.toBeInTheDocument();
    expect(screen.getByText(/^AUG 1 ·/)).toBeInTheDocument();
    expect(screen.queryByText(/^AUG 2/)).not.toBeInTheDocument();
    // Fix round 1 (I2/I3): the TOTAL line's rest now comes ONLY from the
    // measured-rest ladder (RC-1's stored pair, or every actual's own
    // restSeconds+restDistanceMeters together) — never the program's
    // programmed rest. This fixture's one actual carries
    // `restDistanceMeters: 0` but no `restSeconds` at all, so the pair is
    // INCOMPLETE and no rest is derivable: the total renders work-only,
    // with no rest clause — "6:00 total", identical to the hero above
    // (an honest, if redundant, "we don't know the rest" reading, not the
    // old fused "11:00" the pre-fix-round code would have shown).
    expect(screen.getByText("6:00 total")).toBeInTheDocument();
  });

  // Final-review FIX-4: this test used to claim "wall-clock minutes" but
  // the value it asserted ("58:25") was R-D's MEASURED formula (work +
  // completed rest) — the same one the interrupted case above used. RC-5
  // (hero-truth) moved that population off the TIME hero, which is now
  // work-only ("53:25"); fix round 1 (I2/I3) further scoped the TOTAL
  // line to the wire's own MEASURED rest, which this fixture's actuals
  // don't carry (see below) — so "58:25" doesn't appear anywhere on this
  // screen any more, not even relocated. The monitor door's TIME hero is
  // still never wall-clock (this module's
  // own header: "R-D is monitor-only" applies unconditionally, not just
  // when `endedBy === "interrupted"` — RC-5 only changed WHICH measured
  // formula feeds the hero, not that it's measured at all); the "inverse
  // pin" this test actually performs is that dateLabel switches source
  // (completedAt here vs. startedAt above) while TIME stays on a measured
  // formula either way.
  it("inverse pin: a normal-completion record (no endedBy) shows the same MEASURED time as the interrupted case, never wall-clock, dated from completedAt", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    // Work-only (RC-5): 705+2500 = 3205s -> "53:25".
    expect(screen.getByText("53:25")).toBeInTheDocument();
    // Fix round 1 (I2/I3): both of this fixture's actuals carry
    // `restDistanceMeters: 0` but neither carries `restSeconds` — the
    // measured-rest pair is INCOMPLETE, so no rest is derivable (never
    // the program's own programmed rest, which the pre-fix-round code
    // would have summed to "58:25 total"). The total renders work-only,
    // with no rest clause: identical to the hero, "53:25 total".
    expect(screen.getByText("53:25 total")).toBeInTheDocument();

    // Negative guard computed from the fixture's OWN timestamps (not a
    // hand-typed literal) so a regression that swaps the measured formula
    // back for `completedAt - startedAt` is actually caught: this fixture's
    // wall-clock span is a real, different number ("20:00"), unlike the
    // interrupted test above where the wall-clock gap ("1440:00") could
    // never collide with the measured value by coincidence.
    const wallClockSeconds =
      (new Date(run.completedAt!).getTime() -
        new Date(run.startedAt).getTime()) /
      1000;
    const wallClockLabel = fmtDuration(wallClockSeconds / 60);
    expect(wallClockLabel).toBe("20:00"); // sanity: distinct from "53:25"
    expect(screen.queryByText(wallClockLabel)).not.toBeInTheDocument();

    // dateLabel from completedAt (restored — the review found this
    // assertion had been dropped).
    const dateLabel = formatLogDate(run.completedAt!);
    expect(screen.getByText(new RegExp(`^${dateLabel} ·`))).toBeInTheDocument();
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

  it("session door: renders the form immediately while the plan is still loading, with no Log against plan button, and Save OMITS the advancesPlan key (review finding C2)", async () => {
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
    // Fix round (review finding C2): the plan fetch never resolved by the
    // time Save was tapped, so this button's own click cannot know whether
    // an active plan exists to opt out of — sending `advancesPlan:false`
    // here would silently drop `doneN` advancement for a plan the UI simply
    // hadn't learned about yet. Omitting the key lets the server's own
    // `?? true` default (`data.ts`) run, the same behavior the old,
    // now-retired toggle had (its key was never sent until the plan
    // resolved either).
    expect(body).not.toHaveProperty("advancesPlan");
  });

  it("session door: plan-hook error also OMITS the advancesPlan key on Save (review finding C2's second case)", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    mockPlan({ state: "error", retry: vi.fn() });
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-plan-errored" }), {
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
    expect(body).not.toHaveProperty("advancesPlan");
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

  // Phase 6I, narrowed by Phase 8A (James's ruling 5, 2026-08-22): the
  // demotion protects a NO-BASELINE account rowing its intro test — that
  // population, not the title alone. Baselines resolved-null here, the
  // condition's real second input.
  it("Phase 6I: a designated onboarding workout on a NO-BASELINE account leads with Save without logging", async () => {
    mockPlan(readyPlanState(activePlan()));
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    const { workout } = buildOnboardingSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "6K Test" });

    const lead = screen.getByRole("button", { name: "Save without logging" });
    expect(lead.className).toContain("summary-save-lead");
    const secondary = screen.getByRole("button", {
      name: /Log against plan/,
    });
    expect(secondary.className).toContain("summary-save-secondary");
  });

  // Phase 8A (James's ruling 5, 2026-08-22, the gates' blocking find): on
  // a checkpoint day — a BASELINED rower whose plan prescribes the very
  // test title 6I keyed on — `Log against plan` must LEAD, or the
  // non-advancing lead save writes plan_key/plan_index NULL, done_n never
  // passes 6, and Today re-serves the checkpoint forever (the soft-lock).
  // The condition is DERIVED from the workout title + the account's real
  // baselines state; this test builds both real inputs and cannot pass if
  // the derivation breaks.
  it("Phase 8A: a baselined rower's onboarding-titled checkpoint leads with Log against plan", async () => {
    mockPlan(readyPlanState(activePlan()));
    mockBaselines({ k2Seconds: 112, k6Seconds: 122 });
    const { workout } = buildOnboardingSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "6K Test" });

    const lead = screen.getByRole("button", {
      name: "Log against plan · SESSION 4 OF 84",
    });
    expect(lead.className).toContain("summary-save-lead");
    expect(
      screen.getByRole("button", { name: "Save without logging" }).className,
    ).toContain("summary-save-secondary");
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

  // Review finding C2, manual door: the same fix applies at this door's own
  // (separately closed-over) `saveWithoutLoggingOpts` — a plan fetch still
  // in flight must not assert `advancesPlan:false` here either.
  it("manual door wire shape: while the plan is still loading, Save OMITS the advancesPlan key", async () => {
    mockPlan({ state: "loading" });
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-manual-plan-loading" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(workout.id);
    await screen.findByRole("heading", { name: "Hoarfrost" });
    expect(
      screen.queryByRole("button", { name: /Log against plan/ }),
    ).not.toBeInTheDocument();
    await chooseHeldAndPain();
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body).not.toHaveProperty("advancesPlan");
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
  // button order is a pure render-time computation from plan/title/
  // baselines, none of which a failed save touches).
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

// ---------------------------------------------------------------------------
// Phase BL PR B (baseline-onboarding spec rev 2, "The post-test prompt"):
// after a SUCCESSFUL save of a designated test with a measurable, complete
// result, the door renders the post-save offer instead of navigating, and
// fires the test-history record keyed to the log the 201 just minted —
// accept or decline, the record happens (James's ruling; the decouple is
// commit 1's POST /api/test-history). Everything here drives the REAL
// doors end to end with the REAL seed test workouts.
// ---------------------------------------------------------------------------

// The real "2K Test" seed workout driven through the timer pipeline to a
// COMPLETED run with a realistic measured stopwatch actual: 2000m at
// 118.4 s/500m -> elapsed 473.6s (an all-out ~1:58 pace, inside the
// storable 60..240 band — unlike the e2e fast-forward arcs' 35 s/500m,
// which the band deliberately rejects).
function buildK2TestSessionFixture(): {
  run: SessionRun;
  workout: LibraryWorkout;
} {
  const seed = ONBOARDING_LIBRARY_WORKOUTS.find(
    (w) => w.title === ONBOARDING_TITLES.k2,
  )!;
  const draft = buildDraft({
    id: "id-2ktest-fixture",
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
    completedAt: new Date(FIXED_NOW.getTime() + 8 * 60 * 1000).toISOString(),
    actuals: {
      0: {
        elapsedSeconds: 473.6,
        splitSeconds: 118.4,
        actualSource: "stopwatch",
      },
    },
  };
  saveRun(run);
  const workout: LibraryWorkout = {
    id: "id-2ktest-fixture",
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

const K2_MONITOR_WORKOUT_ID = "3b241101-e2bb-4255-8caf-4136c566a962";

// The real "2K Test" seed workout as a COMPLETED MonitorRun — the
// connected door's shape, same buildDraft -> buildRun -> compileProgram ->
// buildLogSeed pipeline as buildMonitorFixture above, with the machine's
// own close reason parameterized: "finished" is WORKOUTEND (the programmed
// distance is complete); anything else is not proven complete.
function buildK2TestMonitorFixture(endedBy: MonitorRun["endedBy"]): {
  run: MonitorRun;
  workout: LibraryWorkout;
} {
  const seed = ONBOARDING_LIBRARY_WORKOUTS.find(
    (w) => w.title === ONBOARDING_TITLES.k2,
  )!;
  const draft = buildDraft({
    id: K2_MONITOR_WORKOUT_ID,
    title: seed.title,
    type: seed.type,
    steps: seed.steps,
  });
  const started = startDraft(draft);
  const built = buildRun(started, null, FIXED_NOW);
  const program = compileOrThrow(built.phases);
  const logSeed = buildLogSeed(built.phases, null);
  const run: MonitorRun = {
    v: 2,
    workoutId: K2_MONITOR_WORKOUT_ID,
    title: seed.title,
    program,
    logSeed,
    actuals: [
      {
        index: 0,
        elapsedSeconds: 473.6,
        distanceMeters: 2000,
        avgSplit: 118.4,
        avgSpm: 30,
        avgHeartRateBpm: 168,
        restDistanceMeters: 0,
      },
    ],
    deviceName: "PM5 432331249 Row",
    startedAt: FIXED_NOW.toISOString(),
    completedAt: new Date(FIXED_NOW.getTime() + 8 * 60 * 1000).toISOString(),
    terminated: endedBy !== "finished",
    ...(endedBy !== undefined ? { endedBy } : {}),
  };
  const workout: LibraryWorkout = {
    id: K2_MONITOR_WORKOUT_ID,
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

function promptAwareApi() {
  return mockApi((path) => {
    if (path === "/api/logs") {
      return new Response(JSON.stringify({ id: SAVED_LOG_ID }), {
        status: 201,
      });
    }
    if (path === "/api/test-history") {
      return new Response(JSON.stringify({ id: "th-1" }), { status: 201 });
    }
    // The prompt's own PUT /api/baselines accepts.
    return new Response(JSON.stringify({ k2Seconds: 118.4, k6Seconds: null }), {
      status: 200,
    });
  });
}

const SAVED_LOG_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("LogSession: the post-test prompt (Phase BL PR B)", () => {
  it("a completed 2K Test timer save shows the offer instead of navigating, and records to test history keyed to the saved log", async () => {
    const { workout } = buildK2TestSessionFixture();
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    const apiFn = promptAwareApi();
    await renderLog();
    await screen.findByRole("heading", { name: "2K Test" });

    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    // The prompt, not Today.
    expect(
      await screen.findByRole("heading", { name: "Set your 2k baseline?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("TODAY SCREEN")).not.toBeInTheDocument();
    expect(screen.getByText("1:58.4")).toBeInTheDocument();

    // Recording fired exactly once, BEFORE any prompt answer, keyed to
    // the id the 201 minted — accept or decline changes nothing about it.
    const recordCalls = apiFn.mock.calls.filter(
      ([path]) => path === "/api/test-history",
    );
    expect(recordCalls).toHaveLength(1);
    expect(
      JSON.parse((recordCalls[0]![1] as RequestInit).body as string),
    ).toStrictEqual({
      distance: "2k",
      splitSeconds: 118.4,
      logId: SAVED_LOG_ID,
    });

    // The save itself behaved exactly as before: records cleared.
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  it("declining lands on Today with the baseline untouched — recording already happened", async () => {
    const { workout } = buildK2TestSessionFixture();
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    const apiFn = promptAwareApi();
    await renderLog();
    await screen.findByRole("heading", { name: "2K Test" });
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByRole("heading", { name: "Set your 2k baseline?" });

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(
      apiFn.mock.calls.filter(([path]) => path === "/api/baselines"),
    ).toHaveLength(0);
  });

  it("accepting writes tested, then the derive offer writes the counterpart as derived — the full loop from the door", async () => {
    const { workout } = buildK2TestSessionFixture();
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    const apiFn = promptAwareApi();
    await renderLog();
    await screen.findByRole("heading", { name: "2K Test" });
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByRole("heading", { name: "Set your 2k baseline?" });

    await userEvent.click(
      screen.getByRole("button", { name: "Set 2k baseline" }),
    );
    await screen.findByRole("heading", { name: "Also set your 6k?" });
    await userEvent.click(
      screen.getByRole("button", { name: "Set 6k estimate" }),
    );
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();

    const baselinePuts = apiFn.mock.calls
      .filter(([path]) => path === "/api/baselines")
      .map(([, init]) =>
        JSON.parse((init as RequestInit).body as string),
      ) as Record<string, unknown>[];
    expect(baselinePuts).toStrictEqual([
      { k2Seconds: 118.4, k2Source: "tested" },
      { k6Seconds: 125.4, k6Source: "derived" },
    ]);
  });

  it("a FINISHED 2K Test monitor save shows the offer from the connected door too", async () => {
    const { run, workout } = buildK2TestMonitorFixture("finished");
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    const apiFn = promptAwareApi();
    await renderManualLog(K2_MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "2K Test" });

    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByRole("heading", { name: "Set your 2k baseline?" }),
    ).toBeInTheDocument();
    expect(loadMonitorRun()).toBeNull();
    expect(
      apiFn.mock.calls.filter(([path]) => path === "/api/test-history"),
    ).toHaveLength(1);
  });

  // The COMPLETENESS GUARD at door level (spec M2, binding): an
  // interrupted run measured a real average split over PART of the
  // programmed distance — offering it as a 2k baseline would store a
  // wrong number wearing a tested source. No offer, no record.
  it("an INTERRUPTED 2K Test monitor save navigates straight to Today — no offer, no record", async () => {
    const { run, workout } = buildK2TestMonitorFixture("interrupted");
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    const apiFn = promptAwareApi();
    await renderManualLog(K2_MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "2K Test" });

    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Set your 2k baseline?" }),
    ).not.toBeInTheDocument();
    expect(
      apiFn.mock.calls.filter(([path]) => path === "/api/test-history"),
    ).toHaveLength(0);
  });

  // WHERE THE NUMBER COMES FROM (spec M1): a manual log produces no
  // heroes at all (buildManualModel), so a hand-logged "2K Test" never
  // prompts — the You editor stays the honest path for a remembered
  // number.
  it("a MANUAL 2K Test log never prompts and never records — there is no measured number", async () => {
    const seed = ONBOARDING_LIBRARY_WORKOUTS.find(
      (w) => w.title === ONBOARDING_TITLES.k2,
    )!;
    const workout: LibraryWorkout = {
      id: "id-2ktest-manual",
      title: seed.title,
      type: seed.type,
      difficulty: seed.difficulty,
      pain: seed.pain,
      steps: seed.steps,
      isGlobal: true,
      lastDoneDaysAgo: null,
    };
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    const apiFn = promptAwareApi();
    await renderManualLog("id-2ktest-manual");
    await screen.findByRole("heading", { name: "2K Test" });

    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(
      apiFn.mock.calls.filter(([path]) => path === "/api/test-history"),
    ).toHaveLength(0);
  });
});

describe("LogSession: the post-test prompt's degrade arms (Phase BL PR B)", () => {
  it("an unparseable 201 body still shows the offer — only the record call (which needs the id) is skipped", async () => {
    const { workout } = buildK2TestSessionFixture();
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    const apiFn = mockApi((path) => {
      if (path === "/api/logs") {
        return new Response("not json at all", { status: 201 });
      }
      return new Response("{}", { status: 200 });
    });
    await renderLog();
    await screen.findByRole("heading", { name: "2K Test" });

    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByRole("heading", { name: "Set your 2k baseline?" }),
    ).toBeInTheDocument();
    expect(
      apiFn.mock.calls.filter(([path]) => path === "/api/test-history"),
    ).toHaveLength(0);
  });

  it("declining from the monitor door lands on Today via the replace navigation", async () => {
    const { run, workout } = buildK2TestMonitorFixture("finished");
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    promptAwareApi();
    await renderManualLog(K2_MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "2K Test" });
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByRole("heading", { name: "Set your 2k baseline?" });

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });
});
