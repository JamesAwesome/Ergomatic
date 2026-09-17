# Deepen connection-entry ownership

## What and why

Workout Detail and Just Row both support manual and NFC connection entry, but
they currently carry the attempt lifetime themselves. A decoded NFC target is
handed out as a `MonitorDiscoveryRequest` beside a `ConnectionAttemptTrace`.
Workout Detail stores that pair in render state, Just Row stores it in a ref,
and each caller must remember that retry reuses both values. Workout Detail
also knows how a true interstitial unmount discards the keyed authorization,
while Just Row relies on session Cancel and leaves an unreachable staged
authorization after a true route loss.

Concentrate that shared lifetime behind one connection-entry module. Callers
receive an opaque attempt with operations for connection, retry and Cancel;
they do not receive the request, trace or attempt ID. The module also owns the
handoff decision, keyed abandonment and React lifetime integration.

James approved this design on 2026-09-17. The refactor preserves rower copy,
navigation, retry eligibility, timeouts, radio ordering, compilation,
authorization consumption at `armed`, stored record shapes and the existing
diagnostic vocabulary. It deliberately closes one internal lifetime gap: a
true Just Row unmount now discards that attempt's still-staged authorization.
The discarded value was already unreachable by another attempt because the
store compares attempt IDs; this changes cleanup and its existing discard
receipt, not which record can be retired.

Baseline: `a4413359` (`v0.50.5`).

## Research and system concepts

- **PRIMARY — React Strict Mode:** React documents that Strict Mode runs one
  additional development-only Effect setup/cleanup cycle. The released
  `mountLease.ts` already converts that platform behavior into Ergomatic's
  microtask reclaim rule. This design reuses that rule; it does not infer
  abandonment directly from an Effect cleanup.
  <https://react.dev/reference/react/StrictMode>
- **PRIMARY — Web Bluetooth:** the Web Bluetooth specification permits user
  agents to require transient user activation for scan-triggering operations.
  Just Row therefore keeps its initial manual `connect` call in the synchronous
  press continuation. The new module must not move every initial connection
  into an Effect. <https://webbluetoothcg.github.io/web-bluetooth/scanning.html>
- **REPO PRIMARY — current ownership:** `useNfcEntry.ts` creates the trace and
  interprets a boolean return as ownership transfer; `WorkoutDetail.tsx`
  stores request plus trace after compilation; `ConnectedInterstitial.tsx`
  replays them and wires the mount lease; `JustRow.tsx` stores and replays the
  same pair; `useMonitorSession.ts` owns the wider connection epoch, targeted
  discovery, GATT and session identity.
- **REPO PRIMARY — authorization:** `handoffStore.ts` stages and consumes one
  authorization under a `ConnectionAttemptId`. A mismatched discard or take is
  a no-op. The new module calls that existing policy; it does not define which
  record is eligible or move the `armed` acceptance point.
- **REPO PRIMARY — targeted discovery:** `targetedDiscovery.ts` owns one
  pre-GATT advertised-name discovery operation. Candidate 01 deliberately did
  not take the wider entry attempt. Candidate 02 composes with it and does not
  merge the two lifetimes.

The phone, browser and PM5 have NFC reads, Bluetooth discovery, GATT and React
mount behavior. They do not have an Ergomatic connection-entry attempt or its
authorization ID. That attempt is application coordination minted by
`ConnectAction`. If its lifetime is wrong, Ergomatic may retain an unreachable
authorization, replay the wrong target or publish an incomplete trace; neither
iOS nor the PM5 can correct it.

## Considered interfaces

Three distinct shapes were compared under the codebase-design deletion test.

1. **Opaque offered attempt, bound to the existing session — chosen.** A shared
   hook resolves manual or NFC entry and offers an attempt. Claiming the offer
   transfers ownership. The attempt connects, retries and cancels through the
   existing session while hiding its request, trace and ID. A lifetime hook
   applies the established StrictMode-safe abandonment rule. This removes the
   obligations from both callers with a small screen-facing interface.
2. **Make `MonitorSession.connect` accept an opaque typestate token.** This
   gives stronger type-level isolation, but forces the large session test
   surface through a new session-only collaborator interface. The session must
   still inspect discovery and trace material internally, so the extra
   migration adds little leverage over binding the attempt to the existing
   `connect(request, trace)` implementation.
