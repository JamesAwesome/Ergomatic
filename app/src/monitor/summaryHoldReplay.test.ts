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
// replayed storage the identical way. `runReplay` (below) is likewise
// GENERALIZED for leg 2's own program/identity/timing — no test-file
// import needed, both legs live in this one file.
//
// LEG 2 (user End): `docs/monitor/sessions/walk-2026-08-28/end-on-
// interval-1-recording.jsonl.gz` (that walk's own README, provenance
// table: "first attempt at leg 2; ended on interval 1, so no rest
// boundary was crossed" — the SAME 3×1:00/1:00-rest program the table's
// next row names for its sibling capture). `header.program` is absent
// here too (confirmed this session — `END_CAPTURE.header` carries only
// `{v, app, transport, ua}`), so the program is hand-transcribed from the
// recorded `ce060021` tx frames (seq 15-19) the identical way leg 1's
// own header documents, byte-verified against THIS capture's own bytes,
// never carried from the README by memory — see `END_ON_INTERVAL_1_
// PROGRAM`'s own comment for the decode. The bytes agree with the
// README's "3x1' time-only with 1:00 rests" description exactly (RF10:
// the bytes were checked, not merely cited).
//
// The End press: seq 75's terminate tx (`f1 76 04 13 02 01 02 60 f2`,
// t=15155.4 — the IDENTICAL fixed CSAFE command byte-for-byte as seq 13's
// own pre-programming "prepare" terminate, confirming this is a constant
// command with no session-dependent bytes) is a replay BARRIER.
// `endSession` (`useMonitorSession.ts:3218-3219`) closes the record
// SYNCHRONOUSLY — `closeRecord`/`update({phase:"ended",...})` both run
// BEFORE it ever awaits `driver.terminate()` — so scheduling the call for
// any due time between the last preceding rx event (seq 74, t=14633.7)
// and the barrier's own t (15155.4) fires it exactly while `replay.ts`'s
// `run()` loop calls `advanceClock(15155.4)` for that SAME barrier event,
// synchronously, before the loop's own `await waitForWrite()` for it —
// so the hook's own `driver.terminate()` write is already queued (or
// about to be) by the time the barrier needs it, and the recorded ack
// (seq 79, `f1 89 76 01 13 ed f2`) settles it. `scheduleEndPress` below
// is this scheduled action.
//
// The burst here is ALSO the "late hash" shape (0x0039 at seq 86,
// t=15712.9; 0x003F at seq 88, t=15714.0 — ~1.1 ms apart), and 0x003F
// again arrives before the capture's own last event (disconnect,
// t=15714.6), so CALL SITE 5 flushes it synchronously within the
// UNMODIFIED capture, the same fact leg 1's header now documents — no
// synthetic trailing event here either.
//
// RED expectation, same shape as leg 1: `endSession`'s own `ended` patch
// (`update({phase: "ended", endedBy: "user", runOpen: false})`) sets no
// `handoffHeld` key at all, so it reads today's `INITIAL_STATE` default
// (`false`) at the very first `ended` render — spec §2: "user End in the
// app — endSession ...: opened in its `ended` patch, which today opens
// nothing."

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
import type { MonitorSession, RunIdentity } from "./useMonitorSession";
import { parseRecording, type ParsedRecording } from "./transports/recording";
import {
  createReplayTransport,
  type ReplayHandle,
  type ReplayResult,
} from "./transports/replay";
import { withLiveness } from "./transports/liveness";
import type { api } from "../api";
import type { LibraryWorkout } from "../api/useWorkouts";

/** Same path-surgery idiom as `burstReplay.test.ts` (jsdom resolves
 *  `new URL(...)` against `http://localhost:3000/`, so string surgery on
 *  `import.meta.url` stands in for it). `docs/monitor/sessions/` lives
 *  three directories above `app/src/monitor/`. Shared by every leg in
 *  this file — each leg's own walk directory joins underneath it. */
const MONITOR_SESSIONS_ROOT = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/summaryHoldReplay\.test\.ts$/,
    "../docs/monitor/sessions/",
  );

function loadCapture(walkDir: string, file: string): ParsedRecording {
  return parseRecording(
    gunzipSync(
      readFileSync(`${MONITOR_SESSIONS_ROOT}${walkDir}/${file}`),
    ).toString("utf8"),
  );
}

const SMOKE_CAPTURE: ParsedRecording = loadCapture(
  "walk-2026-08-25",
  "smoke-terminated-recording.jsonl.gz",
);

