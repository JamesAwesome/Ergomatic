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
You (OAuth link, with the one required question C2 forces — weight class
H/L) and a manual "Send to Concept2" action on a monitor-connected
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
- **`weight_class` ruling stands** (James, 2026-08-22, RC phase open):
  a binary H/L asked ONLY at Concept2 link time, never at onboarding.

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
  **Branch A is CHOSEN.** Branch B below stays as the recorded
  contingency design, not a live option. Other PR0 measurements: dedup is DATETIME-GRANULAR to the
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
- `GET /api/users/me` returns 13 fields, none of them weight —
  `weight_class` must be asked by us (V10).

**Does the underlying system have the concept?** Everything we surface is
a concept C2 itself owns: result creation, H/L weight class, work-only
totals, duplicate rejection, export, native-app OAuth. The two things WE
invent, named: the per-user LINK record and the per-row SENT state. The
sent state's authority and lifetime are declared honestly below (anchor
F8): it is a record of a past accepted post, not a live claim about
Concept2's present.

## Architecture

**Server broker for secrets; system browser for consent; no APP
CREDENTIAL anywhere in the native path** (narrowed, PR1.5 fix round 7,
finding 4 — this used to say "no cookie anywhere," which overclaimed:
the design-gate ruling
(`docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md` §3(d)) may yet
introduce a PURPOSE-BUILT, non-credential cookie into the consent
browser's own hop; that cookie would never carry the app's own Keychain
bearer or an `erg_session`, which is the invariant this sentence actually
needs). The anchor pass killed rev 1's redirect-chain flow: native auth
is a Keychain bearer attached by `api.ts` to fetches — a top-level
WebView navigation carries no credential, `CapacitorHttp` follows
redirects into a JS string, and the callback browser has no session to
bind. Google sign-in's native plugin flow (`docs/deploy.md:105-108`) is
the in-repo precedent; C2 has no SDK, so we build the RFC 8252 shape:

1. **Mint:** authed `POST /api/concept2/connect {weightClass}` (bearer or
   cookie — works on both surfaces). Server validates `H`/`L`, creates a
   short-lived single-use `concept2_auth_attempts` row `{nonce, user_id,
   weight_class, created_at}`, and returns the authorize URL. No
   credential needs to survive the browser hop: the nonce IS the binding.
2. **Consent:** client opens the URL in the SYSTEM browser / in-app
   browser tab (`@capacitor/browser` on native — new dependency, version
   verified at add time; plain navigation on web).
3. **Return — two designs, chosen by PR0's `state` probe, both written
   now (anchor F4):**
   - **Branch A (C2 echoes `state`):** `redirect_uri` is our https
     callback; C2 sends `code` + `state` there; the server resolves the
     attempt row by nonce, exchanges the code (secret server-side),
     fetches `GET /api/users/me` for `c2_user_id`, writes the link row
     for the attempt's user, consumes the attempt, and renders a plain
     "Linked. Return to the app." page. The APP never sees the code; it
     learns the outcome by re-fetching `GET /api/concept2/link` on
     return — **PR1.5 plan correction, superseding this paragraph's
     original `appStateChange` wording, updated again by PR1.5 fix round
     2 (P1a):** `useReturnToApp.ts` composes THREE signals, not one:
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
     **SUSPECTED, decision owed
     (PR1 premise pass, 2026-08-31):** the nonce binds the exchange to
     `attempt.user_id` alone, so an attacker who mints on their OWN
     Ergomatic account and delivers the resulting authorize URL to a
     victim links the VICTIM's Concept2 account under the ATTACKER's
     user. **Corrected round 9 — "bounded today only by `ALLOWED_EMAILS`"
     was already stale when PR1.5's own gate package shipped: four real
     bounds exist, not one, and seven options across four buckets are on
     the table (`2026-09-01-concept2-pr15-gate.md` §1/§3), one of them
     (g) this Branch B section's own shape.** James's call is owed
     before prod cutover — see the gate doc, not this bullet, for the
     current bound count and option set.
   - **Branch B (C2 does not echo `state`):** the callback cannot bind a
     user, so the CODE must come back through the app: register a
     private-use scheme (Info.plist), C2 redirects to
     `haus.waffle.ergomatic://oauth/callback?code=…`, an `appUrlOpen`
     handler posts it to authed `POST /api/concept2/exchange {code}`, and
     the server does the same exchange bound to the caller. Web keeps the
     https callback (cookie exists there) with `redirect_uri` chosen per
     surface at mint time.
   - Attempt rows expire (15 min) and are single-use; expiry/garbage
     collection is the server's, not a cron.
