import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { PlanData, PlanSequenceItem } from "../api/usePlan";
import type { RecentLog } from "../api/useRecentLogs";
import type { WorkoutType } from "../../domain/types.js";
import { phases } from "../../domain/expand.js";
import { compileProgram } from "../../domain/monitor/program.js";
import { buildLogSeed } from "../session/logDraft";
import { buildDraft, type SessionDraft, DRAFT_KEY } from "../session/draft";
import { advance, buildFreeRowRun, buildRun } from "../session/engine";
import { RUN_KEY, type SessionRun } from "../session/run";
import { MONITOR_RUN_KEY, type MonitorRun } from "../monitor/monitorRun";
import { elapsedSinceStart } from "./Today";
import { TODAY_PICK_KEY, type TodayPick } from "./todayPick";
import { TODAY_OVERRIDES_KEY, type TodayOverrides } from "./todayOverrides";
import {
  TODAY_FILTERS_KEY,
  type FilterSet,
  type TodayFilterKey,
  type TodayFilters,
} from "./todayFilters";

// Phase SF PR1: the client rng is a module the test scripts. The queue is
// consumed one draw per call; an EMPTY queue yields 0, which makes every
// draw pick the FIRST candidate — the least-recently-done head for the
// first card (exactly pre-PR1's deterministic pick, so every older test
// keeps its expectations) and O2 for the daily type roll. Tests that
// exercise randomness push explicit draws.
const rngQueue: number[] = [];
vi.mock("./rng", () => ({
  clientRng: () => (rngQueue.length > 0 ? rngQueue.shift()! : 0),
}));

/** The per-type memory as stored: the set under `key`, or undefined when
 *  that key has never been written. */
function storedFilters(key: TodayFilterKey): FilterSet | undefined {
  const raw = localStorage.getItem(TODAY_FILTERS_KEY);
  if (raw === null) return undefined;
  return (JSON.parse(raw) as TodayFilters).byKey[key];
}

function seedFilters(
  byKey: Partial<Record<TodayFilterKey, FilterSet>>,
  rollSuppressed = false,
): void {
  const store: TodayFilters = { v: 1, rollSuppressed, byKey };
  localStorage.setItem(TODAY_FILTERS_KEY, JSON.stringify(store));
}

// Realistic fixtures, per repo convention: real library workouts
// (app/server/seed/library/), not hand-built minimums.
// - Sea Fret (O2, easy): the freestyle/least-recently-done pick.
// - Occluded Front / Stationary Front / Pressure Ridge (all AT, easy): the
//   plan-mode pool — THREE same-type entries, not two, so a SHUFFLE test
//   can tell a real wraparound (1->2->0) apart from an off-by-one bug that
//   only happens to look right on a 2-item pool (see the SHUFFLE describe
//   block).
function libraryEntry(
  title: string,
  id: string,
  lastDoneDaysAgo: number | null,
): LibraryWorkout {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return {
    id,
    title: w.title,
    type: w.type,
    difficulty: w.difficulty,
    pain: w.pain,
    steps: w.steps,
    isGlobal: true,
    lastDoneDaysAgo,
  };
}

const ZEPHYR = libraryEntry("Sea Fret", "w-zephyr", 30);
const ISOBAR = libraryEntry("Occluded Front", "w-isobar", 10);
const WARM_FRONT = libraryEntry("Stationary Front", "w-warmfront", 20);
const TAILWIND = libraryEntry("Pressure Ridge", "w-tailwind", 15);

