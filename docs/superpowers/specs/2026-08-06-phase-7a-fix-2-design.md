# Phase 7A-fix-2 — the status bitfield, and what it invalidates

**Date:** 2026-08-06
**Status:** Revised after adversarial review (same day); awaiting James's
review. Prior approvals: same branch/one PR; distinct failure reasons plus
GetErrorType logging, no retry machinery; one short hardware row gates the
merge.

## Why this exists

Hardware session 2 (PM5 432331249, 2026-08-06) plus three research passes
against Concept2's own SDK and spec established that
`app/domain/monitor/pm5/response.ts` misreads the CSAFE response status
byte. The byte is a bitfield — bit 7 (`0x80`) a frame-count toggle, bits
4-5 (`0x30`) the previous-frame status (`0x00` OK, `0x10` REJECT, `0x20`
BAD, `0x30` NOT READY), bits 0-3 (`0x0F`) the slave state — and our code
compares the whole byte to `0x01`. Every RECORDED status byte in both
hardware sessions was an acceptance (twelve captured acks: 5×`0x01`,
6×`0x81`, 1×`0x09`; roughly six further sends' bytes were never captured
— see §Re-derivation for the honest inventory).

**Authority:** `docs/monitor/pm5-interface-notes.md` §19 for citations
(csafe.h 747-766; PM3CsafeCP.h 131-156; Concept2's own main.cp; CSAFE
Communication Definition Table 9 p.11; the worked examples printing
successful responses as "81 or 01" with both checksums verifying). The
adversarial review of this spec (2026-08-06) additionally found two
defects in §19 itself, listed under §Corrections below — fixing them is
in this phase's scope.

What §19 withdrew (was OUR BUG): the status parse; D1's accept-rule; D2's
accept/reject alternation (the toggle); the driver going deaf after a
terminal state. What survives as real PM5 behaviour: forward-attributed
interval numbering including work→work boundaries (§19.8); no clear
command (terminate re-arms the SAME workout); programming atomicity with
non-self-describing rejects; SetScreenState's ack meaning queued, not
done.

**What the adversarial review reinstated — binding on this design:**

- **"An ack does not mean a program landed" SURVIVES.** Session 1's
  mid-JustRow send acked `0x01` — an accept under the old parse AND the
  new one — and programmed nothing (James read the monitor). The bitfield
  fix changes nothing about that reading. Mechanism, per the sources: mid
  JustRow the PM is in slave state OFFLINE ("user starts workout before
  equipment is configured") — not under CSAFE master control. An `"ok"`
  frame status is a statement about frame validity, not about a workout
  being loaded. This is WHY `verifyArmed` stays, stated correctly this
  time.
- **The `:00` empty display is UNRESOLVED and must be explained.**
  Session 1's clean A/B run: a 1-interval send acked and showed "a 1 min
  workout"; the following 2-interval send acked (0x81, misread then as
  reject) and the monitor showed an EMPTY session, `:00`/`:00`. That is
  the only human reading across a program-over-loaded transition in
  session 1, and it shows an accepted program NOT landing as sent. No
  conclusion that contradicts it may be assumed; see §Re-derivation.

## Decisions

| Question | Decision |
|---|---|
| Where this lands | **Same branch, one PR.** PR #52 stays draft until fix-2 is in. |
| Never-observed failure statuses | **Distinct reasons; GetErrorType fired once on a genuine reject, response logged as RAW HEX** (see §2 — full decode needs an unconfirmed pull path we do not build speculatively). No retry machinery. |
| Merge gate | **One hardware row with the corrected parse** (~8 min, James-operated, §8) before PR #52 leaves draft. |
| The withdrawn D1 model | **Re-derive from raw traces first** (§Re-derivation), with the honest inventory of what traces exist. |
| The pull path (GET commands) | **Not built in this drop.** Two wrapper candidates conflict across sources; nothing confirms the pull path over BLE. It becomes a §17 hardware item; `terminate()` uses the documented delay fallback (§7). |

