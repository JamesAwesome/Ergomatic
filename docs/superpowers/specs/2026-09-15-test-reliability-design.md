# Test reliability — a bounded hunt across local runs and CI

**Status:** authorized for execution, 2026-09-15; ordinary test defaults
remain unchanged until measured and reviewed.
**Baseline:** `5fc01cce3db5dfdd64fa0a80b086a7debd13a2d2`, 2026-09-15.
**Scope:** the existing Wave D flake work, across unit, client, integration,
E2E, and the local release-capture path. This draft opens no new phase.
**Companion:** [hunt plan](../plans/2026-09-15-test-reliability-hunt.md).
**Evidence:** [research record](../research/2026-09-15-test-reliability.md).

## What and why

Make test failures useful again: capture the first failure, distinguish a
product defect from a test defect or an interrupted run, reproduce its
cause, and verify the repair under the conditions that exposed it. The
hunt must fit a 16 GB Mac shared with other work and must produce evidence
from CI, where several recent failures occurred. Repeated green runs alone
do not explain a failure or establish that its cause is gone.

This is an investigation and prevention specification, not a promise that
every intermittent failure has the same cause. The plan deliberately puts
diagnosis before deciding which product or fixture code to change.

## 1. Starting position

PRIMARY observations from this session:

- Main's CI run `35027627403`, attempt 1, passed 9,161 Vitest tests
  across 361 files, with one skipped test; its test phase took 306.17 s.
  Chromium passed 595 tests using two workers in 7.6 minutes.
- That run reported four CPUs and `availableParallelism=4`. The capacity
  banner does not report Vitest's resolved worker count. An undefined
  configuration limit is not evidence of unlimited workers.
- Unit, client and integration run together in the `app` job's
  `pnpm test:coverage`. The `e2e` job uses a different hosted runner.
  Both the workflow and this run's runner identities establish that split.
- Local limits are four Vitest workers and three Playwright workers, per
  invocation. The existing peer advisory warns; it does not coordinate
  all work on the machine. That is James's explicit September 8 ruling.
- Playwright retries once in CI, does not retry locally, and records
  `on-first-retry`. CI uploads the HTML report even on success, retaining
  it for 14 days. A passing retry need not carry a trace of the first failure.
- The existing memory sampler matches Node processes by checkout path.
  Its result does not include all browser processes, the Docker VM, or
  unrelated activity that can cause host pressure. It suppresses the
  measured command's stdout and stderr and is not a failure-log collector.

The ROADMAP contains valuable investigations but also superseded claims
inside still-open rows. Its September 14 inventory is a historical
baseline, not the present failure rate. Refresh from raw logs before
ranking today's suspects. In particular, do not infer order dependence
from “failed in a suite, passed alone,” or shared infrastructure failure
from several tests failing in one job.

## 2. Approaches considered

| Approach | Benefit | Limitation | Decision |
| --- | --- | --- | --- |
| Evidence, then bounded experiments, then fixes by cause | Preserves causal evidence and limits local load | Needs useful reporting before rare failures can be explained | Recommended |
| Repeated full-suite stress | Exercises many combinations | Resource cost is unmeasured; rare failures may still never recur, and saturation changes the experiment | A later, budgeted CI experiment when a hypothesis needs it |
| Serialize everything and extend timeouts | Provides a useful low-contention control | Changes the trigger; a pass does not distinguish an app race from resource contention | Diagnostic comparison, not a blanket repair |

The existing runners already provide retries, structured reports,
repeat counts, worker limits and, for Vitest, seeded shuffling and project
group ordering. Use those features. There is no need for a new scheduler,
flake database, browser framework, or custom reporter to start this hunt.

## 3. Evidence contract

Each investigation has one controller and one evidence directory. Preserve
these facts before rerunning:

Mint a fresh invocation directory and ID before launch. An omitted evidence
root uses the documented ignored default; an explicitly empty root is an
error. Resolve paths once; refuse reused invocation directories and symlink
escapes. Native reports live only inside that fresh directory; the external
receipt binds them to invocation ID, SHA and exact argv without a custom
reporter. Producer, checker, summary and uploader use the same resolved root.
Unmatched identity, missing report or a nonterminal receipt is incomplete.
Playwright 1.63 JSON preserves distinct opaque spec IDs for repeated
executions but omits the numeric repeat index. Preserve those IDs; do not
print or invent an index. An experiment requiring numeric index, RUN_ID or
actual backend account adds an explicit attachment/receipt for those facts.
The observer writes the terminal receipt atomically only after waiting for
its child; the child or its report never supplies the command's wait status.

