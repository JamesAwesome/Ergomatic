import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { noStore, requireUser } from "../auth/middleware.js";
import type { SessionStore, SessionUser } from "../auth/sessions.js";
import { StoreConflictError } from "../stores/errors.js";
import type { BaselinesRow, BaselinesStore } from "../stores/baselines.js";
import type { LogInput, LogsStore } from "../stores/logs.js";
import type {
  PlanKey,
  PlanStateRow,
  PlanStateStore,
} from "../stores/planState.js";
import type {
  PreferencesPatch,
  PreferencesRow,
  PreferencesStore,
} from "../stores/preferences.js";
import type { TestHistoryStore } from "../stores/testHistory.js";
import type { NewWorkoutInput, WorkoutsStore } from "../stores/workouts.js";
import type { WorkoutInput } from "../../domain/types.js";
import { PLANS } from "../../domain/plans.js";
import { PREFERENCES_DEFAULTS } from "../stores/preferences.js";
import { createDataRouter, type Stores } from "./data.js";

// ---------------------------------------------------------------------------
// In-memory fakes, keyed by userId, mirroring the real stores' signatures
// exactly (per app/server/stores/*.ts). This file is the API contract.
// ---------------------------------------------------------------------------

interface WorkoutRow extends WorkoutInput {
  id: string;
  userId: string | null;
  source: "starter" | "user";
  createdAt: Date;
  updatedAt: Date;
}

// Fakes are cast with `as unknown as <RealStoreType>` (the same pattern the
// existing auth tests use for fake stores) rather than relying on
// contextual typing from the real store types: the real stores' `get`/
// `update` methods are inferred (via a Drizzle `rows[0] ?? null` idiom,
// with `noUncheckedIndexedAccess` off) as NEVER returning null at the type
// level even though they do at runtime — matching that exactly would make
// the fakes lie about the very null case the routes need to handle.

function makeFakeBaselinesStore(): BaselinesStore {
  const rows = new Map<string, BaselinesRow>();
  return {
    async get(userId: string) {
      return rows.get(userId) ?? null;
    },
    async put(
      userId: string,
      patch: { k2Seconds?: number | null; k6Seconds?: number | null },
    ) {
      const current = rows.get(userId) ?? { k2Seconds: null, k6Seconds: null };
      rows.set(userId, { ...current, ...patch });
    },
  } as unknown as BaselinesStore;
}

