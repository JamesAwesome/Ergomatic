# Wave E PR1.75 — full option (g): the authenticated activation shape (design)

**Date:** 2026-09-02 · **Status:** REV 5.1 — plan-writer observations reconciled (see §Plan reconciliation). REV 5 — antagonist pass 2 (attacker / concurrency / SDK-header lenses, verdict REVISE) folded: code injection named OPEN and bounded, conditional-DELETE consume, native single-flight, capability-gated native mint, walk host + instrument, three decisions flagged for James (§Decisions). REV 4 — the PM shape pass (2026-09-02, verdict SPLIT) is folded: §0 PR shape, §1 narrowed, exit criteria 5/6/8 rewritten. REV 3 — rev 2 folded the antagonist's full TRIAD
pass (verdict REVISE); rev 3 replaces the Apple-platform lines rev 2 carried on the
antagonist's initial (later WITHDRAWN as unsourced) claims with facts fetched from
Apple's documentation this session, each tagged. Superseded claims are gone, not
annotated. **APPROVED — James, 2026-09-02** ("Designs approved": the Gate 0 render —
rendered pages, the shared styled callback template, and the design calls listed
there: identity-before-consume, bearer-wins, ephemeral:true, atomic upsert +
migration 0020). Two hardening passes (attacker-lens antagonist, PM shape) were
in flight at approval; any material change they force is presented to James as a
delta before implementation, per the PR1.5 lesson. **Wave:** E · **Risk
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

**Desk pre-check — a gate BEFORE implementation (antagonist pass 2, F3):** a
portal accepting a redirect row is not the authorization server honouring it.
Unauthenticated `GET /oauth/authorize` with the native redirect returns `302 →
/login` — and so does a bogus unregistered scheme (measured 2026-09-02, curl),
so validation happens after login and the check needs a logged-in browser:
open the authorize URL for `haus.waffle.ergomatic://oauth/callback` → PASS = the
consent screen renders; open the same URL with an unregistered scheme → must
error (the red control). Result recorded here: **PENDING James.** A FAIL is
NO-GO for the whole per-surface design before any Swift is written.

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
  completionHandler:)` is marked `API_DEPRECATED(..., ios(12.0,
  API_TO_BE_DEPRECATED), ...)` in the SDK header — Apple's "unspecified future
  release" sentinel; it compiles today and no removal version exists (an earlier
  rev's "deprecated at iOS 27" was an invented number). Deprecated in favour of
  `init(url:callback:completionHandler:)`, whose `ASWebAuthenticationSession.Callback`
  type (`.customScheme(_:)` / `.https(host:path:)`) is **iOS 17.4+** — above our
  15.0 floor, so the plugin uses the deprecated-but-available string initializer
  (a warning, not a removal), with an `#available(iOS 17.4, *)` branch onto
  `.customScheme` recorded as optional polish. `callbackURLScheme` is the BARE
  scheme — *"A scheme should not include special characters such as ':' or '/'"*
  (Apple Systems Engineer, developer forums thread 679251, SECONDARY) — i.e.
  `"haus.waffle.ergomatic"`, never `"haus.waffle.ergomatic://"`. **Info.plist — PRIMARY, from the SDK header
  (`iPhoneOS26.5.sdk/…/ASWebAuthenticationSession.h`):** *"For the app to receive
  the callback URL, it needs to either register the custom URL scheme in its
  Info.plist, or set the scheme to callbackURLScheme argument in the
  initializer."* Not required, therefore; 1.75b registers it anyway (§0) and the
  walk records nothing about it beyond confirming delivery. **The OS consent sheet:** Apple's class overview says the
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

