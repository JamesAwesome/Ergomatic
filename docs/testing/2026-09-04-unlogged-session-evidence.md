# Unlogged session recovery evidence — 2026-09-04

The connected browser journey drives a real fake transport through five 100 m
distance intervals with six-second positive rests (`w 100m max r0.1` ×5), five
resting-state boundaries, `WORKOUTEND`, and the scripted summary burst. It
retains `endedBy: "finished"`, work totals 110 s/500 m, interval actuals
20/21/22/23/24 s at 100 m, and each boundary's independent 6 s/12 m rest
payload. It leaves via Today, cold-reloads, enters another workout's Connect
warning, Views without changing the retained storage bytes, then reviews and
saves the selected PM5 recording.

The first Save has the real series-sacrifice ordering: POST with series → 500,
POST without series → 500. No history row or retirement occurs. An explicit
second Save sends the third POST, creates history with the original five
actuals, and retires the selected record; another Connect then has no warning.
No POST occurs on Review entry.

`RC-8` remains a known fake-encoder limitation, not a regression found here:
for a five-interval zero-rest fixture `fake.ts` encodes boundaries with
`toMachineIndex(..., "rowing")` while `toActualIndex` unconditionally subtracts
one, yielding `[0,0,1,2,3]` plus a synthesized fifth actual. The recovery test
therefore uses the supported positive-rest boundary path and retains its
literal `[0,1,2,3,4]` oracle. RC-8 owns the follow-up.

Rendered registrations sweep a retained PM5 row in 390×844 and 844×390 with a
long title, tap targets ≥44 px, zero axe WCAG 2A/2AA violations, no horizontal
overflow, and a failed-library-fetch state that leaves Review & save visible.
They also cover missing type selection, read-only legacy Copy/Keep, and
unavailable recording disposition. Captures: `recovery-today-portrait.png`,
`recovery-today-landscape.png`, and `recovery-review.png`. All were opened:
the title wraps without clipping in both Today orientations; landscape keeps
the row above the rail; review continues below the viewport normally. Measured
ink `rgb(27,26,23)` on page `rgb(244,241,232)` is 15.41:1.

Native acceptance is pending the approved phone walk at
`docs/testing/2026-09-04-unlogged-session-phone-walk.md`; browser evidence does
not replace it.
