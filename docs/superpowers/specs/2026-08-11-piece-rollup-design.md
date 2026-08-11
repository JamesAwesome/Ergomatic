# Piece roll-up on the Today card

**Date:** 2026-08-11
**Trigger:** James's device screenshot of Ostro (9 × 1000m at +2, 1′ r):
four identical rows plus a "+5 more pieces" row wasted the card on
repetition. Pulled forward ALONE from CL2 by James's explicit word; the
rest of CL2 stays post-release.
**Ruling (James, this session):** CONSECUTIVE RUNS roll — any run of 2+
identical consecutive pieces collapses to one row, anywhere in the set.
This supersedes the "mixed sets keep per-piece rows" phrasing recorded
at the CL2 queue entry. It AMENDS the step-detail spec's
expand-per-piece ruling for the identical-run case only; everything
else in `2026-08-10-workout-step-detail-design.md` stands.

## What changes

`pieceList` (`app/domain/display/stepDetail.ts`) groups its expanded
work rows into runs before returning them. `PieceRow` gains
`count: number` (1 for a lone piece). The Today renderer prefixes
`N × ` to the duration on rolled rows. Nothing changes for the Library
line (structureLine already rolls), the detail screen, or any API.

## Rules (binding)

1. **Run identity:** consecutive work rows join one run while duration,
   ref (base+offset or effort), spm, AND rest are all equal. A rest
   boundary breaks a run: identical pieces with differing rests
   (1′ vs none between) are different runs — back-to-back means
   back-to-back.
2. **The trailing-rest exception:** the workout's FINAL piece may join
   the run before it when it differs ONLY by carrying no trailing rest
   (Ostro's ninth piece). The rolled row shows the run's inter-piece
   rest (`1′ r`): nine pieces with a minute between them. A final piece
   whose trailing rest EQUALS the run's rest also joins, and the row's
   rest display is unchanged (the step-detail deviation's spirit: the
   rest shown is real either way).
3. **Test/effort/distance rows** roll by the same identity rule
   (10 × 0:45 at MAX rolls; test rows never equal anything and stay
   single).
4. **Row-level mechanics after rolling:** the two-line/compressed
   threshold (≥5) counts ROWS; the cap (4) counts ROWS; row numerals
   are row-sequential. The `+N more pieces` row counts remaining
   PIECES (sum of unseen rows' counts) and its sub-line lists unseen
   ROW tokens (`3 × 5:00` for a rolled row, `6:00` for a single),
   first three then `…`.
5. **The summary foot is unchanged:** `workAndTotal` as is; the
   `· N PIECES` suffix appears when the ROW list is capped (as today)
   and names total PIECES. A rolled uncapped card carries no count —
   the `9 ×` on the row already says it.
6. **Peak:** `peakIndex` operates on rows as before (a rolled row
   carries its run's shared `off`). A rolled row can be the peak; the
   tint covers the row.
7. **Renderer:** rolled rows render `9 × 1000m` in the duration slot,
   both two-line and compressed forms; everything else about the row
   (ref text, rest, spm, split) is the run's shared values.

## ERRATUM (final review, 2026-08-11)

Rule 2's parenthetical "(Ostro's ninth piece)" and the Evidence line
"ninth restless" are FALSE against the real seed: Ostro
(`server/seed/library/at.ts:1371`) authors `restMinutes: 1` on the
repeated step, and `phases()` (`expand.ts:195`) attaches that rest to
EVERY repetition including the last — so Ostro's nine pieces are fully
identical and roll under rule 1's ordinary equality. Rule 2 itself
stands unchanged and is covered by its own dedicated test (a genuinely
restless final piece joins the run before it); it simply is not what
Ostro exercises.

## Evidence base

- Ostro's own shape (screenshot, 2026-08-11): 9 identical 1000m pieces,
  1′ rests, ninth restless — rolls to ONE two-line row.
- `pieceList`/`peakIndex`/`workAndTotal` shipped in PR #80 with 100×4
  domain coverage; this amendment adds a grouping pass over the same
  rows and MUST keep that pin.
- The capped-pyramid capture (`today-capped.png`) is a symmetric
  pyramid — no identical runs — and must be BYTE-UNCHANGED by this
  feature (the regression guard that rolling never fires without a
  run).

## Testing

- Domain: Ostro shape → one row `{count: 9, duration: "1000m",
  restText: "1′ r"}`; rest-boundary split (identical pieces, no rest
  between first pair → two runs); trailing-rest exception both ways
  (absent joins, different does not); mixed lead+block (2:00 + 3×5:00
  → two rows); pyramid unchanged (7 rows); effort run rolls; spm
  mismatch splits; peak lands on a rolled row; `+N more` piece-count
  arithmetic over rolled rows. Real fixtures: Ostro itself if it is a
  library workout (verify; else the nearest real 9×1000m), plus a real
  pyramid and a real mixed set.
- Client: Today card renders `9 × 1000m at +2, 1′ r` one-row card for
  the Ostro shape; the pyramid card is unchanged; `+N more pieces`
  counts pieces not rows on a long mixed set.
- e2e + screenshots: new `today-rolled.png` (a rolled card, opened and
  described); `today-capped.png` re-captured and REQUIRED byte-close
  to current (same content; AA jitter tolerated, content change is a
  failure); full suites.

## Out of scope

structureLine (already rolls), the detail screen, the builder, CL2's
other items (authoring parity, variety debt, rating system — all still
post-release).
