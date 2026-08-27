# Walk card — Phase LM PR 1 (blocks the merge)

Written before James is asked, per #198's PM gate condition 5 and recurring
failure #13 (an instruction is a claim about the system, and gets the same
evidence bar). Exit criteria 9 and 10 of
`docs/superpowers/specs/2026-08-25-lost-monitor-design.md`.

**CLOSED OUT 2026-08-26. Do not re-run this card as written** — legs 3 and 4
were CANCELLED by James and re-running them would spend erg time he already
declined. Outcomes per leg are recorded in each section below, and the evidence
is committed at `docs/monitor/sessions/walk-2026-08-26b/`.

| Leg | Outcome |
| --- | --- |
| 1 | **PASSED.** Zero spurious latches (2 entries, both real, both `latched=true`), `1 OF 4 · READY` preserved, banner correct and retracting |
| 2 | **SUBSTITUTED, not walked.** A 98 s BACKGROUND while `live`, not a deliberate LOCK. Landing 1 (run continued) observed and recorded. See the walk record for why this PR is the wrong one to blur that distinction |
| 2b | **REPRODUCED** the false pause (second attempt), fixed at `3423e95`, and **the fix was never re-walked** |
| 3, 4 | **CANCELLED by James's ruling** — the §D1e probe closed on incidental evidence. See the spec's "The §D1e probe: CLOSED without running it" |

**This card gated a merge.** PR 1 did not land until the criteria were met —
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

## Leg 2b — REPRODUCED 2026-08-26 on the SECOND attempt, and FIXED the same day

**The instruction that reproduced it:** take a pull or two DURING the rest, then
stop as the work interval starts and sit still. `PULL TO RESUME` appeared within
about two seconds, while the flywheel was still coasting — a pause declared
about an interval nobody had pulled in.

**RUN IT AGAIN, AND IT IS NOW A TWO-SIDED CHECK.** The fix requires evidence
that the interval has actually been rowed before anything is called a pause, so
this leg passes only if BOTH halves land:

1. Same instruction as above → **no `PULL TO RESUME`** while the coast dies.
2. Then row the interval properly for ten seconds or so and **stop mid-interval**
   → `PULL TO RESUME` **appears**, as it always has.

Half a pass is a fail. A silenced genuine pause is a worse defect than the one
this leg came for, and only the second half can catch it on hardware.

**The instruction that does NOT work, kept because the wrong turn is the useful
part:** "sit still after the rest" reproduces nothing. At a dead stop distance
is 0 and the predicate's own guard clears correctly, so that leg tested the one
case the mechanism does not cover. It came back negative and was one commit
from being recorded as evidence AGAINST the mechanism. **It was evidence about
the instruction.**

**BUDGET CORRECTION — the card's fault, not the operator's.** This leg was
written "~10 seconds, no extra rowing", which is true only if the rower is
ALREADY inside a rest-bearing piece. Cold, it costs a full work interval first.
James, 2026-08-26: *"you said 'ten seconds, no extra rowing.' then asked me to
row 500m. that's annoying."* **A leg's stated cost must include getting into
the state it needs.**

**AND THE INTERVAL SHOULD HAVE BEEN SHORTER.** James, same session: *"our skill
should instruct you to recommend short intervals. a 500m interval is not short.
a 250 would be preferred."* Nothing about this leg needed 500 m — it needs a
rest boundary, and a 250 m interval reaches one in half the rowing. Now a
standing rule in the `hardware-walk` skill.

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
