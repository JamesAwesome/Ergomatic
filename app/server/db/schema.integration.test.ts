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
import { sessionLogs, users, workouts } from "./schema.js";
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

  // Whole-branch review (fourth reviewer), finding A — MAJOR: the SQL's own
  // header comment (lines 28-30 above) asserts, as live-probed evidence,
  // that "a workout whose ONLY step was `wu` rebuilds to `steps = '[]'`,
  // which satisfies the `steps` column's NOT NULL constraint" — but no
  // committed test exercised it. The reviewer's own mutation (deleting the
  // `COALESCE(…, '[]'::jsonb)` wrapper below) survived 125/125 integration
  // tests: with it gone, `jsonb_agg` over zero surviving elements returns
  // SQL NULL, `workouts.steps` is `.notNull()` (`schema.ts`), the `UPDATE`
  // aborts, and since migrations run before the API serves a request, the
  // whole deploy never comes up. This is that missing test.
  it("strips a wu-ONLY workout to steps: [], not a migration failure", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "wu-only-user",
        email: "wu-only@strip.test",
        name: "WU Only",
      })
      .returning();

    // A single-element array whose only step is `wu` — the exact legacy
    // shape spec §6/B4 says can exist (bulk import accepted a bare `wu 10`
    // paste, and Phase 5's `+ WARM-UP` could author a workout with nothing
    // else in it, before either door existed in this form).
    const [row] = await db
      .insert(workouts)
      .values({
        userId: u.id,
        title: "Legacy wu-only workout",
        type: "O2",
        difficulty: "easy",
        pain: 1,
        source: "user",
        steps: [{ k: "wu", minutes: 10 }],
      })
      .returning();

    // (a) boot does not fail: the describe's FIRST test already advanced
    // this shared container through the real `migrate()` call that applies
    // 0008 for real (drizzle's own bookkeeping table then skips it on every
    // later `migrate()` in this container, same reason the "wu-free"
    // test above replays the raw SQL text directly rather than calling
    // `migrate()` a second time) — so this row, inserted after that point,
    // is exercised the same way: executing 0008's own committed SQL
    // directly. It is the IDENTICAL statement the real boot-time
    // `migrate()` call runs (not a re-derived equivalent), so a missing
    // COALESCE guard fails HERE with the same NOT NULL violation it would
    // raise at a real deploy's boot, before assertion (b) below is ever
    // reached.
    const migrationSql = await readFile(
      path.join("drizzle", "0008_strip_wu_steps.sql"),
      "utf-8",
    );
    await db.execute(sql.raw(migrationSql));

    // (b) the row reads back steps: [] — not null, not omitted, not an
    // error shape.
    const [after] = await db
      .select()
      .from(workouts)
      .where(eq(workouts.id, row.id));
    expect(after.steps).toStrictEqual([]);

    // The companion trace (reviewer's own second-order finding, not a
    // separate bug): `steps: []` is a shape `domain/validate.ts`'s
    // `validateSteps` rejects on WRITE and no READ path revalidates
    // (spec §6's own premise — the strip runs in the migration precisely
    // because nothing downstream re-checks stored steps). It does not
    // brick, though: `src/session/engine.ts`'s `isComplete` is
    // `run.index >= run.phases.length` (true at `index: 0` for a
    // zero-phase run), so a session built from this workout completes
    // immediately instead of throwing — degrades rather than crashes.
  });
});

// Post-workout-summary spec (2026-08-17), §3: `held`/`pain` DROP NOT NULL
// and `thumbs` is a new nullable column — both loosening/additive changes,
// so unlike migration 0008's steps-rewrite, no existing row's DATA needs
// to change at all. This suite proves that directly: a "legacy" row is
// seeded (with real held/pain values, the only shape possible before this
// migration existed) against a database migrated only through 0008, then
// 0009 runs — same ordering proof as the 0008 suite above, but the
// assertion is "nothing moved" rather than "the shape rewrote."
describe("migration 0009: reflection fields go nullable, thumbs added", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;

  const PRE_0009_TAGS = [
    "0000_skinny_silver_fox",
    "0001_tan_thunderball",
    "0002_rare_khan",
    "0003_spicy_firedrake",
    "0004_slippery_starjammers",
    "0005_fine_radioactive_man",
    "0006_windy_wendell_vaughn",
    "0007_shallow_kang",
    "0008_strip_wu_steps",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    // A migrations folder containing only 0000-0008, so migrate() below
    // cannot possibly apply 0009 — the legacy row (held/pain both required,
    // no thumbs column at all) gets seeded against exactly the schema a
    // real pre-Task-3 deploy would have.
    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0009-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0009_TAGS.entries()) {
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
        entries: journal.entries.filter((e) => e.idx <= 8),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("keeps an existing row's held/pain values, and reads thumbs back as null, after 0009 applies", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pre-0009-user",
        email: "pre-0009@migrate.test",
        name: "Pre 0009",
      })
      .returning();

    // Seeded against the PRE-0009 schema (held/pain both NOT NULL, no
    // thumbs column exists yet) — the only shape a real row could have had
    // before this migration. Raw SQL, not the typed `sessionLogs` insert
    // helper: drizzle's insert builder always lists EVERY column the TS
    // schema declares (using `default` for ones the caller didn't set),
    // and the TS schema here already declares `thumbs` — against the real
    // pre-0009 table (which genuinely has no such column), that statement
    // 500s with "column thumbs does not exist" before this insert even
    // reaches the assertion this test exists to make.
    const inserted = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "held", "pain", "steps")
          values (${u.id}, 'Legacy reflection row', 'AT', 'under', 3, '[]'::jsonb)
          returning "id"`,
    );
    const row = inserted.rows[0]!;

    // The real, full folder — the boot-time migrate() call that ships
    // 0009. Only 0009 is new (0000-0008's hashes already match what ran
    // against tempDir above), so this is the moment DROP NOT NULL / ADD
    // COLUMN fire.
    await migrate(db, { migrationsFolder: "drizzle" });

    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, row.id));
    expect(after.held).toBe("under");
    expect(after.pain).toBe(3);
    expect(after.thumbs).toBeNull();
  });

  it("accepts a NEW row with held/pain/thumbs all null once 0009 has applied", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "post-0009-user",
        email: "post-0009@migrate.test",
        name: "Post 0009",
      })
      .returning();

    // migrate() above (previous test, same shared container) already
    // applied 0009 — this insert exercises the loosened constraint
    // directly against the real column, not just through the API layer.
    const [row] = await db
      .insert(sessionLogs)
      .values({
        userId: u.id,
        workoutTitle: "Skipped reflection",
        workoutType: "O2",
        held: null,
        pain: null,
        thumbs: null,
        steps: [],
      })
      .returning();

    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, row.id));
    expect(after.held).toBeNull();
    expect(after.pain).toBeNull();
    expect(after.thumbs).toBeNull();
  });
});
