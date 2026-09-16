# Whole-spec local resource delivery

Authority: James approved
[Make local development fit the machine](../superpowers/specs/2026-09-15-local-resource-budget-design.md)
and explicitly reaffirmed delivery of the **whole spec** on 2026-09-16.
The scope is not reduced to admission, screenshots or the WebKit repair.
Separate increments are review/rollback boundaries, not permission to stop
implementing the approved work after the first PR.

## Completion rule

The whole spec remains **INCOMPLETE** until every increment below has its
required implementation, failure-first and mutation evidence, independent
Standards/Spec review, and exact-head CI. Conditional tuning work must still
be measured and reported: retaining existing defaults is valid only with an
explicit outcome, not because profiling was omitted. A new worker default,
publishing or installing on a phone retains its separate approval gate.
James authorized merging ready increments as work proceeds on2026-09-16;
this does not waive review or exact-head CI. No outcome is inferred from a
checkbox or from another increment's CI.

The existing admission implementation plan covers only admission. Detailed
plans for the remaining increments must name concrete interfaces and their
proofs before implementation. This file is the delivery checklist, not a
substitute for those implementation plans or their hardening.

## Delivery checklist

### Admission — merged in PR463

- [x] Shared atomic ownership, maintenance barrier, pressure cancellation,
  foreground pipelines and receipt provenance implemented in PR #463.
- [x] Independent admission reviews and full hosted CI passed at `59a94e98`.
- [x] Commit the separately approved WebKit fixture repair through real
  hooks, mutate the navigation/setup guards, restore and pass both cases.
- [x] Read full exact-head CI for the repaired candidate without treating a
  recovered retry as a flake-free run.
- [x] Reconcile the PR's head, evidence and review status after that change.

The baseline CI run `35094020059` passed but recovered one WebKit retry.
The local repair is committed as `252a482f`: both orientations first failed
its new guard, then passed; four post-commit mutations failed at their intended
checks and the restored two-case run passed. The pre-commit abort receipt
`c6017c87-7237-43f9-ab8a-800efabb7842` remains preserved, not credited as a pass.
The repaired candidate `d61100b7728130ef295230a4cf75d5e993c0e23c` passed
run35098302961: browser603 first-attempt passes, no recovered retries;
app361files/9167initial executions, no first-attempt failures or resource
events. PR463's presentation was reconciled to that exact head and evidence.
James authorized incremental merges on2026-09-16. PR463 landed as2594c7a7,
after rechecking exact-head CI35098302961 and both final review passes.
TestFlight is not needed: this is tooling/instructions plus an E2E fixture
repair. Agent guidance/technique updates are included in that PR. Its post-merge
CI35125566075 also passed, including deploy. The current worktree holds
unfinished tuning and is not eligible for teardown.

### Cheaper hooks and exact subsets — merged in PR464

- [x] One exact project/file selection interface for direct named tests,
  test-name filters, related discovery, discovery-only inspection and explicit
  full mode; validate before execution and compare executed membership.
- [x] Pre-push executes related unit/client UNION script unit UNION
  filesystem-reading client identities once, in bounded sequential batches.
  End discovery before execution and do not reapply `--changed` to the union.
- [x] Selection errors, missing base/history, empty mandatory populations,
  unmatched targets and dropped selectors refuse before test bodies. No
  implicit full-suite fallback; legitimate empty related sets still run the
  mandatory populations. Preserve spaces, Unicode, renames and deletions.
- [x] Pin the base and source/index/config/lockfile identity; reject stale
  evidence and unsupported pushed trees using the actual pre-push input.
- [x] Conservative documentation-only staged classification avoids app-heavy
  checks; relevant staged/unstaged inputs and classification errors retain
  typed lint/typecheck. Preserve lint-staged restoration and deliberately
  bound its task-group concurrency.
- [x] Prove public command/hook boundaries and real upstream mandatory-input
  mutations; preserve full CI and the old hook's protection union.

Final Standards/Spec review passed at `5daf579e`; full exact-head
CI35113605158 passed with9167app and603browser first-attempt executions,
zero failures/recoveries/resource events. Failure-first, mutation, coverage and
real-hook receipts are in
[the validation record](2026-09-16-cheaper-hooks-validation.md).
After463's squash merge,464 was reconciled at7c12b51b with a tree identical to
reviewed5daf579e. Fresh exact-head CI35126121543 passed:9167app and603browser
initial executions, zero first-attempt failures, retries or resource events.
It landed asdae29d50 on2026-09-16. Its own post-merge CI35127501979 is pending,
not inferred from the PR's result. TestFlight is not needed; agent instructions
and adversarial techniques were updated in the merged increment. The remaining
approved work remains active on2026-09-16, beginning with tuning; merging these
two increments is not whole-spec completion or a new worker-default decision.

### Measured tuning — required investigation, no approved default change

Client1/2/4 and three4/2 pairs, unit1/2/4, import/heap, typed-lint/tsc and
two-file pure-Node feasibility measurements are recorded in
[the tuning record](2026-09-16-resource-tuning.md). Mutation admission is
NOT READY: mechanism hardening caught vendor OOM retries recovering into a
pass. James's continuation authorized the version-pinned local-only patch;
its synthetic OOM, signal-only and initialization probes now pass. Root/project
bounds and ignored-input freshness fixes also have green evidence. They are
committed in85eac349 with biting postcommit probes and restored30/30 native/
outcome/snapshot tests. The final code lens then found two additional defects:
inner-thread failure could pass with later bodies, and native ignored files
could silently reduce exact scope. Their repairs pass named native gates
4d508435/d23070da and the combined82-test gate95086cc3; postcommit proofs,
independent review and CI still gate readiness. Both hardening lenses are
finished. Browser
measurements still depend on the unimplemented ownership adapter.

