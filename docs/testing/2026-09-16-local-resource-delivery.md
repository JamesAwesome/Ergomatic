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
merging, publishing or installing on a phone retains its separate approval
gate. No outcome is inferred from a checkbox or from another increment's CI.

The existing admission implementation plan covers only admission. Detailed
plans for the remaining increments must name concrete interfaces and their
proofs before implementation. This file is the delivery checklist, not a
substitute for those implementation plans or their hardening.

## Delivery checklist

### Admission — implemented, PR handoff still open

- [x] Shared atomic ownership, maintenance barrier, pressure cancellation,
  foreground pipelines and receipt provenance implemented in PR #463.
- [x] Independent admission reviews and full hosted CI passed at `59a94e98`.
- [x] Commit the separately approved WebKit fixture repair through real
  hooks, mutate the navigation/setup guards, restore and pass both cases.
- [ ] Read full exact-head CI for the repaired candidate without treating a
  recovered retry as a flake-free run.
- [ ] Reconcile the PR's head, evidence and review status after that change.

The baseline CI run `35094020059` passed but recovered one WebKit retry.
The local repair is committed as `252a482f`: both orientations first failed
its new guard, then passed; four post-commit mutations failed at their intended
checks and the restored two-case run passed. The pre-commit abort receipt
`c6017c87-7237-43f9-ab8a-800efabb7842` remains preserved, not credited as a pass.

### Cheaper hooks and exact subsets — next implementation increment

- [ ] One exact project/file selection interface for direct named tests,
  test-name filters, related discovery, discovery-only inspection and explicit
  full mode; validate before execution and compare executed membership.
- [ ] Pre-push executes related unit/client UNION script unit UNION
  filesystem-reading client identities once, in bounded sequential batches.
  End discovery before execution and do not reapply `--changed` to the union.
- [ ] Selection errors, missing base/history, empty mandatory populations,
  unmatched targets and dropped selectors refuse before test bodies. No
  implicit full-suite fallback; legitimate empty related sets still run the
  mandatory populations. Preserve spaces, Unicode, renames and deletions.
- [ ] Pin the base and source/index/config/lockfile identity; reject stale
  evidence and unsupported pushed trees using the actual pre-push input.
- [ ] Conservative documentation-only staged classification avoids app-heavy
  checks; relevant staged/unstaged inputs and classification errors retain
  typed lint/typecheck. Preserve lint-staged restoration and deliberately
  bound its task-group concurrency.
- [ ] Prove public command/hook boundaries and real upstream mandatory-input
  mutations; preserve full CI and the old hook's protection union.

### Measured tuning — required investigation, no approved default change

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

After the WebKit repair's two-case pass, pre-commit stopped at warning pressure
during staged typed lint. No typecheck, mutation, commit or new CI is credited.
Only this task's three test containers, network and disposable fixture volume
were removed. The retained owner was marked active, so the public idle-only
recovery command could not recover it. James explicitly approved this exact
record's manual recovery. At 2026-09-16T12:44:28.352Z, normal pressure and a
fresh census under the maintenance/generation barrier established that no
recorded owner, child, observed identity or process group remained. Recovery
freed the slot without killing anything or altering the original receipt.
Guarded validation may resume; another resource event stops the heavy loop.
