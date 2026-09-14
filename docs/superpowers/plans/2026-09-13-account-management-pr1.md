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

**The guard goes because the queue WIDENED the hazard from seconds to hours.**
An earlier draft said the queue *created* it; that was wrong and the correction
matters, because the false reason is what a future reader would inherit. The
hazard — a delete-then-re-register racing a *successful* revoke — is the spec's
Open Question 1, on which Apple is silent across six documents, and it exists in
any design. The queue stretched the window to however long a row waited to be
drained; revoking inline narrows it to the `AbortSignal.timeout(3000)` budget.
**Narrowed, not closed.** At a household cohort a rower deleting and
re-registering inside three seconds is not a real case, which is why the ruling
stands — but it stands on proportion, not on the hazard having been eliminated.
**PR1 therefore carries ONE stored shape, not two** — the `auth_attempts`
purpose — which is what the DBA gate now covers.

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

## Lifetime of the delete attempt (RF27)

The withdrawn outbox took the spec's lifetime table with it, and this PR
introduces exactly the session-scoped state RF27 names. Invariants, not
mechanisms:

| State | Minted | Cleared | Survives |
|---|---|---|---|
| The `delete`-purpose `auth_attempts` row | `begin()`, one per session | `cancel`; `discard` on a failed proof; the next `begin()` for that session; the 60 s sweep once `expires_at` passes; sign-out, via the `sessions` FK cascade; the user cascade on a successful delete | process restart and container replacement — it is a row, not memory |
| `reauthenticated_at` | `accept()` at `reauth_exchanging` | with the row | restart |
| The 5-minute TTL | `begin()`, re-stamped at `accept()` | expiry | restart |
| The binding secret | `begin()`, returned once | never stored in plaintext — only `binding_hash` is | — |

**One attempt per session, enforced by `auth_attempts_link_session_unique`**, so
a delete attempt and a link attempt cannot coexist: `begin()` unconditionally
deletes any attempt on that session first. **No state here can strand a rower** —
every path out clears the row, and the worst case is a five-minute wait before
the sweep. A reviewer who finds a path that does not clear has found a bug.

---

## What was measured while writing this plan

Everything below was run against Postgres 18.4 with this repo's migrations
applied (2026-09-13). Quoted outputs are real. **The last six rows were added
after the hardening pass falsified three claims the first draft measured for
itself** — the lesson being RF11's second half: each of those measurements ran,
and measured something the argument did not need.

**The paste-test has been run** (the precondition, not a finding — agent-briefing
"Plan authoring"). Every prescribed block below was applied at its real path on
`9df48abb` and put through `npx tsc -p tsconfig.server.json --noEmit` and
`npx eslint`, both of which came back **clean for the production files**, and
`pnpm db:generate` was run to confirm the emitted DDL. The scratch
implementation was then reverted; the worktree is clean. Two things it caught
are folded into Tasks 1 and 2 and called out under "What the paste-test caught".

| Claim | Result |
|---|---|
| The Task 1 migration applies | `pnpm db:generate` emits **6** `ALTER TABLE` (3 DROP + 3 ADD), no `CREATE TABLE` |
| `delete` purpose, `existing_provider = target_provider`, non-null session | **admitted** |
| `delete` purpose with `original_session_id IS NULL` | refused by `auth_attempts_session_check` |
| **stage `delete_ready`** | **refused by `auth_attempts_stage_check` — see the spec correction below** |
| A second attempt on one session | refused by `auth_attempts_link_session_unique` |
| Unlink guard, two-provider account | `UPDATE 1` |
| Unlink guard, last provider / already unlinked / no such account | `UPDATE 0`, `UPDATE 0`, `UPDATE 0` |
| The unlink guard leaves the subject intact when it refuses | 0 rows, `apple_sub` still `a-2` |
| Tables losing rows on account deletion | **12** — 11 cascade from `users`, `auth_attempts` via `sessions` (catalog query, not a grep) |
| Users-before-sessions vs `original()`, ONE session | deadlock, auth transaction the victim |
| **The first draft's prescription (ordered locks BELOW `bound()`), TWO sessions** | **`40P01 deadlock detected`, auth transaction the victim** — the ordering was inert because `bound()` → `original()` takes `users` first |
| **Every session locked BEFORE `bound()`, TWO sessions** | **no deadlock; the concurrent auth commits cleanly** |
| A `CHECK` on `sessions` as delete fault injection | `DELETE 1`, account gone — **the gate cannot go red** |
| A `BEFORE DELETE` trigger on `users` | `ERROR: forced delete failure`, account survives — the working replacement |
| A concurrent `grant()` upsert vs `users FOR UPDATE` | **not blocked.** The holder read `rt-OLD`; the row already held `rt-NEW` at commit time |