// Mirrors the real store's global-library semantics (app/server/stores/
// workouts.ts): globals live in their own bucket, keyed by nothing but id
// (no owning user), and every personal bucket's list/get is unioned with
// them. update/remove only ever touch a caller's own personal bucket — they
// structurally cannot reach `globals`, exactly like the real store's
// `user_id = $userId` predicate can never match a NULL user_id row.
function makeFakeWorkoutsStore(): WorkoutsStore & {
  _seedGlobal: (input: NewWorkoutInput) => WorkoutRow;
} {
  const byUser = new Map<string, Map<string, WorkoutRow>>();
  const globals = new Map<string, WorkoutRow>();
  const forUser = (userId: string) => {
    let m = byUser.get(userId);
    if (!m) {
      m = new Map();
      byUser.set(userId, m);
    }
    return m;
  };
  const withIsGlobal = (row: WorkoutRow) => ({
    ...row,
    isGlobal: row.userId === null,
  });
  const create = async (
    userId: string,
    input: NewWorkoutInput,
  ): Promise<WorkoutRow> => {
    const m = forUser(userId);
    if ([...m.values()].some((w) => w.num === input.num)) {
      throw new StoreConflictError(`workout num ${input.num} already exists`);
    }
    const row: WorkoutRow = {
      ...input,
      id: crypto.randomUUID(),
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    m.set(row.id, row);
    return withIsGlobal(row) as unknown as WorkoutRow;
  };
  return {
    async list(userId: string) {
      const all = [...globals.values(), ...forUser(userId).values()];
      return all.map(withIsGlobal).sort((a, b) => a.num - b.num);
    },
    async get(userId: string, id: string) {
      const g = globals.get(id);
      if (g) return withIsGlobal(g);
      const row = forUser(userId).get(id);
      return row ? withIsGlobal(row) : null;
    },
    create,
    async createMany(userId: string, inputs: NewWorkoutInput[]) {
      const out: WorkoutRow[] = [];
      for (const input of inputs) {
        out.push(await create(userId, input));
      }
      return out;
    },
    async update(userId: string, id: string, input: WorkoutInput) {
      const m = forUser(userId);
      const existing = m.get(id);
      if (!existing) return null;
      if ([...m.values()].some((w) => w.id !== id && w.num === input.num)) {
        throw new StoreConflictError(`workout num ${input.num} already exists`);
      }
      const row: WorkoutRow = { ...existing, ...input, updatedAt: new Date() };
      m.set(id, row);
      return withIsGlobal(row);
    },
    async remove(userId: string, id: string) {
      forUser(userId).delete(id);
    },
    async count(userId: string) {
      return forUser(userId).size;
    },
    async listGlobals() {
      return [...globals.values()]
        .map(withIsGlobal)
        .sort((a, b) => a.num - b.num);
    },
    async countGlobals() {
      return globals.size;
    },
    // Test-only seam: the real store's globals come from seedGlobalLibrary
    // at boot, never through this router. Injects a global row directly.
    _seedGlobal(input: NewWorkoutInput) {
      const row: WorkoutRow = {
        ...input,
        id: crypto.randomUUID(),
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      globals.set(row.id, row);
      return withIsGlobal(row) as unknown as WorkoutRow;
    },
  } as unknown as WorkoutsStore & {
    _seedGlobal: (input: NewWorkoutInput) => WorkoutRow;
  };
}

type FakePlanStateStore = PlanStateStore & {
  _advance: (userId: string, by?: number) => void;
};

function makeFakePlanStateStore(): FakePlanStateStore {
  const rows = new Map<string, PlanStateRow>();
  return {
    async get(userId: string) {
      return rows.get(userId) ?? null;
    },
    set: vi.fn(async (userId: string, planKey: PlanKey | null) => {
      rows.set(userId, { planKey, doneN: 0 });
    }),
    reset: vi.fn(async (userId: string) => {
      const current = rows.get(userId) ?? { planKey: null, doneN: 0 };
      rows.set(userId, { ...current, doneN: 0 });
    }),
    // test-only helper mimicking the real store's transactional done_n bump
    // from inside logs.create — not part of the real store's interface.
    _advance(userId: string, by = 1) {
      const current = rows.get(userId) ?? { planKey: null, doneN: 0 };
      rows.set(userId, { ...current, doneN: current.doneN + by });
    },
  } as unknown as FakePlanStateStore;
}

function makeFakeLogsStore(planState: FakePlanStateStore): LogsStore {
  const byUser = new Map<
    string,
    Array<LogInput & { id: string; loggedAt: Date }>
  >();
  return {
    async list(userId: string, limit: number) {
      return (byUser.get(userId) ?? []).slice(0, limit);
    },
    async create(userId: string, input: LogInput) {
      const rows = byUser.get(userId) ?? [];
      const row = { ...input, id: crypto.randomUUID(), loggedAt: new Date() };
      rows.unshift(row);
      byUser.set(userId, rows);
      planState._advance(userId);
      return { id: row.id };
    },
    async lastDonePerWorkout(userId: string) {
      const result: Record<string, number> = {};
      for (const row of byUser.get(userId) ?? []) {
        if (row.workoutId) result[row.workoutId] = 0;
      }
      return result;
    },
  } as unknown as LogsStore;
}

function makeFakePreferencesStore(): PreferencesStore {
  const rows = new Map<string, PreferencesRow>();
  return {
    async get(userId: string) {
      return rows.get(userId) ?? { ...PREFERENCES_DEFAULTS };
    },
    // vi.fn-wrapped so a test can assert the empty-patch guard short-circuits
    // BEFORE the store is touched — the fake itself would happily accept an
    // empty patch (a plain object spread is a no-op), unlike the real
    // store's upsert, which needs a non-empty `SET` clause. Spying is the
    // only way this file can prove the guard fires, since the fake can't
    // reproduce the real 500.
    put: vi.fn(async (userId: string, patch: PreferencesPatch) => {
      const current = rows.get(userId) ?? { ...PREFERENCES_DEFAULTS };
      rows.set(userId, { ...current, ...patch });
    }),
  } as unknown as PreferencesStore;
}

function makeFakeTestHistoryStore(): TestHistoryStore {
  const byUser = new Map<
    string,
    Array<{
      id: string;
      distance: "2k" | "6k";
      splitSeconds: number;
      deltaSeconds: number | null;
    }>
  >();
  return {
    async list(userId: string) {
      return byUser.get(userId) ?? [];
    },
    async append(
      userId: string,
      input: { distance: "2k" | "6k"; splitSeconds: number },
    ) {
      const rows = byUser.get(userId) ?? [];
      const previous = [...rows]
        .reverse()
        .find((r) => r.distance === input.distance);
      const row = {
        id: crypto.randomUUID(),
        distance: input.distance,
        splitSeconds: input.splitSeconds,
        deltaSeconds: previous
          ? input.splitSeconds - previous.splitSeconds
          : null,
      };
      rows.push(row);
      byUser.set(userId, rows);
      return row;
    },
  } as unknown as TestHistoryStore;
}

function makeStores(): Stores {
  const planState = makeFakePlanStateStore();
  return {
    baselines: makeFakeBaselinesStore(),
    workouts: makeFakeWorkoutsStore(),
    logs: makeFakeLogsStore(planState),
    planState,
    preferences: makeFakePreferencesStore(),
    testHistory: makeFakeTestHistoryStore(),
  };
}

const userA: SessionUser = { id: "user-a", email: "a@x.com", name: "A" };
const userB: SessionUser = { id: "user-b", email: "b@x.com", name: "B" };

function fakeSessionStore(): SessionStore {
  const users: Record<string, SessionUser> = {
    "token-a": userA,
    "token-b": userB,
  };
  return {
    resolveSession: async (token: string) => {
      const user = users[token];
      if (!user) return null;
      return {
        user,
        expiresAt: new Date(Date.now() + 100_000),
        refreshed: false,
      };
    },
  } as unknown as SessionStore;
}

function appFor(stores: Stores) {
  const app = express();
  app.use(express.json());
  // Mounted here too (not just in the real app.ts) so this file also
  // documents/proves the data router inherits no-store when composed the
  // same way createApp composes it.
  app.use(noStore);
  app.use(
    createDataRouter({ stores, requireUser: requireUser(fakeSessionStore()) }),
  );
  return app;
}

const asA = (req: request.Test) => req.set("Authorization", "Bearer token-a");
const asB = (req: request.Test) => req.set("Authorization", "Bearer token-b");

// Well-formed but guaranteed-absent from any fake store's map.
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

function validWorkoutBody(overrides: Partial<WorkoutInput> = {}): WorkoutInput {
  return {
    num: 1,
    title: "Steady State",
    type: "AT",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "2k", off: 10 },
      },
    ],
    ...overrides,
  };
}

