> **Archived 2026-08-28** from `ROADMAP.md` (lines 745-788 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 6G — Today's collapsible filter

**Status:** Done (2026-08-04)
**Goal:** Today's three always-on DIFFICULTY/TIME/PAIN chip groups collapse
into the same `FILTER ⌄` + sheet + tokens pattern the Library got in Phase
6F, backed by Today's own unchanged state — the type-swap chips stay on the
plan line, untouched.
**Design authority:** `docs/superpowers/specs/2026-08-04-today-filter-sheet-design.md`,
plan: `docs/superpowers/plans/2026-08-04-today-filter-sheet.md`.

- [x] **Task 1 — extract the shared primitives**: `SheetShell.tsx`
      (backdrop, dialog semantics, focus trap + restore-to-opener),
      `CellGrid.tsx` (one labelled, `role="group"` cell grid), and
      `TokenRow.tsx` (the removable-token strip) lifted whole out of the
      Library's own `FilterSheet.tsx`/`Library.tsx` — a structural no-op:
      the Library's existing `FilterSheet.test.tsx`/`Library.test.tsx`
      assertions pass unmodified, proving the re-composition changed
      nothing about the Library's own behaviour
- [x] **Task 2 — Today's sheet, tokens, and rewiring**: `TodayFilterSheet.tsx`
      (the three primitives above, DIFFICULTY/TIME/PAIN CellGrids, no TYPE
      group) and `todayFilterTokens.ts` (one token per group deviating from
      the day's pref-derived defaults) replace the three inline chip rows;
      `Today.tsx` gains a `FILTER ⌄` chip beside `SHUFFLE ↻` and a
      live-counting `Show N options` primary computed against the sheet's
      own in-progress draft. `todayOverrides` storage, `suggest()`, and the
      plan-line type-swap chips: byte-for-byte unchanged
- [x] **Task 3 — flows, captures, the record**: the round's five
      expected-red e2e/design sweeps re-routed through the sheet (a PAIN
      1+2 tap, the freestyle spot-check, the chip-row default-state sweep,
      the selected-fill-ink sweep, SHUFFLE-disabled's own setup); new
      coverage for CLEAR ALL restoring the day's defaults (never an empty
      pool — the deliberate divergence from the Library's own CLEAR ALL)
      and a single backdrop-tap-discards pin; axe/tap-target/ink-4 sweeps
      against the sheet open and closed-with-a-token; `today.png`/
      `today-sheet.png`/`today-filtered.png` recaptured; `DEVIATIONS.md`'s
      Today filter row rewritten for the sheet plus a new CLEAR ALL row;
      `README.md` §1 gains a one-sentence pointer at the current pattern

**Exit:** MET — Today reads identically to the Library at rest (one
`FILTER ⌄` chip, a plain suggestion card, tokens only when something
deviates); full e2e green ×2 back-to-back plus unit/client/integration;
zero storage or `suggest()` changes, so every existing `todayOverrides`
record on a real device stays valid with no migration.
