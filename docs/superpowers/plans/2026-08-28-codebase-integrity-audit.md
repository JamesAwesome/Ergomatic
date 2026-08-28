# Codebase Integrity Audit Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to execute this plan task-by-task.
> Individual audit agents are read-only investigators; the controller owns all
> report files and commits. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an independently evidenced, priority-ordered fix list for
Ergomatic’s correctness, brittleness, over-engineering, circular logic, and
unsupported factual claims.

**Architecture:** The audit runs as five outcome-based lanes against one fixed
commit. Low-cost scouts build inventories and probes, specialist investigators
test bounded claims, and a high-end controller validates citations, rejects
circular evidence, and promotes only independently supported candidates. A
fresh validator and the project’s standing antagonist/product-manager gates
review the final report before it is handed to Claude Code.

**Tech Stack:** TypeScript 6, React 19, Express 5, PostgreSQL 18, Drizzle,
Vitest, Playwright, Stryker, Docker Compose, PM5 BLE captures, primary vendor
documentation, Markdown audit records.

**Spec:**
`docs/superpowers/specs/2026-08-28-codebase-integrity-audit-design.md`

## Global Constraints

- Audit baseline is exactly
  `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`; exclude untracked files and
  record any later `main` movement without blending evidence.
- Audit agents are read-only. They do not modify code, tests, fixtures,
  documentation, data, Git state, or external systems.
- The controller is the only writer of audit artifacts and the only committer.
  It runs `git rev-parse --show-toplevel` immediately before every commit.
- Every subagent reads `.claude/agent-briefing.md` before its task brief.
- Every conclusion carries a separate severity and evidence grade. A
  hypothesis never appears in the Claude fix list.
- A test/fake is not an independent oracle when changing shared production
  logic could leave both sides agreeing.
- Any P0/P1, number-meaning, stored-shape, auth, or device-command candidate
  receives an independent high-end validation pass.
- No hardware walk, external write, merge, PR close, or worktree removal occurs
  without James’s explicit approval.
- Run the expensive whole-repo gates once at baseline and once at finalization;
  lane agents use read-only inspection and narrow existing probes.
- One PR carries the spec, execution plan, audit record, and final report unless
  a validated triad fix must be split into its own later PR.

## Artifact Structure

The controller creates and owns this directory during Task 1:

```text
docs/superpowers/audits/2026-08-28-codebase-integrity/
  00-dashboard.md
  01-oracle-inventory.md
  02-baseline-gates.md
  03-phase-gates.md
  lane-a-workout.md
  lane-b-data.md
  lane-c-client.md
  lane-d-monitor.md
  lane-e-gates.md
  candidates.md
  findings.md
  risk-register.md
  claude-fix-list.md
  final-report.md
```

`00-dashboard.md` is the live source of execution state. It records each task’s
status, owner, model tier, baseline SHA, dispatch time, result, accepted report
path, and whether a second pass was required. It also records the reason a
stronger model was used; this is the credit-spend ledger.

The task states are exact: `NOT_STARTED`, `IN_PROGRESS`, `NEEDS_EVIDENCE`,
`BLOCKED_ON_JAMES`, `CLEARED`, and `COMPLETE`. At most one controller task is
`IN_PROGRESS`; up to three read-only investigations may run concurrently.

## Model and Dispatch Budget

| Tier                 | Model / effort               | Use                                                                              | Do not use for                                              |
| -------------------- | ---------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Scout                | `gpt-5.6-luna`, medium       | File/claim inventory, call-site maps, fixture origins, command evidence          | Final defect judgments or state-machine invention           |
| Investigator         | `gpt-5.6-terra`, high        | A bounded audit lane or end-to-end trace with evidence and discriminating probes | Whole-repo coordination or final prioritization             |
| Controller/validator | `gpt-5.6-sol`, high or xhigh | Phase gates, P0/P1 validation, disagreement adjudication, final ranking          | Repeating mechanical inventories already produced by scouts |

All dispatches use `fork_turns: "none"` and a self-contained brief. Reuse an
investigator only for a narrow follow-up in the same lane; use a fresh agent for
independent validation. If an agent omits evidence, request only the missing
field once—do not pay for a repeated whole-lane scan.

---

### Task 1: Establish the Audit Control Record

