# Make local development fit the machine

## What and why

Keep James's Mac responsive while agents work on Ergomatic, without losing
the checks that catch real regressions. Coordinate expensive jobs across
worktrees, stop paying for duplicate local checks, and measure runner
tuning instead of guessing. Full CI remains the final correctness gate.

Status: approved for staged implementation by James ("Implement, spec
approved"). The spec and its hardening followed #457; implementation
receipts belong to the corresponding incremental plans and changes.

**Approved policy:** supersede the 2026-09-08 rule that the advisory
never blocks or fails a run, for participating heavy commands only, with
blocking fail-closed admission. This does NOT approve a new worker default,
automatic foreign-process cleanup, Docker settings changes or merging.

**Subset policy approved:** James accepted refusing failed subset selection
instead of automatically expanding to a full run. Full verification requires
an explicit invocation-scoped request. The subsequent whole-spec approval
also authorizes implementing the admission policy above.

Evidence baseline: `653bd5ea` (#457), Node 26.5.0, pnpm 11.17.0,
Vitest 4.1.11, Playwright 1.63.0. The
[research receipt](../research/2026-09-15-local-resource-budget.md)
distinguishes observed facts, historical measurements, primary sources
and unmeasured candidates. This spec defines local-development resource
policy, not the app's runtime memory, workout data, authentication or CI
flake policy. No rower-facing design or hardware gate applies.

## 1. Outcomes and non-negotiables

- Expensive participating jobs from different worktrees do not overlap.
  Reading code, editing and remote review can continue while one runs.
- Resource refusal/abort is visibly NOT a test failure, pass, or permission
  to retry. A stopped mandatory check still blocks the commit/push.
- Each pre-push test identity is executed at most once per verification
  invocation; its selected set covers at least the current hook's union.
- Missing or broken subset selection never promotes itself to a full run.
  Refusal is nonzero and blocks a mandatory hook; it is not a passing check.
- Full hosted lint, typecheck, coverage, integration, builds and both
  browser projects remain required for code changes. No reductions to
  assertions, fixtures, rules, coverage floors, isolation or timeouts.
- Only identified task-owned processes and disposable test resources may
  be stopped automatically. Other tasks, editors and applications remain
  untouched. A large or old process is not proof of abandonment.
- Report memory savings and turnaround separately. Fewer repeated tests
  may reduce total work without reducing peak RAM. Coordination may reduce
  overlap without making a single invocation smaller.

## 2. Approaches considered

**Recommended: shared admission plus cheaper checks.** A small local
wrapper serializes heavy jobs for this repository's worktrees; hooks avoid
demonstrably redundant work; runner changes follow controlled measurements.
This is more enforceable than prose and retains meaningful local feedback.
Costs: busy/refused commands, serialization latency, a small lifecycle
component to test. No quantified saving is claimed before measurement.

**Instructions and smaller worker counts alone.** Least infrastructure;
does not close simultaneous-start races or reach hooks launched by another
task. The hunt's one-worker aborts show why this is not the whole solution.

**CI-first for nearly all checks.** Lowest local test work, but later
feedback and dependence on network/runner availability. Full CI is already
authoritative; removing mandatory local code checks is not this proposal.
Consider only if the accepted design cannot run a required check safely.

## 3. One resource owner, not another scheduler service

### Admission boundary

Add a foreground, daemon-free local resource owner, proposed home
`app/scripts/local-work.mjs`. Public operations are: run a named workload,
report status, and diagnose an abandoned ownership record. A separate
explicit recovery action may release a proven stale record; it does not
automatically kill anything or manufacture a passed result.

Scope is the current user's worktrees sharing one canonical Git common
directory on one host. Independent clones, other repositories and arbitrary
direct binary invocations are outside the enforced boundary and remain
visible background load. Do not call this a universal machine scheduler.

Use one atomically acquired owner directory under the canonical common
Git directory, shared by all its worktrees. No daemon, background FIFO,
weighted scheduler, per-worker distributed token pool or lock dependency is
needed initially. Directory creation is the admission operation; a check
followed by a write is not mutual exclusion. Metadata is atomically
published inside it. An empty, malformed or unreadable existing owner
directory is occupied/unknown, never free.

An owner is distinguished by a fresh random invocation ID, user identity,
canonical worktree/common-directory paths, PID AND process-start identity.
No timeout, mtime or absent parent alone authorizes stealing ownership.
Private metadata must not follow a substituted symlink or overwrite a
different generation. Cross-user access is rejected. This is cooperative
coordination, not a security boundary against malicious code under the same
user account.

### Start, phase execution and stop contract

1. Acquire the slot, then sample host pressure before any heavy child is
   spawned. Normal macOS pressure is required. Warning, critical, unknown,
   unreadable diagnostics, or another owner refuse launch. Default is an
   immediate actionable refusal (exit 75), not an indefinitely waiting
   hook. Status names the owner and evidence path, never secrets.
2. A hook holds one owner across its sequential phases. There is NO public
   borrowed-owner bypass. The owner dispatches a fixed workload's internal
   phases itself, awaiting one before starting the next. Public entry points
   always acquire admission, including descendants; inherited tokens never
   exempt them. Nested package commands are refactored into the owner's
   internal serial pipeline, not a second wrapper waiting on its own lock.
   A build invoked normally completes through that pipeline; two child
   wrappers attempting independent heavy work both encounter the occupied
   slot. Runner workers within one phase still obey their runner limit.
3. Preserve child output, actual exit/signal and the working directory.
   Node flags and filters survive every public entry point. Hook invocation
   under Husky's `sh -e` must retain refusal/failure semantics. Admission
   occurs before lint-staged mutates files or a build creates artifacts.
   Exit 75 is the owner's refusal code; Git or a package manager may map
   that to a different nonzero exit. Preserve the resource classification
   in output and the receipt, not a claim that every outer command returns 75.
4. Sample pressure during the run using the existing observer's semantics.
   On a non-normal sample, stop launching later phases and request graceful
   termination only of this owner's active workload. Record the first
   sample and cancellation reason. Never turn a child failure into exit 0;
   a resource interruption is nonzero even if the child handles the signal
   and exits successfully. Do not automatically retry at fewer workers.
5. A cancellation uses the workload adapter's live child/control channel,
   not a scan-and-kill list. Proposed safety budgets: 5 seconds for interrupt
   and another 5 for termination, then retain an unresolved owner and report
   survivors. These are policy bounds, not measured completion times. The
   new resource owner does not initiate SIGKILL, name-wide kills, process
   suspension/resume or termination of the enclosing Git/agent/editor.
   Existing vendor cleanup is different: Playwright already has a force-kill
   fallback. Record its initiator and outcome; do not relabel it as an OOM.
   PID/start-time observations are NOT an identity-bound signaling handle.
   Never send survivor-directed signals from a later census; ambiguous or
   detached survivors remain blocked for explicit diagnosis. The contract
   does not claim an OS-enforced, race-free process-ownership sandbox.
6. Release only this generation's owner after the supported workload's
   cleanup contract succeeds. A failed launch with no child can release.
   A crash, unreadable process census or surviving child leaves blocked
   ownership with recovery instructions. Recovery verifies the exact
   identities again; no auto-TTL deletion. Reboot-stale records require the
   same explicit recovery, not an assumption that a PID cannot be reused.

Recovery/release must not implement compare-then-delete against a reusable
pathname. Publication, update, release and explicit recovery acquire a separate
exclusive maintenance barrier. Acquisition validates root/metadata and refuses
an already-visible barrier, then atomically reserves an empty owner directory
BEFORE taking maintenance. Only the reservation winner may publish; losing
acquirers never take the incumbent's barrier. The barrier precheck is not atomic:
if a barrier appears before publication, acquisition refuses and retains the
unpublished reservation as unknown/occupied for diagnosis. This includes the
window after an old release/recovery removes its directory but before it drops
maintenance; neither operation subsequently removes the new reservation.
The owner's identity is checked again after publication, before launch. A workload
already past launch remains a live owner that recovery must refuse. Under the
barrier, recovery re-reads the inspected generation and proves its cleanup
preconditions before removing exactly it. No recovery decision or state
publication, update or removal occurs after releasing the barrier. A
malformed/crashed barrier is
diagnosis-only: no automatic recursive stale-lock recovery. The plan must
paste-test the interleavings below before implementing the public command.

The supported command set must not silently daemonize unregistered work.
Process groups, known child identities and explicit Docker ownership are
separate cleanup checks. The observer's generic `cleanup: unverified` is
not converted into a guarantee: passing a workload-specific cleanup gate
certifies that contract, not every possible detached descendant on the Mac.
Unexpected detachment is an unresolved resource event and blocks another
heavy launch until diagnosed.

### State lifetime

| State | Mint / authority | Clear / failure lifetime |
| --- | --- | --- |
| Owner directory | Atomic acquisition at common Git root | Owner generation removes it after cleanup; crash leaves it blocked |
| Invocation identity | Fresh per top-level workload | Never reused; remains in receipt after release |
| Active phase | Owner's single internal sequential dispatch | Completed child/adapter cleanup before advancing; no public borrowing |
| Maintenance barrier | Exclusive synchronous ownership mutation, including recovery | Released only after the mutation finishes; abandoned barrier remains blocked |
| Child/process-group identities | Spawn plus observed start identity | Reaped and checked before release; ambiguity blocks recovery |
| Pressure samples / decision | Before launch and during each phase | Append-only receipt; missing samples are unknown, not normal |
| Docker test-session ownership | Explicit worktree/session creation or adoption | Session end stops its containers; destructive volume teardown only for owned disposable fixtures |
| Browser ownership namespace | Durable invocation-specific temporary root before runner launch | Retained through crash/recovery until adapter proves closure; not inferred only from parentage |
| Simulator ownership | Explicit UDID plus creation/adoption and prior boot state | Only task-owned device lifecycle may be ended; shared device retained explicitly |
| Watch/dev session | Explicit foreground user/task session | Kept visible until owner stops it; never disguised as an idle free slot |

CI keeps isolated-runner scheduling and existing concurrency. Local safety
must not be disabled by casually setting `CI=1`. Distinguish the resource
owner's explicit hosted-CI mode from the runners' historical CI flags;
trusted workflow context selects the former. Absent, empty, false-like and
unknown values are tested. Do not silently remove local caps or admission.

macOS is the initial local admission target; Linux CI exercises portable
logic with injected observations, not a pretend macOS pressure reader.
Unsupported local platforms require a separately validated adapter or an
explicit policy decision; an absent pressure source is not a normal sample.
The sysctl returns dispatch flags, not XNU's internal enum values.

Correct the legacy SIGKILL attribution in `test-run.sh` and RF40 alongside
this integration: an external/manual SIGKILL proves termination, not an
OOM cause. Allocation diagnostics and OS/cgroup OOM records are separate
evidence. Fixtures must distinguish intentional resource cancellation,
manual SIGKILL, allocation failure, ordinary failed assertions and a genuine
pass through every supported invocation shape.

## 4. Reach every expensive entry point

The implementation must derive and review the command census from package
scripts, hooks and their callers; this responsibility table is not a
hardcoded list of test filenames.

| Entry family | Proposed treatment |
| --- | --- |
| Pre-commit | One owner around staged typed lint then required typecheck; fail-fast remains |
| Pre-push | One owner around selection and its sequential test batches |
| Direct lint, lint-prune, typecheck, build | Same admission; no parallel ESLint/tsc/build commands from agents |
| Test, full, coverage and integration | Same admission; signal-preserving wrapper remains, project scope explicit |
| Named E2E and screenshots | Own build/boot/browser/session cleanup under the same owner; verify bundle identity |
| Mutation and performance probes | Explicit bounded invocation, same admission; no background probe left after review |
| Native build/test/release | Same local heavy-job admission, including nested web build; device permission gates unchanged |
| Watch and development servers | Explicit opt-in foreground session; TTY preserved; register persistent load and stop before another heavy job |
| Dependency installation / browser installation | Serial bootstrap, no competing heavy launch; no daemon or hook recursion |
| Read-only source review, Git status, remote CI watch | No heavy slot needed; bounded process/metadata queries stay usable while busy |

Generic evidence capture is an internal phase of the owner, not a second
admission wrapper; it must not silently create a second sampler tree. Hooks and
package scripts expose one canonical path, with raw executables treated as
implementation detail, not a documented workaround. The input contract
rejects malformed worker/profile options rather than silently choosing a
larger default. Equivalent CLI worker overrides are included in enforcement.

This table is the destination, not a claim that PR 1 reaches every row.
The staged map in §10 defines the deployed boundary at each step. During
early stages, browser/integration/native/watch/install commands retain their
existing lifecycle and require controller coordination. The new status
readout explicitly lists those exclusions. Existing worktrees on older
revisions also do not participate until updated; a new hook cannot make an
old checkout's raw command acquire the slot. Source work remains available;
a participating second heavy command receives BUSY/75 and owner/status
details. No phase declares the entire machine protected.

## 5. Make hooks cheaper without making green less meaningful

### Pre-commit

Retain staged formatting/typed lint and full typecheck for code, config,
dependency, native, hook or unknown changes. A positively identified
documentation-only staged change may skip application typecheck and app
lint when it changes no relevant input. Root markdown, plain docs and
agent prose are candidates, not a blanket exemption for executable files
under `.claude/`, `.agents/` or `docs/`.

Classify NUL-delimited staged paths including both rename endpoints,
deletions and type changes. Empty/failed/ambiguous classification takes the
expensive safe path. Read the staged snapshot, and treat unstaged relevant
source/config/dependency differences as uncertain rather than reusing a
clean-tree conclusion. Hidden partially staged changes remain lint-staged's
responsibility; preserve its restore behavior on failure/interruption.

Keep lightweight conflict-marker and instruction-parity checks where
applicable, including executable instructions that currently live beneath
CI's documentation allowlist. Do not globally reformat root/docs markdown.
Do not introduce an ESLint result cache that ignores dependency changes.
Set lint-staged task-group concurrency deliberately so added groups cannot
silently start multiple typed lint processes; measure before adding batching.

### Pre-push: set union, not three overlapping executions

Preserve the current protection set: related unit/client tests UNION unit
script tests UNION filesystem-reading client tests, keyed by project and
canonical test path. Integration stays out of this Docker-free hook.

Use installed Vitest's file-only relevant-specification discovery for
related files, plus the existing independently gated filesystem census.
Collect under the slot: Vite transforms can allocate memory even without
running test bodies. End/dispose discovery before execution. Deduplicate
identities, then run exact selections in sequential bounded batches without
`--changed` filtering them a second time. A separately requested full mode
runs each scoped test once, not full plus overlapping add-ons. Discovery
never selects full mode as an automatic fallback.

Requirements: no shell word-splitting of filenames; spaces, Unicode,
renames and deletion work. CLI substring filters must not silently broaden
or narrow the manifest: verify the runner-resolved selection against the
requested identities BEFORE execution, then check executed membership too.
Use the installed runner's exact specification interface where needed.
Do not parse human
reporter prose as a selection manifest. A legitimate empty RELATED set
still runs the mandatory populations. Malformed/missing discovery or an
empty mandatory census refuses the invocation before test execution, with
the failed selection step and the explicit full-mode recovery command in
the diagnostic. It neither passes with zero tests nor launches the full
unit/client suite. An actual test failure never triggers a broader rerun.

Resolve the base once to an immutable object, not a moving ref between
discovery and execution. Record source/index/config/lockfile fingerprints
before and after; mutation of selected inputs makes the receipt stale and
the push fail. Do not claim a local hook validates arbitrary refspecs: a
push of a tree other than the checked working tree must be detected from
Git's pre-push input and handled explicitly, never credited with HEAD's
tests. Missing base or history likewise refuses related selection; the
caller must repair the input or explicitly request full unit/client mode.

### Explicit subsets and full-run opt-in

Provide one documented targeting interface for project, exact test-file
paths and optional test-name filters, plus related-to-change selection.
Preserve these selectors through pnpm and every wrapper. Resolve and show
the project/file manifest before execution; offer discovery-only inspection
that cannot satisfy or bypass a required hook. Omitted subset targets,
unmatched explicit targets, unknown projects and malformed filters fail
without running test bodies. Never interpret an invalid or dropped selector
as permission for an unfiltered suite. The valid empty RELATED case above
is distinct from an invalid explicit target.

Full mode is a deliberate request naming its project scope, not a persistent
setting or an inherited flag that silently changes later runs. For pre-push,
provide an explicit full-verification entry point that selects this mode
for that hook invocation, preserves all mandatory checks, and still uses
admission. It does not run tests separately and bypass the hook afterward.
Full unit/client mode does not include integration or browsers implicitly;
failure to enumerate its complete scope also refuses rather than passing.
The implementation plan must select and test the concrete command syntax.

No cross-invocation passed-test cache in the first implementation. Avoiding
overlap within one invocation is a smaller correctness surface than
proving cache invalidation across dirty trees, tool versions and environments.
No generic dry-run environment variable may make a real hook silently pass;
existing test seams require explicit isolation from production execution.

## 6. Runner and test tuning

Keep the current four-Vitest/three-browser defaults as the admitted
baseline. One worker is a measurement candidate, not an already approved
permanent profile. Choose any new per-runner default from current-tree
comparisons and present both peak reduction and turnaround cost to James
for approval. Higher-cap overrides cannot bypass the slot or pressure stop.
No environment inherited from another task may silently choose an aggressive
profile. The goal is a smaller working set, not a universal claim that one
worker fits any background load.

Keep fork/file isolation and jsdom semantics. Do not switch to shared-state
workers, VM pools or happy-dom just to obtain a faster headline. Do not
increase heap limits: the old-generation limit is neither RSS nor a machine
budget. Test tuning candidates, in order:

1. Prove exact scope before execution, including the bare-file argument
   rule for pnpm. Use the subset contract above; avoid accidental full-suite
   selection rather than merely detecting it after execution.
2. Compare one/two/four Vitest workers and one/two/three browser workers on
   representative current workloads, not every combination on the full
   suite. Begin with smaller samples; only the final candidate gets a
   full required local hook. Do not deliberately reproduce host pressure.
3. Profile transforms/import graphs, fixture loading and per-file growth.
   Keep pure contract/calculation tests in a Node environment when their
   observable does not need DOM semantics. Move them only with explicit
   membership parity and unchanged mutation witnesses.
4. Remove repeated heavyweight fixture parsing or broad imports where
   measurement identifies them. Preserve realistic full-library witnesses,
   upstream-producer seams and per-test reset/isolation. A shared mutable
   fixture cache is not an acceptable memory optimization.
5. Audit teardown of timers, listeners, sockets, mocks, browser contexts and
   Testcontainers. Demonstrate a retained resource before changing global
   teardown; no blanket timer clears that hide missing product cleanup.
6. Profile typed-lint/tsc membership and types before restructuring projects.
   Their serial execution already avoids one kind of overlap. Any project
   split preserves every existing file's diagnostics and E2E census.

Stryker has its own outer concurrency and a separate Vitest config that
does not inherit the ordinary config's worker cap. Measure and bound both
levels before admitting mutation work; otherwise one admitted command can
still create several worker pools. Preserve mutation scope and witnesses.

The #457 axe repair already reduced unnecessary result materialization.
Do not narrow full-document/WCAG/contrast/frame coverage further. Ordinary
trace settings stay unchanged; first-attempt tracing remains a scoped
diagnostic choice with measured overhead. Evidence reports remain available
on failure; do not trade away diagnostics for unmeasured memory savings.

## 7. Agent instructions and lifecycle

Update canonical instructions together: `CLAUDE.md` command/hook rules and
RF1/RF40, `.claude/agent-briefing.md` gate table/final-review sentence,
`docs/TESTING.md`, `README.md`, affected skills and agent definitions that
actually prescribe launches. Sweep the proposition repo-wide. Codex
adapters remain pointers; do not fork `.claude/` text into them.

The instruction is: parallelize read-only reasoning when useful, not
heavy local commands. One named controller owns validation for a worktree;
delegates propose scoped commands and may execute them only through the
same admission path. Do not separately rerun a gate immediately before a
hook that is about to run it, unless its evidence no longer applies. Full
branch review checks evidence and targeted gaps; it does not independently
launch a second full suite alongside the controller or hosted CI.
Document subset and discovery commands beside full-run commands. A selector
error calls for diagnosis or an explicit full request, never dropping the
filter and retrying. Hosted CI's intentionally full workflows stay unchanged.

Every long-running server, browser, watcher or DB probe gets an owner,
purpose, stop condition and receipt. Completion includes checking its own
descendants and stack; tool timeout or lost terminal session is not proof
of exit. Under warning/critical/unknown pressure, continue only lightweight
work. A resource event stops the heavy-work loop, not the evidence collection.
Do not kill another agent because it is old or parented by PID 1.

Agent context/model usage is a separate cost from local process RAM.
Short, scoped review briefs and reuse of existing reviewers reduce repeated
context work; this spec makes no unsupported claim that closing a logical
subagent reclaims local Node or browser memory. No new standing agent is
needed. Resource ownership belongs to executable tooling, not another persona.

## 8. Docker, browser and artifact overhead

Agent browser checks use a declared test session. Within it, reuse only an
owned stack serving the verified source fingerprint; rebuild when needed.
At session end, stop that session's owned containers by default, even before
the worktree merges. Preserve volumes unless the session is explicitly
disposable; final worktree teardown still uses owned `down -v`.
An explicit interactive keep mode remains possible and visibly registered.

The browser adapter needs identity established BEFORE detachment. Use a
fresh private invocation temporary root, durably recorded before launching
the runner, and set its TMPDIR for this runner and its workers only.
Installed Playwright creates its browser profile under `os.tmpdir()` before
launch and carries that profile path into browser arguments. This is the
independent ownership namespace for discovery after an intermediate parent
exits; retain the namespace through recovery. Never search a shared default
temporary directory or treat every Chrome process as owned. Validate this
path through the real runner during that adapter's implementation; if the
namespace is missing, argv is unavailable/truncated, or registration is
incomplete, cleanup remains UNKNOWN and admission blocked. A namespace
marker is evidence for diagnosis, not permission for blind PID signaling.

Integration containers need an application-owned invocation label set on
EVERY fixture producer before container creation, plus exact returned IDs.
Testcontainers can reuse a Ryuk session across clients, so its session ID is
not exclusive ownership. Discover interrupted creation through our label,
never through the shared reaper label. Preserve foreign fixtures and shared
Ryuk helpers even when their vendor session matches ours. The real producer
seams include `server/testing/postgres.ts` and the direct stats integration
container; a factory change alone must not miss the latter.

Native test admission needs a separate device adapter. Select by UDID and
record prior boot state, with an explicitly task-created disposable device
or an explicit shared/adopted-device policy. A device name and xcodebuild's
exit do not establish ownership or shutdown. Preexisting shared simulators
are not automatically shut down; task-created device startup, interrupted
startup and teardown have their own receipts. No phone installation is
authorized by this resource policy.

Do not broaden `stack-reap.sh`'s automatic deletion while changing this
lifecycle. First fix/guard its ownership inference: missing/failed worktree
enumeration and hash-only matching must never authorize deleting another
stack. Record compose project plus canonical working-directory/config
labels. Validate identity immediately before cleanup. A name prefix alone
is not ownership and a vanished worktree does not authorize arbitrary
volume deletion. Preserve another task's live stack, including during its
creation/removal transition.

No daemon-wide Docker prune, VM restart, global memory-limit change or
Resource Saver setting change. Observe VM idle return only when no other
containers need it; report that precondition. Disk-cache/volume/artifact
retention is tracked separately from RAM. Keep raw traces private; preserve
unique evidence outside a worktree before deleting it. Never load every
historical trace or report into memory together for an inventory.

## 9. Measurement and acceptance

### Measure the right quantities

Use #457's receipt model as the starting point, extending to non-test
workloads without inventing a second competing report truth. Record exact
argv/scope, commit and dirty fingerprint, tool versions, effective worker
count, start/end, exit/signal, pressure history and cleanup status. Include
the wrapper's own RSS: instrumentation is not free. Stream resource samples
and logs rather than holding unbounded histories in memory.

Report separately: sampled process-tree RSS maximum (shared pages may be
duplicated); host pressure, compression and swap-rate deltas; owned-container
stats; Docker VM footprint when measurable; elapsed and waiting time. Do not
add these domains into a fabricated total or demand swap return to zero.
Short-lived peaks may escape sampling; state interval and sample gaps.

Use serial paired before/after runs on the same tree, scope, tool versions,
fixture population and background-workload conditions. Alternate order;
record cold and warm states. Proposed sampling protocol: three completed
pairs per final tuning candidate, subject to normal-pressure preflight and stop
rules. Fewer pairs due to refusal are inconclusive, not a pass. This is an
acceptance protocol, not a statistically guaranteed maximum or flake rate.

This performance protocol gates the tuning increment, not the independent
admission or hook-selection increments. They prove their own narrower
outcomes without waiting for a full memory benchmark campaign.

Do not start with a full-suite matrix. Small representative runs decide
candidates; one chosen configuration then proves full local hook and named
browser coverage. Hosted CI supplies full regression/coverage evidence.

### Exit conditions

- Simultaneous controlled entrants from separate worktrees admit exactly
  one heavy child; the other gets a named refusal. Use harmless held child
  processes, not a RAM-exhaustion race. The real internal build/hook pipeline
  completes without self-deadlock; two independent child wrappers cannot
  bypass by sharing an owner token. Interleave two recoverers, stale owner A
  and new acquisition B: maintenance prevents the race and the losing
  recoverer cannot remove B. Kill a harmless owner at metadata and barrier
  boundaries; neither incomplete record becomes silently free.
- Pressure and cleanup fault fixtures refuse/abort truthfully, preserve
  child failures and records, and never signal a foreign identity. Prove
  behavior through public hooks/package entry points, not just helpers.
  Change an observed identity before cancellation and assert no
  survivor-directed signal. Distinguish vendor force-kill from allocator OOM.
- Browser adapter gate: hold the observer between samples, detach a harmless
  child carrying the private namespace, end its intermediate parent, then
  resume observation. Next launch stays blocked unless the independent
  channel proves closure. Include a foreign sentinel and owner failure both
  before and after registration. Test real browser closure separately; the
  harmless fixture proves the ordering, not Playwright's entire lifecycle.
- Container adapter gate: owned and foreign fixtures share a Ryuk session;
  only our pre-creation invocation label authorizes cleanup. Interrupted
  creation is covered from producer through cleanup inventory. Native
  adapter gate separately covers preexisting booted, task-created and
  interrupted-start devices; only the appropriate owned UDID is stopped.
- Pre-push requested/executed sets match its deduplicated protection union.
  Independent witnesses cover CSS/non-imported files, config, lockfiles,
  native files, missing base and discovery failure. Removing a mandatory
  population or corrupting its real upstream input makes the gate fail.
- Selection failures, missing history, empty mandatory populations and
  omitted/invalid/unmatched explicit targets execute no test bodies and
  block required hooks. A valid empty RELATED set still runs mandatory
  populations. Exact-file/test-name selectors survive the public pnpm and
  hook boundaries; include spaces, Unicode and the argument-separator trap.
  An explicit full-mode request executes the complete named scope once,
  preserves failure status and does not leak into the next normal invocation.
  Removing a selector in a wrapper must fail the scope gate, not run broadly.
- Docs-only commit avoids app-heavy children; a relevant staged or
  unstaged input, rename, deletion, malformed path stream or classifier
  error does not receive that exemption. A real typed-lint/typecheck defect
  still blocks its required commit.
- The selected local configuration completes the representative paired
  protocol without sampled non-normal pressure/resource events and lowers
  the measured peak versus the current configuration. Report the absolute
  difference and runtime cost; if there is no reduction, do not claim one
  or ship that tuning merely because it is faster. Serialization and
  deduplication can still land with their narrower demonstrated benefits.
- Full CI remains green on the exact candidate head, native evidence
  preserves first attempts and all required coverage. A green local subset
  is never described as a full suite. No regression is quarantined or retried
  into acceptance.
- No participating workload, browser or disposable stack is abandoned;
  no foreign process/resource or user edit is changed. Recovery and busy
  messages provide the next action without requiring hidden knowledge.

## 10. Delivery and rollback

The review found distinct proof and rollback contracts. Keep related work
together within each increment, but do not couple all of them in one PR:

| Increment | Scope and safe stopping point | Acceptance owner |
| --- | --- | --- |
| Admission | Foreground Node lint/typecheck/build and unit/client test pipelines; existing hook selection and worker caps unchanged | Atomic owner/maintenance, phase, pressure, exit and harmless-crash gates |
| Cheaper hooks | Exact subset interface, pre-push protection union, explicit full mode and narrow docs-only pre-commit path | Independent manifest parity, refusal without scope expansion and upstream mutations |
| Measured tuning | Only worker/import/fixture changes with demonstrated benefit; old defaults remain if no candidate wins | Paired peak/elapsed protocol and same membership, plus James's new-default decision |
| Browser sessions | Playwright detached ownership plus its owned Compose lifecycle | Pre-registration/crash and foreign-browser/stack gates |
| Integration resources | Testcontainers invocation ownership across every producer | Shared-Ryuk/foreign-fixture and interrupted-create gates |
| Native resources | Native build/test orchestration and simulator lifecycle | UDID/prior-state gates; device installation authority unchanged |
| Interactive/bootstrap resources | Watch/dev TTY and persistent ownership; dependency/browser installation lifetimes | No hidden persistent load, preserved TTY, explicit end and recovery |

The first increments deliver value before lifecycle adapters are ready.
Foreground Node does not mean child-free: the admission increment must
prove its supported Vitest fork/worker shutdown contract before release.
An unexpected detached child is unresolved, not covered by the later
browser adapter or excused by the entry-point name.
An adapter can share a PR only when its proof and rollback actually share
the same risk model; "they all use memory" is insufficient. Instructions,
caller routing, tests and ownership exclusions change in EACH behavior PR,
not in a final documentation cleanup. Each code PR has independent
Standards/Spec review and full CI for its exact head. This is a delivery map,
not permission to build every proposed optimization without its evidence.

This is infrastructure/test policy, not a product stored-shape or numerical
meaning change. DBA and hardware gates are not required. The phase-opening
scope/sequence and memory-versus-turnaround choice merit PM review; the new
ownership mechanism needs antagonist review. Native installation and merge
still need their own authorization.

Rollback is by component, not by bypassing hooks: revert a bad selection
optimization to complete scoped verification only when explicitly requested,
under admission; otherwise leave the hook blocked until selection is repaired.
Do not restore the old automatic full-suite fallback during rollback;
restore old worker values under the same slot if tuning regresses; restore
explicit session teardown if keep behavior fails. An admission defect
blocks heavy launch until repaired or an explicitly approved rollback lands.
No `--no-verify`, silent unsafe mode or passed-result cache is a recovery path.

No new ROADMAP rows are filed by this design. James has approved the design
and implementation; work proceeds in the increments above, with the normal
ROADMAP hand-back for anything proposed to remain after delivery.
The detailed implementation plan must choose concrete tested interfaces
and paste-test them; this spec contains no proposed implementation code.

## 11. Hardening record

One mechanism review and one PM scope review completed against this draft
and the installed sources. Both returned concerns, now folded by the
controller: durable pre-detachment browser identity; no public borrowed
owner; a maintenance barrier and competing-recovery gates; invocation-owned
container labels rather than shared Ryuk identity; simulator UDID/prior-state
ownership; and an owner-specific, not vendor-wide, no-SIGKILL promise.

The PM's scope conditions produced independently shippable increments,
retained the existing worker defaults, limited paired benchmarks to tuning,
and made the warning-only policy decision explicit. James subsequently
approved the spec. Neither review is retrospectively relabelled PASS.

The prescribed-code lens is skipped: this is a design, with no proposed
implementation blocks to paste-test. No repeat verification review is
requested; that is the hardening stop rule, not proof the unbuilt mechanism
works. The acceptance gates above remain owed by the implementation plan
and each corresponding change. No memory saving has yet been measured.

After those reviews, James approved the narrower subset-policy amendment:
replace automatic full-suite fallback with refusal and explicit full-run
opt-in. Selection, agent guidance, acceptance and rollback now use that
contract. This user-directed revision was self-checked for consistency;
it does not claim an additional adversarial review or implementation proof.
