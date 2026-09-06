# NF-FLIPPER-EMU-v1 — one desk scan of a Flipper-emulated PM5 tag

Status: PM PASS WITH CONDITIONS (all four landed); awaiting James's explicit **go**.

## What and why

James read the PM5's NFC tag into a Flipper Zero at the erg tonight; it
labels the tag **NTAG203** (its fallback identification; the repo's
`docs/monitor/nfc/README.md` already showed the PM5 emulates a Type 2 tag with
a 992-byte CC — James's reading of the Flipper's
screen). If the phone reads the Flipper's emulation as the same three NDEF
records the real PM5 produces, then the unsupported-tag case, multi-tag
presentation, and every host-helper defect like tonight's
`FinalDisplayMismatch` can be debugged at the desk with real Core NFC. A positive result would
SUPPORT the hypothesis that erg trips shrink to the BLE half of each
recovery B; it does not establish it. This walk decides exactly one
question with one reader start, at the desk, no erg.

## Primary evidence target

Does Core NFC on this iPhone deliver the emulated tag's NDEF as records
byte-identical to `docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json`?

Independent observable: the capture controller's `evidence.json` receipt,
`attempts[0].records`, compared by the private read-only
`compare-emulated-records.py` (SHA-256 `c4496c3a…888f`). Proved tonight:
green against case 1's real-PM5 evidence, red against a fixture with one
payload byte flipped. The comparison does not depend on BLE.

| Outcome | Meaning |
| --- | --- |
| Records equal, BLE then matches and connects (PM5 still advertising in range) | POSITIVE emulation; incidental full handoff |
| Records equal, status stays "Scanning for the PM5's exact local name.", Cancel sample exports | POSITIVE emulation; no-match path exercised |
| Records differ | NEGATIVE for this Flipper file and emulation mode, one attempt, not retried |
| Receipt with zero records, no sheet, no read, control missing, capture broken, Cancel unreachable | INCONCLUSIVE; retain and stop (a Flipper-side emulation limit is at least as likely as a Core NFC difference) |

**The PM5 is not at the desk. The no-match path is expected and the Cancel
sample tap is the primary evidence path, not a contingency; if it is
unreachable the walk is INCONCLUSIVE about the primary target.**

## Exact-action feasibility

| Action | Platform / build | Starting state | Demonstrated? |
| --- | --- | --- | --- |
| Open YOU, scroll to NFC GATE -1 PROBE, tap Run normal sample | iOS 26.6.1, 0.23.0/789 | authenticated You, no sheet | Yes: v7, v8, and tonight's idle check saw the enabled control |
| Flipper: NFC → Saved → PM5 file → Emulate | Flipper Zero, James's firmware | Flipper idle | NOT PREVIOUSLY DEMONSTRATED (SECONDARY menu path); a missing file or different menu is **blocked** |
| Phone-to-Flipper antenna alignment | iPhone 17 Pro back, Flipper back | reader session open | NOT PREVIOUSLY DEMONSTRATED; repositioning inside the single reader session is permitted and is the same scan |
| Scroll to Cancel sample after the sheet closes and tap once | 0.23.0/789 | status "Scanning for the PM5's exact local name." | Unobserved on the phone; v8's positive never reached it. This is the walk's critical path (above) |

## Protocol (v8's one-scan shape, Flipper in place of the PM5)

Build, controls, capture and finish are v8's, unchanged: installed
diagnostic 0.23.0/789 (the recovery artifact; its `Run normal sample` and
`Cancel sample` controls are the same component v8 used), the unchanged
capture controller, v8's read-only `observe.mjs` finish rule (two distinct
canonical exports for the one attempt), exact-PID SIGINT and verified
cleanup. No install; a controller identity mismatch stops without
reinstalling. Read-only transport preflight first, as in v2.

Cap: **five minutes** total from **go** through cleanup. One reader start,
at most one Cancel sample tap, no retry. Zero rowing, no PM5 action. If the
PM5 is still advertising within range the BLE half may complete on its own;
that is recorded, not required.

After **go** (phone unlocked, Ergomatic open, plugged into the Mac, Flipper
in hand), Claude starts capture, requires `WebView loaded`, then sends the
PM-approved block:

> 1. On the Flipper: NFC → Saved → the saved PM5 file →
>    Emulate, and leave it emulating. If there is no saved file, or the menu
>    does not look like that, reply **blocked**.
> 2. On the phone, open YOU and scroll to NFC GATE -1 PROBE (at most three
>    scrolls). If Run normal sample is missing or disabled, or a popup
>    appears, reply **blocked**.
> 3. Tap Run normal sample once, then hold the top back of the phone against
>    the back of the Flipper. If no NFC sheet appears, move the phone around
>    against the Flipper until it does. That is the same scan, not a new
>    one. Do not tap through the sheet and do not tap Run normal sample
>    again.
> 4. Leave it while I collect the result. I will tell you when finished, and
>    I will send you one cancellation step shortly. Expect it.

Cancellation step, v8's text verbatim, sent as a matter of course after 30 s
of observed BLE scanning with at least 90 s remaining:

> 1. If the NFC sheet has closed and the probe still says "Scanning for the
>    PM5's exact local name," scroll to Cancel sample (at most three
>    scrolls) and tap once.
> 2. Leave the app open while I save the result. If that control is
>    missing, disabled or covered, reply **blocked**. Do not start another
>    sample.

Finish: `finalReceiptAvailable=true` → SIGINT the retained controller PID,
require exit and `cleanupVerified:true`, run the comparison, release James
with the outcome and actual total time. Broken capture, **blocked**, or the
cap stops the attempt with cleanup regardless of evidence.

## What this does not prove

A positive result proves the phone reads THIS Flipper's emulation of THIS
tag as the PM5's records. It says nothing about BLE, about other PM5s, or
about the product's future reader. A Flipper-driven case never substitutes
for a hardware criterion that names the PM5, and one tag emulated
identically proves nothing about an arbitrary tag or about two tags in the
field at once (a Flipper emulates one). What it de-risks is the host
tooling.

## PM disposition

`/root/walk_pm`, 2026-09-05: **PASS WITH CONDITIONS — NF-FLIPPER-EMU-v1.**
Landed: (C1) Cancel is the primary evidence path at the desk, sent as a
matter of course after 30 s of BLE scanning with ≥90 s left; (C2) the
exact-action table above, with the two undemonstrated actions marked and
repositioning inside one reader session permitted; (C3) the unsupported and
multi-tag coverage claim deleted, the erg-trip claim demoted to a
hypothesis; (C4) outcome rows narrowed as above. Physical block approved as
written. Consent is James's **go** alone.