**Owner/model:** Controller, `gpt-5.6-sol` high.

**Files:**

- Create: all files listed under **Artifact Structure**.
- Read: spec, this plan, `.claude/agent-briefing.md`, `AGENTS.md`, `ROADMAP.md`,
  `docs/TESTING.md`.

**Interfaces:**

- Consumes: approved spec at commit `8d0158f` and product baseline `39460c6`.
- Produces: initialized dashboard, empty-but-structured lane reports, candidate
  register, finding register, risk register, and final-output shells.

- [ ] **Step 1: Verify the execution checkout and baseline**

  Run from the audit worktree:

  ```bash
  git rev-parse --show-toplevel
  git branch --show-current
  git rev-parse 39460c6
  git status --short
  ```

  Expected: the audit worktree path, the audit branch, the full baseline SHA,
  and no unrelated change.

- [ ] **Step 2: Create the artifact directory and exact record headings**

  Use `apply_patch`. Every lane report starts with:

  ```md
  # Lane X — title

  Baseline: 39460c6514c14ab3133cb5ce8a59ba8625aeef4a
  Status: NOT_STARTED
  Scope:
  Authorities:
  Claims tested:
  Cleared probes:
  Candidates:
  Unknowns:
  Contradictions with the brief:
  ```

  `candidates.md` and `findings.md` use the `AUD-###` record from the spec’s
  **Task and finding record contract**. `risk-register.md` uses the same record
  but forbids `Smallest safe fix` until confidence becomes Confirmed/Probable.

- [ ] **Step 3: Initialize the dashboard**

  Add one row for Tasks 1–15 with the exact task name, model tier, initial
  `NOT_STARTED` status, and expected artifact. Mark Task 1 `IN_PROGRESS` while
  editing, then `COMPLETE` only after Step 4 passes.

- [ ] **Step 4: Verify and commit the control record**

  Run:

  ```bash
  pnpm --dir app exec prettier --check ../docs/superpowers/audits/2026-08-28-codebase-integrity
  git diff --check
  git rev-parse --show-toplevel
  git commit -am "docs: initialize codebase integrity audit"
  ```

  If the new files are untracked, stage only the exact audit directory before
  the commit. Do not use `git add .`.

---

### Task 2: Run the Phase-Open Gates

**Owner/model:** Controller dispatches standing `product-manager` and
`antagonist`, `gpt-5.6-sol` high, in parallel.

**Files:**

- Modify (controller only): `03-phase-gates.md`, `00-dashboard.md`.
- Read: spec, execution plan, `.claude/agents/pm-ledger.md`,
  `.claude/agents/antagonist-ledger.md`, current ROADMAP live slate.

**Interfaces:**

- Consumes: the complete audit decomposition and risk model.
- Produces: PM scope/build-now verdict, antagonist anchor pass, vetted ground,
  required plan corrections, and ready-to-paste ledger entries.

- [ ] **Step 1: Dispatch the product-manager gate**

  Brief it to judge audit scope, sequencing, tester impact, affordability, and
  whether the final deliverable will be actionable for Claude. Require an
  explicit `GO`, `GO_WITH_CHANGES`, or `NO_GO` verdict plus a proposed ledger
  entry. The agent writes no files.

- [ ] **Step 2: Dispatch the antagonist anchor pass**

  Brief it to attack the spec, plan, evidence grades, no-circular-proof rule,
  model allocation, and Lane D as the riskiest lane. Require attacked-and-held
  claims as `VETTED GROUND`, blocking changes, and a proposed ledger entry. The
  agent writes no files.

- [ ] **Step 3: Resolve findings before investigation starts**

  The controller re-reads every cited line. Apply required corrections with
  `apply_patch`, record each disposition in `03-phase-gates.md`, and stop on
  `NO_GO` or unresolved blocking evidence.

- [ ] **Step 4: Commit the gate record and any approved corrections**

  Run formatting and `git diff --check`, verify the worktree path, then commit:

  ```bash
  git commit -am "docs: gate the codebase integrity audit"
  ```

---

### Task 3: Record the Baseline Gate and Artifact Identity

**Owner/model:** Controller; no subagent.

**Files:**

