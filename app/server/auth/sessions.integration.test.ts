import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startPostgres } from "../testing/postgres.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { createDb, type Db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import {
  SESSION_TTL_MS,
  createSessionStore,
  hashToken,
  noRevoke,
} from "./sessions.js";
import { createAccessPolicy } from "./accessPolicy.js";

describe("session lifecycle against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let store: ReturnType<typeof createSessionStore>;
  let userId: string;

  beforeAll(async () => {
    container = await startPostgres();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
    store = createSessionStore(db, createAccessPolicy("public", ""), noRevoke);
    const [u] = await db
      .insert(users)
      .values({ googleSub: "sub-1", email: "a@x.com", name: "A" })
      .returning();
    userId = u.id;
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("creates and resolves a session; token is stored only as a hash", async () => {
    const { token } = await store.createSession(userId);
    const resolved = await store.resolveSession(token);
    expect(resolved?.user).toStrictEqual({
      id: userId,
      email: "a@x.com",
      name: "A",
    });
    const rows = await db.select().from(sessions);
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
  });

  it("rolling-refreshes a session past its halfway point", async () => {
    const { token } = await store.createSession(userId);
    const past = new Date(Date.now() + SESSION_TTL_MS / 2 - 60_000);
    await db.update(sessions).set({ expiresAt: past });
    const resolved = await store.resolveSession(token);
    expect(resolved?.refreshed).toBe(true);
    expect(resolved!.expiresAt.getTime()).toBeGreaterThan(past.getTime());
  });

  it("rejects expired sessions and sweeps them", async () => {
    const { token } = await store.createSession(userId);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, hashToken(token)));
    expect(await store.resolveSession(token)).toBeNull();
    await store.sweepExpired();
    const rows = await db.select().from(sessions);
    expect(rows.every((r) => r.expiresAt.getTime() > Date.now() - 1000)).toBe(
      true,
    );
  });

  it("sweepExpired deletes expired rows and retains live rows", async () => {
    const expired = await store.createSession(userId);
    const live = await store.createSession(userId);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, hashToken(expired.token)));

    await store.sweepExpired();

    const rows = await db
      .select({ tokenHash: sessions.tokenHash })
      .from(sessions);
    expect(rows).not.toContainEqual({ tokenHash: hashToken(expired.token) });
    expect(rows).toContainEqual({ tokenHash: hashToken(live.token) });
  });

  it("deleteSession signs out exactly that session", async () => {
    const { token } = await store.createSession(userId);
    await store.deleteSession(token);
    expect(await store.resolveSession(token)).toBeNull();
  });

  it("two users resolve to distinct identities", async () => {
    const [b] = await db
      .insert(users)
      .values({ googleSub: "sub-2", email: "b@y.com", name: "B" })
      .returning();
    const sa = await store.createSession(userId);
    const sb = await store.createSession(b.id);
    expect((await store.resolveSession(sa.token))?.user.email).toBe("a@x.com");
    expect((await store.resolveSession(sb.token))?.user.email).toBe("b@y.com");
  });

  it("denies a stored session before refresh, retains it, and a reloaded policy can read it again", async () => {
    const { token } = await store.createSession(userId);
    const oldExpiry = new Date(Date.now() + SESSION_TTL_MS / 2 - 60_000);
    await db
      .update(sessions)
      .set({ expiresAt: oldExpiry })
      .where(eq(sessions.tokenHash, hashToken(token)));

    const denied = createSessionStore(
      db,
      createAccessPolicy("restricted", "someone-else@x.com"),
      noRevoke,
    );
    expect(await denied.resolveSession(token)).toBeNull();
    const retained = await db
      .select({ expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
    expect(retained[0]?.expiresAt).toStrictEqual(oldExpiry);
    expect(
      (await db.select().from(users)).some((user) => user.id === userId),
    ).toBe(true);

    const reallowed = createSessionStore(
      db,
      createAccessPolicy("restricted", " A@X.COM "),
      noRevoke,
    );
    expect((await reallowed.resolveSession(token))?.refreshed).toBe(true);
  });
});