- [ ] Compare representative one/two/four-worker Vitest and
  one/two/three-worker browser runs under normal pressure; no full-suite
  matrix, no automatic retry after resource events.
- [ ] Profile transforms, import graphs, fixture parsing, per-file growth,
  DOM membership, typed lint/typecheck membership and retained resources.
  Change only measured waste, with membership parity and unchanged witnesses.
- [ ] Measure and bound both Stryker outer concurrency and its separate
  Vitest worker pool before admitting mutation workloads.
- [ ] Complete three serial, order-alternated before/after pairs for any
  final candidate; report scope, cold/warm state, observed peak, elapsed time,
  host pressure/compression/swap deltas and sampling gaps separately.
- [ ] Present any winning default's reduction and turnaround cost to James.
  Retain defaults without claiming savings if no candidate wins; refused or
  incomplete pairs are inconclusive. Run the final candidate's required hook
  and named browser checks, with full regression/coverage in hosted CI.

### Browser sessions and owned Compose lifecycle — not implemented

- [ ] Own build/boot/verified-bundle/browser/session teardown under one slot;
  reuse only the session's verified stack, stop its containers by default,
  preserve volumes unless explicitly disposable, and register interactive
  keep mode visibly.
- [ ] Durably register a private invocation temporary namespace before
  browser launch; independently discover detached children by that namespace
  and retain it through crashes. Unknown or truncated identity blocks release.
- [ ] Prove pre/post-registration crashes, between-sample detachment, foreign
  sentinels and real browser closure. Never signal PIDs from a later census.
- [ ] Guard stack-reaper identity using canonical working-directory/config
  labels and successful worktree enumeration; hash/prefix alone never permits
  deletion. Preserve foreign creation/removal transitions.
- [x] Approved screenshot scope policy and wrapper refusal implemented;
  no text-only/release captures, full refresh requires explicit approval.
- [ ] Carry that policy through the session adapter without weakening browser
  correctness or failure diagnostics; retain unique private evidence.

### Integration resources — not implemented

- [ ] Register our invocation label on every Testcontainers fixture producer
  before creation, including the direct stats integration producer, and retain
  exact returned container IDs.
- [ ] Own full/coverage/integration lifetimes under admission, including
  interrupted creation inventory and cleanup; shared Ryuk is not ownership.
- [ ] Prove owned and foreign fixtures sharing a Ryuk session, partial starts
  and failing cleanup. Preserve foreign fixtures and shared reaper helpers.

### Native resources — not implemented

- [ ] Own native build/test/release orchestration, including nested web work,
  without recursive admission or weakening signing/publishing/device gates.
- [ ] Select simulator by UDID and record creation/adoption plus prior boot
  state; explicitly distinguish disposable owned devices from shared devices.
- [ ] Prove preexisting booted, task-created and interrupted-start lifetimes;
  xcodebuild exit or device name alone never certifies simulator cleanup.

### Interactive and bootstrap resources — not implemented

- [ ] Admit watch/dev as explicit foreground sessions with preserved TTY and
  registered persistent load; hold ownership until explicit end and cleanup.
- [ ] Route dependency/browser installation through serial bootstrap without
  daemonization or hook recursion, including both package roots.
- [ ] Prove cancellation, crash/recovery and no hidden persistent load across
  public entry points; keep lightweight status/source review available.

## Cross-cutting work owed in each increment

- [ ] Derive the live entry-point census from package scripts, hooks and
  callers; every expensive family is routed or explicitly accounted for.
- [ ] Update canonical instructions, README, TESTING and affected launch
  prescriptions in the same behavior change. Keep Codex adapters as pointers.
- [ ] Reuse the existing streamed receipt/native-report authority; preserve
  failure status, actual argv/scope, versions, source fingerprint, worker
  provenance, wrapper overhead and cleanup evidence without fabricated totals.
- [ ] Independent Standards/Spec review and full CI for each exact candidate;
  reviewers consume receipts and request named gaps, not duplicate heavy runs.
- [ ] Final whole-spec audit maps every acceptance condition to evidence;
  report unresolved conditions instead of calling a partial PR complete.

## Current resource boundary

The earlier WebKit pre-commit abort `c6017c87` remains preserved. James approved
that exact recovery; the maintenance-barrier census at12:44:28.352Z proved its
recorded identities absent and freed the slot without signals or receipt edits.
The subsequent `e4dd90ee` native-teardown record was separately recovered under
James's resumption authority at14:21:48.732Z, again with a fresh complete census,
normal pressure and no signals. Its Vitest premature-exit cause was repaired
and gated in the cheaper-hooks increment. Neither interrupted invocation is
credited as a pass. Later guarded hook/fixture/client-pilot runs have verified
cleanup and normal sampled pressure. Another actual resource event stops the
heavy loop; no stale-owner recovery or foreign cleanup is implied.
