import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { createDb } from "../db/index.js";
import { startPostgres } from "../testing/postgres.js";
import { createAttempts } from "./attempts.js";
import { createSessionStore } from "./sessions.js";
import { createUserStore } from "./users.js";

describe("front-door transactions against Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let store: ReturnType<typeof createAttempts>;
  let sessions: ReturnType<typeof createSessionStore>;
  let users: ReturnType<typeof createUserStore>;
  beforeAll(async () => {
    container = await startPostgres();
    const c = createDb(container.getConnectionUri());
    pool = c.pool;
    await migrate(c.db, { migrationsFolder: "drizzle" });
    store = createAttempts(pool);
    sessions = createSessionStore(c.db);
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
    const claim = createAttempts(claimPool).claim(b.attempt);
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
});
