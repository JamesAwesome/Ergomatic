# Career stats — Gate 0 canvas sources

`seed.mjs` is the one source; `build.mjs` emits the artboards; `compute.mjs`
prints the arithmetic; `contrast.json` and `hero-heights.json` are measured
outputs. Spec: `docs/superpowers/specs/2026-09-12-career-stats-design.md`.

**The artboards OVER-DRAW captions (§14 ruling 18, 2026-09-12).** After Gate
0, James struck every caption but two on sight of the shipped
`docs/screenshots/you-stats.png`: A3/A4 still draw the range caption, the
TOTALS subtitle, the in-card `n OF m` line, the CALORIES / AVG WATTS row
captions and the TIME BY TYPE caption, and A2-H3 still draws `WORK TIME BY
TYPE · ALL ROWS` under the hero legend. The shipped page keeps only the seam
line under the TOTALS heading and the `n OF m MACHINE ROWS CARRY THE
MONITOR'S OWN TOTALS` footnote under the card. The committed captures are the
current state; the artboards were not re-rendered.
