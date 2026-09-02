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
describe("POST/GET /api/logs: a FREE ROW round-trips, and advances the plan only when its body opts in", () => {
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

  // THE PLAN ARMS, THROUGH THE ROUTE — and the earlier version of the
  // first of these could not fail. It asserted `created.body.planIndex`,
  // but `POST /api/logs` returns only `{ id }`, so that read was always
  // undefined; and with no plan selected, the log's own `planKey`/
  // `planIndex` stay null whichever way the store resolves. It survived the
  // exact mutation it existed to catch — RF21, committed while fixing an
  // RF24.
  //
  // Fixed by observing the thing that actually moves: select a plan first,
  // then read `GET /api/plan`'s `doneN` after the POST.
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

  // Substitution spec (2026-09-02), exit criterion 1 — the three arms of a
  // free row's `advancesPlan`, and the workout row re-pinned beside them.
  // The default is the STORE's (`stores/logs.ts`'s `create`:
  // `advancesPlan ?? !isFreeRow(...)`); the route passes the field through
  // untouched. Each arm reads `GET /api/plan`'s `doneN` and the row's own
  // link after the POST, because those are what a rower would see move.
  // One user, one container, one plan_state row for the whole file — so
  // each arm starts from a RESET counter (`PUT /api/plan {reset: true}`;
  // a same-key PUT is deliberately a no-op on `done_n`). A reset
  // re-stamps index 0, and each arm reads its own row's link by id, so
  // the collision never reaches an assertion.
  async function chooseSprint(bearer: string) {
    const chosen = await request(app)
      .put("/api/plan")
      .set("Authorization", bearer)
      .send({ planKey: "sprint" });
    expect(chosen.status).toBe(200);
    const reset = await request(app)
      .put("/api/plan")
      .set("Authorization", bearer)
      .send({ reset: true });
    expect(reset.status).toBe(200);
    expect(reset.body.planKey).toBe("sprint");
    expect(reset.body.doneN).toBe(0);
  }

  async function doneN(bearer: string): Promise<number> {
    const plan = await request(app)
      .get("/api/plan")
      .set("Authorization", bearer);
    expect(plan.status).toBe(200);
    expect(plan.body.planKey).toBe("sprint");
    return plan.body.doneN;
  }

  async function linkOf(bearer: string, id: string) {
    const log = await request(app)
      .get(`/api/logs/${id}`)
      .set("Authorization", bearer);
    expect(log.status).toBe(200);
    return {
      planKey: log.body.planKey ?? null,
      planIndex: log.body.planIndex ?? null,
    };
  }

  it("a free row whose body says advancesPlan: true advances the plan and receives the link (criterion 1, opt-in arm)", async () => {
    const bearer = await bearerToken();
    await chooseSprint(bearer);

    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(freeRowBody({ advancesPlan: true }));
    expect(created.status).toBe(201);

    expect(await doneN(bearer)).toBe(1);
    expect(await linkOf(bearer, created.body.id)).toStrictEqual({
      planKey: "sprint",
      planIndex: 0,
    });
  });

  it("a free row whose body says advancesPlan: false leaves the plan alone and gets no link (criterion 1, opt-out arm)", async () => {
    const bearer = await bearerToken();
    await chooseSprint(bearer);

    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(freeRowBody({ advancesPlan: false }));
    expect(created.status).toBe(201);

    expect(await doneN(bearer)).toBe(0);
    expect(await linkOf(bearer, created.body.id)).toStrictEqual({
      planKey: null,
      planIndex: null,
    });
  });

  // The arm the route used to decide with `?? true`: an ABSENT key on a
  // free row now resolves, in the store, to "does not advance". A route
  // that grew its default back would take this from 0 to 1.
  it("a free row with advancesPlan ABSENT leaves the plan alone and gets no link (criterion 1, absent arm)", async () => {
    const bearer = await bearerToken();
    await chooseSprint(bearer);

    const body = freeRowBody();
    delete (body as { advancesPlan?: unknown }).advancesPlan;
    expect("advancesPlan" in body).toBe(false);
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(body);
    expect(created.status).toBe(201);

    expect(await doneN(bearer)).toBe(0);
    expect(await linkOf(bearer, created.body.id)).toStrictEqual({
      planKey: null,
      planIndex: null,
    });
  });

  // Re-pinned beside the new arm: the same absent key on a WORKOUT row
  // still advances, exactly as every log did before the field existed.
  it("a workout row with advancesPlan ABSENT still advances (the pre-existing default, re-pinned)", async () => {
    const bearer = await bearerToken();
    await chooseSprint(bearer);

    const body = freeRowBody({
      workoutType: "AN",
      workoutTitle: "Prescribed",
      steps: [{ label: "2000 m" }],
    });
    delete (body as { advancesPlan?: unknown }).advancesPlan;
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(body);
    expect(created.status).toBe(201);

    expect(await doneN(bearer)).toBe(1);
    expect(await linkOf(bearer, created.body.id)).toStrictEqual({
      planKey: "sprint",
      planIndex: 0,
    });
  });

  // THE DELETE HALF (criterion 1). A stand-in that is deleted stops
  // standing in: the opted-in free row carries a link, and `delete()`
  // un-counts a linked row exactly as it does any other — the spec's own
  // ruling (§"What DOES change"), stated for James to overrule at Gate 0
  // and not overruled. The ordinary row goes first so `doneN` sits at 2
  // before the delete and a wrong decrement (or none) is visible either
  // side of 1.
  it("deleting an opted-in free row decrements done_n (criterion 1, delete half)", async () => {
    const bearer = await bearerToken();
    await chooseSprint(bearer);

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
    expect(await doneN(bearer)).toBe(1);

    const free = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(freeRowBody({ advancesPlan: true }));
    expect(free.status).toBe(201);
    expect(await doneN(bearer)).toBe(2);
    expect(await linkOf(bearer, free.body.id)).toStrictEqual({
      planKey: "sprint",
      planIndex: 1,
    });

    const removed = await request(app)
      .delete(`/api/logs/${free.body.id}`)
      .set("Authorization", bearer);
    expect(removed.status).toBe(200);

    expect(await doneN(bearer)).toBe(1);
  });

  // And the row that never stood in cannot stop standing in: the delete
  // path keys on the stored LINK, which only an advancing save writes
  // (the antagonist's held ground, 2026-09-02 rev 2 pass).
  it("deleting a free row that did NOT opt in leaves done_n unchanged", async () => {
    const bearer = await bearerToken();
    await chooseSprint(bearer);

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
    expect(await doneN(bearer)).toBe(1);

    const body = freeRowBody();
    delete (body as { advancesPlan?: unknown }).advancesPlan;
    const free = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(body);
    expect(free.status).toBe(201);
    expect(await doneN(bearer)).toBe(1);

    const removed = await request(app)
      .delete(`/api/logs/${free.body.id}`)
      .set("Authorization", bearer);
    expect(removed.status).toBe(200);

    expect(await doneN(bearer)).toBe(1);
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
