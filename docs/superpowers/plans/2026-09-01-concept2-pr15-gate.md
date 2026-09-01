# PR1.5 design gate — the account-injection ruling

**What this is:** the evidence package for the ruling the design spec
flagged as owed (`docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
§Architecture 3, Branch A: "SUSPECTED, decision owed (PR1 premise pass,
2026-08-31)"). Everything below is derived from code read this session or a
committed measurement; the seven options in §3 are presented neutrally
with their costs. **This document does not choose one — that is James's
ruling, asked for at the end.**

**Revision history:**
- Fix round 2 (P1b) rebuilt §3 around the CONSENTING PRINCIPAL after the
  original (b)/(c) were caught targeting the wrong party (the victim's own
  session, when the link lands under the ATTACKER's userId).
- **Fix round 3:** the full antagonist TRIAD pass (verdict REVISE, full
  findings in §5) caught that §1 asserted the residual without citing its
  own two bounds, that the blast radius was never stated, that (b)'s cost
  line got the disclosure direction backwards, that (c) never named a
  real cross-document conflict with PR1.5's own return-signal fix, and
  that three cheaper/different option classes were never considered. All
  folded in, every claim cited against the actual code read that session.
- **Fix round 5 (scoped re-review):** (d) as written was proven
  detection-grade only, not prevention (the raw C2 authorize URL is
  publicly constructible and bypasses any interstitial); added a
  browser-bound continuation cookie variant, at the time labeled "true
  prevention." §2's absolute "SFSafariViewController can never carry a
  session" claim was narrowed, speculating that the phone's own browser
  cookie jar might carry a prior web session in — that speculation did
  not survive round 7, below. (c) relabeled as informed physical
  confirmation, not authentication.
- **Fix round 6:** named `SameSite` as load-bearing for the continuation
  cookie's web half (§3(d)) — a separate cookie from `erg_session`, so
  the attribute has to be chosen deliberately rather than inherited.
- **Fix round 7:** fetched Apple's own
  SFSafariViewController documentation (PRIMARY, quoted at §2) and
  dropped round 5's shared-jar speculation entirely — nothing in it
  supports the guess, and the browser-bound continuation's plausible
  mechanism turns out to need no cross-app cookie sharing at all, only
  ordinary same-session persistence (still unmeasured on-device).
  Reclassified the continuation from "prevention" into the SAME bucket
  as (c), physically-confirm — it proves a browser visited `/start`,
  never who is driving it (§2, §3(d), §6). Also corrected §1a's blast
  radius: the attacker gains no tokens (never serialized to any client
  response) — only a server-mediated capability to see/replace/unlink
  the association metadata or post their own rows into the victim's
  logbook.
- **Fix round 9:** added **(g)**, a fourth taxonomy
  bucket — app-bind — claimed (WRONGLY, see round 10) as the ONLY option
  in this package that achieves real principal binding: the repo's own
  Branch B shape (spec §Architecture 3), where the callback returns to
  the APP and the server requires `attempt.userId === req.user.id`
  before exchanging. Cited RFC 8252 §7.1 (PRIMARY, the
  external-browser-to-app return mechanism) and Apple's own
  `ASWebAuthenticationSession` documentation (PRIMARY, fetched this
  session: it "ensures that only the calling app's session receives the
  authentication callback, even when more than one app registers the
  same callback URL scheme") — priced honestly against C2's own
  undocumented PKCE support (anchor ground: "nothing found") and named as
  NOT chosen, joining the taxonomy alongside the other six. Also
  re-priced the victim's provider-side remedy (§1a) against Concept2's
  own Help page (SECONDARY until account-verified — an optional walk
  step now checks it) and corrected the refresh-token durability claim:
  renewable WITH USE, not an indefinite idle capability.
- **Fix round 10, this revision (F1):** (g) as round 9 wrote it is
  REFUTED as unconditional, by the SAME logic that already downgraded
  (d): `concept2_auth_attempts` has no surface/redirect-kind column
  (`server/db/schema.ts:510-519`) and `consumeAttempt` returns only
  `{userId, weightClass}` (`server/stores/concept2.ts:181-196`), so an
  attacker can simply mint for the WEB surface and complete via the
  EXISTING, unauthenticated `/api/concept2/callback`
  ("NO requireUser — the nonce binds," `server/routes/concept2.ts:171`)
  — (g)'s own check, living entirely in the NEW native exchange route,
  is never reached. Restated: (g) is the only option that CAN bind the
  principal, and only WITH a `surface` column enforced at BOTH routes
  as an explicit precondition, priced as a real migration cost this
  document did not originally charge it. §3(g), the taxonomy, §6, and
  the antagonist ledger's own round-3 correction block (finding 6's
  "prevents" language, which named the wrong defect — mislabeling, not
  bypassability) all corrected to match.

## 1. The residual, restated — with its own bounds

Branch A's callback binds the exchange to the nonce alone
(`concept2_auth_attempts.user_id`, spec §Data model). Whoever's browser
completes the consent screen links THEIR Concept2 account to whichever
Ergomatic user minted the nonce. If an attacker mints an attempt on their
own Ergomatic account and gets the resulting authorize URL in front of a
victim (any channel — a link, a QR code, a shared device), the victim's
Concept2 login ends up linking the ATTACKER's Ergomatic account, not the
victim's own.

**Bounded today by FOUR things, not two — the fix round 2 revision named
only the first two:**

1. `ALLOWED_EMAILS` (the household allowlist gating who can hold an
   Ergomatic account at all).
2. The `C2_LINK_ENABLED` dark flag (PR1's availability gate, spec
   §Architecture 8) keeping the whole feature off until James turns it on.
3. **One live attempt per user** (`server/routes/concept2.ts:159-161`, the
   route's own comment: "every mint sweeps stale attempts globally and
   this user's own before minting a fresh one, so a user can never hold
   more than one live attempt" — enforced by `deleteAttemptsFor(userId)`
   at mint time). An attacker cannot pre-mint a stockpile of authorize
   URLs; each fresh mint invalidates their own previous one.
4. **The 15-minute attempt window**
   (`ATTEMPT_MAX_AGE_MS = 15 * 60 * 1000`, `server/routes/concept2.ts:38`,
   enforced in `consumeAttempt`'s own `fresh` column check,
   `server/stores/concept2.ts:191,194`). **What this kills:** delivery
   channels that are inherently slow or asynchronous — a printed QR code
   left somewhere, an emailed link opened hours or days later — are
   mostly dead against a 15-minute clock. The residual survives mainly
   against FAST, synchronous delivery: a shared device handed over in
   person, a link sent over a live chat the victim opens within minutes,
   or an attacker standing next to the victim.

## 1a. The blast radius — what James is actually weighing — CORRECTED
round 7 (finding 4)

Not previously stated in the original pass; round 7 found the FIRST
correction below was itself wrong in a way that could change the ruling,
and fixed it against the code rather than restating the error more
carefully. If the residual fires:

- **CORRECTED 2026-09-01 (round 7, finding 4): the attacker does NOT gain
  the victim's tokens, or any client-visible credential at all — the
  original bullet here overclaimed "token exfiltration."** Verified this
  session: `server/db/schema.ts:472-478`'s own comment states plainly
  "Tokens are never serialized to any client response —
  `routes/concept2.ts` returns {available, linked, weightClass, c2UserId,
  needsReauth} ... but never a token." `accessToken`/`refreshToken` are
  server-side columns (`server/db/schema.ts:484-485`) that never leave
  the server for ANY caller, including the account's own legitimate
  owner. **What the attacker ACTUALLY gains is a SERVER-MEDIATED
  CAPABILITY, not the tokens themselves:** for as long as the
  misdirected link stands, the attacker's OWN Ergomatic account can (i)
  see the linked identity via `GET /api/concept2/link`'s metadata-only
  response (`c2UserId`, `weightClass`, `needsReauth` —
  `server/routes/concept2.ts:246`), (ii) unlink or later re-link a
  DIFFERENT C2 account under their own row (`DELETE
  /api/concept2/link`), and (iii) POST their OWN eligible workout rows
  into the VICTIM's C2 logbook — verified against the upload route itself
  (`server/routes/concept2.ts:265,297-298`, `router.post(
  "/api/concept2/results/:logId", requireUser, ...)` resolves `userId =
  req.user!.id` and `logs.get(userId, logId)`, BOTH always the CALLER's
  own id — the attacker can never reach or post the VICTIM's own rows,
  only send their own into the victim's account). This is real —
  unwanted rows appearing in someone's Concept2 logbook, indefinitely,
  with no way for them to know why — but it is NOT arbitrary C2 API
  access and NOT a credential leak. **The refresh path's durability,
  narrowed round 9 (item 3):** the spec's own research record says the
  refresh token is "currently one year" and ROTATES on every use — a new
  access+refresh pair each time (spec §Data model research). Refreshing
  itself is LAZY, never a cron: `server/routes/concept2.ts:429-444`
  only calls `client.refreshTokens` when an authenticated action (a
  results POST) actually needs a near-expired access token
  (`TOKEN_REFRESH_SKEW_MS`). So the link stays alive INDEFINITELY only
  so long as SOMETHING keeps exercising it at least once within each
  ~year window — the attacker's own continued posting, in the common
  case (§1a above). A genuinely DORMANT attacker-held link (never
  exercised again) is NOT an indefinite idle capability: once the
  refresh token itself lapses, the next attempted use fails with
  `refreshTokens`'s own `grantDead` signal and the route flags
  `needsReauthAt` (`server/routes/concept2.ts:455-462`) rather than
  silently succeeding — requiring a fresh consent grant, which the
  attacker cannot obtain without repeating the whole residual. "Renewable
  WITH USE, not indefinite while idle" is the accurate statement; the
  "tokens leaked" framing this bullet originally carried was already
  wrong (corrected round 7, above).
- **What the victim can do about it, in-app: NOTHING.** `DELETE
  /api/concept2/link` is caller-scoped (`server/routes/concept2.ts:251-260`,
  `deleteLink(req.user!.id)` — only ever touches the CALLER's own row,
  which for the victim is not the row the attacker is reading). The
  victim has no session for the attacker's Ergomatic account and cannot
  reach it.
- **Nor from Concept2's side, in general: C2 documents no
  revocation endpoint at all** — anchor ground, spec's own research pass:
  "**No token-revocation endpoint** — nothing found; unlink is necessarily
  local (V5)" (`docs/superpowers/specs/2026-08-31-concept2-logbook-design.md:136-139`).
  **The real remedy, re-priced round 9 (item 3): likely provider-side
  revoke, unverified on a real account — the account oracle is one login
  away.** SECONDARY (Concept2's own Help page,
  `https://log.concept2.com/help`, fetched this session, quoted
  verbatim): "If you ever want to stop uploading to a site, go back to
  the Applications page and click on Revoke next to the service you no
  longer wish to send your workouts to." Tagged SECONDARY rather than
  PRIMARY-and-settled because this session did not log into a real C2
  account to confirm Ergomatic actually appears there post-link, or that
  Revoke there genuinely severs what this app's own refresh path relies
  on — an optional walk step now asks for exactly that confirmation
  (`docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`, "Also worth
  a glance"). Changing the C2 password remains the fallback if Revoke
  turns out not to cover this app's grant specifically.
- **The victim's OWN link, if they have one, is undisturbed.**
  `concept2_links.userId` is the PRIMARY KEY (`server/db/schema.ts:479-483`)
  and `c2UserId` carries no unique constraint — `upsertLink`'s own
  `onConflictDoUpdate` targets `concept2Links.userId`
  (`server/stores/concept2.ts:85-86`). The attacker's row (keyed on the
  ATTACKER's userId) and the victim's own row (keyed on the VICTIM's
  userId, if they ever make one) are two structurally independent rows —
  the attack does not overwrite or corrupt the victim's own data, it
  creates a SEPARATE row nobody but the attacker can see.

## 2. The credential fact, code-derived — NARROWED, fix round 5 (P1,
finding 3b: the original claim was absolute and wrong)

