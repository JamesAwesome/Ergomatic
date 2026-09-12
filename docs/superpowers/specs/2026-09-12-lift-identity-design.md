# Wave A PR 1 — lift identity out of NOT NULL

**TRIAD: stored shape (a migration on `users`), auth-adjacent.** Full
antagonist pass on this spec, PM final-PR gate on the PR, `/harden` on the
plan. No Gate 0: nothing a rower sees changes. No hardware walk.

**Revision 2, 2026-09-12** — folds the antagonist full pass (design HELD, proven by running `drizzle-kit generate` and the rollback scenario against Postgres 18.4; three spec-level corrections, §9). James ruled at PR #408's hand-back that this goes
before Phase MD PR 2. Written from
`docs/superpowers/audits/2026-09-12-wave-a-pr1-census.md` (every number carries
its command there). The ROADMAP row that scheduled it: `## Wave A`, "PR 1 IS
KNOWN AND IS INDEPENDENT OF THE POLICY DECISION" · dies 2026-09-26.

## What and why

Every Ergomatic account is keyed on one column, `users.google_sub`, and that
column is `NOT NULL`. A rower who signs in with Apple, or with an account of
our own, has nothing to be stored as — so every version of Wave A's front door
starts with the same migration, and doing it first means the policy PR is a
policy PR rather than a policy PR carrying a migration.

**This PR drops `NOT NULL` from `users.google_sub` and nothing else about the
schema.** The unique constraint stays (Postgres treats two NULLs as distinct,
so any number of sub-less rows are admitted). The user store's insert type,
today hand-written as `{ googleSub: string; … }` — RF33's exact shape, which is
why widening the column would have changed nothing the compiler could see —
derives from the schema instead, so the store can create a sub-less user and
the one id-keyed read path in the app (the session join) is gated on finding
one. No production code writes a sub-less user yet; that is the policy PR's
job. The identity-table option the ROADMAP row names is a SUPERSET of this
(census §4b: a backfill, a new unique key, two rewritten store methods, a
dual-read window and a later removal migration) and is deferred to the policy
spec, which is where the door is chosen.

Nothing a rower sees changes. Sign-in, the allowlist, `/api/me` and every test
fixture behave exactly as today.

## 1. Research pass and does-it-exist

- **Postgres owns the semantics.** PostgreSQL 18, "Constraints", verbatim
  (PRIMARY, fetched 2026-09-12): *"By default, two null values are not
  considered equal in this comparison"* and *"even in the presence of a unique
  constraint it is possible to store duplicate rows that contain a null value
  in at least one of the constrained columns."* Our constraint is recorded
  `nullsNotDistinct: false` in the current snapshot, so it admits NULLs
  unchanged. **Rollback fact, same page:** *"SET NOT NULL may only be applied
  to a column provided none of the records in the table contain a NULL value
  for the column."* So re-adding NOT NULL is safe exactly as long as no
  sub-less row exists — which, after this PR, is until the policy PR writes one.
- **Is a mechanism being invented?** No. `DROP NOT NULL` has three house
  precedents (`0002`, `0009`, `0019`); `0009`'s header is the template ("no
  data touched, no type change"); the staged pre/post migration test exists
  for ten migrations already (`schema.integration.test.ts`).
- **Does the system have the concept?** A user with no Google identity is a
  row Postgres can hold and the app cannot yet create; this PR makes the first
  true without making the second true.
- **Prior art:** the auth design (`2026-07-27-phase-2-auth-design.md`) —
  migrations are expand-only, applied at server boot, single-replica compose
  recreate, no concurrent migrators; `docs/deploy.md:66-70` the rollback floor
  (v0.16.0) and "no backup script exists".
- **Nothing found** under `docs/superpowers/research/` on identity columns.

## 2. Census (census doc §, verbatim there)

| Claim | Measured | § |
| --- | --- | --- |
| Production references to `googleSub`/`google_sub` | **4 files**: `schema.ts:20`, `auth/users.ts` (both methods), `auth/testSignin.ts:55-59`; zero in `src/`, `e2e/`, `scripts/`, the seed | 2 |
| `createUser`'s input type | hand-written `{googleSub: string; email; name}`, not `InferInsertModel` — widening the column changes nothing the compiler sees | 2 |
| Code that reads a row's `.googleSub` | **none** | 2 |
| The identity lookup | `findByGoogleSub(sub: string)` → `eq(users.googleSub, sub)`; a NULL row is unfindable there by SQL semantics | 2 |
| Session identity | `users.id` (opaque token → `sessions.user_id` join); no JWT, no sub on the wire; `/api/me` = `{id, email, name}` | 3, 7 |
| FKs targeting `google_sub` | **0** (all 11 target `users.id`) | 3 |
| Test fixtures building a user | 204 hits, every one supplies a sub; `auth/users.integration.test.ts` is 3 cases, none about NOT NULL | 2, 6 |
| Tests that go red if the column becomes nullable | **none as written** | 6 |
| A test proving a NULL-sub user is findable by id | **does not exist**; there is no `findById`; the id-keyed path is `resolveSession`'s join | 6 |
| `ALTER TABLE "users"` in any migration | **0** — the table has never been altered since `0000` | 1 |
| Next migration index | **0030** (journal tail idx 29) | 1 |
| Migration application | `server/index.ts:32`, top-level `await migrate(...)` before listen; nothing in CI or the deploy doc | 1, 8 |

