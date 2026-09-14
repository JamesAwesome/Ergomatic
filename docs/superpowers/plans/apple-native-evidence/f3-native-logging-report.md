# F3 native bridge credential-logging correction

Status: **DONE_WITH_CONCERNS**

Source commits: `33ccd85e07227082722089bb4fe7cc5f220b5765`,
`81ce60409d78034bf2ceb62e4b9d0cfd1a19ca8b`

## Change

At the source commits above, `app/capacitor.config.ts` sets `loggingBehavior: "none"`, the actual
Capacitor configuration owner. This disables credential-bearing native result
serialization and JavaScript `logFromNative` output in Debug builds. The
historical test proved that JavaScript still forwards an ordinary synthetic
application message to the Console plugin. It did not exercise the native
sink: the built-in Console plugin also uses the disabled `CAPLog`, so that
message is not printed there. The current correction contract is in
`../2026-09-13-apple-native.md`; the results below remain historical evidence
for the original credential-log correction, not proof that native diagnostics
were preserved.

`app/scripts/apple-auth-privacy.test.mjs` consumes either the synced native
config or a built App bundle's config, pins the installed Capacitor 8.5.1
configuration-to-logging path, executes the installed `native-bridge.js`, and
delivers `ERGOMATIC_SYNTHETIC_APPLE_CREDENTIAL_F3` through an AppleAuth result.
The test asserts that the credential is absent from captured bridge logs and
that a noncredential application diagnostic still reaches the JavaScript-to-native
Console dispatch boundary.
The complete committed patch is `38-f3-source.patch`.

## Root cause and proof boundary

The original source contract inspected only `AppleAuthPlugin.swift`. The
credential leaves that file through `call.resolve`: installed
`CapacitorBridge.swift` passes the serialized result prefix to `CAPLog`, and
installed `native-bridge.js` sends the whole result to `logFromNative` when
logging is enabled. Installed `CAPInstanceDescriptor.swift` maps synced
`"none"` to the none behavior; `CAPInstanceConfiguration.m` maps that behavior
to `loggingEnabled = false`; `CAPBridgeViewController.swift` assigns the value
to `CAPLog.enableLogging`.

The executable portion measures the real installed JavaScript bridge with
actual synced and built configuration. The native branch is established from
the installed source/configuration path plus a successful unsigned build; no
sentence here claims a device runtime observation.

## TDD and mutation

The new gate was written before the config correction. Against `202f6087`'s
synced default Debug configuration it exited 1 because the installed bridge
logged the synthetic credential (`39-f3-tdd-red.log`). After setting
`loggingBehavior: "none"` and syncing, the same gate reported
`credentialLogged:false` and `applicationDiagnosticForwarded:true`
(`23-f3-privacy-green.log`).

After committing, the unique deciding-source line was mutated from `"none"`
to `"debug"` and native config was resynced. The original reviewer probe
reported `credentialLogged:true` (`31-f3-reviewer-probe-debug.log`), and the
new gate exited 1 with `the installed JavaScript bridge logged the synthetic
Apple credential` (`32-f3-mutation-privacy-red.log`). Restoring the committed
config and resyncing made the gate pass for both the synced config and built
App bundle (`34-f3-mutation-privacy-green.log`,
`35-f3-built-config-privacy-green.log`). The original reviewer probe, adapted
only by replacing its hardcoded logging boolean with the actual synced
configuration value, then reported `credentialLogged:false`
(`36-f3-reviewer-probe-none.log`). The deciding-source mutation was repeated
after the installed-source mapping assertions were added; it failed the same
credential assertion (`43-f3-final-mutation-red.log`). The candidate returned
to a clean `81ce6040` tree.

## Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | PASS | `20-f3-diff-check.log` |
| `pnpm format:check` | PASS | `21-f3-format-check.log` |
| focused native contract Vitest | PASS, 1 file / 6 tests | `22-f3-contract-test.log` |
| synced-config privacy gate | PASS | `23-f3-privacy-green.log`, `34-f3-mutation-privacy-green.log` |
| `pnpm lint` | PASS | `24-f3-lint.log` |
| `pnpm typecheck` | PASS; E2E TypeScript membership 24/24 | `25-f3-typecheck.log` |
| `pnpm build` | PASS; 329 Vite modules transformed | `26-f3-pnpm-build.log` |
| `pnpm exec cap sync ios` | PASS; eight installed plugins | `27-f3-cap-sync.log`, `33-f3-restore-cap-sync.log` |
| synced config inspection | PASS; `loggingBehavior` is `none` | `28-f3-synced-config.log` |
| unsigned Debug simulator build | PASS; `BUILD SUCCEEDED` | `29-f3-xcode-build.log.gz` |
| source membership / built config / settings | PASS; both Swift inputs once, built config `none`, iOS 15.0, expected entitlement | `37-f3-xcode-gates.log` |
| built-config privacy gate | PASS | `35-f3-built-config-privacy-green.log` |
| clean-tree format, contract, and privacy gates | PASS at `33ccd85e`; final-head rerun below | `40-f3-final-status-tests.log` |
| final clean-tree lint | PASS | `41-f3-final-lint.log` |
| final clean-tree typecheck | PASS; E2E TypeScript membership 24/24 | `42-f3-final-typecheck.log` |
| final-head format, contract, synced/built privacy gates | PASS at exact `81ce6040` | `44-f3-final-head-tests.log` |
| final-head lint | PASS | `45-f3-final-head-lint.log` |
| final-head typecheck | PASS; E2E TypeScript membership 24/24 | `46-f3-final-head-typecheck.log` |

The brief explicitly excluded unrelated broad suites; none were rerun.

## Coverage

Per-file runtime coverage is not applicable. `capacitor.config.ts` is outside
the coverage include (`src/**`, `server/**`, and `domain/**`), and the privacy
gate is an executable test script rather than product runtime code. Behavior is
covered by the fail-then-pass test and deciding-source mutation above.

## Brief contradictions and remaining debt

The original native plan claimed that after a WebView reload no JavaScript
value could claim the retained callback and that token identity prevented any
later attempt from receiving it. The reviewer's equal-seed probe disproved that
absolute at the Capacitor document boundary: UUID identity isolates native
Apple attempts, while randomized callback IDs provide probabilistic document
separation. The plan now states the narrower proven claim.

R1 remains a nonblocking conditional hardening concern, not a demonstrated
device exploit. Fixing it now would require retiring the retained JavaScript
receiver at a proven document-lifecycle seam. No such seam has been established
for the supported iOS 15 path, and this correction was explicitly directed not
to invent a new document mechanism. The parent should carry that debt into its
final disposition without promoting injected callback-ID equality into a
natural collision or attacker capability.
