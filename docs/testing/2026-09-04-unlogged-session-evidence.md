# Unlogged session recovery evidence — 2026-09-04

The connected browser journey drives the real fake transport through five
`w 100m max r0.1` intervals: six-second positive rests, five resting-state
boundaries, `WORKOUTEND`, then the summary burst. It retains
`endedBy: "finished"`, work totals 110 s/500 m, literal actuals
20/21/22/23/24 s at 100 m, and each boundary's 6 s/12 m rest payload. It
opens Review in-process after leaving, then cold-reloads before the warning
and Save leg. Warning → View leaves the retained-storage bytes unchanged.

No POST occurs on Review entry. The first Save traces POST with series → 500,
POST without series → 500; no history row or retirement follows. Explicit
retry sends the third POST, preserves the original title/provenance/actuals in
history, retires the record, and a later Connect does not warn. The measured
trace is the documented `useLogForm` series-sacrifice retry contract, not a
product seam failure.

`RC-8` remains the known fake-encoder residual: for a five-interval zero-rest
fixture `fake.ts` uses resting-conditional `toMachineIndex` while
`toActualIndex` always subtracts, yielding `[0,0,1,2,3]` plus a synthesized
fifth actual. This proof uses the supported positive-rest producer and its
literal `[0,1,2,3,4]` oracle; RC-8 in the roadmap owns the residual.

The design registrations cover 390×844 and 844×390: retained PM5 plus timer,
singular/plural warnings, missing-type Save-disabled summary, read-only legacy
Copy/Keep, unavailable Back Today, and retained Today rows while the library
request is pending or fails. Every registered control has a ≥44 px target and
the axe scans have zero WCAG 2A/2AA violations. The generated Mac captures
map state to image as follows (each pair is portrait/landscape):

- PM5 Today: `recovery-today-portrait.png`, `recovery-today-landscape.png`;
  PM5 plus timer: `recovery-today-both-portrait.png`,
  `recovery-today-both-landscape.png`, with the timer action focused in
  `recovery-today-both-portrait-timer-actions.png` and
  `recovery-today-both-landscape-timer-actions.png`.
- Singular warning: `recovery-warning-singular-portrait.png`,
  `recovery-warning-singular-landscape.png`; plural warning:
  `recovery-warning-plural-portrait.png`,
  `recovery-warning-plural-landscape.png`; focused landscape actions are
  `recovery-warning-singular-landscape-actions.png` and
  `recovery-warning-plural-landscape-actions.png`.
- Missing type: `recovery-missing-type-portrait.png`,
  `recovery-missing-type-landscape.png`, with `-actions.png` companions;
  read-only legacy: `recovery-read-only-portrait.png`,
  `recovery-read-only-landscape.png`, with `-copy-actions.png` and
  `-keep-actions.png` companions for each orientation;
  unavailable: `recovery-unavailable-portrait.png`,
  `recovery-unavailable-landscape.png`.
- Pending Today: `recovery-today-pending-portrait.png`,
  `recovery-today-pending-landscape.png`; failed Today:
  `recovery-today-failed-portrait.png`,
  `recovery-today-failed-landscape.png`. Healthy Review is
  `recovery-review.png`.

All 29 recovery captures, including the initial-position and action-focused
variants, were opened. They measure exactly 390×844 or
844×390; wrapped long titles do not create horizontal overflow. Healthy,
missing-type, legacy, unavailable, pending, and failed surfaces remain clear
at their recorded viewport. The warning images intentionally show a different
landscape observation: in
`recovery-warning-singular-landscape.png` and
`recovery-warning-plural-landscape.png`, the warning begins below the 390 px
viewport/nav, so **View unsaved**, **Cancel**, and **Connect anyway** are not
initially visible and require ordinary vertical page scroll. This is recorded
for phase-close usability review, not silently treated as no-overflow proof.
Ink `rgb(27,26,23)` on page `rgb(244,241,232)` measures 15.41:1.

Sensitivity after the real test commit: changing **View unsaved** to call
Cancel made the connected recovery journey fail its `/today` route assertion;
the source was restored with `apply_patch` and its original SHA-256 matched.
Removing the legacy recording textarea's `readOnly` attribute made the new
fallback registration fail exactly at its `readonly` oracle (three of the four
registration cases still passed); `apply_patch` restored SHA-256
`c038239e3588a3e5f6e6f8c29c6d8a7884e5a5396fee5eaa6a98e6b53002ea09` and all
four passed again. The new warning, retention, fallback, and pending/failed
assertions are independently literal browser oracles; no production source
remains changed for this test task.

The full E2E run recorded 459 passes and one unrelated-to-scenario but not
yet unrelated-to-code symptom: `retest.spec.ts` "Phase BL RACE THE 2K reaches"
timed out waiting for **SESSION SAVED** after Save. The uninstrumented standard
run retained no request/response trace; a focused rerun passed 1/1. Therefore
the strongest supported classification is intermittent and unclassified,
including possible shared `LogSession`/save involvement—not a recovery-proof
failure or a basis for a Task 2 production change.

Native acceptance is an approved criterion but still pending James. Its
operator protocol is a **proposed** phone acceptance walk at
`docs/testing/2026-09-04-unlogged-session-phone-walk.md`; browser evidence
does not replace hardware approval, rowing, phase-close review, or merge
authorization.
