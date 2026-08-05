# Today's filter, round 2 — LAST DONE + SOURCE join; the button says what it feeds

**Date:** 2026-08-04
**Status:** James's request verbatim (device screenshots of both sheets;
"quick round") — his message is the design.

## The two asks

1. **Today's sheet gains the Library's LAST DONE and SOURCE groups** —
   `<21D / 21D+` and `GLOBAL / CUSTOM`, the same half-width pairs sharing
   a line, same semantics (mutually-exclusive toggle-off pairs;
   never-done counts as `21D+` — the Library's pinned rule, shared
   boundary constant).
2. **The primary button's copy**: `Show N options` → **`Shuffle N
   options`** (`Shuffle 1 option`) — the options aren't shown on Today,
   they feed the suggestion pool. The Library's `Show N workouts` stays
   (there the list IS shown). Noted for James at the gate: tapping
   applies the filter rather than re-rolling; his wording kept verbatim.

## Design (mirrors the shipped patterns exactly)

- `domain/suggest.ts`: `LibraryEntry` gains `isGlobal: boolean`;
  `SuggestPrefs` gains `lastDone?: "under21" | "over21" | null` and
  `source?: "global" | "custom" | null`; predicates mirror the Library's
  `applyFilters` (share `isRecent`/`RECENCY_BOUNDARY_DAYS` — they live in
  `src/library/filters.ts`; MOVE them to `domain/duration.ts`'s sibling
  (a small `domain/recency.ts` or beside the buckets) so domain never
  imports client code, with filters.ts re-exporting — the Task-1-idiom
  from the amendment). fellBack wording: the parts list gains `recency`
  and `source` when active — the honesty rule unchanged.
- `todayOverrides` v4: `+ lastDone`, `+ source` (defaults null/null —
  never a deviation until set); v3 falls back (validation table
  verbatim, the standing contract).
- `TodayFilterSheet`: the two half-width pairs share a line below PAIN
  (the Library sheet's exact layout, CellGrid's existing half-width
  modifier); draft/apply/dismiss unchanged.
- `todayFilterTokens`: `<21D` / `21D+` / `GLOBAL` / `CUSTOM` tokens
  (ink), any set value deviates (defaults are null).
- `Today.tsx`: `toLibraryEntry` passes `isGlobal` through; CLEAR ALL
  resets both to null.
- Button copy per ask 2, singular-aware, disabled-at-0 unchanged.

## Testing

Suggest tables for both dims (never-done = 21D+ pinned; source pairs;
interplay with fellBack + wording rows); overrides v4 validation (+ v3
fallback rows); sheet renders five groups with the pairs sharing a line
(44px, group names); tokens for the four values + per-token clear +
CLEAR ALL; e2e: one flow filtering CUSTOM on Today (personal fixture =
the pool; counter honest), button copy asserted; captures re-taken
(today-sheet.png shows five groups; the button reads `Shuffle N
options`). Full gates, e2e ×2 fresh volume.

## Out of scope

The Library's sheet and copy; the swap; storage keying; server.

## Revision (James, mid-round)

- The button reads **`Apply Filter`** (not Shuffle/Show). Behaviour on
  apply: **if the shown workout no longer matches the new filter, the
  card moves to one that does; if it still matches, it stays.** (This is
  suggest()'s existing pick-fallback semantics — verify it holds in BOTH
  the pick-override and no-pick cases and PIN it with tests + one e2e
  rather than assuming; the copy change must not regress the mechanics.)
- With the count gone from the button, the live pool count moves to a
  small mono caption line directly above it (`20 OPTIONS` / `0 OPTIONS`)
  — preserving the honesty signal and the only explanation of the
  disabled-at-0 state. Flagged for James at the gate as the controller's
  addition, not his ask.
