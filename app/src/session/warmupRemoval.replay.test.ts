// Phase WU (warm-up removal), Task 1 — the two behavioural pins that make
// the eventual removal visible instead of silent
// (`.superpowers/sdd/2026-08-21-warmup-removal/task-1-brief.md`). Nothing is
// removed by this task: both pins land GREEN against TODAY's code, on
// purpose — for a deletion the compiler drives the change, so a behavioural
// pin is the only thing that can fail meaningfully. Phase WU's later task
// flips the MOVER pin's own expectation once the warm-up interval is
// retyped `work`; the CONTROL pin must stay byte-identical across that
// change, or the removal perturbed arithmetic it had no business touching.
//
// HARNESS CONVENTION (load-bearing, and it is why this file re-derives
// rather than imports): no test file in `src/monitor/` imports another test
// file — `connectedMetricsReplay.test.ts`'s own header states the
// convention and its reasoning. `buildSummaryForCapture` below is this
// file's OWN independently-typed re-derivation of that file's `replaySession`
// helper (itself templated on `recordReplay.roundtrip.test.ts`), not an
// import — `SESSION_2_PROGRAM`/`CM_PHASES` are copied from
// `connectedMetricsReplay.test.ts:86`/`:147` verbatim (their own doc
// comments there carry the full provenance: HANDOFF.md's program shape plus
// a byte-for-byte decode of the `ce060021` programming tx against
// `commands.ts`'s `buildIntervalBlock` encoding) and `KEYSTONE_PROGRAM`
// mirrors `registerReplay.test.ts:92`'s own `SESSION_1_PROGRAM` (that
// file's own header names its transcription sources) the same way.
//
// ONE LAYER UP from `connectedMetricsReplay.test.ts`: that file's job is
// the DISPLAYED connected pane (`buildSurfaceModel` -> `SurfaceModel`); this
// file's job is the STORED summary (`buildSummaryModel` -> `SummaryModel`,
// `summaryModel.ts`) — the model a finished run's log/summary screen reads,
// one door further downstream. `buildSummaryForCapture` therefore replays a
// capture the same way, then feeds the resulting `MonitorRun` through the
// exact same three production functions `useMonitorSession.ts` calls to
// build one (`createMonitorRun`/`recordActual`/`completeMonitorRun`,
// `monitorRun.ts`) rather than hand-assembling a `MonitorRun` object
// literal — so this pin exercises the real finish-grace/immutability rules
// those functions enforce, not a shortcut that could silently diverge from
// what a rower's phone actually stores.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { createEventLog } from "../monitor/eventLog";
import { createPm5Driver } from "../monitor/driver";
import { parseRecording } from "../monitor/transports/recording";
import { createReplayTransport } from "../monitor/transports/replay";
import type { EnginePhase } from "./engine";
import { buildLogSeed } from "./logDraft";
import {
  createMonitorRun,
  recordActual,
  completeMonitorRun,
  type MonitorRun,
} from "../monitor/monitorRun";
import { buildSummaryModel, type SummaryModel } from "./summaryModel";

/** Same path-surgery idiom as `connectedMetricsReplay.test.ts`'s own
 *  `SESSIONS_DIR` (this file lives at the same depth under `app/`, so the
 *  identical `../docs/monitor/sessions/` climb applies). */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/session\/warmupRemoval\.replay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-16/",
  );

/** Copied verbatim from `connectedMetricsReplay.test.ts:86` — see that
 *  file's own doc comment for the full transcription provenance. The
 *  MOVER capture: a 100m warm-up (interval 0) followed by four unequal
 *  work intervals. */
