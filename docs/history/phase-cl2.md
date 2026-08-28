> **Archived 2026-08-28** from `ROADMAP.md` (lines 5520-5570 of the
> pre-rebalance file, main `39e9430`). **This section was still LIVE when it
> was archived.** Deferred under "After the strangers"; the import-parity half rides any PR touching import.
>
> It is kept verbatim so no detail is lost, and it is a RECORD: the work is
> maintained in `ROADMAP.md`'s live slate, not here. Do not work from this file.

## Phase CL2 — Post-release authoring parity

**Status:** Not started, and now UNBLOCKED — the v0.7.0 release it was
scheduled behind shipped 2026-08-11 (build 564), as did v0.8.0 and
v0.9.0. Nothing gates this any more except sequencing against Phase CR2
below.
**Goal:** The builder can author what the domain, the import, and a
third of the library already are: N lead lines, then a repeated block.

- [x] ~~Unify the nudge: drop the post-Start secondary nudge screen,
      put every adjustment on the Connect-card experience both paths
      share~~ — **PULLED FORWARD and shipped in the fast-follow phase**
      (James, 2026-08-11, at the v0.7.0 tag). Resolved as **rate
      display + pace only**: the unified card nudges pace exclusively;
      rate stays read-only display, and the old screen's duration/reps/
      SPM steppers and per-row REMOVE/RESTORE died with it uncompensated
      (a James-approved casualty list, not a deferral). Structural
      changes route through Edit. Detail: Phase FF below.
- [x] ~~The Ostro roll-up's DISPLAY side~~ — **shipped early**, ahead of
      this phase's own builder work (PR #83, 2026-08-11, main `ea3dec6`):
      consecutive identical runs already collapse to one "N× the block
      below" line on Today and Library via a display-only rule (the
      Ostro spec's own erratum: consecutive runs roll via rule 1). This
      phase's own goal — the BUILDER learning to author that shape, not
      just render it — is still open below.
- [ ] Builder: positional repeat-block authoring. Today the repeat is
      hoisted into a single form field (`builderState.ts`'s `f.reps`),
      so lead-piece-then-block workouts (the Katabatic Wind shape;
      "mixed", the book's most common AT archetype at 11 of 19 in the
      30-45 cell) cannot be authored in-app. The one-marker model stays
      the constitution (README: everything before the marker runs once,
      everything after runs count times); the builder learns to PLACE
      the marker, not to multiply blocks. **M**
- [ ] Import: the grammar already parses a positional `xN` line
      (`bulk.ts:268`) into the marker; verify full parity end to end
      (lead lines + `xN` + block round-trips through parse, validate,
      save, and re-render) and document the syntax in the import
      screen's grammar example. **S**
**MOVED OUT 2026-08-20** (James: the variety debt and the rating system
"put these in a specific phase"): the O2|60+ variety debt, the
rebalance's other flagged pairs, and the workout rating system now live
in **Phase LQ** below. They were never authoring parity — they are about
what the library's CONTENT is worth and what rowers think of it, which
is a different question with a different kind of answer. CL2 is now
exactly two items, both about the builder and the import agreeing with
the domain.

**Exit:** A rower authors 15' steady then 4x(3' on, 1' off) entirely in
the builder; the same workout pastes in via import; both render as
"N× the block below" exactly as the seeded library does.
