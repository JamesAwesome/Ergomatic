import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
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
import { createLogsStore } from "../stores/logs.js";
import { createPlanStateStore } from "../stores/planState.js";
import { createPreferencesStore } from "../stores/preferences.js";
import { createTestHistoryStore } from "../stores/testHistory.js";
import { createWorkoutsStore } from "../stores/workouts.js";
import { createConcept2Store } from "../stores/concept2.js";
import { createC2Client } from "../concept2/client.js";
import type { Stores } from "./data.js";

// Wave E PR1 Task 7 (task-7-brief.md): the RF24 seam test (agent briefing
// RF24 — "every test seeding PAST the producer"). Every other Concept2 test
// in this repo either mocks the API row before it renders (none exist yet
// here) or drives the router against a FAKE `Concept2Store`/`C2Client`
// (`routes/concept2.test.ts`, Task 6). This file is the ONE test that
// starts upstream of every producer in the chain and never fakes any of
// them: a real Postgres container, the real `createDataRouter`'s
// `POST /api/logs` (the REAL producer of the row this feature reads), the
// real `createConcept2Store` (real `FOR UPDATE` locking), and a real
// `createC2Client` with ONLY the module boundary this repo can't control
// (`fetch` itself) stubbed. Every stubbed response body below is
// transcribed verbatim from a committed capture (agent briefing, "Specs and
// briefs are evidence-backed"; CLAUDE.md RF16) — the same two documents
// `concept2/client.test.ts` (Task 4) already cites:
//   RAW   = docs/monitor/c2-crossconnect-2026-09/raw-output.txt
//   PROBE = docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md
//
// This is ALSO the mount-order regression test (controller ruling R1,
// task-7-brief.md): the callback in test 1 below is driven with NO
// Authorization header and no cookie at all — if `createConcept2Router`
// ever lands after `routes/data.ts`'s own `router.use("/api", requireUser)`
// (the data router mount in `app.ts`), that request 401s instead of
// completing the link. Mutation probe (a) in the task report flips exactly
// this ordering and shows this assertion turn red.

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// RAW lines 1-26 (result id 85557), verbatim — same transcript
// `concept2/client.test.ts`'s own `RAW_201_BODY` cites.
const RAW_201_BODY = {
  data: {
    id: 85557,
    user_id: 2211,
    date: "2026-08-25 17:42:03",
    timezone: "America/New_York",
    date_utc: "2026-08-25 21:42:03",
    distance: 935,
    type: "rower",
    time: 2548,
    time_formatted: "6:14.8",
    workout_type: "VariableInterval",
    source: "James Morelli",
    weight_class: "H",
    verified: false,
    ranked: false,
    comments: null,
    privacy: "partners",
    stroke_data: false,
    rest_distance: 274,
    rest_time: 1200,
    stroke_rate: 24,
    real_time: null,
  },
};

// RAW, the probe-dedup "B: exact repost" transcript, verbatim.
const RAW_409_BODY = { message: "Duplicate Result", id: 85560, status: 409 };

// PROBE A: {access_token,token_type,expires_in:604800,refresh_token}. Real
// token bytes are redacted-to-length in the source (agent briefing: tokens
// never appear in logs); substituted here with placeholder strings of the
// documented lengths, same substitution `concept2/client.test.ts`'s own
// `PROBE_200_BODY` already makes — not an invented wire fact.
function tokenBody(accessToken: string, refreshToken: string) {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 604800,
    refresh_token: refreshToken,
  };
}

// `client.ts`'s own `fetchMe` contract (`data.id`), same minimal-but-real
// shape `concept2/client.test.ts`'s own "200 {data:{id}} -> c2UserId" test
// uses — no committed transcript names a SUCCESS body for this endpoint
// (only the PROBE's 401 failure shape is a real capture), so this is the
// documented contract's own minimum, carrying PR0's own c2UserId (2211).
function meBody(c2UserId: number) {
  return { data: { id: c2UserId } };
}

