import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AppRoutes, { CompleteRedirect, hidesTabBar } from "./AppRoutes";
import { buildDraft, saveDraft, startDraft } from "../session/draft";
import { buildFreeRowRun, buildRun } from "../session/engine";
import { saveRun } from "../session/run";
import type { AuthFlowController } from "../adapters/authFlow";

vi.mock("../library/Library", () => ({
  default: () => <h1>Library</h1>,
}));
// Phase KB: the software keyboard is the second reason the tab bar can be
// absent (the plugin's willShow/willHide, through the shell's store).
const keyboardOpen = vi.hoisted(() => ({ value: false }));
vi.mock("./keyboardOpen", () => ({
  useKeyboardOpen: () => keyboardOpen.value,
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
vi.mock("../session/Timer", () => ({
  default: () => <h1>Timer</h1>,
}));
vi.mock("../session/LogSession", () => ({
  default: () => <h1>Log Session</h1>,
}));
vi.mock("../you/Concept2Screen", () => ({
  default: () => <h1>Concept2 screen stub</h1>,
}));
vi.mock("../monitor/JustRowObserver", () => ({
  default: () => <h1>Just Row Observer</h1>,
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
vi.mock("../you/Diagnostics", () => ({
  default: () => <h1>Diagnostics</h1>,
}));
vi.mock("../you/MonitorLogs", () => ({
  default: () => <h1>Monitor Logs</h1>,
}));
beforeEach(() => {
  localStorage.clear();
});

function idleAuthFlow(): AuthFlowController {
  return {
    options: {
      state: "ready",
      frontDoorEnabled: true,
      legacyGoogle: false,
      apple: true,
      google: true,
    },
    view: { kind: "idle" },
    targetAuthorizationBusy: false,
    destination: null,
    startSignIn: vi.fn(),
    confirmAccount: vi.fn(),
    useUsualSignIn: vi.fn(),
    confirmAttach: vi.fn(),
    declineAttach: vi.fn(),
    prepareLink: vi.fn(),
    startPreparedLink: vi.fn(),
    authorizeLinkTarget: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    abandon: vi.fn(),
    removeMethod: vi.fn(),
    startDelete: vi.fn(),
    confirmDelete: vi.fn(),
  };
}

describe("AppRoutes", () => {
  // THE GATE THAT WAS MISSING, AND ITS ABSENCE LET THE WEB FLOW SHIP TWICE
  // BROKEN. `attach_confirm`'s only mount point was `SignIn`, which `App`
  // renders ONLY when `me.state === "out"`. On web the callback sets the
  // session cookie before its 303, so the return resolves `me` IN and
  // `AppRoutes` renders instead — and nothing in the suite rendered this
  // tree with that view. The first fix made the client set the view; it
  // still had no frame.
  it("PR2: the attach confirmation has a frame in the SIGNED-IN tree", () => {
    const auth = idleAuthFlow();
    auth.view = {
      kind: "attach_confirm",
      targetProvider: "apple",
      carried: { email: "9m3x@privaterelay.appleid.com", name: "Rower" },
      account: { id: "u1", email: "maya@example.com", name: "Maya Chen" },
    };
    render(
      <MemoryRouter initialEntries={["/you/sign-in-methods"]}>
        <AppRoutes
          user={{ id: "u1", email: "maya@example.com", name: "Maya Chen" }}
          onSignedOut={vi.fn()}
          authFlow={auth}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Attach Apple to this account?" }),
    ).toBeVisible();
    expect(screen.getByText("9m3x@privaterelay.appleid.com")).toBeVisible();
    expect(screen.getByText("maya@example.com")).toBeVisible();
  });

  // AND IT SURVIVES ITS OWN REQUEST. `confirmAttach` flips the view to a
  // `busy` that CARRIES the same two identities forward; if the route drops
  // the screen there, the disabled controls are an attribute on something
  // already unmounted — which is what `disabled={busy}` was before this.
  it("PR2: the confirmation stays mounted, and disabled, while its request runs", () => {
    const auth = idleAuthFlow();
    auth.view = {
      kind: "attach_confirm",
      targetProvider: "apple",
      carried: { email: "9m3x@privaterelay.appleid.com", name: "Rower" },
      account: { id: "u1", email: "maya@example.com", name: "Maya Chen" },
    };
    const { rerender } = render(
      <MemoryRouter initialEntries={["/you/sign-in-methods"]}>
        <AppRoutes
          user={{ id: "u1", email: "maya@example.com", name: "Maya Chen" }}
          onSignedOut={vi.fn()}
          authFlow={auth}
        />
      </MemoryRouter>,
    );
    const busy = {
      ...auth,
      view: {
        kind: "busy",
        purpose: "signin",
        attaching: {
          targetProvider: "apple",
          carried: { email: "9m3x@privaterelay.appleid.com", name: "Rower" },
          account: { id: "u1", email: "maya@example.com", name: "Maya Chen" },
        },
      } as const,
    };
    rerender(
      <MemoryRouter initialEntries={["/you/sign-in-methods"]}>
        <AppRoutes
          user={{ id: "u1", email: "maya@example.com", name: "Maya Chen" }}
          onSignedOut={vi.fn()}
          authFlow={busy}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Attach Apple to this account?" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Attach Apple" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
  });

  // AND A `busy` THAT IS NOT THIS FLOW'S DOES NOT GET THE SCREEN. The web
  // link and delete SUCCESS redirect carries no `authPurpose`, so a
  // signed-in rower mid-link sits at `busy`/`signin` — a view this predicate
  // used to own. Owning it shadowed the route's own `<Navigate to="/you">`
  // fallback with a component that had nothing to draw. The rower belongs on
  // You, which is where the link notice is.
  it("PR2: a signin busy that carries no identities falls through to You", () => {
    const auth = idleAuthFlow();
    auth.view = { kind: "busy", purpose: "signin" };
    render(
      <MemoryRouter initialEntries={["/you/sign-in-methods"]}>
        <AppRoutes
          user={{ id: "u1", email: "maya@example.com", name: "Maya Chen" }}
          onSignedOut={vi.fn()}
          authFlow={auth}
        />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("heading", { name: "Attach Apple to this account?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You" })).toBeVisible();
  });

  it("keeps an invalid selected review at its honest unavailable state rather than redirecting to Today", async () => {
    render(
      <MemoryRouter initialEntries={["/session/review?source=monitor"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Recording unavailable" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute(
      "href",
      "/today",
    );
  });
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
  // Phase SB: the strip behind the status bar is one element, always
  // present in the signed-in shell, inert to taps, and never announced.
  it("renders the status-bar backdrop once, inert and hidden from assistive tech", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/library"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Library" });
    const strips = container.querySelectorAll(".status-backdrop");
    expect(strips).toHaveLength(1);
    expect(strips[0]).toHaveAttribute("aria-hidden", "true");
  });

  it("hides the tab bar on /library while the software keyboard is up, and shows it again when it goes", async () => {
    keyboardOpen.value = true;
    const { rerender } = render(
      <MemoryRouter initialEntries={["/library"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Library" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Main" }),
    ).not.toBeInTheDocument();
    keyboardOpen.value = false;
    rerender(
      <MemoryRouter initialEntries={["/library"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Main" })).toBeVisible();
  });

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

  it("renders the build-enabled Just Row observer without the main tab bar", async () => {
    render(
      <MemoryRouter initialEntries={["/justrow/observe"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Just Row Observer" }),
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

  // Task 3 (Gate 0 rev 2/3): the diagnostics door, behind the same
  // signed-in guard as /you itself.
  it("routes /you/diagnostics and /you/diagnostics/monitor-logs when signed in", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    render(
      <MemoryRouter initialEntries={["/you/diagnostics"]}>
        <AppRoutes user={user} onSignedOut={() => {}} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Diagnostics" }),
    ).toBeVisible();

    render(
      <MemoryRouter initialEntries={["/you/diagnostics/monitor-logs"]}>
        <AppRoutes user={user} onSignedOut={() => {}} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Monitor Logs" }),
    ).toBeVisible();
  });

  // Wave E PR A: the Concept2 screen behind You's CONCEPT2 row, behind the
  // same signed-in guard. The screen itself is stubbed — its own file tests
  // its states; this pins only that the route exists and is signed-in only.
  it("routes /you/concept2 when signed in", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    render(
      <MemoryRouter initialEntries={["/you/concept2"]}>
        <AppRoutes user={user} onSignedOut={() => {}} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Concept2 screen stub" }),
    ).toBeVisible();
  });

  it("redirects a signed-in idle remount of /you/sign-in-methods through the router to You", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    render(
      <MemoryRouter initialEntries={["/you/sign-in-methods"]}>
        <AppRoutes
          user={user}
          onSignedOut={() => {}}
          authFlow={idleAuthFlow()}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "You" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeVisible();
  });

  // THE ACCOUNT DOOR'S OTHER HALF (account-submenu spec §4, invariant D1).
  // You draws the ACCOUNT row only when `accountDoorAvailable` is true; this
  // route must refuse under exactly the same condition, or a deep link, a
  // bookmark, or an options flip mid-session reaches a screen the rower has
  // no door to. Mounted for REAL, like /you/settings below: the screen is a
  // frame around `SignInMethods`, whose own read fails harmlessly under
  // jsdom and leaves the headings this asserts on.
  it("routes /you/account when signed in and the front door is on", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    render(
      <MemoryRouter initialEntries={["/you/account"]}>
        <AppRoutes
          user={user}
          onSignedOut={() => {}}
          authFlow={idleAuthFlow()}
        />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Account", level: 1 }),
    ).toBeVisible();
    // The tab bar stays, as on every other /you/* door — /you/account is NOT
    // in HIDDEN_TABBAR_PREFIXES, unlike the flow-only /you/sign-in-methods.
    expect(screen.getByRole("navigation", { name: "Main" })).toBeVisible();
  });

  // AN UNANSWERED OPTIONS READ IS NOT A REFUSAL. A direct arrival — a
  // bookmark, a deep link, or an OAuth return, which lands here now — hits
  // this route before the controller's own read resolves. Sharing the
  // door's predicate bounced every one of them to You: measured in
  // `appleAuth.spec.ts`'s refusal leg, which found no `Remove Apple` at all
  // because the redirect had already fired.
  it("keeps /you/account mounted while the options read is still in flight", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    const auth = idleAuthFlow();
    auth.options = { state: "loading" };
    render(
      <MemoryRouter initialEntries={["/you/account"]}>
        <AppRoutes user={user} onSignedOut={() => {}} authFlow={auth} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Account", level: 1 }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "You" })).toBeNull();
  });

  it("redirects /you/account to You when the host's front door is off", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    const auth = idleAuthFlow();
    auth.options = {
      state: "ready",
      frontDoorEnabled: false,
      legacyGoogle: true,
      apple: false,
      google: true,
    };
    render(
      <MemoryRouter initialEntries={["/you/account"]}>
        <AppRoutes user={user} onSignedOut={() => {}} authFlow={auth} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "You" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Account" })).toBeNull();
  });

  it("redirects /you/account to You when there is no auth flow to serve it", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    render(
      <MemoryRouter initialEntries={["/you/account"]}>
        <AppRoutes user={user} onSignedOut={() => {}} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "You" })).toBeVisible();
  });

  it("wildcards /you/account to Today when signed out", async () => {
    render(
      <MemoryRouter initialEntries={["/you/account"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
  });

  // Phase JC (Gate 0, 2026-09-08): the judged-colour settings screen behind
  // You's SETTINGS row, behind the same signed-in guard. Mounted for REAL
  // rather than stubbed like Diagnostics/Concept2Screen above — the screen
  // reads localStorage and nothing else, so a real mount costs nothing and
  // proves the route serves the actual screen instead of a route string.
  it("routes /you/settings when signed in", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    render(
      <MemoryRouter initialEntries={["/you/settings"]}>
        <AppRoutes user={user} onSignedOut={() => {}} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("radiogroup", { name: "Pace faster color" }),
    ).toBeInTheDocument();
  });

  // Signed OUT, the door and its screen are both absent: the wildcard
  // resolves a typed /you/settings to Today, exactly as it does for /you.
  it("wildcards /you/settings to Today when signed out", async () => {
    render(
      <MemoryRouter initialEntries={["/you/settings"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
  });

  // James's 2026-08-23 ruling removed /you/learning (LearningTheApp) —
  // an old bookmark or stale client lands on the signed-in wildcard and
  // resolves to Today rather than 404ing.
  it("wildcards the removed /you/learning route to Today even when signed in", async () => {
    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
    render(
      <MemoryRouter initialEntries={["/you/learning"]}>
        <AppRoutes user={user} onSignedOut={() => {}} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
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

// Fast-follow spec §3, entry 6: `/session/confirm` is a redirect shim now —
// ConfirmTargets is deleted, but stale deep links and browser back-swipes to
// this URL are documented real (`monitorRun.ts`'s own doc comment). Three
// arms, each keyed on what's actually sitting in storage — never on the URL
// itself, since nothing hits this route on purpose any more.
describe("/session/confirm redirect shim", () => {
  it("a SessionRun on record (the session genuinely got past the countdown) redirects to /session/run", async () => {
    const draft = startDraft(
      buildDraft({
        id: "w1",
        title: "Shim Test Workout",
        type: "AN",
        steps: [{ k: "r", minutes: 5 }],
      }),
    );
    saveDraft(draft);
    saveRun(buildRun(draft, null, new Date("2026-08-11T12:00:00.000Z")));

    render(
      <MemoryRouter initialEntries={["/session/confirm"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Timer" })).toBeVisible();
  });

  it("a draft with no run yet (queued, the count hasn't run) redirects to /session/countdown", async () => {
    saveDraft(
      startDraft(
        buildDraft({
          id: "w1",
          title: "Shim Test Workout",
          type: "AN",
          steps: [{ k: "r", minutes: 5 }],
        }),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/session/confirm"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Countdown" }),
    ).toBeVisible();
  });

  it("nothing at all in storage redirects to /today, the same fallback every other dead deep link uses", async () => {
    render(
      <MemoryRouter initialEntries={["/session/confirm"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
  });
});

// Post-workout-summary spec §3 (Task 5): `/session/complete` is a redirect
// shim now — SessionComplete is deleted, but stale deep links and browser
// back-swipes to this URL are real (the `/session/confirm` -> ConfirmRedirect
// precedent this mirrors). Two arms, keyed on what's actually sitting in
// storage — never on the URL itself, since Timer.tsx's finish stage no
// longer navigates here on purpose.
describe("/session/complete redirect shim", () => {
  it("a completed SessionRun on record redirects to /session/log (the summary)", async () => {
    const draft = startDraft(
      buildDraft({
        id: "w1",
        title: "Complete Shim Test Workout",
        type: "AN",
        steps: [{ k: "r", minutes: 5 }],
      }),
    );
    saveDraft(draft);
    const built = buildRun(draft, null, new Date("2026-08-17T12:00:00.000Z"));
    saveRun({
      ...built,
      index: built.phases.length,
      completedAt: new Date("2026-08-17T12:05:00.000Z").toISOString(),
    });

    render(
      <MemoryRouter initialEntries={["/session/complete"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Log Session" }),
    ).toBeVisible();
  });

  it("no run, or a run that isn't actually complete, redirects to /today", async () => {
    render(
      <MemoryRouter initialEntries={["/session/complete"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
  });

  it("an incomplete SessionRun (mid-session deep link) also redirects to /today, not the summary", async () => {
    const draft = startDraft(
      buildDraft({
        id: "w1",
        title: "Complete Shim Incomplete Workout",
        type: "AN",
        steps: [{ k: "r", minutes: 5 }],
      }),
    );
    saveDraft(draft);
    saveRun(buildRun(draft, null, new Date("2026-08-17T12:00:00.000Z")));

    render(
      <MemoryRouter initialEntries={["/session/complete"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Today" })).toBeVisible();
  });

  // Just Row without the monitor (spec 2026-09-02 ⟨F9⟩): a completed
  // free-row run belongs to the Just Row log door. Rendered in ISOLATION
  // with stub routes — see the export's own comment for why the full
  // shell cannot tell this arm from the no-run arm yet.
  describe("a completed mode-justrow run (no draft)", () => {
    function renderShim() {
      return render(
        <MemoryRouter initialEntries={["/session/complete"]}>
          <Routes>
            <Route path="/session/complete" element={<CompleteRedirect />} />
            <Route path="/session/log" element={<p>SUMMARY SCREEN</p>} />
            <Route path="/justrow/log" element={<p>JUST ROW LOG SCREEN</p>} />
            <Route path="/today" element={<p>TODAY SCREEN</p>} />
          </Routes>
        </MemoryRouter>,
      );
    }

    it("redirects to /justrow/log, never the workout summary", async () => {
      const run = buildFreeRowRun(new Date("2026-09-02T12:00:00.000Z"));
      saveRun({
        ...run,
        index: 1,
        actuals: {
          0: { actualSource: "stopwatch-elapsed", elapsedSeconds: 754 },
        },
        completedAt: "2026-09-02T12:12:34.000Z",
      });

      renderShim();

      expect(await screen.findByText("JUST ROW LOG SCREEN")).toBeVisible();
      expect(screen.queryByText("SUMMARY SCREEN")).not.toBeInTheDocument();
    });

    it("a LIVE free-row run (mid-row deep link) still redirects to /today", async () => {
      saveRun(buildFreeRowRun(new Date("2026-09-02T12:00:00.000Z")));

      renderShim();

      expect(await screen.findByText("TODAY SCREEN")).toBeVisible();
    });
  });
});

describe("hidesTabBar", () => {
  it.each([
    "/session/countdown",
    "/session/run",
    "/session/complete",
    "/session/log",
    "/justrow/observe",
    // Wave A: the linking flow is the same full-bleed holder pattern, and it
    // was added to HIDDEN_TABBAR_PREFIXES with no row here — so deleting the
    // string was green.
    "/you/sign-in-methods",
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
    // PR 0a hides only the observer instrument. The eventual product route
    // keeps its shell decision for PR 2.
    "/justrow",
  ])("shows the tab bar for %s", (pathname) => {
    expect(hidesTabBar(pathname)).toBe(false);
  });
});
