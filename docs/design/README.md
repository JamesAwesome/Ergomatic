# Handoff: Erg Log — rowing workout tracker & planner (mobile)

## Overview
Erg Log is a mobile-first tracker/planner for indoor rowing (erg) workouts built around
"The Erg Book" model: a library of numbered workouts whose targets are expressed as
**offsets from the rower's 2k and 6k baseline splits** (e.g. `6k -2` = 2 seconds per 500 m
faster than the rower's 6k pace). The app resolves those offsets against the current
baselines every time a workout is opened, walks the rower through the workout with a
phase timer, and **freezes the resolved splits into the log** at the moment a session is
saved so history stays truthful as fitness improves.

Nine screens: Today, Library, Workout detail, Confirm targets, Countdown, Live timer
(portrait + landscape), Log session, Plan, Progress, You (account + baselines +
preferences), New workout builder.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype
showing intended look, structure and behaviour. They are **not production code to copy**.
The task is to **recreate these designs in the target codebase's environment** (React
Native, SwiftUI, Kotlin/Compose, React web, etc.) using its established patterns,
component library and navigation. If no codebase exists yet, choose the framework best
suited to the product (a phone-first tracker with a live timer, offline-friendly local
storage, no server dependency in the prototype) and implement the designs there.

`Erg Log.dc.html` opens in any browser. It renders a 390×844 phone frame; the "↻ LANDSCAPE"
control above the frame swaps to 844×420 to show the landscape timer layout. In a real app
those are the device's own portrait/landscape orientations.

## Fidelity
**High fidelity.** Colors, typography, spacing, hit-target sizes and interaction states are
final and should be matched closely. Two constraints were enforced throughout and must be
preserved:
- **Every tappable element is ≥44×44 px.**
- **All text meets WCAG AA (≥4.5:1);** the four workout-type colors were darkened
  specifically to clear 4.8:1 against cream badge text.

Content in the prototype is seeded sample data (11 workouts, one month of fake logs);
real data comes from the user's own entry.

---

## Domain model

### Baselines
- `k2`, `k6`: baseline split per 500 m, stored in **seconds** (prototype: 112.0 s = 1:52.0
  for 2k, 122.0 s = 2:02.0 for 6k).
- Edits are **staged**: `k2d`/`k6d` drafts are what the ± buttons change; a confirm block
  ("2k 1:52.0 → 1:53.5" + Discard / Apply baselines) commits them. Nothing re-paces until
  Apply. Same staged pattern for the default warm-up and the countdown length.

### Workout
```
{ id, num, title,
  type: 'AN' | 'O2' | 'AT' | 'TR',
  difficulty: 'Introductory' | 'Moderate' | 'Advanced',
  pain: 1..10,                 // expected pain rating
  lastDone: <days ago>,
  steps: Step[] }
```
Displayed duration is **always derived from the steps** (`wMinutes`), never stored, so one
workout never shows two different lengths.

### Step (rows of the builder)
```
{ k: 'wu' }                                        // warm up, dur in minutes, no target
{ k: 'reps', reps: n }                             // "repeat the block below" marker
{ k: 'w', dur, base: '2k'|'6k', off, spm, rest? }  // work: dur minutes, offset seconds, rate, optional rest
{ k: 'r', dur }                                    // standalone rest
{ k: 'test', label }                               // all-out test that resets a baseline
```
`dur` and `rest` are minutes (0.5 allowed). `off` is **seconds per 500 m, negative = faster**.

### Pace math (exact)
```
resolvedSeconds = baseline(base) + off + nudge[workoutId:stepIndex]
targetLabel     = m:ss                      // fmt(resolved)
rangeLabel      = fmt(resolved - tol) + '–' + fmt(resolved + tol)   // tol default 1s, 0–3 configurable
```
- Minus is faster (lower split). A range is shown, not a single number, so the rower can
  aim inside a band; `tol = 0` shows a single value.
- `nudge` is a per-step, per-workout offset applied on top of the stored offset (the ▲▼
  buttons on Confirm targets). ▲ = faster.

