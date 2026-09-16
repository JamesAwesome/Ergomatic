# Test reliability — research record

Read on 2026-09-15 against `5fc01cce3db5dfdd64fa0a80b086a7debd13a2d2`.
The starting findings below came from desk investigation, without an app
test suite, stress experiment, CI rerun, or container boot. Later bounded
execution and its remaining gates are recorded separately below.

## Primary repository evidence

- `app/vitest.config.ts:11`: root `maxWorkers`, three projects, integration
  120 s hook/test timeouts, V8 coverage. No configured Vitest retries.
- `app/playwright.config.ts:19`: local three-worker cap,
  CI retry one/local zero, HTML report, trace on first retry.
- `.github/workflows/ci.yml:70`: `app` runs `pnpm test:coverage`; `e2e`
  independently boots compose and runs Chromium; HTML artifact uploads
  always and expires after 14 days.
- `app/scripts/test-run.sh:62`: prints capacity information; the wrapper
  invokes Vitest directly, preserves child
  status, tees both streams, uses a completion-summary heuristic, prints
  capacity information, classifies signal/allocation failures.
- `app/scripts/test-run-advisory.sh:34`: warns about peer registrations and
  explicitly never blocks. Its registry covers runs through this wrapper,
  not every process consuming RAM on the machine.
- `app/scripts/measure-test-memory.sh:20`: filters Node/Vitest argv by app
  path, samples RSS, suppresses measured stdout/stderr. Browser/VM/host
  memory and failure detail need other evidence.
- `app/scripts/e2e.sh`: unconditional compose build/up; keeps stack by
  default. `E2E_KEEP=0` calls down without volume removal.
- `app/server/testing/postgres.ts:55`: starts a Postgres container per call,
  retries once on the specific port-binding timeout, warns about the first
  container's deferred Ryuk cleanup.
- `app/e2e/helpers.ts:138`: RUN_ID is process-scoped; sign-in normally suffixes
  explicit email addresses; screenshots can opt into a stable identity.
- `app/server/routes/data.test.ts:47`: real auth middleware composed with a
  newly constructed fake session store; capture helper exists for selected
  undefined response-body fields. A mock-leak attribution is not proved
  by a 401 alone.
- `docs/TESTING.md`: measurement and mutation requirements; named local
  E2E gates and full CI gate; captures are documentation, not pixel gates.
- `docs/superpowers/specs/2026-09-08-local-test-memory-design.md`, Part A3:
  “The advisory never blocks and never fails a run.” Preserve that ruling.
- ROADMAP: Wave D's unresolved families and FLAKE 5's September 14
  inventory. Prior research was found; this effort must extend it.

## Fresh measurements

`sysctl hw.memsize hw.ncpu` returned 17,179,869,184 bytes and 10 logical
CPUs. `node -v` returned v26.5.0; `pnpm -v` returned 11.17.0.
`memory_pressure -Q` reported 31% system-wide free percentage at the first
sample. A later `sysctl kern.memorystatus_vm_pressure_level` returned 2.
Those snapshots are not a forecast of safe test capacity; the pressure
enum was not established at this first snapshot; the execution preflight
below establishes it from primary source. No claim of spare test memory
rests on the free percentage.

`docker ps --format '{{.Names}}\t{{.Status}}'` showed one three-container
stack belonging to another worktree. It was not changed.

`gh run view 35027627403 --log` and the attempt-specific jobs API showed:

| Field | Observed |
| --- | --- |
| Commit | `5fc01cce3db5dfdd64fa0a80b086a7debd13a2d2` |
| Workflow attempt | 1 |
| App job | `104578385930`, runner `GitHub Actions 1000012294` |
| E2E job | `104578385936`, runner `GitHub Actions 1000012293` |
| Capacity banner | cores=4, availableParallelism=4, default Vitest limit |
| Vitest | 361 files passed; 9,161 tests passed; one skipped; 306.17 s |
| Chromium | 595 passed; two workers; 7.6 minutes |