const END_CAPTURE: ParsedRecording = loadCapture(
  "walk-2026-08-28",
  "end-on-interval-1-recording.jsonl.gz",
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

/** HAND-TRANSCRIBED, byte-verified this session against seq 15-19's own
 *  assembled tx payload (85-byte CSAFE frame, `f1 76 55 <85 bytes> <sum>
 *  f2`): `18 01 00 01 01 08 17 01 00 03 05 00 00 00 17 70 04 02 00 3c 06
 *  04 00 00 3b 60 14 01 01 18 01 01 17 01 00 03 05 00 00 00 17 70 04 02
 *  00 3c 06 04 00 00 3b 60 14 01 01 18 01 02 17 01 00 03 05 00 00 00 17
 *  70 04 02 00 00 06 04 00 00 3b 60 14 01 01 13 02 01 01` — THREE
 *  `18 01 0N`-headed interval blocks, each carrying the identical triple
 *  `03 05 00 00 00 17 70` (duration id TIME(0x00)/0x00001770=6000
 *  centiseconds = 60.00 s) / `04 02 <rest>` / `06 04 00 00 3b 60`
 *  (target pace 0x3b60=15200 centiseconds/500 m = 152.0 s/500 m) —
 *  intervals 1-2 carry `04 02 00 3c` (rest 0x3c=60 s), interval 3 carries
 *  `04 02 00 00` (rest 0 s, the same "last interval has no rest" shape
 *  `structureWatchReplay.test.ts`'s own `RESTS_FINISHED_PROGRAM` already
 *  documents). This is EXACTLY the walk's own README ("3x1' time-only
 *  with 1:00 rests") — the bytes were checked, not merely cited (RF10:
 *  had they disagreed, the bytes would win). */
const END_ON_INTERVAL_1_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 60,
    },
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

const END_WORKOUT_ID = "id-end-on-interval-1-fixture";

/** No library workout behind this run either (same reasoning as
 *  `SMOKE_IDENTITY` above). `logSeed.steps` has length 3, matching
 *  `END_ON_INTERVAL_1_PROGRAM.intervals.length` — required for
 *  `buildMonitorLogSteps` (assertion 3's `LogSession` mount) to accept
 *  the record into monitor mode at all. */
const END_IDENTITY: RunIdentity = {
  workoutId: END_WORKOUT_ID,
  title: "End on Interval 1",
  logSeed: {
    steps: [
      { label: "1:00 @ 2:32.0", kind: "work" },
      { label: "1:00 @ 2:32.0", kind: "work" },
      { label: "1:00 @ 2:32.0", kind: "work" },
    ],
    paces: {},
  },
};

/** Frozen for every leg in this file — only ever feeds `MonitorRun.
 *  startedAt`/`completedAt`'s ISO stamps, which no assertion below reads,
 *  so one shared value costs nothing and avoids a meaningless per-leg
 *  duplicate. */
const FIXED_NOW = new Date("2026-08-25T09:00:00.000Z");

/** Seq 75's terminate-tx barrier's own hex (this file's header, "The End
 *  press") — the IDENTICAL fixed CSAFE command byte-for-byte as seq 13's
 *  own pre-programming "prepare" terminate (no session-dependent bytes),
 *  quoted here so the barrier below is FOUND, not hand-transcribed. */
const END_TERMINATE_TX_HEX = "f1 76 04 13 02 01 02 60 f2";

/**
 * The terminate-tx event itself, located by its own bytes rather than by a
 * hand-picked index or timestamp — a Task-2-review carried finding (Task 3
 * brief): a re-recorded walk that shifts this event's `t` (or its position
 * in the file) cannot silently invalidate `scheduleEndPress`'s own due time
 * below, because that due time is now DERIVED from whatever `t` this event
 * actually carries, not a literal copied out of a comment.
 *
 * `findLast`, not `find`: this exact byte string appears TWICE in
 * `END_CAPTURE` (seq 13's own pre-programming "prepare" terminate is
 * byte-identical, this file's header) — `find` would silently grab the
 * WRONG (much earlier) occurrence and schedule the End press before
 * programming even completes. The barrier this leg means is the LAST one
 * — the real terminate the rower's own End press sends, seq 75.
 */
const endTerminateBarrier = END_CAPTURE.events.findLast(
  (e): e is Extract<typeof e, { dir: "tx" }> =>
    "dir" in e && e.dir === "tx" && e.hex === END_TERMINATE_TX_HEX,
);
if (endTerminateBarrier === undefined) {
  throw new Error(
    "summaryHoldReplay.test.ts: END_CAPTURE carries no terminate-tx event matching END_TERMINATE_TX_HEX — the capture's shape changed; scheduleEndPress has nothing to derive its due time from",
  );
}

