import type { WorkoutInput } from "../../../domain/types.js";
import { ONBOARDING_TITLES } from "../../../domain/onboarding.js";

// The two designated onboarding seed workouts (Phase 6I design spec,
// "Mechanics"): a single distance work step at an effort ref, so each
// resolves — and runs — with no baselines at all (`needsBaselines`
// reads them as false). Deliberately NOT part of LIBRARY_WORKOUTS:
// library.test.ts hard-pins exactly 300 workouts, the per-type/band
// quota grid, spm-present-and-even on every work step, and difficulty
// ordering — a single-step, no-spm effort workout violates the spm rule
// and would corrupt the grid. Concatenated into the converge input by
// library/index.ts's GLOBAL_LIBRARY_SEED export instead (sortOrder
// continuing after the 300), so these still land as real global rows
// (the card's own lookup, their own detail routes) without perturbing
// the starter-library gate. Titles come from the domain constant — the
// ONLY identity the rest of the app uses to recognize them.
export const ONBOARDING_LIBRARY_WORKOUTS: WorkoutInput[] = [
  {
    title: ONBOARDING_TITLES.k6,
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 6000 },
        ref: { effort: "min" },
      },
    ],
  },
  {
    title: ONBOARDING_TITLES.k2,
    type: "AN",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { effort: "max" },
      },
    ],
  },
];