// Phase 6I: the two designated onboarding workouts, real seed shape
// (server/seed/library/onboarding.ts) rather than a hand-built minimum —
// the suggestion-pool exclusion (Today.tsx) keys off the exact title
// constants these carry.
function onboardingLibraryEntry(title: string, id: string): LibraryWorkout {
  const w = ONBOARDING_LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing onboarding fixture: ${title}`);
  return {
    id,
    title: w.title,
    type: w.type,
    difficulty: w.difficulty,
    pain: w.pain,
    steps: w.steps,
    isGlobal: true,
    lastDoneDaysAgo: null,
  };
}

const TEST_6K = onboardingLibraryEntry(ONBOARDING_TITLES.k6, "w-test6k");
const TEST_2K = onboardingLibraryEntry(ONBOARDING_TITLES.k2, "w-test2k");

// Final-review fix: a CUSTOM (isGlobal: false) workout that happens to
// collide with a designated onboarding title. The exclusion must key off
// isGlobal too, not title alone — otherwise a rower's own "6K Test" build
// becomes an orphan (invisible everywhere, no UI path back). Built the way
// the builder would (spread a real seed shape, same convention
// PERSONAL_GRADIENT above already follows), not a hand-built minimum.
const CUSTOM_TEST_6K: LibraryWorkout = {
  ...onboardingLibraryEntry(ONBOARDING_TITLES.k6, "w-customtest6k"),
  isGlobal: false,
};

// Round 2 (2026-08-04): a personal (isGlobal: false) fixture, same
// realistic-library-workout convention as the global fixtures above — used
// by the SOURCE=CUSTOM tests below.
const PERSONAL_GRADIENT: LibraryWorkout = {
  ...libraryEntry("Gradient Wind", "w-gradientwind-personal", 12),
  isGlobal: false,
};
// A genuinely STALE (>=21 days) AT/easy fixture — every other AT fixture
// above is under the 21-day recency boundary, so LAST DONE=21D+ needs its
// own entry to actually keep something rather than falling back.
const STALE_FRONT = libraryEntry("Barometric Low", "w-stalefront", 25);

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };
const NO_BASELINES = { k2Seconds: null, k6Seconds: null };
// One baseline set, one missing — an incomplete PAIR, which since Phase
// BL PR C renders the same three-door card the both-null state does (the
// doors are the superset re-entry; the old BaselineCard's only-missing-
// distance branch died with it).
const ONLY_K6_BASELINE = { k2Seconds: null, k6Seconds: 122 };
const DEFAULT_PREFS = {
  difficulties: ["easy", "medium", "hard"],
  timeCapMinutes: 60,
};

// 84-entry sequence with `code` at `doneN` and a filler code ("O2")
// elsewhere — mirrors GET /api/plan's shape (server/routes/data.ts's
// planResponse), just built by hand since this is a client-side fixture.
function buildSequence(doneN: number, code: string): PlanSequenceItem[] {
  return Array.from({ length: 84 }, (_, i) => ({
    index: i,
    code: (i === doneN ? code : "O2") as PlanSequenceItem["code"],
    status: i < doneN ? "done" : i === doneN ? "today" : "upcoming",
  }));
}

const PLAN_AT: PlanData = {
  planKey: "sprint",
  doneN: 11,
  sequence: buildSequence(11, "AT"),
};

// Same plan identity as PLAN_AT, doneN advanced by one — a session logged
// since (Task 2's "doneN bump discards" case), same invalidation trigger
// todayPick.ts's own pick already relies on.
const PLAN_AT_NEXT: PlanData = {
  planKey: "sprint",
  doneN: 12,
  sequence: buildSequence(12, "AT"),
};

// A checkpoint day (Phase 8A): the wire carries the day's REAL type — the
// sprint plan's index-6 checkpoint is an AN day, and the "TEST" code (with
// its TR stand-in mapping) is retired. Task 2 wires the prescription
// itself into this screen; this fixture pins the wire-shape half.
const PLAN_CHECKPOINT: PlanData = {
  planKey: "sprint",
  doneN: 6,
  sequence: buildSequence(6, "AN"),
};

// The head plan's own first checkpoint (Task 2): an AT day prescribing
// the 6K Test. PR B reclassified the seed row to AT, so the prescribed
// entry's own type now MATCHES the day code — the coherence pin below
// asserts it (the bypass-every-filter property itself is pinned at the
// domain level in suggest.test.ts, against a deliberately mismatched
// entry).
const PLAN_HEAD_CHECKPOINT: PlanData = {
  planKey: "head",
  doneN: 6,
  sequence: buildSequence(6, "AT"),
};

// Two REAL seeded AN workouts (an.ts) — the checkpoint-day pool the
// prescribed 2k test deliberately sits outside of, so SHUFFLE has a real
// same-type pool to escape into. Dust Whirl is the least recently done of
// the two, so it is the deterministic first SHUFFLE landing.
const SCUD_CLOUD = libraryEntry("Scud Cloud", "w-scudcloud", 5);
const DUST_WHIRL = libraryEntry("Dust Whirl", "w-dustwhirl", 9);

const FREESTYLE_PLAN: PlanData = { planKey: null, doneN: 0, sequence: [] };

// Fixed, absolute timestamps (noon UTC — comfortably clear of any local
// timezone's date-rollover boundary) rather than "N days ago from now": the
// row format under test is a literal calendar date ("JUL 25"), which has to
// stay the same string on every run regardless of what day the suite
// happens to execute.
const LOGS: RecentLog[] = [
  {
    id: "log-1",
    workoutId: "w-isobar",
    workoutTitle: "Occluded Front",
    workoutType: "AT",
    loggedAt: "2026-07-25T12:00:00.000Z",
    held: "held",
    pain: 2,
    thumbs: null,
    avgSplitSeconds: null,
    timeSeconds: null,
    distanceMeters: null,
    planKey: null,
    planIndex: null,
    // RC-5 §3, Task 4: null is the common default (a pre-tier row) — this
    // suite never exercises the list's tier logic itself.
    workSeconds: null,
    workMeters: null,
    machineWorkSeconds: null,
    machineWorkMeters: null,
    machineAvgPaceSecondsPer500m: null,
    // Door spec (2026-09-02) §1.3: a complete row with no close reason,
    // the default everywhere in this suite. Today's LAST THREE rows never
    // set `hero`, so they render no numbers line and therefore no chip
    // even when these say otherwise — the gate for that lives in
    // `HistoryList.test.tsx`.
    endedBy: null,
    partial: false,
  },
  {
    id: "log-2",
    workoutId: "w-zephyr",
    workoutTitle: "Sea Fret",
    workoutType: "O2",
    loggedAt: "2026-07-20T12:00:00.000Z",
    held: "under",
    pain: 1,
    thumbs: "up",
    avgSplitSeconds: null,
    timeSeconds: null,
    distanceMeters: null,
    planKey: null,
    planIndex: null,
    workSeconds: null,
    workMeters: null,
    machineWorkSeconds: null,
    machineWorkMeters: null,
    machineAvgPaceSecondsPer500m: null,
    endedBy: null,
    partial: false,
  },
  {
    id: "log-3",
    workoutId: null,
    workoutTitle: "Deleted Workout",
    workoutType: "AN",
    loggedAt: "2026-07-10T12:00:00.000Z",
    held: "over",
    pain: 4,
    thumbs: null,
    avgSplitSeconds: null,
    timeSeconds: null,
    distanceMeters: null,
    planKey: null,
    planIndex: null,
    workSeconds: null,
    workMeters: null,
    machineWorkSeconds: null,
    machineWorkMeters: null,
    machineAvgPaceSecondsPer500m: null,
    endedBy: null,
    partial: false,
  },
];

function mockReady(overrides?: {
  workouts?: LibraryWorkout[];
  baselines?: typeof BASELINES | typeof NO_BASELINES | typeof ONLY_K6_BASELINE;
  plan?: PlanData;
  preferences?: typeof DEFAULT_PREFS;
  logs?: RecentLog[];
}) {
  const workouts = overrides?.workouts ?? [
    ZEPHYR,
    ISOBAR,
    WARM_FRONT,
    TAILWIND,
  ];
  const baselines = overrides?.baselines ?? BASELINES;
  const plan = overrides?.plan ?? PLAN_AT;
  const preferences = overrides?.preferences ?? DEFAULT_PREFS;
  const logs = overrides?.logs ?? LOGS;

  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines }),
  }));
  vi.doMock("../api/usePlan", () => ({
    usePlan: () => ({ state: "ready", plan }),
  }));
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () => ({ state: "ready", preferences }),
  }));
  vi.doMock("../api/useRecentLogs", () => ({
    useRecentLogs: () => ({ state: "ready", logs }),
  }));
}

async function renderToday() {
  const { default: Today } = await import("./Today");
  return render(
    <MemoryRouter>
      <Today />
    </MemoryRouter>,
  );
}

// Renders `location.state.from` as plain text so a click through a real
// `<Link>` can be asserted against without reaching into react-router
// internals — the same "prove it via the resulting navigation, not the
// prop" discipline WorkoutDetail.test.tsx's own route-based renderers use.
function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return <p>PROBE from={String(from)}</p>;
}

// F6 (2b), Task 4: "Log it"'s target is `/library/:id/log?from=monitor` —
// a real query string, not `state`, so the probe reads `useParams`/
// `location.search` rather than `LocationProbe`'s own `location.state`.
function LogRouteProbe() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <p>
      LOG ROUTE PROBE id={id} search={location.search}
    </p>
  );
}

// Today links into both a workout's detail page (the suggestion card) and
// the builder (`+ Build a workout`, empty-library case) — one probe route
// per target so either click's landing state can be inspected. The
// from-the-log spec (2026-08-18) adds two more targets: the ALL SESSIONS
// heading link (`/today/log`) and each LAST THREE row (`/today/log/:id`).
async function renderTodayWithProbes() {
  const { default: Today } = await import("./Today");
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route path="/today" element={<Today />} />
        <Route path="/library/:id" element={<LocationProbe />} />
        <Route path="/library/new" element={<LocationProbe />} />
        <Route path="/today/log" element={<LocationProbe />} />
        <Route path="/today/log/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function cardLinkTo(id: string): HTMLElement | undefined {
  return screen
    .getAllByRole("link")
    .find((a) => a.getAttribute("href") === `/library/${id}`);
}

// Task 2 (2026-08-04 round): DIFFICULTY/TIME/PAIN moved off the screen and
// into TodayFilterSheet — every assertion that used to read a chip's
// `aria-pressed` straight off the page now has to open the sheet first.
async function openFilterSheet() {
  await userEvent.click(screen.getByRole("button", { name: "FILTER ⌄" }));
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  rngQueue.length = 0;
});

describe("Today (plan mode)", () => {
  it("shows the plan header and picks the least-recently-done matching-type workout", async () => {
    mockReady();
    await renderToday();

    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
    expect(screen.getByText("SESSION 12 OF 84 · AT")).toBeVisible();
    // Stationary Front (20d ago) outranks Occluded Front (10d ago); Sea Fret is O2, not AT,
    // so it must never be the pick when a plan names AT for today.
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    // Sea Fret is O2, not AT — it must never be the suggestion card's title
    // (it's still allowed to show up in LAST THREE, a different section,
    // since it's in the LOGS fixture too — so this checks the card's own
    // heading specifically, not "Sea Fret" text anywhere on the page).
    expect(
      screen.queryByRole("heading", { name: "Sea Fret" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Least recently done/)).toBeVisible();
  });

  it("renders a resolved duration preview when baselines exist", async () => {
    mockReady();
    await renderToday();
    // Stationary Front: 3×3' work + 2×0.5' rest (no rest after the last
    // rung) = 9 + 1 = 10' total. (It was 15' while the workout also
    // carried a 5' wu step; workouts carry no warm-up since 2026-08-09 —
    // the rower's own warm-up SETTING is prepended at buildRun, and the
    // library/Today duration is WORK ONLY by design, spec §5.)
    expect(screen.getByText("10′")).toBeVisible();
  });

  // Phase 6I established that baselines-unset never renders the suggestion
  // card (a bare-dash duration, per the older test this replaced); Phase
  // BL PR C swaps the single-offer BaselineCard for the three-door card in
  // that same slot. Full branch coverage (both-null/partial/plan-apparatus-
  // hiding/exclusion-from-suggestion) lives in the dedicated describe
  // block below.
  it("shows the three-door card, not the suggestion card, when baselines are unset", async () => {
    mockReady({
      baselines: NO_BASELINES,
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND, TEST_6K, TEST_2K],
    });
    await renderToday();
    expect(
      screen.getByRole("heading", { name: "How do you want to start?" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Stationary Front" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("links the suggestion card to the workout's detail page", async () => {
    mockReady();
    await renderToday();
    expect(cardLinkTo("w-warmfront")).toBeTruthy();
  });

  // The bug this task fixes (device report): Today's suggestion card was the
  // one hop the recorded flow always took, and its Link never carried any
  // `from` at all, so detail's hardcoded `to="/library"` back link was the
  // only place a rower ever actually landed. Pins the fix at its source: the
  // card itself must now stamp its own pathname into state.
  it("stamps state={from:'/today'} onto the suggestion card link", async () => {
    mockReady();
    await renderTodayWithProbes();
    await userEvent.click(
      screen.getByRole("link", { name: /Stationary Front/i }),
    );
    expect(await screen.findByText("PROBE from=/today")).toBeVisible();
  });
});

describe("Today (freestyle mode)", () => {
  it("shows a freestyle line with a link to /plan, and suggests across the whole library", async () => {
    mockReady({ plan: FREESTYLE_PLAN });
    await renderToday();

    expect(screen.getByText(/FREESTYLE/)).toBeVisible();
    const planLink = screen.getByRole("link", { name: /choose a plan/i });
    expect(planLink).toHaveAttribute("href", "/plan");
    // Sea Fret (30d ago) is the least recently done across the WHOLE library
    // (not filtered to one type) — AT's Stationary Front/Occluded Front are more recent.
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
  });

  it("a freestyle chip tap narrows the pool to that type, persists with planKey null, and a second tap clears it", async () => {
    mockReady({ plan: FREESTYLE_PLAN });
    await renderToday();
    expect(screen.getByText(/FREESTYLE/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();

    // AT pool: Occluded (10d) / Stationary (20d) / Pressure Ridge (15d) —
    // least recently done is Stationary Front, not the O2 Sea Fret (30d).
    await userEvent.click(screen.getByRole("button", { name: "AT" }));
    expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    // The plan line never grows a swap arrow — there is no plan call to
    // swap away from.
    expect(screen.getByText("FREESTYLE")).toBeVisible();
    expect(screen.queryByText(/→ AT/)).not.toBeInTheDocument();
    const stored = JSON.parse(
      localStorage.getItem(TODAY_OVERRIDES_KEY)!,
    ) as TodayOverrides;
    expect(stored.swapType).toBe("AT");
    expect(stored.planKey).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "AT" }));
    expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
    expect(
      (JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides)
        .swapType,
    ).toBeNull();
  });

  it("treats a plan with no sequence entry at doneN the same as freestyle, rather than crashing", async () => {
    // A completed plan (doneN reached the end of the 84-session sequence,
    // each advancing log having incremented it) — this pins the fallback
    // documented at the todayCode computation: fall through to freestyle
    // instead of indexing past the end of an empty/short array.
    mockReady({
      plan: { planKey: "sprint", doneN: 84, sequence: buildSequence(11, "AT") },
    });
    await renderToday();
    expect(screen.getByText(/FREESTYLE/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
  });
});

describe("Today (SHUFFLE)", () => {
  function storedPickWorkoutId(): string {
    const stored = JSON.parse(localStorage.getItem(TODAY_PICK_KEY)!) as {
      workoutId: string;
    };
    return stored.workoutId;
  }

  // Phase SF PR1: SHUFFLE draws at random from the UNSHOWN pool. With the
  // scripted rng returning 0 the draw is always the first unshown member
  // in least-recently-done order, which reproduces the pre-PR1 walk
  // exactly — so this test keeps its expectations and now proves the
  // no-repeat walk plus the reset; the randomness itself is scripted in
  // the Phase SF describe at the bottom of this file.
  it("walks the FULL 3-member pool without repeating (scripted rng 0) and wraps back to the start once exhausted", async () => {
    // Pool sorted by least-recently-done: Stationary Front (20d) -> Pressure Ridge
    // (15d) -> Occluded Front (10d). A 3-item pool (not 2) is deliberate: on a
    // 2-item pool, a missing "% pool.length" bug still lands back on the
    // starting item after two clicks by coincidence (index 2 vs. index 0
    // both read as "not index 1"), so it wouldn't be caught here. Three
    // items make every step's expected index unambiguous.
    mockReady();
    await renderToday();
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();

    const shuffle = screen.getByRole("button", { name: /shuffle/i });

    await userEvent.click(shuffle);
    expect(
      screen.getByRole("heading", { name: "Pressure Ridge" }),
    ).toBeVisible();
    expect(storedPickWorkoutId()).toBe("w-tailwind");

    await userEvent.click(shuffle);
    expect(
      screen.getByRole("heading", { name: "Occluded Front" }),
    ).toBeVisible();
    expect(storedPickWorkoutId()).toBe("w-isobar");

    await userEvent.click(shuffle);
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(storedPickWorkoutId()).toBe("w-warmfront");
  });

  it("persists the pick for a same-day reload", async () => {
    mockReady();
    const first = await renderToday();
    const shuffle = screen.getByRole("button", { name: /shuffle/i });
    await userEvent.click(shuffle);
    expect(
      screen.getByRole("heading", { name: "Pressure Ridge" }),
    ).toBeVisible();

    const stored = JSON.parse(localStorage.getItem(TODAY_PICK_KEY)!) as {
      workoutId: string;
      planKey: string | null;
      doneN: number | null;
    };
    expect(stored.workoutId).toBe("w-tailwind");
    expect(stored.planKey).toBe("sprint");
    expect(stored.doneN).toBe(11);

    // Same-day "reload": unmount (a real reload tears down the old DOM
    // too) and mount fresh — the new instance re-reads the persisted pick
    // from localStorage rather than defaulting back to pool[0].
    first.unmount();
    mockReady();
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Pressure Ridge" }),
    ).toBeVisible();
  });

  it("discards the persisted pick on a date change", async () => {
    localStorage.setItem(
      TODAY_PICK_KEY,
      JSON.stringify({
        date: "2000-01-01",
        planKey: "sprint",
        doneN: 11,
        workoutId: "w-isobar",
      }),
    );
    mockReady();
    await renderToday();
    // Falls back to the default pool[0] (Stationary Front), not the stale pick.
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
  });

  it("is disabled when the pool has one or zero members (nothing to shuffle to)", async () => {
    mockReady({ workouts: [WARM_FRONT] });
    await renderToday();
    expect(screen.getByRole("button", { name: /shuffle/i })).toBeDisabled();
  });
});

describe("Today (overrides: init from preferences)", () => {
  // Amendment (2026-08-04 PR #50 round): TIME's default is now a bucket
  // SET (`bucketsForCap`), not a single cap chip — each row names which
  // buckets should be pressed and which shouldn't at that preference cap.
  it.each([
    [60, ["<30′", "30–45′", "45–60′"], ["60′+"]],
    [45, ["<30′", "30–45′"], ["45–60′", "60′+"]],
    [100, ["<30′", "30–45′", "45–60′", "60′+"], []],
    [30, ["<30′"], ["30–45′", "45–60′", "60′+"]],
  ] as const)(
    "derives bucketsForCap(%i) as the default pressed TIME cells (no stored overrides)",
    async (timeCapMinutes, pressed, notPressed) => {
      mockReady({ preferences: { ...DEFAULT_PREFS, timeCapMinutes } });
      await renderToday();
      await openFilterSheet();
      for (const label of pressed) {
        expect(screen.getByRole("button", { name: label })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
      for (const label of notPressed) {
        expect(screen.getByRole("button", { name: label })).toHaveAttribute(
          "aria-pressed",
          "false",
        );
      }
    },
  );

  it("defaults difficulties to every preference value and every pain cell to off", async () => {
    mockReady();
    await renderToday();
    await openFilterSheet();
    expect(screen.getByRole("button", { name: "EASY" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "MEDIUM" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "HARD" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const painGroup = screen.getByRole("group", { name: "PAIN" });
    for (const level of ["1", "2", "3", "4", "5"]) {
      expect(
        within(painGroup).getByRole("button", { name: level }),
      ).toHaveAttribute("aria-pressed", "false");
    }
  });
});

describe("Today (overrides: stored record wins over preferences)", () => {
  it("uses the stored difficulties/durations/pain instead of the preference-derived default", async () => {
    // Phase SF PR1: the memory is per type and UNDATED — the plan's own
    // call today is AT, so the AT key is what this mount reads.
    seedFilters({
      AT: {
        difficulties: ["hard"],
        durations: ["<30"],
        painLevels: [1, 2, 3],
        lastDone: null,
        source: null,
      },
    });
    mockReady();
    await renderToday();
    await openFilterSheet();

    expect(screen.getByRole("button", { name: "HARD" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "EASY" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "<30′" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "30–45′" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const painGroup = screen.getByRole("group", { name: "PAIN" });
    for (const level of ["1", "2", "3"]) {
      expect(
        within(painGroup).getByRole("button", { name: level }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    for (const level of ["4", "5"]) {
      expect(
        within(painGroup).getByRole("button", { name: level }),
      ).toHaveAttribute("aria-pressed", "false");
    }
    // Every fixture workout is "easy" difficulty (see the fixtures' own
    // comment) — none match the stored "hard"-only filter, so the fellback
    // reason proves the STORED record drove suggest(), not the 60-min/
    // easy-medium-hard preference default DEFAULT_PREFS would have produced.
    expect(screen.getByText(/Nothing fit your/)).toBeVisible();
  });
});

// Task 2 (2026-08-04 round): DIFFICULTY/TIME/PAIN's three inline chip
// groups are gone — narrowing now happens inside TodayFilterSheet against
// a DRAFT, committed only by its own "Apply Filter" button (Revision,
// mid-Round-2: the count that used to live in this button's own copy now
// lives in a caption above it). A second,
// richer AT pool (Occluded Front/Stationary Front both pain 2, Filling Low
// pain 3 — a real library fixture, `fromWorkout`-style, per this repo's
// realistic-fixtures convention) lets a PAIN filter narrow the pool to
// exactly one entry without tripping suggest.ts's fellBack rule (which
// reverts to the full type-matched list whenever a filter would otherwise
// leave zero matches — the two pain-2 fixtures alone would trigger it).
const FILLING_LOW = libraryEntry("Filling Low", "w-fillinglow-2", 5);

describe("Today (FILTER sheet)", () => {
  it("chips are gone at rest; FILTER ⌄ is the only control on the header's right besides SHUFFLE", async () => {
    mockReady();
    await renderToday();
    for (const label of [
      "EASY",
      "MEDIUM",
      "HARD",
      "<30′",
      "30–45′",
      "45–60′",
      "60′+",
    ]) {
      expect(
        screen.queryByRole("button", { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("group", { name: "PAIN" }),
    ).not.toBeInTheDocument();
    const filterButton = screen.getByRole("button", { name: "FILTER ⌄" });
    expect(filterButton).toBeVisible();
    expect(filterButton).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on FILTER ⌄ click, holding DIFFICULTY/TIME/PAIN/LAST DONE/SOURCE seeded from the applied overrides", async () => {
    mockReady();
    await renderToday();
    const filterButton = screen.getByRole("button", { name: "FILTER ⌄" });
    await userEvent.click(filterButton);

    expect(filterButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Filter" })).toBeVisible();
    for (const label of ["DIFFICULTY", "TIME", "PAIN", "LAST DONE", "SOURCE"]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    // Seeded from DEFAULT_PREFS (every difficulty, a 60-min cap's own
    // bucketsForCap set, no pain filter) — the same values the "init from
    // preferences" describe pins.
    for (const label of ["EASY", "MEDIUM", "HARD"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    for (const label of ["<30′", "30–45′", "45–60′"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    expect(screen.getByRole("button", { name: "60′+" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Round 2 (2026-08-04): both new dims default to null — neither cell
    // of either pair starts pressed (no account preference seeds them, per
    // Today.tsx's own fresh-day initial state).
    for (const label of ["<21D", "21D+", "GLOBAL", "CUSTOM"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  // Round 2 (2026-08-04): SOURCE=CUSTOM narrows the pool to personal
  // (non-global) entries only — a real, provable pick swap, mirroring the
  // existing PAIN-filter integration test's own "a real title swap" style.
  it("applying SOURCE=CUSTOM narrows the pool to the personal fixture alone, swapping the recommendation", async () => {
    mockReady({ workouts: [ISOBAR, WARM_FRONT, PERSONAL_GRADIENT] });
    await renderToday();
    // Pre-filter: byLeastRecentlyDone ranks by MOST days ago first, so
    // WARM_FRONT (20 days) outranks PERSONAL_GRADIENT (12) and ISOBAR (10)
    // — it's the pre-filter pick.
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();

    await openFilterSheet();
    const sourceGroup = screen.getByRole("group", { name: "SOURCE" });
    await userEvent.click(
      within(sourceGroup).getByRole("button", { name: "CUSTOM" }),
    );
    expect(screen.getByText("1 OPTION")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));

    expect(
      screen.getByRole("heading", { name: "Gradient Wind" }),
    ).toBeVisible();
    expect(screen.getByText("CUSTOM")).toBeVisible();
    expect(storedFilters("AT")).toMatchObject({ source: "custom" });
  });

  it("applying LAST DONE=21D+ excludes a recent entry, keeps a stale one, and swaps the recommendation; the token clears it back to null", async () => {
    mockReady({ workouts: [ISOBAR, STALE_FRONT] });
    await renderToday();
    // Pre-filter: ISOBAR (10 days ago) loses the least-recently-done
    // tie-break to STALE_FRONT (25 days ago) already — the fixture choice
    // below re-confirms that via a real title assertion before filtering.
    expect(
      screen.getByRole("heading", { name: "Barometric Low" }),
    ).toBeVisible();

    await openFilterSheet();
    const lastDoneGroup = screen.getByRole("group", { name: "LAST DONE" });
    await userEvent.click(
      within(lastDoneGroup).getByRole("button", { name: "21D+" }),
    );
    expect(screen.getByText("1 OPTION")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));

    // Still Barometric Low (it was already the pick, and it still matches
    // 21D+) — proves the filter narrowed the pool without needing to MOVE
    // the card in this particular case.
    expect(
      screen.getByRole("heading", { name: "Barometric Low" }),
    ).toBeVisible();
    expect(screen.getByText("21D+")).toBeVisible();
    expect(storedFilters("AT")).toMatchObject({ lastDone: "over21" });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove 21D+ filter" }),
    );
    expect(screen.queryByText("21D+")).not.toBeInTheDocument();
    expect(storedFilters("AT")).toMatchObject({ lastDone: null });
  });

  it("draft edits inside the sheet don't touch the applied overrides until Apply", async () => {
    mockReady();
    await renderToday();
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(screen.getByText(/Least recently done/)).toBeVisible();

    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "EASY" }));
    expect(screen.getByRole("button", { name: "EASY" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // The card underneath is untouched by the mid-edit draft — still the
    // pre-edit pick and reason, the sheet just happens to be drawn over it.
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(screen.getByText(/Least recently done/)).toBeVisible();
    // No memory has ever been written at all yet (this mount never applied
    // the sheet) — the draft edit above didn't create one either, the
    // strongest proof it never touched storage.
    expect(localStorage.getItem(TODAY_FILTERS_KEY)).toBeNull();
  });

  it("dismissing (Escape) drops the draft — reopening the sheet shows the untouched, previously-applied overrides", async () => {
    mockReady();
    await renderToday();
    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "EASY" }));
    expect(screen.getByRole("button", { name: "EASY" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(TODAY_FILTERS_KEY)).toBeNull();

    await openFilterSheet();
    expect(screen.getByRole("button", { name: "EASY" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Apply commits the draft, narrows the card, and closes the sheet", async () => {
    mockReady();
    await renderToday();
    await openFilterSheet();
    const easyChip = screen.getByRole("button", { name: "EASY" });
    await userEvent.click(easyChip);

    const primary = screen.getByRole("button", { name: "Apply Filter" });
    await userEvent.click(primary);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Same pick (the fellback pool is still the full AT list, sorted the
    // same way — every fixture here is "easy") — the REASON narrows to say
    // nothing matched, and the change is now the SAVED record.
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(screen.getByText(/Nothing fit your difficulty/)).toBeVisible();
    expect(storedFilters("AT")).toMatchObject({
      difficulties: ["medium", "hard"],
    });

    await openFilterSheet();
    expect(easyChip).toHaveAttribute("aria-pressed", "false");
  });

  // m5 (final fix wave, 2026-08-04 round final review): both existing
  // dismiss tests ("dismissing (Escape) drops the draft" above, and the
  // e2e backdrop-tap sweep) start from a record that was NEVER written and
  // assert the storage key stays `null` — they can't tell "dismiss doesn't
  // write" apart from "dismiss discards a SECOND draft, leaving the FIRST
  // applied record in place" apart from "dismiss quietly resets to
  // defaults." This is the one that actually exercises the seam between
  // `draft` (the sheet's own scratch state) and `overrides` (the saved
  // record `draft` is re-seeded from on every open) once a real record
  // already exists — the case a regression that made dismiss write would
  // slip straight through both existing tests.
  it("dismiss after a prior Apply leaves the FIRST applied record untouched — not the second draft, not defaults", async () => {
    mockReady();
    await renderToday();

    // First apply: drop HARD, keep EASY/MEDIUM. This is now the one and
    // only saved record until something else writes it.
    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));
    expect(storedFilters("AT")).toMatchObject({
      difficulties: ["easy", "medium"],
    });

    // Reopen and edit the draft further — drop EASY too — but never apply
    // this second edit.
    await openFilterSheet();
    expect(screen.getByRole("button", { name: "HARD" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(screen.getByRole("button", { name: "EASY" }));
    expect(screen.getByRole("button", { name: "EASY" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Dismiss (Escape) instead of Apply.
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // The saved record is still the FIRST apply's state — not the second
    // draft (["medium"] only, EASY dropped too) and not `filterDefaults`
    // (all three difficulties, CLEAR ALL's own reset shape).
    expect(storedFilters("AT")).toMatchObject({
      difficulties: ["easy", "medium"],
    });

    // Reopening confirms the sheet re-seeds from that same untouched
    // record too, not from the discarded second draft.
    await openFilterSheet();
    expect(screen.getByRole("button", { name: "EASY" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "MEDIUM" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "HARD" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("focus returns to FILTER ⌄ once the sheet closes via Apply", async () => {
    mockReady();
    await renderToday();
    const filterButton = screen.getByRole("button", { name: "FILTER ⌄" });
    await userEvent.click(filterButton);
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));
    expect(filterButton).toHaveFocus();
    expect(filterButton).toHaveAttribute("aria-expanded", "false");
  });

  it("PAIN cells are a multi-select union inside the sheet, independent of DIFFICULTY/TIME", async () => {
    mockReady();
    await renderToday();
    await openFilterSheet();
    const painGroup = screen.getByRole("group", { name: "PAIN" });
    const cell1 = within(painGroup).getByRole("button", { name: "1" });
    const cell2 = within(painGroup).getByRole("button", { name: "2" });
    expect(cell1).toHaveAttribute("aria-pressed", "false");
    expect(cell2).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(cell1);
    expect(cell1).toHaveAttribute("aria-pressed", "true");
    expect(cell2).toHaveAttribute("aria-pressed", "false");

    // Adding a second cell to the union leaves the first one active — this
    // is a union, not a single-select swap.
    await userEvent.click(cell2);
    expect(cell1).toHaveAttribute("aria-pressed", "true");
    expect(cell2).toHaveAttribute("aria-pressed", "true");

    // Removing one leaves the other in the union.
    await userEvent.click(cell1);
    expect(cell1).toHaveAttribute("aria-pressed", "false");
    expect(cell2).toHaveAttribute("aria-pressed", "true");
  });

  // Amendment (2026-08-04 PR #50 round): TIME unifies on the Library's own
  // bucket UNION — the old cap single-select is gone, so a cell toggles
  // independently and multiple can be active (or none) at once.
  it("TIME cells are a multi-select union, independent of DIFFICULTY/PAIN", async () => {
    mockReady();
    await renderToday();
    await openFilterSheet();
    // Default (60-min preference cap): the first three buckets pressed,
    // 60′+ not.
    expect(screen.getByRole("button", { name: "45–60′" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "60′+" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Deselecting one bucket leaves the others untouched — a union, not a
    // single-select swap.
    await userEvent.click(screen.getByRole("button", { name: "45–60′" }));
    expect(screen.getByRole("button", { name: "45–60′" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "<30′" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Adding 60′+ doesn't clear anything else either.
    await userEvent.click(screen.getByRole("button", { name: "60′+" }));
    expect(screen.getByRole("button", { name: "60′+" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "<30′" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // Fix round 1 (whole-branch review M3): restores the accessible-group-
  // name assertion this test originally made — CellGrid (Task 1's
  // extraction) initially rendered each group's label as a plain visible
  // `<span>` with no ARIA `role="group"`/`aria-labelledby` pairing at all
  // (matching Library's own FilterSheet groups, which never needed one),
  // a real regression versus Today's pre-Task-2 hand-rolled chip groups
  // (fix round 2, whole-branch review M4, which added `role="group"`
  // specifically for Today). M3 puts `role="group"` + `aria-labelledby`
  // back on `CellGrid` itself (additive — no Library test queries a group
  // role), so this asserts the real accessible name again, not just DOM
  // containment via the visible label.
  it("each sheet group has a visible group label wired to an accessible group name", async () => {
    mockReady();
    await renderToday();
    await openFilterSheet();

    const difficultyGroup = screen.getByRole("group", { name: "DIFFICULTY" });
    expect(screen.getByText("DIFFICULTY")).toBeVisible();
    expect(
      within(difficultyGroup).getByRole("button", { name: "EASY" }),
    ).toBeInTheDocument();

    const timeGroup = screen.getByRole("group", { name: "TIME" });
    expect(screen.getByText("TIME")).toBeVisible();
    expect(
      within(timeGroup).getByRole("button", { name: "45–60′" }),
    ).toBeInTheDocument();

    const painGroup = screen.getByRole("group", { name: "PAIN" });
    expect(screen.getByText("PAIN")).toBeVisible();
    for (const level of ["1", "2", "3", "4", "5"]) {
      expect(
        within(painGroup).getByRole("button", { name: level }),
      ).toBeInTheDocument();
    }
  });

  // A richer pool (see FILLING_LOW's own comment above) lets a PAIN filter
  // narrow to exactly ONE entry without suggest.ts's fellBack rule
  // reverting it back to the full list — proves the live count caption AND
  // the singular copy AND that the card the count promised is the card
  // Apply actually shows. Revision (mid-round): the count moved off the
  // button (now the constant "Apply Filter") onto its own caption.
  describe("live count caption, singular copy, and the card it promises", () => {
    it("the caption's live count matches the draft pool, and the card matches it 1:1 once applied", async () => {
      mockReady({ workouts: [ISOBAR, WARM_FRONT, FILLING_LOW] });
      await renderToday();
      await openFilterSheet();

      const painGroup = screen.getByRole("group", { name: "PAIN" });
      await userEvent.click(
        within(painGroup).getByRole("button", { name: "3" }),
      );

      // Singular-aware caption copy — Filling Low (pain 3) is the sole
      // survivor. The button itself is the constant "Apply Filter"
      // regardless of count.
      expect(screen.getByText("1 OPTION")).toBeVisible();
      expect(screen.queryByText("1 OPTIONS")).not.toBeInTheDocument();
      const primary = screen.getByRole("button", { name: "Apply Filter" });
      expect(primary).not.toBeDisabled();

      await userEvent.click(primary);
      expect(
        screen.getByRole("heading", { name: "Filling Low" }),
      ).toBeVisible();
    });
  });

  // Domain note (suggest.ts's own fellBack rule): narrowing difficulties/
  // pain to a combination that matches nothing among the current TYPE
  // never actually zeros the pool on its own — it falls back to the full
  // type-matched list instead (a real, if functionally inert, "nothing
  // fit your filters" state). The only way the pool genuinely reaches zero
  // is when the type itself has no library entries at all — this reuses
  // that same swapped-to-an-empty-type scenario the "type-swap chips"
  // describe below also exercises, from the sheet's own side.
  it("disables the primary at a genuinely empty draft pool (swapped to a type absent from the library), with the caption reading 0 OPTIONS", async () => {
    mockReady();
    await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "AN" }));
    expect(screen.getByText("No AN sessions in your library.")).toBeVisible();

    await openFilterSheet();
    expect(screen.getByText("0 OPTIONS")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply Filter" })).toBeDisabled();
  });
});

describe("Today (filter tokens: deviation, per-token clear, CLEAR ALL)", () => {
  it("shows no tokens and no CLEAR ALL at the pref-derived default (durations-at-default shows none)", async () => {
    mockReady();
    await renderToday();
    expect(document.querySelector(".filter-token")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CLEAR ALL" }),
    ).not.toBeInTheDocument();
  });

  it("a deviating group renders its own token, and that token's ✕ resets only its own group, saved immediately", async () => {
    mockReady();
    await renderToday();

    // Two deviations at once: DIFFICULTY narrowed AND a PAIN filter set.
    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));
    const painGroup = screen.getByRole("group", { name: "PAIN" });
    await userEvent.click(within(painGroup).getByRole("button", { name: "2" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));

    expect(screen.getByText("EASY–MEDIUM")).toBeVisible();
    expect(screen.getByText("PAIN 2")).toBeVisible();

    // Clearing PAIN's own token only resets painLevels — DIFFICULTY's own
    // deviation (and its token) survives untouched.
    await userEvent.click(
      screen.getByRole("button", { name: "Remove PAIN 2 filter" }),
    );
    expect(screen.queryByText("PAIN 2")).not.toBeInTheDocument();
    expect(screen.getByText("EASY–MEDIUM")).toBeVisible();
    expect(storedFilters("AT")).toMatchObject({
      difficulties: ["easy", "medium"],
      painLevels: [],
    });
  });

  it("clearing a DIFFICULTY token resets only difficulties, leaving a co-existing TIME deviation untouched", async () => {
    mockReady();
    await renderToday();

    // HARD off (a DIFFICULTY deviation) and 60′+ on (widens the default
    // three-bucket set to all four — a real TIME deviation, per the
    // Amendment's "all-four vs. a narrower default IS a deviation" rule).
    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));
    await userEvent.click(screen.getByRole("button", { name: "60′+" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));
    expect(screen.getByText("EASY–MEDIUM")).toBeVisible();
    expect(screen.getByText("<30′–60′+")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove EASY–MEDIUM filter" }),
    );
    expect(screen.queryByText("EASY–MEDIUM")).not.toBeInTheDocument();
    expect(screen.getByText("<30′–60′+")).toBeVisible();
    expect(storedFilters("AT")).toMatchObject({
      difficulties: ["easy", "medium", "hard"],
      durations: ["<30", "30-45", "45-60", "60+"],
    });
  });

  it("clearing a TIME (durations) token resets only durations, leaving a co-existing difficulty deviation untouched", async () => {
    mockReady();
    await renderToday();

    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));
    await userEvent.click(screen.getByRole("button", { name: "60′+" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));
    expect(screen.getByText("EASY–MEDIUM")).toBeVisible();
    expect(screen.getByText("<30′–60′+")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove <30′–60′+ filter" }),
    );
    expect(screen.queryByText("<30′–60′+")).not.toBeInTheDocument();
    expect(screen.getByText("EASY–MEDIUM")).toBeVisible();
    expect(storedFilters("AT")).toMatchObject({
      difficulties: ["easy", "medium"],
      durations: ["<30", "30-45", "45-60"],
    });
  });

  // Round 2 (2026-08-04): the SOURCE token's own ✕ resets exactly
  // `source: null` — Today.tsx's `resetFilterGroup`'s own final `else`
  // branch (the LAST DONE branch is exercised by the SOURCE=CUSTOM
  // integration test's own "Remove 21D+ filter" step above).
  it("clearing a SOURCE token resets only source, leaving a co-existing difficulty deviation untouched", async () => {
    mockReady();
    await renderToday();

    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));
    const sourceGroup = screen.getByRole("group", { name: "SOURCE" });
    await userEvent.click(
      within(sourceGroup).getByRole("button", { name: "GLOBAL" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));
    expect(screen.getByText("EASY–MEDIUM")).toBeVisible();
    expect(screen.getByText("GLOBAL")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove GLOBAL filter" }),
    );
    expect(screen.queryByText("GLOBAL")).not.toBeInTheDocument();
    expect(screen.getByText("EASY–MEDIUM")).toBeVisible();
    expect(storedFilters("AT")).toMatchObject({
      difficulties: ["easy", "medium"],
      source: null,
    });
  });

  it("CLEAR ALL restores every group to the pref-derived defaults (not empty), resets lastDone/source to null, and saves that record", async () => {
    mockReady();
    await renderToday();

    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));
    await userEvent.click(screen.getByRole("button", { name: "60′+" }));
    const painGroup = screen.getByRole("group", { name: "PAIN" });
    await userEvent.click(within(painGroup).getByRole("button", { name: "2" }));
    // Round 2 (2026-08-04): push LAST DONE/SOURCE off-default too — CLEAR
    // ALL's own null/null reset (Today.tsx's clearAllFilters) has to cover
    // these two exactly like the pre-existing three.
    const lastDoneGroup = screen.getByRole("group", { name: "LAST DONE" });
    await userEvent.click(
      within(lastDoneGroup).getByRole("button", { name: "<21D" }),
    );
    const sourceGroup = screen.getByRole("group", { name: "SOURCE" });
    await userEvent.click(
      within(sourceGroup).getByRole("button", { name: "GLOBAL" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));
    expect(
      screen.getByRole("button", { name: "CLEAR ALL" }),
    ).toBeInTheDocument();
    expect(screen.getByText("<21D")).toBeVisible();
    expect(screen.getByText("GLOBAL")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "CLEAR ALL" }));

    expect(document.querySelector(".filter-token")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CLEAR ALL" }),
    ).not.toBeInTheDocument();
    const saved = storedFilters("AT")!;
    expect(saved.difficulties).toStrictEqual(
      expect.arrayContaining(["easy", "medium", "hard"]),
    );
    expect(saved.difficulties).toHaveLength(3);
    // bucketsForCap(DEFAULT_PREFS.timeCapMinutes) — 60 keeps the first
    // three buckets, excluding 60+.
    expect(saved.durations).toStrictEqual(
      expect.arrayContaining(["<30", "30-45", "45-60"]),
    );
    expect(saved.durations).toHaveLength(3);
    expect(saved.painLevels).toStrictEqual([]);
    expect(saved.lastDone).toBeNull();
    expect(saved.source).toBeNull();

    await openFilterSheet();
    for (const label of ["EASY", "MEDIUM", "HARD"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    for (const label of ["<30′", "30–45′", "45–60′"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    expect(screen.getByRole("button", { name: "60′+" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    for (const label of ["<21D", "21D+", "GLOBAL", "CUSTOM"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });
});

describe("Today (overrides: persistence and invalidation)", () => {
  it("persists a type swap and a filter sheet change across a same-context remount", async () => {
    mockReady();
    const first = await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "O2" }));
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();

    // Every difficulty is active by default (DEFAULT_PREFS), so this
    // deselects HARD rather than selecting it — the change under test,
    // applied via the sheet (Task 2 — HARD is no longer a top-level chip).
    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();

    // Same-day "reload": unmount and mount fresh, mirroring the SHUFFLE
    // describe's own persistence test above.
    first.unmount();
    mockReady();
    await renderToday();

    expect(
      await screen.findByRole("heading", { name: "Sea Fret" }),
    ).toBeVisible();
    expect(screen.getByText("SESSION 12 OF 84 · AT → O2")).toBeVisible();
    await openFilterSheet();
    expect(screen.getByRole("button", { name: "HARD" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("discards the stored overrides once doneN advances (a session logged since)", async () => {
    mockReady();
    const first = await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "O2" }));
    expect(screen.getByText("SESSION 12 OF 84 · AT → O2")).toBeVisible();

    first.unmount();
    // A plain mockReady() re-registers the SAME doMock factories, which
    // Vitest only re-resolves for a FRESH module import — "./Today" (and
    // the hook modules it pulls in) are already cached from the render
    // above within this same test, so a second dynamic import would keep
    // returning the old PLAN_AT-backed instances without this. resetModules
    // forces the next `import("./Today")` in renderToday() to re-resolve
    // every mock from scratch against the new plan fixture below.
    vi.resetModules();
    mockReady({ plan: PLAN_AT_NEXT });
    await renderToday();

    // New context (doneN 12, not 11): the swap doesn't carry forward — the
    // plan line shows the plain prescribed code with no arrow, and the
    // previously-swapped O2 chip is no longer active.
    expect(await screen.findByText("SESSION 13 OF 84 · AT")).toBeVisible();
    expect(screen.getByRole("button", { name: "O2" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("Today (type-swap chips)", () => {
  // Freestyle chips (James, 2026-09-04: "i want it to look similar to how
  // it does right now when you DO have a plan selected"). With no plan
  // there is nothing to swap FROM, so the row starts with NO chip lit and
  // the word row reads ANY TYPE; a tap narrows the suggestion to that type,
  // and tapping the lit chip again clears it.
  it("renders the four type chips in freestyle mode with none pressed once the roll is suppressed, and keeps the FILTER sheet available", async () => {
    // Phase SF PR1 (I-5): a fresh freestyle day ROLLS a chip; "none
    // pressed" is the sticky-clear state, which the memory records.
    seedFilters({}, true);
    mockReady({ plan: FREESTYLE_PLAN });
    await renderToday();
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      expect(screen.getByRole("button", { name: type })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    expect(screen.getByText("ANY TYPE")).toBeInTheDocument();
    await openFilterSheet();
    expect(screen.getByRole("button", { name: "EASY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "45–60′" })).toBeInTheDocument();
    const painGroup = screen.getByRole("group", { name: "PAIN" });
    expect(
      within(painGroup).getByRole("button", { name: "1" }),
    ).toBeInTheDocument();
  });

  // James's 2026-08-08 ordering decision: every left-to-right type row reads
  // O2 · AT · TR · AN app-wide (the pyramid's base-first order), not the
  // AN-first order this row used before.
  it("renders the type-swap chips left-to-right as O2, AT, TR, AN", async () => {
    mockReady();
    const { container } = await renderToday();
    const labels = Array.from(
      container.querySelectorAll(".type-chip-grid .chip"),
    ).map((el) => el.textContent);
    expect(labels).toStrictEqual(["O2", "AT", "TR", "AN"]);
  });

  it("swapping the type chip changes the pool and the plan line shows PRESCRIBED → SWAPPED", async () => {
    mockReady();
    await renderToday();
    expect(screen.getByText("SESSION 12 OF 84 · AT")).toBeVisible();
    expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "O2" }));

    expect(screen.getByText("SESSION 12 OF 84 · AT → O2")).toBeVisible();
    expect(screen.getByRole("button", { name: "O2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Sea Fret (O2) is now the pool — none of the AT fixtures qualify.
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
  });

  // Task 1 (ui-fix round): DESIGN.md's selected-state fix — "Today's
  // accent-red O2 chip is the bug; it goes." The active type-swap chip now
  // fills with ITS OWN type colour (mirroring ClassificationCard.tsx's own
  // TYPE test), never a flat accent, and an inactive chip carries no style
  // at all.
  it("fills the active type-swap chip with its own type colour, not accent — inactive chips carry no style", async () => {
    mockReady();
    await renderToday();
    const atChip = screen.getByRole("button", { name: "AT" });
    expect(atChip).toHaveAttribute(
      "style",
      expect.stringContaining("--type-at"),
    );
    expect(atChip).toHaveAttribute(
      "style",
      expect.stringContaining("--on-color"),
    );
    expect(screen.getByRole("button", { name: "O2" })).not.toHaveAttribute(
      "style",
    );

    await userEvent.click(screen.getByRole("button", { name: "O2" }));

    expect(screen.getByRole("button", { name: "O2" })).toHaveAttribute(
      "style",
      expect.stringContaining("--type-o2"),
    );
    // AT just went from active to inactive: React clears the style
    // properties but (a documented React DOM quirk) can leave a bare
    // `style=""` attribute behind rather than removing it outright — assert
    // the type colour is gone, not attribute presence, which is what
    // actually matters here.
    expect(screen.getByRole("button", { name: "AT" })).not.toHaveAttribute(
      "style",
      expect.stringContaining("--type-at"),
    );
  });

  it("tapping the already-prescribed chip un-swaps and restores the original pool", async () => {
    mockReady();
    await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "O2" }));
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "AT" }));

    expect(screen.getByText("SESSION 12 OF 84 · AT")).toBeVisible();
    expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "O2" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
  });

  it("on a checkpoint day, the day's own real type reads active — no TEST code, no TR stand-in", async () => {
    mockReady({ plan: PLAN_CHECKPOINT });
    await renderToday();
    expect(screen.getByText("SESSION 7 OF 84 · AN")).toBeVisible();
    expect(screen.getByRole("button", { name: "AN" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "TR" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByText(/TEST/)).not.toBeInTheDocument();
  });

  it("swapping to a type with nothing in the library shows the existing empty-pool card, with the sheet's own cells still interactive", async () => {
    mockReady();
    await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "AN" }));

    expect(screen.getByText("No AN sessions in your library.")).toBeVisible();
    const buildLink = screen.getByRole("link", { name: /build a workout/i });
    expect(buildLink).toHaveAttribute("href", "/library/new");

    // The sheet's own cells remain interactive against the empty pool —
    // toggling one still flips its own pressed state rather than becoming
    // inert/disabled (only the primary button itself disables, at a
    // genuinely empty count — see the "Today (FILTER sheet)" describe).
    await openFilterSheet();
    const painGroup = screen.getByRole("group", { name: "PAIN" });
    const painCell = within(painGroup).getByRole("button", { name: "1" });
    await userEvent.click(painCell);
    expect(painCell).toHaveAttribute("aria-pressed", "true");
  });

  // Pins suggest.ts's own pick-lookup fallback (suggest.ts:117-120,
  // `sorted.find(...) ?? undefined` then `picked = pickOverride ?? sorted[0]`)
  // from the swap side: SHUFFLE/pick state itself is untouched by this task,
  // so a stale pick from BEFORE a swap has to fall back inside suggest
  // rather than the UI crashing or silently keeping a now-invalid id.
  it("a SHUFFLE pick that falls outside a newly-swapped pool falls back to the new pool's own default", async () => {
    mockReady();
    await renderToday();
    const shuffle = screen.getByRole("button", { name: /shuffle/i });
    await userEvent.click(shuffle); // Stationary Front (AT) -> Pressure Ridge (AT)
    expect(
      screen.getByRole("heading", { name: "Pressure Ridge" }),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "O2" }));

    // "w-tailwind" isn't in the O2 pool — suggest() can't find it by id in
    // the swapped pool, so the pick falls back to the pool's own
    // least-recently-done default (Sea Fret, the only O2 entry) instead of
    // crashing or keeping the stale AT id.
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
    expect(screen.queryByText(/YOUR PICK/)).not.toBeInTheDocument();
  });
});

// Phase 8A Task 2: Today resolves the plan day's prescription against the
// UNFILTERED library (the prescribed test is deliberately excluded from
// `entries`' suggestion pool by the onboarding-title filter) and pins it
// via suggest()'s prescribed branch. James's chips ruling (2026-08-12): a
// chip swap OVERRIDES the prescription — the rower acting now wins — with
// a visible marker that says overridden and never names the displaced
// workout. Every fixture here is a real GLOBAL_LIBRARY_SEED member
// (LIBRARY_WORKOUTS / ONBOARDING_LIBRARY_WORKOUTS), per recurring-failure
// #3.
describe("Today (plan checkpoint prescription)", () => {
  it("pins the plan's own test from the UNFILTERED library, with its authored reason", async () => {
    mockReady({
      plan: PLAN_CHECKPOINT,
      workouts: [ZEPHYR, SCUD_CLOUD, DUST_WHIRL, TEST_2K, TEST_6K],
    });
    await renderToday();
    // The 2K Test is excluded from the suggestion pool (`entries`) by the
    // onboarding-title filter — reaching the card at all proves the
    // resolution ran against the unfiltered library.
    expect(screen.getByRole("heading", { name: "2K Test" })).toBeVisible();
    expect(
      screen.getByText(
        "Plan checkpoint: re-test your 2k and update your baseline.",
      ),
    ).toBeVisible();
    expect(screen.getByText("SUGGESTED")).toBeVisible();
    expect(cardLinkTo("w-test2k")).toBeDefined();
  });

  it("the head plan's checkpoint prescribes the 6K Test, and its seed type (AT) now matches the AT day code — chip and card badge agree", async () => {
    mockReady({
      plan: PLAN_HEAD_CHECKPOINT,
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TEST_2K, TEST_6K],
    });
    await renderToday();
    expect(screen.getByRole("heading", { name: "6K Test" })).toBeVisible();
    expect(
      screen.getByText(
        "Plan checkpoint: re-test your 6k and update your baseline.",
      ),
    ).toBeVisible();
    // PR B's reclassification (6K: O2 -> AT) dissolved PR A's pinned
    // mismatch: the lit chip (the AT day code) and the card's own type
    // badge now tell the same story, with no override marker in sight.
    expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText(/CHECKPOINT OVERRIDDEN/)).not.toBeInTheDocument();
  });

  it("an account with none of the day's own type still gets its checkpoint — SHUFFLE is disabled and the chips are the exit", async () => {
    // The empty-pool case the prescription bypass exists to serve: no AN
    // workout anywhere in the library, so the pool is empty and SHUFFLE
    // (canShuffle = poolIds.length > 1) is dead. The chips must still
    // provide the way out.
    mockReady({
      plan: PLAN_CHECKPOINT,
      workouts: [ZEPHYR, TEST_2K, TEST_6K],
    });
    await renderToday();
    expect(screen.getByRole("heading", { name: "2K Test" })).toBeVisible();
    expect(screen.getByRole("button", { name: /shuffle/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "O2" }));

    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
    expect(
      screen.getByText("SESSION 7 OF 84 · AN → O2 · CHECKPOINT OVERRIDDEN"),
    ).toBeVisible();
  });

  it("a chip swap overrides the prescription with the visible marker; un-swapping restores the checkpoint", async () => {
    mockReady({
      plan: PLAN_CHECKPOINT,
      workouts: [ZEPHYR, SCUD_CLOUD, DUST_WHIRL, TEST_2K, TEST_6K],
    });
    await renderToday();
    expect(screen.getByRole("heading", { name: "2K Test" })).toBeVisible();
    expect(screen.queryByText(/CHECKPOINT OVERRIDDEN/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "O2" }));

    expect(
      screen.getByText("SESSION 7 OF 84 · AN → O2 · CHECKPOINT OVERRIDDEN"),
    ).toBeVisible();
    // The marker says overridden; it does NOT name the displaced workout
    // (James's ruling, 2026-08-12).
    expect(screen.queryByText(/2K Test/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "AN" }));

    expect(screen.queryByText(/CHECKPOINT OVERRIDDEN/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2K Test" })).toBeVisible();
  });

  it("an ordinary swapped day shows the arrow but never the marker", async () => {
    mockReady(); // PLAN_AT: sprint index 11, no prescription authored there
    await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "O2" }));

    expect(screen.getByText("SESSION 12 OF 84 · AT → O2")).toBeVisible();
    expect(screen.queryByText(/CHECKPOINT OVERRIDDEN/)).not.toBeInTheDocument();
  });

  it("SHUFFLE escapes the checkpoint into the day's own type pool", async () => {
    mockReady({
      plan: PLAN_CHECKPOINT,
      workouts: [ZEPHYR, SCUD_CLOUD, DUST_WHIRL, TEST_2K, TEST_6K],
    });
    await renderToday();
    expect(screen.getByRole("heading", { name: "2K Test" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /shuffle/i }));

    // The prescribed entry sits OUTSIDE poolIds, so the escape lands on
    // the pool's own least-recently-done member (Dust Whirl, 9 days > 5),
    // and the live pick beats the prescription (suggest.ts's own rule).
    expect(screen.getByRole("heading", { name: "Dust Whirl" })).toBeVisible();
    expect(screen.getByText(/YOUR PICK/)).toBeVisible();
    // Phase SF PR1 (review F4): the escape is a real draw — the shown list
    // starts at the drawn id and never contains the pin (it is never a
    // candidate, so it is never drawn).
    expect(
      (JSON.parse(localStorage.getItem(TODAY_PICK_KEY)!) as TodayPick).shownIds,
    ).toStrictEqual(["w-dustwhirl"]);
  });
});

// James's request (2026-08-08): a descriptor word beneath the type-swap
// chips, like Builder's ClassificationCard's own TYPE_WORDS — reference
// tests below mirror ClassificationCard.test.tsx's own "shows %s's summary
// word" coverage, but sourced from the EFFECTIVE type (`swapType ??
// effectivePrescribed`), not a controlled `type` prop.
describe("Today (type descriptor word)", () => {
  it("shows the plan's prescribed type's word with no swap (AT -> COMFORTABLY HARD)", async () => {
    mockReady();
    await renderToday();
    expect(screen.getByText("COMFORTABLY HARD")).toBeInTheDocument();
  });

  it("tracks a swap to the effective type's own word (-> O2 -> LOW & SLOW)", async () => {
    mockReady();
    await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "O2" }));
    expect(screen.queryByText("COMFORTABLY HARD")).not.toBeInTheDocument();
    expect(screen.getByText("LOW & SLOW")).toBeInTheDocument();
  });

  it("reverts to the prescribed type's word once un-swapped", async () => {
    mockReady();
    await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "O2" }));
    expect(screen.getByText("LOW & SLOW")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "AT" }));

    expect(screen.queryByText("LOW & SLOW")).not.toBeInTheDocument();
    expect(screen.getByText("COMFORTABLY HARD")).toBeInTheDocument();
  });

  it("on a checkpoint day, shows the day's own type's word (AN -> SPEED WORK)", async () => {
    mockReady({ plan: PLAN_CHECKPOINT });
    await renderToday();
    expect(screen.getByText("SPEED WORK")).toBeInTheDocument();
  });

  it("reads ANY TYPE in freestyle mode with no chip lit (roll suppressed), and the tapped chip's word once one is", async () => {
    seedFilters({}, true);
    mockReady({ plan: FREESTYLE_PLAN });
    await renderToday();
    for (const word of [
      "LOW & SLOW",
      "COMFORTABLY HARD",
      "HARD INTERVALS",
      "SPEED WORK",
    ]) {
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    }
    expect(screen.getByText("ANY TYPE")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "TR" }));
    expect(screen.getByText("HARD INTERVALS")).toBeInTheDocument();
    expect(screen.queryByText("ANY TYPE")).not.toBeInTheDocument();
  });

  // The chips already convey the selected type to assistive tech via each
  // TodayChip's own `aria-pressed` — this word is purely presentational
  // reinforcement of that same state, so it's hidden from the accessibility
  // tree rather than announced a second time.
  it("is aria-hidden — the chips' own aria-pressed already conveys the selection", async () => {
    mockReady();
    await renderToday();
    const word = screen.getByText("COMFORTABLY HARD");
    const row = word.closest(".type-word-row");
    expect(row).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Today (LAST THREE)", () => {
  // docs/design/README.md:185's row format, literally: date (not
  // days-ago) · the plain word (not a glyph) · pain, e.g. "JUL 25 · HELD ·
  // 2/10" — "/5" here, not the handoff's literal "/10", because
  // docs/design/DEVIATIONS.md's first row already establishes Ergomatic's
  // pain scale is 1-5 everywhere else in the app (PainBar, WorkoutDetail,
  // Library's own 1-5 PAIN filter cells); matching the handoff's "/10"
  // verbatim would contradict that already-decided, already-documented
  // deviation.
  it("renders title, calendar date, the held/under/over word, and pain /5 per log", async () => {
    mockReady();
    await renderToday();

    const section = screen
      .getByRole("heading", { name: "ALL SESSIONS" })
      .closest("section")!;
    expect(within(section).getByText("Occluded Front")).toBeVisible();
    expect(within(section).getByText(/JUL 25/)).toBeVisible();
    expect(within(section).getByText(/HELD/)).toBeVisible();
    expect(within(section).getByText(/2\/5/)).toBeVisible();

    expect(within(section).getByText("Sea Fret")).toBeVisible();
    expect(within(section).getByText(/JUL 20/)).toBeVisible();
    expect(within(section).getByText(/UNDER/)).toBeVisible();
    expect(within(section).getByText(/1\/5/)).toBeVisible();

    expect(within(section).getByText("Deleted Workout")).toBeVisible();
    expect(within(section).getByText(/JUL 10/)).toBeVisible();
    expect(within(section).getByText(/OVER/)).toBeVisible();
    expect(within(section).getByText(/4\/5/)).toBeVisible();
  });

  it("shows an empty message when nothing has been logged yet", async () => {
    mockReady({ logs: [] });
    await renderToday();
    expect(screen.getByText("No sessions logged yet.")).toBeVisible();
  });

  // R-A (docs/superpowers/specs/2026-08-17-post-workout-summary-design.md):
  // the null-tolerant read that must ship before any code can write a null
  // held/pain. Today.tsx used to do `log.held.toUpperCase()` unconditionally
  // with no error boundary in the app - a null `held` white-screened this
  // whole route. Locks in the exact byte-identical string for a full row
  // (not just per-segment regexes, which would pass even if the joiner or
  // segment order changed) so a future edit can't silently reorder the
  // meta line.
  it("renders the exact meta string for a full (non-null) row", async () => {
    mockReady();
    await renderToday();

    const section = screen
      .getByRole("heading", { name: "ALL SESSIONS" })
      .closest("section")!;
    const row = within(section).getByText("Occluded Front").closest("li")!;
    expect(within(row).getByText("JUL 25 · HELD · 2/5")).toBeVisible();
  });

  it("renders without throwing and reads the date alone when held and pain are both null", async () => {
    mockReady({
      logs: [
        {
          id: "log-null",
          workoutId: "w-isobar",
          workoutTitle: "Occluded Front",
          workoutType: "AT",
          loggedAt: "2026-07-25T12:00:00.000Z",
          held: null,
          pain: null,
          thumbs: null,
          avgSplitSeconds: null,
          timeSeconds: null,
          distanceMeters: null,
          planKey: null,
          planIndex: null,
          workSeconds: null,
          workMeters: null,
          machineWorkSeconds: null,
          machineWorkMeters: null,
          machineAvgPaceSecondsPer500m: null,
          endedBy: null,
          partial: false,
        },
      ],
    });
    await renderToday();

    const section = screen
      .getByRole("heading", { name: "ALL SESSIONS" })
      .closest("section")!;
    const row = within(section).getByText("Occluded Front").closest("li")!;
    expect(within(row).getByText("JUL 25")).toBeVisible();
    expect(within(row).queryByText(/·/)).not.toBeInTheDocument();
  });

  it("omits only the missing segment when held is null but pain is present", async () => {
    mockReady({
      logs: [
        {
          id: "log-partial",
          workoutId: "w-isobar",
          workoutTitle: "Occluded Front",
          workoutType: "AT",
          loggedAt: "2026-07-25T12:00:00.000Z",
          held: null,
          pain: 2,
          thumbs: null,
          avgSplitSeconds: null,
          timeSeconds: null,
          distanceMeters: null,
          planKey: null,
          planIndex: null,
          workSeconds: null,
          workMeters: null,
          machineWorkSeconds: null,
          machineWorkMeters: null,
          machineAvgPaceSecondsPer500m: null,
          endedBy: null,
          partial: false,
        },
      ],
    });
    await renderToday();

    const section = screen
      .getByRole("heading", { name: "ALL SESSIONS" })
      .closest("section")!;
    const row = within(section).getByText("Occluded Front").closest("li")!;
    expect(within(row).getByText("JUL 25 · 2/5")).toBeVisible();
  });

  // Door spec (2026-09-02) §1.3, Gate 0-A slot B: the chip rides the
  // NUMBERS line, and Today's LAST THREE rows render no numbers line
  // (`LogRow`'s `hero` prop is false here and only here). James approved
  // that slot knowing this: Today stays silent about a stopped session,
  // History says it. This pins the accepted cost so a later change cannot
  // introduce it to Today by accident.
  it("a partial row in LAST THREE wears NO chip — Today renders no numbers line, the accepted Gate 0-A cost", async () => {
    mockReady({
      logs: [
        {
          ...LOGS[0],
          partial: true,
          endedBy: "rower",
          avgSplitSeconds: 124,
          distanceMeters: 2000,
        },
      ],
    });
    const { container } = await renderToday();

    const section = screen
      .getByRole("heading", { name: "ALL SESSIONS" })
      .closest("section")!;
    expect(within(section).getByText("Occluded Front")).toBeVisible();
    expect(container.querySelector(".log-partial-chip")).toBeNull();
    expect(container.querySelector(".today-log-hero")).toBeNull();
  });

  // From-the-log spec (2026-08-18), §1: the heading is now the ALL
  // SESSIONS link to /today/log, replacing the static "LAST THREE" label.
  it("the heading is the ALL SESSIONS link to /today/log", async () => {
    mockReady();
    await renderToday();

    const link = screen.getByRole("link", { name: "ALL SESSIONS" });
    expect(link).toHaveAttribute("href", "/today/log");
  });

  it("stamps state={from:'/today'} onto the ALL SESSIONS heading link", async () => {
    mockReady();
    await renderTodayWithProbes();
    await userEvent.click(screen.getByRole("link", { name: "ALL SESSIONS" }));
    expect(await screen.findByText("PROBE from=/today")).toBeVisible();
  });

  // §1: each LAST THREE row opens the from-the-log view — the row itself
  // is the tappable target, not just its title text.
  it("each row is a link to /today/log/:id", async () => {
    mockReady();
    await renderToday();

    const section = screen
      .getByRole("heading", { name: "ALL SESSIONS" })
      .closest("section")!;
    const link = within(section)
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/today/log/log-1");
    expect(link).toBeDefined();
    expect(within(link!).getByText("Occluded Front")).toBeVisible();
  });

  it("stamps state={from:'/today'} onto each LAST THREE row link", async () => {
    mockReady();
    await renderTodayWithProbes();

    const row = screen.getByText("Occluded Front").closest("a")!;
    await userEvent.click(row);
    expect(await screen.findByText("PROBE from=/today")).toBeVisible();
  });
});

