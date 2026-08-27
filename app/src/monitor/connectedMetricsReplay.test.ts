// Connected metrics (2026-08-18) — Task 5, the exit criteria that can run
// without hardware. Design doc: `docs/superpowers/specs/
// 2026-08-18-connected-metrics-design.md`, "Exit criteria" §. This file
// covers criteria 1, 3 and 4 (2 needs the erg, 5 is `screenshots.spec.ts`,
// 6 is the whole-branch gate row).
//
// Deliberately a NEW file beside `registerReplay.test.ts` rather than an
// addition to it (task-5-brief.md's own instruction) — and, following this
// project's own established convention for these replay harnesses (see
// `registerReplay.test.ts`'s own header comment crediting
// `recordReplay.roundtrip.test.ts` as its "harness template" rather than
// importing from it — no test file in `src/monitor/` imports another
// test file), the harness below is a trimmed, independently-typed
// re-derivation of `replaySession`, not an import. What genuinely differs
// from `registerReplay.test.ts`'s own oracle: THIS file's job is the
// DISPLAYED model (`buildSurfaceModel` → `SurfaceModel`), one layer above
// `MonitorFrame` — `registerReplay.test.ts`'s own Task 2 tests already
// prove the frame is right; nothing here re-proves that, it proves the
// pane's own numbers follow from a frame that already is.
//
// GROUND TRUTH (measured this session, independently decoded off
// `session-2-wu-4unequal.jsonl`'s own raw 0x0031/0x0033 bytes via a
// throwaway decode script — the same bytes `registerReplay.test.ts`'s own
// `readGeneralStatus`/`honestRegisters` decode, offsets re-confirmed
// against `domain/monitor/pm5/parse.ts`'s documented 0x0031 layout):
//   - state transitions (GS 0x0031 rx, state byte @8): seq 21 t=15.6s
//     waittobegin; seq 72 t=23.7s work-dist (warm-up, 100m); seq 243
//     t=52.6s work-time (60s piece, program key 1); seq 599 t=112.8s
//     work→rest transition; seq 602 t=113.2s resting (rest after key 1 —
//     CLEAN, not lagged); seq 781 t=143.2s work-time (120s piece, key 2);
//     seq 1489 t=263.1s resting (rest after key 2 — the LAGGED first
//     frame, `registerReplay.test.ts`'s own "interval-referent-monotone"
//     describe block); seq 1668 t=293.0s work-dist (500m piece, key 3);
//     seq 2430 t=422.3s resting (rest after key 3 — also lagged); seq
//     2609 t=452.2s work-time (60s piece, key 4, restSeconds 0); seq 2978
//     t=514.9s end, TWD=1599 (the dispatch's own "1535 work + 64 rest"
//     total).
//   - TWD's own live behaviour (SECONDARY, this decode): frozen across a
//     whole WORK segment (state 4/5) at the value carried over from the
//     segment's own start, while 0x0031's per-interval `distanceMeters`
//     (byte 3 — NOT session-cumulative, `parse.ts:535`) climbs from ~0
//     within that same segment; honestly live and continuously updating
//     during REST (state 3) and at a work→rest transition (state 8),
//     already reflecting the just-finished work distance by then. Cross-
//     checked at the session's own end: TWD=1599 with nothing left to add.
//     `expectedSessionMeters` below encodes exactly this: `twd + dist` for
//     states 4/5, `twd` alone everywhere else — verified against the real
//     replay run before this file's tests were trusted (see the four
//     checkpoints' own comments).
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import { GENERAL_STATUS_UUID } from "../../domain/monitor/pm5/uuids.js";
import { fmtSplit } from "../../domain/format.js";
import type { EnginePhase } from "../session/engine";
import {
  buildSurfaceModel,
  type SurfaceStatus,
} from "../workout/connected/surfaceModel";
import { createEventLog, type MonitorEventLog } from "./eventLog";
import { createPm5Driver } from "./driver";
import {
  fromHexString,
  parseRecording,
  type ParsedRecording,
} from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";

/** Same path-surgery idiom as `registerReplay.test.ts` (this file lives
 *  beside it, one directory count identical). */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/connectedMetricsReplay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-16/",
  );

