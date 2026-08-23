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
  // Mirrors `app.ts`'s own route-scoped 1mb limit on POST /api/logs
  // (series capture spec, 2026-08-19, §3) — mounted here too, same
  // ordering, so this file's series-validation cases (up to the full
  // 14,400-sample cap) exercise the real validator without a smaller
  // harness-only body limit getting in the way first. Every other route
  // keeps the default (see `server/app.test.ts` for the proof this
  // scoping doesn't widen elsewhere).
  app.post("/api/logs", express.json({ limit: "1mb" }));
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

// From-the-log spec (2026-08-18), §3: `GET /api/logs` (the list) no longer
// carries `steps` — tests that need to inspect a created log's steps fetch
// the single row via `GET /api/logs/:id` instead (the from-the-log view's
// own fetch, which still returns the full row).
const getLogById = (app: express.Express, id: string) =>
  asA(request(app).get(`/api/logs/${id}`));

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
    ["delete", "/api/baselines"],
    ["get", "/api/workouts"],
    ["post", "/api/workouts"],
    ["get", "/api/workouts/x"],
    ["put", "/api/workouts/x"],
    ["delete", "/api/workouts/x"],
    ["post", "/api/workouts/bulk"],
    ["get", "/api/logs"],
    ["post", "/api/logs"],
    ["get", "/api/logs/x"],
    ["patch", "/api/logs/x"],
    ["get", "/api/plan"],
    ["put", "/api/plan"],
    ["get", "/api/prefs"],
    ["put", "/api/prefs"],
    ["get", "/api/test-history"],
    ["post", "/api/test-history"],
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

describe("DELETE /api/baselines (Phase BL PR C — Reset baseline setup)", () => {
  it("clears a set pair back to the no-row shape, and echoes it", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 100,
      k2Source: "tested",
      k6Seconds: 120,
      k6Source: "derived",
    });
    const del = await asA(request(app).delete("/api/baselines"));
    expect(del.status).toBe(200);
    expect(del.body).toStrictEqual({ k2Seconds: null, k6Seconds: null });
    const get = await asA(request(app).get("/api/baselines"));
    expect(get.body).toStrictEqual({ k2Seconds: null, k6Seconds: null });
  });

  it("clears the STORE row itself (numbers and sources go together), not just the response", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 100,
      k2Source: "tested",
    });
    await asA(request(app).delete("/api/baselines"));
    // The store's own truth, not the route's echo: no row at all — the
    // exact state a brand-new account has, which is what makes the doors
    // render again.
    expect(await stores.baselines.get("user-a")).toBeNull();
  });

  it("is a 200 no-op for an account that never set baselines", async () => {
    const res = await asA(
      request(appFor(makeStores())).delete("/api/baselines"),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ k2Seconds: null, k6Seconds: null });
  });

  it("old clients are unaffected: PUT still 400s on null — the clear has its own verb, not a relaxed validator", async () => {
    const res = await asA(
      request(appFor(makeStores())).put("/api/baselines"),
    ).send({
      k2Seconds: null,
    });
    expect(res.status).toBe(400);
  });

  it("a PUT after the clear starts fresh, exactly like a first-ever write", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/baselines")).send({ k2Seconds: 100 });
    await asA(request(app).delete("/api/baselines"));
    await asA(request(app).put("/api/baselines")).send({ k6Seconds: 130 });
    const get = await asA(request(app).get("/api/baselines"));
    expect(get.body).toStrictEqual({ k2Seconds: null, k6Seconds: 130 });
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

  // Phase BL PR A (baseline-onboarding spec 2026-08-22 rev 2, "The stored
  // shape"): each numeric field may arrive with its own source; the route
  // validates sources against the enum and defaults a value-only write to
  // "manual" (an old client's plain write IS a manual entry). The store's
  // per-patch-key semantics (an absent field touches nothing in Postgres)
  // are proven in baselineProvenance.integration.test.ts — these cases pin
  // the route's own translation and validation seam.
  describe("per-field provenance on the wire (Phase BL PR A)", () => {
    it.each(["k2Source", "k6Source"] as const)(
      "rejects a %s outside the enum with 400 + field — a pass-through would store 'banana'",
      async (sourceField) => {
        const stores = makeStores();
        const put = vi.spyOn(stores.baselines, "put");
        const seconds = sourceField === "k2Source" ? "k2Seconds" : "k6Seconds";
        const res = await asA(
          request(appFor(stores)).put("/api/baselines"),
        ).send({ [seconds]: 120, [sourceField]: "banana" });
        expect(res.status).toBe(400);
        expect(res.body.field).toBe(sourceField);
        expect(put).not.toHaveBeenCalled();
      },
    );

    it("rejects a non-string source the same way (no coercion path)", async () => {
      const res = await asA(
        request(appFor(makeStores())).put("/api/baselines"),
      ).send({ k2Seconds: 120, k2Source: 5 });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("k2Source");
    });

    it("rejects a source arriving without its own number — provenance describes a write, not a wish", async () => {
      const stores = makeStores();
      const put = vi.spyOn(stores.baselines, "put");
      const res = await asA(request(appFor(stores)).put("/api/baselines")).send(
        { k2Source: "tested" },
      );
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("k2Source");
      expect(put).not.toHaveBeenCalled();
    });

    it("defaults an old client's plain write to manual for exactly the field it writes — the absent field gets no source key at all", async () => {
      const stores = makeStores();
      const put = vi.spyOn(stores.baselines, "put");
      await asA(request(appFor(stores)).put("/api/baselines")).send({
        k2Seconds: 120,
      });
      expect(put).toHaveBeenCalledExactlyOnceWith("user-a", {
        k2Seconds: 120,
        k2Source: "manual",
      });
    });

    it("passes an explicit source through beside its number, still defaulting the other present field to manual", async () => {
      const stores = makeStores();
      const put = vi.spyOn(stores.baselines, "put");
      await asA(request(appFor(stores)).put("/api/baselines")).send({
        k2Seconds: 118,
        k2Source: "tested",
        k6Seconds: 127,
      });
      expect(put).toHaveBeenCalledExactlyOnceWith("user-a", {
        k2Seconds: 118,
        k2Source: "tested",
        k6Seconds: 127,
        k6Source: "manual",
      });
    });

    it("keeps sources out of GET and the PUT echo — provenance is stored, never served (lean-GET decision, PR A)", async () => {
      const stores = makeStores();
      const app = appFor(stores);
      const put = await asA(request(app).put("/api/baselines")).send({
        k2Seconds: 118,
        k2Source: "derived",
      });
      expect(put.body).toStrictEqual({ k2Seconds: 118, k6Seconds: null });
      const get = await asA(request(app).get("/api/baselines"));
      expect(get.body).toStrictEqual({ k2Seconds: 118, k6Seconds: null });
    });
  });
});

