# Apple client candidate evidence

## Provenance

- Candidate worktree: `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/apple-client-plan-scratch`
- Candidate base: `3cf849c7614caa25bff78c64517e8d2e47ada39a`
- Tested client series: `0ca9849567e7ba38cdd5ecc79aa6ce655b26f859`, then `0f990a68e930f4c2dbd6ee46736405554abd18d2`, then `089a4bfbf40119ce688b681398a74eaa93c3449e`
- Neighbor dependencies: server through `259882ba`; native through `81ce6040`
- Keep the candidate worktree until the feature PR merges. The client commits exclude borrowed `app/shared/auth.ts`, both TypeScript configs, and `app/src/native/appleAuth.ts`.
- Root and `app/` dependencies were installed. `core.hooksPath=.husky/_`; the real commit hook ran lint-staged and TypeScript successfully.
- Direct Vitest replays require `NODE_OPTIONS=--no-experimental-webstorage`; `pnpm test` supplies the same setting through the repository wrapper.

## Failing-first receipts

Initial adapter, methods-hook, and UI tests failed before their modules existed. Native Google proof first reported 2 failed and 7 passed before `nativeGoogleProof` existed. The first functional browser run reported 1 failed and 1 passed because an assertion counted the unrelated Concept2 `CONNECTED` label; scoping it to `.auth-method-connected` made both scenarios pass. The first design run reported 1 failed and 1 passed because a strict locator matched intro and step copy; `{ exact: true }` made both pass. The first full client run reported 1 failed and 6,087 passed because `--success` was undefined; adding the approved token made the full suite pass.

The F2/F4 correction started with rendered real-hook tests. The focused run reported 3 failed and 35 passed: the target provider control stayed enabled, stale cancellation replaced a newly prepared Google view, and generic failure still claimed `Nothing changed`. The fresh-methods regression then failed 1 test because only the cached pre-link read occurred. Those failures preceded the operation owner, rendered busy state, captured cleanup authority, uncertainty copy, and refresh key.

## Green gates

Run from `app/` in the retained candidate. Export `NODE_OPTIONS=--no-experimental-webstorage` before direct Vitest commands.

| Command                                                                                                                                                                                                                                    | Actual result                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused six-file client run before F2/F4                                                                                                                                                                                                   | 6 files, 64 tests passed.                                                                                                                                          |
| `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/authFlow.test.tsx src/you/SignInMethods.test.tsx src/auth/LinkSignInMethod.test.tsx src/native/signin.test.ts src/SignIn.frontDoor.test.tsx` | At `0f990a68`, 5 files and 61 tests passed after all F2/F4 mutations were restored.                                                                                |
| `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/api/useAuthMethods.test.ts`                                                                                                                           | At `0f990a68`, 1 file and 7 tests passed; the complete focused set is 68 tests.                                                                                    |
| `pnpm test --project client`                                                                                                                                                                                                               | Before the lifecycle/F2/F4 additions, 237 files and 6,088 tests passed. Parent requested bounded focused gates after those additions instead of another broad run. |
| `pnpm lint`                                                                                                                                                                                                                                | Exit 0 before lifecycle/F2/F4; each later commit hook linted its changed files.                                                                                    |
| `pnpm typecheck`                                                                                                                                                                                                                           | At `0f990a68`, exit 0 and E2E TypeScript membership 25/25. The commit hook also passed.                                                                            |
| `pnpm format:check`                                                                                                                                                                                                                        | Exit 0 before lifecycle/F2/F4; each later commit hook ran Prettier on changed files.                                                                               |
| `NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "Apple welcome begins"`                                                                                                                                                  | After the original browser mutation restore, 1 Chromium test passed; both production Docker builds completed.                                                      |
| Functional Apple welcome and account-link scenarios                                                                                                                                                                                        | 2 Chromium tests passed before F2/F4; both production Docker builds completed.                                                                                     |
| `NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "Apple front door and sign-in methods"`                                                                                                                                  | 2 Chromium design tests passed; both production Docker builds completed.                                                                                           |
| `NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm screenshots -g "apple-"`                                                                                                                                                        | Original 5 screenshot cases passed; both production Docker builds completed.                                                                                       |
| `node /tmp/apple-mechanism-probes/client.cjs`                                                                                                                                                                                              | One provider call while held, second owner denied, no request before release; then exactly proof and finalize with one linked view.                                |
| `node /tmp/apple-mechanism-probes/client-stale-cancel.cjs`                                                                                                                                                                                 | Generation 2 retained operation `new` and the Google confirmation after old cancel cleanup resolved.                                                               |
| `NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "a lost finalize response reports uncertainty without claiming failure or success"`                                                                                      | At `0f990a68`, 1 Chromium test passed after restore; both production Docker builds completed.                                                                      |
| `NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm screenshots -g "apple-link-result-uncertain"`                                                                                                                                   | At `0f990a68`, 2 screenshot cases passed; both production Docker builds completed.                                                                                 |

