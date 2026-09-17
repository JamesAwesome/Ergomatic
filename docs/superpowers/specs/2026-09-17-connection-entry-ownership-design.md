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

James approved the opaque-attempt design on 2026-09-17. The hardening pass
found one existing Cancel race that the deeper owner must close: Just Row
currently restores its connection door before asynchronous PM5 termination
settles, so late cleanup from A can invalidate a newly started B. The revised
design keeps both hardware buttons disabled until Cancel settles and requires a
fresh press afterward. It otherwise preserves rower copy, navigation, retry
eligibility, timeouts, radio ordering, compilation, authorization consumption
at `armed`, stored record shapes and diagnostic vocabulary.

The refactor also closes two internal lifetime gaps. A true Just Row unmount
discards that attempt's still-staged authorization, and an abandoned claimed
attempt publishes its final trace after owned connection and Cancel work
settles. The authorization was already unreachable by another attempt because
the store compares attempt IDs; the trace was previously readable only while
the dying session hook still existed. These changes affect cleanup and
diagnostic availability, not which record can be retired or which radio result
the rower sees.

Baseline: `a4413359` (`v0.50.5`).

## Research and system concepts

- **PRIMARY — React Strict Mode:** React documents that Strict Mode runs one
  additional development-only Effect setup/cleanup cycle. It does not promise
  that replay setup precedes a queued microtask. The released `mountLease.ts`
  converts the behavior observed with the pinned React runtime into
  Ergomatic's tested microtask reclaim heuristic. This design reuses that rule;
  it does not infer abandonment directly from an Effect cleanup.
  <https://react.dev/reference/react/StrictMode>
- **PRIMARY — Web Bluetooth:** the normative `requestDevice()` algorithm
  requires transient user activation. Production reaches that call after
  asynchronous transport resolution, so this design does not claim that one
  JavaScript stack frame itself preserves activation. It preserves the current
  topology: Just Row delegates its initial manual connection synchronously from
  the press continuation and does not move every initial connection into an
  Effect. <https://bluetooth.spec.whatwg.org/#dom-bluetooth-requestdevice>
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

export function useConnectionEntry(): ConnectionEntry;

