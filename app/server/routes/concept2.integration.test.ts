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
import { eq } from "drizzle-orm";
import request from "supertest";
import type pg from "pg";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { createDb, type Db } from "../db/index.js";
import { concept2AuthAttempts } from "../db/schema.js";
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
import { computeAvailableFor } from "../concept2/availability.js";
import type { Stores } from "./data.js";

// Wave E PR1 Task 7 (the RF24 seam — "every test seeding PAST the
// producer"), extended at PR1.75a with the identity rows design §Testing
// names ("Integration (RF24, both surfaces): real routes + Postgres +
// client, only `fetch` stubbed"). This file is the ONE test that starts
// upstream of every producer in the chain and never fakes any of them: a
// real Postgres container, the real `createDataRouter`'s `POST /api/logs`
// (the REAL producer of the row the upload reads), the real
// `createConcept2Store` (real `FOR UPDATE` locking, real UNIQUE indexes),
// and a real `createC2Client` with ONLY the module boundary this repo
// can't control (`fetch` itself) stubbed. Every stubbed response body is
// transcribed verbatim from a committed capture:
//   RAW   = docs/monitor/c2-crossconnect-2026-09/raw-output.txt
//   PROBE = docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md
// (`meBody`'s `username` is NOT a capture — no /users/me body is committed;
// plan observation 3 — it is the documented field, read as optional.)
//
// Mount order (controller ruling R1): the web callback below is driven with
// a COOKIE and no bearer; if `createConcept2Router` ever lands after
// `routes/data.ts`'s own `router.use("/api", requireUser)`, that request
// gets the data router's bare JSON 401 instead of this router's HTML
// ladder. PR1.75a made an unauthenticated callback a DESIGNED 401 (design
// §5 step 3), so a bare status code no longer distinguishes the two
// mountings — the dedicated mount-order test below reads `content-type`,
// the page's own status label and `Referrer-Policy` instead, none of which
// the data router's JSON 401 can produce.
//
// D1 (design §Decisions, APPROVED) makes `concept2_links.c2_user_id`
// UNIQUE for the whole database, so EVERY test in this file that actually
// lands a link uses its own `c2UserId` — two tests sharing one would make
// the second one's callback answer 409 Already linked rather than the
// outcome it is asserting. The one place two tests deliberately share an
// id is the D1 row itself.

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

// `client.ts`'s own `fetchMe` contract (`data.id`, optional `username`),
// same minimal-but-real shape `concept2/client.test.ts`'s own
// "200 {data:{id}} -> c2UserId" test uses — no committed transcript names a
// SUCCESS body for this endpoint (only the PROBE's 401 failure shape is a
// real capture), so this is the documented contract's own minimum. The
// design's §7 field census (measured live on log-dev 2026-09-02) names
// `username`; it is read as optional (plan observation 3).
function meBody(c2UserId: number, username = "jmorelli") {
  // Wave E PR2: `weight`/`gender` are deliberately ABSENT here. This seam's
  // sends must resolve their class from the DECLARATION list below, so a
  // profile that could answer would hide a broken producer 1.
  return { data: { id: c2UserId, username } };
}

