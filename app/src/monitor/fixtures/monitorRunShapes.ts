// The seven MonitorRun inputs the byte-compatibility gate drives through
// the store's REAL writer (Phase MD PR 1, spec §5). Deterministic by
// construction: fixed clocks, a real library program compiled through the
// real assembly (RF3), and no Date.now()/Math.random() anywhere. The
// captured bytes under `monitorRun-bytes/` were produced from THESE inputs
// by `scripts/capture-monitor-run-fixtures.ts` against main at 4aa3d132,
// BEFORE the persistence half moved (RF11: a fixture generated afterwards
// is a mirror one step later). Regenerate ONLY when the stored shape is
// deliberately changed, and say so in that PR.
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../../domain/types.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../../domain/monitor/program.js";
import { buildDraft } from "../../session/draft";
import { buildRun } from "../../session/engine";
import type { LogSeed } from "../../session/logDraft";
import {
  appendSummaryObservations,
  withPartial,
  type MonitorRun,
} from "../monitorRun";

export interface ShapeCase {
  readonly name: string;
  readonly run: MonitorRun;
  /** When true the capture/gate makes the FIRST `localStorage.setItem`
   *  throw, so the writer takes its series-sacrifice retry. This is the
   *  only shape that STAMPS `seriesDropped` rather than copying it from
   *  the input, and therefore the only one that can catch its rename. */
  readonly throwFirstWrite: boolean;
}

const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const t0 = new Date("2026-08-05T12:00:00.000Z");
const STARTED_AT = "2026-08-05T12:00:00.000Z";
const COMPLETED_AT = "2026-08-05T12:20:00.000Z";

const SEED: LogSeed = {
  steps: [{ label: "8:00 warm-up", kind: "work" }],
  paces: {},
};

function fillingLowProgram(): WorkoutProgram {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "fl-bytes-fixture",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const result = compileProgram(buildRun(draft, baselines, t0).phases);
  if ("code" in result) {
    throw new Error(`fixture failed to compile: ${result.code}`);
  }
  return result;
}

const PROGRAM = fillingLowProgram();

function base(): MonitorRun {
  return {
    v: 2,
    workoutId: "fl-bytes-fixture",
    title: "Filling Low",
    program: PROGRAM,
    logSeed: SEED,
    actuals: [],
    deviceName: "PM5 430123456",
    startedAt: STARTED_AT,
    completedAt: null,
    terminated: false,
  };
}

// `r: undefined` on the two work samples is REQUIRED-KEY bookkeeping from
// Phase MD PR 3, not a shape change: `JSON.stringify` drops an
// `undefined`-valued key, so these three samples serialize byte-identically
// to the captured fixtures and leg (a) stays green without a recapture.
const SERIES = {
  samples: [
    { t: 0, d: 0, p: 120, spm: 24, r: undefined },
    { t: 1, d: 4, p: 121.5, spm: 25, hr: 140, r: undefined },
    { t: 2, d: 8, p: 122, spm: 25, r: true as const },
  ],
};

/** `appendSummaryObservations` refuses a run it cannot observe against
 *  (returns null); the fixture must never silently become a base run. */
function summaryDetailRun(
  ...args: Parameters<typeof appendSummaryObservations>
): MonitorRun {
  const run = appendSummaryObservations(...args);
  if (run === null) throw new Error("summary-detail fixture refused");
  return run;
}

export const MONITOR_RUN_SHAPES: readonly ShapeCase[] = [
  {
    name: "ordinary",
    run: { ...base(), series: SERIES },
    throwFirstWrite: false,
  },
  {
    name: "sacrifice-thrown-with-series",
    run: { ...base(), series: SERIES },
    throwFirstWrite: true,
  },
  { name: "thrown-without-series", run: base(), throwFirstWrite: true },
  {
    name: "v1-record",
    run: (() => {
      const { logSeed: _seed, ...v1 } = base();
      return { ...v1, v: 1 as const };
    })(),
    throwFirstWrite: false,
  },
  {
    name: "partial",
    run: withPartial(
      { ...base(), completedAt: COMPLETED_AT, endedBy: "rower" },
      "rower",
      { intervalIndex: 0, meters: 250, seconds: 60.5 },
    ),
    throwFirstWrite: false,
  },
  {
    name: "summary-detail",
    run: summaryDetailRun(
      { ...base(), completedAt: COMPLETED_AT, endedBy: "finished" },
      {
        totals: { workElapsedSeconds: 480, workDistanceMeters: 2000 },
        detail: {
          avgStrokeRate: 26,
          endingHeartRateBpm: 150,
          avgHeartRateBpm: 145,
          minHeartRateBpm: 120,
          maxHeartRateBpm: 160,
          dragFactorAverage: 118,
          workoutType: 3,
          recoveryHeartRateBpm: 130,
          avgPaceSecondsPer500m: 120,
          totalCalories: 140,
          avgWatts: 190,
          avgCalPerHour: 1050,
          totalRestMeters: 12,
        },
        verificationBytes: [1, 2, 3],
      },
    ),
    throwFirstWrite: false,
  },
  {
    name: "mode-justrow",
    run: {
      ...base(),
      mode: "justrow",
      workoutId: null,
      program: { intervals: [] },
      logSeed: { steps: [], paces: {} },
    },
    throwFirstWrite: false,
  },
];
