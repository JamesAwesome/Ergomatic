# Walk card — does the work clock freeze? (v4)

**One question, one piece, one observable.** Written 2026-09-14 for a walk
James offered for the morning of 2026-09-15. Gates nothing; it UNBLOCKS Gate
0B's board 2, which otherwise goes to the gate carrying an assumption.

**v3 supersedes v2, which the PM gated NOT READY on one item: the v2 fix
introduced an operator action the card did not carry.** Abandoning an `x2`
block does not end anything — the Keystone carries no rest token
(`restSeconds: 0`; `walk-2026-08-23/keystone` is states `{0, 5, 12}` with no
state 3), so interval 1 rolls straight into interval 2 and the session must
be ENDED by hand. v1's single 250 m piece finished on its own and owed no
such tap. **A substitution inherits the new artifact's obligations, and the
ones that bite are the ones the old artifact discharged for free.** Fixed
below and marked **[v3]**.

**v2 superseded v1, which the PM gated NOT READY on 2026-09-14** — three
defects inside its own contingency machinery (a retry that could not return a
verdict, a retry that could destroy the first attempt's evidence, and a
workout state assumed rather than observed), plus a wrong interaction count
and a wrong capture count. Every one is fixed below and marked **[v2]**.

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

- **17 recordings carrying 0x0031 frames, zero instances.** **[v2 — v1 said
  13.** The sweep's glob matched only files named `*recording*` and silently
  skipped `walk-2026-08-16/session-1-keystone-2x250r0.jsonl` and
  `session-2-wu-4unequal.jsonl`. Re-run over every `*.jsonl*`: those two add
  1,059 work-state frames and neither holds a stall, so the conclusion is
  unchanged and the count was wrong.**] Every mid-piece stall is
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

## [v2] The workout state this walk keys on, established rather than assumed

PASS and INCONCLUSIVE both turn on the stop landing in `workoutState` 4 or 5.
v1 never showed its block reaches one. The chain, with the last hop labelled:

- `commands.ts:212` — `buildProgrammingSequence` always emits
  `WORKOUTTYPE_VARIABLE_INTERVAL`, whatever the step count. (PRIMARY.)
- Distance programs sit in **state 5**: `walk-2026-08-16/session-1-keystone`
  `{0:15, 5:271, 10:1}`, `walk-2026-08-17/step-2` `{0:114, 5:276, 10:1}`,
  `short-replacement` `{0:51, 5:112, 10:1}`. (PRIMARY, measured.)
- A single-step TIME program reached **state 4**:
  `walk-2026-08-25/smoke-terminated` `{0:31, 4:59, 11:2}`. (PRIMARY.)
- A single-step DISTANCE program → state 5 is **INFERENCE**; no capture in
  the corpus is single-step distance.

**So the walk does not use a new single-step block.** It uses the Keystone
block the corpus has already observed in state 5, and **abandons after
interval 1**. Same rowing, observed state, grammar that has been pasted
before — v1's `Walk Freeze | AT | 2` had never been pasted, and the
hardware-walk skill's own rule is that an unpasted block is untrusted.

## [v2] Frames keep arriving while the rower is stopped

The precondition that makes a NO observable at all, and v1 never stated it:
0x0031 arrives at **0.99-1.00 Hz throughout both measured freezes**. If the
stream stopped with the flywheel, neither outcome could be read.

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
| **Workout** | the Keystone block (`x2` / `w 250m 6k @24`), **abandoned after interval 1** — see the state section above for why this block and not a new one |
| **Action** | Row. About 20 seconds in, stop completely: hands off the handle, let the flywheel die. Hold. Then resume and row interval 1 out. **[v3] Then end the session: tap `END` in the header, then `TAP AGAIN` within 4 seconds.** Do not row interval 2. |
| **Hold** | Hold the stop until **30 seconds** on the controller's clock, **at most 45**, then resume rowing. |
| **Primary observable** | The wire recording's 0x0031 frames, decoded per §10 (elapsed bytes 0-2 at 0.01 s; workout state byte 8; rowing state byte 9). **Controller-gathered** from `RECORDING · DOWNLOAD`. |
| **Secondary observable** | What the PM5's own display does during the stop — James reads it aloud once, after resuming. **Corroborating only:** that the displayed time and 0x0031's elapsed are the same field is NOT established, and this walk does not establish it. |
| **Attempts** | ONE, plus at most one retry — see the retry rules below, which v1 got wrong twice. |

**[v2] The outcome is the SHAPE of elapsed against host time across the stop,
not a two-way split.** v1's binary discarded the most interesting answer.

