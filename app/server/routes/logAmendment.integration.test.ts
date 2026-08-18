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

// Phase 6C Task 1.5 (amendment): `validateLogStepEntry` now accepts an
// omitted `targetSplit` and treats `actualSplit`/`actualSource` as a paired
// unit (docs/superpowers/specs/2026-08-02-phase-6c-log-session-design.md's
// Amendment section). The unit tests in data.test.ts cover the validation
// branches against an in-memory fake store; this proves the OTHER half —
// that a step object with keys genuinely absent (not `null`, not empty
// string) survives a real round trip through Postgres' jsonb column
// (db/schema.ts's `sessionLogs.steps`, untyped jsonb) and back out via
// GET /api/logs byte-for-byte, for a log whose steps mix an effort-shaped
// entry (client's `logDraft.ts`: no targetSplit, no actuals — the 5G rule)
// with an ordinary stopwatch entry.
describe("POST/GET /api/logs: optional targetSplit and paired actuals round-trip through real Postgres", () => {
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
        allowlist: new Set(["amend@log.test"]),
        nativeVerifier: async () => ({
          sub: "amend-sub",
          email: "amend@log.test",
          emailVerified: true,
          name: "Amendment Rower",
        }),
        stores,
      }),
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("round-trips an effort-shaped step (no targetSplit, no actuals) alongside a stopwatch step, byte-faithful", async () => {
    const minted = await request(app)
      .post("/api/auth/native")
      .send({ idToken: "stub" });
    expect(minted.status).toBe(200);
    const bearer = `Bearer ${minted.body.token}`;

    const steps = [
      // Effort step: logDraft.ts's buildLogSteps omits targetSplit AND
      // actualSplit/actualSource together for an effort phase (5G rule) —
      // this is that exact shape, not a hand-simplified stand-in.
      { label: "0:30 @ ALL OUT" },
      // Ordinary stopwatch entry, unaffected by the amendment.
      {
        label: "2000 m @ 2k",
        targetSplit: 128,
        actualSplit: 126,
        actualSource: "stopwatch",
        spm: 24,
        meters: 2000,
      },
    ];

    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        workoutId: null,
        workoutTitle: "Microburst",
        workoutType: "AN",
        held: "held",
        pain: 3,
        notes: null,
        steps,
      });
    expect(created.status).toBe(201);

    // From-the-log spec (2026-08-18), §3: `GET /api/logs` (the list) no
    // longer carries `steps` (zero client consumers) — `GET /api/logs/:id`
    // is where the full row, steps included, is read back now.
    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    // toStrictEqual (not toMatchObject): proves no extra keys leaked in
    // (e.g. a `targetSplit: null` placeholder jsonb round trip could have
    // introduced) and none of the intended keys were dropped.
    expect(log.body.steps).toStrictEqual(steps);
  });
});
