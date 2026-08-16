// The stale-count rest fix spec, Stage B (2026-08-16, rest-keying-fix Task
// 1): the two walk-2026-08-16 recordings become permanent CI regression
// tests, replayed through the REAL `createPm5Driver` via
// `createReplayTransport` — the Stage A round-trip harness shape
// (`recordReplay.roundtrip.test.ts`).
//
// SESSION 2 IS DELIBERATELY RED ON UNMODIFIED CODE. It replays a captured
// walk where the driver mis-keys two work→rest boundaries (diagnosed in
// the spec, `docs/superpowers/specs/2026-08-16-rest-keying-fix-design.md`),
// inflating the session accumulator by +221 m (1819.7 m vs the machine's
// own 1599 m). The fix lands in Task 2 (`driver.ts`'s stale-count rest
// clamp); THIS file's job is only the oracle and the two replay tests, so
// every `it` under "session 2" is expected to FAIL until that fix lands —
// each one is structured so the it()-level result, not just an individual
// `expect`, is red today: the assertion order inside each test puts a
// bug-independent sanity check first (so a real coding mistake in the
// oracle itself would still show up before the bug-dependent one silently
// masks it) and the bug-DEPENDENT assertion last, so failing on unmodified
// code stops the test at exactly the line that carries the diagnostic
// number. Session 1 (the keystone, r0 throughout, no resting frames at
// all) is unaffected by the bug and its describe block is green today AND
// after the fix — see the spec's own "digit-identical before and after"
// claim.
//
// ============================================================================
// THE INDEPENDENT READER — the test's oracle, deliberately kept apart from
// the code under test
// ============================================================================
//
// `readGeneralStatus`/`honestRegisters` below decode 0x0031 (General
// Status) payloads directly off the recording's raw hex and re-derive a
// per-interval register map with NO help from the driver: no
// `intervalCount` (0x0033), no `toProgramIndex`, no driver event, no
// driver frame. The offsets are re-implemented here from
// `domain/monitor/pm5/parse.ts`'s documented 0x0031 layout (elapsed u24LE
// @0, ×0.01s; distance u24LE @3, ×0.1m; state byte @8; TWD u24LE @11,
// whole m) — read to CHOOSE which layout and which WORKOUTSTATE ordinals
// belong to which bucket, never imported: `parse.ts`'s own `readU24LE`,
// `WORKOUTSTATE_TO_STATE` table and `toMonitorState` function are not used
// anywhere below. Segmentation uses the same reset rule
// `captureReplay.test.ts` already established for a different capture
// shape (elapsed drop AND distance drop — the AND is load-bearing: session
// 2 contains three pseudo-drops, at recording-clock t≈137.1/285.4/456.3,
// where only one of the two decreases, and the AND-rule must reject all
// three or the segment count comes out wrong).

import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import { GENERAL_STATUS_UUID } from "../../domain/monitor/pm5/uuids.js";
import { createEventLog, type MonitorEventLog } from "./eventLog";
import { createPm5Driver } from "./driver";
import {
  fromHexString,
  parseRecording,
  type ParsedRecording,
} from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";

/** Repo-root recordings, resolved relative to THIS file (`captureReplay.
 *  test.ts:112-117`'s own idiom: plain string surgery on `import.meta.url`,
 *  never the global `URL` constructor — this project's jsdom environment
 *  resolves `new URL(...)` against `http://localhost:3000/` instead of the
 *  given `file://` base). `docs/monitor/sessions/walk-2026-08-16/` lives
 *  three directories above `app/src/monitor/` — up out of `monitor/`,
 *  `src/`, and `app/` to the repo root, then down into `docs/`. */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/registerReplay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-16/",
  );

