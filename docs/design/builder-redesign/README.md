# Handoff: Ergomatic "New Workout" builder — redesign

## Overview

A revision of the builder screen that authors one workout (metadata + an ordered list of steps + a repeat count). It addresses the three problems raised in the design review brief:

1. **Vertical density** — each step used to occupy 3–4 lines permanently. Now only the step being edited is expanded; every other step collapses to a two-line summary card (~86px) with inline quick actions.
2. **Inconsistent control sizing** — controls were sized by their text. Now every interactive element is exactly 44px tall (48px for the title row, 62px for Save), toggles use fixed-width segments, and steppers are joined 44px groups.
3. **Competing "selected" treatments** — reduced to three deliberate ones: type colour (TYPE only), ink black (DIFFICULTY, and the two ink action buttons), pain ramp (EXPECTED PAIN only). Accent red is reserved for the in-row unit / pace-ref toggles and the Save button.

Also new: **rest is a stepper in 30-second increments** (was a free-typed minutes field), and quick **duplicate / delete** on collapsed rows.

## About the design files

`Builder redesign.dc.html` in this bundle is a **design reference created in HTML** — a working prototype of the intended look and behaviour, not production code to copy. The task is to recreate it inside the existing Ergomatic React/iOS codebase using its established components, tokens, and patterns. Treat the CSS custom-property names in the brief (`--page`, `--ink`, `--accent`, …) as the source of truth; the hex values below are the resolved values of those tokens and are given so measurements can be verified.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, sizes, and interaction behaviour. Recreate pixel-for-pixel at 390px width. No shadows, no animation, no gradients, 2px radii everywhere — as per the non-negotiable constraints.

## Screen

**Name:** New workout (builder)
**Purpose:** author a workout: title, type, difficulty, expected pain, ordered steps, repeat count; save to library.
**Frame:** 390 × 844. Page background `#f4f1e8`. Single vertical scroll column, `padding: 14px 20px 24px`, `gap: 18px` between blocks. Usable content width **350px**.

The screen reads as four blocks: **identity** (back + title + name field) → **classification card** → **steps** → **totals + Save**.

### 1. Header

- `← BACK` — IBM Plex Mono 11px, `letter-spacing: 0.16em`, `#6f6a5f`, tappable.
- `New workout` — Newsreader 30px / weight 500 / `letter-spacing: -0.01em`, `#1b1a17`.
- Gap between them: 10px. Block gap below: 18px.

### 2. Title row

`display: flex; gap: 8px`

| Element | Spec |
|---|---|
| Title input | `flex: 1`, height **48px**, bg `#fffdf7`, border `1px solid #c9c3b2`, radius 2px, padding `0 12px`, Archivo 15px, `#1b1a17`, no outline on focus change. Placeholder "Title". |
| Auto-name button | height 48px, `padding: 0 14px`, bg `#1b1a17`, border `1px solid #1b1a17`, radius 2px, content `↻ AUTO NAME` (glyph 13px + IBM Plex Mono 11px, `letter-spacing: 0.1em`), colour `#fffdf7`. Hover: bg + border `#3f3c35`. Replaces the old 🎲 — the previous version read as a label, not a button. |

Behaviour: tapping AUTO NAME replaces the title with a random on-theme weather name (Zephyr, Squall, Doldrums, Monsoon, Cirrus, Hailstone).

### 3. Classification card

One card holding all three metadata pickers, so they read as a single unit rather than three loose strips.
Card: bg `#fffdf7`, border `1px solid #ded8c9`, radius 2px, `padding: 14px`, `gap: 14px` column.

Each group: column, `gap: 7px` — a mono label above a row of chips.
Group label: IBM Plex Mono 10px, `letter-spacing: 0.16em`, `#6f6a5f`.
Every chip: `flex: 1`, height **44px**, radius 2px, centred, `gap: 6px` between chips.

**TYPE** — AN / O2 / AT / TR. Mono 12px, weight 500, `letter-spacing: 0.06em`.
- Unselected: bg `#fffdf7`, border `1px solid #d8d3c4`, text `#3f3c35`.
- Selected: bg + border = the type colour, text `#fffdf7`. AN `#5c4382`, O2 `#2a6275`, AT `#8a5f18`, TR `#b5341f`.

**DIFFICULTY** — EASY / MEDIUM / HARD. Mono 11px, `letter-spacing: 0.08em`.
- Unselected: as above. Selected: bg + border `#1b1a17`, text `#fffdf7`. (Was accent red — moved to ink so accent stays meaningful.)

