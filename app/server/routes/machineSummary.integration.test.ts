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

// RC-2/RC-3 wave design spec §1 ("The server tier (same PR)", TRIAD):
// "migration 0016: additive, nullable, no defaults, NO backfill — old rows
// read null and the display renders nothing for them. The save API gains
// one optional field on POST /api/logs' body ... The client sends the
// observation set it holds at save time." Same harness shape as
// `endedBy.integration.test.ts` — a real Postgres container, migrated
// through `drizzle/`, proving the migration itself (not a mocked store).
describe("POST/GET /api/logs: the machine's summary round-trips through real Postgres, rejects malformed input", () => {
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
        allowlist: new Set(["machinesummary@log.test"]),
        nativeVerifier: async () => ({
          sub: "machinesummary-sub",
          email: "machinesummary@log.test",
          emailVerified: true,
          name: "Machine Summary Rower",
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

  const validLogBody = () => ({
    workoutId: null,
    workoutTitle: "Steady State",
    workoutType: "AT",
    held: null,
    pain: null,
    notes: null,
    steps: [{ label: "2000 m" }],
    // Required since the v0.35.0 sunset; no deviceName here (this suite is
    // about the machine totals, not the door), so `manual` is the member
    // the server derived for it while builds <=811 could still omit it.
    source: "manual",
  });

  // The terminate capture's own machineSummary shape (task-6-brief §Step
  // 1): a REAL, capture-derived observation set, not hand-rounded fixture
  // numbers — machineWorkSeconds is fractional (0x0039's Split/Interval
  // Time is tenths-precision, the same source `workSeconds`/`restSeconds`
  // already prove), machineWorkMeters is the client's already-rounded whole
  // meters, and the blob carries the full 19-byte 0x003F verification
  // payload plus the nine MachineSummaryDetail fields verbatim.
  const REALISTIC_SUMMARY = {
    verificationBytes: [
      118, 120, 230, 126, 35, 227, 228, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
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

  it("round-trips fractional machine totals and the summary blob (POST -> GET)", async () => {
    const bearer = await bearerToken();
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        ...validLogBody(),
        machineWorkSeconds: 24.3,
        machineWorkMeters: 76,
        machineSummary: REALISTIC_SUMMARY,
      });
    expect(created.status).toBe(201);

    const got = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(got.status).toBe(200);
    expect(got.body.machineWorkSeconds).toBe(24.3);
    expect(got.body.machineWorkMeters).toBe(76);
    expect(got.body.machineSummary).toStrictEqual(REALISTIC_SUMMARY);
  });

  // Design spec §4 names BOTH real pairs for the server round-trip
  // criterion, not just the terminate capture's 24.3/76 above: a natural
  // finish's own 0x0039, decoded verbatim from `phone-exit7-ring.json`
  // (seq 61, raw `88 35 03 0f 70 30 00 88 13 00 ...` — elapsed
  // `readU24LE(bytes,4)/100` = 0x003070/100 = 124.0, distance
  // `readU24LE(bytes,7)/10` = 0x001388/10 = 500.0). Both land on whole
  // numbers at this particular capture's wire values (unlike the
  // terminate capture's tenths-precision 24.3), which is itself the
  // point: a real natural finish CAN produce a whole number, so the
  // route must accept one exactly as readily as a fractional one.
  it("round-trips the natural-finish capture's real pair (124.0s / 500m) — the spec's second named example, distinct from the terminate capture's 24.3/76", async () => {
    const bearer = await bearerToken();
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        ...validLogBody(),
        machineWorkSeconds: 124.0,
        machineWorkMeters: 500,
      });
    expect(created.status).toBe(201);

    const got = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(got.status).toBe(200);
    expect(got.body.machineWorkSeconds).toBe(124.0);
    expect(got.body.machineWorkMeters).toBe(500);
  });

  it("stores nulls when the machine fields are absent (a pre-this-task client, or a non-monitor door)", async () => {
    const bearer = await bearerToken();
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(validLogBody());
    expect(created.status).toBe(201);

    const got = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(got.status).toBe(200);
    expect(got.body.machineWorkSeconds).toBeNull();
    expect(got.body.machineWorkMeters).toBeNull();
    expect(got.body.machineSummary).toBeNull();
  });

  it("stores nulls when the machine fields are explicit null", async () => {
    const bearer = await bearerToken();
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        ...validLogBody(),
        machineWorkSeconds: null,
        machineWorkMeters: null,
        machineSummary: null,
      });
    expect(created.status).toBe(201);

    const got = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(got.status).toBe(200);
    expect(got.body.machineWorkSeconds).toBeNull();
    expect(got.body.machineWorkMeters).toBeNull();
    expect(got.body.machineSummary).toBeNull();
  });

  it("400s a fractional machineWorkMeters, field-named — nothing is persisted", async () => {
    const bearer = await bearerToken();
    const before = await request(app)
      .get("/api/logs")
      .set("Authorization", bearer);
    const countBefore = before.body.length;

    const rejected = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({ ...validLogBody(), machineWorkMeters: 76.5 });
    expect(rejected.status).toBe(400);
    expect(rejected.body.field).toBe("machineWorkMeters");

    const after = await request(app)
      .get("/api/logs")
      .set("Authorization", bearer);
    expect(after.body.length).toBe(countBefore);
  });

  it("400s a machineSummary that is not an object (an array)", async () => {
    const bearer = await bearerToken();
    const rejected = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({ ...validLogBody(), machineSummary: [1, 2, 3] });
    expect(rejected.status).toBe(400);
    expect(rejected.body.field).toBe("machineSummary");
  });

  it("400s a machineSummary whose serialized size exceeds 2048 bytes", async () => {
    const bearer = await bearerToken();
    const rejected = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        ...validLogBody(),
        machineSummary: { avgStrokeRate: "x".repeat(2100) },
      });
    expect(rejected.status).toBe(400);
    expect(rejected.body.field).toBe("machineSummary");
  });

  it("400s a machineSummary.verificationBytes entry out of the 0-255 band", async () => {
    const bearer = await bearerToken();
    const rejected = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        ...validLogBody(),
        machineSummary: { verificationBytes: [0, 1, 256] },
      });
    expect(rejected.status).toBe(400);
    expect(rejected.body.field).toBe("machineSummary");
  });

  it("400s an empty machineSummary.verificationBytes array", async () => {
    const bearer = await bearerToken();
    const rejected = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        ...validLogBody(),
        machineSummary: { verificationBytes: [] },
      });
    expect(rejected.status).toBe(400);
    expect(rejected.body.field).toBe("machineSummary");
  });

  it("accepts a machineSummary carrying only verificationBytes (no summaryDetail — a build-738-era record's honest shape)", async () => {
    const bearer = await bearerToken();
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        ...validLogBody(),
        machineSummary: { verificationBytes: [1, 2, 3] },
      });
    expect(created.status).toBe(201);

    const got = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(got.body.machineSummary).toStrictEqual({
      verificationBytes: [1, 2, 3],
    });
  });

  it("a row written before this task (no machine_* keys at all) reads back unchanged — legacy rows are unaffected", async () => {
    const bearer = await bearerToken();
    // Simulates a pre-migration-0016 client: the fields are never posted at
    // all, not even as explicit null.
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        workoutId: null,
        workoutTitle: "Pre-Task-6 Row",
        workoutType: "AN",
        held: null,
        pain: null,
        notes: null,
        steps: [{ label: "2000 m" }],
        // Required since the v0.35.0 sunset; orthogonal to the machine_*
        // absence this test is about.
        source: "manual",
      });
    expect(created.status).toBe(201);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.machineWorkSeconds).toBeNull();
    expect(log.body.machineWorkMeters).toBeNull();
    expect(log.body.machineSummary).toBeNull();
  });
});
