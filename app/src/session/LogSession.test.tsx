import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
 *  deliberately dropped — SessionComplete.test.tsx's own
 *  `completeDraftAndRun` does the same for the identical reason: a live
 *  reps marker would repeat the APPENDED distance step too, which isn't the
 *  shape this fixture wants. Phases: 0 work (time, 6k+12), 1
 *  rest (5'), 2 work (distance, 6k+12) — the LAST phase gets a real
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
// since this workout needs none. Proves the session door's own outside-plan
// DEFAULT, not the manual door's (see `useLogForm`'s own header comment on
// why only the session door's title is known synchronously at hook-init).
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
// compileProgram -> buildLogSeed` pipeline (this file's own "realistic
// fixture" idiom, matching `logDraft.test.ts`'s `WALK4_RUN` for the
// identical reason: the alignment contract between `logSeed.steps` and
// `program.intervals` is proven, not hand-typed past). Program intervals:
// [0] warmup, [1] work (time, Hoarfrost), [2] work (distance, Calm Sea) —
// `IntervalActual.index` below is a position in THAT array, so a "both
// measured" actuals list uses index 1 and 2, never 0 (the warmup interval,
// which `buildMonitorLogSteps` never surfaces a step for at all). Since
// 2026-08-09's warmup setting that leading warm-up comes from the rower's
// PREFERENCE (`buildRun`'s fourth argument — its one producer), not from a
// `wu` step; keeping it here is deliberate, since the alignment contract
// this fixture exists to prove is exactly the one a non-logging interval
// can break.
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
  // NOT equal to their own targets (132s both, same as
  // buildSessionFixture's own choice) so an ACTUAL line is genuinely new
  // information, not a repeat of the target above it.
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
    // (Concept2's own naming, verbatim — pm5-interface-notes.md's hardware
    // sessions throughout; Task 3's own server fixtures already use this
    // exact string: server/routes/data.test.ts, stores.integration.test.ts).
    // Fix round 1 (review finding #2): an earlier version of this fixture
    // dropped the suffix, believing it a brief typo — it is real, and
    // `deviceName` is never parsed/trimmed anywhere in the client or
    // server, so it must round-trip through this screen exactly as
    // hardware would actually report it.
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

// Phase 6I close-out fold (Task 2's deferred ledger item): the real
// "First 6k" seed workout (server/seed/library/onboarding.ts) — an
// effort-only workout (`needsBaselines()` reads false), unlike
// `manualWorkoutFixture()`'s split-ref mix above. Proves the manual door
// opens for it even with both baselines null, instead of the unconditional
// `baselines === null` block that used to gate every workout alike.
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
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    // +5s nudge on the work step (index 0) — the same shape a WorkoutDetail
    // preview nudge bakes in via `buildNudgedDraft` (fast-follow Task 4).
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
describe("LogSession: the monitor log's quiet door (7B iteration)", () => {
  it("absent entirely when no rowed stash exists — the manual path never sees it", async () => {
    sessionStorage.removeItem("ergomatic:last-rowed-log");
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

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
// rower actually wants it: the finish auto-navigates here, the sheet dies
// with the session, and James fell back to a console call that silently
// dropped the header's program. The seam itself survives navigation
// (latest-session-wins), so THIS screen — where the operator already lands
// — gets a sibling of the monitor log's own quiet door.
describe("LogSession: the recording's quiet door (walk-2026-08-16 close-out)", () => {
  afterEach(() => {
    delete (window as { __pm5Recording__?: unknown }).__pm5Recording__;
  });

  it("absent entirely when no recording seam exists — production and the manual path never see it", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    const row = screen.getByRole("button", { name: "RECORDING · DOWNLOAD" });
    await userEvent.click(row);

    expect(download).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "RECORDING · DOWNLOADED" }),
    ).toBeInTheDocument();
  });
});

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
    // Fallback label: `matchedDraft` gates on `workoutId`, so `draftStep`
    // resolves to `undefined` for this mismatched draft — proving the
    // mismatch guard actually changed behavior rather than passing
    // vacuously — but `phase.ref` (ui-fix round Task 2 fix round, F1b) is
    // still present on a run built through the normal `buildRun` path, so
    // the fallback reconstructs the SAME chip the preferred (matched-draft)
    // path would have: "6k +12" for both rows (Hoarfrost and Calm Sea share
    // the same offset), not the phase's frozen label (which, for a run this
    // fresh, would already be the exact split anyway — the chip and the
    // exact split only diverge for a LEGACY pre-ref run, see Timer.test.tsx's
    // own dedicated test for that case).
    expect(rows[0]).toHaveTextContent("12:00 @ 6k +12");
    expect(rows[1]).toHaveTextContent("10000 m @ 6k +12");
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

// Task 3 (ui-fix round): the old two-button `.baseline-confirm` side panel
// (a separate "Discard session"/"Cancel" pair) is gone — Discard now arms
// IN PLACE, the level system's own L4/L4-armed idiom (`useStagedDiscard`),
// same shape WorkoutDetail.tsx's own Delete workout and SessionComplete.tsx's
// new Discard both use. The two-tap safety itself, and the clear-both-
// records-then-navigate behaviour, are unchanged.
// Fix round 1 (reviewer, smaller item): these three used to spy the `api`
// module wrapper (`mockApi`/`apiFn`) — a WEAKER proof than the other two
// surfaces' own discard tests (SessionComplete.test.tsx/Today.test.tsx),
// which both spy `globalThis.fetch` directly and would catch a stray call
// that bypassed `api()` entirely. `usePlan`/`useWorkouts`/`useBaselines`
// are all mocked away elsewhere in this file (module-level `vi.doMock`,
// `mockWorkouts`), so nothing else in this render path ever reaches the
// real `fetch` either — aligning to the same spy the other two surfaces use.
describe("LogSession: staged discard", () => {
  it("arms on the first press without clearing anything or firing a network request", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
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
    await screen.findByText("AUG 1 · 30 MIN");

    const discardBtn = screen.getByRole("button", {
      name: "Discard without logging",
    });
    await userEvent.click(discardBtn);
    expect(
      screen.getByRole("button", { name: "Tap again to discard" }),
    ).toBeInTheDocument();

    fireEvent.blur(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );
    expect(
      screen.getByRole("button", { name: "Discard without logging" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loadRun()).not.toBeNull();
  });

  it("clears both records and navigates to /today only once the armed press lands — with no POST ever fired", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
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
// Hoarfrost's time work (12' = 720s) + its own restMinutes (5' = 300s) +
// Calm Sea's distance work (10,000m @ 6k+12 = 132 s/500m -> 20*132 =
// 2640s) = 3660s -> 61 MIN exactly. (It was 65 while the fixture also
// carried a 4' `wu` row; workouts carry no warm-up since 2026-08-09.)
const MANUAL_TOTAL_LABEL = `${formatLogDate(new Date().toISOString())} · 61 MIN`;

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

  // 7C Task 4: this door's own gate split the old combined "workouts OR
  // baselines loading" check in two (`monitorRun`'s own branch has no use
  // for baselines at all — see LogSession.tsx's own comment on why) —
  // proving baselines-loading ALONE, with the library already resolved,
  // reaches LOADING… the same as the combined test above already proves
  // for workouts alone. Uses a REAL matching workout (this file's own
  // realistic-fixture convention) so the library lookup that runs before
  // this gate actually succeeds, rather than short-circuiting on an empty
  // list first.
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

  it("Phase 6I: an effort-only workout (needsBaselines() false) opens the form with null baselines instead of the no-target block — the ManualDoorLog fix folded from Task 2's deferred ledger item", async () => {
    const workout = onboardingManualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    await renderManualLog(workout.id);

    expect(
      await screen.findByRole("heading", { name: "Log First 6k" }),
    ).toBeInTheDocument();
    // No "no target"/"Set baselines" block — the form itself renders.
    expect(screen.queryByText("no target")).not.toBeInTheDocument();
    // No duration segment — estimateMinutes returns null for an
    // effort-only workout with no baselines (never a fabricated total);
    // the header shows just the date, no dangling " · N MIN" or a
    // "· null MIN" string.
    expect(document.querySelector(".log-meta .mono-status")?.textContent).toBe(
      formatLogDate(new Date().toISOString()),
    );
    // The effort step's target renders as the 5G-rule dash, same as every
    // other effort step in this file — never a crash, never a fabricated
    // split resolved against baselines that don't exist.
    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("6000 m @ MIN");
    expect(rows[0].querySelector(".log-step-target")?.textContent).toBe("—");
    // No PACES LOCKED panel — an effort-only workout references neither
    // base (F1's "referenced bases only" rule, shared via pacesLockedText).
    expect(document.querySelector(".log-paces-panel")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save session" }),
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
    await screen.findByRole("heading", { name: "Log 2k Test Day" });
    // The test step becomes exactly one row, as a bare label.
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

// 7C Task 4: `monitorModeRun`'s own four-condition gate (spec §4), tested
// directly against the pure function first — cheaper than driving the
// whole screen four times over (task brief's own words) — with the full
// screen describe block below proving the wiring on top of it.
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

  // Fix round 1 (review finding #1): `isMonitorRun` (monitorRun.ts) is
  // DELIBERATELY SHALLOW — it proves `Array.isArray(value.actuals)`, never
  // that each ITEM in that array is shaped right — so a record with a
  // malformed actuals entry (a tampered/corrupted localStorage write, the
  // exact class of resilience scenario `loadMonitorRun`'s own "Resilience
  // #5" already guards against one layer down) passes straight through
  // `loadMonitorRun()` and into `buildMonitorLogSteps`, where
  // `actual.index` on a `null` throws a plain `TypeError` — NOT a
  // `MonitorLogSeedError`. Spec §4's own rule ("any miss falls through to
  // today's manual form untouched") governs here too: this must disqualify
  // the record exactly like every other condition-4 case, not crash the
  // `useState` lazy initializer that calls this function during render.
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

describe("LogSession: the manual door's monitor mode (7C Task 4)", () => {
  it("shows the title/type/EXPECTED, the caption, PACES LOCKED from the frozen seed, date+duration from the run's own stamps, and the widened render gate showing every pm5 split", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");

    expect(
      await screen.findByRole("heading", { name: "Log Hoarfrost" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
    expect(screen.getByText("EXPECTED 2/5")).toBeInTheDocument();

    // Date/duration from startedAt/completedAt (FIXED_NOW + 20 minutes),
    // NOT `estimateMinutes` — the manual door's own header formula never
    // runs in this branch.
    expect(screen.getByText("AUG 1 · 20 MIN")).toBeInTheDocument();

    // The caption: middle dot, never an em-dash, both intervals measured.
    expect(
      screen.getByText("FROM PM5 432331249 Row · ALL 2 INTERVALS MEASURED"),
    ).toBeInTheDocument();
    expect(document.querySelector(".log-from-monitor")).not.toBeNull();

    // PACES LOCKED from logSeed.paces — same "6k only" shape as the
    // fixture's own steps (neither references "2k").
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "6K 2:00.0",
    );

    // The widened render gate: BOTH rows show a real ACTUAL line (pm5),
    // distinct from their targets (140/125 vs 132 for both).
    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("2:12.0"); // target
    expect(rows[0]).toHaveTextContent("ACTUAL 2:20.0");
    expect(rows[1]).toHaveTextContent("2:12.0"); // target
    expect(rows[1]).toHaveTextContent("ACTUAL 2:05.0");

    // Unlike the ordinary manual door, this mode DOES have a Discard.
    expect(
      screen.getByRole("button", { name: "Discard without logging" }),
    ).toBeInTheDocument();
  });

  it("partial: one interval measured, one not — caption reads '1 OF 2', the unmeasured row shows no ACTUAL line", async () => {
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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    expect(
      screen.getByText("FROM PM5 432331249 Row · 1 OF 2 INTERVALS MEASURED"),
    ).toBeInTheDocument();
    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows[0]).toHaveTextContent("ACTUAL 2:20.0");
    expect(rows[1]).not.toHaveTextContent("ACTUAL");
  });

  it("an unusable avgSplit (0 — 'the wire had no reading') still counts as measured for the caption, with no ACTUAL line of its own", async () => {
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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    // Both intervals carry actualSource: "pm5" (the pairing exception), so
    // the caption still reads "ALL 2" even though row 1 has no ACTUAL line.
    expect(
      screen.getByText("FROM PM5 432331249 Row · ALL 2 INTERVALS MEASURED"),
    ).toBeInTheDocument();
    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows[0]).not.toHaveTextContent("ACTUAL");
    expect(rows[1]).toHaveTextContent("ACTUAL 2:05.0");
  });

  // THE HIJACK PIN, at the screen level (unit-level coverage lives in the
  // `monitorModeRun` describe block above): a stale completed MonitorRun
  // for the SAME workout, reached with NO `from=monitor` flag (a reload, a
  // bookmark, or simply Log it after clicked normally) must render the
  // manual form BYTE-FOR-BYTE — the caption is absent, and a manual-only
  // element (the estimated-total header, computed from `estimateMinutes`,
  // which the monitor branch never calls) is present.
  it("THE HIJACK PIN: no from=monitor flag + a stale completed MonitorRun for the SAME workout renders the manual form byte-for-byte", async () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun(run);
    const workout = manualWorkoutFixture(MONITOR_WORKOUT_ID);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID); // no search string at all

    await screen.findByRole("heading", { name: "Log Hoarfrost" });
    expect(screen.queryByText(/FROM PM5/)).not.toBeInTheDocument();
    expect(document.querySelector(".log-from-monitor")).toBeNull();
    // The manual door's own estimated-total header — proves the ordinary
    // `buildManualLogSteps`/`estimateMinutes` path ran, not the monitor one.
    expect(screen.getByText(MANUAL_TOTAL_LABEL)).toBeInTheDocument();
    // No Discard at all — the plain manual door's own signature (Task 3's
    // "no Discard button" test, pinned again here for this exact scenario).
    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
  });

  // Fix round 1 (review finding #1), screen-level companion to the
  // `monitorModeRun` unit test above: proves the door itself never
  // crashes on a shallowly-valid-but-malformed record — it renders the
  // ordinary manual form, same as any other condition-4 miss.
  it("a shallowly-valid MonitorRun with a malformed actuals entry never crashes the log door — it falls through to the manual form", async () => {
    const { run } = buildMonitorFixture();
    saveMonitorRun({ ...run, actuals: [null as unknown as IntervalActual] });
    const workout = manualWorkoutFixture(MONITOR_WORKOUT_ID);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");

    expect(
      await screen.findByRole("heading", { name: "Log Hoarfrost" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FROM PM5/)).not.toBeInTheDocument();
    expect(document.querySelector(".log-from-monitor")).toBeNull();
    expect(screen.getByText(MANUAL_TOTAL_LABEL)).toBeInTheDocument();
  });

  // Queue item 2 (PR #105's final-review Minor 3), test half ONLY: a
  // legacy v1 (logSeed-less) MonitorRun that the rower closed through
  // Today's interrupted-row door (F6, `endedBy: "interrupted"`) also
  // stamps `completedAt` — condition 2 of `monitorModeRun`'s own gate
  // passes (a finished record for this workout), but condition 4 fails
  // exactly like the malformed-actuals case above: `buildMonitorLogSteps`
  // throws (no `logSeed` to build steps from), so the record falls
  // through to the SAME manual door. Named here as INTENDED, not a
  // defect: a v1 record predates `logSeed` entirely and there is no
  // program-derived content this door could show beyond the plain manual
  // form. Whether the manual door's own Save should ALSO clear this now-
  // unreachable stale MonitorRun record is an open product question,
  // explicitly reserved for James (PR #105 review Minor 3) — this test
  // deliberately implements and asserts NO clearing behavior either way.
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
      await screen.findByRole("heading", { name: "Log Hoarfrost" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FROM PM5/)).not.toBeInTheDocument();
    expect(document.querySelector(".log-from-monitor")).toBeNull();
    expect(screen.getByText(MANUAL_TOTAL_LABEL)).toBeInTheDocument();
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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

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

    // Cleared exactly once: the record is gone, and the clearing FUNCTION
    // itself (not just its effect) was invoked exactly once.
    expect(loadMonitorRun()).toBeNull();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  // Branch review Minor: `webBluetooth.ts`/`capacitorBle.ts` both use
  // `device.name ?? "PM5"` — nullish, not `||` — so an empty advertised GATT
  // name reaches `MonitorRun.deviceName` verbatim, and a >64-char one is
  // equally possible. The server's own band is 1..64 chars
  // (`data.ts`), and without a client-side guard either would 400 the
  // WHOLE save with no recoverable retry (this hook's 400-retry only ever
  // strips `workoutId`) — the rower's only exit would be losing the
  // session to Discard. `useLogForm`'s `submit` now drops the key rather
  // than blocking the save, same "own field, never the log" rule the
  // branch already applies to avgHr/actualSplit/spm.
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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
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

  // Task 5: the staged half of the same control, isolated from its own
  // fire — the session door's own idiom (`useStagedDiscard`'s `armed`
  // state machine) means the FIRST press only arms; the record must
  // survive that press untouched, and only the SECOND (only reachable
  // while armed) actually fires. The test above already exercises both
  // presses together; this one pins the first press in isolation so a
  // regression that fires on one press (skipping the arm) still fails
  // something.
  it("Discard is staged: the first press only arms (button text flips, no clear, no navigation) — the record survives untouched", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
    );

    expect(
      screen.getByRole("button", { name: "Tap again to discard" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("WORKOUT DETAIL SCREEN")).not.toBeInTheDocument();
    expect(loadMonitorRun()).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Task 5 (spec §4's own words: "the manual door has none (`discardSlot`
  // is null there)"): the PLAIN manual door (no `?from=monitor`, no
  // MonitorRun at all) is where that null lives — pinned again here,
  // alongside the rest of this task's discard/lifecycle tests, rather
  // than only in Task 3's original describe block, since this IS the
  // property Task 5's own discard work must never regress.
  it("the plain manual door (no monitor run at all) still has no Discard slot — discardSlot stays null outside monitor mode", async () => {
    const workout = manualWorkoutFixture();
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(workout.id);
    await screen.findByText(MANUAL_TOTAL_LABEL);

    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
  });

  // Task 5, spec §5's "no new destruction paths": leaving the screen any
  // way OTHER than the discard firing or a successful save (BackLink, tab
  // bar, reload) must leave the record standing — `LogScreen`'s `BackLink`
  // is a plain router `Link`, not a handler this test can "click through"
  // to a real history pop in a meaningful way, so the faithful way to prove
  // no hidden cleanup runs on the way out is to unmount the component
  // outright (the same effect a real navigation away has on this tree) and
  // check the record is still exactly where it was.
  it("leaving via BackLink (unmount) leaves the MonitorRun standing — loadMonitorRun() is still non-null after unmount", async () => {
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const { unmount } = await renderManualLog(
      MONITOR_WORKOUT_ID,
      "?from=monitor",
    );
    await screen.findByRole("heading", { name: "Log Hoarfrost" });
    expect(screen.getByRole("link", { name: "← BACK" })).toBeInTheDocument();

    unmount();

    expect(loadMonitorRun()).not.toBeNull();
  });

  // The M-2 coexistence contract (spec §5): a phone `SessionRun`/`SessionDraft`
  // sitting around for a DIFFERENT workout must survive both a monitor-mode
  // save and a monitor-mode discard byte-for-byte — this door reads/writes
  // `MONITOR_RUN_KEY` only.
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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
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
      await screen.findByRole("heading", { name: "Log Hoarfrost" }),
    ).toBeInTheDocument();
    // The ordinary manual door's "no target / Set baselines" degradation
    // never appears — this branch reads `logSeed.paces`, never baselines.
    expect(screen.queryByText("no target")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save session" }),
    ).toBeInTheDocument();
  });

  // Same "both bases at once" shape as the plain manual door's own
  // "resolves each PACES LOCKED base from its OWN matching baseline" test
  // above — `buildMonitorFixture`'s own two real library steps are both
  // 6k-based, so this exercises the OTHER half of `logSeed.paces`' own
  // `k2`/`k6` optional pair (`?? null`) that fixture never reaches.
  it("shows both PACES LOCKED bases when the frozen seed carries both (a 2k off=0 and a 6k off=0 step)", async () => {
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

    await screen.findByRole("heading", { name: "Log Monitor Both Bases" });
    // BASELINES.k2Seconds (100) -> "1:40.0"; BASELINES.k6Seconds (120) ->
    // "2:00.0" — same values `buildLogSeed` froze at "connect" time.
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "2K 1:40.0 · 6K 2:00.0",
    );
  });

  // The `k6` half of `logSeed.paces`' own optional pair (`?? null`) never
  // falls to its null branch anywhere else in this describe block
  // (`buildMonitorFixture`'s two real steps are both 6k-based, and the
  // "both bases" test just above always supplies one too) — a 2k-only seed
  // is what actually exercises "6k was never referenced" for the monitor
  // door, the mirror of the plain manual door's own established "6k only"
  // fixtures.
  it("shows only 2K when the frozen seed never references 6k at all", async () => {
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

    await screen.findByRole("heading", { name: "Log Monitor 2K Only" });
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "2K 1:40.0",
    );
  });

  it("the outside-plan toggle works identically in monitor mode: renders, flips, and Save posts advancesPlan:false when toggled", async () => {
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
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    const toggle = screen.getByRole("button", {
      name: "COUNTS TOWARD PLAN · SESSION 4 OF 84",
    });
    await userEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: /OUTSIDE THE PLAN/ }),
    ).toHaveAttribute("aria-pressed", "true");

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body.advancesPlan).toBe(false);
  });
});

