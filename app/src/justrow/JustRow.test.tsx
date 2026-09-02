import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
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

  /**
   * REVIEW #2's own requested regression: Lost → Try again on a SLOW
   * reconnect must not arm until the NEW driver exists. Before the hook
   * nulled the stale name at attempt start, this ordering saw link "up"
   * (pairing) + program "none" + the RETAINED old name, armed with no
   * driver, and failed the retry as transport-missing. The mock is
   * STATEFUL — the component re-reads it each render — and is walked
   * through the real reconnect ordering the hook now produces:
   * disconnected (name retained) → pairing with the name NULLED (the
   * fix's own first patch) → pairing with the name set (driver built).
   */
  it("Lost → Try again on a slow radio arms only once the NEW driver exists", async () => {
    const state: Record<string, unknown> = {
      phase: "disconnected",
      deviceName: "PM5 432331249", // retained by the disconnect, on purpose
    };
    mockSession(state);
    const { default: JustRow } = await import("./JustRow");
    const view = render(
      <MemoryRouter initialEntries={["/justrow"]}>
        <JustRow />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(
      screen.getByRole("heading", { name: "Lost the monitor" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(connect).toHaveBeenCalled();
    expect(beginFreeRow).not.toHaveBeenCalled();

    // The attempt's first patch: pairing, name NULLED (the hook fix). The
    // link axis reads "up" here — the exact window that used to arm on the
    // stale name.
    state.phase = "pairing";
    state.deviceName = null;
    view.rerender(
      <MemoryRouter initialEntries={["/justrow"]}>
        <JustRow />
      </MemoryRouter>,
    );
    expect(beginFreeRow).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Connecting to monitor" }),
    ).toBeInTheDocument();

    // The driver is built and the name it vouches for is published.
    state.deviceName = "PM5 432331249";
    view.rerender(
      <MemoryRouter initialEntries={["/justrow"]}>
        <JustRow />
      </MemoryRouter>,
    );
    expect(beginFreeRow).toHaveBeenCalledTimes(1);
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

/**
 * REVIEW #3 on PR #259 — the supported path, through the REAL hook.
 *
 * The previous round's two pins each stopped at a boundary (the component
 * test at a mocked hook, the hook test at `picking`), so both could stay
 * green if a later `pairing` patch republished the retained name before
 * the new driver existed. This is RF24's own rule applied to the ordering:
 * one test begins upstream of the producer (the real `connect()` against a
 * controllable transport) and asserts after the reader (JustRow's rendered
 * frames and the arm's effect on the wire).
 *
 * The transport's SECOND `connect()` is held on a promise this test
 * releases by hand — the slow radio, made deterministic.
 */
describe("JustRow: Lost → Try again through the real hook", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.doUnmock("../adapters/appLifecycle");
    vi.resetModules();
    localStorage.clear();
    resetHandoffStoreForTests();
  });

  it("holds Connecting through a delayed reconnect, then arms into Ready", async () => {
    let disconnectCb: ((reason: string) => void) | null = null;
    let connectCalls = 0;
    let releaseSecondConnect: (() => void) | null = null;
    const transport = {
      scan: async () => [{ id: "pm5-1", name: "PM5 432331249" }],
      connect: async () => {
        connectCalls += 1;
        if (connectCalls >= 2) {
          await new Promise<void>((resolve) => {
            releaseSecondConnect = resolve;
          });
        }
      },
      write: async () => undefined,
      subscribe: () => () => undefined,
      disconnect: async () => undefined,
      onDisconnect: (cb: (reason: string) => void) => {
        disconnectCb = cb;
        return () => undefined;
      },
    };
    vi.resetModules();
    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: () => transport,
    }));
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(() => (): void => undefined),
    }));

    const { default: JustRow } = await import("./JustRow");
    render(
      <MemoryRouter initialEntries={["/justrow"]}>
        <JustRow />
      </MemoryRouter>,
    );

    // First connection: straight through to Ready — the real arm on the
    // real hook, no mock supplying any state.
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(
      await screen.findByRole("heading", { name: "Ready when you pull" }),
    ).toBeInTheDocument();
    // The keep-on strip wears the SHIPPED interstitial's own class. The
    // approved Ready artboard is "the shipped interstitial, one word
    // changed"; the phase shipped `connected-ready-warning`, a class with
    // zero CSS rules, and James found the bare paragraph at the erg
    // (walk-2026-09-01-jr-exit, finding 3). Structural, so a rename on
    // either side goes red here rather than on a phone.
    expect(screen.getByText("KEEP YOUR PHONE SCREEN ON")).toHaveClass(
      "connected-keep-on",
    );

    // The link dies before any motion: pre-run, so the Lost frame.
    act(() => {
      disconnectCb?.("radio out of range");
    });
    expect(
      await screen.findByRole("heading", { name: "Lost the monitor" }),
    ).toBeInTheDocument();

    // Try again — and the second transport.connect() is HELD. The screen
    // must sit honestly on Connecting: no arm (the retained name is
    // cleared by the attempt's first patch), and no failure.
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Connecting to monitor" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Ready when you pull" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Could not connect" }),
    ).not.toBeInTheDocument();

    // Release the radio: the new driver is built, the name it vouches for
    // is republished, and the arm fires into Ready.
    await act(async () => {
      releaseSecondConnect?.();
      await Promise.resolve();
    });
    expect(
      await screen.findByRole("heading", { name: "Ready when you pull" }),
    ).toBeInTheDocument();
  });
});
