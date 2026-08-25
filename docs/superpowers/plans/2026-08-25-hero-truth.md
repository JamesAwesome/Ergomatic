# Hero Truth Implementation Plan (RC-5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A saved session's three big numbers stop contradicting each other: work-only, one population, taken from the machine itself where the machine spoke, with the wall-clock total on its own line beneath.

**Architecture:** Two tiers at the read seam. A stored row that carries the machine's own totals renders them verbatim (including the machine's own average split, newly stored in the existing jsonb blob); every other row computes the same quantities from its own recorded actuals. The TOTAL line derives rest from columns every row already has. No migration, no new column, no change to what the monitor writes.

**Tech Stack:** React 19 client (`app/src/log/`, `app/src/session/`), Express 5 + Drizzle read paths (`app/server/stores/logs.ts`), Vitest client/unit/integration, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-hero-truth-design.md` — antagonist full pass DONE (held the premise, killed the original construction), James's fork ruling folded in, rower design review folded in. Read §1/§2/§3/§4 before any task.

## Global Constraints

- TRIAD (what three displayed numbers MEAN). Failing test first everywhere; per-file coverage on touched files; `pnpm e2e` AND `pnpm screenshots` before done (log surfaces change).
- **Tier A** = the row has `machineWorkSeconds` AND `machineWorkMeters`. Render them verbatim; AVG SPLIT renders the machine's own `avgPaceSecondsPer500m`. **Never a quotient of ours on tier A** — the PM5 truncates (159.8 where the quotient is 159.868), we round.
- **Tier B** = everything else. Σ work metres / Σ work seconds from the row's own actuals, AVG SPLIT = one quotient over that summed pair. Never claims to be the machine's; no badge, no marker (rower ruling: the MACHINE CONFIRMED block's absence is the tell).
- **Tier B's DISTANCE/TIME must not move for legacy warm-up rows** — `summaryModel.ts`'s KEEP exclusion is about JUDGING, not about what happened; a null-index or sub-threshold actual stays counted in DISTANCE/TIME and stays out of AVG SPLIT, exactly as today.
- TOTAL line copy, exact: `4:04 total · plus 242 m coasting in rest` (middle dot, no em-dash, "coasting" never "during" — the rower's own correction). Rest sources in order: stored `restSeconds`/`restMeters`; else derive from the fused columns (`timeSeconds − Σ actualSeconds`, `distanceMeters − Σ actualMeters`); else total alone with NO rest clause. **Never a partial sum of per-interval rests** (`monitorRun.ts` forbids it by name).
- **Placement is a requirement:** the TOTAL line renders in the same viewport as the three heroes — no scroll, no collapse, no lazy render.
- The `machine_summary` blob gains ONE additive key (`avgPaceSecondsPer500m`); it is untyped jsonb by design, so no migration and no schema change. The server validator's existing shape checks stay as they are.
- Run tests as `pnpm test --project unit|client|integration` (never bare vitest); grep "Test Files" not just "Tests".
- `git rev-parse --show-toplevel` before every commit (worktree `.claude/worktrees/hero-truth`).

---

## File map

- `app/src/monitor/monitorRun.ts` + `app/src/monitor/driver.ts` — `MachineSummaryDetail` gains `avgPaceSecondsPer500m`; the event/writer carry it (Task 1)
- `app/src/session/LogSession.tsx` — the save posts it inside `machineSummary` (Task 1)
- `app/src/session/summaryModel.ts` — the live post-workout heroes + TOTAL line (Task 2)
- `app/src/log/storedSummary.ts` + `app/src/log/FromTheLog.tsx` — the stored-row heroes, the TOTAL line, the corrected MACHINE CONFIRMED caption (Task 3)
- `app/server/stores/logs.ts` + `app/src/log/LogRow.tsx` — the history list's tier logic (Task 4)
- `ROADMAP.md`, spec, captures (Task 5)

### Task 1: store the machine's own average split

**Files:**
- Modify: `app/domain/monitor/types.ts` or `app/src/monitor/monitorRun.ts` (wherever `MachineSummaryDetail` is declared — grep it), `app/src/monitor/driver.ts` (the `summaryObservationsEvent` detail literal), `app/src/session/LogSession.tsx` (the save payload spreads `summaryDetail`, so verify it carries through)
- Test: `app/src/monitor/burstReplay.test.ts` (the keystone replay already asserts the nine fields — add the tenth), `app/src/session/LogSession.test.tsx`

**Interfaces:**
- Produces: `MachineSummaryDetail.avgPaceSecondsPer500m: number` — verbatim from `parseEndOfWorkoutSummary` (already decoded at `parse.ts`, `readU16LE(bytes,18)/10`), SECONDS per 500m, already descaled. Task 3 renders it.

- [ ] Step 1: failing test — extend the burst replay's `summaryDetail` expectation with the capture's own value, derived from the raw bytes in the test with the arithmetic in a comment (keystone: offsets 18-19 `6b 05` → 0x056b = 1387 → **138.7**). Run: `pnpm test --project client -- burstReplay` — FAIL (field absent).
- [ ] Step 2: add the field to the type (doc comment: seconds per 500m, already descaled, the machine's OWN computed average — this is what the log detail renders on tier A, never a quotient of ours), to the driver's detail literal (field-by-field, no spread), and confirm the save payload carries it (it spreads `summaryDetail`, so a test asserting the POST body contains it is the check).
- [ ] Step 3: green; full unit+client; lint; typecheck.
- [ ] Step 4: commit `feat: the record keeps the machine's own average split`.

