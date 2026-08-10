# Phone-BLE design — the PM5 reaches the iPhone

**Status:** James approved the design 2026-08-10 ("the design for BLE is good for spec building") after ruling all four decision points (§2). Revised same day against the adversarial review (`2026-08-10-phone-ble-adversarial-review.md`), which closed every unknown from plugin source; this version carries the answers, not the deferrals. Release-gating: the v0.7.0 tag + TestFlight fire only after this phase lands and walks (James: "phone side testing matters for the first users").

**Evidence base:** the committed scouting pack `docs/superpowers/specs/2026-08-10-phone-ble-scouting.md` (SCOUT §n) plus the adversarial review's plugin-source reads (REVIEW Bn/In/Mn/Nn), both against `@capacitor-community/bluetooth-le@8.2.0`. One inherited cite drift: `displayMode` sits at `definitions.d.ts:57`, not `:52` (REVIEW M5).

## 1. Goal and non-goals

**Goal:** a rower on an iPhone connects to a PM5, programs a workout, rows it, and saves it with PM5 splits — the same connected path that works on desktop Chromium today, through the same three-layer seam. The protocol layer (`driver.ts`, `pm5/*`) does not change; the driver calls only `write`/`subscribe`/`onDisconnect`/`disconnect` and never `scan`/`connect` (SCOUT §5's table).

**Non-goals:**
- Reconnect (ROADMAP's named follow-on; unchanged). But `connect()` becomes initialize-safe so reconnect stays *possible* (§3.5).
- Background BLE. `UIBackgroundModes` stays undeclared (James's ruling, §2.4); screen-lock behavior is an OBSERVATION item on the walk, decided with data in the reconnect phase.
- Android. No target exists.
- Web transport changes. `webBluetooth.ts` is untouched; its hardware-proven decisions are *imported as lessons*, not edited.
- Write-semantics unification. The two transports keep different write paths (acked vs without-response, SCOUT §1.6) — a recorded divergence, revisited only if the walk shows chunked-CSAFE failures.

## 2. James's rulings (PINNED, 2026-08-10)

1. **Picker:** the plugin's `displayMode: 'list'` sheet with our copy via `setDisplayStrings`. No custom device-list UI; the 7B phase machine gains no states.
2. **Scan timeout:** our own JS timeout so the app never hangs in `picking`. The mechanics differ from the ruling's original framing in one honest way (REVIEW B3): the plugin sheet is modal and cannot be dismissed programmatically (no API exists; `stopScan` only retitles — `DeviceManager.swift:138-162`, `DeviceListView.swift:14`), so while the sheet is up, the sheet's own Cancel is the exit; the JS timeout's real job is the INVISIBLE hangs — an `initialize()` that pends forever on `.resetting`/`.unknown` (`DeviceManager.swift:58-59`, `:66-67`) or a never-answered permission prompt — plus state-sync when a rower walks away. Same ruling intent: no permanent hang, a clean typed error, a working retry.
3. **Permission denial:** a distinct `permission-denied` error with an Open Settings button (`BleClient.openAppSettings`). iOS never re-prompts after a decline (SCOUT §4, plugin README:512).
4. **Screen lock:** observe on the hardware walk, record, decide later. No `bluetooth-central` background mode this phase.

## 3. Transport: `app/src/monitor/transports/capacitorBle.ts`

### 3.1 Discovery filter (the known-broken line)

`scan()` currently filters on `services: [ROWING_SERVICE_UUID]` (0x0030) at `capacitorBle.ts:119`. Hardware proved 0x0030 is not advertised (`docs/monitor/pm5-interface-notes.md:4319-4321`; the web transport's fix and rationale at `webBluetooth.ts:181-202`), and the plugin ANDs `services` with `namePrefix` down at CoreBluetooth (`DeviceManager.swift:124-127`, `:178-179`) — so the PM5 can never appear (SCOUT risk #1). New filter: **`namePrefix: "PM5"` only, no `services` key.** Recorded premise (REVIEW N1): an absent `services` key reaches CoreBluetooth as an EMPTY array (`Plugin.swift:606-612`), the plugin's universal name-only pattern but not Apple-documented — walk step 2 is the observation that settles it. `optionalServices` stays as-is. A comment carries the same lesson text `webBluetooth.ts` carries, citing the interface notes.

### 3.2 Picker presentation

`displayMode: 'list'` in the request options (a per-call option, `definitions.d.ts:57`, default `alert` — `Plugin.swift:165-170`) and one `BleClient.setDisplayStrings(...)` call with the §7 copy. Ordering is free: `setDisplayStrings` has no init guard natively (`Plugin.swift:143-152`) and `requestDevice` re-applies the current strings itself (`Plugin.swift:157`). It is still called inside `scan()` (inside the §3.3 race, after `isEnabled` — one fixed order, fewer cases to reason about).

### 3.3 The scan pipeline, its timeout, and the abandoned-sheet model

**Pipeline order is load-bearing, not style (REVIEW I2):**

```
scan(): race( SCAN_TIMEOUT_MS = 35_000,
  ensureInitialized()      // §3.5; may PEND forever on .resetting/.unknown or an unanswered permission prompt
  -> BleClient.isEnabled() // the ONLY Bluetooth-off detector: initialize RESOLVES on poweredOff
                           //   ("BLE powered off" is a resolve, DeviceManager.swift:54-56);
                           //   isEnabled REJECTS if ever called uninitialized (Plugin.swift:74-80, :598-604)
  -> setDisplayStrings(§7)
  -> requestDevice({ namePrefix: "PM5", optionalServices, displayMode: "list" })
)
```

The race wraps the ENTIRE pipeline (REVIEW I6), not just `requestDevice`. On expiry it throws `ScanTimeoutError` (§5) with the timeout-specific detail (§7).

**The abandoned-promise contract (REVIEW B3, I4):** `Promise.race` does not silence the loser. The abandoned pipeline promise gets an EXPLICITLY ATTACHED `.catch` and a then-arm, and after the race settles, BOTH outcomes are swallowed: a late rejection (the rower's eventual Cancel — `"requestDevice cancelled."`) and a late RESOLUTION (the rower picks a row at t=36s; rows stay pickable after the plugin's own 30s scan stop, `DeviceManager.swift:195-210`). Swallowing a late pick is safe — `requestDevice` only picks, no connect was issued. Without the attached catch, Cancel fires `unhandledrejection` in the WKWebView.

**The queue invariant (REVIEW B3.3):** BleClient serializes EVERY call through one promise queue (`bleClient.js` constructor, `queue.js`). While the abandoned native `requestDevice` is pending, any BleClient call silently waits behind it. Invariant to pin in code comment and test: **no BleClient call may be issued between `ScanTimeoutError` and the sheet's user dismissal.** Today's hook already conforms by accident — the timeout path's `transport.disconnect()` no-ops on `deviceId === null` (`capacitorBle.ts:167-172`) — the invariant makes it deliberate. `openAppSettings` rides the same queue (REVIEW N3), which never conflicts in practice (a pending sheet and the permission card cannot coexist), but no future code may add a BleClient call to the picking phase.

**The recovery sequence as the rower lives it:** timeout at 35s → the retry card renders BEHIND the modal sheet (unreachable; the sheet is `isModalInPresentation`, `DeviceListView.swift:14`) → the rower taps the sheet's own Cancel (the §7 copy tells them to) → the abandoned promise settles into its attached catch, the queue drains → the card is visible and tappable → retry scans fresh (native scanning already stopped at 30s, `DeviceManager.swift:117-123`, so no radio state leaks — REVIEW f).

First-run nuance: the race deliberately includes permission-prompt dwell. A rower who ponders the prompt past 35s lands on the retry card after allowing — one extra tap, no hang, covered by the late-resolution swallow.

### 3.4 Typed errors at the seam

The transport translates plugin failures into Errors with pinned `name`s so the classifier never reads plugin prose (today cancellation hangs on `/cancel/i` matching `"requestDevice cancelled."` — SCOUT risk #7):

| Condition | Detection (positive matches only) | Thrown as |
|---|---|---|
| Rower cancels the sheet | `requestDevice` rejection matching `/cancel/i` (the regex quarantined inside the transport) | `name: "NotFoundError"` — the web picker's cancel vocabulary, already classified `scan-dismissed` |
| Bluetooth off | `BleClient.isEnabled()` returns false (post-initialize, §3.3 order) | `name: "BluetoothOffError"`, message contains "powered off" (hits the `bluetooth-off` regex arm, `useMonitorSession.ts:556`) |
| Permission denied or restricted | `initialize()` rejects matching `/permission denied/i` — the REAL string is `"BLE permission denied"` for both `.unauthorized` cases (`DeviceManager.swift:60-62`); the mock pins this exact text | `name: "BluetoothPermissionError"` → NEW classifier arm (§5) |
| Simulator / no BLE | `initialize()` rejects matching `/unsupported/` (`"BLE unsupported"`, `DeviceManager.swift:63-65`) | `BluetoothOffError` (the honest nearest surface; simulator is a non-goal) |
| Scan timeout | §3.3 race | `name: "ScanTimeoutError"` → classified `scan-dismissed` with its own detail (§7) |
| Anything else | no match — **falls through untyped** | generic `link-failed`. Deliberate (REVIEW I1): the Capacitor bridge's `"BluetoothLe" plugin is not implemented` (the §8 wiring failure) must surface as a link failure, not wear the permission card |

### 3.5 Hardening

- **`ensureInitialized()` memoizes (REVIEW B2 — load-bearing, untestable through mocks):** `BleClient.initialize()` is NOT idempotent. Every call constructs a new `DeviceManager` and a new `CBCentralManager` (`Plugin.swift:62-72`, `DeviceManager.swift:35-41`); a scan→connect double-init would hand the picked `CBPeripheral` to a central that never discovered it — cross-central use CoreBluetooth does not define. `ensureInitialized` caches the in-flight/settled-success promise at transport scope, and CLEARS the memo on rejection so a denied-then-re-allowed rower gets a fresh prompt path. Both `scan()` and `connect()` call it (today only `scan()` initializes — SCOUT §1.4). A mocked `BleClient` cannot catch a regression here; the requirement lives in this §, a source comment, and the review checklist.
- **`subscribe()` failures stop being silent (REVIEW I5):** today `void BleClient.startNotifications(...)` (`capacitorBle.ts:154-161`) discards rejection — a missing service/characteristic (`Plugin.swift:544-565`) becomes an unhandled rejection and the driver waits below the ready gate forever, the exact hang class ruling 2 kills. New behavior: the startNotifications promise gains an attached catch that fires the registered `onDisconnect` callback with the plugin's message (a dead subscription IS a dead link for this driver — CSAFE responses can never arrive). The M-2 caller-initiated guard is not tripped (no caller called `disconnect`), so the callback passes through and the session ends `link-failed` instead of hanging.
- A notification whose `toUint8Array` comes back `undefined` is **dropped**, not delivered as an empty frame to the reassembler (SCOUT risk #12; today `:159` substitutes `new Uint8Array(0)`).
- Everything else in the file (SERVICE_OF map, M-2 guard, single-slot `onDisconnect`) stands.

## 4. Permission-denied surface

- `ConnectedError` gains one member: `"permission-denied"`. The classifier arm matches `name === "BluetoothPermissionError"` and is checked BEFORE the message-regex arms so plugin wording can never shadow it.
- **Three required edits, not two (REVIEW I3):** the union, the classifier, AND `NOT_A_MACHINE_REFUSAL` (`ConnectedInterstitial.tsx:68-75`) — it is a `Set`, not type-exhaustive; omitting it renders "The monitor wouldn't take it" for a permission denial. The plan converts the Set to an exhaustive `Record<ConnectedError["reason"], boolean>` so the compiler catches the next member too.
- **Card mounting:** `permission-denied` renders on the same failed-card skeleton as `scan-dismissed`/`bluetooth-off`; the serif line is `error.detail` carrying the §7 body; the action row gains an **Open Settings** button beside the existing retry, rendered only when the platform can open settings (capability from the adapter, not the error reason).
- The button calls a new adapter `src/adapters/appSettings.ts` → `openAppSettings(): Promise<void>` — native arm dynamic-imports `src/native/appSettings.ts` (a thin `BleClient.openAppSettings()` wrapper, `/* v8 ignore */`, mirroring `src/adapters/keepAwake.ts:40-48`); web arm is a no-op and reports no capability.

## 5. Classifier and phase machine

- `mapRadioFailure` (`useMonitorSession.ts:537-578`) gains two arms, both by `name`: `BluetoothPermissionError` → `permission-denied` (first), `ScanTimeoutError` → `scan-dismissed` with the timeout detail (§7; REVIEW M4 — "No monitor was picked." would be a lie for a timeout). Existing arms untouched; the `/cancel/i` regex arm STAYS as defense for the web transport.
- The phase union does not change. `picking` remains `picking`.
- `ConnectedInterstitial.tsx:262-267`: `idle` still renders null; **`picking` now renders a quiet backdrop** (the interstitial's own frame with the §7 line, no spinner theatrics) on BOTH platforms — on iOS the sheet is ours and currently floats over blank white (SCOUT risk #5); on web the browser chooser overlays it harmlessly and the two platforms stay one code path. Blast radius verified small (REVIEW N5): the sole pin is `ConnectedInterstitial.test.tsx:236-240`'s `it.each(["idle","picking"])`, which splits.

## 6. WorkoutDetail's Bluetooth capability probe

`useBluetoothStatus` (`WorkoutDetail.tsx:57-97`) is a FOUR-state hook (`"unknown" | "available" | "off" | "absent"`) whose `"off"` state comes from `navigator.bluetooth.getAvailability()` (`:89-96`) and renders its own `BLUETOOTH IS OFF` caption (`:605-607`). A boolean adapter cannot carry it (REVIEW B1). New adapter `src/adapters/bluetoothCapability.ts`:

```
probeBluetoothStatus(): Promise<"available" | "off" | "absent">
  isNative() -> resolves "available"     // the plugin owns permission/off detection at connect time
  else       -> reproduces WorkoutDetail.tsx:63-96 verbatim: no navigator.bluetooth -> "absent";
                getAvailability() -> "available"/"off"; getAvailability absent or throwing -> the
                same fail-open branches the hook has today
```

The hook keeps its four states (`"unknown"` while the promise is pending) and consumes the adapter; the `navigator.bluetooth` reads MOVE into the adapter's web arm, so web semantics stay byte-identical AND `WorkoutDetail` stops touching `navigator` — both halves of the old contradiction now true. The lint wall (`eslint.config.js:58-114`) already blesses `src/adapters/**`; the rule restricts imports, not `navigator` reads, so a grep line lands in the review checklist.

## 7. Copy (exact strings; no em-dash anywhere)

| Surface | String |
|---|---|
| `setDisplayStrings.scanning` | `Looking for your PM5` |
| `setDisplayStrings.availableDevices` | `Choose your monitor` |
| `setDisplayStrings.noDeviceFound` | `No monitor found. Wake the PM5, then tap Cancel and try again.` |
| `setDisplayStrings.cancel` | `Cancel` |
| Picking backdrop line | `Choosing your monitor` |
| `scan-dismissed` detail, timeout producer only | `The search took too long. Try again.` |
| permission-denied card title | `Bluetooth permission needed` |
| permission-denied card body | `Ergomatic can't reach your PM5 without Bluetooth. Allow Bluetooth for Ergomatic in Settings, then come back and try again.` |
| permission-denied button | `Open Settings` |

The `noDeviceFound` string names Cancel because Cancel is the sheet's only control at that point (REVIEW M4). The existing `scan-dismissed` detail ("No monitor was picked.") stays for the cancel/dismiss producer.

## 8. iOS wiring

- `npx cap sync ios` regenerates `app/ios/App/CapApp-SPM/Package.swift` (path per REVIEW M1) — it currently lacks the BLE plugin entirely and points at dead `@capacitor+core@8.4.2` pnpm store paths (SCOUT §4). The regenerated TRACKED manifest is reviewed and committed. **Expected diff, enumerated (REVIEW M6):** the BluetoothLe package added; the `capacitor-swift-pm` pin `exact: "8.4.2"` → 8.5.x; all three existing plugin store paths refreshed (core 8.5.0, social-login ≥8.3.40). Anything OUTSIDE that list gets explained or investigated.
- Post-sync consistency check: `capacitor.config.json`'s `packageClassList` and `Package.swift` agree on `BluetoothLe`.
- Bundle proof: after `pnpm ios:build`, grep the synced `ios/App/App/public/assets` for the capacitorBle chunk — **the Capacitor BLE path has never been in an iOS bundle** (SCOUT §4: the Aug 9 bundle predates the adapter chooser).
- `Info.plist` needs nothing: the purpose string shipped in #67 (SCOUT §4). No entitlements, no background modes (§2.4).
- `capacitor.config.ts` stays without a `BluetoothLe` block; display strings live in TS (§3.2) beside the rest of the copy.

## 9. Lint/coverage lockstep (SCOUT risk #13)

New files and their list treatment — `eslint.config.js:64-84` and `vitest.config.ts:44-74` must stay mirror-exact:

| File | eslint ignores | vitest exclude | Tests |
|---|---|---|---|
| `src/adapters/bluetoothCapability.ts` | already covered (`src/adapters/**`) | NOT excluded | yes, `vi.doMock("../platform")` idiom, all four downstream states |
| `src/adapters/appSettings.ts` | already covered | NOT excluded | yes, same idiom |
| `src/native/appSettings.ts` | already covered (`src/native/**`) | already covered (`src/native/**`) | no (`/* v8 ignore */`) |
| `capacitorBle.ts` (edited) | stays named in both lists | stays excluded | the honest-coverage boundary stands, but every seam testable against the mocked plugin module IS tested in `capacitorBle.test.ts`: error translation, pipeline order, the timeout race, both late-settle swallows, the memo-on-rejection clear, the subscribe-failure route, the empty-frame drop, the filter/displayMode/strings shapes. The one thing mocks cannot catch — the §3.5 no-double-init requirement — is carried by spec text, source comment, and review checklist |

## 10. Acceptance

**Unit (all pinned before the walk):**
1. `requestDevice` called with `namePrefix` and WITHOUT a `services` key; `displayMode: 'list'`; display strings passed once with the §7 values.
2. Timeout: fake timers, pipeline never settles → `ScanTimeoutError` at 35s; a LATE REJECTION and a LATE RESOLUTION of the abandoned pipeline are both swallowed (no unhandled rejection, no device adopted).
3. Pipeline order: initialize before isEnabled before requestDevice (call-order assertion against the mock); `isEnabled` false → `BluetoothOffError`.
4. Error translation: `"requestDevice cancelled."` → `NotFoundError`; `"BLE permission denied"` (exact mock text) → `BluetoothPermissionError`; `"BLE unsupported"` → `BluetoothOffError`; an UNRECOGNIZED initialize rejection (e.g. the bridge's not-implemented text) → passes through untyped.
5. Classifier: the two new arms; `permission-denied` ordering beats the message regexes; `ScanTimeoutError` carries the timeout detail.
6. `ensureInitialized`: one initialize across scan→connect (mock call-count); memo cleared after rejection (second scan re-initializes).
7. `subscribe` failure: startNotifications rejection fires the onDisconnect callback (M-2 guard untripped); empty `toUint8Array` → callback NOT invoked.
8. `probeBluetoothStatus`: native "available"; web absent/available/off/fail-open branches — and `WorkoutDetail` behavior pinned per state, including `BLUETOOTH IS OFF`.
9. Interstitial: `picking` renders the backdrop; `idle` renders nothing; permission card shows title/body/Open Settings with the button gated on adapter capability; `permission-denied` is in the refusal-copy structure (the `NOT_A_MACHINE_REFUSAL` conversion) so it never renders "The monitor wouldn't take it".

**Suite baselines:** measured at plan time on current main, not carried from memory (briefing rule).

**Hardware walk (device-only — simulator rejects `initialize`, README:133; one question per step at the erg, per house pacing):**
1. Fresh install → Connect → the iOS permission prompt shows the shipped purpose string → Allow.
2. The list sheet appears with §7 copy and the PM5 is IN it (settles §3.1's empty-array premise, REVIEW N1) → pick → connect → program → ready gate.
3. Row a short piece to Save; the stored log carries pm5 splits — this also discharges 7C's owed hardware walk, on the phone.
4. Cancel the sheet → `scan-dismissed` retry card.
5. PM5 asleep → sheet retitles at 30s, our timeout at 35s → tap Cancel → the timeout detail card. VARIANT: repeat and pick a stale row LATE instead of cancelling; record exactly what the rower sees (REVIEW I4's swallow, observed).
6. Reinstall, DENY the prompt → `permission-denied` card → Open Settings lands on Ergomatic's settings page; re-allow there. EXPECT A RELAUNCH: iOS terminates the app when a privacy toggle flips (REVIEW N6) — the return is a cold launch from WorkoutDetail, not a resume; connect works after.
7. Lock the phone mid-connection and unlock; RECORD link survival (feeds the reconnect phase; no pass/fail this phase).
8. Stash the monitor log for the record (`ergomatic:last-monitor-log`). Note (REVIEW N2): scan-phase failures never create a log, so steps 4-6 leave nothing to stash — expected, not a bug.

## 11. Docs deliverables

- `docs/superpowers/specs/2026-08-07-phase-7b-connected-design.md` gains a dated supersession note under C2: the "OS picker" premise holds on web, not on iOS (the sheet is in-process); `picking` now renders a backdrop. The 7B spec text itself is history and stays.
- **Stale source comments the edits falsify (REVIEW M3) — the plan's file inventory carries all five:** `capacitorBle.ts:70-75` (factory doc: "OS's native device picker … filtered to the C2 Rowing service" — both halves false); `useMonitorSession.ts:71-75` (phase doc: "showing nothing of ours"); `useMonitorSession.ts:100-102` (`scan-dismissed` gains a second producer); `useMonitorSession.ts:632` ("while the OS picker is open"); `ConnectedInterstitial.tsx:8-12` + `:262-266` ("render nothing of ours over it").
- ROADMAP: the phone-BLE phase entry with this spec as authority; the release-gate line in Phase CL points here; AND the CL Exit line still saying the release waits on the rebalance is stale (the gate widened) — fixed in the same pass, per the CL session's queued note.
- `docs/monitor/pm5-interface-notes.md` gains a new § after the walk: iOS/Capacitor transport facts (the denial string confirmed on device, sheet behavior on timeout/late pick, lock/unlock observation, anything the wire teaches).
- DEVIATIONS: no row expected (this is a new-spec phase, not a deviation from one); if implementation contradicts a pinned § it goes through the ledger like always.
