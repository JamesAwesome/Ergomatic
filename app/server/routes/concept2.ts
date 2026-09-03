import { randomBytes } from "node:crypto";
import { Router, type Request, type RequestHandler } from "express";
import type { LogSource } from "../../domain/types.js";
import { bearerToken, cookieToken } from "../auth/middleware.js";
import type { SessionStore, SessionUser } from "../auth/sessions.js";
import { renderCallbackPage } from "../concept2/callbackPage.js";
import type { C2Client } from "../concept2/client.js";
import {
  buildC2Payload,
  deriveWeightClass,
  eligibilityFailure,
  pickDeclaredWeightClass,
  type SessionLogRow,
  type WeightClass,
  type WeightClassFailure,
  type WeightClassSource,
} from "../concept2/mapping.js";
import {
  AttemptNonceCollisionError,
  Concept2LinkConflictError,
  type Concept2Store,
  type LinkSurface,
} from "../stores/concept2.js";
import type { LogsStore } from "../stores/logs.js";
import { tzError } from "./data.js";

// Wave E PR1 Task 6, rebuilt at PR1.75a
// (2026-09-02-concept2-pr175-app-bind-design.md §1-§7). This router NEVER
// carries its own `router.use("/api", requireUser)` the way
// `routes/data.ts` does (data.ts:826): the web callback is authenticated by
// a ROUTE-LOCAL cookie resolver (§5) so it can keep its HTML responses and
// its pinned ladder order — `requireUser` answers bare JSON 401 and would
// run before that order — while every other route takes `requireUser`
// per-route. Mount order (app.ts: beside `createAuthRouter`, before the
// data router) is what keeps the data router's own gate away from the
// callback's HTML 401.
//
// Both completion routes refuse a foreign principal BEFORE consuming the
// attempt and BEFORE any Concept2 call (exit criterion 1); a nonce minted
// on one surface cannot complete on the other (exit criterion 2); the
// store's single conditional DELETE (`consumeAttemptFor`) is the authority
// on consumption — a wrong principal or surface consumes nothing by
// construction, not by step order.
export interface Concept2RouterDeps {
  // Flag AND both creds — computed at boot, closed over (plan's own
  // "Availability" line). A capability gate: every route re-checks it,
  // never just the client's rendering.
  available: () => boolean;
  store: Concept2Store;
  logs: LogsStore;
  client: C2Client;
  requireUser: RequestHandler;
  // The route-local cookie resolver (§5) and the disagreement re-check
  // (§1(b)) resolve sessions themselves.
  sessions: SessionStore;
  // The WEB surface's redirect_uri (index.ts: new URL("/api/concept2/
  // callback", siteUrl).href — the Google precedent). The native one is
  // the constant below.
  webRedirectUri: string;
  // The Concept2 ORIGIN this deployment talks to (`server/index.ts`'s
  // `c2BaseUrl`). Returned on `GET /link` because the client builds the
  // View-on-Concept2 URL and cannot know whether we are pointed at
  // log.concept2.com or log-dev.concept2.com — a hardcoded guess 404s for
  // the whole sandbox phase, which is the phase every walk happens in.
  logbookBaseUrl: string;
  // Injectable clock for token-freshness expiry tests — mirrors the
  // concept2 store's own `clock` injection seam (testing/fakes.ts).
  now?: () => Date;
}

// Design §3: the RFC 8252 §7.1 reverse-domain scheme of the bundle id
// `haus.waffle.ergomatic` (app/ios/App/App.xcodeproj/project.pbxproj's
// PRODUCT_BUNDLE_IDENTIFIER). Registered at log-dev 2026-09-02 (James);
// live-portal registration is a cutover step beside write approval
// (ROADMAP's C2 register row). Until PR1.75b ships the
// ASWebAuthenticationSession plugin nothing on the device can receive it —
// the design's named intentional interval, harmless while the flag is off.
export const NATIVE_REDIRECT_URI = "haus.waffle.ergomatic://oauth/callback";

// Design §3: a bearer mint must DECLARE it can receive the native redirect.
// A capability, not a version: it only ever narrows, and it makes the flag
// flip safe by construction against an installed build predating the
// WebAuth plugin (no such build can ever be handed a
// `haus.waffle.ergomatic://` URL). Cookie mints carry no declaration.
export const NATIVE_LINK_CLIENT = "webauth-1";

// Spec §Architecture 3: a single-use, 15-minute attempt nonce correlates
// the completion request to its mint; the completing principal is checked
// separately (this file's ladders). Expiry/GC is the server's own job,
// never a cron (mint's own sweep below).
const ATTEMPT_MAX_AGE_MS = 15 * 60 * 1000;
// Plan deviation 4: refresh 60s ahead of the wire's own `expires_at`, so an
// in-flight request never races a token that expires mid-call.
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

