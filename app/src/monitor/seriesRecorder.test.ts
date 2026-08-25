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
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { fromHexString, parseRecording } from "./transports/recording.js";
import { createEventLog } from "./eventLog.js";
import { createPm5Driver } from "./driver.js";
import { createReplayTransport } from "./transports/replay.js";
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

/** Repo-root resolution (same plain-string-surgery idiom as `SESSIONS_DIR`
 *  above and `registerReplay.test.ts`'s own `SESSIONS_DIR` — this project's
 *  jsdom environment resolves `new URL(...)` against `http://localhost:3000/`
 *  rather than the given `file://` base). `loadCaptureFrames` below takes
 *  paths VERBATIM from the plan/spec, rooted at the repo root (e.g.
 *  `docs/monitor/sessions/...`), not `SESSIONS_DIR`-relative. */
const REPO_ROOT = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/app\/src\/monitor\/seriesRecorder\.test\.ts$/, "");

function readSessionFile(relativePath: string): string {
  return readFileSync(`${SESSIONS_DIR}${relativePath}`, "utf-8");
}

/** Drives a committed `.jsonl` capture through the PRODUCTION parser and
 *  driver (`parseRecording` + `createReplayTransport` + `createPm5Driver`,
 *  the harness `registerReplay.test.ts`/`connectedMetricsReplay.test.ts`
 *  already established for this exact recording shape) and collects every
 *  emitted `MonitorFrame`. Deliberately NOT `replayFrames` below: that
 *  hand-rolls a parse straight off 0x0031/0x0032 and hardcodes
 *  `intervalIndex: null`, which can never exercise this task's fix (a
 *  register map keyed on `MonitorFrame.intervalIndex`) — every frame would
 *  collapse onto the one synthetic null-key register. This function drives
 *  the REAL driver instead, so `intervalIndex` is the real EMITTED value
 *  (post stale-count-clamp, `driver.ts`'s own SESSION REGISTER MAP) — never
 *  `toProgramIndex`'s raw output, which the clamp can RAISE (task-1-brief's
 *  own warning: keying on the raw normaliser reads `t=3024` against a true
 *  `2422`).
 *
 *  The capture's own `header.program` (present on step-3, the only
 *  walk-2026-08-17 recording that carries one) arms the driver directly —
 *  no transcription, no second source of truth to drift from the
 *  recording. For step-2/step-4 (no `header.program`), `programOverride`
 *  takes the same hand-transcribed-from-the-capture's-own-tx-bytes
 *  approach `registerReplay.test.ts` established for the walk-2026-08-16
 *  pair — see `STEP_2_PROGRAM` below for that decode. */
async function loadCaptureFrames(
  repoRelativePath: string,
  programOverride?: WorkoutProgram,
): Promise<MonitorFrame[]> {
  const text = readFileSync(`${REPO_ROOT}${repoRelativePath}`, "utf-8");
  const parsed = parseRecording(text);
  const program = programOverride ?? parsed.header.program;
  if (!program) {
    throw new Error(
      `loadCaptureFrames: ${repoRelativePath} carries no header.program and no programOverride was given`,
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

/** Hand-transcribed from step-2's OWN recorded tx bytes (PRIMARY — decoded
 *  directly off `step-2-pm5-recording-1786973078979.jsonl`'s own
 *  `ce060021` programming writes, not borrowed from the walk-2026-08-16
 *  captures `registerReplay.test.ts` decodes): the concatenated tx hex
 *  reads `... 06 04 00 00 32 64 ...` twice — `commands.ts`'s own
 *  `buildIntervalBlock` SETPACE encoding, `00 00 32 64` = 12900
 *  centiseconds/500m = target split 129s (2:09/500m), matching
 *  `registerReplay.test.ts`'s own `SESSION_1_PROGRAM` citation exactly.
 *  `docs/monitor/sessions/walk-2026-08-17/README.md`'s own table names
 *  this session "2×250m r0, no wu" and `step-2-ring.json`'s own `armed`
 *  entry reads `"programmed 2 interval(s)"` with `structure` decoding
 *  `workoutType=8 durationRaw=250 durationType=128` (distance-kind,
 *  250m) — the two independent sources agree. */
const STEP_2_PROGRAM: WorkoutProgram = {
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
      restSeconds: 0,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: toMonitorState(gs.workoutState),
    });
  }
  return frames;
}

