import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp, type AppDeps } from "../app.js";
import { SESSION_COOKIE } from "./cookies.js";
import { makeFakeSessions, makeFakeUsers } from "../testing/fakes.js";

const baseUser = {
  id: "u1",
  googleSub: "test:e2e@test.local",
  email: "e2e@test.local",
  name: "E2E Test User",
  createdAt: new Date(),
};

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    checkDb: async () => true,
    sessions: makeFakeSessions({
      createSession: vi.fn(async () => ({
        token: "tok",
        expiresAt: new Date(Date.now() + 1_000_000),
      })),
    }),
    users: makeFakeUsers(),
    oauth: null,
    nativeVerifier: null,
    allowlist: new Set(),
    siteUrl: "https://ergomatic.example",
    stores: null,
    testAuthSecret: "e2e-secret",
    ...overrides,
  };
}

describe("POST /api/auth/test-signin", () => {
  it("is absent (404) when testAuthSecret is null", async () => {
    const res = await request(createApp(deps({ testAuthSecret: null })))
      .post("/api/auth/test-signin")
      .send({ secret: "e2e-secret" });
    expect(res.status).toBe(404);
  });

  it("401s with {error: 'unauthorized'} on the wrong secret", async () => {
    const res = await request(createApp(deps()))
      .post("/api/auth/test-signin")
      .send({ secret: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body).toStrictEqual({ error: "unauthorized" });
  });

  it("signs in with the correct secret: 200, session cookie, user created", async () => {
    const d = deps({
      users: makeFakeUsers({ createUser: vi.fn(async () => baseUser) }),
    });
    const res = await request(createApp(d))
      .post("/api/auth/test-signin")
      .send({ secret: "e2e-secret" });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      user: { id: "u1", email: "e2e@test.local", name: "E2E Test User" },
    });
    expect(res.headers["set-cookie"]![0]).toContain(`${SESSION_COOKIE}=tok`);
    expect(d.users.createUser).toHaveBeenCalledWith({
      googleSub: "test:e2e@test.local",
      email: "e2e@test.local",
      name: "E2E Test User",
    });
  });

  it("uses the given email/name and namespaces the googleSub", async () => {
    const d = deps({
      users: makeFakeUsers({
        createUser: vi.fn(async () => ({
          ...baseUser,
          googleSub: "test:a@b.com",
          email: "a@b.com",
          name: "Ada",
        })),
      }),
    });
    const res = await request(createApp(d))
      .post("/api/auth/test-signin")
      .send({ secret: "e2e-secret", email: "a@b.com", name: "Ada" });
    expect(res.status).toBe(200);
    expect(d.users.createUser).toHaveBeenCalledWith({
      googleSub: "test:a@b.com",
      email: "a@b.com",
      name: "Ada",
    });
  });

  it("reuses the existing user on a second call for the same email", async () => {
    const users = makeFakeUsers({
      findByGoogleSub: vi.fn(async () => baseUser),
    });
    const d = deps({ users });
    const first = await request(createApp(d))
      .post("/api/auth/test-signin")
      .send({ secret: "e2e-secret" });
    const second = await request(createApp(d))
      .post("/api/auth/test-signin")
      .send({ secret: "e2e-secret" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(users.createUser).not.toHaveBeenCalled();
  });
});
