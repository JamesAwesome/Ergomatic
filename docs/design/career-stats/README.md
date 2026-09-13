# Career stats — Gate 0 canvas sources

`seed.mjs` is the one source; `build.mjs` emits the artboards; `compute.mjs`
prints the arithmetic; `contrast.json` and `hero-heights.json` are measured
outputs. Spec: `docs/superpowers/specs/2026-09-12-career-stats-design.md`.

**The artboards OVER-DRAW captions (§14 rulings 18 and 19, 2026-09-12).**
After Gate 0, James struck every caption on sight of the shipped
`docs/screenshots/you-stats.png`: A3/A4 still draw the range caption, the
TOTALS subtitle, the in-card `n OF m` line, the seam line, the CALORIES /
AVG WATTS row captions and the TIME BY TYPE caption, and A2-H3 still draws
`WORK TIME BY TYPE · ALL ROWS` under the hero legend. The shipped page
renders NO caption prose (title, filter bar, TOTALS heading + card, TIME BY
TYPE heading + bar + legend, empty-state lines only). The committed captures
are the current state; the artboards were not re-rendered.
