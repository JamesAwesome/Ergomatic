# RC-24 — the grid says a rest is running

## What and why

James, at the erg on 2026-08-26, after watching the grid's numbers move during
a rest: *"maybe we can figure out a way to indicate the person is in rest so
they arent worried the wrong numbers would be recorded."*

The grid's active row keeps rendering the interval's own time and metres from
live frames, and its `rest` cell shows only the **programmed** rest as a static
string. **Nothing on the grid says a rest is currently running.** So a rower
looking at the grid mid-rest sees their work interval's numbers moving and has
no way to read that as anything but their result being mis-measured.

The step line does say `N OF M · REST`. The grid header deliberately drops the
kind word (`surfaceModel.ts:406`), which is why the grid is where this bites.

**This is the other half of RC-23's ruling and the reason that ruling is safe.**
James considered locking the numbers at the work boundary and ruled against it:
the split arrives ~60 s later, so locking would mean showing an accumulator
value that can disagree with the split and then change under the rower's eye. A
row that is honestly still live beats a row that looks final and then moves.
**This change makes the honesty legible instead of ambiguous, and changes what
no number MEANS.**

## The wire supports it. Measured frame-by-frame, and it corrected me twice.

`0x0032` bytes 13-15 carry `restSeconds` at 0.01 s/lsb
(`app/domain/monitor/pm5/parse.ts:169`, `readU24LE(bytes, 13) / 100`), and it
**counts DOWN**. `0x0031` byte 8 carries `workoutState`; `3` is
`WORKOUTSTATE_INTERVALREST`, which `toMonitorState` maps to
`MonitorFrame.state === "resting"` (`parse.ts:547`). Both fields decoded
together, every frame, across BOTH real `r60` rests in
`docs/monitor/sessions/walk-2026-08-25/rests-finished-recording.jsonl.gz`
(the program is `w 1' r1 / w 500m r1 / w 1'`; script output reproduced from
`hex` in that recording, 1615 status frames).

**Rest 1 — the entry, where the two fields disagree:**

```
idx  t=       char  ws   restSeconds  restDistance
369  100.81   0032   4      60.00          0        <- still working
370  101.26   0031   3      60.00          0        <- RESTING flips HERE
371  101.27   0032   3      60.00          0
373  101.81   0032   3      60.00          2
375  102.26   0032   3      59.91          3        <- countdown starts HERE, +1.0s
```

**Rest 1 — the exit:**

```
603  160.21   0032   3       1.91        128
606  161.20   0031   5       1.91        129        <- work flips back on
607  161.20   0032   5      60.00          0        <- resets to the NEXT rest's 60
```

**Rest 2 — the exit, which falsified my own spec:**

```
1373 356.05   0032   3       1.91        142
1374 356.59   0031   4       1.91        142        <- work flips back on
1375 356.60   0032   4       0.00          0        <- resets to ZERO, not 60
```

**Four facts the design must respect. Two of them corrected revision 2.**

1. **`resting` leads the countdown by ~1 second (2-3 frames).** The state flips
   to `3` while `restSeconds` still reads a flat `60.00`, and only then does it
   begin ticking. **A naive `resting → render restSeconds` shows a FROZEN
   `1:00` for about a second at the top of every rest** — a small dose of the
   exact false-motion claim this change exists to prevent. Accepted, not
   ignored: a real clock also dwells on its first number for a second, and the
   dwell is bounded at ~1 s rather than the whole interval. Recorded so no
   later reader mistakes it for a bug, and pinned by a test so it cannot grow.
2. **Outside a rest it is the CURRENT interval's PROGRAMMED rest, not a
   sentinel and not always 60.** Revision 2 said "it reads 60 outside a rest";
   that is true only when a rest is programmed. After rest 2 it resets to
   **`0.00`**, because the interval that follows has no programmed rest. The
   conclusion the old wording served survives and is now better founded:
   **`restSeconds` alone can say nothing about whether a rest is running** —
   it is 60.00 through all of work interval 1, and 0.00 through all of work
   interval 3. Only `state === "resting"` says it.
3. **The countdown never reaches `0:00`.** Both rests end with the state
   flipping at `1.91`. Copy must not promise a zero, and no test may wait for
   one.
