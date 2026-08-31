// The two designated global seed workouts the no-baseline onboarding card
// (Today, screen 2b) offers a brand-new account: a single distance work
// step at an effort ref, so they run with no baselines at all (see
// `needsBaselines.ts`). Titles are fixed constants — the ONLY identity the
// rest of the app uses to recognize them (suggestion-pool exclusion, the
// card's own lookup, the plan's checkpoint prescription refs) — so a
// rename anywhere can't silently strand a reference. The names are a
// DELIBERATE break from the library's poetic-name convention (Phase 8A
// PR B): these two are instruments, not sessions. They were "First 6k"/
// "First 2k" until 2026-08-22; the seed renames deployed rows in place
// via LEGACY_TITLE_RENAMES (server/seed/seed.ts) so pre-rename logs keep
// their workout link. Kept in `domain/` rather than beside
// the seed data itself because both the client (the card, the exclusion
// filters) and the server (`/api/today`'s exclusion, the seed's own
// fixed-title workouts) need the SAME constant, and domain is the one
// layer both already import.
export const ONBOARDING_TITLES = {
  k6: "6K Test",
  k2: "2K Test",
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

/** Whether `title` is one of the two designated test workouts — exact
 *  match only (no trim/case-fold: these are fixed seed titles, not user
 *  input). Surviving call sites (Phase 8A PR B made the rows VISIBLE in
 *  the Library, so the old Library-list exclusion is gone): the two
 *  suggestion-pool exclusions (Today.tsx's `entries` and /api/today —
 *  SHUFFLE's checkpoint escape depends on the tests sitting outside every
 *  pool), the no-baseline card's lookup, and the save-stack demotion
 *  (PostWorkoutSummary, onboarding title on a no-baseline account). Every
 *  exclusion call site ANDs this with the row's own `isGlobal` — title
 *  alone isn't enough: a LEGACY personal workout sharing one of these
 *  titles is a real, ownable row and must stay suggestable (final-review
 *  fix, 2026-08-09). Since 2026-08-31 NEW personal rows cannot take
 *  these titles: all three workout-writing routes (POST/PUT
 *  `/api/workouts` and `/bulk` — `routes/data.ts`'s `reservedTitle` and
 *  the bulk loop's own arm) reject them, and the Builder mirrors it at
 *  the field. The reservation is a fence around this string-keyed
 *  identity, not a product principle — a stable seed key retiring these
 *  call sites retires the fence too (PM gate, #238). */
export function isOnboardingTitle(title: string): boolean {
  return ONBOARDING_TITLE_SET.has(title);
}

/** Retired seed titles, mapped to the name that replaced them. Old titles
 *  are literals on purpose (frozen history, not the constant: the constant
 *  is the NEW name). Retirement trigger lives in ROADMAP ("Retire
 *  LEGACY_TITLE_RENAMES").
 *
 *  Lives in `domain/` rather than beside the seed data it was born in
 *  (`server/seed/seed.ts`, which now imports it) because it has TWO
 *  readers at different layers and they must not drift: the seed's boot
 *  pre-pass, which renames deployed WORKOUT rows in place so their ids —
 *  and every log's link to them — survive; and `canonicalTitle` below,
 *  which the CLIENT needs because the other half of that rename was never
 *  performed at all. */
export const LEGACY_TITLE_RENAMES: ReadonlyMap<string, string> = new Map([
  ["First 6k", ONBOARDING_TITLES.k6],
  ["First 2k", ONBOARDING_TITLES.k2],
]);

/** A stored title, resolved to the name that workout goes by today.
 *
 *  `session_logs.workout_title` is a SAVE-TIME SNAPSHOT and is never
 *  rewritten — the seed's rename pre-pass converges the workouts table
 *  only, and says so in its own comment. So a 2k test logged before
 *  2026-08-22 sits in the log table spelled "First 2k" forever, while
 *  every authored reference to it (a plan checkpoint's `PrescribedRef`,
 *  the no-baseline card) says "2K Test".
 *
 *  Any comparison of a stored title against an authored constant has to
 *  come through here first. Comparing the raw strings reports a deviation
 *  that never happened: the Plan screen's checkpoint row would tell a
 *  rower who DID do the prescribed 2k test that they did something else
 *  instead. Unknown titles — every library workout, every custom one —
 *  pass through untouched. */
export function canonicalTitle(title: string): string {
  return LEGACY_TITLE_RENAMES.get(title) ?? title;
}