describe("Today (empty library)", () => {
  it("links to the builder instead of rendering a blank card", async () => {
    mockReady({ workouts: [] });
    await renderToday();
    expect(screen.getByText("No AT sessions in your library.")).toBeVisible();
    const buildLink = screen.getByRole("link", { name: /build a workout/i });
    expect(buildLink).toHaveAttribute("href", "/library/new");
  });

  // Same "from" chain as the suggestion card's own link (above): Builder's
  // BACK must return here, not to /library, once this is the only way into
  // the builder Today itself offers.
  it("stamps state={from:'/today'} onto the + Build a workout link", async () => {
    mockReady({ workouts: [] });
    await renderTodayWithProbes();
    await userEvent.click(
      screen.getByRole("link", { name: /build a workout/i }),
    );
    expect(await screen.findByText("PROBE from=/today")).toBeVisible();
  });
});

// Phase 7A Task 5 fixture, hoisted to module scope in the F6 spec 2b round
// so both this describe block's own LIVE/completed guard tests below AND
// the "interrupted connected session row" describe further down (2b, Task
// 4) can build a MonitorRun from the same shape rather than two near-copies
// drifting apart.
function makeMonitorRun(overrides: Partial<MonitorRun>): MonitorRun {
  return {
    v: 1,
    workoutId: "w-warmfront",
    title: "Stationary Front",
    program: { intervals: [] },
    actuals: [],
    deviceName: "PM5 (test)",
    startedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    completedAt: null,
    terminated: false,
    ...overrides,
  };
}

