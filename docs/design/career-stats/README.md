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

## PR 2 addendum (2026-09-12, after v0.46.0 shipped)

Same canvas (artifact `c8ad61d9-853b-4262-9051-032f90e90cf2`), rows 8-10
added; the A-boards stand except where the corrections below name them.
Everything new transcribes the SHIPPED rules (`index.css` at `60ee51b9`),
not the Gate 0 draft — `B0-You` is that transcription rendered unchanged,
and it measures 140 px in Chromium, the same 140 `you.png` measures
hairline to hairline, which is what validates the three options against it.

- **B0-B3 (row 8, portrait; row 9, landscape):** James, "experiment with how
  to indicate that the row is clickable". `B0-You` the hero as shipped
  (control, 140 px); `B1-You` a trailing `›` in the doors' own chevron
  style, vertically centred, right edge on the doors' chevron column
  (140 px, target unchanged, the bar loses ~19 px of width); `B2-You` the
  identity card's edge (`--surface`, 1 px `--rule`, 2 px radius, 16 px
  padding) plus the chevron, hairlines gone (148 px, +8; the chevron sits
  16 px in, not on the doors' column); `B3-You` `STATS ›` in the door-row
  style on the figures' first line (140 px; the figures already wrap at
  390, so the label rides LIFETIME's line). `B1/B2/B3-Pressed` draw each
  resting over pressed. **The pressed fill is PROPOSED, not house:** the
  stylesheet has no `:active` rule (`grep ':active' app/src/index.css`, 0
  hits), and `--surface-sunken` measures 1.06:1 against `--page` and
  1.18:1 against `--surface` (`contrast.json`) — a faint cue; the text and
  marks on it all clear their floors (A7). Heights: `hero-heights.json`
  (`B0`-`B3`), measured by a Playwright script over the artboards with the
  Google fonts confirmed loaded (`document.fonts.check`).
- **C1 (row 10):** James, "the date range for a season to be visible when
  you click on it — for consistency maybe all date ranges become visible?"
  `C1-RangeLines` draws the line under the filter bar for all six presets
  in `.stats-caption`'s shipped style (`--ink-3` on `--page` 6.69:1) — the
  ONE prose line back after rulings 18-19 — in TWO variants for James to
  pick (antagonist delta pass: SEASON/YEAR/MONTH apply a range ending
  TODAY, so a line naming `30 APR 2027` alone claims seven future months):
  **A** the range the totals cover (`1 MAY TO 12 SEP 2026`), **B** the
  preset's own span with `· TO DATE`. `C1b-StatsSeasonA` / `C1c-StatsSeasonB`
  show each on the full shipped page. Measured: B's SEASON line wraps to two
  lines at 390; either line pushes the SEASON page's last legend row under
  the tab bar before the first scroll.
- **Corrections to approved boards (antagonist delta pass, 2026-09-12):**
  (1) `A5`/`A5b`'s SEASON curve was drawn from the FILTERED rows (`18,000
  TODAY` beside `AVG M/DAY 319`); `statsPage` now passes the unfiltered
  season rows to `seasonSvg`, as the group's own caption says. (2) `A3`/`A4`
  (and `A6b`'s one-point trend) y-axis ticks are now what
  `chooseTicks([112, 126], 4)` emits — 115/120/125 → `1:55 · 2:00 · 2:05`,
  a whole-second "split" tick kind PR 2 adds — replacing the hand-typed
  `1:54 · 1:58 · 2:02 · 2:06` (a 4 s step cannot occur; `formatTick(·,
  "pace")` prints tenths). (3) `A5`'s METRES PER WEEK labels its dashed
  `--rule-2` pre-range slots `OUT OF RANGE` (decorative, 1.40:1) so the spec
  can name them. (4) `A6d-EmptySeason`: the SEASON group at zero rows this
  season with ≥ 2 lifetime rows (every early May) reads `NO ROWS THIS
  SEASON YET`, drawn cropped to the group with a hypothetical today of
  3 MAY 2027.
- `contrast.json` regenerated with the addendum's pairings (hero segments
  on `--page`, the B2 card border, everything on the pressed fill); `A7`
  lists them and the B0-B3 heights. The over-drawn captions noted above
  still stand on A2-H3/A3/A4; the B/C boards carry none.
