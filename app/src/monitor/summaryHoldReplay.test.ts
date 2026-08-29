// Storage-spine design spec §6 (2026-08-29-machine-summary-hold-design.md,
// "the permanent gate: RF24 — start upstream of the producer") — Wave F PR
// 1's own permanent gate, and this file is its LEG 1 (Menu terminate).
//
// RED TODAY, ON PURPOSE. `useMonitorSession.ts:2201` hardcodes
// `held = false` on the `terminated` branch (§1's own diagnosis: "on a
// Menu terminate, useMonitorSession.ts:2201 hardcodes held = false; ...
// on every arm navigation fires with the burst still in flight"). This
// test mounts `LogSession` over a REPLAYED wire capture — never a
// storage-seeded fixture — because a storage-seeded test starts
// downstream of the break and can never go red on it (§6's own binding
// condition). Task 3 implements the hold this test is waiting for; per
// the controller's resolution this commit is NOT `test.fails` (pre-commit
// hooks run format/lint/typecheck only, so a red test commits plainly) —
// every assertion this file cannot yet satisfy carries a
// `// RED until Task 3 (the hold)` comment instead.
//
// The capture: `docs/monitor/sessions/walk-2026-08-25/smoke-terminated-
// recording.jsonl.gz` (§6: "raw bytes of a Menu-killed piece whose burst
// follows the terminal by the corpus worst-case 542 ms, no tx after
// programming so no barrier surprises" — that walk's own README calls it
// "Walk Smoke (`w 1'`), Menu-killed at ~31 s"). Decoded THIS session with a
// throwaway `tsx` script built on this repo's own `parseRecording` +
// `domain/monitor/pm5/parse.ts` (never eyeballed off the hex, never
// carried from the spec by memory):
//   - seq 288's raw 0x0031 (`38 0c 00 49 04 00 08 00 0b 00 04 00 00 00 70
//     17 00 00 66`) is the FIRST general-status frame reading
//     `workoutState=11` ("terminated" — `toMonitorState`); it is also the
//     LAST frame reading `workoutState=4` ("rowing") one tick earlier
//     (seq 285, elapsed 30.81 s / 108.6 m) — this is the frame
//     `driver.ts`'s own `maybeEmitFrame` closes the run and emits
//     `{ kind: "terminated" }` on, synchronously, before seq 288's own
//     0x0032/0x0033 companions are even processed.
//   - seq 294's raw 0x0039 (`98 35 2c 11 4e 0c 00 4c 04 00 2e 00 00 00 00
//     65 00 01 97 05`) decodes via this repo's own
//     `parseEndOfWorkoutSummary` to `elapsedSeconds: 31.5, meters: 110,
//     avgStrokeRate: 46, dragFactorAverage: 101, workoutType: 1,
//     avgPaceSecondsPer500m: 143.1`, every heart-rate field the sentinel
//     `null` (no belt worn — README's own header) — independently
//     confirming the walk's own PM5 View Detail photo transcription
//     (README W-4: screen `:31.5` / `110` / `2:23.1`... modulo W-3's
//     already-documented "0x0039's stroke rate reads exactly DOUBLE on a
//     terminate" anomaly, 46 vs the screen's 23, never displayed here).
//   - seq 296's raw 0x003F (`8c d7 db 90 87 e6 82 e5 d4 1a 01 00 52 00 00
//     00 00 00 00`) is the full 19-byte verification payload, real wire
//     bytes throughout (never zero-padded the way a shorter capture
//     elsewhere in this repo needed).
// The burst arrives LATE here (seq 294, t=53136.5 ms), not bundled into
// the terminal transition's own synchronous block (seq 288, t=52686.2 ms)
// — a genuinely separate rx notification ~450 ms later — so leg 1
// exercises the ordinary "hold spans real wall-clock time" shape, not
// spec §2's zero-cost burst-first race.
//
// `driver.ts`'s own `HASH_SUBWINDOW_MS` (200) governs a summary that
// arrives BEFORE its hash (this capture's own order: 0x0039 at t=53136.5,
// 0x003F at t=53228.6): `noteTerminateObservations` schedules its emit for
// t=53336.5, but 0x003F's own subscribe handler (`driver.ts`'s "CALL SITE
// 5") calls `flushTerminateObservations()` SYNCHRONOUSLY on arrival,
// cancelling that pending schedule and firing the emit immediately —
// independent of the timer. 0x003F lands at seq 296 (t=53228.6), before
// the capture's own last recorded event (disconnect, t=53230.5), so the
// write completes within the ORIGINAL, unmodified capture; no synthetic
// trailing event is needed (an earlier draft of this file appended one on
// a mistaken reading of the scheduled-timer path alone — reviewed out).
//
// Composition: the SAME `createReplayTransport` + `vi.doMock("../adapters/
// monitorTransport")` + `vi.resetModules()` + dynamic re-import idiom
// `burstReplay.test.ts` established (that file's own header names every
// citation for why this is the genuine production wiring, not a bypass;
// not re-derived here — "no test file in `src/monitor/` imports another"
// stays true, but the REASONING doesn't need re-proving twice). THE ONE
// ADDITION (spec §6, antagonist REVISE 6): `MonitorSessionDeps.schedule`
// is ALSO bound to the replay's own virtual clock below —
// `burstReplay.test.ts` binds only `driverOptions.now`/`.schedule`, which
// is enough for a run whose only backstop lives on the split condition;
// the burst condition's own backstop (owed here, Task 3) times out on
// `MonitorSessionDeps.schedule` instead (the same seam `openHandoffHold`'s
// own `FINISH_HANDOFF_HOLD_MS` timer already uses,
// `useMonitorSession.ts:1823-1829`), so leaving it unbound would let that
// backstop run on REAL `setTimeout` while the wire runs on virtual time —
// exactly the "two clocks in one harness" trap this spec calls out by
// name.
//
// `mountLogSessionAndSave` (below) is exported for reuse: Task 2 (leg 2,
// user End) and Task 4 (leg 3, timeout) mount `LogSession` over their own
// replayed storage the identical way.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createElement } from "react";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index.js";
import type { WorkoutType } from "../../domain/types.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { loadMonitorRun, type MonitorRun } from "./monitorRun";
import type { RunIdentity } from "./useMonitorSession";
import {
  parseRecording,
  type ParsedRecording,
  type RecordedEvent,
} from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";
import { withLiveness } from "./transports/liveness";
import type { api } from "../api";
import type { LibraryWorkout } from "../api/useWorkouts";

