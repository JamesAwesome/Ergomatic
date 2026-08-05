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
// domain/monitor/** imports nothing from src/.

import type {
  AdditionalSplitIntervalData,
  AdditionalStatus1,
  AdditionalStatus2,
  GeneralStatus,
  SplitIntervalData,
} from "./parse.js";

/** BLE doc p.14: "Heartrate (bpm, 255=invalid)" — the inverse of
 *  `parse.ts`'s `heartRate()` sentinel read, applied identically to every
 *  heart-rate field this module encodes (same analogy `parse.ts` itself
 *  makes for 0x0038's Work/Rest Heartrate bytes — interface-notes.md §15
 *  #2). */
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
