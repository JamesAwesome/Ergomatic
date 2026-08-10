# The rebalance spot-check: James's book-actuals pass (design spec §5a)

**Scope, as pinned:** every replacement (11, a census, not sampled) + 25%
of retunes with a floor of 20 (93 retunes, 25% = 23.25, rounded up to 24)
+ 5 untouched controls. Total sample: **40 rows**.

## Sampling method (reproducible)

The 24 sampled retunes are a stratified sample over `type x band x
change-kind` (change-kind: "one-rep" if the retune used the one-rep arm,
changing the workout's reps count; "scale" if it used the pure-scale
arm). Method:

1. Group all 93 retunes into `${type}|${destinationBand}|${kind}`
   strata (21 non-empty strata).
2. Allocate 24 samples across strata proportionally to each stratum's
   share of 93, using the largest-remainder method (floor each
   proportional share, then distribute the leftover seats to the
   strata with the largest fractional remainder).
3. Within each stratum, shuffle with a seeded PRNG and take the
   allocated count.

**PRNG:** mulberry32, seeded with a simple string-hash of the literal
seed string `"task5-spot-check-2026-08-10"`. Both the stratification and
the shuffle are deterministic and reproducible: given the same 93-retune
input list (in the order the live seed files iterate) and the same seed
string, this method always selects the same 24 titles. The generating
script is committed alongside this document's provenance in the Task 5
report.

Result: 19 "scale" retunes and 5 "one-rep" retunes across 21 strata (a
few single-member strata rounded to 0 under the largest-remainder
method, which is expected at n=24 over 21 cells; the two change-kinds
are both represented in the final sample rather than one crowding the
other out).

The 5 controls are one per type (O2, AT, TR, AN) drawn from the "stays"
pool by the same seeded shuffle, plus one additional random draw from
the remaining stays pool (landing on a second TR title). All 5 are
untouched by this phase (identical pre- and post-retune content).

## Reconciliation

| category | count |
|---|---|
| replacements (census) | 11 |
| retunes (stratified sample, 25% of 93, floor 20) | 24 |
| untouched controls | 5 |
| **total spot-check rows** | **40** |

## How to read each row

- **full card**: the workout's complete authored line as it exists in
  the live seed today (title, type, difficulty/pain, real-clock
  duration, and every step), via `describeSteps` over the live
  `WorkoutInput`.
- **archetype**: `classifyArchetype`'s own output (the variety audit's
  vocabulary; `+rc` marks a rate-change modifier).
- **book cell (post-translation)**: the §6 book cell this card is
  checked against, per the design spec's translation rule (a retune or
  control consults `band(current total + its historical warm-up)`; a
  replacement, having no historical warm-up, consults the cell one band
  above its assigned target, or its own cell when the target is already
  the top band).
