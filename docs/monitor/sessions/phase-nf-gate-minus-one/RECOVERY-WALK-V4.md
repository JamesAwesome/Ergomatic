# NF-RECOVERY-v4 — control-tag bracket, then cases 2-4

Status: PM PASS WITH CONDITIONS (rev 3, all five landed); awaiting James's
**go**.

**v4's primary target is PM5 NFC availability.** Cases 2-4 run with the
remaining budget only if the bracket is clean; otherwise they stay unrun
without prejudice, and v1's recovery question ("can an old attempt interfere
with its successor") is unanswered. v3 proved the recovery matrix is
uninterpretable until availability is: a no-tag B cannot be scored as a
recovery failure.

## What and why

v3 case 2 found no PM5 tag in two 60 s NDEF windows and the cause is not
identified (`docs/superpowers/research/2026-09-05-pm5-nfc-availability.md`,
rev 2: five live alternatives). The bracket is taken right after a connect
cycle, because that is the only place the condition has been seen; a rested
PM5 reads fine and proves nothing (James's post-reboot retest already did),
which is why this is one visit, not two.

Everything in `RECOVERY-WALK-V1/V2/V3.md` stands — build 0.23.0/789, capture
controller, fixed helper, one attempt per case, stop-on-first-failure,
exact-PID cleanup, transport preflight, ready state in the invitation — with
two amendments stated here rather than inherited silently:

- **Cap: ten reader starts, ten minutes.** Arithmetic: two brackets × two
  phone reader starts (control tag, PM5) + cases 2, 3, 4 × two = 4 + 6 = 10.
  The Flipper read and the photo are not Core NFC starts. Case 1 is closed
  and budgets nothing.
- **v1's "zero photos" limit is amended: one photo of the PM5 display per
  bracket.** It is the strongest observation in the set; "read me the top
  line" would put an undocumented indicator's interpretation on James.

## Bracket (before case 2, and again after any no-tag stop)

Sent as ONE block; James sends ONE message at the end. His replies are
observations, not handshakes; the controller reads both phone receipts itself
and never waits on a timing word.

> 1. On the Flipper: NFC → Saved → **C2_pm5_rebuilt** → Emulate. If there is
>    no file by that name, reply **blocked**.
> 2. Hold the top back of the phone against the back of the Flipper. I will
>    start the reader. Move the phone around against the Flipper until the
>    NFC sheet appears — that is the same scan, not a new one. Do not tap
>    through the sheet.
> 3. Move the phone to the PM5 NFC spot and hold it there. I will start the
>    reader again and tell you when that window is over; it can take up to a
>    minute.
> 4. On the Flipper press Back to the NFC menu, choose **Read**, and hold it
>    at the PM5 spot until it shows a result or its own failure screen. Do not
>    retry it. If it read something, **Save** it with any name.
> 5. Photograph the PM5 display.
>
> Then send me ONE message: whether the Flipper read anything and the name
> you saved it under (or `none`), the photo, and — only if the display makes
> it obvious — `link` or `nolink` for whether a Bluetooth connection is
> shown. The photo is the record; don't guess. If any control named here is
> missing or a popup appears, reply **blocked** instead.

**Pages count (C3):** the Flipper's read-result screen has not been validated
to show a pages count (RF13: the only evidence for `Pages read: N of 42` is a
saved `.nfc` file), so v4 does not ask James to read it. Admission to the
cases needs only the two phone receipts: control tag ✓ (three fixture
records) and PM5 ✓. The saved Flipper file's `Pages read:` / `Pages total:`
and page-4 TLV are pulled over serial after the walk (`flipper-cli.py`,
`storage read`) and decide the layer for any FAILED bracket per the research
note's signature table — a failed bracket stops the walk regardless, so the
count is never needed live.

Transitions: after step 4 the Flipper is out of Emulate; a repeated bracket
starts again at step 1. Between cases (v1's block) the Flipper stays idle.

## Adjudication of a no-tag reader start inside a case

If any case's A or B ends Core NFC 201 with no tag, the case is INCONCLUSIVE
(never "failed recovery"), the block stops, and the bracket runs once more
from step 1. No retry of the case.

## Consent invitation (PM-approved, replaces v3's)

> Recovery is ready to resume: a two-minute tag check, then recovery pairs 2,
> 3 and 4. At most ten NFC reader starts, ten minutes total, no retries or
> installation. No rowing or heart-rate belt. One photo of the PM5 display is
> part of the check. Before you reply: be at the erg with the phone unlocked
> in your hand, Ergomatic open, the Flipper in reach with `C2_pm5_rebuilt.nfc`
> on it, and the phone plugged into the Mac if a USB-C cable reaches the PM5.
> The Mac starts talking to the phone the moment you reply. Reply **go** when
> that is true and you want to begin.

Consent is one **go**; consumed by reader starts (v2 rule).

## Still open, zero operator cost

Answered: James emulated the saved 08-31 file and took no fresh read before
the reboot, so no Flipper observation of the real PM5 exists from the failure
window; the bracket is the first one. Whether the PM5 display carries a distinguishable Bluetooth indicator (no
capture shows one; the photo records it either way).

## PM disposition

`/root/walk_pm`, 2026-09-05: **PASS WITH CONDITIONS — NF-RECOVERY-v4.**
(C1) primary target stated at top; (C2) bracket is one grouped block, one
reply, no timing word; (C3) pages count not asked of the screen, pulled over
serial from the saved read; (C4) cap ten starts / ten minutes with arithmetic,
v1's zero-photos limit amended explicitly; (C5) ROADMAP NF block reconciled
and the availability finding filed as a row. Two-visit split REFUSED on a
structural ground. Product consequence: the design spec already routes the
reader timeout to "No NFC tag detected. Try again." beside manual Connect
(`2026-09-03-phase-nf-scan-nfc-design.md:236`); genuinely new is "do not
attribute a cause" and "no rule conditioned on the same power cycle" — a spec
section is owed, Gate 0 only if copy changes.
