# Gate 0B — board 2: what the trace chart's x axis IS (M3, M6, M9)

**The decision:** the chart under `MACHINE CONFIRMED · WORK ONLY` draws an
axis with no name and no fixed meaning. This board draws the three
candidates the spec names, against three real captures, and measures them.

Rendered 2026-09-18 in Chromium against this worktree's compose stack at
390x844 portrait and 844x390 landscape, by `app/e2e/gate0b-board2.spec.ts`.
Every fixture is a **stored series produced from a committed wire capture
through the shipped recorder** — never hand-built (`fixtures/README.md`).

---

## 1. What today's chart does, on three real rows

### Three equal rests draw three different widths (M6)

`walk-2026-08-16/session-2-wu-4unequal.jsonl` — five intervals, and the
machine's own `restSeconds` for each is **30, 30, 30**. Today's bands, in
SVG units off the rendered DOM (`frames/geometry-portrait.json`):

| rest | programmed | on the axis | band drawn |
| --- | --- | --- | --- |
| 1 | 30 s | 7.5 s | **5.75 u** |
| 2 | 30 s | 6.7 s | **5.21 u** |
| 3 | 30 s | 3.0 s | **2.71 u** |

Three identical rests, and the last draws at **47 % of the first**. This is
James's own 2026-08-31 complaint reproduced from a capture rather than from
memory. A second capture says the same thing at a different scale:
`walk-2026-08-25`'s two equal 60 s rests draw **39.05 u** and **42.71 u**,
and only **48.1 s** and **52.7 s** of a programmed 120 s reach the axis at
all.

`frames/equal-rests-today-*.png`

### A minute of standing still draws as a minute at 2:16 (M3, NEW)

`walk-2026-09-15-work-clock` — the walk that answered the freeze question
also produced this, and it is the number board 2 did not have:

| | |
| --- | --- |
| The stored row says | **2:09.2 work · 250 m** → a split of **4:18.4/500m** |
| The rower actually pulled | about 68.7 s for 250 m → about **2:17** |
| What the chart draws across the stop | **60.5 s of flat line at 2:16.0, at 26 spm** |

The monitor holds its last pace and its last stroke rate for the whole
stop, its distance frozen at 51.7 m and its clock running. So the chart
does not merely fail to show the stop — **it asserts the rower was pulling
2:16 at 26 spm for a minute while they stood still**, directly under a
header saying 4:18. Two numbers about one minute, two minutes per 500 m
apart, and nothing on the screen relates them.

`frames/mid-stop-today-portrait-in-context.png`

### A free row's 104 s pause leaves no trace at all (M9)

`walk-2026-08-31-justrow`, replayed through the real producer
(`beginFreeRow`): the row ran **499.5 s at the erg** against **393.6 s** of
monitor elapsed. The pause's entire footprint in the stored series is a
**1.8 s gap** between two consecutive samples at t = 185.7 — inside the
ordinary jitter (other captures show 2.1 s and 2.4 s gaps with nobody
stopping). The longest flat-distance run in the file is **0.00 s**.

**It is not recoverable.** The clock froze, so no samples exist for the
pause, and the stored log has no start time to difference against
(`server/db/schema.ts:439` — `session_logs` carries `completed_at` and
nothing to pair it with).

`frames/free-row-today-portrait-in-context.png`

---

## 2. The three candidates, rendered

All measured on the three-equal-rests capture, portrait, off the rendered
DOM:

| candidate | axis | rests drawn | domain | line |
| --- | --- | --- | --- | --- |
| **today** | conditional on what the rower did | **5.75 / 5.21 / 2.71 u** | 419.5 s | 2 segments |
| **A · work only, named** | work clock | **none — rests vanish** | 397.8 s | 2 segments |
| **B · time at the erg** | work + the machine's rest | **17.47 / 17.47 / 17.47 u** | 487.8 s | 4 segments |
| **C · work only + breaks** | work clock, each rest a fixed break printing its own seconds | **9.04 / 9.04 / 9.04 u** | 439.8 s | 4 segments |

- **A** fixes M3 (the axis has a name) and answers M6 by deletion: there is
  no band whose width could mislead, because there is no band. A rower who
  rested loses every sign that they did.
- **B** fixes both, and its bands are equal because they are drawn from the
  machine's own `restSeconds`, not from the readings. Two costs, both
  measured: the line **breaks at every rest** (4 segments, not 2) because
  we have no readings for the part of the rest the rower sat still; and
  `restSeconds` is a **readback, not a measurement** —
  `domain/monitor/types.ts:345` requires every comment about it to say so,
  and its arithmetic has been corroborated on exactly one capture
  (wall 374.76 s against work 254.8 + rest 120).
