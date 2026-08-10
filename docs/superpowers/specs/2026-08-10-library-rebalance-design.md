# The library rebalance (the warmup-drop regen follow-on) — design

**Date:** 2026-08-10, adversarially revised same day (20 findings, 4
blocking — `2026-08-10-rebalance-adversarial-review.md`; §2/§3 were
REDESIGNED under James's ruling B: workouts get LONGER by intent,
specific ones may trend shorter, and 30-45 becomes the modal band). **Authority:** James's rulings at PR #71's merge
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

## 2. The new target grid (ruling B: longer by intent, mode at 30-45)

The old counts do NOT carry over (adversarial B1/B2: they were authored
over warm-up-inclusive durations — generation-design:94, "Duration =
total time including warm-up and rests" — and demanding them from
work-only durations is jointly infeasible with any character-preserving
retune rule: 40 of the 144 band-crossers cannot regain their old band
under +25%, and AN is structurally stuck at 22-under-20 versus an old
allowance of 14).

Instead the grid is AUTHORED, per type, to James's ruling: 30-45 is the
LARGEST cell in every type, 20-30 second; the library gets longer than
today's post-strip reality but is not forced back to the old
accounting; specific workouts may stay short. Opening draft (James
vetoes final numbers at the review gate):

| type | <20 | 20-30 | 30-45 | 45-60 | 60+ | total |
|---|---|---|---|---|---|---|
| O2 | 4 | 14 | 34 | 18 | 20 | 90 |
| AT | 6 | 20 | 32 | 12 | 5 | 75 |
| TR | 10 | 22 | 30 | 9 | 4 | 75 |
| AN | 12 | 16 | 20 | 8 | 4 | 60 |

**The grid is finalized by a FEASIBILITY SOLVE, not by hand:** plan
Task 1 computes, for every workout, its reachable bands under §3's
retune rule, checks a perfect assignment exists (the Hall's-condition
machinery the adversarial review built), adjusts cells by at most ±2
where infeasible, and derives the replacement list as the residual.
Output: the final grid + the complete move plan (who retunes where, who
gets replaced), submitted for James's approval BEFORE any content work.

Storage: the final grid lands in `patterns.json` as a NEW top-level
`targets` block (none exists today — adversarial B3; the file currently
holds only `_meta` and `cells`); `library-balance.ts` AND
`library.test.ts`'s QUOTA both read from it (the test's quota is today
a deliberate non-duplication — this phase makes the file the single
source and rewrites the test's own comment saying so). The 20
`warmupMinutes` stats are RETAINED (adversarial B4 correction: they are
the record of the book cells' warm-up-inclusiveness — §6's translation
rule depends on them; three AN cells run [10,20], not "5-10"). The
`cells` block stays warm-up-inclusive and says so in `_meta`.

## 3. The hybrid rule (mechanical first, judgment second)

The move plan from §2's feasibility solve assigns every out-of-band
workout one of:

