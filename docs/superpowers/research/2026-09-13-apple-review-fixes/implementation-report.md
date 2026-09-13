# Apple review fixes — implementation report

## Status and source identity

Implemented the approved app-owned fixes in four commits:

- `1a3000d461dfcf447e7c347bdb6246f1623e77ee` — `fix(auth): close Apple review gaps`
- `970fb10eba9c90dc296b21cd9d10c04a34e0fee6` — `fix(auth): preserve denial during cleanup retry`
- `15f99cc1108efd33bd5dec22c7f7561445737772` — `fix(ios): gate console in app build context`
- `c7fce22337bb03b486a7c2fd074c1fb1c7f96385` — `fix(auth): dim unavailable sign-in action`

The implementation started from the brief's `86ed0636fd37c5969bdd369813534c4690de964d` base. Root's docs/config reconciliation commit `5e514fb2` landed before the first app commit and was not staged or changed by this task; root later merged current main in `7a961b975d4380265de0942ef8310c96f45a3782`. At freeze, `git status --short -- app`, `git diff --exit-code HEAD -- app`, and `git diff --cached --exit-code` were clean. No app commit was amended or pushed, and nothing was installed on a device or exercised against a live provider/host.

## Result

- `access_denied` now survives native JSON and web redirect decoding. The server projects an email only from the `AuthFailure` carrying the already verified/saved authoritative email. The web `authEmail` parameter is URL-encoded, consumed, and scrubbed with the rest of the return envelope. Client decoding accepts only a trimmed string of at most 320 characters and only when the code is `access_denied`.
- Denial renders the existing invitation wording. With an email: `<email> isn't invited to this Ergomatic. Ask James to add you.` Without one: `This account isn't invited to this Ergomatic. Ask James to add you.` The two legacy Google screens now share one behavior-preserving `LegacySignIn` component.
- The signed-in methods screen keeps connected rows but disables Add and retry unless Apple and Google proofs are both available on the current surface. The controller repeats that check. An idle `/you/sign-in-methods` remount redirects through the real router to `/you`; live link confirm/authorize views remain.
- A disabled Add row's action label now inherits the row's existing disabled color. The existing computed `not-allowed` cursor on both the row and child action is pinned by the browser regression.
- Front-door startup and the existing minute timer independently attempt the attempt and session sweep. Each has its own failure event and neither failure suppresses the other.
- `nativeGoogleProof` and only its exclusive tests/mocks were removed; the used `nativeGoogleProofAfterInit` path remains.
- The intentional global anonymous admission bucket is explained beside its declaration; its limits and behavior are unchanged.
- Cancellation now advances only after a 2xx acknowledgement. A rejection keeps the attempt ID and binding secret, drops any in-flight proof object, and exposes a retryable state. A subsequent explicit cancel, usual-sign-in choice, new sign-in, or new link preparation retries cleanup first. A server-side delete followed by a lost response is recoverable because the existing cancel route returns 204 for an already missing attempt; proof is not replayed. `reset` and `abandon` remain local teardown and do not claim synchronous remote deletion.
- When a verified `access_denied` arrives but its follow-up cleanup acknowledgement is lost, the dedicated denial and authoritative email win for display while the operation/binding remains retryable. Other typed proof errors with uncertain cleanup use the existing generic failure wording. This is the disposition of the independent review's sole MEDIUM finding.
- Native application console diagnostics use an app-owned Capacitor `Console` replacement registered first among app plugins. It uses `CAPPluginReturnNone`, never resolves/rejects, recognizes the six vendor levels, defaults an unknown level to `log`, maps missing/non-string messages to empty, preserves the full vendor message, and writes with `Swift.print` only when its immutable app-compiled environment evaluator says dev. The evaluator mirrors Capacitor's source contract exactly (`#if DEBUG`, otherwise the `CAPACITOR_DEBUG == "true"` plist fallback) without inheriting the prebuilt simulator slice's baked Debug condition. `loggingBehavior: "none"` remains unchanged so both generic credential-result loggers stay disabled.

## Changed files

Commit `1a3000d4`:

