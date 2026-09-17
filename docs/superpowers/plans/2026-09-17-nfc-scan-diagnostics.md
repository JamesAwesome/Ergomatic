# NFC scan diagnostics implementation plan

> For agentic workers: use `superpowers:executing-plans` for inline execution
> after design review; the repository requires independent code review.

**Goal:** Make the next interrupted NFC-to-Bluetooth attempt explain its
stop source, observations, retry boundaries and final cleanup outcome.

**Architecture:** Extend the existing attempt trace at its hook and native
transport owners. Keep native lifecycle subscriptions, scan policy, queue
ownership and the exported entry shape unchanged. Reuse the existing hook
attempt counter to scope diagnostics; do not create a global recorder.

**Tech stack:** TypeScript, React, Capacitor App 8.1.1, BLE 8.3.0, patched
Capgo NFC 8.2.5; pnpm, Vitest and Playwright. No dependency changes.

**Spec:** [NFC scan diagnostics design](../specs/2026-09-17-nfc-scan-diagnostics-design.md).

**Research:** [Executed cases, source evidence and limits](../research/2026-09-17-nfc-scan-interruption/README.md).

**Status:** Implemented and independently reviewed after James’s approval. Both hardening
reviews are folded. The exact
implementation and tests live in [implementation.patch](2026-09-17-nfc-scan-diagnostics/implementation.patch),
a unified diff against `75e2c0a5` (product base `55c63d63`). The controller
wrote and exercised it in the separate `codex/nfc-diagnostics-paste` worktree;
the implementation branch now applies that patch on main `9c0e0618`.
Fresh implementation gates and independent reviews are recorded in
[execution.md](2026-09-17-nfc-scan-diagnostics/execution.md). This is not
a deployment or merge approval.

The patch is the executable content for Tasks 1–3. The task lists below
explain its responsibilities; do not transcribe a second implementation.
[Paste-test evidence](2026-09-17-nfc-scan-diagnostics/verification.md) records
commands, source tree, failures, restored passes and physical proof limits.

## Global constraints

- Work only in `.claude/worktrees/nfc-scan-diagnostics`, branch
  `codex/nfc-scan-diagnostics`. Main already has unrelated iOS release edits.
- No new permissions, dependencies, global listeners, persistence, timers,
  automatic retry, NFC session extension, or connection-policy changes.
- No workout-number, stored-schema, auth or device-identity changes.
- No raw native error text, tag data, names, URLs, addresses or attempt UUIDs
  in new diagnostics. `connect=N` is only a local numeric ordinal.
- Keep optional-trace behavior, queue and cleanup bounds, supersession and
  native background-versus-inactive distinction unchanged.
- Read `CLAUDE.md`, `.claude/agent-briefing.md`, and `docs/TESTING.md` before
  implementation. Use Node 26 and install dependencies at both roots.
- One PR. Do not install on a phone, start a hardware walk or merge without
  the separate authorization each action requires.

## File responsibilities

| File                                                        | Responsibility                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `app/src/monitor/nfc/connectionAttemptTrace.ts`             | Add the spec's closed diagnostic kinds to type and runtime allowlist. No entry-shape change.                                         |
| `app/src/monitor/nfc/connectionAttemptTrace.test.ts`        | Exercise new kinds through recording/export and existing redaction/capacity contract.                                                |
| `app/src/monitor/useMonitorSession.ts`                      | Scope scan trace to captured ordinal; record lifecycle, first abort origin and post-cleanup result; preserve cancellation ownership. |
| `app/src/monitor/useMonitorSession.test.ts`                 | Update affected expected traces; extend supersession and export assertions.                                                          |
| `app/src/monitor/nfcScanDiagnostics.test.tsx` (new)         | Native-plugin-input to real-hook-export seam; derive from the executed research probe.                                               |
| `app/src/monitor/transports/capacitorBle.ts`                | Per-scan stage/count summary and distinction for a late start acknowledgement.                                                       |
| `app/src/monitor/transports/capacitorBle.test.ts`           | Observations, deadlines, cleanup precedence, early callbacks and late acknowledgements.                                              |
| `app/src/monitor/nfcScanDiagnostics.test.tsx` (viewer case) | Assert real new entries render/copy without changing the viewer.                                                                     |
| `app/e2e/connected.spec.ts`                                 | Extend the existing NFC diagnostics flow to cover retry boundary/outcome and Copy log.                                               |

No changes planned to the Swift NFC patch, native lifecycle implementation,
domain types, fake transport behavior, monitor programming or persistence.
If implementation needs those, reconcile this scope before proceeding.

## Task 1: Attribute each scan and its stop source

**Consumes:** existing `ConnectionAttemptTrace`, `DiscoveryTrace`,
`attemptRef`, `targetedAbortRef`, `mapTargetedFailure`, `teardown` and
`cancel`. **Produces:** the spec's requested/lifecycle/abort/finished
records, sharing one invocation-local prefix with the transport's records.