## Re-derivation (the plan's first task — gates §3, §5, §6)

Re-read the captured traces under the corrected parse and record, per
send: frame status (bits 4-5), slave state (bits 0-3), toggle (bit 7).
The honest inventory of what exists:

- **Session 1 has NO raw trace.** The ledger records narrative ("ack
  0x01", "ack 0x81") for ~6 sends and one partial hex. Slave state and
  toggle are recoverable only where a whole byte was written down. The
  ledger entry must say so — no invented completeness.
- **Session 2 has four `exportLog()` dumps and ~6 uncaptured acks** (the
  three `program-two-time` sends between dumps 2 and 3 were never
  exported; among them the ONLY program ever sent to a PM parked in
  WorkoutLogged). The ledger must record which sends have bytes and which
  are narrative-only.
- **Dump 1 is from an older build than dumps 2-4** (no clear step; no
  "(machine reported N)" suffix; HR 0 not null; and its `intervalComplete`
  is the known-corrupt mixed-boundary pairing that `ba180c3` fixed — its
  index byte is a wire fact, everything else in that event is not). The
  ledger records per-dump build provenance so nothing is re-derived from
  mismatched instrumentation.

Outcomes this task must produce: (a) the per-send table; (b) an
explanation of the `:00` display, or its explicit survival as an open
hardware question; (c) a verdict on whether "program-over-loaded
works" — for which the discriminating evidence is the rest-30 → no-rest
contrast (dump 3 sent `rest 0` over an accepted `rest 30` program, and
the subsequent row went rowing → finished with NO resting state), not the
byte-identical repeat sends. If the traces cannot support the clear
step's removal, §3's change does not happen and the divergence goes to
James — a new hardware finding is outside this spec's authority.

## Design

### 1. The parse (`domain/monitor/pm5/response.ts`)

```ts
export type CsafeFrameStatus = "ok" | "reject" | "bad" | "not-ready";
export type CsafeSlaveState =
  | "error" | "ready" | "idle" | "have-id" | "in-use"
  | "paused" | "finished" | "manual" | "offline" | "unknown";
export type CsafeResponse =
  | {
      kind: "parsed";
      frameStatus: CsafeFrameStatus;  // bits 4-5 (0x30)
      slaveState: CsafeSlaveState;    // bits 0-3 (0x0F)
      frameToggle: boolean;           // bit 7 (0x80) — NEVER tested for failure
      commandIds: number[];
    }
  | { kind: "unparseable" };          // bad checksum / flags / truncation
```

The `unparseable` member is NEW and required: today a garbled frame is
returned as `{status: "reject"}`, indistinguishable from the machine
saying no — that conflation is part of the original bug. `bad` means THE
PM SAID SO; a frame we could not even validate is neither that nor any
other machine statement. Bit 6 (`0x40`) reserved, never asserted. `0x04`
in the low nibble → `unknown`. `REJECT_STATUS_BYTE = 0x81` retired; the
KNOWN-WRONG banner comes off in the fixing commit.

`buildAckFrame` (and the fake through it) synthesises all four frame
statuses, any slave state, either toggle, and an OPCODE ECHO — real
hardware echoes the command list, and the fake's current empty echo
leaves echo parsing untested. Two existing tests assert exact ack bytes
(`driver.test.ts` ~2374's single `expectedAckHex`; `response.test.ts`
177-196) and will need updating for non-bug reasons — budgeted, not
discovered.

### 2. Driver consequences (`src/monitor/driver.ts`)

- An ack succeeds on `frameStatus === "ok"` alone.
- `ProgramRejectionReason` gains `"bad"`, `"not-ready"`, and `"garbled"`
  (the unparseable case — today misfiled as nak). `"nak"` now means a
  GENUINE reject (`(status & 0x30) === 0x10`).
- On a genuine reject: fire ONE `CSAFE_PM_GET_ERRORTYPE` (**0xC8**,
  csafe.h:513) and log the response as **raw hex, no decode claims**. The
  full decode needs the pull path (§7's problem — 0xC8 lives in the
  pull-data command space, NOT under the `0x76` push wrapper this codec
  speaks; CSAFE-DEF's own pull example uses wrapper `0x1A`, csafe.h's
  partitioning implies `0x7F` — unresolved). We send via `0x1A`, matching
  the doc's worked example and our own R3 conformance vector, and record
  the raw reply. The ≥50 ms inter-frame gap (CSAFE-DEF Table 10) is
  satisfied by the BLE ack round trip itself — stated here so nobody adds
  a wall-clock delay.
- Slave state from every ack goes to the event log.

### 3. The clear step — re-justified, not deleted

The adversarial review killed the deletion: Appendix E documents
terminate as **the exit from WorkoutLogged** (a naturally-finished PM
parks there and does NOT self-rearm; §19.4 calls terminate "the
documented client recovery path"). Deleting the step would remove the
one documented transition out of the parked state exactly where §8 step 3
needs it.

So: `program()` KEEPS its leading terminate, re-justified — it is not a
"clear" (nothing clears; terminate re-arms the same workout) but the
documented path to WaitToBegin from parked/mid-session states. Its
rejection remains swallowed (a terminate with nothing running is refused
— now legible as a genuine machine statement). The comment and log kind
rename from "clear" to what it is (`prepare` / `prepare-rejected`).
`verifyArmed` stays as the completion signal. If §Re-derivation
additionally shows program-over-loaded works without the step, that is
recorded as robustness, not grounds for removal.

### 4. The terminal latch becomes run-scoped — with the run owned by `program()`

The latch's job (protecting a finished run's record from Appendix E's
auto-rearm cycle) survives, scoped correctly. The auto-rearm hazard is
real: after a TERMINATED workout the PM transitions
Terminate → Rearm → WaitToBegin unaided, so any state-driven "new run"
trigger would let the machine's own noise fabricate runs. Therefore:

- **A run is opened by `program()` and only by `program()`.** No
  state-driven run opening exists. (A future JustRow-follow mode would be
  its own designed feature.)
- Within an open run: actuals accumulate, `workoutComplete` fires once,
  the record is immutable afterward.
- After a terminal state the driver KEEPS consuming frames and events —
  no deafness, no reconnect. Session 2's evidence (zero frames after
  `workoutComplete`, instant resumption on reconnect) is the regression
  test's shape.
