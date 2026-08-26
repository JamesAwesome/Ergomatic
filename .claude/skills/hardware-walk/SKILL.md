---
name: hardware-walk
description: Conduct a PM5 hardware walk end to end — boot the lab, import walk workouts, step James through the erg session under the operator contract, gather every log yourself, close out and tear down. Use when James says he is ready for a walk, a phase-exit walk is due, or a spec's merge gate needs hardware validation.
---

# hardware-walk

You are conducting a hardware walk: James at his erg + PM5, you at the
controls. Your output is a completed walk record (recordings, photos
transcribed, findings) in `docs/monitor/sessions/walk-<date>/`, produced
with the least possible rowing and hand-gathering from James.

Every rule in the operator contract below exists because its violation
happened and cost a session. Do not relax them.

## Phase 0 — plan BEFORE booting anything

Compose the session plan from the walk's purpose (the phase's walk items,
a spec's exit criteria, or James's ask). The plan is presented for
approval before any docker command runs, in this exact shape:

    WALK PLAN · <purpose, one line>
    Total rowing: <N pieces, ~X min of actual work — the BUDGET>
    Piece 1: <workout name> — proves <what> — row to <completion | "abandon
      whenever; the first N seconds are the evidence">
    Piece 2: ...
    Captures you'll be asked for: <count, each named, each landing in a
      rest or between pieces>
    Phone needed: <NO (default) | YES because <walk item>>

**SHORTEST INTERVAL THAT PROVES THE POINT — James, 2026-08-26: *"our skill
should instruct you to recommend short intervals. a 500m interval is not short.
a 250 would be preferred."*** Pick the interval length from what the leg has to
OBSERVE, never from what looks like a normal workout. A leg that needs a rest
BOUNDARY needs to reach a boundary — 250 m gets there in half the rowing of
500 m and proves exactly as much. A leg that needs a long grid needs many
intervals, not long ones. **Default to 250 m or 1 minute unless the leg names a
reason it cannot work.** This cost him a 500 m interval on the Phase LM walk to
observe something a 250 would have shown.

**A leg's stated cost includes GETTING INTO the state it needs.** The same walk
carried a leg advertised as "~10 seconds, no extra rowing" that silently
required a full work interval first to reach a rest. If the rower is not
already in the required state, the cost of arriving is part of the leg's
budget and is stated in the plan.

