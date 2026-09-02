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
import { testHistory, users } from "../db/schema.js";
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
// Phase BL PR B (baseline-onboarding spec rev 2, "Recording (decoupled)",
// James's ruling: every designated-test session with a measurable result
// records to test_history — accept OR decline; the prompt governs only the
// baseline write). Three claims proven against the REAL wire and REAL
// Postgres, because each rests on real SQL behaviour a fake can only
// imitate (the UNIQUE constraint's NULLS DISTINCT semantics, the FK's
// ON DELETE SET NULL, and migration 0014 applying cleanly over 0000-0013):
//
//   1. THE DECOUPLE: POST /api/test-history appends a history row while
//      the baselines row does not move at all — recording without any
//      baseline write, which PUT /api/baselines' isTestResult coupling
//      could never do.
//   2. IDEMPOTENCY: a double-fire keyed to the same saved log keeps ONE
//      row (the UNIQUE constraint plus the store's pre-check) — the
//      delta-0 duplicate the keyless store would have written is the
//      red-provable failure mode this guard exists for.
//   3. THE RECORD OUTLIVES ITS LOG: deleting the session log nulls the
//      link (SET NULL) but keeps the measured test row — test history is
//      its own record, not a projection of the log table.
// ---------------------------------------------------------------------------
describe("POST /api/test-history against real Postgres (Phase BL PR B)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let bearer: string;
  let userId: string;

  const historyRows = async () =>
    db.select().from(testHistory).where(eq(testHistory.userId, userId));

  const postLog = async () => {
    const res = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        workoutId: null,
        workoutTitle: "2K Test",
        workoutType: "AN",
        held: null,
        pain: null,
        notes: null,
        steps: [
          { label: "2000m @ MAX", actualSplit: 118, actualSource: "pm5" },
        ],
        avgSplitSeconds: 118.4,
        endedBy: "finished",
        // Required since the v0.35.0 sunset; no deviceName and no
        // stopwatch step derived `manual` under the old rule.
        source: "manual",
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

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
        allowlist: new Set(["decouple@testhistory.test"]),
        nativeVerifier: async () => ({
          sub: "decouple-sub",
          email: "decouple@testhistory.test",
          emailVerified: true,
          name: "Decouple Rower",
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
      .where(eq(users.email, "decouple@testhistory.test"));
    userId = u.id;
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("records a test result with NO baseline write — declining the prompt still records", async () => {
    const logId = await postLog();

    const res = await request(app)
      .post("/api/test-history")
      .set("Authorization", bearer)
      .send({ distance: "2k", splitSeconds: 118.4, logId });
    expect(res.status).toBe(201);

    const rows = await historyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      distance: "2k",
      deltaSeconds: null,
      sessionLogId: logId,
    });
    // real(float4) storage rounds; assert to its precision, not exactly.
    expect(rows[0]!.splitSeconds).toBeCloseTo(118.4, 4);

    // The decouple itself: no baselines row came into existence.
    const baselinesRes = await request(app)
      .get("/api/baselines")
      .set("Authorization", bearer);
    expect(baselinesRes.body).toStrictEqual({
      k2Seconds: null,
      k6Seconds: null,
    });
  });

  it("a double-fire for the same log keeps ONE row and never writes the delta-0 duplicate", async () => {
    const before = await historyRows();
    const logId = before[0]!.sessionLogId!;

    const res = await request(app)
      .post("/api/test-history")
      .set("Authorization", bearer)
      .send({ distance: "2k", splitSeconds: 118.4, logId });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(before[0]!.id);

    const after = await historyRows();
    expect(after).toHaveLength(1);
    expect(after[0]!.deltaSeconds).toBeNull();
  });

  it("a second test from a NEW log appends and computes the delta off the previous row", async () => {
    const logId = await postLog();
    const res = await request(app)
      .post("/api/test-history")
      .set("Authorization", bearer)
      .send({ distance: "2k", splitSeconds: 116.4, logId });
    expect(res.status).toBe(201);

    const rows = await historyRows();
    expect(rows).toHaveLength(2);
    const newest = rows.find((r) => r.sessionLogId === logId)!;
    expect(newest.deltaSeconds).toBeCloseTo(-2, 4);
  });

  it("deleting the session log keeps the test row, link nulled — history is its own record", async () => {
    const rows = await historyRows();
    const linked = rows.find((r) => r.deltaSeconds !== null)!;
    const logId = linked.sessionLogId!;

    const del = await request(app)
      .delete(`/api/logs/${logId}`)
      .set("Authorization", bearer);
    expect(del.status).toBe(200);

    const after = await historyRows();
    expect(after).toHaveLength(2);
    const survivor = after.find((r) => r.id === linked.id)!;
    expect(survivor.sessionLogId).toBeNull();
    expect(survivor.deltaSeconds).toBeCloseTo(-2, 4);
  });
});
