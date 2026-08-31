import { randomBytes } from "node:crypto";
import { Router, type RequestHandler } from "express";
import type { C2Client } from "../concept2/client.js";
import {
  buildC2Payload,
  eligibilityFailure,
  type SessionLogRow,
} from "../concept2/mapping.js";
import type { Concept2Store, WeightClass } from "../stores/concept2.js";
import type { LogsStore } from "../stores/logs.js";
import { tzError } from "./data.js";

// Wave E PR1 Task 6 (task-6-brief.md). This router NEVER carries its own
// `router.use("/api", requireUser)` the way `routes/data.ts` does
// (data.ts:773) — the callback route (spec §Architecture 3, the nonce IS
// the user binding) is deliberately unauthenticated, so `requireUser` is
// applied per-route instead, on every route but that one. Mount order
// (Task 7's job: beside `createAuthRouter`, before the data router) is what
// keeps this router's own unauthenticated GET from ever reaching a
// gate meant for the rest of the API.
export interface Concept2RouterDeps {
  // Flag AND both creds — computed at boot, closed over (plan's own
  // "Availability" line). A capability gate: every route re-checks it,
  // never just the client's rendering.
  available: () => boolean;
  store: Concept2Store;
  logs: LogsStore;
  client: C2Client;
  requireUser: RequestHandler;
  // Injectable clock for token-freshness expiry tests — mirrors the
  // concept2 store's own `clock` injection seam (testing/fakes.ts).
  now?: () => Date;
}

// Spec §Architecture 3: the browser hop carries no credential; a
// single-use, 15-minute attempt nonce is the user binding. Expiry/GC is
// the server's own job, never a cron (mint's own GC calls below).
export const ATTEMPT_MAX_AGE_MS = 15 * 60 * 1000;
// Plan deviation 4: refresh 60s ahead of the wire's own `expires_at`, so an
// in-flight request never races a token that expires mid-call.
export const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

const WEIGHT_CLASSES: readonly WeightClass[] = ["H", "L"];

// Same shape as `routes/data.ts`'s own `UUID_RE` (that file's own comment:
// a malformed uuid literal 500s Postgres rather than finding no row).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function unavailableJson(res: Parameters<RequestHandler>[1]): void {
  res.status(403).json({ error: "unavailable" });
}

function notFoundJson(res: Parameters<RequestHandler>[1]): void {
  res.status(404).json({ error: "not found" });
}

