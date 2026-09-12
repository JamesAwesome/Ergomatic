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
// Since spec 2026-09-02 `beginFreeRow()` also sends the PM5 its Just Row
// program (Concept2's p.80 frame). The replay transport resolves writes and
// never acks, so here that send is ABANDONED at the driver's deadline and
// the ring records `free-row-program-unanswered` — the row opens and
// completes exactly as before, which is the ruling (nothing branches on the
// send). The 08-31 capture predates the send, so `run()`'s divergence check
// cannot see the write; the ring is this suite's witness for it.
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

import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRecording, type ParsedRecording } from "./transports/recording";
import { createReplayTransport } from "./transports/replay";
import { withLiveness } from "./transports/liveness";
import { releasingSchedule } from "../test/statusSubscriptions";
import { readCapture } from "../test/captures";

const JUST_ROW_CAPTURE: ParsedRecording = parseRecording(
  readCapture(
    "walk-2026-08-31-justrow",
    "just-row-pm5-recording-1788214688045.jsonl.gz",
  ),
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
    vi.doUnmock("../api");
    vi.doUnmock("../api/useWorkouts");
    vi.doUnmock("../api/useBaselines");
    vi.doUnmock("../api/usePlan");
    vi.doUnmock("../api/usePreferences");
    vi.doUnmock("../api/useRecentLogs");
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

    // THE SEAM (Phase MD PR 2): `registerAppLifecycleListener`/
    // `createTransport` are passed as deps below, never `vi.doMock`ed. The
    // api mock stays a `vi.doMock` — it is a THIRD module (rule iv) — in the
    // SAME epoch as the door import below, so the Save press at the end of
    // this test posts through the real submit pipeline into a body this test
    // can read (PM final gate, B2). `vi.resetModules()` + the dynamic
    // re-import survive for that reason: reaching `../api`'s mock AND
    // sharing ONE module epoch for the hook, the store and the door — a
    // static import at the top of this file would be a different store
    // instance and would read null forever (handoffStoreReplay.test.ts's own
    // rule).
    const apiFn = vi.fn<
      (path: string, init?: RequestInit) => Promise<Response>
    >(async () => new Response(JSON.stringify({ id: "log-replay-1" })));
    vi.doMock("../api", () => ({ api: apiFn }));
    vi.resetModules();

    const { useMonitorSession: freshUseMonitorSession } =
      await import("./useMonitorSession");
    const freshStore = await import("./handoffStore");

    const { result } = renderHook(() =>
      freshUseMonitorSession({
        now: () => FIXED_NOW,
        createTransport: () => transport,
        registerAppLifecycleListener: () => (): void => undefined,
        driverOptions: {
          now: () => replay.clock.now(),
          schedule: releasingSchedule((cb, ms) =>
            replay.clock.schedule(cb, ms),
          ),
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

    // THE SEND, witnessed by the ring (spec 2026-09-02, exit criterion 3).
    // The replay transport resolves every write and never acks, so the
    // p.80 frame goes out ONCE and its send is abandoned at the driver's
    // deadline — `run()` drove that deadline itself, since the hook's
    // `driverOptions.schedule` above IS `replay.clock.schedule` and the
    // capture spans some 400 s of virtual time. The frame literal is typed
    // from `docs/monitor/pm5-interface-notes.md:204`, never built. The
    // hook's `exportLog()` is the same string the diagnostics door copies.
    const ring = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const ringKinds = ring.map((e) => e.kind);
    expect(
      ring.filter((e) => e.kind === "write").map((e) => e.detail),
    ).toStrictEqual(["f1 76 07 01 01 01 13 02 01 01 61 f2"]);
    expect(ringKinds.indexOf("free-row-open")).toBeGreaterThanOrEqual(0);
    expect(ringKinds.indexOf("write")).toBeGreaterThan(
      ringKinds.indexOf("free-row-open"),
    );
    expect(ringKinds).toContain("free-row-program-unanswered");
    expect(ringKinds).not.toContain("free-row-program-sent");
    expect(ringKinds).not.toContain("free-row-program-failed");
    const record = freshStore.currentUnretired()?.run;
    expect(record).toBeDefined();
    expect(record?.mode).toBe("justrow");
    expect(record?.completedAt).not.toBeNull();
    expect(record?.actuals).toStrictEqual([]);
    // Exit criterion 5 on a PRODUCED value: the capture's Menu end closes
    // the free row as `rower`. Before this line every free-row `endedBy`
    // assertion echoed a literal the fixture had seeded (phase-close exit
    // pass, 2026-09-01) — no test went red on a wrong stamp.
    expect(record?.endedBy).toBe("rower");

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

    // READER 1 — TODAY'S RECOVERY ROW, mounted after the real producer
    // wrote (PM final gate, B3; the plan's own Task 7 requirement this
    // branch first shipped without, RF24's exact seeding trap twice in one
    // phase). `UnloggedMonitorRow` reads Today's own `useState` mount
    // snapshot — the very shape RF24's original defect had — so only a
    // mount that FOLLOWS the wire-driven close can vouch for this seam.
    // Data hooks are mocked ready (Today.test.tsx's own idiom); the store
    // is the real one this replay just filled.
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "ready", workouts: [] }),
    }));
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({
        state: "ready",
        baselines: { k2Seconds: 100, k6Seconds: 120 },
      }),
    }));
    vi.doMock("../api/usePlan", () => ({
      usePlan: () => ({
        state: "ready",
        plan: { planKey: null, doneN: 0, sequence: [] },
      }),
    }));
    vi.doMock("../api/usePreferences", () => ({
      usePreferences: () => ({
        state: "ready",
        // Today.test.tsx's own DEFAULT_PREFS shape — the filter tokens
        // read `difficulties.length` unconditionally.
        preferences: {
          timeCapMinutes: 60,
        },
      }),
    }));
    vi.doMock("../api/useRecentLogs", () => ({
      useRecentLogs: () => ({ state: "ready", logs: [] }),
    }));
    const { default: Today } = await import("../today/Today");
    const todayView = render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/today"] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: "/today",
            element: React.createElement(Today),
          }),
        ),
      ),
    );
    // The closed record renders the row (gate 2's free-row widening), the
    // numbers are the machine's own, and Log it is offered (gate 1's).
    expect(await screen.findByText(/6:34 · 1,396 m/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Review & save PM5 workout Just Row",
      }),
    ).toBeInTheDocument();
    todayView.unmount();

    // READER 2 — the log door, the same module epoch, reading the store
    // the producer wrote. Rendered literals, not recomputed ones: 393.6 s
    // rounds to 6:34 positional, 1,396 m, and the derivation displays
    // 2:21.0 (140.97 to the nearest tenth).
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
    expect(screen.getByText("EFFORT")).toBeInTheDocument();
    expect(
      screen.queryByText(/DID YOU HOLD THE TARGETS/),
    ).not.toBeInTheDocument();

    // THE MACHINE TIER, on this door for the first time (Just Row parity,
    // Gate 0 approved 2026-09-07) — and asserted HERE because this is the
    // only test that reaches it from upstream of the producer. The e2e
    // free-row flow cannot: its fake's story scripts no summary burst, so
    // `summaryTotals` is undefined there and the tier is correctly absent
    // (checked this session against the flow's own stored record). The
    // real monitor does send one — this capture carries 0x0039/0x003A/
    // 0x003F at seq 1801-1803.
    //
    // FOUR OF THE SIX LITERALS ARE DECODED, TWO ARE DERIVED — said
    // precisely, because "every number was decoded" would be false. Rate,
    // drag, calories and the AVG HR dash come straight off the capture's
    // bytes, read with a throwaway Python script this session and never
    // off the rendered screen. AVG WATTS and CAL / HOUR are recomputed by
    // hand from those bytes using the logbook's published formulas, which
    // are the same ones `logbookDerived.ts` implements — so those two
    // check the wiring and the inputs, not the formula itself.
    //   0x0039 `f8 35 0e 12 c0 99 00 88 36 00 19 00 00 00 00 65 00 01 81 05`
    //     → elapsed 393.6 s, distance 1396.0 m, rate 25, drag 101,
    //       HR bytes 11-14 ALL ZERO (no belt on this walk).
    //   0x003A `f8 35 0e 12 00 2c 01 02 50 00 7d 00 00 00 00 00 00 da 02`
    //     → calories 80, the PM5's own watts 125, rest distance 0.
    // The logbook's two derived figures over those:
    //   AVG WATTS  round(2.80 / (393.6/1396)³) = 125
    //   CAL / HOUR floor(80 × 3600 / 393.6)    = 731
    // ONE TILE CANNOT SEPARATE THE TWO ARITHMETICS HERE, AND ONE CAN.
    // AVG WATTS cannot: the logbook's 125 W coincides with the PM5's own
    // 0x003A watts on this row, so that tile would pass either way.
    // CAL / HOUR does: the capture's own 0x003A `avgCalPerHour` field
    // (bytes 17-18, `da 02`) decodes to 730, one BELOW the logbook's 731,
    // so asserting 731 rejects the machine's figure. Confirmed by
    // mutation — pointing `calPerHour` at `detail?.avgCalPerHour` renders
    // `CAL / HOUR730` and this test goes red. `screenshots.spec.ts`'s LP
    // block pins the same separation with more daylight (929 vs 931).
    //
    // RATE 25 is the machine's own 0x0039 average, and it is the assertion
    // this PR's one behaviour change exists for: a free row ALWAYS
    // terminates, so before `summaryModel.ts`'s `mode === "justrow"` arm
    // the terminated rule blanked this tile.
    //
    // AVG HR IS THE WEAK ONE, AND SAYING SO IS THE POINT. It reads a dash
    // because the wire carried no heart rate: all 699 of this capture's
    // live 0x0032 frames report 255, and the four 0x0039 heart-rate bytes
    // are zero. A dash cannot redden on this door's WIRING — hardcoding
    // `avgHr: undefined` in `machineTierFromRun` leaves this assertion and
    // `JustRowLog.test.tsx` green, and only `summaryModel.test.ts` bites.
    // That wiring is covered there and in `PostWorkoutSummary.test.tsx`;
    // what this line catches is a FABRICATED number appearing where the
    // wire carried none, which is worth keeping and is all it claims.
    const tier = screen.getByTestId("summary-machine-tier");
    const tiles = within(tier).getAllByRole("group");
    expect(tiles).toHaveLength(6);
    expect(tiles[0]).toHaveTextContent("AVG WATTS125");
    expect(tiles[1]).toHaveTextContent("CALORIES80");
    expect(tiles[2]).toHaveTextContent("CAL / HOUR731");
    expect(tiles[3]).toHaveTextContent("RATE25");
    expect(tiles[4]).toHaveTextContent("DRAG101");
    expect(tiles[5]).toHaveTextContent("AVG HR—");

    // THE SAVE, pressed — one click further than the first cut went, and
    // the click the PM gate's B2 named: nothing upstream of here had ever
    // proven a free row's POST carries the machine fields, and the
    // programmed path's identical claim shipped green three ways while
    // reaching zero of sixteen production rows (RF24's own price tag).
    // The bytes below are the CAPTURE's, decoded by the real driver off
    // the real wire — not a fixture's.
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const call = apiFn.mock.calls.find(([path]) => path === "/api/logs");
      expect(call).toBeDefined();
      const body = JSON.parse(
        (call![1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      expect(body.machineWorkSeconds).toBeCloseTo(MACHINE_ELAPSED_SECONDS, 1);
      expect(body.machineWorkMeters).toBeCloseTo(MACHINE_DISTANCE_METERS, 0);
      // The verification code's raw bytes, present and non-empty — the
      // thing MACHINE CONFIRMED's code renders from.
      const summary = body.machineSummary as {
        verificationBytes?: number[];
        avgPaceSecondsPer500m?: number;
      };
      expect(summary.verificationBytes?.length).toBeGreaterThan(0);
      // 0x0039's own average-pace field, the walk README's decode — the
      // same independent oracle the live assertions above use.
      expect(summary.avgPaceSecondsPer500m).toBeCloseTo(
        MACHINE_AVG_PACE_SECONDS,
        1,
      );
      expect(body.advancesPlan).toBe(false);
    });
  });
});
