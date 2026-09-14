# Scoped code-quality review

**Reviewed:** app production and test delta `86ed0636fd37c5969bdd369813534c4690de964d...970fb10eba9c90dc296b21cd9d10c04a34e0fee6`

**Original verdict: NEEDS FIXES — 1 MEDIUM finding, resolved below.**

## MEDIUM — the non-dev bridge oracle replaces the production environment decision

Production constructs `ErgomaticConsolePlugin` with `CapacitorBridge.isDevEnvironment` (`app/ios/App/App/ErgomaticConsolePlugin.swift:16-20`). In the non-Debug branch, however, the bridge test re-registers another Console plugin whose evaluator is hard-coded to `false` (`app/ios/App/AppTests/ErgomaticConsolePluginTests.swift:94-101`) before asserting that stdout is quiet (`:126-132`). The implementation report records why: the production evaluator returned `true` in the Release simulator host.

That test proves the injected false branch and the compiled bridge sink, but it cannot detect whether the app's production Console registration emits in Release. It therefore does not satisfy the task brief's required production `MyViewController`/WKWebView non-dev/Release oracle (`task-brief.md:25`), and the observed evaluator result remains unexplained.

Diagnose the Release build's Capacitor binary/flags and bundled `CAPACITOR_DEBUG` value, then either make the production environment decision deterministic or prove it false while exercising the production-registered plugin. Keep the injected unit test as branch coverage, labelled accordingly.

No other correctness, maintainability, repository-standards, or test-oracle findings were established in the scoped app diff. The cancellation state machine retains cleanup authority across rejected acknowledgements, releases stale authorization ownership, and has deciding concurrency/recovery mutations. Session cleanup preserves independent failure boundaries. The native credential-absence oracle still exercises the compiled Debug bridge and remains distinct from this Release gap.

This was a static review; no suites, builds, probes, devices, providers, live data, or archived expiry work were run. It does not clear the original platform-blocked execution gate.

## Resolution recheck — PASS

Rechecked only the two-file correction committed as `15f99cc1108efd33bd5dec22c7f7561445737772` (parent `7a961b975d4380265de0942ef8310c96f45a3782`). The production default now evaluates `DEBUG` in the app target and otherwise reads the existing `CAPACITOR_DEBUG == "true"` plist fallback (`app/ios/App/App/ErgomaticConsolePlugin.swift:16-29`). The hosted test no longer replaces the production Console instance (`app/ios/App/AppTests/ErgomaticConsolePluginTests.swift:86-124`).

The saved diagnosis shows the Release app has no `DEBUG` condition and bundles `CAPACITOR_DEBUG=""`; it also explains the contrary prebuilt-simulator getter without changing device semantics. The production-default Release RED/GREEN and deciding getter-restoration mutant exercise the exact correction; the prior forced-false receipt is explicitly historical. The MEDIUM finding is resolved with no remaining scoped quality issue.

This static delta recheck relied on committed source and saved receipts; it ran no tests, builds, probes, devices, providers, live data, or archived expiry work. The original platform-blocked execution gate remains incomplete.
