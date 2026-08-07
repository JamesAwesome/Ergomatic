# Ergomatic Phase 7 — connected mode: design decisions back to the build session

**Date:** 2026-08-05 · **From:** design · **For:** implementation
**Answers:** `pm5-handoff.md` (copied here as `original-packet.md`)
**Mockup:** `Ergomatic connected mode.dc.html` — open in any browser. Reads top to
bottom: decisions strip, Connect's placement, the seven interstitial states, the three
panes in portrait, the three panes in landscape (844×390), then the mid-session states,
the diagnostics sheet and the no-HR treatment. `support.js` must sit beside it.

Design reference, not code to copy. Sizes, colours and states are final; markup is
inline-styled and should become the codebase's own tokens and classes.

Everything below sits inside the standing law from the UI-fix round: five button levels,
one level-1 per screen, accent means exactly four things, ≥44px targets, no small mono
label lighter than `--ink-3`.

---

## The one-line summary

**The monitor drives; the phone explains.** The phone contributes the two things the PM5
cannot: what the target *means* (which baseline offset produced it) and where you are in
the session as a whole. Every raw number belongs to the machine, and we never re-derive
one we can read.

---

## 1 · Connect's placement and copy

**Copy: `Connect`** (ours). One word, monitor-agnostic, and it reads as the verb for the
whole mode. "Connect monitor" repeats a word the interstitial says one screen later;
"Row on the erg" describes what Start already does.

**Position: second in the stack**, level 2, directly under Start:

```
Start                    56  L1 accent
Connect                  52  L2 outline
Log it after             52  L2 outline
Edit                     52  L2 outline
── rule ──
Delete workout           52  L4 accent outline
```

The two ways to *do* the workout now sit together and the two ways to *deal with it
afterwards* sit together. Start remains the only level 1, so Connect cannot compete.

- After a first successful pair, a mono caption under the stack reads
  `LAST USED · PM5 430123456`. **Never put state inside the button label** — the label is
  the verb, always.
- Bluetooth off: level-2 geometry, dashed `--rule-3` border, `--ink-5` label, caption
  `BLUETOOTH IS OFF`. Same dashed idiom as a disabled SHUFFLE. Still tappable → it opens
  the OS Bluetooth prompt rather than doing nothing.

## 2 · The interstitial — full screen, seven states

**Full screen, borrowing Countdown's geometry.** A sheet was rejected: this is a mode
change with a real failure path, and the detail screen behind it is not actionable while
we scan. Every state is the same three-part skeleton so transitions never re-flow the
page:

```
mono status label      11px / 0.18em / --ink-3      what phase we're in
serif line             36–44px Newsreader           what is happening, in plain words
mono/body detail       11–14px                      the specifics
────────
bottom stack           L1 (only when there's a retry) then L2s, Cancel last
```

**Nothing spins.** Progress is three mono checklist lines — `FOUND` · `CONNECTED` ·
`SENDING THE WORKOUT` — each with a leading marker: `✓` done, filled 10px ink square
current, `--rule-3` square pending. A stall is then self-diagnosing: whichever line holds
the filled square is where it hung. This replaces a spinner in every state.

| State | Status label | Serif line | Notes |
|---|---|---|---|
| 1 Scanning | `LOOKING FOR A MONITOR` | Scanning | Three 10px squares advance 1/s as the only motion. Workout summary beneath. |
| 2 Scanning, hint (**8 s**) | `STILL LOOKING` | No monitor yet | Sunken `TRY THIS` panel: "Take a stroke, or press any button on the monitor. It won't answer while asleep." Adds `SCANNING FOR 0:14`. Scan keeps running; there is no timeout and no dead end. |
| 3 Multiple found | `3 MONITORS NEARBY` | Which erg are you on? | 64px rows, signal square (ink / `--ink-5` / `--rule-3`), device name mono 15px, `STRONG · USED LAST TIME` caption, `›`. Sorted by RSSI; last-used wins ties. Footer: `STILL SCANNING · MORE MAY APPEAR`. |
| 4 Pairing | `PM5 430123456` | Connecting | Checklist: found ✓, connecting ●, sending ○. |
| 5 Programming | `… · CONNECTED` | Sending the workout | Sunken `WHAT THE MONITOR IS GETTING` panel — interval count, the baselines the targets came from, and how many were nudged on Confirm. Line 3 counts `SENDING · INTERVAL 14 OF 25` because a 25-interval push is the slow case. |
| 6 Failed / rejected | `PM5 430123456` | The monitor wouldn't take it | "It refused the workout at interval 14. End whatever is showing on the monitor, then try again.", then a `DETAIL` panel with the raw code (`REJECTED · CSAFE 0x1A · 14/25`) for a bug report. Reassurance line: `YOUR WORKOUT AND NUDGES ARE KEPT`. Stack: **Try again** (L1) · Row on the phone timer instead (L2) · Cancel (L2). |
| 7 Ready | `… · PROGRAMMED` | Ready when you pull | One line: "The monitor starts the clock on your first stroke." Auto-advances after **1.2 s**; **Show me the numbers** (L1) skips the wait. |

