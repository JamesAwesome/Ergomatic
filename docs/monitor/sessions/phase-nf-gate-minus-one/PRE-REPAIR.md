# NFC Gate −1: retained pre-repair evidence

Partial, **NO-GO** evidence from the diagnostic app built at `7ffe919f`,
captured on 2026-09-04. This is not product clearance or the final gate receipt.
No rowing, workout programming, or heart-rate data was required.

## Provenance and privacy

Device photos identify an iPhone 17 Pro on iOS 26.6.1 and PM5 model D/E,
firmware 459.069, hardware 134, serial 432331249. The PM5 Connect screen shows
`PM5 ID 432331249`, not its full BLE local name. A separate fresh passive BLE
preflight reported `PM5 432331249 Row` from ScanResult.localName and finished
scan/listener cleanup before NFC sampling. No historical/cached name was used.

`pre-repair.frames.json` contains the complete redacted export captured from
the attached native console; `pre-repair-receipt.json` is its strict
reassembly, accepted by serializeGateReceipt. Retain all failed attempts.
Raw bridge output, credentials, NFC UID, BLE IDs and PM5 address bytes are not
stored here. Only the six address bytes of the identified PM5 external record
are zeroed; type, ID, address type, name, suffix and sidecars remain intact.

The probe exports signedEntitlement as an unassembled empty array; this is
not a report that the installed signature lacks NFC rights. Signed-reader and
other controller-owned criteria have not been assembled into this receipt.

## Observations

- 15:23:15.647Z: Flipper NTAG213 emulation read one Text record, language en,
  `Ergomatic NFC test`. Complete raw DOM, native record and redacted export
  agreed. This fixture was independently readable before the two-tag test.
- 15:29:40.792Z: PM5 read three records: external
  `concept2.com:bleconnectinfo` (40-byte payload), external `android.com:pkg`,
  and well-known URI. The PM5 payload contains the candidate name above at
  offset 7 followed by 16 zero bytes. This single sample does not establish
  the live-name bridge or a general padding rule. Complete raw DOM and export
  agreed except for the permitted six-byte redaction.
- The host trace for that PM5 attempt was initial App.getState true, NFC
  start, NFC stop/listener removal, then App.getState false. No BLE initialize
  or scan followed. The subsequent captured DOM status was
  `App is backgrounded; BLE was not armed.`; a later App.getState returned true.
  These establish the abort branch, not the precise UIKit transition cause.
- 15:41:51.282Z: James reported the no-tag sheet eventually timed out;
  native ending and export record `no-tag-timeout` / `sessionTimeout`.
  Actual time-to-invalidation was not measured.
- 15:45:34.729Z: James reported tapping native Cancel; native ending and
  export record `sheet-cancel` / `userCancelled`. Both ending exports were
  strictly reassembled and matched his separately pasted receipts.
- 15:46:21.590Z and 15:46:35.755Z: attempted two-tag presentations each read
  one record, not a positively observed multi-tag error. James could not get
  both detected together. Latest raw DOM matched the final export. The
  `Present exactly one NFC tag.` message was not observed; this leg remains
  unproven. Stop retries rather than inferring its producer from an ending.

## Repair boundary

The disposable port maps App.getState().isActive false to background, but
installed Capacitor AppPlugin.getState compares UIApplication state with
active; inactive is not the same as background. Actual background events
come from pause/didEnterBackground. Native NFC invalidation completion is
not app activation completion. A transient NFC-sheet interruption explains
the observed abort as an **inference**, not a measured UIKit trace.

James approved a probe-only repair: await positive app activation after owned
NFC stop, preserving cancellation/background cleanup and exact device
selection. No repair result, BLE connection, multi-tag producer, stale-session
clearance or product readiness is claimed by this record.
