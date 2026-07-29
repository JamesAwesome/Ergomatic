import type { NextFunction, Request, RequestHandler, Response } from "express";
import { SESSION_COOKIE, getCookie, sessionCookie } from "./cookies.js";
import type { SessionStore, SessionUser } from "./sessions.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
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
    const token = bearer ?? getCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const resolved = await store.resolveSession(token);
    if (!resolved) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (resolved.refreshed) {
      if (bearer) {
        res.setHeader("X-Session-Expires-At", resolved.expiresAt.toISOString());
      } else {
        res.setHeader("Set-Cookie", sessionCookie(token, resolved.expiresAt));
      }
    }
    req.user = resolved.user;
    next();
  };
}
