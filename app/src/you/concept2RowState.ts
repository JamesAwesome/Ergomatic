import type { Concept2Link, LinkReadFailure } from "../api/useConcept2Link";

/**
 * The CONCEPT2 row's decision table (spec 2026-09-04-concept2-walk-fixes
 * §5.1, plus auto-send §3.4's fifth string), as a pure function so every one
 * of its fifteen leaf cells is a unit case. `Concept2Row.tsx` is the only
 * caller of `rowState` and carries the argument for the one place this
 * departs from the card's own ordering (ruling 5).
 */

/** The three things a LINKED link can read as, in the ONE order every
 *  surface uses — the You row (`rowState`), the card's pill (`linkedPill`)
 *  and the mode line (`modeLine`, `concept2CardModel.ts`) all take it from
 *  here, so they cannot disagree (auto-send §3.4: "the row and the card
 *  above it never disagree"). RECONNECT NEEDED first because a dead grant
 *  is the bigger fact; SEND FAILED next because it too is server-sticky. */
export type LinkedStatus = "RECONNECT NEEDED" | "SEND FAILED" | "LINKED ✓";

export function linkedStatus(
  link: Pick<Concept2Link, "needsReauth" | "sendFailedAt">,
): LinkedStatus {
  if (link.needsReauth) return "RECONNECT NEEDED";
  if (link.sendFailedAt !== null) return "SEND FAILED";
  return "LINKED ✓";
}
export type RowState =
  | "NOT LINKED"
  | "LINKED ✓"
  | "RECONNECT NEEDED"
  | "SEND FAILED"
  | "COULDN'T READ"
  | null;

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
  // Cells 9-14 — the two server-sticky states, before `failed`, on purpose
  // (ruling 5): a read that FAILED cannot have cleared either, and R3 says
  // no other state can hide a broken link. Auto-send §3.4 (A8) added SEND
  // FAILED as the fifth string with the same argument.
  if (link.linked) {
    const status = linkedStatus(link);
    if (status !== "LINKED ✓") return status;
  }
  // Cells 6, 8: a retained AVAILABLE link, so the rower knows the feature
  // exists and the failure is worth telling them about.
  if (failed !== null) return "COULDN'T READ";
  // Cells 5, 7.
  return link.linked ? "LINKED ✓" : "NOT LINKED";
}
