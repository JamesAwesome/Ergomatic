import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import type pg from "pg";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { createDb, type Db } from "../db/index.js";
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

// Wave E PR1 Task 2 (2026-08-31-concept2-logbook-design.md §Stored shapes,
// TRIAD): Task 1's migration 0018 integration test (regenerated from 0017
// after PR #248 merged first and took index 17 for its own migration)
// (`db/schema.integration.test.ts`) proves completedAt/tz round-trip at the
// DRIZZLE layer — a direct `db.insert(sessionLogs)` — but never exercises
// the real POST /api/logs ROUTE, which is where this task's validators
// (`checkCompletedAt`/`tzError`) actually live. Same real-Postgres,
// real-migration harness shape as `endedBy.integration.test.ts` — a
// migrated container, the real stores, the real route — proving the
// validated route wiring persists through an actual column, not just the
// fake store `data.test.ts` exercises.
describe("POST/GET /api/logs: completedAt/tz round-trip through the real route and real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let app: ReturnType<typeof createApp>;

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
        allowlist: new Set(["completedat@log.test"]),
        nativeVerifier: async () => ({
          sub: "completedat-sub",
          email: "completedat@log.test",
          emailVerified: true,
          name: "Completedat Rower",
        }),
        stores,
      }),
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  async function bearerToken(): Promise<string> {
    const minted = await request(app)
      .post("/api/auth/native")
      .send({ idToken: "stub" });
    expect(minted.status).toBe(200);
    return `Bearer ${minted.body.token}`;
  }

  function logBody(extra: Record<string, unknown>) {
    return {
      workoutId: null,
      workoutTitle: "Free Row",
      workoutType: "AN",
      held: null,
      pain: null,
      notes: null,
      steps: [{ label: "2000 m" }],
      ...extra,
    };
  }

  it("round-trips a valid completedAt + tz through the real column", async () => {
    const bearer = await bearerToken();
    const completedAt = "2026-08-30T12:00:00.000Z";
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(logBody({ completedAt, tz: "America/New_York" }));
    expect(created.status).toBe(201);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.completedAt).toBe(new Date(completedAt).toISOString());
    expect(log.body.tz).toBe("America/New_York");
  });

  it("a body with neither key stores and reads back both as null through the real column", async () => {
    const bearer = await bearerToken();
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(logBody({}));
    expect(created.status).toBe(201);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.completedAt).toBeNull();
    expect(log.body.tz).toBeNull();
  });

  it("a clock-skewed completedAt (>48h future) 201s and persists NULL in the real column — the save survives a wrong device clock", async () => {
    const bearer = await bearerToken();
    const farFuture = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(logBody({ completedAt: farFuture }));
    expect(created.status).toBe(201);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.completedAt).toBeNull();
  });

  it("rejects a malformed completedAt with 400, field named — nothing is persisted", async () => {
    const bearer = await bearerToken();
    const before = await request(app)
      .get("/api/logs")
      .set("Authorization", bearer);
    const countBefore = before.body.length;

    const rejected = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(logBody({ completedAt: "March 5, 2020" }));
    expect(rejected.status).toBe(400);
    expect(rejected.body.field).toBe("completedAt");

    const after = await request(app)
      .get("/api/logs")
      .set("Authorization", bearer);
    expect(after.body.length).toBe(countBefore);
  });

  it("rejects a non-IANA tz with 400, field named — nothing is persisted", async () => {
    const bearer = await bearerToken();
    const before = await request(app)
      .get("/api/logs")
      .set("Authorization", bearer);
    const countBefore = before.body.length;

    const rejected = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(logBody({ tz: "+05:00" }));
    expect(rejected.status).toBe(400);
    expect(rejected.body.field).toBe("tz");

    const after = await request(app)
      .get("/api/logs")
      .set("Authorization", bearer);
    expect(after.body.length).toBe(countBefore);
  });
});