/** The armed program is HAND-TRANSCRIBED — both committed captures carry no
 *  `header.program` (premise pass, 2026-08-16: grep for `"program"` across
 *  both files returns zero matches; only the Stage A synthetic round-trip
 *  test ever had one, because it built its own header). These two literals
 *  are transcribed from two independent sources: HANDOFF.md's own program
 *  shape (type/kind/value/restSeconds), AND this file's author decoding the
 *  recordings' own `ce060021` (RECEIVE_CHARACTERISTIC_UUID) programming tx
 *  bytes by hand against `domain/monitor/pm5/commands.ts`'s
 *  `buildIntervalBlock` encoding — confirming `targetSplit: 129` (wire
 *  `06 04 00 00 32 64` = 12900 centiseconds/500m = 2:09/500m) on every
 *  work interval in both sessions, and `targetSplit: null` on session 2's
 *  warm-up (wire `06 04 00 00 00 00` = the `NO_TARGET_PACE_SECONDS`
 *  sentinel `commands.ts` sends for a null target). This second check
 *  matters because the replay engine's `result.divergences` compares the
 *  driver's own `program()` writes BYTE-FOR-BYTE against the recorded tx
 *  events — a plausible-looking but wrong `targetSplit` would silently fail
 *  the "zero divergences" assertion, not the register-map one. */
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

/** Independent 0x0031 reader. Reads hex payloads ONLY. Forbidden:
 *  `intervalCount`, `toProgramIndex`, driver output. */
interface MachineReading {
  t: number;
  elapsedSeconds: number;
  distanceMeters: number;
  stateByte: number;
  twdMeters: number;
}

/** Little-endian 24-bit read, re-implemented here (not imported from
 *  `parse.ts`) so this oracle owns its own decode of the bytes it is
 *  independently characterizing. */
function readU24LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}

/** Decodes every 0x0031 rx notification in the recording: elapsed u24LE@0
 *  (×0.01s), distance u24LE@3 (×0.1m), state byte @8, TWD u24LE@11 (whole
 *  m) — offsets per `parse.ts`'s documented layout, re-implemented here. A
 *  malformed (wrong-length) payload is skipped, the same defensive stance
 *  `parse.ts`'s own `checkLength` takes, never guessed at. */
function readGeneralStatus(recording: ParsedRecording): MachineReading[] {
  const readings: MachineReading[] = [];
  for (const event of recording.events) {
    if (!("dir" in event) || event.dir !== "rx") continue;
    if (event.char !== GENERAL_STATUS_UUID) continue;
    const bytes = fromHexString(event.hex);
    if (bytes.length !== 19) continue;
    readings.push({
      t: event.t,
      elapsedSeconds: readU24LE(bytes, 0) / 100,
      distanceMeters: readU24LE(bytes, 3) / 10,
      stateByte: bytes[8]!,
      twdMeters: readU24LE(bytes, 11),
    });
  }
  return readings;
}

/** This file's OWN `OBJ_WORKOUTSTATE_T` ordinal -> bucket mapping —
 *  independently authored, not imported from `parse.ts`'s
 *  `WORKOUTSTATE_TO_STATE`/`toMonitorState`. The ordinals are the same ones
 *  `parse.ts`'s table names (read to CHOOSE which numbers belong to which
 *  bucket — a PRIMARY-cited BLE Appendix A fact, not this file's own
 *  invention), but this file writes its own lookup rather than calling that
 *  function, so the oracle cannot silently inherit a driver-side bug in the
 *  mapping itself. Ephemeral transition states (6/7/8/9) are grouped with
 *  their ROOT state (resting/rowing respectively), matching `parse.ts`'s
 *  own grouping. */
const ROWING_ORDINALS = new Set([1, 4, 5, 8, 9]);
const RESTING_ORDINALS = new Set([3, 6, 7]);
const FINISHED_ORDINALS = new Set([10, 12]);

function isCountedState(stateByte: number): boolean {
  return (
    ROWING_ORDINALS.has(stateByte) ||
    RESTING_ORDINALS.has(stateByte) ||
    FINISHED_ORDINALS.has(stateByte)
  );
}

interface HonestRegister {
  elapsedSeconds: number;
  distanceMeters: number;
}

/** Any decrease past floating noise counts as a "drop" — `captureReplay.
 *  test.ts`'s own noise-floor reasoning (its `ELAPSED_DROP_THRESHOLD_
 *  SECONDS` picks a much coarser 2s floor because IT tolerates ordinary
 *  0x0031 jitter as a non-boundary; here the AND-rule itself is what
 *  rejects jitter and pseudo-drops, so a tight epsilon is enough — verified
 *  empirically against both recordings' full drop populations before this
 *  file was written: the tightest genuine reset drop is 3.15s (elapsed) /
 *  259.0m (distance) in session 2, and the largest pseudo-drop this rule
 *  must reject is 5.97s elapsed with a TRUE ZERO distance delta — nothing
 *  between 0.005 and 3.15 exists in either recording's real-reset
 *  population, so this epsilon is not a coincidence of one capture). */
