# Storage Spine PR 3 — The Interval-Count Bound (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** F2b — the continuity guard gains 0x0033's raw interval count as an additional bound, closing the blind window F2a traded away (a mid-gap reset drops the count backward even when per-interval clocks read forward), never worse than F2a anywhere.

**Architecture:** The raw count (`AdditionalStatus2.intervalCount`, `parse.ts:197`, pre-`toProgramIndex`) travels as a new additive-optional `MonitorFrame` field — reversing `driver.ts`'s "the raw value survives only in the event log" contract, with the DEVIATIONS row reconciled. `ContinuityReading` gains the optional count axis; `check` convicts additionally when both readings carry counts and `after < before`. The suppression question is DECIDED BY THE SWEEP (spec §4's conditional): run the corpus under BOTH `distanceGoal` predicates and ship whichever branch the data supports, recording both results.

**Tech Stack:** TypeScript; Vitest unit/client; the full committed recording corpus (the rings carry no count and are NOT exit evidence — spec §4).

**Spec:** `docs/superpowers/specs/2026-08-23-storage-spine-design.md` §4 (post-delta: D1–D6 corrections are baked in and binding).

## Global Constraints

- Worktree `.claude/worktrees/rc-spine3`, branch `rc-spine3`. `git rev-parse --show-toplevel` before every commit. `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` every shell.
- TDD; gates FOREGROUND; `pnpm test --project unit|client` only.
- TRIAD (when the guard closes records): PM final gate on the PR.
- The bound is ADDITIONAL: F2a's three-axis signature unchanged; a reading pair missing a count on EITHER side falls back to F2a exactly (never worse).
- Honest capability statements carried verbatim from spec §4: the count reads 0 through interval 1 of EVERY program (0-based, forward-attributed — a NOTE, not a gate; `after < before` is base-invariant); true-positive power is SYNTHETIC-ONLY (no real interruption recording exists) and the tests say so.
- The corpus's ONE backward count reading (session-2 seq 24→29, count 3→0, the leftover-register connect shape) is pinned THROUGH the production path (`run === null` ⇒ no conviction) — the safety argument stops living in a different file by accident.
- The sweep runs under BOTH predicates — the wire's per-sample `workoutDurationType === 128` AND production's `programHasDistanceGoal(run.program)` — results recorded in the test file and the spec-conditional resolved accordingly.
- `ContinuityReading`'s same-frame doc comment is rewritten honestly: the count comes from the most recent 0x0033 (a different characteristic than the 0x0031 axes), carried with the reading.

## File map

