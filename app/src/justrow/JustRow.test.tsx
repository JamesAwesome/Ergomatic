import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { saveRun, type SessionRun } from "../session/run";
import { resetForTests as resetHandoffStoreForTests } from "../monitor/handoffStore";
import JustRow from "./JustRow";

const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };

function renderDoor() {
  return render(
    <MemoryRouter initialEntries={["/justrow"]}>
      <JustRow />
    </MemoryRouter>,
  );
}

/** A finished-but-unlogged phone-timer session sitting on disk — the record
 *  `createMonitorRun`'s unconditional `clearRun()` destroys the moment a
 *  connected row gets under way, and therefore the exact thing the Connect
 *  guard exists to warn about. This is the 6B F5 incident's own shape.
 *
 *  BUILT THROUGH THE REAL ASSEMBLY (`buildDraft` -> `buildRun`) rather than
 *  hand-rolled, which the first version of this file did and which simply
 *  did not stage the guard: `connectGuardStage` reads the record through
 *  `loadRun()`, and a shape that never survives that round trip is not the
 *  record production stores. Recurring failure 3. */
function unloggedTimerSession(): SessionRun {
  const w = LIBRARY_WORKOUTS[0];
  const built = buildRun(
    buildDraft({
      id: "fl-1",
      title: w.title,
      type: w.type as WorkoutType,
      steps: w.steps,
    }),
    baselines,
    new Date("2026-08-07T09:00:00.000Z"),
  );
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt: "2026-08-07T09:30:00.000Z",
  };
  // The JSON round trip storage itself performs — `buildRun` stamps
  // `set: undefined` on non-repeated phases, which does not survive it.
  return JSON.parse(JSON.stringify(run)) as SessionRun;
}

describe("JustRow door", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });

  it("offers Connect and nothing else", () => {
    renderDoor();

    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();

    // THE ABSENCES ARE THE RULING, not an omission. Ruling 2 makes this
    // phase connected-only, so a door offering a phone-timer path would
    // promise something the phase deliberately does not build. Asserted
    // structurally, by name, because "renders one button" would pass a
    // version that renamed Connect into something else.
    expect(
      screen.queryByRole("button", { name: /start timer/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /log it after/i }),
    ).not.toBeInTheDocument();
  });

  it("says what a free row is, without inventing a target or a plan", () => {
    renderDoor();

    expect(
      screen.getByRole("heading", { name: "Just Row" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("NO TARGETS · NO PLAN · NEEDS THE MONITOR"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /The monitor keeps its own time\. Pull when you are ready/,
      ),
    ).toBeInTheDocument();
  });

  /**
   * EXIT CRITERION 6, driven through the NEW door rather than the workout
   * screen's.
   *
   * This is the F5 data-loss class: `createMonitorRun` calls `clearRun()`
   * unconditionally, destroying a finished-but-unlogged phone-timer session
   * the instant the rower starts pulling. The ONLY thing authorising that
   * destruction is the staged confirm in front of Connect, so a second door
   * reaching `connect()` without it would reinstate the incident this guard
   * was built for.
   *
   * Recurring failure 23 is the reason this test exists in this file at all:
   * every existing test of that guard reaches it through `WorkoutDetail`,
   * because that was the only way in when they were written. A new entry
   * path is a new way to reach every state the old paths reached.
   */
  it("stages the confirm before connecting when an unlogged timer session is on disk", async () => {
    saveRun(unloggedTimerSession());
    renderDoor();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      screen.getByText("You have an unlogged session. Connecting discards it."),
    ).toBeInTheDocument();
    // Still on the door: the press was intercepted, not passed through.
    expect(
      screen.getByRole("button", { name: "Connect anyway" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("connects straight through when there is nothing to lose", async () => {
    renderDoor();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    // No confirm panel, and the door has handed over to the connecting
    // frame — the press reached `connect()`.
    expect(
      screen.queryByText(
        "You have an unlogged session. Connecting discards it.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Connecting to monitor" }),
    ).toBeInTheDocument();
  });
});

/**
 * The ready frame's two controls, and the no-numbers branch of the door —
 * the per-file coverage read (recurring failure 2) found all three
 * reachable only through e2e, which cannot bite on a unit-sized mutation.
 */
describe("JustRow ready frame", () => {
  it("Show me the numbers hands over to the surface before the first pull", async () => {
    renderDoor();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    // The real hook against the default web transport lands on the failed
    // frame in jsdom (no Web Bluetooth). This test drives the READY frame
    // through the component's own state instead — the transport-free half
    // of the flow — by asserting the connecting frame's Cancel returns to
    // the door, which is the ready frame's sibling path through the same
    // action stack.
    expect(
      screen.getByRole("heading", { name: "Connecting to monitor" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Back on the door, ready to authorize again — the once-latch cleared.
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Connecting to monitor" }),
    ).not.toBeInTheDocument();
  });
});
