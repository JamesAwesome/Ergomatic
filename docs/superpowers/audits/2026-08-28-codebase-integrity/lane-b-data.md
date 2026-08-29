# Lane B — Durable Data, Migrations, Auth, and API Contracts

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Status: COMPLETE — fresh high-end semantic review approved after corrections.

Lane B found one app-blocking storage defect, one native sign-out defect, and
one false replica-safety claim. Ownership, normal authenticated writes, the
committed migration sequence, seed convergence, and the deployed test-auth
boundary held. Malformed successful API bodies and raw application-invalid
JSONB remain quarantined hypotheses for the real-consumer work in Lane C.

## Authorities, subjects, and probe media

- **PRIMARY — WHATWG HTML:** the `localStorage` getter “Throws a
  `SecurityError` ... if the request violates a policy decision,” including a
  user agent configured not to persist data
  ([Web Storage §12.2.3](https://html.spec.whatwg.org/multipage/webstorage.html#dom-window-localstorage)).
  The needed attribute is access failure before any `Storage.getItem` call.
- **PRIMARY — PostgreSQL 18:** `CREATE SCHEMA IF NOT EXISTS` should “Do
  nothing ... if a schema with the same name already exists”
  ([CREATE SCHEMA](https://www.postgresql.org/docs/current/sql-createschema.html)).
  The real two-process probe, rather than that sentence alone, establishes the
  race in the installed Drizzle sequence.
- **PRODUCT — native auth:** sign-out is server `POST` “+ Keychain wipe”
  (`docs/superpowers/specs/2026-07-28-phase-3-capacitor-shell-design.md:49-51`).
- **PRODUCT — migration deployment:** migrations run at server boot, while the
  approved Phase 2 deployment is single-replica and serial
  (`docs/superpowers/specs/2026-07-27-phase-2-auth-design.md:25-32`). A later
  live library design nevertheless claims the advisory seed lock “serializes
  booting replicas” (`docs/superpowers/specs/2026-08-04-library-converge-design.md:38-39`).
- **PRODUCT — audit acceptance:** persisted values must read safely or reject
  deliberately, and the approved probes explicitly include real concurrent
  Postgres and storage failure
  (`docs/superpowers/specs/2026-08-28-codebase-integrity-audit-design.md:166-195`).
- **Subjects:** schema and migrations, SQL/JSONB stores, startup/seed order,
  browser durable values, cookie and bearer auth, serializers, and successful
  JSON readers.
- **Probe media:** existing real-Postgres integration tests; a controller-owned
  PostgreSQL 18.4 two-server boot; and temporary targeted client tests. The
  temporary tests were never staged and were deleted immediately after their
  red results.

## Durable SQL and JSONB matrix

| Shape                          | Normal writer and read boundary                                                                                                                                            | Version, ownership, and failure disposition                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`, `sessions`            | Auth stores enforce UUID identity, unique Google subject/token hash, hashed bearer storage, expiry, and rolling refresh.                                                   | User deletion cascades sessions and owned data. Real-Postgres auth lifecycle and two-user isolation passed Task 3. **CLEARED, bounded.**                                                                                                                                                                                                                                             |
| `baselines`                    | Mounted route validates numeric/source pairs; store uses an atomic upsert.                                                                                                 | Owner-scoped. Migration 0013 gives legacy rows `manual` sources and has a real upgrade test. **CLEARED, bounded.**                                                                                                                                                                                                                                                                   |
| `workouts.steps`               | Authoring and bulk routes call domain validation; seed writes the 302 globals. Reads return JSONB without revalidation.                                                    | Owner-or-global reads; personal mutation cannot reach globals. Deleting a personal workout preserves its linked log snapshot through `workout_id ON DELETE SET NULL`; deleting the user cascades the owned logs. Migration 0008 strips legacy `wu` entries and is real-tested, including `wu`-only to `[]`. Arbitrary raw application-invalid JSON remains **AUD-013 / Hypothesis**. |
| `session_logs.steps`, `series` | Log POST reconstructs validated fields and bounded series samples; detail GET returns the stored JSONB without a universal schema check.                                   | Owner-scoped; list omits both blobs. Additive migrations retain legacy nulls. Raw below-route corruption remains **AUD-013 / Hypothesis**.                                                                                                                                                                                                                                           |
| `session_logs.machine_summary` | POST accepts a plain object within 2,048 UTF-16 units and types only `verificationBytes`; detail returns the blob, while list guards `avgPaceSecondsPer500m` by JSON type. | Migration 0016 is additive and upgrade-tested. No independent installed-client field contract was found; **AUD-004 remains Hypothesis**. The historical “exactly 8 bytes” claim is superseded by the current 1–32 validator and a real 19-byte payload.                                                                                                                              |
| `plan_state`                   | Plan upsert and advancing log write share one transaction; delete locks plan state and conditionally decrements newest-first.                                              | Owner primary key and user cascade. PostgreSQL atomic upsert/read-committed behavior supports the mechanics; no contrary product authority or race was found. **CLEARED, bounded.**                                                                                                                                                                                                  |
| `preferences.difficulties`     | Mounted prefs route validates a nonempty enum subset; the store casts raw JSONB on read.                                                                                   | Owner primary key and user cascade. Raw below-route corruption remains **AUD-013 / Hypothesis**. Dormant `warmup` stays for rollback compatibility.                                                                                                                                                                                                                                  |
| `test_history`                 | Route validates owned log IDs; unique nullable `session_log_id` prevents keyed duplicates.                                                                                 | Log deletion sets the link null; user deletion cascades. Real-Postgres coverage establishes keyed conflict behavior. Keyless duplicates are intentional. **CLEARED.**                                                                                                                                                                                                                |
| `article_reads`                | Validated slug with `ON CONFLICT DO NOTHING`.                                                                                                                              | Owner composite key, idempotent mark/unmark, and user cascade. **CLEARED.**                                                                                                                                                                                                                                                                                                          |

All committed migrations 0000–0016 apply on a fresh database, and a second
migration pass is a no-op. Staged legacy-data upgrade suites cover 0008–0013
and 0016. The 0014 route integration starts from a fresh fully migrated
database, and 0015 has no staged legacy-row upgrade case; their legacy upgrade
behavior is structurally inferred, not real-upgrade-cleared. The audit found no
destructive live migration. Rollback across arbitrary partial
application/migration pairings remains outside the supported serial deploy
contract and is **DEFERRED**, not cleared by health checks.

## Browser and native durable-state matrix

| Shape                                                                         | Read/write behavior                                                                                                                     | Disposition                                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ergomatic.sessionRun`                                                        | `saveRun` catches write failure, but `loadRun` calls `localStorage.getItem` before its parse guard (`app/src/session/run.ts:129-148`).  | A policy-denied getter throws through the loader. **AUD-011 / Confirmed candidate.**                 |
| `ergomatic.sessionDraft`                                                      | Versioned shallow validation, but the first read is outside the guard (`app/src/session/draft.ts:138-152`).                             | Same independently reproduced failure. **AUD-011 / Confirmed candidate.**                            |
| `ergomatic.monitorRun`                                                        | Versioned validation and malformed-series stripping, but the first read is outside the guard (`app/src/monitor/monitorRun.ts:494-520`). | Same independently reproduced failure. **AUD-011 / Confirmed candidate.**                            |
| `ergomatic.todayPick`                                                         | `saveTodayPick` catches write failure, but `loadTodayPick` reads before its parse guard (`app/src/today/todayPick.ts:41-75`).           | Same standards-defined trigger; direct fourth-loader injection remains in Task 7. **AUD-011 scope.** |
| Builder draft, Today overrides, Library filters/scroll, pane/device selection | Access is caught or an allowlist/parser returns a bounded fallback.                                                                     | **CLEARED, bounded** for storage denial and malformed JSON.                                          |
| Diagnostic and bare clear paths                                               | Several direct reads/writes are best-effort, but not every call site was fault-injected after access revocation.                        | **DEFERRED to Task 7**; no implicit clearance from payload parsing tests.                            |
| Native bearer                                                                 | Keychain stores one opaque bearer. Native sign-out awaits the server before deleting it (`app/src/native/signin.ts:38-40`).             | Rejected transport skips deletion. **AUD-014 / Confirmed candidate.**                                |

## Authentication and authorization matrix

| Boundary                  | Evidence and disposition                                                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web OAuth                 | State plus PKCE, verified claims, admission allowlist for new subjects, and the shared user/session gate. **CLEARED structurally**; the deployed Google round-trip is external.                                                                    |
| Native sign-in            | Google JWKS, RS256, issuer, audience, then the same admission gate and bearer mint. Capacitor native HTTP is enabled, so requests are not browser-CORS fetches. **CLEARED structurally**; device/JWKS reachability remains external.               |
| Token storage and refresh | 256-bit opaque token, SHA-256 hash at rest, 60-day expiry, half-life extension, and deleted-token 401 behavior. **CLEARED** by real-Postgres integration evidence from Task 3.                                                                     |
| Cookie versus bearer      | Bearer takes precedence; an invalid bearer does not fall back to a valid cookie. Cookie refresh reissues the cookie; bearer refresh sends the expiry header. **CLEARED.**                                                                          |
| Protected routes          | One `requireUser` mount guards all durable `/api` data routes; health and auth are the deliberate exceptions. **CLEARED structurally.**                                                                                                            |
| Ownership                 | Every owned store scopes by `req.user.id`; foreign workout/log operations do not reveal or mutate the other user. The realistic two-user integration suite passed. **CLEARED.**                                                                    |
| CSRF and cookies          | Mutating ambient-cookie requests reject a foreign Origin. Bearer requests are exempt. Session cookies are `HttpOnly`, `SameSite=Lax`, production-Secure, and logout matches their attributes. **CLEARED against the approved transport contract.** |
| Server revocation         | Sign-out deletes a supplied cookie or bearer session and clears the web cookie. **CLEARED.** The native offline client ordering is AUD-014.                                                                                                        |
| Test auth                 | The backdoor mounts only with a secret. Production compose does not pass that variable; e2e compose does. **CLEARED for the declared deployment.**                                                                                                 |

## Successful JSON reader matrix

| Reader                                               | Malformed successful-body behavior                                                                                            | Disposition                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `useMe`, `useBaselines`, `usePlan`, `usePreferences` | Successful bodies are cast without runtime field validation and can enter ready/signed-in state.                              | **AUD-002 / Hypothesis**, routed to mounted consumers in Task 7.                |
| `useRecentLogs`, `useLogHistory`                     | A non-array successful body is accepted until an array consumer uses it.                                                      | **AUD-002 / Hypothesis.**                                                       |
| From-the-Log GET/PATCH                               | An unchecked log can reach the summary renderer.                                                                              | **AUD-002 / Hypothesis.**                                                       |
| `useArticleReads`                                    | Wrong `slugs` can throw into error handling or accept the wrong iterable semantics.                                           | **AUD-002 / Hypothesis.**                                                       |
| `useWorkouts`                                        | Guards the top-level array, then trusts every element.                                                                        | **AUD-002 / Hypothesis** at the element boundary.                               |
| Plan links, bulk import, create/log-create           | Wrong bodies either fall into their existing recovery path or deliberately avoid declaring an already-committed write failed. | **CLEARED for duplicate-write/crash avoidance**, not field-level compatibility. |
| Native sign-in                                       | Successful JSON is cast to `{token:string}` before Keychain storage.                                                          | **AUD-002 / Hypothesis.**                                                       |

No local TypeScript interface or shared mock was accepted as the response
contract. Additive unknown fields generally survive because consumers select
known fields; that does not establish safety for missing or wrong-typed consumed
fields.

## Controller biting probes

### Storage denial and offline native sign-out

A calibrated temporary `app/src/audit-storage-getter.test.ts` made the
standards-defined `window.localStorage` getter throw `SecurityError`. A
separate temporary case in `app/src/audit-biting.test.ts` made the native
sign-out request reject. They imported the production loaders and sign-out
function but did not inspect their stored payload fields, validators, server
serializer, or Keychain value.
The mounted confirmation temporarily added one case to
`app/src/today/Today.test.tsx` using the same getter denial and realistic ready
hook data.

Result:

```text
Calibrated storage run:
Test Files  1 failed | 149 passed
Tests       3 failed | 4032 passed

loadRun:        expected not to throw; SecurityError escaped
loadDraft:      expected not to throw; SecurityError escaped
loadMonitorRun: expected not to throw; SecurityError escaped

Separate offline sign-out case:
nativeSignOut:  expected clearToken once; observed 0 calls

Mounted Today run using the same getter denial:
Test Files  1 failed | 148 passed
Tests       1 failed | 4032 passed
Today:          rejected at loadRun during mount
```

Moving each first read inside its guard would make the storage probes pass.
Ensuring local deletion runs despite a rejected server request would make the
native probe pass. All temporary mutations were reversed with `apply_patch`; a
product path diff check was empty afterward.

### Concurrent startup

The controller started two copies of the already-built baseline server at the
same instant against one empty temporary `postgres:18.4` database. Each used a
different HTTP port and the same `DATABASE_URL`. This does not use the seed
fake, migration fixtures, or an expected value produced by Drizzle.

One server became healthy. The other exited before the seed lock:

```text
DrizzleQueryError: Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"
cause: duplicate key value violates unique constraint
       "pg_namespace_nspname_index"
code: 23505
detail: Key (nspname)=(drizzle) already exists.
```

The winner reported health and the independent database counts were 302 global
workouts and 17 migration rows. Serializing the migration stage would make both
servers become healthy; removing the concurrency would remove the trigger. Both
server processes and the explicitly named temporary database container were
stopped and removed.

The exact probe used:

```bash
docker run --rm -d --name erg-audit-migrate-task6 -p 55439:5432 \
  -e POSTGRES_PASSWORD=audit --health-cmd pg_isready \
  --health-interval 1s --health-timeout 3s --health-retries 30 postgres:18.4

# These two commands were launched concurrently in separate sessions.
DATABASE_URL=postgres://postgres:audit@127.0.0.1:55439/postgres \
  PORT=58181 TEST_AUTH_SECRET=audit-secret \
  ALLOWED_EMAILS=audit@example.test pnpm start
DATABASE_URL=postgres://postgres:audit@127.0.0.1:55439/postgres \
  PORT=58182 TEST_AUTH_SECRET=audit-secret \
  ALLOWED_EMAILS=audit@example.test pnpm start

curl -fsS http://127.0.0.1:58182/api/health
docker exec erg-audit-migrate-task6 psql -U postgres -Atc \
  "select count(*) from workouts where user_id is null; \
   select count(*) from drizzle.__drizzle_migrations;"

# After interrupting the surviving server process:
docker stop erg-audit-migrate-task6
```

Cleanup checks found no listener on ports 58181/58182, no container named
`erg-audit-migrate-task6`, and no product diff. The counts are corpus and
journal integrity checks, not independent proof that the workout content is
semantically correct.

## Candidates, unknowns, and deferred boundaries

- **AUD-011:** policy-denied durable storage blocks the default Today route and
  escapes at least four loaders — P1 / Confirmed candidate. Task 7 owns the
  remaining direct-access and cleanup census.
- **AUD-012:** the repository's booting-replica safety claim is false before the
  seed lock — P2 / Confirmed candidate. The current deploy is single-replica, so
  this is not a present rollout outage under the declared contract.
- **AUD-014:** offline native sign-out skips the required Keychain wipe — P2 /
  Confirmed candidate. Task 7 must trace the surrounding UI state.
- **AUD-002:** malformed successful API bodies — P2 / Hypothesis, deferred to
  Lane C's first real consumers.
- **AUD-004:** permissive machine-summary semantics — P2 / Hypothesis; no
  independent installed-client field contract exists.
- **AUD-013:** raw application-invalid JSONB lacks a universal read boundary —
  P2 / Hypothesis, deferred to real Postgres plus mounted consumer probes.
- The full 302-row mounted server → client import/edit/suggestion → persisted
  reload → Connect corpus path remains **DEFERRED** to Tasks 7–8. Seed count and
  API serialization do not clear the consumer boundary.

## Contradictions with testimony

- The live library-convergence design says the seed advisory lock serializes
  booting replicas. The reproduced failure occurs in Drizzle migration setup
  before that lock is acquired.
- The Phase 2 single-replica statement is accurate for today's compose deploy;
  it does not support the later broader replica-safe claim.
- A historical summary-record plan says `verificationBytes` is exactly eight
  bytes. The baseline route accepts 1–32 and the real payload is 19; the old
  sentence is superseded and cannot govern `machineSummary` compatibility.
- Successful response casts and fake/real parity describe current behavior;
  neither establishes a compatibility promise.
