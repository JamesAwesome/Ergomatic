import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { PlanData, PlanSequenceItem } from "../api/usePlan";
import type { RecentLog } from "../api/useRecentLogs";
import type { WorkoutType } from "../../domain/types.js";
import { buildDraft, type SessionDraft, DRAFT_KEY } from "../session/draft";
import { buildRun } from "../session/engine";
import { RUN_KEY, type SessionRun } from "../session/run";
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

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };
const NO_BASELINES = { k2Seconds: null, k6Seconds: null };
const DEFAULT_PREFS = {
  difficulties: ["easy", "medium", "hard"],
  timeCapMinutes: 60,
  warmupMinutes: 10,
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
  baselines?: typeof BASELINES | typeof NO_BASELINES;
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

  it("still renders the card, without a duration preview, when baselines are unset — and the reason never claims a cap that was never checked", async () => {
    mockReady({ baselines: NO_BASELINES });
    await renderToday();
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(screen.getByText("—")).toBeVisible();
    const reason = screen.getByText(/Least recently done/);
    expect(reason).toBeVisible();
    // Regression guard: every entry's estMinutes is a 0 placeholder with
    // no baselines (toLibraryEntry), so no real duration was ever checked
    // against the 60-min cap — the reason must not claim otherwise
    // (domain/suggest.ts's `durationsUnknown` prefs flag, passed here via
    // `baselines === null`).
    expect(reason.textContent).not.toMatch(/cap/i);
    expect(reason.textContent).not.toMatch(/60/);
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
  it.each([
    [60, "≤60′"],
    [45, "≤45′"],
    [100, "NO CAP"],
  ] as const)(
    "snaps a %i min preference cap to the %s chip by default (no stored overrides)",
    async (timeCapMinutes, label) => {
      mockReady({ preferences: { ...DEFAULT_PREFS, timeCapMinutes } });
      await renderToday();
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    },
  );

  it("defaults difficulties to every preference value and pain filter to off", async () => {
    mockReady();
    await renderToday();
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
    expect(screen.getByRole("button", { name: "PAIN ≤3" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("Today (overrides: stored record wins over preferences)", () => {
  it("uses the stored difficulties/cap/pain instead of the preference-derived default", async () => {
    const stored: TodayOverrides = {
      date: todayDateString(),
      planKey: "sprint",
      doneN: 11,
      swapType: null,
      difficulties: ["hard"],
      capMinutes: 30,
      painMax3: true,
    };
    localStorage.setItem(TODAY_OVERRIDES_KEY, JSON.stringify(stored));
    mockReady();
    await renderToday();

    expect(screen.getByRole("button", { name: "HARD" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "EASY" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "≤30′" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "PAIN ≤3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Every fixture workout is "easy" difficulty (see the fixtures' own
    // comment) — none match the stored "hard"-only filter, so the fellback
    // reason proves the STORED record drove suggest(), not the 60-min/
    // easy-medium-hard preference default DEFAULT_PREFS would have produced.
    expect(screen.getByText(/Nothing fit your/)).toBeVisible();
  });
});

describe("Today (filter chips: live narrowing)", () => {
  it("deselecting EASY changes the reason to a fellback explanation without changing the pick (deselecting every difficulty is allowed)", async () => {
    mockReady();
    await renderToday();
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(screen.getByText(/Least recently done/)).toBeVisible();

    const easyChip = screen.getByRole("button", { name: "EASY" });
    await userEvent.click(easyChip);

    // Same pick (the fellback pool is still the full AT list, sorted the
    // same way) — only the REASON narrows to say nothing matched.
    expect(
      screen.getByRole("heading", { name: "Stationary Front" }),
    ).toBeVisible();
    expect(screen.getByText(/Nothing fit your difficulty/)).toBeVisible();
    expect(easyChip).toHaveAttribute("aria-pressed", "false");

    // Re-selecting EASY (the multi-select's "add back" branch, distinct
    // from the "remove" branch just exercised above) restores the normal
    // least-recently-done reason.
    await userEvent.click(easyChip);
    expect(easyChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Least recently done/)).toBeVisible();
  });

  it("PAIN ≤3 toggles independently of the difficulty/cap chips", async () => {
    mockReady();
    await renderToday();
    const painChip = screen.getByRole("button", { name: "PAIN ≤3" });
    expect(painChip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(painChip);
    expect(painChip).toHaveAttribute("aria-pressed", "true");
  });

  it("cap chips are single-select: exactly one is ever active", async () => {
    mockReady();
    await renderToday();
    expect(screen.getByRole("button", { name: "≤60′" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "≤30′" }));
    expect(screen.getByRole("button", { name: "≤30′" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "≤60′" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await userEvent.click(screen.getByRole("button", { name: "NO CAP" }));
    expect(screen.getByRole("button", { name: "NO CAP" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "≤30′" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  // Fix round 2 (whole-branch review, M4): the nine chips used to sit as
  // flat siblings with no visible grouping — `HARD` and `≤60′` rendered
  // pixel-identical despite opposite selection semantics (multi-select vs.
  // single-select-exactly-one-always-active). Each cluster now has a
  // visible mono label AND an accessible group name (`role="group"` +
  // `aria-labelledby` pointing at that same visible label) — this pins
  // both, and that each group actually contains the chips it claims to.
  it("each filter cluster has a visible group label wired to an accessible group name", async () => {
    mockReady();
    await renderToday();

    const difficultyGroup = screen.getByRole("group", { name: "DIFFICULTY" });
    expect(screen.getByText("DIFFICULTY")).toBeVisible();
    expect(
      within(difficultyGroup).getByRole("button", { name: "EASY" }),
    ).toBeInTheDocument();

    const timeGroup = screen.getByRole("group", { name: "TIME" });
    expect(screen.getByText("TIME")).toBeVisible();
    expect(
      within(timeGroup).getByRole("button", { name: "≤60′" }),
    ).toBeInTheDocument();

    const painGroup = screen.getByRole("group", { name: "PAIN" });
    expect(screen.getByText("PAIN")).toBeVisible();
    expect(
      within(painGroup).getByRole("button", { name: "PAIN ≤3" }),
    ).toBeInTheDocument();
  });
});

describe("Today (overrides: persistence and invalidation)", () => {
  it("persists a type swap and a filter chip change across a same-context remount", async () => {
    mockReady();
    const first = await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "O2" }));
    // Every difficulty is active by default (DEFAULT_PREFS), so this
    // deselects HARD rather than selecting it — the change under test.
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));
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
  it("hides the type-swap chips in freestyle mode but keeps the filter chips", async () => {
    mockReady({ plan: FREESTYLE_PLAN });
    await renderToday();
    for (const type of ["AN", "O2", "AT", "TR"] as const) {
      expect(
        screen.queryByRole("button", { name: type }),
      ).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "EASY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "≤60′" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PAIN ≤3" })).toBeInTheDocument();
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

  it("swapping to a type with nothing in the library shows the existing empty-pool card, with chips still interactive", async () => {
    mockReady();
    await renderToday();
    await userEvent.click(screen.getByRole("button", { name: "AN" }));

    expect(screen.getByText("No AN sessions in your library.")).toBeVisible();
    const buildLink = screen.getByRole("link", { name: /build a workout/i });
    expect(buildLink).toHaveAttribute("href", "/library/new");

    // Chips remain interactive against the empty pool — toggling one still
    // flips its own pressed state rather than becoming inert/disabled.
    const painChip = screen.getByRole("button", { name: "PAIN ≤3" });
    await userEvent.click(painChip);
    expect(painChip).toHaveAttribute("aria-pressed", "true");
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

describe("Today (LAST THREE)", () => {
  // docs/design/README.md:185's row format, literally: date (not
  // days-ago) · the plain word (not a glyph) · pain, e.g. "JUL 25 · HELD ·
  // 2/10" — "/5" here, not the handoff's literal "/10", because
  // docs/design/DEVIATIONS.md's first row already establishes Ergomatic's
  // pain scale is 1-5 everywhere else in the app (PainBar, WorkoutDetail,
  // the library's "PAIN ≤3" chip); matching the handoff's "/10" verbatim
  // would contradict that already-decided, already-documented deviation.
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
  return buildRun(draft, RESUME_BASELINES, 1, startedAt);
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
      main.textContent!.indexOf("SUGGESTED FOR TODAY"),
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
      "Discard Cold Front without logging?",
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
