# Deterministic ids for the seeded library

**Date:** 2026-09-12. **Status:** HARDENED 2026-09-12 (lens 1 = the TRIAD antagonist pass,
folded; lens 2 skipped, no prescribed blocks). Approved by James for build. **TRIAD:** yes — a stored identity. PM final-PR gate. No
design gate: nothing a rower reads or sees changes.

## What and why

Every fresh Ergomatic database gets a different id for the same 302 library
workouts, because the seed inserts rows without ids and Postgres mints
`gen_random_uuid()` for each. "Sea Fret" in CI is not "Sea Fret" on a new
deploy, which is not "Sea Fret" in a screenshots run. Nothing about the
product needs this to be true, several things quietly assume it is not, and
the fix is to have the seed decide the id from the title, so a library row
is the same row **in every database seeded from here on**. Production's
existing rows keep the ids they were minted with — see §Invariant — and stay
the one environment that differs until someone chooses to run a backfill,
which this is not.

The immediate trigger was the `recovery-read-only-*` screenshot family (six
files) rendering a library UUID that re-rolls on every fresh boot (filed in
ROADMAP by #395). That is the symptom; the property is the point.

**Brittleness class:** the derivation is DETERMINISTIC — `v5(namespace,
title)` over a value we author ourselves. No threshold, no heuristic, no
timing, no false-positive case to construct. That is the strongest thing
about the design.

## The evidence

Every claim names its command. PRIMARY = a measurement or a line of our own
source; INFERENCE = a reading.

**1. The ids differ, 300 of 300, across two fresh databases.** PRIMARY.
Commit `6773ef77` adds one integration case to
`server/seed/seed.integration.test.ts`: start a second
`PostgreSqlContainer`, migrate it, run `seedGlobalLibrary` on both, compare
`(title, id)` pairs. It fails, and the antagonist re-ran it:
`Tests 1 failed | 15 passed (16)`, a 300-row diff at `:131`.

**2. The existing "identical ids" test cannot catch this, by construction.**
PRIMARY. `seed.integration.test.ts:95` runs both seeds on ONE database; the
second finds the first's rows by title and inserts nothing. It proves
convergence is a no-op; it proves nothing about identity.

**3. The seed converges by TITLE, and an existing row's id is never
rewritten.** PRIMARY, and attacked on four paths (§Vetted ground, H1).
`seed.ts:100-124`: `byTitle` from `listGlobals()`; a present title takes
`updateGlobal(row.id, w)` whose `.set({…})` has no `id` key and whose
parameter type has no `id` field (`workouts.ts:225-235`); only an absent
title reaches `toInsert` → `createMany`; `toDelete` and `toInsert` are
disjoint by title (`seed.ts:107,118`).

**Consequence, INFERENCE from 3:** production's rows already exist, so the
first boot after this change takes update-or-no-op for every one of them.
**No production id changes. No migration.** Deterministic ids reach only
databases that lack the row: CI, screenshots, a new deploy, a rebuilt dev
DB, and any title added to the library later.

**4. `createMany` has no `id` field today.** PRIMARY,
`stores/workouts.ts:92-112`. Additive change: optional `id` on
`NewWorkoutInput`, written as a plain `id: input.id` in the `.values()` map.
**No conditional spread is needed** — measured on the repo's own
`drizzle-orm@0.45.2` via `.toSQL()`: `{id: undefined}` and a missing key
both emit `values (default, $1)`, and a mixed batch emits
`values ($1,$2), (default,$3)`. The column default is
`gen_random_uuid() NOT NULL` (`drizzle/0001_tan_thunderball.sql:57`).

**5. Titles are unique over the array the seed actually converges, and the
uniqueness is enforced by nothing at the database.** PRIMARY, corrected by
the antagonist. `seedGlobalLibrary`'s default argument is
**`GLOBAL_LIBRARY_SEED` (302 rows)**, not `LIBRARY_WORKOUTS` (300) —
`seed.ts:81`, `library/index.ts:31-40`. The two extra rows
(`onboarding.ts:18,41`) write `title: ONBOARDING_TITLES.k6` / `.k2` —
constants, invisible to a string-literal grep, which is why rev 1's "300,
no duplicates" was blind to exactly the two rows it needed. Uniqueness
over all 302 holds today only as the conjunction of three unrelated tests
(`library.test.ts:90`, `onboarding.test.ts:19,84`). The DB has no unique
index on `title` (`schema.ts:117-150`: only `workouts_user_id_idx`); the
index the whole risk model turns on is the implicit **`workouts_pkey`** on
`id` (`schema.ts:120`). G1 pins the seed-file property.

**6. Personal workouts are untouched, and no client can choose an id
today — but the gate that guarantees it is a TYPE ERROR this change
removes.** PRIMARY. `createMany(null, …)` appears once outside tests
(`seed.ts:120`); `create()` takes `userId: string` and whitelists its
columns (`workouts.ts:76-85`); `/bulk` builds from `parseBulk(text)`, never
the JSON body (`data.ts:1377-1397`). **However:** `validateWorkoutInput`
ends in a pass-through cast (`domain/validate.ts:146`), so
`{ ...validated.workout, source: "user" }` at `data.ts:1289-1292` carries
`req.body.id` at runtime today. It never lands only because `create`'s
column list omits it and `id` on `NewWorkoutInput` is currently a type
error. After this change the second guard is gone. G3 replaces it.

**7. The v5 derivation is twelve lines on `node:crypto`, and it matches the
published vector — RFC 9562, not 4122.** PRIMARY, citation corrected.
RFC 4122 is obsoleted (`Obsoletes: 4122`, RFC 9562 header) and contains no
v5 vector — its only worked example is v3/MD5. The algorithm is
**RFC 9562 §5.5**; the vector is **Appendix A.4, Figure 23**, verbatim:

```
Namespace (DNS):  6ba7b810-9dad-11d1-80b4-00c04fd430c8
Name:             www.example.com
final:            2ed6657d-e927-568b-95e1-2665a8aea6a2
```

Ours reproduces it. Under the spec's namespace,
`seedWorkoutId("Sea Fret") = 96fa2455-b89b-5c2b-81fb-6c96d412fd44`. No
`uuid` package is installed and none is added. All 302 titles are ASCII
(`grep -P '[^\x00-\x7F]'` → empty), so UTF-8 normalisation is latent, not
live.

**8. What depends on a workout id being stable, today.** PRIMARY. 23
non-test files under `src/` read `workoutId`. Two persist it in
`localStorage`: `session/draft.ts:48` and `today/todayPick.ts:16` — both
environment-local by accident. `session_logs.workout_id` is
`onDelete: "set null"` (`schema.ts:169-171`). **No hardcoded WORKOUT ids
exist:** `grep -rnE '/workout/[0-9a-f]{8}-' src/ e2e/ docs/` → no hits; a
bare uuid-shaped grep returns ~30 hits that do not count (BLE service
UUIDs, test fixtures, session ids in `docs/monitor/`).

**9. The rendered diagnostic blob's ONLY nondeterministic field is
`workoutId`.** PRIMARY, enumerated by the antagonist. `ReadOnlyRecording.tsx:19,46`
renders `JSON.stringify(run)` of the whole `MonitorRun`;
`buildRecoveryScreenshotRun` → `buildInterruptedMonitorRun`
(`screenshots.spec.ts:1074-1128,1156-1165`) sets every other field from
literals or `compileProgram` (pure numbers); `logSeed` is stripped;
`buildRun` is pure given `MONITOR_FIXED_NOW`. Nothing in the chain calls
`randomUUID`, `Math.random`, `Date.now` or `getRandomValues`. So the
captures DO go stable — a code-level proof; the artifact-level one is two
scoped `pnpm screenshots -g` runs and a `cmp`, owed at implementation.

## The design

**Invariant (the thing under test):** _Seeding an empty database produces
the same `(title, id)` set as seeding any other empty database from the
same library file._

Deliberately NOT the invariant: "a global row's id equals `v5(title)`
forever." It does not, in two cases — production rows minted before this
change keep random ids (fact 3), and `renameGlobalByTitle` keeps the row
and its id while changing the title (`seed.ts:96-98`, `workouts.ts:200`).
Both correct: identity is what the row IS, and a rename is the same row.
The id is derived at INSERT and then it is just an id. **The cost of the
weak invariant is a reachable collision (§New failure modes, F2), and G2
pays for it.**

**Mechanism, three touches:**

1. `server/seed/seedId.ts` — `seedWorkoutId(title: string): string`, RFC
   9562 v5 under the fixed namespace
   `c030fc9a-98a3-4de1-99b6-aeedcae43cd1` (minted 2026-09-12, never
   changed: changing it re-keys every future fresh database).
2. `stores/workouts.ts` — `NewWorkoutInput.id?: string`; `createMany`
   writes `id: input.id` plainly (fact 4).
3. `seed.ts` — the `toInsert` map adds `id: seedWorkoutId(w.title)`.

Nothing else changes: no schema, no migration, no client, no route.

## New failure modes this change CREATES — named, not implied

**F1. A duplicate seed title becomes a total boot failure instead of a
silent drop.** PRIMARY, demonstrated on `postgres:18.4`: two rows with one
derived id in a multi-row INSERT → `23505 on workouts_pkey`, and **the whole
statement rolls back (`rows_after = 0`)**. `createMany` inserts all 302 in
one statement (`workouts.ts:97-110`); `seedGlobalLibrary` is awaited at
`server/index.ts:51` inside a `try` that absorbs only `StoreConflictError`,
**which nothing under `server/` throws any more** (`grep -rn
StoreConflictError server/ | grep -v test` → the class and the catch, no
throw site). Today `seed.ts:107`'s "first row per title wins" drops the
duplicate silently. Loud beats silent, and this is the right trade — but
it is a trade, and G1 is what keeps it from ever firing.

**F2. The legacy-rename path can collide.** PRIMARY, mechanism demonstrated.
A row inserted under title L carries `v5(L)` forever while displaying title
C after `renameGlobalByTitle`. If L is ever re-added to the library,
`toInsert` derives `v5(L)` — the id the renamed row still holds — and
F1 fires. **Unreachable today**: `LEGACY_TITLE_RENAMES` (`domain/onboarding.ts:69-72`)
holds only `"First 6k"`/`"First 2k"`, whose rows exist only on databases
seeded BEFORE this change and so carry random ids. The design holds by
accident; G2 makes it hold by construction.

## Gates — each with the mutation that makes it bite

| # | gate | the mutation | what green-without-it would hide |
| --- | --- | --- | --- |
| **G1** | Titles distinct over **`GLOBAL_LIBRARY_SEED`**, beside `seedWorkoutId` | `ONBOARDING_TITLES.k2 = "Sea Fret"` → red | F1. Note: this mutation is GREEN under rev 1's `LIBRARY_WORKOUTS` gate — that asymmetry is the proof the array matters. |
| **G2** | `keys(LEGACY_TITLE_RENAMES)` disjoint from `titles(GLOBAL_LIBRARY_SEED)` | add `["Sea Fret","Sea Mist"]` to the map → red | F2, found by a deploy instead of a test. |
| **G3** | `POST /api/workouts` ignores a client-supplied `id` — modelled verbatim on `data.test.ts:614` ("POST ignores a client-supplied sortOrder") | add `id: input.id` to `create`'s `.values()` → red | Fact 6's hole: a user squats `v5(title)` for an unshipped title and the next library addition fails boot for everyone. |
| **G4** | Namespace pin, TWO vectors, consequence in the title: RFC 9562 A.4 (`2ed6657d-…`, proves the algorithm) AND `seedWorkoutId("Sea Fret") === "96fa2455-b89b-5c2b-81fb-6c96d412fd44"` (proves the namespace). Title: _"pins the seed-id namespace — changing it re-keys every future fresh database's library"_ | edit the namespace → second vector red, first green, so the failure NAMES its cause | One vector cannot tell "namespace edited" from "algorithm broken" (RF21). |
| **G5** | Integration, the **incremental** path: seed; add ONE title to the library; seed again; assert the new row's id is `seedWorkoutId(newTitle)` AND every pre-existing id is byte-identical | `seedWorkoutId → randomUUID()` kills the first assertion; writing `id` in `updateGlobal` kills the second | The committed two-database test proves fresh-vs-fresh only. **G5 is the only gate on the path production will ever actually take.** |

**Deciding-source mutations for the reviewer's own probe (RF22, RF35):**
`seedId.ts` → `return randomUUID()` — the two-database test fails with 300
diffs. `createMany` ignores `input.id` — same.

## Vetted ground (attacked and held, antagonist 2026-09-12)

- **H1** No production id can change — four paths closed: `updateGlobal`
  (no `id` in `.set()` or its type), `renameGlobalByTitle` (updates
  `title`/`updatedAt` only), disjoint `toDelete`/`toInsert`, duplicate-title
  (first wins, second deleted, nothing reinserted), legacy rename onto an
  existing target (the `notExists` guard at `workouts.ts:205-211` blocks it).
- **H2** The seed is the only writer of `user_id IS NULL` rows — one
  `createMany(null,…)` outside tests; no raw `insert(workouts)`; no
  migration inserts a row (`grep -rhiE "^insert" drizzle/*.sql` → empty).
- **H3** No client-chosen id can land today (fact 6) — and G3 keeps it so.
- **H4** The screenshots consequence is true (fact 9).
- **H5** `id` is never a sort or selection key that could change behaviour:
  `list()`/`listGlobals()` order by `sortOrder, createdAt, id` and every
  global row has a distinct `sortOrder` 1..302; `suggest` uses ids for
  lookup and equality only.
- **H6** The derivation is correct (fact 7).
- **H7** Drizzle emits `default`, never `NULL`, for an undefined id (fact 4).
- **H8** SHA-1 and predictability are non-issues. Index locality: a
  truncated SHA-1 is uniformly distributed like a v4; Postgres distinguishes
  only time-ordered keys, which neither is. Predictability: RFC 9562 §8,
  verbatim — _"Implementations SHOULD NOT assume that UUIDs are hard to
  guess. … they MUST NOT be used as security capabilities"_ — so no property
  we were entitled to rely on is weakened; and the rows are `user_id IS
  NULL`, read-only (`PUT`/`DELETE` → `starterReadonly`, `data.ts:1355`),
  and already listed in full to every account. One consequence worth a
  sentence: the `recovery-read-only-*` captures will carry a
  production-identical library id permanently. Public data; noted.

## What this does NOT do

- Does not rewrite production ids. That would be a migration with a
  backfill over `session_logs.workout_id`; not this.
- Does not make `title` unique at the DB. Uniqueness is pinned on the seed
  FILE (G1).
- Does not touch the six captures directly. They stop churning because
  `pnpm screenshots` boots fresh (`screenshots.sh:50`, unconditional
  `down -v`) and now seeds the same ids; recaptured once, in this PR.

## Size and ceremony

**S.** Three files plus five tests. Under `app/server/`, stored identity —
**not fast path.** Antagonist pass: DONE (this rev). PM final-PR gate owed.
No Gate 0.

## Owed elsewhere, found on the way

A stale CLAUDE.md line, owed on the next PR that touches that bullet: the
SDLC bullet says _"`e2e.sh:31` and `screenshots.sh:31` both run `docker
compose ... down` with no `-v`"_. True of `screenshots.sh`'s `cleanup()`
trap only; its boot path has been an unconditional `down -v` since #395.
