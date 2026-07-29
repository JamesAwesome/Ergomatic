import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import type pg from "pg";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { createDb, type Db } from "../db/index.js";
import { createSessionStore } from "./sessions.js";
import { createUserStore } from "./users.js";

describe("native sign-in lifecycle against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
    app = createApp(
      baseDeps({
        sessions: createSessionStore(db),
        users: createUserStore(db),
        allowlist: new Set(["n@x.com"]),
        nativeVerifier: async () => ({
          sub: "native-1",
          email: "n@x.com",
          emailVerified: true,
          name: "Native Rower",
        }),
      }),
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("mints, uses, and revokes a bearer session", async () => {
    const minted = await request(app)
      .post("/api/auth/native")
      .send({ idToken: "stub" });
    expect(minted.status).toBe(200);
    const bearer = `Bearer ${minted.body.token}`;

    const me = await request(app).get("/api/me").set("Authorization", bearer);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("n@x.com");

    const out = await request(app)
      .post("/api/auth/signout")
      .set("Authorization", bearer);
    expect(out.status).toBe(204);

    expect(
      (await request(app).get("/api/me").set("Authorization", bearer)).status,
    ).toBe(401);
  });
});
