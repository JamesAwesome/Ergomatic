# Measured local workloads implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Reduce measured local overhead without changing test meaning or
silently choosing a new worker default.

**Architecture:** Reuse the shared foreground owner and streamed receipts.
Measure fixed native populations, retain runner isolation, and route Stryker
through one bounded invocation. Its installed inner pool is already one worker;
guard that actual resolved configuration instead of assuming it is unbounded.

**Tech stack:** Node26.5, Vitest4.1.11, Stryker10.0.0, TypeScript6.0.3;
no new dependencies.

**Spec:** [Approved resource design](../specs/2026-09-15-local-resource-budget-design.md),
especially runner tuning and measurement acceptance.
**Parent:** cheaper-hooks `5daf579e`, PR464. Work uses the existing linked
worktree on `codex/memory-measured-tuning`.

Status: Tasks1–2 are implemented in PR465, with final review and exact-head CI
as its merge gates. James's continuation authorized the proposed
local-only, version-pinned Stryker patch. Its first-failure and initialization
probes now pass; project bounds and ignored-input freshness also have targeted
fixes. Commit85eac349's earlier postcommit gates pass, but the second and final
hardening lens falsified two further claims: an actual inner-thread exit was
converted into a passing result with later bodies, and native ignored paths
silently reduced a mixed exact request. Their repairs now pass the scoped
82-test gate95086cc3, including the actual native seams. Five postcommit
mutations bit at57026156; restored native/outcome/snapshot39/39 passed4d916d47.
The task-review compatibility gap now has native survivor/timeout fixtures,
three biting source faults and restored2/2 in2f9bb8d2. Production is unchanged
since57026156. Task3 investigation remains partial.
The whole spec remains incomplete. James clarified on2026-09-16 that ready
increments should merge as work proceeds, not wait for an arbitrary two-PR
total. Admission #463 and cheaper-hooks #464 have landed after their exact-head
full CI passed. This tuning increment stays separate; ff430f9c incorporates
main without changing85eac349's tree.

## Global constraints

- Current four-Vitest/three-browser defaults remain until James approves a
  measured replacement. Stryker's new local interface requires an explicit
  outer concurrency; there is no new silent default.
- Normal pressure, one owner, no automatic resource retry, no census-directed
  signals, no SIGKILL initiated by our owner, no foreign cleanup.
- Keep ordinary fork/file isolation and jsdom. The installed Stryker plugin
  already uses one isolated thread per runner; do not misdescribe that as a
  pool switch introduced by this work.
- Keep assertion, fixture, mutation, typed-diagnostic and CI coverage contracts.
  Measurement does not authorize shared mutable fixture caches or blanket
  teardown. No screenshots for this tooling/text work.
- Browser measurements depend on demonstrated detached-browser ownership;
  finish that adapter before the browser part of this investigation. This
  dependency does not remove browser comparison from this increment.
- All production work stays in this linked worktree. The controller runs
  heavy gates serially; independent reviewers consume receipts.

## Files and interfaces

| File | Responsibility |
| --- | --- |
| `app/scripts/local-work/mutation.mjs` | Closed local request grammar; exact source/test paths and supported config |
| `app/scripts/local-work/mutation-run.mjs` | Internal Stryker invocation, original-intent check, source and native artifacts |
| `app/scripts/local-work/mutation-budget.ts` | Reporter checks resolved inner worker/isolation contract before test execution |
| Adjacent `mutation.test.mjs` and `native/mutation.test.mjs` | Pure refusal and real installed-runner/public-boundary witnesses |
| `workloads.mjs`, `run.mjs`, `local-work.mjs`, `app/package.json` | One admitted mutation phase and private artifact directory |
| `vitest.stryker.config.ts`, `mutation.yml` | Inner bound and unchanged explicit hosted mutation scope |
| Canonical instructions, README, TESTING | Public scope/concurrency syntax and revised exclusions |
| `docs/testing/2026-09-16-resource-tuning.md` | Measurements, limits, decisions and remaining acceptance |

`parseMutation(args)` returns `{all, files, testFiles, concurrency}`.
Local syntax is `pnpm mutate --concurrency 1 --mutate domain/recency.ts`;
repeat `--mutate` for additional exact files, optionally repeat
`--test-file` to name an explicitly narrower witness population.
`--all` deliberately selects the configured full mutation scope and cannot
mix with `--mutate`. No literal `--`, globs, bare scope, percentages,
implicit CPU count, in-place mutation or arbitrary passthrough controls.
The explicit integer range1–16 matches the existing local worker override
policy, not a memory guarantee. Higher values still use admission/pressure stop.

`mutationFiles(app, request)` resolves regular canonical paths within the
configured domain/server-store/server-route scope, retaining its exclusions
for tests, fixtures and store contracts. Named witnesses must belong to the
unit project's server/domain scope and cannot include integration.
Missing, escaped, unmatched or unsupported input refuses before Stryker bodies.
No CSV split: each repeated argument retains its own filename.
The local-only `ergomaticExactInputs` option additionally compares the native
ProjectReader's real source/witness populations with these exact requests,
before sandbox creation. Native ignores cannot silently shrink the population;
a source that legitimately yields no mutants remains allowed.

