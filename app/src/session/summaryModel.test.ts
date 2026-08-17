import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import {
  parseAdditionalSplitIntervalData,
  parseSplitIntervalData,
  toIntervalActual,
  type RawPm5Status,
} from "../../domain/monitor/pm5/parse.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { WarmupSetting } from "../api/usePreferences";
import { fromHexString } from "../monitor/transports/recording";
import type { MonitorRun } from "../monitor/monitorRun";
import { buildDraft, type SessionDraft } from "./draft";
import { buildRun } from "./engine";
import {
  buildLogSteps,
  buildManualLogSteps,
  formatLogDate,
  MonitorLogSeedError,
  type LogStep,
} from "./logDraft";
import type { SessionRun } from "./run";
import {
  buildSummaryModel,
  deviationBarWidthPercent,
  type MeasuredRow,
  type SummaryRow,
} from "./summaryModel";

/** Narrows a `SummaryRow` to its measured variant, throwing (a loud test
 *  failure, not a silent `undefined`) when the row is actually prescribed
 *  or missing — every call site below already expects a measured row by
 *  construction of its own fixture. */
function asMeasured(row: SummaryRow | undefined): MeasuredRow {
  if (row === undefined || !row.measured) {
    throw new Error(`expected a measured row, got ${JSON.stringify(row)}`);
  }
  return row;
}

// ---------------------------------------------------------------------
// Real-wire decoding helper (the oracle grounding).
//
// The brief's own step 1 offers a choice: "build the actuals from its
// 0x0037 boundaries the way the driver would, or replay via the existing
// harness if one fits". The full record-replay harness
// (`monitor/transports/replay.ts`) exists to exercise `driver.ts`'s
// ack-gating/barrier machinery end to end — machinery this task's model
// never touches. Decoding the boundary bytes with the SAME parser
// functions the driver calls (`parseSplitIntervalData`,
// `parseAdditionalSplitIntervalData`, `toIntervalActual` — all from
// `domain/monitor/pm5/parse.ts`, unmodified here) reaches the same
// `IntervalActual` the driver would have produced, without needing a
// scripted transport/virtual clock this test has no other use for.
//
// `normalizedIndex` mimics ONE further step `driver.ts` performs after
// `toIntervalActual` (`emitIntervalComplete`'s own `normalizedIndex =
// toActualIndex(rawActual.index, state, programLength)`, `driver.ts:3070`):
// `toIntervalActual`'s own `index` is the RAW wire Split/Interval Number
// (1-based in every committed capture this task read), never what
// `IntervalActual.index`'s own doc comment calls "OUR normalized 0-based
// program index". Reproducing `toActualIndex` itself would mean
// reconstructing the driver's `state`/`programLength` context for no
// reason this test needs — every boundary in every capture below is an
// ordinary in-run one-based count with no divergence, so "wire number
// minus one" is the normalization `toActualIndex` would have produced for
// each of them; passed explicitly rather than asserted as a general rule.
function decodeActual(
  hex37: string,
  hex38: string,
  normalizedIndex: number,
): IntervalActual {
  const a = parseSplitIntervalData(fromHexString(hex37));
  const b = parseAdditionalSplitIntervalData(fromHexString(hex38));
  if ("error" in a)
    throw new Error(`0x0037 parse error: ${JSON.stringify(a.error)}`);
  if ("error" in b)
    throw new Error(`0x0038 parse error: ${JSON.stringify(b.error)}`);
  const raw = { ...a, ...b } as RawPm5Status;
  return { ...toIntervalActual(raw), index: normalizedIndex };
}

// `buildMonitorLogSteps` (which `buildSummaryModel`'s monitor path calls
// internally) throws `MonitorLogSeedError` unless `logSeed.steps.length`
// matches `program.intervals.length` exactly — every monitor-door fixture
// below needs a real (if minimal) seed, not just a program. Auto-deriving
// it from whatever `program` a test passes means each `it()` only states
// the program shape it actually cares about, never a parallel seed that
// could drift out of sync with it.
function monitorRun(overrides: Partial<MonitorRun> = {}): MonitorRun {
  const program = overrides.program ?? { intervals: [] };
  const base: MonitorRun = {
    v: 2,
    workoutId: null,
    title: "Test workout",
    program,
    logSeed: {
      steps: program.intervals.map((iv, i) => ({
        label: iv.type === "warmup" ? "Warm-up" : `Interval ${i}`,
        kind: iv.type === "warmup" ? "warmup" : "work",
      })),
      paces: {},
    },
    actuals: [],
    deviceName: "PM5 432331249",
    startedAt: "2026-08-17T10:00:00.000Z",
    completedAt: "2026-08-17T10:30:00.000Z",
    terminated: false,
  };
  return { ...base, ...overrides };
}

function interval(
  over: Partial<{
    type: "warmup" | "work" | "test";
    kind: "time" | "distance";
    value: number;
    targetSplit: number | null;
    restSeconds: number;
  }> = {},
): WorkoutProgram["intervals"][number] {
  return {
    type: "work",
    kind: "time",
    value: 60,
    targetSplit: null,
    displaySpm: null,
    restSeconds: 0,
    ...over,
  };
}

/** Repo-level captures, resolved relative to THIS file so the test works
 *  regardless of the process's cwd — the SAME technique
 *  `captureReplay.test.ts` already established (`monitor/
 *  captureReplay.test.ts`'s own `SESSIONS_DIR` comment: plain string
 *  surgery on `import.meta.url`, not the global `URL` constructor, since
 *  this project's jsdom environment resolves `new URL(...)` against
 *  `http://localhost:3000/` instead of the given `file://` base).
 *  `src/session/` sits at the same depth under `app/` as `src/monitor/`,
 *  so the identical `../docs/monitor/sessions/` climb applies. */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/session\/summaryModel\.test\.ts$/,
    "../docs/monitor/sessions/",
  );

function readSessionFile(relativePath: string): string {
  return readFileSync(`${SESSIONS_DIR}${relativePath}`, "utf-8");
}

