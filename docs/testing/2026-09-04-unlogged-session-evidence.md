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

Gate record: `pnpm lint`, `pnpm typecheck`, and `pnpm format:check` passed;
`pnpm test` and `pnpm test:coverage` passed 257 files / 7063 tests (one
skipped), with coverage 98.75% statements and 97.16% branches; `pnpm build`
passed with its existing 637.71 kB Vite chunk advisory; and sequential
`pnpm screenshots` passed 118/118. Coverage HTML was read for recovery
surfaces: `ReviewSession.tsx` 97.72% statements / 97.82% branches,
`Today.tsx` 99.18% / 97.91%, `UnsavedWorkouts.tsx` 97.77% / 95.65%, and
`LogSession.tsx` 98.26% / 95.56%.

Native acceptance is an approved criterion but still pending James. Its
operator protocol is a **proposed** phone acceptance walk at
`docs/testing/2026-09-04-unlogged-session-phone-walk.md`; browser evidence
does not replace hardware approval, rowing, phase-close review, or merge
authorization.
