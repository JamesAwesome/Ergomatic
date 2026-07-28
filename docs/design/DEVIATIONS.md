# Deliberate deviations from the design handoff

The handoff in this directory is the UI/UX authority EXCEPT where listed
here. These are intentional product decisions (spec:
`docs/superpowers/specs/2026-07-28-differentiation-design.md`) — do not
"fix" screens back to the handoff's literals.

| Handoff shows | Ergomatic builds | Why |
|---|---|---|
| Pain 1–10 (`PAIN 5/10`, 10-segment bars, 1–10 pickers) | Pain **1–5**: `PAIN n/5`, 5-segment bars, five 44px picker cells | Differentiation; simpler scale |
| `PAIN ≤5` library filter chip | `PAIN ≤3` | Midpoint of the 1–5 scale |
| Numeric pain picker cells | Custom minimal SVG smiley faces (ink-stroke, muted green→red fills) WITH numerals alongside | Product identity; numerals stay for a11y |
| Difficulty `Introductory / Moderate / Advanced` (chips `INTRO/MODERATE/ADVANCED`) | `Easy / Medium / Hard` (chips `EASY/MEDIUM/HARD`) | Differentiation |
| Sample data: 11 book-derived workouts ("Lucky Penny", …) | Original ~35-workout starter library (original names), seeded per new account | Content policy |
| "11 OF 375 ENTERED" library counter | Plain count of the user's library (no fixed denominator) | 375 is the book's scale, not ours |

Everything else in the handoff (palette, type, spacing, 44px targets, AA,
2px radii, screen structures, pace math, timer behavior) remains binding.
