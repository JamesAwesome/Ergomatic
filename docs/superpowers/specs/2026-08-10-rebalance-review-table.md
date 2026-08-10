# The rebalance review table: James's Gate 2 content pass (design spec §4)

**Method.** Every number below is traced to the LIVE seed files at this
branch's tip (`app/server/seed/library/{o2,at,tr,an}.ts`), not to the
`review-table-draft.md` working file Tasks 3/4 appended to. The accuracy
pass ran the production code itself (`domain/expand.ts`'s `rawMinutes`,
`domain/generation/archetype.ts`'s `classifyArchetype`/`structureSignature`,
`scripts/library-moves.ts`'s `describeSteps`/`bookCell`) against every one
of the 300 `LIBRARY_WORKOUTS`, and separately against the pre-retune content
recovered from git (`5afc3ab` for O2/AT, `8fd4b8f` for TR/AN, the commits
immediately before each type's own retune commit), then diffed the two.
That diff, not hand transcription, is what produced every "before" and
"after" cell in this table. Discrepancies the diff caught against the
working draft are called out inline and in the accuracy-pass note at the
end of each section; every one is a wording or transcription slip, none
changes a band, a count, or a gate outcome.

## Reconciliation (top of the table, as required)

| category | count | source |
|---|---|---|
| retunes | 93 | diff of live seeds vs pre-retune git content, by title |
| replacements | 11 | titles present in the live seeds with no pre-retune counterpart (3 TR, 8 AN) |
| stays (not listed below) | 196 | titles unchanged between pre-retune content and the live seeds |
| **total library** | **300** | 90 O2 + 75 AT + 75 TR + 60 AN, `patterns.targets` |

93 + 11 + 196 = 300. This matches the move plan's own summary table
(`docs/superpowers/specs/2026-08-10-library-rebalance-move-plan.md`,
"Summary": O2 63 stays/27 up, AT 43/32, TR 56/16+3, AN 34/18+8) exactly,
row for row, re-derived independently here from the live content rather
than copied from it. The two onboarding rows (Phase 6I, outside
`LIBRARY_WORKOUTS`) are not part of either count and are excluded
throughout, per every prior task's own convention.

The 196 stays are not enumerated below (300 rows of "unchanged" would bury
the 104 rows that matter); they are exactly `300 − 93 − 11`, confirmed by
the diff above, and any title not appearing as a retune, a replacement OUT,
or a replacement IN in this document is a stay.

## Corrections already folded into every "after" number below

Two correction passes landed during Tasks 3/4 and are already reflected in
the "after" column everywhere in this table (re-verified against the live
seed, not re-applied here):

1. **The rest-grid ruling** (James, 2026-08-10): a retune-created rest must
   land on the house 0:15 grid. Three O2 sketches originally used
   `4/3`/`7/6`-minute rests to hit a clean 0/5 total; corrected to 1:15.
2. **Extended to created work pieces** (controller, 2026-08-10, resolving
   both open questions from the rest-grid pass by library precedent): any
   time value a retune CREATES, not only rests, stays on the 0:15 grid;
   a value the workout already carried, on-grid or not, is left alone. Two
   more corrections followed from this (Ground Swell's and Crepuscular
   Rays' own work pieces).

Nine rows in total needed a grid correction (three O2, six AN; TR needed
none). Every one is marked `[grid-corrected]` in its row below, with the
exact correction quoted in its cell's "Grid corrections" note. **Zero band
moves resulted from any correction**, verified against the live seed's
`estimateMinutes`/`rawMinutes`, not re-asserted from the reports.

## O2

O2 total: 27 retunes, 0 replacements. Every O2 workout places (no
residual).

#### O2|20-30 (7 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Haar | unchanged (nxtime+rc, 4 pieces) | 16' → 20' | 6k+12 (unchanged) | 18/20/22/24 (unchanged) |
| Light Air | unchanged (nxtime+rc, reps 4 × 2 pieces) | 16' → 20' | 6k+6/+12 (unchanged) | 24/20 (unchanged) |
| Dead Calm | reps 3 → 4 (nxdistance) | 18:50 → 25:07 | 6k+10 (unchanged) | 22 (unchanged) |
| Ground Swell | unchanged (nxtime, reps 6) (⚠ book cell O2\|30-45 (§6 fallback); reps 6 outside its 2-4 (inherited, unchanged by this retune)) | 18' → 21' [grid-corrected] | 6k+8 (unchanged) | 24 (unchanged) |
| Sun Dog | unchanged (nxdistance+rc, 2 pieces) | 19:12 → 20:04 | 6k+8/+6 (unchanged) | 22/24 (unchanged) |
| Glassy Swell | unchanged (ladder+rc, 3 pieces) | 19' → 20' | 6k+12/+10/+8 (unchanged) | 20/22/24 (unchanged) |
| Slack Water | unchanged (nxtime+rc, 4 pieces) | 19' → 20:45 [grid-corrected] | 6k+10 (unchanged) | 20/22/24/26 (unchanged) |

Grid corrections in this cell:

- **Ground Swell**: grid-corrected: rest 7/6min -> 1:15 (0:15 grid, James's ruling); the work piece 13/6min -> 2:15 (0:15 grid, the created-work-piece extension) -- both within the retune's own envelope. Band held throughout.
- **Slack Water**: grid-corrected (James's rest-grid ruling, 2026-08-10): rest 4/3min -> 1:15 (0:15 grid); that alone dropped the total under the 20-30 floor, so the piece grew 4' -> 4:15 (inside the retune's own +25% envelope) to hold the band with a grid rest. Total no longer 0/5; stands as its pieces sum.

#### O2|30-45 (8 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Crepuscular Rays | unchanged (nxtime, reps 12) (⚠ book cell O2\|30-45; reps 12 outside its 2-4 (inherited, unchanged by this retune)) | 24' → 30' [grid-corrected] | 6k+4 (unchanged) | 24 (unchanged) |
| Diamond Dust | unchanged (nxtime+rc, 3 pieces) | 24' → 30' | 6k+10 (unchanged) | 22/24/26 (unchanged) |
| Radiation Fog | unchanged (nxtime, reps 4) | 24' → 30' | 6k+10 (unchanged) | 22 (unchanged) |
| Afterglow | unchanged (pyramid, 5 pieces) | 25' → 30' | 6k+8 (unchanged) | 22 (unchanged) |
| Halo Ring | unchanged (ladder+rc, 4 pieces) | 25' → 30' | 6k+12/+9/+6/+4 (unchanged) | 20/22/24/26 (unchanged) |
| Silver Thaw | unchanged (ladder+rc, 4 pieces) | 26:10 → 30:01 | 6k+10/+8/+6/+4 (unchanged) | 20/22/24/26 (unchanged) |
| Indian Summer | unchanged (ladder+rc, 4 pieces) | 28' → 30' | 6k+10 (unchanged) | 20/22/24/26 (unchanged) |
| Zodiacal Light | unchanged (ladder+rc, 3 pieces) | 29' → 30' | 6k+12/+8/+6 (unchanged) | 20/22/24 (unchanged) |

Grid corrections in this cell:

- **Crepuscular Rays**: grid-corrected: rest 7/6min -> 1:15 (0:15 grid, James's ruling); the work piece 4/3min -> 1:15 (0:15 grid, the created-work-piece extension, exactly the retune's +25% cap). Lands exactly on the 30-45 floor.

#### O2|45-60 (8 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Valley Fog | reps 2 → 3 (nxdistance) | 32:24 → 48:36 | 6k+10 (unchanged) | 22 (unchanged) |
| Hazy Sunshine | unchanged (ladder+rc, 2 pieces) (⚠ book cell O2\|45-60; W:R 11.01 (was 11.78) outside its 1-8 (pre-existing ratio)) | 38:20 → 45:03 | 6k+12/+8 (unchanged) | 20/22 (unchanged) |
| Cirrocumulus | reps 4 → 5 (nxtime) (⚠ book cell O2\|45-60; reps 5 outside its 2-3 (CREATED by the one-rep arm)) | 40' → 50' | 6k+10 (unchanged) | 22 (unchanged) |
| Cirrus | unchanged (nxtime, reps 5) (⚠ book cell O2\|45-60; reps 5 outside its 2-3 (inherited, unchanged by this retune)) | 40' → 45' | 6k+9 (unchanged) | 22 (unchanged) |
| Fine Weather | unchanged (continuous, 1 piece) | 40' → 45' | 6k+12 (unchanged) | 20 (unchanged) |
| Moon Halo | reps 4 → 5 (nxtime+rc × 2 pieces) (⚠ book cell O2\|45-60; reps 5 outside its 2-3 (CREATED by the one-rep arm)) | 40' → 50' | 6k+12 (unchanged) | 22/24 (unchanged) |
| Alpenglow | unchanged (nxtime, reps 3) | 42' → 45' | 6k+12 (unchanged) | 20 (unchanged) |
| Harmattan | unchanged (nxtime+rc, 3 pieces) | 42' → 45' | 6k+12 (unchanged) | 20/22/24 (unchanged) |

#### O2|60+ (4 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Fair Weather | reps 2 → 3 (nxtime) | 40' → 60' | 6k+12 (unchanged) | 20 (unchanged) |
| Cirrostratus | reps 3 → 4 (nxdistance) | 46:12 → 61:36 | 6k+12 (unchanged) | 22 (unchanged) |
| Altostratus | unchanged (continuous, 1 piece) | 50' → 60' | 6k+11 (unchanged) | 22 (unchanged) |
| Nimbostratus | unchanged (ladder+rc, 2 pieces) | 54' → 60' | 6k+12/+9 (unchanged) | 20/22 (unchanged) |

**Accuracy-pass note (O2):** re-verifying the working draft against the
live seeds found two presentational issues, corrected above, neither a
band or duration change: Haar's and Silver Thaw's "structure" column read
"ladder"/"mixed" in the draft; `classifyArchetype` reads Haar as
`nxtime+rc` (four EQUAL 5' pieces at rising spm, not a ladder: a ladder
requires strictly monotonic durations) and Silver Thaw, Glassy Swell,
Hazy Sunshine and Nimbostratus as `ladder+rc` (strictly decreasing
distances/durations, which the draft's ad hoc "mixed/nxdistance"/"mixed"
labels did not capture). Every duration, offset and spm value in the O2
draft checked out exactly against the live seed.

## AT

AT total: 32 retunes, 0 replacements. Every AT workout places (no
residual).

#### AT|20-30 (8 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Isobaric Ridge | unchanged (ladder+rc, 3 pieces) (⚠ book cell AT\|20-30; W:R 2.81 (was 3.12) outside its 1-1.5 (pre-existing ratio)) | 16:28 → 20' | 6k+0/+2/+4 (unchanged) | 26/24/22 (unchanged) |
| Ridge Axis | unchanged (nxtime+rc, 3 pieces) (⚠ book cell AT\|20-30; W:R 3.00 (was 3.00) outside its 1-1.5 (inherited)) | 16' → 20' | 6k+4/+1/-2 (unchanged) | 22/24/26 (unchanged) |
| Trough | reps 4 → 5 (nxtime) (⚠ book cell AT\|20-30; W:R 3.00 (was 3.00) outside its 1-1.5 (inherited)) | 16' → 20' | 6k+1 (unchanged) | 24 (unchanged) |
| Marine Layer | unchanged (mixed+rc, 3 pieces) (⚠ book cell AT\|20-30; W:R 2.49 (was 2.98) outside its 1-1.5 (pre-existing ratio)) | 17:54 → 20:04 | 6k+4/+2/+4 (unchanged) | 22/24/22 (unchanged) |
| Confluence Zone | unchanged (nxtime+rc, 6 pieces) (⚠ book cell AT\|20-30; W:R 3.00 (was 2.40) outside its 1-1.5 (pre-existing ratio)) | 17' → 20' | 6k+1 (unchanged) | 22/22/24/24/26/26 (unchanged) |
| Upper Ridge | unchanged (nxtime+rc, 3 pieces) (⚠ book cell AT\|20-30; W:R 9.00 (was 7.50) outside its 1-1.5 (pre-existing ratio)) | 17' → 20' | 6k+5 (unchanged) | 22/24/26 (unchanged) |
| Diffluence Zone | reps 4 → 5 (nxdistance) (⚠ book cell AT\|30-45; reps 5 outside its 2-4 (CREATED by the one-rep arm)) | 18:24 → 23' | 6k+2 (unchanged) | 24 (unchanged) |
| Frontal Boundary | unchanged (nxtime+rc, reps 2) (⚠ book cell AT\|20-30; W:R 1.86 (was 2.00) outside its 1-1.5 (pre-existing ratio); reps 2 outside its 3-10 (inherited)) | 18' → 20' | 6k+6/+1 (unchanged) | 22/26 (unchanged) |

#### AT|30-45 (15 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Comma Cloud | reps 2 → 3 (pyramid+rc × 3 pieces) | 20' → 30' | 6k+0/+2/+0 (unchanged) | 26/24/26 (unchanged) |
| Blocking High | unchanged (nxtime, reps 4) | 24' → 30' | 6k+2 (unchanged) | 24 (unchanged) |
| Heat Low | unchanged (nxtime, reps 4) | 24' → 30' | 6k-2 (unchanged) | 26 (unchanged) |
| Inversion Layer | unchanged (nxtime+rc, reps 3) | 24' → 30' | 6k+2/+0 (unchanged) | 24/26 (unchanged) |
| Long Wave | unchanged (pyramid+rc, 5 pieces) | 24' → 30' | 6k+3 (unchanged) | 26/24/22/24/26 (unchanged) |
| Omega Block | unchanged (nxtime, reps 6) (⚠ book cell AT\|30-45; reps 6 outside its 2-4 (inherited, unchanged by this retune)) | 24' → 30' | 6k+3 (unchanged) | 24 (unchanged) |
| Anticyclone | unchanged (continuous, 1 piece) | 25' → 30' | 6k+4 (unchanged) | 22 (unchanged) |
| Cutoff Low | reps 5 → 6 (nxtime) (⚠ book cell AT\|30-45; reps 6 outside its 2-4 (CREATED by the one-rep arm)) | 25' → 30' | 6k-1 (unchanged) | 26 (unchanged) |
| Gap Wind | unchanged (nxtime+rc, reps 3) | 25' → 30' | 6k+3/-2 (unchanged) | 24/26 (unchanged) |
| Thermal Low | unchanged (nxtime, 4 pieces) | 26' → 30' | 6k+1 (unchanged) | 24 (unchanged) |
| Triple Point | unchanged (pyramid+rc, 5 pieces) | 27:18 → 30' | 6k+0 (unchanged) | 26/24/24/24/26 (unchanged) |
| Squall Line | unchanged (ladder+rc, 4 pieces) | 27:50 → 30' | 6k+2/+0/-2/-4 (unchanged) | 24/24/26/26 (unchanged) |
| Thermal Wind | unchanged (nxtime+rc, 3 pieces) (⚠ book cell AT\|30-45; W:R 9.00 (was 8.00) outside its 0.5-5 (pre-existing ratio)) | 27' → 30' | 6k+3 (unchanged) | 22/24/26 (unchanged) |
| Cold Core | unchanged (mixed+rc, 3 pieces) | 28:48 → 30:04 | 6k+5/+3/+0 (unchanged) | 22/24/26 (unchanged) |
| Cyclogenesis | unchanged (nxtime, 2 pieces) (⚠ book cell AT\|30-45; W:R 6.50 (was 6.00) outside its 0.5-5 (pre-existing ratio)) | 28' → 30' | 6k+0 (unchanged) | 26 (unchanged) |

#### AT|45-60 (9 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Coastal Jet | reps 2 → 3 (ladder+rc × 2 pieces) | 30' → 45' | 6k+4/+0 (unchanged) | 22/26 (unchanged) |
| Short Wave | reps 2 → 3 (nxdistance) | 33:24 → 50:06 | 6k+5 (unchanged) | 22 (unchanged) |
| Filling Low | reps 3 → 4 (nxdistance) | 34:12 → 45:36 | 6k+4 (unchanged) | 22 (unchanged) |
| Foehn | unchanged (nxtime, reps 3) | 36' → 45' | 6k+5 (unchanged) | 22 (unchanged) |
| Maestro | unchanged (nxtime, reps 4) | 40' → 45' | 6k+4 (unchanged) | 22 (unchanged) |
| Santa Ana | unchanged (nxtime, reps 5) | 40' → 45' | 6k+3 (unchanged) | 24 (unchanged) |
| Ostro | reps 8 → 9 (nxdistance) | 41:04 → 46:12 | 6k+2 (unchanged) | 26 (unchanged) |
| Chinook | reps 3 → 4 (nxdistance) | 43:45 → 58:20 | 6k+5 (unchanged) | 22 (unchanged) |
| Buran | unchanged (ladder+rc, 4 pieces) | 43' → 45' | 6k+6/+4/+2/+0 (unchanged) | 22/24/24/26 (unchanged) |

**Accuracy-pass note (AT):** the same archetype-vocabulary check applied
to AT found Isobaric Ridge labeled "mixed/nxdistance" in the draft where
`classifyArchetype` reads `ladder+rc` (a strictly decreasing 3-piece
distance sequence at rising spm). Every duration, offset, and spm value
in the AT draft checked out exactly against the live seed. AT has zero
replacements (every AT workout places).

## TR

TR total: 16 retunes + 3 replacements. TR|<20 12, TR|20-30 23,
TR|30-45 29, TR|45-60 7 (untouched, no rows below), TR|60+ 4. Every cell
measures exactly onto `patterns.targets.TR` (confirmed by
`pnpm exec tsx scripts/library-balance.ts`, appended in full below).

#### TR|20-30 (6 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Monsoon Trough | unchanged (mixed+rc, 3 pieces) | 16:52 → 20:03 | 2k+4/+0/+3 (unchanged) | 24/28/24 (unchanged) |
| Leveche | reps 2 → 3 (mixed+rc × 2 pieces) | 17:50 → 26:45 | 2k+5/+3 (unchanged) | 24/26 (unchanged) |
| Quartering Sea | unchanged (mixed+rc, 4 pieces) | 18:43 → 20:02 | 2k+3/+2/+1/-1 (unchanged) | 24/26/28/28 (unchanged) |
| Norte | unchanged (nxtime, reps 4) | 18' → 20' | 2k+4 (unchanged) | 24 (unchanged) |
| Easterly Wave | reps 8 → 9 (nxdistance) | 19:28 → 21:54 | 2k+0 (unchanged) | 28 (unchanged) |
| Confused Sea | unchanged (pyramid+rc, 5 pieces) | 19' → 20' | 2k+0/+1/+2/+1/+0 (unchanged) | 28/26/26/26/28 (unchanged) |

#### TR | replacement -> 20-30

| out | in | cannot-stretch justification | new card |
|---|---|---|---|
| Cross Sea | **Beam Reach** | Every band Cross Sea reaches is already full of workouts that reach nothing else, and it reaches none of the unfilled seats (move-plan residual, verified against the live pre-retune seed: Cross Sea was 15:02 real clock, reach={<20} only). | TR, medium/3, 20-30: 4x750 m descending 2k+4 -> 2k+2 -> 2k+0 -> 2k-2 with 3' rest, spm 24/26/28/28. Live seed confirms the descending offset sequence and constant-then-rising spm are Cross Sea's own (kept on purpose, per `logDraft.test.ts`'s refLabel sign-branch fixture), scaled up in distance only (500 m -> 750 m). Generated against book cell TR\|30-45 (§6 translation, replacement one band above target). Archetype nxdistance+rc; zero near-duplicate pairs (generation gate, confirmed by `variety.test.ts`'s TR\|20-30 count). Duration 20:18. |

#### TR|30-45 (10 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Sundowner | unchanged (mixed+rc, 5 pieces) | 24:18 → 30' | 2k+2/+1/+0/+1/+2 (unchanged) | 26/28/28/28/26 (unchanged) |
| Humboldt Current | unchanged (nxdistance+rc, 4 pieces) | 25:46 → 30:17 | 2k+4/+3/+2/+1 (unchanged) | 24/26/26/28 (unchanged) |
| Southerly Buster | unchanged (ladder+rc, 5 pieces) | 25' → 30' | 2k+5/+4/+3/+2/+1 (unchanged) | 24/24/26/26/28 (unchanged) |
| Piteraq | unchanged (nxdistance+rc, 8 pieces) | 26:04 → 30:04 | 2k+0/+0/+0/+0/+2/+2/+2/+2 (unchanged) | 28/28/28/28/26/26/26/26 (unchanged) |
| Elephanta | unchanged (ladder+rc, reps 2 × 2 pieces) | 26' → 30' | 2k+3/+0 (unchanged) | 26/28 (unchanged) |
| Gulf Stream | unchanged (nxdistance+rc, 8 pieces) | 28:38 → 30:09 | 2k+3/+0/+3/+0/+3/+0/+3/+0 (unchanged) | 26/28/26/28/26/28/26/28 (unchanged) |
| Antarctic Drift | unchanged (mixed+rc, 5 pieces) | 28:56 → 30:07 | 2k+2/+1/+0/-1/max (unchanged) | 26/26/28/28/28 (unchanged) |
| Khamsin | unchanged (pyramid+rc, 5 pieces) | 29:06 → 30' | 2k+2 (unchanged) | 26/26/24/26/28 (unchanged) |
| Labrador Current | unchanged (nxdistance, reps 12) | 29:12 → 31:26 | 2k+0 (unchanged) | 26 (unchanged) |
| Libeccio | reps 3 → 4 (ladder+rc × 2 pieces) | 29:18 → 39:04 | 2k+3/+0 (unchanged) | 26/28 (unchanged) |

#### TR | replacement -> 60+

| out | in | cannot-stretch justification | new card |
|---|---|---|---|
| Monsoon Surge | **Tidal Race** | Every band Monsoon Surge reaches is already full of workouts that reach nothing else, and it reaches none of the unfilled seats (move-plan residual, verified against the live pre-retune seed: Monsoon Surge was 13:52 real clock, reach={<20} only). | TR, medium/4, 60+: 5-10-15-10-5' pyramid, offsets 2k+6/+4/+2/+4/+6 (peak at 2k+2, not flat 2k: the accuracy pass corrected this from the working draft's "into flat 2k" prose, which did not match the live seed), 5' rest, spm 24/26/28/26/24. Generated against book cell TR\|60+ (already the top band). Archetype pyramid+rc; zero near-duplicate pairs (generation gate). Duration 65'. |
| Head Sea | **Following Seas** | Head Sea is 15:48 on the real clock; the solve's assignment to 20-30 ran on the ROUNDED minute (16'), and +25% of the real total tops out at 19:45, short of 20-30's floor, so the seat was licensed by rounding and no legal sketch exists (James's Head Sea addendum, Gate 1). | TR, medium/3, 60+: 10-12-14-16' time ladder, offsets 2k+6/+4/+2/+0 (easing to flat 2k, confirmed against the live seed), 6' rest, spm 24/24/26/28. Generated against book cell TR\|60+. Archetype ladder+rc; zero near-duplicate pairs. Duration 70'. |

TR total: 16 retunes + 3 replacements (Beam Reach, Tidal Race, Following
Seas). TR|<20 12 (untouched, not listed), TR|20-30 23, TR|30-45 29,
TR|45-60 7 (untouched, not listed), TR|60+ 4. Every cell measures exactly
onto `patterns.targets.TR`.

**Accuracy-pass note (TR):** two genuine numeric errors found and
corrected here, neither changing a band: Piteraq's after-duration read
30:07 in the working draft; the live seed computes 30:04 (traced via
`rawMinutes` over the actual 8-piece content). Antarctic Drift's
after-duration read 30:12 in the draft; the live seed computes 30:07.
Both are now correct above. Separately, the Tidal Race replacement
card's own prose ("into flat 2k") did not match its generated content
(the live seed's peak offset is 2k+2, not 2k+0); corrected above, no
band or gate consequence, the spm progression and duration were already
right. Every other TR duration, offset, and spm value checked out
exactly.

## AN

AN total: 18 retunes + 8 replacements. AN|<20 14, AN|20-30 17,
AN|30-45 18, AN|45-60 7, AN|60+ 4. Every cell measures exactly onto
`patterns.targets.AN` (the library's +1/61 in the balance script's raw
print is the AN onboarding row, outside `LIBRARY_WORKOUTS`, same
artifact O2's own onboarding row already carries in O2|20-30).

#### AN|20-30 (10 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Wet Microburst | unchanged (nxdistance, reps 6) | 16:29 → 20:36 | max (unchanged) | 32 (unchanged) |
| Downburst | unchanged (pyramid+rc, 5 pieces) | 16' → 20' | max (unchanged) | 32/30/30/30/32 (unchanged) |
| Bow Echo | reps 6 → 7 (nxdistance) | 17:24 → 20:18 | 2k-4 (unchanged) | 30 (unchanged) |
| Wall Cloud | unchanged (nxdistance, reps 8) | 17:46 → 21:12 | 2k-4 (unchanged) | 28 (unchanged) |
| Mammatus | unchanged (pyramid+rc, 5 pieces) | 17' → 20' [grid-corrected] | 2k-3 (unchanged) | 30/28/26/28/30 (unchanged) |
| Heat Lightning | unchanged (nxdistance, reps 10) | 18:06 → 20:36 | max (unchanged) | 32 (unchanged) |
| Ball Lightning | unchanged (nxtime, reps 3 × 3 pieces) | 18' → 21' [grid-corrected] | max (unchanged) | 32 (unchanged) |
| Debris Flow | unchanged (ladder+rc, 5 pieces) | 18' → 20' [grid-corrected] | 2k-3/-4/-4/-4/max (unchanged) | 28/30/30/32/32 (unchanged) |
| Ground Strike | unchanged (nxtime, reps 4) (⚠ book cell AN\|20-30; reps 4 outside its 6-20 (inherited, unchanged by this retune)) | 18' → 20' | max (unchanged) | 30 (unchanged) |
| Landspout | unchanged (nxtime, reps 12) | 18' → 21' [grid-corrected] | max (unchanged) | 32 (unchanged) |

Grid corrections in this cell:

- **Mammatus**: grid-corrected: the raw scale search's 0:50/1:10/1:50 pieces and a 2:20 rest sat off the 0:15 grid; regrown to the nearest grid values that hold the band, landing exactly on 20:00.
- **Ball Lightning**: grid-corrected: the raw scale search's 1:10/1:10/2:50 rests sat off the 0:15 grid; the last rest grown past its nearest grid value, to 3', to land exactly on 21:00 rather than the 20:15 the nearest value alone would leave -- still inside the +25% envelope.
- **Debris Flow**: grid-corrected: the raw scale search's 1:40/1:20/1:10/0:50 pieces and 4:30/3:50/3:20/2:50 rests sat off the 0:15 grid; regrown to grid values that hold the same descending shape and land exactly on 20:00.
- **Landspout**: grid-corrected: the raw scale search's 1:10 rest sat off the 0:15 grid; regrown to 1:15, the nearest grid value (total 21:00, not round -- stands as its pieces sum).

#### AN | replacement -> 45-60

| out | in | cannot-stretch justification | new card |
|---|---|---|---|
| Updraft | **Meso Low** | Every band Updraft reaches is already full of workouts that reach nothing else, and it reaches none of the unfilled seats (move-plan residual; live pre-retune seed: 15' real clock, reach={<20} only). | AN, medium/4, 45-60: 10x3' at 2k-4, spm 30, 2' rest. Generated against book cell AN\|60+ (§6 translation, replacement one band above target). Archetype nxtime; zero near-duplicate pairs. Duration 50'. |
| Gust Front | **Rear Flank** | Same, move-plan residual; live pre-retune seed: 10' real clock, reach={<20} only. | AN, hard/4, 45-60: 5 rounds of a 1-2-3' ladder all out (max effort), spm 32 constant, rests 1'/1'/2' per round. Archetype ladder; zero near-duplicate pairs. Duration 50'. |
| Dust Storm | **Scud Run** | Same, move-plan residual; live pre-retune seed: 9:44 real clock, reach={<20} only. | AN, hard/4, 45-60: 12x1:30 all out with 2:15 rest (approximately 1:1.5 work:rest). Archetype nxtime; zero near-duplicate pairs. Duration 45'. |
| Heat Burst | **Cloud to Ground** | Same, move-plan residual; live pre-retune seed: 8' real clock, reach={<20} only. | AN, hard/4, 45-60: 4 rounds of 1:30/3'/1'/2:30 all out, spm 32/30/32/30 (rate-change). Archetype mixed+rc. Zero near-duplicate pairs. Duration 55'. |
| Sheet Lightning | **Bolt from the Blue** | Same, move-plan residual; live pre-retune seed: 14' real clock, reach={<20} only. | AN, hard/4, 45-60: 3 rounds of a 1-2-3-2-1' pyramid all out, spm 32/32/30/32/32 (rate-change). Archetype pyramid+rc. Zero near-duplicate pairs. Duration 45'. |
| Dry Lightning | **Ground Flash** | Same, move-plan residual; live pre-retune seed: 15' real clock, reach={<20} only. | AN, hard/4, 45-60: 11x1:30 all out with 3:30 rest (approximately 1:2.3 work:rest). Archetype nxtime; zero near-duplicate pairs. Duration 55'. |

#### AN|30-45 (8 retunes)

| workout | structure | duration before → after | offsets | spm |
|---|---|---|---|---|
| Wind Gust | reps 2 → 3 (nxtime × 4 pieces) | 20' → 30' | 2k-3 (unchanged) | 28 (unchanged) |
| Gustnado | unchanged (nxtime, reps 8) | 24' → 30' | max (unchanged) | 32 (unchanged) |
| Pyrocumulonimbus | unchanged (ladder+rc, reps 2 × 3 pieces) (⚠ book cell AN\|30-45; reps 2 outside its 3-15 (inherited, unchanged by this retune)) | 24' → 30' | max (unchanged) | 32/30/30 (unchanged) |
| Bomb Cyclone | unchanged (ladder, reps 2 × 4 pieces) (⚠ book cell AN\|30-45; W:R 0.43 (was 0.39) outside its 0.2-0.38 (inherited direction, but the MAGNITUDE is corrected here: the move plan/draft stated 0.38, which is wrong; this task's accuracy pass traced the live seed's actual work:rest seconds and got 0.43; still an inherited excess, not created by this retune, just larger than reported); reps 2 outside its 4-25 (inherited)) | 25' → 30' [grid-corrected] | max (unchanged) | 32 (unchanged) |
| Giant Hail | unchanged (ladder, reps 4 × 2 pieces) | 25' → 30' | max (unchanged) | 32 (unchanged) |
| Wedge Tornado | unchanged (ladder, reps 5 × 2 pieces) | 25' → 30' | max (unchanged) | 32 (unchanged) |
| Flash Flood | unchanged (ladder+rc, reps 2 × 4 pieces) (⚠ book cell AN\|30-45; reps 2 outside its 3-15 (inherited, unchanged by this retune)) | 27' → 30' [grid-corrected] | max (unchanged) | 32/32/30/30 (unchanged) |
| Hailstorm | unchanged (nxdistance, reps 2 × 5 pieces) (⚠ book cell AN\|30-45; reps 2 outside its 3-15 (inherited, unchanged by this retune)) | 29' → 30:18 | 2k-4 (unchanged) | 30 (unchanged) |

Grid corrections in this cell:

- **Bomb Cyclone**: grid-corrected: the raw scale search's 1:10/0:50/0:40 pieces and 3:40/3'/2:20/1:50 rests sat off the 0:15 grid; regrown to grid values that hold the same descending shape and land exactly on 30:00.
- **Flash Flood**: grid-corrected: the raw scale search's 0:50/1:10/1:40 pieces and 1:40/2:10/2:50/4:10 rests sat off the 0:15 grid; regrown to grid values that hold the same 4-rung ladder and land exactly on 30:00.

#### AN | replacement -> 60+

| out | in | cannot-stretch justification | new card |
|---|---|---|---|
| Lightning Strike | **Positive Strike** | Every band Lightning Strike reaches is already full of workouts that reach nothing else, and it reaches none of the unfilled seats (move-plan residual; live pre-retune seed: 9' real clock, reach={<20} only). | AN, hard/5, 60+: 4 rounds of a 1-2-3-4' ladder all out, spm 32/32/30/30 (rate-change). Book cell AN\|60+ (already top band). Archetype ladder+rc; zero near-duplicate pairs. Duration 60'. |
| Dry Microburst | **Downburst Line** | Same, move-plan residual; live pre-retune seed: 15' real clock, reach={<20} only. | AN, hard/5, 60+: 3 rounds of a 1:30-3-4:30-3-1:30' pyramid all out, spm 32/32/30/32/32 (rate-change). Archetype pyramid+rc; zero near-duplicate pairs. Duration 64:30. |

AN total: 18 retunes + 8 replacements (Meso Low, Rear Flank, Scud Run,
Cloud to Ground, Bolt from the Blue, Ground Flash, Positive Strike,
Downburst Line).

**Accuracy-pass note (AN):** every duration, offset, and spm value
checked out exactly against the live seed for all 18 AN retunes and all
8 replacement cards, with one exception already corrected above: Bomb
Cyclone's flagged work:rest ratio read 0.38 in the working draft's §6
flag table; the live seed's actual work:rest seconds (`workRestSeconds`
over the real content) compute to 0.43. This does not change which band
Bomb Cyclone occupies or which cell it is checked against, only the
size of the pre-existing excess against the book's 0.2-0.38 ceiling
(still flagged `(inherited)`, the retune did not create it, it grew
somewhat because the grid correction adjusted work and rest pieces by
different amounts rather than a single uniform factor).

## The six AN grid corrections (and O2's three)

Nine retunes needed their raw scale-search result regrown onto the
house 0:15 grid before landing in the seed (design spec's rest-grid
pin, extended to any retune-created time value). Three are O2 (Slack
Water, Ground Swell, Crepuscular Rays, all under §"Corrections already
folded into every after number below"); six are AN (Mammatus, Landspout,
Ball Lightning, Flash Flood, Debris Flow, Bomb Cyclone, each quoted in
its own cell's "Grid corrections" note above). TR needed none (task-4
report, confirmed: every TR retune's raw search already landed on-grid).
Zero band moves resulted from any of the nine; two (Landspout, Ball
Lightning) land on a non-0/5 total as the house rule's own explicit
allowance ("a total that cannot be round with grid values stands as its
pieces sum").

## The four rep-range escape rows

Every reps-count change a retune's one-rep arm makes is checked against
the book cell's own `repsCount` range (§6). Most land inside it or
inherit a pre-existing excess the retune did not create (the `(inherited)`
tag in the flagged rows above). Exactly four are NEW excesses the one-rep
arm itself creates, none of them tagged `(inherited)` or `(pre-existing)`
in the move plan's own §6 flags table, confirmed here against the live
seed's actual reps counts:

| workout | reps | book cell | book range | escape |
|---|---|---|---|---|
| Moon Halo | 4 -> 5 | O2\|45-60 | 2-3 | +2 over the ceiling |
| Cirrocumulus | 4 -> 5 | O2\|45-60 | 2-3 | +2 over the ceiling |
| Diffluence Zone | 4 -> 5 | AT\|30-45 | 2-4 | +1 over the ceiling |
| Cutoff Low | 5 -> 6 | AT\|30-45 | 2-4 | +2 over the ceiling |

Context (move plan, re-verified): 42 of the 162 workouts in today's
library that carry a reps marker already sit outside their own book
cell's `repsCount` range, across 11 of the 20 cells (O2|45-60's own book
range is 2-3 and the untouched library already runs 2-10 there before
any retune touches it). These four rows are not an anomaly against that
baseline; they are the ONLY four where the one-rep arm itself, rather
than pre-existing content, pushed a workout past its cell's ceiling, and
are surfaced separately here because they are the rows this task's
accuracy pass can attribute directly to a retune decision rather than to
content that already existed.

## spm-gate widening: none

Checked, not assumed: `app/server/seed/library/library.test.ts`'s hard
spm gates (`O2: [18,26]`, `AT: [22,26]`, `TR: [24,28]`, `AN: [26,32]`,
the file's own `SPM` constant) are UNCHANGED across every commit of this
phase (`git diff 5afc3ab..975bff7 -- app/server/seed/library/library.test.ts`
touches no `SPM[...]` line), and the test that enforces them
("keeps every work step's spm inside its type's band") is part of the
green `pnpm test` run at every commit Tasks 3/4 reported and at this
task's own final state. Since every one of the 93 retunes and 11
replacements is in `LIBRARY_WORKOUTS` and that test iterates
`LIBRARY_WORKOUTS` directly, a passing suite is proof by construction
that no spm value in this table exceeds its type's gate. Zero
spm-gate-widening rows.

## O2|60+ pre-existing variety debt: FIX-NOW-OR-ACCEPT

This is the named cluster the variety audit (design spec §5b) was built
to surface, re-measured against the LIVE `server/seed/library/variety.test.ts`
`KNOWN_DEBT` table (its own self-checking tests confirm this number is
exactly what `nearDuplicates()` reports over the current cell, not a
hand-adjusted figure):

**O2|60+ carries 6 near-duplicate pairs today** (`KNOWN_DEBT["O2|60+"] = 6`,
up from 4 before this phase's O2 retunes):

- Glass Sea <-> Sleet (continuous, 1 piece, 60'/65', pre-existing)
- Fair Wind <-> Morning Mist (continuous, 1 piece, 70'/67', pre-existing)
- Fair Wind <-> Sleet (continuous, 1 piece, 70'/65', pre-existing)
- Morning Mist <-> Sleet (continuous, 1 piece, 67'/65', pre-existing)
- Glass Sea <-> Altostratus (continuous, 1 piece, 60'/60', NEW: Altostratus's
  own retune, 50' -> 60', landed it at exactly Glass Sea's total)
- Altostratus <-> Sleet (continuous, 1 piece, 60'/65', NEW: same retune)

All six are single-piece continuous 6k+8..+12 pieces within 10% of each
other's total (the two extremes, 60' and 70', sit 14.3% apart and are the
one pair the detector does not flag). This is the same content pattern
the adversarial review's own headline example named before any retune
landed; this task's O2 work made it larger (4 -> 6) by retuning Altostratus
into the same total as an existing member of the cluster, not by
introducing a new archetype into the cell.

**James's decision (check one):**

- [ ] FIX NOW: swap one or more of Glass Sea / Fair Wind / Morning Mist /
      Sleet / Altostratus for a fresh O2|60+ continuous single at a
      different total (loops back through §3, re-samples the spot-check)
- [ ] ACCEPT: pin 6 as O2|60+'s new `KNOWN_DEBT` ceiling (already the live
      value; no seed change needed, the ratchet already holds at this
      number)

## Tie-break swappability

Where the solve's residual named a SPECIFIC out-title to replace, the
choice of which title (among several with an identical reachable-band
profile) was a tie-break, not a finding (move plan, TR/AN residual
sections). Re-derived here directly from the production
`reachable()`/`reachableBands()` functions run against the PRE-retune
content (git `5afc3ab`/`8fd4b8f`), not asserted from the move plan's
prose:

**TR** (2 of the 3 OUT titles, excluding Head Sea's rounding-forced
departure, which is not a tie-break case): Cross Sea and Monsoon Surge
both reach only `{<20}` on the pre-retune content. 12 OTHER TR workouts
share that exact profile and equally could not help fill the deficient
upper cells: Beam Sea (anchor, excluded from the swap pool by name),
Tidal Bore, Rip Current, Gyre, Loop Current, Canary Current, California
Current, Benguela Current, Equatorial Current, Following Swell, Marin,
Vendaval. Swapping either OUT title for any of these 11 non-anchor
titles changes no count, no gate outcome, and no other workout's band;
it is James's call alone.

**AN**: all 8 OUT titles reach only `{<20}` on the pre-retune content.
14 OTHER AN workouts share that exact profile: Scud Cloud, Dust Whirl,
Steam Devil, Snow Devil, Beaver Tail, Tail Cloud, Roll Cloud, Shelf
Cloud, Collar Cloud, Inflow Notch, Barber Pole, Inflow Band, Hook Echo,
Downdraft. Swapping any of the 8 OUT titles for any of these 14 changes
no count, no gate outcome, and no other workout's band.

## The balance script's final table

`pnpm exec tsx scripts/library-balance.ts --after-only`, run against this
task's HEAD:

```
O2
             <20   20-30   30-45   45-60     60+   TOTAL
   AFTER       5      15      34      18      19      91
  TARGET       5      14      34      18      19      90
 AFT-TGT       0      +1       0       0       0      +1

AT
             <20   20-30   30-45   45-60     60+   TOTAL
   AFTER       8      20      32      12       3      75
  TARGET       8      20      32      12       3      75
 AFT-TGT       0       0       0       0       0       0

TR
             <20   20-30   30-45   45-60     60+   TOTAL
   AFTER      12      23      29       7       4      75
  TARGET      12      23      29       7       4      75
 AFT-TGT       0       0       0       0       0       0

AN
             <20   20-30   30-45   45-60     60+   TOTAL
   AFTER      15      17      18       7       4      61
  TARGET      14      17      18       7       4      60
 AFT-TGT      +1       0       0       0       0      +1

GRAND TOTAL: AFTER 302 vs TARGET 300 (AFT-TGT +2; the 2 onboarding rows are the whole difference)
```

Every non-onboarding cell reads exactly 0 debt against
`patterns.targets`; the two `+1`s are the O2 and AN onboarding rows
(outside `LIBRARY_WORKOUTS`), the same artifact every prior task's
report names.

**A note on the script's DEFAULT (non `--after-only`) output.** Running
`pnpm exec tsx scripts/library-balance.ts` without the flag now prints a
"FAITHFULNESS CHECK FAILED" banner (15 of 20 cells differ from the
original 2026-08-03 design grid). This is EXPECTED and is not a
rebalance defect: the script's `BEFORE` row is a synthetic replay
(`AFTER_minutes + frozen historical warmup`), and once Tasks 3/4 changed
93 workouts' actual work durations, that replay no longer represents any
real historical state; of course it stops matching the grid the library
was originally authored against. The script's own documentation already
separates this signal ("CHECK... is the FAITHFULNESS check", "not what
matters for the rebalance") from the one that does: `AFT-TGT`, which is
the table above, and which reads 0 in every non-onboarding cell. Verified
independently: re-running the same script against the pre-retune content
(git `5afc3ab`) reproduces the FAITHFULNESS CHECK PASSED banner (20/20),
confirming the failure at HEAD is new and caused by the retune content,
not a pre-existing condition this task inherited.
