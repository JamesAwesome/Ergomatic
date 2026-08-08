// Two strategies, deliberately, not one (the file is long enough to
// deserve saying why up front):
//
// - **Rendering per phase+error fixture** (`describe("rendering...")` and
//   `describe("failed: every ConnectedError")` below) mocks
//   `useMonitorSession` outright. This screen's whole job is "render
//   whatever `MonitorSession` the hook hands it" — the hook's OWN mapping
//   from a driver/transport outcome to a `ConnectedError` is Task 4's
//   proven territory (`useMonitorSession.test.ts`, 100% coverage, its own
//   mutation pass). Re-deriving `structure-mismatch`'s exact hardware race
//   here (a machine caught rowing at the instant `program()` dispatches,
//   `driver.test.ts:5707`'s own multi-tick setup) would test the DRIVER a
//   second time, not this screen's rendering — a hand-built `ConnectedError`
//   fixture pins the RENDER, which is what this file owns. Its `detail`/
//   `raw` strings are copied VERBATIM from production, though (task-5
//   review, MEDIUM-6): `detail` is `ProgramRejectionError.message`
//   (`driver.ts`'s `REJECTION_VERBS["structure-mismatch"]`, `atFrame: -1`),
//   `raw` is `hexTrace`, one of `settleVerifyFailure`'s own
//   `structure-mismatch` detail strings built from
//   `describeStructureMismatch` (`driver.ts:1781-1786`) — not an invented
//   shape, so the render pin is honest about what a rower would actually
//   see.
// - **The interstitial walk** (`describe("the interstitial walk,
//   fake-driven")`) does NOT mock the hook: `useMonitorSession` is real,
//   wired to `transports/fake.ts`'s CSAFE-correct simulator — the same
//   fake `useMonitorSession.test.ts` itself is driven by — so this proves
//   the actual wiring (this component really does call `connect()` then
//   `program()` at the right moments, on a REAL compiled library workout)
//   end to end, not just that the render function is correct in isolation.

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import type { Transport } from "../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { buildDraft } from "../session/draft";
import { buildRun, type EnginePhase } from "../session/engine";
import { createFakeTransport } from "../monitor/transports/fake";
import {
  useMonitorSession,
  type ConnectedError,
  type MonitorSession,
  type RunIdentity,
} from "../monitor/useMonitorSession";
import ConnectedInterstitial, {
  READY_DWELL_MS,
  loadLastDevice,
  saveLastDevice,
} from "./ConnectedInterstitial";

vi.mock("../monitor/useMonitorSession", async () => {
  const actual = await vi.importActual<
    typeof import("../monitor/useMonitorSession")
  >("../monitor/useMonitorSession");
  return { ...actual, useMonitorSession: vi.fn() };
});

const mockUseMonitorSession = vi.mocked(useMonitorSession);

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE_NAME = "PM5 432331249";

/** The realistic fixture the repo convention requires — a real seeded
 *  library workout through the real assembly (`buildDraft` -> `buildRun`
 *  -> `compileProgram`), not a hand-built minimum. "Filling Low" compiles
 *  to 4 intervals: an 8:00 warmup (no rest) then 3 x 2000 m / 3:00 rest. */
function fillingLow(): {
  program: WorkoutProgram;
  phases: EnginePhase[];
  identity: RunIdentity;
} {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "filling-low",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0).phases;
  const compiled = compileProgram(phases);
  if ("code" in compiled) {
    throw new Error(`fixture failed to compile: ${compiled.code}`);
  }
  return {
    program: compiled,
    phases,
    identity: { workoutId: "filling-low", title: w.title },
  };
}

const FIXTURE = fillingLow();

