# Bounded post-exit cleanup

A workload leader can exit before its observed children finish. Local admission
now keeps the owner active for a bounded observation period, releases only after
those children are absent, and retains the owner when cleanup remains unknown.
This implements the existing resource spec's admission step6; it does not add
permission to kill processes or admit browser/container workloads.

## Evidence and limits

PR465 passed exact-head CI35133408702 at2badce41 and merged as7462a18f.
Its separate main CI35134632013 failed the native mutation cancellation test:
`cleanup` was `unresolved`, not `verified`. Earlier assertions established the
original SIGINT reason and the native phase's exit130/signalnull. The failed
fixture removed its temporary receipt, so the log cannot distinguish remaining
children from an unavailable census. Its app coverage step never ran; this is
not a passing main run or a demonstrated allocation failure.

Read-only inspection found one immediate post-exit census in `runWorkload`.
A harmless real grandchild reproduced the cleanup race: its parent was reaped,
the child was reparented toPID1 in the owned group, and the returned receipt
remained unresolved while the child finished naturally. Red receipt
`6a5830ff-5540-47da-a183-006f75913685` records that actual survivor. This proves
the race, not that it caused the missing CI receipt. The native test now prints
its phase records, diagnostics and captured output when cleanup fails.

## Contract

- After a reaped leader, positively observed survivors may settle for up to
  one second, with observations at most50ms apart plus synchronous census cost.
  The deadline is fixed, not restarted on discovery. It is not a hard real-time
  bound on operating-system calls, nor a claim that all children exit in1second.
- Ownership stays active throughout; newly discovered descendants are durably
  recorded and followed by their retained generation even after group changes.
- No signals are sent from settlement. An already-expired cancellation is not
  extended; unavailable census, pressure deterioration during settlement, and
  survivors at the deadline retain unresolved ownership. Recovery remains
  explicit. Original failure, signal and cancellation classification remain.
- The one-second value is an internal runtime bound, not a new worker default,
  public environment override or retry of test execution. Normal no-survivor
  cleanup still takes one observation.

## Validation

Controller-owned serial receipts, all with verified outer cleanup:

- Initial native cancellation diagnostic-only probe1/1: `50860451`.
- The reproduced post-exit race failed before the implementation: `6a5830ff`.
- The pressure-deterioration gate initially caught an incorrect upgrade of
  settlement to verified: `6adc13d0`; the implementation now retains ownership.
- Runtime29/29: `79250dc5` (before the added later-discovery gate).
- Final named native/runtime gates5/5: `4497b719`.
- Initial runtime/owner/host66/66: `fcd4a983`.
- Real code commit hook (compiler projects and E2E30/30): `ac43c9e0`.
- Postcommit zero-settlement mutation failed the real-child cleanup assertion:
  `58766464`; removing the pressure veto failed its negative gate: `61ff852e`.
- Restored native/runtime5/5: `f77e562a`; no deliberate mutation remains.

Independent Standards and spec admission-step6 review passed the complete
four-file range7462a18f..5de40679, with no concrete blockers. The reviewer
checked the passing and failing receipts without launching duplicate workloads.

The final real-child regression uses positive readiness and a release handshake,
not the initial probe's elapsed delay. It asserts that competing admission
fails, the owner remains active, and no signals are emitted during settlement.
Other gates cover initial/lost census, worsening pressure, deadline survival,
discovery after leader exit, group changes and an already-expired cancellation.
The native cancellation gate continues to require SIGINT, phase exit130,
signalnull and verified cleanup; no assertion was weakened.

OOM and signal strings printed by the runtime suite are synthetic fixture
outputs. The tests do not allocate stress memory. No screenshot, browser,
container or native-device run is needed for this increment. Actual guarded push
and exact-head hosted CI remain merge gates; prior native and scoped evidence
does not replace either. Main35134632013's separate browser job passed603initial
executions, zero first-attempt failures/recoveries/resource events; the full run
still failed and deployment was skipped.
Browser identity source corrections are saved separately for the next increment;
the approved whole resource spec remains incomplete.

## Refused-contender correction

Exact-head CI35136929554 at44660ac4 failed the scripts job's independent-child
ownership test: the incumbent returned75 instead of0. Scripts passed124/125;
app, e2e and Docker passed, including native mutation cancellation. The failed
outer receipt was not logged, so this does not establish its historical cause.

A separate deterministic independent-process test reproduced a sufficient
cause: the contender acquired maintenance before discovering the occupied
owner, and the incumbent's concurrent update failed with `EEXIST`. Receipt
`78200ba7` is the failure-first proof, with verified enclosing cleanup. The
test pauses immediately after real barrier creation, then invokes the actual
incumbent update; its deadline is only a failure bound, not a passing oracle.

Acquisition now validates root/metadata, refuses an already-visible barrier,
then atomically reserves the empty owner directory before taking maintenance.
Only the reservation winner publishes. A check for an occupied owner alone
would be insufficient: another process can publish after that check. An
independent-process interleaving gate covers that delayed-acquirer case.
Publication, update, release and recovery retain their existing barrier and
identity checks. Settlement and worker defaults are unchanged.

If a barrier appears after the initial check, acquisition refuses and preserves
the unpublished reservation for diagnosis. In particular, a release/recovery
may have removed its previous directory but not yet dropped maintenance. It
has no subsequent owner deletion, so cannot remove the new reservation. This
rare overlap remains fail-closed, not automatically retried or recovered.
Gates cover late and abandoned barriers, incomplete publication, and recovery
refusing before stale proof; existing substituted-node and recovery tests stay.
This correction excludes acquisition losers from maintenance; it does not
promise contention-free explicit recovery or misuse of stale owner handles.

Focused incumbent and runtime gates passed2/2 (`2c957ae8`); complete named
owner/runtime/host gates passed70/70 (`cda94346`), all enclosing cleanup verified.
The runtime assertion now prints its full result if the incumbent fails again.
Real code commit921e1e64 passed its normal compiler/E2E-membership hook
(`8eab6279`). Postcommit restoration of maintenance-first ordering failed both
incumbent and delayed-acquirer gates (`8c3a8693`). Adding only a busy precheck
made the incumbent gate pass but still failed the delayed-acquirer gate
(`84f378f8`), proving that precheck alone is insufficient. Restored focused
gates passed6/6 (`09cc95a7`) with a clean source diff. All outer cleanup was
verified. Final review, real push and new-head CI remain required for this
correction; the earlier head's results do not certify it.
