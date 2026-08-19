// judgeBand.ts — Phase LT spec 1, Task 2: the ONE on-target dead band
// shared by every place that judges a SETTLED interval split against its
// own target — the connected pane's rest verdict
// (`workout/connected/surfaceModel.ts`'s `avgVerdict`, extracted FROM here
// this task) and the post-workout summary's per-row judgment
// (`session/summaryModel.ts`'s `rowJudgment`). James's ruling, 2026-08-18:
// "same band everywhere" — the design spec's own citation is that the two
// surfaces' wire fields agree to <=0.12s across every rest-bearing capture
// read for that ruling (`docs/superpowers/specs/2026-08-18-target-truth-
// design.md` §1), so the erg's own rest screen and the summary screen must
// never disagree about whether one interval was on target.
//
// A drift test (`judgeBand.test.ts`) pins `surfaceModel.ts`'s re-exported
// constant to THIS module's own export — the two must be the same
// reference, not two numbers that happen to match today. `grep -n "0\.5"
// src/workout/connected/surfaceModel.ts src/session/summaryModel.ts` (run
// at review time — a literal `0.5` legitimately appears in doc-comment
// prose in both files, so this is a human grep, not an automated string
// assertion) is the second half of that proof: neither file defines a
// second copy of the NUMBER itself outside this module.
//
// Pure: no React, no clock, no storage, no import from either consuming
// module — this is the shared leaf both of them import FROM, never the
// other way around.

/** 0.5 s/500m — half the connected surface's own general-purpose
 *  `PACE_TOLERANCE_SECONDS` (`domain/judge.ts`, 2s), deliberately tighter:
 *  this band judges a SETTLED number (a finished interval's own held
 *  average, or a summary row's final recorded split), never a live
 *  reading still converging toward its target mid-piece — the design
 *  spec's own reasoning for why `surfaceModel.ts`'s live `judgedValue`
 *  path (2s tolerance) and this band (0.5s) are deliberately different
 *  numbers even though both eventually feed a red/blue verdict. */
export const ON_TARGET_BAND_SECONDS = 0.5;

/** The three-way verdict this band produces. Kept separate from
 *  `domain/judge.ts`'s `Judgement` (`"slower" | "within" | "faster" |
 *  "stale"`) deliberately — neither caller of this function has a
 *  `"stale"` concept (a summary row is a closed record; the connected
 *  surface's own `avgVerdict` already resolves staleness before ever
 *  reaching a band comparison), and `"on-target"` reads better than
 *  `"within"` at this function's two call sites, which both narrate a
 *  ROW/CELL's own state rather than a live cell's judgement precedence. */
export type BandVerdict = "faster" | "on-target" | "slower";

/** `actual − target`, banded. "+ = slower" is the house sign convention
 *  (`session/summaryModel.ts`'s own R-C citation, carried into this
 *  module's callers): a positive deviation means the actual split took
 *  MORE seconds per 500m than the target, i.e. slower. Within
 *  `ON_TARGET_BAND_SECONDS` **inclusive** (`<=`, both directions — the
 *  boundary itself reads `"on-target"`, pinned by a dedicated test in
 *  both directions and the self-mutation that flips this to `<`, recorded
 *  in task-2-report.md): neither faster nor slower — the row/cell renders
 *  plain ink, no bar, no `±` label. */
export function judgeVsTarget(actual: number, target: number): BandVerdict {
  const deviationSeconds = actual - target;
  if (Math.abs(deviationSeconds) <= ON_TARGET_BAND_SECONDS) {
    return "on-target";
  }
  return deviationSeconds > 0 ? "slower" : "faster";
}
