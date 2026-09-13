# Apple client candidate evidence

## Provenance

- Candidate worktree: `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/apple-client-plan-scratch`
- Candidate base: `3cf849c7614caa25bff78c64517e8d2e47ada39a`
- Tested client commit: `0ca9849567e7ba38cdd5ecc79aa6ce655b26f859`
- Parent feature worktree observed at: `aefc59b742915b37941da15968c123e7c2010b4c`
- Keep the candidate worktree until the feature PR merges. The commit excludes borrowed `app/shared/auth.ts`, `app/tsconfig.app.json`, `app/tsconfig.server.json`, and `app/src/native/appleAuth.ts`; the server and native modules own those files.
- Root and `app/` dependencies were installed in the candidate. Husky resolves through `core.hooksPath=.husky/_`; the real commit hook ran lint-staged and all TypeScript passes. The documented system-PATH hook probe rejected the environment with `HOOK BLOCKED: Node >=26 required, found none.`
- Direct `pnpm exec vitest` replays require `NODE_OPTIONS=--no-experimental-webstorage`; `pnpm test` supplies the same setting through the repository wrapper.

## Failing-first receipts

The adapter test was installed before `src/adapters/authFlow.ts`; Vitest failed at module resolution. The methods hook test was installed before `src/api/useAuthMethods.ts`; Vitest failed at module resolution. The front-door/component tests were installed before the new components and the existing `SignIn` still exposed only the legacy Google door, so those tests failed before implementation. These were scaffolding red proofs, not mutation evidence.

The first direct Google proof run after adding its tests but before implementing `nativeGoogleProof` reported 2 failed and 7 passed, including `nativeGoogleProof is not a function`. The implemented suite then reported 9 passed.

The first functional browser run reached the real You screen but reported 1 failed and 1 passed because the assertion counted an unrelated Concept2 `CONNECTED` label. Scoping the assertion to `.auth-method-connected` made the same two scenarios pass. The first design run reported 1 failed and 1 passed because a strict text locator for `Sign in with Apple` matched both intro and step copy. Changing it to `{ exact: true }` made the same two scenarios pass.

The first full client run after the UI candidate reported 1 failed and 6,087 passed: `customPropertyCensus.test.ts` found `--success` used but undefined. Adding the approved mockup value `--success: #49624f` made the full suite pass.

## Green gates

Run from `app/` in the retained candidate unless noted. Export the Vitest compatibility setting once before replaying direct Vitest commands:

```bash
export NODE_OPTIONS=--no-experimental-webstorage
```

