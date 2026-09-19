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

---

## RE-FREEZE — `708bfa8d` (main, 2026-09-19)

The 2026-09-08 freeze above went stale the day its BUILD PRs merged: the span
moved from 136..335 to **161..344** (terminator `## Phase DE — Difficulty out, effort in`), and every row it
listed as BUILD, "in PR B" or "ruled" has since landed. This section is the
current worklist; the text above is kept as the record of the first freeze.
Span text re-saved to `close-MT.span.txt`.

Enumeration at this freeze: **10 bullets in span, all ticked checkboxes, zero
open.** Pass 2 returns twelve out-of-span mentions, all descriptive: the Wave E
entry-point row (ticked, "SHIPPED as Phase MT"), five "Lifted out of Phase MT"
stamps on the rows carried by #481, two register rows this close-out filed on
2026-09-09, and four prose references. None is an open item naming this phase
as its owner.

**Deterministic:** span, pass 1, pass 2, DONE-against-tree, CI gate, anchor diff.
**Heuristic:** pass 3 (recall bounded by a word list I invented) — and on this
freeze it was run only where a row named a defect that could live elsewhere.
**Heuristic with a durable counter:** the pull-in cap. No pull-ins.

Key is the SLUG. Line numbers are "as of 708bfa8d" convenience only.

**Closed together with Phases DE and PS as ONE doc-class PR (James, 2026-09-19):** one
antagonist exit pass and one PM close gate cover all three. No BUILD row, no
DECIDE row and no tag hand-back remain in any of them — every deliverable is
already in a released tag.

### Rows

```
SLUG                          | DISP   | title (first clause)                                              | status | receipt
pr1-refusal-denylist          | DONE   | PR 1 — the refusal, the link, and the matrix                      | closed | #366 a476cbc6, v0.43.0
freerow-armed-retire          | DONE   | A refused sitting on the FREE-ROW door can still retire a record  | closed | James ruled ACCEPT 2026-09-08; comment in useMonitorSession.ts (beginFreeRow block); ticked #481
permission-denied-landscape   | DONE   | permission-denied ships a five-button stack, 10px body            | closed | #370 d7319040, v0.44.0
five-button-shape-ungateable  | DONE   | Nothing can gate the five-button failure frame                    | closed | #380 8a9a7a7b, v0.45.0 (dev-only seam + e2e case + dist-grep needle)
permission-copy-your-pm5      | DONE   | The permission screen says "your PM5" where it means "monitor"    | closed | #377 e70ce792, v0.45.0
detail-panel-duplication      | DONE   | The permission frame's DETAIL panel repeats its own remedy        | closed | #378 ace43ea4, v0.45.0
web-overflow-scroll           | DONE   | Top of an overflowing interstitial body cannot be scrolled to     | closed | #366 a476cbc6, v0.43.0
phone-timer-offer-on-refusal  | DONE   | "Row on the phone timer instead" is offered on the refusal screen | closed | #378 ace43ea4, v0.45.0
two-design-gates              | DONE   | Two design gates the refusal screen owes                          | closed | #369 3eed9f29, v0.44.0
refused-machine-last-used     | DONE   | A refused machine is still remembered as LAST USED                | closed | #377 e70ce792, v0.45.0
matrix-goes-stale             | CARRY  | The published matrix goes stale silently                          | lifted | #481 -> "Small, queued", dies 2026-11-30
multierg-static-refused       | CARRY  | A MultiErg reporting a STATIC ski or bike value would be refused  | lifted | #481 -> "Accepted, pinned, and not being fixed", dies 2026-11-30
refusal-guard-ungated         | CARRY  | The refusal-survives-its-own-consequences guard is UNGATED        | lifted | #481 -> Tooling, dies 2026-11-15 (cross-linked per P3-G)
type-rower-hardcoded          | CARRY  | type: "rower" is still hardcoded for machines the denylist admits | lifted | #481 -> Wave E, rides the send-fence PR (TRIAD)
pre-2018-classification       | CARRY  | A monitor on pre-2018 firmware cannot be classified at all        | lifted | #481 -> Icebox with the firmware-read row, dies 2026-11-13
connected-1703-poison         | STRIKE | connected.spec.ts:1703 poisons its own origin for a later run     | struck | James 2026-09-19. Mechanism measured false: no storageState/persistent context; two-test probe in docs/history/wave-d.md; the symptom is a server page.request.post (e2e/helpers.ts) made before page storage exists. Verbatim in docs/history/register-evictions-2026-09-19.md
screenshots-churn             | DONE   | pnpm screenshots rewrites 64 of 201 captures on every run         | closed | reconciled by #377; churn itself CLOSED as a process rule, #395
design-3540-flake             | DONE   | design.spec.ts:3541 flakes under a full parallel run              | closed | folded into the stableBoundingBox record, now FLAKE 5's last paragraph (#476)
waveE-entry-row               | DONE   | We never check WHICH Concept2 machine is attached                 | closed | ticked in Wave E, "SHIPPED as Phase MT (#366)"
```

Stop rule: every frozen row is DONE with a tree receipt, CARRIED to a named
home with a date, or STRUCK with a measured receipt. **Satisfied.**

### Exit criteria (spec `docs/superpowers/specs/2026-09-08-unsupported-erg-machine-design.md`)

PROVEN in tree on 2026-09-19: criteria 7 and 10. INFERRED, and said so rather
than re-derived: criteria 1-6, 8 and 9 rest on #366's merged PM final-PR gate
and on CI at the tags that carry them.
