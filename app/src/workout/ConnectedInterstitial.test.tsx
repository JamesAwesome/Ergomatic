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
import type { LogSeed } from "../session/logDraft";
import { createFakeTransport } from "../monitor/transports/fake";
import {
  useMonitorSession,
  type ConnectedError,
  type MonitorSession,
  type RunIdentity,
} from "../monitor/useMonitorSession";
import { canOpenAppSettings, openAppSettings } from "../adapters/appSettings";
import { keepAwakeOn, keepAwakeOff } from "../adapters/keepAwake";
import ConnectedInterstitial, {
  loadLastDevice,
  saveLastDevice,
} from "./ConnectedInterstitial";

vi.mock("../adapters/keepAwake", () => ({
  keepAwakeOn: vi.fn(async () => {}),
  keepAwakeOff: vi.fn(async () => {}),
}));

vi.mock("../monitor/useMonitorSession", async () => {
  const actual = await vi.importActual<
    typeof import("../monitor/useMonitorSession")
  >("../monitor/useMonitorSession");
  return { ...actual, useMonitorSession: vi.fn() };
});

vi.mock("../adapters/appSettings", () => ({
  canOpenAppSettings: vi.fn(() => false),
  openAppSettings: vi.fn(() => Promise.resolve()),
}));

const mockUseMonitorSession = vi.mocked(useMonitorSession);
const mockCanOpenAppSettings = vi.mocked(canOpenAppSettings);
const mockOpenAppSettings = vi.mocked(openAppSettings);

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE_NAME = "PM5 432331249";

// 7C Task 1: `RunIdentity.logSeed` is required now. This file's subject is
// the interstitial's rendering/wiring, not seed content, so one
// placeholder fills the fixture below via a spread.
const TEST_SEED: { logSeed: LogSeed } = {
  logSeed: { steps: [], paces: {} },
};

/** The realistic fixture the repo convention requires — a real seeded
 *  library workout through the real assembly (`buildDraft` -> `buildRun`
 *  -> `compileProgram`), not a hand-built minimum. "Filling Low" compiles
 *  to 3 intervals: 3 x 2000 m / 3:00 rest. (It was four while the workout
 *  carried its own 8:00 `wu` step; since 2026-08-09's warmup setting a
 *  warm-up interval exists only when the ROWER has one set — this fixture
 *  deliberately leaves the setting OFF, the production default, since
 *  nothing in this file is about the warm-up.) */
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
    identity: { workoutId: "filling-low", title: w.title, ...TEST_SEED },
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
    handoffHeld: false,
    frozen: false,
    runOpen: false,
    frameSilence: false,
    connect: vi.fn().mockResolvedValue(undefined),
    program: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    exportLog: vi.fn().mockReturnValue("[]"),
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
    baselines: Baselines | null;
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
      baselines={props.baselines === undefined ? baselines : props.baselines}
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
  mockCanOpenAppSettings.mockReset().mockReturnValue(false);
  mockOpenAppSettings.mockReset().mockResolvedValue(undefined);
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
// States 1-3 (the OS chooser / picking backdrop)
// ---------------------------------------------------------------------------

it("phase idle renders nothing", () => {
  const { container } = renderInterstitial({ phase: "idle" });
  expect(container).toBeEmptyDOMElement();
});

