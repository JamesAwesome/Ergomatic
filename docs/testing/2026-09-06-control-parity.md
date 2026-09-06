# Connect and target-nudge parity — 2026-09-06

Unsupported web browsers keep Connect inactive before a press can open an
error screen. Target nudge buttons read down then up, with their existing
numeric directions: down is one split second faster, up one second slower.

## Control census

Source census: `rg -n '<StepRow|<ConnectAction|session\.connect\(' app/src
-g '*.tsx' -g '!*.test.*'`, plus the `/library/` and `/justrow` links and
routes. This establishes call sites, not hardware reachability.

| Surface | Control owner | Disposition |
| --- | --- | --- |
| Workout detail, `/library/:id` | `ConnectAction`, `StepRow` | Shared support check; nudge DOM order is `▼▲`. |
| Just Row, `/justrow` | `ConnectAction` | Same support check from the first render. |
| Development observer, `/justrow/observe` | `JustRowObserver` | Same support check; route exists only in dev/e2e builds. |
| Workout interstitial Try again | `ConnectedInterstitial` | Reached after an enabled Connect; retains retry for scan, permission and programming failures. |
| Just Row Try again / Row instead | `JustRow` | Reached after an enabled Connect; retains retry for scan/program failures and busy-monitor recovery. |
| Builder pace, duration, SPM and rest controls | `PaceRefInput`, `Stepper` | Already decreasing before increasing (`−/+`). |
| Baseline editor and both onboarding input doors | `BaselineField` | Already decreasing before increasing (`−/+`). |

Workout detail is reused by the library list, Today's recommendation,
baseline re-test shortcuts, onboarding's row-to-find links, builder edit/save,
and return links from countdown/logging. These links create no separate
Connect or target-nudge control. Today's Just Row link reaches the same
`/justrow` route. There is one `StepRow` call site, in `WorkoutDetail`.

## Capability and scope

PRIMARY: [Chrome's Web Bluetooth documentation](https://developer.chrome.com/docs/capabilities/bluetooth)
identifies `navigator.bluetooth.requestDevice` as the browser's connection
entry point and documents supported platforms including Chrome for Android.
The app therefore checks capability rather than disabling every mobile browser.

INFERENCE from `adapters/monitorTransport.ts`,
`adapters/bluetoothCapability.ts` and `monitor/transports/index.ts`: native
uses the Capacitor transport; web requires its Bluetooth API, except for an
actual injected monitor script behind the existing dev/e2e build gate.
The synchronous UI check follows those choices without constructing a
transport or opening a chooser. An asynchronous radio-availability probe
continues to supply workout-detail captions; it does not decide support.

No number meaning, stored shape, auth, protocol or device command changes.
No PM/antagonist gate; independent requirements and code-quality reviews
apply because this spans multiple product files. Tests that previously used
missing Bluetooth as a generic failure now fail the browser scan instead,
keeping the real transport/hook and the retry, cancel and timer-fallback
paths under test. The hook's own missing-transport fallback remains covered
at its own layer.

The disabled Connect presentation reuses `--ink-3` on `--surface`
(`#57544c` on `#fffdf7`): 7.432:1. Nudge tokens and 44px targets are unchanged.

## Regression proof

The real change was committed before each probe. Each mutation was applied
at a uniquely checked source anchor and precisely reversed afterward.

| Deciding-source mutation | Observed failure |
| --- | --- |
| Remove shared Connect disabled state | WorkoutDetail and JustRow unsupported tests: 2 failed / 98 passed; both served mobile orientations: expected disabled, received enabled. |
| Remove observer disabled state | Observer's first-render test failed; 10 other tests passed. |
| Reject native support / reject browser API support | Each independently failed its expected-true capability case. |
| Ignore an injected fake | Both dev and e2e injection cases failed. |
| Honor fake injection in production | Production case failed: expected false, received true. |
| Restore up/down DOM order | Expected faster/slower, received slower/faster. |
| Make down add one second | Expected callback deltas `[-1, +1]`, received `[+1, +1]`. |
| Remove down from Tab order | Expected focus on down, received up. |

The served shared-button mutation was built with a temporary string marker:
`pnpm build` followed by `rg -l 'connect-enabled-mutant' dist/` found the
marker. `pnpm e2e controlParity.spec.ts --grep 'unsupported browser'` then
failed both orientations. After exact source restore, a fresh build contained
no marker and `pnpm dist:grep` passed all eight production exclusions.
Restored scoped client suites passed 100/100, 24/24 and 11/11 respectively.

The requirements review passed. The code-quality review found one obsolete
CSS comment claiming absent Bluetooth stayed tappable; the comment now
separates radio-off from unsupported browsers. A phrase sweep retained only the accurate
radio-off test wording and the explicitly superseded handoff quotation in
`DEVIATIONS.md`.


Validation: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, production
`pnpm build` and `pnpm dist:grep` passed. `pnpm test --project unit
--project client`: 252 files, 7,230 passed and one existing skip.
`pnpm test --project integration`: 25 files, 385 passed.
`pnpm e2e --reporter=line`: 522 passed. Client-only coverage reports 100%
statements, branches, functions and lines for `bluetoothCapability.ts`,
`ConnectAction.tsx`, `JustRowObserver.tsx` and `StepRow.tsx`; that scoped run
is not a claim about the repository-wide coverage threshold.

`pnpm screenshots`: 137 passed; the two unsupported-browser captures were
then recaptured at viewport size (2 passed), scrolling the landscape workout
so both the nudge arrows and Connect appear above the fixed tab bar.
Retained captures show `▼▲`, inactive dashed Connect on both normal doors
in portrait and landscape, and the supported scan-failure fixture. The
failure screen's cropped landscape body also exists in the parent capture;
its layout is outside this change. Unrelated generated captures were restored.
