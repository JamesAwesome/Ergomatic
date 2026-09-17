# Targeted Discovery Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concentrate the complete pre-GATT targeted Bluetooth attempt behind one non-React owner while preserving every released retry, cancellation, timeout, failure-copy and diagnostic outcome.

**Architecture:** `useMonitorSession` creates one `TargetedDiscoveryOwner` for its hook lifetime and calls its two-operation interface, `discover` and `cancel`. The owner absorbs request validation, operation identity, pass controllers, foreground recovery, trace decoration and targeted failure classification; the session hook retains the whole-connect epoch, transport disposal, GATT, session/log identity and UI state.

**Tech Stack:** TypeScript, React 19, Vitest, Capacitor app lifecycle adapter, existing monitor `Transport` interfaces.

**Spec:** `docs/superpowers/specs/2026-09-17-targeted-discovery-module-design.md`

## Global Constraints

- Preserve behavior from released commit `dd8dbdee41cdc58502f17701ab086b060956543d` (`v0.50.4`).
- Change no rower-facing copy, timer, radio call, retry count, stored shape, authentication rule or platform permission.
- Never fall back from an advertised-name request to `Transport.scan()`.
- Exactly one foreground recovery is eligible, and only after the interrupted transport pass returns the exact signal it was given.
- The owner may read supersession for diagnostics; only the session hook decides whether a result may advance to GATT.
- The Capacitor adapter retains its module-scoped initialization, operation FIFO and poison state.
- Calls without a `ConnectionAttemptTrace` allocate no substitute trace.
- Run every `pnpm` command from `app/`.

## File Structure

- Create `app/src/monitor/targetedDiscovery.ts`: the deep module and its two-operation interface.
- Create `app/src/monitor/connectionFailure.ts`: the shared connection-failure vocabulary and classifiers.
- Create `app/src/monitor/targetedDiscovery.test.ts`: the direct owner-lifetime witness.
- Modify `app/src/monitor/useMonitorSession.ts`: call the owner while retaining whole-connect and post-discovery ownership.
- Delete `app/src/monitor/nfc/scanWithForegroundRecovery.ts`: fold its private state machine into the deeper module.
- Preserve `app/src/monitor/nfcScanDiagnostics.test.tsx`, `app/src/monitor/useMonitorSession.test.ts`, and `app/src/monitor/transports/capacitorBle.test.ts` as producer-to-consumer behavior gates.

## Proof Contract

1. **Production invariant:** cancellation targets the current targeted operation; a late predecessor cannot clear or redirect its successor.
2. **Supported producer and ordering:** `useMonitorSession.connect()` accepts one advertised-name request, creates the owner operation, then Cancel, teardown or native lifecycle events may arrive before its transport settles.
3. **Independent observable:** the `AbortSignal` received by each real `scanTarget` adapter and the exported connection-attempt trace.
4. **Deciding-source mutations:** remove the synchronous outer abort or replace `if (current === operation)` with unconditional clearing; the direct owner test must fail. Remove the exact-signal recovery predicate; the native diagnostic integration tests must fail.
5. **Strongest conclusion:** the owner preserves application ordering and diagnostic export through the existing transport seam. Desk tests do not establish the affected phone's radio state or the cause of the original interruption.

## Lifetime Table

