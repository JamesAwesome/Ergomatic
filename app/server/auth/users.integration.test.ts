import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createDb, type Db } from "../db/index.js";
import { createUserStore } from "./users.js";
import { createSessionStore } from "./sessions.js";

describe("user store against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let store: ReturnType<typeof createUserStore>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
    store = createUserStore(db);
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("returns null for an unknown google sub", async () => {
    expect(await store.findByGoogleSub("nope")).toBeNull();
  });

  it("creates a user and finds it by google sub", async () => {
    const created = await store.createUser({
      googleSub: "sub-1",
      email: "a@x.com",
      name: "A",
    });
    expect(created).toMatchObject({
      googleSub: "sub-1",
      email: "a@x.com",
      name: "A",
    });
    const found = await store.findByGoogleSub("sub-1");
    expect(found).toMatchObject({
      id: created.id,
      email: "a@x.com",
      name: "A",
    });
  });

  it("updateProfile overwrites email and name for that user only", async () => {
    await store.createUser({ googleSub: "sub-2", email: "b@y.com", name: "B" });
    const target = await store.createUser({
      googleSub: "sub-3",
      email: "c@z.com",
      name: "C",
    });
    await store.updateProfile(target.id, "c2@z.com", "C2");
    const updated = await store.findByGoogleSub("sub-3");
    expect(updated).toMatchObject({ email: "c2@z.com", name: "C2" });
    const untouched = await store.findByGoogleSub("sub-2");
    expect(untouched).toMatchObject({ email: "b@y.com", name: "B" });
  });

  // Wave A PR 1 (spec 2026-09-12-lift-identity-design.md §3.3, RF24): a user
  // with NO Google identity is a user. The test STARTS at the store's
  // create — the only production insert path into `users` — and asserts at
  // the one id-keyed read path in the app, `resolveSession`'s join. Before
  // migration 0030 the insert itself is refused (NOT NULL); before the
  // store's type change the literal does not compile.
  it("a sub-less user is created, given a session, and resolved by id — the identity column is not the identity", async () => {
    const created = await store.createUser({
      googleSub: null,
      email: "no-google@x.com",
      name: "No Google",
    });
    expect(created.googleSub).toBeNull();
    const sessionStore = createSessionStore(db);
    const { token } = await sessionStore.createSession(created.id);
    const resolved = await sessionStore.resolveSession(token);
    expect(resolved?.user).toStrictEqual({
      id: created.id,
      email: "no-google@x.com",
      name: "No Google",
    });
    // A NULL sub is unfindable by sub, by SQL semantics — and that is right:
    // the lookup keyed on a Google identity has nothing to look up.
    expect(await store.findByGoogleSub("no-google@x.com")).toBeNull();
  });

  it("two sub-less users coexist — the unique constraint treats NULLs as distinct (Postgres, NULLS DISTINCT)", async () => {
    const a = await store.createUser({
      googleSub: null,
      email: "a@n.com",
      name: "A",
    });
    const b = await store.createUser({
      googleSub: null,
      email: "b@n.com",
      name: "B",
    });
    expect(a.id).not.toBe(b.id);
  });

  it("the sub key cannot be OMITTED — null is the spelling for absent (RF33)", () => {
    // Type-level: green only while `NewUser` requires the key. Never awaited;
    // the body is the compile assertion.
    const build = () =>
      // @ts-expect-error googleSub is a required key (null means absent)
      store.createUser({ email: "x@x.com", name: "X" });
    expect(typeof build).toBe("function");
  });
});
