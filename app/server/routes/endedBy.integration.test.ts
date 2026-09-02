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

// Phase LL Task 4 (design spec §4, TRIAD; exit criterion 5): "the widened
// `endedBy` lands on `MonitorRun` and the server row (additive-optional),
// round-trips POST->GET, rejects unknown values, a link-lost close is
// distinguishable from a rower's End in the stored row, and legacy
// `"interrupted"` rows read back unchanged." Same harness shape as
// `logAmendment.integration.test.ts` — a real Postgres container, migrated
// through `drizzle/`, proving the migration itself (not a mocked store).
describe("POST/GET /api/logs: endedBy round-trips through real Postgres, rejects unknown values", () => {
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
        allowlist: new Set(["endedby@log.test"]),
        nativeVerifier: async () => ({
          sub: "endedby-sub",
          email: "endedby@log.test",
          emailVerified: true,
          name: "Endedby Rower",
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

  async function post(bearer: string, endedBy: unknown) {
    return request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        workoutId: null,
        workoutTitle: "Link Truth",
        workoutType: "AN",
        held: null,
        pain: null,
        notes: null,
        steps: [{ label: "2000 m" }],
        source: "manual",
        endedBy,
      });
  }

  it.each([
    ["finished", "finished"],
    ["rower", "rower"],
    ["link-lost", "link-lost"],
    ["program-failed", "program-failed"],
    ["program-dropped", "program-dropped"],
    ["interrupted", "interrupted"],
  ])("round-trips endedBy=%s POST -> GET", async (_label, value) => {
    const bearer = await bearerToken();
    const created = await post(bearer, value);
    expect(created.status).toBe(201);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.endedBy).toBe(value);
  });

  it("absent endedBy stores and reads back null — the pre-Task-4 shape unchanged", async () => {
    const bearer = await bearerToken();
    const created = await post(bearer, undefined);
    expect(created.status).toBe(201);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.endedBy).toBeNull();
  });

  it("explicit null endedBy also stores and reads back null", async () => {
    const bearer = await bearerToken();
    const created = await post(bearer, null);
    expect(created.status).toBe(201);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.endedBy).toBeNull();
  });

  it("rejects an unknown endedBy value with a field-named 400 — nothing is persisted", async () => {
    const bearer = await bearerToken();
    const before = await request(app)
      .get("/api/logs")
      .set("Authorization", bearer);
    const countBefore = before.body.length;

    const rejected = await post(bearer, "reconnected");
    expect(rejected.status).toBe(400);
    expect(rejected.body.field).toBe("endedBy");

    // Task 4 review fix (F5, Minor): "nothing is persisted" proven by
    // ROW COUNT, not merely inferred from the 400 status — a route that
    // 400s AFTER a wayward insert would pass the status-only assertion.
    const after = await request(app)
      .get("/api/logs")
      .set("Authorization", bearer);
    expect(after.body.length).toBe(countBefore);
  });

  it("a link-lost close is distinguishable from a rower's own End in the stored row (exit criterion 5)", async () => {
    const bearer = await bearerToken();
    const linkLost = await post(bearer, "link-lost");
    const rower = await post(bearer, "rower");
    expect(linkLost.status).toBe(201);
    expect(rower.status).toBe(201);

    const linkLostRow = await request(app)
      .get(`/api/logs/${linkLost.body.id}`)
      .set("Authorization", bearer);
    const rowerRow = await request(app)
      .get(`/api/logs/${rower.body.id}`)
      .set("Authorization", bearer);

    expect(linkLostRow.body.endedBy).toBe("link-lost");
    expect(rowerRow.body.endedBy).toBe("rower");
    expect(linkLostRow.body.endedBy).not.toBe(rowerRow.body.endedBy);
  });

  it("a row written before this task (no endedBy column value at all) reads back unchanged — legacy rows are unaffected", async () => {
    const bearer = await bearerToken();
    // Simulates a v0.13-era client: the field is never posted at all, not
    // even as an explicit key — proving the migration is additive against
    // a request shape that predates this task entirely, not just against
    // an explicit null.
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        workoutId: null,
        workoutTitle: "Pre-Task-4 Row",
        workoutType: "AN",
        held: null,
        pain: null,
        notes: null,
        steps: [{ label: "2000 m" }],
        // `source` is the one post-v0.13 key this body carries: required
        // since the v0.35.0 sunset, and orthogonal to the `endedBy`
        // absence this test is about.
        source: "manual",
      });
    expect(created.status).toBe(201);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.endedBy).toBeNull();
  });
});
