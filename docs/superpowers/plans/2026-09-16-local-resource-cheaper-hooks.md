# Cheaper hooks and exact test selection implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop duplicate or accidentally broadened local checks while retaining
the existing pre-push protection set and required code diagnostics.

**Architecture:** The existing resource owner remains the only admission and
resource sampler. An internal selection pipeline discovers exact native
Vitest specifications in a short-lived child, disposes discovery, and executes
the deduplicated manifest in sequential bounded batches. A conservative
staged-change classifier chooses the lightweight documentation pre-commit
path; all uncertain cases keep the complete code gate.

**Tech Stack:** Installed Node 26, Vitest 4.1.11 native specification API,
Git plumbing, existing pnpm/Husky and built-in node:test. No new dependency.

**Spec:** [Approved resource design](../specs/2026-09-15-local-resource-budget-design.md).
**Whole delivery:** [All seven increments](../../testing/2026-09-16-local-resource-delivery.md).
**Parent:** Admission PR #463, `d61100b7`; this increment uses a separate
`codex/memory-cheaper-hooks` branch and stacked PR, not a merge authorization.

## Global constraints

- Normal macOS pressure required; warning, critical and unknown refuse.
- No automatic retry, TTL stealing, SIGKILL, foreign cleanup or hook bypass.
- Current four-Vitest/three-browser defaults remain; CI correctness unchanged.
- Each pre-push test identity is executed at most once per verification
  invocation; its selected set covers at least the current hook's union.
- Missing or broken subset selection never promotes itself to a full run.
- Discovery runs under admission, with pressure/cancellation observed, and
  exits before execution starts. Raw binaries remain internal implementation.
- Keep fork/file isolation and jsdom semantics. Do not weaken assertions,
  fixtures, typed rules, coverage, timeouts, or E2E membership.
- No cross-invocation result cache. Report work reduction separately from RAM.
- All edits in the existing linked worktree; one controller runs heavy gates.
  Independent reviewers read exact-head receipts and request named gaps.

## File ownership and interfaces

| File | Responsibility |
| --- | --- |
| `app/scripts/local-work/selection.mjs` | Pure validated request and canonical identity/set contracts |
| `app/scripts/local-work/selection-git.mjs` | Immutable base/source identity, actual push-ref input and mandatory filesystem census |
| `app/scripts/local-work/selection-vitest.mjs` | Installed native discovery/execution and before/after membership witnesses |
| `app/scripts/local-work/selection-run.mjs` | Serial disposable discovery/execution children, private manifests and failure propagation |
| `app/scripts/local-work/selection-child.mjs` | One installed-runner context per child operation |
| `app/scripts/local-work/docs-only.mjs` | NUL-delimited staged/unstaged classification and staged blob/mode checks |
| `app/scripts/local-work/docs-check.mjs` | Lightweight staged checks, with a second docs-exemption check before credit |
| `app/scripts/local-work/push-input.mjs`, `app/scripts/push-full.mjs` | Bounded actual ref stream and one-shot full-request pipe |
| Matching `*.test.mjs` files | Harmless pure/Git fixtures and named real-runner seam cases |
| `workloads.mjs`, `run.mjs`, `local-work.mjs`, `test-run.sh` | Fixed internal routing, durable receipt directory and signal/native-report preservation |
| `entrypoints.test.mjs`, package scripts, hooks, CI | Public caller proof and unchanged hosted gates |
| Canonical instructions, README, TESTING | The implemented commands and remaining exclusions |

The pure request shape is `{mode, projects, files, testNamePattern,
maxWorkers, minWorkers, inspect, base}`. Modes are `files`, `related`, and
`full`; inspection is an explicit boolean, never a pre-push mode. Projects are
literal `unit`, `client`, `integration`; the current integration exclusion
continues until its own lifecycle increment. Files are canonical paths, never
substring selectors. Native identities are `{project, file}` and are keyed by
`JSON.stringify([project, file])`, not ambiguous delimiter concatenation.

