/** The Library's own recency boundary — originally `src/library/filters.ts`'s
 *  own `RECENCY_BOUNDARY_DAYS`/`isRecent`, moved here (Round 2, 2026-08-04:
 *  "Today's sheet gains the Library's LAST DONE and SOURCE groups") so
 *  `domain/suggest.ts`'s own LAST DONE predicate can share the IDENTICAL
 *  boundary/rule Today's filter sheet and the Library's both render cells
 *  for — the same domain-ward move `DurationBucket`/`bucketFor` made for
 *  TIME (see `domain/duration.ts`'s own doc comment for the full reasoning):
 *  `domain/` never imports client code, while `src/library/filters.ts`
 *  already imports from `domain/`, so a client module importing FROM
 *  `domain/` is the established direction — `filters.ts` re-exports both
 *  names unchanged so its own (and every other pre-existing) importer needs
 *  no update. */
export const RECENCY_BOUNDARY_DAYS = 21;

// Never-done (`lastDoneDaysAgo === null`) counts as NOT recent — pinned by
// filters.test.ts's "never-done" case, not an oversight, and reused as-is by
// domain/suggest.ts's own LAST DONE predicate: a never-done library entry
// lands in `21D+`/`over21`, the same "not recent" bucket it's always
// belonged to on the Library screen.
export function isRecent(lastDoneDaysAgo: number | null): boolean {
  return lastDoneDaysAgo !== null && lastDoneDaysAgo < RECENCY_BOUNDARY_DAYS;
}
