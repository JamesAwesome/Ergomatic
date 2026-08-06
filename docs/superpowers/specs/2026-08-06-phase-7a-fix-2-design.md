# Phase 7A-fix-2 — the status bitfield, and what it invalidates

**Date:** 2026-08-06
**Status:** Approved (James, 2026-08-06: same branch/one PR; distinct
failure reasons plus GetErrorType logging, no retry machinery; one short
hardware row gates the merge)

## Why this exists

Hardware session 2 (PM5 432331249, 2026-08-06) plus three research passes
against Concept2's own SDK and spec established that
`app/domain/monitor/pm5/response.ts` misreads the CSAFE response status
byte. The byte is a bitfield — bit 7 (`0x80`) a frame-count toggle, bits
4-5 (`0x30`) the previous-frame status (`0x00` OK, `0x10` REJECT, `0x20`
BAD, `0x30` NOT READY), bits 0-3 (`0x0F`) the slave state — and our code
compares the whole byte to `0x01`. Every "rejection" observed in both
hardware sessions was an acceptance. Several conclusions recorded as PM5
behaviour were consequences of that parse.

**Authority for every claim here:** `docs/monitor/pm5-interface-notes.md`
§19, which carries the citations (csafe.h 747-766; PM3CsafeCP.h 131-156;
Concept2's own main.cp decoding the byte three ways; the CSAFE
Communication Definition's Table 9 p.11 and its worked examples printing
successful responses as "81 or 01" with both checksums verifying). This
spec adds no new hardware findings — it is §19's fix list, designed.

What §19 withdrew (was OUR BUG): the status parse itself; D1 "accepts only
when nothing is loaded"; D2 "identical bytes, both accept and reject"
(fully explained — the toggle alternates); the driver going deaf after a
terminal state (the monitor never stops responding; Appendix E documents
the recovery path). What survives as real PM5 behaviour: forward-attributed
interval numbering including work→work boundaries (§19.8, undocumented
anywhere — our two readings are the only evidence); no command clears a
loaded workout (terminate re-arms the SAME workout); workout programming is
atomic and a reject is not self-describing (GetErrorType); SetScreenState's
ack means queued, not done.

## Decisions

| Question | Decision |
|---|---|
| Where this lands | **Same branch, one PR.** PR #52 stays draft until fix-2 is in; nothing false ever reaches main, and 7B starts from truth. |
| Never-observed failure statuses | **Distinct reasons + GetErrorType log.** Parse Reject/Bad/NotReady faithfully, type each, and on a genuine Reject fire one GetErrorType into the event log. No retry machinery for conditions with zero observations. |
| Merge gate | **One short hardware row with the corrected parse** (~5 min, James-operated) before PR #52 leaves draft. The branch's thesis is "the model matches the machine"; claiming it without one run of the corrected code repeats the original mistake. |
| The withdrawn D1 model | **Re-derive from raw traces first, then unpick.** The fake stops modelling reject-when-loaded/wipe only after the corrected re-read of both sessions' traces confirms what actually happened. |

## Design

### 1. The parse (`domain/monitor/pm5/response.ts`)

`parseCsafeResponse` returns structure, not a two-bucket verdict:

```ts
export type CsafeFrameStatus = "ok" | "reject" | "bad" | "not-ready";
export type CsafeSlaveState =
  | "error" | "ready" | "idle" | "have-id" | "in-use"
  | "paused" | "finished" | "manual" | "offline" | "unknown";
export interface CsafeResponse {
  frameStatus: CsafeFrameStatus;   // bits 4-5 (0x30)
  slaveState: CsafeSlaveState;     // bits 0-3 (0x0F)
  frameToggle: boolean;            // bit 7 (0x80) — NEVER tested for failure
  commandIds: number[];
}
```

