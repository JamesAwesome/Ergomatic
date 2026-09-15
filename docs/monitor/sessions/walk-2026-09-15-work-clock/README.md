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

## Outcome

_(filled at the walk)_

| | |
| --- | --- |
| Stop held | — |
| Workout state during the stop | — |
| Clock moved | — |
| **Verdict** | — |
| Consequence for board 2's candidate B | — |
| M9's programmed-row sibling (the second question this recording answers) | — |
