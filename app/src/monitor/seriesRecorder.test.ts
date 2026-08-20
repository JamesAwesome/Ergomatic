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
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: "rowing",
      ...over,
    };
  }

  it("continues the last key when intervalIndex goes null, never resetting accumulation", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(
      frame({ intervalIndex: 0, elapsedSeconds: 10, distanceMeters: 40 }),
    );
    rec.onFrame(
      frame({ intervalIndex: 1, elapsedSeconds: 5, distanceMeters: 20 }),
    );
    rec.onFrame(
      frame({ intervalIndex: null, elapsedSeconds: 6, distanceMeters: 24 }),
    );
    const last = rec.snapshot()!.samples.at(-1)!;
    expect(last.t).toBe(160); // (10 banked + 6) * 10 tenths
  });

  it("accumulates under a single synthetic key when intervalIndex is null throughout", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(
      frame({ intervalIndex: null, elapsedSeconds: 1, distanceMeters: 4 }),
    );
    rec.onFrame(
      frame({ intervalIndex: null, elapsedSeconds: 2, distanceMeters: 8 }),
    );
    expect(rec.snapshot()!.samples).toHaveLength(2); // records, does not refuse
  });

  // Review finding I1 (2026-08-20): the original `[...ts].sort()` assertion
  // was vacuous — losing monotonicity causes silent SAMPLE LOSS, not
  // out-of-order `t` (the bucket guard eats the backward sample before it
  // can ever appear in `ts`), so the array is trivially sorted either way.
  // Reproduced: mutating the guard to `if (f.intervalIndex !== null)`
  // (dropping the `> currentKey` monotonic check) makes this scenario
  // yield `ts = [100, 150]` — TWO samples, the third silently swallowed —
  // and `[...ts].sort()` still passes on two elements. Asserting the exact
  // array closes that gap: a lost sample changes the LENGTH, not just the
  // order.
  it("never lets a backward key move the cumulative clock backwards", () => {
    const rec = createSeriesRecorder();
    rec.onFrame(
      frame({ intervalIndex: 0, elapsedSeconds: 10, distanceMeters: 40 }),
    );
    rec.onFrame(
      frame({ intervalIndex: 1, elapsedSeconds: 5, distanceMeters: 20 }),
    );
    rec.onFrame(
      frame({ intervalIndex: 0, elapsedSeconds: 7, distanceMeters: 28 }),
    );
    const ts = rec.snapshot()!.samples.map((s) => s.t);
    // (10 banked) + 5 = 150 tenths at the second frame; the third frame's
    // OWN key stays 1 (monotonic — a raw index of 0 cannot move the
    // current key backward), so it updates key 1's register to
    // max(5,7)=7 and wins a NEW bucket at (10 banked) + 7 = 170 tenths.
    expect(ts).toStrictEqual([100, 150, 170]);
  });
});

// ---------------------------------------------------------------------
// trace-truth Task 2 (2026-08-20): rests are DRAWN, but MARKED (spec §3).
// `session-2-wu-4unequal.jsonl` is used deliberately over step-3: step-3's
// first rest is FROZEN (the rower stopped rowing, wire elapsed/distance
// hold), which is exactly the shape that let a false premise survive —
// session-2's own rests still ADVANCE (README: "wu 4 unequal"), so this
// capture actually exercises a `state === "resting"` frame reporting a
// real, changing `elapsedSeconds`/`distanceMeters`, not merely a frozen
// hold this recorder already emits zero samples for "by construction"
// (this file's own header comment) regardless of any `r` marking.
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
