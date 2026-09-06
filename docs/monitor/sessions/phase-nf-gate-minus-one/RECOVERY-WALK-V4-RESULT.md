# NF-RECOVERY-v4 result — bracket CLEAN, cases 2-4 unrun (time)

## Outcome

Ran under **go** on 2026-09-06 01:24Z (local evening 09-05). Preflight found
the phone carrying Ergomatic **0.38.1/858** (a newer build had replaced the
diagnostic since the previous night); James explicitly authorized one wired
reinstall of the pinned recovery build, which installed and verified as
0.23.0/789 (`authorized-install-v4-*/`). Transport wired; capture and idle
check passed.

**The control-tag bracket was clean on all four observations**, taken in the
order the runsheet prescribes, with the PM5 read constituting a full BLE
connect cycle and the Flipper raw read taken immediately after it:

| Step | Observation | Result |
| --- | --- | --- |
| 2 | Phone NDEF read of the Flipper replica (control) | 3 records, byte-identical to the fixture, Core NFC 200; no BLE (expected) |
| 3 | Phone NDEF read of the PM5 | 3 records byte-identical, decoded/live name `PM5 432331249 Row`, connected and disconnected, Core NFC 200 |
| 4 | Flipper raw read of the PM5 **after** that connect | **Pages read 42/42**; UID `5F C7 DE 6B 4A EC 07`; CC `E1 10 7C 0F`; NDEF TLV at page 4 (`03 92 …`, 146-byte message, long-record framing, 3 records) through terminator `FE` at page 41 |
| 5 | Photo of the PM5 display + link/nolink | pending from James at time of writing |

No case ran: the bracket plus two host-side restarts consumed the clock. The
capture controller ran to its own eight-minute deadline and self-cleaned
(`cleanupVerified: true`). Reader starts used: 2 of 10. Cases 2-4 remain unrun
without prejudice, as v4 provides.

## What it establishes

- **v3's no-tag condition did not reproduce after a connect cycle tonight.**
  One clean bracket (n=1) does not identify what happened in v3; it shows the
  condition is not deterministic after one connect + disconnect, on a PM5 that
  was battery-pulled the night before and a phone whose app had just been
  reinstalled. All five alternatives in the research note remain live for
  the v3 event; none is supported by tonight.
- **First complete raw read of the real PM5 tag.** The 08-31 file stopped at
  page 6; tonight's `Walk.nfc` has all 42 pages. It confirms the emulated
  Type 2 layout the README inferred (CC declares 992 bytes; the NDEF uses
  long-record headers, 146 bytes, versus our short-record 137-byte replica)
  and decodes to the same three records. Kept PRIVATE under R as
  `pm5-tag-2026-09-05-flipper-full.nfc` because the NDEF payload carries the
  PM5's Bluetooth MAC in the clear (the committed iPhone fixture is redacted).
  It can replace the synthesized replica on the Flipper after a desk
  round-trip check.

## Deviations from the approved runsheet (recorded, not hidden)

1. **Two host restarts before the bracket.** The capture controller rejects a
   ten-minute deadline (hard cap eight), so it ran on an eight-minute clock
   inside the ten-minute operator cap; and the first idle attempt left an
   output directory the helper refused to reuse, so it was moved aside and
   rerun. Neither touched the phone. Both cost time that the cases needed.
2. **The phone reads were James's taps, not the controller's.** The helper can
   start only recovery scenarios and three id'd controls; it has no path to
   `Run normal sample` or `Cancel sample`. The approved block's "I will start
   the reader" was therefore replaced by the v8-validated tap, and the
   control read's export came from his Cancel tap (also demonstrated in
   NF-FLIPPER-EMU-v2). This is a wording deviation, not a new action.
3. **James did not see the first block** and asked for the steps; they were
   resent as one plain block. Text emitted between tool calls is not reliably
   visible to him; every operator block goes at the end of a turn.

## Next

Cases 2-4 (`NF-RECOVERY-v5`) reuse v4 verbatim with: the controller's eight
minute clock stated as the cap (or the controller changed, which is a code
change with its own review); the bracket's phone reads written as James's
taps; and the operator blocks sent as end-of-turn messages. PM delta pass
owed for the wording; no new mechanism.