| Value                      | Mint site                                                                                   | Clear sites                                                                         | Teardown                                            | Relaunch                       | Re-arm                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| `connectingRef`            | accepted `connect()`                                                                        | current attempt finalization or Cancel                                              | cleared by existing teardown                        | new hook value                 | cleared before a new accepted connect                            |
| whole-connect epoch        | hook mount; incremented by connect, Cancel and teardown                                     | hook destruction                                                                    | incremented                                         | new hook value                 | incremented by the new connect                                   |
| current targeted operation | accepted `owner.discover()`                                                                 | only that operation's identity-guarded `finally`                                    | synchronously aborted by `owner.cancel("teardown")` | new owner                      | successor replaces the current slot; predecessor cannot clear it |
| outer operation controller | targeted operation entry                                                                    | operation settlement                                                                | aborted                                             | discarded                      | new controller                                                   |
| cancel source              | targeted operation entry with Cancel semantics                                              | operation settlement                                                                | first explicit Cancel/teardown source wins          | discarded                      | defaults for the new operation                                   |
| active pass controller     | operation entry; replaced once after acknowledged recovery                                  | pass/operation settlement                                                           | aborted through the outer controller                | discarded                      | new first pass                                                   |
| `foreground` and `wake`    | optimistic foreground at operation entry; changed only by observed lifecycle events         | operation `finally`                                                                 | wake released by cancellation                       | discarded                      | reset for the new operation; no pre-registration state inferred  |
| `closed` lifecycle guard   | false at operation entry                                                                    | true before listener removal                                                        | blocks late callbacks                               | discarded                      | false for the new operation                                      |
| `scanned` terminal guard   | false at entry; true immediately before the first transport pass                            | operation settlement                                                                | retained through cleanup                            | discarded                      | false for the new operation                                      |
| `backgroundAborted` guard  | false at operation/pass entry; true only when an observed background event aborts that pass | reset before the replacement pass; ends with the operation                          | outer cancellation cannot make recovery eligible    | discarded                      | false for the new operation                                      |
| connect/pass trace views   | operation/pass entry                                                                        | closures die after native callbacks settle                                          | retained only by captured callbacks                 | discarded                      | new views over the new trace                                     |
| native FIFO and poison     | Capacitor module initialization / cleanup failure                                           | process restart or successful module initialization rules already implemented there | survives                                            | follows native module lifetime | survives transport instances                                     |
| logical session and log    | successful GATT                                                                             | existing session teardown/replacement                                               | existing behavior                                   | new hook/session               | unchanged                                                        |

---

### Task 1: Own targeted discovery and its failure vocabulary

**Files:**

- Create: `app/src/monitor/targetedDiscovery.test.ts`
- Create: `app/src/monitor/targetedDiscovery.ts`
- Create: `app/src/monitor/connectionFailure.ts`
- Delete: `app/src/monitor/nfc/scanWithForegroundRecovery.ts`

**Interfaces:**

- Consumes: `Transport`, `TargetedMonitorDiscoveryRequest`, `ConnectionAttemptTrace`, and `AppLifecycleCallback`.
- Produces: `createTargetedDiscoveryOwner(): TargetedDiscoveryOwner`, `mapRadioFailure(err): ConnectedError`, and `mapTargetedFailure(err, exactName): ConnectedError`.

- [ ] **Step 1: Write the direct owner test before the owner exists**

Create a real pending `scanTarget` operation A, cancel it, start B, settle A late, and assert that B remains cancellable. Use two valid independent UUID-v4 attempt IDs and inspect the actual `AbortSignal` objects passed through the transport seam.

```ts
const owner = createTargetedDiscoveryOwner();
const attemptA = owner.discover({
  transport,
  request: REQUEST,
  attempt: { ordinal: 1, isSuperseded: () => true },
  registerLifecycle: () => () => undefined,
});
await flush();
owner.cancel("cancel");
expect(signals[0]?.aborted).toBe(true);

const attemptB = owner.discover({
  transport,
  request: { ...REQUEST, attemptId: OTHER_ATTEMPT },
  attempt: { ordinal: 2, isSuperseded: () => false },
  registerLifecycle: () => () => undefined,
});
await flush();
rejecters[0]?.();
await attemptA;
expect(signals[1]?.aborted).toBe(false);
owner.cancel("teardown");
expect(signals[1]?.aborted).toBe(true);
rejecters[1]?.();
await attemptB;
```

- [ ] **Step 2: Run the direct test and verify the missing module is the failure**

Run: `pnpm test --project client src/monitor/targetedDiscovery.test.ts`

Expected: FAIL because `./targetedDiscovery` cannot be resolved. A selector refusal or environment failure is not this red result.

- [ ] **Step 3: Add the two-operation interface**