// How many of the rower's most recent Concept2 results the send path reads to
// find their latest weight-class DECLARATION (ruling i, producer 1). FIVE,
// and the number is measured rather than felt: against log-dev from a dev
// laptop, 5 samples each, medians on 2026-09-03, `?number=1` answered in
// 216 ms and `?number=5` in 221 ms — a small page is free, so take the one
// that survives a short run of recent non-rower pieces (a BikeErg or SkiErg
// result is not required to carry a class). One page only: the route never
// walks `meta.pagination.links.next`, and a rower with no readable class in
// these five falls through to the profile derivation, which is quieter than
// paging their history.
const DECLARATION_PAGE_SIZE = 5;

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

// The callback URL carries `code` and `state`, so every response from that
// route — HTML page, the one JSON refusal, and the 500 Express itself
// writes when a store call rejects — sets `Referrer-Policy: no-referrer`
// (design §5; RFC 9700 §4.2). The single setter that achieves this is the
// callback handler's own step 0; this helper exists so a caller cannot
// spell the header differently.
function noReferrer(res: Parameters<RequestHandler>[1]): void {
  res.setHeader("Referrer-Policy", "no-referrer");
}

// Callback responses are a browser navigation, never JSON. The template
// itself carries no subresource and no outbound link
// (concept2/callbackPage.ts).
//
// Sets no `Referrer-Policy` of its own: it relies on the callback handler's
// step 0 having already set it for every exit (a second call here could not
// be observed to fail — RF21).
function sendPage(
  res: Parameters<RequestHandler>[1],
  page: { status: number; html: string },
): void {
  res.status(page.status).type("html").send(page.html);
}

// Row -> `SessionLogRow` (concept2/mapping.ts), an independent, own-bounds
// mirror of the store's full row (that module's own comment on
// `SessionLogRow`) — never the full `LogsStore.get()` type, and
// `machineSummary` is cast here rather than at every call site: the real
// store's column is untyped jsonb (`db/schema.ts`'s own comment), so its
// Drizzle-inferred type is not `Record<string, unknown> | null` by
// construction, only by the same "sanity, not truth" trust boundary this
// module's `buildC2Payload` already documents.
//
// Door PR A (2026-09-02) §2.2: `deviceName` -> `source`, matching
// `SessionLogRow`'s own swap. `LogsStore.get()` selects every column
// (`db.select().from(sessionLogs)`), so `source` is present on every row
// this function receives — confirmed by typecheck, not by inspection.
function toMappingRow(row: {
  loggedAt: Date;
  completedAt: Date | null;
  tz: string | null;
  workSeconds: number | null;
  workMeters: number | null;
  restSeconds: number | null;
  restMeters: number | null;
  machineSummary: unknown;
  source: LogSource;
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
    source: row.source,
    endedBy: row.endedBy,
  };
}

