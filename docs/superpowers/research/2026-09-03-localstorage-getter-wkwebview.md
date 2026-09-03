# AUD-011: can the `localStorage` GETTER throw in our iOS WebView? — NO, on the supported path.

## 0. Our actual origin (read this session)
`app/capacitor.config.ts` + `app/ios/App/App/capacitor.config.json` declare **no `server` block** — no `iosScheme`, `hostname`, `url`, or `ios.limitsNavigationsToAppBoundDomains`. So Capacitor defaults hold. **PRIMARY, vendored `app/node_modules/@capacitor/ios`:** `CAPInstanceDescriptor.swift:4-6` `public static let scheme = "capacitor"` / `hostname = "localhost"` (overrides read only from `server.iosScheme`/`server.hostname`, `:88-93`); `CAPBridgeViewController.swift:297` `setURLSchemeHandler(assetHandler, forURLScheme: configuration.localURL.scheme ?? InstanceDescriptorDefaults.scheme)`.
**Origin = `capacitor://localhost`**, served by a `WKURLSchemeHandler` (`WebViewAssetHandler.swift:6`) — not `file://`, not a nil-baseURL HTML string. `CAPBridgeViewController.swift:119-120` builds a bare `WKWebViewConfiguration()` and never assigns `websiteDataStore` → `.default()`, persistent. Grep `storageBlocking|nonPersistent` over `@capacitor/ios/Capacitor/` and `ios/App/App/*.swift`: **no hits**. Floor `IPHONEOS_DEPLOYMENT_TARGET = 15.0`; nothing below is version-gated. **Correction to the brief: we are on Capacitor 8.5** (`app/package.json:35-57`), not 7.

## 1. Sub-question 1 — can it throw natively? No.
**PRIMARY, WebKit `Source/WebCore/page/LocalDOMWindow.cpp:941-974`.** The getter has exactly one throw:
> `if (document->canAccessResource(ScriptExecutionContext::ResourceType::LocalStorage) == ScriptExecutionContext::HasResourceAccess::No)` → `return Exception { ExceptionCode::SecurityError };`

Attribute the argument needs: that path is *sole*. Every other failure (`!isCurrentlyDisplayedInFrame`, no document, no page, `page->isClosing()`, `!page->settings().localStorageEnabled()`) returns `nullptr` → `window.localStorage === null` → a **TypeError** on `.getItem`, not a `SecurityError`.

**PRIMARY, `Source/WebCore/dom/ScriptExecutionContext.cpp:940-971`.** For `ResourceType::LocalStorage` exactly three routes reach `No`:
> `if (!origin || origin->isOpaque()) return HasResourceAccess::No;`
> `if (isOriginEquivalentToLocal(*origin)) return HasResourceAccess::No;`  (`:940-943` = `origin.isLocal() && !needsStorageAccessFromFileURLsQuirk() && !hasUniversalAccess()`)
> `if (m_storageBlockingPolicy == StorageBlockingPolicy::BlockAll) return HasResourceAccess::No;`

`BlockThirdParty` returns `DefaultForThirdParty` (`:966`), never `No`. All three are closed for us:
- **Not opaque.** `SecurityOriginData.cpp:193-210` — opaque for an invalid URL, a host-requiring scheme with empty host, or a `shouldTreatURLSchemeAsNoAccess` scheme; that list is `LegacySchemeRegistry.cpp:171-181` = `"about"`, `"javascript"`, `"data"`. Our URL is valid, host `localhost`, scheme in none of them.
- **Not local.** `SecurityOrigin.cpp:114` sets `m_isLocal` from `shouldTreatURLSchemeAsLocal`; the builtin set (`LegacySchemeRegistry.cpp:111-121`) is `"file"` and, on Cocoa, `"applewebdata"`.
- **Not `BlockAll`.** **PRIMARY, `Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml:8762-8775`:** `StorageBlockingPolicy` `defaultValue: WebKit: WebCore::StorageBlockingPolicy::BlockThirdParty` (`WebKit` = the WKWebView layer). The attribute that matters: **`status: embedder`** — it moves only if the embedder sets it (`_WKStorageBlockingPolicy` SPI). Capacitor doesn't; we don't. Our page is the top document, so `topOrigin` is same-origin at `:966` and it returns `Yes`.
- **Lockdown Mode is not a trigger.** Same YAML: `LocalStorageEnabled:5377-5390` (`WebKit: true`) and `StorageBlockingPolicy:8762-8775` both **lack** the `disableInLockdownMode: true` key that 20+ neighbouring preferences carry.