### What the paste-test caught

**1. Making `revokeApple` required breaks 13 existing call sites, and the plan
did not say so.** Measured:
`grep -rn 'createAttempts(' server/ --include='*.ts' | grep -v 'export function' | wc -l`
→ **13** — 11 in `attempts.integration.test.ts`, 1 in `frontDoor.ts`, 1 in
`frontDoorRoutes.integration.test.ts`. Every one fails
`TS2554: Expected 3 arguments, but got 2`. Task 2 now names them and carries the
fixture. **The parameter stays required**: a defaulted no-op would report a
revoke that never happened, which is the exact shape RF25 names.

**2. `failure` is declared locally in `frontDoorRoutes.ts` and not exported**
(`TS2459`). The plan already said to export it if needed; the paste-test
confirms it IS needed, so Task 2 states it as a step rather than a conditional.

Neither changes the design. Both would have cost an implementer a cycle.

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

Measured on `9df48abb`: drizzle emits `drizzle/0032_cold_puck.sql` containing
**exactly six statements** against `auth_attempts` — three `DROP CONSTRAINT`
then three `ADD CONSTRAINT`, in that order, and **no `CREATE TABLE`**. If a
table appears, something from the withdrawn outbox is still in `schema.ts`.

Rename the file to `0032_account_delete_purpose.sql` and update its `tag` in
`drizzle/meta/_journal.json`, following `0029_drop_difficulty_compat.sql`.
`pnpm db:generate` also writes `drizzle/meta/0032_snapshot.json`; that file is
part of the migration and is committed with it.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd app && pnpm test --project integration -- schema.integration
```

Expected: PASS, the four tests in Step 1, including the unchanged regression pin.

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
  //
  // DO NOT lift this fixture into a deleteAccount test as-is (finding N7): the
  // `?.apple_sub !== null` read returns TRUE ("still open") when the users row
  // is ABSENT, which is the normal end state of a delete. It would silently
  // invert and pass on a broken implementation. A delete version must assert on
  // the users row being GONE, not on its column.
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

**Share the client-secret construction with `providers.ts` (finding N4).** The
block below re-spells that file's Apple client secret verbatim — same header,
`iss`, `sub`, `aud`, `iat` and `5m` expiry. Two constructions of one credential
in two files will drift. Extract the helper into `providers.ts` and export it:

```ts
export function appleClientSecret(
  config: ProviderConfig,
  clientId: string,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.apple.keyId })
    .setIssuer(config.apple.teamId)
    .setSubject(clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(config.apple.key);
}
```

then call it from both `providers.ts`'s `verify()` and `appleRevoke.ts`.

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
    // NO self-join. An earlier draft recovered the pre-update subject with
    // `FROM users old ... RETURNING old.apple_sub` -- which worked, and had no
    // reader: it existed for the withdrawn outbox's `apple_sub` column, and the
    // revoke path takes refresh tokens from `apple_grants`, never a subject.
    // Measuring a mechanism the argument does not need is RF11's second half.
    const updated = await tx.query(
      `UPDATE users SET ${column}=NULL
        WHERE id=$1 AND ${column} IS NOT NULL AND ${other} IS NOT NULL`,
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
  // The try/catch is what makes the sentence above true: the type says
  // Promise<boolean>, which cannot forbid a rejection, and any injected revoker
  // can reject (finding N3).
  let appleRevoked = false;
  try {
    appleRevoked = await revokeApple(settled.grants);
  } catch {
    console.warn(JSON.stringify({ event: "apple_revoke_threw" }));
  }
  return { outcome: "unlinked", appleRevoked };
}
```

