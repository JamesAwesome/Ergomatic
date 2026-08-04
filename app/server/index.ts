import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApp } from "./app.js";
import { parseAllowlist } from "./auth/allowlist.js";
import { createGoogleProvider, type OAuthProvider } from "./auth/google.js";
import { createNativeVerifier } from "./auth/nativeVerify.js";
import { createSessionStore } from "./auth/sessions.js";
import { createUserStore } from "./auth/users.js";
import { createDb } from "./db/index.js";
import { checkDb } from "./db/pool.js";
import { seedGlobalLibrary } from "./seed/seed.js";
import { createBaselinesStore } from "./stores/baselines.js";
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
}).listen(port, () => {
  console.log(`ergomatic api listening on :${port}`);
});
