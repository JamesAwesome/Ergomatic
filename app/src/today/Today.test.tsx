import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { PlanData, PlanSequenceItem } from "../api/usePlan";
import type { RecentLog } from "../api/useRecentLogs";
import type { WorkoutType } from "../../domain/types.js";
import { buildDraft, type SessionDraft, DRAFT_KEY } from "../session/draft";
import { buildRun } from "../session/engine";
import { RUN_KEY, type SessionRun } from "../session/run";
import { elapsedSinceStart } from "./Today";
import { TODAY_PICK_KEY } from "./todayPick";

// Realistic fixtures, per repo convention: real starter workouts
// (app/server/seed/starter.ts), not hand-built minimums.
// - Zephyr (O2, easy): the freestyle/least-recently-done pick.
// - Isobar / Warm Front / Tailwind (all AT, easy): the plan-mode pool —
//   THREE same-type entries, not two, so a SHUFFLE test can tell a real
//   wraparound (1->2->0) apart from an off-by-one bug that only happens
//   to look right on a 2-item pool (see the SHUFFLE describe block).
function starterEntry(
  title: string,
  id: string,
  lastDoneDaysAgo: number | null,
): LibraryWorkout {
  const w = STARTER_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing starter fixture: ${title}`);
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

const ZEPHYR = starterEntry("Zephyr", "w-zephyr", 30);
const ISOBAR = starterEntry("Isobar", "w-isobar", 10);
const WARM_FRONT = starterEntry("Warm Front", "w-warmfront", 20);
const TAILWIND = starterEntry("Tailwind", "w-tailwind", 15);

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
    workoutTitle: "Isobar",
    workoutType: "AT",
    loggedAt: "2026-07-25T12:00:00.000Z",
    held: "held",
    pain: 2,
  },
  {
    id: "log-2",
    workoutId: "w-zephyr",
    workoutTitle: "Zephyr",
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
    // Warm Front (20d ago) outranks Isobar (10d ago); Zephyr is O2, not AT,
    // so it must never be the pick when a plan names AT for today.
    expect(screen.getByRole("heading", { name: "Warm Front" })).toBeVisible();
    // Zephyr is O2, not AT — it must never be the suggestion card's title
    // (it's still allowed to show up in LAST THREE, a different section,
    // since it's in the LOGS fixture too — so this checks the card's own
    // heading specifically, not "Zephyr" text anywhere on the page).
    expect(
      screen.queryByRole("heading", { name: "Zephyr" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Least recently done/)).toBeVisible();
  });

  it("renders a resolved duration preview when baselines exist", async () => {
    mockReady();
    await renderToday();
    // Warm Front: wu 4' + 2 * (10' work + 5' rest) = 34' total.
    expect(screen.getByText("34′")).toBeVisible();
  });

  it("still renders the card, without a duration preview, when baselines are unset — and the reason never claims a cap that was never checked", async () => {
    mockReady({ baselines: NO_BASELINES });
    await renderToday();
    expect(screen.getByRole("heading", { name: "Warm Front" })).toBeVisible();
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
    await userEvent.click(screen.getByRole("link", { name: /Warm Front/i }));
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
    // Zephyr (30d ago) is the least recently done across the WHOLE library
    // (not filtered to one type) — AT's Warm Front/Isobar are more recent.
    expect(screen.getByRole("heading", { name: "Zephyr" })).toBeVisible();
  });

  it("treats a plan with no sequence entry at doneN the same as freestyle, rather than crashing", async () => {
    // A completed plan (doneN reached the end of the 84-session sequence)
    // is out of scope this phase (6C advances doneN) — this pins the
    // fallback documented at the todayCode computation: fall through to
    // freestyle instead of indexing past the end of an empty/short array.
    mockReady({
      plan: { planKey: "sprint", doneN: 84, sequence: buildSequence(11, "AT") },
    });
    await renderToday();
    expect(screen.getByText(/FREESTYLE/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Zephyr" })).toBeVisible();
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
    // Pool sorted by least-recently-done: Warm Front (20d) -> Tailwind
    // (15d) -> Isobar (10d). A 3-item pool (not 2) is deliberate: on a
    // 2-item pool, a missing "% pool.length" bug still lands back on the
    // starting item after two clicks by coincidence (index 2 vs. index 0
    // both read as "not index 1"), so it wouldn't be caught here. Three
    // items make every step's expected index unambiguous.
    mockReady();
    await renderToday();
    expect(screen.getByRole("heading", { name: "Warm Front" })).toBeVisible();

    const shuffle = screen.getByRole("button", { name: /shuffle/i });

    await userEvent.click(shuffle);
    expect(screen.getByRole("heading", { name: "Tailwind" })).toBeVisible();
    expect(storedPickWorkoutId()).toBe("w-tailwind");

    await userEvent.click(shuffle);
    expect(screen.getByRole("heading", { name: "Isobar" })).toBeVisible();
    expect(storedPickWorkoutId()).toBe("w-isobar");

    await userEvent.click(shuffle);
    expect(screen.getByRole("heading", { name: "Warm Front" })).toBeVisible();
    expect(storedPickWorkoutId()).toBe("w-warmfront");
  });

  it("persists the pick for a same-day reload", async () => {
    mockReady();
    const first = await renderToday();
    const shuffle = screen.getByRole("button", { name: /shuffle/i });
    await userEvent.click(shuffle);
    expect(screen.getByRole("heading", { name: "Tailwind" })).toBeVisible();

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
      await screen.findByRole("heading", { name: "Tailwind" }),
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
    // Falls back to the default pool[0] (Warm Front), not the stale pick.
    expect(screen.getByRole("heading", { name: "Warm Front" })).toBeVisible();
  });

  it("is disabled when the pool has one or zero members (nothing to shuffle to)", async () => {
    mockReady({ workouts: [WARM_FRONT] });
    await renderToday();
    expect(screen.getByRole("button", { name: /shuffle/i })).toBeDisabled();
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
    expect(within(section).getByText("Isobar")).toBeVisible();
    expect(within(section).getByText(/JUL 25/)).toBeVisible();
    expect(within(section).getByText(/HELD/)).toBeVisible();
    expect(within(section).getByText(/2\/5/)).toBeVisible();

    expect(within(section).getByText("Zephyr")).toBeVisible();
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
      title: "Warm Front",
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
      title: "Warm Front",
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
// suggestion card only ever REPLACES it. A real starter workout distinct
// from every fixture `mockReady`'s own library uses (Cold Front never
// appears there) — so a resume-card assertion can never coincidentally
// match the suggestion card's own text, and the fixture proves F3a's own
// point in passing: the resume card renders straight off `run.title`, with
// no need for Cold Front to be a real library entry OR for a matching
// draft to exist in storage.
const RESUME_BASELINES = { k2Seconds: 100, k6Seconds: 120 };

function liveRunFor(startedAt: Date): SessionRun {
  const w = STARTER_WORKOUTS.find((s) => s.title === "Cold Front");
  if (!w) throw new Error("missing starter fixture: Cold Front");
  const draft = buildDraft({
    id: "w-coldfront",
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
    expect(screen.getByRole("heading", { name: "Cold Front" })).toBeVisible();
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

    expect(screen.getByText("Cold Front")).toBeVisible();
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
