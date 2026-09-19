# Attempt token revocation — design

**Status:** revision 2, draft for James's review. **Date:** 2026-09-19.
**Wave:** A. **Triad:** yes, twice — a stored credential's lifetime, and auth.
**Predecessor:** `2026-09-13-account-management-design.md`, whose
"The other two live credentials" section names this gap and leaves it open.

**Revision 2 folds the antagonist's TRIAD pass on revision 1 (`4bee1d6d`),
which returned NOT CLEAN with four blocking findings.** Two were kill shots:
the census counted statements when the thing that destroys these rows is a
cascade from another table, and the invariant was keyed on an identity that
answers a different question. Both changed the design, not its wording. Each
fold is marked **[A1]**…**[A8]** so a reader can see what revision 1 got
wrong without reading it.

## What and why

When a rower signs in with Apple, Apple issues us a refresh token partway
through — before the rower has confirmed anything on our side. We park it on
the `auth_attempts` row. If the rower then finishes, we copy it to
`apple_grants` and it becomes the account's credential. If the rower does not
finish — closes the tab, times out, taps back, cancels, **or simply signs
out** — we destroy the attempt row and the token goes with it, still live at
Apple.

The consequence is not a security hole; the token is only spendable with our
own client secret. It is that **Ergomatic stays listed in that rower's Apple
ID settings for a relationship they never completed**, and — the part that
costs them something — Apple will not show them the name-and-email consent
screen again. `providers.ts` then falls back to `"Rower"`, permanently,
because nothing in the product can rename an account. That permanence is the
whole severity, and it is filed separately as "Let a rower rename their
account".

Eleven paths destroy an attempt row. Two are safe by construction, one is
half covered, and **eight revoke nothing at all**.

## What is broken — a PRODUCER census, not a statement census **[A1]**

**Revision 1 enumerated the eight `DELETE FROM auth_attempts` statements and
called the job done. That was the wrong unit.**
`auth_attempts.original_session_id` is `ON DELETE cascade` on `sessions`
(`app/drizzle/0031_apple_front_door.sql:41`), so **every deletion of a
session destroys that session's bound attempts** — from another file, through
a different API, with no `auth_attempts` statement in sight.

Reproduce the census. The line numbers below go stale the moment
implementation edits these files, so these commands are the authority and the
table is a snapshot:

```
grep -n "DELETE FROM auth_attempts" app/server/auth/attempts.ts  # 8 at 87511d77
grep -rn "delete(sessions)" app/server                           # 2 at 87511d77
grep -n "original_session_id" app/drizzle/0031_apple_front_door.sql
```

| # | Site | Revokes? | Why |
|---|------|----------|-----|
| 1 | `attempts.ts:326` signin accept | n/a | `grant()` at 323 promotes the token first, same transaction |
| 2 | `attempts.ts:333` `sweep()` TTL | **no** | no rower, no request |
| 3 | `attempts.ts:352` `begin()` signin pre-sweep | **no** | expired rows, any may hold a token |
| 4 | `attempts.ts:387` `begin()` session sweep | **no** | deletes any attempt on the session |
| 5 | `attempts.ts:393` `begin()` `replace` | **no** | the rower's own prior attempt |
| 6 | `attempts.ts:706` link accept | n/a | `grant()` at 705 promotes the token first |
| 7 | `attempts.ts:715` `discard()` | **no** | callback failure cleanup |
| 8 | `attempts.ts:738` `cancel()` | **no** | explicit holder cancel |
| 9 | `attempts.ts:893` `DELETE FROM users` → sessions → attempts | **partly** | `:888` pushes *the deleting attempt's* token; a **sibling** on another session cascades unrevoked |
| 10 | **`sessions.ts:74` `deleteSession`** → cascade | **no** | **sign-out**, `routes.ts:169-175`, `POST /api/auth/signout` |
| 11 | **`sessions.ts:78` `sweepExpired`** → cascade | **no** | **every 60 s**, `frontDoor.ts:84-86` `setInterval`, plus boot |

