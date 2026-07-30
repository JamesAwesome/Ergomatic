import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { api } from "../api";
import type { LibraryWorkout } from "../api/useWorkouts";

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

// A fully-supported personal workout — every step kind the builder's row
// model can represent (wu/w/r), so `hasUnsupportedSteps` must NOT refuse it.
// The trailing `r` step matters specifically for phase 5c: the builder
// dropped its own "+ REST" button (rest is now authored via a work row's
// REST (OPT) field) but kept StepRowEditor's `kind === "r"` render branch,
// because bulk import — and a workout like this one, pasted in before that
// change — can still produce a standalone rest step. This fixture proves
// that step stays representable and editable end to end, not just that
// `fromWorkout`/`stepToRow` handle it in isolation.
const PERSONAL_WORKOUT: LibraryWorkout = {
  id: "w1",
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
    { k: "r", minutes: 3 },
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

// The reviewer's HIGH-3 regression shape: a `reps` marker sitting between
// two work steps rather than at the derived span start. The row model has
// no field for a marker's position (only its count, hoisted into
// `f.reps`), so opening this in the builder and saving again would
// silently move the marker and change the workout's meaning (16 min ->
// 36 min for this exact shape). EditWorkout must call `hasMidSpanReps`
// BEFORE `fromWorkout` and refuse to open, the same precedent as the
// `test`-step guard above.
const WORKOUT_WITH_MID_SPAN_REPS: LibraryWorkout = {
  ...PERSONAL_WORKOUT,
  id: "w4",
  steps: [
    {
      k: "w",
      duration: { kind: "time", minutes: 10 },
      ref: { base: "6k", off: 0 },
    },
    { k: "reps", count: 3 },
    {
      k: "w",
      duration: { kind: "time", minutes: 2 },
      ref: { base: "6k", off: 0 },
    },
  ],
};

function mockHooks(workouts: LibraryWorkout[]) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines: BASELINES }),
  }));
}

// Mirrors Builder.test.tsx's own mockApi: typed against the real `api`
// signature so `.mock.calls[0]` carries the actual `[path, RequestInit]`
// shape the round-trip test below destructures to inspect the PUT body.
function mockApi(handler: () => Response) {
  const fn = vi.fn<typeof api>(async () => handler());
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
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
      screen.queryByRole("button", { name: "Save" }),
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
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    // Explains WHY, so the rower isn't left guessing.
    expect(screen.getByText(/can't be edited/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
      "href",
      "/library/w2",
    );
  });

  it("refuses to open the builder for a workout whose reps marker isn't at the derived span start (H3)", async () => {
    mockHooks([WORKOUT_WITH_MID_SPAN_REPS]);
    await renderEdit("/library/w4/edit");

    expect(
      screen.queryByRole("heading", { name: "Edit Workout" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    // Explains WHY (a different reason from the unsupported-step case
    // above), so the rower isn't left guessing.
    expect(screen.getByText(/repeat structure/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
      "href",
      "/library/w4",
    );
  });

  it("renders the Builder in edit mode, pre-filled from the workout, for a fully-supported personal workout", async () => {
    mockHooks([PERSONAL_WORKOUT]);
    await renderEdit("/library/w1/edit");

    expect(
      screen.getByRole("heading", { name: "Edit Workout" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Ladder Sets");
    // Edit mode opens with every row collapsed (Phase 5E Task 5's
    // accordion) — expand Row 2 (the `w` row; PERSONAL_WORKOUT's steps are
    // [wu, w, r], so the work row is the second card) to reach its
    // pace-ref control.
    await userEvent.click(screen.getAllByRole("button", { name: "EDIT" })[1]!);
    // Pins the structured-ref round trip through fromWorkout/stepToRow: the
    // stored step's ref ({base:"6k", off:-2}) must load back into
    // PaceRefInput's base/off props exactly, not just the base. The
    // base+offset -> display-string rendering itself ("6k −2") is
    // PaceRefInput's own concern, covered by PaceRefInput.test.tsx — this
    // only needs to confirm the *value* survived the round trip.
    expect(screen.getByRole("radio", { name: "Row 2 pace 6K" })).toBeChecked();
    expect(screen.getByText("6k −2")).toBeInTheDocument();
  });

  it("renders a standalone rest row and round-trips it unchanged on save", async () => {
    const api = mockApi(() => new Response(null, { status: 200 }));
    mockHooks([PERSONAL_WORKOUT]);
    await renderEdit("/library/w1/edit");

    // Row 3 (after the wu and w rows): the standalone `r` step from the
    // fixture. Expand it — edit mode starts collapsed (Phase 5E Task 5).
    await userEvent.click(screen.getAllByRole("button", { name: "EDIT" })[2]!);
    // Not a `w` row, so it gets none of StepEditor's isWork-only controls
    // (SPM/REST/pace) — only the shared duration field, pre-filled from
    // `stepToRow`'s plain `durValue` (Phase 5D Task 2 dropped the
    // `${minutes}'` grammar in favor of a bare numeric string).
    expect(screen.getByLabelText("Row 3 duration")).toHaveValue("3");
    // Distinguishes it from also being a `w` row rendered with blank
    // optional fields: a `w` row would additionally expose SPM/REST inputs
    // and a pace-ref radiogroup, none of which exist for this row.
    expect(
      screen.queryByRole("radio", { name: "Row 3 pace 6K" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    // Exact body equality (not just "contains an r step") — proves the wu
    // and w steps also survived the round trip unchanged, not just the one
    // this test is nominally about.
    expect(api).toHaveBeenCalledWith("/api/workouts/w1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
          { k: "r", minutes: 3 },
        ],
      }),
    });
  });
});
