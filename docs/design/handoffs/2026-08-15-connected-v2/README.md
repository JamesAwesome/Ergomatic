# Handoff: Connected mode — LIVE / GRID redesign (turn 2)

## Overview
Redesign of Ergomatic's connected rowing screen (phone clamped to a Concept2
erg's monitor arm, PM5 paired over BLE). Replaces the left pane-switcher gutter
with a header segmented control, cuts the label layer, enlarges the heroes, and
removes every value the PM5 monitor already shows in the same sightline. Full
rationale in `Connected screen recommendation.md` (included).

## About the design files
`Ergomatic connected mode.dc.html` is a **design reference built in HTML** — a
mockup document, not production code. The turn-2 section at the top of the file
(frames tagged `R2 · …`, badges 2A–2D) is the design to implement. **Recreate it
in the app's existing environment and patterns; do not ship the HTML.** The
turn-1 section below it is the superseded previous design, kept for history —
ignore it.

## Fidelity
**High-fidelity.** Colors, sizes, spacing and copy are final. Recreate
pixel-perfectly.

## Design principle (governs all disputes)
The PM5 sits directly above the phone and already shows: time left in interval,
current meters, total meters, raw HR. **None of those appear on the phone.**
The phone shows only what the plan knows and the erg cannot: targets, judgement
colours, session structure (interval x of n, phase), what is next, total
session time left, HR **zone** and calories (derived values). Exception by
decision: current split and stroke rate stay as the two heroes — they carry the
judgement colours.

## Screens

### 2A · LIVE, landscape (844 × 390 reference; content inside safe-area insets)
Column, padding 20px top / 16px sides / 12px bottom, 10px gaps:
1. **Header row, 44px**: segmented control [LIVE | GRID] far left (see
   Components); 8px ink square + `PM5 432331249` (mono 13, tracking 0.10em,
   ink-2); flex spacer; status `3 OF 12 · WORK` (mono 22, tracking 0.04em,
   ink); END far right.
2. **Session progress bar, 6px**: one full-width bar segmented per interval,
   3px gaps. Done = ink `#1b1a17`, active = `#8a8478`, upcoming = `#ded8c9`.
   Above 16 intervals drop the per-interval notches, fall back to quarter
   ticks (existing rule).
3. **Heroes** (fill remaining height; two columns split by 1px `#d8d3c4` rule,
   18px gaps; left column flex 1.25, right 0.75; each column vertically
   centered, 8px gap):
   - Split: actual `2:20.5` mono 112px, weight 500, line-height 0.92,
     tracking −0.05em, tenths as 58px span, nowrap, judged colour. Beneath:
     target `2:09.0` mono 40px ink + source tag `6K` mono 15px ink-3.
   - Rate: actual `27` mono 92px (same treatment), judged. Beneath: target
     `24` mono 40px ink + `SPM` mono 19px ink-3.
4. **Bottom band** (1px ink rule above, 9px padding-top, items bottom-aligned,
   30px gaps): up-next `REST 2:00 · then WORK 2:09.0` mono 30px ink, flex 1,
   nowrap, no label. Then labelled cells, label mono 15px tracking 0.10em
   ink-3 over value mono 30px: `ZONE Z4` (zone-coloured), `CAL 412` (ink),
   `TOTAL LEFT 38:20` (ink).

### 2B · GRID, landscape
Same header (GRID half active; status reads `3 OF 12 · 38:20 LEFT`, countdown
portion accent red). No progress bar. Table:
- Header row: mono 12px tracking 0.12em ink-3, 2px ink rule below. Columns:
  `#` 30px · TIME flex 1 left · METERS flex 1 right · /500M flex 1.1 right ·
  SPM 0.6 right · HR 0.6 right · REST 0.8 right.
- Rows 36px, values mono 19px tracking −0.01em, 10px column gaps.
- Completed rows: ink values, 1px solid `#ded8c9` bottom border.
- **Active row**: `#fffdf7` fill pinched between 1px ink rules top+bottom, 4px
  ink marker bar left of the row number (number weight 600). Countdown value
  accent `#b5341f`; split/rate wear judged colours.
