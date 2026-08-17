# Phase PW spec 1: the post-workout summary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the post-row flow with the summary screen: heroes (avg split / measured time / erg-matching distance), interval deviation bars, an optional reflection (thumbs/held/pain/notes), and the save choices.

**Architecture:** Task 1 is a GATE on its own branch — the null-tolerant read, PR'd, merged, and tagged v0.10.1 before anything else merges (spec R-A: without it, the first empty reflection white-screens every installed build). Then on `pw-summary`: the wire addition (rest distance into the record), the stored shapes (migration + optional POST), the pure summary model with its external oracles, the screen itself, and the assertion/capture sweep.

**Tech Stack:** React 19, drizzle/Postgres migration, Vitest, Playwright. One additive wire-parse field; no enum value renames.

**VALUE AUTHORITY:** `docs/superpowers/specs/2026-08-17-post-workout-summary-design.md` — §2's tables carry every pixel/copy/formula value (gate-verified); the R-rulings bind; §7 is vetted ground implementers may cite instead of re-deriving. Numbers in this plan are convenience copies; THE SPEC GOVERNS.

## Global Constraints

- **ORDERING (R-A, hard gate):** Task 1 merges and tags v0.10.1, and James updates household devices, BEFORE Task 3 (the writer) merges. No exception.
- Spec rulings R-B through R-F bind: DISTANCE = work+rest sum (machine semantics); AVG SPLIT excludes warm-up, DISTANCE/TIME include it; TIME = measured (work + completed rests), never wall-clock on monitor doors; measured-ness per-row; SPM_MIN untouched (own PR later).
- Option B labels (James): `HELD` / `UNDER · FASTER` / `OVER · SLOWER`; stored values unchanged; UNDER=faster comment at the options array, both HeldResult copies, the pgEnum.
- Migration: next index `0009` — verify no open PR claims it first; `DROP NOT NULL` only; the `pain between 1 and 5` CHECK is left alone (NULL passes it).
- Onboarding: `isOnboardingTitle` → `Save without logging` leads, `Log against plan` demoted (6I's rule survives the toggle).
- The diagnostics rows (`MONITOR LOG · COPY`, `RECORDING · DOWNLOAD`) survive the chrome replacement.
- No em-dashes in copy; ≥46px reflection controls, ≥44px everything else; tests assert consequences with realistic fixtures (seeded library incl. multi-target and onboarding titles; the committed walk recordings as oracles); `pnpm test --project client` for src tests; e2e + screenshots FOREGROUND per task that touches app/src; per-file coverage inspected; DEVIATIONS reconciled in place.
- An honest fake: the fake transport's new rest-distance field RAMPS (a constant 0 makes the suite agree with itself).

## File Structure

- Task 1 (own branch `pw-null-reads` off main): `app/src/api/useRecentLogs.ts`, `app/src/today/Today.tsx`, `app/src/today/Today.test.tsx`
- Create: `app/src/session/summaryModel.ts` (+test), `app/src/session/PostWorkoutSummary.tsx` (+test)
- Modify: `app/domain/monitor/types.ts`, `app/domain/monitor/pm5/parse.ts`, `app/src/monitor/driver.ts`, `app/src/monitor/transports/fake.ts`, `app/src/monitor/monitorRun.ts`, `app/src/session/LogSession.tsx`, `app/src/session/logDraft.ts`, `app/src/shell/BackLink.tsx`, `app/src/shell/AppRoutes.tsx`, `app/server/db/schema.ts`, `app/server/stores/logs.ts`, `app/server/routes/data.ts`, `app/drizzle/0009_*`
- Delete: `app/src/session/SessionComplete.tsx` (route keeps a redirect)
- Sweep: `app/e2e/design.spec.ts`, `app/e2e/session.spec.ts`, `app/e2e/today.spec.ts`, `app/e2e/connected.spec.ts`, `app/e2e/screenshots.spec.ts`, `docs/design/DEVIATIONS.md`, `docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md`

---

### Task 1: THE GATE — null-tolerant reads, own branch, own PR, own tag (v0.10.1)

**Branch:** `pw-null-reads` off current main — NOT this worktree's branch. This task's PR merges and tags before Task 3 ever merges.

**Files:** Modify `app/src/api/useRecentLogs.ts`, `app/src/today/Today.tsx`; Test `app/src/today/Today.test.tsx`.

**Interfaces:** Produces: `RecentLog.held: HeldResult | null`, `RecentLog.pain: number | null`; LAST THREE meta omits absent segments (`AUG 17 · HELD · 2/5` → `AUG 17 · 2/5` → `AUG 17` — the F1 no-dash rule; segments join with ` · ` only when present).

- [ ] **Step 1: Failing test.** In `Today.test.tsx`, beside the existing LAST THREE tests: mock a log row with `held: null, pain: null` → Today renders without throwing and the row's meta reads the date alone; a `held: null, pain: 2` row reads `… · 2/5`. Run `pnpm test --project client -- Today` — red (today it throws on `.toUpperCase()` of null... verify the failure mode and record it).
- [ ] **Step 2: Implement.** Nullable types in `RecentLog`; the meta line builds from present segments only. ~10 lines.
- [ ] **Step 3: Full client suite + `pnpm e2e` foreground (Today flows) + lint/typecheck. Commit, PR** with the one-paragraph risk note (fast-path shaped in size, but its failure mode is the crash it prevents — James reviews).
- [ ] **Step 4: HOLD for James:** merge word → tag `v0.10.1` → his Xcode upload → devices updated. Only then does the rest of this plan's merge train move.

### Task 2: The wire learns rest distance

**Files:** Modify `app/domain/monitor/pm5/parse.ts`, `app/domain/monitor/types.ts`, `app/src/monitor/driver.ts`, `app/src/monitor/monitorRun.ts` (recordActual passthrough only), `app/src/monitor/transports/fake.ts`; tests beside each.

**Interfaces:** Produces: `IntervalActual.restDistanceMeters: number` (additive; 0 when the wire reports none); `parseSplitIntervalData` surfaces the field (0x0037 bytes — the anchor pass decoded them; read the existing offsets rather than guessing); the fake's boundary events carry a nonzero ramp.

- [ ] **Step 1: Failing tests:** parse.ts test decodes a real 0x0037 hex from `docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl` (rest distances 0/30/22/12/0 across its boundaries per the anchor's table — verify against the actual bytes) → the parsed field matches; driver test: an intervalComplete actual carries it; monitorRun round-trip keeps it; a stored record WITHOUT the field loads with it absent/undefined handled (never-migrate: old records read as 0-rest-distance via `?? 0` at consumers, not migration).
- [ ] **Step 2: Implement; the fake ramps (e.g. 8/12/6m across scripted rests — nonzero, unequal).**
- [ ] **Step 3: Full suite + replay tests still green (the recordings now yield the field — if `registerReplay.test.ts` pins actual shapes, update deliberately). Coverage. Commit.**

### Task 3: Stored shapes + API optionality

**Files:** Modify `app/server/db/schema.ts`, new `app/drizzle/0009_*` migration, `app/server/stores/logs.ts`, `app/server/routes/data.ts`, `app/src/api/useRecentLogs.ts` (thumbs type), `app/src/session/LogSession.tsx` (useLogForm: thumbs state, gate removal — UI consumed in Task 5); tests: `data.test.ts`, store contracts, integration.

**Interfaces:** Produces: `thumbs` pgEnum (`up`,`down`), nullable column `session_logs.thumbs`; `held`/`pain` nullable; POST accepts all reflection fields absent/null, rejects invalid members 400 as today; `useLogForm` exposes `thumbs` and never disables Save on empty reflection.

- [ ] **Step 1: Failing tests:** POST with no held/pain/thumbs → 201, row nulls; POST old shape (held+pain present) → 201 (v0.10.0 clients keep working); POST `held:"sideways"` / `thumbs:"left"` → 400 field-named; store contract null round-trips; integration: the migration applies against seeded rows (existing rows keep values).
- [ ] **Step 2: Migration** (`DROP NOT NULL` ×2 + enum + column; CHECK untouched — say so in the migration comment), generate with index 0009 after checking open PRs. **Step 3: Implement server + client types + form state. Full suite incl. integration. Coverage. Commit.**

### Task 4: `buildSummaryModel` — the pure model with external oracles

**Files:** Create `app/src/session/summaryModel.ts` + `summaryModel.test.ts`.

**Interfaces:** Consumes per door: `{ steps: LogStep[], run?: MonitorRun, sessionRun?: SessionRun, workout? }` (design the input union; say why in the header). Produces: `SummaryModel = { meta: {dateLabel, timeLabel, sourceLabel}, heroes: {avgSplit?: string, time?: string, distanceMeters?: number}, rows: SummaryRow[], caption?: string }` — exact shapes are the implementer's with the spec's tables as the contract; Task 5 consumes.

- [ ] **Step 1: Failing tests, the oracles first (spec §5):** replay-derived fixtures from BOTH committed recordings — `walk-2026-08-17/step-4` (keystone: DISTANCE === 500, the a-priori truth) and `walk-2026-08-16/session-2` shapes (DISTANCE === 1599 — machine TWD; a work-only regression reads 1535 and FAILS); TIME = Σ splitTime + completed rests (walk-3 shape: 60+60+120+0+30+30 = 300 → `5:00`); AVG SPLIT excludes the warm-up (walk-3: `2:20.2` not `2:40.4`).
- [ ] **Step 2: Edge tests:** Σd=0 → avgSplit and distance absent, time-only fallback; per-cell absence; warm-up row present unjudged; deviation signs (+ slower / − faster vs the working average), clamp edges (1.2% floor, 50% cap); mixed measured/prescribed rows (stopwatch door); interrupted run's date = startedAt; all-prescribed caption rule.
- [ ] **Step 3: Implement. 100%×4 on the file. Commit.**

### Task 5: The screen — replace the flow

**Files:** Create `app/src/session/PostWorkoutSummary.tsx` (+test); Modify `app/src/session/LogSession.tsx` (doors render the summary; LogScreen chrome dies; diagnostics rows survive at the bottom), `app/src/shell/BackLink.tsx` (optional label prop), `app/src/shell/AppRoutes.tsx` (`/session/complete` → redirect), `app/src/index.css`; Delete `app/src/session/SessionComplete.tsx` (+its test file's assertions move where they still apply).

**Interfaces:** Consumes Tasks 3+4. Produces the spec §2 screen: 2A title block, 2B heroes, 2D reflection (option-B labels, the single-target hint rule — exactly-one-distinct-ref, else none; `BY FEEL` only by-hand), 2E list (README §8 geometry, judged tokens, legend), 2F save stack (plan position on the button, onboarding ordering, no-plan hiding, staged discard per door).

- [ ] **Step 1: Failing tests** per §2 group (component tests assert structure/copy/behavior; numbers via the model tests already); the three doors' convergence (each renders the summary; monitorModeRun gate tests untouched); the finish stage navigates to the summary; the redirect; onboarding button order; save posts thumbs; each save button's advancesPlan value; clearability of every reflection control.
- [ ] **Step 2: Implement + CSS** (reflection ≥46px targets; new pairings' contrast computed with numbers in the report).
- [ ] **Step 3: The breaking-test sweep IN THIS TASK:** every e2e flow through the old log screen (session.spec, today.spec, connected.spec, onboarding.spec — grep `HELD`, `Pain 2`, `DID YOU HOLD`), the log-* screenshot specs, `getByRole name:"HELD"` unit sites — updated to the new copy (`UNDER · FASTER` etc.) and flow. Full `pnpm test` + `pnpm e2e` + `pnpm screenshots` FOREGROUND; open every log/summary capture and describe it. Coverage. Commit.

### Task 6: Property sweep, walk sheet, reconciliation

**Files:** Modify `app/e2e/design.spec.ts` (summary property-table blocks — one named witness per §2 row: computed styles, boundingBoxes, absence checks, the legend, the onboarding order), `docs/design/DEVIATIONS.md` (row 40 PACES LOCKED + any row the rewrite staled — in place, by content), `docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md` (the F-1 row re-pointed: the TIME cell in `m:ss`, expected value from the completed intervals, the record-dump step kept).

- [ ] **Step 1: Design assertions per §2 (incl. `← DONE`, the 2px rule, Newsreader title, hint presence/absence by fixture, diagnostics rows witnessed).**
- [ ] **Step 2: Walk sheet + DEVIATIONS.** **Step 3: Full gates; captures opened; both vitest summary lines; commit.** The v0.11.0 notes obligation (times read lower; reflection optional; the summary itself) is recorded in the PR body for the notes PR that follows the merge.

---

## Self-review

- Spec coverage: R-A→Task 1; R-B→Tasks 2+4; R-C/R-D/R-E→Task 4 (+5 render); option B + hint rule→Task 5; 2F entire→Task 5; §5 oracles→Task 4 step 1; §6 criteria: 1→T6, 2→T1, 3→T5, 4→T4, 5→T6 walk sheet + notes note, 6→T3, 7→T5.
- Placeholders: none; values live in the spec's gate-verified tables by design.
- Type consistency: `restDistanceMeters` (T2→T4), `SummaryModel` (T4→T5), `thumbs` (T3→T5), BackLink label (T5 internal).
