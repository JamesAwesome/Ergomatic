import express from "express";
import { noStore, originCheck, requireUser } from "./auth/middleware.js";
import { createAuthRouter } from "./auth/routes.js";
import { createTestSigninRouter } from "./auth/testSignin.js";
import type { OAuthProvider } from "./auth/google.js";
import type { NativeTokenVerifier } from "./auth/nativeVerify.js";
import type { SessionStore } from "./auth/sessions.js";
import type { UserStore } from "./auth/users.js";
import { createDataRouter, type Stores } from "./routes/data.js";

export interface AppDeps {
  checkDb: () => Promise<boolean>;
  sessions: SessionStore;
  users: UserStore;
  oauth: OAuthProvider | null;
  nativeVerifier: NativeTokenVerifier | null;
  allowlist: Set<string>;
  siteUrl: string;
  // Backing stores for the per-user data API. Null in auth-only tests: the
  // data router is mounted only when present, so those tests stay untouched.
  stores: Stores | null;
  // E2E-only backdoor gate (see auth/testSignin.ts). Null everywhere except
  // when TEST_AUTH_SECRET is explicitly set (index.ts) — the route it guards
  // is absent entirely (404), not just secret-checked, when this is null.
  testAuthSecret: string | null;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.use(express.json());
  app.use("/api", noStore);
  app.use(originCheck(deps.siteUrl));

  app.get("/api/health", async (_req, res) => {
    let db: boolean;
    try {
      db = await deps.checkDb();
    } catch {
      db = false;
    }
    const version = process.env.APP_VERSION ?? "dev";
    if (db) {
      res.json({ ok: true, db: true, version });
    } else {
      res.status(503).json({ ok: false, db: false, version });
    }
  });

  app.use(createAuthRouter(deps));

  if (deps.testAuthSecret) {
    app.use(
      createTestSigninRouter({
        sessions: deps.sessions,
        users: deps.users,
        testAuthSecret: deps.testAuthSecret,
      }),
    );
  }

  if (deps.stores) {
    app.use(
      createDataRouter({
        stores: deps.stores,
        requireUser: requireUser(deps.sessions),
      }),
    );
  }

  return app;
}