// Injects a global (starter-library) row via the fake store's test-only
// seam, mirroring what seedGlobalLibrary does for real against Postgres.
function seedGlobalWorkout(
  stores: Stores,
  overrides: Partial<WorkoutInput> = {},
) {
  return (
    stores.workouts as unknown as {
      _seedGlobal: (input: NewWorkoutInput) => {
        id: string;
        num: number;
        title: string;
      };
    }
  )._seedGlobal({ ...validWorkoutBody(overrides), source: "starter" });
}

// ---------------------------------------------------------------------------

describe("data router: auth guard", () => {
  const routes: Array<[string, string]> = [
    ["get", "/api/baselines"],
    ["put", "/api/baselines"],
    ["get", "/api/workouts"],
    ["post", "/api/workouts"],
    ["get", "/api/workouts/x"],
    ["put", "/api/workouts/x"],
    ["delete", "/api/workouts/x"],
    ["post", "/api/workouts/bulk"],
    ["get", "/api/logs"],
    ["post", "/api/logs"],
    ["get", "/api/plan"],
    ["put", "/api/plan"],
    ["get", "/api/prefs"],
    ["put", "/api/prefs"],
    ["get", "/api/test-history"],
    ["get", "/api/today"],
  ];

  it.each(routes)("401s %s %s without a session", async (method, path) => {
    const app = appFor(makeStores());
    const agent = request(app) as unknown as Record<
      string,
      (p: string) => request.Test
    >;
    const res = await agent[method](path);
    expect(res.status).toBe(401);
  });
});

