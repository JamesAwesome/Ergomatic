# Deliberate deviations from the design handoff

The handoff in this directory is the UI/UX authority EXCEPT where listed
here. These are intentional product decisions (spec:
`docs/superpowers/specs/2026-07-28-differentiation-design.md`) — do not
"fix" screens back to the handoff's literals.

| Handoff shows | Ergomatic builds | Why |
|---|---|---|
| Pain 1–10 (`PAIN 5/10`, 10-segment bars, 1–10 pickers) | Pain **1–5**: `PAIN n/5`, 5-segment bars, five 44px picker cells | Differentiation; simpler scale |
| `PAIN ≤5` library filter chip | `PAIN ≤3` | Midpoint of the 1–5 scale |
| Numeric pain picker cells | Five 44px cells with minimal ink-stroke SVG faces on a muted green→red ramp (`--pain-1`…`--pain-5`), **numerals always beside the faces** — never a face alone | Product identity; numerals stay for a11y. Ramp measured 5.84/4.48/4.31/5.22/5.94 against `--surface` (5.26/4.04/3.88/4.70/5.35 against `--page`) — all clear WCAG 1.4.11's 3:1 for meaningful graphics. Adjacent steps differ in hue rather than luminance, so the numeral and the mouth curve each carry the meaning independently (WCAG 1.4.1) |
| Difficulty `Introductory / Moderate / Advanced` (chips `INTRO/MODERATE/ADVANCED`) | `Easy / Medium / Hard` (chips `EASY/MEDIUM/HARD`) | Differentiation |
| Sample data: 11 book-derived workouts ("Lucky Penny", …) | Original ~35-workout starter library (original names), seeded per new account | Content policy |
| "11 OF 375 ENTERED" library counter | Plain count of the user's library (no fixed denominator) | 375 is the book's scale, not ours |
| `ink-4` `#8a8478` for mono labels (e.g. "33D AGO", step sub-lines) | `ink-4` **`#6f6a5f`** | `#8a8478` measures 3.29:1 on `--page` and 3.65:1 on `--surface` — below the handoff's own WCAG AA (≥4.5:1) requirement for this text size. `#6f6a5f` measures 4.76:1 on `--page` and 5.29:1 on `--surface`, passing AA while preserving the four-tier ink hierarchy (ink → ink-2 → ink-3 → ink-4) rather than collapsing small labels into ink-3. AA is the hard requirement; the literal hex was not. |

Everything else in the handoff (palette, type, spacing, 44px targets, AA,
2px radii, screen structures, pace math, timer behavior) remains binding.
