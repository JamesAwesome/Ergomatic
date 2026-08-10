# The library rebalance (the warmup-drop regen follow-on) — design

**Date:** 2026-08-10. **Authority:** James's rulings at PR #71's merge
("the 30-45 band took a hit" → rebalance; HYBRID retune/replace; a
spot-check round against book actuals with a variety guarantee); the
generation design (`2026-08-03-workout-generation-design.md`: the
photos → originals(private) → `patterns.json`(repo) pipeline, the
no-clone rule at its :113, the review-table idiom at :149, the quota
grid); `app/scripts/library-balance.ts` (the measuring stick; BEFORE
matched the old grid 20/20); the MOVED table in PR #71's body (the
damage record); the seed conventions in each type file's header
(James's offset calibration 2026-08-03, spm ranges, totals ending 0/5).

## 1. Goal

The 302-workout library, minus its warm-ups, redistributed to a NEW
warm-up-free target grid that restores the original band SHAPE — the
30-45 band made whole per ruling — via hybrid retune/replace, verified
by the balance script, spot-checked against the book, and guaranteed
varied. Onboarding's 2 workouts untouched throughout; every seed change
propagates by the content-addressed reconcile; NO migration.

## 2. The new target grid

The original grid's band shape, re-authored over warm-up-free
durations: for each type, the OLD target's cell counts stand as the new
targets (the design intent was always the post-warm-up work
distribution; the old grid simply measured it warm-up-inclusive). The
grid lands IN `patterns.json` as the new `targets` block (replacing the
warm-up-inclusive one), and the 20 orphaned `warmupMinutes` stat
entries are deleted in the same edit — the file becomes fully
warm-up-free. `library-balance.ts` reads targets from the file (single
source; today's duplicated TARGET constant dies) and its acceptance
statement becomes: AFTER matches the new grid within ±1 per cell
(the BEFORE-era tolerance: the old check accepted the 2-row onboarding
skew), with the balance table printed in the PR body.

## 3. The hybrid rule (mechanical first, judgment second)

Walk every workout outside its band, per type, hardest-hit bands first:

**RETUNE when** the workout reaches its band by stretching what it
already is: +1 rep to an existing set, or lengthening existing pieces,
to a ceiling of +25% total work time — WITHOUT changing its structure
archetype (a pyramid stays a pyramid; a ladder keeps its rungs' shape;
continuous stays continuous) and while keeping every house rule:
time-computable totals end in 0 or 5; spm conventions per the type
header; offsets within the type's calibrated ranges; rest:work
character preserved (rest may scale with the pieces it separates,
same ratios family).

**REPLACE when** retuning would need structural surgery. The
replacement is a fresh generation in the SAME type/difficulty/pain slot
targeting the deficient band, from `patterns.json` motifs, honoring the
generation phase's own rules verbatim: variety from structure not ±1'
tweaks; **no structure+parameter clone of any book entry** (the :113
rule); no near-duplicate of a surviving library workout (defined in
§5). New titles from the house naming vein (weather/sea). Replaced
workouts simply leave the seeds — logged sessions keep their own title
copies, so history is safe; `todayPick`/plan references resolve by id
and the plan re-picks as it already does for any missing workout (the
plan pins the exact fallback behavior by reading it, falsifying-line
rule, before claiming it).

**BUDGET expectation, not a rule:** the MOVED table implies most of the
deficit refills by retune (the +25% ceiling covers a dropped 5' warm-up
on most 20-40' workouts); replacements should be the minority and each
one is individually justified in the review table ("cannot stretch
because ...").

## 4. James's review gate (the Phase 6 idiom)

One rendered table, grouped by grid cell (the generation spec's :149
idiom), covering EVERY change: retunes as before → after one-liners
(structure, duration, offsets, spm); replacements as OUT-title /
IN-title with the new workout's full line and the one-sentence
cannot-stretch justification. Nothing lands on main before James's
content pass over this table. The table ships in the PR body AND as a
committed artifact beside the spec (the PR body idiom for big content
phases).

## 5. The spot-check round (James's addition, 2026-08-10)

Two halves, one committed report:

**(a) Book-actuals comparison.** A sample for James to check against
the book (his photos/originals CSV are PRIVATE and stay off-repo — the
generation pipeline's own boundary): stratified across type × band ×
change-kind (every replacement + a random 10% of retunes + 5 untouched
controls), each row rendering the workout beside the CHECKABLE
book-derived conventions the repo already encodes (offset ranges,
work:rest families, spm ranges, motif name from `patterns.json`). Two
verdict columns for James to fill: BOOK-FAITHFUL (the spirit — does
this read like the book's training intent for its type) and NOT-A-CLONE
(the :113 rule — near-identity to a book entry is a FAIL even when
faithful). Any FAIL loops that workout back through §3 and re-samples.

**(b) Variety audit, automated and committed as a test.** Per type ×
band: a structure-archetype histogram (continuous / evenly-split
intervals / pyramid / ladder / rate-change / mixed) asserting no cell
is single-archetype where it holds ≥4 workouts and no archetype exceeds
60% of a cell; and a near-duplicate detector over step signatures
(same archetype + same piece count + total within 10% + same offset
band = near-duplicate) asserting zero pairs within a cell. These run in
the seed test suite PERMANENTLY — variety becomes a pinned property of
the library, not a one-time check. Thresholds are this spec's opening
bid; the implementation task calibrates them against the CURRENT
library first (they must pass on today's content outside the deficient
bands — a threshold today's library fails is a wrong threshold, flagged
back to the spec, not silently loosened).

## 6. Book limits and actuals (the generators' hard numbers)

Digested from the owner's book photos via the generation pipeline
(`app/domain/generation/patterns.json` — aggregate statistics only, the
private originals stay off-repo). These are OBSERVED BOOK LIMITS: a
retune or replacement stays inside its cell's ranges, and a value
outside them needs a review-table justification. Columns: n = book
entries observed; shapes = archetype counts (the variety audit's
vocabulary); W:R = work:rest ratio range; offsets = pace-offset range
per base (s/500m); spm; reps = repeat counts seen; effort = fraction
prescribed by effort rather than split.

| book cell | n | shapes | W:R | offsets | spm | reps | effort |
|---|---|---|---|---|---|---|---|
| AN <20 | 9 | unmapped 7, nxdistance 2 | - | 2k -5..-5 | 28-28 | 8-10 | 0.11 |
| AN 20-30 | 6 | nxtime 3, continuous 1, mixed 1, nxdistance 1 | 0.33-2 | 2k -5..-3; 6k +18 | 24-36 | 6-20 | 0.5 |
| AN 30-45 | 8 | nxtime 4, mixed/unmapped/nxdistance/ladder 1 each | 0.2-1 | 6k +5 | 24-34 | 3-15 | 0.88 |
| AN 45-60 | 14 | nxtime 9, unmapped 4, nxdistance 1 | 0.2-0.38 | - | 30-36 | 4-25 | 0.71 |
| AN 60+ | 14 | nxtime 12, unmapped 2 | 0.03-2 | - | 30-36 | 4-25 | 0.86 |
| AT <20 | 3 | ladder 1, continuous 1, unmapped 1 | - | 6k -4..+0 | 20-26 | - | 0 |
| AT 20-30 | 14 | mixed 6, ladder 4, nxtime 3, nxdistance 1 | 1-1.5 | 2k -6..+12; 6k -2..+8 | 16-32 | 3-10 | 0.14 |
| AT 30-45 | 19 | mixed 11, nxtime 3, ladder 2, +3 others | 0.5-5 | 2k +4..+15; 6k -4..+15 | 16-32 | 2-4 | 0.05 |
| AT 45-60 | 24 | ladder 8, nxtime 7, mixed 7, +2 | 0.2-6.67 | 2k -4..+14; 6k -4..+10 | 16-34 | 2-15 | 0 |
| AT 60+ | 19 | mixed 8, nxtime 6, ladder 3, pyramid 2 | 0.2-3.33 | 2k +0..+13; 6k +0..+8 | 18-32 | 3-10 | 0 |
| O2 <20 | 5 | unmapped 3, continuous 2 | - | 6k +0 | 20-22 | - | 0 |
| O2 20-30 | 7 | mixed 4, continuous 2, ladder 1 | - | 6k +2..+15 | 18-26 | - | 0 |
| O2 30-45 | 36 | mixed 19, continuous 9, ladder 4, +4 | 0.5-12 | 2k -5..+16; 6k +0..+15 | 12-34 | 2-4 | 0 |
| O2 45-60 | 26 | mixed 10, continuous 8, ladder 6, nxtime 2 | 1-8 | 2k +4..+20; 6k +0..+18 | 14-32 | 2-3 | 0.04 |
| O2 60+ | 39 | mixed 19, continuous 11, nxdistance 5, +4 | 0.67-32 | 2k +0..+15; 6k -8..+16 | 12-32 | 3-8 | 0.1 |
| TR <20 | 8 | nxdistance 2, mixed 2, unmapped 2, +2 | 1-1 | 2k -3..+4; 6k +0 | 24-30 | 3-5 | 0.13 |
| TR 20-30 | 21 | nxtime 7, mixed 6, ladder 4, +4 | 0.3-3 | 2k -4..+4; 6k -8..+0 | 20-33 | 3-10 | 0.24 |
| TR 30-45 | 30 | mixed 13, nxdistance 8, ladder 5, nxtime 4 | 0.33-3.33 | 2k -7..+14; 6k -6..-4 | 16-38 | 2-35 | 0.2 |
| TR 45-60 | 12 | mixed 5, ladder 2, nxdistance 2, +3 | 0.28-1 | 2k -4..+8 | 20-38 | 2-15 | 0.17 |
| TR 60+ | 20 | mixed 10, nxtime 6, pyramid 2, +2 | 0.33-3 | 2k -4..+15 | 16-36 | 3-30 | 0.05 |

Interpretation rules, binding on every generating/retuning agent:

- **The book cells are WARM-UP-INCLUSIVE** (their `warmupMinutes` stats
  ran 5-10'). A warm-up-free workout consults the cell its duration
  occupied BEFORE the strip: a retuned 27' workout that was 32' with
  its warm-up obeys the 30-45 cell's ranges, not 20-30's.
- **A dash or missing bound means the book showed no observation
  there**, never "anything goes": fall back to the nearest populated
  band of the same type, tightened by the type header's calibration
  (e.g. O2's steady 6k+8..+12, firm to +4, floats +13..+16 — the seed
  file headers are calibration James already reviewed and they BEAT
  wider book ranges where they conflict).
- **`unmapped` shapes are book entries the step grammar cannot
  express** — they are NOT a license for exotic structures; generate
  only expressible archetypes (the generation spec's own rule).
- **Extremes are limits, not targets**: an O2 W:R of 32 or a TR reps
  of 35 exists in the book once; live near the mass of the
  distribution, justify anything within 10% of a range edge in the
  review table.
- The spot-check round (§5a) uses THIS table as its checkable half;
  James's book verdicts remain the authority where the digest is
  silent.

## 7. Mechanics

- Seed edits only (the five type files) + `patterns.json` (new targets,
  orphan cleanup) + `library-balance.ts` (targets from the file) + the
  new variety test + the committed review/spot-check artifacts. No
  domain, server, or client code changes expected; any that prove
  necessary are findings, not scope.
- The reconcile propagates content changes on boot (content-addressed,
  proven in the warmup phase); replaced workouts' rows update in place
  by title-keyed upsert or insert/delete per the reconcile's ACTUAL
  semantics — the plan reads `seedGlobalLibrary` and pins what happens
  to a row whose title disappears from the seeds (delete? orphan?),
  since replacement makes that path live for the first time. If
  disappeared-title rows persist as orphans, the plan adds the cleanup
  to the reconcile (server change, admitted as scope).
- Gates: the balance script's acceptance statement; the variety test;
  the full standing suite (seed counts/fixtures update); e2e untouched
  in intent (fixtures pinning specific seed workouts that got retuned
  update to the new numbers — the warmup phase's fleet discipline:
  per-test, what is this test FOR).

## 8. Exit

The balance table matches the new warm-up-free grid within ±1 per cell
with 30-45 restored; every change passed James's table review; the
spot-check round is on record with zero unresolved FAILs; the variety
properties are permanent tests; the library still counts 302 (300 + 2
onboarding untouched) unless a replacement justification says
otherwise and James approved the delta.
