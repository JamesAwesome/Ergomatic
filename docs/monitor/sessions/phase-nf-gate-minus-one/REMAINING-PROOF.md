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
| 7. Reader-ending semantics | Cancel/userCancelled and no-tag/sessionTimeout receipts exist (`PRE-REPAIR.md`). Multiple tags in the field: Core NFC's `didDetect tags:` delivers the tag array to the delegate, and criterion 8 makes OUR patched controller the rejector ("rejects a delegate callback containing zero or multiple physical tags"). That is a deterministic count check, so the correct instrument is a native-injected test, not a physical two-tag presentation (which was never made to work and adds nothing the injected test does not). Reader-ending copy collapses per the spec's own rule if native cannot distinguish invalidation. **Desk item.** |
| 8. Native identity, singleton guard and drain | Native desk suites exist; NF-RECOVERY-v3 case 1 (stop-during-connect A → immediate B) completed on hardware 2026-09-05. Countable exit 1 routes identity/single-tag/drain to native-injected tests; physical multi-tag presentation is dropped (ours to reject, count-checked, injected test is the instrument — see row 7). **Remaining: the injected multi-tag/invalidation test, desk.** |
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