describe("data router: no-store", () => {
  it("inherits Cache-Control: no-store when composed the way app.ts composes it", async () => {
    const res = await asA(request(appFor(makeStores())).get("/api/baselines"));
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("GET/PUT /api/baselines", () => {
  it("GET returns null baselines when unset", async () => {
    const res = await asA(request(appFor(makeStores())).get("/api/baselines"));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ k2Seconds: null, k6Seconds: null });
  });

  it("PUT updates a field and GET reflects it", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    const put = await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
    });
    expect(put.status).toBe(200);
    expect(put.body).toStrictEqual({ k2Seconds: 120, k6Seconds: null });

    const get = await asA(request(app).get("/api/baselines"));
    expect(get.body).toStrictEqual({ k2Seconds: 120, k6Seconds: null });
  });

  it("rejects out-of-bounds k2Seconds with 400 + field", async () => {
    const res = await asA(
      request(appFor(makeStores())).put("/api/baselines"),
    ).send({ k2Seconds: 30 });
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({
      error: expect.any(String),
      field: "k2Seconds",
    });
  });

  it("rejects out-of-bounds k6Seconds with 400 + field", async () => {
    const res = await asA(
      request(appFor(makeStores())).put("/api/baselines"),
    ).send({ k6Seconds: 999 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("k6Seconds");
  });

  it("isTestResult appends to test history for each provided distance", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      isTestResult: true,
    });
    const history = await stores.testHistory.list(userA.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      distance: "2k",
      splitSeconds: 120,
      deltaSeconds: null,
    });
  });

  it("isTestResult with both fields appends two history rows", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
      isTestResult: true,
    });
    const history = await stores.testHistory.list(userA.id);
    expect(history.map((h) => h.distance).sort()).toStrictEqual(["2k", "6k"]);
  });
});