4. **It ticks at `x.91`, not `x.00`** (60.00, 59.91, 58.91 … 2.91, 1.91), so
   the display **floors**. Rounding would re-render `1:00` on the first
   counted frame and add a second to fact 1's dwell.

`restDistanceMeters` climbs alongside (0 → 129 m, 0 → 142 m). Not used here,
but it is the coast this phase has been chasing, and it is why the row's
metres move during a rest.

**The resting fact is already in scope at the call site.** `surfaceModel.ts:837`
computes `const resting = frame.state === "resting"`, `frame.restSeconds` is
already a `MonitorFrame` field (`parse.ts:617`), and `buildGridModel` is called
from the same function (`:1310`). Threading both in is an argument, not a new
mechanism.

**Method note, for the record.** This decode was run because the spec was about
to assert a wire behaviour it had only sampled. It falsified two of the spec's
own sentences. Recurring failure #16's second corollary — a sourced premise
fails by being UNDER-READ — earned its place again.

## GATE 0 IS PASSED. James approved option B, 2026-08-26.

Presented as a rendered artifact showing the grid mid-rest in PORTRAIT, three
candidate treatments against the current state, every colour pairing computed:
<https://claude.ai/code/artifact/340fb9c9-2239-41e1-9ba4-5392c18d29c0>.
James's answer was one character: **"B"**.

### THE APPROVED SHAPE

**During a rest, the active row's `/500M` cell becomes `REST m:ss`, counting
down from the machine's own `restSeconds`, wearing the gold `--marker`, on a
row filled `--surface-sunken`. When the rest ends, every one of those reverts.**

The `--marker` **MOVES** onto that cell and off `time`/`meters` for the
duration of the rest. It does not multiply — see Constraints. This is the
original approved direction ("the rest cell counts down and wears the marker")
relocated to a cell portrait actually renders.

**Why the `/500M` cell.** During a rest it holds `livePace`, which is
`frame.currentSplit` — the split of a **coasting flywheel**
(`surfaceModel.ts:641-658`). That number is worse than absent: it is judged
against the work interval's target, so a coast can paint a red or blue verdict
on a rest. Replacing it costs no information and removes a wrong judgement.
The alternative cells were both rejected in the artifact: TIME and METERS mean
"this interval's time/metres" everywhere else, and making them mean two things
by state is precisely the ambiguity RC-23 refused.

**Why the marker moves rather than adds.** During a rest, the interval's time
and metres are not counting toward anything — they are drifting on the coast,
which is the whole complaint. The rest is what is counting. Moving the gold
mark says exactly that, in the grid's own existing vocabulary, and keeps the
one-mark invariant intact.

**Three channels carry the meaning, only one of them colour:** the word
`REST`, the sunken row fill, and the gold. The grid's own stylesheet states the
rule this obeys (`index.css:6801`): *"THE DASH CARRIES 'NOT YET ROWED'; COLOUR
DOES NOT."* Option A — recolouring the 4x20 row marker gold and nothing else —
was rejected for breaking it, at a measured **2.63:1**.

**The 4x20 row marker stays `--ink`.** It means "this is the row you are on",
which is still true during a rest. It is not part of this change.

### CONTRAST, COMPUTED (recurring failure #6)