- Commit and worktree, tracked diff, Node and package versions, OS/runner,
  exact argument array, selected project/file/title, selected test count,
  retry policy, worker configuration and observed worker count when available.
- CI run, workflow attempt and job IDs; test ID/title/file/project;
  individual test attempts and outcomes; repeat index; shuffle seed and
  actual ordering when relevant. A seed does not reproduce OS scheduling.
- Raw stdout/stderr and exit status, suite/hook errors, duration, failure
  details and artifact references. Missing output is recorded as missing,
  never converted into a clean result.
- Resource samples with timestamps and attribution: host pressure and
  swap deltas; Node process-tree RSS; browser process-tree RSS for E2E;
  container stats plus Docker VM observations on macOS. Keep these as
  distinct measurements: summing them can double-count shared memory.
- Fixture identity, database/stack identity and warm/fresh status,
  cleanup outcome, coverage on/off, network or timer perturbations.

Use logs to count historical events and reports/traces to explain them.
Extract one downloaded job log at a time; cap concurrent downloads at two.
Structured per-test outcomes supplement the logs for future runs. Keep
the ordinary Vitest reporter beside JSON so the current wrapper still
sees its completion summary. Artifact upload failure or missing report
makes observability incomplete even if tests passed.

Record three independent outcomes: test-attempt outcomes, final command
exit/signal, and evidence-collection status. A parsed report or its `success`
field never overrides command status. Coverage, global unhandled errors,
teardown and reporter failures can fail a command with passing assertions;
retain their diagnostics without inventing a failing test identity.
Preserve the original command outcome in its receipt. An independent
evidence check may fail CI on missing required evidence; report-first
applies to recovered flakes, not falsely declaring absent evidence clean.
CI preserves the original failed test-step status. Summary and upload steps
run under `always()` even after command or evidence failure; a final evidence
check runs after publication and fails on missing/stale required evidence.
Never let an early evidence check prevent publication of the failure.

Deduplicate by invocation/run + workflow attempt + job + canonical test +
project + repeat-specific execution identity + retry index. Report
first-attempt failures, retry recoveries, exhausted retries, suite errors,
resource aborts and missing evidence separately. A retried test passing is
still a first-attempt failure. A workflow rerun is another observation of
the same commit, not a new independent branch event.

Name the unit beside every rate. Per-test job incidence counts jobs with
at least one unexpected initial failure over jobs evidencing execution of
that test. Execution incidence counts unexpected initial failures over
initial executions, including repeats but excluding retries. For two repeats
with one failure then recovery, these are respectively 1/1 and 1/2, not 2/1.
Historical unknown test exposure stays unknown: publish event counts without
a test-specific rate. Aborted jobs count toward resource-event incidence;
they contribute test exposure only where execution is evidenced. Publish
exclusions and fetch failures. No green percentage replaces these quantities.

## 4. Classification precedes repair

| Observation | Initial disposition | Evidence needed to attribute a cause |
| --- | --- | --- |
| Assertion failure, timeout or unexpected HTTP status | Unattributed test result | First failure and a discriminating experiment |
| Same commit fails then passes | Confirmed intermittent outcome | Still does not establish order, load or mock leakage |
| Worker or parent termination; V8 fatal allocation message | Incomplete/resource event | Exit/signal, stderr, runner/OS diagnostics |
| Container startup failure or retry | Infrastructure event | Container identity, startup stage, retry and cleanup |
| Reproducible stale fixture or wrong expected value | Deterministic test defect | Same precondition and independent correct expectation |
| Reachable app race, lost write, incorrect auth or value | Product defect exposed by a test | Supported user path and independent observable |

SIGKILL proves termination, not its cause. The existing wrapper calls exit
137 a memory kill; preserve that raw classification and its stop behavior,
but require corroboration before the investigation asserts OS OOM. Any
change to the wrapper or the instruction corpus needs its own reviewed
proof. Likewise, a synchronous test timeout does not alone prove scheduler
starvation: CPU cost, instrumentation and scheduling need measurement.

Do not stabilize a test by waiting past an actual product race. The
ROADMAP's News read-state race is explicitly such a case. Do not add
blanket sleeps, retry loops, skips, weaker assertions, reduced isolation,
or higher global timeouts as the outcome of this phase.

## 5. Memory and execution budget

These are **proposed hunt limits**, not measured optimal worker settings:

1. One heavy local experiment at a time, including its build, containers
   and browser. Check other worktrees/processes before launch. If another
   heavy run is active, keep doing log/source analysis or defer the probe.
   This is the hunt controller's discipline; ordinary commands retain
   their advisory-only behavior. No machine-wide lock is introduced.
