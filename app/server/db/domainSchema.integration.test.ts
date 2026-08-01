import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import type pg from "pg";
import { createDb, type Db } from "./index.js";
import {
  baselines,
  planState,
  preferences,
  sessionLogs,
  testHistory,
  users,
  workouts,
} from "./schema.js";

describe("domain schema against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("creates all six domain tables", async () => {
    const tables = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toStrictEqual(
      expect.arrayContaining([
        "baselines",
        "workouts",
        "session_logs",
        "plan_state",
        "preferences",
        "test_history",
      ]),
    );
  });

  it("rejects a workout with pain outside 1..5", async () => {
    const [u] = await db
      .insert(users)
      .values({ googleSub: "pain-check", email: "pain@x.com", name: "Pain" })
      .returning();
    await expect(
      db.insert(workouts).values({
        userId: u.id,
        title: "Bad pain",
        type: "AN",
        difficulty: "easy",
        pain: 6,
        source: "user",
        steps: [],
      }),
    ).rejects.toThrow();
  });

  it("rejects a plan_state row with an out-of-set plan_key", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "plan-key-check",
        email: "planbad@x.com",
        name: "PlanBad",
      })
      .returning();
    await expect(
      db.insert(planState).values({
        userId: u.id,
        planKey: "marathon" as unknown as "sprint" | "head",
      }),
    ).rejects.toThrow();
  });

  it("accepts a plan_state row with a valid plan_key or a null plan_key", async () => {
    const [u1] = await db
      .insert(users)
      .values({
        googleSub: "plan-key-ok",
        email: "planok@x.com",
        name: "PlanOk",
      })
      .returning();
    const [row1] = await db
      .insert(planState)
      .values({ userId: u1.id, planKey: "sprint" })
      .returning();
    expect(row1.planKey).toBe("sprint");

    const [u2] = await db
      .insert(users)
      .values({
        googleSub: "plan-key-null",
        email: "planull@x.com",
        name: "PlanNull",
      })
      .returning();
    const [row2] = await db
      .insert(planState)
      .values({ userId: u2.id })
      .returning();
    expect(row2.planKey).toBeNull();
  });

  it("rejects a session log with pain outside 1..5", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pain-check-log",
        email: "painlog@x.com",
        name: "PainLog",
      })
      .returning();
    await expect(
      db.insert(sessionLogs).values({
        userId: u.id,
        workoutTitle: "Frozen title",
        workoutType: "AN",
        held: "held",
        pain: 0,
        steps: [],
      }),
    ).rejects.toThrow();
  });

  it("cascades: deleting a user removes their workouts, logs, and prefs", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "cascade-user",
        email: "cascade@x.com",
        name: "Cascade",
      })
      .returning();

    const [w] = await db
      .insert(workouts)
      .values({
        userId: u.id,
        title: "Cascade workout",
        type: "AN",
        difficulty: "easy",
        pain: 3,
        source: "user",
        steps: [],
      })
      .returning();

    await db.insert(sessionLogs).values({
      userId: u.id,
      workoutId: w.id,
      workoutTitle: w.title,
      workoutType: w.type,
      held: "held",
      pain: 3,
      steps: [],
    });

    await db.insert(preferences).values({ userId: u.id });
    await db.insert(baselines).values({ userId: u.id });
    await db.insert(planState).values({ userId: u.id });
    await db
      .insert(testHistory)
      .values({ userId: u.id, distance: "2k", splitSeconds: 100 });

    await db.delete(users).where(eq(users.id, u.id));

    expect(
      await db.select().from(workouts).where(eq(workouts.userId, u.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(sessionLogs).where(eq(sessionLogs.userId, u.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(preferences).where(eq(preferences.userId, u.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(baselines).where(eq(baselines.userId, u.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(planState).where(eq(planState.userId, u.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(testHistory).where(eq(testHistory.userId, u.id)),
    ).toHaveLength(0);
  });

  it("nulls session_logs.workout_id when the workout is deleted, keeping the log", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "setnull-user",
        email: "setnull@x.com",
        name: "SetNull",
      })
      .returning();

    const [w] = await db
      .insert(workouts)
      .values({
        userId: u.id,
        title: "To be deleted",
        type: "O2",
        difficulty: "medium",
        pain: 2,
        source: "user",
        steps: [],
      })
      .returning();

    const [log] = await db
      .insert(sessionLogs)
      .values({
        userId: u.id,
        workoutId: w.id,
        workoutTitle: w.title,
        workoutType: w.type,
        held: "under",
        pain: 2,
        steps: [],
      })
      .returning();

    await db.delete(workouts).where(eq(workouts.id, w.id));

    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, log.id));
    expect(after).toBeDefined();
    expect(after.workoutId).toBeNull();
    expect(after.workoutTitle).toBe("To be deleted");
  });
});
