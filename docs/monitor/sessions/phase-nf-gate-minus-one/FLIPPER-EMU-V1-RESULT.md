# NF-FLIPPER-EMU-v1 result — NEGATIVE (bad source file), replica rebuilt

## Outcome

The desk scan ran under **go**: one attempt, transport wired, capture and
cleanup verified, total operator time about 2m30s, zero installs. The phone
read the emulated tag and got the PM5 message's SHAPE (a first record with a
27-byte type and 40-byte payload) but every content byte was zero, followed
by twelve empty records. No PM5 name decoded, no BLE scan, so the Cancel step
was not needed. **NEGATIVE for that Flipper file**, not for the approach.

## Cause (PRIMARY, read over the Flipper's serial console)

The saved `C2_pm5.nfc` is a truncated read: its header records
`Pages read: 6` of 42. The erg read aborted after page 5, so pages 6-41 are
zeros, and the Flipper emulated those zeros. The tag's header DID survive and
is internally consistent: UID `5F C7 DE 6B 4A EC 07`, correct BCC0/BCC1, and
an NDEF TLV that begins at page 4 (`03 92 ...`, non-short records). The tag is
genuine; the capture was incomplete.

## Better replica (built and verified this session, no erg)

Rather than re-read the physical tag, the replica was synthesized from the
known-good iPhone fixture `docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json`:

- Full 42-page Type 2 image in the Flipper's NTAG203 container (the Flipper's
  fallback label; `docs/monitor/nfc/README.md` shows the PM5 emulates a Type 2
  tag with a 992-byte CC): real UID and BCC from the partial read's surviving
  header, standard capability container `E1 10 12 00`, and an NDEF TLV encoding
  the fixture's three records (short-record form, 140-byte TLV, fits the
  144-byte user area with one page to spare).
- **Round-trip validated:** decoding the image's user memory back yields the
  three fixture records byte-for-byte (`records == fixture: True`).
- Written to the Flipper as `/ext/nfc/C2_pm5_rebuilt.nfc` (new file; original
  `C2_pm5.nfc` untouched) and read back over serial: all 42 pages identical to
  what was written; page 4 now reads `03 89 94 1B 28 63 6F 6E` (TLV, PM5
  record, "concept2.com...").

Private artifacts under R: `C2_pm5_rebuilt.nfc`, `pm5-ndef-tlv.bin`,
`flipper-cli.py` / `flipper-write.py` (read/write serial helpers),
`flipper-C2_pm5.txt` (the truncated original dump). No phone action, install
or scan occurred while building the replica.

## What is NOT yet established

The rebuilt image decodes correctly on the Mac. Whether iOS Core NFC reads the
Flipper's EMULATION of it as the three PM5 records is the same open question
`NF-FLIPPER-EMU-v1` was meant to answer, and it needs one more one-scan desk
walk against `C2_pm5_rebuilt.nfc`. The BLE half still needs the PM5 in range;
this desk path only exercises the NFC read and the no-match/Cancel export.

## Next

`NF-FLIPPER-EMU-v2` reuses this runsheet verbatim with `C2_pm5_rebuilt.nfc` as
the emulated file and the same five-minute one-scan cap. It needs a fresh PM
readiness pass (the source file changed) and James's **go**.
