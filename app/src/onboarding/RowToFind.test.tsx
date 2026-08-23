import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import type { LibraryWorkout } from "../api/useWorkouts";

// Phase BL PR C — door 3 (canvas RowPath): pure navigation to each
// designated test's DETAIL screen (the #168 pattern), state.from carried
// for honest back navigation. Fixtures are the REAL seed rows
// (recurring-failure #3), same idiom as RetestShortcut.test.tsx.

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

// F2: the 2k chip's NOT SET segment keys on the real pair state. Default
// every test to the doors' normal case (both missing) unless it says
// otherwise.
function mockBaselines(
  baselines: { k2Seconds: number | null; k6Seconds: number | null } = {
    k2Seconds: null,
    k6Seconds: null,
  },
) {
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({
      state: "ready",
      baselines,
      save: vi.fn(async () => {}),
    }),
  }));
}

function mockBaselinesUnready(state: "loading" | "error") {
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () =>
      state === "loading"
        ? { state: "loading" }
        : { state: "error", retry: vi.fn() },
  }));
}

// Probe standing in for WorkoutDetail: renders the routed :id AND the
// carried location.state.from (RetestShortcut.test.tsx's idiom).
function DetailProbe() {
  const { id } = useParams();
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  return (
    <p>
      DETAIL {id} from={String(from)}
    </p>
  );
}

async function renderRow() {
  const { default: RowToFind } = await import("./RowToFind");
  return render(
    <MemoryRouter initialEntries={["/onboarding/row"]}>
      <Routes>
        <Route path="/onboarding/row" element={<RowToFind />} />
        <Route path="/library/:id" element={<DetailProbe />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../api/useWorkouts");
  vi.doUnmock("../api/useBaselines");
});

describe("RowToFind (door 3)", () => {
  it("renders both distance cards with the ruled copy: strong-and-steady 6k (not-a-sprint chip), all-out 2k", async () => {
    mockBaselines();
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderRow();
    expect(
      screen.getByRole("heading", { name: "Pick your distance" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Row a strong, steady 6k")).toBeInTheDocument();
    expect(
      screen.getByText("6K BASELINE · STRONG AND STEADY · NOT A SPRINT"),
    ).toBeInTheDocument();
    expect(screen.getByText("ABOUT 25 MIN")).toBeInTheDocument();
    expect(screen.getByText("Race a 2k")).toBeInTheDocument();
    expect(
      screen.getByText("2K BASELINE · NOT SET · ALL OUT, EMPTY THE TANK"),
    ).toBeInTheDocument();
    expect(screen.getByText("ABOUT 8 MIN")).toBeInTheDocument();
    // The retired canvas framing is gone.
    expect(screen.queryByText(/relaxed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ROW IT HOW IT FEELS/)).not.toBeInTheDocument();
  });

  it("the 6k Start navigates to the designated GLOBAL row's detail with from=/onboarding/row", async () => {
    mockBaselines();
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderRow();
    const starts = screen.getAllByRole("link", { name: "Start" });
    await userEvent.click(starts[0]!);
    expect(
      screen.getByText("DETAIL id-6k-test from=/onboarding/row"),
    ).toBeInTheDocument();
  });

  it("the 2k Start navigates to the 2K Test's detail the same way", async () => {
    mockBaselines();
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderRow();
    const starts = screen.getAllByRole("link", { name: "Start" });
    await userEvent.click(starts[1]!);
    expect(
      screen.getByText("DETAIL id-2k-test from=/onboarding/row"),
    ).toBeInTheDocument();
  });

  it("targets the GLOBAL row, never a rower's own same-titled custom workout listed first", async () => {
    mockBaselines();
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6, {
          id: "custom-6k",
          isGlobal: false,
        }),
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderRow();
    const starts = screen.getAllByRole("link", { name: "Start" });
    await userEvent.click(starts[0]!);
    expect(
      screen.getByText("DETAIL id-6k-test from=/onboarding/row"),
    ).toBeInTheDocument();
  });

  it("a missing designated row hides its card only (defensive)", async () => {
    mockBaselines();
    mockWorkouts({
      state: "ready",
      workouts: [seedWorkout(ONBOARDING_TITLES.k2)],
    });
    await renderRow();
    expect(
      screen.queryByText("Row a strong, steady 6k"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Race a 2k")).toBeInTheDocument();
  });

  // F2 (triad review): NOT SET only when true.
  it("drops the 2k chip's NOT SET segment when the 2k is actually set (partial pair, superset render)", async () => {
    mockBaselines({ k2Seconds: 118, k6Seconds: null });
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderRow();
    expect(
      screen.getByText("2K BASELINE · ALL OUT, EMPTY THE TANK"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NOT SET/)).not.toBeInTheDocument();
  });

  it("keeps NOT SET on the doors' normal both-missing case", async () => {
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    mockWorkouts({
      state: "ready",
      workouts: [seedWorkout(ONBOARDING_TITLES.k2)],
    });
    await renderRow();
    expect(
      screen.getByText("2K BASELINE · NOT SET · ALL OUT, EMPTY THE TANK"),
    ).toBeInTheDocument();
  });

  it("omits the NOT SET claim while the pair is unknown (baselines still loading) — omitting a claim is not a claim", async () => {
    mockBaselinesUnready("loading");
    mockWorkouts({
      state: "ready",
      workouts: [seedWorkout(ONBOARDING_TITLES.k2)],
    });
    await renderRow();
    expect(
      screen.getByText("2K BASELINE · ALL OUT, EMPTY THE TANK"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NOT SET/)).not.toBeInTheDocument();
  });

  it("the top-left back link returns to Today", async () => {
    mockBaselines();
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderRow();
    await userEvent.click(screen.getByRole("link", { name: "← BACK" }));
    expect(screen.getByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("shows loading, and an error state with retry (a full screen owes one, unlike the You shortcut)", async () => {
    mockBaselines();
    mockWorkouts({ state: "loading" });
    await renderRow();
    expect(screen.getByText("LOADING…")).toBeInTheDocument();
    cleanup();
    vi.resetModules();

    const retry = vi.fn();
    mockBaselines();
    mockWorkouts({ state: "error", retry });
    await renderRow();
    expect(
      screen.getByText(/Couldn't load the test workouts/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });
});