| outcome | what the decode shows | consequence |
| --- | --- | --- |
| **FROZE** | elapsed constant for **≥10 s** of host time while `workoutState` ∈ {4,5} | `wall = work + machineRest` breaks for programmed rows. Candidate B is dead. |
| **RAN** | elapsed advances ~1 s per second of host time across the whole stop | the identity holds **for distance intervals**; candidate B is live. (A time interval's clock must run or the piece could never terminate, so RAN implies it there too; FROZE kills B regardless.) |
| **GRACE THEN FROZE** | elapsed advances for a bounded period, then stops | B under-reports by `stop − grace` — a BOUNDED error, not an unbounded one. The most product-relevant answer, and the recording carries its shape for free. |
| **INCONCLUSIVE** | fewer than **10 s** of stop captured in states 4/5; or no recording; or the monitor terminates the piece during the hold | retry once, per the rules below |

**[v2] The thresholds are contiguous at 10 s**, and 10 s is not a guess: at
0.01 s resolution a running clock and a frozen one separate by **1,000
counts** in 10 seconds. v1 had PASS at ≥20 s and INCONCLUSIVE at <10 s, so
its own 15-second retry landed in a gap where the card returned nothing —
a defect inside the previous round's fix (RF31).

**[v2] The retry must not destroy attempt 1's evidence.** The recording tap
is replaced unconditionally on reconnect — `transports/index.ts:176-181`,
verbatim: *"each qualifying `resolveDefaultTransport()` call REPLACES this
global with a brand-new tap — latest session wins, unconditionally. A rower
who reconnects … before downloading an earlier session's recording loses that
earlier recording the instant the new tap is assigned here; nothing preserves
it."* So the retry rule is: **download attempt 1 BEFORE anything reconnects.
Unconditionally.** A retry that reconnects first has thrown away the only
evidence the walk exists to collect.

**[v4] The "or re-arm on the same connection" alternative is DELETED, because
after an End there is no connection to re-arm.** The same function that
navigates also hangs up the radio — `WorkoutDetail.tsx:443-444`, verbatim:
*"Navigating is also what unmounts the interstitial and hangs up the radio."*
The danger was never a wasted minute; it is a controller reconnecting while
*believing* it is re-arming, which is exactly the action that destroys
attempt 1's recording.

**[v2] The retry is offered only if ≥8 minutes remain** on the 20-minute cap,
because a retry is another full interval plus a fresh CONNECT — not a
re-arm, which after an End is not a thing that exists — and the cap is
inclusive.

Either outcome is a result. There is no "we need another walk" branch.

## Timer table

| Clock | Value | Starts | Clears | Who can expire it |
| --- | --- | --- | --- | --- |
| Operator wall clock | 20 min | James sits down | walk ends | the controller, by talking too long between steps |
| The stop hold | 30 s target, 45 s hard | James's hands leave the handle | he resumes rowing | James, by holding past 45 s |
| PM5 inactivity | **[v2] ≥36 s measured in a type-8 workout; ≥896 s in type-1; never measured in states 4/5** | flywheel stops | rowing resumes | the monitor, if it sleeps or terminates mid-hold |
| The piece itself | 250 m | first stroke | 250 m reached | nobody — distance cannot accrue while stopped |
| **[v3] END's arm window** | **4 s** (`ARM_TIMEOUT_MS`, `useStagedDiscard.ts:14`) | the first `END` tap | the confirming `TAP AGAIN` | **the controller, by talking during it** — or the button losing focus, which disarms it (`onBlur={end.disarm}`) |

**[v2] The inactivity limit is BOUNDED from the corpus, not asserted.** v1
wrote "NOT ESTABLISHED" and justified 30 s as "well clear of any plausible
value" — a limit with no number beside it (RF30). The repo already held two:

- **36.35 s** of completely still `INTERVALREST` in a **type-8 programmed**
  workout, elapsed frozen at 38.34, and the workout continued into the next
  interval (`walk-2026-08-28-codebase-audit/frame-fingerprint-recording.jsonl`).
- **896.77 s** in a **type-1 free row**, state never leaving 1
  (`walk-2026-08-31-justrow/waiting-*.jsonl.gz`).

Neither is states 4/5, so the residual is real — but it is now "≥36 s in the
same workout type" rather than a guess. 30 s sits inside the measured bound.
If the monitor does terminate during the hold, that is INCONCLUSIVE and the
retry uses a **20-second** hold (**[v2]** — v1 said 15, which its own
thresholds made unreadable).

## Every operator interaction, counted

**[v4] 2 pastes, 9 taps + 1 browser chooser, 1 spoken reading, 1 photo —
nothing mid-piece.**

Counted from the rows below rather than adjusted from the last version:
reload, navigate-to-import, submit, Connect, workout, Start, `END`,
`TAP AGAIN`, `RECORDING · DOWNLOAD` = **9**. (v2 said 9 with no ending at
all — right number, wrong reasons. v3 said 11 and counted a navigation the
app performs itself. The gate's correction to 10 subtracted one from 11
rather than re-counting, so it carried v3's error forward; 9 is what the
table holds.)

**Ending the session navigates for him** — `WorkoutDetail.tsx:445-447`,
`handleConnectedEnded` → `navigate('/library/<id>/log?from=monitor')`. v1 claimed 5 taps over a table listing 4, and left out
the navigations and the Bluetooth chooser entirely.

| # | When | What | Kind |
| --- | --- | --- | --- |
| 1 | setup | the backdoor login from the lab card | paste |
| 2 | setup | reload after the backdoor | tap |
| 3 | setup | navigate to `/library/import` | tap |
| 4 | setup | the workout block below | paste |
| 5 | setup | submit the import | tap |
| 6 | setup | Connect | tap |
| 7 | setup | **Chrome's Bluetooth device chooser — pick the PM5** | browser dialog |
| 8 | setup | the workout, then Start | tap ×2 |
| 9 | during | *(nothing — he is rowing)* | — |
| 10 | after | **[v3] `END` in the header** — the button top-right on the connected surface, beside the connection line | tap |
| 11 | after | **[v3] `TAP AGAIN`** — the SAME button, relabelled, **within 4 seconds** | tap |
| 12 | after | *(nothing — the app navigates to the log screen ITSELF on End)* | automatic |
| 13 | after | read the PM5's time aloud | spoken |
| 14 | after | `RECORDING · DOWNLOAD` | tap |
| 15 | after | one same-frame photo: PM5 + laptop | photo |

**The chooser is guaranteed, not possible:** `stack-env.sh` derives
`APP_PORT` from the worktree path, so this origin has never been granted this
device and no stored permission can suppress it. v1 would have surprised him
with it.

**[v3] It is the HEADER's end button, not the one in the slot below.** Two
end controls exist off the same armed state and their armed labels differ:
the header's reads `TAP AGAIN` (`ConnectedSurface.tsx:704-716`), the slot's
reads `AGAIN` (`:916`). The card names the header one so there is no guessing
at the erg.

**No DevTools.** Nothing in this walk needs a console.

The workout block, in the house grammar the skill's own canned set uses:

```
Walk Keystone | AT | 2
x2
w 250m 6k @24
```

**[v2] This is the skill's own canned Keystone block, already pasted and
already walked** — v1 invented `Walk Freeze | AT | 2 / w 250m …`, which had
never been pasted, against the skill's rule that an unpasted block is
untrusted. Interval 1 is the case; interval 2 is abandoned.

## [v2] Done BEFORE James is invited, not with him sitting there

CLAUDE.md: "Finish builds, code review, desk debugging and capture
preparation before inviting James." v1 named none of this, so the cap would
have started while the stack built.

1. `bash scripts/walk-lab.sh up` from this worktree's `app/`, to green,
   and the printed HEAD confirmed as this branch. (Cold `--build --wait` is
   minutes; it happens before he is asked.)
2. **The whole capture path rehearsed with the FAKE monitor, no erg** —
   `VITE_ENABLE_FAKE_MONITOR=1` is already a build arg of this stack
   (`compose.e2e.yml`), and `transports/index.ts` wraps the real web
   transport in the recording tap behind that same gate. So connect →
   program → session → **END → TAP AGAIN** → `RECORDING · DOWNLOAD` is
   walked end to end at the desk and the downloaded file is decoded by the
   same script the walk will use. If the export is broken, it is found
   tonight, not at the erg.
   **[v4] The rehearsal takes the END path, not a natural finish.** The
   fake's default is a natural finish, so a rehearsal as v2 and v3 wrote it
   would confirm the one path this walk no longer takes, and the transition
   the ending ADDED — END → TAP AGAIN → saved row → download on a TERMINATED
   session — would go unrehearsed. Broken there, the walk would find out
   after James had already rowed, and the abort condition would fire on
   evidence that was never gathered.
3. The Keystone block pasted into `/library/import` on this stack, so the
   grammar is proven before he pastes it.
4. The evidence directory created with its README prefilled — date, branch,
   HEAD, the question, the four outcomes — so nothing is typed during the
   walk.
5. The decode script staged and run against an existing capture, so its
   output shape is known before it matters.

**The 20-minute cap starts when James sits down at a lab that is already
up and already rehearsed.**

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

`docs/monitor/sessions/walk-2026-09-15-work-clock/`, controller-owned, with
its README prefilled before the walk: the recording, the transcribed photo,
and the decode with its command. The finding lands in the number-provenance
spec §1.2, replacing the "[CORRECTED] not desk-answerable" paragraph with the
answer.

## [v2] What else this recording decides, for free

The walk's narrow return is candidate B alone — A and C are immune to the
answer (spec §4), which on its own is thin justification for an erg session.
The same recording also settles **whether M9 has a programmed-row sibling**:
M9 is 104.63 s of a free row erased from every axis including today's, and if
the work clock freezes on a programmed row too, the trace has silent holes on
the main session surface as well. That is true whichever axis wins.

**It is an analysis-plan item, never a second case** — no extra operator
action, no extra rowing, nothing added to the 20 minutes.

**And if James hesitates at all, the alternative is real:** take board 2 to
the gate with B carried at its MEASURED risk — the free-row freezes
quantified, the programmed case explicitly never observed in 17 recordings.
What is not allowed is striking B in a clause on an unmeasured cost (RF30).
