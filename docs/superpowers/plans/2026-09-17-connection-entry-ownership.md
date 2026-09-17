# Connection Entry Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace screen-owned NFC/manual request, trace, retry, Cancel and route-loss coordination with one opaque connection-entry attempt while closing the late-Cancel poisoning race.

**Architecture:** `useConnectionEntry()` owns entry resolution and offers a single opaque `ConnectionEntryAttempt`; callers claim it without receiving the discovery request, trace or attempt ID. The attempt projects its private request and trace into the existing `MonitorSession.connect(request, trace)` and `cancel()` methods, while `useConnectionEntryLifetime()` applies the existing identity-bound StrictMode lease at the rendered ownership surface.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, existing NFC reader, handoff store, mount lease and monitor session modules.

**Spec:** `docs/superpowers/specs/2026-09-17-connection-entry-ownership-design.md`

## Global Constraints

- Preserve released behavior from `a4413359` (`v0.50.5`) except for the accepted Cancel drain barrier, Just Row route-loss discard and claimed-abandonment trace publication.
- Change no rower-facing copy, timeout, retry eligibility, radio call, compilation rule, authorization acceptance point, stored shape or diagnostic vocabulary.
- Keep `useMonitorSession`'s public and implementation interface unchanged: `connect(request?, trace?)` and `cancel()` remain the low-level operations.
- Manual `begin` must invoke `onReady` synchronously from the current `ConnectAction` press continuation.
- A claimed, retryable or draining attempt refuses a later `begin`; it discards only the later attempt's staged authorization and never replaces the live attempt.
- Cancel enters `draining` synchronously, calls the bound session once, abandons authorization after the session's synchronous retirement prefix, and keeps `busy` true until the captured Cancel promise settles.
- Nothing queues behind Cancel. The rower must make a fresh hardware press after drain settlement.
- Attempt request, trace and ID are immutable across retries and are never exposed to screen code.
- The first accepted attempt operation binds one stable `connect`/`cancel` method pair. Calls with a different pair perform no work.
- Concurrent attempt `connect` calls return the exact same attempt-level promise object.
- Use the existing mount-lease microtask heuristic and gate its actual behavior under the pinned React runtime; do not claim a React scheduling guarantee.
- Run every `pnpm` command from `app/`.

## File Structure

- Create `app/src/monitor/connectionEntry.ts`: the public opaque interface, attempt owner, NFC integration, session projection, trace publication tracking and React lifetime hooks.
- Create `app/src/monitor/connectionEntry.test.tsx`: direct tests through the same public interface used by screens.
- Delete `app/src/monitor/nfc/useNfcEntry.ts` and `app/src/monitor/nfc/useNfcEntry.test.tsx` after both production callers have moved to the deeper module.
- Modify `app/src/workout/WorkoutDetail.tsx`: resolve an offer, compile before claim, and retain only the opaque attempt.
- Modify `app/src/workout/ConnectedInterstitial.tsx`: accept one attempt and invoke only its `connect`, `cancel`, `targetName` and lifetime interface.
- Modify `app/src/justrow/JustRow.tsx`: retain one attempt and route initial connect, retry and Cancel through it.
- Modify `app/src/workout/WorkoutDetail.nfc.test.tsx`, `app/src/workout/ConnectedInterstitial.test.tsx`, `app/src/workout/WorkoutDetail.connectedEnd.test.tsx`, `app/src/workout/ConnectedSurface.test.tsx`, `app/src/justrow/JustRow.nfc.test.tsx` and the focused Just Row tests whose fixtures instantiate the changed interstitial/entry interface.
- Create `app/src/monitor/connectionEntryBoundary.test.ts`: pin the screen-facing seam and prevent direct request, trace, store or mount-lease ownership from returning.
- Update current-state ownership prose in `docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md`; retain dated walk evidence unchanged.

## Proof Contract