- Upcoming rows: ink-3 values, programmed targets, 1px dashed `#c9c3b2` bottom
  border, `—` for unknowables.
- Footer caption: mono 12px ink-3, e.g. `5 MORE BELOW · ROW 5 IS A 500 M PIECE`.
- The row list is the only scrolling region; keyboard-focusable; auto-scrolls
  the active row into view (existing behavior, keep).

### 2C · LIVE, portrait (390 × 844 reference)
Column, padding 20px top / 24px sides, 13px gaps. Header: PM5 id + END (44px).
Status line mono 21. Same 6px progress bar. Heroes stacked: split 100px
(tenths 52) over target 36 + `6K` 14; rate 84 over target 36 + `SPM` 18;
2px ink rule above split block, 1px `#d8d3c4` above rate block, 16px
padding-top each. Then `UP NEXT` label (mono 14, ink-3) over
`REST 2:00 · WORK 2:09.0` mono **23px** nowrap — sized to fit 342px content
width; do not exceed. Then zone/cal row (two equal cells, labels mono 14 over
values mono 28). Flex spacer. `TOTAL LEFT` + `38:20` (mono 28) on a rule.
Bottom: **54px full-width segmented bar**, two equal halves (active half ink
fill / cream text, mono 13 weight 600), above the home indicator.

### 2D · First frame (before the first stroke), landscape
Same layout as 2A. Status reads `1 OF 12 · READY`. Progress bar all-upcoming.
**Nothing is judged**: split shows the target value as a ghost in ink-4
`#6f6a5f` (never ink-5 — fails AA); rate shows `0` in plain ink. No dash-bars.
Up-next reads `WORK 10:00 · then REST 1:00`; `TOTAL LEFT 50:00`. Zone/cal cells
are **absent** in this capture (strapless example) — the band closes up and
TOTAL LEFT slides left.

## Components

### Pane segmented control (landscape header)
- One control, two halves `LIVE` / `GRID`, 44px tall, each half ≥44px wide
  (mono 13, weight 600, tracking 0.12em, 16px side padding), 1px ink border,
  2px radius, active half ink fill + `#fffdf7` text, inactive text ink-3.
- Far LEFT of the header — **never adjacent to END** (END was moved for
  safety; do not re-create the adjacency).
- Real button semantics: focusable, `aria-current="page"` on the active half.
- **Triple-tap on the control opens the hidden diagnostics log** — port the
  existing handler onto this element.
- Portrait: the same control as the 54px bottom bar, full width, two halves.

### Pane transition
Panes slide horizontally — LIVE is the left position, GRID the right —
~200ms translateX, honoring `prefers-reduced-motion`. Keep the existing swipe
handler wired but treat it as unverified on device; the control is the
shipping route.

### END control
44px tall, mono 13 weight 600, accent `#b5341f` text + 1px border, 2px radius,
14px side padding, header far right. Staged confirm unchanged (first tap
becomes `TAP AGAIN` for 4s). Never full-width.

## Removed vs turn 1 (do not carry forward)
- Left 44px gutter + rail switchers (landscape) — deleted; content takes full
  safe-area width.
- Labels during a piece: `NOW`, `TARGET`, `UP NEXT`, `/500m` (unit lives
  nowhere; target line carries the source tag e.g. `6K`), `LEFT · INTERVAL`,
  `METERS`, `HR` (all PM5-duplicated or self-evident).
- `TOTAL M` — cut outright (summary screen only).
- **Paused state — dropped entirely.** Do not build the overlay.
- `NOW` returns only in the stale/disconnected state as `LAST` (that is when
  it carries information).

## HR zone + calories (strap-only)
- Shown **only when an HR strap is paired**. Without one the cells are
  **absent, not blank** — no dashes, no empty columns; siblings close up.
- Zone value colour by band: Z1 `#57544c` · Z2 `#2a6275` · Z3 ink `#1b1a17` ·
  Z4 `#8a5f18` · Z5 `#962718`. Labels and CAL stay ink/ink-3.