describe("workouts CRUD", () => {
  it("GET list starts empty", async () => {
    const res = await asA(request(appFor(makeStores())).get("/api/workouts"));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual([]);
  });

  it("POST creates a workout and it appears in the list", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ num: 1, title: "Steady State" });

    const list = await asA(request(app).get("/api/workouts"));
    expect(list.body).toHaveLength(1);
  });

  it("POST rejects an invalid workout with 400", async () => {
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts"),
    ).send(validWorkoutBody({ steps: [] }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST 409s on a num clash for the same user", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ num: 5 }),
    );
    const clash = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ num: 5, title: "Other" }),
    );
    expect(clash.status).toBe(409);
  });

  it("the same num does not clash across users", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ num: 5 }),
    );
    const res = await asB(request(app).post("/api/workouts")).send(
      validWorkoutBody({ num: 5 }),
    );
    expect(res.status).toBe(201);
  });

  it("GET /:id returns the workout", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    const res = await asA(request(app).get(`/api/workouts/${created.body.id}`));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("GET /:id 404s on a malformed (non-uuid) id, without ever hitting the store", async () => {
    const res = await asA(
      request(appFor(makeStores())).get("/api/workouts/does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("GET /:id 404s on a well-formed but absent id", async () => {
    const res = await asA(
      request(appFor(makeStores())).get(`/api/workouts/${NON_EXISTENT_UUID}`),
    );
    expect(res.status).toBe(404);
  });

  it("GET /:id 404s on a foreign (cross-user) id", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    const res = await asB(request(app).get(`/api/workouts/${created.body.id}`));
    expect(res.status).toBe(404);
  });

  it("PUT /:id updates the workout", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    const res = await asA(
      request(app).put(`/api/workouts/${created.body.id}`),
    ).send(validWorkoutBody({ title: "Renamed" }));
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed");
  });

  it("PUT /:id 404s on a malformed (non-uuid) id", async () => {
    const res = await asA(
      request(appFor(makeStores())).put("/api/workouts/does-not-exist"),
    ).send(validWorkoutBody());
    expect(res.status).toBe(404);
  });

  it("PUT /:id 404s on a well-formed but absent id (does not silently no-op)", async () => {
    const res = await asA(
      request(appFor(makeStores())).put(`/api/workouts/${NON_EXISTENT_UUID}`),
    ).send(validWorkoutBody());
    expect(res.status).toBe(404);
  });

  it("PUT /:id 404s on a foreign id rather than leaking a 400/409", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    const res = await asB(
      request(app).put(`/api/workouts/${created.body.id}`),
    ).send(validWorkoutBody());
    expect(res.status).toBe(404);
  });

  it("PUT /:id rejects an invalid body with 400", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    const res = await asA(
      request(app).put(`/api/workouts/${created.body.id}`),
    ).send(validWorkoutBody({ pain: 99 }));
    expect(res.status).toBe(400);
  });

  it("PUT /:id 409s on a num clash with a sibling workout", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ num: 1 }),
    );
    const second = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ num: 2 }),
    );
    const res = await asA(
      request(app).put(`/api/workouts/${second.body.id}`),
    ).send(validWorkoutBody({ num: 1 }));
    expect(res.status).toBe(409);
  });

  it("DELETE /:id removes the workout", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    const res = await asA(
      request(app).delete(`/api/workouts/${created.body.id}`),
    );
    expect(res.status).toBe(204);
    const after = await asA(
      request(app).get(`/api/workouts/${created.body.id}`),
    );
    expect(after.status).toBe(404);
  });

  it("DELETE /:id 404s on a malformed (non-uuid) id", async () => {
    const res = await asA(
      request(appFor(makeStores())).delete("/api/workouts/does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /:id 404s on a well-formed but absent id", async () => {
    const res = await asA(
      request(appFor(makeStores())).delete(
        `/api/workouts/${NON_EXISTENT_UUID}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /:id 404s on a foreign id (does not delete it)", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    const res = await asB(
      request(app).delete(`/api/workouts/${created.body.id}`),
    );
    expect(res.status).toBe(404);
    const stillThere = await asA(
      request(app).get(`/api/workouts/${created.body.id}`),
    );
    expect(stillThere.status).toBe(200);
  });
});

describe("global starter library", () => {
  it("GET list includes global rows tagged isGlobal:true alongside the caller's own isGlobal:false rows", async () => {
    const stores = makeStores();
    seedGlobalWorkout(stores, { num: 500, title: "Global One" });
    seedGlobalWorkout(stores, { num: 501, title: "Global Two" });
    await asA(request(appFor(stores)).post("/api/workouts")).send(
      validWorkoutBody({ num: 1 }),
    );

    const res = await asA(request(appFor(stores)).get("/api/workouts"));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const globalRows = res.body.filter(
      (w: { isGlobal: boolean }) => w.isGlobal,
    );
    const personalRows = res.body.filter(
      (w: { isGlobal: boolean }) => !w.isGlobal,
    );
    expect(globalRows).toHaveLength(2);
    expect(personalRows).toHaveLength(1);
    expect(
      globalRows.every((w: { userId: string | null }) => w.userId === null),
    ).toBe(true);
  });

  it("GET /:id resolves a global id for any caller, tagged isGlobal:true", async () => {
    const stores = makeStores();
    const g = seedGlobalWorkout(stores, { num: 502, title: "Global Gettable" });
    const res = await asB(request(appFor(stores)).get(`/api/workouts/${g.id}`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: g.id,
      title: "Global Gettable",
      isGlobal: true,
    });
  });

  it("PUT /:id on a global workout 403s starter_readonly instead of writing", async () => {
    const stores = makeStores();
    const g = seedGlobalWorkout(stores, {
      num: 503,
      title: "Global Untouchable",
    });
    const res = await asA(
      request(appFor(stores)).put(`/api/workouts/${g.id}`),
    ).send(validWorkoutBody({ num: 503, title: "Hijacked" }));
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "starter_readonly" });

    // untouched
    const after = await asB(
      request(appFor(stores)).get(`/api/workouts/${g.id}`),
    );
    expect(after.body.title).toBe("Global Untouchable");
  });

  it("DELETE /:id on a global workout 403s starter_readonly instead of deleting", async () => {
    const stores = makeStores();
    const g = seedGlobalWorkout(stores, { num: 504, title: "Global Survivor" });
    const res = await asA(
      request(appFor(stores)).delete(`/api/workouts/${g.id}`),
    );
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "starter_readonly" });

    const after = await asB(
      request(appFor(stores)).get(`/api/workouts/${g.id}`),
    );
    expect(after.status).toBe(200);
  });

  it("POST creates a personal workout whose num collides with a GLOBAL num (separate namespaces)", async () => {
    const stores = makeStores();
    seedGlobalWorkout(stores, { num: 505, title: "Global Five-Oh-Five" });
    const res = await asA(request(appFor(stores)).post("/api/workouts")).send(
      validWorkoutBody({ num: 505, title: "My Own 505" }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      num: 505,
      title: "My Own 505",
      isGlobal: false,
    });
  });
});

describe("POST /api/workouts/bulk", () => {
  it("requires a text field", async () => {
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts/bulk"),
    ).send({});
    expect(res.status).toBe(400);
  });

  it("creates every workout in a valid multi-block paste", async () => {
    const text = `1 | Ladder | AT | medium | 3\nwu 10\nw 1' 6k-2 @22 r5\n\n2 | Steady | O2 | easy | 1\nwu 10\nw 20' 2k+10`;
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(2);
    expect(res.body.errors).toStrictEqual([]);
  });

  it("reports parse errors per line while still creating the valid blocks", async () => {
    const text = `1 | Ladder | AT | medium | 3\nwu 10\nw 1' 6k-2 @22 r5\n\n2 | Bad | ZZ | easy | 1\nwu 10`;
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("reports a per-line num-clash without failing the rest of the batch", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ num: 1 }),
    );
    const text = `1 | Clash | AT | medium | 3\nwu 10\nw 1' 6k @20\n\n2 | Fine | O2 | easy | 1\nwu 10\nw 1' 2k @20`;
    const res = await asA(request(app).post("/api/workouts/bulk")).send({
      text,
    });
    expect(res.body.created).toHaveLength(1);
    expect(res.body.errors).toHaveLength(1);
  });

  it("reports domain validation failures for syntactically-valid but out-of-bounds workouts", async () => {
    const text = `1 | Bad Pain | AT | medium | 9\nwu 10\nw 1' 6k @20`;
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.body.created).toHaveLength(0);
    expect(res.body.errors).toHaveLength(1);
  });
});

