// Builds raw C2 status-characteristic bytes — the byte-for-byte INVERSE of
// this module's sibling `parse.ts`'s five decode functions: same offsets,
// same scales, same little-endian byte order, all cited to the same table
// (interface-notes.md §10, BLE Interface Definition rev 1.30 pp.13-20).
//
// The real PM5 is the only encoder of these bytes in production — this
// module exists purely so a fake transport (`src/monitor/transports/
// fake.ts`, Task 4) can synthesize realistic notification bytes for
// `parse.ts`'s decoders to consume, exercising the SAME wire format the
// driver decodes end-to-end in CI, without putting Concept2 byte-level
// knowledge in src/ (design spec §Layering: "pm5/ is the only home of
// Concept2 bytes" — the same reasoning that put `response.ts`'s ack-echo
// knowledge here rather than in the driver, interface-notes.md §16, M5).
// Added alongside Task 4 rather than Task 3 because the need (a fake that
// round-trips real bytes through the real decoders) only became concrete
// once the driver/fake existed to consume it — the identical situation
// `response.ts` was added to resolve mid-Task-3.
//
// Fix-3 Task 5 added this module's second responsibility: `armedStructureFields`
// (plus `EMPTY_ARM_STRUCTURE`/`PRE_ARM_BASELINE_STRUCTURE`) independently
// encodes 0x0031's structure fields from a held program, so `fake.ts` has a
// WIRE-side computation of SESSION 4a's semantics that shares no call path
// with `pm5/commands.ts`'s `expectedArmedStructure` (the DRIVER-side
// prediction `verifyArmed` checks the wire against). See that function's own
// doc comment for why the two must stay independent.
//
// domain/monitor/** imports nothing from src/.

import type {
  AdditionalSplitIntervalData,
  AdditionalStatus1,
  AdditionalStatus2,
  GeneralStatus,
  SplitIntervalData,
} from "./parse.js";

/** BLE doc p.14: "Heartrate (bpm, 255=invalid)" — what this module writes
 *  for a `null` heart rate, on every heart-rate field it encodes (the same
 *  analogy `parse.ts` makes for 0x0038's Work/Rest Heartrate bytes,
 *  interface-notes.md §15 #2).
 *
 *  No longer a strict inverse of `parse.ts`'s `heartRate()`, on purpose:
 *  that decoder maps BOTH `255` and `0` to `null` since D5
 *  (interface-notes.md §18 — the beltless machine sent `0`), so
 *  `null -> 255 -> null` still round-trips but `0 -> null -> 255` cannot.
 *  One encoder cannot write two sentinels for one state; this one keeps
 *  writing the DOCUMENTED byte, and a caller that specifically wants the
 *  OBSERVED one (as `src/monitor/transports/fake.ts` does, being a model of
 *  the machine we met) passes `parse.ts`'s `HEARTRATE_NO_BELT` as a real
 *  number rather than `null`. */
const HEARTRATE_INVALID = 255;

function writeU8(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
}

/** Little-endian 16-bit write — the inverse of `parse.ts`'s `readU16LE`. */
function writeU16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

/** Little-endian 24-bit write — the inverse of `parse.ts`'s `readU24LE`. */
function writeU24LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
}

function writeHeartRate(
  bytes: Uint8Array,
  offset: number,
  bpm: number | null,
): void {
  writeU8(bytes, offset, bpm === null ? HEARTRATE_INVALID : bpm);
}

/** The minimal shape this module's structure encoder needs from a held
 *  program's interval 0 — deliberately narrower than `domain/monitor/
 *  program.ts`'s `ProgramInterval` (only `kind`/`value` decide 0x0031's
 *  STRUCTURE fields), so this module does not need to import `program.ts` at
 *  all. `src/monitor/transports/fake.ts` passes `WorkoutProgram.intervals`
 *  straight through — any array assignable to `ProgramInterval[]` also
 *  satisfies this. */
export interface StructureInterval {
  kind: "time" | "distance";
  value: number;
}

/** 0x0031's three STRUCTURE fields — `workoutType`, `workoutDurationRaw` and
 *  `workoutDurationType` (interface-notes.md §10, offsets 6, 14-16, 17). */
export interface WireArmedStructure {
  workoutType: number;
  workoutDurationRaw: number;
  workoutDurationType: number;
}