**RETUNE when** the workout reaches its assigned band by stretching
what it already is — EITHER adding one rep to an existing repeated
block OR lengthening existing pieces by up to +25% total work time
(one-rep adds may exceed 25%; that is the point of the disjunction) —
WITHOUT changing its structure archetype, and keeping every house
rule: totals ending 0/5; spm per the type header where a header
carries calibration (o2.ts fully; an.ts a floor; at.ts/tr.ts have NONE
— adversarial M8 — so §6's book ranges govern there, tightened by the
existing library's own observed range); offsets within calibrated
ranges; rest scaling in the same ratio family. SHRINKING is equally
legal under ruling B's "specific ones may trend shorter" — same
character-preservation rules, justified in the review table.

**REPLACE when** the solve says no retune reaches any deficient band
(the residual list). Same rules as before: fresh generation in the
same type/difficulty/pain slot from `patterns.json` motifs, no
book-entry clone (generation-design:113), no near-duplicate of a
survivor (§5), house naming. Replacement is SAFE, verified not
deferred (adversarial M11): `seed.ts:44-46/:80-87` DELETES a
disappeared-title row, and `schema.ts:97-99` nulls the logs' workout
reference while logged sessions keep their own title copies; the
first post-deletion boot re-sorts (~290 sortOrder UPDATEs, one-time,
harmless — adversarial minor 16). `suggest.ts:213-215`'s
`sorted.find(...) ?? sorted[0]` re-picks Today's workout, already
pinned at `suggest.test.ts:792` (adversarial M12 — read, not assumed).

**Known test blast radius, scoped in (adversarial M10):**
`library.test.ts` QUOTA (rewritten against the new targets source),
`library-balance.test.ts`, `driver.test.ts`'s 16 Sea Fret assertions
(an O2 <20 workout — the solve should prefer KEEPING Sea Fret in <20
under ruling B's shorter-specifics slack, precisely because the
committed hardware-era fixtures lean on its shape; if the solve moves
it anyway, the fixtures update with the same per-test care as the
warmup fleet), `program.sweep.test.ts`'s Beam Sea.

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
change-kind (every replacement + a random 25% of retunes, minimum 20 + 5
untouched controls — the earlier 10% had ~51% power against a 5%
defect rate, adversarial minor 17), each row rendering the workout beside the CHECKABLE
book-derived conventions the repo already encodes (offset ranges,
work:rest families, spm ranges, motif name from `patterns.json`). Two
verdict columns for James to fill: BOOK-FAITHFUL (the spirit — does
this read like the book's training intent for its type) and NOT-A-CLONE
(the :113 rule — near-identity to a book entry is a FAIL even when
faithful). Any FAIL loops that workout back through §3 and re-samples.

**(b) Variety audit, automated and committed as a test.** FIRST the
classifier: no archetype classifier exists in the repo (adversarial
M5) — the audit begins by building one over step signatures and
UNIFYING the two vocabularies (the digest's nxtime/nxdistance/mixed/
ladder/pyramid/continuous vs the spec's earlier list; rate-change is
detectable only via spm deltas across steps and joins as a modifier
flag, not an archetype). Near-duplicate terms defined computably
(adversarial M7): "piece count" = expanded phase count via liveSteps;
"same offset band" applies to SplitRefs only — EffortRef workouts
compare by effort share + archetype + duration instead. THRESHOLDS ARE
MEASURED, NOT BID (adversarial M6: the earlier bid already fails 12 of
20 cells today, sharpest in O2|60+ where four near-identical continuous
6k+12 pieces coexist): the audit's first run against TODAY's library
sets the baseline; the pinned thresholds are the tightest values
today's untouched cells pass, and the O2|60+ cluster goes to James in
the review table as a PRE-EXISTING variety debt with a
fix-now-or-accept checkbox rather than silently grandfathered. Per type ×
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
  run 5-10' in most cells and [10,20] in three AN cells — read the
  cell, not this sentence). A warm-up-free workout consults the cell its duration
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
- **The seed test suite's hard spm gates (`library.test.ts:37-42`)
  are TIGHTER than the book ranges** (O2 18-26 vs book 12-34; TR 24-28
  vs book 16-38 — adversarial M9). The gates are James-reviewed library
  policy and WIN by default; a generated workout may exceed them only
  with a review-table justification row, and doing so widens the gate
  in the same commit (policy change made visible, never a test edit
  smuggled through).
- The spot-check round (§5a) uses THIS table as its checkable half;
  James's book verdicts remain the authority where the digest is
  silent. Lead-piece check (James, 2026-08-10, the Katabatic Wind
  question): where a workout opens with a long steady piece, the
  BOOK-FAITHFUL verdict also asks whether the lead reads as WORK or as
  a warm-up that lost its label — the offset is the tell.

## 7. Mechanics

- Seed edits only (the five type files) + `patterns.json` (new targets,
  orphan cleanup) + `library-balance.ts` (targets from the file) + the
  new variety test + the committed review/spot-check artifacts. No
  domain, server, or client code changes expected; any that prove
  necessary are findings, not scope.
- The reconcile is RESOLVED, not deferred (adversarial M11):
  disappeared titles are DELETED (`seed.ts:44-46/:80-87`), logs null
  their reference and keep their title copies (`schema.ts:97-99`).
  Band-edge translation (adversarial minor 15): pre-strip durations
  sitting exactly on a band edge (55 exist) bucket into the LOWER band,
  matching the balance script's existing edge-inclusivity — the plan
  cites the script's actual comparison operator before asserting it.
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
