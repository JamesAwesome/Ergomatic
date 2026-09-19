import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import type { LibraryWorkout } from "../api/useWorkouts";

// The recorded bug this task round fixes, exercised end to end through the
// REAL routed screens (not stubs) — Today, WorkoutDetail, EditWorkout, and
// Builder all wired together via the real AppRoutes, so a wiring mistake in
// any ONE of them (e.g. forgetting `state={{from:"/today"}}` on Today's own
// suggestion card) fails here even though each screen's own test file
// already covers its own link/link-forwarding in isolation.
//
// The chain (design doc: "Chains preserve the ORIGINAL origin"):
//   Today -> detail (from=/today)
//         -> edit (detail forwards its OWN received `from`, not its own
//            pathname, so edit's state is still {from:"/today"})
//         -> BACK (edit's own back link is fixed to the specific workout's
//            detail page, forwarding {from:"/today"} onward)
//         -> detail (now re-entered with that forwarded state)
//         -> BACK (detail's own BackLink reads it: {from:"/today"})
//         -> Today.
const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function personalWorkout(title: string, id: string): LibraryWorkout {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  // isGlobal: false — Edit/Delete (OwnerActions) only render for a workout
  // the rower owns; a library entry's real, already-reviewed step shape
  // (rather than a hand-built minimum) is what a realistic PERSONAL workout
  // would still look like content-wise.
  return {
    id,
    title: w.title,
    type: w.type,
    effort: w.effort,
    steps: w.steps,
    isGlobal: false,
    lastDoneDaysAgo: 5,
  };
}

const WORKOUT = personalWorkout("Sea Fret", "w1");

