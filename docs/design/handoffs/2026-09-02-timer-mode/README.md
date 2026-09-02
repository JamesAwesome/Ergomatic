# Handoff: Timer mode, both ways up — plus three free-row copy notes

**Origin:** James's phone findings on build 823 (2026-09-02, "Timer mode is
really fucked up": END differs between orientations; a giant gap at the
bottom) and the three copy notes batched at #268's and #272's PM gates.
**Status: IMPLEMENTED (2026-09-02) — Gate 0 PASSED on rev 1c ("Approved",
James). Captures re-taken in `docs/screenshots/`: `timer`,
`timer-landscape`, `justrow-timer`, `justrow-timer-landscape`,
`justrow-door`, `justrow-log-timer`, `justrow-history-chip`; each opened
and compared to its board (the PR's Record block has the by-eye notes).
One departure from the boards' own prose, not from the boards: the
landscape band was never the rows failing to grow (row 4 was already
`1fr`) — it was the grid's `min-height` stopping 70 px short of the frame
plus the shell's reserved tab-bar strip, so the fix is the frame, and the
grid keeps its seven rows with a third, 200 px control column so ◀ ▶ sit
under Pause beside TOTAL LEFT as `ProgrammedLandscape.dc.html` draws.**

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
| `Door.dc.html` | `2-justrow-door-portrait.png` | Band copy is James's own line (rev 1c) — the door says what it is, the buttons say how: "Start a free row session." |
| `History.dc.html` | `6-history-timeonly-portrait.png` | A row with neither an average nor a distance gets `TIME 12:34` under its name (the detail's own label); every other row unchanged. |
| `LogDoorNoPlan.dc.html` | `5-justrow-log-noplan-portrait.png` | With no plan the lone button reads `Save` — on this door AND the programmed summary door; `Save without logging` survives only beneath `Log against plan`. |

## Contrast (computed, AA floor 4.5:1)

accent on page (END box text + border) 5.35 · ink on surface (Pause,
arrows) 17.11 · ink-3 on page (labels, the TIME line) 6.69 · on-color on
accent (Save) 5.94 · ink-2 on sunken (band) 9.16. Targets: END 44 px,
Pause 56, arrows 52, buttons 52–56.

## Desk walk 1 (James, 2026-09-02, build 834) and the research it demanded

Two photos (`Photo on 9-2-26 at 5.41 PM` / `5.42 PM`, on James's desktop):
in landscape the END box sat under the display's rounded corner on both
sides and under the sensor housing on the notch side — "the end button is
partially obscured, and the notch is in the way." Cause: the landscape
`.timer-screen` padded top/right/bottom with the safe-area insets and the
LEFT with a hard 0 so the gutter could "reach the physical edge"; the
gutter's controls went with it.

**Research (RF18 first: `docs/history/phase-cr2.md` already carried it):**

- PRIMARY — Apple HIG, Layout: *"Safe areas are essential for avoiding a
  device's interactive and display features, like Dynamic Island on iPhone"*
  and *"…accommodating the corner radius, sensor housing, and features like
  Dynamic Island."*
- PRIMARY — WebKit, "Designing Websites for iPhone X" (webkit.org/blog/7929):
  *"In landscape, when `env(safe-area-inset-left)` is larger due to the
  sensor housing, the `max()` function will resolve to that size instead."*
- SECONDARY (this repo's transcription of Apple Tech Talk 801, Phase CR2):
  *"Apple states the landscape side inset protects the sensor housing AND
  the display's rounded corners, and says to inset controls to avoid both."*
  Corollary measured there: the inset ≈ the corner radius, so the corner,
  not the camera, sets the floor — on BOTH sides.

**Fix (the connected surface's own rule, mirrored):** the landscape frame
defines `--edge-inset: max(env(safe-area-inset-left), env(safe-area-inset-right))`,
the gutter column is `calc(44px + var(--edge-inset))` with its controls
padded inside the inset (background still to the edge), and the right
padding takes the same inset. Structural test pins all three declarations;
Chromium reports zero insets, so the geometry proof is the desk walk, not
an e2e.

## Not changed

Every other string and slot on the timer; the connected surface; the
programmed summary door beyond its no-plan button label.
