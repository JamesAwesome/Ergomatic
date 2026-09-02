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
digit-identity across independent captures is the check. **Said
honestly (exit pass, 2026-09-01):** the digit-identity IS the finding,
so it cannot also be the correlator — the real correlator is the
operator's testimony that each pair is the same run, and that is what
this record rests on. Same-frame was achievable here (a post-row phone
screen beside the PM's memory entry sit still) and is the ask next time.

**Scope of the build and server:** build 811 = v0.32.0. The server it
saved against was `v0.33.0-1-gd0af902`, but
`git diff --name-only v0.32.0..d0af9022` returns zero paths under
`app/server/` or `drizzle/`, so every route was byte-identical to the
tag's. The CLIENT hook a free row shares (`useMonitorSession.ts`) took
#258's changes in v0.33.0 the same day — this walk is scoped to build
811 and says nothing about that hook as it now stands.

## Transcriptions

Piece 1 (Done-ended, app screen photographed pre-save):

| Stream | Time | Distance | Avg split | Rate |
| --- | --- | --- | --- | --- |
| PM5 memory (SCREEN) | 1:31.7 | 311 m | 2:27.4 | 24 |
| App log door (SCREEN) | 1:32 | 311 m | 2:27.4 | not shown |

Arithmetic: 500 × 91.7 ÷ 311 = 147.4 s = 2:27.4 ✓. The app's 1:32 is
91.7 rounded (the PM5 TRUNCATES to 1:31 in its list — one quantity, two
renderings; a note for the follow-on slate). The spec expected the PM
entry LONGER than the app's on a Done-ended row (coast-down). **That
expectation was wrong against the shipped code, and the near-zero delta
is structural, not observed:** the app's End awaits `driver.terminate()`
(`useMonitorSession.ts`, `endSession`), so the MACHINE's workout ends in
the same instant and there is no pre-Menu gap to accumulate. The delta
measures nothing and is recorded here only so nobody reads agreement-by-
construction as agreement-by-measurement.

**`piece1-app-log.png` is the log DOOR, not a saved row** — it shows the
FIRST save failing (`Couldn't save this session. Try again.`), and the
door does not render the machine-confirmation block, so this capture
cannot say whether the app-End burst arrived. James's OPERATOR REPORT
(2026-09-01, after the retry saved): the row was machine-confirmed.
Accepted on that report; no artifact exists for it.

Piece 2 (Menu-ended, app screen is the SAVED row):

| Stream | Time | Distance | Avg split | Rate |
| --- | --- | --- | --- | --- |
| PM5 memory (SCREEN) | 1:33.7 | 300 m | 2:36.1 | 23 |
| App saved row (SCREEN) | 1:34 shown, 1:33.7 machine | 300 m | 2:36.1 | not shown |

Arithmetic: 500 × 93.7 ÷ 300 = 156.2 s, which `fmtSplit` would render
as 2:36.2 — one digit off both screens' 2:36.1. It reconciles if the
machine's true distance is ~300.2 m (displayed 300 after rounding); the
hand arithmetic inherits the display's truncation, no defect. Work
seconds, metres and split digit-identical. The Wave F machine-confirmation stamp fired on a
free row: `MACHINE CONFIRMED · WORK ONLY, 1:33.7 work · 300m`, code
`D338-90E8 741A-42C1`.

## Findings

1. **PASS — both endings store the machine's row.** The Menu-ended row
   has the artifact: digit-identical numbers and the machine-confirmation
   stamp on a free row. The Done-ended row's landing rests on James's
   operator report (machine-confirmed after the retry) — its only capture
   is the failed-save door, see the piece 1 note above.
2. **Save failed on first attempt — prod was frozen at v0.31.0** (pre
   JustRow PR 1, so the server rejected free-row shapes). Root cause was
   NOT the app: every deploy since v0.31.0 had been refused by
   `deploy.sh:15` because the host checkout was dirty — four EMPTY
   untracked files (`0`, `actualMeters`, `actualSeconds`,
   `actualSource`), shell-redirect droppings from an unquoted query run
   on the host (created Sep 1 07:14). Removed with James's approval,
   deploy rerun, prod moved to `v0.33.0-1-gd0af902`, save then
   succeeded on the retry. **What the app did:** it held the record, put
   up `LogSession.tsx`'s one generic failure line (the same string for
   every non-ok status and every thrown exception), and the retry ~20 min
   later saved the same numbers. That is correct and worth having. It is
   NOT AUD-015/016's invariant (both are LOCAL durability — Countdown's
   `saveRun`, `saveMonitorRun`; AUD-015 is still open) and an earlier
   revision of this line cited them as validated here — withdrawn. The
   honest residual: **the app cannot tell a permanent rejection from a
   transient one, and "Try again." promised a retry only a server fix
   could satisfy.** Whether the app was backgrounded between the failed
   save and the retry was not asked and is unknown.
   **And the freeze was loud, not silent:** main's `deploy` job failed on
   six consecutive pushes over eleven hours (#255, #259, #260, #258,
   #261, #263) — the phase's own PRs and its tag — and nobody read it;
   the walk found it. v0.32.0 was briefly on TestFlight against a server
   that could not accept its headline feature. Lesson landed in
   `docs/RELEASING.md` (step 0) and CLAUDE.md recurring failure 28.
3. **James: the Just Row ready screen should match the programmed
   ready view** (or be the same view) — `finding-ready-screen.png`.
   Design-consistency item for the phase close.
4. **James: connecting via Just Row leaves the PM5 on its main menu** —
   the erg shows nothing changed, so the connection reads as a no-op.
   Wanted: the app drives the erg into a Just Row session on connect.
   **The close gate found the research already in the repo:** the
   walk-2026-08-31 record answers OPEN 5 (pulling from the menu with the
   app connected auto-enters Just Row — the erg WORKS; this is an
   acknowledgment gap), and Concept2's p.80 JustRow frame
   `F1 76 07 01 01 01 13 02 01 01 61 F2` (`SET_WORKOUTTYPE` +
   `SET_SCREENSTATE(PREPARETOROWWORKOUT)`) is transcribed at
   `docs/monitor/pm5-interface-notes.md:204`, with `SET_SCREENSTATE`
   already emitted by our programming sequence. No research pass; one
   driver change plus one walk leg, carrying RC-38. Queued in ROADMAP.
5. **Skill defect, fixed in this PR:** the walk plan asked for
   recordings a phone walk cannot produce (see Provenance).

## Scope

This PM5 (the app's device row names it `432331249`; the physical serial
was not photographed and firmware was NOT captured), these two runs,
build 0.32.0 (811) against prod `v0.33.0-1-gd0af902`, 2026-09-01
evening. Nothing here generalises beyond that device and those runs.
