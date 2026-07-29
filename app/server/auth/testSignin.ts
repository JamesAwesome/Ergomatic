import { Router } from "express";
import { sessionCookie } from "./cookies.js";
import type { SessionStore } from "./sessions.js";
import type { UserStore } from "./users.js";

export interface TestSigninDeps {
  sessions: SessionStore;
  users: UserStore;
  testAuthSecret: string;
}

// Only ever mounted when AppDeps.testAuthSecret is non-null (see app.ts) —
// an e2e-only backdoor, never reachable when TEST_AUTH_SECRET is unset.
export function createTestSigninRouter({
  sessions,
  users,
  testAuthSecret,
}: TestSigninDeps): Router {
  const router = Router();

  router.post("/api/auth/test-signin", async (req, res) => {
    const body = (req.body ?? {}) as {
      secret?: unknown;
      email?: unknown;
      name?: unknown;
    };
    if (body.secret !== testAuthSecret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const email =
      typeof body.email === "string" && body.email !== ""
        ? body.email
        : "e2e@test.local";
    const name =
      typeof body.name === "string" && body.name !== ""
        ? body.name
        : "E2E Test User";
    // Namespaced sub keeps backdoor-created accounts distinguishable from
    // (and never colliding with) real Google-issued subs.
    const googleSub = `test:${email}`;

    let user = await users.findByGoogleSub(googleSub);
    if (!user) {
      user = await users.createUser({ googleSub, email, name });
    }

    await sessions.sweepExpired();
    const { token, expiresAt } = await sessions.createSession(user.id);
    res.setHeader("Set-Cookie", sessionCookie(token, expiresAt));
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  return router;
}
