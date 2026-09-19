import { describe, expect, it } from "vitest";
import { parseRecording } from "../monitor/transports/recording.js";
import { createReplayTransport } from "../monitor/transports/replay.js";
import { createSubscribedDriver } from "../test/statusSubscriptions";
import { createEventLog } from "../monitor/eventLog.js";
import { createSeriesRecorder } from "../monitor/seriesRecorder.js";
import type { Sample, SeriesData } from "../monitor/seriesRecorder.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { fmtSplit } from "../../domain/format.js";
import { readCapture } from "../test/captures";
import { buildTrace } from "./traceModel.js";

// ---------------------------------------------------------------------
// Real-wire replay helper — trace-truth Task 1's own harness idiom
// (`seriesRecorder.test.ts`'s `loadCaptureFrames`, re-derived here per this
// project's own "each test file owns its own copy" convention rather than
// imported from a sibling test file), trimmed to this suite's own need: a
// real `SeriesData` to hand `buildTrace`.
//
// This file used to also replay `pm5-session4b-final.log.gz` (a legacy,
// GZIPPED diagnostics log covering FOUR concatenated real sessions) for its
// own "genuine wire gap" and "26%-of-samples sentinel" evidence. Removed by
// trace-truth Task 1, not migrated — the SAME reasoning
// `seriesRecorder.test.ts`'s own removed "H1 fix round" section documents:
// this recorder's key is monotonic non-decreasing FOR THE LIFETIME OF ONE
// recorder instance (spec §2), matching `driver.ts`'s own one-run-per-
// `program()` scoping, and four sessions concatenated through one recorder
// is not a scenario the production wiring (one `createSeriesRecorder()` per
// connected session, Task 2 of the series-capture spec) ever produces. The
// step-3 capture below still proves the real gap/rest/sentinel claims this
// file's remaining tests need, using ONLY realistic, single-session input.
// ---------------------------------------------------------------------

/** Drives a committed `.jsonl` capture through the PRODUCTION parser and
 *  driver, collecting every emitted `MonitorFrame` — see
 *  `seriesRecorder.test.ts`'s own `loadCaptureFrames` for the full
 *  reasoning (never `replayFrames`'s hand-rolled, always-null-
 *  `intervalIndex` parse: this recorder cannot fold a boundary on a key
 *  that never changes). */
async function loadCaptureFrames(
  walkDir: string,
  file: string,
  programOverride?: WorkoutProgram,
): Promise<MonitorFrame[]> {
  const text = readCapture(walkDir, file);
  const parsed = parseRecording(text);
  const program = programOverride ?? parsed.header.program;
  if (!program) {
    throw new Error(
      `loadCaptureFrames: ${walkDir}/${file} carries no header.program and no programOverride was given`,
    );
  }

  const replay = createReplayTransport(parsed);
  const [dev] = await replay.transport.scan();
  await replay.transport.connect(dev.id);

  const log = createEventLog();
  const driver = createSubscribedDriver(replay.transport, log, {
    deviceName: dev.name,
    now: () => replay.clock.now(),
    schedule: (cb, ms) => replay.clock.schedule(cb, ms),
  });

  const frames: MonitorFrame[] = [];
  driver.events((e) => {
    if (e.kind === "frame") frames.push(e.frame);
  });

  const programPending = driver.program(program);
  await replay.run();
  await programPending;

  return frames;
}

function seriesFromFrames(frames: MonitorFrame[]): SeriesData {
  const rec = createSeriesRecorder();
  for (const f of frames) rec.onFrame(f);
  const series = rec.snapshot();
  if (!series) throw new Error("replay produced no series");
  return series;
}

const STEP3_WALK_DIR = "walk-2026-08-17";
const STEP3_FILE = "step-3-pm5-recording-second-rest-1786973713929.jsonl";

/** `seriesRecorder.test.ts`'s own `SESSION_2_PROGRAM` (walk-2026-08-16,
 *  hand-transcribed — no `header.program` on this recording). Duplicated
 *  here per this file's own "each test file owns its own copy"
 *  convention, stated in the file-header comment above. */
