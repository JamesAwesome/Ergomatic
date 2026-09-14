# Gate 0A — You → Stats (the "say which number this is" pass)

Rendered 2026-09-14 in Chromium against this worktree's compose stack, at
390×844 portrait and 844×390 landscape (the repo's own screenshot sizes),
by `app/e2e/gate0np.spec.ts`. **`before/` is this branch as it stands;
every other directory is the throwaway prototype branch `gate0a-prototype`
at `628f799f`, which is never merged.** The harness and the probe are
deleted by PR 2 (spec §10).

**Presented as artifact `MZsVEJ1rSsxYLFQRuCrbtS` (rev 1), 2026-09-14.**
Verdict: owed.

Boards for members **M7** (the MACHINE column's two populations), **M8**
(charts clipping their own labels) and the **appendix** (the CUSTOM echo).
M1-M6 and M9 are Gate 0B's and are not here.

## What changed, per directory

| directory | what it is |
| --- | --- |
| `before/` | the branch as it stands — the defects, reproduced |
| `after/` | the recommended set: shortened metres ticks, DERIVED gutters, the trace x tick anchored inward, the M7 caption returned, the CUSTOM echo dropped |
| `alt-gutter-kept/` | the cheaper M8 option: labels shortened, every gutter left at its hand-tuned value; and the trace clip fixed by widening `RIGHT_PAD` instead of anchoring |
| `alt-m7-short/` | the M7 caption in one line instead of two |

## The three defects, as rendered

- **Both metres charts clip a seventh glyph.** `before/season-portrait.png`
  reads `!00,000` and `.50,000`; `before/weekbars-portrait.png` the same.
  Measured x = −3.59 against a 38-unit gutter (`axisProbe.spec.ts`). This is
  James's phone frame (`../evidence/2026-09-14-season-axis-clipped.jpg`)
  reproduced in Chromium — the first time it has been.
- **The trace chart clips its last x tick.** `before/trace-portrait.png`
  reads `0:4(`: the label is centred on the plot's right edge, 21.60 wide
  into 16 units of room, overhanging the viewBox by 2.80. New — nobody had
  seen this one, and it is on the log-detail screen, not Stats.
- **The MACHINE column describes two populations and says nothing.**
  `before/totals-portrait.png`: METRES 36,752 and TIME 2:34:31 cover ten
  pm5 rows; AVG WATTS 176 is computed from nine, because
  `aggregate.ts` skips `tier === "stored"`. The seed's R1 (6,240 m) is
  **17.0 % of the column's own metres**, absent from the watts figure with
  nothing on screen to say so.

## The numbers behind each option

**Advances, measured** (`axisProbe.spec.ts`, Chromium 2026-09-14): a 9 px
IBM Plex Mono glyph advances **5.94** where the class carries
`letter-spacing: 0.06em` (`.stats-tick`) and **5.40** where it does not
(`.trace-tick-label`, `.stats-point-label`, `.stats-bar-label`). Every
gutter in the repo was tuned against roughly 5.67.

**Plot width gained by deriving the gutter** (`after/` against
`alt-gutter-kept/`), on a 320-unit viewBox:

| chart | gutter | plot | gain |
| --- | --- | --- | --- |
| Metres per week | 44 → 36 | 268 → 276 | +3.0 % |
| Season | 44 → 36 | 264 → 272 | +3.0 % |
| Test trend | 40 → 30 | 228 → 238 | +4.4 % |
| Trace | 42 → 28 | 270 → 284 | +5.2 % |

**Cost of the trace fix, both ways.** Anchoring the two end labels inward
costs **nothing** — the tick mark does not move, only the text hangs the
other way (`after/trace-portrait.png`). Widening `RIGHT_PAD` from 8 to 19
costs **11 units of plot, 3.9 %** (`alt-gutter-kept/trace-portrait.png`,
where both alternates are in force).

**Contrast, measured from the live cascade** (`after/contrast.json`, 13
pairings across both screens): the lowest is **6.69:1** (`.stats-caption`
and `.trace-tick-label`, both `--ink-3` on `--page`), against WCAG AA's
4.5:1 for normal text. Nothing on these boards is close to the line.

## The open questions these boards exist to settle

1. **Does the gutter shrink, or only the label?** `after/` versus
   `alt-gutter-kept/`. Shrinking is what invariant I4 asks for and buys 3-5 %
   of plot; keeping it is a smaller diff.
2. **Does the M7 caption come back, and does that reopen rulings 18/19?**
   `after/totals-portrait.png` wraps to two lines in portrait;
   `alt-m7-short/totals-portrait.png` is one. Both reverse "NO prose"
   (`TotalsGroup.tsx:6-12`). The third option — make the three cells
   describe ONE population — moves a stored figure and is TRIAD, so it is
   PR 4's, not PR 2's.
3. **Do the bar and point labels shorten too?** `after/weekbars-portrait.png`
   prints `150k` on the axis and `122,000` on the bar in the same frame;
   `after/season-portrait.png` prints `150k` beside `163,012 TODAY`. Only
   the ticks were ruled.
4. **Do the trace chart's pace ticks lose their tenth?** `after/` prints
   `1:50`, using the `split` kind Phase PS added because "pace prints
   tenths, which a gridline never needs". This is on Gate 0B's screen and
   is why 0A's board carries all four charts.