- Modify: `02-baseline-gates.md`, `00-dashboard.md`.
- Inspect: `app/package.json`, `app/vitest.config.ts`, CI workflows,
  `app/scripts/dist-grep.sh`, compose scripts.

**Interfaces:**

- Consumes: fixed baseline and approved phase-open plan.
- Produces: one authoritative gate transcript and explicit blind spots for all
  later lane reports.

- [ ] **Step 1: Record artifact identity before testing**

  Run:

  ```bash
  git rev-parse HEAD
  git diff 39460c6 -- app app/e2e app/server app/domain
  node --version
  pnpm --version
  docker version
  ```

  Expected: product code diff is empty; Node 26 and pnpm 11 are active.

- [ ] **Step 2: Run the non-Docker gates once**

  From `app/`, record exit codes and concise counts for:

  ```bash
  pnpm lint
  pnpm format:check
  pnpm typecheck
  pnpm test
  pnpm test:coverage
  pnpm build
  pnpm dist:grep
  ```

  Read per-file coverage for the large/high-risk production files; do not report
  only the global percentage.

- [ ] **Step 3: Run the real-boundary gates once**

  From `app/`:

  ```bash
  pnpm test --project integration
  pnpm e2e
  ```

  Record Docker availability, test counts, failures, retries, and any path not
  entered. Do not interpret a green browser run as native evidence.

- [ ] **Step 4: Tear the audit stack down with its volume**

  From `app/`:

  ```bash
  bash -lc 'source scripts/stack-env.sh; docker compose -p "$COMPOSE_PROJECT_NAME" down -v'
  ```

  Record the resolved compose project name and confirm its containers and
  volume are absent.

- [ ] **Step 5: Commit the baseline transcript**

  Update dashboard status, format the report, verify the worktree path, and
  commit `02-baseline-gates.md` plus `00-dashboard.md`:

  ```bash
  git commit -am "docs: record codebase audit baseline gates"
  ```

---

### Task 4: Build the Oracle, Fixture, and Claim Inventory (Lane E, Pass 1)

**Owner/model:** Scout, `gpt-5.6-luna` medium.

**Files:**

- Modify (controller only): `01-oracle-inventory.md`, `lane-e-gates.md`,
  `00-dashboard.md`.
- Inspect: all test configs, fakes, fixtures, captures, scripts, CI, deployment
  docs, design assertions, and factual comments referenced by tests.

**Interfaces:**

- Consumes: baseline gate transcript.
- Produces: a table mapping each important behavior to production path, test
  path, fixture origin, oracle origin, shared logic, external authority, and
  unentered platform branch.

- [ ] **Step 1: Dispatch a self-contained read-only scout**

  Require exact `file:line` evidence, `VERIFIED / INFERENCE / UNVERIFIED`
  labels, and no defect verdicts. The scout must inventory:

  - Vitest project boundaries and coverage scopes;
  - real/fake store contract pairing;
  - fake PM5 fields and production helper reuse;
  - committed raw versus decoded capture capabilities;
  - Playwright routes, data variants, browser-only branches, and design sweeps;
  - Stryker mutation scope and last measured baseline;
  - build, bundle, CI-path, compose, and deploy assertions;
  - import cycles, duplicated transformations, unreachable state arms,
    one-consumer abstractions, and interfaces whose only implementation is their
    own test fake;
  - external-library, browser, operating-system, and device assumptions stated
    as facts in code or tests;
  - documentation claims that operate as test premises.

- [ ] **Step 2: Controller verifies every promoted inventory row**

  Re-open the cited source and name the line that could falsify the row. Remove
  rows that merely quote historical prose. Place unresolved claims in
  `risk-register.md`, not the oracle table.

- [ ] **Step 3: Identify the highest-value discriminating probes**

  Rank probes by whether they could change a P0–P2 decision. Include the exact
  source corruption or independent input that would make each gate fail.

- [ ] **Step 4: Commit Lane E Pass 1**

  Record scout model/use in the dashboard, land only verified rows, format,
  verify worktree, and commit:

  ```bash
  git commit -am "docs: map codebase audit oracles"
  ```

---

### Task 5: Audit Workout Semantics and PM5 Compilation (Lane A)

**Owner/model:** Two investigators, `gpt-5.6-terra` high, in parallel:
`workout_semantics` and `pm5_compiler`.