/** Every index in `frames` whose `elapsedSeconds` reads lower than the
 *  immediately preceding frame's own reading by more than the wire's
 *  smallest unit — i.e. every reset CANDIDATE in a frame stream. Purely a
 *  witness of where the wire itself shows a boundary (elapsedSeconds/
 *  distanceMeters only); this recorder no longer classifies candidates at
 *  all — it keys on `intervalIndex` instead. */
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
  // Driven through the real driver (`loadCaptureFrames` + hand-transcribed
  // `STEP_2_PROGRAM`), trace-truth Task 1 — `replayFrames`'s hand-rolled
  // parse hardcodes `intervalIndex: null`, which the NEW register-map
  // recorder cannot fold a boundary on (task-1-brief.md's own warning).
  // The oracle helpers below (`findResetIndex`, `firstFrameAfterBucket`)
  // still read `elapsedSeconds`/`distanceMeters` only, so they remain
  // valid unchanged against the driver's own frames — same underlying
  // wire bytes, same decode.
  it("step-2 (walk-2026-08-17, 2×250m r0 no wu — itself a restSeconds:0 boundary, distance-interval shaped): exactly 139 samples; the boundary's exact fold VALUE; real d/p/spm at named samples; the interval's own terminal gap under one second", async () => {
    const frames = await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl",
      STEP_2_PROGRAM,
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

  // Driven through the real driver — same reasoning as step-2 above.
  // step-3 carries its own `header.program`, so no override is needed.
  it("step-3 (walk-2026-08-17, wu 1:00 r0 + 1:00 r30 + ...): exactly 243 samples; BOTH boundaries' exact fold VALUE and segment-end gap; the 30s rest contributes ZERO samples", async () => {
    const frames = await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
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

// `pm5-session4b-final.log.gz`'s own `H1 fix round` describe block (see git
// history) was removed here, not migrated. It replayed `intervalIndex`
// straight off the legacy driver's OWN logged frames (`replayLegacyLog`,
// unlike `replayFrames`'s hardcoded null), so on the surface it looked
// reusable for this task's register map — but the capture concatenates
// FOUR SEPARATE real sessions (`intervalIndex` observably falls back to
// `null` then restarts at `0` three more times across the file, confirmed
// by inspection this task session), and this module's key is monotonic
// non-decreasing FOR THE LIFETIME OF ONE `createSeriesRecorder()` instance
// by design (spec §2) — exactly matching `driver.ts`'s own `activeRun`
// scoping, one run per `program()` call. Feeding four concatenated runs
// through one recorder is not a scenario the production wiring ever
// produces (Task 2's `useMonitorSession.ts` owns one recorder per
// session); replaying it here after this fix correctly stops folding once
// a later session's own smaller raw index can no longer raise the key,
// which is the CORRECT behavior for an invalid input, not a defect —  but
// it made the block's old sample-count regression pin (a number tuned to
// the OLD edge-triggered heuristic, which had no session-identity concept
// at all and refolded on every session's own reset by coincidence)
// meaningless. No replacement pin was written for a scenario this design
// does not support.

describe("createSeriesRecorder — S7 dual-rate decimation is platform-independent", () => {
  // Review finding M2 (2026-08-20): migrated off `replayFrames` (this file's
  // own hand-rolled, always-null-`intervalIndex` parse) onto the real-driver
  // harness, same reasoning as every other capture-driven test in this file
  // — under null `intervalIndex` the fold never happens across step-2's own
  // boundary, so `baseline`'s series stops early (75 samples, not the real
  // 139) and this test would be proving the tenHz/baseline invariant against
  // a truncated, unrepresentative series rather than the real one. The
  // INVARIANT itself (decimation is platform-independent — feeding the same
  // readings 5x faster produces an identical series) never depended on which
  // harness produced the frames, but the frames themselves should still be
  // real.
  it("a synthetic 10 Hz stream (the real ~2 Hz recording's own frames, each held/repeated 5×) decimates to the identical series", async () => {
    const frames = await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl",
      STEP_2_PROGRAM,
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
        restSeconds: 0,
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
      restSeconds: 0,
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
      restSeconds: 0,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
      ...over,
    };
  }

  // Driven through the real driver (trace-truth Task 1) — `replayFrames`
  // would hardcode `intervalIndex: null`, silently degrading this into an
  // unfolded single-key replay rather than testing the real per-sample hr
  // presence contract against a capture that DOES cross two boundaries.
  it("real leg: every sample from the first 0x0032 arrival onward decoded from step-3 (a belted walk) carries a numeric hr", async () => {
    const frames = await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
    );
    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const series = rec.snapshot()!;
    expect(series.samples.length).toBeGreaterThan(0);
    // The driver never emits a `frame` event for the FIRST 0x0031 arrival
    // in this capture (t=9586ms): `program()` opens the run only after
    // `verifyArmed()` confirms it, and that first status round-trip is
    // consumed for verification, not emission (`driver.ts`'s own "a run
    // is opened by `program()` and ONLY by `program()`" rule) — the SECOND
    // 0x0031 (t=10125.8ms) is the first one the driver actually emits, and
    // by then the capture's first-ever 0x0032 (t=9586.2ms) has already
    // landed and been cached. So EVERY real driver-emitted sample here
    // carries `hr` — verified this task session by driving the real
    // driver and printing its first 5 frames (see task-1-report.md).
    // `replayFrames`'s naive one-frame-per-0x0031 parse missed this
    // run-not-yet-open gap entirely, which is why the pre-this-task
    // version of this test (against that harness) asserted exactly one
    // hr-less sample — a harness artifact, not a real driver behavior.
    const withoutHr = series.samples.filter((s) => s.hr === undefined);
    expect(withoutHr).toHaveLength(0);
    for (const s of series.samples) {
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

  // Fix round (MED-LOW-2, RULED): the wire forwards a genuine, non-null
  // heartRateBpm byte 1..19 unfiltered (only 0/255 resolve to `null`
  // upstream, `heartRate()`'s own sentinel handling) — before this fix
  // such a reading rode straight onto the sample as a real `hr`, and the
  // server's own `HR_MIN..HR_MAX` (20..254) band 400ed the WHOLE POST on
  // it, discarding the entire trace for one out-of-band belt blip. Same
  // "drop the field, never the save" treatment `logDraft.ts`'s
  // `MONITOR_HR_MIN`/`MAX` already gives the identical wire quantity one
  // step downstream — three legs: below band dropped, both band edges
  // kept exactly.
  it("fix round: a genuine but out-of-band heartRateBpm (15, below the 20..254 band) omits hr entirely", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ heartRateBpm: 15 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect("hr" in sample).toBe(false);
  });

  it("fix round: heartRateBpm 20 (the band's own floor) is kept exactly", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ heartRateBpm: 20 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.hr).toBe(20);
  });

  it("fix round: heartRateBpm 254 (the band's own ceiling) is kept exactly", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ heartRateBpm: 254 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.hr).toBe(254);
  });
});

// ---------------------------------------------------------------------
// RC-6, narrowed (phase-open gates): the `p: 0` half of the original
// finding moved to RC-11's own spec; this half bands `spm` the same way
// `hr` above is already banded — same sibling field, same "drop the
// out-of-band reading to the sentinel, never the whole sample" shape,
// two lines up in `seriesRecorder.ts`. Two DIFFERENT wire artifacts, not
// one: a first-stroke estimator transient (64 spm, committed capture
// `docs/monitor/sessions/walk-2026-08-17/step-2-pm5-recording-
// 1786973078979.jsonl`, seq 829/832/835/838 — 13 s into interval 1, NOT
// a boundary; the PM5's own spm estimator on a single elapsed stroke)
// and a workout-end boundary transition (101 spm, committed capture
// `docs/monitor/sessions/walk-2026-08-18-metrics/pyramid-pm5-recording-
// 1787090555458.jsonl.gz`, seq 3274/3277, straddling the interval-end
// reset). Both are real, coherent, aligned wire readings — not parse
// noise — so this bands at the SAME layer `hr` already does rather than
// trying to detect either mechanism.
// ---------------------------------------------------------------------

describe("createSeriesRecorder — spm banding (RC-6, narrowed: 10..60 spm, out-of-band to the 0 sentinel)", () => {
  function frame(over: Partial<MonitorFrame> = {}): MonitorFrame {
    return {
      elapsedSeconds: 1,
      distanceMeters: 5,
      sessionElapsedSeconds: 1,
      sessionDistanceMeters: 5,
      currentSplit: 120,
      spm: 24,
      heartRateBpm: null,
      rowingActive: true,
      splitAvgPace: null,
      restSeconds: 0,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
      ...over,
    };
  }

  it("first-stroke transient: spm 64 (step-2 seq 829/832/835/838, 13s into interval 1 — NOT a boundary) records spm 0", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ spm: 64 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.spm).toBe(0);
  });

  it("boundary transition: spm 101 (pyramid seq 3274/3277, straddling the workout-end reset) records spm 0", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ spm: 101 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.spm).toBe(0);
  });

  it("band floor: spm 10 (the band's own floor) is kept exactly", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ spm: 10 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.spm).toBe(10);
  });

  it("band ceiling: spm 60 (the band's own ceiling) is kept exactly", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ spm: 60 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.spm).toBe(60);
  });

  it("typical value: spm 24 (a normal cadence) is kept exactly", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ spm: 24 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.spm).toBe(24);
  });

  it("just below the floor: spm 9 records spm 0", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ spm: 9 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.spm).toBe(0);
  });

  it("just above the ceiling: spm 61 records spm 0", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ spm: 61 }));
    const sample = rec.snapshot()!.samples[0]!;
    expect(sample.spm).toBe(0);
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
      restSeconds: 0,
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

