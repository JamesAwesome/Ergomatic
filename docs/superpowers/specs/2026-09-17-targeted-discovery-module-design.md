# Deepen targeted monitor discovery

## What and why

The NFC-to-Bluetooth path works, but its pre-GATT connection attempt is split
between `useMonitorSession` and `scanWithForegroundRecovery`. The session hook
must assemble cancellation ownership, foreground recovery, trace decoration,
terminal diagnostics and targeted failure mapping before it can ask for one
monitor. Concentrate that behavior behind one targeted-discovery interface
without changing which attempt succeeds, fails, retries or gets cancelled.

James selected this architecture candidate on 2026-09-17 and approved a
behavior-preserving refactor. Connection-entry ownership is separate work and
is deferred until post-production in `ROADMAP.md`.

Baseline: released commit `dd8dbdee41cdc58502f17701ab086b060956543d`
(`v0.50.4`). This spec changes no rower-facing copy, timer, radio call, retry
count, stored shape, authentication rule or platform permission.

## Existing seam and friction

The targeted branch currently validates the request and capability, creates an
operation controller, owns the first cancellation source, scopes two diagnostic
ordinals, maps the terminal outcome, completes a failed trace and clears the
controller by identity in `app/src/monitor/useMonitorSession.ts:5330-5403`.
`scanWithForegroundRecovery` then owns lifecycle registration, pass abort,
foreground waiting and the sole recovery, but exposes six dependency concepts
back to that caller, including `cancelSource`, `scan`, `trace` and `finished`
(`app/src/monitor/nfc/scanWithForegroundRecovery.ts:11-25`).

That is one operation with two owners. Deleting the recovery helper would put
its state machine back in the hook; keeping it unchanged leaves the hook with
the ordering and lifetime obligations this refactor exists to remove. The new
module earns its keep only if deletion recreates both sets of obligations in
the caller.

The surrounding seams already have depth and stay in place:

- `Transport` carries raw discovery/connect/byte operations, while
  `TargetedScanTransport` is a separate fail-closed capability
  (`app/domain/monitor/types.ts:664-755`). Native, fake and replay adapters
  genuinely vary there.
- Capacitor BLE owns the process-wide operation tail and poison state
  (`app/src/monitor/transports/capacitorBle.ts:234-251`). Those lifetimes must
  not become per-attempt state.
- The session hook's epoch spans asynchronous transport creation, discovery and
  GATT (`app/src/monitor/useMonitorSession.ts:5208-5213`, `:5301-5309`,
  `:5422-5429`). Targeted discovery is not authoritative for that wider
  lifetime.
- Session identity begins only after successful GATT beside its new log
  (`app/src/monitor/useMonitorSession.ts:5455-5476`). Discovery cannot mint or
  clear it.

## Considered interfaces

Three different interfaces were compared under the codebase-design deletion
test.

1. A single `discoverTargetedMonitor(input)` function has the smallest method
   count, but leaves the controller ref, cancel-source lifetime and
   identity-safe cleanup in the hook. Its input object remains nearly as
   complicated as today's split implementation.
2. A prepared operation with request-dispatched pass adapters is flexible, but
   retains caller-provided terminal diagnostic callbacks and adds an adapter
   seam for a use case that does not vary in production.
3. A React `useTargetedDiscovery` hook gives the current caller a small surface,
   but couples transport/lifecycle policy to React and exposes a mutable React
   ref as the whole-connect authority.

The chosen interface keeps the useful part of the third design without its
React coupling: a non-React owner created once by the session hook. It has two
operations, `discover` and `cancel`, and owns the current operation internally.

## Chosen interface

`app/src/monitor/targetedDiscovery.ts` exports this conceptual interface:

```ts
export type TargetedDiscoveryCancelSource = "cancel" | "teardown";

export type TargetedDiscoveryResult =
  | { kind: "found"; monitors: DiscoveredMonitor[] }
  | { kind: "failed"; error: ConnectedError };

export interface TargetedDiscoveryOwner {
  discover(input: {
    transport: Transport;
    request: TargetedMonitorDiscoveryRequest;
    trace?: ConnectionAttemptTrace;
  }): Promise<TargetedDiscoveryResult>;
  cancel(source: TargetedDiscoveryCancelSource): void;
}

export function createTargetedDiscoveryOwner(deps: {
  registerLifecycle(
    callback: AppLifecycleCallback,
  ): AppLifecycleUnsubscribe | Promise<AppLifecycleUnsubscribe>;
  readConnectEpoch(): number;
}): TargetedDiscoveryOwner;
```