- Boundary events arriving OUTSIDE an open run (user-driven workouts,
  post-run noise) are emitted with `index: null` plus a log entry — never
  minus-1'd into a program they don't belong to, and never accumulated
  into the closed run's actuals.
- `finished` and `terminated` are NOT the same shape: finished parks in
  WorkoutLogged (exit = Menu or terminate); terminated auto-rearms. The
  driver treats both as closing the run; `terminate()`'s own use and §8's
  row cover the finished-side exit.
- `terminalLatched` has a second consumer — the post-terminal disconnect
  classification (driver.ts ~456-464). It gets a run-scoped replacement
  (disconnect after the CURRENT run closed is expected), not deletion.
- Consumer-visible contract, stated: `intervalComplete` never arrives
  after that run's `workoutComplete`; out-of-run boundaries are
  identifiable by `index: null` + the log.

### 5. Index normalization — minus-1, SCOPED, not "always"

The evidence is two actual readings from one program shape (2×TIME):
session 1's final boundary `2`→`1` (rest) and session 2's no-rest first
boundary `1`→`0`. Both fit `machineIndex − 1`. Honestly noted: for
actuals, "0-based counting attributed forward" and "1-based naming the
completed interval" are arithmetically identical — the rule is robust to
both stories, and the forward-attribution narrative belongs to 0x0033's
observations, not the actual path's.

The rule, scoped:

