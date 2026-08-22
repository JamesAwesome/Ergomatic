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
import { baselines, sessionLogs, users, workouts } from "./schema.js";
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

// From-the-log spec (2026-08-18), §2 "Stored shapes" / exit criterion 6:
// migration 0010 must apply against a database holding v0.11.0 rows
// (session_logs with none of the five new columns) and change none of
// their existing reads — the five new columns read back null, nothing
// else moves. Same "seed pre-migration, migrate, assert nothing moved"
// shape as migration 0009's own describe block above.
describe("migration 0010: hero numbers and plan linkage", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;
  // Fix round 1 (task review, finding 2): both cases below now read
  // state built ONCE in beforeAll, rather than the first `it()` mutating
  // shared container state (seeding the legacy row, then applying the
  // real 0010 migration) that the second `it()` silently depended on.
  // Previously, running the second test alone (e.g. `vitest -t "accepts
  // a NEW row"`) would still pass even if 0010 never applied, because
  // nothing in that test's own body proved order — its green was only
  // meaningful as a side effect of running after the first test. Hoisting
  // both the seed and the full migrate into beforeAll makes each `it`
  // independently runnable and independently meaningful.
  let preMigrationRowId: string;

  const PRE_0010_TAGS = [
    "0000_skinny_silver_fox",
    "0001_tan_thunderball",
    "0002_rare_khan",
    "0003_spicy_firedrake",
    "0004_slippery_starjammers",
    "0005_fine_radioactive_man",
    "0006_windy_wendell_vaughn",
    "0007_shallow_kang",
    "0008_strip_wu_steps",
    "0009_brief_kingpin",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    // A migrations folder containing only 0000-0009, so migrate() below
    // cannot possibly apply 0010 — the legacy row (no avg_split_seconds /
    // distance_meters / time_seconds / plan_key / plan_index columns at
    // all) gets seeded against exactly the schema a real v0.11.0 deploy
    // would have.
    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0010-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0010_TAGS.entries()) {
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
        entries: journal.entries.filter((e) => e.idx <= 9),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });

    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pre-0010-user",
        email: "pre-0010@migrate.test",
        name: "Pre 0010",
      })
      .returning();

    // Seeded against the PRE-0010 schema (none of the five new columns
    // exist yet) — raw SQL, not the typed `sessionLogs` insert helper, for
    // the same reason 0009's own test above uses raw SQL: drizzle's
    // insert builder lists every column the TS schema declares, and the
    // TS schema here already declares all five new columns — against the
    // real pre-0010 table, that statement 500s with "column ... does not
    // exist" before this insert even reaches the assertion the first
    // test below exists to make. Must run BEFORE the full migrate() call
    // right below, while the table still lacks the five new columns.
    const inserted = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "held", "pain", "thumbs", "steps")
          values (${u.id}, 'Pre-migration session', 'AT', 'held', 2, null, '[]'::jsonb)
          returning "id"`,
    );
    preMigrationRowId = inserted.rows[0]!.id;

    // The real, full folder — the boot-time migrate() call that ships
    // 0010. Only 0010 is new (0000-0009's hashes already match what ran
    // against tempDir above), so this is the moment the five ADD COLUMN
    // statements fire. Runs once here, shared by every `it` below —
    // neither test needs the other to have run first.
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("reads a pre-0010 (v0.11.0) row's existing fields unchanged, and all five new columns as null, after 0010 applies", async () => {
    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, preMigrationRowId));
    expect(after.held).toBe("held");
    expect(after.pain).toBe(2);
    expect(after.avgSplitSeconds).toBeNull();
    expect(after.distanceMeters).toBeNull();
    expect(after.timeSeconds).toBeNull();
    expect(after.planKey).toBeNull();
    expect(after.planIndex).toBeNull();
  });

  it("accepts a NEW row with all five columns populated, the double-precision hero values surviving exactly, once 0010 has applied", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "post-0010-user",
        email: "post-0010@migrate.test",
        name: "Post 0010",
      })
      .returning();

    // beforeAll above already applied 0010 (shared container) — this
    // insert exercises the new columns directly against the real table,
    // not just through the API layer.
    const [row] = await db
      .insert(sessionLogs)
      .values({
        userId: u.id,
        workoutTitle: "Full hero row",
        workoutType: "AT",
        held: null,
        pain: null,
        thumbs: null,
        steps: [],
        avgSplitSeconds: 2.7182818284,
        distanceMeters: 5000,
        timeSeconds: 1234.5678,
        planKey: "sprint",
        planIndex: 3,
      })
      .returning();

    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, row.id));
    expect(after.avgSplitSeconds).toBe(2.7182818284);
    expect(after.distanceMeters).toBe(5000);
    expect(after.timeSeconds).toBe(1234.5678);
    expect(after.planKey).toBe("sprint");
    expect(after.planIndex).toBe(3);
  });
});

// Series capture spec (2026-08-19), §3 "Server home": migration 0011,
// one additive, nullable jsonb column, no default, no backfill. Same
// pre/post-migration shape as the 0010 describe above: a legacy row is
// seeded against a migrations folder capped at 0010, then the real
// (full) migrate() applies 0011 and both cases below read shared state
// built once in beforeAll.
describe("migration 0011: the series column", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;
  let preMigrationRowId: string;

  const PRE_0011_TAGS = [
    "0000_skinny_silver_fox",
    "0001_tan_thunderball",
    "0002_rare_khan",
    "0003_spicy_firedrake",
    "0004_slippery_starjammers",
    "0005_fine_radioactive_man",
    "0006_windy_wendell_vaughn",
    "0007_shallow_kang",
    "0008_strip_wu_steps",
    "0009_brief_kingpin",
    "0010_familiar_maddog",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    // A migrations folder containing only 0000-0010, so migrate() below
    // cannot possibly apply 0011 — the legacy row (no series column at
    // all) gets seeded against exactly the schema a real v0.13.0 deploy
    // would have.
    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0011-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0011_TAGS.entries()) {
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
        entries: journal.entries.filter((e) => e.idx <= 10),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });

    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pre-0011-user",
        email: "pre-0011@migrate.test",
        name: "Pre 0011",
      })
      .returning();

    // Seeded against the PRE-0011 schema (no series column at all) — raw
    // SQL, same reason 0010's own block above uses it: the typed
    // `sessionLogs` insert builder already declares `series` in this
    // file's TS schema, and that statement would 500 against the real
    // pre-0011 table. Must run before the full migrate() call below.
    const inserted = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "held", "pain", "steps")
          values (${u.id}, 'Pre-0011 session', 'AT', 'held', 2, '[]'::jsonb)
          returning "id"`,
    );
    preMigrationRowId = inserted.rows[0]!.id;

    // The real, full folder — only 0011 is new here (0000-0010's hashes
    // already match what ran against tempDir above), so this is the
    // moment the ADD COLUMN statement fires. Runs once, shared by every
    // `it` below.
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("reads a pre-0011 row's existing fields unchanged, and series as null, after 0011 applies (never-migrate contract)", async () => {
    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, preMigrationRowId));
    expect(after.held).toBe("held");
    expect(after.pain).toBe(2);
    expect(after.series).toBeNull();
  });

  it("accepts a NEW row with series populated, round-tripping exactly, once 0011 has applied", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "post-0011-user",
        email: "post-0011@migrate.test",
        name: "Post 0011",
      })
      .returning();

    const series = {
      samples: [
        { t: 10, d: 23, p: 1400, spm: 24, hr: 138 },
        { t: 20, d: 47, p: 1350, spm: 25 },
      ],
      truncated: true,
    };

    const [row] = await db
      .insert(sessionLogs)
      .values({
        userId: u.id,
        workoutTitle: "Series row",
        workoutType: "AT",
        held: null,
        pain: null,
        steps: [],
        series,
      })
      .returning();

    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, row.id));
    expect(after.series).toStrictEqual(series);
  });
});

