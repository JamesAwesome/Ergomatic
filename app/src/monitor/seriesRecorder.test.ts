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
import { fromHexString, parseRecording } from "./transports/recording.js";
import {
  createSeriesRecorder,
  isGenuineBoundary,
  SERIES_SAMPLE_CAP,
} from "./seriesRecorder.js";

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

/** Same idea for a gzipped capture (`captureReplay.test.ts`'s own
 *  precedent: decompress at test time rather than committing a second,
 *  uncompressed duplicate of a recording). */
function readGzSessionFile(relativePath: string): string {
  return gunzipSync(readFileSync(`${SESSIONS_DIR}${relativePath}`)).toString(
    "utf-8",
  );
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

/** `pm5-session4b-final.log.gz`'s own `[event] {"kind":"frame","frame":
 *  {...}}` diagnostics-log lines — an OLDER, MonitorFrame-like shape
 *  missing several fields the current type requires
 *  (`sessionElapsedSeconds`/`sessionDistanceMeters`/`rowingActive`/
 *  `splitAvgPace`/`intervalAccrued`). Filled honestly below (mirrored from
 *  the per-interval pair, or derived from `state`, or `null`) — this
 *  recorder never reads any of the filled-in fields, the identical
 *  completeness-nicety reasoning as `replayFrames`'s own comment above. */
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

/** Decodes every `[event] {"kind":"frame",...}` line in a committed legacy
 *  `.log.gz` diagnostics capture into a `MonitorFrame`, in wire order.
 *  Malformed lines (a handful in this real, messy operator log) are
 *  skipped, never faked into a frame. */
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

/** Every index in `frames` whose `elapsedSeconds` reads lower than the
 *  immediately preceding frame's own reading by more than the wire's
 *  smallest unit — i.e. every reset CANDIDATE in a frame stream (genuine
 *  or not; `isGenuineBoundary` is the classifier, not this function). */
function findAllResetIndices(frames: MonitorFrame[]): number[] {
  const indices: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    if (frames[i]!.elapsedSeconds < frames[i - 1]!.elapsedSeconds - 0.005) {
      indices.push(i);
    }
  }
  return indices;
}

/** The first (genuine) interval-boundary reset in a frame stream, `-1` if
 *  the stream never resets. */