**EXPECTED PAIN** — 1–5, numerals only. Mono 13px. The label row is `space-between`: `EXPECTED PAIN` on the left, the current level's word on the right in mono 11px / `letter-spacing: 0.06em` / `#3f3c35`: `EASY BREATH · COMFORTABLE · WORKING · HURTS · BRUTAL`.
- Unselected: bg `#fffdf7`, border `1px solid #d8d3c4`, text `#6f6a5f`.
- Selected: bg + border = ramp colour, text `#fffdf7`. Ramp: `#5b6b46`, `#6e7040`, `#8a5f18`, `#a3491f`, `#b5341f`.
- Note: the ink-stroke faces from the previous version were dropped. If the face illustrations are re-added, keep the numeral and the same fills — the faces at ~20px were the weakest contrast element on the screen.

### 4. Steps

Section header row, `space-between`, both mono 10px / `0.16em` / `#6f6a5f`: `STEPS` and `2 STEPS` (singular `1 STEP`). Column gap 8px between cards.

Every step card: radius 2px, `border: 1px solid`, plus a **3px left border** used as the state marker.

| | collapsed | expanded |
|---|---|---|
| bg | `#fbf9f1` | `#fffdf7` |
| border | `#ded8c9` | `#c9c3b2` |
| left marker | `#ded8c9` | the current **TYPE colour** |

Only one card is expanded at a time (`editing = rowId | null`).

#### 4a. Collapsed card (~86px)

`padding: 9px 9px 9px 11px`, column, `gap: 6px`.

**Line 1** (whole line tappable → expand), `align-items: baseline`, `gap: 10px`:
- step index — 16px wide, mono 12px, `#8a8478`
- summary — `flex: 1`, mono 14px, `#1b1a17`, `nowrap / overflow hidden / ellipsis`. Format: `20′ @ 6k +10` (minutes) or `2000 m @ 2k ±0` (metres). Offset sign: `+n`, `−n`, `±0`.
- resolved split — mono 12px, `#57544c`, `nowrap`, e.g. `2:11.0–2:13.0`. Right-aligned at the line end.

**Line 2**, `align-items: center`, `gap: 10px`:
- sub-summary — `flex: 1`, `padding-left: 26px` (aligns under the summary), mono 11px, `#57544c`, ellipsis. Format: `20 spm · rest 1:30`. Omit the spm term when spm is free; rest reads `rest none` at zero. Tappable → expand.
- **action group** — one joined control: border `1px solid #d8d3c4`, radius 2px, bg `#fffdf7`, `overflow: hidden`, internal dividers `1px solid #ded8c9`. Three cells, each 44px tall, hover bg `#efeade`:
  - `EDIT` — 48px wide, mono 10px, `0.1em`, `#3f3c35` → expands this row
  - `⧉` — 44px, mono 15px, `#3f3c35` → duplicates this row directly beneath, **without** expanding either
  - `×` — 44px, 17px, `#6f6a5f`; hover text `#b5341f` → deletes this row

Total action-group width 136px; the two text lines take the remaining ~190px and truncate with ellipsis rather than wrapping.

#### 4b. Expanded card (editor)

`padding: 10px 11px 11px`, column, `gap: 8px`. Seven rows:

1. **Header** — `STEP n` (`flex: 1`, mono 10px, `0.16em`, `#6f6a5f`) + `DUPLICATE` button (44px tall, `padding: 0 12px`, bg `#fffdf7`, border `1px solid #d8d3c4`, mono 10px `0.1em`, `#3f3c35`; hover border `#8a8478`) + `×` (44×44, same border/bg, 17px, `#6f6a5f`; hover border+text `#b5341f`).
2. **DUR** — field label 34px wide (mono 10px, `0.14em`, `#6f6a5f`) + numeric input (`flex: 1`, 44px, bg `#fffdf7`, border `1px solid #c9c3b2`, radius 2px, padding `0 10px`, mono 15px) + unit toggle: joined pair, border `1px solid #c9c3b2`, radius 2px, two 56×44 segments `MIN` / `M` (mono 11px, `0.06em`), divider `1px solid #c9c3b2`. Selected segment: bg `#b5341f`, text `#fffdf7`; unselected bg `#fffdf7`, text `#3f3c35`.
3. **PACE** — label + baseline toggle (joined pair, two **48×44** segments `2K` / `6K`, same selected treatment) + offset stepper (`flex: 1`).
4. **SPM** — label + stepper (`flex: 1`). Value shows the number, or `FREE` in `#6f6a5f` when 0.
5. **REST** — label + stepper (`flex: 1`). Value `m:ss` in `#1b1a17`, or `NONE` in `#6f6a5f` at zero.
6. **TARGET strip** — height 44px, bg `#efeade`, border `1px solid #ded8c9`, radius 2px, `padding: 0 12px`, `space-between`: `TARGET` (mono 10px, `0.14em`, `#57544c`) and the resolved range (mono 15px, `#1b1a17`). Deliberately **ink, not accent red** — it is output, not a selected state.
7. **DONE** — full width, 44px, bg + border `#1b1a17`, text `#fffdf7`, mono 11px, `letter-spacing: 0.12em`; hover `#3f3c35`. Collapses the row.

