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

## Diagnosis (CORRECTED — supersedes this file's first timing theory)

The first version of this file guessed positioning/timing (reader opened
before the phone reached the spot). **James confirmed the phone was held at
the spot the whole time**, which falsifies that. The corrected finding:

**The PM5 stopped emitting its NFC tag after the recovery Bluetooth activity,
and stayed dark until a hard power cycle.** Evidence:

- Case 1 A and B read the tag in 5-7 s (code 200). Case 1's B completed a real
  BLE connect and disconnect.
- Immediately after, case 2's reader ran its full 60 s and ended Core NFC 201
  (`sessionTimeout`) with **no tag seen**, twice (block attempt + the
  James-authorized diagnostic retry), phone held in place both times.
- **James's separate phone NFC app also could not find the PM5's tag** after
  the walk — so this is not our app, our helper, or our positioning.
- **Only a hard reboot of the PM5 (battery pull) restored NFC.** It has read
  fine since, including while Bluetooth-connected (James retested).

INFERENCE (tag PRIMARY for the observations above, INFERENCE for the cause):
the PM5's NFC advertisement went into a stuck/off state after the connect
cycle in case 1, persisted across applications and minutes, and cleared only
on power cycle. Whether the trigger is a single connect or the full
connect → disconnect → re-arm → reconnect sequence is unknown; a single fresh
connect after the reboot did NOT reproduce it. This is a PM5-side state, not
damage (a battery pull is Concept2's normal reset).

## Why this matters beyond the walk

The recovery matrix exists to test whether an old NFC attempt interferes with
its immediate successor. This finding is a confounder for every case: after a
connect, the PM5 may stop offering its tag for PM5 reasons that have nothing
to do with the phone or app, so a "successor B finds no tag" result cannot be
read as an app recovery failure without first proving the PM5 is still
emitting. It is also a genuine product question for the shipped Scan-NFC
feature: a second scan later in the same session (after one connect) may find
nothing until the erg is power-cycled. This is exactly the "does the
underlying system HAS the concept / who owns this state" question, and it was
not researched before the recovery matrix was designed.

## Next (needs a rethink, not a quick delta — PM + James)

The earlier "start each case's reader on a **set** reply" idea is WITHDRAWN: it
addressed the falsified timing theory and would not help a PM5 that has stopped
emitting. Before another erg walk, two things are owed at the desk:

1. **Research the PM5 NFC lifecycle** (Concept2 docs / SDK): when the PM5
   advertises its NFC tag, whether a BLE connection suppresses or re-arms it,
   and what returns it. Record PRIMARY citations.
2. **Redesign the between-case protocol** around a PM5-NFC-availability check:
   before each successor reader start, confirm the tag is actually readable
   (our probe or a third-party read), and treat "not readable" as
   `PM5 NFC unavailable` (power-cycle required), distinct from an app recovery
   failure. Possibly a power cycle between cases.

Case 1's completed evidence stands. Cases 2-4 remain unrun and now depend on
the research and redesign above.

Private evidence under R: `authorized-recovery-v3-*/` and
`authorized-recovery-v3-retry2-*/` (receipts, console, evidence.json).
