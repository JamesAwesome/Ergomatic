import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { SessionStore } from "./sessions.js";
import { SESSION_COOKIE } from "./cookies.js";
import { noStore, originCheck, requireUser } from "./middleware.js";

const user = { id: "u1", email: "a@x.com", name: "A" };
const fakeStore = (resolved: unknown) =>
  ({ resolveSession: async () => resolved }) as unknown as SessionStore;

function guardedApp(store: SessionStore) {
  const app = express();
  app.get("/whoami", requireUser(store), (req, res) => {
    res.json({ user: req.user });
  });
  return app;
}

describe("noStore", () => {
  it("stamps Cache-Control: no-store", async () => {
    const app = express();
    app.use(noStore);
    app.get("/x", (_req, res) => {
      res.json({});
    });
    const res = await request(app).get("/x");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("originCheck", () => {
  const app = express();
  app.use(originCheck("https://ergomatic.example"));
  app.post("/m", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/g", (_req, res) => {
    res.json({ ok: true });
  });

  it("rejects mutating requests from a foreign origin", async () => {
    const res = await request(app)
      .post("/m")
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });
  it("allows the site origin, localhost dev, and origin-absent", async () => {
    expect(
      (await request(app).post("/m").set("Origin", "https://ergomatic.example"))
        .status,
    ).toBe(200);
    expect(
      (await request(app).post("/m").set("Origin", "http://localhost:5173"))
        .status,
    ).toBe(200);
    expect((await request(app).post("/m")).status).toBe(200);
    expect(
      (await request(app).post("/m").set("Origin", "capacitor://localhost"))
        .status,
    ).toBe(200);
  });
  it("never blocks GET", async () => {
    expect(
      (await request(app).get("/g").set("Origin", "https://evil.example"))
        .status,
    ).toBe(200);
  });
});

describe("requireUser", () => {
  it("401s with no cookie", async () => {
    const res = await request(guardedApp(fakeStore(null))).get("/whoami");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthenticated" });
  });
  it("401s when the store rejects the token", async () => {
    const res = await request(guardedApp(fakeStore(null)))
      .get("/whoami")
      .set("Cookie", `${SESSION_COOKIE}=bad`);
    expect(res.status).toBe(401);
  });
  it("passes the user through and re-sets the cookie on refresh", async () => {
    const resolved = {
      user,
      expiresAt: new Date(Date.now() + 1000_000),
      refreshed: true,
    };
    const res = await request(guardedApp(fakeStore(resolved)))
      .get("/whoami")
      .set("Cookie", `${SESSION_COOKIE}=tok`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(user);
    expect(res.headers["set-cookie"]?.[0]).toContain(`${SESSION_COOKIE}=tok`);
  });
  it("does not re-set the cookie when not refreshed", async () => {
    const resolved = {
      user,
      expiresAt: new Date(Date.now() + 1000_000),
      refreshed: false,
    };
    const res = await request(guardedApp(fakeStore(resolved)))
      .get("/whoami")
      .set("Cookie", `${SESSION_COOKIE}=tok`);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("requireUser bearer mode", () => {
  const resolved = {
    user,
    expiresAt: new Date(Date.now() + 1000_000),
    refreshed: false,
  };

  it("accepts a valid bearer token", async () => {
    const res = await request(guardedApp(fakeStore(resolved)))
      .get("/whoami")
      .set("Authorization", "Bearer tok");
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(user);
  });

  it("401s on a bad bearer token", async () => {
    const res = await request(guardedApp(fakeStore(null)))
      .get("/whoami")
      .set("Authorization", "Bearer nope");
    expect(res.status).toBe(401);
  });

  it("signals bearer refresh via X-Session-Expires-At, not Set-Cookie", async () => {
    const expiresAt = new Date(Date.now() + 1000_000);
    const res = await request(
      guardedApp(fakeStore({ user, expiresAt, refreshed: true })),
    )
      .get("/whoami")
      .set("Authorization", "Bearer tok");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["x-session-expires-at"]).toBe(expiresAt.toISOString());
  });

  it("prefers bearer over a simultaneously-present cookie", async () => {
    const store = {
      resolveSession: vi.fn(async (token: string) =>
        token === "bearer-tok" ? resolved : null,
      ),
    } as unknown as SessionStore;
    const res = await request(guardedApp(store))
      .get("/whoami")
      .set("Authorization", "Bearer bearer-tok")
      .set("Cookie", `${SESSION_COOKIE}=cookie-tok`);
    expect(res.status).toBe(200);
    expect(store.resolveSession).toHaveBeenCalledWith("bearer-tok");
  });
});

describe("originCheck bearer exemption", () => {
  const app = express();
  app.use(originCheck("https://ergomatic.example"));
  app.post("/m", (_req, res) => {
    res.json({ ok: true });
  });

  it("lets a bearer request through despite a foreign Origin", async () => {
    const res = await request(app)
      .post("/m")
      .set("Origin", "https://evil.example")
      .set("Authorization", "Bearer tok");
    expect(res.status).toBe(200);
  });

  it("still blocks cookie-style requests from foreign origins", async () => {
    const res = await request(app)
      .post("/m")
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });
});