**Files:**

- Modify (controller only): `lane-a-workout.md`, `candidates.md`,
  `risk-register.md`, `00-dashboard.md`.
- Inspect: `app/domain/**`, builder/import adapters, seed corpus, plan/suggest
  call sites, session engine inputs, PM5 compiler/encoder, and their tests.

**Interfaces:**

- Consumes: oracle inventory and Lane A requirements from the spec.
- Produces: dispositioned boundary matrix, compiler/encoder independence table,
  cleared probes, and candidate records.

- [ ] **Step 1: Dispatch workout semantics investigation**

  Require separate expectations for validation, repeats, rests, effort/split
  references, null baselines, distance/time work, estimates, display pieces,
  generation, and seeded corpus behavior. The agent must trace at least these
  discriminators:

  - repeat marker before/after attribution;
  - omitted rest versus zero and minimum rest;
  - leading standalone rest across bulk import, validation, display, timer, and
    PM5 connect;
  - effort-only distance work without baselines;
  - baseline change before and after a session is frozen;
  - all generated and seeded shapes through real consumer entry points.

- [ ] **Step 2: Dispatch PM5 compiler/encoder investigation**

  Require independently authored byte/quantity expectations for time,
  distance, rest folding, interval caps, target pace precision, multi-frame
  writes, and stale-tail assumptions. Production encoder output cannot be its
  own expected value.

- [ ] **Step 3: Controller reconcile shared claims**

  If the investigators disagree about a transformation, re-run the boundary
  with a hand-calculated expectation. One finding owns the full path; link both
  reports rather than duplicating it.

- [ ] **Step 4: Record Lane A disposition**

  Every spec question becomes `CLEARED`, `CANDIDATE`, `UNKNOWN`, or
  `DEFERRED` with reason. Promote no candidate without authority and disproof.

- [ ] **Step 5: Commit Lane A reports**

  Format, verify the worktree, and commit the lane report, registers, and
  dashboard update:

  ```bash
  git commit -am "docs: audit workout semantics and compiler"
  ```

---

### Task 6: Audit Durable Data, Migrations, Auth, and API Contracts (Lane B)

**Owner/model:** Two investigators, `gpt-5.6-terra` high, in parallel:
`stored_shapes` and `auth_api_contracts`.

**Files:**

- Modify (controller only): `lane-b-data.md`, `candidates.md`,
  `risk-register.md`, `00-dashboard.md`.
- Inspect: `app/server/**`, `app/drizzle/**`, `app/src/api/**`, `app/src/api.ts`,
  native auth, local/session storage readers, store contracts, integration and
  E2E tests.

**Interfaces:**

- Consumes: baseline Postgres result and oracle inventory.
- Produces: durable-shape register, migration matrix, ownership/auth matrix,
  response-validation map, and candidate records.

- [ ] **Step 1: Dispatch stored-shape investigation**

  Require one row per SQL/JSONB/browser-storage shape: writer, validator,
  reader, version/migration order, ownership, malformed behavior, delete
  behavior, and real/fake contract. Probe the exact risks already visible in
  the map: JSONB read validation, legacy shapes, migration 0008 variants,
  duplicate log/test-history writes, plan/log transaction races, and two-server
  migration/seed startup.

- [ ] **Step 2: Dispatch auth/API investigation**

  Trace cookie and native bearer requests separately from sign-in through
  authorization and response parsing. Probe malformed 2xx bodies, unchecked
  client casts, token persistence shape, origin behavior, test-auth mounting,
  account ownership, and error recovery.

- [ ] **Step 3: Require real-boundary evidence for promoted data claims**

  A fake-only result cannot promote a SQL candidate. An auth claim must name
  the mounted route and transport. A data-loss claim must show the exact record
  or transaction affected.

- [ ] **Step 4: Reconcile and commit Lane B**

  Controller verifies citations, deduplicates client/server manifestations,
  records unknown external behavior, formats, verifies worktree, and commits:

  ```bash
  git commit -am "docs: audit data and API contracts"
  ```

---

### Task 7: Audit Client Workflow, Recovery, and Log Truth (Lane C)

**Owner/model:** Two investigators, `gpt-5.6-terra` high, in parallel:
`active_session` and `saved_log_truth`.