**Copy rules for every in-frame string:** no em-dashes, two sentences maximum, no clause
that only exists to be reassuring. A rower at 170bpm reads three or four words. Explanatory
prose belongs in this README, not on the screen.

**Copy that is ours and should be reviewed as copy:** "Ready when you pull", "The monitor
wouldn't take it", "Row on the phone timer instead", "Show me the numbers", the awake hint,
and "Which erg are you on?".

**Timing:** hint at **8 s** (long enough that a woken monitor is usually found first, short
enough to beat impatience). Ready dwell **1.2 s**. No scan timeout.

**Cancel** is present in every state, always last, always level 2, always lands back on
Workout detail with nothing lost. The phone-timer escape appears on states 2 and 6 and
drops into the existing Start path with the confirmed targets intact.

## 3 · The three panes

**Order A timer · B live · C grid. Landing pane: B on the first connected session, then
whichever pane the rower last used** (per rower, not per workout). Rationale: B is why you
connected, but a rower who lives in the grid shouldn't re-swipe every session.

### Actual vs target — the accent problem, solved without a fifth meaning

- **The target is ink in connected mode**, not accent. Accent on a target that sits inches
  from a tinted actual reads as a third judgement colour; with the actual now carrying
  teal/ochre, the target must be the neutral reference. On these panes accent's only job is
  the active interval's countdown in pane C.
- **The machine's actual is the big numeral beside it**, same card geometry, same size —
  distinguished by its label (`NOW · /500M` vs `TARGET SPLIT`) and by its colour state.
- **Off target is a colour on the value, and nothing else moves.** No text changes state
  mid-session — a re-wording caption is the distracting part, not the colour:

| State | Value colour | Caption |
|---|---|---|
| Under the target (split slower than asked, rate below) | **teal `#2a6275`** (the `O2` type colour) | `TARGET 2:00.0` / `TARGET 22` — fixed |
| Within tolerance | `--ink` | fixed |
| Over the target (split faster than asked, rate above) | **ochre `#8a5f18`** (the `AT` type colour) | fixed |

  **The split is tinted everywhere it appears as an actual**, not just the rate: pane A's
  `NOW · /500M` card, pane B's hero numeral (portrait and landscape) and the grid's actual
  `/500M` cells. The mockup shows `1:57.8` against a `2:00.0` target so the ochre state is
  visible; `1:59.5` on completed row 2 shows the in-tolerance ink state.

  The card's third line is a **static target readout** that never re-words or reflows, so
  the only thing that changes while rowing is the colour of a number the rower was already
  watching. No fills, no borders, no arrows, no `FAST`/`SLOW` wording anywhere.
- **The rule is pane-agnostic.** Any cell that shows a live actual against a programmed
  target gets it: pane A's split and rate cards, pane B's hero, rate, HR and meters cards,
  the grid's actual cells — portrait and landscape alike. One helper decides the colour;
  no pane implements its own judgement. The only exception is **stale data during a
  reconnect**, where every actual greys to `--ink-3` regardless of how it compares — a
  number we can't vouch for is not judged.
- **The grid** follows the same rule on its *actual* `/500M` and `SPM` cells. Programmed
  values are never tinted — only what actually happened gets judged.
- `toleranceRange()` decides which of the three states applies. That is the same call that
  already judges off-target nudges.

### Pane A — our timer, connected (390×844 / 844×390)

Keeps the shipped timer's rhythm exactly. What changes:

- **Connection indicator**: an 8px filled ink square + `PM5 430123456` in mono 11px
  `--ink-3`, first line of the pane. Hollow square = reconnecting. It is the same caption
  family as every other label, deliberately unremarkable.
- Phase label gains the machine's interval count: `INTERVAL 3 OF 25 · WORK`.
- Status word is `ROWING` **in ink**, not the phone timer's accent `RUNNING` — see
  DEVIATIONS.
- A `NOW · /500M` card joins the target card (row 1); `RATE` and `METERS` form row 2.
  Every card's third line is the static target readout for that metric.
- **Transport row is gone.** The phone owns no Pause. Its place is taken by a single
  full-width level-2 **End session** (52px), staged: `Tap again to end` for 4 s.
