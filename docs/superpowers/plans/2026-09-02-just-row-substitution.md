# A Just Row stands in for a plan session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Every subagent reads `.claude/agent-briefing.md` first, works ONLY in the worktree below, runs `git rev-parse --show-toplevel` before every commit, commits the real change BEFORE any mutation probe (RF22), and never merges. **Tasks run SEQUENTIALLY in one worktree** (the unconnected PR proved six parallel agents in one tree contend on the pre-commit typecheck).

**Goal:** A free row (connected or phone-timed Just Row) can advance the plan as a stand-in, and the Plan tab shows it as one.

**Architecture:** The store resolves `advancesPlan ?? !isFreeRow(...)` once; the link the row already gets is the stand-in record. The Just Row log door borrows the shipped plan-button pair. The Plan tab tests the free pair before the unknown-type box, prints the existing `INSTEAD OF` mark for a free row on a type day, and centres every chip on two-line rows.

**Tech Stack:** Express 5 + Drizzle (no migration), React 19, Vitest (unit/client/integration), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-just-row-substitution-design.md` (rev 3). Gate 0: `docs/design/handoffs/2026-09-02-just-row-substitution/` (rev 1d PASSED). Executors read both.

**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-jrsub`, branch `jr-substitution`.

## Global Constraints

- TRIAD (the meaning of `SESSION n OF N`). Not fast path. PM final-PR gate before merge.
- Invariant: a free row advances the plan iff its body says `advancesPlan: true`; a workout row advances unless its body says `false`; the resolution happens ONCE, in the store.
- Copy is the shipped copy: `Log against plan · SESSION n OF N`, `Save without logging`, `INSTEAD OF AT`, `INSTEAD OF 2K Test` (title's own case). "Save this row" is retired.
- The chip is keyed on the PAIR with `workoutId` PRESENT and null; `parseLink` tolerates an absent key (old server).
- Tests red-first; every new assertion gets a named mutation probe with its failure text (RF21). Client/unit: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run <file>` from app/ (never `--project client <file>`). Integration: `pnpm test --project integration` (Docker). Read BOTH summary lines.
- `pnpm e2e` and `pnpm screenshots` before reporting any task that touches `app/src/` (RF1); open every changed capture (RF7).
- Prose sweep in the same PR (spec §"Prose that staled"): `LogSession.tsx:680-683`, `LogSession.test.tsx:4574` and `:5231` titles, `logs.ts:145-147`, `data.test.ts:2393`, `JustRowLog.tsx:35-39`'s door comment.

---

### Task 1: The store resolves `advancesPlan`; the route stops defaulting

**Files:** Modify `app/server/stores/logs.ts` (`LogInput.advancesPlan?: boolean` + the create's resolution + the comment at :145-147 and :768-779), `app/server/stores/fakes.ts` (~:675), `app/server/stores/storeContracts.ts` (~:603), `app/server/routes/data.ts:1728` (pass the field through, no `?? true`). Tests: `app/server/routes/freeRow.integration.test.ts` (:152 and :189 flip), `app/server/stores/stores.integration.test.ts` (:701 flips; :726/:735 stay), `app/server/routes/data.test.ts:2393` title.

- [ ] **Failing tests:** (a) HTTP: free row + `advancesPlan: true` → `GET /api/plan` `doneN` +1 and the row has `planKey`/`planIndex`; free row + `false` → unchanged, link null; free row + ABSENT → unchanged, link null; workout row + ABSENT → +1 (re-pinned). (b) Delete: deleting the opted-in free row decrements `doneN` (the existing delete test's shape). (c) Store contract: both stores resolve the absent case to `!isFreeRow` (one `it.each` over real + fake).
- [ ] **Implement** per spec §Mechanism 1. Run integration; PASS.
- [ ] **Probes:** restore `?? true` at the route → the free-absent case red ("expected 0 to be 1"-shaped, record it); change the store's `??` to `||` → the workout-absent case red; drop the link write from inside the advance `if` → the delete-decrement case red.
- [ ] Commit `feat(server): a free row advances the plan only when its body says so; resolved once, in the store`.

### Task 2: The plan link carries `workoutId`

**Files:** Modify `app/server/stores/logs.ts` `resolveNewestPlanLink` (~:441-459: project `sessionLogs.workoutId` BY NAME — not `workoutRowId`), `app/src/plan/usePlanLinks.ts` (`PlanLink.workoutId: string | null | undefined`; `parseLink` accepts absent, following the `workoutIsGlobal` guard's comment at ~:90-93). Tests: `stores.integration.test.ts` (the newest-link projection carries `workoutId` for a free row and for a workout row; a DELETED workout's link has `workoutId` null AND `workoutRowId` null — distinct fields, both asserted), `usePlanLinks.test.ts` (a link WITHOUT the key parses with `workoutId: undefined`; with `null` parses; with a number is dropped like any malformed link).

- [ ] Failing tests; implement; PASS; probes: project `workoutRowId` instead → the deleted-workout case red; make `parseLink` require the key → the absent-key case red. Commit.

### Task 3: `useLogForm` writes `true`; the Just Row door borrows the pair

**Files:** Modify `app/src/session/LogSession.tsx` (`:720`: write the key when `true` as well; reconcile `:680-683`), `app/src/justrow/JustRowLog.tsx` (call `usePlan()`; with a plan render the pair with the shipped classes `summary-save-lead` / `summary-save-secondary` and the shipped label formula `Log against plan · SESSION ${doneN + 1} OF ${sequence.length}`; no plan → `Save without logging` alone; delete "Save this row"; reconcile the door comment :35-39). Tests: `LogSession.test.tsx` (`:4574` title reconciled; a new case: `{ advancesPlan: true }` posts `true`), `JustRowLog.test.tsx` (both entry kinds: with a plan, both buttons with the exact label and classes, lead posts `advancesPlan: true`, secondary posts `false`; no plan → only `Save without logging`; `queryByText("Save this row")` null everywhere).

- [ ] Failing tests; implement; PASS; probes: drop the `true` write → the lead-posts-true case red; swap the two handlers → both red; render the pair without a plan → red. Grep: `grep -rn "Save this row" app/src app/e2e` returns nothing. Commit.

### Task 4: Plan tab — chip first, the mark's type-branch clause, centring

**Files:** Modify `app/src/plan/Plan.tsx` (badge slot: `isFreeRow(link.workoutId, link.workoutType)` with `workoutId !== undefined` → `FreeRowChip`, BEFORE the unknown-box test at ~:420; `swapMark` type branch: a free pair returns `plannedType`), `app/src/index.css` (`.free-row-chip`: `min-width` equal to `.type-badge`'s rendered box + `text-align: center`; `.plan-row-swapped` badge slot, number and check: `grid-row: 1 / -1` — this moves every swapped row's `TypeBadge` too, on purpose). Tests: `Plan.test.tsx` (a linked free row on a type day: `.free-row-chip`, no `.type-badge`, no `.plan-row-badge-unknown`, name `Just Row`, mark `INSTEAD OF AT`; on a checkpoint day: `INSTEAD OF 2K Test`; a linked row with an UNKNOWN type string still renders the unknown box; a link with `workoutId` ABSENT renders no chip), a structural test that `.plan-row-swapped` centres its slot across both rows (the rule contains `grid-row: 1 / -1` — copy `ConnectedInterstitial.test.tsx:1098`'s pattern), and in `e2e/design.spec.ts` a `boundingBox` assertion: on a swapped row the chip's vertical centre is within 1 px of the name+mark block's centre.

- [ ] Failing tests; implement; PASS; probes: move the chip test after the unknown-box test → the chip case red (renders the box); delete the `swapMark` clause → `INSTEAD OF AT` red; delete `grid-row: 1 / -1` → the structural test AND the e2e boundingBox red (record both failure texts). Commit.

### Task 5: e2e flow, captures, docs, release-notes row

**Files:** `app/e2e/justrow.spec.ts` (criterion 4: plan active via `choosePlan`/`resetPlanProgress` from `log.spec.ts:142`, Just Row door → Start Timer → ▶ → Finish session → `Log against plan · SESSION 1 OF 84` → Today shows `SESSION 2 OF 84` → Plan tab row 1 shows the chip, `Just Row`, `INSTEAD OF O2`), `app/e2e/screenshots.spec.ts` (`justrow-log-plan` — the door with the pair; re-take `plan-linked` — the O2 swap row's badge moved; `plan-standin` — a Just Row stand-in on a type day and on a checkpoint day), ROADMAP (item 5 → shipped; the v0.35.0 notes row gains "retire 'A Just Row never advances your plan'"), the unconnected spec's exit criteria 1 and 2 amended as spec §"Parent criteria" says, the handoff README status.

- [ ] Write the e2e red-first; captures via `pnpm screenshots`, open every new/changed image; full `pnpm e2e`, `pnpm test:coverage` (per-file for Plan.tsx, JustRowLog.tsx, usePlanLinks.ts, logs.ts), `pnpm build && pnpm dist:grep`. Commit.

### Task 6: Close-out

- [ ] PR body, human-first (≤120 words above the fold), captures attached, risk note naming the number change and the delete decrement.
- [ ] PM final-PR gate (TRIAD) — present the verdict; STOP for James.

## Self-review

Spec §Mechanism 1 → T1; 1b → T2; 2 → T3; 3 → T4; 4 (Today) → T5's e2e; 5 (notes) → T5's ROADMAP row. Exit criteria 1 → T1; 2 → T3; 3 → T4; 4 → T5; 5 → T3/T4 strings. Prose sweep → T1/T3. No placeholders; names match the spec (`FreeRowChip`, `parseLink`, `resolveNewestPlanLink`, `swapMark`).
