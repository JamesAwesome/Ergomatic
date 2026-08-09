import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { noStore, requireUser } from "../auth/middleware.js";
import type { SessionStore, SessionUser } from "../auth/sessions.js";
import type { NewWorkoutInput } from "../stores/workouts.js";
import type { WorkoutInput } from "../../domain/types.js";
import { PLANS } from "../../domain/plans.js";
import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import { PREFERENCES_DEFAULTS } from "../stores/preferences.js";
import { makeFakeStores } from "../testing/fakes.js";
import { createDataRouter, type Stores } from "./data.js";

// In-memory fakes, keyed by userId, mirroring the real stores' signatures
// exactly, live in app/server/testing/fakes.ts (shared with other server
// tests). This file is the API contract that exercises them.
const makeStores = makeFakeStores;

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
    title: "Steady State",
    type: "AT",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "r", minutes: 10 },
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
  overrides: Partial<NewWorkoutInput> = {},
) {
  const { sortOrder = null, source = "starter", ...rest } = overrides;
  return (
    stores.workouts as unknown as {
      _seedGlobal: (input: NewWorkoutInput) => {
        id: string;
        sortOrder: number | null;
        title: string;
      };
    }
  )._seedGlobal({ ...validWorkoutBody(rest), source, sortOrder });
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
    expect(created.body).toMatchObject({ title: "Steady State" });

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

  // 2026-07-30: `num` is retired, so there is no workout-level uniqueness
  // left to violate — two identical posts both succeed rather than 409ing.
  it("POST accepts a second workout identical to the first", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/workouts")).send(validWorkoutBody());
    const again = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody(),
    );
    expect(again.status).toBe(201);
    const list = await asA(request(app).get("/api/workouts"));
    expect(list.body).toHaveLength(2);
  });

  // H1 regression: validateWorkoutInput returns the SAME object reference as
  // req.body, so an extra `sortOrder` field the client tacked on used to
  // flow straight through create() and pin a personal row anywhere in the
  // list (or reach Postgres as a bad type and 500). create() now hard-codes
  // sortOrder null for every personal row, so a client can no longer author
  // it at all — proved end-to-end through the route, not just the store.
  it("POST ignores a client-supplied sortOrder rather than honoring it", async () => {
    const stores = makeStores();
    seedGlobalWorkout(stores, { sortOrder: 1, title: "Global Leader" });
    const app = appFor(stores);
    const created = await asA(request(app).post("/api/workouts")).send({
      ...validWorkoutBody(),
      sortOrder: -1,
    });
    expect(created.status).toBe(201);
    expect(created.body.sortOrder).toBeNull();

    // The global still leads the list: a negative sortOrder did not pin the
    // personal row above it.
    const list = await asA(request(app).get("/api/workouts"));
    expect(list.body[0]).toMatchObject({ title: "Global Leader" });
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

  // M1 regression: the real UPDATE (app/server/stores/workouts.ts) never
  // touches sort_order, and the in-memory fake now mirrors that exactly
  // (previously it spread the raw request body over the existing row,
  // silently honoring a client-supplied sortOrder that Postgres would have
  // ignored). Proved through the route so a future re-introduction of
  // `{ ...existing, ...input }` shows up here, not just in a store-level test.
  it("PUT ignores a client-supplied sortOrder rather than honoring it", async () => {
    const app = appFor(makeStores());
    const first = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ title: "First" }),
    );
    const second = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ title: "Second" }),
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const res = await asA(
      request(app).put(`/api/workouts/${second.body.id}`),
    ).send({
      ...validWorkoutBody({ title: "Second Renamed" }),
      sortOrder: -100,
    });
    expect(res.status).toBe(200);
    expect(res.body.sortOrder).toBeNull();

    // Creation order is unchanged: the PUT's sortOrder did not pin "Second
    // Renamed" ahead of "First".
    const list = await asA(request(app).get("/api/workouts"));
    expect(list.body.map((w: { title: string }) => w.title)).toStrictEqual([
      "First",
      "Second Renamed",
    ]);
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

  it("PUT /:id may make a workout identical to a sibling", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ title: "First" }),
    );
    const second = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ title: "Second" }),
    );
    const res = await asA(
      request(app).put(`/api/workouts/${second.body.id}`),
    ).send(validWorkoutBody({ title: "First" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: second.body.id, title: "First" });
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

describe("GET /api/workouts: lastDoneDaysAgo", () => {
  it("includes lastDoneDaysAgo on each workout so the library can filter by recency", async () => {
    const stores = makeStores();
    const workout = await stores.workouts.create(userA.id, {
      title: "Zephyr",
      type: "O2",
      difficulty: "easy",
      pain: 2,
      steps: [{ k: "r", minutes: 10 }],
      source: "user",
    });
    stores.logs.lastDonePerWorkout = async () => ({ [workout.id]: 33 });

    const res = await asA(request(appFor(stores)).get("/api/workouts"));

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: workout.id, lastDoneDaysAgo: 33 });
  });

  it("reports lastDoneDaysAgo as null for a workout that has never been logged", async () => {
    const stores = makeStores();
    await stores.workouts.create(userA.id, {
      title: "Squall",
      type: "AT",
      difficulty: "hard",
      pain: 4,
      steps: [{ k: "r", minutes: 10 }],
      source: "user",
    });

    const res = await asA(request(appFor(stores)).get("/api/workouts"));

    expect(res.body[0].lastDoneDaysAgo).toBeNull();
  });
});

