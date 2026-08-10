# Phone-BLE design — the PM5 reaches the iPhone

**Status:** James approved the design 2026-08-10 ("the design for BLE is good for spec building") after ruling all four decision points (§2). Release-gating: the v0.7.0 tag + TestFlight fire only after this phase lands and walks (James: "phone side testing matters for the first users").

**Evidence base:** the committed scouting pack `docs/superpowers/specs/2026-08-10-phone-ble-scouting.md` (cited below as SCOUT §n; its file:line citations were read and verified 2026-08-10). Where this spec depends on a fact the pack marked unknown, the requirement is tagged UNVERIFIED and carries a resolution owner (implementer or hardware walk).

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
2. **Scan timeout:** our own JS timeout around the plugin scan; on expiry the app surfaces the existing retry UI instead of hanging. The plugin's own 30s scan stop never settles the promise (SCOUT §3: `Plugin.swift:180`, `DeviceManager.swift:138-162`).
3. **Permission denial:** a distinct `permission-denied` error with an Open Settings button (`BleClient.openAppSettings`). iOS never re-prompts after a decline (SCOUT §4, plugin README:512).
4. **Screen lock:** observe on the hardware walk, record, decide later. No `bluetooth-central` background mode this phase.

## 3. Transport: `app/src/monitor/transports/capacitorBle.ts`

### 3.1 Discovery filter (the known-broken line)