// ---------------------------------------------------------------------
// Review finding 6: the oracle bytes above/below are hand-transcribed
// literals. This ties them to the committed recordings they claim to be
// — reading each file at test time and asserting the transcribed frame
// appears in it verbatim — so a future transcription slip (or a
// recording that gets re-captured under the same filename) fails loudly
// here rather than silently validating against itself.
// ---------------------------------------------------------------------
describe("buildSummaryModel — oracle bytes are tied to the committed recordings, not hand-transcribed (review finding 6)", () => {
  it("keystone (step-2): both boundary pairs appear verbatim in the committed .jsonl", () => {
    const text = readSessionFile(
      "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl",
    );
    expect(text).toContain(
      "00 00 00 00 00 00 83 02 00 fa 00 00 00 00 00 00 01 01",
    );
    expect(text).toContain(
      "00 00 00 1a 59 00 06 05 0f 00 62 03 30 0f a5 00 67 01 00",
    );
    expect(text).toContain(
      "2f 1d 00 c4 09 00 eb 02 00 fa 00 00 00 00 00 00 01 02",
    );
    expect(text).toContain(
      "2f 1d 00 18 59 00 d6 05 0f 00 95 02 12 0d 69 00 67 02 00",
    );
  });

  it("rest-bearing session (walk-2026-08-16/session-2): all 5 boundary pairs appear verbatim", () => {
    const text = readSessionFile("walk-2026-08-16/session-2-wu-4unequal.jsonl");
    for (const hex of [
      "00 00 00 00 00 00 29 01 00 64 00 00 00 00 00 00 01 01",
      "00 00 00 18 71 00 cd 05 05 00 9b 02 27 0d 6b 00 67 01 00",
      "03 00 00 04 00 00 58 02 00 e5 00 00 1e 00 1e 00 00 02",
      "03 00 00 1b 88 84 1e 05 0e 00 43 03 e8 0e 9c 00 68 02 00",
      "00 00 00 09 00 00 b0 04 00 cd 01 00 1e 00 16 00 00 03",
      "00 00 00 1a 95 91 15 05 1c 00 4e 03 01 0f 9f 00 67 03 00",
      "0c 00 00 00 00 00 07 05 00 f4 01 00 1e 00 0c 00 01 04",
      "0c 00 00 18 96 91 07 05 1f 00 61 03 2d 0f a4 00 68 04 00",
      "70 17 00 94 09 00 58 02 00 f5 00 00 00 00 00 00 00 05",
      "70 17 00 1d 98 00 c8 04 10 00 bc 03 f3 0f bf 00 68 05 00",
    ]) {
      expect(text).toContain(hex);
    }
  });

  it("walk-3 (step-3): the 2 boundaries in the .jsonl, and the 3rd — byte-identical in the walk's own diagnostics ring, not re-derived — including the ring's own final-totals machineTotal line the free third oracle cites", () => {
    const jsonl = readSessionFile(
      "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
    );
    expect(jsonl).toContain(
      "00 00 00 00 00 00 58 02 00 a0 00 00 00 00 00 00 00 01",
    );
    expect(jsonl).toContain(
      "00 00 00 1a 6b 00 53 07 08 00 e2 01 6a 0a 35 00 63 01 00",
    );
    expect(jsonl).toContain(
      "06 00 00 00 00 00 58 02 00 d6 00 00 1e 00 00 00 00 02",
    );
    expect(jsonl).toContain(
      "06 00 00 17 86 6d 79 05 0d 00 e1 02 ee 0d 7f 00 65 02 00",
    );

    const ring = readSessionFile("walk-2026-08-17/step-3-ring.json");
    expect(ring).toContain(
      "06 00 00 00 00 00 b0 04 00 ad 01 00 1e 00 05 00 00 03",
    );
    expect(ring).toContain(
      "06 00 00 1c 86 78 76 05 18 00 e4 02 f7 0d 80 00 65 03 00",
    );
    expect(ring).toContain("machineTotal=808m");
  });
});

