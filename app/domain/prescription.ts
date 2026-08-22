// Phase 8A (plan prescriptions, spec §3.2): the vocabulary a plan day uses
// to pre-suggest a specific workout. Lives in its own module because both
// suggestion callers (the client's Today screen and the server's
// /api/today route) and the plan data itself need the same types.

/** A reference to a workout, by designated global title. A union with one
 *  member ON PURPOSE: Phase 8C must reference a rower's OWN workout by id
 *  (titles are user-editable with no uniqueness constraint), so the `kind`
 *  discriminant stays even while only one kind exists. */
export type PrescribedRef = {
  kind: "title";
  title: string;
  /** Only a GLOBAL row satisfies this ref — a rower's own custom workout
   *  that happens to share the title is a real, ownable row and never what
   *  a plan checkpoint means (the same isGlobal rule every onboarding-title
   *  exclusion already applies, domain/onboarding.ts). */
  globalOnly: boolean;
};

export interface Prescription {
  ref: PrescribedRef;
  /** The suggestion's reason line, authored WITH the prescription so no
   *  consumer branches on where it came from. */
  reason: string;
}
