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
import { StoreConflictError } from "../stores/errors.js";
import { createWorkoutsStore, type WorkoutsStore } from "../stores/workouts.js";
import { seedGlobalLibrary } from "./seed.js";
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
    expect(globals.map((w) => w.num).sort((a, b) => a - b)).toEqual(
      STARTER_WORKOUTS.map((w) => w.num).sort((a, b) => a - b),
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
        num: 99999,
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

  // index.ts wraps seedGlobalLibrary() in a try/catch that specifically
  // tolerates StoreConflictError, because the check-then-insert inside
  // seedGlobalLibrary is not atomic across processes: two booters can both
  // observe zero globals and both attempt the insert, and only one of the
  // two partial unique indexes' writes can land. This test drives that
  // exact race against real Postgres — wiping to a genuinely unseeded
  // state first so both calls race the gap for real, not short-circuiting
  // on the idempotency guard the earlier tests in this file already
  // exercised.
  it("tolerates a genuine two-booter race: never duplicates, and any loser fails with exactly StoreConflictError", async () => {
    await db.delete(workouts);
    expect(await wk.countGlobals()).toBe(0);

    const results = await Promise.allSettled([
      seedGlobalLibrary(db),
      seedGlobalLibrary(db),
    ]);

    // Whichever call(s) "won", the two partial unique indexes guarantee the
    // starter set landed exactly once — never doubled.
    expect(await wk.countGlobals()).toBe(STARTER_WORKOUTS.length);

    // Not every run of this test is guaranteed to actually interleave the
    // two calls' check-then-insert windows (timing-dependent), so a clean
    // pair of resolves is an acceptable outcome. But whenever a loser DOES
    // reject, it must reject with precisely the error type index.ts's
    // boot-time catch pattern-matches on — anything else would mean that
    // catch is silently swallowing something it shouldn't.
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(StoreConflictError);
    }
  });
});