// Wave E PR2: one page of the rower's own Concept2 results, shaped as the
// list endpoint returns it (MEASURED 2026-09-03 on log-dev: date-descending,
// every row carrying `weight_class`). This is the seam's PRODUCER for the
// class that ends up on the wire — `EXPECTED_PAYLOAD.weight_class` is read
// from HERE, through `fetchResults` -> `pickDeclaredWeightClass` ->
// `buildC2Payload`, and not from any stored column.
function resultsListBody(weightClass: "H" | "L" = "H") {
  return {
    data: [
      {
        id: 85400,
        type: "rower",
        weight_class: weightClass,
        date_utc: "2026-08-20 10:00:30",
        date: "2026-08-20 06:00:30",
      },
    ],
  };
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

// The web surface's registered redirect (index.ts derives it from SITE_URL;
// here it is this test's own literal, passed as a dep).
// Every user this file signs in. Serves as BOTH the sign-in allowlist and
// the Wave E per-user C2 list, so the two gates agree here and each test
// exercises the feature rather than the gate.
const SEAM_EMAILS = new Set([
  "seam-rf24@c2seam.test",
  "seam-409@c2seam.test",
  "seam-singleuse@c2seam.test",
  "seam-refresh@c2seam.test",
  "seam-web-a@c2seam.test",
  "seam-web-b@c2seam.test",
  "seam-native-a@c2seam.test",
  "seam-native-b@c2seam.test",
  "seam-cross@c2seam.test",
  "seam-d1-a@c2seam.test",
  "seam-d1-b@c2seam.test",
  "seam-concurrent@c2seam.test",
]);

const WEB_REDIRECT_URI = "https://ergomatic.example/api/concept2/callback";
// Wave E PR2: the Concept2 origin this deployment talks to, echoed on
// `GET /link`. Deliberately not a production origin.
const LOGBOOK_BASE_URL = "https://log-dev.concept2.test";
// An INDEPENDENT literal, never `routes/concept2.ts`'s exported constant
// (RF21's PR #228 lesson: a test that imports the value it exists to pin
// retunes itself when the value changes and can never go red on it).
const NATIVE_REDIRECT_URI = "haus.waffle.ergomatic://oauth/callback";

describe("Concept2 broker: the RF24 seam (real Postgres, real router, real C2 client, fetch stubbed)", () => {
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
        baseUrl: "https://log-dev.concept2.test",
        clientId: "seam-client-id",
        clientSecret: "seam-client-secret",
      },
      fetchMock,
    );
    sessions = createSessionStore(db);

    app = createApp(
      baseDeps({
        sessions,
        users: createUserStore(db),
        allowlist: SEAM_EMAILS,
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
          // Wave E per-user gate, wired through the REAL
          // `computeAvailableFor` rather than a hand-set `() => true`, so
          // this file's seam tests cross the same composition production
          // does. Every user here is on both lists; the gate's own
          // discrimination is pinned at the router layer
          // (`concept2.test.ts`, "per-user gate").
          availableFor: (email: string) =>
            computeAvailableFor(true, SEAM_EMAILS, email),
          store: createConcept2Store(db),
          client,
          // PR1.75a: the WEB surface's redirect_uri (the native surface's
          // is `routes/concept2.ts`'s NATIVE_REDIRECT_URI constant).
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

  // The tests share one `app`/`fetchMock` (a fresh Postgres container per
  // file, per the other integration tests' own precedent), but each test's
  // own assertions on `fetchMock.mock.calls` need call history scoped to
  // that test alone.
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

  // A cookie session for an existing user, minted through the real store
  // (auth/sessions.ts's `createSession`) — the web surface's credential.
  // One user can hold both a bearer (`signIn`) and this cookie; the
  // cross-surface rows need exactly that.
  async function cookieFor(userId: string): Promise<string> {
    const { token } = await sessions.createSession(userId);
    return `erg_session=${token}`;
  }

  async function mintWeb(cookie: string): Promise<string> {
    const res = await request(app)
      .post("/api/concept2/connect")
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(
      new URL(res.body.authorizeUrl as string).searchParams.get("redirect_uri"),
    ).toBe(WEB_REDIRECT_URI);
    return res.body.state as string;
  }

  async function mintNative(bearer: string): Promise<string> {
    const res = await request(app)
      .post("/api/concept2/connect")
      .set("Authorization", bearer)
      // Design §3: a bearer mint must DECLARE it can receive the native
      // redirect, or the route answers 409 update_required.
      .send({ linkClient: "webauth-1" });
    expect(res.status).toBe(200);
    expect(
      new URL(res.body.authorizeUrl as string).searchParams.get("redirect_uri"),
    ).toBe(NATIVE_REDIRECT_URI);
    return res.body.state as string;
  }

  // `fetch` stub answering the token + me endpoints (and, when asked, the
  // results endpoint) — every body a committed transcript.
  function stubC2(opts: {
    c2UserId: number;
    results?: "201" | "409";
    declared?: "H" | "L";
  }) {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody("at-seam", "rt-seam"));
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, meBody(opts.c2UserId));
      }
      // The results endpoint serves TWO calls now: a GET list (the
      // declaration read, `?number=<page size>`) and the POST that sends
      // the row. Split on the query rather than on the method so the arm
      // that answers is the one the URL actually names.
      if (url.includes("/api/users/me/results?number=")) {
        return jsonResponse(200, resultsListBody(opts.declared ?? "H"));
      }
      if (url.endsWith("/api/users/me/results")) {
        return opts.results === "409"
          ? jsonResponse(409, RAW_409_BODY)
          : jsonResponse(201, RAW_201_BODY);
      }
      throw new Error(`unexpected fetch url in this test: ${url}`);
    });
  }

  const tokenCalls = () =>
    fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/oauth/access_token"),
    );

  // The redirect_uri THIS request actually put on the wire, read out of the
  // form body `exchangeCode` builds.
  const tokenCallRedirect = (index = 0): string | null => {
    const [, init] = tokenCalls()[index]!;
    const body = (init as RequestInit).body;
    expect(body).toBeInstanceOf(URLSearchParams);
    return (body as URLSearchParams).get("redirect_uri");
  };

  // Attempt rows read straight out of Postgres — presence, not a store
  // method's opinion about presence.
  const attemptsFor = (userId: string) =>
    db
      .select({
        nonce: concept2AuthAttempts.nonce,
        surface: concept2AuthAttempts.surface,
      })
      .from(concept2AuthAttempts)
      .where(eq(concept2AuthAttempts.userId, userId));

  const attemptRows = async (userId: string) =>
    (await attemptsFor(userId)).length;

  const stripTags = (html: string) => html.replace(/<[^>]+>/g, "");

  it("the seam: log -> web mint -> cookie callback -> upload -> stored row carries the C2 identity -> the captured wire payload matches PR0's accepted shape field-for-field", async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody("at-rf24", "rt-rf24"));
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, meBody(2211));
      }
      // Wave E PR2: the declaration read. The class this seam puts on the
      // wire is produced HERE — read out of Concept2's own results list,
      // never out of a stored column.
      if (url.includes("/api/users/me/results?number=")) {
        return jsonResponse(200, resultsListBody("H"));
      }
      if (url.endsWith("/api/users/me/results")) {
        return jsonResponse(201, RAW_201_BODY);
      }
      throw new Error(`unexpected fetch url in this test: ${url}`);
    });

    const { bearer, userId } = await signIn("seam-rf24");
    const cookie = await cookieFor(userId);

    // The REAL producer: a full POST /api/logs, the same fixture body Task
    // 5/6's own tests use.
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(finishedLogBody());
    expect(created.status).toBe(201);
    const logId = created.body.id as string;

    const state = await mintWeb(cookie);

    // PR1.75a: the callback is COOKIE-authenticated (design §5 step 3) —
    // the same user's session, carried the way a browser carries it.
    const callback = await request(app)
      .get(`/api/concept2/callback?state=${state}&code=abc123`)
      .set("Cookie", cookie);
    expect(callback.status).toBe(200);
    expect(callback.type).toBe("text/html");
    expect(callback.text).toContain("CONCEPT2 LINK · LINKED · HTTP 200");

    const uploaded = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "America/New_York" });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toStrictEqual({
      resultId: 85557,
      weightClass: "H",
      weightClassSource: "declaration",
    });

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
        // D1: its own Concept2 account — 2211 is already this database's
        // seam-rf24 link.
        return jsonResponse(200, meBody(2212));
      }
      // Wave E PR2: the declaration read. The class this seam puts on the
      // wire is produced HERE — read out of Concept2's own results list,
      // never out of a stored column.
      if (url.includes("/api/users/me/results?number=")) {
        return jsonResponse(200, resultsListBody("H"));
      }
      if (url.endsWith("/api/users/me/results")) {
        return jsonResponse(409, RAW_409_BODY);
      }
      throw new Error(`unexpected fetch url in this test: ${url}`);
    });

    const { bearer, userId } = await signIn("seam-409");
    const cookie = await cookieFor(userId);
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(finishedLogBody());
    expect(created.status).toBe(201);
    const logId = created.body.id as string;

    const state = await mintWeb(cookie);
    const callback = await request(app)
      .get(`/api/concept2/callback?state=${state}&code=abc123`)
      .set("Cookie", cookie);
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
    expect(stored.body.c2UserId).toBe(2212);
  });

  it("single-use through the real store: a second callback with the same state+code is rejected (attempt already consumed)", async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody("at-single", "rt-single"));
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, meBody(2213));
      }
      throw new Error(`unexpected fetch url in this test: ${url}`);
    });

    const { userId } = await signIn("seam-singleuse");
    const cookie = await cookieFor(userId);
    const state = await mintWeb(cookie);

    const first = await request(app)
      .get(`/api/concept2/callback?state=${state}&code=abc123`)
      .set("Cookie", cookie);
    expect(first.status).toBe(200);

    const second = await request(app)
      .get(`/api/concept2/callback?state=${state}&code=abc123`)
      .set("Cookie", cookie);
    expect(second.status).toBe(400);
    // Only ONE exchange ever reached the wire — the second request's
    // single-use guard fired at the store, before any fetch call.
    expect(tokenCalls()).toHaveLength(1);
  });

  it("refresh path: an expired stored token refreshes (real store row) and the rotated pair lands before the post", async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody("at-rotated", "rt-rotated"));
      }
      // Wave E PR2: the declaration read. The class this seam puts on the
      // wire is produced HERE — read out of Concept2's own results list,
      // never out of a stored column.
      if (url.includes("/api/users/me/results?number=")) {
        return jsonResponse(200, resultsListBody("H"));
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
    // (and never routed through) the mint/callback flow the other tests
    // exercise. Its own `c2UserId` (D1: the column is UNIQUE database-wide).
    const concept2Store = createConcept2Store(db);
    await concept2Store.upsertLink(userId, {
      c2UserId: 2214,
      accessToken: "stale-access-token",
      refreshToken: "stale-refresh-token",
      expiresAt: new Date(Date.now() - 1000),
    });

    const uploaded = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "America/New_York" });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toStrictEqual({
      resultId: 85557,
      weightClass: "H",
      weightClassSource: "declaration",
    });

    const link = await concept2Store.getLink(userId);
    expect(link?.accessToken).toBe("at-rotated");
    expect(link?.refreshToken).toBe("rt-rotated");
    expect(link?.accessToken).not.toBe("stale-access-token");
  });

  describe("identity rows (design §Testing — RF24, both surfaces)", () => {
    it("web, same user: cookie mint -> cookie callback -> Linked page names both identities -> link row exists", async () => {
      stubC2({ c2UserId: 2215 });
      const { userId } = await signIn("seam-web-a");
      const cookie = await cookieFor(userId);
      const state = await mintWeb(cookie);
      const callback = await request(app)
        .get(`/api/concept2/callback?state=${state}&code=abc123`)
        .set("Cookie", cookie);
      expect(callback.status).toBe(200);
      expect(callback.type).toBe("text/html");
      expect(callback.headers["referrer-policy"]).toBe("no-referrer");
      // D2: the page names BOTH identities (design §7's copy, verbatim).
      expect(stripTags(callback.text)).toContain(
        "Concept2 jmorelli is now connected to Ergomatic seam-web-a@c2seam.test.",
      );
      expect(callback.text).toContain("CONCEPT2 LINK · LINKED · HTTP 200");

      const link = await createConcept2Store(db).getLink(userId);
      expect(link?.c2UserId).toBe(2215);
      expect(link?.c2Username).toBe("jmorelli");
      // The exchange went to the wire with the WEB redirect.
      expect(tokenCalls()).toHaveLength(1);
      expect(tokenCallRedirect()).toBe(WEB_REDIRECT_URI);
      // Consumed: the attempt row is gone from Postgres.
      expect(await attemptRows(userId)).toBe(0);
    });

    it("web, wrong user: another user's cookie -> 403 Wrong account, NO token call, no link for anyone, attempt STILL PRESENT", async () => {
      stubC2({ c2UserId: 2216 });
      const a = await signIn("seam-web-b");
      const b = await signIn("seam-cross");
      const cookieA = await cookieFor(a.userId);
      const cookieB = await cookieFor(b.userId);
      const state = await mintWeb(cookieA);
      const callback = await request(app)
        .get(`/api/concept2/callback?state=${state}&code=abc123`)
        .set("Cookie", cookieB);
      expect(callback.status).toBe(403);
      expect(callback.type).toBe("text/html");
      expect(callback.text).toContain(
        "CONCEPT2 LINK · WRONG ACCOUNT · HTTP 403",
      );
      // Exit criterion 1: refused BEFORE any Concept2 call.
      expect(tokenCalls()).toHaveLength(0);
      const store = createConcept2Store(db);
      expect(await store.getLink(a.userId)).toBeNull();
      expect(await store.getLink(b.userId)).toBeNull();
      // ...and BEFORE consuming: the rightful user's attempt survives a
      // wrong principal's presentation (the DoS leg), read from Postgres.
      expect(await store.peekAttempt(state)).not.toBeNull();
      const rows = await attemptsFor(a.userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.nonce).toBe(state);
      expect(await attemptRows(b.userId)).toBe(0);
    });

    it("native, same bearer: native mint -> POST /exchange -> 200 linked, exchange carried the NATIVE redirect", async () => {
      stubC2({ c2UserId: 3311 });
      const { bearer, userId } = await signIn("seam-native-a");
      const state = await mintNative(bearer);
      const res = await request(app)
        .post("/api/concept2/exchange")
        .set("Authorization", bearer)
        .send({ code: "abc123", state });
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({
        linked: true,
        c2UserId: 3311,
      });
      expect(tokenCalls()).toHaveLength(1);
      expect(tokenCallRedirect()).toBe(NATIVE_REDIRECT_URI);
      expect((await createConcept2Store(db).getLink(userId))?.c2UserId).toBe(
        3311,
      );
      expect(await attemptRows(userId)).toBe(0);
    });

    it("native mint WITHOUT linkClient -> 409 update_required and NO attempt row is written", async () => {
      stubC2({ c2UserId: 3312 });
      const { bearer, userId } = await signIn("seam-native-b");
      const res = await request(app)
        .post("/api/concept2/connect")
        .set("Authorization", bearer)
        .send({});
      expect(res.status).toBe(409);
      expect(res.body).toStrictEqual({ error: "update_required" });
      // Design §3: it "issues nothing" — proven against Postgres, not
      // against a store spy.
      expect(await attemptRows(userId)).toBe(0);
      expect(tokenCalls()).toHaveLength(0);
    });

    it("native, wrong bearer: another user's bearer -> 403 principal_mismatch, NO token call, attempt STILL PRESENT", async () => {
      stubC2({ c2UserId: 3313 });
      const a = await signIn("seam-native-b");
      const b = await signIn("seam-cross");
      const state = await mintNative(a.bearer);
      const res = await request(app)
        .post("/api/concept2/exchange")
        .set("Authorization", b.bearer)
        .send({ code: "abc123", state });
      expect(res.status).toBe(403);
      expect(res.body).toStrictEqual({ error: "principal_mismatch" });
      expect(tokenCalls()).toHaveLength(0);
      const store = createConcept2Store(db);
      expect(await store.peekAttempt(state)).not.toBeNull();
      const rows = await attemptsFor(a.userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.nonce).toBe(state);
      expect(await store.getLink(a.userId)).toBeNull();
      expect(await store.getLink(b.userId)).toBeNull();
    });

    it("cross-surface, both directions: a web-minted state cannot /exchange and a native-minted state cannot /callback — 400, nothing consumed, no token call", async () => {
      stubC2({ c2UserId: 3314 });
      const { bearer, userId } = await signIn("seam-cross");
      const cookie = await cookieFor(userId);
      const store = createConcept2Store(db);

      const webState = await mintWeb(cookie);
      const viaExchange = await request(app)
        .post("/api/concept2/exchange")
        .set("Authorization", bearer)
        .send({ code: "abc123", state: webState });
      expect(viaExchange.status).toBe(400);
      expect(viaExchange.body).toStrictEqual({ error: "wrong_surface" });
      expect(await store.peekAttempt(webState)).not.toBeNull();

      // This mint REPLACES the web attempt (one live attempt per user, the
      // upsert's ON CONFLICT (user_id)) — nothing above consumed it.
      const nativeState = await mintNative(bearer);
      const viaCallback = await request(app)
        .get(`/api/concept2/callback?state=${nativeState}&code=abc123`)
        .set("Cookie", cookie);
      expect(viaCallback.status).toBe(400);
      expect(viaCallback.type).toBe("text/html");
      expect(viaCallback.text).toContain("CONCEPT2 LINK · EXPIRED · HTTP 400");
      expect(await store.peekAttempt(nativeState)).not.toBeNull();

      expect(tokenCalls()).toHaveLength(0);
      expect(await store.getLink(userId)).toBeNull();
    });

    // The mount-order gate (controller ruling R1), rewritten for PR1.75a.
    // An unauthenticated callback is now a DESIGNED 401 (design §5 step 3),
    // so the status code alone no longer separates "mounted correctly" from
    // "mounted after the data router". These three assertions do: the data
    // router's `router.use("/api", requireUser)` answers
    // `application/json` `{"error":"unauthenticated"}` with no
    // Referrer-Policy and no status label, and cannot produce any of them.
    it("mount order (R1): an unauthenticated callback answers THIS router's HTML 401 page, not the data router's bare JSON 401", async () => {
      const res = await request(app).get(
        "/api/concept2/callback?state=nonesuch&code=abc123",
      );
      expect(res.status).toBe(401);
      expect(res.type).toBe("text/html");
      expect(res.text).toContain("CONCEPT2 LINK · NOT SIGNED IN · HTTP 401");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
    });

    it("neither credential: callback -> 401 Not signed in (HTML), exchange -> 401 (JSON); nothing consumed", async () => {
      stubC2({ c2UserId: 3315 });
      const { bearer, userId } = await signIn("seam-cross");
      const cookie = await cookieFor(userId);
      const store = createConcept2Store(db);
      const webState = await mintWeb(cookie);
      const nativeState = await mintNative(bearer);
      // A native mint REPLACED the web one (one live attempt per user) —
      // the web state is gone by upsert, not by any callback.
      expect(await store.peekAttempt(webState)).toBeNull();

      const cb = await request(app).get(
        `/api/concept2/callback?state=${nativeState}&code=abc123`,
      );
      expect(cb.status).toBe(401);
      expect(cb.type).toBe("text/html");
      expect(cb.text).toContain("CONCEPT2 LINK · NOT SIGNED IN · HTTP 401");

      const ex = await request(app)
        .post("/api/concept2/exchange")
        .send({ code: "abc123", state: nativeState });
      expect(ex.status).toBe(401);
      expect(ex.type).toBe("application/json");
      expect(ex.body).toStrictEqual({ error: "unauthenticated" });

      expect(tokenCalls()).toHaveLength(0);
      expect(await store.peekAttempt(nativeState)).not.toBeNull();
      expect(await attemptRows(userId)).toBe(1);
    });

    it("D1 on real Postgres: a Concept2 account already linked to user A cannot be linked to user B (409), A's row intact", async () => {
      stubC2({ c2UserId: 4411 });
      const a = await signIn("seam-d1-a");
      const cookieA = await cookieFor(a.userId);
      const stateA = await mintWeb(cookieA);
      const first = await request(app)
        .get(`/api/concept2/callback?state=${stateA}&code=abc123`)
        .set("Cookie", cookieA);
      expect(first.status).toBe(200);

      // The web half of D1 too: B presenting the SAME Concept2 account in a
      // browser gets the 409 page, not a silent takeover.
      const b = await signIn("seam-d1-b");
      const cookieB = await cookieFor(b.userId);
      const stateBWeb = await mintWeb(cookieB);
      const webSecond = await request(app)
        .get(`/api/concept2/callback?state=${stateBWeb}&code=def456`)
        .set("Cookie", cookieB);
      expect(webSecond.status).toBe(409);
      expect(webSecond.type).toBe("text/html");
      expect(webSecond.text).toContain(
        "CONCEPT2 LINK · ALREADY LINKED · HTTP 409",
      );

      const stateB = await mintNative(b.bearer);
      const second = await request(app)
        .post("/api/concept2/exchange")
        .set("Authorization", b.bearer)
        .send({ code: "def456", state: stateB });
      expect(second.status).toBe(409);
      expect(second.body).toStrictEqual({ error: "already_linked_elsewhere" });

      const store = createConcept2Store(db);
      expect((await store.getLink(a.userId))?.c2UserId).toBe(4411);
      expect((await store.getLink(a.userId))?.accessToken).toBe("at-seam");
      expect(await store.getLink(b.userId)).toBeNull();
    });

    // Exit criterion 3 at the ROUTE layer. What this pair proves and what
    // it does NOT (RF26 — the strongest claim these two may carry): the
    // ROUTE mints through the store's ONE atomic statement, so one user's
    // concurrent and sequential mints leave exactly one row and the
    // survivor is a nonce the route actually issued. The biting mutation
    // recorded for both is `createAttempt`'s ON CONFLICT target
    // (`userId` -> `nonce`), which turns every re-mint into a 500. The
    // STATEMENT-level mutation the design names (upsert -> delete +
    // insert) does NOT reliably lose this `Promise.all` race on fast local
    // Postgres — measured, three consecutive green runs — so the
    // deterministic proof of that invariant lives where it can be forced:
    // stores/concept2.integration.test.ts's "createAttempt genuinely
    // BLOCKS on an uncommitted conflicting row" (its own comment records
    // the same measurement).
    it("two CONCURRENT mints through the real route leave exactly one live attempt, and it is one of the two nonces actually issued", async () => {
      const { bearer, userId } = await signIn("seam-concurrent");
      const [r1, r2] = await Promise.all([
        request(app)
          .post("/api/concept2/connect")
          .set("Authorization", bearer)
          .send({ linkClient: "webauth-1" }),
        request(app)
          .post("/api/concept2/connect")
          .set("Authorization", bearer)
          .send({ linkClient: "webauth-1" }),
      ]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      const rows = await attemptsFor(userId);
      expect(rows).toHaveLength(1);
      // Which of the two commits last is not observable from here, so the
      // honest invariant is that the survivor is one of the two nonces the
      // route actually issued — never a third value and never a stale row.
      expect([r1.body.state, r2.body.state]).toContain(rows[0]!.nonce);
      expect(rows[0]!.surface).toBe("native");
    });

    // The ORDERING half of the same invariant, where ordering IS observable:
    // two SEQUENTIAL mints leave the second one's nonce, so a re-mint
    // genuinely replaces rather than appending (the real ON CONFLICT (user_id)
    // DO UPDATE SET nonce, against real Postgres).
    it("a sequential re-mint leaves exactly the LAST response's nonce, and the earlier state is dead", async () => {
      const { userId } = await signIn("seam-concurrent");
      const cookie = await cookieFor(userId);
      const firstState = await mintWeb(cookie);
      const secondState = await mintWeb(cookie);
      expect(secondState).not.toBe(firstState);
      const rows = await attemptsFor(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.nonce).toBe(secondState);
      expect(rows[0]!.surface).toBe("web");
      const store = createConcept2Store(db);
      expect(await store.peekAttempt(firstState)).toBeNull();
      expect(await store.peekAttempt(secondState)).not.toBeNull();
    });
  });
});
