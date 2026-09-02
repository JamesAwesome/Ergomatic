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

// Series capture spec (2026-08-19), §4's table, S5: "Postgres round-trips
// a 650 KB jsonb value without surprises" — the check is "an integration
// test posting the full worst case: insert + GET /:id read-back
// sample-identical + the list query timed with the column proven absent
// from its SELECT." This file proves the FULL chain end to end — real
// route-scoped body-limit middleware (`app.ts`), real route validator
// (`routes/data.ts`'s `validateSeries`), real store (`stores/logs.ts`),
// real Postgres (Testcontainers, same idiom as
// `logAmendment.integration.test.ts`) — never the in-memory fake. The
// store-level half of S5 (insert + get, both real and fake) is
// `storeContracts.ts`'s own "series" describe, which also carries the
// list projection's drift pin (list = get - steps - series).
describe("POST /api/logs: the full 14,400-sample worst-case series, through the REAL middleware (S5)", () => {
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
        allowlist: new Set(["series@log.test"]),
        nativeVerifier: async () => ({
          sub: "series-sub",
          email: "series@log.test",
          emailVerified: true,
          name: "Series Rower",
        }),
        stores,
      }),
    );
  }, 120_000);

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("posts, stores, and reads back the full worst-case series sample-identical; the list omits it", async () => {
    const minted = await request(app)
      .post("/api/auth/native")
      .send({ idToken: "stub" });
    expect(minted.status).toBe(200);
    const bearer = `Bearer ${minted.body.token}`;

    // Ruling 2's cap (14,400 samples), hr present on every sample (the
    // antagonist's own worst-case arithmetic, §1: 50.0 B/sample with hr
    // -> ~720 KB) — varying, non-degenerate values throughout so a
    // sample-identical comparison actually exercises every field, not a
    // repeated constant a bug could hide behind.
    const samples = Array.from({ length: 14_400 }, (_, i) => ({
      t: (i + 1) * 10,
      d: (i + 1) * 23,
      p: 1200 + (i % 800),
      spm: 18 + (i % 40),
      hr: 110 + (i % 140),
    }));
    const series = { samples, truncated: true as const };

    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send({
        workoutId: null,
        workoutTitle: "Long Steady State",
        workoutType: "AT",
        notes: null,
        steps: [{ label: "Work" }],
        source: "manual",
        series,
      });
    // Not 413: the route-scoped 1mb limit (app.ts) let this ~720 KB body
    // through; the default 100KB limit every other route keeps would have
    // rejected it (proven directly in app.test.ts).
    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(fetched.status).toBe(200);
    // toStrictEqual, not toMatchObject: proves every one of the 14,400
    // samples round-tripped through real Postgres jsonb byte-for-byte —
    // no TOAST-compression surprise, no truncation, no reordering.
    expect(fetched.body.series).toStrictEqual(series);

    // The list query is proven not to select the column: `LOG_LIST_COLUMNS`
    // (`stores/logs.ts`) is a positive, hand-named column list that never
    // mentions `series` — this is the HTTP-level witness of that; the
    // store-level drift pin (`storeContracts.ts`) is what actually proves
    // the SELECT can never silently regain it.
    //
    // LOW-4 (fix round): S4's own reporting idiom
    // (`src/monitor/monitorRun.test.ts`'s "the measured milliseconds
    // STATED in the test output") applied to S4's sibling check — S5's
    // own "the list query timed with the column proven absent from its
    // SELECT" — with a 720 KB row genuinely present for THIS user. The
    // bound is generous on purpose: this measures a real HTTP round trip
    // through Testcontainers Postgres (auth, routing, JSON
    // serialization), not the tight in-process budget S4's own
    // JSON.stringify-only probe uses — the claim under test is "excluding
    // the column keeps list cheap regardless of the row's own size," not
    // a perf SLA on this harness's own network stack.
    const listStart = performance.now();
    const list = await request(app)
      .get("/api/logs")
      .set("Authorization", bearer);
    const listElapsedMs = performance.now() - listStart;
    console.log(
      `S5 list-query probe: GET /api/logs with a 720KB series row present took ${listElapsedMs.toFixed(2)}ms`,
    );
    expect(list.status).toBe(200);
    expect(list.body[0]).not.toHaveProperty("series");
    expect(
      listElapsedMs,
      `S5 list-query probe: GET /api/logs with a 720KB series row present took ${listElapsedMs.toFixed(2)}ms`,
    ).toBeLessThan(3000);
  }, 60_000);
});