- [ ] **Step 4b: Update the 13 existing `createAttempts` call sites**

`revokeApple` is a required third parameter, so every existing construction
fails `TS2554: Expected 3 arguments, but got 2`. Measured on `9df48abb`:

```bash
grep -rn 'createAttempts(' server/ --include='*.ts' | grep -v 'export function' | wc -l   # 13
```

11 are in `attempts.integration.test.ts`, 1 in `frontDoor.ts` (Step 5 below),
and 1 in `frontDoorRoutes.integration.test.ts`. Give the test files one shared
fixture rather than 12 inline lambdas, so a later change to `RevokeApple` has
one edit site:

```ts
/** Records what would have been revoked; resolves the value the test wants. */
export function recordingRevoke(succeeds = true) {
  const seen: AppleGrant[] = [];
  const revoke: RevokeApple = async (grants) => {
    seen.push(...grants);
    return succeeds;
  };
  return { revoke, seen };
}
```

Existing tests that do not care pass `recordingRevoke().revoke`. **Do not pass
`async () => true` inline at 12 sites** — the assertions in Step 1 need `seen`,
and two spellings of the same fake is how one of them silently stops asserting.

- [ ] **Step 5: Export `failure`, add the route, and wire the revoker**

`failure` is declared locally in `frontDoorRoutes.ts` and is not exported —
importing it fails `TS2459`. Change `function failure(` to
`export function failure(` (it is at the module level, not inside
`createFrontDoorRoutes`, so this is the whole edit).

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

Expected: PASS. The eight tests in Step 1, plus the 13 updated call sites compiling.

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
- Test: `app/server/auth/attempts.integration.test.ts`,
  `app/server/auth/frontDoorRoutes.integration.test.ts`

**Interfaces:**
- Consumes: Task 1's `delete` purpose and `delete_ready` stage; Task 2's
  `RevokeApple`.
- Produces:
  `deleteAccount(expected: Attempt, currentSessionId: string): Promise<DeleteOutcome>`
  where `type DeleteOutcome = { outcome: "deleted"; appleRevoked: boolean }`;
  the route `POST /api/auth/{surface}/attempts/:id/delete`; `AuthStep` gains a
  `delete_ready` member; `BeginAuth` gains a `delete` member.

> **This task was rewritten after the hardening pass.** Four of its five
> blocking findings landed here, two of them falsifying measurements the first
> draft had made itself. The findings are named at the steps that fix them, and
> the ledger entry records the techniques. Do not restore an earlier shape
> without reading `.claude/agents/antagonist-ledger.md`'s 2026-09-13 entry.

- [ ] **Step 1: Open the front door to `purpose: "delete"` (finding B1)**

**The delete flow could not be STARTED.** `frontDoorRoutes.ts`'s attempt-creation
route refuses anything that is not `signin` or `link`, so every test in the first
draft passed only because each one called `attempts.begin()` directly and no test
crossed the route. Five gates are keyed to `link` and all five need the delete
case decided explicitly:

