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

  /**
   * THE RENAME (Gate 0 2026-09-19, option A; pack at
   * `docs/design/rename-gate0/`).
   *
   * WHY IT EXISTS. A rower Apple did not offer the name screen to lands as
   * `"Rower"` (`providers.ts`), and Apple never shows that screen twice — so
   * before this, the name was permanent. That permanence is what made a
   * failed Apple token revoke a real defect rather than an untidy one.
   *
   * IT IS THE ONLY WRITER OF `users.name` AFTER CREATION. The two paths that
   * used to re-copy the provider's name on every sign-in stopped doing so in
   * the same change (`signin.ts`, and `legacyGoogle`'s upsert in
   * `attempts.ts`), because a rename that a sign-in silently reverts is worse
   * than no rename at all. The provider names an account once; the rower owns
   * it after that.
   *
   * EMPTY IS REFUSED RATHER THAN COERCED. `users.name` is NOT NULL, so empty
   * is the one value the column itself forbids; answering 400 tells the
   * screen what happened instead of storing a space that renders as a blank
   * row and an empty avatar.
   */
  router.patch("/api/me", requireUser(sessions), async (req, res) => {
    const raw: unknown = (req.body as { name?: unknown } | undefined)?.name;
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    await users.updateProfile(req.user!.id, name);
    // The updated user, not a bare 204: the screen renders the name it just
    // sent, and every other identity surface (You's header, its initials)
    // reads the same object.
    res.json({ user: { ...req.user!, name } });
  });

  return router;
}
