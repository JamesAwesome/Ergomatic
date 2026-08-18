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
| `/log` | The history list: every session, newest first, cursor-paginated (page size 30, loads more on scroll) | Today's LAST THREE heading (now a link, "ALL SESSIONS"), tab-bar-free deep link |
| `/log/:id` | The from-the-log view: spec 1's summary re-skinned per the handoff — eyebrow `FROM YOUR LOG`, reflection as read-back, Edit affordance, plan footer when linked | A `/log` row, a Today LAST THREE row, a done Plan row, or a deep link |

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
| `avg_split_seconds` | real | save, when the summary showed AVG SPLIT | The R-C number as displayed (500×Σt/Σd over measured work rows, warm-up excluded), stored at full precision, rendered with spec 1's formatter |
| `distance_meters` | integer | save, when the summary showed DISTANCE | The R-B number: the machine's total, work + rest + warm-up meters |
| `time_seconds` | real | save, when the summary showed TIME | The R-D number: measured work + completed rests (monitor doors), wall-clock span (timer door) |
| `plan_key` | text | save, only when the save advanced the plan | Which plan the session counted toward |
| `plan_index` | integer | save, only when the save advanced the plan | The 0-based sequence position it recorded (the "SESSION 12" in the footer is `plan_index + 1`) |

- **The heroes are copied from the rendered model, not recomputed at the
  server.** The client posts what `buildSummaryModel`/`buildTimerModel`
  displayed; the server stores it verbatim. One derivation, one copy — the
  phase's F-1 lesson. A hero the summary did not show (absent cell) posts
  nothing and stores null.
- **Plan linkage is stored, never inferred.** Rejected alternative,
  recorded: mapping the nth done plan row to the nth advancing log by
  order. Reset and Switch zero `doneN` while logs persist, so inference
  lies exactly when a rower has reset or switched — the two operations the
  Plan screen makes one tap away. Old rows have no linkage; pre-spec-2
  checkmarks stay untappable (§1) rather than guessing.
- `plan_key`/`plan_index` are written in the same transaction as the
  `plan_state` upsert they describe, from the same request — they can never
  disagree with the increment that stored them. They are a record of what
  happened, not a foreign key into mutable plan state: Reset does not null
  them, Switch does not rewrite them. The footer reports history
  ("Logged to Silver Thaw · SESSION 12 OF 84"), not current plan state.
- POST `/api/logs` accepts the five new fields, each optional; v0.11.0
  clients that send none of them store all-null and break nothing
  (additive-only between tags, per the standing API rule).

## §3 The API

| Change | Shape | Notes |
|---|---|---|
| `GET /api/logs` gains `before` | `?limit=30&before=<cursor>` | Cursor = the last row's `loggedAt`+`id` pair (stable under equal timestamps); response unchanged otherwise. Additive. |
| `GET /api/logs/:id` | Single log, full row (steps included) | The from-the-log view's fetch; owner-checked, 404 on absence OR another user's row (no existence leak). New route, additive. |
| `PATCH /api/logs/:id` | `{thumbs?, held?, pain?, notes?}` | The first UPDATE. Any subset; `null` clears a field, absent leaves it alone. Same member validation and field-named 400s as POST. Owner-checked, 404 as above. Nothing else is accepted: steps, heroes, meta, and plan linkage are immutable — unknown keys 400 with the field named. |
| `GET /api/logs` rows gain the new fields | heroes + plan linkage in each row | The list renders hero snippets and Plan resolves its links from the same fetch it already makes. Additive fields on an existing response shape — old clients ignore them. |

- Plan's done-row link resolves from a `GET /api/logs?plan=<key>` variant
  returning `{planIndex, id}` pairs for that plan — one fetch on Plan
  mount, cached with the screen. (Not per-row fetches; not a join into
  plan_state.)
