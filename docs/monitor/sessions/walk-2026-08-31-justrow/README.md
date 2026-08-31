# Walk 2026-08-31 — Phase JR PR 0b, the Just Row capture

The first genuinely unprogrammed Just Row capture this project owns. Every
prior recording in `docs/monitor/sessions/` is a programmed workout, which is
why OPEN 1-7 could not be settled from the corpus.

## Scope of the clearance

**This PM5, these runs.** Serial **432331249** (BLE name `PM5 432331249 Row`).
**Firmware version was not captured** — no menu shot was taken, so nothing here
is a firmware-general claim. Two recordings, one operator observation, one
session. Where a finding contradicts a spec premise, it falsifies the premise
for this device and run; it does not establish universal PM5 behaviour.

Medium: laptop Chrome 151, Web Bluetooth, observe-only screen at
`/justrow/observe`, branch `justrow-pr0a-observer` at `8979a10c`. Recording
header reports `app: dev`, `transport: web`. No heart-rate belt (all HR fields
read zero, as expected).

## Provenance

| Piece | File | Spans | What it was |
| --- | --- | --- | --- |
| 1 | `just-row-pm5-recording-1788214688045.jsonl.gz` | 704 s | ~6.5 min Just Row, deliberate 30 s stop mid-row, ended by Menu, held connected ~90 s after |
| 2 | `waiting-pm5-recording-1788215898273.jsonl.gz` | 979 s | ~64 s Just Row, then left completely untouched for ~15 min |
| 3 | *(no recording — the connection could not be made)* | — | Attempt to connect while a Just Row was already open |

Frames received, by characteristic:

| Piece | 0x0031 | 0x0032 | 0x0033 | 0x0037 | 0x0038 | 0x0039 | 0x003A | 0x003F |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 701 | 699 | 699 | 2 | 2 | 1 | 1 | 1 |
| 2 | 959 | 959 | 959 | 0 | 0 | 0 | 0 | 0 |

## The OPEN questions, answered

**1. Do 0x0031's elapsed and distance RESET at a Just Row auto-split? NO.**
They are row-cumulative and run straight through the boundary. The first
auto-split fired at wall 517.8 s with the frame reading elapsed 302.09 s /
1074.0 m, and the very next status frames continue climbing — 353.07 s /
1257.5 m at wall 569.0 s, ending at 393.58 s / 1396.6 m. No non-monotonic step
occurs anywhere inside the row; the only two in the whole capture are the
pre-row zero and the post-Menu return to the idle screen. **A thirty-minute
free row will store as thirty minutes.** This was the question blocking PR 2's
two headline numbers.

**2. Do the auto-splits fire live on 0x0037/0x0038? YES**, twice, each paired
with its 0x0038 in the same millisecond.

| Split | Wall | Frame elapsed / distance | Split's own time / distance |
| --- | --- | --- | --- |
| 1 | 517.8 s | 302.09 s / 1074.0 m | 300.0 s / 1074 m |
| 2 (Menu end) | 612.9 s | 393.58 s / 1396.6 m | 93.6 s / 323 m |

The split's own fields are **per-split**; the frame's own elapsed and distance
are **cumulative**. The two split times sum to 393.6 s and the two split
distances to 1397 m, against a row of 393.58 s / 1396.6 m.

**3. What does the clock do through a pause, and is there an idle
auto-terminate? The clock HOLDS; there is NO auto-terminate while connected.**

Piece 1's deliberate stop froze elapsed at 185.81 s and distance at 656.7 m
across ~50 s of wall time, with `workoutState = 1` and `rowingState = 0`
throughout. **Elapsed is rowing time, not wall time.**

Piece 2 is the stronger half and it is a negative result. After the rower
stopped at 81.9 s, the PM5 held `workoutState = 1` — an *active* workout — for
the remaining ~897 seconds, streaming status frames continuously to the end of
the capture. No 0x0037, no 0x0039, no terminate, no power-off. Elapsed stayed
at 64.45 s and distance at 222.8 m. **The spec's 220 s timeout premise is not
supported on this device while a central is connected.** See finding N2.

SCREEN corroboration (operator report, CORRELATED not same-frame): the PM5's
display showed those same frozen numbers throughout, matching the wire.

**4. Does a Menu end emit 0x0039? YES** — 0x0039 and 0x003A both arrived
0.4 s after the terminate, along with a 0x003F. Decoded 0x0039:

| Field | Value |
| --- | --- |
| Elapsed | 393.60 s |
| Distance | 1396.0 m |
| Average stroke rate | 25 |
| Heart rate fields | all 0 (no belt) |
| Drag factor | 101 |
| Average pace | 140.9 s |

**This retires the spec's "0x0039 has appeared in zero of our captures" claim.**

**5. Does pulling from the main menu auto-enter Just Row with the app
connected? YES.** OPERATOR OBSERVATION (James, at the erg): the pull dropped
straight into Just Row with no menu navigation.

**6. Does the post-terminate cycle produce sequences that could re-trip a
motion detector? NO.** The whole workout-state trace for piece 1 is
`0 → 1 (110.7 s) → 11 (612.9 s) → 0 (614.2 s)`, with state 11 lasting two
frames. There is no Terminate → Rearm → WaitToBegin churn to guard against on
this closer.

**7. Can a real Just Row reach the `finished`-mapped state 12? NOT on a Menu
end.** Only states 0, 1 and 11 were observed across 1660 status frames. The
idle closer could not be tested because the idle closer does not occur (see 3).

## New findings the OPEN list did not anticipate

**N1 — The PM5 does not advertise while a Just Row is open, so a mid-row
connect is impossible.** OPERATOR OBSERVATION, isolated by a deliberate
discriminating test: with a Just Row open the monitor did not appear in
Chrome's chooser; pressing Menu to return to the main menu made it appear
immediately, with nothing else changed.

This falsifies a spec design statement directly. The Live-surface section says
*"If the rower is already mid-Just-Row at connect, frames show motion
immediately: straight to Live with the machine's accumulated numbers."* That
path is unreachable on this device: our transport's `connect(id)` only accepts
an id its own `scan()` returned, so every connection requires discovery, and
discovery fails mid-row.

**The same fact bites the recovery story.** The End-semantics section promises
that a mid-row link drop persists a recoverable run and Today offers recovery.
Recovery *by reconnecting* cannot happen while the row is still open — the
rower must first end the row on the monitor. PR 2 either designs for that or
says plainly that a dropped link ends the app's involvement in that row.

**N2 — A free row nobody ends never closes on the wire.** Following from 3: if
the rower walks away, the workout stays `workoutState = 1` indefinitely with
the app connected and frames still arriving. PR 2 cannot rely on the machine to
close the record and needs its own inactivity rule, or a Just Row session will
stay open forever. The spec's proposed new `ended_by: "idle"` member describes
an event this walk could not produce.

**N3 — 0x003F was observed.** `domain/monitor/pm5/uuids.ts` records that this
characteristic "has never been recorded — whether 0x003F can even exist on
this" device. One arrived with the end-of-workout pair in piece 1. That comment
should be reconciled.

**N4 — Status frames arrive at 1.00/s, not the ~2.2/s this repo's tooling
assumes.** Median inter-arrival 990 ms, max 1282 ms, consistent across both
captures (701 frames / 704 s and 959 / 965 s). This is our own sample-rate
write at connect, not a monitor fault, but any PR 2 live surface is budgeting
against 1 Hz.

## Cross-check against the machine's own record

Our transcription of the live stream versus the summary the PM5 filed for
itself — two different code paths on the monitor, and 0x0039 is the record that
corresponds to a logbook entry:

| Source | Elapsed | Distance |
| --- | --- | --- |
| Final live 0x0031 while active | 393.58 s | 1396.6 m |
| Machine's own 0x0039 summary | 393.60 s | 1396.0 m |
| Delta | 0.02 s | 0.6 m |

This is a TRANSCRIPTION check, not a definition check — the observer computes
nothing, so agreement proves we read the wire correctly and says nothing about
whether a derived figure would be right. That limit is the spec's own B11
ruling and it still holds.

## Instrument notes

This was the first time `/justrow/observe` ran against real hardware; every
gate before it used the fake transport. It connected on the first attempt,
never programmed the erg, and the on-screen capture counter reached 177 events
while the monitor sat at its main menu — which is what cleared the walk to
start. The counter and the Download control both behaved as designed across
three connect/disconnect cycles.

One copy wart to fix: the heading renders `PM5 432331249 Row connected`,
because the PM5's advertised BLE name already ends in the word "Row". Reads
awkwardly. Worth trimming a trailing " Row" from the displayed device name, or
rephrasing the heading.
