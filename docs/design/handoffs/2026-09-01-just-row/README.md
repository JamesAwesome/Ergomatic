# Handoff: Just Row (Phase JR PR 2)

**Origin:** Gate 0 for Phase JR PR 2 — the surface, the session and the
workout-less log door. James approves the RENDERED screens (real
proportions, both orientations, every colour pairing's contrast ratio
computed and stated) before any implementation task starts.

**Status: GATE 0 PASSED — James, 2026-09-01, on rev 3 of the board.** The
board is final and gate-approved. Board history: rev 1, rev 2 after James's
direction (below), rev 3 after a comparison against
`connected-pane-live.png` and `connected-pane-live-landscape.png` restored
the band, the AVG cell and the shipped vertical rhythm.

**Amendment (James, at approval), and where it landed:** the link-lost
action was to read `Log`, then `Save this row`, with the stated requirement
"consistent with what you see if you lost a non just-row session mid-row".
Checked against `connected-ready-lost.png`: **a programmed session that
loses the link carries no Log or Save button at all.** The mark goes hollow,
the device line gains `· LOST`, and `END` is still the way out, through the
ordinary ending into the log door. So the button is **removed** rather than
relabelled, and `END` stays in the header — consistency here means having no
extra action, not a better-worded one.

**Two questions were rendered as proposals and are approved as rendered:**
`Free` mirrored onto the split's target slot, and Ready keeping both of its
inherited buttons rather than advancing on the first stroke.

Spec: `docs/superpowers/specs/2026-08-24-just-row-design.md` (rev 4).
Design reference: `docs/design/` tokens and conventions; 44px hit targets
and WCAG AA are hard requirements; house style: no em-dashes in
user-facing copy.

## James's direction (2026-09-01) — rev 2 of this board

Rev 1 proposed a persistent full-width Just Row row on Today and a bespoke
`/justrow` live surface. Both are superseded:

1. **"Just Row" is a button in the top right that only says "Just Row".**
   No sub-line, no card, no full-width row.
2. **Clicking it leads to Connect, almost as though it were a normal
   workout.** So `/justrow` is a workout-detail-shaped door whose one
   action is the same Connect control `WorkoutDetail` carries.
3. **Reuse the standard connected interface** for the live row. There is no
   `JustRowSurface`.
4. **A single bar up top with total meters next to it.**
5. **Show "Free" for rate / spm.**
6. **In the log, "Actual Pain" is just "Pain".**

## About the design files

`just-row-state-board.html` is a **design reference created in HTML** — a
rendered state board, not production code. Every artboard is drawn from the
real `app/src/index.css` and `app/src/theme/tokens.css` values, not from
the screenshots.

| Artboard | What it settles |
| --- | --- |
| `Main` | The Today button, top right |
| `JustRowDoor` | `/justrow` — the Connect door |
| `Connecting` / `Ready` | The shipped interstitial, one word changed |
| `Live` / `LiveLandscape` | The standard surface, both orientations |
| `Ended` | The close hand-off (inherited unchanged) |
| `Lost` | A mid-row link drop |
| `TodayRecovery` | The workout-less recovery row, on a no-baseline rower |
| `LogDoor` | `/justrow/log` |

## What changes on the standard connected surface

Nothing outside this list:

1. **One bar**, not the interval bar's many segments, with total meters
   beside it in its shipped place (6px track, `--rule-2`, `--ink` fill,
   22px mono counter).
2. **"JUST ROW"** where a programmed row reads `2 OF 5 · WORK`.
3. **"Free" in both target slots.** James asked for rate/spm; the split is
   mirrored because one slot reading `Free` beside a blank one looks like a
   bug. **Open:** blank the split's slot instead?
4. **The AVG cell stays** where it already sits on the split's target row
   (`TGT · AVG` in the shipped layout). A free row genuinely has a running
   average, and it is the exact figure that gets stored.
5. **The band keeps one cell, `ELAPSED`.** `UP NEXT` goes (no next) and
   `EST LEFT` goes (the shipped `hasRemainingEstimate` guard already hides
   it whenever nothing ahead is priced, which for a free row is always) —
   but the slot earns its place: without it the surface never showed the
   rower the time at all, and elapsed is one of the two numbers this row
   stores.
6. **No `LIVE` / `GRID` control** (portrait footer, landscape top-left).
   The grid pane tabulates intervals and a free row has none; the PM's own
   5-minute auto-splits are out of scope for this phase.
7. **Split and rate stay ink**, never the judged blue: with no target,
   nothing can be faster or slower than anything.

The layout otherwise follows `connected-pane-live.png` and
`connected-pane-live-landscape.png` exactly: heroes and band flow down the
frame rather than sitting centred; in landscape the status word moves to
the right beside `END`, the heroes are a 62/38 split divided by a vertical
rule with no top rules, and the band closes under a horizontal one.

