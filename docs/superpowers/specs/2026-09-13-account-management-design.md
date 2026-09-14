# Account management — delete, unlink, and following through to a link

> **Revision 2, 2026-09-13.** Revision 1 was hardened and came back NOT READY
> with five blocking findings, three of them inside its own load-bearing
> citations. This revision is a rewrite of the research, the confirmation
> mechanism and the tombstone, not a patch. What changed and why is recorded at
> the foot, because a spec that quietly absorbs a correction teaches nobody.

## What and why

A rower can delete their Ergomatic account from inside the app, and can remove a
sign-in method they no longer want — both from the screen that already lists
their sign-in methods. Deleting is permanent and takes everything with it;
removing a method never leaves a rower with no provider, because the last
remaining one cannot be removed. And when someone signs in with a provider we do
not recognise and tells us they already have an account, proving the other
provider now attaches the new one instead of throwing it away.

Three things drive this. Apple requires in-app account deletion of any app that
offers account creation. A link is currently **permanent** — no code path
anywhere nulls a subject column — so a mistake cannot be undone. And the
duplicate-account dead end has no recovery today, because the recovery is
deletion and deletion does not exist.

**Scope ruled by James, 2026-09-13:** duplicates are resolved by DELETION ONLY.
Account merge and one-way data transfer are both rejected and are not designed
here. PR1 is deletion, unlink and the conflict copy; PR2 is the link
follow-through, which is blocked on real Apple authorization proving
cross-surface subject continuity **and on PR1's unlink, for a security reason
given below**.

## The invariant, stated precisely

Revision 1 said "a rower always retains at least one way back into their
account." That is false at HEAD and the repo says so in its own boot warnings, so
the invariant is narrowed to what this design actually controls:

> **No operation in this design ever leaves an account with zero provider
> subjects, except deletion, which removes the account entirely.**

**What this invariant does NOT promise, stated because revision 1 implied it.** A
rower can already be unable to sign in while their account and its providers are
intact, by two paths the product already has:

- `ACCESS_MODE=restricted` with their email absent from the allowlist. Enforced
  at `sessions.ts`'s resolve and at the attempt layer; `index.ts` warns at boot
  that such accounts "cannot sign back in. Their data is retained."
- The `APPLE_*` configuration being removed from a host where Apple-only
  accounts exist. `index.ts` warns: "they have no way in."

**A consequence this design owes an answer to and does not solve:** a rower
locked out by either path cannot delete their account from inside the app, which
is what 5.1.1(v) requires unconditionally. Today's cohort is a household on a
restricted deployment, so the exposure is bounded — but it is a real gap, it is
recorded here rather than in a PR body, and it is a row.

## Research

### Apple's deletion requirement — PRIMARY

App Review 5.1.1(v) contains **two independent sentences**, and revision 1
conflated them:

> "If your app doesn't include significant account-based features, let people use
> it without a login. **If your app supports account creation, you must also
> offer account deletion within the app.**"

**The deletion obligation is unconditional.** Its only condition is supporting
account creation, which we do. It does not depend on whether our features are
"significant". Revision 1 argued significance at length and concluded deletion
"therefore applies" — the *therefore* was unearned, and the argument it built was
actually a defence of the FIRST sentence, which is a separate and still-live
question: whether App Review may require Ergomatic to work logged-out. That
defence is preserved below as what it is — an argument, not a ruling.

**The logged-out defence (argument, not settled).** The account carries the
rower's training plan, session log and derived career statistics, 2k/6k
baselines, test history, and a linked Concept2 account with stored OAuth
credentials that write to a third-party logbook on their behalf. The Concept2
link in particular cannot exist without an account to anchor it. That is a case
that the features are account-based in substance; it is not a ruling that App
Review will agree.

Four further constraints, quoted in the ROADMAP row from Apple's account-deletion
page: temporary deactivation is insufficient; the entire account record goes, not
only the PII; no phone/email/support-flow door; findability in account settings.

### Apple's revocation guidance — PRIMARY, and revision 1 read it wrong

