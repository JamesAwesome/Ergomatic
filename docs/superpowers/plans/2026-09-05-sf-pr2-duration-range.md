# Phase SF PR2 — TIME as a minutes range + the source rename: Implementation Plan

> **For agentic workers:** this plan is the RECORD of a PR the controller
> implemented inline in task commits (the shape James accepted at PR1's
> Gate 0, recorded in CLAUDE.md's SDLC bullet). What remains for a fresh
> agent is REVIEW: each task names its files, its gates and the mutations
> that bit. Use superpowers:requesting-code-review on the branch.

**Goal:** both filter sheets express TIME as a two-thumb minutes range
(0..120 in 5-minute steps, 0 = no lower bound, 120 = none upper), the
four-bucket API is retired everywhere, a stored bucket union is mapped to a
range once, and GLOBAL / CUSTOM read ERGOMATIC LIBRARY / MY WORKOUTS at
every rendered site (James's Gate 0 pick; SOURCE on its own row).

**Architecture:** `domain/duration.ts` owns `DurationRange` and the
predicate (`inRange`, inclusive both ends, 120 = no upper bound);
`components/DurationRange.tsx` is a custom two-thumb control per the
WAI-ARIA APG Multi-Thumb Slider pattern (the native overlay fell at the
anchor pass); Library's sessionStorage record requires the range, Today's
undated memory bumps to v2 and MAPS v1; the server's `/api/today` derives
its default from `rangeForCap`.

**Spec:** `docs/superpowers/specs/2026-09-04-shuffle-and-filters-design.md`
§3 and §4.4 (rev 1 + the PR2 as-built notes recorded there).

## Global constraints

- No framework or platform import in `app/domain/`.
- 44 px hit targets, WCAG AA; contrast computed and stated (below).
- No em-dashes in user-facing copy.
- Every new assertion gets a mutation that makes it fail, stated.
- Exit criterion 8: `git grep DurationBucket -- app/` matches only the one
  comment recording the retirement (`domain/duration.ts`).

---

### Task 1: domain — `DurationRange` replaces the buckets

**Commit:** `e5c7aa57`. **Files:** `domain/duration.ts` + test,
`domain/suggest.ts` + test.
**Produces:** `DurationRange { min; max }`, `DURATION_RANGE_MAX = 120`,
`DURATION_STEP = 5`, `UNBOUNDED_RANGE`, `isUnbounded`, `inRange`,
`rangeForCap` (rounds DOWN to the step, clamps at 120), `clampRange`,
`rangeFromBuckets` (v1 → v2; empty/unrecognisable → null);
`SuggestPrefs.durationRange` replaces `durations`.

- [x] 146 domain tests green (`pnpm exec vitest run --project unit
      domain/duration.test.ts domain/suggest.test.ts`).

### Task 2: the control and its labels

**Commit:** `e5c7aa57`. **Files:** `components/DurationRange.tsx` + test,
`components/durationRangeLabel.ts` + test, `index.css` (`.duration-range*`).
**Produces:** `<DurationRange label value onChange />`; `formatRangeLabel`
(the four cells: `25–35′`, `≤45′`, `60′+`, `ANY LENGTH`),
`formatThumbValue`, `thumbValueText`.

- [x] 13 tests: APG attributes, tab order, arrows/PageUp/Down/Home/End
      with independent literals (5, 15), no-cross clamp both ways, bound
      clamps, ignored keys, pointer drag with capture, rail tap moves the
      nearer thumb.

### Task 3: Library

**Commit:** `e5c7aa57`. **Files:** `library/filters.ts` (+test),
`libraryFilters.ts` (+test), `FilterSheet.tsx` (+test), `filterTokens.ts`
(+test), `WorkoutRow.tsx` (+test), `Library.tsx` (+test).
**Produces:** `Filters.durationRange`, `setDurationRange`,
`hasActiveFilters` via `isUnbounded`, `applyFilters` via `inRange`; the
parser REQUIRES `durationRange` (a bucket-era record is rejected whole —
it lives one BACK round trip); SOURCE reads ERGOMATIC LIBRARY / MY WORKOUTS on
its own full-width row (James's Gate 0 pick); the row and detail badges
and the accessible suffix read MY WORKOUTS / "one of my workouts"; the
empty state reads "None of my workouts yet".

- [x] 253 Library + component tests green.

### Task 4: Today

**Commit:** `e5c7aa57`. **Files:** `today/todayFilters.ts` (+test),
`todayFilterTokens.ts` (+test), `TodayFilterSheet.tsx` (+test), `Today.tsx`
(+test).
**Produces:** `FilterSet.durationRange`; `TodayFilters.v: 2` with v1 sets
MAPPED (`rangeFromBuckets`, empty union → unbounded); the TIME token per
spec I-13 (differs from the key's default → token; `[0,120]` past a
narrower default → `ANY LENGTH`); defaults from `rangeForCap`.

- [x] 301 Today tests green.

### Task 5: server

**Commit:** `e5c7aa57`. **File:** `server/routes/data.ts` (+test).
`/api/today` builds `durationRange: rangeForCap(prefs.timeCapMinutes)`;
the boundary test flips: a workout at exactly the cap is now IN the pool
(inclusive), the direction spec §3.5 names.

- [x] Integration project run (Docker) — see the PR record.

### Task 6: e2e + captures

**Commit:** `e5c7aa57` (specs) + the captures commit. `design.spec.ts`
measures both thumbs ≥ 44 px in portrait AND landscape and the accent span
/ ink knob; source selectors renamed; `screenshots.spec.ts` adds
`today-sheet-range`, `today-sheet-landscape`, `library-sheet-landscape`,
and `today-filtered` now carries the `25–35′` token.

- [x] `pnpm e2e` 491 passed; `pnpm screenshots` 127 passed.

### Task 7: docs + Gate 0

- [x] Spec §3.3/§3.4 as-built notes; DEVIATIONS row 67 (TIME + SOURCE
      copy); ROADMAP PR2 line + dead-code row CLOSED; antagonist ledger
      entry (PR1's coin-flip e2e lesson) rides here.
- [x] Gate 0: both sheets, both orientations, before (main's
      `today-sheet.png`, 71 OPTIONS) / after (78), LIBRARY vs BUILT-IN
      rendered, then James's own words ERGOMATIC LIBRARY / MY WORKOUTS
      rendered two ways; ruling: variant B (SOURCE on its own row), badge
      matches the filter tag.
- [x] Antagonist DELTA (FIX-THEN-PROCEED, five folded) + PM final gate
      (PASS WITH CONDITIONS, seven folded).

## Contrast (computed from `tokens.css`, 2026-09-05)

| Pairing | Ratio |
|---|---|
| thumb values `--ink-2` on `--page` (text) | 9.74:1 |
| knob `--ink` on `--page` (non-text) | 15.41:1 |
| selected span `--accent` on `--page` (non-text) | 5.35:1 |
| selected span `--accent` against the rail `--rule-3` | 3.43:1 |
| rail `--rule-3` on `--page` (decorative track) | 1.56:1 |
| focus ring `--accent` on `--page` | 5.35:1 |
| MY WORKOUTS badge / ERGOMATIC LIBRARY cell `--ink-3` on `--page` | 6.69:1 |
