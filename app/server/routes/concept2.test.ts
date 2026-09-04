import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createApp } from "../app.js";
import { SESSION_COOKIE } from "../auth/cookies.js";
import { parseAllowlist } from "../auth/allowlist.js";
import { requireUser } from "../auth/middleware.js";
import { computeAvailableFor } from "../concept2/availability.js";
import { baseDeps } from "../testDeps.js";
import type { SessionStore, SessionUser } from "../auth/sessions.js";
import { makeFakeConcept2Store, makeFakeStores } from "../testing/fakes.js";
import type { LogInput, LogsStore } from "../stores/logs.js";
import type { C2Client } from "../concept2/client.js";
import { formatC2Date } from "../concept2/mapping.js";
import {
  AttemptNonceCollisionError,
  type Concept2Store,
} from "../stores/concept2.js";
import {
  createConcept2Router,
  NATIVE_REDIRECT_URI,
  type Concept2RouterDeps,
} from "./concept2.js";

// Wave E PR1 Task 6, rebuilt at PR1.75a (2026-09-02-concept2-pr175-app-bind-
// design.md §5/§6): supertest + fake session store, same harness shape as
// `data.test.ts`'s own `appFor`. The concept2 store is the Task 2 fake
// (`makeFakeConcept2Store`); `logs` is a fresh per-test
// `makeFakeStores().logs`, exercising the real `LogInput`/`create()`
// contract rather than a hand-built row; `client` is a stub of the
// `C2Client` surface — never a real fetch, per this task's "unit tests only"
// scope (the integration seam test is Task 7's).
//
// The SAME fake session store backs both `requireUser` and the router's own
// `sessions` dep, so a token presented as a bearer and as a cookie resolves
// to the same user — that is what makes the two surfaces (and their
// disagreement case) testable from one harness.

const userA: SessionUser = { id: "user-a", email: "a@x.com", name: "A" };
const userB: SessionUser = { id: "user-b", email: "b@x.com", name: "B" };

function fakeSessionStore(): SessionStore {
  const users: Record<string, SessionUser> = {
    "token-a": userA,
    "token-b": userB,
    // Wave E per-user gate: userA's OWN id, carrying the address in a
    // different case. Google hands us whatever case the account was
    // created with, and `req.user!.email` goes straight into
    // `availableFor` — so the CANDIDATE side of `isAllowed` is a
    // production path, not a harness detail, and it needs a session that
    // can exercise it.
    "token-a-mixedcase": { ...userA, email: userA.email.toUpperCase() },
  };
  return {
    resolveSession: async (token: string) => {
      const user = users[token];
      if (!user) return null;
      return {
        user,
        expiresAt: new Date(Date.now() + 100_000),
        refreshed: false,
      };
    },
  } as unknown as SessionStore;
}

const asA = (req: request.Test) => req.set("Authorization", "Bearer token-a");
const asB = (req: request.Test) => req.set("Authorization", "Bearer token-b");
const asAMixedCase = (req: request.Test) =>
  req.set("Authorization", "Bearer token-a-mixedcase");
// The web surface: the SAME fake session tokens, carried as the
// `erg_session` cookie instead of a bearer.
const asACookie = (req: request.Test) =>
  req.set("Cookie", `${SESSION_COOKIE}=token-a`);
const asBCookie = (req: request.Test) =>
  req.set("Cookie", `${SESSION_COOKIE}=token-b`);

const WEB_REDIRECT_URI = "https://ergomatic.example/api/concept2/callback";
// Wave E PR2: deliberately NOT a production origin, so a handler that
// hardcodes `https://log.concept2.com` instead of echoing this dep has
// something to disagree with (mutation M11).
const LOGBOOK_BASE_URL = "https://log-dev.concept2.test";

// Well-formed but guaranteed-absent from any fake store's map (data.test.ts
// precedent).
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

