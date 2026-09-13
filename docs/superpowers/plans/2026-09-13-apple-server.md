# Apple Sign-in Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticate Apple and Google identities through one confirmed signup and two-proof linking flow while the legacy Google door stays compatible.

**Architecture:** Provider proof verification/exchange is independent of transactional account state. A bounded attempt store owns authority, exact-session binding and retained Apple grants; a small HTTP layer projects only continuation state and committed sessions. Boot composes these modules behind a disabled-by-default switch.

**Tech Stack:** Node 26, TypeScript, Express 5, `jose`, `openid-client`, Postgres 18 / Drizzle migrations, `express-rate-limit` 8.7.0, Vitest and Supertest.

**Spec:** `docs/superpowers/specs/2026-09-12-apple-signin-design.md` and `2026-09-12-apple-signin-review.md`. James approved the rendered design/spec and private relay through the controller. The shared wire authority is `2026-09-13-apple-auth-contract.md`; native and client plans consume it.

## Global Constraints

- `FRONT_DOOR_ENABLED` defaults false; only the literal `1` enables it. No public Apple/open-signup release until deletion is available.
- Identity is `(provider, verified subject)`. Never merge by email, replace an attached different subject, or overwrite account display profile during linking.
- Native Apple bridge receives nonce/state and returns ID token, authorization code, echoed state and optional bounded string name. Google new-flow native proof uses interactive `forcePrompt: true` and signed nonce.
- Apple ID tokens are RS256. Apple developer client secrets are ES256. Exact configured native/web audiences are different; request input never chooses a client ID.
- Authorization, each link-proof stage and confirmation expire in five minutes; existing-provider proof must remain within five minutes at finalization.
- Attempts hold pending credentials only; identity/access tokens are transient. Committed grants retain refresh token and configured client ID under `(user_id,client_id)`.
- Anonymous admission is 120 starts/minute per service and 512 resident anonymous attempts across processes. One link attempt per original session. Sweep startup and every 60 seconds; failed cleanup denies new anonymous starts until a successful sweep.
- Apple web is registered HTTPS `form_post`: only its exact callback receives the bounded flat parser before origin middleware. Ordinary session cookie remains Lax; separate attempt cookie is HttpOnly, Secure, SameSite=None.
- Cross-site callback can stage linking proof only. The same-origin finalization POST must present the current resolved session whose exact ID equals the original live session.
- Callback failure/cancellation cleanup uses `Attempts.discard(expected)` and clears cookies only when the exact snapshot was erased. After a successful exchange claim, cleanup owns that claimed snapshot. Explicit holder cancel remains operation-wide.
- All implementation and mutation work stays in isolated worktrees. No device install/launch, live provider credentials, merge or push is prescribed here.

## Candidate and provenance

The executable blocks below are the exact committed candidate at `259882ba1087b6ad853159b19799b2358fbf3905` in `.claude/worktrees/wave-a-apple-server-paste`, based on `3cf849c7`. They are unified patches grouped by independently reviewable responsibility, including complete new test bodies. The candidate itself is retained for adoption after hardening; do not reimplement it from a prose outline. Later parent changes to deployment docs, native bridge and UI are separate ownership.

Measured commands, failure/restore logs, coverage HTML extraction and the requirement-to-test matrix live in `apple-server-evidence/report.md`. The DBA owns query/migration scale measurements and its deadlock receipt. This plan does not promote passing fake-provider tests into real Apple credential or native/web subject-continuity evidence.

Baseline evidence read in this session: `app/server/auth/cookies.ts:20–28` selects HttpOnly/Lax for ordinary session cookies; `app/server/auth/sessions.ts:69–70` deletes the session row at signout. New exact-session projection is therefore internal middleware state, not a client-facing field. `server/app.ts`'s parser→origin→auth-router ordering is changed only for the exact Apple callback in Task 3. The original `createAuthRouter` native route returns token/expiresAt/user; Task 3 adapts the new committed-session result back to that response. No auth type or implementation is added to `app/domain/`.

