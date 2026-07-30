export type WorkoutType = "AN" | "O2" | "AT" | "TR";
export type Difficulty = "easy" | "medium" | "hard";
export type PaceBase = "2k" | "6k";
export interface PaceRef {
  base: PaceBase;
  off: number; // off: seconds per 500m, negative = faster
}
export type WorkDuration =
  | { kind: "time"; minutes: number } // 0.5 steps allowed, > 0
  | { kind: "distance"; meters: number }; // integer, 100..42195
export type Step =
  | { k: "wu"; minutes: number }
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