**Interception, three legs (corrected at antagonist pass 2):** a holder of a
leaked `(code, state)` (1) cannot redeem it *into the victim's link* — that needs
the victim's bearer or cookie; (2) cannot *deny* the victim — §5/§6 refuse a wrong
principal without consuming; (3) **CAN redeem it into their OWN link**: presenting
the victim's code with their own attempt's `state` and their own bearer passes
every check in §6 and attaches the victim's Concept2 grant (`results:write`) to
the attacker's Ergomatic account. This is **RFC 9700 §4.5 authorization code
injection** (*"An attacker who has gained access to an authorization code … can
try to redeem the authorization code for an access token"*), and it is **OPEN
and structurally unclosable at this authorization server**: §2.1.1 mandates
PKCE (*"Public clients MUST use PKCE … For confidential clients … RECOMMENDED"*)
or an OIDC `nonce`; Concept2 documents neither (PKCE: zero occurrences; not an
OIDC provider) and §4.5.3 lists no third countermeasure. `state` is a §4.7 CSRF
control, client-supplied at `/exchange`, and is not a control here.
**Bounded by:** the attacker must hold a live, unredeemed code issued for the
victim's Concept2 account against the SAME surface's `redirect_uri` —
cross-surface injection is blocked by Concept2's own exact-match rule (*"This
must match the value sent in the call to oauth/authorize"*, RFC 9700 §4.5.2:
*"exact redirect URI matching would detect such attacks"*). On native,
same-surface capture is closed against a third app by `ASWebAuthenticationSession`'s
calling-app guarantee and against the shared-phone path by `ephemeral: true`
(§4 — a CONTROL, not a preference). On web the code travels only over TLS to our
own callback. Whether Concept2 codes are single-use is UNMEASURED (RFC 9700
§4.5.2 is conditional: *"…and was one-time use only"*) and is not asserted.
Optional detective control (§Decisions D1): refuse a link whose `c2UserId`
already belongs to a different Ergomatic user.
**Shared-browser fixation (RFC 9700 §4.7 family, PROVEN unclosable by identity):**
attacker signs into Ergomatic on a shared browser, mints, leaves the authorize URL
up; the victim logs into Concept2 and consents; the callback carries the
attacker's session, `attempt.userId === user.id` passes CORRECTLY, and the
victim's Concept2 links to the attacker's Ergomatic account. Identical on native
with the attacker's bearer. The only mitigation is making the pairing visible at
the moment of success — the Linked page names BOTH identities (§7, §Decisions
D2).

**Does the underlying system have the concept?** Yes for every piece: "which
credential authenticated this request" is a property of every request;
"callback delivered only to the calling app" is an iOS primitive; "one attempt per
user" is a database invariant. Nothing is invented on the system's behalf.

## The design

### 0. PR shape — TWO PRs, in order (PM ruling 2026-09-02; CLAUDE.md's split test)

`ROADMAP.md:997-998` already split PR1 from PR1.5 "so one reviewer never holds a
token-broker migration and an iOS deep-link contract in one pass"; this design
bundled five risk models (migration, two-route identity ladder, an app-wide
middleware change, the repo's first in-tree Swift, retirement of a three-day-old
mechanism). CLAUDE.md's grouping tie-break — a stored-shape change plus an
unrelated redesign in one pass → split — decides it.

