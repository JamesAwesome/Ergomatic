# First repaired normal sample

On 2026-09-04, attempt16:14:33.366Z on the same photographed iPhone/PM5
completed the NFC-to-BLE diagnostic handoff. Runtimeebe077f5, test tailac63b1ec.
This is one successful sample, not a complete Gate −1 clearance.

The rebuilt signed app had NFC formats exactly TAG and usage description
`Scan a PM5 to connect and program your workout.`; strict/deep codesign
verification passed. The bundled GateMinusOneProbe-D927HOgR.js and index
byte-matched the fresh flagged build. No DEBUG overlay was installed and the
native NFC patch was unchanged. Inspector delivered READY true ios after
reinstallation; controller captured native console directly.

Four separately framed exports reassembled strictly and describe the SAME
attempt, not four reads. The final complete frame envelope is preserved as
repaired-normal.frames.json, with its unchanged reconstructed export in
repaired-normal-receipt.json. Full raw DOM records matched all exported
records except the permitted six PM5 address bytes. No raw address/UID/BLE
identifier is persisted.

Observed exact NFC name and live ScanResult.localName both
`PM5 432331249 Row`. One matching device, connection true, disconnection true;
native calls used requestLEScan/connect/disconnect, no requestDevice picker.
First matching callback103ms; next matching callback1ms later. These are
bridge callback timings, not measured over-the-air advertising intervals.
The40-byte PM5 payload leaves16zero bytes after the complete name. A second
fresh NFC/BLE sample is still required to establish repeated padding behavior.

Native call ordering retained by the controller: initial getState true, NFC
start, NFC stop, NFC listener removal, activity listener registration,
getState false, delivered isActive true, activity listener removal, BLE
initialize/enabled/scan, scan stop, connect, disconnect and lifecycle listener
cleanup. The repaired handoff therefore proceeded after positive activity
following a false activity snapshot; it did not abort at that snapshot.
This records bridge observations, not an atomic UIKit-state guarantee.

The export's signedReader remains false and signedEntitlement remains empty
because those are controller-assembled fields, not native signature reports.
Background recovery, full native stale-session matrix and the unobserved
multi-tag producer remain outstanding. Preserve pre-repair failures alongside
this sample in the eventual combined gate record.
