import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

// A fully-supported personal workout — every step kind the builder's row
// model can represent (wu/w/r), so `hasUnsupportedSteps` must NOT refuse it.
const PERSONAL_WORKOUT: LibraryWorkout = {
  id: "w1",
  num: 12,
  title: "Ladder Sets",
  type: "AT",
  difficulty: "medium",
  pain: 3,
  steps: [
    { k: "wu", minutes: 10 },
    {
      k: "w",
      duration: { kind: "time", minutes: 5 },
      ref: { base: "6k", off: -2 },
    },
  ],
  isGlobal: false,
  lastDoneDaysAgo: 12,
};

// Same shape, but carries a `test` step — the builder's BuilderRow model has
// no representation for it at all, so `fromWorkout` would silently drop it.
// EditWorkout must call `hasUnsupportedSteps` BEFORE `fromWorkout` and
// refuse to open the builder here, rather than let a save destroy the step.
const WORKOUT_WITH_TEST_STEP: LibraryWorkout = {
  ...PERSONAL_WORKOUT,
  id: "w2",
  steps: [...PERSONAL_WORKOUT.steps, { k: "test", label: "2k test" }],
};

const GLOBAL_WORKOUT: LibraryWorkout = {
  ...PERSONAL_WORKOUT,
  id: "w3",
  isGlobal: true,
};

function mockHooks(workouts: LibraryWorkout[]) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines: BASELINES }),
  }));
}

function mockLoadingWorkouts() {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "loading" }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines: BASELINES }),
  }));
}

async function renderEdit(initialPath: string) {
  const { default: EditWorkout } = await import("./EditWorkout");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/library/:id/edit" element={<EditWorkout />} />
        <Route path="/library/:id" element={<p>WORKOUT DETAIL SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
});

describe("EditWorkout", () => {
  it("shows a loading state while the library is still loading", async () => {
    mockLoadingWorkouts();
    await renderEdit("/library/w1/edit");

    expect(screen.getByText("LOADING…")).toBeInTheDocument();
  });

  it("shows a not-found state and a link back to the library for an unknown id", async () => {
    mockHooks([PERSONAL_WORKOUT]);
    await renderEdit("/library/does-not-exist/edit");

    expect(
      screen.getByText("That workout isn't in your library."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
      "href",
      "/library",
    );
  });

  it("refuses to open the builder for a GLOBAL workout, even via a hand-typed URL", async () => {
    mockHooks([GLOBAL_WORKOUT]);
    await renderEdit("/library/w3/edit");

    expect(
      screen.getByText("Starter workouts can't be edited yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Edit Workout" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save to library" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
      "href",
      "/library/w3",
    );
  });

  it("refuses to open the builder for a workout with an unsupported (test) step, to avoid silently dropping it on save", async () => {
    mockHooks([WORKOUT_WITH_TEST_STEP]);
    await renderEdit("/library/w2/edit");

    expect(
      screen.queryByRole("heading", { name: "Edit Workout" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save to library" }),
    ).not.toBeInTheDocument();
    // Explains WHY, so the rower isn't left guessing.
    expect(screen.getByText(/can't be edited/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
      "href",
      "/library/w2",
    );
  });

  it("renders the Builder in edit mode, pre-filled from the workout, for a fully-supported personal workout", async () => {
    mockHooks([PERSONAL_WORKOUT]);
    await renderEdit("/library/w1/edit");

    expect(
      screen.getByRole("heading", { name: "Edit Workout" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Ladder Sets");
    // Pins the structured-ref round trip through fromWorkout/stepToRow: the
    // stored step's ref ({base:"6k", off:-2}) must load back into
    // PaceRefInput's base/off props exactly, not just the base. The
    // base+offset -> display-string rendering itself ("6k −2") is
    // PaceRefInput's own concern, covered by PaceRefInput.test.tsx — this
    // only needs to confirm the *value* survived the round trip. PERSONAL_
    // WORKOUT's steps are [wu, w], so the work row (the only one with a
    // pace-ref control) is row 2, not row 1.
    expect(screen.getByRole("radio", { name: "Row 2 pace 6K" })).toBeChecked();
    expect(screen.getByText("6k −2")).toBeInTheDocument();
  });
});
