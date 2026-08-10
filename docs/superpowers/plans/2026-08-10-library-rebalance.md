# Library Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The library redistributed to the ruling-B grid (30-45 modal in every type) via solver-assigned hybrid retune/replace, book-limited, variety-pinned, James-gated twice.

**Architecture:** A feasibility solve turns the draft grid into a final grid + complete move plan (JAMES GATE 1) before any content changes; an archetype classifier makes variety a permanent test; content edits follow the move plan under §3/§6's rules; the review table + spot-check report (JAMES GATE 2) precede the PR.

**Tech Stack:** existing; content work is seed-file TypeScript + one solver/classifier script pair.

**Spec:** `docs/superpowers/specs/2026-08-10-library-rebalance-design.md` (twice-revised; its §-numbers govern). Adversarial review: `2026-08-10-rebalance-adversarial-review.md` (the Hall's-condition machinery and blast-radius inventory live there).

## Global Constraints

- Worktree `.claude/worktrees/rebalance`, branch `library-rebalance`. Node 26 PATH before everything. `pnpm test` only, `-t` filters. Per-worktree stack (`scripts/stack-env.sh`) for any browser gate.
- Baselines MEASURED at plan time: **3295 unit / 147 files**; e2e 268; screenshots 56. Onboarding's 2 workouts untouched; NO migration; no domain/client code changes expected outside the declared script/test scope.
- Every content number obeys spec §6's book table + its interpretation rules (warm-up-inclusive translation; dashes fall back per rule; extremes are limits). House rules: totals end 0/5; offsets per calibration; the seed spm gates win unless a review-table row widens them in the same commit.
- The two JAMES GATES are hard stops: no content edits before Gate 1 approval; no PR before Gate 2.
- Copy/prose: no em-dash in anything user-facing (seed comments are internal but keep the files' own voice).

---

### Task 1: The feasibility solve → final grid + move plan (ends at JAMES GATE 1)

**Files:**
- Create: `app/scripts/library-moves.ts` (the solver; reuses `library-balance.ts`'s bucketing)
- Modify: `app/domain/generation/patterns.json` (the NEW top-level `targets` block — the DRAFT grid from spec §2, adjusted only by the solve's ±2 rule), `app/scripts/library-balance.ts` (targets read from the file; the TARGET constant dies), `app/server/seed/library/library.test.ts` (QUOTA reads the same source; its non-duplication comment rewritten to say so)
- Test: solver unit tests on fixed fixtures; the balance/QUOTA rewiring covered by existing suites updating

**Interfaces:**
- Consumes: `estimateMinutes`, the seed arrays, `patterns.json`.
- Produces: `targets` block shape `{ "O2": {"<20": 4, "20-30": 14, ...}, ... }`; the solver's committed output artifact `.superpowers/sdd/<plan>/move-plan.md` — per workout: current band, assigned band, RETUNE (with the reachable-band set and the chosen stretch/shrink sketch) or REPLACE (with the residual reason); the final grid table.

- [ ] **Step 1:** solver: for each workout compute reachable bands under spec §3 (one-rep-add OR ±25% work time, archetype fixed — reuse/port the adversarial review's reachability logic; cite it); run the assignment (Hall's condition per cell; adjust cells ±2 max toward feasibility; minimize replacements, PREFER keeping `driver.test.ts`'s Sea Fret and `program.sweep.test.ts`'s Beam Sea in place per spec §3's blast-radius note).
- [ ] **Step 2:** unit tests: a fixed 12-workout fixture with known reachability → known assignment; the ±2 rule pins; the Sea Fret preference pins.
- [ ] **Step 3:** wire targets: `patterns.json` gains `targets` (+ `_meta` note that `cells` stay warm-up-inclusive); balance script + QUOTA read it; suites green at measured counts.
- [ ] **Step 4:** run the solver on the real library; commit the move-plan artifact; **STOP — present the final grid + move plan + replacement list to James. Do not proceed to Task 2's content-consuming steps until he approves.** (The classifier build below may proceed in parallel — it reads today's library only.)
- [ ] **Step 5:** commit — `feat: the solver says who moves where, and James decides`

### Task 2: The archetype classifier + the variety audit (runs on TODAY's library)

**Files:**
- Create: `app/domain/generation/archetype.ts` (classifier over `Step[]` via liveSteps signatures: continuous / nxtime / nxdistance / ladder / pyramid / mixed, + rate-change modifier flag), `app/server/seed/library/variety.test.ts`
- Test: classifier unit tests against hand-labeled seed workouts (≥3 per archetype, chosen across types)

**Interfaces:**
- Produces: `classifyArchetype(steps: Step[]): { archetype: Archetype; rateChange: boolean }`; `nearDuplicates(workouts): Pair[]` per spec §5b's computable definitions (EffortRef arm included).

- [ ] Steps: classifier + tests (hand-label first, classify second — the labels are the spec, not the code's echo); measure today's per-cell histograms + duplicate pairs; SET thresholds = tightest values today's cells pass (document each cell's measured value in the test file's header table); the O2|60+ cluster (Fair Wind / Morning Mist / Sleet / Glass Sea) recorded as the pre-existing debt row destined for James's table — NOT fixed here. Suite green; commit — `feat: variety becomes a property, measured before it is demanded`

### Task 3: Content — retunes per the approved move plan (O2 + AT)

**Files:** `o2.ts`, `at.ts`; their test fixtures; any e2e/unit pins the moves touch (the blast-radius inventory in the adversarial review is the checklist)

- [ ] Steps: apply each approved retune exactly as the move plan sketched it (deviations from the sketch go back through the solver, not freehand); after each file: `library-balance.ts` shows the file's cells converging; classifier/variety tests stay green; totals/offsets/spm rules verified by the seed suite; the review-table rows for these retunes appended to the growing artifact. Commit per type file — `feat: O2 stretches to the ruling` / `feat: AT stretches to the ruling`

### Task 4: Content — retunes (TR + AN) + ALL replacements

**Files:** `tr.ts`, `an.ts`, plus replacement insertions in whichever type files the move plan names; the review-table artifact

- [ ] Steps: TR/AN retunes as Task 3; then each replacement generated against spec §6's cell limits + §3's rules (no clone, no near-duplicate — the Task 2 detector runs as the gate), house naming, review-table row with the cannot-stretch justification carried from the move plan. Suite + variety + balance all green; commit — `feat: TR and AN stretch, and the residuals are reborn`

### Task 5: The artifacts → JAMES GATE 2

**Files:** the committed review table (`docs/superpowers/specs/2026-08-10-rebalance-review-table.md`), the spot-check report (`...-spot-check.md`)

- [ ] Steps: render the full review table grouped by grid cell (every retune before→after, every replacement OUT/IN + justification, the O2|60+ debt checkbox, any spm-gate widening rows); build the spot-check sample per spec §5a (every replacement + 25% of retunes min 20 + 5 controls) with the checkable book-columns filled and James's two verdict columns EMPTY; the lead-piece question column included. Balance table appended. **STOP — James's content pass + spot-check verdicts. Any FAIL loops the workout back through Tasks 3/4 and re-samples.** Commit — `docs: the table James reads`

### Task 6: Close-out

**Files:** ROADMAP (the regen follow-on line resolves; Phase 9 references), DEVIATIONS if any content ruling created one, `library-balance.test.ts`, full gates

- [ ] Steps: full gates ×2 (unit/e2e/screenshots — e2e should be content-neutral except pinned-workout updates already made; verify); the final balance table (acceptance: matches the final grid within the solve's own tolerance) pasted into the ledger for the PR body; ROADMAP close; commit — `test: the library holds its new shape`

## Execution notes

- Task order strict except Task 2 may run parallel to Task 1's gate wait.
- Model guidance: T1 opus (the solver is the phase's brain); T2 sonnet; T3/T4 sonnet with the spec §6 table in every dispatch verbatim; T5 sonnet; T6 sonnet.
- Both gates are HARD: the controller presents, James rules, the loop resumes.