1. **Production invariant:** only the current entry operation may offer, connect, cancel, abandon, publish or clear itself; a late predecessor cannot mutate its successor.
2. **Supported producers:** `ConnectAction` produces manual or NFC intents for Workout Detail and Just Row; both cross the same `ConnectionEntry.begin` seam.
3. **Independent observables:** bound session method calls, exact promise identity, `entry.busy`, keyed staged authorization, targeted fake-transport requests and the exported connection-attempt trace.
4. **Deciding-source mutations:** remint retry identity, return a new concurrent promise, release `busy` before Cancel settles, permit claimed replacement, remove identity-checked finalization, commit mount loss immediately, or restore direct screen `session.connect` ownership; the named direct, routed or source test must fail.
5. **Strongest conclusion:** desk tests establish application ownership and late-continuation ordering through the existing radio seams. They do not establish the affected phone's radio state or the cause of the original incident.

---

### Task 1: Build the opaque connection-entry module

**Files:**

- Create: `app/src/monitor/connectionEntry.ts`
- Create: `app/src/monitor/connectionEntry.test.tsx`

**Interfaces:**

- Consumes: `ConnectionEntryIntent`, `MonitorSession.connect`, `MonitorSession.cancel`, the NFC reader/attempt modules, `handoffStore.discardStagedRetire`, `mountLease` and `ConnectionAttemptTrace`.
- Produces: `ConnectionEntryOffer`, `ConnectionEntryAttempt`, `ConnectionEntry`, `useConnectionEntry()` and `useConnectionEntryLifetime(attempt)`.

- [ ] **Step 1: Copy the released capability and NFC terminal cases to the new public hook test**

Create `connectionEntry.test.tsx` from the existing `useNfcEntry.test.tsx` fixtures, import `useConnectionEntry`, and replace each `run(attemptId, { onTarget, onInlineError })` call with `begin({ kind: "nfc", attemptId }, { onReady, onInlineError })`. In a target case, claim inside `onReady`; in quiet/error cases, assert no offer. Preserve the existing assertions for listener-registration failure, capability timeout, mid-read unmount, trace kinds, keyed discard and restored controls. Leave the released hook and its tests in place until Just Row, its final caller, migrates in Task 3; this keeps every intermediate commit buildable.

- [ ] **Step 2: Add the direct transfer contract before implementation**

Add tests with two independent valid UUID-v4 attempt IDs. The manual case must call `onReady` before `begin` returns, expose `targetName === null`, and abandon when the callback returns unclaimed. The NFC case must offer the exact decoded target only after the accepted paint barrier. Add throw-before-claim and throw-after-claim cases; both must discard the matching staged authorization, and the latter's returned handle must refuse `connect`.

```ts
const captured: { offer?: ConnectionEntryOffer } = {};
entry.begin(MANUAL_INTENT, {
  onReady: (offer) => {
    captured.offer = offer;
  },
  onInlineError: vi.fn(),
});
expect(captured.offer).toBeDefined();
expect(stagedRetireAttemptId()).toBeNull();
const inert = captured.offer!.claim();
await inert.connect(session);
expect(session.connect).not.toHaveBeenCalled();
```

- [ ] **Step 3: Run the new direct test and verify the missing module is the red result**

Run: `pnpm test --project client src/monitor/connectionEntry.test.tsx`

Expected: FAIL because `./connectionEntry` cannot be resolved. A selector refusal or test-environment failure is not this red result.

- [ ] **Step 4: Define the screen-facing interface exactly once**

```ts
export interface ConnectionEntryOffer {
  claim(): ConnectionEntryAttempt;
}

export interface ConnectionEntryAttempt {
  readonly targetName: string | null;
  connect(session: Pick<MonitorSession, "connect" | "cancel">): Promise<void>;
  cancel(session: Pick<MonitorSession, "connect" | "cancel">): Promise<void>;
}

export interface ConnectionEntry {
  capability: NfcCapabilityState;
  busy: boolean;
  accepted: boolean;
  begin(
    intent: ConnectionEntryIntent,
    sinks: {
      onReady(offer: ConnectionEntryOffer): void;
      onInlineError(copy: NfcInlineCopy): void;
    },
  ): void;
}
```

