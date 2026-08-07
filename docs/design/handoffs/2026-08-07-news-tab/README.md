# Ergomatic — News tab, Today onboarding, You + Trend

**Date:** 7 Aug 2026
**Source file:** `News tab.dc.html` — open it in a browser (`support.js` and `image-slot.js` sit alongside it and must stay in the same folder). Turn 2 at the top is current; turn 1 below it is superseded and kept for history.
**Screens:** 2a News · 2b Today, no baselines · 2c You with Trend folded in · 2e You › Learning the app · 2d tab bar and rules

---

## What this covers

A reading and orientation surface called **News**, the new-rower teaching flow moved onto **Today**, and the **You** tab with Trend folded into it. It does not change any workout, builder, or connected-mode screen.

---

## Decisions

### 1. News is separate from Today, and is called News

Home was the working name for one turn. It is now **News**, because the tab holds articles, explainers and release notes, not a dashboard. Today keeps every workout card and stays the first tab.

### 2. News never starts a row

There is no level-1 button anywhere on News. Nothing on the tab begins a piece, so the accent is reserved for unread squares, durations, and text links. Today keeps the only START in the app.

### 3. Pinned Stories

A bordered block above LATEST that does not scroll away with the feed. Two kinds of thing get pinned:

- **The workout-type explainers** — permanently. The row carries O2 / AT / TR / AN chips so the type vocabulary is visible from the tab itself.
- **Start here** — appears the moment it is dismissed on Today, showing its read progress (`1 OF 4 READ · DISMISSED ON TODAY`).

Pinned stories still carry their unread square. Pinning is an editorial capability, not a per-user one, apart from Start here.

### 4. First-party and linked content are visually distinct

- First-party: `ERGOMATIC · 3 MIN`.
- Linked: an `↗` on the headline, our commentary in italic Newsreader, and a source line ending `OPENS YOUR BROWSER`.

Linked stories open in the system browser. First-party stories open the in-app reader (turn 1 `1c` still documents that screen; its typography is unchanged).

### 5. Reading state is unread dots only

A filled accent square means unread; a page-coloured square holds the indent for read items, whose title drops to 400 weight and grey. No resume position, no series progress, no percentage.

### 6. Teaching moved to Today

`START HERE` is a dismissible four-step block at the top of Today, with a 44px DISMISS target in its header. Read steps go grey and lose their unread square.

Until a baseline exists, Today's card is **SUGGESTED · SETS YOUR BASELINE** — 6k by default, with `2K INSTEAD` as a secondary button. The baseline chip is dashed and reads `6K BASELINE · NOT SET`. Today keeps suggesting one of these until a baseline is set, then returns to suggesting real workouts.

### 7. Resetting the tutorial lives in You

`Learning the app` is a settings row on You carrying `START HERE · 1 OF 4`, opening the detail screen in 2e. Two controls there:

- **PUT IT BACK ON TODAY** — restores the block, keeps read state.
- **MARK ALL FOUR UNREAD** — also clears read state, so it starts at step one.

### 8. Five tabs; Trend folds into You

`TODAY · NEWS · LIBRARY · PLAN · YOU` at 78px each, labels at 10px / 0.12em tracking. Six tabs was drawn and rejected: 65px targets still clear the 44px minimum, but labels fall to 9px and lose their tracking.

Trend's content sits under a TREND heading at the top of You, above baselines. Charts are shown in place, not behind an "all charts" link.

### 9. Trend charts on You

Three, in order:

1. **Metres per week** — eight bars, current week in black, others in `#c9c3b2`.
2. **O2 pace per session** — line against a dashed 6k target, latest session dotted in accent, delta shown in O2 teal (`−3.1S / 8W`).
3. **Time by type** — single stacked bar using the workout-type colours, with a percentage legend.

The type colours match the connected-mode screens: O2 `#2a6275`, AT `#8a5f18`, TR and AN in neutrals.

---

## Colour and type, unchanged from the existing system

| Token | Value | Use |
| --- | --- | --- |
| Page | `#f4f1e8` | Tab background |
| Card | `#fffdf7` | Raised cards, pinned block |
| Inset | `#eae5d8` | Start here block, release notes |
| Ink | `#1b1a17` | Text, rules, current-week bar |
| Secondary ink | `#57544c` | Mono labels, read titles |
| Accent | `#b5341f` | Unread square, duration, START, links |
| Hairline | `#d8d3c4` | Row dividers |
| Dashed | `#c9c3b2` | Means "nothing here yet" |

Newsreader for page titles and article headlines, Archivo for UI and body, IBM Plex Mono for labels and all numbers. Teal and ochre never appear on News, so they keep meaning O2 and AT.

---

## Not built, and fabricated

- **Collections do not exist.** The collection card in 2a is a placeholder for a future state and should not block the News build. The photo is a drop slot.
- **You is partly invented.** The profile card and the baseline steppers follow the built screen. The Trend block is a sketch of the fold, not a chart spec — bar counts, date ranges and the delta figure are all sample data. The settings rows below `Learning the app` are filler; check them against the shipped screen.
- All sample metrics (41.2K, 2:04.8, 118 rows, 14:22) are illustrative.

---

## Open questions

1. **Chart specs.** The three Trend charts need real ranges, bucketing and empty states. What does each look like with two sessions of history?
2. **Pinned capacity.** How many pinned stories before the block needs its own screen? Three is comfortable; five would push LATEST below the fold.
3. **Baseline suggestion order.** Today defaults to 6k with 2k secondary. Should a rower who has set 2k but not 6k see the reverse?
4. **Editorial cadence.** Release notes are pinned to a version. Is WHAT'S NEW every release, or only ones with a visible change?
