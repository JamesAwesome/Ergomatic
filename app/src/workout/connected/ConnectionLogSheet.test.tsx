// The diagnostics sheet and the gesture that opens it (7B Task 7, handoff
// §5). Two halves:
//
// - **The door.** Three deliberate taps on a control half open it; two do
//   not. Driven through the REAL `ConnectedSurface` and the REAL
//   `SegmentedControl`, because the gesture is a property of the shell's own
//   handler, not of the sheet.
// - **The sheet.** Rendered from a REAL `createEventLog()` that a REAL
//   `createPm5Driver` has written into, so the lines on screen are lines
//   the driver actually records — not three tidy strings this file made up.

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../../domain/monitor/program.js";
import type { MonitorFrame } from "../../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import { createEventLog } from "../../monitor/eventLog";
import { createPm5Driver } from "../../monitor/driver";
import { createFakeTransport } from "../../monitor/transports/fake";
import {
  createRecordingTransport,
  downloadRecording,
  parseRecording,
} from "../../monitor/transports/recording";
import type {
  MonitorSession,
  ConnectedPhase,
} from "../../monitor/useMonitorSession";
import { buildDraft } from "../../session/draft";
import { buildRun, type EnginePhase } from "../../session/engine";
import ConnectedSurface, {
  LAST_PANE_KEY,
  TRIPLE_TAP_WINDOW_MS,
} from "../ConnectedSurface";
import { logLine, parseLogEntries } from "./ConnectionLogSheet";

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE = "PM5 432331249";

function fillingLow(): { program: WorkoutProgram; phases: EnginePhase[] } {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "filling-low",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return { program, phases };
}

const FIXTURE = fillingLow();

/** The session pair mirrors the raw pair unless a case overrides it — see
 *  `surfaceModel.test.ts`'s own copy of this factory for the full walk-4
 *  reasoning. The sheet's `SESSION m:ss` caption reads the session clock,
 *  so the re-mirror after the spread is load-bearing here: without it a
 *  case setting `elapsedSeconds` would assert against the default. */
function frame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  const f: MonitorFrame = {
    elapsedSeconds: 348,
    distanceMeters: 1400,
    sessionElapsedSeconds: 348,
    sessionDistanceMeters: 1400,
    currentSplit: 124,
    spm: 21,
    heartRateBpm: 164,
    splitAvgPace: null,
    restSeconds: 0,
    intervalIndex: 1,
    intervalRemaining: { kind: "distance", value: 1200 },
    intervalAccrued: null,
    state: "rowing",
    rowingActive: true,
    ...overrides,
  };
  return {
    ...f,
    sessionElapsedSeconds: overrides.sessionElapsedSeconds ?? f.elapsedSeconds,
    sessionDistanceMeters: overrides.sessionDistanceMeters ?? f.distanceMeters,
  };
}

/** A log a REAL driver wrote. `createPm5Driver` records every notification
 *  it hears, the armed structure it reads back, every frame it emits and
 *  every hang-up, against the log it is handed — so pointing the real
 *  driver at the fake and letting one status tick land produces a trace
 *  with exactly the kinds and details the shipped code emits, never three
 *  tidy strings this file invented.
 *
 *  Built once, at module load: it is a FIXTURE here, and the driver's own
 *  suite is what proves the entries themselves are right. */
function buildRealDriverLog(): string {
  const log = createEventLog();
  const fake = createFakeTransport({
    program: FIXTURE.program,
    deviceName: DEVICE,
    events: [
      {
        atMs: 100,
        kind: "status",
        // WORKOUTSTATE_INTERVALWORKTIME (four; three is INTERVALREST).
        workoutState: 4,
        elapsedSeconds: 10,
        distanceMeters: 40,
        spm: 20,
        currentSplit: 130,
        heartRateBpm: 140,
        programIntervalIndex: 0,
      },
    ],
  });
  const driver = createPm5Driver(fake, log, {
    deviceName: DEVICE,
    settleTicks: 0,
    prepareSettleTicks: 0,
  });
  const stop = driver.events(() => undefined);
  fake.tick(200);
  stop();
  void driver.disconnect().catch(() => undefined);
  return log.exportLog();
}

