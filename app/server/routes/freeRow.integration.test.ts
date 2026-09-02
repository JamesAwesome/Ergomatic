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

// THE SUPPORTED PRODUCER (Phase JR PR 1; exit criteria 1, 2 and 3; review
// of 29e00561, finding 2).
//
// PR 1's own relaxed `POST /api/logs` is the only producer of a free row
// that exists — PR 2 builds the screen. Every other new test in this PR
// calls `logs.create()` directly, which enters the pipe BELOW the route
// validator, so the validator could regress to rejecting a null type or an
// empty `steps` and all of them would stay green. That is recurring
// failure 24 exactly, and this file is the gate that closes it: it starts
// at the HTTP boundary and asserts after the GET.
//
// Real Postgres, migrated through `drizzle/` — so it proves the migration
// too, not just the code.
describe("POST/GET /api/logs: a FREE ROW round-trips, and never advances the plan", () => {
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
        allowlist: new Set(["freerow@log.test"]),
        nativeVerifier: async () => ({
          sub: "freerow-sub",
          email: "freerow@log.test",
          emailVerified: true,
          name: "Free Rower",
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

  function freeRowBody(overrides: Record<string, unknown> = {}) {
    return {
      workoutId: null,
      workoutTitle: "Just Row",
      workoutType: null,
      held: null,
      pain: null,
      notes: null,
      steps: [],
      advancesPlan: true,
      ...overrides,
    };
  }

  it("accepts a null type and empty steps, and reads both back (criteria 2 and 3)", async () => {
    const bearer = await bearerToken();
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(freeRowBody());
    expect(created.status).toBe(201);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.workoutType).toBeNull();
    expect(log.body.steps).toStrictEqual([]);
  });

  // CRITERION 1, THROUGH THE ROUTE — and the earlier version of this test
  // could not fail. It asserted `created.body.planIndex`, but
  // `POST /api/logs` returns only `{ id }`, so that read was always
  // undefined; and with no plan selected, the log's own `planKey`/
  // `planIndex` stay null whether or not the refusal fires. It survived the
  // exact mutation it existed to catch — RF21, committed while fixing an
  // RF24.
  //
  // Fixed by observing the thing that actually moves: select a plan first,
  // then read `GET /api/plan`'s `doneN` after the POST. Removing the
  // refusal takes that from 0 to 1.
  // Just Row unconnected spec (2026-09-02), exit criterion 2: the TIME-ONLY
  // free row rides this same shape — `source: "timer"`, a `timeSeconds`,
  // no distance key at all — and reads back with no distance to render.
  it("a time-only free row (source timer, steps [], no distanceMeters key) round-trips with distance null", async () => {
    const bearer = await bearerToken();
    const sent = freeRowBody({
      advancesPlan: false,
      source: "timer",
      timeSeconds: 754,
    });
    expect("distanceMeters" in sent).toBe(false);
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(sent);
    expect(created.status).toBe(201);
    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.source).toBe("timer");
    expect(log.body.timeSeconds).toBe(754);
    expect(log.body.distanceMeters).toBeNull();
    expect(log.body.avgSplitSeconds).toBeNull();
    expect(log.body.steps).toStrictEqual([]);
  });

  it("refuses to advance the plan even when the body asks to (criterion 1)", async () => {
    const bearer = await bearerToken();
    const chosen = await request(app)
      .put("/api/plan")
      .set("Authorization", bearer)
      .send({ planKey: "sprint" });
    expect(chosen.status).toBe(200);
    expect(chosen.body.doneN).toBe(0);

    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(freeRowBody());
    expect(created.status).toBe(201);

    const plan = await request(app)
      .get("/api/plan")
      .set("Authorization", bearer);
    expect(plan.status).toBe(200);
    expect(plan.body.planKey).toBe("sprint");
    expect(plan.body.doneN).toBe(0);

    const log = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    expect(log.body.planKey ?? null).toBeNull();
  });

  // THE FROZEN DELETE REGRESSION (criterion 1's second half). It is a
  // DEPENDENT pin, not an independent gate — `delete()` returns
  // `unCounted: false` for any `planKey === null` row, which the create-side
  // refusal already forces. Frozen all the same, and it was missing: the
  // pre-existing non-plan-linked delete test never creates a free row and
  // never looks at plan state.
  it("deleting a free row leaves done_n unchanged (criterion 1, delete half)", async () => {
    const bearer = await bearerToken();
    await request(app)
      .put("/api/plan")
      .set("Authorization", bearer)
      .send({ planKey: "sprint" });

    // A real prescribed session first, so `doneN` is non-zero and a wrong
    // un-count would move it DOWN rather than being invisible against 0.
    const ordinary = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(
        freeRowBody({
          workoutType: "AN",
          workoutTitle: "Prescribed",
          steps: [{ label: "2000 m" }],
        }),
      );
    expect(ordinary.status).toBe(201);
    const afterOrdinary = await request(app)
      .get("/api/plan")
      .set("Authorization", bearer);
    expect(afterOrdinary.body.doneN).toBe(1);

    const free = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(freeRowBody());
    expect(free.status).toBe(201);
    const afterFree = await request(app)
      .get("/api/plan")
      .set("Authorization", bearer);
    expect(afterFree.body.doneN).toBe(1);

    const removed = await request(app)
      .delete(`/api/logs/${free.body.id}`)
      .set("Authorization", bearer);
    expect(removed.status).toBe(200);

    const afterDelete = await request(app)
      .get("/api/plan")
      .set("Authorization", bearer);
    expect(afterDelete.body.doneN).toBe(1);
  });

  // The other side of the same validator: empty steps are allowed ONLY for
  // a free row. A row that names a type still owes at least one step, so a
  // regression that simply stopped checking would fail here.
  it("still rejects empty steps when the row carries a type", async () => {
    const bearer = await bearerToken();
    const res = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(freeRowBody({ workoutType: "AN" }));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("steps");
  });

  // And the type union is still closed to everything except null.
  it("still rejects a garbage workoutType", async () => {
    const bearer = await bearerToken();
    const res = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(freeRowBody({ workoutType: "JustRow", steps: [{ label: "x" }] }));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("workoutType");
  });
});