Bit 6 (`0x40`) is reserved/unassigned in both sources — ignored, never
asserted. `offline` is documented as "rowing outside CSAFE master control"
(§19.3), not disconnected. A frame that fails CSAFE parsing (bad checksum,
missing flags) remains what it is today — unparseable, reported so the
driver treats the write as unacked — never disguised as one of the four
statuses. `REJECT_STATUS_BYTE = 0x81` and `SUCCESS_STATUS_BYTE`'s
whole-byte use are retired; the KNOWN-WRONG banner comes off in the same
commit that fixes the logic.

`buildAckFrame` (and the fake through it) must be able to synthesise all
four frame statuses, any slave state, and either toggle value — today it
cannot express a genuine reject (`0x11`) at all.

### 2. Driver consequences (`src/monitor/driver.ts`)

- An ack succeeds on `frameStatus === "ok"` alone — toggle and slave state
  never gate success.
- `ProgramRejectionReason` keeps `"nak"` (now meaning a GENUINE reject,
  `(status & 0x30) === 0x10`) and gains `"bad"` and `"not-ready"`.
  `"disconnected"`, `"timeout"`, `"not-observed"` are unchanged.
- On a genuine reject: issue ONE GetErrorType, record the answer in the
  event log, and carry it in the rejection's detail. No retries. (The
  plan pins the exact opcode from csafe.h/the spec; §19's sources name the
  command generically.)
- The slave state from every ack is recorded in the event log — free
  observability we currently discard.

### 3. The clear step dies — pending re-derivation

The plan's FIRST task re-reads both hardware sessions' raw traces under
the corrected parse and records, per send: the true frame status, slave
state, and toggle. Expected outcomes — TO BE VERIFIED, not assumed:

- every send in both sessions was accepted;
- "a rejection wipes the loaded workout" was actually "the accepted
  program REPLACED it" (mundane, correct behaviour);
- D2's "an accept programmed nothing" programmed fine.

If the traces confirm: `program()` drops the terminate-as-clear step
entirely. Terminate re-arms rather than clears (§19.5), and programming
over a loaded workout demonstrably works (session 2: the rowed workout WAS
the "rejected" program). `verifyArmed` STAYS — machine-state confirmation
costs ~half a second and remains the honest completion signal. If the
traces do NOT confirm, the divergence goes back to James before any code
changes — that would be a new hardware finding, outside this spec's
authority.

### 4. The terminal latch becomes run-scoped

The latch's legitimate job — protecting a finished run's record from the
PM's Appendix-E auto-rearm cycle (Terminate → Rearm → WaitToBegin) —
survives, scoped to the run instead of the driver's lifetime:

- After a terminal state (`finished`/`terminated`), the driver KEEPS
  consuming frames and events.
- The completed run's record is immutable: `workoutComplete` fires once
  per run; that run's actuals never regress or re-emit.
- A fresh cycle (armed → rowing) opens a NEW run context.
- No reconnect is ever required. Session 2's evidence (zero frames after
  `workoutComplete`; instant resumption on reconnect) becomes the
  regression test's shape.

### 5. Index normalization simplifies (`domain/monitor/pm5/intervalIndex.ts`)

Session 2 (§19.8) showed forward attribution is a property of the
split/interval characteristics, not of the resting state: at a no-rest
work→work boundary, 0x0037 reported `1` while 0x0033 reported `0`.

- **Actuals (0x0037/38): program index = machineIndex − 1, ALWAYS.**
  State-free. Fits both observed boundaries: session 1's final phantom
  `2` on a 2-interval workout → `1`; session 2's no-rest first boundary
  `1` → `0`. Clamped to `[0, programLength-1]`; `null` when unexplainable,
  exactly as today.
- **Live frames (0x0033): the state-keyed rule is unchanged** (own index
  while rowing, heading-into while resting — both observed).
- The `machineState` argument disappears from the ACTUAL path entirely —
  the off-by-one class the whole-branch review found closes structurally,
  not by instrumentation.
- `index-unverified` narrows: the no-rest shape is no longer unverified
  (session 2 answered §17 item 13). The entry survives only for values the
  program's length cannot explain, alongside `divergence`.

