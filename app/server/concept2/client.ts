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

import type { C2ProfileWeight, C2ResultRow } from "./mapping.js";

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

// Every wire call in this module is BOUNDED. Concept2 is a third party on the
// far side of the public internet, and an unbounded `fetch` holds an Express
// handler — and, on the upload path, a rower watching a SENDING state — for as
// long as the socket stays open. `AbortSignal.timeout` rejects the fetch with a
// `TimeoutError`, which every call site below already catches into its own
// RETRYABLE failure (`grantDead: false` / `kind: "c2_error"`), so a timeout is
// reported as exactly what it is: something to try again, never a dead grant.
//
// The value comes from this path's own measured latency rather than habit:
// against log-dev from a dev laptop, 5 samples each, medians on 2026-09-03 —
// `GET /api/users/me/results?number=1` 216 ms, `?number=5` 221 ms,
// `GET /api/users/me` 220 ms. 10 s is roughly 45x that, so it cannot clip a
// slow-but-working call. (Measured from a laptop, NOT from the deploy host;
// the deploy host's own latency to Concept2 is unmeasured.)
//
// WHAT IT BOUNDS, counted rather than felt. The send path's longest chain is
// NINE bounded calls, not three: refreshTokens, fetchResults, fetchMe,
// refreshTokens, fetchResults, fetchMe, postResult, refreshTokens,
// postResult. 90 s is therefore the arithmetic ceiling on that chain. The
// ceiling a TIMEOUT can actually reach is far lower, because a timeout
// classifies as `c2_error` and no `c2_error` on this route is retried: the
// nine-call chain requires the failures to be fast 401s. Nothing else caps
// SENDING — there is no client-side abort on the send fetch, no
// `server.requestTimeout`/`headersTimeout`, and no proxy timeout in-repo.
const C2_TIMEOUT_MS = 10_000;

