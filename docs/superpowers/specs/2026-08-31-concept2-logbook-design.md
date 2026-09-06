# Wave E — the Concept2 logbook (design)

**Date:** 2026-08-31 · **Status:** REV 2, MERGED #244; corrections folded
2026-09-01
(rev 1 was revised at the anchor pass — verdict REVISE, three kill-shots;
the corrections are folded in below and the vetted ground is recorded)
**Wave:** E (ROADMAP "Wave E — The Concept2 logbook", opened 2026-08-31)
**Risk class:** TRIAD — auth (OAuth tokens) and stored shapes (a new table,
new columns, a new POST field). Full antagonist anchor (done, 2026-08-31)
+ PM bookends (open gate done, GO-WITH-CONDITIONS) + per-PR triad gates.

## What and why

This wave puts one of our rows in front of the authority we have been
reasoning about for two phases without ever talking to: Concept2's logbook.
Two deliverables. First, the desk-side cross-connect Phase RC carried
forward as exit criterion (d) — post a reconciled row to
`log-dev.concept2.com`, pull `export/` back, and diff it against what we
stored. Second, the rower-facing surface: a "Connect to Concept2" card on
You (OAuth link, asking the rower nothing — see the 2026-09-03 ruling
below) and a manual "Send to Concept2" action on a monitor-connected
`finished` log row. Manual first; auto-upload is a named follow-on, not
part of this wave. The point of the order: the mapping AND the link flow
are proven against the sandbox before any tester can press a button that
exercises them.

## Decisions already made (James, this brainstorm, 2026-08-31)

- **In-app surface is IN scope** for the wave, not just the desk harness.
- **Manual per-row send first**; auto-upload is the follow-on phase.
- **Monitor-connected `finished` rows only** are sendable. Manual logs and
  terminated rows are not, this wave.
- **Production API key exists**; James provides it when ready. One open
  check when it lands: C2 requires explicit approval for the live write
  API ("please contact Concept2 for approval for the live API"), so
  confirm the credential pair is write-approved.
- **`weight_class` ruling, REPLACED (James, 2026-09-03).** The former
  ruling (2026-08-22, RC phase open) was "a binary H/L asked ONLY at
  Concept2 link time, never at onboarding". It no longer stands. The
  ruling now is, verbatim: **"I don't want that set in our app. I want it
  to be set on Concept2's side."** The app asks nothing about weight class
  anywhere — not at onboarding, not at link, not at send, not on the dev
  probe — and stores nothing about it. **A second ruling, 2026-09-04,
  verbatim: "Stop talking about the weight class."** The app does not
  MENTION it either: the You card's helper line and the SENT state's
  provenance sub-line are both withdrawn. The one rendered exception is the
  send refusal (surface 2's `no_weight_class` state), where Concept2 has
  refused the row for that reason and a refusal that will not say why is
  worse than the words. Concept2's API leaves us no choice
  about SENDING one: a result POSTed without the field is refused, measured
  2026-09-03 against log-dev (user 2211, PR0 harness token), verbatim body
  `{"message":"Could not create new result.","status_code":422,"errors":{"weight_class":["The weight class field is required."]}}`,
  with a same-row control carrying `weight_class:"H"` answering 201
  (result 85831, deleted afterwards). So the class is READ FROM CONCEPT2 on
  each send and discarded with the response, in this producer order:
  **(1) the rower's own most recent DECLARATION** — the newest of their
  recent results whose `weight_class` reads H or L, which is the producer
  Concept2 itself uses (§Research), **excluding every result this app
  itself wrote**; **(2) failing that, OUR derivation**
  from the profile's `weight` + `gender`, behind a plausibility band;
  **(3) failing that, refuse the send** (422 `no_weight_class`) and tell the
  rower where to fix it. **WE NEVER READ OUR OWN WRITES BACK AS THE
  DECLARATION** (invariant I4c): Concept2's list contains the rows we
  posted, its 201 echoes the class we sent, and no field marks a row as
  ours — so without the exclusion a derived guess returns as producer 1 on
  the next send, relabelled as the rower's declaration, and the one line
  that makes it correctable goes silent. A page whose only rows are ours is
  NO declaration, and the send falls through to the derivation exactly as
  if the list were empty. A **failed** read is not an empty one either: it
  is retryable, never a silent fall-through to the guess. The class is
  **never cached** — a declaration can
  change on Concept2 at any time with no signal to us, and a stale one
  writes a wrong competition category into a record we cannot edit. **The
  SENT state names NEITHER the class nor its producer** (2026-09-04 ruling,
  above): the rower sees the result id and nothing else. The class and the
  producer that supplied it stay on the route's 200 and in the send's log
  line, so an operator can still answer which one answered. The cost the
  ruling accepts, stated: a DERIVED class is a guess about a fact Concept2
  lets its owner set, Concept2 permits per-result editing, and nobody now
  sees the guess as it is written. Migration 0023 drops
  `concept2_links.weight_class` and `concept2_auth_attempts.weight_class`.
  Implementation: `docs/superpowers/plans/2026-09-03-concept2-pr2-client.md`
  Task 3.

**Operator steps (anchor F5) — DONE 2026-08-31:** James supplied the dev
credential pair (`LOGBOOK_CLIENT_ID_DEV`/`LOGBOOK_CLIENT_SECRET_DEV` in
the root `.env`), registered `http://localhost:8199/c2-callback` in the
log-dev API-key portal, and authorized with a log-dev account (user
2211). Values never enter a transcript or a committed file. The two
operator residuals from the #244 review are CLOSED (2026-08-31): the
single-process state receipt is committed in the PR0 report, and the
census was recounted on the full predicate (6 of 20).

## Research record

Gathered 2026-08-31 from the single-page official doc at
`https://log.concept2.com/developers/documentation/`; extended at the
anchor pass (full POST parameter enumeration, response-object fields,
native redirect example). PRIMARY unless tagged. "Nothing found" entries
are results.

- **Grants:** "The OAuth Grant types implemented are Authorization Code,
  Refresh, Client Credentials and Password." Ordinary apps get
  Authorization Code + Refresh. **PKCE: nothing found** — no "PKCE" or
  "code_challenge" on the page; `client_secret` is Required: **Yes** at
  the token endpoint. **The secret cannot ship in an app bundle, so our
  server performs the code exchange and holds tokens** (vetted ground V2).
- **Native clients are expected:** the token endpoint's own `redirect_uri`
  example is **`myiphoneapp://oauth/callback`** — a private-use scheme.
  RFC 8252 §8.12 (BCP 212): "native apps MUST NOT use embedded
  user-agents to perform authorization requests"; §6 recommends in-app
  browser tabs. The authorize leg therefore runs in the SYSTEM browser /
  in-app browser tab on iOS, never the WebView.
- **`state`: NOT DOCUMENTED on C2's page (anchor F4) — MEASURED ECHOED,
  DURABLY (single-process re-auth 2026-08-31, sha256 equality receipt
  committed in the PR0 report; the harness enforces state and aborts
  before exchange on mismatch, abort path mutation-proven).**
  **Branch A is CONFIRMED as the wire fact.** §Architecture 3 uses this
  fact (not a fallback) as the basis for a single ruled hybrid completion
  design — see there for the mechanism, which is per-surface for
  principal-binding reasons, not because Branch A failed. Other PR0
  measurements: dedup is DATETIME-GRANULAR to the
  second and the 409 body names the colliding result id; dates ~3+
  days in the future are 422-rejected; a zero-rest `VariableInterval`
  post is accepted (F11 answered: omission never forced); the raw
  0x003F bytes are NOT C2's `verification_code` format (201 with
  `verified: false`, silently ignored); the logbook web URL is
  `/profile/{c2_user_id}/log/{result_id}` — the link-out needs both
  stored ids. **The ErgData-coexistence consequence is an INFERENCE**
  from second-granularity plus the wire date's minute resolution, not
  an observed ErgData post; PR2's duplicate-warning copy rests on it
  and the direct observation (post the same physical row from ErgData)
  remains open. Full evidence: `docs/monitor/c2-crossconnect-2026-09/`.