Manifest authority is a private invocation-scoped JSON file beneath the
existing receipt. It records schema, request, immutable base, source/index/
configuration identity, requested identities and the selected union. Input
paths are validated against the actual installed runner's specifications;
neither caller-supplied lists nor a reporter's human prose establish scope.

## Concrete public syntax and paste-test sources

All direct commands run from `app/`. `pnpm test --project unit <exact-file...>`
requires files; `-t '<regex>'` optionally narrows names. `test:list` accepts
the same request but never runs bodies. `test:related --project unit --base
<commit-or-ref>` requires a base; `--list` inspects it. `test:full` and
`test:coverage` require repeated explicit `--project <name>` scope. Unit/client
commands use native exact objects. Integration remains explicitly excluded
until its lifecycle adapter, not silently included by a bare full command.
Unknown controls, missing values, unmatched targets and literal `--` refuse.

`pnpm push:full <git push arguments>` is available at root and app. It spawns
actual Git with a dedicated child-only descriptor3 pipe carrying a bounded
JSON request `{version:1, mode:"full", projects:["unit","client"], head}`.
Git's real ref stream remains on stdin. The hook consumes and closes the
full-request descriptor before the owner creates its independent outcome
channel. A missing, empty, inherited-without-pipe or stale request refuses;
no shell/Git setting changes the next normal push. Real Git/Husky propagation
and normal-following-full behavior are executable in `push-full.test.mjs`.

The author's executable paste-test artifacts are the named modules and their
adjacent tests at the real paths above, currently uncommitted in this worktree;
they are not a second implementation embedded in this document. Pure/Git
fixtures use built-in node:test. Installed-runner cases live under
`local-work/native/`, run serially in the app CI job after dependency install;
the always-run scripts job retains harmless fixtures without installing Vitest.
Local native paste-tests run beneath the existing owner/sampler, never by
bypassing refusal. The kernel block below is exercised by `selection.test.mjs`.

The pipeline's fixed child operation is `discover` or `execute`, with private
input/output JSON under the current receipt. Native discovery closes and the
child exits before batches start. Pre-push batches partition by project and
at most32files (a policy ceiling, not a measured optimum); direct capture and
coverage retain a single native report lifetime. Source hashing uses fixed
64KiB read buffers (policy bound) before/after discovery and after execution;
it does not repeatedly materialize large capture files or rehash the whole
tree for each batch. No peak-memory benefit is asserted without measurement.

## State lifetime

| State | Mint and authority | Clear and failure behavior |
| --- | --- | --- |
| Selection request | Validated public argv/push input under current owner | Never inherited as a mode for the next invocation |
| Base object/source identity | Git observation before discovery | Rechecked before execution and at end; any change fails the invocation |
| Discovery child | Owner's internal selection pipeline | Must exit/dispose before execution; failure never falls back |
| Exact manifest | Native discovery plus mandatory census | Retained with receipt, never reused by another invocation |
| Execution membership | Native onTestRunStart and returned test modules | Compared to that batch; mismatch fails before bodies where detectable |
| Docs exemption | Current staged snapshot plus unstaged relevant inputs | No cache; unknown/error chooses full code checks |
| Full-push request | Child-only pipe minted by the explicit wrapper with HEAD | Consumed/closed once by the actual hook; absent/stale/reused request refuses |
| Original selection intent | Public parser writes receipt independently of internal phase argv | Pipeline compares before discovery; dropped project/file/name controls refuse |
| Native cancellation | Selection child owns INT/TERM, AbortController and original signal status | Await cancel and close; no output on cancellation, including during teardown |

The installed Vitest4.1.11 logger synchronously registers the same callback
for INT, TERM and exit during `createVitest`; its signal callback schedules
`process.exit()` after1ms (`Logger.addCleanupListeners` in installed
`dist/chunks/cli-api.CnMVyzaz.js`). The adapter captures only the synchronous
new-listener delta before the first await, validates that exact shared identity,
and removes that callback from INT/TERM only. Existing listeners, exit cleanup
and later plugin listeners are preserved. Unknown registration shapes refuse.
Cancellation owns awaited teardown, not the logger's forced-exit timer. A held
global-teardown regression first failed with premature exit130, then passed
with cleanup verified after this change. Native reporting may overwrite exit
status during cancellation; the child reapplies the original signal status.