export function createConcept2Router({
  available,
  store,
  logs,
  client,
  requireUser,
  sessions,
  webRedirectUri,
  logbookBaseUrl,
  now = () => new Date(),
}: Concept2RouterDeps): Router {
  const router = Router();

  async function resolveCookieSession(
    req: Request,
  ): Promise<SessionUser | null> {
    const token = cookieToken(req);
    if (token === undefined) return null;
    const resolved = await sessions.resolveSession(token);
    return resolved?.user ?? null;
  }

  async function resolveBearerSession(
    req: Request,
  ): Promise<SessionUser | null> {
    const token = bearerToken(req);
    if (token === undefined || token === "") return null;
    const resolved = await sessions.resolveSession(token);
    return resolved?.user ?? null;
  }

  // Design §1(b), scope (b): on /api/concept2/* (dark behind the flag)
  // "both present AND resolving to DIFFERENT users" is a hard 400 —
  // `requireUser` (scope (a), app-wide) only LOGS it, because whether the
  // native jar can ever carry `erg_session` is UNMEASURED until 1.75b's
  // walk. Runs immediately after `requireUser`, before availability, like
  // the 401 it sits beside. When `authVia` is "cookie" no bearer exists
  // (bearer wins whenever present), so only the bearer case re-resolves.
  const refuseAmbiguousAuth: RequestHandler = async (req, res, next) => {
    if (req.authVia === "bearer" && cookieToken(req) !== undefined) {
      const viaCookie = await resolveCookieSession(req);
      if (viaCookie && viaCookie.id !== req.user!.id) {
        res.status(400).json({ error: "ambiguous_auth" });
        return;
      }
    }
    next();
  };

  // -- mint -------------------------------------------------------------

  router.post(
    "/api/concept2/connect",
    requireUser,
    refuseAmbiguousAuth,
    async (req, res) => {
      if (!available()) {
        unavailableJson(res);
        return;
      }
      const body = isRec(req.body) ? req.body : {};
      // Ruling (i), James 2026-09-03: "I don't want that set in our app. I
      // want it to be set on Concept2's side." The mint takes nothing
      // about the rower. An older installed build still SENDS
      // `weightClass` in this body and is deliberately not refused — the
      // field is read by nothing, so the value is ignored rather than
      // 400'd. Refusing it would brick every unupdated build the moment
      // this deploys, for a field the server no longer has a use for.
      const userId = req.user!.id;
      // Surface is SERVER-DERIVED from which credential requireUser
      // resolved (design §1) — no client-asserted surface exists for an
      // attacker to choose.
      const surface: LinkSurface = req.authVia === "bearer" ? "native" : "web";
      if (surface === "native" && body.linkClient !== NATIVE_LINK_CLIENT) {
        res.status(409).json({ error: "update_required" });
        return;
      }
      const redirectUri =
        surface === "native" ? NATIVE_REDIRECT_URI : webRedirectUri;

      // GC is the server's, no cron: sweep stale attempts globally. The
      // per-user replacement is the upsert's own ON CONFLICT (user_id),
      // one atomic statement (design §2) — no delete precedes it.
      await store.deleteExpiredAttempts(ATTEMPT_MAX_AGE_MS);
      let nonce = randomBytes(32).toString("hex");
      try {
        await store.createAttempt({ nonce, userId, surface });
      } catch (err) {
        if (!(err instanceof AttemptNonceCollisionError)) throw err;
        // 32 random bytes collided with another row's PK: retry ONCE with
        // a fresh nonce; a second collision propagates (500).
        nonce = randomBytes(32).toString("hex");
        await store.createAttempt({ nonce, userId, surface });
      }
      // `state` explicit beside the URL (design §3): the native app holds
      // the correlation value it presents at /exchange without depending
      // on Concept2's undocumented `state` echo on a private-use scheme.
      res.json({
        authorizeUrl: client.authorizeUrl(nonce, redirectUri),
        state: nonce,
      });
    },
  );

  // -- web callback (design §5 — the ladder, in this exact order) --------

  router.get("/api/concept2/callback", async (req, res) => {
    // 0. CONSTRAINT: this is the ONLY place the header is set; every
    //    callback response path passes through here, including the
    //    throw/500 path — "a rejected store call -> 500 from Express's own
    //    handler, still Referrer-Policy: no-referrer" (concept2.test.ts)
    //    bites if this moves.
    //    Why it must sit above the ladder: the URL carries `code` and
    //    `state` (RFC 9700 §4.2) and must not leak them on ANY exit —
    //    including the ones no line of this function writes (a rejected
    //    `peekAttempt`/`consumeAttemptFor`, or a non-conflict `upsertLink`
    //    error re-thrown, all land on Express's default error handler).
    //    Verified against the real handler rather than assumed:
    //    `finalhandler` removes only the Content-* headers before writing
    //    its 500, so a header set here survives.
    noReferrer(res);
    // 1. availability — consumes NOTHING. PR1's flag-off consume was the
    //    route's last unauthenticated write, an attempt-destruction
    //    primitive that bought nothing; deleted at PR1.75a.
    if (!available()) {
      sendPage(res, renderCallbackPage("unavailable"));
      return;
    }
    // 2. params
    const state =
      typeof req.query.state === "string" ? req.query.state : undefined;
    const code =
      typeof req.query.code === "string" ? req.query.code : undefined;
    if (state === undefined || code === undefined) {
      sendPage(res, renderCallbackPage("incomplete"));
      return;
    }
    // 3. the completing principal: the erg_session COOKIE, resolved here
    //    (never `requireUser`). A bearer on a top-level GET can only come
    //    from a non-browser caller; if one is present AND names a
    //    different user than the cookie, that is the §1(b) refusal — JSON,
    //    since no approved page exists for it.
    const user = await resolveCookieSession(req);
    if (bearerToken(req) !== undefined) {
      const viaBearer = await resolveBearerSession(req);
      if (viaBearer && user && viaBearer.id !== user.id) {
        // No `noReferrer(res)` here: step 0 above already set it for every
        // exit from this handler, and a second call could not be observed
        // to matter — a gate that cannot go red is worse than none (RF21).
        // The header is asserted on THIS response by the ambiguous-callback
        // test; step 0's call is what makes that assertion pass.
        res.status(400).json({ error: "ambiguous_auth" });
        return;
      }
    }
    if (!user) {
      sendPage(res, renderCallbackPage("notSignedIn"));
      return;
    }
    // 4. peek (advisory)
    const attempt = await store.peekAttempt(state);
    if (!attempt) {
      sendPage(res, renderCallbackPage("expired"));
      return;
    }
    // 5. surface — NOT consumed
    if (attempt.surface !== "web") {
      sendPage(res, renderCallbackPage("expired"));
      return;
    }
    // 6. identity — NOT consumed, exchange never called: the rightful
    //    user's attempt survives a wrong-principal presentation (the DoS
    //    leg), and the one-time code is never spent for a rejected request.
    if (attempt.userId !== user.id) {
      sendPage(res, renderCallbackPage("wrongAccount"));
      return;
    }
    // 7. consume — the conditional DELETE is the AUTHORITY; null means a
    //    concurrent completion or a re-mint won.
    const consumed = await store.consumeAttemptFor(
      state,
      user.id,
      "web",
      ATTEMPT_MAX_AGE_MS,
    );
    if (!consumed || !consumed.fresh) {
      sendPage(res, renderCallbackPage("expired"));
      return;
    }
    // 8. exchange with the WEB redirect (Concept2 requires it to match the
    //    authorize call's) -> me -> link -> Linked page naming both
    //    identities (D2).
    const tokenResult = await client.exchangeCode(code, webRedirectUri);
    if (!tokenResult.ok) {
      sendPage(res, renderCallbackPage("failed"));
      return;
    }
    const me = await client.fetchMe(tokenResult.tokens.accessToken);
    if (!me.ok) {
      sendPage(res, renderCallbackPage("failed"));
      return;
    }
    try {
      // Clears any previously-set needsReauthAt (stores/concept2.ts's own
      // `upsertLink` comment) — a successful relink IS the recovery.
      await store.upsertLink(user.id, {
        c2UserId: me.c2UserId,
        // `||`, not `??`: ABSENT, EMPTY and VALUED are three cases and only
        // one of them is a username. `client.ts`'s `fetchMe` returns any
        // string it finds, empty included (observation 18), and storing
        // `""` would put a blank where the card's identity line names an
        // account. `|| null` collapses both non-identities to the one the
        // column already means.
        c2Username: me.username || null,
        accessToken: tokenResult.tokens.accessToken,
        refreshToken: tokenResult.tokens.refreshToken,
        expiresAt: tokenResult.tokens.expiresAt,
        // No `weightClass`: migration 0023 dropped the column. `consumed`
        // is now read only for its freshness verdict.
      });
    } catch (err) {
      // D1: the Concept2 account already belongs to a different Ergomatic
      // user; the tokens are discarded with this request.
      if (err instanceof Concept2LinkConflictError) {
        sendPage(res, renderCallbackPage("alreadyLinked"));
        return;
      }
      throw err;
    }
    sendPage(
      res,
      renderCallbackPage("linked", {
        // `username` is documented optional on Concept2's /users/me (plan
        // observation 3) — the numeric id is the fallback so the page
        // never renders an empty identity.
        //
        // `||`, not `??` (observation 18): an empty username is a string
        // and would render "Concept2  is now connected to Ergomatic …" —
        // under a comment that used to claim this page "never renders an
        // empty identity".
        //
        // `account #<id>`, not `#<id>`: ONE spelling of the numeric
        // identity across both surfaces. The card's `identityLine`
        // renders "Concept2 account #2211 · Ergomatic …", and a rower who
        // sees "#2211" here and "account #2211" a screen later has to work
        // out they are the same thing.
        c2Username: me.username || `account #${String(me.c2UserId)}`,
        email: user.email,
      }),
    );
  });

  // -- native exchange (design §6 — the ladder, in this exact order) -----

  router.post(
    "/api/concept2/exchange",
    requireUser,
    refuseAmbiguousAuth,
    async (req, res) => {
      // 1. availability
      if (!available()) {
        unavailableJson(res);
        return;
      }
      // 2. body shape, field-named
      const body = isRec(req.body) ? req.body : {};
      const code = body.code;
      const state = body.state;
      if (typeof code !== "string" || code === "") {
        res.status(400).json({ error: "code must be a string", field: "code" });
        return;
      }
      if (typeof state !== "string" || state === "") {
        res
          .status(400)
          .json({ error: "state must be a string", field: "state" });
        return;
      }
      // 2b. the request states its own credential class BEFORE anything
      //     is peeked — a stored column is not the place to route a
      //     property of the request.
      if (req.authVia !== "bearer") {
        res.status(400).json({ error: "wrong_surface" });
        return;
      }
      const userId = req.user!.id;
      // 3. peek (advisory)
      const attempt = await store.peekAttempt(state);
      if (!attempt) {
        res.status(400).json({ error: "invalid_state" });
        return;
      }
      // 4. surface — not consumed
      if (attempt.surface !== "native") {
        res.status(400).json({ error: "wrong_surface" });
        return;
      }
      // 5. identity — not consumed, exchange never called
      if (attempt.userId !== userId) {
        res.status(403).json({ error: "principal_mismatch" });
        return;
      }
      // 6. consume — the conditional DELETE is the authority
      const consumed = await store.consumeAttemptFor(
        state,
        userId,
        "native",
        ATTEMPT_MAX_AGE_MS,
      );
      if (!consumed) {
        res.status(400).json({ error: "invalid_state" });
        return;
      }
      if (!consumed.fresh) {
        res.status(400).json({ error: "expired" });
        return;
      }
      // 7. exchange with the NATIVE redirect -> me -> link. Nothing from
      //    Concept2's own error body ever reaches this response.
      const tokenResult = await client.exchangeCode(code, NATIVE_REDIRECT_URI);
      if (!tokenResult.ok) {
        res.status(502).json({ error: "c2_error" });
        return;
      }
      const me = await client.fetchMe(tokenResult.tokens.accessToken);
      if (!me.ok) {
        res.status(502).json({ error: "c2_error" });
        return;
      }
      try {
        await store.upsertLink(userId, {
          c2UserId: me.c2UserId,
          // `||`, not `??` — the same absent/empty/valued rule the web
          // callback's own site above states in full.
          c2Username: me.username || null,
          accessToken: tokenResult.tokens.accessToken,
          refreshToken: tokenResult.tokens.refreshToken,
          expiresAt: tokenResult.tokens.expiresAt,
          // No `weightClass`: migration 0023 dropped the column.
        });
      } catch (err) {
        // D1, native half: 409 and the tokens are discarded.
        if (err instanceof Concept2LinkConflictError) {
          res.status(409).json({ error: "already_linked_elsewhere" });
          return;
        }
        throw err;
      }
      // Never a token on this response — the same projection GET /link
      // makes. No `weightClass`: ruling (i) dropped the column it was read
      // from, and `adapters/linkFlow.ts`'s `linked` outcome stopped
      // declaring the field in the same commit.
      res.status(200).json({
        linked: true,
        c2UserId: me.c2UserId,
      });
    },
  );

  // -- link ---------------------------------------------------------------

  router.get(
    "/api/concept2/link",
    requireUser,
    refuseAmbiguousAuth,
    async (req, res) => {
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
        // No `weightClass` (ruling i): there is no stored class, and the
        // card never showed one. Both sides of
        // `scripts/webauth-contract.test.ts`'s key gate drop it in the
        // same commit.
        //
        // PR2 needs the linked account's identity to render the sent-state
        // contract (spec F8: "sent" only when a row's c2_user_id matches
        // the LIVE link's) and to build the View-on-Concept2 URL
        // (/profile/{c2_user_id}/log/{result_id}). Still no token on this
        // response — only the numeric account id, the username, and our
        // own configured origin.
        c2UserId: link.c2UserId,
        c2Username: link.c2Username,
        // EXPLICIT `key: value`, never the ES2015 shorthand
        // `logbookBaseUrl,` — `scripts/webauth-contract.test.ts`'s
        // `linkResponseKeys()` parses this literal with a regex that
        // requires a `key:`, and holds the result equal to both
        // `Concept2LinkProbe.tsx`'s `LinkStatus` and `useConcept2Link.ts`'s
        // `Concept2Link`. Shorthand makes this key INVISIBLE to that gate:
        // the gate stays green while the thing it exists to track goes
        // unpinned. The redundancy is the point.
        logbookBaseUrl: logbookBaseUrl,
        needsReauth: link.needsReauthAt !== null,
      });
    },
  );

  router.delete(
    "/api/concept2/link",
    requireUser,
    refuseAmbiguousAuth,
    async (req, res) => {
      if (!available()) {
        unavailableJson(res);
        return;
      }
      // The ONE delete path, user-initiated (spec V5: no revocation
      // endpoint; unlink is local). Idempotent — deleting an absent link
      // matches zero rows, still 204.
      await store.deleteLink(req.user!.id);
      res.status(204).end();
    },
  );

  // -- upload ---------------------------------------------------------------

  router.post(
    "/api/concept2/results/:logId",
    requireUser,
    refuseAmbiguousAuth,
    async (req, res) => {
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
      //
      // This exit deliberately does NOT gain `weightClass`/
      // `weightClassSource`: no class was resolved on this request, and
      // inventing one would be a claim about a send that happened in the
      // past. The client reads both new fields defensively for exactly
      // this reason.
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
      // `effectiveTz` MUST be resolved before the row used to build the
      // payload is constructed — building `mappingRow` first and only
      // writing `tz` afterward leaves `mappingRow.tz` `null` even on a row
      // whose `completedAt` is already set, so `buildC2Payload`'s paired
      // branch (`completedAt !== null && tz !== null`) never fires on
      // attempt 1 (falls to `loggedAt` + the request's own zone) but DOES
      // fire on a retry once `row.tz` is no longer null read fresh — two
      // different dates for the same row. `recordTz` returns the zone that
      // actually landed (a concurrent writer may have beaten this request
      // to it), so `effectiveTz` is never this request's own guess when
      // someone else already decided it.
      const effectiveTz =
        row.tz === null ? await logs.recordTz(userId, logId, tz) : row.tz;

      // The row used to build the payload, AFTER `effectiveTz` is settled:
      // `tz` is forced to `effectiveTz` (never the raw, possibly-null
      // `row.tz`) so `buildC2Payload`'s paired branch treats a freshly
      // persisted zone exactly like an already-stored one — same stable
      // `completedAt`-based date on every attempt from here on.
      const mappingRow: SessionLogRow = { ...eligibilityRow, tz: effectiveTz };

      // I4: the `c2UserId` for the weight-class read and for
      // `recordC2Result` must come from the LOCKED re-read inside
      // `withLinkLock`, never the unlocked `store.getLink` read above — a
      // relink landing between that read and the lock would otherwise pair
      // the OLD account's identity with the NEW account's token.
      //
      // Ruling (i) narrowed this to ONE field: `weightClass` used to ride
      // here too, read off the stored link row. There is no stored class
      // any more (migration 0023) — it is resolved from Concept2 below.
      type LinkIdentity = { c2UserId: number };
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
          const identity: LinkIdentity = { c2UserId: locked.c2UserId };
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
            // Link INTACT (plan deviation 3) — automatic paths never
            // delete. (It used to say "link + weight_class"; ruling i
            // dropped the column, so the link itself is the whole cost.)
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

      // Both wire calls this route makes can come back 401, and both must
      // answer identically — hence one helper rather than two copies. The
      // flag must be bound to the SAME link that actually produced the 401:
      // a fresh unconditional `withLinkLock` would flag whatever link exists
      // at that moment, and a callback relink landing in between would clear
      // `needsReauthAt` (upsertLink's own contract) and then have this
      // re-flag the NEW grant on the OLD grant's rejection (I4's
      // authority-split class). If the link's CURRENT access token still
      // matches the rejected one, the grant this route tried is still live —
      // flag it. If it does not match, a relink or rotation happened
      // concurrently and the NEW grant was never tried at all, so the honest
      // answer is a retryable c2_error rather than a needs_reauth that sends
      // the rower through re-consent for a grant that may be fine.
      async function flagIfSameGrant(rejectedToken: string): Promise<boolean> {
        return store.withLinkLock<boolean>(userId, async (locked) => {
          const matches =
            locked !== null && locked.accessToken === rejectedToken;
          if (matches) {
            return { action: "flagReauth", result: true };
          }
          return { action: "none", result: false };
        });
      }

      // Producer order for Concept2's `weight_class` (ruling i;
      // `concept2/mapping.ts`'s block comment carries the vendor sentence
      // that forces it): the rower's own most recent DECLARATION first, our
      // derivation from their profile second, a refusal third. We never
      // guess a competition category onto a permanent third-party record.
      //
      // A FAILED read is not an EMPTY read. A `c2_error` on the declaration
      // page returns here, retryable, naming the layer that failed; only a
      // page that came back and genuinely carries no usable class falls
      // through to the profile. Refusing when we have no data and guessing
      // when we FAILED TO READ data is an asymmetry nothing argues for, and
      // the thing it guesses is a competition category on a permanent
      // third-party record. The only failure this helper surfaces as `auth`
      // is one the CALLER must re-run wholesale on a refreshed token.
      //
      // `ourResultIds` is observation 29: the results list contains the rows
      // this app posted, and nothing on them says so. `ourRowsSkipped` rides
      // out purely so the log line can report it — it is a count of OUR OWN
      // writes, never anything about the rower's other rows.
      type WeightClassResolution =
        | {
            ok: true;
            weightClass: WeightClass;
            source: WeightClassSource;
            ourRowsSkipped: number;
          }
        | { ok: false; kind: "auth" }
        | {
            ok: false;
            kind: "c2_error";
            layer: "declaration" | "profile";
            status: number | null;
          }
        | { ok: false; kind: "no_class"; reason: WeightClassFailure };

      async function resolveWeightClass(
        token: string,
        c2UserId: number,
      ): Promise<WeightClassResolution> {
        const list = await client.fetchResults(token, DECLARATION_PAGE_SIZE);
        if (!list.ok) {
          if (list.kind === "auth") return { ok: false, kind: "auth" };
          return {
            ok: false,
            kind: "c2_error",
            layer: "declaration",
            status: list.status,
          };
        }
        const ourResultIds = await logs.sentC2ResultIds(userId, c2UserId);
        const ourRowsSkipped = list.rows.filter(
          (row) => row.id !== null && ourResultIds.has(row.id),
        ).length;
        const declared = pickDeclaredWeightClass(list.rows, {
          ourResultIds,
          now: now().getTime(),
        });
        if (declared !== null) {
          return {
            ok: true,
            weightClass: declared,
            source: "declaration",
            ourRowsSkipped,
          };
        }
        const me = await client.fetchMe(token);
        if (!me.ok) {
          if (me.kind === "auth") return { ok: false, kind: "auth" };
          return {
            ok: false,
            kind: "c2_error",
            layer: "profile",
            status: me.status,
          };
        }
        const derived = deriveWeightClass(me);
        if (!derived.ok) {
          return { ok: false, kind: "no_class", reason: derived.reason };
        }
        return {
          ok: true,
          weightClass: derived.weightClass,
          source: "profile",
          ourRowsSkipped,
        };
      }

      // One line per send, naming WHICH producer answered — the route had no
      // logging at all before this. `console.log` on success and
      // `console.warn` on failure follows `auth/middleware.ts`'s convention
      // (`auth_via` logs, `auth_disagreement` warns).
      //
      // What it carries and what it must never carry: our own `logId` and
      // the resolved source; a COUNT of how many returned rows were OUR OWN
      // writes (the diagnostic that would have exposed observation 29 in
      // production); and on failure the layer, its status, or the refusal
      // reason. Never a token, never a result body, never a Concept2 result
      // id, never anything about another rower's rows.
      function logWeightClass(outcome: WeightClassResolution): void {
        const base = { event: "c2_weight_class", logId };
        if (outcome.ok) {
          console.log(
            JSON.stringify({
              ...base,
              source: outcome.source,
              ourRowsSkipped: outcome.ourRowsSkipped,
            }),
          );
          return;
        }
        console.warn(
          JSON.stringify({
            ...base,
            failure: outcome.kind,
            layer: outcome.kind === "c2_error" ? outcome.layer : undefined,
            status: outcome.kind === "c2_error" ? outcome.status : undefined,
            reason: outcome.kind === "no_class" ? outcome.reason : undefined,
          }),
        );
      }

      const tokenOutcome = await acquireAccessToken();
      if (!tokenOutcome.ok) {
        res.status(tokenOutcome.status).json(tokenOutcome.body);
        return;
      }

      let accessToken = tokenOutcome.accessToken;
      let lockedLink = tokenOutcome.link;

      // Ruling (i): the weight class Concept2 requires on every rower result
      // is Concept2's, and we ask the rower for nothing. It is resolved HERE,
      // on the send that uses it — never stored, never cached across requests
      // (ruling R13). A declaration can change on Concept2 at any moment with
      // no signal to us, and a stale one writes a wrong competition category
      // into a record we cannot edit. The cost is one extra round trip per
      // send (~220 ms measured, +~440 ms when the profile fallback also runs)
      // on a human-initiated action that already renders SENDING; sends are
      // one per workout, never on a render or a poll. What IS reused is one
      // resolution per REQUEST across the internal 401 retry below — a
      // re-read between two attempts at the same row could send two different
      // classes for one send, which is the split-authority defect I4 exists
      // to prevent.
      let resolved = await resolveWeightClass(accessToken, lockedLink.c2UserId);
      if (!resolved.ok && resolved.kind === "auth") {
        const retryOutcome = await acquireAccessToken({
          staleAccessToken: accessToken,
        });
        if (!retryOutcome.ok) {
          res.status(retryOutcome.status).json(retryOutcome.body);
          return;
        }
        accessToken = retryOutcome.accessToken;
        lockedLink = retryOutcome.link;
        // The WHOLE resolution re-runs on the fresh token, declaration read
        // included: retrying only the profile would silently demote a rower
        // who HAS a declaration to our own derivation, purely because their
        // first token had expired.
        resolved = await resolveWeightClass(accessToken, lockedLink.c2UserId);
        if (!resolved.ok && resolved.kind === "auth") {
          // I2's rule, one wire call earlier than it used to apply: a repeat
          // 401 after a GENUINE refresh is a dead grant, not a stale token.
          // Same helper, same answer, same never-delete.
          logWeightClass(resolved);
          const stillSameGrant = await flagIfSameGrant(accessToken);
          res
            .status(stillSameGrant ? 409 : 502)
            .json(
              stillSameGrant
                ? { error: "needs_reauth" }
                : { error: "c2_error" },
            );
          return;
        }
      }
      logWeightClass(resolved);
      if (!resolved.ok) {
        if (resolved.kind !== "no_class") {
          // A read that FAILED, not a read that came back empty — the
          // difference matters because only one of them may be guessed past.
          // It answers the existing retryable family (502 `c2_error`, the
          // same words a failed post gets) rather than a new wire token,
          // because from the rower's side it is the same fact and the only
          // honest advice is "try again". WHICH layer failed is in the log
          // line above, where an operator needs it.
          res.status(502).json({ error: "c2_error" });
          return;
        }
        // A SECOND 422, and the client must tell it from `not_eligible`: that
        // one is decided from the ROW and cannot be repaired, this one is
        // decided from Concept2's own side and IS repairable — by designating
        // a class on a Concept2 result, or by fixing the profile weight.
        res
          .status(422)
          .json({ error: "no_weight_class", reason: resolved.reason });
        return;
      }

      let payload = buildC2Payload(
        mappingRow,
        resolved.weightClass,
        effectiveTz,
      );
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
        // Same class, deliberately: resolved ONCE per request (ruling R13),
        // reused across this retry so one send can never carry two classes.
        payload = buildC2Payload(mappingRow, resolved.weightClass, effectiveTz);
        postResult = await client.postResult(accessToken, payload);

        // I2: a REPEAT 401 immediately after a GENUINE refresh (or after
        // picking up another request's already-rotated pair) is the same
        // signal `refreshTokens`'s own `grantDead` gives — the grant is
        // invalid, not merely stale-by-timing. Flag it identically (never
        // delete) rather than falling through to a generic c2_error.
        // `flagIfSameGrant` above carries the whole justification for why
        // the flag is bound to the rejected grant rather than to whatever
        // link exists at that moment.
        if (!postResult.ok && postResult.kind === "auth") {
          const stillSameGrant = await flagIfSameGrant(accessToken);
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
        // The class and WHERE IT CAME FROM ride the response so the rower can
        // see them on the SENT state (ruling R2). Concept2's own help makes
        // the class the rower's DECLARATION, so a class we DERIVED is a
        // guess — and a guess nobody is ever shown can never be corrected,
        // even though Concept2 permits per-result editing. Neither value is
        // stored: this is the one moment they exist, which is exactly the
        // moment the disagreement is created.
        res.status(200).json({
          resultId: postResult.resultId,
          weightClass: resolved.weightClass,
          weightClassSource: resolved.source,
        });
        return;
      }
      if (postResult.kind === "duplicate") {
        // RF25: C2's 409 body names the colliding numeric result id, which
        // is C2 acknowledging this row — the same acknowledgment a 2xx
        // would be. Recording it here BEFORE responding is what makes the
        // recovery durable: the row that reaches this branch either sent
        // for the first time and collided, or already got a real 201 whose
        // OWN `recordC2Result` write failed (the 502 branch above) and is
        // now retrying into C2's own duplicate rejection — without this
        // write that row shows unsent forever, across reload and across
        // devices. The identity written is `lockedLink`'s (I4: the LOCKED
        // re-read, never the route's earlier unlocked `store.getLink`),
        // same as the 2xx branch above. If THIS write also fails, still
        // return duplicate — the retry loop this branch itself came from
        // remains the open recovery path, exactly as the 2xx branch's own
        // `recorded` check does for its symmetric failure.
        await logs.recordC2Result(
          userId,
          logId,
          postResult.resultId,
          lockedLink.c2UserId,
        );
        res
          .status(409)
          .json({ error: "duplicate", c2ResultId: postResult.resultId });
        return;
      }
      // Only "c2_error" can still reach here — every "auth" outcome is
      // handled above, either by a successful retry or by the repeat-401
      // flagReauth branch.
      res.status(502).json({ error: "c2_error" });
    },
  );

  return router;
}
