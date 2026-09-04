# Unlogged session recovery evidence — 2026-09-04

**Current review: admission fix verified and scoped rereview clean.** The prior
re-review of `239bcd4a..303856a4` cleared designated-test identity, narrow CSS
scope and stale comments, but found that empty/out-of-range integer
`verificationBytes` passed the new guard. With machine totals present,
Save forwards those bytes; the existing server requires 1–32 integers in
0–255 and rejects them (`app/server/routes/data.ts:818-852`). The exact-recording
read-only fallback is now used instead. James approved one focused follow-up;
commit `c1e2c4c7` adds the missing admission checks and mounted witnesses, with
fresh gates and sensitivity probes recorded below. The one authorized scoped
rereview of `1829dea2..11d9a122` returned **ADDRESSED**, with no new findings:
the guard matches the server contract and failed admission preserves the exact
recording in read-only fallback. Native-door acceptance and PM phase-close
review subsequently passed as bounded below. James subsequently authorized
"Merge when green"; combined-tree verification and PR CI remain required.

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

Prior combined-fix gate record: `pnpm lint`, `pnpm typecheck` (E2E
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
statements/branches/functions/lines. That establishes execution of existing
branches, not completeness of the predicate: the missing byte-length/range
checks remained invisible to this coverage number and were found in review.

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
fixes, before the verification-byte follow-up below. The screenshot result
remains applicable to the unchanged visual design, not a fresh run.

The authorized verification-byte follow-up closes the final rereview's only
residual; its one scoped rereview returned **ADDRESSED**, with no new findings.
`recoveryValidation.ts` now admits an optional `verificationBytes`
field only when it is a JSON array of 1–32 integer bytes in 0–255; it leaves
the original array untouched and sends all other persisted shapes to the
existing read-only recovery path. Before that production edit, mounted empty,
33-byte, `[-1]`, and `[256]` recordings each RED-failed because they mounted a
save-capable summary. Object, string, and null non-array characterization
cases were already GREEN/read-only; that fact is not presented as a new RED
history. Green witnesses save `[0]` and a 32-byte array ending in `255`, and
assert the actual `machineSummary.verificationBytes` POST payload byte-for-byte.

Post-commit deciding-source probes used `apply_patch` and restored
`recoveryValidation.ts` exactly to SHA-256
`b64ede8847db4c620682402a9a49032d96ee6e692d91deee50130174446fe143`.
Removing the length checks made the empty/33-byte mounted read-only witnesses
RED; removing range checks made the negative/256 witnesses RED. Tightening
each accepted boundary also made its Save witness RED: 1→2 bytes, 32→31 bytes,
0→1, and 255→254. The `Array.isArray` predicate has no independently
observable JSON-persisted mutation: object and null fail at the subsequent
length/iteration operations, strings reach the finite-number rejection, and
JSON has no persistable numeric non-array iterable (sets and typed arrays
serialize as objects). The mounted non-array cases and complete 100% branch
coverage therefore exercise its reachable behavior without inventing a
non-JSON producer solely for a redundant mutation.

Current authorized-follow-up gates: `pnpm lint`, `pnpm typecheck` (E2E
TypeScript membership 19/19), `pnpm format:check`, `git diff --check`, and
`pnpm build && pnpm dist:grep` passed; the build retains the existing Vite
chunk advisory. Fresh full `pnpm test:coverage` (unit, client, and
integration) passed 257 files / 7,106 tests (one skipped), at 98.74%
statements, 97.15% branches, 98.91% functions, and 99.21% lines.
`recoveryValidation.ts` is 100% statements (44/44), branches (42/42),
functions (5/5), and lines (41/41). The first fresh full `pnpm e2e` run had
one failure, `e2e/retest.spec.ts:169` “declining the offer keeps the baselines
untouched”: after Save, the heading `Set your 2k baseline?` was not found
within 5 seconds. Playwright emitted an `error-context.md`, but subsequent
passing reruns cleaned it; its `2k-save-trace` response/readiness attachment
does not cover this decline test (it is attached only to the preceding
accept-offer test), so no captured request/response data establishes a cause.
The real-stack isolated decline rerun passed 1/1 and the fresh restored-tree
full rerun passed 463/463 in 2.2 minutes. The symptom remains intermittent
and unclassified. Screenshots were deliberately not rerun: this follow-up
changes only validation logic and mounted unit tests, with no CSS, layout,
copy, or browser fixture change; the prior 118/118
visual run is historical evidence only.

Native-door acceptance passed on build 875 (`d8709c6d`), Kaito iPhone 17 Pro
on iOS 26.6.1, against the production API reporting `04b7964e`. James
explicitly confirmed recovery, successful Save and removal from Today's
unsaved section. Three portrait screenshots show Today discovery and the
completion summary/save actions. The [phone record](../monitor/sessions/walk-2026-09-04-recovery/README.md)
transcribes each and preserves the exact operator confirmations. PM phase-close
review passed this bounded native-door criterion. An identified before/after
summary pair, saved-history image, native landscape warning visibility and a
later Start/Connect no-warning observation are not independently established.
No repeat rowing or extra captures are required for this claim ceiling.
Main `2f258006` is not part of the walked candidate. It was subsequently
integrated in `0816445c`, after James authorized "Merge when green". The
combined-tree gates below passed; exact-head PR CI remains required.

## Current combined-tree integration verification

Integration `0816445c` preserves the selected programmed recovery body and
upstream Concept2 completion metadata together. The PM5 Save receives the
selected run's `completedAt` and timezone through `completionStamp`; timer
saves remain unstamped. Both recovery and Concept2 design registration blocks
survive the merge. Scoped source review at `f56a1b83` returned PASS, no findings.

Commit `f56a1b83` extends the existing selected monitor/timer Save witness to
assert the paired PM5 fields and their absence for timer. It began GREEN 2/2,
not RED-first. After committing, removing the PM5 stamp made the monitor case
fail: expected completedAt `2026-09-04T12:30:00.000Z`, received undefined.
Restoration returned 2/2 and LogSession SHA-256
`1eda16fab823f9f4e83cf961f611b378cf39b7fcd9fecb4994b637b538f86a7b`.

Fresh `pnpm lint`, `pnpm typecheck` (E2E census 20/20), `pnpm format:check`,
`git diff --check`, `pnpm build` and `pnpm dist:grep` passed. Full coverage
passed 264 files, 7,317 tests and one skipped, at 98.76% statements / 97.19%
branches / 98.94% functions / 99.24% lines. Coverage HTML records
`completionStamp.ts` 100/100/100/100, `LogSession.tsx`
98.26/95.62/96.87/98.42, `ReviewSession.tsx` 97.77/97.82/100/97.67, and
`JustRowLog.tsx` 95.18/86.45/100/100 in the same metric order.

Full E2E passed 487/487 (2.3 minutes). The sequential combined screenshot
suite passed 126/126; linked Concept2, sent-log and recovery captures were
opened and inspected. Date/fixture-only regenerated PNG churn was restored;
no new capture changes were retained. The earlier unclassified retest failures
remain historical observations, not findings attributed away by this pass.
This combined-tree browser verification does not relabel the earlier native
build as containing the incoming Concept2 changes.
