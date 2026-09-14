# Runsheet — public activation and the stranger sign-up, v3

**Status: DRAFT, awaiting the PM readiness gate. v1 was NOT READY on twelve
counts, v2 on three more — two of which the v1 fold introduced. This is the
six-item fold of v2 and changes nothing else. Do not run this yet.**

Operator: James. Controller: this session. No erg, no rowing.

## The one thing this session decides

**With the door open, does a real identity that is not on the allowlist get an
account?**

Narrowed from v1, which bundled "create, use and delete" as three equal
clauses. Only the first is unsettled: `compose.e2e.yml` already runs the whole
e2e suite under `ACCESS_MODE: public`, so create-and-use in public mode is
exercised on every CI run against a synthetic provider, and James completed a
real-provider deletion on 2026-09-14. What no desk test can reach is a REAL
identity, not on the allowlist, meeting the real gate.

**The relay case is not a secondary target of this session.** It was struck
when James answered that he has no second Apple ID, and it now lives as a dated
ROADMAP row. Nothing below tests it.

## Surfaces under test, named per stage

- **Phone:** TestFlight build **993** (`v0.48.0`, tag at `c77b3792`).
- **Host:** main at **`1aebec39`**, seven commits ahead of that tag, including
  #444's sign-in copy. **A copy observable must be quoted from the surface
  actually running it**, and every string below is quoted from `v0.48.0` — the
  phone bundle — rather than from main. That distinction is not academic here:
  #444 changed one of the two denial strings, so the sentence on main is NOT
  the sentence on the build you are holding. See S3.

## Timer table

| Clock | Value | Starts | Clears |
|---|---|---|---|
| **TOTAL operator wall-clock** | **40 min, UNMEASURED** | you open the app for S1 | step 6 |
| Stage 1, desk | ~3 min, **UNMEASURED** | you open the app | the denial screen |
| **DOOR OPEN — the safety clock** | **20 min HARD** | step 2's recreate returns | step 5's recreate returns |
| Stage 2 cases | 12 min of that 20 | A1b | A5 |
| Step 5, closing | **outside every cap** | always runs | always runs |
| Container health wait | 120 s | each `up -d --wait` | health, or it fails loudly |
| Attempt TTL | 5 min | each sign-in attempt | its own expiry |

**Every duration here is UNMEASURED except the two the code sets.** They are a
budget, not a finding, and nothing is ruled out on them. **The 20-minute door
clock is the one that matters: set an actual alarm.** At 20 minutes you run
step 5 wherever you are.

**Attempts: one per case. One pre-approved retry, inside the same 20 minutes,
only if an attempt expires on its own 5-minute TTL.** Anything else is an abort.

## Typing budget

**Seven pastes across five distinct blocks. Everything else is taps.** Counted
against this file:

| Block | Pasted |
|---|---|
| `docs/deploy.md`'s combined check block | 3x — steps 1, 2 and 5 |
| step 1's `grep -c '^ACCESS_MODE=' .env; git status --porcelain` | 1x |
| step 2's three-line open block | 1x |
| step 5's three-line close block | 1x |
| step 5's gated `rm` | 1x |

Getting to an SSH session at `~/Ergomatic` is a precondition, not one of these.
**No command is composed during the session**; the abort list carries that as a
stop condition, and it is the operator's real protection.

## Stage 1 — desk rehearsal, no host change, and it can kill the session cheaply

This exists for two reasons. It answers the last feasibility question, and it
produces the control leg without which A1 cannot go red.

| # | Action | Observable | Outcome |
|---|---|---|---|
| S1 | On You, tap **Sign out** | the sign-in screen | — |
| S2 | Sign in with Google and pick a SECOND account in the chooser | the chooser offers one | **If it offers no second account, STOP. The session does not happen in this form** and nothing has been touched |
| S3 | Complete it | **a denial naming that address** — see the two forms below | **This is the control, and the deciding condition is the SEMANTIC, not the exact words.** PASS: either form. FAIL: no denial at all, or one naming a different address — then STOP, the gate is not behaving as `restricted` before you open it |

**Build 993 carries TWO denial strings and either is a pass**, because #444
added the second sentence to the native one seven commits AFTER the tag your
phone runs. Quoted from `v0.48.0`, not from main:

- `SignIn.tsx`: `<address> isn't invited to this Ergomatic. Ask the owner to add you.`
- `native/signin.ts`: `<address> isn't invited to this Ergomatic.` — **no
  trailing sentence**

Which one you see depends on the `legacyGoogle` branch at `SignIn.tsx:252`
against this host's `/api/auth/options`. The front-door branch is the likely
one, and "likely" is why both are listed rather than one pinned: a control leg
that aborts a healthy session on copy, or that gets waved through on a
mismatch, has stopped being a control.

**Do not proceed to stage 2 unless S2 and S3 both passed.**

## Stage 2 — the door-open window

