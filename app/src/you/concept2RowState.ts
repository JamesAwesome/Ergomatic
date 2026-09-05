import type { Concept2Link, LinkReadFailure } from "../api/useConcept2Link";

/**
 * The CONCEPT2 row's decision table (spec 2026-09-04-concept2-walk-fixes
 * §5.1), as a pure function so every one of its eleven leaf cells is a unit
 * case. `Concept2Row.tsx` is the only caller and carries the argument for
 * the one place this departs from the card's own ordering (ruling 5).
 */
export type RowState =
  "NOT LINKED" | "LINKED ✓" | "RECONNECT NEEDED" | "COULDN'T READ" | null;

export function rowState(
  link: Concept2Link | null,
  failed: LinkReadFailure | null,
  seen: boolean,
): RowState {
  if (link === null) {
    // Cells 1, 2a, 2b. Nothing has resolved this mount. A failure is worth
    // saying ONLY to an account that has been told, on some earlier
    // successful read, that Concept2 exists for it (R4) — the first thing a
    // rower ever hears about Concept2 must not be an error.
    return failed !== null && seen ? "COULDN'T READ" : null;
  }
  // Cells 3, 4: a SUCCESSFUL read said this account has no Concept2. A later
  // failed re-read is not evidence against it.
  if (!link.available) return null;
  // Cells 9, 10 — before `failed`, on purpose (ruling 5). R3: no other state
  // can hide a broken link.
  if (link.linked && link.needsReauth) return "RECONNECT NEEDED";
  // Cells 6, 8: a retained AVAILABLE link, so the rower knows the feature
  // exists and the failure is worth telling them about.
  if (failed !== null) return "COULDN'T READ";
  // Cells 5, 7.
  return link.linked ? "LINKED ✓" : "NOT LINKED";
}