3. **Wrap request and trace in a value.** This changes storage syntax but leaves
   callers responsible for transfer, retry, cancellation, trace publication
   and mount loss. Deleting it removes complexity instead of returning that
   complexity to both callers, so it is shallow and rejected.

## Chosen interface

`app/src/monitor/connectionEntry.ts` becomes the public seam used by Workout
Detail and Just Row. Its conceptual interface is:

```ts
export interface ConnectionEntryOffer {
  claim(): ConnectionEntryAttempt;
}

export interface ConnectionEntryAttempt {
  readonly targetName: string | null;
  connect(session: Pick<MonitorSession, "connect">): Promise<void>;
  cancel(session: Pick<MonitorSession, "cancel">): Promise<void>;
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

export function useConnectionEntry(): ConnectionEntry;

export function useConnectionEntryLifetime(
  attempt: ConnectionEntryAttempt | null,
): void;
```

The code block defines names and relationships, not a paste-ready
implementation. The implementation may split React integration from the
non-React attempt owner as long as this screen-facing interface and the
behavior below remain intact.

`begin` handles both intents. Manual delivery invokes `onReady` synchronously,
so Just Row can retain its current user-activation path. NFC delivery owns the
reader, lifecycle listener, trace, busy/accepted state and paint barrier now in
`useNfcEntry`. It invokes `onReady` only after a target has passed those gates.

`onReady` receives an offer rather than an attempt. The module retains
ownership until `claim()` is called during that callback. If the callback
returns without a claim, the module abandons the offer synchronously. This is
how Workout Detail keeps compilation without learning cleanup: compile success
claims and stores the attempt; compile rejection only displays its existing
copy and leaves the offer unclaimed.

`claim()` returns the same attempt if called twice during the one callback, so
React or helper composition cannot create two owners. A claim after the
callback returns is a programmer error in development and a no-op in the
production implementation; it never resurrects an abandoned attempt.

`attempt.connect(session)` performs both the first connection and every retry.
It always delegates the same immutable discovery request and the same owned
trace to the session. Concurrent calls share the one in-flight promise; a call
after settlement is a retry. An abandoned attempt quietly refuses connection
before any radio call.

`attempt.cancel(session)` delegates the existing session Cancel, preserving
its machine termination and transport ordering, then abandons the attempt.
The operation is idempotent. A component may navigate or change state without
awaiting it, as current callers do; the lifetime hook is the synchronous safety
net for a route loss while Cancel settles.

`targetName` is presentation only: the exact advertised name for an NFC route
and `null` for a picker route. No caller can read the attempt ID, discovery
request or trace.

`useConnectionEntryLifetime` claims the existing identity-bound mount lease
for a non-null attempt. A StrictMode cleanup/setup rehearsal reclaims it before
the microtask commits. A cleanup with no reclaim abandons the attempt. Both
supported doors use the hook: the interstitial for Workout Detail and the
started connection surface for Just Row.

## Ownership transfer and data flow

The manual Workout Detail path is:

```text
ConnectAction stages authorization and supplies intent
  -> entry.begin delivers an offer synchronously
  -> Workout Detail compiles
  -> compile success claims and stores the opaque attempt
  -> interstitial lifetime hook claims the mount lease
  -> attempt.connect(session)
  -> existing picker, GATT, program, armed and row flow
```

The NFC Workout Detail path adds the existing reader, parse, accepted paint and
targeted request construction before the offer. Compile rejection leaves the
offer unclaimed; the module completes the pre-handoff trace and discards only
that attempt's staged authorization.

Just Row claims every valid offer immediately, stores the opaque attempt,
updates its existing `lookingFor` state from `targetName`, and invokes
`attempt.connect(session)` inside the press continuation. Try Again invokes
`connect` on the same object. Cancel invokes `attempt.cancel(session)` and
returns to the existing door state.

`ConnectionEntryAttempt.connect` is the only implementation site that projects
an attempt into the existing session input. `useMonitorSession` retains its
current low-level `connect(request, trace)` interface for internal and observer
callers. Workout Detail, ConnectedInterstitial and Just Row no longer call that
interface directly. A source-structure test gates those three production
callers rather than retaining a compatibility overload in their code.

## Trace ownership

The module creates and retains the NFC trace. It passes a trace view to the
existing NFC reader, targeted discovery and session implementation, but screens
never receive that view.

Existing publication points remain unchanged:

- an NFC outcome that never produces a claimed offer completes before controls
  return;