const SESSION_2_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      // Phase WU: this interval was transcribed `type: "warmup"` from the
      // capture; the union has no such member now, so it reads `work`.
      // Nothing else about it changes — the recorded tx bytes carry no
      // warm-up concept at all (the PM5 has none), so the transcription is
      // as faithful as it was.
      type: "work",
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

describe("buildTrace — §7.2 the sentinel rule, proven against a REAL capture", () => {
  it("step-3 (wu 1:00 r0 + 1:00 r30, a real belted walk): every p===0 sample is excluded from both the drawn points and domainY", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(STEP3_WALK_DIR, STEP3_FILE),
    );
    // Ground this test depends on, pinned exactly (also independently
    // pinned by seriesRecorder.test.ts's own oracle for this capture).
    expect(series.samples).toHaveLength(243);
    const zeroSamples = series.samples.filter((s) => s.p === 0);
    expect(zeroSamples).toHaveLength(5);

    const trace = buildTrace(series, "pace");
    expect(trace).not.toBeNull();

    const drawnX = trace!.points.flat().map((p) => p.x);
    expect(drawnX).toHaveLength(243 - 5);
    for (const s of zeroSamples) {
      expect(drawnX).not.toContain(s.t / 10);
    }

    // domainY's low edge (the FAST end, since pace inverts) is set by a
    // REAL reading — never by the sentinel, which would read as 0 s/500m,
    // "infinitely fast" on a faster-is-up axis (§2).
    expect(trace!.domainY[0]).toBeGreaterThan(0);
  });

  it("step-3: the SAME rule for the rate channel — every spm===0 sample is excluded from both the drawn points and domainY (11 of 243 samples read spm===0 in this capture)", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(STEP3_WALK_DIR, STEP3_FILE),
    );
    const zeroSpmSamples = series.samples.filter((s) => s.spm === 0);
    // Pinned exactly, not "some" — a real count on this real capture, the
    // same evidentiary bar the pace sentinel test above sets. Both fields
    // share one exclusion code path (`realReadings`'s `switch`) with full
    // branch coverage, but coverage alone never pins a REAL number —
    // this is the rate channel's own witness of that.
    expect(zeroSpmSamples).toHaveLength(11);

    const rateTrace = buildTrace(series, "rate");
    expect(rateTrace).not.toBeNull();

    const drawnX = rateTrace!.points.flat().map((p) => p.x);
    expect(drawnX).toHaveLength(243 - 11);
    for (const s of zeroSpmSamples) {
      expect(drawnX).not.toContain(s.t / 10);
    }

    // A stroke-rate sentinel would read as 0 spm — a real, low, but
    // finite value; domainY's low edge still comes from the lowest REAL
    // reading in this capture, never the sentinel floor.
    expect(rateTrace!.domainY[0]).toBeGreaterThan(0);
  });
});

describe("buildTrace — §3/§7.1 domainY: the full range of real readings, no clipping", () => {
  it("step-3's pace domain fully contains the real min/max split, never clipped toward either end", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(STEP3_WALK_DIR, STEP3_FILE),
    );
    const realPaceTenths = series.samples
      .filter((s) => s.p !== 0)
      .map((s) => s.p);
    const minSeconds = Math.min(...realPaceTenths) / 10;
    const maxSeconds = Math.max(...realPaceTenths) / 10;

    const trace = buildTrace(series, "pace")!;
    expect(trace.domainY[0]).toBeLessThanOrEqual(minSeconds);
    expect(trace.domainY[1]).toBeGreaterThanOrEqual(maxSeconds);
  });
});