// Callback responses are a browser navigation, never JSON (brief: "this is
// a browser navigation" — `res.status(n).type("html").send(...)`).
function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body><p>${body}</p></body></html>`;
}
const UNAVAILABLE_HTML = page(
  "Not available",
  "Concept2 linking is not available right now.",
);
const MISSING_PARAMS_HTML = page(
  "Missing parameters",
  "This link is missing required parameters. Return to the app and try again.",
);
const INVALID_STATE_HTML = page(
  "Link expired",
  "This link has expired or was already used. Return to the app and try again.",
);
const EXCHANGE_FAILED_HTML = page(
  "Could not link",
  "Concept2 could not complete the connection. Return to the app and try again.",
);
const LINKED_HTML = page("Linked", "Linked. Return to the app.");

function htmlPage(
  res: Parameters<RequestHandler>[1],
  status: number,
  body: string,
): void {
  res.status(status).type("html").send(body);
}

// Row -> `SessionLogRow` (concept2/mapping.ts), an independent, own-bounds
// mirror of the store's full row (that module's own comment on
// `SessionLogRow`) — never the full `LogsStore.get()` type, and
// `machineSummary` is cast here rather than at every call site: the real
// store's column is untyped jsonb (`db/schema.ts`'s own comment), so its
// Drizzle-inferred type is not `Record<string, unknown> | null` by
// construction, only by the same "sanity, not truth" trust boundary this
// module's `buildC2Payload` already documents.
function toMappingRow(row: {
  loggedAt: Date;
  completedAt: Date | null;
  tz: string | null;
  workSeconds: number | null;
  workMeters: number | null;
  restSeconds: number | null;
  restMeters: number | null;
  machineSummary: unknown;
  deviceName: string | null;
  endedBy: string | null;
}): SessionLogRow {
  return {
    loggedAt: row.loggedAt,
    completedAt: row.completedAt,
    tz: row.tz,
    workSeconds: row.workSeconds,
    workMeters: row.workMeters,
    restSeconds: row.restSeconds,
    restMeters: row.restMeters,
    machineSummary: row.machineSummary as Record<string, unknown> | null,
    deviceName: row.deviceName,
    endedBy: row.endedBy,
  };
}

export function createConcept2Router({
  available,
  store,
  logs,
  client,
  requireUser,
  now = () => new Date(),
}: Concept2RouterDeps): Router {
  const router = Router();

  // -- mint -------------------------------------------------------------

  router.post("/api/concept2/connect", requireUser, async (req, res) => {
    if (!available()) {
      unavailableJson(res);
      return;
    }
    const body = isRec(req.body) ? req.body : {};
    const weightClass = body.weightClass;
    if (
      typeof weightClass !== "string" ||
      !WEIGHT_CLASSES.includes(weightClass as WeightClass)
    ) {
      res.status(400).json({
        error: `weightClass must be one of ${WEIGHT_CLASSES.join(", ")}`,
        field: "weightClass",
      });
      return;
    }
    const userId = req.user!.id;
    // GC is the server's, no cron (brief) — every mint sweeps stale
    // attempts globally and this user's own before minting a fresh one,
    // so a user can never hold more than one live attempt.
    await store.deleteExpiredAttempts(ATTEMPT_MAX_AGE_MS);
    await store.deleteAttemptsFor(userId);
    const nonce = randomBytes(32).toString("hex");
    await store.createAttempt({
      nonce,
      userId,
      weightClass: weightClass as WeightClass,
    });
    res.json({ authorizeUrl: client.authorizeUrl(nonce) });
  });

  // -- callback (NO requireUser — the nonce binds) -----------------------

  router.get("/api/concept2/callback", async (req, res) => {
    const state =
      typeof req.query.state === "string" ? req.query.state : undefined;
    const code =
      typeof req.query.code === "string" ? req.query.code : undefined;

    // Order pinned (task-6-brief.md, matrix row 3): availability is
    // RE-CHECKED here, never inherited from mint — a flag flip between the
    // two hops must still block the exchange, not just the initial mint.
    if (!available()) {
      if (state !== undefined) {
        await store.consumeAttempt(state, ATTEMPT_MAX_AGE_MS);
      }
      htmlPage(res, 403, UNAVAILABLE_HTML);
      return;
    }
    if (state === undefined || code === undefined) {
      htmlPage(res, 400, MISSING_PARAMS_HTML);
      return;
    }
    // Single-use: consumed before exchange even starts, so a retry after
    // ANY later failure restarts at mint rather than reusing this code
    // (brief: "attempt already consumed — retry restarts at mint").
    const attempt = await store.consumeAttempt(state, ATTEMPT_MAX_AGE_MS);
    if (!attempt) {
      htmlPage(res, 400, INVALID_STATE_HTML);
      return;
    }
    const tokenResult = await client.exchangeCode(code);
    if (!tokenResult.ok) {
      htmlPage(res, 502, EXCHANGE_FAILED_HTML);
      return;
    }
    const me = await client.fetchMe(tokenResult.tokens.accessToken);
    if (!me.ok) {
      htmlPage(res, 502, EXCHANGE_FAILED_HTML);
      return;
    }
    // Clears any previously-set needsReauthAt (stores/concept2.ts's own
    // `upsertLink` comment) — a successful relink IS the recovery.
    await store.upsertLink(attempt.userId, {
      c2UserId: me.c2UserId,
      accessToken: tokenResult.tokens.accessToken,
      refreshToken: tokenResult.tokens.refreshToken,
      expiresAt: tokenResult.tokens.expiresAt,
      weightClass: attempt.weightClass,
    });
    htmlPage(res, 200, LINKED_HTML);
  });

  // -- link ---------------------------------------------------------------

  router.get("/api/concept2/link", requireUser, async (req, res) => {
    if (!available()) {
      // 200 on purpose (the matrix's one non-403 row) — this is a
      // capability read, not an action.
      res.json({ available: false });
      return;
    }
    const link = await store.getLink(req.user!.id);
    if (!link) {
      res.json({ available: true, linked: false });
      return;
    }
    res.json({
      available: true,
      linked: true,
      weightClass: link.weightClass,
      needsReauth: link.needsReauthAt !== null,
    });
  });

  router.delete("/api/concept2/link", requireUser, async (req, res) => {
    if (!available()) {
      unavailableJson(res);
      return;
    }
    // The ONE delete path, user-initiated (spec V5: no revocation
    // endpoint; unlink is local). Idempotent — deleting an absent link
    // matches zero rows, still 204.
    await store.deleteLink(req.user!.id);
    res.status(204).end();
  });

  // -- upload ---------------------------------------------------------------

  router.post("/api/concept2/results/:logId", requireUser, async (req, res) => {
    if (!available()) {
      unavailableJson(res);
      return;
    }
    // Express 5's route-string param inference collapses to the untyped
    // `string | string[]` shape once a route mixes `requireUser` with a
    // typed handler in the same `.post()` call (a widening artifact of
    // that overload, not a real runtime possibility for a plain named
    // `:logId` segment — Express never produces an array for one).
    const logId = req.params.logId as string;
    if (!UUID_RE.test(logId)) {
      notFoundJson(res);
      return;
    }
    const body = isRec(req.body) ? req.body : {};
    const bodyTz = body.tz;
    // "tz absent" is its own failure, distinct from `tzError`'s general
    // null-tolerant contract (`data.ts`'s own `tzError` accepts
    // undefined/null for OTHER callers) — every upload requires a real
    // zone on the wire, whether or not the row already has one stored
    // (plan pre-flight scan T6 internal: "tz required on every upload
    // even when row.tz set").
    if (bodyTz === undefined || bodyTz === null || tzError(bodyTz) !== null) {
      res.status(400).json({
        error: "tz must be an IANA timezone name",
        field: "tz",
      });
      return;
    }
    const tz = bodyTz as string;

    const userId = req.user!.id;
    const row = await logs.get(userId, logId);
    if (!row) {
      notFoundJson(res);
      return;
    }

    const link = await store.getLink(userId);
    if (!link) {
      res.status(409).json({ error: "unlinked" });
      return;
    }
    if (link.needsReauthAt !== null) {
      res.status(409).json({ error: "needs_reauth" });
      return;
    }

    // Already-sent short-circuit (plan deviation 5): a row already
    // carries a C2 result AND it was accepted by the CURRENTLY linked
    // account — never re-derived against a stale link. Resending after
    // relinking to a different account is deliberately allowed past this
    // point (deviation 5's own "resend-to-B overwrites A's record").
    if (row.c2ResultId !== null && row.c2UserId === link.c2UserId) {
      res.status(200).json({ resultId: row.c2ResultId });
      return;
    }

    // Eligibility never reads tz — safe to check before tz resolution.
    const eligibilityRow = toMappingRow(row);
    const failure = eligibilityFailure(eligibilityRow);
    if (failure !== null) {
      res.status(422).json({ error: "not_eligible", reason: failure });
      return;
    }

    // Persist-on-first-use (plan deviation 2): a legacy row with no
    // stored zone gets the UPLOAD request's zone written before the
    // payload is built, so every later attempt (retry or resend) reads
    // the SAME stored zone rather than re-deriving from whatever zone
    // that later request happened to carry — the dedup-stability
    // property C2's second-granular dedup key needs.
    //
    // Fix round 1, I1: `effectiveTz` MUST be resolved before the row used
    // to build the payload is constructed. The original code built
    // `mappingRow` first and only wrote `tz` afterward, so `mappingRow.tz`
    // stayed `null` even on a row whose `completedAt` was already set —
    // `buildC2Payload`'s paired branch (`completedAt !== null && tz !==
    // null`) never fired on attempt 1 (fell to `loggedAt` + the request's
    // own zone) but DID fire on a retry once `row.tz` was no longer null
    // read fresh — two different dates for the same row. M1: `recordTz`
    // now returns the zone that actually landed (a concurrent writer may
    // have beaten this request to it), so `effectiveTz` is never this
    // request's own guess when someone else already decided it.
    const effectiveTz =
      row.tz === null ? await logs.recordTz(userId, logId, tz) : row.tz;

    // The row used to build the payload, AFTER `effectiveTz` is settled:
    // `tz` is forced to `effectiveTz` (never the raw, possibly-null
    // `row.tz`) so `buildC2Payload`'s paired branch treats a freshly
    // persisted zone exactly like an already-stored one — same stable
    // `completedAt`-based date on every attempt from here on.
    const mappingRow: SessionLogRow = { ...eligibilityRow, tz: effectiveTz };

    // I4: `weightClass`/`c2UserId` for the payload and for
    // `recordC2Result` must come from the LOCKED re-read inside
    // `withLinkLock`, never the unlocked `store.getLink` read above — a
    // relink landing between that read and the lock would otherwise pair
    // the OLD account's identity with the NEW account's token.
    type LinkIdentity = { weightClass: WeightClass; c2UserId: number };
    type TokenOutcome =
      | { ok: true; accessToken: string; link: LinkIdentity }
      | { ok: false; status: number; body: Record<string, unknown> };

    // Token freshness inside `withLinkLock` (plan deviation 4): a locked
    // re-read, so a concurrent refresh from another request is visible
    // here before this one decides whether to refresh again.
    //
    // I2: `retry` forces a GENUINE refresh attempt — passed only from the
    // one-time 401 retry below, after C2 rejected a token this route
    // believed was fresh (the ordinary freshness check would otherwise
    // see the SAME unexpired `expiresAt` and hand back the SAME rejected
    // token again, never actually refreshing). If the locked re-read
    // shows the access token has already changed since the stale one was
    // tried, another request already rotated it — use that stored pair
    // rather than making a second wire call.
    async function acquireAccessToken(retry?: {
      staleAccessToken: string;
    }): Promise<TokenOutcome> {
      return store.withLinkLock<TokenOutcome>(userId, async (locked) => {
        if (locked === null) {
          return {
            action: "none",
            result: {
              ok: false,
              status: 409,
              body: { error: "unlinked" },
            },
          };
        }
        // M2: a link flagged mid-flight (by a DIFFERENT concurrent
        // request, between this route's own earlier unlocked check and
        // this locked re-read) must not reach the wire with a token
        // whose grant this route already knows is dead-or-flagged.
        if (locked.needsReauthAt !== null) {
          return {
            action: "none",
            result: {
              ok: false,
              status: 409,
              body: { error: "needs_reauth" },
            },
          };
        }
        const identity: LinkIdentity = {
          weightClass: locked.weightClass,
          c2UserId: locked.c2UserId,
        };
        if (
          retry !== undefined &&
          locked.accessToken !== retry.staleAccessToken
        ) {
          // Another request already refreshed since the rejected token
          // was tried — no wire call needed.
          return {
            action: "none",
            result: {
              ok: true,
              accessToken: locked.accessToken,
              link: identity,
            },
          };
        }
        if (
          retry === undefined &&
          locked.expiresAt.getTime() > now().getTime() + TOKEN_REFRESH_SKEW_MS
        ) {
          // Covers "another request already refreshed" too: the locked
          // re-read sees whatever the winner of that race wrote.
          return {
            action: "none",
            result: {
              ok: true,
              accessToken: locked.accessToken,
              link: identity,
            },
          };
        }
        const refreshed = await client.refreshTokens(locked.refreshToken);
        if (refreshed.ok) {
          return {
            action: "store",
            tokens: refreshed.tokens,
            result: {
              ok: true,
              accessToken: refreshed.tokens.accessToken,
              link: identity,
            },
          };
        }
        if (refreshed.grantDead) {
          // Link + weight_class INTACT (plan deviation 3) — automatic
          // paths never delete.
          return {
            action: "flagReauth",
            result: {
              ok: false,
              status: 409,
              body: { error: "needs_reauth" },
            },
          };
        }
        // Retryable (network/5xx) — no flag, link untouched.
        return {
          action: "none",
          result: { ok: false, status: 502, body: { error: "c2_error" } },
        };
      });
    }

    const tokenOutcome = await acquireAccessToken();
    if (!tokenOutcome.ok) {
      res.status(tokenOutcome.status).json(tokenOutcome.body);
      return;
    }

    let accessToken = tokenOutcome.accessToken;
    let lockedLink = tokenOutcome.link;
    let payload = buildC2Payload(mappingRow, lockedLink, effectiveTz);
    let postResult = await client.postResult(accessToken, payload);

    // ONE refresh-and-retry through the same locked path (brief) — C2
    // rejected a token this route believed was fresh; try exactly once
    // more (forcing a genuine refresh — I2), then fall through to the
    // same outcome handling either way. The identity used to build the
    // retry's payload comes from whichever locked read actually produced
    // the token that gets sent (I4).
    if (!postResult.ok && postResult.kind === "auth") {
      const retryOutcome = await acquireAccessToken({
        staleAccessToken: accessToken,
      });
      if (!retryOutcome.ok) {
        res.status(retryOutcome.status).json(retryOutcome.body);
        return;
      }
      accessToken = retryOutcome.accessToken;
      lockedLink = retryOutcome.link;
      payload = buildC2Payload(mappingRow, lockedLink, effectiveTz);
      postResult = await client.postResult(accessToken, payload);

      // I2: a REPEAT 401 immediately after a GENUINE refresh (or after
      // picking up another request's already-rotated pair) is the same
      // signal `refreshTokens`'s own `grantDead` gives — the grant is
      // invalid, not merely stale-by-timing. Flag it identically (never
      // delete) rather than falling through to a generic c2_error.
      //
      // Fix round 2, N1: the flag must be bound to the SAME link that
      // actually produced this 401 — a fresh, unconditional
      // `withLinkLock` call here would flag whatever link exists AT THAT
      // MOMENT, not the one whose token was just rejected. A callback
      // relink landing between the retry's `postResult` call and this
      // lock would clear `needsReauthAt` (upsertLink's own contract) and
      // then have this branch immediately re-flag the NEW grant based on
      // the OLD grant's 401 (same authority-split class as I4). The
      // locked re-read decides: if the link's CURRENT access token still
      // matches the one that got the 401, the grant this route tried is
      // still live — flag it. If it doesn't match, a relink or rotation
      // happened concurrently and the NEW grant was never tried at all —
      // the honest answer is a retryable c2_error, never a needs_reauth
      // that would send the rower back through re-consent for a grant
      // that may already be fine.
      if (!postResult.ok && postResult.kind === "auth") {
        const stillSameGrant = await store.withLinkLock<boolean>(
          userId,
          async (locked) => {
            const matches =
              locked !== null && locked.accessToken === accessToken;
            if (matches) {
              return { action: "flagReauth", result: true };
            }
            return { action: "none", result: false };
          },
        );
        if (stillSameGrant) {
          res.status(409).json({ error: "needs_reauth" });
        } else {
          res.status(502).json({ error: "c2_error" });
        }
        return;
      }
    }

    if (postResult.ok) {
      // RF25: this route owns the end-to-end invariant. A false return
      // means the row vanished between the eligibility read and this
      // write (concurrent delete) — C2 already has the result, and the
      // named recovery is re-send -> C2 409 -> duplicate, a state the UI
      // already has (never re-attempted automatically here).
      const recorded = await logs.recordC2Result(
        userId,
        logId,
        postResult.resultId,
        lockedLink.c2UserId,
      );
      if (!recorded) {
        res.status(502).json({ error: "c2_error" });
        return;
      }
      res.status(200).json({ resultId: postResult.resultId });
      return;
    }
    if (postResult.kind === "duplicate") {
      // Row untouched — a 409 leaves c2ResultId null (spec).
      res
        .status(409)
        .json({ error: "duplicate", c2ResultId: postResult.resultId });
      return;
    }
    // Only "c2_error" can still reach here — every "auth" outcome is
    // handled above, either by a successful retry or by the repeat-401
    // flagReauth branch.
    res.status(502).json({ error: "c2_error" });
  });

  return router;
}
