> **Archived 2026-08-28** from `ROADMAP.md` (lines 201-215 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 5E — Builder redesign: the accordion

**Status:** Done (2026-07-31, PR #27)
**Goal:** Take the vertical cost out of the builder — the screen held two steps at a time.

**Design authority:** `docs/design/builder-redesign/` (supersedes `docs/design/README.md` §11).

- [x] Accordion step cards: at most one expanded (`editing: string | null`), collapsed cards ~86px with a one-line summary
- [x] Classification card consolidates type / difficulty / pain; pain is numerals plus a level word (the faces are gone)
- [x] Shared `Stepper` behind rest, SPM, reps and pace offset
- [x] AUTO NAME, REPEAT ALL STEPS, the TARGET strip, and confirm-before-delete
- [x] Safe-area insets survive the builder screen's own `.screen` override — `design.spec.ts` now asserts it

**Exit:** MET — deployed and verified at `v0.1.0-137-gedbda77`.