### 6. The fake stops modelling the withdrawn machine (`src/monitor/transports/fake.ts`)

- Reject-when-loaded and the destructive wipe GO. The fake accepts and
  replaces, like the machine we met.
- **The fake toggles its frame-count bit on every response frame.** Any
  whole-byte status comparison anywhere in the codebase then fails half
  the suite immediately — the bug class becomes unrepresentable in CI,
  which is stronger than any single regression test.
- The fake's happy path exercises slave-state variety (`ready`, `offline`,
  `in-use`) so parsers that over-read the low nibble get caught too.
- A genuine `0x11` reject becomes SCRIPTABLE (for the reject-path and
  GetErrorType tests), clearly marked as never-observed-on-hardware.
- Tests that pin D1 by name are removed or rewritten; the commit message
  names what was withdrawn and why, per the project's correction
  convention. `driver.ts`'s "expected when nothing was loaded" clear-step
  logging goes with the clear step itself (§3).

### 7. SetScreenState is asynchronous

Its ack means "queued", not "done" (§19.6). Add the
`CSAFE_PM_GET_SCREENSTATESTATUS` builder; `terminate()` polls it,
tick-bounded (no wall clock), instead of trusting the ack. Programming
keeps `verifyArmed` as its completion signal — no double-polling.

### 8. The merge-gate row (~5 min, James-operated)

With the corrected parse, from the main menu:

1. `program-two-time` → expect the first CLEAN end-to-end accept this
   project has seen: `frameStatus: "ok"`, verifyArmed resolves, no
   rejection anywhere in the trace.
2. Row both intervals (short ones) → expect actuals carrying OUR indices
   `0` and `1` via the minus-1 rule; `workoutComplete` once.
3. WITHOUT reconnecting: `program-two-time` again → expect the driver
   still live (latch fix) and the second program accepted over the first
   (program-over-loaded, re-derived §3).

Expected-vs-observed goes to §18 with a session-3 heading; a disagreement
is a finding to record, not a failure to explain away. PR #52 leaves
draft only after this row and James's explicit approval.

## Testing

The acceptance bar is unchanged from fix-1: **every §19 OUR-BUG item gets
a test that fails against today's code.** At minimum: `0x81` parses as an
accept (fails today); the toggle alternating across a multi-frame sequence
never fails a send (fails today); a genuine `0x11` rejects with reason
`"nak"` and fires GetErrorType (inexpressible today); frames after a
terminal state still produce events and a new run (fails today); the
no-rest boundary actual normalizes to the COMPLETED interval via minus-1
with no `index-unverified` (fails today). Plus a parse vector per frame
status × toggle, and the re-derivation task's output recorded in the
ledger with per-send citations into the raw traces.

## Out of scope

7B's screens; the belt-presence query (`CSAFE_PM_GET_HRM 0x84` — noted in
§19.9, future); retry policies for Bad/NotReady; the structural readback
of an accepted program from 0x0031 (§17 item 12 — stays the named upgrade
to verification, needs its own hardware reading); the two untested
clear-command candidates (`CSAFE_RESET_CMD 0x81`,
`SCREENVALUEWORKOUT_GOTOMAINSCREEN 6` — §19.5, a future hardware
experiment, not built speculatively).

## Exit criteria

- The status byte is parsed as the bitfield Concept2 defines, with all
  four frame statuses and the slave state surfaced and logged.
- Both sessions' traces are re-derived under the corrected parse and the
  ledger records what each send actually was.
- `program()` has no clear step (pending §3's confirmation) and resolves
  on machine-state evidence, as before.
- A completed run never blinds the driver; a new run follows without
  reconnecting.
- Actual indices are state-free minus-1; the fake emits true machine
  numbering with a toggling frame-count bit.
- The KNOWN-WRONG banner is gone because the code is right.
- The merge-gate row is run, recorded in §18, and PR #52 has James's
  explicit approval.