PRIMARY research read this session: [Apple discovery](https://appleid.apple.com/.well-known/openid-configuration) lists RS256, form_post and no PKCE contract; [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) documents nonce/state and code exchange; [express-rate-limit configuration](https://express-rate-limit.mintlify.app/reference/configuration) documents global key and fail-closed behavior. `npm view express-rate-limit version` returned 8.7.0 immediately before installation. The Google web verifier is derived from the undisclosed random binding hash plus per-stage nonce, then S256-challenged; this is an implementation inference retaining entropy and stage separation without an extra stored secret field. Apple does not receive PKCE parameters.

## Lifetime table

| State | Mint / owner | Clear / authority end | Reload, teardown and concurrency invariant |
|---|---|---|---|
| Attempt ID, binding hash, immutable surface/purpose/provider intent | `Attempts.begin` | Consume, explicit bound cancel, expired-row sweep | A mismatched binding/intent/stage/version changes no authority; expiry rejects before sweep |
| State / nonce / positive version | Initial authorize and each accepted existing-provider proof; version increments on each transition | Terminal consume/cancel/expiry | One exchange claim per authorization stage; callbacks cannot consume a later stage |
| Original session ID | Link begin from resolved current session | Session delete cascades attempt; link consume/cancel/expiry | Session lock precedes attempt lock for all transitions, matching replacement and signout/cascade |
| Reauthenticated timestamp | Verified existing-provider subject resolves to original user | Link completion/cancel/expiry, five-minute freshness ceiling | Target stage always has fresh nonce/state; finalization checks freshness independently of row expiry |
| Pending profile / Apple client and refresh credential | Successful provider exchange outside transaction, then conditional claimed-operation advance | Create/link/returning signin moves grant atomically; cancel/expiry erases | No app session exists during `confirm`; canceled/deleted attempts are never resurrected |
| Ergomatic session plaintext token | Completion transaction, hash persisted | Local/session signout policy remains existing behavior | Native receives token only after commit; web receives HttpOnly cookie and credential-free JSON |
| Apple grant | Same account creation/link/returning signin transaction | Following account deletion/revocation slice | One user/client row, subject only on owning user; survives ordinary signout |
| Cleanup health flag and timer | `createFrontDoor` awaits startup sweep, starts 60-second interval | `close()` on SIGINT/SIGTERM | Failed sweep denies anonymous begin; next successful sweep restores readiness; no stopped-server deletion claim |

## Applying and reviewing the tested code

The preferred execution is to adopt the retained candidate commits after the two hardening lenses accept it, then run the combined native/client/server gates. The complete patches below also permit reproduction from `3cf849c7`. For each task, install its test files first, run the named command to observe missing behavior, then apply its implementation and rerun. New provider/store test suites were initially exercised without their modules; later coverage-only tests exercise already-written candidate behavior and carry deciding-source self-mutations instead of a fabricated failing-first claim. The lock-order regression specifically ran red against the old committed implementation before the correction.

`apple-server-evidence/paste_check.py` verifies and round-trips the exact patch blocks through their real paths in the already-committed scratch worktree, then verifies source equality with HEAD. Only a clean, exclusively owned scratch tree may be used. `apple-server-evidence/mutations.py` snapshots committed bytes, checks each source anchor, demands assertion failures, and restores in `finally`; it refuses uncommitted source. All listed mutation instructions were executed by the author and their actual results are in the report.

### Task 1: Provider proofs and shared wire contract

**Files:** `app/shared/auth.ts`, `app/server/auth/frontDoorErrors.ts`, `app/server/auth/providers.ts`, `app/server/auth/providers.test.ts`, `app/tsconfig.app.json`, `app/tsconfig.server.json`, `app/package.json`, `app/pnpm-lock.yaml`.

**Interfaces:** Consumes `ProviderConfig`, `ProviderContext`, `ProviderProof`; produces `createProviders(config,hooks?)`, `Providers.verify(context,proof): Promise<VerifiedIdentity>`, `Providers.authorizationUrl(context): Promise<string>`, and the exact shared `AuthStep`, `AuthOptions`, `AuthMethods`, `NativeProof` projections. No provider token enters the shared response types.

- [ ] **Step 1: Install the complete test-file changes from this task's patch and run `pnpm test --project unit server/auth/providers.test.ts`.** For reproduction from the baseline, test-file imports fail until the prescribed implementation exists. Do not treat a module-load failure as behavioral mutation evidence.
- [ ] **Step 2: Apply the complete implementation changes below to their named paths.** The generated migration journal, snapshot and SQL travel together. Before adoption, inspect competing migration indexes; regenerate from the merged base if another branch has occupied 0031. Never rewrite a migration already shipped to production.
- [ ] **Step 3: Run `pnpm test --project unit server/auth/providers.test.ts` against the exact implementation, then `pnpm typecheck`, `pnpm lint` and `pnpm format:check`.** Read actual output rather than copying an expected count.
- [ ] **Step 4: Run this task's deciding-source cases in `apple-server-evidence/mutations.py`, restore committed bytes, and rerun the covering suite.** The mutation report identifies each source/command/failed assertion summary.
- [ ] **Step 5: Commit the independently reviewable responsibility, verifying `git rev-parse --show-toplevel` and actual hook output.** The retained candidate already has these changes; adopting it avoids a transcription commit.

<!-- candidate-patch:1 -->
```diff
diff --git a/app/package.json b/app/package.json
index 690cd22f..bc01ecfe 100644
--- a/app/package.json
+++ b/app/package.json
@@ -38,8 +38,8 @@
     "@capacitor/app": "^8.1.1",
     "@capacitor/core": "^8.5.1",
     "@capacitor/haptics": "8.0.2",
-    "@capgo/capacitor-nfc": "8.2.5",
     "@capacitor/keyboard": "^8.0.5",
+    "@capgo/capacitor-nfc": "8.2.5",
     "@capgo/capacitor-social-login": "^8.5.5",
     "@fontsource/archivo": "5.3.0",
     "@fontsource/ibm-plex-mono": "5.3.0",
@@ -47,6 +47,7 @@
     "cookie": "^2.0.1",
     "drizzle-orm": "^0.45.2",
     "express": "^5.2.1",
+    "express-rate-limit": "8.7.0",
     "jose": "^6.2.11",
     "openid-client": "^6.8.7",
     "pg": "^8.23.0",
diff --git a/app/pnpm-lock.yaml b/app/pnpm-lock.yaml
index 85a7f56d..09b5c62b 100644
--- a/app/pnpm-lock.yaml
+++ b/app/pnpm-lock.yaml
@@ -56,6 +56,9 @@ importers:
       express:
         specifier: ^5.2.1
         version: 5.2.1(supports-color@7.2.0)
+      express-rate-limit:
+        specifier: 8.7.0
+        version: 8.7.0(express@5.2.1(supports-color@7.2.0))(supports-color@7.2.0)
       jose:
         specifier: ^6.2.11
         version: 6.2.12
@@ -2527,6 +2530,12 @@ packages:
     resolution: {integrity: sha512-KfYbmpRm0VbLjEvVa9yGwCi9GI34xvi7A/HXYWQO65CSD2u3MczUJSuwXKFIxlGsgBQizV9q5J9NHj4VG0n+pA==}
     engines: {node: '>=12.0.0'}
 
+  express-rate-limit@8.7.0:
+    resolution: {integrity: sha512-hOwV7WOxXfjRpAM1DSJWZDXx3GhplwD8IfwuwvogD8i1Qnkgosw/H45s4ZnFAUHDAhPjlY9hLBvJhKmGMyY26g==}
+    engines: {node: '>= 16'}
+    peerDependencies:
+      express: '>= 4.11'
+
   express@5.2.1:
     resolution: {integrity: sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==}
     engines: {node: '>= 18'}
@@ -2766,6 +2775,10 @@ packages:
     resolution: {integrity: sha512-X7rqawQBvfdjS10YU1y1YVreA3SsLrW9dX2CewP2EbBJM4ypVNLDkO5y04gejPwKIY9lR+7r9gn3rFPt/kmWFg==}
     engines: {node: ^14.17.0 || ^16.13.0 || >=18.0.0}
 
+  ip-address@10.7.0:
+    resolution: {integrity: sha512-BGFsyJd5mpXp3rK6jIdADLNgpJUK1jnjzvYF8lK+VyDab9JAmqN0YOKDdP17HlgKb2+ehPgDc8EtnRLbGCAMhA==}
+    engines: {node: '>= 12'}
+
   ipaddr.js@1.9.1:
     resolution: {integrity: sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==}
     engines: {node: '>= 0.10'}
@@ -6277,6 +6290,14 @@ snapshots:
 
   expect-type@1.4.0: {}
 
+  express-rate-limit@8.7.0(express@5.2.1(supports-color@7.2.0))(supports-color@7.2.0):
+    dependencies:
+      debug: 4.4.3(supports-color@7.2.0)
+      express: 5.2.1(supports-color@7.2.0)
+      ip-address: 10.7.0
+    transitivePeerDependencies:
+      - supports-color
+
   express@5.2.1(supports-color@7.2.0):
     dependencies:
       accepts: 2.0.0
@@ -6540,6 +6561,8 @@ snapshots:
 
   ini@4.1.3: {}
 
+  ip-address@10.7.0: {}
+
   ipaddr.js@1.9.1: {}
 
   is-docker@2.2.1: {}
diff --git a/app/server/auth/frontDoorErrors.ts b/app/server/auth/frontDoorErrors.ts
new file mode 100644
index 00000000..d2478cca
--- /dev/null
+++ b/app/server/auth/frontDoorErrors.ts
@@ -0,0 +1,27 @@
+import type { AuthErrorCode } from "../../shared/auth.js";
+export class AuthFailure extends Error {
+  constructor(public readonly code: AuthErrorCode) {
+    super(code);
+  }
+}
+export const authStatus: Record<AuthErrorCode, number> = {
+  invalid_request: 400,
+  invalid_proof: 401,
+  attempt_expired: 410,
+  account_changed: 409,
+  account_conflict: 409,
+  email_required: 422,
+  unavailable: 503,
+  rate_limited: 429,
+  signin_failed: 500,
+};
+export function requiredText(value: unknown, max = 16384): string {
+  if (typeof value !== "string" || !value.trim() || value.length > max)
+    throw new AuthFailure("invalid_request");
+  return value;
+}
+export function record(value: unknown): Record<string, unknown> {
+  if (value === null || typeof value !== "object" || Array.isArray(value))
+    throw new AuthFailure("invalid_request");
+  return value as Record<string, unknown>;
+}
diff --git a/app/server/auth/providers.test.ts b/app/server/auth/providers.test.ts
new file mode 100644
index 00000000..b9dc9f16
--- /dev/null
+++ b/app/server/auth/providers.test.ts
@@ -0,0 +1,189 @@
+import { beforeAll, describe, expect, it } from "vitest";
+import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
+import { createProviders } from "./providers.js";
+
+describe("signed provider proof", () => {
+  let rsa: Awaited<ReturnType<typeof generateKeyPair>>;
+  let ec: Awaited<ReturnType<typeof generateKeyPair>>;
+  beforeAll(async () => {
+    rsa = await generateKeyPair("RS256");
+    ec = await generateKeyPair("ES256");
+  });
+  async function token(claims: Record<string, unknown> = {}) {
+    return new SignJWT({
+      sub: "apple-sub",
+      email: "private@privaterelay.appleid.com",
+      email_verified: "true",
+      nonce: "bound-nonce",
+      ...claims,
+    })
+      .setProtectedHeader({ alg: "RS256", kid: "test" })
+      .setIssuer("https://appleid.apple.com")
+      .setAudience("native.app")
+      .setIssuedAt()
+      .setExpirationTime("5m")
+      .sign(rsa.privateKey);
+  }
+  async function provider(exchangeClaims: Record<string, unknown> = {}) {
+    const jwk = await exportJWK(rsa.publicKey);
+    const exchangeToken = await token(exchangeClaims);
+    return createProviders(
+      {
+        apple: {
+          nativeClientId: "native.app",
+          webClientId: "web.app",
+          teamId: "TEAM",
+          keyId: "KEY",
+          key: ec.privateKey,
+        },
+        google: {
+          nativeClientId: "google.native",
+          webClientId: "google.web",
+          clientSecret: "secret",
+        },
+        siteUrl: "https://erg.test",
+      },
+      {
+        appleKeys: createLocalJWKSet({
+          keys: [{ ...jwk, kid: "test", alg: "RS256" }],
+        }),
+        fetch: async () =>
+          Response.json({
+            id_token: exchangeToken,
+            refresh_token: "retained-only-server",
+          }),
+      },
+    );
+  }
+  it("verifies signed native identity and exchanged subject, retaining only refresh grant", async () => {
+    const p = await provider();
+    expect(
+      await p.verify(
+        {
+          provider: "apple",
+          surface: "native",
+          nonce: "bound-nonce",
+          state: "bound-state",
+          bindingHash: "hash",
+        },
+        {
+          idToken: await token(),
+          authorizationCode: "code",
+          state: "bound-state",
+        },
+      ),
+    ).toStrictEqual({
+      sub: "apple-sub",
+      email: "private@privaterelay.appleid.com",
+      emailVerified: true,
+      name: "Rower",
+      grant: { clientId: "native.app", refreshToken: "retained-only-server" },
+    });
+  });
+  it.each(["nonce", "aud", "iss", "exp"])(
+    "rejects wrong signed %s",
+    async (field) => {
+      const p = await provider();
+      const claims = { [field]: field === "exp" ? 1 : "wrong" };
+      // Explicit setters in token() own issuer/audience/expiry; forge those after constructing claims.
+      const forged = await new SignJWT({
+        sub: "apple-sub",
+        nonce: "bound-nonce",
+        iss: "https://appleid.apple.com",
+        aud: "native.app",
+        exp: Math.floor(Date.now() / 1000) + 300,
+        ...claims,
+      })
+        .setProtectedHeader({ alg: "RS256", kid: "test" })
+        .sign(rsa.privateKey);
+      await expect(
+        p.verify(
+          {
+            provider: "apple",
+            surface: "native",
+            nonce: "bound-nonce",
+            state: "bound-state",
+            bindingHash: "hash",
+          },
+          { idToken: forged, authorizationCode: "code", state: "bound-state" },
+        ),
+      ).rejects.toThrow("invalid_proof");
+    },
+  );
+  it("rejects a correctly shaped token signed by an untrusted key", async () => {
+    const p = await provider();
+    const attacker = await generateKeyPair("RS256");
+    const forged = await new SignJWT({ sub: "apple-sub", nonce: "bound-nonce" })
+      .setIssuer("https://appleid.apple.com")
+      .setAudience("native.app")
+      .setIssuedAt()
+      .setExpirationTime("5m")
+      .setProtectedHeader({ alg: "RS256", kid: "test" })
+      .sign(attacker.privateKey);
+    await expect(
+      p.verify(
+        {
+          provider: "apple",
+          surface: "native",
+          nonce: "bound-nonce",
+          state: "bound-state",
+          bindingHash: "hash",
+        },
+        { idToken: forged, authorizationCode: "code", state: "bound-state" },
+      ),
+    ).rejects.toThrow("invalid_proof");
+  });
+  it("rejects exchanged subject mismatch", async () => {
+    const p = await provider({ sub: "another" });
+    await expect(
+      p.verify(
+        {
+          provider: "apple",
+          surface: "native",
+          nonce: "bound-nonce",
+          state: "bound-state",
+          bindingHash: "hash",
+        },
+        {
+          idToken: await token(),
+          authorizationCode: "code",
+          state: "bound-state",
+        },
+      ),
+    ).rejects.toThrow("invalid_proof");
+  });
+  it("rejects wrong state before exchange", async () => {
+    const p = await provider();
+    await expect(
+      p.verify(
+        {
+          provider: "apple",
+          surface: "native",
+          nonce: "bound-nonce",
+          state: "bound-state",
+          bindingHash: "hash",
+        },
+        { idToken: await token(), authorizationCode: "code", state: "wrong" },
+      ),
+    ).rejects.toThrow("invalid_proof");
+  });
+  it("requests Apple form_post without PKCE and Google nonce with PKCE", async () => {
+    const p = await provider();
+    const base = {
+      surface: "web" as const,
+      nonce: "n",
+      state: "s",
+      bindingHash: "h",
+    };
+    const apple = new URL(
+      await p.authorizationUrl({ ...base, provider: "apple" }),
+    );
+    const google = new URL(
+      await p.authorizationUrl({ ...base, provider: "google" }),
+    );
+    expect(apple.searchParams.get("response_mode")).toBe("form_post");
+    expect(apple.searchParams.has("code_challenge")).toBe(false);
+    expect(google.searchParams.get("nonce")).toBe("n");
+    expect(google.searchParams.get("code_challenge_method")).toBe("S256");
+  });
+});
diff --git a/app/server/auth/providers.ts b/app/server/auth/providers.ts
new file mode 100644
index 00000000..4ff1ce87
--- /dev/null
+++ b/app/server/auth/providers.ts
@@ -0,0 +1,226 @@
+import { createHash } from "node:crypto";
+import {
+  createRemoteJWKSet,
+  jwtVerify,
+  SignJWT,
+  type JWTVerifyGetKey,
+  type JWTPayload,
+} from "jose";
+import * as oidc from "openid-client";
+import type { AuthProvider } from "../../shared/auth.js";
+import { AuthFailure, record, requiredText } from "./frontDoorErrors.js";
+
+export interface ProviderContext {
+  provider: AuthProvider;
+  surface: "native" | "web";
+  nonce: string;
+  state: string;
+  bindingHash: string;
+}
+export interface ProviderProof {
+  state: string;
+  idToken?: string;
+  authorizationCode?: string;
+  name?: unknown;
+}
+export interface VerifiedIdentity {
+  sub: string;
+  email: string;
+  emailVerified: boolean;
+  name: string;
+  grant?: { clientId: string; refreshToken: string };
+}
+export interface ProviderConfig {
+  siteUrl: string;
+  apple: {
+    nativeClientId: string;
+    webClientId: string;
+    teamId: string;
+    keyId: string;
+    key: CryptoKey;
+  };
+  google: { nativeClientId: string; webClientId: string; clientSecret: string };
+}
+export function createProviders(
+  config: ProviderConfig,
+  hooks: {
+    appleKeys?: JWTVerifyGetKey;
+    googleKeys?: JWTVerifyGetKey;
+    fetch?: typeof fetch;
+  } = {},
+) {
+  const fetcher = hooks.fetch ?? fetch;
+  const keys = {
+    apple:
+      hooks.appleKeys ??
+      createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys")),
+    google:
+      hooks.googleKeys ??
+      createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")),
+  };
+  function clientId(c: ProviderContext) {
+    return config[c.provider][
+      c.surface === "native" ? "nativeClientId" : "webClientId"
+    ];
+  }
+  function redirect(c: ProviderContext) {
+    return new URL(`/api/auth/${c.provider}/callback`, config.siteUrl).href;
+  }
+  // A per-stage verifier derived from the undisclosed binding hash; nonce rotates
+  // for each proof. No extra stored credential or PKCE requirement for Apple.
+  function verifier(c: ProviderContext) {
+    return createHash("sha256")
+      .update(`${c.bindingHash}:${c.nonce}`)
+      .digest("base64url");
+  }
+  async function claims(
+    token: string,
+    c: ProviderContext,
+  ): Promise<JWTPayload> {
+    const { payload } = await jwtVerify(token, keys[c.provider], {
+      issuer:
+        c.provider === "apple"
+          ? "https://appleid.apple.com"
+          : ["https://accounts.google.com", "accounts.google.com"],
+      audience: clientId(c),
+      algorithms: ["RS256"],
+      requiredClaims: ["sub", "exp", "nonce"],
+    });
+    if (payload.nonce !== c.nonce || payload.aud !== clientId(c))
+      throw new AuthFailure("invalid_proof");
+    requiredText(payload.sub, 255);
+    return payload;
+  }
+  function profile(p: JWTPayload, name: unknown): VerifiedIdentity {
+    let display =
+      typeof name === "string"
+        ? name.trim()
+        : typeof p.name === "string"
+          ? p.name.trim()
+          : "";
+    if (!display && name && typeof name === "object" && !Array.isArray(name)) {
+      const n = record(name);
+      display = [n.givenName, n.familyName]
+        .filter((v): v is string => typeof v === "string")
+        .join(" ")
+        .trim();
+    }
+    const email = typeof p.email === "string" ? p.email.trim() : "";
+    if (email.length > 320 || display.length > 200)
+      throw new AuthFailure("invalid_proof");
+    return {
+      sub: requiredText(p.sub, 255),
+      email,
+      emailVerified: p.email_verified === true || p.email_verified === "true",
+      name: display || "Rower",
+    };
+  }
+  return {
+    available(provider: AuthProvider, surface: "native" | "web") {
+      if (
+        provider === "google" &&
+        surface === "web" &&
+        !config.google.clientSecret
+      )
+        return false;
+      return Boolean(
+        config[provider][
+          surface === "native" ? "nativeClientId" : "webClientId"
+        ],
+      );
+    },
+    async authorizationUrl(c: ProviderContext): Promise<string> {
+      const apple = c.provider === "apple";
+      const metadata = {
+        issuer: apple
+          ? "https://appleid.apple.com"
+          : "https://accounts.google.com",
+        authorization_endpoint: apple
+          ? "https://appleid.apple.com/auth/authorize"
+          : "https://accounts.google.com/o/oauth2/v2/auth",
+      };
+      const client = new oidc.Configuration(metadata, clientId(c));
+      const params: Record<string, string> = {
+        redirect_uri: redirect(c),
+        scope: apple ? "openid email name" : "openid email profile",
+        response_type: apple ? "code id_token" : "code",
+        state: c.state,
+        nonce: c.nonce,
+      };
+      if (apple) params.response_mode = "form_post";
+      else {
+        params.code_challenge = await oidc.calculatePKCECodeChallenge(
+          verifier(c),
+        );
+        params.code_challenge_method = "S256";
+        params.prompt = "select_account";
+      }
+      return oidc.buildAuthorizationUrl(client, params).href;
+    },
+    async verify(
+      c: ProviderContext,
+      proof: ProviderProof,
+    ): Promise<VerifiedIdentity> {
+      try {
+        if (proof.state !== c.state || !proof.state || !c.nonce || !clientId(c))
+          throw new AuthFailure("invalid_proof");
+        if (c.provider === "google" && c.surface === "native")
+          return profile(
+            await claims(requiredText(proof.idToken), c),
+            undefined,
+          );
+        const initial =
+          c.provider === "apple"
+            ? await claims(requiredText(proof.idToken), c)
+            : undefined;
+        const code = requiredText(proof.authorizationCode, 4096);
+        let secret = config.google.clientSecret;
+        if (c.provider === "apple")
+          secret = await new SignJWT({})
+            .setProtectedHeader({ alg: "ES256", kid: config.apple.keyId })
+            .setIssuer(config.apple.teamId)
+            .setSubject(clientId(c))
+            .setAudience("https://appleid.apple.com")
+            .setIssuedAt()
+            .setExpirationTime("5m")
+            .sign(config.apple.key);
+        const body = new URLSearchParams({
+          grant_type: "authorization_code",
+          code,
+          client_id: clientId(c),
+          client_secret: secret,
+        });
+        if (c.surface === "web") body.set("redirect_uri", redirect(c));
+        if (c.provider === "google") body.set("code_verifier", verifier(c));
+        const response = await fetcher(
+          c.provider === "apple"
+            ? "https://appleid.apple.com/auth/token"
+            : "https://oauth2.googleapis.com/token",
+          {
+            method: "POST",
+            body,
+            signal: AbortSignal.timeout(10000),
+            redirect: "error",
+          },
+        );
+        if (!response.ok) throw new AuthFailure("invalid_proof");
+        const raw = await response.text();
+        if (raw.length > 65536) throw new AuthFailure("invalid_proof");
+        const result = record(JSON.parse(raw) as unknown);
+        const exchanged = await claims(requiredText(result.id_token), c);
+        if (initial && exchanged.sub !== initial.sub)
+          throw new AuthFailure("invalid_proof");
+        const verified = profile(exchanged, proof.name);
+        if (c.provider === "apple")
+          verified.grant = {
+            clientId: clientId(c),
+            refreshToken: requiredText(result.refresh_token, 8192),
+          };
+        return verified;
+      } catch {
+        throw new AuthFailure("invalid_proof");
+      }
+    },
+  };
+}
+export type Providers = ReturnType<typeof createProviders>;
diff --git a/app/shared/auth.ts b/app/shared/auth.ts
new file mode 100644
index 00000000..f90d2bd7
--- /dev/null
+++ b/app/shared/auth.ts
@@ -0,0 +1,68 @@
+export type AuthProvider = "apple" | "google";
+export type AuthPurpose = "signin" | "link";
+export interface AuthUser {
+  id: string;
+  email: string;
+  name: string;
+}
+export interface AuthOptions {
+  frontDoorEnabled: boolean;
+  apple: { native: boolean; web: boolean };
+  google: { native: boolean; web: boolean };
+}
+export interface AttemptView {
+  attemptId: string;
+  purpose: AuthPurpose;
+  targetProvider: AuthProvider;
+  expiresAt: string;
+}
+export type AuthStep =
+  | (AttemptView & {
+      outcome: "authorize";
+      provider: AuthProvider;
+      stage: "signin" | "reauth" | "target";
+      nonce: string;
+      state: string;
+      authorizationUrl?: string;
+    })
+  | (AttemptView & {
+      outcome: "confirm";
+      profile: { email: string; name: string };
+    })
+  | (AttemptView & { outcome: "link_ready" })
+  | SignedIn;
+export type NativeBegin = AuthStep & { bindingSecret: string };
+export interface SignedIn {
+  outcome: "signed_in";
+  user: AuthUser;
+  expiresAt: string;
+  token?: string;
+}
+export type AuthErrorCode =
+  | "invalid_request"
+  | "invalid_proof"
+  | "attempt_expired"
+  | "account_changed"
+  | "account_conflict"
+  | "email_required"
+  | "unavailable"
+  | "rate_limited"
+  | "signin_failed";
+export interface AuthError {
+  error: AuthErrorCode;
+}
+export interface NativeProof {
+  bindingSecret: string;
+  state: string;
+  idToken: string;
+  authorizationCode?: string;
+  name?: string;
+}
+export type BeginAuth =
+  | { purpose: "signin"; provider: AuthProvider }
+  | { purpose: "link"; provider: AuthProvider };
+
+export interface AuthMethods {
+  apple: boolean;
+  google: boolean;
+}
diff --git a/app/tsconfig.app.json b/app/tsconfig.app.json
index 590964ca..66ea9e3d 100644
--- a/app/tsconfig.app.json
+++ b/app/tsconfig.app.json
@@ -20,5 +20,5 @@
     "noUncheckedSideEffectImports": true,
     "types": ["vitest/globals", "@testing-library/jest-dom"]
   },
-  "include": ["src", "domain", "scripts"]
+  "include": ["shared", "src", "domain", "scripts"]
 }
diff --git a/app/tsconfig.server.json b/app/tsconfig.server.json
index b0ff2801..e18114be 100644
--- a/app/tsconfig.server.json
+++ b/app/tsconfig.server.json
@@ -29,5 +29,5 @@
     "verbatimModuleSyntax": true,
     "types": ["node"]
   },
-  "include": ["server", "domain", "src/vite-env.d.ts"]
+  "include": ["shared", "server", "domain", "src/vite-env.d.ts"]
 }
```

### Task 2: Transactional attempts, identities, grants and exact sessions

**Files:** `app/server/db/schema.ts`, `app/drizzle/0031_apple_front_door.sql`, `app/drizzle/meta/0031_snapshot.json`, `app/drizzle/meta/_journal.json`, `app/server/auth/attempts.ts`, `app/server/auth/attempts.integration.test.ts`, `app/server/auth/sessions.ts`, `app/server/auth/middleware.ts`, `app/server/auth/native.test.ts`, `app/server/auth/routes.test.ts`, `app/server/auth/testSignin.test.ts`.

**Interfaces:** Consumes verified provider results only after exchange has finished. Produces `createAttempts(pool): Attempts`, `Attempt`, `AttemptResult`, and `ResolvedSession.sessionId` / `Request.sessionId`. `Attempts.begin/read/claim/accept/confirm/finalize/discard/cancel/methods/sweep/legacyGoogle` signatures are in the complete implementation below. The original user is derived from the exact original live session; no user ID is duplicated in attempts.

- [ ] **Step 1: Install the complete test-file changes from this task's patch and run `pnpm test --project integration server/auth/attempts.integration.test.ts`.** For reproduction from the baseline, test-file imports fail until the prescribed implementation exists. Do not treat a module-load failure as behavioral mutation evidence.
- [ ] **Step 2: Apply the complete implementation changes below to their named paths.** The generated migration journal, snapshot and SQL travel together. Before adoption, inspect competing migration indexes; regenerate from the merged base if another branch has occupied 0031. Never rewrite a migration already shipped to production.
- [ ] **Step 3: Run `pnpm test --project integration server/auth/attempts.integration.test.ts` against the exact implementation, then `pnpm typecheck`, `pnpm lint` and `pnpm format:check`.** Read actual output rather than copying an expected count.
- [ ] **Step 4: Run this task's deciding-source cases in `apple-server-evidence/mutations.py`, restore committed bytes, and rerun the covering suite.** The mutation report identifies each source/command/failed assertion summary.
- [ ] **Step 5: Commit the independently reviewable responsibility, verifying `git rev-parse --show-toplevel` and actual hook output.** The retained candidate already has these changes; adopting it avoids a transcription commit.

<!-- candidate-patch:2 -->
```diff
diff --git a/app/drizzle/0031_apple_front_door.sql b/app/drizzle/0031_apple_front_door.sql
new file mode 100644
index 00000000..41149e6a
--- /dev/null
+++ b/app/drizzle/0031_apple_front_door.sql
@@ -0,0 +1,44 @@
+CREATE TABLE "apple_grants" (
+	"user_id" uuid NOT NULL,
+	"client_id" text NOT NULL,
+	"refresh_token" text NOT NULL,
+	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "apple_grants_pkey" PRIMARY KEY("user_id","client_id")
+);
+--> statement-breakpoint
+CREATE TABLE "auth_attempts" (
+	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+	"binding_hash" text NOT NULL,
+	"surface" text NOT NULL,
+	"purpose" text NOT NULL,
+	"target_provider" text NOT NULL,
+	"existing_provider" text,
+	"stage" text NOT NULL,
+	"version" integer NOT NULL,
+	"state" text NOT NULL,
+	"nonce" text NOT NULL,
+	"original_session_id" uuid,
+	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
+	"expires_at" timestamp with time zone NOT NULL,
+	"reauthenticated_at" timestamp with time zone,
+	"verified_subject" text,
+	"verified_email" text,
+	"verified_name" text,
+	"apple_client_id" text,
+	"apple_refresh_token" text,
+	CONSTRAINT "auth_attempts_state_unique" UNIQUE("state"),
+	CONSTRAINT "auth_attempts_surface_check" CHECK ("auth_attempts"."surface" in ('native','web')),
+	CONSTRAINT "auth_attempts_purpose_check" CHECK ("auth_attempts"."purpose" in ('signin','link')),
+	CONSTRAINT "auth_attempts_provider_check" CHECK ("auth_attempts"."target_provider" in ('apple','google') and ("auth_attempts"."existing_provider" is null or "auth_attempts"."existing_provider" in ('apple','google'))),
+	CONSTRAINT "auth_attempts_stage_check" CHECK ("auth_attempts"."stage" in ('authorize','exchanging','confirm','reauth_authorize','reauth_exchanging','target_authorize','target_exchanging','link_ready')),
+	CONSTRAINT "auth_attempts_session_check" CHECK (("auth_attempts"."purpose"='signin' and "auth_attempts"."original_session_id" is null and "auth_attempts"."existing_provider" is null) or ("auth_attempts"."purpose"='link' and "auth_attempts"."original_session_id" is not null and "auth_attempts"."existing_provider" is not null and "auth_attempts"."existing_provider"<>"auth_attempts"."target_provider")),
+	CONSTRAINT "auth_attempts_expiry_check" CHECK ("auth_attempts"."expires_at">"auth_attempts"."created_at"),
+	CONSTRAINT "auth_attempts_version_check" CHECK ("auth_attempts"."version">0)
+);
+--> statement-breakpoint
+ALTER TABLE "users" ADD COLUMN "apple_sub" text;--> statement-breakpoint
+ALTER TABLE "apple_grants" ADD CONSTRAINT "apple_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "auth_attempts" ADD CONSTRAINT "auth_attempts_original_session_id_sessions_id_fk" FOREIGN KEY ("original_session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+CREATE UNIQUE INDEX "auth_attempts_link_session_unique" ON "auth_attempts" USING btree ("original_session_id") WHERE "auth_attempts"."original_session_id" is not null;--> statement-breakpoint
+CREATE INDEX "auth_attempts_expires_at_idx" ON "auth_attempts" USING btree ("expires_at");--> statement-breakpoint
+ALTER TABLE "users" ADD CONSTRAINT "users_apple_sub_unique" UNIQUE("apple_sub");
\ No newline at end of file
diff --git a/app/drizzle/meta/0031_snapshot.json b/app/drizzle/meta/0031_snapshot.json
new file mode 100644
index 00000000..99d40b30
--- /dev/null
+++ b/app/drizzle/meta/0031_snapshot.json
@@ -0,0 +1,1444 @@
+{
+  "id": "38a912c1-24e6-45d5-bbea-21234dc16c78",
+  "prevId": "7411205d-bab4-4b25-a379-b0733c516154",
+  "version": "7",
+  "dialect": "postgresql",
+  "tables": {
+    "public.apple_grants": {
+      "name": "apple_grants",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "client_id": {
+          "name": "client_id",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "refresh_token": {
+          "name": "refresh_token",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "apple_grants_user_id_users_id_fk": {
+          "name": "apple_grants_user_id_users_id_fk",
+          "tableFrom": "apple_grants",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {
+        "apple_grants_pkey": {
+          "name": "apple_grants_pkey",
+          "columns": [
+            "user_id",
+            "client_id"
+          ]
+        }
+      },
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.article_reads": {
+      "name": "article_reads",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "slug": {
+          "name": "slug",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "read_at": {
+          "name": "read_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "article_reads_user_id_users_id_fk": {
+          "name": "article_reads_user_id_users_id_fk",
+          "tableFrom": "article_reads",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {
+        "article_reads_user_id_slug_pk": {
+          "name": "article_reads_user_id_slug_pk",
+          "columns": [
+            "user_id",
+            "slug"
+          ]
+        }
+      },
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.auth_attempts": {
+      "name": "auth_attempts",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "binding_hash": {
+          "name": "binding_hash",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "surface": {
+          "name": "surface",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "purpose": {
+          "name": "purpose",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "target_provider": {
+          "name": "target_provider",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "existing_provider": {
+          "name": "existing_provider",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "stage": {
+          "name": "stage",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "version": {
+          "name": "version",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "state": {
+          "name": "state",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "nonce": {
+          "name": "nonce",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "original_session_id": {
+          "name": "original_session_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "reauthenticated_at": {
+          "name": "reauthenticated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "verified_subject": {
+          "name": "verified_subject",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "verified_email": {
+          "name": "verified_email",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "verified_name": {
+          "name": "verified_name",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "apple_client_id": {
+          "name": "apple_client_id",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "apple_refresh_token": {
+          "name": "apple_refresh_token",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "auth_attempts_link_session_unique": {
+          "name": "auth_attempts_link_session_unique",
+          "columns": [
+            {
+              "expression": "original_session_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "where": "\"auth_attempts\".\"original_session_id\" is not null",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "auth_attempts_expires_at_idx": {
+          "name": "auth_attempts_expires_at_idx",
+          "columns": [
+            {
+              "expression": "expires_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "auth_attempts_original_session_id_sessions_id_fk": {
+          "name": "auth_attempts_original_session_id_sessions_id_fk",
+          "tableFrom": "auth_attempts",
+          "tableTo": "sessions",
+          "columnsFrom": [
+            "original_session_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "auth_attempts_state_unique": {
+          "name": "auth_attempts_state_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "state"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {
+        "auth_attempts_surface_check": {
+          "name": "auth_attempts_surface_check",
+          "value": "\"auth_attempts\".\"surface\" in ('native','web')"
+        },
+        "auth_attempts_purpose_check": {
+          "name": "auth_attempts_purpose_check",
+          "value": "\"auth_attempts\".\"purpose\" in ('signin','link')"
+        },
+        "auth_attempts_provider_check": {
+          "name": "auth_attempts_provider_check",
+          "value": "\"auth_attempts\".\"target_provider\" in ('apple','google') and (\"auth_attempts\".\"existing_provider\" is null or \"auth_attempts\".\"existing_provider\" in ('apple','google'))"
+        },
+        "auth_attempts_stage_check": {
+          "name": "auth_attempts_stage_check",
+          "value": "\"auth_attempts\".\"stage\" in ('authorize','exchanging','confirm','reauth_authorize','reauth_exchanging','target_authorize','target_exchanging','link_ready')"
+        },
+        "auth_attempts_session_check": {
+          "name": "auth_attempts_session_check",
+          "value": "(\"auth_attempts\".\"purpose\"='signin' and \"auth_attempts\".\"original_session_id\" is null and \"auth_attempts\".\"existing_provider\" is null) or (\"auth_attempts\".\"purpose\"='link' and \"auth_attempts\".\"original_session_id\" is not null and \"auth_attempts\".\"existing_provider\" is not null and \"auth_attempts\".\"existing_provider\"<>\"auth_attempts\".\"target_provider\")"
+        },
+        "auth_attempts_expiry_check": {
+          "name": "auth_attempts_expiry_check",
+          "value": "\"auth_attempts\".\"expires_at\">\"auth_attempts\".\"created_at\""
+        },
+        "auth_attempts_version_check": {
+          "name": "auth_attempts_version_check",
+          "value": "\"auth_attempts\".\"version\">0"
+        }
+      },
+      "isRLSEnabled": false
+    },
+    "public.baselines": {
+      "name": "baselines",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "k2_seconds": {
+          "name": "k2_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "k6_seconds": {
+          "name": "k6_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "k2_source": {
+          "name": "k2_source",
+          "type": "baseline_source",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'manual'"
+        },
+        "k6_source": {
+          "name": "k6_source",
+          "type": "baseline_source",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'manual'"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "baselines_user_id_users_id_fk": {
+          "name": "baselines_user_id_users_id_fk",
+          "tableFrom": "baselines",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.concept2_auth_attempts": {
+      "name": "concept2_auth_attempts",
+      "schema": "",
+      "columns": {
+        "nonce": {
+          "name": "nonce",
+          "type": "text",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "surface": {
+          "name": "surface",
+          "type": "link_surface",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'web'"
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "concept2_auth_attempts_user_id_users_id_fk": {
+          "name": "concept2_auth_attempts_user_id_users_id_fk",
+          "tableFrom": "concept2_auth_attempts",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "concept2_auth_attempts_user_id_unique": {
+          "name": "concept2_auth_attempts_user_id_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "user_id"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.concept2_links": {
+      "name": "concept2_links",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "c2_user_id": {
+          "name": "c2_user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "c2_username": {
+          "name": "c2_username",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "access_token": {
+          "name": "access_token",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "refresh_token": {
+          "name": "refresh_token",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "needs_reauth_at": {
+          "name": "needs_reauth_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "auto_send": {
+          "name": "auto_send",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "auto_verify": {
+          "name": "auto_verify",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "send_failed_at": {
+          "name": "send_failed_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "send_failed_reason": {
+          "name": "send_failed_reason",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "concept2_links_user_id_users_id_fk": {
+          "name": "concept2_links_user_id_users_id_fk",
+          "tableFrom": "concept2_links",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "concept2_links_c2_user_id_unique": {
+          "name": "concept2_links_c2_user_id_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "c2_user_id"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.plan_state": {
+      "name": "plan_state",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "plan_key": {
+          "name": "plan_key",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "done_n": {
+          "name": "done_n",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "plan_state_user_id_users_id_fk": {
+          "name": "plan_state_user_id_users_id_fk",
+          "tableFrom": "plan_state",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {
+        "plan_state_plan_key_check": {
+          "name": "plan_state_plan_key_check",
+          "value": "\"plan_state\".\"plan_key\" is null or \"plan_state\".\"plan_key\" in ('sprint', 'head')"
+        }
+      },
+      "isRLSEnabled": false
+    },
+    "public.preferences": {
+      "name": "preferences",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "time_cap_minutes": {
+          "name": "time_cap_minutes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 60
+        },
+        "countdown_seconds": {
+          "name": "countdown_seconds",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 10
+        },
+        "pace_tolerance_seconds": {
+          "name": "pace_tolerance_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1
+        },
+        "accent_color": {
+          "name": "accent_color",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'#b5341f'"
+        },
+        "start_here_dismissed": {
+          "name": "start_here_dismissed",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "baselines_skipped": {
+          "name": "baselines_skipped",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "preferences_user_id_users_id_fk": {
+          "name": "preferences_user_id_users_id_fk",
+          "tableFrom": "preferences",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.session_logs": {
+      "name": "session_logs",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "workout_id": {
+          "name": "workout_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "workout_title": {
+          "name": "workout_title",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "workout_type": {
+          "name": "workout_type",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "logged_at": {
+          "name": "logged_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "baseline_k2": {
+          "name": "baseline_k2",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "baseline_k6": {
+          "name": "baseline_k6",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "held": {
+          "name": "held",
+          "type": "held_result",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "effort": {
+          "name": "effort",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "notes": {
+          "name": "notes",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "steps": {
+          "name": "steps",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "device_name": {
+          "name": "device_name",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "source": {
+          "name": "source",
+          "type": "log_source",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "thumbs": {
+          "name": "thumbs",
+          "type": "thumbs",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "avg_split_seconds": {
+          "name": "avg_split_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "distance_meters": {
+          "name": "distance_meters",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "time_seconds": {
+          "name": "time_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "plan_key": {
+          "name": "plan_key",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "plan_index": {
+          "name": "plan_index",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "series": {
+          "name": "series",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "ended_by": {
+          "name": "ended_by",
+          "type": "ended_by",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "work_seconds": {
+          "name": "work_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "work_meters": {
+          "name": "work_meters",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "rest_seconds": {
+          "name": "rest_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "rest_meters": {
+          "name": "rest_meters",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "machine_work_seconds": {
+          "name": "machine_work_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "machine_work_meters": {
+          "name": "machine_work_meters",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "machine_summary": {
+          "name": "machine_summary",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "c2_result_id": {
+          "name": "c2_result_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "c2_user_id": {
+          "name": "c2_user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "verified": {
+          "name": "verified",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "completed_at": {
+          "name": "completed_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tz": {
+          "name": "tz",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "session_logs_user_id_idx": {
+          "name": "session_logs_user_id_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "session_logs_user_id_users_id_fk": {
+          "name": "session_logs_user_id_users_id_fk",
+          "tableFrom": "session_logs",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "session_logs_workout_id_workouts_id_fk": {
+          "name": "session_logs_workout_id_workouts_id_fk",
+          "tableFrom": "session_logs",
+          "tableTo": "workouts",
+          "columnsFrom": [
+            "workout_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {
+        "session_logs_effort_check": {
+          "name": "session_logs_effort_check",
+          "value": "\"session_logs\".\"effort\" between 1 and 5"
+        }
+      },
+      "isRLSEnabled": false
+    },
+    "public.sessions": {
+      "name": "sessions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "token_hash": {
+          "name": "token_hash",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        }
+      },
+      "indexes": {
+        "sessions_user_id_idx": {
+          "name": "sessions_user_id_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "sessions_user_id_users_id_fk": {
+          "name": "sessions_user_id_users_id_fk",
+          "tableFrom": "sessions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "sessions_token_hash_unique": {
+          "name": "sessions_token_hash_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "token_hash"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.test_history": {
+      "name": "test_history",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "distance": {
+          "name": "distance",
+          "type": "test_distance",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "split_seconds": {
+          "name": "split_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "delta_seconds": {
+          "name": "delta_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "logged_at": {
+          "name": "logged_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "session_log_id": {
+          "name": "session_log_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "test_history_user_id_idx": {
+          "name": "test_history_user_id_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "test_history_user_id_users_id_fk": {
+          "name": "test_history_user_id_users_id_fk",
+          "tableFrom": "test_history",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "test_history_session_log_id_session_logs_id_fk": {
+          "name": "test_history_session_log_id_session_logs_id_fk",
+          "tableFrom": "test_history",
+          "tableTo": "session_logs",
+          "columnsFrom": [
+            "session_log_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "test_history_session_log_id_unique": {
+          "name": "test_history_session_log_id_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "session_log_id"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.users": {
+      "name": "users",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "google_sub": {
+          "name": "google_sub",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "apple_sub": {
+          "name": "apple_sub",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "email": {
+          "name": "email",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "users_google_sub_unique": {
+          "name": "users_google_sub_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "google_sub"
+          ]
+        },
+        "users_apple_sub_unique": {
+          "name": "users_apple_sub_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "apple_sub"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workouts": {
+      "name": "workouts",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sort_order": {
+          "name": "sort_order",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "title": {
+          "name": "title",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "type": {
+          "name": "type",
+          "type": "workout_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "effort": {
+          "name": "effort",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "source": {
+          "name": "source",
+          "type": "workout_source",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "steps": {
+          "name": "steps",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "workouts_user_id_idx": {
+          "name": "workouts_user_id_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workouts_user_id_users_id_fk": {
+          "name": "workouts_user_id_users_id_fk",
+          "tableFrom": "workouts",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {
+        "workouts_effort_check": {
+          "name": "workouts_effort_check",
+          "value": "\"workouts\".\"effort\" between 1 and 5"
+        }
+      },
+      "isRLSEnabled": false
+    }
+  },
+  "enums": {
+    "public.baseline_source": {
+      "name": "baseline_source",
+      "schema": "public",
+      "values": [
+        "manual",
+        "estimated",
+        "derived",
+        "tested"
+      ]
+    },
+    "public.ended_by": {
+      "name": "ended_by",
+      "schema": "public",
+      "values": [
+        "finished",
+        "rower",
+        "link-lost",
+        "program-failed",
+        "program-dropped",
+        "interrupted"
+      ]
+    },
+    "public.held_result": {
+      "name": "held_result",
+      "schema": "public",
+      "values": [
+        "held",
+        "under",
+        "over"
+      ]
+    },
+    "public.link_surface": {
+      "name": "link_surface",
+      "schema": "public",
+      "values": [
+        "native",
+        "web"
+      ]
+    },
+    "public.log_source": {
+      "name": "log_source",
+      "schema": "public",
+      "values": [
+        "pm5",
+        "timer",
+        "manual",
+        "no-reading"
+      ]
+    },
+    "public.test_distance": {
+      "name": "test_distance",
+      "schema": "public",
+      "values": [
+        "2k",
+        "6k"
+      ]
+    },
+    "public.thumbs": {
+      "name": "thumbs",
+      "schema": "public",
+      "values": [
+        "up",
+        "down"
+      ]
+    },
+    "public.workout_source": {
+      "name": "workout_source",
+      "schema": "public",
+      "values": [
+        "starter",
+        "user"
+      ]
+    },
+    "public.workout_type": {
+      "name": "workout_type",
+      "schema": "public",
+      "values": [
+        "AN",
+        "O2",
+        "AT",
+        "TR"
+      ]
+    }
+  },
+  "schemas": {},
+  "sequences": {},
+  "roles": {},
+  "policies": {},
+  "views": {},
+  "_meta": {
+    "columns": {},
+    "schemas": {},
+    "tables": {}
+  }
+}
\ No newline at end of file
diff --git a/app/drizzle/meta/_journal.json b/app/drizzle/meta/_journal.json
index 0e053e42..fc337d84 100644
--- a/app/drizzle/meta/_journal.json
+++ b/app/drizzle/meta/_journal.json
@@ -218,6 +218,13 @@
       "when": 1789234500437,
       "tag": "0030_overconfident_mojo",
       "breakpoints": true
+    },
+    {
+      "idx": 31,
+      "version": "7",
+      "when": 1789271450864,
+      "tag": "0031_apple_front_door",
+      "breakpoints": true
     }
   ]
 }
\ No newline at end of file
diff --git a/app/server/auth/attempts.integration.test.ts b/app/server/auth/attempts.integration.test.ts
new file mode 100644
index 00000000..76353271
--- /dev/null
+++ b/app/server/auth/attempts.integration.test.ts
@@ -0,0 +1,400 @@
+import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
+import { migrate } from "drizzle-orm/node-postgres/migrator";
+import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
+import pg from "pg";
+import { createDb } from "../db/index.js";
+import { startPostgres } from "../testing/postgres.js";
+import { createAttempts } from "./attempts.js";
+import { createSessionStore } from "./sessions.js";
+import { createUserStore } from "./users.js";
+
+describe("front-door transactions against Postgres", () => {
+  let container: StartedPostgreSqlContainer;
+  let pool: pg.Pool;
+  let store: ReturnType<typeof createAttempts>;
+  let sessions: ReturnType<typeof createSessionStore>;
+  let users: ReturnType<typeof createUserStore>;
+  beforeAll(async () => {
+    container = await startPostgres();
+    const c = createDb(container.getConnectionUri());
+    pool = c.pool;
+    await migrate(c.db, { migrationsFolder: "drizzle" });
+    store = createAttempts(pool);
+    sessions = createSessionStore(c.db);
+    users = createUserStore(c.db);
+    await store.sweep();
+  });
+  afterAll(async () => {
+    await pool?.end();
+    await container?.stop();
+  });
+  beforeEach(async () => {
+    await pool.query("TRUNCATE users,auth_attempts CASCADE");
+  });
+  const apple = {
+    sub: "apple",
+    email: "relay@privaterelay.appleid.com",
+    emailVerified: true,
+    name: "Rower",
+    grant: { clientId: "native.app", refreshToken: "secret" },
+  };
+  async function signin() {
+    return store.begin({
+      surface: "native",
+      purpose: "signin",
+      targetProvider: "apple",
+    });
+  }
+  it("does not create before confirm and atomically retains grant and session", async () => {
+    const b = await signin();
+    const claimed = await store.claim(b.attempt);
+    const pending = await store.accept(claimed, apple);
+    expect(pending.attempt?.stage).toBe("confirm");
+    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
+    const result = await store.confirm(
+      await store.read(b.attempt.id, b.bindingSecret, "native"),
+    );
+    expect(result.signedIn?.user.email).toBe("relay@privaterelay.appleid.com");
+    expect(
+      (await pool.query("SELECT refresh_token FROM apple_grants")).rows,
+    ).toStrictEqual([{ refresh_token: "secret" }]);
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
+    expect(
+      await sessions.resolveSession(result.signedIn!.token!),
+    ).toMatchObject({ user: { id: result.signedIn!.user.id } });
+  });
+  it("claims once, binding failures do not consume, cancellation cannot resurrect", async () => {
+    const b = await signin();
+    await expect(store.read(b.attempt.id, "wrong", "native")).rejects.toThrow(
+      "invalid_proof",
+    );
+    const claim = await store.claim(b.attempt);
+    await expect(store.claim(b.attempt)).rejects.toThrow("attempt_expired");
+    await store.cancel(b.attempt.id, b.bindingSecret, "native");
+    await expect(store.accept(claim, apple)).rejects.toThrow("attempt_expired");
+  });
+  it("resolves returning subject before requiring email and never merges email", async () => {
+    const b = await signin();
+    await store.accept(await store.claim(b.attempt), apple);
+    const first = await store.confirm(
+      await store.read(b.attempt.id, b.bindingSecret, "native"),
+    );
+    const b2 = await signin();
+    const returning = await store.accept(await store.claim(b2.attempt), {
+      ...apple,
+      email: "",
+      emailVerified: false,
+    });
+    expect(returning.signedIn?.user.id).toBe(first.signedIn?.user.id);
+    const b3 = await signin();
+    await store.accept(await store.claim(b3.attempt), {
+      ...apple,
+      sub: "different",
+    });
+    const second = await store.confirm(
+      await store.read(b3.attempt.id, b3.bindingSecret, "native"),
+    );
+    expect(second.signedIn?.user.id).not.toBe(first.signedIn?.user.id);
+  });
+  it("rejects unverified new identity without a user or grant", async () => {
+    const b = await signin();
+    await expect(
+      store.accept(await store.claim(b.attempt), {
+        ...apple,
+        emailVerified: false,
+      }),
+    ).rejects.toThrow("email_required");
+    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
+  });
+  async function link() {
+    const user = await users.createUser({
+      googleSub: "google",
+      email: "original@test",
+      name: "Original",
+    });
+    const credential = await sessions.createSession(user.id);
+    const resolved = await sessions.resolveSession(credential.token);
+    const b = await store.begin({
+      surface: "native",
+      purpose: "link",
+      targetProvider: "apple",
+      originalSessionId: resolved!.sessionId,
+    });
+    return { ...b, user, credential };
+  }
+  it("requires both proofs and exact current session; keeps existing profile", async () => {
+    const b = await link();
+    await expect(
+      store.accept(await store.claim(b.attempt), {
+        sub: "wrong",
+        email: "",
+        emailVerified: false,
+        name: "Rower",
+      }),
+    ).rejects.toThrow("account_changed");
+    const next = await store.begin({
+      surface: "native",
+      purpose: "link",
+      targetProvider: "apple",
+      originalSessionId: (await sessions.resolveSession(b.credential.token))!
+        .sessionId,
+    });
+    const target = await store.accept(await store.claim(next.attempt), {
+      sub: "google",
+      email: "",
+      emailVerified: false,
+      name: "Rower",
+    });
+    expect(target.attempt!.state).not.toBe(next.attempt.state);
+    expect(target.attempt!.stage).toBe("target_authorize");
+    const ready = await store.accept(await store.claim(target.attempt!), apple);
+    const other = await sessions.createSession(b.user.id);
+    await expect(
+      store.finalize(
+        ready.attempt!,
+        (await sessions.resolveSession(other.token))!.sessionId,
+      ),
+    ).rejects.toThrow("account_changed");
+    expect(
+      (await pool.query("SELECT apple_sub FROM users")).rows,
+    ).toStrictEqual([{ apple_sub: null }]);
+    const done = await store.finalize(
+      ready.attempt!,
+      (await sessions.resolveSession(b.credential.token))!.sessionId,
+    );
+    expect(done.linked).toBe(true);
+    expect(
+      (await pool.query("SELECT email,name,apple_sub FROM users")).rows,
+    ).toStrictEqual([
+      { email: "original@test", name: "Original", apple_sub: "apple" },
+    ]);
+  });
+  it("links Google to Apple and retains existing-provider refresh grant", async () => {
+    const b = await signin();
+    await store.accept(await store.claim(b.attempt), apple);
+    const signed = (
+      await store.confirm(
+        await store.read(b.attempt.id, b.bindingSecret, "native"),
+      )
+    ).signedIn!;
+    const sid = (await sessions.resolveSession(signed.token!))!.sessionId;
+    const start = await store.begin({
+      surface: "native",
+      purpose: "link",
+      targetProvider: "google",
+      originalSessionId: sid,
+    });
+    const target = (
+      await store.accept(await store.claim(start.attempt), {
+        ...apple,
+        grant: { clientId: "web.app", refreshToken: "fresh-existing" },
+      })
+    ).attempt!;
+    const ready = (
+      await store.accept(await store.claim(target), {
+        sub: "new-google",
+        email: "other@test",
+        emailVerified: true,
+        name: "Other",
+      })
+    ).attempt!;
+    expect((await store.finalize(ready, sid)).linked).toBe(true);
+    expect(
+      (await pool.query("SELECT google_sub,email,name FROM users")).rows,
+    ).toStrictEqual([
+      {
+        google_sub: "new-google",
+        email: "relay@privaterelay.appleid.com",
+        name: "Rower",
+      },
+    ]);
+    expect(
+      (
+        await pool.query(
+          "SELECT client_id,refresh_token FROM apple_grants ORDER BY client_id",
+        )
+      ).rows,
+    ).toStrictEqual([
+      { client_id: "native.app", refresh_token: "secret" },
+      { client_id: "web.app", refresh_token: "fresh-existing" },
+    ]);
+  });
+  it("named subject conflict refuses a second owner and rolls back grant/consume", async () => {
+    const b = await link();
+    const target = (
+      await store.accept(await store.claim(b.attempt), {
+        sub: "google",
+        email: "",
+        emailVerified: false,
+        name: "Rower",
+      })
+    ).attempt!;
+    const ready = (await store.accept(await store.claim(target), apple))
+      .attempt!;
+    await pool.query(
+      "INSERT INTO users(apple_sub,email,name) VALUES('apple','elsewhere@test','Other')",
+    );
+    await expect(
+      store.finalize(
+        ready,
+        (await sessions.resolveSession(b.credential.token))!.sessionId,
+      ),
+    ).rejects.toThrow("account_conflict");
+    expect(
+      (await pool.query("SELECT apple_sub FROM users WHERE id=$1", [b.user.id]))
+        .rows,
+    ).toStrictEqual([{ apple_sub: null }]);
+    expect(
+      (await pool.query("SELECT user_id FROM apple_grants")).rowCount,
+    ).toBe(0);
+    expect(
+      (await pool.query("SELECT stage FROM auth_attempts")).rows,
+    ).toStrictEqual([{ stage: "link_ready" }]);
+  });
+  it("claim and same-session replacement wait without a lock-order cycle", async () => {
+    const b = await link();
+    let release!: () => void;
+    const pause = new Promise<void>((resolve) => {
+      release = resolve;
+    });
+    let reached!: () => void;
+    const ready = new Promise<void>((resolve) => {
+      reached = resolve;
+    });
+    const claimPool = new pg.Pool({
+      connectionString: container.getConnectionUri(),
+      application_name: "claim-order-test",
+    });
+    claimPool.on("connect", (client) => {
+      const originalQuery = client.query.bind(client);
+      client.query = (async (sql: string, values?: unknown[]) => {
+        const result = await originalQuery(sql, values);
+        if (sql.includes("FROM auth_attempts") && sql.endsWith("FOR UPDATE")) {
+          reached();
+          await pause;
+        }
+        return result;
+      }) as typeof client.query;
+    });
+    const claim = createAttempts(claimPool).claim(b.attempt);
+    await ready;
+    const replacement = store.begin({
+      surface: "native",
+      purpose: "link",
+      targetProvider: "apple",
+      originalSessionId: b.attempt.originalSessionId!,
+    });
+    const settled = Promise.allSettled([claim, replacement]);
+    let waiting = false;
+    for (let i = 0; i < 100; i++) {
+      const result = await pool.query<{ waiting: boolean }>(
+        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock') AS waiting",
+      );
+      if (result.rows[0].waiting) {
+        waiting = true;
+        break;
+      }
+      await new Promise((resolve) => setTimeout(resolve, 10));
+    }
+    release();
+    const results = await settled;
+    await claimPool.end();
+    expect(waiting).toBe(true);
+    expect(results.map((result) => result.status)).toStrictEqual([
+      "fulfilled",
+      "fulfilled",
+    ]);
+  });
+  it("caps anonymous residents at 512 without consuming existing work", async () => {
+    await pool.query(
+      "INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,stage,version,state,nonce,expires_at) SELECT 'hash','native','signin','apple','authorize',1,gen_random_uuid()::text,gen_random_uuid()::text,now()+interval '5 minutes' FROM generate_series(1,512)",
+    );
+    await expect(signin()).rejects.toThrow("rate_limited");
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
+      512,
+    );
+  });
+  it("expiry is authority even before physical cleanup", async () => {
+    const b = await signin();
+    await pool.query(
+      "UPDATE auth_attempts SET created_at=now()-interval '10 minutes',expires_at=now()-interval '1 second' WHERE id=$1",
+      [b.attempt.id],
+    );
+    await expect(
+      store.read(b.attempt.id, b.bindingSecret, "native"),
+    ).rejects.toThrow("attempt_expired");
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(1);
+    await store.sweep();
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
+  });
+  it("rolls back user/session/consume when grant persistence fails", async () => {
+    const b = await signin();
+    await store.accept(await store.claim(b.attempt), apple);
+    await pool.query(
+      "ALTER TABLE apple_grants ADD CONSTRAINT force_grant_failure CHECK (refresh_token <> 'secret')",
+    );
+    await expect(
+      store.confirm(await store.read(b.attempt.id, b.bindingSecret, "native")),
+    ).rejects.toThrow();
+    await pool.query(
+      "ALTER TABLE apple_grants DROP CONSTRAINT force_grant_failure",
+    );
+    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
+    expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(0);
+    expect(
+      (await pool.query("SELECT stage FROM auth_attempts")).rows,
+    ).toStrictEqual([{ stage: "confirm" }]);
+  });
+  it("concurrent signup blocks on actual unique subject lock and returns one owner", async () => {
+    const b = await signin();
+    await store.accept(await store.claim(b.attempt), apple);
+    const blocker = await pool.connect();
+    await blocker.query("BEGIN");
+    const owner = await blocker.query<{ id: string }>(
+      "INSERT INTO users(apple_sub,email,name) VALUES('apple','original@test','Original') RETURNING id",
+    );
+    const running = store.confirm(
+      await store.read(b.attempt.id, b.bindingSecret, "native"),
+    );
+    let waiting = false;
+    for (let i = 0; i < 100; i++) {
+      const rows = await pool.query<{ waiting: boolean }>(
+        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'INSERT INTO users%') AS waiting",
+      );
+      if (rows.rows[0].waiting) {
+        waiting = true;
+        break;
+      }
+      await new Promise((resolve) => setTimeout(resolve, 10));
+    }
+    expect(waiting).toBe(true);
+    await blocker.query("COMMIT");
+    blocker.release();
+    expect((await running).signedIn?.user.id).toBe(owner.rows[0].id);
+    expect((await pool.query("SELECT id FROM users")).rowCount).toBe(1);
+  });
+  it("rejects stale existing-provider proof even if target attempt has a later expiry", async () => {
+    const b = await link();
+    const target = (
+      await store.accept(await store.claim(b.attempt), {
+        sub: "google",
+        email: "",
+        emailVerified: false,
+        name: "Rower",
+      })
+    ).attempt!;
+    const ready = (await store.accept(await store.claim(target), apple))
+      .attempt!;
+    await pool.query(
+      "UPDATE auth_attempts SET reauthenticated_at=now()-interval '5 minutes',expires_at=now()+interval '5 minutes' WHERE id=$1",
+      [ready.id],
+    );
+    const expired = await store.read(b.attempt.id, b.bindingSecret, "native");
+    await expect(
+      store.finalize(expired, b.attempt.originalSessionId!),
+    ).rejects.toThrow("attempt_expired");
+    expect(
+      (await pool.query("SELECT apple_sub FROM users")).rows,
+    ).toStrictEqual([{ apple_sub: null }]);
+  });
+});
diff --git a/app/server/auth/attempts.ts b/app/server/auth/attempts.ts
new file mode 100644
index 00000000..c1437de7
--- /dev/null
+++ b/app/server/auth/attempts.ts
@@ -0,0 +1,491 @@
+import { randomBytes, randomUUID } from "node:crypto";
+import type pg from "pg";
+import type {
+  AuthProvider,
+  AuthPurpose,
+  AuthUser,
+  SignedIn,
+} from "../../shared/auth.js";
+import { AuthFailure } from "./frontDoorErrors.js";
+import type { VerifiedIdentity } from "./providers.js";
+import { hashToken, SESSION_TTL_MS } from "./sessions.js";
+
+export type Surface = "native" | "web";
+export type Stage =
+  | "authorize"
+  | "exchanging"
+  | "confirm"
+  | "reauth_authorize"
+  | "reauth_exchanging"
+  | "target_authorize"
+  | "target_exchanging"
+  | "link_ready";
+export interface Attempt {
+  id: string;
+  bindingHash: string;
+  surface: Surface;
+  purpose: AuthPurpose;
+  targetProvider: AuthProvider;
+  existingProvider: AuthProvider | null;
+  stage: Stage;
+  version: number;
+  state: string;
+  nonce: string;
+  originalSessionId: string | null;
+  createdAt: Date;
+  expiresAt: Date;
+  reauthenticatedAt: Date | null;
+  verifiedSubject: string | null;
+  verifiedEmail: string | null;
+  verifiedName: string | null;
+  appleClientId: string | null;
+  appleRefreshToken: string | null;
+}
+export interface AttemptResult {
+  attempt?: Attempt;
+  signedIn?: SignedIn;
+  linked?: true;
+}
+const projection = `id,binding_hash AS "bindingHash",surface,purpose,target_provider AS "targetProvider",existing_provider AS "existingProvider",stage,version,state,nonce,original_session_id AS "originalSessionId",created_at AS "createdAt",expires_at AS "expiresAt",reauthenticated_at AS "reauthenticatedAt",verified_subject AS "verifiedSubject",verified_email AS "verifiedEmail",verified_name AS "verifiedName",apple_client_id AS "appleClientId",apple_refresh_token AS "appleRefreshToken"`;
+const ttl = 300000;
+const random = () => randomBytes(32).toString("base64url");
+const subjectColumn = (provider: AuthProvider) =>
+  provider === "apple" ? "apple_sub" : "google_sub";
+export function attemptProvider(a: Attempt): AuthProvider {
+  return a.stage.startsWith("reauth_") ? a.existingProvider! : a.targetProvider;
+}
+function same(a: Attempt, b: Attempt) {
+  return (
+    a.bindingHash === b.bindingHash &&
+    a.surface === b.surface &&
+    a.purpose === b.purpose &&
+    a.targetProvider === b.targetProvider &&
+    a.existingProvider === b.existingProvider &&
+    a.stage === b.stage &&
+    a.version === b.version &&
+    a.state === b.state &&
+    a.nonce === b.nonce &&
+    a.originalSessionId === b.originalSessionId
+  );
+}
+function consistent(a: Attempt) {
+  const signup = ["authorize", "exchanging", "confirm"].includes(a.stage);
+  const verified = ["confirm", "link_ready"].includes(a.stage);
+  if (
+    (a.purpose === "signin") !== signup ||
+    (verified &&
+      (!a.verifiedSubject || a.verifiedEmail === null || !a.verifiedName)) ||
+    Boolean(a.appleClientId) !== Boolean(a.appleRefreshToken) ||
+    ((a.stage.startsWith("target_") || a.stage === "link_ready") &&
+      !a.reauthenticatedAt)
+  )
+    throw new AuthFailure("attempt_expired");
+}
+export function createAttempts(pool: pg.Pool) {
+  let healthy = false;
+  async function transaction<T>(
+    work: (tx: pg.PoolClient) => Promise<T>,
+  ): Promise<T> {
+    const tx = await pool.connect();
+    try {
+      await tx.query("BEGIN");
+      const result = await work(tx);
+      await tx.query("COMMIT");
+      return result;
+    } catch (error) {
+      await tx.query("ROLLBACK");
+      if (
+        error &&
+        typeof error === "object" &&
+        "code" in error &&
+        error.code === "23505" &&
+        "constraint" in error &&
+        ["users_apple_sub_unique", "users_google_sub_unique"].includes(
+          String(error.constraint),
+        )
+      )
+        throw new AuthFailure("account_conflict");
+      throw error;
+    } finally {
+      tx.release();
+    }
+  }
+  async function load(
+    tx: pg.Pool | pg.PoolClient,
+    id: string,
+    lock = false,
+  ): Promise<Attempt> {
+    const row = (
+      await tx.query<Attempt>(
+        `SELECT ${projection} FROM auth_attempts WHERE id=$1 AND expires_at>now()${lock ? " FOR UPDATE" : ""}`,
+        [id],
+      )
+    ).rows[0];
+    if (!row) throw new AuthFailure("attempt_expired");
+    consistent(row);
+    if (row.originalSessionId) await original(tx, row.originalSessionId, lock);
+    return row;
+  }
+  async function original(
+    tx: pg.Pool | pg.PoolClient,
+    id: string,
+    lock = false,
+  ): Promise<{ id: string; userId: string }> {
+    const session = (
+      await tx.query<{ id: string; userId: string }>(
+        `SELECT id,user_id AS "userId" FROM sessions WHERE id=$1 AND expires_at>now()${lock ? " FOR UPDATE" : ""}`,
+        [id],
+      )
+    ).rows[0];
+    if (!session) throw new AuthFailure("account_changed");
+    return session;
+  }
+  async function bound(tx: pg.PoolClient, expected: Attempt) {
+    // Link mint and session deletion lock the session before its attempts.
+    // Keep that order for every transition so concurrent replacement cannot cycle.
+    if (expected.originalSessionId)
+      await original(tx, expected.originalSessionId, true);
+    const a = await load(tx, expected.id, true);
+    if (!same(a, expected)) throw new AuthFailure("attempt_expired");
+    return a;
+  }
+  async function save(tx: pg.PoolClient, a: Attempt): Promise<Attempt> {
+    consistent(a);
+    const result = await tx.query<Attempt>(
+      `UPDATE auth_attempts SET stage=$2,version=version+1,state=$3,nonce=$4,expires_at=$5,reauthenticated_at=$6,verified_subject=$7,verified_email=$8,verified_name=$9,apple_client_id=$10,apple_refresh_token=$11 WHERE id=$1 AND binding_hash=$12 AND surface=$13 AND purpose=$14 AND target_provider=$15 AND version=$16 AND expires_at>now() RETURNING ${projection}`,
+      [
+        a.id,
+        a.stage,
+        a.state,
+        a.nonce,
+        a.expiresAt,
+        a.reauthenticatedAt,
+        a.verifiedSubject,
+        a.verifiedEmail,
+        a.verifiedName,
+        a.appleClientId,
+        a.appleRefreshToken,
+        a.bindingHash,
+        a.surface,
+        a.purpose,
+        a.targetProvider,
+        a.version,
+      ],
+    );
+    if (!result.rows[0]) throw new AuthFailure("attempt_expired");
+    return result.rows[0];
+  }
+  async function find(
+    tx: pg.PoolClient,
+    provider: AuthProvider,
+    sub: string,
+  ): Promise<AuthUser | undefined> {
+    return (
+      await tx.query<AuthUser>(
+        `SELECT id,email,name FROM users WHERE ${subjectColumn(provider)}=$1`,
+        [sub],
+      )
+    ).rows[0];
+  }
+  async function grant(
+    tx: pg.PoolClient,
+    userId: string,
+    a: Pick<Attempt, "appleClientId" | "appleRefreshToken">,
+  ) {
+    if (a.appleClientId && a.appleRefreshToken)
+      await tx.query(
+        "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,$2,$3) ON CONFLICT(user_id,client_id) DO UPDATE SET refresh_token=excluded.refresh_token,updated_at=now()",
+        [userId, a.appleClientId, a.appleRefreshToken],
+      );
+  }
+  async function mintSession(
+    tx: pg.PoolClient,
+    user: AuthUser,
+  ): Promise<SignedIn> {
+    const token = random();
+    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
+    await tx.query(
+      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)",
+      [user.id, hashToken(token), expiresAt],
+    );
+    return {
+      outcome: "signed_in",
+      user,
+      token,
+      expiresAt: expiresAt.toISOString(),
+    };
+  }
+  async function finishSignin(
+    tx: pg.PoolClient,
+    a: Attempt,
+    user: AuthUser,
+  ): Promise<AttemptResult> {
+    await grant(tx, user.id, a);
+    const signedIn = await mintSession(tx, user);
+    await tx.query("DELETE FROM auth_attempts WHERE id=$1", [a.id]);
+    return { signedIn };
+  }
+  return {
+    healthy: () => healthy,
+    async sweep(): Promise<void> {
+      try {
+        await pool.query("DELETE FROM auth_attempts WHERE expires_at<=now()");
+        healthy = true;
+      } catch (error) {
+        healthy = false;
+        throw error;
+      }
+    },
+    async begin(input: {
+      surface: Surface;
+      purpose: AuthPurpose;
+      targetProvider: AuthProvider;
+      originalSessionId?: string;
+      replace?: { id: string; bindingSecret: string };
+    }): Promise<{ attempt: Attempt; bindingSecret: string }> {
+      if (input.purpose === "signin" && !healthy)
+        throw new AuthFailure("unavailable");
+      return transaction(async (tx) => {
+        if (input.purpose === "signin") {
+          await tx.query("SELECT pg_advisory_xact_lock(173496,1)");
+          await tx.query("DELETE FROM auth_attempts WHERE expires_at<=now()");
+        }
+        let existing: AuthProvider | null = null;
+        if (input.purpose === "link") {
+          if (!input.originalSessionId)
+            throw new AuthFailure("account_changed");
+          const session = await original(tx, input.originalSessionId, true);
+          existing = input.targetProvider === "apple" ? "google" : "apple";
+          const user = (
+            await tx.query<{ existing: string | null; target: string | null }>(
+              `SELECT ${subjectColumn(existing)} AS existing,${subjectColumn(input.targetProvider)} AS target FROM users WHERE id=$1`,
+              [session.userId],
+            )
+          ).rows[0];
+          if (!user?.existing || user.target)
+            throw new AuthFailure("account_conflict");
+          await tx.query(
+            "DELETE FROM auth_attempts WHERE original_session_id=$1",
+            [input.originalSessionId],
+          );
+        }
+        if (input.replace)
+          await tx.query(
+            "DELETE FROM auth_attempts WHERE id=$1 AND binding_hash=$2 AND surface=$3",
+            [
+              input.replace.id,
+              hashToken(input.replace.bindingSecret),
+              input.surface,
+            ],
+          );
+        if (input.purpose === "signin") {
+          const count = (
+            await tx.query<{ count: number }>(
+              "SELECT count(*)::int AS count FROM auth_attempts WHERE purpose='signin'",
+            )
+          ).rows[0].count;
+          if (count >= 512) throw new AuthFailure("rate_limited");
+        }
+        const bindingSecret = random();
+        const now = new Date();
+        const row = (
+          await tx.query<Attempt>(
+            `INSERT INTO auth_attempts(id,binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12) RETURNING ${projection}`,
+            [
+              randomUUID(),
+              hashToken(bindingSecret),
+              input.surface,
+              input.purpose,
+              input.targetProvider,
+              existing,
+              input.purpose === "signin" ? "authorize" : "reauth_authorize",
+              random(),
+              random(),
+              input.purpose === "link" ? input.originalSessionId : null,
+              now,
+              new Date(now.getTime() + ttl),
+            ],
+          )
+        ).rows[0];
+        return { attempt: row, bindingSecret };
+      });
+    },
+    async read(
+      id: string,
+      bindingSecret: string,
+      surface: Surface,
+    ): Promise<Attempt> {
+      const a = await load(pool, id);
+      if (a.bindingHash !== hashToken(bindingSecret) || a.surface !== surface)
+        throw new AuthFailure("invalid_proof");
+      return a;
+    },
+    async claim(expected: Attempt): Promise<Attempt> {
+      return transaction(async (tx) => {
+        const a = await bound(tx, expected);
+        const next: Partial<Record<Stage, Stage>> = {
+          authorize: "exchanging",
+          reauth_authorize: "reauth_exchanging",
+          target_authorize: "target_exchanging",
+        };
+        const stage = next[a.stage];
+        if (!stage) throw new AuthFailure("attempt_expired");
+        return save(tx, { ...a, stage });
+      });
+    },
+    async accept(
+      expected: Attempt,
+      identity: VerifiedIdentity,
+    ): Promise<AttemptResult> {
+      return transaction(async (tx) => {
+        const a = await bound(tx, expected);
+        if (
+          !["exchanging", "reauth_exchanging", "target_exchanging"].includes(
+            a.stage,
+          )
+        )
+          throw new AuthFailure("attempt_expired");
+        const now = new Date();
+        if (identity.grant) {
+          a.appleClientId = identity.grant.clientId;
+          a.appleRefreshToken = identity.grant.refreshToken;
+        }
+        if (a.stage === "reauth_exchanging") {
+          const session = await original(tx, a.originalSessionId!, true);
+          const user = await find(tx, a.existingProvider!, identity.sub);
+          if (user?.id !== session.userId)
+            throw new AuthFailure("account_changed");
+          return {
+            attempt: await save(tx, {
+              ...a,
+              stage: "target_authorize",
+              state: random(),
+              nonce: random(),
+              reauthenticatedAt: now,
+              expiresAt: new Date(now.getTime() + ttl),
+            }),
+          };
+        }
+        if (a.stage === "exchanging") {
+          const user = await find(tx, a.targetProvider, identity.sub);
+          if (user) return finishSignin(tx, a, user);
+          if (!identity.emailVerified || !identity.email)
+            throw new AuthFailure("email_required");
+        } else if (
+          !a.reauthenticatedAt ||
+          now.getTime() - a.reauthenticatedAt.getTime() >= ttl
+        )
+          throw new AuthFailure("attempt_expired");
+        return {
+          attempt: await save(tx, {
+            ...a,
+            stage: a.purpose === "signin" ? "confirm" : "link_ready",
+            verifiedSubject: identity.sub,
+            verifiedEmail: identity.email,
+            verifiedName: identity.name,
+            expiresAt:
+              a.purpose === "signin"
+                ? new Date(now.getTime() + ttl)
+                : a.expiresAt,
+          }),
+        };
+      });
+    },
+    async confirm(expected: Attempt): Promise<AttemptResult> {
+      return transaction(async (tx) => {
+        const a = await bound(tx, expected);
+        if (a.stage !== "confirm") throw new AuthFailure("attempt_expired");
+        const column = subjectColumn(a.targetProvider);
+        const user = (
+          await tx.query<AuthUser>(
+            `INSERT INTO users(${column},email,name) VALUES($1,$2,$3) ON CONFLICT(${column}) DO UPDATE SET ${column}=excluded.${column} RETURNING id,email,name`,
+            [a.verifiedSubject, a.verifiedEmail, a.verifiedName],
+          )
+        ).rows[0];
+        return finishSignin(tx, a, user);
+      });
+    },
+    async finalize(
+      expected: Attempt,
+      currentSessionId: string,
+    ): Promise<AttemptResult> {
+      return transaction(async (tx) => {
+        const a = await bound(tx, expected);
+        if (
+          a.stage !== "link_ready" ||
+          !a.reauthenticatedAt ||
+          Date.now() - a.reauthenticatedAt.getTime() >= ttl
+        )
+          throw new AuthFailure("attempt_expired");
+        if (currentSessionId !== a.originalSessionId)
+          throw new AuthFailure("account_changed");
+        const session = await original(tx, currentSessionId, true);
+        const column = subjectColumn(a.targetProvider);
+        const updated = await tx.query(
+          `UPDATE users SET ${column}=$1 WHERE id=$2 AND (${column} IS NULL OR ${column}=$1) RETURNING id`,
+          [a.verifiedSubject, session.userId],
+        );
+        if (!updated.rowCount) throw new AuthFailure("account_conflict");
+        await grant(tx, session.userId, a);
+        await tx.query("DELETE FROM auth_attempts WHERE id=$1", [a.id]);
+        return { linked: true };
+      });
+    },
+    // Failure cleanup owns one snapshot, unlike an explicit holder cancel.
+    // A single conditional DELETE locks only the attempt and cannot erase a
+    // newer authorization stage after another callback wins its transition.
+    async discard(expected: Attempt): Promise<boolean> {
+      const result = await pool.query(
+        `DELETE FROM auth_attempts WHERE id=$1 AND binding_hash=$2 AND surface=$3 AND purpose=$4 AND target_provider=$5 AND existing_provider IS NOT DISTINCT FROM $6 AND stage=$7 AND version=$8 AND state=$9 AND nonce=$10 AND original_session_id IS NOT DISTINCT FROM $11`,
+        [
+          expected.id,
+          expected.bindingHash,
+          expected.surface,
+          expected.purpose,
+          expected.targetProvider,
+          expected.existingProvider,
+          expected.stage,
+          expected.version,
+          expected.state,
+          expected.nonce,
+          expected.originalSessionId,
+        ],
+      );
+      return result.rowCount === 1;
+    },
+    async cancel(
+      id: string,
+      bindingSecret: string,
+      surface: Surface,
+    ): Promise<void> {
+      await pool.query(
+        "DELETE FROM auth_attempts WHERE id=$1 AND binding_hash=$2 AND surface=$3",
+        [id, hashToken(bindingSecret), surface],
+      );
+    },
+    async methods(
+      userId: string,
+    ): Promise<{ apple: boolean; google: boolean }> {
+      const result = await pool.query<{ apple: boolean; google: boolean }>(
+        "SELECT apple_sub IS NOT NULL AS apple,google_sub IS NOT NULL AS google FROM users WHERE id=$1",
+        [userId],
+      );
+      if (!result.rows[0]) throw new AuthFailure("account_changed");
+      return result.rows[0];
+    },
+    async legacyGoogle(identity: VerifiedIdentity): Promise<SignedIn> {
+      if (!identity.emailVerified || !identity.email)
+        throw new AuthFailure("invalid_proof");
+      return transaction(async (tx) => {
+        const user = (
+          await tx.query<AuthUser>(
+            "INSERT INTO users(google_sub,email,name) VALUES($1,$2,$3) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,name=excluded.name RETURNING id,email,name",
+            [identity.sub, identity.email, identity.name],
+          )
+        ).rows[0];
+        return mintSession(tx, user);
+      });
+    },
+  };
+}
+export type Attempts = ReturnType<typeof createAttempts>;
diff --git a/app/server/auth/middleware.ts b/app/server/auth/middleware.ts
index 1b78b3df..54cb321f 100644
--- a/app/server/auth/middleware.ts
+++ b/app/server/auth/middleware.ts
@@ -11,6 +11,7 @@ export type AuthVia = "bearer" | "cookie";
 declare module "express-serve-static-core" {
   interface Request {
     user?: SessionUser;
+    sessionId?: string;
     authVia?: AuthVia;
   }
 }
@@ -130,6 +131,7 @@ export function requireUser(store: SessionStore): RequestHandler {
       }
     }
     req.user = resolved.user;
+    req.sessionId = resolved.sessionId;
     req.authVia = authVia;
     next();
   };
diff --git a/app/server/auth/native.test.ts b/app/server/auth/native.test.ts
index bb764c22..a1ec28d8 100644
--- a/app/server/auth/native.test.ts
+++ b/app/server/auth/native.test.ts
@@ -7,6 +7,7 @@ import { makeFakeSessions, makeFakeUsers } from "../testing/fakes.js";
 const claims = { sub: "s1", email: "a@x.com", emailVerified: true, name: "A" };
 const dbUser = {
   id: "u1",
+  appleSub: null,
   googleSub: "s1",
   email: "a@x.com",
   name: "A",
diff --git a/app/server/auth/routes.test.ts b/app/server/auth/routes.test.ts
index 9436ca63..7ed318b9 100644
--- a/app/server/auth/routes.test.ts
+++ b/app/server/auth/routes.test.ts
@@ -8,6 +8,7 @@ import { makeFakeSessions, makeFakeUsers } from "../testing/fakes.js";
 const claims = { sub: "s1", email: "a@x.com", emailVerified: true, name: "A" };
 const baseUser = {
   id: "u1",
+  appleSub: null,
   googleSub: "s1",
   email: "a@x.com",
   name: "A",
diff --git a/app/server/auth/sessions.ts b/app/server/auth/sessions.ts
index 2ee3d5ff..7ec3019a 100644
--- a/app/server/auth/sessions.ts
+++ b/app/server/auth/sessions.ts
@@ -22,6 +22,7 @@ export interface SessionUser {
 }
 
 export interface ResolvedSession {
+  sessionId: string;
   user: SessionUser;
   expiresAt: Date;
   refreshed: boolean;
@@ -60,6 +61,7 @@ export function createSessionStore(db: Db) {
         refreshed = true;
       }
       return {
+        sessionId: row.session.id,
         user: { id: row.user.id, email: row.user.email, name: row.user.name },
         expiresAt,
         refreshed,
diff --git a/app/server/auth/testSignin.test.ts b/app/server/auth/testSignin.test.ts
index 745c2dd6..d34620cc 100644
--- a/app/server/auth/testSignin.test.ts
+++ b/app/server/auth/testSignin.test.ts
@@ -6,6 +6,7 @@ import { makeFakeSessions, makeFakeUsers } from "../testing/fakes.js";
 
 const baseUser = {
   id: "u1",
+  appleSub: null,
   googleSub: "test:e2e@test.local",
   email: "e2e@test.local",
   name: "E2E Test User",
diff --git a/app/server/db/schema.ts b/app/server/db/schema.ts
index ce9dacf9..e06880d8 100644
--- a/app/server/db/schema.ts
+++ b/app/server/db/schema.ts
@@ -12,6 +12,7 @@ import {
   text,
   timestamp,
   uuid,
+  uniqueIndex,
 } from "drizzle-orm/pg-core";
 import { sql } from "drizzle-orm";
 
@@ -24,6 +25,7 @@ export const users = pgTable("users", {
   // snapshot). No production code writes a NULL yet; the policy PR that does
   // becomes the rollback floor (docs/RELEASING.md § Rollback constraints).
   googleSub: text("google_sub").unique(),
+  appleSub: text("apple_sub").unique("users_apple_sub_unique"),
   email: text("email").notNull(),
   name: text("name").notNull(),
   createdAt: timestamp("created_at", { withTimezone: true })
@@ -701,3 +703,75 @@ export const concept2AuthAttempts = pgTable("concept2_auth_attempts", {
     .notNull()
     .defaultNow(),
 });
+
+export const appleGrants = pgTable(
+  "apple_grants",
+  {
+    userId: uuid("user_id")
+      .notNull()
+      .references(() => users.id, { onDelete: "cascade" }),
+    clientId: text("client_id").notNull(),
+    refreshToken: text("refresh_token").notNull(),
+    updatedAt: timestamp("updated_at", { withTimezone: true })
+      .notNull()
+      .defaultNow(),
+  },
+  (t) => [
+    primaryKey({ name: "apple_grants_pkey", columns: [t.userId, t.clientId] }),
+  ],
+);
+
+export const authAttempts = pgTable(
+  "auth_attempts",
+  {
+    id: uuid("id").primaryKey().defaultRandom(),
+    bindingHash: text("binding_hash").notNull(),
+    surface: text("surface").notNull(),
+    purpose: text("purpose").notNull(),
+    targetProvider: text("target_provider").notNull(),
+    existingProvider: text("existing_provider"),
+    stage: text("stage").notNull(),
+    version: integer("version").notNull(),
+    state: text("state").notNull().unique("auth_attempts_state_unique"),
+    nonce: text("nonce").notNull(),
+    originalSessionId: uuid("original_session_id").references(
+      () => sessions.id,
+      { onDelete: "cascade" },
+    ),
+    createdAt: timestamp("created_at", { withTimezone: true })
+      .notNull()
+      .defaultNow(),
+    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
+    reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true }),
+    verifiedSubject: text("verified_subject"),
+    verifiedEmail: text("verified_email"),
+    verifiedName: text("verified_name"),
+    appleClientId: text("apple_client_id"),
+    appleRefreshToken: text("apple_refresh_token"),
+  },
+  (t) => [
+    check("auth_attempts_surface_check", sql`${t.surface} in ('native','web')`),
+    check(
+      "auth_attempts_purpose_check",
+      sql`${t.purpose} in ('signin','link')`,
+    ),
+    check(
+      "auth_attempts_provider_check",
+      sql`${t.targetProvider} in ('apple','google') and (${t.existingProvider} is null or ${t.existingProvider} in ('apple','google'))`,
+    ),
+    check(
+      "auth_attempts_stage_check",
+      sql`${t.stage} in ('authorize','exchanging','confirm','reauth_authorize','reauth_exchanging','target_authorize','target_exchanging','link_ready')`,
+    ),
+    check(
+      "auth_attempts_session_check",
+      sql`(${t.purpose}='signin' and ${t.originalSessionId} is null and ${t.existingProvider} is null) or (${t.purpose}='link' and ${t.originalSessionId} is not null and ${t.existingProvider} is not null and ${t.existingProvider}<>${t.targetProvider})`,
+    ),
+    check("auth_attempts_expiry_check", sql`${t.expiresAt}>${t.createdAt}`),
+    check("auth_attempts_version_check", sql`${t.version}>0`),
+    uniqueIndex("auth_attempts_link_session_unique")
+      .on(t.originalSessionId)
+      .where(sql`${t.originalSessionId} is not null`),
+    index("auth_attempts_expires_at_idx").on(t.expiresAt),
+  ],
+);
```

### Task 3: HTTP flow, legacy compatibility, boot readiness and cleanup

**Files:** `app/server/auth/frontDoor.ts`, `app/server/auth/frontDoor.test.ts`, `app/server/auth/frontDoorRoutes.ts`, `app/server/auth/frontDoorRoutes.integration.test.ts`, `app/server/auth/routes.ts`, `app/server/app.ts`, `app/server/index.ts`.

**Interfaces:** Consumes `Attempts`, `Providers`, `SessionStore`. Produces `frontDoorConfig(env,siteUrl)`, `createFrontDoor(pool,sessions,config)`, its exact Apple callback/router/admission middleware, and `close()`. Native/UI consumers use `2026-09-13-apple-auth-contract.md`; deployment wiring belongs to the controller plan.

- [ ] **Step 1: Install the complete test-file changes from this task's patch and run `pnpm test --project unit --project integration server/auth server/app.test.ts`.** For reproduction from the baseline, test-file imports fail until the prescribed implementation exists. Do not treat a module-load failure as behavioral mutation evidence.
- [ ] **Step 2: Apply the complete implementation changes below to their named paths.** The generated migration journal, snapshot and SQL travel together. Before adoption, inspect competing migration indexes; regenerate from the merged base if another branch has occupied 0031. Never rewrite a migration already shipped to production.
- [ ] **Step 3: Run `pnpm test --project unit --project integration server/auth server/app.test.ts` against the exact implementation, then `pnpm typecheck`, `pnpm lint` and `pnpm format:check`.** Read actual output rather than copying an expected count.
- [ ] **Step 4: Run this task's deciding-source cases in `apple-server-evidence/mutations.py`, restore committed bytes, and rerun the covering suite.** The mutation report identifies each source/command/failed assertion summary.
- [ ] **Step 5: Commit the independently reviewable responsibility, verifying `git rev-parse --show-toplevel` and actual hook output.** The retained candidate already has these changes; adopting it avoids a transcription commit.

<!-- candidate-patch:3 -->
```diff
diff --git a/app/server/app.ts b/app/server/app.ts
index a9e583f5..1c8000a4 100644
--- a/app/server/app.ts
+++ b/app/server/app.ts
@@ -1,4 +1,5 @@
 import express from "express";
+import type { FrontDoor } from "./auth/frontDoor.js";
 import { noStore, originCheck, requireUser } from "./auth/middleware.js";
 import { createAuthRouter } from "./auth/routes.js";
 import { createTestSigninRouter } from "./auth/testSignin.js";
@@ -13,6 +14,7 @@ import { createStatsRouter } from "./routes/stats.js";
 import type { Concept2Store } from "./stores/concept2.js";
 
 export interface AppDeps {
+  frontDoor?: FrontDoor | null;
   checkDb: () => Promise<boolean>;
   sessions: SessionStore;
   users: UserStore;
@@ -76,6 +78,13 @@ export function createApp(deps: AppDeps) {
   // `express.json()` below runs as a no-op pass-through for a body this
   // one already consumed — every other route is untouched, still gated at
   // the default 100 KB.
+  if (deps.frontDoor)
+    app.post(
+      "/api/auth/apple/callback",
+      noStore,
+      express.urlencoded({ extended: false, limit: "32kb", parameterLimit: 8 }),
+      deps.frontDoor.appleCallback,
+    );
   app.post("/api/logs", express.json({ limit: "1mb" }));
   app.use(express.json());
   app.use("/api", noStore);
@@ -96,6 +105,30 @@ export function createApp(deps: AppDeps) {
     }
   });
 
+  app.get("/api/auth/options", (_req, res) => {
+    res.json({
+      frontDoorEnabled: Boolean(deps.frontDoor),
+      apple: { native: Boolean(deps.frontDoor), web: Boolean(deps.frontDoor) },
+      google: {
+        native: Boolean(deps.nativeVerifier),
+        web: Boolean(deps.oauth),
+      },
+    });
+  });
+  if (deps.frontDoor) app.use(deps.frontDoor.router);
+  else
+    app.use(
+      [
+        "/api/auth/native/attempts",
+        "/api/auth/web/attempts",
+        "/api/auth/methods",
+        "/api/auth/apple/callback",
+        "/api/auth/google/callback",
+      ],
+      (_req, res) => {
+        res.status(503).json({ error: "unavailable" });
+      },
+    );
   app.use(createAuthRouter(deps));
 
   if (deps.testAuthSecret) {
diff --git a/app/server/auth/frontDoor.test.ts b/app/server/auth/frontDoor.test.ts
new file mode 100644
index 00000000..9d1be839
--- /dev/null
+++ b/app/server/auth/frontDoor.test.ts
@@ -0,0 +1,115 @@
+import { afterEach, describe, expect, it, vi } from "vitest";
+import request from "supertest";
+import { createApp } from "../app.js";
+import { baseDeps } from "../testDeps.js";
+import type pg from "pg";
+import { generateKeyPair, exportPKCS8 } from "jose";
+import { createFrontDoor, frontDoorConfig } from "./frontDoor.js";
+
+describe("front-door boot and options", () => {
+  afterEach(() => {
+    vi.useRealTimers();
+    vi.restoreAllMocks();
+  });
+  it("defaults dark and retains actual Google availability", async () => {
+    const deps = baseDeps();
+    const res = await request(createApp(deps)).get("/api/auth/options");
+    expect(res.status).toBe(200);
+    expect(res.body).toMatchObject({
+      frontDoorEnabled: false,
+      apple: { native: false, web: false },
+    });
+  });
+  it("requires every Apple configuration value only when exactly enabled", async () => {
+    expect(await frontDoorConfig({}, "http://localhost:5173")).toBeNull();
+    expect(
+      await frontDoorConfig(
+        { FRONT_DOOR_ENABLED: "true" },
+        "http://localhost:5173",
+      ),
+    ).toBeNull();
+    await expect(
+      frontDoorConfig({ FRONT_DOOR_ENABLED: "1" }, "https://erg.test"),
+    ).rejects.toThrow("APPLE_NATIVE_CLIENT_ID");
+  });
+  it("validates both Apple audiences and PKCS8 key before enabling", async () => {
+    const key = await generateKeyPair("ES256", { extractable: true });
+    const env = {
+      FRONT_DOOR_ENABLED: "1",
+      APPLE_NATIVE_CLIENT_ID: "native.app",
+      APPLE_WEB_CLIENT_ID: "web.app",
+      APPLE_TEAM_ID: "TEAM",
+      APPLE_KEY_ID: "KEY",
+      APPLE_PRIVATE_KEY: await exportPKCS8(key.privateKey),
+    };
+    const config = await frontDoorConfig(env, "https://erg.test");
+    expect(config?.apple.nativeClientId).toBe("native.app");
+    expect(config?.apple.key.algorithm.name).toBe("ECDSA");
+    await expect(
+      frontDoorConfig(
+        { ...env, APPLE_WEB_CLIENT_ID: "native.app" },
+        "https://erg.test",
+      ),
+    ).rejects.toThrow("distinct");
+    await expect(frontDoorConfig(env, "http://erg.test")).rejects.toThrow(
+      "HTTPS",
+    );
+    await expect(
+      frontDoorConfig(
+        { ...env, APPLE_PRIVATE_KEY: "invalid" },
+        "https://erg.test",
+      ),
+    ).rejects.toThrow();
+  });
+  it("sweeps before readiness, fails new starts closed, recovers on minute sweep, clears timer", async () => {
+    vi.useFakeTimers();
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+    const query = vi
+      .fn()
+      .mockRejectedValueOnce(new Error("TOP-SECRET"))
+      .mockResolvedValue({ rows: [] });
+    const pool = { query } as unknown as pg.Pool;
+    const key = await generateKeyPair("ES256");
+    const front = await createFrontDoor(pool, baseDeps().sessions, {
+      siteUrl: "https://erg.test",
+      apple: {
+        nativeClientId: "native.app",
+        webClientId: "web.app",
+        teamId: "TEAM",
+        keyId: "KEY",
+        key: key.privateKey,
+      },
+      google: { nativeClientId: "", webClientId: "", clientSecret: "" },
+    });
+    expect(front.attempts.healthy()).toBe(false);
+    await expect(
+      front.attempts.begin({
+        surface: "native",
+        purpose: "signin",
+        targetProvider: "apple",
+      }),
+    ).rejects.toThrow("unavailable");
+    expect(warn).toHaveBeenCalledWith(
+      '{"event":"auth_attempt_cleanup_failed"}',
+    );
+    await vi.advanceTimersByTimeAsync(59999);
+    expect(query).toHaveBeenCalledTimes(1);
+    await vi.advanceTimersByTimeAsync(1);
+    expect(query).toHaveBeenCalledTimes(2);
+    expect(front.attempts.healthy()).toBe(true);
+    front.close();
+    await vi.advanceTimersByTimeAsync(60000);
+    expect(query).toHaveBeenCalledTimes(2);
+  });
+  it.each([
+    "/api/auth/native/attempts",
+    "/api/auth/web/attempts",
+    "/api/auth/methods",
+  ])("new route %s stays unavailable while dark", async (path) => {
+    const res = await request(createApp(baseDeps()))
+      .post(path)
+      .send({ purpose: "signin", provider: "apple" });
+    expect(res.status).toBe(503);
+    expect(res.body.error).toBe("unavailable");
+  });
+});
diff --git a/app/server/auth/frontDoor.ts b/app/server/auth/frontDoor.ts
new file mode 100644
index 00000000..f1dfd990
--- /dev/null
+++ b/app/server/auth/frontDoor.ts
@@ -0,0 +1,76 @@
+import { importPKCS8 } from "jose";
+import type pg from "pg";
+import { createAttempts } from "./attempts.js";
+import { createProviders, type ProviderConfig } from "./providers.js";
+import { createFrontDoorRoutes } from "./frontDoorRoutes.js";
+import type { SessionStore } from "./sessions.js";
+
+export async function frontDoorConfig(
+  env: NodeJS.ProcessEnv,
+  siteUrl: string,
+): Promise<ProviderConfig | null> {
+  if (env.FRONT_DOOR_ENABLED !== "1") return null;
+  function required(key: string) {
+    const value = env[key];
+    if (!value?.trim() || value.length > 8192)
+      throw new Error(`${key} is required for FRONT_DOOR_ENABLED`);
+    return value;
+  }
+  const nativeClientId = required("APPLE_NATIVE_CLIENT_ID");
+  const webClientId = required("APPLE_WEB_CLIENT_ID");
+  if (
+    nativeClientId === webClientId ||
+    nativeClientId.length > 255 ||
+    webClientId.length > 255
+  )
+    throw new Error("Apple native/web client IDs must be distinct and bounded");
+  if (new URL(siteUrl).protocol !== "https:")
+    throw new Error("FRONT_DOOR_ENABLED requires HTTPS SITE_URL");
+  return {
+    siteUrl,
+    apple: {
+      nativeClientId,
+      webClientId,
+      teamId: required("APPLE_TEAM_ID"),
+      keyId: required("APPLE_KEY_ID"),
+      key: await importPKCS8(required("APPLE_PRIVATE_KEY"), "ES256"),
+    },
+    google: {
+      nativeClientId: env.GOOGLE_IOS_CLIENT_ID ?? "",
+      webClientId: env.GOOGLE_CLIENT_ID ?? "",
+      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
+    },
+  };
+}
+export async function createFrontDoor(
+  pool: pg.Pool,
+  sessions: SessionStore,
+  config: ProviderConfig,
+) {
+  const attempts = createAttempts(pool);
+  const providers = createProviders(config);
+  async function sweep() {
+    try {
+      await attempts.sweep();
+    } catch {
+      console.warn(JSON.stringify({ event: "auth_attempt_cleanup_failed" }));
+    }
+  }
+  await sweep();
+  const timer = setInterval(() => {
+    void sweep();
+  }, 60000);
+  timer.unref();
+  return {
+    ...createFrontDoorRoutes({
+      attempts,
+      providers,
+      sessions,
+      siteUrl: config.siteUrl,
+    }),
+    attempts,
+    providers,
+    close: () => clearInterval(timer),
+  };
+}
+export type FrontDoor = Awaited<ReturnType<typeof createFrontDoor>>;
diff --git a/app/server/auth/frontDoorRoutes.integration.test.ts b/app/server/auth/frontDoorRoutes.integration.test.ts
new file mode 100644
index 00000000..dfb16bc2
--- /dev/null
+++ b/app/server/auth/frontDoorRoutes.integration.test.ts
@@ -0,0 +1,860 @@
+import {
+  afterAll,
+  beforeAll,
+  beforeEach,
+  describe,
+  expect,
+  it,
+  vi,
+} from "vitest";
+import request from "supertest";
+import type { Response as ExpressResponse } from "express";
+import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
+import { migrate } from "drizzle-orm/node-postgres/migrator";
+import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
+import type pg from "pg";
+import { createDb } from "../db/index.js";
+import { startPostgres } from "../testing/postgres.js";
+import { createApp } from "../app.js";
+import { baseDeps } from "../testDeps.js";
+import { createSessionStore } from "./sessions.js";
+import { createUserStore } from "./users.js";
+import { createAttempts } from "./attempts.js";
+import { createProviders } from "./providers.js";
+import { createFrontDoorRoutes } from "./frontDoorRoutes.js";
+
+describe("supported auth producers through Express and signed tokens", () => {
+  let container: StartedPostgreSqlContainer;
+  let pool: pg.Pool;
+  let app: ReturnType<typeof createApp>;
+  let freshApp: () => Promise<ReturnType<typeof createApp>>;
+  let rsa: Awaited<ReturnType<typeof generateKeyPair>>;
+  let attempts: ReturnType<typeof createAttempts>;
+  const codes = new Map<string, string>();
+  function signal() {
+    let resolve!: () => void;
+    const promise = new Promise<void>((done) => {
+      resolve = done;
+    });
+    return { promise, resolve };
+  }
+  let exchangeOutsideLock = false;
+  beforeAll(async () => {
+    container = await startPostgres();
+    const c = createDb(container.getConnectionUri());
+    pool = c.pool;
+    await migrate(c.db, { migrationsFolder: "drizzle" });
+    const sessions = createSessionStore(c.db);
+    const users = createUserStore(c.db);
+    rsa = await generateKeyPair("RS256");
+    const ec = await generateKeyPair("ES256");
+    const keys = createLocalJWKSet({
+      keys: [
+        { ...(await exportJWK(rsa.publicKey)), kid: "test", alg: "RS256" },
+      ],
+    });
+    const providers = createProviders(
+      {
+        siteUrl: "https://erg.test",
+        apple: {
+          nativeClientId: "native.app",
+          webClientId: "web.app",
+          teamId: "TEAM",
+          keyId: "KEY",
+          key: ec.privateKey,
+        },
+        google: {
+          nativeClientId: "google.native",
+          webClientId: "google.web",
+          clientSecret: "secret",
+        },
+      },
+      {
+        appleKeys: keys,
+        googleKeys: keys,
+        fetch: async (_url, init) => {
+          const code = new URLSearchParams(String(init?.body)).get("code")!;
+          const tx = await pool.connect();
+          try {
+            await tx.query("BEGIN");
+            await tx.query("SELECT id FROM auth_attempts FOR UPDATE NOWAIT");
+            await tx.query("ROLLBACK");
+            exchangeOutsideLock = true;
+          } finally {
+            tx.release();
+          }
+          return Response.json({
+            id_token: codes.get(code),
+            refresh_token: "private-refresh",
+          });
+        },
+      },
+    );
+    freshApp = async () => {
+      attempts = createAttempts(pool);
+      await attempts.sweep();
+      const routes = createFrontDoorRoutes({
+        attempts,
+        providers,
+        sessions,
+        siteUrl: "https://erg.test",
+      });
+      return createApp(
+        baseDeps({
+          siteUrl: "https://erg.test",
+          sessions,
+          users,
+          frontDoor: { ...routes, attempts, providers, close: () => {} },
+          oauth: {
+            authorizationUrl: async () => ({
+              url: "https://accounts.google.com/authorize",
+              cookiePayload: "legacy-state",
+            }),
+            callbackClaims: async () => {
+              throw new Error("No legacy callback in this fixture");
+            },
+          },
+          nativeVerifier: async () => ({
+            sub: "legacy",
+            email: "outside@allowlist.test",
+            emailVerified: true,
+            name: "Legacy",
+          }),
+        }),
+      );
+    };
+  });
+  afterAll(async () => {
+    await pool?.end();
+    await container?.stop();
+  });
+  beforeEach(async () => {
+    vi.restoreAllMocks();
+    await pool.query("TRUNCATE users,auth_attempts CASCADE");
+    codes.clear();
+    exchangeOutsideLock = false;
+    app = await freshApp();
+  });
+  it.each(["new", "legacy-native", "legacy-web"])(
+    "anonymous start request 121 is rejected after 120 shared admissions (%s)",
+    async (first) => {
+      // Independent spec literals: never derive these bounds from the limiter.
+      const initial =
+        first === "legacy-native"
+          ? await request(app)
+              .post("/api/auth/native")
+              .send({ idToken: "legacy-proof" })
+          : first === "legacy-web"
+            ? await request(app).get("/api/auth/signin")
+            : await request(app)
+                .post("/api/auth/native/attempts")
+                .send({ purpose: "signin", provider: "apple" });
+      expect(initial.status, "request 1").toBe(
+        first === "legacy-web" ? 302 : 200,
+      );
+      for (let ordinal = 2; ordinal <= 120; ordinal++) {
+        const surface = ordinal % 2 === 0 ? "native" : "web";
+        const admitted = await request(app)
+          .post(`/api/auth/${surface}/attempts`)
+          .send({ purpose: "signin", provider: "apple" });
+        expect(admitted.status, `request ${ordinal}`).toBe(200);
+        expect(admitted.body.outcome).toBe("authorize");
+      }
+      const resident = first === "new" ? 120 : 119;
+      expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
+        resident,
+      );
+      const denied = await request(app)
+        .post("/api/auth/native/attempts")
+        .send({ purpose: "signin", provider: "apple" });
+      expect(denied.status, "request 121").toBe(429);
+      expect(denied.body).toStrictEqual({ error: "rate_limited" });
+      const web = await request(app)
+        .post("/api/auth/web/attempts")
+        .send({ purpose: "signin", provider: "apple" });
+      const legacyNative = await request(app)
+        .post("/api/auth/native")
+        .send({ idToken: "legacy-proof" });
+      const legacyWeb = await request(app).get("/api/auth/signin");
+      for (const response of [web, legacyNative, legacyWeb]) {
+        expect(response.status).toBe(429);
+        expect(response.body).toStrictEqual({ error: "rate_limited" });
+      }
+      expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
+        resident,
+      );
+      expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(
+        first === "legacy-native" ? 1 : 0,
+      );
+      expect(exchangeOutsideLock).toBe(false);
+    },
+  );
+  async function jwt(nonce: string, audience: string, sub = "apple") {
+    return new SignJWT({
+      sub,
+      nonce,
+      email: "relay@privaterelay.appleid.com",
+      email_verified: true,
+    })
+      .setIssuer("https://appleid.apple.com")
+      .setAudience(audience)
+      .setIssuedAt()
+      .setExpirationTime("5m")
+      .setProtectedHeader({ alg: "RS256", kid: "test" })
+      .sign(rsa.privateKey);
+  }
+  it("native producer stops at confirmation then creates a usable session, never returns Apple grant", async () => {
+    const begin = await request(app)
+      .post("/api/auth/native/attempts")
+      .send({ purpose: "signin", provider: "apple" });
+    expect(begin.status).toBe(200);
+    const b = begin.body;
+    const token = await jwt(b.nonce, "native.app");
+    codes.set("code", token);
+    const proof = await request(app)
+      .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
+      .send({
+        bindingSecret: b.bindingSecret,
+        state: b.state,
+        idToken: token,
+        authorizationCode: "code",
+      });
+    expect(proof.body.outcome).toBe("confirm");
+    expect(exchangeOutsideLock).toBe(true);
+    const confirm = await request(app)
+      .post(`/api/auth/native/attempts/${b.attemptId}/confirm`)
+      .send({ bindingSecret: b.bindingSecret });
+    expect(confirm.status).toBe(200);
+    expect(confirm.body.outcome).toBe("signed_in");
+    expect(JSON.stringify(confirm.body)).not.toContain("private-refresh");
+    const me = await request(app)
+      .get("/api/me")
+      .auth(confirm.body.token, { type: "bearer" });
+    expect(me.body.user.email).toBe("relay@privaterelay.appleid.com");
+  });
+  it("Apple form_post reaches callback before origin check but requires binding and exact state", async () => {
+    const begin = await request(app)
+      .post("/api/auth/web/attempts")
+      .set("Origin", "https://erg.test")
+      .send({ purpose: "signin", provider: "apple" });
+    const b = begin.body;
+    const cookie = begin.headers["set-cookie"][0].split(";")[0];
+    expect(begin.headers["set-cookie"][0]).toContain("SameSite=None");
+    const token = await jwt(b.nonce, "web.app");
+    codes.set("code", token);
+    const missing = await request(app)
+      .post("/api/auth/apple/callback")
+      .set("Origin", "https://appleid.apple.com")
+      .type("form")
+      .send({ state: b.state, code: "code", id_token: token });
+    expect(missing.status).toBe(303);
+    expect(missing.headers.location).toContain("authError=");
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(1);
+    const callback = await request(app)
+      .post("/api/auth/apple/callback")
+      .set("Origin", "https://appleid.apple.com")
+      .set("Cookie", cookie)
+      .type("form")
+      .send({
+        state: b.state,
+        code: "code",
+        id_token: token,
+        user: JSON.stringify({
+          name: { firstName: "First", lastName: "Name" },
+        }),
+      });
+    expect(callback.status).toBe(303);
+    expect(callback.headers.location).toBe(`/?authAttempt=${b.attemptId}`);
+    const resume = await request(app)
+      .get(`/api/auth/web/attempts/${b.attemptId}`)
+      .set("Cookie", cookie);
+    expect(resume.body.profile.name).toBe("First Name");
+    const blocked = await request(app)
+      .post(`/api/auth/web/attempts/${b.attemptId}/confirm`)
+      .set("Origin", "https://evil.test")
+      .set("Cookie", cookie)
+      .send({});
+    expect(blocked.status).toBe(403);
+    const confirm = await request(app)
+      .post(`/api/auth/web/attempts/${b.attemptId}/confirm`)
+      .set("Origin", "https://erg.test")
+      .set("Cookie", cookie)
+      .send({});
+    expect(confirm.body.outcome).toBe("signed_in");
+    expect(confirm.body).not.toHaveProperty("token");
+    expect(
+      (confirm.headers["set-cookie"] as unknown as string[]).some(
+        (v: string) => v.includes("erg_session=") && v.includes("SameSite=Lax"),
+      ),
+    ).toBe(true);
+  });
+  it("bound provider cancellation erases attempt while unbound cancellation cannot", async () => {
+    const begin = await request(app)
+      .post("/api/auth/web/attempts")
+      .send({ purpose: "signin", provider: "apple" });
+    const b = begin.body;
+    const cookie = begin.headers["set-cookie"][0].split(";")[0];
+    const unbound = await request(app)
+      .post("/api/auth/apple/callback")
+      .type("form")
+      .send({ state: b.state, error: "user_cancelled_authorize" });
+    expect(unbound.headers.location).toContain("authError=");
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(1);
+    const cancelled = await request(app)
+      .post("/api/auth/apple/callback")
+      .set("Cookie", cookie)
+      .type("form")
+      .send({ state: b.state, error: "user_cancelled_authorize" });
+    expect(cancelled.headers.location).toBe(
+      "/?authResult=cancelled&authPurpose=signin&authProvider=apple",
+    );
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
+  });
+  it("legacy native Google keeps direct-create token response with allowlist empty", async () => {
+    const response = await request(app)
+      .post("/api/auth/native")
+      .send({ idToken: "legacy-proof" });
+    expect(response.status).toBe(200);
+    expect(response.body.token).toStrictEqual(expect.any(String));
+    expect(response.body).not.toHaveProperty("outcome");
+    expect(response.body.user.email).toBe("outside@allowlist.test");
+  });
+  async function googleJwt(
+    nonce: string,
+    sub = "google",
+    audience = "google.native",
+  ) {
+    return new SignJWT({
+      sub,
+      nonce,
+      email: "original@test",
+      email_verified: true,
+      name: "Original",
+    })
+      .setIssuer("https://accounts.google.com")
+      .setAudience(audience)
+      .setIssuedAt()
+      .setExpirationTime("5m")
+      .setProtectedHeader({ alg: "RS256", kid: "test" })
+      .sign(rsa.privateKey);
+  }
+  it("native Google signup, fresh Google proof and Apple target finalize one account", async () => {
+    const start = (
+      await request(app)
+        .post("/api/auth/native/attempts")
+        .send({ purpose: "signin", provider: "google" })
+    ).body;
+    const pending = await request(app)
+      .post(`/api/auth/native/attempts/${start.attemptId}/proof`)
+      .send({
+        bindingSecret: start.bindingSecret,
+        state: start.state,
+        idToken: await googleJwt(start.nonce),
+      });
+    expect(pending.body.outcome).toBe("confirm");
+    const signed = (
+      await request(app)
+        .post(`/api/auth/native/attempts/${start.attemptId}/confirm`)
+        .send({ bindingSecret: start.bindingSecret })
+    ).body;
+    const begin = await request(app)
+      .post("/api/auth/native/attempts")
+      .auth(signed.token, { type: "bearer" })
+      .send({ purpose: "link", provider: "apple" });
+    expect(begin.status).toBe(200);
+    const b = begin.body;
+    expect(b.stage).toBe("reauth");
+    expect(b.provider).toBe("google");
+    const target = (
+      await request(app)
+        .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
+        .send({
+          bindingSecret: b.bindingSecret,
+          state: b.state,
+          idToken: await googleJwt(b.nonce),
+        })
+    ).body;
+    expect(target.stage).toBe("target");
+    expect(target.nonce).not.toBe(b.nonce);
+    const token = await jwt(target.nonce, "native.app");
+    codes.set("target", token);
+    const ready = await request(app)
+      .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
+      .send({
+        bindingSecret: b.bindingSecret,
+        state: target.state,
+        idToken: token,
+        authorizationCode: "target",
+        name: "Added Provider",
+      });
+    expect(ready.body.outcome).toBe("link_ready");
+    const finalized = await request(app)
+      .post(`/api/auth/native/attempts/${b.attemptId}/finalize`)
+      .auth(signed.token, { type: "bearer" })
+      .send({ bindingSecret: b.bindingSecret });
+    expect(finalized.body).toStrictEqual({ outcome: "linked" });
+    const methods = await request(app)
+      .get("/api/auth/methods")
+      .auth(signed.token, { type: "bearer" });
+    expect(methods.body).toStrictEqual({ apple: true, google: true });
+    const me = await request(app)
+      .get("/api/me")
+      .auth(signed.token, { type: "bearer" });
+    expect(me.body.user).toStrictEqual(signed.user);
+  });
+  it.each([
+    {},
+    { purpose: "wrong", provider: "apple" },
+    { purpose: "signin", provider: "other" },
+  ])("rejects malformed begin without minting %#", async (body) => {
+    const res = await request(app).post("/api/auth/native/attempts").send(body);
+    expect(res.status).toBe(400);
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
+  });
+  it("wrong state leaves operation intact, native cancellation erases it, replay expires", async () => {
+    const b = (
+      await request(app)
+        .post("/api/auth/native/attempts")
+        .send({ purpose: "signin", provider: "apple" })
+    ).body;
+    const wrong = await request(app)
+      .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
+      .send({
+        bindingSecret: b.bindingSecret,
+        state: "wrong",
+        idToken: "token",
+        authorizationCode: "code",
+      });
+    expect(wrong.status).toBe(401);
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(1);
+    const cancelled = await request(app)
+      .post(`/api/auth/native/attempts/${b.attemptId}/cancel`)
+      .send({ bindingSecret: b.bindingSecret });
+    expect(cancelled.status).toBe(204);
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
+    const replay = await request(app)
+      .post(`/api/auth/native/attempts/${b.attemptId}/confirm`)
+      .send({ bindingSecret: b.bindingSecret });
+    expect(replay.status).toBe(410);
+  });
+  it("web two-proof callback only stages until current-session same-origin finalize", async () => {
+    const start = await request(app)
+      .post("/api/auth/web/attempts")
+      .set("Origin", "https://erg.test")
+      .send({ purpose: "signin", provider: "google" });
+    const s = start.body;
+    const startCookie = start.headers["set-cookie"][0].split(";")[0];
+    codes.set(
+      "google-web",
+      await googleJwt(s.nonce, "google-web", "google.web"),
+    );
+    const callback = await request(app)
+      .get("/api/auth/google/callback")
+      .query({ state: s.state, code: "google-web" })
+      .set("Cookie", startCookie);
+    expect(callback.headers.location).toBe(`/?authAttempt=${s.attemptId}`);
+    const signed = await request(app)
+      .post(`/api/auth/web/attempts/${s.attemptId}/confirm`)
+      .set("Origin", "https://erg.test")
+      .set("Cookie", startCookie)
+      .send({});
+    const sessionCookie = (signed.headers["set-cookie"] as unknown as string[])
+      .find((c) => c.startsWith("erg_session="))!
+      .split(";")[0];
+    const begun = await request(app)
+      .post("/api/auth/web/attempts")
+      .set("Origin", "https://erg.test")
+      .set("Cookie", sessionCookie)
+      .send({ purpose: "link", provider: "apple" });
+    expect(begun.status).toBe(200);
+    const b = begun.body;
+    const binding = begun.headers["set-cookie"][0].split(";")[0];
+    codes.set(
+      "reauth-google",
+      await googleJwt(b.nonce, "google-web", "google.web"),
+    );
+    const reauth = await request(app)
+      .get("/api/auth/google/callback")
+      .set("Cookie", binding)
+      .query({ state: b.state, code: "reauth-google" });
+    expect(reauth.headers.location).toBe(`/?authAttempt=${b.attemptId}`);
+    const resumed = await request(app)
+      .get(`/api/auth/web/attempts/${b.attemptId}`)
+      .set("Cookie", binding);
+    expect(resumed.body.stage).toBe("target");
+    const target = resumed.body;
+    const token = await jwt(target.nonce, "web.app");
+    codes.set("target-web", token);
+    const apple = await request(app)
+      .post("/api/auth/apple/callback")
+      .set("Origin", "https://appleid.apple.com")
+      .set("Cookie", binding)
+      .type("form")
+      .send({ state: target.state, code: "target-web", id_token: token });
+    expect(apple.headers.location).toBe(`/?authAttempt=${b.attemptId}`);
+    expect(
+      (await pool.query("SELECT apple_sub FROM users")).rows,
+    ).toStrictEqual([{ apple_sub: null }]);
+    const ready = await request(app)
+      .get(`/api/auth/web/attempts/${b.attemptId}`)
+      .set("Cookie", binding);
+    expect(ready.body.outcome).toBe("link_ready");
+    const current = (
+      await request(app).post("/api/auth/native").send({ idToken: "other" })
+    ).body.token;
+    const changed = await request(app)
+      .post(`/api/auth/web/attempts/${b.attemptId}/finalize`)
+      .set("Origin", "https://erg.test")
+      .set("Cookie", binding)
+      .auth(current, { type: "bearer" })
+      .send({});
+    expect(changed.status).toBe(409);
+    expect(changed.body.error).toBe("account_changed");
+    const complete = await request(app)
+      .post(`/api/auth/web/attempts/${b.attemptId}/finalize`)
+      .set("Origin", "https://erg.test")
+      .set("Cookie", [binding, sessionCookie])
+      .send({});
+    expect(complete.body).toStrictEqual({ outcome: "linked" });
+  });
+  it.each([
+    { state: "" },
+    { idToken: "" },
+    { authorizationCode: "" },
+    { authorizationCode: undefined },
+    { name: "x".repeat(201) },
+  ])(
+    "native malformed proof changes no account or attempt %#",
+    async (override) => {
+      const b = (
+        await request(app)
+          .post("/api/auth/native/attempts")
+          .send({ purpose: "signin", provider: "apple" })
+      ).body;
+      const res = await request(app)
+        .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
+        .send({
+          bindingSecret: b.bindingSecret,
+          state: b.state,
+          idToken: "token",
+          authorizationCode: "code",
+          ...override,
+        });
+      expect(res.status).toBe(400);
+      expect(
+        (await pool.query("SELECT stage FROM auth_attempts")).rows,
+      ).toStrictEqual([{ stage: "authorize" }]);
+      expect((await pool.query("SELECT id FROM users")).rowCount).toBe(0);
+    },
+  );
+  it("native owned failed exchange erases its claimed snapshot", async () => {
+    const begin = await request(app)
+      .post("/api/auth/native/attempts")
+      .send({ purpose: "signin", provider: "apple" });
+    const b = begin.body;
+    const failed = await request(app)
+      .post(`/api/auth/native/attempts/${b.attemptId}/proof`)
+      .send({
+        bindingSecret: b.bindingSecret,
+        state: b.state,
+        idToken: "invalid",
+        authorizationCode: "code",
+      });
+    expect(failed.status).toBe(401);
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
+  });
+  it("failed cleanup preserves the live attempt cookie", async () => {
+    const begin = await request(app)
+      .post("/api/auth/web/attempts")
+      .send({ purpose: "signin", provider: "apple" });
+    const b = begin.body;
+    const binding = begin.headers["set-cookie"][0].split(";")[0];
+    vi.spyOn(attempts, "discard").mockRejectedValue(
+      new Error("database unavailable"),
+    );
+    const failed = await request(app)
+      .post("/api/auth/apple/callback")
+      .set("Cookie", binding)
+      .type("form")
+      .send({ state: b.state, error: "access_denied" });
+    expect(failed.status).toBe(303);
+    expect(failed.headers["set-cookie"]).toBeUndefined();
+    expect(
+      (await pool.query("SELECT stage FROM auth_attempts")).rows,
+    ).toStrictEqual([{ stage: "authorize" }]);
+  });
+  it("finalize can commit identity and grant before its HTTP response is lost", async () => {
+    const google = {
+      sub: "legacy",
+      email: "original@test",
+      emailVerified: true,
+      name: "Original",
+    };
+    const signed = await attempts.legacyGoogle(google);
+    const sessionId = (await pool.query("SELECT id FROM sessions")).rows[0]
+      .id as string;
+    const b = await attempts.begin({
+      surface: "native",
+      purpose: "link",
+      targetProvider: "apple",
+      originalSessionId: sessionId,
+    });
+    const target = await attempts.accept(
+      await attempts.claim(b.attempt),
+      google,
+    );
+    await attempts.accept(await attempts.claim(target.attempt!), {
+      sub: "added-apple",
+      email: "relay@test",
+      emailVerified: true,
+      name: "Added",
+      grant: { clientId: "native.app", refreshToken: "retained-grant" },
+    });
+    // Suppress delivery only after the real route has awaited its real commit.
+    const json = app.response.json;
+    const delivery = vi
+      .spyOn(app.response, "json")
+      .mockImplementation(function (this: ExpressResponse, body: unknown) {
+        if ((body as { outcome?: string }).outcome === "linked") {
+          this.destroy();
+          return this;
+        }
+        return json.call(this, body);
+      });
+    const failure = await request(app)
+      .post(`/api/auth/native/attempts/${b.attempt.id}/finalize`)
+      .auth(signed.token!, { type: "bearer" })
+      .send({ bindingSecret: b.bindingSecret })
+      .then(
+        () => null,
+        (error: unknown) => error,
+      );
+    delivery.mockRestore();
+    expect(failure).toBeInstanceOf(Error);
+    expect((failure as Error).message).toMatch(/socket hang up|aborted/);
+    const methods = await request(app)
+      .get("/api/auth/methods")
+      .auth(signed.token!, { type: "bearer" });
+    expect(methods.body).toStrictEqual({ apple: true, google: true });
+    expect(
+      (await pool.query("SELECT refresh_token FROM apple_grants")).rows,
+    ).toStrictEqual([{ refresh_token: "retained-grant" }]);
+    expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(0);
+  });
+  it.each([
+    ["signin", "success"],
+    ["signin", "cancel"],
+    ["signin", "provider-error"],
+    ["signin", "malformed"],
+    ["link", "success"],
+    ["link", "cancel"],
+    ["link", "provider-error"],
+    ["link", "malformed"],
+  ] as const)(
+    "stale %s callback (%s) cannot erase the winning stage or clear its cookie",
+    async (purpose, loserKind) => {
+      let sessionToken = "";
+      if (purpose === "link") {
+        const start = (
+          await request(app)
+            .post("/api/auth/native/attempts")
+            .send({ purpose: "signin", provider: "apple" })
+        ).body;
+        const token = await jwt(start.nonce, "native.app");
+        codes.set("setup", token);
+        await request(app)
+          .post(`/api/auth/native/attempts/${start.attemptId}/proof`)
+          .send({
+            bindingSecret: start.bindingSecret,
+            state: start.state,
+            idToken: token,
+            authorizationCode: "setup",
+          });
+        sessionToken = (
+          await request(app)
+            .post(`/api/auth/native/attempts/${start.attemptId}/confirm`)
+            .send({ bindingSecret: start.bindingSecret })
+        ).body.token;
+      }
+      const beginRequest = request(app)
+        .post("/api/auth/web/attempts")
+        .send({ purpose, provider: purpose === "signin" ? "apple" : "google" });
+      if (sessionToken)
+        beginRequest.set("Cookie", `erg_session=${sessionToken}`);
+      const begin = await beginRequest;
+      expect(begin.status).toBe(200);
+      const b = begin.body;
+      const binding = begin.headers["set-cookie"][0].split(";")[0];
+      const token = await jwt(b.nonce, "web.app");
+      codes.set("winner", token);
+      const valid = { state: b.state, code: "winner", id_token: token };
+      const loserBody =
+        loserKind === "cancel"
+          ? { state: b.state, error: "access_denied" }
+          : loserKind === "provider-error"
+            ? { state: b.state, error: "provider_failed" }
+            : loserKind === "malformed"
+              ? { ...valid, code: "" }
+              : valid;
+      const firstRead = signal();
+      const bothRead = signal();
+      const releaseLoser = signal();
+      const read = attempts.read.bind(attempts);
+      let reads = 0;
+      const heldRead = vi
+        .spyOn(attempts, "read")
+        .mockImplementation(async (...args) => {
+          const snapshot = await read(...args);
+          reads++;
+          if (reads === 1) {
+            firstRead.resolve();
+            await bothRead.promise;
+          } else if (reads === 2) {
+            bothRead.resolve();
+            await releaseLoser.promise;
+          }
+          return snapshot;
+        });
+      const post = (body: typeof loserBody) =>
+        request(app)
+          .post("/api/auth/apple/callback")
+          .set("Origin", "https://appleid.apple.com")
+          .set("Cookie", binding)
+          .type("form")
+          .send(body)
+          .then((response) => response);
+      const winner = post(valid);
+      await firstRead.promise;
+      const loser = post(loserBody);
+      const won = await winner;
+      const snapshot = (
+        await pool.query(
+          "SELECT stage,version,apple_refresh_token IS NOT NULL AS grant FROM auth_attempts",
+        )
+      ).rows;
+      releaseLoser.resolve();
+      const lost = await loser;
+      heldRead.mockRestore();
+      expect(won.headers.location).toBe(`/?authAttempt=${b.attemptId}`);
+      expect(snapshot).toStrictEqual([
+        {
+          stage: purpose === "signin" ? "confirm" : "target_authorize",
+          version: 3,
+          grant: true,
+        },
+      ]);
+      expect(
+        (
+          await pool.query(
+            "SELECT stage,version,apple_refresh_token IS NOT NULL AS grant FROM auth_attempts",
+          )
+        ).rows,
+      ).toStrictEqual(snapshot);
+      expect(lost.headers["set-cookie"]).toBeUndefined();
+      expect(lost.headers.location).toContain("authError=");
+      const resume = await request(app)
+        .get(`/api/auth/web/attempts/${b.attemptId}`)
+        .set("Cookie", binding);
+      expect(resume.status).toBe(200);
+      if (purpose === "signin") {
+        const confirmed = await request(app)
+          .post(`/api/auth/web/attempts/${b.attemptId}/confirm`)
+          .set("Cookie", binding)
+          .set("Origin", "https://erg.test")
+          .send({});
+        sessionToken = (confirmed.headers["set-cookie"] as unknown as string[])
+          .find((value) => value.startsWith("erg_session="))!
+          .split(";")[0]
+          .split("=")[1];
+      } else {
+        codes.set(
+          "target",
+          await googleJwt(resume.body.nonce, "added-google", "google.web"),
+        );
+        await request(app)
+          .get("/api/auth/google/callback")
+          .set("Cookie", binding)
+          .query({ state: resume.body.state, code: "target" });
+        await request(app)
+          .post(`/api/auth/web/attempts/${b.attemptId}/finalize`)
+          .set("Cookie", binding)
+          .set("Origin", "https://erg.test")
+          .auth(sessionToken, { type: "bearer" })
+          .send({});
+      }
+      const methods = await request(app)
+        .get("/api/auth/methods")
+        .auth(sessionToken, { type: "bearer" });
+      expect(methods.status).toBe(200);
+      expect(methods.body).toStrictEqual({
+        apple: true,
+        google: purpose === "link",
+      });
+      expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
+        0,
+      );
+    },
+  );
+  it.each(["cancel", "provider-error", "malformed", "exchange"])(
+    "owned callback %s erases only its failed operation and cookie",
+    async (kind) => {
+      const begin = await request(app)
+        .post("/api/auth/web/attempts")
+        .send({ purpose: "signin", provider: "apple" });
+      const b = begin.body;
+      const binding = begin.headers["set-cookie"][0].split(";")[0];
+      const body =
+        kind === "cancel"
+          ? { state: b.state, error: "access_denied" }
+          : kind === "provider-error"
+            ? { state: b.state, error: "provider_failed" }
+            : {
+                state: b.state,
+                code: kind === "malformed" ? "" : "code",
+                id_token: "invalid",
+              };
+      const failed = await request(app)
+        .post("/api/auth/apple/callback")
+        .set("Cookie", binding)
+        .type("form")
+        .send(body);
+      expect(failed.status).toBe(303);
+      expect(failed.headers["set-cookie"][0]).toContain("Max-Age=0");
+      expect((await pool.query("SELECT id FROM auth_attempts")).rowCount).toBe(
+        0,
+      );
+      expect((await pool.query("SELECT id FROM sessions")).rowCount).toBe(0);
+    },
+  );
+  it("wrong callback provider cannot consume valid operation; old callback cannot cancel confirmation", async () => {
+    const begin = await request(app)
+      .post("/api/auth/web/attempts")
+      .send({ purpose: "signin", provider: "apple" });
+    const b = begin.body;
+    const cookie = begin.headers["set-cookie"][0].split(";")[0];
+    const wrong = await request(app)
+      .get("/api/auth/google/callback")
+      .set("Cookie", cookie)
+      .query({ state: b.state, error: "access_denied" });
+    expect(wrong.headers.location).toContain("authError=invalid_proof");
+    expect(
+      (await pool.query("SELECT stage FROM auth_attempts")).rows,
+    ).toStrictEqual([{ stage: "authorize" }]);
+    const token = await jwt(b.nonce, "web.app");
+    codes.set("confirm", token);
+    await request(app)
+      .post("/api/auth/apple/callback")
+      .set("Cookie", cookie)
+      .type("form")
+      .send({ state: b.state, code: "confirm", id_token: token });
+    const stale = await request(app)
+      .post("/api/auth/apple/callback")
+      .set("Cookie", cookie)
+      .type("form")
+      .send({ state: b.state, error: "user_cancelled_authorize" });
+    expect(stale.headers.location).toContain("authError=attempt_expired");
+    expect(
+      (await pool.query("SELECT stage FROM auth_attempts")).rows,
+    ).toStrictEqual([{ stage: "confirm" }]);
+  });
+});
diff --git a/app/server/auth/frontDoorRoutes.ts b/app/server/auth/frontDoorRoutes.ts
new file mode 100644
index 00000000..1df5a349
--- /dev/null
+++ b/app/server/auth/frontDoorRoutes.ts
@@ -0,0 +1,377 @@
+import { Router, type Request, type Response } from "express";
+import { stringifySetCookie } from "cookie";
+import { rateLimit } from "express-rate-limit";
+import type {
+  AuthProvider,
+  AuthPurpose,
+  AuthStep,
+  SignedIn,
+} from "../../shared/auth.js";
+import {
+  type Attempt,
+  type Attempts,
+  type AttemptResult,
+  type Surface,
+  attemptProvider,
+} from "./attempts.js";
+import {
+  AuthFailure,
+  authStatus,
+  record,
+  requiredText,
+} from "./frontDoorErrors.js";
+import { getCookie, sessionCookie } from "./cookies.js";
+import { requireUser } from "./middleware.js";
+import type { SessionStore } from "./sessions.js";
+import type { Providers, ProviderProof } from "./providers.js";
+
+const cookieName = "erg_auth_attempt";
+function cookie(value: string, maxAge = 300) {
+  return stringifySetCookie({
+    name: cookieName,
+    value,
+    httpOnly: true,
+    secure: true,
+    sameSite: "none",
+    path: "/api/auth",
+    maxAge,
+  });
+}
+function webBinding(req: Request): { id: string; bindingSecret: string } {
+  const raw = requiredText(getCookie(req.headers.cookie, cookieName), 128);
+  const parts = raw.split(".");
+  if (
+    parts.length !== 2 ||
+    !/^[0-9a-f-]{36}$/.test(parts[0]) ||
+    !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
+  )
+    throw new AuthFailure("invalid_proof");
+  return { id: parts[0], bindingSecret: parts[1] };
+}
+function id(req: Request) {
+  const value = requiredText(req.params.id, 36);
+  if (
+    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
+      value,
+    )
+  )
+    throw new AuthFailure("invalid_request");
+  return value;
+}
+function requestBinding(req: Request, surface: Surface) {
+  if (surface === "web") {
+    const b = webBinding(req);
+    if (b.id !== id(req)) throw new AuthFailure("invalid_proof");
+    return b.bindingSecret;
+  }
+  return requiredText(record(req.body).bindingSecret, 128);
+}
+function failure(res: Response, error: unknown) {
+  const code = error instanceof AuthFailure ? error.code : "signin_failed";
+  res.status(authStatus[code]).json({ error: code });
+}
+export function createFrontDoorRoutes(deps: {
+  attempts: Attempts;
+  providers: Providers;
+  sessions: SessionStore;
+  siteUrl: string;
+}) {
+  const { attempts, providers, sessions } = deps;
+  const router = Router();
+  const admission = rateLimit({
+    windowMs: 60000,
+    limit: 120,
+    keyGenerator: () => "anonymous-auth",
+    standardHeaders: "draft-8",
+    legacyHeaders: false,
+    passOnStoreError: false,
+    handler: (_req, res) => {
+      res.status(429).json({ error: "rate_limited" });
+    },
+  });
+  function context(a: Attempt) {
+    return {
+      provider: attemptProvider(a),
+      surface: a.surface,
+      nonce: a.nonce,
+      state: a.state,
+      bindingHash: a.bindingHash,
+    };
+  }
+  async function view(a: Attempt): Promise<AuthStep> {
+    const base = {
+      attemptId: a.id,
+      purpose: a.purpose,
+      targetProvider: a.targetProvider,
+      expiresAt: a.expiresAt.toISOString(),
+    };
+    if (a.stage === "confirm")
+      return {
+        ...base,
+        outcome: "confirm",
+        profile: { email: a.verifiedEmail!, name: a.verifiedName! },
+      };
+    if (a.stage === "link_ready") return { ...base, outcome: "link_ready" };
+    if (
+      !["authorize", "reauth_authorize", "target_authorize"].includes(a.stage)
+    )
+      throw new AuthFailure("attempt_expired");
+    return {
+      ...base,
+      outcome: "authorize",
+      provider: attemptProvider(a),
+      stage:
+        a.stage === "authorize"
+          ? "signin"
+          : a.stage === "reauth_authorize"
+            ? "reauth"
+            : "target",
+      nonce: a.nonce,
+      state: a.state,
+      ...(a.surface === "web"
+        ? { authorizationUrl: await providers.authorizationUrl(context(a)) }
+        : {}),
+    };
+  }
+  function signed(res: Response, s: SignedIn, surface: Surface) {
+    if (surface === "native") return s;
+    res.append("Set-Cookie", sessionCookie(s.token!, new Date(s.expiresAt)));
+    const { token: _token, ...projection } = s;
+    return projection;
+  }
+  async function result(res: Response, r: AttemptResult, surface: Surface) {
+    if (r.signedIn) {
+      if (surface === "web") res.append("Set-Cookie", cookie("", 0));
+      return signed(res, r.signedIn, surface);
+    }
+    if (r.linked) {
+      if (surface === "web") res.append("Set-Cookie", cookie("", 0));
+      return { outcome: "linked" };
+    }
+    return view(r.attempt!);
+  }
+  for (const surface of ["native", "web"] as const) {
+    const prefix = `/api/auth/${surface}/attempts`;
+    router.post(
+      prefix,
+      admission,
+      async (req, res, next) => {
+        try {
+          if (record(req.body).purpose === "link") {
+            await requireUser(sessions)(req, res, next);
+          } else next();
+        } catch (error) {
+          failure(res, error);
+        }
+      },
+      async (req, res) => {
+        try {
+          const body = record(req.body);
+          if (
+            (body.provider !== "apple" && body.provider !== "google") ||
+            (body.purpose !== "signin" && body.purpose !== "link")
+          )
+            throw new AuthFailure("invalid_request");
+          if (
+            !providers.available(body.provider, surface) ||
+            (body.purpose === "link" &&
+              !providers.available(
+                body.provider === "apple" ? "google" : "apple",
+                surface,
+              ))
+          )
+            throw new AuthFailure("unavailable");
+          if (
+            body.purpose === "link" &&
+            req.authVia !== (surface === "native" ? "bearer" : "cookie")
+          )
+            throw new AuthFailure("account_changed");
+          let replace: { id: string; bindingSecret: string } | undefined;
+          if (surface === "web" && getCookie(req.headers.cookie, cookieName)) {
+            try {
+              replace = webBinding(req);
+            } catch {
+              /* A malformed old cookie cannot grant replacement authority. */
+            }
+          }
+          const b = await attempts.begin({
+            surface,
+            purpose: body.purpose,
+            targetProvider: body.provider,
+            originalSessionId: req.sessionId,
+            replace,
+          });
+          if (surface === "web")
+            res.append(
+              "Set-Cookie",
+              cookie(`${b.attempt.id}.${b.bindingSecret}`),
+            );
+          res.json({
+            ...(await view(b.attempt)),
+            ...(surface === "native" ? { bindingSecret: b.bindingSecret } : {}),
+          });
+        } catch (error) {
+          failure(res, error);
+        }
+      },
+    );
+    for (const action of ["confirm", "finalize", "cancel"] as const)
+      router.post(
+        `${prefix}/:id/${action}`,
+        ...(action === "finalize" ? [requireUser(sessions)] : []),
+        async (req, res) => {
+          try {
+            const secret = requestBinding(req, surface);
+            const attemptId = id(req);
+            if (action === "cancel") {
+              await attempts.cancel(attemptId, secret, surface);
+              if (surface === "web") res.append("Set-Cookie", cookie("", 0));
+              res.status(204).end();
+              return;
+            }
+            const a = await attempts.read(attemptId, secret, surface);
+            const r =
+              action === "confirm"
+                ? await attempts.confirm(a)
+                : await attempts.finalize(a, req.sessionId!);
+            res.json(await result(res, r, surface));
+          } catch (error) {
+            failure(res, error);
+          }
+        },
+      );
+  }
+  router.get("/api/auth/web/attempts/:id", async (req, res) => {
+    try {
+      res.json(
+        await view(
+          await attempts.read(id(req), requestBinding(req, "web"), "web"),
+        ),
+      );
+    } catch (error) {
+      failure(res, error);
+    }
+  });
+  router.post("/api/auth/native/attempts/:id/proof", async (req, res) => {
+    let claimed: Attempt | undefined;
+    try {
+      const body = record(req.body);
+      const secret = requestBinding(req, "native");
+      const owned = await attempts.read(id(req), secret, "native");
+      const state = requiredText(body.state, 128);
+      if (state !== owned.state) throw new AuthFailure("invalid_proof");
+      const proof: ProviderProof = {
+        state,
+        idToken: requiredText(body.idToken),
+        ...(body.authorizationCode === undefined
+          ? {}
+          : { authorizationCode: requiredText(body.authorizationCode, 4096) }),
+        ...(body.name === undefined
+          ? {}
+          : { name: requiredText(body.name, 200) }),
+      };
+      if (attemptProvider(owned) === "apple" && !proof.authorizationCode)
+        throw new AuthFailure("invalid_request");
+      claimed = await attempts.claim(owned);
+      const identity = await providers.verify(context(claimed), proof);
+      res.json(
+        await result(res, await attempts.accept(claimed, identity), "native"),
+      );
+    } catch (error) {
+      if (claimed) await discard(claimed);
+      failure(res, error);
+    }
+  });
+  router.get("/api/auth/methods", requireUser(sessions), async (req, res) => {
+    try {
+      res.json(await attempts.methods(req.user!.id));
+    } catch (error) {
+      failure(res, error);
+    }
+  });
+  // A cleanup failure must not clear the browser's still-live binding cookie.
+  async function discard(a: Attempt): Promise<boolean> {
+    try {
+      return await attempts.discard(a);
+    } catch {
+      return false;
+    }
+  }
+  async function callback(req: Request, res: Response, provider: AuthProvider) {
+    let owned: Attempt | undefined;
+    let binding: { id: string; bindingSecret: string } | undefined;
+    let purpose: AuthPurpose = "signin";
+    try {
+      binding = webBinding(req);
+      const a = await attempts.read(binding.id, binding.bindingSecret, "web");
+      const body = record(provider === "apple" ? req.body : req.query);
+      const state = requiredText(body.state, 128);
+      if (state !== a.state || attemptProvider(a) !== provider)
+        throw new AuthFailure("invalid_proof");
+      if (
+        !["authorize", "reauth_authorize", "target_authorize"].includes(a.stage)
+      )
+        throw new AuthFailure("attempt_expired");
+      owned = a;
+      purpose = a.purpose;
+      if (body.error !== undefined) {
+        if (
+          body.error !== "user_cancelled_authorize" &&
+          body.error !== "access_denied"
+        )
+          throw new AuthFailure("invalid_proof");
+        if (!(await discard(a))) throw new AuthFailure("attempt_expired");
+        res.append("Set-Cookie", cookie("", 0));
+        res.redirect(
+          303,
+          `/?authResult=cancelled&authPurpose=${purpose}&authProvider=${owned.targetProvider}`,
+        );
+        return;
+      }
+      const proof: ProviderProof = {
+        state,
+        authorizationCode: requiredText(body.code, 4096),
+      };
+      if (provider === "apple") {
+        proof.idToken = requiredText(body.id_token);
+        if (body.user !== undefined) {
+          const user = record(
+            JSON.parse(requiredText(body.user, 2048)) as unknown,
+          );
+          if (user.name !== undefined) {
+            const n = record(user.name);
+            proof.name = { givenName: n.firstName, familyName: n.lastName };
+          }
+        }
+      }
+      const claimed = await attempts.claim(a);
+      owned = claimed;
+      const verified = await providers.verify(context(claimed), proof);
+      const r = await attempts.accept(claimed, verified);
+      if (r.signedIn) {
+        signed(res, r.signedIn, "web");
+        res.append("Set-Cookie", cookie("", 0));
+        res.redirect(303, "/?authResult=signed_in");
+      } else {
+        res.append("Set-Cookie", cookie(`${a.id}.${binding.bindingSecret}`));
+        res.redirect(303, `/?authAttempt=${a.id}`);
+      }
+    } catch (error) {
+      if (owned && (await discard(owned)))
+        res.append("Set-Cookie", cookie("", 0));
+      const code = error instanceof AuthFailure ? error.code : "signin_failed";
+      res.redirect(
+        303,
+        `/?authError=${code}&authPurpose=${purpose}${owned ? `&authProvider=${owned.targetProvider}` : ""}`,
+      );
+    }
+  }
+  router.get("/api/auth/google/callback", (req, res) =>
+    callback(req, res, "google"),
+  );
+  return {
+    router,
+    appleCallback: (req: Request, res: Response) => callback(req, res, "apple"),
+    admission,
+  };
+}
diff --git a/app/server/auth/routes.ts b/app/server/auth/routes.ts
index a53139d3..1bf2bb2c 100644
--- a/app/server/auth/routes.ts
+++ b/app/server/auth/routes.ts
@@ -16,6 +16,7 @@ import type { SessionStore } from "./sessions.js";
 import type { UserStore } from "./users.js";
 
 export interface AuthDeps {
+  frontDoor?: import("./frontDoor.js").FrontDoor | null;
   sessions: SessionStore;
   users: UserStore;
   oauth: OAuthProvider | null;
@@ -31,8 +32,27 @@ export function createAuthRouter({
   nativeVerifier,
   allowlist,
   siteUrl,
+  frontDoor,
 }: AuthDeps): Router {
   const router = Router();
+  async function login(
+    claims: import("./google.js").Claims,
+  ): Promise<import("./signin.js").SignInResult> {
+    if (!frontDoor)
+      return signInWithClaims({ sessions, users, allowlist }, claims);
+    const signed = await frontDoor.attempts.legacyGoogle(claims);
+    return {
+      outcome: "ok",
+      user: signed.user,
+      token: signed.token!,
+      expiresAt: new Date(signed.expiresAt),
+    };
+  }
+
+  if (frontDoor) {
+    router.get("/api/auth/signin", frontDoor.admission);
+    router.post("/api/auth/native", frontDoor.admission);
+  }
 
   router.get("/api/auth/signin", async (_req, res) => {
     if (!oauth) {
@@ -78,10 +98,7 @@ export function createAuthRouter({
     }
 
     try {
-      const result = await signInWithClaims(
-        { sessions, users, allowlist },
-        claims,
-      );
+      const result = await login(claims);
       if (result.outcome === "denied") {
         res.setHeader("Set-Cookie", clear);
         res.redirect(`/?denied=${encodeURIComponent(result.email)}`);
@@ -119,10 +136,7 @@ export function createAuthRouter({
       return;
     }
     try {
-      const result = await signInWithClaims(
-        { sessions, users, allowlist },
-        claims,
-      );
+      const result = await login(claims);
       if (result.outcome === "denied") {
         res.status(403).json({ error: "denied", email: result.email });
         return;
diff --git a/app/server/index.ts b/app/server/index.ts
index 5dda15da..a02eedb0 100644
--- a/app/server/index.ts
+++ b/app/server/index.ts
@@ -1,4 +1,5 @@
 import { migrate } from "drizzle-orm/node-postgres/migrator";
+import { createFrontDoor, frontDoorConfig } from "./auth/frontDoor.js";
 import { createApp } from "./app.js";
 import { parseAllowlist } from "./auth/allowlist.js";
 import { createGoogleProvider, type OAuthProvider } from "./auth/google.js";
@@ -85,7 +86,7 @@ if (!nativeVerifier) {
 }
 
 const allowlist = parseAllowlist(process.env.ALLOWED_EMAILS);
-if (allowlist.size === 0) {
+if (allowlist.size === 0 && process.env.FRONT_DOOR_ENABLED !== "1") {
   console.warn(
     "WARNING: ALLOWED_EMAILS is empty — nobody can create an account",
   );
@@ -187,9 +188,15 @@ const concept2 = {
 };
 
 const port = Number(process.env.PORT ?? 8080);
-createApp({
+const sessionStore = createSessionStore(db);
+const frontConfig = await frontDoorConfig(process.env, siteUrl);
+const frontDoor = frontConfig
+  ? await createFrontDoor(pool, sessionStore, frontConfig)
+  : null;
+const httpServer = createApp({
+  frontDoor,
   checkDb: () => checkDb(pool),
-  sessions: createSessionStore(db),
+  sessions: sessionStore,
   users: createUserStore(db),
   oauth,
   nativeVerifier,
@@ -201,3 +208,11 @@ createApp({
 }).listen(port, () => {
   console.log(`ergomatic api listening on :${port}`);
 });
+
+for (const signal of ["SIGINT", "SIGTERM"] as const)
+  process.once(signal, () => {
+    frontDoor?.close();
+    httpServer.close(() => {
+      void pool.end();
+    });
+  });
```

## Integration and release handoff

- [ ] Combine with the native and client candidates through the shared contract, then run the parent-owned whole-branch gates and actual browser producer→consumer tests. Server Supertest crosses real Express/parser/provider/store boundaries but is not a browser cookie-policy experiment.
- [ ] Read the DBA report and attach its exact SQL/source fingerprint and scale/concurrency results. Session-first locking must remain intact; no retry masks the original 40P01 defect.
- [ ] Controller updates Compose/env/deployment and `docs/RELEASING.md` with the disabled switch, exact Apple IDs/key configuration, HTTPS callback, associated Apple App ID/Services ID, and authentication rollback floor. This is parent ownership, not omitted server code.
- [ ] Keep real Apple issuer credentials, portal provisioning, native entitlement/build, actual form_post cookie behavior and native/web subject continuity as explicit release gates. The mock signer cannot prove them. External availability still waits for in-app deletion.

No source code is prescribed outside the three task patches. No provider secret belongs in a plan, fixture, API projection or log. The rower's cancellation path stays quiet; failures return only the shared allowlisted result code.
