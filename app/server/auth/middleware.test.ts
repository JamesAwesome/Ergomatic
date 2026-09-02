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
    res.json({ user: req.user, authVia: req.authVia });
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
    expect(res.body).toStrictEqual({ error: "unauthenticated" });
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
    expect(res.body.user).toStrictEqual(user);
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
    expect(res.body.user).toStrictEqual(user);
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

// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §1): which
// credential requireUser RESOLVED is a property of every request; the
// concept2 router derives the attempt's surface from it. An empty-valued
// cookie is ABSENT (cookies.ts's clearSessionCookie sets maxAge 0, so a
// compliant browser deletes rather than empties it, and the shared native
// jar is UNMEASURED); the derivation must never be written
// `cookie !== undefined`.
describe("requireUser authVia + both-present (PR1.75a)", () => {
  const userA = { id: "ua", email: "a@x.com", name: "A" };
  const userB = { id: "ub", email: "b@x.com", name: "B" };
  const twoUserStore = () =>
    ({
      resolveSession: vi.fn(async (token: string) => {
        const user =
          token === "bearer-a" || token === "cookie-a"
            ? userA
            : token === "cookie-b"
              ? userB
              : null;
        if (!user) return null;
        return {
          user,
          expiresAt: new Date(Date.now() + 1000_000),
          refreshed: false,
        };
      }),
    }) as unknown as SessionStore;

  it("bearer -> authVia 'bearer'", async () => {
    const res = await request(guardedApp(twoUserStore()))
      .get("/whoami")
      .set("Authorization", "Bearer bearer-a");
    expect(res.status).toBe(200);
    expect(res.body.authVia).toBe("bearer");
  });

  it("cookie -> authVia 'cookie'", async () => {
    const res = await request(guardedApp(twoUserStore()))
      .get("/whoami")
      .set("Cookie", `${SESSION_COOKIE}=cookie-a`);
    expect(res.status).toBe(200);
    expect(res.body.authVia).toBe("cookie");
  });

  it("an empty-valued cookie alone is ABSENT: 401, and the store is never asked to resolve ''", async () => {
    const store = twoUserStore();
    const res = await request(guardedApp(store))
      .get("/whoami")
      .set("Cookie", `${SESSION_COOKIE}=`);
    expect(res.status).toBe(401);
    expect(store.resolveSession).not.toHaveBeenCalled();
  });

  it("bearer plus an empty-valued cookie resolves as bearer ONLY: one resolveSession call, never with ''", async () => {
    const store = twoUserStore();
    const res = await request(guardedApp(store))
      .get("/whoami")
      .set("Authorization", "Bearer bearer-a")
      .set("Cookie", `${SESSION_COOKIE}=`);
    expect(res.status).toBe(200);
    expect(res.body.authVia).toBe("bearer");
    expect(store.resolveSession).toHaveBeenCalledTimes(1);
    expect(store.resolveSession).toHaveBeenCalledWith("bearer-a");
  });

  it("both present, SAME user -> bearer wins, authVia 'bearer', no disagreement line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await request(guardedApp(twoUserStore()))
        .get("/whoami")
        .set("Authorization", "Bearer bearer-a")
        .set("Cookie", `${SESSION_COOKIE}=cookie-a`);
      expect(res.status).toBe(200);
      expect(res.body.user).toStrictEqual(userA);
      expect(res.body.authVia).toBe("bearer");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("both present, DIFFERENT users -> bearer resolved AND exactly one auth_disagreement line naming both ids, never a token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await request(guardedApp(twoUserStore()))
        .get("/whoami")
        .set("Authorization", "Bearer bearer-a")
        .set("Cookie", `${SESSION_COOKIE}=cookie-b`);
      expect(res.status).toBe(200);
      expect(res.body.user).toStrictEqual(userA);
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0][0]);
      expect(JSON.parse(line)).toStrictEqual({
        event: "auth_disagreement",
        bearerUser: "ua",
        cookieUser: "ub",
        path: "/whoami",
      });
      expect(line).not.toContain("bearer-a");
      expect(line).not.toContain("cookie-b");
    } finally {
      warn.mockRestore();
    }
  });

  it("neither present -> 401 unchanged", async () => {
    const res = await request(guardedApp(twoUserStore())).get("/whoami");
    expect(res.status).toBe(401);
    expect(res.body).toStrictEqual({ error: "unauthenticated" });
  });

  // Design §Testing (d): the walk instrument for §1's UNMEASURED premise —
  // committed code behind an env flag (never NODE_ENV), so the walk runs
  // this PR's own build. Logs presence booleans and the path, never a token.
  describe("AUTH_VIA_LOG=1 instrument", () => {
    it("logs {authVia, bearerPresent, cookiePresent, path} and never the token", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const prev = process.env.AUTH_VIA_LOG;
      process.env.AUTH_VIA_LOG = "1";
      try {
        await request(guardedApp(twoUserStore()))
          .get("/whoami")
          .set("Authorization", "Bearer bearer-a")
          .set("Cookie", `${SESSION_COOKIE}=`);
        const lines = log.mock.calls.map((c) => String(c[0]));
        const authVia = lines.find((l) => l.includes('"auth_via"'));
        expect(authVia).toBeDefined();
        expect(JSON.parse(authVia!)).toStrictEqual({
          event: "auth_via",
          authVia: "bearer",
          bearerPresent: true,
          cookiePresent: false,
          path: "/whoami",
        });
        expect(authVia).not.toContain("bearer-a");
      } finally {
        if (prev === undefined) delete process.env.AUTH_VIA_LOG;
        else process.env.AUTH_VIA_LOG = prev;
        log.mockRestore();
      }
    });

    it("is silent when the flag is unset", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const prev = process.env.AUTH_VIA_LOG;
      delete process.env.AUTH_VIA_LOG;
      try {
        await request(guardedApp(twoUserStore()))
          .get("/whoami")
          .set("Authorization", "Bearer bearer-a");
        expect(
          log.mock.calls.some((c) => String(c[0]).includes('"auth_via"')),
        ).toBe(false);
      } finally {
        if (prev !== undefined) process.env.AUTH_VIA_LOG = prev;
        log.mockRestore();
      }
    });
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
