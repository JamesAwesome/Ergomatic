import type { WorkoutInput } from "../../../domain/types.js";
import { AN_WORKOUTS } from "./an.js";
import { AT_WORKOUTS } from "./at.js";
import { O2_WORKOUTS } from "./o2.js";
import { ONBOARDING_LIBRARY_WORKOUTS } from "./onboarding.js";
import { TR_WORKOUTS } from "./tr.js";

// Library order: type blocks (O2, AT, TR, AN), easy→hard within each —
// the same browsing order the 35-starter library used. sortOrder is
// assigned here, 1..N in array order; authors never write it.
export const LIBRARY_WORKOUTS: Array<WorkoutInput & { sortOrder: number }> = [
  ...O2_WORKOUTS,
  ...AT_WORKOUTS,
  ...TR_WORKOUTS,
  ...AN_WORKOUTS,
].map((w, i) => ({ ...w, sortOrder: i + 1 }));

// The converge input `seedGlobalLibrary` actually reconciles against
// (Phase 6I spec, "Server"): the 300-workout library PLUS the two
// designated onboarding rows, sortOrder continuing after the 300.
// Deliberately a SEPARATE export from LIBRARY_WORKOUTS — never
// concatenated into it — because library.test.ts hard-pins
// LIBRARY_WORKOUTS at exactly 300 with a per-type/band quota grid and a
// spm-present-and-even rule that a single-step, no-spm effort workout
// would violate. This is the array server/seed/seed.ts's
// `seedGlobalLibrary` defaults to, so the two onboarding workouts land
// as real global (user_id null) rows in the database — the no-baseline
// card's own lookup and their detail routes need them to exist there —
// without the starter-library gate ever seeing them.
export const GLOBAL_LIBRARY_SEED: Array<WorkoutInput & { sortOrder: number }> =
  [
    ...LIBRARY_WORKOUTS,
    ...ONBOARDING_LIBRARY_WORKOUTS.map((w, i) => ({
      ...w,
      sortOrder: LIBRARY_WORKOUTS.length + i + 1,
    })),
  ];

// Starter-content review convention (see the retired starter.ts): the plan
// presets ship alongside the library they schedule.
export { PLANS } from "../../../domain/plans.js";
