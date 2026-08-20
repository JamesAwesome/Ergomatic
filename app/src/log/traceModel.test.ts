import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  parseAdditionalStatus1,
  parseGeneralStatus,
  toMonitorState,
} from "../../domain/monitor/pm5/parse.js";
import {
  ADDITIONAL_STATUS_1_UUID,
  GENERAL_STATUS_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import {
  fromHexString,
  parseRecording,
} from "../monitor/transports/recording.js";
import { createSeriesRecorder } from "../monitor/seriesRecorder.js";
import type { Sample, SeriesData } from "../monitor/seriesRecorder.js";
import { fmtSplit } from "../../domain/format.js";
import { buildTrace } from "./traceModel.js";

// ---------------------------------------------------------------------
// Real-wire replay helpers — the SAME readFileSync + real-parser idiom
// `seriesRecorder.test.ts` already established (its own header names it as
// the pattern to reuse), trimmed to this suite's own need: a real
// `SeriesData` to hand `buildTrace`, not the frame-level fold assertions
// that module's own oracle already owns and pins.
//
// TWO captures, deliberately different, because the two "real" claims this
// task must prove are two different phenomena and the brief's own named
// capture (`walk-2026-08-17/step-3.jsonl`) does not carry both: read
// literally, no gap over 3 s appears anywhere in that recording (every
// consecutive-sample gap tops out at 1.2 s), so it alone cannot prove a
// real >3s break. It DOES carry the rest this task must prove does NOT
// break the line, and a real (if small) share of `p === 0` sentinels.
// `pm5-session4b-final.log.gz` — the SAME legacy capture
// `seriesRecorder.ts`'s own module header cites for its H1 fold fix, and
// already replayed by `seriesRecorder.test.ts`'s own H1 section via this
// exact `replayLegacyLog` idiom — is where a genuine wire-level gap (a
// rejected reset candidate / dropped frames, not a rest) actually lives.
// ---------------------------------------------------------------------

const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/src\/log\/traceModel\.test\.ts$/, "../docs/monitor/sessions/");

function readSessionFile(relativePath: string): string {
  return readFileSync(`${SESSIONS_DIR}${relativePath}`, "utf-8");
}

function readGzSessionFile(relativePath: string): string {
  return gunzipSync(readFileSync(`${SESSIONS_DIR}${relativePath}`)).toString(
    "utf-8",
  );
}

function replayFrames(relativePath: string): MonitorFrame[] {
  const { events } = parseRecording(readSessionFile(relativePath));
  const frames: MonitorFrame[] = [];
  let lastAs1: {
    currentSplit: number;
    spm: number;
    heartRateBpm: number | null;
  } | null = null;

  for (const event of events) {
    if (!("dir" in event) || event.dir !== "rx") continue;

    if (event.char === ADDITIONAL_STATUS_1_UUID) {
      const parsed = parseAdditionalStatus1(fromHexString(event.hex));
      if ("error" in parsed) {
        throw new Error(`0x0032 parse error: ${JSON.stringify(parsed.error)}`);
      }
      lastAs1 = parsed;
      continue;
    }

    if (event.char !== GENERAL_STATUS_UUID) continue;
    const gs = parseGeneralStatus(fromHexString(event.hex));
    if ("error" in gs) {
      throw new Error(`0x0031 parse error: ${JSON.stringify(gs.error)}`);
    }

    frames.push({
      elapsedSeconds: gs.elapsedSeconds,
      distanceMeters: gs.distanceMeters,
      sessionElapsedSeconds: gs.elapsedSeconds,
      sessionDistanceMeters: gs.distanceMeters,
      currentSplit: lastAs1?.currentSplit ?? null,
      spm: lastAs1?.spm ?? null,
      heartRateBpm: lastAs1?.heartRateBpm ?? null,
      rowingActive: gs.rowingState === 1,
      splitAvgPace: null,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: toMonitorState(gs.workoutState),
    });
  }
  return frames;
}

interface LegacyLoggedFrame {
  elapsedSeconds: number;
  distanceMeters: number;
  currentSplit: number | null;
  spm: number | null;
  heartRateBpm: number | null;
  intervalIndex: number | null;
  intervalRemaining: { kind: "time" | "distance"; value: number } | null;
  state: MonitorFrame["state"];
}

function replayLegacyLog(relativePath: string): MonitorFrame[] {
  const text = readGzSessionFile(relativePath);
  const frames: MonitorFrame[] = [];
  const prefix = "[event] ";
  for (const line of text.split("\n")) {
    if (!line.startsWith(prefix)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line.slice(prefix.length));
    } catch {
      continue;
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("kind" in parsed) ||
      (parsed as { kind?: unknown }).kind !== "frame"
    ) {
      continue;
    }
    const raw = (parsed as unknown as { frame: LegacyLoggedFrame }).frame;
    frames.push({
      elapsedSeconds: raw.elapsedSeconds,
      distanceMeters: raw.distanceMeters,
      sessionElapsedSeconds: raw.elapsedSeconds,
      sessionDistanceMeters: raw.distanceMeters,
      currentSplit: raw.currentSplit,
      spm: raw.spm,
      heartRateBpm: raw.heartRateBpm,
      rowingActive: raw.state === "rowing",
      splitAvgPace: null,
      intervalIndex: raw.intervalIndex,
      intervalRemaining: raw.intervalRemaining,
      intervalAccrued: null,
      state: raw.state,
    });
  }
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
  "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl";