**Rows 10 and 11 are the finding.** A link or signin follow-through sits at
`link_ready` holding `apple_refresh_token`, bound to the rower's current
session, for up to `ttl` (`attempts.ts:55`). The rower taps Sign out. The
token is gone and unrevoked — and this is exactly the case where revocation is
unambiguously correct, because `begin()` refuses a link unless
`users.apple_sub` is NULL (`attempts.ts:378`), so no grant can exist.

**The ROADMAP row that opened this work proposed a fix that already shipped.**
"Revoke held attempt tokens inside `deleteAccount`'s transaction" is
`attempts.ts:884-892`. The row is corrected in the same PR as this spec.

## The hazard that shapes the design

**Revoking every attempt token is wrong, and would destroy live
relationships.**

`grant()` (`attempts.ts:287-292`) upserts with
`ON CONFLICT(user_id,client_id) DO UPDATE SET refresh_token=excluded.refresh_token`,
so a rower can hold a live `apple_grants` row *and* an attempt token at once.
If both back one Apple authorization, revoking the attempt's token may kill
the grant.

**The one producer that reaches this state [A2]** — revision 1 named three
and two were wrong. `begin({purpose:'delete', targetProvider:'apple'})`
requires `users.apple_sub` NOT NULL (`attempts.ts:381-385`), so the rower
already holds a grant; `providers.ts:222-226` sets `identity.grant` on every
Apple exchange; `accept()` assigns it (`:560-562`) and saves to `delete_ready`
(`:625-632`). Cancel or expiry then meets two live tokens on one
`(user_id, client_id)`. **The delete confirmation is the producer.** A fresh
sign-in is not (`finishSignin` grants and deletes in one transaction); a
re-link is not (`begin()` refuses at `:378`, and `unlink` deletes every grant
in the transaction that nulls `apple_sub`).

Apple will not settle whether revoke is per-token or per-authorization. All
three sentences below were verified against the live DocC JSON for
`revoke-tokens` on 2026-09-19, not carried over from the predecessor:

- Abstract, plural: *"Invalidate the tokens and associated user
  authorizations for a user when they are no longer associated with your
  app."*
- `token` parameter, singular: *"The user refresh token or access token
  intended to be revoked. The user session associated with the token provided
  is revoked if the request is successful."*
- **Discussion, which neither spec quoted and which tilts it [A3]:** *"In
  order to revoke authorization for a user, you must obtain a valid refresh
  token or access token."* The endpoint describes its own purpose as revoking
  **authorization for a user**, with the token as the means — the broad
  reading.

So the design must be correct under the broad reading.

## The invariant, keyed on the SUBJECT **[A4]**

**Revision 1 keyed this on `(user_id, client_id)`, which is the wrong
identity in both directions.** The question is "does this token back a
relationship the rower is keeping?", and what answers it is the Apple
**subject**, not the account-and-client pair a grant happens to be filed
under.

- **It suppressed revokes it should allow.** An account with `apple_sub = X`
  holds a grant on the web client. The rower signs in with a *second* Apple
  ID, sub Y; `accept()` saves Y's token at `confirm`; `followThrough()`
  reauths with Google and never consults `apple_sub`; `finalize()` refuses
  with `account_conflict`. On cancel a grant exists for that
  `(user_id, client_id)` — **X's** — so revision 1 skipped the revoke and
  **Y's token leaked permanently**.
- **It allowed revokes it should suppress.** Revision 1 said attempts with no
  `original_session_id` have "no user to check against, so they carry no such
  risk and are always revoked". **That is false.** Every stage such a row can
  occupy while holding a token — `confirm`, `reauth_authorize`,
  `reauth_exchanging` — is one where `consistent()` (`attempts.ts:102-105`)
  *requires* `verified_subject`. The subject is always on the row. And the
  reason no user existed when the row was minted stops being true the moment
  a concurrent attempt completes: two tabs, A abandoned at `confirm`, B
  completes and creates the account; `sweep()` destroys A and "always revoke"
  destroys B's brand-new credential under the broad reading. **Revision 1's
  own headline harm, arriving through the rule it exempted.**

**The rule:**

