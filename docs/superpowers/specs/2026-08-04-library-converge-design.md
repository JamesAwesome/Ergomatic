# Library Converge — Design

**Date:** 2026-08-04 · **Status:** approved in brainstorm, pending James's spec review
**Origin:** Phase 6E's PR (#46) shipped `seedGlobalLibrary` with title-set
reconcile semantics and a documented gap: a content-only library edit (same
titles) never reaches an existing DB volume. This closes it.

## Decision (James, 2026-08-04)

**Converge by title** — chosen over deep-compare-plus-full-swap and over a
persisted `LIBRARY_VERSION`. Grounds: session logs are self-contained
snapshots (`workout_title`, `workout_type`, `steps`, baselines, pain, notes
all stored on the log), so the `workout_id` FK is navigation only — in-place
updates cannot corrupt history, and preserving row ids preserves log links.
No version constant to remember, no schema change, no snapshot file.

## Behavior

`seedGlobalLibrary(db)` keeps its shape — one transaction, the same
`pg_advisory_xact_lock(SEED_LOCK_KEY)` — and replaces swap-or-noop with a
three-way converge of DB globals onto `LIBRARY_WORKOUTS`, keyed by title:

| Case | Action | Log links |
|---|---|---|
| Title in both, content equal | nothing | intact |
| Title in both, content differs | UPDATE the row (type, difficulty, pain, steps, sortOrder) | **intact** (same row id) |
| Title only in code | INSERT (`source: "starter"`, authored sortOrder) | n/a |
| Title only in DB | DELETE those rows | null via `ON DELETE SET NULL` |

- Identical state ⇒ zero writes (idempotency is literal, assertable).
- A title rename is delete+insert — title is identity; those links null.
  Accepted: renames are rare and deliberate.
- Duplicate titles cannot arise: the library gate enforces code-side title
  uniqueness; the DB side converges to code. If a legacy DB somehow holds
  duplicate global titles, all rows for that title fall into
  update-one/delete-rest (implementation picks deterministically; the end
  state is one row per code title).
- Replica safety unchanged: the advisory lock serializes booting replicas;
  the loser observes converged state and writes nothing.
- Boot cost: one 300-row read + deep compare — negligible.

## Content equality

Parsed deep-equal on `(type, difficulty, pain, sortOrder, steps)` — compare
structures, not serialized strings, so JSONB key-order or numeric-form
drift cannot cause phantom writes. `title` is the join key; `source` is
constant `"starter"` for globals.

## Store surface (contract-tested, fake + real, shared case list)

- `updateGlobal(id, workout: WorkoutInput & { sortOrder: number })` — global-
  scoped update that MAY write `sortOrder`. Deliberately separate from the
  user-scoped `update()`, which is structurally incapable of touching
  `user_id IS NULL` rows and hard-codes `sortOrder` ignorance (H1). Same
  structural guarantee inverted: `updateGlobal` matches only
  `user_id IS NULL` rows.
- `deleteGlobalsByIds(ids: string[])` — targeted global delete (empty array
  ⇒ no-op, no SQL round-trip required).
- `deleteGlobals()` (delete-all, shipped in 6E): retire if the converge
  leaves it unreferenced outside contracts — plan-level call; if retired,
  its contract case retires with it.
- `listGlobals()` already returns everything the diff needs.

## Testing

Failing-first, per docs/TESTING.md:

- **Contract cases** (fake + real): `updateGlobal` updates a global's
  content and sortOrder and cannot touch personal rows; `deleteGlobalsByIds`
  deletes exactly the given globals, no-ops on `[]`, and cannot touch
  personal rows.
- **Integration (seed.integration.test.ts)**, extending the existing suite:
  - The headline: seed, log a session against a global, edit that workout's
    content in a modified library array, converge — the row id is UNCHANGED,
    the log's `workout_id` still points at it, content matches the edit.
  - Insert path (code adds a title) and delete path (code drops a title —
    that log link nulls, row survives).
  - Idempotency: converge twice from identical state — second run leaves
    ids AND `updated_at` values unchanged (zero writes, not re-writes).
  - Existing swap/empty/lock tests updated to the converge semantics
    (the "old titles gone" assertions still hold — full-title-change is
    the delete+insert degenerate case, which is exactly what the 35→300
    migration was).
- Per-file coverage on `seed.ts` and `stores/workouts.ts` (repo standard:
  every branch of the three-way diff exercised).

## Docs

- `seed.ts` header comment rewritten to the converge semantics (the current
  "title-set match → no-op" text becomes wrong).
- ROADMAP's Phase 6E entry: the "known operational gap" sentence about
  content-only edits becomes "closed by the converge follow-up (this PR)".
- PR #46's reseed-dance ops note is superseded — the PR body for THIS change
  says so explicitly (the shared dev stack now picks up content edits on
  rebuild alone).

## Out of scope

- No schema changes, no version constants, no client changes, no e2e
  changes expected (seed behavior at boot only; e2e re-run still required
  by the standing rule if anything under `app/src/` is touched — it should
  not be).
- Title-rename link preservation (would need a rename map; YAGNI).

## Risks

- **Phantom-write bugs** (comparison too loose/strict): mitigated by the
  parsed deep-equal rule and the zero-writes idempotency test.
- **Global/personal boundary**: same structural technique as 6E
  (`user_id IS NULL` scoping), contract-tested on both fakes and Postgres.
- Full cycle (server code — not fast-path eligible despite the "fast
  follow" name): worktree `library-converge`, subagent implement + review,
  PR, James's explicit approval.