describe("buildTrace — 2026-08-20: rest samples are drawn but excluded from the vertical domain", () => {
  function sample(over: Partial<Sample> = {}): Sample {
    return Object.freeze({ t: 0, d: 0, p: 0, spm: 0, ...over }) as Sample;
  }

  // Real-capture regression for the reported bug: session-2's rests
  // genuinely advance (non-frozen, James's own real paddling) and reach
  // pace well outside the WORK range on this exact capture — the same
  // shape as the 2026-08-20 photographed session (rests 5:00+/500m
  // stretching a work range of ~2s into a flat line).
  it("session-2-wu-4unequal (a real non-frozen-rest capture): domainY is bounded by WORK readings only, never by the rest excursion", async () => {
    const frames = await loadCaptureFrames(
      "walk-2026-08-16",
      "session-2-wu-4unequal.jsonl",
      SESSION_2_PROGRAM,
    );
    const series = seriesFromFrames(frames);

    const workTenths = series.samples
      .filter((s) => s.p !== 0 && s.r !== true)
      .map((s) => s.p);
    const restTenths = series.samples
      .filter((s) => s.p !== 0 && s.r === true)
      .map((s) => s.p);
    // Ground this test depends on: the capture really does carry a rest
    // excursion outside the work range (measured, not assumed).
    const workMaxSeconds = Math.max(...workTenths) / 10;
    const restMaxSeconds = Math.max(...restTenths) / 10;
    expect(restTenths.length).toBeGreaterThan(0);
    expect(restMaxSeconds).toBeGreaterThan(workMaxSeconds);

    const trace = buildTrace(series, "pace")!;
    expect(trace).not.toBeNull();
    // The domain still fully contains the WORK range (§3's original
    // "no clipping" rule, unchanged for the population it now applies
    // to) ...
    expect(trace.domainY[1]).toBeGreaterThanOrEqual(workMaxSeconds);
    // ... but must NOT be stretched out to the rest excursion — the bug
    // being fixed. If domainY still counted rest, this would be >= the
    // rest max instead.
    expect(trace.domainY[1]).toBeLessThan(restMaxSeconds);

    // The rest points are still DRAWN (never hidden) — present in the
    // model, each marked, with its real (un-clipped-in-the-model) value.
    const restPoints = trace.points.flat().filter((p) => p.rest);
    expect(restPoints.length).toBe(restTenths.length);
    expect(Math.max(...restPoints.map((p) => p.y))).toBeCloseTo(
      restMaxSeconds,
      5,
    );
  });

  it("a rest excursion far outside a synthetic work range does not stretch domainY, on a hand-built minimum series", () => {
    const series: SeriesData = {
      samples: [
        sample({ t: 0, p: 1180 }), // 118.0 s/500m, work
        sample({ t: 1, p: 1190 }), // 119.0 s/500m, work
        sample({ t: 2, p: 1185 }), // 118.5 s/500m, work
        sample({ t: 3, p: 3600, r: true }), // 360.0 s/500m rest excursion
        sample({ t: 4, p: 1180 }),
      ],
    };
    const trace = buildTrace(series, "pace")!;
    expect(trace).not.toBeNull();
    // Contains the work range (118.0-119.0), padded outward — but
    // nowhere near the 360.0 s/500m rest excursion, which would have
    // pushed domainY[1] well past 300 if it still counted.
    expect(trace.domainY[0]).toBeLessThanOrEqual(118.0);
    expect(trace.domainY[1]).toBeGreaterThanOrEqual(119.0);
    expect(trace.domainY[1]).toBeLessThan(200);
    const restPoint = trace.points.flat().find((p) => p.rest);
    expect(restPoint).toBeDefined();
    expect(restPoint!.y).toBe(360); // still drawn at its real value
  });

  it("edge case: every real reading is a rest — no work data to scale by, so the measure does not draw (same per-measure absence idiom as the too-little-to-draw gate)", () => {
    const series: SeriesData = {
      samples: [
        sample({ t: 0, p: 1200, r: true }),
        sample({ t: 1, p: 1210, r: true }),
        sample({ t: 2, p: 1190, r: true }),
      ],
    };
    expect(buildTrace(series, "pace")).toBeNull();
  });

  it("edge case: only 1 work reading for the measure (below domainFromReadings' own 2-value floor), even though total real readings clear MIN_REAL_READINGS", () => {
    const series: SeriesData = {
      samples: [
        sample({ t: 0, p: 1200 }), // the lone work reading
        sample({ t: 1, p: 1300, r: true }),
        sample({ t: 2, p: 1310, r: true }),
      ],
    };
    expect(buildTrace(series, "pace")).toBeNull();
  });
});