The owner writes original public args and sets a private artifact directory
only for the fixed mutation phase. Inherited artifact destinations are erased.
The child reparses original receipt args and compares them to its private
payload before importing Stryker. A wrapper dropping a selector or concurrency
must fail, not mutate a broader set.

The child snapshots source/index/config/lock inputs before preparation and
again after completion. Stryker does not use Git's ignore population: the
mutation snapshot additionally streams all regular app files, including ignored
sources, witnesses, configs and imported fixtures. Only unconditional
`.git`/`node_modules` exclusions are omitted; other vendor exclusions remain
conservatively included. Aliases/special entries refuse. This is copied-input
freshness, not a hash of installed dependency bytes or an atomic filesystem
snapshot. It freezes supported JSON config for the invocation;
the fixed installed Vitest runner/config, no added checkers/build command and
no in-place mutation are prerequisites. Existing human/HTML reports remain,
native JSON and the resolved scope live in the unique private receipt. No
counts are inferred from human output, and native assertions cannot override
command failure. Stryker's existing survivor/threshold policy is unchanged.

Installed Stryker forwards explicit testFiles to Vitest's substring-filter
API. The real `witness.test.ts.extra.test.ts` producer failed the initial
public fixture, so the dedicated config reads the same private frozen options
and uses their exact witnesses as its include list. The onInit guard compares
the resolved project include membership before bodies. Mutant-specific test
name narrowing remains native, within that file population. Hosted routing
erases inherited artifact destinations and keeps its original include scope.

## State lifetime

| State | Authority/mint | Clear/failure |
| --- | --- | --- |
| Public request | Closed argv parser | No inherited default or next-run cache |
| Source/config snapshot | Git and regular files before mutation preparation | Rechecked at end; stale result fails |
| Artifact directory | Existing owner invocation UUID | Retained after success/failure; never reused |
| Stryker worker pool | Explicit outer concurrency, installed inner configuration | Native disposal, then owner's process/group census; uncertain cleanup blocks |
| Inner native failure | Opt-in wrapper of Vitest's ThreadsPoolWorker, one latch per runner lifetime | Never reset for another mutant; prevents later construction and sends structured failure over owned IPC |
| Mutation sandbox | Stryker beneath invocation-owned artifact root | Native success cleanup; failure evidence retained, no source in-place writes |
| Reporter guard | Real Vitest onInit in every inner context | Checks before specifications/test bodies, records configured bound |
| Exact witness includes | Same private frozen Stryker options, resolved config compared before bodies | Invocation-specific; no caller-inherited destination in hosted or ordinary phases |
| Measurement pairs | Same tree/scope/versions and declared warm state | Append results; interrupted/refused pairs are inconclusive |

## Primary-source findings

