import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import type { Step } from "../../domain/types.js";

/** A work step of exactly `minutes` at this file's 6k baseline (off 0), so
 *  `estimateMinutes` prices each fixture to the round number its row is
 *  asserted to show. Each of these was a `wu` row until 2026-08-09's
 *  warmup setting removed that step kind; a `wu` step contributes no
 *  minutes at all now, so every row here would read 0'. */
function timeWork(minutes: number): Step {
  return {
    k: "w",
    duration: { kind: "time", minutes },
    ref: { base: "6k", off: 0 },
  };
}

const WORKOUTS: LibraryWorkout[] = [
  {
    id: "w-at",
    title: "Anaerobic Threshold Blitz",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [timeWork(30)],
    isGlobal: true,
    lastDoneDaysAgo: 5,
  },
  {
    id: "w-o2",
    title: "Steady State Cruise",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [timeWork(20)],
    isGlobal: true,
    lastDoneDaysAgo: 40,
  },
  {
    id: "w-an",
    title: "Sprint Ladder",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [timeWork(60)],
    isGlobal: true,
    lastDoneDaysAgo: null,
  },
];

const CUSTOM_WORKOUT: LibraryWorkout = {
  id: "w-custom",
  title: "My Interval Build",
  type: "O2",
  difficulty: "medium",
  pain: 2,
  steps: [timeWork(25)],
  isGlobal: false,
  lastDoneDaysAgo: null,
};

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

// Controller addendum (Phase 6I Task 7): the two designated onboarding
// workouts, real seed shape (server/seed/library/onboarding.ts) rather than
// a hand-built minimum — the same "test against the real fixture" rule
// Today.test.tsx's own `onboardingLibraryEntry` already follows for this
// exact pair, applied here since Library.tsx gets the identical exclusion.
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

// A real 300-library workout, standing in for the rest of a realistic
// library alongside the two onboarding rows below (recurring-failure #3:
// an empty/synthetic fixture has hidden shipped defects here twice before).
function realLibraryEntry(title: string, id: string): LibraryWorkout {
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
    lastDoneDaysAgo: null,
  };
}

const FIRST_6K = onboardingLibraryEntry("First 6k", "w-first6k");
const FIRST_2K = onboardingLibraryEntry("First 2k", "w-first2k");
const SEA_FRET = realLibraryEntry("Sea Fret", "w-seafret");

// Final-review fix: a CUSTOM (isGlobal: false) workout that happens to
// collide with a designated onboarding title. The exclusion must key off
// isGlobal too, not title alone — otherwise a rower's own "First 6k" build
// becomes an orphan (invisible everywhere, no UI path back). Built the way
// the builder would (spread a real seed shape), same convention
// CUSTOM_WORKOUT above already follows for a from-scratch personal row.
const CUSTOM_FIRST_6K: LibraryWorkout = {
  ...onboardingLibraryEntry("First 6k", "w-customfirst6k"),
  isGlobal: false,
};

function mockReady(workouts: LibraryWorkout[] = WORKOUTS) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines: BASELINES }),
  }));
}

async function renderLibrary() {
  const { default: Library } = await import("./Library");
  render(
    <MemoryRouter>
      <Library />
    </MemoryRouter>,
  );
}

// Renders `location.state.from` as plain text, the same "prove the
// navigation, not the prop" idiom Today.test.tsx's own probe uses — every
// link this screen makes into a detail-ish route now carries
// `state={{from:"/library"}}`, and RTL can't read a `<Link>`'s `state`
// prop directly.
function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return <p>PROBE from={String(from)}</p>;
}

