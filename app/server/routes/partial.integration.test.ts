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
import { createSessionStore } from "../auth/sessions.js";
import { createUserStore } from "../auth/users.js";
import { createArticleReadsStore } from "../stores/articleReads.js";
import { createBaselinesStore } from "../stores/baselines.js";
import {
  createLogsStore,
  PARTIAL_ENDED_BY,
  type LogStep,
} from "../stores/logs.js";
import { createPlanStateStore } from "../stores/planState.js";
import { createPreferencesStore } from "../stores/preferences.js";
import { createTestHistoryStore } from "../stores/testHistory.js";
import { createWorkoutsStore } from "../stores/workouts.js";
import {
  buildStoredSummary,
  historyChipWord,
  PARTIAL_CLOSE_REASONS,
  partialCloseReason,
  type StoredLog,
} from "../../src/log/storedSummary.js";
import type { RecentLog } from "../../src/api/useRecentLogs.js";
import type { Stores } from "./data.js";

// Door spec (2026-09-02) §1.3, Task 4: THE LIST AND THE DETAIL SCREEN
// AGREE BY CONSTRUCTION.
//
// The list projection derives `partial` in SQL (`stores/logs.ts`'s
// `LOG_LIST_COLUMNS`) because it deliberately does not carry `steps`; the
// detail screen evaluates the same four clauses in TypeScript
// (`src/log/storedSummary.ts`'s `partialCloseReason`). Two independent
// implementations of one rule is exactly the drift class RF11 names, so
// this suite runs the TS predicate as the ORACLE over the detail row and
// asserts the SQL boolean equals it, row for row. The predicate is
// IMPORTED, never hand-copied here — a copy would be a third mirror and
// would agree with whichever side it was copied from.
//
// RF24 (every gate seeding PAST the producer): every row here is created
// through `POST /api/logs`, the supported producer, and read back through
// BOTH `GET /api/logs?limit=…` and `GET /api/logs/:id`. Nothing is
// inserted straight into the table and no response is hand-built.
//
// WHY A SERVER TEST IMPORTS FROM `src/`: `server/stores/logs.ts:99` states
// the standing rule that server code never imports from the client tree,
// and the shipped code still obeys it (`LOG_LIST_COLUMNS` shares no module
// with `storedSummary.ts`). This is a TEST — the one place the two sides
// must meet, since a gate that re-implements either side proves only that
// it matches itself. `tsconfig.server.build.json` excludes `*.test.ts`, so
// nothing from `src/` reaches the emitted server. `tsconfig.server.json`'s
// `include` gained `src/vite-env.d.ts` for this file: the type-only hop
// `storedSummary.ts` -> `api/useRecentLogs.ts` -> `api.ts` reaches
// `import.meta.env`, which without vite's ambient types is
// `TS2339: Property 'env' does not exist on type 'ImportMeta'`. `e2e/
// tsconfig.json` already solves the identical problem the identical way.

// Two intervals, of which the SECOND was never reached: no `actualSource`
// at all (`logDraft.ts`'s own "unambiguous against the row-local
// discriminant" shape). That is clause 3, and it is what makes a row
// PARTIAL rather than merely short.
const MEASURED_STEP: LogStep = {
  label: "500m @ 2:04.0",
  targetSplit: 124,
  actualSplit: 118.4,
  actualSource: "pm5",
  actualSeconds: 300,
  actualMeters: 1267,
  meters: 500,
};
const UNREACHED_STEP: LogStep = {
  label: "500m @ 2:04.0",
  targetSplit: 124,
  meters: 500,
};
const PARTIAL_STEPS: LogStep[] = [MEASURED_STEP, UNREACHED_STEP];

const DEVICE = "PM5 432331249";

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