Move `NfcCapabilityState`, `NFC_CAPABILITY_DEADLINE_MS`, `useNfcCapability` and the released reader/lifecycle/paint behavior into this module without changing their deadlines, trace kinds or copy.

- [ ] **Step 5: Implement total offer transfer and current-operation identity**

Create one operation object per accepted `begin`, store it in `currentRef`, and make every completion clear it only under `currentRef.current === operation`. Construct one offer-owned attempt object before invoking `onReady`. `claim()` returns that same object on every call. In a `finally` around `onReady`, abandon when the callback returned unclaimed or threw; NFC maps the throw through the released stopped-copy path, while manual entry rethrows after cleanup.

When `begin(B)` sees any resolving, claimed, retryable or draining A, call `discardStagedRetire(B.attemptId)` and return without changing A. Manual delivery stays in the same synchronous call. NFC retains the current asynchronous reader path and its accepted paint.

- [ ] **Step 6: Add session binding, retry and single-flight tests**

Claim one manual and one targeted attempt. For each, assert the first `connect(session)` passes the same private request object on every settled retry and the same trace object on targeted retry. Hold the first session promise and assert `p1 === p2` for two concurrent calls. Pass a second object with different `connect` or `cancel` method identity and assert no second collaborator method runs.

```ts
const p1 = attempt.connect(session);
const p2 = attempt.connect(session);
expect(p2).toBe(p1);
expect(session.connect).toHaveBeenCalledTimes(1);
releaseConnect();
await p1;
await attempt.connect(session);
expect(vi.mocked(session.connect).mock.calls[1]?.[0]).toBe(
  vi.mocked(session.connect).mock.calls[0]?.[0],
);
```

- [ ] **Step 7: Implement the attempt without an `async` public method wrapper**

Keep private `request`, optional owned trace wrapper, hidden attempt ID, lifecycle state, bound method pair, `connectPromise` and `cancelPromise` in module-private operation state. `connect()` must return the retained promise directly; declaring the public method `async` would wrap it and break exact identity. Its identity-checked `finally` clears only the matching `connectPromise`. After settlement, a new call reuses the same request and trace.

Bind `session.connect` and `session.cancel` together on the first accepted operation. A later pair mismatch returns `Promise.reject(new Error("connection entry session mismatch"))` without invoking either pair, and the direct test awaits that rejection. An abandoned or draining attempt returns `Promise.resolve()` before radio work.

- [ ] **Step 8: Add and implement the Cancel drain contract**

Test that `cancel(session)` sets `entry.busy` before `session.cancel()` returns, calls it once, immediately discards the matching staged authorization after the mock's synchronous prefix, refuses `connect` and `begin(B)`, and returns the same promise on repeat. Hold both a prior connect and Cancel; `busy` must clear only after the Cancel continuation and all captured attempt work settle. After settlement, a fresh B may begin.

Implementation order is fixed:

1. validate/bind the method pair;
2. transition the attempt to `draining` and publish `busy: true` synchronously;
3. invoke `session.cancel()` exactly once;
4. immediately call `discardStagedRetire(attemptId)`;
5. retain one attempt-level promise that waits for Cancel and captured connect settlement;
6. publish a final dirty trace, then identity-clear current operation and `busy` in its finalizer.

- [ ] **Step 9: Add and implement lifetime ownership**

Use a module-private `WeakMap<ConnectionEntryAttempt, AttemptPrivate>` so `useConnectionEntryLifetime` can reach the hidden ID and identity-checked abandon operation without enlarging the public interface. Its effect registers `onMountLeaseLost`, claims the lease, and releases it in cleanup.

Add a StrictMode setup/cleanup/setup test that retains the staged authorization and a true-detach test that discards it. Add an owner-unmount test that claims during `onReady` and unmounts before a conditional child can install `useConnectionEntryLifetime`; the hook's own mount effect cleanup must abandon the current claimed attempt.