async function renderLibraryWithProbes() {
  const { default: Library } = await import("./Library");
  render(
    <MemoryRouter initialEntries={["/library"]}>
      <Routes>
        <Route path="/library" element={<Library />} />
        <Route path="/library/new" element={<LocationProbe />} />
        <Route path="/library/import" element={<LocationProbe />} />
        <Route path="/library/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function visibleHrefs(): (string | null)[] {
  const list = screen.getByRole("list");
  return within(list)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
}

/** A token's own label text, scoped to `.filter-token-label` — a bare
 *  `getByText` for e.g. "AT" collides with the filtered row's own
 *  `.type-badge` once the list is narrowed to that type. */
function tokenLabel(label: string) {
  return screen.getByText(label, { selector: ".filter-token-label" });
}

/** Opens the FILTER sheet — every filter interaction in this suite goes
 *  through it now that FilterChips.tsx (the old flat chip row) is retired. */
async function openSheet() {
  await userEvent.click(screen.getByRole("button", { name: "FILTER ⌄" }));
}

/** Clicks the sheet's own live-counting primary — its accessible name
 *  changes with the draft ("Show 12 workouts"), hence the regex. Only valid
 *  when the draft matches at least one workout; the button is disabled
 *  ("No workouts match") otherwise, by design (FilterSheet.tsx). */
async function applySheet() {
  await userEvent.click(
    screen.getByRole("button", { name: /^Show \d+ workouts?$/ }),
  );
}

beforeEach(() => {
  vi.resetModules();
  // Filters now persist to sessionStorage by design (the filter-BACK fix),
  // so without this every test would inherit whatever the previous test
  // left active.
  sessionStorage.clear();
});

describe("Library", () => {
  it("shows an IMPORT link beside + NEW so bulk-paste no longer hides inside the builder", async () => {
    mockReady();
    await renderLibrary();

    expect(screen.getByRole("link", { name: "IMPORT" })).toHaveAttribute(
      "href",
      "/library/import",
    );
    expect(screen.getByRole("link", { name: "+ NEW" })).toHaveAttribute(
      "href",
      "/library/new",
    );
  });

  it("renders every row's bare title and estimated duration, with no numeric prefix", async () => {
    mockReady();
    await renderLibrary();

    const title = screen.getByText("Anaerobic Threshold Blitz");
    expect(title).toBeInTheDocument();
    expect(title.textContent).not.toMatch(/^\d+\.\s/);
    expect(screen.getByText("Steady State Cruise")).toBeInTheDocument();
    expect(screen.getByText("Sprint Ladder")).toBeInTheDocument();
    expect(screen.getByText("30′")).toBeInTheDocument();
    expect(screen.getByText("20′")).toBeInTheDocument();
    expect(screen.getByText("60′")).toBeInTheDocument();
  });

  it("shows a plain count in the header, never the book's fixed denominator", async () => {
    mockReady();
    await renderLibrary();

    expect(screen.getByText("3 WORKOUTS")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/375/);
    expect(document.body.textContent).not.toMatch(/ENTERED/);
  });

  describe("FILTER sheet", () => {
    it("opens on FILTER ⌄, closes on the sheet's own primary, and applies the draft", async () => {
      mockReady();
      await renderLibrary();

      const toggle = screen.getByRole("button", { name: "FILTER ⌄" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      await openSheet();
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("dialog", { name: "Filter" })).toBeVisible();

      // PAIN 3, not TYPE — TYPE left the sheet this round; w-at is the
      // fixture's only pain-3 workout, so this still narrows to exactly 1.
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "3",
        }),
      );
      expect(
        screen.getByRole("button", { name: "Show 1 workout" }),
      ).toBeInTheDocument();
      await applySheet();

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(visibleHrefs()).toStrictEqual(["/library/w-at"]);
      expect(screen.getByText("1 OF 3 SHOWN")).toBeInTheDocument();
    });

    it("dismissing via the backdrop discards the draft — the previously-applied filters are unchanged", async () => {
      mockReady();
      await renderLibrary();

      await openSheet();
      // PAIN 3, not TYPE — TYPE left the sheet this round.
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "3",
        }),
      );
      // The backdrop is the dialog's own parent; clicking it (not the panel)
      // fires the dismiss handler (FilterSheet.tsx's onClick + stopPropagation
      // on the inner panel).
      await userEvent.click(screen.getByRole("dialog").parentElement!);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // Nothing was applied — still the full, unfiltered list.
      expect(visibleHrefs()).toStrictEqual([
        "/library/w-at",
        "/library/w-o2",
        "/library/w-an",
      ]);
      expect(screen.getByText("3 WORKOUTS")).toBeInTheDocument();
    });

    it("dismissing via Escape discards the draft the same as the backdrop", async () => {
      mockReady();
      await renderLibrary();

      await openSheet();
      // PAIN 3, not TYPE — TYPE left the sheet this round.
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "3",
        }),
      );
      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText("3 WORKOUTS")).toBeInTheDocument();
    });

    // Md4 (whole-branch review): the trigger is the element focused right
    // before the sheet mounts (a real click focuses its own target first),
    // so FilterSheet.tsx's own "restore whatever had focus before" effect
    // lands here without Library needing to pass the trigger down at all.
    it("restores focus to FILTER ⌄ once the sheet closes", async () => {
      mockReady();
      await renderLibrary();

      const toggle = screen.getByRole("button", { name: "FILTER ⌄" });
      await openSheet();
      expect(toggle).not.toHaveFocus();

      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(toggle).toHaveFocus();
    });

    it("re-opening the sheet seeds the draft from the currently-applied filters, not whatever was left mid-edit last time", async () => {
      mockReady();
      await renderLibrary();

      await openSheet();
      const dialog = () => screen.getByRole("dialog");
      // PAIN 3, not TYPE — TYPE left the sheet this round.
      await userEvent.click(
        within(dialog()).getByRole("button", { name: "3" }),
      );
      // Dismiss without applying.
      await userEvent.keyboard("{Escape}");

      await openSheet();
      expect(
        within(dialog()).getByRole("button", { name: "3" }),
      ).toHaveAttribute("aria-pressed", "false");
    });

    it("the sheet's own CLEAR resets the draft without closing or applying", async () => {
      mockReady();
      await renderLibrary();

      await openSheet();
      const dialog = () => screen.getByRole("dialog");
      // PAIN 3, not TYPE — TYPE left the sheet this round.
      await userEvent.click(
        within(dialog()).getByRole("button", { name: "3" }),
      );
      expect(
        screen.getByRole("button", { name: "Show 1 workout" }),
      ).toBeInTheDocument();

      await userEvent.click(
        within(dialog()).getByRole("button", { name: "CLEAR" }),
      );

      expect(dialog()).toBeVisible();
      expect(
        within(dialog()).getByRole("button", { name: "3" }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(
        screen.getByRole("button", { name: "Show 3 workouts" }),
      ).toBeInTheDocument();
    });

    it("the primary disables and reads 'No workouts match' when the draft matches nothing", async () => {
      mockReady();
      await renderLibrary();

      await openSheet();
      const dialog = () => screen.getByRole("dialog");
      // PAIN 1 (only w-o2) and 60′+ (only w-an, its 60-minute step buckets
      // as 60+) share no workout — TYPE, which used to drive this test via
      // AT + <30′, left the sheet this round.
      await userEvent.click(
        within(dialog()).getByRole("button", { name: "1" }),
      );
      await userEvent.click(
        within(dialog()).getByRole("button", { name: "60′+" }),
      );

      const primary = screen.getByRole("button", {
        name: "No workouts match",
      });
      expect(primary).toBeDisabled();
    });

    it("narrows to NOT-RECENT rows via LAST DONE 21D+, counting never-done as 21D+", async () => {
      mockReady();
      await renderLibrary();

      await openSheet();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "21D+",
        }),
      );
      await applySheet();

      expect(visibleHrefs()).toStrictEqual(["/library/w-o2", "/library/w-an"]);
      expect(screen.getByText("2 OF 3 SHOWN")).toBeInTheDocument();
    });
  });

  describe("active-filter tokens", () => {
    it("renders one token per active group and CLEAR ALL, which removes everything", async () => {
      mockReady();
      await renderLibrary();

      await openSheet();
      const dialog = () => screen.getByRole("dialog");
      // 30–45′ + PAIN 3 both match w-at (fixture: a 30-minute step buckets
      // as 30-45, pain 3) — two groups active together, still exactly one
      // result. TYPE, which used to be the first of the pair, left the
      // sheet this round.
      await userEvent.click(
        within(dialog()).getByRole("button", { name: "30–45′" }),
      );
      await userEvent.click(
        within(dialog()).getByRole("button", { name: "3" }),
      );
      await applySheet();

      expect(tokenLabel("30–45′")).toBeInTheDocument();
      expect(screen.getByText("PAIN 3")).toBeInTheDocument();
      expect(screen.getByText("1 OF 3 SHOWN")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "CLEAR ALL" }));

      expect(screen.queryByText("PAIN 3")).not.toBeInTheDocument();
      expect(screen.getByText("3 WORKOUTS")).toBeInTheDocument();
      expect(visibleHrefs()).toStrictEqual([
        "/library/w-at",
        "/library/w-o2",
        "/library/w-an",
      ]);
    });

    it("a token's own ✕ removes exactly that group, leaving the others active", async () => {
      mockReady();
      await renderLibrary();

      // Applied in two sheet visits (30–45′ alone, then +PAIN 3) — w-at is
      // the fixture's only 30-45-bucket *and* only pain-3 workout, so
      // selecting both in one draft would still resolve to exactly it, but
      // going through two visits proves the SECOND apply doesn't clobber
      // the first group, only adds to it. TYPE, which used to be the
      // first-applied group here, left the sheet this round.
      await openSheet();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "30–45′",
        }),
      );
      await applySheet();

      await openSheet();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "3",
        }),
      );
      await applySheet();

      expect(tokenLabel("30–45′")).toBeInTheDocument();
      expect(screen.getByText("PAIN 3")).toBeInTheDocument();
      expect(screen.getByText("1 OF 3 SHOWN")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Remove 30–45′ filter" }),
      );

      expect(
        screen.queryByText("30–45′", { selector: ".filter-token-label" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("PAIN 3")).toBeInTheDocument();
      expect(screen.getByText("1 OF 3 SHOWN")).toBeInTheDocument();
      expect(visibleHrefs()).toStrictEqual(["/library/w-at"]);
    });
  });

  it("shows the empty state, not a bare list, when a restored filter combination matches nothing", async () => {
    // The sheet's own primary disables at zero results (FilterSheet.tsx),
    // so a fresh sheet session can never COMMIT an empty-matching draft —
    // this state is only reachable via a restored sessionStorage value
    // (e.g. a BACK return after the matching workout was deleted
    // elsewhere), which is what this seeds directly.
    sessionStorage.setItem(
      "ergomatic.libraryFilters",
      JSON.stringify({
        types: ["AT"],
        difficulties: [],
        durations: ["<30"],
        painLevels: [],
        lastDone: null,
        source: null,
      }),
    );
    mockReady();
    await renderLibrary();

    expect(screen.getByText(/No workouts match/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /clear filters/i }),
    );

    expect(screen.getByText("3 WORKOUTS")).toBeInTheDocument();
    expect(visibleHrefs()).toStrictEqual([
      "/library/w-at",
      "/library/w-o2",
      "/library/w-an",
    ]);
  });

  it("renders a — duration fallback instead of a bogus number when baselines are unset", async () => {
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "ready", workouts: WORKOUTS }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({
        state: "ready",
        baselines: { k2Seconds: null, k6Seconds: null },
      }),
    }));

    await renderLibrary();

    expect(screen.getAllByText("—")).toHaveLength(WORKOUTS.length);
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText("30′")).not.toBeInTheDocument();
  });

  it("renders the loading state before data arrives", async () => {
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "loading" }),
    }));

    await renderLibrary();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders an error state with a retry wired to the workouts hook's retry", async () => {
    const retry = vi.fn();
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "error", retry }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "ready", baselines: BASELINES }),
    }));

    await renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders an error state with a retry wired to the baselines hook's retry", async () => {
    const retry = vi.fn();
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "ready", workouts: WORKOUTS }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "error", retry }),
    }));

    await renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  describe("SOURCE filter", () => {
    it("narrows to non-global rows via SOURCE CUSTOM, and CLEAR ALL restores everything", async () => {
      mockReady([...WORKOUTS, CUSTOM_WORKOUT]);
      await renderLibrary();

      await openSheet();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "CUSTOM",
        }),
      );
      await applySheet();

      expect(visibleHrefs()).toStrictEqual(["/library/w-custom"]);
      expect(screen.getByText("1 OF 4 SHOWN")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "CLEAR ALL" }));

      expect(visibleHrefs()).toStrictEqual([
        "/library/w-at",
        "/library/w-o2",
        "/library/w-an",
        "/library/w-custom",
      ]);
      expect(screen.getByText("4 WORKOUTS")).toBeInTheDocument();
    });

    it("GLOBAL and CUSTOM are mutually exclusive", async () => {
      mockReady([...WORKOUTS, CUSTOM_WORKOUT]);
      await renderLibrary();

      await openSheet();
      const dialog = () => screen.getByRole("dialog");
      const globalCell = within(dialog()).getByRole("button", {
        name: "GLOBAL",
      });
      const customCell = within(dialog()).getByRole("button", {
        name: "CUSTOM",
      });
      await userEvent.click(globalCell);
      expect(globalCell).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(customCell);
      expect(globalCell).toHaveAttribute("aria-pressed", "false");
      expect(customCell).toHaveAttribute("aria-pressed", "true");
    });

    it("shows the builder-link empty state when a restored SOURCE=custom filter matches nothing", async () => {
      // Same reasoning as the AT/<30' empty-state test above: the sheet's
      // own primary would disable at zero custom workouts, so this state is
      // only reached via a restored sessionStorage value.
      sessionStorage.setItem(
        "ergomatic.libraryFilters",
        JSON.stringify({
          types: [],
          difficulties: [],
          durations: [],
          painLevels: [],
          lastDone: null,
          source: "custom",
        }),
      );
      mockReady();
      await renderLibrary();

      expect(screen.getByText(/No custom workouts yet/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "build one" })).toHaveAttribute(
        "href",
        "/library/new",
      );
    });
  });

  describe("back-nav origin state", () => {
    // Every link Library makes into a detail-ish screen must stamp its own
    // pathname so that screen's own BackLink can return here (the fix this
    // task round is for) — hrefs above already pin the routes; this pins
    // the state riding alongside them.
    it("stamps state={from:'/library'} onto IMPORT, + NEW, and a row link", async () => {
      mockReady();
      await renderLibraryWithProbes();

      await userEvent.click(screen.getByRole("link", { name: "IMPORT" }));
      expect(await screen.findByText("PROBE from=/library")).toBeVisible();
    });

    it("stamps state={from:'/library'} onto + NEW", async () => {
      mockReady();
      await renderLibraryWithProbes();

      await userEvent.click(screen.getByRole("link", { name: "+ NEW" }));
      expect(await screen.findByText("PROBE from=/library")).toBeVisible();
    });

    it("stamps state={from:'/library'} onto a workout row", async () => {
      mockReady();
      await renderLibraryWithProbes();

      await userEvent.click(
        screen.getByText("Anaerobic Threshold Blitz").closest("a")!,
      );
      expect(await screen.findByText("PROBE from=/library")).toBeVisible();
    });

    it("stamps state={from:'/library'} onto the CUSTOM-empty 'build one' link", async () => {
      sessionStorage.setItem(
        "ergomatic.libraryFilters",
        JSON.stringify({
          types: [],
          difficulties: [],
          durations: [],
          painLevels: [],
          lastDone: null,
          source: "custom",
        }),
      );
      mockReady();
      await renderLibraryWithProbes();

      await userEvent.click(screen.getByRole("link", { name: "build one" }));
      expect(await screen.findByText("PROBE from=/library")).toBeVisible();
    });
  });

  describe("scroll restoration", () => {
    const SAVED_SCROLL_Y = 2400;

    beforeEach(() => {
      sessionStorage.clear();
    });

    it("restores the saved position only once rows render — never during LOADING", async () => {
      sessionStorage.setItem("ergomatic.libraryScroll", String(SAVED_SCROLL_Y));
      const scrollToSpy = vi
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});

      // A mutable "current hook value" the mock reads live, so a later
      // `rerender()` of the SAME Library instance can walk it through the
      // real loading -> ready transition instead of remounting fresh.
      let workoutsState: unknown = { state: "loading" };
      vi.doMock("../api/useWorkouts", () => ({
        useWorkouts: () => workoutsState,
      }));
      vi.doMock("../api/useBaselines", () => ({
        useBaselines: () => ({ state: "ready", baselines: BASELINES }),
      }));

      const { default: Library } = await import("./Library");
      const { rerender } = render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>,
      );

      // Order matters: while still LOADING the list has no height at all,
      // so a restore here would be a no-op scroll against an empty
      // placeholder — asserting this BEFORE the transition is the point of
      // the test, not just checking the end state below.
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
      expect(scrollToSpy).not.toHaveBeenCalled();

      workoutsState = { state: "ready", workouts: WORKOUTS };
      rerender(
        <MemoryRouter>
          <Library />
        </MemoryRouter>,
      );

      expect(await screen.findByRole("list")).toBeInTheDocument();
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      expect(scrollToSpy).toHaveBeenCalledWith(0, SAVED_SCROLL_Y);

      scrollToSpy.mockRestore();
    });

    it("does not restore again on a later re-render once rows are already showing (a filter change doesn't re-scroll)", async () => {
      sessionStorage.setItem("ergomatic.libraryScroll", String(SAVED_SCROLL_Y));
      const scrollToSpy = vi
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});
      mockReady();
      await renderLibrary();

      expect(await screen.findByRole("list")).toBeInTheDocument();
      expect(scrollToSpy).toHaveBeenCalledTimes(1);

      // PAIN 3, not TYPE — TYPE left the sheet this round; any filter
      // change proves the point (a second scrollTo does NOT fire).
      await openSheet();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "3",
        }),
      );
      await applySheet();

      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      scrollToSpy.mockRestore();
    });

    it("does nothing once rows render when nothing was saved (a genuinely fresh visit)", async () => {
      const scrollToSpy = vi
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});
      mockReady();
      await renderLibrary();

      expect(await screen.findByRole("list")).toBeInTheDocument();
      expect(scrollToSpy).not.toHaveBeenCalled();
      scrollToSpy.mockRestore();
    });

    // The disconnected-root echo (main-CI failure, 2026-08-11, twice
    // through the retry): when a row tap navigates away, React commits the
    // detail screen's much shorter DOM, the browser CLAMPS window.scrollY
    // to ~0, and delivers that clamp as a scroll event. This screen's save
    // listener is removed in a PASSIVE effect cleanup (after paint), so
    // under load the clamp arrives first, poisons `lastKnownY`, and both
    // the trailing save and the unmount flush write 0 over the real
    // position. Reproduced 1-in-8 at 15x CPU throttle. News.tsx already
    // guards this; Library predated the lesson. Simulated the same way as
    // News.test.tsx's twin: override the root's own `isConnected` (the one
    // property the guard reads) without physically detaching it, so
    // React's own bookkeeping stays intact.
    it("ignores a scroll event that fires after this screen's own root has been removed from the document (a disconnected-root echo, not a real scroll of THIS screen)", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        mockReady();
        await renderLibrary();

        Object.defineProperty(window, "scrollY", {
          value: 300,
          configurable: true,
        });
        window.dispatchEvent(new Event("scroll"));
        expect(sessionStorage.getItem("ergomatic.libraryScroll")).toBe("300");

        const root = document.querySelector("main.screen")!;
        Object.defineProperty(root, "isConnected", {
          value: false,
          configurable: true,
        });

        // Past the throttle window, so a mutant without the guard flushes
        // the echo IMMEDIATELY rather than merely queueing it — without
        // this advance the throttle alone would keep the assertion green
        // whether or not the guard exists.
        vi.advanceTimersByTime(200);
        Object.defineProperty(window, "scrollY", {
          value: 0,
          configurable: true,
        });
        window.dispatchEvent(new Event("scroll"));

        expect(sessionStorage.getItem("ergomatic.libraryScroll")).toBe("300");
      } finally {
        vi.useRealTimers();
      }
    });

    it("saves scrollY to sessionStorage, throttled to ~100ms (the trailing value survives, not just the first tick)", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        mockReady();
        await renderLibrary();

        Object.defineProperty(window, "scrollY", {
          value: 111,
          configurable: true,
        });
        window.dispatchEvent(new Event("scroll"));
        // First scroll of the window fires the leading edge immediately —
        // nothing throttled to wait for yet.
        expect(sessionStorage.getItem("ergomatic.libraryScroll")).toBe("111");

        // Two scrolls in quick succession, both inside the same 100ms
        // window: only the LAST position should ultimately land, once the
        // trailing timer fires — proving this throttles rather than just
        // sampling the first event and ignoring the rest.
        Object.defineProperty(window, "scrollY", {
          value: 222,
          configurable: true,
        });
        window.dispatchEvent(new Event("scroll"));
        Object.defineProperty(window, "scrollY", {
          value: 333,
          configurable: true,
        });
        window.dispatchEvent(new Event("scroll"));
        expect(sessionStorage.getItem("ergomatic.libraryScroll")).toBe("111");

        await vi.advanceTimersByTimeAsync(100);
        expect(sessionStorage.getItem("ergomatic.libraryScroll")).toBe("333");
      } finally {
        vi.useRealTimers();
      }
    });

    it("flushes the CURRENT position on unmount even mid-throttle-window, instead of dropping it", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        mockReady();
        const { default: Library } = await import("./Library");
        const { unmount } = render(
          <MemoryRouter>
            <Library />
          </MemoryRouter>,
        );

        Object.defineProperty(window, "scrollY", {
          value: 500,
          configurable: true,
        });
        window.dispatchEvent(new Event("scroll"));
        // Leading edge already wrote 500 — now scroll again, still well
        // inside the 100ms window, so this second position is only
        // QUEUED (trailing), not written yet.
        Object.defineProperty(window, "scrollY", {
          value: 777,
          configurable: true,
        });
        window.dispatchEvent(new Event("scroll"));
        expect(sessionStorage.getItem("ergomatic.libraryScroll")).toBe("500");

        // Navigating away now (e.g. tapping a row) unmounts Library before
        // the trailing timer ever fires. Without an unmount-time flush, 777
        // would be lost forever and a later BACK would restore the stale
        // 500 instead of where the rower actually was.
        unmount();

        expect(sessionStorage.getItem("ergomatic.libraryScroll")).toBe("777");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("filter persistence (bugfix: BACK with filters enabled)", () => {
    it("mounts with the saved filters applied — the count and list are already narrowed", async () => {
      sessionStorage.setItem(
        "ergomatic.libraryFilters",
        JSON.stringify({
          types: ["AT"],
          difficulties: [],
          durations: [],
          painLevels: [],
          lastDone: null,
          source: null,
        }),
      );
      mockReady();
      await renderLibrary();

      expect(await screen.findByText("1 OF 3 SHOWN")).toBeInTheDocument();
      expect(tokenLabel("AT")).toBeInTheDocument();
      expect(screen.getByText("Anaerobic Threshold Blitz")).toBeInTheDocument();
      expect(screen.queryByText("Steady State Cruise")).not.toBeInTheDocument();
    });

    it("restores the scroll position against the FILTERED list — the saved filters are live on the very first ready render, before scrollTo fires", async () => {
      // The bug this pins: filters used to reset to empty on remount, so
      // the restored Y (measured against the filtered list) landed on the
      // wrong rows of the full list. The fix loads filters synchronously in
      // the useState initializer, so by the time the rowsReady
      // useLayoutEffect calls scrollTo, the list is ALREADY narrowed.
      sessionStorage.setItem("ergomatic.libraryScroll", "1200");
      sessionStorage.setItem(
        "ergomatic.libraryFilters",
        JSON.stringify({
          types: ["AT"],
          difficulties: [],
          durations: [],
          painLevels: [],
          lastDone: null,
          source: null,
        }),
      );
      let rowsAtRestore: number | null = null;
      const scrollToSpy = vi
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {
          rowsAtRestore = document.querySelectorAll(".workout-row").length;
        });
      mockReady();
      await renderLibrary();

      expect(await screen.findByRole("list")).toBeInTheDocument();
      expect(scrollToSpy).toHaveBeenCalledWith(0, 1200);
      // 1 filtered row, not the full 3 — the restore never saw the
      // unfiltered list.
      expect(rowsAtRestore).toBe(1);
      scrollToSpy.mockRestore();
    });

    it("persists every filter change to sessionStorage as it happens", async () => {
      // TYPE left the sheet this round (library-filter-unification, Task 1
      // pulled forward) — this test used to drive its first filter change
      // through the sheet's own TYPE cell, which no longer exists there.
      // PAIN and SOURCE are still sheet groups, so they carry the same
      // "every change persists" point without pretending type filtering
      // works via a control this branch doesn't have.
      mockReady();
      await renderLibrary();
      await screen.findByRole("list");

      await openSheet();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "3",
        }),
      );
      await applySheet();
      expect(
        JSON.parse(sessionStorage.getItem("ergomatic.libraryFilters")!),
      ).toMatchObject({ painLevels: [3] });

      // GLOBAL, not CUSTOM: every WORKOUTS fixture row is isGlobal:true, so
      // adding SOURCE=global on top of the PAIN 3 filter still matches
      // w-at (proving the change persisted alongside the first, rather
      // than replacing it) instead of narrowing to zero and disabling the
      // sheet's own primary.
      await openSheet();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "GLOBAL",
        }),
      );
      await applySheet();
      expect(
        JSON.parse(sessionStorage.getItem("ergomatic.libraryFilters")!),
      ).toMatchObject({ painLevels: [3], source: "global" });

      // CLEAR ALL empties the persisted set too — a BACK after clearing
      // must not resurrect the cleared filters.
      await userEvent.click(screen.getByRole("button", { name: "CLEAR ALL" }));
      expect(
        JSON.parse(sessionStorage.getItem("ergomatic.libraryFilters")!),
      ).toMatchObject({ painLevels: [], source: null });
    });

    it("ignores a malformed stored value and mounts unfiltered", async () => {
      sessionStorage.setItem("ergomatic.libraryFilters", "not json {");
      mockReady();
      await renderLibrary();

      expect(await screen.findByRole("list")).toBeInTheDocument();
      expect(screen.getByText("3 WORKOUTS")).toBeInTheDocument();
    });

    it("ignores a v1-shaped stored value (painMax3/recency/customOnly) and mounts unfiltered", async () => {
      // The pre-Task-4 shape — falls back to EMPTY_FILTERS the same as any
      // other malformed record (libraryFilters.ts's own validator never
      // reads these field names at all).
      sessionStorage.setItem(
        "ergomatic.libraryFilters",
        JSON.stringify({
          type: "AT",
          durations: [],
          painMax3: true,
          recency: "recent",
          customOnly: false,
        }),
      );
      mockReady();
      await renderLibrary();

      expect(await screen.findByRole("list")).toBeInTheDocument();
      expect(screen.getByText("3 WORKOUTS")).toBeInTheDocument();
    });
  });

  describe("designated onboarding workouts are invisible outside onboarding (controller addendum)", () => {
    it("never renders First 6k/First 2k in the list, and excludes them from the count", async () => {
      mockReady([SEA_FRET, FIRST_6K, FIRST_2K]);
      await renderLibrary();

      expect(screen.getByText("1 WORKOUTS")).toBeInTheDocument();
      expect(screen.getByText("Sea Fret")).toBeInTheDocument();
      expect(screen.queryByText("First 6k")).not.toBeInTheDocument();
      expect(screen.queryByText("First 2k")).not.toBeInTheDocument();
      expect(visibleHrefs()).toStrictEqual(["/library/w-seafret"]);
    });

    it("excludes them from the FILTER sheet's own result count too", async () => {
      mockReady([SEA_FRET, FIRST_6K, FIRST_2K]);
      await renderLibrary();
      await openSheet();

      // Sea Fret is O2/easy — the sheet's default draft (everything
      // selected) should count exactly the one non-onboarding row, not all
      // three real global rows.
      expect(
        screen.getByRole("button", { name: /^Show 1 workout$/ }),
      ).toBeVisible();
    });

    // Final-review fix: the exclusion must key off isGlobal, not title
    // alone — a rower's own custom "First 6k" is a real, ownable workout,
    // not a stray collision with the seeded pair.
    it('a CUSTOM workout named "First 6k" (title collision, isGlobal:false) stays visible — only the GLOBAL row is excluded', async () => {
      mockReady([SEA_FRET, FIRST_6K, FIRST_2K, CUSTOM_FIRST_6K]);
      await renderLibrary();

      expect(screen.getByText("2 WORKOUTS")).toBeInTheDocument();
      expect(screen.getByText("Sea Fret")).toBeInTheDocument();
      expect(screen.queryByText("First 6k")).toBeInTheDocument();
      expect(screen.queryByText("First 2k")).not.toBeInTheDocument();
      expect(visibleHrefs()).toStrictEqual([
        "/library/w-seafret",
        "/library/w-customfirst6k",
      ]);
    });
  });
});