const DROP_EPSILON = 0.005;

/** Segments `readings` on `elapsed drop AND distance drop` (the AND-rule):
 *  a real reset requires BOTH to decrease across consecutive frames. Per
 *  segment, takes the MAX of elapsed and of distance over frames whose
 *  state byte is rowing/resting/finished (never the last-before-reset
 *  reading — a mid-rest re-base can make LAST disagree with the true
 *  running max within that segment). Maps segment k -> key k. */
function honestRegisters(
  readings: MachineReading[],
): Map<number, HonestRegister> {
  const boundaries: number[] = [];
  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1]!;
    const cur = readings[i]!;
    const elapsedDrop = prev.elapsedSeconds - cur.elapsedSeconds;
    const distanceDrop = prev.distanceMeters - cur.distanceMeters;
    if (elapsedDrop > DROP_EPSILON && distanceDrop > DROP_EPSILON) {
      boundaries.push(i);
    }
  }

  const starts = [0, ...boundaries];
  const ends = [...boundaries, readings.length];
  const registers = new Map<number, HonestRegister>();
  for (let key = 0; key < starts.length; key++) {
    const segment = readings
      .slice(starts[key]!, ends[key]!)
      .filter((r) => isCountedState(r.stateByte));
    if (segment.length === 0) continue;
    registers.set(key, {
      elapsedSeconds: Math.max(...segment.map((r) => r.elapsedSeconds)),
      distanceMeters: Math.max(...segment.map((r) => r.distanceMeters)),
    });
  }
  return registers;
}

/** Matches the driver's own `n()` rounding in `recordFinalTotals`
 *  (`driver.ts`'s `final-totals` log entry, `Number(v.toFixed(1))`) so the
 *  oracle's registers compare against the driver's LOGGED text at the same
 *  precision the driver itself chose to report, rather than an
 *  artificially tighter one this file invents. */
function round1(v: number): number {
  return Number(v.toFixed(1));
}

function honestRegistersRounded(
  readings: MachineReading[],
): Map<number, HonestRegister> {
  const rounded = new Map<number, HonestRegister>();
  for (const [key, r] of honestRegisters(readings)) {
    rounded.set(key, {
      elapsedSeconds: round1(r.elapsedSeconds),
      distanceMeters: round1(r.distanceMeters),
    });
  }
  return rounded;
}

// ============================================================================
// REGISTER-MAP ACCESS PATH: `final-totals` log parsing (chosen path)
// ============================================================================
//
// `recordFinalTotals` (`driver.ts`) logs one `"final-totals"` ring entry at
// every terminal transition: `accumulator=<n>m ... registers=<count> of
// <programmed> programmed 0:(65.3s,249.8m) 1:(72.5s,250.0m) ...` — chosen
// over the fallback (`sessionElapsedSeconds`/`sessionDistanceMeters` off
// the last emitted frame plus the checkpoint series) because it is the
// ONE place the driver states its own per-key register map as data, not
// just the session-wide sum a checkpoint series can only reconstruct
// approximately. The checkpoint series is still used below, but for the
// per-instant TWD-tracking assertion the spec actually asks for, not as a
// substitute for reading the registers directly. A run can log TWO
// near-identical `final-totals` entries (`recordFinalTotals`'s own doc
// comment, the diagnostic-only END + machine-frame double-write) — this
// file always takes the LAST one, which reflects the fully-settled state
// either way.

interface FinalTotals {
  accumulatorMeters: number;
  registers: Map<number, HonestRegister>;
}

function parseFinalTotals(log: MonitorEventLog): FinalTotals {
  const entries = log.entries().filter((e) => e.kind === "final-totals");
  const last = entries[entries.length - 1];
  if (!last) {
    throw new Error("registerReplay: no final-totals entry was logged");
  }
  const accMatch = /accumulator=([\d.]+)m/.exec(last.detail);
  if (!accMatch) {
    throw new Error(
      `registerReplay: final-totals entry has no accumulator field: ${last.detail}`,
    );
  }
  const registers = new Map<number, HonestRegister>();
  const registerPattern = /(\d+):\(([\d.]+)s,([\d.]+)m\)/g;
  let match: RegExpExecArray | null;
  while ((match = registerPattern.exec(last.detail))) {
    registers.set(Number(match[1]), {
      elapsedSeconds: Number(match[2]),
      distanceMeters: Number(match[3]),
    });
  }
  return { accumulatorMeters: Number(accMatch[1]), registers };
}

