# Deliberate deviations from the design handoff

The handoff in this directory is the UI/UX authority EXCEPT where listed
here. These are intentional product decisions (spec:
`docs/superpowers/specs/2026-07-28-differentiation-design.md`) — do not
"fix" screens back to the handoff's literals.

| Handoff shows | Ergomatic builds | Why |
|---|---|---|
| Pain 1–10 (`PAIN 5/10`, 10-segment bars, 1–10 pickers) | Pain **1–5**: `PAIN n/5`, 5-segment bars, five 44px picker cells | Differentiation; simpler scale |
| `PAIN ≤5` library filter chip | `PAIN ≤3` | Midpoint of the 1–5 scale |
| Numeric pain picker cells | Five 44px cells with minimal ink-stroke SVG faces on a muted green→red ramp (`--pain-1`…`--pain-5`), **numerals always beside the faces** — never a face alone | Product identity; numerals stay for a11y. Ramp measured 5.84/4.48/4.31/5.22/5.94 against `--surface` (5.26/4.04/3.88/4.70/5.35 against `--page`) — all clear WCAG 1.4.11's 3:1 for meaningful graphics. Adjacent steps differ in hue rather than luminance, so the numeral and the mouth carry the meaning independently of color (WCAG 1.4.1): mouth curve depth increases by >=2px between adjacent steps (checked in grayscale at true 24x24 render size), and the two end faces (1, 5) add a non-color secondary cue — a wider mouth on 1, angled brows on 5 — so same-direction neighbors (1 vs 2, 4 vs 5) don't rely on curve depth alone |
| Difficulty `Introductory / Moderate / Advanced` (chips `INTRO/MODERATE/ADVANCED`) | `Easy / Medium / Hard` (chips `EASY/MEDIUM/HARD`) | Differentiation |
| Sample data: 11 book-derived workouts ("Lucky Penny", …) | Original ~35-workout starter library (original names), seeded per new account | Content policy |
| "11 OF 375 ENTERED" library counter | Plain count of the user's library (no fixed denominator) | 375 is the book's scale, not ours |
| `ink-4` `#8a8478` for mono labels (e.g. "33D AGO", step sub-lines) | `ink-4` **`#6f6a5f`** | `#8a8478` measures 3.29:1 on `--page` and 3.65:1 on `--surface` — below the handoff's own WCAG AA (≥4.5:1) requirement for this text size. `#6f6a5f` measures 4.76:1 on `--page` and 5.29:1 on `--surface`, passing AA while preserving the four-tier ink hierarchy (ink → ink-2 → ink-3 → ink-4) rather than collapsing small labels into ink-3. AA is the hard requirement; the literal hex was not. |
| Builder's SET cell marks individual rows into the set (`inSet` per row, totals sum only marked rows) | SET cell instead chooses where the repeat block **starts**: clicking a row marks it and every row after it, clicking the current start clears the block, clicking another row inside the block moves the start | The domain expresses a repeat as a single `reps` marker after which everything repeats — it has no way to represent non-contiguous marks. Copying the handoff's per-row model was tried and proven unsound: a previous review showed it produces a builder total of 27 while the Library shows 31 for the same saved workout, because a non-contiguous mark set can't round-trip through one marker. The block-start model always produces exactly one coherent, visible outcome per click and keeps the builder's total in agreement with the duration shown everywhere else for the same workout. |
| Single generic `+ ADD ROW` control (the mockup's `nwRows` model has no `kind` field at all — every added row is implicitly a work row) | Three controls — `+ WARM-UP`, `+ ADD ROW` (work), `+ REST` — each adding a row of the corresponding `RowKind` (`wu`/`w`/`r`) | The domain distinguishes warm-up, work, and rest steps, and every starter workout in the book opens with a warm-up. A builder that can only ever add work rows can't author one from scratch — `StepRowEditor`'s minutes-only branch was dead code in create mode until this. |

Everything else in the handoff (palette, type, spacing, 44px targets, AA,
2px radii, screen structures, pace math, timer behavior) remains binding.