- `app/e2e/appleAuth.spec.ts`
- `app/ios/App/App.xcodeproj/project.pbxproj`
- `app/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`
- `app/ios/App/App/ErgomaticConsolePlugin.swift`
- `app/ios/App/App/MyViewController.swift`
- `app/ios/App/AppTests/ErgomaticConsolePluginTests.swift`
- `app/scripts/apple-auth-contract.test.ts`
- `app/server/auth/frontDoor.test.ts`
- `app/server/auth/frontDoor.ts`
- `app/server/auth/frontDoorRoutes.integration.test.ts`
- `app/server/auth/frontDoorRoutes.ts`
- `app/server/auth/sessions.integration.test.ts`
- `app/shared/auth.ts`
- `app/src/SignIn.frontDoor.test.tsx`
- `app/src/SignIn.tsx`
- `app/src/adapters/authFlow.test.tsx`
- `app/src/adapters/authFlow.ts`
- `app/src/native/signin.test.ts`
- `app/src/native/signin.ts`
- `app/src/shell/AppRoutes.test.tsx`
- `app/src/shell/AppRoutes.tsx`
- `app/src/you/SignInMethods.test.tsx`
- `app/src/you/SignInMethods.tsx`

Commit `970fb10e` adds the review correction in `app/src/adapters/authFlow.ts` and its test in `app/src/adapters/authFlow.test.tsx`.

Commit `15f99cc1` corrects the native default environment evaluator in `app/ios/App/App/ErgomaticConsolePlugin.swift` and removes the injected Release override from `app/ios/App/AppTests/ErgomaticConsolePluginTests.swift`, so both hosted configurations exercise the production default.

Commit `c7fce223` updates `app/src/index.css` and `app/e2e/appleAuth.spec.ts` so the unavailable Add action uses the row's existing disabled treatment, with computed-style coverage in the real browser.

No schema, migration, index, layout, copy, native dependency patch, or configuration-default change was made.

## TDD evidence

The original run directory was `.superpowers/sdd/2026-09-13-apple-review-fixes/`. Its raw logs are now preserved in `implementation-logs.tar.gz`; extract and verify as described in [artifacts.md](artifacts.md). Final whole-branch validation is recorded separately in [report.md](report.md).

