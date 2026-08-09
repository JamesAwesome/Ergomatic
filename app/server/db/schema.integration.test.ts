import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, type Db } from "./index.js";
import { users, workouts } from "./schema.js";
import type pg from "pg";

describe("migrations", () => {
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

  it("creates users and sessions tables", async () => {
    const tables = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toContain("users");
    expect(names).toContain("sessions");
  });

  it("is idempotent (second migrate is a no-op)", async () => {
    const before = await db.execute(
      sql`select count(*)::int as count from information_schema.tables where table_schema = 'public'`,
    );
    await migrate(db, { migrationsFolder: "drizzle" });
    const after = await db.execute(
      sql`select count(*)::int as count from information_schema.tables where table_schema = 'public'`,
    );
    expect(after.rows[0]?.count).toStrictEqual(before.rows[0]?.count);
  });
});

// Migration 0008 (warmup-setting design §6, adversarial B4): a workouts row
// written before `wu` left the Step union may still carry `{"k":"wu",...}`
// steps, and no read path revalidates stored steps — so the strip has to
// run IN the migration, before the API can ever serve that row again. This
// suite proves the ORDERING claim directly: a "legacy" row is seeded RAW
// (bypassing validateWorkoutInput, which would reject `wu` today) against a
// database migrated only through 0007, and only THEN does 0008 run — same
// as a real deploy hitting a database that predates this migration.
describe("migration 0008: the workouts wu-strip", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;

  const PRE_0008_TAGS = [
    "0000_skinny_silver_fox",
    "0001_tan_thunderball",
    "0002_rare_khan",
    "0003_spicy_firedrake",
    "0004_slippery_starjammers",
    "0005_fine_radioactive_man",
    "0006_windy_wendell_vaughn",
    "0007_shallow_kang",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    // A migrations folder containing only 0000-0007, so migrate() below
    // cannot possibly apply 0008 — the legacy row gets seeded against
    // exactly the schema a real pre-Task-2 deploy would have.
    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0008-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0008_TAGS.entries()) {
      const idx = String(i).padStart(4, "0");
      await copyFile(
        path.join("drizzle", `${tag}.sql`),
        path.join(tempDir, `${tag}.sql`),
      );
      await copyFile(
        path.join("drizzle", "meta", `${idx}_snapshot.json`),
        path.join(tempDir, "meta", `${idx}_snapshot.json`),
      );
    }
    const journal = JSON.parse(
      await readFile(path.join("drizzle", "meta", "_journal.json"), "utf-8"),
    ) as { entries: { idx: number }[] };
    await writeFile(
      path.join(tempDir, "meta", "_journal.json"),
      JSON.stringify({
        ...journal,
        entries: journal.entries.filter((e) => e.idx <= 7),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("strips a legacy wu step on migrate, byte-preserving the rest, and is idempotent", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "wu-strip-user",
        email: "wu@strip.test",
        name: "WU",
      })
      .returning();

    // Seeded RAW (the ORM insert, but with a shape validateWorkoutInput
    // rejects today): this shape can only exist as data written before wu
    // left the authoring union — the exact legacy shape (`{ k: "wu";
    // minutes: number }`, domain/types.ts before 603b239) plus a real work
    // step and a rest step around it, to prove ordering and neighbors
    // survive untouched, and two wu occurrences to prove the strip isn't
    // a first-match-only bug.
    const legacySteps = [
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 2 },
      },
      { k: "wu", minutes: 8 },
      { k: "r", minutes: 1 },
      { k: "wu", minutes: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { effort: "max" },
      },
    ];
    const [row] = await db
      .insert(workouts)
      .values({
        userId: u.id,
        title: "Legacy warm-up workout",
        type: "AT",
        difficulty: "medium",
        pain: 2,
        source: "user",
        steps: legacySteps,
      })
      .returning();

    // The real, full folder — this is the boot-time migrate() call that
    // ships 0008. Only 0008 is new (0000-0007's hashes already match what
    // ran against tempDir above), so this is the moment the strip fires.
    await migrate(db, { migrationsFolder: "drizzle" });

    const [after] = await db
      .select()
      .from(workouts)
      .where(eq(workouts.id, row.id));
    expect(after.steps).toStrictEqual([
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 2 },
      },
      { k: "r", minutes: 1 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { effort: "max" },
      },
    ]);

    // Idempotence: re-execute the migration's own SQL text a second time
    // directly (migrate() itself would skip a recorded migration, which
    // would only prove the runner's bookkeeping, not that this statement
    // is safe to run twice). Zero wu elements remain, so the UPDATE's WHERE
    // clause must match no rows and change nothing.
    const migrationSql = await readFile(
      path.join("drizzle", "0008_strip_wu_steps.sql"),
      "utf-8",
    );
    await db.execute(sql.raw(migrationSql));
    const [again] = await db
      .select()
      .from(workouts)
      .where(eq(workouts.id, row.id));
    expect(again.steps).toStrictEqual(after.steps);
  });

  it("leaves a wu-free workout completely untouched", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "no-wu-user",
        email: "nowu@strip.test",
        name: "NoWU",
      })
      .returning();
    const steps = [
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: -1 },
      },
    ];
    const [row] = await db
      .insert(workouts)
      .values({
        userId: u.id,
        title: "No warm-up here",
        type: "O2",
        difficulty: "easy",
        pain: 1,
        source: "user",
        steps,
      })
      .returning();

    const migrationSql = await readFile(
      path.join("drizzle", "0008_strip_wu_steps.sql"),
      "utf-8",
    );
    await db.execute(sql.raw(migrationSql));

    const [after] = await db
      .select()
      .from(workouts)
      .where(eq(workouts.id, row.id));
    expect(after.steps).toStrictEqual(steps);
  });
});