Pre-commit starts the installed `lint-staged/bin/lint-staged.js` directly under
Node, with `--concurrent false`, rather than interposing `pnpm exec`. The real
interrupted partially-staged fixture failed through pnpm (the task-modified
worktree returned before the hidden unstaged changes were restored), then
passed through the direct child with index/worktree restored and no backup
stash left. Typed lint and all four compiler checks remain required for code.

## Task 1: Exact selection kernel and real-runner seam

**Interfaces:** `parseSelection(args, mode)` validates public syntax;
`identityKey({project,file})`, `unionIdentities(...sets)` and
`requireExactMembership(expected, actual)` define one identity relation.
`discoverSpecifications({app, request})` owns a native Vitest context only until
its `{all,selected}` result is serialized; `executeSpecifications({app, request,
selected, coverage})` creates
a fresh context and runs the exact native objects, never CLI substrings.

- [ ] Add independent-literal pure tests before implementation. Required
  witnesses include duplicate project/file identities, the same file in two
  projects, `space ü.test.ts`, missing/empty option values, unknown projects,
  unmatched files, literal `--`, malformed worker overrides and a broadened
  actual set. The following contract tests belong in `selection.test.mjs`:

```js
assert.deepEqual(unionIdentities(
  [{ project: "unit", file: "/fixture/a.test.ts" }],
  [{ project: "unit", file: "/fixture/a.test.ts" },
   { project: "client", file: "/fixture/a.test.ts" }],
), [
  { project: "client", file: "/fixture/a.test.ts" },
  { project: "unit", file: "/fixture/a.test.ts" },
]);
assert.throws(() => parseSelection(["--project", "unit"], "files"));
assert.throws(() => parseSelection(["--project", "unit", "--", "a.test.ts"], "files"));
assert.throws(() => requireExactMembership(
  [{ project: "unit", file: "/fixture/a.test.ts" }],
  [{ project: "unit", file: "/fixture/a.test.ts" },
   { project: "unit", file: "/fixture/aa.test.ts" }],
));
```

- [ ] Run the pure gate RED, implement canonical sorting/deduplication and
  refusal, then run GREEN. Do not normalize an absent selector into `[]`
  and allow that to mean an unfiltered run.
- [ ] Exercise installed `createVitest`, `getRelevantTestSpecifications`,
  `globTestSpecifications` and `runTestSpecifications` in a private minimal
  fixture. `a.test.ts` and `aa.test.ts` write distinct body witnesses: exact
  selection executes only `a`; invalid selection writes neither. Discovery
  writes no body witness, closes its context, and exits before execution.
- [ ] Keep a native `onTestRunStart` guard so passing the wrong native
  specification set throws before bodies, plus a returned-module membership
  comparison. Preserve ordinary failure, unhandled error and coverage status.
- [ ] Preserve `--no-experimental-webstorage`, native reporters and capture
  behavior; retained JSON remains the native reporter's result, not a custom
  assertion summary. Direct capture uses one exact execution/report lifetime.
- [ ] Commit with real hooks before mutations. Delete exact-match filtering,
  drop a project from the key and widen the execution set separately; prove
  the corresponding witnesses fail, restore, and pass. Record scope/coverage.

## Task 2: Pre-push protection union and explicit full invocation

**Interfaces:** `readPushInput(root, text)` validates the actual Git pre-push
stream; `snapshotSource(root)` fingerprints HEAD, staged and unstaged source,
config/lockfiles and relevant untracked inputs; `mandatoryIdentities(app)`
enumerates the existing script and filesystem-reader populations. The serial
runner consumes their exact union with the native related set.

- [ ] First add failing Git/public-hook fixtures for missing base/history,
  config/lockfile changes, CSS/non-imported inputs, native inputs, deletion,
  renames, empty mandatory census, valid empty related set and discovery
  failure. Mutate actual upstream files/census inputs, not only returned arrays.
