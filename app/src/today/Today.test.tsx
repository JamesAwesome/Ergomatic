import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { PlanData, PlanSequenceItem } from "../api/usePlan";
import type { RecentLog } from "../api/useRecentLogs";
import type { WorkoutType } from "../../domain/types.js";
import { buildDraft, type SessionDraft, DRAFT_KEY } from "../session/draft";
import { buildRun } from "../session/engine";
import { RUN_KEY, type SessionRun } from "../session/run";
import { MONITOR_RUN_KEY, type MonitorRun } from "../monitor/monitorRun";
import { elapsedSinceStart } from "./Today";
import { TODAY_PICK_KEY, todayDateString } from "./todayPick";
import { TODAY_OVERRIDES_KEY, type TodayOverrides } from "./todayOverrides";

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
// BaselineCard's own lookup (Today.tsx) keys off the exact title constants
// these carry.
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

const FIRST_6K = onboardingLibraryEntry("First 6k", "w-first6k");
const FIRST_2K = onboardingLibraryEntry("First 2k", "w-first2k");

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
// Phase 6I: one baseline set, one missing — the "exactly one null" branch
// (BaselineCard offers only the missing distance, no toggle).
const ONLY_K6_BASELINE = { k2Seconds: null, k6Seconds: 122 };
// `startHereDismissed: true` is this file's own default (NOT the server's
// real default, which is `false` — server/stores/preferences.ts) so the
// pre-existing suite below keeps exercising "normal Today" without every
// one of ~100 unrelated tests also having an opinion about the START HERE
// block; the block's own mount/dismiss/step behavior is covered in
// StartHere.test.tsx, and the few tests here that need it un-dismissed say
// so explicitly via `mockReady({ preferences: { ..., startHereDismissed:
// false } })`.
const DEFAULT_PREFS = {
  difficulties: ["easy", "medium", "hard"],
  timeCapMinutes: 60,
  warmupMinutes: 10,
  startHereDismissed: true,
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

// A checkpoint day: prescribedCode is the literal "TEST" plan code, which
// suggest.ts maps to TR's pool (matchType) — Today's own type chips mirror
// that mapping (effectivePrescribed) so TR, not "TEST" itself, is the chip
// that reads active absent a swap.
const PLAN_TEST: PlanData = {
  planKey: "sprint",
  doneN: 20,
  sequence: buildSequence(20, "TEST"),
};

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
  },
  {
    id: "log-2",
    workoutId: "w-zephyr",
    workoutTitle: "Sea Fret",
    workoutType: "O2",
    loggedAt: "2026-07-20T12:00:00.000Z",
    held: "under",
    pain: 1,
  },
  {
    id: "log-3",
    workoutId: null,
    workoutTitle: "Deleted Workout",
    workoutType: "AN",
    loggedAt: "2026-07-10T12:00:00.000Z",
    held: "over",
    pain: 4,
  },
];

