# Test reliability hunt plan

> **For agentic workers:** Use `superpowers:executing-plans` when executing
> this investigation. Independent source/log analysis can be delegated
> when authorized, but one controller owns heavy test execution. A concrete
> code-fix plan uses `superpowers:subagent-driven-development` or the repo's
> approved inline implementation plus independent review shape.

**Status:** authorized for execution, 2026-09-15; discover and prove causes, not
paste-tested implementation code for causes not yet known.
**Goal:** produce a ranked, attributable failure inventory; repair the
established causes; make recurrence visible within a measured resource budget.
**Architecture:** reuse Vitest, Playwright, GitHub job logs and the existing
wrappers. Separate collection, classification, bounded experiments and
verification. Keep evidence files small and process large logs sequentially.
**Tech stack:** Node 26, pnpm 11, Vitest 4.1.11, Playwright 1.63.0,
Testcontainers/Postgres, GitHub Actions, macOS and Linux diagnostics.
**Spec:** [test reliability](../specs/2026-09-15-test-reliability-design.md).
**Research:** [verified starting evidence](../research/2026-09-15-test-reliability.md).

## Execution checkpoint — 2026-09-15

Hardened with two lenses; capture, inventory and all three residual repairs
are committed on `codex/flake-hunt-spec`. The historical hunt is bounded,
not a claim that the suite is flake-free. Probes run serially at one worker
only under normal pressure; other tasks' processes are preserved.

| Task | Current disposition | Remaining gate |
| --- | --- | --- |
| 1 — population | 1,036 completed logs; 51 named events; all titles triaged; retained retry traces inspected | No invented historical per-test denominator; recurrence observation remains |
| 2 — resources | One-worker client/browser samples; owned compose cleanup rehearsed and completed after actual application probes; hosted Linux resource artifacts verified | Full local suite capacity, hard-kill completeness and tracing overhead remain unmeasured |
| 3 — evidence | Native seams checked; 15 child-process and two inventory tests pass; 22 deciding evidence mutants killed; earlier exact-head hosted CI passed | Updated exact-head CI after residual repairs |
| 4 — investigation | PAIRING fixed-lifetime race reproduced; late NFC observer discriminated; FILTER serialization/aggregation cost measured | Historical FILTER amplification and historical NFC physical paint remain unassigned, not reasons to defer the proven repairs |
| 5 — repair | Deterministic fake holds, pre-armed NFC receipt and guarded full-document axe fast path; 10 additional mutants killed; restored 158 client / 11 browser checks pass; Standards/Spec PASS | Updated full CI, then recurrence observation; no product behavior change |
| 6 — adoption | Report-first wiring implemented; strict normal-CI enforcement remains off | Exact-head CI, James's merge ruling, 20-job/seven-day observation and post-merge result |

