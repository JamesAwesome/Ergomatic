# Explain interrupted NFC connection attempts

## What and why

When a phone reads the monitor tag successfully but Bluetooth discovery
stops, the connection log should say why it stopped and what it observed.
The reported failure can be reproduced by native background events, but the
existing log cannot distinguish those from Cancel or screen teardown. Add
diagnostics before changing the connection policy so the next real failure
can answer the causal question.

Status: proposed design for James's review. Product implementation has not
started. Research and the execution plan precede implementation, as requested.

Evidence: [research and executed probe](../research/2026-09-17-nfc-scan-interruption/README.md).
Baseline `55c63d63`; seven research cases exercised unchanged product code.

## Grounded decisions

- Actual backgrounding aborts targeted discovery today. Keep that policy.
- Temporary inactivity is not backgrounding. Keep the existing native
  `pause`/`resume` subscriptions; do not abort on `appStateChange`.
- Reader completion precedes Bluetooth discovery. Keep that ownership and
  do not prolong Core NFC sessions to suppress the Chrome banner.
- The observed error means our targeted search was interrupted. It does
  not prove that the PM5 rejected a connection or that Chrome opened.
- Retry keeps the target and trace. Give each accepted targeted connect
  invocation a local ordinal so later events can be attributed correctly.
- There is no product concept of “the phone has moved off the tag” in the
  current interfaces. This change must not invent one.

The research note cites Apple NFC/lifecycle documentation, installed native
plugin call sites and the captured URI record. Neither authoritative
documentation nor the existing captures establish the lifecycle sequence
of an ignored Chrome NFC notification on the affected device.

## Scope and invariants

1. Add fixed diagnostic kinds/details to the existing bounded connection
   trace. Keep the JSON entry shape, capacity and export doors unchanged.
2. No new permissions, dependency, global listener, persistence mechanism,
   timer, automatic retry or hardware behavior. No workout-number, stored
   schema or auth change. No new OS API, including `AbortSignal.reason`.
3. Every targeted scan admitted after request/capability validation gets a
   start marker before lifecycle registration and a terminal marker after
   its awaited scan operation completes or rejects. This covers lifecycle
   registration failure; it does not claim visibility before transport
   construction or into a process killed before JS can execute.
4. The abort-request marker identifies the first caller of that scan's
   controller: `background`, `cancel`, or `teardown`. A request is not a
   claim that abort won the transport's settlement race.
5. Transport summary describes the winning settlement decision. Final
   hook outcome describes the actual returned result after cleanup. A
   match followed by cleanup failure must not be reported as success.
6. Late completion from A never labels, aborts or clears B. Trace closures
   capture their own ordinal and original trace. Retain controller-identity
   cleanup and existing superseded-attempt behavior.
7. Diagnostics contain fixed vocabulary and integer counts only. No tag
   UID, BLE identifier, scanned name, URL, UUID, raw NDEF, arbitrary native
   error name/message, or inferred external app name.
8. Calls without a trace keep the same behavior and do not allocate or
   publish a substitute trace. Diagnostics introduce no additional await.

## Diagnostic contract

Add these kinds to `ConnectionAttemptTraceKind` and its runtime allowlist.
Existing transport events remain and gain the same scoped prefix when used
through the session hook. Each scan detail begins with `connect=N`, where N
is the hook's existing captured connect-attempt counter, not a device ID.
Ordinals are local to the hook; they can skip values and are not global IDs.

| Kind | Owner | Fixed detail after `connect=N` |
| --- | --- | --- |
| `ble-scan-requested` | Hook, before scan lifecycle registration | No additional detail required. |
| `ble-scan-lifecycle` | Existing scan lifecycle callback | `background` or `foreground`, as received. |
| `ble-scan-abort-requested` | Scan's abort owner | First request: `background`, `cancel`, or `teardown`. |
| `ble-scan-summary` | Real transport, winning settlement | `stage=S outcome=O results=R valid=V named=L matches=M`. |
| `ble-scan-started-late` | Real transport, late native acknowledgement | Native scan-start promise resolved after terminal decision; no claim that a new scan was launched. |
| `ble-scan-finished` | Hook, after awaited scan settles | `outcome=O superseded=true/false`. |

For `ble-scan-finished`, `O` is `matched` on resolution or the existing
mapped `ConnectedError.reason` on rejection. Never copy its raw message.
The marker precedes `trace.complete()` and the superseded return. Failed
lifecycle registration has a finished marker as well as the existing
`listener-registration-failed` marker.

