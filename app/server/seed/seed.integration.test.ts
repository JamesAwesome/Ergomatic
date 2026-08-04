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

  // Reconcile semantics (this task): a global set that no longer matches
  // LIBRARY_WORKOUTS' title set — e.g. the retired 35-workout library still
  // sitting in a deployed DB — gets swapped wholesale rather than left alone.
  // Starts from a deliberately reset table so the "old" globals are the ONLY
  // globals present, standing in for a pre-migration production DB.
  it("swap: a mismatched global set is replaced wholesale; session logs keep their row with workoutId nulled, personal workouts are untouched", async () => {
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

  // seedGlobalLibrary's check-then-reconcile is not atomic on its own: two
  // booters can both observe a mismatch and both attempt the swap. Until
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
});