- **Scopes:** request `user:read,results:write` EXPLICITLY ("Do not rely
  on passing nothing as a scope"); scopes can narrow later but never
  widen (V4).
- **Token lifetimes:** access per `expires_in` (documented example 604800
  = 7 days); refresh "currently one year" and ROTATES — "as well as a new
  access_token, you will also get back a new refresh token" — so the pair
  is replaced atomically on every refresh (V3).
- **POST results:** `POST /api/users/me/results`. The FULL accepted
  parameter list (anchor pass enumeration): `type, date, timezone,
  distance, time, weight_class, comments, privacy, workout_type,
  stroke_rate, heart_rate, stroke_count, calories_total,
  wattminutes_total, drag_factor, rest_distance, rest_time, verified,
  verification_code, workout, stroke_data, metadata`. Required: `type`,
  `date` ("this should be the date as stored in the monitor, which is the
  end of the workout, NOT the beginning" — and it is LOCAL wall-clock:
  the result object carries `timezone` and `date_utc` beside it, and
  **`timezone` is an accepted POST parameter**), `distance` ("work
  distance only"), `time` ("Time in tenths of a second… work time
  only"). `weight_class`: "Required if type is rower, dynamic or slides.
  Value must be either H or L". `rest_time`/`rest_distance`: Required
  **Depends** — "For interval workouts only." `workout_type`: Required
  **No**. `workout` (the splits/intervals object): Required **No**, so a
  summary-level post is valid (V6) — but each interval object inside one
  requires `type` and `rest_time` per interval (V7). Tenths of a second
  everywhere. Work-only `distance`/`time` with rest split out is exactly
  RC-1's split (V12).
- **Dedup:** "the Logbook filters for duplicate workouts, so will return
  a Duplicate Entry error if you post a workout which has the same date,
  time and distance as an existing workout"; "409 Duplicate result" (V9).
  Loud, survivable. **Unknown: `date` granularity in the key** — and note
  the repo's own settled residual
  (`docs/monitor/pm5-ble-ecosystem-review.md:391`, row (i)): the PM5's
  log-entry wire date is MINUTE-resolution while C2 stores seconds, so
  the wire can never supply a second-granular dedup key. Probed at PR0
  with pre-committed responses (below).
- **Verification:** `verification_code` optional; "For the verification
  code to be accepted, the date, time, distance, workout_type and machine
  type must match that of the code." `verified` is trusted-clients-only.
  We store `verificationBytes`; format match UNPROVEN — PR0 stretch
  probe, and MOOT until the `date`/timezone mapping is right (anchor K3).
- **Export:** `GET /api/users/{user}/results/{result_id}/export/{type}`,
  `csv`/`fit`/`tcx`. **MEASURED LIVE 2026-08-31, replacing this bullet's
  original doc-derived claim:** the result object DOES return top-level
  `rest_time`, `rest_distance` and `stroke_rate` (both on the POST echo
  and a fresh GET of result 85557) — the earlier enumeration that omitted
  them was wrong, and the diff oracle sees every field we send. `export/`
  itself is CLOSED to this wave's rows: all three types 404 with
  "Stroke data not found" on any row without `stroke_data`, so CSV
  columns stay unrecorded until the stroke-data follow-on. Evidence:
  `docs/monitor/c2-crossconnect-2026-09/`.
- **Edit/delete:** PATCH/DELETE exist; DELETE "cannot be undone". Unused
  this wave. **Rate limits:** none currently. **Webhooks** exist — noted
  for the auto-upload follow-on. **No token-revocation endpoint** —
  nothing found; unlink is necessarily local (V5).
- `GET /api/users/me` returns **sixteen** fields, and `weight` is one of
  them — measured live against log-dev on 2026-09-03 (user 2211, PR0
  harness token): age_restricted, country, dob, email, email_permission,
  first_name, gender, health_data_permission, id, last_name,
  logbook_privacy, max_heart_rate, profile_image, roles, username,
  **weight**. **This REPLACES V10** ("returns 13 fields, none of them
  weight — `weight_class` must be asked by us"), which was wrong on its
  count and on its conclusion: the class never had to be asked. There is no
  `weight_class` field on the user object, and Concept2's API does not apply
  the profile's Weight Class default on our behalf — the 422 in the ruling
  bullet above is that measurement. **But `weight` + `gender` is the
  FALLBACK producer, not the primary one — see the next bullet, which
  supersedes an earlier revision of this spec that made the derivation
  primary.** Also measured the same day: `/api/users/me/preferences`,
  `/settings` and `/profile` all answer 500 HTML, so there is no readable
  profile default.
- **Concept2 says the profile weight does NOT determine the class; the
  rower DESIGNATES it, per piece.** Logbook help, verbatim (SECONDARY — the
  help page 403s to fetchers, so this is a search snippet of Concept2's own
  text, 2026-09-03): *"Lightweight and heavyweight are weight categories
  from the world of on-water rowing. **Even though you may have entered a
  weight in your profile, you must designate L or H for every piece that
  you enter.**"* Corroborated three ways: Concept2's own Utility documents a
  "Weight Class Default" setting SEPARATE from weight
  (archived.concept2.com); ErgData carries its own Weight Class setting,
  and a c2forum thread (t=205661) is a rower complaining ErgData uploaded
  **H** despite their Lightweight setting; and the API's Edit User surface
  exposes `weight` and no `weight_class`. **Consequence:** a rower whose C2
  default is L and whose profile weight is 76 kg would get **H** from a
  weight-derived design, and their Ergomatic rows would sit in a different
  ranking category from every row they log through ErgData or the website.
  Who would be wrong: us.
- **The declaration is readable, and one small page is one cheap round
  trip.** MEASURED 2026-09-03 against log-dev (user 2211, a token whose
  scope is the production `user:read,results:write` — nothing here widens a
  scope): `GET /api/users/me/results?number=1` → 200; **every result in the
  list carries `weight_class`**; the list is DATE-descending (id 85561 dated
  `2026-09-02 10:00:30` sorted ahead of id 85562 dated
  `2026-09-02 10:00:00`); pagination is `meta.pagination` with `total`,
  `count`, `per_page`, `current_page`, `total_pages`, `links.next`.
  `?type=rower` is ACCEPTED but UNPROVEN as a filter (every row on this
  account is already `rower`), so selection is on the FIELD, never the
  query. Latency medians from a dev laptop, 5 samples each: `?number=1`
  216 ms, `?number=5` 221 ms, `/users/me` 220 ms. **UNMEASURED:** whether a
  non-rower result carries a class at all — exit criterion 3b settles it
  with one glance.
- **The UNIT of `weight` is UNMEASURED and Concept2's docs contradict
  themselves about it.** The only published line sits on the CREATE USER
  endpoint (`https://log.concept2.com/developers/documentation/`, fetched
  2026-09-03), verbatim: *"weight | No | integer | The weight in decigrams
  for the user, e.g. 7500 for 75kg. Defaults to null if not set. | 7500"*.
  7500 decigrams is 750 g, so the sentence's unit NAME and its EXAMPLE
  disagree; the example is the half that pins a correspondence (one unit =
  0.01 kg). **PRIMARY for the write parameter, INFERENCE for the read
  field** — nothing states `GET /users/me` echoes the same encoding, and
  the account we can measure carries `weight: null`. The derivation's
  constants therefore carry the unit in their identifiers, AND the
  derivation runs a PLAUSIBILITY BAND (30-300 kg in the assumed unit) on the
  raw number before classifying. Tabulated for a 75 kg rower: decigrams
  750000, grams 75000, integer kg 75 and integer lb 165 all fall outside and
  refuse loudly — which matters most for the two integer readings, since
  they would otherwise class EVERY rower lightweight and file heavyweights
  in Concept2's lightweight rankings. **The band cannot catch a
  hundredths-of-a-pound reading (16530), and no band can:** a 2.2x error is
  inside any range wide enough to hold real rowers. That residue is what
  exit criterion 3b's two readings settle, and it is bounded by the producer
  order — a rower who has declared a class never reaches the derivation.
- **Concept2's lightweight definition** (SECONDARY — logbook help and
  forum, 2026-09-03; the help page 403s to fetchers, so this is a search
  snippet): men 75 kg / 165 lb or less, women 61.5 kg / 135 lb or less,
  heavyweight above, RowErg only. "or less" is inclusive.

**Does the underlying system have the concept?** Everything we surface is
a concept C2 itself owns: result creation, the H/L weight class (which is
C2's to set, not ours — 2026-09-03 ruling), work-only
totals, duplicate rejection, export, native-app OAuth. The two things WE
invent, named: the per-user LINK record and the per-row SENT state. The
sent state's authority and lifetime are declared honestly below (anchor
F8): it is a record of a past accepted post, not a live claim about
Concept2's present.

## Architecture

**Server broker for secrets; no app credential enters the CONSENT
BROWSER** (corrected, PR1.5 fix round 13 — this used to read "no app
credential anywhere in the native path," which the ruled design below
directly contradicts: the native completion leg deliberately carries the
app's own Keychain bearer, at the authenticated exchange call. The
invariant that actually holds — and what round 7's own narrowing, "no
cookie anywhere" → "no app credential anywhere in the native path," was
reaching for without quite landing on — is narrower and still true:
nothing the app holds, Keychain bearer or `erg_session`, ever enters the
SYSTEM/in-app browser that renders C2's own consent screen. The
design-gate ruling
(`docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md` §3(d)) may yet
add a PURPOSE-BUILT, non-credential cookie to that browser hop; even
that would never be an app credential). The anchor pass killed rev 1's
redirect-chain flow: native auth is a Keychain bearer attached by
`api.ts` to fetches — a top-level WebView navigation carries no
credential, `CapacitorHttp` follows redirects into a JS string, and the
callback browser has no session to bind. Google sign-in's native plugin
flow (`docs/deploy.md:105-108`) is the in-repo precedent; C2 has no SDK,
so we build the RFC 8252 shape:

1. **Mint:** authed `POST /api/concept2/connect` (bearer or cookie —
   works on both surfaces), with **no rower attribute in the body** (the
   2026-09-03 ruling; native additionally declares `linkClient`, a claim
   about the BUILD). Server creates a
   short-lived single-use `concept2_auth_attempts` row `{nonce, user_id,
   surface, created_at}` — `surface` (`"native"` | `"web"`,
   new column, gate doc §3(g) round 10) records which caller minted the
   attempt, so a nonce minted for one surface cannot complete on the
   other — and returns the surface-appropriate authorize URL. No
   credential needs to survive the browser hop: the nonce correlates the
   return to the attempt, and the identity check in step 3 is what makes
   the binding real (surface enforcement alone is route integrity, not
   principal authority — gate doc §3(g) round 12).
2. **Consent:** client opens the URL in the SYSTEM browser / in-app
   browser tab (`@capacitor/browser` on native — new dependency, version
   verified at add time; plain navigation on web).
3. **Return — one measured hybrid, both mechanisms used together, not
   two contingency designs chosen between (anchor F4):** PR0's `state`
   probe measured **Branch A — C2 DOES echo `state`**
   (`docs/monitor/c2-crossconnect-2026-09/README.md` "Auth +
   state-echo probe": sha256 equality receipt, single-process re-auth,
   2026-08-31): `redirect_uri` is our https callback, C2 sends `code` +
   `state` there, and the server resolves the attempt row by nonce. That
   wire fact settles the state-echo question for **Branch A's mechanism
   (the https callback, below, used for web)**; it does not by itself
   decide whether native also needs its own completion mechanism, which
   is a principal-binding question, not a state-echo one — **Branch B
   (the native private-use-scheme + `appUrlOpen` mechanism, corrected
   round 13 — this used to be paired with the false parenthetical "C2
   does not echo state," and framed as Branch A's mutually-exclusive
   alternative; the state-echo wire fact never bore on whether native
   needs its own scheme at all)** is used for native regardless of the
   state-echo result, because it is what lets the app hold and present
   the Keychain bearer at an authenticated exchange call:
   - **Native (Branch B)** completes through a private-use scheme
     (Info.plist): C2 redirects to
     `haus.waffle.ergomatic://oauth/callback?code=…&state=…` (state is
     EXPECTED but UNMEASURED on this redirect kind — **corrected fix
     round 15: the "per the measured wire fact" wording here promoted
     PR0's web-callback receipt to a redirect it never touched.** The
     committed receipt
     (`docs/monitor/c2-crossconnect-2026-09/README.md:29-49`) measured
     ONE mechanism, the HTTPS web callback (`redirect_uri` = our own
     origin), via a single-process re-auth against `log-dev`; it says
     nothing about whether C2 echoes `state` on a DIFFERENT `redirect_uri`
     registered as a private-use scheme, which has never been probed.
     Native does not need the echo to disambiguate WHICH redirect it
     received — the app itself received it directly — but **corrected
     2026-09-01: it is still load-bearing, for a different reason than the
     one this paragraph previously argued away.** The only designed native
     exchange call is `appUrlOpen` posting `{code, state}` to authed
     `POST /api/concept2/exchange` (below), and that route has no other
     way to LOCATE the attempt row to consume: `state` is the lookup key
     (same as the https callback's `consumeAttempt(state, ...)`). If C2
     does not echo `state` on the private-use-scheme redirect, the server
     cannot find or single-use-consume the attempt
     at all — the exchange has no route to succeed. So native `state` echo
     is **EXPECTED but UNMEASURED, and load-bearing**, not a cosmetic
     nicety this design can proceed without. **PR1.75's sequence:** probe
     the real echo once C2 approves the new `redirect_uri` (gate doc
     §3(g), "still owed"); if echoed, promote "expected" to "measured" and
     ship as designed; if NOT echoed, this branch needs a retained-state
     fallback (e.g. keying the attempt by something the app already holds
     across the hop, such as a client-generated correlation value threaded
     through the private-use-scheme URL some other way) — design that
     fallback with an RF27 lifetime table (mint site, clear sites, what
     survives relaunch) before shipping it, rather than assuming the https
     callback's nonce shape ports unchanged. An `appUrlOpen` handler posts
     `{code, state}` to authed `POST /api/concept2/exchange`, **carrying
     the app's own Keychain bearer**, and the server checks the caller's
     id against the attempt's before exchanging.
   - **Web (Branch A)** completes through the EXISTING `/api/concept2/callback` —
     unauthenticated today, per the "NO requireUser — the nonce correlates,
     not binds" comment then at `:174` (corrected fix round 15), which
     describes the PRE-RULING shape, not the
     target (comment retired at PR1.75a; the callback is now
     cookie-authenticated) — gaining the same
     caller-identity check via the `erg_session` cookie that already
     exists for web sessions (`server/auth/cookies.ts`) and is already
     delivered on C2's redirect back to our own first-party origin: "a
     cookie exists there" is no longer a reason to skip authenticating
     it, it is what makes authenticating it possible with no new
     mechanism. After the identity check passes, the server exchanges
     the code (secret server-side), fetches `GET /api/users/me` for
     `c2_user_id`, writes the link row for the attempt's user, consumes
     the attempt, and renders a plain "Linked. Return to the app." page.
     The app never sees the code on this path; it learns the outcome by
     re-fetching `GET /api/concept2/link` on return — **PR1.5 plan
     correction, superseding this paragraph's original `appStateChange`
     wording, updated again by PR1.5 fix round 2 (P1a):**
     `useReturnToApp.ts` composes THREE signals, not one:
     `adapters/appLifecycle.ts`'s own `pause`/`resume` translation
     (native, via `@capacitor/app`, already a dependency),
     `registerWebAppLifecycleListener`'s raw Page Visibility mapping
     (web), AND — load-bearing on native, not optional —
     `@capacitor/browser`'s own `browserFinished` event
     (`adapters/externalBrowser.ts`'s `onBrowserFinished`). `resume` alone
     MISSES the common return path: `Browser.open` presents
     `SFSafariViewController` MODALLY inside the app, and dismissing it
     (Done, swipe-down, a completed consent) never backgrounds/foregrounds
     the host app, so `pause`/`resume` never fires for that return —
     `browserFinished` is what does. Never native `appStateChange` either
     way. Phase LM found that event is iOS's ACTIVE/INACTIVE signal,
     firing on a Control Centre swipe without the app ever leaving the
     foreground, and it made a lost-link banner fire nine times over a
     link that never dropped (`adapters/appLifecycle.ts:27-31`).
   - **Both** completion paths compare `attempt.userId === req.user.id`
     BEFORE the C2 token exchange runs (never after, and never merely
     before writing the link — a failed comparison must prevent the
     exchange call itself, not just the write that follows it) AND
     enforce the attempt's own `surface` column from step 1, so a nonce
     minted for one surface cannot complete on the other — surface
     enforcement is route integrity; the identity check is what makes
     the binding real. `redirect_uri` is chosen per surface at mint
     time.
   - Attempt rows expire (15 min) and are single-use; expiry/garbage
     collection is the server's, not a cron.

   **RULED (James, 2026-09-01, PR1.5 design gate — `2026-09-01-concept2-pr15-gate.md`):
   ACCEPT the bounded residual for the dark plumbing today — two FIRM
   bounds (the nonce's single-use + 15-minute expiry) plus the
   `C2_LINK_ENABLED` dark flag, and two SOFT/best-effort factors this
   acceptance does not lean on: `ALLOWED_EMAILS` bounds who can OBTAIN a
   new Ergomatic account, not a current holder's standing to act
   (`signin.ts:30-42`), and "one live attempt per user" is best-effort
   and raceable under concurrent mints, not enforced (gate doc §1,
   corrected fix round 15 — now ENFORCED at PR1.75a, migration 0021) —
   not the "four real bounds" of equal weight
   an earlier revision of this bullet claimed, and not the two the
   original "SUSPECTED" framing named either.** **REAFFIRMED (James,
   2026-09-01) on this corrected picture** — the correction narrowed the
   evidence, not the decision. `C2_LINK_ENABLED=1` on any REAL cohort
   is GATED, not free, on the fully authenticated completion shape above
   (surface binding + both-path identity check) being built end-to-end —
   **PR1.75, sequenced PR1.5 → PR1.75 → PR2 (ROADMAP's Wave E)**: the
   nonce alone binding the exchange, as an earlier revision of this
   section described, is the failure mode the ruling closes before flag
   flip, not a standing design. Seven options across four buckets
   (accept, detect, physically-confirm, app-bind) are catalogued in the
   gate doc's §3; this bullet states only the RULED activation contract,
   not the survey.
4. **Link routes:** `GET /api/concept2/link` → `{linked, c2UserId}`
   (no `weightClass` — the 2026-09-03 ruling; never tokens — `c2UserId` is the linked account's numeric
   id, which PR2's sent-state contract and its View-on-Concept2 link-out
   both need); `DELETE /api/concept2/link` →
   deletes the row (unlink is local, V5).
5. **Upload route** — `POST /api/concept2/results/:logId` (authed,
   ownership-checked). Loads the caller's `session_logs` row, applies the
   eligibility predicate (below), builds the C2 payload from the stored
   row — with the honest correction from anchor F7: every column is
   client-supplied at save time; the real property is that upload reads
   only VALIDATED stored values, and the two fields sourced from the
   unvalidated `machineSummary` blob (`stroke_rate`, `workout_type`) are
   type- and band-checked by the upload route before forwarding, omitted
   when they fail — POSTs with the user's access token (refresh first if
   `expires_at` passed; pair replaced atomically), writes `c2_result_id`
   + `c2_user_id` on the row when C2 ACKNOWLEDGES it — a 2xx, or a 409 whose
   body names the colliding id — and returns `{resultId}` or a typed failure
   (`duplicate`, `unlinked`, `not_eligible`, `c2_error`). RF25: this route
   owns the end-to-end invariant; a 409 IS that acknowledgment, so the
   recovery for "C2 accepted, our write failed" is re-send → 409 → durably
   recorded, the same write path as the 2xx branch, never a dead end that
   leaves the row unsent forever.
6. **Refresh failure discrimination (measured, `docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md`):**
   C2 never emitted `invalid_grant` in any measurement; the measured
   dead-grant shape is `HTTP 400 {"message":"The refresh token is
   invalid.","status_code":400}` (Probe 0's garbage token and Probe B's
   genuinely-rotated one are byte-identical). Rule: refresh 400/401 →
   set `needs_reauth_at` (the link survives; the surface prompts
   re-consent). No automatic path ever deletes a link on a
   token-endpoint error — C2's own docs show 400/401 for OUR malformed
   request and OUR client credentials too, so an automatic delete would
   destroy links on a server bug or a rotated secret, not only on a
   genuinely dead grant. Network errors, 5xx, timeouts are `c2_error`,
   retryable, no flag set — a DNS blip must not un-link a user and re-ask
   the one PII question. Refresh is serialized per user (`SELECT … FOR
   UPDATE` on the link row) because rotation invalidates the OLD refresh
   token IMMEDIATELY (measured, Probe B) — an unserialized second refresh
   against the same stored token would otherwise race and fail
   unpredictably.
7. **Env:** `C2_BASE_URL` (defaults `https://log-dev.concept2.com`),
   `C2_CLIENT_ID`, `C2_CLIENT_SECRET`, and `C2_LINK_ENABLED` (default
   OFF). Real env only. **`C2_LINK_ENABLED=1` on a real cohort is not an
   env-only cutover: it additionally requires option (g) fully
   implemented** — attempt-surface binding plus an authenticated
   completion check (`attempt.userId === req.user.id`, run before the
   C2 token exchange) on BOTH the native and web paths — alongside the
   write-approval check below (RULED, James, 2026-09-01,
   `docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md` §6; ROADMAP's
   C2 account-injection row).
8. **Visibility flag (James, 2026-08-31: "gate the visibility... in case
   we want to go live without it").** The whole surface is gated
   server-side: available iff `C2_LINK_ENABLED=1` AND both credentials
   present. `GET /api/concept2/link` returns `available: false`
   otherwise; the client renders NO Concept2 card and NO Send affordance
   when unavailable, and every link/upload route refuses server-side too
   — a capability gate, not a cosmetic hide. Server-driven rather than a
   `VITE_` build flag on purpose: one build ships everywhere (no second
   iOS binary, no RF13 disarmed-flag class); AVAILABILITY (the flag
   existing at all) is an env change, not a release, but ACTIVATING it
   for a real cohort is gated on more than the env flip — see item 7's
   (g) precondition and item 9's write-approval precondition, both
   required before flag flip, not either alone. Client code ships in
   the bundle either way — hidden, not absent; nothing in it is secret.
   Lifecycle rule:
   turning the flag OFF after users linked hides the surface but deletes
   nothing — links and per-row sent state persist as history.
   **Availability matrix (James's #244 review, finding 7) — every route,
   every unavailable input, pinned:**
   | route | flag off | creds missing | mid-hop (flag off between mint and callback) |
   | --- | --- | --- | --- |
   | `GET /link` | `{available:false}` 200 | `{available:false}` 200 | n/a |
   | `POST /connect` (mint) | 403, no attempt row | 403, no attempt row | n/a |
   | callback/exchange | 403 BEFORE any token exchange; the attempt row is consumed/expired; NO link row is created | same | same — availability is re-checked AT the callback, not inherited from mint |
   | `POST /results/:logId` (upload) | 403 `unavailable` | 403 `unavailable` | n/a |
   A linked user under flag-off: link row persists, upload refuses,
   surface hidden. PR1 tests one row of this matrix per cell class.
9. **Prod write approval ORDERS the cutover (James's portal quote,
   PRIMARY, 2026-08-31: "By default, the scopes granted to a client in
   the live environment are user:read and results:read. To create a
   client with write access, please go to log-dev.concept2.com.").**
   The live client is READ-ONLY until Concept2 approves write access
   (ranking@concept2.com), and the one-way scope rule means a grant made
   through a read-only client may be stuck narrow — a tester who links
   too early would have to unlink and relink. Therefore
   `C2_LINK_ENABLED` stays OFF on prod until write approval is
   CONFIRMED, not merely requested; approval-before-first-link is the
   ordering, not approval-before-first-upload. **This is one of two
   preconditions the flag flip requires, not the whole cutover** — item
   7's (g) precondition (attempt-surface binding plus authenticated
   completion on both paths) is the other, and both must hold before
   `C2_LINK_ENABLED=1` reaches a real cohort.

## Stored shapes (TRIAD)

**`concept2_links`** — one row per linked user:

| column | type | notes |
| --- | --- | --- |
| `user_id` | uuid PK, FK → users, cascade | one link per user |
| `c2_user_id` | integer, not null | from `GET /api/users/me` at exchange |
| `access_token` | text, not null | server-side only, never serialized to any client response |
| `refresh_token` | text, not null | rotates: replaced together with `access_token` on every refresh |
| `expires_at` | timestamptz, not null | from `expires_in` |
| `needs_reauth_at` | timestamptz, nullable | set when a refresh 400/401s (§Architecture 6); the link survives, the surface prompts re-consent, and a successful relink clears it |
| `created_at` / `updated_at` | timestamptz | house pattern |

*(PR1 shipped a `weight_class` enum column, NOT NULL, on BOTH
`concept2_links` and `concept2_auth_attempts` — the row list below still
shows it, because it describes what is deployed today. **Migration 0023
DROPS both columns and the `weight_class` enum type**: the 2026-09-03
ruling leaves no class for us to hold. Safe because prod runs flag-off
with no links, which is CHECKED with a `SELECT count(*)` on both tables
before the deploy rather than assumed.)*

**`concept2_auth_attempts`** — **CURRENT (shipped, PR1):**
`{nonce (pk), user_id FK, weight_class, created_at}`
(`server/db/schema.ts:510-519`) — single-use, 15-minute expiry, consumed
at exchange. Exists because the browser hop carries no credential; the
nonce correlates the return to the attempt, and — this is the ACCEPTED
DARK IMPLEMENTATION, not the ruled target — nothing today checks WHO is
completing it, which is exactly the account-injection residual the
design-gate ruling accepts for the dark plumbing. **TARGET, server half
BUILT at PR1.75a (migration 0021,
`2026-09-02-concept2-pr175-app-bind-design.md` §2): the `surface`
column** (`"native"` | `"web"`, corrected fix
round 15 — an earlier revision of this row said the column was "added
PR1.5 fix round 13"; round 13 was a docs-only reconciliation pass, and no
drizzle migration on this branch has ever touched `app/drizzle`
— superseding this row's original "no `redirect_kind` column ... one
env-derived boot constant" claim — that held only while the design was
Branch-A-only web completion; the ruled hybrid needs a per-surface
redirect URI chosen at mint time, since native completes through a
private-use scheme and web through the existing https callback, and the
column is what lets both completion routes enforce that a nonce minted
for one surface cannot complete on the other, gate doc §3(g) round 10)
— plan deviation 1 is therefore superseded, not standing, once PR1.75
ships it. Until then, `attempt.userId === req.user.id` at an
authenticated completion — the thing that actually BINDS the principal,
as opposed to the nonce, which only CORRELATES the return — does not
exist on either completion route — **as of PR1.75a it exists on both**
(route-local cookie resolver on the web callback; bearer on
`POST /exchange`); what remains is the native return (PR1.75b).

**`session_logs` additions**, all additive-optional, no default, no
backfill (house pattern):

- `c2_result_id` integer — C2's own id (their POST 201 example returns
  `"id": 339`, integer — V11's citation). Written when C2 acknowledges
  the row: a 2xx, or a 409 whose body names the colliding id (RF25's
  durable-recovery write).
- `c2_user_id` integer — WHICH Concept2 account accepted it (anchor F8:
  without this, unlink-then-relink-a-different-account renders "sent"
  for rows the current grant cannot see; the sent state renders only
  when the row's `c2_user_id` matches the live link's).
- `completed_at` timestamptz — the client's `MonitorRun.completedAt`
  (`monitorRun.ts:133`, stamped at close), posted at save from now on.
  Exists because C2's `date` is the END of the workout and `logged_at`
  is the server's save-time clock, minutes-to-hours later (anchor K3 /
  PM condition 2: this defers a wrong number, not a feature).
- `tz` text — the client's IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`),
  captured at save. Exists because C2's `date` is LOCAL wall-clock with
  `timezone` as a first-class POST parameter, and nothing in this repo
  stores any zone today — without it a 7pm Pacific row files on the
  wrong calendar day. **The two routes that validate it answer a bad zone
  DIFFERENTLY, on purpose** (PR2 Task 6): `POST /api/logs` DEGRADES —
  stores null, saves the row — while the upload route keeps its strict
  `400 field:"tz"`. See the product rule stated under the mapping table.

Tokens are plain columns in our Postgres, the same trust boundary every
credential this app holds already lives behind; at-rest encryption with
the key in the same process env is a lock taped to its own key. (Attacked
at the anchor; held.)

**Sent-state authority and lifetime, declared (anchor F8):** `c2_result_id`
records that C2 accepted this row once, for the account `c2_user_id`. It
is never re-read against C2 this wave; if the rower deletes the result on
Concept2's site, our "sent" stands and the view-on-Concept2 link 404s —
the design copy acknowledges the link goes to "your Concept2 logbook",
whose contents are theirs, not ours.

## The mapping (our row → `POST /api/users/me/results`)

Summary-level post; no `workout` object. Each interval object would
require per-interval `rest_time`, which the server row does not have —
`LogStep` (`stores/logs.ts:71-83`) carries work actuals only while
`IntervalActual` client-side does carry rest (V7). Adding it is a stored
shape for the follow-on.

| C2 field | source | notes |
| --- | --- | --- |
| `type` | literal `"rower"` | |
| `date` | `completed_at` rendered as local wall-clock in `tz`, `yyyy-mm-dd hh:mm:ss` | **The paired branch went LIVE with PR2's client producer** (`src/session/completionStamp.ts`, spread into the save body at both monitor doors), which is when this row stopped describing an intention: before it, the "fallback" below was the ONLY path any row could take. "Legacy" therefore means a row saved by a build predating PR2, and the two are distinguishable in the database by `completed_at IS NULL` — permanently, because the close instant was never recorded and no backfill can invent one. Fallback for those rows: `logged_at` rendered in the zone the UPLOAD request supplies, which the route PERSISTS onto the row's `tz` column on first use so every later retry reads the same stored zone and renders one stable date (plan deviation 2) — C2's dedup key is second-granular (PR0 probe C), so an unstable zone would file a SECOND C2 row instead of hitting the 409 recovery |
| `timezone` | `tz` | first-class C2 POST parameter |
| `distance` | `work_meters` | work-only (V12) |
| `time` | `round(work_seconds * 10)` | tenths; safe at the doublePrecision boundary (V8: sums of tenths carry ~1e-12 vs a 0.05 margin; a true half-tenth cannot arise from summing tenths) |
| `weight_class` | READ FROM CONCEPT2 at send time (2026-09-03 ruling), never stored by us: the rower's own most recent DECLARATION first (`GET /api/users/me/results`, newest entry reading H or L), our derivation from `GET /api/users/me`'s `weight` + `gender` second | derivation thresholds are inclusive, men ≤ 75 kg, women ≤ 61.5 kg, behind a plausibility band; when neither producer answers the send refuses `422 {error:"no_weight_class", reason}` with four reason tokens (`no_weight`, `unreadable_weight`, `implausible_weight`, `no_gender`) and the rower is sent to their Concept2 account. A fresh send's 200 carries `weightClass` and `weightClassSource`, and the send's log line records which producer answered; **no rower-facing surface renders either** (2026-09-04 ruling, §Rulings above — this sentence replaces one that said the SENT state does) |
| `workout_type` | `machineSummary.workoutType` (flat — see below), the PM5's OWN decoded value, mapped ordinal → C2 enum string; OMITTED when absent or unmapped | anchor F6: rev 1 derived a constant from our programming call (`commands.ts:158` sets `WORKOUTTYPE_VARIABLE_INTERVAL` unconditionally — that describes US, not the workout), and its JustRow branch modeled a state the app cannot yet produce. The machine's field is also the only one that can ever satisfy `verification_code`'s match rule. Field is optional; omission is honest |
| `rest_time` | `round(rest_seconds * 10)` when > 0 | "Depends: for interval workouts only" |
| `rest_distance` | `rest_meters` when > 0 | |
| `stroke_rate` | `machineSummary.avgStrokeRate` — **flat, depth one** | anchor K2: rev 1 wrote `machineSummary.summaryDetail.avgStrokeRate`, a path NO stored row has — the writer (`LogSession.tsx:1863-1878`) SPREADS `summaryDetail` flat, corroborated by the schema comment, the integration fixture, and `logs.ts`'s depth-one SQL projection. Band-checked by the upload route (the blob is unvalidated at save — anchor F7); omitted when absent/out-of-band. RC-16's 2× anomaly is terminate-only and terminated rows are ineligible |
| `comments`, `heart_rate`, `stroke_data`, `workout`, `verification_code` | OMITTED | stroke_data blocked on RC-11's clock mismatch; intervals blocked on per-interval rest; verification moot until the date mapping is proven (K3) and probed at PR0 |

**A Concept2 field can never cost a rower their row.** The product rule
behind the `date`/`timezone` mapping, stated here rather than only in a code
comment, because the next person to tighten a validator has to meet it. Zone
validation is membership of the SERVER IMAGE's own
`Intl.supportedValuesOf("timeZone")`, and a phone's tzdata legitimately
disagrees with a server image's across a release
(`Europe/Kyiv`/`Europe/Kiev`). So the two routes answer a bad zone
differently and neither is an oversight: `POST /api/logs` DEGRADES the zone
to null and saves the workout, because refusing there destroys the rower's
own record over a field that exists only to date a THIRD PARTY's copy of it;
the upload route keeps its strict `400 field:"tz"`, because a refusal there
costs one Concept2 send and nothing else. The degrade costs nothing about
the date itself — the upload route resolves `effectiveTz` (stored zone, else
the upload request's own, persisted on first use) and never reads the raw
column.

**Eligibility** (server-enforced, one predicate, one place): row belongs
to caller AND monitor provenance AND `ended_by = 'finished'` AND
`work_meters`/`work_seconds` present. RC-1 columns double as the version
fence.

**Population count (anchor F12 / PM condition 3, runs at PR0):** one
query on prod for rows passing the fence, before PR2 is planned — the
machineSummary precedent (0 of 18) says count before building the
surface. Near-zero is a finding, not a blocker: it tells us the button's
first audience is rows saved after this ships.

**The oracle, stated honestly (anchor F10):** the `export/` diff is an
ECHO with value — it can go red on ENCODING (units, rounding, timezone,
field misreads) and never on MEANING, because C2 stores what we told it.
PR0 therefore (a) proves the diff can go red by posting one deliberately
wrong value (`time` in seconds, not tenths) and showing the flag (RF21),
(b) reports per-field which oracle saw it (result object vs csv vs fit
vs tcx — MEASURED at the live run: the result object sees EVERY field we
send, including `stroke_rate`/`rest_time`/`rest_distance`, while
`export/` sees none of a stroke-less row at all), and (c) names the one
genuinely independent oracle:
the SAME physical row posted by ErgData, compared against ours on C2 —
which is also the dedup experiment.

## Surfaces (Gate 0 — both screens, rendered, before PR2 starts)

1. **You: "Concept2" card.** Unlinked (explains, Connect → system
   browser; **asks nothing** — 2026-09-03 ruling); linked (state + which
   account + Unlink with confirm; unlink is local and rows already sent
   stay on Concept2); link-failed (retryable). No weight class appears on
   any card, because the app does not hold one.
2. **Log row: "Send to Concept2".** idle → sending → sent / duplicate
   ("Concept2 already has this row") / failed (retryable) / no weight class
   (repairable on Concept2, with a link-out and a Send again). **Sent state
   includes a "View on Concept2" link-out** built from `c2_result_id`, plus
   the result id, and nothing else. **A 2026-09-03 revision had it also name
   the class that was sent and which producer supplied it; that line is
   WITHDRAWN by the 2026-09-04 ruling above, and this sentence replaces the
   one that described it.** The class and its producer stay on the route's
   200 and in the send's log line for an operator; no rower-facing surface
   renders them.
   (PM open gate: the one thing that closes the rower's loop — "did it
   actually land?"). Sent renders only when the row's `c2_user_id`
   matches the live link. Non-qualifying and not-linked treatments are
   design decisions, in the handoff. RF23 enumeration runs at the pass.

Handoff: `docs/design/handoffs/2026-08-31-concept2-connect/README.md`.
James coordinates the Claude Design session; output returns through
Gate 0 (rendered, real proportions, both orientations, contrast
computed).

## PR decomposition and gates

**Safe deployable end states (added at #244 re-review, finding 4, per
main's #243 review-unit rule) — each PR leaves main independently
shippable, and the mechanism is the default-off gate, stated here per PR
rather than inferred:**

- **After PR0:** production behavior is byte-identical to before it — a
  dev-only script under `app/scripts/` (never bundled; `ci-changes.sh`
  causes CI's code jobs to run, and nothing ships) plus docs. Deploy any
  time.
- **After PR1:** the migration adds only additive-nullable columns and
  two new tables nothing reads; every new route refuses (availability
  matrix) because `C2_LINK_ENABLED` is unset in prod; no client change.
  Deployed prod behavior, the PM-corrected honest claim (not "unchanged"):
  gains no capability; `GET /api/logs` rows grow four always-null fields
  (`c2ResultId`, `c2UserId`, `completedAt`, `tz`); one new unauthenticated
  route (`GET /api/concept2/callback`) answers 403 dark rather than not
  existing.
- **After PR1.5:** the system-browser consent hop and the foreground
  re-fetch seam exist (**corrected fix round 15 — PR1.5 does NOT ship the
  URL scheme or `appUrlOpen` handler; see PR1.75 below**), reachable only
  from a surface that does not render while `available:false`. This is
  the ACCEPTED DARK IMPLEMENTATION the design-gate ruling accepts the
  residual for — nonce-only, no principal-binding identity check on
  either completion route. Deployed prod behavior: unchanged.
- **After PR1.75a:** the server side of the ruled activation shape —
  migration 0021 (`surface`, `UNIQUE(user_id)`, `UNIQUE(c2_user_id)`),
  the cookie-authenticated web callback and the bearer-authenticated
  `POST /api/concept2/exchange`, `authVia`, the styled pages. **After
  PR1.75b:** the native return via `ASWebAuthenticationSession`
  (design §4 — not a URL scheme + `appUrlOpen` handler, which stays
  recorded as the Branch-B contingency), the PR1.5 return-arm
  retirement, the device walk. Deployed prod behavior after both:
  unchanged while dark.
- **After PR2:** the surface renders ONLY when the server reports
  `available:true`; prod stays dark until BOTH write approval is
  confirmed AND PR1.75's option (g) is fully implemented (§Architecture
  7, 9). Deployed prod behavior: unchanged until that deliberate flag
  flip, which is the release act — an env change alone does not suffice.

**Atomicity ruling:** no PR in this wave depends on a later one to be
safe; the flag, not PR ordering, is the safety mechanism.

- **PR0 — the desk cross-connect** (discharges RC exit (d)). Dev-only
  script under `app/scripts/`, manual-paste OAuth against `log-dev`
  (operator steps above). Probes, each with its response pre-committed:
  1. **`state` echo** (web/https callback only) → measured Branch A;
     **corrected 2026-09-01: this no longer chooses between Branch A and
     Branch B** — the hybrid (Branch A for web, Branch B for native) is
     now the mandatory design regardless of this result (§Architecture 3
     anchor F4), not a fork this probe decided between. Native's OWN
     `state` echo, on the private-use-scheme redirect, is a separate,
     still-unmeasured question that PR1.75 owns (§Architecture 3, above).
  2. **Dedup `date` granularity** (post twice; same values different
     time-of-day; same day different seconds) → day-granular: ship as
     specced, an ErgData copy 409s and that protects the rower;
     datetime-granular: our row and ErgData's coexist as two rows for
     one piece — nothing we store can prevent it (the wire date is
     minute-resolution, the ecosystem-review residual) — so PR2's send
     copy carries the duplicate warning and the wave ships with it
     said; anything else: the wave stays open (exit 5).
  3. **Zero-rest single-piece post** carrying an interval
     `workout_type` (anchor F11): accepted or rejected decides whether
     `workout_type` omission is forced for continuous rows.
  4. **The wrong-value red-proof** (RF21) and the per-field oracle
     visibility table.
  5. **`verificationBytes` as `verification_code`** — stretch, after
     the date mapping is proven.
  6. **The eligible-population count** on prod.
  Output: a walk report under `docs/monitor/` + the field-by-field diff.
  **This PR carries the wave's exit evidence and settles PR1's design
  branch.**
- **PR1 — server:** migration (`concept2_links`, `concept2_auth_attempts`,
  four `session_logs` columns), mint/link/exchange-or-callback routes per
  the branch PR0 chose (Branch A), upload route, mapping module (pure),
  refresh logic, save-path additions (`completed_at`, `tz` through the
  POST validator), and the `C2_LINK_ENABLED` availability gate on every
  route (§Architecture 8) with a test proving unavailable refuses both
  link AND upload. TRIAD gates.
- **PR1.5 — the native link flow** (PM condition 1's split: a reviewer
  should not hold a token-broker migration and an iOS deep-link contract
  in one pass): `@capacitor/browser` dependency, the return-to-app refresh
  seam (`useReturnToApp` — renamed from the working title "foreground
  re-fetch" at fix round 3 once `browserFinished` proved an equally
  load-bearing, non-foreground signal). **Corrected fix round 15: the URL scheme +
  `appUrlOpen` handler, this bullet's original scope, moved to PR1.75** —
  PR1.5 ships the dark, nonce-only plumbing (the ACCEPTED implementation
  the design-gate ruling accepts a residual for), not any piece of the
  authenticated activation shape. `browserFinished` return-signal
  verified ON DEVICE, not by reading Capacitor docs (RF13/RF19: our e2e
  is web; the native arm is exactly where our instruments are blind).
- **PR1.75 — full option (g), the ruled activation shape (TRIAD: AUTH).**
  Owns every piece the design-gate ruling's hard precondition names: the
  `surface` column migration (`"native"` | `"web"`) and its enforcement
  at both mint and completion routes, the native URL scheme +
  `appUrlOpen` handler moved from PR1.5, the authenticated native
  exchange route, an identity check
  (`attempt.userId === req.user.id`, run BEFORE the token exchange, never
  merely before the link write) retrofitted onto the existing,
  currently-unauthenticated web callback, Concept2's own approval of the
  new native `redirect_uri` (external dependency), and dual-route
  identity tests. The native completion leg's own `state`-echo claim gets
  its real on-device measurement here too, once C2 approves the redirect
  (gate doc, corrected fix round 15 — PR0's receipt measured the web
  callback only). Sequenced PR1.5 → PR1.75 → PR2. Gates
  `C2_LINK_ENABLED=1` on any real cohort (gate doc §6).
  **Superseded 2026-09-02 (`2026-09-02-concept2-pr175-app-bind-design.md`):
  this bullet's "native URL scheme + `appUrlOpen` handler" is NOT PR1.75's
  mechanism — the native return rides `ASWebAuthenticationSession`
  instead (design §4; the scheme-handler shape is kept on record as the
  Branch-B contingency). PR1.75 also split into PR1.75a (server, BUILT)
  and PR1.75b (native, not yet built).**
- **PR2 — client (after Gate 0):** You card, send affordance and states,
  api client additions. `pnpm e2e` + screenshots (RF1); per-file coverage
  (RF2); realistic fixtures (RF3).
- **Gates:** anchor pass DONE (this revision is its output); PM open
  DONE (GO-WITH-CONDITIONS, folded); PR1 gets the triad PM final-PR
  gate; PR2 sits behind Gate 0. **PR1.75 is TRIAD (AUTH) regardless of
  phase position — full antagonist pass on its spec, PM final-PR gate on
  its PR, no skip available (added fix round 15).** Antagonist mid-phase
  otherwise: delta pass only if PR0's probes force a design not written
  here; otherwise skips inherit this anchor's vetted ground, said aloud
  at each PR.

## Testing

- **Mapping module:** pure, table-driven against realistic stored rows
  (a real capture's saved form — RF3), the tenths boundary, omission
  rules, band-check rejections, eligibility refusals, the legacy-date
  fallback.
- **The RF24 seam test:** one integration test starts upstream — seeds a
  stored row + link row, drives the upload route against a stubbed C2
  (responses transcribed from PR0's REAL sandbox transcripts), asserts
  `c2_result_id`/`c2_user_id` land on a 2xx AND on a 409 whose body names
  the colliding id (RF25's durable-recovery write).
- **Mutation probes (RF21/22):** committed-then-probed, one per new
  assertion, reports say what the failure said; one mutation ABOVE the
  seam (forge eligibility at the route boundary).
- **Link flow:** attempt-row expiry and single-use both asserted by
  driving the exchange twice; refresh 400/401 (`needs_reauth_at`, link
  survives) vs 5xx (`c2_error`, retryable, no flag) discrimination
  tested with both stub responses.
- **`dist:grep`:** the client secret's env name proven absent from
  `dist/`, both directions.

## Exit criteria (ROADMAP Wave E block matches)

1. RC exit criterion (d), VERBATIM: *"a row posted to the Concept2
   sandbox comes back through `export/` matching what we stored, or the
   reason it cannot is documented."* Discharged by PR0's diff report.
   **The escape hatch is bounded (PM):** "cannot" is acceptable for a
   field C2 rejects or does not return — never for a field we chose not
   to send.
2. A linked user sends an eligible row from the app — ON THE PHONE, the
   primary surface — and C2's result id is stored on it; duplicate and
   failure states each observed for real at least once.
3. Countable PII bound (PM), STRENGTHENED by the 2026-09-03 ruling: the
   link flow's request bodies carry NO new user attribute. The weight
   class is Concept2's own fact — read from Concept2 at send time, never
   asked, never stored by us. The READ is minimal too: the declaration
   page is projected down to an ordered list of class letters, and none of
   the rower's other logbook rows is persisted, logged or rendered.
3b. **A DESK step, not a walk step, and it gates the FLAG FLIP rather than
   any merge.** It touches no erg, no phone and no PM5: it is a profile
   edit plus API GETs through the PR0 harness, runnable today. **It takes
   TWO readings, not one**, because the 16-field profile carries no
   weight-unit preference and a single reading cannot detect a per-user
   display unit: James sets a known weight with his Concept2 unit
   preference on **kg** and the operator records the raw number, then he
   switches the preference to **lb** and the operator reads again. If the
   raw number moves, the derivation is unsound and the ruling needs
   revisiting. The same session answers two other questions one glance
   settles and no status code can: **which Concept2 page carries the weight
   and weight-class fields** (the 2i link-out's target is PROVISIONAL until
   then — an id-less `/profile` was chosen because the id-bearing path was
   measured to render a public read-only card with no weight and no form),
   and **whether a non-rower result carries a class**.
   **How much less this gates than it used to:** with the DECLARATION as
   the primary producer, the unit only matters for a rower who has declared
   nothing at all, and the plausibility band already refuses four of the
   five wrong readings. It is a confirmation, not the sole instrument it
   was when the derivation was primary.
4. The dedup-granularity, `state`-echo, and zero-rest-post questions
   each carry a measured answer in PR0's report — "unknown" leaves the
   wave open.

(RC-9(b)'s live ring verdict MOVED OUT of this wave's exit to the
open-item register — PM condition 5: no shared mechanism, PR, or risk
model; its own text already says it rides the next driver-area PR.)

## Out of scope, named

Auto-upload (follow-on; webhooks noted for it), per-interval `intervals`
array (per-interval rest not stored server-side), `stroke_data` (RC-11
clock mismatch), manual/terminated rows, PATCH/DELETE of C2 results,
re-reading sent rows against C2 (the sent state is a past-tense record,
declared above), prod cutover (write-approval confirmation AND option
(g) fully implemented, then the flag flip, when the key arrives — see
§Architecture 7, 9). The word "sync" does not appear in any release note for
this wave (PM): nothing here syncs.
