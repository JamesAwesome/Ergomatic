# NF-FLIPPER-EMU-v2 — retest with the rebuilt replica

Status: COMPLETED — POSITIVE. See [FLIPPER-EMU-V2-RESULT.md](FLIPPER-EMU-V2-RESULT.md). Run and consent consumed.

Identical to `FLIPPER-EMU-V1.md` in every case, cap, control, capture, finish
and stopping rule (read that file; not restated). The ONLY change is the
emulated file: step 1 selects `C2_pm5_rebuilt.nfc`, not the truncated
`C2_pm5.nfc`. Five-minute cap, one reader start, one Cancel tap, desk, no
install, no PM5 required.

## Why the input changed

v1 was NEGATIVE because the saved file was a 6-of-42-page read (all-zero data
pages), byte-identical to the 2026-08-31 partial read committed as
`docs/monitor/nfc/pm5-tag-2026-08-31-partial.nfc`. `C2_pm5_rebuilt.nfc` is a
full 42-page Type 2 image (Flipper NTAG203 container) synthesized from the
dated fixture, round-trip validated to the three PM5 records byte-for-byte,
and confirmed on the Flipper by serial read-back. See
`FLIPPER-EMU-V1-RESULT.md`. This is a strictly better, verified input to the
same PM-approved v1 protocol; no case, gesture, timing or consent shape
changes.

## What this does not prove (RF11 relabel, PM condition)

The emulated image is SYNTHESIZED from `pm5-tag-2026-09-04-iphone.json`, and
`compare-emulated-records.py` checks the read against that same fixture. The
oracle now shares its source with the target, so a positive proves the
Flipper to Core NFC path carries the fixture's NDEF records faithfully
(transport fidelity). It does NOT re-prove the real PM5 tag's on-wire framing
(capability container, TLV), which we reconstructed rather than read off the
tag. That is enough for this walk's purpose (de-risk host tooling; the
unsupported and multi-tag cases, whose tag is arbitrary); a green must not be
read as "the real PM5 tag emulates cleanly." Correspondingly, "records
differ" now indicates transport or emulation corruption, not that the Flipper
is unfit as a stand-in.

## Feasibility note

v1's exact-action table carries forward. Step 1's file is now
`C2_pm5_rebuilt.nfc` (written and serial-verified this session); a missing
file by that name is **blocked**, not a guess. Phone-to-Flipper alignment
remains undemonstrated; repositioning inside the one reader session is
permitted and is the same scan.

## Physical block (v1's, one word changed)

> 1. On the Flipper: NFC → Saved → **C2_pm5_rebuilt** → Emulate, and leave it
>    emulating. If there is no file by that name, reply **blocked**.
> 2. On the phone, open YOU and scroll to NFC GATE -1 PROBE (at most three
>    scrolls). If Run normal sample is missing or disabled, or a popup
>    appears, reply **blocked**.
> 3. Tap Run normal sample once, then hold the top back of the phone against
>    the back of the Flipper. If no NFC sheet appears, move the phone around
>    against the Flipper until it does. That is the same scan, not a new one.
>    Do not tap through the sheet and do not tap Run normal sample again.
> 4. Leave it while I collect the result. I will tell you when finished, and I
>    will send you one cancellation step shortly. Expect it.

Cancellation step and outcome table: v1's, unchanged.

## PM disposition

`/root/walk_pm`, 2026-09-05: **PASS WITH CONDITIONS — NF-FLIPPER-EMU-v2.**
Delta approved; v1's protocol, cap and all conditions carry forward. The one
condition is the RF11 relabel above (the oracle now shares the fixture with
the emulated image, so a positive proves transport fidelity, not tag
authenticity). Physical block approved as written. Consent is James's **go**.
