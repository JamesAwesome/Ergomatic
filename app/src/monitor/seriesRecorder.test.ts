import { readFileSync } from "node:fs";
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
import { fromHexString, parseRecording } from "./transports/recording.js";
import { createSeriesRecorder, SERIES_SAMPLE_CAP } from "./seriesRecorder.js";

// ---------------------------------------------------------------------
// Real-wire replay helper (the oracle grounding, same idiom as
// `session/summaryModel.test.ts`'s wire-scoping witness: readFileSync +
// the REAL parsers, `domain/monitor/pm5/parse.ts` unmodified here).
//
// One `MonitorFrame` per 0x0031 (General Status) arrival — the same
// characteristic `src/monitor/driver.ts`'s own `maybeEmitFrame` is
// triggered from ("Only 0x0031's own `mergeStatus` callback calls
// `maybeEmitFrame`", `parse.ts`'s own doc comments) — carrying forward the
// most recently decoded 0x0032 (Additional Status 1) fields, exactly the
// merge a real driver tick performs. Fields this recorder never reads
// (`sessionElapsedSeconds`, `rowingActive`, `splitAvgPace`,
// `intervalIndex`, `intervalRemaining`, `intervalAccrued`) are filled
// honestly (mirrored from the per-interval pair, or `null`/computed from
// the real decoded `workoutState` byte) rather than faked toward any
// particular answer — `seriesRecorder.ts` never looks at them, so this is
// a completeness nicety, not a load-bearing choice.
// ---------------------------------------------------------------------

const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/seriesRecorder\.test\.ts$/,
    "../docs/monitor/sessions/",
  );

function readSessionFile(relativePath: string): string {
  return readFileSync(`${SESSIONS_DIR}${relativePath}`, "utf-8");
}

/** Decodes every 0x0031 arrival in a committed `.jsonl` recording into a
 *  `MonitorFrame`, in wire order, through the real parsers. */
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

/** The index of the first frame whose `elapsedSeconds` reads lower than
 *  the immediately preceding frame's own reading by more than the wire's
 *  smallest unit — i.e. the first genuine interval-boundary reset in a
 *  frame stream. `-1` if the stream never resets. */
function findResetIndex(frames: MonitorFrame[]): number {
  for (let i = 1; i < frames.length; i++) {
    if (frames[i]!.elapsedSeconds < frames[i - 1]!.elapsedSeconds - 0.005) {
      return i;
    }
  }
  return -1;
}

/** The longest run of consecutive frames sharing the identical
 *  `elapsedSeconds` reading (the wire's own frozen-clock behavior through
 *  a rest, `types.ts`'s `MonitorFrame.elapsedSeconds` doc comment) —
 *  `[startIndex, endIndexInclusive]`. */
function longestFrozenRun(frames: MonitorFrame[]): [number, number] {
  let bestStart = 0;
  let bestEnd = 0;
  let runStart = 0;
  for (let i = 1; i <= frames.length; i++) {
    const sameAsPrev =
      i < frames.length &&
      Math.abs(frames[i]!.elapsedSeconds - frames[runStart]!.elapsedSeconds) <
        0.001;
    if (!sameAsPrev) {
      if (i - 1 - runStart > bestEnd - bestStart) {
        bestStart = runStart;
        bestEnd = i - 1;
      }
      runStart = i;
    }
  }
  return [bestStart, bestEnd];
}