describe("Today (stale draft discard on mount)", () => {
  function makeDraft(overrides: Partial<SessionDraft>): SessionDraft {
    return {
      v: 1,
      workoutId: "w-warmfront",
      title: "Stationary Front",
      type: "AT",
      steps: [],
      nudges: {},
      spmOverrides: {},
      removed: [],
      createdAt: new Date().toISOString(),
      startedAt: null,
      ...overrides,
    };
  }

  it("discards a draft older than 24h with no startedAt", async () => {
    const stale = makeDraft({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      startedAt: null,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stale));
    mockReady();
    await renderToday();
    await screen.findByRole("heading", { name: "Today" });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("leaves a started draft alone even when old", async () => {
    const started = makeDraft({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      startedAt: new Date().toISOString(),
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(started));
    mockReady();
    await renderToday();
    await screen.findByRole("heading", { name: "Today" });
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it("leaves a fresh, unstarted draft alone", async () => {
    const fresh = makeDraft({
      createdAt: new Date().toISOString(),
      startedAt: null,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(fresh));
    mockReady();
    await renderToday();
    await screen.findByRole("heading", { name: "Today" });
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  // Phase 6B Task 4 amendment: a completed-but-unlogged run record protects
  // its draft from the stale discard regardless of age — tested both
  // directions, per the task brief, against the SAME stale/never-started
  // draft shape the first test above already proves gets discarded without
  // one.
  function makeRun(overrides: Partial<SessionRun>): SessionRun {
    return {
      v: 1,
      mode: "workout",
      workoutId: "w-warmfront",
      title: "Stationary Front",
      phases: [],
      index: 1,
      phaseStartedAt: new Date().toISOString(),
      pausedAt: null,
      pausedTotalMs: 0,
      actuals: {},
      startedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      completedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("keeps a stale, never-started-looking draft when its run record shows a completed session", async () => {
    const stale = makeDraft({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      startedAt: null,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stale));
    localStorage.setItem(RUN_KEY, JSON.stringify(makeRun({})));
    mockReady();
    await renderToday();
    await screen.findByRole("heading", { name: "Today" });
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it("still discards a stale, never-started draft when the run record isn't a completed one", async () => {
    const stale = makeDraft({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      startedAt: null,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stale));
    // An in-progress (not yet completed) run must NOT protect — only an
    // actually-finished session earns the exception.
    localStorage.setItem(
      RUN_KEY,
      JSON.stringify(makeRun({ completedAt: null })),
    );
    mockReady();
    await renderToday();
    await screen.findByRole("heading", { name: "Today" });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  // Phase 7A Task 5 amendment: a LIVE monitor run (a workout currently
  // being run by a connected PM5, `completedAt === null`) gets its own
  // exception, distinct from the completed-SessionRun one above — see
  // Today.tsx's own comment on why a MONITOR run protects while LIVE
  // (nothing sets this draft's `startedAt` while the erg, not this
  // screen's timer, owns pacing) rather than while completed-and-unlogged
  // like the sessionRun case. `makeMonitorRun` itself is now module-scope
  // (see above) — used here and in the 2b interrupted-row describe below.
  it("keeps a stale, never-started-looking draft when a monitor run is LIVE", async () => {
    const stale = makeDraft({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      startedAt: null,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stale));
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(makeMonitorRun({ completedAt: null })),
    );
    mockReady();
    await renderToday();
    await screen.findByRole("heading", { name: "Today" });
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it("still discards a stale, never-started draft when the monitor run is completed, not live", async () => {
    const stale = makeDraft({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      startedAt: null,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stale));
    // A completed-but-unlogged monitor run is NOT the exception this rule
    // grants — unlike the sessionRun side, only LIVE protects here (see
    // Today.tsx's own comment).
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(makeMonitorRun({ completedAt: new Date().toISOString() })),
    );
    mockReady();
    await renderToday();
    await screen.findByRole("heading", { name: "Today" });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  // THE COMPOSED §8 GATE (final fix round, 2026-08-30; adversarial pass
  // F-2). Spec §8: "malformed durable bytes are never cleared during a
  // read." Every existing test of that rule lives at the STORE — and the
  // store was never the reader that broke it. `Today.tsx`'s mount effect
  // calls `loadMonitorRun()`, whose read path used to fall through to
  // `clearMonitorRun()` on any unparseable or unrecognised blob, so simply
  // OPENING Today destroyed the bytes. That is the store's own recorded
  // rule falsified in the composed app, and it also falsified this
  // component's own justification comment ("never setItem/removeItem ...
  // destroys nothing"). Starts UPSTREAM of the destroyer (bytes on disk,
  // nothing mounted) and asserts downstream of it — RF24's shape.
  it("a MALFORMED monitor record SURVIVES a Today mount, byte-for-byte — the guard's read destroys nothing (spec §8)", async () => {
    const garbage = '{"v":2,"startedAt":"2026-08-30T09:00:00.000Z"';
    localStorage.setItem(MONITOR_RUN_KEY, garbage);
    const stale = makeDraft({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      startedAt: null,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stale));

    mockReady();
    await renderToday();
    await screen.findByRole("heading", { name: "Today" });

    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe(garbage);
    // ...and the guard still ANSWERS: an unreadable record is not a live
    // session, so the stale draft is discarded exactly as it would be with
    // no record at all. Surviving bytes must not come at the cost of the
    // guard silently treating garbage as "something is running".
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("an unrecognised-VERSION monitor record survives a Today mount too — the shape check is a different branch from the JSON parse", async () => {
    const futureVersion = JSON.stringify({
      ...makeMonitorRun({ completedAt: null }),
      v: 99,
    });
    localStorage.setItem(MONITOR_RUN_KEY, futureVersion);
    mockReady();
    await renderToday();
    await screen.findByRole("heading", { name: "Today" });
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe(futureVersion);
  });

  // PR #239 review round 1, item 1 (P1) — THE MOUNTED-TODAY GETTER GATE.
  // Spec §8 says a storage-getter `SecurityError` "makes both tiers behave
  // as absent-durable ... never an unhandled throw", and names this exact
  // loader as the thing the store's accessor absorbs. The store's own reads
  // were wrapped from day one; `Today.tsx:418`'s legacy `loadMonitorRun()`
  // was not — its `localStorage.getItem` sat outside the loader's `try`, so
  // a denied getter escaped the mount effect and took the whole screen down.
  // Starts UPSTREAM of the reader (denial armed, nothing mounted) and
  // asserts downstream of it, RF24's shape.
  //
  // SCOPED TO THIS KEY ON PURPOSE, said aloud rather than left implied: the
  // spy denies `MONITOR_RUN_KEY` only. A blanket denial still takes Today
  // down at `loadRun()` (`Today.tsx:280`) before this loader is ever
  // reached — that is AUD-011's remaining three loaders (`loadRun`,
  // `loadDraft`, `loadTodayPick`), tracked in ROADMAP and NOT this branch's
  // scope. A key-scoped spy is the only shape that can go red on the
  // loader this branch actually owns; a blanket one would be red before and
  // after the fix and would prove nothing about it.
  it("survives a DENIED storage getter on the monitor key: Today mounts, and the durable record reads as absent (spec §8)", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(makeMonitorRun({ completedAt: null })),
    );
    const stale = makeDraft({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      startedAt: null,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stale));

    const real = Storage.prototype.getItem;
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(function (this: Storage, key: string): string | null {
        if (key === MONITOR_RUN_KEY) {
          throw new DOMException("storage is denied", "SecurityError");
        }
        return real.call(this, key);
      });
    try {
      mockReady();
      await renderToday();
      // Mounts cleanly — the throw is absorbed, not surfaced.
      await screen.findByRole("heading", { name: "Today" });
      // ...and the guard ANSWERS, treating the denied durable tier as
      // absent: a LIVE record would have protected this stale draft, so its
      // discard is the observable consequence of "absent", not merely of
      // "did not crash". A mutant that swallowed the throw but returned the
      // record anyway would leave the draft in place and fail here.
      expect(real.call(localStorage, DRAFT_KEY)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  // Storage-denial spec (2026-09-03) §1/§3 leg 1 — the anchor's own
  // condition (1): a Today fixture that actually reaches `loadTodayPick`.
  // The audit's original mounted-Today probe never got there because
  // `loadRun()` (Today.tsx's mount) threw first; this PR's Task 1 closes
  // that loader, so THIS is the first test that can exercise
  // `loadTodayPick`'s own guard through a real Today mount. `mockReady()`'s
  // default PLAN_AT (planKey "sprint", doneN 11) is simply the fixture's own
  // default — the `loadTodayPick` call fires unconditionally on mount in
  // both plan and freestyle modes (Today.tsx's own `pickOverride` lazy
  // initializer), so no particular plan/freestyle state is what makes it
  // reachable. SCOPED TO THIS KEY ON PURPOSE, same reasoning as the
  // MONITOR_RUN_KEY test above: a blanket denial still dies at `loadRun()`
  // first and would prove nothing about this loader.
  it("survives a DENIED storage getter on the today-pick key: Today mounts, and the daily pick reads as absent (storage-denial spec §1/§3)", async () => {
    mockReady();
    const real = Storage.prototype.getItem;
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(function (this: Storage, key: string): string | null {
        if (key === TODAY_PICK_KEY) {
          throw new DOMException("storage is denied", "SecurityError");
        }
        return real.call(this, key);
      });
    try {
      await renderToday();
      // Mounts cleanly — the throw is absorbed, not surfaced — and falls
      // back to the pool's own least-recently-done pick (the same default
      // the SHUFFLE describe block's first assertion pins for this exact
      // `mockReady()` fixture), proving the denial read as ABSENT rather
      // than merely "did not crash".
      expect(
        await screen.findByRole("heading", { name: "Stationary Front" }),
      ).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Today (loading/error states)", () => {
  // Each hook's own error state gets a distinct message + retry — mirrors
  // Library.tsx/WorkoutDetail.tsx's per-hook error branches. Building all
  // five "ready" mocks and overriding exactly one to "error" proves each
  // `if` branch is reachable independently, not just the first one checked.
  function mockAllReadyExcept(
    erroring: "workouts" | "baselines" | "plan" | "preferences" | "logs",
    retry: () => void,
  ) {
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () =>
        erroring === "workouts"
          ? { state: "error", retry }
          : {
              state: "ready",
              workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND],
            },
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () =>
        erroring === "baselines"
          ? { state: "error", retry }
          : { state: "ready", baselines: BASELINES },
    }));
    vi.doMock("../api/usePlan", () => ({
      usePlan: () =>
        erroring === "plan"
          ? { state: "error", retry }
          : { state: "ready", plan: PLAN_AT },
    }));
    vi.doMock("../api/usePreferences", () => ({
      usePreferences: () =>
        erroring === "preferences"
          ? { state: "error", retry }
          : { state: "ready", preferences: DEFAULT_PREFS },
    }));
    vi.doMock("../api/useRecentLogs", () => ({
      useRecentLogs: () =>
        erroring === "logs"
          ? { state: "error", retry }
          : { state: "ready", logs: LOGS },
    }));
  }

  it.each([
    ["workouts", "Couldn't load your library."],
    ["baselines", "Couldn't load your baselines."],
    ["plan", "Couldn't load your plan."],
    ["preferences", "Couldn't load your preferences."],
    ["logs", "Couldn't load your recent sessions."],
  ] as const)(
    "shows a retry control when %s fails to load, and clicking retry calls it",
    async (erroring, message) => {
      const retry = vi.fn();
      mockAllReadyExcept(erroring, retry);
      await renderToday();
      expect(screen.getByText(message)).toBeVisible();
      const retryButton = screen.getByRole("button", { name: /retry/i });
      expect(retryButton).toBeVisible();
      await userEvent.click(retryButton);
      expect(retry).toHaveBeenCalledTimes(1);
    },
  );

  it("shows a loading status while any hook is still loading", async () => {
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "ready", baselines: BASELINES }),
    }));
    vi.doMock("../api/usePlan", () => ({
      usePlan: () => ({ state: "ready", plan: PLAN_AT }),
    }));
    vi.doMock("../api/usePreferences", () => ({
      usePreferences: () => ({ state: "ready", preferences: DEFAULT_PREFS }),
    }));
    vi.doMock("../api/useRecentLogs", () => ({
      useRecentLogs: () => ({ state: "ready", logs: LOGS }),
    }));
    await renderToday();
    expect(screen.getByText("LOADING…")).toBeVisible();
  });
});

// F2/F3a (whole-branch review): a cold start (the OS killed the app
// mid-session — real on iOS) has to surface a way back into a live or
// completed-but-unlogged run right from Today, since Start on the
// suggestion card only ever REPLACES it. A real library workout distinct
// from every fixture `mockReady`'s own library uses (Filling Low never
// appears there) — so a resume-card assertion can never coincidentally
// match the suggestion card's own text, and the fixture proves F3a's own
// point in passing: the resume card renders straight off `run.title`, with
// no need for Filling Low to be a real library entry OR for a matching
// draft to exist in storage.
const RESUME_BASELINES = { k2Seconds: 100, k6Seconds: 120 };

function liveRunFor(startedAt: Date): SessionRun {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "w-fillinglow",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  return buildRun(draft, RESUME_BASELINES, startedAt);
}

describe("Today (F2: session resume / unlogged)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a resume card above the suggestion card, naming the live run's workout and its elapsed time, with a Resume session link to the live timer", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    // 753.6s ago (12:34 once rounded) — pins Math.round, not Math.floor: a
    // floor-based implementation would read 753s, i.e. "12:33 elapsed".
    const startedAt = new Date(now.getTime() - 753.6 * 1000);
    localStorage.setItem(RUN_KEY, JSON.stringify(liveRunFor(startedAt)));
    mockReady();
    await renderToday();

    expect(screen.getByText("SESSION IN PROGRESS")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Filling Low" })).toBeVisible();
    expect(screen.getByText("12:34 elapsed")).toBeVisible();
    const resumeLink = screen.getByRole("link", { name: "Resume session" });
    expect(resumeLink).toBeVisible();
    expect(resumeLink).toHaveAttribute("href", "/session/run");

    // Above the suggestion card, not merely present somewhere on the page —
    // the brief's own "most prominent element" placement.
    const main = document.querySelector("main")!;
    expect(main.textContent!.indexOf("SESSION IN PROGRESS")).toBeLessThan(
      main.textContent!.indexOf("SUGGESTED"),
    );
  });

  // Fix round 1 (reviewer, smaller item): the ✕/staged-Discard control only
  // ever renders from `run.completedAt !== null` at the render SITE
  // (Today.tsx's own `{run !== null && run.completedAt !== null &&
  // <UnloggedRow run={run} />}`) — a structural guard, never previously
  // pinned by a rendering test against the LIVE-run branch specifically.
  it("renders no Discard/✕ control at all while the run is still live (completedAt null) — only the resume card gets one", async () => {
    const startedAt = new Date("2026-08-01T11:50:00.000Z");
    localStorage.setItem(RUN_KEY, JSON.stringify(liveRunFor(startedAt)));
    mockReady();
    await renderToday();

    expect(screen.getByText("SESSION IN PROGRESS")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".unsaved-row")).not.toBeInTheDocument();
  });

  it("shows a quieter line naming the workout, with a real Log it action, when the run is already complete (completed-but-unlogged)", async () => {
    const built = liveRunFor(new Date("2026-08-01T11:00:00.000Z"));
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date("2026-08-01T11:40:00.000Z").toISOString(),
    };
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    mockReady();
    await renderToday();

    expect(screen.getByText("Filling Low")).toBeVisible();
    expect(screen.getByText(/UNSAVED WORKOUT/)).toBeVisible();
    // Phase 6C Task 2: the placeholder copy ("6C will log it here") is
    // replaced by a real link to the screen that now exists.
    const logLink = screen.getByRole("link", { name: /Review & save/ });
    expect(logLink).toBeVisible();
    expect(logLink).toHaveAttribute(
      "href",
      `/session/review?source=timer&startedAt=${encodeURIComponent(run.startedAt)}`,
    );
    // Quieter than the resume card, per the brief: no "SESSION IN PROGRESS"
    // banner, no Resume-session link.
    expect(screen.queryByText("SESSION IN PROGRESS")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Resume session" }),
    ).not.toBeInTheDocument();
  });

  // Just Row without the monitor (spec 2026-09-02, §Mechanism piece 5):
  // the SAME row, reading the SAME `SessionRun` record, sends a free row to
  // its own log door — `/session/log` reads the workout DRAFT a free row
  // never had. (Today's OTHER justrow branch, in `UnloggedMonitorRow`,
  // routes a `MonitorRun`; this one routes the phone-timer record.)
  it("a completed-but-unlogged free-row timer run's Log it goes to /justrow/log", async () => {
    const run = advance(
      {
        ...buildFreeRowRun(new Date("2026-09-02T21:40:00.000Z")),
        actuals: {
          0: { actualSource: "stopwatch-elapsed", elapsedSeconds: 754 },
        },
      },
      new Date("2026-09-02T21:52:34.000Z"),
    );
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    mockReady();
    await renderToday();

    expect(screen.getByText(/UNSAVED WORKOUT/)).toBeVisible();
    expect(screen.getByText("Just Row")).toBeVisible();
    const logLink = screen.getByRole("link", { name: /Review & save/ });
    expect(logLink).toHaveAttribute(
      "href",
      `/session/review?source=timer&startedAt=${encodeURIComponent(run.startedAt)}`,
    );
  });

  it("renders neither the resume card nor the unlogged line when there is no run record at all", async () => {
    mockReady();
    await renderToday();

    expect(screen.queryByText("SESSION IN PROGRESS")).not.toBeInTheDocument();
    expect(screen.queryByText(/UNSAVED WORKOUT/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Resume session" }),
    ).not.toBeInTheDocument();
  });
});

// Task 3 (ui-fix round): the unlogged line's own staged Discard —
// DESIGN.md's "Today's unlogged row" — a 44×44 accent-outlined ✕ that arms
// IN PLACE (border → accent, text → "Discard {title} without logging?", ✕
// → solid accent "Tap again to discard"), fires with no navigation, and must never
// disturb the suggestion card underneath.
function unloggedRunFor(startedAt: Date, completedAt: Date): SessionRun {
  const built = liveRunFor(startedAt);
  return {
    ...built,
    index: built.phases.length,
    completedAt: completedAt.toISOString(),
  };
}

describe("Today (Task 3: unlogged row's staged Discard)", () => {
  it("a timer row cannot discard a newer timer or newly queued draft", async () => {
    const run = unloggedRunFor(
      new Date("2026-09-04T11:00:00.000Z"),
      new Date("2026-09-04T11:30:00.000Z"),
    );
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    mockReady();
    await renderToday();
    const nextRun = { ...run, startedAt: "newer-key" };
    const nextDraft = buildDraft(WARM_FRONT);
    localStorage.setItem(RUN_KEY, JSON.stringify(nextRun));
    localStorage.setItem(DRAFT_KEY, JSON.stringify(nextDraft));
    await userEvent.click(
      screen.getByRole("button", { name: "Discard Timer workout Filling Low" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );
    expect(localStorage.getItem(RUN_KEY)).toBe(JSON.stringify(nextRun));
    expect(localStorage.getItem(DRAFT_KEY)).toBe(JSON.stringify(nextDraft));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("arms on the first ✕ press, swapping the row's contents in place, without touching the suggestion card underneath", async () => {
    const run = unloggedRunFor(
      new Date("2026-08-01T11:00:00.000Z"),
      new Date("2026-08-01T11:40:00.000Z"),
    );
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    mockReady();
    await renderToday();

    const cardBefore = document.querySelector(".today-card-title")?.innerHTML;
    expect(cardBefore).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Discard Timer workout Filling Low" }),
    );

    // The row's contents swap — title, ✕, and "Log it" are all replaced by
    // the armed copy, not merely joined by it.
    expect(document.querySelector(".unsaved-warning-copy")?.textContent).toBe(
      "Discard Filling Low without saving?",
    );
    expect(
      screen.getByRole("button", { name: "Tap again to discard" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Review & save/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Discard Timer workout Filling Low",
      }),
    ).not.toBeInTheDocument();

    // The suggestion card is byte-identical — arming the row re-rendered
    // only `UnloggedRow`'s own subtree, never `TodayView`.
    expect(document.querySelector(".today-card-title")?.innerHTML).toBe(
      cardBefore,
    );
  });

  // Fix round 1 (reviewer M1): arming swaps in a STRUCTURALLY DIFFERENT
  // element (a bare `<button>` replacing a `<div><Link/><button/></div>`) —
  // a real browser does NOT carry focus to the new node, so without
  // Today.tsx's own explicit re-focus (a `useEffect` keyed on
  // `discard.armed`), nothing is ever actually focused here, and a real
  // blur can never fire. The original version of this test used
  // `fireEvent.blur`, a synthetic dispatch that fires on its target
  // REGARDLESS of whether that target was ever the real `activeElement` —
  // it passed even with the re-focus fix reverted, proving nothing about
  // real user behavior. This version asserts `document.activeElement`
  // directly (load-bearing: this is what would have caught the bug), then
  // calls the real `.blur()` DOM method, which is a spec'd no-op unless its
  // target genuinely IS the focused element.
  it("disarms on blur — a REAL focus/blur round trip, not a synthetic event", async () => {
    const run = unloggedRunFor(
      new Date("2026-08-01T11:00:00.000Z"),
      new Date("2026-08-01T11:40:00.000Z"),
    );
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    mockReady();
    await renderToday();

    await userEvent.click(
      screen.getByRole("button", { name: "Discard Timer workout Filling Low" }),
    );
    const armed = screen.getByRole("button", { name: "Tap again to discard" });
    expect(document.activeElement).toBe(armed);

    act(() => armed.blur());

    expect(
      screen.getByRole("button", { name: "Discard Timer workout Filling Low" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(RUN_KEY)).not.toBeNull();
  });

  it("disarms automatically 4 seconds after arming with no second press", async () => {
    const run = unloggedRunFor(
      new Date("2026-08-01T11:00:00.000Z"),
      new Date("2026-08-01T11:40:00.000Z"),
    );
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    mockReady();
    await renderToday();
    vi.useFakeTimers();

    fireEvent.click(
      screen.getByRole("button", { name: "Discard Timer workout Filling Low" }),
    );
    expect(
      screen.getByRole("button", { name: "Tap again to discard" }),
    ).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(4000));

    expect(
      screen.getByRole("button", { name: "Discard Timer workout Filling Low" }),
    ).toBeInTheDocument();
  });

  it("firing the armed row clears the run/draft records with no fetch, removes the row in place with no navigation, and leaves the suggestion card exactly as it was", async () => {
    const run = unloggedRunFor(
      new Date("2026-08-01T11:00:00.000Z"),
      new Date("2026-08-01T11:40:00.000Z"),
    );
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    mockReady();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderToday();

    const cardBefore = document.querySelector(".today-card-title")?.innerHTML;
    const cardHrefBefore = document
      .querySelector(".today-card")
      ?.getAttribute("href");

    await userEvent.click(
      screen.getByRole("button", { name: "Discard Timer workout Filling Low" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to discard" }),
    );

    // Gone in place — no "unlogged session" line, no armed controls, and
    // still on Today (no navigation at all, unlike the post-workout
    // summary's own Discard, which leaves the screen).
    expect(screen.queryByText(/UNSAVED WORKOUT/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /discard/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();

    const { loadRun } = await import("../session/run");
    const { loadDraft } = await import("../session/draft");
    expect(loadRun()).toBeNull();
    expect(loadDraft()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    // The suggestion card underneath never re-shuffled.
    expect(document.querySelector(".today-card-title")?.innerHTML).toBe(
      cardBefore,
    );
    expect(document.querySelector(".today-card")?.getAttribute("href")).toBe(
      cardHrefBefore,
    );
  });
});

// F6 (2b), Task 4: Today's OTHER twin row — an interrupted connected
// session (`MonitorRun`, `completedAt === null`) the rower is closing
// through Today rather than through the monitor itself. Same staged-Discard
// shape as Task 3's `UnloggedRow` above, deliberately mirrored fixture for
// fixture (`unloggedRunFor`/`makeMonitorRun`), so a reviewer can read the
// two describe blocks side by side and see exactly where they diverge: the
// copy ("interrupted connected session." vs "unlogged session."), Log it's
// target (a stamp-then-navigate button, not a bare `<Link>`), the discard
// body (`clearMonitorRun()` only — the session/draft records are a
// DIFFERENT rower's-in-progress-phone-timer concern this row must never
// touch), and the null-`workoutId` latent (no Log it at all).
describe("Today (2b): the interrupted connected session row", () => {
  it("a refused interrupted close opens unavailable without claiming or changing the newer open revision", async () => {
    const run = makeMonitorRun({ completedAt: null });
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    mockReady();
    const { default: Today } = await import("./Today");
    const { default: ReviewSession } = await import("../session/ReviewSession");
    const store = await import("../monitor/handoffStore");
    const receipts: unknown[] = [];
    store.setReceiptChannel((receipt) => receipts.push(receipt));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <Routes>
          <Route path="/today" element={<Today />} />
          <Route path="/session/review" element={<ReviewSession />} />
        </Routes>
      </MemoryRouter>,
    );
    const newer = { ...run, title: "Still open, newer revision" };
    store.commit(run.startedAt, 0, newer);
    expect(store.read()?.revision).toBe(1);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Review & save PM5 workout Stationary Front",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Recording unavailable" }),
    ).toBeVisible();
    expect(store.read()?.run).toStrictEqual(newer);
    expect(
      receipts.filter((r) => (r as { kind: string }).kind === "claim"),
    ).toHaveLength(0);
    expect(
      fetchSpy.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });
  it.each([
    ["useWorkouts", "workouts", []],
    ["useBaselines", "baselines", BASELINES],
    ["usePlan", "plan", FREESTYLE_PLAN],
    ["usePreferences", "preferences", DEFAULT_PREFS],
    ["useRecentLogs", "logs", []],
  ] as const)(
    "keeps recovery mounted through %s loading, error, Retry and ready",
    async (hook, field, value) => {
      localStorage.setItem(
        MONITOR_RUN_KEY,
        JSON.stringify(
          makeMonitorRun({ completedAt: "2026-09-04T12:30:00.000Z" }),
        ),
      );
      let state: Record<string, unknown> = { state: "loading" };
      const retry = vi.fn(() => {
        state = { state: "ready", [field]: value };
      });
      vi.doMock("../api/useWorkouts", () => ({
        useWorkouts: () =>
          hook === "useWorkouts"
            ? state
            : { state: "ready", workouts: [WARM_FRONT] },
      }));
      vi.doMock("../api/useBaselines", () => ({
        useBaselines: () =>
          hook === "useBaselines"
            ? state
            : { state: "ready", baselines: BASELINES },
      }));
      vi.doMock("../api/usePlan", () => ({
        usePlan: () =>
          hook === "usePlan" ? state : { state: "ready", plan: FREESTYLE_PLAN },
      }));
      vi.doMock("../api/usePreferences", () => ({
        usePreferences: () =>
          hook === "usePreferences"
            ? state
            : { state: "ready", preferences: DEFAULT_PREFS },
      }));
      vi.doMock("../api/useRecentLogs", () => ({
        useRecentLogs: () =>
          hook === "useRecentLogs" ? state : { state: "ready", logs: [] },
      }));
      const { default: Today } = await import("./Today");
      const view = () => (
        <MemoryRouter>
          <Today />
        </MemoryRouter>
      );
      const result = render(view());
      expect(
        screen.getByRole("button", {
          name: "Review & save PM5 workout Stationary Front",
        }),
      ).toBeVisible();
      state = { state: "error", retry };
      result.rerender(view());
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      await userEvent.click(
        screen.getByRole("button", {
          name: "Discard PM5 workout Stationary Front",
        }),
      );
      result.rerender(view());
      expect(
        screen.getByRole("button", { name: "Tap again to discard" }),
      ).toBeVisible();
      expect(localStorage.getItem(MONITOR_RUN_KEY)).not.toBeNull();
      await userEvent.click(
        screen.getByRole("button", { name: "Tap again to discard" }),
      );
      expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
    },
  );
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the row for a dead MonitorRun, naming the workout and the evidence", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(makeMonitorRun({ completedAt: null })),
    );
    mockReady();
    await renderToday();

    const row = screen
      .getByText(/PM5 · .* · Not saved/)
      .closest(".unsaved-row");
    if (!row) throw new Error("row not found");
    const rowScope = within(row as HTMLElement);
    expect(rowScope.getByText("Stationary Front")).toBeVisible();
    expect(
      rowScope.getByRole("button", { name: /Review & save/ }),
    ).toBeVisible();
    expect(
      rowScope.getByRole("button", {
        name: "Discard PM5 workout Stationary Front",
      }),
    ).toBeVisible();
  });

  it("shows no row when there is no MonitorRun record at all", async () => {
    mockReady();
    await renderToday();
    expect(screen.queryByText(/PM5 · .* · Not saved/)).not.toBeInTheDocument();
  });

  it("reviews a completed programmed PM5 from Today without posting or opening manual entry", async () => {
    const built = buildRun(
      buildDraft(WARM_FRONT),
      BASELINES,
      new Date("2026-09-04T12:00:00.000Z"),
    );
    const program = compileProgram(built.phases);
    if ("code" in program) throw new Error(program.message);
    const run = makeMonitorRun({
      program,
      logSeed: buildLogSeed(built.phases, BASELINES),
      actuals: [
        {
          index: 0,
          elapsedSeconds: 120,
          distanceMeters: 450,
          avgSplit: 133.3,
          avgSpm: 24,
          avgHeartRateBpm: null,
          restDistanceMeters: 0,
        },
      ],
      completedAt: "2026-09-04T12:30:00.000Z",
    });
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    mockReady();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { default: Today } = await import("./Today");
    const { default: ReviewSession } = await import("../session/ReviewSession");
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <Routes>
          <Route path="/today" element={<Today />} />
          <Route path="/session/review" element={<ReviewSession />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Review & save PM5 workout Stationary Front",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(screen.getByText(/PM5 \(test\)/)).toBeVisible();
    expect(screen.queryByText("NO MONITOR READING")).not.toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(MONITOR_RUN_KEY)!)).toMatchObject({
      completedAt: "2026-09-04T12:30:00.000Z",
    });
  });
  it("Log it stamps the interrupted door and lands on the monitor log route", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(
        makeMonitorRun({ completedAt: null, workoutId: "w-warmfront" }),
      ),
    );
    mockReady();
    const { default: Today } = await import("./Today");
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <Routes>
          <Route path="/today" element={<Today />} />
          <Route path="/session/review" element={<LogRouteProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Today" });

    await userEvent.click(
      screen.getByRole("button", { name: /Review & save/ }),
    );

    expect(
      await screen.findByText(
        `LOG ROUTE PROBE id= search=?source=monitor&startedAt=${encodeURIComponent(JSON.parse(localStorage.getItem(MONITOR_RUN_KEY)!).startedAt)}`,
      ),
    ).toBeVisible();

    const { loadMonitorRun } = await import("../monitor/monitorRun");
    const stamped = loadMonitorRun();
    expect(stamped?.completedAt).not.toBeNull();
    expect(stamped?.endedBy).toBe("interrupted");
  });

  it("discard is staged: first tap arms in place, second tap clears ONLY the monitor record", async () => {
    // A completed-but-unlogged SessionRun AND a draft, both real fixtures —
    // the exact records `useStagedDiscard().fire()` would clear (wrongly,
    // for this row) if `handleDiscardClick` ever called it instead of
    // `clearMonitorRun()` directly. Both rows render at once (Task 3's
    // UnloggedRow beside this one), which is why every query below is
    // scoped with `within()` on the row under test.
    const sessionRun = unloggedRunFor(
      new Date("2026-08-01T11:00:00.000Z"),
      new Date("2026-08-01T11:40:00.000Z"),
    );
    localStorage.setItem(RUN_KEY, JSON.stringify(sessionRun));

    const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
    if (!w) throw new Error("missing library fixture: Filling Low");
    const draft = buildDraft({
      id: "w-fillinglow",
      title: w.title,
      type: w.type as WorkoutType,
      steps: w.steps,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));

    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(makeMonitorRun({ completedAt: null })),
    );

    // Realistic exported-log-shaped strings (the shape `useMonitorSession`'s
    // own teardown stash writes, `useMonitorSession.test.ts`'s own
    // fixtures) — not empty strings, so "the stash survives" means
    // something.
    const monitorLog = JSON.stringify([
      { seq: 1, kind: "write", detail: "0x0031 general status" },
      { seq: 2, kind: "record-actual", detail: "accepted index=0" },
    ]);
    const rowedLog = JSON.stringify([
      { seq: 1, kind: "write", detail: "0x0031 general status" },
    ]);
    sessionStorage.setItem("ergomatic:last-monitor-log", monitorLog);
    sessionStorage.setItem("ergomatic:last-rowed-log", rowedLog);

    mockReady();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderToday();

    const row = screen
      .getByText(/PM5 · .* · Not saved/)
      .closest(".unsaved-row");
    if (!row) throw new Error("row not found");
    const rowScope = within(row as HTMLElement);

    await userEvent.click(
      rowScope.getByRole("button", {
        name: "Discard PM5 workout Stationary Front",
      }),
    );
    await userEvent.click(
      rowScope.getByRole("button", { name: "Tap again to discard" }),
    );

    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
    // The wrong records — Discard clears the MONITOR record only.
    expect(localStorage.getItem(RUN_KEY)).not.toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    expect(sessionStorage.getItem("ergomatic:last-monitor-log")).toBe(
      monitorLog,
    );
    expect(sessionStorage.getItem("ergomatic:last-rowed-log")).toBe(rowedLog);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/PM5 · .* · Not saved/)).not.toBeInTheDocument();
    // No navigation: still on Today.
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
  });

  it("armed row moves focus to the confirm button and blur disarms (parity with UnloggedRow)", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(makeMonitorRun({ completedAt: null })),
    );
    mockReady();
    await renderToday();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Discard PM5 workout Stationary Front",
      }),
    );
    const armed = screen.getByRole("button", { name: "Tap again to discard" });
    expect(document.activeElement).toBe(armed);

    act(() => armed.blur());

    expect(
      screen.getByRole("button", {
        name: "Discard PM5 workout Stationary Front",
      }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).not.toBeNull();
  });

  it("auto-disarms after 4s (parity)", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(makeMonitorRun({ completedAt: null })),
    );
    mockReady();
    await renderToday();
    vi.useFakeTimers();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Discard PM5 workout Stationary Front",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Tap again to discard" }),
    ).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(4000));

    expect(
      screen.getByRole("button", {
        name: "Discard PM5 workout Stationary Front",
      }),
    ).toBeInTheDocument();
  });

  it("an anonymous programmed run still offers source-bound review", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(makeMonitorRun({ completedAt: null, workoutId: null })),
    );
    mockReady();
    await renderToday();

    expect(screen.getByText(/PM5 · .* · Not saved/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Review & save/ })).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Discard PM5 workout Stationary Front",
      }),
    ).toBeVisible();
  });
});

