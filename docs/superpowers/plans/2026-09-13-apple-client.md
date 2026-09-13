# Apple Front-Door Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved Apple-first sign-in and account-linking client on iOS and web while preserving legacy Google behavior, native sign-out, and account/history continuity.

**Architecture:** `useAuthFlow` is the sole client operation adapter. It consumes the shared server union, invokes the thin native Apple/Google proof bridges or follows the server's exact web authorization URL, and exposes credential-free view states to Welcome, confirmation, and You. A generation number invalidates every pending async continuation when a rower starts another operation, cancels, resets, signs out, or leaves the flow. An operation-local authorization owner serializes provider launch, proof, and finalization; the rendered target action reflects that busy authority. Browser tests intercept only the new auth endpoints and begin at real UI producers; server plans separately prove signed callbacks and database behavior.

**Tech Stack:** React 19, TypeScript 6, React Router 7, Capacitor 8, Vitest, Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-09-12-apple-signin-design.md`

**Candidate through:** `0f990a68e930f4c2dbd6ee46736405554abd18d2` in `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/apple-client-plan-scratch`

## Global constraints

- Integrate the full server candidate through `259882ba` before this module so `app/shared/auth.ts`, `app/tsconfig.app.json`, and `app/tsconfig.server.json` are present. Integrate native commit `81ce6040` before this module so `app/src/native/appleAuth.ts` is present. The client series deliberately excludes those four owned files.
- The native bridge remains `AppleAuth.authorize({nonce,state}) -> {idToken,authorizationCode,state,name?}`. The adapter passes the server nonce and state unchanged. Native Google calls the existing plugin with the server nonce and `forcePrompt:true`.
- Provider credentials and binding secrets stay in adapter/native-session scope and out of React screen state, Ergomatic return URLs, browser storage, logs, analytics and preferences. Provider authorization URLs carry protocol state/nonce as prescribed by the server. The existing native-session module alone persists the Ergomatic session token.
- Web code follows only the server-produced `authorizationUrl`. It consumes and removes `authAttempt`, `authResult`, `authError`, `authPurpose`, and allowlisted `authProvider`. A providerless unbound error/cancel stays providerless.
- Preserve missing/malformed `/api/auth/options` and `FRONT_DOOR_ENABLED=false` legacy Google behavior. Preserve the existing native sign-out order and failure behavior.
- Account creation requires explicit confirmation. Linking always proves the existing provider before the target provider, in both directions, and preserves the existing account and workouts.
- Keep the retained scratch worktree until the feature PR merges. Do not copy its borrowed server/native files into the client commit.

## File map

| File                                                                | Responsibility                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `app/src/adapters/authFlow.ts`                                      | Credential-owning native/web operation adapter, return routing, generation invalidation.        |
| `app/src/adapters/authFlow.test.tsx`                                | Contract bodies, nonce/state/binding, returns, errors, cancellation, lifetime, legacy fallback. |
| `app/src/native/signin.ts` / `.test.ts`                             | Nonce-bound forced Google proof while retaining native sign-out.                                |
| `app/src/api/useAuthMethods.ts` / `.test.ts`                        | Read connected provider methods from `/api/auth/methods`.                                       |
| `app/src/auth/AuthProviderButton.tsx`                               | Shared provider control.                                                                        |
| `app/src/auth/LinkSignInMethod.tsx` / `.test.tsx`                   | Existing-provider then target-provider link confirmation.                                       |
| `app/src/you/SignInMethods.tsx` / `.test.tsx`                       | Apple-first connected/add rows and terminal notices.                                            |
| `app/src/SignIn.tsx` / `.frontDoor.test.tsx`                        | Apple-first Welcome, create confirmation, usual-signin recovery, errors.                        |
| `app/src/App.tsx`, `app/src/shell/AppRoutes.tsx`, `app/src/You.tsx` | Shared flow owner and `/you/sign-in-methods` route integration.                                 |
| `app/src/index.css`, `app/src/theme/tokens.css`, Apple SVG          | Approved rower-facing layout and provider styling.                                              |
| `app/e2e/appleAuth.spec.ts`                                         | Functional UI producer-to-adapter browser proof and workout continuity.                         |
| `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`             | Approved-copy/layout checks and seven canonical captures, including uncertain completion.       |
| `docs/screenshots/apple-*.png`                                      | Reviewed portrait/landscape evidence.                                                           |

## Shared interfaces

Consume these types from server-owned `app/shared/auth.ts`: `AuthProvider`, `AuthPurpose`, `AuthErrorCode`, `AuthOptions`, `AuthStep`, `NativeBegin`, and `SignedIn`. Do not duplicate their shapes locally.

The client-facing controller is:

```ts
export interface AuthFlowController {
  options: AuthOptionsView;
  view: AuthFlowView;
  destination: "/" | "/you" | "/you/sign-in-methods" | null;
  targetAuthorizationBusy: boolean;
  startSignIn(provider: AuthProvider): Promise<void>;
  confirmAccount(): Promise<void>;
  useUsualSignIn(): Promise<void>;
  prepareLink(provider: AuthProvider): void;
  startPreparedLink(): Promise<void>;
  authorizeLinkTarget(): Promise<void>;
  cancel(): Promise<void>;
  reset(): void;
  abandon(): void;
}
```

Screens receive only this view union:

```ts
export type AuthFlowView =
  | { kind: "idle" }
  | { kind: "busy"; purpose: AuthPurpose }
  | {
      kind: "confirm";
      targetProvider: AuthProvider;
      profile: { email: string; name: string };
    }
  | { kind: "usual"; provider: AuthProvider }
  | { kind: "link_confirm"; targetProvider: AuthProvider }
  | {
      kind: "link_authorize";
      targetProvider: AuthProvider;
      provider: AuthProvider;
      existingProofComplete: boolean;
    }
  | { kind: "linked"; targetProvider: AuthProvider }
  | { kind: "cancelled"; purpose: AuthPurpose; targetProvider?: AuthProvider }
  | {
      kind: "error";
      purpose: AuthPurpose;
      code: AuthErrorCode;
      targetProvider?: AuthProvider;
    };
```

## Lifetime authority

| Event                            | Authority change                                                          | Late result behavior                                                                |
| -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Start sign-in/link               | Increment generation; replace active operation after accepted server step | Any older begin/proof/confirm/finalize result is ignored.                           |
| Prepare another link             | Increment generation; clear operation                                     | Prior async result cannot open a provider or change view.                           |
| Cancel                           | Increment generation before server cancel; discard binding locally        | A late server cancel cannot overwrite a newer view.                                 |
| Reset or successful You sign-out | Increment generation; clear operation and view                            | A native operation that survives Browser Back cannot resurrect after `abandon()`.   |
| Web provider navigation          | Browser document reloads                                                  | Old hook memory cannot survive; cookie-bound resume creates the new operation view. |
| Native signed-in result          | Check generation before and after dynamic import and token storage        | Invalidated flow cannot store a token or call the signed-in callback.               |

The operation-local authorization owner is claimed synchronously before any dynamic import, provider initialization, provider proof, proof POST, or finalization. Every continuation checks the same operation object, generation, and owner. The target provider action renders disabled while that owner exists; Cancel remains available. Cleanup captures the operation it owns before awaiting the server and cannot clear or render over a newer operation.

Busy screens remove or disable competing auth actions. `/you/sign-in-methods` is a normal history entry, so Browser Back can expose You while a native request is pending; successful sign-out must call `abandon()` and the generation guard remains mandatory.

---

### Task 1: Verify neighboring contracts and adopt the tested client commit

**Files:** server/native owned files above, then the 22 client-owned source files and seven captures in the file map.

- [ ] **Step 1: Confirm the integration worktree and exact dependencies**

From the integration root:

```bash
pwd
git status --short
git diff --stat 3cf849c7 259882ba -- app
git show --stat --oneline 81ce6040
git show --stat --oneline 0ca9849567e7ba38cdd5ecc79aa6ce655b26f859
git show --stat --oneline 0f990a68e930f4c2dbd6ee46736405554abd18d2
git diff --name-only 3cf849c7 0f990a68e930f4c2dbd6ee46736405554abd18d2
```

Expected: the complete server candidate owns shared types and both TypeScript inclusion edits, the native commit owns the thin bridge, and the two client commits together own exactly 22 source files plus seven PNG captures. Stop if the client series includes `app/shared`, either tsconfig, or `app/src/native/appleAuth.ts`.

- [ ] **Step 2: Adopt the client commit after the server and native commits**

```bash
git rev-parse --show-toplevel
git cherry-pick 0ca9849567e7ba38cdd5ecc79aa6ce655b26f859
git rev-parse --show-toplevel
git cherry-pick 0f990a68e930f4c2dbd6ee46736405554abd18d2
git diff --check HEAD^
git status --short
```

Expected: both cherry-picks succeed without ownership conflicts and the worktree is clean.

- [ ] **Step 3: Inspect the boundary, not just compilation**

```bash
rg -n 'bindingSecret|authorizationCode|idToken|nonce|state' app/src/adapters/authFlow.ts
rg -n 'localStorage|sessionStorage|console\.|logger|analytics' \
  app/src/adapters/authFlow.ts app/src/SignIn.tsx app/src/auth app/src/you
rg -n 'forcePrompt: true|nativeGoogleProofAfterInit\(step\.nonce\)' app/src/native/signin.ts app/src/adapters/authFlow.ts
```

Expected: sensitive values stay inside adapter request scope, the storage/log scan has no credential use, and Google uses the server nonce with forced prompt.

### Task 2: Run focused and repository client gates

- [ ] **Step 1: Export the Node compatibility option and run focused contract tests**

From `app/`:

```bash
export NODE_OPTIONS=--no-experimental-webstorage
pnpm exec vitest run --project client \
  src/adapters/authFlow.test.tsx \
  src/api/useAuthMethods.test.ts \
  src/native/signin.test.ts \
  src/auth/LinkSignInMethod.test.tsx \
  src/you/SignInMethods.test.tsx \
  src/SignIn.frontDoor.test.tsx
```

Expected from the candidate: 6 files and 68 tests pass, including late native begin after You sign-out, binding-secret request bodies, providerless returns, cancel cleanup, nonce-bound proofs, first-account confirmation, both link directions, and legacy fallback.

- [ ] **Step 2: Run repository gates once on the assembled branch**

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test:coverage
```

Expected: all exit 0. Do not substitute the focused HTML diagnostic for the repository aggregate coverage gate.

- [ ] **Step 3: Read the integrated coverage evidence**

Read the per-file rows and missed branches in `app/coverage/index.html` from the single assembled `pnpm test:coverage` run above; archive the current-source result with integration evidence. The repo-wide aggregate must meet 90×4 and domain 100%. Do not run a duplicate full client suite or a narrowed coverage diagnostic merely to refresh a historical percentage.

The earlier narrowed diagnostic at `0ca98495` ran 64 tests and exited 1 on 88.32% branches. Its retained HTML is historical evidence for that source, not a measured result for `0f990a68` and not the final aggregate gate.

### Task 3: Prove browser producer-to-consumer behavior and approved design

- [ ] **Step 1: Run functional browser paths**

```bash
NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "Apple welcome begins"
NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "linking Apple"
NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "a lost finalize response reports uncertainty"
```

Expected: the welcome test clicks the real Apple control, follows the intercepted server `authorizationUrl`, consumes `authAttempt`, and reaches account confirmation. The link test starts from Add Apple, proves Google then Apple, finalizes, and keeps a workout created from real `LIBRARY_WORKOUTS` via `fromWorkout`/`toSteps` on the same account. The response-loss test aborts the finalize response, shows uncertainty, refetches methods, and shows both providers connected without a success notice.

- [ ] **Step 2: Run design and canonical screenshot paths**

```bash
NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "Apple front door and sign-in methods"
NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm screenshots -g "apple-"
```

Expected: 2 design tests and 7 screenshot cases pass. Inspect all seven PNGs at native dimensions for copy, focusable controls, portrait/landscape clipping, and the 44px minimum action sizes.

### Task 4: Re-run deciding-source mutations

Keep the Task 2 `NODE_OPTIONS` export active. In a new shell, run `export NODE_OPTIONS=--no-experimental-webstorage` before any direct Vitest command.

- [ ] **Step 1: Prove focused tests own the credential and UI decisions**

Apply each replacement independently, run the named command, verify the stated failure, then restore the file before the next row:

| Source replacement                                                   | Command                                                                                                                                                                                                                       | Required red                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `forcePrompt: true` → `forcePrompt: false`                           | `pnpm exec vitest run --project client src/native/signin.test.ts`                                                                                                                                                             | Forced-prompt assertion fails.                                                |
| Google login option `nonce` → `nonce: "wrong"`                       | same                                                                                                                                                                                                                          | Nonce assertion fails.                                                        |
| Remove the missing Google ID-token throw                             | same                                                                                                                                                                                                                          | Missing-token rejection fails.                                                |
| Remove `bindingSecret` from native proof body                        | `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx`                                                                                                                                                        | Exact proof-body assertion fails.                                             |
| `nonce: step.nonce` → `nonce: "wrong"` in Apple call                 | same                                                                                                                                                                                                                          | Apple bridge input assertion fails.                                           |
| Stop deleting `authProvider`                                         | same                                                                                                                                                                                                                          | Two return-cleanup assertions fail.                                           |
| Default absent `authProvider` to `"apple"`                           | same                                                                                                                                                                                                                          | Both providerless return assertions fail.                                     |
| `legacyGoogle: true` → `legacyGoogle: false` in fallback             | `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx src/SignIn.frontDoor.test.tsx`                                                                                                                          | Legacy fallback assertions fail.                                              |
| Reverse Apple/Google methods order                                   | `pnpm exec vitest run --project client src/you/SignInMethods.test.tsx`                                                                                                                                                        | Apple-first assertion fails.                                                  |
| First link action bypasses `startPreparedLink`                       | `pnpm exec vitest run --project client src/auth/LinkSignInMethod.test.tsx`                                                                                                                                                    | Existing-provider proof assertion fails.                                      |
| Remove `now` from success copy                                       | `pnpm exec vitest run --project client src/you/SignInMethods.test.tsx`                                                                                                                                                        | Approved-copy assertion fails.                                                |
| Remove the first generation guard in `acceptStep`                    | `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx -t "does not resurrect a native link begin after You sign-out abandons it"`                                                                             | Late begin invokes Google proof.                                              |
| Let a second `claimAuthorization` replace the current owner          | `node /tmp/apple-mechanism-probes/client.cjs`; then `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx -t "keeps one rendered native target action"`                                                       | Probe reports a second owner and no completion; rendered test fails.          |
| Render the target provider action enabled while owned                | `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx -t "keeps one rendered native target action"`                                                                                                           | Disabled-control assertion fails.                                             |
| Remove the ownership check after Google initialization               | `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx -t "does not launch Google after initialization loses its operation"`                                                                                   | Stale Google proof launches.                                                  |
| Remove captured-operation and generation checks after cancel cleanup | `node /tmp/apple-mechanism-probes/client-stale-cancel.cjs`; then `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx -t "keeps a newly prepared link when an older provider cancellation finishes cleanup"` | Probe loses the new operation and rendered test shows the stale cancellation. |
| Stop refreshing methods for an uncertain result                      | `pnpm exec vitest run --project client src/you/SignInMethods.test.tsx -t "refetches authoritative methods before showing an uncertain finalize result"`                                                                       | Only one methods read occurs and stale Add Apple remains.                     |
| Route `attempt_expired` to the old default failure copy              | `pnpm exec vitest run --project client src/you/SignInMethods.test.tsx -t "renders the bounded link terminal copy"`                                                                                                            | Expiry renders false `Nothing changed` certainty.                             |

After every restore:

```bash
git diff --check
pnpm exec vitest run --project client \
  src/adapters/authFlow.test.tsx src/native/signin.test.ts \
  src/auth/LinkSignInMethod.test.tsx src/you/SignInMethods.test.tsx \
  src/SignIn.frontDoor.test.tsx
```

- [ ] **Step 2: Prove the browser test depends on the built UI producer**

Temporarily replace the welcome Apple button handler with:

```tsx
onClick={() => {
  throw new Error("RF24 Apple welcome producer mutation");
}}
```

Then run:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm build
rg -l -F "RF24 Apple welcome producer mutation" dist/client
NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "Apple welcome begins"
```

Required red: the production build succeeds, `rg` finds the literal in the emitted client bundle, and the named browser test fails because clicking the actual control never reaches `Create your account`. Restore `SignIn.tsx`, then rerun the same three commands with the ordinary source; the literal scan should find nothing and the named browser test must pass.

- [ ] **Step 3: Prove response-loss copy cannot claim a no-change outcome**

Temporarily replace the uncertain notice with `We couldn’t confirm the result. Nothing changed after this attempt. Try again.`, then run:

```bash
pnpm build
rg -n "Nothing changed after this attempt" dist/client/assets
NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "a lost finalize response reports uncertainty without claiming failure or success"
```

Required red: the production build succeeds, the false-certainty literal is in the bundle, and the named Chromium test fails on the alert text after its intercepted finalize response is aborted. Restore the source and rerun the named browser test; it must show `We couldn’t confirm the result. Check your sign-in methods and try again.`, refetch `/api/auth/methods`, render both providers connected when the server committed, and render no false success or `Nothing changed` claim. Pair this client consumer proof with server commit `259882ba`, whose real-PG `createApp` test commits identity and grant before destroying the HTTP response and then proves both methods from the real endpoint.

### Task 5: Record assembled evidence and release-only residuals

- [ ] **Step 1: Update durable receipts**

Update `docs/superpowers/plans/apple-client-evidence/report.md` with the assembled HEAD, actual command results, HTML per-file coverage rows, mutation red/green outcomes, and final screenshot paths. Do not invent counts or upgrade endpoint interception into a server OAuth proof.

- [ ] **Step 2: Run final repository hygiene checks**

From the repository root:

```bash
git diff --check
./scripts/skills-parity.sh
git status --short
```

Expected: no whitespace error, skill roots remain paired, and only intentional plan/evidence changes remain.

- [ ] **Step 3: Keep release gates explicit**

Before release, exercise live Apple and Google credentials, an iOS device launch, and native/web same-subject continuity. Those require deployed provider configuration and physical/runtime evidence; endpoint-intercepted Playwright tests do not satisfy them.

## Complete tested source patch

The following exact source patch is generated by:

```bash
git diff --full-index \
  3cf849c7614caa25bff78c64517e8d2e47ada39a \
  0f990a68e930f4c2dbd6ee46736405554abd18d2 -- app