- `UP NEXT`, `TOTAL LEFT` and the quarter-ruler are unchanged from the shipped timer. In
  landscape the right column is a full-height stack: header and segment bar pinned top,
  `UP NEXT` pinned bottom, and the two card rows **share the space between them**
  (`flex: 1` each, contents vertically centred) so the cards fill the column instead of
  bunching under the header. Both columns end on the same baseline as End session.

### Pane B — live view

Pure machine data, no controls but End.

The pane opens with the **same interval segment bar and the same `UP NEXT` strip as pane A**,
in both orientations — swiping between the two panes must never cost the rower their place
in the session; only the size of the numbers changes.

Hierarchy, largest first: **current /500m** (portrait 96px with tenths at 52px, landscape
150px/72px — the eye should land on the seconds, not the decimal) → **time left in
interval** (72px / 62px) → **rate · HR · meters** as three equal cards (40px / 44px) →
**strokes · elapsed · total left** as a mono 18–20px strip, closed by **the same total-left
bar and quarter-ruler as pane A** in both orientations — the session-level context is
identical on every pane, only the size of the live numbers changes. The target sits under the hero
as `TARGET 2:00.0 · 0.6 UP · 6K −2` — accent value, mono caption.

Legibility target: the hero digit height is ~74px in landscape, roughly 2.4× ErgZone's
pace numeral in the same frame. On a distance interval the second slot becomes
`METERS LEFT`.

### Pane C — the grid

**Portrait: two-line rows.** Line 1 `# · TIME · METERS · /500M` at mono 15px; line 2
`SPM · HR · REST` at mono 12px, indented 30px under the interval number so columns still
scan. Six columns, all visible, no horizontal scroll, nothing hidden.

**Landscape: one line, all six columns** at mono 17px with flex weights
`26px / 1.1 / 1 / 1 / 0.7 / 0.7 / 0.9`.

Row states:

| Row | Treatment |
|---|---|
| Completed | Actuals, ink, **solid** 1px `--rule-2` bottom border |
| **Active** | `--surface` card, **2px ink border**, 7×14px filled now-marker beside the number, bold index. Its countdown cell is **accent** (a duration — legal) at 22px portrait / 26px landscape, plus a third line: `REMAINING · TARGET 2:00.0 · 6K −2` |
| Upcoming | Programmed values in `--ink-3 #57544c`, over a **dashed** 1px `--rule-3` bottom border. The dash — the app's established "nothing here yet" idiom — carries "not yet rowed"; **colour does not**, because `--ink-5` at 12–17px fails AA on `--page` and the CI sweep would reject it. |