- [ ] **Step 10: Track trace publication at the owner**

Wrap the NFC trace so its `complete()` delegates to the existing trace and records the published entry count. On claimed abandonment, wait for captured connect/Cancel promises, then call `complete()` only when `entries().length` exceeds that count. Add a test that reaches targeted handoff, appends cleanup entries during a held connect/Cancel, abandons, and observes one enlarged final snapshot only after settlement.

- [ ] **Step 11: Run the direct module gate and bite the identity mutations**

Run: `pnpm test --project client src/monitor/connectionEntry.test.tsx`

Expected: PASS.

Temporarily make current-operation cleanup unconditional and require late A settlement to clear B in the direct test. Restore the identity check. Temporarily return `session.connect(...).finally(...)` on every concurrent call and require the `p1 === p2` assertion to fail. Restore the retained promise. Temporarily clear `busy` before Cancel settlement and require the drain test to fail. Restore all mutants and rerun the direct gate to PASS.

- [ ] **Step 12: Commit the deep module**

Run `git rev-parse --show-toplevel` and require the connection-entry worktree path. Stage only the new module and direct test, inspect `git diff --cached`, then commit with `feat: own connection entry attempts`.

### Task 2: Transfer the programmed connection route

**Files:**

- Modify: `app/src/workout/WorkoutDetail.tsx`
- Modify: `app/src/workout/WorkoutDetail.nfc.test.tsx`
- Modify: `app/src/workout/WorkoutDetail.connectedEnd.test.tsx`
- Modify: `app/src/workout/ConnectedInterstitial.tsx`
- Modify: `app/src/workout/ConnectedInterstitial.test.tsx`
- Modify: `app/src/workout/ConnectedSurface.test.tsx`

**Interfaces:**

- Consumes: `useConnectionEntry()`, `ConnectionEntryOffer`, `ConnectionEntryAttempt`, `useConnectionEntryLifetime(attempt)` and the existing `MonitorSession` object.
- Produces: Workout Detail state containing its compiled program metadata plus one opaque attempt, and an interstitial that consumes only that attempt for entry connect/Cancel/lifetime behavior.

- [ ] **Step 1: Change the routed tests before the screen**

Keep the existing presence, busy, foreground-abort, unmount, native-shaped NFC-to-armed and keyed-authorization assertions. Add a compile-rejection assertion that the offered attempt remains unclaimed and the exact staged authorization is discarded. Add a route-loss case immediately after claim and before the interstitial lifetime effect commits; unmount Workout Detail and assert keyed discard.

Update `WorkoutDetail.connectedEnd.test.tsx`'s captured prop expectation from raw `request`/`trace` fields to one `attempt` field without inspecting its hidden state.

- [ ] **Step 2: Run the focused detail tests red**

Run:

```bash
pnpm test --project client \
  src/workout/WorkoutDetail.nfc.test.tsx \
  src/workout/WorkoutDetail.connectedEnd.test.tsx
```

Expected: FAIL on the old raw request/trace handoff and the missing owner-level route-loss behavior.

- [ ] **Step 3: Replace request/trace state with the opaque attempt**

Call `entry.begin(intent, sinks)` from the existing `ConnectAction.onProceed`. In `onReady`, compile first. On compile failure, set the existing compile-error copy and return without claiming. On success, call `offer.claim()` once and store that attempt beside the existing program, phases, identity, baselines and nudge count.

Pass `entry.capability`, `entry.busy` and `entry.accepted` to `ConnectAction`. Remove `discardStagedRetire`, `useNfcEntry`, `MonitorDiscoveryRequest` and `ConnectionAttemptTrace` imports from this screen.

- [ ] **Step 4: Run the detail gates and isolate the remaining prop migration**

Run the Task 2 command again.

Expected: the new entry/compile assertions pass, with the remaining failure limited to `ConnectedInterstitial` still requiring raw `request`/`trace` props. A reader, parser, store or compilation failure is not this expected red result.

- [ ] **Step 5: Replace interstitial fixtures with attempt doubles**

