import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import type { Response as ExpressResponse } from "express";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type pg from "pg";
import { createDb } from "../db/index.js";
import { startPostgres } from "../testing/postgres.js";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { createSessionStore } from "./sessions.js";
import { createAccessPolicy, type AccessPolicy } from "./accessPolicy.js";
import { createUserStore } from "./users.js";
import { createAttempts } from "./attempts.js";
import { createProviders } from "./providers.js";
import { createFrontDoorRoutes } from "./frontDoorRoutes.js";

describe("supported auth producers through Express and signed tokens", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let freshApp: (
    policy?: AccessPolicy,
  ) => Promise<ReturnType<typeof createApp>>;
  let rsa: Awaited<ReturnType<typeof generateKeyPair>>;
  let attempts: ReturnType<typeof createAttempts>;
  let providers: ReturnType<typeof createProviders>;
  const codes = new Map<string, string>();
  function signal() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }
  let exchangeOutsideLock = false;
  beforeAll(async () => {
    container = await startPostgres();
    const c = createDb(container.getConnectionUri());
    pool = c.pool;
    await migrate(c.db, { migrationsFolder: "drizzle" });
    const accessPolicy = createAccessPolicy("public", "");
    const users = createUserStore(c.db);
    rsa = await generateKeyPair("RS256");
    const ec = await generateKeyPair("ES256");
    const keys = createLocalJWKSet({
      keys: [
        { ...(await exportJWK(rsa.publicKey)), kid: "test", alg: "RS256" },
      ],
    });
    providers = createProviders(
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
    freshApp = async (policy = accessPolicy) => {
      const sessions = createSessionStore(c.db, policy);
      attempts = createAttempts(pool, policy);
      await attempts.sweep();
      const routes = createFrontDoorRoutes({
        attempts,
        providers,
        sessions,
        siteUrl: "https://erg.test",
      });
      return createApp(
        baseDeps({
          siteUrl: "https://erg.test",
          sessions,
          users,
          frontDoor: { ...routes, attempts, providers, close: () => {} },
          oauth: {
            authorizationUrl: async () => ({
              url: "https://accounts.google.com/authorize",
              cookiePayload: "legacy-state",
            }),
            callbackClaims: async () => {
              throw new Error("No legacy callback in this fixture");
            },
          },
          // Token-driven so the unverified-email arm runs through the REAL
          // producer (`login` -> `attempts.legacyGoogle`) rather than a stub
          // standing in for it.
          nativeVerifier: async (idToken: string) => ({
            sub: "legacy",
            email: "outside@allowlist.test",
            emailVerified: idToken !== "legacy-proof-unverified",
            name: "Legacy",
          }),
        }),
      );
    };
  });
  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await pool.query("TRUNCATE users,auth_attempts CASCADE");
    codes.clear();
    exchangeOutsideLock = false;
    app = await freshApp();
  });
  it.each(["new", "legacy-native", "legacy-web"])(
    "anonymous start request 121 is rejected after 120 shared admissions (%s)",
    async (first) => {
      // Independent spec literals: never derive these bounds from the limiter.
      const initial =
        first === "legacy-native"
          ? await request(app)
              .post("/api/auth/native")
              .send({ idToken: "legacy-proof" })
          : first === "legacy-web"
            ? await request(app).get("/api/auth/signin")
            : await request(app)
                .post("/api/auth/native/attempts")
                .send({ purpose: "signin", provider: "apple" });
      expect(initial.status, "request 1").toBe(
        first === "legacy-web" ? 302 : 200,
      );
      for (let ordinal = 2; ordinal <= 120; ordinal++) {
        const surface = ordinal % 2 === 0 ? "native" : "web";
        const admitted = await request(app)
          .post(`/api/auth/${surface}/attempts`)
          .send({ purpose: "signin", provider: "apple" });
        expect(admitted.status, `request ${ordinal}`).toBe(200);
        expect(admitted.body.outcome).toBe("authorize");
      }
      const resident = first === "new" ? 120 : 119;
      expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
        resident,
      );
      const denied = await request(app)
        .post("/api/auth/native/attempts")
        .send({ purpose: "signin", provider: "apple" });
      expect(denied.status, "request 121").toBe(429);
      expect(denied.body).toStrictEqual({ error: "rate_limited" });
      const web = await request(app)
        .post("/api/auth/web/attempts")
        .send({ purpose: "signin", provider: "apple" });
      const legacyNative = await request(app)
        .post("/api/auth/native")
        .send({ idToken: "legacy-proof" });
      const legacyWeb = await request(app).get("/api/auth/signin");
      for (const response of [web, legacyNative, legacyWeb]) {
        expect(response.status).toBe(429);
        expect(response.body).toStrictEqual({ error: "rate_limited" });
      }
      expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
        resident,
      );
      expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(
        first === "legacy-native" ? 1 : 0,
      );
      expect(exchangeOutsideLock).toBe(false);
    },
  );
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
  it("returns an existing account's saved email with native access denial", async () => {
    await pool.query(
      "INSERT INTO users (apple_sub,email,name) VALUES ($1,$2,$3)",
      ["saved-apple", "saved@example.test", "Saved Rower"],
    );
    app = await freshApp(
      createAccessPolicy("restricted", "someone-else@example.test"),
    );
    const begin = await request(app)
      .post("/api/auth/native/attempts")
      .send({ purpose: "signin", provider: "apple" });
    const token = await jwt(begin.body.nonce, "native.app", "saved-apple");
    codes.set("saved-denied", token);

    const proof = await request(app)
      .post(`/api/auth/native/attempts/${begin.body.attemptId}/proof`)
      .send({
        bindingSecret: begin.body.bindingSecret,
        state: begin.body.state,
        idToken: token,
        authorizationCode: "saved-denied",
      });

    expect(proof.status).toBe(403);
    expect(proof.body).toStrictEqual({
      error: "access_denied",
      email: "saved@example.test",
    });
    expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
  });
  it("returns a verified Apple relay email with web access denial", async () => {
    app = await freshApp(
      createAccessPolicy("restricted", "someone-else@example.test"),
    );
    const begin = await request(app)
      .post("/api/auth/web/attempts")
      .send({ purpose: "signin", provider: "apple" });
    const cookie = begin.headers["set-cookie"][0].split(";")[0];
    const token = await jwt(begin.body.nonce, "web.app", "new-relay");
    codes.set("relay-denied", token);

    const callback = await request(app)
      .post("/api/auth/apple/callback")
      .set("Cookie", cookie)
      .type("form")
      .send({
        state: begin.body.state,
        code: "relay-denied",
        id_token: token,
      });

    expect(callback.status).toBe(303);
    const location = new URL(callback.headers.location, "https://erg.test");
    expect(location.searchParams.get("authError")).toBe("access_denied");
    expect(location.searchParams.get("authEmail")).toBe(
      "relay@privaterelay.appleid.com",
    );
    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
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
  it("legacy native Google denies an unverified email the same way with the front door on", async () => {
    // `signin.ts` states the shared gate sequence "email_verified -> existing-sub
    // -> policy -> ..." and answers 403 {outcome:"denied", email}. With the front
    // door configured the same claims route through `attempts.legacyGoogle`
    // instead, so the denial must survive that swap: an env var must not turn a
    // client-class refusal into a 500 (RF34 — an invariant applied to one of the
    // two paths it governs).
    const response = await request(app)
      .post("/api/auth/native")
      .send({ idToken: "legacy-proof-unverified" });
    expect(response.status).toBe(403);
    expect(response.body).toStrictEqual({
      error: "denied",
      email: "outside@allowlist.test",
    });
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
  it.each([
    { state: "" },
    { idToken: "" },
    { authorizationCode: "" },
    { authorizationCode: undefined },
    { name: "x".repeat(201) },
  ])(
    "native malformed proof changes no account or attempt %#",
    async (override) => {
      const b = (
        await request(app)
          .post("/api/auth/native/attempts")
          .send({ purpose: "signin", provider: "apple" })
      ).body;
      const res = await request(app)
        .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
        .send({
          bindingSecret: b.bindingSecret,
          state: b.state,
          idToken: "token",
          authorizationCode: "code",
          ...override,
        });
      expect(res.status).toBe(400);
      expect(
        (await pool.query("SELECT stage FROM auth_attempts")).rows,
      ).toStrictEqual([{ stage: "authorize" }]);
      expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
    },
  );
  it("native owned failed exchange erases its claimed snapshot", async () => {
    const begin = await request(app)
      .post("/api/auth/native/attempts")
      .send({ purpose: "signin", provider: "apple" });
    const b = begin.body;
    const failed = await request(app)
      .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
      .send({
        bindingSecret: b.bindingSecret,
        state: b.state,
        idToken: "invalid",
        authorizationCode: "code",
      });
    expect(failed.status).toBe(401);
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
  });
  it("failed cleanup preserves the live attempt cookie", async () => {
    const begin = await request(app)
      .post("/api/auth/web/attempts")
      .send({ purpose: "signin", provider: "apple" });
    const b = begin.body;
    const binding = begin.headers["set-cookie"][0].split(";")[0];
    vi.spyOn(attempts, "discard").mockRejectedValue(
      new Error("database unavailable"),
    );
    const failed = await request(app)
      .post("/api/auth/apple/callback")
      .set("Cookie", binding)
      .type("form")
      .send({ state: b.state, error: "access_denied" });
    expect(failed.status).toBe(303);
    expect(failed.headers["set-cookie"]).toBeUndefined();
    expect(
      (await pool.query("SELECT stage FROM auth_attempts")).rows,
    ).toStrictEqual([{ stage: "authorize" }]);
  });
  it("finalize can commit identity and grant before its HTTP response is lost", async () => {
    const google = {
      sub: "legacy",
      email: "original@test",
      emailVerified: true,
      name: "Original",
    };
    const signed = await attempts.legacyGoogle(google);
    const sessionId = (await pool.query("SELECT id FROM sessions")).rows[0]
      .id as string;
    const b = await attempts.begin({
      surface: "native",
      purpose: "link",
      targetProvider: "apple",
      originalSessionId: sessionId,
    });
    const target = await attempts.accept(
      await attempts.claim(b.attempt),
      google,
    );
    await attempts.accept(await attempts.claim(target.attempt!), {
      sub: "added-apple",
      email: "relay@test",
      emailVerified: true,
      name: "Added",
      grant: { clientId: "native.app", refreshToken: "retained-grant" },
    });
    // Suppress delivery only after the real route has awaited its real commit.
    const json = app.response.json;
    const delivery = vi
      .spyOn(app.response, "json")
      .mockImplementation(function (this: ExpressResponse, body: unknown) {
        if ((body as { outcome?: string }).outcome === "linked") {
          this.destroy();
          return this;
        }
        return json.call(this, body);
      });
    const failure = await request(app)
      .post(`/api/auth/native/attempts/${b.attempt.id}/finalize`)
      .auth(signed.token!, { type: "bearer" })
      .send({ bindingSecret: b.bindingSecret })
      .then(
        () => null,
        (error: unknown) => error,
      );
    delivery.mockRestore();
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/socket hang up|aborted/);
    const methods = await request(app)
      .get("/api/auth/methods")
      .auth(signed.token!, { type: "bearer" });
    expect(methods.body).toStrictEqual({ apple: true, google: true });
    expect(
      (await pool.query("SELECT refresh_token FROM apple_grants")).rows,
    ).toStrictEqual([{ refresh_token: "retained-grant" }]);
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
  });
  it.each([
    ["signin", "success"],
    ["signin", "cancel"],
    ["signin", "provider-error"],
    ["signin", "malformed"],
    ["link", "success"],
    ["link", "cancel"],
    ["link", "provider-error"],
    ["link", "malformed"],
  ] as const)(
    "stale %s callback (%s) cannot erase the winning stage or clear its cookie",
    async (purpose, loserKind) => {
      let sessionToken = "";
      if (purpose === "link") {
        const start = (
          await request(app)
            .post("/api/auth/native/attempts")
            .send({ purpose: "signin", provider: "apple" })
        ).body;
        const token = await jwt(start.nonce, "native.app");
        codes.set("setup", token);
        await request(app)
          .post(`/api/auth/native/attempts/${start.attemptId}/proof`)
          .send({
            bindingSecret: start.bindingSecret,
            state: start.state,
            idToken: token,
            authorizationCode: "setup",
          });
        sessionToken = (
          await request(app)
            .post(`/api/auth/native/attempts/${start.attemptId}/confirm`)
            .send({ bindingSecret: start.bindingSecret })
        ).body.token;
      }
      const beginRequest = request(app)
        .post("/api/auth/web/attempts")
        .send({ purpose, provider: purpose === "signin" ? "apple" : "google" });
      if (sessionToken)
        beginRequest.set("Cookie", `erg_session=${sessionToken}`);
      const begin = await beginRequest;
      expect(begin.status).toBe(200);
      const b = begin.body;
      const binding = begin.headers["set-cookie"][0].split(";")[0];
      const token = await jwt(b.nonce, "web.app");
      codes.set("winner", token);
      const valid = { state: b.state, code: "winner", id_token: token };
      const loserBody =
        loserKind === "cancel"
          ? { state: b.state, error: "access_denied" }
          : loserKind === "provider-error"
            ? { state: b.state, error: "provider_failed" }
            : loserKind === "malformed"
              ? { ...valid, code: "" }
              : valid;
      const firstRead = signal();
      const bothRead = signal();
      const releaseLoser = signal();
      const read = attempts.read.bind(attempts);
      let reads = 0;
      const heldRead = vi
        .spyOn(attempts, "read")
        .mockImplementation(async (...args) => {
          const snapshot = await read(...args);
          reads++;
          if (reads === 1) {
            firstRead.resolve();
            await bothRead.promise;
          } else if (reads === 2) {
            bothRead.resolve();
            await releaseLoser.promise;
          }
          return snapshot;
        });
      const post = (body: typeof loserBody) =>
        request(app)
          .post("/api/auth/apple/callback")
          .set("Origin", "https://appleid.apple.com")
          .set("Cookie", binding)
          .type("form")
          .send(body)
          .then((response) => response);
      const winner = post(valid);
      await firstRead.promise;
      const loser = post(loserBody);
      const won = await winner;
      const snapshot = (
        await pool.query(
          "SELECT stage,version,apple_refresh_token IS NOT NULL AS grant FROM auth_attempts",
        )
      ).rows;
      releaseLoser.resolve();
      const lost = await loser;
      heldRead.mockRestore();
      expect(won.headers.location).toBe(`/?authAttempt=${b.attemptId}`);
      expect(snapshot).toStrictEqual([
        {
          stage: purpose === "signin" ? "confirm" : "target_authorize",
          version: 3,
          grant: true,
        },
      ]);
      expect(
        (
          await pool.query(
            "SELECT stage,version,apple_refresh_token IS NOT NULL AS grant FROM auth_attempts",
          )
        ).rows,
      ).toStrictEqual(snapshot);
      expect(lost.headers["set-cookie"]).toBeUndefined();
      expect(lost.headers.location).toContain("authError=");
      const resume = await request(app)
        .get(`/api/auth/web/attempts/${b.attemptId}`)
        .set("Cookie", binding);
      expect(resume.status).toBe(200);
      if (purpose === "signin") {
        const confirmed = await request(app)
          .post(`/api/auth/web/attempts/${b.attemptId}/confirm`)
          .set("Cookie", binding)
          .set("Origin", "https://erg.test")
          .send({});
        sessionToken = (confirmed.headers["set-cookie"] as unknown as string[])
          .find((value) => value.startsWith("erg_session="))!
          .split(";")[0]
          .split("=")[1];
      } else {
        codes.set(
          "target",
          await googleJwt(resume.body.nonce, "added-google", "google.web"),
        );
        await request(app)
          .get("/api/auth/google/callback")
          .set("Cookie", binding)
          .query({ state: resume.body.state, code: "target" });
        await request(app)
          .post(`/api/auth/web/attempts/${b.attemptId}/finalize`)
          .set("Cookie", binding)
          .set("Origin", "https://erg.test")
          .auth(sessionToken, { type: "bearer" })
          .send({});
      }
      const methods = await request(app)
        .get("/api/auth/methods")
        .auth(sessionToken, { type: "bearer" });
      expect(methods.status).toBe(200);
      expect(methods.body).toStrictEqual({
        apple: true,
        google: purpose === "link",
      });
      expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
        0,
      );
    },
  );
  it.each(["cancel", "provider-error", "malformed", "exchange"])(
    "owned callback %s erases only its failed operation and cookie",
    async (kind) => {
      const begin = await request(app)
        .post("/api/auth/web/attempts")
        .send({ purpose: "signin", provider: "apple" });
      const b = begin.body;
      const binding = begin.headers["set-cookie"][0].split(";")[0];
      const body =
        kind === "cancel"
          ? { state: b.state, error: "access_denied" }
          : kind === "provider-error"
            ? { state: b.state, error: "provider_failed" }
            : {
                state: b.state,
                code: kind === "malformed" ? "" : "code",
                id_token: "invalid",
              };
      const failed = await request(app)
        .post("/api/auth/apple/callback")
        .set("Cookie", binding)
        .type("form")
        .send(body);
      expect(failed.status).toBe(303);
      expect(failed.headers["set-cookie"][0]).toContain("Max-Age=0");
      expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
        0,
      );
      expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(0);
    },
  );
  it("a rejected LINK callback reports its own purpose and target, not signin", async () => {
    // The redirect's authPurpose is what routes the rower to a surface that can
    // show the failure. A signed-in rower never renders a signin-purpose error
    // (`SignInMethods` returns null unless purpose === "link"), so reporting a
    // link failure as signin bounces them silently to Today and makes the whole
    // recovery path — the notice, the methods refetch, "Start linking again" —
    // unreachable.
    const start = await request(app)
      .post("/api/auth/web/attempts")
      .set("Origin", "https://erg.test")
      .send({ purpose: "signin", provider: "google" });
    const s = start.body;
    const startCookie = start.headers["set-cookie"][0].split(";")[0];
    codes.set(
      "google-link-purpose",
      await googleJwt(s.nonce, "google-link-purpose", "google.web"),
    );
    await request(app)
      .get("/api/auth/google/callback")
      .query({ state: s.state, code: "google-link-purpose" })
      .set("Cookie", startCookie);
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
    const binding = begun.headers["set-cookie"][0].split(";")[0];

    // A wrong state on a live LINK attempt: rejected at the state check, which
    // sits above the line that reads the attempt's real purpose.
    const rejected = await request(app)
      .get("/api/auth/google/callback")
      .set("Cookie", binding)
      .query({ state: "not-the-state", code: "google-link-purpose" });
    expect(rejected.headers.location).toContain("authError=invalid_proof");
    expect(rejected.headers.location).toContain("authPurpose=link");
    expect(rejected.headers.location).toContain("authProvider=apple");
  });
  it("wrong callback provider cannot consume valid operation; old callback cannot cancel confirmation", async () => {
    const begin = await request(app)
      .post("/api/auth/web/attempts")
      .send({ purpose: "signin", provider: "apple" });
    const b = begin.body;
    const cookie = begin.headers["set-cookie"][0].split(";")[0];
    const wrong = await request(app)
      .get("/api/auth/google/callback")
      .set("Cookie", cookie)
      .query({ state: b.state, error: "access_denied" });
    expect(wrong.headers.location).toContain("authError=invalid_proof");
    expect(
      (await pool.query("SELECT stage FROM auth_attempts")).rows,
    ).toStrictEqual([{ stage: "authorize" }]);
    const token = await jwt(b.nonce, "web.app");
    codes.set("confirm", token);
    await request(app)
      .post("/api/auth/apple/callback")
      .set("Cookie", cookie)
      .type("form")
      .send({ state: b.state, code: "confirm", id_token: token });
    const stale = await request(app)
      .post("/api/auth/apple/callback")
      .set("Cookie", cookie)
      .type("form")
      .send({ state: b.state, error: "user_cancelled_authorize" });
    expect(stale.headers.location).toContain("authError=attempt_expired");
    expect(
      (await pool.query("SELECT stage FROM auth_attempts")).rows,
    ).toStrictEqual([{ stage: "confirm" }]);
  });
});