// Whole-branch review minor 6: migration 0012 had no upgrade test of its
// own, unlike 0010/0011 above — the design spec's exit criterion 5
// ("legacy `\"interrupted\"` rows read back unchanged", "round-trips
// POST->GET") was proven at the API-route level (server integration
// tests) but never against a REAL pre-0012 table the way 0010/0011 both
// are here. Same pre/post-migration shape as both: a legacy row is seeded
// against a migrations folder capped at 0011, then the real (full)
// migrate() applies 0012 and both cases below read shared state built
// once in beforeAll.
describe("migration 0012: the ended_by column", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;
  let preMigrationRowId: string;

  const PRE_0012_TAGS = [
    "0000_skinny_silver_fox",
    "0001_tan_thunderball",
    "0002_rare_khan",
    "0003_spicy_firedrake",
    "0004_slippery_starjammers",
    "0005_fine_radioactive_man",
    "0006_windy_wendell_vaughn",
    "0007_shallow_kang",
    "0008_strip_wu_steps",
    "0009_brief_kingpin",
    "0010_familiar_maddog",
    "0011_futuristic_roxanne_simpson",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    // A migrations folder containing only 0000-0011, so migrate() below
    // cannot possibly apply 0012 — the legacy row (no ended_by column at
    // all, and no "ended_by" enum type) gets seeded against exactly the
    // schema a real v0.14.0 deploy would have.
    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0012-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0012_TAGS.entries()) {
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
        entries: journal.entries.filter((e) => e.idx <= 11),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });

    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pre-0012-user",
        email: "pre-0012@migrate.test",
        name: "Pre 0012",
      })
      .returning();

    // Seeded against the PRE-0012 schema (no ended_by column at all) —
    // raw SQL, same reason 0010/0011's own blocks above use it: the typed
    // `sessionLogs` insert builder already declares `endedBy` in this
    // file's TS schema, and that statement would 500 against the real
    // pre-0012 table. Must run before the full migrate() call below.
    const inserted = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "held", "pain", "steps")
          values (${u.id}, 'Pre-0012 session', 'AT', 'held', 2, '[]'::jsonb)
          returning "id"`,
    );
    preMigrationRowId = inserted.rows[0]!.id;

    // The real, full folder — only 0012 is new here (0000-0011's hashes
    // already match what ran against tempDir above), so this is the
    // moment `CREATE TYPE "ended_by"` + the ADD COLUMN statement fire.
    // Runs once, shared by every `it` below.
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("reads a pre-0012 row's existing fields unchanged, and ended_by as null, after 0012 applies (spec exit criterion 5: legacy rows read back unchanged)", async () => {
    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, preMigrationRowId));
    expect(after.held).toBe("held");
    expect(after.pain).toBe(2);
    expect(after.endedBy).toBeNull();
  });

  it("accepts a NEW row with each ended_by value round-tripping exactly, once 0012 has applied — including the legacy 'interrupted' value the widened union carries forward unchanged", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "post-0012-user",
        email: "post-0012@migrate.test",
        name: "Post 0012",
      })
      .returning();

    const values = [
      "finished",
      "rower",
      "link-lost",
      "program-failed",
      "interrupted",
    ] as const;

    for (const endedBy of values) {
      const [row] = await db
        .insert(sessionLogs)
        .values({
          userId: u.id,
          workoutTitle: `ended_by ${endedBy}`,
          workoutType: "AT",
          held: null,
          pain: null,
          steps: [],
          endedBy,
        })
        .returning();

      const [after] = await db
        .select()
        .from(sessionLogs)
        .where(eq(sessionLogs.id, row.id));
      expect(after.endedBy).toBe(endedBy);
    }
  });

  it("rejects an unknown ended_by value — the enum, not application code, is the gate", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "post-0012-reject-user",
        email: "post-0012-reject@migrate.test",
        name: "Post 0012 Reject",
      })
      .returning();

    await expect(
      db.execute(
        sql`insert into "session_logs"
            ("user_id", "workout_title", "workout_type", "held", "pain", "steps", "ended_by")
            values (${u.id}, 'Bad ended_by', 'AT', 'held', 2, '[]'::jsonb, 'reconnecting')`,
      ),
    ).rejects.toThrow();
  });
});

// Phase BL PR A (baseline provenance, spec 2026-08-22 rev 2 "The stored
// shape"): `baselines` gains per-number provenance — `k2_source` and
// `k6_source`, a `baseline_source` pgEnum (manual | estimated | derived |
// tested), NOT NULL, default 'manual'. No nullable fourth state. Existing
// rows reading 'manual' is TRUTHFUL, not a placeholder: the You editor is
// the only baseline writer that has ever existed (gate-verified — nothing
// else in the client writes a baseline), so every pre-0013 number was
// hand-entered. Same pre/post-migration shape as the 0011/0012 describes
// above. (Originally minted as 0012 on this branch; regenerated as 0013
// after Phase LL's 0012_amused_wild_child merged first — the standing
// drizzle-timestamp rule.)
describe("migration 0013: baseline provenance columns", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;
  let preMigrationUserId: string;

  const PRE_0013_TAGS = [
    "0000_skinny_silver_fox",
    "0001_tan_thunderball",
    "0002_rare_khan",
    "0003_spicy_firedrake",
    "0004_slippery_starjammers",
    "0005_fine_radioactive_man",
    "0006_windy_wendell_vaughn",
    "0007_shallow_kang",
    "0008_strip_wu_steps",
    "0009_brief_kingpin",
    "0010_familiar_maddog",
    "0011_futuristic_roxanne_simpson",
    "0012_amused_wild_child",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    // A migrations folder containing only 0000-0012 (amused_wild_child
    // included), so migrate() below cannot possibly apply 0013 — the
    // legacy row (no source columns at all) gets seeded against exactly
    // the schema a real post-Phase-LL deploy would have.
    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0013-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0013_TAGS.entries()) {
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
        entries: journal.entries.filter((e) => e.idx <= 12),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });

    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pre-0013-user",
        email: "pre-0013@migrate.test",
        name: "Pre 0013",
      })
      .returning();
    preMigrationUserId = u.id;

    // Seeded against the PRE-0013 schema (no source columns at all) — raw
    // SQL, same reason 0011's own block above uses it: the typed
    // `baselines` insert builder already declares the source columns in
    // this file's TS schema, and that statement would fail against the
    // real pre-0013 table. Must run before the full migrate() call below.
    await db.execute(
      sql`insert into "baselines" ("user_id", "k2_seconds", "k6_seconds")
          values (${u.id}, 118, 127)`,
    );

    // The real, full folder — only 0013 is new here (0000-0012's hashes
    // already match what ran against tempDir above), so this is the
    // moment the enum + ADD COLUMN statements fire. Runs once, shared by
    // every `it` below.
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("reads a pre-0013 row's numbers unchanged and both sources as 'manual' after 0013 applies — truthful, since the You editor was the only writer that ever existed", async () => {
    const [after] = await db
      .select()
      .from(baselines)
      .where(eq(baselines.userId, preMigrationUserId));
    expect(after.k2Seconds).toBe(118);
    expect(after.k6Seconds).toBe(127);
    expect(after.k2Source).toBe("manual");
    expect(after.k6Source).toBe("manual");
  });

  it("defaults a fresh row's sources to 'manual' when the insert names neither — an old server binary writing post-migration stays truthful", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "post-0013-user",
        email: "post-0013@migrate.test",
        name: "Post 0013",
      })
      .returning();
    // Raw SQL naming ONLY the pre-0013 columns: this is the exact
    // statement shape a not-yet-redeployed server (or any writer that
    // never learned the source columns) still issues after the DB has
    // migrated — the DEFAULT, not the ORM, is what must answer here.
    await db.execute(
      sql`insert into "baselines" ("user_id", "k2_seconds")
          values (${u.id}, 130)`,
    );
    const [row] = await db
      .select()
      .from(baselines)
      .where(eq(baselines.userId, u.id));
    expect(row.k2Source).toBe("manual");
    expect(row.k6Source).toBe("manual");
  });

  // Both rejection cases go through the raw pg pool, not db.execute():
  // drizzle wraps every failure in its own "Failed query: …" error and
  // buries Postgres's message in the cause, so a toThrow() regex against
  // the wrapper would pass for ANY failure — including "column does not
  // exist" — and prove nothing about the enum.
  it("rejects a value outside the enum at the DB layer — a plain-text column would have stored 'banana'", async () => {
    await expect(
      pool.query(`update "baselines" set "k2_source" = 'banana'`),
    ).rejects.toThrow(/invalid input value for enum baseline_source/);
  });

  it("rejects NULL — 'unknown provenance' is not a state this schema can represent", async () => {
    await expect(
      pool.query(`update "baselines" set "k6_source" = null`),
    ).rejects.toThrow(/violates not-null constraint/);
  });
});
