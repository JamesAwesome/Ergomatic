# PM5 NFC tag availability around Bluetooth connections — 2026-09-05

Rev 2 after the antagonist delta pass (same day). Rev 1 over-read four claims;
each is corrected below with the pass's required wording.

## What and why

On 2026-09-05 an iPhone NDEF reader session found no PM5 tag in two consecutive
60 s windows during a recovery walk that had just performed a Bluetooth connect
and disconnect. A PM5 battery pull preceded the next observed successful read.
The Scan-NFC spec's Gate -1 design never asked whether the PM5 keeps its tag
available after a connect (`2026-09-03-phase-nf-scan-nfc-design.md` carries no
such question). This note records what was observed, what the vendor
publishes, what our own capture already established, and what remains open,
so the recovery protocol and the product are designed against the PM5 that
exists.

## Observations (PRIMARY, our captures)

| Event, 2026-09-05 UTC | Reader session | Result |
| --- | --- | --- |
| NF-RECOVERY-v3 case 1 A | 7.1 s | Core NFC 200, three PM5 records |
| case 1 B (BLE connect + disconnect) | 4.9 s | 200, three records, connected, disconnected |
| case 2 A, block attempt | 63.1 s | **201 sessionTimeout, no tag** |
| case 2 A, James-authorized retry | 63.1 s | **201 sessionTimeout, no tag** |

The failing reader was an `NFCNDEFReaderSession`
(`app/src/native/nfcGateMinusOneProbe.ts:95`, `iosSessionType: "ndef"`). An
NDEF session reports nothing for a tag that answers anticollision but whose
Type-2/NDEF read stalls; it simply runs to its 60 s timeout and returns 201.
James held the phone at the spot throughout both windows (SECONDARY, his
statement). His separate phone NFC app also found nothing — same handset, same
Core NFC daemon, same API family, so this is a **mirror of the first reader,
not an independent oracle**; it rules out our app and our helper, and says
nothing about the phone. A battery pull of the PM5 preceded the next observed
successful read; that read was a **Flipper** read (raw pages), taken while the
phone was Bluetooth-connected. **The record contains no successful phone read
of the PM5 after the battery pull.**

## What the tag is (PRIMARY, our own capture, `docs/monitor/nfc/README.md`)

The PM5's tag is emulated by the PM5's own controller, not a passive sticker:
page 3 capability container `E1 10 7C 0F` declares a 992-byte data area
(an NTAG203 has 144); GET_VERSION is unanswered (`Mifare version` all zeros);
UID byte 0 is `0x5F`, not NXP's manufacturer code `0x04`, with BCC0 `0xCE`
verifying (`0x88^0x5F^0xC7^0xDE`). The Flipper's "NTAG203" label is its
fallback identification. This has been in the repo since 2026-08-31
(`pm5-tag-2026-08-31-partial.nfc`, commit 86e35ec6); rev 1 of this note and
the Flipper walk records re-derived "NTAG203" from the Flipper screen instead
of reading it (RF18).

A PM5-side availability state is therefore *possible*. Nothing yet shows it is
*what happened*.

## Vendor sources

