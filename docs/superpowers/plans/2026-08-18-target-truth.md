# Target Truth Implementation Plan (Phase LT spec 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every interval row shows its target and is judged against it — with the erg's own ±0.5s band — and the stroke rate we already record finally renders.

**Architecture:** Data first (the `actualSpm` split, the floor, server bounds), then the model (band extraction + re-baseline in `summaryModel`), then both renderers (live summary + from-the-log, one rule), then the witness sweep and captures.

**Tech Stack:** Existing throughout; no new dependencies.

## Global Constraints

- VALUE AUTHORITY: `docs/superpowers/specs/2026-08-18-target-truth-design.md` — §1's table (judged-when member set, abstains-when split, the band), §2's table (the split, the discriminant, the floor, the ruled cell), §4, §6. THE SPEC GOVERNS on any mismatch.
- TRIAD: number meaning (row judgment re-baseline) + stored shape (`actualSpm` in steps jsonb, the floor). Antagonist anchor already run and folded; PM final-PR gate at the end.
- THE BAND IS ONE CONSTANT: `ON_TARGET_BAND_SECONDS` (±0.5) extracted from `surfaceModel.ts` to a shared module; both surfaces import it; a drift test fails if either grows its own copy. Within band: ON TARGET — plain ink, no bar, no ±.
- Judged when: `targetSplit` present AND `actualSource ∈ {"pm5", "stopwatch"}` — NEVER `"assumed"` (they equal their targets by construction; judging them paints the by-hand door `+0.0` red).
- TARGET cell keys on `targetSplit` alone; bar/± key on judgeability.
- SPM cell RULED `24 / 22`: measured first, authored target after the slash in quiet ink; absent halves drop.
- Old-row discriminant, row-local and exact: `actualSource === "pm5" && actualSpm === undefined` → `spm` is measured. Never deviceName, never age heuristics.
- `MONITOR_SPM_MIN` 0→1, justified by the u8 type (sub-1 unrepresentable; drops only an exact 0 = no strokes).
- The lone-row `count >= 2` gate RETIRES for targeted rows; its old test is REWRITTEN with a history note, not deleted.
- Tule-fog pin (regression pin, not oracle): targets 2:17.0/2:16.0/2:15.0, actuals 2:14.9/2:13.4/2:11.5 → three blue, −2.1/−2.6/−3.5; fixture built through `buildMonitorLogSteps` from a real `MonitorRun` shape.
- A hero that disagrees with its rows is a FAILING capture. No em-dashes in copy; 44px targets; WCAG numbers in reports.
- Commands in app/; `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first; `pnpm test --project client` for src (never unit); failing-test-first; e2e + screenshots FOREGROUND (blocking, 590000ms); per-file coverage; self-mutations byte-identical-restored; `git rev-parse --show-toplevel` before every commit. Known design.spec tap-target flake: isolated rerun, report not dismiss.

---

### Task 1: The data split, the floor, the server

**Files:** Modify `app/src/session/logDraft.ts` (`LogStep.actualSpm`, `buildMonitorLogSteps`, `MONITOR_SPM_MIN`), `app/server/routes/data.ts` (validation), `app/server/stores/*` only if the step validator lives there (locate `validateLogStepEntry` — it is in data.ts); Test logDraft.test.ts (or its home — locate the builders' tests), data.test.ts.

**Interfaces:** Produces `LogStep.actualSpm?: number` (measured, monitor only); `LogStep.spm` = authored target on ALL doors (monitor copies from `ProgramInterval.displaySpm`); `MONITOR_SPM_MIN = 1`; POST accepts `actualSpm` bounded 1..99 field-named 400s; exported discriminant helper `spmIsMeasured(step): boolean` (= `step.actualSource === "pm5" && step.actualSpm === undefined` for old rows — name it so both renderers import ONE copy; new rows: `actualSpm` itself is the measured value).

- [ ] Failing tests: monitor build → `actualSpm` = the actual's avgSpm AND `spm` = the interval's `displaySpm` (both asserted, distinct values in the fixture); avgSpm 0 → `actualSpm` absent (the floor, red-provable); timer/manual builds unchanged (`spm` = authored, no `actualSpm`); the discriminant helper's three legs (old monitor row, new monitor row, target-only row).
- [ ] Implement; server: `actualSpm` optional in `validateLogStepEntry`, bounds 1..99, 400 message naming the field; the frozen v0.12.0-era body shape still 201s (pinned verbatim — steps without actualSpm).
- [ ] Self-mutation: floor back to 0 (red); `spm` copied from avgSpm again (the overload returns — red via the distinct-values assertion). Restore, diff-verified. Full `pnpm test`. Commit.

### Task 2: The band and the model

**Files:** Create `app/src/judgeBand.ts` (the shared constant + a `judgeVsTarget(actual, target)` returning `"faster" | "on-target" | "slower"` with the band); Modify `app/src/workout/connected/surfaceModel.ts` (imports the shared constant, deletes its local), `app/src/session/summaryModel.ts` (+test): rows gain `targetLabel?`, `spmCell?` (`{measured?: number; target?: number}`), judgment re-baseline per §1.

**Interfaces:** Consumes Task 1's fields + helper. Produces `MeasuredRow.targetLabel?: string`, `.spmCell?`, `.judged?` now vs-target with `direction: "faster" | "slower"` OR the new on-target state (`judged` absent + `onTarget: true` — pick ONE encoding and document it; the renderer needs to distinguish on-target-plain from unjudged-absent); the working-average row judgment DELETED; `deviationBarWidthPercent` unchanged.

- [ ] Failing tests: the §1 table row by row — judged member set (pm5/stopwatch judge, assumed never — the by-hand fixture stays unpainted), band legs (dev +0.4 → on-target plain; +0.6 → slower; −0.6 → faster; boundary exactly 0.5 → on-target, documented), TARGET cell presence on the pairing-exception row (avgSplit dropped, time real), the tule-fog pin (through `buildMonitorLogSteps`), the lone-row rewrite (single pm5 row WITH target → judged; the history note in the test body), warm-up never judged/no target.
- [ ] The drift test: `surfaceModel`'s band === `judgeBand`'s export (one import, asserted at module level); grep proves no second `0.5` constant.
- [ ] The wire-scoping witness (§6.3b): decode a committed rest-bearing capture (`walk-2026-08-18-metrics`), compare per-interval stored pace vs the capture's own interval-scoped values; red-provable by mis-scoping the index in the test's decode.
- [ ] Self-mutation: band applied as `< 0.5` vs `<= 0.5` flip (boundary test red); member set widened to include "assumed" (by-hand fixture red). Restore. `pnpm test --project client`, full `pnpm test`. Commit.

### Task 3: Both renderers, one rule

**Files:** Modify `app/src/session/PostWorkoutSummary.tsx` (+test: TARGET + SPM cells, on-target plain rendering, legend row), `app/src/log/storedSummary.ts` (+test: same §1/§2 rules incl. the discriminant for old rows), `app/src/log/FromTheLog.tsx` (only if the cell plumbing needs it), `app/src/index.css`; Test both component tests.

**Interfaces:** Consumes Task 2's row model; `storedSummary` re-derives by the same rules from stored steps (its §5C judged-when updates to the member set + band; stored `avg_split_seconds` hero untouched).

- [ ] Failing tests: cells render per §1's columns (TARGET `m:ss.t`, SPM `24 / 22` with quiet target half — assert the quiet class on the target half; absent halves drop), on-target rows plain ink (no bar, no ±, no color class — assert absence), old-row discriminant leg in storedSummary (pre-split monitor row renders `spm` as measured, no target half; the criterion-3 case), by-hand rows unpainted.
- [ ] CSS: the new cells inside the row grid (README §8 geometry holds; widths recorded in DEVIATIONS if they depart); contrast numbers computed for the quiet target half on both backgrounds, in the report.
- [ ] Self-mutation: swap measured/target halves in the cell (red); paint on-target rows with the faster class (red). Restore. `pnpm test --project client`, full `pnpm test`, `pnpm e2e` FOREGROUND, `pnpm screenshots` FOREGROUND — the summary + log-detail captures change: seed a mixed list (judged faster, judged slower, ON TARGET within band, abstained effort row, warm-up), open every changed capture, recompute heroes AND row judgments vs their inline targets; a hero that disagrees with its rows is a FAILING capture. Commit.

### Task 4: The witness sweep and reconciliation

**Files:** Modify `app/e2e/design.spec.ts` (+`log.spec.ts` where flows assert row content), `docs/design/DEVIATIONS.md`, `ROADMAP.md` (LT spec 1 status), the old copy sites (grep `FASTER (BLUE)` sweep — legend survives; grep any e2e asserting the old vs-average deviations and update to vs-target values); Test e2e.

**Interfaces:** Consumes Tasks 1-3.

- [ ] Design witnesses per §1/§2 rows not covered by component tests: computed styles on the new cells (quiet half's color token, 44px row targets hold), the on-target row's plain ink live, the legend text.
- [ ] The breaking-test sweep: every e2e/screenshot assertion pinning old deviation values or the old column set — updated to the new truth (values recomputed against the fixtures' targets, stated in the diff comments).
- [ ] DEVIATIONS reconciled (any README §8 width departures; the superseded PW rows already point forward — verify, don't duplicate); ROADMAP LT spec 1 status line.
- [ ] Full gates: `pnpm test` (both summary lines), `pnpm e2e`, `pnpm screenshots`; per-file coverage for every touched file. Self-mutation: one design witness (quiet-half token swap) red then restored. Commit.

---

## Self-review

- Spec coverage: §1→T2 (model) + T3 (render) + T4 (witnesses); §2→T1 (split/floor/server) + T3 (cell) + T2 (discriminant consumed); §3→LT-0 (its own PR, running); §4→T3 (storedSummary); §6: 1→T2, 2→T2/T3, 3→T1+T3, 3b→T2, 3c→T2, 4→LT-0, 5→T3, 6→post-merge notes (recorded), 7→T1 (compat pin).
- Placeholders: none; values live in the spec's tables.
- Type consistency: `actualSpm`/`spmIsMeasured` (T1) consumed in T2/T3; `judgeBand` exports (T2) consumed in T3; `spmCell {measured?, target?}` (T2) rendered in T3.