Add one test helper that creates an opaque-shaped attempt double with `targetName`, `connect` and `cancel` spies. The default helper delegates the spies to the supplied session so rendering tests preserve their existing phase fixtures. Targeted tests use `targetName: "PM5 432331249 Row"`; picker tests use `null`.

Change `ConnectedSurface.test.tsx`'s direct interstitial construction to pass the helper attempt. Keep raw requests only inside the helper's private test implementation when an assertion needs to inspect session delegation.

- [ ] **Step 6: Add consumer-only assertions and run red**

Assert mount invokes `attempt.connect(session)`, Try Again invokes the same attempt again, Cancel and Row Instead invoke `attempt.cancel(session)`, and target copy renders from `attempt.targetName`. Assert the interstitial itself never calls mocked `session.connect` or `session.cancel` when the attempt spies are nondelegating.

Run: `pnpm test --project client src/workout/ConnectedInterstitial.test.tsx src/workout/ConnectedSurface.test.tsx`

Expected: FAIL because the current component still owns request, trace, session calls and the mount lease.

- [ ] **Step 7: Narrow `ConnectedInterstitialProps` and migrate operations**

Replace `request` and `trace` with `attempt: ConnectionEntryAttempt`. Call `useConnectionEntryLifetime(attempt)`. On mount call `attempt.connect(session)`. Derive targeted picker copy from `attempt.targetName`. Route every interstitial Cancel/Row Instead action through `attempt.cancel(session)`. Route Try Again through `attempt.connect(session)` while retaining the existing `retryingRef` double-click guard and programming-device reset.

Remove direct imports of `handoffStore`, `mountLease`, `MonitorDiscoveryRequest` and `ConnectionAttemptTrace`. Keep `useMonitorSession(deps)`, all program/session effects, copy and rendering unchanged.

- [ ] **Step 8: Run the programmed-route gates green**

Run:

```bash
pnpm test --project client \
  src/workout/WorkoutDetail.nfc.test.tsx \
  src/workout/WorkoutDetail.connectedEnd.test.tsx \
  src/workout/ConnectedInterstitial.test.tsx \
  src/workout/ConnectedSurface.test.tsx
```

Expected: PASS, including the complete routed NFC-to-real-session proof.

- [ ] **Step 9: Commit the programmed-route transfer**

Run `git rev-parse --show-toplevel`, stage all six Task 2 files, inspect `git diff --cached`, and commit with `refactor: connect through opaque entry attempt`.

### Task 3: Transfer Just Row and close late-Cancel poisoning

**Files:**

- Modify: `app/src/justrow/JustRow.tsx`
- Modify: `app/src/justrow/JustRow.nfc.test.tsx`
- Modify: `app/src/justrow/JustRow.test.tsx`
- Modify: `app/src/justrow/JustRowRefusal.test.tsx`
- Delete: `app/src/monitor/nfc/useNfcEntry.ts`
- Delete: `app/src/monitor/nfc/useNfcEntry.test.tsx`

**Interfaces:**

- Consumes: `useConnectionEntry()`, `ConnectionEntryAttempt`, `useConnectionEntryLifetime(attempt)` and one existing `MonitorSession`.
- Produces: the existing Just Row door, connection/error/ready/live screens and phone-timer path, with hardware entry disabled throughout an old Cancel drain.

- [ ] **Step 1: Add the real-session Cancel-drain regression first**

Extend `JustRow.nfc.test.tsx` with a routed manual connection through the real `useMonitorSession` and injected fake transport. Reach Ready, call `window.__pm5FakeControls__.pause("write")`, press Cancel, and assert the door returns with Scan NFC and Connect disabled and `aria-busy="true"`. Attempt a second click and assert no new fake transport, targeted request or staged authorization appears. Resume the held write, wait for both hardware buttons to enable, make a fresh press, then prove the new connection survives all late A continuations and reaches its expected card/ready state.