- **C** fixes both and asserts nothing about time during a rest. The break
  is a fixed width by construction, so it cannot mislead at any rest
  length, and the number printed in it is a fact about the program.

`frames/equal-rests-{today,work,wall,breaks}-{portrait,landscape}.png`

### C's mark had to be redrawn, and here is the receipt

C's first treatment was a 25 %-opacity wash. Measured from the live
cascade, that wash is **1.36:1** against the page — WCAG 1.4.11 asks
**3:1** for a graphical object you need in order to read the chart. Raising
the wash to clear 3:1 needs 0.793 opacity, which is the full-height
fill James rejected in the trace design's round 2 ("something is blocking
the data").

So C is drawn a second way — **two full-strength rules with the number
between them**, measured **4.25:1**. Same for the stop mark below.

| pairing | wash | rules | AA |
| --- | --- | --- | --- |
| break mark vs page | **1.36:1** | **4.25:1** | 3:1 (1.4.11) |
| break label `30s` | 11.34:1 | 15.41:1 | 4.5:1 |
| stop mark vs page | **1.30:1** | **6.69:1** | 3:1 (1.4.11) |
| stop label | 11.83:1 | 15.41:1 | 4.5:1 |
| axis legend line | 6.69:1 | — | 4.5:1 |
| y and x ticks, the line itself | 15.41:1 | — | 4.5:1 / 3:1 |

`frames/contrast.json`, `frames/equal-rests-breaks-rules-*.png`

---

## 3. What NONE of the three fixes

**Every candidate is byte-identical on the two stops.** Measured, not
asserted — same domain, same one polyline, same ticks on all four axes for
both the mid-interval stop and the free row
(`frames/geometry-portrait.json`).

The three candidates are about **rest**. Neither stop is a rest: the
mid-interval one happens inside a work interval, and a free row has no rests
to have. **Choosing an axis does not touch either.**

### The separable proposal: mark a span where the distance stood still

The mid-interval stop IS recoverable from the series — 60.5 s of samples
whose distance does not move while the clock does. A threshold of **5 s**
sits above every non-stop flat run this repo has measured (4 s across
staging; 3.0 s, 1.0 s and 0.00 s on the three committed captures here) and
below the one real stop at 60.5 s.

Drawn, it reads `STOPPED 61s` across the flat minute
(`frames/mid-stop-today-stopmark-rules-portrait-in-context.png`).

**And it cannot fire on the free row** — captured, not argued: the same
build with the same threshold marks nothing on the 08-31 capture
(`frames/free-row-today-stopmark-portrait.png`, `stops: []` in the
geometry). That is the honest limit of what the series can carry.

One refinement the capture forced: the first version also marked the **5.1 s
tail** after the rower pressed END, where every sample is a `p === 0`
sentinel. A stop now counts only if a real reading follows it.

---

## 4. A correction this board owes the spec

**M9 cannot be answered in PR 3.** The spec puts M3, M6 and M9 together in
PR 3 on the grounds that PR 3 changes "what an axis IS" with "no stored
data". M3 and M6 hold. M9 does not: the free row's pause is not in the
series, and the wall duration that would name it is not in the database —
`session_logs` stores `completed_at` alone. Saying "the monitor counted
6:34 of an 8:20 session" needs a stored start, which is a **stored shape**,
which is **TRIAD**.

So M9 is either (a) moved to PR 4 with the rest of the stored-shape work,
or (b) narrowed in PR 3 to what is true without new storage — which is the
stop mark above, and which is silent about free rows.

---

## The questions

**Which axis does the trace chart draw?**

Today's is conditional on what the rower did during rests, which is why
three identical 30 s rests drew 5.75, 5.21 and 2.71 units. A names the
quantity and drops the rests entirely; B shows the rests at their true
length and breaks the line across them, resting on a field the repo
requires us to call a readback; C shows each rest as a fixed break printing
its own seconds and asserts nothing about time inside it.

**Recommendation: C, in the rules treatment.** It is the only candidate
that fixes M6 completely and is immune to what the field does or does not
mean — the break is a separator, the number is a fact about the program —
and it is the only one whose mark clears WCAG 1.4.11 without the full-height
fill you rejected in round 2.

**Does the stopped-span mark ship, and in which treatment?**

It is separable from the axis and fixes the case that actually costs a
rower a number — the 4:18 row that was pulled at 2:17. It cannot fire on a
free row, so it is not an answer to M9, only to the programmed half. The
wash reads softer and measures 1.30:1; the rules treatment measures 6.69:1.

**Recommendation: ship it, rules treatment**, and move M9 to PR 4 rather
than let PR 3 claim an answer it does not have.
