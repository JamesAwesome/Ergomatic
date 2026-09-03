import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import request from "supertest";
import type pg from "pg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { createDb, type Db } from "../db/index.js";
import { createSessionStore } from "../auth/sessions.js";
import { createUserStore } from "../auth/users.js";
import { createArticleReadsStore } from "../stores/articleReads.js";
import { createBaselinesStore } from "../stores/baselines.js";
import { createLogsStore, type LogStep } from "../stores/logs.js";
import { createPlanStateStore } from "../stores/planState.js";
import { createPreferencesStore } from "../stores/preferences.js";
import { createTestHistoryStore } from "../stores/testHistory.js";
import { createWorkoutsStore } from "../stores/workouts.js";
import { deriveLogSource } from "../logSource.js";
import type { Stores } from "./data.js";

// Just Row unconnected spec (2026-09-02), §Mechanism stored shape (c);
// exit criteria 3b (the validator, at the authority) and 3c (the migration,
// on real Postgres). Same harness shape as `freeRow.integration.test.ts`:
// the HTTP boundary in, the GET out, a real container migrated through
// `drizzle/` (RF24 — every case here starts UPSTREAM of the producer).

const PM5_STEP: LogStep = {
  label: "Work",
  targetSplit: 120,
  actualSplit: 118.4,
  actualSource: "pm5",
  actualSeconds: 300,
  actualMeters: 1267,
};
const STOPWATCH_STEP: LogStep = {
  label: "Work",
  targetSplit: 120,
  actualSplit: 121,
  actualSource: "stopwatch",
};
const ASSUMED_STEP: LogStep = {
  label: "Work",
  targetSplit: 120,
  actualSplit: 120,
  actualSource: "assumed",
};

function makeStores(db: Db): Stores {
  return {
    baselines: createBaselinesStore(db),
    workouts: createWorkoutsStore(db),
    logs: createLogsStore(db),
    planState: createPlanStateStore(db),
    preferences: createPreferencesStore(db),
    testHistory: createTestHistoryStore(db),
    articleReads: createArticleReadsStore(db),
  };
}