**Original claim, too strong:** "the consent browser can never carry an
Ergomatic session on native." **What is actually true, and the
distinction matters for §3(d)'s browser-bound-continuation variant below
(round 9: not "prevention" — physically-confirm, same bucket as (c)):**

- **The NATIVE APP itself holds only a Keychain bearer, never a cookie —
  this part stands.** `app/src/api.ts:5-8` (comment, quoted verbatim):
  "All API calls go through here: native builds get the absolute base URL
  and the Keychain bearer; web stays relative with cookie auth." Native
  auth is a bearer token attached per-request as an `Authorization`
  header (`app/src/api.ts:14-17`), never a cookie.
  `app/src/native/session.ts:6-9`: the token lives in
  `@aparajita/capacitor-secure-storage` (the iOS Keychain), read via
  `getStoredToken()`.
- **But the SERVER DOES issue real cookie-based sessions — for WEB.**
  `server/auth/cookies.ts:6,20-29` defines `SESSION_COOKIE = "erg_session"`
  and `sessionCookie()`, which sets it `httpOnly`, `sameSite: "lax"`,
  `path: "/"`; `server/auth/middleware.ts:46-66`'s `requireUser` reads it
  back via `getCookie(req.headers.cookie, SESSION_COOKIE)` whenever no
  bearer header is present. This is a live, working mechanism — just not
  one the NATIVE APP ever uses.
