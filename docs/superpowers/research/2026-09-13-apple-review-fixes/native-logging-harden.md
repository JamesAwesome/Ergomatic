# Native logging correction — mechanism hardening

**Scope:** one mechanism pass over the `Native logging correction` contract. This does not resume the interrupted Apple implementation review and does not clear its incomplete verdict. No runtime, device, provider, or archived probe was used.

All shortened vendor paths below are relative to `app/node_modules/@capacitor/ios/Capacitor/Capacitor/`, the installed 8.5.1 source corresponding to the exact SwiftPM 8.5.1 dependency.

**Verdict:** the app-owned `Console` override is a supported, deterministic mechanism for restoring application `console.*` diagnostics while `loggingBehavior: "none"` keeps Capacitor's two generic result loggers off. The contract needs the two corrections below: make any sink seam instance owned, and require one app-hosted WKWebView-to-native-stdout gate. No vendor fork or global logging toggle is justified.

## Findings

### PROVEN — the public hook reaches the replacement after the built-in is registered

`CAPBridgeViewController.loadView()` constructs `CapacitorBridge` and then calls the open `capacitorDidLoad()` hook (`app/node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift:30-53,158-165`). The bridge constructor registers `CAPConsolePlugin` before it returns (`CapacitorBridge.swift:204-225,304-333`). `registerPluginInstance` is public, replaces the `plugins[jsName]` entry, loads the replacement, and appends its document-start shim (`CapacitorBridge.swift:349-365`). `MyViewController` is the storyboard's sole bridge controller and already registers app plugins in that hook (`app/ios/App/App/Base.lproj/Main.storyboard:14`; `app/ios/App/App/MyViewController.swift:16-21`).

The phrase “register first” must mean first among the app-owned registrations after `super.capacitorDidLoad()`. The vendor built-in has necessarily registered before the hook. Use a distinct native identity such as `ErgomaticConsolePlugin`, with `jsName = "Console"`, so the override is explicit while JavaScript keeps the vendor protocol name.

Strongest attack that held: the built-in and replacement both append a `Console` document-start shim. Both shims expose the same `log` shape; native dispatch selects the bridge dictionary's last `Console` instance (`CapacitorBridge.swift:477-503`), so the earlier built-in instance cannot receive a call after replacement. There is no later vendor registration pass.

### PROVEN — registration survives navigation and WebContent process reload

The replacement is minted once per `CapacitorBridge` in `capacitorDidLoad` and retained in that bridge's plugin dictionary. Navigation reset clears stored calls and listeners, not plugins (`CapacitorBridge.swift:292-299`). A WebContent termination invokes that reset and reloads the same WKWebView (`WebViewDelegationHandler.swift:164-168`). `WKUserScript`s were attached to the persistent content controller at document-start (`JSExport.swift:73-108`), so core bridge and plugin shims run again for each document while native lookup continues to select the replacement. A new view controller constructs a new bridge and repeats the same registration order.

No reload hook, mutable enable flag, or temporary `CAPLog` window belongs in this mechanism. Keep a testable sink as immutable instance state created with the plugin. A static mutable sink override would introduce a process-wide timing window and make concurrent tests or a second bridge nondeterministic.

| State | Minted | Cleared/replaced | Lifetime |
|---|---|---|---|
| `CAPLog.enableLogging = false` | Controller `loadView`, from bundled `loggingBehavior` | A later bridge controller can assign it again | Process-global vendor flag; this app's sole controller sets it once |
| `window.Capacitor.isLoggingEnabled = false` | Core script at each document start | Next document replaces the JS realm | One document |
| App `Console` plugin instance | `capacitorDidLoad` after bridge construction | Bridge/controller destruction | One native bridge; survives navigation reset |
| Console shim | Added to `WKUserContentController`; evaluated at document start | JS realm destruction, then evaluated again | One document, backed by the same native plugin |

### PROVEN — `Swift.print` is the independent native sink, and the input contract must be exact

