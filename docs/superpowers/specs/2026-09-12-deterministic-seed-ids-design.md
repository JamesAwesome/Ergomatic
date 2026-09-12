# Deterministic ids for the seeded library

**Date:** 2026-09-12. **Status:** DRAFT, awaiting antagonist pass and James's
approval. **TRIAD:** yes — a stored identity. Full antagonist pass on this
spec, PM final-PR gate. No design gate: nothing a rower reads or sees
changes.

## What and why

Every fresh Ergomatic database gets a different id for the same 300 library
workouts, because the seed inserts rows without ids and Postgres mints
`gen_random_uuid()` for each. "Sea Fret" in CI is not "Sea Fret" on a new
deploy, which is not "Sea Fret" in a screenshots run. Nothing about the
product needs this to be true, several things quietly assume it is not, and
the fix is to have the seed decide the id from the title so a library row is
the same row in every environment.

The immediate trigger was five screenshot captures rendering a library UUID
that re-rolls on every fresh boot (filed in ROADMAP by #395). That is the
symptom; the property is the point.

## The evidence

Every claim here names its command. Tagged PRIMARY where it is a
measurement or a line of our own source, INFERENCE where it is a reading.

**1. The ids differ, 300 of 300, across two fresh databases.** PRIMARY.
Commit `6773ef77` on branch `seed-ids` adds one integration case to
`server/seed/seed.integration.test.ts`: start a second
`PostgreSqlContainer`, migrate it, run `seedGlobalLibrary` on both, compare
`(title, id)` pairs. It fails:

```
× seeds the SAME ids on two separate fresh databases
- Expected      + Received
- "be0dbcf4-…"  + "97ec09d4-…"
- "04a02cc8-…"  + "77282e0a-…"
  … (300 rows)
```

**2. The existing "identical ids" test cannot catch this, by construction.**
PRIMARY. `seed.integration.test.ts:95` — _"running seedGlobalLibrary twice
from empty produces the identical set of global ids"_ — runs both seeds on
ONE database. The second run finds the first run's rows by title and inserts
nothing, so it passes with random ids. It proves convergence is a no-op; it
proves nothing about identity.

**3. The seed converges by TITLE, and an existing row's id is never
rewritten.** PRIMARY, `server/seed/seed.ts:100-124`:

- `byTitle` is built from `listGlobals()`; a code entry whose title exists
  takes the `updateGlobal(row.id, w)` branch — `stores/workouts.ts`'s
  `updateGlobal` `.set({…})` never includes `id`.
- Only a title absent from the DB reaches `toInsert` → `createMany`.
- `toDelete` holds titles the code dropped, or duplicate rows for one
  title. A title is never deleted and reinserted in one run.

**Consequence, INFERENCE from 3:** production's 300 rows already exist, so
on the first boot after this change the seed takes the `updateGlobal` (or
no-op) branch for every one of them. **No production id changes. No
migration.** Deterministic ids reach only databases that do not yet have the
row: CI, screenshots, a new deploy, a rebuilt dev DB, and any title added
to the library after this ships.

**4. `createMany` has no `id` field today.** PRIMARY,
`stores/workouts.ts:92-112`: the `.values()` map sets `userId, sortOrder,
title, type, difficulty, effort, source, steps` — no `id`. The change is
additive: an optional `id` on `NewWorkoutInput`, passed through when
present.

**5. Titles are unique in the seed, and NOT unique at the database.**
PRIMARY. `grep -rhoE 'title: "[^"]+"' server/seed/library/*.ts | sort |
uniq -d` returns nothing; total 300. `schema.ts:117-150`'s only index is
`workouts_user_id_idx`. So the title→id map is total over the seed, and the
uniqueness the fix relies on is a property of the seed file, not a
constraint the DB enforces — §"Gates" pins it.

**6. Personal workouts are untouched.** PRIMARY. Only `seedGlobalLibrary`
calls `createMany(null, …)`; the personal path (`POST /api/workouts`,
`/bulk`) never passes an id and keeps `defaultRandom()`. A rower who titles
their own workout "Sea Fret" gets a random id, as today. The derivation is
namespaced to the global seed and applied nowhere else.

**7. The v5 derivation is twelve lines on `node:crypto`, and it matches the
published vector.** PRIMARY. No `uuid` package is installed (`grep '"uuid"'
package.json` — none) and one is not worth adding for this. RFC 4122 §4.3:
SHA-1 over `namespace-bytes ‖ name`, version nibble set to 5, variant bits
to `10`. Checked against the RFC's own published example:

```
v5(DNS, "www.example.com") = 2ed6657d-e927-568b-95e1-2665a8aea6a2   (ours)
                              2ed6657d-e927-568b-95e1-2665a8aea6a2   (RFC)
```

**8. What depends on a workout id being stable, today.** PRIMARY census.
23 non-test files under `src/` read `workoutId`. Two persist it in
`localStorage`: `session/draft.ts:48` (the session draft) and
`today/todayPick.ts:16` (the pinned Today pick). Both are environment-local
by accident today — a draft carried between a dev DB rebuild and the next
boot points at an id that no longer exists. `session_logs.workout_id` is
`onDelete: "set null"` (`schema.ts:169-171`), so a log survives its
workout's deletion with a null link. No hardcoded ids or `/workout/<uuid>`
links exist anywhere in `src/`, `e2e/` or `docs/` (grep, no hits).

## The design

**Invariant (the thing under test):** _Seeding an empty database produces
the same `(title, id)` set as seeding any other empty database from the
same library file._

Deliberately NOT the invariant: "a global row's id equals `v5(title)`
forever." It does not, in two cases — production rows minted before this
change keep their random ids (fact 3), and `renameGlobalByTitle` keeps the
row and its id while changing the title (`seed.ts:96-98`). Both are
correct: identity is what the row IS, and a rename is the same row. The id
is derived at INSERT and then it is just an id.

**Mechanism, three touches:**

1. `server/seed/seedId.ts` — `seedWorkoutId(title: string): string`, RFC
   4122 v5 under a fixed namespace
   `c030fc9a-98a3-4de1-99b6-aeedcae43cd1` (minted once, 2026-09-12, and
   never changed: changing it changes every future fresh database's ids
   and that is the one way to break the invariant from the seed side).
   Unit-tested against the RFC vector and for determinism.
2. `stores/workouts.ts` — `NewWorkoutInput.id?: string`; `createMany`
   spreads it into `.values()` when present. Absent means `defaultRandom()`,
   exactly today's behaviour.
3. `seed.ts` — the `toInsert` map adds `id: seedWorkoutId(w.title)`.

**Nothing else changes.** No schema change, no migration, no client change,
no route change.

## What would break, and what catches it

| failure | caught by |
| --- | --- |
| Two library entries share a title | New unit test over `LIBRARY_WORKOUTS`: titles distinct. (Today `seed.ts`'s "first row per title wins" would silently drop the second's content; this makes the seed file refuse.) |
| The namespace constant is edited | The two-database integration test does not catch this (both sides use the new constant). A unit test pins `seedWorkoutId("Sea Fret")` to its literal value, so an edit fails a test that names the consequence. |
| `createMany` drops the id | The two-database test goes red — that is its red (fact 1). |
| The seed passes an id on the `updateGlobal` path | It cannot: `updateGlobal`'s `.set()` has no `id` key, and the type would refuse one. |
| A personal workout gets a derived id | `POST /api/workouts` test asserts the returned id is NOT `seedWorkoutId(title)`. |

**Mutation the reviewer's own probe should run:** change `seedId.ts` to
`return randomUUID()` — the two-database test must fail with 300 diffs.
Change `createMany` to ignore `input.id` — same. Both are the deciding
source, not a neighbour (RF22).

## What this does NOT do

- Does not rewrite production ids. If that is ever wanted it is a
  migration with a data backfill over `session_logs.workout_id`, and it is
  not this.
- Does not make titles unique at the DB. That is a separate constraint
  with its own migration; here uniqueness is pinned on the seed FILE.
- Does not touch the five screenshot captures directly. They stop churning
  as a consequence of `pnpm screenshots` booting a fresh database that now
  seeds the same ids; the captures are recaptured once, in this PR.

## Size and ceremony

**S.** Three files plus tests. Under `app/server/`, stored identity —
**not fast path.** Antagonist pass on this document (this is the TRIAD
trigger), PM final-PR gate. No Gate 0: no rower-visible surface changes.

## Open question

**Should the fix also stabilise ids for library rows added in FUTURE seed
changes?** It does, automatically — any title new to the file takes the
`toInsert` path. Recorded so nobody asks it at review. There is no open
question in the fix shape.
