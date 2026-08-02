import { beforeEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TabBar, { TABS } from "./TabBar";
import { LIBRARY_FILTERS_KEY } from "../library/libraryFilters";
import { LIBRARY_SCROLL_KEY } from "../library/libraryScroll";

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
      "LIBRARY",
      "PLAN",
      "TREND",
      "YOU",
    ]);
    for (const tab of TABS) {
      expect(screen.getByRole("link", { name: tab.label })).toBeInTheDocument();
    }
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
      painMax3: false,
      recency: null,
      customOnly: false,
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
});