**The budget is binding.** No instruction mid-walk may add rowing beyond
it or convert an "abandon whenever" into "row to completion". If a
mid-walk discovery genuinely needs more rowing, STOP, present a revised
budget, and get an explicit yes — the same rule as a fast-path escalation.
Conflicting rowing amounts ("no rowing required" followed by "please
finish the piece") is a named past failure; the per-piece
completion-vs-abandon declaration in the plan is what prevents it.

## The operator contract (binding during the session)

- **One instruction at a time, then STOP and wait** (this repo's
  hardware-session-pacing rule). Nothing is asked mid-piece — James is
  operating a rower. Instructions land before a piece or during rests.
- **At most ONE capture ask per rest**, and rest lengths in the canned
  workouts (r60+) exist to make it unhurried. Anything needing two hands
  or two devices waits for the between-pieces gap. Never queue two asks.
- **Laptop first, always.** Chrome on the laptop is the walk medium (Web
  Bluetooth + the recording tap live there). The phone appears only when
  a walk item is explicitly about the phone, and the plan said so.
- **Name the real mechanism for every step.** A tap must name a control
  that exists on the screen he's looking at; anything else is a
  paste-ready console command or curl. If you are not CERTAIN the control
  exists (you've read the component this session), give the console
  command instead. Asking for taps that don't exist is a named failure.
- **Backdoor login is printed BEFORE the browser opens** — it's on the
  lab card (`walk-lab.sh up` prints it). If auth appears anyway, reprint
  the card; never make him hunt.
- **Verify frames are live before asking him to row** (pacing memory), and
  ask for a signal that EXISTS in the state he is in: **at READY nothing
  ticks** — the ghost target and the word READY are themselves rendered
  from live frames, and no number moves until he pulls (James, 2026-08-19:
  "numbers dont tick at the ready screen"). Ask him to confirm the screen
  says READY; ask for moving numbers only mid-piece, never as the go signal.
- **Say out loud whether the walk needs HEART RATE, in the plan and before
  the piece** (James, 2026-08-19: "make sure to be explicit when you need
  heart rate info"). A belt is a thing he has to go and put on; discovering
  mid-analysis that the trace has no `hr` is discovering it too late. If an
  item's evidence is better with HR — or if the item IS the still-unwitnessed
  question of whether his belt delivers at all — the plan says so under
  "Phone needed", and the pre-piece instruction repeats it.

## Phase 1 — lab up

From the worktree's `app/`:

    bash scripts/walk-lab.sh up

Prints the operator card: URL, paste-ready backdoor login, the
recording-download reminder, teardown command. Compose stack is
per-worktree (stack-env), prod-shaped for the branch under test,
TEST_AUTH_SECRET wired. Confirm the printed worktree HEAD is the branch
the walk validates. Then attach yourself to the evidence streams so
James never hand-gathers what you can reach:

- `bash scripts/walk-lab.sh logs` in a background shell — the api
  container's stream, yours to watch, never his to copy.
- After each session, the RECORDING (raw wire bytes) comes from the log
  screen's `RECORDING · DOWNLOAD` row — one tap, ask for it in the
  post-piece gap. NEVER via console `download()` (drops the header's
  program — walk-2026-08-16's lesson).
- The diagnostics ring survives navigation in sessionStorage
  (`ergomatic:last-rowed-log`); if you need it, give him the one-liner:
  `copy(sessionStorage.getItem("ergomatic:last-rowed-log"))` — one paste
  back, not a hand-transcription.
- Photos are the ONLY evidence he hand-gathers: same-frame shots (PM5 +
  laptop in one frame) at rests, one per rest max. The PM5's REST screen
  shows the live session total; the END screen shows no total — plan
  totals-comparison photos at rests, never at the finish.

## Phase 2 — workouts in

Import via `/library/import` (the bulk paste door) — give him the block
to paste, or paste it yourself if you're driving the browser. The canned
set, each named for what it proves (grammar: `N | title | TYPE |
difficulty | pain` header, then step lines):

    90 | Walk Smoke | O2 | easy | 1
    w 1' 6k @20

Proves connect → program → frames with seconds of paddling. The grammar
has no seconds unit (minutes/meters only — verified against `parseBulk`),
so the piece is nominally 1', but it is ABANDON-SAFE by declaration: the
first 10 seconds already prove the frames; stop whenever.

    91 | Walk Keystone | AT | medium | 2
    x2
    w 250m 6k @24

The totals oracle: 2×250 back to back, a-priori truth 500 m, no coast
metres to argue about. Row both to completion (that IS the point of this
one) — ~2 min total.

**No `r0` token, and this matters — the block above USED to carry one and
could not import at all** (found 2026-08-18, when James pasted it and got
`Step 1: rest 0.01..60:00`). The grammar cannot express a zero rest:
`validate.ts` rejects any `restMinutes` outside 0:01..60:00, so "no rest"
is expressed by OMITTING the token, which compiles to `restSeconds: 0`
(the same shape `e2e/connected.spec.ts`'s own `w 100m max` fixture
asserts). Every canned block here should be pasted at least once before
it is trusted; these had never been.

    92 | Walk Rests | AT | medium | 2
    w 1' 6k @22 r1
    w 500m 6k @24 r1
    w 1' 6k @22

The rest-bearing shape (work→rest boundaries exercise the register
clamp; r60 rests give unhurried capture windows). ~4 min of work,
two 60 s rests, each rest = one capture window.

Scale or swap pieces per the walk's purpose, but keep the properties:
smoke stays abandon-safe, keystone stays rest-free (no `r` token at all),
the rest-bearer keeps rests ≥ 60 s. State each piece's minimum-rowing
truth in the plan.

**A walk that only needs the SCREEN needs no rowing at all** — connect,
let the program arm, tap "Show me the numbers", and the surface renders
with its full grid. Gesture, layout and legibility walks should say so
explicitly rather than budgeting strokes they do not need. For anything
that must exercise a long grid, use a piece with enough intervals to
overflow the scroller (≥9 landscape, ≥16 portrait).

## Phase 3 — the session

Run the plan piece by piece under the contract. For each piece:

1. One line: what to select, what to press, "go when ready" — then wait.
2. During work: silence. Watch the api logs and (if the connected screen
   is visible to you via a shared screen or his report) note anomalies;
   never interrupt a piece for one.
3. At each rest: the ONE capture ask for that rest, if the plan has one.
4. Between pieces: recording download ask, ring one-liner if needed,
   next piece's single instruction.

If something breaks mid-walk: prefer "abandon, we have enough" over
"row again" — a partial recording is usually sufficient evidence, and
re-rows cost his body. Only re-row if the evidence genuinely requires
it AND the budget (revised, approved) covers it.

## Phase 4 — close-out (yours, not his)

1. Gunzip recordings → `docs/monitor/sessions/walk-<date>/` with a
   README: provenance table (which piece, which file), photo
   transcriptions labeled by evidence stream (SCREEN vs wire), findings.
2. Compute the wire-side checks yourself from the recordings (0x0031
   inter-arrival vs the ~2.2/s baseline; TWD vs accumulator at rests) —
   never ask him for numbers a recording already holds.
3. Photos: ask him to drop them in a Desktop folder; transcribe every
   one the same day (untranscribed photos went stale once and hid the
   overcount's true onset).
4. **Teardown, performed not requested**: `bash scripts/walk-lab.sh
   down`. Ask "keep the stack?" ONLY if he said he's iterating; default
   is down. Forgotten stacks are a named failure — stack-reap is the
   net, not the plan.
5. Commit the walk record on whatever branch the walk served (PR-only
   main rules apply — usually it rides the phase's open PR or its own
   docs PR).

## What this skill never does

- Never asks for two things in one rest.
- Never asks for the phone when the laptop can do it.
- Never invents a UI control — console command if uncertain.
- Never exceeds or converts the rowing budget without a revised,
  approved plan.
- Never leaves the stack up silently, and never leaves photos
  untranscribed past the same day.