**Files:**

- Modify (controller only): `lane-c-client.md`, `candidates.md`,
  `risk-register.md`, `00-dashboard.md`.
- Inspect: `app/src/session/**`, builder, Today/plan, log/history, router/shell,
  API hooks, storage modules, realistic client/E2E fixtures.

**Interfaces:**

- Consumes: Lane A semantics and Lane B durable-shape dispositions.
- Produces: writer/event traces for active session and saved log, recovery
  matrix, duplicate-derivation table, and candidate records.

- [ ] **Step 1: Dispatch active-session trace**

  Trace authored workout → countdown/timer → active run → reload/background →
  discard/end/save. Enumerate every writer and cleanup for run/draft/selection
  state. Probe storage reads and writes throwing, stale callbacks, double taps,
  navigation/unmount, baseline changes, and network loss.

- [ ] **Step 2: Dispatch saved-log truth trace**

  Trace manual and PM5 actuals through log construction, POST, SQL, list/detail
  API, summary model, history row, and chart. Recompute each displayed headline
  from independently read stored rows. Distinguish measured, derived,
  estimated, stale, and unknown values.

- [ ] **Step 3: Trace all remaining client flows mechanically**

  Dispatch a Luna scout to map builder, Today, onboarding, plan, library, news,
  settings, shell/router, and shared component call graphs. Every `app/src`
  product directory receives an owner and disposition. The scout may not
  declare defects; the controller adds focused probes only where a user outcome
  or authority boundary exists.

- [ ] **Step 4: Reconcile and commit Lane C**

  Reject component-existence findings and code-size complaints. Promote only a
  user-visible behavior, lost recovery, duplicated authority, or unsupported
  claim. Format, verify worktree, and commit:

  ```bash
  git commit -am "docs: audit client workflow and log truth"
  ```

---

### Task 8: Audit the Connected Monitor as Four Traces (Lane D)

**Owner/model:** Two investigators, `gpt-5.6-terra` high, in parallel:
`program_and_live` and `lifecycle_and_finish`.

**Files:**

- Modify (controller only): `lane-d-monitor.md`, `candidates.md`,
  `risk-register.md`, `00-dashboard.md`.
- Inspect: PM5 domain codec/compiler, transports, driver, hook, connected
  surface, persistence/logging, raw captures, hardware walk records, primary
  documentation already cited by the repo.

**Interfaces:**

- Consumes: Lane A compiler disposition, Lane C log trace, and oracle inventory.
- Produces: four transition/evidence tables, capture coverage matrix, native
  evidence gap list, and candidate records.

- [ ] **Step 1: Dispatch program/readback and live-attribution traces**

  Require raw-byte provenance, independently supplied program metadata,
  interval-index/reset boundaries, source/quantity naming, and every downstream
  consumer. The agent must state what each PM5 oracle measures before comparing
  it to the app.

- [ ] **Step 2: Dispatch background/recovery and finish/persistence traces**

  Require lifecycle/radio inputs, transport events, liveness/axes, phase,
  `endedBy`, terminate decision, held finish, summary/boundary reconciliation,
  record, log, and screen. Browser, native, and hardware evidence get separate
  rows.

- [ ] **Step 3: Build the native evidence gap list**

  Record native frame-gap distribution, plugin event ordering, suspended
  notification behavior, firmware/device variants, and missing raw recordings
  as `UNKNOWN` unless primary docs or committed captures settle them. Do not
  schedule hardware yet.

- [ ] **Step 4: Controller attacks every durable heuristic**

  Any threshold or inferred state that writes a record, suppresses/sends a PM5
  command, or chooses an interval receives a candidate/disproof record even if
  it is ultimately cleared.

- [ ] **Step 5: Reconcile and commit Lane D**

  Prior audit conclusions are leads only. Quote the current source/capture that
  supports each accepted row, format, verify worktree, and commit:

  ```bash
  git commit -am "docs: audit connected monitor traces"
  ```

---

### Task 9: Test the Gates and Factual Claims (Lane E, Pass 2)

**Owner/model:** Investigator `gpt-5.6-terra` high; controller performs build
artifact checks.

**Files:**

- Modify (controller only): `lane-e-gates.md`, `candidates.md`,
  `risk-register.md`, `00-dashboard.md`.
