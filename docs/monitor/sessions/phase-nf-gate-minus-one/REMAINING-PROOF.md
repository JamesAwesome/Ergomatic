# Remaining NFC proof after v8

V8 passed its one authorized normal trace, and Codex stopped at that agreed
limit. That completed the prepared normal-path experiment, not the remaining
hardware matrix. James's next question was why work stopped and what follows.
No additional scan or installation is authorized by that question. He does
not need to remain at the erg during further desk preparation.

## Existing evidence to reuse

The approved spec's Gate -1 has nine criteria. This table records evidence
coverage, not a new assembled GO receipt or a change to the approved design.

| Criterion | Retained evidence and outstanding work |
| --- | --- |
| 1. Raw NDEF structure | Present: repaired normal captures and v8 retain raw-shaped TNF/type/ID/payload arrays. V8 final framing strictly reassembles. |
| 2. Exact PM5 external type | Present: the successful captures agree on TNF 4 and literal `concept2.com:bleconnectinfo`. |
| 3. Observed payload boundary | Present for this PM5: three distinct successful handoffs retain the same 40-byte PM5 payload, complete name at offset 7, and sixteen trailing zero bytes. Final controller assembly remains to be written; do not generalize to other PM5s. |
| 4. Exact live name on fresh attempts | Present: 16:14:33.366Z, 16:18:35.712Z and 22:28:45.860Z each report exact decoded/live `PM5 432331249 Row` with a completed handoff. The second's background label does not make it background recovery proof. |
| 5. Nonmodal targeted BLE connect | Present in those successful samples and v8's positive classifier result. |
| 6. Signed native reader | Present: pinned app signature/entitlement/usage checks plus v8's generation-1 RF-active trace. Empty controller-owned signature fields in per-run exports are not evidence of missing entitlements. |
| 7. Reader-ending semantics | Cancel/userCancelled and no-tag/sessionTimeout receipts exist (`PRE-REPAIR.md`). Multiple tags in the field: Core NFC's `didDetect tags:` delivers the tag array to the delegate, and criterion 8 makes OUR patched controller the rejector ("rejects a delegate callback containing zero or multiple physical tags"). That is a deterministic count check, so the correct instrument is a native-injected test, not a physical two-tag presentation (which was never made to work and adds nothing the injected test does not). **Injected test landed 2026-09-06** (`NdefSessionEndingTests.swift`, mutation record below): every Core NFC ending code maps to its published reason with the attempt identity; 204 ends silently; a stop settles only on its own ending. **Finding and ruling:** the reason was computed from the code alone, so the controller's own rejections reached JS as `userCancelled`; James ruled option A (2026-09-06) and the controller now publishes `cause: multipleTags | tagFailure` on endings it forced (spec "Reader-ending seam"; tests and mutations below). Codes 202/203 are system-originated; the on-device "forced-invalidation" leg is withdrawn as unforceable. Nothing remains for this row. |
| 8. Native identity, singleton guard and drain | Native desk suites exist; NF-RECOVERY-v3 case 1 (stop-during-connect A → immediate B) completed on hardware 2026-09-05. Countable exit 1 routes identity/single-tag/drain to native-injected tests; physical multi-tag presentation is dropped (ours to reject, count-checked, injected test is the instrument — see row 7). **Injected multi-tag test landed 2026-09-06:** two tags, zero tags and several NDEF messages each end in `invalidate(errorMessage: "Present exactly one NFC tag.")` with no connect and no record event; the rejected attempt drains, its stop settles only on its own ending, and its late callbacks cannot touch B. Nothing remains for this row. |
| 9. Old A cannot interfere with B | **Not a ship gate** (antagonist 2026-09-06, ledger "Remaining NFC walk necessity"): absent from the spec's NO-GO list and countable exit 1; the stage-hold cases 2-4 exist only in the disposable probe (grep-proven), the guard is attempt-ID keyed so 2/3 retest case 1, and the harm ceiling is a recoverable retry with manual Connect present. Case 1 result on file; cases 2-4 and the v5 query-scenario diagnosis DROPPED. |

Desk reconciliation strictly serialized seven retained receipt files and
deduplicated handoffs by attempt UTC. All three successful handoffs' redacted
record arrays have SHA-256
`fb866bf7ded2e518e4dcf45dbde2b1e045e8e46fef6458a7bb4118d6a777f389`.
This reuses evidence; it does not repeat a phone test or change receipt fields.

Sources: approved spec `2026-09-03-phase-nf-scan-nfc-design.md`, Gate -1;
proof plan Task 3 steps 4–8; `PRE-REPAIR.md`, `REPAIRED-NORMAL.md`,
`BACKGROUND-OBSERVATIONS.md`, `SESSION-PAUSED.md`, and `NORMAL-TRACE-V8-RESULT.md`.