function session(overrides: Partial<MonitorSession> = {}): MonitorSession {
  return {
    phase: "idle",
    error: null,
    deviceName: null,
    frame: null,
    actuals: [],
    endedBy: null,
    connect: vi.fn().mockResolvedValue(undefined),
    program: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderInterstitial(
  overrides: Partial<MonitorSession> = {},
  props: Partial<{
    onExit: () => void;
    onRowInstead: () => void;
    onEnded: () => void;
    nudgedCount: number;
  }> = {},
) {
  const current = session(overrides);
  mockUseMonitorSession.mockReturnValue(current);
  const onExit = props.onExit ?? vi.fn();
  const onRowInstead = props.onRowInstead ?? vi.fn();
  const onEnded = props.onEnded ?? vi.fn();
  const view = render(
    <ConnectedInterstitial
      program={FIXTURE.program}
      phases={FIXTURE.phases}
      identity={FIXTURE.identity}
      baselines={baselines}
      nudgedCount={props.nudgedCount ?? 0}
      onExit={onExit}
      onRowInstead={onRowInstead}
      onEnded={onEnded}
    />,
  );
  return { ...view, session: current, onExit, onRowInstead, onEnded };
}

function connectedError(
  over: Partial<ConnectedError> & { reason: ConnectedError["reason"] },
): ConnectedError {
  return { detail: "detail", ...over };
}

beforeEach(() => {
  mockUseMonitorSession.mockReset();
  localStorage.clear();
});

describe("saveLastDevice / loadLastDevice — the LAST USED caption's own storage", () => {
  it("round-trips a device name", () => {
    saveLastDevice("PM5 430123456");
    expect(loadLastDevice()).toBe("PM5 430123456");
  });

  it("null before any pair has ever succeeded", () => {
    expect(loadLastDevice()).toBeNull();
  });

  it("a getItem failure (private-mode Safari, disabled storage) reads as null, not a throw", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("storage disabled", "SecurityError");
      });
    expect(loadLastDevice()).toBeNull();
    spy.mockRestore();
  });

  it("a setItem failure is swallowed — best effort, never interrupts the caller", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    expect(() => saveLastDevice("PM5 430123456")).not.toThrow();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// No spinner, anywhere (handoff §2, DEVIATIONS #5) — a DOM assertion on the
// ABSENCE, not an eyeball check, so a spinner-class element landing in any
// state fails loudly.
// ---------------------------------------------------------------------------

describe("no spinner anywhere", () => {
  const phases: MonitorSession["phase"][] = [
    "pairing",
    "programming",
    "ready",
    "failed",
  ];

  it.each(phases)("phase %s has no spinner-class element", (phase) => {
    const { container } = renderInterstitial({
      phase,
      deviceName: phase === "idle" ? null : DEVICE_NAME,
      error:
        phase === "failed"
          ? connectedError({
              reason: "scan-dismissed",
              detail: "No monitor was picked.",
            })
          : null,
    });
    expect(container.querySelectorAll('[class*="spinner" i]')).toHaveLength(0);
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// States 1-3 (the OS chooser): descoped — render nothing of ours.
// ---------------------------------------------------------------------------

describe("states 1-3 (picking): nothing of ours renders", () => {
  it.each(["idle", "picking"] as const)("phase %s renders nothing", (phase) => {
    const { container } = renderInterstitial({ phase });
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------
// State 4: pairing
// ---------------------------------------------------------------------------

describe("state 4: pairing", () => {
  it("renders the device name, 'Connecting', and the checklist's first two markers", () => {
    renderInterstitial({ phase: "pairing", deviceName: DEVICE_NAME });

    expect(screen.getByText(DEVICE_NAME)).toBeInTheDocument();
    expect(screen.getByText("Connecting")).toBeInTheDocument();
    expect(screen.getByText("FOUND")).toBeInTheDocument();
    // LOW-5, task-5 review: present tense while it's the CURRENT line —
    // "CONNECTING", not the past-tense "CONNECTED" the canonical triple
    // otherwise uses (that reading applies once state 5 marks it done).
    expect(
      screen.getByText("CONNECTING", {
        selector: ".connected-checklist-current",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("SENDING THE WORKOUT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("falls back to a generic status label before the device name is known", () => {
    renderInterstitial({ phase: "pairing", deviceName: null });
    expect(
      screen.getByText("CONNECTING", { selector: ".connected-status-label" }),
    ).toBeInTheDocument();
  });

  it("Cancel calls session.cancel() and hands back to the caller", async () => {
    const { session: s, onExit } = renderInterstitial({
      phase: "pairing",
      deviceName: DEVICE_NAME,
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(s.cancel).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// State 5: programming — the checklist, the WHAT panel, no interval counter
// ---------------------------------------------------------------------------

describe("state 5: programming", () => {
  it("shows the WHAT THE MONITOR IS GETTING panel with interval count, baselines, and nudge count", () => {
    renderInterstitial(
      { phase: "programming", deviceName: DEVICE_NAME },
      { nudgedCount: 3 },
    );

    expect(screen.getByText("Sending the workout")).toBeInTheDocument();
    expect(screen.getByText("WHAT THE MONITOR IS GETTING")).toBeInTheDocument();
    expect(
      screen.getByText(`${FIXTURE.program.intervals.length} INTERVALS`),
    ).toBeInTheDocument();
    expect(screen.getByText("2K 1:52.0 · 6K 2:02.0")).toBeInTheDocument();
    expect(screen.getByText("3 NUDGED")).toBeInTheDocument();
  });

  it("carries NO interval counter (spec's I7 ruling) — 'INTERVAL' never appears on this screen", () => {
    const { container } = renderInterstitial({
      phase: "programming",
      deviceName: DEVICE_NAME,
    });
    expect(container.textContent).not.toMatch(/INTERVAL\s+\d+\s+OF\s+\d+/i);
  });

  it("a single-interval program reads '1 INTERVAL', singular (LOW-6)", () => {
    const one: WorkoutProgram = {
      intervals: [
        {
          kind: "time",
          value: 120,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 0,
        },
      ],
    };
    mockUseMonitorSession.mockReturnValue(
      session({ phase: "programming", deviceName: DEVICE_NAME }),
    );
    render(
      <ConnectedInterstitial
        program={one}
        phases={FIXTURE.phases}
        identity={FIXTURE.identity}
        baselines={baselines}
        nudgedCount={0}
        onExit={vi.fn()}
        onRowInstead={vi.fn()}
        onEnded={vi.fn()}
      />,
    );
    expect(screen.getByText("1 INTERVAL")).toBeInTheDocument();
    expect(screen.queryByText("1 INTERVALS")).not.toBeInTheDocument();
  });

  it("status label reads '<device> · CONNECTED'", () => {
    renderInterstitial({ phase: "programming", deviceName: DEVICE_NAME });
    expect(screen.getByText(`${DEVICE_NAME} · CONNECTED`)).toBeInTheDocument();
  });

  it("falls back to the generic status label if deviceName is somehow still null", () => {
    renderInterstitial({ phase: "programming", deviceName: null });
    expect(screen.getByText("CONNECTING · CONNECTED")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// State 6: failed — every ConnectedError rendered
// ---------------------------------------------------------------------------

describe("state 6: failed — every ConnectedError rendered", () => {
  it("a MACHINE reason (structure-mismatch) gets the generic serif line and the DETAIL panel carries the observed-vs-expected triple", () => {
    // Task-5 review, MEDIUM-6: the real shape, not a hand-invented one —
    // `detail` is `ProgramRejectionError.message` (`driver.ts`'s
    // `REJECTION_VERBS["structure-mismatch"]`, `atFrame: -1` since this is
    // a verify-phase rejection, never a send-phase one); `raw` is
    // `hexTrace`, one of `settleVerifyFailure`'s two `structure-mismatch`
    // detail strings (`driver.ts:1691-1692`), itself built from
    // `describeStructureMismatch` (`driver.ts:1781-1786`)'s own
    // observed-vs-expected phrasing.
    const triple =
      "3 consecutive armed tick(s) reporting the same wrong structure — " +
      "observed workoutType=1 durationRaw=0 durationType=128; " +
      "expected workoutType=0 durationRaw=480 durationType=0 " +
      "(the sent program's interval 0)";
    renderInterstitial({
      phase: "failed",
      deviceName: DEVICE_NAME,
      error: connectedError({
        reason: "structure-mismatch",
        detail:
          'PM5 reported "armed" while holding a different workout than the one just sent',
        raw: triple,
      }),
    });

    expect(
      screen.getByText("The monitor wouldn't take it"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "End whatever is showing on the monitor, then try again.",
      ),
    ).toBeInTheDocument();
    const detail = screen.getByText("DETAIL").closest("div")!;
    expect(within(detail).getByText("STRUCTURE-MISMATCH")).toBeInTheDocument();
    expect(within(detail).getByText(triple)).toBeInTheDocument();
    expect(
      screen.getByText("YOUR WORKOUT AND NUDGES ARE KEPT"),
    ).toBeInTheDocument();
  });

  it.each([
    ["nak", "PM5 rejected frame 3"],
    ["bad", "PM5 reported the frame as malformed (bad)"],
    ["not-ready", "PM5 reported not ready"],
    ["garbled", "PM5 returned a frame this driver could not even parse"],
    ["timeout", "PM5 never acked (ack-timeout policy)"],
    ["not-observed", 'PM5 never reported "armed"'],
  ] as const)(
    "machine reason '%s' also gets the generic serif line, never its own detail as the headline",
    (reason, detail) => {
      renderInterstitial({
        phase: "failed",
        deviceName: DEVICE_NAME,
        error: connectedError({ reason, detail }),
      });
      expect(
        screen.getByText("The monitor wouldn't take it"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(detail, { selector: ".connected-serif-line" }),
      ).toBeNull();
    },
  );

  function serifText(): string {
    return document.querySelector(".connected-serif-line")!.textContent ?? "";
  }

  it("busy reads its own copy-ready detail as the serif line", () => {
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "busy",
        detail: "A programming attempt is already in flight.",
      }),
    });
    expect(serifText()).toBe("A programming attempt is already in flight.");
  });

  it("transport-missing reads its own detail", () => {
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "transport-missing",
        detail: "This device has no Bluetooth transport.",
      }),
    });
    expect(serifText()).toBe("This device has no Bluetooth transport.");
  });

  it("scan-dismissed reads its own detail", () => {
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "scan-dismissed",
        detail: "No monitor was picked.",
      }),
    });
    expect(serifText()).toBe("No monitor was picked.");
  });

  // MEDIUM-7, task-5 review: `disconnected` IS one of the eight
  // `ProgramRejectionReason` values (a real machine-reported rejection
  // reason), but it means the LINK died mid-conversation, not that the PM5
  // looked at the workout and refused it — the generic "The monitor
  // wouldn't take it" + "End whatever is showing on the monitor" copy would
  // be actively wrong (there is nothing to end; the link is gone).
  it("disconnected reads its own detail, not the generic machine-refusal copy", () => {
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "disconnected",
        detail: "PM5 disconnected before completing",
      }),
    });
    expect(serifText()).toBe("PM5 disconnected before completing");
    expect(
      screen.queryByText(
        "End whatever is showing on the monitor, then try again.",
      ),
    ).not.toBeInTheDocument();
  });

  // The named inherited obligation: link-failed must NOT read like
  // bluetooth-off — proven by asserting the two ACTUAL production detail
  // strings (`useMonitorSession.ts`'s own mappers) render as different
  // serif lines, not by comparing two strings this test invented itself.
  it("link-failed's copy differs from bluetooth-off's", () => {
    const { unmount } = renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "bluetooth-off",
        detail: "Bluetooth isn't available.",
      }),
    });
    const bluetoothOffSerif = serifText();
    expect(bluetoothOffSerif).toBe("Bluetooth isn't available.");
    unmount();

    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "link-failed",
        detail: "The link to the monitor failed while programming.",
      }),
    });
    expect(serifText()).toBe(
      "The link to the monitor failed while programming.",
    );
    expect(serifText()).not.toBe(bluetoothOffSerif);
  });

  it("Row on the phone timer instead cancels the session and hands off with targets intact", async () => {
    const { session: s, onRowInstead } = renderInterstitial({
      phase: "failed",
      deviceName: DEVICE_NAME,
      error: connectedError({
        reason: "scan-dismissed",
        detail: "No monitor was picked.",
      }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Row on the phone timer instead" }),
    );

    expect(s.cancel).toHaveBeenCalledTimes(1);
    expect(onRowInstead).toHaveBeenCalledTimes(1);
  });

  it("Cancel is present and last", () => {
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "scan-dismissed",
        detail: "No monitor was picked.",
      }),
    });
    const buttons = screen.getAllByRole("button");
    expect(buttons.at(-1)).toHaveTextContent("Cancel");
  });
});

