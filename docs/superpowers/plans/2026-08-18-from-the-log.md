# From the Log Implementation Plan (Phase PW spec 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any past session opens from history, Today, or Plan showing the stored summary, and its reflection becomes answerable after the fact (the API's first UPDATE).

**Architecture:** Write side first (migration 0010: stored heroes + plan linkage, POST additions), then the read/update API (cursor, GET /:id, PATCH, ?plan=), then the model exports its numbers and the doors post them, then the two screens (`/today/log` list, `/today/log/:id` overlay detail), then Plan's tap and the §4 navigation-witness task.

**Tech Stack:** Existing: Express 5 + drizzle + Postgres, React 19, the house test pyramid (storeContracts, data.test integration, client, e2e/design).

## Global Constraints

- VALUE AUTHORITY: `docs/superpowers/specs/2026-08-18-from-the-log-design.md` — §2 stored shapes, §3 API, §4 navigation burns N1-N7, §5 property tables, §7 exit criteria. THE SPEC GOVERNS over any brief slice on mismatch.
- TRIAD: stored shapes + stored numbers. Full treatment already applied at spec (antagonist pass, folded); PM final-PR gate at the end.
- Routes are `/today/log` and `/today/log/:id` (under the TODAY tab — spec §4 N7). The detail view is an OVERLAY SCREEN with its own scroller (N3; the Reader mechanism).
- Hero columns are `double precision`, never `real` (spec §2, measured float4 truncation). Heroes posted as NUMBERS (the model's underlying seconds/meters), never display strings.
- Cursor = row id resolved in SQL; `ORDER BY logged_at DESC, id DESC`. The timestamp NEVER round-trips through the client (spec §3, proven row loss).
- PATCH ignores unknown keys (POST/prefs precedent); field-named 400s for bad VALUES only; empty patch = no-op read.
- Plan linkage: atomic upsert `.returning({doneN, planKey})`; `plan_index = doneN - 1`; both fields null when returned planKey is null. Read side resolves duplicates NEWEST-WINS.
- API additive-only (standing rule); the ONE sanctioned removal is `steps` from the list response, with the zero-consumer proof pinned.
- Option-B labels everywhere (`HELD / UNDER · FASTER / OVER · SLOWER`); no em-dashes in user-facing copy; 44px targets (46px reflection controls); WCAG AA computed.
- Commands in `app/`; `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first; `pnpm test --project client` for src tests (never unit); e2e + screenshots FOREGROUND (blocking, 590000ms) before done when `app/src` changes; per-file coverage inspected.
- Every task: failing test first, self-mutation on its keystone guard (red then byte-identical restore, diff-verified), `git rev-parse --show-toplevel` before every commit.

---

### Task 1: Migration 0010 and the write side

**Files:** Create `app/drizzle/0010_*.sql`; Modify `app/server/db/schema.ts` (sessionLogs + doc comments), `app/server/stores/logs.ts` (`LogInput`, `create()`), `app/server/routes/data.ts` (POST validation); Test `app/server/stores/storeContracts.ts`, `app/server/routes/data.test.ts`, integration.

**Interfaces:** Produces columns `avg_split_seconds` (double precision), `time_seconds` (double precision), `distance_meters` (integer), `plan_key` (text), `plan_index` (integer) — all nullable; `LogInput` gains `avgSplitSeconds?: number | null; timeSeconds?: number | null; distanceMeters?: number | null` (linkage is NEVER client input); `create()` returns unchanged.

- [ ] Migration: exactly five `ALTER TABLE "session_logs" ADD COLUMN` lines, nullable, no defaults, no backfill. Schema columns with spec §2's rationale comments (incl. the float4 rejection).
- [ ] Failing tests first: storeContracts round trip for the three heroes through REAL Postgres including the B8 probe — insert `2.7182818284`, read back equal (prove the probe CAN go red: a scratch `::real` cast query shows `2.7182817`, cited in the test comment, not committed as product code).
- [ ] POST accepts the three hero fields, each optional/nullable; bounds per spec §2 (finite, positive, `avg_split_seconds <= 3600`, `distance_meters <= 1000000` whole, `time_seconds <= 604800`), field-named 400s. The v0.11.0 body shape (no hero keys) still 201s and stores null-null-null — pinned with the exact old body (criterion 2/6).
- [ ] Linkage: `create()`'s advancing branch changes the plan_state upsert to `.returning({ doneN: planState.doneN, planKey: planState.planKey })`; write `plan_key = returned.planKey`, `plan_index = returned.doneN - 1` on the log row IN THE SAME TRANSACTION; both null when returned `planKey` is null. Integration tests: advancing save stamps (key, index); non-advancing save stores null/null; no-plan-chosen advancing save stores null/null; two sequential advancing saves stamp consecutive indexes.
- [ ] Self-mutation: drop the `- 1` (index off by one) and the null-planKey guard; both red; restore. Full `pnpm test`. Commit.

### Task 2: The read and update API

**Files:** Modify `app/server/stores/logs.ts` (`list` projection + cursor + `get` + `update` + `listPlanLinks`), `app/server/routes/data.ts` (query params, `GET /api/logs/:id`, `PATCH /api/logs/:id`, `?plan=`); Test storeContracts, data.test.ts, `app/server/routes/isolation.integration.test.ts` pattern for owner checks.

**Interfaces:** Consumes Task 1's columns. Produces: list rows = previous shape MINUS `steps` PLUS the five new fields; `GET /api/logs/:id` → full row incl. steps; `PATCH` body `{thumbs?, held?, pain?, notes?}`; `GET /api/logs?plan=<key>` → `{ links: { planIndex: number; id: string }[] }`.

- [ ] Cursor, failing test first — the red-proven trap (criterion 9): seed two rows in the SAME millisecond (explicit `loggedAt` values differing only in microseconds via SQL `timestamp '... .000123'`), paginate `limit=1`, both rows returned across pages. Implementation: `WHERE (logged_at, id) < (SELECT logged_at, id FROM session_logs WHERE id = $before AND user_id = $user)` + `ORDER BY logged_at DESC, id DESC` (drizzle `sql` fragment; the timestamp never leaves SQL). Unknown/foreign `before` id → 400 field-named.
- [ ] List projection: explicit column select WITHOUT steps; pin the zero-consumer proof (test asserting `RecentLog`'s keys never included `steps` — grep-derived, asserted against the exported type via a type-level test or runtime key check on the response).
- [ ] `GET /api/logs/:id`: owner-checked single row, steps included; 404 on absence AND on another user's id (isolation test both directions, no existence leak).
- [ ] `PATCH /api/logs/:id`: any subset of the four; `null` clears; absent leaves alone; unknown keys IGNORED (test: `{steps: [...], banana: 1}` → 200, row unchanged except accepted keys); empty body → 200 no-op read; value validation reuses POST's validators by IMPORT (one copy — test a bad member gets POST's exact message); owner 404s as above.
- [ ] `?plan=<key>`: newest-wins per index (`DISTINCT ON (plan_index) ... ORDER BY plan_index, logged_at DESC` or equivalent); test the reset collision: two logs same (key, index), the later `loggedAt` wins; invalid key → 400.
- [ ] Self-mutation: cursor tiebreak removed (red via the same-millisecond test); newest-wins flipped to oldest (red). Full `pnpm test`. Commit.

### Task 3: The model's numbers and the doors that post them

**Files:** Modify `app/src/session/summaryModel.ts` (`SummaryHeroes`), `app/src/session/LogSession.tsx` (`useLogForm`'s body assembly), `app/src/api/useRecentLogs.ts` (`RecentLog`); Test summaryModel.test.ts, LogSession.test.tsx.

**Interfaces:** `SummaryHeroes` gains `avgSplitSeconds?: number; timeSeconds?: number` — each present EXACTLY when its display string is, formatted-from (`avgSplit = fmtSplit(avgSplitSeconds)`, `time = fmtDuration(timeSeconds / 60)` — the formatter takes MINUTES, spec §2's documented trap). `RecentLog` gains `avgSplitSeconds: number | null; timeSeconds: number | null; distanceMeters: number | null; planKey: string | null; planIndex: number | null` and LOSES nothing (it never had steps).

- [ ] Failing tests: for each door's model, string-number agreement (`heroes.avgSplit === fmtSplit(heroes.avgSplitSeconds!)` when present; same for time; absent together) — this pins the pairing INSIDE the model where one derivation lives; the storage truth lives in Task 1's contract test.
- [ ] `useLogForm`'s body: spread `avgSplitSeconds/timeSeconds/distanceMeters` from the door's model when present (all three doors post through the same body assembly — verify per-door tests post them: monitor, timer, manual/by-hand where the model shows no heroes → keys absent).
- [ ] `RecentLog` parses the new fields; existing consumers untouched (Today's LAST THREE compiles unchanged).
- [ ] Self-mutation: post `timeSeconds` as `time` string (red via the posting test's typeof assertion). `pnpm test --project client`, full `pnpm test`, `pnpm e2e` foreground (src changed). Commit.

### Task 4: The history list

**Files:** Create `app/src/log/HistoryList.tsx` (+test), `app/src/log/useLogHistory.ts` (+test), `app/src/log/logScroll.ts` (save/restore, News's guarded pair); Modify `app/src/shell/AppRoutes.tsx` (`/today/log`), `app/src/shell/TabBar.tsx` (`CLEAR_ON_TAB["/today"]` also clears log scroll), `app/src/today/Today.tsx` (LAST THREE heading → `ALL SESSIONS` link; rows → links), `app/src/index.css`; Test + e2e.

**Interfaces:** Consumes Task 2's cursor API + Task 3's `RecentLog`. Produces route `/today/log`; `useLogHistory(): { state: "loading" } | { state: "error"; retry } | { state: "ready"; logs: RecentLog[]; loadMore: () => void; exhausted: boolean }`.

- [ ] Failing tests: list renders the LAST THREE row idiom + hero snippet per spec §5G (`AVG 2:04.5 · 5,000 m`, segments absent when null — realistic fixture with old-row nulls); empty state reuses `No sessions logged yet.`; loadMore appends without reorder; error state per `useRecentLogs` idiom.
- [ ] Scroll: `logScroll.ts` copies News's EXACT pair (the `isConnected`-guarded throttled save at `News.tsx:200-220`, restore on mount, clamp to available height); restore only within loaded rows (spec N2's honesty rule — deep offsets clamp to first-page bottom). `CLEAR_ON_TAB["/today"]` clears it (the fresh-visit door).
- [ ] Today: heading becomes the `ALL SESSIONS` link to `/today/log` (44px target); each LAST THREE row wraps in a link to `/today/log/:id` carrying `location.state.from = "/today"`.
- [ ] e2e (part of this task, N2's witness lands fully in Task 6's sweep): scroll deep → open row → back → offset survived, under CPU throttle; instrumented-write assertion (no `0` saved while a real offset exists — PR #84's recipe).
- [ ] Self-mutation: remove the `isConnected` guard (red via the instrumented-write test). Full gates: `pnpm test`, `pnpm e2e`, `pnpm screenshots` (new screen: seed ≥4 sessions incl. a null-hero old row, open the capture, look). Commit.

### Task 5: The from-the-log view

**Files:** Create `app/src/log/FromTheLog.tsx` (+test), `app/src/log/storedSummary.ts` (+test: stored row → the §5 view model); Modify `app/src/session/PostWorkoutSummary.tsx` (export the presentational pieces it already renders — meta/heroes/rows — parameterized, no behavior change to the live door), `app/src/shell/AppRoutes.tsx` (`/today/log/:id` as overlay), `app/src/index.css`; Test + e2e.

**Interfaces:** Consumes `GET /api/logs/:id` + PATCH (Task 2). Produces `buildStoredSummary(row: StoredLog): StoredSummaryView` — heroes formatted from stored numbers (`fmtSplit`, `fmtDuration(s/60)`), rows judged only when `avg_split_seconds` non-null AND ≥2 steps carry `actualSplit` (spec §5C, divergence-toward-absence), source per §5A (deviceName → `stopwatch` → BY HAND).

- [ ] Failing tests on `buildStoredSummary` first (pure, heaviest coverage): §5A source derivation ×3; §5B per-cell absence incl. all-null old row (block absent); §5C judged gating both legs + the abstention; §5E footer (`Logged to <title> · SESSION <n> OF <len>`, unknown plan_key renders the key verbatim); §5D segment-line rule (notes-only → no segment line).
- [ ] The screen: overlay scroller (Reader mechanism — own scroller, fresh node, N3); eyebrow `FROM YOUR LOG`; BackLink per N5 (label from `location.state.from`: `← LOG` / `← PLAN` / `← TODAY`, cold deep link → `← LOG` to `/today/log`); read-back per §5D; Edit swaps in spec 1's reflection card (four clearable controls, 46px), Save PATCHes the changed subset (in-flight disable, field-named error re-enable), Cancel reverts in place; edit is in-page state, pushes no history (N6); not-found per §5F (`This session is gone.`).
- [ ] N1 in-task: mount-side-effect test — localStorage byte-identical after visiting both routes (the `e2e/session.spec.ts:900` idiom).
- [ ] e2e: the full criterion-3 round trip — save with everything skipped, open from history, answer all four, reload cold, answers persist; clear one via the UI, reads back cleared.
- [ ] Self-mutation: judged-gating dropped (red); PATCH sends unchanged fields (red via subset assertion). Full gates + screenshots (detail capture: real session, reflection answered, plan footer visible — open it, recompute the hero from its rows per recurring failure #7). Commit.

### Task 6: Plan's tap, the §4 witness sweep, reconciliation

**Files:** Modify `app/src/plan/Plan.tsx` (done rows → links via `?plan=` fetch), `app/e2e/design.spec.ts` (§5 property witnesses), `app/e2e/` (the N1-N7 sweep in ONE named describe — spec §4's own requirement), `docs/design/DEVIATIONS.md`, `ROADMAP.md` (spec 2 status), the phone-pass list in `docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md` (criterion 8's device item); Test + e2e.

**Interfaces:** Consumes Task 2's `?plan=` + Task 5's route.

- [ ] Plan: one fetch on mount when a plan is active; done rows with a link (newest-wins already server-side); rows without linkage (pre-spec-2) stay plain text — test both. 44px targets preserved.
- [ ] The §4 sweep, one describe, one witness per burn: N1 (both routes side-effect-free), N2 (the Task-4 scroll witness moves/lands here complete), N3 (structural: overlay class + own scroller + top-on-open; the comment names the harness blindness and points at criterion 8), N4 (cold deep link, 404 id, auth redirect), N5 (label = destination ×3 origins + cold fallback), N6 (BACK mid-edit discards without trap; in-flight PATCH + BACK lands consistent), N7 (TODAY lit on both routes; tab tap pops to Today root AND clears scroll).
- [ ] Design witnesses per §5 rows not already covered (5F copy, 5G snippet formatting, read-back dashed block, edit card 46px + contrast computed with numbers in the report).
- [ ] DEVIATIONS: reconcile any row the new screens stale; ROADMAP: spec 2 status line; RUNSHEET: criterion-8 phone-pass item appended.
- [ ] Full gates: `pnpm test` (both summary lines), `pnpm e2e`, `pnpm screenshots`, per-file coverage for every file this plan created. Commit.

---

## Self-review

- Spec coverage: §1→T4/T5 (routes, surfaces), §2→T1 (+T3 posting), §3→T2, §4→T5 (N1) + T4 (N2 partial) + T6 (the sweep), §5→T5 (+T4 5G), §7: c1→T6, c2/c6→T1, c3→T5, c4→T6 (Plan tests incl. reset footer via T1's linkage semantics + T2's newest-wins), c5→T1 (contract round trip) + spec-1 oracle rides T3's model tests, c7→post-merge notes PR (recorded), c8→T6 (RUNSHEET), c9→T2.
- Placeholders: none; exact values live in the spec's tables by design (house pattern).
- Type consistency: `LogInput` hero field names (T1) = POST keys (T1) = `SummaryHeroes` number names (T3) = `RecentLog` fields (T3); `buildStoredSummary`/`StoredSummaryView` (T5) consumed only in T5/T6; `useLogHistory` shape (T4) matches `useRecentLogs` idiom.
