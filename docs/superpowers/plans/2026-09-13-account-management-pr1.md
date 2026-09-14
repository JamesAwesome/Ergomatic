# Account management PR1 — delete, unlink, conflict copy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower can permanently delete their Ergomatic account from inside the
app, and can remove a sign-in method they no longer want — with the database
itself refusing to leave an account with zero providers.

**Architecture:** Deletion reuses the existing `auth_attempts` state machine
through a new `delete` purpose, so re-proving a provider before destruction goes
through the same audited path as linking. The destructive transaction locks
sessions before users, matching the lock order `attempts.ts` already documents,
because the reverse order deadlocks and the auth transaction is the victim.
Apple's revoke is called **inline, after that transaction commits** — never
before it, and never queued.

**Tech Stack:** Postgres 18 + Drizzle migrations, Express 5, node-postgres
(raw SQL in `server/auth/`, Drizzle elsewhere), React 19, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-13-account-management-design.md`
revision 2. Read it before Task 1 — this plan argues from it and does not
restate its research. **Three of its rulings were superseded by James on
2026-09-13; they are listed under "Rulings that supersede the spec" below and
the spec is amended in Task 5.**

## Global Constraints

- **Copy says "the monitor", never "PM5"**, unless the device's own advertised
  name is doing a job (RF32). No em-dashes in user-facing strings.
- **The invariant, verbatim from the spec:** "No operation in this design ever
  leaves an account with zero provider subjects, except deletion, which removes
  the account entirely."
- **The last-provider guard lives in the `WHERE` clause**, never a read-then-write.
- **Lock order is sessions before users**, in every transition, without exception.
- **Deletion's own write failing is fatal and surfaced. Apple not answering is
  not.** See "One owner of the invariant" below — this is the repo's recorded
  systemic defect (RF25) and the plan names the owner explicitly.
- **Platform conditionals live only in the adapter layer** (`src/platform.ts`,
  `src/api.ts`, `src/native/`, `src/adapters/`) — lint-enforced.
- **Server imports use `.js` extensions.** ESM only. pnpm only.
- Run gates from `app/`. `pnpm test --project integration` needs Docker;
  **`pnpm exec vitest --project integration` hangs — do not use it.**
- 44px hit targets and WCAG AA are hard requirements, contrast stated as a number.

---

## Rulings that supersede the spec (James, 2026-09-13)

The spec's §"`apple_revocations` — a transactional outbox" and its lifetime
table are **withdrawn**. Three rulings replace them. Task 5 amends the spec so
the record does not contradict the code.

**1. Revocation is synchronous and best effort. There is no outbox.**
The spec's queue bought retry, and retry's only payload is the TN3194
consequence: a rower who deletes and later re-registers gets no name from Apple
and is `"Rower"` forever. **The spec itself records that defect as already on
the register, reachable another way** — so the machinery was lowering the odds
of hitting an already-accepted bug. Apple's duty here is **should**, not must;
the spec establishes that and it is the licence. Deleted with the queue: the
`apple_revocations` table, its migration, the sweep arm, the retry cap, the
backoff ladder, `FOR UPDATE SKIP LOCKED`, and the re-registration subject guard.

**The guard goes because the queue created the hazard it existed to solve.** A
re-registration race is only reachable while a row waits hours to be drained.
Revoking within a second of deletion closes the window, which also removes the
retained `apple_sub` and the paragraph justifying retaining it. **PR1 therefore
carries ONE stored shape, not two** — the `auth_attempts` purpose — which is
what the DBA gate now covers.

**2. A failed revoke never fails the deletion, and the ordering is why.**
To fail the operation you would have to call Apple before committing. Then a
commit that fails after a successful revoke leaves the credential destroyed at
Apple while the account still exists, and **no transaction can un-revoke a
token**. That asymmetry — our write rolls back, Apple's does not — is the whole
reason to keep the external call after the commit. It also inverts Apple's own
priorities: deletion is unconditional under 5.1.1(v), revocation is a *should*,
so letting an Apple outage block a deletion defeats the requirement being
served.

**3. A failed revoke tells the rower, and tells them Apple's own remedy.**
TN3194's fallback for the case where you cannot revoke is verbatim: *"Direct the
user to manually revoke access for your client."* The spec criticises revision 1
for substituting a log line for that step. So the delete response carries
`appleRevoked: boolean` and Welcome renders a one-time notice when it is false.
One boolean and one sentence, discharging a documented instruction.

**Not a scale compromise.** An earlier draft of this plan said the outbox should
return once there is more than one container. **That was wrong.** A delete
request is handled end to end inside one process, so nothing is shared and
nothing needs coordinating; the outbox is what *creates* the multi-container
problem `SKIP LOCKED` then solves. Two concurrent deletes cannot double-revoke
either — `FOR UPDATE` on sessions then users makes the second one find the
account gone and throw `account_changed` — and Apple's 200 covers "revoked
successfully **or was previously invalid**" regardless. The trigger for an
outbox is not container count and not load (deletion is rare per user); it would
only be a decision that the revoke must be *guaranteed*, which Apple does not
ask for.

## One owner of the invariant (RF25)

The repo's recorded systemic defect is a caller proceeding as though a failed
write succeeded. This plan names the owner once, and every task inherits it:

| Step | On failure |
|---|---|
| The delete transaction | **Fatal.** Roll back, surface it, the rower is told the account was NOT deleted and stays signed in. |
| Apple's revoke, after commit | **Not fatal.** The account is already gone and cannot come back. Log it, set `appleRevoked: false`, show the rower Apple's own remedy. |
| The unlink `UPDATE` | **Fatal** only in the sense that zero rows is an outcome, not an error — and the three causes get three different messages. |

There is no third behaviour anywhere in this PR. A reviewer who finds one has
found a bug.

---

## What was measured while writing this plan

Everything below was run against Postgres 18.4 with this repo's migrations
applied (2026-09-13). Quoted outputs are real.

| Claim | Result |
|---|---|
| The Task 1 migration applies | 4 × `ALTER TABLE`, no error |
| `delete` purpose, `existing_provider = target_provider`, non-null session | **admitted** |
| `delete` purpose with `original_session_id IS NULL` | refused by `auth_attempts_session_check` |
| **stage `delete_ready`** | **refused by `auth_attempts_stage_check` — see the spec correction below** |
| A second attempt on one session | refused by `auth_attempts_link_session_unique` |
| Unlink guard, two-provider account | `UPDATE 1` |
| Unlink guard, last provider / already unlinked / no such account | `UPDATE 0`, `UPDATE 0`, `UPDATE 0` |
| The `FROM users old` self-join returning the pre-update subject | returns `a-1` with `UPDATE 1`; 0 rows and the subject intact on a last-provider account |
| Tables losing rows on account deletion | **12** — 11 cascade from `users`, `auth_attempts` via `sessions` (catalog query, not a grep) |
| Users-before-sessions vs `original()` | **deadlock, auth transaction is the victim** — `"Process 184 waits for ShareLock on transaction 796; blocked by process 177"` |
| Sessions-before-users vs `original()` | no deadlock; `original()` returns 0 rows and commits |

### Spec correction this plan carries

**The spec counts two CHECK constraints and there are three.** §"Two stored
shapes" widens `auth_attempts_purpose_check` and `auth_attempts_session_check`.
Measured: inserting a row with `stage='delete_ready'` is refused by
`auth_attempts_stage_check`, which the spec never mentions. Task 1 widens all
three. This does not add a stored shape — it is the same `auth_attempts` shape —
but a plan that widened two of three would fail at the first integration test.

---

## File Structure

**Server — created**

- `app/drizzle/0032_account_delete_purpose.sql` — the migration. Generated by
  `drizzle-kit`, then hand-checked against Task 1's expected DDL.
- `app/server/auth/appleRevoke.ts` — one responsibility: turn a list of Apple
  grants into revoke calls. ~30 lines. Injected into `createAttempts` so
  `attempts.ts` needs neither `jose` nor `fetch`, and tests need no network.
- `app/server/auth/accountRoutes.ts` — the authenticated route that is not part
  of the attempt state machine (`DELETE /api/auth/methods/:provider`). Kept out
  of `frontDoorRoutes.ts`, which is already 402 lines and owns the attempt
  lifecycle.
- `app/server/auth/accountRoutes.integration.test.ts`

**Server — modified**

- `app/server/db/schema.ts` — the `authAttempts` purpose and stage unions.
- `app/server/auth/attempts.ts` — the `delete` branch in `begin()` and
  `accept()`; `deleteAccount()`; `unlink()`.
- `app/server/auth/frontDoorRoutes.ts` — the `delete` action alongside
  confirm/finalize/cancel; mount `accountRoutes`.
- `app/server/auth/frontDoor.ts` — build the real revoker from config and pass
  it to `createAttempts`.
- `app/shared/auth.ts` — `AuthPurpose` gains `"delete"`; `UnlinkOutcome` and
  `DeleteOutcome` are declared here because both sides parse them.

**Client — modified**

- `app/src/adapters/authFlow.ts` — `startDelete`, `confirmDelete`, `removeMethod`.
- `app/src/you/SignInMethods.tsx` — Remove per connected method, the three
  zero-row messages, the Delete account entry point.
- `app/src/you/DeleteAccount.tsx` — created. The confirm screen.
- `app/src/SignIn.tsx` — the `account_conflict` recovery copy, and the one-time
  Apple-settings notice when `appleRevoked` is false.

---

## Task 1: The migration and the schema

**Files:**
- Create: `app/drizzle/0032_account_delete_purpose.sql`
- Modify: `app/server/db/schema.ts`, `app/shared/auth.ts`
- Test: `app/server/db/schema.integration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AuthPurpose = "signin" | "link" | "delete"` in `shared/auth.ts`;
  the `Stage` union in `attempts.ts` gains `"delete_ready"`. Every later task
  depends on this migration being applied.

**This task carries the DBA gate.** It is TRIAD work — a stored shape. Do not
start Task 2 until the DBA has returned a verdict on its measured numbers.

- [ ] **Step 1: Write the failing test**

Add to `app/server/db/schema.integration.test.ts`:

```ts
it("admits a delete-purpose attempt that re-proves a provider the rower holds", async () => {
  const user = await seedUser({ googleSub: "g-1", appleSub: "a-1" });
  const session = await seedSession(user.id);
  await pool.query(
    `INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,expires_at)
     VALUES('bh','native','delete','apple','apple','reauth_authorize',1,'s1','n1',$1,now()+interval '5 min')`,
    [session.id],
  );
  const rows = await pool.query("SELECT purpose,stage FROM auth_attempts WHERE state='s1'");
  assert.equal(rows.rows[0].purpose, "delete");
});

