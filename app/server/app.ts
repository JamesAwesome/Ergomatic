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
  // Series capture spec (2026-08-19), §3: POST /api/logs's own `series`
  // payload can run to ~720 KB worst case (14,400 samples, ruling 2) —
  // comfortably past body-parser's own 100 KB default, which every OTHER
  // route below keeps UNCHANGED (the antagonist's own probe: 2200 samples
  // -> 413 before this route-scoped middleware existed). Method+path
  // scoped (`app.post`, not `app.use`) so this ONLY ever widens the limit
  // for this one route — registered BEFORE the app-wide default so a
  // request TO this route hits the bigger-limit parser first. This is not
  // a double-parse: body-parser's own `read()` (`node_modules/body-parser/
  // lib/read.js`) skips re-reading a request whose stream is already
  // finished (`onFinished.isFinished(req)`), so the app-wide
  // `express.json()` below runs as a no-op pass-through for a body this
  // one already consumed — every other route is untouched, still gated at
  // the default 100 KB.
  app.post("/api/logs", express.json({ limit: "1mb" }));
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