- PATCH validation reuses POST's exact validators (`held must be one of
  held|under|over or null`, pain 1-5, thumbs up|down, notes length) — one
  copy, imported, not duplicated.

## §4 Navigation flow — the burn list, and what each burn requires here

**This section exists by ruling.** The repo has been burned by navigation
flow repeatedly; each burn below is real, named, and turns into a binding
requirement with its own witness. The plan's tasks cite these by number.

| # | The burn (what actually happened) | The requirement it imposes here |
|---|---|---|
| N1 | **Browser BACK rebuilt or wiped a progressed run** (whole-branch review F1; pinned by `e2e/session.spec.ts`'s "BACK mid-session" and "stale deep link" tests). Route mounts had side effects. | `/log` and `/log/:id` are side-effect-free mounts: they fetch and render, and never write localStorage, never touch drafts, runs, or monitor records, never redirect based on session state. A stale `/log/:id` deep link after the row was deleted server-side renders the not-found state (§5), never a rebuild of anything. Witness: a mount-side-effect test asserting storage is byte-identical after visiting both routes. |
| N2 | **The unmount clamp wrote scroll 0 over the saved position** (PR #84, the scroll echo; recipe memorialized: CPU-throttle + instrument the write). The history list is exactly a scroll-saving screen. | `/log` saves and restores its scroll position across a detail visit and back (the News scroll-memory idiom, `articleReads`' sibling), with PR #84's guard shape: the save is gated so an unmounting/empty render can never echo 0 over a real position. Witness: the CL round-4 e2e shape — scroll deep, open a row, BACK, assert the offset survived, under CPU throttle. |
| N3 | **A reader landed mid-scroll in its OWN scroller** (News CL item, fix round 4: opening an article from a scrolled feed inherited the feed's offset). | Opening `/log/:id` always lands at the top of its own scroller, regardless of how deep the list was scrolled. Same witness shape as the News fix. |
| N4 | **A killed route's deep links lingered** (`/session/complete` needed a redirect shim in spec 1; SessionComplete's own F1 tests had to move). | No route dies in this spec, but `/log/:id` must handle every cold entry: direct deep link with a cold cache (fetch by id, §3), an id that 404s (friendly not-found with a `← LOG` route out, §5), and an unauthenticated hit (the app's standing auth redirect, unchanged). |
| N5 | **Back labels that lie about where they go** (spec 1 §2A: `← DONE`'s fallback needed an explicit ruling; the handoff's static `← LOG` label predates the Plan entry ruling). | The back affordance is origin-faithful: it pops history when there is in-app history (so it returns to Today, Plan, or `/log` — whichever you came from, scroll intact per N2), and falls back to `/log` only on a cold deep link with no history to pop. The LABEL matches the destination it will actually perform: `← LOG`, `← PLAN`, `← TODAY`, falling back to `← LOG`. Never a label naming one place while navigating to another. Browser BACK and the on-screen affordance do the same thing — two spellings of one navigation, never two behaviors. |
| N6 | **Leaving a form silently, or trapping the user in it** (the discard family: `useStagedDiscard` exists because plain leave lost work; the PAUSED overlay taught the cost of blocking surfaces). | Edit mode is in-page state, not a route. Entering it pushes nothing onto history. Leaving `/log/:id` while editing (browser BACK, tab bar, back affordance) discards unsaved edits without a trap — and the Save/Cancel pair makes the state legible: Cancel reverts to the read-back in place. No confirmation modal (there is at most a few fields of loss, and the house has no blocking dialogs), but the edit card's Save disables while a PATCH is in flight and re-enables on error with the error named (§5). |
| N7 | **Tab-bar state and a pushed route disagreeing** (the connected surface's END-in-header ruling came from mis-taps; Today's own filter sheet had the backdrop-dismiss round). | `/log` and `/log/:id` render inside the standard tab shell with TODAY active-state rules matching the house convention for nested routes (same treatment as `/library/:id` under LIBRARY): the tab that owns the surface stays lit, and tapping it pops to its root. No new tab; LOG is not a fifth tab. |

The plan must carry one task that is nothing but N1-N7's witnesses, and the
antagonist's pass on this spec attacks this table first (that is why it is
a table: each row is an attackable claim with a named witness).

## §5 The from-the-log view, property level

| Group | Property | Value |
|---|---|---|
| 5A eyebrow | text | `FROM YOUR LOG` (handoff) |
| 5A title block | | Spec 1's 2A rendering, from the stored row: title, `date · time · source` — the source segment is `deviceName` when stored, otherwise ABSENT (the row does not record which non-monitor door saved it, and the segment idiom drops what it cannot know rather than guessing) |
| 5B heroes | | Spec 1's 2B rendering fed by the STORED three; per-cell absence identical; whole block absent when all three are null (old rows) |
| 5C rows | | Spec 1's 2E rendering fed by stored `steps` — measured rows judged against the STORED avg split, never re-averaged, and only when two or more rows carry measurements (spec 1's lone-row abstention carries over); if `avg_split_seconds` is null, every row renders unjudged, no bars |
| 5D read-back | | Dashed block (handoff): the answered fields as `HELD · PAIN 3/5 · LIKED` segments (option-B words for held: `UNDER · FASTER` etc.), note text beneath; wholly absent when all four are null, replaced by the Edit affordance's empty-state copy `Add how it felt` |
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
5. The three stored heroes on a monitor-door save equal the summary's
   rendered values byte-for-byte (formatter-level comparison in a client
   test), and DISTANCE still equals the machine total on the committed
   walk recordings (spec 1's oracle, now flowing through storage).
6. Migration 0010 applies against a database holding v0.11.0 rows and
   changes none of their reads (contract-suite proof, storeContracts
   pattern).
7. The v0.12.0 notes PR says: your history is open, tap any past session;
   skipped reflections can now be answered; plan checkmarks open their
   sessions (new saves onward).

## §8 Vetted ground inherited

Spec 1's §7 vetted ground carries: the summary model's numbers and their
oracles, the option-B labels, the reflection card's controls, the absence
idiom (§2B), the abstention rendering, the never-migrate MonitorRun
contract (untouched here — this spec reads server rows, not device
records). The antagonist's pass on this spec is a FULL pass (triad: stored
shapes + stored numbers), anchored on §2 and §4.
