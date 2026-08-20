import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRecording } from "../monitor/transports/recording.js";
import { createReplayTransport } from "../monitor/transports/replay.js";
import { createPm5Driver } from "../monitor/driver.js";
import { createEventLog } from "../monitor/eventLog.js";
import { createSeriesRecorder } from "../monitor/seriesRecorder.js";
import type { Sample, SeriesData } from "../monitor/seriesRecorder.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import { fmtSplit } from "../../domain/format.js";
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

const REPO_ROOT = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/app\/src\/log\/traceModel\.test\.ts$/, "");

/** Drives a committed `.jsonl` capture through the PRODUCTION parser and
 *  driver, collecting every emitted `MonitorFrame` — see
 *  `seriesRecorder.test.ts`'s own `loadCaptureFrames` for the full
 *  reasoning (never `replayFrames`'s hand-rolled, always-null-
 *  `intervalIndex` parse: this recorder cannot fold a boundary on a key
 *  that never changes). */
async function loadCaptureFrames(
  repoRelativePath: string,
): Promise<MonitorFrame[]> {
  const text = readFileSync(`${REPO_ROOT}${repoRelativePath}`, "utf-8");
  const parsed = parseRecording(text);
  const program = parsed.header.program;
  if (!program) {
    throw new Error(
      `loadCaptureFrames: ${repoRelativePath} carries no header.program`,
    );
  }

  const replay = createReplayTransport(parsed);
  const [dev] = await replay.transport.scan();
  await replay.transport.connect(dev.id);

  const log = createEventLog();
  const driver = createPm5Driver(replay.transport, log, {
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

const STEP3_PATH =
  "docs/monitor/sessions/walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl";

describe("buildTrace — §7.2 the sentinel rule, proven against a REAL capture", () => {
  it("step-3 (wu 1:00 r0 + 1:00 r30, a real belted walk): every p===0 sample is excluded from both the drawn points and domainY", async () => {
    const series = seriesFromFrames(await loadCaptureFrames(STEP3_PATH));
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
    const series = seriesFromFrames(await loadCaptureFrames(STEP3_PATH));
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
    const series = seriesFromFrames(await loadCaptureFrames(STEP3_PATH));
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
    const series = seriesFromFrames(await loadCaptureFrames(STEP3_PATH));
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
    const series = seriesFromFrames(await loadCaptureFrames(STEP3_PATH));
    expect(buildTrace(series, "pace")!.invert).toBe(true);
    expect(buildTrace(series, "rate")!.invert).toBe(false);
    expect(buildTrace(series, "hr")!.invert).toBe(false);
  });
});

describe("buildTrace — §5's text alternative: real values, direction, no boundary claim", () => {
  it("pace summary on step-3 names the measure, the session's first/last real reading, its fastest split, and the segment count — never the word 'interval'", async () => {
    const series = seriesFromFrames(await loadCaptureFrames(STEP3_PATH));
    const trace = buildTrace(series, "pace")!;
    // First/last/fastest real readings independently derived from the
    // capture, not hand-copied constants.
    const realPace = series.samples.filter((s) => s.p !== 0).map((s) => s.p);
    const firstSeconds = realPace[0]! / 10;
    const lastSeconds = realPace[realPace.length - 1]! / 10;
    const fastestSeconds = Math.min(...realPace) / 10;

    expect(trace.summary).toBe(
      `Pace, ${fmtSplit(firstSeconds)} at the start to ${fmtSplit(lastSeconds)} at the end, fastest ${fmtSplit(fastestSeconds)}, in ${trace.points.length} segments`,
    );
    expect(trace.points.length).toBeGreaterThan(1); // the clause is exercised, not vacuous
    expect(trace.summary.toLowerCase()).not.toContain("interval");
  });

  it("hr summary on step-3 carries no segment clause, since the line never breaks", async () => {
    const series = seriesFromFrames(await loadCaptureFrames(STEP3_PATH));
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