| Pairing | Ratio | Requirement | Verdict |
| --- | --- | --- | --- |
| `--marker` on `--surface-sunken` (the REST text and its gold) | **5.50:1** | 4.5:1 text, 3:1 graphic | passes both |
| `--marker` on `--surface` | **6.49:1** | 3:1 graphic | passes |
| `--ink` on `--surface-sunken` (the row's other values) | **14.50:1** | 4.5:1 | passes |
| `--surface` vs `--surface-sunken` (the fill shift itself) | 1.18:1 | — | supporting channel only, never the sole signal — which is why the word and the gold are both required |
| `--marker` vs `--ink` (option A's whole signal) | 2.63:1 | — | **why A was rejected** |

### LANDSCAPE — one behaviour, stated as a ruling not an omission

James was asked whether the orientations should differ and answered only "B",
so this is my call, recorded as such. **Landscape gets the identical
treatment: the `/500M` cell counts down, in both orientations.** Landscape's
REST column keeps showing that interval's PROGRAMMED rest on every row,
including the active one — which is what that column means everywhere else,
and is the same "settles back to a stated value" rule James already ruled for.
The two are not in conflict: the REST column says *this interval is programmed
for 1:00*, the `/500M` cell says *0:42 of it is left*.

One code path, one test surface, no orientation-conditional meaning — which
the design reference dislikes and which would have cost two of everything.
**If the landscape capture reads badly, that is a finding, not a surprise**;
revisit it there rather than pre-building a second path.

### RULING — `resting` with a ZERO programmed rest

`driver.ts` notes that a machine can briefly report `resting` on an interval
with no programmed rest. Fact 2 above says `restSeconds` reads `0.00` there.
**Show nothing.** The countdown renders only when `resting && restSeconds > 0`;
a rest of zero duration has nothing to count, and flashing a rest marker for a
frame or two IS the false claim. Cost if wrong: a genuine sub-second rest goes
unmarked, which is the state before this change.

## Superseded — the shape approved on my description (kept for the record)

**During a rest, the active row's REST cell becomes the countdown and wears the
marker.** `1:00` ticking to `0:00`, with the gold `--marker` mark moving to it.

**Why this and not a label:** the marker already means *"this is the one you're
on and it's moving"* (`surfaceModel.ts:1414-1419`). Putting it on the rest cell
reuses the grid's own existing vocabulary rather than inventing a second
signal, and answers both "am I resting?" and "how long left?" in the one place
the rower is already looking. A header word would answer only the first.

**The file's own reasoning already points here.** `countdown` is suppressed when
armed because the cell "would be claiming a motion that has not started". A
work-interval cell marked as counting during a rest is the same error one state
over: it claims the rower's work is what is moving, when the rest is.

## THE APPROVED SHAPE DOES NOT WORK IN PORTRAIT. Found before Gate 0.

**`.connected-grid-rest` is `display: none` in portrait** (`index.css:6908`)
and only reappears in the landscape query (`:8196`). The column is in the DOM
in both orientations — one markup — but a phone held upright never shows it.

**James was on a phone, in portrait, when he raised this.** So "the rest cell
counts down and wears the marker" is invisible in the exact situation that
produced the complaint. The direction he approved was approved on my
description, and my description omitted this.

**What survives:** the diagnosis (nothing on the grid says a rest is running),
the wire evidence (`restSeconds` counts down, measured), and the principle
(reuse the marker, do not invent a signal). **What does not:** the cell it
lands on, in portrait.

**Gate 0 must now choose an orientation-honest shape.** Candidates, none
chosen here:

- **A. Show the REST column in portrait too, but only while resting.** The
  column already exists in the DOM; this is a visibility rule, not a layout
  change. Cost: portrait's seven columns were cut to six deliberately for
  density — `revision §4`'s own table — so this re-opens a decision that was
  made for a reason. It also makes the grid's column count change mid-piece,
  which nothing else on this surface does.
- **B. Put the countdown in a cell portrait already shows.** The active row's
  TIME cell is the natural candidate: during a rest, time is what is counting.
  Cost: the time cell means "this interval's time" everywhere else, and this
  would make it mean two things depending on state — precisely the ambiguity
  RC-23 refused for the metres.
- **C. Mark the ROW rather than a cell.** The active row already has a marker
  square (`.connected-grid-marker`, 4x20 `--ink`) and an `aria-current`. A rest
  treatment on the row — the marker in `--marker`, or a rest tint — says "this
  row is resting" without needing a rest column at all. Cost: says a rest is
  running but not how long is left, which was half the reason for the choice.
- **D. Portrait and landscape differ deliberately.** Landscape gets the rest
  cell counting (the approved shape); portrait gets C. Cost: two behaviours to
  hold, and the design reference dislikes orientation-conditional meaning.

**The lesson, and it is one this repo already names:** I checked that the wire
could support the countdown and never checked that the cell was on screen. The
feasibility question had two halves and I answered the interesting one. See
recurring failure #13 — an instruction (or a design) is a claim about the
system, and it gets the same evidence bar as any other.

## Gate 0 — PASSED (James, 2026-08-26). Implementation is unblocked.

**It was binding and it preceded every task.** The artifact above was
presented; James chose B; nothing was built before that. The record of what
the gate required, and how it was met, is above under "GATE 0 IS PASSED".

**DECIDED (James, 2026-08-26): count down during the rest, and RESTORE the
programmed value once the rest ends.** His reasoning: *"I think 'restore it when
the rest ends' is consistent."*

It is, and with a rule the grid already follows: **a cell shows the live value
while it is the thing happening, and settles back to a stated value once it is
not.** The time and metres cells already work exactly this way — the active row
counts, completed rows show their actuals, upcoming rows show what was
programmed. The rest cell joins that rule instead of becoming an exception.

Rejected with it: showing `0:42 / 1:00`, which puts two numbers in a cell a
rower reads at arm's length mid-piece, to preserve a value they can read on
every other row of the column.

## Constraints

- **`--marker` moves; it does not multiply.** It is documented as the single
  "this is what's counting" mark on the pane. Exactly one cell wears it at a
  time, and a test pins that.
- **`GridRow.countdown` widens from `"time" | "meters" | null` to admit
  `"rest"`**, and the comments at `surfaceModel.ts:398-400` and `:1414-1419`
  that describe the narrower rule get reconciled in the same change. So does
  `PaneGrid.tsx`'s `countdownClass` signature and its own header comment,
  which currently states the portrait/landscape column difference as the ONLY
  orientation difference. So does `docs/design/DEVIATIONS.md` if it describes
  the cell.
- **Suppressed while armed**, exactly as time/meters already are: before the
  first pull nothing is counting, including a rest that has not begun.
- **Renders only when `resting && frame.restSeconds > 0`** — the zero-rest
  ruling above.
- **FLOORS to whole seconds.** Wire fact 4: the field ticks at `x.91`.
- **No stored shape, no number's meaning changes.** This is a display change,
  and it carries none of RC-23's TRIAD weight — which is precisely why it is
  the cheaper answer to the same complaint. **Not TRIAD, so no PM final-PR
  gate and no antagonist delta pass**; the wire claims that would have earned
  one were settled by decoding the capture directly (above) rather than by
  citing it, which is what the delta pass would have been asked to check.
- **44 px hit targets and WCAG AA** are hard requirements. Nothing here adds a
  control, so the targets should be untouched; say so rather than assuming it.
- **The cell must not clip.** `/500M` is `flex: 1.1` and `REST 0:42` is longer
  than any split it replaces. `white-space: nowrap`, the word at
  `--c-size-thead` and the number at row size, and a structural assertion at
  the narrowest supported width.

## Testing

- **Fixture must look like production** (recurring failure #3): a real
  rest-bearing program mid-rest, not a hand-made row. The committed
  `rests-finished-recording.jsonl.gz` carries two genuine `r60` rests and is the
  honest source.
- Assert the rendered cell and which cell wears the marker, never that a helper
  exists (#4).
- Pin the **negative**: during WORK the marker is on time or metres and NOT on
  the pace cell; while armed no cell wears it.
- **Pin the three wire facts as behaviour**, since each one silently breaks a
  plausible-looking implementation: the ~1 s `60.00` dwell at rest entry is
  bounded and does not extend into work; `restSeconds` reading `60.00` during
  WORK renders no countdown; `restSeconds` reading `0.00` while `resting`
  renders no countdown.
- `pnpm e2e` is mandatory (`app/src/`), and **`pnpm screenshots` too** — this
  changes a screen's layout, in BOTH orientations. Then open the captures and
  look at them (#7), portrait first.

## Exit criteria

1. **PASSED** — Gate 0 approved by James, contrast ratios stated as numbers,
   the orientation question ruled.
2. During a rest, a rower in PORTRAIT can tell a rest is running AND how long
   is left, from the `/500M` cell, on a sunken row, without reading the step
   line. Landscape behaves identically.
3. During work, and while armed, the marker is where it is today. Pinned.
4. Exactly one cell wears the marker at any time. Pinned.
5. The three wire facts above are pinned as tests, not as comments.

## Not in scope

- RC-23 stays ruled: the row's time and metres keep moving honestly during a
  rest. This change makes that legible; it does not freeze it.
- `restDistanceMeters` is decoded and unused here.
- The step line and the grid header are untouched.