describe("global starter library", () => {
  it("GET list includes global rows tagged isGlobal:true alongside the caller's own isGlobal:false rows", async () => {
    const stores = makeStores();
    seedGlobalWorkout(stores, { sortOrder: 500, title: "Global One" });
    seedGlobalWorkout(stores, { sortOrder: 501, title: "Global Two" });
    await asA(request(appFor(stores)).post("/api/workouts")).send(
      validWorkoutBody(),
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
    const g = seedGlobalWorkout(stores, {
      sortOrder: 502,
      title: "Global Gettable",
    });
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
      sortOrder: 503,
      title: "Global Untouchable",
    });
    const res = await asA(
      request(appFor(stores)).put(`/api/workouts/${g.id}`),
    ).send(validWorkoutBody({ title: "Hijacked" }));
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
    const g = seedGlobalWorkout(stores, {
      sortOrder: 504,
      title: "Global Survivor",
    });
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

  it("POST creates a personal workout sharing a global's title, as its own isGlobal:false row", async () => {
    const stores = makeStores();
    seedGlobalWorkout(stores, { sortOrder: 505, title: "Squall Line" });
    const res = await asA(request(appFor(stores)).post("/api/workouts")).send(
      validWorkoutBody({ title: "Squall Line" }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Squall Line",
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

  // All-or-nothing (Phase 5B merge bug: a plain per-workout loop stranded
  // already-landed blocks on a later failure, and re-importing the same
  // paste duplicated them). Reversal from the pre-transaction behavior
  // this test used to pin: a parse error on block 2 used to still create
  // block 1; it must now create NOTHING, so the rower can fix the one bad
  // block and re-paste the WHOLE text without duplicating what already
  // landed.
  it("reports parse errors per line, but creates NOTHING when the paste has ANY error — all-or-nothing", async () => {
    const text = `1 | Ladder | AT | medium | 3\nwu 10\nw 1' 6k-2 @22 r5\n\n2 | Bad | ZZ | easy | 1\nwu 10`;
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(0);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("reports domain validation failures for syntactically-valid but out-of-bounds workouts, creating nothing", async () => {
    const text = `1 | Bad Pain | AT | medium | 9\nwu 10\nw 1' 6k @20`;
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.body.created).toHaveLength(0);
    expect(res.body.errors).toHaveLength(1);
  });

  // Shape pin (whole-batch review, Important #1): nothing above asserts
  // the exact per-line error entry SHAPE — a rename of `line`/`message`,
  // or a change to the composed text, would still pass every assertion
  // above. `toStrictEqual` on the one real entry a validation failure
  // produces pins both keys and their exact values, structurally.
  it("a validation-failure error entry has the exact {line, message} shape the route's own API surface promises", async () => {
    const text = `1 | Bad Pain | AT | medium | 9\nwu 10\nw 1' 6k @20`;
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.body.created).toHaveLength(0);
    expect(res.body.errors).toStrictEqual([
      { line: null, message: 'workout "Bad Pain": pain must be 1..5' },
    ]);
  });

  // The falsifying test (brief's own framing): assert the actual PERSISTED
  // count via the store directly, not just what the response body claims
  // — a route that still inserted rows behind a lying `created: []` would
  // pass every assertion above but fail this one.
  it("a paste whose Nth block fails leaves ZERO rows actually persisted — the valid EARLIER blocks don't land either", async () => {
    const stores = makeStores();
    const text = `1 | Ladder | AT | medium | 3\nwu 10\nw 1' 6k-2 @22 r5\n\n2 | Steady | O2 | easy | 1\nwu 10\nw 20' 2k+10\n\n3 | Bad | ZZ | easy | 1\nwu 10`;
    const res = await asA(
      request(appFor(stores)).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(0);
    expect(res.body.errors.length).toBeGreaterThan(0);

    expect(await stores.workouts.count("user-a")).toBe(0);
    const titles = (await stores.workouts.list("user-a")).map((w) => w.title);
    expect(titles).not.toContain("Ladder");
    expect(titles).not.toContain("Steady");
  });

  it("a clean multi-block paste lands all of them, with the error report's shape unchanged (created + errors, byte-identical)", async () => {
    const stores = makeStores();
    const text = `1 | Ladder | AT | medium | 3\nwu 10\nw 1' 6k-2 @22 r5\n\n2 | Steady | O2 | easy | 1\nwu 10\nw 20' 2k+10`;
    const res = await asA(
      request(appFor(stores)).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      created: expect.any(Array),
      errors: [],
    });
    expect(res.body.created).toHaveLength(2);
    expect(await stores.workouts.count("user-a")).toBe(2);
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
        steps: [
          {
            label: "Work",
            targetSplit: 120,
            actualSplit: 120,
            actualSource: "radar",
          },
        ],
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
      {
        label: "W",
        targetSplit: 120,
        actualSplit: 120,
        actualSource: "assumed",
        spm: 20.5,
      },
    ],
    [
      "spm out of range",
      {
        label: "W",
        targetSplit: 120,
        actualSplit: 120,
        actualSource: "assumed",
        spm: 5,
      },
    ],
    [
      "meters out of range",
      {
        label: "W",
        targetSplit: 120,
        actualSplit: 120,
        actualSource: "assumed",
        meters: 50,
      },
    ],
    [
      "seconds out of range",
      {
        label: "W",
        targetSplit: 120,
        actualSplit: 120,
        actualSource: "assumed",
        seconds: 99999,
      },
    ],
    // Amendment (Task 1.5): actualSplit/actualSource are a paired unit —
    // one present without the other is rejected in BOTH directions.
    [
      "actualSource present without actualSplit",
      { label: "W", targetSplit: 120, actualSource: "assumed" },
    ],
    [
      "actualSplit present without actualSource",
      { label: "W", targetSplit: 120, actualSplit: 120 },
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

  // Amendment (Task 1.5): targetSplit is now optional (an effort step's
  // frozen split is an estimate, never a prescription — the 5G rule), and
  // actualSplit/actualSource are a paired unit. These pin the new arms the
  // it.each rejection block above doesn't cover: the ACCEPT side, and the
  // 400 message actually naming the pairing (not just its status/field).
  it("accepts a step with no targetSplit and no actuals at all (effort-shaped, matching logDraft.ts's 5G-rule step)", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      steps: [{ label: "0:30 @ ALL OUT" }],
    });
    expect(created.status).toBe(201);
    const list = await asA(request(app).get("/api/logs"));
    expect(list.body[0].steps[0]).toStrictEqual({ label: "0:30 @ ALL OUT" });
  });

  it("accepts a step with no targetSplit but a paired actual", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      steps: [{ label: "Effort", actualSplit: 140, actualSource: "assumed" }],
    });
    expect(created.status).toBe(201);
    const list = await asA(request(app).get("/api/logs"));
    expect(list.body[0].steps[0]).toStrictEqual({
      label: "Effort",
      actualSplit: 140,
      actualSource: "assumed",
    });
  });

  it("400 names the pairing when actualSource is sent without actualSplit", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        steps: [{ label: "W", targetSplit: 120, actualSource: "assumed" }],
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("steps");
    expect(res.body.error).toContain("actualSplit");
    expect(res.body.error).toContain("actualSource");
  });

  it("400 names the pairing when actualSplit is sent without actualSource", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        steps: [{ label: "W", targetSplit: 120, actualSplit: 120 }],
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("steps");
    expect(res.body.error).toContain("actualSplit");
    expect(res.body.error).toContain("actualSource");
  });

  // Compatibility pin: the amendment only loosens required -> optional, so
  // the full pre-amendment step shape (every field present, as every
  // previously-valid payload sent it) must still 201 completely unchanged.
  it("compatibility pin: the full pre-amendment step shape still 201s unchanged", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      validLogBody(),
    );
    expect(res.status).toBe(201);
  });

  it("strips unknown keys from a step rather than persisting them", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      steps: [
        {
          label: "Work",
          targetSplit: 120,
          actualSplit: 120,
          actualSource: "assumed",
          notAStepField: "should be dropped",
        },
      ],
    });
    expect(created.status).toBe(201);
    const list = await asA(request(app).get("/api/logs"));
    expect(list.body[0].steps[0]).toStrictEqual({
      label: "Work",
      targetSplit: 120,
      actualSplit: 120,
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

  // Task 3 (outside-plan logging): advancesPlan is optional, and when
  // present must be a boolean — anything else (a string, a number, etc.)
  // is a genuine client bug, not silently coerced.
  it.each([
    ["a string", "nope"],
    ["a number", 1],
    ["null", null],
  ])(
    "rejects advancesPlan: %s with 400 + field advancesPlan",
    async (_label, value) => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        advancesPlan: value,
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("advancesPlan");
      expect(res.body.error).toBe("advancesPlan must be a boolean");
    },
  );

  it("advancesPlan absent behaves exactly like the pre-Task-3 default: the plan advances", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/logs")).send(
      validLogBody(),
    );
    expect(created.status).toBe(201);
    const plan = await asA(request(app).get("/api/plan"));
    expect(plan.body.doneN).toBe(1);
  });

  it("advancesPlan:true behaves exactly like the absent-field default", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      advancesPlan: true,
    });
    expect(created.status).toBe(201);
    const plan = await asA(request(app).get("/api/plan"));
    expect(plan.body.doneN).toBe(1);
  });

  it("advancesPlan:false creates the log (201, listed) but leaves plan doneN unchanged", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      advancesPlan: false,
    });
    expect(created.status).toBe(201);

    const plan = await asA(request(app).get("/api/plan"));
    expect(plan.body.doneN).toBe(0);

    const list = await asA(request(app).get("/api/logs"));
    expect(list.body).toHaveLength(1);
  });

  // Fix round 2 (whole-branch review, L2): the fake logs store used to
  // spread the WHOLE `LogInput` (including `advancesPlan`) into the row it
  // stored, so `GET /api/logs` leaked a field production can never emit —
  // the real `sessionLogs` table has no `advances_plan` column at all
  // (`server/stores/logs.ts`'s own `create` uses the flag purely to gate
  // the `plan_state` upsert, never to build the inserted row). This test
  // exists specifically because `toMatchObject` elsewhere in this file
  // wouldn't have caught an extra field — only a strict absence check does.
  it("GET /api/logs never includes advancesPlan on the row, whichever way it was posted", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      advancesPlan: false,
    });
    const list = await asA(request(app).get("/api/logs"));
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty("advancesPlan");
  });

  // The "no plan row at all" arm: a brand-new user (no plan_state row ever
  // created) who logs a false row must still 201, and the plan must still
  // report the untouched, never-created state.
  it("advancesPlan:false with no plan row at all still 201s, and /api/plan still reports the untouched default", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      advancesPlan: false,
    });
    expect(created.status).toBe(201);
    const plan = await asA(request(app).get("/api/plan"));
    expect(plan.body).toStrictEqual({ planKey: null, doneN: 0, sequence: [] });
  });

  // Phase 7C Task 3 (spec §6): the server admits what a PM5 actually
  // measured. Walk-4 hardware (docs/monitor/pm5-interface-notes.md §18)
  // produced avgSpm 66 and splits past 600 on light rowing — real readings,
  // not data-entry mistakes — so `actualSource: "pm5"` gets its own,
  // wider bands. The manual bands (assumed/stopwatch) are UNCHANGED: a
  // stopwatch entry claiming 66 spm is still a typo.
  describe("pm5 fields (Phase 7C Task 3)", () => {
    // Walk-4's own decoded interval 2 (logDraft.test.ts's WALK4_ACTUALS[1],
    // b402faf's real 0x0037/0x0038 wire decode): elapsedSeconds 29.1,
    // distanceMeters 100, avgSplit 145.5, avgSpm 25, avgHeartRateBpm 107.
    it("accepts a pm5 step carrying walk-4's real decoded values", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        steps: [
          {
            label: "Row 1",
            actualSplit: 145.5,
            actualSource: "pm5",
            spm: 25,
            avgHr: 107,
            actualSeconds: 29.1,
            actualMeters: 100,
          },
        ],
      });
      expect(created.status).toBe(201);
      const list = await asA(request(app).get("/api/logs"));
      expect(list.body[0].steps[0]).toStrictEqual({
        label: "Row 1",
        actualSplit: 145.5,
        actualSource: "pm5",
        spm: 25,
        avgHr: 107,
        actualSeconds: 29.1,
        actualMeters: 100,
      });
    });

    // Adversarial B3's own hardware capture (pm5-session3-final.log.gz,
    // line 2836): avgSplit 405.4, avgSpm 66 — both outside the manual
    // 30..600 / 10..60 bands but real pm5 readings.
    it("accepts avgSpm 66 and actualSplit 882.3 when actualSource is pm5 (walk-4 reality, adversarial B3)", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [
          { label: "Row 1", actualSplit: 882.3, actualSource: "pm5", spm: 66 },
        ],
      });
      expect(res.status).toBe(201);
    });

    it("still rejects the SAME avgSpm 66 / actualSplit 882.3 when actualSource is stopwatch (manual bands unmoved)", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [
          {
            label: "Row 1",
            actualSplit: 882.3,
            actualSource: "stopwatch",
            spm: 66,
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
    });

    it("still rejects a stopwatch spm of 66 alone (band unmoved, split otherwise in range)", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [
          {
            label: "Row 1",
            actualSplit: 120,
            actualSource: "stopwatch",
            spm: 66,
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
    });

    // The pm5 pairing exception (spec §3/§6): actualSource "pm5" is valid
    // WITHOUT actualSplit, when the split reading itself was unusable but
    // the other measured fields are real (`buildMonitorLogSteps`'s own
    // `avgSplit > 0` gate on the client). assumed/stopwatch keep the
    // ordinary paired-unit rule.
    it("accepts actualSource pm5 with no actualSplit, when actualSeconds/actualMeters are present", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        steps: [
          {
            label: "Row 1",
            actualSource: "pm5",
            actualSeconds: 30,
            actualMeters: 100,
          },
        ],
      });
      expect(created.status).toBe(201);
      const list = await asA(request(app).get("/api/logs"));
      expect(list.body[0].steps[0]).toStrictEqual({
        label: "Row 1",
        actualSource: "pm5",
        actualSeconds: 30,
        actualMeters: 100,
      });
    });

    it("still rejects actualSource stopwatch with no actualSplit (pairing rule scoped to pm5 only)", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", actualSource: "stopwatch" }],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
      expect(res.body.error).toContain("actualSplit");
      expect(res.body.error).toContain("actualSource");
    });

    it.each([
      ["avgHr 300 (above HR_MAX)", 300],
      ["avgHr 19 (below HR_MIN)", 19],
    ])("rejects %s with 400 + field steps", async (_label, avgHr) => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", avgHr }],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
    });

    it("accepts avgHr at both boundary values, 20 and 254", async () => {
      const app = appFor(makeStores());
      for (const avgHr of [20, 254]) {
        const res = await asA(request(app).post("/api/logs")).send({
          ...validLogBody(),
          steps: [{ label: "Row 1", avgHr }],
        });
        expect(res.status).toBe(201);
      }
    });

    it("rejects actualSeconds: -1 with 400 + field steps", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", actualSeconds: -1 }],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
    });

    it("accepts actualSeconds: 0 and actualMeters: 0 (>= 0, not > 0)", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", actualSeconds: 0, actualMeters: 0 }],
      });
      expect(res.status).toBe(201);
    });

    it("rejects actualMeters: -1 with 400 + field steps", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", actualMeters: -1 }],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
    });

    // Split-band boundary: pm5's own bound is "> 0 and <= 6000", not >= 0.
    it.each([
      ["actualSplit 0 (not > 0)", 0],
      ["actualSplit 6000.1 (above PM5_MAX_SPLIT_SECONDS)", 6000.1],
    ])("rejects pm5 %s with 400 + field steps", async (_label, actualSplit) => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", actualSplit, actualSource: "pm5" }],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
    });

    it("accepts pm5 actualSplit at the 6000 boundary", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", actualSplit: 6000, actualSource: "pm5" }],
      });
      expect(res.status).toBe(201);
    });

    // spm-band boundary: pm5's own bound is 0..99 inclusive.
    it.each([
      ["spm -1 (below PM5_SPM_MIN)", -1],
      ["spm 100 (above PM5_SPM_MAX)", 100],
    ])("rejects pm5 %s with 400 + field steps", async (_label, spm) => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", actualSplit: 120, actualSource: "pm5", spm }],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
    });

    it("accepts pm5 spm at both boundary values, 0 and 99", async () => {
      const app = appFor(makeStores());
      for (const spm of [0, 99]) {
        const res = await asA(request(app).post("/api/logs")).send({
          ...validLogBody(),
          steps: [
            { label: "Row 1", actualSplit: 120, actualSource: "pm5", spm },
          ],
        });
        expect(res.status).toBe(201);
      }
    });
  });

  // Phase 7C Task 3 (spec §5/§6): deviceName is a body-level, session-scoped
  // string (provenance), stored in a new nullable column — not a per-step
  // field.
  describe("deviceName (Phase 7C Task 3)", () => {
    it("round-trips a deviceName on read", async () => {
      const app = appFor(makeStores());
      await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        deviceName: "PM5 432331249 Row",
      });
      const list = await asA(request(app).get("/api/logs"));
      expect(list.body[0].deviceName).toBe("PM5 432331249 Row");
    });

    it("stays null when deviceName is absent", async () => {
      const app = appFor(makeStores());
      await asA(request(app).post("/api/logs")).send(validLogBody());
      const list = await asA(request(app).get("/api/logs"));
      expect(list.body[0].deviceName).toBeNull();
    });

    it("rejects a 65-character deviceName with 400 + field deviceName", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        deviceName: "x".repeat(65),
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("deviceName");
    });

    it("accepts a 1-character and a 64-character deviceName", async () => {
      const app = appFor(makeStores());
      for (const deviceName of ["x", "x".repeat(64)]) {
        const res = await asA(request(app).post("/api/logs")).send({
          ...validLogBody(),
          deviceName,
        });
        expect(res.status).toBe(201);
      }
    });

    it("rejects an empty-string deviceName with 400 + field deviceName", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        deviceName: "",
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("deviceName");
    });
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
    vi.spyOn(stores.planState, "set");
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
      steps: [
        {
          label: "W",
          targetSplit: 100,
          actualSplit: 100,
          actualSource: "assumed",
        },
      ],
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
    vi.spyOn(stores.planState, "set");
    const app = appFor(stores);
    await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
    await asA(request(app).post("/api/logs")).send({
      workoutId: null,
      workoutTitle: "X",
      workoutType: "AT",
      held: "held",
      pain: 1,
      notes: null,
      steps: [
        {
          label: "W",
          targetSplit: 100,
          actualSplit: 100,
          actualSource: "assumed",
        },
      ],
    });

    const res = await asA(request(app).put("/api/plan")).send({
      planKey: "head",
    });
    expect(res.body).toMatchObject({ planKey: "head", doneN: 0 });
    expect(stores.planState.set).toHaveBeenCalledWith(userA.id, "head");
  });

  it("PUT {reset:true} zeroes doneN without changing the plan", async () => {
    const stores = makeStores();
    vi.spyOn(stores.planState, "reset");
    const app = appFor(stores);
    await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
    await asA(request(app).post("/api/logs")).send({
      workoutId: null,
      workoutTitle: "X",
      workoutType: "AT",
      held: "held",
      pain: 1,
      notes: null,
      steps: [
        {
          label: "W",
          targetSplit: 100,
          actualSplit: 100,
          actualSource: "assumed",
        },
      ],
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
    vi.spyOn(stores.preferences, "put");
    const res = await asA(request(appFor(stores)).put("/api/prefs")).send({});
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual(PREFERENCES_DEFAULTS);
    expect(stores.preferences.put).not.toHaveBeenCalled();
  });

  it("PUT with only unknown keys is also a no-op read", async () => {
    const stores = makeStores();
    vi.spyOn(stores.preferences, "put");
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
        warmup: { kind: "time", minutes: 12, restSeconds: 30 },
        countdownSeconds: 5,
        paceToleranceSeconds: 2,
        accentColor: "#123456",
        startHereDismissed: true,
      },
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      difficulties: ["easy"],
      timeCapMinutes: 45,
      warmup: { kind: "time", minutes: 12, restSeconds: 30 },
      countdownSeconds: 5,
      paceToleranceSeconds: 2,
      accentColor: "#123456",
      startHereDismissed: true,
    });
  });

  describe("warmup (2026-08-09 design §2)", () => {
    it("accepts a time-kind warmup with no rest", async () => {
      const res = await asA(
        request(appFor(makeStores())).put("/api/prefs"),
      ).send({ warmup: { kind: "time", minutes: 10 } });
      expect(res.status).toBe(200);
      expect(res.body.warmup).toStrictEqual({ kind: "time", minutes: 10 });
    });

    it("accepts a distance-kind warmup with rest", async () => {
      const res = await asA(
        request(appFor(makeStores())).put("/api/prefs"),
      ).send({ warmup: { kind: "distance", meters: 2000, restSeconds: 60 } });
      expect(res.status).toBe(200);
      expect(res.body.warmup).toStrictEqual({
        kind: "distance",
        meters: 2000,
        restSeconds: 60,
      });
    });

    it("GET round-trips a saved warmup", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/prefs")).send({
        warmup: { kind: "time", minutes: 5 },
      });
      const get = await asA(request(app).get("/api/prefs"));
      expect(get.body.warmup).toStrictEqual({ kind: "time", minutes: 5 });
    });

    it("an explicit null clears a previously-set warmup (presence check, not !== undefined)", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/prefs")).send({
        warmup: { kind: "time", minutes: 5 },
      });
      const cleared = await asA(request(app).put("/api/prefs")).send({
        warmup: null,
      });
      expect(cleared.status).toBe(200);
      expect(cleared.body.warmup).toBeNull();
      const get = await asA(request(app).get("/api/prefs"));
      expect(get.body.warmup).toBeNull();
    });

    it("absent warmup key leaves an existing warmup untouched (absence != explicit null)", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/prefs")).send({
        warmup: { kind: "time", minutes: 5 },
      });
      const res = await asA(request(app).put("/api/prefs")).send({
        accentColor: "#654321",
      });
      expect(res.status).toBe(200);
      expect(res.body.warmup).toStrictEqual({ kind: "time", minutes: 5 });
    });

    it.each([
      [{ kind: "time", minutes: 0 }, "below the 1-minute floor"],
      [{ kind: "time", minutes: 31 }, "above the 30-minute ceiling"],
      [{ kind: "time", minutes: 5.5 }, "not a whole minute"],
      [{ kind: "distance", meters: 99 }, "below the 100 m floor"],
      [{ kind: "distance", meters: 10001 }, "above the 10000 m ceiling"],
      [{ kind: "distance", meters: 500.5 }, "not a whole meter"],
      [
        { kind: "time", minutes: 10, restSeconds: 4 },
        "rest below the 5 s floor",
      ],
      [
        { kind: "time", minutes: 10, restSeconds: 596 },
        "rest above the 595 s (9:55) PM5 ceiling",
      ],
      [
        { kind: "time", minutes: 10, restSeconds: 30.5 },
        "rest not a whole second",
      ],
      [{ kind: "sprint", minutes: 10 }, "an unknown kind"],
      [{ kind: "time", meters: 10 }, "wrong duration field for the kind"],
      [
        { kind: "time", minutes: 10, meters: 500 },
        "both minutes and meters present (stray key beyond what time implies)",
      ],
      [{}, "no kind at all"],
      ["off", "not an object"],
    ])("rejects %j (%s) with 400 + field", async (bad, _why) => {
      const res = await asA(
        request(appFor(makeStores())).put("/api/prefs"),
      ).send({ warmup: bad });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("warmup");
    });

    it("exactly 1 minute / 30 minutes / 100 m / 10000 m / 5 s rest / 595 s rest are the inclusive boundaries", async () => {
      const app = appFor(makeStores());
      for (const warmup of [
        { kind: "time", minutes: 1 },
        { kind: "time", minutes: 30 },
        { kind: "distance", meters: 100 },
        { kind: "distance", meters: 10000 },
        { kind: "time", minutes: 10, restSeconds: 5 },
        { kind: "time", minutes: 10, restSeconds: 595 },
      ]) {
        const res = await asA(request(app).put("/api/prefs")).send({ warmup });
        expect(res.status).toBe(200);
        expect(res.body.warmup).toStrictEqual(warmup);
      }
    });
  });

  it("PUT startHereDismissed round-trips true then back to false", async () => {
    const app = appFor(makeStores());
    const dismiss = await asA(request(app).put("/api/prefs")).send({
      startHereDismissed: true,
    });
    expect(dismiss.status).toBe(200);
    expect(dismiss.body.startHereDismissed).toBe(true);
    const get = await asA(request(app).get("/api/prefs"));
    expect(get.body.startHereDismissed).toBe(true);

    // PUT IT BACK ON TODAY (You › Learning the app) clears it again.
    const restore = await asA(request(app).put("/api/prefs")).send({
      startHereDismissed: false,
    });
    expect(restore.status).toBe(200);
    expect(restore.body.startHereDismissed).toBe(false);
  });

  it("rejects a non-boolean startHereDismissed with 400 + field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      { startHereDismissed: "yes" },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("startHereDismissed");
  });

  it("rejects an out-of-range timeCapMinutes with 400 + field", async () => {
    const res = await asA(request(appFor(makeStores())).put("/api/prefs")).send(
      { timeCapMinutes: 5 },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("timeCapMinutes");
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

describe("article reads", () => {
  it("GET returns an empty list for a fresh user", async () => {
    const res = await asA(
      request(appFor(makeStores())).get("/api/article-reads"),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ slugs: [] });
  });

  it("PUT then GET round-trips; PUT is idempotent", async () => {
    const app = appFor(makeStores());
    expect(
      (await asA(request(app).put("/api/article-reads/workout-types"))).status,
    ).toBe(204);
    expect(
      (await asA(request(app).put("/api/article-reads/workout-types"))).status,
    ).toBe(204);
    const res = await asA(request(app).get("/api/article-reads"));
    expect(res.body).toStrictEqual({ slugs: ["workout-types"] });
  });

  it("rejects a slug outside the safe shape", async () => {
    const app = appFor(makeStores());
    for (const bad of ["UPPER", "a b", "a/../b", "x".repeat(65), "é"]) {
      const res = await asA(
        request(app).put(`/api/article-reads/${encodeURIComponent(bad)}`),
      );
      expect(res.status).toBe(400);
    }
  });

  it("DELETE then GET round-trips the removal", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/article-reads/baselines"));
    const del = await asA(request(app).delete("/api/article-reads/baselines"));
    expect(del.status).toBe(204);
    const res = await asA(request(app).get("/api/article-reads"));
    expect(res.body).toStrictEqual({ slugs: [] });
  });

  it("DELETE is idempotent: a slug never read still 204s and changes nothing", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/article-reads/baselines"));
    expect(
      (await asA(request(app).delete("/api/article-reads/never-read"))).status,
    ).toBe(204);
    expect(
      (await asA(request(app).delete("/api/article-reads/never-read"))).status,
    ).toBe(204);
    const res = await asA(request(app).get("/api/article-reads"));
    expect(res.body).toStrictEqual({ slugs: ["baselines"] });
  });

  it("DELETE rejects a slug outside the safe shape with 400 + field", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).delete("/api/article-reads/UPPER"));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("slug");
  });

  it("requires a session", async () => {
    const app = appFor(makeStores());
    expect((await request(app).get("/api/article-reads")).status).toBe(401);
    expect((await request(app).put("/api/article-reads/x")).status).toBe(401);
    expect((await request(app).delete("/api/article-reads/x")).status).toBe(
      401,
    );
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
      sortOrder: 900,
      title: "Global Pool Entry",
      type: todayCode as "AN" | "O2" | "AT" | "TR",
    });
    const res = await asA(request(app).get("/api/today"));
    expect(res.status).toBe(200);
    expect(res.body.pool).toContain(g.id);
    expect(res.body.recommendation).toBe(g.id);
  });

  // Controller addendum (Phase 6I Task 7, design spec's "invisible outside
  // onboarding" rule): the designated onboarding workout is never
  // suggested to an account that already has real baselines set — this
  // route 422s before ever reaching the suggestion pool for a brand-new
  // account (the only account these workouts are actually FOR), so the
  // only account this exclusion can be observed against is a returning one
  // that happens to still have "First 6k" in its library.
  it("excludes the designated onboarding workout from the pool/recommendation, even at a matching type", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    const todayCode = PLANS.sprint.sessions[0] as "AN" | "O2" | "AT" | "TR";
    const onboarding = seedGlobalWorkout(stores, {
      sortOrder: 900,
      title: ONBOARDING_TITLES.k6,
      type: todayCode,
    });
    const real = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ title: "A Real Workout", type: todayCode }),
    );
    const res = await asA(request(app).get("/api/today"));
    expect(res.status).toBe(200);
    expect(res.body.pool).not.toContain(onboarding.id);
    expect(res.body.pool).toContain(real.body.id);
    expect(res.body.recommendation).toBe(real.body.id);
  });

  // Final-review fix: the exclusion must key off isGlobal, not title alone
  // — a rower's own custom workout that happens to be named "First 6k"
  // (the POST route's own "personal workout sharing a global's title" case,
  // pinned above) is a real, ownable workout, not a stray collision with
  // the seeded pair. Excluding it by title alone would orphan it from
  // /api/today's suggestion pool with no way back.
  it("a CUSTOM workout named the same as a designated onboarding title stays in the pool — only the GLOBAL row is excluded", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    const todayCode = PLANS.sprint.sessions[0] as "AN" | "O2" | "AT" | "TR";
    const onboarding = seedGlobalWorkout(stores, {
      sortOrder: 900,
      title: ONBOARDING_TITLES.k6,
      type: todayCode,
    });
    const custom = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({ title: ONBOARDING_TITLES.k6, type: todayCode }),
    );
    expect(custom.body.isGlobal).toBe(false);

    const res = await asA(request(app).get("/api/today"));
    expect(res.status).toBe(200);
    expect(res.body.pool).not.toContain(onboarding.id);
    expect(res.body.pool).toContain(custom.body.id);
    expect(res.body.recommendation).toBe(custom.body.id);
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

  // Amendment fix round (L1): pins bucketsForCap's own derivation at the
  // route level, not just in the client-side unit/client suites —
  // PREFERENCES_DEFAULTS.timeCapMinutes is 60, and bucketsForCap(60)
  // (domain/duration.ts) keeps only the first three buckets, excluding
  // "60+". A workout estimated at EXACTLY 60 minutes buckets as "60+"
  // (bucketFor's own <60 rule: minutes<60 is false at exactly 60), so it
  // must be excluded from the pool — the precise boundary this round's
  // cap-to-bucket derivation turns on. A second, shorter workout of the
  // same type stays in the filtered pool (non-empty), which is what keeps
  // suggest()'s own fellBack rule from masking the exclusion by falling
  // back to the unfiltered type list.
  it("excludes a workout estimated at exactly the account's 60-min cap from the pool (the bucketsForCap boundary)", async () => {
    const app = appFor(makeStores());
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    const todayCode = PLANS.sprint.sessions[0];
    const short = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({
        title: "Well Under The Cap",
        type: todayCode as "AN" | "O2" | "AT" | "TR",
      }),
    );
    // r 10' + a 50' work step (fixed `duration: {kind: "time"}`, so its
    // seconds don't depend on baselines/pace) = exactly 60 minutes total.
    const atCap = await asA(request(app).post("/api/workouts")).send(
      validWorkoutBody({
        title: "Exactly At The Cap",
        type: todayCode as "AN" | "O2" | "AT" | "TR",
        steps: [
          { k: "r", minutes: 10 },
          {
            k: "w",
            duration: { kind: "time", minutes: 50 },
            ref: { base: "2k", off: 10 },
          },
        ],
      }),
    );
    const res = await asA(request(app).get("/api/today"));
    expect(res.status).toBe(200);
    expect(res.body.pool).toContain(short.body.id);
    expect(res.body.pool).not.toContain(atCap.body.id);
    expect(res.body.recommendation).toBe(short.body.id);
  });
});