// ---------------------------------------------------------------------------
// Try again: inert unless phase === "failed"
// ---------------------------------------------------------------------------

describe("Try again — inert unless phase === 'failed'", () => {
  it.each(["pairing", "programming", "ready"] as const)(
    "does not render at all during phase %s",
    (phase) => {
      renderInterstitial({ phase, deviceName: DEVICE_NAME });
      expect(
        screen.queryByRole("button", { name: "Try again" }),
      ).not.toBeInTheDocument();
    },
  );

  it("renders and is enabled once failed", () => {
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "scan-dismissed",
        detail: "No monitor was picked.",
      }),
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("a device already known: Try again retries program(), not connect()", async () => {
    const { session: s } = renderInterstitial({
      phase: "failed",
      deviceName: DEVICE_NAME,
      error: connectedError({ reason: "nak", detail: "PM5 rejected frame 3" }),
    });
    // The mount effect already calls connect() once — clear it so the
    // assertion below is unambiguous about the BUTTON PRESS's own call.
    vi.mocked(s.connect).mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(s.program).toHaveBeenCalledWith(FIXTURE.program, FIXTURE.identity);
    expect(s.connect).not.toHaveBeenCalled();
  });

  it("no device ever known: Try again reopens the picker via connect()", async () => {
    const { session: s } = renderInterstitial({
      phase: "failed",
      deviceName: null,
      error: connectedError({
        reason: "scan-dismissed",
        detail: "No monitor was picked.",
      }),
    });

    // The mount effect already calls connect() once — clear that call so
    // the assertion below is unambiguous about the BUTTON PRESS's own call.
    vi.mocked(s.connect).mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(s.connect).toHaveBeenCalledTimes(1);
    expect(s.program).not.toHaveBeenCalled();
  });

  // The double-press race (this screen's own L-1-shaped guard): two clicks
  // landing before React's state update from the first has been observed
  // by this component must still produce exactly ONE retry attempt.
  it("a synchronous double click retries exactly once", async () => {
    const { session: s } = renderInterstitial({
      phase: "failed",
      deviceName: DEVICE_NAME,
      error: connectedError({ reason: "nak", detail: "PM5 rejected frame 3" }),
    });
    const button = screen.getByRole("button", { name: "Try again" });

    act(() => {
      button.click();
      button.click();
    });

    expect(s.program).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// State 7: ready — the 1.2s dwell, and the skip
// ---------------------------------------------------------------------------

describe("state 7: ready", () => {
  it("shows 'Ready when you pull' and the single-sentence body line", () => {
    renderInterstitial({ phase: "ready", deviceName: DEVICE_NAME });
    expect(screen.getByText("Ready when you pull")).toBeInTheDocument();
    expect(
      screen.getByText("The monitor starts the clock on your first stroke."),
    ).toBeInTheDocument();
    expect(screen.getByText(`${DEVICE_NAME} · PROGRAMMED`)).toBeInTheDocument();
  });

  // LOW-2, task-5 review: the old fallback produced a bare leading-space
  // " · PROGRAMMED" when `deviceName` was null (unreachable in practice —
  // `ready` never arrives without a device — but a defensive fallback
  // should still read cleanly if it's ever hit).
  it("falls back to a clean 'PROGRAMMED' with no leading separator if deviceName is somehow still null", () => {
    renderInterstitial({ phase: "ready", deviceName: null });
    expect(screen.getByText("PROGRAMMED")).toBeInTheDocument();
    expect(screen.queryByText(/^\s*·/)).not.toBeInTheDocument();
  });

  it("'Show me the numbers' is the screen's one L1 and skips straight to the phase gate", async () => {
    renderInterstitial({ phase: "ready", deviceName: DEVICE_NAME });
    const skip = screen.getByRole("button", { name: "Show me the numbers" });
    expect(skip).toHaveClass("button-l1");

    await userEvent.click(skip);

    expect(screen.queryByText("Ready when you pull")).not.toBeInTheDocument();
    // Past the gate: the connected surface, not the interstitial (Task 6
    // replaced Task 5's one-line placeholder here).
    expect(
      screen.getByRole("navigation", { name: "Connected panes" }),
    ).toBeInTheDocument();
  });

  // HIGH-2, task-5 review: the handoff's §2, verbatim — "Cancel is present
  // in every state, always last." State 7 shipped without it; this is the
  // regression pin.
  it("Cancel is present and last (handoff §2: 'present in every state, always last')", () => {
    renderInterstitial({ phase: "ready", deviceName: DEVICE_NAME });
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toStrictEqual([
      "Show me the numbers",
      "Cancel",
    ]);
  });

  it("Cancel calls session.cancel() (the ready-phase terminate, DEVIATIONS row 57) and hands back to the caller", async () => {
    const { session: s, onExit } = renderInterstitial({
      phase: "ready",
      deviceName: DEVICE_NAME,
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(s.cancel).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("auto-advances to the phase gate after 1.2s with no press (fake timers — the one sanctioned timer)", () => {
    vi.useFakeTimers();
    try {
      renderInterstitial({ phase: "ready", deviceName: DEVICE_NAME });
      expect(screen.getByText("Ready when you pull")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(READY_DWELL_MS - 1);
      });
      expect(screen.getByText("Ready when you pull")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByText("Ready when you pull")).not.toBeInTheDocument();
      expect(
        screen.getByRole("navigation", { name: "Connected panes" }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// The phase gate (Task 5's seam choice) — live/paused/disconnected/ended
// ---------------------------------------------------------------------------

describe("the phase gate — the connected surface (Task 6)", () => {
  it.each(["live", "paused", "disconnected"] as const)(
    "phase %s hands off to the three-pane surface",
    (phase) => {
      renderInterstitial({ phase, deviceName: DEVICE_NAME });
      expect(
        screen.getByRole("navigation", { name: "Connected panes" }),
      ).toBeInTheDocument();
    },
  );

  // `ended` is the one phase past the gate that is NOT a pane: the surface
  // renders its hand-off frame and fires `onEnded`, whose caller navigates
  // (ConnectedSurface.tsx's mount decision).
  it("phase ended renders the hand-off frame and calls onEnded once", () => {
    const onEnded = vi.fn();
    renderInterstitial(
      { phase: "ended", deviceName: DEVICE_NAME },
      { onEnded },
    );
    expect(screen.getByText("SESSION ENDED")).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Connected panes" }),
    ).not.toBeInTheDocument();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The interstitial walk, fake-driven — the real hook, the real driver, the
// real (simulated) PM5, on a real compiled library workout.
// ---------------------------------------------------------------------------

describe("the interstitial walk, fake-driven", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connect -> pairing -> programming -> ready -> (Show me the numbers) -> the phase gate, on a real compiled library workout", async () => {
    vi.doUnmock("../monitor/useMonitorSession");
    const real = await vi.importActual<
      typeof import("../monitor/useMonitorSession")
    >("../monitor/useMonitorSession");
    mockUseMonitorSession.mockImplementation(real.useMonitorSession);

    const fake = createFakeTransport({
      program: FIXTURE.program,
      deviceName: DEVICE_NAME,
    });

    render(
      <ConnectedInterstitial
        program={FIXTURE.program}
        phases={FIXTURE.phases}
        identity={FIXTURE.identity}
        baselines={baselines}
        nudgedCount={0}
        onExit={vi.fn()}
        onRowInstead={vi.fn()}
        onEnded={vi.fn()}
        deps={{
          createTransport: () => fake,
          now: () => t0,
          driverOptions: { settleTicks: 0, prepareSettleTicks: 0 },
        }}
      />,
    );

    await screen.findByText("Connecting");

    // Pumps the fake's own ack-gated programming exchange (chunk-by-chunk
    // microtask hops, never timed — the same `flush`/`tick(0)` pattern
    // `useMonitorSession.test.ts`'s own harness uses) until "armed" lands.
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        fake.tick(0);
        await Promise.resolve();
      });
      if (screen.queryByText("Ready when you pull")) break;
    }

    await screen.findByText("Ready when you pull");
    expect(screen.getByText(`${DEVICE_NAME} · PROGRAMMED`)).toBeInTheDocument();
    // Handoff §1: "After a first successful pair" — the real device name
    // this walk just paired with is on record for the button's own
    // LAST USED caption next time.
    expect(loadLastDevice()).toBe(DEVICE_NAME);

    await userEvent.click(
      screen.getByRole("button", { name: "Show me the numbers" }),
    );

    // The real surface, on the real hook, past the real gate: pane B
    // (the first-connected-session landing pane) with the real device's
    // own advertised name in its connection line.
    expect(
      screen.getByRole("navigation", { name: "Connected panes" }),
    ).toBeInTheDocument();
    expect(screen.getByText(DEVICE_NAME)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Live pane" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("no Bluetooth transport on this platform: a real transport-missing failure, no fake required", async () => {
    vi.doUnmock("../monitor/useMonitorSession");
    const real = await vi.importActual<
      typeof import("../monitor/useMonitorSession")
    >("../monitor/useMonitorSession");
    mockUseMonitorSession.mockImplementation(real.useMonitorSession);

    render(
      <ConnectedInterstitial
        program={FIXTURE.program}
        phases={FIXTURE.phases}
        identity={FIXTURE.identity}
        baselines={baselines}
        nudgedCount={0}
        onExit={vi.fn()}
        onRowInstead={vi.fn()}
        onEnded={vi.fn()}
        deps={{ createTransport: () => null, now: () => t0 }}
      />,
    );

    expect(
      await screen.findByText("This device has no Bluetooth transport.", {
        selector: ".connected-serif-line",
      }),
    ).toBeInTheDocument();
  });

  it("a dismissed OS picker: a real scan-dismissed failure, no fake required", async () => {
    vi.doUnmock("../monitor/useMonitorSession");
    const real = await vi.importActual<
      typeof import("../monitor/useMonitorSession")
    >("../monitor/useMonitorSession");
    mockUseMonitorSession.mockImplementation(real.useMonitorSession);

    const emptyPicker: Transport = {
      scan: () => Promise.resolve([]),
      connect: () => Promise.resolve(),
      write: () => Promise.resolve(),
      subscribe: () => () => undefined,
      disconnect: () => Promise.resolve(),
      onDisconnect: () => () => undefined,
    };

    render(
      <ConnectedInterstitial
        program={FIXTURE.program}
        phases={FIXTURE.phases}
        identity={FIXTURE.identity}
        baselines={baselines}
        nudgedCount={0}
        onExit={vi.fn()}
        onRowInstead={vi.fn()}
        onEnded={vi.fn()}
        deps={{ createTransport: () => emptyPicker, now: () => t0 }}
      />,
    );

    expect(
      await screen.findByText("No monitor was picked.", {
        selector: ".connected-serif-line",
      }),
    ).toBeInTheDocument();
  });
});
