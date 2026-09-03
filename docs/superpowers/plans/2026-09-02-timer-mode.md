# Timer mode, both ways up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tasks SEQUENTIAL in one worktree. Read `.claude/agent-briefing.md` first; `git rev-parse --show-toplevel` before every commit; commit before mutation probes (RF22); never merge.

**Goal:** One END treatment and no dead band in both Timer orientations, for programmed and free-row timers; the three batched free-row copy notes.
**Spec:** `docs/superpowers/specs/2026-09-02-timer-mode-design.md`. **Gate 0:** `docs/design/handoffs/2026-09-02-timer-mode/` (rev 1c PASSED).
**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-timer`, branch `timer-mode-design`.

## Global Constraints
- Strings are the boards': `Start a free row session.`, `TIME m:ss`, `Save`. No em-dashes.
- Client tests: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run <file>` from app/ (never `--project client <file>`); read BOTH summary lines. `pnpm e2e` + `pnpm screenshots` before done (RF1); open every changed capture (RF7).
- Every new assertion gets a named mutation probe with its failure text (RF21). Geometry lives in `e2e/design.spec.ts` (jsdom has no layout).

### Task 1: END + the two gaps (CSS, both timers)
Files: `app/src/index.css` (`.timer-end` base ~:4095 and landscape override ~:4836; `.timer-controls` ~:4718; the landscape `.timer-screen` grid), `app/src/session/Timer.tsx:799` only if the header grid needs a 44 px END cell. Tests: a structural CSS test in `Timer.test.tsx` (copy `ConnectedInterstitial.test.tsx:1098`'s pattern) for criterion 1; `e2e/design.spec.ts` geometry for criterion 2 at BOTH viewports, programmed (three-phase import + Start Timer + SKIP) AND free row (Just Row door → Start Timer).
- [ ] Red-first (structural + geometry) → implement → green → commit → the three named probes with failure text.

### Task 2: The three copy notes
Files: `app/src/justrow/JustRow.tsx:164` (band), `app/src/log/LogRow.tsx:179` (`heroSnippet` TIME branch; check `RecentLog.timeSeconds` in `src/api/useRecentLogs.ts` — add to the server list projection additively if absent), `app/src/session/PostWorkoutSummary.tsx:629` + `app/src/justrow/JustRowLog.tsx:438` / the shared `SaveStack` (no-plan label `Save`). Tests: `JustRow.test.tsx` (band), `HistoryList.test.tsx` (TIME line only for time-only rows; a row with distance shows none), `PostWorkoutSummary.test.tsx` + `JustRowLog.test.tsx` (label by plan state); sweep every test/e2e pin pressing `Save without logging` in a NO-PLAN state (`grep -rn "Save without logging" app/src app/e2e`) to `Save`; plan-state pins stay.
- [ ] Red-first → implement → green → commit → probes: TIME branch keyed on `avgSplit` only → red; label swapped → red.

### Task 3: Captures, docs, PR
- [ ] `pnpm screenshots`: re-take `timer`, `timer-landscape`, `justrow-timer`, `justrow-timer-landscape`, `justrow-door`, `justrow-log-timer`, `justrow-history-chip`; open each; revert churn. Full `pnpm e2e`, `pnpm test:coverage` per-file for touched files, `pnpm build && pnpm dist:grep`.
- [ ] ROADMAP: tick the Timer-mode row and the batched copy-notes row (both "DONE in #<PR>"); handoff README status → IMPLEMENTED.
- [ ] PR body, human-first, ≤120 words above the fold; James reviews (no PM gate — pure UI; antagonist skipped, stated).