/** Same path-surgery idiom as `burstReplay.test.ts` (jsdom resolves
 *  `new URL(...)` against `http://localhost:3000/`, so string surgery on
 *  `import.meta.url` stands in for it). `docs/monitor/sessions/` lives
 *  three directories above `app/src/monitor/`. */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/summaryHoldReplay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-25/",
  );

const CAPTURE_FILE = "smoke-terminated-recording.jsonl.gz";

const SMOKE_CAPTURE: ParsedRecording = parseRecording(
  gunzipSync(readFileSync(`${SESSIONS_DIR}${CAPTURE_FILE}`)).toString("utf8"),
);

/** HAND-TRANSCRIBED, byte-verified against seq 15/16's own assembled tx
 *  payload this session (never guessed, never carried from another file
 *  by memory) — `18 01 00 01 01 08 17 01 00 03 05 00 00 00 17 70 04 02 00
 *  00 06 04 00 00 3b 60 14 01 01 13 02 01 01`: `03 05 00 00 00 17 70` =
 *  duration id TIME(0x00)/6000 centiseconds = 60.00 s; `04 02 00 00` =
 *  rest 0 s; `06 04 00 00 3b 60` = 0x00003b60 = 15200 centiseconds/500 m
 *  = 152.0 s/500 m. Independently reproduces `structureWatchReplay.
 *  test.ts`'s own already-committed `SMOKE_TERMINATED_PROGRAM` for this
 *  identical capture — a second, cross-file confirmation of the same
 *  bytes, not a copy taken on faith (this repo's "no test file in
 *  `src/monitor/` imports another" convention, restated rather than
 *  reused). `displaySpm` is never on the wire at all
 *  (`pm5/commands.ts#buildIntervalBlock` never encodes it), so `null`
 *  here costs nothing against the divergence check below. */
const SMOKE_TERMINATED_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

const SMOKE_WORKOUT_ID = "id-walk-smoke-fixture";

/** No library workout behind this run (same reasoning as `burstReplay.
 *  test.ts`'s own `KEYSTONE_IDENTITY`: "Walk Smoke" was an authored,
 *  ad-hoc walk workout, never a seeded library one) — but UNLIKE that
 *  fixture, `logSeed.steps` here has length 1, matching
 *  `SMOKE_TERMINATED_PROGRAM.intervals.length`: this file's own leg 3
 *  (assertion 3) mounts `LogSession`, and `buildMonitorLogSteps`
 *  (`logDraft.ts`) disqualifies any length mismatch from monitor mode
 *  entirely (§3's own "a length mismatch ... disqualifies the record"),
 *  which `burstReplay.test.ts` never needs to satisfy since it never
 *  mounts the log door. */
