# PM5 NFC tag captures

Raw dumps of the NFC tag the PM5 presents for tap-to-connect, kept for
Phase NF (`ROADMAP.md`, "Phase NF — tap the monitor to connect"). The
authoritative description of what the tag SHOULD hold is the PM5 Bluetooth
Smart Interface Definition v1.30, §"Near Field Communication NDEF Records"
(PRIMARY; not transcribed into `docs/monitor/` yet — the ROADMAP entry quotes
the load-bearing lines).

## Captures

| File                             | Date       | Reader                 | Complete? | Notes                                                |
| -------------------------------- | ---------- | ---------------------- | --------- | ---------------------------------------------------- |
| `pm5-tag-2026-08-31-partial.nfc` | 2026-08-31 | Flipper Zero (v4 file) | **NO**    | 6 of 42 pages read; NDEF header only, payload absent |

### `pm5-tag-2026-08-31-partial.nfc` — what it does and does not contain

The Flipper's own header says `Pages read: 6` against `Pages total: 42`;
pages 6-41 are zero-filled placeholders, not tag contents. The file is worth
keeping because the six pages it did read settle three things:

1. **The first NDEF record IS the spec's `concept2.com:bleconnectinfo`.**
   Page 4 = `03 92 84 1B`, page 5 = `00 00 00 28`, decoded per the NFC Forum
   Type 2 Tag / NDEF specs:

   | Bytes         | Meaning                                                                                                  |
   | ------------- | -------------------------------------------------------------------------------------------------------- |
   | `03`          | NDEF Message TLV                                                                                         |
   | `92`          | message length 146 bytes                                                                                 |
   | `84`          | record header: MB=1, ME=**0** (more records follow), CF=0, SR=0, IL=0, TNF=`4` (NFC Forum external type) |
   | `1B`          | type length **27** — `concept2.com:bleconnectinfo` is exactly 27 characters                              |
   | `00 00 00 28` | payload length 40 bytes (4-byte form, because SR=0)                                                      |

   ME=0 is consistent with the spec's second record (the Android Application
   Record). Payload length 40 fits a 6-byte address + 1-byte address type +
   a name field of up to 31 bytes with 2 bytes to spare — the spec's field
   table, not this capture, says what those 2 bytes are.

2. **The type name, the BLE address and the advertised name are NOT in this
   file.** They would occupy pages 6 onward, and those pages were never read.
   Nothing here can be used to check that the tag's name is byte-identical to
   CoreBluetooth's scan name — the phase's stated first unverified claim.

3. **The tag is not really an NTAG203; the Flipper guessed.** Page 3 (the
   capability container) is `E1 10 7C 0F`: magic `E1`, mapping version 1.0,
   data area `0x7C × 8 = 992` bytes, access `0F` = read allowed, write
   forbidden. An NTAG203 has 144 bytes of user memory, so the Flipper's
   `NTAG/Ultralight type: NTAG203` and `Pages total: 42` are its fallback
   identification (GET_VERSION unanswered — `Mifare version` is all zeros),
   not a fact about the PM5. INFERENCE: the PM5 is emulating a Type 2 tag on
   its own NFC controller, and the 42-page ceiling is the Flipper's, so a
   complete dump may well run past page 41. UID `5F C7 DE 6B 4A EC 07`
   (7-byte, cascade tag `88` stripped) is real and stable enough to recognise
   the same monitor in a later capture.

Identity: UID `5FC7DE6B4AEC07`, ATQA `00 44`, SAK `00`.

## Owed: a complete read

Two ways to get the payload, in order of how much they teach:

- **iPhone + any NDEF reader app.** Reads via Core NFC, which is precisely
  the API Phase NF will use — a successful read discharges the "does iOS
  Core NFC read this external record at all" half of the phase's first
  unverified pair before any code exists. Save the record's type, payload
  hex, and the advertised name the app shows.
- **Flipper re-read.** Confirm the Flipper reports every page read before
  saving; a partial read saves without complaint, which is how this file
  happened.

Either way, drop the dump beside this one with the date in the name and add a
row to the table above.