**Retrieved 2026-09-13 from Apple's own documentation.** Revision 1 built its
failure design on a sentence it misread; the correction matters more than the
conclusion, because the conclusion survives.

**The duty is SHOULD, not MUST.** Apple's account-deletion page:

> "Apps that support Sign in with Apple **should** use the Sign in with Apple
> REST API to revoke user tokens."

Revision 1 said Apple "requires" revocation. It does not.

**The sentence revision 1 leaned on is a CONDITIONAL whose condition we do not
meet.** TN3194, full paragraph with the steps that follow it:

> "**If you don't have the user's refresh token, access token, or authorization
> code**, you must still fulfill the user's account deletion request and meet the
> account deletion requirement. To manually revoke the user credentials, follow
> the steps below:
> 1. Delete the user's account data from your systems.
> 2. Direct the user to manually revoke access for your client.
> 3. Respond to the credential revoked notification to revert the client to an
>    unauthenticated state"

We **have** the token, so this case never applied to us. And even inside its own
case Apple grants no exemption — it prescribes directing the rower to revoke
access themselves. Revision 1 read a case as a rule (RF16's third corollary) and
substituted a log line for Apple's step 2.

**The conclusion survives on authority revision 1 never cited.** Apple's
account-deletion page, verbatim:

> "If your process for account deletion is manual or otherwise takes time to
> complete, this is acceptable. Inform the user how long it will take to delete
> the account and provide a confirmation when the deletion has been completed."

That is the licence for deleting now and revoking after. It also carries an
obligation revision 1 did not have: **if deletion takes time, say so and confirm
when it completes.** Our local deletion is immediate, so what "takes time" is the
revocation; the copy must not claim the revocation is done when it is queued.

**And failing to revoke has a product consequence, not only a compliance one.**
TN3194:

> "If the manual token revocation isn't completed, the next time the user
> authenticates with your client using Sign in with Apple, they won't be
> presented with the initial authorization flow to enter their full name, email
> address, or both."

A rower who deletes and signs up again after a failed revocation gets **no name
from Apple**, so `providers.ts` falls back to `"Rower"` permanently, because
nothing in the product can rename an account. That is the defect already on the
register, reachable a second way.

**What Apple does NOT say, and what we do about it.** TN3194 does not state what
a *successful* revoke does to a re-registered account, and the revoke endpoint's
own wording is inconsistent — its abstract is plural ("Invalidate the tokens and
associated user authorizations") while its `token` field is singular ("The user
session associated with the token provided is revoked"). **We design for
per-token**, the narrower reading, which makes one tombstone per credential
mandatory rather than tidy.

**The re-registration hazard is DECIDABLE, and revision 1 made it undecidable.**
Apple documents that the subject "doesn't change if the user stops using Sign in
with Apple with your app and later starts using it again." So
`SELECT 1 FROM users WHERE apple_sub = $1` answers exactly whether that Apple ID
has re-registered. Revision 1 stripped the subject from the tombstone to claim
anonymity, which foreclosed the only deterministic guard and replaced it with a
bounded window — a heuristic wearing a number. The subject is retained.

### What the codebase provides, and what it refuses — PRIMARY, this repo

- **Deletion CANNOT reuse the link flow's reauth stage.** Verified against
  `0031_apple_front_door.sql`'s DDL: `auth_attempts_purpose_check` admits only
  `('signin','link')`, and `auth_attempts_session_check` requires a `link` row to
  carry a non-null `existing_provider` **different from** its target. So
  "re-prove the one provider you hold" is unrepresentable. `attempts.ts`'s
  `begin()` refuses it twice more: it hardcodes `existing` as the opposite
  provider, and throws `account_conflict` unless the target subject is absent.
  **Deletion's confirmation therefore requires a migration**, and that is a
  SECOND stored shape — see Decisions.
- **A delete attempt and a link attempt are mutually destructive.**
  `auth_attempts_link_session_unique` admits one attempt per session, and
  `begin()` for a link unconditionally deletes any attempt on that session.
- **There are up to TWO Apple grants per rower, guaranteed distinct.**
  `apple_grants` is keyed `(user_id, client_id)`, and `frontDoor.ts` refuses to
  boot if the native and web client ids are equal. A phone-and-web rower holds
  two live refresh tokens.
- **Twelve tables lose rows on deletion, not eleven.** Eleven cascade directly
  from `users`; `auth_attempts` is reached transitively through `sessions`. The
  ROADMAP row's "eight" is corrected in the same PR.
- **Two `set null` FKs, not one.** `session_logs.workout_id` and
  `test_history.session_log_id`. Neither fires on account deletion — both parents
  cascade from `users` — but revision 1 enumerated one and missed the other.
- **A lock-order rule already exists and is bought with a measured deadlock.**
  `attempts.ts` carries it in a comment: "Link mint and session deletion lock the
  session before its attempts. Keep that order for every transition." `original()`
  runs an unqualified `FOR UPDATE` over `sessions INNER JOIN users`, locking
  sessions then users.
- **Revoke is idempotent, and per-token.** Retrieved from Apple's revoke-tokens
  documentation 2026-09-13. The 200 response: _"The request was successful; the
  provided token has been revoked successfully or was previously invalid."_ So
  at-least-once delivery is safe and the outbox needs no dedupe. The `token`
  field settles the scope question the abstract muddies: _"The user session
  associated with the token provided is revoked if the request is successful."_
  Per-token, which is why one outbox row per grant is required rather than tidy.
  (The abstract's plural — _"Invalidate the tokens and associated user
  authorizations"_ — is the looser of the two; we design to the narrower.)

## Decisions

| Decision | Ruling | Who |
|---|---|---|
| Duplicate accounts | Deletion only; no merge, no transfer | James, 2026-09-13 |
| Confirmation strength | Graduated: reauth to delete, plain confirm otherwise | James, 2026-09-13 |
| Deletion vs revocation | Delete immediately; revoke after, best effort | James, supported by the "manual or takes time" quote |
| Revocation retry | Bounded, and guarded by a subject check | James + hardening |
| Multiple containers | Designed for from the start | James, 2026-09-13 |
| PR split | PR1 deletion + unlink + conflict copy; PR2 follow-through | James, 2026-09-13 |

## Design

### Two stored shapes, both TRIAD

Revision 1 declared one. There are two, and both need the DBA and antagonist
gates:

1. **`auth_attempts` gains a `delete` purpose.** `auth_attempts_purpose_check`
   widens to `('signin','link','delete')`, and `auth_attempts_session_check`
   gains a `delete` arm: `original_session_id IS NOT NULL` (it rides the live
   session) and `existing_provider IS NOT NULL` with **no** `<> target_provider`
   requirement, because a delete re-proves a provider the rower already holds.
   `begin()` and `accept()` gain a `delete` branch that resolves the subject via
   the provider being re-proved rather than the opposite one.
2. **`apple_revocations`**, the outbox, below.

### Unlink

One guarded statement, and the guard is the design:

```sql
UPDATE users SET apple_sub = NULL
 WHERE id = $1 AND apple_sub IS NOT NULL AND google_sub IS NOT NULL
```

Paste-tested against real Postgres: updates 1 row on a two-provider account and
**0** on a last-provider account. The last-provider check lives in the `WHERE`
clause rather than a read-then-write, so the database enforces the invariant and
two tabs unlinking different providers cannot both pass.

**Zero rows has three causes and needs three messages.** Last provider; already
unlinked; account no longer exists (deleted in another tab). Revision 1 reported
all three as "you can't remove your last sign-in method", which is a lie to a
rower whose account is gone. The guard stays in the `WHERE`; a second read names
the cause.

Unlinking Apple also deletes that provider's `apple_grants` rows — **both of
them, if the rower used phone and web** — and enqueues revocation.

### Deletion

1. **Reauth** through the new `delete` purpose. Cancelled or failed reauth
   changes nothing. Per Apple's FAQ this is explicitly permitted — "You may add
   steps to verify the identity of the person making the request" — with the
   caveat that apps making deletion "unnecessarily difficult" fail review, so the
   reauth needs a stated escape route when a provider is unavailable.
2. **One transaction**, in this lock order: **sessions before users.** Read the
   Apple grants, insert one `apple_revocations` row per grant, then delete the
   user. Twelve tables lose rows. The order is prescribed because the reverse
   deadlocks against `original()` — measured, with the auth transaction as the
   victim, which surfaces to a rower as a mysterious sign-in failure.
3. **Sign out** to Welcome, with copy that does not claim revocation is complete.
4. **Later**, the outbox revokes.

**Deletion never awaits Apple**, licensed by "if your process for account
deletion is manual or otherwise takes time to complete, this is acceptable."

### `apple_revocations` — a transactional outbox

One row **per grant**, not per account. Columns: the refresh token, the client
id, **the Apple subject**, an attempt count, and a next-attempt time.

**The subject is retained deliberately.** It is what makes the re-registration
hazard decidable rather than guessed: before each attempt, if a live account now
holds that subject, the Apple ID has re-registered — drop the row and do not
revoke. Revision 1 stripped it to claim anonymity; the claim was false anyway,
because a live refresh token is exchangeable at Apple for an `id_token` "that
contains the user's identity information". The row is pseudonymous either way, so
the honest position is to keep the field that buys a deterministic guard and
justify the retention.

**The retention argument, which is the defensible one:** these rows exist solely
to discharge Apple's own documented revocation instruction, for a bounded period,
and are deleted on success or at the deadline. That is a narrower and truer claim
than anonymity.

**Owner: the sweep that already exists.** `createFrontDoor` runs a sweep at boot
and every 60 s, in-process, `unref`'d, already sweeping expired attempts and
sessions under independent error boundaries. Revocation becomes a third arm.
**No cron, no new scheduler.**

**Multi-container from the first line**, because more than one container is a
stated future goal. Claims are taken with:

```sql
SELECT ... FROM apple_revocations
 WHERE next_attempt_at <= now() AND attempts < $cap
 FOR UPDATE SKIP LOCKED LIMIT 10
```

`SKIP LOCKED` gives concurrent sweepers disjoint work by construction — correct
at one container and at five, with no coordination. This matters because
revocation is the **first non-idempotent side effect** in that loop: the existing
arms are `DELETE`s, where duplicate work is waste; a duplicated revoke is an
external call.

**Lifetime table (RF27).**

| State | Minted | Cleared | Survives |
|---|---|---|---|
| `apple_revocations` row | deletion/unlink transaction, one per grant | success; subject re-registered; attempts ≥ cap | process restart, container replacement |
| Row claim (`FOR UPDATE SKIP LOCKED`) | sweep tick | transaction end | nothing — a dead process releases it |
| `attempts` counter | incremented per attempt, in the claiming transaction | with the row | restart: a crash mid-attempt loses the increment, so the cap is a floor |
| Sweep timer | `createFrontDoor` | `close()` | nothing; `unref`'d, never holds shutdown |

**At the cap**, the row is dropped and the failure is logged. Per Apple's own
conditional path the honest remainder is step 2 — direct the rower to revoke
access themselves — but they are gone by then, so this is a known limit rather
than a solved problem. Recorded, not hidden.

### The other two live credentials

The design's own principle — holding a live credential for a relationship the
rower ended is the inconsistency this avoids — governs three, and revision 1
touched one.

- **`auth_attempts.apple_refresh_token`** cascades away through `sessions` on
  deletion, never revoked. Every `cancel()` and `discard()` does the same. **PR1
  enqueues these too** where a token is present, since the outbox now exists.
- **`concept2_links` tokens** cascade away with nothing revoked at Concept2, and
  there is no deauthorize path anywhere in the repo. **Out of scope for PR1**,
  and stated as a decision rather than an oversight: Concept2 is a different
  vendor with a different obligation, and Apple's "all data associated with their
  account" speaks to our storage, which does go. It is a row.

### Following through to a link (PR2)

Today "I already have an account" cancels the attempt and destroys the verified
subject and the Apple grant, so the same screen returns on every future sign-in —
a fresh chance to create a duplicate each time. PR2 carries the confirmed attempt
across the second provider's round trip and attaches the identity.

**The security shape, settled by the hardening pass.** This is the OAuth
pre-account-linking attack (RFC 9700, which this repo already cites for the
Concept2 case). **The confirmation alone is NOT sufficient.** What actually bounds
it is `auth_attempts.binding_hash`, a per-attempt secret the client holds, which
forces attacker and victim onto the same client instance and collapses the attack
from remote phishing to shared-device. Revision 1 never named it.

Sufficient only with all of:

1. **The second sign-in is a fresh authentication inside the attempt**, never the
   reuse of a live cookie or bearer. A `signin`-purpose attempt has
   `original_session_id IS NULL` by CHECK, so `finalize()`'s
   `currentSessionId === a.originalSessionId` binding does not exist here and
   must be replaced. Without this, a signed-in session on a shared iPad attaches
   an attacker's subject with one tap and no victim action.
2. The confirmation names the provider **and the relay address**, because for
   Apple it is often an address the victim has never seen — the discriminating
   power is weakest exactly where permanence is worst.
3. The carried subject is bound to the attempt's five-minute expiry.
4. **PR1's unlink is the compensating control.** PR2 is blocked on PR1 for a
   security reason, not a sequencing one.
5. The You screen is the only detection channel; that is the accepted control.

### The conflict copy

`account_conflict` gains the recovery deletion makes possible: sign in to the
other account, delete it from You, then add this sign-in. Copy only, and it
cannot ship before deletion exists.

## Testing

- **The last-provider guard** gets a held-lock concurrency test, not a race.
- **The lock order** gets a held-lock test proving sessions-before-users does not
  deadlock against a concurrent `original()`.
- **The outbox claim** is tested for disjointness under two concurrent claimers.
- **The subject guard** is tested: a re-registered subject drops the row unrevoked.
- **Two grants produce two rows**, driven from a fixture with both client ids.
- **A failed delete transaction tells the rower** — this codebase's recorded
  systemic failure is a caller proceeding as though a failed write succeeded.
- **Revocation failure does not affect deletion.**
- **Claim limits.** The reauth leg is gated at the integration layer with a
  synthetic provider. That proves the flow, not that deletion works against real
  Apple.

## Out of scope

Account merge. One-way transfer. Any deactivate or grace-period state. An
email-us door. Email-based account discovery. Concept2 deauthorization (a row).
Fixing the two existing lockout paths (a row).

## Open questions for the next pass

1. Whether a *successful* revoke harms a re-registered account. Apple documents
   nothing across six pages searched. The subject guard now makes this moot in
   the common case; it remains unknown in the case where the guard's read races
   the re-registration.
2. Whether `/auth/revoke` is per-token or per-user — Apple contradicts itself.
   Designed for per-token.
3. Whether the reauth escape route, when a provider is unavailable, can be built
   without weakening the confirmation it replaces.

## What revision 1 got wrong

Recorded because the corrections are the durable part.

1. **"Deletion reuses the existing reauth stage"** — impossible under two CHECK
   constraints and refused twice more in code. Deletion needs a migration.
2. **"The tombstone is the only new stored shape"** — there are two.
3. **TN3194's "you must still fulfill"** — a conditional whose condition we do
   not meet, read as a general rule (RF16's third corollary), and quoted verbatim
   in a way that made it look verified. The conclusion survived on a different,
   better citation that revision 1 never found.
4. **"Apple requires revocation"** — Apple says *should*.
5. **"The tombstone is anonymous"** — false; it holds a credential exchangeable
   for identity. And the anonymity claim foreclosed the deterministic subject
   guard, trading a real mechanism for a false property.
6. **"Read the Apple grant"** — there are up to two, and boot refuses to start if
   they could collide.
7. **"A rower always retains at least one way back in"** — already false at HEAD
   in the repo's own boot warnings.
8. **The 5.1.1(v) paragraph** argued the wrong sentence; deletion is
   unconditional.
9. **Eleven cascading tables** was right but incomplete: a twelfth is reached
   through `sessions`, and it is the one holding a live Apple credential.
