# Free row: the sending card (Gate 0)

**GATE 0 PASSED — James, 2026-09-03, "approved".**

Artifact: https://claude.ai/code/artifact/a0fdc02d-ed85-4b2f-903c-aaaab27c004d
Rendered copy kept here as `gate.html` (the artifact is the thing he saw;
this is the record).

## What was approved

A third card state on the free-row door, between "Connecting to monitor"
and "Ready when you pull":

- status label: `<DEVICE> · CONNECTED`
- serif line: **Starting your row**
- checklist: FOUND done, CONNECTED done, **STARTING THE ROW** current
- actions: Cancel only (`.button-l2`)

Every value is lifted from the two cards either side of it and from the
workout's own programming card. No new colour, type size or component.

## The two open questions, and how "approved" resolved them

1. **The words.** Approved as drawn: "Starting your row" over "STARTING THE
   ROW". The alternative offered and not taken was "Sending the program".
2. **An unanswered monitor.** Approved as recommended on the page: the card
   FALLS THROUGH to Ready when the send is not answered inside the
   deadline, rather than showing the workout's failure card. A free row
   needs nothing from the monitor to be rowable, so a failure card would
   block a row that would have worked.

## Correction made during the gate

James: *"the 'Show me the numbers' button should be red i think, compare to
the workout screens"*. He was right and the app already agreed: both the
free-row door and the workout interstitial use `.button-l1` for it today
(accent, `--on-color` text, 56px), and Cancel is `.button-l2` (surface,
1px `--ink` border, 52px). The first draft of the page drew both as neutral
outlines — an approximation where the rule is to lift the shipped value.
Corrected before approval; the ready card itself changes nothing.

## Contrast, computed (RF6)

| Element | Pairing | Ratio | Floor |
| --- | --- | --- | --- |
| Status label | `--ink-3` #57544c on `--page` #f4f1e8 | 6.69:1 | 4.5 passes |
| Serif line | `--ink` #1b1a17 on `--page` #f4f1e8 | 15.41:1 | 3.0 large, passes |
| Checklist, done and current | `--ink` #1b1a17 on `--page` #f4f1e8 | 15.41:1 | 4.5 passes |
| Body line | `--ink-2` #3f3c35 on `--page` #f4f1e8 | 9.74:1 | 4.5 passes |
| Show me the numbers | `--on-color` #fffdf7 on `--accent` #b5341f | 5.94:1 | 4.5 passes |
| Cancel | `--ink` #1b1a17 on `--surface` #fffdf7 | 17.11:1 | 4.5 passes |
| Pending marker | `--rule-3` #c9c3b2 on `--page` #f4f1e8 | 1.56:1 | not text |

Hit targets: `.button-l1` 56px, `.button-l2` 52px, both clear of 44px.