it("refuses a delete-purpose attempt with no session to ride", async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,expires_at)
       VALUES('bh','native','delete','apple','apple','reauth_authorize',1,'s2','n2',NULL,now()+interval '5 min')`,
    ),
    /auth_attempts_session_check/,
  );
});

it("still refuses a link whose existing provider equals its target", async () => {
  const user = await seedUser({ googleSub: "g-9", appleSub: "a-9" });
  const session = await seedSession(user.id);
  await assert.rejects(
    pool.query(
      `INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,expires_at)
       VALUES('bh','native','link','apple','apple','reauth_authorize',1,'s4','n4',$1,now()+interval '5 min')`,
      [session.id],
    ),
    /auth_attempts_session_check/,
    "widening for delete must not loosen the link arm",
  );
});

it("admits the delete_ready stage", async () => {
  const user = await seedUser({ googleSub: "g-2", appleSub: "a-2" });
  const session = await seedSession(user.id);
  await pool.query(
    `INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,reauthenticated_at,expires_at)
     VALUES('bh','native','delete','apple','apple','delete_ready',1,'s3','n3',$1,now(),now()+interval '5 min')`,
    [session.id],
  );
  const rows = await pool.query("SELECT stage FROM auth_attempts WHERE state='s3'");
  assert.equal(rows.rows[0].stage, "delete_ready");
});
```

