# Warmup Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One warmup concept in the whole app — a per-user setting (time or meters, optional rest) prepended at `buildRun`; `wu` dies as a step type everywhere.

**Architecture:** `Step.wu` is removed from the authoring union while `EnginePhase.warmup` survives with one producer: `buildRun` (engine.ts:56), fed by a nullable `preferences.warmup` jsonb. Distance warmups price via the effort-estimate precedent (`estimationSplit`), display-only. The stored-data strip runs in migrations at boot, before anything serves.

**Tech Stack:** existing — React/TS, Express + drizzle/Postgres, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-09-warmup-setting-design.md` (adversarially revised; §-numbers cited below). Review: `2026-08-09-warmup-adversarial-review.md`.

## Global Constraints

- Worktree `.claude/worktrees/warmup`, branch `warmup-setting`. `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` before ANY pnpm/git command. `pnpm test` only, NEVER bare vitest. Read `.claude/agent-briefing.md` first — including the falsifying-line rule; it was written against THIS spec's first draft.
- Baselines MEASURED at plan time on this tree: **3084 unit / 140 files**; playwright lists 306 tests in 11 files across both configs (split e2e vs screenshots measured at task time by `--list` per config). Every task ends green at baseline + its additions.
- Migration state: `app/drizzle/` ends at `0006_windy_wendell_vaughn.sql`; this plan mints **0007 (generated: column swap)** and **0008 (custom: the workouts strip)**. Before generating, check open PRs for a competing index (the drizzle timestamp rule, briefing).
- Copy literals, exact: `Warm-ups moved to Settings. Set yours on the You tab.` · `N warm-up lines dropped. Warm-ups are a setting now.` (N interpolated) · Builder hint `+ <house-format> warm-up from your preferences`. No em-dash in any user-facing string.
- The seeds carry **302** `wu` steps (300 library + 2 onboarding) — measured: `grep -rn 'k: "wu"' app/server/seed/library/*.ts | wc -l` → 302.
- The compose stack is shared; verify bundle identity before trusting browser gates; `build --no-cache` if stale (briefing).
- Realistic-fixtures rule: at least one test per client task starts from a real seeded workout.

---

### Task 1: `wu` leaves the domain

**Files:**
- Modify: `app/domain/types.ts` (Step union), `app/domain/validate.ts`, `app/domain/expand.ts` (:128 case "wu"; `estimateMinutes` :230), `app/domain/bulk.ts` (:191, :202), `app/domain/fixtures.ts`
- Test: the four matching `.test.ts` files

**Interfaces:**
- Consumes: nothing prior.
- Produces: `Step` without `wu`; `validateSteps` rejecting `{k:"wu"}` with the exact copy; `BulkParseResult` gains `droppedWarmups: number` (0 when none); `EnginePhase` type UNCHANGED (the phase union's `"warmup"` survives — spec §6's union enumeration governs this whole task).

- [ ] **Step 1: failing domain tests.**

```ts
// validate.test.ts
it("rejects a wu step with the copy that points at the setting", () => {
  const r = validateSteps([{ k: "wu", minutes: 5 } as unknown as Step, WORK_STEP]);
  expect(r.ok).toBe(false);
  expect(r.errors[0]).toBe("Warm-ups moved to Settings. Set yours on the You tab.");
});
// expand.test.ts — the property from spec §8
it("no Step[] input can produce a warmup phase anymore", () => {
  for (const w of LIBRARY_LIKE_FIXTURES) {
    expect(phases(w.steps, BASELINES).some((p) => p.type === "warmup")).toBe(false);
  }
});
// bulk.test.ts — explicit parse-drop-count (spec §6, adversarial M6)
it("a wu line is dropped and counted, never fatal, and its block survives", () => {
  const r = parseBulk(`Title\nwu 5\n2x (4' @ 6k+12, 1' rest)`);
  expect(r.ok).toBe(true);
  expect(r.droppedWarmups).toBe(1);
  expect(r.workouts[0]!.steps.some((s) => s.k === "reps")).toBe(true);
});
```

- [ ] **Step 2: run to fail** (`pnpm test -- -t "wu step"` etc. — note `pnpm test -- <file>` does NOT filter in this repo; use `-t` name filters).
- [ ] **Step 3: implement.** `types.ts` drops the `wu` member; `validate.ts` adds the reject with the copy (a runtime check — the type no longer admits it, but stored/imported data can still present it; keep the check permanent, it IS the API-boundary guard); `expand.ts` deletes the step-switch case (the warmup arm of PHASE consumers stays; grep `"warmup"` and touch nothing); `estimateMinutes` follows; `bulk.ts` :191/:202 becomes parse-and-drop with the counter.
- [ ] **Step 4: sweep the fixtures** — `domain/fixtures.ts` and every test fixture with `k: "wu"` (grep); update `storeContracts.ts`'s fixture (adversarial minor).
- [ ] **Step 5: full suite green (expect a large fixture-driven diff, no behavior changes beyond the three above); lint/typecheck; self-mutation pass; commit** — `feat: wu leaves the authoring union`

### Task 2: the server — column swap, explicit-null patch, the stored strip

**Files:**
- Modify: `app/server/db/schema.ts:144` (preferences), `app/server/stores/preferences.ts`, `app/server/routes/data.ts:673-730` (the PUT)
- Create: `app/drizzle/0007_*.sql` (GENERATED — `pnpm db:generate`, commit verbatim), `app/drizzle/0008_*.sql` (CUSTOM — the workouts strip; the plan step below pins the mechanism after checking `drizzle-kit`'s version supports `generate --custom`; if not, an empty-diff generate plus hand-authored SQL in the drizzle journal idiom the repo's own 0005-regeneration used)
- Test: `app/server/routes/data.test.ts`, `app/server/stores/stores.integration.test.ts`

**Interfaces:**
- Consumes: Task 1's Step-without-wu (the strip's target shape).
- Produces: `PreferencesRow.warmup: WarmupSetting | null` where `type WarmupSetting = ({ kind: "time"; minutes: number } | { kind: "distance"; meters: number }) & { restSeconds?: number }` exported from `server/stores/preferences.ts` AND mirrored in `app/src/api/usePreferences.ts` by Task 4 (name it identically); PUT accepts `warmup` (shape-validated, explicit `null` clears — a `"warmup" in body` presence check, NOT `!== undefined`, spec §2/B5); GET returns it; `warmupMinutes`/`warmupOverride` gone from row, GET, PUT, validator, and tests.

- [ ] **Step 1: failing server tests** — accept both kinds ± rest; explicit null clears; out-of-bounds 400s (`minutes: 0`, `meters: 99`, `restSeconds: 596`); unknown fields still ignored (the :1472 pin stays green); GET round-trip; integration: a workouts row seeded WITH a `wu` step (raw SQL insert bypassing validation) reads back stripped after migrations run.
- [ ] **Step 2: fail. Step 3: schema + `pnpm db:generate` (0007). Step 4: the 0008 custom strip:**

```sql
-- strips {"k":"wu",...} entries from every workouts.steps jsonb array;
-- idempotent; byte-preserves everything else (spec §6 ordering: runs at
-- boot, before the api serves)
UPDATE workouts SET steps = (
  SELECT COALESCE(jsonb_agg(s), '[]'::jsonb)
  FROM jsonb_array_elements(steps) AS s
  WHERE s->>'k' <> 'wu'
) WHERE steps @> '[{"k":"wu"}]'::jsonb ... -- (containment matching on k only:
-- verify the operator matches partial objects; if not, EXISTS-subquery form)
```

  Pin the FINAL SQL from a live-Postgres probe in the integration test, not from this sketch.
- [ ] **Step 5: route arms** at data.ts:717/:724 replaced by the single `warmup` arm with the presence check and shape validation (bounds from `domain/validate.ts`'s constants — import or mirror per the server's existing pattern for split bounds).
- [ ] **Step 6: green; coverage per-file; self-mutation; commit** — `feat: the warmup setting has a column, and stored warmups are gone`

### Task 3: seeds and the balance report

**Files:**
- Modify: the five seed files (302 `{ k: "wu", ... }` lines deleted; NOTHING else), `app/server/seed/library/library.test.ts`, `onboarding.test.ts`
- Create: `app/scripts/library-balance.ts`
- Test: seed tests updated; the script's own output asserted in a small unit test (bucket math on a fixed fixture)

**Interfaces:**
- Consumes: Task 1 (types compile without wu).
- Produces: the balance report text (for the PR body); no code interface.

- [ ] **Step 1:** delete the 302 lines (scripted edit is fine; `git diff --stat` must show ONLY the five seed files, deletions only). Seed tests' totals/fixtures update.
- [ ] **Step 2:** verify the reconcile updates existing rows by its content-addressing (spec §6/M4): the integration test seeds the OLD shape (raw insert), boots `seedGlobalLibrary`, asserts the row now matches the new steps (`isDeepStrictEqual` is the mechanism — cite `server/seed/seed.ts`'s actual comparison in the test's comment).
- [ ] **Step 3: the script.** Buckets by `estimateMinutes` into the generation phase's ranges — READ the edges/targets from `docs/superpowers/specs/2026-08-03-workout-generation-design.md` + `patterns.json` and pin them in the script with citations; `--with-warmups` flag re-adds each workout's historical warmup minutes (from a frozen literal captured out of git history at `HEAD~1` of the seed commit — generate it in Step 1's edit, commit beside the script) so BEFORE/AFTER/TARGET print from one run. Note the patterns.json `warmupMinutes` stats as orphaned (one comment, spec §6).
- [ ] **Step 4:** run it; paste the table into the task report (it feeds the PR body). Green; commit — `feat: the library warms up on its own time`

### Task 4: `buildRun` prepends, and distance warmups get priced

**Files:**
- Modify: `app/src/session/engine.ts` (buildRun :56 + the phase-pricing seam), `app/src/api/usePreferences.ts` (the `warmup` field + `WarmupSetting` mirror), `app/domain/pace.ts` only if the easy-estimate needs a new arm (check `estimationSplit`'s overloads at :85 first — the falsifying line is its implementation, read it)
- Test: `engine.test.ts`, plus TWO integration tests in existing suites: the prepended phase reaches `compileProgram` as interval 0 with `targetSplit: null` (`domain/monitor/program.test.ts`'s idiom) and reaches `buildLogSeed` as `kind: "warmup"` (`logDraft.test.ts`'s idiom)

**Interfaces:**
- Consumes: `WarmupSetting` (Task 2's type, mirrored client-side).
- Produces: `buildRun(draft, baselines, now, warmup?: WarmupSetting | null)` — the ONLY signature change; callers pass the preference (find every `buildRun(` call site; each door threads it).

- [ ] **Step 1: failing engine tests:** time warmup prepends `{type:"warmup", seconds}`; +rest prepends the rest phase second; distance warmup prepends `{type:"warmup", meters, estimatedSplit}` where the pricing seam yields a finite `phaseSeconds` (the B3 fix: the easy estimate — pin the estimator call and its band in the test with the spec's §4 citation); `null`/absent prepends nothing; a REST-ONLY setting is unrepresentable by type.
- [ ] **Step 2-4: fail → implement → green.** The pricing must flow wherever `phaseSeconds` (`expand.ts:91-99`) is consulted for warmup phases — read that function FIRST; if it switches on target presence, the estimate rides the same field effort phases use (name it exactly after reading; do not invent a parallel field).
- [ ] **Step 5: the two integration tests; self-mutation (drop the estimate → distance-warmup pricing test dies; reorder warmup/rest → dies); commit** — `feat: buildRun is the warmup's one producer`

### Task 5: ConfirmTargets and the Builder hint

**Files:**
- Modify: `app/src/session/ConfirmTargets.tsx` (:342 total, :356 step map — the adversary's falsifying lines; the warmup row is NEW code), `app/src/builder/Builder.tsx` (:415 hint), `app/src/builder/builderState.ts` (wu row type out + legacy local-draft strip with the import-notice copy)
- Test: `ConfirmTargets.test.tsx`, `Builder.test.tsx`/`builderState.test.ts`

**Interfaces:**
- Consumes: `usePreferences().preferences.warmup`, Task 4's buildRun threading.
- Produces: nothing downstream.

- [ ] Steps: failing tests first — ConfirmTargets with the setting ON shows one non-nudgeable `WARM-UP` row above step rows (time and distance variants; distance shows the estimate-priced duration) and the total includes warmup+rest; OFF renders byte-identically to today (snapshot the OFF case BEFORE coding). Builder hint renders ONLY when ON, with the house-format duration+rest. `builderState` loading a legacy local draft containing a wu row strips it and surfaces the notice copy. Implement; realistic fixture (a real seeded workout through the whole confirm); self-mutation; commit — `feat: the session flow shows the warmup it will run`

### Task 6: the You screen row

**Files:**
- Modify: `app/src/you/You.tsx` (the settings block, beside 6I's row — read the screen first for the row idiom), new `app/src/you/WarmupRow.tsx` if the screen's idiom splits rows into components (follow whatever "Learning the app" did)
- Test: the You screen's test file; CSS in `index.css` following the settings-row classes

**Interfaces:** consumes `usePreferences` (`save` with the explicit-null patch).

- [ ] Steps: failing tests — OFF state (`WARM-UP · OFF`), editor open, time/meters toggle, value + optional rest fields (16px inputs), save patches `{warmup: {...}}`, `Remove warm-up` patches `{warmup: null}`, ON state renders house format (`WARM-UP · 10:00` / `WARM-UP · 2000 m` / `+ :30 REST`). Bounds errors surface inline per the screen's field-error idiom. Implement; a11y (44px targets, contrast computed); self-mutation; commit — `feat: You learns the warm-up row`

### Task 7: e2e, screenshots, close-out

**Files:**
- Modify: `app/e2e/` (one new walk: set warmup on You → start a library session → warmup first in Confirm and Timer; the import spec gains the wu-strip notice case), `app/e2e/screenshots.spec.ts` (You row ON + OFF, the refreshed Confirm), `docs/design/DEVIATIONS.md` (the Phase 5D warm-up row rewritten to the setting reality — adversarial minor), `ROADMAP.md` (Phase 9's warmup bullet checked, home = the spec; the regen follow-on line replaces the recompute clause)
- Test: full gates ×2

**Interfaces:** consumes everything.

- [ ] Steps: the walk (measure the per-config baselines with `--list` first and record them); screenshots (open the images, describe them); the DEVIATIONS row appended-at-bottom convention for any NEW row, in-place rewrite for the 5D row (verify no cited line numbers shift — the file's own note); ROADMAP edit; the balance report from Task 3 pasted into the ledger for the PR body; full gates ×2 with bundle-identity verification; commit — `test: the warmup setting walks`

## Execution notes

- Order strict. Task 2's migrations mint 0007/0008 — collision-check open PRs first.
- Model guidance: T1 standard (wide fixture sweep), T2 standard (SQL subtlety), T3 cheap-to-mid, T4 standard (the pricing seam), T5 standard, T6 cheap-to-mid, T7 standard.
- The spec §4/§6 citations are the falsifying-line kind — implementers re-read them at the cited line before building on them (briefing rule).
