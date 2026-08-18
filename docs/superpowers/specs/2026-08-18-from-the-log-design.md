# From the log: history, the read-back, and the first edit (Phase PW spec 2)

## What and why

A rower can open any past session and see exactly what they saw the moment
they finished — the same three heroes, the same interval rows — and finally
answer the reflection they skipped. Spec 1 shipped the summary and disclosed
its own gap in the release notes: "there is no way to come back and fill it
in later yet." This spec closes that gap, gives Plan's checkmarks something
to open, and adds the API's first UPDATE. Nothing measured is ever editable;
the record stays immutable and only the rower's own words about it move.

**James's rulings at the brainstorm (2026-08-18):**

1. **Surface: full history screen**, reached from Today's LAST THREE
   heading, with the three rows themselves tappable — **plus Plan**: a
   logged (done) plan session row opens the log it recorded.
2. **Heroes are STORED at save time** — history shows the exact numbers the
   rower saw, forever. Old rows render without heroes rather than showing
   recomputed near-numbers.
3. **All four reflection fields are editable** (thumbs, held, pain, notes),
   with the same clearable controls spec 1 shipped.
4. **The spec stresses navigation flow as a first-class risk** — "we've
   been burned by navigation flow too" (his words). §4 is that section, and
   its requirements are exit criteria, not advice.

## §1 Surfaces and routes

| Route | What | Arrived from |
|---|---|---|
| `/today/log` | The history list: every session, newest first, cursor-paginated (page size 30, loads more on scroll) | Today's LAST THREE heading (now a link, "ALL SESSIONS"), deep link |
| `/today/log/:id` | The from-the-log view: spec 1's summary re-skinned per the handoff — eyebrow `FROM YOUR LOG`, reflection as read-back, Edit affordance, plan footer when linked | A `/today/log` row, a Today LAST THREE row, a done Plan row, or a deep link |

- The history list reuses the LAST THREE row idiom (type badge, title, the
  segment-joined meta line) — one row component, not two.
- The from-the-log view reuses `PostWorkoutSummary`'s rendering for meta,
  heroes, and interval rows. It is a READ surface: it renders server data
  only and **never touches session records, drafts, or monitor state** —
  see §4.
- Handoff (`docs/design/handoffs/2026-08-12-post-workout/README.md`, "From
  the log" row): eyebrow `FROM YOUR LOG`, reflection card as a dashed
  read-back block, footer shows plan linkage (`Logged to Silver Thaw ·
  SESSION 12 OF 84`) and the edit affordance. The handoff's back label
  `← LOG` is superseded by §4's origin-faithful back rule. The handoff's
  "Edit notes & pain rating" copy predates thumbs and the option-B labels;
  ruling 3 governs (all four fields).
- Heroes on old rows (pre-migration saves): the whole hero block is absent,
  siblings close up — spec 1 §2B's absent-inputs rule, already shipped.
  Never a dash, never a recomputed stand-in.
- Plan linkage footer renders only when the log carries stored linkage
  (§2). An unlinked log shows no plan footer at all.

## §2 Stored shapes (TRIAD — full antagonist pass + PM final-PR gate)

Migration 0010, additive only — every column nullable, no defaults
backfilled, no NOT NULL anywhere, old rows read back null everywhere:

| Column | Type | Written when | Meaning |
|---|---|---|---|
| `avg_split_seconds` | double precision | save, when the summary showed AVG SPLIT | The R-C number (500×Σt/Σd over measured work rows, warm-up excluded). `double precision`, NOT `real`: float4 measurably truncates (antagonist probe: `2.7182818284 → 2.7182817`), and a triad column does not get to round |
| `distance_meters` | integer | save, when the summary showed DISTANCE | The R-B number: the machine's total, work + rest + warm-up meters |
| `time_seconds` | double precision | save, when the summary showed TIME | The R-D number: measured work + completed rests (monitor doors), wall-clock span (timer door). Same float4 rejection as `avg_split_seconds` |
| `plan_key` | text | save, only when the save advanced the plan | Which plan the session counted toward |
| `plan_index` | integer | save, only when the save advanced the plan | The 0-based sequence position it recorded (the "SESSION 12" in the footer is `plan_index + 1`) |

- **The client posts the model's NUMBERS, not its strings — corrected by
  the antagonist pass (B3).** `SummaryHeroes` deliberately carries
  pre-formatted display strings for AVG SPLIT and TIME; the numbers those
  strings were formatted FROM are the posted values: the working average's
  seconds, `measuredSessionSeconds`' result (or the timer door's persisted
  wall-clock span, which survives reload — vetted), and
  `distanceMeters`. One derivation of each number, with spec 1's
  formatters re-applied at read-back (`fmtSplit` for the split;
  `fmtDuration(seconds / 60)` for TIME — that formatter takes MINUTES,
  a documented trap). The model exports the three numbers alongside the
  strings so the POST site never re-derives one. A hero the summary did
  not show posts nothing and stores null.
