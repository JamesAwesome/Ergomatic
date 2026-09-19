import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { generateKeyPair } from "jose";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { createDb } from "../db/index.js";
import { startPostgres } from "../testing/postgres.js";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { recordingRevoke } from "../testing/fakes.js";
import { createAttempts, type Attempts } from "./attempts.js";
import type { RevokeApple } from "./appleRevoke.js";
import { createFrontDoor } from "./frontDoor.js";
import { createSessionStore, noRevoke } from "./sessions.js";
import { createUserStore } from "./users.js";
import { createAccessPolicy } from "./accessPolicy.js";
import type { ProviderConfig } from "./providers.js";

describe("unlinking a sign-in method against Postgres and through the mounted router", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let attempts: Attempts;
  let sessions: ReturnType<typeof createSessionStore>;
  let close: () => void;

  beforeAll(async () => {
    container = await startPostgres();
    const c = createDb(container.getConnectionUri());
    pool = c.pool;
    await migrate(c.db, { migrationsFolder: "drizzle" });
    const accessPolicy = createAccessPolicy("public", "");
    sessions = createSessionStore(c.db, accessPolicy, noRevoke);
    const users = createUserStore(c.db);
    const ec = await generateKeyPair("ES256");
    const config: ProviderConfig = {
      siteUrl: "https://erg.test",
      apple: {
        nativeClientId: "native.app",
        webClientId: "web.app",
        teamId: "TEAM",
        keyId: "KEY",
        key: ec.privateKey,
      },
      google: { nativeClientId: "", webClientId: "", clientSecret: "" },
    };
    // The REAL front door, wired exactly as production wires it — proves the
    // whole seam Task 2's brief Step 5 asks for: `createAppleRevoke(config)`
    // reaches `createAttempts` and `createAccountRoutes` reaches the ONE
    // router `app.ts` mounts, not a hand-assembled stand-in for either.
    const frontDoor = await createFrontDoor(
      pool,
      sessions,
      config,
      accessPolicy,
    );
    attempts = frontDoor.attempts;
    close = frontDoor.close;
    app = createApp(
      baseDeps({
        frontDoor,
        sessions,
        users,
        accessPolicy,
        siteUrl: config.siteUrl,
      }),
    );
  });
  afterAll(async () => {
    close?.();
    await pool?.end();
    await container?.stop();
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE users,auth_attempts,sessions,apple_grants CASCADE",
    );
  });

  async function seedUser(input: {
    googleSub: string | null;
    appleSub: string | null;
  }): Promise<{ id: string }> {
    const row = (
      await pool.query<{ id: string }>(
        "INSERT INTO users(google_sub,apple_sub,email,name) VALUES($1,$2,$3,'Rower') RETURNING id",
        [
          input.googleSub,
          input.appleSub,
          `${input.googleSub ?? input.appleSub}@test`,
        ],
      )
    ).rows[0]!;
    return row;
  }
  function makeAttempts(revoke: RevokeApple) {
    return createAttempts(pool, createAccessPolicy("public", ""), revoke);
  }
  async function signedInAgent(input: {
    googleSub: string | null;
    appleSub: string | null;
  }) {
    const user = await seedUser(input);
    const { token } = await sessions.createSession(user.id);
    const method = (verb: "get" | "delete" | "post") => (path: string) =>
      request(app)[verb](path).auth(token, { type: "bearer" });
    return {
      user,
      agent: {
        get: method("get"),
        delete: method("delete"),
        post: method("post"),
      },
    };
  }

  it("removes a provider from a two-provider account", async () => {
    const user = await seedUser({ googleSub: "g-1", appleSub: "a-1" });
    const result = await attempts.unlink(user.id, "apple");
    expect(result.outcome).toBe("unlinked");
    const row = await pool.query<{
      apple_sub: string | null;
      google_sub: string | null;
    }>("SELECT apple_sub,google_sub FROM users WHERE id=$1", [user.id]);
    expect(row.rows[0]!.apple_sub).toBeNull();
    expect(row.rows[0]!.google_sub).toBe("g-1");
  });

  it("refuses to remove the last provider, and leaves the subject intact", async () => {
    const user = await seedUser({ googleSub: null, appleSub: "a-2" });
    await expect(attempts.unlink(user.id, "apple")).resolves.toStrictEqual({
      outcome: "last_provider",
    });
    const row = await pool.query<{ apple_sub: string | null }>(
      "SELECT apple_sub FROM users WHERE id=$1",
      [user.id],
    );
    expect(row.rows[0]!.apple_sub).toBe("a-2");
  });

  it("distinguishes a provider that was never connected", async () => {
    const user = await seedUser({ googleSub: "g-3", appleSub: null });
    await expect(attempts.unlink(user.id, "apple")).resolves.toStrictEqual({
      outcome: "not_connected",
    });
  });

  it("distinguishes an account deleted in another tab", async () => {
    const user = await seedUser({ googleSub: "g-4", appleSub: "a-4" });
    await pool.query("DELETE FROM users WHERE id=$1", [user.id]);
    await expect(attempts.unlink(user.id, "apple")).resolves.toStrictEqual({
      outcome: "account_gone",
    });
  });

  it("revokes BOTH grants when a phone-and-web rower removes Apple", async () => {
    const { revoke, seen } = recordingRevoke(true);
    const store = makeAttempts(revoke);
    const user = await seedUser({ googleSub: "g-5", appleSub: "a-5" });
    await pool.query(
      `INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES
        ($1,'haus.waffle.ergomatic','rt-native'),
        ($1,'haus.waffle.ergomatic.web.staging','rt-web')`,
      [user.id],
    );
    const result = await store.unlink(user.id, "apple");
    expect(seen.map((g) => g.refreshToken).sort()).toStrictEqual([
      "rt-native",
      "rt-web",
    ]);
    expect(result).toStrictEqual({ outcome: "unlinked", appleRevoked: true });
    expect(
      (
        await pool.query("SELECT 1 FROM apple_grants WHERE user_id=$1", [
          user.id,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("still removes the method when Apple cannot be reached, and says so", async () => {
    const { revoke } = recordingRevoke(false);
    const store = makeAttempts(revoke);
    const user = await seedUser({ googleSub: "g-6", appleSub: "a-6" });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')",
      [user.id],
    );
    const result = await store.unlink(user.id, "apple");
    expect(result).toStrictEqual({ outcome: "unlinked", appleRevoked: false });
    const row = await pool.query<{ apple_sub: string | null }>(
      "SELECT apple_sub FROM users WHERE id=$1",
      [user.id],
    );
    expect(
      row.rows[0]!.apple_sub,
      "a failed revoke never undoes the unlink",
    ).toBeNull();
  });

  it("still removes the method when the injected revoker THROWS, not just resolves false", async () => {
    // The type says `Promise<boolean>`, which cannot forbid a rejection —
    // any injected revoker can reject (finding N3), and the unlink already
    // committed by the time this runs.
    const store = makeAttempts(async () => {
      throw new Error("boom");
    });
    const user = await seedUser({ googleSub: "g-9", appleSub: "a-9" });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')",
      [user.id],
    );
    const result = await store.unlink(user.id, "apple");
    expect(result).toStrictEqual({ outcome: "unlinked", appleRevoked: false });
    const row = await pool.query<{ apple_sub: string | null }>(
      "SELECT apple_sub FROM users WHERE id=$1",
      [user.id],
    );
    expect(
      row.rows[0]!.apple_sub,
      "a throwing revoke never undoes the unlink either",
    ).toBeNull();
  });

  it("removes google without touching Apple grants or calling revoke with any", async () => {
    const { revoke, seen } = recordingRevoke(true);
    const store = makeAttempts(revoke);
    const user = await seedUser({ googleSub: "g-10", appleSub: "a-10" });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')",
      [user.id],
    );
    const result = await store.unlink(user.id, "google");
    expect(result).toStrictEqual({ outcome: "unlinked", appleRevoked: true });
    expect(seen).toStrictEqual([]);
    const row = await pool.query<{
      google_sub: string | null;
      apple_sub: string | null;
    }>("SELECT google_sub,apple_sub FROM users WHERE id=$1", [user.id]);
    expect(row.rows[0]).toStrictEqual({ google_sub: null, apple_sub: "a-10" });
    expect(
      (
        await pool.query("SELECT 1 FROM apple_grants WHERE user_id=$1", [
          user.id,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it("never calls Apple while the transaction is still open", async () => {
    // The external call must happen AFTER the commit. If it runs inside, a
    // slow Apple holds a row lock, and a revoke that succeeds before a
    // commit that fails destroys a credential for an account that still
    // exists.
    let trackedUserId = "";
    let openDuringCall = true;
    const store = makeAttempts(async () => {
      // A SEPARATE connection (this test's own `pool`, not the transaction's
      // client) sees the committed NULL only if the transaction already
      // ended — that is the whole check.
      const row = await pool.query<{ apple_sub: string | null }>(
        "SELECT apple_sub FROM users WHERE id=$1",
        [trackedUserId],
      );
      openDuringCall = row.rows[0]?.apple_sub !== null;
      return true;
    });
    const user = await seedUser({ googleSub: "g-7", appleSub: "a-7" });
    trackedUserId = user.id;
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')",
      [user.id],
    );
    await store.unlink(user.id, "apple");
    expect(openDuringCall, "the revoke ran before the commit").toBe(false);
  });

  it("holds the guard against a concurrent unlink of the other provider", async () => {
    // A held-lock test, not a race (docs/TESTING.md; RF21). Verify the pool
    // has >= 2 connections first, or this hangs instead of failing.
    expect(
      pool.options.max,
      "this test needs a second connection",
    ).toBeGreaterThanOrEqual(2);
    const user = await seedUser({ googleSub: "g-8", appleSub: "a-8" });
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("UPDATE users SET google_sub=NULL WHERE id=$1", [
        user.id,
      ]);
      const pending = attempts.unlink(user.id, "apple");
      await holder.query("COMMIT");
      await expect(pending).resolves.toStrictEqual({
        outcome: "last_provider",
      });
    } finally {
      holder.release();
    }
  });

  it("removes a method over HTTP, through the mounted router", async () => {
    const { agent } = await signedInAgent({
      googleSub: "g-11",
      appleSub: "a-11",
    });
    const response = await agent.delete("/api/auth/methods/apple");
    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      outcome: "unlinked",
      appleRevoked: true,
    });
  });

  it("refuses an unauthenticated remove", async () => {
    const response = await request(app).delete("/api/auth/methods/apple");
    expect(response.status).toBe(401);
  });

  it("refuses an unknown provider on the route", async () => {
    const { agent } = await signedInAgent({
      googleSub: "g-12",
      appleSub: "a-12",
    });
    const response = await agent.delete("/api/auth/methods/facebook");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_request");
  });
});
