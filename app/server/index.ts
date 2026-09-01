import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApp } from "./app.js";
import { parseAllowlist } from "./auth/allowlist.js";
import { createGoogleProvider, type OAuthProvider } from "./auth/google.js";
import { createNativeVerifier } from "./auth/nativeVerify.js";
import { createSessionStore } from "./auth/sessions.js";
import { createUserStore } from "./auth/users.js";
import { computeAvailable } from "./concept2/availability.js";
import { createC2Client } from "./concept2/client.js";
import { createDb } from "./db/index.js";
import { checkDb } from "./db/pool.js";
import { seedGlobalLibrary } from "./seed/seed.js";
import { createArticleReadsStore } from "./stores/articleReads.js";
import { createBaselinesStore } from "./stores/baselines.js";
import { createConcept2Store } from "./stores/concept2.js";
import { StoreConflictError } from "./stores/errors.js";
import { createLogsStore } from "./stores/logs.js";
import { createPlanStateStore } from "./stores/planState.js";
import { createPreferencesStore } from "./stores/preferences.js";
import { createTestHistoryStore } from "./stores/testHistory.js";
import { createWorkoutsStore } from "./stores/workouts.js";
import type { Stores } from "./routes/data.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const { pool, db } = createDb(connectionString);
// cwd-relative: app/ in dev, /app in the container
await migrate(db, { migrationsFolder: "drizzle" });
console.log("migrations up to date");

// Boot order: migrate() must run first (creates the workouts table this
// depends on); seedGlobalLibrary() must run before the app starts accepting
// traffic so the very first request ever served already sees the full
// global library. Idempotent — safe to run on every boot.
//
// seedGlobalLibrary's own check-then-reconcile isn't atomic across
// processes: if two replicas boot at once, both can observe the same
// mismatch and both attempt to reconcile it. It serialises them with a
// transaction-scoped advisory lock (see seed/seed.ts), so the loser sees the
// winner's already-reconciled rows and just no-ops. Until 2026-07-30 the two
// partial unique indexes on `num` did that job instead and the loser's insert
// failed with a unique violation surfaced as StoreConflictError; the catch
// below is kept as a belt-and-braces boot guard for exactly that shape of
// "someone else already seeded it" conflict. Any OTHER error (a real DB
// outage, a schema mismatch, etc.) still propagates and fails boot as before.
try {
  await seedGlobalLibrary(db);
  console.log("global starter library seeded (idempotent)");
} catch (err) {
  if (err instanceof StoreConflictError) {
    console.log(
      "global starter library already seeded by another booter (lost the boot race, continuing)",
    );
  } else {
    throw err;
  }
}

const siteUrl = process.env.SITE_URL ?? "http://localhost:5173";
const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

let oauth: OAuthProvider | null = null;
if (clientId && clientSecret) {
  oauth = await createGoogleProvider({
    clientId,
    clientSecret,
    redirectUri: new URL("/api/auth/callback", siteUrl).href,
  });
} else {
  console.warn(
    "WARNING: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not fully set — sign-in is DISABLED (auth routes will 503)",
  );
}
const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID ?? "";
const nativeVerifier = iosClientId ? createNativeVerifier(iosClientId) : null;
if (!nativeVerifier) {
  console.warn(
    "WARNING: GOOGLE_IOS_CLIENT_ID not set — native (iOS) sign-in is DISABLED",
  );
}

const allowlist = parseAllowlist(process.env.ALLOWED_EMAILS);
if (allowlist.size === 0) {
  console.warn(
    "WARNING: ALLOWED_EMAILS is empty — nobody can create an account",
  );
}

const testAuthSecret = process.env.TEST_AUTH_SECRET || null;
if (testAuthSecret) {
  console.warn(
    "WARNING: TEST_AUTH_SECRET set — test sign-in backdoor ACTIVE (never in production)",
  );
}

const stores: Stores = {
  baselines: createBaselinesStore(db),
  workouts: createWorkoutsStore(db),
  logs: createLogsStore(db),
  planState: createPlanStateStore(db),
  preferences: createPreferencesStore(db),
  testHistory: createTestHistoryStore(db),
  articleReads: createArticleReadsStore(db),
};

// Wave E PR1 Task 7 (task-7-brief.md): the concept2 broker is wired ALWAYS
// (never behind a runtime `if`) — `computeAvailable` gates BEHAVIOR (every
// concept2 route re-checks `available()`), never mounting. With
// `C2_LINK_ENABLED` unset in production: no new capability; `GET /api/logs`
// rows carry four always-null fields (`c2ResultId`, `c2UserId`,
// `completedAt`, `tz`); one new unauthenticated route
// (`GET /api/concept2/callback`) answers 403 dark rather than not existing —
// the spec's own "safe end state" (task-7-brief.md's "Produces" line).
const c2BaseUrl = process.env.C2_BASE_URL ?? "https://log-dev.concept2.com";
const c2ClientId = process.env.C2_CLIENT_ID ?? "";
const c2ClientSecret = process.env.C2_CLIENT_SECRET ?? "";
const c2LinkEnabled = process.env.C2_LINK_ENABLED;
const c2Available = computeAvailable(c2LinkEnabled, c2ClientId, c2ClientSecret);
if (c2LinkEnabled === "1" && !c2Available) {
  console.warn(
    "WARNING: C2_LINK_ENABLED=1 but C2_CLIENT_ID / C2_CLIENT_SECRET not fully set — Concept2 linking is DISABLED",
  );
} else if (c2LinkEnabled !== "1" && c2ClientId && c2ClientSecret) {
  console.warn(
    "WARNING: C2_CLIENT_ID / C2_CLIENT_SECRET are set but C2_LINK_ENABLED is not '1' — Concept2 linking stays DISABLED",
  );
}
// Google precedent (index.ts:69, above): the callback path is fixed and
// derived from the same siteUrl every other redirect uses.
const c2RedirectUri = new URL("/api/concept2/callback", siteUrl).href;
const concept2 = {
  available: () => c2Available,
  store: createConcept2Store(db),
  client: createC2Client({
    baseUrl: c2BaseUrl,
    clientId: c2ClientId,
    clientSecret: c2ClientSecret,
    redirectUri: c2RedirectUri,
  }),
};

const port = Number(process.env.PORT ?? 8080);
createApp({
  checkDb: () => checkDb(pool),
  sessions: createSessionStore(db),
  users: createUserStore(db),
  oauth,
  nativeVerifier,
  allowlist,
  siteUrl,
  stores,
  testAuthSecret,
  concept2,
}).listen(port, () => {
  console.log(`ergomatic api listening on :${port}`);
});