// Fix-3 Task 5 (review I-5, `src/monitor/transports/fake.ts`'s own ⚠
// tripwire at the old call site): these four literals are declared HERE,
// independently of `domain/monitor/pm5/commands.ts`'s `WORKOUTTYPE_
// VARIABLE_INTERVAL` / `WORKOUT_DURATION_IDENTIFIER_TIME` / `WORKOUT_
// DURATION_IDENTIFIER_DISTANCE` / `WORKOUT_DURATION_TIME_SCALE` — on
// purpose, and never imported from there. `commands.ts`'s
// `expectedArmedStructure` is the DRIVER's prediction of what a healthy
// PM5 will read back; this module is the WIRE `fake.ts` actually sends. If
// the fake computed its bytes by calling the driver's own predictor (as it
// did before this task), a wrong prediction and a wrong wire would always
// agree, and no fake-driven test could ever catch a real drift between the
// two — a function would only be proving it equals itself. Keeping the
// numbers duplicated, not shared, is what makes the fake a WITNESS rather
// than a mirror.
const WORKOUT_TYPE_VARIABLE_INTERVAL = 8;
const DURATION_TYPE_TIME = 0;
const DURATION_TYPE_DISTANCE = 0x80;
const TIME_DURATION_SCALE = 100;

/**
 * SESSION 4a's captured EMPTY-ARM anatomy (2026-08-07, PM5 432331249; the
 * SDD ledger's `## SESSION 4a` block, "EMPTY ARM captured on the wire":
 * settle-off, program-short over a running two-time piece, monitor showing
 * `:00`, driver reporting acked-armed — **steady state `workoutType=1
 * durationRaw=0 durationType=128`**). A real PM5 armed with no interval
 * structure at all reports THIS, not the pre-arm baseline (`workoutType=0`,
 * `PRE_ARM_BASELINE_STRUCTURE` below) and not a normal armed program's own
 * encoding (`workoutType=8`, `armedStructureFields` below) — the type byte
 * alone is enough for a structure-reading driver to catch a real empty arm,
 * which is why `armedStructureFields`'s own empty-interval branch returns
 * this rather than an invented all-zero shape.
 */
export const EMPTY_ARM_STRUCTURE: WireArmedStructure = {
  workoutType: 1,
  workoutDurationRaw: 0,
  workoutDurationType: DURATION_TYPE_DISTANCE,
};

/**
 * SESSION 4a's captured PRE-ARM baseline ("Fields refresh while merely
 * ARMED (no rowing). Pre-arm baseline: type=0 dur=0 durType=128.") — what a
 * PM5's 0x0031 structure fields read before anything has ever been armed.
 * `src/monitor/transports/fake.ts` uses this as the seed for
 * `FakeScript.lagStructureOneTick`'s "prior structure" (a fake's first-ever
 * arm has no earlier PROGRAM to lag on, only this).
 */
export const PRE_ARM_BASELINE_STRUCTURE: WireArmedStructure = {
  workoutType: 0,
  workoutDurationRaw: 0,
  workoutDurationType: DURATION_TYPE_DISTANCE,
};

/**
 * Encodes 0x0031's structure fields for a held program's interval 0, per
 * SESSION 4a's confirmed read-side semantics (the SDD ledger's `##
 * SESSION 4a` block): `workoutType` is stable at `8` across TIME, DISTANCE
 * and rest-0 shapes; a TIME interval reads back `seconds × 100` at duration
 * identifier `0`; a DISTANCE interval reads back WHOLE METRES at identifier
 * `128`. An empty `intervals` array (no interval 0 to encode) returns
 * `EMPTY_ARM_STRUCTURE` — 4a's own captured anatomy for a program with no
 * structure, not this function's own non-empty encoding with a zeroed
 * duration.
 *
 * INDEPENDENT of `domain/monitor/pm5/commands.ts`'s `expectedArmedStructure`
 * — see the literals' own comment above for why the two must never share a
 * call path.
 */
export function armedStructureFields(
  intervals: readonly StructureInterval[],
): WireArmedStructure {
  const first = intervals[0];
  if (!first) return EMPTY_ARM_STRUCTURE;
  return {
    workoutType: WORKOUT_TYPE_VARIABLE_INTERVAL,
    workoutDurationRaw:
      first.kind === "time" ? first.value * TIME_DURATION_SCALE : first.value,
    workoutDurationType:
      first.kind === "time" ? DURATION_TYPE_TIME : DURATION_TYPE_DISTANCE,
  };
}

