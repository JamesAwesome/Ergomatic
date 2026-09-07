import { isPaceWordRef } from "./pace.js";
import type { Step } from "./types.js";

/** True the moment any work ("w") step is a split ref, i.e. the workout
 *  has NUMBERS waiting behind a baseline; false when every work step is a
 *  pace-word ref (`{effort:"max"|"min"}`). Rest/test/reps-marker steps
 *  never carry a ref and are ignored.
 *
 *  Phase RW PR B: no longer a GATE. Nothing blocks on it any more: a
 *  split ref rowed with no baseline reads a ladder word (`intensityWord`,
 *  domain/pace.ts) and `phases()`, the compiler, the log and every screen
 *  handle that shape. It survives as the predicate for "would this
 *  workout show numbers if a baseline were set", which the workout
 *  detail's caption ("Targets are words until you set a baseline") reads. */
export function needsBaselines(steps: Step[]): boolean {
  return steps.some((s) => s.k === "w" && !isPaceWordRef(s.ref));
}
