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
vi.mock("../news/News", () => ({
  default: () => <h1>News</h1>,
}));
vi.mock("../news/Reader", () => ({
  default: () => <h1>Reader</h1>,
}));
vi.mock("../news/Releases", () => ({
  default: () => <h1>Releases</h1>,
}));
vi.mock("../You", () => ({
  default: () => <h1>You</h1>,
}));
vi.mock("../you/LearningTheApp", () => ({
  default: () => <h1>Learning The App</h1>,
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

  // Phase 6H Task 5: News takes the second tab slot; /trend is retired (Trend
  // folds into You per the handoff) and now falls through the catch-all,
  // same as any other unmatched route.
  it("renders the News screen at /news", async () => {
    render(
      <MemoryRouter initialEntries={["/news"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "News" })).toBeVisible();
  });

  // Task 6: the reader route.
  it("renders the reader at /news/baselines", async () => {
    render(
      <MemoryRouter initialEntries={["/news/baselines"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Reader" }),
    ).toBeVisible();
  });

  // Task 6: /news/releases is registered before /news/:slug so it is never
  // captured as a slug param — this is the regression guard for that (same
  // spirit as the /library/import-before-/library/:id test above).
  it("renders the release-notes list at /news/releases, not the reader", async () => {
    render(
      <MemoryRouter initialEntries={["/news/releases"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Releases" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Reader" }),
    ).not.toBeInTheDocument();
  });

  it("/trend falls through to the catch-all and lands on Today, not a placeholder", async () => {
    render(
      <MemoryRouter initialEntries={["/trend"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
    expect(screen.queryByText(/Phase 8/)).not.toBeInTheDocument();
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

  // Task 3: the manual door reuses the SAME LogSession component as
  // /session/log, distinguished by AppRoutes' own registration of a second
  // route (`/library/:id/log`) rather than a separate screen module — this
  // is a regression guard that the route wiring actually points there.
  it("routes /library/:id/log to LogSession (the manual door)", async () => {
    render(
      <MemoryRouter initialEntries={["/library/w1/log"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Log Session" }),
    ).toBeVisible();
  });

  // Unlike the session door, this route's tab bar stays visible — corrected
  // by the whole-branch review (IMP-2), same as AppRoutes.tsx's own comment
  // on this route registration: this used to be justified by "the manual
  // door has no Discard button to back out with," which stopped being the
  // real reason once a `BackLink` was added to this door's main state too.
  // The tab bar staying visible here is independent of that — this route
  // touches no storage at all, so there's nothing dangling for an early
  // exit to leave behind either way.
  it("shows the tab bar on /library/:id/log (the manual door), unlike the session door", async () => {
    render(
      <MemoryRouter initialEntries={["/library/w1/log"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Log Session" }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Main" }),
    ).toBeInTheDocument();
  });

  // Task 7 (Phase 6I): /you/learning is registered inside the SAME
  // `user && onSignedOut` conditional as /you — a signed-out render (no
  // user/onSignedOut prop, this file's own convention throughout) must
  // wildcard it to Today exactly like /you itself, never render
  // LearningTheApp for a rower AppRoutes doesn't know is signed in.
  it("wildcards /you/learning to Today when signed out (no user prop)", async () => {
    render(
      <MemoryRouter initialEntries={["/you/learning"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Learning The App" }),
    ).not.toBeInTheDocument();
  });

  it("renders LearningTheApp at /you/learning when signed in", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    render(
      <MemoryRouter initialEntries={["/you/learning"]}>
        <AppRoutes user={user} onSignedOut={() => {}} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Learning The App" }),
    ).toBeVisible();
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
    // Task 3: the manual door — deliberately NOT added to
    // HIDDEN_TABBAR_PREFIXES (see AppRoutes.tsx's own comment on this
    // route), unlike its session-door sibling "/session/log" above.
    "/library/w1/log",
  ])("shows the tab bar for %s", (pathname) => {
    expect(hidesTabBar(pathname)).toBe(false);
  });
});