**Stepper pattern** (used by PACE offset, SPM, REST, and REPEAT): one container, `display: flex`, border `1px solid #c9c3b2`, radius 2px, bg `#fffdf7`, `overflow: hidden`. `−` and `+` cells are 44×44, mono 17px, `#1b1a17`, hover bg `#efeade`. The value cell sits between them with `border-left`/`border-right: 1px solid #ded8c9`, mono 15px, centred; it is `flex: 1` in-row and a fixed 52px in the REPEAT control.

#### 4c. Add step

Full width, height **48px**, `border: 1px dashed #c9c3b2`, radius 2px, mono 11px, `letter-spacing: 0.12em`, `#57544c`, copy `+ ADD STEP`. Hover: text and border `#b5341f`.

### 5. Repeat card

bg `#fffdf7`, border `1px solid #ded8c9`, radius 2px, `padding: 14px`, column `gap: 10px`.
- Row: `REPEAT ALL STEPS` (`flex: 1`, mono 10px, `0.16em`, `#6f6a5f`) + stepper showing `×4` (value cell 52px wide).
- Below: `2 steps · 30:28 per set` — mono 11px, `#57544c`.

Copy changed from `REPEAT (OPTIONAL)` to `REPEAT ALL STEPS` — it states the data model (one repeat marker covering everything) instead of leaving the scope ambiguous.

### 6. Totals + Save

- Block: `border-top: 1px solid #ded8c9`, `padding-top: 12px`, column `gap: 6px`.
- Row `space-between`, baseline-aligned: `TOTAL` (mono 10px, `0.16em`, `#6f6a5f`) and `122 MIN` (mono **19px**, `#1b1a17`).
- Below: `+ 10′ warm-up from your preferences` — mono 11px, `#6f6a5f`. Informational only; the warm-up is not part of the workout.
- **Save to library** — full width, height **62px**, bg `#b5341f`, radius 2px, Archivo 16px weight 600, `#fffdf7`. Hover bg `#9c2c19`. `flex: none` so it never compresses.

## Interactions & behaviour

- **Expand / collapse.** `editing` holds at most one step id. Tapping a collapsed card's index/summary/sub or its `EDIT` cell sets `editing = id`, which collapses whatever was open. `DONE` sets `editing = null`.
- **Add step** appends a copy of the last step's values (or a default `5 MIN / 6k ±0 / 22 spm / 60s rest` when the list is empty) and opens it for editing.
- **Duplicate.** Two entry points, different intent: the collapsed `⧉` inserts a copy beneath and **leaves everything collapsed** (fast way to build `5×1′`); the expanded `DUPLICATE` inserts a copy beneath and **opens the copy** (duplicate-then-tweak).
- **Delete** removes the step and sets `editing = null`. Available from both collapsed and expanded states.
- **Rest stepper:** ±30s per tap (step size configurable — see props), clamped `0…900`. `0` renders `NONE`.
- **SPM stepper:** `+` clamps at 40; from 0 it jumps to 18. `−` below 17 goes to `0` = `FREE`. Reflects that spm is optional.
- **Pace offset stepper:** ±1s per tap, clamped `−15…+30`.
- **Resolved split** recomputes on every change: `split = baseline[ref] + offset`, displayed as `fmt(split − tol)–fmt(split + tol)` with `tol` = 1.0s and one decimal (`m:ss.s`). Baselines in the prototype: 2k `1:52.0` (112.0s), 6k `2:01.0` (121.0s) — in the real app read the rower's current baselines.
- **Duration → seconds.** Minutes: `n × 60`. Metres: `(n / 500) × splitSeconds` — i.e. metre steps are converted using that step's own resolved pace, which is why rest must stay minutes-only.
- **Per-set** = Σ(step seconds + rest seconds); **TOTAL** = `round(perSet × reps / 60)` minutes.
- No animation on expand/collapse (per constraint 3) — the row swaps state instantly.
- Hover states are specified above for the web harness; they are decorative on iOS.

