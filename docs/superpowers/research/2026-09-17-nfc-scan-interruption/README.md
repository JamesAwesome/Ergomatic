# NFC scan interruption — research, 2026-09-17

The current application can produce the exact photographed nine-event log
and `TARGET-INTERRUPTED` error when its native background event occurs
during a targeted Bluetooth search, the user retries, and the background
event occurs again. This is a desk reproduction of our code path, not proof
that the Chrome banner caused either event on the reported phone.

Research baseline: `55c63d63` (main, v0.50.3 release notes). No product code
was changed. The reported phone's build and iOS version are unknown.

## Incident evidence

James supplied these three photographs on 2026-09-17:

- [Connection log](connection-log.jpg): one NFC handoff followed by two
  `ble-scan-started` / `scan-drain-settled` pairs. No recorded match,
  timeout, held-device conflict or cleanup failure.
- [Chrome banner](chrome-banner.jpg): “Chrome NFC Tag / Open in Chrome”
  over “Looking for PM5 432331249 Row”. The photograph establishes that
  the banner appeared; it does not establish a tap or app switch.
- [Failure](interrupted.jpg): `TARGET-INTERRUPTED`, with raw detail
  “The targeted scan was aborted.”

James's report that the phone may have stayed on the tag is SECONDARY
evidence. No phone movement, banner interaction or lifecycle transition
was captured. These are not timed screenshots from a controlled experiment.

## Primary sources and what they establish

1. [Apple: background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading),
   read 2026-09-17. The system examines an NDEF well-known `U` URI record.
   Load-bearing line: “After the user taps the notification, the system
   delivers the tag data to the appropriate app.” Background reading is
   unavailable while a Core NFC reader session is in progress. The document
   does not promise when a stationary tag is re-detected after session end.
   It names Safari as the unassociated-link fallback; the actual Chrome
   destination here is established by the photograph, not that older wording.
