import type { WorkoutInput } from "../../../domain/types.js";
import { AN_WORKOUTS } from "./an.js";
import { AT_WORKOUTS } from "./at.js";
import { O2_WORKOUTS } from "./o2.js";
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

// Starter-content review convention (see the retired starter.ts): the plan
// presets ship alongside the library they schedule.
export { PLANS } from "../../../domain/plans.js";
