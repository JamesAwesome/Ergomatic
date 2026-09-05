# NF-RECOVERY-v3 result — case 1 COMPLETE, case 2 stopped before any read

## Outcome

Ran under **go** at 02:33:54Z: preflight wired, identity 0.23.0/789, capture
and idle check passed. **Case 1 (stop-during-connect) completed cleanly with
the fixed helper**: A held, partial export, reload, B started and released A,
final receipt, post-drain idle reset; helper returned
`recovery-capture-complete`. That closes the false-negative diagnosis in
`RECOVERY-GUARD-FIX.md`: the display guard now passes a real PM5 read.

**Case 2 (stop-during-query) stopped** at the helper's held-state wait with a
`TimeoutError` (no guard). Per protocol the block stopped; cases 3 and 4
unrun. Three reader starts used. Cleanup verified. Total operator time about
3m35s, zero installs.

James then explicitly authorized **one diagnostic retry of case 2** as its own
bounded four-minute run ("lets retry once to help with diagnosis"). It stopped
the same way. Cleanup verified. Two reader starts. Both runs are consumed.

## What the two case-2 attempts show (PRIMARY, from the native trace)

| Session | rf.active → ending | Core NFC code | Read a tag? |
| --- | --- | --- | --- |
| Case 1 A | 7.1 s | 200 | yes |
| Case 1 B | 4.9 s | 200 | yes |
| Case 2 A, attempt 1 | 63.1 s | **201** | **no** |
| Case 2 A, attempt 2 | 63.1 s | **201** | **no** |

Core NFC 201 is `readerSessionInvalidationErrorSessionTimeout`: the reader ran
its full window and no tag ever entered the field. Both case-2 A sessions are
byte-identical in shape. The query-stage hold, the export control, and the
helper's held wait were never reached, so this says nothing about the hold
mechanism. James's report during attempt 1 ("the connect is up but nothing's
happening") is consistent: the PM5 sat in Ready for App Connection while the
phone's reader had already expired.

## Diagnosis

Not the helper, not the app hold. The reader window opened before the tag was
presented and closed before it arrived. Between cases the operator block asks
James to move the phone away, drive two PM5 menus, and return; the controller
started the next scenario 20 s after sending the block (attempt 1) and
immediately after the idle check (attempt 2), and Core NFC gives 60 s from
`startNfc`. Whether the phone was at the spot for part of that window is
unconfirmed (asked; answer pending). What is confirmed is that the reader
never saw the tag, twice, with the same timing shape.

This is the same class as the v1 connection abort: the operator's ready state
was not established before the host acted. v2 fixed it for the walk's first
listing by moving the ready state into the consent invitation; the between-case
transitions kept v1's "no per-case acknowledgement" rule and so have no ready
signal at all.

## Proposed delta for NF-RECOVERY-v4 (needs PM and James)

One-line change to the between-case rule: after sending a case's physical
block, the controller starts that case's reader only on James's one-word
reply **set** (phone at the spot, PM5 showing Ready for App Connection). The
reply is a readiness signal for the reader window, not a "done" report, and
nothing about evidence completion reads it. Clock keeps running; cap, cases,
attempts and stop rules unchanged. Case 1's completed evidence stands; v4
runs cases 2, 3 and 4.

Private evidence under R: `authorized-recovery-v3-*/` and
`authorized-recovery-v3-retry2-*/` (receipts, console, evidence.json).
