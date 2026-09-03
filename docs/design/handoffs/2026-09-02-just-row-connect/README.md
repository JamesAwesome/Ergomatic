# Handoff: connect puts the erg into a Just Row session

**Origin:** Phase JR follow-on item 2 (walk finding 2026-09-01: "the erg
stays on the main menu, so it looks like the connection did nothing";
re-confirmed by James 2026-09-02). **Status: GATE 0 PASSED — James, 2026-09-02, on rev 1c ("first stroke", his line; "approved"). IMPLEMENTED (PR #278, 2026-09-02): `app/src/justrow/JustRow.tsx` ships copy A verbatim on the shipped interstitial's `.connected-body-line`; the walk leg (spec exit criterion 5, with its control) is owed.** Spec: `docs/superpowers/specs/2026-09-02-just-row-connect-programs-design.md`.

## Rev 2 amendment (after the antagonist pass, 2026-09-02)

The readback verification behind copy B was falsified (the "verified"
readback is the PM5's own idle default), so there is no branch: **copy A
is the only copy**, and it is true whether or not the program landed.
`Unverified.dc.html` is kept as the approved artifact but is retired —
the shipped `Nothing is programmed…` line goes, because once the app
sends the frame it is false.

## The two boards

Both are the shipped Ready frame (`docs/screenshots/justrow-ready.png`)
with ONE line changed or kept:

| Board | Copy | When |
| --- | --- | --- |
| `Main.dc.html` (A) | `The clock starts on your first stroke.` | the PM5's readback confirms the program (workout type 1, WAITTOBEGIN) |
| `Unverified.dc.html` (B) | the shipped line: `Nothing is programmed. The monitor keeps its own time, and the clock starts on your first stroke.` | not answered yet, or the machine did not take it — still true, since pulling from the menu enters Just Row by itself |

The real change is on the erg (its Just Row screen instead of the main
menu); the walk leg photographs it beside copy A.

## Contrast (computed, AA floor 4.5:1)

ink-2 on page (body line) 9.74 · marker on sunken (strip) 5.50 · ink on
page 15.41 · on-color on accent 5.94.
