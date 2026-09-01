import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { requireUser } from "../auth/middleware.js";
import type { SessionStore, SessionUser } from "../auth/sessions.js";
import { makeFakeConcept2Store, makeFakeStores } from "../testing/fakes.js";
import type { LogInput, LogsStore } from "../stores/logs.js";
import type { C2Client } from "../concept2/client.js";
import { formatC2Date } from "../concept2/mapping.js";
import type { Concept2Store, WeightClass } from "../stores/concept2.js";
import { createConcept2Router, type Concept2RouterDeps } from "./concept2.js";

// Wave E PR1 Task 6 (task-6-brief.md): supertest + fake session store, same
// harness shape as `data.test.ts`'s own `appFor`. The concept2 store is the
// Task 3 fake (`makeFakeConcept2Store`); `logs` is a fresh
// `makeFakeStores().logs` per test (Task 1/6's fake, exercising the real
// `LogInput`/`create()` contract rather than a hand-built row); `client` is
// a hand-rolled stub of the four-method `C2Client` surface — never a real
// fetch, per this task's "unit tests only" scope (the integration seam test
// is Task 7's).

const userA: SessionUser = { id: "user-a", email: "a@x.com", name: "A" };
const userB: SessionUser = { id: "user-b", email: "b@x.com", name: "B" };

