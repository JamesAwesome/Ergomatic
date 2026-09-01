# PR1.5 design gate — the account-injection ruling

**What this is:** the evidence package for the ruling the design spec
flagged as owed (`docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
§Architecture 3, Branch A: "SUSPECTED, decision owed (PR1 premise pass,
2026-08-31)"). Everything below is derived from code read this session or a
committed measurement; the three options are presented neutrally with their
costs. **This document does not choose one — that is James's ruling, asked
for at the end.**

**Fix round 2 (P1b), rebuilt §3 only:** the reviewer caught that the
original (b)/(c) below were built around the WRONG principal. The link
lands under the ATTACKER's userId (`attempt.userId` in §1's own residual),
so:
- **(b) as originally written was dead:** it proposed surfacing the linked
  identity on the VICTIM's own `GET /api/concept2/link` / linked-card — but
  in the attack scenario, the victim's OWN account was never touched; the
  attacker's account is what gained a foreign link, and the attacker has
  every reason not to look or to unlink quietly. The victim has no card to
  see anything on.
- **(c) as originally written was dead the same way:** it proposed the
  app's "own authenticated session" confirming on next foreground — but
  the only session that IS authenticated for `attempt.userId` belongs to
  the ATTACKER, who would simply confirm their own attack. The victim,
  who is the only party with any incentive to refuse, never sees that
  confirm at all.

§3 below is rebuilt around the ONE party actually present at the moment
that matters: the CONSENTING PRINCIPAL — whoever is sitting at Concept2's
consent screen and then lands on OUR callback page in that SAME browser.
That is the only surface any detection or confirmation can reach, because
it is the only surface the consenting principal ever touches. §1 and §2
are unchanged (the residual and the credential fact were never in
question — only where detection/prevention could live).

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

## 3. The options, with costs (rebuilt around the consenting principal)

Every option below is verified against `server/routes/concept2.ts`'s
actual callback route (lines 173-221 as read this session), not asserted.
Three load-bearing facts about that route, all cited because (b)/(c)
depend on them:

- The attempt row carries `userId` and `weightClass` ONLY — no email
  (`server/stores/concept2.ts:181-196`, `consumeAttempt`'s `RETURNING`
  clause selects exactly those two columns). Rendering an identity on the
  callback page therefore needs a NEW lookup: `Concept2RouterDeps`
  (`server/routes/concept2.ts:21-33`) injects `store`/`logs`/`client`/
  `requireUser`/`now` — no user store — and `server/auth/users.ts` itself
  has no by-id lookup today (`findByGoogleSub`, `createUser`,
  `updateProfile` only, `server/auth/users.ts:5-26`). Both (b) and (c)
  below need this same new plumbing.
- `consumeAttempt` is ONE atomic `DELETE ... RETURNING`
  (`server/stores/concept2.ts:184-196`) that runs BEFORE the token
  exchange, on purpose: the route's own comment says "consumed before
  exchange even starts, so a retry after ANY later failure restarts at
  mint" (`server/routes/concept2.ts:193-195`). There is no "peek without
  consuming" method. A confirm-BEFORE-exchange design would have to
  either add one (reopening the retry-restarts-at-mint guarantee that
  comment protects) or confirm AFTER exchange, holding the written link in
  a not-yet-final state.
- `upsertLink` (line 213) — the actual write that creates the residual —
  runs BEFORE `LINKED_HTML` renders (line 220). Nothing today runs between
  "the account is linked" and "the browser sees success."

**(a) Accept the residual, bounded by `ALLOWED_EMAILS`.**
Unchanged from the original pass. Zero code. The population that can hold
an Ergomatic account today is the household allowlist
(`server/auth/allowlist.ts`) — a closed set the attacker scenario in §1
already has to be a member of (or compromise a member's device) to mint
an attempt at all. Revisit before any public opening.

**(b) Detection at the callback page itself: show the target identity
BEFORE the consenting principal leaves that page.**
After `upsertLink` succeeds, `LINKED_HTML` (line 83, currently the fixed
string "Linked. Return to the app.") renders instead: "Linked to
`<email of attempt.userId>`. If that is not your account, [contact
support / a plain-text explanation]." The consenting principal — the
person who JUST completed Concept2's consent screen, in that SAME
browser, is the only party who sees this, and it is shown to them
immediately, not buried in an app screen they may never open. This is
still detection, not prevention: the link is ALREADY WRITTEN
(`upsertLink` already ran, line 213) by the time this page renders — an
attacker who also controls that browser (the common non-attack case: they
minted their own attempt and are simply linking their own account) sees
their own email and nothing changes; a victim tricked into completing
consent for someone else's Ergomatic account sees a foreign identity
immediately, at the one moment they are actually looking at a screen.
**Cost:** the new user-lookup plumbing above (a `findById`-shaped method
plus a `users` dependency threaded into `Concept2RouterDeps` and its
mount site), and an HONEST INFORMATION COST that must be named plainly:
this displays an Ergomatic user's email to WHOEVER HOLDS THE AUTHORIZE
URL and completes Concept2's consent screen — not necessarily anyone with
an established relationship to that Ergomatic account. The nonce
(`concept2_auth_attempts.nonce`) was designed as a user-BINDING, never as
proof the bearer is AUTHORIZED to learn that user's identity (spec
§Data model, quoted verbatim: "the browser hop carries no credential; the
nonce is the user binding" — a binding, not a credential check). Whether
that disclosure is acceptable
is part of the ruling this document asks for, not something this option
resolves on its own.

**(c) Prevention at the callback page: the exchange completes, but the
link stays `pending` until the SAME browser confirms.**
The callback still exchanges the code and calls the C2 API (unavoidable —
that is how `me.c2UserId` is learned at all), but writes the link with a
new `pending` flag instead of live, and renders a page showing the SAME
target identity as (b) plus a **Confirm** button. That button POSTs back
to a new route, re-presenting a short-lived confirm token minted for this
attempt (NOT the original nonce — `consumeAttempt` already deleted that
row per the fact above) — only THEN does the link flip to live. Binding
is by the consenting principal being the one physically looking at that
page in that moment, not by any Ergomatic session (§2's credential fact
still holds: no session artifact exists in that browser on native
either way). If the button is never pressed, the `pending` row needs the
same kind of expiry `concept2_auth_attempts` already has (15 min, `ATTEMPT_MAX_AGE_MS`) — a
genuinely new GC concern, not free to skip. **Cost:** a real stored-shape
change (a `pending`/confirmed distinction on `concept2_links`, a new
confirm-token concept and route, migration), the SAME information cost as
(b) (the target identity is shown to the same population, at the same
page), a second network round-trip inside the SAME browser session before
the "Linked" state is final, and — unlike the dead (c) from the original
pass — a design that no longer contradicts `consumeAttempt`'s own
"restarts at mint on any failure" guarantee, because nothing about
attempt consumption changes; only what happens to the ALREADY-WRITTEN
link before it counts as final.

## 4. The device-check card

**Updated, fix round 2:** PR1.5 no longer ships NO surface of its own —
the P1a-device fix round added a dev-only, build-time-flag-gated probe
card (`src/monitor/Concept2LinkProbe.tsx`, `VITE_ENABLE_C2_LINK_PROBE`,
folded out of any normal build — `pnpm dist:grep`'s eighth needle proves
it) specifically to check the modal-return signal (fix round 2, P1a) on a
real device ahead of PR2. Exact operator steps:
`docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`. That walk
checks the RETURN signal only — it opens a dev URL
(`log-dev.concept2.com`), never a real Concept2 login, so it proves
nothing about this section's ruling and is not a substitute for it.

Still owed at the first PR2-era build (unchanged from the original pass):

- The callback's "Linked" page (whatever copy the ruling below settles on)
  renders as designed after a REAL consent grant, not the dev probe's
  fake URL.
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
is plumbing (and, as of this fix round, a dev-only on-device probe) only.

**Antagonist pass: <controller fills after the pass>** — fix round 2,
P2(i): this PR touches AUTH (the account-injection question this whole
document is about), which triggers CLAUDE.md's standing TRIAD override
regardless of phase position — the "spoken antagonist skip" this
document's earlier revision claimed (inherited from the phase anchor) no
longer applies. The controller runs the full antagonist pass against this
revised design separately from this fix round; its verdict replaces this
line rather than being appended beneath it.