// Phase BL PR B (baseline-onboarding spec rev 2, "Recording (decoupled)",
// James's ruling): every designated-test session with a measurable result
// records to test_history — accept OR decline — so recording must be
// reachable WITHOUT any baseline write. This sibling endpoint is that
// decouple: it appends history keyed to the saved log row (the idempotency
// key) and never touches baselines. The old coupled path (isTestResult on
// PUT /api/baselines, zero client senders) is untouched above.
describe("POST /api/test-history (Phase BL PR B: the recording decouple)", () => {
  const validLogBody = () => ({
    workoutId: null,
    workoutTitle: "2K Test",
    workoutType: "AN",
    held: null,
    pain: null,
    notes: null,
    steps: [
      {
        label: "2000m @ MAX",
        actualSplit: 118,
        actualSource: "stopwatch",
      },
    ],
  });

  async function createLog(app: ReturnType<typeof appFor>): Promise<string> {
    const created = await asA(request(app).post("/api/logs")).send(
      validLogBody(),
    );
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  it("records a test result without touching baselines at all — the decouple itself", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    const logId = await createLog(app);

    const res = await asA(request(app).post("/api/test-history")).send({
      distance: "2k",
      splitSeconds: 118.4,
      logId,
    });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe("string");

    const history = await stores.testHistory.list(userA.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      distance: "2k",
      splitSeconds: 118.4,
      deltaSeconds: null,
    });
    // The whole point: no baseline write happened.
    expect(await stores.baselines.get(userA.id)).toBeNull();
  });

  it("a double-fire with the same logId keeps ONE row and returns the same id — never a delta-0 duplicate", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    const logId = await createLog(app);
    const body = { distance: "2k", splitSeconds: 118.4, logId };

    const first = await asA(request(app).post("/api/test-history")).send(body);
    const second = await asA(request(app).post("/api/test-history")).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const history = await stores.testHistory.list(userA.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.deltaSeconds).toBeNull();
  });

  it("rejects a distance outside the enum, naming the field", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).post("/api/test-history")).send({
      distance: "5k",
      splitSeconds: 118,
      logId: "3b241101-e2bb-4255-8caf-4136c566a962",
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("distance");
  });

  it("rejects a splitSeconds outside the baseline band (60..240), naming the field", async () => {
    const app = appFor(makeStores());
    for (const splitSeconds of [59.9, 240.1, "118"]) {
      const res = await asA(request(app).post("/api/test-history")).send({
        distance: "2k",
        splitSeconds,
        logId: "3b241101-e2bb-4255-8caf-4136c566a962",
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("splitSeconds");
    }
  });

  it("rejects a malformed logId, naming the field", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).post("/api/test-history")).send({
      distance: "2k",
      splitSeconds: 118,
      logId: "not-a-uuid",
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("logId");
  });

  it("rejects a logId belonging to another user — ownership is checked, not just existence", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    const logId = await createLog(app); // created by user A

    const res = await asB(request(app).post("/api/test-history")).send({
      distance: "2k",
      splitSeconds: 118,
      logId,
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("logId");
    expect(await stores.testHistory.list(userB.id)).toHaveLength(0);
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

  // The composed contract's positive half (see `domain/bulk.ts`'s header):
  // a dropped `wu` line is not "bad", so a paste whose only oddity is
  // warm-up lines still lands EVERY block — the all-or-nothing gate above
  // must not see the drop as an error. Byte-identical response shape too:
  // `created` + `errors` + the `droppedWarmups` count the import screen's
  // notice reads (task-5-report's Concern #2 — the count was computed and
  // then discarded on this door until now).
  it("a clean multi-block paste lands all of them, with the exact response shape (created + errors + droppedWarmups)", async () => {
    const stores = makeStores();
    const text = `1 | Ladder | AT | medium | 3\nwu 10\nw 1' 6k-2 @22 r5\n\n2 | Steady | O2 | easy | 1\nwu 10\nw 20' 2k+10`;
    const res = await asA(
      request(appFor(stores)).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      created: expect.any(Array),
      errors: [],
      droppedWarmups: 2,
    });
    expect(res.body.created).toHaveLength(2);
    expect(await stores.workouts.count("user-a")).toBe(2);
  });

  it("reports zero dropped warm-up lines for a paste with none", async () => {
    const text = "1 | Steady | O2 | easy | 1\nw 20' 2k+10";
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.status).toBe(200);
    expect(res.body.droppedWarmups).toBe(0);
  });

  // A block whose only step lines are well-formed `wu` lines errors rather
  // than silently vanishing (domain/bulk.ts's own "no steps at all" guard,
  // arc review F7) — asserting the route hands this exact message through
  // unmodified, since task 6's own brief flags it as a case to pin either
  // way.
  it("surfaces the warm-up-only-block error like any other line error", async () => {
    const text = "1 | Warmup Only | AT | medium | 3\nwu 10";
    const res = await asA(
      request(appFor(makeStores())).post("/api/workouts/bulk"),
    ).send({ text });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(0);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        message:
          "workout needs at least one step. Add the warm-up as an ordinary first step.",
      }),
    );
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

  // Fix round 1 (task review, finding 4): a LITERAL, frozen copy of the
  // pre-this-task body shape — deliberately NOT derived from
  // `validLogBody()` above. `validLogBody()` is a live fixture other
  // tests are free to extend (e.g. a future task adding its own optional
  // key to it); if the exit-criterion-2 pin below read through that
  // fixture, a later addition to `validLogBody()` would silently carry
  // the new key into "the v0.11.0 shape" test and the pin would stop
  // proving what its name says. `Object.freeze` makes an accidental
  // mutation here throw in strict mode rather than silently drift too.
  const V0_11_0_LOG_BODY = Object.freeze({
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
    expect(res.body.error).toBe("held must be one of held|under|over or null");
  });

  // Post-workout-summary spec (2026-08-17), §3: "invalid members still
  // 400" applies to a NULL-tolerant field too — `null` is now valid, but a
  // string that isn't a real HeldResult member (and isn't null) is still
  // rejected the same way it always was.
  it("accepts held: null (the redesigned reflection card's optional question)", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        held: null,
      },
    );
    expect(res.status).toBe(201);
  });

  it("accepts an EXPLICIT thumbs: null (the reflection card's cleared state sends it, not just an absent key)", async () => {
    // Task-3 review M1: the guard's false arm was untested — an inversion
    // to `body.thumbs === null` would 400 exactly the body the summary's
    // cleared reflection posts, while every absent-key test stayed green.
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        thumbs: null,
      },
    );
    expect(res.status).toBe(201);
  });

  it("rejects an invalid thumbs value with 400, field named", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        thumbs: "left",
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("thumbs");
    expect(res.body.error).toBe("thumbs must be one of up|down or null");
  });

  it("accepts thumbs: 'up' and 'down'", async () => {
    const app = appFor(makeStores());
    const up = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      thumbs: "up",
    });
    expect(up.status).toBe(201);
    const down = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      thumbs: "down",
    });
    expect(down.status).toBe(201);
  });

  // Phase LL Task 4 (design spec §4, TRIAD; exit criterion 5). Same shape
  // as `thumbs` above, unit-level against the fake store — the
  // Postgres-backed proof lives in `endedBy.integration.test.ts`.
  it("accepts an EXPLICIT endedBy: null", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        endedBy: null,
      },
    );
    expect(res.status).toBe(201);
  });

  it("rejects an invalid endedBy value with 400, field named", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        endedBy: "reconnected",
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("endedBy");
    expect(res.body.error).toBe(
      "endedBy must be one of finished|rower|link-lost|program-failed|interrupted or null",
    );
  });

  it("accepts every member of the widened union, including the pre-existing interrupted value", async () => {
    const app = appFor(makeStores());
    for (const value of [
      "finished",
      "rower",
      "link-lost",
      "program-failed",
      "interrupted",
    ]) {
      const res = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        endedBy: value,
      });
      expect(res.status).toBe(201);
    }
  });

  it("POST with no endedBy at all → 201, and the row reads back null (legacy client shape)", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).post("/api/logs")).send({
      workoutId: null,
      workoutTitle: "Off the cuff",
      workoutType: "AT",
      notes: null,
      steps: [{ label: "Work" }],
    });
    expect(res.status).toBe(201);

    const list = await asA(request(app).get("/api/logs"));
    const row = list.body.find((r: { id: string }) => r.id === res.body.id);
    expect(row).toMatchObject({ endedBy: null });
  });

  // Post-workout-summary spec (2026-08-17), §3: the redesigned reflection
  // card makes every answer optional — a POST with NO held/pain/thumbs at
  // all (not even present as null) must still 201, and the stored row
  // reads back null for all three, not a fabricated default.
  it("POST with no held/pain/thumbs at all → 201, and the row reads back all null", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).post("/api/logs")).send({
      workoutId: null,
      workoutTitle: "Off the cuff",
      workoutType: "AT",
      notes: null,
      steps: [{ label: "Work" }],
    });
    expect(res.status).toBe(201);

    const list = await asA(request(app).get("/api/logs"));
    const row = list.body.find((r: { id: string }) => r.id === res.body.id);
    expect(row).toMatchObject({ held: null, pain: null, thumbs: null });
  });

  // The v0.10.0/v0.10.1 client shape (held+pain always present, no thumbs
  // key at all on the wire) must keep working byte-identically — this is
  // additive-compatible, per the spec's own "between-tags API discipline"
  // rule (docs/RELEASING.md).
  it("POST in the old shape (held+pain present, no thumbs key) still 201s and stores the values, thumbs null", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).post("/api/logs")).send(validLogBody());
    expect(res.status).toBe(201);

    const list = await asA(request(app).get("/api/logs"));
    const row = list.body.find((r: { id: string }) => r.id === res.body.id);
    expect(row).toMatchObject({ held: "held", pain: 2, thumbs: null });
  });

  // From-the-log spec (2026-08-18), §2/§7 exit criterion 2: the v0.11.0
  // body shape (no avgSplitSeconds/timeSeconds/distanceMeters keys at
  // all, exactly `validLogBody()` as it stood before this task) must
  // still 201 and store all three heroes as null, not fabricated
  // defaults — additive-only between tags.
  it("POST in the exact v0.11.0 body shape (no hero keys) still 201s and stores null-null-null (exit criterion 2)", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).post("/api/logs")).send(
      V0_11_0_LOG_BODY,
    );
    expect(res.status).toBe(201);

    const list = await asA(request(app).get("/api/logs"));
    const row = list.body.find((r: { id: string }) => r.id === res.body.id);
    expect(row).toMatchObject({
      avgSplitSeconds: null,
      timeSeconds: null,
      distanceMeters: null,
    });
  });

  // From-the-log spec (2026-08-18), §2: the model's numbers round-trip
  // through the API and the route's own validation exactly, using the B8
  // probe value as the payload. Fix round 1 (task review, finding 5):
  // this file runs against the in-memory fake (the `unit` project), so
  // this proves the route's parsing/validation/response-shaping doesn't
  // mangle the value — a JS-number pass-through claim, NOT that a real
  // `double precision` column survives it. That storage-level claim is
  // storeContracts.ts's "B8 probe" case, which runs against real
  // Postgres via contracts.real.integration.test.ts.
  it("the route accepts the B8 probe value and passes it through unmangled (fake store — proves parsing, not storage)", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      avgSplitSeconds: 2.7182818284,
      timeSeconds: 3599,
      distanceMeters: 5000,
    });
    expect(res.status).toBe(201);

    const list = await asA(request(app).get("/api/logs"));
    const row = list.body.find((r: { id: string }) => r.id === res.body.id);
    expect(row).toMatchObject({
      avgSplitSeconds: 2.7182818284,
      timeSeconds: 3599,
      distanceMeters: 5000,
    });
  });

  it.each([
    [
      "avgSplitSeconds",
      "not a number",
      "must be a finite number > 0 and <= 3600, or null",
    ],
    ["avgSplitSeconds", 0, "must be a finite number > 0 and <= 3600, or null"],
    ["avgSplitSeconds", -1, "must be a finite number > 0 and <= 3600, or null"],
    [
      "avgSplitSeconds",
      3601,
      "must be a finite number > 0 and <= 3600, or null",
    ],
    // Infinity/NaN are deliberately absent from this table: both serialize
    // to JSON `null` (`JSON.stringify(Infinity) === "null"`, same for
    // `NaN`), so a real HTTP client can never put either value on the
    // wire through `express.json()` — the route's `Number.isFinite` guard
    // is defense-in-depth with no reachable-over-HTTP witness, not an
    // untested branch this table skipped.
    [
      "distanceMeters",
      "not a number",
      "must be a whole number > 0 and <= 1000000, or null",
    ],
    ["distanceMeters", 0, "must be a whole number > 0 and <= 1000000, or null"],
    [
      "distanceMeters",
      -5,
      "must be a whole number > 0 and <= 1000000, or null",
    ],
    [
      "distanceMeters",
      1_000_001,
      "must be a whole number > 0 and <= 1000000, or null",
    ],
    [
      "distanceMeters",
      5000.5,
      "must be a whole number > 0 and <= 1000000, or null",
    ],
    [
      "timeSeconds",
      "not a number",
      "must be a finite number > 0 and <= 604800, or null",
    ],
    ["timeSeconds", 0, "must be a finite number > 0 and <= 604800, or null"],
    ["timeSeconds", -1, "must be a finite number > 0 and <= 604800, or null"],
    [
      "timeSeconds",
      604801,
      "must be a finite number > 0 and <= 604800, or null",
    ],
  ])(
    "rejects %s: %p with 400, field named, exact message",
    async (field, value, messageSuffix) => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        [field]: value,
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe(field);
      expect(res.body.error).toBe(`${field} ${messageSuffix}`);
    },
  );

  it.each([
    ["avgSplitSeconds", 3600],
    ["distanceMeters", 1_000_000],
    ["timeSeconds", 604800],
  ])("accepts %s at its exact upper bound (%p)", async (field, value) => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        [field]: value,
      },
    );
    expect(res.status).toBe(201);
  });

  it("accepts explicit null for all three hero fields", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        avgSplitSeconds: null,
        timeSeconds: null,
        distanceMeters: null,
      },
    );
    expect(res.status).toBe(201);
  });

  it("rejects an invalid pain value with 400, still naming the field, when pain is present", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        pain: 99,
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("pain");
  });

  it("accepts pain: null", async () => {
    const res = await asA(request(appFor(makeStores())).post("/api/logs")).send(
      {
        ...validLogBody(),
        pain: null,
      },
    );
    expect(res.status).toBe(201);
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
    const fetched = await getLogById(app, created.body.id);
    expect(fetched.body.steps[0]).toStrictEqual({ label: "0:30 @ ALL OUT" });
  });

  it("accepts a step with no targetSplit but a paired actual", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/logs")).send({
      ...validLogBody(),
      steps: [{ label: "Effort", actualSplit: 140, actualSource: "assumed" }],
    });
    expect(created.status).toBe(201);
    const fetched = await getLogById(app, created.body.id);
    expect(fetched.body.steps[0]).toStrictEqual({
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
    const fetched = await getLogById(app, created.body.id);
    expect(fetched.body.steps[0]).toStrictEqual({
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

  // From-the-log spec (2026-08-18), §2 "the linkage mechanism" — the same
  // four cases as storeContracts.ts's "plan linkage" describe block,
  // exercised at the API level (through PUT /api/plan + POST /api/logs +
  // GET /api/logs) against the fake store.
  describe("plan linkage (from-the-log spec, 2026-08-18)", () => {
    it("an advancing save with a plan chosen stamps planKey/planIndex on the row", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });

      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      expect(created.status).toBe(201);

      const list = await asA(request(app).get("/api/logs"));
      const row = list.body.find(
        (r: { id: string }) => r.id === created.body.id,
      );
      expect(row).toMatchObject({ planKey: "sprint", planIndex: 0 });
    });

    it("a non-advancing save stores planKey/planIndex null, even with a plan chosen", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });

      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        advancesPlan: false,
      });
      expect(created.status).toBe(201);

      const list = await asA(request(app).get("/api/logs"));
      const row = list.body.find(
        (r: { id: string }) => r.id === created.body.id,
      );
      expect(row).toMatchObject({ planKey: null, planIndex: null });
    });

    it("an advancing save with NO plan chosen stores planKey/planIndex null", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      expect(created.status).toBe(201);

      const list = await asA(request(app).get("/api/logs"));
      const row = list.body.find(
        (r: { id: string }) => r.id === created.body.id,
      );
      expect(row).toMatchObject({ planKey: null, planIndex: null });
    });

    it("two sequential advancing saves stamp consecutive indexes", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/plan")).send({ planKey: "head" });

      const first = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      const second = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );

      const list = await asA(request(app).get("/api/logs"));
      expect(
        list.body.find((r: { id: string }) => r.id === first.body.id),
      ).toMatchObject({ planKey: "head", planIndex: 0 });
      expect(
        list.body.find((r: { id: string }) => r.id === second.body.id),
      ).toMatchObject({ planKey: "head", planIndex: 1 });
    });

    // Fix round 1 (task review, finding 1 — MEDIUM): spec §2's "never
    // client input" invariant, given a red-provable witness. Today the
    // route is safe only because it enumerates fields onto `LogInput`
    // one at a time (`workoutTitle: body.workoutTitle`, etc.) rather than
    // spreading `...body` — nothing currently reads `body.planKey` or
    // `body.planIndex` at all. That's an accident of the route's current
    // shape, not a proven invariant: a later refactor toward `...body`
    // (plausible — every other field here is a straight passthrough)
    // would silently start accepting client-controlled linkage with
    // every existing test still green, because no existing test posts
    // these two keys. This test closes that gap: even with
    // `advancesPlan: false` (so the store-level guard can't be the thing
    // that zeroes them — see the self-mutation note in the report), a
    // client that posts planKey/planIndex directly still gets null/null
    // back, because the route never reads them onto `LogInput` in the
    // first place.
    it("ignores client-posted planKey/planIndex entirely — the linkage is never client input (spec §2)", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        planKey: "sprint",
        planIndex: 99,
        advancesPlan: false,
      });
      expect(created.status).toBe(201);

      const list = await asA(request(app).get("/api/logs"));
      const row = list.body.find(
        (r: { id: string }) => r.id === created.body.id,
      );
      expect(row).toMatchObject({ planKey: null, planIndex: null });
    });
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
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.steps[0]).toStrictEqual({
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
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.steps[0]).toStrictEqual({
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

    // LOW-4 (Task 1 review): an UNMATCHED monitor-door interval posts its
    // authored `spm` with NO `actualSource` key at all (Phase LT spec 1,
    // §2's amendment — `buildMonitorLogSteps`'s own "unmatched interval"
    // branch never sets `actualSource`, since there is no actual to pair
    // with). This shape's `spm` takes the MANUAL band (10..60), not the
    // pm5-widened one (0..99) — `isPm5` keys strictly on `actualSource ===
    // "pm5"`, absent here — even though the row plainly came off a
    // monitor-mode workout. Previously untested: every other `spm` test in
    // this file sent an explicit `actualSource`.
    it("an unmatched-interval shape (spm present, no actualSource at all) validates spm against the MANUAL 10..60 band, not the pm5 0..99 one (LOW-4)", async () => {
      const app = appFor(makeStores());
      const tooLow = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", spm: 9 }],
      });
      expect(tooLow.status).toBe(400);
      expect(tooLow.body.field).toBe("steps");
      const tooHigh = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", spm: 61 }],
      });
      expect(tooHigh.status).toBe(400);
      expect(tooHigh.body.field).toBe("steps");
      for (const spm of [10, 60]) {
        const ok = await asA(request(app).post("/api/logs")).send({
          ...validLogBody(),
          steps: [{ label: "Row 1", spm }],
        });
        expect(ok.status).toBe(201);
      }
    });
  });

  // Phase LT spec 1, §2 (the SPM overload split): `spm` above is now the
  // AUTHORED target on every door, unchanged bounds (0..99 pm5,
  // 10..60 manual, this file's own long-standing `spm` tests above).
  // `actualSpm` is new — the monitor door's MEASURED average — additive,
  // its own field-named bound (min 1, not 0: "POST already bounds pm5 spm
  // 0..99; the new actualSpm key gets the same bounds with min 1").
  describe("actualSpm (Phase LT spec 1, §2 — the SPM overload split)", () => {
    it.each([
      ["actualSpm 0 (below the floor — an exact 0 means no strokes)", 0],
      ["actualSpm 100 (above PM5_SPM_MAX)", 100],
      ["actualSpm -1", -1],
    ])("rejects %s with 400 + field steps", async (_label, actualSpm) => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", actualSource: "pm5", actualSpm }],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
      expect(res.body.error).toContain("actualSpm");
    });

    it("rejects a non-integer actualSpm with 400 + field steps", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        steps: [{ label: "Row 1", actualSource: "pm5", actualSpm: 24.5 }],
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("steps");
      expect(res.body.error).toContain("actualSpm");
    });

    it("accepts actualSpm at both boundary values, 1 and 99", async () => {
      const app = appFor(makeStores());
      for (const actualSpm of [1, 99]) {
        const res = await asA(request(app).post("/api/logs")).send({
          ...validLogBody(),
          steps: [{ label: "Row 1", actualSource: "pm5", actualSpm }],
        });
        expect(res.status).toBe(201);
      }
    });

    // THE WIRE-SCOPING ROUND TRIP (§6 exit criterion 3): a new-shape
    // monitor row carries BOTH halves — `spm` the authored target, from
    // `ProgramInterval.displaySpm`, and `actualSpm` the measured average,
    // from `IntervalActual.avgSpm` — and both survive the POST/GET cycle
    // distinctly, proving the split is not silently collapsed back onto
    // one field.
    it("round-trips a new-shape row's spm (target) and actualSpm (measured) as DISTINCT values", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        steps: [
          {
            label: "Row 1",
            targetSplit: 120,
            actualSplit: 121,
            actualSource: "pm5",
            spm: 20,
            actualSpm: 24,
          },
        ],
      });
      expect(created.status).toBe(201);
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.steps[0]).toStrictEqual({
        label: "Row 1",
        targetSplit: 120,
        actualSplit: 121,
        actualSource: "pm5",
        spm: 20,
        actualSpm: 24,
      });
      expect(fetched.body.steps[0].spm).not.toBe(
        fetched.body.steps[0].actualSpm,
      );
    });
  });

  // §6 exit criterion 3 / §7 additivity: the v0.12.0-era body shape — a
  // monitor-sourced step whose `spm` holds the OLD measured value (this
  // task's own `actualSpm` field did not exist yet) — posts VERBATIM and
  // still 201s. Same frozen-literal idiom as `V0_11_0_LOG_BODY` above
  // (Object.freeze, deliberately NOT derived from a live fixture another
  // test could extend).
  const V0_12_0_LOG_BODY = Object.freeze({
    workoutId: null,
    workoutTitle: "Steady State",
    workoutType: "AT",
    held: "held",
    pain: 2,
    notes: null,
    steps: [
      {
        label: "Row 1",
        targetSplit: 120,
        actualSplit: 145.5,
        actualSource: "pm5",
        spm: 25,
        avgHr: 107,
        actualSeconds: 29.1,
        actualMeters: 100,
      },
    ],
  });

  it("POST in the exact v0.12.0-era body shape (pm5 step, no actualSpm key) still 201s and stores spm verbatim as the old measured value (§6 exit criterion 3)", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).post("/api/logs")).send(
      V0_12_0_LOG_BODY,
    );
    expect(res.status).toBe(201);

    const fetched = await getLogById(app, res.body.id);
    expect(fetched.body.steps[0]).toStrictEqual({
      label: "Row 1",
      targetSplit: 120,
      actualSplit: 145.5,
      actualSource: "pm5",
      spm: 25,
      avgHr: 107,
      actualSeconds: 29.1,
      actualMeters: 100,
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

  // Series capture spec (2026-08-19), §1/§3: the 1 Hz trace, optional,
  // shape-and-band validated the same "reject a hand-crafted liar, never
  // a real reading" way every other pm5-sourced field on this route
  // already is. These cases run against the in-memory fake (`unit`
  // project) — the full 14,400-sample worst case through the REAL
  // route-scoped body-limit middleware and REAL Postgres is
  // `server/app.test.ts` (the middleware limit itself) and
  // `server/routes/seriesCapture.integration.test.ts` (S5, end to end).
  describe("series (Phase LT spec 2, 2026-08-19)", () => {
    const validSample = (overrides: Record<string, unknown> = {}) => ({
      t: 10,
      d: 23,
      p: 1400,
      spm: 24,
      hr: 138,
      ...overrides,
    });

    it("accepts a well-formed series and round-trips it on GET /:id", async () => {
      const app = appFor(makeStores());
      const series = {
        samples: [validSample(), validSample({ t: 20, d: 47, hr: undefined })],
      };
      // `hr: undefined` above is JS-only (JSON.stringify drops it) — the
      // wire shape genuinely omits the key for the second sample, proving
      // hr is independently optional per-sample.
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series,
      });
      expect(created.status).toBe(201);

      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.series).toStrictEqual({
        samples: [
          { t: 10, d: 23, p: 1400, spm: 24, hr: 138 },
          { t: 20, d: 47, p: 1400, spm: 24 },
        ],
      });
    });

    it("accepts truncated: true and stores it", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series: { samples: [validSample()], truncated: true },
      });
      expect(created.status).toBe(201);
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.series.truncated).toBe(true);
    });

    it("series absent stores and reads back null", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      expect(created.status).toBe(201);
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.series).toBeNull();
    });

    it("series: null is treated the same as absent — 201, stored null", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series: null,
      });
      expect(created.status).toBe(201);
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.series).toBeNull();
    });

    it("rejects series that isn't an object, field named", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({ ...validLogBody(), series: "not an object" });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("series");
    });

    it("rejects series.samples that isn't an array, field named", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({ ...validLogBody(), series: { samples: "nope" } });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("series");
    });

    it("rejects series.truncated: false (only true or omitted)", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({
        ...validLogBody(),
        series: { samples: [validSample()], truncated: false },
      });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("series");
    });

    it("rejects more than 14,400 samples", async () => {
      const samples = Array.from({ length: 14_401 }, (_, i) =>
        validSample({ t: i + 1 }),
      );
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({ ...validLogBody(), series: { samples } });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("series");
    });

    it("accepts exactly 14,400 samples", async () => {
      const samples = Array.from({ length: 14_400 }, (_, i) =>
        validSample({ t: i + 1 }),
      );
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({ ...validLogBody(), series: { samples } });
      expect(res.status).toBe(201);
    });

    it.each([
      ["t", -1],
      ["t", 1.5],
      ["t", 6_048_001],
      ["d", -1],
      ["d", 10_000_001],
      ["p", -1],
      ["p", 60_001],
      ["spm", -1],
      ["spm", 256],
      ["hr", 19],
      ["hr", 255],
    ])(
      "rejects a sample with an out-of-band %s (%s), field named series",
      async (key, value) => {
        const res = await asA(
          request(appFor(makeStores())).post("/api/logs"),
        ).send({
          ...validLogBody(),
          series: { samples: [validSample({ [key]: value })] },
        });
        expect(res.status).toBe(400);
        expect(res.body.field).toBe("series");
      },
    );

    it("accepts the exact boundary values (0/max) for t/d/p/spm and hr's own 20/254 band", async () => {
      const app = appFor(makeStores());
      const res = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series: {
          samples: [
            { t: 0, d: 0, p: 0, spm: 0, hr: 20 },
            { t: 6_048_000, d: 10_000_000, p: 60_000, spm: 255, hr: 254 },
          ],
        },
      });
      expect(res.status).toBe(201);
    });

    // trace-truth Task 2 (spec §3): `r` is additive to the C2-logbook
    // shape, absent-not-false, same idiom as `hr`. Without a dedicated
    // destructure/validate/rebuild, `validateSeriesSample`'s existing
    // "built from an explicit field list" idiom silently drops any
    // unknown key at the boundary — this pins that it does NOT.
    it("round-trips a rest-marked sample through POST and GET", async () => {
      const app = appFor(makeStores());
      const posted = { t: 10, d: 40, p: 1200, spm: 20, r: true };
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series: { samples: [posted] },
      });
      expect(created.status).toBe(201);
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.series.samples[0]).toStrictEqual(posted);
    });

    it("a work sample (no r) round-trips with no r key at all — absent, not false", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series: { samples: [validSample()] },
      });
      expect(created.status).toBe(201);
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.series.samples[0]).not.toHaveProperty("r");
    });

    it.each([false, 1, "yes"])(
      "rejects r when it is not literally true (%j), field named series",
      async (badR) => {
        const res = await asA(
          request(appFor(makeStores())).post("/api/logs"),
        ).send({
          ...validLogBody(),
          series: { samples: [validSample({ r: badR })] },
        });
        expect(res.status).toBe(400);
        expect(res.body.field).toBe("series");
      },
    );

    it("ignores unknown keys on a sample, storing only t/d/p/spm/hr", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series: {
          samples: [{ ...validSample(), extra: "should be dropped" }],
        },
      });
      expect(created.status).toBe(201);
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.series.samples[0]).toStrictEqual(validSample());
      expect(fetched.body.series.samples[0]).not.toHaveProperty("extra");
    });

    it("rejects a non-object sample, field named series", async () => {
      const res = await asA(
        request(appFor(makeStores())).post("/api/logs"),
      ).send({ ...validLogBody(), series: { samples: ["not an object"] } });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("series");
    });

    // §6 exit criterion 6 / §7 additivity: the v0.14.0-era body shape (no
    // `series` key at all — every field this task shipped) posts VERBATIM
    // and still 201s, storing series null. Same frozen-literal idiom as
    // `V0_11_0_LOG_BODY`/`V0_12_0_LOG_BODY` above (Object.freeze,
    // deliberately NOT derived from a live fixture another test could
    // extend).
    const V0_14_0_LOG_BODY = Object.freeze({
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

    it("POST in the exact v0.14.0-era body shape (no series key) still 201s and stores series null (exit criterion 6)", async () => {
      const app = appFor(makeStores());
      const res = await asA(request(app).post("/api/logs")).send(
        V0_14_0_LOG_BODY,
      );
      expect(res.status).toBe(201);

      const fetched = await getLogById(app, res.body.id);
      expect(fetched.body.series).toBeNull();
    });
  });

  // From-the-log spec (2026-08-18), §3: the list projection's ONE
  // sanctioned field removal, legal against the additive-only rule
  // because `RecentLog` (the response's only client reader,
  // `src/api/useRecentLogs.ts`) never carried `steps` — grep-confirmed,
  // pinned here as a runtime key check on the actual response.
  describe("list projection drops steps (from-the-log spec, 2026-08-18)", () => {
    it("GET /api/logs rows never carry a steps key", async () => {
      const app = appFor(makeStores());
      await asA(request(app).post("/api/logs")).send(validLogBody());
      const list = await asA(request(app).get("/api/logs"));
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).not.toHaveProperty("steps");
    });

    it("GET /api/logs/:id still returns the full row, steps included", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.steps).toStrictEqual(validLogBody().steps);
    });

    // Series capture spec (2026-08-19), §3 "List projection": `series`
    // joins `steps` in the exclusion — same reason (dead weight for a
    // list row's meta + hero snippet), same shape of proof.
    it("GET /api/logs rows never carry a series key", async () => {
      const app = appFor(makeStores());
      await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series: { samples: [{ t: 10, d: 23, p: 1400, spm: 24 }] },
      });
      const list = await asA(request(app).get("/api/logs"));
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).not.toHaveProperty("series");
    });

    it("GET /api/logs/:id still returns the full row, series included", async () => {
      const app = appFor(makeStores());
      const series = { samples: [{ t: 10, d: 23, p: 1400, spm: 24 }] };
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series,
      });
      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.series).toStrictEqual(series);
    });
  });

  // From-the-log spec (2026-08-18), §3: cursor = the last row's id alone.
  describe("GET /api/logs cursor pagination (?before=)", () => {
    it("pages through the full list with no gaps or duplicates at limit=1", async () => {
      const app = appFor(makeStores());
      const a = await asA(request(app).post("/api/logs")).send(validLogBody());
      const b = await asA(request(app).post("/api/logs")).send(validLogBody());
      const c = await asA(request(app).post("/api/logs")).send(validLogBody());

      const page1 = await asA(request(app).get("/api/logs?limit=1"));
      expect(page1.body.map((r: { id: string }) => r.id)).toStrictEqual([
        c.body.id,
      ]);

      const page2 = await asA(
        request(app).get(`/api/logs?limit=1&before=${page1.body[0].id}`),
      );
      expect(page2.body.map((r: { id: string }) => r.id)).toStrictEqual([
        b.body.id,
      ]);

      const page3 = await asA(
        request(app).get(`/api/logs?limit=1&before=${page2.body[0].id}`),
      );
      expect(page3.body.map((r: { id: string }) => r.id)).toStrictEqual([
        a.body.id,
      ]);

      const page4 = await asA(
        request(app).get(`/api/logs?limit=1&before=${page3.body[0].id}`),
      );
      expect(page4.body).toStrictEqual([]);
    });

    it("rejects a malformed (non-uuid) before with 400, field named", async () => {
      const res = await asA(
        request(appFor(makeStores())).get("/api/logs?before=not-a-uuid"),
      );
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("before");
    });

    it("rejects a well-formed but absent before with 400, field named", async () => {
      const res = await asA(
        request(appFor(makeStores())).get(
          `/api/logs?before=${NON_EXISTENT_UUID}`,
        ),
      );
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("before");
    });

    it("rejects a foreign (another user's) before with 400, no existence leak", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      const res = await asB(
        request(app).get(`/api/logs?before=${created.body.id}`),
      );
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("before");
    });

    // The catch block's `instanceof CursorNotFoundError` check is a
    // NARROW one (400, field-named) — anything else `stores.logs.list`
    // might throw must NOT be swallowed as a false "bad cursor" 400. This
    // is the one branch nothing else in this describe reaches: every
    // other case's thrown error genuinely IS CursorNotFoundError.
    it("rethrows a non-cursor error rather than mislabeling it a 400", async () => {
      const stores = makeStores();
      vi.spyOn(stores.logs, "list").mockRejectedValueOnce(
        new Error("unexpected store failure"),
      );
      const res = await asA(request(appFor(stores)).get("/api/logs"));
      expect(res.status).toBe(500);
    });
  });

  // From-the-log spec (2026-08-18), §3: the from-the-log view's fetch.
  describe("GET /api/logs/:id", () => {
    it("returns the full row, steps included, for the owner", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      const res = await getLogById(app, created.body.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: created.body.id,
        workoutTitle: "Steady State",
      });
      expect(res.body.steps).toStrictEqual(validLogBody().steps);
    });

    it("404s on a malformed (non-uuid) id", async () => {
      const res = await asA(
        request(appFor(makeStores())).get("/api/logs/not-a-uuid"),
      );
      expect(res.status).toBe(404);
    });

    it("404s on a well-formed but absent id (does not leak existence)", async () => {
      const res = await asA(
        request(appFor(makeStores())).get(`/api/logs/${NON_EXISTENT_UUID}`),
      );
      expect(res.status).toBe(404);
    });

    it("404s on another user's id (no existence leak either direction)", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      const res = await asB(request(app).get(`/api/logs/${created.body.id}`));
      expect(res.status).toBe(404);
    });
  });

  // From-the-log spec (2026-08-18), §3: the API's first UPDATE.
  describe("PATCH /api/logs/:id", () => {
    it("updates only the given subset, leaving the rest alone", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        held: "held",
        pain: 2,
        notes: "orig note",
        thumbs: "up",
      });

      const res = await asA(
        request(app).patch(`/api/logs/${created.body.id}`),
      ).send({ pain: 4 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        held: "held",
        pain: 4,
        notes: "orig note",
        thumbs: "up",
      });

      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body).toMatchObject({
        held: "held",
        pain: 4,
        notes: "orig note",
        thumbs: "up",
      });
    });

    it.each([
      ["held", "held"],
      ["pain", 3],
      ["thumbs", "up"],
      ["notes", "some note"],
    ])(
      "an explicit null clears %s previously set to a real value",
      async (field, value) => {
        const app = appFor(makeStores());
        const created = await asA(request(app).post("/api/logs")).send({
          ...validLogBody(),
          [field]: value,
        });

        const res = await asA(
          request(app).patch(`/api/logs/${created.body.id}`),
        ).send({ [field]: null });
        expect(res.status).toBe(200);
        expect(res.body[field]).toBeNull();
      },
    );

    it("an absent key leaves that field untouched", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        held: "held",
        pain: 2,
        notes: "keep me",
        thumbs: "down",
      });

      const res = await asA(
        request(app).patch(`/api/logs/${created.body.id}`),
      ).send({ notes: "changed" });
      expect(res.status).toBe(200);
      // held/pain/thumbs were never named in the PATCH body — untouched.
      expect(res.body).toMatchObject({
        held: "held",
        pain: 2,
        thumbs: "down",
        notes: "changed",
      });
    });

    // Plan bullet's own example: an unknown key alongside a bogus attempt
    // to rewrite the immutable `steps` — both silently ignored, 200, row
    // unchanged except whatever recognized keys (none, here) were sent.
    it("ignores unknown keys, including an attempt to rewrite steps, and 200s with the row unchanged", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );

      const res = await asA(
        request(app).patch(`/api/logs/${created.body.id}`),
      ).send({ steps: [{ label: "Hijacked" }], banana: 1 });
      expect(res.status).toBe(200);
      expect(res.body.steps).toStrictEqual(validLogBody().steps);
      expect(res.body).not.toHaveProperty("banana");
    });

    // Series capture spec (2026-08-19), §3: "PATCH does not accept
    // series" — no new code path, PATCH's own accepted-key set
    // (thumbs/held/pain/notes) simply never grew one. `series` is an
    // ordinary unknown key here, same fate as `banana`/`steps` above; the
    // row's own `series` (set at POST time) survives byte-identical.
    it("PATCH ignores an attempt to rewrite series — not in its accepted set, row unchanged", async () => {
      const app = appFor(makeStores());
      const series = { samples: [{ t: 10, d: 23, p: 1400, spm: 24 }] };
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        series,
      });

      const res = await asA(
        request(app).patch(`/api/logs/${created.body.id}`),
      ).send({ series: { samples: [{ t: 999, d: 999, p: 999, spm: 999 }] } });
      expect(res.status).toBe(200);
      // The response is the full row (same shape GET /:id returns) — its
      // own `series` still reflects what POST originally stored, proving
      // the PATCH body's `series` was ignored as an unrecognized key, not
      // that the field vanished from the response shape.
      expect(res.body.series).toStrictEqual(series);

      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.series).toStrictEqual(series);
    });

    it("an empty body is a 200 no-op read", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        notes: "unchanged",
      });

      const res = await asA(
        request(app).patch(`/api/logs/${created.body.id}`),
      ).send({});
      expect(res.status).toBe(200);
      expect(res.body.notes).toBe("unchanged");
    });

    // The no-op-read branch (empty body / unknown-keys-only) is still
    // owner-checked: it reads via `stores.logs.get`, not `update`, so it
    // needs its OWN 404 coverage distinct from the non-empty-patch 404
    // cases below (which exercise `stores.logs.update`'s null return
    // instead).
    it("an empty body still 404s on a well-formed but absent id", async () => {
      const res = await asA(
        request(appFor(makeStores())).patch(`/api/logs/${NON_EXISTENT_UUID}`),
      ).send({});
      expect(res.status).toBe(404);
    });

    it("an empty body still 404s on another user's id", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      const res = await asB(
        request(app).patch(`/api/logs/${created.body.id}`),
      ).send({});
      expect(res.status).toBe(404);
    });

    // Value validation reuses POST's validators by import — same field,
    // same exact message, one copy.
    it.each([
      ["held", "sideways", "held must be one of held|under|over or null"],
      ["pain", 99, "pain must be an integer 1..5 or null"],
      ["thumbs", "left", "thumbs must be one of up|down or null"],
      ["notes", 12345, "notes must be a string or null"],
    ])(
      "rejects a bad %s value with 400, POST's exact message",
      async (field, value, message) => {
        const app = appFor(makeStores());
        const created = await asA(request(app).post("/api/logs")).send(
          validLogBody(),
        );

        const postRes = await asA(request(app).post("/api/logs")).send({
          ...validLogBody(),
          [field]: value,
        });
        expect(postRes.status).toBe(400);
        expect(postRes.body.error).toBe(message);

        const patchRes = await asA(
          request(app).patch(`/api/logs/${created.body.id}`),
        ).send({ [field]: value });
        expect(patchRes.status).toBe(400);
        expect(patchRes.body.field).toBe(field);
        expect(patchRes.body.error).toBe(message);
        expect(patchRes.body.error).toBe(postRes.body.error);
      },
    );

    it("404s on a malformed (non-uuid) id", async () => {
      const res = await asA(
        request(appFor(makeStores())).patch("/api/logs/not-a-uuid"),
      ).send({ pain: 3 });
      expect(res.status).toBe(404);
    });

    it("404s on a well-formed but absent id", async () => {
      const res = await asA(
        request(appFor(makeStores())).patch(`/api/logs/${NON_EXISTENT_UUID}`),
      ).send({ pain: 3 });
      expect(res.status).toBe(404);
    });

    it("404s on another user's id and never touches that row", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        notes: "A's note",
      });

      const res = await asB(
        request(app).patch(`/api/logs/${created.body.id}`),
      ).send({ notes: "hijacked" });
      expect(res.status).toBe(404);

      const fetched = await getLogById(app, created.body.id);
      expect(fetched.body.notes).toBe("A's note");
    });
  });

  // Log-delete spec (2026-08-18), §2: the API's first DELETE. Owner-
  // checked exactly like GET/PATCH (404 on absence OR another user's
  // row, no existence leak); `200 {unCounted}` otherwise.
  describe("DELETE /api/logs/:id", () => {
    it("deletes a non-plan-linked log: 200 {unCounted: false}, then 404s on refetch", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );

      const res = await asA(
        request(app).delete(`/api/logs/${created.body.id}`),
      );
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({ unCounted: false });

      const fetched = await getLogById(app, created.body.id);
      expect(fetched.status).toBe(404);
    });

    it("deleting the terminal plan-linked log un-counts: 200 {unCounted: true}", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );

      const res = await asA(
        request(app).delete(`/api/logs/${created.body.id}`),
      );
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({ unCounted: true });

      const plan = await asA(request(app).get("/api/plan"));
      expect(plan.body.doneN).toBe(0);
    });

    it("deleting a NON-TERMINAL plan-linked log does not un-count: 200 {unCounted: false}", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
      const first = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      await asA(request(app).post("/api/logs")).send(validLogBody());

      const res = await asA(request(app).delete(`/api/logs/${first.body.id}`));
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({ unCounted: false });

      const plan = await asA(request(app).get("/api/plan"));
      expect(plan.body.doneN).toBe(2);
    });

    it("404s on a malformed (non-uuid) id", async () => {
      const res = await asA(
        request(appFor(makeStores())).delete("/api/logs/not-a-uuid"),
      );
      expect(res.status).toBe(404);
    });

    it("404s on a well-formed but absent id (does not leak existence)", async () => {
      const res = await asA(
        request(appFor(makeStores())).delete(`/api/logs/${NON_EXISTENT_UUID}`),
      );
      expect(res.status).toBe(404);
    });

    it("404s on another user's id, and never deletes that row", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );

      const res = await asB(
        request(app).delete(`/api/logs/${created.body.id}`),
      );
      expect(res.status).toBe(404);

      const fetched = await getLogById(app, created.body.id);
      expect(fetched.status).toBe(200);
    });

    // §2: "A second delete of the same id 404s" — the CLIENT treats this
    // as success (§1), but the API itself must not pretend the row is
    // still there.
    it("a second delete of the same id 404s", async () => {
      const app = appFor(makeStores());
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );
      const first = await asA(
        request(app).delete(`/api/logs/${created.body.id}`),
      );
      expect(first.status).toBe(200);

      const second = await asA(
        request(app).delete(`/api/logs/${created.body.id}`),
      );
      expect(second.status).toBe(404);
    });

    // §5.4 bystander byte-comparison, at the route: another user's row,
    // and this user's OTHER logs, read back byte-identical after a
    // delete — the route composes the store correctly, no route-level
    // side channel touches an unrelated row.
    it("never mutates a bystander row — another user's, or this user's other logs (§5.4)", async () => {
      const app = appFor(makeStores());
      const doomed = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        notes: "doomed",
      });
      const sibling = await asA(request(app).post("/api/logs")).send({
        ...validLogBody(),
        notes: "sibling",
      });
      const stranger = await asB(request(app).post("/api/logs")).send({
        ...validLogBody(),
        notes: "stranger",
      });
      const siblingBefore = await getLogById(app, sibling.body.id);
      const strangerBefore = await asB(
        request(app).get(`/api/logs/${stranger.body.id}`),
      );

      await asA(request(app).delete(`/api/logs/${doomed.body.id}`));

      const siblingAfter = await getLogById(app, sibling.body.id);
      const strangerAfter = await asB(
        request(app).get(`/api/logs/${stranger.body.id}`),
      );
      expect(siblingAfter.body).toStrictEqual(siblingBefore.body);
      expect(strangerAfter.body).toStrictEqual(strangerBefore.body);
    });
  });

  // From-the-log spec (2026-08-18), §2/§3: Plan's done-row link.
  describe("GET /api/logs?plan=", () => {
    it("returns the linked log id per plan index", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
      const created = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );

      const res = await asA(request(app).get("/api/logs?plan=sprint"));
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({
        links: [{ planIndex: 0, id: created.body.id }],
      });
    });

    it("rejects an invalid plan key with 400, field named", async () => {
      const res = await asA(
        request(appFor(makeStores())).get("/api/logs?plan=marathon"),
      );
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("plan");
    });

    // The reset collision (spec §2): after a reset, the next advancing
    // save stamps index 0 again — the read side must resolve newest-wins,
    // not the first (now stale) row at that index.
    it("resolves a reset collision newest-wins: the later log wins its index", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
      await asA(request(app).post("/api/logs")).send(validLogBody());

      await asA(request(app).put("/api/plan")).send({ reset: true });
      const second = await asA(request(app).post("/api/logs")).send(
        validLogBody(),
      );

      const res = await asA(request(app).get("/api/logs?plan=sprint"));
      expect(res.body).toStrictEqual({
        links: [{ planIndex: 0, id: second.body.id }],
      });
    });

    it("is scoped per user", async () => {
      const app = appFor(makeStores());
      await asA(request(app).put("/api/plan")).send({ planKey: "sprint" });
      await asA(request(app).post("/api/logs")).send(validLogBody());

      const res = await asB(request(app).get("/api/logs?plan=sprint"));
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({ links: [] });
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
      code: PLANS.sprint.sessions[0].type,
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

  // Phase WU exit criterion 6 (2026-08-21-warmup-removal-design.md §8):
  // the removed setting is the one deliberate exception to "an unrecognized
  // key is silently ignored" (the previous test, and `PATCH /api/logs/:id`'s
  // own `held`-idiom comment, both document that as the route's general
  // policy) — a stale `warmup` key gets a 400, not a silent no-op, so a
  // not-yet-updated client finds out its write did nothing rather than
  // believing it succeeded.
  it("rejects a warmup key on PUT /api/prefs", async () => {
    const stores = makeStores();
    vi.spyOn(stores.preferences, "put");
    const res = await asA(request(appFor(stores)).put("/api/prefs")).send({
      warmup: null,
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("warmup");
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
      countdownSeconds: 5,
      paceToleranceSeconds: 2,
      accentColor: "#123456",
      startHereDismissed: true,
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
      todayCode: PLANS.sprint.sessions[0].type,
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
    const todayCode = PLANS.sprint.sessions[0].type;
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
    const todayCode = PLANS.sprint.sessions[0].type;
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
  // that happens to still have "6K Test" in its library.
  it("excludes the designated onboarding workout from the pool/recommendation, even at a matching type", async () => {
    const stores = makeStores();
    const app = appFor(stores);
    await asA(request(app).put("/api/baselines")).send({
      k2Seconds: 120,
      k6Seconds: 130,
    });
    const todayCode = PLANS.sprint.sessions[0].type;
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
  // — a rower's own custom workout that happens to be named "6K Test"
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
    const todayCode = PLANS.sprint.sessions[0].type;
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
    expect(res.body.todayCode).toBe(PLANS.head.sessions[0].type);
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
    const todayCode = PLANS.sprint.sessions[0].type;
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
