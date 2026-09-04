import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApp } from "./app.js";
import { parseAllowlist } from "./auth/allowlist.js";
import { createGoogleProvider, type OAuthProvider } from "./auth/google.js";
import { createNativeVerifier } from "./auth/nativeVerify.js";
import { createSessionStore } from "./auth/sessions.js";
import { createUserStore } from "./auth/users.js";
import { c2Gate } from "./concept2/availability.js";
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
// (never behind a runtime `if`) — the gate below governs BEHAVIOR (every
// concept2 route re-checks `available()` or `availableFor()`), never
// mounting. With
// `C2_LINK_ENABLED` unset in production: no new capability; `GET /api/logs`
// rows carry four always-null fields (`c2ResultId`, `c2UserId`,
// `completedAt`, `tz`); one new unauthenticated route
// (`GET /api/concept2/callback`) answers 403 dark rather than not existing —
// the spec's own "safe end state" (task-7-brief.md's "Produces" line).
// `||`, not `??` (Wave E PR2): `C2_BASE_URL=""` in a deploy env is a
// STRING and survives `??`, and an empty origin builds a RELATIVE
// View-on-Concept2 URL that opens on Ergomatic's own domain. Absent and
// empty are the same non-answer here, and both take the default.
const c2BaseUrl = process.env.C2_BASE_URL || "https://log-dev.concept2.com";
const c2ClientId = process.env.C2_CLIENT_ID ?? "";
const c2ClientSecret = process.env.C2_CLIENT_SECRET ?? "";
const c2LinkEnabled = process.env.C2_LINK_ENABLED;
// Wave E per-user gate: a SECOND, per-request check on top of the boot-time
// one, so the Concept2 surface can be live for one account (a real link, a
// real row, the logbook read back) while the rest of `ALLOWED_EMAILS` never
// meets it. Same primitive as the sign-in allowlist, deliberately — it is
// already tested, case-insensitive and comma-separated. Unset or empty
// means NOBODY.
//
// This file COMPOSES NOTHING (F1, fix round 1). It used to parse
// `C2_ALLOWED_EMAILS` into a `Set<string>` and build `availableFor` here,
// which put two identically-typed Sets in one scope: replacing the C2 one
// with the SIGN-IN one typechecked clean and left every test green while
// opening the Concept2 surface to every signed-in user. Nothing in this
// file can be tested (it opens a real Postgres at import time), so nothing
// could have caught it. `c2Gate` takes the raw strings and returns the
// finished gate, and what is left here is four env var names.
const c2 = c2Gate({
  linkEnabledFlag: c2LinkEnabled,
  clientId: c2ClientId,
  clientSecret: c2ClientSecret,
  allowedEmails: process.env.C2_ALLOWED_EMAILS,
});
for (const line of c2.bootLines) {
  if (line.level === "warn") console.warn(line.message);
  else console.log(line.message);
}
// Google precedent (index.ts:69, above): the WEB callback path is fixed and
// derived from the same siteUrl every other redirect uses. The NATIVE
// redirect is `routes/concept2.ts`'s `NATIVE_REDIRECT_URI` (PR1.75a §3);
// both must be registered at Concept2 (log-dev: done 2026-09-02; live
// portal: a cutover step beside write approval).
const c2WebRedirectUri = new URL("/api/concept2/callback", siteUrl).href;
const concept2 = {
  // SPREAD, never two named assignments (fix round 2). `available` and
  // `availableFor` are mutually assignable — TypeScript's parameter
  // bivariance lets a zero-arg function satisfy a one-arg type — so writing
  // `availableFor: c2.available` here typechecked clean and left all 1878
  // unit tests green while opening every gated route to every signed-in
  // user (measured before this line was a spread). Nothing in this file is
  // reachable from a test, so no gate could have gone red on it. Spreading
  // means this file never writes either name, and the swap has nowhere to
  // be written.
  ...c2.gate,
  store: createConcept2Store(db),
  client: createC2Client({
    baseUrl: c2BaseUrl,
    clientId: c2ClientId,
    clientSecret: c2ClientSecret,
  }),
  webRedirectUri: c2WebRedirectUri,
  // Wave E PR2: the SAME origin the client is configured against, echoed
  // to the app on `GET /api/concept2/link` so it can build the
  // View-on-Concept2 link-out without guessing which Concept2 this
  // deployment talks to.
  logbookBaseUrl: c2BaseUrl,
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