- Inspect: all evidence inventoried in Task 4 plus built output and coverage
  reports from Task 3.

**Interfaces:**

- Consumes: all lane candidates and the oracle inventory.
- Produces: discriminating-power verdict per gate, circular-proof findings,
  stale/unsupported claim findings, and cleared negative probes.

- [ ] **Step 1: Test fixture and oracle independence**

  For every candidate’s existing tests, answer: can the suspected production
  logic change while the expected value changes with it? Record shared helpers,
  generated expectations, empty/minimal fixtures, and platform branches the
  test cannot enter.

- [ ] **Step 2: Test assertion strength**

  Use existing Stryker results when current; run a scoped Stryker probe only
  where it can alter prioritization. For client gates outside Stryker scope,
  identify the exact corruption that must turn the named test red and use a
  disposable validation worktree if execution is necessary. Commit no mutation.

- [ ] **Step 3: Re-test artifact claims from the artifact**

  Use fresh `dist/`, container wiring, CI path selection, and deploy commands.
  For exclusion checks, prove the probe can go red with a distinctive string
  before trusting green. Do not infer bundle or deployment behavior by reading
  source alone.

- [ ] **Step 4: Sample load-bearing prose**

  Sample every lane’s comments/spec/test names that assert an external fact.
  Verify the quoted primary line and required attribute. Promote stale prose
  only when it can misdirect code, tests, release, or an operator; otherwise
  record it as P3 documentation debt.

- [ ] **Step 5: Reconcile and commit Lane E**

  Record cleared probes as well as failures, format, verify worktree, and
  commit:

  ```bash
  git commit -am "docs: audit gate and claim integrity"
  ```

---

### Task 10: Adjudicate and Deduplicate All Candidates

**Owner/model:** Controller, `gpt-5.6-sol` xhigh.

**Files:**

- Modify: `candidates.md`, `findings.md`, `risk-register.md`,
  `00-dashboard.md`.
- Read: every lane report, baseline transcript, phase-open gate, cited source,
  capture, and primary authority.

**Interfaces:**

- Consumes: all lane dispositions.
- Produces: validated candidate slate, rejected/cleared record, validation
  briefs, and immediate escalation for any P0/P1.

- [ ] **Step 1: Re-read every promoted citation**

  Verify the baseline file and the exact line that could falsify the claim.
  Reject dangling, stale, history-only, or attribute-silent citations.

- [ ] **Step 2: Deduplicate by user outcome and authority**

  One underlying defect with five visible surfaces is one finding with five
  consumers. Separate findings only when their trigger, authority, or safe fix
  can independently pass/fail review.

- [ ] **Step 3: Assign preliminary severity and confidence**

  Use the spec’s P0–P3 and Confirmed/Probable/Hypothesis definitions exactly.
  Do not use arithmetic scoring. Record why a smaller/larger priority was
  rejected. A proposed over-engineering finding must demonstrate duplicated
  authority, unreachable state, a contradictory interface, or measurable
  change cost; file length or unfamiliar abstraction is insufficient.

- [ ] **Step 4: Stop and notify James for live P0/P1**

  A validated security escape, destructive data path, unsafe command, or
  silently wrong durable number interrupts the batch. Present evidence and the
  dependent tasks paused; do not implement a fix.

- [ ] **Step 5: Write blind validation briefs**

  Each brief contains baseline, behavior, authority, trigger, and required
  disproof but omits the original investigator’s conclusion and proposed fix.
  This prevents the validator from merely confirming the narrative.

- [ ] **Step 6: Commit the preliminary slate**

  Format, verify the worktree, and commit the candidate adjudication before any
  validator reads it:

  ```bash
  git commit -am "docs: triage codebase audit candidates"
  ```

---

### Task 11: Independently Validate the Priority Slate

**Owner/model:** Fresh validators, `gpt-5.6-sol` high or xhigh; never the
candidate’s original author.

**Files:**

- Modify (controller only): `findings.md`, `risk-register.md`,
  `00-dashboard.md`.
- Inspect: exact candidate scope plus independent authority/probe.

**Interfaces:**

- Consumes: blind validation briefs.
- Produces: `CONFIRMED`, `DOWNGRADED`, `CLEARED`, or `NEEDS_EXTERNAL_EVIDENCE`
  verdict per candidate.

