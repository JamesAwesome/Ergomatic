# Library Converge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seed's swap-or-noop with a three-way converge by title, so content-only library edits reach deployed DBs and surviving workouts keep their log links.

**Architecture:** Two new global-scoped store methods (`updateGlobal`, `deleteGlobalsByIds`) with the same structural `user_id IS NULL` guarantees as the existing global methods, then `seedGlobalLibrary` diffs code vs DB by title inside its existing advisory-locked transaction: update changed, insert missing, delete removed. `deleteGlobals()` (delete-all) retires — the converge subsumes it.

**Tech Stack:** Existing server stack (Express 5, Drizzle/Postgres, Vitest, Testcontainers for real contract/integration suites). `node:util`'s `isDeepStrictEqual` for steps comparison.

**Spec:** `docs/superpowers/specs/2026-08-04-library-converge-design.md` — read it first.

## Global Constraints

- Worktree: `.claude/worktrees/library-converge` (branch `library-converge`, hooks verified 2026-08-04). `git rev-parse --show-toplevel` before EVERY commit. All pnpm commands in `<worktree>/app/`.
- Contract-test rule (docs/TESTING.md): fake and real suites run the SAME case list in `app/server/stores/contracts/storeContracts.ts`; the fake lives in `app/server/testing/fakes.ts`. The real suite shares one Postgres across cases — assert with before/after deltas, never absolute counts.
- Content equality (spec): parsed deep-equal on `(type, difficulty, pain, sortOrder, steps)` — `isDeepStrictEqual` for steps, never string comparison (Postgres jsonb canonicalizes key order; a string compare would phantom-mismatch every boot).
- TDD: failing test first, every task. Per-file coverage on `seed.ts` and `stores/workouts.ts` — every branch of the three-way diff exercised.
- pnpm only, ESM only, server imports use `.js` extensions.
- No `app/src/` changes expected ⇒ no e2e run required; if anything under `app/src/` ends up touched, `pnpm e2e` becomes mandatory (repo recurring failure #1).

---

### Task 1: Global-scoped store methods

**Files:**
- Modify: `app/server/stores/workouts.ts` (add two methods; `inArray` joins the drizzle imports)
- Modify: `app/server/testing/fakes.ts` (mirror both on the fake)
- Test: `app/server/stores/contracts/storeContracts.ts` (two new shared cases)

**Interfaces:**
- Produces: `updateGlobal(id: string, input: WorkoutInput & { sortOrder: number })` → updated row with `isGlobal`, or `null` when `id` is not a global row. `deleteGlobalsByIds(ids: string[]): Promise<void>` — deletes exactly those global rows; `[]` is a no-op with no SQL round-trip. Task 2's converge consumes both.

- [ ] **Step 1: Write the two failing contract cases** — append inside the `workouts` describe block in `storeContracts.ts`, after the `deleteGlobals` case (which Task 2 retires — leave it alone for now):

```ts
      // Library-converge (2026-08-04 spec): the converge's update primitive.
      // Global-scoped and MAY write sortOrder — the exact inverse of the
      // user-scoped update()'s guarantees. A personal id must be
      // structurally unreachable.
      it("updateGlobal rewrites a global's content and sortOrder, and cannot touch a personal row", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const g = await stores.seedGlobalWorkout(
          workoutInput({ title: "Converge Me" }),
        );
        const personal = await stores.workouts.create(
          userId,
          workoutInput({ title: "Mine, Unmoved" }),
        );

        const updated = await stores.workouts.updateGlobal(g.id, {
          ...workoutInput({
            title: "Converge Me",
            difficulty: "hard",
            pain: 5,
          }),
          sortOrder: 7,
        });
        expect(updated).toMatchObject({
          id: g.id,
          title: "Converge Me",
          difficulty: "hard",
          pain: 5,
          sortOrder: 7,
          isGlobal: true,
        });

        const stolen = await stores.workouts.updateGlobal(personal.id, {
          ...workoutInput({ title: "Stolen" }),
          sortOrder: 1,
        });
        expect(stolen).toBeNull();
        expect(await stores.workouts.get(userId, personal.id)).toMatchObject({
          title: "Mine, Unmoved",
          isGlobal: false,
        });
      });

      // Library-converge: the converge's targeted delete. [] must be a
      // no-op, and a personal id in the list must be ignored, not deleted.
      it("deleteGlobalsByIds removes exactly the named globals, no-ops on [], ignores personal ids", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const before = await stores.workouts.countGlobals();
        const [doomed, spared] = await stores.workouts.createMany(null, [
          workoutInput({ title: "Doomed Global" }),
          workoutInput({ title: "Spared Global" }),
        ]);
        const personal = await stores.workouts.create(
          userId,
          workoutInput({ title: "Mine, Not Yours" }),
        );

        await stores.workouts.deleteGlobalsByIds([]);
        expect(await stores.workouts.countGlobals()).toBe(before + 2);

        await stores.workouts.deleteGlobalsByIds([doomed.id, personal.id]);
        expect(await stores.workouts.countGlobals()).toBe(before + 1);
        const titles = (await stores.workouts.listGlobals()).map(
          (g) => g.title,
        );
        expect(titles).toContain("Spared Global");
        expect(titles).not.toContain("Doomed Global");
        expect(spared.id).toBeTruthy();
        expect(await stores.workouts.get(userId, personal.id)).toMatchObject({
          title: "Mine, Not Yours",
        });
      });
```

(If `seedGlobalWorkout` in this file's helpers returns void rather than the row, seed via `createMany(null, [...])[0]` instead — match how the neighbouring `deleteGlobals` case obtains rows.)

- [ ] **Step 2: Run the fake suite to verify both fail**

Run: `pnpm vitest run server/stores/contracts/contracts.fake.test.ts`
Expected: FAIL ×2 — `stores.workouts.updateGlobal is not a function`, `deleteGlobalsByIds is not a function`.

- [ ] **Step 3: Implement in the real store** — `app/server/stores/workouts.ts`, after `deleteGlobals()`; add `inArray` to the existing `drizzle-orm` import:

```ts
    // Seed-converge only (see app/server/seed/seed.ts): a global-scoped
    // update that MAY write sortOrder — the exact inverse of update()'s
    // guarantees above. `user_id IS NULL` scoping makes a personal row
    // structurally unreachable, same technique as update()'s inverse.
    async updateGlobal(id: string, input: WorkoutInput & { sortOrder: number }) {
      const [row] = await db
        .update(workouts)
        .set({
          title: input.title,
          type: input.type,
          difficulty: input.difficulty,
          pain: input.pain,
          steps: input.steps,
          sortOrder: input.sortOrder,
          updatedAt: new Date(),
        })
        .where(and(isNull(workouts.userId), eq(workouts.id, id)))
        .returning();
      return row ? withIsGlobal(row) : null;
    },

    // Seed-converge only: removes exactly the given global rows. [] is a
    // no-op without a database round-trip. Personal ids are ignored by the
    // `user_id IS NULL` scope, never deleted.
    async deleteGlobalsByIds(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await db
        .delete(workouts)
        .where(and(isNull(workouts.userId), inArray(workouts.id, ids)));
    },
```

- [ ] **Step 4: Mirror on the fake** — `app/server/testing/fakes.ts`, after the fake `deleteGlobals`:

```ts
    // Mirrors the real store's updateGlobal: globals bucket only, sortOrder
    // writable, personal rows unreachable (they live in byUser).
    async updateGlobal(id: string, input: NewWorkoutInput & { sortOrder: number }) {
      const row = globals.get(id);
      if (!row) return null;
      Object.assign(row, {
        title: input.title,
        type: input.type,
        difficulty: input.difficulty,
        pain: input.pain,
        steps: input.steps,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      });
      return withIsGlobal(row);
    },
    // Mirrors deleteGlobalsByIds: targeted, [] no-op, personal ids ignored.
    async deleteGlobalsByIds(ids: string[]) {
      for (const id of ids) globals.delete(id);
    },
```

(Match the fake file's existing typing idiom — it casts the returned object, so add the two methods inside that object literal; adjust parameter types to whatever the neighbouring fake methods use.)

- [ ] **Step 5: Run fake suite** — `pnpm vitest run server/stores/contracts/contracts.fake.test.ts` → PASS (all cases).

- [ ] **Step 6: Run real suite** — `pnpm test --project integration` (Testcontainers boots its own Postgres; Docker must be running) → the contracts.real file passes with both new cases.

- [ ] **Step 7: Gates + commit**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Then: `git rev-parse --show-toplevel` (must print the worktree), `git add app/server/stores/workouts.ts app/server/testing/fakes.ts app/server/stores/contracts/storeContracts.ts && git commit -m "feat: global update and targeted delete — the converge's two hands"`

### Task 2: The converge + headline tests + docs

**Files:**
- Modify: `app/server/seed/seed.ts` (converge; header comment rewrite; library injection seam)
- Modify: `app/server/stores/workouts.ts` + `app/server/testing/fakes.ts` + `app/server/stores/contracts/storeContracts.ts` (retire `deleteGlobals` + its contract case)
- Test: `app/server/seed/seed.integration.test.ts` (headline + insert/delete/idempotency cases; update swap-era assertions)
- Modify: `ROADMAP.md` (the Phase 6E reconcile-gap sentence)

**Interfaces:**
- Consumes: `updateGlobal(id, WorkoutInput & { sortOrder: number })` → row | null; `deleteGlobalsByIds(ids: string[])` → void (both from Task 1). `LIBRARY_WORKOUTS: Array<WorkoutInput & { sortOrder: number }>` from `./library/index.js`.
- Produces: `seedGlobalLibrary(db: Db, library: Array<WorkoutInput & { sortOrder: number }> = LIBRARY_WORKOUTS): Promise<void>` — the optional second parameter is the TEST SEAM; the boot call site (`server/index.ts`) passes nothing and does not change.

- [ ] **Step 1: Write the failing integration tests** — extend `app/server/seed/seed.integration.test.ts`, matching its existing setup/helpers (read the file first; it has patterns for inserting users, logs, and running the seed). The four new cases, semantically exact (adapt helper names to the file's own):

```ts
  it("converges a content edit in place: same row id, log link intact, new content", async () => {
    await seedGlobalLibrary(db);
    const workouts = createWorkoutsStore(db);
    const target = (await workouts.listGlobals())[0]!;
    const logId = await insertLogReferencing(userId, target.id); // file's log-insert pattern

    const edited = LIBRARY_WORKOUTS.map((w) =>
      w.title === target.title
        ? { ...w, difficulty: "hard" as const, pain: 5 }
        : w,
    );
    await seedGlobalLibrary(db, edited);

    const after = (await workouts.listGlobals()).find(
      (g) => g.title === target.title,
    )!;
    expect(after.id).toBe(target.id); // the headline: same row survives
    expect(after).toMatchObject({ difficulty: "hard", pain: 5 });
    expect((await getLog(logId)).workoutId).toBe(target.id); // link intact
  });

  it("deletes a dropped title (its log link nulls) and inserts a new one", async () => {
    await seedGlobalLibrary(db);
    const workouts = createWorkoutsStore(db);
    const victim = (await workouts.listGlobals())[0]!;
    const logId = await insertLogReferencing(userId, victim.id);

    const edited = LIBRARY_WORKOUTS.filter((w) => w.title !== victim.title)
      .concat([{ ...LIBRARY_WORKOUTS[0]!, title: "Brand New Weather", sortOrder: 301 }]);
    await seedGlobalLibrary(db, edited);

    const titles = (await workouts.listGlobals()).map((g) => g.title);
    expect(titles).not.toContain(victim.title);
    expect(titles).toContain("Brand New Weather");
    const log = await getLog(logId);
    expect(log).toBeTruthy(); // row survives
    expect(log.workoutId).toBeNull(); // link nulls
  });

  it("is idempotent: a second converge from identical state writes nothing", async () => {
    await seedGlobalLibrary(db);
    const workouts = createWorkoutsStore(db);
    const before = new Map(
      (await workouts.listGlobals()).map((g) => [g.id, String(g.updatedAt)]),
    );
    await seedGlobalLibrary(db);
    const after = await workouts.listGlobals();
    expect(after).toHaveLength(before.size);
    for (const g of after) expect(String(g.updatedAt)).toBe(before.get(g.id));
  });

  it("jsonb round-trip does not cause phantom writes (steps deep-equal, not string-equal)", async () => {
    // Regression pin for the spec's equality rule: seed once, converge again
    // with the SAME library object — if the implementation compared
    // serialized steps, Postgres's jsonb key canonicalization would make
    // every row look changed and updatedAt would move.
    await seedGlobalLibrary(db);
    const workouts = createWorkoutsStore(db);
    const stamp = (await workouts.listGlobals()).map((g) => String(g.updatedAt));
    await seedGlobalLibrary(db, [...LIBRARY_WORKOUTS]);
    const stamp2 = (await workouts.listGlobals()).map((g) => String(g.updatedAt));
    expect(stamp2).toEqual(stamp);
  });
```

Also UPDATE the existing swap-era test expectations: the "swap replaces old globals" case still passes conceptually (all-titles-changed is the converge's delete+insert degenerate case) but any assertion phrased around `deleteGlobals`/"swap" comments should be reworded to converge language.

- [ ] **Step 2: Run to verify the new cases fail**

Run: `pnpm vitest run --project integration server/seed/seed.integration.test.ts`
Expected: FAIL — `seedGlobalLibrary` takes no second argument yet (TS error) / in-place case fails because the current implementation swaps (new row ids).

- [ ] **Step 3: Implement the converge** — replace `seedGlobalLibrary`'s body and header comment in `app/server/seed/seed.ts`:

```ts
import { isDeepStrictEqual } from "node:util";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import type { WorkoutInput } from "../../domain/types.js";
import { createWorkoutsStore } from "../stores/workouts.js";
import { LIBRARY_WORKOUTS } from "./library/index.js";

export const SEED_LOCK_KEY = 4021739871; // unchanged — see the comment above it

type LibraryEntry = WorkoutInput & { sortOrder: number };

// Parsed deep-equal on the content tuple. steps comes back from jsonb with
// Postgres's canonical key order — isDeepStrictEqual makes that invisible;
// a string comparison would phantom-mismatch every boot.
const contentEqual = (
  row: { type: string; difficulty: string; pain: number; sortOrder: number | null; steps: unknown },
  w: LibraryEntry,
): boolean =>
  row.type === w.type &&
  row.difficulty === w.difficulty &&
  row.pain === w.pain &&
  row.sortOrder === w.sortOrder &&
  isDeepStrictEqual(row.steps, w.steps);

/**
 * Converges the shared global library (user_id NULL rows) onto the code's
 * LIBRARY_WORKOUTS, keyed by title, inside one advisory-locked transaction:
 * content changed → UPDATE in place (row id and session-log links survive —
 * logs snapshot their own data, the FK is navigation only); title missing →
 * INSERT; title removed from code → DELETE (those log links null via
 * ON DELETE SET NULL). Identical state writes nothing. Replaces Phase 6E's
 * title-set swap, whose gap was that content-only edits never reached an
 * existing volume. Two booting replicas cannot both converge: the loser
 * observes the winner's state and writes nothing. `library` is a test seam —
 * the boot call site passes nothing.
 */
export async function seedGlobalLibrary(
  db: Db,
  library: readonly LibraryEntry[] = LIBRARY_WORKOUTS,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK_KEY})`);
    const workouts = createWorkoutsStore(tx as unknown as Db);

    const globals = await workouts.listGlobals();
    const codeTitles = new Set(library.map((w) => w.title));

    // First row per title wins; legacy duplicates (impossible via this
    // seed, defensive only) fall into toDelete with the removed titles.
    const byTitle = new Map<string, (typeof globals)[number]>();
    const toDelete: string[] = [];
    for (const g of globals) {
      if (!codeTitles.has(g.title) || byTitle.has(g.title)) toDelete.push(g.id);
      else byTitle.set(g.title, g);
    }

    for (const w of library) {
      const row = byTitle.get(w.title);
      if (row && !contentEqual(row, w)) await workouts.updateGlobal(row.id, w);
    }

    if (toDelete.length > 0) await workouts.deleteGlobalsByIds(toDelete);

    const toInsert = library.filter((w) => !byTitle.has(w.title));
    if (toInsert.length > 0)
      await workouts.createMany(
        null,
        toInsert.map((w) => ({ ...w, source: "starter" as const })),
      );
  });
}
```

Keep the existing comment block above `SEED_LOCK_KEY` (lock rationale) — it is still true.

- [ ] **Step 4: Retire `deleteGlobals`** — delete the method from `workouts.ts` and `fakes.ts`, and its contract case ("deleteGlobals empties the global library…") from `storeContracts.ts`. Grep: `grep -rn "deleteGlobals\b" app/server/` must return only `deleteGlobalsByIds` hits.

- [ ] **Step 5: Run the integration suite** — `pnpm vitest run --project integration server/seed/seed.integration.test.ts` → all cases PASS (new four + updated existing). Then the full projects: `pnpm test --project unit --project client` and `pnpm test --project integration` → green.

- [ ] **Step 6: Coverage** — `pnpm test:coverage`; per-file numbers for `seed.ts` (every diff branch: equal/changed/missing/removed/duplicate-title) and `workouts.ts` at 100% ×4 in the report.

- [ ] **Step 7: ROADMAP reconcile** — grep `ROADMAP.md` for the Phase 6E sentence describing the title-set reconcile / content-only-edit gap and rewrite it: converge-by-title (this change) closed the gap; content edits reach deployed volumes on next boot; log links survive content edits.

- [ ] **Step 8: Gates + commit**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Then: `git rev-parse --show-toplevel`, `git add -A app/server ROADMAP.md && git commit -m "feat: the seed learns to mend — converge by title, links survive"`

---

## Execution notes

- Two tasks, strictly sequential (Task 2 consumes Task 1's methods).
- Full cycle (server code): subagent implementer + task review per task, whole-branch final review, PR, James's explicit approval. Not fast-path despite the size.
- PR body must state: supersedes PR #46's reseed-dance ops note (content edits now reach the shared dev stack on rebuild alone); logs keep links across content edits; renames/removals still null links by design.