// Hand-off store design spec (rev 4), §5/§9.5, §10 row 9, plan Task 4: "the
// §5 product gain: a memory-only record renders a row" and its own flip
// side, "Today's memory-only row present before reload, absent + receipted
// after." Unlike every OTHER test in this file (which seeds a durable
// record via `localStorage.setItem(MONITOR_RUN_KEY, ...)` before a fresh
// `renderToday()` — indistinguishable, from the store's own perspective,
// from a genuinely durable record surviving a real reload), this test
// drives the store directly so the record is committed with its DURABLE
// WRITE DENIED — genuinely memory-only, the case the old `loadMonitorRun()`
// mount snapshot could never see at all (the escape-hatch gap #230's own
// gate filed).
describe("Today (§10 row 9): a memory-only unlogged row, present before reload and honestly gone after", () => {
  it("renders while the durable write stays denied, then a reload sees nothing — receipted at the ORIGINAL commit, not invented at hydration", async () => {
    mockReady();
    const { handoffStore, setReceiptChannel } =
      await import("../monitor/handoffStore");
    const receipts: unknown[] = [];
    setReceiptChannel((r) => receipts.push(r));

    const run = makeMonitorRun({
      completedAt: null,
      workoutId: "w-warmfront",
    });
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("simulated quota failure");
      });
    const result = handoffStore.commit(run.startedAt, null, run);
    setItemSpy.mockRestore();

    // Fixture sanity: memory accepted it, durable genuinely never landed.
    expect(result).toStrictEqual({
      accepted: true,
      revision: 0,
      verdict: "failed",
    });
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();

    // BEFORE reload, same process: the §5 product gain — a record durable
    // storage never saw still renders the row. Dynamically imported, same
    // reason every other render in this file is (this file's own
    // `beforeEach: vi.resetModules()` + per-test `await import("./Today")`
    // convention) — `Today`'s default export is never a static top-level
    // binding here.
    const { default: TodayBeforeReload } = await import("./Today");
    const before = render(
      <MemoryRouter>
        <TodayBeforeReload />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Today" });
    expect(screen.getByText(/PM5 · .* · Not saved/)).toBeVisible();
    // Unmount before the second render — RTL does not auto-clean between
    // two renders inside the SAME test, only between tests.
    before.unmount();

    // "RELOAD": a genuinely fresh module instance — `vi.resetModules()`
    // mid-test, matching this file's own `beforeEach` convention, plus a
    // fresh dynamic re-import (Today's own module-scope `hydrateHandoff()`
    // runs again, against whatever is ACTUALLY durable — nothing).
    vi.resetModules();
    mockReady();
    const { default: TodayReloaded } = await import("./Today");
    render(
      <MemoryRouter>
        <TodayReloaded />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Today" });
    expect(screen.queryByText(/PM5 · .* · Not saved/)).not.toBeInTheDocument();

    // §9.5, stated plainly (review correction): `receipts` was captured
    // via `setReceiptChannel` on the PRE-reload module instance, and this
    // assertion reads that same array — it is forensic evidence about the
    // ORIGINAL commit, not a check on the reload path itself, and it
    // CANNOT bite on a reload-mechanism regression (a fresh module after
    // `vi.resetModules()` has no receipt channel wired to this array at
    // all, so nothing the reloaded process does could ever appear here
    // either way). THE GATE for "the vanish is real" is the pair of DOM
    // assertions above: the row visible before reload
    // (`screen.getByText(/PM5 · .* · Not saved/)`,
    // pre-`unmount()`) and absent after
    // (`queryByText(...).not.toBeInTheDocument()`, post-reload) — that
    // pair is what a broken hydrate() or a broken reload would actually
    // flip (see the dedicated "Today renders without hydrate" mutation
    // probe, task-4-report.md). What THIS assertion adds on top: it
    // explains WHY the vanish is honest rather than a bug — the vanish is
    // not a NEW event hydration invents, it is explained by the ORIGINAL
    // commit's own receipt, already carrying `verdict:"failed"` (spec's
    // own words: "coordinate with what the store already emits, don't
    // duplicate" — no new receipt kind exists for this residual).
    const commitReceipt = receipts.find(
      (r) => (r as { kind?: string }).kind === "commit-accepted",
    );
    expect(commitReceipt).toMatchObject({
      sessionKey: run.startedAt,
      revision: 0,
      verdict: "failed",
    });
  });
});