The functional browser proof begins at the actual Apple controls, intercepts only new auth endpoints, follows server-produced authorization URLs, and consumes the returned attempt. The link proof starts at Add Apple, proves Google then Apple, finalizes, and retains a workout built from real `LIBRARY_WORKOUTS` through `fromWorkout`/`toSteps`. Endpoint interception proves the client producer-to-consumer path only.

## Operation lifetime and singleflight

`useAuthFlow` gives each operation a generation. Starting or preparing another flow, canceling, resetting, or abandoning invalidates pending awaits. Native bridge responses, proof posts, confirms, finalization, web returns, and token storage check captured authority before advancing.

The supported lifetime regression starts a native link from `/you/sign-in-methods`, then uses the real You sign-out path to call `abandon()` while begin is pending. The late begin stays idle and never opens a provider. The F2 correction adds an operation-local authorization owner claimed synchronously before module import, Google initialization, provider proof, proof POST, and finalization. Every continuation checks the same operation object, generation, and owner. The target action renders disabled while owned and Cancel stays available. Cleanup receives the exact operation it owns and cannot clear or render over a newer preparation after its server await.

## Scoped HTML coverage

The retained coverage command was:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client \
  src/adapters/authFlow.test.tsx \
  src/api/useAuthMethods.test.ts \
  src/native/signin.test.ts \
  src/auth/LinkSignInMethod.test.tsx \
  src/you/SignInMethods.test.tsx \
  src/SignIn.frontDoor.test.tsx \
  --coverage.enabled \
  --coverage.reporter=html \
  --coverage.reporter=text \
  '--coverage.include=src/{adapters/authFlow,api/useAuthMethods,auth/AuthProviderButton,auth/LinkSignInMethod,you/SignInMethods,SignIn}.{ts,tsx}'
