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
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, type Db } from "./index.js";
import {
  baselines,
  concept2AuthAttempts,
  concept2Links,
  sessionLogs,
  users,
  workouts,
} from "./schema.js";
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
        source: "manual",
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
        source: "manual",
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
        source: "manual",
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
      "program-dropped",
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
          source: "manual",
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

// RC-2/RC-3 wave design spec §1 ("The server tier (same PR)", TRIAD):
// migration 0016, three additive, nullable columns (machine_work_seconds
// doublePrecision, machine_work_meters integer, machine_summary jsonb), no
// default, no backfill. Same pre/post-migration shape as 0011/0013 above: a
// legacy row is seeded against a migrations folder capped at 0015, then the
// real (full) migrate() applies 0016 and both cases below read shared state
// built once in beforeAll.
describe("migration 0016: the machine summary columns", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;
  let preMigrationRowId: string;

  const PRE_0016_TAGS = [
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
    "0013_melodic_sphinx",
    "0014_graceful_microchip",
    "0015_gorgeous_black_queen",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    // A migrations folder containing only 0000-0015, so migrate() below
    // cannot possibly apply 0016 — the legacy row (no machine_* columns at
    // all) gets seeded against exactly the schema a real v0.21.0 deploy
    // would have.
    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0016-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0016_TAGS.entries()) {
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
        entries: journal.entries.filter((e) => e.idx <= 15),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });

    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pre-0016-user",
        email: "pre-0016@migrate.test",
        name: "Pre 0016",
      })
      .returning();

    // Seeded against the PRE-0016 schema (no machine_* columns at all) —
    // raw SQL, same reason 0011/0013's own blocks above use it: the typed
    // `sessionLogs` insert builder already declares the machine_* columns
    // in this file's TS schema, and that statement would 500 against the
    // real pre-0016 table. Must run before the full migrate() call below.
    const inserted = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "held", "pain", "steps")
          values (${u.id}, 'Pre-0016 session', 'AT', 'held', 2, '[]'::jsonb)
          returning "id"`,
    );
    preMigrationRowId = inserted.rows[0]!.id;

    // The real, full folder — only 0016 is new here (0000-0015's hashes
    // already match what ran against tempDir above), so this is the moment
    // the ADD COLUMN statements fire. Runs once, shared by every `it`
    // below.
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("reads a pre-0016 row's existing fields unchanged, and all three machine columns as null, after 0016 applies (never-migrate contract)", async () => {
    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, preMigrationRowId));
    expect(after.held).toBe("held");
    expect(after.pain).toBe(2);
    expect(after.machineWorkSeconds).toBeNull();
    expect(after.machineWorkMeters).toBeNull();
    expect(after.machineSummary).toBeNull();
  });

  it("accepts a NEW row with all three machine columns populated, round-tripping exactly (fractional seconds included) once 0016 has applied", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "post-0016-user",
        email: "post-0016@migrate.test",
        name: "Post 0016",
      })
      .returning();

    const machineSummary = {
      verificationBytes: [118, 120, 230, 126, 35, 227, 228, 1],
      avgStrokeRate: 44,
      endingHeartRateBpm: null,
      avgHeartRateBpm: null,
      minHeartRateBpm: null,
      maxHeartRateBpm: null,
      dragFactorAverage: 100,
      workoutType: 1,
      recoveryHeartRateBpm: null,
      avgPaceSecondsPer500m: 159.8,
    };

    const [row] = await db
      .insert(sessionLogs)
      .values({
        userId: u.id,
        workoutTitle: "Machine summary row",
        workoutType: "AT",
        held: null,
        pain: null,
        steps: [],
        source: "manual",
        machineWorkSeconds: 24.3,
        machineWorkMeters: 76,
        machineSummary,
      })
      .returning();

    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, row.id));
    expect(after.machineWorkSeconds).toBe(24.3);
    expect(after.machineWorkMeters).toBe(76);
    expect(after.machineSummary).toStrictEqual(machineSummary);
  });
});

// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD):
// migration 0018, two new tables (concept2_links, concept2_auth_attempts)
// plus four additive-optional session_logs columns (c2_result_id,
// c2_user_id, completed_at, tz), no default, no backfill. Regenerated as
// 0018 (originally minted as 0017_magical_hobgoblin) after PR #248 merged
// first and took index 17 for its own migration
// (`0017_fair_whizzer`, `ALTER TYPE ended_by ADD VALUE 'program-dropped'`)
// — second-merger regenerates, per the standing rule (agent briefing:
// "Drizzle migrations apply by TIMESTAMP, not journal order"). Same
// pre/post-migration shape as 0016 above: a legacy row is seeded against a
// migrations folder capped at 0017 (now including #248's own migration as
// part of the PRE-ours set), then the real (full) migrate() applies 0018
// and both cases below read shared state built once in beforeAll.
describe("migration 0018: concept2_links, concept2_auth_attempts, session_logs c2/completedAt/tz columns", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;
  let preMigrationRowId: string;

  const PRE_0018_TAGS = [
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
    "0013_melodic_sphinx",
    "0014_graceful_microchip",
    "0015_gorgeous_black_queen",
    "0016_fancy_quentin_quire",
    "0017_fair_whizzer",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    // A migrations folder containing only 0000-0017, so migrate() below
    // cannot possibly apply 0018 — the legacy row (no c2_*/completed_at/tz
    // columns at all, and no concept2_links/concept2_auth_attempts tables)
    // gets seeded against exactly the schema a real pre-Wave-E-PR1 deploy
    // would have (post-#248, since that migration is now part of the
    // pre-ours baseline every real deploy already carries).
    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0018-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0018_TAGS.entries()) {
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
        entries: journal.entries.filter((e) => e.idx <= 17),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });

    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pre-0018-user",
        email: "pre-0018@migrate.test",
        name: "Pre 0018",
      })
      .returning();

    // Seeded against the PRE-0018 schema (no c2_*/completed_at/tz columns
    // at all) — raw SQL, same reason 0011/0013/0016's own blocks above use
    // it: the typed `sessionLogs` insert builder already declares the new
    // columns in this file's TS schema, and that statement would 500
    // against the real pre-0018 table. Must run before the full migrate()
    // call below.
    const inserted = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "held", "pain", "steps")
          values (${u.id}, 'Pre-0018 session', 'AT', 'held', 2, '[]'::jsonb)
          returning "id"`,
    );
    preMigrationRowId = inserted.rows[0]!.id;

    // The real, full folder — only 0018 is new here (0000-0017's hashes
    // already match what ran against tempDir above), so this is the moment
    // `CREATE TABLE concept2_links`/`concept2_auth_attempts` and the four
    // ADD COLUMN statements fire. Runs once, shared by every `it` below.
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("creates concept2_links and concept2_auth_attempts with the expected columns", async () => {
    const linkCols = await db.execute(
      sql`select column_name from information_schema.columns where table_name = 'concept2_links'`,
    );
    const linkColNames = linkCols.rows.map((r) => r.column_name);
    expect(linkColNames).toStrictEqual(
      expect.arrayContaining([
        "user_id",
        "c2_user_id",
        "access_token",
        "refresh_token",
        "expires_at",
        "c2_username",
        "needs_reauth_at",
        "created_at",
        "updated_at",
      ]),
    );

    const attemptCols = await db.execute(
      sql`select column_name from information_schema.columns where table_name = 'concept2_auth_attempts'`,
    );
    const attemptColNames = attemptCols.rows.map((r) => r.column_name);
    expect(attemptColNames).toStrictEqual(
      expect.arrayContaining(["nonce", "user_id", "created_at"]),
    );
  });

  it("reads a pre-0018 row's existing fields unchanged, and all four new columns as null, after 0018 applies (never-migrate contract)", async () => {
    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, preMigrationRowId));
    expect(after.held).toBe("held");
    expect(after.pain).toBe(2);
    expect(after.c2ResultId).toBeNull();
    expect(after.c2UserId).toBeNull();
    expect(after.completedAt).toBeNull();
    expect(after.tz).toBeNull();
  });

  it("accepts a NEW row with completedAt/tz populated, round-tripping exactly, once 0018 has applied", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "post-0018-user",
        email: "post-0018@migrate.test",
        name: "Post 0018",
      })
      .returning();

    const completedAt = new Date("2026-08-30T12:00:00.000Z");
    const [row] = await db
      .insert(sessionLogs)
      .values({
        userId: u.id,
        workoutTitle: "Concept2-linked row",
        workoutType: "AT",
        held: null,
        pain: null,
        steps: [],
        source: "manual",
        c2ResultId: 4242,
        c2UserId: 918273,
        completedAt,
        tz: "America/New_York",
      })
      .returning();

    const [after] = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.id, row.id));
    expect(after.c2ResultId).toBe(4242);
    expect(after.c2UserId).toBe(918273);
    expect(after.completedAt).toStrictEqual(completedAt);
    expect(after.tz).toBe("America/New_York");
  });

  it("round-trips a concept2_links row, including a set needs_reauth_at", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "c2-link-user",
        email: "c2-link@migrate.test",
        name: "C2 Link",
      })
      .returning();

    const expiresAt = new Date("2026-09-01T00:00:00.000Z");
    const needsReauthAt = new Date("2026-08-31T18:00:00.000Z");
    await db.insert(concept2Links).values({
      userId: u.id,
      c2UserId: 555,
      accessToken: "access-tok",
      refreshToken: "refresh-tok",
      expiresAt,
      c2Username: "jamesawesome",
      needsReauthAt,
    });

    const [link] = await db
      .select()
      .from(concept2Links)
      .where(eq(concept2Links.userId, u.id));
    expect(link.c2UserId).toBe(555);
    expect(link.accessToken).toBe("access-tok");
    expect(link.refreshToken).toBe("refresh-tok");
    expect(link.expiresAt).toStrictEqual(expiresAt);
    expect(link.c2Username).toBe("jamesawesome");
    expect(link.needsReauthAt).toStrictEqual(needsReauthAt);
  });

  it("round-trips a concept2_auth_attempts row, needs_reauth_at absent by default", async () => {
    const [u] = await db
      .insert(users)
      .values({
        googleSub: "c2-attempt-user",
        email: "c2-attempt@migrate.test",
        name: "C2 Attempt",
      })
      .returning();

    await db.insert(concept2AuthAttempts).values({
      nonce: "nonce-1",
      userId: u.id,
    });

    const [attempt] = await db
      .select()
      .from(concept2AuthAttempts)
      .where(eq(concept2AuthAttempts.nonce, "nonce-1"));
    expect(attempt.userId).toBe(u.id);
  });
});

// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §2, TRIAD):
// migration 0021 (was 0020 until #268 merged first and took that index) —
// `concept2_auth_attempts` gains `surface` (enum link_surface, NOT NULL
// DEFAULT 'web') and UNIQUE(user_id); `concept2_links` gains
// UNIQUE(c2_user_id) (D1, approved); every pre-existing attempt row is
// DELETED first (15-minute disposable rows — an in-flight link at deploy
// restarts at mint, already the retry story). Same pre/post-migration
// harness as the 0018 block above: rows are seeded against a folder capped
// at 0020, then a SECOND folder capped at 0021 applies 0021 ALONE — the
// staging assertion below pins that, so a future renumbering that leaves
// this block behind goes red here instead of silently testing someone
// else's migration. (It used to apply the real `drizzle` folder directly
// for that second step; door PR A's migration 0022 tripped exactly the
// failure this comment warned about, and the fix is the second capped
// folder — the same shape `source.integration.test.ts` already carries
// for 0020 vs #268's 0021.)
describe("migration 0021: attempts surface + UNIQUE(user_id), links UNIQUE(c2_user_id), attempts wiped", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;
  // Door PR A added migration 0022: the "real folder applies 0021 ALONE"
  // design this block's own header describes broke the moment 0022
  // existed, exactly as that header warned — caught here, not silently.
  // `tempDirThrough21` is `source.integration.test.ts`'s fix for the
  // identical shape (0020 vs #268's 0021), applied here: a SECOND capped
  // folder, so this block keeps testing 0021 alone regardless of how many
  // migrations ship after it.
  let tempDirThrough21: string;
  let seededUserId: string;
  // Captured in beforeAll, asserted in the first `it` — the staging is only
  // a proof about THIS migration if these hold. Literals, never derived
  // from the arrays below (a test that computes its expectation from the
  // thing it gates cannot go red on it).
  const staging = { appliedBefore: -1, appliedAfter: -1, newestTag: "" };

  const PRE_0021_TAGS = [
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
    "0013_melodic_sphinx",
    "0014_graceful_microchip",
    "0015_gorgeous_black_queen",
    "0016_fancy_quentin_quire",
    "0017_fair_whizzer",
    "0018_natural_chronomancer",
    "0019_happy_virginia_dare",
    "0020_wooden_millenium_guard",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0021-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0021_TAGS.entries()) {
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
    ) as { entries: { idx: number; tag: string }[] };
    const through21 = journal.entries.filter((e) => e.idx <= 21);
    staging.newestTag = through21.at(-1)?.tag ?? "";
    await writeFile(
      path.join(tempDir, "meta", "_journal.json"),
      JSON.stringify({
        ...journal,
        entries: journal.entries.filter((e) => e.idx <= 20),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });

    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pre-0021-user",
        email: "pre-0021@migrate.test",
        name: "Pre 0021",
      })
      .returning();
    seededUserId = u.id;

    // TWO live attempts for ONE user, seeded against the pre-0021 schema —
    // legal there (no UNIQUE(user_id) yet, the exact "raceable" state the
    // ruling named). Raw SQL because the typed builder already declares
    // `surface`, which this table does not have yet.
    await db.execute(
      sql`insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class")
          values ('pre-0021-a', ${u.id}, 'H'), ('pre-0021-b', ${u.id}, 'L')`,
    );

    tempDirThrough21 = await mkdtemp(path.join(tmpdir(), "drizzle-0021-"));
    await mkdir(path.join(tempDirThrough21, "meta"));
    for (const { idx, tag } of through21) {
      const paddedIdx = String(idx).padStart(4, "0");
      await copyFile(
        path.join("drizzle", `${tag}.sql`),
        path.join(tempDirThrough21, `${tag}.sql`),
      );
      await copyFile(
        path.join("drizzle", "meta", `${paddedIdx}_snapshot.json`),
        path.join(tempDirThrough21, "meta", `${paddedIdx}_snapshot.json`),
      );
    }
    await writeFile(
      path.join(tempDirThrough21, "meta", "_journal.json"),
      JSON.stringify({ ...journal, entries: through21 }),
    );

    const applied = async () =>
      Number(
        (
          await pool.query<{ n: string }>(
            "select count(*)::text as n from drizzle.__drizzle_migrations",
          )
        ).rows[0].n,
      );
    staging.appliedBefore = await applied();
    await migrate(db, { migrationsFolder: tempDirThrough21 });
    staging.appliedAfter = await applied();
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
    await rm(tempDirThrough21, { recursive: true, force: true });
  });

  it("staged 0000..0020, then applied 0021 alone", () => {
    expect(staging).toStrictEqual({
      appliedBefore: 21,
      appliedAfter: 22,
      newestTag: "0021_crazy_gamma_corps",
    });
  });

  it("wipes every pre-existing attempt (the 15-minute rows restart at mint)", async () => {
    const rows = await db.execute(
      sql`select count(*)::int as n from concept2_auth_attempts`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(0);
  });

  it("adds surface as NOT NULL DEFAULT 'web' — a rollback-image insert without surface still succeeds and reads 'web'", async () => {
    // The PR1.5 image's createAttempt inserts no `surface` (design §2's
    // rollback argument); this raw insert IS that image's statement.
    await pool.query(
      `insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class") values ('rollback-shape', $1, 'H')`,
      [seededUserId],
    );
    const [row] = await db
      .select({ surface: concept2AuthAttempts.surface })
      .from(concept2AuthAttempts)
      .where(eq(concept2AuthAttempts.nonce, "rollback-shape"));
    expect(row.surface).toBe("web");
    await db
      .delete(concept2AuthAttempts)
      .where(eq(concept2AuthAttempts.nonce, "rollback-shape"));
  });

  it("rejects a surface value outside the enum at the DB layer", async () => {
    await expect(
      pool.query(
        `insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class", "surface") values ('bad-surface', $1, 'H', 'ios')`,
        [seededUserId],
      ),
    ).rejects.toThrow(/invalid input value for enum link_surface/);
  });

  it("enforces one live attempt per user: a second row for the same user_id is a unique violation", async () => {
    await pool.query(
      `insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class", "surface") values ('uniq-1', $1, 'H', 'web')`,
      [seededUserId],
    );
    await expect(
      pool.query(
        `insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class", "surface") values ('uniq-2', $1, 'H', 'web')`,
        [seededUserId],
      ),
    ).rejects.toThrow(/concept2_auth_attempts_user_id_unique/);
    await db
      .delete(concept2AuthAttempts)
      .where(eq(concept2AuthAttempts.nonce, "uniq-1"));
  });

  it("D1: two Ergomatic users cannot hold the same Concept2 account (UNIQUE c2_user_id)", async () => {
    const [other] = await db
      .insert(users)
      .values({
        googleSub: "post-0021-other",
        email: "post-0021-other@migrate.test",
        name: "Other",
      })
      .returning();
    // RAW SQL, the same treatment (and for the same reason) this block's
    // `surface` inserts above already carry: Drizzle's typed
    // `.insert(concept2Links)` builder emits EVERY declared column,
    // including ones the call never names — and this database is capped at
    // 0021, where `c2_username` (added by 0023) does not exist yet, and
    // `weight_class` still does and is NOT NULL. The typed form would fail
    // on the missing column and, once that was worked around, on the
    // not-null one — neither of which is what this test is about.
    await pool.query(
      `insert into "concept2_links" ("user_id", "c2_user_id", "access_token", "refresh_token", "expires_at", "weight_class") values ($1, 2211, 'at', 'rt', '2026-10-01T00:00:00Z', 'H')`,
      [seededUserId],
    );
    // Raw `pool.query` throws pg's own error DIRECTLY, so the Postgres text
    // naming the violated constraint IS the top-level `.message` and
    // `toThrow(regex)` reads it — matching the `surface` precedent a few
    // lines above. (Through the typed builder the same error arrives wrapped
    // in a `DrizzleQueryError` whose own `.message` is just "Failed query:
    // ...", with the real text on `.cause`; that is why this assertion used
    // to be a `toMatchObject({ cause: … })` and no longer is.)
    await expect(
      pool.query(
        `insert into "concept2_links" ("user_id", "c2_user_id", "access_token", "refresh_token", "expires_at", "weight_class") values ($1, 2211, 'at2', 'rt2', '2026-10-01T00:00:00Z', 'L')`,
        [other.id],
      ),
    ).rejects.toThrow(/concept2_links_c2_user_id_unique/);
  });
});
