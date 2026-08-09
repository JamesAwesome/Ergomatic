// The two designated global seed workouts the no-baseline onboarding card
// (Today, screen 2b) offers a brand-new account: a single distance work
// step at an effort ref, so they run with no baselines at all (see
// `needsBaselines.ts`). Titles are fixed constants — the ONLY identity the
// rest of the app uses to recognize them (suggestion-pool exclusion,
// Library-list exclusion, the card's own lookup) — so a rename anywhere
// can't silently strand a reference. Kept in `domain/` rather than beside
// the seed data itself because both the client (the card, the exclusion
// filters) and the server (`/api/today`'s exclusion, the seed's own
// fixed-title workouts) need the SAME constant, and domain is the one
// layer both already import.
export const ONBOARDING_TITLES = {
  k6: "First 6k",
  k2: "First 2k",
} as const;

// `estimateMinutes` cannot produce a real number without baselines (see
// `expand.ts`), and the house rule is never a bare dash — so the card's
// duration is this fixed nominal copy instead, keyed the same way as
// `ONBOARDING_TITLES`.
export const ONBOARDING_DURATION_COPY = {
  k6: "ABOUT 25 MIN",
  k2: "ABOUT 8 MIN",
} as const;

const ONBOARDING_TITLE_SET: ReadonlySet<string> = new Set(
  Object.values(ONBOARDING_TITLES),
);

/** Whether `title` is one of the two designated onboarding workouts —
 *  exact match only (no trim/case-fold: these are fixed seed titles, not
 *  user input). Every exclusion call site (suggestion pools, the Library
 *  list) ANDs this with the row's own `isGlobal` — title alone isn't
 *  enough: a rower's own custom workout that happens to share one of
 *  these titles is a real, ownable row, and must stay visible/suggestable
 *  (final-review fix, 2026-08-09). Only the two designated GLOBAL rows are
 *  ever meant to be invisible outside onboarding. */
export function isOnboardingTitle(title: string): boolean {
  return ONBOARDING_TITLE_SET.has(title);
}
