# Recovery guard fix — FinalDisplayMismatch was a false negative, 2026-09-05

## Symptom

`NF-RECOVERY-v2` case 1 (stop-during-connect) stopped at the erg with the
helper raising `FinalDisplayMismatch`, after two clean reader sessions (both
RF-active, Core NFC 200) and a final receipt showing B's exact live name
`PM5 432331249 Row`, one BLE match, connected and disconnected. The stop read
as inconclusive.

## Root cause (PRIMARY, read from source and reproduced)

`inspector-recovery.py`'s final guard compared the EXPORTED receipt's records
against the DOM's "Raw NFC records:" paragraph for exact equality:

    final['receipt']['attempts'][0]['records'] != terminal.get('raw')

The exported receipt is REDACTED. `serializeGateReceipt` runs every record
through `redactNfcRecord` (`app/src/monitor/nfc/gateMinusOneReceipt.ts`), which
zeroes payload bytes 0-5 of the PM5 BLE-info record — the erg's Bluetooth MAC.
The DOM paragraph shows the UN-redacted read (`entry.records = decoded.records`;
the button beside it even reads "Copy redacted receipt"). On any real PM5 those
six bytes are the actual MAC and are non-zero, so exported and DOM records can
never be equal and the guard fires on a perfectly good recovery. The partial
check at the held stage escaped it only because the held state has zero records.

This is why the desk Flipper walk passed: the committed fixture
`pm5-tag-2026-09-04-iphone.json` is a redacted receipt with bytes 0-5 already
zero, so the emulated read matched the redacted export.

Reproduced in isolation: a read with MAC `11 22 33 44 55 66` vs its redacted
export makes the old comparison fire (`True`), while a redaction-aware compare
does not, and still fires on a read whose name byte differs.

## Fix (private helper only; no product change)

Added `display_matches(exported_records, dom_raw)` to `inspector-recovery.py`,
which applies the same single redaction rule (PM5 BLE-info record → zero payload
bytes 0-5) to the DOM records before comparing. Both the partial and final
guards now call it. A malformed short PM5 payload or a missing paragraph
(`dom_raw is None`) returns `False` and fails safe.

Invariant closed: "the exported receipt equals the redaction of what the DOM
displayed," not "equals the raw display." The fix mirrors `redactNfcRecord`;
if that TS rule changes, this Python mirror must change with it (noted in the
helper comment).

## Evidence

- Four focused tests in `test-inspector-recovery.py`: accepts a real-MAC read
  against its redacted export (with a regression assertion that the old
  exact-equality would have differed), rejects a name-changed read, handles the
  held-empty and missing-paragraph cases, rejects a malformed short PM5 payload.
- Full helper suite: 15 tests pass.
- Mutation A (redaction made a no-op) fails the real-MAC accept test; mutation B
  (`display_matches` forced True) fails the wrong-read reject test. The gate can
  still go red.
- New hashes: `inspector-recovery.py` b7e37faa3d16a778a03dece964a4c8c278f289fb2e3335a2a9fb989afcbb799f; `test-inspector-recovery.py` 7d820db19c53460452e56226e35552c20827193ab88f52d7c59049298f147d24.
  `.before-redact-fix` copies retained under R.

## Consequence for the walk

`NF-RECOVERY-v2` case 1 was mis-scored: the abort was in the display-equality
guard, not in the recovery. The captured final receipt shows B connected and
disconnected with the exact PM5 name, i.e. the substantive stop-during-connect
observations were present. This does NOT by itself close case 1 — the helper
aborted before its full success path (post-drain idle reset) and before the
per-case adjudication completes. A clean re-run with the fixed helper is
warranted: `NF-RECOVERY-v3`, same protocol, needs a fresh PM pass, James's
**go**, and the erg (the BLE half needs the real PM5). No product code, stored
shape or auth changed.