2. [Apple: app lifecycle](https://developer.apple.com/documentation/uikit/managing-your-app-s-life-cycle)
   and [UIApplicationDelegate](https://developer.apple.com/documentation/uikit/uiapplicationdelegate),
   read 2026-09-17: foreground-inactive and background are distinct states.
   These sources do not specify the lifecycle trace of this particular NFC
   notification on the unknown phone/iOS version.
3. [Capacitor App v8](https://capacitorjs.com/docs/apis/app#addlistenerpause),
   read 2026-09-17: `pause` maps to `UIApplication.didEnterBackgroundNotification`;
   `appStateChange` maps to resign-active/become-active. Verified at the call
   sites in installed `@capacitor/app@8.1.1`,
   `ios/Sources/AppPlugin/AppPlugin.swift`, `load()`.
4. The committed capture
   [`pm5-tag-2026-09-04-iphone.json`](../../../monitor/nfc/pm5-tag-2026-09-04-iphone.json)
   contains three records: `concept2.com:bleconnectinfo`, `android.com:pkg`,
   and the well-known URI `https://www.concept2.com`. Its Bluetooth name is
   exactly the name in the incident photographs. This establishes a URI
   available for iOS background handling on that captured monitor; it is
   not a fresh capture from the failure window.

INFERENCE: ending our reader while still near that monitor can expose its
website record to the system reader and explain the Chrome banner. The
banner's existence does not establish a Bluetooth fault or app backgrounding.
No primary source found in the Apple NFC/lifecycle and Concept2 material
searched establishes that physical stillness itself interrupts Bluetooth,
or guarantees that NFC and Bluetooth cannot interfere on this hardware.

## Trace the actual owners

All paths below are relative to the repository at the baseline SHA.

| Boundary | Source and observed contract |
| --- | --- |
| Native NFC read | `app/src/native/nfc.ts`, `readOne`: first resolution wins; `finally` awaits keyed `stopScanning`, removes listeners, then records `reader-settled`. |
| Native late callbacks | Patched `@capgo/capacitor-nfc@8.2.5`, `NfcPlugin.swift`, `owns` and `didDetect`: session identity and generation fence callbacks once invalidation takes ownership. The committed patch is the source of that behavior. |
| Handoff | `app/src/monitor/nfc/runNfcAttempt.ts`: after the reader settles, parse the PM5 record, accept, paint, then return one target. The URI record is not opened by this code. |
| Scan lifecycle | `app/src/monitor/useMonitorSession.ts`, targeted branch of `connect`: native `background` aborts the scan controller. The listener starts before `scanTarget` and ends in `finally`. No automatic foreground retry. |
| Active/inactive | `app/src/native/appLifecycle.ts`: subscribes only to `pause`/`resume`. It never subscribes to `appStateChange`. |
| Cancel/teardown | `useMonitorSession`, `cancel` and `teardown`: retire the attempt and abort the scan. Superseded failures cannot replace the current screen with an error. |
| Scan terminal | `app/src/monitor/transports/capacitorBle.ts`, `scanTarget`: abort, deadline and terminal scan results compete through one `settled` guard. Cleanup must settle before the operation returns. |
| Retry | `app/src/workout/ConnectedInterstitial.tsx`, `handleTryAgain`: starts a fresh connection using the same target AND trace. This explains two scan pairs after one NFC read. |
| Export | `useMonitorSession`, `exportLog`: current attempt entries retain their `atMs` and build metadata before connection. `ConnectionLogSheet.logLine` displays sequence, not time. A photo loses timing/build information available through Copy log. |

`TargetScanInterruptedError` has the exact raw string in the photograph.
The transport constructs it for an aborted signal or pre-radio deadline
expiry. The latter records `ble-scan-timed-out` with detail `preamble`;
neither photographed scan pair contains that event. Invalid targeted
requests map to the same headline but have different raw detail.

The hooked native background path is therefore a stronger match than a
missing advertisement or Bluetooth power failure. Attribution to a Chrome
tap remains unproved. The code cannot identify which app the user opened.

## Executed desk probes

The research-only [probe source](probe.test.ts) mocks the platform plugins,
not our orchestration. It runs the real native NFC reader, PM5 parser,
handoff coordinator, native lifecycle wrapper, Capacitor BLE transport,
monitor-session hook and export function. Paint/haptic are no-op injected
seams; no phone or radio is used. No workout is programmed.

From the isolated worktree's `app/`, with Node 26.5.0:

```sh
pnpm test --project client src/native/appLifecycle.test.ts src/native/nfc.test.ts src/monitor/transports/capacitorBle.test.ts src/monitor/nfc/connectionAttemptTrace.test.ts
```

Observed: **4 files, 97 tests passed**, 667 ms, 2026-09-17 07:44:25 local.

The probe was temporarily copied to
`app/src/monitor/nfc-investigation.probe.test.ts` (its relative imports are
for that path), then run with:

```sh
pnpm test --project client src/monitor/nfc-investigation.probe.test.ts
```

Observed: **1 file, 7 tests passed**, 518 ms, 07:46:44 local. The temporary
file was removed; its exact executed source is retained beside this note.
Readouts used `process.stdout.write`, not jsdom's swallowed `console.log`.

| Input to the real native wrapper | Asserted result before test cleanup |
| --- | --- |
| `appStateChange(false)` then `true` | Still searching; zero Bluetooth stops. The wrapper has no handler for these events. |
| `pause` | Failed, `target-interrupted`, exact photographed raw message. |
| Cancel | Idle; one Bluetooth stop; no displayed failure. |
| Unmount | One Bluetooth stop; the hook is gone. Its last rendered `picking` value is stale, not a live screen. |
| No advertisements, advance 10,000 ms | `target-not-advertising`; explicit `ble-scan-timed-out` entry. |
| `pause`, retry, `pause` | Exact nine-event screenshot sequence and `target-interrupted`. |
| Two native tag events before reader cleanup | One accepted handoff and one Bluetooth search; two tag-event entries. |

The retry probe exported these kind/detail pairs, matching the photographed
log after its `NFC-ATTEMPT:` prefix and display casing are applied:

```text
session-requested    seq 0
tag-event            seq 1
reader-settled       seq 2
parser-accepted      seq 3
handoff-accepted     seq 4
ble-scan-started     seq 5
scan-drain-settled   seq 6
ble-scan-started     seq 7
scan-drain-settled   seq 8
```

Inactive/repeated-tag cases are deliberately cancelled after asserting that
search continues. Their final printed `idle` state describes that cleanup,
not the effect of an inactive or tag event.

These probes establish conditional code behavior. They do not reproduce
the physical banner, its OS event sequence, a continuous RF field, native
promise-queue scheduling, the device's advertisement availability or a
Bluetooth permission sheet. Existing radio mocks cannot establish those.

## Diagnostic gaps and alternative causes

1. **No abort origin.** The scan's background handler calls `abort()`
   without recording its input; the transport abort listener records no
   abort either. Cancel, teardown and background produce the same trace.
   `foreground-abort` exists for the earlier NFC-entry stage only.
2. **No scan outcome or retry boundary.** Drain-settled means the queue
   ownership drained, not successful discovery. Retries reuse the NFC
   trace with no explicit connection invocation marker.
3. **No advertisement summary.** Zero callbacks, callbacks without a local
   name, and callbacks with a different name all end up “not advertising”.
   The transport intentionally matches live `localName`, not cached name.
4. **A setup stall has no stage detail beyond `preamble`.** Queue wait,
   initialize, Bluetooth enabled query and held-device query are currently
   indistinguishable. A started marker only follows `requestLEScan` resolve.
5. **Late scan acknowledgements can be misleading.** The detached preamble
   records `ble-scan-started` after its await without checking `settled`.
   An already-aborted operation can therefore receive a late started marker
   under a delayed native promise. This is source-derived ordering analysis,
   not an observed incident. Diagnostics must distinguish acknowledgement
   from the earlier terminal decision without changing queue ownership.
6. **Bluetooth can stop below our scan listener.** Installed BLE 8.3.0
   `DeviceManager.centralManagerDidUpdateState` calls `stopScan()` on
   powered-off. Our enabled-state subscription starts only at GATT connect.
   A power-off mid-search can currently age into `target-not-advertising`.
   That does not explain this photograph's `target-interrupted` signature.
   Do not add a second global enabled listener casually: the plugin owns a
   single callback, also used by connected sessions.

## Recommendation and limits

Add bounded, redacted diagnostics at the existing scan owners first. Keep
connection, timeout and NFC session behavior unchanged until real evidence
identifies a defect. Do not hold Core NFC open to suppress an OS banner,
claim radio interference, introduce automatic retries, or blame the rower.

The next instrumented failure should distinguish the app's abort source,
scan observations and actual post-cleanup result. Even then, a native
background event establishes backgrounding, not its external cause.
Physical validation of “hold still and ignore the banner” remains open;
no hardware session or device installation was requested or performed.

## Artifact checks

After removing the temporary app-side probe, `git diff --exit-code -- app`
passed: retained changes are research/spec/plan documents and supplied
photographs only. `pnpm lint`, `pnpm format:check`, and `pnpm typecheck`
all passed in the isolated worktree. The installed pre-commit hook was
exercised with a temporary Node-version stub and correctly refused Node 1
with `HOOK BLOCKED: Node >=26 required, found 1` (exit 1); the stub was
removed. No e2e or hardware pass is claimed for these research artifacts.