const SMOKE_IDENTITY: RunIdentity = {
  workoutId: SMOKE_WORKOUT_ID,
  title: "Walk Smoke",
  logSeed: { steps: [{ label: "1:00 @ 2:32.0", kind: "work" }], paces: {} },
};

const FIXED_NOW = new Date("2026-08-25T09:00:00.000Z");

interface SmokeReplayOutcome {
  divergences: string[];
  record: MonitorRun | null;
  handoffHeld: boolean;
  phase: string;
  exportLog: () => string;
}

/**
 * Drives `events` through the real transport-replay engine into a FRESH
 * `useMonitorSession` instance — `burstReplay.test.ts`'s own idiom
 * (`vi.doMock("../adapters/monitorTransport")` + `vi.resetModules()` +
 * dynamic re-import), restated here per this project's "no test file in
 * `src/monitor/` imports another" convention. Called TWICE below (a
 * truncated replay stopping right before the burst, then the full
 * capture) — exactly the two-call shape `burstReplay.test.ts`'s own
 * `runReplay` already establishes (its real-run/control-run pair), so
 * `vi.doMock` re-registering its factory and `vi.resetModules()` forcing
 * a genuinely fresh module graph each call is proven safe to repeat
 * within one `it()`.
 *
 * Returns `handoffHeld`/`phase` read directly off the hook's OWN state —
 * never persisted to `MonitorRun` (`grep` confirms no such field on that
 * type) — so a TRUNCATED event list's own final state, read the instant
 * `replay.run()` resolves, IS "the state at the ended flip" for a
 * recording that stops there: nothing else happens afterward to move it.
 */
async function runReplay(events: RecordedEvent[]): Promise<SmokeReplayOutcome> {
  const recording: ParsedRecording = { header: SMOKE_CAPTURE.header, events };
  const replay = createReplayTransport(recording);
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

  const { useMonitorSession: freshUseMonitorSession } =
    await import("./useMonitorSession");

  const { result } = renderHook(() =>
    freshUseMonitorSession({
      now: () => FIXED_NOW,
      // Antagonist REVISE 6 (spec §6) — see this file's header comment.
      schedule: (cb, ms) => replay.clock.schedule(cb, ms),
      driverOptions: {
        now: () => replay.clock.now(),
        schedule: (cb, ms) => replay.clock.schedule(cb, ms),
      },
    }),
  );

  await act(async () => {
    await result.current.connect();
  });

  let replayResult: ReplayResult = { divergences: [] };
  await act(async () => {
    const pending = result.current.program(
      SMOKE_TERMINATED_PROGRAM,
      SMOKE_IDENTITY,
    );
    replayResult = await replay.run();
    await pending;
  });

  return {
    divergences: replayResult.divergences,
    record: loadMonitorRun(),
    handoffHeld: result.current.handoffHeld,
    phase: result.current.phase,
    exportLog: () => result.current.exportLog(),
  };
}

/** Same `vi.fn`-returns-a-real-`Response` idiom `LogSession.test.tsx`'s
 *  own `mockApi` uses, restated here (this project's own "no test file
 *  imports another" convention, this time for `src/session/`). */
