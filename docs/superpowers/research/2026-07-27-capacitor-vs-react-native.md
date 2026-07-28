# Capacitor vs React Native for Ergomatic on iOS — Research Report

Date: 2026-07-27 (research executed 2026-07-27/28)
Scope: taking the existing Ergomatic web app (React 19 + Vite, mobile-first, hand-built CSS design system, Express API same-origin at https://ergomatic.waffle.haus, Google OAuth server-side code flow with httpOnly SameSite=Lax cookie sessions) native on iOS. Solo developer; TestFlight first (household users), maybe App Store later; planned PM5 BLE transport; someday HealthKit workout writing.

Method: deep-research workflow — parallel web-search agents per question, claims verified against current (2025-2026) primary sources (Apple's live guidelines pages, official Capacitor/Expo/RN docs, GitHub repos/npm, implementer threads). Companion doc: `2026-07-27-pm5-ble-research.md` (PM5 GATT details, Web Bluetooth platform status).

---

## Comparison matrix

| Dimension (weight for this app) | Capacitor | React Native (Expo) |
|---|---|---|
| Reuse of existing/planned web UI (highest) | Near-total: wraps the built Vite bundle in WKWebView; CSS design system ships as-is | Full UI rewrite: no 2026 path renders existing DOM+CSS natively (React Strict DOM requires its own JS styling API; Expo DOM components = webviews again) |
| Auth complexity | Medium-high: system auth session + serverAuthCode handoff works, but the httpOnly-cookie session does not carry into `capacitor://localhost` cleanly — needs CapacitorHttp/Cookies or a token exchange endpoint | Medium: same external-browser pattern, but native apps conventionally switch to bearer tokens anyway; first-party Google/Apple libraries mature |
| BLE fit (PM5 notify-subscribe) | @capacitor-community/bluetooth-le — API deliberately mirrors Web Bluetooth (see §3) | react-native-ble-plx — mature, different API shape (see §3) |
| HealthKit someday | Plugin situation workable; custom Swift plugin is a small lift (see §4) | @kingstinct/react-native-healthkit strongest single library (see §4) |
| Solo maintenance | Same repo, extra build target; ~annual major, `npx cap migrate` automates most; you own macOS builds | Second app codebase; Expo SDK cadence; EAS free tier gives 15 hosted iOS builds/mo |
| App Store optionality | Nonzero 4.2 "repackaged website" risk, mitigated (not eliminated) by native BLE/HealthKit/auth; zero risk while internal-TestFlight-only | Effectively zero framework-driven 4.2 risk |

Verdict for this app: **Capacitor** — see §8.

---

## 1. Code reuse economics

**Capacitor wraps the existing app.** Capacitor 8 (current major, announced 2025-12-09) embeds the built web assets in WKWebView served from `capacitor://localhost`; it is designed to live inside an existing web repo — a config file, an `ios/` folder, and `npx cap sync` after the existing Vite build. Web deploy is unaffected; one codebase. [Cap8], [CapConfig]

**No 2026 React Native path renders existing React DOM/CSS.** Verified current state of every candidate:

- **Expo DOM components** (`'use dom'`): each marked component renders as its own SPA inside a webview — no children props, isolated instances, async-only function props. Expo frames it explicitly as an incremental-migration tool and recommends universal primitives for real apps. Using it wholesale is just a webview app with more machinery than Capacitor. [ExpoDOM]
- **React Strict DOM** (Meta): direction is right (web-first code → native), but styling is a *required* built-in JS API (`css.create()`, StyleX-style) — **arbitrary hand-written CSS does not port**, and the project self-describes as work-in-progress with incomplete native capabilities. [RSD]
- **React Native for Web**: confirmed the reverse direction (RN → DOM). Not a path for existing DOM code.

So RN means rewriting the entire UI in RN primitives and reimplementing the design system in RN styles. Only non-UI logic (hooks, state, utils, transport interfaces) would be shared.

**Expo's role 2026:** the officially recommended default for new RN apps (reactnative.dev names Expo as the production-grade framework). RN 0.86 is current (June 2026); New Architecture only since 0.82; React 19 supported since RN 0.80 (19.1) / 0.83 (19.2). EAS free tier: 15 iOS builds/month, hosted macOS, store submission included. [RNEnv], [RNBlog], [EASPricing]

---

## 2. Auth — the sharp edge

### 2.1 Google OAuth in a Capacitor app

**The webview block is real and current.** Since 2023-07-24, Google's authorization endpoint returns `403 disallowed_useragent` from embedded webviews; WKWebView is named explicitly. Policy unchanged as of 2026. Auth must happen in a system browser context. [GoogWV]

**Blessed 2026 pattern:** open the flow in **ASWebAuthenticationSession** (Apple's own recommendation for OAuth; SFSafariViewController via `@capacitor/browser` also passes Google's check but doesn't return a callback natively and shares no cookies with Safari on iOS 11+). Two maintained plugin options:

- **`@capgo/capacitor-social-login`** (active, Capacitor 8, successor to the archived codetrix google-auth): Google via ASWebAuthenticationSession, and — key for our stack — an **`offline` mode that returns only a `serverAuthCode`** for exchange on the backend. It also implements native Sign in with Apple. This is the closest fit to "server-side code flow with openid-client." [Capgo]
- **`capacitor-community/generic-oauth2`**: maintained (2025 badge, Capacitor 5/6/7, Xcode 16+), code flow + PKCE only (deliberately no client-secret flows on device). [GenOAuth2]

Callback: custom URL scheme or Universal Link caught with `@capacitor/app` `appUrlOpen`. Google requires an **iOS-type client ID** for the native leg (custom-scheme redirect); the existing web client ID stays for the web app. The server exchanges the `serverAuthCode` using the iOS client (no secret) — openid-client handles this fine.

**The cookie problem — the genuinely sharp part.** The WKWebView origin is fixed at `capacitor://localhost`: `server.iosScheme` cannot be `http`/`https` (WKWebView already handles them), and `server.url` pointing at the production site is officially "not intended for use in production." [CapConfig] Consequences for an httpOnly SameSite=Lax cookie set by ergomatic.waffle.haus:

- Webview `fetch` to the API is cross-origin: needs CORS with credentials, and WKWebView/ITP treats the session cookie as third-party — storage/sending is unreliable, with documented breakage threads (cookies fine on iOS 16.3, gone on 16.6; cookies lost after suspension; TestFlight-only failures). [CapCookieIssues], [NextAuthCap]
- **Working patterns, in order of evidence:**
  1. **Token exchange endpoint (recommended):** native auth session → `serverAuthCode` → app POSTs it to `/auth/native` → server returns a short-lived one-time token or the session ID as a bearer credential; native build sends `Authorization` header instead of relying on the cookie. Smallest change: keep cookie sessions on web, add a bearer path (same session store) for the app. This is the pattern the hybrid-auth literature converges on ("dual storage," native secure storage for the credential). [HybridAuth]
  2. **CapacitorHttp + CapacitorCookies:** patch `fetch` to the native URLSession layer so Set-Cookie lands in the native cookie jar as first-party (unaffected by ITP). Works for many apps, but iOS-version-sensitive regressions are on record, and `WKAppBoundDomains` (max 10) may be needed. Viable but flakier than (1). [CapCookies], [CapCookieIssues]
- **Remote-URL mode** (WKWebView pointed at https://ergomatic.waffle.haus, cookies "just work" first-party): explicitly discouraged by Capacitor for production and maximizes App Store 4.2 exposure (§5). Fine as a private-experiment shortcut; not the shippable architecture. [CapConfig]

### 2.2 React Native pattern

Same Google policy applies; the standard stack is **expo-auth-session** (current standard; expo-app-auth deprecated 2020, react-native-app-auth now legacy-adjacent) or the provider library `@react-native-google-signin/google-signin`, over ASWebAuthenticationSession, with `makeRedirectUri()` + app scheme. Cookie sessions are simply not the native convention: Expo's own authentication guide has the server mint a token/JWT after verifying the provider credential — i.e., RN forces the same bearer-token server change that pattern 1 above recommends for Capacitor. Auth work is roughly equal across the two frameworks; neither preserves the cookie session untouched. [ExpoAuth]

### 2.3 Sign in with Apple (guideline 4.8)

Current 4.8 text (fetched live): apps using a third-party/social login (Google Sign-In named) for the **primary account** must also offer a login service that limits data to name+email, lets users hide their email, and doesn't collect app interactions for ads without consent. Sign in with Apple is the canonical qualifying service. Exemptions (own-account-system-only, enterprise/education, government eID, third-party-service clients) do not cover Ergomatic if Google is the sign-in. [Guidelines]

- **TestFlight:** internal testing (≤100 App Store Connect team users) has **no Beta App Review** — 4.8 is not enforced there; builds appear on upload and expire after 90 days. External testing sends the first build per version through Beta App Review against the guidelines (third-party reports of 4.8 hits at beta review exist; Apple doesn't publish the enforced subset — flagged). So: household-internal TestFlight needs no Apple sign-in; an App Store (or external-TestFlight) build offering Google sign-in effectively does. [TFDocs]
- **Server-side with openid-client:** workable — openid-client's own author published the canonical Sign in with Apple implementation with openid-client. [PanvaGist] The quirks to plan for: client secret is a **self-minted ES256 JWT** from the .p8 key (not a static string); requesting name/email scopes forces **`response_mode=form_post`**, and the cross-site POST callback means a **SameSite=Lax state/nonce cookie won't be sent** — the interim state cookie must be `SameSite=None; Secure` (or state carried statelessly); **no userinfo endpoint**; name and email arrive **only on first authorization** (name in a POSTed `user` JSON body, not in the id_token) and must be captured then. [AppleOIDC]
- **Native-sheet plugins:** Capacitor — `@capgo/capacitor-social-login` implements Apple natively (active, Cap 8); `@capacitor-community/apple-sign-in` also exists. RN — `expo-apple-authentication` (first-party Expo module) and `@invertase/react-native-apple-authentication` are mature. Both ecosystems fine. [Capgo]

---

## 3. BLE for the PM5

(Verified against npm registry + GitHub APIs, 2026-07-28.)

**`@capacitor-community/bluetooth-le` — healthy and current.** Latest 8.2.0 (2026-05-25), tracks Capacitor 8, steady 2026 cadence, 358 stars, active repo. Its README states the Web Bluetooth API "is taken as a guideline for what features to implement," and it supports **web, Android, and iOS from one API** — on web it runs on real Web Bluetooth. `startNotifications(deviceId, service, characteristic, cb)` delivers DataView payloads on all platforms — a direct fit for PM5 notify-subscribe (0x0031/0x0032/0x0035; see companion PM5 doc). [CCBle]

**`react-native-ble-plx` — maintained, slower cadence, new-arch caveats.** Latest 3.5.1 (2026-02-18, crash-guard fixes); ~1 release/yr recently; 3.4k stars; `monitorCharacteristicForService` is the notify API. New Architecture works via interop but with a crash-bug trail (issues #1277, #1278); no explicit full-new-arch release note found (flagged). One real advantage: CoreBluetooth **state restoration** (`restoreStateIdentifier`), which the Capacitor plugin lacks. [BlePlx]

**iOS background behavior — the decisive difference.**
- **Capacitor:** WKWebView **suspends JS in the background** (~5 min after backgrounding the event loop stops; iOS then suspends the app). The plugin maintainer confirms background notifications only work while the app is "in the background *but still running*"; with `bluetooth-central` iOS wakes a suspended app ~10 s per BLE event, but that wake reaches native code, not the suspended webview JS. **PM5 notifications cannot be reliably processed in Capacitor JS while backgrounded/locked** without dropping to custom Swift. [CCBleBg]
- **React Native:** Hermes JS is not a webview and keeps executing while the process lives in background; with `bluetooth-central` + ble-plx state restoration the story is materially better, though iOS still eventually suspends any process.
- **Practical answer: run the workout foregrounded with the screen kept awake** — the pattern rowing apps actually use (Concept2's ErgData doing exactly this is plausible but *unverified*; no official Concept2 statement found). Keep-awake plugins are healthy on both sides: `@capacitor-community/keep-awake` 8.0.1 (2026-04-16), `expo-keep-awake` 57.0.1 (2026-07-15). [KeepAwake]

**Verdict:** foreground + keep-awake makes both stacks equally workable for 60-min PM5 sessions. If background/locked-screen capture ever becomes a hard requirement, that's RN's column — or a custom Swift capture layer in Capacitor.

---

## 4. HealthKit workout writing

Need: write `HKWorkout` (activity type rowing) + distance + calories + heart-rate samples.

**Capacitor plugins (verified 2026-07-28):**

| Plugin | Latest | State | Writes workouts? |
|---|---|---|---|
| `@perfood/capacitor-healthkit` | 1.3.2 (2025-02), Capacitor **4** peer dep | Stale; "PRs no longer accepted" | No (read-focused) |
| `capacitor-health` (mley) | 8.1.2 (2026-05), Cap 8 | Active | No (query-only) |
| `@capgo/capacitor-health` | 8.10.0 (2026-07-24), Cap 8 | Very active | Writes samples; workouts **read-only** per README |
| `@flomentumsolutions/capacitor-health-extended` | 0.8.3 (2026-02) | Marginal (5-star 0.x fork) | **Yes** (saveWorkout + HR/distance/calorie writes) |

**No well-established Capacitor plugin writes rowing workouts today.** The realistic Capacitor path is a **small custom Swift plugin**: Capacitor's iOS plugin docs are good (CAPPlugin subclass, local in-app plugins supported), and a `saveRowingWorkout(start, end, distance, kcal, hrSamples[])` using the non-deprecated `HKWorkoutBuilder` path is ~100-200 lines of Swift + a TS wrapper — a 1-2 day task that also avoids the deprecated `HKWorkout.init` every off-the-shelf option still uses. [CapPluginDocs]

**React Native:** `react-native-health` (agencyenterprise) is effectively dormant — last release 2024-10-15, 157 open issues, feature work paused; it does have `saveWorkout` with a `Rowing` constant but HR samples save standalone. **`@kingstinct/react-native-healthkit` is the standout**: 14.0.2 (2026-06-05), commits within the last day, "75+ workout activity types — Save ✅". Caveats: requires react-native-nitro-modules/New Architecture (RN ≥ 0.79, React ≥ 19), and it too uses `HKWorkout.init` (deprecated since iOS 17, still functional); workout-associated HR samples not verified to code level. [RNHealth], [Kingstinct]

**Entitlements/TestFlight:** HealthKit is a standard self-service capability (works with automatic signing; no special Apple approval). Must-haves: HealthKit capability + `NSHealthShareUsageDescription`/`NSHealthUpdateUsageDescription` purpose strings (missing = crash at authorization + review rejection). Review friction is guideline 5.1.3 (no health data in iCloud, no ads/data-mining) — low-friction for a self-logging rowing app. Internal TestFlight: no review at all. [HKSetup]

---

## 5. App Store risk (4.2) and TestFlight rules

**4.2 current text:** "features, content, and UI that elevate it beyond a repackaged website… not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store." 4.2.2 targets apps that are primarily web clippings/link collections. 4.2.6 (template mills) doesn't apply to a hand-built app. [Guidelines]

**Webview-app rejection reality 2024-2026:** rejections cluster around thin single-page mirrors of a mobile site with no native integration. Native BLE hardware integration + HealthKit + native auth session + offline-capable bundled assets are exactly the "beyond a website" signals — they substantially strengthen the case but do not guarantee passage; at least one Capacitor app with custom Swift plugins still reported a 4.2 rejection, and 4.2 is subjectively enforced. Notably, Ionic's old official "minimum functionality" guidance pages now 404. Ergomatic's mitigations if it ever goes to the store: bundled assets (no `server.url`), PM5 connectivity as a headline feature, HealthKit, native auth, app-like navigation/haptics/splash. [42Reports]

**Remote content rules:** 2.5.2 (self-contained, no downloaded feature-changing code — system-WebKit JS has a license-agreement carve-out, which is why Capacitor live-update services exist); 4.7 turns out to govern mini-apps/emulators, not wrapper apps. A remote-URL shell is a 4.2 problem first. [Guidelines]

**TestFlight 2026 (household case):** internal testing — ≤100 testers who are App Store Connect team users, **no review**, available on upload, 90-day build expiry (any new upload restarts the clock), $99/yr membership. Viable indefinitely for a household. External — first build per version passes Beta App Review against the guidelines. [TFDocs]

**RN comparison:** no evidence of any RN-as-framework 4.2 rejection (absence-of-evidence, consistent with RN rendering real native views).

---

## 6. Solo-dev maintenance burden

- **Capacitor:** same repo; `ios/` folder + `npx cap sync` bolted onto the existing Vite build. Majors ~annual (v6 Apr 2024 → v7 Jan 2025 → v8 Dec 2025), timed to OS releases with ≥6-month upgrade windows; `npx cap migrate` automates most of an upgrade — realistically an afternoon a year, dominated by toolchain floors (Cap 8: Xcode 26+, iOS 15 target, Node 22). You own a Mac/Xcode build (locally or a macOS CI runner at ~10x Linux pricing; Appflow optional). [Cap8], [CapUpdate], [CadenceBlog]
- **React Native/Expo:** a second application codebase (separate components/styles/navigation/dependency tree; shares only non-UI logic). RN ships ~5 releases/yr; staying on Expo SDK versions absorbs most upgrade pain (bare-RN upgrades via upgrade-helper remain the ecosystem's notorious tax). New Architecture transition is over (0.82+ NA-only; 0.84 removed legacy; current 0.86) — a new app never touches it. EAS Build free tier (15 iOS builds/mo, hosted macOS, submission) is the genuine ops advantage: no local Xcode babysitting. [RNBlog], [EASPricing]

Net: Capacitor minimizes *code* maintenance (one UI); RN/Expo minimizes *build infrastructure* (cloud builds) at the cost of a whole second UI to keep in feature parity. For a solo dev whose product is the web app, the second codebase dominates the equation.

---

## 7. Web Bluetooth inside the wrapper

**WKWebView: dead end, unchanged.** WebKit's formal standards position on Web Bluetooth remains **"oppose"** (privacy/fingerprinting; WebKit/standards-positions #570); the Web Bluetooth CG implementation-status page still lists Safari/WebKit as not supporting it. **No experimental flag exists that a Capacitor app could enable** — third-party iOS "Web Bluetooth browsers" (Bluefy, WebBLE) ship their own private bridges. [WebKitWB]

**Polyfills:** historical ones (BleBrowser, urish/web-bluetooth-polyfill) are abandoned; `thegecko/webbluetooth` is maintained but is a **Node.js** implementation, irrelevant in WKWebView. One maintained shim exists: **`@capgo/capacitor-bluetooth-low-energy`** (8.2.0, 2026-06-25) ships `shimWebBluetooth()` installing `navigator.bluetooth` over its native bridge — credible but young, single-vendor, and `requestDevice()` auto-resolves the first scan match (no chooser UI). Not yet the production-safe bet. [CapgoBle]

**Realistic pattern — and it mostly dissolves the problem:** `@capacitor-community/bluetooth-le` *already is* the dual implementation — same API on web (backed by real Web Bluetooth) and iOS (native CoreBluetooth). Either write the PM5 transport once against that plugin, or keep raw `navigator.bluetooth` on web behind Ergomatic's planned transport interface and add a ~50-line adapter for the plugin on iOS (`requestDevice`→`requestDevice`/`requestLEScan`, GATT connect→`connect`, `startNotifications` callbacks and DataView payloads map nearly 1:1). [CCBle]

---

## 8. Recommendation

Scoring 1-5 per dimension, weighted for this app:

| Dimension | Weight | Capacitor | RN (Expo) | Notes |
|---|---|---|---|---|
| Reuse of existing/planned web UI | 5 | **5** | 1 | Total reuse vs total rewrite; no 2026 tech bridges DOM+CSS→RN |
| Auth complexity | 4 | 3 | **4** | Both need system-browser auth + a bearer/token handoff server change; Capacitor adds the `capacitor://localhost` cookie-jar wrinkle |
| BLE fit (PM5) | 4 | **4** | 4 | Equal foregrounded+keep-awake; plugin API mirrors Web Bluetooth (Capacitor) vs state restoration/background edge (RN) |
| HealthKit someday | 2 | 3 | **4** | RN has kingstinct off-the-shelf; Capacitor needs a 1-2 day custom Swift plugin (which is also the cleaner HKWorkoutBuilder path) |
| Solo maintenance | 5 | **5** | 2 | One repo + annual `cap migrate` afternoon vs an entire second UI codebase kept in feature parity |
| App Store optionality | 2 | 3 | **5** | Capacitor: nonzero, subjective 4.2 risk (mitigated by BLE/HealthKit/native auth; zero while internal-TestFlight-only) |
| **Weighted total** (max 110) | | **91** | 63 | |

**Recommendation: Capacitor.** For a solo developer whose product *is* the web app, the two highest-weighted dimensions (UI reuse, single-codebase maintenance) are landslides, and nothing on the RN side of the ledger — better background BLE, an off-the-shelf HealthKit library, cleaner store optics — survives contact with "rewrite the entire UI and design system, then maintain both forever." The planned transport-interface abstraction slots directly onto `@capacitor-community/bluetooth-le`, whose API was designed to mirror Web Bluetooth.

**What to build (the Capacitor plan):**
1. Bundle the Vite build as local assets (never ship `server.url`).
2. Auth: `@capgo/capacitor-social-login` (Google, offline mode) → `serverAuthCode` → new `POST /auth/native` exchange endpoint in Express (openid-client, iOS client ID) → return a bearer credential backed by the same session store; native build sends `Authorization` instead of the cookie. Keep cookie sessions untouched on web.
3. BLE: implement the PM5 transport's iOS side on `@capacitor-community/bluetooth-le`; run workouts foreground with `@capacitor-community/keep-awake`.
4. Distribute via **internal TestFlight** (no review, no Sign in with Apple needed, 90-day re-upload rhythm).
5. If/when going App Store or external TestFlight: add Sign in with Apple (capgo plugin native sheet + openid-client server flow with ES256-minted client secret, `SameSite=None` interim state cookie for form_post, capture name/email on first auth), and write the 1-2 day custom Swift HealthKit plugin — both also strengthen the 4.2 case.

**Sharpest risks of the Capacitor path:**
- **WKWebView JS suspension**: lock the screen or background the app mid-workout and PM5 data stops being processed. Keep-awake + foreground UX is the mitigation (industry-standard for erg apps), but it is a real product constraint, and true background capture would require custom Swift.
- **Cookie/ITP flakiness** if the token-handoff pattern is skipped in favor of leaning on webview cookies — don't; use the bearer handoff.
- **4.2 subjectivity** if the app ever leaves TestFlight — mitigated, never eliminated.

**When to revisit RN:** only if background/locked-screen BLE capture becomes non-negotiable, or the app outgrows its web-first identity.

---

## Sources

Primary sources fetched/verified 2026-07-27/28 unless noted.

**Apple (live pages)**
- [Guidelines] App Review Guidelines (4.2, 4.2.2, 4.2.6, 4.7, 4.8, 2.5.2, 5.1.3) — https://developer.apple.com/app-store/review/guidelines/
- [TFDocs] TestFlight overview / internal testers (review rules, 100/10,000 testers, 90-day expiry) — https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/ and .../add-internal-testers/
- [HKSetup] Setting up HealthKit (capability, purpose strings) — https://developer.apple.com/documentation/healthkit/setting-up-healthkit

**Capacitor / Ionic**
- [CapConfig] Capacitor config reference (iosScheme can't be https; server.url "not intended for use in production") — https://capacitorjs.com/docs/config
- [Cap8] Announcing Capacitor 8 (2025-12-09) — https://ionic.io/blog/announcing-capacitor-8
- [CapUpdate] Capacitor 8 upgrade guide (`npx cap migrate`, Xcode 26+) — https://capacitorjs.com/docs/updating/8-0
- [CadenceBlog] Capacitor release cadence (annual, ≥6-month windows, 2023-11) — https://ionic.io/blog/introducing-a-new-capacitor-release-cadence
- [CapCookies] CapacitorCookies API (document.cookie patch, WKAppBoundDomains) — https://capacitorjs.com/docs/apis/cookies
- [CapPluginDocs] Custom iOS plugin guide — https://capacitorjs.com/docs/plugins/ios

**Auth**
- [GoogWV] Google: OAuth blocked in embedded webviews (disallowed_useragent, effective 2023-07-24, WKWebView named) — https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
- [Capgo] @capgo/capacitor-social-login (ASWebAuthenticationSession, offline serverAuthCode mode, native Apple sign-in, Cap 8) — https://github.com/Cap-go/capacitor-social-login
- [GenOAuth2] capacitor-community/generic-oauth2 (maintained 2025, code+PKCE only) — https://github.com/capacitor-community/generic-oauth2
- [NextAuthCap] Cookie-session-into-Capacitor pain thread (device/TestFlight-only failures) — https://github.com/ionic-team/capacitor/discussions/7085
- [CapCookieIssues] iOS cookie regressions — https://github.com/ionic-team/capacitor/issues/6813, https://github.com/ionic-team/capacitor/issues/1373, https://forum.ionicframework.com/t/capacitor-ios-cookie-authentication-capacitor-http/237748
- [HybridAuth] Hybrid-app auth patterns (2025-05-29, dual-storage/token handoff) — https://dev.to/itamartati/understanding-authentication-in-hybrid-mobile-apps-cookies-webviews-and-common-pitfalls-3m8
- [PanvaGist] Sign In with Apple via openid-client, by openid-client's author — https://gist.github.com/panva/f02ebf9e4c98014836db6efea5919b80
- [AppleOIDC] Apple OIDC quirks (ES256 JWT secret, form_post + SameSite, no userinfo, first-auth-only name/email) — https://www.scottbrady.io/openid-connect/implementing-sign-in-with-apple-in-aspnet-core, https://ktaka-ccmp.github.io/oauth2-passkey/guides/apple.html, https://avohq.io/blog/sign-in-with-apple-rails
- [ExpoAuth] Expo authentication guide + AuthSession (token pattern for backends) — https://docs.expo.dev/develop/authentication/, https://docs.expo.dev/versions/latest/sdk/auth-session/

**BLE**
- [CCBle] @capacitor-community/bluetooth-le (8.2.0 2026-05-25, Web-Bluetooth-modeled API, web+iOS+Android) — https://github.com/capacitor-community/bluetooth-le
- [CCBleBg] Background-suspension maintainer statements — https://github.com/capacitor-community/bluetooth-le/discussions/514, https://github.com/capacitor-community/bluetooth-le/discussions/679
- [BlePlx] react-native-ble-plx (3.5.1 2026-02-18; new-arch issues #1277/#1278; state restoration) — https://github.com/dotintent/react-native-ble-plx
- [KeepAwake] @capacitor-community/keep-awake (8.0.1 2026-04), expo-keep-awake (57.0.1 2026-07) — https://github.com/capacitor-community/keep-awake, npm registry
- ErgData support pages (screen-wake behavior undocumented — flagged unverified) — https://www.concept2.com/support/ergdata

**HealthKit**
- [Kingstinct] @kingstinct/react-native-healthkit (14.0.2 2026-06-05, workout save, Nitro/new-arch, HKWorkout.init) — https://github.com/kingstinct/react-native-healthkit
- [RNHealth] react-native-health (dormant since 2024-10) — https://github.com/agencyenterprise/react-native-health
- Capacitor health plugins — https://github.com/mley/capacitor-health, https://github.com/Cap-go/capacitor-health, https://github.com/perfood/capacitor-healthkit, https://github.com/Flomentum-Solutions/capacitor-health-extended

**App Store risk / code reuse**
- [42Reports] Webview 4.2 rejection analyses/threads — https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper, https://developer.apple.com/forums/thread/806726, https://developer.apple.com/forums/thread/812889, https://forum.ionicframework.com/t/apple-4-2-minimum-functionality/189688
- [ExpoDOM] Expo DOM components ('use dom' = webview per component, migration tool) — https://docs.expo.dev/guides/dom-components/
- [RSD] React Strict DOM (required css.create() styling; WIP) — https://github.com/facebook/react-strict-dom
- [RNEnv] RN environment setup (Expo as recommended framework) — https://reactnative.dev/docs/environment-setup
- [RNBlog] RN release history (0.80 React 19.1/legacy-arch freeze; 0.82 NA-only; 0.86 current 2026-06-11) — https://reactnative.dev/blog
- [EASPricing] EAS free tier (15 iOS builds/mo) — https://expo.dev/pricing
- TestFlight 4.8-at-beta-review report (third-party, flagged) — https://techconcepts.org/blog/testflight-guide

**Known gaps / unverified claims** (carried from verification pass): ErgData screen-wake behavior; ble-plx full new-arch support; whether Beta App Review enforces 4.8 (third-party reports only); kingstinct workout-associated HR samples; Ionic's official store-acceptance guidance pages now 404.
