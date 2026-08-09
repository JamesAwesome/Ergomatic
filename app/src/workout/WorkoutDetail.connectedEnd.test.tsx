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
import { buildLogSeed } from "../session/logDraft";
import type { ConnectedInterstitialProps } from "./ConnectedInterstitial";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

// 7C Task 1: the ONE production call site of `buildLogSeed`
// (`WorkoutDetail.tsx`'s `handleConnectProceed`) has no dedicated test
// anywhere else — `ConnectedInterstitial.test.tsx`/`ConnectedSurface.
// test.tsx`/`useMonitorSession.test.ts` all build their own `identity`
// fixture directly, bypassing this screen's own wiring entirely. Captured
// here (this file already mocks the component to intercept its props for
// the ended/exit callbacks) so the seam has SOME regression coverage: see
// "the log seed WorkoutDetail builds" below.
let capturedProps: ConnectedInterstitialProps | null = null;

// The stub exposes the two callbacks as buttons so a test can fire either
// without a monitor. It renders nothing else — the interstitial's own
// rendering is `ConnectedInterstitial.test.tsx`'s subject.
vi.mock("./ConnectedInterstitial", async () => {
  const actual = await vi.importActual<
    typeof import("./ConnectedInterstitial")
  >("./ConnectedInterstitial");
  return {
    ...actual,
    default: (props: ConnectedInterstitialProps) => {
      capturedProps = props;
      const { onEnded, onExit } = props;
      return (
        <div>
          <button type="button" onClick={onEnded}>
            FIRE ENDED
          </button>
          <button type="button" onClick={onExit}>
            FIRE EXIT
          </button>
        </div>
      );
    },
  };
});

vi.mock("../api/useBaselines", () => ({
  useBaselines: () => ({
    baselines: { k2Seconds: 112, k6Seconds: 122 },
    error: null,
    reload: vi.fn(),
  }),
}));

// 2026-08-09's warmup setting (design §4/§9): the CONNECT door threads the
// rower's own preference into `buildRun`, exactly as the phone-timer door
// does in `Countdown.tsx`. This rower has an 8:00 warm-up set — which is
// where the warm-up seed step asserted below comes from now that no
// workout carries a `wu` step of its own.
vi.mock("../api/usePreferences", () => ({
  usePreferences: () => ({
    state: "ready",
    preferences: {
      difficulties: [],
      timeCapMinutes: 60,
      warmupMinutes: 10,
      warmup: { kind: "time", minutes: 8 },
      countdownSeconds: 10,
      startHereDismissed: true,
    },
  }),
}));

const WORKOUT = {
  id: "w-conn",
  title: "Filling Low",
  type: "AT" as const,
  difficulty: "medium" as const,
  pain: 3,
  steps: [
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
  capturedProps = null;
});

describe("the log seed WorkoutDetail builds (7C Task 1)", () => {
  it("identity.logSeed is buildLogSeed(phases, baselines) for the SAME phases/baselines the interstitial itself receives, not a stale or empty stand-in", async () => {
    renderDetail();
    await openConnect();

    expect(capturedProps).not.toBeNull();
    const { phases, baselines, identity } = capturedProps!;
    // Self-consistency: whatever `WorkoutDetail` actually passed as
    // `phases`/`baselines` must be the SAME pair `identity.logSeed` was
    // built from — this fails if the wiring ever passes an empty phase
    // list, a swapped baselines object, or drops the call entirely.
    expect(identity.logSeed).toStrictEqual(buildLogSeed(phases, baselines));
    // And a concrete value, not just self-consistency against a
    // vacuously-empty result: this rower's 8:00 warm-up SETTING (mocked
    // above) plus the fixture's one 6k+4 distance work step. The warm-up
    // row is the load-bearing half here — it can only be present if this
    // screen actually threaded `usePreferences().preferences.warmup` into
    // `buildRun`, which is this task's own caller obligation.
    expect(identity.logSeed.steps).toStrictEqual([
      { label: "8:00 warm-up", kind: "warmup" },
      { label: "2000 m @ 6k +4", kind: "work" },
    ]);
    expect(identity.logSeed.paces).toStrictEqual({ k6: 122 });
    expect(identity.workoutId).toBe(WORKOUT.id);
    expect(identity.title).toBe(WORKOUT.title);
  });
});

describe("a connected session that ends", () => {
  it("routes to this workout's own log screen", async () => {
    renderDetail();
    await openConnect();
    await userEvent.click(screen.getByRole("button", { name: "FIRE ENDED" }));
    // `/library/:id/log`, not `/session/log`: the record the surface just
    // closed is a `MonitorRun`, and `/session/log` reads the phone timer's
    // `SessionRun`, which a connected session never creates. `?from=monitor`
    // (7C Task 4) is the intent half of that screen's monitor-mode gate —
    // `LogSession.tsx`'s own `monitorModeRun` tests pin the rest.
    expect(navigate).toHaveBeenCalledWith(
      `/library/${WORKOUT.id}/log?from=monitor`,
    );
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
