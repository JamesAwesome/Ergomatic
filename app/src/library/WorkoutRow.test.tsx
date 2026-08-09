import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";
import WorkoutRow from "./WorkoutRow";

// Real seeded workout ("Hoarfrost", app/server/seed/library/o2.ts) —
// WorkoutRow doesn't compute duration itself (that's Library.tsx's job, via
// estimateMinutes), so its `steps` don't drive this test directly, but
// using a real library entry rather than a hand-built stub keeps the
// fixture honest per this repo's recurring-fixture-defect history.
const HOARFROST: LibraryWorkout = {
  id: "w-hoarfrost",
  title: "Hoarfrost",
  type: "O2",
  difficulty: "easy",
  pain: 2,
  steps: [
    { k: "reps", count: 2 },
    {
      k: "w",
      duration: { kind: "time", minutes: 12 },
      ref: { base: "6k", off: 12 },
      spm: 19,
      restMinutes: 3,
    },
  ],
  isGlobal: true,
  lastDoneDaysAgo: 5,
};

describe("WorkoutRow", () => {
  // This is the guard `Library.tsx`'s own render path can never exercise:
  // `estimateMinutes` (domain/expand.ts) already rounds internally, so a
  // fractional value never reaches WorkoutRow through that caller. Phase 6
  // adds distance-based estimation that may produce fractions, so the
  // component itself must not print one — hence rendering WorkoutRow
  // directly with a fractional prop rather than going through Library.
  it("rounds a fractional duration down at .25 rather than printing 2.25′", () => {
    render(
      <MemoryRouter>
        <WorkoutRow workout={HOARFROST} durationMinutes={2.25} />
      </MemoryRouter>,
    );

    expect(screen.getByText("2′")).toBeInTheDocument();
    expect(screen.queryByText("2.25′")).not.toBeInTheDocument();
  });

  it("rounds a fractional duration up at .5 (Math.round is half-up)", () => {
    render(
      <MemoryRouter>
        <WorkoutRow workout={HOARFROST} durationMinutes={2.5} />
      </MemoryRouter>,
    );

    expect(screen.getByText("3′")).toBeInTheDocument();
    expect(screen.queryByText("2.5′")).not.toBeInTheDocument();
  });

  it("renders a — fallback when duration is unknown", () => {
    render(
      <MemoryRouter>
        <WorkoutRow workout={HOARFROST} durationMinutes={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  describe("custom badge", () => {
    const CUSTOM: LibraryWorkout = {
      ...HOARFROST,
      id: "w-custom",
      isGlobal: false,
    };

    it("renders the CUSTOM badge for a non-global workout", () => {
      render(
        <MemoryRouter>
          <WorkoutRow workout={CUSTOM} durationMinutes={20} />
        </MemoryRouter>,
      );

      expect(screen.getByText("CUSTOM")).toBeInTheDocument();
    });

    it("omits the CUSTOM badge for a real seeded library workout", () => {
      render(
        <MemoryRouter>
          <WorkoutRow workout={HOARFROST} durationMinutes={20} />
        </MemoryRouter>,
      );

      expect(screen.queryByText("CUSTOM")).not.toBeInTheDocument();
    });

    it("adds ', custom workout' to the row's accessible name only for customs", () => {
      const { rerender } = render(
        <MemoryRouter>
          <WorkoutRow workout={HOARFROST} durationMinutes={20} />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link")).not.toHaveAccessibleName(
        /, custom workout/,
      );

      rerender(
        <MemoryRouter>
          <WorkoutRow workout={CUSTOM} durationMinutes={20} />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link")).toHaveAccessibleName(/, custom workout/);
    });
  });

  // Same "prove the navigation, not the prop" idiom Today/Library's own
  // probe-route tests use — the fix this task round is for depends on this
  // Link carrying an origin the detail screen's own BackLink can read back.
  it("stamps state={from:'/library'} onto the row link", async () => {
    function LocationProbe() {
      const location = useLocation();
      const from = (location.state as { from?: unknown } | null)?.from;
      return <p>PROBE from={String(from)}</p>;
    }
    render(
      <MemoryRouter initialEntries={["/library"]}>
        <Routes>
          <Route
            path="/library"
            element={<WorkoutRow workout={HOARFROST} durationMinutes={20} />}
          />
          <Route path="/library/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("link"));
    expect(await screen.findByText("PROBE from=/library")).toBeVisible();
  });
});