- [ ] Pin the base to a commit object once. Preserve NUL-delimited paths;
  bound Git operations and fail closed on malformed/truncated output.
- [ ] Resolve pushed objects to checked HEAD's commit tree, including annotated
  tags; explicitly handle deletion-only pushes without claiming HEAD tests.
  Refuse an unverified different tree or ambiguous input. A dry-run flag must
  never turn a real hook into a passing discovery-only command.
- [ ] Build related UNION script-unit UNION file-reading-client identities.
  Run sequential batches partitioned by project and a bounded file count;
  neither batching nor worker settings may change which identities execute.
  End discovery before starting the first batch and stop after a failed batch.
- [ ] Wire an explicit invocation-scoped full-verification entry point that
  still performs the real Git push hook under admission. It executes the
  complete unit/client population once and carries no sticky shell mode.
- [ ] Verify exact requested/resolved/executed membership and source identity
  before/after through real public pnpm/Husky boundaries. A removed selector
  must refuse before bodies. Preserve each child exit/signal and owner cleanup.
- [ ] Commit, mutate each mandatory population out of the actual producer,
  corrupt source identity and simulate wrapper selector loss; require RED,
  restore GREEN, and obtain task-scoped independent review.

## Task 3: Documentation-only pre-commit without diagnostic gaps

**Interfaces:** `classifyStagedDocs(root)` returns
`{docsOnly, reason, stagedPaths}`. It reads Git's staged snapshot and both
rename endpoints; it returns `docsOnly:false` on any uncertainty.

- [ ] Add temporary-Git-repository tests first for plain root/docs markdown,
  instruction prose, ordinary code/config/dependency/native/hook changes,
  executable markdown, symlinks, renames crossing the boundary, deletions,
  type changes, unmerged paths, malformed NUL streams, empty staging and
  unstaged relevant edits. Path extensions alone never establish safety.
- [ ] Prove through the actual hook that verified plain docs start no app
  ESLint/tsc process. Preserve lightweight conflict-marker and skill-parity
  checks against the relevant staged content; do not globally reformat docs.
- [ ] Keep the existing full code pipeline for every non-exempt case;
  deliberately serialize lint-staged task groups and preserve its partial
  staging backup/restore behavior after errors and interruption.
- [ ] Run a real typed-lint/typecheck defect witness through the real hook
  and prove it still blocks. Do not use a test-only environment bypass.
- [ ] Commit, mutate docs classification and unstaged-input inspection so
  code would be incorrectly exempt, require RED, restore GREEN and review.

## Task 4: Public guidance, parity, measurement and increment close

- [ ] Publish the actual tested subset/discovery/full commands alongside
  their refusals in README, TESTING, CLAUDE and briefing. Sweep active callers,
  skills and agents; keep `.claude` canonical and adapters as pointers.
- [ ] Replace only the implemented exclusions in status. Browser, container,
  native, watch/bootstrap and tuning remain explicit outstanding increments.
- [ ] Demonstrate old/new protection-set parity and one execution per identity
  using independent fixtures; report selection overhead and real hook elapsed
  separately from observed peak RSS. No unmeasured memory-savings claim.
- [ ] Read per-file coverage and run the scoped harmless/public/native gates
  serially. Real hooks are the lint/typecheck/push authority; do not duplicate
  their checks immediately beforehand.
- [ ] Get independent Standards and Spec review, resolve findings using the
  bounded review loop, and read full exact-head CI on the stacked PR.
- [ ] Update the whole-spec delivery checklist with evidence and proceed to
  the remaining increments. This PR never closes the whole spec by itself.

## Preflight status

This plan remains preflight work until failure-path/real-hook paste-tests and
the two bounded hardening lenses finish. Native exact execution, discovery
disposal, unmatched-name refusal, real public capture, one-shot Git/Husky
propagation and empty-related mandatory union have executable proofs in the
task ledger. Installed-source reads also show that file-only discovery may
transform modules, `standalone()` initializes reporters, and native execution
does not replace result/exit validation. No worker-default change or whole-spec
completion is credited by this plan.
