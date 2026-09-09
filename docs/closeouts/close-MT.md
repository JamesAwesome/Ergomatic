# close-phase MT — worklist

Frozen at `dffd5a8c` (main, 2026-09-08). Span: ROADMAP.md 136..335, terminator
`## Phase JR — Just Row`. Span text: `close-MT.span.txt`.

Enumeration: 18 bullets in span (15 open checkbox, 3 ticked). Pass 2 returned
one out-of-span hit — the Wave E entry-point row at 1661. Pass 3 run per row on
its own distinctive noun; CLAIM/REJECT below.

**Deterministic:** span, pass 1, pass 2, DONE-against-tree, CI gate, anchor diff.
**Heuristic:** pass 3 (recall bounded by a word list I invented).
**Heuristic with a durable counter:** the pull-in cap.

Key is the SLUG. Line numbers are "as of dffd5a8c" convenience only.

## Rows

```
SLUG                          | DISP   | title (first clause)                                              | status  | receipt
pr1-refusal-denylist          | DONE   | PR 1 — the refusal, the link, and the matrix                      | closed  | #366 a476cbc6 in v0.43.0; matrix VERIFIED in tree: bodies/connectTheMonitor.tsx:55 (3 tiers), articles.tsx:132 minutes 2->3, SupportMatrixLink.tsx:55
freerow-armed-retire          | DONE   | A refused sitting on the FREE-ROW door can still retire a record  | closed  | James ruled ACCEPT 2026-09-08; comment landed useMonitorSession.ts:3811-3821
matrix-goes-stale             | CARRY  | The published matrix goes stale silently                          | open    | standing trigger, not work; lift to register
multierg-static-refused       | CARRY  | A MultiErg reporting a STATIC ski or bike value would be refused  | open    | unowned/accepted; no capture or vendor sentence settles it
permission-denied-landscape   | DONE   | permission-denied ships a five-button stack, 10px body            | closed  | #370 d7319040 (10->138px, 78->206px, 142->206px)
five-button-shape-ungateable  | BUILD  | Nothing can gate the five-button failure frame                    | ruled   | James 2026-09-08: dev-only seam on canOpenAppSettings + dist-grep needle + e2e case
screenshots-churn             | DOC    | pnpm screenshots rewrites 64 of 201 captures on every run         | closed  | PR A: 4 filings -> 1 row under ## Tooling; fix CARRIES
permission-copy-your-pm5      | BUILD  | The permission screen says "your PM5" where it means "monitor"    | closed  | PR A, with the scan-sheet row and the NFC card's body line
detail-panel-duplication      | BUILD  | The permission frame's DETAIL panel repeats its own remedy        | in PR B | Gate 0 rendered; ruling = condition line 649, covers ~10 frames, keeps slug + raw
web-overflow-scroll           | DONE   | Top of an overflowing interstitial body cannot be scrolled to     | closed  | #366; index.css:6035 justify-content: flex-start
phone-timer-offer-on-refusal  | BUILD  | "Row on the phone timer instead" is offered on the refusal screen | in PR B | REMOVE from unsupported-machine ONLY (it is unconditional today); layout: Try again spans full width
two-design-gates              | DONE   | Two design gates the refusal screen owes                          | closed  | #369 3eed9f29, both proven red
refusal-guard-ungated         | CARRY  | The refusal-survives-its-own-consequences guard is UNGATED        | open    | needs a bounded-withhold fake control — see P3-G
design-3540-flake             | DOC    | design.spec.ts:3541 flakes under a full parallel run              | closed  | PR A: folded into "Hunt the e2e flakes" as a datapoint
connected-1703-poison         | CARRY  | connected.spec.ts:1703 poisons its own origin for a later run     | open    | new flake class; lift to the flake register
refused-machine-last-used     | BUILD  | A refused machine is still remembered as LAST USED                | closed  | PR A: forgetLastDevice on unsupported-machine; gated + 2 probes
type-rower-hardcoded          | CARRY  | type: "rower" is still hardcoded for machines the denylist admits | open    | accepted consequence of the approved direction
pre-2018-classification       | CARRY  | A monitor on pre-2018 firmware cannot be classified at all        | open    | blocked on Transport.read; 0x0016 may not exist
waveE-entry-row               | DOC    | We never check WHICH Concept2 machine is attached (line 1661)     | open    | pass 2; tick + point at the archive once released
```

