# Walk card — does the work clock freeze? (v1)

**One question, one piece, one observable.** Written 2026-09-14 for a walk
James offered for the morning of 2026-09-15. Gates nothing; it UNBLOCKS Gate
0B's board 2, which otherwise goes to the gate carrying an assumption.

**Status: SHAPE APPROVED by James 2026-09-14** ("that walk shape is fine") —
the one piece, the mid-interval stop, the laptop-only medium and the
interaction budget. **Awaiting the PM readiness PASS**, which is a separate
gate and is not satisfied by that approval. And neither is permission to
start: James chooses whether and when (CLAUDE.md's hardware-walk rule).

## The question, and why the desk cannot answer it

**Does 0x0031's Elapsed Time keep counting during a WORK interval when the
rower stops?**

It matters because the trace chart's wall-clock axis candidate is
`work + machineRest`, and a frozen work clock breaks that identity for
programmed rows exactly as it does for a free row.

**Both halves of the corpus were swept 2026-09-14 and neither settles it:**

- **13 wire recordings, zero instances.** Every mid-piece stall is
  `workoutState = 1` (`WORKOUTROW` — a free row). Not one frame pair sits in
  `INTERVALWORKTIME`/`INTERVALWORKDISTANCE` (states 4/5) with a stopped
  clock; the programmed walks were rowed continuously. Two apparent hits are
  false: `walk-2026-08-23/keystone`'s 89.64 s is `state 12 WORKOUTLOGGED`,
  that walk's own documented hold-open window AFTER the piece, and
  `walk-2026-08-31-justrow/waiting` is a free row.
- **Saved rows cannot settle it in principle.** `seriesRecorder` emits one
  sample per work-clock second and the work clock IS 0x0031's elapsed, so a
  frozen clock emits NOTHING across the pause and the trace is seamless —
  identical to a rower who never stopped. Staging's longest flat-distance run
  across every programmed monitor row is **4 seconds** (between-stroke
  coasting). James does not remember a row he stopped in (asked 2026-09-14).

## Budget

**~70 seconds of rowing, one piece, one effort.** No heart-rate belt. No
phone. Laptop only.

**TOTAL operator wall-clock cap: 20 minutes**, started when James sits down
and counted across setup, connect, the piece, the download and wrap-up. At
the cap the walk STOPS, evidence is preserved, and James is released.

## Builds

| Build | What | Why |
| --- | --- | --- |
| Web lab, this branch | `bash scripts/walk-lab.sh up` from the worktree's `app/` | **Mandatory.** The recording tap is a dev/web-only seam; a TestFlight build has no `RECORDING · DOWNLOAD` row at all |

No plist edit, no throwaway build, no reinstall. **Nothing is installed on
the phone, so no install permission is needed.**

## Why a DISTANCE interval, not a time one

A time interval can END while he is standing still — if the clock runs, the
piece finishes under him and the stop is no longer mid-work. A distance
interval cannot: no metres accumulate while the flywheel is dead, so the
interval is still open whichever way the answer falls. **The stop is
guaranteed to be mid-work in both outcomes**, which is the whole point.

250 m at his pace is ~60 s of work — the skill's own default, and the
shortest interval that reaches the state.

## The one case

### Case 1 — stop dead in the middle of a work interval

| | |
| --- | --- |
| **Action** | Row the 250 m piece. About 20 seconds in, stop completely: hands off the handle, let the flywheel die. Hold. Then resume and row it out. |
| **Hold** | Hold the stop until **30 seconds** on the controller's clock, **at most 45**, then resume rowing. |
| **Primary observable** | The wire recording's 0x0031 frames, decoded per §10 (elapsed bytes 0-2 at 0.01 s; workout state byte 8; rowing state byte 9). **Controller-gathered** from `RECORDING · DOWNLOAD`. |
| **Secondary observable** | What the PM5's own display does during the stop — James reads it aloud once, after resuming. **Corroborating only:** that the displayed time and 0x0031's elapsed are the same field is NOT established, and this walk does not establish it. |
| **PASS (it freezes)** | Elapsed constant across ≥20 s of host time while `workoutState` ∈ {4, 5}. Consequence: `wall = work + machineRest` breaks for programmed rows; candidate B is dead. |
| **FAIL (it runs)** | Elapsed advances ~1 s per second of host time across the stop. Consequence: the identity holds and candidate B is live. |
| **INCONCLUSIVE** | No recording; the stop lands in a state other than 4/5; fewer than 10 s of stop captured; or the monitor terminates the piece during the hold. |
| **Attempts** | ONE, plus at most one pre-approved retry inside the same 20-minute clock, and only if the first attempt is INCONCLUSIVE rather than answered. |

Either outcome is a result. There is no "we need another walk" branch.

## Timer table

| Clock | Value | Starts | Clears | Who can expire it |
| --- | --- | --- | --- | --- |
| Operator wall clock | 20 min | James sits down | walk ends | the controller, by talking too long between steps |
| The stop hold | 30 s target, 45 s hard | James's hands leave the handle | he resumes rowing | James, by holding past 45 s |
| PM5 inactivity | **NOT ESTABLISHED** | flywheel stops | rowing resumes | the monitor, if it sleeps or terminates mid-hold |
| The piece itself | 250 m | first stroke | 250 m reached | nobody — distance cannot accrue while stopped |

**The PM5 inactivity timeout is an admitted unknown.** 30 seconds is chosen
to sit well clear of any plausible value, not because the value is known. If
the monitor terminates during the hold, that is the INCONCLUSIVE branch and
the retry uses a 15-second hold instead.

## Every operator interaction, counted

**2 pastes, 5 taps, 1 spoken reading, 1 photo — nothing mid-piece.**

| # | When | What | Kind |
| --- | --- | --- | --- |
| 1 | setup | the backdoor login from the lab card | paste |
| 2 | setup | the workout block below, into `/library/import` | paste |
| 3 | setup | Connect | tap |
| 4 | setup | the workout, then Start | tap ×2 |
| 5 | during | *(nothing — he is rowing)* | — |
| 6 | after the piece | read the PM5's time aloud | spoken |
| 7 | after the piece | `RECORDING · DOWNLOAD` on the log screen | tap |
| 8 | after the piece | one same-frame photo: PM5 + laptop | photo |

The workout block, in the house grammar the skill's own canned set uses:

```
Walk Freeze | AT | 2
w 250m 6k @24
```

## Feasibility, checked rather than assumed

- **`RECORDING · DOWNLOAD` exists on the web lab's log screen** and is the
  only sanctioned way to get the raw wire — a console `download()` drops the
  header's program (walk-2026-08-16). Web lab is therefore mandatory, and
  this card says so above rather than discovering it at the erg.
- **The stop is a thing a rower can do**: it requires no control, no screen
  and no app state. It is the one action in this repo's walk history that
  cannot fail for UI reasons.
- **No control is asked for mid-piece**, so the operator contract's
  one-instruction-then-stop rule is satisfied trivially.

## Abort and stop conditions

- The 20-minute cap is reached → STOP, preserve evidence, release James.
- The monitor does not connect after two attempts → STOP.
- The log screen shows no `RECORDING · DOWNLOAD` row after the piece → the
  evidence is broken; STOP rather than row again blind.
- The retry budget is exhausted → STOP.
- Anything the controller did not plan → STOP. No live repair, no rebuild, no
  "one more piece".

## Evidence destination

`docs/monitor/sessions/walk-2026-09-15-work-clock/`, controller-owned:
the recording, the transcribed photo, and the decode with its command. The
finding lands in the number-provenance spec §1.2, replacing the
"[CORRECTED] not desk-answerable" paragraph with the answer.