// F6 Task 3 (spec 2b): `monitorLogTotals`'s interrupted branch stops
// reading wall-clock (`completedAt - startedAt`) entirely for a run the
// rower ended through Today's row (`endedBy: "interrupted"`) — that gap can
// span days between the row and the moment "Log it" was pressed, and none
// of it happened. Duration comes from `interruptedTotalSeconds` (Task 1:
// measured work plus each completed interval's own programmed rest) and
// the date comes from the run's OWN `startedAt` (the plan's ruling, not a
// spec quote — see `monitorLogTotals`'s own doc comment).
describe("LogSession: the interrupted header stops reading wall-clock (F6 Task 3)", () => {
  it("an interrupted record shows measured minutes (work + completed rest), not the day-long wall-clock gap, and dateLabel from startedAt", async () => {
    const { run, workout } = buildMonitorFixture({
      // Only interval 1 (Hoarfrost's time work, restSeconds 300 per its
      // own auto-inserted rest phase) measured — interval 2 never reached.
      // work 360s + rest 300s = 660s = 11 min exactly: nowhere near the
      // day-long wall-clock gap below, so a regression back to wall-clock
      // cannot pass this assertion by accident.
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
      // startedAt Aug 1, completedAt a full day later (Aug 2) — "Log it"
      // pressed the next day, the exact gap `endedBy: "interrupted"`
      // exists to stop this header from reading as duration.
      startedAt: "2026-08-01T12:00:00.000Z",
      completedAt: "2026-08-02T12:05:00.000Z",
      endedBy: "interrupted",
    };
    saveMonitorRun(interrupted);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    // 11 MIN (measured), dated AUG 1 (startedAt) — never AUG 2 (completedAt)
    // and never the ~1440 MIN wall-clock gap.
    expect(screen.getByText("AUG 1 · 11 MIN")).toBeInTheDocument();
    expect(screen.queryByText(/AUG 2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1440 MIN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1445 MIN/)).not.toBeInTheDocument();
  });

  it("inverse pin: a normal-completion record (no endedBy) still shows wall-clock minutes and dateLabel from completedAt", async () => {
    const { run, workout } = buildMonitorFixture();
    // buildMonitorFixture's own default: startedAt FIXED_NOW (Aug 1),
    // completedAt FIXED_NOW + 20 min, no endedBy — the normal-completion
    // branch this change must leave byte-identical in behaviour.
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Log Hoarfrost" });

    expect(screen.getByText("AUG 1 · 20 MIN")).toBeInTheDocument();
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

  // Phase 6I: the designated onboarding workout's own Log screen pre-sets
  // the toggle to OUTSIDE THE PLAN by default (spec: "a baseline test must
  // not silently consume plan session 1") — still visible, still
  // changeable, never forced.
  it("Phase 6I: a designated onboarding workout's log defaults the toggle to OUTSIDE THE PLAN", async () => {
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildOnboardingSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByText("AUG 1 · 25 MIN");

    const toggle = screen.getByRole("button", {
      name: "OUTSIDE THE PLAN · won't advance",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    // Still changeable — tapping it once opts BACK into the plan, the same
    // toggle every other workout's log uses.
    await userEvent.click(toggle);
    expect(
      screen.getByRole("button", {
        name: "COUNTS TOWARD PLAN · SESSION 4 OF 84",
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("Phase 6I: an ordinary (non-onboarding) workout's log still defaults to COUNTS TOWARD PLAN", async () => {
    // Regression guard for the default itself: proves the new default
    // branch only fires for a REAL onboarding title, not every workout.
    mockPlan(readyPlanState(activePlan()));
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    expect(
      screen.getByRole("button", {
        name: "COUNTS TOWARD PLAN · SESSION 4 OF 84",
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("tapping the toggle flips it to OUTSIDE THE PLAN · won't advance, and back again", async () => {
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
      name: "OUTSIDE THE PLAN · won't advance",
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
      screen.getByRole("button", { name: "OUTSIDE THE PLAN · won't advance" }),
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
      screen.getByRole("button", { name: "OUTSIDE THE PLAN · won't advance" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