describe("state picking: the backdrop floats under the platform chooser", () => {
  it("phase picking renders the quiet backdrop, not nothing", () => {
    renderInterstitial({ phase: "picking" });
    expect(screen.getByText("Choosing your monitor")).toBeInTheDocument();
  });

  it("holds the wake lock for the WHOLE connected flow: on at mount, off at unmount (the phone slept mid-row on the first tester row, 2026-08-11)", () => {
    // Module-level mocks accumulate across this file's other renders —
    // clear first, assert deltas.
    vi.mocked(keepAwakeOn).mockClear();
    vi.mocked(keepAwakeOff).mockClear();
    const { unmount } = renderInterstitial({ phase: "picking" });
    expect(keepAwakeOn).toHaveBeenCalledTimes(1);
    expect(keepAwakeOff).not.toHaveBeenCalled();
    unmount();
    expect(keepAwakeOff).toHaveBeenCalledTimes(1);
  });

  // The `.app-shell:has(.connected-interstitial)` CSS rule (`index.css:5006`,
  // `:5011`) hides the tab bar for as long as this class is mounted — a
  // deliberate side effect (this component's own header comment on the
  // `picking` branch), not an accident: the chooser is modal, so the same
  // "no tab navigation underneath a connected-flow screen" rule every other
  // interstitial state already gets should apply here too.
  it("mounts .connected-interstitial — the class the tab-bar-hiding CSS hook keys on", () => {
    const { container } = renderInterstitial({ phase: "picking" });
    expect(
      container.querySelector(".connected-interstitial"),
    ).toBeInTheDocument();
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
          type: "work",
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

  // Phase 6I: an effort-only workout can reach this screen with no
  // baselines set at all (WorkoutDetail.tsx's own guard loosening) — the
  // "2K … · 6K …" line has nothing honest to report and is omitted
  // entirely, never a fabricated pair. Everything else on the panel
  // (interval count, nudge count) is unaffected.
  it("Phase 6I: omits the 2K/6K line entirely when baselines is null — never a fabricated pair", () => {
    renderInterstitial(
      { phase: "programming", deviceName: DEVICE_NAME },
      { baselines: null, nudgedCount: 2 },
    );

    expect(screen.getByText("WHAT THE MONITOR IS GETTING")).toBeInTheDocument();
    expect(screen.queryByText(/2K .* · 6K /)).not.toBeInTheDocument();
    // The rest of the panel still renders normally.
    expect(
      screen.getByText(`${FIXTURE.program.intervals.length} INTERVALS`),
    ).toBeInTheDocument();
    expect(screen.getByText("2 NUDGED")).toBeInTheDocument();
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

  // The door: iOS never re-asks for the Bluetooth permission once declined,
  // so the remedy is Settings — the card carries the door (spec §4/§7).
  it("permission-denied renders its own serif line, the §7 body, an Open Settings button when the platform can open one, and raw in the DETAIL panel", () => {
    mockCanOpenAppSettings.mockReturnValue(true);
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "permission-denied",
        detail:
          "Ergomatic can't reach your PM5 without Bluetooth. Allow Bluetooth for Ergomatic in Settings, then come back and try again.",
        raw: "BLE permission denied",
      }),
    });

    expect(screen.getByText("Bluetooth permission needed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ergomatic can't reach your PM5 without Bluetooth. Allow Bluetooth for Ergomatic in Settings, then come back and try again.",
        { selector: ".connected-body-line" },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Settings" }),
    ).toBeInTheDocument();
    // The DETAIL panel is gated only on `error !== null`, with no reason
    // branch — `raw` reaches it for permission-denied the same as every
    // other reason, but nothing pinned that until now.
    const detail = screen.getByText("DETAIL").closest("div")!;
    expect(
      within(detail).getByText("BLE permission denied"),
    ).toBeInTheDocument();
  });

  it("permission-denied renders no Open Settings button when the platform has no door (web)", () => {
    mockCanOpenAppSettings.mockReturnValue(false);
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "permission-denied",
        detail: "Ergomatic can't reach your PM5 without Bluetooth.",
      }),
    });

    expect(screen.getByText("Bluetooth permission needed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Settings" }),
    ).not.toBeInTheDocument();
  });

  it("Open Settings calls the adapter", async () => {
    mockCanOpenAppSettings.mockReturnValue(true);
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "permission-denied",
        detail: "Ergomatic can't reach your PM5 without Bluetooth.",
      }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Open Settings" }),
    );

    expect(mockOpenAppSettings).toHaveBeenCalledTimes(1);
  });

  // Best-effort, same idiom as keepAwake.ts's own catches (this component's
  // own comment on the button): a rejected plugin call must not escape as
  // an unhandled rejection, and the card must not blow up around it.
  it("Open Settings swallows a rejected plugin call — no unhandled rejection, card still stands", async () => {
    mockCanOpenAppSettings.mockReturnValue(true);
    mockOpenAppSettings.mockRejectedValue(new Error("plugin unavailable"));
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "permission-denied",
        detail: "Ergomatic can't reach your PM5 without Bluetooth.",
      }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Open Settings" }),
    );

    expect(mockOpenAppSettings).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Open Settings" }),
    ).toBeInTheDocument();
  });

  it("a permission-denied error NEVER renders the generic machine-refusal copy", () => {
    mockCanOpenAppSettings.mockReturnValue(true);
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "permission-denied",
        detail: "Ergomatic can't reach your PM5 without Bluetooth.",
      }),
    });

    expect(
      screen.queryByText("The monitor wouldn't take it"),
    ).not.toBeInTheDocument();
  });

  // A `permission-denied` error is one of OURS (about the phone side of the
  // radio), never a machine statement — the "End whatever is showing on the
  // monitor" line only makes sense when the PM5 itself refused something,
  // and there was never anything sent for it to refuse here.
  it("a permission-denied error never renders the 'End whatever is showing' machine-refusal body line", () => {
    renderInterstitial({
      phase: "failed",
      error: connectedError({
        reason: "permission-denied",
        detail: "Ergomatic can't reach your PM5 without Bluetooth.",
      }),
    });

    expect(
      screen.queryByText(
        "End whatever is showing on the monitor, then try again.",
      ),
    ).not.toBeInTheDocument();
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
// Phase LL Task 1 (link-truth design spec §1, exit criterion 7): THE RING
// DOOR ON THE FAILURE SCREEN. The 2026-08-20 walk lost its most important
// evidence because the ring was reachable only from `ConnectedSurface`'s
// triple-tap — downstream of the failure that locked it. Proven here on the
// `LINK-FAILED` render path itself (`renderFailureScreen`), never the happy
// path.
// ---------------------------------------------------------------------------

describe("state 6: the ring door (Phase LL Task 1)", () => {
  // A realistic exported-log-shaped string — the shape `eventLog.ts`'s own
  // `record()` produces (recurring failure 3: fixtures emptier than
  // production have hidden shipped defects twice already), including a
  // `liveness-snapshot` entry the way `useMonitorSession.ts`'s `fail()`
  // actually appends one.
  const RING_JSON = JSON.stringify([
    { seq: 0, atMs: 1000, kind: "connect", detail: "PM5 432331249" },
    { seq: 1, atMs: 1010, kind: "subscribe", detail: "ce060031-..." },
    {
      seq: 2,
      atMs: 4200,
      kind: "liveness-snapshot",
      detail: JSON.stringify({
        atMs: 4200,
        armed: false,
        silent: false,
        characteristics: {},
        recentEvents: [],
      }),
    },
  ]);

  it("is present on the failure screen and reads the ring on open", async () => {
    const exportLog = vi.fn().mockReturnValue(RING_JSON);
    renderInterstitial({
      phase: "failed",
      deviceName: DEVICE_NAME,
      exportLog,
      error: connectedError({
        reason: "link-failed",
        detail: "The link to the monitor failed.",
      }),
    });

    expect(exportLog).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "View connection log" }),
    );

    expect(exportLog).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Connection log")).toBeInTheDocument();
    expect(screen.getByText(/· 3 EVENTS ·/)).toBeInTheDocument();
    expect(screen.getByText(/LIVENESS-SNAPSHOT/)).toBeInTheDocument();
  });

  it("closes and can be reopened, re-reading the ring each time", async () => {
    const exportLog = vi.fn().mockReturnValue(RING_JSON);
    renderInterstitial({
      phase: "failed",
      error: connectedError({ reason: "link-failed", detail: "d" }),
      exportLog,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "View connection log" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Connection log")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "View connection log" }),
    );
    expect(exportLog).toHaveBeenCalledTimes(2);
  });

  it("is also present on the disconnected-no-run branch, which shares this same render path", () => {
    renderInterstitial({
      phase: "disconnected",
      runOpen: false,
      exportLog: vi.fn().mockReturnValue(RING_JSON),
    });

    expect(
      screen.getByRole("button", { name: "View connection log" }),
    ).toBeInTheDocument();
  });

  it("says so, rather than nothing, when nothing was recorded before the failure", async () => {
    renderInterstitial({
      phase: "failed",
      error: connectedError({ reason: "transport-missing", detail: "d" }),
      exportLog: vi.fn().mockReturnValue("[]"),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "View connection log" }),
    );

    expect(screen.getByText("NOTHING RECORDED YET")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Try again: inert unless phase is "failed" or "disconnected" (F1, the
// cohort-unlock spec §1 — the second call site's disabled button was the
// 2026-08-23 walk's dead-button finding, not belt-and-braces)
// ---------------------------------------------------------------------------

describe("Try again — inert unless phase is 'failed' or 'disconnected'", () => {
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

  // Phase LL Task 3 (§3), exit criterion 3: "no path from the failure
  // state to program() without passing transport construction." `fail()`
  // (`useMonitorSession.ts`) now clears `deviceName` on EVERY failure
  // before this screen ever renders, so `phase: "failed"` with a non-null
  // `deviceName` cannot happen from the real hook — but this component no
  // longer has any conditional branch that WOULD call `program()` for such
  // a state either way: `handleTryAgain` always calls `connect()`, full
  // stop. Proven with the adversarial fixture (the "should never happen"
  // state) precisely because a passing test here holds regardless of
  // whether the hook's own invariant ever slips.
  it("even a device somehow still on record: Try again ALWAYS goes through connect(), never program() directly", async () => {
    const { session: s } = renderInterstitial({
      phase: "failed",
      deviceName: DEVICE_NAME,
      error: connectedError({ reason: "nak", detail: "PM5 rejected frame 3" }),
    });
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
      deviceName: null,
      error: connectedError({ reason: "nak", detail: "PM5 rejected frame 3" }),
    });
    vi.mocked(s.connect).mockClear();
    const button = screen.getByRole("button", { name: "Try again" });

    act(() => {
      button.click();
      button.click();
    });

    expect(s.connect).toHaveBeenCalledTimes(1);
  });

  // F1 (cohort-unlock spec §1): the walk's own scenario — a mid-session
  // Bluetooth drop lands on `disconnected` with no run open, the SECOND
  // call site of `renderFailureScreen` (`:644-646`), not the `failed`
  // phase the tests above pin. Before this fix `canRetry` only read
  // `phase === "failed"`, so the button rendered but never worked here.
  it("the walk's dead button: disconnected with no open run renders Try again ENABLED, and a tap reaches connect()", async () => {
    const { session: s } = renderInterstitial({
      phase: "disconnected",
      deviceName: DEVICE_NAME,
      runOpen: false,
    });
    vi.mocked(s.connect).mockClear();

    const button = screen.getByRole("button", { name: "Try again" });
    expect(button).toBeEnabled();

    await userEvent.click(button);

    expect(s.connect).toHaveBeenCalledTimes(1);
  });

  it("double-tap still guarded from the disconnected branch", async () => {
    const { session: s } = renderInterstitial({
      phase: "disconnected",
      deviceName: DEVICE_NAME,
      runOpen: false,
    });
    vi.mocked(s.connect).mockClear();
    const button = screen.getByRole("button", { name: "Try again" });

    act(() => {
      button.click();
      button.click();
    });

    expect(s.connect).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// State 7: ready — waits for the rower, no timer
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

  it("Cancel calls session.cancel() (the ready-phase terminate, DEVIATIONS row 63) and hands back to the caller", async () => {
    const { session: s, onExit } = renderInterstitial({
      phase: "ready",
      deviceName: DEVICE_NAME,
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(s.cancel).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("NEVER auto-advances: ready holds through any amount of wall time until the rower acts (the dwell is gone — walks 2-3's thrice-reported bug)", () => {
    vi.useFakeTimers();
    try {
      renderInterstitial({ phase: "ready", deviceName: DEVICE_NAME });
      expect(screen.getByText("Ready when you pull")).toBeInTheDocument();

      // The handoff's 1.2s, then a full minute for good measure: still here.
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByText("Ready when you pull")).toBeInTheDocument();
      expect(
        screen.queryByRole("navigation", { name: "Connected panes" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the first pull advances it without any press: phase leaving 'ready' is the machine's own way past this screen", () => {
    const first = renderInterstitial({
      phase: "ready",
      deviceName: DEVICE_NAME,
    });
    expect(screen.getByText("Ready when you pull")).toBeInTheDocument();

    // The hook's phase flips to live (the first true pull); same mount.
    mockUseMonitorSession.mockReturnValue(
      session({ phase: "live", deviceName: DEVICE_NAME }),
    );
    first.rerender(
      <ConnectedInterstitial
        program={FIXTURE.program}
        phases={FIXTURE.phases}
        identity={FIXTURE.identity}
        baselines={baselines}
        nudgedCount={0}
        onExit={first.onExit}
        onRowInstead={first.onRowInstead}
        onEnded={first.onEnded}
      />,
    );

    expect(screen.queryByText("Ready when you pull")).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Connected panes" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The phase gate (Task 5's seam choice) — live (frozen or not)/ended, plus
// disconnected's TWO paths (Task 4, connected-axes 2a, below)
// ---------------------------------------------------------------------------

describe("the phase gate — the connected surface (Task 6)", () => {
  // `"paused"` retired from `ConnectedPhase` (connected-axes 2a, task 5): a
  // frozen session is still `phase: "live"`, published through `frozen`
  // instead (`useMonitorSession.ts`'s own `ConnectedPhase` doc comment). The
  // gate below reads `phase` alone (this file's job is "does live open the
  // surface", not "does the surface then draw it right" — `ConnectedSurface
  // .test.tsx` owns that), so both rows exercise the SAME gate branch; the
  // `frozen: true` row is kept anyway as the one that would break first if
  // this file's mock of `useMonitorSession` ever stopped honouring `frozen`
  // the way the real hook does.
  it.each([{ frozen: false }, { frozen: true }] as const)(
    "phase live (frozen: $frozen) hands off to the three-pane surface",
    ({ frozen }) => {
      renderInterstitial({ phase: "live", frozen, deviceName: DEVICE_NAME });
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
// Task 4 (connected-axes 2a): `disconnected` has TWO paths, and only
// `session.runOpen` (via `deriveAxes`) tells them apart — `phase` alone
// cannot (`connectedAxes.ts`'s own header comment: the record deliberately
// stays open across a drop that happens after a run began). Before this
// task, BOTH paths fell through the ladder into `<ConnectedSurface>`; the
// `it.each` above used to include `"disconnected"` as a third case that
// asserted exactly the bug this closes (default `runOpen: false`, from the
// `session()` fixture's own default, landed on the surface with no run and
// no frame — the premise-pass finding this task starts from).
// ---------------------------------------------------------------------------

describe("phase disconnected — the fall-through this task closes", () => {
  it("no run open (a drop during pairing/ready, before any session began): the interstitial's OWN disconnected treatment, never the surface", () => {
    renderInterstitial({
      phase: "disconnected",
      deviceName: DEVICE_NAME,
      runOpen: false,
    });
    expect(
      screen.queryByRole("navigation", { name: "Connected panes" }),
    ).not.toBeInTheDocument();
    // Reuses state 6's own element/copy (no ConnectedError exists for a
    // raw phase-level drop, so `LINK_LOST_NO_RUN_ERROR` stands in) — the
    // same serif line a connect-time link failure already shows a rower
    // today (`useMonitorSession.ts`'s `mapRadioFailure` fallback).
    expect(
      screen.getByText("The link to the monitor failed.", {
        selector: ".connected-serif-line",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("YOUR WORKOUT AND NUDGES ARE KEPT"),
    ).toBeInTheDocument();
    // Not the machine-refusal body line — there is nothing on a monitor
    // screen to "end"; the link is simply gone.
    expect(
      screen.queryByText(
        "End whatever is showing on the monitor, then try again.",
      ),
    ).not.toBeInTheDocument();
    // Try again is enabled here too (F1, cohort-unlock spec §1: `canRetry`
    // covers `"disconnected"` as well as `"failed"` — the "Try again —
    // inert unless..." describe block above pins the connect() wiring for
    // this exact fixture) — Row on the phone timer instead and Cancel are
    // the other two live escape hatches.
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Row on the phone timer instead" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("a run open (the mid-session drop): still hands off to the surface, unchanged — this task's rule keys on session, not phase", () => {
    renderInterstitial({
      phase: "disconnected",
      deviceName: DEVICE_NAME,
      runOpen: true,
    });
    expect(
      screen.getByRole("navigation", { name: "Connected panes" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The link to the monitor failed."),
    ).not.toBeInTheDocument();
    // F1 (cohort-unlock spec §1): the widened `canRetry` predicate never
    // gets a chance to matter here — this branch hands off to the surface
    // before `renderFailureScreen` is ever called, so no Try again button
    // exists at all from this state.
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });

  it("Row on the phone timer instead cancels the session and hands off with targets intact, from the no-run-open treatment too", async () => {
    const { session: s, onRowInstead } = renderInterstitial({
      phase: "disconnected",
      deviceName: DEVICE_NAME,
      runOpen: false,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Row on the phone timer instead" }),
    );
    expect(s.cancel).toHaveBeenCalledTimes(1);
    expect(onRowInstead).toHaveBeenCalledTimes(1);
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

  // Task 5's OWN self-found race (this file's header names it in spirit; the
  // fix lives in `ConnectedInterstitial.tsx`'s `programmedForDeviceRef`
  // comment): `connect()` sets `phase: "pairing"` BEFORE `transport.connect
  // (...)` even starts, and only sets `deviceName` once that resolves. A
  // phase-only edge trigger would dispatch `program()` the instant `phase`
  // becomes `"pairing"`, which on a transport slower than a same-microtask
  // fake reaches `program()`'s own `driver === null` guard and renders a
  // FALSE "No monitor is connected." while pairing is still genuinely in
  // flight. Task 5's own report: "no e2e/organic client-level regression
  // test existed for it" — `delayWrites` (Task 8) is what makes a same-file,
  // same-fixture fake slow enough to reproduce the shape organically,
  // instead of a bespoke one-off delayed `Transport` stub.
  it("connect() slower than a same-microtask fake: program() waits for a real deviceName, never dispatching against a null driver", async () => {
    vi.doUnmock("../monitor/useMonitorSession");
    const real = await vi.importActual<
      typeof import("../monitor/useMonitorSession")
    >("../monitor/useMonitorSession");
    mockUseMonitorSession.mockImplementation(real.useMonitorSession);

    const fake = createFakeTransport({
      program: FIXTURE.program,
      deviceName: DEVICE_NAME,
    });
    // Real latency on connect()/write() from the very first call — the
    // shape a real radio has and this fake never did before Task 8.
    fake.delayWrites(50);

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

    // "Connecting" renders while `transport.connect()`'s own promise is
    // still pending (real 50ms, not yet elapsed) — deviceName is still
    // null. This is exactly the window the OLD phase-only effect would
    // have dispatched `program()` into.
    await screen.findByText("Connecting");
    expect(screen.queryByText("No monitor is connected.")).toBeNull();

    // Real time elapses (RTL's own `findBy*` polls with REAL timers, which
    // is what actually lets `delayWrites`'s `setTimeout` resolve) —
    // `connect()` settles, `deviceName` is set, and program() dispatches
    // for real, reaching "Sending the workout" with no false failure ever
    // having rendered along the way.
    await screen.findByText(
      (_, el) => el?.className === "connected-status-label",
      {},
      { timeout: 2000 },
    );
    expect(screen.queryByText("No monitor is connected.")).toBeNull();

    // Pumped THROUGHOUT, straight through the window Task 8 had to tiptoe
    // around. Task 8 shipped this tail as "wait 1200ms in pure real time
    // with zero flush calls, then `deliverArmedNow()` exactly once",
    // because `fake.ts`'s post-arm bundle was then a ONE-SHOT: a `tick()`
    // landing between the last frame's synchronous ack and `verifyArmed()`
    // registering consumed the one-and-only "armed" notification, and
    // `program()` hung forever. The fix wave closed that at the fake —
    // armed is a LEVEL now (`fake.ts`'s `armedLevel`), re-reported on every
    // otherwise-silent tick exactly as a real PM5 does, so no pump can
    // steal it. This is therefore back to the natural form every other
    // fake-driven test in this file uses. The real `setTimeout` inside the
    // loop is not a workaround: `delayWrites(50)` resolves on real timers,
    // so real time has to elapse for the multi-frame send to complete at
    // all; 60 × 25ms is comfortably past this fixture's own worst case.
    for (let i = 0; i < 60; i += 1) {
      await act(async () => {
        fake.tick(0);
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
      if (screen.queryByText("Ready when you pull")) break;
    }
    await screen.findByText("Ready when you pull", {}, { timeout: 5000 });
    expect(screen.queryByText("No monitor is connected.")).toBeNull();
  }, 15_000);
  // A REAL per-write delay (Task 8's own `delayWrites` fix — `write()` now
  // genuinely honors it, where it previously silently ignored it and only
  // `connect()` did) means this 4-interval program's full sequence takes
  // real wall-clock seconds, not milliseconds — comfortably past vitest's
  // own 5000ms DEFAULT per-test timeout, which is a budget for the TEST
  // RUNNER and has nothing to do with `delayWrites`'s own 50ms; the `15_000`
  // above is this test's OWN explicit override for that separate budget.

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