const REAL_LOG = buildRealDriverLog();

function realDriverLog(): string {
  return REAL_LOG;
}

function session(overrides: Partial<MonitorSession> = {}): MonitorSession {
  return {
    phase: "live" as ConnectedPhase,
    error: null,
    deviceName: DEVICE,
    frame: frame(),
    actuals: [],
    endedBy: null,
    handoffHeld: false,
    holdError: null,
    frozen: false,
    runOpen: true,
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

function renderSurface(overrides: Partial<MonitorSession> = {}) {
  const current = session(overrides);
  const view = render(
    <ConnectedSurface
      phases={FIXTURE.phases}
      program={FIXTURE.program}
      session={current}
      onEnded={vi.fn()}
    />,
  );
  return { ...view, session: current };
}

function controlHalf(pane: "Live" | "Grid"): HTMLElement {
  return screen.getByRole("button", { name: `${pane} pane` });
}

async function tap(pane: "Live" | "Grid", times: number) {
  for (let i = 0; i < times; i += 1) {
    await userEvent.click(controlHalf(pane));
  }
}

function sheet(): HTMLElement | null {
  return screen.queryByRole("dialog");
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(LAST_PANE_KEY, "grid");
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The door: three deliberate taps
// ---------------------------------------------------------------------------

describe("triple-tap opens diagnostics (handoff §5)", () => {
  it("THREE TAPS OPEN IT", async () => {
    renderSurface();
    await tap("Grid", 3);
    expect(sheet()).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Connection log" }),
    ).toBeInTheDocument();
  });

  it("TWO TAPS DO NOT — a double-tap is not the gesture", async () => {
    renderSurface();
    await tap("Grid", 2);
    expect(sheet()).toBeNull();
  });

  it("one tap does nothing but change panes", async () => {
    renderSurface();
    // `beforeEach` lands on grid; one tap on live is the pane change.
    await tap("Live", 1);
    expect(sheet()).toBeNull();
    expect(controlHalf("Live")).toHaveAttribute("aria-current", "page");
  });

  it("works on ANY target, not just the grid's", async () => {
    renderSurface();
    await tap("Live", 3);
    expect(sheet()).not.toBeNull();
  });

  it("three taps SPREAD ACROSS TARGETS is navigation, not a gesture", async () => {
    renderSurface();
    // connected-revamp Task 2 dropped the pager to two targets — alternating
    // between them still never lands three consecutive taps on the SAME
    // one, which is the property this test proves either way.
    await userEvent.click(controlHalf("Live"));
    await userEvent.click(controlHalf("Grid"));
    await userEvent.click(controlHalf("Live"));
    expect(sheet()).toBeNull();
  });

  it("forgets the count once the window lapses", () => {
    vi.useFakeTimers();
    try {
      renderSurface();
      fireEvent.click(controlHalf("Grid"));
      fireEvent.click(controlHalf("Grid"));
      act(() => {
        vi.advanceTimersByTime(TRIPLE_TAP_WINDOW_MS);
      });
      // The third tap is now the FIRST tap of a new gesture.
      fireEvent.click(controlHalf("Grid"));
      expect(sheet()).toBeNull();
      fireEvent.click(controlHalf("Grid"));
      fireEvent.click(controlHalf("Grid"));
      expect(sheet()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds the count right up to the window's last millisecond", () => {
    vi.useFakeTimers();
    try {
      renderSurface();
      fireEvent.click(controlHalf("Grid"));
      act(() => {
        vi.advanceTimersByTime(TRIPLE_TAP_WINDOW_MS - 1);
      });
      fireEvent.click(controlHalf("Grid"));
      act(() => {
        vi.advanceTimersByTime(TRIPLE_TAP_WINDOW_MS - 1);
      });
      fireEvent.click(controlHalf("Grid"));
      expect(sheet()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Close puts it away and hands focus back to the target that opened it", async () => {
    renderSurface();
    await tap("Live", 3);
    expect(sheet()).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(controlHalf("Live"));
  });
});

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

describe("the connection log sheet", () => {
  async function open(exportLog: () => string) {
    const view = renderSurface({ exportLog });
    await tap("Grid", 3);
    return view;
  }

  it("draws the driver's OWN entries, verbatim", async () => {
    const raw = realDriverLog();
    const entries = parseLogEntries(raw);
    expect(entries.length).toBeGreaterThan(0);

    await open(() => raw);
    const lines = Array.from(
      document.querySelectorAll(".connected-log-line"),
    ).map((el) => el.textContent);
    expect(lines).toStrictEqual(entries.map(logLine));
    // A real trace, not prose: the first thing a driver records is what it
    // heard off the wire.
    expect(lines[0]).toMatch(/^\d{4} [A-Z0-9-]+ /);
  });

  it("captions the count and the session clock", async () => {
    const raw = realDriverLog();
    const count = parseLogEntries(raw).length;
    await open(() => raw);
    // `frame.elapsedSeconds` is 348 -> 5:48, the house's elastic positional
    // format (the mockup writes `0:05:48`; the house rule wins).
    expect(
      screen.getByText(`${DEVICE} · ${count} EVENTS · SESSION 5:48`),
    ).toBeInTheDocument();
  });

  it("READS ONCE, ON OPEN — it is a window, not a subscription", async () => {
    const readLog = vi.fn().mockReturnValue(realDriverLog());
    const view = renderSurface({ exportLog: readLog });
    expect(readLog).not.toHaveBeenCalled();
    await tap("Grid", 3);
    expect(readLog).toHaveBeenCalledTimes(1);

    // The machine keeps talking; the sheet does not re-read.
    view.rerender(
      <ConnectedSurface
        phases={FIXTURE.phases}
        program={FIXTURE.program}
        session={session({
          exportLog: readLog,
          frame: frame({ elapsedSeconds: 400 }),
        })}
        onEnded={vi.fn()}
      />,
    );
    expect(readLog).toHaveBeenCalledTimes(1);
  });

  it("says so, rather than nothing, when the log is empty", async () => {
    await open(() => "[]");
    expect(screen.getByText("NOTHING RECORDED YET")).toBeInTheDocument();
    expect(screen.getByText(/· 0 EVENTS ·/)).toBeInTheDocument();
  });

  it("counts one event in the singular", async () => {
    await open(() => JSON.stringify([{ seq: 0, kind: "write", detail: "f1" }]));
    expect(screen.getByText(/· 1 EVENT ·/)).toBeInTheDocument();
  });

  it("survives a log it cannot parse rather than taking the screen down", async () => {
    // This sheet exists for the sessions where something has already gone
    // wrong; it must not be the second thing that breaks.
    await open(() => "not json at all");
    expect(screen.getByText("NOTHING RECORDED YET")).toBeInTheDocument();
  });

  it("drops entries that are not entries", () => {
    expect(
      parseLogEntries(
        JSON.stringify([
          { seq: 0, kind: "write", detail: "f1" },
          { seq: "one", kind: "write", detail: "f2" },
          null,
          { kind: "write", detail: "f3" },
          "nope",
        ]),
      ),
    ).toStrictEqual([{ seq: 0, kind: "write", detail: "f1" }]);
    expect(parseLogEntries(JSON.stringify({ seq: 0 }))).toStrictEqual([]);
  });

  it("numbers by SEQUENCE — the display's ordering authority, even though entries carry atMs now", () => {
    // `eventLog.ts` orders by a monotonic `seq` on purpose: two entries
    // recorded in one microtask can carry the same `atMs` and lose their
    // order (Phase LL Task 1 added `atMs`; it never replaced `seq` as the
    // ordering authority). The mockup's leading timestamp column is still
    // not what prints here, recorded in DEVIATIONS. An entry with no
    // `atMs` at all (an older stash, or this fixture) renders identically
    // — the display never reads that field.
    expect(logLine({ seq: 7, kind: "notify", detail: "0x0031 aa bb" })).toBe(
      "0007 NOTIFY 0x0031 aa bb",
    );
  });
});

// ---------------------------------------------------------------------------
// COPY LOG
// ---------------------------------------------------------------------------

describe("COPY LOG (handoff §5: level 3, it acts inside the sheet)", () => {
  function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, "clipboard", {
      value: clipboard,
      configurable: true,
      writable: true,
    });
    return clipboard;
  }

  it("COPIES THE EXPORT STRING BYTE FOR BYTE", async () => {
    const clipboard = stubClipboard();
    const raw = realDriverLog();
    renderSurface({ exportLog: () => raw });
    await tap("Grid", 3);
    await userEvent.click(screen.getByRole("button", { name: "COPY LOG" }));

    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    const copied = clipboard.writeText.mock.calls[0]![0] as string;
    // Not "deep-equal after parsing" — the SAME STRING. A pretty-printed or
    // re-serialized copy is a different artefact from the one the sheet
    // drew, and a bug report must not arrive holding a log we never had.
    expect(copied).toBe(raw);
    expect(copied).not.toContain("\n");
  });

  it("is a level-3 button, and the sheet has no level 1 at all", async () => {
    stubClipboard();
    renderSurface({ exportLog: () => realDriverLog() });
    await tap("Grid", 3);
    const copy = screen.getByRole("button", { name: "COPY LOG" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(copy).toHaveClass("button-l3");
    expect(close).toHaveClass("button-l2");
    // `SheetShell`'s primary is optional precisely so this sheet can have
    // none — the house allows one L1 per screen and this screen's actions
    // are an in-sheet commit and a dismiss.
    expect(sheet()!.querySelector(".button-l1")).toBeNull();
  });

  it("COPY LOG comes before Close, in that order", async () => {
    stubClipboard();
    renderSurface({ exportLog: () => realDriverLog() });
    await tap("Grid", 3);
    const buttons = Array.from(sheet()!.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(buttons).toStrictEqual(["COPY LOG", "Close"]);
  });

  it("says COPIED, and says so when it could not", async () => {
    const clipboard = stubClipboard();
    renderSurface({ exportLog: () => "[]" });
    await tap("Grid", 3);
    await userEvent.click(screen.getByRole("button", { name: "COPY LOG" }));
    expect(screen.getByRole("button", { name: "COPIED" })).toBeInTheDocument();

    clipboard.writeText.mockRejectedValueOnce(new Error("denied"));
    await userEvent.click(screen.getByRole("button", { name: "COPIED" }));
    expect(
      screen.getByRole("button", { name: "COPY FAILED" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Download recording (Task 6, fix round): dev-only, gated on
// window.__pm5Recording__. The sheet itself imports NOTHING from
// `recording.ts` (fix round — a dynamic import gated only on this runtime
// global still shipped `recording.ts`'s module graph as its own chunk in
// `dist/`, breaking Task 5's dist-grep proof; the composition now lives
// entirely behind `transports/index.ts`'s build-time-foldable gate). These
// tests build `window.__pm5Recording__` from the REAL
// `createRecordingTransport` + the REAL `downloadRecording`, the same two
// functions `transports/index.ts` wires together in production — never a
// hand-rolled stub — so the round trip through `parseRecording` exercises
// the actual composition, not a test's idea of it.
// ---------------------------------------------------------------------------

describe("Download recording (dev-only capture control)", () => {
  /** Builds the SAME shape `transports/index.ts`'s gated arm assigns to
   *  `window.__pm5Recording__`, off a real `createRecordingTransport`
   *  wrapping a real fake `Transport` — so `lines()`/`eventCount()`/
   *  `download()` all do exactly what production's do. Connects once
   *  through the tap (not a hand-built line string) so there is a genuine
   *  recorded `connect` event to round-trip. */
  async function realRecordingGlobal(): Promise<
    NonNullable<Window["__pm5Recording__"]>
  > {
    const inner = createFakeTransport({
      program: FIXTURE.program,
      deviceName: DEVICE,
      events: [],
    });
    const recordingTap = createRecordingTransport(inner);
    await recordingTap.transport.connect(DEVICE);
    return {
      lines: recordingTap.lines,
      eventCount: recordingTap.eventCount,
      download: (program) => downloadRecording(recordingTap, program),
    };
  }

  afterEach(() => {
    delete (window as { __pm5Recording__?: unknown }).__pm5Recording__;
  });

  it("is absent when no recording tap is active — production and the e2e fake arm both leave the global unset", async () => {
    renderSurface({ exportLog: () => "[]" });
    await tap("Grid", 3);
    expect(
      screen.queryByRole("button", { name: "Download recording" }),
    ).toBeNull();
  });

  it("downloads the composed recording — header carries the program prop, byte for byte via parseRecording (B4)", async () => {
    const rec = await realRecordingGlobal();
    window.__pm5Recording__ = rec;
    // `eventCount()`/`lines()` come off the real tap, not a hand count —
    // pin what the recorded connect actually produced.
    expect(rec.eventCount()).toBeGreaterThan(0);

    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-recording");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    renderSurface({ exportLog: () => "[]" });
    await tap("Grid", 3);
    await userEvent.click(
      screen.getByRole("button", { name: "Download recording" }),
    );

    // The handler is `void window.__pm5Recording__?.download(program)` —
    // an async function userEvent.click does not await — so the assertions
    // wait for the anchor's own click, the last thing `downloadRecording`
    // does.
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const text = await blob.text();
    const parsed = parseRecording(text);
    expect(parsed.header.app).toBe("dev");
    expect(parsed.header.transport).toBe("web");
    // B4: the header carries the SAME program object the surface compiled,
    // not a re-derived or partial one.
    expect(parsed.header.program).toStrictEqual(FIXTURE.program);
    expect(parsed.events).toHaveLength(rec.eventCount());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-recording");
  });

  it("is a 44px hit target sharing the sheet's existing button class", async () => {
    window.__pm5Recording__ = await realRecordingGlobal();
    renderSurface({ exportLog: () => "[]" });
    await tap("Grid", 3);
    expect(
      screen.getByRole("button", { name: "Download recording" }),
    ).toHaveClass("button-l3");
  });

  it("guards against the global disappearing between render and click — a stale click neither calls download() nor throws", async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    window.__pm5Recording__ = {
      lines: () => [],
      eventCount: () => 0,
      download,
    };
    renderSurface({ exportLog: () => "[]" });
    await tap("Grid", 3);
    const button = screen.getByRole("button", { name: "Download recording" });
    // The button stays mounted (this sheet never re-renders after open —
    // "a window, not a source") even if the global it was gated on at
    // render time is gone by click time; the handler's own `?.` is what
    // must catch that, not React.
    delete (window as { __pm5Recording__?: unknown }).__pm5Recording__;

    // React 19's discrete-event dispatch does not deliver a dropped `?.`
    // guard's exception synchronously to either `fireEvent.click`'s or
    // `userEvent.click`'s own return — verified empirically (self-mutation,
    // task-6 fix-round report) — so this test listens for the DOM's own
    // "report the exception" `error` event, the mechanism jsdom's
    // `dispatchEvent` uses for a listener that throws, rather than
    // wrapping the click call itself.
    let caught: unknown;
    const onWindowError = (event: ErrorEvent): void => {
      caught = event.error;
      event.preventDefault();
    };
    window.addEventListener("error", onWindowError);
    try {
      fireEvent.click(button);
      // A macrotask tick: enough for jsdom's own exception-reporting path
      // to fire `window`'s `error` event before the assertions below run.
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      window.removeEventListener("error", onWindowError);
    }
    expect(caught).toBeUndefined();
    expect(download).not.toHaveBeenCalled();
  });
});