describe("Today (the no-baseline card)", () => {
  // James's 2026-08-23 ruling took the START HERE teaching block off Today
  // entirely (News's pinned articles carry it alone now) — so a fresh
  // no-baseline account's Today LEADS with the doors card: nothing between
  // the screen's own <h1> and the card. This pin goes red if any teaching
  // block (or anything else) is ever restored above it.
  it("a fresh no-baseline account's Today leads with the doors card — first child after the h1", async () => {
    mockReady({ baselines: NO_BASELINES });
    await renderToday();

    expect(await screen.findByText("SET UP YOUR BASELINE")).toBeVisible();
    const main = screen
      .getByRole("heading", { name: "Today" })
      .closest("main")!;
    const children = [...main.children];
    // Phase JR PR 2: the heading now shares its row with the JUST ROW door,
    // so the first child is that row rather than the bare `h1`. What this
    // test claims is unchanged and still the point — the doors card is the
    // first CONTENT after the heading, ahead of everything else — so the
    // heading is asserted through the row rather than in place of it.
    expect(children[0]!.classList.contains("today-title-row")).toBe(true);
    expect(children[0]!.querySelector("h1")).not.toBeNull();
    expect(children[1]!.classList.contains("doorscard")).toBe(true);
  });

  it("both baselines missing: shows the three-door card and hides the ENTIRE plan/suggestion apparatus", async () => {
    mockReady({
      baselines: NO_BASELINES,
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND, TEST_6K, TEST_2K],
    });
    await renderToday();

    expect(await screen.findByText("SET UP YOUR BASELINE")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "How do you want to start?" }),
    ).toBeVisible();
    // The three doors, outcome-framed (James's ruling), each a Link into
    // its own flow — the card itself starts nothing.
    expect(
      screen.getByRole("link", { name: /Recommend my baseline/ }),
    ).toHaveAttribute("href", "/onboarding/recommend");
    expect(
      screen.getByRole("link", { name: /I know my baseline/ }),
    ).toHaveAttribute("href", "/onboarding/know");
    expect(
      screen.getByRole("link", { name: /Row to find my baseline/ }),
    ).toHaveAttribute("href", "/onboarding/row");

    // Plan apparatus, gone entirely — not merely the suggestion card.
    expect(screen.queryByText(/SESSION \d+ OF \d+/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "FILTER ⌄" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "SHUFFLE ↻" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Stationary Front" }),
    ).not.toBeInTheDocument();
  });

  it("Task 5 minor (fold): freestyle mode (no plan) with both baselines missing ALSO hides the freestyle line and its /plan link, not just the plan-mode apparatus", async () => {
    // The existing "hides the ENTIRE plan/suggestion apparatus" test above
    // exercises this file's DEFAULT plan fixture (an active plan) — it never
    // covered the OTHER branch `!needsDoors` gates (Today.tsx's own
    // freestyle variant, `.today-plan-line-freestyle`, "shows a freestyle
    // line with a link to /plan" per the describe block above). Both
    // branches share the identical `{!needsDoors && (...)}` guard, so
    // this pins that the freestyle side of it is ALSO gone, not merely
    // untested-but-coincidentally-fine.
    mockReady({
      plan: FREESTYLE_PLAN,
      baselines: NO_BASELINES,
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND, TEST_6K, TEST_2K],
    });
    await renderToday();

    expect(await screen.findByText("SET UP YOUR BASELINE")).toBeVisible();

    // The freestyle line and its own /plan link — gone entirely, same as
    // the plan-mode apparatus in the sibling test.
    expect(screen.queryByText(/FREESTYLE/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /choose a plan/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "FILTER ⌄" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "SHUFFLE ↻" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Sea Fret" }),
    ).not.toBeInTheDocument();
  });

  it("a partial pair (only the 2k missing) renders the SAME three-door card — the doors are the superset re-entry", async () => {
    // Phase BL PR C: the doors card shows whenever the PAIR is incomplete
    // (spec ruling — a superset of the old card's states), and all three
    // doors render; door 1's own recommendation screen is what protects
    // the existing number (M8, Recommend.test.tsx), not a hidden door.
    mockReady({
      baselines: ONLY_K6_BASELINE,
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND, TEST_6K, TEST_2K],
    });
    await renderToday();

    expect(await screen.findByText("SET UP YOUR BASELINE")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Recommend my baseline/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /I know my baseline/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Row to find my baseline/ }),
    ).toBeVisible();
  });

  it("both baselines set: normal Today returns — plan apparatus back, no doors card", async () => {
    mockReady({
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND, TEST_6K, TEST_2K],
    });
    await renderToday();

    expect(await screen.findByText("SESSION 12 OF 84 · AT")).toBeVisible();
    expect(screen.getByRole("button", { name: "FILTER ⌄" })).toBeVisible();
    expect(screen.queryByText("SET UP YOUR BASELINE")).not.toBeInTheDocument();
  });

  it("a veteran with real baselines is never SUGGESTED a designated onboarding workout, even shuffled through the whole pool", async () => {
    // Every non-onboarding fixture is O2/easy so the freestyle pool (no
    // plan) is exactly {ZEPHYR, TEST_6K, TEST_2K} before exclusion —
    // small enough to shuffle through completely and assert the designated
    // titles never come up, real seed types (O2/AN) included on purpose so
    // this can't pass by accident of type mismatch alone.
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [ZEPHYR, { ...TEST_6K, type: "O2" }, TEST_2K],
    });
    await renderToday();

    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
    const shuffle = screen.getByRole("button", { name: "SHUFFLE ↻" });
    // Only one real (non-onboarding) entry in the pool — SHUFFLE is
    // disabled, not merely "happens to keep landing on the same one."
    expect(shuffle).toBeDisabled();
    await fireEvent.click(shuffle);
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "6K Test" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "2K Test" }),
    ).not.toBeInTheDocument();
  });

  // Final-review fix: the exclusion must key off isGlobal, not title alone
  // — a rower's own custom "6K Test" is a real, ownable workout, not a
  // stray collision with the seeded pair.
  it('a CUSTOM workout named "6K Test" (title collision, isGlobal:false) stays suggestable — only the GLOBAL row is excluded', async () => {
    // Global TEST_6K forced to O2 (matching ZEPHYR/CUSTOM_TEST_6K's type)
    // so all three would share a pool before exclusion — the custom one's
    // survival can't be an accident of type mismatch, same discipline the
    // sibling test above uses. CUSTOM_TEST_6K keeps its never-done
    // (lastDoneDaysAgo: null) fixture value, ranking it ahead of ZEPHYR (30
    // days ago) as the INITIAL recommendation, not merely pool membership —
    // proving the exclusion didn't also swallow it.
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [
        ZEPHYR,
        { ...TEST_6K, type: "O2" },
        { ...CUSTOM_TEST_6K, type: "O2" },
      ],
    });
    await renderToday();

    expect(
      await screen.findByRole("heading", { name: "6K Test" }),
    ).toBeVisible();

    const shuffle = screen.getByRole("button", { name: "SHUFFLE ↻" });
    // Two real pool members (Zephyr + the custom "6K Test"), not one — the
    // global "6K Test" is excluded, the custom one isn't.
    expect(shuffle).not.toBeDisabled();
    await fireEvent.click(shuffle);
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
  });
});

