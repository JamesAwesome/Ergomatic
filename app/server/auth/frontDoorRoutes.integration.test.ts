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
    await pool.query("TRUNCATE users CASCADE");
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
});