// The vendor NUMBER's three states, kept apart rather than folded (see
// `fetchMe`). A finite numeric STRING is accepted because this API is Laravel
// and the read field is undocumented; anything else PRESENT is reported as
// `"unreadable"` so the caller can say so instead of saying "not set".
function readProfileWeight(value: unknown): C2ProfileWeight {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "unreadable";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "unreadable";
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : "unreadable";
  }
  return "unreadable";
}

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
        signal: AbortSignal.timeout(C2_TIMEOUT_MS),
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
    //
    // `weight` and `gender` are read here because the send path's FALLBACK
    // producer derives Concept2's required `weight_class` from them when the
    // rower has made no declaration we can read (`mapping.ts`'s
    // `deriveWeightClass`). We ask the rower nothing and store nothing.
    //
    // `weight` has THREE states on the wire and this method reports all three
    // (`C2ProfileWeight`): absent -> null; a finite number or a finite numeric
    // STRING -> that number; anything else present -> `"unreadable"`. The
    // string arm is not defensive padding: this API is Laravel (its 422 body
    // is Laravel's exact validation shape) and the read field is undocumented
    // — the docs' own `GET /api/users/me` example lists 13 fields and omits
    // `weight` entirely — so `"7500"` is a live possibility, and folding it
    // into "not set" would tell a rower who HAS set a weight to go and set it,
    // forever, with nothing in the response saying why.
    //
    // The failure shape carries `kind` AND `status` because the caller's
    // correct answer differs: a 401 means the grant may be dead and must reach
    // the same `needs_reauth` flag a rejected `postResult` does, while a 500,
    // a timeout or a thrown fetch is retryable and must not send a rower back
    // through re-consent over a blip — and a 403 (Concept2's answer for
    // insufficient scope, and our grant is exactly `user:read,results:write`)
    // must not read as an anonymous "couldn't reach Concept2" with a retry
    // that can never work. `status` is `number | null` rather than
    // `postResult`'s older optional key so that "no status" is a value and not
    // an omission; `postResult`'s shape is left alone by this PR.
    async fetchMe(accessToken: string): Promise<
      | {
          ok: true;
          c2UserId: number;
          username: string | null;
          weight: C2ProfileWeight;
          gender: string | null;
        }
      | { ok: false; kind: "auth" | "c2_error"; status: number | null }
    > {
      let res: Response;
      try {
        res = await fetchImpl(new URL("/api/users/me", cfg.baseUrl), {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(C2_TIMEOUT_MS),
        });
      } catch {
        return { ok: false, kind: "c2_error", status: null };
      }
      if (res.status === 401) {
        return { ok: false, kind: "auth", status: 401 };
      }
      if (!res.ok) {
        return { ok: false, kind: "c2_error", status: res.status };
      }
      const parsed = await safeJson(res);
      const data = (
        parsed as
          | {
              data?: {
                id?: unknown;
                username?: unknown;
                weight?: unknown;
                gender?: unknown;
              };
            }
          | undefined
      )?.data;
      const id = data?.id;
      if (typeof id !== "number") {
        return { ok: false, kind: "c2_error", status: res.status };
      }
      const username =
        typeof data?.username === "string" ? data.username : null;
      const gender = typeof data?.gender === "string" ? data.gender : null;
      return {
        ok: true,
        c2UserId: id,
        username,
        weight: readProfileWeight(data?.weight),
        gender,
      };
    },

    // The PRIMARY producer of `weight_class` (mapping.ts's block comment):
    // Concept2's own help says the rower designates L or H for every piece,
    // so their most recent designation is the authority, and the profile
    // weight is only a fallback.
    //
    // MEASURED 2026-09-03 against log-dev (user 2211, a token whose scope is
    // this module's own `SCOPE` constant, so no scope widening is implied):
    // `GET /api/users/me/results?number=1` -> 200, one result; every result in
    // the list carries `weight_class`; the list is DATE-descending (id 85561
    // dated `2026-09-02 10:00:30` sorted ahead of id 85562 dated
    // `2026-09-02 10:00:00`), and `meta.pagination` carries `total`, `count`,
    // `per_page`, `current_page`, `total_pages` and `links.next`.
    //
    // This projects FOUR fields per row and keeps nothing else. The rower's
    // other logbook rows are not ours to hold, log or render, and each of the
    // four earns its place in the DECISION rather than being carried along:
    //
    //   `id`         so the caller can exclude the rows THIS APP wrote.
    //                Without it, a class we derived comes back on the next
    //                send wearing the rower's name (observation 29) — and
    //                nothing else on the row distinguishes ours: the 201
    //                echoes our `weight_class` and reports `source` as the
    //                rower's own name.
    //   `type`       because Concept2 requires a class only on some types
    //                ("Required if type is rower, dynamic or slides"), and
    //                its own documented example shows a `skierg` row
    //                carrying one anyway — an unmeasured value, not a
    //                designation.
    //   `date_utc` / `date`
    //                so a row dated in the FUTURE cannot pin "newest"
    //                forever. `date_utc` is NULLABLE (both rows of the
    //                vendor's own example carry null), hence the pair.
    //
    // One page only — the caller never walks `links.next` (a rower with no
    // usable declaration in the recent page falls through to the profile,
    // which is cheaper and quieter than paging a stranger's history).
    async fetchResults(
      accessToken: string,
      count: number,
    ): Promise<
      | { ok: true; rows: C2ResultRow[] }
      | { ok: false; kind: "auth" | "c2_error"; status: number | null }
    > {
      const url = new URL("/api/users/me/results", cfg.baseUrl);
      url.searchParams.set("number", String(count));
      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(C2_TIMEOUT_MS),
        });
      } catch {
        return { ok: false, kind: "c2_error", status: null };
      }
      if (res.status === 401) {
        return { ok: false, kind: "auth", status: 401 };
      }
      if (!res.ok) {
        return { ok: false, kind: "c2_error", status: res.status };
      }
      const parsed = await safeJson(res);
      const rows = (parsed as { data?: unknown } | undefined)?.data;
      if (!Array.isArray(rows)) {
        return { ok: false, kind: "c2_error", status: res.status };
      }
      return {
        ok: true,
        rows: rows.map((entry) => {
          const row = entry as {
            id?: unknown;
            type?: unknown;
            weight_class?: unknown;
            date_utc?: unknown;
            date?: unknown;
          } | null;
          return {
            id: typeof row?.id === "number" ? row.id : null,
            type: typeof row?.type === "string" ? row.type : null,
            weightClass:
              typeof row?.weight_class === "string" ? row.weight_class : null,
            dateUtc: typeof row?.date_utc === "string" ? row.date_utc : null,
            date: typeof row?.date === "string" ? row.date : null,
          };
        }),
      };
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
          signal: AbortSignal.timeout(C2_TIMEOUT_MS),
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
