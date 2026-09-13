# Native logging correction research

**Source head:** `86ed0636fd37c5969bdd369813534c4690de964d`  
**Installed/built compatibility:** Capacitor iOS `8.5.1` (`app/ios/App/CapApp-SPM/Package.swift:7,14,28`), iOS 15 floor. Read-only source research; no build, test, device, or runtime probe was performed.

## Recommendation

Keep `loggingBehavior: "none"`, and add a first-party iOS plugin with `jsName = "Console"` and the same single `log`/`CAPPluginReturnNone` contract as Capacitor's built-in console. Register its instance first in `MyViewController.capacitorDidLoad()`. Its `log` method should emit a level from the vendor set with the full message through an app-owned native sink (the production default can mirror `CAPLog.print` with `Swift.print`) only when `CapacitorBridge.isDevEnvironment` is true. It must never resolve the return-none call.

This is the smallest supported correction because it uses the public plugin override seam already used by Ergomatic. Capacitor registers `CAPConsolePlugin` during bridge construction (`CapacitorBridge.swift:304-333`); `registerPluginInstance` explicitly replaces an existing `jsName`, loads the instance, and exports its shim (`:349-365`). `CAPBridgeViewController` constructs the bridge before calling the open `capacitorDidLoad` hook (`CAPBridgeViewController.swift:30-53,158-165`). Ergomatic already registers local plugins there (`app/ios/App/App/MyViewController.swift:16-21`). `CapacitorBridge.isDevEnvironment` is public and preserves Capacitor's Debug/release behavior, including the SPM `CAPACITOR_DEBUG` fallback (`CapacitorBridge.swift:22-35`). `Swift.print` adds no iOS-version requirement beyond the existing iOS 15 floor.

## Layers and limits

Two credential-bearing generic loggers must remain disabled:

1. Native success delivery serializes the full result and prints its first 256 characters through `CAPLog` before JavaScript delivery (`CapacitorBridge.swift:576-592`).
2. JavaScript `fromNative` logs the result data when `cap.isLoggingEnabled` (`assets/native-bridge.js:938-945`; logger body `:316-341`).

`loggingBehavior: "none"` disables both: config selects `_loggingEnabled = false` (`CAPInstanceConfiguration.m:20-29`), `CAPBridgeViewController` assigns it to `CAPLog.enableLogging` (`:30-35`), and `JSExport` publishes it as `window.Capacitor.isLoggingEnabled` (`JSExport.swift:18-21`). It also disables the built-in application Console sink because that plugin calls `CAPLog.print` (`Plugins/Console.swift:3-15`; `CAPLog.swift:1-9`).

The injected bridge still forwards every iOS `console.debug/error/info/log/trace/warn` to plugin ID `Console` regardless of `isLoggingEnabled` (`assets/native-bridge.js:788-805`). Console calls are excluded from generic to-native logging (`:908-918`; `WebViewDelegationHandler.swift:205-216`). Therefore the replacement plugin restores ordinary app diagnostics without reopening either result logger.

There is no public per-plugin result-log filter in this version. Plugin success handlers always enter internal `toJs` (`CapacitorBridge.swift:505-528`), and `toJs` plus `JSResultProtocol` are module-internal (`:576-599`; `JS.swift:24-44`). Config offers only the global logging switch. Do not toggle it around an async authorization.

This supported mechanism restores application `console.*` at the native sink, not Capacitor's internal `CAPLog` startup/plugin diagnostics. Preserving those internal logs while redacting only AppleAuth would require a reproducible fork/patch of both the SwiftPM `capacitor-swift-pm` dependency and injected `native-bridge.js`; patching npm `node_modules/@capacitor/ios` alone would not patch the exact remote SwiftPM product compiled by this app. That would be a novel dependency-maintenance mechanism and is not recommended for this fix.

## Concrete oracle

Add a native XCTest that redirects process stdout to a pipe, constructs a synthetic `CAPPluginCall` for `Console.log`, invokes the replacement plugin's production-default sink with `ERGOMATIC_NON_CREDENTIAL_DIAGNOSTIC`, and asserts one full native message with the requested level. Exercise the release/non-dev branch and assert no message. Keep the vendor-bridge synthetic Apple result oracle, asserting `ERGOMATIC_SYNTHETIC_APPLE_CREDENTIAL_F3` is absent from captured JavaScript logging; an app-hosted synthetic plugin-result case must also assert it is absent from captured native stdout. The contract test must pin: replacement `jsName`, return-none method, registration order, the installed bridge's unconditional Console forwarding, and both credential-log guards. On an actual Debug simulator/device, the later hardware gate should require the synthetic diagnostic in collected native logs and the synthetic credential absent; JavaScript message forwarding alone is not that proof.
