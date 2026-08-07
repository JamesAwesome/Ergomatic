# Phase 7A-fix-3 — program over a live piece

**Date:** 2026-08-06
**Status:** Approved (James, 2026-08-06: settle + readback, both; fix-3
lands before 7B implementation starts)

## Why this exists

Hardware session 3 (PM5 432331249, 2026-08-06, `docs/monitor/
pm5-interface-notes.md` §18 session 3) found and reproduced the one
defect the merge-gate row surfaced: **programming over a RUNNING workout
arms an empty workout** — the send acks clean, `verifyArmed` passes, and
the monitor shows `:00` with no interval structure (rowed past the first
interval's length: no boundary). Reproduced twice with unrelated program
shapes (25×100m r0 and 3×500m r60 — the second a shape that had armed
perfectly minutes earlier), after a seven-probe bisect cleared every
shape variable. The condition is machine state, not program shape:
`program()`'s prepare step terminates the running piece and the frames
land during the PM's own post-terminate transition (Appendix E's
auto-cycle, via §19's newest entry — REAL PM5 BEHAVIOUR, UNDOCUMENTED).

Two facts sharpen the stakes:

- **Both empty arms passed `verifyArmed`.** A bare "armed" reading is
  not evidence of structure — §17 item 12's upgrade, twice-justified by
  hardware in one afternoon.
- Programming from settled states (main menu, armed-unstarted, finished/
  WorkoutLogged) worked cleanly in seven out of seven probes plus all
  five runsheet arms.

Also owed from session 3, item 15: the idle-terminate ack was captured
(`f1 81 76 01 13 e5 f2` — toggle set, previous frame OK, slave READY):
**the PM ACCEPTS a terminate when idle. The "refusal when nothing is
loaded" never existed** — it was the status-byte misparse. The fake still
models the refusal, and the prepare comments still call rejection
"expected".

## Decisions

| Question | Decision |
|---|---|
| Remedy shape | **Both.** The settle prevents the known case; the readback converts ANY residual silent failure into a typed rejection. Detection is the load-bearing half — it is the only check that would have caught both empty arms. |
| Sequencing | **Fix-3 before 7B implementation.** 7B's programming UX designs against verification semantics this phase changes (a new rejection reason, new timing). Spec work may overlap; implementation does not. |
| Item 12 | **First task, gates the readback.** Archives first, hardware only if they don't settle it. A "no" answer is a tripwire to James — detection at this layer would be impossible and the design changes. |
| Retries | None, consistent with the phase. A structure mismatch rejects; the caller decides. |

## Design

### 1. Item 12 first — does 0x0031 echo the armed program?

The readback requires that the GATT status characteristic's
`workoutType`/`workoutDuration` fields reflect the accepted program.
Recorded as unconfirmed since fix-1 (§17 item 12). Answer it from
evidence already in hand before touching code:

- The archived session logs (`pm5-session3-final.log` and the session-2
  log) hold raw 0x0031 `notify-first` hex captured on connections where
  the armed program is KNOWN (several connections, several distinct
  known programs — including at least one `:00` empty arm). Decode the
  duration/type fields (`parse.ts`'s own offsets) per capture and tell
  the story: do they match the armed program? Does the EMPTY arm read
  duration 0?
- If the archives are insufficient (the `notify-first` moment may
  predate the arm on some connections): ONE lab reading, James-operated,
  ~2 minutes, no rowing — arm a known program from the main menu, dump,
  read the raw 0x0031 bytes. The runsheet item states exactly this.
- **Tripwire:** if the answer is NO (the fields do not echo the
  program), STOP — the readback as designed is impossible, the
  remaining path is the pull-path GET (§17 item 14, out of scope), and
  the redesign goes to James. Do not improvise an alternative.

### 2. The readback — verification learns structure (detection)

`verifyArmed`'s predicate extends. Resolution now requires, on a fresh
post-send status tick:

- `state === "armed"` (unchanged), AND
- **the structural fields match the program's FIRST interval**:
  `workoutType` is the variable-interval type (exact ordinal per item
  12's answer), and `workoutDuration` equals interval 0's value in the
  wire's units (time in the parse's documented resolution; distance in
  metres — cite `parse.ts`'s existing decode, which already extracts
  both fields; this is plumbing, not new protocol).

Deliberately minimal: 0x0031 cannot describe 25 intervals, and full
structural verification is not the claim. The claim is exactly what the
hardware demands: both observed empty arms read `:00` — duration 0 —
so a first-interval check catches the entire observed failure class,
and any FUTURE silent-arm variant that zeroes structure.

On expiry of the existing `verifyTicks` bound without a matching tick:
`ProgramRejection` with the NEW reason `"structure-mismatch"`, the
observed type/duration vs expected in the rejection detail, full trace
in the log. `ProgramRejectionReason` gains the member; no other reason
changes meaning. A tick that is armed-but-mismatched is recorded in the
event log when first seen (one entry, not per tick) so the trace shows
verification REJECTING structure, not merely waiting.

### 3. The settle — conditional prevention

In `program()`'s prepare path only: if the prepare terminate fired while
the machine state was `rowing` or `resting` (a RUNNING piece — the
driver knows its last state), wait — tick-bounded, reusing the
`settleTicks` idiom and default — for a post-terminate status tick
showing a settled state (any state that is NOT `rowing`/`resting` —
the observed post-terminate cycle passes through terminated/armed;
which exact state ends the wait is the implementer's to pin from the
session-3 traces, not to guess) before sending programming frames. Programs
from settled states (the overwhelmingly common path, and 7B's only
planned path) pay nothing. The mid-session path pays ~1.5s to land
reliably. The mechanism comment cites §19's entry and Appendix E's
auto-cycle, and states plainly that the settle is PREVENTION built on
the observed correlation — the readback (§2) is what guarantees
detection if the mechanism theory is incomplete.

### 4. The fake learns the defect — and drops the withdrawn refusal

The fake models the machine session 3 met (the CI-teachability of the
whole fix):

- **The empty arm is modelled**: programming over a RUNNING fake
  workout without adequate settling arms EMPTY — armed state, structure
  zeroed (duration 0), no boundaries ever. Cited to §18 session 3.
- **The fake's status stream carries structure**: its 0x0031 frames
  encode the loaded program's type and first-interval duration (via the
  existing statusFrames builders — extend, don't fork), so the readback
  is exercisable end to end.
- CI then proves both remedies: a driver `program()` over a running
  fake workout SUCCEEDS with structure (the settle prevented the empty
  arm), and a SCRIPTED empty arm (a fake knob forcing the zeroed-
  structure arm regardless of settling) is caught as
  `"structure-mismatch"` — never silent. Both must fail against today's
  code.
- **Item 15's obligations**: `onClearingFrameComplete`'s idle-refusal
  GOES (the real byte says accepted; the fake stops modelling a refusal
  that never existed — commit body cites §18 session 3 item 15).
  `sendPrepare`'s comments and log wording stop calling rejection
  "expected when nothing was loaded"; a prepare rejection is now
  NEVER-OBSERVED (the swallow rule itself stays — Task 3's reviewed
  rule, unchanged — only the justification updates).

### 5. The merge-gate row (~3 min, James-operated)

1. If item 12 needed the lab reading and it hasn't happened: that first
   (arm a known program from main menu, dump — no rowing).
2. The repro, against the fix: row ~20m into any piece, program over it.
   **Expected: EITHER a clean structured arm (settle worked; the
   monitor shows the real workout, confirmed by its first-interval
   display) OR a typed `structure-mismatch` rejection — and NEVER an
   ack-verified `:00`.** Either outcome passes; the silent case is the
   only failure.
3. One short row into the newly-armed program (first boundary) confirms
   structure end-to-end.

Expected-vs-observed to §18 under a session-4 heading, slots pending
until run. A disagreement is a finding. The branch merges on green +
the row + James's explicit approval, per the house rule.

## Testing

The bar is unchanged: every behaviour here gets a test that fails
against today's code. At minimum: the scripted empty arm → 
`"structure-mismatch"`, never resolution (fails today: it resolves);
program-over-running-fake succeeds WITH structure via the settle (fails
today against the defect-modelling fake); the settle does NOT fire for
settled-state programs (latency pin — no added ticks on the common
path); the readback tolerates the armed-but-mismatched tick arriving
BEFORE a matching one (order-independence); `structure-mismatch`'s
detail carries observed-vs-expected; the fake's idle-terminate now acks
accepted and the refusal tests are removed/rewritten with the
withdrawal named. Mutations: disable the settle → the prevention test
dies; disable the structure predicate → the scripted-empty-arm test
dies (and dies on an ASSERTION, not a timeout); revert the fake's
refusal → its removal test dies.

## Out of scope

P3b (a failed program during an open run — 7B's spec owns it); the
pull-path GETs (§17 item 14); retry policies; full multi-interval
structural verification (0x0031 cannot express it; item 14's answer is
the future path if ever needed); 7B's screens.

## Exit criteria

- Item 12 answered with cited evidence (archives or one reading), or
  the tripwire fired and the redesign went to James.
- `program()` over a running piece either arms with verified structure
  or rejects `"structure-mismatch"` — the silent empty arm is
  impossible in CI and unobserved on hardware (session-4 row).
- The common-path latency is unchanged, pinned by test.
- The fake models the empty arm, carries structure in its status
  stream, and no longer models the idle-terminate refusal.
- §18 session 4 recorded; §17 items 12/15 dispositioned; ROADMAP's
  fix-3 checklist closed.
- Green + the row + James's explicit approval before merge.