describe("buildTrace — §3/§7.4 the line breaks across a REAL gap, never across a rest", () => {
  // `pm5-session4b-final.log.gz`'s own "genuine ~41.5s wire gap" test was
  // removed here, not migrated — the same multi-session-concatenation
  // reasoning this file's own top-of-file comment records (and
  // `seriesRecorder.test.ts`'s own removed "H1 fix round" section
  // documents in full): that capture is four real sessions concatenated
  // through one recorder, a scenario the new key-based accumulator does
  // not support (its key is monotonic non-decreasing for one recorder's
  // whole lifetime), so the specific gap position/magnitude this test
  // pinned (t=1147.3 -> t=1188.8, 41.5s) no longer holds — not because the
  // line-break logic in THIS module is wrong, but because the input
  // recorder no longer produces that shape from that (invalid) input. No
  // replacement capture proving a real >3s gap was substituted; that
  // evidence is owed to a future task if this module's own gap-break
  // behavior needs a real-capture witness again.
  it("step-3: heart rate (no sentinel exclusions of its own in this capture, since every sample carries hr) draws as ONE unbroken segment straight through BOTH interval boundaries, including the 30s rest", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(STEP3_WALK_DIR, STEP3_FILE),
    );
    const trace = buildTrace(series, "hr")!;
    expect(trace.points).toHaveLength(1);
    // All 243 samples carry hr when replayed through the REAL driver
    // (trace-truth Task 1 finding, `seriesRecorder.test.ts`'s own hr
    // presence "real leg" test): the driver's run only opens after
    // `verifyArmed()` confirms it, so the FIRST 0x0031 this recorder ever
    // sees already trails the capture's first-ever 0x0032 arrival — unlike
    // `replayFrames`'s naive one-frame-per-0x0031 parse, which emitted a
    // frame for that pre-run-open 0x0031 too and therefore missed hr on
    // it. This is a harness-fidelity correction, not a behavior change.
    expect(trace.points[0]).toHaveLength(243);

    // The rest's own boundary sits at work-clock t ~= 119.77s (the wu's
    // own r0 boundary at ~59.77s precedes it, independently located the
    // same way seriesRecorder.test.ts's own oracle does: the immediately
    // preceding frame's elapsedSeconds folded onto the running base) — no
    // consecutive HR readings straddling EITHER boundary, checked as two
    // separate windows so the check cannot accidentally span the 60s of
    // real session time between them, are more than the recorder's own
    // ~1s decimation cadence apart. Proves neither transition (least of
    // all the one immediately after a real 30s rest) opens a gap.
    for (const [lo, hi] of [
      [55, 65],
      [115, 125],
    ] as const) {
      const window = trace.points[0]!.filter((p) => p.x > lo && p.x < hi);
      expect(window.length).toBeGreaterThan(2);
      for (let i = 1; i < window.length; i++) {
        expect(window[i]!.x - window[i - 1]!.x).toBeLessThan(2);
      }
    }
  });
});

describe("buildTrace — §3 pace inverts (faster is up), rate/hr do not", () => {
  it("on a real capture", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(STEP3_WALK_DIR, STEP3_FILE),
    );
    expect(buildTrace(series, "pace")!.invert).toBe(true);
    expect(buildTrace(series, "rate")!.invert).toBe(false);
    expect(buildTrace(series, "hr")!.invert).toBe(false);
  });
});

