// PHASE JR PR 2, TASK 8 — the free row's end-to-end seam, upstream of the
// producer (recurring failure 24's own shape, closed rather than repeated).
//
// Both halves of a write-then-read seam being well tested is exactly the
// condition that hides a broken seam: MACHINE CONFIRMED reached zero of
// sixteen production rows while three green gates each entered the pipe
// downstream of the producer. So this suite starts BEFORE the producer —
// `beginFreeRow()` on the real hook, the walk's real bytes through the real
// transport seam, the close writing through `handoffStore.commit` — and
// asserts AFTER the reader, on the log door's rendered DOM. Nothing seeds a
// `MonitorRun`.
//
// THE CAPTURE: `docs/monitor/sessions/walk-2026-08-31-justrow/`, the
// phase's own capture walk. Pull from the PM5's main menu (auto-enters Just
// Row), row past the 5:00 auto-split, a deliberate stop, resume, Menu end —
// with the 0x0039/0x003A/0x003F burst arriving 0.4 s after the terminate
// (the walk's CLOSED 4).
//
// THE ORACLE, and which check it buys (the antagonist's mirror finding,
// honored): asserting AVG as 500 × rendered-time ÷ rendered-distance could
// never go red — that is the derivation checking itself. The capture
// carries a genuinely independent figure: **0x0039's own average-pace
// FIELD, 140.9 s** (README decode table), computed by the MACHINE from a
// different wire field than the elapsed/distance pair we derive from. Our
// 500 × 393.60 ÷ 1396.0 = 140.97 — 0.07 s apart. Comparing our
// elapsed/distance against 0x0039's elapsed/distance is a TRANSCRIPTION
// check; comparing our derived split against the machine's own average-pace
// field is the one DEFINITION check available, and it is the one below.

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRecording, type ParsedRecording } from "./transports/recording";
import { createReplayTransport } from "./transports/replay";
import { withLiveness } from "./transports/liveness";

const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/justRowReplay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-31-justrow/",
  );

const JUST_ROW_CAPTURE: ParsedRecording = parseRecording(
  gunzipSync(
    readFileSync(
      `${SESSIONS_DIR}just-row-pm5-recording-1788214688045.jsonl.gz`,
    ),
  ).toString("utf8"),
);

// The walk README's own decode of the capture's 0x0039 — independent
// literals, transcribed from the record of the walk rather than computed
// here (recurring failure 21: a test that derives its expectation from the
// code it gates proves nothing about it).
const MACHINE_ELAPSED_SECONDS = 393.6;
const MACHINE_DISTANCE_METERS = 1396.0;
const MACHINE_AVG_PACE_SECONDS = 140.9;

const FIXED_NOW = new Date("2026-08-31T09:00:00.000Z");

describe("the free row, wire to log door (RF24: one test upstream of the producer)", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.doUnmock("../adapters/appLifecycle");
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("replays the walk into a stored record, and the door renders the machine's row", async () => {
    const replay = createReplayTransport(JUST_ROW_CAPTURE);
    const transport = withLiveness(replay.transport, {
      now: () => replay.clock.now(),
      schedule: (fn, ms) => replay.clock.schedule(fn, ms),
      onSilence: () => undefined,
      onRecovery: () => undefined,
    });

    vi.doMock("../adapters/monitorTransport", () => ({
      defaultTransport: vi.fn(() => transport),
    }));
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener: vi.fn(() => (): void => undefined),
    }));
    vi.resetModules();

    // ONE module epoch for the hook, the store and the door — a static
    // import at the top of this file would be a different store instance
    // and would read null forever (handoffStoreReplay.test.ts's own rule).
    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const freshStore = await import("./handoffStore");

    const { result } = renderHook(() =>
      freshUseMonitorSession({
        now: () => FIXED_NOW,
        driverOptions: {
          now: () => replay.clock.now(),
          schedule: (cb, ms) => replay.clock.schedule(cb, ms),
        },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    // THE PRODUCER'S FIRST STEP — no program(), no seeding. Everything
    // after this line is the shipped pipeline acting on real bytes.
    act(() => {
      result.current.beginFreeRow();
    });

    const replayResult = await act(async () => replay.run());

    // The free row's own opt-outs, proven over the whole capture rather
    // than a synthetic frame or two: no divergence escalation and no
    // phantom intervals across a real row with a real auto-split in it.
    expect(replayResult.divergences).toStrictEqual([]);
    const record = freshStore.currentUnretired()?.run;
    expect(record).toBeDefined();
    expect(record?.mode).toBe("justrow");
    expect(record?.completedAt).not.toBeNull();
    expect(record?.actuals).toStrictEqual([]);

    // The machine's own summary, filed — the thing "nothing filed"
    // discarded before the free row owned a driver run. TRANSCRIPTION
    // check: our stored pair against 0x0039's own pair.
    expect(record?.summaryTotals?.workElapsedSeconds).toBeCloseTo(
      MACHINE_ELAPSED_SECONDS,
      1,
    );
    expect(record?.summaryTotals?.workDistanceMeters).toBeCloseTo(
      MACHINE_DISTANCE_METERS,
      0,
    );
    expect(record?.verificationBytes).toBeDefined();

    // DEFINITION check: the split the door will derive, against the
    // machine's own average-pace FIELD — a different wire field, decoded by
    // the PM5 itself. The 0.15 s band covers the machine's own one-decimal
    // truncation of the field; anything past it is a definition
    // disagreement, not rounding.
    const derived =
      (500 * record!.summaryTotals!.workElapsedSeconds) /
      record!.summaryTotals!.workDistanceMeters;
    expect(Math.abs(derived - MACHINE_AVG_PACE_SECONDS)).toBeLessThanOrEqual(
      0.15,
    );

    // THE READER, mounted the way a rower reaches it — the same module
    // epoch, reading the store the producer wrote. Rendered literals, not
    // recomputed ones: 393.6 s rounds to 6:34 positional, 1,396 m, and the
    // derivation displays 2:21.0 (140.97 to the nearest tenth).
    const { default: JustRowLog } = await import("../justrow/JustRowLog");
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/justrow/log"] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: "/justrow/log",
            element: React.createElement(JustRowLog),
          }),
          React.createElement(Route, {
            path: "*",
            element: React.createElement("p", null, "ELSEWHERE"),
          }),
        ),
      ),
    );

    expect(screen.getByText("6:34")).toBeInTheDocument();
    expect(screen.getByText("1,396 m")).toBeInTheDocument();
    expect(screen.getByText("2:21.0")).toBeInTheDocument();
    expect(screen.getByText("PAIN")).toBeInTheDocument();
    expect(
      screen.queryByText(/DID YOU HOLD THE TARGETS/),
    ).not.toBeInTheDocument();
  });
});
