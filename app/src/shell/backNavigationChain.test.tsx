import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
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
    difficulty: w.difficulty,
    pain: w.pain,
    steps: w.steps,
    isGlobal: false,
    lastDoneDaysAgo: 5,
  };
}

const WORKOUT = personalWorkout("Sea Fret", "w1");

function mockHooks() {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts: [WORKOUT] }),
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
        difficulties: ["easy", "medium", "hard"],
        timeCapMinutes: 60,
        warmup: null,
      },
    }),
  }));
  vi.doMock("../api/useRecentLogs", () => ({
    useRecentLogs: () => ({ state: "ready", logs: [] }),
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