```

At pre-harden commit `0ca98495`, all 64 then-current tests passed. The intentionally restricted diagnostic exited 1 on its isolated global branch threshold: statements 92.81%, branches 88.32%, functions 98.46%, lines 97.95%. The retained HTML is authoritative for these pre-harden rows. Parent directed the F2/F4 round to use bounded focused tests rather than rerun this threshold-failing diagnostic.

| File                              |       Statements |         Branches |      Functions |            Lines | Uncovered lines    |
| --------------------------------- | ---------------: | ---------------: | -------------: | ---------------: | ------------------ |
| `src/adapters/authFlow.ts`        | 90.98% (222/244) | 85.30% (180/211) |   100% (33/33) | 98.09% (206/210) | 196, 243, 481, 554 |
| `src/api/useAuthMethods.ts`       |     100% (20/20) |     100% (14/14) |     100% (6/6) |     100% (15/15) | none               |
| `src/auth/AuthProviderButton.tsx` |       100% (1/1) |       100% (6/6) |     100% (1/1) |       100% (1/1) | none               |
| `src/auth/LinkSignInMethod.tsx`   |     100% (10/10) |     100% (20/20) |     100% (5/5) |     100% (10/10) | none               |
| `src/you/SignInMethods.tsx`       |     100% (28/28) |     100% (40/40) |     100% (6/6) |     100% (26/26) | none               |
| `src/SignIn.tsx`                  |   93.54% (29/31) |   81.39% (35/43) | 92.85% (13/14) |   93.54% (29/31) | 52, 219            |

`src/native/**` is excluded by repository coverage configuration. Its 9 direct tests cover nonce, forced prompt, missing-token rejection, and unchanged native sign-out behavior. The remaining baseline gaps are defensive response and identity checks; no implementation-mirroring tests were added for a diagnostic percentage.

## Canonical captures

These seven captures were visually inspected at 390×844 or 844×390:

- `docs/screenshots/apple-signin-welcome.png`
- `docs/screenshots/apple-signin-welcome-landscape.png`
- `docs/screenshots/apple-create-account.png`
- `docs/screenshots/apple-signin-methods.png`
- `docs/screenshots/apple-link-confirm-landscape.png`
- `docs/screenshots/apple-link-result-uncertain.png`
- `docs/screenshots/apple-link-result-uncertain-landscape.png`

Provider controls, confirmation actions, uncertainty copy, and fresh Apple/Google `CONNECTED` rows are readable with no horizontal clipping. Landscape uses the existing vertical scrolling layout.

## Deciding-source mutations

Original Gate 0 mutations ran through `0ca98495`; F2/F4 mutations ran against committed `0f990a68`. Every mutation was restored. Exact F2/F4 outputs are under `apple-client-evidence/harden-mutations/`; final probes, tests, and typecheck are in `harden-final-green.log`.

| Mutation                                                             | Actual red result                                                                                                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google `forcePrompt:true` → `false`                                  | 1 failed, 8 passed; forced-prompt assertion failed.                                                                                                                              |
| Google login nonce → `"wrong"`                                       | 1 failed, 8 passed; server-nonce assertion failed.                                                                                                                               |
| Remove missing Google ID-token guard                                 | 1 failed, 8 passed; promise resolved instead of rejecting.                                                                                                                       |
| Omit native proof `bindingSecret`                                    | 1 failed, 25 passed; exact proof body lacked binding.                                                                                                                            |
| Apple bridge server nonce → `"wrong"`                                | 1 failed, 25 passed; bridge input mismatch.                                                                                                                                      |
| Stop deleting `authProvider`                                         | 2 failed, 24 passed; provider query residue remained.                                                                                                                            |
| Default absent `authProvider` to Apple                               | 2 failed, 26 passed; providerless return cases gained false context.                                                                                                             |
| Older-server fallback `legacyGoogle:false`                           | 5 failed, 30 passed; missing/malformed options lost legacy Google.                                                                                                               |
| Reverse methods order                                                | 1 failed, 6 passed; Apple-first assertion failed.                                                                                                                                |
| First link action bypasses `startPreparedLink`                       | 1 failed, 4 passed; existing-provider proof producer was skipped.                                                                                                                |
| Remove `now` from success notice                                     | 1 failed, 6 passed; exact copy assertion failed.                                                                                                                                 |
| Remove top `acceptStep` generation guard                             | 1 failed, 28 skipped; late begin launched Google proof.                                                                                                                          |
| Welcome Apple handler throws before `startSignIn`                    | Production build passed, emitted literal was found, named Chromium failed 1/1; restored browser passed.                                                                          |
| Allow `claimAuthorization` to replace an owner                       | Reviewer probe reported a second owner and no completion; rendered singleflight test failed 1/1.                                                                                 |
| Render target action enabled while owned                             | Rendered singleflight test failed 1/1 because Continue with Apple was enabled.                                                                                                   |
| Remove authority check after `initNativeAuth`                        | Initialization-lifetime test failed 1/1 because Google proof launched with `google-nonce`.                                                                                       |
| Remove captured operation and generation checks after cancel cleanup | Reviewer probe lost the new operation; rendered stale-cancel test failed 1/1 because stale Apple cancellation replaced Google confirmation.                                      |
| Stop methods refresh for uncertain result                            | Authoritative-methods test failed 1/1; only one read occurred and stale Add Apple remained.                                                                                      |
| Exclude `attempt_expired` from uncertainty copy                      | Terminal-copy table failed 1 of 3 cases; expiry rendered the old `Nothing changed` claim.                                                                                        |
| Compile `Nothing changed after this attempt` into uncertain result   | `pnpm build` passed; the literal was found in `dist/client/assets/index-Frj_POr1.js`; named lost-finalize Chromium failed 1/1 on exact alert text; restored Chromium passed 1/1. |

## F4 producer-to-consumer boundary

Server commit `259882ba` owns `finalize can commit identity and grant before its HTTP response is lost`. It drives real attempt transitions through `createApp` and PostgreSQL, destroys the response after the route emits `linked`, observes the socket failure, and proves both methods, the retained grant, and consumed attempt. Its `lost-response-grant` mutation fails. The client browser test aborts the finalization response, renders `We couldn’t confirm the result. Check your sign-in methods and try again.`, refetches `/api/auth/methods`, and shows both providers connected without false failure or success. The client interception is paired with the real server producer; it is not a server OAuth proof.

## Residuals and integration order

Adopt server through `259882ba`, native through `81ce6040`, then client commits `0ca9849567e7ba38cdd5ecc79aa6ce655b26f859`, `0f990a68e930f4c2dbd6ee46736405554abd18d2`, and `089a4bfbf40119ce688b681398a74eaa93c3449e`. The client series needs the neighboring shared types, TypeScript inclusions, and thin native bridge and deliberately does not duplicate them.

Live Apple/Google credentials, iOS device launch, and native/web same-subject continuity remain release gates. Browser interception is confined to tests and capture fixtures; there is no production fake provider.

## 2026-09-13 navigation correction — current source

Commit `089a4bfbf40119ce688b681398a74eaa93c3449e` fixes the reproduced terminal-route loop. `AppContent` now owns `consumedAuthDestination` for its mounted document. The ref starts with the current destination, records each changed destination before navigation, survives in-document route changes, rearms when the controller transitions through `null`, and is discarded on unmount or reload. A retained linked/cancelled/error view and notice can therefore route to You once without replaying `/you` after the rower chooses Library.

The recovered pre-fix Chromium evidence at `docs/superpowers/research/2026-09-13-apple-harden/code-lens/navigation.json` recorded `/library` followed by `/you`, a final `/you` URL, and no active Library tab. Running the same `/tmp/apple-code-lens/navigation.cjs` against the isolated 335-module fixed build produced `apple-client-evidence/navigation-fixed.json`: one `/library` navigation, a final `/library` URL, and `aria-current=page`.

The earlier operation-lifetime paragraph overstated its first test: that test called `result.current.abandon()` directly. Current source adds `abandons a held native link begin through the real You sign-out control`. It renders the actual You button with a real `useAuthFlow`, holds native begin, completes native sign-out, and then proves the late begin cannot launch Google or change the idle view.

Current gates and receipts:

- `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/App.test.tsx src/adapters/authFlow.test.tsx src/api/useAuthMethods.test.ts src/native/signin.test.ts src/auth/LinkSignInMethod.test.tsx src/you/SignInMethods.test.tsx src/SignIn.frontDoor.test.tsx`: 7 files, 74 tests passed after restore.
- `pnpm lint`, `pnpm typecheck`, and `pnpm format:check`: all passed before commit; typecheck reported E2E membership 25/25. The commit hook reran changed-file Prettier/ESLint and typecheck successfully.
- `NODE_OPTIONS=--no-experimental-webstorage E2E_KEEP=0 pnpm e2e -g "linking Apple|lost finalize|cancelled link return"`: 3 Chromium tests passed. Linked, uncertain-error, and cancelled-link returns each released the actual Library tab. Both Docker production builds completed.
- After the navigation mutant was restored, the named cancelled-link Chromium test passed 1/1 and the recovered standalone probe again ended on Library.

Mutation receipts:

- Removing `authFlow?.abandon()` from the actual You sign-out control made its held-begin test fail 1/1 because Google proof launched with `late-nonce`; restore passed.
- Removing the assignment to `consumedAuthDestination` made the recovered standalone browser record `/library` then `/you`, and the named cancelled-link Chromium test failed 1/1 because Library never became current. Restore passed both proofs.

Durable outputs are `navigation-red-browser.log`, `navigation-green-browser.log`, `navigation-restored-browser.log`, `navigation-final-focused.log`, `navigation-fixed.json`, and `navigation-mutations/`. The historical per-file HTML rows remain tied to `0ca98495`; parent owns the single current-source aggregate coverage run after adoption. No current-source diagnostic coverage percentage is claimed here.