## 3. The invariants this owes

1. **The schema admits a sub-less user and refuses nothing it accepted before.**
   Every insert that succeeds today succeeds after; additionally an insert with
   `google_sub = NULL` succeeds, and two of them succeed (NULLS DISTINCT).
   Gated by the staged migration test (§5).
2. **The store's insert type cannot be narrower than the column, and the sub
   cannot be omitted.** `db.insert(users).values(input)` already refuses an
   added, renamed or re-typed column under either shape (antagonist probe,
   all four cases); a WIDENED column is the one case only a derived type
   catches, and is why this PR changes the type at all. RF33 applied
   literally: the key is REQUIRED with `null` meaning absent —
   `Required<Pick<Insert, "googleSub">>` — so `createUser({ email, name })`
   does not compile (a plain `Pick` would have made it optional, which is
   RF33's failure, not its fix). This holds at the real store only:
   `testing/fakes.ts`'s `makeFakeUsers` is cast `as unknown as UserStore` and
   no unit test can go red on a store type change.
3. **A sub-less user is a user.** Created through the store, given a session,
   `resolveSession` returns `{id, email, name}` for it — the one id-keyed read
   path — and `/api/me` would serve it. Gated by a test that STARTS at
   `createUser({ googleSub: null, … })` (RF24).
4. **Nothing on the wire changes.** `/api/me`'s shape is unchanged; the client
   never sees `google_sub` (census §7). Additive-only is not engaged.
5. **Expand-only, and NOT a rollback floor — proven, not asserted.** The
   migration is catalog-only. Against Postgres 18.4 (antagonist run): after
   0030 applied, `migrate()` with the OLD 29-entry folder returns without
   error — drizzle's `pg-core/dialect.js` compares only `max(created_at)`
   and applies nothing older, never comparing hashes — and old code's insert
   (always with a sub) and select-by-sub both work against the widened
   column. So `deploy.sh`'s post-failure auto-rollback restores a working
   image. 0030 becomes a floor only when a sub-less row exists, which no code
   can yet create; the PR that creates one owns that row. Recorded where the
   floor LIVES — `docs/RELEASING.md` § Rollback constraints, as a "Not a
   floor" paragraph in the shape 0025's already has — and in the migration
   header. `docs/deploy.md`'s sentence there is a QUOTE of that table and
   has said "today v0.16.0" while the table grew six rows; this PR corrects
   it to point at the table without a number.

## 4. What changes

- `server/db/schema.ts`: `googleSub: text("google_sub").unique()` (the
  `.notNull()` goes). `drizzle-kit generate` → `drizzle/0030_<name>.sql` =
  `ALTER TABLE "users" ALTER COLUMN "google_sub" DROP NOT NULL;` plus the
  snapshot and journal entry (check open PRs for a competing 0030 first — the
  briefing's rule). Header per `0009`'s template, plus the rollback sentence
  from §3.5.
- `server/auth/users.ts`: `createUser(input: NewUser)` where
  ```ts
  type Insert = InferInsertModel<typeof users>;
  export type NewUser = Pick<Insert, "email" | "name"> &
    Required<Pick<Insert, "googleSub">>;
  ```
  (paste-tested by the antagonist under `tsc --strict`: `{googleSub: "s"}`
  and `{googleSub: null}` compile; omitting the key and passing `undefined`
  are errors). `findByGoogleSub(googleSub: string)` unchanged (compiles
  against the nullable column — probed).
- `server/testing/fakes.ts` `makeFakeUsers`: unchanged (it is cast).
- `docs/RELEASING.md` § Rollback constraints: a "Not a floor — migration
  0030" paragraph in 0025's voice (substance in §3.5; the latest tag is
  v0.45.0, so this rides the next tag — name no version). `docs/deploy.md`'s
  pointer paragraph: drop the stale "today v0.16.0" and point at the table.
- ROADMAP: the Wave A PR 1 row ticks `[x]` with the PR number; the policy row
  gains one line: "the migration landed in PR 1; the identity-table option is a
  superset (census §4b) and is priced here with the rest".

## 5. Tests — replace, don't layer

- **Staged migration test** (`schema.integration.test.ts`, the ten-suite
  convention): stage `PRE_0030_TAGS`, migrate, insert a user with `google_sub
  = NULL` through raw SQL → expect the NOT NULL violation (`23502`); migrate
  the real folder; the same insert succeeds; a second NULL-sub insert ALSO
  succeeds (pins the NULLS DISTINCT sentence); a duplicate NON-null sub still
  fails `23505`. The pre-0030 tag list is DERIVED from the real journal
  (`entries.filter(e => e.idx <= 29)`, asserted to be 30 long) rather than
  hand-typed like the ten older suites — thirty tags is where a positional
  transcription slip stops being findable by eye; a missing file still makes
  `readMigrationFiles` throw `No file … found` — loud.
  Mutation: replace the migration's statement with a VALID but WRONG one
  (`ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;`) so the
  assertion is proven to key on the right column — never an empty file,
  which drizzle would record as applied. Commit the real change first (RF22).
- **The seam test** (`auth/users.integration.test.ts` or `sessions.integration.test.ts`):
  `createUser({ googleSub: null, email, name })` → `createSession(user.id)` →
  `resolveSession(token)` returns `{ id, email, name }` equal to the created
  row; `findByGoogleSub` of any string does not return it. Mutation: change
  `resolveSession`'s join to filter `isNotNull(users.googleSub)` — red.
- **The compiler gate:** the seam test's `createUser({ googleSub: null, … })`
  IS the gate — restore `.notNull()` in the schema and `pnpm typecheck` goes
  red on that line; and one `@ts-expect-error` on `createUser({ email, name })`
  (the omitted key) that is green only while `Required<Pick<…>>` holds. (An
  excess-key probe was in revision 1 and gates nothing — both shapes reject
  it; deleted.)
- Existing suites: unchanged in what they assert; the 204 fixtures still
  supply a sub and still compile.

## 6. Exit criteria

1. `grep -n 'google_sub' app/server/db/schema.ts` → `text("google_sub").unique()` with no `notNull`; `app/drizzle/0030_*.sql` is exactly one `DROP NOT NULL`; `pnpm db:generate` produces no further diff (the snapshot is in sync).
2. `grep -n 'InferInsertModel' app/server/auth/users.ts` → 1 hit; `grep -n 'googleSub: string' app/server/auth/users.ts` → only in `findByGoogleSub`'s parameter.
3. The staged migration test and the seam test exist and both mutations in §5 are shown red; the `.notNull()`-restored typecheck failure is shown.
4. `pnpm test` (integration needs Docker), `pnpm typecheck`, `pnpm lint`; **no e2e required** — no `app/src/` file changes (verify with `git diff --name-only main`); CI's e2e job runs regardless and is read.
5. `docs/RELEASING.md` § Rollback constraints carries the "Not a floor — 0030" paragraph; the migration header carries the same sentence; `docs/deploy.md` no longer says "today v0.16.0".
6. PR body first line: what a stranger with no Google identity can now be stored as, and what still cannot create one.

## 7. Deviation from the ROADMAP row, stated (RF10)

- "`google_sub` nullable, or its own table — is the same migration whichever
  door the gate picks": the ALTER is common to both; the table is a superset
  with six more items (census §4b). This PR is the common part only.

## 8. Settled by the antagonist pass (were open in revision 1)

- `drizzle-kit generate` emits exactly one statement and a three-line snapshot diff; a re-run says "nothing to migrate"; no competing 0030 in open PRs at `deb50b77`.
- The ten staged suites cannot see idx 30; snapshots are never read at runtime (copied for consistency only).
- Rollback proven against Postgres 18.4 (§3.5).
- `Pick<InferInsertModel>` alone makes the sub optional — replaced by `Required<Pick<…>>` (§4).

## 9. What revision 2 changed, and why

- The type derivation was RF33's failure dressed as its fix (optional sub); now `Required<Pick<…>>`.
- Invariant 2 claimed a benefit the hand-written type already had; now names the one direction derivation buys (widening) and the fake's blind spot.
- The rollback record was prescribed into `deploy.md`, which only quotes RELEASING.md's table and was stale by six rows; now the table, in its own "Not a floor" shape, with the stale quote corrected.
- The excess-key `@ts-expect-error` probe deleted (gated nothing); the migration mutation is a wrong-column statement, not an empty file.
- (Folded from the PM final gate, 2026-09-12.) §5 prescribed a hand-typed 30-element `PRE_0030_TAGS` literal; the shipped test derives the list from the journal, and this section said nothing about it — the PM caught the spec-vs-code gap. Corrected above.
