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
});

describe("RowToFind (door 3)", () => {
  it("renders both distance cards with the ruled copy: strong-and-steady 6k (not-a-sprint chip), all-out 2k", async () => {
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

  it("Back returns to Today", async () => {
    mockWorkouts({
      state: "ready",
      workouts: [
        seedWorkout(ONBOARDING_TITLES.k6),
        seedWorkout(ONBOARDING_TITLES.k2),
      ],
    });
    await renderRow();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("shows loading, and an error state with retry (a full screen owes one, unlike the You shortcut)", async () => {
    mockWorkouts({ state: "loading" });
    await renderRow();
    expect(screen.getByText("LOADING…")).toBeInTheDocument();
    cleanup();
    vi.resetModules();

    const retry = vi.fn();
    mockWorkouts({ state: "error", retry });
    await renderRow();
    expect(
      screen.getByText(/Couldn't load the test workouts/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });
});