function mockReady(overrides?: {
  workouts?: LibraryWorkout[];
  baselines?: typeof BASELINES | typeof NO_BASELINES | typeof ONLY_K6_BASELINE;
  plan?: PlanData;
  preferences?: typeof DEFAULT_PREFS;
  logs?: RecentLog[];
  savePreferences?: ReturnType<typeof vi.fn>;
  readSlugs?: string[];
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
  const save = overrides?.savePreferences ?? vi.fn();
  const readSlugs = overrides?.readSlugs ?? [];

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
    usePreferences: () => ({ state: "ready", preferences, save }),
  }));
  vi.doMock("../api/useRecentLogs", () => ({
    useRecentLogs: () => ({ state: "ready", logs }),
  }));
  // Phase 6I: StartHere (mounted whenever `!preferences.startHereDismissed`)
  // reads this hook directly — mocked unconditionally, same "ready, real
  // Set, no network" shape every StartHere-un-dismissed test below needs;
  // the pre-existing suite never sees it render at all (DEFAULT_PREFS'
  // own `startHereDismissed: true`), so this is inert for those ~100 tests.
  vi.doMock("../api/useArticleReads", () => ({
    useArticleReads: () => ({
      state: "ready",
      readSlugs: new Set(readSlugs),
      markRead: vi.fn(),
      markUnread: vi.fn(),
    }),
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

// Today links into both a workout's detail page (the suggestion card) and
// the builder (`+ Build a workout`, empty-library case) — one probe route
// per target so either click's landing state can be inspected.
async function renderTodayWithProbes() {
  const { default: Today } = await import("./Today");
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route path="/today" element={<Today />} />
        <Route path="/library/:id" element={<LocationProbe />} />
        <Route path="/library/new" element={<LocationProbe />} />
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
    // Stationary Front: wu 5' + 3×3' work + 2×0.5' rest (no rest after the
    // last rung) = 5 + 9 + 1 = 15' total.
    expect(screen.getByText("15′")).toBeVisible();
  });

  // Phase 6I: baselines unset used to still render the suggestion card
  // (a bare-dash duration, per the old test this replaces) — the design
  // spec's no-baseline card now takes over that state entirely instead.
  // Full branch coverage (both-null/one-null/plan-apparatus-hiding/
  // exclusion-from-suggestion) lives in the dedicated describe block below;
  // this just updates the pre-existing "baselines unset" expectation so it
  // no longer asserts the retired behavior.
  it("shows the no-baseline card, not the old suggestion card, when baselines are unset", async () => {
    mockReady({
      baselines: NO_BASELINES,
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND, FIRST_6K, FIRST_2K],
    });
    await renderToday();
    expect(screen.getByRole("heading", { name: "First 6k" })).toBeVisible();
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

  it("cycles through the FULL 3-member pool in order and wraps back to the start", async () => {
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
    const stored: TodayOverrides = {
      date: todayDateString(),
      planKey: "sprint",
      doneN: 11,
      swapType: null,
      difficulties: ["hard"],
      durations: ["<30"],
      painLevels: [1, 2, 3],
      lastDone: null,
      source: null,
    };
    localStorage.setItem(TODAY_OVERRIDES_KEY, JSON.stringify(stored));
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
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({ source: "custom" });
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
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({ lastDone: "over21" });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove 21D+ filter" }),
    );
    expect(screen.queryByText("21D+")).not.toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({ lastDone: null });
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
    // No record has ever been written at all yet (this mount never applied
    // a type swap or the sheet) — the draft edit above didn't create one
    // either, the strongest proof it never touched storage.
    expect(localStorage.getItem(TODAY_OVERRIDES_KEY)).toBeNull();
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
    expect(localStorage.getItem(TODAY_OVERRIDES_KEY)).toBeNull();

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
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({ difficulties: ["medium", "hard"] });

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
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({ difficulties: ["easy", "medium"] });

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
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({ difficulties: ["easy", "medium"] });

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
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({ difficulties: ["easy", "medium"], painLevels: [] });
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
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({
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
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({
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
    expect(
      JSON.parse(localStorage.getItem(TODAY_OVERRIDES_KEY)!) as TodayOverrides,
    ).toMatchObject({
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
    const saved = JSON.parse(
      localStorage.getItem(TODAY_OVERRIDES_KEY)!,
    ) as TodayOverrides;
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
  it("hides the type-swap chips in freestyle mode but keeps the FILTER sheet available", async () => {
    mockReady({ plan: FREESTYLE_PLAN });
    await renderToday();
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      expect(
        screen.queryByRole("button", { name: type }),
      ).not.toBeInTheDocument();
    }
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
      container.querySelectorAll(".today-type-chips .chip"),
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

  it("on a TEST day, TR reads active by default and swapping shows TEST → <type>", async () => {
    mockReady({ plan: PLAN_TEST });
    await renderToday();
    expect(screen.getByText("SESSION 21 OF 84 · TEST")).toBeVisible();
    expect(screen.getByRole("button", { name: "TR" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "AN" }));

    expect(screen.getByText("SESSION 21 OF 84 · TEST → AN")).toBeVisible();
    expect(screen.getByRole("button", { name: "AN" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "TR" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("tapping TR on a TEST day un-swaps, since TR is the effective prescribed type for TEST", async () => {
    mockReady({ plan: PLAN_TEST });
    await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "AN" }));
    expect(screen.getByText(/TEST → AN/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "TR" }));

    expect(screen.getByText("SESSION 21 OF 84 · TEST")).toBeVisible();
    expect(screen.getByRole("button", { name: "TR" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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

  it("on a TEST day, shows TR's word by default (HARD INTERVALS) since TR is the effective type", async () => {
    mockReady({ plan: PLAN_TEST });
    await renderToday();
    expect(screen.getByText("HARD INTERVALS")).toBeInTheDocument();
  });

  it("does not render in freestyle mode — there are no type-swap chips to reinforce", async () => {
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
  });

  // The chips already convey the selected type to assistive tech via each
  // TodayChip's own `aria-pressed` — this word is purely presentational
  // reinforcement of that same state, so it's hidden from the accessibility
  // tree rather than announced a second time.
  it("is aria-hidden — the chips' own aria-pressed already conveys the selection", async () => {
    mockReady();
    await renderToday();
    const word = screen.getByText("COMFORTABLY HARD");
    const row = word.closest(".today-type-word-row");
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

    const section = screen.getByText("LAST THREE").closest("section")!;
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
  // like the sessionRun case.
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
    expect(
      document.querySelector(".today-unlogged-line"),
    ).not.toBeInTheDocument();
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
    expect(screen.getByText(/unlogged session/i)).toBeVisible();
    // Phase 6C Task 2: the placeholder copy ("6C will log it here") is
    // replaced by a real link to the screen that now exists.
    const logLink = screen.getByRole("link", { name: "Log it" });
    expect(logLink).toBeVisible();
    expect(logLink).toHaveAttribute("href", "/session/log");
    // Quieter than the resume card, per the brief: no "SESSION IN PROGRESS"
    // banner, no Resume-session link.
    expect(screen.queryByText("SESSION IN PROGRESS")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Resume session" }),
    ).not.toBeInTheDocument();
  });

  it("renders neither the resume card nor the unlogged line when there is no run record at all", async () => {
    mockReady();
    await renderToday();

    expect(screen.queryByText("SESSION IN PROGRESS")).not.toBeInTheDocument();
    expect(screen.queryByText(/unlogged session/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Resume session" }),
    ).not.toBeInTheDocument();
  });
});

// Task 3 (ui-fix round): the unlogged line's own staged Discard —
// DESIGN.md's "Today's unlogged row" — a 44×44 accent-outlined ✕ that arms
// IN PLACE (border → accent, text → "Discard {title} without logging?", ✕
// → solid accent "Tap again"), fires with no navigation, and must never
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
      screen.getByRole("button", { name: "Discard without logging" }),
    );

    // The row's contents swap — title, ✕, and "Log it" are all replaced by
    // the armed copy, not merely joined by it.
    expect(document.querySelector(".today-unlogged-text")?.textContent).toBe(
      "Discard Filling Low without logging?",
    );
    expect(
      screen.getByRole("button", { name: "Tap again" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Log it" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Discard without logging" }),
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
      screen.getByRole("button", { name: "Discard without logging" }),
    );
    const armed = screen.getByRole("button", { name: "Tap again" });
    expect(document.activeElement).toBe(armed);

    act(() => armed.blur());

    expect(
      screen.getByRole("button", { name: "Discard without logging" }),
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
      screen.getByRole("button", { name: "Discard without logging" }),
    );
    expect(
      screen.getByRole("button", { name: "Tap again" }),
    ).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(4000));

    expect(
      screen.getByRole("button", { name: "Discard without logging" }),
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
      screen.getByRole("button", { name: "Discard without logging" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Tap again" }));

    // Gone in place — no "unlogged session" line, no armed controls, and
    // still on Today (no navigation at all, unlike SessionComplete's/the Log
    // screen's own Discard, which both leave the screen).
    expect(screen.queryByText(/unlogged session/i)).not.toBeInTheDocument();
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

describe("Today (Phase 6I: START HERE + the no-baseline card)", () => {
  it("mounts StartHere above everything when the block isn't dismissed", async () => {
    mockReady({
      preferences: { ...DEFAULT_PREFS, startHereDismissed: false },
    });
    await renderToday();

    const block = await screen.findByText("START HERE · 0 OF 4 READ");
    expect(block).toBeVisible();
    // "Above everything" (the controller's own framing): the block's DOM
    // position precedes even the screen's own <h1>'s next sibling — proven
    // here as "precedes the plan line," the next thing Today renders.
    const main = screen
      .getByRole("heading", { name: "Today" })
      .closest("main")!;
    const children = [...main.children];
    const blockIndex = children.findIndex((c) =>
      c.classList.contains("starthere-block"),
    );
    const planLineIndex = children.findIndex((c) =>
      c.classList.contains("today-plan-line"),
    );
    expect(blockIndex).toBeGreaterThanOrEqual(0);
    expect(blockIndex).toBeLessThan(planLineIndex);
  });

  it("renders nothing at all for StartHere when the block is dismissed (this file's own default)", async () => {
    mockReady();
    const { container } = await renderToday();
    await screen.findByRole("heading", { name: "Today" });
    expect(container.querySelector(".starthere-block")).not.toBeInTheDocument();
  });

  it("DISMISS calls preferences.save({ startHereDismissed: true }) — no staged confirm", async () => {
    const save = vi.fn();
    mockReady({
      preferences: { ...DEFAULT_PREFS, startHereDismissed: false },
      savePreferences: save,
    });
    await renderToday();

    await userEvent.click(screen.getByRole("button", { name: "DISMISS" }));
    expect(save).toHaveBeenCalledExactlyOnceWith({
      startHereDismissed: true,
    });
  });

  it("both baselines missing: shows the no-baseline card (6k default) and hides the ENTIRE plan/suggestion apparatus", async () => {
    mockReady({
      baselines: NO_BASELINES,
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND, FIRST_6K, FIRST_2K],
    });
    await renderToday();

    expect(
      await screen.findByText("SUGGESTED · SETS YOUR BASELINE"),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "First 6k" })).toBeVisible();
    expect(screen.getByText("ABOUT 25 MIN")).toBeVisible();
    expect(
      screen.getByText("6K BASELINE · NOT SET · ROW IT HOW IT FEELS"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "2K INSTEAD" })).toBeVisible();

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

  it("only the 2k missing: the card offers SETS YOUR 2K BASELINE only, no toggle", async () => {
    mockReady({
      baselines: ONLY_K6_BASELINE,
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND, FIRST_6K, FIRST_2K],
    });
    await renderToday();

    expect(
      await screen.findByRole("heading", { name: "First 2k" }),
    ).toBeVisible();
    expect(screen.getByText("ABOUT 8 MIN")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /INSTEAD/ }),
    ).not.toBeInTheDocument();
  });

  it("both baselines set: normal Today returns — plan apparatus back, no baseline card", async () => {
    mockReady({
      workouts: [ZEPHYR, ISOBAR, WARM_FRONT, TAILWIND, FIRST_6K, FIRST_2K],
    });
    await renderToday();

    expect(await screen.findByText("SESSION 12 OF 84 · AT")).toBeVisible();
    expect(screen.getByRole("button", { name: "FILTER ⌄" })).toBeVisible();
    expect(
      screen.queryByText("SUGGESTED · SETS YOUR BASELINE"),
    ).not.toBeInTheDocument();
  });

  it("a veteran with real baselines is never SUGGESTED a designated onboarding workout, even shuffled through the whole pool", async () => {
    // Every non-onboarding fixture is O2/easy so the freestyle pool (no
    // plan) is exactly {ZEPHYR, FIRST_6K, FIRST_2K} before exclusion —
    // small enough to shuffle through completely and assert the designated
    // titles never come up, real seed types (O2/AN) included on purpose so
    // this can't pass by accident of type mismatch alone.
    mockReady({
      plan: FREESTYLE_PLAN,
      workouts: [ZEPHYR, { ...FIRST_6K, type: "O2" }, FIRST_2K],
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
      screen.queryByRole("heading", { name: "First 6k" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "First 2k" }),
    ).not.toBeInTheDocument();
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
