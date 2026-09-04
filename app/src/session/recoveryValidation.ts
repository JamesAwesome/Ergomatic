import type { WorkoutType } from "../../domain/types.js";
import type { MonitorRun } from "../monitor/monitorRun";

export function validWorkoutType(value: unknown): WorkoutType | null {
  return value === "AN" || value === "O2" || value === "AT" || value === "TR"
    ? value
    : null;
}

/** Reject rather than repair non-finite retained measurements or summary values. */
export function requireFiniteRecording(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Non-finite recording");
  if (value !== null && typeof value === "object") {
    for (const member of Object.values(value)) requireFiniteRecording(member);
  }
}

function requireFiniteNumber(value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Malformed recording measurement");
}

function requireNullableFiniteNumber(value: unknown): void {
  if (value !== null) requireFiniteNumber(value);
}

/**
 * A completed programmed review can post these retained measurements without
 * rebuilding them. Optional observation groups may be absent on older runs;
 * once present, their typed members must be intact rather than coerced.
 */
export function requireProgrammedMeasurements(run: MonitorRun): void {
  for (const actual of run.actuals) {
    requireNullableFiniteNumber(actual.index);
    requireFiniteNumber(actual.elapsedSeconds);
    requireFiniteNumber(actual.distanceMeters);
    requireNullableFiniteNumber(actual.avgSplit);
    requireNullableFiniteNumber(actual.avgSpm);
    requireNullableFiniteNumber(actual.avgHeartRateBpm);
    if (actual.restDistanceMeters !== undefined)
      requireFiniteNumber(actual.restDistanceMeters);
    if (actual.restSeconds !== undefined)
      requireFiniteNumber(actual.restSeconds);
    if (actual.type !== undefined) requireFiniteNumber(actual.type);
  }
  if (run.summaryTotals !== undefined) {
    requireFiniteNumber(run.summaryTotals.workElapsedSeconds);
    requireFiniteNumber(run.summaryTotals.workDistanceMeters);
  }
  if (run.summaryDetail !== undefined) {
    requireFiniteNumber(run.summaryDetail.avgStrokeRate);
    requireNullableFiniteNumber(run.summaryDetail.endingHeartRateBpm);
    requireNullableFiniteNumber(run.summaryDetail.avgHeartRateBpm);
    requireNullableFiniteNumber(run.summaryDetail.minHeartRateBpm);
    requireNullableFiniteNumber(run.summaryDetail.maxHeartRateBpm);
    requireFiniteNumber(run.summaryDetail.dragFactorAverage);
    requireFiniteNumber(run.summaryDetail.workoutType);
    requireNullableFiniteNumber(run.summaryDetail.recoveryHeartRateBpm);
    requireFiniteNumber(run.summaryDetail.avgPaceSecondsPer500m);
  }
  if (run.verificationBytes !== undefined) {
    for (const byte of run.verificationBytes) {
      requireFiniteNumber(byte);
      if (!Number.isInteger(byte)) throw new Error("Malformed recording byte");
    }
  }
}