- **Concept2 PM5 Firmware Timeline** (PRIMARY,
  https://www.concept2.com/support/monitors/pm5/firmware-timeline): v208 and
  v358, March 2021: _"Improvements for NFC wake-up behaviour"_; v868 (Nov 2019)
  and v17 (Feb 2015): _"NFC compatibility improvements for iPhone"_. **What
  this establishes: the PM5 can WAKE on an NFC field.** It does not say
  firmware can disable the tag; if anything a wake path implies the RF side
  answers while the application firmware is not running. Rev 1 read this line
  as evidence of switchability; withdrawn. The unit under test runs firmware
  459.069, which the timeline does not list. (Rev 1 also attributed Bluetooth
  disconnect/reconnect fixes to v256/257 from a fetch summary; a second fetch
  disagreed on the dates, so that attribution is dropped as unverified.)
- **Concept2 PM5 Troubleshooting** (PRIMARY,
  https://www.concept2.com/support/monitors/pm5/troubleshooting): no mention of
  NFC, sleep/wake, or Connect Device. Battery removal is the documented reset
  for wireless faults: _"Remove the batteries for at least 5 full minutes"_,
  then _"press More options then press Turn Wireless On."_
- **Concept2 forum, "ErgData: scan NFC tag instead of (new) PM5?"**
  (SECONDARY, https://www.c2forum.com/viewtopic.php?t=201395; fetch returned
  403, seen only via a search snippet): the tag holds _"static data (the PM5's
  serial number and Bluetooth MAC address)"_. Static contents; nothing about
  presence.
- **Nothing found** stating the PM5 disables NFC while Bluetooth is connected
  or re-arms it on disconnect. "Nothing found" is the result.

## What the evidence supports (required wording)

After a walk containing a BLE connect and disconnect, an iPhone NDEF reader
session found no PM5 tag in two consecutive 60 s windows; a PM5 battery pull
preceded the next observed successful read. **The cause is not identified.**
A PM5 RF-silent state, a PM5 NDEF-layer fault (answers anticollision, stalls
above it), the PM5's own sleep state, a phone-side Core NFC fault, and
suppression while BLE-connected are all consistent with the record. The two
failed sessions are **one occurrence**, not two trials.

| Alternative | Killed by | Status |
| --- | --- | --- |
| A1 PM5 RF-silent | nothing | live |
| A2 PM5 anticollides, NDEF/Type-2 read fails | nothing; the 08-31 partial read (aborted at page 6 of 42) shows this shape on this tag | live; a naive Flipper check is blind to it |
| A3 iPhone Core NFC / nfcd fault | nothing; the "second app" is the same stack; no phone read post-reboot recorded | live |
| A5 PM5 asleep / wake path degraded | nothing; display state was never recorded | live |
| A7 suppressed while BLE-connected | only a Flipper read at a different layer, after the window | weakened, live |
| A6 positioning | James's statement + 2 × 63 s + second app | dead in practice |

Withdrawn from rev 1: "the 6-of-42-page Flipper read was the same state
beginning to bite." That file is dated 2026-08-31 and was read at a desk; the
Flipper file emulated in NF-FLIPPER-EMU-v1 is byte-identical to it. James
confirms (2026-09-05, late) that he emulated that same saved 08-31 file and
took NO fresh read at the erg before the reboot. So no Flipper observation of
the real PM5 exists from the failure window; the only 09-05 Flipper read of
the PM5 is the post-reboot one, which succeeded (pages count not recorded).

## The experiment that separates them ("control-tag bracket", ~4 min, no rowing, no app change)

Kit in hand: the phone, the PM5, the Flipper loaded with `C2_pm5_rebuilt.nfc`
(proven in NF-FLIPPER-EMU-v2 to read as the three fixture records over Core
NFC). Per reader start, four observations:

1. **Phone NDEF read of the Flipper** (control; touches no PM5): a receipt with
   the three fixture records. Pure phone-stack liveness.
2. **Phone NDEF read of the PM5** (subject).
3. **Flipper raw read of the PM5**, recording `Pages read: N of 42`, the UID,
   and whether page 4 begins `03 xx` — the quantity an iOS NDEF session
   structurally cannot report, which is what makes it an oracle rather than a
   mirror.
4. **Photo of the PM5 display** at the moment of (2), and whether a BLE link
   is up.

Run the set once before the connect cycle and once after. Signatures:

| Observation | A1 RF-silent | A2 NDEF-layer | A3 phone fault | A5 asleep | A7 BLE-suppressed |
| --- | --- | --- | --- | --- | --- |
| (1) control tag | reads | reads | **fails** | reads | reads |
| (2) PM5 by phone | fails | fails | fails | fails | fails |
| (3) Flipper raw | **no UID, 0 pages** | **UID + pages, TLV absent/short** | reads | varies | reads |
| (4) display / BLE | on | on | on | **off/asleep** | **link up** |

(1) alone retires A3, which nothing in the record currently touches, for one tap.

## Consequences

1. **Walk protocol:** a Flipper read is NOT an oracle for "the PM5 is
   emitting". Scored as one it must record `Pages read` and the page-4 TLV,
   bracket the phone's window (before and after), and be paired with a phone
   read of the control tag. `RECOVERY-WALK-V4.md` is rebuilt on this bracket.
2. **Product:** Scan-NFC must treat "no tag found" as an expected outcome and
   always offer the Bluetooth picker as a fallback. Do not attribute a cause:
   on one occasion an iPhone found no tag for minutes and reading resumed
   after a power cycle; the trigger is unidentified. No rule may be
   conditioned on "same power cycle": no walk records the PM5's last power-up.
3. **Spec debt:** the Gate -1 design gets a "PM5 NFC availability" section
   citing this note and the bracket.
