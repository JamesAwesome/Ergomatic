import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import type { LibraryWorkout } from "../api/useWorkouts";
import { loadDraft } from "../session/draft";
import { loadRun } from "../session/run";

// Phase BL PR B, reshaped by James's tester feedback (2026-08-22): the
// shortcut NAVIGATES to the designated test's detail screen — the one
// offering Connect / Start Timer / Log it after — instead of launching
// the timer directly ("It should take me to the connect/start timer/log
// it after screen"). The start guards did not vanish: every start path
// on the detail screen carries them (useStartWorkout's replaceStage for
// Start Timer, ConnectAction's connectGuardStage for Connect), so the
// shortcut itself is two plain links that write NOTHING.

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

// Probe standing in for WorkoutDetail: renders the routed :id AND the
// carried location.state.from, so one assertion pins BOTH the target
// route and the origin state BackLink will read there.
function DetailProbe() {
  const { id } = useParams();
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  return (
    <p>
      DETAIL {id} from={String(from)}
    </p>
  );
}

async function renderShortcut() {
  const { default: RetestShortcut } = await import("./RetestShortcut");
  return render(
    <MemoryRouter initialEntries={["/you"]}>
      <Routes>
        <Route path="/you" element={<RetestShortcut />} />
        <Route path="/library/:id" element={<DetailProbe />} />
        {/* The OLD destination — kept routed so a regression that starts
            the timer again shows up as this marker, not a router 404. */}
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
  it("offers both tests as links to each designated test's detail screen, with no caption prose", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderShortcut();
    expect(screen.getByRole("link", { name: "ROW THE 6K" })).toHaveAttribute(
      "href",
      "/library/id-6k-test",
    );
    expect(screen.getByRole("link", { name: "RACE THE 2K" })).toHaveAttribute(
      "href",
      "/library/id-2k-test",
    );
    // James's feedback: "we don't need the prose above it. The buttons
    // speak for themselves." No caption, no leftover button role.
    expect(screen.queryByText(/RE-TEST/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("tapping ROW THE 6K lands on the detail screen carrying from=/you, and starts nothing", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderShortcut();
    await userEvent.click(screen.getByRole("link", { name: "ROW THE 6K" }));

    expect(
      await screen.findByText("DETAIL id-6k-test from=/you"),
    ).toBeInTheDocument();
    // Never the timer: the tap is a navigation, not a start — no draft,
    // no run, no countdown.
    expect(screen.queryByText("COUNTDOWN SCREEN")).not.toBeInTheDocument();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  it("RACE THE 2K targets the 2k test's detail, not the 6k's", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderShortcut();
    await userEvent.click(screen.getByRole("link", { name: "RACE THE 2K" }));
    expect(
      await screen.findByText("DETAIL id-2k-test from=/you"),
    ).toBeInTheDocument();
  });

  // domain/onboarding.ts's own identity rule: a rower's custom row
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
      screen.getByRole("link", { name: "ROW THE 6K" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "RACE THE 2K" }),
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
});
