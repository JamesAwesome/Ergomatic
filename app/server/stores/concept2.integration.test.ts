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
import { concept2AuthAttempts } from "../db/schema.js";
import {
  createConcept2Store,
  AttemptNonceCollisionError,
  Concept2LinkConflictError,
  type Concept2Link,
} from "./concept2.js";

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
      c2Username: string | null;
    }> = {},
  ) => ({
    c2UserId: 555,
    accessToken: "at-1",
    refreshToken: "rt-1",
    expiresAt: new Date("2026-09-01T00:00:00Z"),
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
        needsReauthAt: null,
      });
      expect(row?.expiresAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    });

    it("round-trips c2Username, and stores null when the caller gives none", async () => {
      // Wave E PR2. Two users, two c2UserIds, because D1's UNIQUE on
      // `c2_user_id` is GLOBAL and every test in this describe block shares
      // one Postgres schema — `link()`'s own default (555) is already held
      // by `userA` from the first test in the file, so reusing it here
      // would 409 rather than assert anything.
      const store = createConcept2Store(db);
      const named = await createUserStore(db).createUser({
        googleSub: "c2-store-user-named",
        email: "named@c2-store.test",
        name: "N",
      });
      const anon = await createUserStore(db).createUser({
        googleSub: "c2-store-user-anon",
        email: "anon@c2-store.test",
        name: "A",
      });
      await store.upsertLink(
        named.id,
        link({ c2UserId: 608, c2Username: "jamesawesome" }),
      );
      // No `c2Username` key at all: the input field is OPTIONAL and the
      // COLUMN is required-and-nullable, which is the asymmetry the store's
      // own comment records.
      await store.upsertLink(anon.id, link({ c2UserId: 609 }));
      expect((await store.getLink(named.id))?.c2Username).toBe("jamesawesome");
      expect((await store.getLink(anon.id))?.c2Username).toBeNull();
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
      await store.upsertLink(fresh.id, link({ c2UserId: 601 }));
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
      await store.upsertLink(fresh.id, link({ c2UserId: 602 }));
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
      await store.upsertLink(fresh.id, link({ c2UserId: 603 }));

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

    // Controller ruling R2 (task-6-brief.md, carrying Task 3's ruling
    // forward): a successful refresh proves the grant lives, so "store"
    // must ALSO clear a previously-set needsReauthAt — a stale flag would
    // wrongly keep blocking uploads after the grant has already recovered.
    // Distinct from the "'store' writes..." test above, which never sets
    // the flag in the first place and so could never catch its removal.
    it("'store' clears a PREVIOUSLY-SET needsReauthAt (controller ruling R2)", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-lock-store-clears-flag",
        email: "lock-store-clears-flag@c2-store.test",
        name: "LSF",
      });
      await store.upsertLink(fresh.id, link({ c2UserId: 604 }));
      await store.withLinkLock(fresh.id, async () => ({
        action: "flagReauth" as const,
        result: "flagged",
      }));
      expect((await store.getLink(fresh.id))?.needsReauthAt).not.toBeNull();

      const result = await store.withLinkLock(fresh.id, async () => ({
        action: "store" as const,
        tokens: {
          accessToken: "at-recovered",
          refreshToken: "rt-recovered",
          expiresAt: new Date("2026-10-01T00:00:00Z"),
        },
        result: "stored",
      }));
      expect(result).toBe("stored");

      const after = await store.getLink(fresh.id);
      expect(after?.needsReauthAt).toBeNull();
      expect(after?.accessToken).toBe("at-recovered");
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
      await store.upsertLink(fresh.id, link({ c2UserId: 605 }));
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
      await store.upsertLink(
        fresh.id,
        link({ accessToken: "at-original", c2UserId: 606 }),
      );

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

  describe("createAttempt (atomic upsert) / peekAttempt / consumeAttemptFor / deleteExpiredAttempts", () => {
    const attemptCount = async (userId: string) => {
      const rows = await db.execute(
        sql`select count(*)::int as n from concept2_auth_attempts where user_id = ${userId}`,
      );
      return (rows.rows[0] as { n: number }).n;
    };

    it("a second mint for the same user REPLACES the first: one row, the new nonce, the old nonce gone", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-replace",
        email: "replace@c2-store.test",
        name: "RP",
      });
      await store.createAttempt({
        nonce: "replace-1",
        userId: fresh.id,
        surface: "web",
      });
      await store.createAttempt({
        nonce: "replace-2",
        userId: fresh.id,
        surface: "native",
      });
      expect(await attemptCount(fresh.id)).toBe(1);
      expect(await store.peekAttempt("replace-1")).toBeNull();
      expect(await store.peekAttempt("replace-2")).toStrictEqual({
        userId: fresh.id,
        surface: "native",
      });
    });

    // Design §2 / exit criterion 3: two CONCURRENT mints serialize on the
    // unique index and exactly one row survives. The biting mutation is on
    // the STATEMENT (delete + plain insert), never on the index alone —
    // dropping the index only breaks ON CONFLICT's parse.
    it("two CONCURRENT mints for one user leave exactly one live attempt", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-concurrent",
        email: "concurrent@c2-store.test",
        name: "CC",
      });
      await Promise.all([
        store.createAttempt({
          nonce: "concurrent-a",
          userId: fresh.id,
          surface: "web",
        }),
        store.createAttempt({
          nonce: "concurrent-b",
          userId: fresh.id,
          surface: "web",
        }),
      ]);
      expect(await attemptCount(fresh.id)).toBe(1);
    });

    // Fix round 1 controller ruling B: the test above is a real race
    // (`Promise.all`) but NOT a deterministic one — it depends on the two
    // calls' timing actually overlapping, and mutation testing showed the
    // statement-level delete+insert mutation does not reliably lose that
    // race on fast local Postgres (see task-2-report.md). This test forces
    // the overlap deterministically: hold an UNCOMMITTED row for the same
    // `user_id` open on one connection (an explicit, un-awaited
    // transaction) and prove the store's own `createAttempt`, issued
    // concurrently on the pool's normal path, genuinely BLOCKS on the
    // unique index rather than racing past it — then resolves correctly
    // once the first transaction commits. The pool
    // (`server/db/pool.ts:4`, `new pg.Pool({...})` with no `max` override)
    // uses node-postgres's default max of 10 connections, so the held
    // transaction and the store's own query get two separate connections
    // rather than serializing on connection acquisition itself.
    it("createAttempt genuinely BLOCKS on an uncommitted conflicting row, then resolves once it commits (deterministic race)", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-deterministic-race",
        email: "deterministic-race@c2-store.test",
        name: "DR",
      });

      let releaseHeldTx: () => void = () => {};
      const heldTxMayCommit = new Promise<void>((resolve) => {
        releaseHeldTx = resolve;
      });
      let signalHolderInserted: () => void = () => {};
      const holderInserted = new Promise<void>((resolve) => {
        signalHolderInserted = resolve;
      });

      // Connection 1: an explicit transaction that inserts a row for
      // `fresh.id` and deliberately does NOT commit until released below —
      // it holds the unique(user_id) index entry open.
      const heldTx = db.transaction(async (tx) => {
        await tx.insert(concept2AuthAttempts).values({
          nonce: "held-by-tx",
          userId: fresh.id,
          surface: "web",
        });
        signalHolderInserted();
        await heldTxMayCommit;
      });

      await holderInserted;

      // Connection 2 (the store's own normal, non-transactional path):
      // mint for the SAME user while the first transaction's row is still
      // uncommitted.
      let mintSettled = false;
      const mintPromise = store.createAttempt({
        nonce: "second-mint",
        userId: fresh.id,
        surface: "native",
      });
      void mintPromise.then(
        () => {
          mintSettled = true;
        },
        () => {
          mintSettled = true;
        },
      );

      // Give the mint every chance to have reached Postgres and be
      // blocking on the uncommitted row's unique-index entry.
      await new Promise((r) => setTimeout(r, 50));
      expect(mintSettled).toBe(false);

      releaseHeldTx();
      await heldTx;
      await mintPromise;

      expect(await attemptCount(fresh.id)).toBe(1);
      expect(await store.peekAttempt("second-mint")).toStrictEqual({
        userId: fresh.id,
        surface: "native",
      });
    });

    it("a nonce colliding with ANOTHER user's row throws AttemptNonceCollisionError and leaves that row intact", async () => {
      const store = createConcept2Store(db);
      const owner = await createUserStore(db).createUser({
        googleSub: "c2-store-user-collide-owner",
        email: "collide-owner@c2-store.test",
        name: "CO",
      });
      const other = await createUserStore(db).createUser({
        googleSub: "c2-store-user-collide-other",
        email: "collide-other@c2-store.test",
        name: "CX",
      });
      await store.createAttempt({
        nonce: "shared-nonce",
        userId: owner.id,
        surface: "web",
      });
      await expect(
        store.createAttempt({
          nonce: "shared-nonce",
          userId: other.id,
          surface: "native",
        }),
      ).rejects.toBeInstanceOf(AttemptNonceCollisionError);
      expect(await store.peekAttempt("shared-nonce")).toStrictEqual({
        userId: owner.id,
        surface: "web",
      });
      expect(await attemptCount(other.id)).toBe(0);
    });

    it("peekAttempt is advisory: it returns {userId, surface} and does NOT delete", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "peek-me",
        userId: userA,
        surface: "native",
      });
      expect(await store.peekAttempt("peek-me")).toStrictEqual({
        userId: userA,
        surface: "native",
      });
      expect(await store.peekAttempt("peek-me")).not.toBeNull();
      expect(await store.peekAttempt("never-minted")).toBeNull();
    });

    it("consumeAttemptFor with the WRONG user consumes nothing (returns null, row survives)", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "wrong-user",
        userId: userA,
        surface: "web",
      });
      expect(
        await store.consumeAttemptFor("wrong-user", userB, "web", 15 * 60_000),
      ).toBeNull();
      expect(await store.peekAttempt("wrong-user")).not.toBeNull();
    });

    it("consumeAttemptFor with the WRONG surface consumes nothing (returns null, row survives)", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "wrong-surface",
        userId: userA,
        surface: "native",
      });
      expect(
        await store.consumeAttemptFor(
          "wrong-surface",
          userA,
          "web",
          15 * 60_000,
        ),
      ).toBeNull();
      expect(await store.peekAttempt("wrong-surface")).not.toBeNull();
    });

    it("consumeAttemptFor with the right (user, surface) returns {fresh:true} once and null the second time", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "right-once",
        userId: userA,
        surface: "web",
      });
      expect(
        await store.consumeAttemptFor("right-once", userA, "web", 15 * 60_000),
      ).toStrictEqual({ fresh: true });
      expect(
        await store.consumeAttemptFor("right-once", userA, "web", 15 * 60_000),
      ).toBeNull();
      expect(await store.peekAttempt("right-once")).toBeNull();
    });

    it("a right-principal EXPIRED row is still deleted and reports fresh:false (the caller decides Expired)", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "stale-right",
        userId: userA,
        surface: "web",
      });
      // maxAgeMs 0: any row created even microseconds ago is past it.
      expect(
        await store.consumeAttemptFor("stale-right", userA, "web", 0),
      ).toStrictEqual({ fresh: false });
      expect(await store.peekAttempt("stale-right")).toBeNull();
    });

    it("deleteExpiredAttempts removes only stale rows", async () => {
      const store = createConcept2Store(db);
      const stale = await createUserStore(db).createUser({
        googleSub: "c2-store-user-stale",
        email: "stale@c2-store.test",
        name: "ST",
      });
      await store.createAttempt({
        nonce: "nonce-stale",
        userId: stale.id,
        surface: "web",
      });
      await store.createAttempt({
        nonce: "nonce-fresh",
        userId: userA,
        surface: "web",
      });
      await db.execute(
        sql`update concept2_auth_attempts set created_at = now() - interval '1 hour' where nonce = 'nonce-stale'`,
      );
      await store.deleteExpiredAttempts(15 * 60_000);
      expect(await store.peekAttempt("nonce-stale")).toBeNull();
      expect(await store.peekAttempt("nonce-fresh")).not.toBeNull();
    });
  });

  describe("upsertLink under UNIQUE(c2_user_id) (D1)", () => {
    it("a DIFFERENT user linking an already-linked Concept2 account throws Concept2LinkConflictError; both rows untouched", async () => {
      const store = createConcept2Store(db);
      const a = await createUserStore(db).createUser({
        googleSub: "c2-store-user-d1-a",
        email: "d1-a@c2-store.test",
        name: "D1A",
      });
      const b = await createUserStore(db).createUser({
        googleSub: "c2-store-user-d1-b",
        email: "d1-b@c2-store.test",
        name: "D1B",
      });
      await store.upsertLink(a.id, link({ c2UserId: 9001 }));
      await expect(
        store.upsertLink(b.id, link({ c2UserId: 9001, accessToken: "at-b" })),
      ).rejects.toBeInstanceOf(Concept2LinkConflictError);
      expect((await store.getLink(a.id))?.accessToken).toBe("at-1");
      expect(await store.getLink(b.id)).toBeNull();
    });

    it("the SAME user relinking the SAME Concept2 account is a plain replace, not a conflict", async () => {
      const store = createConcept2Store(db);
      const a = await createUserStore(db).createUser({
        googleSub: "c2-store-user-d1-same",
        email: "d1-same@c2-store.test",
        name: "D1S",
      });
      await store.upsertLink(a.id, link({ c2UserId: 9002 }));
      await store.upsertLink(
        a.id,
        link({ c2UserId: 9002, accessToken: "at-2" }),
      );
      expect((await store.getLink(a.id))?.accessToken).toBe("at-2");
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
      await store.upsertLink(fresh.id, link({ c2UserId: 607 }));
      await store.createAttempt({
        nonce: "nonce-cascade",
        userId: fresh.id,
        surface: "web",
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
