import { Router } from "express";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  clearOauthCookie,
  clearSessionCookie,
  getCookie,
  oauthCookie,
  sessionCookie,
} from "./cookies.js";
import type { OAuthProvider } from "./google.js";
import { bearerToken, requireUser } from "./middleware.js";
import type { NativeTokenVerifier } from "./nativeVerify.js";
import { signInWithClaims } from "./signin.js";
import type { SessionStore } from "./sessions.js";
import type { UserStore } from "./users.js";
import type { AccessPolicy } from "./accessPolicy.js";
import { AuthFailure } from "./frontDoorErrors.js";

export interface AuthDeps {
  frontDoor?: import("./frontDoor.js").FrontDoor | null;
  sessions: SessionStore;
  users: UserStore;
  oauth: OAuthProvider | null;
  nativeVerifier: NativeTokenVerifier | null;
  accessPolicy: AccessPolicy;
  siteUrl: string;
}

export function createAuthRouter({
  sessions,
  users,
  oauth,
  nativeVerifier,
  accessPolicy,
  siteUrl,
  frontDoor,
}: AuthDeps): Router {
  const router = Router();
  async function login(
    claims: import("./google.js").Claims,
  ): Promise<import("./signin.js").SignInResult> {
    if (!frontDoor)
      return signInWithClaims({ sessions, users, accessPolicy }, claims);
    let signed;
    try {
      signed = await frontDoor.attempts.legacyGoogle(claims);
    } catch (error) {
      if (error instanceof AuthFailure && error.code === "access_denied") {
        return { outcome: "denied", email: error.email ?? claims.email };
      }
      throw error;
    }
    return {
      outcome: "ok",
      user: signed.user,
      token: signed.token!,
      expiresAt: new Date(signed.expiresAt),
    };
  }

  // THE LEGACY DOORS ARE DELIBERATELY NOT RATE-LIMITED (James, 2026-09-13,
  // reversing this spec's own bound on the PM gate's finding). They used to
  // carry `frontDoor.admission` whenever Apple was configured, which meant
  // merging this PR put a GLOBALLY keyed 120/min bucket in front of the Google
  // door every tester uses today — main has no limiter on these paths at all,
  // and `express-rate-limit` is new here. 121 unauthenticated requests from
  // anywhere would have locked out every rower's sign-in for the rest of the
  // window, on a path this PR has no business changing. The new front-door
  // routes keep their bucket; this restores main's behaviour on the old ones.

  router.get("/api/auth/signin", async (_req, res) => {
    if (!oauth) {
      res
        .status(503)
        .json({ error: "sign-in unavailable: Google OAuth is not configured" });
      return;
    }
    const { url, cookiePayload } = await oauth.authorizationUrl();
    res.setHeader("Set-Cookie", oauthCookie(cookiePayload));
    res.redirect(url);
  });

  router.get("/api/auth/callback", async (req, res) => {
    const clear = clearOauthCookie();
    if (typeof req.query.error === "string") {
      // User cancelled (access_denied) is normal; anything else = retry page.
      res.setHeader("Set-Cookie", clear);
      res.redirect(
        req.query.error === "access_denied" ? "/" : "/?error=signin_failed",
      );
      return;
    }
    if (!oauth) {
      res.setHeader("Set-Cookie", clear);
      res.redirect("/?error=signin_failed");
      return;
    }
    const payload = getCookie(req.headers.cookie, OAUTH_COOKIE);
    if (!payload || typeof req.query.code !== "string") {
      res.setHeader("Set-Cookie", clear);
      res.redirect("/?error=signin_failed");
      return;
    }
    let claims;
    try {
      const currentUrl = new URL(req.originalUrl, siteUrl);
      claims = await oauth.callbackClaims(currentUrl, payload);
    } catch {
      res.setHeader("Set-Cookie", clear);
      res.redirect("/?error=signin_failed");
      return;
    }

    try {
      const result = await login(claims);
      if (result.outcome === "denied") {
        res.setHeader("Set-Cookie", clear);
        res.redirect(`/?denied=${encodeURIComponent(result.email)}`);
        return;
      }
      res.setHeader("Set-Cookie", [
        clear,
        sessionCookie(result.token, result.expiresAt),
      ]);
      res.redirect("/");
    } catch {
      res.setHeader("Set-Cookie", clear);
      res.redirect("/?error=signin_failed");
    }
  });

  router.post("/api/auth/native", async (req, res) => {
    if (!nativeVerifier) {
      res.status(503).json({
        error:
          "native sign-in unavailable: GOOGLE_IOS_CLIENT_ID not configured",
      });
      return;
    }
    const idToken = (req.body as { idToken?: unknown })?.idToken;
    if (typeof idToken !== "string" || idToken === "") {
      res.status(400).json({ error: "idToken required" });
      return;
    }
    let claims;
    try {
      claims = await nativeVerifier(idToken);
    } catch {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    try {
      const result = await login(claims);
      if (result.outcome === "denied") {
        res.status(403).json({ error: "denied", email: result.email });
        return;
      }
      res.json({
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
        user: result.user,
      });
    } catch {
      res.status(500).json({ error: "signin_failed" });
    }
  });

  router.post("/api/auth/signout", async (req, res) => {
    const token =
      bearerToken(req) ?? getCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) await sessions.deleteSession(token);
    res.setHeader("Set-Cookie", clearSessionCookie());
    res.status(204).end();
  });

  router.get("/api/me", requireUser(sessions), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
