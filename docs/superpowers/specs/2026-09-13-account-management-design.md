# Account management — delete, unlink, and following through to a link

## What and why

A rower can delete their Ergomatic account from inside the app, and can remove
a sign-in method they no longer want — both from the screen that already lists
their sign-in methods. Deleting is permanent and takes everything with it;
removing a method never leaves a rower locked out, because the last remaining
one cannot be removed. And when someone signs in with a provider we do not
recognise and tells us they already have an account, proving the other provider
now attaches the new one instead of throwing it away.

Three things drive this. Apple requires in-app account deletion of any app that
offers account creation, and requires Sign in with Apple tokens to be revoked
when an account goes. A link is currently **permanent** — no code path anywhere
nulls a subject column — so a mistake cannot be undone. And the duplicate-account
dead end has no recovery today, because the recovery is deletion and deletion
does not exist.

**Scope ruled by James, 2026-09-13:** duplicates are resolved by DELETION ONLY.
Account merge and one-way data transfer are both rejected and are not designed
here. PR1 is deletion, unlink and the conflict copy; PR2 is the link
follow-through, which is blocked on real Apple authorization proving
cross-surface subject continuity.

## The invariant

> A rower always retains at least one way back into their account, until they
> deliberately destroy the account itself.

Every decision below follows from that sentence. Unlink refuses to remove the
last remaining provider. Deletion is the only operation permitted to leave a
rower with no way in, and it is the one that asks hardest before proceeding.

## Research

### Apple's account-deletion requirement — PRIMARY

App Review 5.1.1(v), already sourced in `ROADMAP.md` and confirmed
unconditionally: _"If your app supports account creation, you must also offer
account deletion within the app."_ Four further constraints quoted there:
temporary deactivation is insufficient; the entire account record goes, not only
the PII; no phone/email/support-flow door; and findability in account settings
is a design input rather than a route that merely exists.

**The open question that row owed, answered here.** 5.1.1(v) opens _"If your app
doesn't include significant account-based features, let people use it without a
login."_ Ergomatic requires a login for everything, and nobody had argued the
sentence. It is argued now: the account carries the rower's training plan, their
session log and its derived career statistics, their 2k/6k baselines, their test
history, and their linked Concept2 account with stored OAuth credentials that
write to a third-party logbook on their behalf. Those are account-based features
in substance, not merely data we chose to keep server-side, and the Concept2 link
in particular cannot exist without an account to anchor it. The requirement to
offer deletion therefore applies and is not avoided by making the app usable
logged-out.

### Apple's revocation requirement — PRIMARY, TN3194

Read from Apple's documentation JSON on 2026-09-13
([TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)).
Three lines are load-bearing and are quoted verbatim because the argument
depends on their exact wording.

1. _"The Token revocation endpoint (`/auth/revoke`) is the only way to
   programmatically invalidate user tokens associated to your developer account
   without user interaction."_ — there is no alternative mechanism; if we want
   revocation without asking the rower to go to Apple's settings, this is it.

2. **The line that decides the whole failure design:** _"If you don't have the
   user's refresh token, access token, or authorization code, you must still
   fulfill the user's account deletion request and meet the account deletion
   requirement."_ Apple states plainly that deletion is NOT contingent on
   revocation. A design that blocked deletion on a failed revoke would be
   choosing, against Apple's own instruction, to fail the deletion requirement
   in order to satisfy the revocation one.

3. _"If the manual token revocation isn't completed, the next time the user
   authenticates with your client using Sign in with Apple, they won't be
   presented with the initial authorization flow to enter their full name, email
   address, or both. This is because the user credential state managed by Sign in
   with Apple remains unchanged and returns
   `ASAuthorizationAppleIDProvider.CredentialState.authorized`."_ — this is a
   product consequence, not only a compliance one. A rower who deletes and signs
   up again after a failed revocation gets **no name from Apple**, so
   `providers.ts` falls back to `"Rower"` and the account is named that
   permanently, because nothing in the product can rename it. That is the defect
   already on the register as "let a rower set their own display name", and
   incomplete revocation is a second, self-inflicted way to reach it.

**What TN3194 does NOT address, stated rather than assumed.** It does not say
what calling `/auth/revoke` does to the user's relationship with the app, and it
does not address signing in again after a revocation that DID complete. So the
hazard this design was worried about — a late revocation from a tombstone tearing
down a relationship a re-registered account now depends on — is **unverified in
either direction**. The bounded retry below is chosen because it limits the
window for a hazard we cannot currently rule out, not because we have established
the hazard is real. INFERENCE, and it is the first thing the hardening pass
should attack.

### What the codebase already provides — PRIMARY, this repo

- **A reauth stage exists and works.** The link flow re-proves the provider a
  rower already holds (`attempts.ts`, stages `reauth_authorize` /
  `reauth_exchanging`), with a five-minute freshness window enforced twice.
  Deletion reuses it rather than inventing a confirmation mechanism.
- **Apple grants are already stored for exactly this.** `apple_grants`
  `(user_id, client_id)` holds the refresh token, written in the same transaction
  as the subject column. Wave A's record names revocation as the following slice.
- **No unlink path exists.** Verified by grep across `app/server` and `app/src`:
  nothing nulls `apple_sub` or `google_sub`.
- **Eleven foreign keys cascade from `users`**, not eight. The ROADMAP row says
  eight; counted 2026-09-13 with
  `grep -c 'references(() => users.id, { onDelete: "cascade" })' app/server/db/schema.ts`.
  The row is corrected in the same PR.
