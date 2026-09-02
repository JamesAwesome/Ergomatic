# Wave E PR1.75 — full option (g): the authenticated activation shape (design)

**Date:** 2026-09-02 · **Status:** DRAFT — settled for the antagonist pass and
James's approval BEFORE any implementation (the PR1.5 lesson: 16 review rounds,
almost all docs chasing a ruling that moved mid-flight; this time the design is
final first). **Wave:** E · **Risk class:** TRIAD — AUTH (the principal-binding
routes) + a STORED SHAPE (`surface` column, `UNIQUE(user_id)`, migration 0019).
**Parent:** `2026-08-31-concept2-logbook-design.md` §Architecture 1-3 (ruled
activation contract) and `2026-09-01-concept2-pr15-gate.md` §3(g)/§6 (the ruling
this PR discharges). Sequenced PR1.5 → **PR1.75** → PR2.

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
becomes atomic and one-per-user. When it merges, the ruling's hard precondition is
met on the code side; the flag flip still waits on Concept2's write approval and
PR2's surface.

## Research record (PRIMARY unless tagged)

- **RFC 8252 §7.1** (private-use schemes): apps *"MUST use a URI scheme based on a
  domain name under their control, expressed in reverse order"*; and the
  limitation — *"multiple apps can typically register the same scheme, which makes
  it indeterminate as to which app will receive the authorization code."*
  **§8.1:** *"Public native app clients MUST implement the Proof Key for Code
  Exchange (PKCE)."* **§8.12:** native apps *"MUST NOT use embedded user-agents to
  perform authorization requests."* **§8.9:** `state` RECOMMENDED against
  cross-app request forgery.
- **Apple, `ASWebAuthenticationSession`** (developer.apple.com, fetched via the
  docs JSON API): *"ASWebAuthenticationSession ensures that only the calling app's
  session receives the authentication callback, even when more than one app
  registers the same callback URL scheme."* On iOS *"the browser is a secure,
  embedded web view"* presented after *"a modal view telling them which domain the
  app is authenticating with."* `prefersEphemeralWebBrowserSession` — *"whether
  the session should ask the browser for a private authentication session."*
- **Capacitor App plugin:** `appUrlOpen` — *"Listen for url open events for the
  app. This handles both custom URL scheme links…"*; custom schemes require
  `CFBundleURLTypes` in Info.plist (the Google reversed-client-ID scheme already
  registered there is the in-repo precedent).
- **Capacitor custom native code** (capacitorjs.com/docs/ios/custom-code): a
  Swift `CAPPlugin, CAPBridgedPlugin` class with `@objc` methods taking
  `CAPPluginCall`, registered in a view-controller subclass's
  `capacitorDidLoad()` via `bridge?.registerPluginInstance(...)`, called from JS
  through `registerPlugin('<jsName>')`. No npm package needed.
- **`@capacitor-community/generic-oauth2`** (7.1.0, a `capacitor8` dist-tag
  exists, peer `@capacitor/core >=8.0.0`): its iOS presenter is
  `SafariURLHandler` (`GenericOAuth2Plugin.swift:289`) + an
  `SFSafariViewControllerDelegate` — i.e. SFSafariViewController plus a custom
  scheme, NOT `ASWebAuthenticationSession`. It supports code-only return
  (`responseType=code`, no `accessTokenEndpoint`), but it does not provide the
  calling-session guarantee. **Ruled out** for that reason (see Native return).
- **Concept2 (anchor ground, PR0 measured):** `client_secret` is required at the
  token endpoint (our server holds it — a CONFIDENTIAL client); **no PKCE is
  documented** (nothing found on the official page); `redirect_uri` must match the
  authorize call; their own token-endpoint example uses
  `myiphoneapp://oauth/callback`, so a private-use scheme is an accepted
  `redirect_uri` shape; `state` is echoed on the HTTPS callback (measured).
  Native-scheme echo: UNMEASURED (below, made non-load-bearing).
