> **Archived 2026-08-28** from `ROADMAP.md` (lines 151-169 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 5B — Builder & bulk import

**Status:** Done (2026-07-30, PR #23)
**Goal:** Add new workouts to the library from the app instead of hand-editing seed data.

- [x] Builder: type/difficulty/pain pickers, step rows with live resolved splits, repeat block, totals, bulk-import paste; DUR field takes minutes OR meters (`10'` vs `2500m`, explicit unit) in rows and bulk import
- [x] 1–5 pain picker with SVG faces + numerals on a measured green→red ramp — shared component, reused by Phase 6's log screen
- [x] Three row kinds authorable (`+ WARM-UP` / `+ ADD ROW` / `+ REST`); SET cell chooses where the repeat block starts (see docs/design/DEVIATIONS.md — the handoff's per-row model can't round-trip through the domain's single marker)
- [x] Edit + delete personal workouts; globals stay read-only and refuse a hand-typed edit URL

**Exit:** MET — a workout authored as `6k -2 @ 22 SPM` saves, appears in the Library, and resolves to `1:59.0–2:01.0` from real baselines, identically to the seeded workouts.

**Follow-ups recorded at merge:** three of the six were overtaken by the
5C–5F builder rebuild and the bulk-import screen (the DUR field's width,
the `×N` stepper's stale value, the missing bulk/edit design sweeps). The
three still true — the transaction-less bulk endpoint, the partial-import
re-submit it causes, and the missing unsaved-changes guard — are in
Phase CL.