- **The three hero numbers are bounds-checked at the route like every
  other numeric field** (the POST bounds `pain` and step values; a stored
  number does not arrive unchecked): each must be finite and positive,
  `avg_split_seconds <= 3600`, `distance_meters <= 1000000` whole,
  `time_seconds <= 604800`; violations 400 with the field named. This is
  sanity, not truth — an authenticated client can still post a wrong
  number about its own rowing, accepted and recorded here as the trust
  boundary (the server cannot re-derive what only the device saw).
- **Plan linkage is stored, never inferred.** Rejected alternative,
  recorded: mapping the nth done plan row to the nth advancing log by
  order. Reset and Switch zero `doneN` while logs persist, so inference
  lies exactly when a rower has reset or switched — the two operations the
  Plan screen makes one tap away. Old rows have no linkage; pre-spec-2
  checkmarks stay untappable (§1) rather than guessing.
- **The linkage mechanism, concretely (rewritten per antagonist B4 —
  today's upsert knows neither field):** the advancing save's transaction
  changes the `plan_state` upsert to an atomic increment WITH
  `.returning({doneN, planKey})`. `plan_index` = the returned `doneN - 1`,
  `plan_key` = the returned `planKey` — post-update values from the same
  atomic statement, so two concurrent advancing saves cannot stamp the
  same index (the read-then-increment race is designed out, not tested
  out). The key is server-derived from the plan_state row, never posted
  by the client. When the returned `planKey` is null (the counter moved
  with no plan chosen — possible today), BOTH linkage fields store null:
  "advanced the counter" without a named plan records no linkage.
- The columns are a record of what happened, not a foreign key into
  mutable plan state: Reset does not null them, Switch does not rewrite
  them. The footer reports history ("Logged to Silver Thaw · SESSION 12
  OF 84"), not current plan state.
- **Reset and Switch make `(plan_key, plan_index)` NON-UNIQUE by design**
  (antagonist B5 — the same fact that killed inference-by-order applies
  to the read side): after a reset, the next advancing save stores index
  0 again. The resolution rule is NEWEST WINS: Plan's done-row link and
  the `?plan=` resolution (§3) return, per index, the log with the
  latest `loggedAt` for the CURRENT plan_state key. Older same-index
  logs remain reachable through `/today/log`'s chronological list and
  keep their own footers; only the Plan checkmark's one tap needs a
  single answer.
- POST `/api/logs` accepts the five new fields, each optional; v0.11.0
  clients that send none of them store all-null and break nothing
  (additive-only between tags, per the standing API rule).

## §3 The API

| Change | Shape | Notes |
|---|---|---|
| `GET /api/logs` gains `before` | `?limit=30&before=<id>` | **Cursor = the last row's `id` alone — an opaque key the server resolves in SQL** (`WHERE (logged_at, id) < (SELECT logged_at, id FROM session_logs WHERE id = $cursor)` with `ORDER BY logged_at DESC, id DESC`). The antagonist PROVED the timestamp-through-JSON design skips rows: Postgres stores microseconds, drizzle's `Date` mapping truncates to milliseconds, and a truncated cursor sits EARLIER than its own row (live demo lost two of four rows). The timestamp never round-trips through the client; the `id` tiebreak also fixes today's `ORDER BY logged_at` alone. Additive (see the projection bullet below for the one field removal). |
| `GET /api/logs/:id` | Single log, full row (steps included) | The from-the-log view's fetch; owner-checked, 404 on absence OR another user's row (no existence leak). New route, additive. |
| `PATCH /api/logs/:id` | `{thumbs?, held?, pain?, notes?}` | The first UPDATE. Any subset; `null` clears a field, absent leaves it alone. Same member validation and field-named 400s as POST for BAD VALUES; **unknown keys are IGNORED, matching POST and `PUT /api/prefs` (the repo's one shipped partial update documents ignoring as required)** — a 400 would give the API two personalities and break additive-only in the new-client/old-server direction (antagonist B6). Steps, heroes, meta, and plan linkage stay immutable by omission from the accepted set. An empty patch (`{}` or all-unknown keys) is a no-op read returning the current row, per the prefs precedent. Owner-checked, 404 as above. |
| `GET /api/logs` rows gain the new fields | heroes + plan linkage in each row | The list renders hero snippets and Plan resolves its links from the same fetch it already makes. Additive fields on an existing response shape — old clients ignore them. |

- Plan's done-row link resolves from a `GET /api/logs?plan=<key>` variant
  returning `{planIndex, id}` pairs (newest-wins per §2) — **one NEW fetch
  on Plan mount** (corrected per antagonist B10: Plan fetches only
  `/api/plan` today; this is an addition, not a reuse), cached with the
  screen. Not per-row fetches; not a join into plan_state.
- **The list response drops `steps`** (a projected select): 30 rows ×
  full step jsonb is dead weight for a list rendering meta + a hero
  snippet. This is the spec's ONE deliberate field removal, legal against
  the additive-only rule because the field has zero client consumers —
  `RecentLog` (the response's only reader) never carried `steps`, proven
  by grep and pinned by a test. `GET /api/logs/:id` carries the full row.
- PATCH validation reuses POST's exact validators (`held must be one of
  held|under|over or null`, pain 1-5, thumbs up|down, notes length) — one
  copy, imported, not duplicated.

## §4 Navigation flow — the burn list, and what each burn requires here

**This section exists by ruling.** The repo has been burned by navigation
flow repeatedly; each burn below is real, named, and turns into a binding
requirement with its own witness. The plan's tasks cite these by number.

| # | The burn (what actually happened) | The requirement it imposes here |
|---|---|---|
| N1 | **Browser BACK rebuilt or wiped a progressed run** (whole-branch review F1; pinned by `e2e/session.spec.ts`'s "BACK mid-session" and "stale deep link" tests). Route mounts had side effects. | `/today/log` and `/today/log/:id` are side-effect-free mounts: they fetch and render, and never write localStorage, never touch drafts, runs, or monitor records, never redirect based on session state. A stale `/today/log/:id` deep link after the row was deleted server-side renders the not-found state (§5), never a rebuild of anything. Witness: a mount-side-effect test asserting storage is byte-identical after visiting both routes. |
| N2 | **The unmount clamp wrote scroll 0 over the saved position** (PR #84, the scroll echo; recipe memorialized: CPU-throttle + instrument the write). The history list is exactly a scroll-saving screen. | The list saves and restores its scroll with BOTH halves of the News pair, named exactly (antagonist B1: the pair is inseparable — the overlay child's `position: fixed` clamps `window.scrollY` to 0, recreating PR #84's echo unless the save carries `News.tsx:209`'s guard shape): the `isConnected`-guarded save, and restore on return. Restore is honest about pagination: it restores within the loaded first page and clamps to available height rather than auto-fetching pages to chase a deep offset — a deep-scroll return lands at the first page's bottom edge, stated, not hidden. Witness: the CL round-4 e2e shape under CPU throttle, PLUS an instrumented-write assertion that no `0` is ever saved while a real offset exists. |
| N3 | **A reader landed mid-scroll in its OWN scroller** (News CL item, fix round 4) — and the repo's own comments record THREE window-scroll fixes lost to real iOS WebKit before the overlay scroller won, with `App.tsx` noting Playwright's WebKit never reproduced the failure (antagonist B1: the e2e green cannot see this bug). | The detail view does not fight WebKit: it renders as an OVERLAY SCREEN with its own scroller (the Reader mechanism — a fresh DOM node structurally starts at 0), the only approach that has ever held on device. The e2e witness pins the structure (overlay class + own scroller + top on open), not the WebKit behavior; **the phone pass carries the real check**, listed in §7 as a device item exactly because the harness is blind here. |
| N4 | **A killed route's deep links lingered** (`/session/complete` needed a redirect shim in spec 1; SessionComplete's own F1 tests had to move). | No route dies in this spec, but `/today/log/:id` must handle every cold entry: direct deep link with a cold cache (fetch by id, §3), an id that 404s (friendly not-found with a `← LOG` route out, §5), and an unauthenticated hit (the app's standing auth redirect, unchanged). |
| N5 | **Back labels that lie about where they go** (spec 1 §2A: `← DONE`'s fallback needed an explicit ruling; the handoff's static `← LOG` label predates the Plan entry ruling). | The back affordance follows the SHIPPED `BackLink` idiom (antagonist correction: `BackLink` navigates to `location.state.from` — it does not call `history.back()`, and `window.history.length` is not a sound has-history signal): origin rides `location.state.from` on every in-app entry (`/today/log`, Today row, Plan row), the affordance navigates there, and the LABEL names that exact destination — `← LOG`, `← PLAN`, `← TODAY`. Cold deep link (no state): label and destination are `← LOG`. Browser BACK remains the browser's own pop and lands on the same origin for in-app entries because that origin IS the previous entry; the two mechanisms may differ only on a cold deep link, where there is no in-app origin to honor. Never a label naming one place while the affordance navigates to another. |
| N6 | **Leaving a form silently, or trapping the user in it** (the discard family: `useStagedDiscard` exists because plain leave lost work; the PAUSED overlay taught the cost of blocking surfaces). | Edit mode is in-page state, not a route. Entering it pushes nothing onto history. Leaving `/today/log/:id` while editing (browser BACK, tab bar, back affordance) discards unsaved edits without a trap — and the Save/Cancel pair makes the state legible: Cancel reverts to the read-back in place. No confirmation modal (there is at most a few fields of loss, and the house has no blocking dialogs), but the edit card's Save disables while a PATCH is in flight and re-enables on error with the error named (§5). |
| N7 | **Tab-bar state and a pushed route disagreeing** (the connected surface's END-in-header ruling came from mis-taps; Today's own filter sheet had the backdrop-dismiss round). | The routes live UNDER the owning tab's path — `/today/log` and `/today/log/:id` — because the tab convention is URL-prefix-based and a bare `/log` would be the app's first route that lights no tab (antagonist B9, enumerated over AppRoutes). TODAY stays lit for free; tapping TODAY pops to Today's root, which doubles as the saved scroll's clearing door (`CLEAR_ON_TAB` fires on the owning-tab tap — a fresh visit through the heading link after a tab-tap never restores a stale offset). No new tab; LOG is not a fifth tab. |

The plan must carry one task that is nothing but N1-N7's witnesses, and the
antagonist's pass on this spec attacks this table first (that is why it is
a table: each row is an attackable claim with a named witness).

## §5 The from-the-log view, property level

| Group | Property | Value |
|---|---|---|
| 5A eyebrow | text | `FROM YOUR LOG` (handoff) |
| 5A title block | | Spec 1's 2A rendering, from the stored row: title, `date · time · source` — source = `deviceName` when stored; else `TIMER` when any stored step carries `actualSource: "stopwatch"`; else `BY HAND` (steps store the door after all — antagonist B7 corrected this spec's earlier premise; only assumed-only rows are door-ambiguous, and those are exactly the by-hand saves) |
| 5B heroes | | Spec 1's 2B rendering fed by the STORED three; per-cell absence identical; whole block absent when all three are null (old rows) |
| 5C rows | | Spec 1's 2E rendering fed by stored `steps` — measured rows judged against the STORED avg split, never re-averaged, and only when `avg_split_seconds` is non-null AND two or more stored steps carry `actualSplit`; if either fails, every row renders unjudged, no bars. Accepted divergence, recorded: save-time counted an out-of-range actual the steps never stored, so a rare row judged live may read back unjudged — bars degrade toward absence, never toward invention |
| 5D read-back | | Dashed block (handoff): the answered fields as `HELD · PAIN 3/5 · LIKED` segments (option-B words for held: `UNDER · FASTER` etc.), note text beneath. The segment LINE renders only when at least one of thumbs/held/pain is non-null (a notes-only log shows the note with no empty segment line above it — antagonist minor); the block is wholly absent when all four are null, replaced by the Edit affordance's empty-state copy `Add how it felt` |
| 5D edit | | The affordance swaps the read-back for spec 1's reflection card (four clearable controls, same 46px targets), plus `Save` / `Cancel`. Save PATCHes the subset that changed; success returns to read-back with the new values; failure re-enables with the server's field-named message. Cancel reverts in place. |
| 5E plan footer | | `Logged to <plan title> · SESSION <plan_index+1> OF <sequence length>` when linkage stored; absent otherwise. Plan title resolves from `plan_key` against the client's PLANS table; an unknown key (a future removed plan) renders the key verbatim rather than crashing. |
| 5F not-found | | A 404'd id renders `This session is gone.` with `← LOG`; no auto-redirect. |
| 5G history list | | Row = LAST THREE idiom + a hero snippet (`AVG 2:04.5 · 5,000 m` from stored values, segments absent when null); infinite scroll per §3's cursor; empty state `No sessions logged yet.` (the Today string, reused); loading and error states per `useRecentLogs`' state-machine idiom. |

## §6 Research note (house rule)

- **Mechanisms:** REST partial update (PATCH with null-clears semantics) —
  standard, RFC 5789 + JSON Merge Patch's null convention (PRIMARY);
  cursor pagination by (timestamp, id) — standard practice for stable
  pagination under inserts (SECONDARY, widely documented); scroll
  restoration — the repo's own News implementation is the reference
  (PRIMARY, in-repo). Nothing OS-owned is touched; no wire semantics; no
  invented mechanism — the one accumulator-shaped idea (inferring plan
  linkage) was rejected in §2 in favor of storage.
- **Does the system have the concept?** Editing a stored row: yes,
  ordinary UPDATE semantics. Plan-session identity: the system did NOT
  have it (nothing recorded which log advanced which session) — that is
  §2's addition, asserted on the app's behalf, and it is honest because it
  is written at the only moment the fact is knowable (the advancing save).
- Nothing found contradicting the design; recorded per the
  "nothing found is a result" rule.

## §7 Exit criteria

1. Every §5 row has a named passing witness; §4's N1-N7 each have their
   named witness and the witnesses live in one task.
2. A session saved on v0.11.0 (no heroes posted) renders in history with
   rows and reflection, heroes absent — proven with a fixture posting the
   v0.11.0 body shape verbatim.
3. The PATCH round-trip: skip everything at save, open from history, answer
   all four, reload cold, the answers persist; clear one via PATCH null,
   it reads back cleared.
4. Plan: advance a plan by saving, the done row opens the exact log that
   advanced it; Reset the plan, the footer on that log still reads the
   original linkage.
5. The three stored heroes survive the REAL database: an integration
   round trip through Postgres (contract-suite pattern) posts the model's
   numbers, reads them back, and formats to the summary's exact strings —
   with a probe value proven to go red under a `real` column before
   trusting the green (the antagonist's B8: a client-side
   formatter-of-both-sides comparison tests the formatter, not the
   storage). DISTANCE still equals the machine total on the committed
   walk recordings (spec 1's oracle, now flowing through storage).
6. Migration 0010 applies against a database holding v0.11.0 rows and
   changes none of their reads (contract-suite proof, storeContracts
   pattern).
7. The v0.12.0 notes PR says: your history is open, tap any past session;
   skipped reflections can now be answered; plan checkmarks open their
   sessions (new saves onward).
8. The phone pass carries N3's real check (the harness is blind to the
   iOS scroll failure by the repo's own record): open a deep-scrolled
   history, open a session, confirm it lands at top; return, confirm the
   list position survived.
9. The cursor's row-loss trap has a red-proven regression test: two rows
   inside the same millisecond, paginated at size 1, both returned.

## §8 Vetted ground inherited

Spec 1's §7 vetted ground carries: the summary model's numbers and their
oracles, the option-B labels, the reflection card's controls, the absence
idiom (§2B), the abstention rendering, the never-migrate MonitorRun
contract (untouched here — this spec reads server rows, not device
records). The antagonist's pass on this spec is a FULL pass (triad: stored
shapes + stored numbers), anchored on §2 and §4.