- [ ] **Step 1: Validate all mandatory classes**

  Every preliminary P0/P1, changed number meaning, stored shape, auth boundary,
  device command, and circular-proof claim gets a fresh validator. Parallelize
  only independent candidates, maximum three at once.

- [ ] **Step 2: Validate P2 items that can change ordering**

  Validate a P2 when its fix would touch a high-risk seam, its evidence conflicts
  with another lane, or it would otherwise be ranked above a validated item.
  Leave low-impact hypotheses in the risk register.

- [ ] **Step 3: Controller reproduce each accepted verdict**

  Re-read the validator’s evidence and run the discriminating command/probe
  when it is local and deterministic. Agent agreement alone is not validation.

- [ ] **Step 4: Update finding state**

  Promote only Confirmed/Probable records. Cleared items retain their probe and
  result. External unknowns move to the risk register without defect language.

- [ ] **Step 5: Commit the validated slate**

  Format, verify worktree, and commit findings, risk register, and dashboard:

  ```bash
  git commit -am "docs: validate codebase audit findings"
  ```

---

### Task 12: Decide Whether Hardware Evidence Can Change the Ranking

**Owner/model:** Controller, then hardware-walk skill only after James approves.

**Files:**

- Modify: `risk-register.md`, `lane-d-monitor.md`, `00-dashboard.md`.
- Do not modify a walk card or capture until separate approval.

**Interfaces:**

- Consumes: Lane D unknowns and validated slate.
- Produces: either `NO_HARDWARE_NEEDED_FOR_RANKING` or a smallest possible walk
  request whose outcomes change named findings.

- [ ] **Step 1: Filter hardware unknowns by decision value**

  Keep only questions where result A versus B changes severity, confidence, or
  fix direction. Everything else remains deferred research.

- [ ] **Step 2: Write the proposed walk matrix in the risk register**

  For each row state setup, action, PM5/app evidence captured in the same frame,
  raw log required, expected outcomes, and which candidate changes.

- [ ] **Step 3: Stop for James’s approval**

  Mark Task 12 `BLOCKED_ON_JAMES`. If approved, invoke `hardware-walk` and
  follow its complete operator contract. If declined, keep the affected items
  as `NEEDS_EXTERNAL_EVIDENCE`; do not guess.

- [ ] **Step 4: Adjudicate any returned hardware evidence**

  State what the PM5 quantity measures before comparison. Update findings and
  risk register; no code changes.

- [ ] **Step 5: Commit the hardware decision record**

  Whether hardware is used or deferred, format, verify the worktree, and commit
  the decision and evidence:

  ```bash
  git commit -am "docs: record codebase audit hardware decision"
  ```

---

### Task 13: Write the Final Audit and Claude Fix List

**Owner/model:** Controller, `gpt-5.6-sol` xhigh.

**Files:**

- Modify: `claude-fix-list.md`, `final-report.md`, `findings.md`,
  `risk-register.md`, `00-dashboard.md`.

**Interfaces:**

- Consumes: validated findings, cleared probes, external unknowns, and all lane
  dispositions.
- Produces: human-readable audit result and self-contained fix prompts for
  Claude Code.

- [ ] **Step 1: Verify lane completion**

  Every lane must be `COMPLETE` with each spec question dispositioned. Missing
  scope is recorded as `DEFERRED` with owner/reason, never silently omitted.

- [ ] **Step 2: Rank findings lexicographically**

  Order by user harm, evidence confidence, blast radius, then repairability.
  Keep dependency order when one fix is needed to validate another. Explain
  why each top-ten item outranks the next.

- [ ] **Step 3: Write `claude-fix-list.md`**

  For every Confirmed/Probable P0–P2 include:

  - outcome-first title and user impact;
  - evidence and exact trigger;
  - authoritative expected behavior and what it measures;
  - smallest safe fix direction, explicitly not a code prescription when design
    remains open;
  - affected files/shapes/auth/device interfaces;
  - test/capture/build/hardware verification required;
  - dependencies and reasons not to bundle unrelated triad work.

  Exclude P3-only cleanup from the main fix queue; group it under the next
  relevant owner.