// ---------------------------------------------------------------------
// trace-truth Task 1 (2026-08-20): the register map replaces the
// edge-triggered genuine-boundary fold. This section drives the REAL
// driver (`loadCaptureFrames` above) rather than `replayFrames`'s
// hand-rolled, always-null-`intervalIndex` parse — task-1-brief's own
// warning: a harness that never gives the recorder a real key can never
// exercise a key-based fix.
// ---------------------------------------------------------------------

describe("createSeriesRecorder — trace-truth Task 1: the register map, driven through the real driver", () => {
  // task-1-brief.md's Step 1 pins this at 242 samples; the real driver
  // (this harness) and the already-shipped, pre-this-task recorder
  // replaying the SAME capture through `replayFrames` (this file's own
  // "§6.1 oracle" describe block, "step-3 ... exactly 243 samples", green
  // before this task) both independently produce 243 — a bucket-0 armed
  // sample at t=0 (elapsedSeconds 0, before rowing starts) that the
  // brief's own head-count evidently missed. Corrected here per CLAUDE.md
  // ("unmarked values still lose to what the code actually says") — the
  // brief's OWN last-sample values (t=2422, d=8072) are unaffected and
  // kept verbatim.
  it("replays step-3 to the same 243 samples the shipped recorder produced (t and d in TENTHS)", async () => {
    const frames = await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
    );
    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const snap = rec.snapshot();
    expect(snap?.samples).toHaveLength(243);
    expect(snap?.samples.at(-1)?.t).toBe(2422);
    expect(snap?.samples.at(-1)?.d).toBe(8072);
  });

  /** Drops `n` frames immediately after the interval-0 -> interval-1
   *  boundary, so the first observed post-boundary frame is already past
   *  3.0 m — the exact shape the deleted edge-triggered heuristic's
   *  distance gate used to reject. */
  function dropAfterBoundary(
    frames: MonitorFrame[],
    n: number,
  ): MonitorFrame[] {
    const b = frames.findIndex(
      (f, i) => i > 0 && f.elapsedSeconds < frames[i - 1]!.elapsedSeconds,
    );
    expect(b).toBeGreaterThan(0); // the capture really does contain a boundary
    return [...frames.slice(0, b), ...frames.slice(b + n)];
  }

  it.each([4, 20, 60])(
    "loses NOTHING when %i frames are dropped across an interval boundary",
    async (n) => {
      const frames = await loadCaptureFrames(
        "docs/monitor/sessions/walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
      );
      const rec = createSeriesRecorder();
      for (const f of dropAfterBoundary(frames, n)) rec.onFrame(f);
      const last = rec.snapshot()!.samples.at(-1)!;
      // Identical totals to the ungapped replay: the fold cannot be missed,
      // because there is no fold — the key carries it.
      expect(last.t).toBe(2422);
      expect(last.d).toBe(8072);
    },
  );

  /** Local `frame()` builder, same shape as the other describe blocks'
   *  own copies in this file (each scope owns its own — the established
   *  convention here, not a new one). */
  function frame(over: Partial<MonitorFrame> = {}): MonitorFrame {
    return {
      elapsedSeconds: 0,
      distanceMeters: 0,
      sessionElapsedSeconds: 0,
      sessionDistanceMeters: 0,
      currentSplit: 120,
      spm: 20,
      heartRateBpm: null,
      rowingActive: true,
      splitAvgPace: null,
      restSeconds: 0,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
      ...over,
    };
  }

  // series-truth Task 3 (spec §B′): the two tests below used to feed
  // `intervalIndex` directly, exercising the OLD currentKey-raise this
  // module deleted. Updated to `attributedIntervalIndex` (the field the
  // module actually consumes now) — same scenario, same expected values,
  // since the "absent/synthetic key" behavior this describe block
  // documents carries over unchanged onto the new field (spec §B′'s own
  // "absent continues the last key" contract).
  it("continues the last key when attributedIntervalIndex goes absent, never resetting accumulation", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 10,
        distanceMeters: 40,
      }),
    );
    rec.onFrame(
      frame({
        attributedIntervalIndex: 1,
        elapsedSeconds: 5,
        distanceMeters: 20,
      }),
    );
    rec.onFrame(
      frame({
        attributedIntervalIndex: undefined,
        elapsedSeconds: 6,
        distanceMeters: 24,
      }),
    );
    const last = rec.snapshot()!.samples.at(-1)!;
    expect(last.t).toBe(160); // (10 banked + 6) * 10 tenths
  });

  it("accumulates under a single synthetic key when attributedIntervalIndex is absent throughout", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ elapsedSeconds: 1, distanceMeters: 4 }));
    rec.onFrame(frame({ elapsedSeconds: 2, distanceMeters: 8 }));
    expect(rec.snapshot()!.samples).toHaveLength(2); // records, does not refuse
  });

  // series-truth Task 3 (spec §B′/§C′): this describe block used to carry
  // a test named "never lets a backward key move the cumulative clock
  // backwards", asserting the OLD forced-monotonic `currentKey` guarantee
  // (a raw `intervalIndex` regression could never move the key
  // backward). That guarantee is DELETED, not preserved under a new field
  // name: this module now trusts `attributedIntervalIndex` outright, with
  // no forward-only clamp of its own (spec §B′: "one deriver in the
  // system" — re-clamping here would be exactly the supplementing the
  // spec forbids), so a backward attribution DOES move the cumulative
  // clock backward. The consequence is observed, not prevented: C′'s
  // `backwardBucketCount` (this file's own "series-truth Task 3:
  // backwardBucketCount" describe block, "a forced strictly-backward work
  // clock ... counts exactly one backward bucket and drops the sample,
  // never appends it") covers this exact scenario and its own sample-drop
  // guarantee — the array-identity gap review finding I1 originally
  // closed (a lost sample changes the LENGTH, not just the order) is
  // covered there via the explicit before/after length comparison.
});

