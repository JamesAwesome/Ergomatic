import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitorSession } from "../monitor/useMonitorSession";
import { useMonitorSession } from "../monitor/useMonitorSession";
import { resetForTests as resetHandoffStoreForTests } from "../monitor/handoffStore";
import JustRow from "./JustRow";

/**
 * THE FREE-ROW DOOR'S OWN REFUSAL FRAME (Phase MT, whole-branch review
 * finding 3).
 *
 * The spec required this and the branch shipped without it: every line Phase
 * MT added to `JustRow.tsx` was uncovered — the headline branch, the
 * `.slice()` that stops the first line printing twice, and the support link.
 * `JustRow.test.tsx` drives the REAL hook over stubbed Web Bluetooth, which
 * cannot reach a machine refusal, so this file mocks the hook instead. Same
 * idiom `ConnectedInterstitial.test.tsx` already uses, kept in its own file so
 * that suite's real-hook posture is left alone.
 *
 * What it gates is the door-specific rendering, not the classification — the
 * driver and hook tests own that, from real wire bytes.
 */
vi.mock("../monitor/useMonitorSession", async () => {
  const actual = await vi.importActual<
    typeof import("../monitor/useMonitorSession")
  >("../monitor/useMonitorSession");
  return { ...actual, useMonitorSession: vi.fn() };
});

const mockUseMonitorSession = vi.mocked(useMonitorSession);

const REFUSAL_DETAIL =
  "Erg type not supported\nThis monitor is on a SkiErg. Nothing here will start.";

function session(overrides: Partial<MonitorSession> = {}): MonitorSession {
  return {
    phase: "idle",
    undecodable: false,
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
    connect: vi.fn().mockResolvedValue(undefined),
    program: vi.fn().mockResolvedValue(undefined),
    beginFreeRow: vi.fn(),
    endSession: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    retryHandoffSave: vi.fn().mockResolvedValue(undefined),
    proceedHandoff: vi.fn().mockResolvedValue(undefined),
    exportLog: vi.fn().mockReturnValue("[]"),
    ...overrides,
  };
}

/** The door renders its failure frame only once the rower has pressed
 *  Connect, so every test here presses it first — the supported path in, not
 *  a prop that forces the state. */
async function openRefusal(
  overrides: Partial<MonitorSession> = {},
): Promise<void> {
  mockUseMonitorSession.mockReturnValue(session({ phase: "idle" }));
  const view = render(
    <MemoryRouter initialEntries={["/justrow"]}>
      <Routes>
        <Route path="/justrow" element={<JustRow />} />
        <Route
          path="/news/connect-the-monitor"
          element={<h1>Connect the monitor</h1>}
        />
      </Routes>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  mockUseMonitorSession.mockReturnValue(
    session({
      phase: "failed",
      error: { reason: "unsupported-machine", detail: REFUSAL_DETAIL },
      ...overrides,
    }),
  );
  view.rerender(
    <MemoryRouter initialEntries={["/justrow"]}>
      <Routes>
        <Route path="/justrow" element={<JustRow />} />
        <Route
          path="/news/connect-the-monitor"
          element={<h1>Connect the monitor</h1>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("JustRow: an unsupported erg machine", () => {
  beforeEach(() => {
    // ConnectAction hides its Connect press behind a platform check; without a
    // Bluetooth stub the press is inert and every assertion here fails against
    // the door rather than the failure frame. Same stub `JustRow.test.tsx`
    // installs, for the same reason.
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        requestDevice: vi.fn().mockRejectedValue(new Error("Test scan failed")),
      },
    });
    localStorage.clear();
    // Without this the Connect press stages the unlogged-record confirm
    // instead of proceeding, `started` never flips, and every assertion here
    // fails against the door rather than the failure frame.
    resetHandoffStoreForTests();
    mockUseMonitorSession.mockReset();
  });

  /**
   * The headline is hard-coded "Could not connect" for every other failure
   * this frame has, and it is TRUE for all of them. It is a lie here: we
   * connected perfectly, which is exactly how we know what the machine is.
   */
  it("takes its headline from the message, never the hard-coded 'Could not connect'", async () => {
    await openRefusal();

    expect(
      screen.getByRole("heading", { name: "Erg type not supported" }),
    ).toBeVisible();
    expect(screen.queryByText("Could not connect")).not.toBeInTheDocument();
  });

  /** The first line is the headline, so it must not print again below it —
   *  the `.slice()` branch. Without it the rower reads the same sentence
   *  twice, which no assertion about the headline alone would notice. */
  it("does not repeat the headline as a body line", async () => {
    await openRefusal();

    expect(
      screen.getAllByText("Erg type not supported", { exact: true }),
    ).toHaveLength(1);
    expect(
      screen.getByText("This monitor is on a SkiErg. Nothing here will start."),
    ).toBeVisible();
  });

  it("offers the support matrix, and going there carries the door's own route back", async () => {
    await openRefusal();

    const link = screen.getByRole("link", { name: /which ergs work/i });
    expect(link).toHaveAttribute("href", "/news/connect-the-monitor");

    await userEvent.click(link);
    expect(
      screen.getByRole("heading", { name: "Connect the monitor" }),
    ).toBeVisible();
  });

  /** Every OTHER failure keeps the fixed headline. Without this, a change that
   *  routed all reasons through the detail would go unnoticed. */
  it("leaves every other failure's headline alone", async () => {
    await openRefusal({
      error: {
        reason: "link-failed",
        detail: "The link to the monitor failed.",
      },
    });

    expect(
      screen.getByRole("heading", { name: "Could not connect" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /which ergs work/i }),
    ).not.toBeInTheDocument();
  });
});
