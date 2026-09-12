import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startPostgres } from "./testing/postgres.js";
import request from "supertest";
import type pg from "pg";
import { createApp } from "./app.js";
import { checkDb, createPool } from "./db/pool.js";
import { baseDeps } from "./testDeps.js";

describe("health against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;

  beforeAll(async () => {
    container = await startPostgres();
    pool = createPool(container.getConnectionUri());
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("reports db:true with the database up", async () => {
    const app = createApp(baseDeps({ checkDb: () => checkDb(pool) }));
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, db: true, version: "dev" });
  });

  it("reports db:false once the database is gone", async () => {
    await container.stop();
    const app = createApp(baseDeps({ checkDb: () => checkDb(pool) }));
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toStrictEqual({ ok: false, db: false, version: "dev" });
  });
});