2. Begin a named-file probe at one worker, without coverage. Increase to
   two only for a stated concurrency comparison after recording a clean
   baseline. Retain the failing CI shape when testing a CI-only hypothesis;
   low-worker local passes are not a substitute.
3. Limit a local hypothesis to 30 minutes of test execution, with a
   10-minute cap per invocation and an initial batch of at most five
   repetitions. These are ceilings, not mandatory work. Stop on the first
   unexplained failure to preserve evidence; expand only for a specified
   discriminating experiment. Do not run full local suites in repeat loops.
4. Record pressure before launch and sample during a probe. If the OS
   reports warning/critical pressure, stop launching work. If pressure
   rises during a probe, interrupt only the owned command process group,
   preserve the partial output, and label the result aborted. Verify all
   descendants and owned containers before a later probe. If the pressure
   signal cannot be interpreted, local heavy probes remain deferred.
   The observer stays outside that group. Playwright browsers are detached
   groups, and compose services outlive the CLI: record ownership while alive
   and inspect those separately. A missing leader never proves cleanup.
   Rehearse ordinary and detached descendants beside an unrelated sentinel;
   uncertain cleanup defers another probe, never permits broad process kills.
5. A signal death or fatal allocation failure stops local test execution
   for this investigation session. Do not retry the suite. Desk analysis
   may continue; another execution window needs recovered capacity and an
   identified cause or a changed resource budget.
6. Do not manufacture contention by exhausting laptop RAM. Compare
   isolated/mixed projects and bounded worker counts on CI. Record time
   and memory cost before changing CI defaults or imposing container limits.
7. Use one worktree-owned compose stack, verify the served build, and
   reuse it within a probe batch. Fresh versus retained database state is
   a deliberate variable. Never reset another task's stack. Teardown of a
   disposable hunt stack explicitly includes its volumes when authorized
   by ownership; `E2E_KEEP=0` alone does not reclaim them.

Free pages alone are not available memory; a V8 heap limit is not a
process-tree or host limit. Do not adopt a universal megabyte threshold
from the old sampler. First measure current costs and the host's pressure
signals. The initial desk investigation is useful even when the Mac has
no capacity for a probe.

CI work is also bounded: initially at most three comparable executions
per configuration for a capacity comparison, with one variable changed.
Use ordinary post-fix CI traffic for the longer observation window. Extra
stress runs require a stated hypothesis, duration and stop rule.

## 6. Ordered hunt

1. **Reconcile the inventory.** Refresh the last 14 days of all E2E job
   attempts, including green ones, and all app-job attempts. Reuse older
   historical evidence when available; do not redownload the entire
   repository history by default. Identify tests that changed or were
   renamed. Preserve unknowns and correlated events without causal labels.
2. **Make the next failure informative.** Add structured results and
   resource evidence to existing entry points. In a bounded hunt profile,
   use Playwright `retain-on-failure` to retain the original failed
   attempt, with screenshots/page context and relevant request failures.
   Measure tracing overhead before making that profile the full CI default.
   The adopted CI profile must still capture attempt-zero evidence for
   every selected suspect; otherwise a rare CI-only failure stays blind.
   Capture failed assertions and suite errors even when no test completes.
3. **Reproduce cheaply.** Start with the failure's named test and exact
   preconditions; then its file/neighbors; then deterministic ordering,
   delayed I/O or timer boundaries; then a bounded concurrency comparison.
   A single-test green leads to a more discriminating probe, not closure.
4. **Repair the cause and its siblings.** Once a mechanism is established,
   census its shared helper and callers. Retain meaningful assertions and
   supported user paths. Product bugs follow their normal repo gates;
   number, persisted shape and auth changes retain full triad treatment.
5. **Verify where it failed.** Demonstrate the deciding-source mutation
   fails, restored code passes, and the original invocation class runs.
   Inspect CI results and test attempts at the current head. Record the
   result of the post-merge main run separately.

Candidate families, pending refreshed ranking:

| Family | Current evidence | Next discriminating step |
| --- | --- | --- |
| Auth/HTTP unit and integration anomalies | ROADMAP reports 401 or missing response fields; cause unresolved | Capture status/body and auth decision; read fixture lifetimes; compare known failing population with isolated file |
| Container startup/resource overlap | Per-file Postgres startup, one specific retry in `startPostgres` | Attribute startup and retry counts to a job; compare mixed and separated project execution |
| Layout/connected E2E failures | `stableBoundingBox` now records its trajectory; landscape suspect in historical census | Read original failed page/trajectory before changing settling logic |
| Retained-stack and quota cases | Some historical diagnoses were refuted; backend survives browser contexts | Verify actual identity and cleanup across repeated runs; browser storage isolation does not establish backend isolation |
| Wall-clock tests | Burst-handoff tests use a real 2 s timer, 5 s inner wait and explicit 20 s outer budget; equal-timeout suspicion was refuted by source | Preserve the production clock seam; investigate only if actual failure evidence points here |
| Already repaired families | Read-after-write, release-notes cost and Apple navigation have recorded fixes | Confirm post-fix exposures; reopen only from new contradictory evidence |
| App races surfaced under delay | News read state and post-save offer are existing product concerns | Hold the actual dependency; assert the rower's supported outcome without adding a compensating test wait |

## 7. Prevent recurrence without hiding it

Agreed rollout (James, 2026-09-15): first publish first-attempt failures and artifact links
in each CI summary while preserving current merge behavior. A bounded
hunt run uses retries zero for reproduction, or retries one plus
`failOnFlakyTests` when recovery itself is evidence. Both modes must retain
the initial outcome. After cleanup and the adopted observation window,
enable strict flake failure on the normal E2E gate in a separately visible
policy change. The observation window alone does not trigger enforcement:
first prove the detector and evidence path against the fixtures below.

**Detection boundary.** Playwright's native outcome reliably identifies an
observed unexpected failure followed by a successful retry. The installed
runner's `FailureTracker.result()` makes that outcome fail the job when
`failOnFlakyTests` is enabled. It does not identify the cause or discover a
latent failure that never occurs. Vitest currently has no retries, so its
failures already block; identify intermittence from equivalent recorded
executions without adding automatic suite retries. Resource terminations
remain failed/incomplete runs and cannot be retried or waived as flakes.

Prefer built-in JSON/HTML reporting. Add only the narrow glue needed to
join provenance and summarize results. Prove it catches a synthetic
fail-then-pass, an ordinary regression, a suite/hook error, a resource
termination and a missing report. No production data is needed in the
fixtures. A reporting check must itself fail when its report is absent.
Include passing assertions followed by coverage failure or an unhandled
error, a successful child with an unwritable report, and two repeated test
executions with one retry recovery. Hard termination can prevent report or
trace finalization; partial raw logs and a nonterminal receipt then remain
explicitly incomplete evidence.

Improve shared fixture/setup patterns only after a demonstrated defect.
Use deterministic signals instead of sleeps where the product owns such a
signal. A static scan for suspicious sleeps or global mocks produces
review candidates, not an automatic defect count. Changes to global
cleanup must prove they do not erase the supported behavior under test.

## 8. Exit and residuals

The hunt infrastructure is ready when every eligible run can be accounted
for, first-attempt evidence survives retries, missing evidence is visible,
and abort/cleanup behavior is demonstrated without exhausting the machine.

A defect is **fixed with a reproduced cause** only after a causal
regression test, a biting mutation and restored pass, and verification in
its original invocation class. “Instrumented, not reproduced,” “mitigated,”
and “no recurrence observed” are distinct outcomes, never synonyms for fixed.

Proposed observation window: at least 20 eligible post-fix CI jobs spanning
at least seven calendar days, counting retry-saved failures and resource
aborts. This is an operational checkpoint, not statistical proof of zero
flake probability. Publish exact exposures and environment changes; do not
inflate independence by counting retries as fresh experiments. A recurrence
reopens the mechanism. Routine traffic supplies the sample. For scale,
20 independent runs catch a failure with a constant 1% per-run probability
only about 18% of the time (`1 - 0.99^20`); real CI runs need not be
independent. Thus this checkpoint cannot certify a fix or a flake-free
suite. Causal proof and ongoing detection remain the deciding evidence.

Unknown rare failures leave with an owner, evidence needed, next probe and
review date. James rules on any proposed ROADMAP additions, closures or
re-dates; no historical row is silently struck. Group test/harness changes
into coherent PRs; product defects split when their risk model requires it.

## 9. Decisions for the brainstorm

- Proposed scope is both local and CI; local release captures are included
  when their fixtures or resource use overlap, not added to every CI gate.
- Agreed rollout is report first, then enforce after cleanup, detector
  validation and the observation checkpoint. A run of greens alone is
  insufficient to declare the detector or the repairs proven.
- The time/worker ceilings above bound this hunt. Calibration may propose
  different ordinary defaults, with measured cost and preserved coverage.

James authorized hardening and execution on 2026-09-15. The hunt ceilings
apply to this investigation; changing ordinary worker defaults, enabling
strict flake gating and merging remain separate, evidence-backed decisions.
