# NF-RECOVERY-v4 — control-tag bracket, then cases 2-4

Status: DRAFT rev 2 (rebuilt after the antagonist delta). Awaits PM readiness
and James's **go**. Not yet invitable.

## What and why

v3 case 2 found no PM5 tag in two 60 s NDEF windows and the cause is not
identified (`docs/superpowers/research/2026-09-05-pm5-nfc-availability.md`,
rev 2: five live alternatives). Running cases 2-4 again without separating
those alternatives would reproduce the same ambiguous stop. v4 therefore
brackets each reader start with observations that name the layer, and only
then runs the recovery cases. The bracket is the antagonist's "control-tag
bracket"; the recovery cases are v1's, unchanged.

Everything in `RECOVERY-WALK-V1/V2/V3.md` stands: build 0.23.0/789, capture
controller, fixed helper, one attempt per case, stop-on-first-failure, exact-PID
cleanup, transport preflight, ready state in the invitation (now including
**Flipper in hand, with `C2_pm5_rebuilt.nfc` on it**). Case 1's v3 evidence
stands; v4 runs cases 2, 3 and 4.

## Bracket (before case 2, and again after any no-tag stop)

James performs, in order, and reports one word each:

> 1. Flipper: NFC → Saved → C2_pm5_rebuilt → Emulate. Phone: Run normal sample
>    against the Flipper's back; reply **control** when the sheet closes.
>    (Phone-stack liveness; touches no PM5. The controller reads the receipt.)
> 2. Phone: Run normal sample at the PM5 NFC spot; reply **pm5** when the
>    sheet closes or after a minute if it does not.
> 3. Flipper: NFC → Read at the PM5 spot. Reply with the two numbers on its
>    screen: pages read and total (e.g. **6/42** or **42/42**).
> 4. Photo of the PM5 display, and reply **link** if the PM5 shows a
>    Bluetooth connection, **nolink** if not.

Scoring is the research note's signature table. Only a bracket that reads
`control` ✓ and `pm5` ✓ admits the recovery cases. Any other signature stops
the walk with the layer named (phone fault / PM5 NDEF-layer / PM5 RF-silent /
asleep / BLE-suppressed), which is itself the result the walk is for.

Cost: four reader starts and about two minutes, inside the eight-minute cap;
the four recovery cases need at most eight reader starts. **Cap for v4 is
therefore twelve reader starts and ten minutes**, stated here so the PM can
accept or cut it; the alternative is a two-visit design (bracket only, then
cases) if the PM prefers the old numbers.

## Adjudication of a no-tag reader start inside a case

If any case's A or B ends Core NFC 201 with no tag, the case is INCONCLUSIVE
(never "failed recovery"), the block stops, and the bracket is run again
immediately (steps 1-4) to name the layer. No retry of the case.

## Open before PM

- Accept the twelve-start / ten-minute cap, or split into two visits.
- The photo in step 4 is the first camera use in these walks; if declined,
  substitute "reply with the top line of the PM5 display".
- Consent stays one **go**; the one-word replies are readiness/observation
  reports, not completion signals, and nothing about evidence reads them.
