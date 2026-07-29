import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { baseDeps } from "./testDeps.js";

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
