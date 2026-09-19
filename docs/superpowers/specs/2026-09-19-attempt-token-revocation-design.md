# Attempt token revocation — design

**Status:** draft for James's review. **Date:** 2026-09-19.
**Wave:** A. **Triad:** yes, twice — a stored credential's lifetime, and auth.
**Predecessor:** `2026-09-13-account-management-design.md`, whose
"The other two live credentials" section names this gap and leaves it open.

## What and why

When a rower signs in with Apple, Apple issues us a refresh token partway
through — before the rower has confirmed anything on our side. We park it on
the `auth_attempts` row. If the rower then finishes, we copy it to
`apple_grants` and it becomes the account's credential. If the rower does not
finish — closes the tab, times out, taps back, cancels — we delete the attempt
row and the token goes with it, still live at Apple.

The consequence is not a security hole; the token is only spendable with our
own client secret. It is that **Ergomatic stays listed in that rower's Apple ID
settings for a relationship they never completed**, and — the part that costs
them something — Apple will not show them the name-and-email consent screen
again. `providers.ts` then falls back to `"Rower"`, permanently, because nothing
in the product can rename an account.

Nine paths destroy an attempt row. Two are safe by construction, one is half
covered, and **six revoke nothing at all**. This design closes them, and does
it with a choke point rather than seven scattered calls, because the defect
that actually recurs here is a site nobody remembered.

## What is broken, measured

Every path that destroys an `auth_attempts` row, at `87511d77` — the eight
statements, plus the cascade that reaches rows no statement names.

**The line numbers below go stale the moment implementation edits this file,
so the table is a snapshot of what this command returns, not the authority:**

```
grep -n "DELETE FROM auth_attempts" app/server/auth/attempts.ts   # 8 at 87511d77
grep -n "onDelete" app/server/db/schema.ts | grep auth_attempts -A2
```

Re-run the first before trusting any row; the COUNT is the part the
enforcement test in §2 pins, and it is 8 today.

| # | Line | Site | Revokes? | Why |
|---|------|------|----------|-----|
| 1 | `attempts.ts:326` | signin accept | n/a | `grant()` at 323 copies the token to `apple_grants` first |
| 2 | `attempts.ts:333` | `sweep()` TTL expiry | **no** | no rower, no request |
| 3 | `attempts.ts:352` | `begin()` signin pre-sweep | **no** | expired rows, any may hold a token |
| 4 | `attempts.ts:387` | `begin()` link/delete session sweep | **no** | deletes any attempt on the session |
| 5 | `attempts.ts:393` | `begin()` `replace` | **no** | the rower's own prior attempt |
| 6 | `attempts.ts:706` | link accept | n/a | `grant()` at 705 copies the token first |
| 7 | `attempts.ts:715` | `discard()` | **no** | callback failure cleanup |
| 8 | `attempts.ts:738` | `cancel()` | **no** | explicit holder cancel |
| 9 | cascade | `DELETE FROM users` → `sessions` → `auth_attempts` | **partly** | `attempts.ts:888` pushes *the deleting attempt's* token; a **sibling** attempt on another session cascades away unrevoked |

`schema.ts:737` is what makes row 9 true: `original_session_id` references
`sessions.id` with `onDelete: "cascade"`.

So: **six leaking statements plus one leaking cascade, and one site covered.**

**The ROADMAP row that opened this work is out of date and its fix is already
shipped.** It proposes "revoke held attempt tokens inside `deleteAccount`'s
transaction, the same shape `apple_grants` already uses there" — that is
`attempts.ts:884-892` and it landed with the account-management work. The row's
real remaining content is rows 2-5, 7, 8 and the sibling half of 9. The row is
corrected in the same PR as this spec.

## The hazard that shapes the design — NEW, and it inverts the obvious fix

**Revoking every attempt token is wrong, and would destroy live relationships.**