// Every method throws until a test stubs it — an un-stubbed call is a test
// bug, never a silent wrong-shape result. `authorizeUrl` echoes BOTH its
// arguments so a test can read the surface's redirect back off the URL.
function makeStubClient(): C2Client {
  return {
    authorizeUrl: vi.fn(
      (state: string, redirectUri: string) =>
        `https://c2.test/oauth/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    ),
    exchangeCode: vi.fn(async () => {
      throw new Error("exchangeCode not stubbed for this test");
    }),
    refreshTokens: vi.fn(async () => {
      throw new Error("refreshTokens not stubbed for this test");
    }),
    fetchMe: vi.fn(async () => {
      throw new Error("fetchMe not stubbed for this test");
    }),
    // Ruling (i): the upload path reads the rower's most recent Concept2
    // results to find their own weight-class DECLARATION before it ever
    // considers the profile. This default is the account we measured — every
    // result on log-dev user 2211 carries `weight_class`, all "H", type
    // `rower` — so it is the machine's own ordinary state, not a value
    // chosen to make a gate pass. A test about the PROFILE fallback must
    // override it with `{ ok: true, rows: [] }`, or it silently exercises
    // the declaration path instead.
    fetchResults: vi.fn(async () => ({
      ok: true as const,
      rows: [
        {
          id: 90001,
          type: "rower",
          weightClass: "H",
          dateUtc: "2026-09-02 10:00:30",
          date: "2026-09-02 06:00:30",
        },
      ],
    })),
    postResult: vi.fn(async () => {
      throw new Error("postResult not stubbed for this test");
    }),
  } as unknown as C2Client;
}

interface Harness {
  app: express.Express;
  store: Concept2Store;
  logs: LogsStore;
  client: C2Client;
  setAvailable: (v: boolean) => void;
}

function buildApp(
  overrides: {
    available?: boolean;
    // The RAW `C2_ALLOWED_EMAILS` string, not a Set: the harness runs it
    // through the production `parseAllowlist` so every test in this file
    // reaches `availableFor` through the real composition rather than a
    // hand-set boolean. The default admits both fake users, which keeps the
    // pre-existing tests here describing what they always described (the
    // GLOBAL gate) instead of tripping over the new per-user one.
    c2AllowedEmails?: string;
    store?: Concept2Store;
    logs?: LogsStore;
    client?: C2Client;
    now?: () => Date;
  } = {},
): Harness {
  const store = overrides.store ?? makeFakeConcept2Store();
  const logs = overrides.logs ?? makeFakeStores().logs;
  const client = overrides.client ?? makeStubClient();
  const state = {
    available: overrides.available ?? true,
    allowedEmails: parseAllowlist(
      overrides.c2AllowedEmails ?? `${userA.email},${userB.email}`,
    ),
  };
  const sessions = fakeSessionStore();
  const deps: Concept2RouterDeps = {
    available: () => state.available,
    availableFor: (email: string) =>
      computeAvailableFor(state.available, state.allowedEmails, email),
    store,
    logs,
    client,
    requireUser: requireUser(sessions),
    sessions,
    webRedirectUri: WEB_REDIRECT_URI,
    logbookBaseUrl: LOGBOOK_BASE_URL,
    now: overrides.now,
  };
  const app = express();
  app.use(express.json());
  app.use(createConcept2Router(deps));
  return {
    app,
    store,
    logs,
    client,
    setAvailable: (v: boolean) => {
      state.available = v;
    },
  };
}

// Task 5's own fixture (mapping.test.ts's FINISHED_ROW), transcribed from a
// real capture (that file's own comment) — reused here rather than a
// hand-built minimum (agent briefing: realistic fixtures). `held`/`pain`/
// `notes`/`steps`/`advancesPlan` are the ordinary LogInput scaffolding a
// session log always carries; none of them are read by this router.
const FINISHED_LOG_INPUT: LogInput = {
  workoutId: null,
  workoutTitle: "Steady State",
  workoutType: "AT",
  baselineK2: null,
  baselineK6: null,
  held: null,
  pain: null,
  notes: null,
  steps: [],
  advancesPlan: false,
  deviceName: "PM5 432331249 Row",
  source: "pm5",
  thumbs: null,
  avgSplitSeconds: null,
  timeSeconds: null,
  distanceMeters: null,
  series: null,
  endedBy: "finished",
  workSeconds: 254.8,
  workMeters: 935,
  restSeconds: 120,
  restMeters: 274,
  machineWorkSeconds: null,
  machineWorkMeters: null,
  machineSummary: { avgStrokeRate: 24, workoutType: 8 },
  completedAt: new Date("2026-08-25T21:42:03.110Z"),
  tz: "America/New_York",
};

async function seedEligibleLog(
  logs: LogsStore,
  userId: string,
  overrides: Partial<LogInput> = {},
): Promise<string> {
  const { id } = await logs.create(userId, {
    ...FINISHED_LOG_INPUT,
    ...overrides,
  });
  return id;
}

const LINK_INPUT = {
  c2UserId: 2211,
  accessToken: "at-1",
  refreshToken: "rt-1",
};

function freshLink(
  overrides: Partial<
    typeof LINK_INPUT & { expiresAt: Date; c2Username: string | null }
  > = {},
) {
  return {
    ...LINK_INPUT,
    expiresAt: new Date(Date.now() + 3600_000),
    ...overrides,
  };
}

// Web mint by default (cookie); pass `asA`/`asB` for a native mint, which
// also needs the capability declaration (design §3).
async function mintAndGetState(
  app: express.Express,
  asUser: (req: request.Test) => request.Test = asACookie,
  body: Record<string, unknown> = {},
): Promise<string> {
  const res = await asUser(
    request(app).post("/api/concept2/connect").send(body),
  );
  expect(res.status).toBe(200);
  return res.body.state as string;
}
const NATIVE_MINT = { linkClient: "webauth-1" };

// The two wire calls a successful completion makes, both stubbed happy.
function stubHappyExchange(client: C2Client, c2UserId = 2211): void {
  vi.mocked(client.exchangeCode).mockResolvedValue({
    ok: true,
    tokens: {
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  vi.mocked(client.fetchMe).mockResolvedValue({
    ok: true,
    c2UserId,
    username: "jmorelli",
    // Present-and-plausible (step A5): none of the tests using this helper
    // is about the derivation, and a `null` would silently make each one a
    // test of the refusal branch instead.
    weight: 8200,
    gender: "M",
  });
}

// ---------------------------------------------------------------------------

describe("concept2 router: auth guard", () => {
  const routes: Array<[string, string]> = [
    ["post", "/api/concept2/connect"],
    ["post", "/api/concept2/exchange"],
    ["get", "/api/concept2/link"],
    ["delete", "/api/concept2/link"],
    ["post", `/api/concept2/results/${NON_EXISTENT_UUID}`],
  ];

  it.each(routes)("401s %s %s without a session", async (method, path) => {
    const { app } = buildApp();
    const agent = request(app) as unknown as Record<
      string,
      (p: string) => request.Test
    >;
    const res = await agent[method](path);
    expect(res.status).toBe(401);
  });

  it("callback: missing params answer 400 Incomplete BEFORE any session check (params precede identity)", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/concept2/callback");
    expect(res.status).toBe(400);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("CONCEPT2 LINK · INCOMPLETE · HTTP 400");
  });

  // Design §1(b): both credentials present and resolving to DIFFERENT
  // users is a hard 400 on every /api/concept2/* route (scope (b)), where
  // requireUser app-wide only LOGS it (scope (a)). Nothing consumed.
  describe("ambiguous_auth: bearer A + cookie B", () => {
    const ambiguous = (req: request.Test) => asBCookie(asA(req));

    it("mint -> 400 {error:'ambiguous_auth'}, no attempt created", async () => {
      const store = makeFakeConcept2Store();
      const createSpy = vi.spyOn(store, "createAttempt");
      const { app } = buildApp({ store });
      const res = await ambiguous(
        request(app).post("/api/concept2/connect").send(NATIVE_MINT),
      );
      expect(res.status).toBe(400);
      expect(res.body).toStrictEqual({ error: "ambiguous_auth" });
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("exchange -> 400 ambiguous_auth, nothing peeked or consumed", async () => {
      const store = makeFakeConcept2Store();
      const { app } = buildApp({ store });
      const state = await mintAndGetState(app, asA, NATIVE_MINT);
      const consumeSpy = vi.spyOn(store, "consumeAttemptFor");
      const res = await ambiguous(
        request(app).post("/api/concept2/exchange").send({ code: "c", state }),
      );
      expect(res.status).toBe(400);
      expect(res.body).toStrictEqual({ error: "ambiguous_auth" });
      expect(consumeSpy).not.toHaveBeenCalled();
      expect(await store.peekAttempt(state)).not.toBeNull();
    });

    it("callback -> 400 JSON ambiguous_auth (no approved page exists; only a non-browser caller can bearer a top-level GET), attempt untouched", async () => {
      const store = makeFakeConcept2Store();
      const client = makeStubClient();
      const { app } = buildApp({ store, client });
      const state = await mintAndGetState(app);
      const res = await ambiguous(
        request(app).get(`/api/concept2/callback?state=${state}&code=abc`),
      );
      expect(res.status).toBe(400);
      expect(res.body).toStrictEqual({ error: "ambiguous_auth" });
      // The JSON arm carries the same header the pages do — this response
      // is still a reply to a URL holding `code` and `state` (design §5).
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(await store.peekAttempt(state)).not.toBeNull();
      expect(client.exchangeCode).not.toHaveBeenCalled();
    });

    // The refusal is required on ALL FIVE JSON routes, and the three tests
    // above only reach two of them plus the callback: deleting
    // `refuseAmbiguousAuth` from `GET /link`, `DELETE /link` or
    // `POST /results/:logId` left every other assertion in this file green.
    // The status/body assertion is the gate on every row (it alone catches
    // `GET /api/concept2/link`, which never writes). The write assertions
    // below add cover on the four routes that CAN write — each spy is
    // load-bearing on at least one of those rows.
    const jsonRoutes: Array<[string, string]> = [
      ["post", "/api/concept2/connect"],
      ["post", "/api/concept2/exchange"],
      ["get", "/api/concept2/link"],
      ["delete", "/api/concept2/link"],
      ["post", `/api/concept2/results/${NON_EXISTENT_UUID}`],
    ];

    it.each(jsonRoutes)(
      "%s %s -> 400 ambiguous_auth, and nothing is written",
      async (method, path) => {
        const store = makeFakeConcept2Store();
        await store.upsertLink(userA.id, freshLink());
        const { app, logs } = buildApp({ store });
        const deleteSpy = vi.spyOn(store, "deleteLink");
        const upsertSpy = vi.spyOn(store, "upsertLink");
        const createSpy = vi.spyOn(store, "createAttempt");
        const recordSpy = vi.spyOn(logs, "recordC2Result");
        const agent = request(app) as unknown as Record<
          string,
          (p: string) => request.Test
        >;
        const res = await ambiguous(
          agent[method](path).send({
            linkClient: "webauth-1",
            code: "c",
            state: "s",
            tz: "America/New_York",
          }),
        );
        expect(res.status).toBe(400);
        expect(res.body).toStrictEqual({ error: "ambiguous_auth" });
        expect(createSpy).not.toHaveBeenCalled();
        expect(deleteSpy).not.toHaveBeenCalled();
        expect(upsertSpy).not.toHaveBeenCalled();
        expect(recordSpy).not.toHaveBeenCalled();
        // userA's link is exactly as it was seeded — the DELETE route in
        // particular must not have reached `deleteLink`.
        expect((await store.getLink(userA.id))?.c2UserId).toBe(
          LINK_INPUT.c2UserId,
        );
      },
    );

    it("bearer A + cookie A (same user) is NOT ambiguous: mint succeeds as native", async () => {
      const { app } = buildApp();
      const res = await asACookie(
        asA(request(app).post("/api/concept2/connect").send(NATIVE_MINT)),
      );
      expect(res.status).toBe(200);
      expect(
        new URL(res.body.authorizeUrl as string).searchParams.get(
          "redirect_uri",
        ),
      ).toBe(NATIVE_REDIRECT_URI);
    });
  });
});

// Controller ruling R2 (task-6-brief.md): the router's own pinned check
// order (needs_reauth is checked and short-circuited BEFORE the upload
// route ever enters `withLinkLock`) means the router can never itself
// drive a flagged link into a "store" outcome — a flagged link 409s before
// refresh is attempted at all. R2's clearing therefore has no route-level
// test; this exercises the SHARED fake directly (mirroring
// `concept2.integration.test.ts`'s real-store proof of the same rule), the
// only way this task's fake edit is exercised at all.
describe("concept2 store fake: withLinkLock 'store' clears a previously-set needsReauthAt (R2)", () => {
  it("clears the flag set by an earlier 'flagReauth' outcome", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    await store.withLinkLock(userA.id, async () => ({
      action: "flagReauth" as const,
      result: undefined,
    }));
    expect((await store.getLink(userA.id))?.needsReauthAt).not.toBeNull();

    await store.withLinkLock(userA.id, async () => ({
      action: "store" as const,
      tokens: {
        accessToken: "recovered-at",
        refreshToken: "recovered-rt",
        expiresAt: new Date(Date.now() + 3600_000),
      },
      result: undefined,
    }));

    const after = await store.getLink(userA.id);
    expect(after?.needsReauthAt).toBeNull();
    expect(after?.accessToken).toBe("recovered-at");
  });
});

// Plan deviation 2: same reasoning as the R2 describe above — the router's
// own `row.tz === null` pre-check means a SECOND `recordTz` call for the
// SAME row is unreachable through a sequential router test (by the second
// request the router itself already sees a non-null tz and never calls
// this method again). Only a DIRECT second call against the store
// exercises the `tz IS NULL` guard at all; mirrored against real Postgres
// in stores.integration.test.ts.
describe("logs fake: recordTz only writes when the column is null", () => {
  it("a second recordTz call for the same row is a no-op (tz IS NULL guard), and its return value proves it (M1)", async () => {
    const logs = makeFakeStores().logs;
    const id = await seedEligibleLog(logs, userA.id, { tz: null });

    const first = await logs.recordTz(userA.id, id, "America/Los_Angeles");
    expect(first).toBe("America/Los_Angeles");
    // `recordTz` returns the EFFECTIVE stored zone, never `void` — the
    // second call must report the zone that actually won (the first
    // one), never echo its own "UTC" argument.
    const second = await logs.recordTz(userA.id, id, "UTC");
    expect(second).toBe("America/Los_Angeles");

    const row = await logs.get(userA.id, id);
    expect(row?.tz).toBe("America/Los_Angeles");
  });
});

describe("availability matrix (spec §Architecture 8)", () => {
  it("mint: unavailable -> 403 before any store call", async () => {
    const store = makeFakeConcept2Store();
    const createAttemptSpy = vi.spyOn(store, "createAttempt");
    const { app } = buildApp({ available: false, store });
    const res = await asA(request(app).post("/api/concept2/connect").send({}));
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "unavailable" });
    expect(createAttemptSpy).not.toHaveBeenCalled();
  });

  it("callback: mid-hop unavailable -> 403 Unavailable page, exchange never called, and the attempt SURVIVES (availability consumes nothing)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app, setAvailable } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    setAvailable(false);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(403);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("CONCEPT2 LINK · UNAVAILABLE · HTTP 403");
    expect(client.exchangeCode).not.toHaveBeenCalled();
    expect(await store.getLink(userA.id)).toBeNull();
    expect(await store.peekAttempt(state)).not.toBeNull();

    // PR1's flag-off consume is GONE: the same state completes once the
    // flag is back, because the 403 above was a read-only refusal.
    setAvailable(true);
    const retry = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(retry.status).toBe(200);
    expect(await store.getLink(userA.id)).not.toBeNull();
  });

  it("callback: unavailable -> 403 with no peek and no consume call at all", async () => {
    const store = makeFakeConcept2Store();
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const consumeSpy = vi.spyOn(store, "consumeAttemptFor");
    const { app } = buildApp({ available: false, store });
    const res = await request(app).get("/api/concept2/callback?state=x&code=y");
    expect(res.status).toBe(403);
    expect(peekSpy).not.toHaveBeenCalled();
    expect(consumeSpy).not.toHaveBeenCalled();
  });

  it("exchange: unavailable -> 403 before any store call", async () => {
    const store = makeFakeConcept2Store();
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const { app } = buildApp({ available: false, store });
    const res = await asA(
      request(app)
        .post("/api/concept2/exchange")
        .send({ code: "c", state: "s" }),
    );
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "unavailable" });
    expect(peekSpy).not.toHaveBeenCalled();
  });

  it("link GET: unavailable -> {available:false} (200, not 4xx)", async () => {
    const { app } = buildApp({ available: false });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ available: false });
  });

  it("upload: unavailable -> 403", async () => {
    const { app, logs } = buildApp({ available: false });
    const id = await seedEligibleLog(logs, userA.id);
    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "unavailable" });
  });

  it("a linked user under flag-off: link persists, GET reports unavailable, upload refuses", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const { app, logs, setAvailable } = buildApp({ store });
    setAvailable(false);
    const id = await seedEligibleLog(logs, userA.id);

    const linkRes = await asA(request(app).get("/api/concept2/link"));
    expect(linkRes.body).toStrictEqual({ available: false });

    const uploadRes = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(uploadRes.status).toBe(403);
    expect(await store.getLink(userA.id)).not.toBeNull();
  });
});

// Wave E per-user gate (.superpowers/c2-user-gate-brief.md). The matrix
// above moves ONE boolean and watches every route follow it; this describe
// holds that boolean TRUE and moves the identity instead, because the
// failure that matters here is a gate that opens for the wrong person, and
// no amount of "flag off -> 403" can see it. Every test below runs userA
// (on the list) and userB (off it) against the SAME app, so a route that
// silently kept `available()` answers identically for both and reddens.
//
// The allowlist is passed as the raw env string and parsed by the
// production `parseAllowlist` (buildApp), so "unset means nobody" is
// asserted about the real parse rather than about a `new Set()` written
// here.
describe("per-user gate (C2_ALLOWED_EMAILS)", () => {
  const ONLY_A = userA.email;

  it("mint: an off-list user gets 403 and no attempt is created; the on-list user still mints", async () => {
    const store = makeFakeConcept2Store();
    const createAttemptSpy = vi.spyOn(store, "createAttempt");
    const { app } = buildApp({ c2AllowedEmails: ONLY_A, store });

    const denied = await asB(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(denied.status).toBe(403);
    expect(denied.body).toStrictEqual({ error: "unavailable" });
    expect(createAttemptSpy).not.toHaveBeenCalled();

    const allowed = await asA(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(allowed.status).toBe(200);
    expect(createAttemptSpy).toHaveBeenCalledTimes(1);
  });

  it("exchange: an off-list user gets 403 before any attempt is peeked", async () => {
    const store = makeFakeConcept2Store();
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const { app } = buildApp({ c2AllowedEmails: ONLY_A, store });

    const denied = await asB(
      request(app)
        .post("/api/concept2/exchange")
        .send({ code: "c", state: "s" }),
    );
    expect(denied.status).toBe(403);
    expect(denied.body).toStrictEqual({ error: "unavailable" });
    expect(peekSpy).not.toHaveBeenCalled();
  });

  // The one non-403 row of the matrix, and the reason the client needs no
  // change: an off-list rower reads the SAME `{available:false}` a flag-off
  // server sends, which both surfaces already render as "no card".
  // Deliberately asserted on a user who HAS a link row: the response must
  // be the capability answer, not "not linked", and it must leak neither
  // the account id nor the origin.
  it("GET /link: an off-list user reads {available:false} even holding a link row", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userB.id, freshLink({ c2UserId: 4477 }));
    const { app } = buildApp({ c2AllowedEmails: ONLY_A, store });

    const denied = await asB(request(app).get("/api/concept2/link"));
    expect(denied.status).toBe(200);
    expect(denied.body).toStrictEqual({ available: false });

    const allowed = await asA(request(app).get("/api/concept2/link"));
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ available: true, linked: false });
  });

  // F4 ruling (fix round 1) — the ONE authed route that stays on the global
  // check, and the reason is a product one: a capability gate closes USE,
  // not revocation. Gating this meant an off-list rower could not disconnect
  // their own Concept2 account, so the row and its LIVE TOKENS persisted
  // with no self-service exit — the gate would have created the hazard it
  // exists to bound. Reading is still gated (`GET /link` answers
  // `{available:false}`), so the card is absent; the door out is not.
  it("DELETE /link: an off-list user can still disconnect, and the row is really gone", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userB.id, freshLink());
    const { app } = buildApp({ c2AllowedEmails: ONLY_A, store });

    const res = await asB(request(app).delete("/api/concept2/link"));
    expect(res.status).toBe(204);
    expect(await store.getLink(userB.id)).toBeNull();
  });

  // The global gate still closes it: "revocation is not per-user gated" is
  // not "revocation is ungated".
  it("DELETE /link: the global gate still refuses when the surface is off entirely", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const { app } = buildApp({
      c2AllowedEmails: ONLY_A,
      available: false,
      store,
    });

    const res = await asA(request(app).delete("/api/concept2/link"));
    expect(res.status).toBe(403);
    expect(await store.getLink(userA.id)).not.toBeNull();
  });

  it("upload: an off-list user gets 403 and nothing is sent to Concept2", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userB.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 1 });
    const { app, logs } = buildApp({
      c2AllowedEmails: ONLY_A,
      store,
      client,
    });
    const id = await seedEligibleLog(logs, userB.id);

    const denied = await asB(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(denied.status).toBe(403);
    expect(denied.body).toStrictEqual({ error: "unavailable" });
    expect(client.postResult).not.toHaveBeenCalled();
  });

  // The fail-closed direction, at the ROUTE layer rather than the pure
  // function's: an empty list must mean nobody, including the user the
  // sign-in allowlist already admits.
  // F6 (fix round 1): `NATIVE_MINT`, not `{}`. A bearer mint with an empty
  // body answers 409 `update_required` on its own, so posting `{}` here
  // would discriminate one refusal from another rather than admission from
  // refusal — and would still pass if the body check ever moved above the
  // availability check. With `NATIVE_MINT` the only reason for a non-200 is
  // the gate.
  it("an empty C2_ALLOWED_EMAILS denies everyone, on a flag that is fully ON", async () => {
    const { app } = buildApp({ c2AllowedEmails: "" });
    expect(
      (await asA(request(app).post("/api/concept2/connect").send(NATIVE_MINT)))
        .status,
    ).toBe(403);
    expect(
      (await asA(request(app).get("/api/concept2/link"))).body,
    ).toStrictEqual({ available: false });
  });

  it("a list of only separators denies everyone", async () => {
    const { app } = buildApp({ c2AllowedEmails: " , ," });
    expect(
      (await asA(request(app).post("/api/concept2/connect").send(NATIVE_MINT)))
        .status,
    ).toBe(403);
  });

  // `parseAllowlist` lower-cases and trims both sides; the entry a human
  // types into a host `.env` is not the string Google hands us.
  // BOTH sides of `isAllowed`, because each is a separate production path
  // and a test that moved only one would pass through a mutation to the
  // other. The ENTRY side is what a human typed into a host `.env`
  // (padded, upper-cased); the CANDIDATE side is `req.user!.email`, which
  // is whatever case Google's account carries.
  it("a list entry that differs only in case and padding still admits the rower", async () => {
    const { app } = buildApp({
      c2AllowedEmails: `  ${userA.email.toUpperCase()} , `,
    });
    const res = await asA(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(res.status).toBe(200);
  });

  it("a signed-in email that differs only in case from the list entry still admits the rower", async () => {
    const { app } = buildApp({ c2AllowedEmails: ONLY_A });
    const res = await asAMixedCase(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(res.status).toBe(200);
  });

  // F2 ruling (fix round 1). This test used to assert the OPPOSITE, on a
  // comment claiming a per-user check here "would mean inventing a
  // principal". The same handler falsifies that: step 3 resolves a full
  // cookie `SessionUser` and step 8 already reads its email to render the
  // Linked page. The residue the claim hid is what this test now closes —
  // an attempt lives for 15 minutes (`ATTEMPT_MAX_AGE_MS`), so a rower
  // removed from the list mid-window would otherwise complete the callback
  // and walk away with a link row holding LIVE TOKENS.
  //
  // The attempt is seeded directly because the mint would refuse it: the
  // arrangement is deliberately the one where the two hops disagree, which
  // is the only state the per-callback check is for.
  it("callback: an off-list principal is refused AFTER the principal is resolved — no exchange, no link, and the attempt survives", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const consumeSpy = vi.spyOn(store, "consumeAttemptFor");
    const { app } = buildApp({ c2AllowedEmails: "", store, client });
    await store.createAttempt({
      nonce: "seeded-nonce",
      userId: userA.id,
      surface: "web",
    });

    const res = await asACookie(
      request(app).get("/api/concept2/callback?state=seeded-nonce&code=abc123"),
    );
    expect(res.status).toBe(403);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("CONCEPT2 LINK · UNAVAILABLE · HTTP 403");
    expect(client.exchangeCode).not.toHaveBeenCalled();
    expect(await store.getLink(userA.id)).toBeNull();
    // Consumes NOTHING, exactly like the global check above it: the refusal
    // is read-only, so the same state completes once the rower is added
    // back to the list.
    expect(peekSpy).not.toHaveBeenCalled();
    expect(consumeSpy).not.toHaveBeenCalled();
    expect(await store.peekAttempt("seeded-nonce")).not.toBeNull();
  });

  // The ORDER the ruling asked for, pinned independently of the refusal
  // itself: the per-user check sits AFTER step 3, so a caller carrying no
  // session still reads "not signed in" rather than a capability answer.
  // Signing in is the action that page asks for, and telling an anonymous
  // browser the surface is unavailable would send them to fix the wrong
  // thing.
  it("callback: a signed-OUT caller still reads notSignedIn, not unavailable, even off the list", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ c2AllowedEmails: "", store });
    await store.createAttempt({
      nonce: "seeded-nonce",
      userId: userA.id,
      surface: "web",
    });

    const res = await request(app).get(
      "/api/concept2/callback?state=seeded-nonce&code=abc123",
    );
    expect(res.text).toContain("NOT SIGNED IN");
  });

  // The allow direction of the same hop, so the refusal above is not the
  // only thing this route is pinned on: an ON-list principal completes.
  it("callback: an on-list principal still completes the link", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ c2AllowedEmails: ONLY_A, store, client });

    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("CONCEPT2 LINK · LINKED · HTTP 200");
    expect(await store.getLink(userA.id)).not.toBeNull();
  });

  // The conjunct, at the route layer: being on the C2 list never opens a
  // surface the flag has closed.
  it("on the list but the global gate is off -> still refused", async () => {
    const { app } = buildApp({ c2AllowedEmails: ONLY_A, available: false });
    const res = await asA(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(res.status).toBe(403);
  });
});

describe("mint (POST /api/concept2/connect)", () => {
  it("cookie mint -> surface 'web', the WEB redirect in the URL, and the response carries state === the URL's state", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send({}),
    );
    expect(res.status).toBe(200);
    const url = new URL(res.body.authorizeUrl as string);
    expect(url.searchParams.get("redirect_uri")).toBe(WEB_REDIRECT_URI);
    expect(res.body.state).toBe(url.searchParams.get("state"));
    expect(await store.peekAttempt(res.body.state as string)).toStrictEqual({
      userId: userA.id,
      surface: "web",
    });
  });

  it("bearer mint WITH linkClient 'webauth-1' -> surface 'native' and the NATIVE redirect", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const res = await asA(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(res.status).toBe(200);
    const url = new URL(res.body.authorizeUrl as string);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "haus.waffle.ergomatic://oauth/callback",
    );
    expect((await store.peekAttempt(res.body.state as string))?.surface).toBe(
      "native",
    );
  });

  // Design §3: a bearer mint must DECLARE it can receive the native
  // redirect — the capability precondition that makes the flag flip safe
  // against an installed build predating the WebAuth plugin.
  it("bearer mint WITHOUT linkClient -> 409 update_required, nothing minted", async () => {
    const store = makeFakeConcept2Store();
    const createSpy = vi.spyOn(store, "createAttempt");
    const { app } = buildApp({ store });
    const res = await asA(request(app).post("/api/concept2/connect").send({}));
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "update_required" });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("bearer mint with a WRONG linkClient value -> 409 update_required", async () => {
    const { app } = buildApp();
    const res = await asA(
      request(app)
        .post("/api/concept2/connect")
        .send({ linkClient: "webauth-0" }),
    );
    expect(res.status).toBe(409);
  });

  it("a cookie mint ignores linkClient (web needs no declaration)", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(res.status).toBe(200);
    expect((await store.peekAttempt(res.body.state as string))?.surface).toBe(
      "web",
    );
  });

  // Nothing else asserts the nonce's actual shape or that two mints
  // produce different ones — `randomBytes(32).toString("hex")` could be
  // replaced with a constant or a shorter/predictable value and every
  // other test would still pass.
  it("the minted nonce is 64 hex characters (randomBytes(32).toString('hex'))", async () => {
    const { app } = buildApp();
    const state = await mintAndGetState(app);
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two mints produce DIFFERENT nonces", async () => {
    const { app } = buildApp();
    const first = await mintAndGetState(app);
    const second = await mintAndGetState(app, asBCookie);
    expect(first).not.toBe(second);
  });

  it("a re-mint REPLACES the user's live attempt: the old state is unknown afterwards", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const first = await mintAndGetState(app);
    const second = await mintAndGetState(app);
    expect(await store.peekAttempt(first)).toBeNull();
    expect(await store.peekAttempt(second)).not.toBeNull();
  });

  // Design §2: a new nonce colliding with another row's PK surfaces as a
  // unique violation; the route retries ONCE with a fresh nonce, then 500s.
  it("a PK collision on the first nonce retries once with a DIFFERENT nonce and succeeds", async () => {
    const store = makeFakeConcept2Store();
    const realCreate = store.createAttempt.bind(store);
    const createSpy = vi
      .spyOn(store, "createAttempt")
      .mockRejectedValueOnce(new AttemptNonceCollisionError())
      .mockImplementation(realCreate);
    const { app } = buildApp({ store });
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send({}),
    );
    expect(res.status).toBe(200);
    expect(createSpy).toHaveBeenCalledTimes(2);
    const [first, second] = createSpy.mock.calls.map((c) => c[0].nonce);
    expect(first).not.toBe(second);
    expect(res.body.state).toBe(second);
  });

  it("two consecutive PK collisions -> 500, no third try", async () => {
    const store = makeFakeConcept2Store();
    const createSpy = vi
      .spyOn(store, "createAttempt")
      .mockRejectedValue(new AttemptNonceCollisionError());
    const { app } = buildApp({ store });
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send({}),
    );
    expect(res.status).toBe(500);
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it("IGNORES a weightClass an older installed build still sends, rather than refusing it", async () => {
    // Ruling (i): the mint takes nothing about the rower, and the field is
    // read by nothing. Refusing an unknown key would brick every unupdated
    // TestFlight build the moment this deploys — PR1.75b's installed build
    // sends `{weightClass, linkClient}` on native. So the value is dropped
    // on the floor, and the mint succeeds.
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send({ weightClass: "X" }),
    );
    expect(res.status).toBe(200);
    expect(typeof res.body.state).toBe("string");
  });

  it("a request with no body at all (req.body left undefined by express.json) is treated as empty, not a crash", async () => {
    const { app } = buildApp();
    // Deliberately no `.send()`/Content-Type: `express.json()` only ever
    // sets `req.body` for a matching Content-Type, so this exercises the
    // `isRec` fallback for real, not a body-parser 400 of its own. A COOKIE
    // mint needs no `linkClient`, so an empty body is a legitimate web mint
    // and now succeeds (before ruling (i) this 400'd on the missing class).
    const res = await asACookie(request(app).post("/api/concept2/connect"));
    expect(res.status).toBe(200);
    expect(typeof res.body.state).toBe("string");
  });

  // Pinned with the INDEPENDENT literal 900_000 (15 minutes in ms), not
  // the imported `ATTEMPT_MAX_AGE_MS` — retuning the production constant
  // would otherwise retune this assertion right along with it (RF21), so
  // the test could never catch a wrong value.
  it("garbage-collects expired attempts before creating a new one (no cron); per-user replacement is the upsert's, not a delete", async () => {
    const store = makeFakeConcept2Store();
    const gcExpired = vi.spyOn(store, "deleteExpiredAttempts");
    const { app } = buildApp({ store });
    await asACookie(request(app).post("/api/concept2/connect").send({}));
    expect(gcExpired).toHaveBeenCalledWith(900_000);
  });
});

describe("callback (GET /api/concept2/callback) — the web ladder, design §5", () => {
  it("happy path: the minting user's cookie -> 200 Linked page naming BOTH identities, link written, exchange used the WEB redirect", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("CONCEPT2 LINK · LINKED · HTTP 200");
    expect(res.text.replace(/<[^>]+>/g, "")).toContain(
      "Concept2 jmorelli is now connected to Ergomatic a@x.com.",
    );
    expect(client.exchangeCode).toHaveBeenCalledWith(
      "abc123",
      WEB_REDIRECT_URI,
    );

    const link = await store.getLink(userA.id);
    expect(link?.c2UserId).toBe(2211);
  });

  it("no cookie session -> 401 Not signed in, attempt NOT consumed, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(res.status).toBe(401);
    expect(res.text).toContain("CONCEPT2 LINK · NOT SIGNED IN · HTTP 401");
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  // Design §5 step 3: the web callback's principal is the erg_session
  // COOKIE, never a bearer — a bearer on a top-level GET can only come from
  // a non-browser caller, and accepting it would hand the browser-hop
  // completion to whoever can set a header. Falling back to the bearer
  // (`resolveCookieSession(req) ?? resolveBearerSession(req)`) passed every
  // other test in this file, including the wrong-account one, because no
  // other case presents a bearer alone.
  it("the MINTING user's own bearer, with no cookie -> 401 Not signed in, attempt still present, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await asA(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(401);
    expect(res.text).toContain("CONCEPT2 LINK · NOT SIGNED IN · HTTP 401");
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).toHaveBeenCalledTimes(0);
    expect(await store.getLink(userA.id)).toBeNull();
  });

  it("an EMPTY-valued cookie is no session: 401, not consumed", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const state = await mintAndGetState(app);
    const res = await request(app)
      .get(`/api/concept2/callback?state=${state}&code=abc123`)
      .set("Cookie", `${SESSION_COOKIE}=`);
    expect(res.status).toBe(401);
    expect(await store.peekAttempt(state)).not.toBeNull();
  });

  // Exit criterion 1: the rightful user's attempt SURVIVES a wrong-principal
  // presentation (the DoS leg), and the token exchange is never called.
  it("a DIFFERENT user's cookie -> 403 Wrong account, attempt NOT consumed, exchange never called, no link for anyone", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await asBCookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(403);
    expect(res.text).toContain("CONCEPT2 LINK · WRONG ACCOUNT · HTTP 403");
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
    expect(await store.getLink(userA.id)).toBeNull();
    expect(await store.getLink(userB.id)).toBeNull();

    // The rightful user can still complete afterwards.
    const rightful = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(rightful.status).toBe(200);
  });

  // Exit criterion 2: a native-minted nonce cannot complete on the web
  // surface, and is not consumed by the attempt.
  it("a NATIVE-minted state on the web callback -> 400 Expired, NOT consumed, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);

    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain("CONCEPT2 LINK · EXPIRED · HTTP 400");
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it("an unknown state -> 400 Expired, exchange never called", async () => {
    const client = makeStubClient();
    const { app } = buildApp({ client });
    const res = await asACookie(
      request(app).get("/api/concept2/callback?state=nope&code=abc123"),
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain("CONCEPT2 LINK · EXPIRED · HTTP 400");
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it("missing state or code -> 400 Incomplete", async () => {
    const { app } = buildApp();
    const res1 = await asACookie(
      request(app).get("/api/concept2/callback?code=abc"),
    );
    expect(res1.status).toBe(400);
    expect(res1.text).toContain("CONCEPT2 LINK · INCOMPLETE · HTTP 400");
    const res2 = await asACookie(
      request(app).get("/api/concept2/callback?state=xyz"),
    );
    expect(res2.status).toBe(400);
    expect(res2.text).toContain("CONCEPT2 LINK · INCOMPLETE · HTTP 400");
  });

  it("a second use of the same nonce -> 400 Expired (single-use)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const first = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(first.status).toBe(200);
    const second = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(second.status).toBe(400);
    expect(client.exchangeCode).toHaveBeenCalledTimes(1);
  });

  // Design §5 step 7: consumeAttemptFor is the AUTHORITY; a null between
  // peek and consume (a concurrent completion or a re-mint won) is 400
  // without any exchange.
  it("a concurrent consume between peek and consume -> 400 Expired, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    vi.spyOn(store, "consumeAttemptFor").mockResolvedValueOnce(null);

    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(400);
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  // Pinned with INDEPENDENT literal ms values (14:59 = 899_000, 15:01 =
  // 901_000), never the imported `ATTEMPT_MAX_AGE_MS` (RF21).
  it("an attempt 14:59 old is still fresh (literal ms)", async () => {
    let t = 0;
    const clock = () => new Date(t);
    const store = makeFakeConcept2Store(clock);
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    t += 899_000;
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
  });

  it("an attempt 15:01 old -> 400 Expired, the row deleted (right principal, stale), exchange never called", async () => {
    let t = 0;
    const clock = () => new Date(t);
    const store = makeFakeConcept2Store(clock);
    const client = makeStubClient();
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    t += 901_000;
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain("CONCEPT2 LINK · EXPIRED · HTTP 400");
    expect(await store.peekAttempt(state)).toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it("exchange failure -> 502 Failed, and the nonce is not reusable", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: false,
      grantDead: false,
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(502);
    expect(res.text).toContain("CONCEPT2 LINK · FAILED · HTTP 502");
    const retry = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(retry.status).toBe(400);
    expect(await store.getLink(userA.id)).toBeNull();
  });

  it("fetchMe failure -> 502 Failed", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    // Neither of this test's callback paths distinguishes the two kinds —
    // both answer 502 — so the discriminator is set to the retryable one
    // rather than the 401 that would also flag a grant.
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: false,
      kind: "c2_error",
      status: 500,
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(502);
    expect(await store.getLink(userA.id)).toBeNull();
  });

  // D1 (APPROVED): the Concept2 account is already connected to a DIFFERENT
  // Ergomatic user -> 409 page, tokens discarded, no link for the presenter.
  it("D1: a Concept2 account already linked to another user -> 409 Already linked, no link written for the presenter", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userB.id, freshLink({ c2UserId: 2211 }));
    const client = makeStubClient();
    stubHappyExchange(client, 2211);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(409);
    expect(res.text).toContain("CONCEPT2 LINK · ALREADY LINKED · HTTP 409");
    expect(await store.getLink(userA.id)).toBeNull();
    expect((await store.getLink(userB.id))?.c2UserId).toBe(2211);
  });

  it("a username-less fetchMe falls back to the numeric id on the Linked page (observation 3)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: null,
      weight: 8200,
      gender: "M",
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    expect(res.text.replace(/<[^>]+>/g, "")).toContain(
      "Concept2 account #2211 is now connected to Ergomatic a@x.com.",
    );
  });

  it("names the numeric account the SAME way the card does when Concept2 sends no username", async () => {
    // Two shapes, one fallback: absent and empty are both "no identity",
    // and both must read `account #2211` — the exact spelling the card's
    // `identityLine` uses, so a rower meets one identity, not two.
    const rendered: string[] = [];
    for (const username of [null, ""] as const) {
      const store = makeFakeConcept2Store();
      const client = makeStubClient();
      stubHappyExchange(client);
      vi.mocked(client.fetchMe).mockResolvedValue({
        ok: true,
        c2UserId: 2211,
        username,
        weight: 8200,
        gender: "M",
      });
      const { app } = buildApp({ store, client });
      const state = await mintAndGetState(app);
      const res = await asACookie(
        request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
      );
      rendered.push(res.text.replace(/<[^>]+>/g, ""));
    }
    expect(
      rendered.map((text) =>
        text.includes("Concept2 account #2211 is now connected to"),
      ),
    ).toStrictEqual([true, true]);
  });

  it("a real callback exchange stores the username GET /link then reports", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "jamesawesome",
      // `weight`/`gender` are required on the success shape after step A5.
      // Present-and-plausible here because this test is about the
      // username; the derivation's own cases live in mapping.test.ts.
      weight: 8200,
      gender: "M",
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const done = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(done.status).toBe(200);
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.body.c2Username).toBe("jamesawesome");
  });

  it("stores NO username rather than an empty one when Concept2 sends a blank", async () => {
    // `""` is what `client.ts`'s fetchMe passes through for a blank field
    // (observation 18); `??` would store it and the card would render a gap
    // where the account name belongs.
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "",
      weight: 8200,
      gender: "M",
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.body.c2Username).toBeNull();
  });

  it("relinking clears a previously-set needsReauthAt", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    await store.withLinkLock(userA.id, async () => ({
      action: "flagReauth" as const,
      result: undefined,
    }));
    expect((await store.getLink(userA.id))?.needsReauthAt).not.toBeNull();
    const client = makeStubClient();
    stubHappyExchange(client, LINK_INPUT.c2UserId);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    expect((await store.getLink(userA.id))?.needsReauthAt).toBeNull();
  });

  // Design §5: every response sets Referrer-Policy: no-referrer — the URL
  // carries `code` and `state` (RFC 9700 §4.2).
  it("sets Referrer-Policy: no-referrer on EVERY callback response (403/400/401/403/200/502)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app, setAvailable } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const responses: request.Response[] = [];
    setAvailable(false);
    responses.push(
      await request(app).get("/api/concept2/callback?state=x&code=y"),
    );
    setAvailable(true);
    responses.push(await request(app).get("/api/concept2/callback"));
    responses.push(
      await request(app).get(`/api/concept2/callback?state=${state}&code=c`),
    );
    responses.push(
      await asBCookie(
        request(app).get(`/api/concept2/callback?state=${state}&code=c`),
      ),
    );
    responses.push(
      await asACookie(
        request(app).get(`/api/concept2/callback?state=${state}&code=c`),
      ),
    );
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: false,
      grantDead: false,
    });
    const again = await mintAndGetState(app);
    responses.push(
      await asACookie(
        request(app).get(`/api/concept2/callback?state=${again}&code=c`),
      ),
    );
    expect(responses.map((r) => r.status)).toStrictEqual([
      403, 400, 401, 403, 200, 502,
    ]);
    for (const r of responses) {
      expect(r.headers["referrer-policy"]).toBe("no-referrer");
    }
  });

  // The header must also survive the exits this handler does not write: a
  // store method that REJECTS unwinds past every `sendPage` call and lands
  // on Express's default error handler, which writes its own 500 body.
  // `finalhandler` removes only the Content-* headers before doing so, so a
  // header set at the top of the handler survives — asserted, not assumed.
  it("a rejected store call -> 500 from Express's own handler, still Referrer-Policy: no-referrer", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const state = await mintAndGetState(app);
    vi.spyOn(store, "peekAttempt").mockRejectedValueOnce(
      new Error("peek exploded"),
    );
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(500);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  // A standing-constraint regression gate, same class as the no-anchor and
  // Referrer-Policy assertions above: an unminted `state` falls through the
  // callback ladder to the Expired page, and interpolating `state` (or
  // `code`) into that page's HTML — instead of using it only to look up the
  // attempt — reddens this test.
  it("never reflects state/code into the HTML response", async () => {
    const { app } = buildApp();
    const res = await asACookie(
      request(app).get(
        `/api/concept2/callback?state=${encodeURIComponent("<script>alert(1)</script>")}&code=${encodeURIComponent("<img src=x onerror=alert(2)>")}`,
      ),
    );
    expect(res.text).not.toContain("<script>alert(1)</script>");
    expect(res.text).not.toContain("<img src=x onerror=alert(2)>");
  });

  it("the Linked page escapes a hostile Concept2 username end-to-end", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "<script>alert(1)</script>",
      weight: 8200,
      gender: "M",
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<script>alert(1)</script>");
    expect(res.text).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("exchange (POST /api/concept2/exchange) — the native ladder, design §6", () => {
  it("happy path: same bearer -> 200 {linked:true, c2UserId}, exchange used the NATIVE redirect, link written", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const res = await asA(
      request(app)
        .post("/api/concept2/exchange")
        .send({ code: "abc123", state }),
    );
    expect(res.status).toBe(200);
    // No `weightClass` (ruling i): the column it was read from is gone and
    // `adapters/linkFlow.ts`'s `linked` outcome stopped declaring the field
    // in the same commit. `toStrictEqual` is what makes this the assertion
    // that catches a re-added one.
    expect(res.body).toStrictEqual({
      linked: true,
      c2UserId: 2211,
    });
    expect(client.exchangeCode).toHaveBeenCalledWith(
      "abc123",
      "haus.waffle.ergomatic://oauth/callback",
    );
    expect((await store.getLink(userA.id))?.c2UserId).toBe(2211);
    expect(JSON.stringify(res.body)).not.toContain("at-1");
  });

  // The echo-independence test (design §Testing): the attempt is located by
  // the BODY's state alone — nothing else on the request names it.
  it("locates the attempt from body.state only (no query, no header)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const wrong = await asA(
      request(app)
        .post(`/api/concept2/exchange?state=${state}`)
        .send({ code: "abc123", state: "not-the-state" }),
    );
    expect(wrong.status).toBe(400);
    expect(wrong.body).toStrictEqual({ error: "invalid_state" });
    const right = await asA(
      request(app)
        .post("/api/concept2/exchange")
        .send({ code: "abc123", state }),
    );
    expect(right.status).toBe(200);
  });

  it("body shape: missing code or state -> 400 field-named, nothing peeked", async () => {
    const store = makeFakeConcept2Store();
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const { app } = buildApp({ store });
    const noCode = await asA(
      request(app).post("/api/concept2/exchange").send({ state: "s" }),
    );
    expect(noCode.status).toBe(400);
    expect(noCode.body.field).toBe("code");
    const noState = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c" }),
    );
    expect(noState.status).toBe(400);
    expect(noState.body.field).toBe("state");
    expect(peekSpy).not.toHaveBeenCalled();
  });

  // Step 2b: the request states its own credential class before anything
  // is peeked.
  it("a COOKIE caller -> 400 wrong_surface before any peek", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const res = await asACookie(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({ error: "wrong_surface" });
    expect(peekSpy).not.toHaveBeenCalled();
    expect(await store.peekAttempt(state)).not.toBeNull();
  });

  it("an unknown state -> 400 invalid_state", async () => {
    const { app } = buildApp();
    const res = await asA(
      request(app)
        .post("/api/concept2/exchange")
        .send({ code: "c", state: "nope" }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({ error: "invalid_state" });
  });

  // Exit criterion 2, the other direction.
  it("a WEB-minted state -> 400 wrong_surface, NOT consumed, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({ error: "wrong_surface" });
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  // Exit criterion 1, native.
  it("a DIFFERENT user's bearer -> 403 principal_mismatch, NOT consumed, exchange never called, no link", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const res = await asB(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "principal_mismatch" });
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
    expect(await store.getLink(userB.id)).toBeNull();
    expect(await store.getLink(userA.id)).toBeNull();
  });

  it("a concurrent consume between peek and consume -> 400 invalid_state, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    vi.spyOn(store, "consumeAttemptFor").mockResolvedValueOnce(null);
    const res = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({ error: "invalid_state" });
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it("an attempt 15:01 old -> 400 expired (row deleted), 14:59 -> 200 (literal ms)", async () => {
    let t = 0;
    const clock = () => new Date(t);
    const store = makeFakeConcept2Store(clock);
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const stale = await mintAndGetState(app, asA, NATIVE_MINT);
    t += 901_000;
    const expired = await asA(
      request(app)
        .post("/api/concept2/exchange")
        .send({ code: "c", state: stale }),
    );
    expect(expired.status).toBe(400);
    expect(expired.body).toStrictEqual({ error: "expired" });
    expect(await store.peekAttempt(stale)).toBeNull();

    const fresh = await mintAndGetState(app, asA, NATIVE_MINT);
    t += 899_000;
    const ok = await asA(
      request(app)
        .post("/api/concept2/exchange")
        .send({ code: "c", state: fresh }),
    );
    expect(ok.status).toBe(200);
  });

  it("exchange failure -> 502 c2_error; fetchMe failure -> 502 c2_error", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: false,
      grantDead: false,
    });
    const { app } = buildApp({ store, client });
    const s1 = await mintAndGetState(app, asA, NATIVE_MINT);
    const r1 = await asA(
      request(app)
        .post("/api/concept2/exchange")
        .send({ code: "c", state: s1 }),
    );
    expect(r1.status).toBe(502);
    expect(r1.body).toStrictEqual({ error: "c2_error" });

    stubHappyExchange(client);
    // Neither of this test's callback paths distinguishes the two kinds —
    // both answer 502 — so the discriminator is set to the retryable one
    // rather than the 401 that would also flag a grant.
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: false,
      kind: "c2_error",
      status: 500,
    });
    const s2 = await mintAndGetState(app, asA, NATIVE_MINT);
    const r2 = await asA(
      request(app)
        .post("/api/concept2/exchange")
        .send({ code: "c", state: s2 }),
    );
    expect(r2.status).toBe(502);
    expect(r2.body).toStrictEqual({ error: "c2_error" });
    expect(await store.getLink(userA.id)).toBeNull();
  });

  it("D1: the Concept2 account already belongs to another user -> 409 already_linked_elsewhere, no link written", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userB.id, freshLink({ c2UserId: 2211 }));
    const client = makeStubClient();
    stubHappyExchange(client, 2211);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const res = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "already_linked_elsewhere" });
    expect(await store.getLink(userA.id)).toBeNull();
  });
});

