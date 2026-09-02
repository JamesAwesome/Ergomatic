// Wave E PR1 Task 4 (task-4-brief.md): Concept2 HTTP client. A fresh
// server-side module — NOT a re-export of scripts/c2-crossconnect.ts (the
// PR0 desk harness), which stays dev-only, never imported by server/ or
// src/. This module never throws on a non-2xx response: every outcome is a
// typed result, and no error path carries a token in a message string
// (tokens never appear in logs — CLAUDE.md constraint).
//
// Token endpoint is x-www-form-urlencoded; results endpoint is JSON (PR0
// finding transcribed at scripts/c2-crossconnect.ts:65, "review #2":
// scope is Required:Yes on every token call including refresh — measured
// live in docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md).

export interface C2ClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface C2TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export type C2TokenResult =
  | { ok: true; tokens: C2TokenSet }
  // grantDead: HTTP 400/401 from the token endpoint. Measured shapes
  // (refresh-probe-2026-08-31.md): {"message":"The refresh token is
  // invalid.","status_code":400} for both a garbage AND a genuinely
  // rotated-away token; C2's doc ALSO shows an {error,error_description}
  // dialect. The CALLER decides what grantDead means (needs_reauth, never
  // delete) — this type only reports the status class.
  | { ok: false; grantDead: true }
  | { ok: false; grantDead: false }; // network/5xx/timeout — retryable

export type C2PostResult =
  | { ok: true; resultId: number }
  | { ok: false; kind: "duplicate"; resultId: number } // 409, body.id names the collider
  | { ok: false; kind: "auth" } // 401 on the results call
  | { ok: false; kind: "c2_error"; status?: number }; // 422/5xx/network

const SCOPE = "user:read,results:write";

// Every JSON parse in this module goes through here: a malformed or
// non-JSON body must classify as a typed failure, never throw past this
// module's boundary (brief: "no method ever throws on a non-2xx").
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export function createC2Client(
  cfg: C2ClientConfig,
  fetchImpl: typeof fetch = fetch,
) {
  async function requestTokens(body: URLSearchParams): Promise<C2TokenResult> {
    let res: Response;
    try {
      res = await fetchImpl(new URL("/oauth/access_token", cfg.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch {
      return { ok: false, grantDead: false };
    }
    // Status decides grantDead, never body shape — refresh-probe's own
    // conclusion ("no client may key on either shape alone; status plus
    // (when present) body.error is the readable surface").
    if (res.status === 400 || res.status === 401) {
      return { ok: false, grantDead: true };
    }
    if (!res.ok) {
      return { ok: false, grantDead: false };
    }
    const parsed = await safeJson(res);
    const data = parsed as
      | {
          access_token?: unknown;
          refresh_token?: unknown;
          expires_in?: unknown;
        }
      | undefined;
    if (
      typeof data?.access_token !== "string" ||
      typeof data?.refresh_token !== "string" ||
      typeof data?.expires_in !== "number"
    ) {
      return { ok: false, grantDead: false };
    }
    return {
      ok: true,
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    };
  }

  return {
    // /oauth/authorize shape precedent: scripts/c2-crossconnect.ts's
    // buildAuthorizeUrl (PR0, live-run-proven). PR1.75a §3: `redirectUri`
    // is the SURFACE's (web: the https callback; native:
    // `haus.waffle.ergomatic://oauth/callback`), chosen by the route at
    // mint — Concept2 requires the exchange's redirect_uri to match the
    // authorize call's ("This must match the value sent in the call to
    // oauth/authorize"), so both calls take it as an argument.
    authorizeUrl(state: string, redirectUri: string): string {
      const u = new URL("/oauth/authorize", cfg.baseUrl);
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("scope", SCOPE);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      return u.toString();
    },

    exchangeCode(code: string, redirectUri: string): Promise<C2TokenResult> {
      return requestTokens(
        new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          scope: SCOPE,
        }),
      );
    },

    // `scope` REQUIRED here too, not only on exchange — dropping it here
    // is the mutation this task's probe specifically targets.
    refreshTokens(refreshToken: string): Promise<C2TokenResult> {
      return requestTokens(
        new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          scope: SCOPE,
        }),
      );
    },

    // No committed transcript names a SUCCESS body for this endpoint (only
    // the PROBE's 401 failure shape is a real capture — refresh-probe-
    // 2026-08-31.md), so the `data.id` shape below is the documented
    // contract's own minimum. Corroborated, not just assumed: PR0's live
    // harness parsed this exact shape against the real sandbox
    // (`scripts/c2-crossconnect.ts:255-258`), the results-201 body's own
    // `user_id` was 2211, and the measured follow-up
    // `GET /profile/2211/log/85557` returned 200.
    // username: MEASURED present (string) on log-dev GET /api/users/me,
    // 2026-09-02, live response; read as optional so a missing field can
    // never render "undefined" (the route falls back to #<id>).
    async fetchMe(
      accessToken: string,
    ): Promise<
      { ok: true; c2UserId: number; username: string | null } | { ok: false }
    > {
      let res: Response;
      try {
        res = await fetchImpl(new URL("/api/users/me", cfg.baseUrl), {
          headers: { authorization: `Bearer ${accessToken}` },
        });
      } catch {
        return { ok: false };
      }
      if (!res.ok) return { ok: false };
      const parsed = await safeJson(res);
      const data = (
        parsed as { data?: { id?: unknown; username?: unknown } } | undefined
      )?.data;
      const id = data?.id;
      if (typeof id !== "number") return { ok: false };
      const username =
        typeof data?.username === "string" ? data.username : null;
      return { ok: true, c2UserId: id, username };
    },

    async postResult(
      accessToken: string,
      payload: Record<string, unknown>,
    ): Promise<C2PostResult> {
      let res: Response;
      try {
        res = await fetchImpl(new URL("/api/users/me/results", cfg.baseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch {
        return { ok: false, kind: "c2_error" };
      }
      if (res.status === 201) {
        const parsed = await safeJson(res);
        // resultId comes from body.data.id, NOT the top level (this task's
        // second mutation probe targets exactly this line).
        const id = (parsed as { data?: { id?: unknown } } | undefined)?.data
          ?.id;
        if (typeof id !== "number") {
          return { ok: false, kind: "c2_error", status: res.status };
        }
        return { ok: true, resultId: id };
      }
      if (res.status === 409) {
        const parsed = await safeJson(res);
        const id = (parsed as { id?: unknown } | undefined)?.id;
        if (typeof id !== "number") {
          return { ok: false, kind: "c2_error", status: res.status };
        }
        return { ok: false, kind: "duplicate", resultId: id };
      }
      if (res.status === 401) {
        return { ok: false, kind: "auth" };
      }
      return { ok: false, kind: "c2_error", status: res.status };
    },
  };
}

export type C2Client = ReturnType<typeof createC2Client>;