`grant()` (`attempts.ts:287-292`) writes with
`ON CONFLICT(user_id,client_id) DO UPDATE SET refresh_token=excluded.refresh_token`.
So a rower who already holds an Apple grant and then starts *any* new Apple
attempt on the same client — a delete confirmation, a re-link, a fresh sign-in
on the same surface — ends up with **two tokens issued against one Apple
authorization**: the live one in `apple_grants`, and the attempt's own.

If that rower cancels, the naive fix revokes the attempt's token. Whether that
also kills the grant depends on something **Apple does not state consistently**:

- The revoke endpoint's abstract is plural — "Invalidate the tokens and
  associated user authorizations".
- Its `token` field is singular — "The user session associated with the token
  provided is revoked".

The predecessor spec already flagged this ambiguity and chose the narrow
reading for `revokeApple()`'s call shape. **It did not face the case where the
narrow reading being wrong would destroy a credential we intend to keep**,
because on the deletion path the account is going away anyway. Here it is not.

**We do not need Apple to answer.** The invariant is derivable from our own
data: revoke an attempt's token only when the rower holds **no live
`apple_grants` row for that `(user_id, client_id)`**. If a grant exists, the
authorization is legitimately live — Ergomatic *should* be listed in their Apple
ID settings — and we leave it alone. This is fail-safe under either reading of
Apple's wording, which is the property that matters.

Attempts with no `original_session_id` (a signin that never bound to a session)
have no user to check against, so they carry no such risk and are always
revoked.

## The design

### 1. One choke point

A single helper owns every deletion of an `auth_attempts` row:

```
async function dropAttempts(
  q: pg.Pool | pg.PoolClient,
  where: string,
  params: unknown[],
): Promise<AppleGrant[]>
```

`pg.Pool | pg.PoolClient` because the sites are split: `sweep()`, `discard()`
and `cancel()` run on `pool` directly, while the rest run inside a
`transaction()` callback on a `pg.PoolClient`. Both expose `query`, so the
union is enough and no new abstraction is needed.

Every name in that signature was checked to exist rather than assumed:
`attempts.ts:2` is `import type pg from "pg"` (type-only, which is all this
annotation needs), and `AppleGrant` is exported from
`appleRevoke.ts:3`. It is a signature sketch, not prescribed
implementation — the plan owns the real block and its paste-test.

It runs `DELETE FROM auth_attempts WHERE <where> RETURNING apple_client_id,
apple_refresh_token, original_session_id`, and returns the credentials that
are (a) non-null on both fields and (b) not backed by a live grant, per the
invariant above. Every one of the eight statement sites calls it. Callers
collect the returned credentials and pass them to `revokeApple()` **after**
their transaction commits.

Sites 1 and 6 will return an empty list in practice, because `grant()` has
already promoted the token — but they go through the helper anyway, so the rule
is "all of them" rather than "the ones we judged risky".

### 2. Enforcement, so site nine cannot be forgotten

The choke point is only real if nothing bypasses it. A unit test asserts that
the literal `DELETE FROM auth_attempts` appears in `attempts.ts` **exactly
once**, inside `dropAttempts`. It goes red the moment anyone writes a ninth raw
statement.

This is the gate the whole design rests on, so per RF21 it ships with a
mutation that makes it fail — add a raw `DELETE FROM auth_attempts` elsewhere in
the file and the test must go red — and the plan records what the failure said.

### 3. Failure posture, per path

Best-effort everywhere, after the commit, exactly as `unlink` and
`deleteAccount` already do. The ordering reason is the predecessor spec's and is
unchanged: our write can roll back, Apple's cannot, so the external call must
follow the commit or a failed commit leaves a credential destroyed at Apple for
an account that still exists.

What differs per path is only **who is told**:

| Path | Told? |
|---|---|
| `deleteAccount`, including siblings | yes — the existing `appleRevoked` boolean and `SignIn.tsx:39`'s notice, unchanged |
| everything else | log only — `apple_revoke_failed` / `apple_revoke_threw` |