// RF24: every other test in this file constructs the router DIRECTLY, so
// nothing here starts upstream of `app.ts`'s own wiring — and the web
// ladder's identity check reads a dep (`sessions`) that only `app.ts`
// supplies. `baseDeps`'s default `sessions` is literally
// `{ resolveSession: async () => null }`, i.e. the exact mutation, so a
// wiring line that stopped passing `deps.sessions` would leave every
// assertion above green while no rower could ever complete a link. This
// describe enters through `createApp` instead. (Task 7's integration rows
// cover the same seam against real Postgres; this is the cheap unit-layer
// half, and it also pins the mount order — the concept2 router must be
// reached before `routes/data.ts`'s app-wide `requireUser`, which would
// answer the cookie callback with a bare JSON 401.)
describe("createApp wiring (RF24: the seam the router-level tests skip)", () => {
  it("a cookie mint and cookie callback complete end-to-end through createApp", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const app = createApp(
      baseDeps({
        sessions: fakeSessionStore(),
        stores: makeFakeStores(),
        concept2: {
          available: () => true,
          availableFor: (email: string) =>
            computeAvailableFor(true, parseAllowlist(userA.email), email),
          store,
          client,
          webRedirectUri: WEB_REDIRECT_URI,
          logbookBaseUrl: LOGBOOK_BASE_URL,
        },
      }),
    );

    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    // `text/html`, not JSON: proof the request never fell through to the
    // data router's own gate.
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("CONCEPT2 LINK · LINKED · HTTP 200");
    expect(client.exchangeCode).toHaveBeenCalledWith(
      "abc123",
      WEB_REDIRECT_URI,
    );
    expect((await store.getLink(userA.id))?.c2UserId).toBe(2211);
  });

  // Wave E per-user gate, at the ONE layer that can see a wiring mistake:
  // `app.ts` passes `availableFor` from its own deps, and TypeScript's
  // parameter-bivariance means a typo'd `availableFor: concept2Deps
  // .available` COMPILES — a zero-arg function is assignable to a one-arg
  // type. Every other test in this file constructs the router directly and
  // would stay green through exactly that mistake, with the gate wide open
  // for everyone the flag admits. This one enters through `createApp`, with
  // an `availableFor` that admits userA alone, and moves the identity.
  it("createApp threads availableFor: userB is refused where userA is served", async () => {
    const app = createApp(
      baseDeps({
        sessions: fakeSessionStore(),
        stores: makeFakeStores(),
        concept2: {
          available: () => true,
          availableFor: (email: string) =>
            computeAvailableFor(true, parseAllowlist(userA.email), email),
          store: makeFakeConcept2Store(),
          client: makeStubClient(),
          webRedirectUri: WEB_REDIRECT_URI,
          logbookBaseUrl: LOGBOOK_BASE_URL,
        },
      }),
    );

    const allowed = await asA(request(app).get("/api/concept2/link"));
    expect(allowed.body).toStrictEqual({ available: true, linked: false });

    const denied = await asB(request(app).get("/api/concept2/link"));
    expect(denied.body).toStrictEqual({ available: false });

    const deniedMint = await asB(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(deniedMint.status).toBe(403);
  });
});