function mockApi(): ReturnType<typeof vi.fn<typeof api>> {
  const fn = vi.fn<typeof api>(
    async () =>
      new Response(JSON.stringify({ id: "log-summary-hold-fixture" }), {
        status: 201,
      }),
  );
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

/** Metadata source only (type/difficulty/pain/steps) — real library
 *  fixture per this repo's own realistic-fixture rule (recurring failure
 *  3), not a hand-built minimum. "Walk Smoke" itself was never a seeded
 *  library workout (this file's own `SMOKE_IDENTITY` comment), so `id`/
 *  `title` are always overridden by the caller. */
const LIBRARY_METADATA_SOURCE = LIBRARY_WORKOUTS.find(
  (w) => w.title === "Hoarfrost",
)!;

function libraryWorkoutFixture(id: string, title: string): LibraryWorkout {
  return {
    id,
    title,
    type: LIBRARY_METADATA_SOURCE.type as WorkoutType,
    difficulty: LIBRARY_METADATA_SOURCE.difficulty,
    pain: LIBRARY_METADATA_SOURCE.pain,
    steps: LIBRARY_METADATA_SOURCE.steps,
    isGlobal: true,
    lastDoneDaysAgo: null,
  };
}

/**
 * Mounts `LogSession` at the manual door's own monitor-mode route
 * (`/library/:id/log?from=monitor` — `monitorModeRun`'s own condition 1)
 * over whatever `MonitorRun` a prior `runReplay` call already wrote to
 * `localStorage`, drives the door's Save flow (`chooseHeldAndPain` +
 * `LogSession.test.tsx`'s own default "Save without logging" button, no
 * active plan), and returns the resulting save POST's parsed body.
 * EXPORTED for reuse (task brief): Task 2 (leg 2) and Task 4 (leg 3)
 * mount their own replayed storage through this identical helper rather
 * than re-deriving the mocking/interaction sequence.
 *
 * Does NOT `vi.resetModules()` before importing `./LogSession` — the two
 * `runReplay` calls above only ever import `./useMonitorSession`'s own
 * graph, which `LogSession.tsx` never touches (it has no
 * `useMonitorSession` import at all, confirmed this session by reading
 * its import list), so `../api/*`/`../session/LogSession` are each
 * imported fresh here for the first time regardless.
 */
export async function mountLogSessionAndSave(
  workoutId: string,
  workoutTitle: string,
): Promise<{
  body: Record<string, unknown>;
  apiFn: ReturnType<typeof vi.fn<typeof api>>;
}> {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({
      state: "ready",
      workouts: [libraryWorkoutFixture(workoutId, workoutTitle)],
    }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({
      state: "ready",
      baselines: { k2Seconds: null, k6Seconds: null },
    }),
  }));
  vi.doMock("../api/usePlan", () => ({
    usePlan: () => ({
      state: "ready",
      plan: { planKey: null, doneN: 0, sequence: [] },
      choose: vi.fn(),
      reset: vi.fn(),
    }),
  }));
  const apiFn = mockApi();

  const { default: LogSession } = await import("../session/LogSession");
  // `createElement`, not JSX: the task brief names this file
  // `summaryHoldReplay.test.ts` (a `.ts`, not `.tsx`), and JSX syntax
  // requires the latter — same tree `LogSession.test.tsx`'s own
  // `renderManualLog` builds, spelled without the syntax sugar.
  render(
    createElement(
      MemoryRouter,
      { initialEntries: [`/library/${workoutId}/log?from=monitor`] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/library/:id/log",
          element: createElement(LogSession),
        }),
        createElement(Route, {
          path: "/today",
          element: createElement("p", null, "TODAY SCREEN"),
        }),
      ),
    ),
  );
  await screen.findByRole("heading", { name: workoutTitle });
  // `LogSession.test.tsx`'s own `chooseHeldAndPain` — "Pain 2" is real
  // (Hoarfrost's own seeded value, `libraryWorkoutFixture`'s metadata
  // source), not a hand-picked number this fixture invented.
  await userEvent.click(screen.getByRole("button", { name: "HELD" }));
  await userEvent.click(screen.getByRole("button", { name: "Pain 2" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Save without logging" }),
  );
  await screen.findByText("TODAY SCREEN");

  const call = apiFn.mock.calls[0];
  if (call === undefined) {
    throw new Error("mountLogSessionAndSave: Save never posted");
  }
  const [, init] = call;
  const body = JSON.parse((init as RequestInit).body as string) as Record<
    string,
    unknown
  >;
  return { body, apiFn };
}

describe("the summary hold's permanent gate, leg 1: Menu terminate (storage-spine design spec §6)", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.doUnmock("../adapters/appLifecycle");
    vi.doUnmock("../api/useWorkouts");
    vi.doUnmock("../api/useBaselines");
    vi.doUnmock("../api/usePlan");
    vi.doUnmock("../api");
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("holds the ended hand-off across a Menu terminate until the burst's write attempt lands, then posts the machine's own numbers (RED until Task 3 — the hold)", async () => {
    localStorage.clear();

    // --- assertion (1): AT THE ENDED FLIP, handoffHeld is true ----------
    // A truncated replay — every real event through seq 293 (the split
    // pair immediately following the terminal transition), stopping
    // BEFORE the burst (seq 294 onward) ever arrives. Once `replay.run()`
    // resolves, nothing further has happened to this hook: its final
    // `phase`/`handoffHeld` reading IS the reading at the ended flip
    // (spec §6: "at the `ended` flip, `handoffHeld` is `true` and stays
    // true past the point today's code navigates").
    const truncated = await runReplay(SMOKE_CAPTURE.events.slice(0, 294));

    expect(truncated.divergences).toStrictEqual([]);
    expect(truncated.phase).toBe("ended");
    expect(truncated.record).not.toBeNull();
    expect(truncated.record!.endedBy).toBe("rower");
    expect(truncated.record!.completedAt).not.toBeNull();

    // THE RED ASSERTION. Today, `useMonitorSession.ts:2201` computes
    // `const held = terminated ? false : openHandoffHold();` — the
    // `terminated` branch NEVER opens a hold, so this reads `false` from
    // the very first `ended` render. RED until Task 3 (the hold).
    expect(truncated.handoffHeld).toBe(true);

    // --- assertion (2): the burst's write attempt precedes release ------
    // Unreached while (1) fails. The full, UNMODIFIED capture replayed to
    // completion — `handoffHeld` must flip false only AFTER
    // `summaryTotals` is written, matching the recording's own decoded
    // 0x0039 pair exactly (31.5 s / 110 m — this file's header cites the
    // raw bytes). No synthetic trailing event needed: 0x003F (seq 296,
    // t=53228.6) arrives before the capture's own last event (disconnect,
    // t=53230.5) and flushes the write synchronously (this file's header,
    // "CALL SITE 5").
    const full = await runReplay(SMOKE_CAPTURE.events);

    expect(full.divergences).toStrictEqual([]);
    expect(full.record).not.toBeNull();
    const fullRecord = full.record!;

    // RED until Task 3 (the hold): today, nothing ever opened a hold on
    // this arm, so `handoffHeld` is already `false` before the burst is
    // even in play — this assertion cannot distinguish "released
    // correctly" from "never held" until (1) above is fixed.
    expect(full.handoffHeld).toBe(false);
    expect(fullRecord.summaryTotals).toStrictEqual({
      workElapsedSeconds: 31.5,
      workDistanceMeters: 110,
    });
    expect(fullRecord.summaryDetail).toStrictEqual({
      avgStrokeRate: 46,
      endingHeartRateBpm: null,
      avgHeartRateBpm: null,
      minHeartRateBpm: null,
      maxHeartRateBpm: null,
      dragFactorAverage: 101,
      workoutType: 1,
      recoveryHeartRateBpm: null,
      avgPaceSecondsPer500m: 143.1,
    });
    expect(fullRecord.verificationBytes).toBeDefined();
    expect(Array.from(fullRecord.verificationBytes!.slice(0, 8))).toStrictEqual(
      [140, 215, 219, 144, 135, 230, 130, 229],
    );

    // Ordering, not just co-occurrence (spec §6: "write ATTEMPT before
    // release ... this asserts ordering"). `driver.ts`'s own
    // `noteTerminateObservations` always logs `summary-reconciled` at the
    // write attempt (this ring entry exists TODAY, independent of Task 3
    // — the write side of this race already works; only the hold's
    // release is missing); Task 3's own release fires the existing
    // `handoff-released` kind (reused from the split condition, per spec
    // §2: "one `handoffHeld: false` update, one `handoff-released` ring
    // entry"). RED until Task 3: today's ring carries no `handoff-
    // released` entry at all on this arm, so `releaseIdx` reads `-1`.
    const entries = JSON.parse(full.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    const writeIdx = entries.findIndex(
      (e) =>
        e.kind === "summary-reconciled" &&
        e.detail.includes("terminate-observations"),
    );
    const releaseIdx = entries.findIndex((e) => e.kind === "handoff-released");
    expect(writeIdx).toBeGreaterThanOrEqual(0);
    expect(releaseIdx).toBeGreaterThanOrEqual(0); // RED until Task 3 (the hold)
    expect(releaseIdx).toBeGreaterThanOrEqual(writeIdx);

    // --- assertion (3): the log door posts the machine's own numbers ----
    // Unreached while (1)/(2) fail. A FRESH `LogSession` mount over the
    // storage the full replay actually wrote (`monitorModeRun`'s own four
    // conditions, all satisfied: `from=monitor`, a completed run, a
    // matching `workoutId`, and a length-1 `logSeed` aligned with
    // `SMOKE_TERMINATED_PROGRAM`'s own single interval).
    const { body } = await mountLogSessionAndSave(
      SMOKE_WORKOUT_ID,
      "Walk Smoke",
    );

    expect(body.machineWorkSeconds).toBe(31.5);
    expect(body.machineWorkMeters).toBe(110);
    expect(body.machineSummary).toStrictEqual({
      verificationBytes: Array.from(fullRecord.verificationBytes!),
      ...fullRecord.summaryDetail,
    });
  });
});
