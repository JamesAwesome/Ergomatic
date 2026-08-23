import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import type { LibraryWorkout } from "../api/useWorkouts";
import { buildDraft, loadDraft, saveDraft, startDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { loadRun, saveRun } from "../session/run";

// Phase BL PR B (baseline-onboarding spec rev 2, "The You-screen re-test
// shortcut"): row the 6k / race the 2k beside the baseline fields,
// reusing useStartWorkout's start guards — NOT BaselineCard (the card
// refuses to render for a both-set account; the You screen must offer the
// shortcut to exactly that account).

// The two REAL designated seed workouts as the library rows the You
// screen would fetch.
function seedWorkout(
  title: string,
  overrides: Partial<LibraryWorkout> = {},
): LibraryWorkout {
  const seed = ONBOARDING_LIBRARY_WORKOUTS.find((w) => w.title === title)!;
  return {
    id: `id-${title.replace(/\s/g, "-").toLowerCase()}`,
    title: seed.title,
    type: seed.type,
    difficulty: seed.difficulty,
    pain: seed.pain,
    steps: seed.steps,
    isGlobal: true,
    lastDoneDaysAgo: null,
    ...overrides,
  };
}

function mockWorkouts(
  state:
    | { state: "loading" }
    | { state: "error"; retry: () => void }
    | { state: "ready"; workouts: LibraryWorkout[] },
) {
  vi.doMock("../api/useWorkouts", () => ({ useWorkouts: () => state }));
}

async function renderShortcut() {
  const { default: RetestShortcut } = await import("./RetestShortcut");
  return render(
    <MemoryRouter initialEntries={["/you"]}>
      <Routes>
        <Route path="/you" element={<RetestShortcut />} />
        <Route path="/session/countdown" element={<p>COUNTDOWN SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("RetestShortcut", () => {
  it("offers both tests when the two designated global rows exist", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderShortcut();
    expect(
      screen.getByRole("button", { name: "ROW THE 6K" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "RACE THE 2K" }),
    ).toBeInTheDocument();
  });

  it("one tap starts the 6K Test for real: draft saved, countdown reached", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderShortcut();
    await userEvent.click(screen.getByRole("button", { name: "ROW THE 6K" }));

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.title).toBe(ONBOARDING_TITLES.k6);
    expect(draft!.startedAt).not.toBeNull();
  });

  it("racing the 2k starts the 2K Test, not the 6k", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderShortcut();
    await userEvent.click(screen.getByRole("button", { name: "RACE THE 2K" }));
    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    expect(loadDraft()!.title).toBe(ONBOARDING_TITLES.k2);
  });

  // useStartWorkout's own F5 data-loss guard, proven to actually be wired
  // through this surface — the whole reason the spec says "reuses
  // useStartWorkout's start guards", not a bare navigate-and-start.
  it("an unlogged completed session stages the replace confirm; Cancel keeps it, Replace clears it and starts", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    // A REAL completed-but-unlogged run built through the real pipeline.
    const seed = ONBOARDING_LIBRARY_WORKOUTS.find(
      (w) => w.title === ONBOARDING_TITLES.k2,
    )!;
    const started = startDraft(
      buildDraft({
        id: "id-unlogged",
        title: seed.title,
        type: seed.type,
        steps: seed.steps,
      }),
    );
    saveDraft(started);
    const built = buildRun(started, null, new Date("2026-08-22T10:00:00Z"));
    saveRun({
      ...built,
      index: built.phases.length,
      completedAt: "2026-08-22T10:08:00.000Z",
      actuals: {},
    });

    await renderShortcut();
    await userEvent.click(screen.getByRole("button", { name: "ROW THE 6K" }));
    expect(
      screen.getByText(
        "You have an unlogged session. Starting a new one discards it.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(loadRun()).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "ROW THE 6K" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ROW THE 6K" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Replace session" }),
    );
    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    expect(loadRun()).toBeNull();
    expect(loadDraft()!.title).toBe(ONBOARDING_TITLES.k6);
  });

  // domain/onboarding.ts's own identity rule, again: a rower's custom row
  // sharing the title is not the designated test and gets no shortcut.
  it("ignores a rower's own custom workout that shares a test title", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2, { isGlobal: false }),
      ],
    });
    await renderShortcut();
    expect(
      screen.getByRole("button", { name: "ROW THE 6K" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "RACE THE 2K" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing while the library loads or errors — a shortcut, not a capability the screen owes", async () => {
    mockWorkouts({ state: "loading" });
    const { container, unmount } = await renderShortcut();
    expect(container.querySelector(".retest")).toBeNull();
    unmount();

    vi.resetModules();
    mockWorkouts({ state: "error", retry: () => {} });
    const second = await renderShortcut();
    expect(second.container.querySelector(".retest")).toBeNull();
  });
});

describe("RetestShortcut coverage of the remaining guard arms", () => {
  it("renders nothing at all when NEITHER designated global row exists — custom same-title rows don't count", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6, { isGlobal: false }),
        seedWorkout(ONBOARDING_TITLES.k2, { isGlobal: false }),
      ],
    });
    const { container } = await renderShortcut();
    expect(container.querySelector(".retest")).toBeNull();
  });

  it("a merely-started (not finished) draft stages the in-progress copy, not the unlogged one", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    const seed = ONBOARDING_LIBRARY_WORKOUTS.find(
      (w) => w.title === ONBOARDING_TITLES.k6,
    )!;
    saveDraft(
      startDraft(
        buildDraft({
          id: "id-inprogress",
          title: seed.title,
          type: seed.type,
          steps: seed.steps,
        }),
      ),
    );

    await renderShortcut();
    await userEvent.click(screen.getByRole("button", { name: "RACE THE 2K" }));
    expect(
      screen.getByText("A session is in progress. Replace it?"),
    ).toBeInTheDocument();
  });
});