function fakeSessionStore(): SessionStore {
  const users: Record<string, SessionUser> = {
    "token-a": userA,
    "token-b": userB,
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

// Well-formed but guaranteed-absent from any fake store's map (data.test.ts
// precedent).
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

// Every method throws until a test stubs it — an un-stubbed call is a test
// bug, never a silent wrong-shape result.
function makeStubClient(): C2Client {
  return {
    authorizeUrl: vi.fn(
      (state: string) => `https://c2.test/oauth/authorize?state=${state}`,
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
    store?: Concept2Store;
    logs?: LogsStore;
    client?: C2Client;
    now?: () => Date;
  } = {},
): Harness {
  const store = overrides.store ?? makeFakeConcept2Store();
  const logs = overrides.logs ?? makeFakeStores().logs;
  const client = overrides.client ?? makeStubClient();
  const state = { available: overrides.available ?? true };
  const deps: Concept2RouterDeps = {
    available: () => state.available,
    store,
    logs,
    client,
    requireUser: requireUser(fakeSessionStore()),
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
  weightClass: "H" as WeightClass,
};

function freshLink(
  overrides: Partial<typeof LINK_INPUT & { expiresAt: Date }> = {},
) {
  return {
    ...LINK_INPUT,
    expiresAt: new Date(Date.now() + 3600_000),
    ...overrides,
  };
}

async function mintAndGetState(
  app: express.Express,
  asUser: (req: request.Test) => request.Test = asA,
): Promise<string> {
  const res = await asUser(
    request(app).post("/api/concept2/connect").send({ weightClass: "H" }),
  );
  const url = new URL(res.body.authorizeUrl as string);
  return url.searchParams.get("state")!;
}

// ---------------------------------------------------------------------------

describe("concept2 router: auth guard", () => {
  const routes: Array<[string, string]> = [
    ["post", "/api/concept2/connect"],
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

  it("callback carries NO requireUser (the nonce binds, not a session)", async () => {
    const { app } = buildApp();
    // No Authorization header at all; missing state/code -> 400, never 401.
    const res = await request(app).get("/api/concept2/callback");
    expect(res.status).toBe(400);
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
    const res = await asA(
      request(app).post("/api/concept2/connect").send({ weightClass: "H" }),
    );
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "unavailable" });
    expect(createAttemptSpy).not.toHaveBeenCalled();
  });

  it("callback: mid-hop unavailable -> 403, exchange never called, attempt consumed, no link created", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    const { app, setAvailable } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    setAvailable(false);
    const res = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(res.status).toBe(403);
    expect(res.type).toBe("text/html");
    expect(client.exchangeCode).not.toHaveBeenCalled();
    expect(await store.getLink(userA.id)).toBeNull();

    // The attempt is gone even though it was never exchanged: replaying the
    // same state once available again reports "unknown state", not success.
    setAvailable(true);
    const retry = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(retry.status).toBe(400);
    expect(await store.getLink(userA.id)).toBeNull();
  });

  it("callback: unavailable with no state at all -> 403, no consumeAttempt call", async () => {
    const store = makeFakeConcept2Store();
    const consumeSpy = vi.spyOn(store, "consumeAttempt");
    const { app } = buildApp({ available: false, store });
    const res = await request(app).get("/api/concept2/callback");
    expect(res.status).toBe(403);
    expect(consumeSpy).not.toHaveBeenCalled();
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

describe("mint (POST /api/concept2/connect)", () => {
  it("happy path returns an authorizeUrl and creates a single-use attempt", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    const { app } = buildApp({ store, client });
    const res = await asA(
      request(app).post("/api/concept2/connect").send({ weightClass: "L" }),
    );
    expect(res.status).toBe(200);
    expect(typeof res.body.authorizeUrl).toBe("string");
    expect(client.authorizeUrl).toHaveBeenCalledTimes(1);
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
    const second = await mintAndGetState(app, asB);
    expect(first).not.toBe(second);
  });

  it("rejects a weightClass outside H|L, field-named", async () => {
    const { app } = buildApp();
    const res = await asA(
      request(app).post("/api/concept2/connect").send({ weightClass: "X" }),
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("weightClass");
  });

  it("a request with no body at all (req.body left undefined by express.json) is treated as empty, not a crash", async () => {
    const { app } = buildApp();
    // Deliberately no `.send()`/Content-Type: `express.json()` only ever
    // sets `req.body` for a matching Content-Type, so this exercises the
    // `isRec` fallback for real, not a body-parser 400 of its own.
    const res = await asA(request(app).post("/api/concept2/connect"));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("weightClass");
  });

  // Pinned with the INDEPENDENT literal 900_000 (15 minutes in ms), not
  // the imported `ATTEMPT_MAX_AGE_MS` — retuning the production constant
  // would otherwise retune this assertion right along with it (RF21), so
  // the test could never catch a wrong value.
  it("garbage-collects expired/own attempts before creating a new one (no cron)", async () => {
    const store = makeFakeConcept2Store();
    const gcExpired = vi.spyOn(store, "deleteExpiredAttempts");
    const gcOwn = vi.spyOn(store, "deleteAttemptsFor");
    const { app } = buildApp({ store });
    await asA(
      request(app).post("/api/concept2/connect").send({ weightClass: "H" }),
    );
    expect(gcExpired).toHaveBeenCalledWith(900_000);
    expect(gcOwn).toHaveBeenCalledWith(userA.id);
  });
});

describe("callback (GET /api/concept2/callback)", () => {
  it("happy path links the ATTEMPT's user, with no session on the request at all", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-1",
        refreshToken: "rt-1",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    vi.mocked(client.fetchMe).mockResolvedValue({ ok: true, c2UserId: 2211 });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("Linked. Return to the app.");

    const link = await store.getLink(userA.id);
    expect(link?.weightClass).toBe("H");
    expect(link?.c2UserId).toBe(2211);
  });

  it("missing state or code -> 400", async () => {
    const { app } = buildApp();
    const res1 = await request(app).get("/api/concept2/callback?code=abc");
    expect(res1.status).toBe(400);
    const res2 = await request(app).get("/api/concept2/callback?state=xyz");
    expect(res2.status).toBe(400);
  });

  it("a second use of the same nonce -> 400 (single-use)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-1",
        refreshToken: "rt-1",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    vi.mocked(client.fetchMe).mockResolvedValue({ ok: true, c2UserId: 2211 });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const first = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(first.status).toBe(200);

    const second = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(second.status).toBe(400);
    expect(client.exchangeCode).toHaveBeenCalledTimes(1);
  });

  // Pinned with INDEPENDENT literal ms values (14:59 = 899_000, 15:01 =
  // 901_000), never the imported `ATTEMPT_MAX_AGE_MS` — the same RF21
  // reasoning as the GC test above, applied to the boundary itself
  // rather than just "eventually expires".
  it("an attempt 14:59 old is still fresh (literal ms)", async () => {
    let t = 0;
    const clock = () => new Date(t);
    const store = makeFakeConcept2Store(clock);
    const client = makeStubClient();
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-1",
        refreshToken: "rt-1",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    vi.mocked(client.fetchMe).mockResolvedValue({ ok: true, c2UserId: 2211 });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    t += 899_000;
    const res = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(res.status).toBe(200);
  });

  it("an attempt 15:01 old is expired (literal ms)", async () => {
    let t = 0;
    const clock = () => new Date(t);
    const store = makeFakeConcept2Store(clock);
    const { app } = buildApp({ store });
    const state = await mintAndGetState(app);

    t += 901_000;
    const res = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(res.status).toBe(400);
  });

  it("exchange failure -> 502, and the nonce is not reusable", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: false,
      grantDead: false,
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(res.status).toBe(502);

    const retry = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(retry.status).toBe(400);
    expect(await store.getLink(userA.id)).toBeNull();
  });

  it("fetchMe failure -> 502", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-1",
        refreshToken: "rt-1",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    vi.mocked(client.fetchMe).mockResolvedValue({ ok: false });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(res.status).toBe(502);
    expect(await store.getLink(userA.id)).toBeNull();
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
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: "at-2",
        refreshToken: "rt-2",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: LINK_INPUT.c2UserId,
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(res.status).toBe(200);
    expect((await store.getLink(userA.id))?.needsReauthAt).toBeNull();
  });

  // A two-line gate against future reflection — today's callback pages
  // are STATIC constants (`page()`'s own comment) that never interpolate
  // `state`/`code`, so this passes trivially now, but it reddens the
  // moment anyone starts building a page from request input.
  it("never reflects state/code into the HTML response (static pages only)", async () => {
    const { app } = buildApp();
    const res = await request(app).get(
      `/api/concept2/callback?state=${encodeURIComponent("<script>alert(1)</script>")}&code=${encodeURIComponent("<img src=x onerror=alert(2)>")}`,
    );
    expect(res.text).not.toContain("<script>alert(1)</script>");
    expect(res.text).not.toContain("<img src=x onerror=alert(2)>");
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
  // response, not just weightClass. Pinned with toStrictEqual so an
  // accidental extra/renamed field fails loudly.
  it("GET: available, linked — carries c2UserId, tokens never serialized", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({ weightClass: "L", c2UserId: 4477 }),
    );
    const { app } = buildApp({ store });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      available: true,
      linked: true,
      weightClass: "L",
      c2UserId: 4477,
      needsReauth: false,
    });
    expect(JSON.stringify(res.body)).not.toContain(LINK_INPUT.accessToken);
    expect(JSON.stringify(res.body)).not.toContain(LINK_INPUT.refreshToken);
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
    // Deliberately INELIGIBLE (deviceName null): needs_reauth must win
    // before eligibility per the pinned check order.
    const id = await seedEligibleLog(logs, userA.id, { deviceName: null });
    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "needs_reauth" });
    expect(client.postResult).not.toHaveBeenCalled();
  });

  it("not_eligible -> 422 with reason", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const { app, logs } = buildApp({ store });
    const id = await seedEligibleLog(logs, userA.id, { deviceName: null });
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
    expect(res.body).toStrictEqual({ resultId: 85557 });
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

  it("a dead refresh grant flags needs_reauth and keeps the link + weightClass (never deletes)", async () => {
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
    expect(link?.weightClass).toBe("H");
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
    expect(res.body).toStrictEqual({ resultId: 55 });
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
    expect(res.body).toStrictEqual({ resultId: 9 });
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
    expect(link?.weightClass).toBe("H");
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
    expect(res.body).toStrictEqual({ resultId: 5000 });
    expect(client.postResult).toHaveBeenCalledTimes(1);

    const stored = await logs.get(userA.id, id);
    expect(stored?.c2ResultId).toBe(5000);
    expect(stored?.c2UserId).toBe(222);
  });

  // `weightClass`/`c2UserId` for the payload AND for
  // `recordC2Result` must come from the LOCKED re-read inside
  // `withLinkLock`, never the earlier UNLOCKED `store.getLink` read — a
  // relink landing in between would otherwise pair the OLD account's
  // identity with the NEW account's token.
  it("sources weightClass and c2UserId from the LOCKED read, not the earlier unlocked getLink", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({ c2UserId: 111, weightClass: "H" }),
    );
    const client = makeStubClient();
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    // Simulate a relink landing BETWEEN the route's initial unlocked
    // `store.getLink` read (used only for the unlinked/needs_reauth/
    // already-sent checks) and the LOCKED re-read inside `withLinkLock`:
    // the spy intercepts only that one outer call and hands back the
    // STALE link, while the store's real internal state — and therefore
    // the locked read — already reflects the new account.
    const staleLink = await store.getLink(userA.id);
    vi.spyOn(store, "getLink").mockResolvedValueOnce(staleLink);
    await store.upsertLink(
      userA.id,
      freshLink({ c2UserId: 222, weightClass: "L" }),
    );

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
    expect(client.postResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ weight_class: "L" }),
    );
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
    await store.upsertLink(
      userA.id,
      freshLink({ c2UserId: 111, weightClass: "H" }),
    );
    const client = makeStubClient();
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const staleLink = await store.getLink(userA.id);
    vi.spyOn(store, "getLink").mockResolvedValueOnce(staleLink);
    await store.upsertLink(
      userA.id,
      freshLink({ c2UserId: 222, weightClass: "L" }),
    );

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
});