/** The clamp's own detail string (`driver.ts`, Task 2's exact literal):
 *  `stale-count rest clamp: resting key ${activeKey} lifted to
 *  ${newestKey} (count lags state at the boundary)`. Extracts the CLAMPED
 *  key (the one that was too low, not the one it was lifted to) from every
 *  matching `"divergence"` log entry — never matches the pre-existing
 *  open-on-reset guard's own `"divergence"` entries (`key N refused open:
 *  ...`), which carry no "stale-count rest clamp" text. On UNMODIFIED code
 *  this returns the empty set: the clamp does not exist yet. */
function clampedKeys(log: MonitorEventLog): Set<number> {
  const keys = new Set<number>();
  for (const entry of log.entries()) {
    if (entry.kind !== "divergence") continue;
    const match =
      /^stale-count rest clamp: resting key (\d+) lifted to \d+/.exec(
        entry.detail,
      );
    if (match) keys.add(Number(match[1]));
  }
  return keys;
}

interface DriverFrameSample {
  tMs: number;
  frame: MonitorFrame;
}

function nearestReading(
  readings: MachineReading[],
  targetMs: number,
): MachineReading {
  let best = readings[0]!;
  let bestDiff = Infinity;
  for (const r of readings) {
    const diff = Math.abs(r.t - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

function nearestFrameSample(
  samples: DriverFrameSample[],
  targetMs: number,
): DriverFrameSample {
  let best = samples[0]!;
  let bestDiff = Infinity;
  for (const s of samples) {
    const diff = Math.abs(s.tMs - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

/** The harness template (`recordReplay.roundtrip.test.ts`): `scan()` then
 *  `connect()` at the transport level (MonitorDriver has no `connect()` of
 *  its own), `now`/`schedule` bound to `replay.clock` so the driver's finish
 *  grace and every other clock-reading predicate run on the SAME virtual
 *  clock the recorded `t` values are replayed against. Every `"frame"`
 *  driver event is captured, keyed by the replay clock's reading at the
 *  moment it fired (which equals the originating rx event's own recorded
 *  `t`, since `advanceClock` sets the clock to that `t` before delivering
 *  the notification) — this is how the eight-checkpoint assertion below
 *  reconstructs "what the driver's own session distance read at
 *  recording-time T" without polling anything. */
async function replaySession(
  fileName: string,
  program: WorkoutProgram,
): Promise<{
  result: ReplayResult;
  log: MonitorEventLog;
  readings: MachineReading[];
  frameSamples: DriverFrameSample[];
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

  return { result, log, readings, frameSamples };
}

describe("session 1 (keystone, 2x250m r0): the replay is clean before and after the fix", () => {
  let ctx: Awaited<ReturnType<typeof replaySession>>;

  beforeAll(async () => {
    ctx = await replaySession(
      "session-1-keystone-2x250r0.jsonl",
      SESSION_1_PROGRAM,
    );
  });

  it("replays through the real driver with zero tx divergences, two segments, and a final register map matching the independent reader's honest totals", () => {
    expect(ctx.result.divergences).toStrictEqual([]);

    const honest = honestRegistersRounded(ctx.readings);
    expect(honest.size).toBe(SESSION_1_PROGRAM.intervals.length);
    // Spec's own transcribed values (§ "Session 1 (keystone)"): 0:(65.34,
    // 249.8) 1:(72.54, 250.0).
    expect(honest).toStrictEqual(
      new Map([
        [0, { elapsedSeconds: 65.3, distanceMeters: 249.8 }],
        [1, { elapsedSeconds: 72.5, distanceMeters: 250 }],
      ]),
    );

    const finalTotals = parseFinalTotals(ctx.log);
    expect(finalTotals.registers).toStrictEqual(honest);

    const lastReading = ctx.readings[ctx.readings.length - 1]!;
    expect(lastReading.twdMeters).toBe(500);
    expect(
      Math.abs(finalTotals.accumulatorMeters - lastReading.twdMeters),
    ).toBeLessThanOrEqual(1.5);
  });

  it("logs zero stale-count rest clamp entries — no rest ever occurs in this session", () => {
    expect(clampedKeys(ctx.log)).toStrictEqual(new Set());
  });
});

describe("session 2 (wu + 4 unequal, mixed rest): RED on unmodified code — the clamp fixes this", () => {
  let ctx: Awaited<ReturnType<typeof replaySession>>;

  beforeAll(async () => {
    ctx = await replaySession("session-2-wu-4unequal.jsonl", SESSION_2_PROGRAM);
  });

  it("replays through the real driver with zero tx divergences, five segments, and a final accumulator within 1.5m of the machine's own TWD", () => {
    // Bug-INDEPENDENT sanity checks first: if these ever fail, the oracle
    // or the hand-transcribed program is wrong, not the driver under test.
    expect(ctx.result.divergences).toStrictEqual([]);
    const honest = honestRegistersRounded(ctx.readings);
    expect(honest.size).toBe(SESSION_2_PROGRAM.intervals.length);

    // THE BUG-DEPENDENT ASSERTION, last on purpose: RED on unmodified code
    // (driver accumulator ≈1819.7m against the machine's own final TWD,
    // 1599m — a +220.7m gap far outside the 1.5m tolerance). GREEN once
    // Task 2's clamp lands.
    const lastReading = ctx.readings[ctx.readings.length - 1]!;
    expect(lastReading.twdMeters).toBe(1599);
    const finalTotals = parseFinalTotals(ctx.log);
    expect(
      Math.abs(finalTotals.accumulatorMeters - lastReading.twdMeters),
    ).toBeLessThanOrEqual(1.5);
  });

  it("the driver's per-frame session distance tracks the machine's own TWD within 1.5m at eight independently sampled instants", () => {
    // Spec-verbatim checkpoints (recording-clock seconds, the same `t` the
    // replay's virtual clock advances against — NOT 0x0031's own
    // `elapsedSeconds`, which resets every interval).
    const checkpointsSeconds = [
      52.6, 112.8, 137.6, 263.1, 265.1, 422.3, 424.9, 514.9,
    ];
    expect(checkpointsSeconds).toHaveLength(8);
    for (const seconds of checkpointsSeconds) {
      const targetMs = seconds * 1000;
      const reading = nearestReading(ctx.readings, targetMs);
      const sample = nearestFrameSample(ctx.frameSamples, targetMs);
      const diff = Math.abs(
        sample.frame.sessionDistanceMeters - reading.twdMeters,
      );
      // vitest's `expect` takes no message argument (unlike Jest) — the
      // checkpoint identity that a bare `expect(diff).toBeLessThanOrEqual`
      // would drop from the failure output is carried by throwing directly
      // instead, so a red run still names WHICH checkpoint and WHAT the two
      // sides read.
      if (diff > 1.5) {
        throw new Error(
          `checkpoint t≈${seconds}s: driver sessionDistanceMeters=` +
            `${sample.frame.sessionDistanceMeters} vs machine twdMeters=` +
            `${reading.twdMeters} (diff ${diff.toFixed(1)}m, tolerance 1.5m)`,
        );
      }
    }
  });

  it("the final register map matches the independent reader's honest totals, and the clamp log names exactly keys {1, 2}", () => {
    const honest = honestRegistersRounded(ctx.readings);
    const finalTotals = parseFinalTotals(ctx.log);
    // RED on unmodified code: the driver's registers 1 and 2 are poisoned
    // (spec: 1:(120.2,461.4) is the 2:00 piece's own data folded a key low;
    // 2:(129.2,501.6)/3:(133.1,512.8) both carry the 500m piece — counted
    // twice). GREEN once the clamp lands.
    expect(finalTotals.registers).toStrictEqual(honest);

    // The exact-set assertion (not just a count) — kills the `<=` mutant
    // the spec names (§ Exit criteria 3b): a `<=` clamp would additionally
    // (wrongly) log key 0 or leave key 2 unclamped depending on direction,
    // either of which changes this SET, not just its size.
    expect(clampedKeys(ctx.log)).toStrictEqual(new Set([1, 2]));
  });
});
