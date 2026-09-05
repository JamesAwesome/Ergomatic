// Phase DE PR 1 (spec §3.2): the product no longer has a difficulty, but
// `workouts.difficulty` is a NOT NULL Postgres column that every installed
// pre-PR-1 build renders with `workout.difficulty.toUpperCase()`
// (WorkoutRow.tsx, Today.tsx, WorkoutDetail.tsx on v0.38.1) — a NULL takes
// three screens down inside React render. So for one tag cycle the store
// writes a word DERIVED from the 1–5 figure. No new build reads it, and no
// route accepts it: a client-sent `difficulty` is ignored, never stored.
//
// REMOVED BY PHASE DE PR 3 together with the column, its enum and
// `preferences.difficulties` (ROADMAP "Phase DE", PR 3 row). Nothing
// outside `server/` may import this module.
export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export function derivedDifficulty(pain: number): Difficulty {
  if (pain <= 2) return "easy";
  if (pain === 3) return "medium";
  return "hard";
}