// Task 2 (2026-08-10 workout-step-detail spec §2): the piece region between
// `.today-card-meta` and the reason foot. Every fixture below is a REAL
// `LIBRARY_WORKOUTS` entry (repo convention — a hand-built minimum hid a
// shipped defect before) picked via `libraryEntry` + a single-item
// `workouts` array under FREESTYLE_PLAN, which makes it the deterministic
// pick without needing filter narrowing (suggest()'s own "one candidate,
// one pick" behavior). Expected strings/numbers were read once from
// `pieceList`/`peakIndex`/`workAndTotal` run against the exact `BASELINES`
// fixture (k2Seconds:112, k6Seconds:122) this file's `mockReady` defaults
// to, not re-derived by hand.
// Golden Hour (O2, medium): a real reps-pyramid whose block boundary rolls
// (see the "Golden Hour" test below) — kept as its own steps reference
// (rather than only a `libraryEntry(...)`) so the arithmetic test can also
// run the real `phases()` function against it independently of
// `pieceList`, per the piece-rollup contract's item 3 ("assert they agree
// in a test rather than picking one silently").
const GOLDEN_HOUR_WORKOUT = LIBRARY_WORKOUTS.find(
  (w) => w.title === "Golden Hour",
);
if (!GOLDEN_HOUR_WORKOUT)
  throw new Error("missing library fixture: Golden Hour");

describe("Today (piece region)", () => {
  it("renders two-line rows with full refs and no PIECES count in the foot for a real 2-piece workout, with foot arithmetic from workAndTotal (Sun Pillar)", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Sun Pillar", "w-sunpillar", null)],
    });
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Sun Pillar" }),
    ).toBeVisible();

    const rows = document.querySelectorAll(".today-piece-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".today-piece-numeral")?.textContent).toBe(
      "01",
    );
    expect(rows[0].querySelector(".today-piece-text")?.textContent).toContain(
      "18:00",
    );
    expect(rows[0].querySelector(".today-piece-ref")?.textContent).toBe(
      "at 6k +10,",
    );
    expect(rows[0].querySelector(".today-piece-rest")?.textContent).toBe(
      "3′ r",
    );
    expect(rows[0].querySelector(".today-piece-split")?.textContent).toBe(
      "2:12.0",
    );
    expect(rows[0].querySelector(".today-piece-spm-line")?.textContent).toBe(
      "22 SPM",
    );

    // Last piece: no rest in the data (Sun Pillar's second step authors
    // none) — the comma-joined "ref, rest" form must not appear either.
    expect(rows[1].querySelector(".today-piece-ref")?.textContent).toBe(
      "at 6k +6",
    );
    expect(rows[1].querySelector(".today-piece-rest")).toBeNull();
    expect(rows[1].querySelector(".today-piece-split")?.textContent).toBe(
      "2:08.0",
    );

    expect(document.querySelector(".today-piece-more")).toBeNull();
    expect(document.querySelector(".today-piece-foot-work")?.textContent).toBe(
      "27′ WORK",
    );
    expect(document.querySelector(".today-piece-foot-total")?.textContent).toBe(
      "30′ TOTAL",
    );
    expect(document.querySelector(".today-piece-foot-count")).toBeNull();
  });

  it("rolls two identical consecutive pieces into ONE row with an 'N × ' duration prefix and the run's shared rest (Sea Fret — piece-rollup spec rule 1; was 'shows the trailing rest on the LAST piece... the approved deviation' before rolling collapsed its 2 identical pieces to 1 row)", async () => {
    mockReady({ plan: FREESTYLE_PLAN, workouts: [ZEPHYR] });
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Sea Fret" }),
    ).toBeVisible();
    // Sea Fret's own two pieces (4' at 6k+12, spm 22, 1' rest each) are
    // fully identical including rest — rule 1 rolls them into one row
    // (count 2) rather than the two separate rows this test asserted
    // before Task 2's rollup renderer landed.
    const rows = document.querySelectorAll(".today-piece-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".today-piece-text")?.textContent).toContain(
      "2 × 4:00",
    );
    expect(rows[0].querySelector(".today-piece-ref")?.textContent).toBe(
      "at 6k +12,",
    );
    expect(rows[0].querySelector(".today-piece-rest")?.textContent).toBe(
      "1′ r",
    );
    expect(rows[0].querySelector(".today-piece-split")?.textContent).toBe(
      "2:14.0",
    );
    expect(rows[0].querySelector(".today-piece-spm-line")?.textContent).toBe(
      "22 SPM",
    );
    // workAndTotal doesn't call pieceList — foot arithmetic is unaffected
    // by rolling, same numbers as before.
    expect(document.querySelector(".today-piece-foot-work")?.textContent).toBe(
      "8′ WORK",
    );
    expect(document.querySelector(".today-piece-foot-total")?.textContent).toBe(
      "10′ TOTAL",
    );
    // Only 1 row, well under PIECE_CAP — no more-row, no foot count.
    expect(document.querySelector(".today-piece-more")).toBeNull();
    expect(document.querySelector(".today-piece-foot-count")).toBeNull();
  });

  it("renders distance pieces with metres in the duration text and a split target; a piece the data never authors a rest for shows none (Sun Dog)", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Sun Dog", "w-sundog", null)],
    });
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Sun Dog" }),
    ).toBeVisible();
    const rows = document.querySelectorAll(".today-piece-row");
    expect(rows[0].querySelector(".today-piece-text")?.textContent).toContain(
      "2100m",
    );
    expect(rows[0].querySelector(".today-piece-split")?.textContent).toBe(
      "2:10.0",
    );
    expect(rows[0].querySelector(".today-piece-rest")?.textContent).toBe(
      "2′ r",
    );
    expect(rows[1].querySelector(".today-piece-rest")).toBeNull();
  });

  it("rolls four identical all-MAX effort pieces into ONE row, still shows ALL OUT in the pace slot, and renders zero tint since no row carries an offset (Ground Strike; was 4 separate rows before rolling)", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Ground Strike", "w-groundstrike", null)],
    });
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Ground Strike" }),
    ).toBeVisible();
    // Ground Strike's 4 pieces (1.5' ALL OUT, spm 30, 3:30 rest each) are
    // fully identical — rule 1 rolls them into one row (count 4).
    const rows = document.querySelectorAll(".today-piece-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".today-piece-text")?.textContent).toContain(
      "4 × 1:30",
    );
    expect(rows[0].querySelector(".today-piece-split")?.textContent).toBe(
      "ALL OUT",
    );
    expect(rows[0].querySelector(".today-piece-ref")).toBeNull();
    expect(rows[0].querySelector(".today-piece-rest")?.textContent).toBe(
      "3:30 r",
    );
    expect(rows[0].querySelector(".today-piece-spm-line")?.textContent).toBe(
      "30 SPM",
    );
    // Effort rows carry no offset at all — zero tint, same as before rolling.
    expect(document.querySelector(".today-piece-peak")).toBeNull();
    expect(document.querySelector(".today-piece-more")).toBeNull();
    expect(document.querySelector(".today-piece-foot-count")).toBeNull();
  });

  it("compresses to one-line rows at 5+ pieces, caps at 4 with a non-interactive +N-more row naming the first three unseen durations, and adds the PIECES count to the foot (Outflow Boundary, 7 real pieces)", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Outflow Boundary", "w-outflow", null)],
    });
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Outflow Boundary" }),
    ).toBeVisible();

    expect(document.querySelectorAll(".today-piece-row")).toHaveLength(0);
    const rows = document.querySelectorAll(".today-piece-row-compact");
    expect(rows).toHaveLength(4);
    // A comma joins ref+rest when both are present (same convention as the
    // two-line rows above) — row 1 carries a "2′ r" rest too. The base is
    // named here even though the compressed layout is in force and every
    // split piece in this set shares 2k: James's 2026-08-14 ruling ("we
    // always need full form so people know what the exercise is"). This
    // row used to read "at −4," and nothing else on the card said 2k.
    expect(rows[0].querySelector(".today-piece-ref")?.textContent).toBe(
      "at 2k −4,",
    );
    expect(rows[0].querySelector(".today-piece-spm")?.textContent).toBe("32");
    expect(rows[0].querySelector(".today-piece-split")?.textContent).toBe(
      "1:48.0",
    );

    const more = document.querySelector(".today-piece-more");
    expect(more).not.toBeNull();
    expect(more?.querySelector(".today-piece-more-title")?.textContent).toBe(
      "3 more pieces",
    );
    expect(more?.querySelector(".today-piece-more-sub")?.textContent).toBe(
      "1:00 · 0:45 · 0:30",
    );
    // Visual only — no nested interactive element inside the card's own Link.
    expect(more?.querySelector("a, button, [role=button]")).toBeNull();

    expect(document.querySelector(".today-piece-foot-work")?.textContent).toBe(
      "6′ WORK",
    );
    expect(document.querySelector(".today-piece-foot-total")?.textContent).toBe(
      "23′ TOTAL",
    );
    expect(document.querySelector(".today-piece-foot-count")?.textContent).toBe(
      "· 7 PIECES",
    );

    // peak: |off| ties at 3 between rows index2/index3; the tie resolves to
    // the LATER row — index3, the 4th visible row — and it alone tints.
    const tinted = document.querySelectorAll(".today-piece-peak");
    expect(tinted).toHaveLength(1);
    expect(tinted[0]).toBe(rows[3]);
  });

  it("names the base on EVERY compressed row of a single-base set (Ground Fog, the reported case — 5 real 6k pieces; the whole card said '6k' nowhere before)", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Ground Fog", "w-groundfog", null)],
    });
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Ground Fog" }),
    ).toBeVisible();

    // 5 rows -> compressed layout, capped at 4 visible. Every visible row
    // shares the 6k base, which is exactly the condition the retired
    // `sharedBase` hoist used to strip.
    const rows = document.querySelectorAll(".today-piece-row-compact");
    expect(rows).toHaveLength(4);
    expect(
      [...rows].map((r) => r.querySelector(".today-piece-ref")?.textContent),
    ).toStrictEqual(["at 6k +12,", "at 6k +11,", "at 6k +10,", "at 6k +11,"]);
  });

  it("rolls all 8 identical pieces into ONE row with an 'N × ' duration prefix, leaving no more-row at all (Rime Ice; was 8 rows compressed behind a +4-more cutoff before rolling)", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Rime Ice", "w-rimeice", null)],
    });
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Rime Ice" }),
    ).toBeVisible();
    // Rime Ice's 8 pieces (3' at 6k+10, spm 22, 1' rest each) are fully
    // identical — rule 1 rolls them into one row (count 8), which drops
    // the row count from 8 (5+, compressed, capped, +more) to 1 (two-line,
    // uncapped, no more-row) — the exact behavior contract item 1/5
    // describes for a fully-uniform real set.
    const rows = document.querySelectorAll(".today-piece-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".today-piece-text")?.textContent).toContain(
      "8 × 3:00",
    );
    expect(rows[0].querySelector(".today-piece-ref")?.textContent).toBe(
      "at 6k +10,",
    );
    expect(rows[0].querySelector(".today-piece-rest")?.textContent).toBe(
      "1′ r",
    );
    expect(rows[0].querySelector(".today-piece-split")?.textContent).toBe(
      "2:12.0",
    );
    expect(document.querySelector(".today-piece-more")).toBeNull();
    expect(document.querySelector(".today-piece-foot-count")).toBeNull();
    expect(document.querySelector(".today-piece-foot-work")?.textContent).toBe(
      "24′ WORK",
    );
    expect(document.querySelector(".today-piece-foot-total")?.textContent).toBe(
      "32′ TOTAL",
    );
  });

  it("renders exactly one piece row for Ostro's real 9×1000m shape, with the split and 26 SPM, no more-row, no PIECES suffix (piece-rollup contract item 4 — the trigger fixture)", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Ostro", "w-ostro", null)],
    });
    await renderToday();
    expect(await screen.findByRole("heading", { name: "Ostro" })).toBeVisible();
    // Ostro's real seed data (server/seed/library/at.ts): {k:"reps",count:9}
    // over a SINGLE 1000m@6k+2/spm26/1' step — expand.ts's phases() emits
    // the same 1' rest after every repetition including the 9th (Task 1's
    // own verified finding: the real ninth piece is NOT restless), so all
    // 9 pieces are fully identical and roll via rule 1 into ONE row.
    const rows = document.querySelectorAll(".today-piece-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".today-piece-text")?.textContent).toContain(
      "9 × 1000m",
    );
    // Every row names its base, in either layout — there is only one ref
    // form now (`refTextFull`), James's 2026-08-14 ruling having retired
    // the offset-only compact one.
    expect(rows[0].querySelector(".today-piece-ref")?.textContent).toBe(
      "at 6k +2,",
    );
    expect(rows[0].querySelector(".today-piece-rest")?.textContent).toBe(
      "1′ r",
    );
    expect(rows[0].querySelector(".today-piece-split")?.textContent).toBe(
      "2:04.0",
    );
    expect(rows[0].querySelector(".today-piece-spm-line")?.textContent).toBe(
      "26 SPM",
    );
    expect(document.querySelector(".today-piece-more")).toBeNull();
    expect(document.querySelector(".today-piece-foot-count")).toBeNull();
    expect(document.querySelector(".today-piece-foot-work")?.textContent).toBe(
      "37′ WORK",
    );
    expect(document.querySelector(".today-piece-foot-total")?.textContent).toBe(
      "46′ TOTAL",
    );
  });

  it("counts remaining PIECES (not rows) in the +more title, renders an 'N × ' token for a rolled hidden row in the sub-line, and names total pieces (sum of every row's count) in the foot suffix — asserted equal to an independent phases-derived count (Golden Hour: a 5-piece pyramid block repeated twice, whose two touching middle pieces roll into one)", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Golden Hour", "w-goldenhour", null)],
    });
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Golden Hour" }),
    ).toBeVisible();

    // Golden Hour authors {reps:2} over a 2-3-4-3-2' pyramid at 6k+8 — the
    // block's own last piece (2') and the repeat's own first piece (2')
    // are adjacent and fully identical (same duration/ref/spm/rest), so
    // rule 1 rolls THOSE TWO into one row: 10 raw pieces -> 9 rows, with
    // exactly one row carrying count 2 (row index 4, the boundary).
    // 9 rows >= 5 -> compressed one-line rows, capped at 4 visible.
    expect(document.querySelectorAll(".today-piece-row")).toHaveLength(0);
    const rows = document.querySelectorAll(".today-piece-row-compact");
    expect(rows).toHaveLength(4);
    expect(rows[0].querySelector(".today-piece-text")?.textContent).toContain(
      "2:00",
    );

    const more = document.querySelector(".today-piece-more");
    expect(more).not.toBeNull();
    // Item 2: hidden ROWS are 5 (rows 5-9), but hidden PIECES are 6 (the
    // rolled row among them stands for 2, not 1: 2+1+1+1+1 = 6) — the
    // title must say 6, not 5.
    expect(more?.querySelector(".today-piece-more-title")?.textContent).toBe(
      "6 more pieces",
    );
    // Item 2's sub-line: first three unseen ROW tokens, rolled rows use
    // the "N × " form ("2 × 2:00"), singles are bare ("3:00"/"4:00"), then
    // an ellipsis (5 hidden rows > 3).
    expect(more?.querySelector(".today-piece-more-sub")?.textContent).toBe(
      "2 × 2:00 · 3:00 · 4:00 …",
    );

    // Item 3: the foot's "· N PIECES" suffix names TOTAL pieces (sum of
    // every row's count), asserted equal to an INDEPENDENT phases-derived
    // count — the number of real work phases `phases()` itself emits —
    // rather than picked from either side silently.
    const rawPieceCount = phases(GOLDEN_HOUR_WORKOUT.steps, BASELINES).filter(
      (p) => p.type === "work",
    ).length;
    const rowPieceSum = 4 + 6; // 4 visible (all count 1) + 6 hidden pieces
    expect(rawPieceCount).toBe(rowPieceSum);
    expect(document.querySelector(".today-piece-foot-count")?.textContent).toBe(
      `· ${rawPieceCount} PIECES`,
    );
    expect(document.querySelector(".today-piece-foot-work")?.textContent).toBe(
      "28′ WORK",
    );
    expect(document.querySelector(".today-piece-foot-total")?.textContent).toBe(
      "48′ TOTAL",
    );
  });

  it("renders no tint at all when the true peak sits behind the cap (Rossby Wave: every piece shares the same offset, so the whole-set tie resolves past row 4)", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Rossby Wave", "w-rossby", null)],
    });
    await renderToday();
    expect(
      await screen.findByRole("heading", { name: "Rossby Wave" }),
    ).toBeVisible();
    expect(document.querySelector(".today-piece-peak")).toBeNull();
  });

  it("replaces the reason line with a foot strip carrying the full reason text plus a no-shrink OPEN chip, and the card stays a single link", async () => {
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [libraryEntry("Sun Pillar", "w-sunpillar", null)],
    });
    await renderToday();
    const heading = await screen.findByRole("heading", {
      name: "Sun Pillar",
    });
    expect(heading).toBeVisible();
    expect(screen.getByText("OPEN ›")).toBeVisible();
    // The card element itself IS the one link (an `<a>` via react-router's
    // Link) — `within` queries only its DESCENDANTS, so zero here is what
    // "no nested anchor, nothing nests" actually asserts, not "exactly
    // one" (that count would look for a second link inside the first).
    const card = document.querySelector(".today-card") as HTMLElement;
    expect(card.tagName).toBe("A");
    expect(within(card).queryAllByRole("link")).toHaveLength(0);
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("elapsedSinceStart", () => {
  it("computes whole seconds since startedAt, rounded (not floored)", () => {
    const run = {
      startedAt: new Date("2026-08-01T12:00:00.000Z").toISOString(),
    } as SessionRun;
    // 45.6s: Math.round -> 46, Math.floor -> 45 — a value chosen so the two
    // disagree, pinning which one this function actually uses.
    expect(elapsedSinceStart(run, new Date("2026-08-01T12:00:45.600Z"))).toBe(
      46,
    );
  });

  it("floors at 0 rather than going negative when now precedes startedAt", () => {
    const run = {
      startedAt: new Date("2026-08-01T12:00:00.000Z").toISOString(),
    } as SessionRun;
    expect(elapsedSinceStart(run, new Date("2026-08-01T11:59:00.000Z"))).toBe(
      0,
    );
  });
});