The vendor bridge patches exactly `debug`, `error`, `info`, `log`, `trace`, and `warn`, always posting `{ level, message }` to `Console.log` on iOS regardless of `isLoggingEnabled` (`assets/native-bridge.js:316-341,788-805`). The built-in plugin treats an absent/non-string message as `""` and an absent/non-string level as `"log"` (`Plugins/Console.swift:11-15`). Its `CAPLog.print` ultimately calls `Swift.print` but is disabled by the global logging setting (`CAPLog.swift:1-9`). `CapacitorBridge.isDevEnvironment` is public; the vendor source returns true when compiled with `DEBUG` or for the SPM `CAPACITOR_DEBUG=true` fallback (`CapacitorBridge.swift:22-35,56-58`). The implementation-review correction below distinguishes that framework compilation from the app configuration.

Accepted contract after controller disposition: `ErgomaticConsolePlugin.log` checks its immutable app-owned development-mode evaluator on every call, maps any level outside the six vendor levels to `log`, maps an absent or non-string message to the empty string, formats one line with the full message, and sends that value to an immutable instance-owned sink whose production default is `Swift.print`. Empty and absent messages therefore emit the same empty diagnostic line in a dev environment; a non-dev environment emits nothing. Any test-only environment evaluator and sink are immutable constructor inputs whose production defaults evaluate the vendor source’s `#if DEBUG` / existing `CAPACITOR_DEBUG` plist rule in the app compilation context and call `Swift.print`; there is no static test override. The method declares `CAPPluginReturnNone` and calls neither `resolve` nor `reject` on any branch.

The last sentence is structural, not stylistic. `JSExport.generateMethod` implements return-none through `nativeCallback` without an actual callback (`JSExport.swift:135-176`); `native-bridge.js` consequently posts callback ID `-1` (`assets/native-bridge.js:897-919,997-1004`). Calling `resolve` would enter the generic native `toJs` producer (`CAPPluginCall.swift:37-43`; `CapacitorBridge.swift:505-528,576-599`) for a call whose JavaScript side cannot consume a result.

### PROVEN — both credential-bearing generic result loggers stay disabled

The bundled config's `none` maps to `loggingEnabled = false` (`CAPInstanceConfiguration.m:20-29`). Controller construction assigns that to `CAPLog.enableLogging` (`CAPBridgeViewController.swift:30-35`), covering native success-result serialization in `toJs` (`CapacitorBridge.swift:576-599`). The same configuration is injected as `window.Capacitor.isLoggingEnabled` (`JSExport.swift:18-21`), covering JavaScript `logFromNative` before callback delivery (`assets/native-bridge.js:938-978`). The to-native JavaScript logger is guarded by the same flag and already excludes `Console` (`assets/native-bridge.js:897-918`). Native receipt also excludes Console call options from its `CAPLog` line (`WebViewDelegationHandler.swift:192-216`).

`AppleAuth.authorize` is a promise method (`app/ios/App/App/AppleAuthPlugin.swift:57-63`), so its success result has a stored JavaScript resolver. With logging disabled, the credential goes directly to that resolver without either generic logger.

### PROVEN LIMIT — unmatched native errors remain an independent console producer

`returnResult` unconditionally calls `window.console.warn(result.error)` when an error reaches a document without a stored callback, even when `isLoggingEnabled` is false (`assets/native-bridge.js:941-990`). The replacement Console plugin will make that warning reach native stdout. This can happen after a navigation destroys the old document's callback map and a native error returns to the new document. It does not break the stated credential-result invariant: unmatched success results are not warned, and current `AppleAuthPlugin` rejection paths carry fixed message/code values rather than identity tokens or authorization codes (`AppleAuthPlugin.swift:73-99,123-155`).

Add this invariant to the correction contract: no AppleAuth rejection may put a credential in its message, code, error, or data payload. The Console override restores application diagnostics; it is not a redactor for values deliberately passed to `console.*` or for vendor's unmatched-error warning.

Native `toJsError` itself does not print the error payload; only a JavaScript-evaluation failure goes through `CAPLog` (`CapacitorBridge.swift:601-611`). Startup JavaScript error logging also remains behind `CAPLog` (`WebViewDelegationHandler.swift:350-366`). No other vendor result/error logger found in the reachable Apple promise path reopens credential result logging under `none`.

## Required proof

A direct XCTest call to `ErgomaticConsolePlugin.log` proves formatting, full-message behavior, environment gating, and the final `Swift.print` sink. It does not prove the override won registration or that injected `window.console` reaches it.