/** A MARGIN off the barrier's own timestamp, not an absolute due time: the
 *  press only needs to land strictly after the last preceding rx event
 *  (seq 74, t=14633.7 — comfortably more than this margin before the
 *  barrier) and strictly before the barrier itself, so deriving the due
 *  time as `barrier.t - END_PRESS_MARGIN_MS` keeps both true even if a
 *  re-recording moves the barrier's own `t`. 55.4 reproduces this file's
 *  original literal (15_100) against the barrier's documented 15155.4 —
 *  chosen for continuity with the capture this leg was built against, not
 *  because the margin itself is load-bearing. */
const END_PRESS_MARGIN_MS = 55.4;
const END_PRESS_DUE_MS = endTerminateBarrier.t - END_PRESS_MARGIN_MS;

/**
 * Leg 2's own scheduled action (this file's header, "The End press"):
 * registers `endSession()` to fire on the replay's virtual clock at
 * `END_PRESS_DUE_MS` — between the last rx event before seq 75's
 * terminate-tx barrier (t=14633.7) and the barrier's own recorded t
 * (15155.4) — landing inside the SAME `advanceClock` call `replay.ts`'s
 * `run()` loop makes for that barrier event, before its own
 * `await waitForWrite()`. `void` on purpose: `endSession()`'s returned
 * promise settles `driver.terminate()` asynchronously, and nothing this
 * test reads depends on that settling (the record closes SYNCHRONOUSLY
 * inside `endSession`, before the `await` — this file's header) — the
 * replay's own remaining rx events (the ack, the terminal General Status
 * ticks) give it more than enough microtask-draining room to finish before
 * `replay.run()` itself resolves.
 */
function scheduleEndPress(
  replay: ReplayHandle,
  result: { current: MonitorSession },
): void {
  replay.clock.schedule(() => {
    void result.current.endSession();
  }, END_PRESS_DUE_MS);
}

interface ReplayOutcome {
  divergences: string[];
  record: MonitorRun | null;
  handoffHeld: boolean;
  phase: string;
  exportLog: () => string;
}

/**
 * Drives `recording` through the real transport-replay engine into a
 * FRESH `useMonitorSession` instance — `burstReplay.test.ts`'s own idiom
 * (`vi.doMock("../adapters/monitorTransport")` + `vi.resetModules()` +
 * dynamic re-import), restated here per this project's "no test file in
 * `src/monitor/` imports another" convention. GENERALIZED over
 * `program`/`identity` (leg 1 and leg 2 each program a different capture)
 * and an optional `scheduleAction` (leg 2's own `scheduleEndPress` —
 * leg 1 needs none, since a Menu terminate is a pure wire event with no
 * app-initiated write). Called multiple times per leg below (a truncated
 * replay stopping right before the burst, then the full capture) —
 * exactly the two-call shape `burstReplay.test.ts`'s own `runReplay`
 * already establishes (its real-run/control-run pair), so `vi.doMock`
 * re-registering its factory and `vi.resetModules()` forcing a genuinely
 * fresh module graph each call is proven safe to repeat across many
 * calls in one file.
 *
 * Returns `handoffHeld`/`phase` read directly off the hook's OWN state —
 * never persisted to `MonitorRun` (`grep` confirms no such field on that
 * type) — so a TRUNCATED event list's own final state, read the instant
 * `replay.run()` resolves, IS "the state at the ended flip" for a
 * recording that stops there: nothing else happens afterward to move it.
 */
