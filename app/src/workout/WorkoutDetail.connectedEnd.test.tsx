// One seam, one file: what the workout detail does when a CONNECTED
// session ends. It lives apart from `WorkoutDetail.test.tsx` because
// proving it needs `ConnectedInterstitial` replaced by a stub that fires
// `onEnded` on demand, and `vi.mock` is hoisted for a whole module — the
// rest of that file's 60-odd tests want the real interstitial.
//
// Driving a real `ended` through the whole stack (fake transport -> driver
// -> hook -> interstitial -> surface) is `ConnectedSurface.test.tsx`'s
// fake-driven walk. What is untested anywhere else, and what this file
// pins, is the ROUTE the detail screen picks afterwards.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedInterstitialProps } from "./ConnectedInterstitial";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

// The stub exposes the two callbacks as buttons so a test can fire either
// without a monitor. It renders nothing else — the interstitial's own
// rendering is `ConnectedInterstitial.test.tsx`'s subject.
vi.mock("./ConnectedInterstitial", async () => {
  const actual = await vi.importActual<
    typeof import("./ConnectedInterstitial")
  >("./ConnectedInterstitial");
  return {
    ...actual,
    default: ({ onEnded, onExit }: ConnectedInterstitialProps) => (
      <div>
        <button type="button" onClick={onEnded}>
          FIRE ENDED
        </button>
        <button type="button" onClick={onExit}>
          FIRE EXIT
        </button>
      </div>
    ),
  };
});

vi.mock("../api/useBaselines", () => ({
  useBaselines: () => ({
    baselines: { k2Seconds: 112, k6Seconds: 122 },
    error: null,
    reload: vi.fn(),
  }),
}));

const WORKOUT = {
  id: "w-conn",
  title: "Filling Low",
  type: "AT" as const,
  difficulty: "medium" as const,
  pain: 3,
  steps: [
    { k: "wu" as const, minutes: 8 },
    {
      k: "w" as const,
      duration: { kind: "distance" as const, meters: 2000 },
      ref: { base: "6k" as const, off: 4 },
      spm: 22,
      restMinutes: 3,
    },
  ],
  lastDoneDaysAgo: null,
  source: "seed" as const,
};

vi.mock("../api/useWorkouts", () => ({
  useWorkouts: () => ({ workouts: [WORKOUT], error: null, reload: vi.fn() }),
}));

const { default: WorkoutDetail } = await import("./WorkoutDetail");

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/library/${WORKOUT.id}`]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Opens the interstitial by pressing Connect. The Connect guard
 *  (`ConnectAction`) only stages a confirm when a session record exists;
 *  `localStorage` is cleared, so the first press goes straight through. */
async function openConnect(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
}

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
});

describe("a connected session that ends", () => {
  it("routes to this workout's own log screen", async () => {
    renderDetail();
    await openConnect();
    await userEvent.click(screen.getByRole("button", { name: "FIRE ENDED" }));
    // `/library/:id/log`, not `/session/log`: the record the surface just
    // closed is a `MonitorRun`, and `/session/log` reads the phone timer's
    // `SessionRun`, which a connected session never creates.
    expect(navigate).toHaveBeenCalledWith(`/library/${WORKOUT.id}/log`);
  });

  it("leaves the interstitial behind, so the hook unmounts and hangs up", async () => {
    renderDetail();
    await openConnect();
    expect(
      screen.getByRole("button", { name: "FIRE ENDED" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "FIRE ENDED" }));
    // The unmount is the hang-up (ConnectedSurface.tsx's mount decision):
    // `useMonitorSession`'s teardown effect is what drops the radio, and
    // nothing else in the app ever calls it.
    expect(
      screen.queryByRole("button", { name: "FIRE ENDED" }),
    ).not.toBeInTheDocument();
  });

  it("Cancel still comes back to the detail screen without navigating", async () => {
    renderDetail();
    await openConnect();
    await userEvent.click(screen.getByRole("button", { name: "FIRE EXIT" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });
});
