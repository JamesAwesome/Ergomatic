import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import {
  parseAdditionalSplitIntervalData,
  parseSplitIntervalData,
  toIntervalActual,
  type RawPm5Status,
} from "../../domain/monitor/pm5/parse.js";
import type { Baselines, Step, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { fromHexString } from "../monitor/transports/recording";
import type { MachineSummaryDetail, MonitorRun } from "../monitor/monitorRun";
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
  buildSpmCell,
  buildSummaryModel,
  buildTotalLine,
  deviationBarWidthPercent,
  isMeasuredReading,
  measuredIntervalCount,
  readingOfLogStep,
  rowJudgment,
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
    // Phase WU: every seed step is `kind: "work"` now — no interval can be
    // a warm-up. The seed's own legacy `"warmup"` member is only ever
    // reachable by a test that hands `monitorRun` an explicit `logSeed`
    // override, which is exactly how a PERSISTED pre-WU record reaches the
    // reader in production.
    logSeed: {
      steps: program.intervals.map((_iv, i) => ({
        label: `Interval ${i}`,
        kind: "work" as const,
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
    type: "work" | "test";
    kind: "time" | "distance";
    value: number;
    targetSplit: number | null;
    displaySpm: number | null;
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

/** Same idea as `readSessionFile` for a gzipped capture (this repo's own
 *  `captureReplay.test.ts` precedent for decompressing at test time rather
 *  than committing a second, uncompressed duplicate of a recording). */
function readGzSessionFile(relativePath: string): string {
  return gunzipSync(readFileSync(`${SESSIONS_DIR}${relativePath}`)).toString(
    "utf-8",
  );
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

describe("buildSummaryModel — DISTANCE (RC-5 §1: tier B is WORK-ONLY now — rest moved to the TOTAL line), external oracles", () => {
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

  it("the rest-bearing session (5 unequal pieces, not a legacy wu run): DISTANCE === 1535, work-only — the machine's TWD (1599) is no longer the hero, it feeds the TOTAL line's rest clause instead", () => {
    expect([wu, w2, w3, w4, w5].map((a) => a.distanceMeters)).toStrictEqual([
      100, 229, 461, 500, 245,
    ]);
    expect([wu, w2, w3, w4, w5].map((a) => a.restDistanceMeters)).toStrictEqual(
      [0, 30, 22, 12, 0],
    );

    const run = monitorRun({
      program: {
        intervals: [
          // Phase WU retyped this interval (`type: "warmup"` before); it
          // carries no target either way, and DISTANCE never consulted the
          // type. This fixture's own `logSeed` (the default `monitorRun()`
          // helper) marks every step `kind: "work"` — it is NOT a legacy
          // wu-carrying run (`warmupIndex` returns -1), so RC-5's tier B
          // work-only rule applies uniformly, same as any other row.
          interval({ kind: "distance", value: 100 }),
          interval({ kind: "distance", value: 229, restSeconds: 30 }),
          interval({ kind: "distance", value: 461, restSeconds: 30 }),
          interval({ kind: "distance", value: 500, restSeconds: 30 }),
          interval({ kind: "distance", value: 245 }),
        ],
      },
      actuals: [wu, w2, w3, w4, w5],
    });

    const model = buildSummaryModel({ door: "monitor", run });

    // The work-only sum, computed independently here (not by mutating the
    // source — that happens for real in the self-mutation pass documented
    // in the task report) so the hero's own number is pinned by an
    // assertion, not just a comment.
    const workOnly = [wu, w2, w3, w4, w5].reduce(
      (s, a) => s + a.distanceMeters,
      0,
    );
    expect(workOnly).toBe(1535);
    expect(model.heroes.distanceMeters).toBe(1535);
    // The machine's own TWD (1599 — work + rest) is what this hero used
    // to render; it's no longer the hero at all.
    expect(model.heroes.distanceMeters).not.toBe(1599);
  });

  it("§7 vetted ground, on real wire data: the machine's OWN avgSplit equals 500×t/d exactly for both keystone boundaries", () => {
    expect(work1.avgSplit).toBe(
      500 * (work1.elapsedSeconds / work1.distanceMeters),
    );
    expect(work2.avgSplit).toBe(
      500 * (work2.elapsedSeconds / work2.distanceMeters),
    );
  });

  it("old-shape record: restDistanceMeters undefined at runtime (a MonitorRun.actuals entry written before task 2's field existed) never crashes or NaNs — RC-5: the DISTANCE hero doesn't read restDistanceMeters at all any more (work-only), so an absent rest field can't touch it; the `?? 0` contract now lives in the TOTAL line's own rest derivation instead (see the RC-5 describe block below)", () => {
    const oldActual = { ...work1 } as IntervalActual;
    // Simulating a pre-field persisted record: `restDistanceMeters` went
    // additive-optional (storage-spine design spec §2, RC-7 — it used to
    // be `number`, and `delete` here needed a `@ts-expect-error`), so the
    // stored JSON genuinely lacking the key is now honest at the type
    // level too, not just at runtime.
    delete oldActual.restDistanceMeters;
    const run = monitorRun({
      program: { intervals: [interval({ kind: "distance", value: 250 })] },
      actuals: [oldActual],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBe(250); // work-only: just distanceMeters
    expect(Number.isNaN(model.heroes.distanceMeters)).toBe(false);
  });

  it("review finding 2: a null-index actual (boundary-out-of-run/divergence — 'A CONSUMER MUST NOT TREAT null AS INTERVAL 0') is EXCLUDED from AVG SPLIT (no program identity to judge against) but INCLUDED in DISTANCE/TIME (machine semantics — the meters/seconds genuinely happened; RC-5 §1's corrected exclusions keep this true under the new work-only rule too — this fixture's own rest is 0 for both actuals, so it can't by itself distinguish work-only from the old fused sum; the RC-5 describe block below adds a rest-bearing variant that does)", () => {
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

  it("the free third oracle (review finding 6): step-3's own 3 completed boundaries sum to 803m WORK-ONLY (the hero) — the machine's own TWD reading captured at teardown ('machineTotal=808m', step-3-ring.json) is the FUSED number, no longer the hero, and is exactly what the TOTAL line's rest clause (5m) accounts for", () => {
    // work 160+214+429 (the opener + work1 + work2's own splitIntervalDistanceMeters)
    // + rest 0+0+5 (their own intervalRestDistanceMeters) = 808 fused / 803
    // work-only. Reuses the exact decoded boundaries from the TIME/AVG
    // SPLIT describe block below (re-decoded here rather than imported
    // across describe blocks, same real hex, cited identically).
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
          interval({ kind: "time", value: 60 }),
          interval({ kind: "time", value: 60, restSeconds: 30 }),
          interval({ kind: "time", value: 120, restSeconds: 30 }),
        ],
      },
      actuals: [wu, w1, w2],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBe(803);
  });
});

describe("buildSummaryModel — RC-1 pin, RE-BASELINED for RC-5: DISTANCE/TIME/AVG SPLIT ignore RC-1's own work/rest fields entirely (work-only, computed from actuals) — only the TOTAL line reads them, and only through its own stated priority", () => {
  // A fractional actuals set (unrealistic for real wire data — every
  // committed 0x0037 field is a whole number — but that's exactly why the
  // pin needs it: the two rounding laws only disagree on a fractional
  // input). `restSeconds: 10` is this fixture's own MEASURED (wire) rest —
  // deliberately DIFFERENT from the program's own PROGRAMMED rest below
  // (also 10 here, matched on purpose so this fixture stays a clean
  // rounding-law pin; the discriminating divergence test lives in its own
  // describe block further down) — both fields present so the actual
  // satisfies fix round 1's I3 completeness gate (`monitorRest`).
  const fractionalActual: IntervalActual = {
    index: 0,
    elapsedSeconds: 60,
    distanceMeters: 10.4,
    avgSplit: null,
    avgSpm: null,
    avgHeartRateBpm: null,
    restDistanceMeters: 10.4,
    restSeconds: 10,
  };
  const baseRun = monitorRun({
    program: {
      intervals: [interval({ kind: "distance", value: 10.4, restSeconds: 10 })],
    },
    actuals: [fractionalActual],
  });

  it("DISTANCE is work-only: round(Σwork) = 10, never round(Σ(work+rest)) = 21 — RC-5 retires this hero's old fused rounding law", () => {
    const model = buildSummaryModel({ door: "monitor", run: baseRun });
    expect(model.heroes.distanceMeters).toBe(10);
    expect(model.heroes.distanceMeters).not.toBe(21);
  });

  it("DISTANCE/TIME/AVG SPLIT are byte-identical whether or not the record carries RC-1's own work/rest fields — pinned by STRICT whole-hero equality (minus totalLine, which the fields deliberately DO feed): even wildly wrong values on workSeconds/workMeters/restSeconds/restMeters change NOTHING about the three heroes. The TOTAL line is the exception (fix round 1, I2/I3): its rest ladder reads run.restSeconds/restMeters directly when present, ahead of deriving from the actuals", () => {
    const withoutFields = buildSummaryModel({ door: "monitor", run: baseRun });
    const withFields = buildSummaryModel({
      door: "monitor",
      run: {
        ...baseRun,
        workSeconds: 999,
        workMeters: 999,
        restSeconds: 999,
        restMeters: 999,
      },
    });
    // M2 (fix round 1): strict equality on every OTHER hero field at once —
    // a future field this test doesn't yet know about leaking RC-1 data
    // would fail this the moment it's added, not just the fields named
    // above.
    const { totalLine: _withoutTotalLine, ...withoutRest } =
      withoutFields.heroes;
    const { totalLine: _withTotalLine, ...withRest } = withFields.heroes;
    expect(withRest).toStrictEqual(withoutRest);

    // TOTAL, without RC-1's stored pair: this row's own work seconds (60)
    // plus the ACTUAL's own measured rest (10s, `restSeconds` above) =
    // 70s = "1:10" — never the program's programmed rest (a separate
    // number, matched here only by fixture construction). Rest metres:
    // Σ restDistanceMeters (10.4, this actual's only) rounds to 10 — I3's
    // fix retires the old double-rounding quirk (fused round(10.4+10.4)=21
    // minus Σwork 10.4 = 10.6 → 11) that used to make this a different
    // number from the direct sum.
    expect(withoutFields.heroes.totalLine).toBe(
      "1:10 total · plus 10 m coasting in rest",
    );
    // WITH RC-1's stored pair: it wins outright (source 1) over the
    // per-actual derivation — work seconds are STILL this row's own (60,
    // RC-1's workSeconds/workMeters never feed a hero), but the rest pair
    // is now the stored 999/999.
    expect(withFields.heroes.totalLine).toBe(
      "17:39 total · plus 999 m coasting in rest",
    );
    expect(withFields.heroes.totalLine).not.toContain("10 m");
  });
});

describe("buildSummaryModel — RC-5 §2, fix round 1 (I2): the TOTAL line's SECONDS run through the SAME measured-rest ladder as its METRES — never the program's PROGRAMMED rest", () => {
  it("discriminates: an actual's MEASURED restSeconds (40) differs sharply from its interval's PROGRAMMED restSeconds (900) — the total uses the measured figure, never the programmed one", () => {
    const divergentActual: IntervalActual = {
      index: 0,
      elapsedSeconds: 100,
      distanceMeters: 500,
      avgSplit: 200,
      avgSpm: 24,
      avgHeartRateBpm: null,
      restDistanceMeters: 30,
      restSeconds: 40, // the wire's own reading
    };
    const run = monitorRun({
      program: {
        // The PROGRAMMED rest (900s) is wildly different from the wire's
        // own 40s reading above — if the TOTAL line's seconds still read
        // this field (the pre-fix-round-1 bug), the total would be
        // 100+900=1000s ("16:40"), not 100+40=140s ("2:20").
        intervals: [
          interval({ kind: "distance", value: 500, restSeconds: 900 }),
        ],
      },
      actuals: [divergentActual],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.totalLine).toBe(
      "2:20 total · plus 30 m coasting in rest",
    );
    expect(model.heroes.totalLine).not.toContain("16:40");
  });
});

describe("buildSummaryModel — RC-5 §2, fix round 1 (I3): the derive step is a PAIR — never a partial sum that silently reads a missing rest reading as a real zero", () => {
  it("an actual with a REAL, nonzero restDistanceMeters (50) but NO restSeconds at all: the rest clause is withheld entirely, not '50 m' derived off a silently-zeroed seconds half", () => {
    // The partial-sum shape `monitorRun.ts:738-750` forbids by name: this
    // actual's rest METRES genuinely happened (50m, a real wire reading),
    // but its rest SECONDS were never recorded (the synthesized-final
    // fallback's own documented gap — `IntervalActual.restSeconds`'s own
    // doc comment). Deriving `restMeters` alone here (ignoring the missing
    // `restSeconds`) would print "plus 50 m coasting in rest" while
    // silently treating the unmeasured rest TIME as zero — indistinguishable
    // from "there was no rest," the exact under-count this repo's own
    // recurring-failure list warns against.
    const oneFieldMissing: IntervalActual = {
      index: 0,
      elapsedSeconds: 80,
      distanceMeters: 400,
      avgSplit: 200,
      avgSpm: 22,
      avgHeartRateBpm: null,
      restDistanceMeters: 50,
      // restSeconds intentionally absent.
    };
    const run = monitorRun({
      program: {
        intervals: [interval({ kind: "distance", value: 400, restSeconds: 0 })],
      },
      actuals: [oneFieldMissing],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    // The total renders work-only (80s = "1:20"), never a clause built
    // from the one rest field that IS present.
    expect(model.heroes.totalLine).toBe("1:20 total");
    expect(model.heroes.totalLine).not.toContain("50 m");
  });
});

describe("buildSummaryModel — RC-5: the three heroes agree (tier A machine-verbatim, tier B work-only quotient), and the TOTAL line carries the wall-clock number rest moved off of", () => {
  // The exit-7 walk's own numbers (docs/monitor/sessions/walk-2026-08-24/
  // README.md, PM5 View Detail SCREEN, PRIMARY): 2×250m r1:00, Totals row
  // `2:04.0 / 500 / 2:04.0`. Interval 1 `1:07.9 / 250 / 2:15.8, 25 spm`,
  // rest 1 `r1:00 / 147m`; interval 2 `:56.1 / 250 / 1:52.2, 28 spm`, rest
  // 2 `r1:00 / 95m`. `0x0039`'s own decode (WIRE, `phone-exit7-ring.json`
  // seq 61, cited identically in `server/routes/machineSummary.
  // integration.test.ts`): elapsed 124.0s, distance 500m, avg pace 124.0s
  // (0x0039 offset 18-19). NOT decoded via `decodeActual` here — interval
  // 1's own raw 0x0037/0x0038 bytes were never logged in the committed
  // ring (only interval 2's were; the ring's "notify-first" entries carry
  // no raw payload, only a byte-length) — so both intervals are built from
  // the walk's own PHOTOGRAPHED numbers instead, which the README already
  // transcribed as PRIMARY evidence.
  const exit7Program: WorkoutProgram = {
    intervals: [
      interval({ kind: "distance", value: 250, restSeconds: 60 }),
      interval({ kind: "distance", value: 250, restSeconds: 60 }),
    ],
  };
  const exit7Actual1: IntervalActual = {
    index: 0,
    elapsedSeconds: 67.9,
    distanceMeters: 250,
    avgSplit: 135.8, // 2:15.8
    avgSpm: 25,
    avgHeartRateBpm: null,
    restDistanceMeters: 147,
    restSeconds: 60,
  };
  const exit7Actual2: IntervalActual = {
    index: 1,
    elapsedSeconds: 56.1,
    distanceMeters: 250,
    avgSplit: 112.2, // 1:52.2
    avgSpm: 28,
    avgHeartRateBpm: null,
    restDistanceMeters: 95,
    restSeconds: 60,
  };
  const exit7SummaryDetail: MachineSummaryDetail = {
    avgStrokeRate: 26,
    endingHeartRateBpm: null,
    avgHeartRateBpm: null,
    minHeartRateBpm: null,
    maxHeartRateBpm: null,
    dragFactorAverage: 100,
    workoutType: 8,
    recoveryHeartRateBpm: null,
    avgPaceSecondsPer500m: 124.0, // 0x0039 offset 18-19, decoded (PRIMARY)
  };

  it("tier A (run.summaryTotals present, PR #190): DISTANCE 500, TIME 2:04, AVG SPLIT 2:04.0 — the machine's OWN numbers verbatim, never a quotient of ours; TOTAL line 4:04 · plus 242 m coasting in rest, using RC-1's stored restMeters", () => {
    const run = monitorRun({
      program: exit7Program,
      actuals: [exit7Actual1, exit7Actual2],
      endedBy: "finished",
      summaryTotals: { workElapsedSeconds: 124.0, workDistanceMeters: 500 },
      summaryDetail: exit7SummaryDetail,
      workSeconds: 124.0,
      workMeters: 500,
      restSeconds: 120,
      restMeters: 242,
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBe(500);
    expect(model.heroes.time).toBe("2:04");
    expect(model.heroes.avgSplit).toBe("2:04.0");
    expect(model.heroes.totalLine).toBe(
      "4:04 total · plus 242 m coasting in rest",
    );
  });

  it("tier B (no summaryTotals — a pre-#190 record): the SAME three numbers, computed from the row's own actuals — DISTANCE/TIME work-only (Σ), AVG SPLIT ONE quotient over the summed pair (never a second derivation); TOTAL line DERIVES its rest clause from the fused pair (no RC-1 fields stored on this run)", () => {
    const run = monitorRun({
      program: exit7Program,
      actuals: [exit7Actual1, exit7Actual2],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBe(500);
    expect(model.heroes.time).toBe("2:04");
    // ONE quotient over the summed pair — never a per-actual avgSplit, and
    // never two separate 500×t/d computations.
    expect(model.heroes.avgSplit).toBe(fmtSplit((500 * (67.9 + 56.1)) / 500));
    expect(model.heroes.avgSplit).toBe("2:04.0");
    expect(model.heroes.totalLine).toBe(
      "4:04 total · plus 242 m coasting in rest",
    );
  });

  it("a run with a null-index actual (rest-bearing, unlike the review-finding-2 fixture above — this one can actually discriminate work-only from the old fused sum): it stays IN the DISTANCE/TIME work-only sum, OUT of AVG SPLIT — and its rest metres still reach the TOTAL line (§1's corrected exclusions are about JUDGING, not what happened)", () => {
    const nullIndexed: IntervalActual = { ...exit7Actual2, index: null };
    const run = monitorRun({
      program: exit7Program,
      actuals: [exit7Actual1, nullIndexed],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    // Both actuals' work meters/seconds count — the work-only sum has no
    // index gate at all.
    expect(model.heroes.distanceMeters).toBe(500);
    expect(model.heroes.time).toBe("2:04");
    // AVG SPLIT excludes the null-index actual — exit7Actual1 alone:
    // 500×67.9/250 = 135.8s = 2:15.8, the README's own interval-1 pace.
    expect(model.heroes.avgSplit).toBe("2:15.8");
    expect(model.heroes.avgSplit).not.toBe("2:04.0");
    // The rest clause still reflects BOTH actuals' rest metres (147+95) —
    // rest tracking never gated on index.
    expect(model.heroes.totalLine).toContain("242 m coasting in rest");
  });

  it("tier A with a zero summaryTotals (the '0 OF N INTERVALS MEASURED' hardware shape — a burst that arrived, but no boundary ever did): every hero is absent, never a fabricated 0/0:00 — fix round 1, I4: including AVG SPLIT, which must NOT render off summaryDetail alone when the machine's own totals are zero", () => {
    const run = monitorRun({
      program: exit7Program,
      actuals: [],
      endedBy: "finished",
      summaryTotals: { workElapsedSeconds: 0, workDistanceMeters: 0 },
      summaryDetail: exit7SummaryDetail,
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBeUndefined();
    expect(model.heroes.time).toBeUndefined();
    expect(model.heroes.timeSeconds).toBeUndefined();
    // I4: exit7SummaryDetail.avgPaceSecondsPer500m is 124.0 (a real,
    // positive number) — without the hasTotals gate, this would have
    // rendered a lone "2:04.0" AVG SPLIT beside three absent heroes.
    expect(model.heroes.avgSplit).toBeUndefined();
    expect(model.heroes.avgSplitSeconds).toBeUndefined();
    expect(model.heroes.totalLine).toBeUndefined();
  });

  it("a no-rest run: the TOTAL line renders the total ALONE, with no rest clause (never a fabricated `0 m`)", () => {
    const noRestActual: IntervalActual = {
      index: 0,
      elapsedSeconds: 139,
      distanceMeters: 500,
      avgSplit: 139,
      avgSpm: 24,
      avgHeartRateBpm: null,
      restDistanceMeters: 0,
      restSeconds: 0,
    };
    const run = monitorRun({
      program: {
        intervals: [interval({ kind: "distance", value: 500, restSeconds: 0 })],
      },
      actuals: [noRestActual],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.totalLine).toBe("2:19 total");
    expect(model.heroes.totalLine).not.toContain("coasting");
  });
});

describe("buildTotalLine — the exported formatter, ONE place the string is built (Task 3 reuses it for the stored-row screen)", () => {
  it("formats total + rest clause per the exact house copy: middle dot, 'plus', 'coasting in rest' (never 'during', never an em-dash)", () => {
    expect(buildTotalLine(244, 242)).toBe(
      "4:04 total · plus 242 m coasting in rest",
    );
  });

  it("omits the rest clause when restMeters is absent, zero, or negative — never a `0 m` that implies a measurement", () => {
    expect(buildTotalLine(139, undefined)).toBe("2:19 total");
    expect(buildTotalLine(139, 0)).toBe("2:19 total");
    expect(buildTotalLine(139, -1)).toBe("2:19 total");
  });

  it("renders nothing at all when totalSeconds is absent, zero, or negative — no `0:00 total`", () => {
    expect(buildTotalLine(undefined, 242)).toBeUndefined();
    expect(buildTotalLine(0, 242)).toBeUndefined();
    expect(buildTotalLine(-5, 242)).toBeUndefined();
  });

  it("rounds a fractional rest-metres figure for display", () => {
    expect(buildTotalLine(60, 10.6)).toBe(
      "1:00 total · plus 11 m coasting in rest",
    );
  });
});

describe("buildSummaryModel — TIME (R-D) and AVG SPLIT (R-C), the walk-3 shape", () => {
  // walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl —
  // its own committed `header.program` (verbatim): 60s r0 (a warm-up when
  // the walk was recorded — Phase WU retypes it work, and nothing else
  // about the transcription changes), work 60s
  // r30 (targetSplit 129), work 120s r30 (targetSplit 129), work 500m r30,
  // work 60s r0. Only the first three intervals completed before the
  // session was reloaded mid-4th-piece (the file's own README, "F6" row).
  // README's own F-1 finding, independently re-derived below from the raw
  // bytes rather than trusted from prose: "work 60+60+120 ... completed
  // rests 0+30+30 = 300 -> 5 MIN".
  //
  // Boundary 1 (the opener) and boundary 2 (work 1) are the file's own two
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
      interval({ kind: "time", value: 60, restSeconds: 0 }),
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

  it("TIME === 4:00, work-only (RC-5 §1: R-D's old fused formula — Σ work seconds 60+60+120 + programmed rest for completed intervals 0+30+30 — is no longer the hero); the OLD fused number (5:00) now lives on the TOTAL line instead, with its own 5m rest clause", () => {
    expect([wu, w1, w2].map((a) => a.elapsedSeconds)).toStrictEqual([
      60, 60, 120,
    ]);
    const run = monitorRun({ program, actuals: [wu, w1, w2] });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.time).toBe("4:00");
    expect(model.heroes.time).toBe(fmtDuration(240 / 60));
    expect(model.heroes.time).not.toBe("5:00");
    // Fix round 1 (I2): the TOTAL line's seconds come from THIS actual's
    // own MEASURED restSeconds (wire), not the program's programmed rest
    // — they happen to agree here (0/30/30 either way, this capture's own
    // wire readings), so this fixture alone can't discriminate the two;
    // the dedicated discriminator test below can. Work 240s + measured
    // rest 60s (0+30+30) = 300s = "5:00". Rest metres 0+0+5 = 5 — the
    // free-third-oracle test above decodes these identical wu/w1/w2
    // boundaries and pins the same distance-work sum (803) and rest sum
    // (5) for this triplet.
    expect(model.heroes.totalLine).toBe(
      "5:00 total · plus 5 m coasting in rest",
    );
  });

  it("AVG SPLIT counts EVERY completed interval (R-C, post-Phase-WU) — no machine oracle exists for the weighted average (spec §5: 0x0032's Average Pace matches no candidate formula); the witness is §7's per-interval identity plus hand arithmetic over the real decoded boundaries", () => {
    // THIS IS THE NUMBER PHASE WU MOVES, and it moves in the direction the
    // removal implies. Interval 0 of this capture was programmed as a
    // warm-up, and R-C used to drop it from the weighted average: the hero
    // read `500 × (60+120) / (214+429)` = 2:20.0. There is no warm-up left
    // to drop, so the hero is now `500 × (60+60+120) / (160+214+429)` =
    // 2:29.4 — SLOWER, because the easy opener was the slowest piece in
    // the session. Both figures were already computed in this test before
    // Phase WU (it asserted the second one was WRONG); the arithmetic is
    // untouched, only which of the two the model produces.
    //
    // The three boundaries' own readings, straight off the decoded actuals
    // above, not retyped.
    expect(wu.elapsedSeconds).toBe(60);
    expect(wu.distanceMeters).toBe(160);
    expect(w1.elapsedSeconds).toBe(60);
    expect(w1.distanceMeters).toBe(214);
    expect(w2.elapsedSeconds).toBe(120);
    expect(w2.distanceMeters).toBe(429);

    const run = monitorRun({ program, actuals: [wu, w1, w2] });
    const model = buildSummaryModel({ door: "monitor", run });

    const allThree =
      (500 * (wu.elapsedSeconds + w1.elapsedSeconds + w2.elapsedSeconds)) /
      (wu.distanceMeters + w1.distanceMeters + w2.distanceMeters);
    expect(model.heroes.avgSplit).toBe(fmtSplit(allThree));
    expect(model.heroes.avgSplit).toBe("2:29.4");

    // And the OLD hero, computed independently here, is what the model
    // must no longer produce — the same "prove the other answer is wrong,
    // not merely different" shape this case has always had, pointed the
    // other way.
    const droppingInterval0 =
      (500 * (w1.elapsedSeconds + w2.elapsedSeconds)) /
      (w1.distanceMeters + w2.distanceMeters);
    expect(fmtSplit(droppingInterval0)).toBe("2:20.0");
    expect(model.heroes.avgSplit).not.toBe(fmtSplit(droppingInterval0));
  });

  it("a LEGACY stored run whose seed still says kind:'warmup' keeps its interval 0 OUT of AVG SPLIT — the record's number must not move under it. RC-5 §1's own ruling: DISTANCE/TIME for this legacy shape ALSO don't move — they stay the OLD fused numbers (808m/5:00), never the new work-only figures (803m/4:00) a fresh run would get", () => {
    // THE KEPT GUARD (`summaryModel.ts`'s `warmupIndex`, `logDraft.ts`'s
    // `LogSeed`). `LogSeed` is PERSISTED inside a `MonitorRun`, so a run
    // finished and stored before Phase WU still carries `kind: "warmup"` on
    // its first seed step — and the AVG SPLIT its owner already saw
    // excluded that interval. Deleting the guard would silently restate
    // that saved record as 2:29.4. Nothing PRODUCES this seed any more,
    // which is why the fixture writes it by hand.
    const run = monitorRun({
      program,
      actuals: [wu, w1, w2],
      logSeed: {
        steps: program.intervals.map((_iv, i) => ({
          label: `Interval ${i}`,
          kind: i === 0 ? ("warmup" as const) : ("work" as const),
        })),
        paces: {},
      },
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.avgSplit).toBe("2:20.0");
    expect(model.heroes.distanceMeters).toBe(808);
    expect(model.heroes.time).toBe("5:00");
    expect(model.heroes.distanceMeters).not.toBe(803);
    expect(model.heroes.time).not.toBe("4:00");
    // Fix round 1, I6: a legacy wu run gets NO total line at all — its
    // DISTANCE/TIME heroes above already ARE the fused (work+rest)
    // numbers, so a total line restating "5:00 total · plus 5 m coasting
    // in rest" underneath a "TIME 5:00" hero that already counts that
    // same 5m would double-count the rest, not disclose it.
    expect(model.heroes.totalLine).toBeUndefined();
  });

  // Fix round 1 coverage: restructuring the tier split left
  // `monitorDistanceMeters`/`monitorTimeSeconds` (the OLD fused formulas)
  // reachable ONLY through the legacy-wu branch now — these two cases
  // (a legacy actual missing `restDistanceMeters`, and a legacy run with
  // nothing measured at all) used to be covered incidentally through the
  // ordinary tier B path; they need their own legacy-flagged fixtures now.
  it("a legacy wu run whose actual is missing restDistanceMeters (an old-shape record, predating that field): the `?? 0` fallback holds — DISTANCE is work-only for that actual, never NaN", () => {
    const oldShapeActual = { ...wu } as IntervalActual;
    delete oldShapeActual.restDistanceMeters;
    const run = monitorRun({
      program,
      actuals: [oldShapeActual],
      logSeed: {
        steps: program.intervals.map((_iv, i) => ({
          label: `Interval ${i}`,
          kind: i === 0 ? ("warmup" as const) : ("work" as const),
        })),
        paces: {},
      },
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBe(wu.distanceMeters); // 160 + (undefined ?? 0)
    expect(Number.isNaN(model.heroes.distanceMeters)).toBe(false);
  });

  it("a legacy wu run with no actuals at all: DISTANCE/TIME are absent, never a fabricated 0/0:00 — the old fused formulas' own `total > 0` guard still holds on the legacy path", () => {
    const run = monitorRun({
      program,
      actuals: [],
      logSeed: {
        steps: program.intervals.map((_iv, i) => ({
          label: `Interval ${i}`,
          kind: i === 0 ? ("warmup" as const) : ("work" as const),
        })),
        paces: {},
      },
    });
    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.heroes.distanceMeters).toBeUndefined();
    expect(model.heroes.time).toBeUndefined();
    expect(model.heroes.timeSeconds).toBeUndefined();
    expect(model.heroes.totalLine).toBeUndefined();
  });

  it("interval 0 is an ordinary NUMBERED row now: measured, judged like any other, no unnumbered WARM-UP row above it — §1's re-baseline: the completed work rows judge against their OWN 129s target, not a working average", () => {
    const run = monitorRun({ program, actuals: [wu, w1, w2] });
    const model = buildSummaryModel({ door: "monitor", run });
    // PHASE WU CHANGED WHAT ROW 0 IS. It used to be the unnumbered
    // `WARM-UP` row: `isWarmup: true`, no `index`, deliberately unjudged
    // and target-less. That row, and the `isWarmup` field that marked it,
    // are gone — interval 0 is piece one of five, numbered `1`, and it
    // still carries no target because the CAPTURE gave it none (its
    // `targetSplit` is null in the program above), not because the row
    // type suppresses one.
    const row0 = asMeasured(model.rows[0]);
    expect(row0.index).toBe(1);
    expect(row0.timeLabel).toBe("1:00");
    expect(row0.targetLabel).toBeUndefined();
    expect(row0.judged).toBeUndefined();
    expect(row0.onTarget).toBeUndefined();

    // `program` names 5 intervals (verbatim from the recording's own
    // header — the module header explains why it isn't trimmed); only the
    // first three were ever completed, so the row list is 5 rows: three
    // measured, two prescribed (the piece the F6 reload interrupted, and
    // the one after it, neither ever rowed). The COUNT is unchanged — it
    // was warm-up + 4 work rows before — but every row is numbered now, so
    // the work pieces' own ordinals each rise by one.
    expect(model.rows).toHaveLength(5);
    const row1 = asMeasured(model.rows[1]);
    const row2 = asMeasured(model.rows[2]);
    expect(row1.index).toBe(2);
    // §1 re-baseline: judged against THIS row's own 129s target
    // (`program`'s own `targetSplit: 129` on both work intervals), not
    // the old working average — w1.avgSplit 140.1s vs target 129s is
    // +11.1s, outside the band, SLOWER.
    expect(row1.targetLabel).toBe(fmtSplit(129));
    expect(row1.judged?.direction).toBe("slower");
    expect(row1.judged?.deviationSeconds).toBeCloseTo(140.1 - 129, 5);
    expect(row2.index).toBe(3);
    // w2.avgSplit 139.8s vs the same 129s target: +10.8s, SLOWER too.
    expect(row2.targetLabel).toBe(fmtSplit(129));
    expect(row2.judged?.direction).toBe("slower");
    expect(row2.judged?.deviationSeconds).toBeCloseTo(139.8 - 129, 5);
    expect(model.rows[3]!.measured).toBe(false);
    expect(model.rows[3]!.index).toBe(4);
    expect(model.rows[4]!.measured).toBe(false);
    expect(model.rows[4]!.index).toBe(5);
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

describe("buildSummaryModel — deviation signs and clamp, in a real monitor row (§1 re-baseline: judged against EACH row's OWN target)", () => {
  // The keystone pair from the DISTANCE describe block above, re-derived
  // here for its OWN clean numbers: row1 pace 128.6s, row2 pace 149.4s —
  // both given the SAME 139.0s target (§1 re-baseline note: this fixture
  // deliberately reuses the number that used to be the two-row working
  // average, so every deviation/label below stays byte-identical to the
  // pre-rebaseline test this one replaces — each row is still judged
  // against its OWN `targetSplit` field, not a shared average; the pyramid
  // wire-scoping witness and the tule-fog pin further down are where
  // DISTINCT per-row targets get exercised). Faster/slower, symmetric,
  // both saturating the 50% cap.
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
          interval({ kind: "distance", value: 250, targetSplit: 139.0 }),
          interval({ kind: "distance", value: 250, targetSplit: 139.0 }),
        ],
      },
      actuals: [work1, work2],
    });
    const model = buildSummaryModel({ door: "monitor", run });

    const row1 = asMeasured(model.rows[0]);
    const row2 = asMeasured(model.rows[1]);
    expect(row1.paceLabel).toBe("2:08.6");
    expect(row2.paceLabel).toBe("2:29.4");
    expect(row1.targetLabel).toBe(fmtSplit(139.0));
    expect(row2.targetLabel).toBe(fmtSplit(139.0));
    expect(row1.judged?.direction).toBe("faster");
    expect(row1.judged?.deviationLabel).toBe("−10.4");
    expect(row1.judged?.barWidthPercent).toBe(50);
    expect(row1.onTarget).toBeUndefined();
    expect(row2.judged?.direction).toBe("slower");
    expect(row2.judged?.deviationLabel).toBe("+10.4");
    expect(row2.judged?.barWidthPercent).toBe(50);
    expect(row2.onTarget).toBeUndefined();
  });

  // HISTORY NOTE (§1/§6.2's own "the lone-row abstention is RETIRED for
  // targeted rows" clause): before this task, a single measured work row
  // was NEVER judged (PW review finding 5's `count >= 2` gate — "a row's
  // deviation against its own lone average is always exactly zero"). That
  // tautology no longer exists: this row's baseline is its OWN target
  // field, not a working average built from itself, so a genuinely lone
  // measured-and-targeted row is now judged like any other. This test
  // used to assert `row.judged` was `undefined` for exactly this fixture
  // (`work1` alone, no target) — rewritten, not deleted, per this task's
  // brief, to prove the NEW rule instead of the retired one.
  it("a single measured work row WITH a target is now JUDGED (finding 5's lone-row gate is retired for targeted rows — §1 ruling 1)", () => {
    const run = monitorRun({
      program: {
        intervals: [
          interval({ kind: "distance", value: 250, targetSplit: 140 }),
        ],
      },
      actuals: [work1],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    const row = asMeasured(model.rows[0]);
    // The hero is still well-defined over a single row (it IS that row's
    // own pace) — R-C's formula is unaffected by this task.
    expect(model.heroes.avgSplit).toBe(row.paceLabel);
    // 128.6s actual vs 140s target = -11.4s, outside the band: FASTER,
    // now genuinely judged rather than abstained.
    expect(row.targetLabel).toBe(fmtSplit(140));
    expect(row.judged).toBeDefined();
    expect(row.judged?.direction).toBe("faster");
    expect(row.onTarget).toBeUndefined();
  });

  // The abstains-when case that survives this rewrite: a lone row is
  // STILL unjudged when it carries no target at all — now for the §1
  // "targetSplit present" reason, never the retired count>=2 one.
  it("a single measured work row with NO target stays unjudged — the abstains-when rule, not the retired lone-row gate", () => {
    const run = monitorRun({
      program: { intervals: [interval({ kind: "distance", value: 250 })] },
      actuals: [work1],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    const row = asMeasured(model.rows[0]);
    expect(row.targetLabel).toBeUndefined();
    expect(row.judged).toBeUndefined();
    expect(row.onTarget).toBeUndefined();
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

  // §1's own "abstains when" clause (antagonist B5): a pm5 PAIRING-
  // EXCEPTION row (real time/meters, no usable pace) still shows its
  // TARGET — the cell keys on `targetSplit` ALONE, never on whether the
  // row can be judged. Hiding it here would drop a true number the
  // rower actually authored.
  it("§1 B5: a pairing-exception row (measured, no pace) still shows its TARGET cell — the bar/± stay absent, the TARGET does not", () => {
    const outOfBand: IntervalActual = {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 250,
      avgSplit: 9999, // unusable — same fixture as the test above
      avgSpm: null,
      avgHeartRateBpm: null,
      restDistanceMeters: 0,
    };
    const run = monitorRun({
      program: {
        intervals: [
          interval({ kind: "distance", value: 250, targetSplit: 130 }),
        ],
      },
      actuals: [outOfBand],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    const row = asMeasured(model.rows[0]);
    expect(row.paceLabel).toBeUndefined(); // no pace to judge with
    expect(row.targetLabel).toBe(fmtSplit(130)); // the target still shows
    expect(row.judged).toBeUndefined(); // no bar/± — nothing to compute a deviation from
    expect(row.onTarget).toBeUndefined();
  });

  it("an interval whose own boundary never arrived renders PRESCRIBED, with no fabricated measurement", () => {
    // Phase WU: interval 0 was `type: "warmup"` here, and the row it
    // produced was the measured-shaped-but-empty WARM-UP row
    // (`monitorWarmupRow`, since deleted). Interval 0 is an ordinary piece
    // now, so a missing boundary puts it in the PRESCRIBED shape every
    // other unmeasured interval already used — which is the same
    // underlying rule ("never a fabricated 0:00") expressed through one
    // row type instead of two.
    const run = monitorRun({
      program: {
        intervals: [
          interval({ kind: "time", value: 60 }),
          interval({ kind: "distance", value: 250 }),
        ],
      },
      // Only interval 1 reported a boundary — interval 0's was lost (a
      // real, named case: the run contract's `boundary-out-of-run`/
      // divergence paths, `domain/monitor/types.ts`).
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
    const lostRow = model.rows[0]!;
    expect(lostRow.measured).toBe(false);
    expect(lostRow.index).toBe(1);
    if (lostRow.measured) throw new Error("row 0 should be prescribed");
    expect(lostRow.durationLabel).toBe("1:00");
    expect(model.rows[1]!.measured).toBe(true);
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

/** Phase WU: this used to take a `warmup?: WarmupSetting` and thread it to
 *  `buildRun`'s fourth argument. Both are gone. `extraLeadStep` is the
 *  replacement the two cases that needed a leading interval now use — a
 *  REAL authored step, prepended to the workout's own, which is the only
 *  way a session can start with an easy piece at all now. */
function sessionRunFixture(title: string, extraLeadStep?: Step): SessionRun {
  const w = library(title);
  const draft = buildDraft({
    id: `id-${title}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: extraLeadStep ? [extraLeadStep, ...w.steps] : w.steps,
  });
  const built = buildRun(draft, BASELINES, NOW);
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

/** The draft `sessionRunFixture` built its run from — same `extraLeadStep`
 *  argument, so a caller that prepended a step gets a draft whose own step
 *  indices still line up with the run's `originalIndex` attribution
 *  (`buildLogSteps` resolves labels through exactly that lookup). */
function draftFor(title: string, extraLeadStep?: Step): SessionDraft {
  const w = library(title);
  return buildDraft({
    id: `id-${title}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: extraLeadStep ? [extraLeadStep, ...w.steps] : w.steps,
  });
}

describe("buildSummaryModel — timer door, a real mixed measured/prescribed list (Filling Low: a 500 m opener + 3×2000m @ 6k+4)", () => {
  const EASY_500 = {
    k: "w" as const,
    duration: { kind: "distance" as const, meters: 500 },
    ref: { effort: "min" as const },
  };

  it("one measured (stopwatch) distance occurrence among four produces a genuinely mixed rows list with a computable AVG SPLIT and no DISTANCE hero", () => {
    // PHASE WU: the leading 500 m used to be a DISTANCE WARM-UP SETTING,
    // and this case existed partly to exercise `timerWarmupRow`'s "a
    // distance warm-up CAN be genuinely measured" branch. That builder and
    // its unnumbered row are gone, so the same 500 m is an authored EASY
    // step and its stopwatch reading now counts like any other row's — see
    // the AVG SPLIT assertion below, which is the number that moves.
    const run = sessionRunFixture("Filling Low", EASY_500);
    const draft = draftFor("Filling Low", EASY_500);
    const openerIndex = 0;
    const openerMeters = run.phases[openerIndex]!.meters!;

    // Find the first WORK distance phase (a repeated-block occurrence) and
    // record a real stopwatch actual for it — the exact identity
    // `session/engine.ts`'s `nextDistance` uses (`splitSeconds = (elapsed /
    // meters) * 500`), applied by hand so the fixture is deterministic.
    const distanceIndex = run.phases.findIndex(
      (p, i) =>
        i !== openerIndex && p.type === "work" && p.meters !== undefined,
    );
    expect(distanceIndex).toBeGreaterThanOrEqual(0);
    const meters = run.phases[distanceIndex]!.meters!;
    const elapsed = meters * 0.5; // an arbitrary, real-shaped pace
    const openerElapsed = openerMeters * 0.6;
    const measuredRun: SessionRun = {
      ...run,
      actuals: {
        [openerIndex]: {
          elapsedSeconds: openerElapsed,
          splitSeconds: (openerElapsed / openerMeters) * 500,
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
    // TWO now, not one: the opener is an authored work step, so
    // `buildLogSteps` emits a `LogStep` for it and its stopwatch reading is
    // a measurement like any other. Before Phase WU it was a warm-up phase,
    // which `buildLogSteps` never emitted a `LogStep` for at all.
    expect(measuredCount).toBe(2);

    const model = buildSummaryModel({ door: "timer", run: measuredRun, steps });
    expect(model.heroes.distanceMeters).toBeUndefined(); // timer door: no machine total (module scope decision)
    // AVG SPLIT NOW COUNTS THE OPENER. It used to be `500 × Σt/Σd` over the
    // one measured WORK row alone, because the warm-up's reading was
    // excluded (this module's generalization of R-C). Both measured
    // readings weigh in now, computed here from the fixture's own numbers
    // rather than retyped as a literal.
    expect(model.heroes.avgSplit).toBe(
      fmtSplit((500 * (openerElapsed + elapsed)) / (openerMeters + meters)),
    );
    expect(model.caption).toBeUndefined(); // at least one row was measured

    const measuredRows = model.rows.filter((r) => r.measured);
    const prescribedRows = model.rows.filter((r) => !r.measured);
    expect(measuredRows.length).toBeGreaterThan(0);
    expect(prescribedRows.length).toBeGreaterThan(0);

    // The opener's own row: measured (a real reading), first, and numbered
    // `1`. It carries no target because it is an EFFORT step — that is a
    // fact about the step, not about a row type that suppressed one.
    const openerRow = asMeasured(model.rows[0]);
    expect(openerRow.index).toBe(1);
    expect(openerRow.timeLabel).toBe(fmtDuration(openerElapsed / 60));
    expect(openerRow.judged).toBeUndefined();
    expect(openerRow.targetLabel).toBeUndefined();

    // §1's judged-when member set includes "stopwatch" (the timer door's
    // own source, `logDraft.ts`'s `buildLogSteps`) — the one real
    // stopwatch-measured work row here has a genuine "6K +4" target and
    // is genuinely judged, proving the timer door's own measured rows can
    // reach a verdict, not just the monitor door's pm5 rows. Fix round
    // (review LOW-3): pinned to the ACTUAL computed state, not an
    // either/or — `elapsed = meters * 0.5` makes the reconstructed
    // `actualSplit` a fixed 250s/500m regardless of which repeated-block
    // occurrence `distanceIndex` lands on (`(meters*0.5/meters)*500 =
    // 250`, a mathematical identity, not a coincidence of THIS fixture's
    // numbers); "Filling Low"'s own `6K +4` target resolves to 124s/500m
    // under this file's `BASELINES` (`k6Seconds: 120`) — verified by
    // reading `buildRun`'s actual output for this exact fixture, not
    // assumed, and identical across all four `2000m @ 6k+4` occurrences
    // (the SAME authored offset repeats). 250 − 124 = +126s, nowhere near
    // the 0.5s band: genuinely SLOWER, not on-target.
    const measuredWorkRow = asMeasured(
      model.rows.find(
        (r) => r.measured && r.paceLabel === fmtSplit((elapsed / meters) * 500),
      ),
    );
    expect(measuredWorkRow.targetLabel).toBe(fmtSplit(124));
    expect(measuredWorkRow.onTarget).toBeUndefined();
    expect(measuredWorkRow.judged?.direction).toBe("slower");
    expect(measuredWorkRow.judged?.deviationSeconds).toBe(126);
    expect(measuredWorkRow.judged?.deviationLabel).toBe("+126.0");
  });

  it("no actuals recorded at all: every row is prescribed, the caption fires, TIME still reads wall-clock", () => {
    const run = sessionRunFixture("Filling Low");
    const draft = draftFor("Filling Low");
    const steps = buildLogSteps(run, draft);
    const model = buildSummaryModel({ door: "timer", run, steps });
    expect(model.caption).toBe("TARGETS ONLY · NOTHING MEASURED");
    // Phase WU deleted this case's `every(r => !r.measured || r.isWarmup)`
    // assertion — the field is gone and there is no warm-up row to except,
    // so the honest statement is simply that no row is measured.
    expect(model.rows.every((r) => !r.measured)).toBe(true);
    expect(model.heroes.time).toBeDefined();
    expect(model.heroes.avgSplit).toBeUndefined();
  });

  it("a TIME-kind leading step can NEVER be measured (nextDistance only ever writes an actual for a phase with `meters` set), so its row is prescribed and R-E's caption still fires", () => {
    // Phase WU: this was a TIME-kind WARM-UP SETTING, and the row it
    // produced was the measured-shaped-but-empty WARM-UP row that review
    // FIX-2 caught silently eating the caption. The same unmeasurable
    // leading step is an authored EASY time step now, and it renders in the
    // PRESCRIBED shape — which is why the caption fires for a plainer
    // reason than before, not a subtler one.
    const EASY_5MIN = {
      k: "w" as const,
      duration: { kind: "time" as const, minutes: 5 },
      ref: { effort: "min" as const },
    };
    const run = sessionRunFixture("Filling Low", EASY_5MIN);
    const draft = draftFor("Filling Low", EASY_5MIN);
    const steps = buildLogSteps(run, draft);
    const model = buildSummaryModel({ door: "timer", run, steps });
    expect(model.rows[0]!.measured).toBe(false);
    expect(model.rows[0]!.index).toBe(1);
    expect(model.caption).toBe("TARGETS ONLY · NOTHING MEASURED");
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

  it("a leading row whose actual reads exactly 0 elapsed seconds (degenerate): no measured row is produced at all", () => {
    // Phase WU: this measured the WARM-UP row's own floor behaviour —
    // `timerWarmupRow` returned a measured-shaped row with `timeLabel`
    // absent for a below-floor reading. That builder is gone; a degenerate
    // reading on an ordinary phase never reaches a row at all, because
    // `buildLogSteps` is what produces the timer door's rows and this
    // fixture passes it no steps. The floor itself
    // (`MIN_MEASURABLE_ELAPSED_SECONDS`) stays pinned on the monitor door
    // and on `timerAvgSplit` elsewhere in this file.
    const EASY_500 = {
      k: "w" as const,
      duration: { kind: "distance" as const, meters: 500 },
      ref: { effort: "min" as const },
    };
    const run = sessionRunFixture("Filling Low", EASY_500);
    const zeroOpener: SessionRun = {
      ...run,
      completedAt: new Date(NOW.getTime() + 60_000).toISOString(),
      actuals: {
        0: {
          elapsedSeconds: 0,
          splitSeconds: 0,
          actualSource: "stopwatch",
        },
      },
    };
    const model = buildSummaryModel({
      door: "timer",
      run: zeroOpener,
      steps: [],
    });
    expect(model.rows).toStrictEqual([]);
    expect(model.heroes.avgSplit).toBeUndefined();
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

  it("a TIME-based work step (Hoarfrost: 2×12' @ 6k+12) renders its duration as m:ss, not a meters suffix", () => {
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

describe("buildSummaryModel — Phase PW spec 2 §2: the model exports the numbers its strings were formatted from, per door", () => {
  // Pins the string-number pairing INSIDE the model — the one place spec
  // §2 says that derivation lives (`SummaryHeroes`'s own doc comment).
  // The storage round-trip through the real POST/GET wire is Task 1's own
  // contract test, not this one's job (brief §"Failing tests" bullet 1).

  it("monitor door (the walk-3 real-wire fixture): avgSplitSeconds/timeSeconds are present, and re-applying the documented formatters to them reproduces the display strings exactly", () => {
    const program: WorkoutProgram = {
      intervals: [
        interval({ kind: "time", value: 60, restSeconds: 0 }),
        interval({
          kind: "time",
          value: 60,
          targetSplit: 129,
          restSeconds: 30,
        }),
        interval({
          kind: "time",
          value: 120,
          targetSplit: 129,
          restSeconds: 30,
        }),
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
    const w2 = decodeActual(
      "06 00 00 00 00 00 b0 04 00 ad 01 00 1e 00 05 00 00 03",
      "06 00 00 1c 86 78 76 05 18 00 e4 02 f7 0d 80 00 65 03 00",
      2,
    );
    const run = monitorRun({ program, actuals: [wu, w1, w2] });
    const model = buildSummaryModel({ door: "monitor", run });

    expect(model.heroes.avgSplit).toBeDefined();
    expect(model.heroes.avgSplitSeconds).toBeDefined();
    expect(typeof model.heroes.avgSplitSeconds).toBe("number");
    expect(model.heroes.avgSplit).toBe(fmtSplit(model.heroes.avgSplitSeconds!));

    expect(model.heroes.time).toBeDefined();
    expect(model.heroes.timeSeconds).toBeDefined();
    expect(typeof model.heroes.timeSeconds).toBe("number");
    // §2's documented trap: the formatter takes MINUTES, not seconds.
    expect(model.heroes.time).toBe(fmtDuration(model.heroes.timeSeconds! / 60));
    // Proves the trap is real (§2's own documented gotcha): `fmtDuration`
    // takes MINUTES, so feeding it the raw SECONDS value unconverted reads
    // the number 60× too large (`fmtDuration` splits its argument into
    // h/m/s as minutes) and can only coincidentally match the correctly
    // divided string at `timeSeconds === 0`, which this fixture's own real
    // wire boundaries never produce. A mutation that drops the `/ 60` at
    // the read-back call site is exactly what this line catches.
    expect(model.heroes.timeSeconds).toBeGreaterThan(0);
    expect(fmtDuration(model.heroes.timeSeconds!)).not.toBe(model.heroes.time);
  });

  it("timer door (Filling Low, one real stopwatch reading): avgSplitSeconds/timeSeconds are present and agree with their strings; distanceMeters stays absent (no machine total on this door)", () => {
    const draft = draftFor("Filling Low");
    const run = sessionRunFixture("Filling Low");
    const distanceIndex = run.phases.findIndex(
      (p) => p.type === "work" && p.meters !== undefined,
    );
    expect(distanceIndex).toBeGreaterThanOrEqual(0);
    const meters = run.phases[distanceIndex]!.meters!;
    const elapsed = meters * 0.5;
    const measuredRun: SessionRun = {
      ...run,
      actuals: {
        [distanceIndex]: {
          elapsedSeconds: elapsed,
          splitSeconds: (elapsed / meters) * 500,
          actualSource: "stopwatch",
        },
      },
    };
    const steps: LogStep[] = buildLogSteps(measuredRun, draft);
    const model = buildSummaryModel({
      door: "timer",
      run: measuredRun,
      steps,
    });

    expect(model.heroes.avgSplit).toBeDefined();
    expect(typeof model.heroes.avgSplitSeconds).toBe("number");
    expect(model.heroes.avgSplit).toBe(fmtSplit(model.heroes.avgSplitSeconds!));

    expect(model.heroes.time).toBeDefined();
    expect(typeof model.heroes.timeSeconds).toBe("number");
    expect(model.heroes.time).toBe(fmtDuration(model.heroes.timeSeconds! / 60));

    expect(model.heroes.distanceMeters).toBeUndefined();
  });

  it("manual door (Calm Sea): no hero string means no hero number — heroes is `{}`, avgSplitSeconds/timeSeconds/distanceMeters all absent", () => {
    const w = library("Calm Sea");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    const model = buildSummaryModel({
      door: "manual",
      steps,
      dateIso: "2026-08-17T09:00:00.000Z",
    });
    expect(model.heroes.avgSplit).toBeUndefined();
    expect(model.heroes.avgSplitSeconds).toBeUndefined();
    expect(model.heroes.time).toBeUndefined();
    expect(model.heroes.timeSeconds).toBeUndefined();
    expect(model.heroes).toStrictEqual({});
  });
});

// ---------------------------------------------------------------------
// Phase LT spec 1, Task 2 — §1's row re-baseline: the band legs, the
// judged-when member set, the tule-fog regression pin, and the
// wire-scoping witness. §2's SPM cell lives in its own describe block
// below.
// ---------------------------------------------------------------------

describe("buildSummaryModel — §1's band legs, at the row level (dev +0.4 -> on-target; +0.6 -> slower; boundary exactly 0.5 -> on-target, both directions)", () => {
  // One hand-built pm5 actual per leg — `avgSplit` set directly (this
  // describe block is about the ROW PIPELINE's own band arithmetic, not
  // wire fidelity; the wire-scoping witness further down covers that
  // separately with real decoded boundaries). Target is a round 130s on
  // every leg; only `avgSplit` (the row's own measured pace) varies.
  function rowAt(avgSplit: number) {
    const actual: IntervalActual = {
      index: 0,
      elapsedSeconds: 130,
      distanceMeters: 500,
      avgSplit,
      avgSpm: null,
      avgHeartRateBpm: null,
      restDistanceMeters: 0,
    };
    const run = monitorRun({
      program: {
        intervals: [
          interval({ kind: "distance", value: 500, targetSplit: 130 }),
        ],
      },
      actuals: [actual],
    });
    return asMeasured(buildSummaryModel({ door: "monitor", run }).rows[0]);
  }

  it("dev +0.4s (130.4 vs 130 target): within the band — plain, onTarget true, no bar/±", () => {
    const row = rowAt(130.4);
    expect(row.onTarget).toBe(true);
    expect(row.judged).toBeUndefined();
  });

  it("dev +0.5s EXACTLY (130.5 vs 130): still on-target — the boundary is INCLUSIVE, documented here at the row level (`judgeBand.test.ts` pins the raw function; this pins the whole row pipeline)", () => {
    const row = rowAt(130.5);
    expect(row.onTarget).toBe(true);
    expect(row.judged).toBeUndefined();
  });

  it("dev +0.6s (130.6 vs 130): one tenth past the boundary — SLOWER, judged with a real bar/±", () => {
    const row = rowAt(130.6);
    expect(row.onTarget).toBeUndefined();
    expect(row.judged?.direction).toBe("slower");
    expect(row.judged?.deviationLabel).toBe("+0.6");
  });

  it("dev -0.5s EXACTLY (129.5 vs 130): still on-target — symmetric on the fast side", () => {
    const row = rowAt(129.5);
    expect(row.onTarget).toBe(true);
    expect(row.judged).toBeUndefined();
  });

  it("dev -0.6s (129.4 vs 130): one tenth past the boundary the other way — FASTER", () => {
    const row = rowAt(129.4);
    expect(row.onTarget).toBeUndefined();
    expect(row.judged?.direction).toBe("faster");
    expect(row.judged?.deviationLabel).toBe("−0.6");
  });
});

describe("buildSummaryModel — §1's judged-when member set (antagonist B4): targetSplit + (pm5 | stopwatch) only, never 'assumed'", () => {
  // The DIRECT, by-hand unit test the module's own `rowJudgment` doc
  // comment names: neither door builder can actually feed this function
  // an "assumed" step today (both gate MeasuredRow-ness on pm5/stopwatch
  // before a step ever reaches here), so this proves the guard on its
  // own terms rather than relying on that being an accident of two
  // unrelated gates lining up. Mirrors exactly how `logDraft.ts` builds
  // an assumed row (`:470`/`:552`): target and actual EQUAL, by
  // construction — if the guard were missing, this would read
  // "on-target" (or, against the OLD unbanded `judge()`, a tautological
  // "+0.0 slower") for a row that was never really measured at all.
  it("the by-hand fixture: an 'assumed' step with target === actual is NEVER judged, even though the numbers alone would read on-target", () => {
    const byHand = {
      targetSplit: 130,
      actualSplit: 130,
      actualSource: "assumed" as const,
    };
    expect(rowJudgment(byHand)).toStrictEqual({});
  });

  it("a genuinely unmeasured/untargeted 'assumed' step is also never judged (the ordinary case)", () => {
    expect(rowJudgment({ actualSource: "assumed" as const })).toStrictEqual({});
  });

  it("pm5 and stopwatch both judge when target+actual are both present — the two REAL member-set entries", () => {
    expect(
      rowJudgment({
        targetSplit: 130,
        actualSplit: 140,
        actualSource: "pm5",
      }).judged?.direction,
    ).toBe("slower");
    expect(
      rowJudgment({
        targetSplit: 130,
        actualSplit: 120,
        actualSource: "stopwatch",
      }).judged?.direction,
    ).toBe("faster");
  });

  it("no target, no actualSplit, or no source at all — every combination abstains", () => {
    expect(
      rowJudgment({ actualSplit: 130, actualSource: "pm5" }),
    ).toStrictEqual({}); // no target
    expect(
      rowJudgment({ targetSplit: 130, actualSource: "pm5" }),
    ).toStrictEqual({}); // no actual
    expect(rowJudgment({ targetSplit: 130, actualSplit: 130 })).toStrictEqual(
      {},
    ); // no source at all
  });

  // The real-fixture side of the same claim (recurring failure #3): a
  // manual-door session (every row `actualSource: "assumed"` or absent,
  // `buildManualLogSteps`'s own doc comment) NEVER produces a MeasuredRow
  // at all — `buildManualModel` renders every row prescribed
  // unconditionally — so `.judged`/`.onTarget` are structurally
  // unreachable on that door regardless of this guard, from a real
  // seeded library workout.
  it("manual door, a real library workout: every row is prescribed — no row shape here even HAS a .judged field to check", () => {
    const w = library("Calm Sea");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    const model = buildSummaryModel({
      door: "manual",
      steps,
      dateIso: "2026-08-17T09:00:00.000Z",
    });
    expect(model.rows.every((r) => !r.measured)).toBe(true);
  });
});

describe("buildSummaryModel — §2's SPM cell (measured/target pair, resolved by buildSpmCell)", () => {
  it("post-split, matched + in-band: both halves present and distinct", () => {
    const actual: IntervalActual = {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 250,
      avgSplit: 130,
      avgSpm: 24,
      avgHeartRateBpm: null,
      restDistanceMeters: 0,
    };
    const run = monitorRun({
      program: {
        intervals: [interval({ kind: "distance", value: 250, displaySpm: 20 })],
      },
      actuals: [actual],
    });
    const row = asMeasured(buildSummaryModel({ door: "monitor", run }).rows[0]);
    expect(row.spmCell).toStrictEqual({ measured: 24, target: 20 });
  });

  // Fix round (review LOW-2): the COMMONEST cell shape had no model-level
  // witness — an interval with no authored rate at all (`displaySpm:
  // null`, e.g. a bulk-imported/manual-entry workout with no `@<n>`
  // token) whose actual is still matched and in-band. `spm` is never set
  // at all in this case (`buildMonitorLogSteps`'s own `if (interval.
  // displaySpm !== null) step.spm = ...` guard), so the cell shows
  // measured-only — `24`, no `/ 22` — the same "absent halves drop" rule,
  // exercised on the target half this time rather than the measured one.
  it("post-split, matched + in-band, but NO authored target rate at all (displaySpm null): measured-only, target half absent — the commonest untargeted-rate shape", () => {
    const actual: IntervalActual = {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 250,
      avgSplit: 130,
      avgSpm: 24,
      avgHeartRateBpm: null,
      restDistanceMeters: 0,
    };
    const run = monitorRun({
      program: {
        intervals: [
          interval({ kind: "distance", value: 250, displaySpm: null }),
        ],
      },
      actuals: [actual],
    });
    const row = asMeasured(buildSummaryModel({ door: "monitor", run }).rows[0]);
    expect(row.spmCell).toStrictEqual({ measured: 24 });
  });

  it("post-split, matched but DROPPED (avgSpm null): neither half — absence over invention (Task 1's own §2 amendment)", () => {
    const actual: IntervalActual = {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 250,
      avgSplit: 130,
      avgSpm: null,
      avgHeartRateBpm: null,
      restDistanceMeters: 0,
    };
    const run = monitorRun({
      program: {
        intervals: [interval({ kind: "distance", value: 250, displaySpm: 20 })],
      },
      actuals: [actual],
    });
    const row = asMeasured(buildSummaryModel({ door: "monitor", run }).rows[0]);
    expect(row.spmCell).toBeUndefined();
  });

  it("unmatched interval (never reached): target only", () => {
    const run = monitorRun({
      program: {
        intervals: [interval({ kind: "distance", value: 250, displaySpm: 22 })],
      },
      actuals: [],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    const row = model.rows[0]!;
    if (row.measured) throw new Error("expected a prescribed row");
    // Unmatched intervals render PRESCRIBED (no spmCell field exists on
    // that shape at all) — the target still shows via the existing
    // `targetPaceLabel`/duration cells, unaffected by this task.
    expect(row.measured).toBe(false);
  });

  // `buildMonitorLogSteps` can no longer PRODUCE this shape (Task 1's §2
  // amendment made the discriminant sound by construction) and the
  // timer/manual doors already gate MeasuredRow-ness on `actualSource ===
  // "stopwatch"`, which a pm5-shaped step always fails — so no door
  // builder in this file can hand `buildSpmCell` a pre-split row today.
  // `buildSpmCell` is exported for exactly this reason (its own doc
  // comment): this is a genuinely old STORED shape (predating the
  // split), tested directly rather than through a door that structurally
  // cannot reach it any more.
  it("pre-split old row (buildSpmCell, direct): actualSource pm5, no actualSpm at all — spm is the OLD measured value, no target half, spmIsMeasured's own discriminant", () => {
    const oldRow: LogStep = {
      label: "old row",
      actualSource: "pm5",
      actualSplit: 130,
      actualSeconds: 60,
      spm: 26, // pre-split: this WAS the measured value
      // no actualSpm at all — the row-local discriminant's whole point
    };
    expect(buildSpmCell(oldRow)).toStrictEqual({ measured: 26 });
  });

  it("a pre-split row with no spm at all either: no cell — spmIsMeasured still reads true (actualSource pm5, actualSpm absent), but there is no measured number to show", () => {
    const oldRowNoSpm: LogStep = {
      label: "old row, no spm ever recorded",
      actualSource: "pm5",
      actualSplit: 130,
      actualSeconds: 60,
    };
    expect(buildSpmCell(oldRowNoSpm)).toBeUndefined();
  });

  // Final-review fix round (IMPORTANT finding): spec §2's floor row
  // promises "Existing stored zeros: rendered as absent (`> 0` read
  // guard)" — `logDraft.ts`'s own `MONITOR_SPM_MIN` comment names this
  // exact obligation ("existing stored zeros ... still read back as
  // `spm: 0` or `actualSpm: 0` verbatim") and deeds it to a later
  // renderer task. That guard was never written. A row saved BEFORE
  // `MONITOR_SPM_MIN` moved from 0 to 1 (the server still accepts a
  // written 0 from v0.12/v0.13 clients — pre-dating this floor) is
  // exactly the pre-split shape `spmIsMeasured` reads as measured:
  // `actualSource: "pm5"`, no `actualSpm`, `spm: 0`. Before this fix,
  // `buildSpmCell` returned `{ measured: 0 }` for it, which a real
  // renderer paints as "0" — a measured stroke rate that was never
  // really measured, the wrong-number class this whole phase exists to
  // kill.
  it("pre-split stored row with spm: 0 (old floor, pre-dates MONITOR_SPM_MIN=1): rendered as absent, never {measured: 0}", () => {
    const oldZeroRow: LogStep = {
      label: "old row, zero under the old floor",
      actualSource: "pm5",
      actualSplit: 130,
      actualSeconds: 60,
      spm: 0,
    };
    expect(buildSpmCell(oldZeroRow)).toBeUndefined();
  });

  // The guard applies to BOTH halves, not just the pre-split measured
  // one — a zero TARGET is equally not a rate. A live monitor row can
  // never carry `actualSpm: 0` (`buildMonitorLogSteps` only ever writes
  // `actualSpm` when `avgSpm >= MONITOR_SPM_MIN` (1), so the measured
  // half of a POST-split row is unreachable-zero by construction — the
  // write floor already forbids it, which is why this leg only needs to
  // prove the target half, and confirms an in-band `actualSpm` survives
  // the guard unclipped rather than being accidentally treated as
  // falsy). Nothing else ever guarded the target half, so an old
  // stored `spm: 0` alongside a real `actualSpm` is the one shape that
  // proves the target leg of the fix independently of the pre-split leg
  // above.
  it("post-split row with a zero TARGET (spm: 0) alongside a real measured actualSpm: target half absent, measured half untouched", () => {
    const zeroTargetRow: LogStep = {
      label: "zero target, real measurement",
      actualSource: "pm5",
      actualSpm: 24,
      spm: 0,
    };
    expect(buildSpmCell(zeroTargetRow)).toStrictEqual({ measured: 24 });
  });
});

// ---------------------------------------------------------------------
// §6.1: THE TULE-FOG REGRESSION PIN. James's own session (the report that
// opened this spec): targets 2:17.0/2:16.0/2:15.0 (137/136/135s), actuals
// 2:14.9/2:13.4/2:11.5 (134.9/133.4/131.5s) — every actual FASTER than its
// own target, yet the OLD screen (working-average baseline) painted two
// of the three rows red. Built through `buildMonitorLogSteps` from a real
// `MonitorRun` shape (never a hand-built `LogStep[]` — the exit
// criterion's own requirement), since no committed recording of this
// exact session exists yet (§6.1's own "asked, not assumed" clause —
// nothing to replay). `avgSplit` is set directly per actual (the pin is
// about the JUDGMENT baseline, not wire decoding); `distanceMeters: 500`
// on every leg makes `elapsedSeconds === avgSplit` an exact, self-
// consistent 500m-split identity rather than an arbitrary unrelated pair.
// ---------------------------------------------------------------------

describe("buildSummaryModel — §6.1 THE TULE-FOG REGRESSION PIN (James's own session, re-baselined)", () => {
  it("three rows, every one faster than ITS OWN target: renders THREE BLUE (faster) rows, −2.1/−2.6/−3.5 — the screen that made him file the report now agrees with him", () => {
    const targets = [137, 136, 135]; // 2:17.0 / 2:16.0 / 2:15.0
    const actualSplits = [134.9, 133.4, 131.5]; // 2:14.9 / 2:13.4 / 2:11.5
    const actuals: IntervalActual[] = actualSplits.map((avgSplit, i) => ({
      index: i,
      elapsedSeconds: avgSplit, // distanceMeters 500 below -> exact 500m-split identity
      distanceMeters: 500,
      avgSplit,
      avgSpm: null,
      avgHeartRateBpm: null,
      restDistanceMeters: 0,
    }));
    const run = monitorRun({
      program: {
        intervals: targets.map((targetSplit) =>
          interval({ kind: "distance", value: 500, targetSplit }),
        ),
      },
      actuals,
    });

    const model = buildSummaryModel({ door: "monitor", run });
    expect(model.rows).toHaveLength(3);

    const expectedDeviations = [-2.1, -2.6, -3.5];
    model.rows.forEach((r, i) => {
      const row = asMeasured(r);
      expect(row.paceLabel).toBe(fmtSplit(actualSplits[i]!));
      expect(row.targetLabel).toBe(fmtSplit(targets[i]!));
      expect(row.onTarget).toBeUndefined(); // every deviation is well outside the 0.5s band
      expect(row.judged?.direction).toBe("faster");
      expect(row.judged?.deviationSeconds).toBeCloseTo(
        expectedDeviations[i]!,
        5,
      );
      expect(row.judged?.deviationLabel).toBe(
        `−${Math.abs(expectedDeviations[i]!).toFixed(1)}`,
      );
    });
  });
});

// ---------------------------------------------------------------------
// §6.3b: THE WIRE-SCOPING PROOF. `docs/monitor/sessions/walk-2026-08-18-
// metrics/` — the Phase CM exit walk's own "first varied-target
// rest-bearing capture" (that walk's README): a real 3-interval pyramid
// (300m 6K@22, 700m 6K-4@24, 300m 6K+4@22 — DISTINCT distances/rates per
// interval, so a scoping error can never hide behind two identical
// numbers). Decoded here with the SAME parser functions the driver calls
// (this file's own `decodeActual`, established in the oracle-bytes
// describe block above), never re-derived. Two of the three decoded
// values are independently cross-checked against the walk's own
// PHOTOGRAPHED numbers (README's Criterion 3: "Interval 2 · 2:11.7 ave
// /500m", and the summary's own row 3 "2:19.1") — an external oracle, not
// just internal self-consistency (recurring failure #11's own lesson).
//
// RED-PROVABLE BY MIS-SCOPING THE INDEX: swapping which decoded boundary
// gets which `normalizedIndex` (e.g. handing boundary 2's bytes
// `index: 2` instead of `1`) changes which row each `paceLabel`/`spmCell`
// lands on — every assertion below is keyed to a DISTINCT per-interval
// number (300/700/300m, 130.3/131.7/139.1s, 29/27/27 spm, 22/24/22
// target rate) specifically so a mis-scoped index fails at least one of
// them. Performed as this task's own self-mutation pass (task-2-
// report.md), not committed as a permanent second test — the assertions
// below ARE the proof; the mutation is what confirms they bite.
// ---------------------------------------------------------------------

describe("buildSummaryModel — §6.3b THE WIRE-SCOPING PROOF (the pyramid capture, walk-2026-08-18-metrics)", () => {
  it("the committed capture's own boundary bytes appear verbatim (review finding 6's own pattern, applied to a gzipped capture)", () => {
    const text = readGzSessionFile(
      "walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz",
    );
    for (const hex of [
      "06 00 00 02 00 00 0e 03 00 2c 01 00 3c 00 20 00 01 01",
      "06 00 00 1d 6c 6c 17 05 12 00 4c 03 fc 0e 9e 00 65 01 00",
      "03 00 00 09 00 00 34 07 00 bc 02 00 3c 00 0f 00 01 02",
      "03 00 00 1b 6c 6c 25 05 2a 00 3b 03 d4 0e 99 00 65 02 00",
      "a0 20 00 b8 0b 00 43 03 00 2c 01 00 00 00 00 00 01 03",
      "a0 20 00 1b 00 00 6f 05 12 00 ea 02 08 0e 82 00 65 03 00",
    ]) {
      expect(text).toContain(hex);
    }
  });

  it("each row carries its OWN interval's decoded distance/pace/SPM — never a neighbor's (the scoping proof itself)", () => {
    const b1 = decodeActual(
      "06 00 00 02 00 00 0e 03 00 2c 01 00 3c 00 20 00 01 01",
      "06 00 00 1d 6c 6c 17 05 12 00 4c 03 fc 0e 9e 00 65 01 00",
      0,
    );
    const b2 = decodeActual(
      "03 00 00 09 00 00 34 07 00 bc 02 00 3c 00 0f 00 01 02",
      "03 00 00 1b 6c 6c 25 05 2a 00 3b 03 d4 0e 99 00 65 02 00",
      1,
    );
    const b3 = decodeActual(
      "a0 20 00 b8 0b 00 43 03 00 2c 01 00 00 00 00 00 01 03",
      "a0 20 00 1b 00 00 6f 05 12 00 ea 02 08 0e 82 00 65 03 00",
      2,
    );
    // Decoded once, pinned here so a future re-decode (or a mis-scoped
    // index during the self-mutation pass) is caught against a fixed,
    // independently-recorded set of numbers, not against itself.
    expect([
      b1.distanceMeters,
      b2.distanceMeters,
      b3.distanceMeters,
    ]).toStrictEqual([300, 700, 300]);
    expect([b1.avgSplit, b2.avgSplit, b3.avgSplit]).toStrictEqual([
      130.3, 131.7, 139.1,
    ]);
    expect([b1.avgSpm, b2.avgSpm, b3.avgSpm]).toStrictEqual([29, 27, 27]);

    const run = monitorRun({
      program: {
        intervals: [
          interval({ kind: "distance", value: 300, displaySpm: 22 }),
          interval({ kind: "distance", value: 700, displaySpm: 24 }),
          interval({ kind: "distance", value: 300, displaySpm: 22 }),
        ],
      },
      actuals: [b1, b2, b3],
    });
    const model = buildSummaryModel({ door: "monitor", run });
    const [row1, row2, row3] = model.rows.map((r) => asMeasured(r));

    // External oracle (README's own photographed numbers, digit-
    // identical — Criterion 3's rest-2 photo and the summary's own row 3):
    expect(row2!.paceLabel).toBe("2:11.7");
    expect(row3!.paceLabel).toBe("2:19.1");
    // The third (row1) has no photographed twin in the README, so it's
    // pinned against the independently-decoded value above instead.
    expect(row1!.paceLabel).toBe(fmtSplit(130.3));

    // SPM: measured half scoped per row (29/27/27 — rows 2 and 3 share a
    // measured value, which is exactly why distance/pace above are what
    // actually prove the scoping; SPM alone couldn't distinguish them).
    expect(row1!.spmCell?.measured).toBe(29);
    expect(row2!.spmCell?.measured).toBe(27);
    expect(row3!.spmCell?.measured).toBe(27);
    // Target half scoped per row too (22/24/22 — rows 1 and 3 share a
    // target, disambiguated by distance/pace instead).
    expect(row1!.spmCell?.target).toBe(22);
    expect(row2!.spmCell?.target).toBe(24);
    expect(row3!.spmCell?.target).toBe(22);
  });
});

// ---------------------------------------------------------------------
// THE MEASURED-ANYTHING RULE (Phase LM PR 1 Task 3)
//
// ONE rule, three CALLERS holding three different shapes. The connected
// surface's lost banner counts `IntervalActual`s; `monitorWorkRows` judges
// a `LogStep`; `targetsOnlyCaption` judges already-built `SummaryRow`s.
// Before this task the first of those did not exist, and the obvious way
// to write it — "any actual at all" — disagrees with the other two on a
// sub-second reading: the banner would tell a rower two intervals were
// kept while the summary screen for the very same run says TARGETS ONLY ·
// NOTHING MEASURED. The tests below are the ADAPTERS CHECKED AGAINST EACH
// OTHER, on one fixture, in both directions.
// ---------------------------------------------------------------------

/** A REAL library workout's compiled program (the seeded 300's "Filling
 *  Low" — an easy opener plus 2000 m reps), so the rule is exercised
 *  against production interval shapes rather than a hand-built pair. */
function libraryProgram(title: string): WorkoutProgram {
  const w = library(title);
  const draft = buildDraft({
    id: `id-${title}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const compiled = compileProgram(buildRun(draft, BASELINES, NOW).phases);
  if ("code" in compiled) {
    throw new Error(`fixture failed to compile: ${compiled.code}`);
  }
  return compiled;
}

describe("the measured-anything rule, one rule across three shapes", () => {
  const PROGRAM = libraryProgram("Filling Low");

  /** An actual for `PROGRAM`'s interval `index`, rowed for exactly
   *  `elapsedSeconds`. Everything else is a plausible reading off the same
   *  interval — the only variable under test is the elapsed time. */
  function actualOf(index: number, elapsedSeconds: number): IntervalActual {
    const iv = PROGRAM.intervals[index]!;
    return {
      index,
      elapsedSeconds,
      distanceMeters: iv.kind === "distance" ? iv.value : 250,
      avgSplit: iv.targetSplit ?? 132,
      avgSpm: iv.displaySpm ?? 22,
      avgHeartRateBpm: 158,
      restDistanceMeters: 0,
    };
  }

  function captionFor(actuals: IntervalActual[]): string | undefined {
    return buildSummaryModel({
      door: "monitor",
      run: monitorRun({ program: PROGRAM, actuals }),
    }).caption;
  }

  it("counts the intervals a rower actually rowed — two real readings are two kept intervals, and the summary agrees they were measured", () => {
    const actuals = [actualOf(0, 480), actualOf(1, 428.4)];
    expect(measuredIntervalCount(actuals)).toBe(2);
    expect(captionFor(actuals)).toBeUndefined();
  });

  it("counts nothing when nothing was reported: no actuals at all", () => {
    expect(measuredIntervalCount([])).toBe(0);
    expect(captionFor([])).toBe("TARGETS ONLY · NOTHING MEASURED");
  });

  // THE DISAGREEMENT THIS RULE EXISTS TO PREVENT. A naive "actuals.length"
  // banner says TWO intervals were kept here; the summary screen for the
  // same run says NOTHING MEASURED. Both cannot be right, and the rower
  // meets both.
  it("a sub-second reading is kept by neither: the banner's count and the summary's caption cannot disagree", () => {
    const actuals = [actualOf(0, 0.4), actualOf(1, 0.9)];
    expect(measuredIntervalCount(actuals)).toBe(0);
    expect(captionFor(actuals)).toBe("TARGETS ONLY · NOTHING MEASURED");
  });

  // The floor itself, from both sides, on the one value where a `>` and a
  // `>=` disagree.
  it("the floor is inclusive on both sides of the adapter: exactly one second counts, a hair under does not", () => {
    expect(measuredIntervalCount([actualOf(0, 1)])).toBe(1);
    expect(captionFor([actualOf(0, 1)])).toBeUndefined();
    expect(measuredIntervalCount([actualOf(0, 0.999)])).toBe(0);
    expect(captionFor([actualOf(0, 0.999)])).toBe(
      "TARGETS ONLY · NOTHING MEASURED",
    );
  });

  it("a mixed set counts only the real readings, and the summary still calls the run measured", () => {
    const actuals = [actualOf(0, 0.5), actualOf(1, 428.4)];
    expect(measuredIntervalCount(actuals)).toBe(1);
    expect(captionFor(actuals)).toBeUndefined();
  });

  // THE LOG-STEP ADAPTER, against the same rule the row builder already
  // used — `isMonitorRowMeasurable` is now that rule plus an adapter, so
  // this pins that a hand-logged row can never be counted as a monitor
  // reading no matter how long it ran.
  it("provenance is half the rule: a stopwatch reading of the same length is not a measured monitor reading", () => {
    expect(
      isMeasuredReading(
        readingOfLogStep({
          label: "x",
          actualSource: "pm5",
          actualSeconds: 60,
        }),
      ),
    ).toBe(true);
    expect(
      isMeasuredReading(
        readingOfLogStep({
          label: "x",
          actualSource: "stopwatch",
          actualSeconds: 60,
        }),
      ),
    ).toBe(false);
    expect(
      isMeasuredReading(readingOfLogStep({ label: "x", actualSeconds: 60 })),
    ).toBe(false);
  });
});