- a terminal targeted-discovery failure publishes after scan cleanup settles;
- successful GATT copies the trace into the new session ring and publishes the
  same trace;
- a handed-off failure before either publication point remains readable through
  the session's pending-attempt export, as today;
- retry appends to the same trace and may republish its enlarged snapshot.

The module owns the trace and its final pre-handoff settlement. Targeted
discovery and the session may signal the same existing `complete()` operation
at their established terminals; they do not retain or replace the trace. This
preserves diagnostic content and timing while removing trace-completion
decisions from both screen callers.

## Abandonment and authorization

Abandonment is idempotent and keyed by the hidden attempt ID. It marks the
attempt unusable and calls `handoffStore.discardStagedRetire(attemptId)`.
That store remains authoritative for whether a staged value exists and whether
the ID matches. Abandonment never retires a record itself.

An attempt is abandoned on:

- confirmation cancellation before `begin`, through `ConnectAction`'s current
  direct keyed discard;
- every NFC terminal that does not yield a claimed offer;
- an unclaimed offer, including Workout Detail compile rejection;
- explicit Cancel through `attempt.cancel`;
- a true route loss through the lifetime hook;
- replacement by a later attempt in the same connection-entry owner.

A recoverable connection failure does not abandon. Try Again therefore retains
the exact target, attempt ID, trace and staged authorization. The existing
`armed` event consumes the staged authorization through
`takeStagedRetire(attemptId)`; the connection-entry module only supplies the
hidden ID to the current session path. A later abandon after consumption is a
store no-op.

The session's existing direct discard remains for zero-argument observer
connections and as defense in depth while migration is complete. It must use
the same hidden attempt ID when an entry attempt is present. No cleanup callback
is accepted from a screen.

## State and lifetime ledger

| Value | Owner | Created | Ends or transfers |
| --- | --- | --- | --- |
| pending hardware intent and staged authorization | `ConnectAction` plus `handoffStore`; attempt ID | hardware-button press | confirm Cancel discards; proceed transfers the same ID into `begin` |
| active entry operation | `useConnectionEntry`; object identity | accepted `begin` | unclaimed terminal, explicit Cancel, replacement or true route loss |
| NFC reader/controller/listener and accepted paint | connection-entry module; active operation identity | NFC `begin` | reader outcome, abort, unmount or successful offer |
| pending offer | connection-entry module; offer identity | manual delivery or accepted NFC target | `claim()` transfers once; callback return without claim abandons |
| opaque attempt | connection-entry module; object identity plus hidden attempt ID | offer claim | explicit Cancel, replacement or true route loss; remains live across recoverable retry |
| discovery request | opaque attempt | manual `begin` or accepted NFC target | immutable for the attempt; never exposed to screens |
| NFC trace | opaque attempt | NFC `begin` | published at existing terminals; same object survives retry and may be republished |
| mount lease | connection-entry lifetime hook; attempt ID | non-null mounted attempt | same-ID StrictMode reclaim, or committed real-detach abandonment |
| staged authorization | `handoffStore`; hidden attempt ID | `ConnectAction` stage | `armed` consumes; keyed abandonment discards; mismatch is a no-op |
| whole-connect epoch and in-flight transport | `useMonitorSession` | each accepted session `connect` | current Cancel, teardown, settlement or superseding connect; unchanged |
| targeted discovery operation | `TargetedDiscoveryOwner` | advertised-name session connect | current discovery settle or session Cancel/teardown; unchanged |
| logical session, driver and run | `useMonitorSession` | existing GATT/armed/first-frame points | existing terminal and teardown rules; unchanged |

No attempt state survives a document reload. `handoffStore` and the mount lease
are already process-local; the new module adds no persistence or stored shape.

## Failure and concurrency contract

- Only one entry operation is live per mounted connection door. Beginning B
  abandons A before B becomes current.
- Late NFC or lifecycle completion from A checks A's operation identity and
  cannot offer, clear or abandon B.
- An offer is transferred at most once. An unclaimed offer is terminal before
  `begin` returns for manual entry or before the NFC continuation returns.
- An attempt's request, trace and ID are immutable and inseparable. Retry never
  remints an ID, restages authorization, changes target or opens the picker for
  a targeted attempt.
- Concurrent `connect` calls for one attempt share one promise. The session's
  current `connectingRef` and numeric epoch remain the authoritative wider
  guard against stale transport work.