const SESSION_2_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "warmup",
      kind: "distance",
      value: 100,
      targetSplit: null,
      displaySpm: null,
      restSeconds: 0,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "time",
      value: 120,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "distance",
      value: 500,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** Copied verbatim from `connectedMetricsReplay.test.ts:147` — see that
 *  file's own doc comment for why every work phase's `targetSplit` is 129
 *  (the wire-verified value on every one of session 2's four work pieces).
 *  Mirrors `SESSION_2_PROGRAM` one-for-one, rest phases interleaved only
 *  where `restSeconds > 0` — the shape `surfaceModel.ts`'s own
 *  `phaseIndexForInterval` and this file's own `buildLogSeed` call both
 *  expect. */
const CM_PHASES: EnginePhase[] = [
  { type: "warmup", meters: 100, label: "Easy", originalIndex: -1 },
  {
    type: "work",
    seconds: 60,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 0,
  },
  { type: "rest", seconds: 30, label: "Rest", originalIndex: 0 },
  {
    type: "work",
    seconds: 120,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 1,
  },
  { type: "rest", seconds: 30, label: "Rest", originalIndex: 1 },
  {
    type: "work",
    meters: 500,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 2,
  },
  { type: "rest", seconds: 30, label: "Rest", originalIndex: 2 },
  {
    type: "work",
    seconds: 60,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 3,
  },
];

/** Mirrors `registerReplay.test.ts:92`'s own `SESSION_1_PROGRAM` — see that
 *  file's own doc comment for the transcription provenance (HANDOFF.md's
 *  program shape plus a hand-decode of the `ce060021` programming tx bytes
 *  against `commands.ts`'s `buildIntervalBlock` encoding). The CONTROL
 *  capture: 2×250m, r0, NO warm-up anywhere in the program
 *  (`docs/monitor/sessions/walk-2026-08-16/RUNSHEET.md`, Session 1: "2×250
 *  m, r0, NO warm-up"). */
const KEYSTONE_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "distance",
      value: 250,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 0,
    },
    {
      type: "work",
      kind: "distance",
      value: 250,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** `EnginePhase[]` mirroring `KEYSTONE_PROGRAM` one-for-one — two work
 *  phases, no rest phase interleaved (both intervals' `restSeconds` are 0),
 *  same idiom as `CM_PHASES` above. */
const KEYSTONE_PHASES: EnginePhase[] = [
  {
    type: "work",
    meters: 250,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 0,
  },
  {
    type: "work",
    meters: 250,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 1,
  },
];

interface Capture {
  path: string;
  program: WorkoutProgram;
  phases: EnginePhase[];
}

const SESSION_2: Capture = {
  path: "session-2-wu-4unequal.jsonl",
  program: SESSION_2_PROGRAM,
  phases: CM_PHASES,
};

const SESSION_1: Capture = {
  path: "session-1-keystone-2x250r0.jsonl",
  program: KEYSTONE_PROGRAM,
  phases: KEYSTONE_PHASES,
};

/** Replays one committed capture's rx frames through the real driver and
 *  returns the summary model the app would store. `capture` is the parsed
 *  JSONL; `program` and `phases` are the hand-built literals for that
 *  session, exactly as `connectedMetricsReplay.test.ts` builds its own.
 *
 *  Builds the `MonitorRun` through the SAME three production functions
 *  `useMonitorSession.ts` calls — `createMonitorRun` at Connect,
 *  `recordActual` per `intervalComplete` event (including the driver's own
 *  `finalBoundary` vouch, `monitorRun.ts`'s "THE FINISH GRACE"), and
 *  `completeMonitorRun`/nothing-else on `workoutComplete`/`terminated` —
 *  rather than hand-assembling a `MonitorRun` literal, so this pin
 *  exercises the real immutability/finish-grace rules a rower's phone
 *  actually enforces, not a shortcut that could silently diverge from
 *  them. `logSeed` is built via `buildLogSeed` (`logDraft.ts`), the same
 *  function `useMonitorSession`'s own `program` callback calls; `baselines:
 *  null` is safe here because neither fixture's phases carry a `ref` (no
 *  split-ref work phase in either capture — every work phase's target
 *  comes from the fixed 129 literal, not a baseline lookup), so
 *  `buildLogSeed`'s only branch that reads baselines is never reached. */
async function buildSummaryForCapture(capture: Capture): Promise<SummaryModel> {
  const text = readFileSync(`${SESSIONS_DIR}${capture.path}`, "utf8");
  const parsed = parseRecording(text);

  const replay = createReplayTransport(parsed);
  const [dev] = await replay.transport.scan();
  await replay.transport.connect(dev.id);

  const log = createEventLog();
  const driver = createPm5Driver(replay.transport, log, {
    deviceName: dev.name,
    now: () => replay.clock.now(),
    schedule: (cb, ms) => replay.clock.schedule(cb, ms),
  });

  let run: MonitorRun = createMonitorRun(
    {
      workoutId: null,
      title: "Phase WU replay fixture",
      program: capture.program,
      deviceName: dev.name,
      logSeed: buildLogSeed(capture.phases, null),
    },
    new Date(0),
  );

  driver.events((event) => {
    if (event.kind === "intervalComplete") {
      run = recordActual(run, event.actual, {
        finalBoundary: event.finalBoundary,
      });
    } else if (event.kind === "workoutComplete") {
      run = completeMonitorRun(run, { terminated: false }, new Date(0));
    } else if (event.kind === "terminated") {
      run = completeMonitorRun(run, { terminated: true }, new Date(0));
    }
  });

  const programPending = driver.program(capture.program);
  await replay.run();
  await programPending;

  return buildSummaryModel({ door: "monitor", run });
}

describe("Phase WU — the two replay pins (task-1-brief.md)", () => {
  // The MOVER. Today interval 0 is a warm-up and AVG SPLIT excludes it.
  // Phase WU retypes it `work`; this pin exists so that change is visible
  // and deliberate rather than silent. Post-WU expectations live in a
  // later task, swapped in once the removal actually lands.
  it("session-2: today's heroes, with the warm-up excluded from AVG SPLIT", async () => {
    const summary = await buildSummaryForCapture(SESSION_2);
    expect(summary.heroes.distanceMeters).toBe(1599);
    expect(summary.heroes.timeSeconds).toBeCloseTo(488.4, 1);
    expect(summary.heroes.avgSplitSeconds).toBeCloseTo(128.467, 2); // 2:08.5
    expect(summary.rows.filter((r) => r.measured)).toHaveLength(5); // 1 wu + 4 work
  });

  // The INERT CONTROL. No warm-up anywhere in this capture, so every
  // number here must be byte-identical before and after Phase WU. If this
  // moves, the removal perturbed arithmetic it had no business touching.
  // Its absence from the original exit criteria was the oracle-blindness
  // shape this task exists to close — the only named capture was the one
  // that must change.
  //
  // KEYSTONE_* are MEASURED, not chosen: obtained by running this exact
  // harness once (`pnpm test --project client -- warmupRemoval.replay` —
  // this file lives under `src/`, so `vitest.config.ts`'s "client" project
  // is what actually collects it; see this task's own report for why the
  // brief's stated "--project unit" does not) with a temporary debug print
  // of `summary.heroes`, then re-confirmed by tightening the tolerance to
  // 8 decimal places against the pasted literal until it still passed
  // (`toBeCloseTo(x, 8)`, since removed) — both numbers are correct to
  // floating-point precision, not merely "close".
  //
  // TIME === AVG SPLIT here is a real identity, not a coincidence: r0 means
  // zero rest-distance and zero programmed rest, so DISTANCE's `Σ(work +
  // rest)` (R-B) and AVG SPLIT's own `Σd` both reduce to the SAME 500m
  // work-only total, and TIME's `Σ work seconds + programmed rest` (R-D)
  // reduces to plain `Σt` — making AVG SPLIT's `500 × Σt / Σd` equal `Σt`
  // exactly whenever `Σd` is exactly 500.
  const KEYSTONE_DISTANCE = 500; // measured: 250 + 250, r0, no coast metres
  const KEYSTONE_TIME = 137.9; // measured seconds, Σ elapsed (no programmed rest, r0)
  const KEYSTONE_AVG = 137.9; // measured seconds, 500 × Σt/Σd — equals TIME (see above)

  it("session-1 keystone: nothing changes, before or after WU", async () => {
    const summary = await buildSummaryForCapture(SESSION_1);
    expect(summary.heroes.distanceMeters).toBe(KEYSTONE_DISTANCE);
    expect(summary.heroes.timeSeconds).toBeCloseTo(KEYSTONE_TIME, 1);
    expect(summary.heroes.avgSplitSeconds).toBeCloseTo(KEYSTONE_AVG, 2);
  });
});