```ts
const oldFake = window.__pm5FakeControls__!;
oldFake.pause("write");
await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
expect(stagedRetireAttemptId()).toBeNull();
oldFake.resume("write");
await waitFor(() =>
  expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled(),
);
await userEvent.click(screen.getByRole("button", { name: "Connect" }));
await waitFor(() => expect(window.__pm5FakeControls__).not.toBe(oldFake));
```

- [ ] **Step 2: Run the routed test and verify it exposes the current race**

Run: `pnpm test --project client src/justrow/JustRow.nfc.test.tsx`

Expected: FAIL because the current Cancel returns an enabled door before the paused terminate/write settles.

- [ ] **Step 3: Replace raw retry state with one opaque attempt**

Replace `lastRequestRef`, `lookingFor`, `mintAttemptId`, request and trace imports with `const entry = useConnectionEntry()` and `ConnectionEntryAttempt | null` state. In `entry.begin`'s `onReady`, claim immediately, store the attempt, set `started`, and call `attempt.connect(session)` inside the same press continuation. Retry calls the same attempt. Render targeted copy from `attempt.targetName`.

Call `useConnectionEntryLifetime(started ? attempt : null)` unconditionally at hook level. Pass `entry.capability`, `entry.busy` and `entry.accepted` to `ConnectAction`.

- [ ] **Step 4: Route every pre-row Cancel through the attempt**

In failed, lost, undecodable and connecting/ready pre-row branches, replace the fire-and-forget `session.cancel()` paired with `setStarted(false)` by `attempt?.cancel(session)` before restoring the door. Preserve direct session End behavior once a run is owned by `ConnectedSurface`; that is session termination, not connection-entry Cancel.

The attempt's synchronous `draining` transition must occur before `setStarted(false)` renders the door, so `entry.busy` disables both hardware actions until the retained Cancel promise settles. Clear the local attempt only after drain settlement or when a terminal route leaves the screen; do not clear it before the lifetime hook has the identity it must release.

Handle the promise returned by `finally` so a rejected session Cancel does not become an unhandled rejection:

```ts
const current = attempt;
const drain = current?.cancel(session) ?? Promise.resolve();
setStarted(false);
void drain
  .finally(() => {
    setAttempt((value) => (value === current ? null : value));
  })
  .catch(() => undefined);
```

- [ ] **Step 5: Delete the superseded NFC entry hook and run all focused Just Row gates green**

Delete `useNfcEntry.ts` and its superseded direct test after confirming `rg -n "useNfcEntry" app/src` has no production caller. Then run:

```bash
pnpm test --project client \
  src/justrow/JustRow.nfc.test.tsx \
  src/justrow/JustRow.test.tsx \
  src/justrow/JustRowRefusal.test.tsx
```

Expected: PASS, including the routed held-terminate regression and exact-target retry.

- [ ] **Step 6: Bite the drain barrier**

Temporarily clear entry `busy` when Cancel starts rather than when it settles. Run the routed Cancel-drain test and require its enabled-button assertion or successor-survival assertion to fail. Restore settlement-gated release and rerun the Task 3 command to PASS.

- [ ] **Step 7: Commit the Just Row transfer**

Run `git rev-parse --show-toplevel`, stage the four Just Row files and the two deleted NFC-hook files, inspect `git diff --cached`, and commit with `fix: drain connection cancel before reentry`.

### Task 4: Pin the seam, update current-state docs and verify

**Files:**

- Create: `app/src/monitor/connectionEntryBoundary.test.ts`
- Modify: `docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md`
- Modify: `docs/superpowers/specs/2026-09-17-connection-entry-ownership-design.md`
- Modify: `docs/superpowers/plans/2026-09-17-connection-entry-ownership.md`

**Interfaces:**

- Consumes: the completed connection-entry module and migrated production callers.
- Produces: a structural regression gate and reviewable proof that the accepted seam is complete.

- [ ] **Step 1: Add the source boundary test**