export function useConnectionEntryLifetime(
  attempt: ConnectionEntryAttempt | null,
): void;
```

The code block defines names and relationships, not a paste-ready
implementation. The implementation may split React integration from the
non-React attempt owner as long as this screen-facing interface and the
behavior below remain intact.

The concrete attempt carries a non-exported `unique symbol` brand and is also
registered in module-private state. The brand prevents ordinary structural
construction; the runtime lookup fails closed for a cast foreign lookalike.
Neither mechanism adds caller-visible data or cleanup operations.

`begin` handles both intents. Manual delivery invokes `onReady` synchronously,
so Just Row can retain its current user-activation path. NFC delivery owns the
reader, lifecycle listener, trace, busy/accepted state and paint barrier now in
`useNfcEntry`. It invokes `onReady` only after a target has passed those gates.

`busy` is true while an entry intent is resolving and while Cancel is draining.
A normal claim clears the entry-resolution state as the caller leaves the door;
Cancel sets the drain state before the caller can restore that door and clears
it only from the identity-checked settlement finalizer. A claimed retryable
attempt remains protected from replacement even when `busy` is not rendered.

`onReady` receives an offer rather than an attempt. The module retains
ownership until `claim()` is called during that callback. If the callback
returns without a claim, the module abandons the offer synchronously. This is
how Workout Detail keeps compilation without learning cleanup: compile success
claims and stores the attempt; compile rejection only displays its existing
copy and leaves the offer unclaimed.

`onReady` runs inside a total transfer guard. Returning normally without a
claim abandons the offer. Throwing before or after a claim also abandons it; a
handle already returned by `claim()` becomes inert. On the NFC route the throw
continues through the existing stopped-copy path; on the manual route it is
re-thrown after cleanup rather than swallowed.

`claim()` returns the offer's same attempt object if called twice during the one
callback, so React or helper composition cannot create two owners. A claim
after the callback returns returns that object in its inert state, satisfying
the non-null type without resurrecting the attempt.

`attempt.connect(session)` performs both the first connection and every retry.
It always delegates the same immutable discovery request and the same owned
trace to the session. The first accepted `connect` or `cancel` binds the stable
`connect` and `cancel` method identities as one collaborator. A later call
cannot rebind the attempt: it continues through the original pair and never
invokes the foreign pair. The render-created session object itself need not
retain identity.

Concurrent `connect` calls return the exact same retained attempt-level promise
object and make one underlying session call. An identity-checked finalizer
clears that slot; a call after settlement is a retry. An abandoned or draining
attempt quietly refuses connection before any radio call.

`attempt.cancel(session)` moves synchronously to `draining` before invoking the
existing session Cancel. It calls `session.cancel()` once, preserving that
method's synchronous epoch retirement and its machine termination/transport
ordering, then immediately performs keyed authorization abandonment. Repeated
Cancel calls return the exact captured attempt-level promise. A lifetime
cleanup during draining cannot release the owner early.

The owner remains busy until the captured Cancel settles, fulfilled or
rejected. It then releases the door. Final dirty-trace publication follows the
trace-ownership rule below and may wait longer for separately captured connect
work. Callers may navigate or change state without awaiting Cancel, but a new
hardware press stays disabled throughout the drain and must be made afresh
afterward. Nothing is queued behind Cancel, because a queued Web Bluetooth
request would not carry a fresh user activation.

`targetName` is presentation only: the exact advertised name for an NFC route
and `null` for a picker route. No caller can read the attempt ID, discovery
request or trace.

`useConnectionEntryLifetime` claims the existing identity-bound mount lease
for a non-null attempt. Under the pinned React runtime, the routed StrictMode
test proves that cleanup/setup rehearsal reclaims it before the microtask
commits. A cleanup with no reclaim abandons the attempt. A same-ID genuine
detach/remount inside that microtask is the heuristic's accepted false-negative
shape; no production route performs one.

Both supported doors use the hook: the interstitial for Workout Detail and the
started connection surface for Just Row. `useConnectionEntry` also installs an
owner-level identity-checked unmount backstop. It abandons a claimed attempt if
the owning screen disappears after `claim()` but before the conditional
lifetime Effect ever mounts.

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
returns to the existing door state, where `entry.busy` keeps both hardware
buttons disabled until the old Cancel drain settles.

`ConnectionEntryAttempt.connect` is the only implementation site that projects
an attempt into the existing session input. `useMonitorSession` retains its
current low-level `connect(request, trace)` interface unchanged for internal and
observer callers. Workout Detail, ConnectedInterstitial and Just Row no longer
call that interface directly. A source-structure test gates those three
production callers rather than retaining a compatibility overload in their
code.

## Trace ownership

The module creates and retains the NFC trace. It passes a trace view to the
existing NFC reader, targeted discovery and session implementation, but screens
never receive that view.

Existing publication points remain unchanged while an attempt is live:

- an NFC outcome that never produces a claimed offer completes before controls
  return;
- a terminal targeted-discovery failure publishes after scan cleanup settles;
- successful GATT copies the trace into the new session ring and publishes the
  same trace;
- a handed-off failure before either publication point remains readable through
  the session's pending-attempt export, as today;
- retry appends to the same trace and may republish its enlarged snapshot.

Claimed-attempt abandonment adds one terminal. The module waits for its captured
in-flight connection and Cancel promises to settle, then republishes the trace
if entries were added since its last publication. This preserves cleanup
entries that otherwise disappear with a true route loss after targeted
discovery but before GATT. A trace already published by targeted failure or
successful GATT is unchanged unless later retry or cleanup appended entries.

The module owns the trace and publication version. Targeted discovery and the
session may signal the same existing `complete()` operation at their
established terminals; they do not retain or replace the trace. Screens no
longer decide trace completion.

Every entry operation also receives a process-local monotonic publication
order. The wrapped trace delegates `complete()` only when its order is at least
the last entry order that published. Equality permits retry publication from
the same attempt; a late A completion after newer B has published is a no-op.
This arbitration sits at the wrapper because the underlying trace sink stores
one unkeyed process-global latest snapshot.

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
- owner unmount between offer claim and lifetime-hook commit.

A recoverable connection failure does not abandon. Try Again therefore retains
the exact target, attempt ID, trace and staged authorization. The existing
`armed` event consumes the staged authorization through
`takeStagedRetire(attemptId)`; the connection-entry module only supplies the
hidden ID to the current session path. A later abandon after consumption is a
store no-op.

A claimed, retryable or draining attempt is never replaceable. `begin(B)` while
A is current refuses B, performs a keyed discard for B, and does not abandon A
or touch A's radio. This owner-level refusal cannot restore A's staged
authorization if an unsupported producer already overwrote the store's one
slot before calling `begin(B)`. The supported `ConnectAction` producer admits no
such B: the door is absent while A is claimed/retryable, and both hardware
actions are disabled while A is draining. No current producer needs
replacement. A future producer may replace only entry-owned pre-handoff work
after specifying admission before staging and how its reader is synchronously
aborted.

The session's existing direct discard remains for zero-argument observer
connections and as defense in depth. The attempt adapter supplies its hidden ID
inside the unchanged discovery request, so the session needs no new ownership
interface. The drain lock ensures an old Cancel cannot resume after B starts and
read B's mutable session attempt ref. No cleanup callback is accepted from a
screen.

## State and lifetime ledger

| Value                                             | Owner                                                             | Created                                | Ends or transfers                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| pending hardware intent and staged authorization  | `ConnectAction` plus `handoffStore`; attempt ID                   | hardware-button press                  | confirm Cancel discards; proceed transfers the same ID into `begin`                        |
| active entry operation                            | `useConnectionEntry`; object identity                             | accepted `begin`                       | unclaimed terminal, settled Cancel or true route loss; a claimed attempt is never replaced |
| NFC reader/controller/listener and accepted paint | connection-entry module; active operation identity                | NFC `begin`                            | reader outcome, abort, unmount or successful offer                                         |
| pending offer                                     | connection-entry module; offer identity                           | manual delivery or accepted NFC target | `claim()` transfers once; callback return without claim abandons                           |
| opaque attempt                                    | connection-entry module; object identity plus hidden attempt ID   | offer claim                            | explicit Cancel or true route loss; remains live across recoverable retry                  |
| discovery request                                 | opaque attempt                                                    | manual `begin` or accepted NFC target  | immutable for the attempt; never exposed to screens                                        |
| NFC trace                                         | opaque attempt                                                    | NFC `begin`                            | published at existing terminals; same object survives retry and may be republished         |
| abandoned trace cleanup                           | abandoned attempt closure plus captured promises                  | claimed abandonment                    | all captured work settles, then a dirty generation publishes                               |
| trace publication order                           | connection-entry module; process-local counter                    | each accepted `begin`                  | document reload; older operation cannot overwrite a newer published operation              |
| mount lease                                       | connection-entry lifetime hook; attempt ID                        | non-null mounted attempt               | same-ID StrictMode reclaim, or committed real-detach abandonment                           |
| Cancel drain                                      | connection-entry module; attempt object plus exact Cancel promise | first `attempt.cancel` invocation      | fulfilled or rejected Cancel settlement; keeps owner busy and refuses connect/begin        |
| staged authorization                              | `handoffStore`; hidden attempt ID                                 | `ConnectAction` stage                  | `armed` consumes; keyed abandonment discards; mismatch is a no-op                          |
| whole-connect epoch and in-flight transport       | `useMonitorSession`                                               | each accepted session `connect`        | current Cancel, teardown, settlement or superseding connect; unchanged                     |
| targeted discovery operation                      | `TargetedDiscoveryOwner`                                          | advertised-name session connect        | current discovery settle or session Cancel/teardown; unchanged                             |
| logical session, driver and run                   | `useMonitorSession`                                               | existing GATT/armed/first-frame points | existing terminal and teardown rules; unchanged                                            |

No attempt state survives a document reload. `handoffStore` and the mount lease
are already process-local; the new module adds no persistence or stored shape.

## Failure and concurrency contract

- Only one entry operation is live per mounted connection door. A claimed,
  retryable or draining A refuses B without replacing A's operation or radio;
  supported UI admission prevents B from staging before that refusal.
- Cancel is a live generation until its captured promise settles. The owner
  remains busy, refuses `begin` and `connect`, and releases no queued successor.
- Late NFC or lifecycle completion from A checks A's operation identity and
  cannot offer, clear or abandon B.
- An offer is transferred at most once. An unclaimed or throwing offer callback
  is terminal before `begin` returns for manual entry or before the NFC
  continuation returns. A handle obtained before a throw becomes inert.
- An attempt's request, trace and ID are immutable and inseparable. Retry never
  remints an ID, restages authorization, changes target or opens the picker for
  a targeted attempt.
- The first operation binds the stable session `connect`/`cancel` method pair.
  Another pair cannot rebind it; retry and Cancel continue through the original
  collaborator even if a render-created session object changed.
- Concurrent `connect` calls for one attempt return one exact promise and make
  one session call. The session's current `connectingRef` and numeric epoch
  remain the authoritative wider guard against stale transport work.
- An abandoned attempt starts no new radio work. Abandonment does not replace
  session Cancel or targeted-discovery cancellation.
- Cleanup is compare-by-object inside the module and compare-by-ID in the
  store. Late A cleanup cannot clear B's current operation or authorization.
- Trace operations never throw into rendering or lifecycle cleanup. Claimed
  abandonment publishes only after owned async work settles, and only when the
  trace is dirty since its last publication. Existing redaction and capacity
  rules remain unchanged.
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
  through it, use the lifetime hook, and keep the door's hardware buttons
  disabled while the attempt reports a pending Cancel drain.
- Keep `app/src/monitor/useMonitorSession.ts` behavior and interface unchanged.
  The attempt delegates its private request/trace pair through the existing
  `connect(request, trace)` call and delegates Cancel through the existing
  `cancel()` call. Existing session tests remain the proof for epoch, targeted
  discovery, GATT, pending-trace export and keyed armed consumption.
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
   while concurrent calls return the same in-flight promise and bind one stable
   session method pair;
5. `cancel` invokes the session once, abandons authorization after the
   session's synchronous retirement prefix, keeps the owner busy through an
   asynchronously held transport-write settlement, and requires a fresh press
   after settle;
6. StrictMode setup/cleanup/setup retains the staged authorization, while a
   true detach discards it for both Workout Detail and Just Row;
7. owner unmount after claim but before the conditional lifetime Effect mounts
   still discards the keyed authorization;
8. callback throws before or after claim leave one inert attempt and no staged
   authorization;
9. late completion from terminal A cannot affect B, and the supported hardware
   door cannot stage B while A remains live or draining;
10. connecting an abandoned, draining or unresolved attempt performs no radio
    call;
11. claimed abandonment after targeted success but before GATT publishes the
    final dirty trace after connection/Cancel cleanup settles;
12. after A's Cancel releases the door, newer B may publish before A's held
    connect settles; releasing A cannot replace B's global latest snapshot.

Existing routed tests remain the higher-level proof for Scan NFC through both
doors, exact-target retry, compile rejection, targeted failure copy, connection
log export, keyed `armed` consumption and Web Bluetooth picker behavior. Replace
obsolete assertions about raw prop/ref wiring with outcomes observed through
the public attempt interface.

One routed Just Row test must hold the injected transport write promise during
terminate, return the UI to the door, prove a second press cannot stage
authorization or call session connect, release Cancel, and then prove a fresh B
survives every late A continuation. The fake processes wire bytes and
notifications synchronously, so this establishes the late application
continuation and makes no PM5 acknowledgement-timing claim. This test starts
above the screen and uses the real session hook; a mocked `cancel` cannot expose
the shared epoch/ref race.

The deciding-source mutations are: remove unclaimed-offer abandonment, remint
the retry request, separate the retry trace, return a new promise for a
concurrent connect, release `busy` before Cancel settles, remove the owner
unmount backstop, permit claimed replacement, remove the attempt identity
check, make real detach a no-op, make StrictMode cleanup commit immediately,
or restore a direct production `session.connect` call in either supported door.
Each named test must fail under its matching mutation before restoration.

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