```

Context-only blank diff markers are stored as empty lines so the Markdown passes whitespace checks. The embedded patch passed reverse and forward `git apply`, then every resulting source byte matched candidate HEAD `0f990a68e930f4c2dbd6ee46736405554abd18d2`. The seven reviewed PNG captures travel in the two client commits and are listed in the evidence report; binary bytes are intentionally omitted from this executable source archive.

```diff
diff --git a/app/e2e/appleAuth.spec.ts b/app/e2e/appleAuth.spec.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a8122d434dc1fe58fa010b6e024723d02e13e7a5
--- /dev/null
+++ b/app/e2e/appleAuth.spec.ts
@@ -0,0 +1,267 @@
+import { expect, test, type Page } from "@playwright/test";
+import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
+import { fromWorkout, toSteps } from "../src/builder/builderState.js";
+import { signInViaBackdoor } from "./helpers.js";
+
+const options = {
+  frontDoorEnabled: true,
+  apple: { native: true, web: true },
+  google: { native: true, web: true },
+};
+
+async function enableFrontDoor(page: Page): Promise<void> {
+  await page.route("**/api/auth/options", (route) =>
+    route.fulfill({ status: 200, json: options }),
+  );
+}
+
+test("Apple welcome begins at the real control and resumes into explicit account confirmation", async ({
+  page,
+}) => {
+  await enableFrontDoor(page);
+  await page.route("**/api/me", (route) =>
+    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
+  );
+  await page.route("**/api/auth/web/attempts", async (route) => {
+    expect(route.request().method()).toBe("POST");
+    expect(route.request().postDataJSON()).toStrictEqual({
+      purpose: "signin",
+      provider: "apple",
+    });
+    await route.fulfill({
+      status: 200,
+      json: {
+        outcome: "authorize",
+        attemptId: "apple-signup",
+        purpose: "signin",
+        targetProvider: "apple",
+        expiresAt: "2026-09-13T00:05:00.000Z",
+        provider: "apple",
+        stage: "signin",
+        nonce: "server-only-nonce",
+        state: "server-only-state",
+        authorizationUrl: "/?authAttempt=apple-signup",
+      },
+    });
+  });
+  await page.route("**/api/auth/web/attempts/apple-signup", (route) =>
+    route.fulfill({
+      status: 200,
+      json: {
+        outcome: "confirm",
+        attemptId: "apple-signup",
+        purpose: "signin",
+        targetProvider: "apple",
+        expiresAt: "2026-09-13T00:05:00.000Z",
+        profile: {
+          name: "Rower",
+          email: "9m3x7k2p1r@privaterelay.appleid.com",
+        },
+      },
+    }),
+  );
+
+  await page.goto("/");
+  const providerButtons = page.locator(".auth-provider-button");
+  await expect(providerButtons).toHaveText([
+    "Continue with Apple",
+    "Continue with Google",
+  ]);
+  await page.getByRole("button", { name: "Continue with Apple" }).click();
+  await expect(
+    page.getByRole("heading", { name: "Create your account" }),
+  ).toBeVisible();
+  await expect(page.getByText("Rower", { exact: true })).toBeVisible();
+  await expect(page).toHaveURL(/^(?!.*authAttempt)/);
+});
+
+test("linking Apple proves Google then Apple and preserves the signed-in account's real workout", async ({
+  page,
+}, testInfo) => {
+  let linked = false;
+  let resumes = 0;
+  await enableFrontDoor(page);
+  await page.route("**/api/auth/methods", (route) =>
+    route.fulfill({
+      status: 200,
+      json: { apple: linked, google: true },
+    }),
+  );
+  await page.route("**/api/auth/web/attempts", async (route) => {
+    expect(route.request().postDataJSON()).toStrictEqual({
+      purpose: "link",
+      provider: "apple",
+    });
+    await route.fulfill({
+      status: 200,
+      json: {
+        outcome: "authorize",
+        attemptId: "link-apple",
+        purpose: "link",
+        targetProvider: "apple",
+        expiresAt: "2026-09-13T00:05:00.000Z",
+        provider: "google",
+        stage: "reauth",
+        nonce: "google-nonce",
+        state: "google-state",
+        authorizationUrl: "/?authAttempt=link-apple&proof=google",
+      },
+    });
+  });
+  await page.route("**/api/auth/web/attempts/link-apple", async (route) => {
+    resumes += 1;
+    await route.fulfill({
+      status: 200,
+      json:
+        resumes === 1
+          ? {
+              outcome: "authorize",
+              attemptId: "link-apple",
+              purpose: "link",
+              targetProvider: "apple",
+              expiresAt: "2026-09-13T00:05:00.000Z",
+              provider: "apple",
+              stage: "target",
+              nonce: "apple-nonce",
+              state: "apple-state",
+              authorizationUrl: "/?authAttempt=link-apple&proof=apple",
+            }
+          : {
+              outcome: "link_ready",
+              attemptId: "link-apple",
+              purpose: "link",
+              targetProvider: "apple",
+              expiresAt: "2026-09-13T00:05:00.000Z",
+            },
+    });
+  });
+  await page.route(
+    "**/api/auth/web/attempts/link-apple/finalize",
+    async (route) => {
+      linked = true;
+      await route.fulfill({ status: 200, json: { outcome: "linked" } });
+    },
+  );
+
+  await signInViaBackdoor(page, {
+    email: `apple-link-${testInfo.parallelIndex}@e2e.test`,
+    name: "Apple Link Tester",
+  });
+
+  const source = LIBRARY_WORKOUTS.find(
+    (workout) => workout.title === "Sea Fret",
+  )!;
+  const title = `Apple link continuity ${testInfo.parallelIndex}`;
+  const form = fromWorkout({ ...source, title });
+  const resolved = toSteps(form);
+  expect(resolved.ok).toBe(true);
+  if (!resolved.ok) throw new Error("real workout fixture did not resolve");
+  const created = await page.evaluate(
+    async (workout) => {
+      const response = await fetch("/api/workouts", {
+        method: "POST",
+        headers: { "Content-Type": "application/json" },
+        body: JSON.stringify(workout),
+      });
+      return { ok: response.ok, body: await response.text() };
+    },
+    { title, type: source.type, effort: source.effort, steps: resolved.steps },
+  );
+  expect(created.ok, created.body).toBe(true);
+
+  try {
+    await page.goto("/you");
+    await page.getByRole("button", { name: "Add Apple" }).click();
+    await expect(
+      page.getByRole("heading", { name: "Add Apple" }),
+    ).toBeVisible();
+    await page.getByRole("button", { name: "Confirm with Google" }).click();
+    await expect(page.getByLabel("Usual sign-in confirmed")).toBeVisible();
+    await page.getByRole("button", { name: "Continue with Apple" }).click();
+    await expect(page.getByRole("status")).toHaveText(
+      "Apple is now connected. You can sign in either way.",
+    );
+    await expect(page.locator(".auth-method-connected")).toHaveCount(2);
+
+    const account = await page.evaluate(async (workoutTitle) => {
+      const [meResponse, workoutsResponse] = await Promise.all([
+        fetch("/api/me"),
+        fetch("/api/workouts"),
+      ]);
+      const me = (await meResponse.json()) as { user: { email: string } };
+      const workouts = (await workoutsResponse.json()) as Array<{
+        title: string;
+        isGlobal: boolean;
+      }>;
+      return {
+        email: me.user.email,
+        retained: workouts.some(
+          (workout) => !workout.isGlobal && workout.title === workoutTitle,
+        ),
+      };
+    }, title);
+    expect(account.email).toContain("apple-link-");
+    expect(account.retained).toBe(true);
+  } finally {
+    await page.evaluate(async (workoutTitle) => {
+      const response = await fetch("/api/workouts");
+      const workouts = (await response.json()) as Array<{
+        id: string;
+        title: string;
+        isGlobal: boolean;
+      }>;
+      const match = workouts.find(
+        (workout) => !workout.isGlobal && workout.title === workoutTitle,
+      );
+      if (match) await fetch(`/api/workouts/${match.id}`, { method: "DELETE" });
+    }, title);
+  }
+});
+
+test("a lost finalize response reports uncertainty without claiming failure or success", async ({
+  page,
+}, testInfo) => {
+  let finalizations = 0;
+  await enableFrontDoor(page);
+  await page.route("**/api/auth/methods", (route) =>
+    route.fulfill({
+      status: 200,
+      json: { apple: true, google: true },
+    }),
+  );
+  await page.route("**/api/auth/web/attempts/lost-finalize", (route) =>
+    route.fulfill({
+      status: 200,
+      json: {
+        outcome: "link_ready",
+        attemptId: "lost-finalize",
+        purpose: "link",
+        targetProvider: "apple",
+        expiresAt: "2026-09-13T00:05:00.000Z",
+      },
+    }),
+  );
+  await page.route(
+    "**/api/auth/web/attempts/lost-finalize/finalize",
+    async (route) => {
+      finalizations += 1;
+      expect(route.request().method()).toBe("POST");
+      expect(route.request().postDataJSON()).toStrictEqual({});
+      await route.abort("connectionfailed");
+    },
+  );
+  await signInViaBackdoor(page, {
+    email: `apple-lost-finalize-${testInfo.parallelIndex}@e2e.test`,
+    name: "Apple Link Tester",
+  });
+
+  await page.goto("/?authAttempt=lost-finalize");
+  await expect(page.getByRole("alert")).toHaveText(
+    "We couldn’t confirm the result. Check your sign-in methods and try again.",
+  );
+  expect(finalizations).toBe(1);
+  await expect(page.locator(".auth-method-connected")).toHaveCount(2);
+  await expect(page.getByRole("button", { name: "Add Apple" })).toHaveCount(0);
+  await expect(page.getByText(/Nothing changed/)).toHaveCount(0);
+  await expect(page.getByRole("status")).toHaveCount(0);
+});
diff --git a/app/e2e/design.spec.ts b/app/e2e/design.spec.ts
index f44fd40bdfa41aeb208db3eb4e2083b9bdbe3e2c..ea71580326ff04a332fa4398f91a7707d95c9452 100644
--- a/app/e2e/design.spec.ts
+++ b/app/e2e/design.spec.ts
@@ -624,6 +624,119 @@ test("Just Row observer: VITE-enabled route, accessibility, controls, and shell"
   await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
 });

+test.describe("Apple front door and sign-in methods", () => {
+  const authOptions = {
+    frontDoorEnabled: true,
+    apple: { native: true, web: true },
+    google: { native: true, web: true },
+  };
+
+  test("welcome and confirmation keep approved provider order, geometry, palette and accessible names", async ({
+    page,
+  }) => {
+    await page.route("**/api/me", (route) =>
+      route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
+    );
+    await page.route("**/api/auth/options", (route) =>
+      route.fulfill({ status: 200, json: authOptions }),
+    );
+    await page.route("**/api/auth/web/attempts", (route) =>
+      route.fulfill({
+        status: 200,
+        json: {
+          outcome: "authorize",
+          attemptId: "design-apple",
+          purpose: "signin",
+          targetProvider: "apple",
+          expiresAt: "2026-09-13T00:05:00.000Z",
+          provider: "apple",
+          stage: "signin",
+          nonce: "nonce",
+          state: "state",
+          authorizationUrl: "/?authAttempt=design-apple",
+        },
+      }),
+    );
+    await page.route("**/api/auth/web/attempts/design-apple", (route) =>
+      route.fulfill({
+        status: 200,
+        json: {
+          outcome: "confirm",
+          attemptId: "design-apple",
+          purpose: "signin",
+          targetProvider: "apple",
+          expiresAt: "2026-09-13T00:05:00.000Z",
+          profile: {
+            name: "Rower",
+            email: "9m3x7k2p1r@privaterelay.appleid.com",
+          },
+        },
+      }),
+    );
+    await page.goto("/");
+    const buttons = page.locator(".auth-provider-button");
+    await expect(buttons).toHaveText([
+      "Continue with Apple",
+      "Continue with Google",
+    ]);
+    for (const box of await buttons.evaluateAll((nodes) =>
+      nodes.map((node) => node.getBoundingClientRect().toJSON()),
+    )) {
+      expect(box.height).toBeGreaterThanOrEqual(52);
+      expect(box.width).toBeLessThanOrEqual(440);
+    }
+    expect(
+      await buttons
+        .first()
+        .evaluate((node) => getComputedStyle(node).backgroundColor),
+    ).toBe("rgb(0, 0, 0)");
+    await expect(new AxeBuilder({ page }).analyze()).resolves.toMatchObject({
+      violations: [],
+    });
+    await buttons.first().click();
+    await expect(
+      page.getByRole("heading", { name: "Create your account" }),
+    ).toBeVisible();
+    await expect(page.locator("html")).toHaveJSProperty(
+      "scrollWidth",
+      await page.locator("html").evaluate((node) => node.clientWidth),
+    );
+  });
+
+  test("You methods and the two-proof screen keep 44px controls and hide the tab bar during linking", async ({
+    page,
+  }) => {
+    await page.route("**/api/auth/options", (route) =>
+      route.fulfill({ status: 200, json: authOptions }),
+    );
+    await page.route("**/api/auth/methods", (route) =>
+      route.fulfill({ status: 200, json: { apple: false, google: true } }),
+    );
+    await signInViaBackdoor(page, {
+      email: "design-apple-methods@e2e.test",
+      name: "Maya Chen",
+    });
+    await page.goto("/you");
+    const addApple = page.getByRole("button", { name: "Add Apple" });
+    await expect(addApple).toBeVisible();
+    expect((await addApple.boundingBox())!.height).toBeGreaterThanOrEqual(44);
+    await addApple.click();
+    await expect(
+      page.getByRole("heading", { name: "Add Apple" }),
+    ).toBeVisible();
+    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
+    await expect(
+      page.getByText("Confirm your usual Google sign-in"),
+    ).toBeVisible();
+    await expect(
+      page.getByText("Sign in with Apple", { exact: true }),
+    ).toBeVisible();
+    await expect(new AxeBuilder({ page }).analyze()).resolves.toMatchObject({
+      violations: [],
+    });
+  });
+});
+
 // --ink-4's own rgb (tokens.css #6f6a5f) — computed once here rather than
 // re-derived per call site.
 const INK_4_RGB = "rgb(111, 106, 95)";
diff --git a/app/e2e/screenshots.spec.ts b/app/e2e/screenshots.spec.ts
index 043f863ec20b56a961b33e6c5bf95d380938a2e0..ca65be48b9463b52497ca44c143399e5378db493 100644
--- a/app/e2e/screenshots.spec.ts
+++ b/app/e2e/screenshots.spec.ts
@@ -7631,3 +7631,169 @@ for (const viewport of [
     });
   });
 }
