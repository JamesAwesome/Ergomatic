import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";

const WORKOUTS: LibraryWorkout[] = [
  {
    id: "w-at",
    num: 12,
    title: "Anaerobic Threshold Blitz",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [{ k: "wu", minutes: 30 }],
    isGlobal: true,
    lastDoneDaysAgo: 5,
  },
  {
    id: "w-o2",
    num: 3,
    title: "Steady State Cruise",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [{ k: "wu", minutes: 20 }],
    isGlobal: true,
    lastDoneDaysAgo: 40,
  },
  {
    id: "w-an",
    num: 44,
    title: "Sprint Ladder",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [{ k: "wu", minutes: 60 }],
    isGlobal: true,
    lastDoneDaysAgo: null,
  },
];

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function mockReady(workouts: LibraryWorkout[] = WORKOUTS) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines: BASELINES }),
  }));
}

async function renderLibrary() {
  const { default: Library } = await import("./Library");
  render(
    <MemoryRouter>
      <Library />
    </MemoryRouter>,
  );
}

function visibleHrefs(): (string | null)[] {
  const list = screen.getByRole("list");
  return within(list)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
}

beforeEach(() => {
  vi.resetModules();
});

describe("Library", () => {
  it("renders every row's number, title, and estimated duration", async () => {
    mockReady();
    await renderLibrary();

    expect(
      screen.getByText("12. Anaerobic Threshold Blitz"),
    ).toBeInTheDocument();
    expect(screen.getByText("3. Steady State Cruise")).toBeInTheDocument();
    expect(screen.getByText("44. Sprint Ladder")).toBeInTheDocument();
    expect(screen.getByText("30′")).toBeInTheDocument();
    expect(screen.getByText("20′")).toBeInTheDocument();
    expect(screen.getByText("60′")).toBeInTheDocument();
  });

  it("shows a plain count in the header, never the book's fixed denominator", async () => {
    mockReady();
    await renderLibrary();

    expect(screen.getByText("3 ENTERED")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/375/);
  });

  it("narrows to AT rows when the AT chip is clicked, and updates the count", async () => {
    mockReady();
    await renderLibrary();

    await userEvent.click(screen.getByRole("button", { name: "AT" }));

    expect(visibleHrefs()).toStrictEqual(["/library/w-at"]);
    expect(screen.getByText("1 ENTERED")).toBeInTheDocument();
  });

  it("clicking AT again restores the full list (toggle-off)", async () => {
    mockReady();
    await renderLibrary();
    const atChip = screen.getByRole("button", { name: "AT" });

    await userEvent.click(atChip);
    await userEvent.click(atChip);

    expect(visibleHrefs()).toStrictEqual([
      "/library/w-at",
      "/library/w-o2",
      "/library/w-an",
    ]);
    expect(screen.getByText("3 ENTERED")).toBeInTheDocument();
  });

  it("ALL clears every active chip and restores the full list", async () => {
    mockReady();
    await renderLibrary();

    await userEvent.click(screen.getByRole("button", { name: "AT" }));
    await userEvent.click(screen.getByRole("button", { name: "PAIN ≤3" }));
    await userEvent.click(screen.getByRole("button", { name: "RECENT" }));
    await userEvent.click(screen.getByRole("button", { name: "ALL" }));

    expect(visibleHrefs()).toStrictEqual([
      "/library/w-at",
      "/library/w-o2",
      "/library/w-an",
    ]);
  });

  it("shows the empty state, not a bare list, when filters match nothing", async () => {
    mockReady();
    await renderLibrary();

    // AT's only workout is a 30-minute step, which buckets as 30-45 — <30′
    // combined with the AT chip matches nothing.
    await userEvent.click(screen.getByRole("button", { name: "AT" }));
    await userEvent.click(screen.getByRole("button", { name: "<30′" }));

    expect(screen.getByText(/No workouts match/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /clear filters/i }),
    );

    expect(screen.getByText("3 ENTERED")).toBeInTheDocument();
    expect(visibleHrefs()).toStrictEqual([
      "/library/w-at",
      "/library/w-o2",
      "/library/w-an",
    ]);
  });

  it("narrows to NOT RECENT rows when the chip is clicked, counting never-done as not recent", async () => {
    mockReady();
    await renderLibrary();

    await userEvent.click(screen.getByRole("button", { name: "NOT RECENT" }));

    expect(visibleHrefs()).toStrictEqual(["/library/w-o2", "/library/w-an"]);
    expect(screen.getByText("2 ENTERED")).toBeInTheDocument();
  });

  it("renders a — duration fallback instead of a bogus number when baselines are unset", async () => {
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "ready", workouts: WORKOUTS }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({
        state: "ready",
        baselines: { k2Seconds: null, k6Seconds: null },
      }),
    }));

    await renderLibrary();

    expect(screen.getAllByText("—")).toHaveLength(WORKOUTS.length);
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText("30′")).not.toBeInTheDocument();
  });

  it("renders the loading state before data arrives", async () => {
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "loading" }),
    }));

    await renderLibrary();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders an error state with a retry wired to the workouts hook's retry", async () => {
    const retry = vi.fn();
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "error", retry }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "ready", baselines: BASELINES }),
    }));

    await renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders an error state with a retry wired to the baselines hook's retry", async () => {
    const retry = vi.fn();
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "ready", workouts: WORKOUTS }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "error", retry }),
    }));

    await renderLibrary();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
