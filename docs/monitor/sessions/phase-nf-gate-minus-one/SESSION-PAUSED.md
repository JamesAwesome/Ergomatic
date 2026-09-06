# NFC proof paused — 2026-09-04

Later, separately approved desk implementation:
[DIAGNOSTIC-CAPTURE.md](DIAGNOSTIC-CAPTURE.md). The hardware pause remains.

Desk follow-up: [FEASIBILITY.md](FEASIBILITY.md) verifies the platform/action
assumptions and records the PM-selected narrow diagnostic-design scope. It
does not authorize another walk or implementation.

James stopped the walk after reporting that a roughly ten-minute promise had
become nearly three hours. Hardware work is paused. No additional operator
action, scan, installation or rebuild is requested today. This is a checkpoint,
not completed Gate -1 assembly or clearance to implement the product feature.

## What can be used now

- Two exact NFC-name to live BLE-name connections/disconnections on this PM5:
  `REPAIRED-NORMAL.md`, `second-connection-receipt.json` and
  `background-final-receipt.json`. Both captured the same three records and
  sixteen zero bytes after the complete live name. No workout programming was
  performed by this diagnostic.
- Timeout and sheet-cancel reasons were observed in `PRE-REPAIR.md`; neither
  needs a blind repeat to recover its already recorded outcome.
- `BACKGROUND-OBSERVATIONS.md` distinguishes cancellation before actual pause
  from the still-unproved active-reader background drain.
- `held-connect-a.frames.json` strictly reconstructs to
  `held-connect-a-receipt.json`: the connect-stage callback was held, then A
  stopped before the operator's WebView reload.

## Failed recovery and evidence limits

The subsequent console stream showed a fresh B start, the old A's callback
release acknowledgment, and B's own `invalidated` ending before any records
or BLE operation. A later separate reader reached the held connect stage and
also ended `invalidated`. Identity comparison used only in-memory native IDs;
none are persisted here. The trace does not establish stale A corrupting B.

`held-connect-failure.frames.json` contains TWO independent complete exports.
Each strictly reconstructs and passes the serializer when grouped by export
ID; their receipts are identical to `held-connect-failure-receipt.json`.
An initial controller attempt to feed both exports to the single-envelope
validator was correctly rejected; that was an assembly error, not corrupted
capture. Both latest DOM raw displays were `[]` and match the receipt.

The retained latest attempt is labelled `webview-reload`, captured at
2026-09-04T16:41:44.306Z, with no records or BLE connection. It is not a
successful stop-during-connect B recovery. No complete receipt for the
earlier B was recovered; preserve that evidence gap instead of inventing
an attempt object or asking James to repeat it. The last captured status was
`Clipboard unavailable; collect the framed console export.`; console framing
worked independently of clipboard availability.

The installed plugin's `nfcSessionEndReason(for:)` (NfcPlugin.swift:5-15;
same function in the checked-in package patch) maps every error except the
explicit first-read, cancellation and timeout cases to `invalidated`. The
saved stream does not retain the underlying NSError code for these failures.
Existing bytes therefore do not distinguish the cause. No timer, retry,
hardware-fault diagnosis or code fix follows from this generic reason alone.

Background recovery, multi-tag singleton invalidation, the complete held-stage
matrix and live-reload recovery remain unproved. The final overlay-free normal
confirmation is also outstanding. Gate -1 remains NO-GO; product scheduling
and implementation remain separate decisions.

## Frozen environment

Current phone installation is the temporary diagnostic build, not a release:
runtime ebe077f5, tests ac63b1ec, then local DEBUG overlay. The checked-in patch
SHA-256 remains
`14976bff7e614e28ca5c7e82ffa00af119b9fffc4656ddfe4231038358de04c5`.
Installed overlay source SHA-256 is
`a3479c9408eabf54557bfd9995372cac030a8f60d11c00fb5c90b63e2ece962f`;
the ignored scratch directory retains the original, diff and review report.
At this checkpoint the overlay was present locally and on the phone. The
later desk implementation replaces the local dependency, not the phone build;
see DIAGNOSTIC-CAPTURE.md. Do not reuse the phone build as the new test artifact.
No device cleanup is claimed. No process signal or additional phone action
was used to close this checkpoint.

## PM decision and next work

PM reviewer `/root/walk_policy_pm`: endorse the policy, pause hardware pending
a separately approved walk, and approve NO specific future walk. First do one
desk-only close-out of existing evidence; stop causal analysis where the saved
bytes no longer discriminate. That limit is reached above. Cost: NF proof is
delayed. Hardware will ultimately be necessary, but that does not justify an
unrehearsed repeat.

Before another proposal, design a simpler operator path and determine which
missing native observation is actually necessary. Any instrumentation or
control changes need their normal design/implementation gates; they are not
implemented by this checkpoint. The PM must then approve one short versioned
runsheet under `CLAUDE.md`'s readiness gate: exact evidence target, pinned and
desk-rehearsed build/controls/capture, total operator-time hard stop, attempt
budget and minimal disclosed typing. Only then ask whether James wants to run
it. No future walk is scheduled or approved by this note.
