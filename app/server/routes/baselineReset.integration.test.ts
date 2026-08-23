import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import request from "supertest";
import type pg from "pg";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { createDb, type Db } from "../db/index.js";
import { baselines, users } from "../db/schema.js";
import { createSessionStore } from "../auth/sessions.js";
import { createUserStore } from "../auth/users.js";
import { createArticleReadsStore } from "../stores/articleReads.js";
import { createBaselinesStore } from "../stores/baselines.js";
import { createLogsStore } from "../stores/logs.js";
import { createPlanStateStore } from "../stores/planState.js";
import { createPreferencesStore } from "../stores/preferences.js";
import { createTestHistoryStore } from "../stores/testHistory.js";
import { createWorkoutsStore } from "../stores/workouts.js";
import type { Stores } from "./data.js";

// ---------------------------------------------------------------------------
// Phase BL PR C (baseline-onboarding spec rev 2, "Reset onboarding",
// James's ruling): a deliberate, staged-confirm Reset baseline setup on
// You clears BOTH numbers AND both sources, returning the account to the
// TRUE no-baseline state — the state that renders the doors again. The
// claims that need real SQL to prove:
//
//   1. DELETE /api/baselines removes the ROW, so the source columns (NOT
//      NULL with defaults — SOURCE-BESIDE-NULL) cannot linger behind
//      nulled numbers: after the clear there is nothing left to be stale.
//   2. GET then serves the no-row shape — byte-identical to a brand-new
//      account's, which is the exact predicate every doors consumer keys
//      on (numbers-first, per the durable facts).
//   3. Old clients are unaffected: the clear is its own verb; PUT still
//      rejects null, and a fresh PUT after the clear behaves like a
//      first-ever write (stamping manual by default in a real column).
// ---------------------------------------------------------------------------
describe("DELETE /api/baselines against real Postgres (Phase BL PR C)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let bearer: string;
  let userId: string;

  const rawRows = async () =>
    db.select().from(baselines).where(eq(baselines.userId, userId));

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });

    const stores: Stores = {
      baselines: createBaselinesStore(db),
      workouts: createWorkoutsStore(db),
      logs: createLogsStore(db),
      planState: createPlanStateStore(db),
      preferences: createPreferencesStore(db),
      testHistory: createTestHistoryStore(db),
      articleReads: createArticleReadsStore(db),
    };

    app = createApp(
      baseDeps({
        sessions: createSessionStore(db),
        users: createUserStore(db),
        allowlist: new Set(["reset@baseline.test"]),
        nativeVerifier: async () => ({
          sub: "reset-sub",
          email: "reset@baseline.test",
          emailVerified: true,
          name: "Reset Rower",
        }),
        stores,
      }),
    );

    const minted = await request(app)
      .post("/api/auth/native")
      .send({ idToken: "stub" });
    if (minted.status !== 200) {
      throw new Error(`native sign-in failed in setup: ${minted.status}`);
    }
    bearer = `Bearer ${minted.body.token}`;

    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.email, "reset@baseline.test"));
    userId = u.id;
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("clears a fully-set pair with non-manual sources: the ROW is gone (no source can outlive its number) and GET serves the no-row shape", async () => {
    const put = await request(app)
      .put("/api/baselines")
      .set("Authorization", bearer)
      .send({
        k2Seconds: 105,
        k2Source: "tested",
        k6Seconds: 118,
        k6Source: "derived",
      });
    expect(put.status).toBe(200);
    expect(await rawRows()).toHaveLength(1);

    const del = await request(app)
      .delete("/api/baselines")
      .set("Authorization", bearer);
    expect(del.status).toBe(200);
    expect(del.body).toStrictEqual({ k2Seconds: null, k6Seconds: null });

    // The real table: zero rows for this user — numbers AND sources went
    // together, because there is no row left to carry either.
    expect(await rawRows()).toHaveLength(0);

    // The exact shape a brand-new account gets — the doors' own predicate.
    const get = await request(app)
      .get("/api/baselines")
      .set("Authorization", bearer);
    expect(get.status).toBe(200);
    expect(get.body).toStrictEqual({ k2Seconds: null, k6Seconds: null });
  });

  it("old clients unaffected: PUT still 400s on an explicit null, and a fresh plain PUT after the clear starts over stamping manual", async () => {
    const nullPut = await request(app)
      .put("/api/baselines")
      .set("Authorization", bearer)
      .send({ k2Seconds: null });
    expect(nullPut.status).toBe(400);

    const rePut = await request(app)
      .put("/api/baselines")
      .set("Authorization", bearer)
      .send({ k6Seconds: 126 });
    expect(rePut.status).toBe(200);

    const [row] = await rawRows();
    expect(row.k6Seconds).toBe(126);
    expect(row.k6Source).toBe("manual");
    expect(row.k2Seconds).toBeNull();
    // The k2 source column exists NOT NULL with its default — truthful
    // for a column that has never been written on this fresh row.
    expect(row.k2Source).toBe("manual");
  });

  it("a second DELETE (nothing left to clear) is still a clean 200 no-op", async () => {
    await request(app).delete("/api/baselines").set("Authorization", bearer);
    const again = await request(app)
      .delete("/api/baselines")
      .set("Authorization", bearer);
    expect(again.status).toBe(200);
    expect(again.body).toStrictEqual({ k2Seconds: null, k6Seconds: null });
    expect(await rawRows()).toHaveLength(0);
  });
});