| Command                                                                                                                                                                                                                         | Actual result                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx src/api/useAuthMethods.test.ts src/native/signin.test.ts src/auth/LinkSignInMethod.test.tsx src/you/SignInMethods.test.tsx src/SignIn.frontDoor.test.tsx` | Final lifecycle run: 6 files, 64 tests passed.                                                                                                                                                                                                                                    |
| `pnpm test --project client`                                                                                                                                                                                                    | Pre-lifecycle full gate: 237 files, 6,088 tests passed. The final lifecycle amendment was followed by the 64-test scoped gate, TypeScript, and the real commit hook; the parent explicitly did not request another broad run.                                                     |
| `pnpm lint`                                                                                                                                                                                                                     | Exit 0 before the lifecycle amendment; suppression, NUL, transport, and mock-registration censuses passed. The final commit hook linted the amended files. This used the borrowed server-owned TypeScript inclusion changes so ESLint Project Service could see `shared/auth.ts`. |
| `pnpm typecheck`                                                                                                                                                                                                                | Final exit 0; E2E TypeScript membership 25/25. The final commit hook reran the same command successfully.                                                                                                                                                                         |
| `pnpm format:check`                                                                                                                                                                                                             | Exit 0 before the lifecycle amendment; the final commit hook ran Prettier on all amended files.                                                                                                                                                                                   |
| `E2E_KEEP=0 pnpm e2e --grep "Apple welcome\|linking Apple"`                                                                                                                                                                     | 2 Chromium tests passed before the lifecycle amendment. Both Docker production builds completed.                                                                                                                                                                                  |
| `E2E_KEEP=0 pnpm e2e --grep "Apple welcome begins"`                                                                                                                                                                             | Final post-amendment and post-mutation restore: 1 Chromium test passed. Both Docker production builds completed.                                                                                                                                                                  |
| `E2E_KEEP=0 pnpm e2e --grep "Apple front door and sign-in methods"`                                                                                                                                                             | 2 Chromium design tests passed. Both Docker production builds completed.                                                                                                                                                                                                          |
| `E2E_KEEP=0 pnpm screenshots --grep "apple-"`                                                                                                                                                                                   | 5 screenshot tests passed. Both Docker production builds completed.                                                                                                                                                                                                               |

The functional browser proof begins at the actual `Continue with Apple` control, intercepts only the new auth endpoints, follows the server-produced `authorizationUrl`, consumes the returned `authAttempt`, and reaches explicit account confirmation. The link proof starts at the actual `Add Apple` row, follows the Google reauthentication URL and then the Apple target URL, finalizes, and asserts the connected result. Its signed-in fixture creates one workout from the real `LIBRARY_WORKOUTS` data through `fromWorkout` and `toSteps`; after linking it reopens the backdoor user and asserts that personal workout still exists. Endpoint interception proves client producer-to-consumer continuity only; the server plan owns signed-JWT, `createApp`, and real-Postgres producer tests.

## Operation-lifetime proof

`useAuthFlow` assigns each operation a monotonically increasing generation. Starting a new flow, preparing another link, canceling, resetting, or abandoning invalidates every pending await. Native bridge responses, proof posts, confirms, link finalization, web-return consumption, and native token storage check the captured generation before they can advance the operation or call the signed-in callback.

The regression `does not resurrect a native link begin after You sign-out abandons it` uses the supported UI lifetime: `/you/sign-in-methods` is a normal history entry, so Browser Back can expose You while native begin is pending; successful sign-out calls `authFlow.abandon()`. Resolving that late begin leaves the flow idle and never opens the provider. While the auth route itself remains visible, busy state removes or disables all competing auth controls. A web provider handoff reloads the document, so its old hook instance cannot survive.

## Scoped HTML coverage

Command:

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

The final run passed all 64 tests. Because this diagnostic command excludes the rest of the client, Vitest exited 1 on its global branch threshold: aggregate statements 92.81%, branches 88.32%, functions 98.46%, lines 97.95%. This is per-file evidence, not the repository aggregate coverage gate. The retained `docs/superpowers/plans/apple-client-evidence/coverage/index.html` report is authoritative for the rows below.

| File                              |       Statements |         Branches |      Functions |            Lines | Uncovered lines    |
| --------------------------------- | ---------------: | ---------------: | -------------: | ---------------: | ------------------ |
| `src/adapters/authFlow.ts`        | 90.98% (222/244) | 85.30% (180/211) |   100% (33/33) | 98.09% (206/210) | 196, 243, 481, 554 |
| `src/api/useAuthMethods.ts`       |     100% (20/20) |     100% (14/14) |     100% (6/6) |     100% (15/15) | none               |
| `src/auth/AuthProviderButton.tsx` |       100% (1/1) |       100% (6/6) |     100% (1/1) |       100% (1/1) | none               |
| `src/auth/LinkSignInMethod.tsx`   |     100% (10/10) |     100% (20/20) |     100% (5/5) |     100% (10/10) | none               |
| `src/you/SignInMethods.tsx`       |     100% (28/28) |     100% (40/40) |     100% (6/6) |     100% (26/26) | none               |
| `src/SignIn.tsx`                  |   93.54% (29/31) |   81.39% (35/43) | 92.85% (13/14) |   93.54% (29/31) | 52, 219            |

`src/native/**` is intentionally excluded by the repository coverage configuration. `src/native/signin.test.ts` directly passes all 9 tests, including nonce, forced prompt, missing-token rejection, and the unchanged native sign-out ordering/failure behavior. The remaining gaps are defensive response and identity checks; no implementation-mirroring tests were added to force this diagnostic subset above the repository-wide threshold.

## Canonical captures

The final five captures were regenerated after adding the approved success token and inspected at their real 390×844 or 844×390 dimensions:

- `docs/screenshots/apple-signin-welcome.png`
- `docs/screenshots/apple-signin-welcome-landscape.png`
- `docs/screenshots/apple-create-account.png`
- `docs/screenshots/apple-signin-methods.png`
- `docs/screenshots/apple-link-confirm-landscape.png`

All provider controls and the account-confirmation actions are readable. The portrait and landscape images have no horizontal clipping. The link-confirmation landscape capture keeps the same below-fold secondary Cancel placement as the approved rendered mockup; the header Cancel and primary proof action are visible and at least 44px.

## Deciding-source mutation receipts

Every unit mutation was applied to the committed candidate, run against the named focused suite, then restored. The browser producer mutation ran against final commit `0ca9849567e7ba38cdd5ecc79aa6ce655b26f859`; its production build and named browser proof were green after restore.

All direct Vitest commands below use the `NODE_OPTIONS` export from Green gates.

| Mutation                                                                      | Focused command                                                                                                                                                                 | Actual red result                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nativeGoogleProof` changes `forcePrompt:true` to `false`                     | `pnpm exec vitest run --project client src/native/signin.test.ts`                                                                                                               | 1 failed, 8 passed; expected forced prompt.                                                                                                                                                                                             |
| `nativeGoogleProof` changes its login option from `nonce` to `nonce: "wrong"` | same                                                                                                                                                                            | 1 failed, 8 passed; expected `server-nonce`.                                                                                                                                                                                            |
| `nativeGoogleProof` disables the missing-ID-token guard                       | same                                                                                                                                                                            | 1 failed, 8 passed; promise resolved `{idToken:null}` instead of rejecting.                                                                                                                                                             |
| Native proof POST omits `bindingSecret`                                       | `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx`                                                                                                          | 1 failed, 25 passed; exact proof body lacked the binding.                                                                                                                                                                               |
| Apple bridge call replaces the server nonce with `"wrong"`                    | same                                                                                                                                                                            | 1 failed, 25 passed; bridge input mismatch.                                                                                                                                                                                             |
| Web return cleanup stops deleting `authProvider`                              | same                                                                                                                                                                            | 2 failed, 24 passed; provider query residue remained.                                                                                                                                                                                   |
| Providerless web returns default `targetProvider` to Apple                    | same after providerless cases landed                                                                                                                                            | 2 failed, 26 passed; both generic cancel and error gained false provider context.                                                                                                                                                       |
| Older-server fallback sets `legacyGoogle:false`                               | `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx src/SignIn.frontDoor.test.tsx`                                                                            | 5 failed, 30 passed; missing/malformed options no longer selected legacy Google.                                                                                                                                                        |
| Sign-in methods reverses Apple/Google order                                   | `pnpm exec vitest run --project client src/you/SignInMethods.test.tsx`                                                                                                          | 1 failed, 6 passed; expected Apple first.                                                                                                                                                                                               |
| First link action calls target authorization instead of `startPreparedLink`   | `pnpm exec vitest run --project client src/auth/LinkSignInMethod.test.tsx`                                                                                                      | 1 failed, 4 passed; existing-provider proof producer was skipped.                                                                                                                                                                       |
| Success notice drops `now` from the approved copy                             | `pnpm exec vitest run --project client src/you/SignInMethods.test.tsx`                                                                                                          | 1 failed, 6 passed; exact success copy mismatch.                                                                                                                                                                                        |
| Remove the generation check at the top of `acceptStep`                        | `pnpm exec vitest run --project client src/adapters/authFlow.test.tsx -t "does not resurrect a native link begin after You sign-out abandons it"`                               | 1 failed, 28 skipped; late server begin invoked Google proof once with `late-nonce`. After restore, 1 passed and 28 skipped.                                                                                                            |
| The welcome Apple button throws before `startSignIn("apple")`                 | `NODE_OPTIONS=--no-experimental-webstorage pnpm build`, `rg -l -F "RF24 Apple welcome producer mutation" dist/client`, then `E2E_KEEP=0 pnpm e2e --grep "Apple welcome begins"` | Build exited 0 and the literal was present in `dist/client/assets/index-BKS3yXbk.js`; the named Chromium proof failed 1/1 because the real click never reached `Create your account`. After restore, the same browser proof passed 1/1. |

## Residuals and integration order

Adopt server commit `0f4921d8` first for the final shared contract and TypeScript inclusions, native commit `202f6087` second, then client commit `0ca9849567e7ba38cdd5ecc79aa6ce655b26f859`. The client commit deliberately fails to typecheck by itself because it does not duplicate either neighboring module's owned files.

No live Apple or Google credentials, iOS device launch, or native/web same-subject continuity were exercised here. Those remain release gates in the assembled plan. The browser interception is scoped to its tests and capture fixtures and does not add a production fake provider.