describe("buildTrace — §5's text alternative: real values, direction, no boundary claim", () => {
  it("pace summary on step-3 names the measure, the session's first/last real reading, its fastest split, the segment count, and the rest clause — never the word 'interval'", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(STEP3_WALK_DIR, STEP3_FILE),
    );
    const trace = buildTrace(series, "pace")!;
    // First/last/fastest real readings independently derived from the
    // capture, not hand-copied constants.
    const realPace = series.samples.filter((s) => s.p !== 0).map((s) => s.p);
    const firstSeconds = realPace[0]! / 10;
    const lastSeconds = realPace[realPace.length - 1]! / 10;
    const fastestSeconds = Math.min(...realPace) / 10;
    // Rest-run count, independently derived from the capture's own
    // samples (never hand-copied): step-3's own TRAILING rest (its
    // capture ends mid-rest, `seriesRecorder.ts`'s own corrected header
    // comment) contributes 1 run of its own — F-3 review round 2.
    let restRuns = 0;
    let inRun = false;
    for (const s of series.samples) {
      if (s.r === true) {
        if (!inRun) restRuns++;
        inRun = true;
      } else {
        inRun = false;
      }
    }
    const restClause =
      restRuns > 0
        ? `, ${restRuns} rest ${restRuns === 1 ? "span" : "spans"} marked`
        : "";

    expect(trace.summary).toBe(
      `Pace, ${fmtSplit(firstSeconds)} at the start to ${fmtSplit(lastSeconds)} at the end, fastest ${fmtSplit(fastestSeconds)}, in ${trace.points.length} segments${restClause}`,
    );
    expect(trace.points.length).toBeGreaterThan(1); // the clause is exercised, not vacuous
    expect(restRuns).toBe(1); // step-3's own trailing rest, ground truth
    expect(trace.summary.toLowerCase()).not.toContain("interval");
  });

  it("hr summary on step-3 carries no segment clause, since the line never breaks", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(STEP3_WALK_DIR, STEP3_FILE),
    );
    const trace = buildTrace(series, "hr")!;
    expect(trace.points).toHaveLength(1);
    expect(trace.summary.startsWith("Heart rate, ")).toBe(true);
    expect(trace.summary).not.toContain("segment");
    expect(trace.summary.toLowerCase()).not.toContain("interval");
  });
});

describe("buildTrace — the per-measure too-little-to-draw gate and other absence cases", () => {
  function sample(over: Partial<Sample> = {}): Sample {
    return Object.freeze({ t: 0, d: 0, p: 0, spm: 0, ...over }) as Sample;
  }

  it("returns null when there is no series at all (§1's absence idiom)", () => {
    expect(buildTrace(undefined, "pace")).toBeNull();
  });

  it("returns null for a measure with only 2 real readings, even though domainFromReadings' own floor (2) would accept them — this module's own higher, per-measure gate", () => {
    const series: SeriesData = {
      samples: [sample({ t: 0, p: 120 }), sample({ t: 10, p: 118 })],
    };
    expect(buildTrace(series, "pace")).toBeNull();
  });

  it("3 real readings clears the gate", () => {
    const series: SeriesData = {
      samples: [
        sample({ t: 0, p: 120 }),
        sample({ t: 10, p: 118 }),
        sample({ t: 20, p: 116 }),
      ],
    };
    expect(buildTrace(series, "pace")).not.toBeNull();
  });

  it("the gate is applied PER MEASURE: pace clears it while hr (no samples carry the key) does not, on the SAME series", () => {
    const series: SeriesData = {
      samples: [
        sample({ t: 0, p: 120, hr: 140 }),
        sample({ t: 10, p: 118 }),
        sample({ t: 20, p: 116 }),
      ],
    };
    expect(buildTrace(series, "pace")).not.toBeNull();
    expect(buildTrace(series, "hr")).toBeNull();
  });
});

