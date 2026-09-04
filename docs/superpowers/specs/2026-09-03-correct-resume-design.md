# Correct Resume — deferred design research

## Status: deferred, not an implementation contract

James accepted the PM's build-now recommendation on 2026-09-03 and asked to
"Log the decision". Correct Resume is removed from Wave F's implementation and
exit requirements. Its single backlog owner and reopen trigger are in
`ROADMAP.md` under "After the strangers"; the rationale and accepted cost are
in `.claude/agents/pm-ledger.md`, "Correct Resume: need before mechanism".

The proposal below is retained research, not shipped behavior, a binding
spec, or authorization for the server/client rollout it describes. Its
imperatives and merge gates apply only to that former proposal. Reopening
requires a fresh scope decision and design review. The earlier rendered
Gate 0 approval remains a historical fact, not a build-now decision.

Known unresolved questions from [PR #287's review](https://github.com/JamesAwesome/Ergomatic/pull/287#issuecomment-5534180070)
include the continuity count-axis handoff, complete ref-lifetime census,
cleanup deadline headroom, and the production justification for stored gap
markers. Deferral does not resolve them. If same-row reconnect is later
chosen, preserve its correctness safeguards and independently justify the
marker, pre-pull and Just Row scope; do not treat this draft as implementation
ready because an earlier hardening pass passed.

## What and why

A rower who loses an authoritative Bluetooth connection can tap once to watch
the same PM5 session again. The app keeps the logical row, completed actuals,
the in-flight partial reading, and its trace, but it never pretends that the
PM5 resumed or replayed anything. A background/resume gap or liveness silence
alone remains a warning, not a reconnect offer.

For the original proposal, James approved the rendered artifact
`docs/superpowers/specs/2026-09-03-correct-resume-gate.html` on 2026-09-03.
The approval covers the existing red lost banner with RECONNECT / CONNECTING…
/ TRY AGAIN, the pre-pull interstitial with Cancel, Just Row's elapsed-only
surface, the live Grid's `MISSED` pace cell, and the saved summary's
`— · MISSED` row. These are proposed surfaces, not shipped capabilities.

The original scope was TRIAD work: two optional stored markers and a change
to the meaning of an interval's displayed absence. Its server-first rollout,
client/driver work and hardware gate remain below for future evaluation; none
is scheduled by this document, and none blocks Wave F's closeout.

## Evidence and the real-system boundary

- **PRIMARY — Concept2:** the current [PM CSAFE Communication Definition](https://cms.concept2.com/sites/default/files/2026-03/Concept2%20PM%20CSAFE%20Communication%20Definition.pdf) defines the live workout state machine, 0x0031–0x0033 status, 0x0037/0x0038 completed-interval notifications, programming, Just Row, and terminate. It defines no command that lets a client resume its own subscription history or replay boundary notifications missed while disconnected. Correct Resume can therefore continue only Ergomatic's logical record from newly delivered state.
- **PRIMARY — platform connection contracts:** Apple documents that Core Bluetooth [`connect`](<https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/connect(_:options:)>) establishes a local connection and has no application-level timeout; its [connection guidance](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/BestPracticesForInteractingWithARemotePeripheralDevice/BestPracticesForInteractingWithARemotePeripheralDevice.html) says cancellation is nonblocking, pending commands may still finish, and another app may keep the physical link alive. The [Web Bluetooth specification](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattserver-disconnect) likewise says a connect may wait forever, `disconnect()` aborts that server's active connect, and connection-scoped service/characteristic objects must be reacquired. Those contracts are why this design owns a bounded app attempt, a confirmed local disconnect, and fresh connection-scoped wrappers without claiming the radio link itself disappeared.
- **DECISION RECORD:** `docs/superpowers/research/2026-08-20-ble-connection-management.md`, “What and why”, records the accepted model that reconnect means “start watching again,” not that the PM5 resumes anything. It also records Web Bluetooth's retained `BluetoothDevice` route and native ID-based `BleClient.connect` route.
- **COMMITTED HARDWARE EVIDENCE:** `docs/monitor/sessions/walk-2026-08-27/README.md`, “THE SPEC'S PREMISE IS FALSE”, records no transport disconnect during a locked-phone episode despite a 39.4 s lifecycle gap. A lifecycle edge, silence, or foreground arrival is consequently not a reconnect trigger.
- **COMMITTED HARDWARE EVIDENCE:** `docs/monitor/sessions/walk-2026-09-03-resume-edge/README.md`, its resume-edge event sequence, records a 35.468 s resume gap followed by a healthy complete stream. It is evidence against treating a resume gap as disconnection, not evidence that gaps are harmless.
- **REPOSITORY EVIDENCE:** `useMonitorSession`'s `connect` in `app/src/monitor/useMonitorSession.ts` scans, clears per-attempt state and held partial state, creates a new logical session after GATT connect, then calls `program` or `beginFreeRow`. Its own comments name the held-reading clear as the reconnect loss door. That path is forbidden to resume.
- **REPOSITORY EVIDENCE:** `createPm5Driver` in `app/src/monitor/driver.ts` owns a connection's subscriptions, response waits, fallback timer, raw merge state, boundary halves, structure watch, and program/open-run state. `subscribeStatus` currently follows arm or a fallback and writes a sample-rate configuration; it is not an adopted path.
- **REPOSITORY EVIDENCE:** the native adapter currently reports a
  critical control-subscription rejection through the same string callback as
  a genuine OS disconnect while its `deviceId` can still be live. That signal
  proves an unusable control channel, not a down connection. The reconnect
  design must split those provenances before either reaches token authority.
- **REPOSITORY EVIDENCE:** `createMonitorRun`, `recordActual`, and `loadMonitorRun` in `app/src/monitor/monitorRun.ts`, plus `commit` in `app/src/monitor/handoffStore.ts`, establish a single in-memory/durable committer for a run. Reconnect enters through that authority.
- **REPOSITORY EVIDENCE:** `buildMonitorLogSteps` in `app/src/session/logDraft.ts` makes unmatched PM5 intervals visibly absent rather than inventing an actual, and `app/src/log/storedSummary.ts` mirrors that stored shape. `MISSED` refines only a proven interior absence.
- **REPOSITORY EVIDENCE:** `SeriesData` has no explicit break marker;
  `TraceModel` currently starts a new polyline only when adjacent real readings
  are more than three seconds apart. Correct Resume cannot claim an explicit
  gap by relying on that time heuristic.
- **COMMITTED HARDWARE EVIDENCE:** `docs/monitor/sessions/walk-2026-08-31-justrow/README.md`, finding N1, says a PM5 does not advertise while an open Just Row is running. A retained web device may reattach only while GATT can reconnect; this does not make mid-row Just Row recovery universally possible.
- **SECONDARY ECOSYSTEM EVIDENCE:** `docs/monitor/pm5-ble-ecosystem-review.md`, auto-reconnect review, records ErgometerJS defaulting automatic reconnect off because reconnecting to a radio that has gone away has undesirable behaviour. This supports the explicit-tap ruling; it is not the authority for PM5 semantics.
- **INFERENCE:** a complete fresh status cohort plus identity, structure, index, and non-regression checks is a useful guard against obvious wrong attachment and reset. It cannot prove that a distance-goal program did not reset early and return to a superficially compatible same index.

These labels describe the role of the evidence; repository code and committed
captures are not independent authorities for their own correctness. The
product rulings in this design own the expected behaviour. The PM5 does not
have “resume,” “replay,” or an app-owned session identity. The app asserts
continuity only for its own logical record. If the PM5 reset in a blind spot,
the app can still under-count rather than fabricate a join; that is the
accepted honesty cost.

## Product contract

### Eligible trigger and UI state

A reconnect token is minted only after the current connection generation is
disposed and Ergomatic's own GATT/CoreBluetooth connection is authoritatively
down. Authority means the current base adapter delivered a genuine unexpected
disconnect, native reported Bluetooth disabled while it still owned that
connection, or a caller-forced base-adapter disconnect completed. It does not
claim another app or the operating system has no relationship to the PM5.
Driver disposal, liveness silence, and a control-subscription failure are not
authority. A control-subscription failure starts forced teardown and may mint
only after the base adapter confirms disconnect. Lifecycle background or
foreground, resumed JavaScript, frame gap, stale frame, and ordinary silence
never create a token or change the red banner into an action.

A successful base connection that drops before `program()` or
`beginFreeRow()` has established an arm descriptor is not eligible either: a
logical-session ID without an owned arm/run is only an ordinary failed connect.

| Situation                                                                                     | Token / offer                                                                                                                                    | What remains true                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current base adapter reports a genuine unexpected disconnect while a session is open or armed | Mint token after old-driver disposal; show RECONNECT                                                                                             | Existing red lost banner remains; End is actionable for a live row.                                                                                                                         |
| Native reports Bluetooth disabled while it still owns the connection                          | Mint token after old-driver disposal; show RECONNECT                                                                                             | Adapter evidence, not lifecycle inference, proves Ergomatic's connection is down.                                                                                                           |
| Native critical transmit-subscription failure                                                 | Treat it as a teardown trigger, not disconnect proof. Dispose the driver, force the base adapter down, and mint only after confirmed completion. | No driver callback remains capable of mutating the session; failed confirmation exposes no reconnect action.                                                                                |
| Rower presses End or Cancel                                                                   | Never mint                                                                                                                                       | End closes as today. Connected pre-pull Cancel keeps today's terminate-if-armed path; lost-link Cancel closes locally after invalidating the token and sends nothing to the dead transport. |
| Bluetooth is switched off during a qualifying loss                                            | Enable only after cleanup                                                                                                                        | Tap may fail and show TRY AGAIN until the radio returns.                                                                                                                                    |
| Liveness silence, background, foreground, resume gap, or healthy resumed frames               | Never mint / never offer                                                                                                                         | Existing banner/liveness treatment remains the only UI.                                                                                                                                     |
| WebContent reload/process loss                                                                | Out of scope                                                                                                                                     | Retained JS logical session is gone; this residual is accepted.                                                                                                                             |

The affordance is one explicit tap. RECONNECT is enabled while a valid token
exists; tapping it immediately changes it to disabled CONNECTING…. A failed
attempt leaves the logical session untouched and returns to enabled TRY AGAIN.
There is no automatic reconnect, scan, picker, “caught up,” or claim that the
app recovered missed work. End stays usable throughout a live reconnect
attempt. In the pre-first-pull interstitial, Cancel stays visible. On an
ordinary live connection it preserves the current terminate-if-armed
behaviour; after authoritative loss it invalidates the token and closes locally
without attempting Terminate on the dead transport.

Programmed rows retain Live and Grid. Just Row retains no Grid or up-next
surface and continues to show Elapsed. Its token is valid only while its
retained device can reconnect; the advertising constraint is a normal retry
failure, not a reason to scan or choose a different PM5.

### What continuity preserves

A successful reattach preserves one logical session, not one driver:

- original programmed-workout or free-row descriptor and frozen log identity, including pre-pull identity before `runRef` exists;
- retained base-adapter/device handle and stable PM5 identity, with no picker;
- any open `MonitorRun`, actuals, summary observations, partial reading, and handoff-store revision/sole-committer authority;
- existing continuity baseline and series recorder, with an explicit discontinuity marker rather than fabricated samples; and
- existing session log and valid handoff/hold state.

It never carries raw status merge caches, partial 0x0037/0x0038 boundary
halves, pending acknowledgements, pending verification/settle promises,
programming state, structure-watch state, fallback timers, subscriptions,
composed transport wrappers, or callbacks from the old driver into the new one.
The selected base adapter/device handle and session-scoped diagnostic sink are
retained; each adopted generation gets freshly composed connection-scoped
wrappers and a fresh driver. In particular, `withLiveness` must not retain its
old `armed`, `silent`, characteristic statistics, or timer state. The new
driver receives no old raw bytes and does not reprogram, Prepare, Terminate,
begin another Just Row, or send a sample-rate/programming write.

The current driver's `activeRun` is not all connection state: its actual ledger,
per-interval max registers, last active state, and held summary evidence decide
totals, duplicate refusal, final-summary subtraction, boundary attribution,
and finish grace. Correct Resume extracts the connection-independent part into
one runtime-only `RunBehaviorLedger` whose lifetime is the logical arm/run, not
a GATT connection. `program()` or `beginFreeRow()` remains the only original
opener; a PM5 state word can never create it. The explicit adopted constructor
must receive that already-open authority and construct an explicitly open
driver run before a released cohort or side-effecting subscription can fire.
It may not infer an open run from the cohort or manufacture an empty history.

The ledger owns the descriptor/mode and open/closed disposition; per-index
maximum elapsed/distance registers; last trusted active state; an already-held
decoded 0x0039 summary and attributed 0x003F verification payload;
`summarySeen`; and the last work-state average used by final reconciliation.
The attributed 0x003F payload is the narrow exception to “no old raw bytes”:
it already belongs to this logical run, unlike an undecided status/control
cache. Diagnostic-only throttle sets may reset and must be named as such.
Scheduled callbacks, unclassified raw feeds, provenance, and boundary halves
stay with the disposable driver.

A reconnect token never carries a closed run. For a run-open adoption, the
fresh driver's connection-bound terminal fields start clean:
`finishGraceUntil: null`, `graceClaimed: false`,
`terminatedAwaitingSummary: false`, and `finalFilledFromSummary: false`.
Already-earned terminal or summary evidence is first materialized by disposal
and applied through the old run's committer; the logical ledger then supplies
the attributed evidence, not the retiring driver's timers or flags.

On compatible release, the adopted driver's actual count and indexed
subtractable mirror are rebuilt from the latest CAS-accepted
`runRef.current.actuals`, never copied from the retiring driver's private map:
the current driver mutates that map before it emits, while hook/store acceptance
comes later. Count is the accepted array length, including any unattributable
actual; only non-null indexes populate the mirror with elapsed, distance, rest
time, and rest distance. Pre-first-pull adoption has empty actual/register
populations but still opens the driver run. A refused CAS changes neither the
logical run nor the next adopted seed. Both the adopted driver's pre-emit gate
and `recordActual` itself refuse a non-null index already accepted, so a
boundary re-reported after reattach cannot append twice. Every generation-bound
ledger mutation checks the current generation, preventing a disposed driver
from changing the retained authority.

## Reattach architecture

### A token is the authority

Introduce a private reconnect token owned by `useMonitorSession`. Its semantic
shape is `ReconnectToken { id: ReconnectTokenId, logicalSessionId,
stableDeviceId, transportKind, retainedDeviceHandle, lostConnectionGeneration,
activeAttemptId: ReconnectAttemptId | null, descriptor, continuity:
{ kind: "armed-pre-pull" } | { kind: "run-open", runStartedAt: string,
expectedRevision: number | null }, lastTrustedProgramIndex,
disposition: "eligible" | "claimed" }`. The token ID is monotonically unique
for this hook lifetime; a later loss in the same logical session cannot reuse it.

`descriptor` is the original compiled `WorkoutProgram` plus frozen `LogSeed`,
or the explicit Just Row descriptor. A pre-pull token is bound by the existing
logical-session ID plus that arm descriptor; it has no invented start time or
revision. The run-open variant copies `MonitorRun.startedAt` and the hook's
latest accepted handoff revision, including `null` after a refused create.
The same variant must still match at attempt completion: End, Cancel,
replacement session, a different connection generation, changed run key, or
unexpected handoff revision invalidates the attempt. Claiming it creates a
separate attempt with semantic shape `ReconnectAttempt { id:
ReconnectAttemptId, tokenId: ReconnectTokenId, phase: "connecting" |
"quarantining" | "cleaning", baseAttemptId: BaseAttemptId }`. It atomically
stores that ID in `token.activeAttemptId` with `disposition: "claimed"`.
Compatible success consumes the token. An ordinary failure releases it back to
eligible only after candidate cleanup is confirmed; cleanup rejection or
timeout consumes it and leaves only the existing local End/Cancel path.

Every attempt completion and cleanup continuation must still match its captured
`tokenId`, `activeAttemptId`, and `baseAttemptId`. Matching only the logical
session, connection generation, or retained device is insufficient: a second
loss can replace the token while all three remain the same.

Connection generations are minted per connection, not per render. Every event,
callback, and async continuation captures its generation. A callback whose
generation is not current is inert: no UI update, run commit, series sample,
token mutation, disconnect close, or ring event on a newer connection. This is
an invariant, not a best-effort cancellation convention.

The current string-only `Transport.onDisconnect(reason)` seam is not sufficient
authority because native also sends control-subscription failure through it.
Replace that ambiguity with typed loss provenance. Base adapters alone may
produce an unexpected-link-down or Bluetooth-disabled notice; a critical
control-subscription rejection is a distinct teardown-required notice. Wrapper
transports forward provenance without promoting it, and the hook binds the
notice to the connection generation that registered it. No string parsing or
phase inference may decide authority.

The retained device handle also owns a monotonically increasing base-connection
attempt ID. Every adapter notice and forced-down confirmation carries that ID
and is accepted only for the attempt that actually produced it. Web listeners
close over their GATT server and attempt; native connect callbacks close over
their attempt; Bluetooth-disabled is attributed to the currently owned native
attempt. A single mutable callback slot must not let a delayed old disconnect
masquerade as loss of the adopted connection.

Each tap mints one attempt ID distinct from its eventual connection generation.
Retained connect keeps the existing 10,000 ms transport bound, and a successful
base connection gets a separate 10,000 ms wall-clock bound to install the three
quarantine subscriptions and reach a compatibility verdict. The second number
is an app fail-safe aligned with the already-shipped connect bound, not a claim
about PM5 timing; the hardware gate records the healthy time-to-verdict. Thus
CONNECTING… lasts at most 20 seconds before cleanup begins, even if no status
notification arrives. Native confirmed-down cleanup may then consume the
installed plugin's separate 5,000 ms disconnect bound. That cleanup stage is
itself capped at 5,000 ms on both transports: confirmed down returns TRY AGAIN;
rejection, timeout, or an unconfirmed result consumes the token and leaves no
reconnect action. The visible attempt therefore reaches a terminal state within
25 seconds rather than hanging in CONNECTING…. A dedicated injectable
`reconnectSchedule` owns these clocks. It must not reuse the hook's handoff-only
scheduler, whose call count is already part of a different contract.

End, Cancel, token replacement, either deadline, or any other invalidation
first marks the attempt stale, then aborts a pending retained connect where the
platform permits it, or disposes an already-created candidate and forces that
attempt's base connection down. Web exposes the retained GATT server early
enough for `disconnect()` to abort its active connect. The installed native BLE
client serializes connect/disconnect and the current adapter does not own the
device until connect resolves, so native cleanup queues an exact-stable-ID
disconnect behind the bounded connect rather than claiming immediate abort. On
either native connect outcome that cleanup confirms already-down or disconnects
the newly connected peripheral before anything can adopt it.

A base connect that still resolves after invalidation is never assigned a
current generation or given subscriptions: its captured attempt ID routes it
directly through the same confirmed-down cleanup. TRY AGAIN becomes available
only after that local connection is confirmed down. Failed confirmation leaves
the row locally closable but exposes no second attempt that could race the
first.

A forced-down path returns separate base-adapter confirmation. Native awaits
`BleClient.disconnect(id)`, whose installed implementation resolves from the
disconnect callback or when the peripheral is already disconnected. Web calls
the retained GATT server's `disconnect()` and confirms that server is no longer
connected. A decorator's promise is not confirmation: the dev hold-open
transport deliberately resolves before its inner disconnect, so it must be
released or bypassed before this proof can exist. Rejection or an unconfirmed
result leaves no token and no RECONNECT action.

### Disposal is a prerequisite, not a disconnect request

`MonitorDriver` gains idempotent `dispose()` distinct from `disconnect()`.
Disposal has one ordered path: (1) enter `disposing` and tombstone every
transport callback/async continuation for that generation; (2) materialize any
summary/terminate observation whose existing decision gate had already been
earned into a returned disposal result, without expiring a clock early or
calling an event listener; (3) cancel timers and settle every now-impossible
ack, verification, prepare, and summary wait with a disposed outcome; and (4)
invoke every unsubscribe returned by `Transport.subscribe`,
`Transport.onDisconnect`, and driver event registration, then clear the
listeners. The hook applies a returned earned observation through the same
old-run sole committer before minting a token. The connection-independent
`RunBehaviorLedger` itself is not disposed.

Current transport unsubscribe closures initiate some physical notification
shutdown asynchronously. Driver disposal completion therefore means the
generation is logically inert and every unsubscribe has been invoked, not that
each platform CCCD operation reported completion. Confirmed base-adapter
disconnect remains the separate physical barrier before RECONNECT. A repeated
disposal returns the same settled result and performs no work twice.

The caller owns base-adapter disconnect after disposal. Today native's critical
transmit-subscription rejection calls the same callback as a drop without
disconnecting; implementation must replace that collapse with the typed
teardown-required path above. It awaits idempotent driver disposal and confirmed
base disconnect before RECONNECT enables, or the late teardown can end a new
connection. An observed authoritative adapter disconnect still awaits driver
disposal but needs no redundant disconnect call. End and Cancel have different
authority and never mint a token.

The existing generic `connect()` remains a new-session path. Resume must not
call it: it scans, clears retained state, mints a logical session, and programs
or begins a row. Tests must fail if reattach invokes generic connect or a
programming entry point.

### Retained device and adopted quarantine

The token retains the original base-adapter/device handle and identity, not the
composed production `Transport`. Reattach calls an explicit retained-device
method, never `scan()`: Web reconnects the original `BluetoothDevice` GATT to
the same `device.id`; native reconnects the same stable PM5 ID. After the base
connection succeeds, the transport factory composes a fresh liveness wrapper
and any connection-scoped diagnostics before constructing the adopted driver.
The preserved session diagnostic log remains the sink, so the connection swap
is one trace without reusing wrapper state. If that retained handle cannot
reconnect, the attempt fails to TRY AGAIN. It never substitutes a last-seen or
newly chosen device.

The initial successful connect stores that stable ID and retained base handle
on the logical session; display-only `deviceName` is never identity. The
transport factory must split today's already-decorated return into a retained
base selection and a per-generation composition step, so the hook can rebuild
liveness/diagnostic wrappers without reaching inside a composed transport.

Create `createAdoptedPm5Driver` (or explicit adopted constructor mode), not a
conditional branch inside `program()`. It immediately subscribes to fresh
0x0031, 0x0032, and 0x0033 status. There is no arm/fallback release, no
sample-rate write, and no CSAFE programming sequence. Before all three fresh
notifications arrive it emits no frame, accepts no actual, updates no partial,
performs no continuity decision, and cannot change phase.

“Fresh” means each of the three notifications was delivered to subscriptions
installed only after the new base connection completed; it does not claim they
came from one PM5 tick. Before compatibility release, those are the only PM5
feeds the adopted driver subscribes to. Boundary, summary, logged-workout, and
other side-effecting feeds attach only after release, so a boundary that occurs
during quarantine may be missed but cannot mutate an unvalidated run. An
adapter-delivered packet queued across the physical reconnect remains a stated
platform blind spot rather than a claim the app can timestamp away.

Once all three feeds have been seen, each subsequent fresh 0x0031 arrival forms
an adoption observation from that 0x0031 structure plus the latest fresh
0x0032/0x0033 values. It normalizes the program index against the retained
descriptor, compares device/descriptor/current PM5 structure with the old
baseline, and applies the existing continuity check plus a non-regression check
from the last trusted non-null program index. This is an explicitly mixed-feed
heuristic, not a claim that the values share a PM5 sample instant.

A fully compatible observation may release immediately. One incompatible
assembly is only evidence, never a destructive verdict. A mismatch/reset may
close the old record only when the same incompatibility class and deciding
structure/index relationship persists across at least three consecutive
0x0031-led observations for at least the existing 2,000 ms structural-mismatch
window. A changed incompatibility or compatible observation resets the streak.
If neither compatibility nor a stable mismatch wins before the quarantine
deadline, the attempt cleans up and returns to TRY AGAIN without closing the
row. The three-observation/2,000 ms rule reuses the measured arm-verification
heuristic: it can still falsely close a healthy transition lasting longer than
the bound, and a queued compatible set can still falsely release a reset. Both
directions remain logged and the latter remains the stated platform blind
spot.

A stable mismatch/reset closes the old record as `link-lost`, preserves
already-confirmed actuals/partial, disposes the adopted driver without arming
`breakBefore`, and never splices the candidate machine state into the old row.
Compatible release atomically swaps the current generation/listener, clears
the token, keeps `runRef`, `identityRef`, and `RunBehaviorLedger`, then attaches
the boundary/summary feeds and processes the released status normally. A
compatible terminal status can therefore close the retained row through the
ordinary terminal path; it is not converted to a reset merely because the row
ended while Ergomatic was disconnected. The series recorder records a gap; it
never interpolates or backfills it.

If retained connect succeeds but the fresh triple never completes, the
candidate driver is disposed and that candidate base connection is forced down
and confirmed before the token returns to TRY AGAIN. Stable mismatch follows
the same candidate cleanup after closing the old record. A failed or stale teardown
confirmation cannot authorize either retry against that attempt.

## Series discontinuity: one explicit break

`Sample.breakBefore?: true` means the chart must begin a new segment before
this real sample. It says only that the app observed no samples while its own
connection was down; it carries no duration, distance, pace, or interval claim.
`SeriesRecorder.markDiscontinuity()` arms a one-shot pending break only after a
compatible adopted cohort releases quarantine and only when the recorder
already contains a pre-loss sample. The next sample that wins normal
whole-second decimation receives literal `breakBefore: true`; a rejected
same/backward bucket leaves the break pending for the next winning sample. A
pre-first-pull reconnect, truncation with no later stored sample, or close
before another sample writes no meaningless marker.

The client `Sample`, stored-summary mirror, server `LogSeriesSample`, handoff
loader/normalizer, and route allowlist/validator add the optional literal
together. Local hydration strips a non-`true` value and a marker on sample zero
without dropping the sample or run; the API rejects those shapes. The trace
reader carries a pending break across measure-specific sentinel samples and
splits before the next real reading for that measure. It also retains today's
greater-than-three-second inferred split for legacy and ordinary capture gaps.

This invokes the existing, shipped trace treatment: one polyline per segment
and the existing “in N segments” text alternative. It changes no chart copy,
layout, color, or geometry, so no Gate 0 delta is owed; the 2026-08-19 trace
rendering design and current component remain the visual authority. The new
proof is semantic: a short compatible reconnect gap must still produce two
segments, and deleting `breakBefore` must join them.

## MISSED: one stored meaning

### Stored contract (TRIAD)

`MonitorRun.missedIntervalIndexes?: number[]` contains zero-based program
indexes. The persisted projection is `LogStep.missed?: true`. Their sole
meaning is: the app missed this interval's final actual during an authorized
same-run reconnect gap, and a later normalized interval actual was accepted
after reattach, proving an interior hole. It never means the rower skipped an
interval, and it is never inferred from an initial resumed status frame or a
simple absence in `actuals`.

The producer keeps a runtime collection of gap episodes. Each authoritative
loss appends one pending episode bound to a unique episode ID, logical-session
ID, open run `startedAt` and arm descriptor, stable device ID, lost connection
generation, and last trusted non-null program index. Only that episode's
compatible adopted cohort activates it. A second loss never overwrites an
earlier active episode or already-persisted marker.

On an accepted later PM5 actual with normalized index `j`, every active episode
may mark only absent indexes in its own `[preDropIndex, j)` range; the ranges
union idempotently and those processed episodes retire. An actual accepted for
any index removes that index's marker. An episode cannot mark a currently
partial interval, an index outside the original descriptor, a null or
unattributable actual, or any Just Row. Run close, mismatch, End, or replacement
discards unresolved runtime episodes without removing markers already proved.

Actual wins over partial; partial wins over missed; only a marker with neither
renders `— · MISSED`. Newly proved markers are calculated before and written
inside the same sole-committer handoff-store CAS commit as the later actual
that proves them. There is no marker-only write, queued follow-up, or second
source of truth. The independent `breakBefore` marker travels through the
existing series snapshot/flush authority.

Both `loadMonitorRun` and handoff-store hydration normalize this optional
array before the main shape check: accept only finite integer indexes in the
current program range, deduplicate, remove entries already represented by an
actual or retained partial, and omit the key when none remain. Malformed or
conflicting markers are stripped without discarding the otherwise-valid run.
The same normalizer runs before writer commit, so bad storage cannot become a
server payload and an in-memory candidate cannot restore a removed marker.

### Projection and server boundary

`buildMonitorLogSteps` reads the normalized marker only after matching actual
and partial state. It writes literal `missed: true` only for a PM5 program
step with no `actualSource` and no partial. The live Grid reads the same
run-level decision and renders MISSED in the approved existing row: the hook's
public `MonitorSession` exposes the normalized marker set from its committed
`runRef`, `ConnectedSurface` passes it into `SurfaceModelInput`, and the surface
model applies actual > partial > missed. It must not derive or store a second
marker set. The saved path gives `StoredLogStep.missed` to both
`storedSummary` and `summaryModel`; `PostWorkoutSummary` renders
`— · MISSED` instead of the generic “not measured” row. Just Row has neither
Grid nor `LogStep` interval markers.

The client, stored-summary mirror, server `LogStep`, and route validator add
the optional boolean together. The per-step allowlist must preserve it; the
current old-server behavior of silently stripping unknown keys is why server
acceptance deploys first. After all steps and the log-level source have been
parsed, a new array-level validator requires `missed` to be literal `true`, no
actual or partial measurement fields and no `actualSource` on that step,
`source === "pm5"`, and a later `actualSource === "pm5"` step in the same
ordered payload. The client derives this only from a real later accepted PM5
actual, but the server repeats the shape contract because JSONB is client
input. The saved/live partial classifiers must explicitly exclude a valid
`missed` step; absence of `actualSource` alone no longer proves PARTIAL. JSONB
needs no migration.

The required producer → stored server → saved reader seam begins with an
authorized reconnect episode, accepts a later interval actual, builds the
`MonitorRun` marker, saves the monitor log through the real route, reloads
the stored row, and asserts `— · MISSED`. Mutations independently prove that
removing the later actual, replacing `true` with a truthy non-boolean, adding
actual/partial fields, using a non-PM5 source, or deleting the saved-reader
branch makes the appropriate test fail.

## RF27 lifetime table

| State / guard                                                        | Minted by                                                              | Cleared or consumed by                                                                                                                  | Survives disconnect / reattach / reload                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Logical session ID and event log                                     | First successful original GATT connection                              | New ordinary session only                                                                                                               | Yes / yes / diagnostic export only                                         |
| Original descriptor in `identityRef`                                 | Initial Connect before arm/run                                         | End, Cancel, replacement, incompatible reattach                                                                                         | Yes / yes / no                                                             |
| `MonitorRun` and handoff-store revision                              | First real pull / `createMonitorRun`                                   | Existing close/retire flow                                                                                                              | Yes / yes / durable hydration if stored                                    |
| `RunBehaviorLedger`                                                  | Explicit original `program()` / `beginFreeRow()` arm                   | Existing final handoff teardown, End/Cancel after required drains, or replacement; terminal changes it to closed but does not clear it  | Yes / same ledger / no                                                     |
| Reconnect token and monotonically unique token ID                    | Each authoritative loss after old disposal and base-adapter-down proof | Compatible success, End/Cancel, stable mismatch, replacement; ID never reused within the hook lifetime                                  | Yes / retained after cleaned failed attempts; consumed by success / no     |
| Base connection attempt ID                                           | Each original/retained connect call                                    | Confirmed failure/down or promotion to a connection generation                                                                          | Pending attempt may outlive loss / never reused / no                       |
| Connection generation                                                | Each original/adopted GATT connection                                  | Never reused; disposed generation tombstoned                                                                                            | Old comparison only / new value / no                                       |
| Old-driver disposables and pending waits                             | Driver construction                                                    | Idempotent `dispose()`                                                                                                                  | No / no / no                                                               |
| Fresh connection-scoped wrappers and adopted cohort                  | Successful retained base reconnect                                     | Cohort release or disposal                                                                                                              | No / no / no                                                               |
| Pending gap-episode collection, with unique IDs and pre-drop indexes | Each authoritative loss of an open programmed run                      | Matching release activates that episode; run close, stable mismatch, End, or replacement discards unresolved entries                    | Yes / matching episode activates while earlier active episodes remain / no |
| Active gap-episode collection                                        | Each matching compatible release                                       | A later accepted actual processes every applicable episode; run close, stable mismatch, End, or replacement discards unresolved entries | Yes across later losses / yes until processed / no                         |
| Proven `missedIntervalIndexes`                                       | Same accepted CAS as the later actual that proves each marker          | A later accepted actual for that index removes it; otherwise existing run retirement                                                    | Yes / yes / persisted with `MonitorRun` until log save                     |
| Series recorder and pending `breakBefore`                            | Original run open / compatible release after a pre-loss sample         | Next winning sample consumes pending break; existing close path stops recorder                                                          | Yes / yes, with explicit break / persisted in snapshot                     |
| Held partial reading                                                 | Existing last-rowing-frame owner                                       | Actual acceptance, true close, committer-refusal policy                                                                                 | Yes / yes / only if persisted                                              |

Invariants: one logical row has many disposable connection generations; an old
generation cannot mutate a newer one; one token binds one descriptor and device;
and only an accepted handoff-store CAS commit changes the record a rower can
save, even when that commit's durable-write verdict is `failed`.

## Rejected alternatives

- **Reconnect on silence, lifecycle resume, or frame gap.** Committed
  locked-phone walks show those can occur on a healthy transport. It would
  turn the false-positive class into a destructive action.
- **Automatic reconnect or Core Bluetooth auto-reconnect.** Rejected by product
  ruling and because the rower needs an explicit decision to watch the same PM5
  again; the app does not promise background mode.
- **Generic connect then reprogram.** It clears retained state, scans/opens a
  picker, mints a new logical session, and writes to the PM5.
- **Reuse the old driver.** Its subscriptions, timers, raw cohorts, boundary
  halves, and pending promises are connection-bound; partial reset permits old
  callbacks to mutate the new connection.
- **Trust first 0x0031 or first visible frame.** It can merge stale raw values
  and cannot establish a complete current cohort.
- **Backfill trace samples or infer missed from absence.** It invents readings
  and turns never-reached intervals into a device-loss claim.
- **Close every reconnect as a new row.** It loses the descriptor, confirmed
  work, partial, and continuity that Correct Resume exists to preserve.

## Failures, unknowns, and honesty

| Condition                                                                          | Required result                                                        | Unknown / accepted cost                                                                            |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Retained connect rejects or radio is off                                           | Keep token and row; TRY AGAIN                                          | User retries when radio/device returns.                                                            |
| One incompatible mixed-feed observation                                            | Keep quarantining; reset or advance only the measured stability streak | One mixed assembly can be healthy transition or stale delivery and never closes a row.             |
| Stable device/descriptor/cohort mismatch                                           | Close retained row `link-lost`; do not splice                          | Later PM5 state is unowned by this row; the stability heuristic can still err in either direction. |
| First cohort never completes                                                       | Do not release quarantine; fail/retry without writes                   | No conclusion about PM5 state.                                                                     |
| Compatibility and stable mismatch both remain undecided at the quarantine deadline | Dispose and confirm candidate down; retain row and return TRY AGAIN    | Deadline proves only that the app could not decide.                                                |
| Old callback/late promise arrives                                                  | Inert by generation                                                    | Event is not reinterpreted.                                                                        |
| Forced base disconnect rejects or cannot confirm down                              | Expose no reconnect action; retain the row for End/local close         | Control failure is not promoted into link-loss proof.                                              |
| Candidate cleanup rejects, times out, or cannot confirm down                       | Consume the token; expose only local End/Cancel                        | A second attempt could race a still-live first candidate.                                          |
| Gap crosses boundary                                                               | Mark only proven interior holes after later actual                     | A final actual that never arrives stays bare dash.                                                 |
| Same-index or early distance-goal reset                                            | Guard may not detect it                                                | May silently under-count; no recovery claim.                                                       |
| WebContent reload                                                                  | No reconnect state survives                                            | Explicitly out of scope.                                                                           |
| Open Just Row is no longer discoverable                                            | Retained reconnect fails / TRY AGAIN                                   | Never scan or substitute another device.                                                           |

## Compatibility, deployment, and rollback

PR S is an independently safe compatibility slice: server types, per-step and
series allowlists, array-level cross-step validation, persistence mirrors, and
route/store tests accept and preserve both optional JSONB markers, while no
shipped client can write either. It deploys and is verified through the real
POST/read route before PR C can merge. An older server strips the new keys; that
fact is precisely why the two slices cannot share a rollout. An older client
ignores them. Old rows keep a bare dash and retain today's time-inferred chart
gaps; the app never infers historical `MISSED` or a reconnect break. JSONB
needs no migration or backfill.

PR C owns client type mirrors and normalization, stored readers,
adopted-driver lifecycle, retained-device transport seam, session hook, Grid,
summary, replay and integration tests. It does not change PM5 program
compilation, workout authoring, generic new-session connect, or background
execution configuration. Client rollback removes the writer/reconnect feature
but deliberately leaves PR S's additive server acceptance deployed, so an
already-loaded web client or distributed native build cannot have a marker
silently stripped. PR S may be rolled back only after every capable writer is
withdrawn; it is not part of ordinary PR C rollback.

| Slice                       | Entry condition                     | Exit and rollback rule                                                                                                     |
| --------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Spec PR                     | Gate 0 approval and hardened design | Merge before implementation; no runtime change.                                                                            |
| PR S — server compatibility | Spec merged                         | Deploy and prove POST/read preservation plus rejection before PR C merges; leave deployed during ordinary client rollback. |
| PR C — client/driver        | PR S verified live                  | Merge only after automated proofs and the hardware gate; rollback removes every writer/reconnect surface but not PR S.     |
| Closeout record PR          | Candidate build passed hardware     | Commit the evidence and close Wave F; no product code.                                                                     |

| Ownership boundary                                                                                                             | Implementation responsibility                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/src/monitor/driver.ts` and monitor types                                                                                  | PR C: logical `RunBehaviorLedger`, disposable connection generations, adopted driver, stable quarantine gate, duplicate refusal, and no-write enforcement. |
| `app/src/adapters/monitorTransport.ts`, `app/src/monitor/transports/liveness.ts`, `webBluetooth.ts`, and `capacitorBle.ts`     | Retained base handle, typed loss provenance, confirmed forced-down barrier, and freshly composed per-generation wrappers; no scan/picker fallback.         |
| `app/src/monitor/useMonitorSession.ts`                                                                                         | Token/attempt authority, disposal barrier, compatible swap, public committed MISSED state, partial/series preservation.                                    |
| `app/src/monitor/monitorRun.ts`, `seriesRecorder.ts`, and `handoffStore.ts`                                                    | Marker normalization, explicit trace break, and sole-committer persistence.                                                                                |
| `app/src/workout/ConnectedSurface.tsx` and `connected/surfaceModel.ts`                                                         | Pass and render the committed live marker with actual > partial > missed precedence; no duplicate state.                                                   |
| `app/src/session/logDraft.ts`, `app/src/log/storedSummary.ts`, `app/src/session/summaryModel.ts`, and `PostWorkoutSummary.tsx` | Persist, reload, classify, and render saved `MISSED`; valid MISSED is never PARTIAL.                                                                       |
| `app/src/session/traceModel.ts` and trace surfaces                                                                             | Carry explicit breaks through measure sentinels and reuse existing multi-segment rendering.                                                                |
| `app/server/routes/data.ts` and `app/server/stores/logs.ts`                                                                    | PR S: strict JSONB validation/allowlists and stored-shape mirrors; no migration and no client writer.                                                      |

## Proof plan and merge gates

The implementation PR adds failing tests first and proves each new test red
with the named deciding-source mutation. Required proofs:

- the trigger table, especially no action on liveness silence/background/resume;
- typed adapter provenance: critical subscription failure is not link-down,
  wrappers cannot promote it, and the hold-open decorator's early resolution
  cannot satisfy the confirmed-down barrier;
- idempotent disposal, every unsubscribe invoked, pending waits settled, and
  old-generation callbacks inert, with already-earned observations returned
  once before token mint;
- native critical transmit subscription failure waits for teardown before action;
- both 10,000 ms attempt stages, End/Cancel invalidation, Web pending-connect
  abort, native queued exact-ID cleanup, stale late-success teardown, and no
  second TRY AGAIN attempt before confirmed candidate cleanup; a late
  continuation from an earlier token must fail the token, active-attempt, and
  base-attempt identity checks after a replacement loss;
- retained same-device reconnect without picker/scan; generic connect,
  `program`, `beginFreeRow`, Prepare, Terminate, and programming writes fail
  the test if reattach invokes them;
- the logical `RunBehaviorLedger` is passed to the adopted driver with its
  run registers, attributed summary evidence, and last active state, while the
  adopted actual mirror is rebuilt from the CAS-accepted run; CAS refusal
  cannot advance it, and a re-reported 0x0037/0x0038 index is refused by both
  driver and record;
- a fresh liveness/decorator lifetime per adopted generation: old silence or
  recovery state cannot emit into, authorize, or escape the cohort quarantine;
- pre-first-pull identity arms a token despite no `runRef`; End/Cancel never
  mint; RECONNECT → disabled CONNECTING… → TRY AGAIN preserves End/Cancel;
- immediate adopted subscription, complete 0x0031/0x0032/0x0033 quarantine,
  stale-cache exclusion, compatible release, and stable-mismatch `link-lost`
  close; every arrival ordering around work/rest and interval boundaries must
  show that one mixed observation cannot close a row;
- actual/partial/continuity/descriptor preservation and explicit series
  discontinuity with no generated samples;
- a seeded prior register followed by both a real reset and an unreset poison
  cohort preserves cumulative totals without opening/doubling a key; an early
  0x0039 plus attributed 0x003F survives loss and still drives the existing
  terminal summary result after compatible adoption;
- old boundary halves, stale 0x0032/0x0033 provenance, and old timers cannot
  pair with or fire into the adopted generation;
- `breakBefore` set only on the first winning post-release sample, carried
  across per-measure sentinels, accepted by the real server route, read back,
  and rendered as two existing-style segments even below the time heuristic;
- the `MISSED` producer → sole commit → route/server → saved-reader seam and
  all malformed/conflicting/ordering mutations; and
- approved live Grid/saved summary rendering, while Just Row keeps no Grid/up-next.

PR S proves the real POST/read route preserves each marker and rejects every
invalid shape before PR C exists. PR C adds a generation-scoped write counter
at the base `Transport.write` seam, below driver logging. Tests independently
mutate each forbidden call—program, Prepare, Terminate, Just Row, sample-rate,
and another CSAFE write—and require the adopted generation's count to leave
zero from retained-attempt start through compatible publication or cleanup.
Driver log entries are not the oracle: sample-rate and direct error-detail
writes do not share the ordinary CSAFE-chunk log path. The paired positive
control keeps the existing still-connected READY Cancel at exactly one
Terminate write; an over-broad “resume never writes” guard must fail it.

A controlled retained-transport proof holds Web connect and native connect in
flight, presses Cancel pre-pull or End live during both the connect and
quarantine stages, then deliberately releases a late success. It asserts that
no generation or subscription is published, the exact attempt is confirmed
down, the token never resurrects, and its base write count remains zero. This
is the deciding oracle for the late-success race; ordinary fake reconnect
success is not.

Hardware is the merge gate, not a replay substitute. The closeout walk first
cancels one still-connected READY arm and observes exactly one Terminate, then
locks before first pull while another transport remains connected and proves no
reconnect offer; independently true-drops before first pull, reconnects, and
rows the original arm without another write; repeats a lost pre-pull case and
presses Cancel before tapping, proving local close with no Terminate; then repeats with
the radio unavailable, taps RECONNECT, presses Cancel during CONNECTING…, and
restores the radio to prove no late adoption; backgrounds mid-piece without
disconnect and proves no offer; true-drops mid-piece and across an interval
boundary; and true-drops a Just Row and attempts the retained reattach. The Just
Row result may honestly be TRY AGAIN if the PM5 remains unavailable, but it may
not scan, write Just Row again, or lose the open logical row.

Each true drop is established by a typed current-attempt base event or an
independent OS/radio action, never by the reconnect UI under test. For every
successful reattach, the exported generation-scoped base write counter is zero,
including sample-rate and all CSAFE writes. The walk compares PM5 display/memory
to saved rows, records time-to-compatible verdict and whether each gap becomes
actual, partial, or MISSED, and names the distance-goal/same-index blind spot as
untested unless the PM5 run settles it.

## Non-goals

- Background execution, Bluetooth background modes, process restoration, and
  automatic reconnect.
- Reconnecting after WebContent reload or selecting a replacement PM5.
- Replaying PM5 history, programming/rearming the monitor, or claiming PM5
  resumed an app session.
- Filling trace gaps, synthesizing actuals, or inferring historical misses.
- Changing the red lost-banner meaning, Just Row hierarchy, or Gate 0-approved
  copy/layout.
