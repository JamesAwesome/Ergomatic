import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { createDb, type Db } from "../../db/index.js";
import { createUserStore } from "../../auth/users.js";
import { createArticleReadsStore } from "../articleReads.js";
import { createBaselinesStore } from "../baselines.js";
import { createWorkoutsStore } from "../workouts.js";
import { createLogsStore } from "../logs.js";
import { createPlanStateStore } from "../planState.js";
import { createPreferencesStore } from "../preferences.js";
import { createTestHistoryStore } from "../testHistory.js";
import {
  describeStoreContracts,
  type StoresUnderTest,
} from "./storeContracts.js";

// Run FIRST, against a real Postgres via Testcontainers. Real behavior IS
// the specification for the contract cases in storeContracts.ts — if a case
// doesn't match what happens here, the case is wrong and gets fixed, not
// this store. contracts.fake.test.ts then runs the SAME cases against the
// in-memory fakes to prove they're honest about matching this.
let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.4").start();
  ({ pool, db } = createDb(container.getConnectionUri()));
  await migrate(db, { migrationsFolder: "drizzle" });
}, 120_000);

afterAll(async () => {
  await pool.end().catch(() => {});
  await container.stop().catch(() => {});
});

async function makeStores(): Promise<StoresUnderTest> {
  const users = createUserStore(db);
  return {
    baselines: createBaselinesStore(db),
    workouts: createWorkoutsStore(db),
    logs: createLogsStore(db),
    planState: createPlanStateStore(db),
    preferences: createPreferencesStore(db),
    testHistory: createTestHistoryStore(db),
    articleReads: createArticleReadsStore(db),
    async makeUser() {
      const id = crypto.randomUUID();
      const user = await users.createUser({
        googleSub: `contract-real-${id}`,
        email: `${id}@contracts.test`,
        name: "Contract User",
      });
      return user.id;
    },
    async seedGlobalWorkout(input) {
      const [row] = await createWorkoutsStore(db).createMany(null, [input]);
      return row;
    },
  };
}

describeStoreContracts(makeStores, { label: "real Postgres" });

// From-the-log spec (2026-08-18), §3, exit criterion 9 — the red-proven
// trap. Real Postgres stores microsecond precision; Drizzle's `Date`
// mapping truncates a read timestamp to milliseconds. Two rows this close
// together can never come from `create()`'s own `defaultNow()` on
// purpose, so they're seeded with raw SQL literals that differ ONLY in
// their microsecond digits — the one scenario a millisecond-only cursor
// (or a cursor whose comparison value round-tripped through a JS `Date`)
// sees as tied and loses. This can only be proved against a REAL
// database: `contracts.fake.test.ts`'s in-memory store can't mint two
// rows a genuine microsecond apart, and JS `Date` itself has no
// microsecond field to preserve even if it could.
describe("logs.list cursor pagination — the same-millisecond trap (criterion 9)", () => {
  it("two rows in the same millisecond, differing only in microseconds, paginate correctly at limit=1 — no row is skipped or duplicated", async () => {
    const users = createUserStore(db);
    const user = await users.createUser({
      googleSub: `cursor-trap-${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@contracts.test`,
      name: "Cursor Trap User",
    });
    const logs = createLogsStore(db);

    // `.000100` and `.000199` share every digit through the millisecond
    // (`.000100` vs `.000199` — both round to `.000` at millisecond
    // precision) and differ only in the microsecond digits Postgres keeps
    // but a JS `Date` cannot.
    const older = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "logged_at", "steps")
          values (${user.id}, 'Same ms A (older)', 'AT', '2026-01-01 00:00:00.000100+00'::timestamptz, '[]'::jsonb)
          returning "id"`,
    );
    const newer = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "logged_at", "steps")
          values (${user.id}, 'Same ms B (newer)', 'AT', '2026-01-01 00:00:00.000199+00'::timestamptz, '[]'::jsonb)
          returning "id"`,
    );
    const olderId = older.rows[0]!.id;
    const newerId = newer.rows[0]!.id;

    const page1 = await logs.list(user.id, 1);
    expect(page1.map((r) => r.id)).toStrictEqual([newerId]);

    const page2 = await logs.list(user.id, 1, page1[0]!.id);
    expect(page2.map((r) => r.id)).toStrictEqual([olderId]);

    // Both rows accounted for, in the correct order, across exactly two
    // pages — a third page is empty, not a re-serving of either row.
    const page3 = await logs.list(user.id, 1, page2[0]!.id);
    expect(page3).toStrictEqual([]);
  });

  // The degenerate case the `id` tiebreak specifically exists for: an
  // EXACT tie (bit-identical `logged_at`, not just "close"). `list()`
  // resolves the cursor entirely inside SQL (never a JS `Date`), so two
  // rows merely close together are already ordered correctly by
  // Postgres's own microsecond-precision comparison — the case above
  // proves that. A genuine tie is different: `logged_at < (subquery)`
  // alone is FALSE for a row whose `logged_at` EQUALS the cursor row's,
  // so a cursor comparison without the trailing `id` tiebreak drops that
  // row on every page, forever — this is what `ORDER BY logged_at DESC,
  // id DESC` + `(logged_at, id) < (...)` exists to prevent.
  it("two rows with an IDENTICAL logged_at (an exact tie) both surface across pages — none dropped", async () => {
    const users = createUserStore(db);
    const user = await users.createUser({
      googleSub: `cursor-tie-${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@contracts.test`,
      name: "Cursor Tie User",
    });
    const logs = createLogsStore(db);

    const a = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "logged_at", "steps")
          values (${user.id}, 'Exact tie A', 'AT', '2026-01-01 00:00:00.000100+00'::timestamptz, '[]'::jsonb)
          returning "id"`,
    );
    const b = await db.execute<{ id: string }>(
      sql`insert into "session_logs"
          ("user_id", "workout_title", "workout_type", "logged_at", "steps")
          values (${user.id}, 'Exact tie B', 'AT', '2026-01-01 00:00:00.000100+00'::timestamptz, '[]'::jsonb)
          returning "id"`,
    );
    const idA = a.rows[0]!.id;
    const idB = b.rows[0]!.id;
    const [first, second] = [idA, idB].sort().reverse(); // id DESC order

    const page1 = await logs.list(user.id, 1);
    expect(page1.map((r) => r.id)).toStrictEqual([first]);

    const page2 = await logs.list(user.id, 1, page1[0]!.id);
    expect(page2.map((r) => r.id)).toStrictEqual([second]);

    const page3 = await logs.list(user.id, 1, page2[0]!.id);
    expect(page3).toStrictEqual([]);
  });
});
