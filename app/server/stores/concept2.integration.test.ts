import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { createDb, type Db } from "../db/index.js";
import { createUserStore } from "../auth/users.js";
import { createConcept2Store, type Concept2Link } from "./concept2.js";

// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD):
// the store's own contract, against real Postgres. `withLinkLock`'s
// concurrency case in particular needs real row locking (`FOR UPDATE`)
// which no in-memory fake can prove — see server/testing/fakes.ts's own
// `makeFakeConcept2Store` for the mirrored (but never lock-proving) fake.
describe("concept2 store against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
    const users = createUserStore(db);
    const a = await users.createUser({
      googleSub: "c2-store-user-a",
      email: "a@c2-store.test",
      name: "A",
    });
    const b = await users.createUser({
      googleSub: "c2-store-user-b",
      email: "b@c2-store.test",
      name: "B",
    });
    userA = a.id;
    userB = b.id;
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  const link = (
    overrides: Partial<{
      c2UserId: number;
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
      weightClass: "H" | "L";
    }> = {},
  ) => ({
    c2UserId: 555,
    accessToken: "at-1",
    refreshToken: "rt-1",
    expiresAt: new Date("2026-09-01T00:00:00Z"),
    weightClass: "H" as const,
    ...overrides,
  });

  describe("upsertLink / getLink / deleteLink", () => {
    it("upsert then get round-trips every field", async () => {
      const store = createConcept2Store(db);
      await store.upsertLink(userA, link());
      const row = await store.getLink(userA);
      expect(row).toMatchObject({
        userId: userA,
        c2UserId: 555,
        accessToken: "at-1",
        refreshToken: "rt-1",
        weightClass: "H",
        needsReauthAt: null,
      });
      expect(row?.expiresAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    });

    it("getLink returns null when no row exists", async () => {
      const store = createConcept2Store(db);
      expect(await store.getLink(userB)).toBeNull();
    });

    it("upsert twice replaces — one row per user (PK) — and clears a set needsReauthAt", async () => {
      const store = createConcept2Store(db);
      await store.upsertLink(userA, link({ c2UserId: 1 }));
      // Flag it via withLinkLock's flagReauth, then relink: a successful
      // relink IS the recovery (schema.ts's own comment).
      await store.withLinkLock(userA, async (current) => ({
        action: "flagReauth",
        result: current,
      }));
      const flagged = await store.getLink(userA);
      expect(flagged?.needsReauthAt).not.toBeNull();

      await store.upsertLink(
        userA,
        link({ c2UserId: 2, accessToken: "at-2", refreshToken: "rt-2" }),
      );
      const rows = await db.execute(
        sql`select count(*)::int as n from concept2_links where user_id = ${userA}`,
      );
      expect((rows.rows[0] as { n: number }).n).toBe(1);

      const row = await store.getLink(userA);
      expect(row).toMatchObject({
        c2UserId: 2,
        accessToken: "at-2",
        refreshToken: "rt-2",
        needsReauthAt: null,
      });
    });

    it("deleteLink is idempotent and removes the row", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-delete",
        email: "delete@c2-store.test",
        name: "D",
      });
      await store.upsertLink(fresh.id, link());
      await store.deleteLink(fresh.id);
      expect(await store.getLink(fresh.id)).toBeNull();
      // Second delete: idempotent no-op, no throw.
      await store.deleteLink(fresh.id);
      expect(await store.getLink(fresh.id)).toBeNull();
    });
  });

  describe("withLinkLock", () => {
    it("'store' writes the token pair + expiresAt and bumps updatedAt atomically", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-lock-store",
        email: "lock-store@c2-store.test",
        name: "LS",
      });
      await store.upsertLink(fresh.id, link());
      const before = await store.getLink(fresh.id);

      // Real Postgres timestamp resolution is sub-millisecond; a synchronous
      // upsert-then-lock pair can land in the SAME millisecond as `before`'s
      // updatedAt, which would make an updatedAt comparison flaky. Sleep
      // past a whole millisecond boundary first.
      await new Promise((r) => setTimeout(r, 5));

      const result = await store.withLinkLock(fresh.id, async (current) => {
        expect(current).toMatchObject({ accessToken: "at-1" });
        return {
          action: "store" as const,
          tokens: {
            accessToken: "at-new",
            refreshToken: "rt-new",
            expiresAt: new Date("2026-10-01T00:00:00Z"),
          },
          result: "stored",
        };
      });
      expect(result).toBe("stored");

      const after = await store.getLink(fresh.id);
      expect(after).toMatchObject({
        accessToken: "at-new",
        refreshToken: "rt-new",
        needsReauthAt: null,
      });
      expect(after?.expiresAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
      expect(after!.updatedAt.getTime()).toBeGreaterThan(
        before!.updatedAt.getTime(),
      );
    });

    it("'flagReauth' sets needsReauthAt and leaves tokens untouched", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-lock-flag",
        email: "lock-flag@c2-store.test",
        name: "LF",
      });
      await store.upsertLink(fresh.id, link());

      const result = await store.withLinkLock(fresh.id, async () => ({
        action: "flagReauth" as const,
        result: "flagged",
      }));
      expect(result).toBe("flagged");

      const after = await store.getLink(fresh.id);
      expect(after?.needsReauthAt).not.toBeNull();
      expect(after).toMatchObject({
        accessToken: "at-1",
        refreshToken: "rt-1",
      });
    });

    it("locks a userId with no link row and passes fn a null link", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-lock-no-row",
        email: "lock-no-row@c2-store.test",
        name: "LX",
      });

      let sawLink: Concept2Link | null | "unset" = "unset";
      const result = await store.withLinkLock(fresh.id, async (current) => {
        sawLink = current;
        return { action: "none" as const, result: "ran" };
      });

      expect(result).toBe("ran");
      expect(sawLink).toBeNull();
      // Still no row — "none" never creates one out of thin air.
      expect(await store.getLink(fresh.id)).toBeNull();
    });

    it("'none' writes nothing", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-lock-none",
        email: "lock-none@c2-store.test",
        name: "LN",
      });
      await store.upsertLink(fresh.id, link());
      const before = await store.getLink(fresh.id);

      await store.withLinkLock(fresh.id, async () => ({
        action: "none" as const,
        result: undefined,
      }));

      const after = await store.getLink(fresh.id);
      expect(after).toStrictEqual(before);
    });

    // The deterministic race (rev 1's non-deterministic guard, replaced):
    // start both calls WITHOUT awaiting, gate the FIRST fn on a manually-
    // resolved promise so it provably holds the row lock past the second
    // call's start, then assert the second call's `fn` observes the
    // FIRST's stored tokens — proof the two serialized rather than
    // interleaved on a stale read.
    it("two concurrent withLinkLock calls for the SAME user serialize", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-race",
        email: "race@c2-store.test",
        name: "R",
      });
      await store.upsertLink(fresh.id, link({ accessToken: "at-original" }));

      let releaseFirst: () => void = () => {};
      const firstMayProceed = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let signalFirstFnStarted: () => void = () => {};
      const firstFnStarted = new Promise<void>((resolve) => {
        signalFirstFnStarted = resolve;
      });

      const first = store.withLinkLock(fresh.id, async (current) => {
        signalFirstFnStarted();
        await firstMayProceed;
        return {
          action: "store" as const,
          tokens: {
            accessToken: "at-from-first",
            refreshToken: "rt-from-first",
            expiresAt: new Date("2026-11-01T00:00:00Z"),
          },
          result: current?.accessToken,
        };
      });

      await firstFnStarted;

      // Start the second call now — its own `select ... for update` must
      // block until the first transaction commits (releaseFirst() below).
      let secondSawAccessToken: string | undefined | null;
      const second = store.withLinkLock(fresh.id, async (current) => {
        secondSawAccessToken = current?.accessToken;
        return { action: "none" as const, result: undefined };
      });

      // Give the second call's SELECT ... FOR UPDATE a real chance to have
      // been issued and be blocking, before releasing the first.
      await new Promise((r) => setTimeout(r, 50));

      releaseFirst();
      const firstResult = await first;
      await second;

      expect(firstResult).toBe("at-original");
      // The second call's `fn` must see the FIRST's write — proof the lock
      // serialized rather than let the second read a stale row.
      expect(secondSawAccessToken).toBe("at-from-first");
    });
  });

  describe("createAttempt / consumeAttempt / deleteExpiredAttempts / deleteAttemptsFor", () => {
    it("consumeAttempt returns the row once and null the second time", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "nonce-once",
        userId: userA,
        weightClass: "L",
      });

      const first = await store.consumeAttempt("nonce-once", 15 * 60_000);
      expect(first).toStrictEqual({ userId: userA, weightClass: "L" });

      const second = await store.consumeAttempt("nonce-once", 15 * 60_000);
      expect(second).toBeNull();
    });

    it("consumeAttempt past maxAgeMs returns null AND deletes the row", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "nonce-expired",
        userId: userA,
        weightClass: "H",
      });

      // maxAgeMs of 0: any row created even microseconds ago is already
      // past it, without needing a real sleep or a fake clock (this store
      // has none — expiry is computed in SQL against `now()`).
      const consumed = await store.consumeAttempt("nonce-expired", 0);
      expect(consumed).toBeNull();

      const rows = await db.execute(
        sql`select count(*)::int as n from concept2_auth_attempts where nonce = 'nonce-expired'`,
      );
      expect((rows.rows[0] as { n: number }).n).toBe(0);
    });

    it("deleteExpiredAttempts removes only stale rows", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "nonce-stale",
        userId: userA,
        weightClass: "H",
      });
      await store.createAttempt({
        nonce: "nonce-fresh",
        userId: userA,
        weightClass: "H",
      });

      // Age "nonce-stale" by rewriting its createdAt directly — the store
      // itself has no way to backdate a row, and this is the one place in
      // the suite that needs a genuinely stale row without a real sleep.
      await db.execute(
        sql`update concept2_auth_attempts set created_at = now() - interval '1 hour' where nonce = 'nonce-stale'`,
      );

      await store.deleteExpiredAttempts(15 * 60_000);

      const staleRows = await db.execute(
        sql`select count(*)::int as n from concept2_auth_attempts where nonce = 'nonce-stale'`,
      );
      expect((staleRows.rows[0] as { n: number }).n).toBe(0);

      const freshRows = await db.execute(
        sql`select count(*)::int as n from concept2_auth_attempts where nonce = 'nonce-fresh'`,
      );
      expect((freshRows.rows[0] as { n: number }).n).toBe(1);
    });

    it("deleteAttemptsFor removes every attempt for that user only", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-attempts",
        email: "attempts@c2-store.test",
        name: "AT",
      });
      await store.createAttempt({
        nonce: "nonce-for-fresh-1",
        userId: fresh.id,
        weightClass: "H",
      });
      await store.createAttempt({
        nonce: "nonce-for-fresh-2",
        userId: fresh.id,
        weightClass: "H",
      });
      await store.createAttempt({
        nonce: "nonce-for-userA",
        userId: userA,
        weightClass: "H",
      });

      await store.deleteAttemptsFor(fresh.id);

      const freshRows = await db.execute(
        sql`select count(*)::int as n from concept2_auth_attempts where user_id = ${fresh.id}`,
      );
      expect((freshRows.rows[0] as { n: number }).n).toBe(0);

      const userARows = await db.execute(
        sql`select count(*)::int as n from concept2_auth_attempts where nonce = 'nonce-for-userA'`,
      );
      expect((userARows.rows[0] as { n: number }).n).toBe(1);
    });
  });

  describe("cascade on user delete", () => {
    it("deleting a user removes both concept2_links and concept2_auth_attempts rows", async () => {
      const store = createConcept2Store(db);
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "c2-store-user-cascade",
        email: "cascade@c2-store.test",
        name: "C",
      });
      await store.upsertLink(fresh.id, link());
      await store.createAttempt({
        nonce: "nonce-cascade",
        userId: fresh.id,
        weightClass: "H",
      });

      await db.execute(sql`delete from users where id = ${fresh.id}`);

      const linkRows = await db.execute(
        sql`select count(*)::int as n from concept2_links where user_id = ${fresh.id}`,
      );
      expect((linkRows.rows[0] as { n: number }).n).toBe(0);

      const attemptRows = await db.execute(
        sql`select count(*)::int as n from concept2_auth_attempts where user_id = ${fresh.id}`,
      );
      expect((attemptRows.rows[0] as { n: number }).n).toBe(0);
    });
  });
});