async function runReplay(
  recording: ParsedRecording,
  program: WorkoutProgram,
  identity: RunIdentity,
  scheduleAction?: (
    replay: ReplayHandle,
    result: { current: MonitorSession },
  ) => void,
): Promise<ReplayOutcome> {
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

  scheduleAction?.(replay, result);

  await act(async () => {
    await result.current.connect();
  });

  let replayResult: ReplayResult = { divergences: [] };
  await act(async () => {
    const pending = result.current.program(program, identity);
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

// File-level (not per-`describe`): every leg in this file shares the
// identical mock/module/storage cleanup, and vitest's `afterEach` applies
// to every test in the file regardless of which `describe` declares it.
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

describe("the summary hold's permanent gate, leg 1: Menu terminate (storage-spine design spec §6)", () => {
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
    const truncated = await runReplay(
      {
        header: SMOKE_CAPTURE.header,
        events: SMOKE_CAPTURE.events.slice(0, 294),
      },
      SMOKE_TERMINATED_PROGRAM,
      SMOKE_IDENTITY,
    );

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
    const full = await runReplay(
      SMOKE_CAPTURE,
      SMOKE_TERMINATED_PROGRAM,
      SMOKE_IDENTITY,
    );

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

describe("the summary hold's permanent gate, leg 2: user End (storage-spine design spec §6)", () => {
  it("holds the ended hand-off across an app-initiated End until the burst's write attempt lands, then posts the machine's own numbers (RED until Task 3 — the hold)", async () => {
    localStorage.clear();

    // --- assertion (1): AT THE ENDED FLIP, handoffHeld is true ----------
    // A truncated replay — every real event through seq 85 (the tick
    // immediately preceding the burst), stopping BEFORE the burst
    // (seq 86 onward) ever arrives — but including seq 75's terminate-tx
    // barrier, `scheduleEndPress`'s own trigger. Once `replay.run()`
    // resolves, nothing further has happened to this hook: its final
    // `phase`/`handoffHeld` reading IS the reading at the ended flip.
    const truncated = await runReplay(
      { header: END_CAPTURE.header, events: END_CAPTURE.events.slice(0, 86) },
      END_ON_INTERVAL_1_PROGRAM,
      END_IDENTITY,
      scheduleEndPress,
    );

    expect(truncated.divergences).toStrictEqual([]);
    expect(truncated.phase).toBe("ended");
    expect(truncated.record).not.toBeNull();
    expect(truncated.record!.endedBy).toBe("rower");
    expect(truncated.record!.completedAt).not.toBeNull();

    // THE RED ASSERTION. Today, `endSession`'s own `ended` patch
    // (`update({phase: "ended", endedBy: "user", runOpen: false})`) sets
    // no `handoffHeld` key at all — it opens nothing (spec §2's own
    // words, this file's header) — so this reads `false`, `INITIAL_
    // STATE`'s own default, from the very first `ended` render. RED
    // until Task 3 (the hold).
    expect(truncated.handoffHeld).toBe(true);

    // --- assertion (2): the burst's write attempt precedes release ------
    // Unreached while (1) fails. The full, UNMODIFIED capture replayed to
    // completion — `handoffHeld` must flip false only AFTER
    // `summaryTotals` is written, matching THIS recording's own decoded
    // 0x0039 pair exactly (8.5 s / 15 m — this file's header cites the
    // raw bytes). No synthetic trailing event needed: 0x003F (seq 88,
    // t=15714.0) arrives before the capture's own last event (disconnect,
    // t=15714.6) and flushes the write synchronously (CALL SITE 5, same
    // fact leg 1's own header documents).
    const full = await runReplay(
      END_CAPTURE,
      END_ON_INTERVAL_1_PROGRAM,
      END_IDENTITY,
      scheduleEndPress,
    );

    expect(full.divergences).toStrictEqual([]);
    expect(full.record).not.toBeNull();
    const fullRecord = full.record!;

    // RED until Task 3 (the hold): today, nothing ever opened a hold on
    // this arm, so `handoffHeld` is already `false` before the burst is
    // even in play — this assertion cannot distinguish "released
    // correctly" from "never held" until (1) above is fixed.
    expect(full.handoffHeld).toBe(false);
    expect(fullRecord.summaryTotals).toStrictEqual({
      workElapsedSeconds: 8.5,
      workDistanceMeters: 15,
    });
    expect(fullRecord.summaryDetail).toStrictEqual({
      avgStrokeRate: 56,
      endingHeartRateBpm: null,
      avgHeartRateBpm: null,
      minHeartRateBpm: null,
      maxHeartRateBpm: null,
      dragFactorAverage: 91,
      workoutType: 1,
      recoveryHeartRateBpm: null,
      avgPaceSecondsPer500m: 283.3,
    });
    expect(fullRecord.verificationBytes).toBeDefined();
    expect(Array.from(fullRecord.verificationBytes!.slice(0, 8))).toStrictEqual(
      [113, 118, 31, 253, 73, 231, 9, 210],
    );

    // Ordering, not just co-occurrence — same reasoning as leg 1's own
    // comment: `noteTerminateObservations` always logs `summary-
    // reconciled` at the write attempt (works today, independent of
    // Task 3); Task 3's own release is expected to reuse the existing
    // `handoff-released` kind. RED until Task 3: today's ring carries no
    // `handoff-released` entry at all on this arm, so `releaseIdx` reads
    // `-1`.
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
    // matching `workoutId`, and a length-3 `logSeed` aligned with
    // `END_ON_INTERVAL_1_PROGRAM`'s own three intervals).
    const { body } = await mountLogSessionAndSave(
      END_WORKOUT_ID,
      "End on Interval 1",
    );

    expect(body.machineWorkSeconds).toBe(8.5);
    expect(body.machineWorkMeters).toBe(15);
    expect(body.machineSummary).toStrictEqual({
      verificationBytes: Array.from(fullRecord.verificationBytes!),
      ...fullRecord.summaryDetail,
    });
  });
});
