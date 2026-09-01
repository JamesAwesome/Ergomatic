# PR1.5 design gate — the account-injection ruling

**What this is:** the evidence package for the ruling the design spec
flagged as owed (`docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
§Architecture 3, Branch A: "SUSPECTED, decision owed (PR1 premise pass,
2026-08-31)"). Everything below is derived from code read this session or a
committed measurement; the six options in §3 are presented neutrally with
their costs. **This document does not choose one — that is James's ruling,
asked for at the end.**

**Revision history:**
- Fix round 2 (P1b) rebuilt §3 around the CONSENTING PRINCIPAL after the
  original (b)/(c) were caught targeting the wrong party (the victim's own
  session, when the link lands under the ATTACKER's userId).
- **Fix round 3, this revision:** the full antagonist TRIAD pass (verdict
  REVISE, full findings in §5) caught that §1 asserted the residual without
  citing its own two bounds, that the blast radius was never stated, that
  (b)'s cost line got the disclosure direction backwards, that (c) never
  named a real cross-document conflict with PR1.5's own return-signal
  fix, and that three cheaper/different option classes were never
  considered. All folded in below, every claim cited against the actual
  code read this session.

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

## 1a. The blast radius — what James is actually weighing

Not previously stated. If the residual fires:

- **What the attacker gains, and how durable it is:** the victim's
  Concept2 `accessToken` AND `refreshToken`
  (`server/db/schema.ts:478-480`), plus `c2UserId` (surfaced to the
  attacker's own session via `GET /api/concept2/link`,
  `server/routes/concept2.ts:246`). This is not a one-time leak: the
  refresh path (spec §Architecture 6, `needsReauthAt`) keeps the tokens
  ALIVE indefinitely unless C2 itself invalidates them — the attacker's
  access does not expire on its own.
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
  The only real remedy is the victim changing their C2 PASSWORD or using
  whatever session-revocation Concept2's OWN account settings offer
  (outside this app entirely, unverified this session — Concept2's own
  settings UI was not fetched).
- **The victim's OWN link, if they have one, is undisturbed.**
  `concept2_links.userId` is the PRIMARY KEY (`server/db/schema.ts:473-477`)
  and `c2UserId` carries no unique constraint — `upsertLink`'s own
  `onConflictDoUpdate` targets `concept2Links.userId`
  (`server/stores/concept2.ts:85-86`). The attacker's row (keyed on the
  ATTACKER's userId) and the victim's own row (keyed on the VICTIM's
  userId, if they ever make one) are two structurally independent rows —
  the attack does not overwrite or corrupt the victim's own data, it
  creates a SEPARATE row nobody but the attacker can see.

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

## 3. The options, with costs (six classes, a-f)

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

**(c) Prevention at the callback page: the exchange completes, but the
link stays `pending` until the SAME browser confirms.**
The callback still exchanges the code and calls the C2 API (unavoidable —
that is how `me.c2UserId` is learned at all), but writes the link with a
new `pending` flag instead of live, and renders a page showing the SAME
target identity as (b) plus a **Confirm** button. That button POSTs back
to a new route, re-presenting a short-lived confirm token minted for this
attempt (NOT the original nonce — `consumeAttempt` already deleted that
row) — only THEN does the link flip to live. Binding is by the consenting
principal being the one physically looking at that page in that moment,
not by any Ergomatic session (§2's credential fact still holds). If the
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

**(d) Prevention BEFORE anything is written: a pre-consent interstitial on
our OWN origin.**
Not in either previous pass. Today, `POST /api/concept2/connect` hands
the client `{ authorizeUrl: client.authorizeUrl(nonce) }` directly
(`server/routes/concept2.ts:168`) — C2's OWN URL, which PR1.5's
`openExternalUrl` opens as-is. Instead: mint returns OUR OWN URL,
`GET /api/concept2/start?state=<nonce>`; that route looks up the
attempt's target user (same new plumbing (b)/(c) need), renders "Linking
your Concept2 account to `j****@example.com` (masked). Continue?", and
only on a click/302 redirects to C2's real authorize URL. Nothing is
exchanged, written, or made pending — this happens entirely BEFORE
Concept2 is ever contacted, so `consumeAttempt`'s single-atomic-DELETE
shape, the attempt table, and its GC are UNTOUCHED. **Downside:** the
identity is shown WITHOUT a completed consent — i.e., before Concept2 has
verified anyone at all, which is why the email must be MASKED
(`j****@example.com`, not the full address) rather than shown in full
the way (b)/(c) can afford to once a real consent has happened.
**This option is LOAD-BEARING FOR PR1.5 ITSELF, not just a server-side
add-on:** it changes what PR2's card hands to `openExternalUrl` — the
OUR-ORIGIN start URL, not C2's raw authorize URL — which is exactly the
argument `openExternalUrl` takes today (PR1.5's own new code, this fix
round). Choosing (d) means PR1.5's contract with PR2 changes shape.
**Cost:** the same by-id user lookup (b)/(c) need, plus ONE new route; no
stored-shape change, no `pending` state, no GC beyond what already
exists, no `consumeAttempt` change.

**(e) Shorten `ATTEMPT_MAX_AGE_MS`.**
Not in either previous pass. One constant
(`server/routes/concept2.ts:38`), currently 15 minutes. Shortening it
(2-3 minutes, say) narrows §1's own bound 4 further, killing more of the
asynchronous-delivery surface (an attacker now has less time to get a
victim to complete consent after minting). **Composes with every other
option here** — it is not an alternative to (a)-(d)/(f), it is a dial any
of them can also turn. **Cost:** effectively zero — one line, no
migration, no new route. Trade-off: a legitimate user who mints, gets
distracted, and returns to consent later also has less slack.

**(f) `UNIQUE` constraint on `concept2_links.c2_user_id`.**
Not in either previous pass. Today (`server/db/schema.ts:477`) `c2UserId`
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

Still owed at the first PR2-era build:

- The callback's "Linked" page (whatever copy the ruling below settles on)
  renders as designed after a REAL consent grant, not the dev probe's
  fake URL.
- What the consent browser's cookie state offers on return to it a second
  time (a fresh Google/Concept2 login prompt, vs. a Safari-shared session
  skipping straight to consent) — UX evidence for PR2's copy, not
  security-load-bearing (§2 already establishes no Ergomatic session
  artifact is in play there either way).
- If (c) or (d) is chosen: the Confirm/Continue tap's interaction with the
  return signal (§3's finding 7) needs its OWN device check before PR2
  ships, not an assumption.

## 5. Antagonist pass — full TRIAD, REVISE

**Full pass 2026-09-01 at `303987ab`, verdict REVISE, all findings folded
this round (this text is the fold, not a separate report).** AUTH triggers
CLAUDE.md's TRIAD override regardless of phase position — this PR's
account-injection question is squarely that, so this was never eligible
for a phase-anchor skip once fix round 2 existed. Findings against this
document specifically (code findings against `useReturnToApp`/
`Concept2LinkProbe`/the walk card are recorded in their own files' fix
round 3 commits): §1's bounds were uncited (now §1, bullets 3-4), the
blast radius was never stated (now §1a), (b)'s cost line had the
disclosure direction backwards (now corrected inline), (c) never named
its collision with PR1.5's own return signal (now added inline), and
three option classes were missing entirely (now (d), (e), (f)).

## 6. Stop

This is the evidence; it is not the decision. **James's ruling is owed
here: accept (a), add detection (b), add prevention (c) or (d), turn the
(e) dial (alone or combined with anything else), add the (f) constraint,
or some combination — and if `ALLOWED_EMAILS`'s current scope is itself
part of the answer, say so.** No PR1.5 code implements any of (a)-(f);
PR1.5 is plumbing (and, as of fix round 2, a dev-only on-device probe)
only. **(d), if chosen, changes PR1.5's own contract with PR2** (§3) —
say so explicitly in the ruling if that is the direction, since it is not
a PR2-only change the way (b)/(c)/(f) are.
