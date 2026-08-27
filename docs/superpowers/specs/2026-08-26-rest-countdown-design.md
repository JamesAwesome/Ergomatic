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

## The wire supports it. Measured, not assumed.

`0x0032` byte 13-15 carries `restSeconds` at 0.01 s/lsb (`parse.ts:169`), and it
**counts DOWN**. Decoded across the real `r60` in
`docs/monitor/sessions/walk-2026-08-25/rests-finished-recording.jsonl.gz`:

```
t=100.3s  restSeconds=60      t=130.7s  restSeconds=31.91
t=102.3s  restSeconds=59.91   t=151.0s  restSeconds=10.91
t=110.4s  restSeconds=51.91   t=159.2s  restSeconds=2.91
                              t=161.2s  restSeconds=60     <- next work interval
```

**Two facts from that decode that the design must respect:**

1. **It reads `60` OUTSIDE a rest, not `0`.** It is the programmed rest value
   at idle and only counts down while resting. So `restSeconds` **alone cannot
   say a rest is running** — pair it with the resting state or a work interval
   will show a frozen `1:00` in a marked cell, which is the exact false
   "something is counting" claim this change exists to prevent.
2. **`restDistanceMeters` climbs alongside** (0 → 125 m over that rest). Not
   used here, but it is the coast this phase has been chasing, and it explains
   why the row's metres move during a rest.

**The resting fact is already in scope at the call site.** `surfaceModel.ts:837`
computes `const resting = frame.state === "resting"`, and `buildGridModel` is
called from the same function (`:1310`). Threading it in is an argument, not a
new mechanism.

## Chosen shape (James approved the DIRECTION, 2026-08-26)

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

## Gate 0 — James approves the visual BEFORE any implementation

**Binding, and it precedes every task.** James asked for this gate explicitly.
Nothing is built until he has seen it.

What gets presented:

- The grid mid-rest, current versus proposed, at the real proportions, with the
  marker in both positions so the move is visible.
- The **work-interval** state alongside, unchanged — the proof that the marker
  went somewhere rather than multiplied.
- Every colour pairing's contrast ratio **computed and stated as a number**
  (recurring failure #6). `--marker` on the grid's backgrounds is already
  measured at 6.49 / 5.85 / 5.50:1 in `tokens.css`; re-derive rather than quote.
- **The open question below, answered by him, not by the spec.**

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
- **`countdown` widens from `"time" | "meters" | null` to admit rest**, and the
  comments at `surfaceModel.ts:398-400` and `:1414-1419` that describe the
  narrower rule get reconciled in the same change. So does
  `docs/design/DEVIATIONS.md` if it describes the cell.
- **Suppressed while armed**, exactly as time/meters already are: before the
  first pull nothing is counting, including a rest that has not begun.
- **No stored shape, no number's meaning changes.** This is a display change,
  and it carries none of RC-23's TRIAD weight — which is precisely why it is
  the cheaper answer to the same complaint.
- **44 px hit targets and WCAG AA** are hard requirements. Nothing here adds a
  control, so the targets should be untouched; say so rather than assuming it.

## Testing

- **Fixture must look like production** (recurring failure #3): a real
  rest-bearing program mid-rest, not a hand-made row. The committed
  `rests-finished-recording.jsonl.gz` carries two genuine `r60` rests and is the
  honest source.
- Assert the rendered cell and which cell wears the marker, never that a helper
  exists (#4).
- Pin the **negative**: during WORK the marker is on time or metres and NOT on
  rest; while armed no cell wears it.
- `pnpm e2e` is mandatory (`app/src/`), and **`pnpm screenshots` too** — this
  changes a screen's layout. Then open the captures and look at them (#7).

## Exit criteria

1. Gate 0 approved by James, with contrast ratios stated as numbers and the
   open question above answered.
2. During a rest, a rower in PORTRAIT can tell a rest is running, by whichever
   shape Gate 0 chooses. In landscape the rest cell counts down from the
   machine's own `restSeconds` and wears the marker.
3. During work, and while armed, the marker is where it is today. Pinned.
4. Exactly one cell wears the marker at any time. Pinned.
5. A rower on the grid mid-rest can tell a rest is running without reading the
   step line.

## Not in scope

- RC-23 stays ruled: the row's time and metres keep moving honestly during a
  rest. This change makes that legible; it does not freeze it.
- `restDistanceMeters` is decoded and unused here.
- The step line and the grid header are untouched.