/** 0x0031 — inverse of `parse.ts`'s `parseGeneralStatus`, 19 bytes. */
export function buildGeneralStatusBytes(s: GeneralStatus): Uint8Array {
  const bytes = new Uint8Array(19);
  writeU24LE(bytes, 0, Math.round(s.elapsedSeconds * 100));
  writeU24LE(bytes, 3, Math.round(s.distanceMeters * 10));
  writeU8(bytes, 6, s.workoutType);
  writeU8(bytes, 7, s.intervalType);
  writeU8(bytes, 8, s.workoutState);
  writeU8(bytes, 9, s.rowingState);
  writeU8(bytes, 10, s.strokeState);
  writeU24LE(bytes, 11, s.totalWorkDistanceMeters);
  writeU24LE(bytes, 14, s.workoutDurationRaw);
  writeU8(bytes, 17, s.workoutDurationType);
  writeU8(bytes, 18, s.dragFactor);
  return bytes;
}

/** 0x0032 — inverse of `parse.ts`'s `parseAdditionalStatus1`, 17 bytes. */
export function buildAdditionalStatus1Bytes(s: AdditionalStatus1): Uint8Array {
  const bytes = new Uint8Array(17);
  writeU24LE(bytes, 0, Math.round(s.elapsedSeconds * 100));
  writeU16LE(bytes, 3, Math.round(s.speedMetersPerSecond * 1000));
  writeU8(bytes, 5, s.spm);
  writeHeartRate(bytes, 6, s.heartRateBpm);
  writeU16LE(bytes, 7, Math.round(s.currentSplit * 100));
  writeU16LE(bytes, 9, Math.round(s.averageSplit * 100));
  writeU16LE(bytes, 11, s.restDistanceMeters);
  writeU24LE(bytes, 13, Math.round(s.restSeconds * 100));
  writeU8(bytes, 16, s.ergMachineType);
  return bytes;
}

/** 0x0033 — inverse of `parse.ts`'s `parseAdditionalStatus2`, 20 bytes. */
export function buildAdditionalStatus2Bytes(s: AdditionalStatus2): Uint8Array {
  const bytes = new Uint8Array(20);
  writeU24LE(bytes, 0, Math.round(s.elapsedSeconds * 100));
  writeU8(bytes, 3, s.intervalCount);
  writeU16LE(bytes, 4, s.averagePowerWatts);
  writeU16LE(bytes, 6, s.totalCalories);
  writeU16LE(bytes, 8, Math.round(s.splitAvgPace * 100));
  writeU16LE(bytes, 10, s.splitAvgPowerWatts);
  writeU16LE(bytes, 12, s.splitAvgCalories);
  writeU24LE(bytes, 14, Math.round(s.lastSplitTimeSeconds * 10));
  writeU24LE(bytes, 17, s.lastSplitDistanceMeters);
  return bytes;
}

/** 0x0037 — inverse of `parse.ts`'s `parseSplitIntervalData`, 18 bytes. */
export function buildSplitIntervalDataBytes(s: SplitIntervalData): Uint8Array {
  const bytes = new Uint8Array(18);
  writeU24LE(bytes, 0, Math.round(s.elapsedSeconds * 100));
  writeU24LE(bytes, 3, Math.round(s.distanceMeters * 10));
  writeU24LE(bytes, 6, Math.round(s.splitIntervalTimeSeconds * 10));
  writeU24LE(bytes, 9, s.splitIntervalDistanceMeters);
  writeU16LE(bytes, 12, s.intervalRestTimeSeconds);
  writeU16LE(bytes, 14, s.intervalRestDistanceMeters);
  writeU8(bytes, 16, s.splitIntervalType);
  writeU8(bytes, 17, s.splitIntervalNumber);
  return bytes;
}

/** 0x0038 — inverse of `parse.ts`'s `parseAdditionalSplitIntervalData`, 19
 *  bytes. */
export function buildAdditionalSplitIntervalDataBytes(
  s: AdditionalSplitIntervalData,
): Uint8Array {
  const bytes = new Uint8Array(19);
  writeU24LE(bytes, 0, Math.round(s.elapsedSeconds * 100));
  writeU8(bytes, 3, s.splitIntervalAvgStrokeRate);
  writeHeartRate(bytes, 4, s.splitIntervalWorkHeartRateBpm);
  writeHeartRate(bytes, 5, s.splitIntervalRestHeartRateBpm);
  writeU16LE(bytes, 6, Math.round(s.splitIntervalAvgPace * 10));
  writeU16LE(bytes, 8, s.splitIntervalTotalCalories);
  writeU16LE(bytes, 10, s.splitIntervalAvgCalories);
  writeU16LE(bytes, 12, Math.round(s.splitIntervalSpeedMetersPerSecond * 1000));
  writeU16LE(bytes, 14, s.splitIntervalPowerWatts);
  writeU8(bytes, 16, s.splitAvgDragFactor);
  writeU8(bytes, 17, s.splitIntervalNumber);
  writeU8(bytes, 18, s.ergMachineType);
  return bytes;
}
