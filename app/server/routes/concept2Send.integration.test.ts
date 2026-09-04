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
import { eligibilityFailure } from "../concept2/mapping.js";
import type { Stores } from "./data.js";
// The CLIENT's own predicates and its own wire PARSER, imported across the
// tree boundary — the precedent is `routes/partial.integration.test.ts`,
// whose header explains the exception to "server code never imports from
// the client tree": this file is a TEST, and its entire purpose is to hold
// the two trees' views of one seam equal. A hand-copied predicate here
// would be a third mirror and would agree with whichever side it was
// copied from.
//
// `normalizeLink` matters as much as the predicates. Every other gate that
// reads `GET /api/concept2/link` compares its keys against the DEV PROBE's
// interface (`scripts/webauth-contract.test.ts`), which no rower ever sees;
// the product reader is `normalizeLink`, and casting the route's body to
// `Concept2Link` here would let the route rename a key while every suite
// stayed green and the card silently rendered `account #2211` forever.
import { isSendable, sentResultId } from "../../src/log/concept2Send.js";
import { normalizeLink } from "../../src/api/useConcept2Link.js";
import type { StoredLog } from "../../src/log/storedSummary.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function tokenBody() {
  return {
    access_token: "at-send-seam",
    token_type: "Bearer",
    expires_in: 604800,
    refresh_token: "rt-send-seam",
  };
}

function meBody(c2UserId: number, username: string) {
  return { data: { id: c2UserId, username } };
}

// RAW lines 1-26 shape (docs/monitor/c2-crossconnect-2026-09/
// raw-output.txt): a 201 nests the new result under `data`.
function created201(id: number, c2UserId: number) {
  return { data: { id, user_id: c2UserId } };
}

// The 409's colliding id is TOP LEVEL, not under `data` — read off
// `concept2/client.ts`'s own `postResult` before writing this, and the same
// shape `concept2.integration.test.ts` transcribes as `RAW_409_BODY`. A
// `{message, data:{id}}` body would make `postResult` return `c2_error`
// instead of `duplicate`, and the durable-recovery write this test exists
// to gate would never happen — the test would prove only that a malformed
// 409 is refused.
function duplicate409(id: number) {
  return { message: "Duplicate Result", id, status: 409 };
}

// One page of the rower's own Concept2 results, shaped as
// `client.fetchResults` reads it. TWO rows, and the first one is load-
// bearing: a `skierg` piece CARRYING a class, which is the shape
// Concept2's own Get Results example publishes and which
// `pickDeclaredWeightClass` must skip (`CLASS_BEARING_RESULT_TYPES`). Its
// class is deliberately the OPPOSITE of the rower's real declaration, so a
// mutant that stops skipping non-rower types answers "H" and every
// assertion below that names "L" goes red.
function declarationListBody(declared: "H" | "L") {
  return {
    data: [
      {
        id: 85401,
        type: "skierg",
        weight_class: declared === "L" ? "H" : "L",
        date_utc: "2026-08-21 10:00:30",
        date: "2026-08-21 06:00:30",
      },
      {
        id: 85400,
        type: "rower",
        weight_class: declared,
        date_utc: "2026-08-20 10:00:30",
        date: "2026-08-20 06:00:30",
      },
    ],
  };
}

const WEB_REDIRECT_URI = "https://ergomatic.example/api/concept2/callback";
const LOGBOOK_BASE_URL = "https://log-dev.concept2.test";

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
    source: "pm5",
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

// D1 makes `concept2_links.c2_user_id` UNIQUE for the whole database, and
// every test in this file shares one container. Each linking test therefore
// gets its OWN id — the sibling file's header states the same rule, and
// reusing one literal across three `it()`s is exactly how a later test's
// callback answers 409 Already linked instead of the outcome it asserts.
const C2_USER_SENT = 700339;
const C2_USER_DUP = 700340;
const C2_USER_FIRST = 700341;
const C2_USER_SECOND = 700342;
// Ruling (i)'s three seam cases. Distinct ids for the same reason: the
// UNIQUE on `c2_user_id` is GLOBAL and every test in this file shares one
// Postgres schema (the same trap
// `server/stores/concept2.integration.test.ts` documents).
const C2_USER_DECLARED = 700343;
const C2_USER_PROFILE = 700344;
const C2_USER_NOWEIGHT = 700345;

