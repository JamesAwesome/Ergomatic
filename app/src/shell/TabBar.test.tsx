import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TabBar, { TABS } from "./TabBar";

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
});
