# Local resource admission implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit one supported heavy foreground workload per common Git
directory, refuse unsafe pressure and preserve truthful failure/cleanup.

**Architecture:** A small Node owner acquires an exclusive directory before
dispatching a named sequential pipeline. Lock ownership, host observations,
and workload execution have separate modules; no public borrowing token or
daemon. Status remains usable while busy; recovery is explicit and exclusive.

**Tech Stack:** Node 26 ESM and built-in node:test, existing pnpm/Husky/bash.
No dependency addition, worker-default change, database or product change.

**Spec:** [Approved resource design](../specs/2026-09-15-local-resource-budget-design.md).

## Global constraints

- One user's worktrees sharing a canonical Git common directory; not a
  machine-wide security boundary. Independent clones/old revisions excluded.
- Normal macOS pressure required; warning, critical and unknown refuse.
- Owner refusal exit 75; outer Git/pnpm can map to another nonzero code.
- No automatic retry, TTL stealing, SIGKILL, foreign cleanup or hook bypass.
- Current four-Vitest/three-browser defaults remain; CI correctness unchanged.
- No borrowed-owner exemption. Internal phases execute sequentially.
- Memory pressure currently warning: lightweight source/fixture work only;
  real heavy validation waits for normal pressure and available capacity.
- All edits in this linked worktree. Check its root before every commit.
- Full spec is approved, merge is not. No native installation is authorized.

## Delivery boundary and file ownership

This is the admission increment, not the entire seven-increment design.
Follow-on plans implement exact selection/cheaper hooks, measured tuning,
browser/Compose, Testcontainers, native and interactive/bootstrap lifetimes.
Do not silently claim those adapters are installed by this increment.

| File | Responsibility |
| --- | --- |
| `app/scripts/local-work/owner.mjs` | Exclusive owner and maintenance directories; generation-safe release/recovery |
| `app/scripts/local-work/owner.test.mjs` | Real filesystem and held-process ownership boundaries |
| `app/scripts/local-work/host.mjs` | Bounded process census, identity and macOS pressure observations |
| `app/scripts/local-work/run.mjs` | Foreground phase lifetime, cancellation, streamed receipts |
| `app/scripts/local-work/run.test.mjs` | Harmless child processes and injected host observations |
| `app/scripts/local-work/workloads.mjs` | Fixed pipelines; current command semantics and exclusions |
| `app/scripts/local-work.mjs` | Validated public CLI, status and explicit recovery |
| `app/package.json`, `.husky/*`, CI scripts job | Route supported entry points and run the lightweight gates |
| Canonical instructions, README, TESTING | Explain the deployed boundary and verified commands |

## State lifetime

| State | Mint / clear | Crash or ambiguity |
| --- | --- | --- |
| Owner generation | UUID under exclusive owner directory / same generation release | Stays occupied |
| Maintenance barrier | Exclusive ownership mutation / synchronous finally | Stays blocked if abandoned |
| Owner PID/start identity | Acquisition / receipt retained | No PID-only recovery |
| Active phase/group | Before spawn, then registered child / successful census after wait | Unregistered launch or unavailable census stays unresolved |
| Pressure timer and observed identities | During phase / stopped after wait and cleanup | Missing observations do not certify closure |
| Receipt | Fresh UUID before heavy spawn / append plus terminal record | Nonterminal record remains evidence, not success |

## Task 1: Exclusive ownership with explicit recovery

**Files:** owner module and its node:test file above.

**Interfaces:** `acquireOwner(root, metadata)` returns a handle with
`update(patch)` and `release()`; `inspectOwner(root)` returns explicit
free/occupied/unknown status; `recoverOwner(root, generation, proveStale)`
uses a synchronous proof callback under an exclusive maintenance barrier.
`root` is an already canonical private coordination directory. Metadata
contains `id`, `uid`, common/worktree identity, owner PID/start and phase.
Filesystem operations are synchronous so no old release completes after a
new generation is admitted. Unknown records are never recoverable by guess.

- [ ] Write real-filesystem tests for two acquisitions, malformed/empty
  owner, wrong generation release, symlink/foreign UID, maintenance refusal,
  two recoverers and new admission during recovery. Tests use temporary
  directories and literal expectations, not imported decision constants.
- [ ] Run `node --test app/scripts/local-work/owner.test.mjs`; record RED.
- [ ] Implement exclusive mkdir, private metadata, atomic update, exact
  release and synchronous guarded recovery. Use no recursive delete.