- [x] Copy the research probe into the new permanent seam test and replace
      research-only output with assertions on `parseLogExport(exportLog())`.
      Keep real reader, parser, coordinator, lifecycle wrapper, BLE adapter and
      hook; mock only native plugin calls and the paint/haptic seams. Use proper
      multi-listener test registrations rather than the research probe's
      single-handler map where concurrent attempts are exercised.
- [x] Write failing diagnostic expectations for the three distinct stops:
      native `pause` => background plus failed screen; Cancel => cancel plus
      idle; unmount => teardown with no surviving screen to assert. Assert
      `appStateChange(false/true)` has no abort or finished record while the
      scan is pending. Assert the trace before test cleanup, not after it.
- [x] Drive a retry with the original trace and target. Assert a second
      requested marker and different local ordinal, with no second NFC read.
      Deliver duplicate tag callbacks before reader cleanup; assert one handoff.
- [x] Hold A's cleanup, cancel A, start B, then release A. Assert that A's
      late records retain A's ordinal and B's signal is not aborted or cleared.
      Exercise Cancel followed by effect cleanup and background followed by
      Cancel; only the first controller-abort request receives a cause marker.
- [x] Run the new tests against unchanged product code and record the
      missing-event failures. These are the deciding assertions, not call counts
      against a fake transport that produces its own expected trace.
- [x] Add trace kinds from the spec. In the validated targeted branch,
      capture the existing `attempt` value in a trace wrapper that delegates
      entries/completion and prefixes record detail. Record requested before
      awaiting scan lifecycle registration. Use this same wrapper in the
      lifecycle callback and as `transport.scanTarget`'s optional trace.
- [x] Add an abort function beside the existing controller. If that
      controller is already aborted, return; otherwise record the fixed origin
      and synchronously call its existing `abort()`. Store the function in the
      existing owned ref. Pass `cancel` through `teardown`'s internal argument;
      the effect's default is `teardown`. Do not introduce `AbortSignal.reason`
      or a separate mutable reason slot.
- [x] Record received background/foreground lifecycle inputs, then retain
      the existing background-only abort condition. Record finished on scan
      resolution or rejection, including superseded attempts, before trace
      publication and the superseded return. Reuse the existing error mapper's
      reason, with a diagnostic-only `link-failed` fallback when missing. Preserve existing `finally` listener removal and controller
      identity comparison; do not add changing callback dependencies.
- [x] Include lifecycle registration rejection and omitted trace in the
      tests. A failure to install the listener must terminate with diagnostics;
      omitted trace must keep its existing outcome and allocate no replacement.
- [x] Run the focused tests to green, commit the real change, then execute
      the spec's attribution/supersession mutations and restore cleanly. Record
      what each mutation broke. Verify worktree path before every commit.

## Task 2: Describe what the radio search observed

**Consumes:** existing `scanTarget` guard, timers, callback decoder, matches
and cleanup. **Produces:** one summary of the winning decision plus honest
start-acknowledgement records. The hook's finished event remains the final
post-cleanup authority.

- [x] Extend the existing manual-clock transport tests with callback input
      sequences using independent counts. One sequence: invalid callback,
      valid nameless callback, valid differently named callback, exact match,
      duplicate exact match. Expected summary: results=5, valid=4, named=3,
      matches=1. Do not count scan callbacks after settlement.
- [x] Hold the predecessor, initialization, enabled query, held-device
      query and scan-start promise separately; expire the existing deadline.
      Assert the correct stage and existing error for each. Test a pre-aborted
      signal and poisoned transport: diagnostics must not permit a native call.
- [x] Hold `requestLEScan` under the installed vendor queue and abort.
      Assert a decision summary while native stop has not entered and the
      hook has no final result. Release start, then assert late acknowledgement,
      stop/drain and final interruption. Separately hold start through the
      cleanup bound and assert cleanup failure before releasing it. Deliver
      an early exact callback separately and preserve collision-window stage.
- [x] Hold shared initialization over consecutive retries. Assert the same
      initialization call, separate preamble timeout outcomes, no scan start
      and no abort-source event. A stalled shared owner is distinct from
      explicit cleanup poison. Assert manual discovery succeeds after clean
      interrupted cleanup but is refused after explicit poison.
- [x] Match then reject `stopLEScan`, and separately let it exceed its
      existing bound. Assert the matched initial decision, cleanup-failed event
      and cleanup-failed final hook result are distinguishable. Never change
      which event wins the existing terminal guard.
- [x] Reject a plugin call with a synthetic message/name containing a
      device identifier. Assert only fixed `other-error` summary vocabulary
      reaches the new diagnostic payload. Existing raw UI error behavior is
      outside this diagnostics-only change.
