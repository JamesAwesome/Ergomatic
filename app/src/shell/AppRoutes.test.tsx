import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppRoutes, { hidesTabBar } from "./AppRoutes";

vi.mock("../library/Library", () => ({
  default: () => <h1>Library</h1>,
}));
vi.mock("../today/Today", () => ({
  default: () => <h1>Today</h1>,
}));
vi.mock("../builder/BulkImport", () => ({
  default: () => <h1>Import</h1>,
}));
vi.mock("../workout/WorkoutDetail", () => ({
  default: () => <h1>Detail</h1>,
}));
vi.mock("../plan/Plan", () => ({
  default: () => <h1>Plan</h1>,
}));
vi.mock("../session/Countdown", () => ({
  default: () => <h1>Countdown</h1>,
}));
vi.mock("../session/LogSession", () => ({
  default: () => <h1>Log Session</h1>,
}));

describe("AppRoutes", () => {
  // NOT a proof of declaration order: react-router-dom 7.18.2 ranks a
  // static path segment ("import") over a dynamic one (":id") regardless of
  // which route is registered first in AppRoutes.tsx, so this test would
  // pass even with the two routes swapped. It exists purely as a regression
  // guard that /library/import renders the importer.
  it("renders the importer at /library/import", async () => {
    render(
      <MemoryRouter initialEntries={["/library/import"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Import" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Detail" }),
    ).not.toBeInTheDocument();
  });

  it("still routes a real workout id to the detail screen", async () => {
    render(
      <MemoryRouter initialEntries={["/library/w1"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Detail" }),
    ).toBeVisible();
  });

  it("redirects / to today", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
  });

  it("redirects an unmatched route to today", async () => {
    render(
      <MemoryRouter initialEntries={["/nonsense"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
  });

  it("names the phase that will fill a placeholder tab", () => {
    render(
      <MemoryRouter initialEntries={["/trend"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Phase 8/)).toBeVisible();
  });

  // Task 3 (6A) replaces the /plan placeholder with the real Plan screen —
  // regression guard that the route wiring still points there (Today's own
  // "choose a plan" link, from Task 2, targets the same path).
  it("routes /plan to the real Plan screen, not a placeholder", async () => {
    render(
      <MemoryRouter initialEntries={["/plan"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Plan" })).toBeVisible();
    expect(screen.queryByText(/Phase 8/)).not.toBeInTheDocument();
  });

  // Task 2 (6B): countdown/timer/complete own the whole viewport, so the
  // bottom tab bar is hidden for them (handoff: "Tabs are hidden during
  // countdown and timer"). Countdown is mocked here (like every other
  // screen this file already mocks) purely to keep this an AppRoutes-level
  // routing/shell test, not a re-test of Countdown's own data-loading path.
  it("hides the tab bar on /session/countdown", async () => {
    render(
      <MemoryRouter initialEntries={["/session/countdown"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Countdown" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Main" }),
    ).not.toBeInTheDocument();
  });

  // Phase 6C Task 2: the Log screen (session door) is the same full-bleed
  // holder pattern's own next step past /session/complete.
  it("hides the tab bar on /session/log", async () => {
    render(
      <MemoryRouter initialEntries={["/session/log"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Log Session" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Main" }),
    ).not.toBeInTheDocument();
  });

  it("shows the tab bar on an ordinary route (today)", async () => {
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Main" }),
    ).toBeInTheDocument();
  });
});

describe("hidesTabBar", () => {
  it.each([
    "/session/countdown",
    "/session/run",
    "/session/complete",
    "/session/log",
    // Sub-paths of a hidden prefix stay hidden too (a future param/query
    // string on any of these routes never needs its own opt-out).
    "/session/run/foo",
  ])("hides the tab bar for %s", (pathname) => {
    expect(hidesTabBar(pathname)).toBe(true);
  });

  it.each([
    "/today",
    "/library",
    "/session/confirm",
    // Prefix-match traps: neither of these should accidentally match
    // "/session/run"/"/session" via a naive substring check.
    "/session",
    "/sessions/run",
    // A hidden path appearing mid-string, not as a PREFIX: a naive
    // `.includes()` (instead of `.startsWith()`) would wrongly hide the tab
    // bar here too.
    "/library/session/countdown",
  ])("shows the tab bar for %s", (pathname) => {
    expect(hidesTabBar(pathname)).toBe(false);
  });
});
