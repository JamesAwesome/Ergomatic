# Wave A PR 1 — "lift identity out of NOT NULL": read-only census

Read against `/Users/james/projects/github/jamesawesome/Ergomatic` at
`eed6ce1a1783348d3fa498c6b126b4e2f90bdc1c` (`git log -1`). The brief named
`4aa3d132`; the checkout is three commits ahead and none of #400/#404, #406, #407
touches auth or the schema. Nothing written in any checkout. Claims tagged
PRIMARY (a line read this session or a quoted vendor sentence), SECONDARY, or
INFERENCE. No design proposals.

---

## 1. Schema, migrations, how they run

**The table** (`app/server/db/schema.ts:18-26`, PRIMARY):

```ts
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`ls app/drizzle/` → 30 migrations, `0000_skinny_silver_fox.sql` …
`0029_drop_difficulty_compat.sql`, plus `meta/`.
`grep -ln 'users' app/drizzle/*.sql` → `0000`, `0001`, `0004`, `0018`, `0023`,
`0029` (PRIMARY). Of those:

- `0000:11-17` is the only one touching the table itself —
  `"google_sub" text NOT NULL` plus
  `CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")`.
- `0001`, `0004`, `0018` only add FKs pointing **at** `users(id)`.
- `0023`, `0029` match on comment text only (`/api/users/me`, "five users").
- `grep -rn 'ALTER TABLE "users"' app/drizzle/*.sql` → **no hits, exit 1**. The
  table has never been altered since `0000`.

**Journal tail** (`app/drizzle/meta/_journal.json`, PRIMARY): last entry
`{"idx": 29, "version": "7", "when": 1789218488574, "tag": "0029_drop_difficulty_compat"}`.
Next index is **0030** — drizzle applies by timestamp, so check open PRs for a
competing 0030 before generating (briefing).

**Generation:** `app/package.json:25` `"db:generate": "drizzle-kit generate"`;
`app/drizzle.config.ts` = `{dialect: "postgresql", schema: "./server/db/schema.ts",
out: "./drizzle"}`. drizzle-kit `0.31.10`, drizzle-orm `0.45.2`.

**Application:** exactly one production call site. `app/server/index.ts:1` imports
`migrate` from `drizzle-orm/node-postgres/migrator`; `index.ts:32` runs
`await migrate(db, { migrationsFolder: "drizzle" })` at top level, before
`createApp` and before listening. `grep -rn 'migrate' .github docs/deploy.md
app/package.json` → **zero hits** (PRIMARY): nothing in CI or the deploy doc
applies migrations. Matches the auth design (§"Data model", PRIMARY):
_"Migrations are applied on server boot via drizzle-orm's migrator (natalie
pattern) so deploys stay zero-touch."_

**Migration TEST convention — yes, and specific.**
`grep -rln 'drizzle\|migrat' app/server --include='*.test.ts'` → 25 files, most
merely calling `migrate(db, {migrationsFolder: "drizzle"})` in `beforeAll`
against `PostgreSqlContainer("postgres:18.4")`. The real convention is in
`app/server/db/schema.integration.test.ts`: for each behaviour-bearing migration
it `mkdtemp`s a **staged folder**, copies only `PRE_000N_TAGS` `.sql` +
`meta/NNNN_snapshot.json`, rewrites `_journal.json` filtered to `e.idx <= N-1`,
migrates, seeds a row against the OLD schema, then migrates the real folder and
asserts. Staged suites exist for 0008, 0009, 0010, 0011, 0012, 0013, 0016, 0018,
0021, 0024 (users seeded as `googleSub: "pre-000N-user"` / `"post-000N-user"`);
`routes/source.integration.test.ts:375,422` stages 0020 the same way.

**Precedent for this exact DDL** (PRIMARY):
`grep -rn 'DROP NOT NULL' app/drizzle/*.sql` → `0002:3` (`workouts.num`),
`0009:15-16` (`session_logs.held`, `.pain`), `0019:24` (`workout_type`).
`0009`'s header is the house template: _"All three changes are
additive/loosening: `held`/`pain` DROP NOT NULL only — no data touched, no type
change."_ `0020:43` is the reverse (`backfill → SET NOT NULL`).

---

## 2 & 3. Every reader/writer of `googleSub`/`google_sub`, and the sign-in flow

`grep -rn 'googleSub\|google_sub' app --include='*.ts' --include='*.tsx'
--include='*.sql' --include='*.json' | grep -v node_modules` → 208 lines.
**Zero hits under `app/src`, `app/e2e`, `app/scripts`, or non-test
`app/server/seed/`.** Production is four files.

| Site | What it does | Under `string \| null` |
|---|---|---|
| `server/db/schema.ts:20` | the column | the one line that changes |
| `server/auth/users.ts:7-13` | `findByGoogleSub(googleSub: string)` → `select().from(users).where(eq(users.googleSub, googleSub))`, `rows[0] ?? null` | unchanged. `eq(col, nonNull)` never matches a NULL row (SQL `= NULL` is UNKNOWN), so a sub-less user is simply unfindable here |
| `server/auth/users.ts:14-21` | `createUser(input: {googleSub: string; email: string; name: string})` → plain `db.insert(users).values(input).returning()`. **Not** `onConflictDoUpdate`: `grep -rn 'onConflict' app/server --include='*.ts' \| grep -v test` finds nine conflict inserts, **none on `users`** | **RF33 flag: the input interface is HAND-WRITTEN, not `InferInsertModel<typeof users>`.** Widening the column forces no compiler change here, so the compiler cannot gate this PR |
| `server/auth/testSignin.ts:55-59` | e2e backdoor: `` const googleSub = `test:${email}` `` then find-or-create | unchanged; always supplies a sub |

**No production code reads `.googleSub` off a row.** The only property
occurrences are the column reference at `users.ts:11` and the literals passed to
`createUser` (INFERENCE, from the exhaustive grep above — it contains no
`user.googleSub`/`row.googleSub`).

### Sign-in end to end (PRIMARY)

`server/auth/signin.ts:23-54` is the single gate, and says so:
_"The single gate sequence shared by web callback and native sign-in:
email_verified -> existing-sub upsert | allowlist -> create -> sweep -> mint."_

1. `:27` `claims.emailVerified !== true` → `{outcome:"denied"}`.
2. `:30` `findByGoogleSub(claims.sub)` — **the only identity lookup in the app.**
   Hit → `updateProfile(user.id, email, name)`.
3. `:34` miss → `isAllowed(allowlist, claims.email)` (email-keyed, §5), else
   `createUser({googleSub: claims.sub, ...})`.
4. `:47-48` `sweepExpired()` then `createSession(user.id)`.

Callers: `auth/routes.ts:81` (web `/api/auth/callback`; denied → `res.redirect(
'/?denied=' + email)` at `:87`) and `routes.ts:122` (`POST /api/auth/native`;
denied → `403 {error:"denied", email}` at `:127`).

**The session carries `users.id`, never the sub, and there is no JWT.**
`sessions.ts:32-41` `createSession(userId)` inserts
`{tokenHash: sha256(token), userId, expiresAt}`; the cookie/bearer value is an
opaque `randomBytes(32)` and the DB row is the authority. `sessions.ts:43-67`
joins `sessions → users ON sessions.user_id = users.id` and returns
`{id, email, name}` — `google_sub` is inside the selected row and never read out.
`middleware.ts:132` sets `req.user`; `routes.ts:148` `GET /api/me` returns it.

**Does anything treat "no google_sub" as "no user"?** Only `findByGoogleSub`
returning `null`, which is a *lookup miss*, not a row property. No code branches
on a row's `googleSub` value (PRIMARY, from the grep + the four files).

**`users.id` is minted by Postgres** (`gen_random_uuid()`, schema.ts:19 /
0000.sql:11), returned via `.returning()`.

**Everything else references `users` by `id`.** `grep -n 'references'
app/server/db/schema.ts` → 11 hits, all
`.references(() => users.id, {onDelete: "cascade"})` (lines 35, 102, 123, 166,
449, 464, 508, 544, 570, 691) — sessions, workouts, baselines, plan_state,
preferences, session_logs, test_history, article_reads, concept2_links,
concept2_auth_attempts. **No FK anywhere targets `google_sub`.**

### Tests and fixtures (204 hits) — all build a user by hand, with a sub

Three shapes: `createUserStore(db).createUser({googleSub: "<literal>", ...})`
(the bulk — `stores/stores.integration.test.ts` ~60, `stores/concept2.integration.test.ts`
~20, `seed/seed.integration.test.ts` 9, `db/domainSchema.integration.test.ts` 7,
`stores/contracts/contracts.real.integration.test.ts` 3,
`auth/users.integration.test.ts` 5); `db.insert(users).values({...})`
(`auth/sessions.integration.test.ts:27,81`, `db/schema.integration.test.ts` ~20);
and raw SQL (`db/schema.integration.test.ts:1812`,
`routes/source.integration.test.ts:383` —
`insert into users (google_sub, email, name) values ('mig-sub', …)`).

Unit fakes: `server/testing/fakes.ts:1220-1227` `makeFakeUsers` returns
`{findByGoogleSub: vi.fn(async () => null), createUser: vi.fn(async () => null),
updateProfile}` **cast `as unknown as UserStore`** — and
`auth/testSignin.test.ts:107-111` documents the quirk: _"`findByGoogleSub`'s real
return type infers as never-null"_. `auth/routes.test.ts:9-15` and
`auth/native.test.ts:10` build a literal `baseUser` including `googleSub: "s1"`.

---

## 4. Postgres facts for the two options, sourced

### (a) `ALTER COLUMN google_sub DROP NOT NULL`, UNIQUE kept

PRIMARY — PostgreSQL 18 docs, "Constraints" (`/docs/18/ddl-constraints.html`),
fetched 2026-09-12, verbatim:

> "In general, a unique constraint is violated if there is more than one row in
> the table where the values of all of the columns included in the constraint are
> equal. **By default, two null values are not considered equal in this
> comparison.**"
>
> "That means even in the presence of a unique constraint it is possible to store
> duplicate rows that contain a null value in at least one of the constrained
> columns."
>
> "This behavior can be changed by adding the clause `NULLS NOT DISTINCT` … The
> default behavior can be specified explicitly using `NULLS DISTINCT`."

So `users_google_sub_unique` admits **unboundedly many NULL rows** once NOT NULL
is dropped, and needs no change itself.

**What drizzle emits.** `.unique()` takes an optional config
(`node_modules/drizzle-orm/pg-core/columns/common.d.ts:46`:
`unique(name?: string, config?: {...})`) and drizzle models the flag —
`pg-core/unique-constraint.d.ts:10,22` declare `nullsNotDistinct(): this` and
`readonly nullsNotDistinct: boolean`. The current snapshot already records
`"users_google_sub_unique": {"nullsNotDistinct": false, "columns": ["google_sub"]}`
(`app/drizzle/meta/0029_snapshot.json:938-943`) — NULLS DISTINCT today, the
behaviour the quote describes. INFERENCE (not run: `drizzle-kit generate` writes
files and this task is read-only): removing `.notNull()` flips only the column's
`notNull` in the snapshot and emits one
`ALTER TABLE "users" ALTER COLUMN "google_sub" DROP NOT NULL;`, identical in
shape to `0002:3` and `0009:15-16`.

**Lock/scan.** PRIMARY (`/docs/18/sql-altertable.html`) documents no scan for
DROP NOT NULL; the page's general rule is _"An ACCESS EXCLUSIVE lock is acquired
unless explicitly noted"_ — INFERENCE that DROP NOT NULL takes ACCESS EXCLUSIVE
for a catalog update with no rewrite. Prod `users` row count is **UNMEASURED**
(no DB access from here).

**Rollback for (a).** PRIMARY, same page:

> "**SET NOT NULL may only be applied to a column provided none of the records in
> the table contain a NULL value for the column.** Ordinarily this is checked
> during the ALTER TABLE by scanning the entire table … if a valid CHECK
> constraint exists … which proves no NULL can exist, then the table scan is
> skipped."

**Re-adding NOT NULL is safe only while no NULL row exists.** The moment one
sub-less user is written, the rollback DDL fails and the pre-PR schema is
unreachable without deleting that rower. Repo context: the auth design's standing
constraint (PRIMARY) is _"migrations must be expand-only — never destructive
(drop/rename) in the same deploy as the code depending on them. The CD rollback
reverts CODE but not SCHEMA"_; `docs/deploy.md:66-70` carries a rollback FLOOR
(_"a version you must never roll back past — today v0.16.0"_) and states
_"no backup script exists in this repo yet (roadmap Wave B)"_.

### (b) `identities(user_id, provider, subject)` — cost list, not a recommendation

1. New table: `id` uuid pk, `user_id uuid NOT NULL REFERENCES users(id) ON DELETE
   CASCADE` (the eleven-site house convention), `provider` (text or a new
   `pgEnum` — itself a stored shape), `subject` text NOT NULL, `created_at`.
2. `UNIQUE (provider, subject)` as the new identity key, plus presumably a
   `user_id` index (house pattern: `sessions_user_id_idx`, `0000.sql:20`).
3. A **backfill** in the migration (`INSERT INTO identities … SELECT id,
   'google', google_sub FROM users`) — data-moving, which `0009`'s header
   explicitly contrasts with (a) (_"no data touched"_).
4. Rewrites of `findByGoogleSub` (provider-keyed join) and `createUser`
   (two-statement, transactional). Callers are only `signin.ts:30,37` and
   `testSignin.ts:57,59`.
5. Expand-only means `users.google_sub` **cannot drop in the same deploy** — so
   (b) is (a)'s ALTER *plus* a table *plus* a dual-write/read window *plus* a
   later removal migration and its own ROADMAP row (RF29).
6. Every hand-built test user in §2's 204 fixture lines becomes a two-row seed,
   or `createUser` keeps hiding it — a choice, not a given.

**Rollback for (b)** — dropping the new table is safe only while `users.google_sub`
is still populated and authoritative; once identities is the source of truth and a
non-Google identity exists, that rower is lost on rollback. Same failure mode as
(a)'s, arriving one deploy earlier.

---

## 5. What else assumes exactly-one-Google-identity

- **The allowlist is keyed on EMAIL, not sub** (PRIMARY,
  `server/auth/allowlist.ts:1-12`): `parseAllowlist` splits/trims/lowercases
  `ALLOWED_EMAILS` into a `Set<string>`; `isAllowed` is a `Set.has`. Untouched by
  the column change — but it means email does identity-ish work at the door while
  `google_sub` does it in the table.
- `server/index.ts:87-91` (PRIMARY): `parseAllowlist(process.env.ALLOWED_EMAILS)`,
  and on `size === 0` a `console.warn("WARNING: ALLOWED_EMAILS is empty — nobody
  can create an account")`. Warning only; boot continues. The auth design states
  the policy: _"missing/empty var = nobody can sign up (deny by default)"_
  (PRIMARY, Decisions table).
- **No admin/ops script lists users by sub.** `grep -rn 'google_sub\|googleSub\|
  insert into users' app/scripts docs/deploy.md` → **zero hits** (PRIMARY).
- **The seed creates no users.** `grep -rn 'users' app/server/seed/*.ts`
  (non-test) → zero hits; `signin.ts:43-46` says there is no per-user seeding at
  sign-in, the library being _"a global, shared, read-only set"_.
- **Deploy doc:** `docs/deploy.md:101` `ALLOWED_EMAILS=…`, `:118`
  _"`ALLOWED_EMAILS` changes take effect on container recreate, not live."_
  `C2_ALLOWED_EMAILS` (`:134-150`) uses the same parser for a separate surface.
- **Two different `users/me`:** every `/api/users/me` hit under
  `server/concept2/` is **Concept2's** API. Ours is `/api/me`
  (`auth/routes.ts:148`). Do not conflate them.

---

## 6. Existing gates — and the one that does not exist

Real-Postgres auth suites (testcontainers `postgres:18.4`):
`auth/users.integration.test.ts`, `auth/sessions.integration.test.ts`,
`auth/native.integration.test.ts`. Fake/unit: `routes.test.ts`, `native.test.ts`,
`testSignin.test.ts`, `middleware.test.ts`, `sessions.test.ts`,
`allowlist.test.ts`, `cookies.test.ts`, `google.test.ts`. **There is no
`signin.test.ts`** — `signin.ts` is covered only through `routes.test.ts` and
`native.test.ts`.

`auth/users.integration.test.ts` is the whole direct gate on the user store:
three cases (`:29` unknown sub → `null`; `:33` create then find by sub; `:52`
`updateProfile` scoped to one user). **None asserts NOT NULL, none asserts a
unique violation, none inserts without a sub.**

**Which tests go red if `google_sub` becomes nullable? None, as written.** Every
fixture supplies a sub; the store's `createUser` input interface is hand-written
so nothing widens under it; no assertion reads a row's `googleSub`. The only type
that widens is `typeof users.$inferSelect["googleSub"]` → `string | null`, and
nothing dereferences it. (INFERENCE from the exhaustive grep; not confirmed by
running `pnpm typecheck` against a modified schema, which needs a write.)

**The test proving a user row can exist with `google_sub = NULL` and be found by
`id`: it does not exist.** Nothing in `app/server` inserts a user without a sub,
and **there is no `findById`** — `findByGoogleSub` is the store's only user
lookup. The one id-keyed read path in the app is `resolveSession`'s
`sessions.user_id` join (`sessions.ts:48`); that join is the seam an RF24-shaped
gate would have to start above.

---

## 7. API additivity

`grep -rn 'googleSub\|google_sub' app/src` → **zero hits** (PRIMARY). The client
never sees the column.

The wire shape is `{user: {id, email, name}}`: `routes.ts:148` returns
`req.user`, set at `middleware.ts:132` from `sessions.ts:63`'s
`{id, email, name}`. Client type matches exactly — `src/useMe.ts:4-8`
`interface Me { id: string; email: string; name: string }`, consumed by
`src/App.tsx:8`, `src/You.tsx:3`, `src/shell/AppRoutes.tsx:40`. **PR 1 changes no
wire field, so additive-only is not engaged; a null sub renders nothing because
nothing renders the sub.**

---

## 8. Deployment

`.github/workflows/ci.yml:193-225`: the `deploy` job (`needs: [changes,
root-hooks, app, docker, e2e, scripts]`, gated on push to `refs/heads/main` and
`!contains(needs.*.result, 'failure')`) does one thing —
`ssh … "$DEPLOY_USER@$DEPLOY_HOST" "$SHA"`, a forced command. No migration step.

Host side, `scripts/deploy.sh` (PRIMARY): refuses a dirty checkout (`exit 3`),
records `PREV="$(git rev-parse HEAD)"`, `git checkout --force "$SHA"`, then
`docker compose up -d --build --wait --wait-timeout 120 --remove-orphans`, with
an `ERR` trap that checks `PREV` back out and re-ups.

**Ordering: the migration runs INSIDE the new binary, after its container starts
and before it serves.** `index.ts:32` is a top-level `await migrate(...)` reached
before `createApp`/`listen`, so compose's `--wait` health gate cannot pass until
migrations have applied. Compose recreates the `api` service, so the old binary is
stopped before the new one boots — no window where old code meets the new schema.
The auth spec says the same: _"Concurrent migrators are impossible in this deploy
model (single-replica compose recreate, serial deploy.sh)"_ (PRIMARY).

**What NOT NULL → nullable does to a running old binary: nothing.** (1) On prod
no such binary exists — recreate stops it first. (2) Even if one did: old code's
only write to `users` is `createUser`'s insert, which always supplies
`google_sub` (a value a nullable column still accepts), and its only reads are
`SELECT *` and `WHERE google_sub = $1`, neither depending on the constraint.
Dropping NOT NULL widens what the table accepts and narrows nothing — the
expand-only property the spec requires. (INFERENCE from those PRIMARY readings.)

**The rollback asymmetry is what deployment does not cover.** `deploy.sh` reverts
CODE only; the schema stays widened. Safe while no NULL row exists (§4); once one
does, the PR that wrote it cannot be rolled back by `deploy.sh` at all, and
`docs/deploy.md:66-70` says recovery for that class is a database backup this
repo does not have.

---

## Contradiction with the brief

The brief says PR 1 is "the same migration whichever door the gate picks". That
holds for the ALTER itself, but §4(b) lists six things "its own table" needs that
the nullable column does not: (b) is a superset of (a), not an alternative to it.
Stated, not decided.