The third test is the one that matters most: the `delete` arm must be **added**
to `auth_attempts_session_check`, not blended into the `link` arm. A widening
that accidentally drops `existing_provider <> target_provider` from the link arm
would let a link re-prove the provider it is adding, and no other test here
would notice.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app && pnpm test --project integration -- schema.integration
```

Expected: tests 1, 2 and 4 fail on `auth_attempts_purpose_check` /
`auth_attempts_stage_check`. Test 3 passes already — it is a regression pin, and
it must still pass at Step 5.

- [ ] **Step 3: Widen the three CHECK constraints in `schema.ts`**

```
purpose in ('signin','link','delete')

stage in ('authorize','exchanging','confirm','reauth_authorize',
          'reauth_exchanging','target_authorize','target_exchanging',
          'link_ready','delete_ready')

(purpose='signin' and original_session_id is null and existing_provider is null)
or (purpose='link' and original_session_id is not null
    and existing_provider is not null
    and existing_provider <> target_provider)
or (purpose='delete' and original_session_id is not null
    and existing_provider is not null)
```

The `delete` arm deliberately has **no** `<> target_provider` clause: a delete
re-proves a provider the rower already holds, so existing and target are equal.
The `link` arm keeps its clause untouched.

In `app/shared/auth.ts`:

```ts
export type AuthPurpose = "signin" | "link" | "delete";
```

- [ ] **Step 4: Generate the migration and read it**

```bash
cd app && pnpm db:generate
```

Open the generated `drizzle/0032_*.sql`. It must contain only `ALTER TABLE`
statements against `auth_attempts` — **no `CREATE TABLE`**. If drizzle emits a
table, something from the withdrawn outbox is still in `schema.ts`. Rename the
file to `0032_account_delete_purpose.sql` and update
`drizzle/meta/_journal.json`, following `0029_drop_difficulty_compat.sql`.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd app && pnpm test --project integration -- schema.integration
```

Expected: PASS, 4 tests, including the unchanged regression pin.

- [ ] **Step 6: Commit, then prove the constraints can still refuse**

**Commit first** (RF22): a mutation revert on a dirty file has destroyed real
work here twice.

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-worktrees/wave-a-pr1
git rev-parse --show-toplevel   # MUST print the worktree path, not the main checkout
git add app/drizzle app/server/db/schema.ts app/shared/auth.ts app/server/db/schema.integration.test.ts
git commit -m "Account management: the delete purpose and the delete_ready stage"
```

Then widen the `delete` arm to drop `original_session_id is not null`, re-run,
confirm test 2 goes **red**, record what the failure said, and revert.

---

## Task 2: Unlink, the three reasons zero rows can happen, and the revoker

**Files:**
- Create: `app/server/auth/appleRevoke.ts`, `app/server/auth/accountRoutes.ts`,
  `app/server/auth/accountRoutes.integration.test.ts`
- Modify: `app/server/auth/attempts.ts`, `app/server/auth/frontDoor.ts`,
  `app/shared/auth.ts`

**Interfaces:**
- Consumes: Task 1's migration.
- Produces:
  ```ts
  // shared/auth.ts
  export type UnlinkOutcome =
    | { outcome: "unlinked"; appleRevoked: boolean }
    | { outcome: "last_provider" }
    | { outcome: "not_connected" }
    | { outcome: "account_gone" };
  // appleRevoke.ts
  export interface AppleGrant { clientId: string; refreshToken: string }
  export type RevokeApple = (grants: AppleGrant[]) => Promise<boolean>;
  ```
  `createAttempts(pool, accessPolicy, revokeApple)` — a third **required**
  parameter. Required, not defaulted: a default no-op would silently report
  success, which is the exact failure RF25 names.
  Route: `DELETE /api/auth/methods/:provider`.

- [ ] **Step 1: Write the failing test**

```ts
it("removes a provider from a two-provider account", async () => {
  const user = await seedUser({ googleSub: "g-1", appleSub: "a-1" });
  const result = await attempts.unlink(user.id, "apple");
  assert.equal(result.outcome, "unlinked");
  const row = await pool.query("SELECT apple_sub,google_sub FROM users WHERE id=$1", [user.id]);
  assert.equal(row.rows[0].apple_sub, null);
  assert.equal(row.rows[0].google_sub, "g-1");
});

it("refuses to remove the last provider, and leaves the subject intact", async () => {
  const user = await seedUser({ googleSub: null, appleSub: "a-2" });
  assert.deepEqual(await attempts.unlink(user.id, "apple"), { outcome: "last_provider" });
  const row = await pool.query("SELECT apple_sub FROM users WHERE id=$1", [user.id]);
  assert.equal(row.rows[0].apple_sub, "a-2");
});

it("distinguishes a provider that was never connected", async () => {
  const user = await seedUser({ googleSub: "g-3", appleSub: null });
  assert.deepEqual(await attempts.unlink(user.id, "apple"), { outcome: "not_connected" });
});

it("distinguishes an account deleted in another tab", async () => {
  const user = await seedUser({ googleSub: "g-4", appleSub: "a-4" });
  await pool.query("DELETE FROM users WHERE id=$1", [user.id]);
  assert.deepEqual(await attempts.unlink(user.id, "apple"), { outcome: "account_gone" });
});

it("revokes BOTH grants when a phone-and-web rower removes Apple", async () => {
  const seen: string[] = [];
  const attempts = makeAttempts(async (grants) => {
    for (const g of grants) seen.push(g.refreshToken);
    return true;
  });
  const user = await seedUser({ googleSub: "g-5", appleSub: "a-5" });
  await pool.query(
    `INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES
      ($1,'haus.waffle.ergomatic','rt-native'),
      ($1,'haus.waffle.ergomatic.web.staging','rt-web')`,
    [user.id],
  );
  const result = await attempts.unlink(user.id, "apple");
  assert.deepEqual(seen.sort(), ["rt-native", "rt-web"]);
  assert.equal(result.outcome === "unlinked" && result.appleRevoked, true);
  assert.equal((await pool.query("SELECT 1 FROM apple_grants WHERE user_id=$1", [user.id])).rowCount, 0);
});

it("still removes the method when Apple cannot be reached, and says so", async () => {
  const attempts = makeAttempts(async () => false);
  const user = await seedUser({ googleSub: "g-6", appleSub: "a-6" });
  await pool.query(
    `INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')`,
    [user.id],
  );
  const result = await attempts.unlink(user.id, "apple");
  assert.deepEqual(result, { outcome: "unlinked", appleRevoked: false });
  const row = await pool.query("SELECT apple_sub FROM users WHERE id=$1", [user.id]);
  assert.equal(row.rows[0].apple_sub, null, "a failed revoke never undoes the unlink");
});