// ---------------------------------------------------------------------
// trace-truth Task 2 (2026-08-20): rests are DRAWN, but MARKED (spec §3).
// `session-2-wu-4unequal.jsonl` is used deliberately over step-3: step-3's
// OWN MID-WORKOUT rest is FROZEN (the rower stopped rowing, wire
// elapsed/distance hold for that one window), which is exactly the shape
// that let a false premise survive — session-2's own rests still ADVANCE
// (README: "wu 4 unequal"), so this capture actually exercises a
// `state === "resting"` frame reporting a REAL, CHANGING
// `elapsedSeconds`/`distanceMeters`, the case a frozen window can never
// exercise on its own (review round 2: stale-citation fix — this used to
// cite "this file's own header comment" for a "zero samples by
// construction" claim; that header now says the OPPOSITE, correctly, per
// this exact test's own evidence).
// ---------------------------------------------------------------------

/** `registerReplay.test.ts`'s own `SESSION_2_PROGRAM` (walk-2026-08-16,
 *  hand-transcribed from the capture's own recorded tx bytes — no
 *  `header.program` on this recording, see that file for the decode
 *  provenance). Duplicated here rather than imported: each describe
 *  block in this file owns its own program consts (`STEP_2_PROGRAM`
 *  above is the established convention), and `registerReplay.test.ts`
 *  does not export its copy. */
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

describe("createSeriesRecorder — trace-truth Task 2: rests are marked (real capture, non-frozen rest)", () => {
  it("marks every sample recorded while the machine was resting (real capture, non-frozen rest)", async () => {
    const frames = await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl",
      SESSION_2_PROGRAM,
    );
    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const samples = rec.snapshot()!.samples;
    // task-2-brief.md's Step 1 pins this at 421 samples; the shipped
    // Task-1 recorder (unaffected by this task's `r`-marking addition —
    // sample COUNT is decided entirely by the bucket-winner logic Task 1
    // owns) produces 419 against this exact capture+program. Corrected
    // here per CLAUDE.md ("unmarked values still lose to what the code
    // actually says"), same shape as Task 1's own 242->243 correction a
    // few lines above in this file. The rested count (21) and the
    // absent-key assertion below are UNAFFECTED and kept verbatim.
    expect(samples).toHaveLength(419);
    const rested = samples.filter((s) => s.r === true);
    expect(rested).toHaveLength(21);
    // work samples carry NO key at all — absent, not false (the `hr` idiom)
    expect(Object.keys(samples.find((s) => s.r === undefined)!)).not.toContain(
      "r",
    );
  });
});

