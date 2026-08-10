# Context pack — phone-BLE (Capacitor Bluetooth transport for iPhone + PM5)

All paths absolute. Main checkout only; `.claude/worktrees/` ignored.

---

## 1. `createCapacitorBleTransport`

**Location:** `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/transports/capacitorBle.ts:81` (file is 181 lines).

**Plugin + version:** `@capacitor-community/bluetooth-le` — declared `^8.2.0` at `/Users/james/projects/github/jamesawesome/Ergomatic/app/package.json:41`; resolved on disk at `8.2.0` (`node_modules/.pnpm/@capacitor-community+bluetooth-le@8.2.0_@capacitor+core@8.5.0`). Imports `BleClient`, `numbersToDataView`, `toUint8Array` (`capacitorBle.ts:19-23`).

**Implements the full `Transport` interface** (`/Users/james/projects/github/jamesawesome/Ergomatic/app/domain/monitor/types.ts:289-313`) — all six members, none omitted:

| `Transport` member | capacitorBle.ts | BleClient call |
|---|---|---|
| `scan()` | :116-124 | `initialize()` then `requestDevice({services:[ROWING_SERVICE_UUID], optionalServices:[CONTROL,ROWING], namePrefix:"PM5"})`, returns a 1-element array |
| `connect(id)` | :126-132 | `BleClient.connect(id, handleDisconnect)` |
| `write(charId, bytes)` | :134-142 | `BleClient.write(id, service, charId, numbersToDataView(Array.from(bytes)))` |
| `subscribe(charId, cb)` | :144-165 | fire-and-forget `startNotifications`; unsubscribe closure calls `stopNotifications` |
| `disconnect()` | :167-172 | `BleClient.disconnect(deviceId)`, guarded by `callerInitiatedDisconnect` |
| `onDisconnect(cb)` | :174-179 | single-slot callback, last-writer-wins |

Plus a local `SERVICE_OF` characteristic→service map (`:48-57`) duplicated verbatim from `webBluetooth.ts:95-104` (rationale comment `:41-47`).

**Stubbed / incomplete vs `webBluetooth.ts`** (`/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/transports/webBluetooth.ts`):

1. **The discovery filter is the one the web transport already learned is wrong on real hardware.** `capacitorBle.ts:119` filters on `services: [ROWING_SERVICE_UUID]` (0x0030). `webBluetooth.ts:192-202` deliberately does NOT — it uses `DEVICE_INFO_SERVICE_UUID` OR `namePrefix "PM5"` because *"0x0030 is not advertised and leaves Chrome's picker empty forever"* (`webBluetooth.ts:181-191`; `/Users/james/projects/github/jamesawesome/Ergomatic/docs/monitor/pm5-interface-notes.md:2469-2471`, `:4319-4321`, `:1067-1070`; and `/Users/james/projects/github/jamesawesome/Ergomatic/app/domain/monitor/pm5/uuids.ts:22-31`). Worse on iOS: the plugin ANDs the filters rather than ORing them — `services` goes straight to `CBCentralManager.scanForPeripherals(withServices:)` (`node_modules/@capacitor-community/bluetooth-le/ios/Sources/BluetoothLe/DeviceManager.swift:124-127`) and `namePrefix` is a separate `guard` on each discovery (`DeviceManager.swift:178-179`). So the PM5 can never appear.
2. **No adapter-availability check.** `webBluetooth.ts:176-180` throws a typed "navigator.bluetooth unavailable" error; capacitorBle never calls `BleClient.isEnabled()` and never surfaces "Bluetooth off" distinctly.
3. **No id validation on `connect()`.** `webBluetooth.ts:206-211` rejects an id its own `scan()` didn't return; capacitorBle accepts any string (this is also what makes id-keyed reconnect *possible* — ROADMAP item, §6 below).
4. **`initialize()` is only called inside `scan()`** (`:117`). A `connect()` without a preceding `scan()` (the future reconnect path) never initializes, and initialize is also where iOS asks for the Bluetooth permission (plugin README `node_modules/@capacitor-community/bluetooth-le/README.md:387`).
5. **No characteristic-cache invalidation analogue.** `webBluetooth.ts:228` clears a handle cache on connect (the §18 `InvalidStateError` bug). capacitorBle holds no handles — probably genuinely unnecessary, but it is unproven on device.
6. **`write` uses the plugin's acked `write`** — no `writeWithoutResponse` variant, unlike `webBluetooth.ts:253-259`'s documented-risky `writeValueWithoutResponse` preference (`webBluetooth.ts:242-252`, flagged as interface-notes §17 item 10). The two transports therefore have *different* write semantics on the multi-chunk CSAFE path.
7. **`toUint8Array(value) ?? new Uint8Array(0)`** (`:159`) — `toUint8Array` really can return `undefined` (`node_modules/@capacitor-community/bluetooth-le/dist/esm/conversion.d.ts:40`), so an empty frame is silently delivered to the driver rather than dropped.
8. **No `displayMode`/`setDisplayStrings`** — see §3; the plugin's picker is app-drawn and its copy is configurable.

