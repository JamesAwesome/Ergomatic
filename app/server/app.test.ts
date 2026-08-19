import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { baseDeps } from "./testDeps.js";
import type { SessionStore, SessionUser } from "./auth/sessions.js";
import { makeFakeStores } from "./testing/fakes.js";

describe("GET /api/health", () => {
  it("returns 200 with db:true when the DB check passes", async () => {
    const res = await request(
      createApp(baseDeps({ checkDb: async () => true })),
    ).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, db: true, version: "dev" });
  });

  it("reports APP_VERSION when set", async () => {
    process.env.APP_VERSION = "v9.9.9-test";
    try {
      const res = await request(
        createApp(baseDeps({ checkDb: async () => true })),
      ).get("/api/health");
      expect(res.body.version).toBe("v9.9.9-test");
    } finally {
      delete process.env.APP_VERSION;
    }
  });

  it("returns 503 with db:false when the DB check fails", async () => {
    const res = await request(
      createApp(baseDeps({ checkDb: async () => false })),
    ).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toStrictEqual({ ok: false, db: false, version: "dev" });
  });

  it("returns 503 when the DB check throws", async () => {
    const app = createApp(
      baseDeps({
        checkDb: async () => {
          throw new Error("boom");
        },
      }),
    );
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toStrictEqual({ ok: false, db: false, version: "dev" });
  });
});

describe("non-API paths (api container serves no client)", () => {
  it("404s at / — static serving lives in the web container now", async () => {
    const res = await request(
      createApp(baseDeps({ checkDb: async () => true })),
    ).get("/");
    expect(res.status).toBe(404);
  });

  it("keeps non-API paths outside requireUser: / is 404, never 401, with stores mounted (2026-07-28 root-401 hotfix)", async () => {
    // Regression re-pinned post-split: an unscoped router.use(requireUser)
    // would turn this 404 into a 401. Keep the contrast pair below honest.
    const stores = {} as unknown as import("./routes/data.js").Stores;
    const res = await request(
      createApp(baseDeps({ checkDb: async () => true, stores })),
    ).get("/");
    expect(res.status).toBe(404);
  });

  it("still 401s unauthenticated /api requests (contrast pin)", async () => {
    const stores = {} as unknown as import("./routes/data.js").Stores;
    const res = await request(
      createApp(baseDeps({ checkDb: async () => true, stores })),
    ).get("/api/workouts");
    expect(res.status).toBe(401);
  });
});

// Series capture spec (2026-08-19), §3: "the route's body limit is raised
// DELIBERATELY... a route-scoped express.json({limit: "1mb"}) on POST
// /api/logs only — the app-wide default stays." Proved here against the
// REAL `createApp` wiring (not a per-file test harness), both directions:
// POST /api/logs itself can carry a body well past the app default, and
// every OTHER route stays capped at it.
describe("POST /api/logs body limit (Phase LT spec 2, §3)", () => {
  const user: SessionUser = { id: "series-user", email: "s@x.com", name: "S" };

  function fakeSessions(): SessionStore {
    return {
      resolveSession: async (token: string) =>
        token === "series-token"
          ? {
              user,
              expiresAt: new Date(Date.now() + 100_000),
              refreshed: false,
            }
          : null,
    } as unknown as SessionStore;
  }

  function appWithFakeStores() {
    return createApp(
      baseDeps({
        checkDb: async () => true,
        sessions: fakeSessions(),
        stores: makeFakeStores(),
      }),
    );
  }

  const bearer = (req: request.Test) =>
    req.set("Authorization", "Bearer series-token");

  // The antagonist's own probe (task-3 brief, "repo facts"): 2200 samples
  // -> 413 against the bare app-wide default. Same shape here, proving
  // the fix — a real series payload past 100 KB (but comfortably under
  // the route's own 1mb ceiling) now 201s instead of 413ing.
  it("accepts a >100KB series body on POST /api/logs (the antagonist's ~2200-sample-class probe, now 201 not 413)", async () => {
    const samples = Array.from({ length: 2_500 }, (_, i) => ({
      t: i + 1,
      d: i + 1,
      p: 1400,
      spm: 24,
      hr: 138,
    }));
    const body = JSON.stringify({
      workoutId: null,
      workoutTitle: "Steady State",
      workoutType: "AT",
      notes: null,
      steps: [{ label: "Work" }],
      series: { samples },
    });
    // Over 100KB (body-parser's own default), proven directly rather
    // than assumed — the whole point of this test.
    expect(Buffer.byteLength(body)).toBeGreaterThan(100 * 1024);

    const res = await bearer(request(appWithFakeStores()).post("/api/logs"))
      .set("Content-Type", "application/json")
      .send(body);
    expect(res.status).toBe(201);
  });

  it("still 413s a >100KB body on a DIFFERENT route — the app-wide default is unchanged", async () => {
    const text = "x".repeat(150 * 1024);
    const res = await bearer(
      request(appWithFakeStores()).post("/api/workouts/bulk"),
    )
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ text }));
    expect(res.status).toBe(413);
  });
});
