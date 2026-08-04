import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createDb, type Db } from "../db/index.js";
import { workouts } from "../db/schema.js";
import { createUserStore, type UserStore } from "../auth/users.js";
import { createWorkoutsStore, type WorkoutsStore } from "../stores/workouts.js";
import { createLogsStore, type LogsStore } from "../stores/logs.js";
import { seedGlobalLibrary, SEED_LOCK_KEY } from "./seed.js";
import { LIBRARY_WORKOUTS } from "./library/index.js";

describe("seedGlobalLibrary against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let users: UserStore;
  let wk: WorkoutsStore;
  let logs: LogsStore;

  // Shared by the converge tests below: creates a log referencing the given
  // workout for a fresh user (same shape as the swap test's inline
  // logs.create call, factored out since three cases below need it) and
  // returns its id.
  async function createLogFor(
    userId: string,
    workoutId: string,
    workoutTitle: string,
    workoutType: string,
  ): Promise<string> {
    const { id } = await logs.create(userId, {
      workoutId,
      workoutTitle,
      workoutType,
      baselineK2: null,
      baselineK6: null,
      held: "held",
      pain: 2,
      notes: null,
      steps: [],
      advancesPlan: false,
    });
    return id;
  }

  // logs has no get-by-id; list() (scoped per user, per stores/logs.ts) is
  // the store's own lookup pattern, reused from the swap test above.
  async function findLog(userId: string, logId: string) {
    return (await logs.list(userId, 50)).find((l) => l.id === logId);
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
    users = createUserStore(db);
    wk = createWorkoutsStore(db);
    logs = createLogsStore(db);
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("seeds all LIBRARY_WORKOUTS as global (user_id null), source starter, on a fresh DB", async () => {
    await seedGlobalLibrary(db);

    const globals = await wk.listGlobals();
    expect(globals).toHaveLength(LIBRARY_WORKOUTS.length);
    expect(globals).toHaveLength(300);
    expect(globals.every((w) => w.userId === null)).toBe(true);
    expect(globals.every((w) => w.isGlobal === true)).toBe(true);
    expect(globals.every((w) => w.source === "starter")).toBe(true);
    expect(globals.map((w) => w.sortOrder)).toStrictEqual(
      LIBRARY_WORKOUTS.map((w) => w.sortOrder).sort((a, b) => a - b),
    );
  });

  it("running seedGlobalLibrary twice from empty produces the identical set of global ids (match ⇒ no-op, no churn)", async () => {
    await db.delete(workouts);

    await seedGlobalLibrary(db);
    const idsAfterFirst = (await wk.listGlobals()).map((w) => w.id).sort();
    expect(idsAfterFirst).toHaveLength(LIBRARY_WORKOUTS.length);

    await seedGlobalLibrary(db);
    const idsAfterSecond = (await wk.listGlobals()).map((w) => w.id).sort();

    expect(idsAfterSecond).toStrictEqual(idsAfterFirst);
  });

  it("is visible to any user (new or old) via list(), without per-user seeding", async () => {
    const before = await users.createUser({
      googleSub: "seed-before",
      email: "before@x.com",
      name: "Before",
    });
    await seedGlobalLibrary(db);
    const after = await users.createUser({
      googleSub: "seed-after",
      email: "after@x.com",
      name: "After",
    });

    const listBefore = await wk.list(before.id);
    const listAfter = await wk.list(after.id);
    expect(listBefore).toHaveLength(LIBRARY_WORKOUTS.length);
    expect(listAfter).toHaveLength(LIBRARY_WORKOUTS.length);
    expect(listBefore.every((w) => w.isGlobal)).toBe(true);
    expect(listAfter.every((w) => w.isGlobal)).toBe(true);
  });

  // Converge semantics, zero-overlap case: a global set with NO titles in
  // common with LIBRARY_WORKOUTS — e.g. the retired 35-workout library still
  // sitting in a deployed DB — converges via the degenerate delete-everything
  // + insert-everything path (every old title is "removed", every new title
  // is "missing"). Starts from a deliberately reset table so the "old"
  // globals are the ONLY globals present, standing in for a pre-migration
  // production DB.
  it("converges a zero-overlap global set via full delete+insert; session logs keep their row with workoutId nulled, personal workouts are untouched", async () => {
    await db.delete(workouts);

    const user = await users.createUser({
      googleSub: "swap-test",
      email: "swap@x.com",
      name: "Swap Tester",
    });

    const [oldA] = await wk.createMany(null, [
      {
        sortOrder: 1,
        title: "Old Ghost",
        type: "AT",
        difficulty: "medium",
        pain: 2,
        source: "starter",
        steps: [],
      },
      {
        sortOrder: 2,
        title: "Old Relic",
        type: "O2",
        difficulty: "easy",
        pain: 1,
        source: "starter",
        steps: [],
      },
      {
        sortOrder: 3,
        title: "Old Fossil",
        type: "TR",
        difficulty: "hard",
        pain: 4,
        source: "starter",
        steps: [],
      },
    ]);

    const personal = await wk.create(user.id, {
      title: "My Own Row",
      type: "AN",
      difficulty: "hard",
      pain: 3,
      source: "user",
      steps: [],
    });

    const { id: logId } = await logs.create(user.id, {
      workoutId: oldA.id,
      workoutTitle: oldA.title,
      workoutType: oldA.type,
      baselineK2: null,
      baselineK6: null,
      held: "held",
      pain: 2,
      notes: null,
      steps: [],
      advancesPlan: false,
    });

    await seedGlobalLibrary(db);

    const globalsAfter = await wk.listGlobals();
    expect(globalsAfter).toHaveLength(LIBRARY_WORKOUTS.length);
    const titlesAfter = new Set(globalsAfter.map((w) => w.title));
    expect(titlesAfter.has("Old Ghost")).toBe(false);
    expect(titlesAfter.has("Old Relic")).toBe(false);
    expect(titlesAfter.has("Old Fossil")).toBe(false);

    const logRow = (await logs.list(user.id, 10)).find((l) => l.id === logId);
    expect(logRow).toBeDefined();
    expect(logRow!.workoutId).toBeNull();

    const personalAfter = await wk.get(user.id, personal.id);
    expect(personalAfter).not.toBeNull();
    expect(personalAfter!.title).toBe("My Own Row");
    expect(personalAfter!.isGlobal).toBe(false);
  });

  // seedGlobalLibrary's check-then-converge is not atomic on its own: two
  // booters can both observe a mismatch and both attempt to converge. Until
  // 2026-07-30 the two partial unique indexes on `num` stopped a losing
  // write from landing; those went with the column, so the mutual exclusion
  // is now a transaction-scoped advisory lock inside seedGlobalLibrary
  // (SEED_LOCK_KEY, exported from seed.ts for exactly this test).
  //
  // A test that races two REAL seedGlobalLibrary() calls and only checks the
  // final count is a coin flip: depending on scheduling, one call can fully
  // commit before the other's SELECT even runs, in which case the assertion
  // passes whether or not the lock exists at all — measured at ~50% pass
  // rate with the `pg_advisory_xact_lock` call deleted outright. Instead,
  // take the SAME lock first from an independent session-level connection.
  // Postgres advisory locks share one key space regardless of whether
  // they're taken with the session-scoped (`pg_advisory_lock`) or the
  // transaction-scoped (`pg_advisory_xact_lock`) variant, so holding it here
  // forces seedGlobalLibrary's own lock call to genuinely block — proved via
  // a real timing assertion (it must NOT have finished after a generous
  // delay), not a hope that the scheduler happened to interleave badly.
  // Deleting the `pg_advisory_xact_lock` line from seed.ts makes this test
  // fail every time: `settled` flips to `true` well inside the 300ms window
  // because nothing blocks it any more (verified locally before writing
  // this comment).
  it("blocks on the advisory lock while another session holds it, and proceeds once released", async () => {
    await db.delete(workouts);
    expect(await wk.countGlobals()).toBe(0);

    const lockClient = await pool.connect();
    try {
      await lockClient.query("select pg_advisory_lock($1)", [SEED_LOCK_KEY]);

      let settled = false;
      const seeding = seedGlobalLibrary(db).then(() => {
        settled = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);
      expect(await wk.countGlobals()).toBe(0);

      await lockClient.query("select pg_advisory_unlock($1)", [SEED_LOCK_KEY]);
      await seeding;

      expect(settled).toBe(true);
      expect(await wk.countGlobals()).toBe(LIBRARY_WORKOUTS.length);
    } finally {
      lockClient.release();
    }
  });

  // Library-converge (2026-08-04 spec): the headline behavior this task
  // adds — a content-only edit to an already-deployed title reaches the
  // existing row instead of requiring a title change to be noticed.
  it("converges a content edit in place: same row id, log link intact, new content", async () => {
    await seedGlobalLibrary(db);
    const target = (await wk.listGlobals())[0]!;
    const user = await users.createUser({
      googleSub: "converge-edit-in-place",
      email: "converge-edit-in-place@x.com",
      name: "Converge Edit",
    });
    const logId = await createLogFor(
      user.id,
      target.id,
      target.title,
      target.type,
    );

    const edited = LIBRARY_WORKOUTS.map((w) =>
      w.title === target.title
        ? { ...w, difficulty: "hard" as const, pain: 5 }
        : w,
    );
    await seedGlobalLibrary(db, edited);

    const after = (await wk.listGlobals()).find(
      (g) => g.title === target.title,
    )!;
    expect(after.id).toBe(target.id); // the headline: same row survives
    expect(after).toMatchObject({ difficulty: "hard", pain: 5 });
    const logRow = await findLog(user.id, logId);
    expect(logRow!.workoutId).toBe(target.id); // link intact
  });

  it("deletes a dropped title (its log link nulls) and inserts a new one", async () => {
    await seedGlobalLibrary(db);
    const victim = (await wk.listGlobals())[0]!;
    const user = await users.createUser({
      googleSub: "converge-drop-title",
      email: "converge-drop-title@x.com",
      name: "Converge Drop",
    });
    const logId = await createLogFor(
      user.id,
      victim.id,
      victim.title,
      victim.type,
    );

    const edited = LIBRARY_WORKOUTS.filter(
      (w) => w.title !== victim.title,
    ).concat([
      { ...LIBRARY_WORKOUTS[0]!, title: "Brand New Weather", sortOrder: 301 },
    ]);
    await seedGlobalLibrary(db, edited);

    const titles = (await wk.listGlobals()).map((g) => g.title);
    expect(titles).not.toContain(victim.title);
    expect(titles).toContain("Brand New Weather");
    const logRow = await findLog(user.id, logId);
    expect(logRow).toBeTruthy(); // row survives
    expect(logRow!.workoutId).toBeNull(); // link nulls
  });

  it("is idempotent: a second converge from identical state writes nothing", async () => {
    await seedGlobalLibrary(db);
    // .getTime(), not String(<Date>): Date#toString() truncates to
    // whole seconds, so a spurious re-write landing within the same
    // wall-clock second as the snapshot (routine for a local, in-process
    // test) would silently pass a String()-based comparison even though
    // updatedAt actually moved — caught via self-mutation (see task
    // report) before this was tightened to millisecond precision.
    const before = new Map(
      (await wk.listGlobals()).map((g) => [g.id, g.updatedAt.getTime()]),
    );
    await seedGlobalLibrary(db);
    const after = await wk.listGlobals();
    expect(after).toHaveLength(before.size);
    for (const g of after) expect(g.updatedAt.getTime()).toBe(before.get(g.id));
  });

  it("jsonb round-trip does not cause phantom writes (steps deep-equal, not string-equal)", async () => {
    // Regression pin for the spec's equality rule: seed once, converge again
    // with the SAME library object — if the implementation compared
    // serialized steps, Postgres's jsonb key canonicalization would make
    // every row look changed and updatedAt would move. .getTime(), not
    // String(<Date>) — see the idempotency test above for why.
    await seedGlobalLibrary(db);
    const stamp = (await wk.listGlobals()).map((g) => g.updatedAt.getTime());
    await seedGlobalLibrary(db, [...LIBRARY_WORKOUTS]);
    const stamp2 = (await wk.listGlobals()).map((g) => g.updatedAt.getTime());
    expect(stamp2).toStrictEqual(stamp);
  });

  // Coverage (task brief Step 6): seed.ts's duplicate-title branch
  // (`byTitle.has(g.title)` in the converge loop) is defensive — this
  // seed's own inserts always come from LIBRARY_WORKOUTS, whose titles are
  // unique by construction, so seedGlobalLibrary can never itself produce
  // two global rows sharing a title. It IS reachable via an integration
  // test though: reach in through wk.createMany directly (bypassing
  // seedGlobalLibrary) to simulate legacy/out-of-band duplicate data, no
  // fake needed.
  it("collapses a duplicate global title down to one surviving row (defensive branch)", async () => {
    await seedGlobalLibrary(db);
    const target = (await wk.listGlobals())[0]!;
    const libEntry = LIBRARY_WORKOUTS.find((w) => w.title === target.title)!;
    await wk.createMany(null, [{ ...libEntry, source: "starter" as const }]);
    expect(
      (await wk.listGlobals()).filter((g) => g.title === target.title),
    ).toHaveLength(2);

    await seedGlobalLibrary(db);

    const survivors = (await wk.listGlobals()).filter(
      (g) => g.title === target.title,
    );
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.id).toBe(target.id); // the earlier (original) row wins
  });
});