it("never calls Apple while the transaction is still open", async () => {
  // The external call must happen AFTER the commit. If it runs inside, a slow
  // Apple holds a row lock, and a revoke that succeeds before a commit that
  // fails destroys a credential for an account that still exists.
  let openDuringCall = true;
  const attempts = makeAttempts(async () => {
    const row = await pool.query(
      "SELECT apple_sub FROM users WHERE id=$1",
      [trackedUserId],
    );
    // A second connection sees the committed NULL only if the tx already ended.
    openDuringCall = row.rows[0]?.apple_sub !== null;
    return true;
  });
  const user = await seedUser({ googleSub: "g-7", appleSub: "a-7" });
  trackedUserId = user.id;
  await pool.query(`INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')`, [user.id]);
  await attempts.unlink(user.id, "apple");
  assert.equal(openDuringCall, false, "the revoke ran before the commit");
});

it("holds the guard against a concurrent unlink of the other provider", async () => {
  // A held-lock test, not a race (spec, Testing). Verify the pool has >= 2
  // connections first, or this hangs instead of failing.
  assert.ok(pool.options.max >= 2, "this test needs a second connection");
  const user = await seedUser({ googleSub: "g-8", appleSub: "a-8" });
  const holder = await pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("UPDATE users SET google_sub=NULL WHERE id=$1", [user.id]);
    const pending = attempts.unlink(user.id, "apple");
    await holder.query("COMMIT");
    assert.deepEqual(await pending, { outcome: "last_provider" });
  } finally {
    holder.release();
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app && pnpm test --project integration -- accountRoutes
```

Expected: FAIL, `attempts.unlink is not a function`.

- [ ] **Step 3: Write `appleRevoke.ts`**

```ts
import { SignJWT } from "jose";
import type { ProviderConfig } from "./providers.js";

export interface AppleGrant {
  clientId: string;
  refreshToken: string;
}
/** Resolves true only when EVERY grant was accepted by Apple. */
export type RevokeApple = (grants: AppleGrant[]) => Promise<boolean>;

export function createAppleRevoke(
  config: ProviderConfig,
  fetcher: typeof fetch = fetch,
): RevokeApple {
  return async (grants) => {
    if (!grants.length) return true;
    const results = await Promise.allSettled(
      grants.map(async (g) => {
        const secret = await new SignJWT({})
          .setProtectedHeader({ alg: "ES256", kid: config.apple.keyId })
          .setIssuer(config.apple.teamId)
          .setSubject(g.clientId)
          .setAudience("https://appleid.apple.com")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(config.apple.key);
        const response = await fetcher("https://appleid.apple.com/auth/revoke", {
          method: "POST",
          body: new URLSearchParams({
            token: g.refreshToken,
            token_type_hint: "refresh_token",
            client_id: g.clientId,
            client_secret: secret,
          }),
          // Bounded on purpose. The rower is waiting on a delete that has
          // ALREADY committed; this call can only add latency, never change
          // the outcome, so it gets a short leash.
          signal: AbortSignal.timeout(3000),
          redirect: "error",
        });
        // Apple's 200 covers "revoked successfully OR was previously invalid",
        // so a repeat is harmless and needs no dedupe.
        if (!response.ok) throw new Error(String(response.status));
      }),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed)
      console.warn(
        JSON.stringify({ event: "apple_revoke_failed", failed, of: grants.length }),
      );
    return failed === 0;
  };
}
```

- [ ] **Step 4: Implement `unlink` in `attempts.ts`**

```ts
async unlink(userId: string, provider: AuthProvider): Promise<UnlinkOutcome> {
  const settled = await transaction(async (tx): Promise<
    UnlinkOutcome | { outcome: "unlinked"; grants: AppleGrant[] }
  > => {
    const column = subjectColumn(provider);
    const other = subjectColumn(provider === "apple" ? "google" : "apple");
    // The guard lives in the WHERE clause, not a read-then-write. The database
    // enforces the invariant, so two tabs unlinking different providers cannot
    // both pass.
    //
    // The self-join exists because a plain `RETURNING apple_sub` yields the NEW
    // row, which is the NULL we just wrote. `FROM users old` is how Postgres
    // exposes the pre-update value. Paste-tested on Postgres 18.4: returns
    // `a-1` with UPDATE 1 on a two-provider account, 0 rows with the subject
    // intact on a last-provider one.
    const updated = await tx.query<{ oldSub: string }>(
      `UPDATE users u SET ${column}=NULL
         FROM users old
        WHERE u.id=$1 AND old.id=u.id
          AND u.${column} IS NOT NULL AND u.${other} IS NOT NULL
        RETURNING old.${column} AS "oldSub"`,
      [userId],
    );
    if (!updated.rowCount) {
      // Zero rows has three causes and a rower whose account is gone must not
      // be told they cannot remove their last sign-in method. A second read
      // names the cause; it cannot change the outcome, only describe it.
      const row = (
        await tx.query<{ mine: string | null }>(
          `SELECT ${column} AS mine FROM users WHERE id=$1`,
          [userId],
        )
      ).rows[0];
      if (!row) return { outcome: "account_gone" };
      if (!row.mine) return { outcome: "not_connected" };
      return { outcome: "last_provider" };
    }
    if (provider !== "apple") return { outcome: "unlinked", grants: [] };
    // BOTH grants, if the rower used phone and web. `frontDoor.ts` refuses to
    // boot if the native and web client ids are equal, so these are distinct.
    const grants = await tx.query<AppleGrant>(
      `DELETE FROM apple_grants WHERE user_id=$1
        RETURNING client_id AS "clientId", refresh_token AS "refreshToken"`,
      [userId],
    );
    return { outcome: "unlinked", grants: grants.rows };
  });
  if (!("grants" in settled)) return settled;
  // AFTER the commit, never inside it. Our copy of the credential is already
  // destroyed; this only asks Apple to forget too, and a failure cannot and
  // must not undo the unlink.
  return { outcome: "unlinked", appleRevoked: await revokeApple(settled.grants) };
}
```

- [ ] **Step 5: Add the route and wire the revoker**

`app/server/auth/accountRoutes.ts`:

```ts
import { Router } from "express";
import type { Attempts } from "./attempts.js";
import type { SessionStore } from "./sessions.js";
import { requireUser } from "./middleware.js";
import { failure } from "./frontDoorRoutes.js";
import { AuthFailure } from "./frontDoorErrors.js";

export function createAccountRoutes(deps: {
  attempts: Attempts;
  sessions: SessionStore;
}) {
  const { attempts, sessions } = deps;
  const router = Router();
  router.delete(
    "/api/auth/methods/:provider",
    requireUser(sessions),
    async (req, res) => {
      try {
        const provider = req.params.provider;
        if (provider !== "apple" && provider !== "google")
          throw new AuthFailure("invalid_request");
        res.json(await attempts.unlink(req.user!.id, provider));
      } catch (error) {
        failure(res, error);
      }
    },
  );
  return router;
}
```

Export `failure` from `frontDoorRoutes.ts` if it is not already exported. In
`frontDoor.ts`:

```ts
const attempts = createAttempts(pool, accessPolicy, createAppleRevoke(config));
```

and mount `createAccountRoutes({ attempts, sessions })` beside the front-door
router.

- [ ] **Step 6: Run the tests and watch them pass**

```bash
cd app && pnpm test --project integration -- accountRoutes
```

Expected: PASS, 8 tests.

- [ ] **Step 7: Commit, then prove the guard can go red**

```bash
git rev-parse --show-toplevel
git add app/server/auth/ app/shared/auth.ts
git commit -m "Unlink a sign-in method, with the last-provider guard in the WHERE clause"
```

Two mutations, both recorded with what the failure said:
1. Delete `AND ${other} IS NOT NULL` from the `WHERE` → "refuses to remove the
   last provider" must fail.
2. Move the `revokeApple` call inside the transaction → "never calls Apple while
   the transaction is still open" must fail. If it does **not** fail, that test
   is decoration and must be fixed before moving on (RF21).

---

## Task 3: Deletion — the `delete` purpose through the attempt machine

**Files:**
- Modify: `app/server/auth/attempts.ts`, `app/server/auth/frontDoorRoutes.ts`,
  `app/shared/auth.ts`
- Test: `app/server/auth/attempts.integration.test.ts`

**Interfaces:**
- Consumes: Task 1's `delete` purpose and `delete_ready` stage; Task 2's
  `RevokeApple`.
- Produces:
  `deleteAccount(expected: Attempt, currentSessionId: string): Promise<DeleteOutcome>`
  where `type DeleteOutcome = { outcome: "deleted"; appleRevoked: boolean }`;
  the route `POST /api/auth/{surface}/attempts/:id/delete`.

- [ ] **Step 1: Write the failing test**

```ts
it("re-proves the provider the rower already holds, not the opposite one", async () => {
  const user = await seedUser({ googleSub: "g-1", appleSub: null });
  const session = await seedSession(user.id);
  const { attempt } = await attempts.begin({
    surface: "native", purpose: "delete", targetProvider: "google",
    originalSessionId: session.id,
  });
  assert.equal(attempt.existingProvider, "google", "a delete re-proves what you hold");
  assert.equal(attempt.targetProvider, "google");
  assert.equal(attempt.stage, "reauth_authorize");
});

it("refuses a delete attempt naming a provider the rower does not hold", async () => {
  const user = await seedUser({ googleSub: "g-2", appleSub: null });
  const session = await seedSession(user.id);
  await assert.rejects(
    attempts.begin({
      surface: "native", purpose: "delete", targetProvider: "apple",
      originalSessionId: session.id,
    }),
    (e: AuthFailure) => e.code === "account_conflict",
  );
});

it("reaches delete_ready when the reauth matches the signed-in account", async () => {
  const { claimed } = await reauthenticatedDeleteAttempt({ sub: "g-3" });
  const result = await attempts.accept(claimed, identity({ sub: "g-3" }));
  assert.equal(result.attempt!.stage, "delete_ready");
  assert.ok(result.attempt!.reauthenticatedAt);
});

it("refuses when the reauth proves a DIFFERENT account", async () => {
  const { claimed } = await reauthenticatedDeleteAttempt({ sub: "g-4" });
  await assert.rejects(
    attempts.accept(claimed, identity({ sub: "someone-else" })),
    (e: AuthFailure) => e.code === "account_changed",
  );
});

it("removes rows from all twelve tables and leaves the account gone", async () => {
  const user = await seedUserWithDataEverywhere();
  const { ready, session } = await deleteReadyAttempt(user);
  await attempts.deleteAccount(ready, session.id);
  for (const table of [
    "sessions", "baselines", "workouts", "session_logs", "plan_state",
    "preferences", "test_history", "article_reads", "concept2_links",
    "concept2_auth_attempts", "apple_grants",
  ]) {
    const rows = await pool.query(`SELECT 1 FROM ${table} WHERE user_id=$1`, [user.id]);
    assert.equal(rows.rowCount, 0, `${table} still holds rows`);
  }
  assert.equal(
    (await pool.query("SELECT 1 FROM auth_attempts WHERE id=$1", [ready.id])).rowCount, 0,
    "auth_attempts cascades through sessions",
  );
  assert.equal((await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount, 0);
});

it("revokes every Apple grant plus the attempt's own credential", async () => {
  const seen: string[] = [];
  const attempts = makeAttempts(async (grants) => {
    for (const g of grants) seen.push(g.refreshToken);
    return true;
  });
  const user = await seedUser({ googleSub: null, appleSub: "a-7" });
  await pool.query(
    `INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES
      ($1,'haus.waffle.ergomatic','rt-native'),
      ($1,'haus.waffle.ergomatic.web.staging','rt-web')`,
    [user.id],
  );
  // The attempt carries a THIRD live credential, which would otherwise cascade
  // away through sessions with nothing revoked (spec, "The other two live
  // credentials").
  const { ready, session } = await deleteReadyAttempt(user, {
    appleClientId: "haus.waffle.ergomatic", appleRefreshToken: "rt-attempt",
  });
  const result = await attempts.deleteAccount(ready, session.id);
  assert.deepEqual(seen.sort(), ["rt-attempt", "rt-native", "rt-web"]);
  assert.equal(result.appleRevoked, true);
});

it("deletes the account even when Apple cannot be reached, and says so", async () => {
  const attempts = makeAttempts(async () => false);
  const user = await seedUser({ googleSub: null, appleSub: "a-8" });
  await pool.query(`INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')`, [user.id]);
  const { ready, session } = await deleteReadyAttempt(user);
  assert.deepEqual(await attempts.deleteAccount(ready, session.id), {
    outcome: "deleted", appleRevoked: false,
  });
  assert.equal((await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount, 0);
});

it("does NOT delete the account when the local write fails", async () => {
  // RF25's owner: our write failing is fatal. The rower must not be told the
  // account is gone when it is not.
  const user = await seedUser({ googleSub: "g-9", appleSub: null });
  const { ready, session } = await deleteReadyAttempt(user);
  await pool.query(
    "ALTER TABLE sessions ADD CONSTRAINT force_delete_failure CHECK (token_hash <> 'x')",
  );
  try {
    await pool.query("UPDATE sessions SET token_hash='x' WHERE id=$1", [session.id]);
  } catch { /* the constraint is what we want, not this write */ }
  // Force the cascade to fail, then assert the account survives and the caller saw it.
  await assert.rejects(attempts.deleteAccount(ready, session.id));
  assert.equal((await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount, 1);
  await pool.query("ALTER TABLE sessions DROP CONSTRAINT force_delete_failure");
});

it("does not deadlock against a concurrent sign-in on the same session", async () => {
  // Measured on Postgres 18.4: the reverse lock order deadlocks and the AUTH
  // transaction is the victim, which a rower experiences as a sign-in that
  // fails for no reason.
  assert.ok(pool.options.max >= 2);
  const user = await seedUser({ googleSub: "g-10", appleSub: null });
  const session = await seedSession(user.id);
  const holder = await pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const { ready } = await deleteReadyAttempt(user, {}, session);
    const pending = attempts.deleteAccount(ready, session.id);
    await holder.query("COMMIT");
    await pending; // must resolve, never reject with a deadlock
  } finally {
    holder.release();
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app && pnpm test --project integration -- attempts.integration
```

Expected: FAIL — `begin()` has no `delete` branch, so the `link` path's
`existing = opposite provider` runs and the first assertion reads `"apple"`.

- [ ] **Step 3: Add the `delete` branch to `begin()`**

```ts
if (input.purpose === "link" || input.purpose === "delete") {
  if (!input.originalSessionId) throw new AuthFailure("account_changed");
  const session = await original(tx, input.originalSessionId, true);
  // A link re-proves the OPPOSITE provider; a delete re-proves the SAME one.
  existing =
    input.purpose === "delete"
      ? input.targetProvider
      : input.targetProvider === "apple" ? "google" : "apple";
  const user = (
    await tx.query<{ existing: string | null; target: string | null }>(
      `SELECT ${subjectColumn(existing)} AS existing,${subjectColumn(input.targetProvider)} AS target FROM users WHERE id=$1`,
      [session.userId],
    )
  ).rows[0];
  if (input.purpose === "link") {
    if (!user?.existing || user.target) throw new AuthFailure("account_conflict");
  } else if (!user?.existing) {
    // A delete must name a provider the rower actually holds; there is nothing
    // to re-prove otherwise.
    throw new AuthFailure("account_conflict");
  }
  await tx.query("DELETE FROM auth_attempts WHERE original_session_id=$1", [
    input.originalSessionId,
  ]);
}
```

The stage literal `input.purpose === "signin" ? "authorize" : "reauth_authorize"`
already handles `delete` — read it and confirm, do not edit. The session
argument does need editing:

```ts
input.purpose === "signin" ? null : input.originalSessionId,
```

- [ ] **Step 4: Add the `delete` arm to `accept()`**

In the `reauth_exchanging` branch, after the existing
`if (user?.id !== session.userId) throw new AuthFailure("account_changed");`:

```ts
if (a.purpose === "delete")
  return {
    attempt: await save(tx, {
      ...a,
      stage: "delete_ready",
      reauthenticatedAt: now,
      expiresAt: new Date(now.getTime() + ttl),
    }),
  };
```

leaving the `target_authorize` transition below it unchanged.

**`consistent()` must accept the new stage**, or `save()` throws. Widen:

```ts
((a.stage.startsWith("target_") ||
  a.stage === "link_ready" ||
  a.stage === "delete_ready") &&
  !a.reauthenticatedAt)
```

Add a test asserting a `delete` attempt at stage `confirm` is still rejected by
`consistent()` — the `signup` rule must not have been loosened.

- [ ] **Step 5: Implement `deleteAccount`**

```ts
async deleteAccount(
  expected: Attempt,
  currentSessionId: string,
): Promise<DeleteOutcome> {
  const grants = await transaction(async (tx) => {
    const a = await bound(tx, expected);
    if (
      a.stage !== "delete_ready" ||
      !a.reauthenticatedAt ||
      Date.now() - a.reauthenticatedAt.getTime() >= ttl
    )
      throw new AuthFailure("attempt_expired");
    if (currentSessionId !== a.originalSessionId)
      throw new AuthFailure("account_changed");
    const session = await original(tx, currentSessionId, true);
    // LOCK ORDER: sessions before users, matching original(). Measured on
    // Postgres 18.4 -- the reverse deadlocks against a concurrent sign-in and
    // the AUTH transaction is chosen as the victim, which a rower experiences
    // as a sign-in that fails for no reason. bound() -> original() has already
    // taken this session's lock; this takes the REST of them before the DELETE
    // cascades into the table.
    await tx.query("SELECT id FROM sessions WHERE user_id=$1 FOR UPDATE", [session.userId]);
    const row = (
      await tx.query<{ appleSub: string | null }>(
        `SELECT apple_sub AS "appleSub" FROM users WHERE id=$1 FOR UPDATE`,
        [session.userId],
      )
    ).rows[0];
    if (!row) throw new AuthFailure("account_changed");
    // Read the credentials while they still exist -- they cascade away below.
    const held = row.appleSub
      ? (
          await tx.query<AppleGrant>(
            `SELECT client_id AS "clientId", refresh_token AS "refreshToken"
               FROM apple_grants WHERE user_id=$1`,
            [session.userId],
          )
        ).rows
      : [];
    if (row.appleSub && a.appleClientId && a.appleRefreshToken)
      held.push({ clientId: a.appleClientId, refreshToken: a.appleRefreshToken });
    const deleted = await tx.query("DELETE FROM users WHERE id=$1", [session.userId]);
    if (!deleted.rowCount) throw new AuthFailure("account_changed");
    return held;
  });
  // AFTER the commit. The account is gone and cannot come back, so this call
  // can only add latency. A rejection here must never propagate as a failed
  // deletion -- that is the one confusion this whole ordering exists to avoid.
  return { outcome: "deleted", appleRevoked: await revokeApple(grants) };
}
```

**Any throw from the transaction propagates, and that is deliberate.** The route
must not catch it into a success.

- [ ] **Step 6: Add the route**

In `frontDoorRoutes.ts`, extend the action loop to include `"delete"`, gated by
`requireUser(sessions)` exactly as `finalize` is:

```ts
if (action === "delete") {
  const outcome = await attempts.deleteAccount(a, req.sessionId!);
  if (surface === "web") {
    res.append("Set-Cookie", cookie("", 0));
    res.append("Set-Cookie", sessionCookie("", new Date(0)));
  }
  res.json(outcome);
  return;
}
```

The account's sessions are already gone with the cascade; clearing the cookies
stops the browser sending a token that now resolves to nothing.

- [ ] **Step 7: Run the tests and watch them pass**

```bash
cd app && pnpm test --project integration -- attempts.integration
```

Expected: PASS, 9 new tests.

- [ ] **Step 8: Commit, then prove the lock order can go red**

```bash
git rev-parse --show-toplevel
git add app/server/auth/ app/shared/auth.ts
git commit -m "Delete an account: reauth through the delete purpose, sessions locked before users"
```

Swap the order in `deleteAccount` — take the `users` `FOR UPDATE` before the
`sessions` one — and confirm the deadlock test fails with `deadlock detected`.
**Record the exact message.** Revert. This is the mutation that proves the
comment is load-bearing rather than decorative.

---

## Task 4: The You screen — remove a method, delete the account

**Files:**
- Modify: `app/src/adapters/authFlow.ts`, `app/src/you/SignInMethods.tsx`
- Create: `app/src/you/DeleteAccount.tsx`
- Test: `app/src/you/SignInMethods.test.tsx`, `app/src/you/DeleteAccount.test.tsx`

**Interfaces:**
- Consumes: `DELETE /api/auth/methods/:provider` → `UnlinkOutcome`;
  `POST /api/auth/{surface}/attempts/:id/delete` → `DeleteOutcome`.
- Produces: `removeMethod(provider)`, `startDelete(provider)`, `confirmDelete()`
  on `AuthFlowController`; `AuthFlowView` gains
  `{ kind: "unlinked"; provider: AuthProvider }`,
  `{ kind: "unlink_refused"; provider: AuthProvider; reason: "last_provider" | "not_connected" | "account_gone" }`,
  and `{ kind: "delete_ready" }`.

**This task carries the design gate.** It changes what a rower reads and sees,
so **Gate 0 applies: James approves the rendered screens before any
implementation step runs.**

- [ ] **Step 1: Gate 0 — render the screens and stop**

Produce, as real captures against a seeded account, in **both orientations at
real proportions**, against what they replace, with every colour pairing's
contrast ratio computed and stated as a number:

1. The methods list on a two-provider account: each row carries `Remove`.
2. The same list with one provider: the remaining row has **no** `Remove` at
   all, rather than a disabled control with no explanation.
3. Each of the three refusal notices, with exact copy.
4. The delete confirm screen.
5. The post-deletion Welcome notice for `appleRevoked: false`.

Present it and STOP. **The gate is the approval, not the presentation.**

- [ ] **Step 2: Write the failing test**

```tsx
it("offers Remove only where removing is possible", async () => {
  renderMethods({ apple: true, google: true });
  expect(await screen.findAllByRole("button", { name: /^Remove / })).toHaveLength(2);
});

it("offers no Remove on the last remaining method", async () => {
  renderMethods({ apple: false, google: true });
  expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
});

it("tells a rower whose account is gone the truth, not the last-provider line", async () => {
  server.use(http.delete("/api/auth/methods/apple", () =>
    HttpResponse.json({ outcome: "account_gone" })));
  renderMethods({ apple: true, google: true });
  await userEvent.click(screen.getByRole("button", { name: "Remove Apple" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/no longer available/i);
  expect(screen.queryByText(/last sign-in method/i)).toBeNull();
});

it("shows Apple's own remedy when the revoke did not land", async () => {
  renderDeleted({ outcome: "deleted", appleRevoked: false });
  expect(await screen.findByRole("status")).toHaveTextContent(/Apple ID settings/i);
});

it("says nothing about Apple when the revoke landed", async () => {
  renderDeleted({ outcome: "deleted", appleRevoked: true });
  expect(screen.queryByText(/Apple ID settings/i)).toBeNull();
});
```

- [ ] **Step 3: Run them and watch them fail**

```bash
cd app && pnpm test --project client
```

**Do not use `pnpm test --project client -- <pattern>`** — pnpm swallows the
scoped flag and silently runs the whole suite. For a file filter:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/SignInMethods.test.tsx
```

Note that form collapses a signal death to exit 1 (RF40), and `console.log` from
a client test never reaches stdout — use `process.stdout.write` for any probe
readout (RF/TESTING.md §11).

Expected: FAIL, no Remove buttons rendered.

- [ ] **Step 4: Implement the controller methods**

```ts
async removeMethod(provider) {
  setView({ kind: "busy", purpose: "link" });
  const response = await api(`/api/auth/methods/${provider}`, { method: "DELETE" });
  if (!response.ok) {
    setView({ kind: "error", purpose: "link", code: "signin_failed", targetProvider: provider });
    return;
  }
  const body = (await response.json()) as UnlinkOutcome;
  setView(
    body.outcome === "unlinked"
      ? { kind: "unlinked", provider }
      : { kind: "unlink_refused", provider, reason: body.outcome },
  );
},
```

`startDelete` mirrors `prepareLink` with `purpose: "delete"` and the provider the
rower already holds. `confirmDelete` posts the `delete` action and, on
`{ outcome: "deleted" }`, clears the local token and routes to Welcome, carrying
`appleRevoked` so the notice can render once.

- [ ] **Step 5: Implement the UI**

A connected row gains a `Remove` button, rendered **only when the other provider
is also connected** (`const removable = methods.methods.apple && methods.methods.google;`):

```tsx
{removable && (
  <button
    className="button-l2 auth-method-remove"
    aria-label={`Remove ${name(provider)}`}
    onClick={() => void auth.removeMethod(provider)}
  >
    Remove
  </button>
)}
```

Copy, exact:

- `last_provider` — "That's your only way back in, so it has to stay. Add the other sign-in method first, then remove this one."
- `not_connected` — "That sign-in method isn't connected to this account."
- `account_gone` — "This account is no longer available. Nothing was changed."
- The confirm screen — "Your account and everything in it is deleted for good. This cannot be undone."
- The `appleRevoked: false` notice — "Your account is deleted. We couldn't reach Apple to disconnect Ergomatic, so you can remove it yourself in your Apple ID settings, under Sign in with Apple."

**The confirm screen must not promise anything about Apple**, because the
revoke has not happened when it is read.

- [ ] **Step 6: Run the tests, then the e2e specs and captures**

```bash
cd app && pnpm test --project client
pnpm e2e
pnpm screenshots
git checkout -- docs/screenshots/   # then re-add ONLY the screens this diff touched
```

An `app/src/` change is not done until a full e2e run has passed somewhere you
have read the result (RF1).

- [ ] **Step 7: Commit**

```bash
git rev-parse --show-toplevel
git add app/src/ docs/screenshots/
git commit -m "You: remove a sign-in method, delete the account"
```

---

## Task 5: The conflict copy, and the records

**Files:**
- Modify: `app/src/SignIn.tsx`, `ROADMAP.md`,
  `docs/superpowers/specs/2026-09-13-account-management-design.md`,
  `docs/superpowers/HANDOFF-2026-09-13-account-management.md`,
  `docs/design/DEVIATIONS.md` if a row there describes this area

**Interfaces:**
- Consumes: deletion existing. **This copy cannot ship before Task 3.**

- [ ] **Step 1: Write the failing test**

```tsx
it("tells a rower how to recover from a duplicate account", async () => {
  renderSignIn({ error: { code: "account_conflict", targetProvider: "apple" } });
  const notice = await screen.findByRole("alert");
  expect(notice).toHaveTextContent(/sign in to that account/i);
  expect(notice).toHaveTextContent(/delete it/i);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app && pnpm test --project client
```

- [ ] **Step 3: Write the copy**

> "That Apple sign-in already belongs to another Ergomatic account. To use it
> here, sign in to that account, delete it from You, then add this sign-in."

- [ ] **Step 4: Amend the spec, so the record does not contradict the code**

Revision 3 of the spec: strike §"`apple_revocations` — a transactional outbox"
and its lifetime table; replace with the three rulings from this plan's
"Rulings that supersede the spec"; correct "Two stored shapes" to one; and add
the third CHECK to the migration description. **Replace the superseded claims —
never append a correction beneath a contradiction.**

**Then grep the proposition, not only the string** (RF, Phase JC). Search the
repo for `apple_revocations`, `outbox`, `tombstone`, `revocation` and
`next_attempt_at` and reconcile every hit or state why it stands.

- [ ] **Step 5: Correct the other records**

- `ROADMAP.md`: the row saying **eight** tables lose rows on deletion is wrong —
  it is **twelve**. Correct it. Give every row this PR touches a
  `· dies YYYY-MM-DD · <why this is a row and not a fix now>` stamp if it lacks
  one (campsite rule).
- The handoff doc: steps 1 and 2 of "What to do next" are done — the phone gate
  closed 2026-09-13 (`apple_grants` 1 → 2 on one account, `users` still 6) and
  #431 merged as `be7838aa`. Replace the stale list.
- File as rows, not PR-body prose (RF14): a locked-out rower cannot delete
  in-app; Concept2 tokens are never deauthorized at Concept2; and the
  re-registration name defect, which now has no retry in front of it.

- [ ] **Step 6: Run the full gate**

```bash
cd app && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm dist:grep
```

- [ ] **Step 7: Commit**

```bash
git rev-parse --show-toplevel
git add app/src/ ROADMAP.md docs/
git commit -m "Conflict copy names its recovery, and the records match what shipped"
```

---

## Before the PR

- [ ] **Per-file coverage** for every file touched. The 90×4 gate is repo-wide
      and a new file can ship with whole branches uncovered (RF2).
- [ ] **Every new assertion has a mutation that made it fail**, and the PR body
      states what was mutated and what the failure said (RF21).
- [ ] **The PR body is written for James first**: line one "This PR [outcome]",
      then ~6 one-line bullets, everything else inside a collapsed `<details>`
      block titled "Record (for agents and audits)".
- [ ] **The DBA gate** on Task 1 and **the PM final-PR gate** — TRIAD on two
      counts (a stored shape, and auth). Present verdicts with the artifacts
      they judge. Do not merge on green CI.
- [ ] **The roadmap hand-back**: two lists in one message — rows this work wants
      to file, and every row anywhere in `ROADMAP.md` whose `dies` date has
      passed — then STOP. Nothing is struck without James.
- [ ] **Check the run the MERGE produces**, not just the PR's checks (RF28), and
      assert its `headSha` equals the PR's head (RF39).

## What this PR deliberately does not do

- Account merge, one-way transfer, any deactivate or grace-period state.
- The link follow-through. That is PR2, blocked on this PR's unlink for a
  security reason: unlink is the compensating control that makes a wrong attach
  recoverable.
- Guaranteed revocation. Apple says *should*; a failed revoke tells the rower
  Apple's own remedy and is not retried.
- Concept2 deauthorization at Concept2. A row.
- Fixing the two existing lockout paths (`ACCESS_MODE`, removed `APPLE_*`). A row.
