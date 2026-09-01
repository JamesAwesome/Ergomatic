import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createC2Client, type C2ClientConfig } from "./client.js";

// Wave E PR1 Task 4 (task-4-brief.md). Every response body below is
// transcribed verbatim from a committed capture — never invented (agent
// briefing "Specs and briefs are evidence-backed"; CLAUDE.md RF16):
//   - RAW = docs/monitor/c2-crossconnect-2026-09/raw-output.txt
//   - PROBE = docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md
// Real token strings are redacted-to-length in PROBE by design (a measurement
// doc that carries live secrets is the thing item 16/RF-secrets forbids), so
// the 200 fixture below substitutes placeholder strings of the same shape —
// the redaction is intentional in the source, not an invented wire fact.

const cfg: C2ClientConfig = {
  baseUrl: "https://log-dev.concept2.com",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "https://app.test/c2/callback",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// RAW lines 1-26 (result id 85557), verbatim.
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

// RAW, the probe-dedup "E: next day" transcript, verbatim.
const RAW_422_BODY = {
  message: "Could not create new result.",
  status_code: 422,
  errors: { date: ["The date of the workout is too far in the future."] },
};

// PROBE 0 and Probe B, byte-identical dead-grant body, verbatim.
const PROBE_400_BODY = {
  message: "The refresh token is invalid.",
  status_code: 400,
};

// PROBE "Related shape" (GET /api/users/me, expired access token), verbatim.
const PROBE_401_ME_BODY = {
  message: "Invalid OAuth access token",
  status_code: 401,
};

// PROBE A: {access_token,token_type,expires_in:604800,refresh_token}. Real
// token bytes are redacted-to-length in the source; substituted here with
// placeholder strings of the documented lengths (40 chars access/refresh,
// "Bearer" token_type) — not an invented wire fact, an explicit stand-in for
// a value the source itself withholds.
const PROBE_200_BODY = {
  access_token: "a".repeat(40),
  token_type: "Bearer",
  expires_in: 604800,
  refresh_token: "r".repeat(40),
};

describe("createC2Client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("authorizeUrl", () => {
    it("builds /oauth/authorize with the results:write scope", () => {
      const client = createC2Client(cfg, vi.fn());
      const url = new URL(client.authorizeUrl("nonce-123"));
      expect(url.origin + url.pathname).toBe(
        "https://log-dev.concept2.com/oauth/authorize",
      );
      expect(url.searchParams.get("client_id")).toBe("test-client-id");
      expect(url.searchParams.get("scope")).toBe("user:read,results:write");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "https://app.test/c2/callback",
      );
      expect(url.searchParams.get("state")).toBe("nonce-123");
    });
  });

  describe("exchangeCode", () => {
    it("POSTs form-encoded with the exact six-key set including scope", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, PROBE_200_BODY));
      const client = createC2Client(cfg, fetchImpl);
      await client.exchangeCode("auth-code-xyz");

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
      expect(String(url)).toBe(
        "https://log-dev.concept2.com/oauth/access_token",
      );
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["content-type"]).toBe(
        "application/x-www-form-urlencoded",
      );
      const body = init.body as URLSearchParams;
      expect(new Set(body.keys())).toStrictEqual(
        new Set([
          "client_id",
          "client_secret",
          "grant_type",
          "code",
          "redirect_uri",
          "scope",
        ]),
      );
      expect(body.get("client_id")).toBe("test-client-id");
      expect(body.get("client_secret")).toBe("test-client-secret");
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("auth-code-xyz");
      expect(body.get("redirect_uri")).toBe("https://app.test/c2/callback");
      expect(body.get("scope")).toBe("user:read,results:write");
    });

    it("200 -> ok tokens, expiresAt = now + expires_in seconds", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, PROBE_200_BODY));
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.exchangeCode("auth-code-xyz");
      expect(result).toStrictEqual({
        ok: true,
        tokens: {
          accessToken: PROBE_200_BODY.access_token,
          refreshToken: PROBE_200_BODY.refresh_token,
          expiresAt: new Date(
            Date.parse("2026-08-31T12:00:00.000Z") + 604800 * 1000,
          ),
        },
      });
    });
  });

  describe("refreshTokens", () => {
    it("POSTs form-encoded with the exact five-key set including scope (no redirect_uri)", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, PROBE_200_BODY));
      const client = createC2Client(cfg, fetchImpl);
      await client.refreshTokens("old-refresh-token");

      const [, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
      const body = init.body as URLSearchParams;
      expect(new Set(body.keys())).toStrictEqual(
        new Set([
          "client_id",
          "client_secret",
          "grant_type",
          "refresh_token",
          "scope",
        ]),
      );
      expect(body.has("redirect_uri")).toBe(false);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("old-refresh-token");
      expect(body.get("scope")).toBe("user:read,results:write");
    });

    it("PROBE 400 dead-grant body -> grantDead:true", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(400, PROBE_400_BODY));
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.refreshTokens("dead-token");
      expect(result).toStrictEqual({ ok: false, grantDead: true });
    });

    // No token-endpoint 401 body is captured in either committed source
    // (both measured probes returned 400); refresh-probe-2026-08-31.md's own
    // conclusion is that status, not body shape, is the classifying signal
    // ("status plus (when present) body.error is the readable surface" —
    // and C2's own doc shows a DIFFERENT {error,error_description} dialect
    // for this same status). This body is a synthetic stand-in built to that
    // documented dialect, used only to prove classification keys on the
    // status code, not on message content.
    it("401 (either token-endpoint error dialect) -> grantDead:true", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: "invalid_grant",
          error_description: "test dialect, not a C2 capture",
        }),
      );
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.refreshTokens("dead-token");
      expect(result).toStrictEqual({ ok: false, grantDead: true });
    });

    it("503 -> grantDead:false (retryable)", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(503, { message: "unavailable" }));
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.refreshTokens("some-token");
      expect(result).toStrictEqual({ ok: false, grantDead: false });
    });

    it("a rejected fetch (network failure) -> grantDead:false, never throws", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
      const client = createC2Client(cfg, fetchImpl);
      await expect(client.refreshTokens("some-token")).resolves.toStrictEqual({
        ok: false,
        grantDead: false,
      });
    });

    it("a 200 with a malformed body (missing token fields) -> grantDead:false, never throws", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { unexpected: "shape" }));
      const client = createC2Client(cfg, fetchImpl);
      await expect(client.refreshTokens("some-token")).resolves.toStrictEqual({
        ok: false,
        grantDead: false,
      });
    });

    it("a 200 whose body is not valid JSON -> grantDead:false, never throws", async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: () => Promise.reject(new Error("not json")),
        text: () => Promise.resolve("not json"),
      } as unknown as Response);
      const client = createC2Client(cfg, fetchImpl);
      await expect(client.refreshTokens("some-token")).resolves.toStrictEqual({
        ok: false,
        grantDead: false,
      });
    });

    it("rotation: the token classified dead by status never leaks its bytes into the result", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(400, PROBE_400_BODY));
      const client = createC2Client(cfg, fetchImpl);
      const marker = "SECRET-REFRESH-TOKEN-abc123";
      const result = await client.refreshTokens(marker);
      expect(JSON.stringify(result)).not.toContain(marker);
    });
  });

  describe("fetchMe", () => {
    it("200 {data:{id}} -> c2UserId", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { data: { id: 2211 } }));
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.fetchMe("some-access-token");
      expect(result).toStrictEqual({ ok: true, c2UserId: 2211 });

      const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
      expect(String(url)).toBe("https://log-dev.concept2.com/api/users/me");
      expect((init.headers as Record<string, string>).authorization).toBe(
        "Bearer some-access-token",
      );
    });

    it("PROBE 401 invalid-access-token body -> {ok:false}, never throws", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(401, PROBE_401_ME_BODY));
      const client = createC2Client(cfg, fetchImpl);
      await expect(client.fetchMe("expired-token")).resolves.toStrictEqual({
        ok: false,
      });
    });

    it("a rejected fetch -> {ok:false}, never throws", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
      const client = createC2Client(cfg, fetchImpl);
      await expect(client.fetchMe("some-token")).resolves.toStrictEqual({
        ok: false,
      });
    });

    it("a 200 with a malformed body (no data.id) -> {ok:false}, never throws", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { data: {} }));
      const client = createC2Client(cfg, fetchImpl);
      await expect(client.fetchMe("some-token")).resolves.toStrictEqual({
        ok: false,
      });
    });
  });

  describe("postResult", () => {
    it("sends JSON content-type with a bearer token", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(201, RAW_201_BODY));
      const client = createC2Client(cfg, fetchImpl);
      await client.postResult("some-access-token", { type: "rower" });

      const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
      expect(String(url)).toBe(
        "https://log-dev.concept2.com/api/users/me/results",
      );
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers["content-type"]).toBe("application/json");
      expect(headers.authorization).toBe("Bearer some-access-token");
      expect(init.body).toBe(JSON.stringify({ type: "rower" }));
    });

    it("RAW 201 transcript (id 85557) -> resultId from body.data.id", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(201, RAW_201_BODY));
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.postResult("token", { type: "rower" });
      expect(result).toStrictEqual({ ok: true, resultId: 85557 });
    });

    it("RAW 409 duplicate transcript -> duplicate carrying the collider id", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(409, RAW_409_BODY));
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.postResult("token", { type: "rower" });
      expect(result).toStrictEqual({
        ok: false,
        kind: "duplicate",
        resultId: 85560,
      });
    });

    it("RAW 422 future-date transcript -> c2_error with status", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(422, RAW_422_BODY));
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.postResult("token", { type: "rower" });
      expect(result).toStrictEqual({
        ok: false,
        kind: "c2_error",
        status: 422,
      });
    });

    it("401 -> auth", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(401, PROBE_401_ME_BODY));
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.postResult("expired-token", {
        type: "rower",
      });
      expect(result).toStrictEqual({ ok: false, kind: "auth" });
    });

    it("500 -> c2_error with status, never throws", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(500, { message: "server error" }));
      const client = createC2Client(cfg, fetchImpl);
      await expect(
        client.postResult("token", { type: "rower" }),
      ).resolves.toStrictEqual({ ok: false, kind: "c2_error", status: 500 });
    });

    it("a rejected fetch (network failure) -> c2_error with no status, never throws", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
      const client = createC2Client(cfg, fetchImpl);
      await expect(
        client.postResult("token", { type: "rower" }),
      ).resolves.toStrictEqual({ ok: false, kind: "c2_error" });
    });

    it("a malformed 201 body (no data.id) -> c2_error, never throws on parse", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(201, { data: {} }));
      const client = createC2Client(cfg, fetchImpl);
      await expect(
        client.postResult("token", { type: "rower" }),
      ).resolves.toStrictEqual({ ok: false, kind: "c2_error", status: 201 });
    });

    it("a 409 body missing id -> c2_error, never throws (no collider id to report)", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(409, { message: "Duplicate Result" }));
      const client = createC2Client(cfg, fetchImpl);
      await expect(
        client.postResult("token", { type: "rower" }),
      ).resolves.toStrictEqual({ ok: false, kind: "c2_error", status: 409 });
    });

    it("never leaks the bearer token into a typed error result", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(422, RAW_422_BODY));
      const client = createC2Client(cfg, fetchImpl);
      const marker = "SECRET-ACCESS-TOKEN-xyz789";
      const result = await client.postResult(marker, { type: "rower" });
      expect(JSON.stringify(result)).not.toContain(marker);
    });
  });
});