- **Round 7 correction (finding 2): the "a prior web session's
  `erg_session` might be sitting in the shared Safari jar" idea above was
  SPECULATION, and this round fetched the actual vendor documentation
  rather than continuing to guess.** PRIMARY
  (developer.apple.com/documentation/safariservices/sfsafariviewcontroller,
  fetched via the docs JSON API this session — the HTML page is
  JS-rendered and did not return usable text — `Overview` section, quoted
  verbatim): **"Interactions with the web interface aren't visible to
  your app, and you can't access AutoFill data, browsing history, or
  website data."** and **"You don't need to secure data between your app
  and Safari. To share data between your app and Safari, use
  `ASWebAuthenticationSession` instead."** Read precisely: this states
  what the HOST APP cannot access from an `SFSafariViewController`
  session — it does not directly state whether that session's OWN cookie
  jar is the same one Safari itself uses while browsing. But it does
  establish, PRIMARY, that Apple's own recommended mechanism for
  DELIBERATELY sharing session state between an app and Safari is a
  DIFFERENT API (`ASWebAuthenticationSession`), not `SFSafariViewController`
  — undermining rather than supporting a design that leans on
  `SFSafariViewController` incidentally carrying a prior web session's
  cookie. **The "ordinary Safari `erg_session` may be shared in"
  speculation is dropped.** It was never load-bearing for PR1.5 itself
  (native-only, no `/start` route exists yet) and this document should
  not carry forward a claim it could not source.

**Conclusion, revised:** on native, the APP's own credential (the
Keychain bearer) is genuinely absent from the consent browser — that part
of the original argument holds, and Apple's own doc reinforces it (the
app cannot access that browser's website data regardless). **The
plausible mechanism for §3's browser-bound continuation is narrower and
does NOT depend on any cross-session/cross-app cookie sharing at all: a
cookie set by our OWN `/start` route and consumed by our OWN `/callback`
route WITHIN ONE CONTINUOUS `SFSafariViewController` PRESENTATION** — one
browsing session, start → C2 → callback, never closed in between. This is
ordinary same-session cookie persistence, the same guarantee any web
browser gives any OAuth flow that redirects through a third party and
back — it needs no claim about Safari's shared jar, no claim about
`erg_session`, nothing beyond "a cookie set early in a session is still
there later in the SAME session." **Still not certified by this session
without a device measurement** (no vendor doc found that speaks to
`SFSafariViewController`'s within-session cookie persistence specifically,
as opposed to cross-app sharing) — but the claim being measured is now
the ordinary, low-risk one, not the speculative one.