The caller creates one owner for the hook lifetime. `readConnectEpoch` reads the
existing `attemptRef`; the module never increments it. `discover` captures that
value as the existing `connect=N` ordinal and compares it again only for the
existing `superseded=true|false` diagnostic. The session hook remains the sole
authority for whether a result may advance to GATT.

`cancel` synchronously claims the current operation's first explicit source,
aborts its active pass and wakes a foreground wait. It is a no-op with no active
operation. A late operation A may settle after B starts; A clears the owner's
current slot only when that slot still identifies A. Native callbacks retain
their captured trace even after the higher operation settles.

`discover` returns existing `ConnectedError` values for expected refusal and
failure. It does not mutate UI state or dispose the transport. The hook handles
the returned union, repeats its existing whole-connect supersession check, and
owns `fail(...)` plus `transport.disconnect()`.

## Failure vocabulary

Move the `ConnectedError` type plus existing radio and targeted classifiers
from `useMonitorSession.ts` into
`app/src/monitor/connectionFailure.ts`. Re-export `ConnectedError` from
`useMonitorSession.ts` so current consumers retain the same import path.
`mapProgramFailure` remains in the hook; it imports the shared type.

This is a move of the existing vocabulary, copy, lookup and fallback ordering.
It does not add a reason or change how an unknown error is classified
(`app/src/monitor/useMonitorSession.ts:1680-1792`). Both the owner and the
manual picker use the same radio classifier, so neither duplicates failure
policy.

Invalid targeted requests and transports without `scanTarget` return the
existing `transport-missing` error before lifecycle registration or radio work.
They never fall back to `scan()` or open a picker. Transport-side runtime
validation remains as defense in depth.

## Behavior contract

The refactor preserves these released invariants:

1. One accepted connection attempt owns one targeted discovery operation.
   `connectingRef` still prevents a second accepted connect while the first is
   active (`useMonitorSession.ts:5189-5190`).
2. Cancel and teardown increment the whole-connect epoch before synchronously
   calling `owner.cancel(source)`. The current precondition remains: targeted
   scanning exists only while picking, before a driver can delay teardown
   (`useMonitorSession.ts:6315-6325`).
3. An invalid request or missing capability fails closed before native work and
   never opens the broad picker (`useMonitorSession.ts:5330-5348`).
4. Backgrounding aborts only the current pass. Exactly one replacement pass is
   eligible after the transport returns the interruption tied to that pass's
   exact signal and confirms cleanup
   (`app/src/monitor/nfc/scanWithForegroundRecovery.ts:77-113`).
5. A match that wins before backgrounding is retained, but GATT waits for
   current foreground readiness
   (`app/src/monitor/nfc/scanWithForegroundRecovery.ts:115-119`).
6. Cleanup failure outranks an earlier match. The native adapter continues to
   settle only after bounded `stopLEScan()` cleanup
   (`app/src/monitor/transports/capacitorBle.ts:803-845`).
7. Diagnostic kinds, details and order remain unchanged: `connect=N`,
   `pass=2`, `ble-scan-finished`, and its existing mapped outcome and
   superseded value. Calls without a trace allocate no substitute trace.
8. Terminal discovery failure completes the original trace at the same point.
   Discovery success does not complete it; the hook copies it into the new
   session log and completes it only after GATT succeeds
   (`useMonitorSession.ts:5441-5453`).
9. The hook still disposes a transport built by a superseded or failed attempt.
   The owner never touches GATT, driver creation, session/log identity,
   programming, stored authorization or UI state.
10. The Capacitor adapter keeps its module-scoped initialization, FIFO and
    poison state, as well as scan-local deadline, collision and cleanup logic.

## Ownership and lifetimes