```ts
// 1. The validation. A delete is neither signin nor link.
if (
  (body.provider !== "apple" && body.provider !== "google") ||
  (body.purpose !== "signin" &&
    body.purpose !== "link" &&
    body.purpose !== "delete")
)
  throw new AuthFailure("invalid_request");

// 2. The pre-middleware. Without this req.sessionId is undefined and begin()'s
//    own `if (!input.originalSessionId)` throws account_changed.
const purpose = record(req.body).purpose;
if (purpose === "link" || purpose === "delete") {
  await requireUser(sessions)(req, res, next);
} else next();

// 3. The credential-class binding. A delete is MORE destructive than a link and
//    the first draft gave it no check at all.
if (
  (body.purpose === "link" || body.purpose === "delete") &&
  req.authVia !== (surface === "native" ? "bearer" : "cookie")
)
  throw new AuthFailure("account_changed");

// 4. The availability clause. A link needs BOTH providers; a delete needs only
//    the one being re-proved, so the opposite-provider check must NOT apply.
if (
  !providers.available(body.provider, surface) ||
  (body.purpose === "link" &&
    !providers.available(body.provider === "apple" ? "google" : "apple", surface))
)
  throw new AuthFailure("unavailable");
```

5. In `app/shared/auth.ts`, `BeginAuth` is a union of `signin` and `link` only,
   so `startDelete` cannot type-check against it:

```ts
export type BeginAuth =
  | { purpose: "signin"; provider: AuthProvider }
  | { purpose: "link"; provider: AuthProvider }
  | { purpose: "delete"; provider: AuthProvider };
```

- [ ] **Step 2: Let the rower SEE `delete_ready` (finding B2)**

**The delete flow could not be FINISHED.** `view()` returns early for `confirm`
and `link_ready`, then throws `attempt_expired` for any stage not in
`["authorize","reauth_authorize","target_authorize"]`. `delete_ready` falls
through to that throw, on **both** surfaces:

- **Native:** `/proof` calls `result(...)` → `view(r.attempt!)` → throws. The
  catch then runs `discard(claimed)` against the pre-`accept` snapshot, which no
  longer matches (stage and version both moved), so it deletes nothing. The row
  survives and the rower is told `attempt_expired` **on a reauth that
  succeeded**.
- **Web:** the callback redirects `/?authAttempt=<id>`, the client `GET`s the
  attempt, and `view()` throws the same way.

In `view()`, beside the `link_ready` line:

```ts
if (a.stage === "delete_ready") return { ...base, outcome: "delete_ready" };
```

and in `shared/auth.ts`'s `AuthStep` union:

```ts
| (AttemptView & { outcome: "delete_ready" })
```

**Gate it at the route, not at `accept()`.** Add to
`frontDoorRoutes.integration.test.ts`:

```ts
it("hands the rower a delete_ready step after a successful delete reauth", async () => {
  const { attemptId, secret } = await beginDelete({ provider: "google" });
  const response = await proof(attemptId, secret, identity({ sub: "g-1" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).outcome, "delete_ready");
});
```

This is the seam test the first draft lacked: every one of its Task 3 tests
stopped at `attempts.accept()` and asserted the stage, which is upstream of the
break (RF24).

- [ ] **Step 3: Write the failing tests**

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
  const { revoke, seen } = recordingRevoke();
  const attempts = makeAttempts(revoke);
  const user = await seedUser({ googleSub: null, appleSub: "a-7" });
  await pool.query(
    `INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES
      ($1,'haus.waffle.ergomatic','rt-native'),
      ($1,'haus.waffle.ergomatic.web.staging','rt-web')`,
    [user.id],
  );
  // The attempt carries a THIRD live credential, which would otherwise cascade
  // away through sessions with nothing revoked.
  const { ready, session } = await deleteReadyAttempt(user, {
    appleClientId: "haus.waffle.ergomatic", appleRefreshToken: "rt-attempt",
  });
  const result = await attempts.deleteAccount(ready, session.id);
  assert.deepEqual(seen.map((g) => g.refreshToken).sort(),
    ["rt-attempt", "rt-native", "rt-web"]);
  assert.equal(result.appleRevoked, true);
});

