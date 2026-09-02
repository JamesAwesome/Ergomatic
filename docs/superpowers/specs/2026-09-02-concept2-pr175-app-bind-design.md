# Wave E PR1.75 — full option (g): the authenticated activation shape (design)

**Date:** 2026-09-02 · **Status:** REV 3 — rev 2 folded the antagonist's full TRIAD
pass (verdict REVISE); rev 3 replaces the Apple-platform lines rev 2 carried on the
antagonist's initial (later WITHDRAWN as unsourced) claims with facts fetched from
Apple's documentation this session, each tagged. Superseded claims are gone, not
annotated. Awaiting James's
approval BEFORE any implementation (the PR1.5 lesson). **Wave:** E · **Risk
class:** TRIAD — AUTH (the principal-binding routes) + a STORED SHAPE (`surface`
column, `UNIQUE(user_id)`, **migration 0020** — 0019 is Phase JR's on main).
**Parent:** `2026-08-31-concept2-logbook-design.md` §Architecture 1-3 and
`2026-09-01-concept2-pr15-gate.md` §3(g)/§6 (the ruling this PR discharges).
Sequenced PR1.5 → **PR1.75** → PR2.

## What and why

PR1.5 shipped the Concept2 link's plumbing dark, and James ruled the
account-injection residual acceptable ONLY while it stays dark: setting
`C2_LINK_ENABLED=1` for any real cohort requires that whoever completes a link is
verifiably the same Ergomatic account that started it. Today the nonce merely
correlates the browser's return to an attempt; nobody checks WHO completes it, so
an attacker who mints a link URL and hands it to a victim gets the victim's
Concept2 account attached to the attacker's Ergomatic user. This PR builds the
ruled fix — both completion paths authenticate the completing principal and refuse
to exchange the code unless `attempt.userId === req.user.id`; every attempt
records which surface minted it and can only complete on that surface; and mint
becomes atomic and one-per-user. When it merges the ruling's code-side
precondition is met; the flag flip still waits on Concept2's write approval and
PR2's surface.

## GO/NO-GO, settled first

The whole per-surface design needs Concept2 to accept TWO redirect URIs on one
application. Their docs say "your redirection endpoint", singular. **MEASURED
2026-09-02 (James, log-dev portal):** the Callback-endpoints page carries an
"Add Endpoint +" control and accepted `haus.waffle.ergomatic://oauth/callback`
beside the existing https callback — multiple endpoints per application are
supported. GO. (The https web callback must remain registered alongside it; the
operator confirms both rows exist before the walk.)

## Research record (PRIMARY unless tagged)

- **Concept2 OAuth reference** (`log.concept2.com/developers/documentation`):
  `POST /oauth/access_token` parameter table — **`client_secret` Required: Yes**
  for `authorization_code`; `redirect_uri` — *"This must match the value sent in
  the call to oauth/authorize."*; **`PKCE` / `code_challenge`: zero occurrences**
  in the whole document; **`state`: zero occurrences** — it is an undocumented
  pass-through. PR0 measured `state` echoed on the HTTPS callback; on a
  private-use-scheme redirect it is UNMEASURED. This design depends on neither
  (§6).
- **RFC 8252** §7.1: apps *"MUST use a URI scheme based on a domain name under
  their control, expressed in reverse order"*; *"multiple apps can typically
  register the same scheme, which makes it indeterminate as to which app will
  receive the authorization code."* §8.1: PKCE *"MUST"* for **public** native
  clients. §8.12: no embedded user-agents. §8.9: `state` RECOMMENDED.
- **Apple, `ASWebAuthenticationSession`** (developer.apple.com, all fetched this
  session via the documentation JSON API — PRIMARY): class available **iOS 12.0+**.
  *"ASWebAuthenticationSession ensures that only the calling app's session receives
  the authentication callback, even when more than one app registers the same
  callback URL scheme."* `presentationContextProvider` — **iOS 13.0+**, declared
  OPTIONAL in the type (`(any ASWebAuthenticationPresentationContextProviding)?`),
  but Apple's own walkthrough ("Authenticating a User Through a Web Service")
  instructs: *"After creating the session, set an appropriate context provider
  instance as the session's `presentationContextProvider` delegate"*, and
  `ASWebAuthenticationSessionError` carries `presentationContextNotProvided` —
  *"A context wasn't provided."* (iOS 12.0+) — so the plugin sets it. **Retention:**
  the same walkthrough — *"if you have a deployment target of iOS 13 or later, the
  session keeps a strong reference to itself until the authentication process
  completes"*; our floor is `IPHONEOS_DEPLOYMENT_TARGET = 15.0`
  (`project.pbxproj:239`), so self-retention applies and the plugin's own reference
  is belt-and-braces, not load-bearing. `prefersEphemeralWebBrowserSession` —
  **iOS 13.0+**: *"request that the browser doesn't share cookies or other browsing
  data between the authentication session and the user's normal browser session.
  Safari always respects the request. … `false` by default. Set this property
  before you call `start()`."* **Initializer:** `init(url:callbackURLScheme:
  completionHandler:)` is listed DEPRECATED in favour of
  `init(url:callback:completionHandler:)`, whose `ASWebAuthenticationSession.Callback`
  type (`.customScheme(_:)` / `.https(host:path:)`) is **iOS 17.4+** — above our
  15.0 floor, so the plugin uses the deprecated-but-available string initializer
  (a warning, not a removal), with an `#available(iOS 17.4, *)` branch onto
  `.customScheme` recorded as optional polish. `callbackURLScheme` is the BARE
  scheme — *"A scheme should not include special characters such as ':' or '/'"*
  (Apple Systems Engineer, developer forums thread 679251, SECONDARY) — i.e.
  `"haus.waffle.ergomatic"`, never `"haus.waffle.ergomatic://"`. **Info.plist:** the
  walkthrough never mentions `CFBundleURLTypes`; the same engineer states
  *"ASWebAuthenticationSession does not require any modification in your
  Info.plist"* while a community reply in the thread says the opposite — SECONDARY
  and contested, so the walk RECORDS which is true and registering the scheme is
  the no-cost fallback. **The OS consent sheet:** Apple's class overview says the
  system *"shows a modal view telling them which domain the app is authenticating
  with"*; NO Apple page fetched this session states that an ephemeral session
  suppresses it — that widely-reported behaviour is UNSOURCED here and is an
  observation the walk records, not a design input.