### Task 2: the live post-workout heroes + the TOTAL line

**Files:**
- Modify: `app/src/session/summaryModel.ts` — `monitorDistanceMeters`, `monitorTimeSeconds`, `monitorAvgSplit`, `monitorHeroes`; add the TOTAL-line model field
- Modify: the post-workout summary component that renders `SummaryHeroes` (grep `PostWorkoutSummary`)
- Test: `app/src/session/summaryModel.test.ts`, the component's test

**Interfaces:**
- Produces: `SummaryHeroes` gains `totalLine?: string` (or a structured `{ totalSeconds, restMeters? }` — implementer's call, but the FORMATTED string must be built in one place, not twice). Task 3 reuses the same builder for the stored screen — export it.

- [ ] Step 1: failing tests, all from the walk's own numbers (exit-7 fixture: two 250m actuals, 67.9s/56.1s, rest 60s×2, 147+95 m):
  - tier A run (machine totals present): DISTANCE 500, TIME 124, AVG SPLIT renders the machine's 2:04.0 — NOT a quotient.
  - tier B run (no machine totals): DISTANCE 500, TIME 124, AVG SPLIT 2:04.0 from one quotient.
  - a legacy run WITH a `wu` actual: DISTANCE/TIME unchanged from today's values (assert the exact numbers today's code produces — read them off the current test's expectations), AVG SPLIT unchanged.
  - a run with a null-index actual: it stays IN distance/time, OUT of avg split.
  - the TOTAL line: `4:04 total · plus 242 m coasting in rest`; a no-rest run renders `2:19 total` with no rest clause; a run with stored rest uses it, a run without derives it from the fused pair.
- [ ] Step 2: run red (`pnpm test --project client -- summaryModel`).
- [ ] Step 3: implement. `monitorDistanceMeters`/`monitorTimeSeconds` become tier-aware; `monitorAvgSplit` returns the machine's value on tier A. Keep every existing exclusion comment and extend it with WHY it does not become the population's definition (spec §1's correction).
- [ ] Step 4: green; full projects; per-file coverage on `summaryModel.ts`.
- [ ] Step 5: commit `feat: the live summary's three numbers agree, and the total gets its own line`.

### Task 3: the stored row (log detail) + the caption

**Files:**
- Modify: `app/src/log/storedSummary.ts` (`buildHeroes` ~line 249; `StoredLog` already carries the machine fields from #190 — verify `machineSummary`'s type admits the new key), `app/src/log/FromTheLog.tsx` (render the TOTAL line; correct the MACHINE CONFIRMED caption)
- Test: `app/src/log/storedSummary.test.ts`, `app/src/log/FromTheLog.test.tsx`

**Interfaces:**
- Consumes: Task 2's exported TOTAL-line builder (one definition, two screens).

- [ ] Step 1: failing tests — a stored tier-A row renders 500 / 2:04 / 2:04.0 + the total line; a stored tier-B row (machine fields null, steps present) renders the same quantities computed from `steps`' `actualMeters`/`actualSeconds`; a row predating `actualMeters` (all null) renders its stored heroes UNCHANGED and the total line WITHOUT a rest clause (never a dash for distance — assert the stored value still shows); the caption no longer says the totals include rest.
- [ ] Step 2: run red.
- [ ] Step 3: implement. **The caption's new text** (it must stay true — the heroes are now work-only, the CHART is still rest-inclusive-ish and its axes are rower-dependent): `Rest metres excluded, here and in the totals above. The chart below still spans rest.` — three render sites to update (component, its test, `e2e/screenshots.spec.ts`).
- [ ] Step 4: green; full projects; coverage.
- [ ] Step 5: commit `feat: the stored row shows the machine's own numbers, and the caption tells the truth`.

### Task 4: the history list cannot disagree with the detail

**Files:**
- Modify: `app/src/log/LogRow.tsx` (~line 53-64) and whatever builds its input; `app/server/stores/logs.ts` `LOG_LIST_COLUMNS` **only if needed** — it ALREADY carries `workSeconds`/`workMeters`/`machineWorkSeconds`/`machineWorkMeters` (verified), but EXCLUDES `machineSummary`, so the machine's avg pace is not available to the list.
- Test: `app/src/log/HistoryList.test.tsx` or `LogRow`'s test; `app/server/**` integration if the projection changes.

**Interfaces:**
- The list renders the same tier logic for DISTANCE. For AVG SPLIT on tier A the machine's own value is NOT in the projection; **do not ship a quotient in the list beside a machine value in the detail** — that recreates the defect one screen over. Resolve it one of two ways, implementer's judgment, stated in the report: (a) project just that key (`machine_summary->>'avgPaceSecondsPer500m'`) as a scalar in `LOG_LIST_COLUMNS` — a narrow jsonb path, no blob, no migration; or (b) the list omits AVG SPLIT on tier A rows rather than printing a different number. **(a) is preferred; if it proves impractical, take (b) and say why.**

- [ ] Step 1: failing test — a list row for a tier-A session shows the same DISTANCE (and the same AVG SPLIT, under (a)) as its detail screen for the same fixture; a tier-B row shows the computed pair; a pre-`actualMeters` row shows its stored fused value unchanged.
- [ ] Step 2: run red; implement; green.
- [ ] Step 3: if the projection changed, run `pnpm test --project integration` (real Postgres) and assert the list response carries the new scalar and no blob.
- [ ] Step 4: commit `feat: the history list and the detail agree about the same session`.

### Task 5: captures, ROADMAP, spec reconciliation

- [ ] Step 1: `pnpm e2e`, then `pnpm screenshots`. The captured log-detail row IS the exit-7 piece (from #192), so the capture must now show **500 / 2:04 / 2:04.0** with `4:04 total · plus 242 m coasting in rest` beneath and the MACHINE CONFIRMED block agreeing at 500. **Open every changed PNG and look** — recompute in-frame: the two interval rows (250 + 250) must sum to the DISTANCE hero, and 500 + 147 + 95 = 742 must equal the total line's implied fused distance.
- [ ] Step 2: ROADMAP — tick RC-5 with what shipped and the two-tier ruling; add the rower's two open complaints as their own items (PARTIAL on abandoned pieces; the chart-axis contradiction now MORE visible, appended to the existing axis-quantity item); note the tier-B honest-gap fact (the machine disagrees with the sum of its own rows by ~2m).
- [ ] Step 3: `docs/monitor/pm5-interface-notes.md` — record the two facts the antagonist established: the PM5 TRUNCATES pace (two captures), and its Totals row is not the sum of its own displayed rows (901 vs 899). Also close the stale claims the pass found: `monitorRun.ts`'s "every committed capture's last boundary reads rest 0" (false — exit-7 seq 53 reads 60s/95m) and `LogStep.actualSeconds`' UNIT CAVEAT (settled work-only by that same boundary).
- [ ] Step 4: commit `docs+captures: the heroes tell one story, and the notes carry the truncation fact`.

---

## Self-review record

- Spec coverage: §1 tier A (T1 storage, T2/T3 render), tier B (T2/T3), exclusions correction (T2), warm-up ruling (T2); §2 total line + copy + placement (T2/T3); §3 list consistency (T4), caption (T3); §4 oracles — the discriminating terminate capture (T1's replay covers the field; T2 asserts render), the tolerance-scoped invariant (T2), realistic fixtures throughout; exit criteria 1-5 mapped (1→T5 capture, 2→T2, 3→T1/T2, 4→T3, 5→N/A superseded by the fork ruling — the population split is now DELIBERATE and named, and the plan says so).
- Type consistency: `avgPaceSecondsPer500m` defined T1, consumed T2/T3/T4; the TOTAL-line builder exported T2, reused T3.
- Known plan risk, stated: Task 4's option (a) needs a Drizzle jsonb path in a projection — if the ORM makes that awkward the implementer must NOT silently fall back to a quotient.
