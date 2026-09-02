import type { NextFunction, Request, RequestHandler, Response } from "express";
import { SESSION_COOKIE, getCookie, sessionCookie } from "./cookies.js";
import type { SessionStore, SessionUser } from "./sessions.js";

// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §1): which
// credential `requireUser` RESOLVED. Request-lifetime, never persisted; the
// concept2 router derives an attempt's `surface` from it (bearer -> native,
// cookie -> web), so no client-asserted surface exists.
export type AuthVia = "bearer" | "cookie";

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
    authVia?: AuthVia;
  }
}

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function bearerToken(req: Request): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

// An empty-valued session cookie (`erg_session=`) is ABSENT, however it was
// produced: `clearSessionCookie()` sets `maxAge: 0` so a compliant browser
// DELETES rather than empties it (cookies.ts), and whether the shared
// native cookie jar can ever carry one is UNMEASURED (design §1). Written
// as a value check, never `!== undefined` — the one derivation this PR
// adds that would otherwise misread "" as a present cookie.
export function cookieToken(req: Request): string | undefined {
  const raw = getCookie(req.headers.cookie, SESSION_COOKIE);
  return raw === undefined || raw === "" ? undefined : raw;
}

export function originCheck(siteUrl: string): RequestHandler {
  const allowed = new Set([
    new URL(siteUrl).origin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "capacitor://localhost",
  ]);
  return (req: Request, res: Response, next: NextFunction) => {
    if (MUTATING.has(req.method)) {
      if (bearerToken(req)) {
        next();
        return;
      }
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin)) {
        res.status(403).json({ error: "bad origin" });
        return;
      }
    }
    next();
  };
}

export function requireUser(store: SessionStore): RequestHandler {
  return async (req, res, next) => {
    const bearer = bearerToken(req);
    const cookie = cookieToken(req);
    // Both-present rule (design §1, the gate doc's own resolution §3(g)
    // round 16): BEARER WINS — native is the only consumer that carries
    // one, and an attacker who supplies their own bearer gains nothing by
    // also supplying a cookie.
    const token = bearer ?? cookie;
    if (!token) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const resolved = await store.resolveSession(token);
    if (!resolved) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const authVia: AuthVia = bearer !== undefined ? "bearer" : "cookie";

    // Disagreement, scope (a) of design §1: both present AND resolving to
    // DIFFERENT users is LOGGED app-wide, never refused here — this
    // middleware is mounted over the whole API (routes/data.ts's
    // `router.use("/api", requireUser)`) and deploys to prod web on merge,
    // while whether the native jar can ever carry `erg_session` is
    // UNMEASURED until PR1.75b's walk reads this very line. The hard 400
    // lives in routes/concept2.ts (scope (b)), dark behind the flag.
    // Cost: one extra session lookup per both-present request. Plan
    // observation 7: this second `resolveSession` call can also extend the
    // COOKIE session's expiry as a side effect (sessions.ts's
    // `shouldRefresh`/refresh-on-read) even though bearer won and no
    // `Set-Cookie` is emitted for it. Never a token value.
    if (bearer !== undefined && cookie !== undefined) {
      const viaCookie = await store.resolveSession(cookie);
      if (viaCookie && viaCookie.user.id !== resolved.user.id) {
        console.warn(
          JSON.stringify({
            event: "auth_disagreement",
            bearerUser: resolved.user.id,
            cookieUser: viaCookie.user.id,
            path: req.path,
          }),
        );
      }
    }

    // Walk instrument (design §Testing (d)): an env flag, never NODE_ENV,
    // so the device walk runs the PR's own build. Presence booleans and
    // the path only — never a token value.
    if (process.env.AUTH_VIA_LOG === "1") {
      console.log(
        JSON.stringify({
          event: "auth_via",
          authVia,
          bearerPresent: bearer !== undefined,
          cookiePresent: cookie !== undefined,
          path: req.path,
        }),
      );
    }

    if (resolved.refreshed) {
      if (bearer) {
        res.setHeader("X-Session-Expires-At", resolved.expiresAt.toISOString());
      } else {
        res.setHeader("Set-Cookie", sessionCookie(token, resolved.expiresAt));
      }
    }
    req.user = resolved.user;
    req.authVia = authVia;
    next();
  };
}