4. **Link routes:** `GET /api/concept2/link` → `{linked, weightClass,
   c2UserId}` (never tokens — `c2UserId` is the linked account's numeric
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
   set `needs_reauth_at` (link and `weight_class` survive; the surface
   prompts re-consent). No automatic path ever deletes a link on a
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
   OFF). Real env only. Prod cutover is env + the write-approval check.
8. **Visibility flag (James, 2026-08-31: "gate the visibility... in case
   we want to go live without it").** The whole surface is gated
   server-side: available iff `C2_LINK_ENABLED=1` AND both credentials
   present. `GET /api/concept2/link` returns `available: false`
   otherwise; the client renders NO Concept2 card and NO Send affordance
   when unavailable, and every link/upload route refuses server-side too
   — a capability gate, not a cosmetic hide. Server-driven rather than a
   `VITE_` build flag on purpose: one build ships everywhere (no second
   iOS binary, no RF13 disarmed-flag class), and flipping prod live is
   an env change, not a release. Client code ships in the bundle either
   way — hidden, not absent; nothing in it is secret. Lifecycle rule:
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
   ordering, not approval-before-first-upload.

## Stored shapes (TRIAD)

**`concept2_links`** — one row per linked user:

| column | type | notes |
| --- | --- | --- |
| `user_id` | uuid PK, FK → users, cascade | one link per user |
| `c2_user_id` | integer, not null | from `GET /api/users/me` at exchange |
| `access_token` | text, not null | server-side only, never serialized to any client response |
| `refresh_token` | text, not null | rotates: replaced together with `access_token` on every refresh |
| `expires_at` | timestamptz, not null | from `expires_in` |
| `weight_class` | text, enum `H`/`L`, not null | James's ruling: asked at link time only |
| `needs_reauth_at` | timestamptz, nullable | set when a refresh 400/401s (§Architecture 6); link and `weight_class` survive, the surface prompts re-consent, and a successful relink clears it |
| `created_at` / `updated_at` | timestamptz | house pattern |

**`concept2_auth_attempts`** — `{nonce (pk), user_id FK, weight_class,
created_at}`; single-use, 15-minute expiry, consumed at exchange. Exists
because the browser hop carries no credential; the nonce is the user
binding. No `redirect_kind` column: Branch A is the chosen and measured
path (PR0's `state` probe), so the redirect URI is one env-derived boot
constant rather than a per-attempt choice (plan deviation 1).

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
  wrong calendar day.

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
| `date` | `completed_at` rendered as local wall-clock in `tz`, `yyyy-mm-dd hh:mm:ss` | fallback for legacy rows (null `completed_at`/`tz`): `logged_at` rendered in the zone the UPLOAD request supplies, which the route PERSISTS onto the row's `tz` column on first use so every later retry reads the same stored zone and renders one stable date (plan deviation 2) — C2's dedup key is second-granular (PR0 probe C), so an unstable zone would file a SECOND C2 row instead of hitting the 409 recovery |
| `timezone` | `tz` | first-class C2 POST parameter |
| `distance` | `work_meters` | work-only (V12) |
| `time` | `round(work_seconds * 10)` | tenths; safe at the doublePrecision boundary (V8: sums of tenths carry ~1e-12 vs a 0.05 margin; a true half-tenth cannot arise from summing tenths) |
| `weight_class` | `concept2_links.weight_class` | |
| `workout_type` | `machineSummary.workoutType` (flat — see below), the PM5's OWN decoded value, mapped ordinal → C2 enum string; OMITTED when absent or unmapped | anchor F6: rev 1 derived a constant from our programming call (`commands.ts:158` sets `WORKOUTTYPE_VARIABLE_INTERVAL` unconditionally — that describes US, not the workout), and its JustRow branch modeled a state the app cannot yet produce. The machine's field is also the only one that can ever satisfy `verification_code`'s match rule. Field is optional; omission is honest |
| `rest_time` | `round(rest_seconds * 10)` when > 0 | "Depends: for interval workouts only" |
| `rest_distance` | `rest_meters` when > 0 | |
| `stroke_rate` | `machineSummary.avgStrokeRate` — **flat, depth one** | anchor K2: rev 1 wrote `machineSummary.summaryDetail.avgStrokeRate`, a path NO stored row has — the writer (`LogSession.tsx:1863-1878`) SPREADS `summaryDetail` flat, corroborated by the schema comment, the integration fixture, and `logs.ts`'s depth-one SQL projection. Band-checked by the upload route (the blob is unvalidated at save — anchor F7); omitted when absent/out-of-band. RC-16's 2× anomaly is terminate-only and terminated rows are ineligible |
| `comments`, `heart_rate`, `stroke_data`, `workout`, `verification_code` | OMITTED | stroke_data blocked on RC-11's clock mismatch; intervals blocked on per-interval rest; verification moot until the date mapping is proven (K3) and probed at PR0 |

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

1. **You: "Concept2" card.** Unlinked (explains, asks H/L, Connect →
   system browser); linked (state + weight class + Unlink with confirm;
   unlink is local and rows already sent stay on Concept2); link-failed
   (retryable). The H/L ask is part of the connect flow, not a form
   field.
2. **Log row: "Send to Concept2".** idle → sending → sent / duplicate
   ("Concept2 already has this row") / failed (retryable). **Sent state
   includes a "View on Concept2" link-out** built from `c2_result_id`
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
- **After PR1.5:** native browser plumbing exists but is reachable only
  from a surface that does not render while `available:false`. Deployed
  prod behavior: unchanged.
- **After PR2:** the surface renders ONLY when the server reports
  `available:true`; prod stays dark until write approval + flag flip
  (§Architecture 9). Deployed prod behavior: unchanged until the
  deliberate env change, which is the release act.

**Atomicity ruling:** no PR in this wave depends on a later one to be
safe; the flag, not PR ordering, is the safety mechanism.

- **PR0 — the desk cross-connect** (discharges RC exit (d)). Dev-only
  script under `app/scripts/`, manual-paste OAuth against `log-dev`
  (operator steps above). Probes, each with its response pre-committed:
  1. **`state` echo** → Branch A or Branch B of the return design.
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
  in one pass): `@capacitor/browser` dependency, foreground re-fetch
  wiring, and — Branch B only — the URL scheme + `appUrlOpen` handler.
  Verified ON DEVICE, not by reading Capacitor docs (RF13/RF19: our e2e
  is web; the native arm is exactly where our instruments are blind).
- **PR2 — client (after Gate 0):** You card, send affordance and states,
  api client additions. `pnpm e2e` + screenshots (RF1); per-file coverage
  (RF2); realistic fixtures (RF3).
- **Gates:** anchor pass DONE (this revision is its output); PM open
  DONE (GO-WITH-CONDITIONS, folded); PR1 gets the triad PM final-PR
  gate; PR2 sits behind Gate 0. Antagonist mid-phase: delta pass only if
  PR0's probes force a design not written here; otherwise skips inherit
  this anchor's vetted ground, said aloud at each PR.

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
3. Countable PII bound (PM): the link flow's request bodies carry
   exactly ONE new user attribute, `weight_class`.
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
declared above), prod cutover (env flip + write-approval check when the
key arrives). The word "sync" does not appear in any release note for
this wave (PM): nothing here syncs.