describe("GET/POST /api/logs", () => {
  const validLogBody = () => ({
    workoutId: null,
    workoutTitle: "Steady State",
    workoutType: "AT",
    held: "held",
    pain: 2,
    notes: null,
    steps: [
      {
        label: "Work",
        targetSplit: 120,
        actualSplit: 121,
        actualSource: "stopwatch",
      },
    ],
  });

  it("GET starts empty", async () => {
    const res = await asA(request(appFor(makeStores())).get("/api/logs"));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual([]);
  });

  it("POST creates a log, freezing current baselines, and it is listed after", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    const created = await asA(request(app).post("/api/logs")).send(
      validLogBody(),
    );
    expect(created.status).toBe(201);

    const list = await asA(request(app).get("/api/logs"));
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      baselineK2: 120,
      baselineK6: 130,
      workoutTitle: "Steady State",
    });
  });

  it("respects ?limit=", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/logs")).send(validLogBody());
    await asA(request(app).post("/api/logs")).send(validLogBody());
    const res = await asA(request(app).get("/api/logs?limit=1"));
    expect(res.body).toHaveLength(1);
  });

  it("rejects an invalid actualSource with 400 + field steps", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        steps: [{ label: "Work", targetSplit: 120, actualSource: "radar" }],
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("steps");
  });

  it("rejects an invalid held value with 400", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        held: "sideways",
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("held");
  });

  it("rejects a malformed (non-uuid) workoutId with 400 + field, without touching the store", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        workoutId: "not-a-uuid",
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("workoutId");
  });

  it("rejects a well-formed but absent workoutId with 400 + field (would otherwise FK-violate)", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        workoutId: NON_EXISTENT_UUID,
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("workoutId");
  });

  it("rejects a foreign (cross-user) workoutId with 400 + field, not a 500", async () => {
    const app = appFor(makeStores());
    const workout = await asB(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    const res = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      workoutId: workout.body.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("workoutId");
  });

  it("accepts a workoutId the caller actually owns", async () => {
    const app = appFor(makeStores());
    const workout = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    const res = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      workoutId: workout.body.id,
    });
    expect(res.status).toBe(201);
  });

  it.each([
    ["label missing", { targetSplit: 120, actualSource: "assumed" }],
    [
      "label too long",
      { label: "x".repeat(81), targetSplit: 120, actualSource: "assumed" },
    ],
    [
      "targetSplit out of range (too low)",
      { label: "W", targetSplit: 10, actualSource: "assumed" },
    ],
    [
      "targetSplit out of range (too high)",
      { label: "W", targetSplit: 900, actualSource: "assumed" },
    ],
    [
      "actualSplit out of range",
      {
        label: "W",
        targetSplit: 120,
        actualSplit: 900,
        actualSource: "assumed",
      },
    ],
    [
      "spm not an integer",
      { label: "W", targetSplit: 120, actualSource: "assumed", spm: 20.5 },
    ],
    [
      "spm out of range",
      { label: "W", targetSplit: 120, actualSource: "assumed", spm: 5 },
    ],
    [
      "meters out of range",
      { label: "W", targetSplit: 120, actualSource: "assumed", meters: 50 },
    ],
    [
      "seconds out of range",
      { label: "W", targetSplit: 120, actualSource: "assumed", seconds: 99999 },
    ],
  ])(
    "rejects a step with %s: 400 + field steps, index in the message",
    async (_label, step) => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [step],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
      expect(res.body.error).toContain("steps[0]");
    },
  );

  it("strips unknown keys from a step rather than persisting them", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      steps: [
        {
          label: "Work",
          targetSplit: 120,
          actualSource: "assumed",
          notAStepField: "should be dropped",
        },
      ],
    });
    const list = await asA(request(app).get("/api/logs"));
    expect(list.body[0].steps[0]).toStrictEqual({
      label: "Work",
      targetSplit: 120,
      actualSource: "assumed",
    });
  });

  it("rejects more than 200 steps with 400 + field steps", async () => {
    const step = {
      label: "Work",
      targetSplit: 120,
      actualSource: "assumed" as const,
    };
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        steps: Array.from({ length: 201 }, () => step),
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("steps");
  });
});

