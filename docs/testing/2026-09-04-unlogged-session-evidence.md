# Unlogged session recovery evidence — 2026-09-04

The connected browser journey drives the real fake transport through five
`w 100m max r0.1` intervals: six-second positive rests, five resting-state
boundaries, `WORKOUTEND`, then the summary burst. It retains
`endedBy: "finished"`, work totals 110 s/500 m, literal actuals
20/21/22/23/24 s at 100 m, and each boundary's 6 s/12 m rest payload. The
same shared journey completes warning → View → Today → Review → failed Save
retry → history → quiet later warning twice: once in-process after leaving,
and once after cold hydration. Warning → View leaves the retained-storage
bytes unchanged in each leg.

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
the axe scans have zero WCAG 2A/2AA violations, and the combined sweeps check
the existing token/ink contrast oracle. The generated Mac captures
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

All 29 recovery captures, including initial-position and action-focused
variants, were opened. They measure exactly 390×844 or 844×390; wrapped long
titles do not create horizontal overflow. Healthy, missing-type, legacy,
unavailable, pending, and failed surfaces remain clear at their recorded
viewport. The refreshed 844×390 singular and plural warning captures show the
mounted, non-animated centered reveal: **View unsaved**, **Cancel**, and
**Connect anyway** all sit above the fixed Main nav; **View unsaved** starts
focused and Tab reaches Cancel. This is an intentional programmatic viewport
position, not a claim that the unscrolled document has no vertical extent.
Ink `rgb(27,26,23)` on page `rgb(244,241,232)` measures 15.41:1.

Sensitivity ran after real test commits and restored every source hash with
`apply_patch`. Changing **View unsaved** to Cancel made both current warm and
cold complete journeys fail the `/today` assertion; warning source restored to
SHA-256 `b0e93a0b5b18c88ae67c0996664e1311731e5848e7578de4421e55f22e2695fb`.
Inverting `UnsavedWorkouts`' nonempty return made the long-title/failing-fetch,
pending/failed, and both-source Today registrations fail (the fallback case
alone still passed); its SHA-256 restored to
`a123d65d4cfd215e7068c2b35eca02eae953551a0a956cbdd1abe65d0fba4cef`.
Inverting the singular/plural warning words made the both-source/count
registration fail its singular warning oracle. Removing the legacy recording
textarea's `readOnly` attribute made the fallback registration fail exactly at
its `readonly` oracle (three of the four registration cases still passed);
`ReadOnlyRecording.tsx` restored to SHA-256
`c038239e3588a3e5f6e6f8c29c6d8a7884e5a5396fee5eaa6a98e6b53002ea09` and all
four passed again. This maps every new connected/design behavior to a red
deciding-source probe; no production source remains changed.

Review-round safe-exit sensitivity removed the warning's focus/center-reveal
effect after commit. The real 844×390 browser witness failed with **View
unsaved** bottom `458.59375` beyond fixed-nav y `345`; restoring with
`apply_patch` returned the source to SHA-256
`13c2bf6291ee336f62aab4a26572299f7cd0b12a03f4a1682d6ef351486064f0` and the
focused witness passed. The same focused unit caller test asserts initial View
focus, and the recovery design sweeps now execute token/contrast checks in
both orientations for singular, plural, BOTH-source, fallback, pending, and
failed states.

The full E2E run recorded 459 passes and one unrelated-to-scenario but not
yet unrelated-to-code symptom: `retest.spec.ts` "Phase BL RACE THE 2K reaches"
timed out waiting for **SESSION SAVED** after Save. The uninstrumented standard
run retained no request/response trace. The focused, real-stack rerun passed
1/1 with one `POST /api/logs` → 201 and a 2K payload; it now attaches its
safe-fixture readiness, method/path/status, and body (without auth headers) on
any future failure. This eliminates neither the original request nor a shared
`LogSession`/save cause: the strongest supported classification remains
intermittent and unclassified, not a recovery-proof failure or a basis for a
Task 2 production change. The prior full E2E rerun on the restored committed
tree passed 460/460; it does not erase the earlier failure or establish a
cause. After the warm/cold split, the pre-review full E2E run passed 461/461
(2.1m). The review-round restored-tree full E2E run passed 462/462; it likewise
does not establish a cause for the original timeout.