- **In-repo:** bundle id `haus.waffle.ergomatic` (`project.pbxproj:321`), prod
  origin `https://ergomatic.waffle.haus` (`docs/deploy.md:96`) — so the RFC 8252
  reverse-domain scheme is exactly `haus.waffle.ergomatic`. `api.ts:14-17`: native
  attaches ONLY an `Authorization: Bearer` header; web relies ONLY on the
  same-origin `erg_session` cookie (`SameSite=lax`, `cookies.ts:20-29`);
  `requireUser` (`middleware.ts:46-69`) resolves `bearer ?? cookie` and today
  discards which one matched.

**One INFERENCE, labelled, that the antagonist should attack:** because the
server is the confidential client and the app never redeems a code, an
authorization code intercepted by another app registering our scheme is
UNREDEEMABLE by that app — Concept2's token endpoint needs `client_secret` (server
only) and our `/exchange` needs the victim's Keychain bearer. Interception is
therefore a privacy leak of `(code, state)`, not a principal-binding break. RFC
8252's PKCE mandate targets PUBLIC clients that redeem their own codes; it does
not describe our topology. This is why the native return mechanism is chosen on
UX/robustness grounds below, with the calling-session guarantee as
defence-in-depth rather than the load-bearing control.

**Does the underlying system have the concept?** Yes for every piece: "which
credential authenticated this request" is a real property of every request
(bearer vs cookie); "callback delivered only to the calling app" is an iOS
primitive (`ASWebAuthenticationSession`); "one attempt per user" is a database
invariant (`UNIQUE`). Nothing is invented on the system's behalf.

## The design

### 1. Surface authority is SERVER-DERIVED — the client never says which surface it is