// Task 5's own fixture (mapping.test.ts / concept2.test.ts's
// FINISHED_LOG_INPUT), transcribed from a real capture — reused verbatim
// here as the POST /api/logs body (agent briefing: realistic fixtures),
// converted to the wire's JSON string dates.
function finishedLogBody(extra: Record<string, unknown> = {}) {
  return {
    workoutId: null,
    workoutTitle: "Steady State",
    workoutType: "AT",
    held: null,
    pain: null,
    notes: null,
    steps: [{ label: "2000 m" }],
    deviceName: "PM5 432331249 Row",
    endedBy: "finished",
    workSeconds: 254.8,
    workMeters: 935,
    restSeconds: 120,
    restMeters: 274,
    machineSummary: { avgStrokeRate: 24, workoutType: 8 },
    completedAt: "2026-08-25T21:42:03.110Z",
    tz: "America/New_York",
    ...extra,
  };
}

const EXPECTED_PAYLOAD = {
  type: "rower",
  date: "2026-08-25 17:42:03",
  timezone: "America/New_York",
  distance: 935,
  time: 2548,
  weight_class: "H",
  rest_time: 1200,
  rest_distance: 274,
  stroke_rate: 24,
  workout_type: "VariableInterval",
};

describe("Concept2 broker: the RF24 seam (real Postgres, real router, real C2 client, fetch stubbed)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });

    const stores: Stores = {
      baselines: createBaselinesStore(db),
      workouts: createWorkoutsStore(db),
      logs: createLogsStore(db),
      planState: createPlanStateStore(db),
      preferences: createPreferencesStore(db),
      testHistory: createTestHistoryStore(db),
      articleReads: createArticleReadsStore(db),
    };

    fetchMock = vi.fn();
    const client = createC2Client(
      {
        baseUrl: "https://log-dev.concept2.test",
        clientId: "seam-client-id",
        clientSecret: "seam-client-secret",
        redirectUri: "https://ergomatic.example/api/concept2/callback",
      },
      fetchMock,
    );

    app = createApp(
      baseDeps({
        sessions: createSessionStore(db),
        users: createUserStore(db),
        allowlist: new Set([
          "seam-rf24@c2seam.test",
          "seam-409@c2seam.test",
          "seam-singleuse@c2seam.test",
          "seam-refresh@c2seam.test",
        ]),
        // Keyed on the idToken itself (see `signIn` below) so each test
        // gets its own isolated user/rows without a real JWKS.
        nativeVerifier: async (idToken: string) => ({
          sub: idToken,
          email: `${idToken}@c2seam.test`,
          emailVerified: true,
          name: idToken,
        }),
        stores,
        concept2: {
          available: () => true,
          store: createConcept2Store(db),
          client,
        },
      }),
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  // The four tests share one `app`/`fetchMock` (a fresh Postgres container
  // per file, per the other integration tests' own precedent), but each
  // test's own assertions on `fetchMock.mock.calls` need call history
  // scoped to that test alone.
  beforeEach(() => {
    fetchMock.mockReset();
  });

  async function signIn(
    idToken: string,
  ): Promise<{ bearer: string; userId: string }> {
    const minted = await request(app)
      .post("/api/auth/native")
      .send({ idToken });
    expect(minted.status).toBe(200);
    return {
      bearer: `Bearer ${minted.body.token}`,
      userId: minted.body.user.id,
    };
  }

  async function mintState(bearer: string): Promise<string> {
    const res = await request(app)
      .post("/api/concept2/connect")
      .set("Authorization", bearer)
      .send({ weightClass: "H" });
    expect(res.status).toBe(200);
    const url = new URL(res.body.authorizeUrl as string);
    return url.searchParams.get("state")!;
  }

  it("the seam: log -> mint -> callback (NO session cookie) -> upload -> stored row carries the C2 identity -> the captured wire payload matches PR0's accepted shape field-for-field", async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody("at-rf24", "rt-rf24"));
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, meBody(2211));
      }
      if (url.endsWith("/api/users/me/results")) {
        return jsonResponse(201, RAW_201_BODY);
      }
      throw new Error(`unexpected fetch url in this test: ${url}`);
    });

    const { bearer } = await signIn("seam-rf24");

    // The REAL producer: a full POST /api/logs, the same fixture body Task
    // 5/6's own tests use.
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(finishedLogBody());
    expect(created.status).toBe(201);
    const logId = created.body.id as string;

    const state = await mintState(bearer);

    // THE mount-order regression assertion: deliberately no Authorization
    // header and no cookie on this request at all.
    const callback = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(callback.status).toBe(200);
    expect(callback.type).toBe("text/html");

    const uploaded = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "America/New_York" });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toStrictEqual({ resultId: 85557 });

    const stored = await request(app)
      .get(`/api/logs/${logId}`)
      .set("Authorization", bearer);
    expect(stored.status).toBe(200);
    expect(stored.body.c2ResultId).toBe(85557);
    expect(stored.body.c2UserId).toBe(2211);

    const resultsCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/api/users/me/results"),
    )!;
    const [, init] = resultsCall;
    const capturedPayload = JSON.parse((init as RequestInit).body as string);
    expect(capturedPayload).toStrictEqual(EXPECTED_PAYLOAD);
  });

  // RF25: a 409 whose body names the colliding id is recorded durably
  // (route's own comment on the duplicate branch), so a row that
  // collides on its FIRST send shows "sent" on the next read rather than
  // unsent forever.
  it("a 409 (duplicate) from Concept2 is durably recorded on the row (real Postgres)", async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody("at-409", "rt-409"));
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, meBody(2211));
      }
      if (url.endsWith("/api/users/me/results")) {
        return jsonResponse(409, RAW_409_BODY);
      }
      throw new Error(`unexpected fetch url in this test: ${url}`);
    });

    const { bearer } = await signIn("seam-409");
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(finishedLogBody());
    expect(created.status).toBe(201);
    const logId = created.body.id as string;

    const state = await mintState(bearer);
    const callback = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(callback.status).toBe(200);

    const uploaded = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "America/New_York" });
    expect(uploaded.status).toBe(409);
    expect(uploaded.body).toStrictEqual({
      error: "duplicate",
      c2ResultId: 85560,
    });

    const stored = await request(app)
      .get(`/api/logs/${logId}`)
      .set("Authorization", bearer);
    expect(stored.body.c2ResultId).toBe(85560);
    expect(stored.body.c2UserId).toBe(2211);
  });

  it("single-use through the real store: a second callback with the same state+code is rejected (attempt already consumed)", async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody("at-single", "rt-single"));
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, meBody(2211));
      }
      throw new Error(`unexpected fetch url in this test: ${url}`);
    });

    const { bearer } = await signIn("seam-singleuse");
    const state = await mintState(bearer);

    const first = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(first.status).toBe(200);

    const second = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(second.status).toBe(400);
    // Only ONE exchange ever reached the wire — the second request's
    // single-use guard fired at the store, before any fetch call.
    expect(
      fetchMock.mock.calls.filter((call) =>
        String(call[0]).endsWith("/oauth/access_token"),
      ),
    ).toHaveLength(1);
  });

  it("refresh path: an expired stored token refreshes (real store row) and the rotated pair lands before the post", async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody("at-rotated", "rt-rotated"));
      }
      if (url.endsWith("/api/users/me/results")) {
        return jsonResponse(201, RAW_201_BODY);
      }
      throw new Error(`unexpected fetch url in this test: ${url}`);
    });

    const { bearer, userId } = await signIn("seam-refresh");
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(finishedLogBody());
    expect(created.status).toBe(201);
    const logId = created.body.id as string;

    // Seed an already-linked, EXPIRED grant directly through the real
    // store — this test's own producer for the link row, distinct from
    // (and never routed through) the mint/callback flow the other three
    // tests exercise.
    const concept2Store = createConcept2Store(db);
    await concept2Store.upsertLink(userId, {
      c2UserId: 2211,
      accessToken: "stale-access-token",
      refreshToken: "stale-refresh-token",
      expiresAt: new Date(Date.now() - 1000),
      weightClass: "H",
    });

    const uploaded = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "America/New_York" });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toStrictEqual({ resultId: 85557 });

    const link = await concept2Store.getLink(userId);
    expect(link?.accessToken).toBe("at-rotated");
    expect(link?.refreshToken).toBe("rt-rotated");
    expect(link?.accessToken).not.toBe("stale-access-token");
  });
});
