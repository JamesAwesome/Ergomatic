# Connected rowing screen — recommendation

Answering the brief's five asks. Numbers are landscape (844 × 390) unless noted.

---

## 0. Where I disagree with the framing (read this first)

**The two questions have one answer, and it is Question 2.**

Question 1 asks for width. The gutter's spendable share is 44px of an 800px
column — **5.5%**. Meanwhile the label layer costs roughly **18% of the
vertical** and, worse, it is why the heroes are fighting for room at all. `NOW`,
`TARGET`, `/500m`, `SPM`, `UP NEXT`, `LEFT IN INTERVAL`, `TOTAL M`, `HR`,
`TOTAL LEFT`, `1 OF 2 · WORK` — ten text objects, none of which anyone reads at
full pull, all of which are sized at the floor of legibility *because* the
numerals took the space.

So: **cut the label layer, and the switchers no longer need a band of their
own.** They move into the header row, which already exists, already has empty
space, and is already inside the safe area. That reclaims the full 44px *and*
frees height, and it costs nothing structurally. The gutter question dissolves.

**Your two photographs also close the side-switching proposal.** In
`…1.21 PM 2.jpg` the housing is at the screen's left edge; in `…3.jpg` it is at
the right. Same mount, same session, cable swapped ends. A rail that migrates on
`screen.orientation.angle` would have moved sides between those two photos — the
control that is the accessibility path and the diagnostics entry point would not
have a stable location on the device it is clamped to. **Reject the
side-detection proposal.** Not because it can't be built; because the user
rotates freely and the layout must be symmetric.

**One more thing the photos say that no render does:** there is a hard specular
highlight sitting across the lower-middle of the panel in both shots. Anything
at ink-4 or ink-5 in that band is gone, not dim. This is an independent argument
for the same conclusion — fewer, larger, darker labels.

---

## 1. Question 1 — the gutter and the pane switchers

### Recommendation

**Move the switchers into the header row as one 44px-tall segmented control at
the far LEFT. Delete the vertical gutter entirely. Transition panes
horizontally.**

- One control, two halves (`LIVE` | `GRID`), 44px tall, each half ≥ 44px wide.
  It stays a real control: focusable, `aria-current="page"` on the active half,
  and the **triple-tap diagnostics gesture lives on it exactly as it does now**
  — same element, same handler, better hit area than the current 44 × 44 stack.
- **Far left, diagonally opposite END.** This is the one place I'm overruling
  your earlier instruction to put them beside END: END was moved out of the
  switcher neighbourhood specifically because a thumb reaching to change panes
  could hit it. Putting the switchers next to it re-creates that hazard in a
  smaller space. Header-left / header-right is the maximum separation available
  and keeps END where safety put it.
- In landscape the top edge carries **no housing inset** — only the left/right
  edges do, and the header row is already inside them. So this control needs no
  new band in either dimension.
- **Panes slide left↔right** (~200ms translateX, respecting
  `prefers-reduced-motion`). LIVE is the left position, GRID the right, matching
  the segmented control's geometry — the animation teaches the mapping. Keep the
  swipe handler wired but treat it as decorative until an instrumented session
  proves it; the segmented control is the shipping route.

### What this buys

Content column 800 → 844 landscape (≈682 → 726 on your device with its inset).
More importantly the grid gains a full column of breathing room and the LIVE
pane's heroes stop being squeezed left.

### What it costs

The switchers are now at the top edge, further from a resting hand than a
mid-height rail would be. I think that's correct — pane switching is a
between-intervals action, not a mid-stroke one — but it is the trade, stated.

**Also drop:** the ~65px held-off-the-corners middle path (it hard-codes a
radius no API exposes, and your own 39–62px span proves the constant doesn't
exist), and any indicator-only replacement (deletes both the a11y path and
diagnostics).

---

## 2. Question 2 — the type scale

### The principle

A label earns its place during a piece only if the number above it is
**ambiguous without it**. Almost none are. `2:09.0` under a `/500m`-shaped
number is a split; a two-digit number beside it is a rate; the number counting
down is the one counting down. Labels are for *learning* the screen, and that
happens at rest.

### Cut entirely during a piece

| Label | Why |
|---|---|
| `NOW` (×2) | The large number is self-evidently current. **Keep it only in the stale state**, where it becomes `LAST` — that is the one moment it carries information, and it will now be conspicuous by appearing. |
| `TARGET` (×2) | Learned in one session. Keep the target *number*; distinguish by size and position, not a word. |
| `UP NEXT` | The content (`REST 0:30 · then WORK 2:09.0`) is self-describing and is the only right-aligned string on that rule. |
| `/500m` | Split format is unmistakable. If you want the unit, it belongs once, on the target line, not over the hero. |
| `TOTAL M` | **Cut it — it does not earn its place even when fixed.** Nobody paces off cumulative metres; interval-remaining and session-remaining already cover "how far in am I". Restore it on the summary screen, where it's actually read. |

That's six objects gone. The three ad-hoc literals (13/12/9px) go with them.

### Keep and grow

| Object | Now | → | Note |
|---|---|---|---|
| Status caption (`WARM-UP`, `1 OF 2 · WORK`) | 11 | **22** | This is priority-2 information sized like a footnote, in the corner nearest the housing. Promote it and move it inboard — see layout. Put it on the scale; stop letting it drift from the label token. |
| Metric-row labels (`LEFT IN INTERVAL` / `METERS LEFT`, `HR`) | 11 | **15** | Two labels instead of three, so 15px fits on one line even in the wrapping pre-row case. |
| `SPM` | 11 | **19** | The one unit worth keeping — it's what separates two similar-looking numerals. |
| `TOTAL LEFT` | 11 | **15** | |