`scan()` currently filters on `services: [ROWING_SERVICE_UUID]` (0x0030) at `capacitorBle.ts:119`. Hardware proved 0x0030 is not advertised (`docs/monitor/pm5-interface-notes.md:4319-4321`; the web transport's fix and rationale at `webBluetooth.ts:181-202`), and the plugin ANDs `services` with `namePrefix` down at CoreBluetooth (`DeviceManager.swift:124-127`, `:178-179`) — so the PM5 can never appear (SCOUT risk #1). New filter: **`namePrefix: "PM5"` only, no `services` key.** `optionalServices` stays as-is (harmless on iOS, required shape on web). A comment carries the same lesson text `webBluetooth.ts` carries, citing the interface notes.

### 3.2 Picker presentation

Before `requestDevice`: `displayMode: 'list'` in the request options and one `BleClient.setDisplayStrings(...)` call with the §7 copy. `setDisplayStrings` is called inside `scan()` after `initialize()` (UNVERIFIED whether it may precede initialize — implementer confirms against plugin source; the after-initialize ordering is safe either way per README:165).

### 3.3 Scan timeout

`SCAN_TIMEOUT_MS = 35_000` (5s past the plugin's hardcoded 30s scan stop, so the sheet's own "No device found" retitle happens first). `scan()` races the plugin call against the timeout; on expiry it throws `ScanTimeoutError` (§5). UNVERIFIED: whether the plugin sheet can be programmatically dismissed when our promise abandons it (no cancel API appears in `bleClient.d.ts`; implementer investigates, the walk observes). Acceptance is **no permanent hang**: the retry card is reachable behind the sheet, and Cancel always settles cleanly against an already-settled promise (a no-op rejection swallowed by the race).

### 3.4 Typed errors at the seam

Today cancellation classification hangs on `/cancel/i` matching the plugin's English literal `"requestDevice cancelled."` (SCOUT risk #7; `useMonitorSession.ts:566`). The transport now translates plugin failures into Errors with pinned `name`s so the classifier never reads plugin prose:

| Condition | Detection | Thrown as |
|---|---|---|
| Rower cancels the sheet | plugin rejection from `requestDevice` matching `/cancel/i` (the one place the regex survives, quarantined inside the transport) | `name: "NotFoundError"` — the web picker's own cancel vocabulary, already classified `scan-dismissed` |
| Bluetooth off | `BleClient.isEnabled()` returns false before scanning (new check; SCOUT §1.2) | `name: "BluetoothOffError"`, message contains "powered off" (hits the existing `bluetooth-off` regex arm at `useMonitorSession.ts:556`) |
| Permission denied | `initialize()` rejects, message NOT matching `/unsupported/` | `name: "BluetoothPermissionError"` → NEW classifier arm (§5). UNVERIFIED: the exact denial message text — implementer pins the mock, the walk confirms the device text and it lands in the interface notes |
| Simulator / no BLE | `initialize()` rejects matching `/unsupported/` (README:133) | `BluetoothOffError` (the honest nearest surface; simulator is a non-goal) |
| Scan timeout | §3.3 race | `name: "ScanTimeoutError"` → classified `scan-dismissed` (§5) |

### 3.5 Hardening

- `initialize()` moves to a shared `ensureInitialized()` called by BOTH `scan()` and `connect()` (today only `scan()` initializes — a bare `connect()` would fail; SCOUT §1.4).
- A notification whose `toUint8Array` comes back `undefined` is **dropped**, not delivered as an empty frame to the reassembler (SCOUT risk #12; today `:159` substitutes `new Uint8Array(0)`).
- Everything else in the file (SERVICE_OF map, M-2 caller-disconnect guard, single-slot `onDisconnect`) stands.

## 4. Permission-denied surface

- `ConnectedError` gains one member: `"permission-denied"` (the union and its rendering live in `useMonitorSession.ts` / `ConnectedInterstitial.tsx`; the classifier arm for `BluetoothPermissionError` is checked BEFORE the bluetooth-off regex arm so plugin wording can never shadow it).
- The error card: §7 copy plus an **Open Settings** button. The button calls a new adapter `src/adapters/appSettings.ts` → `openAppSettings(): Promise<void>` — native arm dynamic-imports `src/native/appSettings.ts` (a thin `BleClient.openAppSettings()` wrapper, `/* v8 ignore */`, mirroring the keepAwake idiom at `src/adapters/keepAwake.ts:40-48`); web arm is a no-op and the button does not render (the reason is unreachable on web, but the render guard is platform capability, not reason).

## 5. Classifier and phase machine

- `mapRadioFailure` (`useMonitorSession.ts:537-578`) gains two arms, both by `name`: `BluetoothPermissionError` → `permission-denied` (first), `ScanTimeoutError` → `scan-dismissed`. Existing arms untouched; the `/cancel/i` regex arm STAYS as defense for the web transport.
- The phase union does not change. `picking` remains `picking`.
- `ConnectedInterstitial.tsx:262-267`: `idle` still renders null; **`picking` now renders a quiet backdrop** (the interstitial's own frame with the §7 line, no spinner theatrics) on BOTH platforms — on iOS the sheet is ours and currently floats over blank white (SCOUT risk #5); on web the browser chooser overlays it harmlessly and the two platforms stay one code path. The two render pins update (`ConnectedInterstitial.test.tsx:231-240` splits idle from picking).

## 6. WorkoutDetail's Bluetooth capability probe

`useBluetoothStatus` (`WorkoutDetail.tsx:59-97`) probes `navigator.bluetooth` directly — undefined in WKWebView, so every iPhone shows a dashed-out Connect with "NO BLUETOOTH ON THIS DEVICE" (SCOUT risk #2). New adapter `src/adapters/bluetoothCapability.ts`:

```
hasBluetoothSupport(): boolean
  isNative() -> true            // the plugin owns the rest at connect time
  else      -> "bluetooth" in navigator
```

`WorkoutDetail` consumes the adapter; web semantics are byte-identical, native returns supported. The lint wall (`eslint.config.js:58-114`) already blesses `src/adapters/**`; note the rule restricts imports, not `navigator` reads — the raw probe's removal from `WorkoutDetail` is the fix, nothing enforces it mechanically (a grep line lands in the review checklist instead).

## 7. Copy (exact strings; no em-dash anywhere)

| Surface | String |
|---|---|
| `setDisplayStrings.scanning` | `Looking for your PM5` |
| `setDisplayStrings.availableDevices` | `Choose your monitor` |
| `setDisplayStrings.noDeviceFound` | `No monitor found. Wake the PM5 and try again.` |
| `setDisplayStrings.cancel` | `Cancel` |
| Picking backdrop line | `Choosing your monitor` |
| permission-denied card title | `Bluetooth permission needed` |
| permission-denied card body | `Ergomatic can't reach your PM5 without Bluetooth. Allow Bluetooth for Ergomatic in Settings, then come back and try again.` |
| permission-denied button | `Open Settings` |

## 8. iOS wiring

- `npx cap sync ios` regenerates `ios/App/App/CapApp-SPM/Package.swift` — it currently lacks the BLE plugin entirely and points at dead `@capacitor+core@8.4.2` pnpm store paths (SCOUT §4). The regenerated TRACKED manifest is reviewed and committed (expected diff: BluetoothLe package + refreshed paths; anything else gets explained or investigated).
- Post-sync consistency check: `capacitor.config.json`'s `packageClassList` and `Package.swift` agree on `BluetoothLe`.
- Bundle proof: after `pnpm ios:build`, grep the synced `ios/App/App/public/assets` for the capacitorBle chunk — **the Capacitor BLE path has never been in an iOS bundle** (SCOUT §4: the Aug 9 bundle predates the adapter chooser).
- `Info.plist` needs nothing: the purpose string shipped in #67 (SCOUT §4). No entitlements, no background modes (§2.4).
- `capacitor.config.ts` stays without a `BluetoothLe` block; display strings live in TS (§3.2) beside the rest of the copy.

## 9. Lint/coverage lockstep (SCOUT risk #13)

New files and their list treatment — `eslint.config.js:64-84` and `vitest.config.ts:44-74` must stay mirror-exact:

| File | eslint ignores | vitest exclude | Tests |
|---|---|---|---|
| `src/adapters/bluetoothCapability.ts` | already covered (`src/adapters/**`) | NOT excluded | yes, `vi.doMock("../platform")` idiom |
| `src/adapters/appSettings.ts` | already covered | NOT excluded | yes, same idiom |
| `src/native/appSettings.ts` | already covered (`src/native/**`) | already covered (`src/native/**`) | no (`/* v8 ignore */`) |
| `capacitorBle.ts` (edited) | stays named in both lists | stays excluded | the existing honest-coverage boundary stands; new logic that CAN be unit-tested against the mocked plugin module (error translation, timeout, filter shape, display-strings call) is — the file's excluded-from-coverage status does not excuse untested seams; the tests live in `capacitorBle.test.ts` regardless of coverage accounting |

## 10. Acceptance

**Unit (all pinned before the walk):**
1. `requestDevice` called with `namePrefix` and WITHOUT a `services` key; `displayMode: 'list'`; display strings passed once with the §7 values.
2. Timeout: fake timers, plugin promise never settles → `ScanTimeoutError` at 35s; a late plugin rejection after settle is swallowed.
3. Error translation: cancel-message → `NotFoundError`; `isEnabled` false → `BluetoothOffError`; initialize rejection → `BluetoothPermissionError`; `/unsupported/` → `BluetoothOffError`.
4. Classifier: the two new arms; `permission-denied` ordering beats the message regexes.
5. Empty `toUint8Array` → callback NOT invoked.
6. `connect()` without `scan()` initializes (the `ensureInitialized` seam).
7. `bluetoothCapability`: native true / web probe; `WorkoutDetail` no longer touches `navigator.bluetooth` (grep-style assertion in review, behavioral pin in test).
8. Interstitial: `picking` renders the backdrop; `idle` renders nothing; permission card shows Open Settings on native, not on web.

**Suite baselines:** measured at plan time on current main, not carried from memory (briefing rule).

**Hardware walk (device-only — simulator rejects `initialize`, README:133; one question per step at the erg, per house pacing):**
1. Fresh install → Connect → the iOS permission prompt shows the shipped purpose string → Allow.
2. The list sheet appears with §7 copy and the PM5 is IN it (the filter fix's proof) → pick → connect → program → ready gate.
3. Row a short piece to Save; the stored log carries pm5 splits — this also discharges 7C's owed hardware walk, on the phone.
4. Cancel the sheet → `scan-dismissed` retry card.
5. PM5 asleep → timeout at 35s → retry card; RECORD whether the sheet needed manual dismissal (§3.3's UNVERIFIED).
6. Reinstall, DENY the prompt → `permission-denied` card → Open Settings lands on Ergomatic's settings page; re-allow there → connect works.
7. Lock the phone mid-connection and unlock; RECORD link survival (feeds the reconnect phase; no pass/fail this phase).
8. Stash the monitor log for the record (`ergomatic:last-monitor-log`).

## 11. Docs deliverables

- `docs/superpowers/specs/2026-08-07-phase-7b-connected-design.md` gains a dated supersession note under C2: the "OS picker" premise holds on web, not on iOS (the sheet is in-process); `picking` now renders a backdrop. The 7B spec text itself is history and stays.
- `docs/monitor/pm5-interface-notes.md` gains a new § after the walk: iOS/Capacitor transport facts (denial message text, sheet-dismissal behavior, lock/unlock observation, anything the wire teaches).
- ROADMAP: the phone-BLE phase entry with this spec as authority; the release-gate line in Phase CL points here.
- DEVIATIONS: no row expected (this is a new-spec phase, not a deviation from one); if implementation contradicts a pinned § it goes through the ledger like always.
