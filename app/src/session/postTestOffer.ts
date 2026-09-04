// Phase BL PR B (baseline-onboarding spec 2026-08-22 rev 2, "The post-test
// prompt"): the pure eligibility and derivation logic behind the post-save
// baseline offer. Pure and framework-free so every rule here is directly
// testable; the doors (LogSession.tsx) supply the four facts and
// PostTestPrompt.tsx renders whatever this returns.
import {
  isOnboardingTitle,
  ONBOARDING_TITLES,
} from "../../domain/onboarding.js";
import { deriveK2FromK6, deriveK6FromK2 } from "../../domain/deriveBaseline.js";
import { MAX_SPLIT, MIN_SPLIT } from "../you/baselineDraft";

export interface PostTestOffer {
  distance: "2k" | "6k";
  /** The measured (or, for a counterpart offer, derived) avg split in
   *  s/500m — the exact number the accept would write, never re-derived
   *  at the write site. */
  splitSeconds: number;
}

/** Whether a just-saved session earns the post-save baseline offer, and
 *  for which side. Null means no prompt — the save flow navigates exactly
 *  as it always has.
 *
 *  The four conditions, each binding (spec rev 2):
 *  - A MEASURED split exists. The number comes first (ROADMAP BL's
 *    source-beside-null fact): monitor/timer sessions produce
 *    `heroes.avgSplitSeconds` (summaryModel.ts); a manual log produces no
 *    heroes at all, so the You editor stays its honest path.
 *  - The workout is THE designated test: `ONBOARDING_TITLES` identity AND
 *    the global row (domain/onboarding.ts's own rule — a rower's custom
 *    row sharing the title can have any shape, so its average split is
 *    not a test result).
 *  - COMPLETENESS (M2, new with this phase): the split was measured over
 *    the test's full distance. The caller answers per session source:
 *    monitor = `endedBy === "finished"` (the machine's own WORKOUTEND —
 *    every non-finished endedBy ("rower"/"link-lost"/"program-failed"/
 *    "program-dropped"/"interrupted") or absent all mean
 *    the programmed distance is not proven complete); timer =
 *    `isComplete(run)` (the phone has no distance oracle — advancing
 *    through every phase IS the door's definition of rowing the
 *    distance, and the door's own render guard already requires it).
 *  - The split sits in the storable 60..240 band (the server's baseline
 *    band): a number the accept could never store is never offered.
 */
export function postTestOffer(input: {
  workoutTitle: string;
  workoutIsGlobal: boolean;
  linkedWorkoutTitle: string | null;
  avgSplitSeconds: number | undefined;
  completedFullDistance: boolean;
}): PostTestOffer | null {
  if (input.avgSplitSeconds === undefined) return null;
  if (
    !input.workoutIsGlobal ||
    input.linkedWorkoutTitle === null ||
    input.workoutTitle !== input.linkedWorkoutTitle ||
    !isOnboardingTitle(input.linkedWorkoutTitle)
  ) {
    return null;
  }
  if (!input.completedFullDistance) return null;
  if (input.avgSplitSeconds < MIN_SPLIT || input.avgSplitSeconds > MAX_SPLIT) {
    return null;
  }
  return {
    distance: input.linkedWorkoutTitle === ONBOARDING_TITLES.k2 ? "2k" : "6k",
    splitSeconds: input.avgSplitSeconds,
  };
}

/** The SECOND, optional offer after a `tested` accept (spec rev 2, James's
 *  ruling): derive the counterpart via the existing ±7s heuristic
 *  (domain/deriveBaseline.ts) when the other side is missing, OR when the
 *  freshly-accepted number lands inconsistent with its stored counterpart
 *  (a 2k must be STRICTLY faster than a 6k — equality is inconsistent;
 *  pace.ts prices ALL OUT off k2 and EASY off k6, so an inverted pair
 *  makes ALL OUT slower than EASY). Never automatic, never blocking:
 *  declining leaves the pair partial or inconsistent, which is the
 *  rower's call. Refuses a derived value outside the storable band, same
 *  rule as the editor's own offer (BaselineEditor.tsx's deriveOffer). */
export function counterpartOffer(
  accepted: PostTestOffer,
  stored: { k2Seconds: number | null; k6Seconds: number | null },
): PostTestOffer | null {
  if (accepted.distance === "2k") {
    const k6 = stored.k6Seconds;
    if (k6 !== null && accepted.splitSeconds < k6) return null;
    const value = deriveK6FromK2(accepted.splitSeconds);
    return value >= MIN_SPLIT && value <= MAX_SPLIT
      ? { distance: "6k", splitSeconds: value }
      : null;
  }
  const k2 = stored.k2Seconds;
  if (k2 !== null && k2 < accepted.splitSeconds) return null;
  const value = deriveK2FromK6(accepted.splitSeconds);
  return value >= MIN_SPLIT && value <= MAX_SPLIT
    ? { distance: "2k", splitSeconds: value }
    : null;
}