function findResetIndex(frames: MonitorFrame[]): number {
  return findAllResetIndices(frames)[0] ?? -1;
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

/** The first frame at or after `fromIndex` whose OWN `elapsedSeconds`,
 *  folded onto `baseSeconds`, first reaches a whole work-second beyond
 *  `afterBucket` — a ground-truth reference this suite uses to compute a
 *  boundary's EXACT resulting fold value (M1), independent of the
 *  recorder's own bucket bookkeeping. This is the spec's own bucket
 *  definition (`Math.floor`), not a reimplementation of the recorder's
 *  reset/genuineness logic. */
function firstFrameAfterBucket(
  frames: MonitorFrame[],
  fromIndex: number,
  baseSeconds: number,
  afterBucket: number,
): MonitorFrame {
  for (let i = fromIndex; i < frames.length; i++) {
    if (
      Math.floor(baseSeconds + frames[i]!.elapsedSeconds + 1e-9) > afterBucket
    ) {
      return frames[i]!;
    }
  }
  throw new Error(
    `no frame after index ${fromIndex} ever crosses bucket ${afterBucket + 1}`,
  );
}

describe("createSeriesRecorder — §6.1 oracle, decoded from the committed recordings through the real parsers", () => {
  it("step-2 (walk-2026-08-17, 2×250m r0 no wu — itself a restSeconds:0 boundary, distance-interval shaped): exactly 139 samples; the boundary's exact fold VALUE; real d/p/spm at named samples; the interval's own terminal gap under one second", () => {
    const frames = replayFrames(
      "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl",
    );
    const resetIndex = findResetIndex(frames);
    expect(resetIndex).toBeGreaterThan(0);
    const finalPreReset = frames[resetIndex - 1]!;

    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const series = rec.snapshot()!;

    expect(series.truncated).toBeUndefined();
    expect(series.samples).toHaveLength(139);

    // Exit criterion 1 (segment-end gap): the closing sample, found by
    // matching the fold arithmetic's own `t` — L1: BY VALUE, never by
    // array position, which would assume no gap ever precedes it.
    const finalReadingTenths = Math.round(finalPreReset.elapsedSeconds * 10);
    const closingSample = series.samples.find(
      (s) => Math.abs(s.t - finalReadingTenths) < 10,
    );
    expect(closingSample).toBeDefined();
    // H2: the machine's OWN number — 249.8m at the boundary, ×10.
    expect(closingSample!.d).toBe(2498);

    // M1: the fold's EXACT value (not a <20-tenths band) — the next
    // sample's `t`/`d` equal base-after-fold plus the independently-found
    // winning frame's own raw reading, proving the completed interval's
    // final reading was carried across whole, not approximated.
    const closingBucket = Math.floor(finalPreReset.elapsedSeconds);
    const windingFrame = firstFrameAfterBucket(
      frames,
      resetIndex,
      finalPreReset.elapsedSeconds,
      closingBucket,
    );
    const expectedNextT = Math.round(
      (finalPreReset.elapsedSeconds + windingFrame.elapsedSeconds) * 10,
    );
    const expectedNextD = Math.round(
      (finalPreReset.distanceMeters + windingFrame.distanceMeters) * 10,
    );
    const nextSample = series.samples.find((s) => s.t === expectedNextT);
    expect(nextSample).toBeDefined();
    expect(nextSample!.d).toBe(expectedNextD);

    // H2: the final sample — the machine's own 2×250m piece, 497.6m total.
    const lastSample = series.samples[series.samples.length - 1]!;
    expect(lastSample.d).toBe(4976);

    // M1: step-2's OWN terminal gap (distinct from the step-4 test below)
    // — interval 2's last decimated sample trails the machine's own
    // terminal reading (folded base + its own final elapsedSeconds) by
    // under one second, asserted, never loosened.
    const terminal = frames[frames.length - 1]!;
    const terminalWorkClockSeconds =
      finalPreReset.elapsedSeconds + terminal.elapsedSeconds;
    const terminalGapSeconds = terminalWorkClockSeconds - lastSample.t / 10;
    expect(terminalGapSeconds).toBeGreaterThanOrEqual(0);
    expect(terminalGapSeconds).toBeLessThan(1);

    // H2: real p/spm values at a named, mid-interval sample (found by
    // VALUE) — not this module's null-fallback defaults.
    const midSample = series.samples.find((s) => s.t === 302);
    expect(midSample).toBeDefined();
    expect(midSample!.d).toBe(1157);
    expect(midSample!.p).toBe(1314);
    expect(midSample!.spm).toBe(26);
    expect(midSample!.hr).toBe(89);
  });

  it("step-3 (walk-2026-08-17, wu 1:00 r0 + 1:00 r30 + ...): exactly 243 samples; BOTH boundaries' exact fold VALUE and segment-end gap; the 30s rest contributes ZERO samples", () => {
    const frames = replayFrames(
      "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
    );

    const resetIndices = findAllResetIndices(frames);
    expect(resetIndices).toHaveLength(2);

    // The FIRST reset is the wu's own restSeconds:0 boundary into
    // interval 1 — no REST wire state exists between them (the wu
    // configures zero trailing rest), so `workoutState` reads identically
    // on both sides of the reset. Proven directly against the decoded
    // frames, not asserted.
    expect(frames[resetIndices[0]!]!.state).toBe(
      frames[resetIndices[0]! - 1]!.state,
    );

    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const series = rec.snapshot()!;

    expect(series.truncated).toBeUndefined();
    expect(series.samples).toHaveLength(243);

    // M1: EACH boundary's segment-end gap (exit criterion 1) and exact
    // fold VALUE, threading the accumulated base across both resets in
    // order — exactly as the recorder itself does.
    let baseSecondsBeforeFold = 0;
    let baseMetersBeforeFold = 0;
    for (const resetIndex of resetIndices) {
      const finalPreReset = frames[resetIndex - 1]!;
      const finalReadingTenths = Math.round(
        (baseSecondsBeforeFold + finalPreReset.elapsedSeconds) * 10,
      );
      const closingSample = series.samples.find(
        (s) => Math.abs(s.t - finalReadingTenths) < 10,
      );
      expect(closingSample).toBeDefined();

      const closingBucket = Math.floor(
        baseSecondsBeforeFold + finalPreReset.elapsedSeconds,
      );
      const baseSecondsAfterFold =
        baseSecondsBeforeFold + finalPreReset.elapsedSeconds;
      const baseMetersAfterFold =
        baseMetersBeforeFold + finalPreReset.distanceMeters;
      const windingFrame = firstFrameAfterBucket(
        frames,
        resetIndex,
        baseSecondsAfterFold,
        closingBucket,
      );
      const expectedNextT = Math.round(
        (baseSecondsAfterFold + windingFrame.elapsedSeconds) * 10,
      );
      const expectedNextD = Math.round(
        (baseMetersAfterFold + windingFrame.distanceMeters) * 10,
      );
      const nextSample = series.samples.find((s) => s.t === expectedNextT);
      expect(nextSample).toBeDefined();
      expect(nextSample!.d).toBe(expectedNextD);

      baseSecondsBeforeFold = baseSecondsAfterFold;
      baseMetersBeforeFold = baseMetersAfterFold;
    }

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

describe("createSeriesRecorder — H1 fix round: the fold rejects Terminate double-counts and sub-second jitter", () => {
  // `pm5-session4b-final.log.gz` — four real sessions, 10,408 decoded
  // frames, 30 reset candidates total. `domain/monitor/types.ts`'s own
  // `MonitorFrame.elapsedSeconds` doc comment and `src/monitor/driver.ts`'s
  // SESSION REGISTER MAP comment both cite this exact capture for the
  // Terminate defect this section proves fixed.
  const frames = replayLegacyLog("pm5-session4b-final.log.gz");

  interface ResetCandidate {
    index: number;
    priorElapsed: number;
    priorDistance: number;
    postDistance: number;
    kind: "terminate" | "jitter" | "genuine";
  }

  /** Classifies every reset candidate in `frames` by the SAME structural
   *  shapes the review named, independently of `isGenuineBoundary` (this
   *  is the ground truth the module's own classifier is checked against,
   *  not a restatement of it): a Terminate shape holds `distanceMeters`
   *  EXACTLY unchanged and substantial (never near zero); a jitter shape
   *  is a sub-second pre-reset elapsed reading that is not already a
   *  Terminate shape; everything else is genuine. */
  function classifyResetCandidates(
    candidateFrames: MonitorFrame[],
  ): ResetCandidate[] {
    const candidates: ResetCandidate[] = [];
    for (let i = 1; i < candidateFrames.length; i++) {
      const prior = candidateFrames[i - 1]!;
      const next = candidateFrames[i]!;
      if (next.elapsedSeconds >= prior.elapsedSeconds - 0.005) continue;
      const isTerminateShape =
        next.distanceMeters === prior.distanceMeters &&
        prior.distanceMeters > 5;
      const isJitterShape = !isTerminateShape && prior.elapsedSeconds < 1.0;
      candidates.push({
        index: i,
        priorElapsed: prior.elapsedSeconds,
        priorDistance: prior.distanceMeters,
        postDistance: next.distanceMeters,
        kind: isTerminateShape
          ? "terminate"
          : isJitterShape
            ? "jitter"
            : "genuine",
      });
    }
    return candidates;
  }

  it("decodes the full capture (a handful of malformed operator-log lines skipped, never faked)", () => {
    expect(frames.length).toBe(10408);
  });

  it("isGenuineBoundary classifies every reset candidate correctly: 6 Terminate + 5 jitter rejected, 19 genuine accepted — the exact double-count the review measured", () => {
    const candidates = classifyResetCandidates(frames);
    expect(candidates).toHaveLength(30);

    const terminateShapes = candidates.filter((c) => c.kind === "terminate");
    const jitterShapes = candidates.filter((c) => c.kind === "jitter");
    const genuineShapes = candidates.filter((c) => c.kind === "genuine");
    expect(terminateShapes).toHaveLength(6);
    expect(jitterShapes).toHaveLength(5);
    expect(genuineShapes).toHaveLength(19);

    // The exact injected double-count an unconditional fold would have
    // produced from the 6 Terminate shapes alone: summing their own held
    // readings ties this test to the review's own measured numbers.
    const sumElapsed = terminateShapes.reduce((s, c) => s + c.priorElapsed, 0);
    const sumDistance = terminateShapes.reduce(
      (s, c) => s + c.priorDistance,
      0,
    );
    expect(Math.round(sumElapsed * 100) / 100).toBe(252.09);
    expect(Math.round(sumDistance * 10) / 10).toBe(139.4);

    for (const c of [...terminateShapes, ...jitterShapes]) {
      expect(isGenuineBoundary(c.priorElapsed, c.postDistance)).toBe(false);
    }
    for (const c of genuineShapes) {
      expect(isGenuineBoundary(c.priorElapsed, c.postDistance)).toBe(true);
    }
  });

  it("replaying the full capture through the actual recorder: none of the 11 false-shaped decreases ever creates a new sample; the fixed total is exact", () => {
    const candidates = classifyResetCandidates(frames);
    const falseIndices = new Set(
      candidates.filter((c) => c.kind !== "genuine").map((c) => c.index),
    );
    expect(falseIndices.size).toBe(11);

    const rec = createSeriesRecorder();
    let priorSampleCount = 0;
    const falseIndexDeltas: number[] = [];
    for (let i = 0; i < frames.length; i++) {
      rec.onFrame(frames[i]!);
      const count = rec.snapshot()?.samples.length ?? 0;
      if (falseIndices.has(i)) falseIndexDeltas.push(count - priorSampleCount);
      priorSampleCount = count;
    }
    expect(falseIndexDeltas).toHaveLength(11);
    // The smoking gun a naive fold produces: a Terminate or jitter frame
    // creating a sample where none should exist. Fixed: zero growth
    // across every one of the 11 — asserted exactly, not vacuously.
    expect(falseIndexDeltas).toStrictEqual(new Array(11).fill(0));

    // The fixed recorder's exact total across the whole capture —
    // independently derived (see the task report), a strong regression
    // pin: any change to either threshold, or to the fold itself, moves
    // this number.
    expect(rec.snapshot()!.samples.length).toBe(1145);
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
    // row: 0x0032 drives hr) — L3: this real capture has EXACTLY one such
    // sample (verified independently, see the task report), asserted
    // exactly rather than as a vacuous "0 or 1" band, so the membership
    // check below is never vacuously true.
    const withoutHr = series.samples.filter((s) => s.hr === undefined);
    expect(withoutHr).toHaveLength(1);
    expect(withoutHr[0]).toBe(series.samples[0]);
    for (const s of series.samples.slice(1)) {
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

  it("snapshot()'s Sample objects are frozen (L2): a caller cannot mutate the recorder's own history", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ elapsedSeconds: 0 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(Object.isFrozen(sample)).toBe(true);
    expect(() => {
      (sample as { hr?: number }).hr = 999;
    }).toThrow();
  });

  it("snapshot() returns a fresh samples array each call, sharing the same Sample instances (L2, documented sharing rule)", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ elapsedSeconds: 0 }));
    const first = rec.snapshot()!;
    const second = rec.snapshot()!;
    expect(first.samples).not.toBe(second.samples);
    expect(first.samples[0]).toBe(second.samples[0]);
  });
});