The minimal deciding gate is a serialized app-hosted XCTest using the real compiled `MyViewController`/WKWebView and process stdout capture. After the actual document finishes loading, evaluate `console.warn("ERGOMATIC_NON_CREDENTIAL_DIAGNOSTIC")` in that WKWebView and require the exact native line once in captured stdout. In the same host, invoke a test-only promise plugin through its injected JavaScript shim; have its native method resolve a result containing `ERGOMATIC_SYNTHETIC_APPLE_CREDENTIAL_F3`, then require that marker to be absent from captured stdout. This one gate crosses document-start injection, JavaScript console patching, `WKScriptMessageHandler`, native plugin lookup, the app sink, native `toJs`, and JavaScript `fromNative`. A JavaScript spy, source regex, or direct plugin call cannot substitute for it.

Also run the host in the non-dev configuration and require the ordinary marker absent. Actual Debug simulator/device log collection remains a later release gate: source reachability and redirected XCTest stdout do not establish that the chosen operator log collector captures `Swift.print` on real hardware.

## Proposed antagonist ledger entry

### Native logging correction mechanism, 2026-09-13 (AUTH privacy, lens 1)

- **HELD:** an app-owned native plugin can replace Capacitor 8.5.1's built-in `Console` through the public `capacitorDidLoad`/`registerPluginInstance` seam. The bridge retains the replacement across navigation reset and reruns its shim in each document.
- **HELD:** keeping `loggingBehavior: none` disables native `toJs` serialization logs and JavaScript `logFromNative`; the replacement's dev-only `Swift.print` restores only application `console.*`, not internal `CAPLog` diagnostics.
- **CORRECTED:** the sink seam is immutable instance state, return-none never resolves/rejects, levels default to the six vendor levels, full messages are preserved, and absent/non-string message follows vendor empty-string behavior. The controller declined the ungrounded proposed truncation; see disposition below.
- **CORRECTED:** direct plugin invocation was not accepted as the deciding oracle. The required gate drives `console.warn` from the loaded production WKWebView to captured native stdout and drives a synthetic native credential result back through the same compiled bridge while asserting the credential absent.
- **LIMIT:** vendor `returnResult` still forwards unmatched native errors to `console.warn` independently of the logging flag. Current Apple rejections carry no credentials; that becomes an explicit invariant. Real device log collection remains unproved.
- **DISPOSITION:** mechanism corrected once; no prescribed-code lens, runtime probe, vendor fork, or original Apple code-review resumption.

## Proposed durable technique

- **A native logger unit test can prove the sink while missing the bridge that selects it.** For a Console override, drive `console.*` inside the loaded production WKWebView and capture process stdout; in the same host, send a forbidden synthetic result through native `toJs` and JavaScript `fromNative`. Read the no-callback error branch too: it can call patched `console.warn` even when generic logging is disabled.

## Controller disposition

Accepted the public registration seam, immutable instance-owned sink, return-none contract, empty-message behavior, credential-free rejection payloads, and compiled WKWebView-to-stdout oracle. The proposed 4,068-character truncation is declined: neither pass established a product or platform requirement for that number. Preserve the vendor’s full-message behavior; level defaults remain bounded to the six existing levels. No executable implementation blocks were prescribed, so lens 2 is skipped. The original blocked execution remains excluded.

## Implementation-review correction: prebuilt simulator classification

The initial source-only recommendation used `CapacitorBridge.isDevEnvironment` directly. Actual Release XCTest exposed a compiled-artifact distinction: the app’s Release plist has an empty `CAPACITOR_DEBUG` value and no app `DEBUG` condition, but both prebuilt Capacitor 8.5.1 simulator architectures return constant true. The device arm64 slice contains the expected main-bundle fallback. The accepted fix evaluates that same vendor rule in the app module, preserving device semantics and preventing the simulator binary’s build mode from selecting app logging. The deciding Release gate must use the production-default Console instance; forcing a false evaluator after registration proves only an injected unit branch. Exact artifact diagnosis and final default-host test evidence belong to the implementation report. This is a correction from observed compiled behavior, not another prescribed-code hardening pass or a resumption of the original blocked execution.