- [x] Reject through the native boundary with undefined, empty, arbitrary
      and prototype-key error names (`constructor`, `__proto__`, `toString`).
      All summaries remain errors. Missing mapped final reasons become
      `link-failed` in the new diagnostic only; the existing error-display
      mapper is unchanged. Preserve the successful match test so success
      cannot silently fall into the error fallback.
- [x] Run these assertions red. Then add per-call stage and integer
      counters as defined in the spec's lifetime table. Increment after the
      settled guard and before decoder/name filtering. Update stage immediately
      before awaits; do not regress collision-window on scan-start resolution.
- [x] Record the winning summary inside the existing first-settle branch,
      before cleanup. Cover early exits explicitly. Add no new radio calls,
      waits, timer or global state. Use a closed outcome mapping; arbitrary
      errors become `other-error`. Distinguish late start acknowledgement at
      the existing post-`requestLEScan` record site.
- [x] Run green, commit, and prove the count, stage, cleanup-precedence,
      privacy and late-start tests bite their deciding mutations. Update old
      trace expectations where a legitimate new event was added.

## Task 3: Deliver evidence through the existing log

- [x] Exercise the new seam's exported JSON through `ConnectionLogSheet`;
      assert cause, invocation and terminal records render, and clipboard gets
      the exact exported string. Keep build metadata and pre-connection `atMs`.
- [x] Extend the existing fake-driven NFC flow in `e2e/connected.spec.ts`
      for requested/finished markers and retry distinction. This browser gate
      validates hook/export/viewer wiring only: it cannot stand in for the real
      Capacitor transport's summary or the native event seam tests.
- [ ] Run lint, format check, typecheck, unit/client suite and scoped e2e;
      read full e2e CI on the eventual PR's current head. Inspect per-file
      coverage for changed covered modules; acknowledge the existing native
      transport coverage exclusion and cite its direct tests instead.
- [x] Obtain independent Standards and Spec code reviews. No DBA or
      number/storage/auth PM gate applies to this diagnostics-only scope. Apply
      full gates if the scope changes; hardware validation has its separate gate.
- [ ] Open one reviewable PR with research limits and mutation evidence.
      Recommend TestFlight only after approval/merge. No phone install or merge
      is part of this plan's execution authorization.

## Applying and validating the prescription

From the implementation worktree root, apply the artifact once. It includes
production changes and their tests; the author's initial failing run is in
the evidence record. Rebase deliberately if the product base has changed.

```sh
git apply --check docs/superpowers/plans/2026-09-17-nfc-scan-diagnostics/implementation.patch
git apply docs/superpowers/plans/2026-09-17-nfc-scan-diagnostics/implementation.patch
```

With Node 26 on PATH, run from `app/`:

```sh
pnpm test --project client src/monitor/nfcScanDiagnostics.test.tsx src/monitor/nfc/connectionAttemptTrace.test.ts src/monitor/transports/capacitorBle.test.ts src/native/appLifecycle.test.ts src/native/nfc.test.ts src/monitor/useMonitorSession.test.ts src/workout/connected/ConnectionLogSheet.test.tsx
pnpm format:check
# The normal commit hook owns staged lint and full typecheck.
# The normal push hook owns related + mandatory unit/client verification.
# CI owns full coverage; reuse compatible per-file author receipts here.
# If a changed file needs a fresh local full-coverage run, explicitly request:
# pnpm test:coverage --project unit --project client
pnpm e2e connected.spec.ts --grep 'Phase NF: Scan NFC'
```

These commands use main’s current resource admission. Coordinate the heavy
window before starting; refuse/abort means stop without automatic retry.
Reuse exact-head hook receipts instead of duplicating their checks. The
author’s existing mutation receipts remain evidence for the identical patch;
repeat probes only for a changed source or unresolved review finding.

The e2e script builds and starts the worktree's compose stack. It leaves the
stack running; the controller downs that worktree's stack with its volume
once verification is finished. It cannot validate native iOS notifications.

Commit the real changes before mutation. The executable
[mutation script](2026-09-17-nfc-scan-diagnostics/mutations.py) refuses a dirty
worktree, writes one producer at a time, demands assertion failures, restores
exact bytes in `finally`, runs the restored gate and checks for leaked edits.
Its argument is the absolute implementation worktree root. The optional
`--browser` mode removes the requested marker and runs the actual browser
export test; the default runs the native seam mutants. Both modes were run
by the author. Full logs go to the temporary directory it prints.

The hardening report is [here](2026-09-17-nfc-scan-diagnostics/hardening.md).
After hardening, implementation still receives the repository's independent
Standards and Spec review and its PR gates. If user-facing instructions or
layout enter scope, prepare the rendered Gate 0 before that additional work.

## Remaining physical question

Does holding the phone over this monitor while ignoring the Chrome banner
produce a native background transition, a silent scan, or a successful
connection on the affected build/device? Desk evidence cannot answer it.
Do not book a walk now. First finish and review the diagnostic build and
prepare reliable capture/export; then propose a separately approved bounded
hardware session if natural failure reports have not settled the question.
