export type WorkoutType = "AN" | "O2" | "AT" | "TR";
export const WORKOUT_TYPES: readonly WorkoutType[] = ["AN", "O2", "AT", "TR"];
/** Narrows an untrusted string to a `WorkoutType`. Needed wherever a type
 *  arrives as a bare string rather than through the enum: a stored
 *  localStorage filter, and `session_logs.workout_type`, which is plain
 *  `text` (deliberately NOT the workouts table's pgEnum) and so can hold
 *  anything an authenticated client posted. Lives here rather than beside
 *  any one caller because there were already two byte-identical private
 *  copies (`todayOverrides.ts`, `libraryFilters.ts`) and the Plan screen's
 *  swapped-row check would have been a third — the shape recurring
 *  failure 5 is about. */
export function isWorkoutType(value: unknown): value is WorkoutType {
  return (
    typeof value === "string" &&
    (WORKOUT_TYPES as readonly string[]).includes(value)
  );
}
export type Difficulty = "easy" | "medium" | "hard";
export type PaceBase = "2k" | "6k";
export type Effort = "max" | "min";
export interface SplitRef {
  base: PaceBase;
  off: number; // off: seconds per 500m, negative = faster
}
// "30 seconds max" / "20 minutes easy" — a real effort prescription, not a
// stand-in offset. Key-presence union: every stored {base, off} ref is
// already a valid SplitRef, so nothing migrates (Phase 5G spec, "Decisions").
export interface EffortRef {
  effort: Effort;
}
export type PaceRef = SplitRef | EffortRef;
export type WorkDuration =
  | { kind: "time"; minutes: number } // 0.5 steps allowed, > 0
  | { kind: "distance"; meters: number }; // integer, 100..42195
// "wu" left this union 2026-08-09 (the warmup-setting spec): warm-ups are a
// per-user SETTING now, prepended at buildRun (engine.ts) as an EnginePhase
// the preference alone produces — never an authored step. That phase union
// keeps its own "warmup" member (expand.ts's Phase/EnginePhase, unrelated to
// this one) untouched; validateSteps below is the permanent runtime guard
// for stored/imported data that can still present the retired shape.
export type Step =
  | { k: "reps"; count: number } // 1..12, at most one per workout
  | {
      k: "w";
      duration: WorkDuration;
      ref: PaceRef;
      spm?: number;
      restMinutes?: number;
    }
  | { k: "r"; minutes: number }
  | { k: "test"; label: string };
export interface Baselines {
  k2Seconds: number;
  k6Seconds: number;
}
export interface WorkoutInput {
  title: string;
  type: WorkoutType;
  difficulty: Difficulty;
  pain: number;
  steps: Step[];
}