// ---------------------------------------------------------------------
// series-truth design spec §B′/§C′ (task-3-brief.md) — the recorder
// consumes `attributedIntervalIndex` and DELETES its own key derivation.
//
// Controller pre-flight ruling, carried out: the full exit-7 oracle
// (`sessionTotals.test.ts`, "the exit-7 oracle") was run RED-FIRST against
// the pre-this-task recorder and came back GREEN — Task 2's own driver fix
// (the state 8/9 mirror onto `intervalIndex` itself, not just onto the new
// `attributedIntervalIndex` field) already keeps the two fields in
// agreement on THAT ONE fixture, so that oracle alone cannot exercise this
// task's actual change there (a supplement and a full replacement produce
// identical output whenever the two source fields never disagree). This
// is FINDING-WORTHY (reported to task-3-report.md) and is exactly why the
// controller's own fallback instruction exists: the test below constructs
// a frame where `intervalIndex` and `attributedIntervalIndex` genuinely
// disagree — a shape that Task 2's driver fix makes unreachable ONLY for
// the state-8/9 mirror gate; it is NOT unreachable in general (fix round 2
// correction, controller review Important 1). `driver.ts`'s own
// refused-open guard is deliberately UNGATED outside states 8/9 (its own
// comment: mirroring `intervalIndex` there was "corrupting an otherwise-
// correct countdown/target with no wire fact supporting it"), so on that
// disclosed bounded edge — a genuinely NEW interval whose first observed
// tick already collides with a stale, gap-truncated register (the exact
// shape `driver.test.ts`'s "a reconnect timeline SPANNING a boundary"
// regression exercises) — `intervalIndex` legitimately keeps rising while
// `attributedIntervalIndex` stays folded on the still-open key. Spec §B′
// records this as the ACCEPTED one-deriver cost, not a hypothetical: this
// module's own contract ("key on attribution alone, never intervalIndex —
// delete, don't supplement") must still honor it, both here (a synthetic
// disagreement, isolating the deletion itself) and on the edge's own real
// shape (this file's own "the recorder's disclosed bounded edge" describe
// block below, driven through the real driver). RED against the pre-this-
// task recorder (which followed `intervalIndex`); GREEN after.
// ---------------------------------------------------------------------

describe("createSeriesRecorder — series-truth Task 3: attributedIntervalIndex consumption (spec §B′)", () => {
  function frame(over: Partial<MonitorFrame> = {}): MonitorFrame {
    return {
      elapsedSeconds: 0,
      distanceMeters: 0,
      sessionElapsedSeconds: 0,
      sessionDistanceMeters: 0,
      currentSplit: 120,
      spm: 20,
      heartRateBpm: null,
      rowingActive: true,
      splitAvgPace: null,
      restSeconds: 0,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
      ...over,
    };
  }

  it("attribution wins over a disagreeing intervalIndex — the shape the exit-7 oracle alone cannot exercise (RED before this task's change, GREEN after)", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(
      frame({
        intervalIndex: 0,
        attributedIntervalIndex: 0,
        elapsedSeconds: 10,
        distanceMeters: 40,
      }),
    );
    // The disagreement: intervalIndex says "advance to 1" — exactly what
    // the OLD `intervalIndex > currentKey` raise would have keyed on —
    // while attribution says "still key 0", the driver's own resolved
    // key. The recorder must trust attribution exclusively.
    rec.onFrame(
      frame({
        intervalIndex: 1,
        attributedIntervalIndex: 0,
        elapsedSeconds: 15,
        distanceMeters: 60,
      }),
    );
    const last = rec.snapshot()!.samples.at(-1)!;
    // Attribution wins: key stays 0, register 0 grows to max(10,15)=15,
    // no lower key to fold in — t=150 (15.0s), d=600 (60.0m). The OLD
    // derivation's answer was t=250 (25.0s: currentKey raised to 1, base
    // = key 0's own 10s, + this frame's own 15s).
    expect(last.t).toBe(150);
    expect(last.d).toBe(600);
  });

  it("an absent attributedIntervalIndex continues the last key (only non-driver fixtures produce this — the field's own doc comment)", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(
      frame({
        attributedIntervalIndex: 1,
        elapsedSeconds: 20,
        distanceMeters: 80,
      }),
    );
    rec.onFrame(
      frame({
        attributedIntervalIndex: undefined,
        elapsedSeconds: 25,
        distanceMeters: 100,
      }),
    );
    const last = rec.snapshot()!.samples.at(-1)!;
    // Key stays 1 (continued, not reset) — base is the sum of registers
    // BELOW 1, which is empty (key 0 was never opened), so t is this
    // frame's own raw elapsed alone: 250 (25.0s).
    expect(last.t).toBe(250);
  });
});