**Why log-only is honest for the other six, and not a shrug.** Apple's duty is
"should", not must; a rower who abandons a sign-up and keeps using Ergomatic is
*correctly* listed in their Apple ID settings anyway under the invariant above;
and for the cases where they are not, Apple's own documented remedy is for the
rower to remove it in Apple ID settings, which they can do at any time without
being told by us. The one path where the state is both wrong and terminal —
deletion — already has the notice.

### 4. `deleteAccount` gets simpler, not more complex

The sibling-attempt gap closes by sweeping every attempt on every session of the
user through `dropAttempts`, before `DELETE FROM users`, instead of pushing one
attempt's credential by hand at line 888. The special case then goes away: the
deleting attempt is itself an attempt on one of those sessions.

**This is the one part of the design carrying real risk, and it is an open
question rather than a decision — see below.** `deleteAccount` carries a
lock-order comment bought with a measured deadlock, and adding a statement
inside that transaction is exactly the kind of change it warns about.

## Stored shape

**None.** No migration, no new table, no column, no changed jsonb key set. The
`apple_revocations` outbox is **not** being revived; James withdrew it on
2026-09-13 and the reasoning in "Revocation is synchronous and best effort"
still holds. This design adds durability nowhere — it adds *coverage*, which is
what was actually missing.

This matters for the gates: the DBA's stored-shape override does not fire. The
DBA still runs, because `deleteAccount`'s transaction changes shape and its lock
behaviour is the open question below.

## Testing

- **Unit, per site:** each of the eight statement sites, with an attempt carrying a
  token, asserting the credential reaches the revoker — and with a live grant
  present, asserting it does **not**.
- **The choke-point census test** above, with its biting mutation.
- **Integration (real Postgres):** the sibling-attempt case — two sessions, an
  attempt with a token on the second, delete through the first, assert the
  second's credential reached the revoker before the cascade could eat it.
  Per RF24 this test must start **upstream** of the producer: it creates the
  sibling attempt through `begin()`, not by inserting a row.
- **A failed revoke never fails the operation** — inject a rejecting revoker on
  each path and assert the outcome is unchanged.

## Out of scope, said aloud

- **The outbox / any retry.** Withdrawn 2026-09-13, not revisited.
- **The re-registration race** (predecessor's Open Question 1). Unchanged by
  this work; still narrowed-not-closed.
- **Renaming an account.** This is what actually makes the defect permanent, and
  it is filed as its own ROADMAP row in this PR rather than smuggled in here.

## Open questions

1. **Does adding a `DELETE FROM auth_attempts` inside `deleteAccount`'s
   transaction change its lock behaviour?** `auth_attempts` is a child of
   `sessions`, which the transaction already holds `FOR UPDATE` in a
   deterministic order — so the expectation is no new cycle, but that is
   INFERENCE and the existing comment exists because a real deadlock was
   measured here once. **The DBA gate must measure this, not reason about it.**
   If it does deadlock, the fallback is to keep line 888's hand-push and revoke
   siblings in a separate transaction before the delete.
2. **Does Apple's revoke endpoint invalidate one token or the whole
   authorization?** Unresolved and probably unresolvable from docs. The design
   is built to be correct either way, which is why this is a question and not a
   blocker — but if it is ever answered, the live-grant check could be
   relaxed.
3. **How long does an unrevoked Apple refresh token stay live?** The
   predecessor spec says "permanently"; I found no citation and am not
   asserting it. It bounds how bad the leak is, so it is worth one search
   before implementation.

## What this does not claim

It does not claim we never hold a credential for a relationship the rower
ended. Best-effort with no retry cannot support that sentence, and only the
withdrawn outbox could. The claim is narrower and true: **every path that
destroys an attempt now attempts revocation, exactly one place decides how, and
a test fails if a ninth path appears.**