**Distance intervals** (decided: they're common): the programmed dimension is the one that
counts down and the one that wears accent. Time intervals count time down, meters up;
distance intervals count meters down, time up. A pending distance row shows `—` in the
time cell and its meters in the meters cell. A mono caption under the grid names it in
words — `ROW 5 IS A 500 M PIECE · METERS COUNT DOWN` — rather than inventing a glyph.

**Scrolling:** pane C is the single exception to the no-scroll rule, and it is contained —
header, caption and End are pinned; only the rows scroll (five fit at 390px landscape) and
the active row is always scrolled into view. Panes A and B are fixed two-column layouts
that cannot grow.

### Pager dots

- **Portrait:** a 56px band at the bottom, three equal thirds (130×56 each), 9px square +
  mono 10px label `TIMER · LIVE · GRID`.
- **Landscape:** a 56px rail on the **right edge**, three 56×56 targets, labels `TMR · LIVE ·
  GRID`. Right edge because mount cradles crop bottom-centre.
- **Labels stay.** Three unlabelled dots don't say what's behind them and a wet thumb
  shouldn't have to explore. This is the deliberate departure from ErgZone's bare dots.
- Swipe anywhere on the surface, 60px threshold, is the real navigation; the rail is
  confirmation and a fallback.

## 4 · Mid-session states

**Erg paused** (per James's call): the transport row's 52px is taken by a sunken status
block, `PAUSED · PULL TO RESUME` in mono 12/600, with a 64×44 accent-outlined `END` at its
right so ending stays possible while stopped. Same height, so nothing above shifts. The
interval clock greys but holds its last value; `NOW · /500M` goes to `—` with the caption
`NOT ROWING` — there is no current pace when nobody is pulling. Status word becomes
`PAUSED`.

**Connection lost:** no modal, ever — the rower is mid-piece.
- A sunken banner under a 2px ink top rule: `LOST THE MONITOR · RECONNECTING` plus one
  short line, "Keep rowing. The erg is still counting." **No staleness arithmetic** — a
  live "0:04 old" counter is one more number to read mid-piece and it tells the rower
  nothing actionable.
- **Sign of life instead:** three 8px squares at the banner's right advance 1/s, the same
  idiom the scanning state uses. It says "still trying" without quantifying anything.
- The connection square goes **hollow**; the caption becomes `PM5 430123456 · TRYING`.
- Every stale value greys to `--ink-3` and its card moves to the sunken fill. Hero labels
  change `NOW` → `LAST`. Targets stay accent — they never went stale.
- **Reconnected:** a solid ink banner `RECONNECTED · CAUGHT UP` for 3 s, then it's gone.
  The grid backfills missed intervals from the monitor's own memory.

**No HR monitor:** the column and the card never leave. Value `—`, the card's border goes
**dashed** (the app's "nothing here yet" idiom), caption `NO HR MONITOR`. Grid cells show
`—` with no per-row caption — the pane-level card explains once. Deliberately not "belt":
straps, armbands and watches all land in the same cell. If a monitor appears mid-session
the dash becomes a number with no announcement.

## 5 · Diagnostics

**Triple-tap any pager dot** (James's pick). Three deliberate taps on a 56px target:
impossible mid-stroke, and no long-press timer to trip while steadying the phone. Opens
the existing SheetShell: `Connection log`, a mono 11px event list on `--surface`,
`214 EVENTS · SESSION 0:05:48` caption, then `COPY LOG` (level 3, solid ink — it acts
inside the sheet) and `Close` (level 2). Unpolished on purpose. Events carry a
session-relative timestamp, the state transition or ack, and raw codes where they exist.

## 6 · The log screen

Reused as-is per James: actuals arrive prefilled. Two constraints for the fill:

1. The locked paces panel keeps showing **the programmed targets** and gains the actual
   beside each: `1:00 @ 6K −2 · TARGET 2:00.0 · ROWED 1:59.4`. The target is what the
   session was, the actual is what happened; neither replaces the other.
2. `HELD / UNDER / OVER` arrives **preselected from the machine's numbers** but stays
   editable — the rower's judgement outranks the arithmetic.

---

## Rows for DEVIATIONS.md

0. **Target splits are ink on the connected panes**, though `--accent` still means
   "resolved split" everywhere else in the app (detail, confirm, builder, the phone timer).
   Reason: connected mode is the only surface where a target and a live actual sit
   side by side, and the actual owns colour there. Flagged so the divergence is deliberate
   rather than discovered.
1. **Status word in ink, not accent.** Connected mode shows `ROWING` / `PAUSED` in
   `--ink`; the shipped phone timer shows `RUNNING` in accent, which is a fifth accent
   meaning the UI-fix round didn't catch. Recommend the phone timer follow.
2. **Pane C scrolls in landscape** (rows only, header/caption/End pinned) — the one
   exception to "the connected surface never scrolls in landscape". 25 intervals cannot be
   compressed into 390px honestly, and the alternative was hiding rows.
3. **Two type colours take on a second, non-type meaning**: ochre = over, teal = under, on
   live actual values (cards and grid cells). Justified — off-target needed a
   signal that isn't accent (accent is the target itself), and borrowing two palette
   colours as hairline+text beats inventing a red/green pair the system doesn't own. Risk
   named: on the Plan and Library screens those same hexes still mean AT and O2. They never
   co-occur with a live actual, and colour is not load-bearing alone — the static
   `TARGET nn` caption sits directly beneath every tinted value, so the comparison is
   always readable without colour.
4. **Pager dots carry text labels** — ErgZone's convention is bare dots. Discoverability
   beats purity on a surface used with wet hands.
5. **The interstitial has no spinner.** All progress is a three-line mono checklist. No
   indeterminate indicator exists anywhere in the phase.
6. **Level-1 buttons appear on two non-happy-path screens** (Try again; Show me the
   numbers). Both are the single primary action of their screen, so the one-per-screen rule
   holds.

## Open questions for the build session

1. Does the driver layer expose **projected finish split** per interval? If so it wants
   pane B's strip; it isn't designed in because I can't assume it.
2. On reconnect, can the monitor replay per-interval actuals for intervals completed while
   we were disconnected? The grid backfill assumes yes; if not, those rows need a
   `— · MISSED` treatment and I'll design it.
3. **Distance intervals with a rate cap**: does the programmed frame carry both, or does
   the monitor drop the rate? Pane A's rate delta chip assumes both survive.

## Files

- `Ergomatic connected mode.dc.html` — all frames (+ `support.js` beside it).
- `original-packet.md` — the incoming packet, unchanged.