- Modify: `app/domain/monitor/types.ts` (`MonitorFrame.rawIntervalCount?`), `app/src/monitor/driver.ts` (emit the raw count on the frame; the `:1824`-region contract comment reversed), `docs/design/DEVIATIONS.md` (that contract's row), `app/src/monitor/continuity.ts` (+ axis, + bound, suppression per sweep), `app/src/monitor/continuity.test.ts` (pins + both-predicate sweep), `app/src/monitor/useMonitorSession.ts` (`lastContinuityRef` gains the count; `applyContinuityCheck` passes it), `app/src/monitor/useMonitorSession.test.ts`, `docs/monitor/pm5-interface-notes.md` (D1's rest-onset increment fact; §15 #1's base note), `ROADMAP.md` (F2b tick; the F2a §2b blind-window note updated; suppression decision recorded).

---

### Task 1: The raw count reaches the frame

**Files:**
- Modify: `app/domain/monitor/types.ts`, `app/src/monitor/driver.ts`, `docs/design/DEVIATIONS.md`
- Test: `app/src/monitor/driver.test.ts`

**Interfaces:**
- Produces (Task 2 relies on): `MonitorFrame.rawIntervalCount?: number` — 0x0033's `intervalCount` verbatim (0-based, forward-attributed, base note from §15 #1 in the doc comment; NOT `toProgramIndex` output — the existing `intervalIndex` field keeps its clamped/normalized contract untouched). Additive-optional (`totalWorkDistanceMeters` precedent). Absent until the run's first 0x0033.

- [ ] **Step 1: Failing tests** — (a) a frame emitted after a 0x0033 carries `rawIntervalCount` equal to the wire byte (fake-driven; assert against the scripted value); (b) frames before any 0x0033 omit it; (c) `intervalIndex`'s existing normalized behavior byte-identical (pin an existing case); (d) a capture replay: a committed recording's frame stream carries the raw counts matching an independent decode of its 0x0033 bytes (name file+seqs).
- [ ] **Step 2: Verify failures at project scope.**
- [ ] **Step 3: Implement** — the driver's frame construction reads the merged raw status (grep `mergeStatus`/where `intervalCount` already lives in the raw state); rewrite the `:1824`-region comment ("raw survives only in the event log" → names this field as the deliberate exception and why — F2b needs an unclamped monotonic-per-session value); reconcile the DEVIATIONS row that documents that contract.
- [ ] **Step 4: Green; per-file coverage; self-mutation** (drop the emit → (a)/(d) red).
- [ ] **Step 5: Commit** `feat: the machine's own interval count rides the frame, raw and named`.

### Task 2: The bound, the sweep, and the wiring

**Files:**
- Modify: `app/src/monitor/continuity.ts`, `app/src/monitor/useMonitorSession.ts`
- Test: `app/src/monitor/continuity.test.ts`, `app/src/monitor/useMonitorSession.test.ts`

**Interfaces:**
- Consumes: Task 1's `MonitorFrame.rawIntervalCount?`.
- Produces: `ContinuityReading.intervalCount?: number`; `check` returns `"reset"` when (existing three-axis signature) OR (both counts present AND `after.intervalCount < before.intervalCount` — subject to the suppression decision below). The same-frame doc comment rewritten per Global Constraints.

- [ ] **Step 1: THE SWEEP FIRST (it decides the design):** extend `continuity.test.ts`'s corpus block to carry counts on its derived readings and run the slid-gap sweep keyed on the count bound under BOTH predicates. Record both results as committed test assertions (the numbers in the test, not a report). Decision rule from spec §4: the suppression LIFTS for the count bound only if BOTH sweeps show zero backward count readings on healthy in-run resumes (the session-2 seq 24→29 pre-run shape is excluded by the production path, and the sweep must model that exclusion when using the production predicate); otherwise the count bound runs under F2a's suppression and the spec's conditional is recorded as "kept, because <the sweep's number>".
- [ ] **Step 2: Failing pins** — (a) the F2a §2b under-count scenario on a SYNTHETIC multi-interval fixture (named synthetic in the test title): mid-gap reset, per-interval clocks forward, count backward ⇒ `"reset"` — the conviction F2a could not make; (b) count-missing-either-side ⇒ exactly F2a's verdict (both directions); (c) count equal + three-axis backward ⇒ reset (F2a unchanged); (d) count FORWARD across a boundary-straddling gap ⇒ continuation; (e) session-2 seq 24→29 THROUGH `applyContinuityCheck` with `run === null` ⇒ no conviction (the production-path pin); (f) per-clause mutation: delete the count clause ⇒ (a) red; delete the presence guard ⇒ (b) red.
- [ ] **Step 3: Verify failures; implement** `continuity.ts` per the sweep's branch; wire the hook: `lastContinuityRef` snapshots `rawIntervalCount` when present (preserving the existing null semantics — a frame without TWD still skips wholesale; a frame with TWD but no count carries count-absent), `applyContinuityCheck` builds readings with it, the `continuity-reset` ring entry logs the count axis too.
- [ ] **Step 4: Green both files at project scope; coverage; the remaining self-mutations from Step 2(f).**
- [ ] **Step 5: Commit** `feat: the guard reads the machine's interval count — the bound F2a could not have`.

### Task 3: Docs, riders, gates

**Files:**
- Modify: `docs/monitor/pm5-interface-notes.md`, `ROADMAP.md`
- No new product code.

- [ ] **Step 1: The D1 wire fact** into `pm5-interface-notes.md` (§15-adjacent or §20, match style): the count increments at REST ONSET — 29.8 s (r30) / 59.7 s (r60) ahead of that interval's own 0x0037, lagging 0.28–0.72 s on r0 — corroborating the end-during-rest bound; plus §15 #1 gains the 0-based/forward-attributed note (settled free by the sweep; base does not affect `after < before`).
- [ ] **Step 2: ROADMAP** — tick F2b inside RC-1's body (it shipped here, not in RC-1's PR — say so); update the LL walk card's corrected-F2 bullet (F2b SHIPPED, the blind window closed on multi-interval programs; the residual: interval 1 and 1-interval programs remain F2a-only, synthetic-only true-positive evidence); record the suppression decision with its sweep numbers; update the Release-posture line if its wording referenced F2b as open.
- [ ] **Step 3: Full gate, foreground** — lint, typecheck, `pnpm test` (both lines), build + dist-grep, `pnpm e2e` (full count), `pnpm screenshots` (zero committed diffs expected; investigate any).
- [ ] **Step 4: Commit** `docs: the count bound's record — sweep numbers, wire fact, honest residuals` and report done (controller assembles the PR; PM final gate follows).

---

## Self-review (done at write time)

- Spec §4 coverage: new frame field + contract reversal → T1; the bound + both-predicate sweep + all six pins → T2; D1/D4 notes + riders → T3. Exit 5-equivalent (spec exit 5/6 for F2b) → T2 Steps 1-2.
- Interfaces: `rawIntervalCount?` named identically T1/T2; `ContinuityReading.intervalCount?` in T2 only.
- The sweep-decides-the-design ordering is deliberate and stated (Step 1 before pins) — the spec's conditional cannot be implemented before the data exists.
- No placeholders.
