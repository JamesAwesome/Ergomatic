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
import { seedGlobalLibrary, SEED_LOCK_KEY } from "./seed.js";
import { STARTER_WORKOUTS } from "./starter.js";

describe("seedGlobalLibrary against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let users: UserStore;
  let wk: WorkoutsStore;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
    users = createUserStore(db);
    wk = createWorkoutsStore(db);
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("seeds all STARTER_WORKOUTS as global (user_id null), source starter, on a fresh DB", async () => {
    await seedGlobalLibrary(db);

    const globals = await wk.listGlobals();
    expect(globals).toHaveLength(STARTER_WORKOUTS.length);
    expect(globals.every((w) => w.userId === null)).toBe(true);
    expect(globals.every((w) => w.isGlobal === true)).toBe(true);
    expect(globals.every((w) => w.source === "starter")).toBe(true);
    expect(globals.map((w) => w.sortOrder)).toStrictEqual(
      STARTER_WORKOUTS.map((w) => w.sortOrder).sort((a, b) => a - b),
    );
  });

  it("a second call is idempotent: still exactly the starter count, no duplicates", async () => {
    await seedGlobalLibrary(db);
    await seedGlobalLibrary(db);
    expect(await wk.countGlobals()).toBe(STARTER_WORKOUTS.length);
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
    expect(listBefore).toHaveLength(STARTER_WORKOUTS.length);
    expect(listAfter).toHaveLength(STARTER_WORKOUTS.length);
    expect(listBefore.every((w) => w.isGlobal)).toBe(true);
    expect(listAfter.every((w) => w.isGlobal)).toBe(true);
  });

  it("does not seed when globals already exist even if inserted by other means (idempotent on countGlobals > 0)", async () => {
    await seedGlobalLibrary(db);
    const countAfterFirst = await wk.countGlobals();
    expect(countAfterFirst).toBe(STARTER_WORKOUTS.length);

    // A manual extra global row (simulating some other origin) still blocks
    // re-seeding entirely — the rule is "any globals at all", not "exactly
    // the starter count".
    await wk.createMany(null, [
      {
        sortOrder: 99999,
        title: "Manually added",
        type: "AT",
        difficulty: "medium",
        pain: 2,
        source: "starter",
        steps: [],
      },
    ]);
    await seedGlobalLibrary(db);
    expect(await wk.countGlobals()).toBe(STARTER_WORKOUTS.length + 1);
  });

  // seedGlobalLibrary's check-then-insert is not atomic on its own: two
  // booters can both observe zero globals and both attempt the insert. Until
  // 2026-07-30 the two partial unique indexes on `num` stopped the loser's
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
      expect(await wk.countGlobals()).toBe(STARTER_WORKOUTS.length);
    } finally {
      lockClient.release();
    }
  });
});
