# NF-RECOVERY-v2 — the same four A → B checks, resumed

Status: PM PASS WITH CONDITIONS (all four landed below); awaiting James's
explicit **go**.

This is [RECOVERY-WALK-V1.md](RECOVERY-WALK-V1.md) run again under a fresh
clock, fresh run directory and fresh consent. Every case, limit, physical
block, stopping rule, evidence requirement and cleanup step of v1 applies
verbatim and is not restated here. Nothing in the app, the signed build,
the capture controller, the Inspector helper or the receipt verifier has
changed since v1's PM PASS; no suite is rerun. The deltas are how the Mac reaches the phone and when the operator's
ready state is established. Every other case, limit, physical block,
stopping rule and cleanup step of v1 applies verbatim.

## Why v1 stopped and what changes

V1 aborted before app launch when the Mac's wireless CoreDevice tunnel to
the phone timed out 28 seconds after a successful listing. The Mac's logs
show its own Wi-Fi steady and the phone dropping out of the device list
and back over the following seven minutes. The phone-side cause is not
observed. Full record: [RECOVERY-CONNECTION-FINDINGS.md](RECOVERY-CONNECTION-FINDINGS.md).

Three read-only additions, outside the app:

1. **Transport preflight before the invitation.** Immediately before the
   consent invitation is sent, Claude runs the command card's read-only
   `details` and `apps` listings. Both must succeed with `tunnelState
   connected` and identity 0.23.0/789 at the setup-v3 installation URL.
   The `transportType` is recorded in the run's `operator-session.json`.
   A failed preflight means no invitation is sent; nothing else happens.
2. **Wired transport preferred.** If a USB-C cable reaches from the Mac to
   the phone at the PM5 NFC spot, James connects it before replying ready
   and leaves it connected for the whole walk. The walk's own first in-clock
   listing records `transportType`; the pre-invitation preflight records
   the transport as it stood before any cable. Wi-Fi is acceptable if the
   preflight passes; losses recurred more than once within a span shorter
   than the eight-minute cap, so a mid-walk drop on Wi-Fi is a live risk
   that v1's existing stop rules already handle correctly (abort, no
   mutation).

3. **Ready state in the invitation, not after go.** James reports the v1
   phone was not known to be ready when the first listing ran, because v1
   put unlock and PM5 setup after **Start** and the controller listed
   immediately. V2's invitation names the state that must already hold
   when he replies **go**; v1's first physical block loses its unlock line
   and keeps only the PM5 Connect Device and NFC-spot instructions.

The in-walk identity recheck, the once-before-A idle command, the eight
minute total, the per-case admission rule and the exact-PID cleanup are
unchanged. A mid-walk connection loss stops the block exactly as v1's did;
it authorizes no retry.

Consent is consumed by reader starts, not by the clock. If the block stops
before the first reader start with zero NFC attempts and zero phone
mutation, Claude states that fact and asks once whether to run again; his
answer is a fresh **go**, and a fresh preflight and fresh run directory
precede it. This is one explicit re-invitation, not a repair loop: a second
such stop releases him.

## Consent invitation (v1 text plus the ready-state lines)

> Four recovery pairs are ready: at most eight NFC reader starts, eight
> minutes total, no retries or installation. No rowing or heart-rate belt.
> Before you reply: be at the erg with the phone unlocked in your hand,
> Ergomatic open, and plugged into the Mac if a USB-C cable reaches the
> PM5. The Mac starts talking to the phone the moment you reply.
> Reply **go** when that is true and you want to begin.

No scan is authorized until that reply. No clock runs across the wait.
The first physical block after **go** is v1's block with line 1 (unlock)
removed; lines 2 and 3 (PM5 Connect Device, phone at the NFC spot) stand.

## PM disposition

`/root/walk_pm`, 2026-09-05: **PASS WITH CONDITIONS — NF-RECOVERY-v2.**
All four conditions are landed in this file, the findings record and
`RECOVERY-WALK-V1.md`: (1) the preflight records the pre-cable transport,
the first in-clock listing records the walk's; (2) the deltas are named as
transport AND operator ready state; (3) consent is consumed by reader
starts, so a zero-attempt stop before the first reader start earns one
explicit re-invitation and a second releases him; (4) v1's text is
executable only under v2's consent. Wired is preferred, not required:
`transportType` has been `localNetwork` in every record ever taken, so
requiring a cable would gate a one-shot walk on an untested branch. Setup
v3 is not repeated; the once-before-A idle command re-proves route, canary
and document inside the clock. The consent invitation above is approved
verbatim. Scan consent is still James's **go** alone.