describe("createSeriesRecorder — §6.1 oracle, decoded from the committed recordings through the real parsers", () => {
  it("step-2 (walk-2026-08-17, 2×250m r0 no wu): exactly 139 samples, one work→work boundary, the fold carries the completed interval's own final reading forward", () => {
    const frames = replayFrames(
      "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl",
    );
    const resetIndex = findResetIndex(frames);
    expect(resetIndex).toBeGreaterThan(0);
    const finalPreReset = frames[resetIndex - 1]!;

    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const series = rec.snapshot();

    expect(series).toBeDefined();
    expect(series!.truncated).toBeUndefined();
    expect(series!.samples).toHaveLength(139);

    // Interval 1's own closing sample: the whole work-second the final
    // pre-reset reading itself falls in.
    const closingIndex = Math.floor(finalPreReset.elapsedSeconds);
    const closingSample = series!.samples[closingIndex]!;
    const finalReadingTenths = Math.round(finalPreReset.elapsedSeconds * 10);
    // Exit criterion 1: within one whole second of the interval's own
    // final pre-reset reading.
    expect(Math.abs(closingSample.t - finalReadingTenths)).toBeLessThan(10);

    // The fold: the very next sample (interval 2's first) carries `t`
    // forward from the FOLDED base, not reset toward zero — proof the
    // completed interval's final reading was carried across the
    // restSeconds:0-shaped boundary (no REST state exists between these
    // two work intervals; the reset is detected purely off the wire's own
    // elapsed drop, never off `workoutState`).
    const nextSample = series!.samples[closingIndex + 1]!;
    expect(nextSample.t).toBeGreaterThanOrEqual(finalReadingTenths);
    // ...and it is the very next whole second, not a jump — the fold adds
    // exactly the one completed interval's own reading, nothing else.
    expect(nextSample.t - finalReadingTenths).toBeLessThan(20);
  });

  it("step-3 (walk-2026-08-17, wu 1:00 r0 + ...): exactly 243 samples; the restSeconds:0 boundary (wState never leaves the work-mapped ordinal) folds correctly; the 30s rest contributes ZERO samples", () => {
    const frames = replayFrames(
      "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
    );

    // The FIRST reset in this file is the wu's own restSeconds:0 boundary
    // into interval 1 — no REST wire state exists between them (the wu
    // configures zero trailing rest), so `workoutState` reads identically
    // on both sides of the reset. Proven directly against the decoded
    // frames, not asserted: the wire's own state byte at the frame just
    // before and just after the reset is the SAME ordinal.
    const firstResetIndex = findResetIndex(frames);
    expect(firstResetIndex).toBeGreaterThan(0);
    expect(frames[firstResetIndex]!.state).toBe(
      frames[firstResetIndex - 1]!.state,
    );

    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const series = rec.snapshot();

    expect(series).toBeDefined();
    expect(series!.truncated).toBeUndefined();
    expect(series!.samples).toHaveLength(243);

    // The frozen-clock proof: find the longest run of frames sharing one
    // held `elapsedSeconds` reading (the 30s rest — the wire's own
    // elapsed/distance freeze through it, antagonist-ledger.md's
    // 2026-08-19 spec-stage measurement). Replaying up to (and including)
    // the FIRST frame of that run claims exactly one bucket; every further
    // frame in the run — dozens of real BLE notifications arriving across
    // 30 real seconds — must add NOTHING.
    const [frozenStart, frozenEnd] = longestFrozenRun(frames);
    expect(frozenEnd - frozenStart).toBeGreaterThanOrEqual(10); // a real rest, not noise

    const restRecorder = createSeriesRecorder();
    for (let i = 0; i <= frozenStart; i++) restRecorder.onFrame(frames[i]!);
    const countAtFreezeStart = restRecorder.snapshot()!.samples.length;
    for (let i = frozenStart + 1; i <= frozenEnd; i++) {
      restRecorder.onFrame(frames[i]!);
    }
    const countAtFreezeEnd = restRecorder.snapshot()!.samples.length;
    expect(countAtFreezeEnd).toBe(countAtFreezeStart);
  });

  it("step-4 (walk-2026-08-17, 2×250m ended ~44s in): the last sample trails the machine's own terminal reading by less than one second, by construction — never loosened", () => {
    const frames = replayFrames(
      "walk-2026-08-17/step-4-pm5-recording-1786974067695.jsonl",
    );
    // No 0x0039 end-of-workout frame exists in this corpus (antagonist
    // B4) — the machine's own terminal reading is simply the LAST 0x0031
    // sample this recording carries.
    const terminal = frames[frames.length - 1]!;

    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const series = rec.snapshot();

    expect(series).toBeDefined();
    const lastSample = series!.samples[series!.samples.length - 1]!;
    const gapSeconds = terminal.elapsedSeconds - lastSample.t / 10;

    expect(gapSeconds).toBeGreaterThanOrEqual(0);
    expect(gapSeconds).toBeLessThan(1);
  });
});

describe("createSeriesRecorder — S7 dual-rate decimation is platform-independent", () => {
  it("a synthetic 10 Hz stream (the real ~2 Hz recording's own frames, each held/repeated 5×) decimates to the identical series", () => {
    const frames = replayFrames(
      "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl",
    );

    const baseline = createSeriesRecorder();
    for (const f of frames) baseline.onFrame(f);

    // A "faster transport" delivering the SAME underlying readings more
    // often — every real reading held/repeated, never interpolated to a
    // new value between real ticks (the PM5 itself, not the transport,
    // decides when a reading changes).
    const tenHz = createSeriesRecorder();
    for (const f of frames) {
      for (let i = 0; i < 5; i++) tenHz.onFrame(f);
    }

    expect(tenHz.snapshot()).toStrictEqual(baseline.snapshot());
  });
});