- Calories are derived from HR; both cells appear and disappear together.

## Judgement colours (unchanged rule)
Actuals only, never targets: under target teal `#2a6275`, on target ink,
over target ochre `#8a5f18`. Accent `#b5341f` marks only the active countdown
(grid) and END. Stale link: values grey out, `LAST` caption appears.

## Type scale
Landscape: 112 hero / 92 hero-2 / 58 tenths / 40 target / 30 band value /
22 status / 19 table & SPM / 15 label / 13 control & id / 12 table header.
Portrait: 100 / 84 / 52 / 36 / 28 / 21 / 19 / 14 / 13 / 12.
**Nothing below 12px, and no ink-4 `#6f6a5f` on mono at 11px or below (house
ban).** Letter-spacing: labels 0.10em, control text 0.12em, status 0.04em,
table headers 0.12em, heroes −0.05em, values −0.01 to −0.03em.

## Design tokens
Ink: `#1b1a17` / `#3f3c35` / `#57544c` / `#6f6a5f` (never ≤11px mono) /
`#a09a8c` (decoration only — fails AA for text).
Surfaces: surface `#fffdf7`, page `#f4f1e8`, sunken `#efeade`.
Rules: strong `#1b1a17`, mid `#d8d3c4`, light `#ded8c9`, dashed `#c9c3b2`.
Judged: teal `#2a6275`, ochre `#8a5f18`, red `#962718`. Accent: `#b5341f`.
Progress: active `#8a8478`.
Font: IBM Plex Mono (400/500/600) for everything on these panes.
Radius: 2px on controls; none elsewhere. No shadows.

## Hard constraints (verified against this design)
- **≥44×44px** every tappable target (segmented halves, END, grid rows if
  tappable). Verified: control 44px, END 44px.
- **WCAG AA 4.5:1** all text. Verified; ghost target uses ink-4 (4.76:1 on
  page), never ink-5.
- Content column respects `safe-area-inset-left/right` in landscape (the
  housing side inset is OS-mandated; design assumes 0 but must survive ~59px).
- **Minimum content inset 16px landscape / 24px portrait sides** — the shipped
  build has had heroes touching the physical edge; treat these as hard.
- Up-next line in portrait is 23px specifically so `REST 2:00 · WORK 2:09.0`
  fits 342px — cap the string format, never wrap, never overflow.
- Split hero caps at 4 characters + tenths; slower than 9:59.9 shows `—`.

## States & data
- `interval`: index, count, phase (WORK/REST/WARM-UP), programmed dimension
  (time counts down on timed, meters on distance).
- `judgement`: per-hero, from target ± tolerance → colour.
- `connection`: live / stale (grey values, `LAST`) / disconnected (banner row
  inserts; heroes step down ~112→86, 92→70; layout must survive the lost
  height) / pre-row READY (2D).
- `hrStrap`: present/absent → zone+cal cells exist or don't.
- Fix ships with this design: total-meters/total-left counter bug is moot on
  LIVE (fields removed) but still affects GRID header `38:20 LEFT` — compute
  from plan + elapsed, not the broken accumulator.

## On-erg test list (from the recommendation — run before calling it done)
1. Rate hero at 92px readable mid-pull? 2. Any cut label missed?
3. Status at 22px readable at full pull? 4. Zone/cal legible through screen
glare? 5. Try to mis-hit the switcher toward END — any near-miss is a stop.
6. Mount the phone both rotations; nothing moves or is occluded.
7. First frame looks deliberate. 8. Triple-tap still opens diagnostics.

## Screenshots
2x captures of the four frames in `screenshots/`:
`2a-live-landscape.png`, `2b-grid-landscape.png`, `2c-live-portrait.png`,
`2d-first-frame.png`.

## Files
- `Ergomatic connected mode.dc.html` — mockup document; **turn-2 section at
  top** (`R2 · …` frames) is the spec. Open in a browser.
- `Connected screen recommendation.md` — full rationale, trade-offs, test plan.
- `support.js` — mockup runtime only; not part of the design.