| Row class | Decide by |
|---|---|
| `verified_subject` present (signin and link rows) | revoke **unless** `SELECT 1 FROM users WHERE apple_sub = verified_subject` finds a row **and** that user holds an `apple_grants` row for the attempt's `apple_client_id` |
| `purpose='delete'` (`verified_subject` legitimately NULL) | revoke **unless** a grant exists for (`original_session_id`'s user, `apple_client_id`) |

`delete` rows are the one class where the container identity is right, because
`accept()`'s reauth branch (`attempts.ts:617-620`) has already proved
`identity.sub` is that account's own `apple_sub`. `users.apple_sub` carries a
unique index (`schema.ts:28`, `users_apple_sub_unique`), so the lookup is a
single index probe.

### The read is not safe outside a transaction **[A5]**

`attempts.ts:859-866` already documents why, for this exact table: `grant()`'s
`ON CONFLICT DO UPDATE` leaves the FK column unchanged, so Postgres runs no RI
check and takes **no lock on the parent** — a plain read can be stale. Three
sites (`sweep`, `discard`, `cancel`) run on `pool` with no transaction at all,
so their check has no snapshot relationship to their own delete. The direction
that bites: check says "no grant" → we revoke → a concurrent `grant()` commits
→ the broad reading destroys it.

**Decision: the check and the delete happen in ONE transaction at every
site.** `sweep()`, `discard()` and `cancel()` gain a transaction they do not
have today. That is the cost of the invariant being true rather than usually
true, and its price is the DBA's to measure.

## The design

### 1. Two collectors, because there are two tables **[A1]**

A choke point in `attempts.ts` cannot see rows 10 and 11 — those are
`sessions.ts` deleting through drizzle's builder. So the invariant is owned
per table:

```
// attempts.ts
async function dropAttempts(
  q: pg.PoolClient,
  where: string,
  params: unknown[],
): Promise<{ rowCount: number; credentials: AppleGrant[] }>
```

**It returns the row count, not just credentials [A6].** `discard()`
(`attempts.ts:713-735`) returns `result.rowCount === 1`, and that boolean is
load-bearing at `frontDoorRoutes.ts:375`, `:432` and `:483` — an empty
credential array cannot distinguish "matched nothing" from "matched, held no
credential". Revision 1's signature would have broken that flow silently.

`sessions.ts` gets the mirror: before deleting sessions, collect the
credentials of the attempts about to cascade, by the same rule, in the same
transaction. `createSessionStore` takes an injected `RevokeApple` the way
`createAttempts` already does.

Names checked rather than assumed: `attempts.ts:2` is
`import type pg from "pg"`, and `AppleGrant` is exported from
`appleRevoke.ts:3`.

### 2. Enforcement, honestly scoped **[A7]**

Revision 1 called a "this literal appears exactly once" test *"the gate the
whole design rests on"*. **The antagonist defeated it five ways in one probe**
— the drizzle builder, lowercase, `public."quoted"`, a composed identifier,
and a template literal wrapping after `DELETE` — each leaving the count at 8.
It can also go red spuriously, because a source-text count counts SQL quoted
in comments, which this file does constantly.

Per RF26 the strongest conclusion it supports is: *no second occurrence of
that exact byte sequence exists in this file's source text.* It stays as a
**cheap spelling pin**, is described as one, and carries nothing.

What carries the weight is a **per-producer test** — one per row of the
census, each starting upstream of the producer (RF24) and asserting the
credential reached the revoker. **Said plainly: no automated gate proves the
census is complete.** A twelfth producer is caught by review and by the census
commands above. Claiming otherwise is what revision 1 did.

### 3. Failure posture

Best-effort everywhere, after the commit, as `unlink` and `deleteAccount`
already do. The ordering reason is the predecessor's and is unchanged: our
write can roll back, Apple's cannot.

| Path | Told? |
|---|---|
| `deleteAccount`, including siblings | yes — the existing `appleRevoked` boolean and `SignIn.tsx:39`'s notice, unchanged |
| everything else | log only — `apple_revoke_failed` / `apple_revoke_threw` |

Log-only is honest for the rest: Apple's duty is "should", not must; the rower
can remove us in Apple ID settings at any time, which is Apple's own
prescribed remedy; and the one path where the state is both wrong and terminal
already has the notice.

**Two outbound-HTTP-on-a-timer concerns the plan must settle [A8].** `sweep()`
sets `healthy`, and `begin()` refuses every signin when it is false
(`attempts.ts:329-341`), so **a revoke failure must never flip `healthy`** —
only a database failure may. And both 60-second sweeps can now produce many
revoke calls at once, so they fire without being awaited, bounded by
`revokeApple`'s existing 3 s per-call timeout; the timer is never blocked.

### 4. `deleteAccount`

The sibling gap closes by sweeping every attempt on every session of the user
through `dropAttempts` before `DELETE FROM users`, replacing the hand-push at
`:888`. See Open Question 1 — this is the one part carrying real risk.

## Stored shape

**None.** No migration, no column, no index, no changed jsonb key set. The
`apple_revocations` outbox is **not** revived; James withdrew it on
2026-09-13 and that reasoning holds. This design adds coverage, not
durability. The DBA's stored-shape override does not fire; the DBA still runs,
because three sites gain a transaction and `deleteAccount` changes shape.

## Testing

- **Per producer** — one test per census row, starting upstream of it (RF24).
  Rows 10 and 11 enter through `POST /api/auth/signout` and through the sweep,
  never by inserting rows.
- **Both invariant directions** — the two-Apple-subjects sequence must revoke;
  the delete-confirmation double-token case must not.
- **Concurrency held, not raced** (RF21): hold a conflicting row in an open
  transaction on one connection while the other runs, and verify the pool has
  ≥ 2 connections. `attempts.integration.test.ts` already carries
  `waitForLock()` and `makeAttempts(revoke)` for exactly this.
- **A failed revoke never fails the operation**, on every path.
- **The spelling pin**, with its stated narrow conclusion.

## Out of scope, said aloud

The outbox and any retry (withdrawn 2026-09-13). The re-registration race
(predecessor's Open Question 1). Renaming an account — filed as its own
ROADMAP row in this PR, and it is what makes this defect permanent.

## Open questions

1. **Does the sibling sweep inside `deleteAccount` deadlock? [A8]** Revision 1
   asked whether the statement adds new locks. It does not — `DELETE FROM
   users` already cascades to these rows in this transaction. What changes is
   their **position and scan order**. The shape to measure is two multi-row
   `DELETE`s over an overlapping row set in different index orders: the
   sibling sweep on `auth_attempts_link_session_unique` (session order) versus
   `sweep()`'s on `auth_attempts_expires_at_idx` (expiry order), on a 60 s
   timer. **The DBA measures this. It is not settled by reasoning, because
   reasoning lost here once already.**
   **The fallback carries a cost revision 1 did not state:** "revoke siblings
   in a separate transaction first" commits a destructive change — rows
   destroyed, tokens revoked at Apple — in anticipation of a deletion that can
   still fail on `attempt_expired` or `account_changed`, leaving a rower whose
   deletion failed with an in-flight link silently destroyed on another
   device. If the measurement goes badly, prefer one transaction sweeping
   siblings by the same index the cascade uses.
2. **Per-token or per-authorization?** Unresolvable from Apple's docs, which
   contradict themselves. The design is built for the broad reading.
3. **Refresh-token lifetime: NOTHING FOUND, and that is the result [A3].**
   Apple's REST API documentation states no refresh-token lifetime —
   `revoke-tokens` and `generate-and-validate-tokens` both fetched as DocC
   JSON on 2026-09-19, neither mentions expiry. Only developer-forum threads
   claim "no time-based expiry", with no Apple-staff sentence extractable.
   **"Permanently" is uncitable and this spec does not assert it.**
4. **`dropAttempts` takes a raw SQL fragment.** Every caller passes a literal,
   so this is shape risk rather than a defect — but a choke point whose safety
   depends on callers never interpolating is weaker than a typed predicate,
   and neither the spelling pin nor review sees interpolation reliably. The
   plan should prefer a small typed predicate union if it costs little.

## What this does not claim

Not that we never hold a credential for a relationship the rower ended —
best-effort with no retry cannot support that, and only the withdrawn outbox
could.

Not that a test fails if a twelfth producer appears — the spelling pin cannot
see another file, another API, or another spelling, and revision 1 claimed
otherwise.

**What it does claim:** every producer in the census attempts revocation; the
decision to revoke is made in one place per table, from the subject that
actually answers the question, inside the transaction that does the deleting;
and each producer has a test that starts upstream of it.