```ts
export type TargetedDiscoveryCancelSource = "cancel" | "teardown";

export type TargetedDiscoveryResult =
  | { kind: "found"; monitors: DiscoveredMonitor[] }
  | { kind: "failed"; error: ConnectedError };

export interface TargetedDiscoveryInput {
  transport: Transport;
  request: TargetedMonitorDiscoveryRequest;
  trace?: ConnectionAttemptTrace;
  attempt: { ordinal: number; isSuperseded(): boolean };
  registerLifecycle(
    callback: AppLifecycleCallback,
  ): AppLifecycleUnsubscribe | Promise<AppLifecycleUnsubscribe>;
}

export interface TargetedDiscoveryOwner {
  discover(input: TargetedDiscoveryInput): Promise<TargetedDiscoveryResult>;
  cancel(source: TargetedDiscoveryCancelSource): void;
}
```

`createTargetedDiscoveryOwner()` keeps `current: ActiveOperation | null`. Its `cancel` operation records the explicit source before aborting the current outer controller. Its `discover` operation validates the request and targeted capability before lifecycle or radio work, captures the connect ordinal, and clears `current` only under `if (current === operation)`.

- [ ] **Step 4: Fold foreground recovery into the owner**

Move the released recovery state machine behind `discover`: lifecycle registration, pass abort, foreground wait, exact-signal attribution, one replacement pass, retained hidden match, listener cleanup and terminal diagnostics. Replace callback parameters with the owner's captured request, operation, trace and attempt values.

The recovery predicate remains exact:

```ts
if (
  index !== 0 ||
  !backgroundAborted ||
  !(error instanceof Error) ||
  error.name !== "TargetScanInterruptedError" ||
  !("interruptedSignal" in error) ||
  error.interruptedSignal !== pass.signal
) {
  throw error;
}
```

Return `{ kind: "found", monitors: found }` only after event-derived
foreground readiness. A retained match waits only when this operation
observed the preceding background transition; neither production registrar
replays a transition from before registration. On failure, complete the
original trace and return
`{ kind: "failed", error: mapTargetedFailure(...) }`. Do not complete the
trace on success.

- [ ] **Step 5: Move connection-failure policy without changing it**

Move `ConnectedError`, `TARGETED_FAILURE_COPY`, `notAdvertisingDetail`, `mapRadioFailure` and `mapTargetedFailure` into `connectionFailure.ts`. Keep native error-name checks before browser message regexes, retain the restart-required manual-picker mapping for `ScanCleanupFailedError`, and keep the existing literal copy.

- [ ] **Step 6: Run the direct test green**

Run: `pnpm test --project client src/monitor/targetedDiscovery.test.ts`

Expected: PASS.

- [ ] **Step 7: Gate cleanup settlement and fresh refusal values**

Add direct tests which prove a successful scan followed by a throwing
lifecycle unsubscribe returns the released targeted failure union, completes
the trace once, and makes a later `cancel()` a no-op for the settled pass. A
second test mutates the first invalid-request result and requires the next
invalid request to retain the released `transport-missing` copy. Refusal tests
also observe lifecycle registration and radio calls, proving invalid input and
missing targeted capability return before either begins.

- [ ] **Step 8: Mutate the deciding guards**

Temporarily replace `if (current === operation) current = null;` with `current = null;`, run the direct test, and require the assertion `expect(signals[1]?.aborted).toBe(true)` to fail after A settles late. Restore the identity guard and rerun the same command to PASS.

Temporarily swallow the unsubscribe exception and require the cleanup test to
fail its returned union. Temporarily return one module-scoped refusal object
and require the freshness test to fail after the first caller mutates it.
Temporarily register lifecycle before request/capability validation and require
both refusal tests to fail their zero-registration assertion. Restore all
mutants and rerun the direct test to PASS.

### Task 2: Route the session hook through the owner

**Files:**

- Modify: `app/src/monitor/useMonitorSession.ts`
- Test: `app/src/monitor/nfcScanDiagnostics.test.tsx`
- Test: `app/src/monitor/useMonitorSession.test.ts`
- Test: `app/src/monitor/transports/capacitorBle.test.ts`

**Interfaces:**

- Consumes: `createTargetedDiscoveryOwner`, `TargetedDiscoveryResult`, and `mapRadioFailure`.
- Produces: the existing `useMonitorSession` interface and re-exported `ConnectedError` type, unchanged for callers.

- [ ] **Step 1: Create one owner for the hook lifetime**

```ts
const attemptRef = useRef(0);
const [targetedDiscovery] = useState(createTargetedDiscoveryOwner);
```