## Other decisions on the board

- **`/justrow` carries one action.** No Start Timer and no "log it after":
  ruling 2 makes this phase connected only. It uses the same
  `--action-connect` control and the same staged guard — not decoration,
  since opening a monitor session clears an unlogged phone-timer run and
  this door must warn about that exactly as `WorkoutDetail` does.
- **Ready changes one word**: `· CONNECTED`, not `· PROGRAMMED`. **Open:**
  both its buttons are inherited, but a free row has no armed workout to
  check, so it could advance itself on the first stroke and keep only
  Cancel.
- **Ended is inherited unchanged** ("Wrapping up / Your numbers are kept").
- **Link lost offers no action of its own** — `END` in the header, exactly
  as a programmed lost session does. No Reconnect either, and that one is
  hardware rather than a consistency choice: the monitor stops advertising
  while a Just Row is open, so the app cannot get back in until the rower
  ends the row on the erg. Whatever this screen offered could never be
  "resume".
- **The log door's primary reads `Save this row`, which is NEW copy.** The
  shipped door offers `Log against plan` and `Save without logging`, a
  choice about whether the session counts toward the plan. A free row can
  never count, so there is one path and no choice to name — and "Save
  without logging" on a screen whose job is logging would read as a
  contradiction.
- **The log door** drops "DID YOU HOLD THE TARGETS?" outright, renders no
  intervals table and no type chip (`steps: []`, `workout_type: null` —
  absences, not empty widgets, per exit criteria 2 and 3), and labels the
  rating **PAIN**: the word ACTUAL exists to contrast with the workout's
  own EXPECTED figure beside it, which a free row does not have.
- **The recovery row carries its numbers** so "Log it" visibly means "keep
  these", and says nothing that implies the row can be resumed.

## Contrast, computed

WCAG 2.x, AA floor 4.5:1, computed with the standard relative-luminance
formula over the token hexes rather than judged by eye.

| Pairing | Ratio |
| --- | --- |
| `--ink` #1b1a17 on page / surface / sunken | 15.41 / 17.11 / 14.50 |
| `--ink-2` #3f3c35 on page / surface / sunken | 9.74 / 10.81 / 9.16 |
| `--ink-3` #57544c on page / surface / sunken | 6.69 / 7.43 / 6.30 |
| `--accent` #b5341f on page / surface / sunken | 5.35 / 5.94 / 5.03 |
| `--action-connect` #2a6275 on page / surface | 5.99 / 6.65 |
| `--on-color` #fffdf7 on `--action-connect` (Connect) | 6.65 |
| `--on-color` on `--accent` (primary buttons) | 5.94 |
| `--marker` #7d5510 on sunken (ready band) | 5.50 |
| `--surface` on `--judge-slower` #962718 (lost banner) | 7.94 |

**Two that do not clear, and carry no text on this board:** `--ink-4`
#6f6a5f on sunken is **4.48:1**, short of the floor by 0.02, so it must
never carry text on a sunken surface; `--ink-5` #a09a8c on page is 2.48:1
and appears only as the dimmed link mark in `Lost`.

Every tap target is ≥44px: JUST ROW 44, Connect 56, "Show me the numbers"
56, Cancel 52, END 44, "Log it" 44, discard ✕ 44.

## The ended frame (Gate 0 amendment, APPROVED 2026-09-01)

Found by the antagonist pass on the plan, not by this board's first two
rounds. The board had approved this frame reading `Your numbers are kept.`,
which is what a **programmed** row renders. A free row does not reach that
arm.

`ConnectedSurface.tsx:503-511` picks the line with a five-way ternary on
`closeReason`, `kept` and `endedBy`, where `kept` is
`measuredIntervalCount(actuals)`. A free row has no intervals, so `kept` is
`0` and it lands on the `kept === 0` arm:

> **"No numbers to keep."**

...on a row that just banked real meters and is one navigation from a log
door showing them. The block's own comment already calls that string "the
only false member of the three" for the case it was written for.

**Approved replacement: `6:33 · 1,396 m kept.`** — the same words the lost
banner uses, so the two endings describe the row the same way.

**This frame sits ABOVE the surface model** and needs its own branch: the
ended block returns at `:515`, and `buildSurfaceModel` is not called until
`:575`, so no live-surface change can reach it.

The **lost banner needs no amendment** — this board already rendered
`6:33 · 1,396 m kept.` there. Only the code is wrong.

## Fidelity

**High fidelity. Gate 0 PASSED (James, 2026-09-01), including the ended-frame
amendment above.** Colors, type, spacing and copy are final: recreate
pixel-perfectly with the app's existing idioms, and do not rewrite the
rendered copy.