describe("GET /api/logs: the list's SQL `partial` and the detail screen's predicate agree (door spec §1.3)", () => {
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
        allowlist: new Set(["partial@log.test"]),
        nativeVerifier: async () => ({
          sub: "partial-sub",
          email: "partial@log.test",
          emailVerified: true,
          name: "Partial Rower",
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

  // A planned connected row. `steps: []` needs the FREE-ROW pair instead
  // (`routes/data.ts:1633`, "steps must be a non-empty array" otherwise),
  // which is why the two Just Row shapes below override the title pair.
  function body(overrides: Record<string, unknown> = {}) {
    return {
      workoutId: null,
      workoutTitle: "Sea Fret",
      workoutType: "AT",
      held: null,
      pain: null,
      notes: null,
      source: "pm5",
      deviceName: DEVICE,
      steps: PARTIAL_STEPS,
      advancesPlan: false,
      ...overrides,
    };
  }

  const freeRow = (overrides: Record<string, unknown> = {}) =>
    body({
      workoutTitle: "Just Row",
      workoutType: null,
      steps: [],
      ...overrides,
    });

  // Review round 1, Important: the row-by-row agreement below reaches only
  // the close reasons it SEEDS — `rower`, `link-lost`, `finished` and
  // `null`. Dropping `program-dropped`, `program-failed` or `interrupted`
  // from the server's `PARTIAL_ENDED_BY` therefore left every gate in the
  // repo green while History went silent on a row whose detail screen
  // reads `LEFT UNFINISHED · N of M intervals measured`. Seeding three
  // more rows would only push the hole to the next member added.
  //
  // This is the whole-array equality instead: the two trees' allowlists,
  // compared as ordered lists, in the one test file that imports both. It
  // is what actually holds them equal — the row cases hold the RULE equal,
  // this holds its DOMAIN equal.
  it("the server's PARTIAL_ENDED_BY and the client's PARTIAL_CLOSE_REASONS are the same five values, in the same order", () => {
    expect([...PARTIAL_ENDED_BY]).toStrictEqual([...PARTIAL_CLOSE_REASONS]);
  });

  it("the list's SQL `partial` equals the client predicate over the detail row, for every seeded shape", async () => {
    const bearer = await bearerToken();
    const seeded = [
      // PARTIAL: a connected planned row the rower stopped, with an
      // interval never reached.
      { name: "partial", body: body({ endedBy: "rower" }) },
      // NOT partial: a connected Just Row has no plan to be partial
      // against (clause 3 has no unmeasured step to find in `[]`).
      { name: "just row", body: freeRow({ endedBy: "rower" }) },
      // NOT partial: `finished` is outside clause 4's allowlist. A short
      // step on a finished row is MEASUREMENT LOSS, not a stopped piece.
      { name: "finished short", body: body({ endedBy: "finished" }) },
      // NOT partial, and the row `coalesce(..., false)` exists for: a
      // legacy pm5 row with no close reason at all.
      { name: "legacy null close", body: body() },
      // DELTA verdict M-3: the divergence class is one field to the LEFT
      // of the boolean. This row is NOT partial and the detail screen
      // still says LINK LOST, so a boolean-only agreement would pass
      // while History stayed silent about it.
      { name: "link-lost just row", body: freeRow({ endedBy: "link-lost" }) },
    ];

    const created: { name: string; id: string }[] = [];
    for (const { name, body: sent } of seeded) {
      const res = await request(app)
        .post("/api/logs")
        .set("Authorization", bearer)
        .send(sent);
      expect(res.status, `${name}: ${JSON.stringify(res.body)}`).toBe(201);
      created.push({ name, id: res.body.id as string });
    }

    const detailById = new Map<string, StoredLog>();
    for (const { id } of created) {
      const got = await request(app)
        .get(`/api/logs/${id}`)
        .set("Authorization", bearer);
      expect(got.status).toBe(200);
      detailById.set(id, got.body as StoredLog);
    }

    const list = await request(app)
      .get("/api/logs?limit=100")
      .set("Authorization", bearer);
    expect(list.status).toBe(200);
    // Typed as the CLIENT's own view of this response, not a local shape:
    // `RecentLog.partial` is a required boolean and `RecentLog.endedBy` is
    // required-and-nullable, so this suite fails to compile if either
    // declaration and the projection ever disagree about presence.
    const listRows = list.body as Pick<
      RecentLog,
      "id" | "partial" | "endedBy"
    >[];
    const listById = new Map(listRows.map((r) => [r.id, r]));

    // One comparison, not a loop of labelled assertions: the ORACLE array
    // is built from the DETAIL rows through the client's own predicate and
    // the actual array from the LIST rows, so a failure prints which
    // NAMED row disagreed and on which of the three facts.
    //
    // `partialType` rides along because a legacy row must read `false` and
    // never `null` — SQL's `true and null` is NULL, and the client type
    // says boolean.
    //
    // `speaks` is the WORD, not only the boolean (DELTA verdict M-3). The
    // two surfaces carry different-LENGTH forms of one close reason
    // (`PROGRAM DROPPED` vs `THE MONITOR DROPPED THE PROGRAM`), so what
    // must agree is that they SPEAK on the same rows — a boolean-only
    // agreement passes while `link-lost just row` says LINK LOST on the
    // detail screen and nothing in History.
    const fromList = created.map(({ name, id }) => {
      const listRow = listById.get(id)!;
      return {
        name,
        partial: listRow.partial,
        partialType: typeof listRow.partial,
        speaks: historyChipWord(listRow) !== undefined,
      };
    });
    const fromDetail = created.map(({ name, id }) => {
      const detail = detailById.get(id)!;
      return {
        name,
        partial: partialCloseReason(detail) !== undefined,
        partialType: "boolean",
        speaks: buildStoredSummary(detail).closeLine !== undefined,
      };
    });
    expect(fromList).toStrictEqual(fromDetail);

    // The divergence this row exists for, named explicitly: NOT partial,
    // and both surfaces still say it.
    const linkLost = created.find((c) => c.name === "link-lost just row")!;
    expect(listById.get(linkLost.id)!.partial).toBe(false);
    expect(historyChipWord(listById.get(linkLost.id)!)).toBe("LINK LOST");
    expect(buildStoredSummary(detailById.get(linkLost.id)!).closeLine).toBe(
      "LINK LOST · the app lost the monitor",
    );

    // And the positive side, so this suite cannot pass by every row being
    // `false`: the partial row carries the chip word AND the detail's own
    // longer line, with the `N of M` suffix clause 3 guarantees.
    const partial = created.find((c) => c.name === "partial")!;
    expect(listById.get(partial.id)!.partial).toBe(true);
    expect(historyChipWord(listById.get(partial.id)!)).toBe("STOPPED EARLY");
    expect(buildStoredSummary(detailById.get(partial.id)!).closeLine).toBe(
      "STOPPED EARLY · 1 of 2 intervals measured",
    );
  });
});
