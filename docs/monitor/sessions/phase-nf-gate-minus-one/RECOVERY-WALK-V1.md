# NF-RECOVERY-v1 — four A → B recovery checks

Status: COMPLETED — aborted before app launch. See
[the stop record](RECOVERY-WALK-V1-ABORT.md). Zero NFC attempts; all four cases
unrun. The original Start permission and run are consumed. The following
PM-approved procedure is retained history, not an executable retry.

Primary target: determine whether a held old NFC attempt can interfere with
its immediate successor on this iPhone/PM5. Four cases share the prepared
hold/release mechanism. Native desk tests establish conditional ownership;
only the real phone can establish RF activation, modal control and successful
PM5 recovery. No standalone normal, cancel, timeout or multi-tag case is added.

## Limits and consent

Total cap: eight minutes from explicit **go** through PM5/phone setup, all
waiting, captures and cleanup. Zero rowing, HR, photos, pasted commands or
manual receipt copying. Four numbered cases maximum, one A and one B per case
(eight reader starts maximum); no retry. Stop the whole block on the first
failed/inconclusive case. Unrun cases remain unrun.
Each pair has a 90-second maximum observation allowance. A new case requires
at least 135 seconds remaining, including its 45-second cleanup reserve.
These are operator caps, not new app/reader timeouts or a promise all four fit.

No install occurs during this walk. `NF-RECOVERY-SETUP-v3` proved the exact
installed recovery build, authenticated diagnostic controls, complete capture,
same-process idle reload and cleanup. Recheck installed identity immediately
before the walk. A mismatch stops; it never authorizes installation.

“At the erg” is readiness for setup. Send the prepared explanation and request
explicit **go** before starting the clock or NFC. Nothing waits on a short
timer for that reply. One **go** authorizes this bounded four-case block;
there are no per-case permission loops or requested “done” acknowledgements.

## Physical blocks

After **go**, include ordinary unlock and PM5 setup in the original clock:

> 1. Unlock your phone and leave Ergomatic open.
> 2. On the PM5 choose More Options → Connect Device and leave Ready for App
>    Connection showing.
> 3. Keep the top of the phone at the same PM5 NFC spot used successfully
>    earlier. This check starts two reader sessions; keep it there through
>    both. I control the app and collect the result. If an unexpected prompt
>    appears, reply **blocked**.

Codex verifies fresh identity and attached capture, then runs the reviewed
idle command once before A to establish the actual You route, complete
canary and new idle document within this same eight-minute clock. The initial physical positioning is allowed to precede reader start;
the user is not asked to tap through a sheet or race a chat reply.

After each successful pair, send one short block for the next numbered case:

> 1. Move the phone away from the NFC spot. On the PM5 choose More Options →
>    Connect Device again; leave Ready for App Connection showing. If those
>    controls are unavailable, reply **blocked**.
> 2. Hold the top of the phone at the NFC spot for the next two reader sessions.
>    Keep Ergomatic open; no app taps are needed.

Do not start the next case until the previous B's terminal state and complete
post-drain receipt are captured. No extra acknowledgement is required. The
host checks are not delayed for a user report that says “done.” After retaining
B's final receipt, use one benign idle document reload before the next A so
the previous document's receipt does not become the next case's first attempt.

The PM5 menu and ordinary tag presentation were demonstrated in v8. Continuous
presentation across replacement readers and Inspector control under a live
sheet are explicit bounded feasibility questions in these cases, not verified
prerequisites. If either cannot progress, preserve the result and stop rather
than inventing another physical action.

## Cases and independent observations

| Case | Exact app action | Required evidence |
| --- | --- | --- |
| 1 | Run stop-during-connect sample | A's real connect hold, automatic exact-A stop/drain, complete partial export, actual reload, B start then release acknowledgement, B's NDEF/exact BLE name/connect/disconnect. |
| 2 | Run stop-during-query sample | Same sequence, with A's real query completion held. |
| 3 | Run stop-during-read sample | Same sequence, with A's real read completion held. |
| 4 | Run webview-reload sample | A's real connect hold remains native-live through export/reload; same native process; B replaces/drains A before release, then completes its own NDEF/BLE handoff. |

Codex drives only existing controls: scenario, Export partial receipt, Reload
WebView and Start B. Require a complete canonical host export matching A's
visible raw-record array BEFORE invoking reload. Preserve both documents'
exports, including failed samples. Require a new document time origin in the
same independently verified process and exactly one Start B invocation.

For B, require its final post-drain receipt and terminal DOM; retain native
begin/return/RF-active/end observations and release acknowledgement. Match the
known PM5 records, exact decoded/live name, one matching device and successful
connect/disconnect. Combine these with the retained native ownership tests.
`staleAttemptSettlementCount` stays null: no zero settlement counter is measured.
The old normal-only classifier is not the recovery oracle.

## Stop, evidence and finish

Any unexpected prompt, changed identity, absent/disabled action, lost Inspector
or console, incomplete newest export, early A ending in the native-live leg,
failed B, or insufficient remaining time stops the block. Each helper run is
bounded inside the original deadline, rechecking it before every transition;
reserve the final 45 seconds for cleanup. Do not start another A without enough
remaining time for that bounded pair and cleanup.
Do not cancel and start another sample or extend the clock to fill a missing row.

Codex retains all raw logs privately and writes only strict redacted receipts
and allowlisted observations to the session record. Finish with the existing
controller's exact-live-PID signal and verified bundle cleanup; held closures
require process termination if their release did not finish. Release James
immediately after cleanup, with actual total time and the captured outcome.

A positive case needs every named observation. Observed failed recovery is
negative; unavailable control/producer, incomplete evidence or unverified
cleanup is inconclusive. Every outcome retains the attempt. Four positive
cases fill this recovery matrix only: physical multiple-tag and background
evidence, final assembly and overlay retirement remain separate Gate -1 work.

## PM disposition

`/root/walk_pm`: **PASS — NF-RECOVERY-v1.** Actual setup-v3 PASS closed the
remaining phone-preparation condition: current installation, authenticated
controls, complete capture, same-process document reload, zero NFC starts and
verified cleanup. Run the reviewed idle command once in the fresh walk capture
before A, within the original eight-minute total. No further desk build,
helper change or unchanged suite is required. Physical blocks and stopping
rules above remain unchanged. Product implementation is still gated.

Exact approved consent invitation:

> Four recovery pairs are ready: at most eight NFC reader starts, eight minutes
> total, no retries or installation. No rowing or heart-rate belt. Reply **go**
> when you want to begin.

No scan is authorized until that reply. If James is away from the erg, he can
wait until he is there before replying; no clock runs across that wait.