- **checkable book ranges**: the `patterns.json` cell's own observed
  limits for that book cell (work:rest ratio, pace-offset ranges by
  base, spm, reps count, effort share). A dash in any field of the
  source data means the book showed no observation there (not "anything
  goes"); such fields are simply omitted from the ranges string below
  rather than printed as a fabricated range.
- **BOOK-FAITHFUL** (empty, James fills in): does this card read like
  the book's training intent for its type, checked against your own
  photos/originals?
- **NOT-A-CLONE** (empty, James fills in): is this card free of
  near-identity to a specific book entry (the generation spec's :113
  rule)? A card can be BOOK-FAITHFUL and still FAIL this column if it is
  too close to one particular book card rather than representative of
  the type.
- **LEAD-PIECE**: pre-filled with the question wherever a card opens
  with a piece that stands apart in length from what follows (James's
  Katabatic Wind question, 2026-08-10): does the opening piece read as
  WORK, or as a warm-up that lost its label when the library dropped
  its `wu` steps? `n/a` where no card opens that way.

**Any FAIL in BOOK-FAITHFUL or NOT-A-CLONE loops that workout back
through the hybrid retune/replace rule (design spec §3) and re-samples
this document per the same method above.**

## The sample


### O2 (9 rows)

| workout | kind | full card | archetype | book cell (post-translation) | checkable book ranges | BOOK-FAITHFUL | NOT-A-CLONE | LEAD-PIECE |
|---|---|---|---|---|---|---|---|---|
| Light Air | retune | Light Air (O2, medium/2, 20'): 4× [2:30 @6k+6 spm24 + 2:30 @6k+12 spm20] | nxtime+rc | O2\|20-30 | 6k off 2..15; spm 18-26; effort share 0 | | | n/a |
| Sun Dog | retune | Sun Dog (O2, medium/2, 20:04): 2100 m @6k+8 spm22 + rest 2' + 2100 m @6k+6 spm24 | nxdistance+rc | O2\|20-30 | 6k off 2..15; spm 18-26; effort share 0 | | | n/a |
| Halo Ring | retune | Halo Ring (O2, medium/3, 30'): 9:30 @6k+12 spm20 r2:15 + 7:30 @6k+9 spm22 r2:15 + 5' @6k+6 spm24 r1' + 2:30 @6k+4 spm26 | ladder+rc | O2\|30-45 | W:R 0.5-12; 2k off -5..16; 6k off 0..15; spm 12-34; reps 2-4; effort share 0 | | | n/a |
| Crepuscular Rays | retune | Crepuscular Rays (O2, medium/3, 30'): 12× [1:15 @6k+4 spm24 r1:15] | nxtime | O2\|30-45 | W:R 0.5-12; 2k off -5..16; 6k off 0..15; spm 12-34; reps 2-4; effort share 0 | | | n/a |
| Cirrocumulus | retune | Cirrocumulus (O2, medium/2, 50'): 5× [8' @6k+10 spm22 r2'] | nxtime | O2\|45-60 | W:R 1-8; 2k off 4..20; 6k off 0..18; spm 14-32; reps 2-3; effort share 0.04 | | | n/a |
| Fine Weather | retune | Fine Weather (O2, easy/2, 45'): 45' @6k+12 spm20 | continuous | O2\|45-60 | W:R 1-8; 2k off 4..20; 6k off 0..18; spm 14-32; reps 2-3; effort share 0.04 | | | n/a |
| Cirrostratus | retune | Cirrostratus (O2, medium/2, 61:36): 4× [3000 m @6k+12 spm22 r2'] | nxdistance | O2\|60+ | W:R 0.67-32; 2k off 0..15; 6k off -8..16; spm 12-32; reps 3-8; effort share 0.1 | | | n/a |
| Nimbostratus | retune | Nimbostratus (O2, medium/2, 60'): 39' @6k+12 spm20 + rest 4:30 + 16:30 @6k+9 spm22 | ladder+rc | O2\|60+ | W:R 0.67-32; 2k off 0..15; 6k off -8..16; spm 12-32; reps 3-8; effort share 0.1 | | | opens with 39' (nearly 2.4x the 16:30 piece that follows): WORK or a warm-up that lost its label? |
| Dawn Fog | control | Dawn Fog (O2, medium/3, 60'): 4× [12' @6k+10 spm22 r3'] | nxtime | O2\|60+ | W:R 0.67-32; 2k off 0..15; 6k off -8..16; spm 12-32; reps 3-8; effort share 0.1 | | | n/a |

### AT (10 rows)

| workout | kind | full card | archetype | book cell (post-translation) | checkable book ranges | BOOK-FAITHFUL | NOT-A-CLONE | LEAD-PIECE |
|---|---|---|---|---|---|---|---|---|
| Isobaric Ridge | retune | Isobaric Ridge (AT, easy/2, 20'): 600 m @6k+0 spm26 r2' + 1200 m @6k+2 spm24 r3:15 + 1750 m @6k+4 spm22 | ladder+rc | AT\|20-30 | W:R 1-1.5; 2k off -6..12; 6k off -2..8; spm 16-32; reps 3-10; effort share 0.14 | | | n/a |
| Frontal Boundary | retune | Frontal Boundary (AT, easy/2, 20'): 9' @6k+6 spm22 r3:30 + 2× [2' @6k+1 spm26 r1:45] | nxtime+rc | AT\|20-30 | W:R 1-1.5; 2k off -6..12; 6k off -2..8; spm 16-32; reps 3-10; effort share 0.14 | | | opens with a 9' lead before the 2x2' reps tail: WORK or a warm-up that lost its label? |
| Trough | retune | Trough (AT, medium/3, 20'): 5× [3' @6k+1 spm24 r1'] | nxtime | AT\|20-30 | W:R 1-1.5; 2k off -6..12; 6k off -2..8; spm 16-32; reps 3-10; effort share 0.14 | | | n/a |
| Cutoff Low | retune | Cutoff Low (AT, hard/4, 30'): 6× [4' @6k-1 spm26 r1'] | nxtime | AT\|30-45 | W:R 0.5-5; 2k off 4..15; 6k off -4..15; spm 16-32; reps 2-4; effort share 0.05 | | | n/a |
| Thermal Wind | retune | Thermal Wind (AT, medium/4, 30'): 9' @6k+3 spm22 r1:30 + 9' @6k+3 spm24 r1:30 + 9' @6k+3 spm26 | nxtime+rc | AT\|30-45 | W:R 0.5-5; 2k off 4..15; 6k off -4..15; spm 16-32; reps 2-4; effort share 0.05 | | | n/a |
| Cold Core | retune | Cold Core (AT, hard/4, 30:04): 2150 m @6k+5 spm22 r3:45 + 2150 m @6k+3 spm24 r3:45 + 4:30 @6k+0 spm26 | mixed+rc | AT\|30-45 | W:R 0.5-5; 2k off 4..15; 6k off -4..15; spm 16-32; reps 2-4; effort share 0.05 | | | n/a |
| Gap Wind | retune | Gap Wind (AT, hard/4, 30'): 12' @6k+3 spm24 r3:45 + 3× [3:30 @6k-2 spm26 r1:15] | nxtime+rc | AT\|30-45 | W:R 0.5-5; 2k off 4..15; 6k off -4..15; spm 16-32; reps 2-4; effort share 0.05 | | | opens with a 12' lead before the 3x3:30 reps tail: WORK or a warm-up that lost its label? |
| Filling Low | retune | Filling Low (AT, medium/3, 45:36): 4× [2000 m @6k+4 spm22 r3'] | nxdistance | AT\|45-60 | W:R 0.2-6.67; 2k off -4..14; 6k off -4..10; spm 16-34; reps 2-15; effort share 0 | | | n/a |
| Santa Ana | retune | Santa Ana (AT, medium/4, 45'): 5× [7' @6k+3 spm24 r2'] | nxtime | AT\|45-60 | W:R 0.2-6.67; 2k off -4..14; 6k off -4..10; spm 16-34; reps 2-15; effort share 0 | | | n/a |
| Jet Streak | control | Jet Streak (AT, hard/4, 30'): 30' @6k+3 spm24 | continuous | AT\|30-45 | W:R 0.5-5; 2k off 4..15; 6k off -4..15; spm 16-32; reps 2-4; effort share 0.05 | | | n/a |

### TR (8 rows)

| workout | kind | full card | archetype | book cell (post-translation) | checkable book ranges | BOOK-FAITHFUL | NOT-A-CLONE | LEAD-PIECE |
|---|---|---|---|---|---|---|---|---|
| Quartering Sea | retune | Quartering Sea (TR, medium/3, 20:02): 1100 m @2k+3 spm24 r4:15 + 3' @2k+2 spm26 r3:15 + 550 m @2k+1 spm28 r2:15 + 1' @2k-1 spm28 | mixed+rc | TR\|20-30 | W:R 0.3-3; 2k off -4..4; 6k off -8..0; spm 20-33; reps 3-10; effort share 0.24 | | | n/a |
| Humboldt Current | retune | Humboldt Current (TR, medium/4, 30:17): 1050 m @2k+4 spm24 r4:45 + 1050 m @2k+3 spm26 r4:45 + 1050 m @2k+2 spm26 r4:45 + 1050 m @2k+1 spm28 | nxdistance+rc | TR\|30-45 | W:R 0.33-3.33; 2k off -7..14; 6k off -6..-4; spm 16-38; reps 2-35; effort share 0.2 | | | n/a |
| Southerly Buster | retune | Southerly Buster (TR, medium/4, 30'): 6' @2k+5 spm24 r3' + 5' @2k+4 spm24 r3' + 3:30 @2k+3 spm26 r3' + 2:30 @2k+2 spm26 r3' + 1' @2k+1 spm28 | ladder+rc | TR\|30-45 | W:R 0.33-3.33; 2k off -7..14; 6k off -6..-4; spm 16-38; reps 2-35; effort share 0.2 | | | n/a |
| Oyashio Current | control | Oyashio Current (TR, hard/5, 22:26): 6' @2k+3 spm24 r3' + 4' @2k+1 spm26 r3:30 + 2' @2k-1 spm28 r3' + 250 m @max spm28 | mixed+rc | TR\|30-45 | W:R 0.33-3.33; 2k off -7..14; 6k off -6..-4; spm 16-38; reps 2-35; effort share 0.2 | | | opens with 6' at the mildest offset of the set, cutting down from there: WORK or a warm-up that lost its label? |
| Kuroshio | control | Kuroshio (TR, medium/3, 32:15): 6× [750 m @2k+3 spm26 r2:30] | nxdistance | TR\|30-45 | W:R 0.33-3.33; 2k off -7..14; 6k off -6..-4; spm 16-38; reps 2-35; effort share 0.2 | | | n/a |
| Beam Reach | replacement | Beam Reach (TR, medium/3, 20:18): 750 m @2k+4 spm24 r3' + 750 m @2k+2 spm26 r3' + 750 m @2k+0 spm28 r3' + 750 m @2k-2 spm28 | nxdistance+rc | TR\|30-45 | W:R 0.33-3.33; 2k off -7..14; 6k off -6..-4; spm 16-38; reps 2-35; effort share 0.2 | | | n/a |
| Following Seas | replacement | Following Seas (TR, medium/3, 70'): 10' @2k+6 spm24 r6' + 12' @2k+4 spm24 r6' + 14' @2k+2 spm26 r6' + 16' @2k+0 spm28 | ladder+rc | TR\|60+ | W:R 0.33-3; 2k off -4..15; spm 16-36; reps 3-30; effort share 0.05 | | | n/a |
| Tidal Race | replacement | Tidal Race (TR, medium/4, 65'): 5' @2k+6 spm24 r5' + 10' @2k+4 spm26 r5' + 15' @2k+2 spm28 r5' + 10' @2k+4 spm26 r5' + 5' @2k+6 spm24 | pyramid+rc | TR\|60+ | W:R 0.33-3; 2k off -4..15; spm 16-36; reps 3-30; effort share 0.05 | | | n/a |

### AN (13 rows)

| workout | kind | full card | archetype | book cell (post-translation) | checkable book ranges | BOOK-FAITHFUL | NOT-A-CLONE | LEAD-PIECE |
|---|---|---|---|---|---|---|---|---|
| Wall Cloud | retune | Wall Cloud (AN, medium/3, 21:12): 8× [250 m @2k-4 spm28 r1:45] | nxdistance | AN\|30-45 | W:R 0.2-1; 6k off 5..5; spm 24-34; reps 3-15; effort share 0.88 | | | n/a |
| Downburst | retune | Downburst (AN, hard/5, 20'): 1' @max spm32 r3' + 1:30 @max spm30 r3:30 + 2' @max spm30 r3:30 + 1:30 @max spm30 r3' + 1' @max spm32 | pyramid+rc | AN\|20-30 | W:R 0.33-2; 2k off -5..-3; 6k off 18..18; spm 24-36; reps 6-20; effort share 0.5 | | | n/a |
| Gustnado | retune | Gustnado (AN, hard/5, 30'): 8× [1:15 @max spm32 r2:30] | nxtime | AN\|30-45 | W:R 0.2-1; 6k off 5..5; spm 24-34; reps 3-15; effort share 0.88 | | | n/a |
| Wedge Tornado | retune | Wedge Tornado (AN, hard/5, 30'): 5× [1' @max spm32 r2' + 0:30 @max spm32 r2:30] | ladder | AN\|45-60 | W:R 0.2-0.38; spm 30-36; reps 4-25; effort share 0.71 | | | n/a |
| Satellite Tornado | control | Satellite Tornado (AN, hard/4, 23'): 4× [1' @2k-4 spm28 r1' + 0:45 @2k-4 spm30 r0:45 + 0:30 @max spm32 r1:45] | ladder+rc | AN\|30-45 | W:R 0.2-1; 6k off 5..5; spm 24-34; reps 3-15; effort share 0.88 | | | n/a |
| Meso Low | replacement | Meso Low (AN, medium/4, 50'): 10× [3' @2k-4 spm30 r2'] | nxtime | AN\|60+ | W:R 0.03-2; spm 30-36; reps 4-25; effort share 0.86 | | | n/a |
| Rear Flank | replacement | Rear Flank (AN, hard/4, 50'): 5× [1' @max spm32 r1' + 2' @max spm32 r1' + 3' @max spm32 r2'] | ladder | AN\|60+ | W:R 0.03-2; spm 30-36; reps 4-25; effort share 0.86 | | | n/a |
| Scud Run | replacement | Scud Run (AN, hard/4, 45'): 12× [1:30 @max spm32 r2:15] | nxtime | AN\|60+ | W:R 0.03-2; spm 30-36; reps 4-25; effort share 0.86 | | | n/a |
| Cloud to Ground | replacement | Cloud to Ground (AN, hard/4, 55'): 4× [1:30 @max spm32 r2' + 3' @max spm30 r2:15 + 1' @max spm32 r1:30 + 2:30 @max spm30] | mixed+rc | AN\|60+ | W:R 0.03-2; spm 30-36; reps 4-25; effort share 0.86 | | | n/a |
| Bolt from the Blue | replacement | Bolt from the Blue (AN, hard/4, 45'): 3× [1' @max spm32 r1:30 + 2' @max spm32 r1:30 + 3' @max spm30 r1:30 + 2' @max spm32 r1:30 + 1' @max spm32] | pyramid+rc | AN\|60+ | W:R 0.03-2; spm 30-36; reps 4-25; effort share 0.86 | | | n/a |
| Ground Flash | replacement | Ground Flash (AN, hard/4, 55'): 11× [1:30 @max spm32 r3:30] | nxtime | AN\|60+ | W:R 0.03-2; spm 30-36; reps 4-25; effort share 0.86 | | | n/a |
| Positive Strike | replacement | Positive Strike (AN, hard/5, 60'): 4× [1' @max spm32 r1' + 2' @max spm32 r1' + 3' @max spm30 r1' + 4' @max spm30 r2'] | ladder+rc | AN\|60+ | W:R 0.03-2; spm 30-36; reps 4-25; effort share 0.86 | | | n/a |
| Downburst Line | replacement | Downburst Line (AN, hard/5, 64:30): 3× [1:30 @max spm32 r2' + 3' @max spm32 r2' + 4:30 @max spm30 r2' + 3' @max spm32 r2' + 1:30 @max spm32] | pyramid+rc | AN\|60+ | W:R 0.03-2; spm 30-36; reps 4-25; effort share 0.86 | | | n/a |

## Cross-reference

- Full retune/replacement content, before-and-after: the review table
  (`docs/superpowers/specs/2026-08-10-rebalance-review-table.md`).
- Book cell definitions and their observed ranges: `app/domain/generation/patterns.json`'s `cells` block, digested from the owner's private
  reference photos (design spec §6).
- The variety audit's automated half (§5b, the archetype-histogram and
  near-duplicate gates): `app/server/seed/library/variety.test.ts`,
  running permanently in the seed test suite; not reproduced here since
  it needs no James verdict, only the O2|60+ debt checkbox in the review
  table does.
