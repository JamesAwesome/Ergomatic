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

**OPEN, for Gate 0:** the rest cell currently shows the PROGRAMMED rest on every
row, so a rower can read the whole workout's shape down the column. If the
active row's cell starts counting down, that row's programmed value is no longer
visible. Does that matter? Options: let it count and lose the programmed value
on that row alone; show `0:42 / 1:00`; or count down and restore the programmed
value once the rest ends. **The spec does not choose.**

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
2. During a rest the active row's rest cell counts down from the machine's own
   `restSeconds`, and wears the marker.
3. During work, and while armed, the marker is where it is today. Pinned.
4. Exactly one cell wears the marker at any time. Pinned.
5. A rower on the grid mid-rest can tell a rest is running without reading the
   step line.

## Not in scope

- RC-23 stays ruled: the row's time and metres keep moving honestly during a
  rest. This change makes that legible; it does not freeze it.
- `restDistanceMeters` is decoded and unused here.
- The step line and the grid header are untouched.