The transport's stage vocabulary is `queue`, `initialize`, `enabled`,
`held-devices`, `scan-start`, `advertisements`, `collision-window`. Stage
is updated before the corresponding await or when the first exact match
opens the collision window. An early scan callback can advance the stage
before the scan-start promise resolves; its resolution must not overwrite
that more advanced stage.

The transport's outcome vocabulary is `matched`, `interrupted`,
`not-advertising`, `already-connected`, `ambiguous`, `bluetooth-off`,
`permission-denied`, `cleanup-failed`, `invalid-request`, `other-error`.
Use a closed mapping from known errors; arbitrary plugin error strings
become `other-error`. Cleanup can supersede the initial decision; the
finished marker is authoritative for the returned outcome.

Counts measure callback observations, not devices in the room:

- `results`: callbacks received before the winning settlement.
- `valid`: callbacks accepted by the existing decoder.
- `named`: valid callbacks with a nonempty live local name.
- `matches`: distinct exact-name device IDs already held in `matches`.

Counters reset per scan, survive only in its summary, and never retain
nonmatching identities. Do not add per-advertisement diagnostic entries.
For a signal already aborted or a poisoned transport, emit a summary before
the existing early rejection; no native call becomes permissible.

`ble-scan-started` continues to mean the native start call resolved before
our decision. A late resolution uses the distinct late kind. Neither event
proves that the PM5 advertised or that CoreBluetooth delivered callbacks.

## Ownership and lifetimes

| Value | Created | Cleared / ends | Retry, teardown and relaunch |
| --- | --- | --- | --- |
| Original NFC trace | Existing NFC entry press | Existing bounded trace/latest-snapshot lifetime | Reused by targeted retries; not newly persisted. |
| Connect ordinal | Existing `attemptRef` increment | Existing hook lifetime | Captured value per connect; cancellation may cause gaps. |
| Scoped trace wrapper | Targeted branch after validation | Last continuation of that invocation | Captures original trace and ordinal, never reads a later mutable trace ref. |
| Abort callback | Beside existing scan controller | Existing identity-guarded `finally` | Checks that controller's signal before logging first request and aborting; no new shared reason flag. |
| Stage and counts | Inside one `scanTarget` call | Last continuation of that call | Never carried into retry; settled callbacks do not update counts. |
| Existing settlement guard | Existing scan entry | Existing scan lifetime | Remains sole authority for winner and cleanup; diagnostics do not replace it. |

Pass Cancel's origin through the existing teardown call as an explicit
internal argument, defaulting to `teardown` for the effect cleanup.
The background callback uses the same per-scan abort owner. Preserve the
current synchronous abort point and stable teardown callback dependencies.

## Tests and proof limits

The retained research probe is the starting point for a permanent seam
test. It must inject events at the native plugin boundary and assert on the
real hook's exported trace, not a fake `scanTarget` that writes the expected
events itself. The NFC input remains the captured three-record PM5 fixture.

Required cases: inactive/active without cancellation; background;
Cancel; unmount; background plus retry; repeated native tag callbacks;
no-advertisement timeout; setup-stage timeout; first abort wins;
late A completion after B starts; unknown plugin error redaction;
cleanup rejection and cleanup deadline; late scan-start acknowledgement;
early matching callback before scan-start acknowledgement; no trace.

At the transport level, feed absent-name, different-name, invalid, duplicate
and exact-name callbacks and independently assert the counters and outcome.
At the export/UI boundary, assert these real entries appear and Copy log
retains the same JSON. Browser tests validate that display/export seam, not
iOS events or physical NFC behavior.

Mutation targets: delete cause recording; relabel background as Cancel;
route inactive into background; reuse B's ordinal in A's late callback;
drop summary counters; report matched after cleanup failure; put raw error
text in a diagnostic; remove the late-start distinction. Each should break
its named test before its restored pass is accepted.

## Delivery and exclusions

One coherent PR for diagnostics and permanent tests after design review and
implementation preparation. Full review is required: this spans multiple
product files in device code and is not fast path. No DBA or PM number /
storage / auth gate is triggered. A hardware session, if later needed, has
its own PM readiness and James authorization requirements.

No product instructions, error copy, layout or new controls are proposed;
the existing raw-log viewer renders the new diagnostic records. Any later
“move the phone away” copy or changed connection behavior needs its own
design decision, supported by the evidence this work is intended to collect.

Exit: a produced log distinguishes the supported stop paths and their
observed scan outcomes without changing which connection succeeds, fails,
retries or gets cancelled. It cannot identify Chrome as the external cause,
explain RF interference, or make telemetry survive an OS process kill.
