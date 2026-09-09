import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsScreen from "./SettingsScreen";
import { READY_CARD_KEY } from "./readyCard";
import ConnectedInterstitial from "../workout/ConnectedInterstitial";
import {
  useMonitorSession,
  type MonitorSession,
} from "../monitor/useMonitorSession";
import { compileProgram } from "../../domain/monitor/program.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";

/**
 * THE SEAM, AND IT STARTS UPSTREAM OF THE PRODUCER (recurring failure 24).
 *
 * Every other test in this phase enters the pipe on one side of the store or
 * the other: `SettingsScreen.test.tsx` drives the screen and asserts what it
 * saved, and the two consumers' suites seed `localStorage` by hand and assert
 * what they rendered. Both halves being well tested is exactly the condition
 * that hides a broken seam — RF24's measured cost was a headline feature that
 * shipped having never once worked, with three green gates around it.
 *
 * So this file writes NOTHING to storage. It renders the real settings
 * screen, clicks the real option, unmounts it, and then mounts a consumer and
 * asks what it renders. If the screen stops saving, or the store stops
 * reading, or either consumer stops asking, this is the test that notices.
 *
 * WHAT IT DOES NOT PROVE, stated so nobody promotes it (RF26): both sides
 * live in one JS realm here, so a store that never touched `localStorage` at
 * all would still pass. Proving the value crossed a REAL store needs a real
 * browser and a reload, which is `e2e/settings.spec.ts`'s reload leg. This
 * test proves the three components agree about one value; that one proves the
 * value survived being written down.
 */

vi.mock("../adapters/keepAwake", () => ({
  keepAwakeOn: vi.fn().mockResolvedValue(undefined),
  keepAwakeOff: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../monitor/useMonitorSession", async () => {
  const actual = await vi.importActual<
    typeof import("../monitor/useMonitorSession")
  >("../monitor/useMonitorSession");
  return { ...actual, useMonitorSession: vi.fn() };
});

const mockUseMonitorSession = vi.mocked(useMonitorSession);

/** A REAL seeded library workout through the real assembly, not a hand-built
 *  minimum (recurring failure 3: fixtures that do not look like production
 *  data) — the same "Filling Low" fixture `ConnectedInterstitial.test.tsx`
 *  builds, for the same reason. */
const BASELINES: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const WORKOUT = LIBRARY_WORKOUTS.find((w) => w.title === "Filling Low");
if (WORKOUT === undefined) {
  throw new Error("missing library fixture: Filling Low");
}
const WORKOUT_TITLE = WORKOUT.title;
const PHASES = buildRun(
  buildDraft({
    id: "filling-low",
    title: WORKOUT_TITLE,
    type: WORKOUT.type as WorkoutType,
    steps: WORKOUT.steps,
  }),
  BASELINES,
  new Date("2026-08-07T09:00:00.000Z"),
).phases;
const COMPILED = compileProgram(PHASES);
if ("code" in COMPILED) {
  throw new Error(`fixture failed to compile: ${COMPILED.code}`);
}
const PROGRAM = COMPILED;

function readySession(): MonitorSession {
  return {
    phase: "ready",
    undecodable: false,
    error: null,
    deviceName: "PM5 918273645",
    frame: null,
    actuals: [],
    endedBy: null,
    handoffHeld: false,
    holdError: null,
    frozen: false,
    runOpen: false,
    frameSilence: false,
    programDropped: false,
    closeReason: null,
    connect: vi.fn().mockResolvedValue(undefined),
    program: vi.fn().mockResolvedValue(undefined),
    beginFreeRow: vi.fn(),
    endSession: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    retryHandoffSave: vi.fn().mockResolvedValue(undefined),
    proceedHandoff: vi.fn().mockResolvedValue(undefined),
    exportLog: vi.fn().mockReturnValue("[]"),
  };
}

beforeEach(() => {
  localStorage.clear();
  mockUseMonitorSession.mockReset();
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

/** Drives the REAL settings screen. No `localStorage.setItem` anywhere in
 *  this file — the rower's tap is the only producer. */
async function chooseOnTheSettingsScreen(option: "SHOW" | "SKIP") {
  const view = render(
    <MemoryRouter initialEntries={["/you/settings"]}>
      <Routes>
        <Route path="/you" element={<p>You screen</p>} />
        <Route path="/you/settings" element={<SettingsScreen />} />
      </Routes>
    </MemoryRouter>,
  );
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "Ready screen" })).getByRole(
      "radio",
      { name: option },
    ),
  );
  // Leaving the screen is what a rower does, and it is what makes the
  // consumer's mount-time read the right lifetime.
  view.unmount();
}

function mountTheInterstitial() {
  mockUseMonitorSession.mockReturnValue(readySession());
  render(
    <MemoryRouter initialEntries={["/library/x"]}>
      <ConnectedInterstitial
        request={{
          kind: "picker",
          attemptId: "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f",
        }}
        program={PROGRAM}
        phases={PHASES}
        identity={{
          workoutId: "filling-low",
          title: WORKOUT_TITLE,
          logSeed: { steps: [], paces: {} },
        }}
        baselines={BASELINES}
        nudgedCount={0}
        onExit={vi.fn()}
        onRowInstead={vi.fn()}
        onEnded={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("the rower's setting reaches the next connect", () => {
  it("SKIP on the settings screen means no ready card at the erg", async () => {
    await chooseOnTheSettingsScreen("SKIP");
    mountTheInterstitial();
    expect(screen.queryByText("Ready when you pull")).toBeNull();
    expect(screen.getByRole("button", { name: "End session" })).toBeVisible();
  });

  it("SHOW on the settings screen means the ready card is still there", async () => {
    await chooseOnTheSettingsScreen("SHOW");
    mountTheInterstitial();
    expect(screen.getByText("Ready when you pull")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Show me the numbers" }),
    ).toBeVisible();
  });

  it("SKIP then SHOW leaves the card, so the seam carries the LAST choice", async () => {
    await chooseOnTheSettingsScreen("SKIP");
    await chooseOnTheSettingsScreen("SHOW");
    mountTheInterstitial();
    expect(screen.getByText("Ready when you pull")).toBeVisible();
  });

  it("writes the rower's choice under the key the store owns", async () => {
    // The one place this file looks at storage, and it looks AFTER the fact:
    // it pins that the screen and the store agree about where the value
    // lives, so a rename cannot pass by making both sides wrong together.
    await chooseOnTheSettingsScreen("SKIP");
    expect(localStorage.getItem(READY_CARD_KEY)).toBe("skip");
  });
});