Do not pass React refs through the state initializer. The accepted connect supplies its ordinal, supersession closure and current lifecycle registrar to `discover`.

- [ ] **Step 2: Replace the targeted branch**

```ts
const result = await targetedDiscovery.discover({
  transport,
  request: discovery,
  trace,
  attempt: { ordinal: attempt, isSuperseded: superseded },
  registerLifecycle:
    depsRef.current.registerAppLifecycleListener ??
    registerAppLifecycleListener,
});
if (result.kind === "failed") {
  if (superseded()) {
    bestEffort(transport.disconnect());
    return;
  }
  connectingRef.current = false;
  fail(result.error);
  bestEffort(transport.disconnect());
  return;
}
found = result.monitors;
```

Leave the existing common supersession check, transport disposal, GATT and session/log creation after this branch.

- [ ] **Step 3: Route teardown and Cancel to the owner**

Immediately after incrementing the whole-connect epoch in teardown, call `targetedDiscovery.cancel(source)`. Keep the existing order: epoch first, synchronous targeted abort second, driver/session cleanup after that.

- [ ] **Step 4: Run the producer-to-consumer gates**

Run:

```bash
pnpm test --project client src/monitor/targetedDiscovery.test.ts src/monitor/nfcScanDiagnostics.test.tsx src/monitor/useMonitorSession.test.ts
pnpm test --project client src/monitor/transports/capacitorBle.test.ts
```

Expected: PASS. Existing React `act(...)` warnings in the large session file are known test output; new failures or warnings attributable to this refactor are not accepted.

- [ ] **Step 5: Sweep stale implementation references**

Run:

```bash
rg -n "scanWithForegroundRecovery|targetedAbortRef" app/src docs/design
```

Expected: no current-state production or design hit. Historical plans and audits may retain their original names.

### Task 3: Verify the behavior-preserving refactor

**Files:**

- Modify: `docs/superpowers/specs/2026-09-17-targeted-discovery-module-design.md`
- Create: `docs/superpowers/plans/2026-09-17-targeted-discovery-module.md`

**Interfaces:**

- Consumes: the completed owner and unchanged hook behavior.
- Produces: reviewable proof that the chosen seam is deeper and behavior preserving.

- [ ] **Step 1: Run static gates serially through the resource controller**

Run each only after the prior command exits:

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
pnpm dist:grep
```

Expected: PASS for every command. Resource refusal or signal termination is not a gate result and must not be retried automatically.

- [ ] **Step 2: Run the named local browser gate**

Run:

```bash
pnpm e2e e2e/connected.spec.ts e2e/justrow.spec.ts --grep "Phase NF: Scan NFC|Just Row: Scan NFC"
```

Expected: PASS for both named NFC describes against the worktree's real
compose stack. Before merge, require the hosted e2e job whose `headSha`
equals the branch's exact current head and whose conclusion is `success`.

- [ ] **Step 3: Check the deletion test and scope**

Confirm that deleting `targetedDiscovery.ts` forces request validation, controller ownership, cancellation source, foreground recovery, trace decoration, terminal diagnostics and identity cleanup back into `useMonitorSession`. Confirm no native adapter, rower copy, stored shape, permission or GATT behavior changed.

- [ ] **Step 4: Commit from the worktree**

Run `git rev-parse --show-toplevel` and require the targeted-discovery
worktree path before committing. Stage the implementation, tests, spec and
plan; inspect `git diff --cached` before choosing a commit message that
describes the staged diff. The approved roadmap row is already in its own
commit.

- [ ] **Step 5: Push the committed review head through the full protection union**

Push the review branch with:

```bash
pnpm push:full -u origin codex/targeted-discovery
```

This supplies the full unit/client request to the real pre-push hook for the
committed branch head. CI remains authoritative for full coverage and hosted
browser execution.

- [ ] **Step 6: Verify hosted CI belongs to the pushed commit**

Compare `git rev-parse HEAD` with:

```bash
gh run list --branch codex/targeted-discovery --limit 1 --json headSha,conclusion
```

The run must exist, `headSha` must equal the committed local head, and
`conclusion` must be `success` before any merge approval request.