describe("createSeriesRecorder — the cap", () => {
  it("sample 14,401 never appends; truncated is set exactly once", () => {
    const rec = createSeriesRecorder();
    // 14,401 distinct whole work-seconds: buckets 0..14,400 inclusive.
    for (let s = 0; s <= SERIES_SAMPLE_CAP; s++) {
      rec.onFrame({
        elapsedSeconds: s,
        distanceMeters: s * 5,
        sessionElapsedSeconds: s,
        sessionDistanceMeters: s * 5,
        currentSplit: 120,
        spm: 20,
        heartRateBpm: 140,
        rowingActive: true,
        splitAvgPace: null,
        intervalIndex: null,
        intervalRemaining: null,
        intervalAccrued: null,
        state: "rowing",
      });
    }
    const series = rec.snapshot()!;
    expect(series.samples).toHaveLength(SERIES_SAMPLE_CAP);
    expect(series.truncated).toBe(true);

    // Feeding further frames past the cap changes nothing further.
    rec.onFrame({
      elapsedSeconds: SERIES_SAMPLE_CAP + 500,
      distanceMeters: 1,
      sessionElapsedSeconds: SERIES_SAMPLE_CAP + 500,
      sessionDistanceMeters: 1,
      currentSplit: 120,
      spm: 20,
      heartRateBpm: 140,
      rowingActive: true,
      splitAvgPace: null,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
    });
    expect(rec.snapshot()!.samples).toHaveLength(SERIES_SAMPLE_CAP);
    expect(rec.snapshot()!.truncated).toBe(true);
  });
});

describe("createSeriesRecorder — hr presence (§1's Shape row: absent, never present-but-undefined, when the wire says no belt)", () => {
  function frame(over: Partial<MonitorFrame> = {}): MonitorFrame {
    return {
      elapsedSeconds: 1,
      distanceMeters: 5,
      sessionElapsedSeconds: 1,
      sessionDistanceMeters: 5,
      currentSplit: 120,
      spm: 22,
      heartRateBpm: null,
      rowingActive: true,
      splitAvgPace: null,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
      ...over,
    };
  }

  it("real leg: every sample from the first 0x0032 arrival onward decoded from step-3 (a belted walk) carries a numeric hr", () => {
    const frames = replayFrames(
      "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
    );
    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const series = rec.snapshot()!;
    expect(series.samples.length).toBeGreaterThan(0);
    // Bucket 0 can be claimed by an armed frame recorded before the
    // session's first-ever 0x0032 notification lands (§1's Source fields
    // row: 0x0032 drives hr) — this leg proves the belt reading rides
    // every sample once it has arrived at all, not that a value exists
    // before the wire has sent one.
    const withoutHr = series.samples.filter((s) => s.hr === undefined);
    expect(withoutHr.length).toBeLessThanOrEqual(1);
    expect(withoutHr.every((s) => s === series.samples[0])).toBe(true);
    for (const s of series.samples.slice(withoutHr.length)) {
      expect(typeof s.hr).toBe("number");
    }
  });

  it("synthetic leg: heartRateBpm null (no belt, the wire's own 255/0 sentinel resolved upstream) omits the key entirely", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ heartRateBpm: null }));
    const sample = rec.snapshot()!.samples[0]!;
    expect("hr" in sample).toBe(false);
  });

  it("synthetic leg: a real heartRateBpm sets hr to that exact value", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ heartRateBpm: 143 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.hr).toBe(143);
  });
});

describe("createSeriesRecorder — the rest of the contract", () => {
  function frame(over: Partial<MonitorFrame> = {}): MonitorFrame {
    return {
      elapsedSeconds: 0,
      distanceMeters: 0,
      sessionElapsedSeconds: 0,
      sessionDistanceMeters: 0,
      currentSplit: 130,
      spm: 24,
      heartRateBpm: null,
      rowingActive: true,
      splitAvgPace: null,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
      ...over,
    };
  }

  it("snapshot() is undefined before the first frame — a reader never sees an empty series object", () => {
    const rec = createSeriesRecorder();
    expect(rec.snapshot()).toBeUndefined();
  });

  it("stop() freezes the recorder: frames after stop() never append", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ elapsedSeconds: 0 }));
    rec.stop();
    rec.onFrame(frame({ elapsedSeconds: 5 }));
    expect(rec.snapshot()!.samples).toHaveLength(1);
  });

  it("a null currentSplit/spm at parse level (no AS1 seen yet) still produces a sample, defaulted to 0 rather than throwing", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ elapsedSeconds: 0, currentSplit: null, spm: null }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.p).toBe(0);
    expect(sample.spm).toBe(0);
  });

  it("multiple frames within the same whole work-second do not each win it — first-frame-wins, never duplicates", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ elapsedSeconds: 0.1 }));
    rec.onFrame(frame({ elapsedSeconds: 0.4 }));
    rec.onFrame(frame({ elapsedSeconds: 0.8 }));
    expect(rec.snapshot()!.samples).toHaveLength(1);
    // The FIRST frame's own reading won the bucket, not the last.
    expect(rec.snapshot()!.samples[0]!.t).toBe(1);
  });

  it("a reconnect gap (elapsed jumps forward past several whole seconds) produces missing seconds, never duplicates or backfill", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ elapsedSeconds: 0 }));
    rec.onFrame(frame({ elapsedSeconds: 9.2 }));
    const series = rec.snapshot()!;
    expect(series.samples).toHaveLength(2);
    expect(series.samples[0]!.t).toBe(0);
    expect(series.samples[1]!.t).toBe(92);
  });
});