describe("the Concept2 send seam: the route writes, the log detail reads (RF24)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let sessions: ReturnType<typeof createSessionStore>;
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
        baseUrl: LOGBOOK_BASE_URL,
        clientId: "send-seam-client-id",
        clientSecret: "send-seam-client-secret",
      },
      fetchMock,
    );
    sessions = createSessionStore(db);

    app = createApp(
      baseDeps({
        sessions,
        users: createUserStore(db),
        allowlist: new Set([
          "send-eligibility@c2send.test",
          "send-sent@c2send.test",
          "send-declared@c2send.test",
          "send-weight@c2send.test",
          "send-noweight@c2send.test",
          "send-dup@c2send.test",
          "send-relink@c2send.test",
        ]),
        nativeVerifier: async (idToken: string) => ({
          sub: idToken,
          email: `${idToken}@c2send.test`,
          emailVerified: true,
          name: idToken,
        }),
        stores,
        concept2: {
          available: () => true,
          store: createConcept2Store(db),
          client,
          webRedirectUri: WEB_REDIRECT_URI,
          logbookBaseUrl: LOGBOOK_BASE_URL,
        },
      }),
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

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

  /** The SUPPORTED producer of a link: a real mint plus a real callback
   *  exchange, never a direct `store.upsertLink`. */
  async function linkAccount(opts: {
    userId: string;
    c2UserId: number;
    username: string;
  }): Promise<void> {
    const { token } = await sessions.createSession(opts.userId);
    const cookie = `erg_session=${token}`;
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody());
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, meBody(opts.c2UserId, opts.username));
      }
      throw new Error(`unexpected fetch url while linking: ${url}`);
    });
    const minted = await request(app)
      .post("/api/concept2/connect")
      .set("Cookie", cookie)
      // Empty body: ruling (i) removed the only field this mint took, and
      // the route no longer refuses one that omits it.
      .send({});
    expect(minted.status).toBe(200);
    const done = await request(app)
      .get(
        `/api/concept2/callback?state=${String(minted.body.state)}&code=abc123`,
      )
      .set("Cookie", cookie);
    expect(done.status).toBe(200);
    fetchMock.mockReset();
  }

  /** The SUPPORTED producer of a row: `POST /api/logs`, never an insert. */
  async function postLog(
    bearer: string,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(finishedLogBody(over));
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  /** The row as the log-detail screen reads it. A CAST is the honest shape
   *  here and not a shortcut: `src/log/FromTheLog.tsx` casts this exact
   *  response (`(await res.json()) as StoredLog`) — there is no runtime
   *  parser on this door to import, so a parser invented here would be a
   *  fourth mirror. The keys are still load-bearing, because every
   *  assertion below runs the CLIENT's `sentResultId`/`isSendable` over
   *  the result: a route that renamed `c2UserId` reaches those predicates
   *  as `undefined` and the derived answer goes wrong, which is what the
   *  assertions name. */
  async function readRow(bearer: string, logId: string): Promise<StoredLog> {
    const detail = await request(app)
      .get(`/api/logs/${logId}`)
      .set("Authorization", bearer);
    expect(detail.status).toBe(200);
    return detail.body as StoredLog;
  }

  /** The link as the CARD reads it: through the production parser, off the
   *  real route's body. */
  async function readLink(bearer: string) {
    const res = await request(app)
      .get("/api/concept2/link")
      .set("Authorization", bearer);
    expect(res.status).toBe(200);
    return normalizeLink(res.body);
  }

  it("the eligibility predicate the CLIENT renders on and the one the SERVER enforces agree, row for row", async () => {
    // Every shape goes in through POST /api/logs — the SUPPORTED producer,
    // never a direct insert — and comes back through GET /api/logs/:id, so
    // both predicates read a row the database actually stored.
    const { bearer } = await signIn("send-eligibility");
    const shapes: { name: string; over: Record<string, unknown> }[] = [
      { name: "pm5 finished with both work columns", over: {} },
      { name: "pm5 finished, no workSeconds", over: { workSeconds: null } },
      { name: "pm5 finished, no workMeters", over: { workMeters: null } },
      { name: "pm5 ended by the rower", over: { endedBy: "rower" } },
      { name: "pm5 link lost", over: { endedBy: "link-lost" } },
      { name: "pm5 interrupted", over: { endedBy: "interrupted" } },
      { name: "pm5 program failed", over: { endedBy: "program-failed" } },
      { name: "pm5 program dropped", over: { endedBy: "program-dropped" } },
      { name: "pm5 with no close reason at all", over: { endedBy: null } },
      {
        name: "timer",
        over: { source: "timer", deviceName: undefined, endedBy: null },
      },
      {
        name: "manual",
        over: { source: "manual", deviceName: undefined, endedBy: null },
      },
      {
        name: "no-reading",
        over: { source: "no-reading", deviceName: undefined, endedBy: null },
      },
    ];

    const rows: StoredLog[] = [];
    for (const { over } of shapes) {
      rows.push(await readRow(bearer, await postLog(bearer, over)));
    }

    // Ordered lists, so a disagreement names the SHAPE rather than just
    // failing a boolean. Both sides are computed from the same stored row.
    const client = rows.map(
      (row, i) => `${shapes[i]!.name}: ${String(isSendable(row))}`,
    );
    const server = rows.map(
      (row, i) =>
        `${shapes[i]!.name}: ${String(
          eligibilityFailure({
            source: row.source,
            endedBy: row.endedBy ?? null,
            workSeconds: row.workSeconds,
            workMeters: row.workMeters,
          }) === null,
        )}`,
    );
    expect(client).toStrictEqual(server);

    // Pinned as an INDEPENDENT literal as well as compared: without it,
    // dropping the same clause from BOTH predicates would keep the
    // equality green and prove nothing (the shape
    // `webauth-contract.test.ts` already guards against on its key list).
    expect(client).toStrictEqual([
      "pm5 finished with both work columns: true",
      "pm5 finished, no workSeconds: false",
      "pm5 finished, no workMeters: false",
      "pm5 ended by the rower: false",
      "pm5 link lost: false",
      "pm5 interrupted: false",
      "pm5 program failed: false",
      "pm5 program dropped: false",
      "pm5 with no close reason at all: false",
      "timer: false",
      "manual: false",
      "no-reading: false",
    ]);
  });

  it("a row sent through the real route reads back as SENT to the client's own predicate", async () => {
    // STARTS UPSTREAM of the writer: nothing below is seeded into the
    // column, and no response is hand-built.
    const { bearer, userId } = await signIn("send-sent");
    await linkAccount({
      userId,
      c2UserId: C2_USER_SENT,
      username: "jamesawesome",
    });
    const logId = await postLog(bearer);
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("/api/users/me/results?")) {
        return jsonResponse(200, declarationListBody("H"));
      }
      return jsonResponse(201, created201(339, C2_USER_SENT));
    });
    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });
    expect(sent.status).toBe(200);

    const row = await readRow(bearer, logId);
    // The link comes from the ROUTE, through the PRODUCTION PARSER: a
    // hand-written `Concept2Link` here would let the two sides disagree
    // about `c2UserId` and this test would never notice, and a bare cast
    // would let a renamed key reach the card as `undefined`.
    const link = await readLink(bearer);
    expect(link.c2Username).toBe("jamesawesome");
    expect(link.logbookBaseUrl).toBe(LOGBOOK_BASE_URL);
    expect(sentResultId(row, link)).toBe(339);
  });

  it("the class the ROWER DECLARED on Concept2 is the class Concept2 gets back (ruling i, RF24)", async () => {
    // THE seam ruling (i) creates: a value that entered the process from
    // Concept2's own RESULTS LIST leaves it on Concept2's results endpoint,
    // over the real route, the real store and real Postgres. Every other
    // gate on this path seeds past one end or the other.
    //
    // The declaration is "L" and the profile is HEAVY (8200 = 82 kg, over
    // the men's 7500), so the two producers DISAGREE. That is deliberate:
    // a mutant that skips the declaration and derives from the profile
    // sends "H" and this assertion goes red. A fixture where both
    // producers agreed would let that mutant pass, which is RF21's first
    // smell.
    const { bearer, userId } = await signIn("send-declared");
    await linkAccount({
      userId,
      c2UserId: C2_USER_DECLARED,
      username: "jamesawesome",
    });
    const logId = await postLog(bearer);
    const posted: unknown[] = [];
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/users/me/results?")) {
        // The measured list shape (observation 27): `data` is an array of
        // results, newest first by DATE, each carrying `weight_class`. The
        // newest entry is a SKIERG piece carrying the opposite class, so
        // this row also gates the "a class Concept2 never required is not
        // a declaration" half.
        return jsonResponse(200, declarationListBody("L"));
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, {
          data: {
            id: C2_USER_DECLARED,
            username: "jamesawesome",
            weight: 8200,
            gender: "M",
          },
        });
      }
      posted.push(JSON.parse(String(init?.body)));
      return jsonResponse(201, created201(340, C2_USER_DECLARED));
    });

    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });

    expect(sent.status).toBe(200);
    expect(sent.body.weightClassSource).toBe("declaration");
    expect(posted).toStrictEqual([
      expect.objectContaining({ weight_class: "L" }),
    ]);
  });

  it("falls back to our derivation over the real wire when the rower has declared nothing (ruling i, RF24)", async () => {
    // THE seam ruling (i) creates, and the only test in this PR that
    // starts at a Concept2 PROFILE shape and ends at the bytes on
    // Concept2's results endpoint. Every other gate on this path seeds
    // past one end or the other: `mapping.test.ts` calls the pure
    // function, `concept2.test.ts` stubs `client.fetchMe` above the wire,
    // and the client tests mock the whole route.
    //
    // The profile is a LIGHT one on purpose. A heavy fixture would let
    // M40e (derive `"H"` unconditionally) pass, which is RF21's first
    // smell: a mutation that agrees with the fixture it is probed against.
    const { bearer, userId } = await signIn("send-weight");
    await linkAccount({
      userId,
      c2UserId: C2_USER_PROFILE,
      username: "jamesawesome",
    });
    const logId = await postLog(bearer);
    const posted: unknown[] = [];
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/users/me/results?")) {
        // A rower with no declaration on file: an empty page, which is the
        // shape a brand-new Concept2 account returns.
        return jsonResponse(200, { data: [] });
      }
      if (url.endsWith("/api/users/me")) {
        // 7000 = 70.00 kg per the doc example this repo quotes verbatim in
        // `server/concept2/mapping.ts` — under the 7500 men's threshold,
        // so the derived class is `L`.
        return jsonResponse(200, {
          data: {
            id: C2_USER_PROFILE,
            username: "jamesawesome",
            weight: 7000,
            gender: "M",
          },
        });
      }
      posted.push(JSON.parse(String(init?.body)));
      return jsonResponse(201, created201(340, C2_USER_PROFILE));
    });

    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });

    expect(sent.status).toBe(200);
    expect(sent.body.weightClassSource).toBe("profile");
    expect(posted).toStrictEqual([
      expect.objectContaining({ weight_class: "L" }),
    ]);
  });

  it("a profile with no weight stops the send BEFORE Concept2's results endpoint is touched", async () => {
    // The negative half at the same layer. The assertion that matters is
    // the empty `posted` array: a 422 that had already POSTed would have
    // written a row to a permanent third-party record carrying a class we
    // invented, and the status alone would not have said so.
    const { bearer, userId } = await signIn("send-noweight");
    await linkAccount({
      userId,
      c2UserId: C2_USER_NOWEIGHT,
      username: "jamesawesome",
    });
    const logId = await postLog(bearer);
    const posted: unknown[] = [];
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/users/me/results?")) {
        return jsonResponse(200, { data: [] });
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, {
          data: {
            id: C2_USER_NOWEIGHT,
            username: "jamesawesome",
            weight: null,
            gender: "M",
          },
        });
      }
      posted.push(JSON.parse(String(init?.body)));
      return jsonResponse(201, created201(341, C2_USER_NOWEIGHT));
    });

    const refused = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });

    expect(refused.status).toBe(422);
    expect(refused.body).toStrictEqual({
      error: "no_weight_class",
      reason: "no_weight",
    });
    expect(posted).toStrictEqual([]);
    // And the row is untouched, so the client still renders the OFFER
    // rather than a half-sent state.
    expect(
      sentResultId(await readRow(bearer, logId), await readLink(bearer)),
    ).toBeNull();
  });

  it("a 409 duplicate reaches the client's predicate as SENT too, because the route records it (RF25)", async () => {
    // The durable-recovery path: the route writes the colliding id BEFORE
    // responding, so the next mount reads SENT off the row. Drop that write
    // and the rower is told "already there" once and then shown an unsent
    // row forever.
    const { bearer, userId } = await signIn("send-dup");
    await linkAccount({
      userId,
      c2UserId: C2_USER_DUP,
      username: "dupuser",
    });
    const logId = await postLog(bearer);
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("/api/users/me/results?")) {
        return jsonResponse(200, declarationListBody("H"));
      }
      return jsonResponse(409, duplicate409(512));
    });
    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });
    expect(sent.status).toBe(409);
    expect(sent.body.error).toBe("duplicate");

    const row = await readRow(bearer, logId);
    const link = await readLink(bearer);
    expect(sentResultId(row, link)).toBe(512);
  });

  it("a row accepted by a DIFFERENT Concept2 account reads back as NOT sent", async () => {
    // Spec anchor F8. The stored row is unchanged; what changed is which
    // account is live, and the link-out would point at a row this grant
    // cannot open.
    const { bearer, userId } = await signIn("send-relink");
    await linkAccount({
      userId,
      c2UserId: C2_USER_FIRST,
      username: "first",
    });
    const logId = await postLog(bearer);
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("/api/users/me/results?")) {
        return jsonResponse(200, declarationListBody("H"));
      }
      return jsonResponse(201, created201(339, C2_USER_FIRST));
    });
    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });
    expect(sent.status).toBe(200);
    expect(
      sentResultId(await readRow(bearer, logId), await readLink(bearer)),
    ).toBe(339);

    const removed = await request(app)
      .delete("/api/concept2/link")
      .set("Authorization", bearer);
    expect(removed.status).toBe(204);
    await linkAccount({
      userId,
      c2UserId: C2_USER_SECOND,
      username: "second",
    });

    const row = await readRow(bearer, logId);
    const link = await readLink(bearer);
    expect(link.c2UserId).toBe(C2_USER_SECOND);
    expect(sentResultId(row, link)).toBeNull();
  });
});
