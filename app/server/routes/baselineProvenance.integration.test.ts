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
// Phase BL PR A (baseline-onboarding spec 2026-08-22 rev 2, "The stored
// shape"): the whole ruling is per-NUMBER provenance, so the two claims
// that carry it are proven here against the REAL wire and REAL Postgres:
//
//   1. An old client's plain write (no source fields at all — every PUT
//      the app has ever sent until this PR) stamps `manual` on exactly
//      the fields it writes, and NEVER flips a source it didn't write:
//      a hand-set `tested` k2 survives any number of k6-only writes.
//   2. Per-field independence: a patch naming only k2 cannot touch
//      k6's source, and vice versa — riding the same per-key
//      onConflictDoUpdate semantics the editor's `touched` machinery
//      already relies on.
//
// Reads go straight to the baselines table: GET /api/baselines is
// deliberately numbers-only (the lean-GET decision), so the API itself
// cannot witness provenance — which is also asserted below.
// ---------------------------------------------------------------------------
describe("PUT /api/baselines provenance against real Postgres (Phase BL PR A)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let bearer: string;
  let userId: string;

  const rawRow = async () =>
    (await db.select().from(baselines).where(eq(baselines.userId, userId)))[0];

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
        allowlist: new Set(["provenance@baseline.test"]),
        nativeVerifier: async () => ({
          sub: "provenance-sub",
          email: "provenance@baseline.test",
          emailVerified: true,
          name: "Provenance Rower",
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
      .where(eq(users.email, "provenance@baseline.test"));
    userId = u.id;
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("an old client's plain first write lands manual/manual — the truthful stamp for a typed entry", async () => {
    const res = await request(app)
      .put("/api/baselines")
      .set("Authorization", bearer)
      .send({ k2Seconds: 118, k6Seconds: 127 });
    expect(res.status).toBe(200);

    const row = await rawRow();
    expect(row.k2Source).toBe("manual");
    expect(row.k6Source).toBe("manual");
  });

  it("a k6-only plain write never flips a hand-set tested k2Source — sources move only with their own number", async () => {
    // Hand-set upstream state: PR B's post-test prompt will write this
    // for real; until then the DB is the only writer of `tested`.
    await db
      .update(baselines)
      .set({ k2Source: "tested" })
      .where(eq(baselines.userId, userId));

    const res = await request(app)
      .put("/api/baselines")
      .set("Authorization", bearer)
      .send({ k6Seconds: 130 });
    expect(res.status).toBe(200);

    const row = await rawRow();
    expect(row.k2Source).toBe("tested");
    expect(row.k6Source).toBe("manual");
    expect(row.k6Seconds).toBe(130);
  });

  it("a plain write that DOES carry k2Seconds flips the tested source back to manual — the rower retyped the number", async () => {
    const res = await request(app)
      .put("/api/baselines")
      .set("Authorization", bearer)
      .send({ k2Seconds: 119 });
    expect(res.status).toBe(200);

    const row = await rawRow();
    expect(row.k2Seconds).toBe(119);
    expect(row.k2Source).toBe("manual");
  });

  it("an explicit derived source lands beside its number and leaves the other field's source untouched", async () => {
    const res = await request(app)
      .put("/api/baselines")
      .set("Authorization", bearer)
      .send({ k6Seconds: 126, k6Source: "derived" });
    expect(res.status).toBe(200);

    const row = await rawRow();
    expect(row.k6Source).toBe("derived");
    expect(row.k2Source).toBe("manual");
  });

  it("a garbage source 400s and writes NOTHING — neither number nor source moves", async () => {
    const before = await rawRow();
    const res = await request(app)
      .put("/api/baselines")
      .set("Authorization", bearer)
      .send({ k2Seconds: 100, k2Source: "banana" });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("k2Source");
    expect(await rawRow()).toStrictEqual(before);
  });

  it("GET serves numbers only — provenance is stored, never served (lean-GET decision)", async () => {
    const res = await request(app)
      .get("/api/baselines")
      .set("Authorization", bearer);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ k2Seconds: 119, k6Seconds: 126 });
  });
});