/**
 * PHASE JR PR 2 — the free row's door on Today.
 *
 * Gate 0 (James, 2026-09-01): "a button in the top right that only says
 * Just Row". Two words, and no sub-line to explain itself — the door it
 * opens does that.
 */
describe("Today (the Just Row door)", () => {
  it("offers JUST ROW to a rower with a plan", async () => {
    mockReady({});
    await renderToday();

    const door = await screen.findByRole("link", { name: "JUST ROW" });
    expect(door).toHaveAttribute("href", "/justrow");
  });

  /**
   * RULING 4: visible with or without a baseline. This is the case that
   * matters and the one an all-fixtures-have-a-plan suite cannot see — a
   * rower who has not set a baseline up yet is exactly the rower most
   * likely to want to just pull, and Today hides its whole plan apparatus
   * for them. The door is deliberately outside that guard.
   */
  it("offers JUST ROW to a rower with no baseline at all, where the doors card shows", async () => {
    mockReady({ baselines: NO_BASELINES });
    await renderToday();

    expect(await screen.findByText("SET UP YOUR BASELINE")).toBeVisible();
    const door = screen.getByRole("link", { name: "JUST ROW" });
    expect(door).toHaveAttribute("href", "/justrow");
  });

  it("says only those two words", async () => {
    mockReady({});
    await renderToday();

    const door = await screen.findByRole("link", { name: "JUST ROW" });
    expect(door.textContent).toBe("JUST ROW");
  });
});

/**
 * PHASE JR PR 2, TASK 7 — the free row's recovery, BOTH gates (exit
 * criterion 4, and the PM's own no-split condition: shipping the surface
 * without this deliberately ships the defect ruling 9's correction found).
 *
 * The two gates as they stood: the row itself rendered only while
 * `completedAt === null`, so a free row CLOSED by a link drop rendered
 * nothing at all; and "Log it" rendered only for `workoutId !== null`, so
 * an OPEN free row was discard-only — the only reachable action destroyed
 * the record.
 */
describe("Today (JR): the free row's recovery row", () => {
  function freeRow(overrides: Partial<MonitorRun>): MonitorRun {
    return makeMonitorRun({
      workoutId: null,
      title: "Just Row",
      mode: "justrow",
      logSeed: { steps: [], paces: {} },
      summaryTotals: { workElapsedSeconds: 620, workDistanceMeters: 2480 },
      ...overrides,
    });
  }

  it("an OPEN free row offers Log it, routing to the free-row log door", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(freeRow({ completedAt: null })),
    );
    mockReady();
    const { default: Today } = await import("./Today");
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <Routes>
          <Route path="/today" element={<Today />} />
          <Route path="/session/review" element={<p>JUSTROW LOG DOOR</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Review & save/ }),
    );
    expect(await screen.findByText("JUSTROW LOG DOOR")).toBeInTheDocument();
    // Exit criterion 5's third member, asserted on the FREE row rather
    // than on its programmed twin above: Log it on an open free row
    // stamps `interrupted` — the documented "closed later with no
    // evidence" value — before it routes.
    const { loadMonitorRun } = await import("../monitor/monitorRun");
    const stamped = loadMonitorRun();
    expect(stamped?.completedAt).not.toBeNull();
    expect(stamped?.endedBy).toBe("interrupted");
  });

  it("a CLOSED free row still renders the row — the link-drop close must not go invisible", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(
        freeRow({
          completedAt: new Date().toISOString(),
          endedBy: "interrupted",
        }),
      ),
    );
    mockReady();
    await renderToday();

    expect(
      await screen.findByRole("button", { name: /Review & save/ }),
    ).toBeVisible();
  });

  it("carries the numbers and no word implying the row can be resumed", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(freeRow({ completedAt: null })),
    );
    mockReady();
    await renderToday();

    // The board's copy, verbatim: the numbers ON the row, so "Log it"
    // visibly means "keep these". 620 s → 10:20; 2,480 m.
    expect(await screen.findByText(/10:20 · 2,480 m/)).toBeInTheDocument();
    // The monitor stops advertising while a Just Row is open, so nothing
    // here may suggest reconnection (capture finding N1).
    expect(screen.queryByText(/resume/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reconnect/i)).not.toBeInTheDocument();
  });

  it("a completed programmed record also retains its review action", async () => {
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify(makeMonitorRun({ completedAt: new Date().toISOString() })),
    );
    mockReady();
    await renderToday();

    expect(screen.queryByText(/PM5 · .* · Not saved/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Review & save/ })).toBeVisible();
  });
});

// Phase SF PR1 (spec §2.7): the random draws, the sticky clear, the per-type
// memory, and SHUFFLE without repeats. Every draw is scripted through the
// mocked `./rng` (see `rngQueue` at the top of this file), so each branch
// is reached deterministically; randomness itself is the domain's business
// (domain/suggest.test.ts) and the e2e two-run check.
describe("Today (Phase SF PR1: draws, sticky clear, per-type memory, no-repeat SHUFFLE)", () => {
  // Two never-done AT entries: a genuine tie class of size two, so the
  // first draw has a choice to make. TAILWIND (15 days) is the third pool
  // member and never in the tie.
  const ND_ONE = libraryEntry("Occluded Front", "w-nd1", null);
  const ND_TWO = libraryEntry("Pressure Ridge", "w-nd2", null);

  function storedPick(): TodayPick {
    return JSON.parse(localStorage.getItem(TODAY_PICK_KEY)!) as TodayPick;
  }
  function storedStore(): TodayFilters {
    return JSON.parse(localStorage.getItem(TODAY_FILTERS_KEY)!) as TodayFilters;
  }

  it("draws the day's first card at random WITHIN the tie class, writes it, and a remount (the seam test: starting upstream of the producer) shows the same card with the honest reason", async () => {
    rngQueue.push(1); // second tie member
    mockReady({ workouts: [ND_ONE, ND_TWO, TAILWIND] });
    const first = await renderToday();
    expect(
      screen.getByRole("heading", { name: "Pressure Ridge" }),
    ).toBeVisible();
    expect(screen.getByText("Least recently done (never done).")).toBeVisible();
    expect(screen.queryByText(/YOUR PICK/)).not.toBeInTheDocument();
    expect(storedPick()).toMatchObject({
      workoutId: "w-nd2",
      shownIds: ["w-nd2"],
      shuffled: false,
    });

    first.unmount();
    // An empty queue draws 0 — which would pick Occluded Front if the
    // remount drew again. It must read the record instead.
    await renderToday();
    expect(
      screen.getByRole("heading", { name: "Pressure Ridge" }),
    ).toBeVisible();
  });

  it("keeps the first card stable under storage denial: a failed write goes to the session fallback, so a remount does not redraw", async () => {
    rngQueue.push(1);
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    try {
      mockReady({ workouts: [ND_ONE, ND_TWO, TAILWIND] });
      const first = await renderToday();
      expect(
        screen.getByRole("heading", { name: "Pressure Ridge" }),
      ).toBeVisible();
      expect(localStorage.getItem(TODAY_PICK_KEY)).toBeNull();
      first.unmount();
      await renderToday();
      expect(
        screen.getByRole("heading", { name: "Pressure Ridge" }),
      ).toBeVisible();
    } finally {
      setItem.mockRestore();
    }
  });

  it("SHUFFLE draws from the unshown pool minus the card on screen, says YOUR PICK, and resets the shown list once the pool is exhausted", async () => {
    // Pool (least-recently-done first): Stationary Front 20d, Pressure
    // Ridge 15d, Occluded Front 10d. Single-member tie, so the first card
    // is Stationary Front with no draw consumed.
    mockReady();
    await renderToday();
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(storedPick()).toMatchObject({
      workoutId: "w-warmfront",
      shownIds: ["w-warmfront"],
      shuffled: false,
    });

    rngQueue.push(1); // candidates [Pressure Ridge, Occluded Front] -> Occluded
    await userEvent.click(screen.getByRole("button", { name: /shuffle/i }));
    expect(
      screen.getByRole("heading", { name: "Occluded Front" }),
    ).toBeVisible();
    expect(screen.getByText(/YOUR PICK/)).toBeVisible();
    expect(storedPick()).toMatchObject({
      workoutId: "w-isobar",
      shownIds: ["w-warmfront", "w-isobar"],
      shuffled: true,
    });

    rngQueue.push(5); // only Pressure Ridge is unshown; no choice, rng unconsumed
    await userEvent.click(screen.getByRole("button", { name: /shuffle/i }));
    expect(
      screen.getByRole("heading", { name: "Pressure Ridge" }),
    ).toBeVisible();
    expect(storedPick().shownIds).toStrictEqual([
      "w-warmfront",
      "w-isobar",
      "w-tailwind",
    ]);
    expect(rngQueue).toStrictEqual([5]);
    rngQueue.length = 0;

    // Exhausted: the shown list resets and the draw is from the pool minus
    // the card on screen — [Stationary Front, Occluded Front]; 1 -> Occluded.
    rngQueue.push(1);
    await userEvent.click(screen.getByRole("button", { name: /shuffle/i }));
    expect(
      screen.getByRole("heading", { name: "Occluded Front" }),
    ).toBeVisible();
    expect(storedPick().shownIds).toStrictEqual(["w-isobar"]);
  });

  it("freestyle rolls a type on the day's first mount among types with a non-empty pool, lights it, and a remount keeps it", async () => {
    // Fixture pools: O2 (Sea Fret), AT (three). TR/AN empty, never
    // candidates. Draw 1 of [O2, AT] -> AT.
    rngQueue.push(1);
    mockReady({ plan: FREESTYLE_PLAN });
    const first = await renderToday();
    expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("COMFORTABLY HARD")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(
      (JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides)
        .swapType,
    ).toBe("AT");

    first.unmount();
    await renderToday(); // queue empty: a re-roll would light O2
    expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not roll with a plan active (the plan's call is the type)", async () => {
    rngQueue.push(1);
    mockReady();
    await renderToday();
    // No roll, so no day record is written at all, and the draw is never
    // consumed (the plan's AT pool has a single-member tie, so the first
    // pick has no choice to make either).
    expect(localStorage.getItem(TODAY_OVERRIDES_KEY)).toBeNull();
    expect(storedPick()).toMatchObject({ workoutId: "w-warmfront" });
    expect(rngQueue).toStrictEqual([1]);
  });

  it("neither rolls nor draws while the doors card shows (no baselines: no chip row, no card)", async () => {
    rngQueue.push(1);
    mockReady({ plan: FREESTYLE_PLAN, baselines: NO_BASELINES });
    await renderToday();
    expect(localStorage.getItem(TODAY_OVERRIDES_KEY)).toBeNull();
    expect(localStorage.getItem(TODAY_PICK_KEY)).toBeNull();
    expect(rngQueue).toStrictEqual([1]);
  });

  it("tapping the lit freestyle chip clears to ANY TYPE and the clear is STICKY across a remount; tapping a chip lifts it", async () => {
    rngQueue.push(1);
    mockReady({ plan: FREESTYLE_PLAN });
    const first = await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "AT" }));
    expect(screen.getByText("ANY TYPE")).toBeInTheDocument();
    expect(storedStore().rollSuppressed).toBe(true);
    // I-1 (stable day): the card drawn under AT is still a member of the
    // whole-library pool, so clearing the type keeps it on screen rather
    // than jumping to the pool head — the type changed, the day did not.
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();

    first.unmount();
    localStorage.removeItem(TODAY_OVERRIDES_KEY); // "tomorrow": the day record is gone
    rngQueue.push(1);
    await renderToday();
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      expect(screen.getByRole("button", { name: type })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    expect(rngQueue).toStrictEqual([1]);
    rngQueue.length = 0;

    await userEvent.click(screen.getByRole("button", { name: "TR" }));
    expect(storedStore().rollSuppressed).toBe(false);
  });

  it("remembers filters PER TYPE: a deviation applied under AT is absent under O2 and back again under AT, and the store holds one set per key", async () => {
    mockReady({ workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND] });
    await renderToday();
    await openFilterSheet();
    await userEvent.click(screen.getByRole("button", { name: "EASY" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply Filter" }));
    expect(screen.getByText("MEDIUM–HARD")).toBeVisible();
    expect(storedFilters("AT")?.difficulties).toStrictEqual(["medium", "hard"]);
    expect(storedFilters("O2")).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: "O2" }));
    expect(screen.queryByText("MEDIUM–HARD")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sea Fret" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "AT" }));
    expect(screen.getByText("MEDIUM–HARD")).toBeVisible();
    expect(storedFilters("O2")).toBeUndefined();
  });

  it("a newer draw that FAILED to persist beats an older stored one on remount (review F1: partial storage denial mid-session)", async () => {
    mockReady();
    const first = await renderToday();
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    rngQueue.push(1); // -> Occluded Front, written fine
    await userEvent.click(screen.getByRole("button", { name: /shuffle/i }));
    expect(
      screen.getByRole("heading", { name: "Occluded Front" }),
    ).toBeVisible();
    expect(storedPick().workoutId).toBe("w-isobar");

    // Storage fills up: the next SHUFFLE's write fails, the fallback holds
    // it. A remount must show THAT card, not the stale stored one, and
    // must carry its shown list (or the next draw could repeat).
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    try {
      rngQueue.push(0); // only Pressure Ridge is unshown
      await userEvent.click(screen.getByRole("button", { name: /shuffle/i }));
      expect(
        screen.getByRole("heading", { name: "Pressure Ridge" }),
      ).toBeVisible();
      expect(storedPick().workoutId).toBe("w-isobar"); // storage is stale
      first.unmount();
      await renderToday();
      expect(
        screen.getByRole("heading", { name: "Pressure Ridge" }),
      ).toBeVisible();
    } finally {
      setItem.mockRestore();
    }
    // Storage healthy again: the next write lands AND clears the fallback,
    // so a later remount reads storage, not a stale fallback.
    rngQueue.push(0); // exhausted -> reset -> [Stationary, Occluded] -> Stationary
    await userEvent.click(screen.getByRole("button", { name: /shuffle/i }));
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(storedPick().workoutId).toBe("w-warmfront");
  });

  it("does not roll a type whose remembered filters match nothing (a fell-back pool is not a suggestion) — review F2", async () => {
    // Under AT, remember a DIFFICULTY of hard only: all three AT fixtures
    // are easy, so AT's pool falls back to the whole type. O2 stays a
    // candidate. Draw 0 of [O2] -> O2; draw 1 would have been AT if AT
    // were a candidate, so script 1 and expect O2 anyway.
    seedFilters({
      AT: {
        difficulties: ["hard"],
        durations: ["<30", "30-45", "45-60"],
        painLevels: [],
        lastDone: null,
        source: null,
      },
    });
    rngQueue.push(1);
    mockReady({ plan: FREESTYLE_PLAN });
    await renderToday();
    expect(screen.getByRole("button", { name: "O2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // A singleton candidate list never consults the rng.
    expect(rngQueue).toStrictEqual([1]);
  });

  it("rolls again on the next local day, and a sticky clear still holds on the next day (spec exit criterion 2)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 8, 4, 9, 0, 0));
      rngQueue.push(1); // [O2, AT] -> AT
      mockReady({ plan: FREESTYLE_PLAN });
      const dayOne = await renderToday();
      expect(screen.getByRole("button", { name: "AT" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      dayOne.unmount();

      vi.setSystemTime(new Date(2026, 8, 5, 9, 0, 0));
      rngQueue.push(0); // a fresh roll: [O2, AT] -> O2
      const dayTwo = await renderToday();
      expect(screen.getByRole("button", { name: "O2" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(rngQueue).toStrictEqual([]);

      await userEvent.click(screen.getByRole("button", { name: "O2" }));
      expect(screen.getByText("ANY TYPE")).toBeInTheDocument();
      dayTwo.unmount();

      vi.setSystemTime(new Date(2026, 8, 6, 9, 0, 0));
      rngQueue.push(1);
      await renderToday();
      for (const type of ["O2", "AT", "TR", "AN"] as const) {
        expect(screen.getByRole("button", { name: type })).toHaveAttribute(
          "aria-pressed",
          "false",
        );
      }
      expect(rngQueue).toStrictEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("CLEAR ALL resets only the current key; the other key's memory survives", async () => {
    seedFilters({
      AT: {
        difficulties: ["hard"],
        durations: ["<30", "30-45", "45-60"],
        painLevels: [],
        lastDone: null,
        source: null,
      },
      O2: {
        difficulties: ["easy"],
        durations: ["<30", "30-45", "45-60"],
        painLevels: [],
        lastDone: null,
        source: null,
      },
    });
    mockReady();
    await renderToday();
    expect(screen.getByText("HARD")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "CLEAR ALL" }));
    expect(storedFilters("AT")?.difficulties).toStrictEqual([
      "easy",
      "medium",
      "hard",
    ]);
    expect(storedFilters("O2")?.difficulties).toStrictEqual(["easy"]);
  });
});