Read the three production callers as source text. Require `WorkoutDetail.tsx` and `JustRow.tsx` to import `useConnectionEntry`; require `ConnectedInterstitial.tsx` and `JustRow.tsx` to use `useConnectionEntryLifetime`. Independently forbid `MonitorDiscoveryRequest`, `ConnectionAttemptTrace`, `discardStagedRetire`, `claimMountLease`, `onMountLeaseLost`, `session.connect(` and `session.cancel(` in `WorkoutDetail.tsx`, `ConnectedInterstitial.tsx` and `JustRow.tsx`.

Allow direct session End/program/free-row operations; the gate is specific to entry connect/Cancel ownership.

- [ ] **Step 2: Run the complete focused client gate**

Run:

```bash
pnpm test --project client \
  src/monitor/connectionEntry.test.tsx \
  src/monitor/connectionEntryBoundary.test.ts \
  src/monitor/targetedDiscovery.test.ts \
  src/workout/WorkoutDetail.nfc.test.tsx \
  src/workout/ConnectedInterstitial.test.tsx \
  src/workout/WorkoutDetail.connectedEnd.test.tsx \
  src/workout/ConnectedSurface.test.tsx \
  src/justrow/JustRow.nfc.test.tsx \
  src/justrow/JustRow.test.tsx \
  src/justrow/JustRowRefusal.test.tsx
```

Expected: PASS. Existing React `act(...)` warnings in established large suites are known output; new warnings attributable to this refactor are not accepted.

- [ ] **Step 3: Update only current-state architecture prose**

In the Phase NF design, replace present-tense claims that screens carry request/trace pairs or that only the interstitial owns a mount lease. State that the connection-entry module owns the opaque attempt and both supported doors declare lifetime through it. Preserve dated walk records, historical findings and released evidence as written.

Update the accepted Candidate 02 spec only if implementation selected an allowed internal split; keep its public interface and behavior contract unchanged.

- [ ] **Step 4: Run static gates serially through the resource controller**

Run each only after the previous command exits:

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
pnpm dist:grep
```

Expected: PASS for every command. Resource refusal or signal termination is not a test result and must not be retried automatically.

- [ ] **Step 5: Run the named local browser gate**

Run:

```bash
pnpm e2e e2e/connected.spec.ts e2e/justrow.spec.ts \
  --grep "Phase NF: Scan NFC|Just Row: Scan NFC"
```

Expected: PASS for both shipped NFC flows against the worktree's real compose stack.

- [ ] **Step 6: Check deletion depth and final scope**

Confirm deleting `connectionEntry.ts` would force offer transfer, request/trace identity, exact retry, session binding, Cancel drain, keyed abandonment, trace publication and StrictMode-safe route loss back into both callers. Confirm `useMonitorSession.ts`, native adapters, copy, stored shapes, permissions, timers and workout protocol are unchanged.

- [ ] **Step 7: Commit the proof head**

Run `git rev-parse --show-toplevel` and require the connection-entry worktree path. Stage the source gate, current-state docs and any implementation formatting corrections; inspect `git diff --cached`; commit with `test: pin connection entry ownership`.

- [ ] **Step 8: Push the exact committed head through full protection**

Push with:

```bash
pnpm push:full -u origin codex/connection-entry-ownership
```

This sends the full unit/client request through the real pre-push hook. CI remains authoritative for full coverage and hosted browser execution.

- [ ] **Step 9: Verify hosted CI belongs to the pushed commit**

Compare `git rev-parse HEAD` with:

```bash
gh run list --branch codex/connection-entry-ownership \
  --limit 1 --json headSha,conclusion,url
```

Require exact `headSha` equality and `conclusion: "success"`. A green run for an earlier commit is not evidence for the review head.

- [ ] **Step 10: Review, merge and release only after the existing approval gates**

Run the repository's code-review workflow against the fixed merge base, resolve all blocking findings, and repeat focused/static gates only when edits make them relevant. Create or update the PR with the final problem/behavior description. Merge only under James's existing explicit merge authorization and only after the required checks on the exact PR head are green; then follow the repository's release workflow for the merged commit.
