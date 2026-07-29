import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";

// 6k baseline 2:02.0 (122s); off -2 -> 120s target; distance step reads its
// meters, never an estimated duration.
const WORKOUT: LibraryWorkout = {
  id: "w1",
  num: 42,
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
      spm: 22,
    },
    {
      k: "w",
      duration: { kind: "distance", meters: 2500 },
      ref: { base: "2k", off: -4 },
      restMinutes: 2,
    },
    { k: "r", minutes: 3 },
    { k: "test", label: "2k test" },
  ],
  isGlobal: true,
  lastDoneDaysAgo: 12,
};

// A repeat-block workout for the handoff's nudge model: one raw "reps"
// marker step governs everything after it, so the block is nudged once
// rather than per-repetition. 2k baseline 1:52.0 (112s); off 0 -> 112s
// target; tolerance 1 -> 1:51.0-1:53.0. Its work step sits at raw index 1
// — the SAME index as WORKOUT's first nudgeable work step — so the
// per-workout scoping test below actually exercises the bug (stale nudge
// state reappearing at a matching index) rather than passing by
// coincidence.
const WORKOUT_WITH_REPS: LibraryWorkout = {
  id: "w2",
  num: 7,
  title: "Rep City",
  type: "AN",
  difficulty: "hard",
  pain: 4,
  steps: [
    { k: "reps", count: 4 },
    {
      k: "w",
      duration: { kind: "time", minutes: 1 },
      ref: { base: "2k", off: 0 },
    },
  ],
  isGlobal: true,
  lastDoneDaysAgo: null,
};

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function mockHooks(
  baselines: { k2Seconds: number | null; k6Seconds: number | null },
  workouts: LibraryWorkout[] = [WORKOUT],
) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines }),
  }));
}

async function renderDetail(initialPath = "/library/w1") {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Renders WorkoutDetail alongside sibling links to other /library/:id
// paths, all matched by the SAME <Route>, so clicking one changes just the
// :id param rather than unmounting/remounting the route element — the
// exact shape of the "no key on the route" scoping bug (finding 2).
async function renderWithSiblingLinks(initialPath: string) {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/library/:id"
          element={
            <>
              <WorkoutDetail />
              <Link to="/library/w1">Go to w1</Link>
              <Link to="/library/w2">Go to w2</Link>
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
});

describe("WorkoutDetail", () => {
  it("resolves a work step's target against real baselines into a tolerance range", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    // Hardcoded expectation (EN DASH, U+2013) — not recomputed via
    // resolveSplit/toleranceRange, which would make this tautological.
    expect(screen.getByText("1:59.0–2:01.0")).toBeInTheDocument();
  });

  it("shifts the resolved range one second faster after a single ▲ (faster) nudge", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Nudge faster" })[0]!,
    );

    expect(screen.getByText("1:58.0–2:00.0")).toBeInTheDocument();
    expect(screen.getByText(/nudged −1s/)).toBeInTheDocument();
  });

  it("labels a single ▼ (slower) press from neutral as a +1s nudge", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Nudge slower" })[0]!,
    );

    expect(screen.getByText(/nudged \+1s/)).toBeInTheDocument();
    // Hardcoded expectation (EN DASH, U+2013) — not recomputed via
    // resolveSplit/toleranceRange, which would make this tautological.
    expect(screen.getByText("2:00.0–2:02.0")).toBeInTheDocument();
  });

  it("shows the step's stroke rate in the sub-line", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByText(/22 spm/)).toBeInTheDocument();
  });

  it("renders a distance step's meters, never an estimated minute count", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByText(/2500 m/)).toBeInTheDocument();
  });

  it("renders the italic no-target state with a link to set baselines when both are unset", async () => {
    mockHooks({ k2Seconds: null, k6Seconds: null });
    await renderDetail();

    const noTargets = screen.getAllByText("no target");
    expect(noTargets.length).toBeGreaterThan(0);
    expect(noTargets.every((el) => el.tagName === "EM")).toBe(true);
    expect(
      screen.getAllByRole("link", { name: /set baselines/i })[0],
    ).toHaveAttribute("href", "/you");
  });

  it("renders Start and Log it after, both disabled ahead of Phase 6", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log it after" })).toBeDisabled();
  });

  it("exposes nudge buttons with accessible names and the 44px hit-target class", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    const faster = screen.getAllByRole("button", { name: "Nudge faster" })[0]!;
    const slower = screen.getAllByRole("button", { name: "Nudge slower" })[0]!;

    expect(faster).toHaveClass("nudge-btn");
    expect(slower).toHaveClass("nudge-btn");
  });

  it("shows a work step's between-sets rest duration in the sub-line", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByText(/2′ rest/)).toBeInTheDocument();
  });

  it("renders a rest step's label and duration with no target range or nudge controls", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    const restRow = screen.getByText("Rest").closest(".step-row");
    expect(restRow).not.toBeNull();
    expect(within(restRow as HTMLElement).getByText("3′")).toBeInTheDocument();
    expect(
      within(restRow as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  it("renders a test step's label with no target range or nudge controls", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    const testRow = screen.getByText("2k test").closest(".step-row");
    expect(testRow).not.toBeNull();
    expect(
      within(testRow as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  it("renders one marker row above a repeat block instead of expanding it per repetition", async () => {
    mockHooks(BASELINES, [WORKOUT, WORKOUT_WITH_REPS]);
    await renderDetail("/library/w2");

    // liveSteps() would have expanded this into 4 separate work rows; the
    // handoff's raw-step model renders the block once with a marker above
    // it, so there is exactly one range and exactly one pair of nudge
    // buttons for the whole 4x block.
    expect(screen.getByText("4× the block below")).toBeInTheDocument();
    expect(screen.getByText("1:51.0–1:53.0")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Nudge faster" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Nudge slower" }),
    ).toHaveLength(1);
  });

  it("does not carry nudges from one workout to another when the route id changes without a component remount", async () => {
    mockHooks(BASELINES, [WORKOUT, WORKOUT_WITH_REPS]);
    await renderWithSiblingLinks("/library/w1");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Nudge slower" })[0]!,
    );
    expect(screen.getByText(/nudged \+1s/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Go to w2" }));

    // w2's step at the same raw index (its first work step) must render
    // its neutral, un-nudged range — not w1's leftover nudge re-applied by
    // index.
    expect(screen.queryByText(/nudged/)).not.toBeInTheDocument();
    expect(screen.getByText("1:51.0–1:53.0")).toBeInTheDocument();
  });
});