- **Actuals (0x0037/38): program index = machineIndex − 1, clamped,
  WHEN a run this driver opened is active and the machine state is
  `rowing`/`resting`.** Everything else — mid-terminate boundaries
  (CSAFE-DEF footnote 12 p.25: the value "will change depending on where
  you are in the interval when the workout is terminated"), post-terminal
  pairs, out-of-run splits (a user's JustRow auto-splits are
  "Split/Interval Numbers" too, and slave state OFFLINE is the documented
  our-program-armed-but-user-rowing case) — is `null` + log. The state
  guard on the actual path SURVIVES; what dies is the rest-keyed offset
  choice within it.
- **Live frames (0x0033): the state-keyed rule is unchanged.**
- Unobserved shapes, named as unobserved: middle boundaries, distance
  intervals, single-interval programs, a first boundary WITH rest on the
  current build, mid-interval terminate. The merge row (§8) converts two
  of these; the rest stay §17 items.
- `index-unverified` RETIRES: its no-rest trigger is answered (§17 item
  13), and its residual condition is indistinguishable from
  `divergence`. Removal is recorded with a CORRECTION note in the notes.
- Caveat recorded in the notes: the driver's own pairing gate enforces
  0x0037/38 agreement before emitting, so "both halves agree" is
  enforced, not evidenced; and the no-rest boundary's raw hex was never
  captured (only `notify-first` logs hex) — the re-derivation cites the
  decoded log line, not bytes.

### 6. The fake stops modelling the withdrawn machine (`src/monitor/transports/fake.ts`)

- Reject-when-loaded and the destructive wipe GO. The fake accepts and
  replaces.
- **The fake toggles bit 7 on every response frame** — any whole-byte
  status comparison then fails half the suite. (`response.ts` is the only
  CSAFE status parser in the codebase — verified by the adversarial
  review — so this closes the class; the two exact-byte tests in §1's
  budget are updated, not silenced.)
- The fake's happy path varies slave state (`ready`, `offline`,
  `in-use`) so low-nibble over-reads get caught.
- The fake echoes opcodes in its acks (§1), ending the untested-echo gap.
- A genuine `0x11` reject and a garbled frame are SCRIPTABLE, each marked
  never-observed / synthetic.
- Tests pinning D1 by name are removed or rewritten with the correction
  convention. The `clear-*` log kinds' rename (§3) updates their trace
  anchors.

### 7. SetScreenState is asynchronous — handled by the documented delay, not an unconfirmed GET

Its ack means "queued" (§19.6). The obvious fix — poll
`CSAFE_PM_GET_SCREENSTATESTATUS` (0x86) — is NOT buildable honestly in
this drop: 0x86 lives in the pull-config space (wrapper `0x7E` by
csafe.h's partitioning, `0x1A` by CSAFE-DEF's own worked pull example —
the sources conflict), the response carries data our response path
cannot decode, and NOTHING confirms the pull path over the BLE CSAFE
channel at all (the SDK is pre-BLE; the PDF is transport-agnostic; this
codec has never sent a non-0x76 command to hardware).

So: `terminate()` waits the documented fallback — CSAFE-DEF p.65's
"delay 1 second or more", expressed as a tick bound (no wall clock) —
before resolving. Programming keeps `verifyArmed`. The pull path
(wrapper question included) becomes a §17 hardware item: one GET sent
from the lab, raw reply captured, settles wrapper + transport + decode
in a single observation. GetErrorType (§2) shares that item's answer.

### 8. The merge-gate row (~8 min, James-operated)

With the corrected parse, from the main menu:

1. `program-two-time` → expect the first CLEAN end-to-end accept:
   `frameStatus "ok"`, verifyArmed resolves, no rejection in the trace.
2. Row both intervals (short) → actuals with OUR indices 0 and 1
   (converts "first boundary WITH rest" from unobserved to observed),
   `workoutComplete` once.
3. WITHOUT reconnecting: **`program-no-rest`** — a DIFFERENT program, so
   acceptance-over-loaded is distinguishable from
   was-already-the-same. James reads the monitor: does it show the
   no-rest workout?
4. Row through its first boundary → proves the driver opens a new run
   after a completed one (the §4 fix, on hardware, not just CI) and
   re-checks minus-1 at no-rest within a driver-opened run.