### Phase expansion (drives the timer)
`liveSteps()` expands a workout into an ordered phase list: steps before the `reps` marker
run once; steps after it repeat `reps` times. `phases()` then converts each to a timer phase
and **inserts a rest phase after any work step that has `rest`**. Lucky Penny (10′ warm-up,
4× [5 × 1′ work, 5′ rest]) → 25 phases, 50 minutes.

### Session edits (Confirm targets)
A per-run overlay, discarded when a different workout is opened:
`sess = { dur: {stepIndex: minutes}, off: {stepIndex: bool removed}, reps: n|null }`.
`sessW()` applies it (plus the global warm-up override) to produce the workout the timer
and the log use. **The timer must read the session copy, not the library workout.**

### Plan
Two presets, each an ordered 84-session sequence of type codes — **a sequence, not a
weekday calendar**, so rest days float:
- `sprint` "2 000 m sprint": pattern `O2 AT O2 TR O2 AT O2 AN`, 2k tests at indices 7/31/55
- `head` "5–6 k head race": pattern `O2 O2 AT O2 TR O2 AT`, 6k tests at 7/31/55
`doneN` = sessions logged (prototype 11 → "SESSION 12 OF 84"). Saving a log increments it.
Selecting a different plan or Reset sets `doneN = 0`.

### Suggestion engine (Today)
```
todayCode = plan[doneN]  (TEST → treated as TR)
pool      = library.filter(type === todayCode)
                   .sort(byLastDoneDesc)
                   .filter(diffs[difficulty] && wMinutes <= cap)   // You-screen prefs
            || (empty → unfiltered type list)
rec       = todayPick ?? pool[0]
```
Badge reads SUGGESTED FOR TODAY, or YOUR PICK when `todayPick` is set. SHUFFLE picks a
random other member of `pool`. Changing the preference chips clears `todayPick`.

---

## Design tokens

### Color
| Token | Hex | Use |
|---|---|---|
| page | `#f4f1e8` | screen background |
| surface | `#fffdf7` | cards, inputs, list rows |
| surface-sunken | `#efeade` | secondary panels, confirm blocks, calendar logged cells |
| ink | `#1b1a17` | primary text, strong rules, badges |
| ink-2 | `#3f3c35` | secondary text |
| ink-3 | `#57544c` | supporting text, inactive chip labels (AA at 11px) |
| ink-4 | `#8a8478` | mono labels ≥11px only |
| ink-5 | `#a09a8c` | completed/disabled text |
| rule | `#d8d3c4` | card borders |
| rule-2 | `#ded8c9` | dividers, bar tracks |
| rule-3 | `#c9c3b2` | control borders |
| accent (TR) | `#b5341f` | primary action, resolved target, destructive control, active tab mark — no longer "active state" generically; see "Accent meaning" below (ui-fix round) |
| accent-hover | `#9c2c19` | pressed/hover |
| type O2 | `#2a6275` | aerobic |
| type AT | `#8a5f18` | anaerobic threshold |
| type AN | `#5c4382` | anaerobic |
| type TEST | `#1b1a17` | 2k/6k test |
| on-color text | `#fffdf7` | text on any type color or accent |
| desk (outside frame) | `#ddd8cc` | prototype only |

### Buttons (five-level system — current authority)

> Ported from the ui-fix round's own handoff
> (`docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md`), which is now the
> historical record of *why*; this section is the standing description of
> *what ships*. Superseded here: the two-idiom `.button-primary`/
> `.button-outline` vocabulary this document originally specified as the
> only two button shapes (referenced throughout "Screens" below) — those two
> classes are still real and still render on every screen nothing has
> migrated off yet, but they are no longer the app's only two shapes.

Every action that acts on the whole screen renders as a full-width block in
a single bottom-anchored stack, 12px gap. Five levels, no other button
shapes:

| Level | Look | Height | Where |
|---|---|---|---|
| 1 · primary | solid `--accent`, cream label, Archivo 16/600 | 56px | One per screen: Start · Looks right, start · Save to library · Log this session |
| 2 · secondary | surface fill, 1px `--ink` border, ink label, same type | 52px | Log it after · Back to Today · Edit · Retry. May stack; never share a row |
| 3 · commit-in-card | solid `--ink`, mono 12/600, 0.16em | 48px | Closes an editor without leaving the screen: the builder step editor's DONE. Ink so it can't read as level 1 |
| 4 · destructive | surface fill, 1px `--accent` border, accent label | 52px | Delete workout · Discard without logging. Last in the stack, under a 1px `--rule` divider |
| 4 · armed | fills solid `--accent`, cream label, copy changes | 52px | "Tap again to discard." Auto-disarms on blur or 4s |

Exceptions, deliberate: transport (`◀ Pause ▶`) and steppers (`− +`) stay in
a row — one control, not several actions. SHUFFLE stays sub-full-width,
chip geometry (not level 2), by explicit product decision.

Implemented as `.button-l1`–`.button-l4`/`.button-l4-armed` in `index.css`
(real classes, not aliases). `BaselineEditor.tsx`'s staged "Apply baselines"
is DESIGN.md's own named level-3 target but is not converted as of this
round — a named, still-`.button-primary` survivor, along with several
others; see `docs/design/DEVIATIONS.md`'s IMP-6 row for the current,
line-numbered list of everything still unconverted.

### Accent meaning

Accent red (`--accent`) means exactly four things, no more:

1. The level-1 primary action.
2. A resolved split or duration — always the single exact value, never a
   range (see `DEVIATIONS.md`, "exact targets").
