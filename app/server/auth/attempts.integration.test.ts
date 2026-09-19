import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { createDb } from "../db/index.js";
import { startPostgres } from "../testing/postgres.js";
import { createAttempts } from "./attempts.js";
import { createSessionStore, hashToken, noRevoke } from "./sessions.js";
import { createUserStore } from "./users.js";
import { createAccessPolicy } from "./accessPolicy.js";
import { recordingRevoke } from "../testing/fakes.js";
import type { RevokeApple } from "./appleRevoke.js";
import type { AuthProvider } from "../../shared/auth.js";

describe("front-door transactions against Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: ReturnType<typeof createDb>["db"];
  let store: ReturnType<typeof createAttempts>;
  let sessions: ReturnType<typeof createSessionStore>;
  let users: ReturnType<typeof createUserStore>;
  beforeAll(async () => {
    container = await startPostgres();
    const c = createDb(container.getConnectionUri());
    pool = c.pool;
    db = c.db;
    await migrate(c.db, { migrationsFolder: "drizzle" });
    const publicAccess = createAccessPolicy("public", "");
    store = createAttempts(pool, publicAccess, recordingRevoke().revoke);
    sessions = createSessionStore(c.db, publicAccess, noRevoke);
    users = createUserStore(c.db);
    await store.sweep();
  });
  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE users,auth_attempts CASCADE");
  });
  const apple = {
    sub: "apple",
    email: "relay@privaterelay.appleid.com",
    emailVerified: true,
    name: "Rower",
    grant: { clientId: "native.app", refreshToken: "secret" },
  };
  async function signin() {
    return store.begin({
      surface: "native",
      purpose: "signin",
      targetProvider: "apple",
    });
  }
  it("does not create before confirm and atomically retains grant and session", async () => {
    const b = await signin();
    const claimed = await store.claim(b.attempt);
    const pending = await store.accept(claimed, apple);
    expect(pending.attempt?.stage).toBe("confirm");
    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
    const result = await store.confirm(
      await store.read(b.attempt.id, b.bindingSecret, "native"),
    );
    expect(result.signedIn?.user.email).toBe("relay@privaterelay.appleid.com");
    expect(
      (await pool.query("SELECT refresh_token FROM apple_grants")).rows,
    ).toStrictEqual([{ refresh_token: "secret" }]);
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
    expect(
      await sessions.resolveSession(result.signedIn!.token!),
    ).toMatchObject({ user: { id: result.signedIn!.user.id } });
  });
  it("claims once, binding failures do not consume, cancellation cannot resurrect", async () => {
    const b = await signin();
    await expect(store.read(b.attempt.id, "wrong", "native")).rejects.toThrow(
      "invalid_proof",
    );
    const claim = await store.claim(b.attempt);
    await expect(store.claim(b.attempt)).rejects.toThrow("attempt_expired");
    await store.cancel(b.attempt.id, b.bindingSecret, "native");
    await expect(store.accept(claim, apple)).rejects.toThrow("attempt_expired");
  });
  it("resolves returning subject before requiring email and never merges email", async () => {
    const b = await signin();
    await store.accept(await store.claim(b.attempt), apple);
    const first = await store.confirm(
      await store.read(b.attempt.id, b.bindingSecret, "native"),
    );
    const b2 = await signin();
    const returning = await store.accept(await store.claim(b2.attempt), {
      ...apple,
      email: "",
      emailVerified: false,
    });
    expect(returning.signedIn?.user.id).toBe(first.signedIn?.user.id);
    const b3 = await signin();
    await store.accept(await store.claim(b3.attempt), {
      ...apple,
      sub: "different",
    });
    const second = await store.confirm(
      await store.read(b3.attempt.id, b3.bindingSecret, "native"),
    );
    expect(second.signedIn?.user.id).not.toBe(first.signedIn?.user.id);
  });
  it.each(["apple", "google"] as const)(
    "applies restricted access to new and returning %s sign-ins using the saved email",
    async (provider) => {
      const restricted = createAttempts(
        pool,
        createAccessPolicy("restricted", "allowed@test"),
        recordingRevoke().revoke,
      );
      await restricted.sweep();
      const deniedNew = await restricted.begin({
        surface: "native",
        purpose: "signin",
        targetProvider: provider,
      });
      await expect(
        restricted.accept(await restricted.claim(deniedNew.attempt), {
          ...apple,
          sub: `new-${provider}`,
          email: "outside@test",
          grant:
            provider === "apple"
              ? { clientId: "native.app", refreshToken: "denied-secret" }
              : undefined,
        }),
      ).rejects.toThrow("access_denied");

      const column = provider === "apple" ? "apple_sub" : "google_sub";
      await pool.query(
        `INSERT INTO users(${column},email,name) VALUES($1,'saved@test','Saved')`,
        [`returning-${provider}`],
      );
      const deniedReturning = await restricted.begin({
        surface: "native",
        purpose: "signin",
        targetProvider: provider,
      });
      await expect(
        restricted.accept(await restricted.claim(deniedReturning.attempt), {
          ...apple,
          sub: `returning-${provider}`,
          email: "allowed@test",
          grant:
            provider === "apple"
              ? { clientId: "native.app", refreshToken: "denied-secret" }
              : undefined,
        }),
      ).rejects.toThrow("access_denied");
      expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(0);
      expect(
        (await pool.query("SELECT user_id FROM apple_grants")).rowCount,
      ).toBe(0);
    },
  );
  it("rechecks a pending signup under the current process policy", async () => {
    const b = await signin();
    await store.accept(await store.claim(b.attempt), apple);
    const restricted = createAttempts(
      pool,
      createAccessPolicy("restricted", "someone-else@test"),
      recordingRevoke().revoke,
    );
    await expect(
      restricted.confirm(
        await restricted.read(b.attempt.id, b.bindingSecret, "native"),
      ),
    ).rejects.toThrow("access_denied");
    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(0);
    expect(
      (await pool.query("SELECT user_id FROM apple_grants")).rowCount,
    ).toBe(0);
  });
  it("rejects unverified new identity without a user or grant", async () => {
    const b = await signin();
    await expect(
      store.accept(await store.claim(b.attempt), {
        ...apple,
        emailVerified: false,
      }),
    ).rejects.toThrow("email_required");
    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
  });
  async function link() {
    const user = await users.createUser({
      googleSub: "google",
      email: "original@test",
      name: "Original",
    });
    const credential = await sessions.createSession(user.id);
    const resolved = await sessions.resolveSession(credential.token);
    const b = await store.begin({
      surface: "native",
      purpose: "link",
      targetProvider: "apple",
      originalSessionId: resolved!.sessionId,
    });
    return { ...b, user, credential };
  }
  it("requires both proofs and exact current session; keeps existing profile", async () => {
    const b = await link();
    await expect(
      store.accept(await store.claim(b.attempt), {
        sub: "wrong",
        email: "",
        emailVerified: false,
        name: "Rower",
      }),
    ).rejects.toThrow("account_changed");
    const next = await store.begin({
      surface: "native",
      purpose: "link",
      targetProvider: "apple",
      originalSessionId: (await sessions.resolveSession(b.credential.token))!
        .sessionId,
    });
    const target = await store.accept(await store.claim(next.attempt), {
      sub: "google",
      email: "",
      emailVerified: false,
      name: "Rower",
    });
    expect(target.attempt!.state).not.toBe(next.attempt.state);
    expect(target.attempt!.stage).toBe("target_authorize");
    const ready = await store.accept(await store.claim(target.attempt!), apple);
    const other = await sessions.createSession(b.user.id);
    await expect(
      store.finalize(
        ready.attempt!,
        (await sessions.resolveSession(other.token))!.sessionId,
      ),
    ).rejects.toThrow("account_changed");
    expect(
      (await pool.query("SELECT apple_sub FROM users")).rows,
    ).toStrictEqual([{ apple_sub: null }]);
    const done = await store.finalize(
      ready.attempt!,
      (await sessions.resolveSession(b.credential.token))!.sessionId,
    );
    expect(done.linked).toBe(true);
    expect(
      (await pool.query("SELECT email,name,apple_sub FROM users")).rows,
    ).toStrictEqual([
      { email: "original@test", name: "Original", apple_sub: "apple" },
    ]);
  });
  it("links Google to Apple and retains existing-provider refresh grant", async () => {
    const b = await signin();
    await store.accept(await store.claim(b.attempt), apple);
    const signed = (
      await store.confirm(
        await store.read(b.attempt.id, b.bindingSecret, "native"),
      )
    ).signedIn!;
    const sid = (await sessions.resolveSession(signed.token!))!.sessionId;
    const start = await store.begin({
      surface: "native",
      purpose: "link",
      targetProvider: "google",
      originalSessionId: sid,
    });
    const target = (
      await store.accept(await store.claim(start.attempt), {
        ...apple,
        grant: { clientId: "web.app", refreshToken: "fresh-existing" },
      })
    ).attempt!;
    const ready = (
      await store.accept(await store.claim(target), {
        sub: "new-google",
        email: "other@test",
        emailVerified: true,
        name: "Other",
      })
    ).attempt!;
    expect((await store.finalize(ready, sid)).linked).toBe(true);
    expect(
      (await pool.query("SELECT google_sub,email,name FROM users")).rows,
    ).toStrictEqual([
      {
        google_sub: "new-google",
        email: "relay@privaterelay.appleid.com",
        name: "Rower",
      },
    ]);
    expect(
      (
        await pool.query(
          "SELECT client_id,refresh_token FROM apple_grants ORDER BY client_id",
        )
      ).rows,
    ).toStrictEqual([
      { client_id: "native.app", refresh_token: "secret" },
      { client_id: "web.app", refresh_token: "fresh-existing" },
    ]);
  });
  it("named subject conflict refuses a second owner and rolls back grant/consume", async () => {
    const b = await link();
    const target = (
      await store.accept(await store.claim(b.attempt), {
        sub: "google",
        email: "",
        emailVerified: false,
        name: "Rower",
      })
    ).attempt!;
    const ready = (await store.accept(await store.claim(target), apple))
      .attempt!;
    await pool.query(
      "INSERT INTO users(apple_sub,email,name) VALUES('apple','elsewhere@test','Other')",
    );
    await expect(
      store.finalize(
        ready,
        (await sessions.resolveSession(b.credential.token))!.sessionId,
      ),
    ).rejects.toThrow("account_conflict");
    expect(
      (await pool.query("SELECT apple_sub FROM users WHERE id=$1", [b.user.id]))
        .rows,
    ).toStrictEqual([{ apple_sub: null }]);
    expect(
      (await pool.query("SELECT user_id FROM apple_grants")).rowCount,
    ).toBe(0);
    expect(
      (await pool.query("SELECT stage FROM auth_attempts")).rows,
    ).toStrictEqual([{ stage: "link_ready" }]);
  });
  // --- Attempt token revocation, census row 10 (2026-09-19 spec) ---------
  //
  // STARTS UPSTREAM OF THE PRODUCER (RF24). The attempt is driven to
  // `link_ready` through begin/claim/accept rather than inserted, and the
  // leak is triggered through the real sign-out path, because the defect is
  // the SEAM between `sessions.deleteSession` and the `ON DELETE cascade`
  // that reaches `auth_attempts` — not either half on its own.
  it("signing out revokes the Apple token a pending link left on the attempt", async () => {
    const recorder = recordingRevoke();
    const scoped = createAttempts(
      pool,
      createAccessPolicy("public", ""),
      recorder.revoke,
    );
    // The SESSION store is the one under test: the revocation happens where
    // the cascade originates, not in `attempts.ts`. A scoped attempts store
    // alone would sign out through the suite's shared store and record
    // nothing -- which is exactly what this test did on its first run.
    const scopedSessions = createSessionStore(
      db,
      createAccessPolicy("public", ""),
      recorder.revoke,
    );
    const user = await users.createUser({
      googleSub: "google",
      email: "original@test",
      name: "Original",
    });
    const credential = await scopedSessions.createSession(user.id);
    const resolved = await scopedSessions.resolveSession(credential.token);
    const begun = await scoped.begin({
      surface: "native",
      purpose: "link",
      targetProvider: "apple",
      originalSessionId: resolved!.sessionId,
    });
    const target = (
      await scoped.accept(await scoped.claim(begun.attempt), {
        sub: "google",
        email: "",
        emailVerified: false,
        name: "Rower",
      })
    ).attempt!;
    await scoped.accept(await scoped.claim(target), apple);
    // The precondition the whole test rests on: the credential really is
    // parked on the attempt row, and a link guarantees no grant exists to
    // suppress the revoke (`attempts.ts` refuses a link when apple_sub is set).
    expect(
      (
        await pool.query(
          "SELECT apple_client_id, apple_refresh_token FROM auth_attempts",
        )
      ).rows,
    ).toStrictEqual([
      { apple_client_id: "native.app", apple_refresh_token: "secret" },
    ]);
    expect((await pool.query("SELECT 1 FROM apple_grants")).rowCount).toBe(0);

    await scopedSessions.deleteSession(credential.token);

    // The row is gone by cascade either way -- that is not the assertion.
    expect((await pool.query("SELECT 1 FROM auth_attempts")).rowCount).toBe(0);
    expect(recorder.seen).toStrictEqual([
      { clientId: "native.app", refreshToken: "secret" },
    ]);
  });
  // --- Attempt token revocation, census row 2: the TTL sweep --------------
  it("the TTL sweep revokes the Apple token on the rows it expires", async () => {
    const recorder = recordingRevoke();
    const scoped = createAttempts(
      pool,
      createAccessPolicy("public", ""),
      recorder.revoke,
    );
    // A fresh store is `healthy: false` until its first sweep, and
    // `begin()` refuses every signin while it is.
    await scoped.sweep();
    const begun = await scoped.begin({
      surface: "native",
      purpose: "signin",
      targetProvider: "apple",
    });
    await scoped.accept(await scoped.claim(begun.attempt), apple);
    expect(
      (await pool.query("SELECT apple_refresh_token FROM auth_attempts")).rows,
    ).toStrictEqual([{ apple_refresh_token: "secret" }]);
    // Expire it the way time would, rather than deleting it ourselves: the
    // sweep's own predicate is what must find the row.
    // BOTH columns: `auth_attempts_expiry_check` requires
    // expires_at > created_at, so moving expiry alone violates it.
    await pool.query(
      "UPDATE auth_attempts SET created_at=now()-interval '2s', expires_at=now()-interval '1s'",
    );

    await scoped.sweep();

    expect((await pool.query("SELECT 1 FROM auth_attempts")).rowCount).toBe(0);
    expect(recorder.seen).toStrictEqual([
      { clientId: "native.app", refreshToken: "secret" },
    ]);
  });
  // A REVOKE FAILURE MUST NOT FLIP `healthy`. `sweep()` owns the front door's
  // availability flag -- `begin()` refuses every signin while it is false --
  // so letting Apple's reachability decide it would take sign-in down for up
  // to 60s because a THIRD PARTY was slow. Only a database failure may.
  it("a throwing revoker leaves the sweep healthy and sign-in open", async () => {
    const scoped = createAttempts(
      pool,
      createAccessPolicy("public", ""),
      () => {
        throw new Error("apple is down");
      },
    );
    // A fresh store is `healthy: false` until its first sweep, and
    // `begin()` refuses every signin while it is.
    await scoped.sweep();
    const begun = await scoped.begin({
      surface: "native",
      purpose: "signin",
      targetProvider: "apple",
    });
    await scoped.accept(await scoped.claim(begun.attempt), apple);
    // BOTH columns: `auth_attempts_expiry_check` requires
    // expires_at > created_at, so moving expiry alone violates it.
    await pool.query(
      "UPDATE auth_attempts SET created_at=now()-interval '2s', expires_at=now()-interval '1s'",
    );

    await expect(scoped.sweep()).resolves.toBeUndefined();

    expect(scoped.healthy()).toBe(true);
    // And the door is still open, which is the consequence that matters.
    await expect(
      scoped.begin({
        surface: "native",
        purpose: "signin",
        targetProvider: "apple",
      }),
    ).resolves.toBeDefined();
  });
  // --- Census rows 7 and 8: discard() and cancel() ------------------------
  it("cancelling a signin revokes the Apple token it was holding", async () => {
    const recorder = recordingRevoke();
    const scoped = createAttempts(
      pool,
      createAccessPolicy("public", ""),
      recorder.revoke,
    );
    await scoped.sweep();
    const begun = await scoped.begin({
      surface: "native",
      purpose: "signin",
      targetProvider: "apple",
    });
    await scoped.accept(await scoped.claim(begun.attempt), apple);

    await scoped.cancel(begun.attempt.id, begun.bindingSecret, "native");

    expect((await pool.query("SELECT 1 FROM auth_attempts")).rowCount).toBe(0);
    expect(recorder.seen).toStrictEqual([
      { clientId: "native.app", refreshToken: "secret" },
    ]);
  });
  it("discarding a signin revokes its token AND still reports the row count", async () => {
    const recorder = recordingRevoke();
    const scoped = createAttempts(
      pool,
      createAccessPolicy("public", ""),
      recorder.revoke,
    );
    await scoped.sweep();
    const begun = await scoped.begin({
      surface: "native",
      purpose: "signin",
      targetProvider: "apple",
    });
    const held = (await scoped.accept(await scoped.claim(begun.attempt), apple))
      .attempt!;

    // The BOOLEAN is load-bearing at three call sites in frontDoorRoutes.ts,
    // so it is asserted beside the revoke rather than assumed to survive.
    await expect(scoped.discard(held)).resolves.toBe(true);

    expect(recorder.seen).toStrictEqual([
      { clientId: "native.app", refreshToken: "secret" },
    ]);
    // And a second discard of the same snapshot matches nothing and says so.
    await expect(scoped.discard(held)).resolves.toBe(false);
  });
  // --- THE OTHER DIRECTION OF THE INVARIANT ------------------------------
  //
  // Every test above asserts a token IS revoked. This one asserts a token is
  // NOT, and it is the direction the whole subject-keyed design exists for.
  // `grant()` upserts on (user_id, client_id), so a rower who already holds
  // an Apple grant and then starts a DELETE confirmation ends up with two
  // tokens against one Apple authorization. Apple's own documentation will
  // not say whether revoking one revokes the authorization, so we assume the
  // broad reading and refuse to touch a credential the rower is keeping.
  //
  // Without this test, a change that revoked everything would pass the entire
  // rest of this file.
  it("does NOT revoke a cancelled delete attempt whose grant is still live", async () => {
    const recorder = recordingRevoke();
    const scoped = createAttempts(
      pool,
      createAccessPolicy("public", ""),
      recorder.revoke,
    );
    await scoped.sweep();
    const user = await seedUser({ googleSub: null, appleSub: "a-keep" });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'native.app','rt-LIVE')",
      [user.id],
    );
    const other = await sessions.createSession(user.id);
    const resolved = (await sessions.resolveSession(other.token))!;
    // A delete attempt on that session, carrying its own second token issued
    // against the SAME Apple authorization.
    await pool.query(
      `INSERT INTO auth_attempts(id,binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,created_at,expires_at,reauthenticated_at,verified_subject,verified_email,verified_name,apple_client_id,apple_refresh_token)
       VALUES($1,$2,'web','delete','apple','apple','delete_ready',1,'st-keep','no-keep',$3,now(),now()+interval '5m',now(),NULL,NULL,NULL,'native.app','rt-SECOND')`,
      [
        "11111111-1111-4111-8111-111111111111",
        hashToken("bs-keep"),
        resolved.sessionId,
      ],
    );

    await scoped.cancel(
      "11111111-1111-4111-8111-111111111111",
      "bs-keep",
      "web",
    );

    // The row is gone -- cancelling still cancels.
    expect((await pool.query("SELECT 1 FROM auth_attempts")).rowCount).toBe(0);
    // But nothing was revoked, because the rower still signs in with Apple.
    expect(recorder.seen).toStrictEqual([]);
    expect(
      (await pool.query("SELECT refresh_token FROM apple_grants")).rows,
    ).toStrictEqual([{ refresh_token: "rt-LIVE" }]);
  });
  it("claim and same-session replacement wait without a lock-order cycle", async () => {
    const b = await link();
    let release!: () => void;
    const pause = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const ready = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const claimPool = new pg.Pool({
      connectionString: container.getConnectionUri(),
      application_name: "claim-order-test",
    });
    claimPool.on("connect", (client) => {
      const originalQuery = client.query.bind(client);
      client.query = (async (sql: string, values?: unknown[]) => {
        const result = await originalQuery(sql, values);
        if (sql.includes("FROM auth_attempts") && sql.endsWith("FOR UPDATE")) {
          reached();
          await pause;
        }
        return result;
      }) as typeof client.query;
    });
    const claim = createAttempts(
      claimPool,
      createAccessPolicy("public", ""),
      recordingRevoke().revoke,
    ).claim(b.attempt);
    await ready;
    const replacement = store.begin({
      surface: "native",
      purpose: "link",
      targetProvider: "apple",
      originalSessionId: b.attempt.originalSessionId!,
    });
    const settled = Promise.allSettled([claim, replacement]);
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const result = await pool.query<{ waiting: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock') AS waiting",
      );
      if (result.rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    release();
    const results = await settled;
    await claimPool.end();
    expect(waiting).toBe(true);
    expect(results.map((result) => result.status)).toStrictEqual([
      "fulfilled",
      "fulfilled",
    ]);
  });
  it("caps anonymous residents at 512 without consuming existing work", async () => {
    await pool.query(
      "INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,stage,version,state,nonce,expires_at) SELECT 'hash','native','signin','apple','authorize',1,gen_random_uuid()::text,gen_random_uuid()::text,now()+interval '5 minutes' FROM generate_series(1,512)",
    );
    await expect(signin()).rejects.toThrow("rate_limited");
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
      512,
    );
  });
  it("expiry is authority even before physical cleanup", async () => {
    const b = await signin();
    await pool.query(
      "UPDATE auth_attempts SET created_at=now()-interval '10 minutes',expires_at=now()-interval '1 second' WHERE id=$1",
      [b.attempt.id],
    );
    await expect(
      store.read(b.attempt.id, b.bindingSecret, "native"),
    ).rejects.toThrow("attempt_expired");
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(1);
    await store.sweep();
    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
  });
  it("rolls back user/session/consume when grant persistence fails", async () => {
    const b = await signin();
    await store.accept(await store.claim(b.attempt), apple);
    await pool.query(
      "ALTER TABLE apple_grants ADD CONSTRAINT force_grant_failure CHECK (refresh_token <> 'secret')",
    );
    await expect(
      store.confirm(await store.read(b.attempt.id, b.bindingSecret, "native")),
    ).rejects.toThrow();
    await pool.query(
      "ALTER TABLE apple_grants DROP CONSTRAINT force_grant_failure",
    );
    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(0);
    expect(
      (await pool.query("SELECT stage FROM auth_attempts")).rows,
    ).toStrictEqual([{ stage: "confirm" }]);
  });
  it("concurrent signup blocks on actual unique subject lock and returns one owner", async () => {
    const b = await signin();
    await store.accept(await store.claim(b.attempt), apple);
    const blocker = await pool.connect();
    await blocker.query("BEGIN");
    const owner = await blocker.query<{ id: string }>(
      "INSERT INTO users(apple_sub,email,name) VALUES('apple','original@test','Original') RETURNING id",
    );
    const running = store.confirm(
      await store.read(b.attempt.id, b.bindingSecret, "native"),
    );
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const rows = await pool.query<{ waiting: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'INSERT INTO users%') AS waiting",
      );
      if (rows.rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
    await blocker.query("COMMIT");
    blocker.release();
    expect((await running).signedIn?.user.id).toBe(owner.rows[0].id);
    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(1);
  });
  it("authorizes the concurrent canonical winner before grant or session commit", async () => {
    const restricted = createAttempts(
      pool,
      createAccessPolicy("restricted", "relay@privaterelay.appleid.com"),
      recordingRevoke().revoke,
    );
    await restricted.sweep();
    const b = await restricted.begin({
      surface: "native",
      purpose: "signin",
      targetProvider: "apple",
    });
    await restricted.accept(await restricted.claim(b.attempt), apple);
    const blocker = await pool.connect();
    await blocker.query("BEGIN");
    await blocker.query(
      "INSERT INTO users(apple_sub,email,name) VALUES('apple','disallowed@test','Other')",
    );
    const running = restricted.confirm(
      await restricted.read(b.attempt.id, b.bindingSecret, "native"),
    );
    // A HANDLER BEFORE THE POLLING LOOP, NOT AFTER IT. `running` is left in
    // flight for up to a second below while we watch for the lock; if it
    // rejects inside that window — which it does whenever the insert does
    // not block — the rejection is unhandled for a turn, and Node reports it
    // at the process level. Vitest then fails the JOB with
    // `Tests <n> passed | Errors 1 error`, which reads as a red run with no
    // red test: seen once on this branch at `d2409c09`, from
    // `attempts.ts:145`'s `access_denied`. This changes nothing the test
    // asserts — `running` still rejects, and the assertion below still reads
    // it — it only means the same conditions now surface as the honest
    // failure of `expect(waiting)` instead of a confusing job-level error.
    void running.catch(() => {});
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const rows = await pool.query<{ waiting: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'INSERT INTO users%') AS waiting",
      );
      if (rows.rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
    await blocker.query("COMMIT");
    blocker.release();
    await expect(running).rejects.toThrow("access_denied");
    expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(0);
    expect(
      (await pool.query("SELECT user_id FROM apple_grants")).rowCount,
    ).toBe(0);
  });

  it("denies every in-flight link transition after the original account loses access without mutation", async () => {
    const b = await link();
    const restricted = createAttempts(
      pool,
      createAccessPolicy("restricted", "someone-else@test"),
      recordingRevoke().revoke,
    );
    await expect(
      restricted.read(b.attempt.id, b.bindingSecret, "native"),
    ).rejects.toThrow("access_denied");
    await expect(restricted.claim(b.attempt)).rejects.toThrow("access_denied");
    expect(
      (await pool.query("SELECT stage,version FROM auth_attempts")).rows,
    ).toStrictEqual([{ stage: "reauth_authorize", version: 1 }]);
    expect(
      (await pool.query("SELECT apple_sub FROM users WHERE id=$1", [b.user.id]))
        .rows,
    ).toStrictEqual([{ apple_sub: null }]);
  });

  it("rechecks original-account access at link begin and provider-proof acceptance", async () => {
    const b = await link();
    const restricted = createAttempts(
      pool,
      createAccessPolicy("restricted", "someone-else@test"),
      recordingRevoke().revoke,
    );
    await expect(
      restricted.begin({
        surface: "native",
        purpose: "link",
        targetProvider: "apple",
        originalSessionId: b.attempt.originalSessionId!,
      }),
    ).rejects.toThrow("access_denied");
    const claimed = await store.claim(b.attempt);
    await expect(
      restricted.accept(claimed, {
        sub: "google",
        email: "provider@test",
        emailVerified: true,
        name: "Provider",
      }),
    ).rejects.toThrow("access_denied");
    expect(
      (await pool.query("SELECT stage,version FROM auth_attempts")).rows,
    ).toStrictEqual([{ stage: "reauth_exchanging", version: 2 }]);
  });

  it("rechecks original-account access at link finalization without attaching or granting", async () => {
    const b = await link();
    const target = (
      await store.accept(await store.claim(b.attempt), {
        sub: "google",
        email: "",
        emailVerified: false,
        name: "Google",
      })
    ).attempt!;
    const ready = (await store.accept(await store.claim(target), apple))
      .attempt!;
    const restricted = createAttempts(
      pool,
      createAccessPolicy("restricted", "someone-else@test"),
      recordingRevoke().revoke,
    );
    await expect(
      restricted.finalize(ready, b.attempt.originalSessionId!),
    ).rejects.toThrow("access_denied");
    expect(
      (await pool.query("SELECT apple_sub FROM users WHERE id=$1", [b.user.id]))
        .rows,
    ).toStrictEqual([{ apple_sub: null }]);
    expect(
      (await pool.query("SELECT user_id FROM apple_grants")).rowCount,
    ).toBe(0);
    expect(
      (await pool.query("SELECT stage,version FROM auth_attempts")).rows,
    ).toStrictEqual([{ stage: "link_ready", version: 5 }]);
  });

  it("links Apple relay identity by the saved account email", async () => {
    const b = await link();
    const restricted = createAttempts(
      pool,
      createAccessPolicy("restricted", "original@test"),
      recordingRevoke().revoke,
    );
    const owned = await restricted.read(
      b.attempt.id,
      b.bindingSecret,
      "native",
    );
    const target = (
      await restricted.accept(await restricted.claim(owned), {
        sub: "google",
        email: "provider-changed@test",
        emailVerified: true,
        name: "Changed",
      })
    ).attempt!;
    const ready = (
      await restricted.accept(await restricted.claim(target), apple)
    ).attempt!;
    expect(
      (await restricted.finalize(ready, b.attempt.originalSessionId!)).linked,
    ).toBe(true);
    expect(
      (
        await pool.query("SELECT email,apple_sub FROM users WHERE id=$1", [
          b.user.id,
        ])
      ).rows,
    ).toStrictEqual([{ email: "original@test", apple_sub: "apple" }]);
  });

  it("legacy Google preserves a returning saved email and denies it when restricted", async () => {
    await pool.query(
      "INSERT INTO users(google_sub,email,name) VALUES('legacy','saved@test','Saved')",
    );
    const allowed = createAttempts(
      pool,
      createAccessPolicy("restricted", "saved@test"),
      recordingRevoke().revoke,
    );
    const signed = await allowed.legacyGoogle({
      ...apple,
      sub: "legacy",
      email: "changed@test",
      name: "Changed",
      grant: undefined,
    });
    expect(signed.user).toMatchObject({ email: "saved@test", name: "Changed" });

    const denied = createAttempts(
      pool,
      createAccessPolicy("restricted", "changed@test"),
      recordingRevoke().revoke,
    );
    await expect(
      denied.legacyGoogle({
        ...apple,
        sub: "legacy",
        email: "changed@test",
        grant: undefined,
      }),
    ).rejects.toThrow("access_denied");
    await expect(
      denied.legacyGoogle({
        ...apple,
        sub: "new-legacy",
        email: "outside@test",
        grant: undefined,
      }),
    ).rejects.toThrow("access_denied");
    expect(
      (
        await pool.query(
          "SELECT email,name FROM users WHERE google_sub='legacy'",
        )
      ).rows,
    ).toStrictEqual([{ email: "saved@test", name: "Changed" }]);
    expect(
      (await pool.query("SELECT id FROM users WHERE google_sub='new-legacy'"))
        .rowCount,
    ).toBe(0);
  });
  it("accepts existing-provider proof just INSIDE the freshness window", async () => {
    // The other half of the pin. The staleness test below moves
    // `reauthenticated_at` back 5 minutes and asserts rejection, so
    // LENGTHENING `ttl` bites — but SHORTENING it does not: 300000 -> 30000
    // left every test green (they all finish well under 30s) while handing a
    // real rower a 30-second window to get through Apple's sheet. An
    // independent literal just inside the boundary is what makes the constant
    // observable from both sides (RF33).
    const b = await link();
    const target = (
      await store.accept(await store.claim(b.attempt), {
        sub: "google",
        email: "",
        emailVerified: false,
        name: "Rower",
      })
    ).attempt!;
    const ready = (await store.accept(await store.claim(target), apple))
      .attempt!;
    await pool.query(
      "UPDATE auth_attempts SET reauthenticated_at=now()-interval '4 minutes 30 seconds' WHERE id=$1",
      [ready.id],
    );
    const fresh = await store.read(b.attempt.id, b.bindingSecret, "native");
    await expect(
      store.finalize(fresh, b.attempt.originalSessionId!),
    ).resolves.toStrictEqual({ linked: true });
  });

  it("rejects stale existing-provider proof even if target attempt has a later expiry", async () => {
    const b = await link();
    const target = (
      await store.accept(await store.claim(b.attempt), {
        sub: "google",
        email: "",
        emailVerified: false,
        name: "Rower",
      })
    ).attempt!;
    const ready = (await store.accept(await store.claim(target), apple))
      .attempt!;
    await pool.query(
      "UPDATE auth_attempts SET reauthenticated_at=now()-interval '5 minutes',expires_at=now()+interval '5 minutes' WHERE id=$1",
      [ready.id],
    );
    const expired = await store.read(b.attempt.id, b.bindingSecret, "native");
    await expect(
      store.finalize(expired, b.attempt.originalSessionId!),
    ).rejects.toThrow("attempt_expired");
    expect(
      (await pool.query("SELECT apple_sub FROM users")).rows,
    ).toStrictEqual([{ apple_sub: null }]);
  });

  // --- Wave A PR 1 Task 3: the delete purpose ----------------------------
  function makeAttempts(revoke: RevokeApple) {
    return createAttempts(pool, createAccessPolicy("public", ""), revoke);
  }
  /** Resolves once some backend in this database is blocked on a lock — the
   *  barrier the concurrency tests use instead of a sleep. */
  async function waitForLock() {
    for (let i = 0; i < 200; i++) {
      const rows = await pool.query<{ waiting: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock') AS waiting",
      );
      if (rows.rows[0].waiting) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return false;
  }
  async function seedUser(subs: {
    googleSub: string | null;
    appleSub: string | null;
  }) {
    return (
      await pool.query<{ id: string }>(
        "INSERT INTO users(google_sub,apple_sub,email,name) VALUES($1,$2,'rower@test','Rower') RETURNING id",
        [subs.googleSub, subs.appleSub],
      )
    ).rows[0];
  }
  async function seedSession(userId: string) {
    return (
      await pool.query<{ id: string }>(
        "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,gen_random_uuid()::text,now()+interval '60 days') RETURNING id",
        [userId],
      )
    ).rows[0];
  }
  async function deleteReadyAttempt(
    user: { id: string; provider: AuthProvider; sub: string },
    grant?: { clientId: string; refreshToken: string },
    session?: { id: string },
    s: ReturnType<typeof createAttempts> = store,
  ) {
    const current = session ?? (await seedSession(user.id));
    const b = await s.begin({
      surface: "native",
      purpose: "delete",
      targetProvider: user.provider,
      originalSessionId: current.id,
    });
    const accepted = await s.accept(await s.claim(b.attempt), {
      sub: user.sub,
      email: "",
      emailVerified: false,
      name: "Rower",
      ...(grant ? { grant } : {}),
    });
    return {
      ready: accepted.attempt!,
      session: current,
      bindingSecret: b.bindingSecret,
    };
  }
  // Every table Postgres cascades from `users`, DERIVED from the catalog in
  // the census test below rather than trusted from this list: a table added
  // with an ON DELETE CASCADE user_id must not be able to join the schema
  // without joining this seed too (RF37's derived-list lesson).
  const CASCADING_TABLES = [
    "apple_grants",
    "article_reads",
    "baselines",
    "concept2_auth_attempts",
    "concept2_links",
    "plan_state",
    "preferences",
    "session_logs",
    "sessions",
    "test_history",
    "workouts",
  ];
  async function seedUserWithDataEverywhere() {
    const user = await seedUser({
      googleSub: "g-everywhere",
      appleSub: "a-everywhere",
    });
    const workout = (
      await pool.query<{ id: string }>(
        "INSERT INTO workouts(user_id,title,type,effort,source,steps) VALUES($1,'Mine','O2',3,'user','[]'::jsonb) RETURNING id",
        [user.id],
      )
    ).rows[0];
    const log = (
      await pool.query<{ id: string }>(
        "INSERT INTO session_logs(user_id,workout_id,workout_title,steps,source) VALUES($1,$2,'Mine','[]'::jsonb,'timer') RETURNING id",
        [user.id, workout.id],
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO baselines(user_id,k2_seconds) VALUES($1,120)",
      [user.id],
    );
    await pool.query(
      "INSERT INTO plan_state(user_id,plan_key,done_n) VALUES($1,'sprint',2)",
      [user.id],
    );
    await pool.query("INSERT INTO preferences(user_id) VALUES($1)", [user.id]);
    await pool.query(
      "INSERT INTO test_history(user_id,distance,split_seconds,session_log_id) VALUES($1,'2k',110,$2)",
      [user.id, log.id],
    );
    await pool.query(
      "INSERT INTO article_reads(user_id,slug) VALUES($1,'intro')",
      [user.id],
    );
    await pool.query(
      "INSERT INTO concept2_links(user_id,c2_user_id,access_token,refresh_token,expires_at) VALUES($1,4242,'at','rt',now()+interval '1 hour')",
      [user.id],
    );
    await pool.query(
      "INSERT INTO concept2_auth_attempts(nonce,user_id) VALUES(gen_random_uuid()::text,$1)",
      [user.id],
    );
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'haus.waffle.ergomatic','rt-native')",
      [user.id],
    );
    return user;
  }
  it("re-proves the provider the rower already holds, not the opposite one", async () => {
    const user = await seedUser({ googleSub: "g-1", appleSub: null });
    const session = await seedSession(user.id);
    const { attempt } = await store.begin({
      surface: "native",
      purpose: "delete",
      targetProvider: "google",
      originalSessionId: session.id,
    });
    expect(attempt.existingProvider).toBe("google");
    expect(attempt.targetProvider).toBe("google");
    expect(attempt.stage).toBe("reauth_authorize");
    expect(attempt.originalSessionId).toBe(session.id);
  });
  it("holds the delete equality the CHECK constraint does not enforce", async () => {
    // The DBA gate found that `auth_attempts_session_check`'s delete arm
    // admits `existing_provider <> target_provider` — the equality is a pure
    // application-layer promise, so `begin()` is the only thing keeping it
    // and this assertion is its only gate.
    const user = await seedUser({ googleSub: "g-eq", appleSub: null });
    const session = await seedSession(user.id);
    const { attempt } = await store.begin({
      surface: "native",
      purpose: "delete",
      targetProvider: "google",
      originalSessionId: session.id,
    });
    expect(
      (
        await pool.query(
          "SELECT existing_provider,target_provider FROM auth_attempts WHERE id=$1",
          [attempt.id],
        )
      ).rows,
    ).toStrictEqual([
      { existing_provider: "google", target_provider: "google" },
    ]);
    // And the database really does admit the mismatch: an unequal delete row
    // on another session inserts cleanly.
    const other = await seedSession(user.id);
    await pool.query(
      "INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,expires_at) VALUES('h','native','delete','apple','google','reauth_authorize',1,gen_random_uuid()::text,gen_random_uuid()::text,$1,now()+interval '5 minutes')",
      [other.id],
    );
    expect(
      (
        await pool.query(
          "SELECT target_provider,existing_provider FROM auth_attempts WHERE original_session_id=$1",
          [other.id],
        )
      ).rows,
    ).toStrictEqual([
      { target_provider: "apple", existing_provider: "google" },
    ]);
  });
  it("refuses a delete attempt naming a provider the rower does not hold", async () => {
    const user = await seedUser({ googleSub: "g-2", appleSub: null });
    const session = await seedSession(user.id);
    await expect(
      store.begin({
        surface: "native",
        purpose: "delete",
        targetProvider: "apple",
        originalSessionId: session.id,
      }),
    ).rejects.toThrow("account_conflict");
  });
  it("one attempt per session across purposes: a delete displaces a live link", async () => {
    // `auth_attempts_link_session_unique` is keyed on original_session_id
    // ALONE, so it collides across purposes. Task 1 deferred this gate to the
    // first task that could mint a delete attempt through the store.
    const user = await seedUser({ googleSub: "g-x", appleSub: null });
    const session = await seedSession(user.id);
    const link = await store.begin({
      surface: "native",
      purpose: "link",
      targetProvider: "apple",
      originalSessionId: session.id,
    });
    const removal = await store.begin({
      surface: "native",
      purpose: "delete",
      targetProvider: "google",
      originalSessionId: session.id,
    });
    expect(
      (
        await pool.query(
          "SELECT id FROM auth_attempts WHERE original_session_id=$1",
          [session.id],
        )
      ).rows,
    ).toStrictEqual([{ id: removal.attempt.id }]);
    await expect(
      store.read(link.attempt.id, link.bindingSecret, "native"),
    ).rejects.toThrow("attempt_expired");
    // The index, not merely the sweep: a second row on this session is
    // refused whatever its purpose.
    await expect(
      pool.query(
        "INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,expires_at) VALUES('h','native','link','apple','google','reauth_authorize',1,gen_random_uuid()::text,gen_random_uuid()::text,$1,now()+interval '5 minutes')",
        [session.id],
      ),
    ).rejects.toThrow("auth_attempts_link_session_unique");
  });
  it("reaches delete_ready when the reauth matches the signed-in account", async () => {
    const user = await seedUser({ googleSub: "g-3", appleSub: null });
    const session = await seedSession(user.id);
    const b = await store.begin({
      surface: "native",
      purpose: "delete",
      targetProvider: "google",
      originalSessionId: session.id,
    });
    const result = await store.accept(await store.claim(b.attempt), {
      sub: "g-3",
      email: "",
      emailVerified: false,
      name: "Rower",
    });
    expect(result.attempt!.stage).toBe("delete_ready");
    expect(result.attempt!.reauthenticatedAt).toBeTruthy();
    expect(result.attempt!.state).toBe(b.attempt.state);
  });
  it("refuses when the delete reauth proves a DIFFERENT account", async () => {
    const user = await seedUser({ googleSub: "g-4", appleSub: null });
    await seedUser({ googleSub: "someone-else", appleSub: null });
    const session = await seedSession(user.id);
    const b = await store.begin({
      surface: "native",
      purpose: "delete",
      targetProvider: "google",
      originalSessionId: session.id,
    });
    await expect(
      store.accept(await store.claim(b.attempt), {
        sub: "someone-else",
        email: "",
        emailVerified: false,
        name: "Other",
      }),
    ).rejects.toThrow("account_changed");
  });
  it("still refuses a delete attempt parked at a signup-only stage", async () => {
    // `consistent()`'s stage rules gained a `delete_ready` arm; the signup
    // rule must not have been loosened with it. Every verified_* column is
    // filled so the ONLY clause that can fire is the signup one.
    const user = await seedUser({ googleSub: "g-c", appleSub: null });
    const session = await seedSession(user.id);
    const secret = "wrong-shaped-but-unused";
    const row = (
      await pool.query<{ id: string }>(
        "INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,expires_at,verified_subject,verified_email,verified_name) VALUES($1,'native','delete','google','google','confirm',1,gen_random_uuid()::text,gen_random_uuid()::text,$2,now()+interval '5 minutes','g-c','rower@test','Rower') RETURNING id",
        [hashToken(secret), session.id],
      )
    ).rows[0];
    await expect(store.read(row.id, secret, "native")).rejects.toThrow(
      "attempt_expired",
    );
  });
  it.each([
    { purpose: "delete", stage: "link_ready", existing: "google" },
    { purpose: "link", stage: "delete_ready", existing: "google" },
  ])(
    "refuses a $purpose attempt parked at $stage, which belongs to another purpose",
    async ({ purpose, stage, existing }) => {
      // accept()'s tail stamps `link_ready` on anything that is not a signin,
      // and fills every verified_* column on the way past — so without the
      // purpose-terminal clause in consistent() a delete sitting there passes
      // every other check. Unreachable through claim() today; this is the
      // thing that names the precondition (RF18). reauthenticated_at and the
      // verified_* columns are filled so the ONLY clause that can fire is the
      // purpose-terminal one.
      const user = await seedUser({ googleSub: "g-term", appleSub: null });
      const session = await seedSession(user.id);
      const secret = "terminal-stage-secret";
      const row = (
        await pool.query<{ id: string }>(
          "INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,expires_at,reauthenticated_at,verified_subject,verified_email,verified_name) VALUES($1,'native',$2,'apple',$3,$4,1,gen_random_uuid()::text,gen_random_uuid()::text,$5,now()+interval '5 minutes',now(),'g-term','rower@test','Rower') RETURNING id",
          [hashToken(secret), purpose, existing, stage, session.id],
        )
      ).rows[0];
      await expect(store.read(row.id, secret, "native")).rejects.toThrow(
        "attempt_expired",
      );
    },
  );
  it("removes the account's rows from every cascading table and the account itself", async () => {
    const user = await seedUserWithDataEverywhere();
    // Seeded BEFORE the census below, because `sessions` is one of the tables
    // the census requires a row in.
    const session = await seedSession(user.id);
    const census = (
      await pool.query<{ table: string }>(
        `SELECT DISTINCT c.relname AS "table" FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_class p ON p.oid=con.confrelid WHERE con.contype='f' AND p.relname='users' AND con.confdeltype='c' ORDER BY 1`,
      )
    ).rows.map((r) => r.table);
    expect([...census].sort()).toStrictEqual([...CASCADING_TABLES].sort());
    for (const table of CASCADING_TABLES)
      expect(
        (await pool.query(`SELECT 1 FROM ${table} WHERE user_id=$1`, [user.id]))
          .rowCount,
        `${table} was never seeded`,
      ).toBeGreaterThan(0);
    const { ready } = await deleteReadyAttempt(
      { id: user.id, provider: "google", sub: "g-everywhere" },
      undefined,
      session,
    );
    expect(await store.deleteAccount(ready, session.id)).toStrictEqual({
      outcome: "deleted",
      appleRevoked: true,
    });
    for (const table of CASCADING_TABLES)
      expect(
        (await pool.query(`SELECT 1 FROM ${table} WHERE user_id=$1`, [user.id]))
          .rowCount,
        `${table} still holds rows`,
      ).toBe(0);
    expect(
      (await pool.query("SELECT 1 FROM auth_attempts WHERE id=$1", [ready.id]))
        .rowCount,
      "auth_attempts cascades through sessions",
    ).toBe(0);
    expect(
      (await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount,
    ).toBe(0);
  });
  it("revokes every Apple grant plus the attempt's own credential", async () => {
    const { revoke, seen } = recordingRevoke();
    const deleting = makeAttempts(revoke);
    const user = await seedUser({ googleSub: null, appleSub: "a-7" });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'haus.waffle.ergomatic','rt-native'),($1,'haus.waffle.ergomatic.web.staging','rt-web')",
      [user.id],
    );
    // The attempt carries a THIRD live credential, which would otherwise
    // cascade away through sessions with nothing revoked.
    const { ready, session } = await deleteReadyAttempt(
      { id: user.id, provider: "apple", sub: "a-7" },
      { clientId: "haus.waffle.ergomatic", refreshToken: "rt-attempt" },
      undefined,
      deleting,
    );
    const result = await deleting.deleteAccount(ready, session.id);
    expect(seen.map((g) => g.refreshToken).sort()).toStrictEqual([
      "rt-attempt",
      "rt-native",
      "rt-web",
    ]);
    expect(result.appleRevoked).toBe(true);
  });
  it("revokes a held grant even when the account's apple_sub is null", async () => {
    // NO SUPPORTED WRITER PRODUCES THIS STATE TODAY: there is one grant
    // writer, and `unlink` deletes every grant in the same TRANSACTION that
    // nulls `apple_sub` — two statements, not one, but they commit or fail
    // together, which is what makes the pairing hold. It is seeded by raw
    // SQL on purpose, because the thing under test is what happens WHEN
    // THAT STOPS HOLDING — reading `apple_sub` first and skipping the
    // DELETE would let the grant cascade away unrevoked while
    // `revokeApple([])` answered `true`, and the rower would be told
    // `appleRevoked` over a live credential at Apple. The
    // schema permits the state (nullable column, no dependency between the
    // two tables), so the guarantee is "whatever apple_sub says, a grant we
    // hold is revoked".
    const { revoke, seen } = recordingRevoke();
    const deleting = makeAttempts(revoke);
    const user = await seedUser({ googleSub: "g-orphan", appleSub: null });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c-orphan','rt-orphan')",
      [user.id],
    );
    const { ready, session } = await deleteReadyAttempt(
      { id: user.id, provider: "google", sub: "g-orphan" },
      undefined,
      undefined,
      deleting,
    );
    expect(await deleting.deleteAccount(ready, session.id)).toStrictEqual({
      outcome: "deleted",
      appleRevoked: true,
    });
    expect(seen.map((g) => g.refreshToken)).toStrictEqual(["rt-orphan"]);
  });
  it("revokes the grant as it stands at DELETE time, not as it was read", async () => {
    // A concurrent grant() upsert refreshes the token while this transaction
    // is OPEN. `ON CONFLICT DO UPDATE` leaves the FK column unchanged, so
    // Postgres runs no RI check and takes no lock on the parent: the refresh
    // slips straight past this transaction's `users FOR UPDATE`. A plain
    // READ COMMITTED SELECT issued before that upsert commits returns the
    // DEAD token and Apple's 200 ("revoked OR previously invalid") would
    // report success over a live credential. `DELETE ... RETURNING` blocks on
    // the uncommitted row instead and returns what the cascade destroyed.
    //
    // The upsert is held in an OPEN transaction on a SECOND connection (RF21):
    // committing it first makes both shapes read rt-NEW and the gate cannot
    // go red.
    expect(pool.options.max).toBeGreaterThanOrEqual(2);
    const { revoke, seen } = recordingRevoke();
    const deleting = makeAttempts(revoke);
    const user = await seedUser({ googleSub: null, appleSub: "a-9" });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c1','rt-OLD')",
      [user.id],
    );
    const { ready, session } = await deleteReadyAttempt(
      { id: user.id, provider: "apple", sub: "a-9" },
      undefined,
      undefined,
      deleting,
    );
    const racer = await pool.connect();
    try {
      await racer.query("BEGIN");
      await racer.query(
        "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c1','rt-NEW') ON CONFLICT(user_id,client_id) DO UPDATE SET refresh_token=excluded.refresh_token",
        [user.id],
      );
      const pending = deleting.deleteAccount(ready, session.id);
      expect(await waitForLock()).toBe(true);
      await racer.query("COMMIT");
      await pending;
    } finally {
      racer.release();
    }
    expect(
      seen.map((g) => g.refreshToken),
      "the revoke must carry the token the cascade destroyed",
    ).toStrictEqual(["rt-NEW"]);
  });
  // --- Census row 9's other half: a SIBLING attempt on another session ----
  //
  // The hand-push at the deleting attempt covers the row the rower is
  // deleting THROUGH. A rower with phone and web holds a second session, and
  // an attempt bound to THAT session cascades away through `sessions` on
  // `DELETE FROM users` with nothing revoked. This is the case the ROADMAP
  // row named and the shipped code missed.
  it("deleting the account revokes a sibling attempt's token on another session", async () => {
    const recorder = recordingRevoke();
    const deleting = makeAttempts(recorder.revoke);
    const user = await seedUser({ googleSub: null, appleSub: "a-sib" });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt-grant')",
      [user.id],
    );
    const { ready, session } = await deleteReadyAttempt(
      { id: user.id, provider: "apple", sub: "a-sib" },
      undefined,
      undefined,
      deleting,
    );
    // A SECOND session of the same rower, carrying its own attempt with its
    // own Apple credential. Built through the store rather than inserted, so
    // the row is shaped the way production shapes it.
    const other = await sessions.createSession(user.id);
    const resolvedOther = (await sessions.resolveSession(other.token))!;
    await pool.query(
      `INSERT INTO auth_attempts(id,binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,created_at,expires_at,reauthenticated_at,verified_subject,verified_email,verified_name,apple_client_id,apple_refresh_token)
       VALUES(gen_random_uuid(),'bh','web','delete','apple','apple','delete_ready',1,'st-sib','no-sib',$1,now(),now()+interval '5m',now(),NULL,NULL,NULL,'c','rt-SIBLING')`,
      [resolvedOther.sessionId],
    );

    const result = await deleting.deleteAccount(ready, session.id);

    expect(result).toStrictEqual({ outcome: "deleted", appleRevoked: true });
    expect((await pool.query("SELECT 1 FROM auth_attempts")).rowCount).toBe(0);
    // The sibling's credential is the one this test exists for. The account's
    // own grant and the deleting attempt's token are asserted alongside it so
    // a regression that drops any of the three is visible.
    expect(recorder.seen.map((g) => g.refreshToken).sort()).toStrictEqual([
      "rt-SIBLING",
      "rt-grant",
    ]);
  });
  it("deletes the account even when Apple cannot be reached, and says so", async () => {
    const deleting = makeAttempts(recordingRevoke(false).revoke);
    const user = await seedUser({ googleSub: null, appleSub: "a-8" });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')",
      [user.id],
    );
    const { ready, session } = await deleteReadyAttempt(
      { id: user.id, provider: "apple", sub: "a-8" },
      undefined,
      undefined,
      deleting,
    );
    expect(await deleting.deleteAccount(ready, session.id)).toStrictEqual({
      outcome: "deleted",
      appleRevoked: false,
    });
    expect(
      (await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount,
    ).toBe(0);
  });
  it("still deletes the account when the revoker REJECTS, and reports appleRevoked: false", async () => {
    // The type says Promise<boolean>, which cannot forbid a rejection. The
    // account is already gone when this runs, so a throw must be swallowed
    // and reported as `appleRevoked: false`, never propagated as a failure.
    const deleting = makeAttempts(async () => {
      throw new Error("apple is down");
    });
    const user = await seedUser({ googleSub: null, appleSub: "a-11" });
    await pool.query(
      "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,'c','rt')",
      [user.id],
    );
    const { ready, session } = await deleteReadyAttempt(
      { id: user.id, provider: "apple", sub: "a-11" },
      undefined,
      undefined,
      deleting,
    );
    expect(await deleting.deleteAccount(ready, session.id)).toStrictEqual({
      outcome: "deleted",
      appleRevoked: false,
    });
    expect(
      (await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount,
    ).toBe(0);
  });
  it("does NOT delete the account when the local write fails", async () => {
    // RF25's owner: our write failing is fatal. A BEFORE DELETE TRIGGER, never
    // a CHECK constraint — a CHECK does not fire on a cascade DELETE, so a
    // constraint-based version of this test could not go red.
    const { revoke, seen } = recordingRevoke();
    const deleting = makeAttempts(revoke);
    const user = await seedUser({ googleSub: "g-9", appleSub: null });
    const { ready, session } = await deleteReadyAttempt(
      { id: user.id, provider: "google", sub: "g-9" },
      undefined,
      undefined,
      deleting,
    );
    await pool.query(
      "CREATE FUNCTION force_delete_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced delete failure'; END $$",
    );
    await pool.query(
      "CREATE TRIGGER force_delete_failure BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION force_delete_failure()",
    );
    try {
      await expect(deleting.deleteAccount(ready, session.id)).rejects.toThrow();
      expect(
        (await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id]))
          .rowCount,
        "the account must survive a failed delete",
      ).toBe(1);
      expect(
        seen,
        "a failed deletion must never revoke anything",
      ).toStrictEqual([]);
    } finally {
      await pool.query("DROP TRIGGER force_delete_failure ON users");
      await pool.query("DROP FUNCTION force_delete_failure()");
    }
  });
  it("refuses a delete driven from a session that is not the attempt's own", async () => {
    const user = await seedUser({ googleSub: "g-12", appleSub: null });
    const { ready } = await deleteReadyAttempt({
      id: user.id,
      provider: "google",
      sub: "g-12",
    });
    const other = await seedSession(user.id);
    await expect(store.deleteAccount(ready, other.id)).rejects.toThrow(
      "account_changed",
    );
    expect(
      (await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount,
    ).toBe(1);
  });
  it("refuses a delete whose reauth has gone stale", async () => {
    const user = await seedUser({ googleSub: "g-13", appleSub: null });
    const { ready, session, bindingSecret } = await deleteReadyAttempt({
      id: user.id,
      provider: "google",
      sub: "g-13",
    });
    await pool.query(
      "UPDATE auth_attempts SET reauthenticated_at=now()-interval '5 minutes',expires_at=now()+interval '5 minutes' WHERE id=$1",
      [ready.id],
    );
    const stale = await store.read(ready.id, bindingSecret, "native");
    await expect(store.deleteAccount(stale, session.id)).rejects.toThrow(
      "attempt_expired",
    );
    expect(
      (await pool.query("SELECT 1 FROM users WHERE id=$1", [user.id])).rowCount,
    ).toBe(1);
  });
  it("does not deadlock against a concurrent sign-in on ANOTHER session", async () => {
    // TWO sessions, and the count is the whole test: with ONE, bound() ->
    // original() takes the users row before either ordered statement, so the
    // ordering buys nothing and a broken implementation still passes.
    //
    // The holder takes original()'s OWN two row locks — sessions[B] then
    // users — as two statements rather than one. original() acquires them in
    // that order inside a single statement, and a concurrent deleter can sit
    // anywhere between them; splitting the holder only makes that window
    // deterministic instead of timing-dependent. Issuing them as one
    // statement (the brief's first shape) acquires BOTH before the deleter
    // starts, which cannot cycle under either lock order and so proves
    // nothing.
    //
    // INFERENCE, and the one half this test does not itself measure: that
    // original()'s single statement takes sessions BEFORE users. Postgres
    // applies FOR UPDATE through a LockRows node that walks the range-table
    // entries in order, and `sessions` is RTE 1 in `FROM sessions INNER JOIN
    // users`. The mutation below proves original() takes BOTH rows; it does
    // not prove the order. If that inference is wrong the holder is still a
    // legal interleaving of two real statements — it just stops being a
    // superset of the single-statement one.
    //
    // Correct order: the deleter's first lock is the ordered sessions sweep,
    // which blocks on sessions[B] while holding NO users lock. The holder
    // takes users freely and commits.
    // Wrong order (sweep after bound()): the deleter holds users before it
    // wants sessions[B], the holder holds sessions[B] and wants users, and
    // Postgres kills one of them with 40P01.
    expect(pool.options.max).toBeGreaterThanOrEqual(2);
    const user = await seedUser({ googleSub: "g-10", appleSub: null });
    const sessionA = await seedSession(user.id);
    const sessionB = await seedSession(user.id);
    const { ready } = await deleteReadyAttempt(
      { id: user.id, provider: "google", sub: "g-10" },
      undefined,
      sessionA,
    );
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM sessions WHERE id=$1 FOR UPDATE", [
        sessionB.id,
      ]);
      const pending = store.deleteAccount(ready, sessionA.id);
      expect(await waitForLock()).toBe(true);
      await holder.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        user.id,
      ]);
      await holder.query("COMMIT");
      await expect(pending).resolves.toStrictEqual({
        outcome: "deleted",
        appleRevoked: true,
      });
    } finally {
      holder.release();
    }
  });
  // WAVE A PR2, Task 1. THE SCHEMA IS NOT THE AUTHORITY on which rows the
  // machine admits — `consistent()` is, and it runs on both the read path
  // (`load()`) and the write path (`save()`). Task 0 widened the CHECK; until
  // this widens too, a follow-through row is refused with `attempt_expired`
  // by the module itself.
  //
  // THE WIDENING IS ASYMMETRIC AND THAT IS THE WHOLE DIFFICULTY. The stages
  // are SHARED: `begin()` starts a link and a delete at `reauth_authorize`
  // (`attempts.ts`, `input.purpose === "signin" ? "authorize" : "reauth_authorize"`),
  // and the rule is `(purpose === "signin") !== signup`. So simply adding the
  // three stages to the `signup` array admits the signin AND refuses every
  // link and every delete at a stage they legitimately occupy. The guard
  // tests below are the five cells that would break; they pass today and must
  // still pass afterwards.
  describe("PR2: consistent() admits a signin follow-through", () => {
    const SECRET = "pr2-binding-secret";

    async function insert(row: {
      purpose: "signin" | "link" | "delete";
      stage: string;
      targetProvider?: AuthProvider;
      existingProvider?: AuthProvider | null;
      sessionId?: string | null;
      verified?: boolean;
      reauthenticated?: boolean;
    }) {
      const id = crypto.randomUUID();
      const verified = row.verified ?? true;
      await pool.query(
        `INSERT INTO auth_attempts(id,binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,reauthenticated_at,verified_subject,verified_email,verified_name,expires_at)
         VALUES($1,$2,'native',$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$12,$13,now()+interval '5 min')`,
        [
          id,
          hashToken(SECRET),
          row.purpose,
          row.targetProvider ?? "apple",
          row.existingProvider ?? null,
          row.stage,
          `state-${id}`,
          `nonce-${id}`,
          row.sessionId ?? null,
          (row.reauthenticated ?? false) ? new Date() : null,
          verified ? "carried-subject" : null,
          verified ? "relay@privaterelay.appleid.com" : null,
          verified ? "Rower" : null,
        ],
      );
      return id;
    }
    const read = (id: string) => store.read(id, SECRET, "native");

    // --- Step 1: the three the design produces. Red before the widening.
    it("reads a signin at reauth_authorize, its usual provider written", async () => {
      const id = await insert({
        purpose: "signin",
        stage: "reauth_authorize",
        existingProvider: "google",
      });
      expect((await read(id)).stage).toBe("reauth_authorize");
    });

    it("reads a signin at reauth_exchanging", async () => {
      const id = await insert({
        purpose: "signin",
        stage: "reauth_exchanging",
        existingProvider: "google",
      });
      expect((await read(id)).stage).toBe("reauth_exchanging");
    });

    it("reads a signin at link_ready once a session is adopted", async () => {
      const session = await freshSession("pr2");
      const id = await insert({
        purpose: "signin",
        stage: "link_ready",
        existingProvider: "google",
        sessionId: session.id,
        reauthenticated: true,
      });
      expect((await read(id)).stage).toBe("link_ready");
    });

    // --- Step 2b: THE GUARD. Five cells the naive widening breaks, measured
    //     over 27 purpose x stage combinations. Revision 4 named two of them;
    //     the link flow's own TERMINAL stage is the third, and it is the one
    //     a careless widening would take out of production entirely.
    // ONE SESSION PER ROW, because `auth_attempts_link_session_unique` is a
    // partial unique index on `original_session_id` and permits exactly one
    // live attempt per session. Sharing one session across the three link
    // rows below raised 23505 — the real schema refusing a row a scratch
    // table carrying only the CHECK's five columns would have admitted,
    // which is precisely why these run against the migrated table.
    async function freshSession(tag: string) {
      const user = await seedUser({ googleSub: `g-${tag}`, appleSub: null });
      return seedSession(user.id);
    }

    it("still reads a link at every stage it occupies today", async () => {
      const authorize = await insert({
        purpose: "link",
        stage: "reauth_authorize",
        existingProvider: "google",
        sessionId: (await freshSession("l1")).id,
        verified: false,
      });
      expect((await read(authorize)).purpose).toBe("link");
      const exchanging = await insert({
        purpose: "link",
        stage: "reauth_exchanging",
        existingProvider: "google",
        sessionId: (await freshSession("l2")).id,
        verified: false,
      });
      expect((await read(exchanging)).stage).toBe("reauth_exchanging");
      // The link flow's own TERMINAL stage — the cell revision 4 missed, and
      // the one a naive widening would take out of production entirely.
      const ready = await insert({
        purpose: "link",
        stage: "link_ready",
        existingProvider: "google",
        sessionId: (await freshSession("l3")).id,
        reauthenticated: true,
      });
      expect((await read(ready)).stage).toBe("link_ready");
    });

    it("still reads a delete at every stage it occupies today", async () => {
      const authorize = await insert({
        purpose: "delete",
        stage: "reauth_authorize",
        targetProvider: "google",
        existingProvider: "google",
        sessionId: (await freshSession("d1")).id,
        verified: false,
      });
      expect((await read(authorize)).purpose).toBe("delete");
      const exchanging = await insert({
        purpose: "delete",
        stage: "reauth_exchanging",
        targetProvider: "google",
        existingProvider: "google",
        sessionId: (await freshSession("d2")).id,
        verified: false,
      });
      expect((await read(exchanging)).stage).toBe("reauth_exchanging");
    });

    // --- Step 4: the OTHER half. The carried identity is what the whole
    //     design rests on, so the machine must keep requiring it at exactly
    //     the stages that carry it — FOR A SIGNIN. A link at its first stage
    //     legitimately carries none, which is why the clause is
    //     purpose-qualified rather than stage-only.
    it("refuses a signin follow-through that has lost its carried identity", async () => {
      const id = await insert({
        purpose: "signin",
        stage: "reauth_exchanging",
        existingProvider: "google",
        verified: false,
      });
      await expect(read(id)).rejects.toThrow(/attempt_expired/);
    });

    // --- TASK 2: the transition itself, driven through the REAL producer
    //     (begin -> claim -> accept) rather than seeded at `confirm`, so the
    //     test starts upstream of the thing it asserts about (RF24).
    async function atConfirm() {
      const b = await signin();
      const claimed = await store.claim(b.attempt);
      const pending = await store.accept(claimed, apple);
      return pending.attempt!;
    }

    it("followThrough carries the proven identity into a second authorization", async () => {
      const seeded = await atConfirm();
      // PIN THE EXPIRY TO AN INDEPENDENT LITERAL FIRST (RF21). The attempt
      // TTL is 5 minutes, so a bug that REFRESHES `expires_at` by the same
      // 5 minutes — which is exactly what copying the sibling reauth arm
      // would do — lands within a millisecond of the original and a
      // byte-identical assertion cannot see it. Measured: that mutation left
      // this test green; the same mutation with 9 minutes reddened it. So the
      // row is moved to a value no refresh would reproduce, and ANY refresh
      // now goes red.
      await pool.query(
        "UPDATE auth_attempts SET expires_at=now()+interval '11 min' WHERE id=$1",
        [seeded.id],
      );
      const pinned = (
        await pool.query<{ expiresAt: Date }>(
          'SELECT expires_at AS "expiresAt" FROM auth_attempts WHERE id=$1',
          [seeded.id],
        )
      ).rows[0]!.expiresAt;
      // `bound()` compares the whole row, so the expected attempt has to
      // carry the pinned value too.
      const before = { ...seeded, expiresAt: pinned };
      const after = (await store.followThrough(before)).attempt!;
      expect(after.stage).toBe("reauth_authorize");
      // The carried identity SURVIVES. This is the design's whole claim.
      expect(after.verifiedSubject).toBe(before.verifiedSubject);
      expect(after.verifiedEmail).toBe(before.verifiedEmail);
      expect(after.verifiedName).toBe(before.verifiedName);
      // The usual provider is written, and it is the OTHER one.
      expect(before.targetProvider).toBe("apple");
      expect(after.existingProvider).toBe("google");
      // No session yet: this is the middle state, and the rower is away at
      // their provider for the whole of it.
      expect(after.originalSessionId).toBeNull();
      // THE CLOCK IS NOT TOUCHED HERE. Gate 0 ruling 2 refreshes it at the
      // SECOND EXCHANGE (Task 3), not at this transition — asserted as
      // byte-identical so a refresh added in the wrong place goes red.
      expect(after.expiresAt.getTime()).toBe(pinned.getTime());
      // THE REPLAY SURFACE. A second authorization reusing the first's
      // state or nonce would accept a replayed callback; assert explicitly.
      expect(after.state).not.toBe(before.state);
      expect(after.nonce).not.toBe(before.nonce);
    });

    it("followThrough refuses any stage but confirm", async () => {
      const b = await signin();
      await expect(store.followThrough(b.attempt)).rejects.toThrow(
        /attempt_expired/,
      );
      const claimed = await store.claim(b.attempt);
      await expect(store.followThrough(claimed)).rejects.toThrow(
        /attempt_expired/,
      );
    });

    // THE STAGE CHECK IS WHAT REFUSES THESE, not the purpose check — and the
    // purpose check cannot be tested, because neither authority will let a
    // link or a delete exist at `confirm` in the first place. Asserting the
    // refusal is still right; claiming it proves the purpose guard would not
    // be (RF21). The guard's own comment records that it is unreachable.
    it("followThrough refuses a link and a delete", async () => {
      const link = await insert({
        purpose: "link",
        stage: "reauth_authorize",
        existingProvider: "google",
        sessionId: (await freshSession("ft-l")).id,
        verified: false,
      });
      await expect(store.followThrough(await read(link))).rejects.toThrow(
        /attempt_expired/,
      );
      const del = await insert({
        purpose: "delete",
        stage: "reauth_authorize",
        targetProvider: "google",
        existingProvider: "google",
        sessionId: (await freshSession("ft-d")).id,
        verified: false,
      });
      await expect(store.followThrough(await read(del))).rejects.toThrow(
        /attempt_expired/,
      );
    });

    // --- TASK 3: the second exchange resolves the account, mints a session
    //     and ADOPTS it onto the attempt. Driven end to end from `begin()`
    //     so the test starts upstream of every producer it asserts about
    //     (RF24) — seeding a row at `reauth_exchanging` would skip exactly
    //     the transitions Tasks 1 and 2 built.
    async function followedThrough(googleSub: string) {
      const user = await seedUser({ googleSub, appleSub: null });
      const b = await signin();
      const claimed = await store.claim(b.attempt);
      const confirmStage = (await store.accept(claimed, apple)).attempt!;
      const carried = (await store.followThrough(confirmStage)).attempt!;
      const exchanging = await store.claim(carried);
      return { user, exchanging };
    }
    const usual = (sub: string) => ({
      sub,
      email: "rower@test",
      emailVerified: true,
      name: "Rower",
    });

    it("the second exchange adopts a session for the resolved account, keeping the carried identity", async () => {
      const { user, exchanging } = await followedThrough("g-follow");
      const result = await store.accept(exchanging, usual("g-follow"));
      const after = result.attempt!;
      expect(after.stage).toBe("link_ready");
      // The attempt now holds a session, and it belongs to the account the
      // rower just proved — not to whoever happened to be signed in.
      expect(after.originalSessionId).not.toBeNull();
      const owner = (
        await pool.query<{ userId: string }>(
          'SELECT user_id AS "userId" FROM sessions WHERE id=$1',
          [after.originalSessionId],
        )
      ).rows[0]!;
      expect(owner.userId).toBe(user.id);
      // THE CARRIED APPLE IDENTITY IS UNTOUCHED. The second exchange's
      // identity is CONSUMED, never stored — that is what makes
      // confirm-after-the-proof affordable at all.
      expect(after.verifiedSubject).toBe(apple.sub);
      expect(after.reauthenticatedAt).not.toBeNull();
    });

    it("the second exchange REFRESHES the attempt window (Gate 0 ruling 2)", async () => {
      const { exchanging } = await followedThrough("g-clock");
      // Pin to an independent literal first, so "refreshed" cannot be
      // confused with "left at a coincidentally similar value" — the trap
      // Task 2's own probe fell into.
      await pool.query(
        "UPDATE auth_attempts SET expires_at=now()+interval '11 min' WHERE id=$1",
        [exchanging.id],
      );
      const pinned = (
        await pool.query<{ expiresAt: Date }>(
          'SELECT expires_at AS "expiresAt" FROM auth_attempts WHERE id=$1',
          [exchanging.id],
        )
      ).rows[0]!.expiresAt;
      const after = (
        await store.accept(
          { ...exchanging, expiresAt: pinned },
          usual("g-clock"),
        )
      ).attempt!;
      // James, 2026-09-15: "what 300 second clock I don't see a clock".
      // The rower is about to be shown a screen they have to READ, and
      // nothing on it counts down, so the window restarts here.
      expect(after.expiresAt.getTime()).toBeLessThan(pinned.getTime());
      expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    // THE GUARD THE PLAN ASKED FOR AND I FIRST SHIPPED WITHOUT. Deleting
    // `requireAccess` from the new arm reddened ZERO tests until this
    // existed — the module's other two mints are covered, and this one was
    // not, which is exactly the census the plan told me to check (RF21).
    // Nothing else on this path calls `requireAccess`: `load()` only reaches
    // `original()` when `original_session_id` is set, and it is NULL until
    // the adopt this arm performs.
    it("the second exchange refuses an account outside the access policy, minting nothing", async () => {
      const { user, exchanging } = await followedThrough("g-denied");
      const restricted = createAttempts(
        pool,
        createAccessPolicy("restricted", "someone-else@test"),
        recordingRevoke().revoke,
      );
      const before = await pool.query(
        "SELECT id FROM sessions WHERE user_id=$1",
        [user.id],
      );
      await expect(
        restricted.accept(exchanging, usual("g-denied")),
      ).rejects.toThrow(/access_denied/);
      // NOTHING WAS MINTED. A refusal that still left a live session behind
      // would be the whole point of the guard defeated, and the transaction
      // is what makes this assertable.
      const after = await pool.query(
        "SELECT id FROM sessions WHERE user_id=$1",
        [user.id],
      );
      expect(after.rowCount).toBe(before.rowCount);
      // And the attempt did not advance.
      const row = (
        await pool.query<{ stage: string; originalSessionId: string | null }>(
          'SELECT stage, original_session_id AS "originalSessionId" FROM auth_attempts WHERE id=$1',
          [exchanging.id],
        )
      ).rows[0]!;
      expect(row.stage).toBe("reauth_exchanging");
      expect(row.originalSessionId).toBeNull();
    });

    it("the second exchange refuses a proven subject that belongs to no account", async () => {
      const { exchanging } = await followedThrough("g-known");
      await expect(
        store.accept(exchanging, usual("g-stranger")),
      ).rejects.toThrow(/account_changed/);
    });

    // TASK 0 STEP 6, which shipped unimplemented and the DBA gate measured.
    // A delete landing between the resolve and the `INSERT INTO sessions`
    // violates `sessions_user_id_users_id_fk`; before the mapping that
    // propagated as a raw DatabaseError and `failure()` rendered it 500,
    // where 409 `account_changed` is right.
    //
    // HELD TRANSACTION, NEVER A RACE (RF21). The deleter holds a lock on the
    // user row so the adopt blocks deterministically, then commits the
    // delete; the adopter unblocks into the FK violation.
    it("the second exchange answers account_changed when the account is deleted under it", async () => {
      const { user, exchanging } = await followedThrough("g-vanish");
      const holder = await pool.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          user.id,
        ]);
        const pending = store.accept(exchanging, usual("g-vanish"));
        // Let the adopt reach the lock before the row disappears.
        await new Promise((r) => setTimeout(r, 250));
        await holder.query("DELETE FROM users WHERE id=$1", [user.id]);
        await holder.query("COMMIT");
        await expect(pending).rejects.toThrow(/account_changed/);
      } finally {
        holder.release();
      }
      // AND NOTHING WAS LEFT BEHIND. The rollback takes the just-minted
      // session with it.
      const sessions = await pool.query(
        "SELECT id FROM sessions WHERE user_id=$1",
        [user.id],
      );
      expect(sessions.rowCount).toBe(0);
    });

    // THE CONTROL. Same hold, same timing, deleter releases WITHOUT deleting
    // — so the refusal above is a measurement of the delete rather than a
    // probe that throws whatever happens.
    it("the same held lock WITHOUT a delete lets the adopt through", async () => {
      const { user, exchanging } = await followedThrough("g-survive");
      const holder = await pool.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          user.id,
        ]);
        const pending = store.accept(exchanging, usual("g-survive"));
        await new Promise((r) => setTimeout(r, 250));
        await holder.query("COMMIT");
        const after = (await pending).attempt!;
        expect(after.stage).toBe("link_ready");
        expect(after.originalSessionId).not.toBeNull();
      } finally {
        holder.release();
      }
    });

    // --- THE FALSIFICATION TEST (Task 3 Steps 6-7). The design's central
    //     claim is that `finalize()` attaches UNCHANGED once the attempt has
    //     EARNED the session its `currentSessionId === originalSessionId`
    //     binding already requires. If this needs an edit to `finalize`, the
    //     claim is wrong and the plan goes back to James rather than being
    //     patched. Nothing below touches `finalize`.
    it("finalize then attaches with NO edit to finalize itself", async () => {
      const { user, exchanging } = await followedThrough("g-finalize");
      const ready = (await store.accept(exchanging, usual("g-finalize")))
        .attempt!;
      // The rower presents the session the attempt adopted — which is the
      // only session this flow ever put in their hands.
      const result = await store.finalize(ready, ready.originalSessionId!);
      expect(result.linked).toBe(true);
      const row = (
        await pool.query<{ appleSub: string | null; googleSub: string | null }>(
          'SELECT apple_sub AS "appleSub", google_sub AS "googleSub" FROM users WHERE id=$1',
          [user.id],
        )
      ).rows[0]!;
      // ONE account, BOTH subjects. The Apple one is the identity the attempt
      // carried the whole way from the first exchange.
      expect(row.googleSub).toBe("g-finalize");
      expect(row.appleSub).toBe(apple.sub);
      // And the Apple grant is written, so a later deletion has something to
      // revoke.
      const grants = await pool.query(
        "SELECT client_id FROM apple_grants WHERE user_id=$1",
        [user.id],
      );
      expect(grants.rowCount).toBe(1);
      // The attempt is consumed.
      const left = await pool.query(
        "SELECT id FROM auth_attempts WHERE id=$1",
        [ready.id],
      );
      expect(left.rowCount).toBe(0);
    });

    it("finalize still refuses a session that is not the one the attempt adopted", async () => {
      const { exchanging } = await followedThrough("g-other");
      const ready = (await store.accept(exchanging, usual("g-other"))).attempt!;
      // A live session belonging to a DIFFERENT account. Invariant 1: the
      // attach follows the PROVEN subject, never whatever cookie the client
      // happens to be holding.
      const stranger = await seedUser({
        googleSub: "g-stranger2",
        appleSub: null,
      });
      const strangerSession = await seedSession(stranger.id);
      await expect(store.finalize(ready, strangerSession.id)).rejects.toThrow(
        /account_changed/,
      );
    });

    // --- Step 6: no edit expected. If this needs one, the migration is wrong.
    // RENAMED (RF4). This asserts the two COLUMNS, which is what it always
    // did; `attemptProvider` is not exported and the title claimed a function
    // works while the body proved a row exists. What actually exercises
    // `attemptProvider` on this path is the route test that follows the
    // authorize target back to the usual provider.
    it("a follow-through row carries the usual provider beside the target", async () => {
      const id = await insert({
        purpose: "signin",
        stage: "reauth_authorize",
        targetProvider: "apple",
        existingProvider: "google",
      });
      const a = await read(id);
      expect(a.existingProvider).toBe("google");
      expect(a.targetProvider).toBe("apple");
    });
  });
});