## Pass 3 — duplicate reconciliation

- **P3-A CLAIMED.** `pnpm screenshots` churn is filed **four times** with four
  different numbers: this phase's row (64 of 201, 2026-09-08), ~61 PNGs
  (1451, PR #341 2026-09-07), 13 of 83 (2022, 2026-08-30), 19 of 90 (2965,
  2026-08-28). Same defect, four measurements, three register homes. Reconcile
  to ONE row carrying the measurement history.
- **P3-B CLAIMED.** The RF32 copy rule has a second open row: the Bluetooth
  scan sheet at 1723 (`capacitorBle.ts`, "Looking for your PM5"). Same rule,
  different file, both copy-only — one PR.
- **P3-C CLAIMED.** `design.spec.ts`'s `stableBoundingBox` flake is already
  named in the standing "Hunt the e2e flakes" row (851, `e2e/helpers.ts:89`).
  This phase's 2026-09-08 sighting is a new datapoint on it, not a new row.
- **P3-G CLAIMED (link, not merge).** The Wave E decode-warning row (1657)
  needs "a fake control holding a NAMED characteristic undecodable, shaped
  like `failSubscribe`"; `refusal-guard-ungated` needs a control that withholds
  0x0031 for a bounded number of ticks. One piece of harness tooling unblocks
  both. Cross-reference, do not merge the rows.
- **P3-D REJECTED.** `mapping.ts` at 1807 is the `endedBy === "finished"` export
  fence for a connected Just Row — a different defect in the same file.
- **P3-E REJECTED.** `beginFreeRow` at 406 is Phase JR spec context describing
  the ordinary open sequence, not this phase's ack-ordering residual.
- **P3-F REJECTED.** "phone timer" at 2296 is the landscape-gutter inset table.

## Decision batch — answered 2026-09-08

- **five-button-shape-ungateable → BUILD.** Dev-only seam on `canOpenAppSettings()`
  alone, an e2e case driving the five-button frame, a `dist-grep.sh` needle proving
  it absent from production. A global `isNative()` stub was on the option list and
  ruled out with a receipt: `adapters/monitorTransport.ts` takes the Capacitor BLE
  arm whenever `isNative()`, killing the fake monitor the design tests run on
  (CLAUDE.md RF13).
- **phone-timer-offer-on-refusal → REMOVE.** Needs Gate 0: it takes the refusal
  frame from four buttons to three, and #370's landscape rule pairs the last FOUR.
- **screenshots-churn → DOC only.** Reconcile the four filings into one carrying the
  measurement history and the measured cause; the fix CARRIES.
- **refused-machine-last-used → BUILD**, in the close-out PR.

Still owed to James: **one Gate 0 covering both screen changes** — the refusal
frame losing a button and the permission frame losing its duplicated DETAIL panel.
Rendered together because both perturb the same landscape action-stack budget.

## OWED, and easy to lose — the five-button seam

`five-button-shape-ungateable` is ruled **BUILD** (James, 2026-09-08) and **is
not in PR A or PR B**. I dropped it from PR B's brief. It is still needed: PR B
KEEPS the phone-timer button, so iOS `permission-denied` still renders five
buttons and the shape still has no web gate.

Dispatch it after PR B merges (it touches the same file). Scope: a dev-only
override on `canOpenAppSettings()` alone, an e2e case driving the five-button
frame, and a `dist-grep.sh` needle proving it absent from production. A global
`isNative()` stub is RULED OUT with a receipt — `adapters/monitorTransport.ts`
takes the Capacitor BLE arm whenever `isNative()`, killing the fake monitor the
design tests run on (CLAUDE.md RF13).

## Register rows filed during the close-out (NOT pull-ins — filed, not worked)

- `--failure` comment misstates why row one is 56px (Gate 0 measurement).
- Just Row's refusal stack never gets #370's pairing (`--failure` absent).
- The `PM5` / `Timer` provenance label, the last unswept RF32 vocabulary.
- Nine `PM5` mentions in shipped release notes (positional test pins).

## Pull-ins

Count: `grep -c "pulled in, close-MT" ROADMAP.md`. Cap is 3; the third stops
the close-out and hands back to James.

(none yet)