describe("POST/GET /api/logs: source is required (v0.35.0 sunset), refused when it contradicts the body (criterion 3b)", () => {
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
        allowlist: new Set(["source@log.test"]),
        nativeVerifier: async () => ({
          sub: "source-sub",
          email: "source@log.test",
          emailVerified: true,
          name: "Source Rower",
        }),
        stores: makeStores(db),
      }),
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  async function bearerToken(): Promise<string> {
    const minted = await request(app)
      .post("/api/auth/native")
      .send({ idToken: "stub" });
    expect(minted.status).toBe(200);
    return `Bearer ${minted.body.token}`;
  }

  function body(overrides: Record<string, unknown> = {}) {
    return {
      workoutId: null,
      workoutTitle: "Steady State",
      workoutType: "AT",
      held: null,
      pain: null,
      notes: null,
      steps: [ASSUMED_STEP],
      advancesPlan: false,
      ...overrides,
    };
  }

  async function postThenGet(bearer: string, sent: Record<string, unknown>) {
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(sent);
    expect(created.status).toBe(201);
    const got = await request(app)
      .get(`/api/logs/${created.body.id}`)
      .set("Authorization", bearer);
    expect(got.status).toBe(200);
    // `deviceName` widened for the no-reading legs below (door PR A):
    // GET /api/logs/:id already returns it, this helper just hadn't typed
    // it before now.
    return got.body as { source: string; deviceName: string | null };
  }

  // The v0.35.0 SUNSET (ROADMAP: "`source` derive-when-absent SUNSET"):
  // a body with no `source` was DERIVED for builds <=811 (three cases
  // stood here, one per member); at the tag after the column shipped it
  // became a 400 naming the field, with nothing persisted — the same
  // refusal shape as the contradiction cases below. The derivation rule
  // itself survives only as migration 0020's backfill (criterion 3c).
  it("absent source: 400 naming the field, and nothing persisted", async () => {
    const bearer = await bearerToken();
    const before = await request(app)
      .get("/api/logs?limit=100")
      .set("Authorization", bearer);
    const res = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(body({ deviceName: "PM5 432331249 Row", steps: [PM5_STEP] }));
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({
      error: "source is required",
      field: "source",
    });
    const after = await request(app)
      .get("/api/logs?limit=100")
      .set("Authorization", bearer);
    expect(after.body).toStrictEqual(before.body);
  });

  it("the list projection carries source too (projection parity; no list consumer reads it yet)", async () => {
    const bearer = await bearerToken();
    // One row per member, each stated by the client (the only way a row
    // gets a `source` since the sunset).
    for (const sent of [
      body({
        source: "pm5",
        deviceName: "PM5 432331249 Row",
        steps: [PM5_STEP],
      }),
      body({ source: "timer", steps: [STOPWATCH_STEP] }),
      body({ source: "manual" }),
      body({ source: "no-reading" }),
    ]) {
      await postThenGet(bearer, sent);
    }
    const list = await request(app)
      .get("/api/logs?limit=100")
      .set("Authorization", bearer);
    expect(list.status).toBe(200);
    const sources = (list.body as { source: string }[]).map((r) => r.source);
    expect(sources).toStrictEqual(
      expect.arrayContaining(["pm5", "timer", "manual", "no-reading"]),
    );
    expect(sources.every((s) => typeof s === "string")).toBe(true);
  });

  // The new-build path: the client states the fact and the body carries
  // it — including the one shape the derivation gets WRONG on purpose,
  // the time-only Just Row (`timer` with `steps: []`).
  it("posted source is stored as posted when the body agrees: timer with empty steps (the time-only Just Row) is NOT re-derived to manual", async () => {
    const bearer = await bearerToken();
    const row = await postThenGet(
      bearer,
      body({
        workoutTitle: "Just Row",
        workoutType: null,
        steps: [],
        source: "timer",
        timeSeconds: 754,
      }),
    );
    expect(row.source).toBe("timer");
  });

  it.each([
    [
      "pm5 without a deviceName",
      { source: "pm5", steps: [PM5_STEP] },
      "source pm5 requires a deviceName",
    ],
    [
      "timer with a deviceName",
      {
        source: "timer",
        deviceName: "PM5 432331249 Row",
        steps: [STOPWATCH_STEP],
      },
      "source timer requires deviceName to be absent",
    ],
    [
      "manual with a deviceName",
      { source: "manual", deviceName: "PM5 432331249 Row" },
      "source manual requires deviceName to be absent",
    ],
  ])(
    "refuses a contradiction — %s — with a 400 naming the field, and persists nothing",
    async (_name, overrides, message) => {
      const bearer = await bearerToken();
      const before = await request(app)
        .get("/api/logs?limit=100")
        .set("Authorization", bearer);
      const res = await request(app)
        .post("/api/logs")
        .set("Authorization", bearer)
        .send(body(overrides));
      expect(res.status).toBe(400);
      expect(res.body).toStrictEqual({ error: message, field: "source" });
      const after = await request(app)
        .get("/api/logs?limit=100")
        .set("Authorization", bearer);
      expect(after.body).toHaveLength(before.body.length);
    },
  );

  // Every ordinary timer save: the Timer door logs a TIME phase as
  // `actualSource: "assumed"` (`src/session/logDraft.ts`), so a time-only
  // workout closed on the Timer posts `timer` with no stopwatch step at all.
  // The spec's draft steps clause 400'd this (Task 4's e2e caught it);
  // the fact stands as posted — the SAME body backfilled `manual` under
  // migration 0020's rule, which is why the column exists.
  it("posted timer with all-assumed steps and no device is stored as timer (the ordinary Timer-door save)", async () => {
    const bearer = await bearerToken();
    const row = await postThenGet(
      bearer,
      body({ source: "timer", steps: [ASSUMED_STEP], timeSeconds: 1200 }),
    );
    expect(row.source).toBe("timer");
  });

  // Door PR A (spec `docs/superpowers/specs/2026-09-02-door-partial-design.md`
  // §2.4): the fourth member. A connected arrival that measured nothing
  // carries no `deviceName` — the same biconditional as `timer`/`manual`.
  it("posted source no-reading with no deviceName is stored as posted (the connected arrival that measured nothing)", async () => {
    const bearer = await bearerToken();
    const row = await postThenGet(bearer, {
      workoutTitle: "No reading",
      steps: [],
      source: "no-reading",
    });
    expect(row.source).toBe("no-reading");
    expect(row.deviceName).toBeNull();
  });

  it("no-reading WITH a deviceName is a 400 naming the field (the biconditional)", async () => {
    const bearer = await bearerToken();
    const res = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(body({ source: "no-reading", deviceName: "PM5 432331249" }));
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({
      error: "source no-reading requires deviceName to be absent",
      field: "source",
    });
  });

  it.each([["bogus"], [null], [""], [1]])(
    "refuses a non-member source (%j) with a 400 naming the field",
    async (source) => {
      const bearer = await bearerToken();
      const res = await request(app)
        .post("/api/logs")
        .set("Authorization", bearer)
        .send(body({ source }));
      expect(res.status).toBe(400);
      expect(res.body).toStrictEqual({
        error: "source must be one of pm5, timer, manual, no-reading",
        field: "source",
      });
    },
  );
});

