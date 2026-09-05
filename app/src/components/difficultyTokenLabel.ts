import type { Difficulty } from "../../domain/types.js";
import { DIFFICULTY_CHIPS } from "./difficultyChips";

/** Lifted from `src/today/todayFilterTokens.ts`'s own private
 *  `collapseDifficulties` (library-filter-unification round, 2026-08-11 —
 *  Task 1) to this shared home, mirroring the (since-retired, Phase SF PR2)
 *  `durationTokenLabel.ts`'s precedent for the then-identical TIME idiom: Library's own DIFFICULTY token
 *  (new this round) needs the exact same contiguous-range collapse Today
 *  already built, and a second hand-kept copy is the wrong answer for a
 *  rule this codebase already extracted once. Behavior is unchanged —
 *  `todayFilterTokens.test.ts` exercises this unmodified through
 *  `todayFilterTokens()`, its one existing public entry point.
 *
 *  Ordered-range collapse over EASY/MEDIUM/HARD: a contiguous run
 *  collapses to its endpoints ("EASY–MEDIUM"), a non-contiguous selection
 *  lists every member ("EASY, HARD"). Order-independent — DIFFICULTY_CHIPS'
 *  own fixed index is what "contiguous" means, not insertion order. Empty
 *  is reachable (Today's sheet allows deselecting every difficulty; a
 *  stored/committed record can legitimately hold none) and reads "NONE"
 *  rather than an empty string, since an empty token label would render as
 *  an invisible, un-clearable-looking token — Library's own
 *  `filterTokens.ts` never calls this with an empty array (an empty
 *  `difficulties` selection means "no filter" there, so no token is
 *  emitted at all), but the empty-safe behavior costs nothing to keep for
 *  the caller that does need it. */
export function collapseDifficulties(values: Difficulty[]): string {
  if (values.length === 0) return "NONE";
  const indices = values
    .map((d) => DIFFICULTY_CHIPS.findIndex((c) => c.value === d))
    .sort((a, b) => a - b);
  const contiguous = indices.every(
    (idx, i) => i === 0 || idx === indices[i - 1] + 1,
  );
  if (!contiguous) {
    return indices.map((i) => DIFFICULTY_CHIPS[i].label).join(", ");
  }
  const first = indices[0];
  const last = indices[indices.length - 1];
  return first === last
    ? DIFFICULTY_CHIPS[first].label
    : `${DIFFICULTY_CHIPS[first].label}–${DIFFICULTY_CHIPS[last].label}`;
}