- An abandoned attempt starts no new radio work. Abandonment does not replace
  session Cancel or targeted-discovery cancellation.
- Cleanup is compare-by-object inside the module and compare-by-ID in the
  store. Late A cleanup cannot clear B's current operation or authorization.
- Trace operations never throw into rendering or lifecycle cleanup. Existing
  redaction and capacity rules remain unchanged.
- Invalid attempt IDs and target names continue to fail closed through the
  existing connection-failure mapping. There is no fallback from targeted
  discovery to the broad picker.

## File shape

- Create `app/src/monitor/connectionEntry.ts`: the opaque offer/attempt owner,
  shared hook, NFC integration and attempt/session projection.
- Create `app/src/monitor/connectionEntry.test.tsx`: tests through the same
  public interface used by screens, including manual synchrony, unclaimed
  abandonment, exact retry identity, concurrent-connect sharing, Cancel and
  StrictMode versus true detach.
- Delete `app/src/monitor/nfc/useNfcEntry.ts` and fold its capability/read
  lifecycle into the new module. Move behavior tests to the new interface test
  rather than layering a second public seam.
- Modify `app/src/workout/WorkoutDetail.tsx`: compile an offer and store only a
  claimed attempt.
- Modify `app/src/workout/ConnectedInterstitial.tsx`: receive one attempt,
  invoke its connect/cancel operations, render `targetName`, and use the
  lifetime hook. Remove direct request, trace, store and mount-lease imports.
- Modify `app/src/justrow/JustRow.tsx`: store one attempt, connect/retry/cancel
  through it, and use the lifetime hook.
- Modify `app/src/monitor/useMonitorSession.ts` only where the attempt adapter
  must supply its hidden ID for pending trace export, keyed armed consumption
  and defensive session cleanup. The session epoch, targeted owner, GATT and
  public zero-argument observer path remain intact.
- Keep `app/src/monitor/mountLease.ts` as the private StrictMode mechanism. Its
  direct tests remain; screen wiring tests are replaced with attempt-lifetime
  outcomes through the new interface.
- Update the Phase NF specs only where present-tense architecture claims the
  raw request/trace pair or Just Row's intentional lease gap. Historical walk
  evidence and dated release notes remain historical.

## Tests and proof

Implementation is test-first. The direct interface tests must prove:

1. manual `begin` offers synchronously and a claimed attempt delegates one
   picker request carrying the original attempt ID;
2. a valid NFC target produces one offer after the accepted paint barrier,
   while every quiet or inline outcome abandons and restores controls;
3. returning from `onReady` without `claim()` completes the trace and discards
   only that attempt's staged authorization;
4. repeated `connect` after settlement sends the same request object and trace,
   while concurrent calls share one in-flight promise;
5. `cancel` preserves the session's existing ordering and ends the attempt;
6. StrictMode setup/cleanup/setup retains the staged authorization, while a
   true detach discards it for both Workout Detail and Just Row;
7. late completion from A cannot affect B;
8. connecting an abandoned or unresolved attempt performs no radio call.

Existing routed tests remain the higher-level proof for Scan NFC through both
doors, exact-target retry, compile rejection, targeted failure copy, connection
log export, keyed `armed` consumption and Web Bluetooth picker behavior. Replace
obsolete assertions about raw prop/ref wiring with outcomes observed through
the public attempt interface.

The deciding-source mutations are: remove unclaimed-offer abandonment, remint
the retry request, separate the retry trace, bypass the in-flight promise,
remove the attempt identity check, make real detach a no-op, make StrictMode
cleanup commit immediately, or restore a direct production `session.connect`
call in either supported door. Each named test must fail under its matching
mutation before restoration.

No phone install or PM5 walk is required. This changes application ownership
and closes process-local cleanup; it does not alter native code, radio calls,
timers, device copy or the workout protocol. Desk tests can prove every changed
contract.

## Exit

Workout Detail and Just Row know one shared entry operation, one offer and one
opaque attempt. They no longer retain a request/trace pair, know the attempt ID,
decide keyed abandonment, wire a mount-loss callback or reconstruct retry
identity. Manual and NFC entry still reach the same session, targeted discovery
and stored-record acceptance points.

Deleting `connectionEntry.ts` would force request/trace pairing, unclaimed
handoff cleanup, exact retry identity, keyed abandonment and StrictMode-safe
route-loss handling back into both callers. That returned complexity is why the
module earns its seam.
