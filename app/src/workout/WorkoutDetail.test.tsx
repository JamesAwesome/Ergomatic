import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
    },
  ],
  isGlobal: true,
  lastDoneDaysAgo: 12,
};

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function mockHooks(baselines: {
  k2Seconds: number | null;
  k6Seconds: number | null;
}) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts: [WORKOUT] }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines }),
  }));
}

async function renderDetail() {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={["/library/w1"]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
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
});
