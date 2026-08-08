import { isEffortRef } from "./pace.js";
import type { Step } from "./types.js";

/** True unless EVERY work ("w") step in `steps` is an effort ref
 *  (`{effort:"max"|"min"}`) — i.e. true the moment any work step is a
 *  split ref that needs a resolved baseline. Warm-up/rest/test/reps-marker
 *  steps never carry a ref and are ignored (vacuously "false" contributes
 *  nothing, so a workout with no work steps at all needs no baselines).
 *
 *  The single gate every coupled call site shares (Phase 6I design spec,
 *  "Mechanics"): Confirm's footer guard, Countdown's null-baselines
 *  redirect and its `buildRun` call, WorkoutDetail's Connect guard and
 *  manual-log door, and `phases()`/`estimateMinutes` below all key off
 *  this SAME predicate rather than each re-deriving it, so they can never
 *  disagree about which workouts are safe to run without baselines. */
export function needsBaselines(steps: Step[]): boolean {
  return steps.some((s) => s.k === "w" && !isEffortRef(s.ref));
}
