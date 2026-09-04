import type { WorkoutType } from "../../domain/types.js";

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