it("revokes the grant as it stands at DELETE time, not as it was read (finding B5)", async () => {
  // A concurrent grant() upsert refreshes the token mid-transaction. A plain
  // SELECT under `users FOR UPDATE` does NOT see it -- measured, see Step 6 --
  // so the revoke would send a dead token and report success over a live one.
  assert.ok(pool.options.max >= 2);
  const { revoke, seen } = recordingRevoke();
  const attempts = makeAttempts(revoke);
  const user = await seedUser({ googleSub: null, appleSub: "a-9" });
  await pool.query(
    `INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c1','rt-OLD')`,
    [user.id],
  );
  const { ready, session } = await deleteReadyAttempt(user);
  const racer = await pool.connect();
  try {
    await racer.query(
      `INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c1','rt-NEW')
         ON CONFLICT(user_id,client_id) DO UPDATE SET refresh_token=excluded.refresh_token`,
      [user.id],
    );
  } finally {
    racer.release();
  }
  await attempts.deleteAccount(ready, session.id);
  assert.deepEqual(seen.map((g) => g.refreshToken), ["rt-NEW"],
    "the revoke must carry the token the cascade destroyed");
});

it("deletes the account even when Apple cannot be reached, and says so", async () => {
  const attempts = makeAttempts(recordingRevoke(false).revoke);
  const user = await seedUser({ googleSub: null, appleSub: "a-8" });
  await pool.query(`INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')`, [user.id]);
  const { ready, session } = await deleteReadyAttempt(user);
  assert.deepEqual(await attempts.deleteAccount(ready, session.id), {
    outcome: "deleted", appleRevoked: false,
  });
  assert.equal((await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount, 1 - 1);
});

it("does NOT delete the account when the local write fails (finding B4)", async () => {
  // RF25's owner: our write failing is fatal. A BEFORE DELETE TRIGGER, never a
  // CHECK constraint -- measured, a CHECK does not fire on a cascade DELETE and
  // the first draft's version of this test could not go red.
  const { revoke, seen } = recordingRevoke();
  const attempts = makeAttempts(revoke);
  const user = await seedUser({ googleSub: "g-9", appleSub: null });
  const { ready, session } = await deleteReadyAttempt(user);
  await pool.query(
    `CREATE FUNCTION force_delete_failure() RETURNS trigger LANGUAGE plpgsql AS
       $$ BEGIN RAISE EXCEPTION 'forced delete failure'; END $$`,
  );
  await pool.query(
    `CREATE TRIGGER force_delete_failure BEFORE DELETE ON users
       FOR EACH ROW EXECUTE FUNCTION force_delete_failure()`,
  );
  try {
    await assert.rejects(attempts.deleteAccount(ready, session.id));
    assert.equal(
      (await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount, 1,
      "the account must survive a failed delete",
    );
    assert.deepEqual(seen, [], "a failed deletion must never revoke anything");
  } finally {
    await pool.query("DROP TRIGGER force_delete_failure ON users");
    await pool.query("DROP FUNCTION force_delete_failure()");
  }
});

it("does not deadlock against a concurrent sign-in on ANOTHER session (finding B3)", async () => {
  // TWO sessions. The first draft seeded ONE, which is why its version passed
  // against a prescription that was inert -- bound() -> original() takes the
  // users row before either ordered statement, so the ordering in the body
  // bought nothing. Measured: with two sessions BOTH orders deadlocked, with
  // the AUTH transaction as the victim.
  assert.ok(pool.options.max >= 2);
  const user = await seedUser({ googleSub: "g-10", appleSub: null });
  const sessionA = await seedSession(user.id);
  const sessionB = await seedSession(user.id);
  const { ready } = await deleteReadyAttempt(user, {}, sessionA);
  const holder = await pool.connect();
  try {
    await holder.query("BEGIN");
    // Exactly what original() does, on the OTHER session: sessions then users.
    await holder.query(
      `SELECT sessions.id FROM sessions INNER JOIN users ON sessions.user_id=users.id
        WHERE sessions.id=$1 AND sessions.expires_at>now() FOR UPDATE`,
      [sessionB.id],
    );
    const pending = attempts.deleteAccount(ready, sessionA.id);
    await new Promise((r) => setTimeout(r, 200));
    await holder.query("COMMIT");
    await pending; // must resolve, never reject with 40P01
  } finally {
    holder.release();
  }
});
```

- [ ] **Step 4: Run them and watch them fail**

```bash
cd app && pnpm test --project integration -- attempts.integration
```

Expected: FAIL — `begin()` has no `delete` branch, so the `link` path's
`existing = opposite provider` runs and the first assertion reads `"apple"`.

- [ ] **Step 5: Add the `delete` branch to `begin()` and `accept()`**

In `begin()`:

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
already handles `delete` — read it and confirm, do not edit. The session argument
does need editing:

```ts
input.purpose === "signin" ? null : input.originalSessionId,
```

In `accept()`'s `reauth_exchanging` branch, after the existing
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

leaving the `target_authorize` transition below it unchanged. **`consistent()`
must accept the new stage**, or `save()` throws:

```ts
((a.stage.startsWith("target_") ||
  a.stage === "link_ready" ||
  a.stage === "delete_ready") &&
  !a.reauthenticatedAt)
```

Add a test asserting a `delete` attempt at stage `confirm` is still rejected by
`consistent()` — the `signup` rule must not have been loosened.

- [ ] **Step 6: Implement `deleteAccount`**

Three things in this block were falsified by the hardening pass and are now
measured. Read the comments before changing any line of it.

```ts
async deleteAccount(
  expected: Attempt,
  currentSessionId: string,
): Promise<DeleteOutcome> {
  const grants = await transaction(async (tx) => {
    // LOCK ORDER, AND IT MUST HAPPEN BEFORE bound(). The first draft put the
    // ordered locks in the body, below bound() -- which was inert, because
    // bound() -> original() runs an unqualified FOR UPDATE over
    // `sessions INNER JOIN users` and takes the users row first. Measured on
    // postgres:18.4 with TWO live sessions (phone + web, the normal case): the
    // body-ordered version deadlocked a concurrent original() on the other
    // session, with the AUTH transaction as the victim -- "a sign-in that
    // fails for no reason", the exact outcome the ordering claimed to buy off.
    //
    // Learning the owner WITHOUT a lock, then taking every session of that user
    // in a deterministic order, puts this transaction on the same
    // sessions-then-users path original() uses, so no cycle exists. Measured:
    // the concurrent auth commits cleanly.
    const owner = (
      await tx.query<{ userId: string }>(
        `SELECT user_id AS "userId" FROM sessions WHERE id=$1`,
        [currentSessionId],
      )
    ).rows[0];
    if (!owner) throw new AuthFailure("account_changed");
    await tx.query(
      "SELECT id FROM sessions WHERE user_id=$1 ORDER BY id FOR UPDATE",
      [owner.userId],
    );
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
    const row = (
      await tx.query<{ appleSub: string | null }>(
        `SELECT apple_sub AS "appleSub" FROM users WHERE id=$1 FOR UPDATE`,
        [session.userId],
      )
    ).rows[0];
    if (!row) throw new AuthFailure("account_changed");
    // DELETE ... RETURNING, NOT a SELECT. A plain read under `users FOR UPDATE`
    // can be STALE: grant()'s `ON CONFLICT DO UPDATE` leaves the FK column
    // unchanged, so Postgres runs no RI check and takes no lock on the parent,
    // and a concurrent sign-in refreshes the token straight past this
    // transaction's users lock. Measured: the SELECT returned `rt-OLD` while
    // the row already held `rt-NEW`; the DELETE returns `rt-NEW`. Apple's 200
    // covers "previously invalid", so the stale revoke would have reported
    // SUCCESS while a live credential survived at Apple -- the precise outcome
    // this whole design exists to prevent. `unlink` already had the right
    // shape; this is now the same shape.
    const held = row.appleSub
      ? (
          await tx.query<AppleGrant>(
            `DELETE FROM apple_grants WHERE user_id=$1
              RETURNING client_id AS "clientId", refresh_token AS "refreshToken"`,
            [session.userId],
          )
        ).rows
      : [];
    // The attempt's own credential. Guarded on the grant's own fields rather
    // than on apple_sub, which an unlink can null between accept() and here.
    if (a.appleClientId && a.appleRefreshToken)
      held.push({
        clientId: a.appleClientId,
        refreshToken: a.appleRefreshToken,
      });
    const deleted = await tx.query("DELETE FROM users WHERE id=$1", [
      session.userId,
    ]);
    if (!deleted.rowCount) throw new AuthFailure("account_changed");
    return held;
  });
  // AFTER the commit. The account is gone and cannot come back, so this call
  // can only add latency. The try/catch is what makes the comment true: the
  // type says Promise<boolean>, which cannot forbid a rejection, and any
  // injected revoker can reject.
  let appleRevoked = false;
  try {
    appleRevoked = await revokeApple(grants);
  } catch {
    console.warn(JSON.stringify({ event: "apple_revoke_threw" }));
  }
  return { outcome: "deleted", appleRevoked };
}
```

**Any throw from the transaction propagates, and that is deliberate.** The route
must not catch it into a success. Apply the same `try/catch` to `unlink`'s
revoke call in Task 2 (finding N3).

- [ ] **Step 7: Add the route action**

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

- [ ] **Step 8: Run the tests and watch them pass**

```bash
cd app && pnpm test --project integration -- attempts.integration frontDoorRoutes
```

Expected: PASS, the ten tests in Steps 2 and 3.

- [ ] **Step 9: Commit, then run the three mutations that must bite**

```bash
git rev-parse --show-toplevel
git add app/server/auth/ app/shared/auth.ts
git commit -m "Delete an account: reauth through the delete purpose, every session locked first"
```

Each mutation, with what its failure said, goes in the PR body:

1. **Lock order.** Move the `SELECT ... FROM sessions ... ORDER BY id FOR UPDATE`
   to *after* `bound()`. The two-session deadlock test must fail with
   `40P01 deadlock detected`. **If it passes, the test is seeding one session
   and is decoration — fix the test, not the mutation.**
2. **Stale grants.** Change the `DELETE ... RETURNING` back to
   `SELECT ... FROM apple_grants`. The B5 test must fail, reporting `rt-OLD`.
3. **Fatal write.** Remove the `if (!deleted.rowCount) throw`. The B4 trigger
   test must fail.
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

- [ ] **Step 4b: Give the delete purpose its own failure surface (finding N9)**

The web callback's failure redirect carries the purpose, and
`frontDoorRoutes.ts`'s `callback()` carries a comment recording that
`SignInMethods` renders nothing unless the purpose is `"link"` — the comment
exists to document that exact defect being fixed for links. A delete inherits
the silent bounce unless its purpose is handled too.

`linkNotice()` in `SignInMethods.tsx` returns `null` for
`view.purpose !== "link"`. Widen its guards to `"delete"` and give the delete
case its own wording, so a failed delete reauth says so instead of returning the
rower to a screen that looks like nothing happened:

```tsx
if (view.kind === "error" && view.purpose === "delete") {
  return (
    <p className="notice auth-notice-error" role="alert">
      We couldn&apos;t confirm it was you, so nothing was deleted. Try again.
    </p>
  );
}
```

Test it: a `delete`-purpose error view must render an alert, not `null`.

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

- `ROADMAP.md`: **do NOT "correct eight to twelve".** An earlier draft of this
  plan said to, and it was wrong — the row was already corrected on 2026-09-13
  and now reads "**ELEVEN** FKs cascade from `users`, not eight", which is
  accurate (`grep -c 'references(() => users.id, { onDelete: "cascade" })'`
  → 11). Eleven and twelve are both right about different things: eleven FKs
  cascade *directly*, and `auth_attempts` reaches the count of twelve
  *transitively* through `sessions`. **Add the transitive fact; do not touch the
  eleven.** Give every row this PR touches a
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