3. A destructive control (level 4's outline, or its armed solid fill).
4. The active tab mark.

It no longer means "selected." Every other selected state (difficulty, time
cap, pain, MIN/M, 2k/6k/MAX/MIN, HELD/UNDER/OVER) fills `--ink` with a cream
label. Type chips are the one exception to the ink rule: they always fill
their own type color (`--type-an`/`--type-o2`/`--type-at`, `--type-tr` =
`--accent`) whether the rower is filtering (Today) or authoring (Builder) —
identical chip either way. Inactive control, any group: transparent fill,
`--rule-3` border, `--ink-3` label.

### Typography
- **Newsreader** (serif, 500) — screen titles 31px, workout titles 26px, detail 33px,
  account name 24px, italic 30px for "no target" states.
- **Archivo** (400/500/600) — body 13–16px, buttons 16px/600.
- **IBM Plex Mono** (400/500/600) — every number, code, label. Uppercase labels
  10–11px with letter-spacing 0.12–0.2em. Timer numerals 96px portrait / 128px landscape,
  countdown 140px, both weight 500 with letter-spacing −0.05em.
- Minimum label size 10px, and **only** for mono uppercase on `#57544c` or darker.

### Geometry
- Corner radius: **2px** everywhere (paper/print feel). Phone frame 44px (prototype chrome only).
- Borders: 1px `#d8d3c4`; emphasis 1px `#1b1a17`; section rules 2px `#1b1a17`;
  dashed 1px `#c9c3b2` for bulk-import / removed states.
- Spacing scale: 2, 3, 4, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22 px. Screen padding 20px
  horizontal, 6px top / 20px bottom. Card padding 12–16px.
- Controls: steppers 44×44, chips min-height 44px + 12px horizontal, primary buttons
  min-height 52–56px, list rows 46–52px.
- No shadows inside the UI (the phone frame's drop shadow is prototype chrome).

---

## Screens

### 1. Today
Purpose: open the app, see what to row, start or log it.
- **Header** (2px bottom rule): "SESSION 12 OF 84" mono 11px / "Today" Newsreader 31px;
  right column mono 11px "2k 1:52.0 / 6k 2:02.0".
- **Suggestion header row**: left — type badge (mono 12px/600, background = type color,
  cream text, 3×7 padding) + type name 13px `#8a8478`, and beneath it the state label
  "SUGGESTED FOR TODAY" / "YOUR PICK" (mono 11px, 0.16em, ink). Right — **SHUFFLE ↻**
  bordered button, min-height 44px.
- **Suggested workout card** (surface, 1px ink border): type badge + "NO. 159" row;
  title Newsreader 26px; duration mono 20px accent right-aligned; "MODERATE · PAIN 5/10";
  one-line reason 13px `#57544c` ("Least recently done AT that fits 60′ — 33 days ago", or
  "Nothing AT fits your filters, so this is the closest match"); the reason is **hidden**
  when the rower picked the workout manually. Then the first 4 resolved steps
  (mono 13px left, accent range right, 1px `#ded8c9` separators), then a full-width
  "SEE ALL 25 STEPS →" row (top border) → workout detail.
- **Actions**: "Start workout" (accent, 52px) → Confirm targets · "Quick log" (outlined) → Log.
- **SWAP FOR ANOTHER `[AT]`**: up to 4 rows of the pool, 48px, each with a 10px square
  marker (filled ink when active), title, and "50′ · pain 5 · 33d". Active row: background
  `#f8ece3`, accent border. Tapping sets `todayPick`.
- **LAST THREE**: rows of type badge (mono 10px) + title + "JUL 25 · HELD · 2/10".

### 2. Library
- Title "Library" + "+ NEW" (accent mono) → builder. "11 OF 375 ENTERED".
- **Filter chips**, all 44px tall, wrap, 6px gap: ALL · AN · O2 · AT · TR ·
  <30′ · 30–45′ · 45–60′ · 60′+ · PAIN ≤5 · RECENT · NOT RECENT.
  Type chips are single-select **and toggle off**; duration chips are **multi-select
  (union)**; RECENT (`lastDone < 21`) and NOT RECENT (`>= 21`) are mutually exclusive;
  ALL clears everything. Active = accent background, cream label; inactive = transparent,
  `#57544c` label, `#c9c3b2` border.
- **Rows** (surface card, 14px padding): "159. Lucky Penny" 16px/500 + duration mono 13px
  accent; second line type badge + "MODERATE · 33D AGO" + a 10-segment pain bar
  (3×11px segments, filled = type color, empty `#e0dacb`).

### 3. Workout detail
Back link · type badge + "NO. 159 · MODERATE" · title Newsreader 33px ·
"50 MIN · PAIN 5/10 · LAST DONE 33 DAYS AGO" · a sunken note "PREVIEW — NUDGE ANY TARGET" ·
step list where work rows show the resolved range in accent plus ▲▼ 44px nudge buttons
(sub-line shows "24 spm · 2′ rest · nudged −1s") · "Start" + "Log it after".

### 4. Confirm targets  (between Start and the countdown)
Purpose: verify and edit this run before sitting down.
- Baselines strip "2k 1:52.0 · 6k 2:02.0".
- Rows over a 1px ink top rule, each two lines:
  line 1 = step text + resolved range (accent) + ▲▼ split nudge (44×44);
  line 2 = a −/+ **duration stepper** (44×38, ½-minute steps, min 0.5′) or, for the `reps`
  row, a −/+ **repeat stepper** (×1–12), then a 44px **×** that removes the step
  (row dims to `#b8b2a3`, sub-line "removed", glyph becomes **+** to restore).
- Header minutes recompute live from the edited session.
- "Looks right, start" (accent, 56px) — shipped this way (ui-fix round, Task 1); this row's own em dash was never reconciled against the later handoff/task brief, which both spell it with a comma.

### 5. Countdown
Centred, fills the frame in both orientations (no fixed min-height):
"GET ON THE HANDLE" · numeral mono 140px accent counting **10 → 1** · next phase in
Newsreader italic 20px · CANCEL (outlined) + **SKIP ›** (accent), both 48px.
If the configured countdown is 0 ("off"), Start goes straight to the timer.

### 6. Live timer
Bottom tab bar is hidden during countdown and timer.
**Portrait**: workout name + "END →"; phase progress dots (one per phase: past = accent,
current = ink, future = `#d8d3c4`); "STEP 2 OF 25 · WORK · SET 1/4" + RUNNING/PAUSED
(accent); **time left mono 96px**; 6px phase progress bar; two cards — TARGET SPLIT
(mono 30px accent + range beneath) and RATE (mono 30px, "spm"); UP NEXT strip; then
**TOTAL LEFT** (mono 22px) with a 6px total-progress bar and a **ruler** beneath it —
four equal segments with a 1px tick at each right edge labelled ¼ ½ ¾ and the total
minutes; controls ◀ / Pause / ▶ (56px).
**Landscape**: two columns — left = phase label, time left mono 128px, phase bar,
TOTAL LEFT + ruler, controls; right = name/END, dots, TARGET SPLIT + RATE cards,
UP NEXT panel with a "then …" second line.
Warm-up / rest / test phases replace the numeric target with "Easy" / "Rest" / "All out"
and "rate free" — **never a bare dash at display size**.
Behaviour: 1 s interval; phase auto-advances at 0 and seeds the next phase's duration;
◀/▶ skip and re-seed; Pause freezes; past the last phase → Log session.

### 7. Log session
Title "Log <workout>" · type badge + "JUL 27 · 50 MIN" · a dashed panel
"PACES LOCKED AT 2K 1:52.0 · 6K 2:02.0" listing each work step with the **single resolved
split it was done at** (this is what persists) · "DID YOU HOLD THE TARGETS?" → Held /
Under / Over (46px segmented) · PAIN RATING 1–10 picker (44px cells, filled = accent,
"EXPECTED 5/10" beneath) · NOTES textarea (88px) · "Save session" (54px) which advances
the plan and returns to Today.

### 8. Plan
- Header (2px rule): plan name Newsreader 31px + "11 LOGGED · 73 TO GO".
- **Month calendar**: "JULY 2026" + "15 SESSIONS THIS MONTH"; 7-column grid, single-letter
  day-of-week row, 40px cells with day number and a 14×3px mark colored by that session's
  type; today's cell is outlined in its type color; future days `#b8b2a3`.
- **ALL / TO DO / DONE** filter chips, then the **type legend** (12px outlined swatch +
  "O2 aerobic" etc. in mono 11px `#3f3c35`).
- **Session rows** (20 shown): index, type badge in the type color, description, and
  LOGGED / TODAY on the right; a 3px left rule in the type color. Completed rows are
  neutral grey **and sorted below** the upcoming ones; today's row has an `#f8ece3`
  background and an accent badge. Tapping opens a matching workout.

### 9. Progress
2K TEST SPLIT and 6K TEST SPLIT cards (three dated bars each, **longer bar = slower**,
delta "−4.4s since Mar" in accent) · MINUTES PER WEEK · BY TYPE: six 120px-tall bars
**stacked** from type-colored segments (O2 at the base, then AT, TR, AN; 1px gaps) with
the weekly total above and the week label below · TYPE MIX · LAST 30 DAYS: horizontal bars
in the type colors with counts.

### 10. You
- **Account header** (2px rule): 46px ink square with initials, name Newsreader 24px,
  "SESSION 12 · 2 000 M SPRINT" mono 11px `#57544c`, and a **SWITCH** button (44px) that
  expands a 52px-row account list (active row `#f8ece3` + accent avatar + "SIGNED IN")
  ending in a dashed "Add another rower" row. Multi-account is a stated requirement.
- **Baselines** card: 2k and 6k drafts in mono 32px accent with 44px −/+ (− = faster,
  0.5 s steps) and the staged confirm block described above.
- **SUGGEST WORKOUTS AT**: INTRO / MODERATE / ADVANCED multi-select chips.
  **TIME I USUALLY HAVE**: 30′ / 45′ / 60′ / 90′ single-select. Live readout
  "7 of 11 workouts match". Both feed the Today suggestion and clear `todayPick`.
- **DEFAULT WARM-UP**: mono 24px + −/+ and an "Override library warm-ups" checkbox
  (22px box, 44px row). When on, every `wu` step is re-timed to this value.
  Staged confirm note: "10′ → 3′ · override on".
- **PRE-WORKOUT COUNTDOWN**: 0–60 s in 5 s steps, "off" at 0; staged confirm "10 s → 5 s".
- **TRAINING PLAN**: two 46px radio rows (2 000 m sprint / 5–6 k head race) +
  "RESET PROGRESS TO SESSION 1" (accent outline).
- **TEST HISTORY**: date · distance · split · delta rows.

### 11. New workout (builder) — one screen
No. + Title · **TYPE** AN/O2/AT/TR (44px, active = type color) · **DIFFICULTY**
INTRO/MODERATE/ADVANCED · **EXPECTED PAIN** 1–10 picker · column header
"SET · DUR · PACE REF · SPM · REST · SPLIT" · rows of 44px fields
(dur 48px, pace ref 64px accent text, spm 40px, rest 44px) with a 44px **SET** cell
(dim ↻, filled with accent + cream ↻ when marked, plus a 3px accent left rule on the row),
a 44px delete ×, and the resolved split on a second line · "+ ADD ROW" dashed ·
**REPEAT (OPTIONAL)** −/+ ×N with "1 row marked · 7:00 per set" ·
**TOTAL** (loose minutes + set minutes × reps) · "+ PASTE TO BULK IMPORT" toggle revealing
a dashed textarea ("One workout per block, blank line between") · "Save to library".
Pace ref accepts `2k`, `6k`, `6k-2`, `2k+4` (regex `^(2k|6k)\s*([+-]?\d+(\.\d+)?)?$`).

---

## Interactions & behaviour
- **Navigation**: bottom tabs TODAY · LIBRARY · PLAN · TREND · YOU (10px mono labels,
  16×3px accent mark above the active label). Detail/confirm/timer/log map to TODAY,
  builder to LIBRARY. Detail, confirm, log and builder have a "← BACK" link backed by a
  history stack. Tabs are **hidden** during countdown and timer.
- **Flow**: Today → Confirm targets → Countdown (skippable) → Live timer →
  (END or last phase) → Log → Save → Today with the plan advanced.
- **Hover/press**: accent buttons darken to `#9c2c19`; outlined controls darken their
  border to `#8a8478`/`#1b1a17`; text links go accent. Provide equivalent pressed states
  on touch.
- No animations beyond the 1 s timer tick and progress-bar width changes; keep it calm.
- **Persistence**: the prototype holds everything in memory. A real build should persist
  baselines + history, drafts, preferences, library and the in-progress session locally,
  and restore an interrupted timer.

## State
`screen`, `hist[]`, `wid` (selected workout), `step` (phase index), `remain` (seconds),
`running`, `count` (countdown), `land` (orientation, prototype only),
`k2/k6` + `k2d/k6d`, `nudge{}`, `sess{dur,off,reps}`,
`planKey`, `doneN`, `planFilter`, `todayPick`,
`fType`, `fDur{}`, `fPain`, `fRecent`, `fFresh`,
`diffs{}`, `cap`, `wuMin/wuMinD`, `wuOn/wuOnD`, `cd/cdD`,
`acctIdx`, `acctOpen`, log form (`pain`, `hit`, `notes`), builder
(`nwNum`, `nwTitle`, `nwType`, `nwDiff`, `nwPain`, `nwRows[]`, `nwReps`, `nwBulk`, `nwBulkOpen`).

Two configurable design props exist in the prototype: `paceTolerance` (0–3 s, default 1)
and `accentColor` (default `#b5341f`). Treat both as settings, not hard-coded values.

## Assets
None. No images, no icon set, no SVG illustration — every graphic (badges, bars, calendar
marks, ruler ticks, avatar) is a colored rectangle or text. Fonts are Google Fonts:
Newsreader, Archivo, IBM Plex Mono. Glyphs used as icons: ↻ ▲ ▼ ◀ ▶ − + × ✓ → ‹ ›.

## Files
- `Erg Log.dc.html` — the full interactive prototype (all screens). Open in a browser;
  the logic class at the bottom of the file contains the pace math, phase expansion,
  suggestion engine and plan definitions.
- `Erg Log v1 explorations.dc.html` — the earlier exploration: the same app in a dark
  "erg monitor" treatment (1a) next to the first paper Today screen (1b). Reference only;
  the paper direction was chosen.
