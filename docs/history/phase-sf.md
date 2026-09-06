# Phase SF — Shuffle and filters — closed 2026-09-05

Archived verbatim from ROADMAP at the close. A RECORD, not a backlog: the
current decision is in ROADMAP's completed-phase ledger, and the two live
items this phase left behind (the lazy-load invariant, the `/api/today`
decision) were lifted into the open-item register before archiving.

## The phase body as closed

**Status: CLOSED 2026-09-05 — all three PRs merged, exit pass + PM close run, released as v0.38.0 (notes PR + tag). This body is archived verbatim in `docs/history/phase-sf.md`; the ROADMAP row is the live record.** Ranked into the slate by James on the day: five things he found
using the app himself, and the first is a design that reads as a bug —
SHUFFLE steps through least-recently-done order, never-done entries tie in
seed order, and a mostly-unrowed library therefore "shuffles" in seed order
with the same card on top every day. Spec:
`docs/superpowers/specs/2026-09-04-shuffle-and-filters-design.md`.

- [x] PR1 (#297, merged 2026-09-05) — random first pick (stable per day), SHUFFLE without repeats,
      freestyle rolls a type once per day (a clear holds for the day; a
      LOGGED session re-rolls — James: "logged only"),
      Today's filters remembered per effective type (O2/AT/TR/AN/ANY).
      TRIAD: stored shapes `todayPick` (+shownIds), `todayOverrides`
      (filters out), NEW `todayFilters`; `/api/today` compiles against
      `suggest()`'s new `tieIds`. No tag until phase close (James). **M**
- [x] PR2 (#300, merged 2026-09-05) — TIME is a minutes range
      (a CUSTOM two-thumb control per the APG pattern — the native overlay
      fell at the anchor pass — 5-min steps, 0..120+) on BOTH sheets;
      `DurationBucket` and its bucket helpers RETIRED (`git grep
      DurationBucket -- app/` returns comments naming the retirement
      only — see the dead-code row), `/api/today` on `rangeForCap`;
      `todayFilters` v1 MAPS to v2; the source rename GLOBAL→ERGOMATIC LIBRARY,
      CUSTOM→MY WORKOUTS (James's Gate 0 pick, 2026-09-05, badge matching
      the filter tag; SOURCE moves to its own full-width row) at SEVEN
      rendered sites plus the row's accessible-name suffix (the delta pass
      found the workout DETAIL badge the six-site census missed).
      TRIAD. Gate 0 with both sheets, both orientations, before/after in
      BOTH directions on one pool. **M**
- [x] PR3 (#301, merged 2026-09-05) — Library SEARCH BY NAME
      field above FILTER ⌄ (rides the BACK record, cleared at the tab).
      James reviews; no PM gate; antagonist SKIP spoken (inherits phase
      ground; a client-side substring over an array already in memory, no
      new invariant class). **S**
- [ ] Phase close — antagonist exit pass, PM close, ONE release covering
      #296 + PR1 + PR2 + PR3 (James: "release after all of this phase";
      notes must say a freestyle morning now narrows to one type and how
      to clear it), agent-config check.

**Dead-code row (owed by PR2, James's 2026-09-04 rule — a change that
makes code unreachable adds the removal row in the same PR).** PR2 retires
`domain/duration.ts`'s `DurationBucket`, `DURATION_BUCKETS`,
`DURATION_LOWER_BOUND`, `bucketFor`, `bucketsForCap` and every consumer —
`git grep -l "DurationBucket\|bucketFor\|bucketsForCap\|DURATION_BUCKETS\|DURATION_LOWER_BOUND" -- app/`
at bdc098aa, tests excluded, twelve product files: `server/routes/data.ts`
(`/api/today`, missed by the spec's first grep and caught by the PM gate),
`src/today/todayOverrides.ts`,
`src/today/Today.tsx`, `src/today/TodayFilterSheet.tsx`,
`src/today/todayFilterTokens.ts`, `src/library/FilterSheet.tsx`,
`src/library/libraryFilters.ts`, `src/library/filters.ts`,
`src/components/durationTokenLabel.ts`, `src/components/durationChips.ts`,
`domain/suggest.ts`, `e2e/design.spec.ts` (the bucket-chip sweep), plus the
retired definitions themselves. `domain/recency.ts` names it in a comment
only; seven test files follow their subjects. Exit criterion 8:
`git grep DurationBucket -- app/` returns only comments recording the
retirement (path-scoped: this row and the spec name the symbol forever). **CLOSED by PR2 (2026-09-05):**
every consumer file migrated to `DurationRange`, `durationChips.ts` and
`durationTokenLabel.ts` deleted; the grep now matches ONE comment that
records the retirement (`domain/duration.ts` — this PR's own edit removed
the `domain/recency.ts` mention).

**Constraint carried for a later phase:** the library may lazy-load one
day (James). PR1's shuffle helpers are pure over the id arrays they are
handed and never assume the pool is the whole library — spec §2.4 — so a
paging phase inherits an invariant, not a rewrite.