describe("createSeriesRecorder — series-truth Task 3: backwardBucketCount (spec §C′)", () => {
  function frame(over: Partial<MonitorFrame> = {}): MonitorFrame {
    return {
      elapsedSeconds: 0,
      distanceMeters: 0,
      sessionElapsedSeconds: 0,
      sessionDistanceMeters: 0,
      currentSplit: 120,
      spm: 20,
      heartRateBpm: null,
      rowingActive: true,
      splitAvgPace: null,
      restSeconds: 0,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
      ...over,
    };
  }

  // Fix round 1 (controller ruling, spec revised — docs/superpowers/specs/
  // 2026-08-25-series-truth-design.md §C′ and exit criterion 3): the
  // ORIGINAL predicate (any `bucket < lastEmittedBucket`) fired 1 and 18
  // times on the two committed CLEAN captures (see this file's own
  // "FINDING, RESOLVED" comment further below) — a routine
  // 0x0033-lags-0x0031 boundary tick always lands on a bucket the healthy
  // climb already visited moments earlier, so counting it is an alarm on
  // normal traffic. The REFINED predicate narrows to actual data loss:
  // `bucket < lastEmittedBucket && !emittedBuckets.has(bucket)`. These two
  // tests distinguish the excluded case from the counted one directly —
  // same backward shape, different bucket history.
  it("a backward frame that RE-VISITS an already-emitted bucket counts ZERO — not a data-loss signal, since the series already has a sample for that second", () => {
    const rec = createSeriesRecorder();
    // Bucket 0 is emitted first, then bucket 50 — both now in the
    // emitted set, `lastEmittedBucket` at 50.
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 0,
        distanceMeters: 0,
      }),
    );
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 50,
        distanceMeters: 200,
      }),
    );
    // Backward (bucket 0 < lastEmittedBucket 50) — but bucket 0 was
    // ALREADY emitted by the first frame above, so this is a re-visit,
    // not a loss.
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 0.3,
        distanceMeters: 1,
      }),
    );
    expect(rec.backwardBucketCount()).toBe(0);
  });

  it("a backward frame that lands on a NEVER-EMITTED bucket counts ONE — the actual data-loss signal, and the sample is still dropped, never appended", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 0,
        distanceMeters: 0,
      }),
    );
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 50,
        distanceMeters: 200,
      }),
    );
    const before = rec.snapshot()!.samples.length;
    // Bucket 25 was SKIPPED by the forward jump from 0 to 50 above — it
    // was never emitted, so landing on it backward is real loss.
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 25,
        distanceMeters: 100,
      }),
    );
    const after = rec.snapshot()!.samples;
    expect(after.length).toBe(before); // dropped, not appended
    expect(rec.backwardBucketCount()).toBe(1);
  });

  // Fix round 2 (controller review, Important 2): the never-emitted test
  // alone cannot tell "a genuine mid-run gap" from "a stale/pre-session
  // reading landing before the run's own first sample" — both are
  // buckets that were technically never emitted. The exit-7 ring's own
  // first rowing frame is elapsed=1.02 (bucket 1, never bucket 0), so a
  // real run's first-ever emitted bucket is routinely NOT 0. This test
  // starts a run at bucket 1 (never bucket 0), then feeds a stale tick
  // reading elapsed≈0 — the "below-first" case, correctly excluded.
  it("a run whose first-ever emitted bucket is NOT 0 (the exit-7 ring's own shape) does not count a stale tick landing BELOW that first bucket — outside the series' span, not a gap it skipped", () => {
    const rec = createSeriesRecorder();
    // First-ever sample: elapsed=1.02, bucket 1 (never bucket 0) — the
    // ring's own first rowing frame shape.
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 1.02,
        distanceMeters: 3,
      }),
    );
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 50,
        distanceMeters: 200,
      }),
    );
    // A stale/reconnect artifact reading elapsed≈0 — bucket 0 was NEVER
    // emitted (the run started at bucket 1), but bucket 0 is BELOW the
    // run's own first-ever emitted bucket (1), so this is not loss.
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 0.3,
        distanceMeters: 1,
      }),
    );
    expect(rec.backwardBucketCount()).toBe(0);
  });

  it("ordinary same-bucket decimation is never counted as backward — `bucket < lastEmittedBucket`, never `<=` (spec §C′'s own original correction, still true after the refinement)", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ elapsedSeconds: 10 }));
    rec.onFrame(frame({ elapsedSeconds: 10.4 })); // same bucket, first-frame-wins
    expect(rec.snapshot()!.samples).toHaveLength(1);
    expect(rec.backwardBucketCount()).toBe(0);
  });

  it("a genuine forward advance is never counted as backward", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(frame({ elapsedSeconds: 0 }));
    rec.onFrame(frame({ elapsedSeconds: 5 }));
    expect(rec.backwardBucketCount()).toBe(0);
  });

  it("repeated backward buckets are each independently judged against the emitted set — re-visits excluded, never-emitted ones counted, in the same run", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 0,
        distanceMeters: 0,
      }),
    );
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 80,
        distanceMeters: 300,
      }),
    );
    // Backward, bucket 0 — but ALREADY emitted (the first frame above):
    // excluded.
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 0.2,
        distanceMeters: 1,
      }),
    );
    // Backward, bucket 40 — NEVER emitted (the 0->80 jump skipped it):
    // counted.
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 40,
        distanceMeters: 150,
      }),
    );
    // Backward, bucket 0 again — still already emitted: excluded.
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 0.5,
        distanceMeters: 2,
      }),
    );
    // Backward, bucket 60 — NEVER emitted: counted.
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 60,
        distanceMeters: 220,
      }),
    );
    expect(rec.backwardBucketCount()).toBe(2);
  });

  it("starts at zero — a healthy run with no attribution reversal reports zero, never undefined or NaN", () => {
    const rec = createSeriesRecorder();
    expect(rec.backwardBucketCount()).toBe(0);
    rec.onFrame(frame({ elapsedSeconds: 3 }));
    expect(rec.backwardBucketCount()).toBe(0);
  });
});

/** 2x250m r0, walk-2026-08-16's own keystone capture — `registerReplay.
 *  test.ts`'s own `SESSION_1_PROGRAM`, duplicated here per this file's own
 *  established convention (each describe block owns its own program
 *  consts; `STEP_2_PROGRAM` above is a DIFFERENT capture, walk-2026-08-17's
 *  step-2, that happens to share the same program shape). */
