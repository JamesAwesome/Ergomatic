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
| 7. Reader-ending semantics | Partial: actual sheet Cancel/userCancelled and no-tag/sessionTimeout receipts already exist in `PRE-REPAIR.md`. Forced generic invalidation from a positively observed multiple-tag producer is still missing. |
| 8. Native identity, singleton guard and drain | Partial: native desk suites exist and one held-connect A was stopped. Physical multi-tag rejection and the complete prescribed ownership/drain matrix are not established. |
| 9. Old A cannot interfere with B | Incomplete: stopped-stage connect/query/read, successful immediate B and process-live/native-live WebView reload proof remain incomplete. Earlier failed B attempts stay retained. |

Desk reconciliation strictly serialized seven retained receipt files and
deduplicated handoffs by attempt UTC. All three successful handoffs' redacted
record arrays have SHA-256
`fb866bf7ded2e518e4dcf45dbde2b1e045e8e46fef6458a7bb4118d6a777f389`.
This reuses evidence; it does not repeat a phone test or change receipt fields.

Sources: approved spec `2026-09-03-phase-nf-scan-nfc-design.md`, Gate -1;
proof plan Task 3 steps 4–8; `PRE-REPAIR.md`, `REPAIRED-NORMAL.md`,
`BACKGROUND-OBSERVATIONS.md`, `SESSION-PAUSED.md`, and `NORMAL-TRACE-V8-RESULT.md`.

## Next desk preparation

Prepare the existing **stop-during-connect A → immediate B** proof first.
It targets the failed recovery whose missing RF-active/error observations
motivated the diagnostic build. One held-connect A is already known reachable;
the trace can now distinguish B's requested start, actual RF activation and
native ending. Another standalone normal, sheet-cancel or no-tag timeout
would not fill this gap.

The signed recovery build now includes the trace and approved temporary native
hold/release overlay; its 231-file manifest and signature were reverified on
2026-09-04. After the recorded identity mismatch, setup v2 installed and independently
verified it with explicit permission. A later read-only listing still matched
0.23.0/789 and that installation URL. The idle check stopped before canary
with zero NFC attempts; preparation remains incomplete. See
`ZERO-SCAN-SETUP-V2-RESULT.md` and the no-install `ZERO-SCAN-SETUP-V3.md`.

The existing probe's held-stage handler uses export/reload/Start B. Simulator
has proved the corrected Inspector's actual idle component reload; unattended
execution through a physical NFC sheet is still unobserved. A bounded
feasibility question belongs in the reviewed recovery run, never as an assumed
working prerequisite. `RECOVERY-WALK-V1.md` groups the four related cases.

Recover the retained overlay and the existing Inspector/control mechanism;
prove the exact hold, drain, export, document replacement and Start B actions
can be driven without operator console typing or app taps through a sheet.
Use existing controls where they work. If they cannot execute the sequence,
record the specific missing control before proposing a diagnostic change;
do not start another general framework or invent a reader delay.

Prepare the related connect/query/read/reload cases together where their
controls can be proved, so the next invitation is a useful bounded recovery
block rather than another unprepared one-scan handoff. Physical background
and multi-tag legs still need explicitly feasible actions; previous failed
Home swipes and two-object presentations are not approved prerequisites.

No next hardware session is ready yet. Once its build, controls, capture and
cleanup have been demonstrated, PM must approve the concrete grouped runsheet.
Any phone installation requires James's explicit permission for that install;
scan consent is separate. The product design and implementation gate remain
unchanged. Do not keep James waiting at the erg for this preparation.
