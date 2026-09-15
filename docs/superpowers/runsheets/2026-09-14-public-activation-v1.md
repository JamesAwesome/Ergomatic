# Runsheet — public activation and the stranger sign-up, v1

**Status: DRAFT, awaiting the PM readiness gate. Do not run this yet.**
Operator: James. Controller: this session. Zero rowing on the erg is required;
this is a phone-and-laptop session, which the standing rule covers anyway.

## The one thing this session decides

**Can a person with no Ergomatic account create one, use it, and delete it,
with the front door open?**

That sentence is Wave A's written exit, and nothing on the desk can settle it:
`ACCESS_MODE` is unset on the host, which means `restricted`, so
`requireAccess(identity.email)` refuses any address not on `ALLOWED_EMAILS`
before a new account can be created. Every test we own runs against a synthetic
provider or an allowlisted address. The only way to learn the answer is to open
the door and walk through it as someone who is not on the list.

Secondary, and free once the door is open: **does an Apple private-relay
address survive the round trip** — sign-up, storage, and the deletion that
must find it again. `restricted` cannot reach that case at all, because a relay
address is never on an allowlist.

## FEASIBILITY — ANSWERED 2026-09-14, and Case B is STRUCK

**Case B below needs an Apple ID that has never signed in to Ergomatic.** Your
own already has an account, and Sign in with Apple returns the same subject for
the same Apple ID, so it would land on your existing account rather than create
one. "Hide My Email" does not change that — the subject is per Apple ID, not
per address.

**James, 2026-09-14: "I don't have a second Apple account."** So Case B is
struck from this runsheet rather than improvised on the night, and the relay
question stays open as a dated ROADMAP row. Case A runs with a second **Google**
account, which the native chooser offers from whatever you are already signed
into.

**What striking it costs, stated rather than buried.** The private-relay round
trip stays untested: sign-up storing a relay address, and the deletion that has
to find it again. `restricted` cannot reach that case and neither can this
session. The one path to it is a newly created Apple ID, which is real friction
on Apple's side and is your call to make separately — it is not a step this
runsheet assumes.

## Timer table

| Clock | Value | Starts | Clears |
|---|---|---|---|
| Total operator wall-clock | **35 min** | when you first touch the host | at teardown, step 9 |
| Host in public mode | **the session only** | step 2's recreate | step 9's recreate |
| Container health wait | 120 s | each `up -d --wait` | health, or it fails loudly |
| Attempt TTL | 5 min | each sign-in attempt | its own expiry |
| Session TTL | 60 days | account creation | sign-out, or deletion |

**At 35 minutes, stop where you are, run step 9, and hand me what you have.**
An incomplete result is a result. A session that runs long is how a host stays
open longer than anyone decided.

## Typing budget

**Three pasted blocks, all pre-tested, all in steps 2 and 9.** Everything else
is taps. No command is composed during the session; if something is missing, it
is an abort, not an improvisation.

## Before you start (controller's, already done or listed as owed)

- Build **993 (v0.48.0)** is the TestFlight build under test. Nothing is rebuilt.
- I own the evidence destination: paste outputs back here and I commit them.
- OWED BY ME before this runs: the PM readiness verdict on this exact version.

## The cases

### Case A — a stranger creates an account, uses it, and deletes it

| # | Action | Independent observable | Pass / fail / inconclusive |
|---|---|---|---|
| A1 | After step 2, open the app and sign in with the second identity | The first-account confirmation screen appears, naming that identity | PASS: the screen appears. FAIL: "isn't invited to this Ergomatic". INCONCLUSIVE: anything else |
| A2 | Tap **Create account** | You land on Today, with an empty log | PASS: empty Today. FAIL: an error, or someone else's data |
| A3 | Log one row by hand (no erg, no monitor) | The row appears in the log | PASS: it is there after a reload |
| A4 | You → **Delete account** → complete the re-auth | You are signed out | PASS: signed out to the sign-in screen |
| A5 | Sign in again with the same identity | The first-account confirmation appears AGAIN, and Today is empty | PASS: it treats you as new. FAIL: the old account or its row comes back |

### Case B — STRUCK 2026-09-14, no second Apple ID exists

Was: the Apple private-relay round trip. Recorded here rather than deleted so
the next reader knows the case was considered and why it is not in the session.

## The steps

1. **Read back the current state.** Paste the combined check block from
   `docs/deploy.md` and send me its output. Confirms `ACCESS_MODE` and the
   account count before anything changes.
2. **Open the door.** Add `ACCESS_MODE=public` to `~/Ergomatic/.env`, then from
   `~/Ergomatic` recreate: `docker compose up -d --wait`. Re-run the block from
   step 1 and confirm it now prints `public`. **If it does not, STOP** — the
   containers did not recreate and the rest of the session is invalid.
3. Run **Case A**.
4. *(Case B struck — nothing here.)*
5. **STOP AT 35 MINUTES** regardless of where you are.
6-8. *(reserved; no steps here — the cases are the work)*
9. **Close the door.** Remove `ACCESS_MODE=public` from `~/Ergomatic/.env`,
   recreate again, and re-run the step 1 block. **The session is not over until
   that output shows restricted.** Then paste me the final counts.

## Abort conditions

- Step 2's check does not print `public`.
- Any container fails its health wait.
- The 35-minute cap.
- Anything that would need a command not written above.

**On any abort: go straight to step 9.** The door closing is the one step that
never gets skipped, and it is why it is a command you already ran once in this
session rather than a new one.

## What this session does NOT do

No rebuild, no deploy, no tag, no code change, no migration. It reads one
configuration value, flips it, walks through the front door, and flips it back.