describe("GET/PUT /api/plan", () => {
  it("GET with no plan selected returns an empty sequence", async () => {
    const res = await asA(request(appFor(makeStores())).get("/api/plan"));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ planKey: null, doneN: 0, sequence: [] });
  });

  it("PUT selects a plan and returns its 84-entry sequence", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/plan")).send({
      planKey: "sprint",
    });
    expect(res.status).toBe(200);
    expect(res.body.planKey).toBe("sprint");
    expect(res.body.doneN).toBe(0);
    expect(res.body.sequence).toHaveLength(84);
    expect(res.body.sequence[0]).toStrictEqual({
      index: 0,
      code: PLANS.sprint.sessions[0],
      status: "today",
    });
  });

  it("PUT rejects an unknown planKey with 400", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/plan")).send({
      planKey: "marathon",
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("planKey");
  });

  it("PUT with neither planKey nor reset is a 400", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/plan")).send(
      {},
    );
    expect(res.status).toBe(400);
  });

  it("re-PUTting the SAME planKey preserves doneN and does not call set()", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
    // advance progress via a log (bumps done_n in the same way the real transaction would)
    await asA(request(app).post("/api/logs")).send({
      workoutId: null,
      workoutTitle: "X",
      workoutType: "AT",
      held: "held",
      pain: 1,
      notes: null,
      steps: [{ label: "W", targetSplit: 100, actualSource: "assumed" }],
    });
    vi.mocked(stores.planState.set).mockClear();

    const res = await asA(request(app).put("/api/plan")).send({
      planKey: "sprint",
    });
    expect(res.body.doneN).toBe(1);
    expect(stores.planState.set).not.toHaveBeenCalled();
  });

  it("PUTting a DIFFERENT planKey resets doneN to 0 and calls set()", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
    await asA(request(app).post("/api/logs")).send({
      workoutId: null,
      workoutTitle: "X",
      workoutType: "AT",
      held: "held",
      pain: 1,
      notes: null,
      steps: [{ label: "W", targetSplit: 100, actualSource: "assumed" }],
    });

    const res = await asA(request(app).put("/api/plan")).send({
      planKey: "head",
    });
    expect(res.body).toMatchObject({ planKey: "head", doneN: 0 });
    expect(stores.planState.set).toHaveBeenCalledWith(userA.id, "head");
  });

  it("PUT {reset:true} zeroes doneN without changing the plan", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
    await asA(request(app).post("/api/logs")).send({
      workoutId: null,
      workoutTitle: "X",
      workoutType: "AT",
      held: "held",
      pain: 1,
      notes: null,
      steps: [{ label: "W", targetSplit: 100, actualSource: "assumed" }],
    });
    const res = await asA(request(app).put("/api/plan")).send({ reset: true });
    expect(res.body).toMatchObject({ planKey: "sprint", doneN: 0 });
    expect(stores.planState.reset).toHaveBeenCalledWith(userA.id);
  });
});