## Accessibility / constraint compliance

- Every tappable element is ≥44px in both axes: chips 44, steppers 44×44, collapsed action cells 48×44 / 44×44, `ADD STEP` 48, title row 48, Save 62. The narrowest cell is 44px wide.
- Text contrast on `#f4f1e8` / `#fffdf7` / `#fbf9f1`: `#1b1a17` ≥ 14:1, `#3f3c35` ≥ 9:1, `#57544c` ≥ 7:1, `#6f6a5f` ≥ 5:1. All selected-chip fills carry `#fffdf7` text at ≥4.5:1 (pain ramp `#6e7040` is the tightest at ~4.6:1 — do not lighten it).
- `#8a8478` is used only for the step index numeral (non-essential ordinal, ~3.4:1). If the axe scan flags it, move it to `#6f6a5f`.

## State

```
title: string
type: 'AN' | 'O2' | 'AT' | 'TR'
diff: 'EASY' | 'MEDIUM' | 'HARD'
pain: 1..5
reps: number            // 1..20
editing: rowId | null   // exactly one expanded row, or none
rows: Array<{
  id: number
  dur: string           // raw input text
  unit: 'MIN' | 'M'
  ref: '2K' | '6K'
  off: number           // seconds, −15..+30
  spm: number           // 0 = free
  rest: number          // seconds, 0..900, multiples of the step size
}>
```

Derived per render, never stored: resolved split range, summary strings, per-set seconds, total minutes.
Read from elsewhere: the rower's 2k/6k baselines; the warm-up length from preferences.

## Configurable behaviour (prototype props)

| Prop | Default | Purpose |
|---|---|---|
| `restStep` | `30` | Rest increment in seconds (15 / 30 / 60). |
| `splitOnCollapsed` | `true` | Show the resolved split on collapsed cards. |
| `paceTolerance` | `1` | ± seconds around the resolved split. |

These exist so the team can settle the questions the review raised; ship whichever values you land on.

## Design tokens

Colours — `--page #f4f1e8` · `--surface #fffdf7` · collapsed-card surface `#fbf9f1` · `--surface-sunken #efeade` · `--ink #1b1a17` · `--ink-2 #3f3c35` · `--ink-3 #57544c` · `--ink-4 #6f6a5f` · index grey `#8a8478` · `--rule #d8d3c4` · `--rule-2 #ded8c9` · `--rule-3 #c9c3b2` · `--accent #b5341f` · `--accent-hover #9c2c19` · `--on-color #fffdf7` · type AN `#5c4382` O2 `#2a6275` AT `#8a5f18` TR `#b5341f` · pain ramp `#5b6b46` `#6e7040` `#8a5f18` `#a3491f` `#b5341f`.

Spacing — 6 / 7 / 8 / 9 / 10 / 11 / 12 / 14 / 18 / 20 / 26.
Heights — 44 (all controls) · 48 (title row, add step) · 62 (Save).
Fixed widths — 16 (index) · 34 (field label) · 44 (stepper button, icon cell) · 48 (EDIT cell, pace-ref segment) · 52 (repeat value) · 56 (unit segment).
Radius — 2px everywhere. Borders — 1px, plus the 3px left state marker. **No shadows.**

Type — Newsreader 500 30px (screen title) · Archivo 400/600 15–16px (input text, Save) · IBM Plex Mono for every number and uppercase label: 10px/`0.14–0.16em` (labels), 11px (secondary, button text), 12px (index, collapsed split), 13px (pain numerals), 14px (collapsed summary), 15px (all control values), 17px (stepper glyphs), 19px (TOTAL).

## Assets

None. All glyphs are text characters: `←`, `↻`, `⧉`, `×`, `−`, `+`, `′`, `±`, `·`, `–` (en dash in ranges). No SVG, no icon fonts, no images.

## Files

- `Builder redesign.dc.html` — the prototype (this is the reference implementation).
- `support.js` — runtime for the prototype only; **do not port**.
- Prior context: `../design_handoff_erg_log/README.md` covers the surrounding app (domain model, other screens, shared tokens).

## Open questions for the team

1. Should `×` on a collapsed card confirm before deleting? Currently it deletes immediately (no undo in the prototype).
2. Step reordering is not addressed — the brief did not mention it. If steps need reordering, the collapsed card is the natural place for a drag handle, which would cost 44px of its action-group width.
3. Bulk import (present in an earlier build) is not on this screen. Confirm whether it stays on the builder or moves to the library.
