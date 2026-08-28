> **Archived 2026-08-28** from `ROADMAP.md` (lines 687-744 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 6F — UI-fix round

**Status:** Done (2026-08-04)
**Goal:** One button vocabulary instead of two competing ones, exact
resolved targets everywhere a tolerance band used to show, one voice for
"discard without logging" across every surface that can strand an unlogged
session, a Library filter model that scales past nine flat chips, and one
pain scale on Today matching the Library's own.
**Design authority:** `docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md`
(the round's own handoff, now historical record — `docs/design/README.md`
carries the button table and accent-meanings list forward as standing
authority; `docs/design/DEVIATIONS.md` records every deviation this round
added or superseded).

- [x] **Task 1 — the button system**: five levels (`.button-l1`–`.button-l4`/
      `.button-l4-armed`, `index.css`), replacing the two-idiom
      `.button-primary`/`.button-outline` vocabulary on every screen this
      round touched; selected-state color fixed app-wide (type chips fill
      their own type color everywhere, every other selection fills `--ink`,
      accent means exactly four things); SHUFFLE re-cut to chip geometry;
      `--type-tr` de-aliased from `--accent` (fix round 1)
- [x] **Task 2 — exact targets**: every tolerance-band display
      (`2:21.0–2:23.0`) becomes the single resolved split, on Detail,
      Builder's TARGET row, Confirm, and the Timer's UP NEXT/sub-line (the
      sub-line shows the ref instead, e.g. `6K +16`); `toleranceRange()`
      itself untouched in the domain
- [x] **Task 3 — discard, one voice**: `Discard without logging` →
      `Tap again to discard`, staged identically on Session complete (new
      level-4 block), Today's unlogged row (a 44×44 accent-outlined ✕ that
      swaps the row's own contents in place), and the Log screen's existing
      staged Discard
- [x] **Task 4 — the Library's second pass**: the eleven-chip ragged wrap
      and the `ALL` chip retired for one `FILTER ⌄` chip plus a plain count;
      a sheet (`FilterSheet.tsx`) groups TYPE/TIME/PAIN (4/4/5-cell grids)
      and LAST DONE/SOURCE (2-cell grids sharing a line) by their actual
      selection semantics; active filters render back as a token row
      (`filterTokens.ts`, one token per group, range/list collapsing) with
      per-token `✕` and a `CLEAR ALL`; PAIN becomes five 1–5 cells,
      multi-select union, replacing the single `≤3`/`≤5` threshold chip
- [x] **Task 5 — one pain model**: Today's own PAIN filter becomes the same
      five-cell multi-select union as the Library's, replacing the old
      single toggle — the two screens now share one pain-filtering idiom
- [x] **Task 6 — close-out**: remaining sweeps (armed-state contrast,
      Library-with-sheet and Today's five-cell PAIN group both re-verified
      under axe), every touched screen's screenshots re-captured fresh at
      HEAD, an end-to-end `DEVIATIONS.md` pass (the design's own five
      mandated rows plus the Library second pass's own — pain union, LAST
      DONE naming, SOURCE naming, count copy, the FILTER-sheet pattern
      itself — all verified truthful against shipped code, several stale
      citations found and corrected), the button table and accent-meanings
      list graduated into `docs/design/README.md` as standing authority,
      this ROADMAP entry

**Exit:** MET — one button vocabulary, one pain model, one discard voice,
and a Library filter model that scales; `docs/design/DEVIATIONS.md` and
`docs/design/README.md` both read true against the shipped app; full e2e
green ×2 back-to-back plus unit/client/integration.