/** Hand-transcribed, identical to `registerReplay.test.ts`'s own
 *  `SESSION_2_PROGRAM` (that file's own header comment carries the
 *  provenance: HANDOFF.md's program shape plus a byte-for-byte decode of
 *  every `ce060021` programming tx against `commands.ts`'s
 *  `buildIntervalBlock` encoding). Re-declared, not imported — this
 *  project's own convention for these harnesses (see this file's header). */
const SESSION_2_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      // Phase WU: transcribed `type: "warmup"` from the capture; the union
      // has no such member now, so it reads `work`. Everything else is
      // byte-identical, `targetSplit: null` included — that null is what
      // makes the replay reproduce the recorded tx bytes exactly, because
      // `program.ts`'s warm-up arm only ever NULLED `targetSplit` and
      // `commands.ts:183` sends the same `NO_TARGET_PACE_SECONDS = 0`
      // sentinel for a target-less effort interval. `divergences` stays
      // empty.
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

/** `EnginePhase[]` mirroring `SESSION_2_PROGRAM` one-for-one — the shape
 *  `surfaceModel.ts`'s own `phaseIndexForInterval` expects (rest phases
 *  interleaved only where `restSeconds > 0`, exactly `surfaceModel.
 *  test.ts`'s own hand-built `EnginePhase[]` literals do for a synthetic
 *  fixture, e.g. that file's "stops notching..." test). Every work phase's
 *  `targetSplit` is 129 — the SAME wire-verified value on every one of
 *  session 2's four work pieces (this file's own header comment; the
 *  hand-transcription cites `commands.ts`'s decoded tx bytes), so this
 *  fixture cannot distinguish "this interval's target" from "the adjacent
 *  interval's target" by VALUE alone (empirically confirmed, task-5-report.
 *  md's mutation-probe log: swapping `finishedWorkPhase` to `phaseIndex + 1`
 *  leaves both this file's own criterion-3 tests AND `surfaceModel.test.ts`'s
 *  "rest after a completed interval" test green, since Filling Low's own
 *  neighbouring work targets also coincide). The mutation IS caught, by a
 *  DIFFERENT existing test — `surfaceModel.test.ts`'s "rest before any
 *  WORK interval completes" — via the suppression guard, not a differing
 *  value; see task-5-report.md. */
const CM_PHASES: EnginePhase[] = [
  // Phase WU: was `{ type: "warmup", ..., originalIndex: -1 }`, where -1 was
  // `engine.ts`'s deleted `WARMUP_ORIGINAL_INDEX` sentinel. An ordinary work
  // phase needs a real index; 0 collides with the piece below, which is
  // inert here (nothing this harness reads consults `originalIndex`).
  { type: "work", meters: 100, label: "Easy", originalIndex: 0 },
  {
    type: "work",
    seconds: 60,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 0,
  },
  { type: "rest", seconds: 30, label: "Rest", originalIndex: 0 },
  {
    type: "work",
    seconds: 120,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 1,
  },
  { type: "rest", seconds: 30, label: "Rest", originalIndex: 1 },
  {
    type: "work",
    meters: 500,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 2,
  },
  { type: "rest", seconds: 30, label: "Rest", originalIndex: 2 },
  {
    type: "work",
    seconds: 60,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 3,
  },
];

const DEVICE = "PM5 432331249";
const STATUS: SurfaceStatus = "live";

interface MachineReading {
  seq: number;
  t: number;
  distanceMeters: number;
  stateByte: number;
  twdMeters: number;
}

/** u24LE read, re-implemented (not imported from `parse.ts`) — the same
 *  independent-oracle stance `registerReplay.test.ts`'s own
 *  `readU24LE`/`readGeneralStatus` take, restated here rather than shared
 *  (this file's header comment). */
function readU24LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}

/** Every 0x0031 rx notification, decoded straight off the recording's raw
 *  hex: distance u24LE@3 (×0.1m), state byte @8, TWD u24LE@11 (whole m) —
 *  `parse.ts`'s documented layout, `registerReplay.test.ts`'s own
 *  `readGeneralStatus` decodes the identical bytes. */