Current combined-fix gate record: `pnpm lint`, `pnpm typecheck` (E2E
TypeScript membership 19/19), `pnpm format:check`, and `pnpm build` plus
`pnpm dist:grep` passed; build retains its existing Vite chunk advisory.
The final full `pnpm test:coverage` (unit, client, **and integration**)
passed 257 files / 7,097 tests (one skipped), at 98.74% statements, 97.14%
branches, 98.91% functions, and 99.21% lines. This supersedes the earlier
**scoped** `pnpm test:coverage --project unit --project client` result of 233
files / 6,710 tests (one skipped), which intentionally did not include the
integration project.

The final review admission tests add mounted read-only witnesses for malformed
actual index, elapsed time, distance, split, stroke rate, heart rate, rest
distance, rest duration, and interval type; all nine `summaryDetail` members;
and fractional/string verification bytes. A healthy mounted save witness keeps
nullable actual observations, absent optional rest/type observations, complete
machine detail, and integer verification bytes in their supported forms and
asserts the persisted machine payload. These characterization tests began
GREEN against the existing guard. A post-commit deciding-source probe bypassed
`requireProgrammedMeasurements`; all 20 malformed witnesses then mounted the
save-capable summary instead of the exact read-only recording. Restoring the
guard returned the targeted run to 21/21 passed and restored
`recoveryValidation.ts` to object hash
`cc2fa1d0a4c6e18127a3d68ef16cfe9748455534`. Its final coverage is 100%
statements/branches/functions/lines, so no admission branch is left without a
behavioral disposition.

The same combined fix requires the linked global library row's designated
title to agree with the retained title before a test offer. Mounted timer and
monitor witnesses cover both disagreement directions, successful ordinary
saving, unchanged retained POST title and no test-history write. After the real
commit, disabling title agreement caused three pure/mounted witnesses to
offer a baseline incorrectly; restoration returned the targeted disagreement
run to six passes and `postTestOffer.ts` to object hash
`95a147e0686e98f15f5e304049e6cbfed4741343`. Agreeing known tests retain their
existing offer and calculations. The conservative renamed-title cost is
recorded in [implementation decisions](2026-09-04-unlogged-session-decisions.md).

The out-of-scope global ≤360px screen-padding override was removed. A live
360px recovery witness measures the original safe-area-aware 20px inset;
restoring the old override after commit made it fail at 16px. Surgical
restoration returned the witness to one pass and `index.css` to object hash
`bb090b3760ec5b48026e5ac11142732f6967403d`. This witness began after removal,
so its sensitivity probe is not claimed as historical pre-removal TDD.
Existing 390px/landscape captures are outside that changed breakpoint; the
full screenshot run passed and no generated PNG churn was retained. Stale
fixed-height/accent-border arming descriptions now match the approved
content-replacement layout; the connected fixture's boundary comment now
names REST. Combined focused recovery/offer tests pass 106/106.

Coverage HTML was read for the changed recovery surfaces:
`ReviewSession.tsx` 97.77% statements / 97.82% branches,
`recoveryValidation.ts` 100% / 100% / 100% / 100%,
`postTestOffer.ts` 100% / 100% / 100% / 100%, and `LogSession.tsx` 98.26% /
95.62% branches / 96.87% functions / 98.42% lines. `Today.tsx` remains
99.18% / 97.91% and `UnsavedWorkouts.tsx` 97.77% / 95.65%. The changed
`UnsavedWorkoutWarning.tsx` is 80% statements / 80% branches / 100%
functions / 88.88% lines: the only uncovered paths are its defensive null ref
and jsdom's unavailable `scrollIntoView` true branch; the current browser
witness exercises the latter against Chromium. The prior full browser gate
passed 463/463 and its sequential screenshot gate 118/118 after the product
fixes. They remain current because this final addition changes only client
tests and evidence, not browser/product code.

Native acceptance is an approved criterion but still pending James. Its
operator protocol is a **proposed** phone acceptance walk at
`docs/testing/2026-09-04-unlogged-session-phone-walk.md`; browser evidence
does not replace hardware approval, rowing, phase-close review, or merge
authorization.