| # | Action | Observable | Pass / fail / inconclusive |
|---|---|---|---|
| A1b | **After step 2 has confirmed `public`**, sign in with the SAME second account from S3 | the first-account confirmation, naming it | **PASS: the same identity that was denied at S3 is now admitted.** That contrast is the session's result; the screen alone is not. FAIL: the denial again |
| A2 | Tap **Create account** | Today, with an empty log | PASS: empty Today. FAIL: an error, or someone else's data |
| A3 | Log one row by hand | the row appears after a reload | PASS: it is there. This is the only write by a non-allowlisted account, and it gives A4 something to destroy |
| A4 | You → **Delete account**, complete the re-auth | signed out | **This is TEARDOWN, not a test.** An account created under public mode and left alive becomes the locked-out-rower exposure the moment step 5 restores `restricted`. Its evidence value is a bonus |
| A5 | Sign in once more with that account | the first-account confirmation appears | **OBSERVE ONLY. DO NOT TAP CREATE.** The delete is a hard `DELETE FROM users`, so the screen appearing at all is the proof. Tapping Create would manufacture the orphan A4 just removed, minutes before the door closes |

**One thing that cannot go wrong, said here so you do not worry about it
live:** with two Google accounts on the device, picking the wrong one during
A4's re-auth cannot delete the wrong account. The server throws
`account_changed` when the proven subject does not match the session's user.

## The steps

**Starting state: SSHed to the host, `cd ~/Ergomatic`.**

1. **Read back the current state.** Paste `docs/deploy.md`'s combined check
   block; send me its output. Also paste:
   `grep -c '^ACCESS_MODE=' .env; git status --porcelain`
   Expect `0` and no output. **If the checkout is already dirty, STOP and tell
   me** — that is a pre-existing broken deploy, not something to fix inside a
   clock.
2. **Open the door.** Editor-free, and the backup lives OUTSIDE the checkout so
   it cannot dirty it:

   ```sh
   cp -p ~/Ergomatic/.env ~/ergomatic-env-backup
   printf '\nACCESS_MODE=public\n' >> ~/Ergomatic/.env
   docker compose up -d --wait
   ```

   Then re-run step 1's check block. **It must print `public`. If it does not,
   STOP** and go to step 5.

   **The leading `\n` is load-bearing.** Nothing has read whether `.env`'s
   last line ends in a newline; without it the append lands ON that line, and
   the realistic corruption is `ALLOWED_EMAILS=...ACCESS_MODE=public` — the
   door stays shut AND the allowlist becomes one garbage entry that locks out
   every real account. Detected (the check block prints restricted and its
   locked-out count goes non-zero) and undone by step 5's restore, so it costs
   five minutes inside a 20-minute clock rather than being a disaster. A blank
   line in `.env` is inert.

   **What a typo looks like, so you do not diagnose it live:** any value that is
   not exactly `restricted` or `public` makes the API refuse to boot, `--wait`
   fails after 120 s, and the site is down. That is a step 5, immediately.
3. **Start the 20-minute alarm.** Run stage 2.
4. **STOP at 20 minutes** wherever you are.
5. **Close the door**, by restore rather than edit:

   ```sh
   cp -p ~/ergomatic-env-backup ~/Ergomatic/.env
   docker compose up -d --wait
   git status --porcelain
   ```

   Then re-run step 1's check block. **The session is not over until it prints
   restricted AND `git status --porcelain` printed nothing.** Send me both,
   plus the final account count — it should equal step 1's baseline, and that
   equality is the only thing that would reveal an uninvited sign-up.

   **Only once that check has printed restricted**, delete the backup: it is a
   mode-600 copy of the host's secrets and it does not stay in `$HOME`.

   ```sh
   rm ~/ergomatic-env-backup
   ```
6. **Sign back into your own account on the phone.**

## Abort conditions

- S2 or S3 fails (nothing has been touched; not an abort, just a stop).
- Step 2's check does not print `public`.
- Any container fails its health wait.
- The 20-minute door clock.
- Anything needing a command not written above.

**On any abort, go to step 5.** It is outside every clock and it is the same
pair of commands you already ran once.

**And the honest part v1 got wrong: step 5 is not guaranteed to run.** If SSH
or the network drops after step 2, the door stays open with nothing to close it
and nothing watching. The fallback is to re-establish SSH from any device and
run step 5; if you cannot, the safer resting state is the site DOWN rather than
the door open. The only detector we have is step 1's count against step 5's.

**No merges to main while the door is open.** A CI deploy mid-window rebuilds
against the same `.env` and is harmless — unless the checkout is dirty, in
which case `deploy.sh` exits 3 and the tree silently stops advancing.

## Why the door closes again, since a step with no reason gets skipped

Two, both citable. **No database backup exists** (`docs/deploy.md`'s Rollback
section says so; the backup script is a Wave B row). And **PR2 is unshipped**,
so a stranger arriving with a second provider can still create the duplicate
the follow-through exists to prevent.

## Evidence, and the PII rule

The only durable artefacts are step 1's and step 5's count outputs and one
screenshot of A1b's confirmation screen. **That screen names the second Google
account's address.** Review it in chat; the committed record says "a second
Google account" and never the address. The check block was built to print
counts rather than addresses for this reason.

## What this session does NOT do

No rebuild, no deploy, no tag, no code change, no migration, no relay test.
