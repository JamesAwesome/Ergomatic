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

// Phase PS PR 1, spec §8.2 (RF24): every case starts UPSTREAM of the
// producer — real Postgres, migrated through `drizzle/`, seeded through
// the real `POST /api/logs` validator — and asserts on what
// `GET /api/stats/rows` returns. Same harness as
// `source.integration.test.ts`.

function makeStores(db: Db): Stores {
  return {
    baselines: createBaselinesStore(db),
    workouts: createWorkoutsStore(db),
    logs: createLogsStore(db),
    planState: createPlanStateStore(db),
    preferences: createPreferencesStore(db),
    testHistory: createTestHistoryStore(db),
    articleReads: createArticleReadsStore(db),
  };
}

// The exit-7 walk's two steps (docs/monitor/sessions/walk-2026-08-24):
// Σ 500 m / 124.0 s.
const EXIT7_STEPS = [
  {
    label: "250m @ 2:07.0",
    targetSplit: 127,
    actualSplit: 135.8,
    actualSource: "pm5",
    actualSeconds: 67.9,
    actualMeters: 250,
    meters: 250,
  },
  {
    label: "250m @ 2:07.0",
    targetSplit: 127,
    actualSplit: 112.2,
    actualSource: "pm5",
    actualSeconds: 56.1,
    actualMeters: 250,
    meters: 250,
  },
];
/** The rest amount the FUSED machine row carries on top of its work
 *  metres — named so the mutation's failure prints `620` beside `500`. */
const FUSED_REST_METERS = 120;

const STATS_ROW_KEYS = [
  "id",
  "loggedAt",
  "source",
  "workoutType",
  "tier",
  "workMeters",
  "workSeconds",
  "restMeters",
  "restSeconds",
  "calories",
];

describe("GET /api/stats/rows — the supported save path produces the projection the surface sums (spec §8.2)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
    app = createApp(
      baseDeps({
        sessions: createSessionStore(db),
        users: createUserStore(db),
        allowlist: new Set(["stats@log.test"]),
        nativeVerifier: async () => ({
          sub: "stats-sub",
          email: "stats@log.test",
          emailVerified: true,
          name: "Stats Rower",
        }),
        stores: makeStores(db),
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

  function body(overrides: Record<string, unknown>) {
    return {
      workoutId: null,
      workoutTitle: "Sea Fret",
      workoutType: "O2",
      held: null,
      effort: null,
      notes: null,
      advancesPlan: false,
      ...overrides,
    };
  }

  it("one row per tier, MACHINE by door, a FUSED machine row projected as its machine totals, a pre-RC-5 row counted as tier stored, and no Concept2 key", async () => {
    const bearer = await bearerToken();
    const seeds: Record<string, Record<string, unknown>> = {
      // tier machine, FUSED on purpose: distanceMeters = machine + 120 rest.
      machineFused: body({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "finished",
        steps: EXIT7_STEPS,
        machineWorkSeconds: 124,
        machineWorkMeters: 500,
        workSeconds: 124,
        workMeters: 500,
        restSeconds: 120,
        restMeters: 242,
        distanceMeters: 500 + FUSED_REST_METERS,
        timeSeconds: 244,
        machineSummary: { totalCalories: 37 },
      }),
      // tier work-pair: link lost before the monitor's totals.
      workPair: body({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "link-lost",
        workoutType: null,
        steps: [],
        workSeconds: 800.5,
        workMeters: 3012,
        restSeconds: 0,
        restMeters: 0,
      }),
      // tier steps: by hand, step actuals, no close reason.
      steps: body({
        source: "manual",
        workoutType: "TR",
        steps: [{ label: "2k", actualMeters: 2000, actualSeconds: 470.2 }],
      }),
      // tier stored, pre-RC-5 shape: fused columns, no pair, no machine
      // totals, endedBy OUTSIDE the allowlist so the step actuals decline.
      preRc5: body({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "rower",
        steps: EXIT7_STEPS,
        distanceMeters: 742,
        timeSeconds: 244,
        avgSplitSeconds: 138.8,
      }),
      // tier stored, a pm5 row closed link-lost with nothing measured.
      pm5LinkLost: body({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "link-lost",
        steps: [{ label: "Work" }],
        distanceMeters: 560,
        timeSeconds: 150,
      }),
      // tier stored, a plain manual row.
      manual: body({
        source: "manual",
        workoutType: "AT",
        steps: [{ label: "Work" }],
        distanceMeters: 2000,
        timeSeconds: 480,
      }),
    };
    const ids: Record<string, string> = {};
    for (const [name, seed] of Object.entries(seeds)) {
      const created = await request(app)
        .post("/api/logs")
        .set("Authorization", bearer)
        .send(seed);
      expect(created.status, `${name}: ${created.text}`).toBe(201);
      ids[name] = created.body.id;
    }

    const res = await request(app)
      .get("/api/stats/rows")
      .set("Authorization", bearer);
    expect(res.status).toBe(200);
    const rows = res.body.rows as Record<string, unknown>[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(rows).toHaveLength(6);
    for (const r of rows)
      expect(Object.keys(r).sort()).toStrictEqual([...STATS_ROW_KEYS].sort());

    expect(byId.get(ids.machineFused)).toMatchObject({
      tier: "machine",
      workMeters: 500,
      workSeconds: 124,
      restMeters: 242,
      calories: 37,
      source: "pm5",
      workoutType: "O2",
    });
    expect(byId.get(ids.workPair)).toMatchObject({
      tier: "work-pair",
      workMeters: 3012,
      workSeconds: 800.5,
      workoutType: null,
    });
    expect(byId.get(ids.steps)).toMatchObject({
      tier: "steps",
      workMeters: 2000,
      workSeconds: 470.2,
      source: "manual",
    });
    expect(byId.get(ids.preRc5)).toMatchObject({
      tier: "stored",
      workMeters: 742,
      workSeconds: 244,
    });
    expect(byId.get(ids.pm5LinkLost)).toMatchObject({
      tier: "stored",
      workMeters: 560,
      source: "pm5",
    });
    expect(byId.get(ids.manual)).toMatchObject({
      tier: "stored",
      workMeters: 2000,
      calories: null,
    });
    // The `k ROWS PREDATE` count the surface prints: three stored-tier rows.
    expect(rows.filter((r) => r.tier === "stored")).toHaveLength(3);
    // Every loggedAt is the ISO instant the type promises.
    for (const r of rows)
      expect(new Date(r.loggedAt as string).toISOString()).toBe(r.loggedAt);
  });
});