describe("buildSummaryModel — DISTANCE (R-B), the machine's own number, external oracles", () => {
  // walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl, seq 736/737
  // (interval 1) and 1191/1192 (interval 2) — the "1 keystone" row of that
  // walk's own README (`docs/monitor/sessions/walk-2026-08-17/README.md`):
  // "2×250m r0, no wu" ... "final-totals accumulator 499.8 vs machine
  // 500". DISTANCE === 500 is the a-priori truth for this program: two
  // 250m pieces with NO rest between them.
  //
  // CONTRADICTS THE BRIEF (recurring failure #10, reported): the brief
  // named `step-4-pm5-recording-*.jsonl` as this keystone. That file
  // decodes to ZERO 0x0037/0x0038 boundary events at all (verified: it is
  // walk-2026-08-17's OWN README row "3 (END)" — a 2×250m session ended
  // ~44s into piece one, `machineTotal=0` mid-piece by the PM5's own
  // distance-goal display behavior). `step-2-*.jsonl` is the file whose
  // README row states the 500m keystone verdict and whose two decoded
  // boundaries below sum to exactly 500. See the task report for the
  // full byte-level trail.
  const work1 = decodeActual(
    "00 00 00 00 00 00 83 02 00 fa 00 00 00 00 00 00 01 01",
    "00 00 00 1a 59 00 06 05 0f 00 62 03 30 0f a5 00 67 01 00",
    0,
  );
  const work2 = decodeActual(
    "2f 1d 00 c4 09 00 eb 02 00 fa 00 00 00 00 00 00 01 02",
    "2f 1d 00 18 59 00 d6 05 0f 00 95 02 12 0d 69 00 67 02 00",
    1,
  );

  it("the keystone (2×250m r0): DISTANCE === 500, matching the erg's own a-priori total", () => {
    const run = monitorRun({
      program: {
        intervals: [
          interval({ kind: "distance", value: 250 }),
          interval({ kind: "distance", value: 250 }),
        ],
      },
      actuals: [work1, work2],
    });
    expect(work1.distanceMeters).toBe(250);
    expect(work1.restDistanceMeters).toBe(0);
    expect(work2.distanceMeters).toBe(250);
    expect(work2.restDistanceMeters).toBe(0);

    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBe(500);
  });

  // walk-2026-08-16/session-2-wu-4unequal.jsonl — task 2's own oracle,
  // independently re-decoded here (seq 246/779/1666/2607/2981): work
  // 100+229+461+500+245 = 1535, rest 0+30+22+12+0 = 64, machine TWD 1599
  // exactly (task 2's report, and this file's README/RUNSHEET).
  const wu = decodeActual(
    "00 00 00 00 00 00 29 01 00 64 00 00 00 00 00 00 01 01",
    "00 00 00 18 71 00 cd 05 05 00 9b 02 27 0d 6b 00 67 01 00",
    0,
  );
  const w2 = decodeActual(
    "03 00 00 04 00 00 58 02 00 e5 00 00 1e 00 1e 00 00 02",
    "03 00 00 1b 88 84 1e 05 0e 00 43 03 e8 0e 9c 00 68 02 00",
    1,
  );
  const w3 = decodeActual(
    "00 00 00 09 00 00 b0 04 00 cd 01 00 1e 00 16 00 00 03",
    "00 00 00 1a 95 91 15 05 1c 00 4e 03 01 0f 9f 00 67 03 00",
    2,
  );
  const w4 = decodeActual(
    "0c 00 00 00 00 00 07 05 00 f4 01 00 1e 00 0c 00 01 04",
    "0c 00 00 18 96 91 07 05 1f 00 61 03 2d 0f a4 00 68 04 00",
    3,
  );
  const w5 = decodeActual(
    "70 17 00 94 09 00 58 02 00 f5 00 00 00 00 00 00 00 05",
    "70 17 00 1d 98 00 c8 04 10 00 bc 03 f3 0f bf 00 68 05 00",
    4,
  );

  it("the rest-bearing session (wu + 4 unequal): DISTANCE === 1599, the machine TWD — a work-only sum reads 1535 and is WRONG", () => {
    expect([wu, w2, w3, w4, w5].map((a) => a.distanceMeters)).toStrictEqual([
      100, 229, 461, 500, 245,
    ]);
    expect([wu, w2, w3, w4, w5].map((a) => a.restDistanceMeters)).toStrictEqual(
      [0, 30, 22, 12, 0],
    );

    const run = monitorRun({
      program: {
        intervals: [
          interval({ type: "warmup", kind: "distance", value: 100 }),
          interval({ kind: "distance", value: 229, restSeconds: 30 }),
          interval({ kind: "distance", value: 461, restSeconds: 30 }),
          interval({ kind: "distance", value: 500, restSeconds: 30 }),
          interval({ kind: "distance", value: 245 }),
        ],
      },
      actuals: [wu, w2, w3, w4, w5],
    });

    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBe(1599);

    // A work-only regression's own number, computed independently here
    // (not by mutating the source — that happens for real in the
    // self-mutation pass documented in the task report) so the "1535 is
    // wrong" claim is pinned by an assertion, not just a comment.
    const workOnly = [wu, w2, w3, w4, w5].reduce(
      (s, a) => s + a.distanceMeters,
      0,
    );
    expect(workOnly).toBe(1535);
    expect(model.heroes.distanceMeters).not.toBe(workOnly);
  });

  it("§7 vetted ground, on real wire data: the machine's OWN avgSplit equals 500×t/d exactly for both keystone boundaries", () => {
    expect(work1.avgSplit).toBe(
      500 * (work1.elapsedSeconds / work1.distanceMeters),
    );
    expect(work2.avgSplit).toBe(
      500 * (work2.elapsedSeconds / work2.distanceMeters),
    );
  });

  it("old-shape record: restDistanceMeters undefined at runtime (a MonitorRun.actuals entry written before task 2's field existed) contributes 0, never crashes or NaNs (task 2's `?? 0` contract — this is the first consumer)", () => {
    const oldActual = { ...work1 } as IntervalActual;
    // @ts-expect-error — simulating a pre-field persisted record: the type
    // says `number`, the stored JSON genuinely lacks the key.
    delete oldActual.restDistanceMeters;
    const run = monitorRun({
      program: { intervals: [interval({ kind: "distance", value: 250 })] },
      actuals: [oldActual],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBe(250); // 250 + (undefined ?? 0)
    expect(Number.isNaN(model.heroes.distanceMeters)).toBe(false);
  });

  it("review finding 2: a null-index actual (boundary-out-of-run/divergence — 'A CONSUMER MUST NOT TREAT null AS INTERVAL 0') is EXCLUDED from AVG SPLIT (no program identity to judge against) but INCLUDED in DISTANCE/TIME (machine semantics — the meters/seconds genuinely happened)", () => {
    // work2 arrives with no program identity (a divergent/out-of-run
    // boundary) — its own real distance/time still count toward the
    // machine totals, but it has nothing to be numbered or judged as.
    const nullIndexed: IntervalActual = { ...work2, index: null };
    const run = monitorRun({
      program: {
        intervals: [
          interval({ kind: "distance", value: 250 }),
          interval({ kind: "distance", value: 250 }),
        ],
      },
      actuals: [work1, nullIndexed],
    });
    const model = buildSummaryModel({ door: "monitor", run });

    // DISTANCE/TIME: both actuals counted (the OLD bug's mirror image
    // would have been dropping this leg — it never was, but the review
    // asked for the leg to be tested explicitly, not just AVG SPLIT's).
    expect(model.heroes.distanceMeters).toBe(500); // 250 + 250, same as the keystone
    expect(model.heroes.time).toBe(
      fmtDuration((work1.elapsedSeconds + work2.elapsedSeconds) / 60),
    );

    // AVG SPLIT: work1 ALONE — 500×64.3/250 = 128.6s = "2:08.6", not the
    // two-row 139.0s = "2:19.0" the old (buggy) condition would have
    // produced by letting a null-index actual fall through.
    expect(model.heroes.avgSplit).toBe("2:08.6");
    expect(model.heroes.avgSplit).not.toBe("2:19.0");

    // The row list: `buildMonitorLogSteps` (`logDraft.ts`) already filters
    // null-index actuals out of its own matching map (pre-existing, not
    // this task's code), so the second program interval renders as an
    // ordinary unmatched/prescribed row — pinning that the row list and
    // the hero AGREE on which readings count, not just that each is
    // separately "correct".
    expect(model.rows).toHaveLength(2);
    expect(model.rows[0]!.measured).toBe(true);
    expect(model.rows[1]!.measured).toBe(false);
  });

  it("the free third oracle (review finding 6): step-3's own 3 completed boundaries sum to 808m, matching the machine's OWN TWD reading captured at teardown (step-3-ring.json's final-totals line: 'machineTotal=808m')", () => {
    // work 160+214+429 (warmup + work1 + work2's own splitIntervalDistanceMeters)
    // + rest 0+0+5 (their own intervalRestDistanceMeters) = 808. Reuses the
    // exact decoded boundaries from the TIME/AVG SPLIT describe block below
    // (re-decoded here rather than imported across describe blocks, same
    // real hex, cited identically).
    const wu = decodeActual(
      "00 00 00 00 00 00 58 02 00 a0 00 00 00 00 00 00 00 01",
      "00 00 00 1a 6b 00 53 07 08 00 e2 01 6a 0a 35 00 63 01 00",
      0,
    );
    const w1 = decodeActual(
      "06 00 00 00 00 00 58 02 00 d6 00 00 1e 00 00 00 00 02",
      "06 00 00 17 86 6d 79 05 0d 00 e1 02 ee 0d 7f 00 65 02 00",
      1,
    );
    const w2 = decodeActual(
      "06 00 00 00 00 00 b0 04 00 ad 01 00 1e 00 05 00 00 03",
      "06 00 00 1c 86 78 76 05 18 00 e4 02 f7 0d 80 00 65 03 00",
      2,
    );
    expect(wu.distanceMeters + w1.distanceMeters + w2.distanceMeters).toBe(803);
    expect(
      (wu.restDistanceMeters ?? 0) +
        (w1.restDistanceMeters ?? 0) +
        (w2.restDistanceMeters ?? 0),
    ).toBe(5);

    const run = monitorRun({
      program: {
        intervals: [
          interval({ type: "warmup", kind: "time", value: 60 }),
          interval({ kind: "time", value: 60, restSeconds: 30 }),
          interval({ kind: "time", value: 120, restSeconds: 30 }),
        ],
      },
      actuals: [wu, w1, w2],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBe(808);
  });
});

describe("buildSummaryModel — TIME (R-D) and AVG SPLIT (R-C), the walk-3 shape", () => {
  // walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl —
  // its own committed `header.program` (verbatim): warmup 60s r0, work 60s
  // r30 (targetSplit 129), work 120s r30 (targetSplit 129), work 500m r30,
  // work 60s r0. Only the first three intervals completed before the
  // session was reloaded mid-4th-piece (the file's own README, "F6" row).
  // README's own F-1 finding, independently re-derived below from the raw
  // bytes rather than trusted from prose: "work 60+60+120 ... completed
  // rests 0+30+30 = 300 -> 5 MIN".
  //
  // Boundary 1 (warmup) and boundary 2 (work 1) are the file's own two
  // downloaded 0x0037/0x0038 rx events (seq 414/415, 959/960 — the
  // recording was downloaded before boundary 3 arrived, per the walk's own
  // README table). Boundary 3's raw bytes are NOT in the .jsonl for that
  // reason, but survive byte-identical in the walk's own diagnostics ring
  // (`step-3-ring.json`, `notify` entries seq 46/48 for 0x0037/0x0038) —
  // cross-checked against boundary 2's OWN ring `notify` entry (seq 37/39),
  // which is byte-for-byte identical to the recording file's rx event,
  // establishing the ring's `notify` log as the same wire bytes under a
  // different diagnostic channel, not a re-derivation.
  const program: WorkoutProgram = {
    intervals: [
      interval({ type: "warmup", kind: "time", value: 60, restSeconds: 0 }),
      interval({ kind: "time", value: 60, targetSplit: 129, restSeconds: 30 }),
      interval({ kind: "time", value: 120, targetSplit: 129, restSeconds: 30 }),
      interval({
        kind: "distance",
        value: 500,
        targetSplit: 129,
        restSeconds: 30,
      }),
      interval({ kind: "time", value: 60, targetSplit: 129, restSeconds: 0 }),
    ],
  };
  const wu = decodeActual(
    "00 00 00 00 00 00 58 02 00 a0 00 00 00 00 00 00 00 01",
    "00 00 00 1a 6b 00 53 07 08 00 e2 01 6a 0a 35 00 63 01 00",
    0,
  );
  const w1 = decodeActual(
    "06 00 00 00 00 00 58 02 00 d6 00 00 1e 00 00 00 00 02",
    "06 00 00 17 86 6d 79 05 0d 00 e1 02 ee 0d 7f 00 65 02 00",
    1,
  );
  // step-3-ring.json seq 46/48 ("notify" entries, cited above).
  const w2 = decodeActual(
    "06 00 00 00 00 00 b0 04 00 ad 01 00 1e 00 05 00 00 03",
    "06 00 00 1c 86 78 76 05 18 00 e4 02 f7 0d 80 00 65 03 00",
    2,
  );

  it("TIME === 5:00: Σ work seconds (60+60+120) + programmed rest for completed intervals (0+30+30), warm-up included (R-D)", () => {
    expect([wu, w1, w2].map((a) => a.elapsedSeconds)).toStrictEqual([
      60, 60, 120,
    ]);
    const run = monitorRun({ program, actuals: [wu, w1, w2] });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.time).toBe("5:00");
    expect(model.heroes.time).toBe(fmtDuration(300 / 60));
  });

  it("AVG SPLIT excludes the warm-up (R-C) — no machine oracle exists for the weighted average (spec §5: 0x0032's Average Pace matches no candidate formula); the witness is §7's per-interval identity plus hand arithmetic over the real decoded boundaries", () => {
    // work1 t=60.0 d=214, work2 t=120.0 d=429 (both read straight off the
    // decoded actuals above, not retyped).
    expect(w1.elapsedSeconds).toBe(60);
    expect(w1.distanceMeters).toBe(214);
    expect(w2.elapsedSeconds).toBe(120);
    expect(w2.distanceMeters).toBe(429);

    const run = monitorRun({ program, actuals: [wu, w1, w2] });
    const model = buildSummaryModel({ door: "monitor", run });

    // 500 × (60+120) / (214+429) = 500 × 180 / 643 = 139.9689...s.
    const exclWarmup =
      (500 * (w1.elapsedSeconds + w2.elapsedSeconds)) /
      (w1.distanceMeters + w2.distanceMeters);
    expect(model.heroes.avgSplit).toBe(fmtSplit(exclWarmup));
    expect(model.heroes.avgSplit).toBe("2:20.0");

    // Proving inclusion is WRONG, not just different (brief's own
    // requirement: "a test PROVING ...-style inclusion fails"): compute
    // the including-warm-up figure independently (not via
    // buildSummaryModel — there is no door that produces it) and confirm
    // it disagrees with the real, correct hero.
    const inclWarmup =
      (500 * (wu.elapsedSeconds + w1.elapsedSeconds + w2.elapsedSeconds)) /
      (wu.distanceMeters + w1.distanceMeters + w2.distanceMeters);
    expect(fmtSplit(inclWarmup)).toBe("2:29.4");
    expect(model.heroes.avgSplit).not.toBe(fmtSplit(inclWarmup));
  });

  it("the warm-up row itself: rendered, labeled WARM-UP, measured values shown, and UNJUDGED (no deviation bar, first in the row list)", () => {
    const run = monitorRun({ program, actuals: [wu, w1, w2] });
    const model = buildSummaryModel({ door: "monitor", run });
    const warmupRow = asMeasured(model.rows[0]);
    expect(warmupRow.isWarmup).toBe(true);
    expect(warmupRow.label).toBe("WARM-UP");
    expect(warmupRow.index).toBeUndefined();
    expect(warmupRow.timeLabel).toBe("1:00");
    expect(warmupRow.judged).toBeUndefined();

    // `program` names 5 intervals (verbatim from the recording's own
    // header — the module header explains why it isn't trimmed); only the
    // first two non-warmup ones (index 1, 2) were ever completed, so the
    // row list is warm-up + 4 work rows: two measured/judged, two
    // prescribed (the piece the F6 reload interrupted, and the one after
    // it, neither ever rowed).
    expect(model.rows).toHaveLength(5);
    const row1 = asMeasured(model.rows[1]);
    const row2 = asMeasured(model.rows[2]);
    expect(row1.index).toBe(1);
    expect(row1.judged).toBeDefined();
    expect(row2.index).toBe(2);
    expect(row2.judged).toBeDefined();
    expect(model.rows[3]!.measured).toBe(false);
    expect(model.rows[3]!.index).toBe(3);
    expect(model.rows[4]!.measured).toBe(false);
    expect(model.rows[4]!.index).toBe(4);
  });
});

describe("buildSummaryModel — deviation bar clamp (§1)", () => {
  it("floors at 1.2% for a zero (or tiny) deviation", () => {
    expect(deviationBarWidthPercent(0)).toBe(1.2);
    expect(deviationBarWidthPercent(0.01)).toBe(1.2); // 0.01/1.6*50=0.3125, clamped up
  });

  it("caps at 50% at and beyond the 1.6s saturation point (uncapped in the mock, capped here per §1's own addition)", () => {
    expect(deviationBarWidthPercent(1.6)).toBe(50);
    expect(deviationBarWidthPercent(5)).toBe(50);
    expect(deviationBarWidthPercent(-5)).toBe(50); // sign-independent
  });

  it("is exact in the middle of the range", () => {
    expect(deviationBarWidthPercent(0.8)).toBe(25); // 0.8/1.6*50 = 25 exactly
    expect(deviationBarWidthPercent(-0.8)).toBe(25);
  });
});

describe("buildSummaryModel — deviation signs and clamp, in a real monitor row", () => {
  // The keystone pair from the DISTANCE describe block above, re-derived
  // here for its OWN clean numbers: avg = 500*(64.3+74.7)/500 = 139.0s
  // exactly; row1 pace 128.6s (10.4s faster), row2 pace 149.4s (10.4s
  // slower) — a symmetric pair, both saturating the 50% cap.
  const work1 = decodeActual(
    "00 00 00 00 00 00 83 02 00 fa 00 00 00 00 00 00 01 01",
    "00 00 00 1a 59 00 06 05 0f 00 62 03 30 0f a5 00 67 01 00",
    0,
  );
  const work2 = decodeActual(
    "2f 1d 00 c4 09 00 eb 02 00 fa 00 00 00 00 00 00 01 02",
    "2f 1d 00 18 59 00 d6 05 0f 00 95 02 12 0d 69 00 67 02 00",
    1,
  );

  it("row 1 (faster) gets a negative deviation and the FASTER direction; row 2 (slower) gets a positive deviation and SLOWER — both saturate the 50% cap", () => {
    const run = monitorRun({
      program: {
        intervals: [
          interval({ kind: "distance", value: 250 }),
          interval({ kind: "distance", value: 250 }),
        ],
      },
      actuals: [work1, work2],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.avgSplit).toBe("2:19.0"); // 500*139/500

    const row1 = asMeasured(model.rows[0]);
    const row2 = asMeasured(model.rows[1]);
    expect(row1.paceLabel).toBe("2:08.6");
    expect(row2.paceLabel).toBe("2:29.4");
    expect(row1.judged?.direction).toBe("faster");
    expect(row1.judged?.deviationLabel).toBe("−10.4");
    expect(row1.judged?.barWidthPercent).toBe(50);
    expect(row2.judged?.direction).toBe("slower");
    expect(row2.judged?.deviationLabel).toBe("+10.4");
    expect(row2.judged?.barWidthPercent).toBe(50);
  });

  it("a single measured work row is UNJUDGED (review finding 5, RULED: a row's deviation against its own lone average is always exactly zero — judging it would paint the commonest session shape, one measured interval, with an invented full-width red/blue bar for a comparison that was never really made against anything but itself)", () => {
    const run = monitorRun({
      program: { intervals: [interval({ kind: "distance", value: 250 })] },
      actuals: [work1],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    const row = asMeasured(model.rows[0]);
    // The hero itself still shows — R-C's formula is well-defined over a
    // single row (it IS that row's own pace) — only per-row JUDGING is
    // suppressed.
    expect(model.heroes.avgSplit).toBe(row.paceLabel);
    expect(row.judged).toBeUndefined();
  });
});

describe("buildSummaryModel — edge cases: absence, per-cell rules, captions", () => {
  it("Σd = 0: avgSplit and distance are absent (never NaN/0), and TIME still shows (time-only fallback via ordinary per-cell absence)", () => {
    const zero: IntervalActual = {
      index: 0,
      elapsedSeconds: 45,
      distanceMeters: 0,
      avgSplit: null,
      avgSpm: null,
      avgHeartRateBpm: null,
      restDistanceMeters: 0,
    };
    const run = monitorRun({
      program: { intervals: [interval({ kind: "time", value: 45 })] },
      actuals: [zero],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.avgSplit).toBeUndefined();
    expect(model.heroes.distanceMeters).toBeUndefined();
    expect(model.heroes.time).toBe("0:45");
  });

  it("a monitor run with zero actuals: every hero absent, caption fires, and the model never throws", () => {
    const run = monitorRun({
      program: { intervals: [interval({ kind: "distance", value: 250 })] },
      actuals: [],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.avgSplit).toBeUndefined();
    expect(model.heroes.time).toBeUndefined();
    expect(model.heroes.distanceMeters).toBeUndefined();
    expect(model.caption).toBe("TARGETS ONLY · NOTHING MEASURED");
  });

  it("a pm5 row with elapsed/distance but an out-of-band avgSplit: time still shows, pace/deviation are absent (per-cell absence, not a fabricated pace)", () => {
    const outOfBand: IntervalActual = {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 250,
      avgSplit: 9999, // > MONITOR_SPLIT_MAX (6000) — an unusable reading
      avgSpm: null,
      avgHeartRateBpm: null,
      restDistanceMeters: 0,
    };
    const run = monitorRun({
      program: { intervals: [interval({ kind: "distance", value: 250 })] },
      actuals: [outOfBand],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    const row = asMeasured(model.rows[0]);
    expect(row.timeLabel).toBe("1:00");
    expect(row.paceLabel).toBeUndefined();
    expect(row.judged).toBeUndefined();
  });

  it("a warm-up interval exists on the program but its own boundary never arrived: the row still renders, labeled, with every measured field absent", () => {
    const run = monitorRun({
      program: {
        intervals: [
          interval({ type: "warmup", kind: "time", value: 60 }),
          interval({ kind: "distance", value: 250 }),
        ],
      },
      // Only the work interval (index 1) reported a boundary — the
      // warm-up's own was lost (a real, named case: the run contract's
      // `boundary-out-of-run`/divergence paths, `domain/monitor/types.ts`).
      actuals: [
        {
          ...decodeActual(
            "00 00 00 00 00 00 83 02 00 fa 00 00 00 00 00 00 01 01",
            "00 00 00 1a 59 00 06 05 0f 00 62 03 30 0f a5 00 67 01 00",
            1,
          ),
        },
      ],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    const warmupRow = asMeasured(model.rows[0]);
    expect(warmupRow.isWarmup).toBe(true);
    expect(warmupRow.label).toBe("WARM-UP");
    expect(warmupRow.timeLabel).toBeUndefined();
    expect(warmupRow.paceLabel).toBeUndefined();
    expect(warmupRow.judged).toBeUndefined();
  });

  it("interrupted date rule: meta uses startedAt, never completedAt, when endedBy is 'interrupted' (F6)", () => {
    const run = monitorRun({
      program: { intervals: [] },
      actuals: [],
      startedAt: "2026-08-10T09:15:00.000Z",
      completedAt: "2026-08-13T18:00:00.000Z", // days later — the Log-it moment
      endedBy: "interrupted",
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.meta.dateLabel).toBe("AUG 10");
    expect(model.meta.dateLabel).not.toBe("AUG 13");
  });

  it("review finding 4: a legacy (v1, no logSeed) MonitorRun throws MonitorLogSeedError — the documented, uncaught contract stated on buildSummaryModel's own doc comment and this module's header", () => {
    const legacy: MonitorRun = {
      v: 1,
      workoutId: null,
      title: "Legacy run",
      program: { intervals: [interval({ kind: "distance", value: 250 })] },
      // No `logSeed` at all — exactly what a v1 record (predating the
      // field) loads back as (`MonitorRun.logSeed`'s own doc comment).
      actuals: [],
      deviceName: "PM5 432331249",
      startedAt: "2026-08-17T10:00:00.000Z",
      completedAt: "2026-08-17T10:30:00.000Z",
      terminated: false,
    };
    expect(() => buildSummaryModel({ door: "monitor", run: legacy })).toThrow(
      MonitorLogSeedError,
    );
  });

  it("meta.sourceLabel per door: monitor carries the device name, timer is 'TIMER', manual is 'LOGGED BY HAND'", () => {
    const monitorModel = buildSummaryModel({
      door: "monitor",
      run: monitorRun({ deviceName: "PM5 432331249 Row" }),
    });
    expect(monitorModel.meta.sourceLabel).toBe("PM5 432331249 Row");

    const timerModel = buildSummaryModel({
      door: "timer",
      run: sessionRunFixture("Filling Low"),
      steps: [],
    });
    expect(timerModel.meta.sourceLabel).toBe("TIMER");

    const manualModel = buildSummaryModel({
      door: "manual",
      steps: [],
      dateIso: "2026-08-17T12:00:00.000Z",
    });
    expect(manualModel.meta.sourceLabel).toBe("LOGGED BY HAND");
    expect(manualModel.meta.timeLabel).toBeUndefined(); // date-only (§2B)
  });

  it("review: meta.timeLabel at local midnight reads '00:05', never '24:05' — hourCycle 'h23' pinned explicitly, not left to hour12: false's ICU ambiguity (h23 vs h24)", () => {
    // Constructed in LOCAL time directly (not a fixed UTC ISO literal) so
    // this passes under whatever timezone the test runner itself is in —
    // `toLocaleTimeString` with no explicit timeZone override always
    // renders in that same local zone, so round-tripping through it is
    // safe regardless of which one that is.
    const localMidnight = new Date(2026, 7, 17, 0, 5); // Aug 17 2026, 00:05 local
    const run = monitorRun({
      program: { intervals: [] },
      completedAt: localMidnight.toISOString(),
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.meta.timeLabel).toBe("00:05");
    expect(model.meta.timeLabel).not.toMatch(/^24/);
  });
});

// ---------------------------------------------------------------------
// Timer + manual doors — realistic library fixtures (CLAUDE.md recurring
// failure #3: at least one test per client task starts from a real
// library workout).
// ---------------------------------------------------------------------

const BASELINES: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const NOW = new Date("2026-08-17T12:00:00.000Z");

function library(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return w;
}

function sessionRunFixture(title: string, warmup?: WarmupSetting): SessionRun {
  const w = library(title);
  const draft = buildDraft({
    id: `id-${title}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const built = buildRun(draft, BASELINES, NOW, warmup ?? null);
  // A real session takes real wall-clock time — `timerTimeSeconds` treats a
  // zero-length span as absent (the same "no 0:00" per-cell rule every
  // other hero follows), so `completedAt` must be strictly after
  // `startedAt` (`built.startedAt` is `NOW.toISOString()`) for TIME to
  // render at all.
  const completedAt = new Date(NOW.getTime() + 20 * 60_000);
  return {
    ...built,
    index: built.phases.length,
    completedAt: completedAt.toISOString(),
  };
}

function draftFor(title: string): SessionDraft {
  const w = library(title);
  return buildDraft({
    id: `id-${title}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
}

describe("buildSummaryModel — timer door, a real mixed measured/prescribed list (Filling Low: wu + 3×2000m @ 6k+4)", () => {
  it("one measured (stopwatch) distance occurrence among three, plus the phone-timer's own warm-up row, produces a genuinely mixed rows list with a computable AVG SPLIT and no DISTANCE hero", () => {
    const draft = draftFor("Filling Low");
    // A DISTANCE warm-up setting (`session/engine.ts`'s `warmupPhases`) so
    // this fixture also exercises `timerWarmupRow`'s "a distance warm-up
    // CAN be genuinely measured" branch (module header) — the ONLY
    // producer of a `type: "warmup"` `EnginePhase` since "wu" left the
    // authored `Step` union.
    const run = sessionRunFixture("Filling Low", {
      kind: "distance",
      meters: 500,
    });
    const warmupIndex = run.phases.findIndex((p) => p.type === "warmup");
    expect(warmupIndex).toBe(0); // warmupPhases prepends it — "ORDER IS PART OF THE CONTRACT"
    const warmupMeters = run.phases[warmupIndex]!.meters!;

    // Find the first WORK distance phase (a repeated-block occurrence) and
    // record a real stopwatch actual for it — the exact identity
    // `session/engine.ts`'s `nextDistance` uses (`splitSeconds = (elapsed /
    // meters) * 500`), applied by hand so the fixture is deterministic.
    const distanceIndex = run.phases.findIndex(
      (p) => p.type === "work" && p.meters !== undefined,
    );
    expect(distanceIndex).toBeGreaterThanOrEqual(0);
    const meters = run.phases[distanceIndex]!.meters!;
    const elapsed = meters * 0.5; // an arbitrary, real-shaped pace
    const warmupElapsed = warmupMeters * 0.6;
    const measuredRun: SessionRun = {
      ...run,
      actuals: {
        [warmupIndex]: {
          elapsedSeconds: warmupElapsed,
          splitSeconds: (warmupElapsed / warmupMeters) * 500,
          actualSource: "stopwatch",
        },
        [distanceIndex]: {
          elapsedSeconds: elapsed,
          splitSeconds: (elapsed / meters) * 500,
          actualSource: "stopwatch",
        },
      },
    };
    const steps: LogStep[] = buildLogSteps(measuredRun, draft);
    const measuredCount = steps.filter(
      (s) => s.actualSource === "stopwatch",
    ).length;
    expect(measuredCount).toBe(1); // exactly one of the three WORK occurrences — buildLogSteps never emits a warm-up LogStep at all

    const model = buildSummaryModel({ door: "timer", run: measuredRun, steps });
    expect(model.heroes.distanceMeters).toBeUndefined(); // timer door: no machine total (module scope decision)
    // The warm-up's own measured reading is excluded from the average
    // (this module's generalization of R-C) even though it WAS measured —
    // the working average is still just the one work row's own pace.
    expect(model.heroes.avgSplit).toBe(fmtSplit((elapsed / meters) * 500));
    expect(model.caption).toBeUndefined(); // at least one row was measured

    const measuredRows = model.rows.filter((r) => r.measured);
    const prescribedRows = model.rows.filter((r) => !r.measured);
    expect(measuredRows.length).toBeGreaterThan(0);
    expect(prescribedRows.length).toBeGreaterThan(0);

    // The warm-up row itself: measured (a real reading), first, unjudged.
    const warmupRow = asMeasured(model.rows[0]);
    expect(warmupRow.isWarmup).toBe(true);
    expect(warmupRow.timeLabel).toBe(fmtDuration(warmupElapsed / 60));
    expect(warmupRow.judged).toBeUndefined();
  });

  it("no actuals recorded at all: every row is prescribed, the caption fires, TIME still reads wall-clock", () => {
    const run = sessionRunFixture("Filling Low");
    const draft = draftFor("Filling Low");
    const steps = buildLogSteps(run, draft);
    const model = buildSummaryModel({ door: "timer", run, steps });
    expect(model.caption).toBe("TARGETS ONLY · NOTHING MEASURED");
    expect(model.rows.every((r) => !r.measured || r.isWarmup)).toBe(true);
    expect(model.heroes.time).toBeDefined();
    expect(model.heroes.avgSplit).toBeUndefined();
  });

  it("a TIME-kind warm-up setting: the warm-up row still renders, but can NEVER be measured (nextDistance only ever writes an actual for a phase with `meters` set) — every measured field absent", () => {
    const run = sessionRunFixture("Filling Low", { kind: "time", minutes: 5 });
    const draft = draftFor("Filling Low");
    const steps = buildLogSteps(run, draft);
    const model = buildSummaryModel({ door: "timer", run, steps });
    const warmupRow = asMeasured(model.rows[0]);
    expect(warmupRow.isWarmup).toBe(true);
    expect(warmupRow.timeLabel).toBeUndefined();
    expect(warmupRow.paceLabel).toBeUndefined();
  });

  it("a prescribed TIME-kind row (no `meters`) shows its duration as m:ss, not a meters suffix — hand-built steps, the caller-supplied shape this door's own interface declares", () => {
    const run: SessionRun = {
      ...sessionRunFixture("Filling Low"),
      completedAt: new Date(NOW.getTime() + 60_000).toISOString(),
    };
    const steps: LogStep[] = [
      { label: "12:00 @ 6k +12", targetSplit: 132, seconds: 720 },
    ];
    const model = buildSummaryModel({ door: "timer", run, steps });
    const row = model.rows[0]!;
    if (row.measured) throw new Error("expected a prescribed row");
    expect(row.durationLabel).toBe(fmtDuration(720 / 60));
  });

  it("review finding 1's own worked example: a mis-tapped 0.2s phase never renders '0:00'/'0:00.1', is excluded from the row's measured status, and does NOT drag AVG SPLIT from 2:00.0 toward 1:00.0", () => {
    const run: SessionRun = {
      ...sessionRunFixture("Filling Low"),
      completedAt: new Date(NOW.getTime() + 60_000).toISOString(),
    };
    // A genuine reading: 2000m at a 2:00.0/500m pace -> 480s elapsed.
    const legitimate: LogStep = {
      label: "2000 m @ 6k +4",
      actualSplit: 120.0,
      actualSource: "stopwatch",
      meters: 2000,
    };
    // The mis-tap: "Next" pressed 0.2s after starting a real 2000m phase —
    // `nextDistance`'s own formula (`splitSeconds = elapsed/meters*500`)
    // produces an absurd near-zero pace from a real button-press artifact,
    // not a discarded/absent reading. Included naively, this drags the
    // two-row average from 2:00.0 to roughly 1:00.0 (the review's own
    // figure) — 500*(480+0.2)/(2000+2000) = 60.025s ≈ "1:00.0".
    const misTap: LogStep = {
      label: "2000 m @ 6k +4",
      actualSplit: (500 * 0.2) / 2000,
      actualSource: "stopwatch",
      meters: 2000,
    };
    const steps: LogStep[] = [legitimate, misTap];
    const model = buildSummaryModel({ door: "timer", run, steps });

    // Excluded from AVG SPLIT entirely: the hero reads the LEGITIMATE
    // row's own pace, not the naive two-row average.
    expect(model.heroes.avgSplit).toBe("2:00.0");
    expect(model.heroes.avgSplit).not.toBe("1:00.0");

    const [row1, row2] = model.rows;
    expect(row1!.measured).toBe(true);
    expect(row2!.measured).toBe(false); // renders in its PRESCRIBED shape
    if (row2!.measured) throw new Error("unreachable");
    expect(row2!.durationLabel).toBe("2000 m");
    expect(row2!.targetPaceLabel).toBeUndefined();
    // No cell on the mis-tapped row ever reads "0:00" or "0:00.1" — it has
    // no timeLabel/paceLabel fields at all (the PrescribedRow shape simply
    // doesn't carry them).
    expect(JSON.stringify(row2)).not.toMatch(/0:00/);

    // With only one row surviving the floor, finding 5's ruling also
    // applies: that lone row is unjudged.
    expect(asMeasured(row1!).judged).toBeUndefined();
  });

  it("a bare-label test-step row (IMP-1: no meters, no seconds) has no durationLabel; a Σd=0 measured row (degenerate — 0 meters means 0 reconstructed elapsed seconds too, below the floor) renders prescribed rather than staying measured with nothing to judge against", () => {
    const run: SessionRun = {
      ...sessionRunFixture("Filling Low"),
      completedAt: new Date(NOW.getTime() + 60_000).toISOString(),
    };
    const steps: LogStep[] = [
      { label: "2k test" }, // buildLogSteps' own IMP-1 shape for a "test" phase
      {
        label: "2000 m @ 6k +4",
        actualSplit: 100,
        actualSource: "stopwatch",
        meters: 0,
      }, // Σd=0 -> reconstructed elapsed = 100*0/500 = 0s, below the floor
    ];
    const model = buildSummaryModel({ door: "timer", run, steps });
    const testRow = model.rows[0]!;
    if (testRow.measured) throw new Error("expected a prescribed row");
    expect(testRow.durationLabel).toBeUndefined();

    // The Σd=0 row itself: excluded by the SAME floor as any other
    // below-threshold reading, not a special case — renders prescribed.
    expect(model.rows[1]!.measured).toBe(false);
    expect(model.heroes.avgSplit).toBeUndefined(); // no row survived to average
  });

  it("a still-live run (completedAt null, defensive — shouldn't reach a finished summary): TIME is absent and meta falls back to startedAt", () => {
    const run: SessionRun = {
      ...sessionRunFixture("Filling Low"),
      completedAt: null,
    };
    const draft = draftFor("Filling Low");
    const steps = buildLogSteps(run, draft);
    const model = buildSummaryModel({ door: "timer", run, steps });
    expect(model.heroes.time).toBeUndefined();
    expect(model.meta.dateLabel).toBe(formatLogDate(run.startedAt));
  });

  it("a zero-length span (completedAt === startedAt exactly, degenerate): TIME is absent, never '0:00'", () => {
    const run = sessionRunFixture("Filling Low");
    const zeroSpan: SessionRun = { ...run, completedAt: run.startedAt };
    const model = buildSummaryModel({
      door: "timer",
      run: zeroSpan,
      steps: [],
    });
    expect(model.heroes.time).toBeUndefined();
  });

  it("a warm-up row whose actual reads exactly 0 elapsed seconds (degenerate): timeLabel is absent", () => {
    const run = sessionRunFixture("Filling Low", {
      kind: "distance",
      meters: 500,
    });
    const warmupIndex = run.phases.findIndex((p) => p.type === "warmup");
    const zeroWarmup: SessionRun = {
      ...run,
      completedAt: new Date(NOW.getTime() + 60_000).toISOString(),
      actuals: {
        [warmupIndex]: {
          elapsedSeconds: 0,
          splitSeconds: 0,
          actualSource: "stopwatch",
        },
      },
    };
    const model = buildSummaryModel({
      door: "timer",
      run: zeroWarmup,
      steps: [],
    });
    const warmupRow = asMeasured(model.rows[0]);
    expect(warmupRow.timeLabel).toBeUndefined();
  });
});

describe("buildSummaryModel — manual door, a real library workout (Calm Sea, a single 10000m step)", () => {
  it("every row is prescribed by construction (buildManualLogSteps never sets actualSource); the caption always fires; heroes are all absent", () => {
    const w = library("Calm Sea");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    expect(steps.length).toBeGreaterThan(0);
    expect(
      steps.every(
        (s) => s.actualSource === undefined || s.actualSource === "assumed",
      ),
    ).toBe(true);

    const model = buildSummaryModel({
      door: "manual",
      steps,
      dateIso: "2026-08-17T09:00:00.000Z",
    });
    expect(model.caption).toBe("TARGETS ONLY · NOTHING MEASURED");
    expect(model.heroes).toStrictEqual({});
    expect(model.rows.every((r) => !r.measured)).toBe(true);
    expect(model.meta.dateLabel).toBe("AUG 17");
    expect(model.meta.timeLabel).toBeUndefined();
    expect(model.meta.sourceLabel).toBe("LOGGED BY HAND");
  });

  it("a TIME-based work step (Hoarfrost: wu + 2×12' @ 6k+12) renders its duration as m:ss, not a meters suffix", () => {
    const w = library("Hoarfrost");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    const timeStep = steps.find((s) => s.seconds !== undefined);
    expect(timeStep).toBeDefined();

    const model = buildSummaryModel({
      door: "manual",
      steps,
      dateIso: "2026-08-17T09:00:00.000Z",
    });
    const row = model.rows.find(
      (r) =>
        !r.measured && r.durationLabel === fmtDuration(timeStep!.seconds! / 60),
    );
    expect(row).toBeDefined();
  });

  it("a bare-label test-step row (IMP-1: neither meters nor seconds) has no durationLabel", () => {
    const steps: LogStep[] = [{ label: "2k test" }];
    const model = buildSummaryModel({
      door: "manual",
      steps,
      dateIso: "2026-08-17T09:00:00.000Z",
    });
    const row = model.rows[0]!;
    if (row.measured) throw new Error("expected a prescribed row");
    expect(row.durationLabel).toBeUndefined();
    expect(row.targetPaceLabel).toBeUndefined();
  });
});
