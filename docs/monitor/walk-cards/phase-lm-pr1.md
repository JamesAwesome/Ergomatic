# Walk card — Phase LM PR 1 (blocks the merge)

Written before James is asked, per #198's PM gate condition 5 and recurring
failure #13 (an instruction is a claim about the system, and gets the same
evidence bar). Exit criteria 9 and 10 of
`docs/superpowers/specs/2026-08-25-lost-monitor-design.md`.

**This card gates a merge.** PR 1 does not land until both criteria are met —
James's ruling, 2026-08-25: *"Have the walks block."*

## Budget

**~7 minutes of rowing, in four short efforts.** Two builds, one app switch, one
erg. No heart-rate belt needed. Longest single effort is 60 seconds.

The rowing is unavoidable: the probe measures what arrives while the app is
backgrounded, and a backlog can only carry a pull if the rower is pulling.

## Builds needed

| Build | What it is | Why |
| --- | --- | --- |
| A | this branch, as it will merge | legs 1 and 2, and the probe's control arm |
| B | this branch **plus** `bluetooth-central` in `UIBackgroundModes` | the probe's variant arm. **Never merged** — a throwaway |

Build B's plist edit is made in the worktree, built, and then reverted there.
It is not committed on any branch. (`app/ios/App/App/Info.plist` is one of the
three iOS files this repo never commits anyway.)

## ~~Settle this in the first ten seconds, before any rowing~~ (retired — nothing to settle)

The card used to open with a pre-walk check: **does installing build B preserve
the app's localStorage container?** — on the premise that the probe's readout
lived there and could be lost. Kept as a record of the question, because the
inference behind it (same bundle id keeps the data container) is still merely
INFERENCE and someone will ask again.

**RETIRED BY FIX-ROUND-2 TASK 3 — DO NOT RUN THIS CHECK, IT NO LONGER MEANS
ANYTHING.** The check used the diagnostics row's absence as the container-
survival detector: the row read its stash once at mount, so on a container
that had just been replaced it rendered nothing. That defect is fixed — the
row now re-reads after mount, so it appears from the session's own teardown
whether or not this device has ever connected before. Row present therefore
no longer says the container survived.

**And the question it was asked for has gone away with it.** Criterion 9's
readout is written by the very session being measured, not carried over from
an earlier install, and the row that shows it now renders on a first-ever
connected session. So a replaced container does not make the probe
unreadable. If a future leg comes to depend on data an EARLIER install
wrote, that leg needs its own check written for it — no leg on this card
does.

## Leg 1 — lock BEFORE the first pull (build A, the flagship)

The tester's exact path, and the one thing that proves PR 1 fixed what it claims.

1. Connect, program any single-interval workout, tap **Show me the numbers**.
2. **Lock the phone. Pocket it.**
3. Row **30 seconds**.
4. Unlock. **Look at the screen before touching anything**, and report what the
   step line says and what the banner says.
5. Tap **End**, then read the source line on the summary.

**Expected, and each is falsifiable:** step line `1 OF 1 · READY` (NOT `WORK`);
a filled red `LOST THE MONITOR` with `Nothing kept.`; `0m`; heroes labelled as
targets, not readings; summary source `NO MONITOR READING` (NOT `LOGGED BY
HAND`). Then, one capture ask: the diagnostics row's `COPY`.

**Also report, because it is a copy question and only James can answer it:**
did the ready screen's `KEEP THE SCREEN ON` read as "don't let it sleep" or as
"don't lock it"? Keep-awake already prevents the sleep; locking is the actual
risk, and `DON'T LOCK YOUR PHONE` is the same length.

## Leg 2 — lock MID-PIECE (build A)

Different code path from leg 1. **Do not report this as confirming leg 1.**

1. Same workout. Row until the app clearly shows a live reading.
2. Lock, pocket, row 30 seconds, unlock.

**THREE landings are possible and the card must record WHICH**, not assume:

- the run continues, no metres lost (the continuity rule accepted the gap);
- the run closes as link-lost and the surface moves to `ended` **while you are
  still rowing**;
- the something-measured banner shows, naming a kept count.

**Expect `kept = 0` on a single-interval workout, beside a nonzero greyed
counter.** That is CORRECT and is the majority outcome here: the in-flight
interval's metres are genuinely discarded on close (Phase LM's own owed row).
Do not record it as cosmetic.

## Leg 2b — sit still after a rest — WALKED 2026-08-26, DID NOT REPRODUCE

**Result: no `PULL TO RESUME` appeared** after five seconds of stillness at a
rest boundary. The hypothesis in the spec's Task 5 is not sufficient; see there.
Kept for the record and for a future attempt, but **do not re-run it expecting
a result** — provoking it deliberately has now failed once.

**BUDGET CORRECTION, and it is the card's fault, not the operator's.** This leg
was written as "~10 seconds, no extra rowing" on the assumption the rower is
ALREADY inside a rest-bearing piece. Delivered cold it costs a full work
interval first (500 m on the piece actually used) before a rest even exists.
James, 2026-08-26: *"you said 'ten seconds, no extra rowing.' then asked me to
row 500m. that's annoying."* **A leg's stated cost must include getting into
the state it needs.** Conflicting rowing amounts is a named failure in the walk
skill and this card reproduced it.

Row a rest-bearing workout to its first rest. When the rest ends and the next
interval starts, **sit still for five seconds before your first pull.** Then row
on normally.

**Watch for `PULL TO RESUME` during those five seconds.** Report either way —
"it appeared" and "it did not" are both results, and the second kills a live
hypothesis.

Why: the pause detector is meant to be immune at a rest boundary because
distance resets to zero, but a real capture shows the next interval starting at
0.1 m of coast, which defeats that guard on its first frame. **Download the
recording after this piece either way** — the capture is the deliverable, not
the observation.

## Leg 3 — the §D1e probe, control arm (build A)

1. Connect, program, **start rowing**.
2. Background the app (home gesture, not lock) for **~60 seconds**.
3. **Keep rowing the whole time.** A drained backlog only proves anything about
   the ready gate if it contains a pull.
4. Foreground, stop, read the diagnostics via `COPY`.

## Leg 4 — the probe's variant arm (build B)

Identical to leg 3, on build B.

**What the pair answers:** §D1e's own line — *"the delta between those two runs
is the entire value of the background mode, and it is currently unmeasured."*

**Report all three instruments, not a verdict**: the stamp SERIES (a count
alone cannot separate "JS ran" from "a backlog drained" — a processing-time
stamp makes a drain look like a freeze); the link state and any disconnect on
resume (Apple: you do not learn of a disconnect until you resume, so a zero
count is equally consistent with the link having dropped); and observed-vs-
expected frames (~2 Hz, so ~120 per 60 s).

**Stated pass/fail:** the drain HELD if the window's frames arrive within a few
seconds of resume at close to expected; FAILED if they never arrive. Anything
between is reported as ambiguous, with the numbers, and settles nothing.

## Operator contract (binding, from `/hardware-walk`)

One instruction at a time, then stop and wait. At most one capture ask per
rest. Nothing asked mid-effort. If something breaks, prefer "abandon, we have
enough" over "row again" — and any extra rowing needs a revised budget and an
explicit yes.

## What this walk CANNOT establish

**Whether the diagnostics readout works for a brand-new tester.** James's phone
has connected dozens of times, so nothing on this card exercises a device's
first-ever connected session — and that was exactly where the row used to fail.
The defect is fixed (fix-round-2 Task 3) and pinned by a test that drives the
real navigation ordering, because a walk never could: a pass here still says
nothing about that case, and this card must not be cited as having covered it.