- **Cookies on a cross-site top-level GET** (rfc6265bis §5.8.3): a `Lax` cookie is
  sent when the request *"uses a 'safe' method"* and the target *"is a top-level
  traversable"*; §5.6.7.1 evaluates safeness per redirect hop. A C2 302 → our GET
  callback satisfies all conditions in Safari/iOS and Firefox. Brave: no primary
  source found; not asserted.
- **Capacitor, native networking — the mechanism the both-present rule rests on:**
  `capacitor.config.ts` enables `CapacitorHttp`, so on iOS `native-bridge.js`
  replaces `window.fetch`: POST/PUT/PATCH/DELETE go through the native
  `URLSession` (`CapacitorUrlRequest.swift`), GET/HEAD through a proxy also on
  `URLSession.shared` (`WebViewAssetHandler.swift`). `URLSession` reads and
  writes **`HTTPCookieStorage.shared`** with `httpShouldHandleCookies` true — the
  WebView's origin and `fetch`'s `credentials` mode are never consulted. Cookie
  attachment on native is governed by the shared native jar, and whether
  `erg_session` for the API origin can ever land in it is **UNMEASURED** (no
  supported producer found: `/api/auth/native` sets no cookie; signout's
  `clearSessionCookie()` is the only `Set-Cookie` a native client receives). The
  walk instruments it (§Testing).
- **Capacitor custom native code** (capacitorjs.com/docs/ios/custom-code): a
  Swift `CAPPlugin, CAPBridgedPlugin` with `@objc` methods, registered in a
  view-controller subclass's `capacitorDidLoad()` via
  `bridge?.registerPluginInstance(...)`; the storyboard's controller is
  `CAPBridgeViewController` (`Base.lproj/Main.storyboard:14`), so the subclass
  route applies. SPM project (no Podfile): the new Swift file also needs a
  `project.pbxproj` file reference — manual, conflict-prone, named as a cost.