## Ship decision, 2026-09-06 (James, on the antagonist's verdict)

Read and connect are proven on hardware (rows 1-6). The recovery matrix's
remaining cases and the v5 query-scenario bug were probe-only constructs that
no shipping path reaches and that the spec's binding gates never required; they
are dropped. Physical multi-tag presentation was never made to work and is not needed:
the rejection is our controller's deterministic count check on the delegate's
tag array (criterion 8), which a native-injected test exercises exactly. **What remains before Scan-NFC can ship is all
desk-side:** the injected multi-tag/invalidation test (rows 7-8), the
reader-ending copy collapse if native cannot distinguish invalidation, and the
"PM5 NFC availability" spec section (no-tag is an expected outcome; manual
Connect stays present; no rule conditioned on the PM5's power cycle). No further
erg time is planned for Gate -1. The DEBUG hold/release overlay and the
diagnostic probe are retired with the phase's close-out.

## Native-injected test record, 2026-09-06 (desk)

Command, from the pnpm patch workspace of `@capgo/capacitor-nfc@8.2.5`:
`xcodebuild -scheme CapgoCapacitorNfc -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' test`
— 28 tests, 0 failures (20 before this change). New: `NdefSessionEndingTests.swift`
(8 tests) over shared doubles in `NfcPluginTestDoubles.swift` (a real
`NFCNDEFReaderSession` subclass that records `invalidate`/`connect` calls and
never touches the radio; the production plugin with only its session factory
replaced; listeners attached the way the bridge attaches them). iOS is played by
the test: delegate callbacks go into the production controller and the
assertions read what it publishes.

Mutations, one at a time on the deciding source, each restored before the next
(anchor grep = 1 hit each; scratch script `mutate.py`):

| Mutation | Result | What failed |
| --- | --- | --- |
| M1 `isExactlyOneDetectedTag` → `count >= 1` | BIT | `testTwoDetectedTagsAreRejectedBeforeAnyConnect` (`invalidationMessages [] ≠ ["Present exactly one NFC tag."]`, `connectCount 1 ≠ 0`), `testRejectedAttemptDrainsAndCannotTouchItsSuccessor`, existing `testRejectsMissingAttemptIdAndNonSingletonTagCounts` |
| M2 `messages.count == 1` → `>= 1` in `didDetectNDEFs` | BIT | `testMultipleNdefMessagesAreRejectedWhileOneIsPublished` |
| M3 `nfcSessionEndReason` default → `userCancelled` | BIT | `testCoreNfcInvalidationCodesMapToEndingReasonsWithAttemptIdentity` at code 202, existing `testSessionEndReasons` |
| M4 `nfcSessionEnd` payload drops `attemptId` | BIT | four ending tests (`attemptId nil`) |
| M5 `didInvalidateWithError` drops the session-identity guard | BIT | `testRejectedAttemptDrainsAndCannotTouchItsSuccessor` (late A ending produced a second event), existing `testEndWithoutActivation…` |
| M6 code 204 publishes `invalidated` | BIT | `testFirstNdefTagReadInvalidationEndsSilently`, existing `testFirstReadCompletionDoesNotHaveSessionEndReason` |

Proof contract (RF26): invariant = the controller rejects any delegate tag
array whose count is not one, before connecting, and publishes every ending
with its attempt identity and the code-derived reason; producer = the
production delegate methods called on the session queue; observable = the
session double's recorded calls and the listener payloads; mutations as
above; strongest claim = the native seam behaves as specified when Core NFC
delivers these callbacks — it says nothing about which code Core NFC delivers
after `invalidate(errorMessage:)`, which is why the published cause overrides
the code for every code (see the spec's "Reader-ending seam").

### Option A, same day: the controller publishes its cause

Failing first: three new tests plus the reworked drain test were red (11
assertion failures) before the change; 31 tests green after it. Mutations:

| Mutation | Result | What failed |
| --- | --- | --- |
| M7 cause never recorded | BIT | all four cause tests (`cause nil`, `reason "userCancelled" ≠ "invalidated"`) |
| M8 cause read but not consumed by its ending | BIT | `testForcedCauseIsConsumedByItsOwnEndingAndCannotReachAReusedAttemptId` (second attempt with the reused ID carried `multipleTags`) |
| M9 cause published with the code-derived reason instead of `invalidated` | BIT | all four cause tests (`reason "userCancelled"` beside a cause) |
| M10 connect failure labelled `multipleTags` | BIT | `testTagFailuresPublishTagFailureCause` (connect case) |
