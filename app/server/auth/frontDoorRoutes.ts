import { Router, type Request, type Response } from "express";
import { stringifySetCookie } from "cookie";
import { rateLimit } from "express-rate-limit";
import type {
  AuthProvider,
  AuthPurpose,
  AuthStep,
  SignedIn,
} from "../../shared/auth.js";
import {
  type Attempt,
  type Attempts,
  type AttemptResult,
  type Surface,
  attemptProvider,
} from "./attempts.js";
import {
  AuthFailure,
  authStatus,
  record,
  requiredText,
} from "./frontDoorErrors.js";
import { clearSessionCookie, getCookie, sessionCookie } from "./cookies.js";
import { requireUser } from "./middleware.js";
import type { SessionStore } from "./sessions.js";
import type { Providers, ProviderProof } from "./providers.js";

const cookieName = "erg_auth_attempt";
function cookie(value: string, maxAge = 300) {
  return stringifySetCookie({
    name: cookieName,
    value,
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/auth",
    maxAge,
  });
}
function webBinding(req: Request): { id: string; bindingSecret: string } {
  const raw = requiredText(getCookie(req.headers.cookie, cookieName), 128);
  const parts = raw.split(".");
  if (
    parts.length !== 2 ||
    !/^[0-9a-f-]{36}$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
  )
    throw new AuthFailure("invalid_proof");
  return { id: parts[0], bindingSecret: parts[1] };
}
function id(req: Request) {
  const value = requiredText(req.params.id, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new AuthFailure("invalid_request");
  return value;
}
function requestBinding(req: Request, surface: Surface) {
  if (surface === "web") {
    const b = webBinding(req);
    if (b.id !== id(req)) throw new AuthFailure("invalid_proof");
    return b.bindingSecret;
  }
  return requiredText(record(req.body).bindingSecret, 128);
}
export function failure(res: Response, error: unknown) {
  const code = error instanceof AuthFailure ? error.code : "signin_failed";
  res.status(authStatus[code]).json({
    error: code,
    ...(code === "access_denied" && error instanceof AuthFailure && error.email
      ? { email: error.email }
      : {}),
  });
}
export function createFrontDoorRoutes(deps: {
  attempts: Attempts;
  providers: Providers;
  sessions: SessionStore;
  siteUrl: string;
}) {
  const { attempts, providers, sessions } = deps;
  const router = Router();
  const admission = rateLimit({
    windowMs: 60000,
    limit: 120,
    // Anonymous auth has no trustworthy identity or IP key at this edge, so
    // every producer intentionally shares one bounded admission bucket.
    keyGenerator: () => "anonymous-auth",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    passOnStoreError: false,
    handler: (_req, res) => {
      res.status(429).json({ error: "rate_limited" });
    },
  });
  function context(a: Attempt) {
    return {
      provider: attemptProvider(a),
      surface: a.surface,
      nonce: a.nonce,
      state: a.state,
      bindingHash: a.bindingHash,
    };
  }
  async function view(a: Attempt): Promise<AuthStep> {
    const base = {
      attemptId: a.id,
      purpose: a.purpose,
      targetProvider: a.targetProvider,
      expiresAt: a.expiresAt.toISOString(),
    };
    if (a.stage === "confirm")
      return {
        ...base,
        outcome: "confirm",
        profile: { email: a.verifiedEmail!, name: a.verifiedName! },
      };
    if (a.stage === "link_ready") return { ...base, outcome: "link_ready" };
    if (a.stage === "delete_ready") return { ...base, outcome: "delete_ready" };
    if (
      !["authorize", "reauth_authorize", "target_authorize"].includes(a.stage)
    )
      throw new AuthFailure("attempt_expired");
    return {
      ...base,
      outcome: "authorize",
      provider: attemptProvider(a),
      stage:
        a.stage === "authorize"
          ? "signin"
          : a.stage === "reauth_authorize"
            ? "reauth"
            : "target",
      nonce: a.nonce,
      state: a.state,
      ...(a.surface === "web"
        ? { authorizationUrl: await providers.authorizationUrl(context(a)) }
        : {}),
    };
  }
  function signed(res: Response, s: SignedIn, surface: Surface) {
    if (surface === "native") return s;
    res.append("Set-Cookie", sessionCookie(s.token!, new Date(s.expiresAt)));
    const { token: _token, ...projection } = s;
    return projection;
  }
  async function result(res: Response, r: AttemptResult, surface: Surface) {
    if (r.signedIn) {
      if (surface === "web") res.append("Set-Cookie", cookie("", 0));
      return signed(res, r.signedIn, surface);
    }
    if (r.linked) {
      if (surface === "web") res.append("Set-Cookie", cookie("", 0));
      return { outcome: "linked" };
    }
    return view(r.attempt!);
  }
  for (const surface of ["native", "web"] as const) {
    const prefix = `/api/auth/${surface}/attempts`;
    router.post(
      prefix,
      admission,
      async (req, res, next) => {
        try {
          // Without this `req.sessionId` is undefined and begin()'s own
          // `if (!input.originalSessionId)` answers account_changed.
          const purpose = record(req.body).purpose;
          if (purpose === "link" || purpose === "delete") {
            await requireUser(sessions)(req, res, next);
          } else next();
        } catch (error) {
          failure(res, error);
        }
      },
      async (req, res) => {
        try {
          const body = record(req.body);
          if (
            (body.provider !== "apple" && body.provider !== "google") ||
            (body.purpose !== "signin" &&
              body.purpose !== "link" &&
              body.purpose !== "delete")
          )
            throw new AuthFailure("invalid_request");
          if (
            // A link needs BOTH providers; a delete re-proves only the one
            // the rower already holds, so the opposite-provider clause must
            // NOT apply to it.
            !providers.available(body.provider, surface) ||
            (body.purpose === "link" &&
              !providers.available(
                body.provider === "apple" ? "google" : "apple",
                surface,
              ))
          )
            throw new AuthFailure("unavailable");
          // A delete is MORE destructive than a link, so it gets the same
          // credential-class binding rather than none.
          if (
            (body.purpose === "link" || body.purpose === "delete") &&
            req.authVia !== (surface === "native" ? "bearer" : "cookie")
          )
            throw new AuthFailure("account_changed");
          let replace: { id: string; bindingSecret: string } | undefined;
          if (surface === "web" && getCookie(req.headers.cookie, cookieName)) {
            try {
              replace = webBinding(req);
            } catch {
              /* A malformed old cookie cannot grant replacement authority. */
            }
          }
          const b = await attempts.begin({
            surface,
            purpose: body.purpose,
            targetProvider: body.provider,
            originalSessionId: req.sessionId,
            replace,
          });
          if (surface === "web")
            res.append(
              "Set-Cookie",
              cookie(`${b.attempt.id}.${b.bindingSecret}`),
            );
          res.json({
            ...(await view(b.attempt)),
            ...(surface === "native" ? { bindingSecret: b.bindingSecret } : {}),
          });
        } catch (error) {
          failure(res, error);
        }
      },
    );
    for (const action of ["confirm", "finalize", "delete", "cancel"] as const)
      router.post(
        `${prefix}/:id/${action}`,
        ...(action === "finalize" || action === "delete"
          ? [requireUser(sessions)]
          : []),
        async (req, res) => {
          try {
            const secret = requestBinding(req, surface);
            const attemptId = id(req);
            if (action === "cancel") {
              await attempts.cancel(attemptId, secret, surface);
              if (surface === "web") res.append("Set-Cookie", cookie("", 0));
              res.status(204).end();
              return;
            }
            const a = await attempts.read(attemptId, secret, surface);
            if (action === "delete") {
              // Any throw from deleteAccount propagates to the catch below and
              // becomes a failure response; it is never caught into a success.
              const outcome = await attempts.deleteAccount(a, req.sessionId!);
              if (surface === "web") {
                res.append("Set-Cookie", cookie("", 0));
                // The account's sessions are already gone with the cascade;
                // clearing the cookie stops the browser sending a token that
                // now resolves to nothing.
                res.append("Set-Cookie", clearSessionCookie());
              }
              res.json(outcome);
              return;
            }
            const r =
              action === "confirm"
                ? await attempts.confirm(a)
                : await attempts.finalize(a, req.sessionId!);
            res.json(await result(res, r, surface));
          } catch (error) {
            failure(res, error);
          }
        },
      );
  }
  router.get("/api/auth/web/attempts/:id", async (req, res) => {
    try {
      res.json(
        await view(
          await attempts.read(id(req), requestBinding(req, "web"), "web"),
        ),
      );
    } catch (error) {
      failure(res, error);
    }
  });
  router.post("/api/auth/native/attempts/:id/proof", async (req, res) => {
    let claimed: Attempt | undefined;
    try {
      const body = record(req.body);
      const secret = requestBinding(req, "native");
      const owned = await attempts.read(id(req), secret, "native");
      const state = requiredText(body.state, 128);
      if (state !== owned.state) throw new AuthFailure("invalid_proof");
      const proof: ProviderProof = {
        state,
        idToken: requiredText(body.idToken),
        ...(body.authorizationCode === undefined
          ? {}
          : { authorizationCode: requiredText(body.authorizationCode, 4096) }),
        ...(body.name === undefined
          ? {}
          : { name: requiredText(body.name, 200) }),
      };
      if (attemptProvider(owned) === "apple" && !proof.authorizationCode)
        throw new AuthFailure("invalid_request");
      claimed = await attempts.claim(owned);
      const identity = await providers.verify(context(claimed), proof);
      res.json(
        await result(res, await attempts.accept(claimed, identity), "native"),
      );
    } catch (error) {
      if (claimed) await discard(claimed);
      failure(res, error);
    }
  });
  router.get("/api/auth/methods", requireUser(sessions), async (req, res) => {
    try {
      res.json(await attempts.methods(req.user!.id));
    } catch (error) {
      failure(res, error);
    }
  });
  // A cleanup failure must not clear the browser's still-live binding cookie.
  async function discard(a: Attempt): Promise<boolean> {
    try {
      return await attempts.discard(a);
    } catch {
      return false;
    }
  }
  async function callback(req: Request, res: Response, provider: AuthProvider) {
    let owned: Attempt | undefined;
    let binding: { id: string; bindingSecret: string } | undefined;
    let purpose: AuthPurpose = "signin";
    let targetProvider: AuthProvider | undefined;
    try {
      binding = webBinding(req);
      const a = await attempts.read(binding.id, binding.bindingSecret, "web");
      // Read the attempt's own purpose and target the moment it loads, NOT
      // after the state/stage checks below. They only feed the failure
      // redirect's query string, and that string is what routes the rower to
      // a surface able to render the failure: `SignInMethods` returns null
      // unless the purpose is "link", and a signed-in rower never renders a
      // signin-purpose error at all. Assigning these later made every
      // rejection at those two checks report a link failure as `signin`, so
      // the rower was bounced silently to Today with the whole recovery path
      // — notice, methods refetch, "Start linking again" — unreachable.
      // `owned` stays below the checks on purpose: it is the discard
      // authority, and these two are not.
      purpose = a.purpose;
      targetProvider = a.targetProvider;
      const body = record(provider === "apple" ? req.body : req.query);
      const state = requiredText(body.state, 128);
      if (state !== a.state || attemptProvider(a) !== provider)
        throw new AuthFailure("invalid_proof");
      if (
        !["authorize", "reauth_authorize", "target_authorize"].includes(a.stage)
      )
        throw new AuthFailure("attempt_expired");
      owned = a;
      purpose = a.purpose;
      if (body.error !== undefined) {
        if (
          body.error !== "user_cancelled_authorize" &&
          body.error !== "access_denied"
        )
          throw new AuthFailure("invalid_proof");
        if (!(await discard(a))) throw new AuthFailure("attempt_expired");
        res.append("Set-Cookie", cookie("", 0));
        res.redirect(
          303,
          `/?authResult=cancelled&authPurpose=${purpose}&authProvider=${owned.targetProvider}`,
        );
        return;
      }
      const proof: ProviderProof = {
        state,
        authorizationCode: requiredText(body.code, 4096),
      };
      if (provider === "apple") {
        proof.idToken = requiredText(body.id_token);
        if (body.user !== undefined) {
          const user = record(
            JSON.parse(requiredText(body.user, 2048)) as unknown,
          );
          if (user.name !== undefined) {
            const n = record(user.name);
            proof.name = { givenName: n.firstName, familyName: n.lastName };
          }
        }
      }
      const claimed = await attempts.claim(a);
      owned = claimed;
      const verified = await providers.verify(context(claimed), proof);
      const r = await attempts.accept(claimed, verified);
      if (r.signedIn) {
        signed(res, r.signedIn, "web");
        res.append("Set-Cookie", cookie("", 0));
        res.redirect(303, "/?authResult=signed_in");
      } else {
        res.append("Set-Cookie", cookie(`${a.id}.${binding.bindingSecret}`));
        res.redirect(303, `/?authAttempt=${a.id}`);
      }
    } catch (error) {
      if (owned && (await discard(owned)))
        res.append("Set-Cookie", cookie("", 0));
      const code = error instanceof AuthFailure ? error.code : "signin_failed";
      const email =
        code === "access_denied" && error instanceof AuthFailure
          ? error.email
          : undefined;
      res.redirect(
        303,
        `/?authError=${code}${email ? `&authEmail=${encodeURIComponent(email)}` : ""}&authPurpose=${purpose}${targetProvider ? `&authProvider=${targetProvider}` : ""}`,
      );
    }
  }
  router.get("/api/auth/google/callback", (req, res) =>
    callback(req, res, "google"),
  );
  return {
    router,
    appleCallback: (req: Request, res: Response) => callback(req, res, "apple"),
    admission,
  };
}
