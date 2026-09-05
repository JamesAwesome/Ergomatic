# PM5 NFC tag availability around Bluetooth connections — 2026-09-05

## What and why

On 2026-09-05 the PM5 on James's erg (model D/E, firmware 459.069) stopped
answering NFC reads after a recovery-walk Bluetooth connect/disconnect/re-arm
sequence, stayed dark to two different phone apps for minutes, and came back
only after a battery-pull reboot. The Scan-NFC spec's Gate -1 design never
asked whether the PM5 keeps its tag available after a connect (checked:
`2026-09-03-phase-nf-scan-nfc-design.md` has no such question). This note
records what the vendor publishes, what we observed, and what remains an
inference, so the recovery protocol and the product can be designed against
the PM5 that exists rather than an always-on sticker.

## Observations (PRIMARY, our captures)

| Event, 2026-09-05 UTC | Reader session | Result |
| --- | --- | --- |
| NF-RECOVERY-v3 case 1 A | 7.1 s | Core NFC 200, three PM5 records |
| case 1 B (BLE connect + disconnect) | 4.9 s | 200, three records, connected, disconnected |
| case 2 A, block attempt | 63.1 s | **201 sessionTimeout, no tag** |
| case 2 A, James-authorized retry | 63.1 s | **201 sessionTimeout, no tag** |

James held the phone at the NFC spot throughout both 60 s windows (his
statement). His separate phone NFC app also could not find the PM5's tag. A
battery pull restored NFC; it has read normally since, including while the
phone was Bluetooth-connected to the PM5 (James retested; Flipper read
succeeded). Earlier the same evening, the Flipper's first read of the PM5 at
the erg returned only 6 of 42 pages, minutes after NF-RECOVERY-v2's B had
connected (`RECOVERY-CONNECTION-FINDINGS.md`, `FLIPPER-EMU-V1-RESULT.md`).

## Vendor sources

- **Concept2 PM5 Firmware Timeline** (PRIMARY,
  https://www.concept2.com/support/monitors/pm5/firmware-timeline):
  - v208 and v358, March 2021: _"Improvements for NFC wake-up behaviour"_
  - v868 (Nov 2019) and v17 (Feb 2015): _"NFC compatibility improvements for
    iPhone"_
  - v256 (Jan 2023), v257 (May 2023): _"Improvement in Bluetooth
    disconnect/reconnect behavior during a workout"_
  The load-bearing attribute: **NFC on the PM5 is firmware-managed behaviour
  with a wake-up dimension**, not a passive sticker. A firmware state can
  therefore leave the tag unresponsive.
- **Concept2 PM5 Troubleshooting** (PRIMARY,
  https://www.concept2.com/support/monitors/pm5/troubleshooting): no mention
  of NFC, sleep/wake, or Connect Device. Battery removal is the documented
  reset for wireless faults: _"Remove the batteries for at least 5 full
  minutes"_ (Error 886), after which _"press More options then press Turn
  Wireless On."_ So the reset James used is Concept2's own wireless reset.
- **Concept2 forum, "ErgData: scan NFC tag instead of (new) PM5?"**
  (SECONDARY, https://www.c2forum.com/viewtopic.php?t=201395; fetch returned
  403, seen only via search snippet): _"the NFC tag inside the PM5 contains
  static data (the PM5's serial number and Bluetooth MAC address) so the
  reader … knows what device to connect with."_ Consistent with our payload
  (MAC in bytes 0-5, name after). Static CONTENTS, not necessarily static
  PRESENCE.
- **Nothing found** stating that the PM5 disables NFC while Bluetooth is
  connected, or re-arms it on disconnect. Searched Concept2 support, the
  firmware timeline, and forum snippets. "Nothing found" is the result.

## Does the underlying system have the concept?

Yes: the PM5 owns an NFC availability state that firmware manages ("wake-up
behaviour"). We had been designing as if the tag were always present. The
recovery matrix's question ("can an old NFC attempt interfere with its
successor?") therefore has a PM5-side answer that can look identical to an
app-side failure: the successor finds no tag because the PM5 stopped offering
one.

## Inferences (labelled)

- INFERENCE: the connect → disconnect → re-arm (Connect Device) → new reader
  sequence in case 1 left the PM5's NFC unresponsive. A single fresh connect
  after the reboot did NOT reproduce it (James), so a plain "disabled while
  connected" rule is falsified; the trigger is some part of the sequence or
  a firmware wedge.
- INFERENCE: the 6-of-42-page Flipper read was the same state beginning to
  bite (tag dropping mid-read), not operator motion.
- Unknown: whether this is specific to firmware 459.069 or hardware revision;
  whether Concept2's Bluetooth-disconnect improvements (v256/257) interact
  with NFC re-arm; how long the state persists without a power cycle.

## Consequences

1. **Walk protocol:** every reader start that ends with no tag (Core NFC 201)
   is adjudicated by an independent Flipper read at the spot BEFORE it is
   scored: Flipper reads → phone/app problem; Flipper finds nothing → `PM5 NFC
   unavailable`, record it, power-cycle, and the case is INCONCLUSIVE for the
   app. James's standing rule: the Flipper comes to every NFC walk.
2. **Product:** shipped Scan-NFC must not assume a second tap works after a
   connect on the same power cycle. Either document the limitation, fall back
   to the Bluetooth picker when no tag is found within the reader window, or
   both. This is a design question for the phase, not a walk fix.
3. **Spec debt:** the Gate -1 design gets a "PM5 NFC availability" section
   citing this note; the antagonist's next pass attacks it as new wire ground.