| Value | Owner after this refactor | Created | Ends / survives |
| --- | --- | --- | --- |
| `connectingRef` | session hook | accepted `connect()` | current attempt finalization or Cancel; spans discovery and GATT |
| whole-connect epoch | session hook | hook mount; incremented by connect, Cancel and teardown | hook lifetime; targeted discovery reads but never writes |
| request attempt ID | session hook | accepted request | existing keyed authorization lifetime; unchanged |
| original NFC trace | session hook | NFC entry | failed-attempt export or successful GATT prefix transfer; unchanged |
| current targeted operation | targeted-discovery owner | targeted `discover()` entry | identity-guarded settlement; a later operation cannot be cleared by an earlier one |
| cancel source | targeted-discovery operation | defaults to Cancel semantics at operation entry | first explicit Cancel/teardown wins; operation lifetime only |
| connect/pass trace views | targeted-discovery operation | operation/pass entry | closures retain the original trace and ordinal through late native callbacks |
| foreground, recovery pass, wake and lifecycle unsubscribe | targeted-discovery operation | operation entry / lifecycle registration | operation `finally`; no state survives return |
| native scan state | Capacitor adapter | each `scanTarget` call | native settle and drain |
| native FIFO and poison | Capacitor module | module initialization / cleanup failure | process/module lifetime; survives screens and transport instances |
| logical session and log | session hook | successful GATT | existing session teardown/replacement rules |

## File shape

- Create `app/src/monitor/targetedDiscovery.ts`: the owner interface and full
  pre-GATT targeted implementation. Fold the foreground-recovery state machine
  into this module as private implementation.
- Delete `app/src/monitor/nfc/scanWithForegroundRecovery.ts`: its callback-heavy
  interface is replaced rather than layered under a second public seam.
- Create `app/src/monitor/connectionFailure.ts`: `ConnectedError`,
  `mapRadioFailure` and `mapTargetedFailure` with current copy and ordering.
- Modify `app/src/monitor/useMonitorSession.ts`: create the owner, route targeted
  discovery through its two-operation interface, retain whole-connect and
  post-discovery ownership, and re-export `ConnectedError`.
- Add `app/src/monitor/targetedDiscovery.test.ts`: test the same interface the
  session hook uses.
- Preserve the native-producer-to-hook/export witnesses in
  `app/src/monitor/nfcScanDiagnostics.test.tsx`, targeted refusal/mapping in
  `app/src/monitor/useMonitorSession.test.ts`, and transport cleanup/poison
  tests in `app/src/monitor/transports/capacitorBle.test.ts`.

## Tests and proof

Implementation is test-first. The first new interface test must fail because
the owner does not exist, then prove that synchronous cancellation aborts its
current operation and that late A settlement cannot clear or relabel B. Further
owner-interface tests cover invalid request/capability refusal, lifecycle
registration failure, one foreground recovery, a retained hidden match,
current-foreground revocation, cleanup failure, terminal mapping and omitted
trace behavior.

Existing integration tests remain the higher-level evidence for real native
plugin callbacks, installed queue ordering, exported trace contents, manual
discovery after interruption, and manual refusal after explicit cleanup poison.
Do not replace those with a fake owner in hook tests. Policy-only assertions may
move to the new interface test when keeping both would duplicate the same
claim.

Every new behavioral assertion gets a deciding-source mutation per
`.claude/agent-briefing.md`: remove the synchronous abort, remove the
identity guard, permit a second recovery, complete the trace on success, or
open the picker on refusal, then confirm the named test fails before restoring
green.

This is a structural refactor over released behavior. Desk tests can prove
application ordering and exported diagnostics. They cannot prove the affected
phone's lifecycle sequence, radio state, or whether Chrome caused the original
interruption. No phone install or hardware walk is part of this change.

## Exit

The session hook asks one owner to discover an exact advertised monitor and can
synchronously cancel that owner. It no longer knows about pass controllers,
cancel-source storage, foreground recovery, trace decorators, per-pass terminal
reporting, targeted request validation or identity-safe operation cleanup.

All released targeted discovery, manual discovery, GATT, diagnostics, error
copy and retry outcomes remain unchanged. Removing the new module would force
those hidden obligations back into the session hook; no new caller or adapter
is invented to justify the seam.
