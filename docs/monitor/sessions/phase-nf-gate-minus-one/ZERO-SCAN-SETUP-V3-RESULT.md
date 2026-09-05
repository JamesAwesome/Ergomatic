# NF-RECOVERY-SETUP-v3 result

PASS: the already-installed diagnostic's actual phone route, controls,
console capture and same-process idle document reload all passed. No install
or NFC attempt occurred. Cleanup was independently verified.

The conservative total operator clock began at 2026-09-05T00:59:50Z, three
seconds before the first tool timestamp after James's ready reply, and ended
at verified cleanup at 01:01:32.366Z: **1 minute 42.366 seconds**. It includes
unlocking, listing, host setup, launch, waits, capture and cleanup. The capture
controller's own 47.262-second clock is not the operator total.

Fresh app listings matched diagnostic 0.23.0/789 and the exact installation
URL from setup v2. The helper matched the current executable to one phone
process, selected the real WebView, observed all enabled diagnostic controls,
captured all four canary lines (maximum 3,127 characters), reloaded, and
required a later document time origin in that same process. Its result was
`idle-preflight-passed`, with captureCheckComplete and newDocument true.

The retained capture host PID 10805 was verified and signalled once, then
exited with `cleanupVerified:true`. It is retired. `ndef.begin.initiated`,
startScanning-line and NFC receipt marker counts were zero. The normal-only
classifier's missing receipt is expected here; the actual idle observations
above are this check's oracle. No recovery or scan permission is inferred.

James was released to lock the phone. The run, directory, deadline and ready
permission are consumed. Raw logs and machine evidence remain private in
`authorized-setup-v3-hrsovf1a/` under the command card's preparation root.
The allowlisted [machine result](setup-v3-result.json) records the outcome.
The prior phone failure's cause remains unknown; this successful check is
current preparation evidence, not a retrospective diagnosis.

This closes the phone-preparation condition for the reviewed recovery
protocol. PM subsequently returned PASS for `NF-RECOVERY-v1`, including the
initial idle readiness command inside its original eight-minute clock.
Separate explicit scan consent is still required. Product implementation
remains gated.