function readGeneralStatus(recording: ParsedRecording): MachineReading[] {
  const readings: MachineReading[] = [];
  for (const event of recording.events) {
    if (!("dir" in event) || event.dir !== "rx") continue;
    if (event.char !== GENERAL_STATUS_UUID) continue;
    const bytes = fromHexString(event.hex);
    if (bytes.length !== 19) continue;
    readings.push({
      seq: event.seq,
      t: event.t,
      distanceMeters: readU24LE(bytes, 3) / 10,
      stateByte: bytes[8]!,
      twdMeters: readU24LE(bytes, 11),
    });
  }
  return readings;
}

/** The independent, mid-session oracle for "the machine's own session
 *  meters" (exit criterion 1's own words) — deliberately NOT the raw TWD
 *  alone, which this file's header comment (and the design spec's own
 *  "Honest limits") documents as frozen for the whole span of a WORK
 *  segment (state 4/5). `distanceMeters` (0x0031 byte 3) is per-interval,
 *  resetting to ~0 at each WORK start and free-running through that
 *  segment — added back on top of the frozen TWD reconstructs the true
 *  running total for a mid-work instant; every other state has already
 *  "caught up" (TWD alone is honest there), so no add is needed. */
function expectedSessionMeters(r: MachineReading): number {
  if (r.stateByte === 4 || r.stateByte === 5) {
    return r.twdMeters + r.distanceMeters;
  }
  return r.twdMeters;
}

function readingAtSeq(readings: MachineReading[], seq: number): MachineReading {
  const r = readings.find((x) => x.seq === seq);
  if (!r)
    throw new Error(`readingAtSeq: no General Status reading at seq ${seq}`);
  return r;
}

interface DriverFrameSample {
  tMs: number;
  frame: MonitorFrame;
}

/** Same "no frame within tolerance is a silent-wrong-answer hazard" stance
 *  `registerReplay.test.ts`'s own `nearestFrameSample` takes. */
const NEAREST_SAMPLE_TOLERANCE_MS = 1000;