describe("buildTrace — §7.2 the sentinel rule, proven against a REAL capture", () => {
  it("step-3 (wu 1:00 r0 + 1:00 r30, a real belted walk): every p===0 sample is excluded from both the drawn points and domainY", () => {
    const series = seriesFromFrames(replayFrames(STEP3_PATH));
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

  it("pm5-session4b-final.log.gz: the measured ~26%-of-samples reality this whole rule exists for (this file's own share: 271/1145 = 23.7%)", () => {
    const series = seriesFromFrames(
      replayLegacyLog("pm5-session4b-final.log.gz"),
    );
    // Re-pins seriesRecorder.test.ts's own H1 total for this exact
    // capture — the ground the rest of this test's arithmetic depends on.
    expect(series.samples).toHaveLength(1145);
    const zeroSamples = series.samples.filter((s) => s.p === 0);
    expect(zeroSamples).toHaveLength(271);

    const trace = buildTrace(series, "pace")!;
    const drawnX = trace.points.flat().map((p) => p.x);
    expect(drawnX).toHaveLength(1145 - 271);

    // This capture's own real pace spans an unusually wide range (a
    // sprint down to 57.9 s/500m alongside near-stopped rowing up to
    // 628.5 s/500m — the module header's own note that this is FOUR real
    // sessions concatenated), wide enough that the padded, rounded domain
    // legitimately touches 0 on its own. That makes this file a poor
    // witness for "the domain's fast edge never reads as the sentinel";
    // step-3's own tighter-range test above already proves that. What
    // this capture DOES prove: the domain still fully contains the real
    // readings, never clipped toward either end.
    const realPace = series.samples
      .filter((s) => s.p !== 0)
      .map((s) => s.p / 10);
    expect(trace.domainY[0]).toBeLessThanOrEqual(Math.min(...realPace));
    expect(trace.domainY[1]).toBeGreaterThanOrEqual(Math.max(...realPace));
  });
});

describe("buildTrace — §3/§7.1 domainY: the full range of real readings, no clipping", () => {
  it("step-3's pace domain fully contains the real min/max split, never clipped toward either end", () => {
    const series = seriesFromFrames(replayFrames(STEP3_PATH));
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
  it("pm5-session4b-final.log.gz: a genuine ~41.5s wire gap (a rejected reset candidate / dropped frames, NOT a rest) starts a new segment at the exact boundary", () => {
    const series = seriesFromFrames(
      replayLegacyLog("pm5-session4b-final.log.gz"),
    );
    const trace = buildTrace(series, "pace")!;
    expect(trace.points.length).toBeGreaterThan(1);

    const boundaries = trace.points.slice(1).map((segment, i) => {
      const prevSegment = trace.points[i]!;
      return {
        endX: prevSegment[prevSegment.length - 1]!.x,
        nextStartX: segment[0]!.x,
        gap: segment[0]!.x - prevSegment[prevSegment.length - 1]!.x,
      };
    });

    // Every segment boundary this module produced corresponds to a real
    // gap over the 3s threshold — never an off-by-one artifact of the
    // segmentation loop itself. (Several of this multi-session capture's
    // own pace-channel boundaries are even LARGER than 41.5s, because a
    // long sentinel run compounds with a real wire gap in places — this
    // capture is four real sessions concatenated, seriesRecorder.ts's own
    // module header. The point below is not "the largest gap", it is
    // "THIS specific, independently-verified wire gap opens a break".)
    for (const b of boundaries) {
      expect(b.gap).toBeGreaterThan(3);
    }

    // The genuine wire-level gap (independently verified against the
    // pre-decimation frame stream: consecutive raw samples jump from
    // t=1147.3 to t=1188.8, a rejected reset candidate or dropped frames,
    // never a rest) — found BY VALUE (not by array position, and not by
    // "largest"), the same "found by value" convention
    // `seriesRecorder.test.ts`'s own oracle tests use.
    const wireGapBoundary = boundaries.find(
      (b) => Math.abs(b.endX - 1147.3) < 0.5,
    );
    expect(wireGapBoundary).toBeDefined();
    expect(wireGapBoundary!.gap).toBeCloseTo(41.5, 1);
    expect(wireGapBoundary!.nextStartX).toBeCloseTo(1188.8, 1);
  });

  it("step-3: heart rate (no sentinel exclusions of its own in this capture, since every belted sample but the very first carries hr) draws as ONE unbroken segment straight through BOTH interval boundaries, including the 30s rest", () => {
    const series = seriesFromFrames(replayFrames(STEP3_PATH));
    const trace = buildTrace(series, "hr")!;
    expect(trace.points).toHaveLength(1);
    // 243 samples, exactly one (the very first, before any 0x0032
    // arrival) lacks hr — seriesRecorder.test.ts's own L3-pinned fact for
    // this exact capture.
    expect(trace.points[0]).toHaveLength(242);

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
  it("on a real capture", () => {
    const series = seriesFromFrames(replayFrames(STEP3_PATH));
    expect(buildTrace(series, "pace")!.invert).toBe(true);
    expect(buildTrace(series, "rate")!.invert).toBe(false);
    expect(buildTrace(series, "hr")!.invert).toBe(false);
  });
});

describe("buildTrace — §5's text alternative: real values, direction, no boundary claim", () => {
  it("pace summary on step-3 names the measure, the session's first/last real reading, its fastest split, and the segment count — never the word 'interval'", () => {
    const series = seriesFromFrames(replayFrames(STEP3_PATH));
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

  it("hr summary on step-3 carries no segment clause, since the line never breaks", () => {
    const series = seriesFromFrames(replayFrames(STEP3_PATH));
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