- [ ] **Step 4: Write `final-report.md`**

  Open with what the audit established and why it matters. Include the priority
  table, coverage/disposition table by lane, strongest cleared claims, risk
  register link, method limitations, credit/model summary, and next decision
  required from James.

- [ ] **Step 5: Arithmetic and source self-check**

  Recompute every reported count from the lane registers. Open every P0–P2
  citation. Search for unsupported certainty words and for candidates presented
  as fixes without Confirmed/Probable evidence.

---

### Task 14: Run the Phase-Close Adversarial and Product Gates

**Owner/model:** Standing `antagonist` and `product-manager`, `gpt-5.6-sol`
high, in parallel; controller adjudicates.

**Files:**

- Modify (controller only): `03-phase-gates.md`, `final-report.md`,
  `claude-fix-list.md`, ledgers if accepted, `00-dashboard.md`.

**Interfaces:**

- Consumes: full audit report and fix list.
- Produces: antagonist exit verdict, PM release/actionability verdict, report
  corrections, proposed ledger entries, and final go/no-go.

- [ ] **Step 1: Dispatch antagonist exit pass**

  Attack evidence independence, oracle quantity, stale citations, missed
  transition classes, inert probes, false severity, and over-broad fixes.
  Require `PASS`, `PASS_WITH_CORRECTIONS`, or `FAIL` plus a proposed ledger
  entry. Agent writes no files.

- [ ] **Step 2: Dispatch product-manager close pass**

  Judge whether the result answers the original audit request, whether fixes are
  actionable and appropriately grouped, tester impact, remaining unknowns, and
  whether work should proceed. Require explicit verdict and proposed ledger
  entry. Agent writes no files.

- [ ] **Step 3: Controller resolve every finding**

  Re-read evidence before accepting a correction. Update report and ledgers via
  `apply_patch`. Stop on `FAIL`; do not soften the verdict into prose.

- [ ] **Step 4: Record the final gate**

  Put verdicts and dispositions in `03-phase-gates.md`; mark Task 14 complete
  only after no blocking correction remains.

---

### Task 15: Final Verification, Commit, and James Handoff

**Owner/model:** Controller; no subagent.

**Files:**

- Verify: every file in the audit directory, spec, and plan.
- Modify: `00-dashboard.md` final status only.

**Interfaces:**

- Consumes: passed phase-close gates.
- Produces: clean committed audit branch and user-facing handoff; no merge.

- [ ] **Step 1: Run fresh documentation and repository gates**

  From the audit worktree:

  ```bash
  pnpm --dir app lint
  pnpm --dir app typecheck
  pnpm --dir app format:check
  pnpm --dir app exec prettier --check ../docs/superpowers/specs/2026-08-28-codebase-integrity-audit-design.md ../docs/superpowers/plans/2026-08-28-codebase-integrity-audit.md ../docs/superpowers/audits/2026-08-28-codebase-integrity
  git diff --check
  ```

  Run product tests again only if an audit probe or accepted artifact changed
  tracked product/test/config code; the execution contract forbids that by
  default.

- [ ] **Step 2: Confirm dashboard and artifact completeness**

  Search for `NOT_STARTED`, `IN_PROGRESS`, missing finding fields, placeholders,
  and unreferenced lane reports. Every remaining `BLOCKED_ON_JAMES` must appear
  in the risk register and final report.

- [ ] **Step 3: Verify main-checkout safety**

  Run `git status --short` in both the audit worktree and main checkout. The
  main checkout’s original untracked files are not touched; report any new
  difference before proceeding.

- [ ] **Step 4: Commit without merging**

  Run:

  ```bash
  git rev-parse --show-toplevel
  git commit -am "docs: complete codebase integrity audit"
  ```

  Stage exact new audit paths if required. Do not open, merge, close, or approve
  a PR without James’s explicit instruction.

- [ ] **Step 5: Present the handoff**

  Give James the final report and Claude fix list links, P0/P1 count, top fix,
  remaining external evidence, phase-gate verdicts, and gate results. Stop for
  his review and merge/next-work decision.

## Execution Handoff

Use **Subagent-Driven execution**. The plan depends on bounded fresh
investigators, independent validators, and controller review between tasks;
inline batch execution would remove the independence the audit is designed to
measure.