describe("buildTrace — trace-truth Task 2: rests are marked on the point, not folded into a gap (spec §3)", () => {
  it("marks trace points recorded during a rest", () => {
    const series = {
      samples: [
        { t: 10, d: 40, p: 1200, spm: 20, r: undefined },
        { t: 20, d: 45, p: 1400, spm: 18, r: true as const },
        { t: 30, d: 80, p: 1200, spm: 20, r: undefined },
      ],
    };
    const model = buildTrace(series, "pace")!;
    expect(model.points[0]!.map((pt) => pt.rest)).toStrictEqual([
      false,
      true,
      false,
    ]);
  });

  it("does NOT break the line across a rest — a rest is data, not a gap", () => {
    // same series: exactly ONE segment, not three
    const series = {
      samples: [
        { t: 10, d: 40, p: 1200, spm: 20, r: undefined },
        { t: 20, d: 45, p: 1400, spm: 18, r: true as const },
        { t: 30, d: 80, p: 1200, spm: 20, r: undefined },
      ],
    };
    expect(buildTrace(series, "pace")!.points).toHaveLength(1);
  });

  // review finding M-1: this capture's pace trace is NOT one unbroken
  // segment overall — it genuinely splits into 2 (354 + 57 points, a
  // real >GAP_BREAK_SECONDS gap unrelated to any rest, same capture
  // `seriesRecorder.test.ts`'s own Task-1 tests already exercise). What
  // IS true, and what this test actually asserts: none of the capture's
  // 3 separate rest runs (9+8+4 = 21 samples, `traceModel.test.ts`'s own
  // sibling probe) straddles that real gap — every rested point lands in
  // the SAME segment (index 0), never split across a boundary a rest
  // itself did not create.
  it("a real, non-frozen rest capture (session-2-wu-4unequal.jsonl) carries rest-marked points through to the model; the capture's own real gap splits it in two, but no rest run straddles that split", async () => {
    const frames = await loadCaptureFrames(
      "walk-2026-08-16",
      "session-2-wu-4unequal.jsonl",
      SESSION_2_PROGRAM,
    );
    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const series = rec.snapshot()!;
    const model = buildTrace(series, "pace")!;
    expect(model).not.toBeNull();
    expect(model.points).toHaveLength(2); // the capture's own real gap
    const restPerSegment = model.points.map(
      (segment) => segment.filter((pt) => pt.rest).length,
    );
    // All 21 rested points live in ONE segment; the other carries none —
    // proof that resting never introduced a split of its own (§3: a rest
    // is data, not a gap) on top of the real gap this capture already has.
    expect(restPerSegment).toStrictEqual([21, 0]);
    // Cross-checked against the sample-level count directly
    // (seriesRecorder.test.ts's own oracle for this exact capture).
    expect(series.samples.filter((s) => s.r === true)).toHaveLength(21);
  });

  // F-3 (review round 2): the tint has no accessible presence of its own
  // (an SVG `<rect>`, no `aria-*`) — this string is the ONLY place a
  // screen-reader user learns a rest happened at all. Pinned against the
  // real capture, not a hand-built minimum: 3 separate rest runs
  // (9+8+4=21 samples, this file's own sibling test above) collapse to
  // "3 rest spans" — a COUNT of runs, never their pace value (§3 forbids
  // claiming the rest pace is meaningful; this clause doesn't).
  it("buildSummary names the rest spans for a screen-reader user, on the real rest-bearing capture", async () => {
    const frames = await loadCaptureFrames(
      "walk-2026-08-16",
      "session-2-wu-4unequal.jsonl",
      SESSION_2_PROGRAM,
    );
    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const series = rec.snapshot()!;
    const trace = buildTrace(series, "pace")!;
    expect(trace.summary).toBe(
      "Pace, 2:55.7 at the start to 2:02.1 at the end, fastest 1:54.8, in 2 segments, 3 rest spans marked",
    );
  });

  // The negative: a rest-free trace names no rest spans at all — the
  // clause is additive, never a permanent fixture (same "no clause when
  // nothing to say" idiom the existing segment clause already uses).
  it("buildSummary names no rest spans when the trace has none", () => {
    const series = {
      samples: [
        { t: 10, d: 40, p: 1200, spm: 20, r: undefined },
        { t: 20, d: 45, p: 1400, spm: 18, r: undefined },
        { t: 30, d: 80, p: 1200, spm: 20, r: undefined },
      ],
    };
    const trace = buildTrace(series, "pace")!;
    expect(trace.summary).not.toContain("rest span");
  });
});