| Scope | Command | Red | Green |
|---|---|---|---|
| Client denial/cancel/capability/route | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/authFlow.test.tsx src/SignIn.frontDoor.test.tsx src/you/SignInMethods.test.tsx src/shell/AppRoutes.test.tsx` | `client-red.log`: 13 failed, 93 passed | `client-green.log`: 106 passed |
| Final client scope including removed-wrapper regressions | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/authFlow.test.tsx src/SignIn.frontDoor.test.tsx src/you/SignInMethods.test.tsx src/shell/AppRoutes.test.tsx src/native/signin.test.ts` | Covered by the preceding RED and wrapper's pre-existing tests | `client-final-focused.log`: 114 passed |
| Sweep lifecycle/error boundaries | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit server/auth/frontDoor.test.ts` | `server-unit-red.log`: 2 failed, 8 passed | `server-unit-green.log`: 10 passed |
| Real PostgreSQL denial projection/session deletion | auth-free Docker command documented below | `server-integration-red.log`: 3 failed, 40 passed | `server-integration-green.log`: 43 passed |
| Native structural contract | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit scripts/apple-auth-contract.test.ts` | `native-structural-red.log`: 1 failed, 6 passed | `native-structural-green.log`: 7 passed |
| Native compile | `xcodebuild test -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -parallel-testing-enabled NO -only-testing:AppTests/ErgomaticConsolePluginUnitTests CODE_SIGNING_ALLOWED=NO` | `native-xctest-red-clean.log`: compile failed because `ErgomaticConsolePlugin` did not exist | `native-unit-debug-green.log`: 3 passed |
| App-hosted WKWebView bridge, Debug | same `xcodebuild` shape with `-only-testing:AppTests/ErgomaticConsoleBridgeTests` | Structural/compile RED above; initial async-JS harness attempt was invalid and was corrected | `native-bridge-debug.log`: 1 passed |
| App-hosted WKWebView bridge, production-default non-dev | same bridge command with `-configuration Release` | `native-production-default-release-red.log`: 1 failed because the prebuilt simulator helper emitted the diagnostic | `native-production-default-release-green.log`: 1 passed with no test override |
| Review correction: denial plus lost cleanup acknowledgement | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/authFlow.test.tsx -t 'keeps access denial actionable'` | `denial-cleanup-red.log`: received `signin_failed`, 1 failed | `denial-cleanup-green.log`: full file, 41 passed |
| Disabled Add computed appearance | `DOCKER_CONFIG=/tmp/ergomatic-review-docker pnpm e2e e2e/appleAuth.spec.ts` | `disabled-add-browser-red.log`: child action remained `rgb(63, 60, 53)` while the disabled row was `rgb(160, 154, 140)`; 1 failed, 6 passed | `disabled-add-browser-green.log`: 7 passed; row/action colors match and both cursors compute to `not-allowed` |

The first PostgreSQL RED included two intended denial-projection failures and one test-fixture assertion that incorrectly required the whole shared sessions table to contain only its newly created live row. The assertion was narrowed to the two rows owned by the test before green. The later real-PostgreSQL self-mutation independently proves the corrected expired/live predicate.

The first app-hosted bridge harness used `evaluateJavaScript` with an unsupported promise return and failed in the test harness (`native-bridge-debug-retry.log`); it was replaced with `callAsyncJavaScript`, after which the same compiled producer-to-consumer path passed. One separate simulator `Busy (Application failed preflight checks)` event occurred during the first credential mutant attempt; it was not treated as a mutant kill. The clean retry below produced the deciding assertion failure.

The older `native-bridge-release.log` is historical injected-branch evidence only: that version of the test replaced the production Console instance with `isDevEnvironment: { false }`. It is superseded by the production-default RED/GREEN receipts above and carries no default-Release claim.

## Docker integration invocation

Docker Desktop's configured credential helper hung during the first green attempt. No credentials were read or created. The retained temporary config is:

- directory: `/tmp/ergomatic-review-docker`
- `/tmp/ergomatic-review-docker/config.json`: `{"auths":{}}`

The exact full focused integration invocation was:

```sh
DOCKER_CONFIG=/tmp/ergomatic-review-docker ERGOMATIC_TEST_WORKERS=1 NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration server/auth/frontDoorRoutes.integration.test.ts server/auth/sessions.integration.test.ts
```

It passed 43/43 in `server-integration-green.log`. The mutation run used the same prefix and files plus:

```sh
-t 'returns an existing account|returns a verified Apple relay|sweepExpired deletes'
```

It failed all 3 targeted assertions against broken production and passed all 3 after restoration (`mutant-server-pg-fail.log`, `mutant-server-pg-pass.log`). The temporary auth-free config remains available for root's final gates.

## Self-mutation evidence

Each mutation changed the deciding production path, ran its covering test, restored from a precise `/tmp/ergomatic-review-mutants-1a3000d4` backup, and reran green. App source was byte-clean against `HEAD` after all restoration.

| Mutant | Broken production behavior | Fail | Restored pass |
|---|---|---|---|
| denial decoder and both invitation renderers | Removed `access_denied` from decoder and bypassed both existing denial render branches | `mutant-denial-fail.log`: 5 failed, 56 passed | `mutant-denial-pass.log`: 61 passed |
| cancellation acknowledgement | Treated rejected cancel delivery as acknowledged | `mutant-cancel-fail.log`: 4 failed, 36 passed | `mutant-cancel-pass.log`: 40 passed |
| provider capability and idle route | Forced Add/retry available, removed controller's two-provider guard, and rendered link UI for idle route | `mutant-availability-route-fail.log`: 5 failed, 93 passed | `mutant-availability-route-pass.log`: 98 passed |
| session sweep scheduling | Removed the session sweep from the shared startup/minute owner | `mutant-sweep-wiring-fail.log`: 2 failed, 8 passed | `mutant-sweep-wiring-pass.log`: 10 passed |
| server denial email and real session deletion | Suppressed both JSON/redirect email projections and turned `SessionStore.sweepExpired` into a no-op | `mutant-server-pg-fail.log`: all 3 targeted tests failed | `mutant-server-pg-pass.log`: all 3 passed |
| native dev sink | Forced the Console plugin to emit nothing | `mutant-native-dev-fail.log`: compiled bridge and two dev unit behaviors failed (4 assertion failures across 4 tests) | `mutant-native-dev-pass.log`: 4 passed |
| native non-dev guard | Forced Console emission despite an injected non-dev environment | `mutant-native-nondev-fail.log`: 1 failed | `mutant-native-nondev-pass.log`: 1 passed |
| credential-result privacy | Changed the bundled native test config from `loggingBehavior: none` to `debug`, reopening generic native/JS result logs | `mutant-native-credential-fail.log`: compiled bridge's credential-absence assertion failed | `mutant-native-credential-pass.log`: 1 passed |
| native override registration | Removed the app Console registration | `mutant-native-registration-fail.log`: 1 failed, 6 passed | `mutant-native-registration-pass.log`: 7 passed |
| denial/cleanup precedence | Replaced the retained denial with generic cleanup failure | `mutant-denial-precedence-fail.log`: 1 failed | `mutant-denial-precedence-pass.log`: 1 passed |
| production-default native environment | Replaced the app-compiled Release fallback with the prebuilt simulator's `CapacitorBridge.isDevEnvironment` getter | `mutant-native-default-environment-fail.log`: hosted Release diagnostic-absence assertion failed | `mutant-native-default-environment-pass.log`: 1 passed |
| disabled Add action color | Replaced the inherited disabled color with the normal secondary ink color | `mutant-disabled-add-browser-fail.log`: computed row/action color assertion failed; 1 failed, 6 passed | `mutant-disabled-add-browser-pass.log`: 7 passed |

The three added browser cases exercise the same rendered denial, Add/idle route, and cancellation retry paths against the actual app/server stack. Their production seams were killed by the client/server mutants above. Root's coordinated latest-main browser gate passed 7/7 Apple-auth cases and 2/2 design cases at web source `7a961b97`; the later `15f99cc1` delta is native-only. Eight portrait/landscape captures were inspected (`browser/report.md`).

## Gates

- Full repository app lint: `pnpm lint` — PASS (`lint-final.log`). The first run correctly failed five Promise-returning JSX fixture handlers after `prepareLink` became async; they were changed to `void` handlers and the full lint gate passed.
- Full app typecheck: `pnpm typecheck` — PASS, including E2E TypeScript membership 25/25 (`typecheck-final.log`). All four app commits ran the same typecheck through the normal pre-commit hook (`commit.log`, `review-fix-commit.log`, `native-default-commit.log`, and `disabled-add-commit.log`).
- Full format check: `pnpm format:check` — PASS (`format-final.log`).
- Commit hooks: all four app commits ran lint-staged Prettier + ESLint with no bypass, then full app typecheck/E2E census — PASS.
- Xcode project parse/package graph: `xcodebuild -project ios/App/App.xcodeproj -list` — PASS; App and AppTests targets and App scheme present (`xcode-project-list.log`).
- Final focused client: 114/114 — PASS (`client-final-focused.log`); final review-corrected auth-flow file: 41/41 — PASS (`denial-cleanup-green.log`).
- Final focused server/native structural: 17/17 — PASS (`server-native-contract-final.log`).
- Focused PostgreSQL: 43/43 — PASS (`server-integration-green.log`).
- Native direct unit and production-default hosted Debug: 4/4 — PASS (`native-production-default-debug-green.log`).
- Native app-hosted compiled bridge Debug: 1/1 within that 4-test run — PASS. The test drives `console.warn("ERGOMATIC_NON_CREDENTIAL_DIAGNOSTIC")` from the loaded production WKWebView to captured native stdout, then resolves `ERGOMATIC_SYNTHETIC_APPLE_CREDENTIAL_F3` through a test-only promise plugin's real native `toJs`/JS `fromNative` path and requires that marker absent.
- Native app-hosted compiled bridge production-default Release: 1/1 — PASS with no injected replacement (`native-production-default-release-green.log`).
- E2E TypeScript: PASS and included in the 25/25 census. Root's named real-stack gate passed 7/7 Apple-auth and 2/2 design cases; all 8 captures were inspected (`browser/report.md`). The follow-up real-browser TDD gate passed 7/7 and now pins the disabled action's inherited color; its row and child cursors already computed to `not-allowed` before the CSS correction. Axe also reports the pre-existing You page missing an `h1`.
- Full coverage, HTML per-file coverage, full unit/client suites, production build/dist, and full E2E are explicitly unmeasured by this fix task because the brief assigns the single final whole-branch validation to root after merging latest main. No coverage percentage is claimed.

## Per-file coverage status

Coverage was not regenerated for this fix commit. These changed production files therefore have explicit unmeasured HTML coverage status pending root's final source-pinned run:

| Production file | Fix-task evidence | HTML coverage |
|---|---|---|
| `app/server/auth/frontDoor.ts` | unit lifecycle/error-boundary tests + mutation | unmeasured |
| `app/server/auth/frontDoorRoutes.ts` | real PostgreSQL route tests + mutation | unmeasured |
| `app/shared/auth.ts` | client/server typecheck and route/decoder tests | unmeasured |
| `app/src/SignIn.tsx` | rendered client tests + mutation | unmeasured |
| `app/src/adapters/authFlow.ts` | 41-test focused file, concurrency/cancellation tests, four client mutation groups | unmeasured |
| `app/src/native/signin.ts` | focused client regression tests | unmeasured |
| `app/src/shell/AppRoutes.tsx` | real router test + mutation | unmeasured |
| `app/src/you/SignInMethods.tsx` | rendered capability/denial tests + mutation | unmeasured |
| `app/src/index.css` | real-browser computed disabled color/cursor test + mutation | unmeasured |
| `app/ios/App/App/MyViewController.swift` | structural registration test + compiled bridge + mutation | JavaScript HTML coverage not applicable; Xcode coverage unmeasured |
| `app/ios/App/App/ErgomaticConsolePlugin.swift` | direct XCTest, production-default Debug/Release WKWebView/stdout gates, four native mutation groups | JavaScript HTML coverage not applicable; Xcode coverage unmeasured |

`app/ios/App/App.xcodeproj/project.pbxproj` and the shared scheme are build metadata; `xcodebuild -list` and Debug/Release XCTest compilation cover them. Test and E2E files do not receive production coverage claims.

## Source-grounded comparisons and limits

- The implementation uses Capacitor 8.5.1's public `capacitorDidLoad`/`registerPluginInstance` replacement seam and keeps `loggingBehavior: none`, as established in `docs/superpowers/research/2026-09-13-apple-review-fixes/native-logging-fix-research.md` and hardened in `native-logging-harden.md`.
- Root explicitly declined the hardening draft's ungrounded 4,068-character truncation. This implementation preserves the full vendor message and the vendor's six-level/default/empty-message semantics.
- The Release anomaly was diagnosed against the actual built artifacts (`native-environment-diagnosis.log`). Debug app build settings define `DEBUG` and `CAPACITOR_DEBUG=true`; Release defines neither, and the built Release app plist contains `CAPACITOR_DEBUG=""`. Capacitor 8.5.1 arrives as a prebuilt XCFramework. Disassembly shows both simulator architectures return constant true from `CapacitorBridge.isDevEnvironment` (`mov w8, #0x1` / `movb $0x1`), while the device arm64 slice contains the expected `Bundle.main`/`CAPACITOR_DEBUG` lookup. The plugin now compiles the vendor's exact source decision in the app target, preserving device semantics while preventing the simulator artifact's baked Debug condition from overriding Release. The production-default hosted Release gate now passes without a test replacement; the injected-false direct unit remains separate branch evidence.
- Redirected XCTest stdout proves the app-hosted WKWebView-to-native sink and credential absence. It does not prove an operator's physical-device log collector captures `Swift.print`; the research record leaves actual Debug device/simulator collection as a later release gate.
- Capacitor can still send an unmatched native error to `console.warn` after a document loses its callback. Apple rejection messages and codes remain fixed literals with no credential/error data, and the structural contract pins the bounded rejection vocabulary and absence of logging/storage APIs.
- No front-end geometry or new user-visible copy was introduced. Root owns the final real-stack portrait/landscape inspection, including the follow-up unavailable-Add recaptures after `c7fce223`.
- Session-sweep query cost/lock measurement is owned by root's independent DBA task against the actual migrated schema; no index/migration was added here. The authoritative result belongs in `docs/superpowers/research/2026-09-13-apple-review-fixes/db-cost/report.md` after its corrected fixture run.
- An exploratory `xcrun swift-format lint --strict` was not treated as a project gate: this repository has no Swift format configuration, and the tool's default two-space indentation conflicts with the existing four-space Swift style. The source compiled in both configurations and passed the native gates above.
- The original Apple implementation execution remains platform-blocked and excluded. This report does not clear that review or claim whole-PR readiness.