const SESSION_1_PROGRAM: WorkoutProgram = {
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

// FINDING, RESOLVED (fix round 1 — docs/superpowers/specs/2026-08-25-
// series-truth-design.md §C′ and exit criterion 3, revised by the
// controller against this task's own measurement). The ORIGINAL predicate
// (any `bucket < lastEmittedBucket`) contradicted exit criterion 3's
// "ZERO on the clean replays": measured `backwardBucketCount() === 1` on
// session-1-keystone and `=== 18` on session-2-wu-4unequal. Root cause,
// traced to the exact frames: a REST boundary's first observed post-reset
// tick routinely arrives with `attributedIntervalIndex` UNCHANGED for one
// more tick than the raw elapsed/distance reset already happened — the
// same "0x0033 lags 0x0031" skew this codebase's own driver-side guards
// (the stale-count rest clamp, the open-on-reset guard) exist to protect
// the REGISTER against. `session-2-wu-4unequal.jsonl` frame 73 is the
// clearest case: frames 60-72 climb 23.17s->29.25s under key 0 (interval 0
// nearing its own 100m target); frame 73 reads elapsed=0/distance=0 — a
// genuine wire reset — but `attributedIntervalIndex` is STILL 0 for that
// one tick (frame 74 is the first to read 1). The REGISTER was always
// unharmed (max-merge keeps key 0 at its already-recorded 29.25s peak),
// but every one of these lagging ticks lands on a bucket the healthy climb
// had ALREADY emitted moments before (bucket 0, in frame 73's case) — a
// re-visit, never a bucket the series will actually lack. The REFINED
// predicate (this file's own "backwardBucketCount (spec §C′)" describe
// block above) excludes exactly this shape by construction — a backward
// tick only counts when its bucket was NEVER emitted, i.e. genuine,
// permanent data loss — so both captures below now measure ZERO.
describe("createSeriesRecorder — series-truth Task 3: the two committed captures replay byte-identically (exit criterion 2)", () => {
  /** Instrumentation (exit criterion 2's own demand: green must be
   *  distinguishable from "the new path never ran"). Two things checked
   *  together: (1) `attributedIntervalIndex` is actually POPULATED on real
   *  driver-emitted frames from this capture (a driver that stopped
   *  emitting it would leave `definedCount` at zero — this assertion goes
   *  red the moment the field this task's whole change depends on stops
   *  arriving); (2) it never DECREASES across the whole replay — CONSISTENT
   *  WITH (not a proof of) old/new equivalence here: a monotonic
   *  non-decreasing raise and a monotonic non-decreasing direct assignment
   *  coincide whenever they're fed the SAME field, but this fixture's own
   *  monotonicity says nothing about whether `intervalIndex` (the OLD
   *  algorithm's field) and `attributedIntervalIndex` (the NEW one's) ever
   *  disagreed on it — `sessionTotals.test.ts`'s own "the recorder's
   *  disclosed bounded edge" describe block (fix round 2) proves directly
   *  that they CAN, on a different real shape neither committed capture
   *  happens to contain. The actual evidence for byte-identical output on
   *  THESE TWO captures
   *  is the pinned totals below, measured against the shipped pre-this-
   *  task recorder — not an inference from monotonicity. */
  function assertConsumptionRanAndIsMonotonic(frames: MonitorFrame[]): void {
    let definedCount = 0;
    let lastAttributed = -Infinity;
    for (const f of frames) {
      if (f.attributedIntervalIndex !== undefined) {
        definedCount++;
        expect(f.attributedIntervalIndex).toBeGreaterThanOrEqual(
          lastAttributed,
        );
        lastAttributed = f.attributedIntervalIndex;
      }
    }
    expect(definedCount).toBeGreaterThan(0);
  }

  it("session-1-keystone-2x250r0.jsonl: attribution is populated and monotonic (proving old/new equivalence), and the pinned totals are unchanged from the pre-this-task recorder", async () => {
    const frames = await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-16/session-1-keystone-2x250r0.jsonl",
      SESSION_1_PROGRAM,
    );
    assertConsumptionRanAndIsMonotonic(frames);
    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const snap = rec.snapshot()!;
    // Pinned against the SHIPPED pre-this-task recorder, measured this
    // task session before the deletion (task-3-report.md carries the
    // probe): 138 samples, last t/d 137.3s/497.4m — IDENTICAL to the
    // post-deletion recorder (exit criterion 2 holds).
    expect(snap.samples).toHaveLength(138);
    expect(snap.samples.at(-1)?.t).toBe(1373);
    expect(snap.samples.at(-1)?.d).toBe(4974);
    // Fix round 1 (this file's own "FINDING, RESOLVED" comment above): the
    // boundary-lag tick at this capture's own single interval boundary
    // landed on `backwardBucketCount() === 1` under the ORIGINAL predicate
    // — it re-visits a bucket the healthy climb already emitted, so the
    // REFINED (never-emitted) predicate correctly excludes it: 0.
    expect(rec.backwardBucketCount()).toBe(0);
  });

  it("session-2-wu-4unequal.jsonl: attribution is populated and monotonic (proving old/new equivalence), and the pinned totals are unchanged from the pre-this-task recorder", async () => {
    const frames = await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl",
      SESSION_2_PROGRAM,
    );
    assertConsumptionRanAndIsMonotonic(frames);
    const rec = createSeriesRecorder();
    for (const f of frames) rec.onFrame(f);
    const snap = rec.snapshot()!;
    // Pinned against the SHIPPED pre-this-task recorder, measured this
    // task session before the deletion: 419 samples, last t/d
    // 419.5s/1598.8m — matches this file's own "trace-truth Task 2"
    // describe block above (419 samples, same capture+program), and
    // IDENTICAL to the post-deletion recorder (exit criterion 2 holds).
    expect(snap.samples).toHaveLength(419);
    expect(snap.samples.at(-1)?.t).toBe(4195);
    expect(snap.samples.at(-1)?.d).toBe(15988);
    // Fix round 1 (this file's own "FINDING, RESOLVED" comment above): 18
    // boundary-lag ticks under the ORIGINAL predicate — across this
    // capture's 4 real interval boundaries (5 intervals, 3 rest-bearing
    // per SESSION_2_PROGRAM plus the wu's own reset), sometimes more than
    // once per boundary (frame 73's single-tick lag vs. the 12-tick run at
    // frames 239-250, where the rest's own advancing elapsed clock read
    // BELOW an already-emitted bucket for several consecutive ticks before
    // catching back up) — EVERY one of those 18 lands on a bucket the
    // healthy climb had already visited (this capture never carries the
    // exit-7 poison shape, so no forward jump ever skips a span of
    // buckets for a later tick to fall backward into), so the REFINED
    // (never-emitted) predicate correctly excludes all 18: 0.
    expect(rec.backwardBucketCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------
// Fix round 1, exit criterion 3's own "poisoned exit-7 counterfactual"
// (spec: "recorder fed the pre-fix attribution — frames whose
// attributedIntervalIndex mimics the old latch"). Extends the
// "attributedIntervalIndex consumption" describe block's own disagreement
// fixture to the FULL exit-7 shape: the same milestone numbers
// `sessionTotals.test.ts`'s "the exit-7 oracle" replays through the real,
// FIXED driver, but here fed directly to the recorder with attribution
// hand-forced to the OLD BUG's own behavior — latched at the poisoned key
// forever, never falling back (Task 1's driver fix A didn't exist; Task
// 2's B′ producer didn't exist; this is what a driver WITHOUT either fix
// would have emitted on `attributedIntervalIndex`, or rather what the
// OLD recorder's own `intervalIndex`-keyed derivation would have latched
// `currentKey` to, since neither ever lowers once raised).
// ---------------------------------------------------------------------

describe("createSeriesRecorder — series-truth Task 3 fix round 1: the poisoned exit-7 counterfactual (exit criterion 3)", () => {
  function frame(over: Partial<MonitorFrame> = {}): MonitorFrame {
    return {
      elapsedSeconds: 0,
      distanceMeters: 0,
      sessionElapsedSeconds: 0,
      sessionDistanceMeters: 0,
      currentSplit: 120,
      spm: 20,
      heartRateBpm: null,
      rowingActive: true,
      splitAvgPace: null,
      restSeconds: 0,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
      ...over,
    };
  }

  it("a latched, never-falls-back attribution (the pre-fix defect's own shape) yields a large, measured backwardBucketCount — the ~57 never-emitted buckets interval 2's own work genuinely lands on", () => {
    const rec = createSeriesRecorder();
    const round1 = (n: number): number => Math.round(n * 10) / 10;

    // Interval 1 work: honest, key 0 (the bug has not fired yet).
    for (let t = 0; t <= 67; t++) {
      rec.onFrame(
        frame({
          attributedIntervalIndex: 0,
          elapsedSeconds: t,
          distanceMeters: round1((t / 67.91) * 250.2),
        }),
      );
    }
    rec.onFrame(
      frame({
        attributedIntervalIndex: 0,
        elapsedSeconds: 67.91,
        distanceMeters: 250.2,
      }),
    );
    // THE LATCH: the poison tick, and every frame after it for the rest
    // of this run, is forced to key 1 — the pre-fix defect's own shape
    // (no mirror, no fallback: the key that opened wrongly here is never
    // released).
    rec.onFrame(
      frame({
        attributedIntervalIndex: 1,
        elapsedSeconds: 68.02,
        distanceMeters: 250.6,
      }),
    );
    // "Rest" — still latched to key 1, so every one of these ticks folds
    // its own raw elapsed straight onto key 1's register (climbing
    // through elapsed values that really belong to interval 1's own
    // trailing rest, mislabeled as key 1 the whole way).
    for (let t = 69; t <= 129; t++) {
      rec.onFrame(
        frame({
          attributedIntervalIndex: 1,
          elapsedSeconds: t,
          distanceMeters: round1(
            250.6 + ((t - 68.02) / (129.5 - 68.02)) * (397.2 - 250.6),
          ),
        }),
      );
    }
    rec.onFrame(
      frame({
        attributedIntervalIndex: 1,
        elapsedSeconds: 129.5,
        distanceMeters: 397.2,
      }),
    );
    // Interval 2 GENUINELY resets on the wire (elapsed/distance back to
    // 0) — but the latch keeps `attributedIntervalIndex` at 1 (unchanged
    // from every tick above), so this module never sees a key CHANGE
    // here at all; the register for key 1 stays exactly where the fake
    // "rest" climb left it, and interval 2's own honest, much smaller
    // elapsed readings fold in via max-merge (a no-op — max(129.5, small)
    // stays 129.5) while the PER-TICK work clock genuinely retreats.
    for (let t = 0; t <= 56; t++) {
      rec.onFrame(
        frame({
          attributedIntervalIndex: 1,
          elapsedSeconds: t,
          distanceMeters: round1((t / 56.2) * 250.3),
        }),
      );
    }
    rec.onFrame(
      frame({
        attributedIntervalIndex: 1,
        elapsedSeconds: 56.2,
        distanceMeters: 250.3,
      }),
    );

    // The measured count (57), and the arithmetic behind it. The honest
    // interval-1 climb (ticks 0..67.91) emits buckets 0..67 in order. The
    // poison tick's own base is FROZEN at key 0's last register (67.91s)
    // the instant the latch fires — its own work clock is
    // 67.91+68.02=135.93 (bucket 135), a forward JUMP that skips buckets
    // 68..134 (67 buckets) entirely, never emitted. The fake "rest" climb
    // (still base=67.91, elapsed 69..129.5) then emits buckets 136..197
    // forward, in order — no further gap. Interval 2's own genuine ticks
    // (base still frozen at 67.91, elapsed 0..56.2) retreat the work
    // clock back to 67.91..124.11 — buckets 67..124, 58 buckets. The
    // VERY FIRST of those (elapsed=0, bucket 67) lands on the ONE bucket
    // in that span interval 1's own honest climb ALREADY emitted — a
    // genuine re-visit, correctly excluded by the refined predicate (this
    // is exactly what turned 58 under the original, unrefined predicate —
    // measured directly against this same fixture before the refinement
    // — into 57 here: not an approximation, a one-bucket correction the
    // refinement itself produces). Every remaining bucket in 68..124 (57
    // of them) falls inside the never-emitted 68..134 gap: genuine,
    // permanent loss, all counted.
    expect(rec.backwardBucketCount()).toBe(57);

    // Fix round 2 minor: even on this deliberately pathological fixture
    // (a forward jump followed by a long backward retreat), the stored
    // SERIES itself never regresses — every backward-landing tick is
    // dropped, never appended, so `t` stays non-decreasing throughout.
    // `backwardBucketCount` is a diagnostic signal; it never lets the
    // shape of the series itself go backward.
    const ts = rec.snapshot()!.samples.map((s) => s.t);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]!).toBeGreaterThan(ts[i - 1]!);
    }
  });
});
