# Walk 2026-09-01 — Phase JR exit walk

Purpose: the spec's exit walk (`docs/superpowers/specs/2026-08-24-just-row-design.md`,
"Exit walk"): a real Just Row on the shipped build, both screens compared,
ended once by Done (app) and once by Menu (erg).

## Provenance

| Piece | Ending | Evidence files | Recording |
| --- | --- | --- | --- |
| 1 | Done, in the app | `piece1-pm5-memory.jpg` (PM5), `piece1-app-log.png` (app) | NONE — see below |
| 2 | Menu, on the erg | `piece2-pm5-memory.jpg` (PM5), `piece2-app-saved-row.png` (app) | NONE — see below |

**This walk has no wire recordings and cannot have any.** It ran on the
native TestFlight build (0.32.0, build 811) against prod; the recording
tap is a dev/web-only seam (record-replay Stage A, PR #100) and does not
ship in native builds. The conductor asked the operator for a
`RECORDING · DOWNLOAD` that does not exist on that build — the skill now
says this in two places so the ask cannot recur. Evidence is photos plus
the saved prod rows.

**Photo pairs are CORRELATED, not SAME-FRAME** — each piece's PM5 photo
and app capture were taken separately. Correlators: piece 1 — same date
(Sep 01), digit-identical 311 m and 2:27.4 split, and the app header
names the connected device `PM5 432331249`; piece 2 — digit-identical
1:33.7 work seconds and 300 m between the PM5 memory entry and the app's
`MACHINE CONFIRMED` block, plus verification code `D338-90E8 741A-42C1`
on the saved row. A correlated pair settles less than a same-frame shot;
for this walk's question (transcription of the PM's numbers) the
digit-identity across independent captures is the check.

## Transcriptions

Piece 1 (Done-ended, app screen photographed pre-save):

| Stream | Time | Distance | Avg split | Rate |
| --- | --- | --- | --- | --- |
| PM5 memory (SCREEN) | 1:31.7 | 311 m | 2:27.4 | 24 |
| App log door (SCREEN) | 1:32 | 311 m | 2:27.4 | not shown |

Arithmetic: 500 × 91.7 ÷ 311 = 147.4 s = 2:27.4 ✓. The app's 1:32 is
91.7 rounded. The spec expected the PM entry LONGER than the app's on a
Done-ended row (coast-down); the observed delta is ≤0.3 s — effectively
zero for this run. Recorded as the delta, not as disagreement.

Piece 2 (Menu-ended, app screen is the SAVED row):

| Stream | Time | Distance | Avg split | Rate |
| --- | --- | --- | --- | --- |
| PM5 memory (SCREEN) | 1:33.7 | 300 m | 2:36.1 | 23 |
| App saved row (SCREEN) | 1:34 shown, 1:33.7 machine | 300 m | 2:36.1 | not shown |

Arithmetic: 500 × 93.7 ÷ 300 = 156.2 s = 2:36.2, within a tenth of both
screens' 2:36.1 (inputs truncated to tenths). Work seconds, metres and
split digit-identical. The Wave F machine-confirmation stamp fired on a
free row: `MACHINE CONFIRMED · WORK ONLY, 1:33.7 work · 300m`, code
`D338-90E8 741A-42C1`.

## Findings

1. **PASS — both endings store the machine's row.** Done-ended and
   Menu-ended free rows both landed in the log with the PM's own
   numbers; the Menu-ended row compared digit-identically and carries
   the machine-confirmation stamp.
2. **Save failed on first attempt — prod was frozen at v0.31.0** (pre
   JustRow PR 1, so the server rejected free-row shapes). Root cause was
   NOT the app: every deploy since v0.31.0 had been refused by
   `deploy.sh:15` because the host checkout was dirty — four EMPTY
   untracked files (`0`, `actualMeters`, `actualSeconds`,
   `actualSource`), shell-redirect droppings from an unquoted query run
   on the host (created Sep 1 07:14). Removed with James's approval,
   deploy rerun, prod moved to `v0.33.0-1-gd0af902`, save then
   succeeded on the retry. **The app's failure path worked as designed:**
   the row was held, the error named the failure, and the retry saved
   the same numbers — AUD-015/016's invariant, observed live on prod.
3. **James: the Just Row ready screen should match the programmed
   ready view** (or be the same view) — `finding-ready-screen.png`.
   Design-consistency item for the phase close.
4. **James: connecting via Just Row leaves the PM5 on its main menu** —
   the erg shows nothing changed, so the connection reads as a no-op.
   Wanted: the app drives the erg into a Just Row session on connect.
   Wire-semantics question (can a central command the PM5 onto its Just
   Row screen? ErgData appears to). Gets the research pass and
   antagonist treatment before any mechanism is invented; goes to the
   phase close.
5. **Skill defect, fixed in this PR:** the walk plan asked for
   recordings a phone walk cannot produce (see Provenance).

## Scope

This PM5 (the app's device row names it `432331249`; the physical serial
was not photographed and firmware was NOT captured), these two runs,
build 0.32.0 (811) against prod `v0.33.0-1-gd0af902`, 2026-09-01
evening. Nothing here generalises beyond that device and those runs.
