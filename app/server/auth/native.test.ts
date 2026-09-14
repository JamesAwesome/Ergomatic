import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { makeFakeSessions, makeFakeUsers } from "../testing/fakes.js";
import { createAccessPolicy } from "./accessPolicy.js";
import { AuthFailure } from "./frontDoorErrors.js";
import { Router, type RequestHandler } from "express";
import type { FrontDoor } from "./frontDoor.js";

const claims = { sub: "s1", email: "a@x.com", emailVerified: true, name: "A" };
const dbUser = {
  id: "u1",
  appleSub: null,
  googleSub: "s1",
  email: "a@x.com",
  name: "A",
  createdAt: new Date(),
};

function nativeDeps(overrides: Record<string, unknown> = {}) {
  return baseDeps({
    sessions: makeFakeSessions({
      createSession: vi.fn(async () => ({
        token: "btok",
        expiresAt: new Date("2026-09-01"),
      })),
    }),
    users: makeFakeUsers({
      createUser: vi.fn(async () => dbUser),
    }),
    accessPolicy: createAccessPolicy("restricted", "a@x.com"),
    nativeVerifier: async () => claims,
    ...overrides,
  });
}

const post = (deps = nativeDeps(), body: object = { idToken: "jwt" }) =>
  request(createApp(deps)).post("/api/auth/native").send(body);

function deniedFrontDoor(email: string): FrontDoor {
  const appleCallback: RequestHandler = (_req, res) => res.status(503).end();
  const admission: RequestHandler = (_req, _res, next) => next();
  return {
    router: Router(),
    appleCallback,
    admission,
    attempts: {
      legacyGoogle: vi.fn(async () => {
        throw new AuthFailure("access_denied", email);
      }),
    },
  } as unknown as FrontDoor;
}

describe("POST /api/auth/native", () => {
  it("mints a bearer session for an allowlisted new user", async () => {
    const d = nativeDeps();
    const res = await post(d);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      token: "btok",
      expiresAt: "2026-09-01T00:00:00.000Z",
      user: { id: "u1", email: "a@x.com", name: "A" },
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("signs in an existing subject only when its saved email is allowed", async () => {
    const d = nativeDeps();
    (d.users.findByGoogleSub as ReturnType<typeof vi.fn>).mockResolvedValue(
      dbUser,
    );
    const res = await post(d);
    expect(res.status).toBe(200);
    expect(d.users.updateProfile).toHaveBeenCalledWith("u1", "A");
  });

  it("403s an existing subject whose saved email is no longer allowed", async () => {
    const d = nativeDeps({
      accessPolicy: createAccessPolicy("restricted", "other@x.com"),
    });
    (d.users.findByGoogleSub as ReturnType<typeof vi.fn>).mockResolvedValue(
      dbUser,
    );
    const res = await post(d);
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "denied", email: "a@x.com" });
    expect(d.sessions.createSession).not.toHaveBeenCalled();
  });

  it("keeps the legacy native denial body when the combined auth flow enforces access", async () => {
    const res = await post(
      nativeDeps({ frontDoor: deniedFrontDoor("saved-outside@test") }),
    );
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({
      error: "denied",
      email: "saved-outside@test",
    });
  });

  it("403s a non-allowlisted new user with the email, creating nothing", async () => {
    const d = nativeDeps({
      accessPolicy: createAccessPolicy("restricted", "other@x.com"),
    });
    const res = await post(d);
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "denied", email: "a@x.com" });
    expect(d.users.createUser).not.toHaveBeenCalled();
  });

  it("403s an unverified email before the allowlist", async () => {
    const d = nativeDeps({
      nativeVerifier: async () => ({ ...claims, emailVerified: false }),
    });
    const res = await post(d);
    expect(res.status).toBe(403);
    expect(d.users.createUser).not.toHaveBeenCalled();
  });

  it("401s when verification throws (expired/wrong-audience/garbage)", async () => {
    const d = nativeDeps({
      nativeVerifier: async () => {
        throw new Error("bad token");
      },
    });
    const res = await post(d);
    expect(res.status).toBe(401);
    expect(res.body).toStrictEqual({ error: "invalid_token" });
  });

  it("400s a missing idToken", async () => {
    const res = await post(nativeDeps(), {});
    expect(res.status).toBe(400);
  });

  it("503s when the verifier is unconfigured", async () => {
    const res = await post(nativeDeps({ nativeVerifier: null }));
    expect(res.status).toBe(503);
  });

  it("500s as signin_failed when the post-claims gate throws (e.g. DB failure)", async () => {
    const d = nativeDeps();
    (d.users.findByGoogleSub as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("db down"),
    );
    const res = await post(d);
    expect(res.status).toBe(500);
    expect(res.body).toStrictEqual({ error: "signin_failed" });
  });

  it("is reachable without an Origin match (bearer-style client)", async () => {
    const res = await request(createApp(nativeDeps()))
      .post("/api/auth/native")
      .set("Origin", "capacitor://localhost")
      .send({ idToken: "jwt" });
    expect(res.status).toBe(200);
  });
});