**SECONDARY, corroborating:** the only two public reports of this exception in an iOS WebView are the two cases the code names — [CB-11524](https://issues.apache.org/jira/browse/CB-11524) (Cordova `file://` → `isOriginEquivalentToLocal`) and [Revlis, Medium](https://michaelrevlis.medium.com/handling-securityerror-the-operation-is-insecure-when-using-localstorage-in-an-ios-webview-565142b5ef8a) (`loadHTMLString` with `baseURL: nil` → opaque). Neither is a scheme-handler origin.

**Eviction / low disk / "clear website data" do not reach the getter.** INFERENCE from the quoted function: the storage-area acquisition (`:970`) has no exception path, so those conditions lose *data* or make `setItem` throw `QuotaExceededError` — they cannot make the getter throw.

## 2. Sub-question 2 — what does a rower do to get there? Nothing.
No user-reachable iOS setting, Screen Time control, or Safari privacy toggle sets `_WKStorageBlockingPolicy` on a third-party app's configuration: it is a per-configuration preference built in our own process (`CAPBridgeViewController.swift:120`) and never read from system defaults. INFERENCE, resting on the `status: embedder` attribute above plus the empty grep. Reaching a native throw requires changing OUR code — `server.iosScheme: "file"`, `loadHTMLString` with a nil baseURL, or the `BlockAll` SPI. **On the web arm it stays fully reachable** (desktop Safari "Block all cookies", Chrome/Firefox site-data blocking, any opaque embedding).

## 3. Already settled in-repo — cite, don't re-derive
- **WHATWG PRIMARY, vetted:** `.claude/agents/antagonist-ledger.md:4166-4169` — "`removeItem` carries no throw condition; `setItem` throws `QuotaExceededError`; the `localStorage` getter throws `SecurityError` — which fails every access, not one method." Re-confirmed against the spec this session (getter steps 2-3: "If map is failure, then throw a SecurityError DOMException").
- **The store already wraps the getter:** `docs/superpowers/specs/2026-08-30-handoff-protocol-design.md` §8 — "a getter throw makes both tiers behave as absent-durable with a receipt" — shipped at `app/src/monitor/handoffStore.ts:177,236`.
- **`loadMonitorRun` is off the list** (PR #239 round 1, `ROADMAP.md:766-771`); remaining set is exactly `loadRun`, `loadDraft`, `loadTodayPick`.
- **The audit's repro was a harness injection, never a device:** `candidates.md:96-130` — "A calibrated temporary `app/src/audit-storage-getter.test.ts` made the standards-defined `window.localStorage` getter throw."
- **This is the ROADMAP's own open line** (`ROADMAP.md:748-750`): "whether the getter can throw in a Capacitor WKWebView on its own origin (the WHATWG authority is vetted; the native-layer reachability is not)." Answered nowhere else in the repo; this report answers it.

## 4. Consequence for the spec's shape
Not a retirement of AUD-011 — a re-tiering that kills one deliverable.
- **Three loader guards: KEEP, as web-arm hardening rather than a native rower fix.** Three `try` blocks; they close a real web-fallback P1 (Today throws at mount) and match the shipped `loadMonitorRun` shape. **Write them as bare `catch`, never `catch (e) { if (e.name === "SecurityError") }`** — the `nullptr` paths above make detached-document access a `TypeError` that a name-filtered catch would let escape.
- **The Retry SURFACE does not earn a screen for the getter.** The anchor's own condition (3) says a Retry under a still-denied getter is a loop, and per the source the denial is a per-document property that cannot change without a reload. Recommend: denial degrades silently to absent-durable (the §8 shape), **no Gate 0 owed for a getter Retry**, and condition (3) dissolves rather than being satisfied. Building it anyway repeats the PAUSED-state failure CLAUDE.md's brainstorming rule names — a rower-facing state the real system cannot enter.
- **AUD-015 is unaffected and is where a visible surface belongs.** `saveRun === false` comes from `setItem`/`QuotaExceededError`, natively reachable (full device, per-origin quota), and `handoffStore` already ships the approved copy (`COULD NOT KEEP THE RECORD ON THIS PHONE.` / Retry / Log it anyway). Any Gate 0 in this chunk should be for AUD-015's Countdown→Timer hold.
- **Anchor conditions (1) and (2) survive unchanged** — the `loadTodayPick` fixture, and the composed denial-then-Start test, which is a real web path and the cheapest gate starting upstream of the producer (RF24).
- **Tripwire to write down beside the guards:** every argument here rests on `server.iosScheme` being unset. Setting it to `file`, or any move to `loadHTMLString`, re-opens the native throw.

## 5. Could NOT establish — named
- **No device observation.** Source + config only. A walk item would have no negative-case precondition (agent-briefing: "state the precondition that makes a NO possible"), because I found no setting to *set* — so it would be decoration, not evidence.
- **MDM / supervised-device payloads.** Found no restriction key mapping to `_WKStorageBlockingPolicy` for a third-party WebView, and could not enumerate the payload keys authoritatively. Recorded as "nothing found", not as "does not exist".
- **Screen Time web-content restrictions.** They appear to filter navigations rather than storage, but I found no primary Apple source saying so — treat any claim about them as unsourced.
- **Whether anything below `WKWebViewConfiguration`** (an entitlement, a system default) can move the `BlockThirdParty` default. I read the preference table and the embedder path only.