**Web is different and out of scope for the residual as stated:** web's
callback runs in the same browser as the app, cookie auth already exists
there (`api.ts:5-8`'s "web stays relative with cookie auth"), and Branch B
was never in play for web either way (spec §Architecture 3: "Web keeps
the https callback (cookie exists there)"). PR1.5 is Branch A + native
only (Global Constraints); this gate package's native focus matches PR1.5's
own scope, not an oversight of the web case.

## 3. The options, with costs (seven classes, a-g)

Every option below is verified against `server/routes/concept2.ts`'s
actual callback route (lines 173-221 as read this session), not asserted.
Three load-bearing facts about that route, all cited because several
options depend on them:

- The attempt row carries `userId` and `weightClass` ONLY — no email
  (`server/stores/concept2.ts:181-196`, `consumeAttempt`'s `RETURNING`
  clause selects exactly those two columns). Rendering an identity
  anywhere therefore needs a NEW lookup: `Concept2RouterDeps`
  (`server/routes/concept2.ts:21-33`) injects `store`/`logs`/`client`/
  `requireUser`/`now` — no user store — and `server/auth/users.ts` itself
  has no by-id lookup today (`findByGoogleSub`, `createUser`,
  `updateProfile` only, `server/auth/users.ts:5-26`). (b), (c), and (d)
  below all need this same new plumbing.
- `consumeAttempt` is ONE atomic `DELETE ... RETURNING`
  (`server/stores/concept2.ts:184-196`) that runs BEFORE the token
  exchange, on purpose: the route's own comment says "consumed before
  exchange even starts, so a retry after ANY later failure restarts at
  mint" (`server/routes/concept2.ts:193-195`). There is no "peek without
  consuming" method.
- `upsertLink` (line 213) — the actual write that creates the residual —
  runs BEFORE `LINKED_HTML` renders (line 220). Nothing today runs between
  "the account is linked" and "the browser sees success."
- **Minting is `requireUser`-gated**
  (`server/routes/concept2.ts:139`, `router.post("/api/concept2/connect",
  requireUser, ...)`). This matters for (b)'s cost, below.

**(a) Accept the residual, bounded by the four facts in §1.**
Zero code. The population that can hold an Ergomatic account today is the
household allowlist (`server/auth/allowlist.ts`), the feature is dark
behind `C2_LINK_ENABLED`, one live attempt per user, and a 15-minute
clock. Revisit before any public opening, or before `ALLOWED_EMAILS`
widens.

**(b) Detection at the callback page: show the target identity BEFORE the
consenting principal leaves that page.**
After `upsertLink` succeeds, `LINKED_HTML` (line 83, currently the fixed
string "Linked. Return to the app.") renders instead: "Linked to
`<email of attempt.userId>`. If that is not your account, [contact
support]." **Cost line CORRECTED, fix round 3 (antagonist finding 6 — the
fix round 2 draft had the disclosure direction backwards):** because
minting is `requireUser`-gated, `attempt.userId` in the ATTACK scenario is
always the ATTACKER's OWN authenticated account — the attacker minted it.
So the email this option displays to the attacker, when the attacker is
the one sitting at the consent screen (the common shape of this attack:
the attacker completes their OWN consent to link a Concept2 account they
control), is the attacker's OWN email — self-identifying, not a leak, and
arguably a BENEFIT (nothing new to hide). **The genuine residual
disclosure is narrower than the fix round 2 draft claimed:** only the
"escaped URL within the 15-minute window" case — someone OTHER than the
minter completes consent using the same URL (forwarded, shared, glanced
at over someone's shoulder) — actually shows that THIRD PARTY the
minter's email. State it as such: (b) discloses the MINTER's email to
whoever completes consent with the minter's URL, which is the intended
audience in the common case and a narrow, time-boxed, accidental-sharing
case otherwise — not "whoever holds the authorize URL" broadly. **Cost:**
the new user-lookup plumbing above (a `findById`-shaped method plus a
`users` dependency threaded into `Concept2RouterDeps` and its mount
site). No stored-shape change.

**(c) Physically-confirm at the callback page (round 9: heading corrected
— the body below was relabeled off "prevention" back in round 5, but
this heading itself never was): the exchange completes, but the
link stays `pending` until the SAME browser confirms.**
The callback still exchanges the code and calls the C2 API (unavoidable —
that is how `me.c2UserId` is learned at all), but writes the link with a
new `pending` flag instead of live, and renders a page showing the SAME
target identity as (b) plus a **Confirm** button. That button POSTs back
to a new route, re-presenting a short-lived confirm token minted for this
attempt (NOT the original nonce — `consumeAttempt` already deleted that
row) — only THEN does the link flip to live. **Relabeled, fix round 5
(finding 3c — "binding" overstated what this is):** this is INFORMED
PHYSICAL CONFIRMATION, not authentication of the consenting principal —
nothing about the tap proves WHO is tapping, only that SOMEONE looking at
the identity-bearing page chose to proceed. §2's credential fact still
holds (no Ergomatic session artifact exists in that browser to check
either way), so this option was never claiming identity verification;
it is a deliberate-action gate, and should be read as one. If the
button is never pressed, the `pending` row needs the same kind of expiry
`concept2_auth_attempts` already has — a genuinely new GC concern.
**ADDED, fix round 3 (antagonist finding 7 — a cross-document collision
neither pass caught):** a Confirm button on this page COMPETES with the
dismissal gesture PR1.5's own return signal keys on. Fix round 2's own
fix (`useReturnToApp`'s `browserFinished` listener) fires the moment the
rower dismisses the modally-presented browser — and the operator walk
card (`docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`) trains
exactly that dismissal gesture as "the return." If (c) is chosen, the
callback page's copy, PR2's card, AND the return-signal design must be
built TOGETHER, not independently: does tapping Confirm itself close the
browser (`Browser.close()` is likely involved, which would need its own
check against whether it fires `browserFinished` the same way a manual
Done-tap does — unverified this session), or does the rower still have to
tap Done afterward (two taps, two signals, ordering matters)? Getting this
wrong reintroduces exactly the P1a-class miss this whole PR exists to
close, one layer up. **Cost, restated:** a real stored-shape change (a
`pending`/confirmed distinction on `concept2_links`, a new confirm-token
concept and route, migration), the SAME narrowed information cost as (b),
a second network round-trip inside the SAME browser session, AND a
cross-document design dependency on PR1.5's own return-signal mechanism
that does not exist for any other option here.

**(d) A pre-consent interstitial on our OWN origin — DETECTION-GRADE
ONLY as originally written, fix round 5 (finding 3a, the reviewer proved
it); a second half, added below, reaches PHYSICALLY-CONFIRM, the SAME
class as (c) — round 7 (finding 3) corrects fix round 5's own "TRUE
prevention" label. Neither half of (d), nor any other BROWSER-side
option in this document, achieves cryptographic principal binding —
**(g), added round 9, does** — see the closing taxonomy note after (g).**

**The original (d) is not prevention, and here is the proof, not an
assertion:** the attacker already holds a valid `state` (their own
minted nonce) and `client.authorizeUrl(state)`
(`server/concept2/client.ts:108-116`) builds C2's authorize URL from
NOTHING but PUBLIC values — a fixed `client_id`, a fixed `redirect_uri`,
and the `state` itself, all either constants or already visible to the
attacker in the URL the mint route handed back. **Nothing stops the
attacker from constructing that same raw C2 URL by hand and giving THAT
directly to the victim, skipping our interstitial entirely** — and the
callback (`server/routes/concept2.ts:173-220`) has no way to tell the
difference: `consumeAttempt(state, ...)` only checks that the nonce
exists and is fresh, never whether the browser presenting it ever visited
our interstitial first. So (d) alone only helps in the narrow case where
the attacker VOLUNTARILY routes the victim through it (no incentive to)
or a legitimate accidental-forward happens to include it — it is
DETECTION-grade at best, exactly like (b), not prevention. Everything
below the original write-up (mint returns `GET /api/concept2/start?state=`,
looks up the target user, renders a masked identity, 302s to C2 on
Continue) is still accurate as a DETECTION mechanism and still costs what
it said: the same by-id user lookup (b)/(c) need, plus one new route, no
stored-shape change.

**The stronger variant, fix round 5 (finding 3a): a BROWSER-BOUND
CONTINUATION — round 7 RECLASSIFIED (finding 3): this is
PHYSICALLY-CONFIRM, the same class as (c), NOT prevention.**
`/api/concept2/start` sets a short-lived, single-purpose cookie in the
CONSENT BROWSER itself (scoped to this flow only — not an `erg_session`,
a purpose-built cookie naming nothing but "this browser visited `/start`
for this attempt"). Because Concept2's redirect returns the SAME browser
instance to our `/api/concept2/callback` (same origin, ordinary same-site
cookie semantics — see the `SameSite` note below), the callback can then
REQUIRE that cookie's presence and REFUSE the exchange if it is missing.

**Why this is confirmation, not prevention — round 7 correction, stated
plainly:** the cookie proves ONE fact only — "the browser present at
`/callback` also visited `/start` earlier in this same session." It
proves NOTHING about WHO is driving that browser at either end. An
attacker can visit `/start` themselves (nothing there is
identity-gated beyond the nonce, which the attacker already holds
legitimately as the minter) and then hand the VICTIM the resulting,
cookie-bearing continuation — a shared device, a screen-share, a
"click this for me" — exactly as the raw-URL attack in (d)'s original
write-up already assumed a cooperative-victim channel exists. The cookie
closes the "skip our origin entirely" bypass; it does not, and cannot by
itself, verify that the person completing consent is the one the design
intends to be confirming. This is the SAME guarantee shape as (c)
("informed physical confirmation, not authentication of the consenting
principal," this document's own round-5 relabel of (c)) — (d)'s
continuation variant belongs in that same bucket, not in a separate
"prevention" bucket fix round 5 invented for it.

**Missing requirements if this variant is pursued, costed honestly
(round 7, finding 3) — none of these exist in the fix round 5 write-up:**
- **Deliberate action, not a bare GET side effect.** Setting the cookie
  and proceeding to C2 must ride an explicit POST or a tap-driven
  navigation, never an automatic redirect a page load alone could
  trigger — otherwise "the browser visited `/start`" can be true of a
  link preview, a prefetch, or a passive page load nobody consciously
  acted on, undermining even the "physical confirmation" reading.
- **Anti-framing.** `/start`'s response needs `frame-ancestors`/
  `X-Frame-Options` denying embedding — without it, an attacker can frame
  the confirmation page invisibly (classic clickjacking) and collect a
  "confirmation" the victim never knowingly gave.
- **One-time/clearing semantics.** The continuation cookie should be
  single-use and cleared on consumption (or expire on the SAME short
  clock as the attempt nonce) — otherwise it can be replayed across
  multiple attempts from the same browser.
- **What would ACTUALLY bind the principal, named so James can weigh what
  is NOT on offer here:** genuine principal binding needs an
  authenticated proof tied to a specific person — e.g., the SAME
  Ergomatic session returning through an authenticated app/browser
  hand-off — which is exactly what §2's credential fact rules out
  reaching THIS BROWSER on native. No option INSIDE the browser does
  this. **(g), added round 9, does — it moves the check to the APP,
  where a real credential (the Keychain bearer) already exists** — see
  the taxonomy note after (g).

**Cost, honestly:** whether a cookie set by `/start` genuinely survives
the FULL round trip — our origin, then C2's domain, then back to our
origin — inside `SFSafariViewController`/mobile Safari on a real device
is UNMEASURED by this session. §2's round-7 correction narrows what this
rests on: NOT a claim about Safari's shared cookie jar (dropped, no
vendor support found), but the much more ordinary claim that a cookie
set early in ONE continuous browsing session survives to the end of that
SAME session — nothing beyond standard OAuth-redirect cookie behavior.
Still unmeasured on `SFSafariViewController` specifically; the walk card
used to carry a probe note aimed at the (now-dropped) shared-jar
question and has been corrected accordingly (see that document). Web is
comparatively straightforward — ordinary same-origin cookie behavior in
a normal browser tab, no cross-app jar question at all — **but not
attribute-free: the arriving `/callback` request is a cross-site
TOP-LEVEL GET (the browser was just on `concept2.com`, navigating back to
us), so `SameSite` is the load-bearing attribute for the web half
specifically** — `SameSite=Strict` would NOT send the `/start` cookie on
that navigation at all, while `SameSite=Lax` does (Lax's whole exemption
is top-level, safe-method navigations). Our existing `erg_session`
cookie is already issued `sameSite: "lax"` (`server/auth/cookies.ts:20-29`),
but this new continuation cookie is a SEPARATE cookie and must be issued
`Lax` just as deliberately — inheriting it by copying `sessionCookie()`'s
shape is not automatic just because the precedent exists. Needs the same
by-id user lookup as (b)/(c)/(d)-detection, plus the cookie-issuing logic,
the callback-side check, the deliberate-action/anti-framing/one-time
requirements above, and the same GC shape (b)/(c) already need; no
`pending` stored state, no confirm-token route beyond what's listed here.

**Either half of (d) is LOAD-BEARING FOR PR1.5 ITSELF, not just a
server-side add-on:** it changes what PR2's card hands to
`openExternalUrl` — OUR-ORIGIN start URL, not C2's raw authorize URL —
which is exactly the argument `openExternalUrl` takes today (PR1.5's own
new code, this fix round). Choosing either (d) variant means PR1.5's
contract with PR2 changes shape.

**(e) Shorten `ATTEMPT_MAX_AGE_MS`.**
Not in either previous pass. One constant
(`server/routes/concept2.ts:38`), currently 15 minutes. Shortening it
(2-3 minutes, say) narrows §1's own bound 4 further, killing more of the
asynchronous-delivery surface (an attacker now has less time to get a
victim to complete consent after minting). **Composes with every other
option here** — it is not an alternative to (a)-(d)/(f)/(g), it is a dial any
of them can also turn. **Cost:** effectively zero — one line, no
migration, no new route. Trade-off: a legitimate user who mints, gets
distracted, and returns to consent later also has less slack.

**(f) `UNIQUE` constraint on `concept2_links.c2_user_id`.**
Not in either previous pass. Today (`server/db/schema.ts:483`) `c2UserId`
carries no uniqueness — the SAME Concept2 account can sit behind multiple
Ergomatic `userId` rows simultaneously (§1a already establishes this is
exactly how the attacker's row and the victim's own row coexist
undisturbed). Adding `UNIQUE` on `c2_user_id` means: if the ATTACKER has
already linked C2 account X under the attacker's row, and the VICTIM
later tries to link THEIR OWN real C2 account for real — and it happens
to BE account X — that second `upsertLink` violates the constraint and
FAILS. **This is the ONLY option here that gives the VICTIM a signal at
ZERO information disclosure to anyone** — no email shown, no interstitial,
nothing new rendered to any party; the victim simply sees their own
legitimate link attempt fail, which is real information they didn't have
before. **Partial, stated honestly:** a victim who never attempts their
OWN real link (doesn't use Concept2, never notices, gives up) is never
signaled at all — this is a detection floor under the RIGHT
circumstances, not universal coverage. **Genuine product question, not
just a security one, and James's call specifically:** this would
STRUCTURALLY FORBID two different household members from ever linking the
SAME shared Concept2 account (a family login used by two rowers) — if
that is a real use case for this household app, (f) forecloses it
entirely, not just for the attack scenario.

**(g) Authenticated app-return binding — the repo's own Branch B shape
(spec §Architecture 3, `2026-08-31-concept2-logbook-design.md:210-217`) —
added round 9. NOT unconditionally "the only option that achieves real
principal binding" — round 10 (F1) found the SAME class of downgrade
that broke (d)'s original claim also breaks this one, absent a fix.
See the correction immediately below before reading the rest of this
option as settled.**
Every option (a)-(f) above operates entirely INSIDE THE BROWSER, where
§2 already establishes no Ergomatic-issued credential reaches native.
(g) moves the check to the APP instead, where a real credential (the
Keychain bearer) already exists: the callback returns `code`+`state` to
the app (a private-use URL scheme registered in Info.plist, per the
spec's own Branch B design, or `ASWebAuthenticationSession` — see the
interception note below), an `appUrlOpen` handler (or
`ASWebAuthenticationSession`'s own completion handler) hands `{code,
state}` to a NEW authenticated exchange route, `POST
/api/concept2/exchange`, carrying the app's own Keychain bearer
(`app/src/api.ts:14-17`), and the server REQUIRES
`attempt.userId === req.user.id` before ever calling C2's token
endpoint — a mismatch is rejected outright, no link written, no exchange
attempted. An attacker's raw authorize URL, completed by consent in a
SEPARATELY authenticated victim's own app instance, fails this check:
the returning bearer identifies the victim, the attempt row identifies
the attacker, and the two never match — **PROVIDED the completion
actually reaches this NEW route, which is not guaranteed — see below.**

**REFUTED as an unconditional claim, round 10 (F1) — the SAME class of
correction as (d)'s own downgrade above, and just as fatal without a
fix:** the attempt row itself carries no notion of WHICH surface will
complete it. `concept2_auth_attempts` (`server/db/schema.ts:510-519`)
stores only `nonce`/`userId`/`weightClass`/`createdAt` — its own comment
says plainly "No redirect_kind column — Branch A is chosen and the
redirect URI is one env-derived constant" — and `consumeAttempt`'s
`RETURNING` clause (`server/stores/concept2.ts:181-196`) hands back only
`{userId, weightClass}`. The EXISTING `/api/concept2/callback` route is
unauthenticated BY DESIGN ("NO requireUser — the nonce binds,"
`server/routes/concept2.ts:171`'s own comment) and is UNCHANGED by (g) —
round 9 added a NEW route for native, it did not touch or gate the old
one. So an attacker mints an attempt (the SAME mint route,
`POST /api/concept2/connect`, `server/routes/concept2.ts:139`, serves
both surfaces identically — nothing in the request or the stored row
records which one), gets back an authorize URL whose `redirect_uri`
points at the HTTPS callback (the web path — nothing about minting
FORCES the native path), hands that URL to the victim, and the victim's
consent completes through the OLD unauthenticated callback exactly as
the original residual describes. `(g)`'s `attempt.userId === req.user.id`
check lives entirely in the NEW `/api/concept2/exchange` route — a route
this attack path never reaches. **Restated honestly: (g) is the only
option that CAN bind the principal, and only WITH attempt-surface
binding added as an explicit precondition** — a `surface` (or
`redirectKind`) column on `concept2_auth_attempts`, set at mint time and
enforced at BOTH routes (the https callback must refuse to consume a
native-minted nonce; the new exchange route must refuse to consume a
web-minted one). **Without it, the web-mint downgrade applies to (g)
exactly as the raw-URL downgrade applies to (d) above** — same shape
(a bypass the schema has no column to prevent), same fix class (add the
missing check), same verdict until the column exists: NOT binding.

**Why this is genuinely stronger — WITH the precondition above, cited,
not asserted:** RFC 8252 §7.1
(PRIMARY, fetched this session) describes the general mechanism the
spec's Branch B already names: "When the authorization server completes
the request, it redirects to the client's redirection URI as it would
normally. As the redirection URI uses a private-use URI scheme, it
results in the operating system launching the native app, passing in the
URI as a launch parameter." Apple's own `ASWebAuthenticationSession`
documentation (PRIMARY, fetched this session via the docs JSON API — the
same technique round 7 used for `SFSafariViewController`'s own
JS-rendered page — `developer.apple.com/documentation/authenticationservices/aswebauthenticationsession`),
quoted verbatim: **"ASWebAuthenticationSession ensures that only the
calling app's session receives the authentication callback, even when
more than one app registers the same callback URL scheme."** These are
two DIFFERENT guarantees, kept separate deliberately: the Apple quote
protects against a DIFFERENT app hijacking the redirect on-device (a
real, documented weakness of a bare custom URL scheme + `appUrlOpen`,
which the spec's Branch B as drafted uses — iOS resolves scheme-
registration collisions with no user-visible arbitration); it says
nothing about C2's own missing PKCE (below), which no client-side
mechanism can retrofit.

**Honest limit, named so James can weigh it against (c)/(d) — SECOND in
line behind the surface-binding precondition above, round 10:** even
WITH attempt-surface binding added, (g) binds the exchange to whichever
APP INSTANCE's authenticated session actually receives the callback —
not to a specific PERSON. On a device where the ATTACKER's own Ergomatic
session is the one signed in and live (a shared device the attacker
controls, or one they hand the victim mid-session), the callback still
authenticates as the attacker, and the check passes trivially
(`attempt.userId` and `req.user.id` are both the attacker's) — the
injection outcome is unchanged. (g), fully built, closes the residual
specifically for the common case §1's bound 4 already names as the
surviving delivery channel — a forwarded link or QR code the victim
opens on THEIR OWN signed-in device — which is the majority case this
whole document is about; it does not close the shared-device case, the
same case (c)/(d)'s physically-confirm bucket also cannot close.

**The interception risk, named plainly, per the spec's own anchor
ground (PRIMARY, already in the repo): "PKCE: nothing found — no 'PKCE'
or 'code_challenge' on the page"** (spec §Research record,
`2026-08-31-concept2-logbook-design.md:59-60`). Concept2's OAuth
implementation has no proof-of-possession check at its token endpoint.
If the redirect were intercepted BEFORE reaching our intended app (the
scheme-collision risk above, on a device carrying a second app
registered for the same scheme), the intercepting party would hold a
bare authorization `code` that C2's OWN token endpoint would exchange
for anyone presenting it with the right `client_id`/`client_secret` — no
`code_verifier` binds the code to the app that requested it. This
specific exposure is narrower here than a typical PKCE-less mobile
client, because OUR server (not the client) holds `client_secret` (spec's
own V2) — a third party that merely intercepted the redirect still lacks
the secret needed to complete an exchange against C2 directly. But
`ASWebAuthenticationSession`'s exclusivity guarantee above is still the
more direct fix for the interception vector ITSELF, since it prevents a
second app from ever seeing the redirect URI in the first place,
regardless of PKCE.

**Cost, honestly, NOW INCLUDING the round 10 precondition:** URL-scheme
registration in Info.plist, or the `ASWebAuthenticationSession`
Capacitor plugin (none installed today — `@capacitor/browser`, already
added this PR, is a DIFFERENT plugin with no callback-delivery mechanism
of its own); Concept2's OWN approval of a NEW `redirect_uri` for that
scheme (the dev credential's registered `redirect_uri` is the https
callback only, per the spec's own "Operator steps" section — a new one
needs registering with C2 before this could work at all); a new
authenticated exchange route (`POST /api/concept2/exchange`) — notably,
this does NOT need the by-id user lookup (b)/(c)/(d) all require, since
the bearer itself already IS the identity, no email lookup needed; **a
REAL stored-shape change this document did not originally charge (g)
for: a `surface`/`redirectKind` column on `concept2_auth_attempts`
(currently `nonce`/`userId`/`weightClass`/`createdAt` only,
`server/db/schema.ts:510-519`), a migration, set at mint time, and
enforced with a rejection at BOTH `/api/concept2/callback` and the new
`/api/concept2/exchange`** — without this, (g) is not an option at all,
per the correction above; and PER-SURFACE redirect selection at mint
time (the spec's own Branch B line: "`redirect_uri` chosen per surface
at mint time" — web keeps the https callback, since web already has
cookie auth and Branch B was never proposed for it). **(g) is the ONLY
option in this document that changes PR1.5's own mint-time contract on
native, not just the `openExternalUrl` argument the way (d) does** — a
new redirect KIND, not just a different URL — **and, as of round 10, the
only option besides (c) that needs a real migration.**

Not chosen — it joins the taxonomy as a fourth bucket, below.

**The taxonomy, corrected, round 7 (finding 3), extended round 9 to a
FOURTH bucket, corrected round 10 (F1) on what that bucket actually
requires — say this plainly so James rules on reality, not on a
label:** every option above sorts into exactly one of four buckets —
**accept** (a), **detect** (b, and (d)'s original interstitial half, at
two different strengths — (b) after a completed consent, (d) before
one), **physically-confirm** (c, and (d)'s browser-bound-continuation
half, also at two strengths — (c) binds to "this exact page render,"
(d)'s continuation binds to "this exact browser session"), or
**app-bind** (g) — the only bucket that CAN bind to an authenticated
PERSON rather than merely a page render or a browser session, and the
only one not confined to the browser. (e) and (f) are orthogonal
dials/signals that compose with any bucket. **NO BROWSER-SIDE option in
this document achieves cryptographic principal binding — proof that the
SPECIFIC person the design intends is the one who consented — and (g)
does not either, AS WRITTEN: without attempt-surface binding (the round
10 precondition above), an attacker simply mints for the web surface and
the whole app-bind mechanism is never reached, the same downgrade shape
that already broke (d)'s original "prevention" claim.** WITH that
precondition built, (g) achieves real binding subject only to its
second, narrower limit (it binds the APP INSTANCE, not the physical
person controlling it — the shared-device gap). "Prevention" was the
wrong word for (a)-(f); every one of them either accepts the residual,
makes it visible after the fact, or requires a deliberate action from
whoever is physically present, without verifying WHO that person is.
(g), once its precondition is built, is the one option that verifies
something closer to that — a specific AUTHENTICATED IDENTITY — at the
cost of the shared-device gap named above. **As presented in this
document, unbuilt, (g) is not yet in a different bucket from (d): both
are claims about what a NOT-YET-BUILT check WOULD do, and both have a
concrete, cited bypass of the check as currently scoped.**

## 4. The device-check card

PR1.5 no longer ships NO surface of its own — the P1a-device fix round
added a dev-only, build-time-flag-gated probe card
(`src/monitor/Concept2LinkProbe.tsx`, `VITE_ENABLE_C2_LINK_PROBE`, folded
out of any normal build — `pnpm dist:grep`'s eighth needle proves it)
specifically to check the modal-return signal (fix round 2, P1a) on a
real device ahead of PR2. Exact operator steps:
`docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`. That walk
checks the RETURN signal only — it opens a dev URL
(`log-dev.concept2.com`), never a real Concept2 login, so it proves
nothing about this document's ruling and is not a substitute for it.

**On the walk build, one extra observation is available but is UX
evidence only, not a security data point (fix round 7 correction, so a
later reader doesn't restore the false framing):** whether Concept2's own
sign-in page (`log-dev.concept2.com`) loads visibly fresh on a SECOND
`Browser.open` in the same walk session, or looks cached compared to the
first, is useful for PR2's copy about what the second-visit consent
screen feels like. It says nothing toward §2's revised open question,
which is about OUR OWN not-yet-built `/start` cookie surviving ONE
continuous `SFSafariViewController` session — not about Concept2's own
cookies persisting across two SEPARATE presentations, a different
question. No substitute check exists until `/start` is built (see the
walk card's own "Also worth a glance" section, which already carries this
correction).

Still owed, and this time genuinely blocked on which option James picks:

- The callback's "Linked"/"Continue" page (whatever copy the ruling below
  settles on) renders as designed after a REAL consent grant, not the dev
  probe's fake URL.
- **If either half of (d) is chosen: a REAL device measurement of whether
  a cookie set by `/start` survives the full `/start` → C2 → `/callback`
  round trip inside `SFSafariViewController`.** §2's revised credential
  fact only establishes this is PLAUSIBLE, not proven — this is the
  measurement that turns the browser-bound continuation from a plausible
  design into a verified one, and it cannot happen before `/start` exists
  to test.
- If (c) or (d) is chosen: the Confirm/Continue tap's interaction with the
  return signal (§3's finding 7) needs its OWN device check before PR2
  ships, not an assumption.

## 5. Antagonist pass — full TRIAD, REVISE (round 3); scoped re-reviews
at rounds 5-7

**Full pass 2026-09-01 at `303987ab`, verdict REVISE, all findings folded
in fix round 3 (this text is the fold, not a separate report).** AUTH
triggers CLAUDE.md's TRIAD override regardless of phase position — this
PR's account-injection question is squarely that, so this was never
eligible for a phase-anchor skip once fix round 2 existed. Findings
against this document specifically (code findings against
`useReturnToApp`/`Concept2LinkProbe`/the walk card are recorded in their
own files' fix round 3 commits): §1's bounds were uncited (now §1,
bullets 3-4), the blast radius was never stated (now §1a), (b)'s cost
line had the disclosure direction backwards (now corrected inline), (c)
never named its collision with PR1.5's own return signal (now added
inline), and three option classes were missing entirely (now (d), (e),
(f)).

**Scoped re-reviews, rounds 5-7, folded into this revision (current
state — see the revision history above for what changed when):** (d) as
originally written is detection-grade only — the attacker can construct
and hand out C2's raw, publicly-shaped authorize URL directly, bypassing
any interstitial on our own origin entirely, since the callback has no
way to tell whether a browser visited `/start` first. A browser-bound
continuation cookie closes that specific bypass, but it proves only that
a browser visited `/start`, never who is driving it — round 7
reclassified it into the SAME bucket as (c), physically-confirm,
correcting round 5's own "true prevention" label. §2's absolute "never
carries a session" claim was narrowed twice: round 5 first speculated
that the phone's own Safari cookie jar might carry a prior web session
in; round 7 fetched Apple's own SFSafariViewController documentation
(PRIMARY, quoted at §2) and dropped that speculation outright — nothing
in Apple's docs supports it, and the continuation cookie's plausible
mechanism needs no cross-app sharing at all, only ordinary same-session
persistence, still unmeasured on-device. (c) remains relabeled as
informed physical confirmation, never authentication of the consenting
principal, matching what it actually proves.

## 6. Stop

This is the evidence; it is not the decision. **James's ruling is owed
here — corrected, round 7, finding 3, extended round 9, corrected again
round 10 (F1): choose from ACCEPT / DETECT / PHYSICALLY-CONFIRM /
APP-BIND, not "accept / detect / prevent"; no BROWSER-side option in
this document prevents in the cryptographic-identity sense, and (g), AS
WRITTEN, does not either — it needs attempt-surface binding built
FIRST (§3's round 10 correction) before its own
`attempt.userId === req.user.id` check can even be reached on the attack
path this whole document is about.** Accept (a); add detection (b) or
(d)'s original interstitial half (two strengths); add a physical-confirm
requirement via (c) or (d)'s browser-bound-continuation half (also two
strengths); add app-bind via (g) — the repo's own Branch B shape,
requiring `attempt.userId === req.user.id` at an authenticated app-return
exchange, PLUS the surface-binding column and dual-route enforcement §3
now names as a precondition, not an optional extra; turn the (e) dial
(alone or combined with anything else); add the (f) constraint; or some
combination — and if `ALLOWED_EMAILS`'s current scope is itself part of
the answer, say so. No PR1.5 code implements any of (a)-(g); PR1.5 is
plumbing (and, as of fix round 2, a dev-only on-device probe) only.
**Either half of (d), OR (g), if chosen, changes PR1.5's own contract
with PR2** (§3) — say so explicitly in the ruling if that is the
direction, since it is not a PR2-only change the way (b)/(c)/(f) are;
(g) changes it more fundamentally still, since it changes what redirect
KIND `openExternalUrl` is even handed, AND (round 10) needs a real
migration to be a genuine option at all, not merely a route addition.
**If the browser-bound-continuation half of (d) is chosen, it
additionally needs the deliberate-action, anti-framing, and
one-time/clearing requirements §3 now names, plus the device measurement
in §4, before it can be trusted in production** — a design this session
judged plausible, not one it verified, and — round 7 correction — one
this session no longer calls "prevention." **If (g) is chosen, it needs
C2's own approval of a new `redirect_uri`, AND the surface-binding
migration and dual-route check (round 10), before any of it can be
trusted to bind anything — a real external dependency AND a real
stored-shape change the other options mostly do not have.**