5. `program-many` (25 distance intervals, 7 frames) → NO rowing; James
   reads the monitor's interval count. The corrected parse changes this
   path most: the old code aborted at frame 0's misread "reject", so
   multi-frame programming HAS NEVER COMPLETED on hardware, and every
   ≥5-interval library workout takes it. Distance intervals have likewise
   never been observed accepted. One send converts both.

Expected-vs-observed to §18 under a session-3 heading; a disagreement is
a finding. Step 5's certification honesty: rowing verifies single-frame
TIME end-to-end; steps 3/5 verify acceptance + monitor display for
no-rest TIME and multi-frame DISTANCE, not their full run lifecycle. PR
#52 leaves draft only after this row and James's explicit approval.

## Corrections to §19 (in scope, first task alongside re-derivation)

The adversarial review found these in the notes themselves:

- **§19.2 wrongly withdraws "an ack of 0x01 does not mean a program
  landed."** That observation survives the bitfield fix (see the
  reinstatement above); §19.2's "Does NOT survive" line is corrected.
- **§19.1's "not one genuine rejection was ever observed"** overstates:
  correct to "none of the twelve RECORDED status bytes was a rejection;
  ~6 sends' bytes were never captured".
- **§19.5's verdict label** applies REAL-DOCUMENTED to a documented
  ABSENCE: what is documented is terminate→Rearm; "no clear command
  exists" is an exhaustive-search negative with two untested candidates.
  Relabel; also record the WorkoutLogged asymmetry (terminate from
  WorkoutLogged goes straight to WaitToBegin, not via Rearm).
- **§19.9's restated justification** leans on per-field sentinels to
  defend mapping both sentinels on all three fields; the load-bearing
  argument is the field-independent one already in `parse.ts` (no rower
  has an HR of 0 or 255). Align the wording.
- **§19.8 gains the build-provenance caveat** for dump 1 (§Re-derivation)
  and the pairing-gate/no-raw-hex caveats (§5).

## Testing

Unchanged bar: every OUR-BUG item gets a test that fails against today's
code. At minimum: `0x81` parses as accept; toggle alternation across a
multi-frame sequence never fails a send; genuine `0x11` → reason `"nak"`
+ GetErrorType raw-hex log; garbled frame → `"garbled"`, distinct from
`"nak"`; frames after a terminal state still produce events and
`program()` works without reconnect; auto-rearm noise opens NO run;
out-of-run boundary → `index: null` + log, never an actual in the closed
run; no-rest boundary within a driver-opened run → minus-1, no
`index-unverified` (the kind no longer exists). Parse vectors per frame
status × toggle × echo shape. The re-derivation table lands in the
ledger with per-send citations and the S1/S2 inventory caveats.

## Out of scope

7B's screens; the belt-presence query; retry policies for Bad/NotReady;
the pull path (GET commands — §17 hardware item, shared by
GetErrorType's decode and SetScreenState's status); structural readback
of an accepted program (§17 item 12); the two untested clear-command
candidates; a JustRow-follow mode (out-of-run boundaries are logged, not
modelled).

## Exit criteria

- The status byte is parsed as the bitfield Concept2 defines; garbled
  frames are distinct from machine statements.
- The re-derivation table is in the ledger, with the trace inventory's
  gaps stated, dump 1's build provenance recorded, and the `:00` display
  either explained or standing as an open finding.
- `program()` keeps a re-justified prepare step and resolves on
  machine-state evidence.
- A completed run never blinds the driver; runs are opened only by
  `program()`; auto-rearm cannot fabricate one.
- Actual indices are minus-1 within a driver-opened active run and
  `null` with a log entry otherwise; `index-unverified` is retired with
  a correction note.
- The fake toggles bit 7, echoes opcodes, and models the machine we met;
  `0x11` and garbled frames are scriptable.
- §19's five corrections are in.
- The KNOWN-WRONG banner is gone because the code is right.
- The merge-gate row (all five steps) is run, recorded in §18, and PR
  #52 has James's explicit approval.