`requireUser` gains one line of memory: it sets `req.authVia = "bearer" | "cookie"`
according to which credential it actually resolved. **Both-present rule:** if a
request carries BOTH a bearer and an `erg_session` cookie, `requireUser` answers
`400 {error: "ambiguous_auth"}` and resolves nothing — a well-behaved client
never sends both (native fetches are cross-origin with default credentials, so
the WebView's cookie jar never rides; web never holds a bearer), so both-present
is a forged or broken request, refused loudly rather than silently preferring one.
Mint records `surface = authVia === "bearer" ? "native" : "web"`. No new request
field, no client-asserted surface, nothing for an attacker to choose.

### 2. Stored shape (TRIAD) — migration 0019

`concept2_auth_attempts` gains:

| column | type | notes |
| --- | --- | --- |
| `surface` | `pgEnum link_surface ('native','web')`, NOT NULL | which caller minted the attempt; enforced at BOTH completion routes |
| — | `UNIQUE (user_id)` | one live attempt per user, ENFORCED (the PR1.5 ruling's "best-effort/raceable" bound becomes real) |

Migration: attempts are disposable 15-minute rows, so 0019 first `DELETE`s every
existing attempt (never a backfill — any in-flight link at deploy time restarts at
mint, which is already the retry story), then adds the enum, the NOT NULL column,
and the unique index. Additive to every other table; nothing reads attempts but
these two routes.

**Mint becomes one atomic statement:** `INSERT … ON CONFLICT (user_id) DO UPDATE
SET nonce = excluded.nonce, surface = excluded.surface, weight_class =
excluded.weight_class, created_at = now()`. Two concurrent mints serialize on the
unique index — one inserts, the other updates — and exactly one attempt survives.
`deleteAttemptsFor(userId)` retires; `deleteExpiredAttempts` stays as the sweep.
`consumeAttempt` returns `surface` beside `userId`/`weightClass`.

**RF27 lifetime table — every session-scoped state this PR introduces:**

| state | minted at | cleared at | survives app relaunch? | survives teardown/kill mid-hop? |
| --- | --- | --- | --- | --- |
| attempt row (server, now with `surface`) | mint (upsert) | consume on EITHER route (single-use, before any identity check — a failed check burns it, retry restarts at mint); 15-min expiry sweep at the next mint; user delete cascade | yes (server-side); a relaunched app simply re-mints, the old row is replaced by the upsert | yes — an abandoned native consent leaves a row that expires or is replaced; nothing to clean client-side |
| `state` held by the native app for the hop (§4) | returned by mint alongside `authorizeUrl` | completion (success, cancel, or error) of the `startNativeLink` promise | NO — in-memory only; kill → gone → user re-mints | n/a: nothing persisted, nothing to reconcile |
| the `ASWebAuthenticationSession` itself | `startNativeLink` | its completion handler | no (OS tears it down with the app) | no |

Invariants, not mechanisms: one live attempt per user at any instant; an attempt
completes at most once, and only on the surface that minted it, and only for the
user that minted it; no client-side state outlives the promise that holds it.

### 3. Per-surface redirect, chosen at mint

| surface | `redirect_uri` | registered at Concept2 |
| --- | --- | --- |
| web | `https://<SITE_URL>/api/concept2/callback` (existing) | already (PR1) |
| native | `haus.waffle.ergomatic://oauth/callback` (RFC 8252 reverse-domain of `ergomatic.waffle.haus`) | **operator step:** register in the log-dev portal before the device walk, and in the live portal at cutover |

Mint returns `{ authorizeUrl, state }` — `state` explicitly, not only embedded in
the URL — so the native app holds the correlation value it will need at exchange
without depending on Concept2 echoing it (§4). `client.authorizeUrl` and
`client.exchangeCode` both take the surface's `redirect_uri` (Concept2 requires the
exchange's `redirect_uri` to match the authorize call's; today the client hardcodes
the web one).

### 4. Native completion — a local `ASWebAuthenticationSession` plugin, no scheme handler

**Chosen: option A.** A ~60-line Swift plugin in the app target (`WebAuthPlugin`,
`jsName "WebAuth"`, registered in a new `MyViewController.swift` per the vendor
recipe — the app currently has only `AppDelegate.swift`), exposing
`start({ url, callbackScheme, ephemeral? }) → { callbackUrl }` (rejects
`{ code: "cancelled" }` when the rower dismisses the system modal). JS mirror in
`src/native/webAuth.ts` via `registerPlugin("WebAuth")`, reached only through a
dynamic import in a new adapter `src/adapters/linkFlow.ts`:

- `startNativeLink({ authorizeUrl, state })`: opens the session with
  `callbackScheme: "haus.waffle.ergomatic"`; on completion parses `code` (and
  `state`, if present) from `callbackUrl`; **asserts callback `state === state`
  when the callback carries one** (defence-in-depth, mismatch → refuse + log);
  then `POST /api/concept2/exchange { code, state }` via `api()` (bearer attached)
  and returns the JSON. The app posts the `state` IT HOLDS from mint, so the
  server can locate the attempt whether or not Concept2 echoed `state` on the
  scheme redirect — **native echo is EXPECTED, will be MEASURED at the walk, and is
  no longer load-bearing** (the parent spec's "load-bearing" concern is resolved by
  construction, not by a fallback design). `ephemeral: false` by default — the
  rower may reuse a Safari Concept2 login; the parent spec's `/start`-cookie
  question is moot because this design has no `/start` route.
- Web arm of the same adapter: existing `openExternalUrl(authorizeUrl)` (plain
  navigation); completion is the authenticated callback (§5); the app learns the
  outcome via `useReturnToApp` (PR1.5).

Why A over B (private-use scheme + `@capacitor/app` `appUrlOpen`, the parent
spec's Branch-B sketch): (i) Apple's calling-session guarantee (quoted above)
closes the RFC 8252 shared-scheme ambiguity that PKCE would otherwise address and
Concept2 does not offer; (ii) the callback arrives in a promise, in-flow — no
listener registration, no readiness barrier, no re-render lifetime hazard, the
entire class PR1.5 spent four review rounds on; (iii) the OS presents the
"Ergomatic wants to use concept2.com to sign in" modal and dismisses the browser
itself. Costs, named: the repo's first in-tree Swift plugin (~60 lines, coverage
exempt like all `src/native/**`, device-verified only — RF19); a view-controller
subclass + storyboard class change; and one INFERENCE to verify on device —
`ASWebAuthenticationSession` captures its `callbackURLScheme` inside the session
without an Info.plist `CFBundleURLTypes` entry (Apple's API takes the scheme as a
parameter). **If the walk shows the redirect escaping to the system, the recorded
fallback is registering the scheme in Info.plist** (the Google precedent),
which changes nothing else in this design. Option B stays recorded as the
contingency: same server contract, `appUrlOpen` + `getLaunchUrl` instead of the
promise, with the listener-lifetime hazards PR1.5 documented.

### 5. Web completion — the existing callback, now authenticated

`GET /api/concept2/callback` gains `requireUser` (the cookie arm: a top-level GET
from concept2.com carries `erg_session` — `SameSite=lax` permits it; the response
stays HTML). Pinned order, extending PR1's matrix:

1. availability re-check (403, attempt consumed if `state` present) — unchanged;
2. `state`/`code` present (400) — unchanged;
3. **authenticated?** no session → `401` HTML *"Sign in to Ergomatic in this
   browser first, then start the link again."* (attempt NOT consumed — the rower
   hasn't spent it; it expires or is replaced);
4. `consumeAttempt(state)` (single-use, unchanged) → null → 400;
5. **`attempt.surface === "web"`** else `400` HTML (a native-minted nonce cannot
   complete here);
6. **`attempt.userId === req.user.id`** else `403` HTML *"This link was started
   from a different Ergomatic account."* — **and the token exchange is never
   called** (the deciding invariant; its mutation is the check moved after
   `exchangeCode`);
7. `exchangeCode(code, webRedirectUri)` → `fetchMe` → `upsertLink` → the Linked
   page (copy unchanged this PR; the identity line is PR2's owed Gate 0
   amendment).

### 6. Native completion — the new authenticated exchange

`POST /api/concept2/exchange { code, state }`, `requireUser` (bearer arm), JSON:

1. availability (403 `{error:"unavailable"}`); 2. body shape (400 field-named);
3. `consumeAttempt(state)` → null → `400 {error:"invalid_state"}`;
4. `attempt.surface === "native"` else `400 {error:"wrong_surface"}`;
5. `attempt.userId === req.user.id` else `403 {error:"principal_mismatch"}` —
   **exchange never called**; 6. `exchangeCode(code, nativeRedirectUri)` → fail →
   502 `{error:"c2_error"}`; `fetchMe` → fail → 502; `upsertLink` → `200 { linked:
   true, c2UserId, weightClass }`.

Steps 4-5 refuse BEFORE any wire call on both routes — that is the whole point of
the PR, and both routes are tested with a stub that asserts `exchangeCode` was
never invoked.

### 7. What does NOT change

Availability gating, the dark flag, `GET/DELETE /link`, the upload route, refresh
serialization, the probe card, PR1's callback page copy. Activation
(`C2_LINK_ENABLED=1` on a real cohort) still waits on Concept2 write approval and
PR2 — this PR makes the ruling's code-side precondition true; it does not flip
anything.

## Testing (TRIAD — every assertion gets a committed-then-probed mutation)

- **Unit, `requireUser`:** bearer → `authVia:"bearer"`; cookie → `"cookie"`; both →
  400 `ambiguous_auth`, no session resolved (mutation: prefer-bearer instead of
  refuse → red).
- **Unit, mint:** bearer request records `surface:"native"` + native
  `redirect_uri` in the returned URL; cookie request records `"web"` + web
  redirect; response carries `state`; a second mint for the same user replaces
  (store returns one row).
- **Store, real Postgres:** two CONCURRENT mints for one user → exactly one
  attempt row (the invariant the ruling called raceable — mutation: drop the
  unique index → the race test must show two rows or a violation; record which);
  `consumeAttempt` returns `surface`.
- **Unit, web callback:** unauthenticated → 401 and attempt NOT consumed; wrong
  user → 403 and **`exchangeCode` never called** (mutation: move the identity
  check after the exchange → red); native-minted nonce → 400; happy path exchanges
  with the WEB redirect (assert the argument).
- **Unit, native exchange:** wrong user → 403, `exchangeCode` never called;
  web-minted nonce → 400; happy path exchanges with the NATIVE redirect; `state`
  from the body locates the attempt even when the (stubbed) callback URL carries no
  `state` — the echo-independence test.
- **Adapter, `linkFlow`:** native arm passes `callbackScheme:
  "haus.waffle.ergomatic"`, parses `code`, refuses on `state` mismatch when the
  callback carries one, posts `{code, state}` with the mint's `state`; cancel
  rejection surfaces as a typed result, never a throw.
- **Integration (RF24, both surfaces):** real routes + real Postgres + real client
  with only `fetch` stubbed — web: `testSignin` cookie session, mint, callback
  with the SAME cookie → link row; callback with a DIFFERENT user's cookie → 403,
  no exchange, no link. Native: bearer mint, `POST /exchange` with the SAME bearer
  → link row; DIFFERENT bearer → 403, no exchange, no link. Cross-surface: a
  bearer-minted nonce presented to the callback → 400.
- **Device walk (James, log-dev, the ONE gate CI cannot reach — RF19):** with the
  native redirect registered at log-dev: from a probe entry (the PR1.5 probe card
  gains a "real link" button behind the same build flag), start the native flow →
  observe the OS modal names concept2.com → complete a real consent with the
  log-dev account → the session dismisses itself and the app receives the
  callback (not Safari) → `GET /link` shows `linked:true` for user 2211 → record
  whether the callback URL carried `state` (promotes EXPECTED to MEASURED either
  way) and whether the scheme needed an Info.plist entry. Also: cancel the modal →
  typed cancel, no attempt consumed server-side (it expires).
- `dist:grep`: the new native module folds like every other `src/native/**`
  (assert by build, both directions, per RF12).

## Exit criteria

1. Both completion routes refuse a foreign principal BEFORE any Concept2 call,
   proven by stubs asserting `exchangeCode` uncalled, with the moved-check mutation
   recorded red.
2. A nonce minted on one surface cannot complete on the other (both directions).
3. Concurrent mint leaves exactly one live attempt, against real Postgres.
4. The native flow completes end-to-end on a phone against log-dev with a real
   consent, the callback delivered to the app, and the `state`-echo fact
   RECORDED (measured, either way).
5. The record is reconciled BEFORE the PR opens: parent spec §Architecture 1-3
   and Stored Shapes say `surface` EXISTS (not "target"); ROADMAP's PR1.75 line
   and the C2 register row say the activation precondition is code-complete
   pending C2 write approval + PR2; the gate doc §6 gains a one-line "built in
   PR1.75" note; `schema.ts`/`stores/concept2.ts`/`routes/concept2.ts` comments
   state the CURRENT contract only.
6. Native redirect registered at log-dev (walk prerequisite); live-portal
   registration recorded as a cutover step beside write approval.

## Gates

Antagonist FULL pass on THIS document (TRIAD: AUTH + stored shape) → James
approves the design → plan → implementation (worktree
`Ergomatic-wt-c2pr175`, branch `wave-e-pr175-app-bind`) → per-task review →
device walk → PM final-PR gate (TRIAD) → James merges. **No implementation before
the design approval** — that ordering is this PR's first deliverable.

## Out of scope, named

PR2's surface and its Gate 0 identity-copy amendment; the `ALLOWED_EMAILS`
revocation model (a separate admission question); PKCE (Concept2 does not offer
it); Android; any change to the upload/refresh paths; flipping the flag.