describe("GET/PUT /api/prefs", () => {
  it("GET returns the spec defaults", async () => {
    const res = await asA(request(appFor(makeStores())).get("/api/prefs"));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual(PREFERENCES_DEFAULTS);
  });

  it("PUT updates a field and GET reflects the merge", async () => {
    const app = appFor(makeStores());
    const put = await asA(request(app).put("/api/prefs")).send({
      accentColor: "#00ff00",
    });
    expect(put.status).toBe(200);
    expect(put.body.accentColor).toBe("#00ff00");
    const get = await asA(request(app).get("/api/prefs"));
    expect(get.body.accentColor).toBe("#00ff00");
  });

  it("PUT {} is a no-op read, not a write (real store 500s on an empty SET clause)", async () => {
    const stores = makeStores();
    const res = await asA(request(appFor(stores)).put("/api/prefs")).send({});
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual(PREFERENCES_DEFAULTS);
    expect(stores.preferences.put).not.toHaveBeenCalled();
  });

  it("PUT with only unknown keys is also a no-op read", async () => {
    const stores = makeStores();
    const res = await asA(request(appFor(stores)).put("/api/prefs")).send({
      notARealField: 123,
    });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual(PREFERENCES_DEFAULTS);
    expect(stores.preferences.put).not.toHaveBeenCalled();
  });

  it("rejects an invalid difficulties entry with 400 + field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      {
        difficulties: ["easy", "insane"],
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("difficulties");
  });

  it("rejects a malformed accentColor with 400 + field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      { accentColor: "red" },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("accentColor");
  });

  it("accepts a full valid patch across every field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      {
        difficulties: ["easy"],
        timeCapMinutes: 45,
        warmupMinutes: 12,
        warmupOverride: true,
        countdownSeconds: 5,
        paceToleranceSeconds: 2,
        accentColor: "#123456",
      },
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      difficulties: ["easy"],
      timeCapMinutes: 45,
      warmupMinutes: 12,
      warmupOverride: true,
      countdownSeconds: 5,
      paceToleranceSeconds: 2,
      accentColor: "#123456",
    });
  });

  it("rejects an out-of-range timeCapMinutes with 400 + field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      { timeCapMinutes: 5 },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("timeCapMinutes");
  });

  it("rejects an out-of-range warmupMinutes with 400 + field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      { warmupMinutes: 100 },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("warmupMinutes");
  });

  it("rejects a non-boolean warmupOverride with 400 + field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      { warmupOverride: "yes" },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("warmupOverride");
  });

  it("rejects an out-of-range countdownSeconds with 400 + field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      { countdownSeconds: 999 },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("countdownSeconds");
  });

  it("rejects an out-of-range paceToleranceSeconds with 400 + field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      { paceToleranceSeconds: 99 },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("paceToleranceSeconds");
  });
});

describe("GET /api/test-history", () => {
  it("starts empty", async () => {
    const res = await asA(
      request(appFor(makeStores())).get("/api/test-history"),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual([]);
  });

  it("reflects entries appended via baselines isTestResult", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      isTestResult: true,
    });
    const res = await asA(request(app).get("/api/test-history"));
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/today", () => {
  it("422s with baselines_required when baselines are unset", async () => {
    const res = await asA(request(appFor(makeStores())).get("/api/today"));
    expect(res.status).toBe(422);
    expect(res.body).toStrictEqual({ error: "baselines_required" });
  });

  it("422s when only one baseline is set", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/baselines")).send({ k2Seconds: 120 });
    const res = await asA(request(app).get("/api/today"));
    expect(res.status).toBe(422);
  });

  it("with no active plan, falls back to the sprint plan at doneN 0 but reports planKey: null", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    const res = await asA(request(app).get("/api/today"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      todayCode: PLANS.sprint.sessions[0],
      doneN: 0,
      planKey: null,
    });
  });

  it("recommends a matching-type workout from the library", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    const todayCode = PLANS.sprint.sessions[0];
    const created = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({
        type: todayCode as "AN" | "O2" | "AT" | "TR",
        num: 1,
      }),
    );
    const res = await asA(request(app).get("/api/today"));
    expect(res.body.recommendation).toBe(created.body.id);
    expect(res.body.pool).toContain(created.body.id);
  });

  it("reports no recommendation when the library has no matching-type workout", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    const res = await asA(request(app).get("/api/today"));
    expect(res.body.recommendation).toBeNull();
    expect(res.body.pool).toStrictEqual([]);
  });

  it("the pool spans globals: a global workout of the matching type appears in poolIds", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    const todayCode = PLANS.sprint.sessions[0];
    // Seeded via the same test-only seam data.test.ts's "global starter
    // library" block uses — no personal workout created at all here, so if
    // the global didn't show up in the pool, it could only be because
    // stores.workouts.list()/today's library-building step failed to span
    // globals.
    const g = seedGlobalWorkout(stores, {
      num: 900,
      title: "Global Pool Entry",
      type: todayCode as "AN" | "O2" | "AT" | "TR",
    });
    const res = await asA(request(app).get("/api/today"));
    expect(res.status).toBe(200);
    expect(res.body.pool).toContain(g.id);
    expect(res.body.recommendation).toBe(g.id);
  });

  it("uses the selected plan and doneN, not the fallback, and reports the real planKey", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    await asA(request(app).put("/api/plan")).send({ planKey: "head" });
    const res = await asA(request(app).get("/api/today"));
    expect(res.body.todayCode).toBe(PLANS.head.sessions[0]);
    expect(res.body.planKey).toBe("head");
  });
});