describe("link (GET/DELETE /api/concept2/link)", () => {
  it("GET: available, not linked", async () => {
    const { app } = buildApp();
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ available: true, linked: false });
  });

  // The sent-state contract (spec F8) renders "sent" only when a row's
  // c2_user_id matches the LIVE link's, and the View-on-Concept2 URL is
  // /profile/{c2_user_id}/log/{result_id} — PR2 needs c2UserId off this
  // response. Pinned with toStrictEqual so an accidental extra/renamed
  // field fails loudly; that strictness is the leak check, so this stays
  // `toStrictEqual` rather than loosening to `toMatchObject`.
  it("GET: available, linked — carries c2UserId, tokens never serialized", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ c2UserId: 4477 }));
    const { app } = buildApp({ store });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      available: true,
      linked: true,
      c2UserId: 4477,
      // `freshLink()` passes no username, and the store's input field is
      // OPTIONAL — so this asserts the store's own `?? null` default as
      // well as the response's projection.
      c2Username: null,
      logbookBaseUrl: LOGBOOK_BASE_URL,
      needsReauth: false,
    });
    expect(JSON.stringify(res.body)).not.toContain(LINK_INPUT.accessToken);
    expect(JSON.stringify(res.body)).not.toContain(LINK_INPUT.refreshToken);
  });

  it("GET /link names the linked Concept2 username and the logbook origin", async () => {
    // The username discharges the account-injection detect-identity
    // treatment (ROADMAP's C2 row: the card "naming which account the link
    // goes to" ships with PR2). The origin exists because the client cannot
    // know whether this deployment talks to log.concept2.com or log-dev
    // (plan observation 5), and a wrong origin 404s the link-out silently.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ c2Username: "jamesawesome" }));
    const { app } = buildApp({ store });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: "jamesawesome",
      logbookBaseUrl: LOGBOOK_BASE_URL,
    });
    expect(res.body).not.toHaveProperty("accessToken");
    expect(res.body).not.toHaveProperty("refreshToken");
  });

  it("GET /link reports a null username rather than omitting the field", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ c2Username: null }));
    const { app } = buildApp({ store });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.body.c2Username).toBeNull();
  });

  it("GET /link leaks neither new field while the flag is off", async () => {
    const { app } = buildApp({ available: false });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.body).toStrictEqual({ available: false });
  });

  it("GET: needsReauth reflects a set needsReauthAt", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    await store.withLinkLock(userA.id, async () => ({
      action: "flagReauth" as const,
      result: undefined,
    }));
    const { app } = buildApp({ store });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.body.needsReauth).toBe(true);
  });

  it("DELETE: unavailable -> 403", async () => {
    const { app } = buildApp({ available: false });
    const res = await asA(request(app).delete("/api/concept2/link"));
    expect(res.status).toBe(403);
  });

  it("DELETE: removes the link (204), idempotent on a second call", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const { app } = buildApp({ store });
    const res = await asA(request(app).delete("/api/concept2/link"));
    expect(res.status).toBe(204);
    expect(await store.getLink(userA.id)).toBeNull();
    const again = await asA(request(app).delete("/api/concept2/link"));
    expect(again.status).toBe(204);
  });
});

