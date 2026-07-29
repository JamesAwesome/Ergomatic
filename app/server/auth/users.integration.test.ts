import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createDb, type Db } from "../db/index.js";
import { createUserStore } from "./users.js";

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
});