// CRITERION 3c — THE MIGRATION ITSELF, ON REAL POSTGRES, WITH ROWS THAT
// PREDATE IT. Drizzle's migrator applies every journal entry whose `when`
// is newer than the last row in `drizzle.__drizzle_migrations`
// (`node_modules/drizzle-orm/pg-core/dialect.js`, `migrate()`), so a copy
// of `drizzle/` with the journal truncated at 0019 stages the exact
// pre-0020 schema; rows are inserted there — no `source` column exists to
// fill — and a SECOND copy truncated at 0020 then applies 0020 alone. This
// is a genuine pre-migration state, not a re-run of the CASE against
// post-migration rows.
//
// The second step used to migrate from the real `drizzle/` folder, which
// applied 0020 alone only for as long as 0020 was the newest migration in
// the repo. PR1.75a's 0021 (2026-09-02) made that false and turned this
// into a failing test about someone else's migration; capping the second
// folder at 0020 restores "0020 alone" as a property of THIS test rather
// than of the repo's migration count.
describe("migration 0020 backfills every pre-existing row and leaves the column NOT NULL (criterion 3c)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let staged: string;
  let stagedThrough20: string;
  let userId: string;
  // Facts captured in beforeAll and asserted in the first `it` below — the
  // staging is only a proof if these hold.
  const staging = {
    lastStagedTag: "",
    appliedTag: "",
    sourceColumnsBefore: -1,
    appliedBefore: -1,
    appliedAfter: -1,
  };
  const ids: Record<
    "device" | "deviceWithStopwatch" | "stopwatch" | "assumed" | "free",
    string
  > = {
    device: "",
    deviceWithStopwatch: "",
    stopwatch: "",
    assumed: "",
    free: "",
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    // Stage 0000..0019: the same SQL files, the journal cut before 0020.
    const journal = JSON.parse(
      fs.readFileSync("drizzle/meta/_journal.json", "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    const stage = (prefix: string, entries: { idx: number; tag: string }[]) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
      fs.mkdirSync(path.join(dir, "meta"));
      fs.writeFileSync(
        path.join(dir, "meta", "_journal.json"),
        JSON.stringify({ ...journal, entries }),
      );
      for (const e of entries) {
        fs.copyFileSync(`drizzle/${e.tag}.sql`, path.join(dir, `${e.tag}.sql`));
      }
      return dir;
    };
    const before = journal.entries.filter((e) => e.idx <= 19);
    const through20 = journal.entries.filter((e) => e.idx <= 20);
    staging.lastStagedTag = before.at(-1)?.tag ?? "";
    staging.appliedTag = through20.at(-1)?.tag ?? "";
    staged = stage("ergomatic-0019-", before);
    stagedThrough20 = stage("ergomatic-0020-", through20);
    await migrate(db, { migrationsFolder: staged });

    const columnsBefore = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'session_logs' and column_name = 'source'",
    );
    staging.sourceColumnsBefore = columnsBefore.rowCount ?? -1;

    const user = await pool.query<{ id: string }>(
      "insert into users (google_sub, email, name) values ('mig-sub', 'mig@log.test', 'Mig') returning id",
    );
    userId = user.rows[0].id;
    async function insert(
      deviceName: string | null,
      steps: LogStep[],
    ): Promise<string> {
      const r = await pool.query<{ id: string }>(
        "insert into session_logs (user_id, workout_title, workout_type, steps, device_name) values ($1, $2, 'AT', $3::jsonb, $4) returning id",
        [userId, "Pre-0020 row", JSON.stringify(steps), deviceName],
      );
      return r.rows[0].id;
    }
    ids.device = await insert("PM5 432331249 Row", [PM5_STEP]);
    // The ORDER of the CASE arms is only observable on a row that carries
    // BOTH a device and a stopwatch step — the connected session saved
    // through the manual door, the spec's own "knowingly wrong" row. The
    // device arm must win, as the read-side guess did; a probe that swaps
    // the arms goes red here and nowhere else.
    ids.deviceWithStopwatch = await insert("PM5 432331249 Row", [
      STOPWATCH_STEP,
    ]);
    ids.stopwatch = await insert(null, [STOPWATCH_STEP]);
    ids.assumed = await insert(null, [ASSUMED_STEP]);
    // The one shape production already holds from v0.32.0: PR 1's free
    // row, `steps: []` and no device.
    ids.free = await insert(null, []);

    // Now 0020, and only 0020 — from the folder capped at 0020, so a
    // later migration in `drizzle/` cannot join this step.
    const applied = async () =>
      Number(
        (
          await pool.query<{ n: string }>(
            "select count(*)::text as n from drizzle.__drizzle_migrations",
          )
        ).rows[0].n,
      );
    staging.appliedBefore = await applied();
    await migrate(db, { migrationsFolder: stagedThrough20 });
    staging.appliedAfter = await applied();
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
    fs.rmSync(staged, { recursive: true, force: true });
    fs.rmSync(stagedThrough20, { recursive: true, force: true });
  });

  async function sourceOf(id: string): Promise<string> {
    const r = await pool.query<{ source: string }>(
      "select source from session_logs where id = $1",
      [id],
    );
    return r.rows[0].source;
  }

  it("staged exactly 0000..0019 (no source column), then applied 0020 alone", () => {
    expect(staging).toStrictEqual({
      lastStagedTag: "0019_happy_virginia_dare",
      appliedTag: "0020_wooden_millenium_guard",
      sourceColumnsBefore: 0,
      appliedBefore: 20,
      appliedAfter: 21,
    });
  });

  it("`steps` is jsonb, so the backfill's jsonb_array_elements needs no cast", async () => {
    const r = await pool.query<{ data_type: string }>(
      "select data_type from information_schema.columns where table_name = 'session_logs' and column_name = 'steps'",
    );
    expect(r.rows[0].data_type).toBe("jsonb");
  });

  it("rows inserted BEFORE 0020 read back pm5 / pm5 / timer / manual / manual after it", async () => {
    expect(await sourceOf(ids.device)).toBe("pm5");
    expect(await sourceOf(ids.deviceWithStopwatch)).toBe("pm5");
    expect(await sourceOf(ids.stopwatch)).toBe("timer");
    expect(await sourceOf(ids.assumed)).toBe("manual");
    expect(await sourceOf(ids.free)).toBe("manual");
  });

  it("the column is NOT NULL: Postgres itself refuses an insert without source (not only the route)", async () => {
    await expect(
      pool.query(
        "insert into session_logs (user_id, workout_title, workout_type, steps) values ($1, 'No source', 'AT', '[]'::jsonb)",
        [userId],
      ),
    ).rejects.toMatchObject({
      code: "23502",
      column: "source",
    });
  });

  it("the column is the enum: Postgres refuses a value outside pm5 | timer | manual | no-reading", async () => {
    await expect(
      pool.query(
        "insert into session_logs (user_id, workout_title, workout_type, steps, source) values ($1, 'Bad source', 'AT', '[]'::jsonb, 'bogus')",
        [userId],
      ),
    ).rejects.toMatchObject({ code: "22P02" });
  });

  // The TS rule and the SQL rule are two copies of one inference, and
  // they must not drift while both exist. This runs the migration FILE's
  // own CASE text (not a transcription) as a SELECT over the five staged
  // rows (by id, so a row leaked by a failing sibling cannot turn a
  // disagreement into a count mismatch) and checks it against
  // `deriveLogSource` on the same evidence — and against what 0020
  // actually stored.
  it("the migration's own CASE and deriveLogSource agree on every row", async () => {
    const file = fs
      .readdirSync("drizzle")
      .find((f) => f.startsWith("0020_") && f.endsWith(".sql"));
    expect(file).toBeDefined();
    const text = fs.readFileSync(`drizzle/${file}`, "utf8");
    const match = /SET "source" = (CASE[\s\S]*?END);/.exec(text);
    expect(match).not.toBeNull();
    const caseExpr = match![1];
    const rows = await db.execute<{
      id: string;
      device_name: string | null;
      steps: LogStep[];
      source: string;
      derived: string;
    }>(
      sql.raw(
        `select id, device_name, steps, source, (${caseExpr}) as derived from session_logs where id in (${Object.values(
          ids,
        )
          .map((id) => `'${id}'`)
          .join(", ")})`,
      ),
    );
    expect(rows.rows).toHaveLength(5);
    for (const row of rows.rows) {
      const ts = deriveLogSource({
        deviceName: row.device_name,
        steps: row.steps,
      });
      expect({
        id: row.id,
        sql: row.derived,
        stored: row.source,
      }).toStrictEqual({
        id: row.id,
        sql: ts,
        stored: ts,
      });
    }
  });
});