The [execution receipt](../research/2026-09-15-test-reliability.md#execution-checkpoint--not-merge-ready)
records the original capture checks; the [residual repair receipt](../research/2026-09-15-flake-hunt/residual-repairs.md)
records subsequent changes and their proof. Unchecked items below are not completion
claims; this checkpoint is the resume point, not a new phase or closed row.

## Global constraints

- One heavy local experiment at a time; ordinary test commands remain
  advisory-only. Start named-file probes with one worker and no coverage.
- Proposed limits: 30 minutes per local hypothesis, 10 minutes per
  invocation, initial batches of at most five repetitions. Stop early
  when a failure needs interpretation; do not run until green.
- No local probe launches under warning/critical or uninterpretable host
  pressure. A kill or fatal allocation failure ends local execution for
  the session. Keep collecting desk evidence.
- CI comparisons initially get at most three runs per configuration.
  Normal CI traffic supplies the proposed 20-job/seven-day confirmation.
- Preserve isolation, assertion strength and existing coverage floors.
  Never retry a resource kill; never turn an app defect into a test wait.
- No new runtime dependencies, custom scheduler, blanket retries, skips,
  global timeout increases or machine-wide lock are prescribed.
- Product changes follow their own risk gates. Nothing here approves a
  merge, deployment, device install, or deletion of another task's data.

## Deliverable map

| Deliverable | Owner/location | Consumer |
| --- | --- | --- |
| Inventory and run manifests | `docs/superpowers/research/<execution-date>-flake-hunt/` | Controller chooses experiments |
| Raw job logs and reports | Local evidence directory; retained CI artifacts for new runs | Diagnosis and reproducibility |
| Resource calibration | Same research directory, one record per invocation | Controller decides where a probe fits |
| First-failure evidence changes | Existing configs, wrappers and CI workflow | Every later investigation |
| Proven repairs | Shared helper or product module actually responsible | Existing behavior and regression tests |
| Current policy | `docs/TESTING.md`, with corresponding entry-point behavior | Future authors and reviewers |

The execution date is minted once when the hunt starts. Each invocation
gets a unique directory; a rerun never overwrites the failure it investigates.
Keep summaries and sanitized receipts in git. Raw traces may carry cookies
or tokens; do not commit them without inspecting and removing those values.
Mint the invocation ID/root before launch. Omitted root uses an ignored
default, explicitly empty root is rejected. Each invocation is newly
created below the resolved root, never reused or symlink-escaped. Resolve
paths once for producer/checker/summary/uploader. The sidecar receipt binds
native reports to ID/SHA/argv; no custom report fields are assumed.

## Task 1 — Establish the present population without running tests

**Read:** ROADMAP Wave D, the FLAKE 5 inventory, current test configs,
CI workflow, `docs/TESTING.md`, and the companion research record.
**Produces:** one inventory entry per failure family and an evidence
coverage report. No new code or test process is required.

- [ ] Record the execution baseline SHA and tracked working-tree diff;
  reject comparisons across an unnoticed code change.
- [ ] Enumerate CI runs in the 14-day window, every workflow attempt and
  its app/E2E jobs. Use the attempt-specific jobs API, paginate, and retain
  run/job IDs and fetch errors. Avoid `gh run list` conclusions as a test
  outcome source. Limit downloads to two at once, parsing one log at a time.
- [ ] Extract first failures, retry recoveries, final failures, suite
  errors, container retries and aborts from job logs. Reconcile summaries
  with detailed failures. Inspect green E2E logs as well as red ones.
- [ ] Associate renamed tests and historical fixes by file/title/history;
  mark confidence and unresolved identity instead of double-counting.
- [ ] Fetch retained reports for current suspects before their 14-day
  expiry. Preserve the original failed page, call log and any available
  trace. Record when only a retry trace exists.
- [ ] Rank by first-attempt frequency among eligible exposures, time lost,
  product consequence and evidence quality. Correlation does not supply a
  cause. Distinguish new regressions and deterministic fixture drift.
- [ ] Reconcile the historical inventory rather than copying its totals.
  Name exact exclusions and missing data; produce no “all CI” rate from
  a truncated sample.
- [ ] Name every rate's unit: per-test job incidence versus initial-execution
  incidence. Preserve repeat and retry indices in deduplication. Unknown
  historical test exposure produces event counts, not a guessed rate;
  incomplete jobs contribute only independently evidenced test exposures.

**Done when:** another reader can reproduce each count from named job
inputs and identify the highest-value next probe without rerunning a suite.

## Task 2 — Establish an execution window and resource baseline

**Read:** `app/scripts/test-run{,-advisory}.sh`,
`app/scripts/{measure-test-memory,count-test-workers,test-kill-capture}.sh`,
`app/scripts/{stack-env,stack-reap,e2e,screenshots}.sh`.
**Produces:** a resource record and explicit go/defer decision for each probe.

- [ ] Inspect live test processes and worktrees, peer registrations,
  Docker containers and host memory pressure. Establish the platform's
  pressure-state meanings from local OS headers or primary documentation.
  Do not equate free pages with usable capacity.
- [ ] Choose an idle local execution window, or keep the task in desk
  analysis if no window exists. Preserve other tasks' processes and stacks.
- [ ] Before any new capture wrapper, define a lifetime table for observer,
  command group, workers, detached browser groups, sample stream, evidence
  directory and owned containers. Observer/writer stay outside the group
  they interrupt. Record ownership while alive; reparenting or disappearance
  of the command leader never establishes descendant cleanup.
  The observer owns the receipt, records child PID/PGID and actual wait
  status/signal, then atomically finalizes after wait. Missing/nonterminal
  receipt is incomplete; report JSON cannot supply command status.
- [ ] Use one small named-file run to measure actual Node worker count,
  tree RSS and host pressure. Add browser and container/VM measurements
  only for a probe that uses them. Keep those domains separate.
- [ ] Preserve full stdout/stderr and the real child exit status. The
  existing memory sampler discards output, so it must not be the only
  instrument. A shell pipeline must preserve the child's status.
- [ ] Rehearse fabricated pressure with ordinary and detached descendants
  plus an unrelated sentinel. Observer survives, partial logs persist,
  owned descendants are accounted for, sentinel survives. Rehearse the
  relevant browser/compose cleanup before relying on a heavy E2E probe.
  Uncertain cleanup defers later probes; no broad process matching/killing.
  Do not induce a real laptop OOM. Hard termination may prevent reporter
  finalization: absent terminal receipt/report/trace stays incomplete.
- [ ] If a concurrency comparison is needed, compare one and two workers
  on the same named selection and data state. Publish memory and wall time;
  do not extrapolate that result to full coverage or full E2E.

**Done when:** the controller can stop its own experiment, keep its evidence,
and state the measured resource cost. A deferred execution window is a
valid outcome, not permission to remove the limit.

## Task 3 — Make future first failures observable

**Candidate files:** `app/playwright.config.ts`, `app/vitest.config.ts`,
`app/scripts/test-run.sh`, `app/scripts/test-kill-capture.sh`,
`.github/workflows/ci.yml`, `docs/TESTING.md`. Change only the files needed
after Task 1 identifies missing evidence.
**Produces:** a concrete implementation brief and then a reviewed evidence
capture change; no custom reporter is assumed.

- [ ] Specify built-in JSON plus existing human output, output paths,
  artifact upload on failure/success, bounded retention, and run provenance.
  Ensure Vitest keeps its summary because the wrapper consumes it.
  Track attempt outcomes, command exit/signal and evidence status separately.
  Native JSON success never overrides coverage/global-error/teardown failures.
  Preserve command status; a separate evidence check fails CI when required
  reports/terminal receipts are missing, including after child exit zero.
  Preserve the original test step's status. Publish summary and artifacts
  under `always()`, then run the evidence check under `always()`; neither
  command failure nor evidence failure may suppress its own diagnostics.
- [ ] Add first-attempt Playwright tracing to a bounded hunt profile using
  installed `retain-on-failure`; include the failed page context and
  browser errors. Benchmark enabled/disabled tracing on the same named
  selection before proposing it for every CI run.
- [ ] Capture resource evidence for timeouts as well as kills, including
  Linux runner evidence; the current kill collector is macOS-oriented.
  Record unavailable measurements explicitly. Keep collection independent
  of a child that may terminate before its reporter runs.
- [ ] Preserve retry and container-retry events as outcomes in the summary.
  Do not let final success erase attempt zero or a failed setup hook.
- [ ] Write the exact implementation and fixture tests in an isolated
  worktree, with fail-first and deciding-source mutations, before its
  hardening/review. Required fixtures: pass, deterministic assertion fail,
  fail-then-pass, setup failure with zero completed tests, signal death,
  worker allocation failure, and absent/unreadable report.
  Include passing assertions followed by coverage failure or an unhandled
  error; an unwritable report after a successful child; and two repetitions
  with one retry recovery (execution incidence 1/2, job incidence 1/1).
  Cross launcher → real fixture child → checker → rendered summary/artifact
  manifest, with independent literal expectations. Exercise omitted/empty/
  valid roots, reused/symlinked paths, mismatched receipts and stale reports.
  Scope protection comes from fresh invocation roots, not native JSON fields.
- [ ] Confirm the collector and summarizer fail visibly on missing data
  while preserving the test command's exit code and interruption semantics.
  Recheck direct wrapper and package-script invocation shapes.

**Done when:** each fixture reports the correct initial outcome and evidence
links, and absent evidence cannot look like an entirely clean run.

## Task 4 — Run a bounded investigation for each leading family

**Candidate source:** determined from Task 1's ranked inventory. Initial
leads are named in the spec, not assumed guilty.
**Produces:** a causal reproducer or an explicit inconclusive result.

- [ ] Write a hypothesis card: observed symptom; exact failing environment;
  proposed cause; competing explanation; one changed variable; independent
  observable; predicted outcomes; time/repetition/resource budget.
- [ ] Verify selected tests before execution. Pass file patterns bare,
  never after a standalone `--`; retain Node's webStorage compatibility
  flag by using `scripts/test-run.sh` for actual Vitest runs. Use native
  list/help commands to validate the selection and flags.
- [ ] Start at the exact named test. If green, choose the next experiment
  that separates the competing explanations: file neighbors and a saved
  shuffle seed for ordering, controlled response delay for readiness,
  retained/fresh stack for persistence, or mixed/separated projects for
  contention. Do not change several of these at once.
- [ ] Distinguish runner invocation, worker process, repeat/retry index,
  browser context and backend account. Playwright repeat indices change
  worker hashes; retries replace failed workers. Record workerIndex,
  parallelIndex, actual RUN_ID and backend identity for relevant attempts.
  Same-worker or retained-account experiments must demonstrate that reuse;
  neither follows from one CLI invocation or one retained database.
  Preserve actual observed order as well as a shuffle seed.
- [ ] After any failure, read the evidence before the next invocation.
  A 401 requires status/body/auth-path evidence. A layout failure requires
  the actual bounding trajectory and failed screen. A container error
  requires its startup stage and ownership. Do not substitute a larger
  timeout for missing evidence.
- [ ] For CI-only failures, reproduce the same job command, coverage mode,
  selection and worker settings on CI. `gh run rerun --failed` selects
  jobs, not tests; a scoped test rerun and a whole-job rerun are different
  observations. Avoid rerunning a whole main workflow that also deploys
  merely to gather test evidence.
- [ ] At the budget, record cause-established or inconclusive. An
  inconclusive result names the missing observable and the next useful
  experiment, rather than buying another batch of identical greens.

**Done when:** a reproducer distinguishes causes, or the evidence precisely
states what remains unknown. Both preserve original failure artifacts.

## Task 5 — Repair by demonstrated cause

**Files:** only the responsible helper/fixture/module and its actual callers.
**Produces:** one coherent reviewed change per cause or shared cause family.

- [ ] State the behavior protected, supported producer/order, independent
  observable, deciding-source mutation and maximum justified claim.
- [ ] Write a failing test at the cheapest layer that crosses the broken
  boundary. Use actual delays/transactions/fixtures only where the boundary
  requires them; avoid synthetic orderings that production cannot reach.
- [ ] Repair the responsible code. Census sibling callers of that exact
  mechanism and apply the invariant consistently. Do not refactor unrelated
  tests or make broad environment changes in the same comparison.
- [ ] Commit the real change before mutation probes; confirm the commit
  landed and the working-tree root is correct. Run the original deciding
  mutant, read the expected failure, restore without losing uncommitted
  work, and verify the restored pass.
- [ ] Run scoped repo gates sequentially. Use CI for the full suite and
  inspect every relevant test attempt at the current head, not just a green
  status. Keep the full coverage gate; do not combine partial coverage
  reports without validating their semantics.
- [ ] Route auth, stored data, number meaning or device behavior changes
  through the required full review. A defect discovered by a test remains
  a product defect when its supported user path is wrong.

**Done when:** evidence supports the cause and repair, sibling sites have
been accounted for, and tests still detect the original regression.

## Task 6 — Confirm repairs and adopt the prevention policy

**Files:** evidence record, `docs/TESTING.md`, test/CI entry points only as
approved; proposed ROADMAP dispositions presented to James.
**Produces:** measured post-fix status and a visible policy decision.

- [ ] Publish first-attempt failures and missing artifacts in CI summaries.
  Use James's agreed report-first, then enforce rollout (2026-09-15).
- [ ] For each repair, collect the proposed 20 eligible post-fix jobs over
  seven days from ordinary CI traffic. Distinguish workflow reruns, test
  retries, changed tests and changed environments; publish the denominator.
  Do not claim absence from a test that was skipped or no longer selected.
- [ ] Enable normal CI `failOnFlakyTests` after cleanup, detector validation
  and the observation checkpoint, preserving retries for evidence. Verify
  a fail-then-pass fixture makes the intended gate red first, and that an
  absent report cannot pass. Keep Vitest failures blocking without adding
  automatic suite retries. Clean runs alone cannot authorize this step.
- [ ] Classify each family as causally fixed, mitigated, instrumented but
  unresolved, or no recurrence observed. Keep these labels distinct.
- [ ] Present residual owners/next probes/review dates and existing
  ROADMAP row dispositions together. No silent strikes, auto-quarantine or
  assumed approval of new backlog. Check overdue rows using the repo's
  wrap-safe method before the final PR hand-back.
- [ ] Record main's post-merge result. Tear down only this hunt's stack
  and worktree at the repo-authorized point after merge.

**Done when:** James has a measured disposition for every selected family,
remaining uncertainties have useful instruments and an owner, and the
agreed recurrence policy catches its synthetic failure case.

## Validation boundary

Current configuration, prior rulings, recent CI output and native option
availability were inspected. This plan deliberately contains no invented
repair implementation. Bounded native reporter checks and lightweight
fixtures have run, including native coverage/unhandled command failures and
browser interruption. The client/browser resource samples are observed
lower bounds, not peak/full-suite capacity guarantees. First-failure trace
overhead, stress runs and statistical confirmation remain unperformed.

The two-lens hardening precedes implementation. Concrete Task 3/5 code uses
fail-first tests, deciding-source mutations and independent task review;
do not recursively reopen design hardening for each implementation detail.
Unknown product causes remain investigations, not guessed repairs. The
seven-day observation and post-merge confirmation are later phase gates,
not results an implementation session can claim in advance.
