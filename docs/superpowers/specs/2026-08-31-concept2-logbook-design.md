# Wave E — the Concept2 logbook (design)

**Date:** 2026-08-31 · **Status:** DRAFT, awaiting James's review
**Wave:** E (ROADMAP "Wave E — The Concept2 logbook", opened 2026-08-31)
**Risk class:** TRIAD — auth (OAuth tokens) and stored shapes (a new table,
a new column, a new POST field). Full antagonist anchor + PM bookends + per-PR
triad gates apply.

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
part of this wave. The point of the order: the mapping is proven against
the sandbox before any tester can press a button that exercises it.

## Decisions already made (James, this brainstorm, 2026-08-31)

- **In-app surface is IN scope** for the wave, not just the desk harness.
- **Manual per-row send first**; auto-upload is the follow-on phase.
- **Monitor-connected `finished` rows only** are sendable. Manual logs and
  terminated rows are not, this wave.
- **Production API key exists**; James provides it when ready. Until then
  everything runs against `log-dev` with the `LOGBOOK_DEV_KEY` already in
  the repo-root `.env` (value never read into a transcript or committed
  file — RC's standing rule). One open check when the prod key lands:
  C2 requires explicit approval for the live write API ("please contact
  Concept2 for approval for the live API"), so confirm the key is
  write-approved, not read-only.
- **`weight_class` ruling stands** (James, 2026-08-22, RC phase open):
  a binary H/L asked ONLY at Concept2 link time, never at onboarding.
  Minimal-PII rule respected — the question exists because C2 requires the
  field, and it is asked at the moment the requirement becomes real.

## Research record

Full report gathered 2026-08-31 from the single-page official doc at
`https://log.concept2.com/developers/documentation/`. Every claim below is
PRIMARY from that URL; verbatim load-bearing lines quoted where an argument
rests on them. "Nothing found" entries are results, recorded as such.

- **Grants:** "The OAuth Grant types implemented are Authorization Code,
  Refresh, Client Credentials and Password." Ordinary apps get
  Authorization Code + Refresh. **PKCE: nothing found** — no occurrence of
  "PKCE" or "code_challenge" on the page; token exchange requires
  `client_secret` in the form body. **This settles the architecture: the
  secret cannot ship in an app bundle, so our server brokers OAuth and
  holds tokens.**
- **Scopes:** `user:read`, `user:write`, `results:read`, `results:write`;
  "requesting the write version of a permission will also include the read
  version." We request `user:read,results:write` EXPLICITLY, because the
  default is a documented accident: "Important: If a scope is not passed,
  it currently defaults to having user:read,results:write as the scopes.
  This is for backwards compatibility with existing clients and this
  behaviour may change in the future." Also one-way: "It is possible to
  request fewer scopes but not to request additional scopes after the
  initial authorization code."
- **Token lifetimes:** access token per `expires_in` (documented example
  `604800` = 7 days; no fixed lifetime promised). Refresh: "The lifetime
  of the refresh token is currently one year. … When you use it, as well
  as a new access_token, you will a[lso receive a new refresh token]" —
  refresh tokens ROTATE on use, so the stored pair must be replaced
  atomically on every refresh.
- **Endpoints:** `GET /oauth/authorize` (client_id, scope, response_type,
  redirect_uri), `POST /oauth/access_token`
  (`application/x-www-form-urlencoded`). Dev base
  `https://log-dev.concept2.com` (INFERENCE for the dev OAuth paths: docs
  print no separate dev URLs; base + path assumed, verified at PR0).
  "Results and users in the development database may occasionally be
  reset." — the sandbox is disposable; nothing durable may depend on it.
- **POST results:** `POST /api/users/me/results`. Required: `type`
  ("Must be one of rower, …"), `date` ("this should be the date as stored
  in the monitor, which is the end of the workout, NOT the beginning"),
  `distance` ("In meters. Note: for interval workouts this is work
  distance only."), `time` ("Time in tenths of a second. e.g. one minute
  would be 600. Note: for interval workouts this is work time only.").
  `weight_class`: "Required if type is rower, dynamic or slides. Value
  must be either H or L". `rest_time`: "For interval workouts only. This
  is the value in tenths of a second of total time spent in rest
  intervals." `rest_distance`: "the total distance in meters of distance
  covered in rest intervals." `workout_type`: Required **No**, enum
  includes `JustRow` and `VariableInterval`. `stroke_rate` (avg): No.
  The nested `workout.intervals` array is OPTIONAL at the top level, but
  each interval object in it requires `type` and `rest_time` per interval.
  **Tenths of a second everywhere.** Work-only `distance`/`time` with rest
  split out is exactly RC-1's storage split — the expensive alignment is
  already done.
- **Dedup:** "the Logbook filters for duplicate workouts, so will return a
  Duplicate Entry error if you post a workout which has the same date,
  time and distance as an existing workout." Status table: "409 Duplicate
  result". This answers RC's ErgData-dedup question in the survivable
  direction: a collision fails loudly with a 409; it does not fork or
  merge the row. **Unknown: `date` granularity in the dedup key** (day vs
  datetime) — decides whether an ErgData copy of the same physical row
  (posted with the monitor's own end time, different from our `loggedAt`)
  collides or lands as a second row. Settled empirically at PR0.
- **Verification:** `verification_code` is a real optional POST field —
  "For the verification code to be accepted, the date, time, distance,
  workout_type and machine type must match that of the code." `verified`
  boolean is "Only trusted clients". We store `verificationBytes` (0x003F
  payload, `schema.ts` `machineSummary`); whether those bytes are C2's
  code format is UNPROVEN. Stretch probe at PR0, not a commitment.
- **Export:** `GET /api/users/{user}/results/{result_id}/export/{type}`,
  type one of `csv`, `fit`, `tcx`.
- **Edit/delete:** `PATCH`/`DELETE /api/users/{user}/results/{result_id}`
  exist; DELETE "cannot be undone". Not used this wave.
- **Rate limits:** "The API is not currently rate limited." Webhooks exist
  (result-added/updated/deleted) — noted for the auto-upload follow-on,
  unused this wave.

**Does the underlying system have the concept?** Everything we surface is
a concept C2 itself owns: result creation by API clients, the H/L weight
class, work-only totals with rest split out, duplicate rejection, export.
The two things WE invent, named: the per-user LINK record (their OAuth
grant, our storage) and the per-row SENT state (our claim that a given
`session_logs` row corresponds to a given C2 result id). If the sent state
is ever wrong, we are wrong, not C2 — it is our assertion, held honest by
storing C2's own result id and nothing else.

## Architecture

**Server broker, three pieces; the client never sees a C2 token.**

1. **Link routes** (`app/server/routes/concept2.ts`, authed like every
   data route):
   - `GET /api/concept2/connect` → 302 to
     `{C2_BASE}/oauth/authorize?client_id=…&scope=user:read,results:write&response_type=code&redirect_uri={SITE_URL}/api/concept2/callback&state={csrf}`.
     `state` is a signed nonce bound to the session — the standard CSRF
     defense on a callback the browser can be steered to.
   - `GET /api/concept2/callback` → exchanges the code
     (form-encoded, client id + secret from env), fetches C2
     `GET /api/users/me` for the C2 user id, upserts the link row, then
     redirects to You. `weight_class` is NOT collected here — the client
     asks H/L before starting the flow (see Surfaces) and the value rides
     the connect redirect as a query param the server validates
     (`H`/`L` only) and stores on the link row it creates at callback.
   - `DELETE /api/concept2/link` → deletes the row. C2 documents no
     token-revocation endpoint (nothing found), so unlink is local:
     tokens destroyed our side, the grant expires on C2's schedule.
   - `GET /api/concept2/link` → `{ linked, weightClass }` for the You card
     (never the tokens).
2. **Upload route** — `POST /api/concept2/results/:logId` (authed,
   ownership-checked like every log route). Loads the caller's
   `session_logs` row, refuses anything that is not a monitor-connected
   `finished` row with RC-1 work columns present, builds the C2 payload
   (mapping below) FROM THE SERVER ROW ONLY — never from client-supplied
   numbers, so what we post is exactly what we stored — POSTs it with the
   user's access token (refreshing first if expired; on refresh, both
   tokens replaced atomically), stores the returned result id on the row,
   and returns `{ resultId }` or a typed failure (`duplicate`,
   `unlinked`, `not_eligible`, `c2_error`). RF25 seam ownership: THIS
   ROUTE owns the end-to-end invariant — the result id is written only
   after C2 confirms, and every failure is returned to the caller as a
   distinct state; no fire-and-forget anywhere on the path.
3. **Env:** `C2_BASE_URL` (defaults `https://log-dev.concept2.com`),
   `C2_CLIENT_ID`, `C2_CLIENT_SECRET`. Real env only, same posture as
   `DATABASE_URL` — no dotenv. Flipping to production is env-only.

## Stored shapes (TRIAD)

**`concept2_links`** — one row per linked user:

| column | type | notes |
| --- | --- | --- |
| `user_id` | uuid PK, FK → users, cascade | one link per user |
| `c2_user_id` | integer, not null | from `GET /api/users/me` at callback |
| `access_token` | text, not null | server-side only, never serialized to any client response |
| `refresh_token` | text, not null | rotates: replaced together with `access_token` on every refresh |
| `expires_at` | timestamptz, not null | from `expires_in` at grant/refresh |
| `weight_class` | text, enum `H`/`L`, not null | James's 2026-08-22 ruling: asked at link time only |
| `created_at` / `updated_at` | timestamptz | house pattern |

Tokens are stored as plain columns in our Postgres, the same trust
boundary every session credential in this app already lives behind. If the
antagonist wants at-rest encryption, that is a real argument to have at
the anchor pass — the counterargument is that the DB is already the thing
that holds everything else worth stealing, and app-layer encryption with
the key in the same process's env is a lock taped to its own key.

**`session_logs.c2_result_id`** — nullable integer, additive-optional, no
default, no backfill; every existing row reads null forever (house
pattern: `endedBy`, RC-1's four, the machine three). Written by the upload
route alone, only after a 2xx from C2. Null means "never successfully
sent"; a 409 duplicate leaves it null (see Error handling — we do not
claim an id C2 never gave us).

## The mapping (our row → `POST /api/users/me/results`)

First ship is a SUMMARY-LEVEL post. The nested `workout.intervals` array
is optional at the top level, and we cannot build it honestly: each
interval object requires per-interval `rest_time`, which the server row
does not have — `LogStep` carries work actuals only
(`stores/logs.ts:71-83`); per-interval rest lives client-side on
`IntervalActual` and was never posted. Adding it is a stored-shape change
that rides the auto-upload follow-on, not a reason to hold this wave.

| C2 field | source | notes |
| --- | --- | --- |
| `type` | literal `"rower"` | this app programs rowers |
| `date` | `session_logs.logged_at`, formatted `yyyy-mm-dd hh:mm:ss` | HONEST DEVIATION: C2 wants "the date as stored in the monitor, which is the end of the workout"; we store when the rower saved, minutes later. The machine's own log date is not stored (RC exit (b) decoded it from the wire but `MachineSummaryDetail` does not carry it). Consequence: our `date` differs from an ErgData post of the same row, which interacts with the dedup key — measured at PR0. Follow-on if it matters: store `completedAt`. |
| `distance` | `work_meters` | work-only, exactly what C2 asks |
| `time` | `round(work_seconds * 10)` | tenths; ours is doublePrecision seconds |
| `weight_class` | `concept2_links.weight_class` | required for rowers |
| `workout_type` | derived: programmed row → `"VariableInterval"`, free row → `"JustRow"` | JR spec's settled derivation (`commands.ts:158` programs `WORKOUTTYPE_VARIABLE_INTERVAL` unconditionally); field is optional, so an unknown case omits it rather than guessing |
| `rest_time` | `round(rest_seconds * 10)` | only when > 0 (interval workouts) |
| `rest_distance` | `rest_meters` | only when > 0 |
| `stroke_rate` | `machineSummary.summaryDetail.avgStrokeRate` when present | optional field; omitted when absent. The machine's own average, stored verbatim (`schema.ts` `machineSummary`). RC-16's 2× anomaly applies to TERMINATED pieces only and terminated rows are ineligible here, so the clean-finish reading is the one we send |
| `comments`, `heart_rate`, `stroke_data`, `workout` | OMITTED | stroke_data blocked on RC-11's three-way clock mismatch (our series clock is not C2's `t`); intervals blocked on per-interval rest above; HR deliberately not a concept this app stores per-row |
| `verification_code` | NOT SENT this wave | PR0 probes whether our `verificationBytes` are C2's code format; if yes, a follow-on wires it (C2: code must match date/time/distance/workout_type/machine — our `date` deviation above likely breaks it, which the probe will show) |

**Eligibility** (server-enforced, one predicate, one place): row belongs
to caller AND has monitor provenance AND `ended_by = 'finished'` AND
`work_meters`/`work_seconds` present. The RC-1 columns double as the
version fence — a pre-RC-1 monitor row has null work columns and is
honestly ineligible rather than approximately posted.

**The mirror warning, discharged:** what we post (`work_*`) and what C2
stores (work-only) are the SAME quantity by C2's own field definitions
quoted above — that is the point of this wave, not an accident. The diff
oracle at PR0 is C2's `export/` reading of numbers that went through
their validator, not our own definitions reflected back.

## Surfaces (Gate 0 — both screens, rendered, before any client task)

1. **You: "Concept2" card.** Unlinked: explanation + Connect action; the
   H/L weight-class question is asked HERE, before the OAuth redirect
   (C2's own profile cannot supply it: PRIMARY, RC phase open — `GET
   /users/me` has no weight field). Linked: linked-state + weight class
   shown, unlink action with confirm. 44px targets, AA contrast, both
   orientations — computed numbers in the gate presentation.
2. **Log row: "Send to Concept2".** On an eligible row when linked:
   idle → sending → sent (shows the linked result) / duplicate ("Concept2
   already has this row") / failed (retryable). Sent state persists
   (`c2_result_id`). Ineligible or unlinked rows: the affordance's
   absence/disabled treatment is part of the design, not an afterthought.
   RF23 check runs at the design pass: enumerate everything already on the
   log row surface that offers or writes related state before adding this.

Handoff for Claude Design:
`docs/design/handoffs/2026-08-31-concept2-connect/README.md`. James
coordinates the design session; its output comes back through Gate 0
(rendered, real proportions, both orientations, contrast computed) before
PR2 starts.

## Error handling

- **409 duplicate:** surfaced as its own state, verbatim meaning ("same
  date, time and distance as an existing workout"). `c2_result_id` stays
  null — C2 gave us no id and we do not go hunting for the colliding row
  this wave.
- **Token expiry:** refresh before POST when `expires_at` passed; both
  tokens replaced atomically. Refresh failure (revoked grant, year-old
  token) → link marked dead by DELETING the row and the client told
  `unlinked` — the You card returns to Connect. No silent retry loops.
- **C2 5xx / network:** typed `c2_error`, retryable by the human who
  pressed the button. Manual-first means no queue, no backoff machinery.
- **Durability (RF25):** the upload route is the single owner. Write of
  `c2_result_id` happens after C2's 2xx; if OUR db write then fails, the
  route returns the failure (the row is on C2, our record does not say
  so, and the honest recovery is: re-send → 409 duplicate → a state the
  UI already has). That path is named here so nobody "discovers" it.

## PR decomposition and gates

- **PR0 — the desk cross-connect** (RC exit (d) discharged). A dev-only
  script (`app/scripts/` — never bundled, `dist:grep`-proof by placement)
  that walks the OAuth code grant against `log-dev` (manual paste
  redirect: James creates a log-dev account — operator step, said now),
  posts one reconciled row from a committed capture's stored form, pulls
  `export/csv` (+`fit`,`tcx`), and diffs field-by-field against the
  source row. Also probes, while we are there: dedup `date` granularity
  (post twice, then post with same day/different time), and the
  `verificationBytes`-as-`verification_code` question. Output: a walk
  report under `docs/monitor/` naming every field's round-trip result.
  **This PR carries the wave's exit evidence.**
- **PR1 — server:** migration (`concept2_links` + `c2_result_id`), link
  routes, upload route, mapping module (pure, unit-tested hard), refresh
  logic. TRIAD per-PR gates apply.
- **PR2 — client (after Gate 0):** You card, send affordance and states,
  api client additions. `pnpm e2e` + screenshots (RF1); per-file coverage
  (RF2); realistic fixtures — a linked user and an eligible stored row,
  not empty-library ghosts (RF3).
- **Gates:** this spec gets the antagonist ANCHOR pass (phase open, TRIAD)
  and the PM phase-open slate before implementation; PR1 gets the triad
  PM final-PR gate; PR2 gets Gate 0 before it starts. Skips said aloud:
  no per-PR antagonist on PR2 if it inherits the anchor's vetted ground
  and invents nothing.

## Testing

- **Mapping module:** pure function, table-driven against realistic
  stored rows (a real capture's saved form, not a hand-invented one —
  RF3), including the tenths rounding at the doublePrecision boundary,
  omission rules (no rest fields on a zero-rest row, `workout_type`
  omitted when unknown), and eligibility refusals.
- **The seam test RF24 demands:** one integration test that STARTS
  upstream — seeds a stored row + a link row, drives the upload route
  against a stubbed C2 (contract-shaped responses: 2xx with id, 409,
  401-then-refresh), and asserts `c2_result_id` lands (and does not land
  on 409). Both halves tested separately is exactly the condition that
  hides a broken seam.
- **Mutation probes (RF21/22):** each new assertion gets a mutation that
  bites, committed-then-probed, report says what the failure said. One
  mutation ABOVE the seam: forge the eligibility predicate at the route
  boundary and prove the refusal test goes red.
- **Contract truth:** the stubbed C2 responses are transcribed from PR0's
  REAL sandbox transcripts, not imagined — PR0 lands first precisely so
  PR1's stubs have something true to mirror.
- **No client secret in the bundle:** `dist:grep` seam names
  (`C2_CLIENT_SECRET` never reaches client code by construction — server
  env only; the gate proves the obvious anyway, both directions).

## Exit criteria (transcribed into ROADMAP Wave E at open, per RC's close)

1. RC exit criterion (d), VERBATIM, as carried: *"a row posted to the
   Concept2 sandbox comes back through `export/` matching what we stored,
   or the reason it cannot is documented."* Discharged by PR0's diff
   report.
2. A linked user sends an eligible row from the app and the C2 result id
   is stored on the row; the duplicate and failure states each observed
   for real (sandbox) at least once.
3. `weight_class` asked exactly once, at link time, H/L, stored; nothing
   PII beyond it collected (the standing minimal-PII rule, kept).
4. RC-9(b)'s live ring verdict lands (small, independent; rides whichever
   PR touches the driver area, or its own smallest change).
5. The dedup-granularity and verification-code questions each have a
   measured answer in PR0's report — "unknown" leaves the wave open.

## Out of scope, named

Auto-upload (follow-on phase; webhooks noted for it), per-interval
`intervals` array (blocked on storing per-interval rest server-side),
`stroke_data` (RC-11's clock mismatch unresolved — ours-only, the honest
boundary), sending manual/terminated rows, PATCH/DELETE of C2 results,
prod cutover (env flip + write-approval check when James provides the
key).
