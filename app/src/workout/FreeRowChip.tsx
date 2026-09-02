import { isFreeRow } from "../../domain/types.js";

/**
 * The JR chip — a free row's (Just Row's) one badge, on the door's badge
 * row and on History/Today's rows (Just Row unconnected spec, 2026-09-02,
 * §Mechanism piece 7; handoff README "The JR chip", rev 2e).
 *
 * DERIVED, NEVER STORED. Its only input is the PAIR, through `isFreeRow`
 * (`domain/types.ts`), so a consumer cannot key it on the id alone: a row
 * whose workout was deleted keeps its type (`workoutId: null`,
 * `workoutType: "O2"`) and is NOT a free row — it renders its type badge
 * and no chip. `"JR"` can never live in `workout_type`; the string exists
 * only here.
 *
 * ITS OWN CLASS, NEVER `type-badge`. Phase JR PR 1's exit criterion 2 is a
 * structural pin — a history list holding a free row renders no
 * `.type-badge` — and `e2e/justrow.spec.ts` asserts it by count. The chip
 * keeps that literally true. `TypeBadge` is untouched and still returns
 * null for a null type, so the two can never render on one row: the badge
 * needs a type, the chip needs its absence.
 */
export default function FreeRowChip({
  workoutId,
  workoutType,
}: {
  workoutId: string | null;
  workoutType: string | null;
}) {
  if (!isFreeRow(workoutId, workoutType)) return null;
  return <span className="free-row-chip">JR</span>;
}
