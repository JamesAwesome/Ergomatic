import type { WorkoutType } from "../../domain/types.js";

// One-word (well, one-phrase) summary per WorkoutType, mirroring
// builderState.ts's own PAIN_WORDS — originally defined inline in
// builderState.ts for the classification card's TYPE group (Phase 5G,
// James's mid-phase request), extracted here (2026-08-08 round) so Today's
// plan line can show the same word for the currently EFFECTIVE type without
// a second copy. builderState.ts re-exports this for its own existing
// consumer (ClassificationCard.tsx); anything new should import straight
// from here.
export const TYPE_WORDS: Record<WorkoutType, string> = {
  O2: "LOW & SLOW",
  AT: "COMFORTABLY HARD",
  TR: "HARD INTERVALS",
  AN: "SPEED WORK",
};