function mockHooks(workouts: LibraryWorkout[] = [WORKOUT]) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines: BASELINES }),
  }));
  vi.doMock("../api/usePlan", () => ({
    usePlan: () => ({
      state: "ready",
      plan: { planKey: null, doneN: 0, sequence: [] },
    }),
  }));
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () => ({
      state: "ready",
      preferences: {
        timeCapMinutes: 60,
      },
    }),
  }));
  vi.doMock("../api/useRecentLogs", () => ({
    useRecentLogs: () => ({ state: "ready", logs: [] }),
  }));
  // You.tsx's own read-count row — kept in the unknown state, which
  // renders bare "START HERE" with no fetch attempted against jsdom.
  vi.doMock("../api/useArticleReads", () => ({
    useArticleReads: () => ({ state: "loading" }),
  }));
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("history-aware BACK: the full Today -> detail -> edit round trip", () => {
  it("returns to Today after BACK twice, through the real routed screens", async () => {
    mockHooks();
    const { default: AppRoutes } = await import("./AppRoutes");
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    // Today -> detail, carrying state={from:"/today"} (Today.tsx's own
    // suggestion-card Link).
    await userEvent.click(screen.getByRole("link", { name: /Sea Fret/ }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sea Fret" }),
    ).toBeVisible();

    // detail -> edit, forwarding detail's OWN received `from` ("/today"),
    // not detail's own pathname ("/library/w1") — WorkoutDetail.tsx's Edit
    // link.
    await userEvent.click(screen.getByRole("link", { name: "Edit" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Edit workout" }),
    ).toBeVisible();

    // First BACK: edit's own back link is fixed to this workout's detail
    // page (Builder.tsx, edit mode), forwarding the origin it received.
    await userEvent.click(screen.getByRole("link", { name: "← BACK" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sea Fret" }),
    ).toBeVisible();

    // Second BACK: detail's own BackLink now has the forwarded "/today" to
    // return to, landing on Today — not the /library fallback every ←
    // BACK link used before this fix (the recorded bug).
    await userEvent.click(screen.getByRole("link", { name: "← BACK" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
  });
});

// James's tester feedback on the re-test shortcut (2026-08-22): "Make
// sure back takes you to the You screen." Same real-AppRoutes wiring
// proof as the Today chain above — RetestShortcut's own Link must carry
// state={{from:"/you/baselines"}} and WorkoutDetail's BackLink must read
// it; a dropped `from` collapses BACK to the /library fallback and fails
// here. The origin is `/you/baselines` since the editor and this shortcut
// moved off You (Gate 0, 2026-09-05); this round trip is also the one
// place the new route is exercised through the REAL AppRoutes.
// (The detail -> edit -> back -> detail leg is untestable for THIS origin
// on purpose: the designated tests are GLOBAL rows, and OwnerActions
// renders no Edit link for a workout the rower doesn't own — the
// forwarding it would exercise is origin-value-agnostic and pinned by the
// /today round trip above.)
describe("history-aware BACK: the baselines re-test shortcut -> detail round trip", () => {
  it("returns to the baselines screen after BACK from the designated test's detail", async () => {
    const seed = ONBOARDING_LIBRARY_WORKOUTS.find(
      (w) => w.title === "6K Test",
    )!;
    mockHooks([
      WORKOUT,
      {
        id: "w-6k",
        title: seed.title,
        type: seed.type,
        effort: seed.effort,
        steps: seed.steps,
        isGlobal: true,
        lastDoneDaysAgo: null,
      },
    ]);
    const { default: AppRoutes } = await import("./AppRoutes");
    render(
      <MemoryRouter initialEntries={["/you/baselines"]}>
        <AppRoutes
          user={{ id: "u1", email: "rower@e2e.test", name: "Row Er" }}
          onSignedOut={() => {}}
        />
      </MemoryRouter>,
    );

    // Baselines -> detail, carrying state={from:"/you/baselines"}
    // (RetestShortcut's Link).
    await userEvent.click(screen.getByRole("link", { name: "ROW THE 6K" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "6K Test" }),
    ).toBeVisible();

    // BACK reads the carried origin: the baselines screen the shortcut is
    // rendered on, never the /library fallback.
    await userEvent.click(screen.getByRole("link", { name: "← BACK" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Baselines" }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Library" })).toBeNull();
  });
});

// THE ACCOUNT DOOR'S ROUND TRIP, starting UPSTREAM of the producer (RF24).
// You writes `state={{ from: "/you" }}` on the ACCOUNT row and
// `AccountScreen`'s BackLink reads it; both halves have their own tests, and
// neither can see the other. This leg begins before the write and asserts
// after the read, through the real routed screens, so a row that forgets its
// state — or a screen whose fallback quietly carries the trip instead — is
// visible here. The fallback IS `/you` too, so the assertion below is on the
// ROUTE the rower reaches, and the case that distinguishes them is the
// `from`-less deep link covered in `AccountScreen.test.tsx`.
describe("history-aware BACK: the You -> ACCOUNT round trip", () => {
  it("returns to You after BACK from the account screen, through the real routed screens", async () => {
    mockHooks();
    // The two reads this leg's screens make, answered in-process: You's
    // Concept2 row and the account screen's methods list. Through the REAL
    // `api` they are relative-URL fetches, which reject under jsdom and
    // land as unhandled rejections after the assertions — green tests, red
    // job.
    vi.doMock("../api", () => ({
      api: vi.fn(async (path: string) =>
        path === "/api/auth/methods"
          ? new Response(JSON.stringify({ apple: false, google: true }), {
              status: 200,
            })
          : new Response(JSON.stringify({ available: false }), { status: 200 }),
      ),
    }));
    const { default: AppRoutes } = await import("./AppRoutes");
    const authFlow = {
      options: {
        state: "ready" as const,
        frontDoorEnabled: true,
        legacyGoogle: false,
        apple: true,
        google: true,
      },
      view: { kind: "idle" as const },
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
    render(
      <MemoryRouter initialEntries={["/you"]}>
        <AppRoutes
          user={{ id: "u1", email: "rower@e2e.test", name: "Row Er" }}
          onSignedOut={() => {}}
          authFlow={authFlow}
        />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole("link", { name: /ACCOUNT/ }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Account" }),
    ).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "SIGN-IN METHODS" }),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("link", { name: "← BACK" }));
    expect(await screen.findByText("rower@e2e.test")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Account" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Library" })).toBeNull();
  });
});