- **Does an existing plugin already do this?** Two checked, both ruled out:
  `@capacitor-community/generic-oauth2` (7.1.0, `capacitor8` tag exists) presents
  through `SafariURLHandler` — SFSafariViewController + scheme, no
  calling-session guarantee (`GenericOAuth2Plugin.swift:289`).
  **`@capgo/capacitor-social-login@8.4.4` — ALREADY A DEPENDENCY** — exposes
  `provider:'oauth2'` on `ASWebAuthenticationSession` (its `OAuth2Provider.swift`
  sets `presentationContextProvider`, twice), but its `OAuth2LoginResponse` has
  no `code` field, `responseType:'code'` requires an in-app `accessTokenEndpoint`
  (the secret would live in the app), and `pkceEnabled` defaults on against a
  server with no PKCE. Unusable for a server-side confidential exchange. Build a
  local plugin.
- **In-repo:** bundle id `haus.waffle.ergomatic` (`project.pbxproj:321`), prod
  origin `https://ergomatic.waffle.haus` (`docs/deploy.md:96`) — the RFC 8252
  reverse-domain scheme is exactly `haus.waffle.ergomatic`. `api.ts:14-17`:
  native attaches an `Authorization: Bearer` header; web relies on the same-origin
  `erg_session` cookie (`SameSite=lax`, `cookies.ts:20-29`). `requireUser`
  (`middleware.ts:46-69`) resolves `bearer ?? cookie` and discards which matched;
  it is mounted over the WHOLE API (`routes/data.ts` `router.use("/api",
  requireUser)`) and on `/api/me` — any refusal added there is app-wide.

**Interception, three legs (PRIMARY):** a third app registering our scheme can
receive `(code, state)`. It cannot **redeem** the code — Concept2's exchange needs
`client_secret` (server only) and our `/exchange` needs the victim's bearer. It
CAN, if it also holds any Ergomatic session, **deny** the victim: presenting the
pair to either completion route with the wrong identity. §5/§6 therefore check
identity BEFORE consuming the attempt, so a wrong-principal presentation burns
nothing and the rightful user's attempt survives. Unredeemable is not harmless;
the design names the second leg and closes it.

**Does the underlying system have the concept?** Yes for every piece: "which
credential authenticated this request" is a property of every request;
"callback delivered only to the calling app" is an iOS primitive; "one attempt per
user" is a database invariant. Nothing is invented on the system's behalf.

## The design

### 1. Surface authority is SERVER-DERIVED; both-present is resolved, not refused

`requireUser` sets `req.authVia = "bearer" | "cookie"` — request-lifetime, never
persisted — according to which credential it resolved. A cookie whose value is
the empty string (what `clearSessionCookie()` leaves behind) counts as ABSENT.
**Both-present rule (the gate doc's own named resolution, §3(g) round 16):
bearer wins** — native is the only consumer that carries one, and an attacker who
supplies their own bearer gains nothing by also supplying a cookie. **Refusal is
reserved for genuine DISAGREEMENT:** both credentials present AND resolving to
DIFFERENT users → `400 {error:"ambiguous_auth"}`. Two valid sessions for two
people on one request is a broken or forged client, refused loudly; the
common "both present, same user" case cannot lock anyone out. Mint records
`surface = authVia === "bearer" ? "native" : "web"`; no client-asserted surface
exists for an attacker to choose. `neither present → 401` is unchanged and is in
the test list.

### 2. Stored shape (TRIAD) — migration 0020

`concept2_auth_attempts` gains:

| column | type | notes |
| --- | --- | --- |
| `surface` | `pgEnum link_surface ('native','web')`, **NOT NULL DEFAULT 'web'** | the default exists for ROLLBACK, not for writes: the PR1.5 image's `createAttempt` inserts no `surface`, and a plain `NOT NULL` would make every mint 500 after a rollback (proven against real Postgres at the antagonist pass). New code always writes it explicitly. |
| — | `UNIQUE (user_id)` | one live attempt per user, ENFORCED — the bound the PR1.5 ruling called "best-effort/raceable" becomes real |

Migration 0020 first `DELETE`s every existing attempt (15-minute disposable rows;
an in-flight link at deploy restarts at mint, already the retry story), then adds
the enum, the column, and the unique index. Additive to every other table.

**Mint is one atomic statement:** `INSERT … ON CONFLICT (user_id) DO UPDATE SET
nonce = excluded.nonce, surface = excluded.surface, weight_class =
excluded.weight_class, created_at = now()`. Updating the PK in `DO UPDATE` is
legal; two concurrent mints serialize on the unique index and exactly one row
survives (PROVEN on real Postgres; the old delete-then-insert yields two). A new
nonce colliding with another row's PK (32 random bytes — not worth designing
around) surfaces as a unique violation on `attempts_pkey`: the route retries
once with a fresh nonce, then 500s. `deleteAttemptsFor` retires;
`deleteExpiredAttempts` stays as the sweep; the store gains `peekAttempt(nonce)`
(read, no delete) beside `consumeAttempt`, and both return `surface`.

