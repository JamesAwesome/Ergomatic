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
a receipt. This is an identified diagnostic coverage gap, not a radio diagnosis
or a reason to ask James for another scan.

Gate -1 remains incomplete. This run establishes physical RF activation on
this phone/run and reaches the BLE-scanning stage; it does not establish the
complete targeted handoff or authorize product implementation. The v7 attempt
budget is exhausted. Further work is desk-only unless separately authorized.
