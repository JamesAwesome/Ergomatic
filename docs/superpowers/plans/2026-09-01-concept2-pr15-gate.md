# PR1.5 design gate — the account-injection ruling

**What this is:** the evidence package for the ruling the design spec
flagged as owed (`docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
§Architecture 3, Branch A: "SUSPECTED, decision owed (PR1 premise pass,
2026-08-31)"). Everything below is derived from code read this session or a
committed measurement; the three options are presented neutrally with their
costs. **This document does not choose one — that is James's ruling, asked
for at the end.**

## 1. The residual, restated

Branch A's callback binds the exchange to the nonce alone
(`concept2_auth_attempts.user_id`, spec §Data model). Whoever's browser
completes the consent screen links THEIR Concept2 account to whichever
Ergomatic user minted the nonce. If an attacker mints an attempt on their
own Ergomatic account and gets the resulting authorize URL in front of a
victim (any channel — a link, a QR code, a shared device), the victim's
Concept2 login ends up linking the ATTACKER's Ergomatic account, not the
victim's own. Bounded today by two things only: `ALLOWED_EMAILS` (the
household allowlist gating who can hold an Ergomatic account at all) and
the `C2_LINK_ENABLED` dark flag (PR1's availability gate, spec
§Architecture 8) keeping the whole feature off until James turns it on.

## 2. The credential fact, code-derived

**Claim:** the consent browser (Branch A opens it via
`adapters/externalBrowser.ts`'s `openExternalUrl`, PR1.5's own new code)
can never carry an Ergomatic session on native, so a cookie-based
mitigation — the standard web fix for exactly this class of bug — has
nothing to attach to on that platform.

- `app/src/api.ts:5-8` (comment, quoted verbatim): "All API calls go
  through here: native builds get the absolute base URL and the Keychain
  bearer; web stays relative with cookie auth." Native auth is a bearer
  token attached per-request as an `Authorization` header
  (`app/src/api.ts:14-17`), never a cookie.
- `app/src/native/session.ts:6-9`: the token itself lives in
  `@aparajita/capacitor-secure-storage` (the iOS Keychain), read via
  `getStoredToken()` — there is no `document.cookie`, no cookie jar
  shared with any browser surface, for the Ergomatic app to set in the
  first place on native.
- The consent browser is `SFSafariViewController`
  (`src/native/externalBrowser.ts`'s own doc comment, PRIMARY:
  "On iOS, this uses SFSafariViewController.",
  https://capacitorjs.com/docs/apis/browser). It is a distinct browser
  process from the WKWebView the Ergomatic app itself runs in; it has
  access to neither the app's Keychain entry nor (on native) any cookie,
  because none exists to have access to.

**Conclusion (tag: PRIMARY, derived from our own code, not the vendor
doc):** on native, there is no session artifact anywhere in the consent
flow for the callback to check against the minting user. A
cookie-binding fix — "only accept the callback if the browser also
presents the minting user's session cookie" — has nothing to bind on this
platform, full stop. (The Apple process-isolation page that would describe
SFSafariViewController's sandboxing in Apple's own words was not fetched
this session; nothing above rests on it — the argument is closed by our
own code alone.)

**Web is different and out of scope for the residual as stated:** web's
callback runs in the same browser as the app, cookie auth already exists
there (`api.ts:5-8`'s "web stays relative with cookie auth"), and Branch B
was never in play for web either way (spec §Architecture 3: "Web keeps
the https callback (cookie exists there)"). PR1.5 is Branch A + native
only (Global Constraints); this gate package's native focus matches PR1.5's
own scope, not an oversight of the web case.

## 3. The options, with costs

**(a) Accept the residual, bounded by `ALLOWED_EMAILS`.**
Zero code. The population that can hold an Ergomatic account today is the
household allowlist (`server/auth/allowlist.ts`) — a closed set the
attacker scenario in §1 already has to be a member of (or compromise a
member's device) to mint an attempt at all. Revisit before any public
opening (an unbounded `ALLOWED_EMAILS`, or its removal, changes this
calculus completely and should re-trigger this same question).

**(b) Detection: surface the linked identity, let the rower notice.**
`GET /api/concept2/link` already returns `c2UserId` as of PR1
(`server/routes/concept2.ts:246`, with its own comment: "PR2 needs the
linked account's identity to render the sent-state contract... and to
build the View-on-Concept2 URL"). PR2's linked-state card and the
callback's own "Linked." page (spec §Architecture 3, item 3) both have a
natural place to show that identity — a name or email the rower
recognizes, or fails to. A victim whose OWN account got linked to a
foreign Concept2 identity sees a Concept2 account that is not theirs and
can unlink (`DELETE /api/concept2/link`, `server/routes/concept2.ts:251`).
Cost: copy-level only — no schema change, no new state. Does not prevent
the mislink, only makes it visible after the fact; relies on the rower
looking.

**(c) Prevention: an in-app confirm after consent.**
The link lands in a new `pending` status instead of live; the app's own
authenticated session (the Keychain bearer, back on native ground) has to
confirm it on the NEXT foreground, closing the exact gap §2 identifies
(the confirm step happens in the app's own session, not the browser's).
Cost: a stored-shape change (a status column or equivalent on
`concept2_links`, a migration, a new confirm route) and a second
deliberate tap for every legitimate link, every time — the common case
pays a tax to close an edge case bounded today by (a) already.

## 4. The device-check card (first PR2-era build)

PR1.5 ships no surface of its own — nothing to observe on a device until
PR2's card exists to trigger `openExternalUrl` and render the outcome.
Recorded here so the first PR2 build's walk knows what to check:

- `Browser.open` actually presents `SFSafariViewController` (not a bare
  Safari app-switch) when `openExternalUrl` fires on a real device.
- The callback's "Linked. Return to the app." page renders as designed
  after a real consent grant.
- The foreground re-fetch (`useForegroundRefetch`, PR1.5 Task 2) actually
  fires `GET /api/concept2/link` again when the rower backgrounds
  Safari-view and returns to the app — the `pause`/`resume` signal this
  gate's §2 argument does NOT depend on, but PR2's UX does.
- What the consent browser's cookie state offers on return to it a second
  time (a fresh Google/Concept2 login prompt, vs. a Safari-shared session
  skipping straight to consent) — UX evidence for PR2's copy, not
  security-load-bearing (§2 already establishes no Ergomatic session
  artifact is in play there either way).

## 5. Stop

This is the evidence; it is not the decision. **James's ruling is owed
here: accept (a), add detection (b), add prevention (c), or some
combination — and if `ALLOWED_EMAILS`'s current scope is itself part of
the answer, say so.** No PR1.5 code implements any of (a)/(b)/(c); PR1.5
is plumbing only (Global Constraints, "spoken antagonist skip: inherits
the phase anchor; no new invariant class in the plumbing").