+
+const APPLE_AUTH_OPTIONS = {
+  frontDoorEnabled: true,
+  apple: { native: true, web: true },
+  google: { native: true, web: true },
+};
+
+async function captureAppleWelcome(
+  page: Page,
+  fileName: string,
+): Promise<void> {
+  await page.route("**/api/me", (route) =>
+    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
+  );
+  await page.route("**/api/auth/options", (route) =>
+    route.fulfill({ status: 200, json: APPLE_AUTH_OPTIONS }),
+  );
+  await page.goto("/");
+  await expect(
+    page.getByRole("button", { name: "Continue with Apple" }),
+  ).toBeVisible();
+  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, fileName) });
+}
+
+test("apple-signin-welcome", async ({ page }) => {
+  await captureAppleWelcome(page, "apple-signin-welcome.png");
+});
+
+test("apple-signin-welcome-landscape", async ({ page }) => {
+  await page.setViewportSize({ width: 844, height: 390 });
+  await captureAppleWelcome(page, "apple-signin-welcome-landscape.png");
+});
+
+test("apple-create-account", async ({ page }) => {
+  await page.route("**/api/me", (route) =>
+    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
+  );
+  await page.route("**/api/auth/options", (route) =>
+    route.fulfill({ status: 200, json: APPLE_AUTH_OPTIONS }),
+  );
+  await page.route("**/api/auth/web/attempts", (route) =>
+    route.fulfill({
+      status: 200,
+      json: {
+        outcome: "authorize",
+        attemptId: "capture-create",
+        purpose: "signin",
+        targetProvider: "apple",
+        expiresAt: "2026-09-13T00:05:00.000Z",
+        provider: "apple",
+        stage: "signin",
+        nonce: "capture-nonce",
+        state: "capture-state",
+        authorizationUrl: "/?authAttempt=capture-create",
+      },
+    }),
+  );
+  await page.route("**/api/auth/web/attempts/capture-create", (route) =>
+    route.fulfill({
+      status: 200,
+      json: {
+        outcome: "confirm",
+        attemptId: "capture-create",
+        purpose: "signin",
+        targetProvider: "apple",
+        expiresAt: "2026-09-13T00:05:00.000Z",
+        profile: {
+          name: "Rower",
+          email: "9m3x7k2p1r@privaterelay.appleid.com",
+        },
+      },
+    }),
+  );
+  await page.goto("/");
+  await page.getByRole("button", { name: "Continue with Apple" }).click();
+  await expect(
+    page.getByRole("heading", { name: "Create your account" }),
+  ).toBeVisible();
+  await page.screenshot({
+    path: path.join(SCREENSHOTS_DIR, "apple-create-account.png"),
+  });
+});
+
+async function captureAppleMethods(
+  page: Page,
+  fileName: string,
+  openLink: boolean,
+): Promise<void> {
+  await page.route("**/api/auth/options", (route) =>
+    route.fulfill({ status: 200, json: APPLE_AUTH_OPTIONS }),
+  );
+  await page.route("**/api/auth/methods", (route) =>
+    route.fulfill({ status: 200, json: { apple: false, google: true } }),
+  );
+  await signInViaBackdoor(page, {
+    email: `screenshots-apple-${openLink ? "link" : "methods"}@e2e.test`,
+    name: "Maya Chen",
+  });
+  await page.goto("/you");
+  await expect(page.getByRole("button", { name: "Add Apple" })).toBeVisible();
+  if (openLink) {
+    await page.getByRole("button", { name: "Add Apple" }).click();
+    await expect(
+      page.getByRole("heading", { name: "Add Apple" }),
+    ).toBeVisible();
+  }
+  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, fileName) });
+}
+
+test("apple-signin-methods", async ({ page }) => {
+  await captureAppleMethods(page, "apple-signin-methods.png", false);
+});
+
+test("apple-link-confirm-landscape", async ({ page }) => {
+  await page.setViewportSize({ width: 844, height: 390 });
+  await captureAppleMethods(page, "apple-link-confirm-landscape.png", true);
+});
+
+async function captureAppleUncertainResult(
+  page: Page,
+  fileName: string,
+): Promise<void> {
+  await page.route("**/api/auth/options", (route) =>
+    route.fulfill({ status: 200, json: APPLE_AUTH_OPTIONS }),
+  );
+  await page.route("**/api/auth/methods", (route) =>
+    route.fulfill({ status: 200, json: { apple: true, google: true } }),
+  );
+  await page.route("**/api/auth/web/attempts/capture-uncertain", (route) =>
+    route.fulfill({
+      status: 200,
+      json: {
+        outcome: "link_ready",
+        attemptId: "capture-uncertain",
+        purpose: "link",
+        targetProvider: "apple",
+        expiresAt: "2026-09-13T00:05:00.000Z",
+      },
+    }),
+  );
+  await page.route(
+    "**/api/auth/web/attempts/capture-uncertain/finalize",
+    (route) => route.abort("connectionfailed"),
+  );
+  await signInViaBackdoor(page, {
+    email: `screenshots-apple-uncertain-${fileName}@e2e.test`,
+    name: "Maya Chen",
+  });
+  await page.goto("/?authAttempt=capture-uncertain");
+  await expect(page.getByRole("alert")).toHaveText(
+    "We couldn’t confirm the result. Check your sign-in methods and try again.",
+  );
+  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, fileName) });
+}
+
+test("apple-link-result-uncertain", async ({ page }) => {
+  await captureAppleUncertainResult(page, "apple-link-result-uncertain.png");
+});
+
+test("apple-link-result-uncertain-landscape", async ({ page }) => {
+  await page.setViewportSize({ width: 844, height: 390 });
+  await captureAppleUncertainResult(
+    page,
+    "apple-link-result-uncertain-landscape.png",
+  );
+});
diff --git a/app/public/apple-logo-left-white-medium.svg b/app/public/apple-logo-left-white-medium.svg
new file mode 100644
index 0000000000000000000000000000000000000000..362dd7855930e007b6f747a1b42c534fa6539982
--- /dev/null
+++ b/app/public/apple-logo-left-white-medium.svg
@@ -0,0 +1,10 @@
+<?xml version="1.0" encoding="UTF-8"?>
+<svg width="31px" height="44px" viewBox="0 0 31 44" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
+    <!-- Generator: Sketch 61 (89581) - https://sketch.com -->
+    <title>Left White Logo Medium</title>
+    <desc>Created with Sketch.</desc>
+    <g id="Left-White-Logo-Medium" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
+        <rect id="Rectangle" fill="#000000" x="0" y="0" width="31" height="44"></rect>
+        <path d="M15.7099491,14.8846154 C16.5675461,14.8846154 17.642562,14.3048315 18.28274,13.5317864 C18.8625238,12.8312142 19.2852829,11.852829 19.2852829,10.8744437 C19.2852829,10.7415766 19.2732041,10.6087095 19.2490464,10.5 C18.2948188,10.5362365 17.1473299,11.140178 16.4588366,11.9494596 C15.9152893,12.56548 15.4200572,13.5317864 15.4200572,14.5222505 C15.4200572,14.6671964 15.4442149,14.8121424 15.4562937,14.8604577 C15.5166879,14.8725366 15.6133185,14.8846154 15.7099491,14.8846154 Z M12.6902416,29.5 C13.8618881,29.5 14.3812778,28.714876 15.8428163,28.714876 C17.3285124,28.714876 17.6546408,29.4758423 18.9591545,29.4758423 C20.2395105,29.4758423 21.0971074,28.292117 21.9063891,27.1325493 C22.8123013,25.8038779 23.1867451,24.4993643 23.2109027,24.4389701 C23.1263509,24.4148125 20.6743484,23.4122695 20.6743484,20.5979021 C20.6743484,18.1579784 22.6069612,17.0588048 22.7156707,16.974253 C21.4353147,15.1382708 19.490623,15.0899555 18.9591545,15.0899555 C17.5217737,15.0899555 16.3501271,15.9596313 15.6133185,15.9596313 C14.8161157,15.9596313 13.7652575,15.1382708 12.521138,15.1382708 C10.1536872,15.1382708 7.75,17.0950413 7.75,20.7911634 C7.75,23.0861411 8.64383344,25.513986 9.74300699,27.0842339 C10.6851558,28.4129053 11.5065162,29.5 12.6902416,29.5 Z" id="" fill="#FFFFFF" fill-rule="nonzero"></path>
+    </g>
+</svg>
\ No newline at end of file
diff --git a/app/src/App.tsx b/app/src/App.tsx
index f18240f93395daf2edd215abdb127a8203e451fc..217f1b09abc2bd737958b0dd1e18df151082f302 100644
--- a/app/src/App.tsx
+++ b/app/src/App.tsx
@@ -1,11 +1,21 @@
 import { useEffect } from "react";
-import { BrowserRouter } from "react-router-dom";
+import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
 import SignIn from "./SignIn";
+import { useAuthFlow } from "./adapters/authFlow";
 import AppRoutes from "./shell/AppRoutes";
 import { useMe } from "./useMe";

-export default function App() {
+function AppContent() {
   const [me, signedOut, refetch] = useMe();
+  const auth = useAuthFlow(refetch);
+  const location = useLocation();
+  const navigate = useNavigate();
+
+  useEffect(() => {
+    if (auth.destination && auth.destination !== location.pathname) {
+      void navigate(auth.destination);
+    }
+  }, [auth.destination, location.pathname, navigate]);

   // Every screen that cares about scroll manages it itself (the reader and
   // releases screens jump to the top, the Library restores its own saved
@@ -24,11 +34,15 @@ export default function App() {
   }, []);

   if (me.state === "loading") return null;
-  if (me.state === "out") return <SignIn onSignedIn={refetch} />;
+  if (me.state === "out") return <SignIn onSignedIn={refetch} auth={auth} />;

+  return <AppRoutes user={me.user} onSignedOut={signedOut} authFlow={auth} />;
+}
+
+export default function App() {
   return (
     <BrowserRouter>
-      <AppRoutes user={me.user} onSignedOut={signedOut} />
+      <AppContent />
     </BrowserRouter>
   );
 }
diff --git a/app/src/SignIn.frontDoor.test.tsx b/app/src/SignIn.frontDoor.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..79a5f1d26bc5809c80905c062cd692e084aaed22
--- /dev/null
+++ b/app/src/SignIn.frontDoor.test.tsx
@@ -0,0 +1,157 @@
+import { render, screen } from "@testing-library/react";
+import userEvent from "@testing-library/user-event";
+import { describe, expect, it, vi } from "vitest";
+import type { AuthFlowController, AuthFlowView } from "./adapters/authFlow";
+import SignIn from "./SignIn";
+
+function controller(view: AuthFlowView): AuthFlowController {
+  return {
+    options: {
+      state: "ready",
+      frontDoorEnabled: true,
+      legacyGoogle: false,
+      apple: true,
+      google: true,
+    },
+    view,
+    targetAuthorizationBusy: false,
+    destination: null,
+    startSignIn: vi.fn(),
+    confirmAccount: vi.fn(),
+    useUsualSignIn: vi.fn(),
+    prepareLink: vi.fn(),
+    startPreparedLink: vi.fn(),
+    authorizeLinkTarget: vi.fn(),
+    cancel: vi.fn(),
+    reset: vi.fn(),
+    abandon: vi.fn(),
+  };
+}
+
+describe("SignIn front door", () => {
+  it("puts Apple before Google and begins the selected provider", async () => {
+    const auth = controller({ kind: "idle" });
+    const { container } = render(<SignIn auth={auth} />);
+    const buttons = Array.from(
+      container.querySelectorAll<HTMLButtonElement>(".auth-provider-button"),
+      (button) => button.textContent,
+    );
+    expect(buttons).toStrictEqual([
+      "Continue with Apple",
+      "Continue with Google",
+    ]);
+    await userEvent.click(
+      screen.getByRole("button", { name: "Continue with Apple" }),
+    );
+    expect(auth.startSignIn).toHaveBeenCalledWith("apple");
+  });
+
+  it("shows the unseen identity and waits for explicit account creation", async () => {
+    const auth = controller({
+      kind: "confirm",
+      targetProvider: "apple",
+      profile: {
+        name: "Rower",
+        email: "9m3x7k2p1r@privaterelay.appleid.com",
+      },
+    });
+    render(<SignIn auth={auth} />);
+    expect(
+      screen.getByRole("heading", { name: "Create your account" }),
+    ).toBeVisible();
+    expect(screen.getByText("Rower")).toBeVisible();
+    expect(
+      screen.getByText("9m3x7k2p1r@privaterelay.appleid.com"),
+    ).toBeVisible();
+    expect(
+      screen.getByText(/This makes a new Ergomatic account/),
+    ).toBeVisible();
+    await userEvent.click(
+      screen.getByRole("button", { name: "Create account" }),
+    );
+    expect(auth.confirmAccount).toHaveBeenCalledOnce();
+    await userEvent.click(
+      screen.getByRole("button", { name: "I already have an account" }),
+    );
+    expect(auth.useUsualSignIn).toHaveBeenCalledOnce();
+  });
+
+  it("handles missing Apple email without claiming an account was created", async () => {
+    const auth = controller({
+      kind: "error",
+      purpose: "signin",
+      code: "email_required",
+      targetProvider: "apple",
+    });
+    render(<SignIn auth={auth} />);
+    expect(screen.getByRole("heading", { name: "Email needed" })).toBeVisible();
+    expect(screen.getByRole("alert")).toHaveTextContent(
+      "This Apple account didn’t provide an email address. Continue with Google.",
+    );
+    expect(screen.getByText(/^No account was created\./)).toBeVisible();
+    await userEvent.click(
+      screen.getByRole("button", { name: "Continue with Google" }),
+    );
+    expect(auth.startSignIn).toHaveBeenCalledWith("google");
+  });
+
+  it("renders the usual-provider guidance and both provider variants", async () => {
+    const apple = controller({ kind: "usual", provider: "apple" });
+    const { rerender } = render(<SignIn auth={apple} />);
+    expect(screen.getByText(/add Google/)).toBeVisible();
+    await userEvent.click(
+      screen.getByRole("button", { name: "Continue with Apple" }),
+    );
+    expect(apple.startSignIn).toHaveBeenCalledWith("apple");
+
+    const google = controller({ kind: "usual", provider: "google" });
+    rerender(<SignIn auth={google} />);
+    expect(screen.getByText(/add Apple/)).toBeVisible();
+    await userEvent.click(
+      screen.getByRole("button", { name: "Continue with Google" }),
+    );
+    expect(google.startSignIn).toHaveBeenCalledWith("google");
+  });
+
+  it("shows a bounded retry and starts Google from the welcome screen", async () => {
+    const auth = controller({
+      kind: "error",
+      purpose: "signin",
+      code: "signin_failed",
+    });
+    render(<SignIn auth={auth} />);
+    expect(screen.getByRole("alert")).toHaveTextContent(
+      "That sign-in didn’t work. Give it another try.",
+    );
+    await userEvent.click(
+      screen.getByRole("button", { name: "Continue with Google" }),
+    );
+    expect(auth.startSignIn).toHaveBeenCalledWith("google");
+  });
+
+  it("uses R when the confirmed identity has no usable initials", () => {
+    const auth = controller({
+      kind: "confirm",
+      targetProvider: "google",
+      profile: { name: "", email: "maya@example.com" },
+    });
+    render(<SignIn auth={auth} />);
+    expect(screen.getByText("R")).toBeVisible();
+    expect(screen.getByText(/add Google from You/)).toBeVisible();
+  });
+
+  it("preserves the legacy Google door when old-server fallback is active", () => {
+    const auth = controller({ kind: "idle" });
+    auth.options = {
+      state: "ready",
+      frontDoorEnabled: false,
+      legacyGoogle: true,
+      apple: false,
+      google: true,
+    };
+    render(<SignIn auth={auth} />);
+    expect(
+      screen.getByRole("link", { name: "Continue with Google" }),
+    ).toHaveAttribute("href", "/api/auth/signin");
+  });
+});
diff --git a/app/src/SignIn.tsx b/app/src/SignIn.tsx
index 40f7533ffb6d3922f85744813d404f7450e2b940..0b074968e0617e249ddb15a8720fe1497873ea1a 100644
--- a/app/src/SignIn.tsx
+++ b/app/src/SignIn.tsx
@@ -1,12 +1,221 @@
 import { useState } from "react";
 import { SignInButton } from "./adapters/auth";
+import type { AuthFlowController } from "./adapters/authFlow";
+import AuthProviderButton from "./auth/AuthProviderButton";

