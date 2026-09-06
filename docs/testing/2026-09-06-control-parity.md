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