- **PR1.75a — server (TRIAD: stored shape + auth).** Migration 0020 + schema;
  `stores/concept2.ts` (upsert `createAttempt`, `peekAttempt`, `surface` in both
  returns, `deleteAttemptsFor` retired); `auth/middleware.ts` (`authVia`,
  empty-cookie-is-absent, the disagreement log); `routes/concept2.ts` (surface at
  mint, per-surface `redirect_uri`, `state` in the mint response, the callback
  ladder with its route-local cookie resolver, `POST /exchange`, the route-level
  disagreement refusal, the six-page template); `concept2/client.ts`
  (`redirect_uri` as an argument, both call sites); `testing/fakes.ts`; tests;
  (ROADMAP's PR1.5 checkbox: already ticked at rev 4). **Gate: zero files under `app/src/` or
  `app/ios/`.** Antagonist: SKIP, spoken — the full TRIAD pass covered every
  server invariant here and the split adds none (§1's narrowing is a narrowing).
  PM: FULL final-PR gate. Walk: none (CI-provable).
  **Intentional interval, stated in the PR body:** after 1.75a, mint returns
  `haus.waffle.ergomatic://oauth/callback` to any bearer caller and nothing on
  the device can receive it yet. Harmless (flag off; the only native consumer,
  `Concept2LinkProbe`, never calls mint) and deliberate.
- **PR1.75b — native + client (not TRIAD).** `WebAuthPlugin.swift`,
  `MyViewController.swift`, `Main.storyboard`, `project.pbxproj`, `Info.plist`
  (**register the scheme regardless** — one entry, zero cost, deletes a
  walk-burning failure mode; the walk still RECORDS whether it was needed);
  `src/native/webAuth.ts`; `src/adapters/linkFlow.ts`; the PR1.5 return-arm
  retirement **as a CENSUS** (every consumer of `onBrowserFinished`,
  `useReturnToApp`, `openExternalUrl` listed with its fate, plus one sentence on
  why PR2's link-out needs no return signal — if that sentence cannot be written
  the arm stays and the two-mechanism note is recorded); the probe's real-link
  button. **Gate: zero files under `app/server/`, zero migrations.** Antagonist:
  DELTA pass on the plan (a new mechanism + a retirement). PM: scoped ~10-min
  gate (census empty, walk record complete, fold count). **The walk runs BEFORE
  the PR opens** — two of its outputs (Info.plist necessity, `state` echo) can
  change 1.75b's own code.
- **Order is a hard dependency:** 1.75b posts to `/exchange` and needs the native
  `redirect_uri` + explicit `state`, all minted by 1.75a. Every intermediate
  state ships flag-off. **Release: none** for either.
- **Activation gate discharge needs BOTH:** 1.75a satisfies every clause of the
  gate doc §6 precondition literally and not its intent (no native return
  exists). Neither PR body says "code-complete"; the ROADMAP PR1.75 row gets a
  per-clause disposition of `ROADMAP.md:999-1020` at 1.75b's merge.

### 1. Surface authority is SERVER-DERIVED; both-present is resolved, not refused

`requireUser` sets `req.authVia = "bearer" | "cookie"` — request-lifetime, never
persisted — according to which credential it resolved. A cookie whose value is
the empty string — however produced; `clearSessionCookie()` sets `maxAge: 0` so a
compliant browser DELETES rather than empties it (`cookies.ts:32-42`), and the
shared native jar is UNMEASURED — counts as ABSENT. Already true for auth today
(`getCookie` → `""` → falsy → 401, `middleware.ts:50`); load-bearing only for the
NEW `authVia` derivation, which must not be written `cookie !== undefined`.
**Both-present rule (the gate doc's own named resolution, §3(g) round 16):
bearer wins** — native is the only consumer that carries one, and an attacker who
supplies their own bearer gains nothing by also supplying a cookie. **Disagreement (both
present AND resolving to DIFFERENT users) is handled at TWO scopes, because
`requireUser` is mounted app-wide (`router.use("/api", requireUser)`,
`routes/data.ts:826`) and deploys to prod web on merge, while whether the native
jar can ever carry `erg_session` is UNMEASURED until PR1.75b's walk (PM ruling,
2026-09-02 — the evidence must not arrive one PR after the refusal):**
(a) app-wide, `requireUser` resolves bearer-wins and emits ONE structured log
line `{event:"auth_disagreement", bearerUser, cookieUser, path}` — an instrument,
never a refusal; (b) on `/api/concept2/*` (dark behind the flag) the same
condition is a hard `400 {error:"ambiguous_auth"}`, checked in the route module
against `req.authVia` plus a second cookie resolution. Promoting (b) app-wide is
a three-line follow-up AFTER the walk reads the log. The common "both present,
same user" case cannot lock anyone out at either scope. Mint records
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
**Rollback, second half (pass 2):** the surviving `UNIQUE(user_id)` turns the
rollback image's concurrent double-mint (delete-then-insert, `stores/concept2.ts:159-165`)
into a unique violation (500) rather than two rows. Accepted — a rare self-race,
strictly smaller blast radius than the unbounded attempts the index prevents.
**D1 APPROVED: 0020 also adds `UNIQUE (c2_user_id)` on `concept2_links`** — the cheap moment (`schema.ts:483` has no index today).

**Mint is one atomic statement:** `INSERT … ON CONFLICT (user_id) DO UPDATE SET
nonce = excluded.nonce, surface = excluded.surface, weight_class =
excluded.weight_class, created_at = now()`. Updating the PK in `DO UPDATE` is
legal; two concurrent mints serialize on the unique index and exactly one row
survives (PROVEN on real Postgres; the old delete-then-insert yields two). A new
nonce colliding with another row's PK (32 random bytes — not worth designing
around) surfaces as a unique violation on `attempts_pkey`: the route retries
once with a fresh nonce, then 500s. `deleteAttemptsFor` retires;
`deleteExpiredAttempts` stays as the sweep; the store gains `peekAttempt(nonce)`
(read, no delete, NO freshness predicate — advisory only, it decides which page
or error a presenter gets) and `consumeAttemptFor(nonce, userId, surface)`:
**one conditional statement** `DELETE FROM concept2_auth_attempts WHERE nonce=$1
AND user_id=$2 AND surface=$3 RETURNING weight_class, created_at >= now() -
make_interval(secs => $4) AS fresh`. The identity/surface predicate lives IN the
statement, so a wrong principal or wrong surface consumes nothing by
construction, not by step order; freshness rides as a computed column exactly as
`consumeAttempt` documents today (a right-principal expired row is still deleted;
a wrong-principal one is left for the sweep). **There is no post-consume
re-verify:** a writer census (mint upsert always rewrites `nonce`; consume and
sweep delete; the user cascade deletes) shows that for a FIXED nonce
`(user_id, surface)` are immutable for the row's lifetime, so a re-check could
never fail — a green gate that cannot go red (RF21), deleted at design time.

**RF27 lifetime table — every state this PR introduces, as invariants:**

| state | minted at | cleared at | survives relaunch? | survives kill mid-hop? |
| --- | --- | --- | --- | --- |
| attempt row (server; `surface`, one per user) | mint (upsert) | consume on EITHER route — only AFTER the identity/surface checks pass (§5/§6); 15-min sweep at the next mint; user cascade | yes (server); a relaunched app re-mints and the upsert replaces the row | yes — an abandoned consent leaves a row that expires or is replaced |
| `state` held by the native app for the hop | returned by mint beside `authorizeUrl` | completion of `startNativeLink` (success, cancel, decline, error) | NO — in-memory; kill → gone → re-mint | n/a: nothing persisted |
| **the in-flight link claim** — INVARIANT: at most one link session per APP PROCESS, enforced NATIVELY. The plugin holds `activeSession` + `activeCall`; a second `start()` rejects `busy` in Swift, so the guard survives a WebView reload that destroys every JS value (a reload mid-session would otherwise drop the code into a call with no receiver and let a second sheet start). `linkInFlight` in `linkFlow.ts` is a UX convenience, never the authority | `start()` in Swift | the session's completion; AND plugin `load()` on a fresh document over a live session rejects the pending call `abandoned` and cancels the session, so no orphaned sheet outlives its receiver | NO | NO |
| the `ASWebAuthenticationSession` object AND its `presentationContextProvider` (a `weak` property per the SDK header — the plugin instance is the provider, retained by the bridge) — the session self-retains until completion on a ≥iOS 13 target (ours 15.0); the plugin also holds it | `start()` (never reused: *"start can only be called once for an ASWebAuthenticationSession instance"*) | its completion handler | no (OS) | no |
| `req.authVia` | `requireUser` | end of request | n/a | n/a |

Invariants: one live attempt per user at any instant; an attempt is consumed at
most once, only on its own surface, only by its own user, and never by a wrong
principal's presentation; at most one link session per app PROCESS (native authority); no
client-side state outlives the promise that holds it. **Web has no in-flight
guard** — a second tab or a second tap re-mints, the first tab's callback lands
on the Expired page (§7); named residual, the copy covers it.

### 3. Per-surface redirect, chosen at mint

| surface | `redirect_uri` | registered at Concept2 |
| --- | --- | --- |
| web | `https://<SITE_URL>/api/concept2/callback` | since PR1 (keep it registered beside the new one) |
| native | `haus.waffle.ergomatic://oauth/callback` | log-dev: DONE 2026-09-02 (James); live portal: a cutover step beside write approval |

**A bearer mint must DECLARE it can receive the native redirect:** the request
body carries `linkClient: "webauth-1"`; a bearer mint without it returns `409
{error:"update_required"}` and issues nothing. The client states a capability
(only ever narrows; deterministic where a build-number inference is a
heuristic), and it makes the flag flip safe by construction against an installed
build predating the `WebAuth` plugin: no such build can ever be handed a
`haus.waffle.ergomatic://` URL. Cookie mints carry no declaration. The app copy
for the 409 ("Update Ergomatic to link your Concept2 account.") is PR2's card
and rides its owed Gate 0 amendment. Mint returns `{ authorizeUrl, state }` — `state` explicit — so the native app holds
the correlation value it will present at exchange (§6) without depending on an
undocumented echo. `client.authorizeUrl` and `client.exchangeCode` both take the
surface's `redirect_uri` (Concept2 requires the exchange's to match the
authorize call's; today the client hardcodes the web one).

### 4. Native return — a local `ASWebAuthenticationSession` plugin

A Swift plugin in the app target (`WebAuthPlugin`, `jsName "WebAuth"`, registered
in a new `MyViewController.swift` subclass of `CAPBridgeViewController` per the
vendor recipe; storyboard class + `project.pbxproj` reference updated) exposing
`start({ url, callbackScheme, ephemeral }) → { callbackUrl }`, rejecting with
TYPED outcomes from the SDK header's full error enum: `cancelled` (code 1 —
the same code for the page's Cancel and for dismissing the OS consent alert, so
the two are indistinguishable by design), `noContext` (2), `contextInvalid` (3 —
*"validate that the UIWindow is in a foreground scene"*; real on iPad,
`TARGETED_DEVICE_FAMILY = "1,2"`), `noWindow` (the plugin REJECTS when
`bridge?.viewController?.view.window` is nil rather than synthesising a bare
`ASPresentationAnchor()`, which is exactly what produces error 3 opaquely), and
`busy` (§2 lifetime table). `canStart` (iOS 13.4) is checked before `start()`.
It **sets `presentationContextProvider`** (the plugin instance, returning the
bridge's window), holds a reference to the session until completion (belt-and-braces — on our
iOS 15.0 floor the session self-retains per Apple's walkthrough), and passes
`ephemeral` through; it uses the string `callbackURLScheme` initializer because
the non-deprecated `Callback` type is iOS 17.4+. JS mirror `src/native/webAuth.ts` via `registerPlugin("WebAuth")`,
reached only by dynamic import from a new adapter `src/adapters/linkFlow.ts`:

- `startNativeLink({ authorizeUrl, state })`: refuses if a link is already in
  flight (`busy`); opens the session with `callbackScheme:
  "haus.waffle.ergomatic"`, **`ephemeral: true`** (rationale below); on
  completion parses the callback: `error=access_denied` (the rower declined at
  Concept2's screen — a success callback with no `code`) → typed `declined`, no
  exchange, the attempt is left to expire; neither `code` nor a recognised
  `error` → typed `malformed`, never treated as cancel; a non-2xx from
  `/exchange` whose body is not `{error}` JSON (an old server image's Express
  404 HTML during a rolling deploy) → typed `server_error`; otherwise `code` (and `state` if
  present — asserted equal to the held `state` when carried, refuse + log on
  mismatch; when C2 omits it this check is a no-op and is documented as
  defence-in-depth, not a control) → `POST /api/concept2/exchange { code, state }`
  through `api()` (bearer attached) → typed result.
- **`ephemeral: true` — a CONTROL against code injection (research
  §Interception leg 3), not a UX preference.** Non-ephemeral shares Safari's persistent
  cookies, so on a shared phone the next link can silently complete against
  whoever last logged into Concept2 in Safari with no visible login — the mirror
  image of the gap this PR closes on the Ergomatic side. Ephemeral forces the C2
  login screen every time, so the rower always sees which Concept2 account they
  are linking; linking is a once-per-account event, so the re-login cost is
  small. The cost, PRIMARY from the SDK header: *"If the user has already logged into
  the web service in Safari or other apps via ASWebAuthenticationSession, it is
  possible to share the existing login information. An alert will be presented
  to get the user's consent for sharing"*; ephemeral sessions *"do not share
  cookies or other browsing data with a user's normal browser session"* — so no
  alert, and a fresh Concept2 login every link. James approved ephemeral named
  (Gate 0, 2026-09-02); **overruling it re-opens the shared-phone leg of
  RFC 9700 §4.5 and that residual would be named in the ruling.** PR2's identity
  line (`c2UserId` is already served by `GET /link`) is the app-side half of the
  disclosure; the web Linked page's both-identities line (§7) is the other.
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

1. availability re-check (403 HTML) — **consumes NOTHING** (PR1's flag-off
   consume, `routes/concept2.ts:193-199`, is deleted: it was the route's last
   unauthenticated write, an attempt-destruction primitive that bought nothing);
2. `state`/`code` present, else 400 HTML;
3. **no cookie session → 401 HTML** — attempt NOT consumed;
4. **`peekAttempt(state)`** (advisory) → null (unknown) → 400 HTML;
5. **`attempt.surface === "web"`**, else 400 HTML — attempt NOT consumed;
6. **`attempt.userId === user.id`**, else 403 HTML — attempt NOT consumed (the
   rightful user's attempt survives a wrong-principal presentation — the DoS
   leg), and **the token exchange is never called**;
7. `consumeAttemptFor(state, user.id, "web")` — the conditional DELETE (§2) is
   the AUTHORITY; null means a concurrent completion or a re-mint won → 400
   HTML (Expired); `fresh === false` → 400 HTML (Expired);
8. `exchangeCode(code, webRedirectUri)` → `fetchMe` → `upsertLink` (D1: a
   `c2_user_id` already linked to a DIFFERENT user → 409 page, tokens
   discarded) → Linked page naming both identities (§7).

Every response sets `Referrer-Policy: no-referrer` (the URL carries `code` and
`state`; RFC 9700 §4.2), and callback HTML carries **no subresource and no
outbound link** — a standing constraint, since the first external stylesheet or
anchor would leak the code in `Referer`. Callback HTML interpolates request- or
DB-derived values ONLY through an HTML escaper (the Linked page's two identities
are the first such values; `page()` today interpolates literals only).

The 400/400/403 ladder tells a state-holder only what an interceptor already
knows, never an account — acceptable because `state` is a 256-bit secret. This
step also closes the callback's own CSRF shape (an ambient-cookie GET that
`originCheck` does not guard): an attacker minting on their own account and luring
the victim's browser here dies at step 6.

### 6. Native completion — the new authenticated exchange

`POST /api/concept2/exchange { code, state }`, `requireUser` (bearer; JSON):

1. availability (403); 2. body shape (400 field-named); **2b. `req.authVia ===
"bearer"` else `400 {error:"wrong_surface"}`** — the request states its own
credential class before anything is peeked (a cookie browser passes
`originCheck` only for bearer-carrying requests, but a stored column is not the
place to route a property of the request);
3. `peekAttempt(state)` (advisory) → null → `400 {error:"invalid_state"}`;
4. `attempt.surface === "native"` else `400 {error:"wrong_surface"}` — not
   consumed;
5. `attempt.userId === req.user.id` else `403 {error:"principal_mismatch"}` —
   not consumed, **exchange never called**;
6. `consumeAttemptFor(state, req.user.id, "native")` → null (concurrent
   completion / re-mint) → 400 `invalid_state`; `fresh === false` → 400
   `expired`. (Declined: returning `200 {linked:true}` when a link now exists
   for the presenter would also mask a benign replay — the two-device race
   surfaces as a 400 after a success, named residual.)
7. `exchangeCode(code, nativeRedirectUri)` → fail → 502 `{error:"c2_error"}`;
   `fetchMe` → fail → 502; `upsertLink` (D1: → `409
   {error:"already_linked_elsewhere"}`) → `200 { linked: true, c2UserId,
   weightClass }`.

Steps 4-5 refuse BEFORE any wire call and BEFORE consuming, on both routes, and
step 6's statement makes the refusal structural. The 400/403 ladder gives an
authenticated holder of a `state` an unlimited nonce-existence oracle bounded
by `randomBytes(32)` (2^256) with no timing separation (both cost one read;
`exchangeCode` is reached only on full success) — no rate limit, bound stated.
Mix-up (RFC 9700 §4.4) is N/A: one authorization server, `c2BaseUrl` a
boot-time constant, no AS identifier read from any response. Open redirect and
reflected XSS: closed by construction (no `res.redirect`; literal pages).

### 7. Rower-visible pages — one shared styled template, all six pages (Gate 0 APPROVED)

The callback pages shipped in PR1 as unstyled placeholder HTML (browser-default
Times on white). Now that the authenticated callback makes them reachable by a
rower, PR1.75 replaces `page()` with ONE server template — inline CSS, system
fonts, zero network — used by all six pages. Mechanical layout: a mono status
label (`CONCEPT2 LINK · <LABEL> · HTTP <n>`), one bold statement, one action line;
app ground `#f6f3ec`, ink `#1c1a17` (15.67:1 on ground, 17.08:1 on panel), label `#5f5a50` (6.18:1 on ground, 6.74:1 on panel — WCAG relative-luminance, recomputed at plan time; an earlier 15.9/5.8 was rounded), accent rule
`#b5341f`. Approved rendered (both orientations, beside the current placeholders)
at the Gate 0 artifact, 2026-09-02. The copy, verbatim:

| status | label | statement | action |
| --- | --- | --- | --- |
| 200 | Linked | **Concept2 `<c2 username>` is now connected to Ergomatic `<email>`.** (`username` MEASURED on log-dev `GET /api/users/me`, 2026-09-02, live response with the desk session — field names: age_restricted, country, dob, email, email_permission, first_name, gender, health_data_permission, id, last_name, logbook_privacy, max_heart_rate, profile_image, roles, username, weight; read as optional, `#<id>` if ever null) (D2 — both identities, HTML-escaped; the shared-browser residual's only mitigation) | Return to the app. |
| 409 | Already linked | That Concept2 account is already connected to a different Ergomatic account. (D1 APPROVED) | Return to the app. |
| 400 | Expired | This link has expired or was already used. | Return to the app and start again. |
| 400 | Incomplete | This link is missing required parameters. | Return to the app and start again. |
| 401 | Not signed in | No Ergomatic session in this browser. | Sign in to Ergomatic here, then start the link again from the app. |
| 403 | Wrong account | This link was started by a different Ergomatic account. | Sign in as that account here, or start a new link from the account you're using. |
| 403 | Unavailable | Concept2 linking is not available right now. | Return to the app. |
| 502 | Failed | Concept2 could not complete the connection. | Return to the app and try again. |

The probe card gains a "real link" button behind its existing build flag
(dev-only, never in a release build).

### 8. What does NOT change

Availability gating, the dark flag, `GET/DELETE /link`, the upload route, refresh
serialization (`upsertLink` clearing `needsReauthAt` on every upsert is noted:
an injected link would look pristine — no new risk). Activation still waits on
Concept2 write approval + PR2, **plus the capability precondition (§3): the flag
may only be flipped once every installed native build that can reach a mint
button carries the `WebAuth` plugin — enforced by `linkClient`, not assumed.**

## Testing (TRIAD — every assertion gets a committed-then-probed mutation)

- **`requireUser`:** bearer → `authVia:"bearer"`; cookie → `"cookie"`; empty-value
  cookie → absent; both, SAME user → bearer wins, `authVia:"bearer"`; both,
  DIFFERENT users → bearer resolved AND the `auth_disagreement` log line emitted
  with both user ids (mutation: drop the log → red); neither → 401.
- **Concept2 routes, disagreement:** both present, different users → 400
  `ambiguous_auth` on mint, callback and exchange, nothing consumed (mutation:
  skip the route-level check → mint succeeds → red).
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
- **Device walk (James, log-dev — the gates CI cannot reach, RF19). HOST,
  stated (RF13 — the earlier card had none):** an HTTPS tunnel to the laptop dev
  server (`cloudflared` or equivalent), `C2_LINK_ENABLED=1` with the log-dev
  credentials, the app built with `ERGOMATIC_API_BASE=https://<tunnel-host>`.
  Plain `http://` to a LAN address is blocked by App Transport Security —
  `Info.plist` carries no `NSAppTransportSecurity` key and `CapacitorHttp` puts
  every request on native `URLSession`; adding the key is a shipping change, so
  the tunnel is the route. The tunnel host needs no Concept2 registration (the
  native leg's `redirect_uri` is the app scheme). Also walked: a WebView reload
  mid-session (the native single-flight + `abandoned` path). (a) with
  both redirects registered, start the native flow from the probe's real-link
  button → the session presents (ephemeral: a fresh C2 login screen; note whether
  any OS modal appears) → complete a real log-dev consent → the session dismisses
  and the app receives the callback → `GET /link` shows `linked:true` → RECORD:
  did the callback carry `state`? did the scheme need an Info.plist entry (i.e.
  did anything escape the session)? (b) cancel the modal → typed `cancelled`, the
  attempt untouched server-side. (c) decline at Concept2's screen → typed
  `declined`. (d) **the credential instrument for §1's UNMEASURED premise, and it is
  COMMITTED code (1.75a), not a local edit:** `requireUser` logs
  `{authVia, bearerPresent, cookiePresent, path}` — never a token value — when
  `AUTH_VIA_LOG=1` (an env flag, never `NODE_ENV`, so the walk runs the PR's own
  build); the walk card names the export and the report states the observed
  values for every native request — the only layer that can see the real native
  header set.
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
5. **Reconciliation is a numbered TASK in each plan with a grep census as its
   exit gate**, pre-paid from the 17 sites the PM enumerated (server: `schema.ts:508-515`,
   `routes/concept2.ts:14-19,37-41,160-171,182`, `app.ts:93-105` (the mount comment — `routes/data.ts:820-826` carries no Concept2 phrase; the plan corrected this), the
   five `deleteAttemptsFor` sites; client: `Concept2LinkProbe.tsx:5-10`,
   `useReturnToApp.ts:8-45`, the `onBrowserFinished` consumers; records:
   `ROADMAP.md:989,999-1020,1304`, parent spec `:429-441,568`, gate doc
   `:990-995` §3(g)/§4/§6 with a SUPERSESSION marker not a deletion, the design
   handoff README `:94-97`). The exit is the grep output pasted into the PR,
   every phrase at its EXPECTED count per PR (the plan states one per phrase: several live in `app/src` until 1.75b, in the ledgers, or in the parent spec's Branch-B contingency, each named and owned):
   `"correlates, not binds"` `"No redirect_kind column"` `"not yet added here"`
   `"deliberately unauthenticated"` `"unauthenticated BY DESIGN"`
   `"sequential-replace guarantee"` `"best-effort and RACEABLE"`
   `"delete/delete/insert"` `"one live attempt per user"` `"none built yet"`
   `"no migration exists yet"` `"appUrlOpen"` `"browserFinished"`
   `"never a real link"` `"posts nothing and carries no client id"`.
6. (a) Both redirect URIs registered at log-dev — DONE for native, confirm web;
   1.75b's walk prerequisite. (b) Live-portal registration is NOT PR1.75's exit:
   owner = the ROADMAP C2 register row + the flag-flip runbook.
7. The six callback pages (§7) approved rendered by James — DONE 2026-09-02.
8. **What is NOT discharged, written down:** the ROADMAP PR1.75 row carries a
   one-line disposition per clause of `ROADMAP.md:999-1020` at 1.75b's merge, and
   an explicit still-owed line: flag flip, live-portal registration, PR2's
   surface + identity line, promotion of the app-wide disagreement refusal.

**Five-minute "code-complete" check for James:** (1) `gh pr view <1.75b> --json
files | grep server` → empty; (2) the six identity rows green in
`pnpm test --project integration -- concept2` plus the mutation log; (3) the
phrase grep pasted, all zero/accounted; (4) the walk table: per-request
`authVia` + both-present, `state` echoed y/n, Info.plist needed y/n; (5)
`ROADMAP.md` PR1.75 `[x]` with the still-owed line.

## Decisions for James (from antagonist pass 2) — **D1 YES, D2 YES (James, 2026-09-02 "Approved"); D3 PENDING**

- **D1 — detective control against code injection (stored shape, 0020).** Add
  `UNIQUE (c2_user_id)` on `concept2_links`; a link whose Concept2 account is
  already connected to a DIFFERENT Ergomatic user → `409 already_linked_elsewhere`
  (web: a 409 page). Stops the common injection case (victim already linked) and
  stops two Ergomatic accounts writing one logbook. **Cost:** one Concept2
  account can never be linked to two Ergomatic accounts in one database.
  **APPROVED — in 1.75a's migration and both routes.**
- **D2 — the Linked page names both identities** (Concept2 username + Ergomatic
  email, escaped). The shared-browser fixation residual passes every server
  check correctly; copy is its only mitigation. Changes an approved page →
  rendered on the Gate 0 artifact; **APPROVED 2026-09-02.**
- **D3 — the desk pre-check** (§GO/NO-GO): two URLs in
  `scratchpad/c2-desk-precheck.txt`, your logged-in browser, cancel at consent.

## Plan reconciliation (1.75a plan, 2026-09-02 — rulings on the writer's observations)

- The callback's `ambiguous_auth` refusal answers JSON, not a page: only a
  non-browser caller can put a bearer on a top-level GET, and the approved page
  set has no such page. The check sits as per-route middleware right after
  `requireUser`, BEFORE availability, on the JSON routes; on the callback —
  which has no `requireUser` to sit after — it is step 3 (after step 0's
  header and step 1's availability check), beside the `notSignedIn` 401 it
  replaces — an auth-shape refusal, so an ambiguous request gets 400 even
  while the flag is off (dark routes only).
- `requireUser` performs a second session lookup only when BOTH credentials are
  present (the only way to detect disagreement); the instrument measures how
  often that is.
- `consumeAttempt` retires with `deleteAttemptsFor` — zero callers after the two
  ladders, and it was an unauthenticated consume primitive.
- 401/403 copy "Sign in to Ergomatic here" renders as PLAIN TEXT, matching the
  approved render — no anchor, even same-origin (a link is a PR2 amendment if
  wanted).
- Every nonce-shaped web 400 (unknown, wrong surface, lost race, expired) renders
  the Expired page; Incomplete is for missing parameters only.
- The concept2 store has no `describeStoreContracts` suite (PR1's shape: real-
  Postgres integration + a fake exercised by route tests); the gap is named for
  the PM, not hidden.

## Gates

Antagonist pass 2 (attacker lens): DONE 2026-09-02 (REVISE → this rev 5).
Antagonist full pass: DONE 2026-09-02 (REVISE → rev 2). Attacker-lens pass:
2026-09-02 (folded per its report). PM shape pass: DONE 2026-09-02 (SPLIT →
this rev 4). James approved the design + pages 2026-09-02. → plan 1.75a → premise
pass → implement (worktree `Ergomatic-wt-c2pr175`, branch `wave-e-pr175-app-bind`)
→ per-task review → PM final-PR gate (TRIAD) → James merges → plan 1.75b (new
worktree) → antagonist DELTA → implement → device walk → scoped PM gate → James
merges. Material deltas forced by a pass are presented to James before code.

## Out of scope, named

PR2's surface and its Gate 0 identity-copy amendment; the `ALLOWED_EMAILS`
revocation model; PKCE (Concept2 does not offer it); Android; the upload/refresh
paths; flipping the flag; promoting the app-wide disagreement refusal (after
1.75b's walk measures the premise).