-export default function SignIn({ onSignedIn }: { onSignedIn?: () => void }) {
+function providerName(provider: "apple" | "google") {
+  return provider === "apple" ? "Apple" : "Google";
+}
+
+function Welcome({ auth }: { auth: AuthFlowController }) {
+  const busy = auth.view.kind === "busy";
+  return (
+    <main className="signin">
+      <h1>Ergomatic</h1>
+      <p className="tagline">Rowing workout tracker &amp; planner.</p>
+      {auth.view.kind === "error" && auth.view.purpose === "signin" && (
+        <p className="notice auth-notice-error" role="alert">
+          That sign-in didn’t work. Give it another try.
+        </p>
+      )}
+      <div className="auth-stack">
+        {auth.options.state === "ready" && auth.options.apple && (
+          <AuthProviderButton
+            provider="apple"
+            disabled={busy}
+            onClick={() => void auth.startSignIn("apple")}
+          />
+        )}
+        {auth.options.state === "ready" && auth.options.google && (
+          <AuthProviderButton
+            provider="google"
+            disabled={busy}
+            onClick={() => void auth.startSignIn("google")}
+          />
+        )}
+      </div>
+    </main>
+  );
+}
+
+function ConfirmAccount({
+  auth,
+  view,
+}: {
+  auth: AuthFlowController;
+  view: Extract<AuthFlowController["view"], { kind: "confirm" }>;
+}) {
+  const provider = providerName(view.targetProvider);
+  return (
+    <main className="auth-flow-screen">
+      <header className="auth-flow-header">
+        <button className="auth-back" onClick={() => void auth.cancel()}>
+          ← BACK
+        </button>
+        <h1>Create your account</h1>
+        <p className="auth-intro">
+          Your workouts and training plan will be saved here.
+        </p>
+      </header>
+      <div className="auth-flow-body">
+        <section className="auth-identity">
+          <div className="avatar" aria-hidden="true">
+            {view.profile.name
+              .split(/\s+/)
+              .filter(Boolean)
+              .slice(0, 2)
+              .map((part) => part[0]!.toUpperCase())
+              .join("") || "R"}
+          </div>
+          <div className="auth-identity-copy">
+            <p className="auth-identity-name">{view.profile.name}</p>
+            <p className="auth-identity-email">{view.profile.email}</p>
+          </div>
+        </section>
+        <div className="auth-explain">
+          <p>
+            This makes a new Ergomatic account. If you already row here, sign in
+            the way you usually do and add {provider} from You.
+          </p>
+        </div>
+        <div className="auth-actions">
+          <button
+            className="button-l1"
+            onClick={() => void auth.confirmAccount()}
+          >
+            Create account
+          </button>
+          <button
+            className="button-l2"
+            onClick={() => void auth.useUsualSignIn()}
+          >
+            I already have an account
+          </button>
+        </div>
+      </div>
+    </main>
+  );
+}
+
+function EmailNeeded({ auth }: { auth: AuthFlowController }) {
+  return (
+    <main className="auth-flow-screen">
+      <header className="auth-flow-header">
+        <button className="auth-back" onClick={auth.reset}>
+          ← BACK
+        </button>
+        <h1>Email needed</h1>
+        <p className="auth-intro">
+          We need an email to create a new Ergomatic account.
+        </p>
+      </header>
+      <div className="auth-flow-body">
+        <p className="notice auth-notice-error" role="alert">
+          This Apple account didn’t provide an email address. Continue with
+          Google.
+        </p>
+        <div className="auth-explain">
+          <p>
+            No account was created. If this Apple sign-in is already linked to
+            an Ergomatic account, returning sign-in still works from its Apple
+            identity.
+          </p>
+        </div>
+        <div className="auth-actions">
+          <AuthProviderButton
+            provider="google"
+            onClick={() => void auth.startSignIn("google")}
+          />
+          <button className="button-l2" onClick={auth.reset}>
+            Back to all options
+          </button>
+        </div>
+      </div>
+    </main>
+  );
+}
+
+function UsualSignIn({
+  auth,
+  provider,
+}: {
+  auth: AuthFlowController;
+  provider: "apple" | "google";
+}) {
+  const add = provider === "apple" ? "Google" : "Apple";
+  return (
+    <main className="signin">
+      <h1>Sign in to your account</h1>
+      <p className="auth-intro">
+        Use your usual sign-in. Then open You → Sign-in methods to add {add}.
+        Your workouts stay with the account you already have.
+      </p>
+      <AuthProviderButton
+        provider={provider}
+        onClick={() => void auth.startSignIn(provider)}
+      />
+      <button className="auth-back" onClick={auth.reset}>
+        ← ALL SIGN-IN OPTIONS
+      </button>
+    </main>
+  );
+}
+
+export default function SignIn({
+  onSignedIn,
+  auth,
+}: {
+  onSignedIn?: () => void;
+  auth?: AuthFlowController;
+}) {
   const params = new URLSearchParams(window.location.search);
   const denied = params.get("denied");
   const failed = params.get("error") === "signin_failed";
   const [nativeError, setNativeError] = useState<string | null>(null);

+  if (auth) {
+    if (auth.view.kind === "confirm") {
+      return <ConfirmAccount auth={auth} view={auth.view} />;
+    }
+    if (auth.view.kind === "usual") {
+      return <UsualSignIn auth={auth} provider={auth.view.provider} />;
+    }
+    if (
+      auth.view.kind === "error" &&
+      auth.view.purpose === "signin" &&
+      auth.view.code === "email_required" &&
+      auth.view.targetProvider === "apple"
+    ) {
+      return <EmailNeeded auth={auth} />;
+    }
+    if (auth.options.state === "ready" && auth.options.legacyGoogle) {
+      return (
+        <main className="signin">
+          <h1>Ergomatic</h1>
+          <p className="tagline">Rowing workout tracker &amp; planner.</p>
+          {denied && (
+            <p className="notice" role="alert">
+              {denied} isn&apos;t invited to this Ergomatic. Ask James to add
+              you.
+            </p>
+          )}
+          {failed && (
+            <p className="notice" role="alert">
+              That sign-in didn&apos;t work. Give it another try.
+            </p>
+          )}
+          {nativeError && (
+            <p className="notice" role="alert">
+              {nativeError}
+            </p>
+          )}
+          <SignInButton onSignedIn={onSignedIn} onError={setNativeError} />
+        </main>
+      );
+    }
+    return <Welcome auth={auth} />;
+  }
+
   return (
     <main className="signin">
       <h1>Ergomatic</h1>
diff --git a/app/src/You.tsx b/app/src/You.tsx
index 5d07363d8ce50cb913138da8b8c8c3e66d9596f6..42cc163145853d26820bf06d488919df1133aaf5 100644
--- a/app/src/You.tsx
+++ b/app/src/You.tsx
@@ -1,11 +1,13 @@
 import { useState } from "react";
 import { Link } from "react-router-dom";
 import type { Me } from "./useMe";
+import type { AuthFlowController } from "./adapters/authFlow";
 import { signOut as authSignOut } from "./adapters/auth";
 import BaselinesRow from "./you/BaselinesRow";
 import { clearConcept2Seen } from "./you/concept2Seen";
 import Concept2Row from "./you/Concept2Row";
 import YouStatsHero from "./you/stats/YouStatsHero";
+import SignInMethods from "./you/SignInMethods";

 function initials(name: string): string {
   return name
@@ -19,9 +21,11 @@ function initials(name: string): string {
 export default function You({
   user,
   onSignedOut,
+  authFlow,
 }: {
   user: Me;
   onSignedOut: () => void;
+  authFlow?: AuthFlowController;
 }) {
   // AUD-014's unmet half. The DANGEROUS state was never reachable — the
   // transition below runs AFTER the await, so a failed sign-out leaves the
@@ -80,6 +84,7 @@ export default function You({
               setSignOutFailed(true);
               return;
             }
+            authFlow?.abandon();
             onSignedOut();
           }}
         >
@@ -92,6 +97,7 @@ export default function You({
           covers. It IS the door to /you/stats; `.you-doors` below gains no
           STATS row. */}
       <YouStatsHero />
+      {authFlow && <SignInMethods auth={authFlow} />}
       {/* THE DOORS (Wave E PR A, spec 2026-09-04-concept2-walk-fixes §5.1,
           Gate 0 amendment §8 approved 2026-09-04; THIRD ROW added by the
           baselines-subpage Gate 0, 2026-09-05): the foot of You is one
diff --git a/app/src/adapters/authFlow.test.tsx b/app/src/adapters/authFlow.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..7f450935606b61ff0c6d4f909f6a8dbeea2f302a
--- /dev/null
+++ b/app/src/adapters/authFlow.test.tsx
@@ -0,0 +1,1103 @@
+import {
+  act,
+  fireEvent,
+  render,
+  renderHook,
+  screen,
+  waitFor,
+} from "@testing-library/react";
+import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
+
+const seam = vi.hoisted(() => ({
+  native: false,
+  api: vi.fn(),
+  appleAuthorize: vi.fn(),
+  googleInit: vi.fn(),
+  googleProof: vi.fn(),
+  storeToken: vi.fn(),
+  navigateWeb: vi.fn(),
+}));
+
+vi.mock("../platform", () => ({ isNative: () => seam.native }));
+vi.mock("../api", () => ({ api: seam.api }));
+vi.mock("../native/appleAuth", () => ({
+  AppleAuth: { authorize: seam.appleAuthorize },
+}));
+vi.mock("../native/signin", () => ({
+  initNativeAuth: seam.googleInit,
+  nativeGoogleProof: seam.googleProof,
+  nativeGoogleProofAfterInit: seam.googleProof,
+}));
+vi.mock("../native/session", () => ({ storeToken: seam.storeToken }));
+vi.mock("./webNavigate", () => ({ navigateWeb: seam.navigateWeb }));
+
+import { useAuthFlow } from "./authFlow";
+import LinkSignInMethod from "../auth/LinkSignInMethod";
+
+function deferred<T>() {
+  let resolve!: (value: T) => void;
+  const promise = new Promise<T>((next) => {
+    resolve = next;
+  });
+  return { promise, resolve };
+}
+
+const ok = (body: unknown, status = 200) =>
+  new Response(JSON.stringify(body), {
+    status,
+    headers: { "Content-Type": "application/json" },
+  });
+
+const options = {
+  frontDoorEnabled: true,
+  apple: { native: true, web: true },
+  google: { native: true, web: true },
+};
+
+beforeEach(() => {
+  seam.native = false;
+  seam.api.mockReset();
+  seam.appleAuthorize.mockReset();
+  seam.googleInit.mockReset();
+  seam.googleInit.mockResolvedValue(undefined);
+  seam.googleProof.mockReset();
+  seam.storeToken.mockReset();
+  seam.navigateWeb.mockReset();
+  window.history.replaceState(null, "", "/");
+});
+
+afterEach(() => {
+  vi.restoreAllMocks();
+});
+
+describe("useAuthFlow", () => {
+  it("falls back to the legacy Google door when an older server has no options endpoint", async () => {
+    seam.api.mockResolvedValue(new Response(null, { status: 404 }));
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    expect(result.current.options).toStrictEqual({
+      state: "ready",
+      frontDoorEnabled: false,
+      legacyGoogle: true,
+      apple: false,
+      google: true,
+    });
+  });
+
+  it("does not resurrect a native link begin after You sign-out abandons it", async () => {
+    seam.native = true;
+    let resolveBegin!: (response: Response) => void;
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return new Promise<Response>((resolve) => {
+          resolveBegin = resolve;
+        });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    act(() => result.current.prepareLink("apple"));
+    let pending!: Promise<void>;
+    await act(async () => {
+      pending = result.current.startPreparedLink();
+      await Promise.resolve();
+    });
+
+    // `/you/sign-in-methods` is a normal history entry. Back can reveal You
+    // while this request is pending; successful sign-out calls abandon().
+    act(() => result.current.abandon());
+    await act(async () => {
+      resolveBegin(
+        ok({
+          outcome: "authorize",
+          attemptId: "late-link",
+          purpose: "link",
+          targetProvider: "apple",
+          expiresAt: "soon",
+          provider: "google",
+          stage: "reauth",
+          nonce: "late-nonce",
+          state: "late-state",
+          bindingSecret: "late-binding",
+        }),
+      );
+      await pending;
+    });
+
+    expect(seam.googleProof).not.toHaveBeenCalled();
+    expect(result.current.view).toStrictEqual({ kind: "idle" });
+  });
+
+  it("keeps one rendered native target action in flight through provider, proof, and finalization", async () => {
+    seam.native = true;
+    seam.googleProof.mockResolvedValue({ idToken: "google-proof" });
+    const appleProof = deferred<{
+      idToken: string;
+      authorizationCode: string;
+      state: string;
+    }>();
+    const targetProof = deferred<Response>();
+    const finalization = deferred<Response>();
+    seam.appleAuthorize.mockReturnValue(appleProof.promise);
+    let proofCount = 0;
+    let cancelCount = 0;
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "single-flight",
+          purpose: "link",
+          targetProvider: "apple",
+          expiresAt: "soon",
+          provider: "google",
+          stage: "reauth",
+          nonce: "google-nonce",
+          state: "google-state",
+          bindingSecret: "single-binding",
+        });
+      }
+      if (path === "/api/auth/native/attempts/single-flight/proof") {
+        proofCount += 1;
+        if (proofCount === 1) {
+          return ok({
+            outcome: "authorize",
+            attemptId: "single-flight",
+            purpose: "link",
+            targetProvider: "apple",
+            expiresAt: "soon",
+            provider: "apple",
+            stage: "target",
+            nonce: "apple-nonce",
+            state: "apple-state",
+          });
+        }
+        return targetProof.promise;
+      }
+      if (path === "/api/auth/native/attempts/single-flight/finalize") {
+        return finalization.promise;
+      }
+      if (path === "/api/auth/native/attempts/single-flight/cancel") {
+        cancelCount += 1;
+        return new Response(null, { status: 204 });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+
+    let auth!: ReturnType<typeof useAuthFlow>;
+    function Harness() {
+      auth = useAuthFlow(() => {});
+      return (
+        <>
+          <button onClick={() => auth.prepareLink("apple")}>Add Apple</button>
+          <LinkSignInMethod auth={auth} />
+        </>
+      );
+    }
+    render(<Harness />);
+    await waitFor(() => expect(auth.options.state).toBe("ready"));
+    fireEvent.click(screen.getByRole("button", { name: "Add Apple" }));
+    fireEvent.click(
+      await screen.findByRole("button", { name: "Confirm with Google" }),
+    );
+    const target = await screen.findByRole("button", {
+      name: "Continue with Apple",
+    });
+
+    act(() => {
+      fireEvent.click(target);
+      fireEvent.click(target);
+    });
+    await waitFor(() => expect(seam.appleAuthorize).toHaveBeenCalledOnce());
+    expect(target).toBeDisabled();
+    expect(cancelCount).toBe(0);
+
+    await act(async () => {
+      appleProof.resolve({
+        idToken: "apple-proof",
+        authorizationCode: "apple-code",
+        state: "apple-state",
+      });
+      await waitFor(() => expect(proofCount).toBe(2));
+    });
+    await act(async () => auth.authorizeLinkTarget());
+    expect(seam.appleAuthorize).toHaveBeenCalledOnce();
+    expect(cancelCount).toBe(0);
+
+    await act(async () => {
+      targetProof.resolve(
+        ok({
+          outcome: "link_ready",
+          attemptId: "single-flight",
+          purpose: "link",
+          targetProvider: "apple",
+          expiresAt: "soon",
+        }),
+      );
+      await Promise.resolve();
+    });
+    await act(async () => auth.authorizeLinkTarget());
+    expect(seam.appleAuthorize).toHaveBeenCalledOnce();
+    expect(cancelCount).toBe(0);
+
+    await act(async () => {
+      finalization.resolve(ok({ outcome: "linked" }));
+      await Promise.resolve();
+    });
+    await waitFor(() =>
+      expect(auth.view).toStrictEqual({
+        kind: "linked",
+        targetProvider: "apple",
+      }),
+    );
+    expect(cancelCount).toBe(0);
+  });
+
+  it("keeps a newly prepared link when an older provider cancellation finishes cleanup", async () => {
+    seam.native = true;
+    seam.googleProof.mockResolvedValue({ idToken: "google-proof" });
+    seam.appleAuthorize.mockRejectedValue({ code: "cancelled" });
+    const cancelResponse = deferred<Response>();
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "stale-cancel",
+          purpose: "link",
+          targetProvider: "apple",
+          expiresAt: "soon",
+          provider: "google",
+          stage: "reauth",
+          nonce: "google-nonce",
+          state: "google-state",
+          bindingSecret: "cancel-binding",
+        });
+      }
+      if (path === "/api/auth/native/attempts/stale-cancel/proof") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "stale-cancel",
+          purpose: "link",
+          targetProvider: "apple",
+          expiresAt: "soon",
+          provider: "apple",
+          stage: "target",
+          nonce: "apple-nonce",
+          state: "apple-state",
+        });
+      }
+      if (path === "/api/auth/native/attempts/stale-cancel/cancel") {
+        return cancelResponse.promise;
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+
+    let auth!: ReturnType<typeof useAuthFlow>;
+    function Harness() {
+      auth = useAuthFlow(() => {});
+      return (
+        <>
+          <button onClick={() => auth.prepareLink("apple")}>Add Apple</button>
+          <button onClick={() => auth.prepareLink("google")}>Add Google</button>
+          <LinkSignInMethod auth={auth} />
+        </>
+      );
+    }
+    render(<Harness />);
+    await waitFor(() => expect(auth.options.state).toBe("ready"));
+    fireEvent.click(screen.getByRole("button", { name: "Add Apple" }));
+    fireEvent.click(
+      await screen.findByRole("button", { name: "Confirm with Google" }),
+    );
+    fireEvent.click(
+      await screen.findByRole("button", { name: "Continue with Apple" }),
+    );
+    await waitFor(() =>
+      expect(seam.api).toHaveBeenCalledWith(
+        "/api/auth/native/attempts/stale-cancel/cancel",
+        expect.anything(),
+      ),
+    );
+
+    fireEvent.click(screen.getByRole("button", { name: "Add Google" }));
+    expect(screen.getByRole("heading", { name: "Add Google" })).toBeVisible();
+    await act(async () => {
+      cancelResponse.resolve(new Response(null, { status: 204 }));
+      await Promise.resolve();
+    });
+    expect(auth.view).toStrictEqual({
+      kind: "link_confirm",
+      targetProvider: "google",
+    });
+    expect(screen.getByRole("heading", { name: "Add Google" })).toBeVisible();
+  });
+
+  it("does not launch Google after initialization loses its operation", async () => {
+    seam.native = true;
+    seam.appleAuthorize.mockResolvedValue({
+      idToken: "apple-proof",
+      authorizationCode: "apple-code",
+      state: "apple-state",
+    });
+    const initialization = deferred<void>();
+    seam.googleInit.mockReturnValue(initialization.promise);
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "held-init",
+          purpose: "link",
+          targetProvider: "google",
+          expiresAt: "soon",
+          provider: "apple",
+          stage: "reauth",
+          nonce: "apple-nonce",
+          state: "apple-state",
+          bindingSecret: "init-binding",
+        });
+      }
+      if (path === "/api/auth/native/attempts/held-init/proof") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "held-init",
+          purpose: "link",
+          targetProvider: "google",
+          expiresAt: "soon",
+          provider: "google",
+          stage: "target",
+          nonce: "google-nonce",
+          state: "google-state",
+        });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+
+    let auth!: ReturnType<typeof useAuthFlow>;
+    function Harness() {
+      auth = useAuthFlow(() => {});
+      return (
+        <>
+          <button onClick={() => auth.prepareLink("google")}>Add Google</button>
+          <button onClick={() => auth.prepareLink("apple")}>Add Apple</button>
+          <LinkSignInMethod auth={auth} />
+        </>
+      );
+    }
+    render(<Harness />);
+    await waitFor(() => expect(auth.options.state).toBe("ready"));
+    fireEvent.click(screen.getByRole("button", { name: "Add Google" }));
+    fireEvent.click(
+      await screen.findByRole("button", { name: "Confirm with Apple" }),
+    );
+    fireEvent.click(
+      await screen.findByRole("button", { name: "Continue with Google" }),
+    );
+    await waitFor(() => expect(seam.googleInit).toHaveBeenCalledOnce());
+
+    fireEvent.click(screen.getByRole("button", { name: "Add Apple" }));
+    await act(async () => {
+      initialization.resolve();
+      await Promise.resolve();
+    });
+    expect(seam.googleProof).not.toHaveBeenCalled();
+    expect(auth.view).toStrictEqual({
+      kind: "link_confirm",
+      targetProvider: "apple",
+    });
+  });
+
+  it("keeps native Apple credentials and the binding secret out of the screen view", async () => {
+    seam.native = true;
+    seam.appleAuthorize.mockResolvedValue({
+      idToken: "apple-id-token",
+      authorizationCode: "apple-code",
+      state: "apple-state",
+      name: "Maya Chen",
+    });
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "attempt-1",
+          purpose: "signin",
+          targetProvider: "apple",
+          expiresAt: "2026-09-13T00:05:00.000Z",
+          provider: "apple",
+          stage: "signin",
+          nonce: "apple-nonce",
+          state: "apple-state",
+          bindingSecret: "device-binding",
+        });
+      }
+      if (path === "/api/auth/native/attempts/attempt-1/proof") {
+        return ok({
+          outcome: "confirm",
+          attemptId: "attempt-1",
+          purpose: "signin",
+          targetProvider: "apple",
+          expiresAt: "2026-09-13T00:10:00.000Z",
+          profile: {
+            email: "9m3x7k2p1r@privaterelay.appleid.com",
+            name: "Maya Chen",
+          },
+        });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    await act(async () => result.current.startSignIn("apple"));
+
+    expect(seam.appleAuthorize).toHaveBeenCalledWith({
+      nonce: "apple-nonce",
+      state: "apple-state",
+    });
+    const proofCall = seam.api.mock.calls.find(
+      ([path]) => path === "/api/auth/native/attempts/attempt-1/proof",
+    );
+    expect(proofCall).toBeDefined();
+    expect(
+      JSON.parse((proofCall![1] as RequestInit).body as string),
+    ).toStrictEqual({
+      bindingSecret: "device-binding",
+      state: "apple-state",
+      idToken: "apple-id-token",
+      authorizationCode: "apple-code",
+      name: "Maya Chen",
+    });
+    expect(result.current.view).toStrictEqual({
+      kind: "confirm",
+      targetProvider: "apple",
+      profile: {
+        email: "9m3x7k2p1r@privaterelay.appleid.com",
+        name: "Maya Chen",
+      },
+    });
+    expect(JSON.stringify(result.current.view)).not.toMatch(
+      /apple-id-token|apple-code|apple-state|device-binding|apple-nonce/,
+    );
+  });
+
+  it("forces nonce-bound Google reauthentication before exposing the target-provider step", async () => {
+    seam.native = true;
+    seam.googleProof.mockResolvedValue({ idToken: "google-proof" });
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "link-1",
+          purpose: "link",
+          targetProvider: "apple",
+          expiresAt: "2026-09-13T00:05:00.000Z",
+          provider: "google",
+          stage: "reauth",
+          nonce: "reauth-nonce",
+          state: "reauth-state",
+          bindingSecret: "link-binding",
+        });
+      }
+      if (path === "/api/auth/native/attempts/link-1/proof") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "link-1",
+          purpose: "link",
+          targetProvider: "apple",
+          expiresAt: "2026-09-13T00:10:00.000Z",
+          provider: "apple",
+          stage: "target",
+          nonce: "target-nonce",
+          state: "target-state",
+        });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    act(() => result.current.prepareLink("apple"));
+    await act(async () => result.current.startPreparedLink());
+
+    expect(seam.googleProof).toHaveBeenCalledWith("reauth-nonce");
+    expect(result.current.view).toStrictEqual({
+      kind: "link_authorize",
+      targetProvider: "apple",
+      provider: "apple",
+      existingProofComplete: true,
+    });
+  });
+
+  it("stores only the returned Ergomatic token before announcing native sign-in", async () => {
+    seam.native = true;
+    seam.googleProof.mockResolvedValue({ idToken: "google-proof" });
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "signin-1",
+          purpose: "signin",
+          targetProvider: "google",
+          expiresAt: "2026-09-13T00:05:00.000Z",
+          provider: "google",
+          stage: "signin",
+          nonce: "google-nonce",
+          state: "google-state",
+          bindingSecret: "binding",
+        });
+      }
+      return ok({
+        outcome: "signed_in",
+        user: { id: "u1", email: "maya@example.com", name: "Maya" },
+        expiresAt: "2026-11-12T00:00:00.000Z",
+        token: "ergomatic-session",
+      });
+    });
+    const onSignedIn = vi.fn();
+    const { result } = renderHook(() => useAuthFlow(onSignedIn));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    await act(async () => result.current.startSignIn("google"));
+    expect(seam.storeToken).toHaveBeenCalledWith("ergomatic-session");
+    expect(onSignedIn).toHaveBeenCalledOnce();
+    expect(result.current.view).toStrictEqual({ kind: "idle" });
+  });
+
+  it("consumes a web attempt query before resuming its account confirmation", async () => {
+    window.history.replaceState(null, "", "/?authAttempt=attempt-web&keep=1");
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/web/attempts/attempt-web") {
+        return ok({
+          outcome: "confirm",
+          attemptId: "attempt-web",
+          purpose: "signin",
+          targetProvider: "apple",
+          expiresAt: "2026-09-13T00:05:00.000Z",
+          profile: { email: "relay@privaterelay.appleid.com", name: "Rower" },
+        });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));
+    expect(window.location.search).toBe("?keep=1");
+  });
+
+  it("maps a web account-switch rejection to the exact link notice without raw text", async () => {
+    window.history.replaceState(
+      null,
+      "",
+      "/?authError=account_changed&authPurpose=link&authProvider=apple",
+    );
+    seam.api.mockResolvedValue(ok(options));
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.view.kind).toBe("error"));
+    expect(result.current.view).toStrictEqual({
+      kind: "error",
+      purpose: "link",
+      code: "account_changed",
+      targetProvider: "apple",
+    });
+    expect(window.location.search).toBe("");
+  });
+
+  it("navigates the server-owned web URL and confirms an unseen account", async () => {
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/web/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "web-signin",
+          purpose: "signin",
+          targetProvider: "google",
+          expiresAt: "soon",
+          provider: "google",
+          stage: "signin",
+          nonce: "nonce",
+          state: "state",
+          authorizationUrl: "https://accounts.example/authorize",
+        });
+      }
+      if (path === "/api/auth/web/attempts/web-signin/confirm") {
+        return ok({
+          outcome: "signed_in",
+          user: { id: "u1", email: "maya@example.com", name: "Maya" },
+          expiresAt: "later",
+        });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const onSignedIn = vi.fn();
+    const { result } = renderHook(() => useAuthFlow(onSignedIn));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    await act(async () => result.current.startSignIn("google"));
+    expect(seam.navigateWeb).toHaveBeenCalledWith(
+      "https://accounts.example/authorize",
+    );
+
+    window.history.replaceState(null, "", "/?authAttempt=web-confirm");
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/web/attempts/web-confirm") {
+        return ok({
+          outcome: "confirm",
+          attemptId: "web-confirm",
+          purpose: "signin",
+          targetProvider: "google",
+          expiresAt: "soon",
+          profile: { email: "maya@example.com", name: "Maya" },
+        });
+      }
+      if (path === "/api/auth/web/attempts/web-confirm/confirm") {
+        return ok({
+          outcome: "signed_in",
+          user: { id: "u1", email: "maya@example.com", name: "Maya" },
+          expiresAt: "later",
+        });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const second = renderHook(() => useAuthFlow(onSignedIn));
+    await waitFor(() =>
+      expect(second.result.current.view.kind).toBe("confirm"),
+    );
+    await act(async () => second.result.current.confirmAccount());
+    expect(onSignedIn).toHaveBeenCalledOnce();
+  });
+
+  it("cancels confirmation before directing an existing rower to the usual provider", async () => {
+    window.history.replaceState(null, "", "/?authAttempt=usual");
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/web/attempts/usual") {
+        return ok({
+          outcome: "confirm",
+          attemptId: "usual",
+          purpose: "signin",
+          targetProvider: "apple",
+          expiresAt: "soon",
+          profile: { email: "relay@apple.test", name: "Rower" },
+        });
+      }
+      if (path === "/api/auth/web/attempts/usual/cancel") {
+        return new Response(null, { status: 204 });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));
+    await act(async () => result.current.useUsualSignIn());
+    expect(result.current.view).toStrictEqual({
+      kind: "usual",
+      provider: "google",
+    });
+    act(() => result.current.reset());
+    expect(result.current.view).toStrictEqual({ kind: "idle" });
+    act(() => result.current.prepareLink("google"));
+    act(() => result.current.abandon());
+    expect(result.current.view).toStrictEqual({ kind: "idle" });
+  });
+
+  it("turns native provider cancellation into a silent provider-aware terminal state", async () => {
+    seam.native = true;
+    seam.appleAuthorize.mockRejectedValue({ code: "cancelled" });
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "cancel-native",
+          purpose: "signin",
+          targetProvider: "apple",
+          expiresAt: "soon",
+          provider: "apple",
+          stage: "signin",
+          nonce: "nonce",
+          state: "state",
+          bindingSecret: "binding",
+        });
+      }
+      if (path === "/api/auth/native/attempts/cancel-native/cancel") {
+        return new Response(null, { status: 204 });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    await act(async () => result.current.startSignIn("apple"));
+    expect(result.current.view).toStrictEqual({
+      kind: "cancelled",
+      purpose: "signin",
+      targetProvider: "apple",
+    });
+  });
+
+  it("recognizes the Google plugin's interactive cancellation code", async () => {
+    seam.native = true;
+    seam.googleProof.mockRejectedValue({ code: "USER_CANCELLED" });
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "cancel-google",
+          purpose: "signin",
+          targetProvider: "google",
+          expiresAt: "soon",
+          provider: "google",
+          stage: "signin",
+          nonce: "nonce",
+          state: "state",
+          bindingSecret: "binding",
+        });
+      }
+      return new Response(null, { status: 204 });
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    await act(async () => result.current.startSignIn("google"));
+    expect(result.current.view.kind).toBe("cancelled");
+  });
+
+  it("maps a native proof rejection to its allowlisted code and erases the attempt", async () => {
+    seam.native = true;
+    seam.appleAuthorize.mockResolvedValue({
+      idToken: "id",
+      authorizationCode: "code",
+      state: "state",
+    });
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "bad-proof",
+          purpose: "signin",
+          targetProvider: "apple",
+          expiresAt: "soon",
+          provider: "apple",
+          stage: "signin",
+          nonce: "nonce",
+          state: "state",
+          bindingSecret: "binding",
+        });
+      }
+      if (path === "/api/auth/native/attempts/bad-proof/proof") {
+        return ok({ error: "invalid_proof" }, 401);
+      }
+      if (path === "/api/auth/native/attempts/bad-proof/cancel") {
+        return new Response(null, { status: 204 });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    await act(async () => result.current.startSignIn("apple"));
+    expect(result.current.view).toStrictEqual({
+      kind: "error",
+      purpose: "signin",
+      code: "invalid_proof",
+      targetProvider: "apple",
+    });
+  });
+
+  it("finishes both nonce-bound native link proofs and finalizes", async () => {
+    seam.native = true;
+    seam.googleProof.mockResolvedValue({ idToken: "google-id" });
+    seam.appleAuthorize.mockResolvedValue({
+      idToken: "apple-id",
+      authorizationCode: "apple-code",
+      state: "apple-state",
+    });
+    let proof = 0;
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "link-complete",
+          purpose: "link",
+          targetProvider: "apple",
+          expiresAt: "soon",
+          provider: "google",
+          stage: "reauth",
+          nonce: "google-nonce",
+          state: "google-state",
+          bindingSecret: "binding",
+        });
+      }
+      if (path === "/api/auth/native/attempts/link-complete/proof") {
+        proof += 1;
+        return ok(
+          proof === 1
+            ? {
+                outcome: "authorize",
+                attemptId: "link-complete",
+                purpose: "link",
+                targetProvider: "apple",
+                expiresAt: "soon",
+                provider: "apple",
+                stage: "target",
+                nonce: "apple-nonce",
+                state: "apple-state",
+              }
+            : {
+                outcome: "link_ready",
+                attemptId: "link-complete",
+                purpose: "link",
+                targetProvider: "apple",
+                expiresAt: "soon",
+              },
+        );
+      }
+      if (path === "/api/auth/native/attempts/link-complete/finalize") {
+        return ok({ outcome: "linked" });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    act(() => result.current.prepareLink("apple"));
+    await act(async () => result.current.startPreparedLink());
+    await act(async () => result.current.authorizeLinkTarget());
+    expect(result.current.view).toStrictEqual({
+      kind: "linked",
+      targetProvider: "apple",
+    });
+  });
+
+  it.each([
+    ["/?authResult=signed_in", { signedCalls: 1, kind: "idle" }],
+    [
+      "/?authResult=cancelled&authPurpose=link&authProvider=google",
+      { signedCalls: 0, kind: "cancelled" },
+    ],
+    [
+      "/?authError=made_up&authPurpose=signin",
+      { signedCalls: 0, kind: "error" },
+    ],
+  ])("consumes terminal web return %s", async (url, expected) => {
+    window.history.replaceState(null, "", url);
+    seam.api.mockResolvedValue(ok(options));
+    const onSignedIn = vi.fn();
+    const { result } = renderHook(() => useAuthFlow(onSignedIn));
+    await waitFor(() =>
+      expect({
+        signedCalls: onSignedIn.mock.calls.length,
+        kind: result.current.view.kind,
+      }).toStrictEqual(expected),
+    );
+    expect(window.location.search).toBe("");
+  });
+
+  it.each([
+    ["/?authResult=cancelled&authPurpose=signin", "cancelled", undefined],
+    [
+      "/?authError=account_conflict&authPurpose=signin",
+      "error",
+      "account_conflict",
+    ],
+  ])(
+    "keeps an unbound generic return providerless: %s",
+    async (url, kind, code) => {
+      window.history.replaceState(null, "", url);
+      seam.api.mockResolvedValue(ok(options));
+      const { result } = renderHook(() => useAuthFlow(() => {}));
+      await waitFor(() => expect(result.current.view.kind).toBe(kind));
+      expect(result.current.view).toStrictEqual({
+        kind,
+        purpose: "signin",
+        ...(code ? { code } : {}),
+      });
+      expect(window.location.search).toBe("");
+    },
+  );
+
+  it.each([
+    null,
+    {},
+    { apple: {} },
+    { apple: { native: true, web: true }, google: {} },
+  ])("falls back when options are malformed: %j", async (body) => {
+    seam.api.mockResolvedValue(ok(body));
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() =>
+      expect(result.current.options).toStrictEqual({
+        state: "ready",
+        frontDoorEnabled: false,
+        legacyGoogle: true,
+        apple: false,
+        google: true,
+      }),
+    );
+  });
+
+  it("resumes a web target proof, navigates it, and cancels the bound operation", async () => {
+    window.history.replaceState(null, "", "/?authAttempt=web-link");
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/web/attempts/web-link") {
+        return ok({
+          outcome: "authorize",
+          attemptId: "web-link",
+          purpose: "link",
+          targetProvider: "google",
+          expiresAt: "soon",
+          provider: "google",
+          stage: "target",
+          nonce: "nonce",
+          state: "state",
+          authorizationUrl: "https://accounts.example/target",
+        });
+      }
+      if (path === "/api/auth/web/attempts/web-link/cancel") {
+        return new Response(null, { status: 204 });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() =>
+      expect(result.current.view.kind).toBe("link_authorize"),
+    );
+    await act(async () => result.current.authorizeLinkTarget());
+    expect(seam.navigateWeb).toHaveBeenCalledWith(
+      "https://accounts.example/target",
+    );
+    await act(async () => result.current.cancel());
+    expect(result.current.view).toStrictEqual({
+      kind: "cancelled",
+      purpose: "link",
+      targetProvider: "google",
+    });
+  });
+
+  it("resumes link_ready and performs web finalization", async () => {
+    window.history.replaceState(null, "", "/?authAttempt=web-ready");
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/web/attempts/web-ready") {
+        return ok({
+          outcome: "link_ready",
+          attemptId: "web-ready",
+          purpose: "link",
+          targetProvider: "google",
+          expiresAt: "soon",
+        });
+      }
+      if (path === "/api/auth/web/attempts/web-ready/finalize") {
+        return ok({ outcome: "linked" });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.view.kind).toBe("linked"));
+    expect(result.current.view).toStrictEqual({
+      kind: "linked",
+      targetProvider: "google",
+    });
+  });
+
+  it.each([
+    [ok({ error: "rate_limited" }, 429), "rate_limited"],
+    [new Response("not-json", { status: 500 }), "signin_failed"],
+  ])(
+    "maps a failed web resume without surfacing its body",
+    async (response, code) => {
+      window.history.replaceState(
+        null,
+        "",
+        "/?authAttempt=failed&authProvider=apple",
+      );
+      seam.api.mockImplementation(async (path: string) =>
+        path === "/api/auth/options" ? ok(options) : response,
+      );
+      const { result } = renderHook(() => useAuthFlow(() => {}));
+      await waitFor(() => expect(result.current.view.kind).toBe("error"));
+      expect(result.current.view).toStrictEqual({
+        kind: "error",
+        purpose: "signin",
+        code,
+        targetProvider: "apple",
+      });
+    },
+  );
+
+  it("confirms a native account with its binding and stores the session token", async () => {
+    seam.native = true;
+    let confirmBody: unknown;
+    seam.api.mockImplementation(async (path: string, init?: RequestInit) => {
+      if (path === "/api/auth/options") return ok(options);
+      if (path === "/api/auth/native/attempts") {
+        return ok({
+          outcome: "confirm",
+          attemptId: "native-confirm",
+          purpose: "signin",
+          targetProvider: "google",
+          expiresAt: "soon",
+          profile: { email: "maya@example.com", name: "Maya" },
+          bindingSecret: "binding",
+        });
+      }
+      if (path === "/api/auth/native/attempts/native-confirm/confirm") {
+        confirmBody = JSON.parse(init!.body as string);
+        return ok({
+          outcome: "signed_in",
+          user: { id: "u1", email: "maya@example.com", name: "Maya" },
+          expiresAt: "later",
+          token: "session-token",
+        });
+      }
+      throw new Error(`unexpected ${path}`);
+    });
+    const onSignedIn = vi.fn();
+    const { result } = renderHook(() => useAuthFlow(onSignedIn));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    await act(async () => result.current.startSignIn("google"));
+    await act(async () => result.current.confirmAccount());
+    expect(confirmBody).toStrictEqual({ bindingSecret: "binding" });
+    expect(seam.storeToken).toHaveBeenCalledWith("session-token");
+    expect(onSignedIn).toHaveBeenCalledOnce();
+  });
+
+  it("rejects native signed_in without an Ergomatic token", async () => {
+    seam.native = true;
+    seam.api.mockImplementation(async (path: string) => {
+      if (path === "/api/auth/options") return ok(options);
+      return ok({
+        outcome: "signed_in",
+        user: { id: "u1", email: "maya@example.com", name: "Maya" },
+        expiresAt: "later",
+      });
+    });
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    await act(async () => result.current.startSignIn("google"));
+    expect(result.current.view).toStrictEqual({
+      kind: "error",
+      purpose: "signin",
+      code: "signin_failed",
+      targetProvider: "google",
+    });
+  });
+
+  it("makes controller guards and an empty cancel safe no-ops", async () => {
+    seam.api.mockResolvedValue(ok(options));
+    const { result } = renderHook(() => useAuthFlow(() => {}));
+    await waitFor(() => expect(result.current.options.state).toBe("ready"));
+    await act(async () => result.current.confirmAccount());
+    await act(async () => result.current.useUsualSignIn());
+    await act(async () => result.current.startPreparedLink());
+    await act(async () => result.current.authorizeLinkTarget());
+    await act(async () => result.current.cancel());
+    expect(result.current.view).toStrictEqual({
+      kind: "cancelled",
+      purpose: "signin",
+    });
+  });
+});
diff --git a/app/src/adapters/authFlow.ts b/app/src/adapters/authFlow.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d3723e0484a21c2db540fe05b720a21856da4052
--- /dev/null
+++ b/app/src/adapters/authFlow.ts
@@ -0,0 +1,727 @@
+import { useEffect, useMemo, useRef, useState } from "react";
+import type {
+  AuthError,
+  AuthErrorCode,
+  AuthOptions,
+  AuthProvider,
+  AuthPurpose,
+  AuthStep,
+  NativeBegin,
+  SignedIn,
+} from "../../shared/auth";
+import { api } from "../api";
+import { isNative } from "../platform";
+import { navigateWeb } from "./webNavigate";
+
+export type AuthOptionsView =
+  | { state: "loading" }
+  | {
+      state: "ready";
+      frontDoorEnabled: boolean;
+      legacyGoogle: boolean;
+      apple: boolean;
+      google: boolean;
+    };
+
+export type AuthFlowView =
+  | { kind: "idle" }
+  | { kind: "busy"; purpose: AuthPurpose }
+  | {
+      kind: "confirm";
+      targetProvider: AuthProvider;
+      profile: { email: string; name: string };
+    }
+  | { kind: "usual"; provider: AuthProvider }
+  | { kind: "link_confirm"; targetProvider: AuthProvider }
+  | {
+      kind: "link_authorize";
+      targetProvider: AuthProvider;
+      provider: AuthProvider;
+      existingProofComplete: boolean;
+    }
+  | { kind: "linked"; targetProvider: AuthProvider }
+  | {
+      kind: "cancelled";
+      purpose: AuthPurpose;
+      targetProvider?: AuthProvider;
+    }
+  | {
+      kind: "error";
+      purpose: AuthPurpose;
+      code: AuthErrorCode;
+      targetProvider?: AuthProvider;
+    };
+
+export interface AuthFlowController {
+  options: AuthOptionsView;
+  view: AuthFlowView;
+  targetAuthorizationBusy: boolean;
+  destination: "/" | "/you" | "/you/sign-in-methods" | null;
+  startSignIn(provider: AuthProvider): Promise<void>;
+  confirmAccount(): Promise<void>;
+  useUsualSignIn(): Promise<void>;
+  prepareLink(provider: AuthProvider): void;
+  startPreparedLink(): Promise<void>;
+  authorizeLinkTarget(): Promise<void>;
+  cancel(): Promise<void>;
+  reset(): void;
+  abandon(): void;
+}
+
+type ActiveStep = Exclude<AuthStep, SignedIn>;
+
+interface ActiveOperation {
+  step: ActiveStep;
+  bindingSecret?: string;
+  authorizationOwner?: symbol;
+}
+
+interface FlowContext {
+  native: boolean;
+  generation: React.MutableRefObject<number>;
+  operation: React.MutableRefObject<ActiveOperation | null>;
+  onSignedIn: React.MutableRefObject<() => void>;
+  setTargetAuthorizationBusy: React.Dispatch<React.SetStateAction<boolean>>;
+  setView: React.Dispatch<React.SetStateAction<AuthFlowView>>;
+}
+
+const ERROR_CODES = new Set<AuthErrorCode>([
+  "invalid_request",
+  "invalid_proof",
+  "attempt_expired",
+  "account_changed",
+  "account_conflict",
+  "email_required",
+  "unavailable",
+  "rate_limited",
+  "signin_failed",
+]);
+
+const LEGACY_OPTIONS: AuthOptionsView = {
+  state: "ready",
+  frontDoorEnabled: false,
+  legacyGoogle: true,
+  apple: false,
+  google: true,
+};
+
+function isAuthOptions(value: unknown): value is AuthOptions {
+  if (typeof value !== "object" || value === null) return false;
+  const record = value as Record<string, unknown>;
+  for (const provider of ["apple", "google"] as const) {
+    const entry = record[provider];
+    if (typeof entry !== "object" || entry === null) return false;
+    const surface = entry as Record<string, unknown>;
+    if (
+      typeof surface.native !== "boolean" ||
+      typeof surface.web !== "boolean"
+    ) {
+      return false;
+    }
+  }
+  return typeof record.frontDoorEnabled === "boolean";
+}
+
+function destinationFor(
+  view: AuthFlowView,
+): "/" | "/you" | "/you/sign-in-methods" | null {
+  if (view.kind === "link_confirm" || view.kind === "link_authorize") {
+    return "/you/sign-in-methods";
+  }
+  if (
+    view.kind === "linked" ||
+    (view.kind === "cancelled" && view.purpose === "link") ||
+    (view.kind === "error" && view.purpose === "link")
+  ) {
+    return "/you";
+  }
+  if (
+    view.kind === "confirm" ||
+    view.kind === "usual" ||
+    (view.kind === "cancelled" && view.purpose === "signin") ||
+    (view.kind === "error" && view.purpose === "signin")
+  ) {
+    return "/";
+  }
+  return null;
+}
+
+async function responseError(response: Response): Promise<AuthErrorCode> {
+  try {
+    const body = (await response.json()) as Partial<AuthError>;
+    return body.error && ERROR_CODES.has(body.error)
+      ? body.error
+      : "signin_failed";
+  } catch {
+    return "signin_failed";
+  }
+}
+
+class AuthRequestError extends Error {
+  constructor(readonly code: AuthErrorCode) {
+    super(code);
+  }
+}
+
+async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
+  const response = await api(path, init);
+  if (!response.ok) throw new AuthRequestError(await responseError(response));
+  return (await response.json()) as T;
+}
+
+function postJson<T>(path: string, body: unknown): Promise<T> {
+  return jsonRequest<T>(path, {
+    method: "POST",
+    headers: { "Content-Type": "application/json" },
+    body: JSON.stringify(body),
+  });
+}
+
+function setFailure(
+  context: FlowContext,
+  generation: number,
+  purpose: AuthPurpose,
+  error: unknown,
+  targetProvider?: AuthProvider,
+): void {
+  if (context.generation.current !== generation) return;
+  context.operation.current = null;
+  context.setTargetAuthorizationBusy(false);
+  context.setView({
+    kind: "error",
+    purpose,
+    code: error instanceof AuthRequestError ? error.code : "signin_failed",
+    ...(targetProvider ? { targetProvider } : {}),
+  });
+}
+
+function isProviderCancellation(error: unknown): boolean {
+  if (typeof error !== "object" || error === null || !("code" in error)) {
+    return false;
+  }
+  const code = (error as { code?: unknown }).code;
+  return code === "cancelled" || code === "USER_CANCELLED";
+}
+
+async function finishSignedIn(
+  context: FlowContext,
+  result: SignedIn,
+  generation: number,
+): Promise<void> {
+  if (context.generation.current !== generation) return;
+  if (context.native) {
+    if (!result.token) throw new AuthRequestError("signin_failed");
+    const { storeToken } = await import("../native/session");
+    if (context.generation.current !== generation) return;
+    await storeToken(result.token);
+    if (context.generation.current !== generation) return;
+  }
+  context.operation.current = null;
+  context.setTargetAuthorizationBusy(false);
+  context.setView({ kind: "idle" });
+  context.onSignedIn.current();
+}
+
+function ownsOperation(
+  context: FlowContext,
+  active: ActiveOperation,
+  generation: number,
+  owner?: symbol,
+): boolean {
+  return (
+    context.generation.current === generation &&
+    context.operation.current === active &&
+    (owner === undefined || active.authorizationOwner === owner)
+  );
+}
+
+function claimAuthorization(
+  context: FlowContext,
+  active: ActiveOperation,
+  generation: number,
+): symbol | null {
+  if (
+    !ownsOperation(context, active, generation) ||
+    active.authorizationOwner
+  ) {
+    return null;
+  }
+  const owner = Symbol("auth-authorization");
+  active.authorizationOwner = owner;
+  return owner;
+}
+
+function releaseAuthorization(
+  context: FlowContext,
+  active: ActiveOperation,
+  generation: number,
+  owner: symbol,
+): boolean {
+  if (!ownsOperation(context, active, generation, owner)) return false;
+  active.authorizationOwner = undefined;
+  return true;
+}
+
+async function cancelActive(
+  context: FlowContext,
+  active = context.operation.current,
+): Promise<boolean> {
+  if (!active || context.operation.current !== active) return active === null;
+  const surface = context.native ? "native" : "web";
+  const body = context.native ? { bindingSecret: active.bindingSecret } : {};
+  try {
+    await postJson(
+      `/api/auth/${surface}/attempts/${encodeURIComponent(active.step.attemptId)}/cancel`,
+      body,
+    );
+  } catch {
+    // The local holder still discards this attempt below. The bound server
+    // attempt expires and cannot be completed after its secret is discarded.
+  }
+  if (context.operation.current !== active) return false;
+  context.operation.current = null;
+  return true;
+}
+
+async function finalizeLink(
+  context: FlowContext,
+  active: ActiveOperation,
+  generation: number,
+  owner?: symbol,
+): Promise<void> {
+  if (
+    !ownsOperation(context, active, generation, owner) ||
+    active.step.outcome !== "link_ready"
+  ) {
+    throw new AuthRequestError("invalid_request");
+  }
+  const surface = context.native ? "native" : "web";
+  const body = context.native ? { bindingSecret: active.bindingSecret } : {};
+  const result = await postJson<{ outcome: "linked" }>(
+    `/api/auth/${surface}/attempts/${encodeURIComponent(active.step.attemptId)}/finalize`,
+    body,
+  );
+  if (!ownsOperation(context, active, generation, owner)) return;
+  if (result.outcome !== "linked") throw new AuthRequestError("signin_failed");
+  const targetProvider = active.step.targetProvider;
+  context.operation.current = null;
+  context.setTargetAuthorizationBusy(false);
+  context.setView({ kind: "linked", targetProvider });
+}
+
+async function acceptStep(
+  context: FlowContext,
+  step: AuthStep,
+  bindingSecret?: string,
+  autoAuthorize = false,
+  generation = context.generation.current,
+  existing?: ActiveOperation,
+): Promise<void> {
+  if (context.generation.current !== generation) return;
+  if (step.outcome === "signed_in") {
+    await finishSignedIn(context, step, generation);
+    return;
+  }
+  const active =
+    existing && context.operation.current === existing
+      ? existing
+      : { step, bindingSecret };
+  active.step = step;
+  if (bindingSecret !== undefined) active.bindingSecret = bindingSecret;
+  context.operation.current = active;
+  if (step.outcome === "confirm") {
+    context.setView({
+      kind: "confirm",
+      targetProvider: step.targetProvider,
+      profile: step.profile,
+    });
+    return;
+  }
+  if (step.outcome === "link_ready") {
+    await finalizeLink(context, active, generation);
+    return;
+  }
+  if (step.purpose === "link" && step.stage === "target") {
+    context.setTargetAuthorizationBusy(false);
+    context.setView({
+      kind: "link_authorize",
+      targetProvider: step.targetProvider,
+      provider: step.provider,
+      existingProofComplete: true,
+    });
+  }
+  if (context.native && autoAuthorize) {
+    const owner = claimAuthorization(context, active, generation);
+    if (!owner) return;
+    await authorizeNative(context, active, owner, generation);
+  } else if (!context.native && autoAuthorize && step.authorizationUrl) {
+    navigateWeb(step.authorizationUrl);
+  }
+}
+
+async function authorizeNative(
+  context: FlowContext,
+  active: ActiveOperation,
+  owner: symbol,
+  generation = context.generation.current,
+): Promise<void> {
+  const step = active.step;
+  if (
+    step.outcome !== "authorize" ||
+    !ownsOperation(context, active, generation, owner)
+  ) {
+    return;
+  }
+  const bindingSecret = active.bindingSecret;
+  try {
+    if (!bindingSecret) throw new AuthRequestError("invalid_request");
+    let proof: {
+      state: string;
+      idToken: string;
+      authorizationCode?: string;
+      name?: string;
+    };
+    if (step.provider === "apple") {
+      const { AppleAuth } = await import("../native/appleAuth");
+      if (!ownsOperation(context, active, generation, owner)) return;
+      proof = await AppleAuth.authorize({
+        nonce: step.nonce,
+        state: step.state,
+      });
+    } else {
+      const { initNativeAuth, nativeGoogleProofAfterInit } =
+        await import("../native/signin");
+      if (!ownsOperation(context, active, generation, owner)) return;
+      await initNativeAuth();
+      if (!ownsOperation(context, active, generation, owner)) return;
+      proof = {
+        ...(await nativeGoogleProofAfterInit(step.nonce)),
+        state: step.state,
+      };
+    }
+    if (!ownsOperation(context, active, generation, owner)) return;
+    const next = await postJson<AuthStep>(
+      `/api/auth/native/attempts/${encodeURIComponent(step.attemptId)}/proof`,
+      { bindingSecret, ...proof },
+    );
+    if (!ownsOperation(context, active, generation, owner)) return;
+    if (next.outcome === "link_ready") {
+      active.step = next;
+      await finalizeLink(context, active, generation, owner);
+      return;
+    }
+    if (!releaseAuthorization(context, active, generation, owner)) return;
+    context.setTargetAuthorizationBusy(false);
+    await acceptStep(context, next, bindingSecret, false, generation, active);
+  } catch (error) {
+    if (!ownsOperation(context, active, generation, owner)) return;
+    const cancelled = isProviderCancellation(error);
+    const cleaned = await cancelActive(context, active);
+    if (!cleaned || context.generation.current !== generation) return;
+    context.setTargetAuthorizationBusy(false);
+    if (cancelled) {
+      context.setView({
+        kind: "cancelled",
+        purpose: step.purpose,
+        targetProvider: step.targetProvider,
+      });
+    } else {
+      setFailure(context, generation, step.purpose, error, step.targetProvider);
+    }
+  }
+}
+
+function consumeReturnParams(): {
+  attemptId?: string;
+  result?: string;
+  error?: AuthErrorCode;
+  purpose: AuthPurpose;
+  targetProvider?: AuthProvider;
+} | null {
+  const url = new URL(window.location.href);
+  const attemptId = url.searchParams.get("authAttempt") || undefined;
+  const result = url.searchParams.get("authResult") || undefined;
+  const rawError = url.searchParams.get("authError");
+  const rawPurpose = url.searchParams.get("authPurpose");
+  const rawProvider = url.searchParams.get("authProvider");
+  if (!attemptId && !result && !rawError) return null;
+  for (const key of [
+    "authAttempt",
+    "authResult",
+    "authError",
+    "authPurpose",
+    "authProvider",
+  ]) {
+    url.searchParams.delete(key);
+  }
+  window.history.replaceState(
+    null,
+    "",
+    `${url.pathname}${url.search}${url.hash}`,
+  );
+  return {
+    attemptId,
+    result,
+    error:
+      rawError && ERROR_CODES.has(rawError as AuthErrorCode)
+        ? (rawError as AuthErrorCode)
+        : rawError
+          ? "signin_failed"
+          : undefined,
+    purpose: rawPurpose === "link" ? "link" : "signin",
+    targetProvider:
+      rawProvider === "apple" || rawProvider === "google"
+        ? rawProvider
+        : undefined,
+  };
+}
+
+export function useAuthFlow(onSignedIn: () => void): AuthFlowController {
+  const native = isNative();
+  const generation = useRef(0);
+  const operation = useRef<ActiveOperation | null>(null);
+  const onSignedInRef = useRef(onSignedIn);
+  const [options, setOptions] = useState<AuthOptionsView>({ state: "loading" });
+  const [view, setView] = useState<AuthFlowView>({ kind: "idle" });
+  const [targetAuthorizationBusy, setTargetAuthorizationBusy] = useState(false);
+  const context = useMemo<FlowContext>(
+    () => ({
+      native,
+      generation,
+      operation,
+      onSignedIn: onSignedInRef,
+      setTargetAuthorizationBusy,
+      setView,
+    }),
+    [native],
+  );
+
+  useEffect(() => {
+    onSignedInRef.current = onSignedIn;
+  }, [onSignedIn]);
+
+  useEffect(() => {
+    let live = true;
+    void api("/api/auth/options")
+      .then(async (response) => {
+        if (!response.ok) throw new Error("missing options");
+        const body: unknown = await response.json();
+        if (!isAuthOptions(body)) throw new Error("invalid options");
+        if (!live) return;
+        const surface = native ? "native" : "web";
+        setOptions({
+          state: "ready",
+          frontDoorEnabled: body.frontDoorEnabled,
+          legacyGoogle: !body.frontDoorEnabled,
+          apple: body.apple[surface],
+          google: body.google[surface],
+        });
+      })
+      .catch(() => {
+        if (live) setOptions(LEGACY_OPTIONS);
+      });
+    return () => {
+      live = false;
+    };
+  }, [native]);
+
+  useEffect(() => {
+    if (native) return;
+    const returnGeneration = generation.current;
+    const returned = consumeReturnParams();
+    if (!returned) return;
+    void Promise.resolve().then(async () => {
+      if (generation.current !== returnGeneration) return;
+      if (returned.result === "signed_in") {
+        onSignedInRef.current();
+        return;
+      }
+      if (returned.result === "cancelled") {
+        if (generation.current !== returnGeneration) return;
+        setView({
+          kind: "cancelled",
+          purpose: returned.purpose,
+          ...(returned.targetProvider
+            ? { targetProvider: returned.targetProvider }
+            : {}),
+        });
+        return;
+      }
+      if (returned.error) {
+        if (generation.current !== returnGeneration) return;
+        setView({
+          kind: "error",
+          purpose: returned.purpose,
+          code: returned.error,
+          ...(returned.targetProvider
+            ? { targetProvider: returned.targetProvider }
+            : {}),
+        });
+        return;
+      }
+      if (!returned.attemptId) return;
+      setView({ kind: "busy", purpose: returned.purpose });
+      try {
+        const step = await jsonRequest<AuthStep>(
+          `/api/auth/web/attempts/${encodeURIComponent(returned.attemptId)}`,
+        );
+        if (generation.current !== returnGeneration) return;
+        try {
+          await acceptStep(context, step, undefined, false, returnGeneration);
+        } catch (error) {
+          setFailure(
+            context,
+            returnGeneration,
+            step.outcome === "signed_in" ? returned.purpose : step.purpose,
+            error,
+            step.outcome === "signed_in"
+              ? returned.targetProvider
+              : step.targetProvider,
+          );
+        }
+      } catch (error) {
+        setFailure(
+          context,
+          returnGeneration,
+          returned.purpose,
+          error,
+          returned.targetProvider,
+        );
+      }
+    });
+  }, [context, native]);
+
+  async function start(provider: AuthProvider, purpose: AuthPurpose) {
+    const startGeneration = ++generation.current;
+    operation.current = null;
+    setTargetAuthorizationBusy(false);
+    setView({ kind: "busy", purpose });
+    try {
+      if (native) {
+        const result = await postJson<NativeBegin>(
+          "/api/auth/native/attempts",
+          {
+            purpose,
+            provider,
+          },
+        );
+        await acceptStep(
+          context,
+          result,
+          result.bindingSecret,
+          true,
+          startGeneration,
+        );
+      } else {
+        const result = await postJson<AuthStep>("/api/auth/web/attempts", {
+          purpose,
+          provider,
+        });
+        await acceptStep(context, result, undefined, true, startGeneration);
+      }
+    } catch (error) {
+      setFailure(context, startGeneration, purpose, error, provider);
+    }
+  }
+
+  return {
+    options,
+    view,
+    targetAuthorizationBusy,
+    destination: destinationFor(view),
+    startSignIn: (provider) => start(provider, "signin"),
+    async confirmAccount() {
+      const active = operation.current;
+      if (!active || active.step.outcome !== "confirm") return;
+      const confirmGeneration = generation.current;
+      setView({ kind: "busy", purpose: "signin" });
+      try {
+        const surface = native ? "native" : "web";
+        const body = native ? { bindingSecret: active.bindingSecret } : {};
+        const signedIn = await postJson<SignedIn>(
+          `/api/auth/${surface}/attempts/${encodeURIComponent(active.step.attemptId)}/confirm`,
+          body,
+        );
+        await finishSignedIn(context, signedIn, confirmGeneration);
+      } catch (error) {
+        setFailure(
+          context,
+          confirmGeneration,
+          "signin",
+          error,
+          active.step.targetProvider,
+        );
+      }
+    },
+    async useUsualSignIn() {
+      const active = operation.current;
+      if (!active || active.step.outcome !== "confirm") return;
+      const usualGeneration = generation.current;
+      const provider =
+        active.step.targetProvider === "apple" ? "google" : "apple";
+      setView({ kind: "busy", purpose: "signin" });
+      await cancelActive(context);
+      if (generation.current !== usualGeneration) return;
+      setView({ kind: "usual", provider });
+    },
+    prepareLink(provider) {
+      generation.current += 1;
+      operation.current = null;
+      setTargetAuthorizationBusy(false);
+      setView({ kind: "link_confirm", targetProvider: provider });
+    },
+    async startPreparedLink() {
+      if (view.kind !== "link_confirm") return;
+      await start(view.targetProvider, "link");
+    },
+    async authorizeLinkTarget() {
+      const active = operation.current;
+      if (!active || active.step.outcome !== "authorize") return;
+      const authorizationGeneration = generation.current;
+      const owner = claimAuthorization(
+        context,
+        active,
+        authorizationGeneration,
+      );
+      if (!owner) return;
+      if (native) {
+        setTargetAuthorizationBusy(true);
+        await authorizeNative(context, active, owner, authorizationGeneration);
+      } else if (active.step.authorizationUrl) {
+        navigateWeb(active.step.authorizationUrl);
+      } else {
+        releaseAuthorization(context, active, authorizationGeneration, owner);
+      }
+    },
+    async cancel() {
+      const purpose =
+        operation.current?.step.purpose ??
+        (view.kind === "link_confirm" || view.kind === "link_authorize"
+          ? "link"
+          : "signin");
+      const targetProvider = operation.current?.step.targetProvider;
+      const cancelGeneration = ++generation.current;
+      const active = operation.current;
+      await cancelActive(context, active);
+      if (generation.current !== cancelGeneration) return;
+      setTargetAuthorizationBusy(false);
+      setView({
+        kind: "cancelled",
+        purpose,
+        ...(targetProvider ? { targetProvider } : {}),
+      });
+    },
+    reset() {
+      generation.current += 1;
+      operation.current = null;
+      setTargetAuthorizationBusy(false);
+      setView({ kind: "idle" });
+    },
+    abandon() {
+      generation.current += 1;
+      operation.current = null;
+      setTargetAuthorizationBusy(false);
+      setView({ kind: "idle" });
+    },
+  };
+}
diff --git a/app/src/api/useAuthMethods.test.ts b/app/src/api/useAuthMethods.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fa99a71f2038992d1eb28b2993ec2050397c8132
--- /dev/null
+++ b/app/src/api/useAuthMethods.test.ts
@@ -0,0 +1,101 @@
+import { act, renderHook, waitFor } from "@testing-library/react";
+import { beforeEach, describe, expect, it, vi } from "vitest";
+import { api } from "../api";
+import { useAuthMethods } from "./useAuthMethods";
+
+vi.mock("../api", () => ({ api: vi.fn() }));
+
+beforeEach(() => {
+  vi.mocked(api).mockReset();
+});
+
+describe("useAuthMethods", () => {
+  it("reports the two server-owned connection states", async () => {
+    vi.mocked(api).mockResolvedValue(
+      new Response(JSON.stringify({ apple: false, google: true }), {
+        status: 200,
+      }),
+    );
+    const { result } = renderHook(() => useAuthMethods("initial"));
+    await waitFor(() => expect(result.current.state).toBe("ready"));
+    expect(result.current).toStrictEqual({
+      state: "ready",
+      methods: { apple: false, google: true },
+    });
+  });
+
+  it("reads the methods again after a successful link changes the refresh key", async () => {
+    vi.mocked(api)
+      .mockResolvedValueOnce(
+        new Response(JSON.stringify({ apple: false, google: true }), {
+          status: 200,
+        }),
+      )
+      .mockResolvedValueOnce(
+        new Response(JSON.stringify({ apple: true, google: true }), {
+          status: 200,
+        }),
+      );
+    const { result, rerender } = renderHook(({ key }) => useAuthMethods(key), {
+      initialProps: { key: "before" },
+    });
+    await waitFor(() => expect(result.current.state).toBe("ready"));
+    rerender({ key: "after" });
+    await waitFor(() =>
+      expect(result.current).toStrictEqual({
+        state: "ready",
+        methods: { apple: true, google: true },
+      }),
+    );
+    expect(api).toHaveBeenCalledTimes(2);
+  });
+
+  it.each([
+    new Response(null, { status: 503 }),
+    new Response(JSON.stringify(null), { status: 200 }),
+    new Response(JSON.stringify({ apple: true }), { status: 200 }),
+  ])(
+    "maps unavailable or malformed methods to an inert error state",
+    async (response) => {
+      vi.mocked(api).mockResolvedValue(response);
+      const { result } = renderHook(() => useAuthMethods("error"));
+      await waitFor(() =>
+        expect(result.current).toStrictEqual({ state: "error" }),
+      );
+    },
+  );
+
+  it("ignores a late success after unmount", async () => {
+    let resolve!: (response: Response) => void;
+    vi.mocked(api).mockReturnValue(
+      new Promise<Response>((done) => {
+        resolve = done;
+      }),
+    );
+    const { unmount } = renderHook(() => useAuthMethods("late-success"));
+    unmount();
+    await act(async () => {
+      resolve(
+        new Response(JSON.stringify({ apple: true, google: true }), {
+          status: 200,
+        }),
+      );
+    });
+    expect(api).toHaveBeenCalledOnce();
+  });
+
+  it("ignores a late failure after unmount", async () => {
+    let reject!: (error: Error) => void;
+    vi.mocked(api).mockReturnValue(
+      new Promise<Response>((_resolve, fail) => {
+        reject = fail;
+      }),
+    );
+    const { unmount } = renderHook(() => useAuthMethods("late-failure"));
+    unmount();
+    await act(async () => {
+      reject(new Error("offline"));
+    });
+    expect(api).toHaveBeenCalledOnce();
+  });
+});
diff --git a/app/src/api/useAuthMethods.ts b/app/src/api/useAuthMethods.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d6af9359bab25635f0646bb8c424b7ce3bf619a1
--- /dev/null
+++ b/app/src/api/useAuthMethods.ts
@@ -0,0 +1,37 @@
+import { useEffect, useState } from "react";
+import type { AuthMethods } from "../../shared/auth";
+import { api } from "../api";
+
+type AuthMethodsState =
+  | { state: "loading" }
+  | { state: "ready"; methods: AuthMethods }
+  | { state: "error" };
+
+function isAuthMethods(value: unknown): value is AuthMethods {
+  if (typeof value !== "object" || value === null) return false;
+  const record = value as Record<string, unknown>;
+  return (
+    typeof record.apple === "boolean" && typeof record.google === "boolean"
+  );
+}
+
+export function useAuthMethods(refreshKey: string): AuthMethodsState {
+  const [state, setState] = useState<AuthMethodsState>({ state: "loading" });
+  useEffect(() => {
+    let live = true;
+    void api("/api/auth/methods")
+      .then(async (response) => {
+        if (!response.ok) throw new Error("methods unavailable");
+        const body: unknown = await response.json();
+        if (!isAuthMethods(body)) throw new Error("invalid methods response");
+        if (live) setState({ state: "ready", methods: body });
+      })
+      .catch(() => {
+        if (live) setState({ state: "error" });
+      });
+    return () => {
+      live = false;
+    };
+  }, [refreshKey]);
+  return state;
+}
diff --git a/app/src/auth/AuthProviderButton.tsx b/app/src/auth/AuthProviderButton.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..9a24d27248bf08266c8ff7ef2e82ee5cdc1ea7ae
--- /dev/null
+++ b/app/src/auth/AuthProviderButton.tsx
@@ -0,0 +1,26 @@
+import type { AuthProvider } from "../../shared/auth";
+
+export default function AuthProviderButton({
+  provider,
+  label = `Continue with ${provider === "apple" ? "Apple" : "Google"}`,
+  disabled = false,
+  onClick,
+}: {
+  provider: AuthProvider;
+  label?: string;
+  disabled?: boolean;
+  onClick: () => void;
+}) {
+  return (
+    <button
+      className={`auth-provider-button auth-provider-${provider}`}
+      disabled={disabled}
+      onClick={onClick}
+    >
+      {provider === "apple" && (
+        <img src="/apple-logo-left-white-medium.svg" alt="" />
+      )}
+      <span>{label}</span>
+    </button>
+  );
+}
diff --git a/app/src/auth/LinkSignInMethod.test.tsx b/app/src/auth/LinkSignInMethod.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..7ff5d0ac786c34a8780f3f054313c6b0d26dec98
--- /dev/null
+++ b/app/src/auth/LinkSignInMethod.test.tsx
@@ -0,0 +1,79 @@
+import { render, screen } from "@testing-library/react";
+import userEvent from "@testing-library/user-event";
+import { describe, expect, it, vi } from "vitest";
+import type { AuthFlowController, AuthFlowView } from "../adapters/authFlow";
+import LinkSignInMethod from "./LinkSignInMethod";
+
+function controller(view: AuthFlowView): AuthFlowController {
+  return {
+    options: {
+      state: "ready",
+      frontDoorEnabled: true,
+      legacyGoogle: false,
+      apple: true,
+      google: true,
+    },
+    view,
+    targetAuthorizationBusy: false,
+    destination: "/you/sign-in-methods",
+    startSignIn: vi.fn(),
+    confirmAccount: vi.fn(),
+    useUsualSignIn: vi.fn(),
+    prepareLink: vi.fn(),
+    startPreparedLink: vi.fn(),
+    authorizeLinkTarget: vi.fn(),
+    cancel: vi.fn(),
+    reset: vi.fn(),
+    abandon: vi.fn(),
+  };
+}
+
+describe("LinkSignInMethod", () => {
+  it("renders nothing outside the linking route states", () => {
+    const { container } = render(
+      <LinkSignInMethod auth={controller({ kind: "idle" })} />,
+    );
+    expect(container).toBeEmptyDOMElement();
+  });
+  it("explains both proofs before starting an Apple link", async () => {
+    const auth = controller({ kind: "link_confirm", targetProvider: "apple" });
+    render(<LinkSignInMethod auth={auth} />);
+    expect(screen.getByRole("heading", { name: "Add Apple" })).toBeVisible();
+    expect(screen.getByText("Confirm your usual Google sign-in")).toBeVisible();
+    expect(screen.getByText("Sign in with Apple")).toBeVisible();
+    await userEvent.click(
+      screen.getByRole("button", { name: "Confirm with Google" }),
+    );
+    expect(auth.startPreparedLink).toHaveBeenCalledOnce();
+  });
+
+  it("marks the first proof complete before authorizing the target", async () => {
+    const auth = controller({
+      kind: "link_authorize",
+      targetProvider: "google",
+      provider: "google",
+      existingProofComplete: true,
+    });
+    render(<LinkSignInMethod auth={auth} />);
+    expect(screen.getByLabelText("Usual sign-in confirmed")).toBeVisible();
+    await userEvent.click(
+      screen.getByRole("button", { name: "Continue with Google" }),
+    );
+    expect(auth.authorizeLinkTarget).toHaveBeenCalledOnce();
+  });
+
+  it("cancels without claiming a link changed", async () => {
+    const auth = controller({ kind: "link_confirm", targetProvider: "google" });
+    render(<LinkSignInMethod auth={auth} />);
+    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
+    expect(auth.cancel).toHaveBeenCalledOnce();
+    expect(screen.queryByText(/connected/i)).not.toBeInTheDocument();
+  });
+
+  it("the header cancel uses the same bound cancellation", async () => {
+    const auth = controller({ kind: "link_confirm", targetProvider: "apple" });
+    render(<LinkSignInMethod auth={auth} />);
+    await userEvent.click(screen.getByRole("button", { name: "← CANCEL" }));
+    expect(auth.cancel).toHaveBeenCalledOnce();
+  });
+});
diff --git a/app/src/auth/LinkSignInMethod.tsx b/app/src/auth/LinkSignInMethod.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..82ec3c503a1dd756e3b4e387a3672ae4db89dae6
--- /dev/null
+++ b/app/src/auth/LinkSignInMethod.tsx
@@ -0,0 +1,79 @@
+import type { AuthProvider } from "../../shared/auth";
+import type { AuthFlowController } from "../adapters/authFlow";
+import AuthProviderButton from "./AuthProviderButton";
+
+function providerName(provider: AuthProvider): "Apple" | "Google" {
+  return provider === "apple" ? "Apple" : "Google";
+}
+
+export default function LinkSignInMethod({
+  auth,
+}: {
+  auth: AuthFlowController;
+}) {
+  if (
+    auth.view.kind !== "link_confirm" &&
+    auth.view.kind !== "link_authorize"
+  ) {
+    return null;
+  }
+  const target = auth.view.targetProvider;
+  const usual: AuthProvider = target === "apple" ? "google" : "apple";
+  const firstDone = auth.view.kind === "link_authorize";
+  return (
+    <main className="auth-flow-screen">
+      <header className="auth-flow-header">
+        <button className="auth-back" onClick={() => void auth.cancel()}>
+          ← CANCEL
+        </button>
+        <h1>Add {providerName(target)}</h1>
+        <p className="auth-intro">
+          Confirm {providerName(usual)}, then sign in with{" "}
+          {providerName(target)}. Your workouts stay with this account.
+        </p>
+      </header>
+      <div className="auth-flow-body">
+        <div className="auth-steps">
+          <div className={`auth-step${firstDone ? " auth-step-done" : ""}`}>
+            <span
+              className="auth-step-index"
+              aria-label={firstDone ? "Usual sign-in confirmed" : undefined}
+            >
+              {firstDone ? "✓" : "1"}
+            </span>
+            <div>
+              <strong>Confirm your usual {providerName(usual)} sign-in</strong>
+              <small>Keep your workouts in this account.</small>
+            </div>
+          </div>
+          <div className="auth-step">
+            <span className="auth-step-index">2</span>
+            <div>
+              <strong>Sign in with {providerName(target)}</strong>
+              <small>
+                Add {providerName(target)} as another way to sign in.
+              </small>
+            </div>
+          </div>
+        </div>
+        <div className="auth-actions">
+          <AuthProviderButton
+            provider={firstDone ? target : usual}
+            disabled={firstDone && auth.targetAuthorizationBusy}
+            label={
+              firstDone ? undefined : `Confirm with ${providerName(usual)}`
+            }
+            onClick={() =>
+              void (firstDone
+                ? auth.authorizeLinkTarget()
+                : auth.startPreparedLink())
+            }
+          />
+          <button className="button-l2" onClick={() => void auth.cancel()}>
+            Cancel
+          </button>
+        </div>
+      </div>
+    </main>
+  );
+}
diff --git a/app/src/index.css b/app/src/index.css
index faa7e35ab72cb88799f5561e535e09b45f3a9833..cc3563e95f4d7f057570b4c063953f134e2bee9d 100644
--- a/app/src/index.css
+++ b/app/src/index.css
@@ -134,6 +134,263 @@ main {
   gap: 12px;
 }

+.auth-stack,
+.auth-actions {
+  display: grid;
+  gap: 12px;
+}
+
+.auth-provider-button {
+  position: relative;
+  display: flex;
+  width: 100%;
+  min-height: 52px;
+  align-items: center;
+  justify-content: center;
+  padding: 0;
+  border-radius: var(--radius);
+  font: inherit;
+  font-size: 16px;
+  font-weight: 600;
+  cursor: pointer;
+}
+
+.auth-provider-apple {
+  border: 1px solid var(--auth-apple);
+  background: var(--auth-apple);
+  color: var(--auth-apple-label);
+}
+
+.auth-provider-apple:hover {
+  background: var(--auth-apple-hover);
+}
+
+.auth-provider-apple img {
+  position: absolute;
+  top: 0;
+  left: 0;
+  width: auto;
+  height: 100%;
+}
+
+.auth-provider-google {
+  border: 1px solid var(--accent);
+  background: var(--accent);
+  color: var(--on-color);
+}
+
+.auth-provider-google:hover {
+  border-color: var(--accent-hover);
+  background: var(--accent-hover);
+}
+
+.auth-provider-button:focus-visible,
+.auth-back:focus-visible,
+.auth-method-row:focus-visible {
+  outline: 2px solid var(--ink);
+  outline-offset: 2px;
+}
+
+.auth-flow-screen {
+  display: flex;
+  min-height: 100dvh;
+  flex-direction: column;
+}
+
+.auth-flow-header {
+  margin-bottom: 18px;
+}
+
+.auth-flow-header h1 {
+  margin: 4px 0 8px;
+  line-height: 1.1;
+}
+
+.auth-intro {
+  max-width: 38ch;
+  margin: 0 0 8px;
+  color: var(--ink-3);
+  line-height: 1.45;
+}
+
+.auth-back {
+  min-width: 44px;
+  min-height: 44px;
+  padding: 0;
+  border: 0;
+  background: transparent;
+  color: var(--ink-3);
+  font-family: var(--font-mono);
+  font-size: 11px;
+  font-weight: 500;
+  letter-spacing: 0.12em;
+  text-align: left;
+  cursor: pointer;
+}
+
+.auth-flow-body {
+  display: flex;
+  flex: 1;
+  flex-direction: column;
+}
+
+.auth-identity {
+  display: flex;
+  min-width: 0;
+  align-items: center;
+  gap: 12px;
+  padding: 16px;
+  border: 1px solid var(--rule);
+  border-radius: var(--radius);
+  background: var(--surface);
+}
+
+.auth-identity-copy {
+  min-width: 0;
+  flex: 1;
+}
+
+.auth-identity-name {
+  margin: 0;
+  font-family: var(--font-serif);
+  font-size: 24px;
+  font-weight: 500;
+  line-height: 1.1;
+}
+
+.auth-identity-email {
+  overflow: hidden;
+  margin: 3px 0 0;
+  color: var(--ink-3);
+  font-size: 12px;
+  text-overflow: ellipsis;
+  white-space: nowrap;
+}
+
+.auth-explain {
+  margin: 16px 0;
+  padding: 14px 14px 14px 16px;
+  border-left: 3px solid var(--ink-4);
+  background: var(--surface-sunken);
+  color: var(--ink-2);
+  line-height: 1.5;
+}
+
+.auth-explain p {
+  margin: 0;
+}
+
+.auth-actions {
+  margin-top: auto;
+  padding-top: 18px;
+}
+
+.auth-steps {
+  margin: 8px 0 18px;
+  border-top: 1px solid var(--rule);
+}
+
+.auth-step {
+  display: grid;
+  grid-template-columns: 32px 1fr;
+  gap: 9px;
+  padding: 13px 0;
+  border-bottom: 1px solid var(--rule);
+}
+
+.auth-step-index {
+  color: var(--ink-3);
+  font-family: var(--font-mono);
+  font-size: 11px;
+  font-weight: 500;
+}
+
+.auth-step-done .auth-step-index {
+  color: var(--success);
+}
+
+.auth-step strong,
+.auth-step small {
+  display: block;
+}
+
+.auth-step strong {
+  font-size: 14px;
+}
+
+.auth-step small {
+  margin-top: 3px;
+  color: var(--ink-3);
+  font-size: 12px;
+  line-height: 1.35;
+}
+
+.auth-methods {
+  margin-top: 16px;
+}
+
+.auth-methods h2 {
+  margin: 0 2px 7px;
+  color: var(--ink-3);
+  font-family: var(--font-mono);
+  font-size: 11px;
+  font-weight: 500;
+  letter-spacing: 0.12em;
+}
+
+.auth-method-list {
+  border-top: 1px solid var(--rule);
+}
+
+.auth-method-row {
+  display: flex;
+  width: 100%;
+  min-height: 54px;
+  align-items: center;
+  justify-content: space-between;
+  gap: 12px;
+  padding: 0 2px;
+  border: 0;
+  border-bottom: 1px solid var(--rule);
+  background: transparent;
+  color: var(--ink);
+  font: inherit;
+  text-align: left;
+}
+
+button.auth-method-row {
+  cursor: pointer;
+}
+
+.auth-method-name {
+  font-weight: 500;
+}
+
+.auth-method-action {
+  color: var(--ink-2);
+}
+
+.auth-method-connected {
+  color: var(--success);
+  font-family: var(--font-mono);
+  font-size: 10px;
+  font-weight: 500;
+  letter-spacing: 0.1em;
+}
+
+.auth-notice-success {
+  border-color: var(--success);
+}
+
+.auth-notice-error {
+  border-color: var(--accent);
+}
+
+.auth-link-retry {
+  width: 100%;
+  margin-top: 12px;
+}
+
 .tagline {
   color: var(--ink-3);
   white-space: nowrap;
diff --git a/app/src/native/signin.test.ts b/app/src/native/signin.test.ts
index cab7870d3bc883ecdf35cfd40e2b2df867327546..434e5da695fb7cd011f9e006904a638c62c18859 100644
--- a/app/src/native/signin.test.ts
+++ b/app/src/native/signin.test.ts
@@ -4,10 +4,12 @@ import { describe, expect, it, vi, beforeEach } from "vitest";
 // `nativeSignOut` is the ONLY function under test here: it is the one this
 // change gives real behaviour to, and the one whose ORDERING can be wrong.
 const logout = vi.fn<(o: { provider: string }) => Promise<void>>();
+const login = vi.fn();
+const initialize = vi.fn();
 vi.mock("@capgo/capacitor-social-login", () => ({
   SocialLogin: {
-    initialize: vi.fn(),
-    login: vi.fn(),
+    initialize,
+    login,
     logout: (o: { provider: string }) => logout(o),
   },
 }));
@@ -34,7 +36,40 @@ vi.mock("./session", () => ({
   getStoredToken: vi.fn(),
 }));

-const { nativeSignOut } = await import("./signin");
+const { nativeGoogleProof, nativeSignOut } = await import("./signin");
+
+describe("nativeGoogleProof", () => {
+  beforeEach(() => {
+    initialize.mockReset();
+    initialize.mockResolvedValue(undefined);
+    login.mockReset();
+    login.mockResolvedValue({
+      provider: "google",
+      result: { responseType: "online", idToken: "signed-google-id-token" },
+    });
+  });
+
+  it("forces an interactive Google proof bound to the server nonce", async () => {
+    await expect(nativeGoogleProof("server-nonce")).resolves.toStrictEqual({
+      idToken: "signed-google-id-token",
+    });
+    expect(initialize).toHaveBeenCalledOnce();
+    expect(login).toHaveBeenCalledWith({
+      provider: "google",
+      options: { forcePrompt: true, nonce: "server-nonce" },
+    });
+  });
+
+  it("rejects an online Google response without an identity token", async () => {
+    login.mockResolvedValue({
+      provider: "google",
+      result: { responseType: "online", idToken: null },
+    });
+    await expect(nativeGoogleProof("server-nonce")).rejects.toThrow(
+      "Google proof returned no token",
+    );
+  });
+});

 describe("nativeSignOut: signing out ends the GOOGLE session, not just ours", () => {
   beforeEach(() => {
diff --git a/app/src/native/signin.ts b/app/src/native/signin.ts
index 6f31f5d7c179ed5e49632c4a737cb511dfef0d19..7a50811f7e951a46432f3a6365bb1325120b4c0c 100644
--- a/app/src/native/signin.ts
+++ b/app/src/native/signin.ts
@@ -35,6 +35,30 @@ export async function nativeSignIn(): Promise<boolean> {
   return true;
 }

+/** Fresh Google proof for credential linking. It never reads or stores the
+ * Ergomatic session token; the auth-flow adapter owns the bound attempt. */
+export async function nativeGoogleProof(
+  nonce: string,
+): Promise<{ idToken: string }> {
+  await initNativeAuth();
+  return nativeGoogleProofAfterInit(nonce);
+}
+
+/** Runs the provider interaction after the auth-flow owner has initialized
+ * the plugin and rechecked that its operation is still current. */
+export async function nativeGoogleProofAfterInit(
+  nonce: string,
+): Promise<{ idToken: string }> {
+  const res = await SocialLogin.login({
+    provider: "google",
+    options: { forcePrompt: true, nonce },
+  });
+  const idToken =
+    res.result.responseType === "online" ? res.result.idToken : null;
+  if (!idToken) throw new Error("Google proof returned no token");
+  return { idToken };
+}
+
 /* v8 ignore stop */

 /**
diff --git a/app/src/shell/AppRoutes.tsx b/app/src/shell/AppRoutes.tsx
index 0657f7f19902473fadbe7a8e269bf0fd4e505e75..7180631912a2d2ce37febeab3ce97fe24498f9bb 100644
--- a/app/src/shell/AppRoutes.tsx
+++ b/app/src/shell/AppRoutes.tsx
@@ -39,6 +39,8 @@ import SettingsScreen from "../you/SettingsScreen";
 import StatsScreen from "../you/stats/StatsScreen";
 import MonitorLogs from "../you/MonitorLogs";
 import type { Me } from "../useMe";
+import type { AuthFlowController } from "../adapters/authFlow";
+import LinkSignInMethod from "../auth/LinkSignInMethod";
 import TabBar from "./TabBar";

 const monitorInstrumentEnabled =
@@ -61,6 +63,7 @@ const HIDDEN_TABBAR_PREFIXES = [
   // screen a rower would navigate to directly.
   "/session/log",
   "/justrow/observe",
+  "/you/sign-in-methods",
   // Phase BL PR C: the three onboarding doors' flow screens (canvas
   // Question1/Question2/Recommendation/Experienced/RowPath draw no tab
   // bar — a setup flow, entered from Today's doors card and exited by
@@ -144,9 +147,11 @@ export function CompleteRedirect() {
 export default function AppRoutes({
   user,
   onSignedOut,
+  authFlow,
 }: {
   user?: Me;
   onSignedOut?: () => void;
+  authFlow?: AuthFlowController;
 } = {}) {
   const location = useLocation();
   const keyboardOpen = useKeyboardOpen();
@@ -254,8 +259,20 @@ export default function AppRoutes({
           <>
             <Route
               path="/you"
-              element={<You user={user} onSignedOut={onSignedOut} />}
+              element={
+                <You
+                  user={user}
+                  onSignedOut={onSignedOut}
+                  authFlow={authFlow}
+                />
+              }
             />
+            {authFlow && (
+              <Route
+                path="/you/sign-in-methods"
+                element={<LinkSignInMethod auth={authFlow} />}
+              />
+            )}
             {/* The baselines door (Gate 0, 2026-09-05). Flat, a sibling of
                 /you like /you/concept2 and /you/diagnostics, and inside this
                 signed-in fragment because baselines are account data. NOT in
diff --git a/app/src/theme/tokens.css b/app/src/theme/tokens.css
index 7510727c6d181d4f8393de4248e12c65b02dc964..47aec99850b3dc919f771b2ff473325a70ac84cc 100644
--- a/app/src/theme/tokens.css
+++ b/app/src/theme/tokens.css
@@ -30,6 +30,10 @@
   --rule-3: #c9c3b2;
   --accent: #b5341f;
   --accent-hover: #9c2c19;
+  --auth-apple: #000000;
+  --auth-apple-hover: #1b1b1b;
+  --auth-apple-label: #ffffff;
+  --success: #49624f;
   /* Fast-follow spec §4: Connect becomes the screen's single primary — its
      own action token, not a repaint of --accent. The value intentionally
      echoes --type-o2 immediately below, but stays a SEPARATE token:
diff --git a/app/src/you/SignInMethods.test.tsx b/app/src/you/SignInMethods.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..5ba2cd666a05dabcd4fcad9f0dbce01365893c42
--- /dev/null
+++ b/app/src/you/SignInMethods.test.tsx
@@ -0,0 +1,201 @@
+import { render, screen, waitFor } from "@testing-library/react";
+import userEvent from "@testing-library/user-event";
+import { beforeEach, describe, expect, it, vi } from "vitest";
+import type { AuthFlowController, AuthFlowView } from "../adapters/authFlow";
+import { api } from "../api";
+import SignInMethods from "./SignInMethods";
+
+vi.mock("../api", () => ({ api: vi.fn() }));
+
+beforeEach(() => {
+  vi.mocked(api).mockReset();
+});
+
+function controller(view: AuthFlowView): AuthFlowController {
+  return {
+    options: {
+      state: "ready",
+      frontDoorEnabled: true,
+      legacyGoogle: false,
+      apple: true,
+      google: true,
+    },
+    view,
+    targetAuthorizationBusy: false,
+    destination: null,
+    startSignIn: vi.fn(),
+    confirmAccount: vi.fn(),
+    useUsualSignIn: vi.fn(),
+    prepareLink: vi.fn(),
+    startPreparedLink: vi.fn(),
+    authorizeLinkTarget: vi.fn(),
+    cancel: vi.fn(),
+    reset: vi.fn(),
+    abandon: vi.fn(),
+  };
+}
+
+describe("SignInMethods", () => {
+  it("renders Apple first, connected state, and the available add action", async () => {
+    vi.mocked(api).mockResolvedValue(
+      new Response(JSON.stringify({ apple: false, google: true }), {
+        status: 200,
+      }),
+    );
+    const auth = controller({ kind: "idle" });
+    const { container } = render(<SignInMethods auth={auth} />);
+    await screen.findByText("CONNECTED");
+    expect(
+      Array.from(
+        container.querySelectorAll(".auth-method-name"),
+        (node) => node.textContent,
+      ),
+    ).toStrictEqual(["Apple", "Google"]);
+    await userEvent.click(screen.getByRole("button", { name: "Add Apple" }));
+    expect(auth.prepareLink).toHaveBeenCalledWith("apple");
+  });
+
+  it("shows exact terminal link notices and refreshes methods after success", async () => {
+    vi.mocked(api).mockImplementation(
+      async () =>
+        new Response(JSON.stringify({ apple: true, google: true }), {
+          status: 200,
+        }),
+    );
+    const auth = controller({ kind: "linked", targetProvider: "apple" });
+    const { rerender } = render(<SignInMethods auth={auth} />);
+    expect(await screen.findByRole("status")).toHaveTextContent(
+      "Apple is now connected. You can sign in either way.",
+    );
+    await waitFor(() => expect(api).toHaveBeenCalled());
+    const retryAuth = controller({
+      kind: "error",
+      purpose: "link",
+      code: "account_changed",
+      targetProvider: "apple",
+    });
+    rerender(<SignInMethods auth={retryAuth} />);
+    expect(await screen.findByRole("alert")).toHaveTextContent(
+      "Your account changed. Start linking again. Neither account was modified.",
+    );
+    await userEvent.click(
+      screen.getByRole("button", { name: "Start linking again" }),
+    );
+    expect(retryAuth.prepareLink).toHaveBeenCalledWith("apple");
+  });
+
+  it("refetches authoritative methods before showing an uncertain finalize result", async () => {
+    let reads = 0;
+    vi.mocked(api).mockImplementation(async () => {
+      reads += 1;
+      return new Response(
+        JSON.stringify(
+          reads === 1
+            ? { apple: false, google: true }
+            : { apple: true, google: true },
+        ),
+        { status: 200 },
+      );
+    });
+    const { rerender } = render(
+      <SignInMethods auth={controller({ kind: "idle" })} />,
+    );
+    expect(
+      await screen.findByRole("button", { name: "Add Apple" }),
+    ).toBeVisible();
+
+    rerender(
+      <SignInMethods
+        auth={controller({
+          kind: "error",
+          purpose: "link",
+          code: "signin_failed",
+          targetProvider: "apple",
+        })}
+      />,
+    );
+    expect(await screen.findByRole("alert")).toHaveTextContent(
+      "We couldn’t confirm the result. Check your sign-in methods and try again.",
+    );
+    await waitFor(() => expect(reads).toBe(2));
+    expect(screen.queryByRole("button", { name: "Add Apple" })).toBeNull();
+    expect(screen.getAllByText("CONNECTED")).toHaveLength(2);
+  });
+
+  it.each([
+    [
+      {
+        kind: "error",
+        purpose: "link",
+        code: "attempt_expired",
+        targetProvider: "google",
+      },
+      "We couldn’t confirm the result. Check your sign-in methods and try again.",
+    ],
+    [
+      {
+        kind: "error",
+        purpose: "link",
+        code: "account_conflict",
+        targetProvider: "google",
+      },
+      "That Google sign-in is already connected to another Ergomatic account. Nothing changed.",
+    ],
+    [
+      { kind: "error", purpose: "link", code: "signin_failed" },
+      "We couldn’t confirm the result. Check your sign-in methods and try again.",
+    ],
+  ] as const)("renders the bounded link terminal copy", async (view, copy) => {
+    vi.mocked(api).mockImplementation(
+      async () =>
+        new Response(JSON.stringify({ apple: true, google: true }), {
+          status: 200,
+        }),
+    );
+    render(<SignInMethods auth={controller(view)} />);
+    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
+  });
+
+  it("keeps cancellation silent and hides the block while the feature is disabled", async () => {
+    vi.mocked(api).mockImplementation(
+      async () =>
+        new Response(JSON.stringify({ apple: true, google: true }), {
+          status: 200,
+        }),
+    );
+    const cancelled = controller({
+      kind: "cancelled",
+      purpose: "link",
+      targetProvider: "apple",
+    });
+    const { rerender } = render(<SignInMethods auth={cancelled} />);
+    await screen.findByText("SIGN-IN METHODS");
+    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
+    cancelled.options = {
+      state: "ready",
+      frontDoorEnabled: false,
+      legacyGoogle: true,
+      apple: false,
+      google: true,
+    };
+    rerender(<SignInMethods auth={cancelled} />);
+    expect(screen.queryByText("SIGN-IN METHODS")).not.toBeInTheDocument();
+  });
+
+  it("keeps a terminal notice visible when the methods read fails", async () => {
+    vi.mocked(api).mockResolvedValue(new Response(null, { status: 503 }));
+    render(
+      <SignInMethods
+        auth={controller({
+          kind: "error",
+          purpose: "link",
+          code: "account_conflict",
+          targetProvider: "apple",
+        })}
+      />,
+    );
+    expect(await screen.findByRole("alert")).toHaveTextContent(
+      "That Apple sign-in is already connected",
+    );
+  });
+});
diff --git a/app/src/you/SignInMethods.tsx b/app/src/you/SignInMethods.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..db880e13ace15214b20413cf79c00c7332fbf38f
--- /dev/null
+++ b/app/src/you/SignInMethods.tsx
@@ -0,0 +1,119 @@
+import type { AuthProvider } from "../../shared/auth";
+import type { AuthFlowController } from "../adapters/authFlow";
+import { useAuthMethods } from "../api/useAuthMethods";
+
+function name(provider: AuthProvider): "Apple" | "Google" {
+  return provider === "apple" ? "Apple" : "Google";
+}
+
+function linkNotice(auth: AuthFlowController): React.ReactNode {
+  const view = auth.view;
+  if (view.kind === "linked") {
+    return (
+      <p className="notice auth-notice-success" role="status">
+        {name(view.targetProvider)} is now connected. You can sign in either
+        way.
+      </p>
+    );
+  }
+  if (view.kind === "cancelled" && view.purpose === "link") return null;
+  if (view.kind !== "error" || view.purpose !== "link") return null;
+  if (view.code === "account_changed") {
+    return (
+      <p className="notice auth-notice-error" role="alert">
+        Your account changed. Start linking again. Neither account was modified.
+      </p>
+    );
+  }
+  if (view.code === "account_conflict" && view.targetProvider) {
+    return (
+      <p className="notice auth-notice-error" role="alert">
+        That {name(view.targetProvider)} sign-in is already connected to another
+        Ergomatic account. Nothing changed.
+      </p>
+    );
+  }
+  if (view.code === "signin_failed" || view.code === "attempt_expired") {
+    return (
+      <p className="notice auth-notice-error" role="alert">
+        We couldn’t confirm the result. Check your sign-in methods and try
+        again.
+      </p>
+    );
+  }
+  return (
+    <p className="notice auth-notice-error" role="alert">
+      That linking attempt didn’t work. Nothing changed. Start linking again.
+    </p>
+  );
+}
+
+function methodsRefreshKey(view: AuthFlowController["view"]): string {
+  if (view.kind === "linked") return `linked-${view.targetProvider}`;
+  if (
+    view.kind === "error" &&
+    view.purpose === "link" &&
+    (view.code === "signin_failed" || view.code === "attempt_expired")
+  ) {
+    return `uncertain-${view.targetProvider ?? "unknown"}`;
+  }
+  return "current";
+}
+
+export default function SignInMethods({ auth }: { auth: AuthFlowController }) {
+  const methods = useAuthMethods(methodsRefreshKey(auth.view));
+  const notice = linkNotice(auth);
+  if (auth.options.state !== "ready" || !auth.options.frontDoorEnabled) {
+    return null;
+  }
+  if (methods.state !== "ready") {
+    return notice ? <section className="auth-methods">{notice}</section> : null;
+  }
+  const retryProvider =
+    auth.view.kind === "error" &&
+    auth.view.purpose === "link" &&
+    (auth.view.code === "account_changed" ||
+      ((auth.view.code === "attempt_expired" ||
+        auth.view.code === "signin_failed") &&
+        auth.view.targetProvider !== undefined &&
+        !methods.methods[auth.view.targetProvider]))
+      ? auth.view.targetProvider
+      : undefined;
+  return (
+    <section className="auth-methods" aria-labelledby="auth-methods-heading">
+      {notice}
+      <h2 id="auth-methods-heading">SIGN-IN METHODS</h2>
+      <div className="auth-method-list">
+        {(["apple", "google"] as const).map((provider) => {
+          const connected = methods.methods[provider];
+          return connected ? (
+            <div className="auth-method-row" key={provider}>
+              <span className="auth-method-name">{name(provider)}</span>
+              <span className="auth-method-connected">CONNECTED</span>
+            </div>
+          ) : (
+            <button
+              className="auth-method-row"
+              key={provider}
+              aria-label={`Add ${name(provider)}`}
+              onClick={() => auth.prepareLink(provider)}
+            >
+              <span className="auth-method-name">{name(provider)}</span>
+              <span className="auth-method-action">
+                Add {name(provider)} <span aria-hidden="true">›</span>
+              </span>
+            </button>
+          );
+        })}
+      </div>
+      {retryProvider && (
+        <button
+          className="button-l2 auth-link-retry"
+          onClick={() => auth.prepareLink(retryProvider)}
+        >
+          Start linking again
+        </button>
+      )}
+    </section>
+  );
+}
```
