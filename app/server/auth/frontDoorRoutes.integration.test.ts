import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type pg from "pg";
import { createDb } from "../db/index.js";
import { startPostgres } from "../testing/postgres.js";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { createSessionStore } from "./sessions.js";
import { createUserStore } from "./users.js";
import { createAttempts } from "./attempts.js";
import { createProviders } from "./providers.js";
import { createFrontDoorRoutes } from "./frontDoorRoutes.js";

describe("supported auth producers through Express and signed tokens", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let rsa: Awaited<ReturnType<typeof generateKeyPair>>;
  let attempts: ReturnType<typeof createAttempts>;
  const codes = new Map<string, string>();
  let exchangeOutsideLock = false;
  beforeAll(async () => {
    container = await startPostgres();
    const c = createDb(container.getConnectionUri());
    pool = c.pool;
    await migrate(c.db, { migrationsFolder: "drizzle" });
    const sessions = createSessionStore(c.db);
    const users = createUserStore(c.db);
    attempts = createAttempts(pool);
    await attempts.sweep();
    rsa = await generateKeyPair("RS256");
    const ec = await generateKeyPair("ES256");
    const keys = createLocalJWKSet({
      keys: [
        { ...(await exportJWK(rsa.publicKey)), kid: "test", alg: "RS256" },
      ],
    });
    const providers = createProviders(
      {
        siteUrl: "https://erg.test",
        apple: {
          nativeClientId: "native.app",
          webClientId: "web.app",
          teamId: "TEAM",
          keyId: "KEY",
          key: ec.privateKey,
        },
        google: {
          nativeClientId: "google.native",
          webClientId: "google.web",
          clientSecret: "secret",
        },
      },
      {
        appleKeys: keys,
        googleKeys: keys,
        fetch: async (_url, init) => {
          const code = new URLSearchParams(String(init?.body)).get("code")!;
          const tx = await pool.connect();
          try {
            await tx.query("BEGIN");
            await tx.query("SELECT id FROM auth_attempts FOR UPDATE NOWAIT");
            await tx.query("ROLLBACK");
            exchangeOutsideLock = true;
          } finally {
            tx.release();
          }
          return Response.json({
            id_token: codes.get(code),
            refresh_token: "private-refresh",
          });
        },
      },
    );
    const routes = createFrontDoorRoutes({
      attempts,
      providers,
      sessions,
      siteUrl: "https://erg.test",
    });
    app = createApp(
      baseDeps({
        siteUrl: "https://erg.test",
        sessions,
        users,
        frontDoor: { ...routes, attempts, providers, close: () => {} },
        nativeVerifier: async () => ({
          sub: "legacy",
          email: "outside@allowlist.test",
          emailVerified: true,
          name: "Legacy",
        }),
      }),
    );
  });
  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE users,auth_attempts CASCADE");
    codes.clear();
    exchangeOutsideLock = false;
  });
  async function jwt(nonce: string, audience: string, sub = "apple") {
    return new SignJWT({
      sub,
      nonce,
      email: "relay@privaterelay.appleid.com",
      email_verified: true,
    })
      .setIssuer("https://appleid.apple.com")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .sign(rsa.privateKey);
  }
  it("native producer stops at confirmation then creates a usable session, never returns Apple grant", async () => {
    const begin = await request(app)
      .post("/api/auth/native/attempts")
      .send({ purpose: "signin", provider: "apple" });
    expect(begin.status).toBe(200);
    const b = begin.body;
    const token = await jwt(b.nonce, "native.app");
    codes.set("code", token);
    const proof = await request(app)
      .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
      .send({
        bindingSecret: b.bindingSecret,
        state: b.state,
        idToken: token,
        authorizationCode: "code",
      });
    expect(proof.body.outcome).toBe("confirm");
    expect(exchangeOutsideLock).toBe(true);
    const confirm = await request(app)
      .post(`/api/auth/native/attempts/${b.attemptId}/confirm`)
      .send({ bindingSecret: b.bindingSecret });
    expect(confirm.status).toBe(200);
    expect(confirm.body.outcome).toBe("signed_in");
    expect(JSON.stringify(confirm.body)).not.toContain("private-refresh");
    const me = await request(app)
      .get("/api/me")
      .auth(confirm.body.token, { type: "bearer" });
    expect(me.body.user.email).toBe("relay@privaterelay.appleid.com");
  });
  it("Apple form_post reaches callback before origin check but requires binding and exact state", async () => {
    const begin = await request(app)
      .post("/api/auth/web/attempts")
      .set("Origin", "https://erg.test")
      .send({ purpose: "signin", provider: "apple" });
    const b = begin.body;
    const cookie = begin.headers["set-cookie"][0].split(";")[0];
    expect(begin.headers["set-cookie"][0]).toContain("SameSite=None");
    const token = await jwt(b.nonce, "web.app");
    codes.set("code", token);
    const missing = await request(app)
      .post("/api/auth/apple/callback")
      .set("Origin", "https://appleid.apple.com")
      .type("form")
      .send({ state: b.state, code: "code", id_token: token });
    expect(missing.status).toBe(303);
    expect(missing.headers.location).toContain("authError=");
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(1);
    const callback = await request(app)
      .post("/api/auth/apple/callback")
      .set("Origin", "https://appleid.apple.com")
      .set("Cookie", cookie)
      .type("form")
      .send({
        state: b.state,
        code: "code",
        id_token: token,
        user: JSON.stringify({
          name: { firstName: "First", lastName: "Name" },
        }),
      });
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe(`/?authAttempt=${b.attemptId}`);
    const resume = await request(app)
      .get(`/api/auth/web/attempts/${b.attemptId}`)
      .set("Cookie", cookie);
    expect(resume.body.profile.name).toBe("First Name");
    const blocked = await request(app)
      .post(`/api/auth/web/attempts/${b.attemptId}/confirm`)
      .set("Origin", "https://evil.test")
      .set("Cookie", cookie)
      .send({});
    expect(blocked.status).toBe(403);
    const confirm = await request(app)
      .post(`/api/auth/web/attempts/${b.attemptId}/confirm`)
      .set("Origin", "https://erg.test")
      .set("Cookie", cookie)
      .send({});
    expect(confirm.body.outcome).toBe("signed_in");
    expect(confirm.body).not.toHaveProperty("token");
    expect(
      (confirm.headers["set-cookie"] as unknown as string[]).some(
        (v: string) => v.includes("erg_session=") && v.includes("SameSite=Lax"),
      ),
    ).toBe(true);
  });
  it("bound provider cancellation erases attempt while unbound cancellation cannot", async () => {
    const begin = await request(app)
      .post("/api/auth/web/attempts")
      .send({ purpose: "signin", provider: "apple" });
    const b = begin.body;
    const cookie = begin.headers["set-cookie"][0].split(";")[0];
    const unbound = await request(app)
      .post("/api/auth/apple/callback")
      .type("form")
      .send({ state: b.state, error: "user_cancelled_authorize" });
    expect(unbound.headers.location).toContain("authError=");
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(1);
    const cancelled = await request(app)
      .post("/api/auth/apple/callback")
      .set("Cookie", cookie)
      .type("form")
      .send({ state: b.state, error: "user_cancelled_authorize" });
    expect(cancelled.headers.location).toBe(
      "/?authResult=cancelled&authPurpose=signin&authProvider=apple",
    );
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
  });
  it("legacy native Google keeps direct-create token response with allowlist empty", async () => {
    const response = await request(app)
      .post("/api/auth/native")
      .send({ idToken: "legacy-proof" });
    expect(response.status).toBe(200);
    expect(response.body.token).toStrictEqual(expect.any(String));
    expect(response.body).not.toHaveProperty("outcome");
    expect(response.body.user.email).toBe("outside@allowlist.test");
  });
  async function googleJwt(
    nonce: string,
    sub = "google",
    audience = "google.native",
  ) {
    return new SignJWT({
      sub,
      nonce,
      email: "original@test",
      email_verified: true,
      name: "Original",
    })
      .setIssuer("https://accounts.google.com")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .sign(rsa.privateKey);
  }
  it("native Google signup, fresh Google proof and Apple target finalize one account", async () => {
    const start = (
      await request(app)
        .post("/api/auth/native/attempts")
        .send({ purpose: "signin", provider: "google" })
    ).body;
    const pending = await request(app)
      .post(`/api/auth/native/attempts/${start.attemptId}/proof`)
      .send({
        bindingSecret: start.bindingSecret,
        state: start.state,
        idToken: await googleJwt(start.nonce),
      });
    expect(pending.body.outcome).toBe("confirm");
    const signed = (
      await request(app)
        .post(`/api/auth/native/attempts/${start.attemptId}/confirm`)
        .send({ bindingSecret: start.bindingSecret })
    ).body;
    const begin = await request(app)
      .post("/api/auth/native/attempts")
      .auth(signed.token, { type: "bearer" })
      .send({ purpose: "link", provider: "apple" });
    expect(begin.status).toBe(200);
    const b = begin.body;
    expect(b.stage).toBe("reauth");
    expect(b.provider).toBe("google");
    const target = (
      await request(app)
        .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
        .send({
          bindingSecret: b.bindingSecret,
          state: b.state,
          idToken: await googleJwt(b.nonce),
        })
    ).body;
    expect(target.stage).toBe("target");
    expect(target.nonce).not.toBe(b.nonce);
    const token = await jwt(target.nonce, "native.app");
    codes.set("target", token);
    const ready = await request(app)
      .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
      .send({
        bindingSecret: b.bindingSecret,
        state: target.state,
        idToken: token,
        authorizationCode: "target",
        name: "Added Provider",
      });
    expect(ready.body.outcome).toBe("link_ready");
    const finalized = await request(app)
      .post(`/api/auth/native/attempts/${b.attemptId}/finalize`)
      .auth(signed.token, { type: "bearer" })
      .send({ bindingSecret: b.bindingSecret });
    expect(finalized.body).toStrictEqual({ outcome: "linked" });
    const methods = await request(app)
      .get("/api/auth/methods")
      .auth(signed.token, { type: "bearer" });
    expect(methods.body).toStrictEqual({ apple: true, google: true });
    const me = await request(app)
      .get("/api/me")
      .auth(signed.token, { type: "bearer" });
    expect(me.body.user).toStrictEqual(signed.user);
  });
  it.each([
    {},
    { purpose: "wrong", provider: "apple" },
    { purpose: "signin", provider: "other" },
  ])("rejects malformed begin without minting %#", async (body) => {
    const res = await request(app).post("/api/auth/native/attempts").send(body);
    expect(res.status).toBe(400);
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
  });
  it("wrong state leaves operation intact, native cancellation erases it, replay expires", async () => {
    const b = (
      await request(app)
        .post("/api/auth/native/attempts")
        .send({ purpose: "signin", provider: "apple" })
    ).body;
    const wrong = await request(app)
      .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
      .send({
        bindingSecret: b.bindingSecret,
        state: "wrong",
        idToken: "token",
        authorizationCode: "code",
      });
    expect(wrong.status).toBe(401);
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(1);
    const cancelled = await request(app)
      .post(`/api/auth/native/attempts/${b.attemptId}/cancel`)
      .send({ bindingSecret: b.bindingSecret });
    expect(cancelled.status).toBe(204);
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
    const replay = await request(app)
      .post(`/api/auth/native/attempts/${b.attemptId}/confirm`)
      .send({ bindingSecret: b.bindingSecret });
    expect(replay.status).toBe(410);
  });
  it("web two-proof callback only stages until current-session same-origin finalize", async () => {
    const start = await request(app)
      .post("/api/auth/web/attempts")
      .set("Origin", "https://erg.test")
      .send({ purpose: "signin", provider: "google" });
    const s = start.body;
    const startCookie = start.headers["set-cookie"][0].split(";")[0];
    codes.set(
      "google-web",
      await googleJwt(s.nonce, "google-web", "google.web"),
    );
    const callback = await request(app)
      .get("/api/auth/google/callback")
      .query({ state: s.state, code: "google-web" })
      .set("Cookie", startCookie);
    expect(callback.headers.location).toBe(`/?authAttempt=${s.attemptId}`);
    const signed = await request(app)
      .post(`/api/auth/web/attempts/${s.attemptId}/confirm`)
      .set("Origin", "https://erg.test")
      .set("Cookie", startCookie)
      .send({});
    const sessionCookie = (signed.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("erg_session="))!
      .split(";")[0];
    const begun = await request(app)
      .post("/api/auth/web/attempts")
      .set("Origin", "https://erg.test")
      .set("Cookie", sessionCookie)
      .send({ purpose: "link", provider: "apple" });
    expect(begun.status).toBe(200);
    const b = begun.body;
    const binding = begun.headers["set-cookie"][0].split(";")[0];
    codes.set(
      "reauth-google",
      await googleJwt(b.nonce, "google-web", "google.web"),
    );
    const reauth = await request(app)
      .get("/api/auth/google/callback")
      .set("Cookie", binding)
      .query({ state: b.state, code: "reauth-google" });
    expect(reauth.headers.location).toBe(`/?authAttempt=${b.attemptId}`);
    const resumed = await request(app)
      .get(`/api/auth/web/attempts/${b.attemptId}`)
      .set("Cookie", binding);
    expect(resumed.body.stage).toBe("target");
    const target = resumed.body;
    const token = await jwt(target.nonce, "web.app");
    codes.set("target-web", token);
    const apple = await request(app)
      .post("/api/auth/apple/callback")
      .set("Origin", "https://appleid.apple.com")
      .set("Cookie", binding)
      .type("form")
      .send({ state: target.state, code: "target-web", id_token: token });
    expect(apple.headers.location).toBe(`/?authAttempt=${b.attemptId}`);
    expect(
      (await pool.query("SELECT apple_sub FROM users")).rows,
    ).toStrictEqual([{ apple_sub: null }]);
    const ready = await request(app)
      .get(`/api/auth/web/attempts/${b.attemptId}`)
      .set("Cookie", binding);
    expect(ready.body.outcome).toBe("link_ready");
    const current = (
      await request(app).post("/api/auth/native").send({ idToken: "other" })
    ).body.token;
    const changed = await request(app)
      .post(`/api/auth/web/attempts/${b.attemptId}/finalize`)
      .set("Origin", "https://erg.test")
      .set("Cookie", binding)
      .auth(current, { type: "bearer" })
      .send({});
    expect(changed.status).toBe(409);
    expect(changed.body.error).toBe("account_changed");
    const complete = await request(app)
      .post(`/api/auth/web/attempts/${b.attemptId}/finalize`)
      .set("Origin", "https://erg.test")
      .set("Cookie", [binding, sessionCookie])
      .send({});
    expect(complete.body).toStrictEqual({ outcome: "linked" });
  });
});
