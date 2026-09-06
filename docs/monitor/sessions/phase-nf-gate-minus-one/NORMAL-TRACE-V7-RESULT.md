# NF-NORMAL-TRACE-v7 result — 2026-09-04

One authorized attempt ended **INCONCLUSIVE**, with verified app cleanup.
The NFC reader activated and the app reached Bluetooth scanning, but the
captured stream contains no matching PM5 name, connection call or receipt.
This does not establish why the expected advertisement was absent.

## What happened and cost

James confirmed YOU and an enabled Run normal sample button, requested grouped
instructions, and explicitly replied “go” to the one-scan invitation. PM
`/root/walk_pm` approved the exact v7 two-block procedure. The installed pinned
artifact and reviewed controller were unchanged. The attached console was
live and WebView loaded before the complete scan block was sent.

James reported “i did it.” Codex found no receipt, signalled the exact Node
controller PID to finish, and verified its exit 0 and `cleanupVerified=true`.
The controller's frozen decision is `inconclusive: No receipt export found`.
No retry or further phone instruction followed; James was released immediately.

**Operator error:** Codex stopped capture about 3 minutes 33 seconds before
the observation deadline, without a complete receipt or a reported abort.
“I did it” reported James's action; it did not establish that the asynchronous
test had finished. This departed from v7's complete-result/deadline stop rule.
The controller correctly honored the finish signal. This was Codex's premature
cleanup decision, not a failure by James to follow the instructions.

- Setup block: 20:18:44 UTC; capture: 20:20:08–20:22:26 UTC.
- Total operator setup/capture/wait/cleanup: **3 minutes 42 seconds**, inside
  the eight-minute cap. Agent preparation before the block: about 26 minutes,
  already disclosed separately, including the debugger interruption.
- One NFC attempt/presentation; zero rowing, heart rate, screenshots,
  metadata entry, console commands, pasted receipts or retries.

## Evidence and limits

`normal-trace-v7-evidence.json` preserves the allowlisted native events,
method sequence, aggregate Bluetooth callback census, result, timing and hash
of the private frozen console. The complete raw debug console remains private
in the preparation directory; it contains secure-storage and device data and
must not be pasted or committed. This JSON is a redacted trace summary, **not**
a reconstructed v1 receipt.

Exactly one generation-1 begin/return/RF-active sequence was captured. RF-active
arrived 149 ms after begin. A native session ending then carried category
`core-nfc`, code 200. No cause is assigned from that code: the app also calls
stopScanning during its ordinary handoff.

The method sequence reaches `BluetoothLe.requestLEScan`. Among 8,602 parsed
Bluetooth callback objects, 1,935 carried a localName; none carried the expected
`PM5 432331249 Row` as localName or device.name. No Bluetooth connect,
disconnect or stopLEScan call was captured before controller cleanup. This is
a statement about the captured callbacks, not proof of absence over the air.

Source at `dd11d3da`: GateMinusOneProbe's `handleNfc` enters `startBle` only
after decoding the event and accepting the unique PM5 external record. Its
`startBle` waits for two matching callbacks; with no match it keeps scanning.
`automaticExport` runs through `drain`/completion or controlled reload, not at
that waiting point. The host's process termination does not execute the
WebView's drain/export. Thus a missing advertiser can leave this walk without
a receipt when the host kills the app before its existing Cancel sample path
can drain and export. No evidence here establishes a defect in that path or
the reason for the missing advertisement.

## Desk follow-up after unplugging

The existing Cancel sample button calls `drain`, which automatically exports
before and after BLE cleanup. The original Gate -1 plan explicitly provides
this control for a scan that never gets its second matching advertisement.
No new timeout, receipt schema, controller framework or app rebuild is needed
to exercise that existing path.

A focused component test now drives NFC delivery, unrelated BLE callbacks and
the actual Cancel sample button, then feeds its automatic console output into
the real host receipt extractor. It checks retained redacted NFC records,
zero matching devices/connections, export before a held BLE stop, a fresh export
after cleanup, and rejection of matching callbacks arriving after cancellation.
It never clicks Copy redacted receipt. This is desk evidence at mocked native
ports, not proof of on-phone button reachability or physical NFC/BLE behavior.

Verification: the focused test passed; removing either the pre-cleanup or
post-cleanup automatic export made it fail, and restoring the exact source
returned it to PASS. Staged lint/format and project typecheck passed. The probe
and receipt source match the pinned build's source commit. No production source
changed, so unchanged native builds, browser E2E and full suites were not rerun.
No phone command or additional hardware attempt occurred during this follow-up.

Any future walk must collect the completed receipt before early host cleanup;
an operator's “done” message is not a completion observable. A no-match finish
must account for the existing Cancel sample path and its reachable UI/modal
state before the cleanup reserve. The final deadline still stops the session
even if evidence is missing. V7 remains exhausted; these corrections do not
approve new hardware steps, extend its clock or authorize another scan.

Gate -1 remains incomplete. This run establishes physical RF activation on
this phone/run and reaches the BLE-scanning stage; it does not establish the
complete targeted handoff or authorize product implementation. The v7 attempt
budget is exhausted. Further work is desk-only unless separately authorized.