function frameAtGeneralStatusSeq(
  parsed: ParsedRecording,
  frameSamples: DriverFrameSample[],
  seq: number,
): DriverFrameSample {
  const event = parsed.events.find(
    (e) =>
      e.seq === seq &&
      "dir" in e &&
      e.dir === "rx" &&
      e.char === GENERAL_STATUS_UUID,
  );
  if (!event || !("t" in event)) {
    throw new Error(
      `frameAtGeneralStatusSeq: no General Status rx event with seq ${seq}`,
    );
  }
  let best: DriverFrameSample | null = null;
  let bestDiff = Infinity;
  for (const s of frameSamples) {
    const diff = Math.abs(s.tMs - event.t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  if (!best || bestDiff > NEAREST_SAMPLE_TOLERANCE_MS) {
    throw new Error(
      `frameAtGeneralStatusSeq: no driver frame within ${NEAREST_SAMPLE_TOLERANCE_MS}ms of seq ${seq} (t=${event.t}ms)`,
    );
  }
  return best;
}

/** The harness template (`registerReplay.test.ts`'s own doc comment
 *  credits `recordReplay.roundtrip.test.ts`): `scan()` then `connect()` at
 *  the transport level, `now`/`schedule` bound to the replay clock so
 *  every clock-reading predicate in the driver runs on the SAME virtual
 *  clock the recorded `t` values replay against. */
async function replaySession(
  fileName: string,
  program: WorkoutProgram,
): Promise<{
  result: ReplayResult;
  log: MonitorEventLog;
  readings: MachineReading[];
  frameSamples: DriverFrameSample[];
  parsed: ParsedRecording;
}> {
  const text = readFileSync(`${SESSIONS_DIR}${fileName}`, "utf8");
  const parsed = parseRecording(text);
  const readings = readGeneralStatus(parsed);

  const replay = createReplayTransport(parsed);
  const [dev] = await replay.transport.scan();
  await replay.transport.connect(dev.id);

  const log = createEventLog();
  const driver = createPm5Driver(replay.transport, log, {
    deviceName: dev.name,
    now: () => replay.clock.now(),
    schedule: (cb, ms) => replay.clock.schedule(cb, ms),
  });

  const frameSamples: DriverFrameSample[] = [];
  driver.events((e) => {
    if (e.kind === "frame") {
      frameSamples.push({ tMs: replay.clock.now(), frame: e.frame });
    }
  });

  const programPending = driver.program(program);
  const result = await replay.run();
  await programPending;

  return { result, log, readings, frameSamples, parsed };
}

describe("connected metrics — replay-based exit criteria (session-2-wu-4unequal.jsonl)", () => {
  let ctx: Awaited<ReturnType<typeof replaySession>>;

  beforeAll(async () => {
    ctx = await replaySession("session-2-wu-4unequal.jsonl", SESSION_2_PROGRAM);
  });

  it("sanity: the replay produced a real, non-trivial frame count and zero tx divergences", () => {
    // Bug-independent first (this project's own convention throughout
    // `registerReplay.test.ts`): if this fails, the fixture or harness is
    // wrong, not the model under test.
    expect(ctx.result.divergences).toStrictEqual([]);
    expect(ctx.frameSamples.length).toBeGreaterThan(900);
  });

  // ==========================================================================
  // CRITERION 1 — mid-session totals, never an end-of-session-only equality
  // ==========================================================================
  //
  // Named GS (0x0031) sequence numbers, not recording-clock seconds picked
  // for convenience: seq 1117 sits deep inside the 120s work piece (which
  // runs seq 781→1489, t=143.2s→263.1s — seq 1117/t≈200.1s is close to its
  // own midpoint, 203.15s), seq 2004 deep inside the 500m distance piece
  // (seq 1668→2430, t=293.0s→422.3s), seq 743 mid the FIRST rest (clean,
  // t=113.2s→143.2s), and seq 1531 well past the lagged rest-onset frame at
  // seq 1489 (still inside the same rest, t=263.1s→293.0s). Two of each
  // kind, from two different intervals, so neither pass is a coincidence of
  // one segment's own arithmetic.

  describe("criterion 1: the displayed total tracks the machine's own reconstructed session meters, mid-session", () => {
    it.each([
      { seq: 1117, label: "mid-work, the 120s piece (program key 2)" },
      { seq: 2004, label: "mid-work, the 500m piece (program key 3)" },
      { seq: 743, label: "mid-rest, the clean rest after key 1" },
      { seq: 1531, label: "mid-rest, well past the lagged onset after key 2" },
    ])("$label (GS seq $seq)", ({ seq }) => {
      const reading = readingAtSeq(ctx.readings, seq);
      const sample = frameAtGeneralStatusSeq(ctx.parsed, ctx.frameSamples, seq);

      const model = buildSurfaceModel({
        phases: CM_PHASES,
        program: SESSION_2_PROGRAM,
        status: STATUS,
        linkLost: false,
        frame: sample.frame,
        deviceName: DEVICE,
        actuals: [],
      });

      const expected = expectedSessionMeters(reading);
      expect(model.sessionDistanceMeters).not.toBeNull();
      const diff = Math.abs(model.sessionDistanceMeters! - expected);
      if (diff > 1.5) {
        throw new Error(
          `seq ${seq}: displayed total=${model.sessionDistanceMeters}m vs ` +
            `reconstructed machine total=${expected}m (diff ${diff.toFixed(1)}m, tolerance 1.5m)`,
        );
      }
    });
  });

  // ==========================================================================
  // CRITERION 3 — the AVG shown during a rest equals the interval that just
  // finished, sampled at the FIRST resting frame explicitly
  // ==========================================================================
  //
  // GS seq 1489 and 2430 ARE the first resting frame of their own rests
  // (`registerReplay.test.ts`'s own "interval-referent-monotone" describe
  // block names both by seq) — the two of session 2's three rests that
  // begin with the lagged frame (dispatch ground truth: "3 rest entries of
  // which 2 begin with the ... lagged frame"). Sampling anything later
  // would sample past the exact defect this criterion exists to catch.

  describe("criterion 3: AVG at the FIRST resting frame equals the finished interval's own average", () => {
    it("seq 1489 (rest after key 2, the 120s piece): AVG is 129.89 s/500m, judged SLOWER against that interval's own 129s target", () => {
      const reading = readingAtSeq(ctx.readings, 1489);
      const sample = frameAtGeneralStatusSeq(
        ctx.parsed,
        ctx.frameSamples,
        1489,
      );

      // Bug-independent preconditions first: this frame is genuinely the
      // rest that just finished interval 2 (mutation-probe target 1 — a
      // reverted referent clamp fails HERE, before the AVG assertion below
      // even runs).
      expect(reading.stateByte).toBe(3);
      expect(sample.frame.state).toBe("resting");
      expect(sample.frame.intervalIndex).toBe(2);

      // THE VALUE, ±0.2s against the replay's own boundary record (the
      // dispatch's ground truth, independently re-confirmed by
      // `registerReplay.test.ts`'s own "fix round 1, finding B" test at
      // this exact seq).
      expect(sample.frame.splitAvgPace).not.toBeNull();
      expect(Math.abs(sample.frame.splitAvgPace! - 129.89)).toBeLessThanOrEqual(
        0.2,
      );

      const model = buildSurfaceModel({
        phases: CM_PHASES,
        program: SESSION_2_PROGRAM,
        status: STATUS,
        linkLost: false,
        frame: sample.frame,
        deviceName: DEVICE,
        actuals: [],
      });
      expect(model.avg.absent).toBe(false);
      expect(model.avg.display).toBe(fmtSplit(sample.frame.splitAvgPace!));
      expect(model.avg.judgement).toBe("slower");
    });

    it("seq 2430 (rest after key 3, the 500m piece): AVG is 128.82 s/500m, judged WITHIN target (inside the 0.5s band)", () => {
      const reading = readingAtSeq(ctx.readings, 2430);
      const sample = frameAtGeneralStatusSeq(
        ctx.parsed,
        ctx.frameSamples,
        2430,
      );

      expect(reading.stateByte).toBe(3);
      expect(sample.frame.state).toBe("resting");
      expect(sample.frame.intervalIndex).toBe(3);

      expect(sample.frame.splitAvgPace).not.toBeNull();
      expect(Math.abs(sample.frame.splitAvgPace! - 128.82)).toBeLessThanOrEqual(
        0.2,
      );

      const model = buildSurfaceModel({
        phases: CM_PHASES,
        program: SESSION_2_PROGRAM,
        status: STATUS,
        linkLost: false,
        frame: sample.frame,
        deviceName: DEVICE,
        actuals: [],
      });
      expect(model.avg.absent).toBe(false);
      expect(model.avg.display).toBe(fmtSplit(sample.frame.splitAvgPace!));
      expect(model.avg.judgement).toBe("within");
    });
  });

  // ==========================================================================
  // CRITERION 4 — a zero average renders nothing
  // ==========================================================================
  //
  // GS seq 72 is the warm-up's own first "work-dist" frame (t=23.7s) — well
  // inside the capture's own first twelve consecutive zero-average frames
  // (dispatch ground truth), a genuine wire `0.00` (`0x0033`'s own "no
  // sample yet" value), not a `null`.

  describe("criterion 4: a zero average renders nothing", () => {
    it("seq 72 (warm-up, rowing, splitAvgPace genuinely 0): AVG is absent — nothing to render", () => {
      const reading = readingAtSeq(ctx.readings, 72);
      const sample = frameAtGeneralStatusSeq(ctx.parsed, ctx.frameSamples, 72);

      expect(reading.stateByte).toBe(5);
      expect(sample.frame.state).toBe("rowing");
      expect(sample.frame.splitAvgPace).toBe(0);

      const model = buildSurfaceModel({
        phases: CM_PHASES,
        program: SESSION_2_PROGRAM,
        status: STATUS,
        linkLost: false,
        frame: sample.frame,
        deviceName: DEVICE,
        actuals: [],
      });
      expect(model.avg.absent).toBe(true);
      expect(model.avg.display).toBe("—");
    });
  });
});