- **`session_logs.workout_id`'s `onDelete: "set null"` is irrelevant to account
  deletion**, contrary to the ROADMAP row's framing. `session_logs.user_id`
  cascades from `users`, so on account deletion the log row is removed outright
  and the set-null never fires. It exists so deleting a single WORKOUT keeps its
  logs. Verified in `schema.ts` on 2026-09-13.

## Decisions

| Decision | Ruling | Who |
|---|---|---|
| Duplicate accounts | Deletion only; no merge, no transfer | James, 2026-09-13 |
| Confirmation strength | Graduated: reauth to delete, plain confirm to unlink or follow through | James, 2026-09-13 |
| Deletion vs revocation | Delete immediately; revoke afterwards, best effort | James, 2026-09-13, supported by TN3194 quote 2 |
| Revocation retry | Bounded window, then drop the tombstone and log loudly | James, 2026-09-13 |
| PR split | PR1 deletion + unlink + conflict copy; PR2 follow-through | James, 2026-09-13 |

## Design

### Surface

Deletion and unlink both live on You's existing SIGN-IN METHODS section. Apple
asks that deletion be easy to find and typically in account settings; this is
that screen, and it already lists exactly the things these operations act on.
The rendered layout is a Gate 0 and is not settled by this document.

### Unlink

One guarded statement, and the guard is the design:

```sql
UPDATE users SET apple_sub = NULL
 WHERE id = $1 AND apple_sub IS NOT NULL AND google_sub IS NOT NULL
```

The last-provider check lives in the `WHERE` clause rather than in a read-then-
write, so the database enforces the invariant and two tabs unlinking different
providers cannot both pass. Zero rows updated means the operation was refused,
and the refusal is reported as such rather than as a success.

Unlinking Apple also deletes its `apple_grants` row and attempts the same
revocation as deletion. Holding a live refresh token for a provider the rower
just detached is the inconsistency this avoids.

### Deletion

1. Reauth through the existing stage. Cancelled or failed reauth changes nothing.
2. One transaction: read the Apple grant, write the tombstone, delete the user.
   Eleven FKs cascade. Either all of it happens or none of it does.
3. Sign out and land on Welcome.
4. Separately and later: revoke against Apple, drop the tombstone on success.

**Deletion never awaits Apple.** TN3194 quote 2 is the authority.

### The tombstone

The only new stored shape, and deliberately anonymous: the refresh token, the
client id, an attempt count, and a deadline. No user id, no subject, no email —
nothing that identifies whose account it was. That is what lets it survive an
account deletion without contradicting Apple's "the entire account record" line,
and it is the property the DBA and hardening passes should check first.

Retries are bounded. At the deadline the row is dropped and the failure is
logged, because Apple's own instruction is that an unrevokable token does not
block deletion. The log line is the only record that revocation never happened.

### Following through to a link (PR2)

Today, "I already have an account" cancels the attempt and destroys the verified
subject and the Apple grant, so the same screen returns on every future sign-in —
a fresh chance to create a duplicate each time. PR2 carries the confirmed attempt
across the second provider's round trip and attaches the identity, behind a
confirmation naming both.

**This is a ninth stage in an eight-stage machine plus a new terminal
transition**, and it carries the Apple grant that deletion must later revoke. It
is TRIAD, it needs a lifetime table for every new ref and stage, and it needs a
full antagonist pass. It is blocked on real Apple authorization proving
cross-surface subject continuity: shipping it before that is proven would
permanently attach a surface-specific subject at the exact moment there is no
unlink to undo it.

**The security shape the antagonist must attack, recorded as INFERENCE.**
Explicit linking is initiated by the account holder and gated on re-proving the
provider they already hold, which an attacker with a stolen session cannot
supply. Follow-through proves the TARGET identity first and lets the rower's own
sign-in complete the link. That ordering is the identity-injection shape, and it
would convert a session-lifetime compromise into a permanent one, because
sessions expire and `apple_sub` does not. The confirmation is the mitigation
being proposed; whether it is sufficient is not this document's call.

### The conflict copy

`account_conflict` currently reads _"That Apple sign-in is already connected to
another Ergomatic account. Nothing changed."_ — accurate, and the one string a
rower can hit with no way forward. It gains the recovery deletion makes possible:
sign in to the other account, delete it from You, then add this sign-in. Copy
only, and it cannot ship before deletion exists.

## Testing

- **The last-provider guard gets a real concurrency test** in the style the link
  flow already uses: hold a conflicting transaction open on one connection while
  the other runs, rather than racing and hoping.
- **The tombstone's retry stops at its deadline**, asserted with an independent
  literal rather than the production constant.
- **A failed delete transaction tells the rower.** This codebase's recorded
  systemic failure is a caller proceeding as though a failed write succeeded; a
  rower who believes they deleted their account and did not is the worst version
  of it.
- **Revocation failure does not affect deletion.** One test deletes with the
  revoke endpoint failing and asserts the account is gone anyway.
- **Claim limits.** Deletion's reauth leg is gated at the integration layer with
  a synthetic provider, exactly as the link flow is. That proves the flow, not
  that deletion works against real Apple. The spec claims the narrower thing.

## Out of scope

Account merge. One-way data transfer. Any "deactivate" or grace-period state —
Apple rules it out by name. An email-us deletion door. Email-based account
discovery, which is not available even in principle: identity is by provider
subject, no query finds a user by email, and Apple private relay plus the
observed case of one account whose Apple ID and account email differ entirely
make email comparison actively misleading.

## Open questions for hardening

1. Whether a completed revocation harms a re-registered account. TN3194 does not
   say. The bounded retry limits exposure; it does not establish safety.
2. Whether the anonymous tombstone genuinely satisfies "the entire account
   record" or merely appears to.
3. Whether the follow-through ordering weakens the auth invariant — TRIAD, and
   the antagonist's to settle rather than the PM's or this author's.
