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

    // No confirm panel — the press reached `connect()`. In jsdom the real
    // default transport is MISSING, and the honest screen for that is the
    // FAILED frame (review #1, finding 5): before it existed, this exact
    // state fell through to "Connecting to monitor" forever, and this
    // test pinned the false promise as if it were the design.
    expect(
      screen.queryByText(
        "You have an unlogged session. Connecting discards it.",
      ),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Could not connect" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
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

    // The real hook against the default web transport lands on the FAILED
    // frame in jsdom (no Web Bluetooth) — review #1's finding 5 made that
    // an honest screen rather than the forever-Connecting one this test
    // used to pin. Cancel from it returns to the door with the once-latch
    // cleared.
    expect(
      await screen.findByRole("heading", { name: "Could not connect" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Back on the door, ready to authorize again — the once-latch cleared.
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Could not connect" }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Review #1, findings 1, 4 and 5 — driven with a CONTROLLED session, since
 * the states under test (a slow radio mid-pairing, a scan dismissal, a
 * pre-run link loss) are exactly the ones the real default transport
 * cannot produce on demand in jsdom. The mock carries the full
 * MonitorSession shape; each test overrides only the fields its state is
 * about.
 */
describe("JustRow: the arm gate, the wake lock and the failure frames", () => {
  const keepAwakeOn = vi.fn().mockResolvedValue(undefined);
  const keepAwakeOff = vi.fn().mockResolvedValue(undefined);
  const beginFreeRow = vi.fn();
  const connect = vi.fn().mockResolvedValue(undefined);

  function mockSession(overrides: Record<string, unknown>) {
    // resetModules FIRST: JustRow was statically imported at this file's
    // top for the earlier describes, and a doMock cannot reach a module
    // already in the cache.
    vi.resetModules();
    vi.doMock("../adapters/keepAwake", () => ({ keepAwakeOn, keepAwakeOff }));
    vi.doMock("../monitor/useMonitorSession", () => ({
      useMonitorSession: () => ({
        phase: "idle",
        error: null,
        deviceName: null,
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
        connect,
        program: vi.fn().mockResolvedValue(undefined),
        beginFreeRow,
        endSession: vi.fn().mockResolvedValue(undefined),
        cancel: vi.fn().mockResolvedValue(undefined),
        retryHandoffSave: vi.fn().mockResolvedValue(undefined),
        proceedHandoff: vi.fn().mockResolvedValue(undefined),
        exportLog: vi.fn().mockReturnValue("[]"),
        ...overrides,
      }),
    }));
  }

  async function renderMocked() {
    const { default: JustRow } = await import("./JustRow");
    return render(
      <MemoryRouter initialEntries={["/justrow"]}>
        <JustRow />
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetHandoffStoreForTests();
  });
  afterEach(() => {
    vi.doUnmock("../adapters/keepAwake");
    vi.doUnmock("../monitor/useMonitorSession");
    vi.resetModules();
  });

  it("does NOT arm mid-pairing while the driver has no name yet — the slow-radio race", async () => {
    // `deriveLink("pairing")` reads "up" BEFORE the transport has actually
    // connected; the null deviceName is the driver-ready fact. Arming here
    // called beginFreeRow with no driver and failed the whole flow as
    // transport-missing (review #1, finding 1).
    mockSession({ phase: "pairing", deviceName: null });
    await renderMocked();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(beginFreeRow).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Connecting to monitor" }),
    ).toBeInTheDocument();
  });

  it("arms once the driver carries the picked device's real name", async () => {
    mockSession({ phase: "pairing", deviceName: "PM5 432331249" });
    await renderMocked();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(beginFreeRow).toHaveBeenCalledTimes(1);
  });

  it("holds the wake lock from Connect and releases it on Cancel", async () => {
    mockSession({ phase: "pairing", deviceName: null });
    await renderMocked();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(keepAwakeOn).toHaveBeenCalledTimes(1);
    expect(keepAwakeOff).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(keepAwakeOff).toHaveBeenCalledTimes(1);
  });

  it("renders the failed frame with the error's own detail and a Try again", async () => {
    mockSession({
      phase: "failed",
      error: {
        reason: "scan-dismissed",
        detail: "No monitor was chosen.",
        raw: "",
      },
    });
    await renderMocked();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      screen.getByRole("heading", { name: "Could not connect" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No monitor was chosen.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    // The retry goes back through the real connect, not a private path.
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("renders the lost frame when the link dies before any run opened", async () => {
    mockSession({ phase: "disconnected", deviceName: "PM5 432331249" });
    await renderMocked();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      screen.getByRole("heading", { name: "Lost the monitor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