// ---------------------------------------------------------------------
// Gate 0B board 2, PR 3 (APPROVED 2026-09-19, candidate B): the x axis is
// WORK + THE MACHINE'S OWN REST, never the sample's own `t`.
//
// `docs/design/number-provenance/gate0b/board2/BOARD2.md` is the board
// James ruled from; every literal below is one of its measured numbers or
// a number transcribed from the capture's own stored actuals, never a
// value read back out of `buildTrace` (RF21: a derivation checking
// itself proves nothing).
// ---------------------------------------------------------------------

/** `session-2-wu-4unequal`'s own per-interval actuals, as the machine
 *  reported them — `docs/design/number-provenance/gate0b/board2/fixtures/
 *  session2-actuals.json`, produced from this same capture through the
 *  shipped driver. Work seconds are 0x0039's own per-interval elapsed;
 *  rest seconds are the 0x0037 READBACK (`domain/monitor/types.ts`).
 *  Transcribed here as INDEPENDENT LITERALS so the axis assertions below
 *  cannot be satisfied by `buildTrace` agreeing with itself. */
const SESSION_2_SPANS = [
  { workSeconds: 29.7, restSeconds: 0 },
  { workSeconds: 60, restSeconds: 30 },
  { workSeconds: 120, restSeconds: 30 },
  { workSeconds: 128.7, restSeconds: 30 },
  { workSeconds: 60, restSeconds: 0 },
];

describe("buildTrace — PR 3: the axis is work plus the machine's own rest", () => {
  it("session-2-wu-4unequal: the axis runs to 487.8 s (397.8 s of work plus the machine's own 90 s of rest), where today's stops at 419.5", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(
        "walk-2026-08-16",
        "session-2-wu-4unequal.jsonl",
        SESSION_2_PROGRAM,
      ),
    );

    // Today's axis, pinned so the change is visible rather than asserted:
    // the last sample's own `t`, which is work plus however much of each
    // rest the rower happened to keep the flywheel moving through.
    expect(buildTrace(series, "pace")!.domainX).toStrictEqual([0, 419.5]);

    const trace = buildTrace(series, "pace", SESSION_2_SPANS)!;
    expect(trace.domainX[0]).toBe(0);
    // Rounded to a tenth: the axis is a sum of ~420 float deltas, and
    // the tenth is the precision the stored series itself carries.
    expect(Number(trace.domainX[1].toFixed(1))).toBe(487.8);
  });

  it("session-2-wu-4unequal: three EQUAL 30 s rests draw three EQUAL bands, where today's draw 7.5, 6.7 and 3.0 s", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(
        "walk-2026-08-16",
        "session-2-wu-4unequal.jsonl",
        SESSION_2_PROGRAM,
      ),
    );

    // Today: the band is only the part of the rest that reached the axis,
    // so three identical rests draw three different widths — James's own
    // 2026-08-31 complaint, reproduced from the capture. (The 0.5 s pad
    // each side is `REST_BAND_PAD_SECONDS`, unchanged.)
    const today = buildTrace(series, "pace")!;
    expect(
      today.restBands.map((b) => Number((b.endX - b.startX).toFixed(1))),
    ).toStrictEqual([8.5, 7.7, 4.0]);

    const trace = buildTrace(series, "pace", SESSION_2_SPANS)!;
    expect(
      trace.restBands.map((b) => Number((b.endX - b.startX).toFixed(1))),
    ).toStrictEqual([30, 30, 30]);
  });

  it("a rest the rower sat still through draws its band anyway — it has no samples of its own, so the work boundary is what places it", () => {
    // 60 s of work at 1 Hz, then the rower stops dead for the whole 30 s
    // rest (the machine's elapsed clock freezes with the flywheel, so the
    // recorder emits NOTHING — measured on walk-2026-08-25's own 0x0031
    // frames, where elapsed held at 64.62 s across three still seconds
    // inside a rest), then 60 s more work.
    const samples: Sample[] = [];
    for (let i = 1; i <= 120; i++) {
      samples.push({
        t: i * 10,
        d: i * 40,
        p: 1200,
        spm: 24,
        r: undefined,
      } as Sample);
    }
    const trace = buildTrace({ samples }, "pace", [
      { workSeconds: 60, restSeconds: 30 },
      { workSeconds: 60, restSeconds: 0 },
    ])!;

    expect(trace.restBands).toStrictEqual([{ startX: 60, endX: 90 }]);
    // The 61st second of work is the first sample AFTER the rest, so it
    // lands beyond the band rather than inside it.
    expect(trace.points.flat().map((p) => p.x)).toContain(91);
    expect(trace.domainX).toStrictEqual([0, 150]);
  });

  it("with no stored intervals (a free row, or a row saved before the rest readback shipped) the axis is exactly today's", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(
        "walk-2026-08-16",
        "session-2-wu-4unequal.jsonl",
        SESSION_2_PROGRAM,
      ),
    );
    const today = buildTrace(series, "pace")!;
    expect(today.domainX).toStrictEqual([0, 419.5]);
    expect(today.points.flat().map((p) => p.x)).toStrictEqual(
      series.samples.filter((s) => s.p !== 0).map((s) => s.t / 10),
    );
  });

  it("the a11y summary counts the BANDS, so the rest nobody rowed through is still named", () => {
    const samples: Sample[] = [];
    for (let i = 1; i <= 120; i++) {
      samples.push({
        t: i * 10,
        d: i * 40,
        p: 1200,
        spm: 24,
        r: undefined,
      } as Sample);
    }
    const trace = buildTrace({ samples }, "pace", [
      { workSeconds: 60, restSeconds: 30 },
      { workSeconds: 60, restSeconds: 0 },
    ])!;
    expect(trace.summary).toContain("1 rest span marked");
  });
});

