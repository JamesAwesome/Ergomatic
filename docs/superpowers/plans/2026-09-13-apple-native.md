# Native Apple contract and authoring provenance

The current source and approved spec govern native work. The original full-code authoring plan is historical evidence; do not paste its replacement blocks over current implementation.

## Current requirements

- iOS deployment floor remains 15.0; the app uses the existing primary bundle ID and `com.apple.developer.applesignin = [Default]` entitlement.
- The app-owned Apple bridge requests `.fullName` and `.email` and returns the documented nonce/state-bound authorization result to the auth-flow adapter, without persisting credentials or logging authorization payloads. Apple rejection messages, codes, errors and data must remain credential-free.
- Plugin instances are registered through the existing `MyViewController.capacitorDidLoad` hook before the web page loads.
- Keep `loggingBehavior: none`. The app-owned `Console` override uses a dev-only `Swift.print` sink, immutable instance-owned test seams if needed, full messages, the six vendor levels with fallback to `log`, and empty-string behavior for absent/non-string messages. Its `CAPPluginReturnNone` method neither resolves nor rejects.
- Application diagnostics must reach a real native sink while generic bridge credential-result logging stays disabled. The deciding compiled app-hosted test drives `console.warn` from the loaded production WKWebView to captured native stdout, then returns a synthetic credential through the same native/JavaScript bridge and asserts it absent. It also checks non-dev silence. Direct plugin invocation or JavaScript forwarding alone is insufficient. See [source research](../research/2026-09-13-apple-review-fixes/native-logging-fix-research.md), the [accepted mechanism and controller disposition](../research/2026-09-13-apple-review-fixes/native-logging-harden.md), and the [review-fix evidence](../research/2026-09-13-apple-review-fixes/report.md). Real device collection is a separate gate.
- Keep the production path for initialized Google proof and its tests; unused wrappers are removed rather than retained solely for tests.
- Signed compilation/provisioning and actual provider authorization are different gates. No new phone installation, live login or upload is implied by an implementation review or build.

## Historical authoring record

The [original paste-tested native plan at `86ed0636`](https://github.com/JamesAwesome/Ergomatic/blob/86ed0636fd37c5969bdd369813534c4690de964d/docs/superpowers/plans/2026-09-13-apple-native.md) preserves the full original code, build commands and author receipts. Its claim that ordinary diagnostics remain available with the built-in Console plugin and global logging disabled was disproved by the later installed-vendor source review. Its JavaScript forwarding check does not establish that the native Console sink printed anything. The original blocks and test conclusions must not be reused as current evidence.

Use the [approved spec](../specs/2026-09-12-apple-signin-design.md), current `app/ios` source and [release instructions](../../RELEASING.md) for current work. Keep historical compile/coverage results pinned to their actual source commits. The original platform-blocked review remains incomplete and is not resumed by this correction.
