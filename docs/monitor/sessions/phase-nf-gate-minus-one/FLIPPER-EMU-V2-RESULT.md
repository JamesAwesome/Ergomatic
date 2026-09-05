# NF-FLIPPER-EMU-v2 result — POSITIVE (NFC transport fidelity)

## Outcome

Ran under **go**: one reader start, one Cancel tap, transport wired, capture
and cleanup verified, controller elapsed 147.892 s (inside the five-minute
cap), zero installs, no phone mutation. **POSITIVE for the walk's target.**

The phone read the Flipper's emulation of `C2_pm5_rebuilt.nfc` and the probe's
final receipt carried **three records byte-for-byte identical to the fixture**
`docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json` (`compare-emulated-records.py`
exit 0; `rawNdefShape: true`, `exactType: true`). The read moved the probe into
"Scanning for the PM5's exact local name," i.e. it decoded a valid PM5 NDEF and
began targeted BLE. Cancel sample then exported the no-match receipt.

`decodedName` and `liveLocalName` are null and the BLE criteria false because no
PM5 was in range at the desk; those fields are populated only on a matching BLE
advertisement (probe sets `decodedName` during the scan match, not during the
NFC read). Their absence is the expected desk state, not a failure.

## What is proven and what is not (RF11)

Proven: the Flipper -> Core NFC path carries the fixture's NDEF records
faithfully — transport fidelity. Because the emulated image was synthesized
from the same fixture the oracle compares against, this does NOT re-prove the
physical PM5 tag's on-wire framing (CC, TLV), which we reconstructed. It is
enough for the walk's purpose: the NFC read path and host tooling are now
desk-reproducible up to the BLE boundary.

## What this unlocks

- The read-stage recovery work and the host helper's `FinalDisplayMismatch`
  guard (which stopped NF-RECOVERY-v2 case 1) can be diagnosed at the desk
  against this replica, no erg, since they concern the NFC read and its DOM
  display rather than BLE.
- The unsupported-tag and multiple-tag cases can be built at the desk with
  Flipper-emulated tags (their tag is arbitrary by definition).
- Still erg-only: the BLE connect/disconnect half of every recovery B, and any
  criterion that names the physical PM5.

Private evidence under R: `flipper-emu-v2-2hbkuGyH/` (receipt, evidence.json, console),
`C2_pm5_rebuilt.nfc`, `compare-emulated-records.py`. No raw logs committed.
