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
| `pm5-tag-2026-09-04-iphone.json` | 2026-09-04 | iPhone 17 Pro / iOS 26.6.1, patched Capgo 8.2.5 | **YES: NDEF records** | Three complete records from v8; six address bytes redacted |

### `pm5-tag-2026-08-31-partial.nfc` — what it does and does not contain

The Flipper's own header says `Pages read: 6` against `Pages total: 42`;
pages 6-41 are zero-filled placeholders, not tag contents. The file is worth
keeping because the six pages it did read establish the following limits:

1. **The first NDEF header is compatible with the spec’s external record;
   its literal type is not captured.**
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
   Record). The header reports a 40-byte payload, but this partial capture
   cannot establish its contents or padding. The Concept2 field table does
   not explain that length either.

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

## Complete iPhone record capture

`pm5-tag-2026-09-04-iphone.json` preserves the three redacted native-shaped
`tnf`, `type`, `id`, and `payload` arrays from the completed
[normal-trace-v8-receipt.json](../sessions/phase-nf-gate-minus-one/normal-trace-v8-receipt.json).
It is a complete NDEF message capture, not a Type 2 memory-page dump. Only the
first six bytes of the PM5 record’s payload (the Bluetooth address) were zeroed
by the receipt serializer; the other record bytes are retained.

For this PM5 D/E, firmware 459.069, the external record has TNF 4 and literal
`concept2.com:bleconnectinfo` type bytes. Its 40-byte payload contains address
type 1 at offset 6, the 17-byte ASCII name `PM5 432331249 Row` at offsets 7–23,
and sixteen zero bytes at offsets 24–39. Thus this observed payload’s name ends
at the first zero, and all remaining bytes are zero. The live BLE `localName`
matched that decoded name exactly; the targeted connection and disconnect
completed. The other records are `android.com:pkg` and a well-known URI record.

The successful attempts at 16:14:33.366Z, 16:18:35.712Z and 22:28:45.860Z on
2026-09-04 have identical redacted record arrays. This establishes the observed
boundary for this monitor and these runs; it does not generalize a padding
rule to every PM5. See [REMAINING-PROOF.md](../sessions/phase-nf-gate-minus-one/REMAINING-PROOF.md)
for the evidence still needed before product implementation. This dated fixture
is available now; the final combined Gate -1 receipt remains incomplete.