describe("buildTrace — PR 3: a span where the machine's distance stood still while its clock ran", () => {
  /** `docs/monitor/sessions/walk-2026-09-15-work-clock/README.md`: "Walk
   *  Keystone (`x2` / `w 250m 6k @24`), abandoned after interval 1". */
  const WORK_CLOCK_PROGRAM: WorkoutProgram = {
    intervals: [
      {
        type: "work",
        kind: "distance",
        value: 250,
        targetSplit: 129,
        displaySpm: 24,
        restSeconds: 0,
      },
      {
        type: "work",
        kind: "distance",
        value: 250,
        targetSplit: 129,
        displaySpm: 24,
        restSeconds: 0,
      },
    ],
  };

  it("the 2026-09-15 work-clock capture's 60.5 s dead stop is marked", async () => {
    const series = seriesFromFrames(
      await loadCaptureFrames(
        "walk-2026-09-15-work-clock",
        "pm5-recording-1789471533667.jsonl.gz",
        WORK_CLOCK_PROGRAM,
      ),
    );
    const trace = buildTrace(series, "pace")!;
    expect(trace.stops).toHaveLength(1);
    expect(Math.round(trace.stops[0]!.seconds)).toBe(61);
  });

  it("the flat tail after the rower presses END is not a stop — every sample there is a sentinel, and no real reading follows", () => {
    // 30 s of work, then 10 s of `p === 0` sentinels at a frozen distance:
    // the shape of a closed piece, not of a rower standing still mid-row.
    const samples: Sample[] = [];
    for (let i = 1; i <= 30; i++) {
      samples.push({ t: i * 10, d: i * 40, p: 1200, spm: 24, r: undefined });
    }
    for (let i = 31; i <= 40; i++) {
      samples.push({ t: i * 10, d: 30 * 40, p: 0, spm: 0, r: undefined });
    }
    expect(buildTrace({ samples }, "pace")!.stops).toStrictEqual([]);
  });

  it("a flat run shorter than the 5 s threshold is not a stop", () => {
    const samples: Sample[] = [];
    for (let i = 1; i <= 30; i++) {
      const frozen = i >= 10 && i <= 13; // 4 s, below the threshold
      samples.push({
        t: i * 10,
        d: (frozen ? 9 : i) * 40,
        p: 1200,
        spm: 24,
        r: undefined,
      });
    }
    expect(buildTrace({ samples }, "pace")!.stops).toStrictEqual([]);
  });
});