**Honest-coverage boundary is written into the file** (`:9-17`) and enforced by exclusion at `/Users/james/projects/github/jamesawesome/Ergomatic/app/vitest.config.ts:58`.

---

## 2. The adapter chooser (post-#70)

**File:** `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/adapters/monitorTransport.ts` (57 lines; added by `d6679e9`, PR #70).

**Exact decision logic** (`:49-57`):
```
defaultTransport():
  if (isNative())  -> await import("../monitor/transports/capacitorBle").then(m => m.createCapacitorBleTransport())
  else             -> resolveDefaultTransport()          // unchanged web seam
```
- `isNative()` = `Capacitor.isNativePlatform()` — `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/platform.ts:3-5`.
- Web arm delegates to `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/transports/index.ts:203-224`, whose logic is: DEV-or-`VITE_ENABLE_FAKE_MONITOR` **and** `window.__pm5FakeScript__` set → dynamic-import `fake.ts` wrapped in `autoTicking`; otherwise `navigator.bluetooth ? createWebBluetoothTransport() : null`.
- Consumed at `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/useMonitorSession.ts:966-968` — `depsRef.current.createTransport ?? defaultTransport`, awaited unconditionally.
- Native arm deliberately **never** reaches the fake seam (`monitorTransport.ts:30-39`; pinned by test, §6).
- The dynamic `import()` inside the branch is what keeps the plugin out of the web bundle — `isNative()` is a runtime check, so a static import would ship it everywhere (`monitorTransport.ts:20-28`).

**Where the platform conditional goes / the lint rule:**
`/Users/james/projects/github/jamesawesome/Ergomatic/app/eslint.config.js:58-114`. Config block:
- `files: ["src/**/*.{ts,tsx}"]` (`:63`)
- `ignores` (`:64-84`): `src/platform.ts`, `src/api.ts`, `src/native/**`, `src/adapters/**`, and — named individually, not globbed (`:69-82`) — `src/monitor/transports/capacitorBle.ts`, `src/monitor/transports/webBluetooth.ts`, plus `src/**/*.test.{ts,tsx}`.
- Rule is `no-restricted-imports` with three pattern groups (`:85-112`): (a) `@capacitor/*`, `@capacitor-community/*`, `@capgo/*`, `@aparajita/*`; (b) `**/platform`; (c) `**/native/*`.

So any new platform branching must land in `src/adapters/**` (or `src/platform.ts`), and any new BLE-plugin import must be in `src/adapters/**`, `src/native/**`, or be added by name to the `ignores` list at `:81-82`. **Note the rule only restricts *imports*** — it does not catch a raw `navigator.bluetooth` probe in a screen, which is exactly the hole in §3/§4 below.

Established idiom to mirror: `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/adapters/keepAwake.ts:40-48` (branch → `await import("../native/keepAwake")`), with the plugin call itself in `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/native/keepAwake.ts:1-11` (wrapped in `/* v8 ignore */`).

---

## 3. "The OS picker IS the scan UI" — every place it is baked in

### Where the assumption lives

| Place | Cite | What it says |
|---|---|---|
| Spec decision C2 | `/Users/james/projects/github/jamesawesome/Ergomatic/docs/superpowers/specs/2026-08-07-phase-7b-connected-design.md:51` | "**The OS picker IS the scan UI on both platforms.** `requestDevice` (web and Capacitor alike) opens a modal, single-result, no-RSSI chooser; the app never sees a device list. Interstitial states 1/2/3 are NOT BUILT; `phase` has no `"choosing"`; a dismissed picker is the new `scan-dismissed` error." |
| Spec supersession note | same file `:41-42` | "Interstitial states 1-3 are descoped … a transport-reality supersession of the handoff, not a taste call." |
| Spec out-of-scope | same file `:214-215` | states 1-3 + background scan/RSSI → named follow-on |
| Plan | `/Users/james/projects/github/jamesawesome/Ergomatic/docs/superpowers/plans/2026-08-07-phase-7b-connected.md:182`, `:242` | "`connect(): Promise<void>; // opens the OS picker ("picking")`"; "NO states 1-3 (the OS picker is the scan UI — `picking` shows nothing)" |
| Phase type | `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/useMonitorSession.ts:71-75`, `:78` | `"picking"` = "their chooser is open, we are showing nothing of ours" |
| Error union doc | same file `:100-102` | `"scan-dismissed"` — "the rower closed the OS picker (or it returned nothing) … renders on state 6's skeleton with a retry, per the C2 ruling" |
| Hook API doc | same file `:207-208`, `:632` | "Opens the OS picker (`"picking"`)"; "a second press while the OS picker is open" |
| Hook implementation | same file `:956`, `:978-989` | sets `phase:"picking"`, then `const found = await transport.scan(); const device = found[0]; if undefined → scan-dismissed` |
| Failure classifier | same file `:537-578` (esp. `:566`) | `name === "NotFoundError" || /cancel/i.test(message)` → `scan-dismissed`; `/adapter|not enabled|not available|unavailable|disabled|powered off|turned off/i` → `bluetooth-off`; else `link-failed` |
| Interstitial header | `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/workout/ConnectedInterstitial.tsx:8-12` | "States 1-3 (the OS chooser) are NOT built here" |
| Interstitial render | same file `:262-267` | `if (phase === "idle" \|\| phase === "picking") return null;` |
| Interstitial mount effect | same file `:198-205` | "opens the OS picker the instant this screen exists" |
| Try-Again branch | same file `:241-260` | no device name → "reopening the OS picker from scratch" |
| Surface model | `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/workout/connected/surfaceModel.ts:47` | lists `picking` among the pre-live phases |
| Tests | `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/workout/ConnectedInterstitial.test.tsx:231-240`; `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/useMonitorSession.test.ts:359-389` | "phase %s renders nothing" for `idle`/`picking`; NotFoundError → scan-dismissed; empty array → scan-dismissed |

**DEVIATIONS rows:** there is **no** DEVIATIONS row recording the C2 ruling itself. `/Users/james/projects/github/jamesawesome/Ergomatic/docs/design/DEVIATIONS.md:64` records the *sixth* error member `link-failed` (and cites "the picker had just worked"); `:72` and `:80` record the C5 reconnect/MISSED-rows descope. The C2 ruling lives only in the spec, the plan, and the source comments listed above.

### Does the plugin present a native OS picker on iOS? **No.**

The plugin draws **its own UIKit UI inside the app**, not an OS chooser:

- `requestDevice` handler: `node_modules/@capacitor-community/bluetooth-le/ios/Sources/BluetoothLe/Plugin.swift:154-197`. It reads `displayMode` (default `"alert"`, `:165-170`) and calls `startScanning(..., deviceListMode, 30, ...)` — **scanDuration = 30 s** (`:180`).
- `.alert` mode: a `UIAlertController` titled with the "scanning" string, one `UIAlertAction` **appended per discovered device**, plus a Cancel action — `DeviceManager.swift:226-236` and `:195-202`.
- `.list` mode: a custom `DeviceListView` sheet with a table (`DeviceManager.swift:238-252`, `DeviceListView.swift`).
- After 30 s the scan stops and the dialog's **title changes** to `"No device found"` / `"Available devices"` (`DeviceManager.swift:138-162`; default strings at `Plugin.swift:591`). The promise does **not** settle on timeout — it stays pending until the user taps a device or Cancel.
- Copy is configurable via `BleClient.setDisplayStrings({noDeviceFound, availableDevices, scanning, cancel})` (`Plugin.swift:145`; README `:165`) and via `displayMode: 'alert' | 'list'` (`dist/esm/definitions.d.ts:52`; README `:941`). **Neither is used by `capacitorBle.ts` today.**

### How closely does it mirror Web Bluetooth?

| Aspect | Web Bluetooth (Chromium) | Capacitor plugin on iOS |
|---|---|---|
| Who draws it | Browser chrome, out-of-page | The app itself (UIAlertController / UIKit sheet) — it will render *over* the interstitial's `return null` |
| Result shape | Single `BluetoothDevice` | Single `BleDevice` (`Plugin.swift:189`) — the single-result half of C2 **does hold** |
| Multiple devices | Browser lists them, user picks one | Alert accumulates one action per device — **also a list**, just an in-app one |
| Filter semantics | `filters` array is **OR**'d | `services` + `namePrefix` are **AND**'d (`DeviceManager.swift:124-127`, `:178-179`) |
| Cancellation | throws `DOMException` `NotFoundError`, message "User cancelled the requestDevice() chooser." | `call.reject("requestDevice cancelled.")` — `DeviceManager.swift:232`, `:249`. Reaches JS as a plain `Error`; `name` is **not** `NotFoundError` |
| Does `mapRadioFailure` still classify it? | yes via `name` | **yes, via the `/cancel/i` message arm** (`useMonitorSession.ts:566`) — but only because of that regex, and the message is an untranslated English literal from the plugin |
| Timeout / empty | picker scans forever | scan stops at 30 s, dialog title flips to "No device found", promise stays pending → phase stuck at `"picking"` with a blank screen behind an in-app alert |
| deviceId | Chromium opaque id | iOS `CBPeripheral.identifier.uuidString` (README `:926`); usable with `getDevices` for id-keyed reconnect (`bleClient.d.ts:90-96`) |
| Device name | advertised | "identical to `localName` the first time … after connecting `device.name` is the cached GAP name in subsequent scans" (README `:964`, definitions.d.ts:288) |

**Consequence for the C2 ruling:** the "single-result modal chooser the app never sees a device list from" description is accurate for Web Bluetooth and *half*-accurate for iOS. The app still receives one device, so `Transport.scan()`'s contract holds — but the "OS owns the screen, we render nothing" justification for `ConnectedInterstitial.tsx:262-267` does not: on iOS it is *our own process* drawing a bare alert over a blank white screen.

---

## 4. Permissions / iOS infra

**Plist — already present and correct.**
`/Users/james/projects/github/jamesawesome/Ergomatic/app/ios/App/App/Info.plist:40-41`:
```
NSBluetoothAlwaysUsageDescription
"Ergomatic connects to your Concept2 PM5 monitor over Bluetooth to program workouts and record your splits."
```
Committed in `78e1542` ("the Bluetooth purpose string Apple asked for, pinned so it stays (#67)"). This is exactly what the plugin README demands (`node_modules/@capacitor-community/bluetooth-le/README.md:106-108` — *"otherwise the app will crash when trying to use Bluetooth"*).

**No Podfile — this project uses SPM.** `/Users/james/projects/github/jamesawesome/Ergomatic/app/ios/App/` contains `App`, `App.xcodeproj`, `CapApp-SPM` only. `.gitignore` still lists `app/ios/App/Pods/` (root `.gitignore:12`) but no Podfile exists.

**The SPM manifest does NOT include the BLE plugin.** `/Users/james/projects/github/jamesawesome/Ergomatic/app/ios/App/CapApp-SPM/Package.swift:13-28` lists only secure-storage, keep-awake, and social-login. Last commit touching it: `3fcc78a` (Phase 3). Working tree is clean, so this is the committed state.

**And its pnpm paths are stale/dead.** `Package.swift:15-17` points at `node_modules/.pnpm/…_@capacitor+core@8.4.2/…`; the installed store has only `…_@capacitor+core@8.5.0` variants (`node_modules/.pnpm/` listing) and `capacitor-swift-pm` is pinned `exact: "8.4.2"` (`:14`) against `@capacitor/core ^8.5.0` (`package.json:43`). The iOS project will not resolve until `npx cap sync ios` regenerates it — which `pnpm ios:build` does (`package.json:35`).

**Contradictory generated artifact.** `/Users/james/projects/github/jamesawesome/Ergomatic/app/ios/App/App/capacitor.config.json:10-15` — gitignored (`app/ios/.gitignore:12`), mtime Aug 9 09:20 — already lists `"BluetoothLe"` in `packageClassList`, while `Package.swift` (mtime Aug 9 09:29, git-clean) does not carry the dependency. The two generated halves disagree; a fresh `cap sync` is needed to make them consistent.

**The last iOS sync predates the native transport being reachable.** `/Users/james/projects/github/jamesawesome/Ergomatic/app/ios/App/App/public/assets/index-CstNA2eK.js` (Aug 9 09:20, gitignored) contains `webBluetooth`, `gattserverdisconnected`, `PM5` — but **no** `capacitorBle` and no `BluetoothLe`. That build was made before `monitorTransport.ts` existed (`d6679e9`), so `createCapacitorBleTransport` had no call site and was tree-shaken out. **The Capacitor BLE path has never been in an iOS bundle.**

**Root capacitor config carries no BLE plugin block:** `/Users/james/projects/github/jamesawesome/Ergomatic/app/capacitor.config.ts:7-11` has only `CapacitorHttp`. The plugin supports a `BluetoothLe` config block for `displayStrings` (`Plugin.swift:145`; README `:165`) — currently unset.

**Other README demands:**
- Background modes: `README.md:110` — `bluetooth-central` in `UIBackgroundModes` **only if BLE is needed while backgrounded**. Not present in Info.plist. Relevant because `Transport.onDisconnect`'s own doc explicitly names "iOS backgrounding" as a drop cause (`domain/monitor/types.ts:308-311`) and a rowing session survives a screen lock (interface-notes §17 runsheet mentions phone-lock/unlock, `docs/superpowers/specs/2026-08-07-phase-7b-connected-design.md:225`).
- **Simulator is useless:** `README.md:133` — *"Bluetooth is not available in the iOS simulator. The `initialize` call will be rejected with an error 'BLE unsupported'."* Device-only verification.
- Permission-denial dead end: `README.md:512` + `bleClient.d.ts:61` — if the rower declines on the first `initialize`, the app can never re-prompt; the only remedy is `BleClient.openAppSettings()`. Nothing in this repo calls that.
- No capabilities/entitlements are required beyond the plist string.
- Android permissions section (`README.md:139-161`) is not applicable — no Android target.

**iOS deployment target** is `.iOS(.v15)` (`Package.swift:6`); `displayMode: 'list'` uses `sheetPresentationController` gated on iOS 15+ (`DeviceManager.swift:241`) — compatible.

---

## 5. Seams that must NOT change

**The driver's transport contract.** `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/driver.ts` takes `t: Transport` (`:605`) and calls exactly four of the six methods:

| Call | Line | Purpose |
|---|---|---|
| `t.write(SAMPLE_RATE_UUID, …)` | `driver.ts:1002` | fire-and-forget sample-rate config at construction; failure logged as `transport-error` (`:1003`) |
| `t.subscribe(TRANSMIT_CHARACTERISTIC_UUID, …)` | `driver.ts:1007` | CSAFE responses |
| `t.onDisconnect(reason => …)` | `driver.ts:1050` | link drop |
| `t.subscribe(uuid, …)` | `driver.ts:1159` | status characteristics loop |
| `t.subscribe(GENERAL_STATUS_UUID, …)` | `driver.ts:1860` | |
| `await t.write(RECEIVE_CHARACTERISTIC_UUID, chunk)` | `driver.ts:2264`, `:2433` | chunked CSAFE program frames |
| `await t.disconnect()` | `driver.ts:2680` | |

**The driver never calls `scan()` or `connect()`** — those belong to the hook (`useMonitorSession.ts:980`, `:991`). It also subscribes **once at construction** (ROADMAP `/Users/james/projects/github/jamesawesome/Ergomatic/ROADMAP.md:1419-1421` names driver re-subscribe as the missing piece for reconnect).

Contract text that constrains any change: `domain/monitor/types.ts:289-313` — notably `write` receives bytes already chunked to the BLE budget (`:292-295`, by `pm5/framer.ts`'s `chunkFrames`), `subscribe`'s `cb` gets raw bytes one notification per call and reassembly is the caller's job (`:296-300`), and `onDisconnect` is **never** fired by a caller-initiated `disconnect()` (`:308-312`) — the M-2 guard both transports implement (`capacitorBle.ts:84-113`, `webBluetooth.ts:137-156`).

**The fake's seam.** `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/transports/index.ts` — header `:1-77`, `resolveDefaultTransport` `:203-224`, `autoTicking` `:155-182`, `window.__pm5FakeScript__` / `__pm5FakeControls__` `:104-130`. Gate is `import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1"` (`:208-209`), both statically false in a real deploy so Rollup folds the dynamic `import("./fake")` away. The native arm of `defaultTransport` bypasses this file entirely (`monitorTransport.ts:52-54`) — pinned by a test (§6).

**dist-grep's guarantees.** `/Users/james/projects/github/jamesawesome/Ergomatic/app/scripts/dist-grep.sh` — three string-literal needles at `:58`: `"fake transport"`, `"PM5 lab (dev harness"`, `"PM5_BRIDGE_PORT"`, greppd `-rl` over `dist/client` (`:51`, `:66`), wired into CI after `pnpm build`. Rationale for string-literals-not-identifiers at `:11-21`. Nothing in the phone-BLE work should add a dev-only string to a production chunk; note the gate greps `dist/client`, which is also what `cap sync` copies into `ios/App/App/public`.

**Coverage exclusions to keep aligned with the lint `ignores`.** `/Users/james/projects/github/jamesawesome/Ergomatic/app/vitest.config.ts:44-74` — `capacitorBle.ts` `:58`, `webBluetooth.ts` `:59`, `scripts/pm5-lab.ts` `:67`, `src/platform.ts` `:68`, `src/native/**` `:48`. `eslint.config.js:75-77` explicitly says the two lists must match exactly. Global thresholds are 90 % (`vitest.config.ts:77-81`), `domain/**` 100 % (`:82-87`) — so any new **non-excluded** adapter file (e.g. `src/adapters/blePermissions.ts` or `src/native/ble.ts`) needs tests or an exclusion entry in **both** files.

---

## 6. Existing tests

| File | Cites | What it covers |
|---|---|---|
| `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/transports/capacitorBle.test.ts` | 81 lines, **3 tests** | Mocks the whole `@capacitor-community/bluetooth-le` module (`:17-38`), including the real library's behaviour of firing the connect callback on a caller-initiated disconnect (`:25-31`). Tests only the M-2 `onDisconnect` guard: caller-disconnect swallowed (`:43`), genuine drop passes through (`:54`), reconnect resets the guard (`:69`). **Nothing tests `scan()`, its filters, `write`, or `subscribe`.** File header (`:3-14`) states the ceiling explicitly. |
| `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/adapters/monitorTransport.test.ts` | 98 lines, **4 tests** | The platform branch, via `vi.doMock("../platform")` + `vi.resetModules()` (`:3-12`). Web arm delegates to `resolveDefaultTransport` and never calls the Capacitor factory (`:15-33`); web arm returns `null` synchronously-unwrapped (`:35-48`); native arm dynamic-imports the Capacitor factory and never calls `resolveDefaultTransport` (`:52-70`); **native arm never reads `window.__pm5FakeScript__` even when set** (`:72-97`). |
| `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/transports/webBluetooth.test.ts` | 7 tests | Fake `navigator.bluetooth`/GATT modelling Chrome's `InvalidStateError` handle invalidation (`:29-40`); retro-tests for the three §18 live fixes — discovery filter shape, cache cleared on connect, single `gattserverdisconnected` listener (`:19-27`). **The capacitor transport has no analogue of any of these.** |
| `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/monitor/useMonitorSession.test.ts:359-389` | | Picker dismissal (`NotFoundError`) and empty-array both → `scan-dismissed`; `:391+` bluetooth-off disambiguation. All against stub transports, no plugin. |
| `/Users/james/projects/github/jamesawesome/Ergomatic/app/src/workout/ConnectedInterstitial.test.tsx:231-240`, `:992` | | `idle`/`picking` render an empty DOM; "a dismissed OS picker: a real scan-dismissed failure". |
| Other Capacitor-touching adapter tests (same `vi.doMock("../platform")` idiom) | `src/adapters/keepAwake.test.ts`, `src/adapters/auth.test.tsx`, `src/api.test.ts`, `src/session/LogSession.test.tsx` | precedent for how to test a new platform branch |

**No e2e test touches the Capacitor path** — `e2e/` matches for "bluetooth"/"picker" are `screenshots.spec.ts`, `design.spec.ts`, `session.spec.ts`, all Chromium/fake-driven. No test exercises `WorkoutDetail`'s `useBluetoothStatus` under a native platform.

---

## Risks and unknowns, ranked

1. **The iOS discovery filter is known-broken before it is ever run.** `capacitorBle.ts:119` filters on the rowing service 0x0030, which hardware proved is not advertised (`docs/monitor/pm5-interface-notes.md:4319-4321`, `:2469-2471`), and the plugin ANDs `services` with `namePrefix` at the CoreBluetooth layer (`DeviceManager.swift:124-127`, `:178-179`). Expected symptom on device: an alert that says "No device found" after 30 s, forever. The web transport already carries the fix (`webBluetooth.ts:192-202`) and the comment explaining it.
2. **The Connect button will be dashed out and captioned "NO BLUETOOTH ON THIS DEVICE" on iOS.** `useBluetoothStatus()` probes `navigator.bluetooth` directly (`/Users/james/projects/github/jamesawesome/Ergomatic/app/src/workout/WorkoutDetail.tsx:59-97`), which is undefined in WKWebView (confirmed by the repo's own note, `docs/monitor/pm5-interface-notes.md:1975`). `:64-72` sets `"absent"`, `:597` dashes the block, `:608-612` renders the caption, and `:613` suppresses the `LAST USED · <name>` caption entirely. This is a second platform conditional that #70 did not close, and the lint rule doesn't catch it because it restricts imports, not `navigator` reads. Ranked #2 only because it's cosmetic-plus-misleading rather than functionally blocking (`ConnectAction` stays tappable, `:585-587`).
3. **iOS SPM is not wired for the plugin and the manifest is stale.** `Package.swift:13-28` lacks the BLE dependency, and its pnpm paths point at `@capacitor+core@8.4.2` store dirs that no longer exist. `cap sync ios` regenerates both — but it also rewrites a **tracked** file, so the diff needs reviewing/committing, and the generated `capacitor.config.json` already disagrees with it (`packageClassList` contains `"BluetoothLe"`). Unknown: why the two generated halves diverged on Aug 9.
4. **Nobody has ever built the Capacitor transport into an iOS bundle.** The synced `ios/App/App/public/assets/index-CstNA2eK.js` (Aug 9) contains `webBluetooth` but not `capacitorBle`/`BluetoothLe` — a pre-#70 build. First-run unknowns (plugin registration, `initialize` permission prompt, bundle size, tree-shaking of the dynamic import) are all untested.
5. **The C2 "OS picker" premise is false on iOS in a way that changes the UX, not just the prose.** The plugin draws a `UIAlertController` in-process (`DeviceManager.swift:226-236`), so `ConnectedInterstitial.tsx:262-267`'s `return null` renders a blank app screen behind our own alert — not "the OS owns the screen". It's also a multi-row list, undercutting "the app never sees a device list" as the reason states 1-3 were descoped. Decisions available and currently unused: `displayMode: 'list'` (`definitions.d.ts:52`) and `setDisplayStrings` (`bleClient.d.ts`, README `:165`).
6. **The 30-second scan timeout leaves the promise pending.** `Plugin.swift:180` passes `scanDuration: 30`; `stopScan` only retitles the dialog (`DeviceManager.swift:138-162`). Nothing resolves or rejects, so `phase` stays `"picking"` indefinitely until the rower taps Cancel. There is no timeout anywhere on `Transport.scan()` in this repo.
7. **Cancellation classification hangs on a message regex.** The plugin rejects with `"requestDevice cancelled."` (`DeviceManager.swift:232`, `:249`) — no `NotFoundError` name — so `scan-dismissed` is reached only via `/cancel/i.test(message)` at `useMonitorSession.ts:566`. Any plugin wording change (or a localized build) silently reclassifies a normal cancel as `link-failed`. Also unverified: whether the plugin also emits messages matching the `bluetooth-off` regex at `:556` (`/not available|unavailable|disabled/`), which would win the earlier branch.
8. **Permission-denial is a one-shot with no recovery path in this app.** `initialize()` is the prompt (README `:387`) and is only called inside `scan()` (`capacitorBle.ts:117`); a declined prompt can never be re-requested in-app (README `:512`) and `BleClient.openAppSettings()` has no call site here. There is also no `ConnectedError.reason` that means "you denied Bluetooth permission" — it would fall into `link-failed` or `bluetooth-off` depending on the plugin's message.
9. **Background modes are undeclared, and the disconnect contract already names iOS backgrounding as a drop cause** (`domain/monitor/types.ts:308-311`). With no `bluetooth-central` in `UIBackgroundModes` (README `:110`), a screen-locked rower likely drops the link — and 7B ships lose-and-degrade with no reconnect at all (`docs/superpowers/specs/2026-08-07-phase-7b-connected-design.md:52`, `ROADMAP.md:1416-1426`). Unknown: what iOS actually does to an active GATT connection when the WKWebView suspends.
10. **Divergent write semantics between the two transports.** `webBluetooth.ts:253-259` prefers `writeValueWithoutResponse` (flagged risky at `:242-252`, interface-notes §17 item 10); `capacitorBle.ts:136-141` always uses the acked `BleClient.write`. Any hardware finding about chunked CSAFE writes on one transport does not transfer to the other.
11. **Verification is device-only.** Simulator rejects `initialize` with "BLE unsupported" (README `:133`), CI has no radio (`vitest.config.ts:49-57`), and both transports are coverage-excluded. Whatever ships must be provable on James's iPhone against a real PM5 — the same boundary interface-notes §17 already draws.
12. **`toUint8Array` can return `undefined`** (`conversion.d.ts:40`); `capacitorBle.ts:159` silently substitutes an empty `Uint8Array`, feeding a zero-length notification into `pm5/framer.ts`'s reassembler. Unknown whether that path is reachable in practice or how the reassembler reacts.
13. **Adding new files under `src/monitor/transports/` or `src/adapters/` has two lists to update in lockstep** — `eslint.config.js:64-84` and `vitest.config.ts:44-74`, with 90 %/100 % thresholds behind them. The eslint comment (`:75-80`) records that a bare glob was deliberately rejected.