import { beforeEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TabBar, { TABS } from "./TabBar";
import { LIBRARY_FILTERS_KEY } from "../library/libraryFilters";
import { LIBRARY_SCROLL_KEY } from "../library/libraryScroll";
import { NEWS_SCROLL_KEY } from "../news/newsScroll";
import { LOG_SCROLL_KEY } from "../log/logScroll";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TabBar />
    </MemoryRouter>,
  );
}

describe("TabBar", () => {
  it("renders all five tabs in handoff order", () => {
    renderAt("/library");
    expect(TABS.map((t) => t.label)).toStrictEqual([
      "TODAY",
      "NEWS",
      "LIBRARY",
      "PLAN",
      "YOU",
    ]);
    for (const tab of TABS) {
      expect(screen.getByRole("link", { name: tab.label })).toBeInTheDocument();
    }
  });

  // Phase 6H: News takes the second slot, Trend folds into You (design §8) —
  // TREND never renders as a tab again.
  it("renders no tab labelled TREND", () => {
    renderAt("/library");
    expect(
      screen.queryByRole("link", { name: "TREND" }),
    ).not.toBeInTheDocument();
  });

  it("marks only the active tab as current", () => {
    renderAt("/you");
    expect(screen.getByRole("link", { name: "YOU" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "LIBRARY" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the active tab marked on nested detail routes", () => {
    renderAt("/library/abc-123");
    expect(screen.getByRole("link", { name: "LIBRARY" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  describe("Library tab tap clears the saved return state (scroll + filters)", () => {
    const SAVED_FILTERS = JSON.stringify({
      type: "AT",
      durations: [],
      painLevels: [],
      lastDone: null,
      source: null,
    });

    beforeEach(() => sessionStorage.clear());

    it("removes BOTH the saved position and the saved filters — clearing one without the other would restore a position measured against a different list", async () => {
      sessionStorage.setItem(LIBRARY_SCROLL_KEY, "999");
      sessionStorage.setItem(LIBRARY_FILTERS_KEY, SAVED_FILTERS);
      renderAt("/you");

      await userEvent.click(screen.getByRole("link", { name: "LIBRARY" }));

      expect(sessionStorage.getItem(LIBRARY_SCROLL_KEY)).toBeNull();
      expect(sessionStorage.getItem(LIBRARY_FILTERS_KEY)).toBeNull();
    });

    it("leaves other tabs' clicks alone (no accidental clear from an unrelated tab)", async () => {
      sessionStorage.setItem(LIBRARY_SCROLL_KEY, "999");
      sessionStorage.setItem(LIBRARY_FILTERS_KEY, SAVED_FILTERS);
      renderAt("/library");

      await userEvent.click(screen.getByRole("link", { name: "TODAY" }));

      expect(sessionStorage.getItem(LIBRARY_SCROLL_KEY)).toBe("999");
      expect(sessionStorage.getItem(LIBRARY_FILTERS_KEY)).toBe(SAVED_FILTERS);
    });
  });

  // CL item / ROADMAP "News scroll memory" — same clear-on-fresh-tap
  // reasoning as Library's own block above: News's own `BackLink`/✕
  // returns and the tab bar's `<NavLink>` all navigate to "/news" with no
  // `location.state`, so News's mount can't tell a BACK return from a
  // fresh tab tap apart (`newsScroll.ts`'s own doc comment). Clearing here,
  // at the one link that IS unambiguously a fresh visit, is the
  // distinction.
  describe("NEWS tab tap clears the saved scroll position", () => {
    beforeEach(() => sessionStorage.clear());

    it("removes the saved News scroll position", async () => {
      sessionStorage.setItem(NEWS_SCROLL_KEY, "777");
      renderAt("/you");

      await userEvent.click(screen.getByRole("link", { name: "NEWS" }));

      expect(sessionStorage.getItem(NEWS_SCROLL_KEY)).toBeNull();
    });

    it("leaves other tabs' clicks alone (no accidental clear from an unrelated tab)", async () => {
      sessionStorage.setItem(NEWS_SCROLL_KEY, "777");
      renderAt("/news");

      await userEvent.click(screen.getByRole("link", { name: "TODAY" }));

      expect(sessionStorage.getItem(NEWS_SCROLL_KEY)).toBe("777");
    });

    it("does not touch Library's own saved return state (independent keys, independent clears)", async () => {
      sessionStorage.setItem(NEWS_SCROLL_KEY, "777");
      sessionStorage.setItem(LIBRARY_SCROLL_KEY, "999");
      renderAt("/you");

      await userEvent.click(screen.getByRole("link", { name: "NEWS" }));

      expect(sessionStorage.getItem(NEWS_SCROLL_KEY)).toBeNull();
      expect(sessionStorage.getItem(LIBRARY_SCROLL_KEY)).toBe("999");
    });
  });

  // From-the-log spec (2026-08-18), §4 N7 — same clear-on-fresh-tap
  // reasoning as Library's/News's own blocks above: a fresh visit to
  // /today/log through the ALL SESSIONS heading link must never restore a
  // stale offset from a previous visit, and the TODAY tab tap is the one
  // link that's unambiguously a fresh visit.
  describe("TODAY tab tap clears the saved log-history scroll position", () => {
    beforeEach(() => sessionStorage.clear());

    it("removes the saved log-history scroll position", async () => {
      sessionStorage.setItem(LOG_SCROLL_KEY, "623");
      renderAt("/you");

      await userEvent.click(screen.getByRole("link", { name: "TODAY" }));

      expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBeNull();
    });

    it("leaves other tabs' clicks alone (no accidental clear from an unrelated tab)", async () => {
      sessionStorage.setItem(LOG_SCROLL_KEY, "623");
      renderAt("/today");

      await userEvent.click(screen.getByRole("link", { name: "LIBRARY" }));

      expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("623");
    });
  });
});