**RF27 lifetime table — every state this PR introduces, as invariants:**

| state | minted at | cleared at | survives relaunch? | survives kill mid-hop? |
| --- | --- | --- | --- | --- |
| attempt row (server; `surface`, one per user) | mint (upsert) | consume on EITHER route — only AFTER the identity/surface checks pass (§5/§6); 15-min sweep at the next mint; user cascade | yes (server); a relaunched app re-mints and the upsert replaces the row | yes — an abandoned consent leaves a row that expires or is replaced |
| `state` held by the native app for the hop | returned by mint beside `authorizeUrl` | completion of `startNativeLink` (success, cancel, decline, error) | NO — in-memory; kill → gone → re-mint | n/a: nothing persisted |
| **`linkInFlight` guard (client)** — at most ONE link attempt in flight per app instance | `startNativeLink` entry (refuses a second call with a typed `busy` result rather than minting again, which would replace the live attempt's nonce and orphan its session) | the same completion | NO | NO |
| the `ASWebAuthenticationSession` object — self-retained until completion on a ≥iOS 13 deployment target (Apple's walkthrough; ours is 15.0); the plugin ALSO holds a reference, belt-and-braces | `start()` | its completion handler | no (OS) | no |
| `req.authVia` | `requireUser` | end of request | n/a | n/a |

Invariants: one live attempt per user at any instant; an attempt is consumed at
most once, only on its own surface, only by its own user, and never by a wrong
principal's presentation; at most one link in flight per app instance; no
client-side state outlives the promise that holds it.

### 3. Per-surface redirect, chosen at mint

| surface | `redirect_uri` | registered at Concept2 |
| --- | --- | --- |
| web | `https://<SITE_URL>/api/concept2/callback` | since PR1 (keep it registered beside the new one) |
| native | `haus.waffle.ergomatic://oauth/callback` | log-dev: DONE 2026-09-02 (James); live portal: a cutover step beside write approval |

Mint returns `{ authorizeUrl, state }` — `state` explicit — so the native app holds
the correlation value it will present at exchange (§6) without depending on an
undocumented echo. `client.authorizeUrl` and `client.exchangeCode` both take the
surface's `redirect_uri` (Concept2 requires the exchange's to match the
authorize call's; today the client hardcodes the web one).

### 4. Native return — a local `ASWebAuthenticationSession` plugin

A Swift plugin in the app target (`WebAuthPlugin`, `jsName "WebAuth"`, registered
in a new `MyViewController.swift` subclass of `CAPBridgeViewController` per the
vendor recipe; storyboard class + `project.pbxproj` reference updated) exposing
`start({ url, callbackScheme, ephemeral }) → { callbackUrl }`, rejecting with a
typed `cancelled` when the rower dismisses. It **sets
`presentationContextProvider`** (the bridge's view controller's window as the
anchor), holds a reference to the session until completion (belt-and-braces — on our
iOS 15.0 floor the session self-retains per Apple's walkthrough), and passes
`ephemeral` through; it uses the string `callbackURLScheme` initializer because
the non-deprecated `Callback` type is iOS 17.4+. JS mirror `src/native/webAuth.ts` via `registerPlugin("WebAuth")`,
reached only by dynamic import from a new adapter `src/adapters/linkFlow.ts`:

- `startNativeLink({ authorizeUrl, state })`: refuses if a link is already in
  flight (`busy`); opens the session with `callbackScheme:
  "haus.waffle.ergomatic"`, **`ephemeral: true`** (rationale below); on
  completion parses the callback: `error=access_denied` (the rower declined at
  Concept2's screen — a success callback with no `code`) → typed `declined`, no
  exchange, the attempt is left to expire; otherwise `code` (and `state` if
  present — asserted equal to the held `state` when carried, refuse + log on
  mismatch; when C2 omits it this check is a no-op and is documented as
  defence-in-depth, not a control) → `POST /api/concept2/exchange { code, state }`
  through `api()` (bearer attached) → typed result.
- **`ephemeral: true` by default.** Non-ephemeral shares Safari's persistent
  cookies, so on a shared phone the next link can silently complete against
  whoever last logged into Concept2 in Safari with no visible login — the mirror
  image of the gap this PR closes on the Ergomatic side. Ephemeral forces the C2
  login screen every time, so the rower always sees which Concept2 account they
  are linking; linking is a once-per-account event, so the re-login cost is
  small. The cost commonly reported (UNSOURCED in Apple's docs — the walk records it):
  an ephemeral session may skip the OS "wants to use concept2.com" consent
  sheet. PR2's identity
  line (`c2UserId` is already served by `GET /link`) is the second half of this
  mitigation. James may overrule to non-ephemeral at approval.
- Web arm of the same adapter: `openExternalUrl(authorizeUrl)` — a full-page
  navigation that unloads the SPA; the outcome is learned on the fresh mount
  after the Linked page, NOT via `useReturnToApp` (rev 1 got this wrong).

**What this retires from PR1.5 (RF5/RF23):** with the link flow on
`ASWebAuthenticationSession`, `Browser.open` + `onNativeBrowserFinished` and
`useReturnToApp`'s `browserFinished` arm have no consumer. This PR REMOVES that
native arm and its tests (`useReturnToApp` becomes the web-visibility hook it
still is for tab-return; its native `resume` arm stays for the web-in-WebView
edge only if a consumer exists — otherwise removed too, decided at plan time by
grep), and the probe card's counter is repointed at the new flow. **The
`@capacitor/browser` dependency STAYS** — PR2's "View on Concept2" link-out is
its consumer. Two mechanisms for one return must not survive on one surface.

Why this over a private-use scheme + `appUrlOpen` (the parent's Branch-B sketch):
(i) Apple's calling-session guarantee closes the RFC 8252 shared-scheme
ambiguity that PKCE would otherwise cover and Concept2 does not offer — for the
DENIAL leg, since the redemption leg is already closed by the confidential
client; (ii) the callback arrives in a promise, in-flow — no listener
registration, no readiness barrier, none of the lifetime hazards PR1.5 spent four
rounds on; (iii) the OS dismisses the browser itself. Costs: the repo's first
in-tree Swift (~80 lines with the context provider and retention), a
view-controller subclass + storyboard + pbxproj edits, device-only verification
(RF19). Branch B stays recorded as the contingency with the same server contract.

### 5. Web completion — the existing callback, authenticated by a route-local resolver

NOT the `requireUser` middleware (it answers bare JSON 401 and would run before
the pinned order). The router gets `resolveCookieSession(req)` → user or null,
and the callback keeps its HTML responses and this order:

1. availability re-check (403 HTML; attempt consumed only here, flag-off path);
2. `state`/`code` present, else 400 HTML;
3. **no cookie session → 401 HTML** — attempt NOT consumed;
4. **`peekAttempt(state)`** → null (unknown/expired) → 400 HTML;
5. **`attempt.surface === "web"`**, else 400 HTML — attempt NOT consumed;
6. **`attempt.userId === user.id`**, else 403 HTML — attempt NOT consumed (the
   rightful user's attempt survives a wrong-principal presentation — the DoS
   leg), and **the token exchange is never called**;
7. `consumeAttempt(state)` (atomic single-use; null here means a concurrent
   consume won — 400 HTML) and re-verify surface/user on the consumed row;
8. `exchangeCode(code, webRedirectUri)` → `fetchMe` → `upsertLink` → Linked
   page.

The 400/400/403 ladder tells a state-holder only what an interceptor already
knows, never an account — acceptable because `state` is a 256-bit secret. This
step also closes the callback's own CSRF shape (an ambient-cookie GET that
`originCheck` does not guard): an attacker minting on their own account and luring
the victim's browser here dies at step 6.

### 6. Native completion — the new authenticated exchange

`POST /api/concept2/exchange { code, state }`, `requireUser` (bearer; JSON):

1. availability (403); 2. body shape (400 field-named);
3. `peekAttempt(state)` → null → `400 {error:"invalid_state"}`;
4. `attempt.surface === "native"` else `400 {error:"wrong_surface"}` — not
   consumed;
5. `attempt.userId === req.user.id` else `403 {error:"principal_mismatch"}` —
   not consumed, **exchange never called**;
6. `consumeAttempt(state)` → null (concurrent consume) → 400; re-verify;
7. `exchangeCode(code, nativeRedirectUri)` → fail → 502 `{error:"c2_error"}`;
   `fetchMe` → fail → 502; `upsertLink` → `200 { linked: true, c2UserId,
   weightClass }`.

Steps 4-5 refuse BEFORE any wire call and BEFORE consuming, on both routes.

### 7. Rower-visible copy introduced (Gate 0 — rendered for James at approval)

Two HTML pages the web callback can now show, and they are user-visible copy, so
they are presented rendered, not described:

- 401: **"Sign in to Ergomatic in this browser first, then start the Concept2
  link again from the app."**
- 403: **"This Concept2 link was started from a different Ergomatic account.
  Sign in as that account in this browser, or start a new link from the account
  you're using."**

Both use the existing callback page styling; no other copy changes. The probe
card gains a "real link" button behind its existing build flag (dev-only, not
rower-visible in any release build).

### 8. What does NOT change

Availability gating, the dark flag, `GET/DELETE /link`, the upload route, refresh
serialization, PR1's Linked page copy. Activation still waits on Concept2 write
approval + PR2.

## Testing (TRIAD — every assertion gets a committed-then-probed mutation)

- **`requireUser`:** bearer → `authVia:"bearer"`; cookie → `"cookie"`; empty-value
  cookie → absent; both, SAME user → bearer wins, `authVia:"bearer"`; both,
  DIFFERENT users → 400 `ambiguous_auth`, no session resolved (mutation: resolve
  bearer regardless → red); neither → 401.
- **Mint:** bearer → `surface:"native"` + native `redirect_uri` in the URL; cookie
  → `"web"` + web redirect; response carries `state`; the PK-collision retry.
- **Store, real Postgres:** two CONCURRENT mints for one user → exactly one row.
  **The biting mutation is on the STATEMENT, not the index:** replace the upsert
  with delete + plain insert → two rows (index dropped) or a unique violation
  (index kept) — record which; dropping the index alone only breaks `ON
  CONFLICT`'s parse, proving nothing about the invariant. `peekAttempt` does not
  delete; `consumeAttempt` returns `surface`.
- **Web callback (route-local resolver):** no session → 401 HTML and attempt NOT
  consumed (`peek` afterwards still finds it); wrong user → 403 HTML, attempt NOT
  consumed, **`exchangeCode` never called** (mutation: move the identity check
  after `exchangeCode` → red; mutation: consume before the check → the
  attempt-survives assertion red); native-minted nonce → 400, not consumed;
  happy path exchanges with the WEB redirect (argument asserted); a concurrent
  consume between peek and consume → 400 without exchange.
- **Native exchange:** wrong user → 403, not consumed, exchange never called;
  web-minted nonce → 400; happy path with the NATIVE redirect; body `state`
  locates the attempt when the (stubbed) callback carried no `state` — the
  echo-independence test.
- **Adapter `linkFlow`:** `busy` on a second in-flight call; `declined` on
  `error=access_denied` with no exchange; `cancelled` typed; `state` mismatch
  refused when carried; posts `{code, state}` with the mint's `state`;
  `callbackScheme` and `ephemeral:true` asserted.
- **Integration (RF24, both surfaces):** real routes + Postgres + client, only
  `fetch` stubbed. Web (testSignin cookie): same-user callback → link row;
  different user's cookie → 403, no exchange, no link, attempt still present.
  Native (bearer): same bearer → link row; different bearer → 403, no exchange,
  attempt still present. Cross-surface both directions → 400. The "neither"
  case → 401.
- **Device walk (James, log-dev — the gates CI cannot reach, RF19):** (a) with
  both redirects registered, start the native flow from the probe's real-link
  button → the session presents (ephemeral: a fresh C2 login screen; note whether
  any OS modal appears) → complete a real log-dev consent → the session dismisses
  and the app receives the callback → `GET /link` shows `linked:true` → RECORD:
  did the callback carry `state`? did the scheme need an Info.plist entry (i.e.
  did anything escape the session)? (b) cancel the modal → typed `cancelled`, the
  attempt untouched server-side. (c) decline at Concept2's screen → typed
  `declined`. (d) **the credential instrument for §1's UNMEASURED premise:** the
  local dev server logs, for every request during the walk, `authVia` and whether
  a cookie AND a bearer were both present; the walk report states the observed
  values for every native request — this is the only layer that can see the real
  native header set.
- **Bundle claim, stated correctly:** the native module ships as a lazy chunk in
  `dist/client` and is never LOADED on web (`adapters/externalBrowser.ts:4-23`
  already records this retraction); `dist:grep` checks dev-only needles and says
  nothing about native chunks. No "folds out" claim is made.

## Exit criteria

1. Both completion routes refuse a foreign principal BEFORE consuming the
   attempt and BEFORE any Concept2 call, proven by stubs asserting `exchangeCode`
   uncalled and the attempt surviving, with both mutations recorded red.
2. A nonce minted on one surface cannot complete on the other, both directions,
   without consuming it.
3. Concurrent mint leaves exactly one live attempt against real Postgres, gated by
   the statement-level mutation.
4. The native flow completes end-to-end on a phone against log-dev with a real
   consent, the callback delivered to the app; the `state`-echo and Info.plist
   facts RECORDED; the walk's per-request `authVia`/both-present readings
   RECORDED.
5. The record is reconciled BEFORE the PR opens: parent spec §Architecture 1-3
   and Stored Shapes say `surface` EXISTS; ROADMAP's PR1.75 line ("a transaction
   around mint" → "one atomic upsert", equivalent) and the C2 register row say the
   activation precondition is code-complete pending write approval + PR2; the
   gate doc §6 gains a one-line "built in PR1.75" note; all live comments state
   the CURRENT contract; PR1.5's retired native return arm is gone, not
   commented out.
6. Both redirect URIs registered at log-dev (walk prerequisite — DONE for native,
   confirm web); live-portal registration recorded as a cutover step.
7. The two callback pages (§7) approved rendered by James at this design's gate.

## Gates

Antagonist full pass: DONE 2026-09-02 (REVISE → this rev 2). → **James approves
the design + the two rendered pages** → plan → implementation (worktree
`Ergomatic-wt-c2pr175`, branch `wave-e-pr175-app-bind`) → per-task review →
device walk → PM final-PR gate (TRIAD) → James merges. No implementation before
the approval.

## Out of scope, named

PR2's surface and its Gate 0 identity-copy amendment; the `ALLOWED_EMAILS`
revocation model; PKCE (Concept2 does not offer it); Android; the upload/refresh
paths; flipping the flag.
