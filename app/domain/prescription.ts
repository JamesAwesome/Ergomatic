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

/** The plan's own producer: the day's authored prescription, or null.
 *  Exported for its own tests and for the Plan screen's checkpoint marker.
 *  (Spec §3.2's `prescriptionForToday`/`PrescriptionContext` wrapper was
 *  cut from phase one by the PM review — the precedence resolver arrives
 *  with a second producer, Phase 8B/8C.) */
export function planPrescription(
  plan: { sessions: readonly { prescribe?: Prescription }[] },
  sessionIndex: number,
): Prescription | null {
  return plan.sessions[sessionIndex]?.prescribe ?? null;
}

/** THE one resolution point from a ref to a real workout, shared by BOTH
 *  suggestion callers (Today.tsx and /api/today) so this lookup exists
 *  exactly once. A `globalOnly` ref finds the designated GLOBAL row and
 *  NEVER a rower's own workout that happens to share the title — the same
 *  isGlobal rule every onboarding-title exclusion applies. Returns null on
 *  a miss (quiet degradation is right for a runtime miss; authored content
 *  is guarded by prescription.test.ts's seed-resolution test instead). */
export function resolvePrescribed<
  T extends { title: string; isGlobal: boolean },
>(ref: PrescribedRef, workouts: readonly T[]): T | null {
  return (
    workouts.find(
      (w) => w.title === ref.title && (!ref.globalOnly || w.isGlobal),
    ) ?? null
  );
}
