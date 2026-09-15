# Walk 2026-09-15 — does the work clock freeze?

**PREFILLED 2026-09-14, before the walk.** Everything below the line is
written; the outcome section is the only thing the walk fills in. Nothing is
typed during the session.

Card: `docs/monitor/walk-cards/2026-09-15-work-clock-freeze-v5.md`
(PM readiness **PASS** at v5; shape approved by James 2026-09-14).

## The question

**Does 0x0031's Elapsed Time keep counting during a WORK interval when the
rower stops?** If it does not, `wall = work + machineRest` breaks for
programmed rows exactly as it does for a free row, and the trace chart's
wall-clock axis candidate (board 2, candidate B) dies with it.

## Why it needed an erg

Neither half of the corpus can answer it, and this was measured rather than
assumed:

- **17 wire recordings, zero instances.** Every mid-piece stall is
  `workoutState = 1` (`WORKOUTROW`, a free row). Nothing sits in
  `INTERVALWORKTIME`/`INTERVALWORKDISTANCE` (4/5) with a stopped clock.
- **Saved rows cannot answer it in principle.** `seriesRecorder` emits one
  sample per work-clock second and the work clock IS 0x0031's elapsed, so a
  frozen clock emits nothing and the trace is seamless — identical to a rower
  who never stopped.

## Provenance

| Piece | Workout | Close | Wire recording | Photos |
| --- | --- | --- | --- | --- |
| 1 | Walk Keystone (`x2` / `w 250m 6k @24`), **abandoned after interval 1** | ENDed in the app | _(filled at the walk)_ | _(one same-frame: PM5 + laptop)_ |

Lab: this worktree's own stack, branch `gate0b`. No heart-rate belt was asked
for or worn. Nothing was installed on the phone.

## The decode

`decode-work-clock.py` in this directory, staged and proven before the walk
against two committed captures:

```
python3 decode-work-clock.py <recording.jsonl.gz>
```

It prints every not-rowing stretch with what the clock did across it, and
decides on the SHAPE — FROZE / RAN / GRACE THEN FROZE / RE-BASED — rather
than a two-way split. Pre-walk proof runs:

- `walk-2026-08-31-justrow/just-row-*.gz` → reproduces the known free-row
  freeze: **103.64 s stopped, clock moved 0.00 s, FROZE**, at 0.99 Hz. Its
  own verdict line reads INCONCLUSIVE, correctly — `WORKOUTROW` is not a
  programmed work state.
- `walk-2026-08-25/rests-finished-recording.jsonl.gz` → longest not-rowing
  stretch in a programmed WORK state is **0.99 s**. INCONCLUSIVE, correctly.
  This is what every capture looked like before this walk.

A Terminate re-bases the clock backward, so a decrease is reported as
**RE-BASED** and never as a freeze — the first draft called it FROZE, which
would have been a wrong answer to this walk's own question.

---

## Outcome — ANSWERED 2026-09-15

**The clock RAN. It does not freeze during a programmed work interval.**

| | |
| --- | --- |
| Stop held | **60.48 s** of host clock (asked for 30; longer is more evidence, and the monitor did not mind) |
| Workout state during the stop | **5 · INTERVALWORKDISTANCE** — a programmed work interval, which is the state the corpus never held |
| Clock moved | **60.51 s** |
| **Verdict** | **RAN** |
| Consequence for board 2's candidate B | **ALIVE.** `wall = work + machineRest` holds for programmed rows |
| M9's programmed-row sibling | **No sibling.** The free-row freeze does not generalise |

Decoded with this directory's own `decode-work-clock.py`; the diagnostics
ring agrees independently (`raw-rowing-state previous=1 value=0` at
elapsed 16.33, `previous=0 value=1` at elapsed 77.85 — 61.5 s apart on both
clocks).

**The free row and a programmed interval are genuinely different.** A free
row is `WORKOUTTYPE_JUSTROW` (1) and freezes; a programmed piece is
`WORKOUTTYPE_VARIABLE_INTERVAL` (8) and does not. The PM readiness gate
insisted on exactly this distinction — "do not read a free-row observation
as a prior for a programmed one" — and it was right.

**James, at the erg (2026-09-15), generalising it:** *"if you stopped like
that during a timed interval the ergometer would keep its clock ticking."*
Which closes the scope question the card left open: the walk measured a
DISTANCE interval, and a time interval's clock must run through a stop or
the piece could never terminate. RAN on distance plus that reasoning covers
both interval kinds.

**Inactivity bound, updated.** The monitor did not terminate, sleep or leave
state 5 across a 60.48 s dead stop. The corpus bound was ≥36.35 s in a
type-8 REST; it is now **≥60 s in a type-8 WORK state**.

## What else this session found

**1. The progress bar counts your rest as progress** (James, unprompted:
*"weird bug, the progress bar advanced early"*). It is not a rendering
fault — it is this finding, surfaced. The bar advances on the machine's
elapsed, the machine's elapsed runs while you sit still, so a minute of
standing still is a minute of "progress" on a distance piece.

**2. A mid-interval stop poisons the saved split, silently.** 0x0039 reports
the interval as **250 m in 129.2 s**. About 68 s of that was rowing and
about 61 s was the stop. So the row stores a split of roughly **4:18/500m**
for a piece actually pulled at about **2:15**. Every number is honest about
its own quantity; the row still reads as a catastrophically slow piece, and
nothing on the screen says why. This is M3's axis question with a real
figure attached, and it belongs in board 2.

**3. `ergMachineType` is logged as `null` on a machine that reports it 174
times.** The wire byte is `0` (RowErg) on both carriers; the log header says
`null`. `classifyErgMachine` writes the meta on every decode of every
characteristic, 0x0031 carries no such field, and `setMeta` is
last-write-wins — so 0x0031 clobbers 0x0032's honest reading. Filed in
ROADMAP (`dies 2026-10-15`) as a quick follow rather than fixed on this
branch. Found by James reading this walk's own ring.

## Cost

One piece, ~68 s of actual rowing, well inside the 20-minute cap and the
~70 s budget. No belt, no phone, nothing installed. One retry budgeted and
not needed.