- [ ] Run the same gate GREEN, then check syntax and scoped formatting.
- [ ] Commit under normal host pressure with the real hook; mutate the
  deciding branches only after the real change is committed and prove RED.

## Task 2: Pressure-aware foreground execution

**Files:** host/run modules, run tests and public CLI above.

**Interfaces:** `readHost()` returns `{pressure, processes}` where pressure
is normal/warning/critical/unknown and process census has PID/PPID/PGID/start
identity or an explicit unavailable error. `runWorkload({root, metadata,
phases, observe, ...})` owns acquisition through cleanup; `phases` contain
executable, argv, cwd and env for known foreground programs, not arbitrary
public shell source. Production supplies real observations; tests inject
observations by module calls, never environment bypasses.

- [ ] Write failing harmless-process cases: preflight warning/unknown never
  starts child; phase 2 never starts after phase 1 fails; rising pressure
  cancels only live owned group; handled interruption still refuses; normal
  failure preserves status; unavailable census or surviving child retains
  blocked owner; nested independent entry points refuse.
- [ ] Run the named node:test file RED, implement, run GREEN. Use child
  readiness channels, never scheduling sleeps as proof of readiness.
- [ ] Stream resource samples and terminal outcome under a fresh private
  receipt directory. Record wrapper RSS separately from child tree RSS;
  no summed host/container total. Keep the existing evidence observer as
  native reporter authority; do not introduce a competing test summary.
- [ ] Expose status and generation-specific recovery. Unsupported local
  platforms refuse; hosted mode requires explicit workflow configuration
  plus GitHub runner context, never `CI=1` alone.
- [ ] Run syntax/format checks and the scoped gates once; commit then run
  deciding-source mutations and restore exactly the authored changes.

## Task 3: Route real foreground entry points without recursion

**Files:** workloads module, package scripts, hooks and their tests, CI.

- [ ] Derive the entry-point census from package scripts/hooks and identify
  nested calls before changing them. Preserve existing pre-push selection
  until the separate subset increment; say that exclusion in status/docs.
- [ ] Move lint, lint-prune, typecheck, web build and pre-commit to fixed
  internal pipelines, not nested public wrappers. Hold the slot across
  staged lint and required typecheck, before lint-staged mutates anything.
- [ ] Admit direct unit/client test commands and pre-push through the same
  owner. Explicit integration/native/browser/watch/install commands remain
  excluded pending their adapters; do not pretend detached work is covered.
- [ ] Exercise actual package/hook boundaries with controlled harmless
  binaries, including exit/signal forwarding, filters, nested acquisition,
  and `sh -e`. Keep Node-version rejection intact; no production dry-run
  environment may pass a hook. Add node:test gates to CI with Node 26.
- [ ] Under normal pressure run a named real unit/client selection and real
  build/typecheck serially; prove supported fork/group cleanup before release.
  Record any refusal as refusal, never a test pass or reason for auto-retry.

## Task 4: Align instructions and close the increment

**Files:** `CLAUDE.md`, `.claude/agent-briefing.md`, `docs/TESTING.md`,
`README.md`, affected launch prescriptions, `test-run.sh` and its tests.

- [ ] Correct SIGKILL causality using a failing classifier test: signal 9
  proves termination only; allocation/OS evidence establishes memory cause.
- [ ] Document status/recovery and exact participating/excluded entry points.
  One controller owns serial heavy validation; reviewers consume current
  evidence and scoped gaps rather than repeat the full suite.
- [ ] Reconcile the final-review instruction with CI-owned full browser
  coverage. Keep canonical `.claude` paths and pointer adapters untouched.
- [ ] Run conflict/parity gates, focused tests, required lint/typecheck and
  format checks when capacity permits. Read per-file coverage for new code.
- [ ] Obtain independent Standards and Spec review of this increment; fold
  fixes and their tests. Hosted full CI must pass on the exact candidate head.
- [ ] Leave an honest receipt and proceed to the subset increment; never
  describe admission alone as completion of the entire approved design.

## Proof and measurement boundaries

Harmless fixtures gate exclusion, failure semantics and cleanup ordering.
They do not establish browser/container/simulator lifecycle or savings.
Real workload cleanup and hosted regression evidence are separate gates.
No change to defaults is proposed without the later paired measurements.
The spec's vetted mechanism ground is reused; no repeat mechanism dispatch.
Executable implementation and task review must settle concrete interfaces;
this execution checklist is not a claim that future commands already passed.