[Main run](https://github.com/JamesAwesome/Ergomatic/actions/runs/35027627403).
A second inspected run, `35034584927`, also reported 595 Chromium passes
and two workers. These two samples do not establish a flake rate or prove
that any historical defect is resolved. Log filtering was exploratory;
the hunt's inventory must use complete job-scoped logs and retain inputs.

## Primary external sources and existing concepts

- [Playwright retries](https://playwright.dev/docs/test-retries): categorizes
  first-run pass, fail-then-pass, and exhausted retries separately; a
  failure restarts its worker/browser. Therefore a successful retry changes
  execution context and is evidence of intermittence, not a cause.
- [Playwright trace options](https://playwright.dev/docs/api/class-testoptions#test-options-trace):
  `on-first-retry` records the retry; `retain-on-failure` records attempts
  and retains failures even when a retry later passes. Both are present
  in installed Playwright 1.63.0's `types/test.d.ts`.
- [Playwright flaky-test policy](https://playwright.dev/docs/api/class-testconfig#test-config-fail-on-flaky-tests):
  `failOnFlakyTests` fails a run containing a flaky result. Present in the
  installed types. No new detection mechanism is required for this policy.
- [Vitest sequence](https://vitest.dev/config/sequence): seeded shuffling
  and project `groupOrder` already exist; installed Vitest 4.1.11 types
  contain both. They control execution order, not OS timing.
- [Vitest performance](https://vitest.dev/guide/improving-performance):
  environment and isolation settings affect cost and semantics. Changing
  isolation to chase speed requires separate correctness evidence.
- [GitHub CLI rerun](https://cli.github.com/manual/gh_run_rerun):
  `--failed` reruns failed **jobs**, including dependencies. Confirmed by
  installed `gh run rerun --help`. It does not select failed tests inside
  the job. The existing ROADMAP warning conflates these two operations.
- [GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners):
  hosted jobs receive runner instances. This workflow's actual runner IDs
  separately confirm the app/E2E split; overlap in wall time does not mean
  those jobs compete for the same Mac or VM.
- [Node exit codes](https://nodejs.org/api/process.html#exit-codes):
  signal termination produces 128 plus the signal number. This encodes
  termination, not whether the OS, a user, or another supervisor sent it.

## Inferences explicitly withheld

No new root cause is established by this research. The records contain
counterexamples to several tempting explanations: browser localStorage
leaking across fresh contexts, undefined limits meaning unlimited workers,
every multi-failure job proving an infrastructure event, and isolated green
runs proving order dependence. The spec uses each as a question for a
discriminating probe, not a fact to implement against.

The proposed time, repetition and observation budgets are design choices.
Their performance cost and sufficiency for any individual rare failure are
unmeasured. First-failure tracing also has unmeasured overhead in this suite.

## Follow-up: reliability of the detection gate

James agreed to staged reporting/enforcement and asked whether detection
is reliable enough (2026-09-15). Installed Playwright 1.63.0's
`lib/runner/index.js:6289` checks `test.outcome() === "flaky"`, then
`FailureTracker.result()` returns failed when `failOnFlakyTests` is enabled.
Its outcome calculation at line 607 distinguishes expected results,
unexpected results and incomplete/interrupted-only outcomes. This is a
native observed-outcome gate, not an inferred root-cause classifier.

Detection sensitivity still depends on whether the failure occurs. A
Node calculation of `1 - (1 - p) ** 20` returned 0.1820930624 for p=0.01
and 0.6415140776 for p=0.05. Those are hypothetical independent,
constant-rate trials, not measured probabilities for this repository.
They explain why the proposed observation window cannot establish that a
rare defect is absent. No app tests were needed for this source check.

## Execution preflight: macOS pressure

The raw sysctl is now interpreted from primary source, not free-page counts:
[XNU's sysctl handler](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_memorystatus_notify.c)
calls `convert_internal_pressure_level_to_dispatch_level` before returning.
[event_private.h](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/event_private.h)
defines its returned pressure bits as normal=1, warning=2, critical=4.
These are not the similarly named internal enumerations.

During execution preflight `sysctl -n kern.memorystatus_vm_pressure_level`
changed from 1 to 2. The 2026-09-16T00:02:58Z check was warning. Heavy local
calibration was therefore deferred at that point; no test worker, browser,
or compose stack had yet been launched by this hunt. Other tasks' running processes and
containers are not candidates for cleanup.

## Hardening receipts

The mechanism lens traced exact Vitest 4.1.11 and Playwright 1.63.0 vendor
call sites. Four corrections are incorporated in the design and plan:

- Native JSON describes tests, not every later command failure. Vitest
  emits it before coverage threshold checking and handles unhandled errors
  separately. Preserve command exit/signal independently.
- Playwright browser processes are detached on macOS/Linux; one runner
  process group does not prove browser or compose cleanup.
- Repeat indices change Playwright worker hashes, and retries replace
  workers. This repo's module-minted RUN_ID can change within one invocation.
- Execution incidence and job incidence need different numerator units;
  repeated test executions and retries cannot inflate job exposure.

Primary sources:
[Vitest JSON reporter](https://github.com/vitest-dev/vitest/blob/v4.1.11/packages/vitest/src/node/reporters/json.ts),
[Vitest run/finalization](https://github.com/vitest-dev/vitest/blob/v4.1.11/packages/vitest/src/node/core.ts),
[browser launcher](https://github.com/microsoft/playwright/blob/v1.63.0/packages/utils/processLauncher.ts),
[repeat index assignment](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright/src/common/suiteUtils.ts),
[worker dispatcher](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright/src/runner/dispatcher.ts).

## Source-only hypothesis elimination

The draft's equal-timeout lead was wrong, not a latent defect to fix.
At baseline `5fc01cce`, `rg -n '^  }, [0-9]+\);|BURST_HANDOFF_HOLD_MS'
app/src/workout/WorkoutDetail.postReleaseCommit.test.tsx` shows four explicit
20,000 ms outer test budgets. Inner waits are `BURST_HANDOFF_HOLD_MS + 3000`;
`useMonitorSession.ts` defines that hold as 2,000 ms. The file's real-clock
comment explains why replacing it with a synthetic timer changes the seam.
No code change or repeat run is justified by this disproved lead.

The retained-stack claim likewise needs current fixture identity: current
`retest.spec.ts` passes RUN_ID-suffixed emails through `signInViaBackdoor`.
A retained database is not proof that two runs used the same account. No
fresh/retained stack comparison is currently authorized by sufficient
resource capacity; this remains a proposed identity-controlled experiment.

## Native evidence-path validation

Once pressure returned to normal, the controller ran only bounded native
checks through the new capture path, sequentially, with one worker:

- Vitest: `scripts/testEnv.test.ts`, unit project, 17 passed, exit 0;
  native JSON, human output, terminal receipt and checker agreed.
- Browser-free Playwright fixture: ordinary pass plus deliberate first-fail/
  retry-pass. Report-only command exit 0 retained both initial failures in
  the first multi-project probe (4 initial executions, 2 recoveries).
- Same fixture selected to one project with `--fail-on-flaky-tests`:
  exit 1, 2 initial executions, 1 recovery; evidence remained complete.
- `--repeat-each=2`, one project: exit 0, 4 initial executions, 2 recoveries.
  Native JSON preserves distinct spec IDs per repeated execution but omits
  `repeatEachIndex`. This exposed and corrected the summary's invented field
  assumption; no numeric index is inferred from array position.

Raw invocation IDs under ignored `app/.test-evidence/validation/`, in that
order: `47c7116b-1d6e-44ed-a2dc-6ff188099457`,
`ad225924-daf8-4758-b70f-4098453356bf`,
`7123fb54-831b-4454-89eb-0eb82b7a4736`,
`0b4b493d-66d6-4d93-a2d4-aed4b72d96ba`.
The initial local descriptive ID was refused before launch because the CLI
requires UUIDs. Playwright's defineConfig merged projects, so the first probe
selected four fixture cases; subsequent probes explicitly selected the
fixture project after a native `--list` verified two tests. Neither probe
requested a browser/page fixture or booted compose.

The 80 ms Vitest test phase was too short for a useful 1 s memory sample:
three snapshots saw at most two wrapper processes and 3,472 KiB, missing
the worker peak. All three pressure samples were normal. These observations
do NOT calibrate Vitest peak memory or prove an observed worker count.
At that checkpoint browser/compose cleanup, trace overhead and full-suite
capacity were unmeasured; the later bounded browser rehearsal is below.
The synthetic detached-child rehearsal only proves that an
observed survivor is reported and blocks the evidence check.

`pnpm typecheck` passed (E2E membership 26/26). Pressure was warning at its
completion; the subsequent guarded lint launch deferred with exit 75 before
starting. No resource termination occurred and no completed result is
relabelled as an aborted test.

## Execution checkpoint — not merge-ready

The two-lens hardening is complete. The historical inventory now retains
51 named events from 1,036 completed job logs, including unknown final
failures rather than just known retry recoveries. Its independent review
found and then cleared three corrections: exhaustive final-title extraction,
atomic verified download caches, and overlapping recovered/red job counts.
See the [inventory and dispositions](2026-09-15-flake-hunt/inventory.md).
The historical logs predate cache completion receipts; no retroactive receipt
or silently trusted arbitrary cache is represented as verified.

The capture implementation's independent review also found and cleared
three defects: a diagnostic write failure abandoning child wait, a long
stderr chunk hiding an allocation signature, and inherited pipes blocking
finalization indefinitely. Eleven lightweight child-process fixtures passed
after those fixes (11.87 s). The inventory's two offline fixtures passed
after first reproducing its original extraction and cache defects. These
were task-level reviews, not a final branch/CI approval. Subsequent final
review and native interruption evidence found two more classification seams:
known termination must survive missing report artifacts, and an interrupted
attempt is not an assertion failure. Both have focused fail-first tests.

Lint started in a second normal-pressure window. While it ran, host pressure
rose to warning (2). The controller interrupted only its own lint TTY;
the command returned exit 1/ELIFECYCLE and no matching ESLint process
remained. This is an interrupted gate, not a lint pass, a flaky test, or
evidence of an OOM. No other task's process or stack was stopped. Heavy local
validation was paused; the same full lint load was not retried locally.

James subsequently asked to finish the hunt. The controller resumed bounded
checks under normal pressure and committed the real capture/inventory changes
(`59cbbf0a`), strengthened preservation/interrupt tests (`996ed7e5`), and
termination/classification fixes (`48c7467e`, `db15f3c3`). Every actual commit
ran the real pre-commit hook, including typecheck/E2E membership 26/26;
applicable staged ESLint/Prettier and explicit scoped checks passed. Full
lint/format/coverage/E2E are delegated to required PR CI, not claimed locally.

Fresh restored verification at `db15f3c3`: **15/15 Node child-process tests**
(10.41 s) and **2/2 offline inventory tests** (0.035 s). Twenty-two unique
deciding source mutations were killed after their real fixes were committed.
The original reuse mutant initially survived; byte-preservation assertions
were strengthened and committed before it was killed. Ordinary descendant
signal-forwarding mutations fail bounded deadlines. Missing-artifact
termination and both interrupted-attempt classifications also kill their
original deciding mutations. Every source mutation was restored, with an
empty source diff and the full small-fixture suite passing afterward.

Additional actual native invocations, all sequential with one worker:

| Receipt UUID | Native outcome | Evidence conclusion |
| --- | --- | --- |
| `21c2da5c-2148-4ca0-af3c-2323e916319b` | One assertion passed; function coverage 50% below 100%; command exit 1 | Complete; coverage failure is not erased by passing assertions |
| `f50b1111-81bf-43d1-a179-f73474152846` | One assertion passed; one unhandled rejection; command exit 1 | Complete; no invented failing-test identity |
| `8dd5cc4b-e285-4419-8575-6f307bfbd00c` | Four named client files, 20 assertions passed, command exit 0 | Six normal-pressure samples; one worker observed; maximum observed tree 595,184 KiB (~581 MiB) |
| `89ab9c0b-6f87-44ad-bc05-80a51abf22f4` | Real Chromium page then deliberate owned SIGINT; command exit 130; native one interrupted, zero unexpected | Complete; initial exposure 1, failure 0, initial interruption 1, termination event 1 |

The four client files were `src/App.test.tsx`,
`src/App.authDestination.test.tsx`, `src/App.nativeAttach.test.tsx` and
`src/news/Releases.test.tsx`; native listing confirmed the selection first.
The browser rehearsal used only a local in-memory page, not the application
compose stack. Its 15 samples were normal; maximum observed tree was
636,464 KiB (~622 MiB). The runner, worker, detached Chromium group and
observed helper PIDs were all absent in the subsequent PID-specific check.
This proves that observed graceful-interruption path only. The conservative
receipt still says cleanup unverified: zero observed survivors cannot prove
absence of descendants missed between one-second samples. Hard-kill and
compose cleanup, trace overhead and full-suite capacity were unproved at
that checkpoint. Later owned compose rehearsal and cleanup are recorded in
[the residual repair receipt](2026-09-15-flake-hunt/residual-repairs.md).
No other task's processes/stack were touched.

Warning pressure returned during desk work, so no new heavy probes launched.
This is evidence that host capacity varies, not proof that tests caused all
memory pressure. The samples above establish incremental process footprint;
they do not attribute other apps, VM memory or accumulated swap to tests.

The [residual dispositions](2026-09-15-flake-hunt/residual-dispositions.md)
map 20 of the 23 automatically unclassified events to prior repairs or
deterministic fixture drift. Retained retry traces establish PAIRING's fixed
1.2 s lifetime expiring during a 2.54 s sweep, and localize the
FILTER timeout to a 23.439 s axe scan without establishing the cause of that
cost. NFC's historical physical paint is not established by the old trace.
The subsequent [repair receipt](2026-09-15-flake-hunt/residual-repairs.md)
records all three implemented test/harness repairs, ten additional deciding
mutations, 158 restored client tests and 11 restored browser checks, plus
independent Standards/Spec PASS. No speculative product repair was made.

Final independent review, including scoped verification at `db15f3c3`, is
**Standards PASS / Spec PASS for the inventory/evidence increment**. Both
concrete P2 findings are resolved; this is not full-hunt or merge approval.
Previous-base CI passed at `a11bf3e7` (run `35044855699`); it is not
validation of the later repairs. Updated exact-head PR CI and James's
merge approval remain required. The 20-job/
seven-day observation, strict-flake rollout and post-merge confirmation are
future gates; no ROADMAP row is closed. No local stress run substitutes for
those gates, and a clean job alone does not establish absence of retries.