describe("upload (POST /api/concept2/results/:logId)", () => {
  it("malformed logId -> 404", async () => {
    const { app } = buildApp();
    const res = await asA(
      request(app).post("/api/concept2/results/not-a-uuid").send({ tz: "UTC" }),
    );
    expect(res.status).toBe(404);
  });

  it("absent row -> 404", async () => {
    const { app } = buildApp();
    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${NON_EXISTENT_UUID}`)
        .send({ tz: "UTC" }),
    );
    expect(res.status).toBe(404);
  });

  it("a foreign user's request cannot reach another user's row -> 404", async () => {
    const { app, logs } = buildApp();
    const id = await seedEligibleLog(logs, userA.id);
    const res = await asB(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(404);
  });

  it("absent tz -> 400 field-named", async () => {
    const { app, logs } = buildApp();
    const id = await seedEligibleLog(logs, userA.id);
    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({}),
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("tz");
  });

  it("invalid tz -> 400 field-named", async () => {
    const { app, logs } = buildApp();
    const id = await seedEligibleLog(logs, userA.id);
    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "Not/AZone" }),
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("tz");
  });

  it("a request with no body at all (req.body left undefined by express.json) is treated as empty, not a crash", async () => {
    const { app, logs } = buildApp();
    const id = await seedEligibleLog(logs, userA.id);
    const res = await asA(request(app).post(`/api/concept2/results/${id}`));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("tz");
  });

  it("no link -> 409 unlinked", async () => {
    const { app, logs } = buildApp();
    const id = await seedEligibleLog(logs, userA.id);
    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "unlinked" });
  });

  it("a pre-flagged needsReauthAt short-circuits to 409 before eligibility or the client", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    await store.withLinkLock(userA.id, async () => ({
      action: "flagReauth" as const,
      result: undefined,
    }));
    const client = makeStubClient();
    const { app, logs } = buildApp({ store, client });
    // Deliberately INELIGIBLE (source: "manual", not "pm5" —
    // eligibilityFailure's gate since Door PR A §2.2): needs_reauth must
    // win before eligibility per the pinned check order.
    const id = await seedEligibleLog(logs, userA.id, {
      deviceName: null,
      source: "manual",
    });
    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "needs_reauth" });
    expect(client.postResult).not.toHaveBeenCalled();
  });

  // Door PR A (2026-09-02) §2.2: `eligibilityFailure`'s gate reads
  // `source`, not `deviceName` — a realistic non-monitor row overrides
  // BOTH (the biconditional forbids a `deviceName` on a non-pm5 row), not
  // `deviceName` alone.
  it("not_eligible -> 422 with reason", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const { app, logs } = buildApp({ store });
    const id = await seedEligibleLog(logs, userA.id, {
      deviceName: null,
      source: "manual",
    });
    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(422);
    expect(res.body).toStrictEqual({
      error: "not_eligible",
      reason: "not_monitor",
    });
  });

  it("happy path posts EXACTLY the fixture payload and returns 200 {resultId}", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.postResult).mockResolvedValue({
      ok: true,
      resultId: 85557,
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      resultId: 85557,
      weightClass: "H",
      weightClassSource: "declaration",
    });
    expect(client.postResult).toHaveBeenCalledWith(LINK_INPUT.accessToken, {
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
    });

    const stored = await logs.get(userA.id, id);
    expect(stored?.c2ResultId).toBe(85557);
    expect(stored?.c2UserId).toBe(LINK_INPUT.c2UserId);
  });

  it("legacy row: persists tz on the first attempt; a failed-then-retried upload from a DIFFERENT zone posts the SAME date (dedup stability)", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    const posted: Record<string, unknown>[] = [];
    vi.mocked(client.postResult).mockImplementation(
      async (_token: string, payload: Record<string, unknown>) => {
        posted.push(payload);
        if (posted.length === 1) return { ok: false, kind: "c2_error" };
        return { ok: true, resultId: 4242 };
      },
    );
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id, {
      completedAt: null,
      tz: null,
    });

    const first = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/Los_Angeles" }),
    );
    expect(first.status).toBe(502);
    const afterFirst = await logs.get(userA.id, id);
    expect(afterFirst?.tz).toBe("America/Los_Angeles");
    expect(afterFirst?.c2ResultId).toBeNull();

    const second = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(second.status).toBe(200);
    expect(posted).toHaveLength(2);
    expect(posted[0].date).toBe(posted[1].date);
    expect(posted[0].timezone).toBe("America/Los_Angeles");
    expect(posted[1].timezone).toBe("America/Los_Angeles");
  });

  // The missing matrix cell — `completedAt` SET but `tz` null (distinct
  // from the fully-legacy row above, which has BOTH null and so never
  // reaches `buildC2Payload`'s "paired" branch at all). This pins the
  // route's ordering: snapshotting the mapping row BEFORE `recordTz`
  // writes the resolved zone would leave `mappingRow.tz` `null` on
  // attempt 1 (falling to `loggedAt` + the request's own zone) while a
  // later attempt reads `row.tz` fresh, non-null, and the PAIRED branch
  // fires instead (`completedAt` + the now-stored zone) — two different
  // dates for the same row, breaking the exact dedup-stability property
  // this persist-on-first-use design exists for.
  it("a row with completedAt SET but tz null posts the SAME completedAt-based date on a first attempt and a retry", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    const posted: Record<string, unknown>[] = [];
    vi.mocked(client.postResult).mockImplementation(
      async (_token: string, payload: Record<string, unknown>) => {
        posted.push(payload);
        if (posted.length === 1) return { ok: false, kind: "c2_error" };
        return { ok: true, resultId: 9001 };
      },
    );
    const { app, logs } = buildApp({ store, client });
    // FINISHED_LOG_INPUT's own completedAt (non-null), tz forced null.
    const id = await seedEligibleLog(logs, userA.id, { tz: null });

    const first = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/Los_Angeles" }),
    );
    expect(first.status).toBe(502);

    const second = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(second.status).toBe(200);

    expect(posted).toHaveLength(2);
    expect(posted[0].date).toBe(posted[1].date);
    expect(posted[0].timezone).toBe("America/Los_Angeles");
    // The completedAt-based date, not a loggedAt-based one — proves the
    // PAIRED branch fired on attempt 1, not just that both attempts agree.
    expect(posted[0].date).toBe(
      formatC2Date(FINISHED_LOG_INPUT.completedAt!, "America/Los_Angeles"),
    );
  });

  it("an expired token refreshes and stores the rotated pair before posting", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({
        expiresAt: new Date(Date.now() - 1000),
        accessToken: "old-at",
        refreshToken: "old-rt",
      }),
    );
    const client = makeStubClient();
    const newExpiry = new Date(Date.now() + 3600_000);
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "new-at",
        refreshToken: "new-rt",
        expiresAt: newExpiry,
      },
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 1 });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    expect(client.refreshTokens).toHaveBeenCalledWith("old-rt");
    expect(client.postResult).toHaveBeenCalledWith("new-at", expect.anything());

    const link = await store.getLink(userA.id);
    expect(link?.accessToken).toBe("new-at");
    expect(link?.refreshToken).toBe("new-rt");
    expect(link?.expiresAt).toStrictEqual(newExpiry);
  });

  // Nothing else lands a case INSIDE the 60s skew window — pinned with
  // INDEPENDENT literal offsets (30s inside, 90s outside), never the
  // imported `TOKEN_REFRESH_SKEW_MS`, so retuning the production
  // constant can't retune these assertions along with it.
  it("TOKEN_REFRESH_SKEW_MS boundary: a token expiring in 30s (inside the 60s skew) is refreshed", async () => {
    const fixedNow = new Date("2026-01-01T00:00:00.000Z");
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({ expiresAt: new Date(fixedNow.getTime() + 30_000) }),
    );
    const client = makeStubClient();
    // The stub's default declaration row is dated 2026-09-02, which THIS
    // test's pinned January clock correctly reads as a FUTURE row and
    // skips — falling through to an unstubbed `fetchMe`. A test that pins
    // the clock has to supply a contemporaneous declaration.
    vi.mocked(client.fetchResults).mockResolvedValue({
      ok: true,
      rows: [
        {
          id: 85561,
          type: "rower",
          weightClass: "H",
          dateUtc: "2025-12-31 10:00:30",
          date: "2025-12-31 06:00:30",
        },
      ],
    });
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "rotated-at",
        refreshToken: "rotated-rt",
        expiresAt: new Date(fixedNow.getTime() + 3600_000),
      },
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 1 });
    const { app, logs } = buildApp({ store, client, now: () => fixedNow });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    expect(client.refreshTokens).toHaveBeenCalledTimes(1);
  });

  it("TOKEN_REFRESH_SKEW_MS boundary: a token expiring in 90s (outside the 60s skew) is used as-is, no refresh", async () => {
    const fixedNow = new Date("2026-01-01T00:00:00.000Z");
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({
        expiresAt: new Date(fixedNow.getTime() + 90_000),
        accessToken: "still-fresh-at",
      }),
    );
    const client = makeStubClient();
    // The stub's default declaration row is dated 2026-09-02, which THIS
    // test's pinned January clock correctly reads as a FUTURE row and
    // skips — falling through to an unstubbed `fetchMe`. A test that pins
    // the clock has to supply a contemporaneous declaration.
    vi.mocked(client.fetchResults).mockResolvedValue({
      ok: true,
      rows: [
        {
          id: 85561,
          type: "rower",
          weightClass: "H",
          dateUtc: "2025-12-31 10:00:30",
          date: "2025-12-31 06:00:30",
        },
      ],
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 1 });
    const { app, logs } = buildApp({ store, client, now: () => fixedNow });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    expect(client.refreshTokens).not.toHaveBeenCalled();
    expect(client.postResult).toHaveBeenCalledWith(
      "still-fresh-at",
      expect.anything(),
    );
  });

  it("a dead refresh grant flags needs_reauth and keeps the LINK (never deletes)", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const client = makeStubClient();
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: false,
      grantDead: true,
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "needs_reauth" });
    expect(client.postResult).not.toHaveBeenCalled();

    const link = await store.getLink(userA.id);
    expect(link).not.toBeNull();
    expect(link?.needsReauthAt).not.toBeNull();
  });

  it("a retryable (5xx/network) refresh failure responds c2_error, leaving the link + flag untouched", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const client = makeStubClient();
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: false,
      grantDead: false,
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(502);
    expect(res.body).toStrictEqual({ error: "c2_error" });

    const link = await store.getLink(userA.id);
    expect(link).not.toBeNull();
    expect(link?.needsReauthAt).toBeNull();
  });

  // RF25: the 409 body names the colliding numeric result id, so the
  // route durably records it with the LOCKED link's identity BEFORE
  // returning the duplicate response — otherwise a row that hits this
  // exact path (first send happens to collide) would show unsent forever
  // after reload or on a second device.
  it("C2 duplicate on a FIRST send (no prior 201) -> 409 with c2ResultId, AND durably records it via the locked link's identity", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ c2UserId: 4477 }));
    const client = makeStubClient();
    vi.mocked(client.postResult).mockResolvedValue({
      ok: false,
      kind: "duplicate",
      resultId: 777,
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "duplicate", c2ResultId: 777 });

    // Fresh read (drive the store, not any in-memory row this handler
    // built) — the recovery's whole point is that a RELOAD sees "sent".
    const stored = await logs.get(userA.id, id);
    expect(stored?.c2ResultId).toBe(777);
    expect(stored?.c2UserId).toBe(4477);
  });

  // The full recovery arc RF25 exists for: a real 201 whose own
  // `recordC2Result` write fails (502, nothing recorded — the existing
  // seam test above), followed by a RETRY that hits C2's 409 for the
  // exact result C2 already has. That retry's duplicate-recovery write
  // is the row's only route to ever showing "sent" again.
  it("RF25 durable recovery: a recordC2Result failure after 201, then a retry that hits C2's 409, durably records both columns (asserted via a FRESH read)", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ c2UserId: 4477 }));
    const client = makeStubClient();
    vi.mocked(client.postResult).mockResolvedValueOnce({
      ok: true,
      resultId: 85557,
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);
    const recordSpy = vi
      .spyOn(logs, "recordC2Result")
      .mockResolvedValueOnce(false);

    const first = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(first.status).toBe(502);
    expect(first.body).toStrictEqual({ error: "c2_error" });
    const afterFirst = await logs.get(userA.id, id);
    expect(afterFirst?.c2ResultId).toBeNull();
    expect(afterFirst?.c2UserId).toBeNull();

    // Retry: C2 now reports this exact result as a duplicate — the
    // documented recovery path (route's own comment on the 201 branch).
    vi.mocked(client.postResult).mockResolvedValueOnce({
      ok: false,
      kind: "duplicate",
      resultId: 85557,
    });
    const second = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(second.status).toBe(409);
    expect(second.body).toStrictEqual({
      error: "duplicate",
      c2ResultId: 85557,
    });

    const afterSecond = await logs.get(userA.id, id);
    expect(afterSecond?.c2ResultId).toBe(85557);
    expect(afterSecond?.c2UserId).toBe(4477);
    expect(recordSpy).toHaveBeenCalledTimes(2);

    // The duplicate-recovery write is a NEW producer of the "already
    // sent" state (row.c2ResultId !== null &&
    // row.c2UserId === link.c2UserId), and nothing upstream of it had
    // ever reached that predicate — the pre-existing short-circuit test
    // seeds `recordC2Result` directly, downstream of both producers. A
    // THIRD request must actually reach the short-circuit THIS recovery
    // write fed: 200 with the same resultId, and `postResult` still
    // called only the two times above (no third wire call at all — both
    // `mockResolvedValueOnce` queues from above are already drained, so
    // a third call would fall through to the stub's default "not stubbed
    // for this test" throw if the short-circuit failed to fire).
    const third = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(third.status).toBe(200);
    // Bare `{resultId}`: this exit is the already-sent short-circuit, which
    // resolves NO class (nothing was sent on this request), and inventing
    // one would be a claim about a send that happened in the past.
    expect(third.body).toStrictEqual({ resultId: 85557 });
    expect(client.postResult).toHaveBeenCalledTimes(2);
  });

  it("C2 c2_error on post -> 502", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.postResult).mockResolvedValue({
      ok: false,
      kind: "c2_error",
      status: 500,
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(502);
    expect(res.body).toStrictEqual({ error: "c2_error" });
  });

  // The retry FORCES a genuine refresh (never merely re-checking
  // freshness against the SAME unexpired `expiresAt` and handing back
  // the SAME rejected token), so this asserts the two `postResult` calls
  // actually used DIFFERENT tokens — the thing the title claims.
  it("an auth failure on postResult forces a genuine refresh and retries ONCE with the NEW token", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({ accessToken: "stale-at", refreshToken: "rt-1" }),
    );
    const client = makeStubClient();
    vi.mocked(client.postResult)
      .mockResolvedValueOnce({ ok: false, kind: "auth" })
      .mockResolvedValueOnce({ ok: true, resultId: 55 });
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "rotated-at",
        refreshToken: "rotated-rt",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      resultId: 55,
      weightClass: "H",
      weightClassSource: "declaration",
    });
    expect(client.postResult).toHaveBeenCalledTimes(2);
    expect(client.refreshTokens).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(client.postResult).mock.calls;
    expect(calls[0][0]).toBe("stale-at");
    expect(calls[1][0]).toBe("rotated-at");
    expect(calls[0][0]).not.toBe(calls[1][0]);
  });

  // A 401 retry whose LOCKED re-read finds another request already rotated
  // the pair (rather than this request's own refresh winning the race)
  // uses that stored pair directly — no second wire call.
  it("a 401 retry that finds another request already rotated the token skips a second wire refresh", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ accessToken: "stale-at" }));
    const client = makeStubClient();
    vi.mocked(client.postResult).mockImplementation(async (token) => {
      if (token === "stale-at") {
        // Simulate a concurrent request rotating the pair while THIS
        // request's own (now-rejected) postResult call was in flight.
        await store.upsertLink(
          userA.id,
          freshLink({ accessToken: "concurrently-rotated-at" }),
        );
        return { ok: false, kind: "auth" };
      }
      return { ok: true, resultId: 9 };
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      resultId: 9,
      weightClass: "H",
      weightClassSource: "declaration",
    });
    expect(client.refreshTokens).not.toHaveBeenCalled();
    const calls = vi.mocked(client.postResult).mock.calls;
    expect(calls[0][0]).toBe("stale-at");
    expect(calls[1][0]).toBe("concurrently-rotated-at");
  });

  // A REPEAT 401 immediately after a GENUINE refresh is the same signal
  // `refreshTokens`'s own `grantDead` gives — the grant itself is
  // invalid, not merely stale-by-timing — so this asserts the flag + 409.
  it("a repeat 401 after a genuine refresh flags needs_reauth (never a third attempt)", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.postResult).mockResolvedValue({ ok: false, kind: "auth" });
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "rotated-at",
        refreshToken: "rotated-rt",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "needs_reauth" });
    expect(client.postResult).toHaveBeenCalledTimes(2);
    expect(client.refreshTokens).toHaveBeenCalledTimes(1);

    const link = await store.getLink(userA.id);
    expect(link).not.toBeNull();
    expect(link?.needsReauthAt).not.toBeNull();
  });

  // The repeat-401 flag must be bound to the SAME link that produced the
  // 401 (same authority-split class as I4). A relink
  // landing between the retry's own 401 and the flag lock must NOT get
  // flagged on the OLD grant's failure — the NEW grant was never tried at
  // all, so the honest response is a retryable c2_error, not needs_reauth.
  it("a relink landing between the retry's 401 and the flag lock -> the NEW link is never flagged, response is c2_error", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({ accessToken: "at-A", c2UserId: 111 }),
    );
    const client = makeStubClient();
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-A-refreshed",
        refreshToken: "rt-A-refreshed",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    vi.mocked(client.postResult).mockImplementation(async (token) => {
      if (token === "at-A") {
        return { ok: false, kind: "auth" };
      }
      // token === "at-A-refreshed" (the retry): simulate a callback
      // relink landing WHILE this postResult call was in flight — a
      // completely different account's grant, before this same call's
      // own 401 comes back.
      await store.upsertLink(
        userA.id,
        freshLink({ accessToken: "at-B", c2UserId: 222 }),
      );
      return { ok: false, kind: "auth" };
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(502);
    expect(res.body).toStrictEqual({ error: "c2_error" });

    const link = await store.getLink(userA.id);
    expect(link?.c2UserId).toBe(222);
    expect(link?.accessToken).toBe("at-B");
    expect(link?.needsReauthAt).toBeNull();
  });

  it("recordC2Result returning false (row deleted concurrently) -> 502 (RF25 seam)", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 1 });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);
    vi.spyOn(logs, "recordC2Result").mockResolvedValue(false);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(502);
    expect(res.body).toStrictEqual({ error: "c2_error" });
  });

  it("already-sent short-circuit returns 200 without ever calling the client", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);
    await logs.recordC2Result(userA.id, id, 999, LINK_INPUT.c2UserId);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ resultId: 999 });
    expect(client.postResult).not.toHaveBeenCalled();
  });

  it("resending after relinking to a DIFFERENT C2 account is allowed and overwrites the pair (plan deviation 5)", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ c2UserId: 111 }));
    const client = makeStubClient();
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);
    await logs.recordC2Result(userA.id, id, 999, 111);

    await store.upsertLink(userA.id, freshLink({ c2UserId: 222 }));
    vi.mocked(client.postResult).mockResolvedValue({
      ok: true,
      resultId: 5000,
    });

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      resultId: 5000,
      weightClass: "H",
      weightClassSource: "declaration",
    });
    expect(client.postResult).toHaveBeenCalledTimes(1);

    const stored = await logs.get(userA.id, id);
    expect(stored?.c2ResultId).toBe(5000);
    expect(stored?.c2UserId).toBe(222);
  });

  // The `c2UserId` used for the weight-class read AND for `recordC2Result`
  // must come from the LOCKED re-read inside `withLinkLock`, never the
  // earlier UNLOCKED `store.getLink` read — a relink landing in between
  // would otherwise pair the OLD account's identity with the NEW account's
  // token. Ruling (i) took `weightClass` off this list: it is no longer on
  // the link at all, so the remaining half is the account id, which is
  // still worth a gate.
  it("sources c2UserId from the LOCKED read, not the earlier unlocked getLink", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ c2UserId: 111 }));
    const client = makeStubClient();
    const { app, logs } = buildApp({ store, client });
    const logsSpy = vi.spyOn(logs, "sentC2ResultIds");
    const id = await seedEligibleLog(logs, userA.id);

    // Simulate a relink landing BETWEEN the route's initial unlocked
    // `store.getLink` read (used only for the unlinked/needs_reauth/
    // already-sent checks) and the LOCKED re-read inside `withLinkLock`:
    // the spy intercepts only that one outer call and hands back the
    // STALE link, while the store's real internal state — and therefore
    // the locked read — already reflects the new account.
    const staleLink = await store.getLink(userA.id);
    vi.spyOn(store, "getLink").mockResolvedValueOnce(staleLink);
    await store.upsertLink(userA.id, freshLink({ c2UserId: 222 }));

    vi.mocked(client.postResult).mockResolvedValue({
      ok: true,
      resultId: 777,
    });

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(200);
    // The declaration read is scoped to the LOCKED account, not the stale
    // one: a `sentC2ResultIds` call naming 111 would be asking "which rows
    // did we write to the account we are no longer linked to".
    expect(logsSpy).toHaveBeenCalledWith(userA.id, 222);
    const stored = await logs.get(userA.id, id);
    expect(stored?.c2UserId).toBe(222);
  });

  // Same I4-shaped race as the test above, but through the DUPLICATE
  // recovery write specifically (blocker 2, test (c)): a relink landing
  // between the route's unlocked `store.getLink` and the locked re-read
  // must not pair the OLD account's identity with the duplicate C2 has
  // already recorded under the NEW account.
  it("duplicate-recovery write sources c2UserId from the LOCKED read, not the earlier unlocked getLink", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ c2UserId: 111 }));
    const client = makeStubClient();
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const staleLink = await store.getLink(userA.id);
    vi.spyOn(store, "getLink").mockResolvedValueOnce(staleLink);
    await store.upsertLink(userA.id, freshLink({ c2UserId: 222 }));

    vi.mocked(client.postResult).mockResolvedValue({
      ok: false,
      kind: "duplicate",
      resultId: 999,
    });

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "duplicate", c2ResultId: 999 });
    const stored = await logs.get(userA.id, id);
    expect(stored?.c2ResultId).toBe(999);
    expect(stored?.c2UserId).toBe(222);
  });

  it("link deleted between the getLink check and the lock -> 409 unlinked (defensive branch)", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);
    // Simulates the race window between the route's own `store.getLink`
    // read (which saw a link) and the locked re-read inside
    // `withLinkLock` (which, here, sees none) — `acquireAccessToken`'s
    // `locked === null` branch.
    vi.spyOn(store, "withLinkLock").mockImplementation(async (_uid, fn) => {
      const outcome = await fn(null);
      return outcome.result;
    });

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "unlinked" });
    expect(client.postResult).not.toHaveBeenCalled();
  });

  // A link flagged mid-flight (by a DIFFERENT concurrent request, between
  // this route's own earlier unlocked needs_reauth check
  // and the locked re-read) must not reach the wire with a token this
  // route already knows is dead-or-flagged.
  it("a link flagged needs_reauth between the unlocked check and the lock -> 409, never reaches the wire", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);
    // The route's own earlier `store.getLink` check sees a healthy link
    // (needsReauthAt null); the LOCKED re-read inside `withLinkLock` must
    // see the flag a concurrent request set in between.
    vi.spyOn(store, "withLinkLock").mockImplementation(async (uid, fn) => {
      const flagged = {
        ...(await store.getLink(uid))!,
        needsReauthAt: new Date(),
      };
      const outcome = await fn(flagged);
      return outcome.result;
    });

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "needs_reauth" });
    expect(client.postResult).not.toHaveBeenCalled();
    expect(client.refreshTokens).not.toHaveBeenCalled();
  });

  it("the retry's own token reacquisition can fail too — its status/body wins, no second postResult call", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const client = makeStubClient();
    vi.mocked(client.refreshTokens)
      .mockResolvedValueOnce({
        ok: true,
        tokens: {
          accessToken: "at-2",
          refreshToken: "rt-2",
          // Still stale, so the RETRY's own `acquireAccessToken` call must
          // refresh again rather than finding a fresh token.
          expiresAt: new Date(Date.now() - 1000),
        },
      })
      .mockResolvedValueOnce({ ok: false, grantDead: true });
    vi.mocked(client.postResult).mockResolvedValue({ ok: false, kind: "auth" });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "needs_reauth" });
    expect(client.postResult).toHaveBeenCalledTimes(1);
    expect(client.refreshTokens).toHaveBeenCalledTimes(2);
  });
  // -- ruling (i): the weight class comes from Concept2 ---------------------

  it("sends the class the ROWER declared on their own most recent Concept2 row", async () => {
    // Producer 1. The posted BODY is the only place the claim is
    // observable, and `fetchMe` never being called is what proves the
    // profile derivation did not quietly answer instead.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.fetchResults).mockResolvedValue({
      ok: true,
      rows: [
        {
          id: 85561,
          type: "rower",
          weightClass: "L",
          dateUtc: "2026-09-02 10:00:30",
          date: "2026-09-02 06:00:30",
        },
      ],
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 41 });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(200);
    expect(client.postResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ weight_class: "L" }),
    );
    expect(res.body.weightClassSource).toBe("declaration");
    expect(client.fetchMe).not.toHaveBeenCalled();
  });

  it("falls back to OUR derivation from the profile, and says which producer answered", async () => {
    // Producer 2. `rows: []` is what makes this a profile test rather than
    // a second declaration test — `makeStubClient`'s default answers a
    // declaration, so a test that forgets this override silently exercises
    // the wrong producer.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.fetchResults).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "jmorelli",
      weight: 7000,
      gender: "M",
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 42 });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(200);
    expect(client.postResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ weight_class: "L" }),
    );
    expect(res.body).toStrictEqual({
      resultId: 42,
      weightClass: "L",
      weightClassSource: "profile",
    });
  });

  // The page the declaration read asks for has TWO consumers: it is what
  // `pickDeclaredWeightClass` reads a class off, AND it is what the
  // own-writes exclusion removes our rows from. The exclusion does not
  // WIDEN it, so the page size is what decides how many consecutive app
  // sends a rower can make before their own real Concept2 declaration is
  // pushed off the read for good. These two cases pin both ends of that.
  //
  // Both drive `fetchResults` through a stub that SLICES to the requested
  // count, the way Concept2's `?number=` genuinely does — without that the
  // page size is unobservable from here and shrinking it could not go red.
  function pagedClient(page: readonly unknown[]): C2Client {
    const client = makeStubClient();
    vi.mocked(client.fetchResults).mockImplementation(
      async (_token: string, count: number) => ({
        ok: true as const,
        rows: page.slice(0, count) as never,
      }),
    );
    return client;
  }

  // A row THIS APP wrote: indistinguishable from a real declaration in
  // every projected field except its id (observation 29's whole point).
  const ourRow = (id: number) => ({
    id,
    type: "rower",
    weightClass: "H",
    dateUtc: "2026-09-02 10:00:30",
    date: "2026-09-02 06:00:30",
  });

  it("finds a declaration sitting under SIX of our own consecutive sends", async () => {
    // The defect the page width exists to prevent: at a five-row page this
    // rower's own `L` is off the window from their sixth app send onward,
    // and every send after that writes our PROFILE-derived `H` onto their
    // permanent Concept2 record — silently, forever.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = pagedClient([
      ...[9001, 9002, 9003, 9004, 9005, 9006].map(ourRow),
      {
        id: 85561,
        type: "rower",
        weightClass: "L",
        dateUtc: "2026-08-20 10:00:30",
        date: "2026-08-20 06:00:30",
      },
    ]);
    // The exclusion set itself is stubbed rather than seeded through 51
    // real sends: this case is about the WINDOW, not about the writer.
    // "never reads its OWN write back as the rower's declaration on the
    // next send" is the one that starts upstream of the producer.
    //
    // The profile is stubbed to derive the OPPOSITE class on purpose. A
    // narrower page does not error — it silently answers `H` from the
    // profile for a rower who declared `L`, which is the production defect
    // in one line. Without this stub the fallback hits an unstubbed
    // `fetchMe` and the test would go red on a 500, catching the mutant for
    // the wrong reason.
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "jmorelli",
      weight: 8200,
      gender: "M",
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 51 });
    const { app, logs } = buildApp({ store, client });
    vi.spyOn(logs, "sentC2ResultIds").mockResolvedValue(
      new Set([9001, 9002, 9003, 9004, 9005, 9006]),
    );
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(200);
    expect(res.body.weightClassSource).toBe("declaration");
    expect(client.postResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ weight_class: "L" }),
    );
    // `fetchMe` never ran: the declaration answered, so no profile
    // derivation was needed. Without this a mutant that derived `L` some
    // other way would satisfy the two assertions above.
    expect(client.fetchMe).not.toHaveBeenCalled();
  });

  it("a page that is ALL ours falls to the profile, and the 200 says so", async () => {
    // The residue that survives at fifty, made visible rather than silent:
    // after 50 consecutive app-written rows with no other declaration among
    // them, producer 1 legitimately has nothing to read. `weightClassSource`
    // on this response is where that is answerable — for an OPERATOR, not
    // for the rower: the 2026-09-04 ruling withdrew the SENT state's
    // provenance sub-line, so no rower-facing surface names the producer.
    const ids = Array.from({ length: 50 }, (_, i) => 9001 + i);
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = pagedClient(ids.map(ourRow));
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "jmorelli",
      weight: 7000,
      gender: "M",
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 52 });
    const { app, logs } = buildApp({ store, client });
    vi.spyOn(logs, "sentC2ResultIds").mockResolvedValue(new Set(ids));
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      resultId: 52,
      weightClass: "L",
      weightClassSource: "profile",
    });
    // The whole window really was asked for and really was all ours: the
    // read requested 50 rows and the profile fallback actually ran.
    expect(client.fetchResults).toHaveBeenCalledWith(expect.any(String), 50);
    expect(client.fetchMe).toHaveBeenCalledTimes(1);
  });

  it("never reads its OWN write back as the rower's declaration on the next send", async () => {
    // RF24, and the only shape that can catch observation 29: this test
    // STARTS upstream of the producer. Send 1 writes a row; Concept2 then
    // echoes that row back on the results list carrying the class we sent;
    // send 2 must still answer `profile`, because a class we produced is
    // not a declaration however it comes back to us.
    //
    // Two independent observables, because the echoed class necessarily
    // EQUALS what we sent — the posted body cannot discriminate here, which
    // is exactly why ruling R2 put the source on the response.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    const page: { rows: unknown[] } = { rows: [] };
    vi.mocked(client.fetchResults).mockImplementation(async () => ({
      ok: true as const,
      rows: page.rows as never,
    }));
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "jmorelli",
      weight: 7000,
      gender: "M",
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 340 });
    const { app, logs } = buildApp({ store, client });
    const first = await seedEligibleLog(logs, userA.id);
    const second = await seedEligibleLog(logs, userA.id);

    const one = await asA(
      request(app).post(`/api/concept2/results/${first}`).send({ tz: "UTC" }),
    );
    expect(one.status).toBe(200);
    expect(one.body.weightClassSource).toBe("profile");

    // Concept2 now returns OUR row. Nothing on it says so except the id.
    page.rows = [
      {
        id: 340,
        type: "rower",
        weightClass: "L",
        dateUtc: "2026-09-03 11:00:00",
        date: "2026-09-03 07:00:00",
      },
    ];
    vi.mocked(client.fetchMe).mockClear();

    const two = await asA(
      request(app).post(`/api/concept2/results/${second}`).send({ tz: "UTC" }),
    );
    expect(two.status).toBe(200);
    expect(two.body.weightClassSource).toBe("profile");
    // The fallback really RAN, rather than the source string alone being
    // right for some other reason.
    expect(client.fetchMe).toHaveBeenCalledTimes(1);
  });

  it("reports a FAILED declaration read as retryable, never as our own guess", async () => {
    // A failed read is not an empty read. The rower may well have a
    // declaration; we could not read it. Deriving here would put OUR guess
    // on a permanent third-party record because of a 500, and the rower
    // would never know a read had failed at all.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const store = makeFakeConcept2Store();
      await store.upsertLink(userA.id, freshLink());
      const client = makeStubClient();
      vi.mocked(client.fetchResults).mockResolvedValue({
        ok: false,
        kind: "c2_error",
        status: 500,
      });
      const { app, logs } = buildApp({ store, client });
      const id = await seedEligibleLog(logs, userA.id);

      const res = await asA(
        request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
      );
      expect(res.status).toBe(502);
      expect(res.body).toStrictEqual({ error: "c2_error" });
      expect(client.fetchMe).not.toHaveBeenCalled();
      expect(client.postResult).not.toHaveBeenCalled();
      // The warn line's own half, added with F5's profile twin below: the
      // two 502s are byte-identical on the wire, so `layer` is the only
      // thing that separates them, and it is pinned on BOTH sides or on
      // neither.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(warn.mock.calls[0][0]))).toStrictEqual({
        event: "c2_weight_class",
        logId: id,
        failure: "c2_error",
        layer: "declaration",
        status: 500,
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("a FAILED profile read is a 502 whose warn line names the PROFILE layer, not the declaration", async () => {
    // Whole-branch review F5. The 502 above and the 502 here are the same
    // response, so the ONLY thing that tells an operator which Concept2
    // call died is `layer` on the `c2_weight_class` warn line — and until
    // this test, mutating `layer: "profile"` to `"declaration"` left the
    // whole unit project green. A diagnostic nothing can falsify is not a
    // diagnostic.
    //
    // The route is reached the way a rower reaches it: they have declared
    // nothing readable (an EMPTY results page, not a failed one — a failed
    // one exits at the declaration layer above and never asks for the
    // profile), and the profile read then fails.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const store = makeFakeConcept2Store();
      await store.upsertLink(userA.id, freshLink());
      const client = makeStubClient();
      vi.mocked(client.fetchResults).mockResolvedValue({ ok: true, rows: [] });
      vi.mocked(client.fetchMe).mockResolvedValue({
        ok: false,
        kind: "c2_error",
        status: 500,
      });
      const { app, logs } = buildApp({ store, client });
      const id = await seedEligibleLog(logs, userA.id);

      const res = await asA(
        request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
      );
      expect(res.status).toBe(502);
      expect(res.body).toStrictEqual({ error: "c2_error" });
      // Both reads ran — otherwise "the PROFILE layer failed" would be true
      // for the wrong reason.
      expect(client.fetchResults).toHaveBeenCalledTimes(1);
      expect(client.fetchMe).toHaveBeenCalledTimes(1);
      // Nothing was written to Concept2 on a class we could not resolve.
      expect(client.postResult).not.toHaveBeenCalled();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(warn.mock.calls[0][0]))).toStrictEqual({
        event: "c2_weight_class",
        logId: id,
        failure: "c2_error",
        layer: "profile",
        status: 500,
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses with no_weight_class and POSTs nothing to Concept2 when neither producer answers", async () => {
    // The assertion that matters is the last one: a 422 that still POSTed
    // would have written a class we invented onto a permanent record.
    //
    // Same title correction as its integration twin (whole-branch review
    // nit): the results endpoint IS reached here — `fetchResults` answers
    // the empty page below — so "NOT AT ALL", which this title used to say,
    // claimed more than the test can show.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.fetchResults).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "jmorelli",
      weight: null,
      gender: "M",
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(422);
    expect(res.body).toStrictEqual({
      error: "no_weight_class",
      reason: "no_weight",
    });
    expect(client.postResult).not.toHaveBeenCalled();
  });

  it("passes the profile's OWN failure reason through, so an unreadable weight is not reported as an unset one", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.fetchResults).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "jmorelli",
      weight: "unreadable",
      gender: "M",
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.body).toStrictEqual({
      error: "no_weight_class",
      reason: "unreadable_weight",
    });
  });

  it("flags needs_reauth when the class reads 401 twice, rather than reporting a retryable error forever", async () => {
    // Observation 25's whole reason: `fetchMe`/`fetchResults` used to
    // collapse a 401 into an anonymous failure, so a dead grant on the
    // weight-class read could only ever answer 502 and the rower was never
    // sent through re-consent.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.fetchResults).mockResolvedValue({
      ok: false,
      kind: "auth",
      status: 401,
    });
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-2",
        refreshToken: "rt-2",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "needs_reauth" });
    expect(client.postResult).not.toHaveBeenCalled();
    expect((await store.getLink(userA.id))?.needsReauthAt).not.toBeNull();
  });

  it("re-reads the DECLARATION on the refreshed token, not just the profile", async () => {
    // Retrying only the profile would silently demote a rower who HAS a
    // declaration to our own derivation, purely because their first token
    // had expired.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.fetchResults)
      .mockResolvedValueOnce({ ok: false, kind: "auth", status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        rows: [
          {
            id: 85561,
            type: "rower",
            weightClass: "L",
            dateUtc: "2026-09-02 10:00:30",
            date: "2026-09-02 06:00:30",
          },
        ],
      });
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-2",
        refreshToken: "rt-2",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 43 });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(200);
    expect(res.body.weightClassSource).toBe("declaration");
    // The SECOND call carried the NEW token, which is what proves the
    // declaration read re-ran rather than the profile alone.
    expect(vi.mocked(client.fetchResults).mock.calls[1]?.[0]).toBe("at-2");
    expect(client.fetchMe).not.toHaveBeenCalled();
  });

  it("a 401 on the PROFILE read reaches the same needs_reauth flag a 401 on the declaration does", async () => {
    // The profile is the SECOND wire call in the resolution, and its own
    // `auth` arm is a separate branch from the declaration read's. A rower
    // whose grant died between the two calls must not be told "try again"
    // forever.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.fetchResults).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: false,
      kind: "auth",
      status: 401,
    });
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-2",
        refreshToken: "rt-2",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "needs_reauth" });
    expect(client.postResult).not.toHaveBeenCalled();
    expect((await store.getLink(userA.id))?.needsReauthAt).not.toBeNull();
  });

  it("a class-read 401 whose token reacquisition ALSO fails answers that failure, never a second read", async () => {
    // The retry's own `acquireAccessToken` can fail on its own terms (a
    // dead refresh grant). Its status/body wins, and no second declaration
    // read is attempted on a token we never got.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.fetchResults).mockResolvedValue({
      ok: false,
      kind: "auth",
      status: 401,
    });
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: false,
      grantDead: true,
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "needs_reauth" });
    expect(client.fetchResults).toHaveBeenCalledTimes(1);
    expect(client.postResult).not.toHaveBeenCalled();
  });

  it("resolves the class ONCE per request, so a 401 retry cannot send a different class than the first attempt", async () => {
    // Ruling R13. `fetchResults` answers "L" then "H"; both POST bodies
    // must carry "L", because a re-read between two attempts at the same
    // row is the split-authority defect I4 exists to prevent.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    const declared = ["L", "H"];
    let call = 0;
    vi.mocked(client.fetchResults).mockImplementation(async () => ({
      ok: true as const,
      rows: [
        {
          id: 85561,
          type: "rower",
          weightClass: declared[call++] ?? "H",
          dateUtc: "2026-09-02 10:00:30",
          date: "2026-09-02 06:00:30",
        },
      ],
    }));
    vi.mocked(client.refreshTokens).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-2",
        refreshToken: "rt-2",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    vi.mocked(client.postResult)
      .mockResolvedValueOnce({ ok: false, kind: "auth" })
      .mockResolvedValueOnce({ ok: true, resultId: 44 });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(200);
    expect(
      vi
        .mocked(client.postResult)
        .mock.calls.map((c) => (c[1] as { weight_class: string }).weight_class),
    ).toStrictEqual(["L", "L"]);
  });
});
