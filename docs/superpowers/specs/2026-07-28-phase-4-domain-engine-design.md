# Phase 4: Domain Engine, Schema & Data API — Design

Approved 2026-07-28. Implements ROADMAP Phase 4 with the differentiation spec
(`2026-07-28-differentiation-design.md`) and the distance-step amendment
(`2026-07-28-roadmap-amendment-distance-pm5-capacitor.md`) baked in from the
first line. Scope decision: engine + schema + the COMPLETE per-user data API
land this phase (Phase 5 becomes purely frontend; the Phase-2-recorded
two-user isolation obligation is discharged here).

## Decisions

| Question | Decision |
|---|---|
| Scope | Engine + schema + full data API (option A). Phase 5 consumes a finished, tested API |
| Plan presets | **Original sequences** (not the handoff's book-derived tables): `sprint` and `head`, 84 sessions each with periodic test placements, built from standard periodization (base→build→peak), authored + James-reviewed alongside the starter library |
| Steps storage | `jsonb` document per workout (ordered, atomic, builder-owned; never queried relationally), validated by the domain module's validators on every write |
| Plan sequences storage | Code (`domain/plans.ts`), not DB — versioned data beats migratable content; `plan_state` stores only `{plan_key, done_n}` |
| Logs outlive workouts | `session_logs.workout_id` nulls on workout delete; logs carry frozen title/type copies |
| Starter seeding | Seed-if-library-empty at sign-in (covers new users AND backfills existing accounts naturally); starter rows tagged `source:'starter'`; user edits/deletes affect only their copies |
| Baselines | Null until first set; endpoints that need resolution return an explicit `baselines_required` error rather than guessing |

## Schema (per-user, expand-only, added to `app/server/db/schema.ts`)

- `baselines`: `user_id` pk/fk cascade, `k2_seconds` real null, `k6_seconds`
  real null, `updated_at`. Sanity bounds enforced at the API (60–240 s/500m).
- `workouts`: `id` uuid pk, `user_id` fk + index, `num` int (unique per user),
  `title` text, `type` enum('AN','O2','AT','TR'), `difficulty`
  enum('easy','medium','hard'), `pain` int CHECK 1..5, `source`
  enum('starter','user'), `steps` jsonb, `created_at`/`updated_at`.
- `session_logs`: `id`, `user_id` fk + index, `workout_id` fk **set null on
  delete**, `workout_title` text, `workout_type` text (frozen copies),
  `logged_at`, `baseline_k2`/`baseline_k6` real (PACES LOCKED AT), `held`
  enum('held','under','over'), `pain` int CHECK 1..5, `notes` text,
  `steps` jsonb (entries: `{label, targetSplit, actualSplit?, actualSource:
  'assumed'|'stopwatch'|'pm5', spm?, meters?, seconds?}`).
- `plan_state`: `user_id` pk, `plan_key` enum('sprint','head') null,
  `done_n` int default 0.
- `preferences`: `user_id` pk, `difficulties` jsonb (subset of
  easy/medium/hard, default all), `time_cap_minutes` int default 60,
  `warmup_minutes` real default 10, `warmup_override` bool default false,
  `countdown_seconds` int default 10, `pace_tolerance_seconds` real default 1,
  `accent_color` text default '#b5341f'.
- `test_history`: `id`, `user_id` fk + index, `distance` enum('2k','6k'),
  `split_seconds` real, `delta_seconds` real null, `logged_at`.

## Domain module (`app/domain/`, zero framework imports, ~100% coverage target)

- `types.ts` — `Step = WarmupStep | RepsMarker | WorkStep | RestStep |
  TestStep`; `WorkStep.duration: {kind:'time', minutes} | {kind:'distance',
  meters}`; `WorkStep`: `ref: PaceRef`, `spm?`, `rest?` minutes. Hand-rolled
  validators (`validateSteps(json): Step[] | errors`) — no zod; domain stays
  dependency-zero. Workout-level: pain 1..5, difficulty easy/medium/hard.
- `pace.ts` — `parsePaceRef` (handoff regex `^(2k|6k)\s*([+-]?\d+(\.\d+)?)?$`),
  `resolveSplit(baselines, ref, nudge=0)` = `baseline + off + nudge`,
  `toleranceRange(split, tol)`, existing `fmtSplit`.
- `expand.ts` — `liveSteps(steps)` (pre-marker once, post-marker × reps),
  `phases(workout, baselines, opts)` (rest insertion after worked rests;
  warm-up/rest/test phases labeled Easy/Rest/All out; time phases carry
  seconds, distance phases carry meters), `estimateMinutes(workout,
  baselines)` (distance steps estimated at resolved target pace, flagged
  `estimated: true`).
- `plans.ts` — ORIGINAL `sprint`/`head` sequences (84 entries: type codes +
  TEST placements), exported plain arrays + a documented rationale comment.
- `suggest.ts` — handoff behavior: `todayCode = plan[doneN]` (TEST→TR); pool =
  library filter(type) → prefs difficulties + `estimateMinutes <= cap` →
  sort by least-recently-done (from logs); empty pool → unfiltered type
  list; supports `todayPick` + shuffle inputs.
- Canonical fixtures: one starter workout with the handoff's structural shape
  (10′ warm-up + 4×[5×1′ work + 5′ rest] → 25 phases / 50′ — the math
  contract, no book content) and the distance example
  (`2500m at 2k-4, 5′ rest, ×5`).

## Data API (all `requireUser`, no-store, additive-only)

- `GET/PUT /api/baselines` — PUT `{k2Seconds?, k6Seconds?, isTestResult?}`;
  bounds-checked; `isTestResult` appends `test_history` with delta vs prior.
- `GET /api/workouts` (list, domain-validated on the way out),
  `POST /api/workouts`, `GET/PUT/DELETE /api/workouts/:id` — all writes run
  `validateSteps`; `num` uniqueness per user enforced (409 on clash).
- `POST /api/workouts/bulk` — builder paste format; returns
  `{created: [...], errors: [{line, message}]}`.
- `GET /api/logs?limit=` , `POST /api/logs` — POST body carries the session
  copy (steps with targets+actuals+sources), server freezes current
  baselines into the row and increments `plan_state.done_n` in the same
  transaction.
- `GET/PUT /api/plan` — PUT `{planKey}` or `{reset: true}`; GET returns
  `{planKey, doneN, sequence: [{index, code, status}]}` from `plans.ts`.
- `GET/PUT /api/prefs` (validated field-by-field), `GET /api/test-history`.
- `GET /api/today` — `{recommendation, reason, pool, todayCode, doneN}`;
  requires baselines (else `baselines_required` error shape) .
- Error convention: 400 `{error, field?}`, 404 for foreign/absent ids, 409
  num-clash, 422 `{error:'baselines_required'}`.

## Starter content authoring + seeding

- One reviewable file `app/server/seed/starter.ts`: ~35 workouts (all four
  types × easy/medium/hard × time bands; mix of time AND distance steps;
  original names from our own naming scheme; pain 1–5) + the two original
  plan presets. Each entry carries a one-line generation rationale comment.
- **James review gate before merge**: rendered into a readable document and
  sent for approval as an explicit plan step.
- Seeding: `seedStarterLibraryIfEmpty(db, userId)` called at sign-in
  (signInWithClaims), transactional; tags `source:'starter'`.
- Guardrails restated: no book titles/list/prose; methodology only;
  "The Erg Book" never in code identifiers, UI strings, or seed comments.

## Testing & exit criteria

- Domain: every formula/behavior in the handoff's Domain-model section has a
  passing unit test (pace math incl. negative/decimal offsets, tolerance 0,
  reps expansion, rest insertion, distance estimation, parser accept/reject
  table, suggestion pool rules); plans validated structurally (length 84,
  test placements, all codes valid, type-mix sanity).
- API unit tests with fake stores: validation, error shapes, auth guard on
  every route.
- Integration (Testcontainers): **two-user isolation across every endpoint**
  (Phase 2 obligation discharged — behavioral test, not structural);
  log-freezing (edit baselines after logging → logged paces unchanged);
  seed-if-empty rule: seed ONLY when the user's `workouts` count = 0 AND
  `session_logs` count = 0 — a rower who deliberately deleted their whole
  library but has logged history is not re-seeded; a truly fresh account is.
  Tests: new user gets 35; second sign-in doesn't duplicate; deleted-library-
  with-logs stays empty.
- Coverage ≥90 global; domain files ~100.
- Exit: all of the above green; James approved starter content; deployed; no
  TestFlight release (server/domain only — recommendation will say so).

## Out of scope

All screens (Phase 5+), PM5, generator feature, import/export, nudge
persistence UI (nudges are a per-run session concept — Phase 6 passes them
per-request; the domain accepts a nudge parameter now).