### Shrink

| Object | Now | → | Note |
|---|---|---|---|
| Split hero | 112 | **96** | |
| Split tenths | 58 | **50** | |
| Rate hero | 112 | **80** | **Asymmetric on purpose.** Split is read every stroke; rate is checked, not tracked. This is the single biggest space recovery on the pane and the main thing I want you to re-test. |
| Targets | 46 | **40** | |

### The resulting landscape scale

**96 / 80 / 50 / 40 / 30 / 22 / 19 / 15** — hero-primary, hero-secondary,
tenths, target, metric value, total & up-next, table row & SPM, label.

**Nothing is 11px during a piece.** That retires the ink-4-at-11px-on-mono ban
as a live concern rather than working around it, and it clears the 19–11 hole
that the hard-coded literals were filling.

Portrait, one step down: **88 / 72 / 46 / 36 / 28 / 21 / 18 / 14.**

Labels move up one ink: ink-3 on surface/page, ink-2 on sunken. At 15px in
glare, ink-4 is not a label.

---

## 3. Layout at 844 × 390

```
┌────────────────────────────────────────────────────────────────────┐
│ [ LIVE │ GRID ]   PM5 432331249      1 OF 2 · WORK        [ END ]  │  44
├────────────────────────────────────────────────────────────────────┤
│ ▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂│▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂ │   6
│                                                                    │
│      2:09.0                        │        24                     │
│      ‾‾‾‾‾‾ 2:09.0  6K             │        ‾‾ 24  SPM             │ ~200
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ LEFT IN INTERVAL      HR              REST 0:30 · then WORK 2:09.0 │  ~70
│ 1:12                  148                                          │
├────────────────────────────────────────────────────────────────────┤
│ TOTAL LEFT                                                   3:39  │  ~44
└────────────────────────────────────────────────────────────────────┘
```

Changes beyond the type:

- **Switchers header-left; status caption moved inboard** to sit left of END
  rather than in the corner, out of the housing's neighbourhood on either
  rotation.
- **Progress bar moves to a 6px hairline directly under the header**, notched as
  today. Reason: it is a peripheral-vision object — you want to *not* look at
  it — and the top edge is the one place the paused overlay and the disconnected
  banner don't fight it. It also stops the bottom of the screen being three
  stacked horizontal rules.
- **`TOTAL LEFT` keeps the bottom rule to itself**, now the only thing there.
- Heroes keep their vertical divider; the split column is wider than the rate
  column, matching the new type weighting.

### Portrait

Same edits, one scale step down. The **54px bottom band becomes the same
segmented control**, full width, two halves — identical component, identical
gesture, identical a11y semantics, just docked bottom instead of header (thumb
reach is the right priority when the phone is in a hand). Grid rows 40px, 15
visible, unchanged. Pane slide is horizontal in both orientations.

### The states

- **Paused** — the opaque bottom-52px block should become a **full-surface wash
  with the word centred**, not a block over one strip. It currently hides
  precisely the strip in question, and a translucent wash over everything reads
  faster anyway. (Separately: your instinct is right that "PAUSED" is wrong when
  the erg's clock keeps running. `NOT ROWING` or `STOPPED` is the honest word.)
- **Disconnected** — heroes step 96/80 → **76/62**; the banner row is paid for
  by the six cut labels, so the pane no longer needs to compress further.
- **Pre-first-stroke (the first frame every rower sees)** — do not judge a
  number the machine hasn't produced. Rate shows `0` in plain ink over its
  target. Split shows the **target value in ink-3 as a ghost**, not a dash — the
  full-height dash reading as a black bar is the worst first impression on the
  screen. With `LEFT IN INTERVAL` now at 15px and one fewer sibling, its
  two-line wrap goes away.
- **No strap** — metric row is down to two cells already; drop to one and let
  up-next take the width.
- **25 intervals** — unaffected; grid gains 44px of column.

---

## 4. What to test on the erg

Row a real piece, then answer these in order:

1. **The rate hero at 80px.** Mid-piece, without pausing: read the rate. Did you
   have to *look* rather than glance? This is the one change most likely to be
   wrong, and it's the one that funds everything else. If it fails, take it to
   88 before touching the split.
2. **Did you miss any cut label?** Specifically: at any point did you not know
   which number was the target, or what the right-hand number was? A "no" here
   is worth more than any measurement.
3. **The status caption at 22px.** Can you read `1 OF 2 · WORK` at full pull —
   the thing you explicitly couldn't before?
4. **The metric labels at 15px, in the glare band.** Your photos show a
   highlight across the lower-middle of the panel. Row at the same time of day
   and read `LEFT IN INTERVAL` through it.
5. **The header switcher, twice**: once between intervals with a hand off the
   handle (can you hit it without looking?), and once deliberately trying to
   mis-hit it — **did you ever come near END?** If yes, that's a stop.
6. **Mount the phone both ways round** (housing left, then right, as in your two
   photos) and confirm nothing moves and nothing is occluded.
7. **The first frame.** Sit down, connect, don't row. Screenshot it. It should
   look deliberate.
8. **Triple-tap the switcher** and confirm diagnostics still opens.

Report 1, 2 and 5 first — the rest are cheap once those hold.

---

## 5. Open questions I'd want answered before building

- Does the erg's own PM5 screen stay visible behind the phone on your mount? If
  it does, `TOTAL M` and possibly rate are duplicated hardware, and more can go.
- Is `HR` ever acted on mid-piece, or only reviewed after? If the latter it
  joins `TOTAL M` on the summary screen and the metric row collapses to one
  cell.