Installed `@stryker-mutator/vitest-runner@10.0.0`
`vitest-test-runner.js#getVitestPoolConfig` returns threads/maxWorkers1
for Vitest≥4.1.0, passed directly to createVitest by init. Guarded receipt
`f40e0a6f-0d96-4187-a161-da580ee1871c` observed the resolved config
maxWorkers1, maxConcurrency1, isolate true, and nine killed recency mutants.
This corrects an untested inference that a separate config meant an uncapped
inner pool. Outer ConcurrencyTokenProvider remains CPU-derived when omitted:
the host reports availableParallelism10; no unbounded nine-process run was
performed. See [Stryker configuration](https://stryker-mutator.io/docs/stryker-js/configuration/)
and [Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/).

Installed Vitest start calls awaited reporter onInit before relevant-spec
discovery and before test-run scheduling. The native fixture must reach this
call site with an excessive resolved maxWorkers and independently prove no
test body executed; merely calling the guard by hand is insufficient.
Check each project's effective maxWorkers and maxConcurrency too: one inline
project can override the root while preserving the project-count/pool checks.

Installed Stryker always decorates runners with RetryRejectedDecorator, whose
catch calls recover before repeating work. The harmless one-time synthetic OOM
fixture executed six replacement bodies and passed publicly. No supported
disable-retry option was found. A log parser or test-only injector override
cannot satisfy the contract. Do not run ordinary local mutation or claim this
adapter ready while the first-failure gate remains red. A maintained dependency
patch is now installed through pnpm's exact-version patch registration.
The fixed local invocation requires policy version2 and opts in explicitly;
omitted/false policy retains upstream hosted behavior. The native proxy exports
the first allocation/process-exit cause, including initialization, and the
shared invocation latch prevents recovery or another scheduled test body after
a rejected dry/mutant run. The receipt retains the native exit tuple and bounded
diagnostic tails separately from the wrapper's nonzero exit and cleanup result.
The opt-in vitest-runner patch wraps the public native thread worker, latches
its first error/exit before the inner queue can create a replacement, and
notifies the owning proxy immediately. This closes both fulfilled-error and
startup-handshake paths; final-result checking alone cannot. The installed
Vitest version is checked at4.1.11 before local use. Expected teardown is marked
before stop; no log parser or private runtime injector is used. Hosted
omitted/false policy keeps the upstream pool. See the tuning record for the
public API and installed-source evidence.
Missing patch support refuses before native execution. Upgrades must re-prove
the native contract; see the patch's maintenance record in the tuning document.

## Task 1: Bounded mutation request and real inner-pool gate

- [x] Add failure-first request/config tests: missing/empty/duplicate bounds,
  scope omitted, all mixed with files, unknown flags, literal separator, globs,
  traversal/symlink escape, integration witness, unsupported config and
  Unicode/space/comma literal paths. Pin expected accepted arrays independently.
- [x] Implement the closed parser and canonical file validation at the real
  paths above; no raw string forwarding to Stryker's CSV CLI.
- [x] Add a real installed-Vitest fixture that imports the actual Stryker
  config, changes resolved maxWorkers before start, and asserts nonzero plus
  absent body sentinel. With maxWorkers1 it must execute the sentinel.
- [x] Add the typed reporter and explicit inner cap to the existing Stryker
  config. Preserve unit membership and installed threads/isolation semantics.
- [x] Run pure and named native fixtures under the existing owner; reuse the
  commit hook for all compiler projects. Paste-test before hardening dispatch.

## Task 2: Public mutation ownership and artifact lifetime

- [x] Add real fixture Stryker run with one tiny source and independent tests,
  supplied through the public pnpm/local-work boundary. Assert native mutant
  paths/status, private evidence, effective outer/inner bounds and cleanup.
- [x] Prove dropped payload controls refuse before a native body, inherited
  evidence destinations are ignored, stale source fails and busy/pressure
  refusal starts no mutation. Keep the real plugin in the executable seam.
- [x] Route local mutate through the existing owner; explicit hosted workflow
  mode keeps the original configured full scope and CI concurrency.
- [x] Exercise interrupted real Stryker work and failing assertions. Preserve
  signal status; missing cleanup keeps ownership, never a false pass.
- [x] Commit via real hooks; mutate the outer bound, inner guard and request
  comparison separately, then restore and run their named green gates.
- [x] Commit and self-mutate the local-only vendor recovery policy; native
  synthetic-OOM, signal-only and initialization gates now pass, with retained
  causes. Hosted omitted/false compatibility, mutant-stage failure/cleanup and
  missing-patch refusal also have native green evidence (71242313).
- [x] Commit and self-mutate effective project-bound and ignored-input fixes;
  ensure the latter covers imported/nonselected files, not just argv selectors.
- [x] Commit and self-mutate the code-lens repairs: native-thread error/exit
  stops queued witnesses; missing inner patch refuses; native ignored paths
  cannot reduce exact scope; valid zero-mutant sources remain admissible.
- [x] Prove native Survived and Timeout retain the null threshold, public
  success, absent workerFailure and verified cleanup; a timeout runs its
  waiting body exactly once. Mutate expected teardown and timeout status,
  restore, and pass the public boundary again.
- [ ] Reconcile command consumers and exclusions; reuse independent task review
  for Tasks1–2, followed by final Standards/Spec review and exact-head full CI.

## Task 3: Current-tree measurements and decisions

- [x] Client pilot1/2/4 on Today, Library, Builder and WorkoutDetail: each
 372tests passed at clean5daf579e through public test:capture.
- [x] Three serial alternate-order4/2 pairs on that identical population,
  immediate vm_stat brackets and streamed receipt peaks; defaults unchanged.
- [x] Profile those files with native module diagnostics/import timing and
  heap observations, without treating heap growth as retained leakage.
- [x] Profile each real tsc project's file membership and extended diagnostics;
  retain all projects and the E2E census.
- [x] Profile representative typed lint and candidate pure-client/Node
  membership. Two pure files retain49 native identities in Node; this is
  feasibility only, not an accepted optimization or completed paired protocol.
- [x] Compare representative unit1/2/4;562 tests pass at each bound. Runs are
  shorter than the sampling interval, so the RSS peaks cannot select a default.
- [ ] Compare browser1/2/3; browser work waits for
  its ownership adapter, not a raw launch around that missing protection.
- [ ] Decide candidate from measured benefit and cost; any new default remains
  James's separate decision. Final candidate needs three complete alternating
  pairs, required hook/named browser proof, independent review and hosted CI.
- [ ] Publish exact scope, source, cold/warm state, separate wrapper/tree RSS,
  elapsed, host pressure/compression/swap deltas and sample gaps. Never sum
  host/VM/container/process domains or imply a guaranteed maximum.

## Hardening and exit

Author paste-tests are the actual modules/adjacent tests, not a second copied
implementation in this plan. Hardening follows the bounded mechanism/code
lenses after those commands run; both lenses have now finished, with the final
inner-thread/native-membership repairs now gated. No third hardening pass:
author gates and normal task/PR reviews cover those fixes. No stored product
shape, rower number, auth or hardware interaction changes: DBA and hardware
gates do not apply. The approved phase scope remains; no new ROADMAP row.
Tuning is incomplete while browser comparison, public mutation safety,
independent review or exact-head CI is missing, even when client pairs pass.
