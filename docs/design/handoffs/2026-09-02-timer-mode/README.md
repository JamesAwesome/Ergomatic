# Handoff: Timer mode, both ways up — plus three free-row copy notes

**Origin:** James's phone findings on build 823 (2026-09-02, "Timer mode is
really fucked up": END differs between orientations; a giant gap at the
bottom) and the three copy notes batched at #268's and #272's PM gates.
**Status: PRESENTED for Gate 0, 2026-09-02.**

## Mechanical ground

`mechanical-reference/` holds the shipped screens captured at the phone's
own CSS size (393×852 portrait, 852×393 landscape) through the real app:
a three-phase programmed timer and a free-row timer in both orientations,
the Just Row door, the no-plan Just Row log door, and a History with a
time-only row. Every board is one of those with the fewest changes.

| Board | Source | Change |
| --- | --- | --- |
| `Main.dc.html` programmed portrait | `1-programmed-timer-portrait.png` | END becomes the accent-outlined 44×44 box (index.css's landscape `.timer-end`, the connected surface's own End); the ◀ ▶ row leaves the bottom edge and sits under Pause. |
| `FreeRowPortrait.dc.html` | `3-justrow-timer-portrait.png` | Same two changes. |
| `ProgrammedLandscape.dc.html` | `1-programmed-timer-landscape.png` | Middle row grows to fill (`auto 1fr auto`), controls row on the bottom edge, face centred in the room it gains. END unchanged (it is the treatment portrait adopts). |
| `FreeRowLandscape.dc.html` | `3-justrow-timer-landscape.png` | Same fill rule. |
| `Door.dc.html` | `2-justrow-door-portrait.png` | Band copy names both buttons — the only invented sentence: "Connect: the monitor keeps time. Start Timer: the phone does." |
| `History.dc.html` | `6-history-timeonly-portrait.png` | A row with neither an average nor a distance gets `TIME 12:34` under its name (the detail's own label); every other row unchanged. |
| `LogDoorNoPlan.dc.html` | `5-justrow-log-noplan-portrait.png` | With no plan the lone button reads `Save` — on this door AND the programmed summary door; `Save without logging` survives only beneath `Log against plan`. |

## Contrast (computed, AA floor 4.5:1)

accent on page (END box text + border) 5.35 · ink on surface (Pause,
arrows) 17.11 · ink-3 on page (labels, the TIME line) 6.69 · on-color on
accent (Save) 5.94 · ink-2 on sunken (band) 9.16. Targets: END 44 px,
Pause 56, arrows 52, buttons 52–56.

## Not changed

Every other string and slot on the timer; the connected surface; the
programmed summary door beyond its no-plan button label.
