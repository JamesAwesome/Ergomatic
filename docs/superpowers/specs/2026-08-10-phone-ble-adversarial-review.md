# Adversarial review — phone-BLE design spec (2026-08-10)

**Target:** `docs/superpowers/specs/2026-08-10-phone-ble-design.md`
**Evidence base attacked:** `docs/superpowers/specs/2026-08-10-phone-ble-scouting.md`
**Method:** every load-bearing citation re-read this session against the live worktree
(`.claude/worktrees/phone-ble`, rebased on main) and against the installed plugin source
(`app/node_modules/@capacitor-community/bluetooth-le@8.2.0`, main checkout — the worktree
has no `node_modules`). All plugin line numbers below were read this session.

**Counts: 3 BLOCKING · 7 IMPORTANT · 6 MINOR · 6 NOTE**

What the spec gets right is worth saying once: the filter fix (§3.1), the four-ruling
mapping (§2), the lockstep table (§9), the classifier cites (§5), the iOS wiring facts
(§8 minus one path typo), and the walk script (§10) all verified clean against source.
The findings below are where it is wrong, self-contradictory, or hangs on a premise the
plugin source disproves.

---

## BLOCKING

### B1. §6's capability adapter is a self-contradicting triad: boolean adapter + "byte-identical web semantics" + "WorkoutDetail never touches navigator.bluetooth" cannot all hold

The spec's sketch is one function: `hasBluetoothSupport(): boolean` (native → true, web →
`"bluetooth" in navigator`), and §6 claims "web semantics are byte-identical" while
acceptance 7 pins "`WorkoutDetail` no longer touches `navigator.bluetooth`".

But `useBluetoothStatus` is a FOUR-state async hook, and its `"off"` state comes from a
`getAvailability()` probe on `navigator.bluetooth` itself:

- `WorkoutDetail.tsx:57` — `type BluetoothStatus = "unknown" | "available" | "off" | "absent"` (read this session)
- `WorkoutDetail.tsx:89-96` — `probe.getAvailability().then((available) => setStatus(available ? "available" : "off"))`
- `WorkoutDetail.tsx:597` — `const dashed = bluetoothStatus === "off" || bluetoothStatus === "absent"`
- `WorkoutDetail.tsx:605-607` — the `"off"` state renders its own caption `BLUETOOTH IS OFF`

A boolean adapter cannot produce `"off"`. So either WorkoutDetail keeps reading
`navigator.bluetooth` for the probe (acceptance 7 fails), or the `"off"` state and its
caption become dead code on web — a Chromium machine with its adapter disabled flips from
dashed-"BLUETOOTH IS OFF" to a live Connect button (the "byte-identical" claim is false).
The falsifying lines are the ones the spec's own citation (`WorkoutDetail.tsx:59-97`)
spans; it cited the function and did not read the probe branch inside it.

**Fix before planning:** the adapter must carry the probe, not just the presence bit —
e.g. `probeBluetoothStatus(): Promise<"available" | "off" | "absent">` (native arm
resolves `"available"`; web arm reproduces `:63-96` including the fail-open branches),
with the hook consuming that. Then acceptance 7 and byte-identical web semantics can both
be true.

### B2. §3.5's `ensureInitialized()` sits on a false premise: `BleClient.initialize()` is NOT idempotent — every call builds a new CBCentralManager, and a scan→connect double-init hands a peripheral to a central that never discovered it

- `Plugin.swift:62-72` — `initialize` unconditionally constructs a NEW `DeviceManager`
  (read this session): `self.deviceManager = DeviceManager(...)`.
- `DeviceManager.swift:35-41` — the constructor builds a NEW `CBCentralManager` and wipes
  `discoveredPeripherals` (fresh instance).
- `dist/esm/bleClient.js` `initialize()` — just queues `BluetoothLe.initialize(options)`;
  no memoization, no initialized flag anywhere in the JS wrapper (read this session).

The spec: "`initialize()` moves to a shared `ensureInitialized()` called by BOTH `scan()`
and `connect()`". Implemented naively (each caller awaits `BleClient.initialize()`), the
normal flow scan → connect re-initializes BETWEEN `requestDevice` and `connect`: the
`Device` in the plugin's `deviceMap` survives (`Plugin.swift:739-748`), but
`deviceManager.connect` (`DeviceManager.swift:266-276`) then calls
`centralManager.connect(...)` on a **new** central with a `CBPeripheral` retained from the
**old, discarded** central — cross-central peripheral use, which CoreBluetooth does not
define. Today's file is accidentally safe only because `connect()` never initializes
(`capacitorBle.ts:126-132`, read this session).

**Fix before planning:** `ensureInitialized` must memoize a module/transport-level
promise — initialize once, reuse the settled success, and CLEAR the memo on rejection so a
denied-then-re-allowed rower gets a fresh prompt path. This cannot be caught by the §9
tests: a mocked `BleClient` hides `DeviceManager` replacement entirely, so the spec text
is the only place the requirement can live.

### B3. §3.3's failure model for the abandoned scan is wrong at all three layers it describes

The spec's acceptance: "no permanent hang: the retry card is reachable behind the sheet,
and Cancel always settles cleanly against an already-settled promise (a no-op rejection
swallowed by the race)". Three claims, three defects:

1. **"The retry card is reachable behind the sheet" is false.** The list sheet is a modal
   view controller with `isModalInPresentation = true` (`DeviceListView.swift:14`, read
   this session — "don't allow drag to dismiss"), presented over the whole window
   (`DeviceManager.swift:238-252`); the alert variant is a `UIAlertController`
   (`:226-236`), equally modal. No touch reaches the WKWebView until the rower taps the
   sheet's own Cancel or a device row. The card renders behind the sheet; it is reachable
   only AFTER cancel.
2. **Races don't swallow.** `Promise.race` leaves the losing promise's later rejection
   unhandled; without an explicit `.catch` attached to the abandoned plugin promise, the
   rower's eventual Cancel tap fires `unhandledrejection` in the WKWebView. Acceptance
   test 2 pins the right behavior but the spec's stated mechanism ("swallowed by the
   race") would pass review while shipping the leak. The plan must require an explicit
   attached catch.
3. **The spec never mentions that BleClient serializes EVERY call through one promise
   queue.** `bleClient.js` constructor: `this.queue = getQueue(true)`; `queue.js`:
   `currentTask = currentTask.then(() => fn())...` (both read this session). Every
   BleClient method — `initialize`, `isEnabled`, `setDisplayStrings`, `requestDevice`,
   `connect`, even `openAppSettings` — runs inside that queue. After the 35s abandonment
   the NATIVE `requestDevice` stays pending until the user acts, so any BleClient call
   issued in the interim silently never executes. Today the system is coherent only by
   accident of finding 1 (modality prevents a retry until Cancel settles the queue). The
   plan has to be built on the real invariant: **no BleClient call may be issued between
   ScanTimeoutError and the sheet's user dismissal**, and the code today respects it only
   because the timeout path's `transport.disconnect()` no-ops on `deviceId === null`
   (`capacitorBle.ts:167-172`, `useMonitorSession.ts:1006-1008`, both read this session).

The design (timeout → retry UI) survives; the described mechanism does not, and the
acceptance sentence as written would be implemented and tested as written. The real
recovery sequence to spec: timeout → card renders behind modal sheet → rower taps the
sheet's Cancel → abandoned promise rejects into the attached catch, queue drains → card
now visible and tappable → retry scans fresh (native scanning already stopped at 30s:
`DeviceManager.swift:117-123`, `:138-162`).

---

## IMPORTANT

### I1. §3.4's permission-denied arm is over-broad, and the "exact denial message" it defers is sitting in the plugin source

`initialize()` rejects with exactly two strings, both knowable now (read this session):

- `DeviceManager.swift:60-62` — `.unauthorized` → `"BLE permission denied"`
- `DeviceManager.swift:63-65` — `.unsupported` → `"BLE unsupported"`

The spec's rule — "initialize() rejects, message NOT matching /unsupported/" → permission
card — therefore also captures every OTHER initialize failure: above all the Capacitor
bridge's own `"BluetoothLe" plugin is not implemented on ios` when the SPM wiring §8
exists to fix is wrong or a future sync regresses it. That failure would render
"Bluetooth permission needed / Open Settings" for a build defect — the §8 risk masquerading
as the §4 card, on the exact phase where §8 is doing something new. Match positively
(`/permission denied/i` → `BluetoothPermissionError`), let everything unrecognized fall
through to `link-failed`, and pin the mock to the real string `"BLE permission denied"`.

### I2. §3.4's `isEnabled()` check has an unpinned ordering that changes its classification, and the ordering is load-bearing

- `Plugin.swift:74-80` — `isEnabled` guards on `getDeviceManager`; uninitialized it
  rejects `"Bluetooth LE not initialized."` (`Plugin.swift:598-604`, read this session).
  That message matches no classifier arm (`useMonitorSession.ts:556`, `:566`, read this
  session) → `link-failed`, not `bluetooth-off`.
- The check is not optional belt-and-braces: **initialize RESOLVES when Bluetooth is
  off** (`DeviceManager.swift:54-56` — `.poweredOff` → `resolve("BLE powered off")`), so
  `isEnabled` is the ONLY off-detector on this path.

The spec says only "before scanning". Pin the pipeline order explicitly:
`ensureInitialized()` → `isEnabled()` → (`setDisplayStrings` anywhere) → `requestDevice`.

### I3. §4 names the union and the card but not the third place the new reason must land, and nothing mechanical will catch the omission

`ConnectedInterstitial.tsx:68-75` (read this session): `NOT_A_MACHINE_REFUSAL` is a
`Set<ConnectedError["reason"]>` — adding `"permission-denied"` to the union compiles
cleanly WITHOUT touching the set, and `failedSerifLine` (`:85-88`) then renders **"The
monitor wouldn't take it"** for a permission denial. TypeScript exhaustiveness does not
protect a Set. The spec must name the set as a required edit (or convert it to an
exhaustive `Record`). Relatedly, the failed card's serif line is `error.detail` — §7's
card title/body/button need a specified mounting point in the existing failed-card
structure, which the spec does not give.

### I4. The timeout window leaves a live, pickable sheet whose late RESOLUTION the spec never handles — only late rejection

After the plugin's 30s stop, rows already discovered stay in the sheet and remain
tappable (`DeviceManager.swift:195-210` — actions/rows persist; selection still calls
`resolve("startScanning", deviceId)`). So a rower who taps their PM5 at t=36s resolves
the ABANDONED promise: the sheet dismisses, and the app shows "No monitor was picked. /
Try again" despite a successful pick. Acceptance 2 swallows only "a late plugin
rejection"; a late resolution must be swallowed too (no connect was made, so swallowing
is safe — `requestDevice` only picks). Add it to acceptance 2 and to walk step 5's
observation list (pick late instead of cancelling, record what the rower sees).

### I5. `startNotifications` failure is an unmapped, unlogged hang path that §3.5 silently re-blesses

`capacitorBle.ts:154-161` (read this session): `void BleClient.startNotifications(...)` —
`void` does not catch; a rejection (plugin rejects on missing service/characteristic,
`Plugin.swift:544-565`) becomes an unhandled promise rejection and the driver never
learns its subscription is dead. The §3.4 table covers scan-phase failures only; §3.5
says "everything else in the file stands". Result on device: connect succeeds, program's
CSAFE responses never arrive, the phase machine sits below the ready gate with no typed
error — exactly the "permanent hang" class ruling 2 exists to kill, one phase later. At
minimum: attach a catch that records into the monitor log (the driver already logs
`transport-error` for its own fire-and-forget write, `driver.ts` per SCOUT §5) or routes
through the disconnect callback; or the spec records this as a known hole with the walk
as its detector.

### I6. The 35s race's scope is ambiguous, and `initialize()` can hang forever

`DeviceManager.swift:58-59`, `:66-67` (read this session): `.resetting` and `.unknown`
settle nothing — an `initialize()` during radio reset stays pending indefinitely. §3.3
says the race wraps "the plugin call"; if that means only `requestDevice`, a hung
initialize escapes the timeout and `picking` hangs with no sheet at all. Pin: the race
wraps the entire `scan()` pipeline (initialize + isEnabled + requestDevice).

### I7. All three UNVERIFIED tags are verifiable right now from the installed plugin source — the spec should carry the answers, not the deferrals

Per the briefing's deferral rule, an answerable premise may not be deferred. Answers:

- **§3.2 (setDisplayStrings before initialize):** YES, legal. `Plugin.swift:143-152` has
  no `getDeviceManager` guard (it only mutates `self.displayStrings`); the JS wrapper
  only queues; and `requestDevice` re-applies the current strings itself at
  `Plugin.swift:157` (`deviceManager.setDisplayStrings(self.displayStrings)`).
- **§3.3 (programmatic dismissal):** NO API exists. No plugin method dismisses the
  requestDevice UI; `stopScan` (also all `stopLEScan` does) only retitles
  (`DeviceManager.swift:138-162`); dismissal happens only on user Cancel or row selection
  (`DeviceListView.swift:95-98`, `:116-120`; alert path `DeviceManager.swift:197-201`,
  `:229-233`). The walk observes residual behavior, but the API question is closed.
- **§3.4 (denial message text):** `"BLE permission denied"` (`DeviceManager.swift:61`).
  Restricted (parental controls) is the same `.unauthorized` state, same string. Pin the
  mock to it (see I1).

---

## MINOR

### M1. §8 cites a wrong path for the SPM manifest

Spec: "`ios/App/App/CapApp-SPM/Package.swift`". Actual: `app/ios/App/CapApp-SPM/Package.swift`
(verified by `ls app/ios/App/` this session: `App`, `App.xcodeproj`, `CapApp-SPM`). The
scouting pack has it right; the spec inserted an extra `App/`.

### M2. §3.2's "safe either way per README:165" cite does not support the claim

README:165 is the display-strings CONFIG section ("You can configure the strings that are
displayed in the device selection dialog…", read this session) — it says nothing about
call ordering. The claim is true, but its evidence is `Plugin.swift:157` (requestDevice
re-applies current strings) and `Plugin.swift:143-152` (no init guard). Citation names
the subject, not the falsifier — the exact defect class the briefing calls out.

### M3. The spec's edits falsify at least five standing source comments and names none of them

- `capacitorBle.ts:70-75` — factory doc: "`scan()` opens the OS's native device picker …
  filtered to the C2 Rowing service" — both halves become false (in-process sheet; no
  services filter).
- `useMonitorSession.ts:71-75` — phase-union doc: "the OS picker IS the scan UI on both
  platforms … we are showing nothing of ours" — the backdrop contradicts it.
- `ConnectedInterstitial.tsx:8-12` (header, per SCOUT §3) and `:262-266` — "render
  nothing of ours over it".
- `useMonitorSession.ts:100-102` — `scan-dismissed` doc gains a second producer (timeout).
- `useMonitorSession.ts:632` — "while the OS picker is open".

§11 supersedes the 7B spec doc but not the source rationale. House rule: a stale
rationale is a defect; list them in the plan's file inventory.

### M4. Timeout renders a lie and the sheet copy points at a button that is not there

`ScanTimeoutError` → `scan-dismissed` → detail `"No monitor was picked."`
(`useMonitorSession.ts:566-571`) — untrue for a timeout (nothing was offered). And §7's
`noDeviceFound` string ("No monitor found. Wake the PM5 and try again.") shows inside a
sheet whose only control is Cancel. Consider a timeout-specific `detail` under the same
reason, and copy that says "…then Cancel and try again."

### M5. Scouting-pack cite drift the spec inherits: `definitions.d.ts:52` → actually `:57`

`displayMode?: 'alert' | 'list'` sits at `dist/esm/definitions.d.ts:57` (read this
session), not `:52` as SCOUT §3 states. All other plugin cites I checked
(`Plugin.swift:154-197`, `:165`, `:180`; `DeviceManager.swift:124-127`, `:178-179`,
`:138-162`, `:226-236`, `:232`, `:249`, `:241`; README `:106-108`, `:110`, `:133`,
`:165`, `:387`, `:512`, `:941`) are accurate.

### M6. §8's "expected diff" for the regenerated manifest is understated

Beyond adding BluetoothLe, a fresh sync also rewrites: the `capacitor-swift-pm` pin
`exact: "8.4.2"` → 8.5.x (`Package.swift:14`, read this session), and ALL THREE existing
plugin store paths (`:15-17` embed `_@capacitor+core@8.4.2` and
`@capgo+capacitor-social-login@8.3.39`; installed is core 8.5.0 and social-login
`^8.3.40` per `package.json:36`). Enumerate these as expected so the reviewer's
"anything else gets explained or investigated" clause doesn't fire on known churn.

---

## NOTE

### N1. "No `services` key" reaches CoreBluetooth as an EMPTY ARRAY, not nil

`Plugin.swift:606-612` — `call.getArray("services", String.self) ?? []` →
`scanForPeripherals(withServices: [])`. Empty-array-scans-all is the plugin's universal
name-only usage pattern but is not Apple-documented; walk step 2 ("the PM5 is IN the
list") is the observation that settles it, consistent with the briefing's
wire-premise rule. No change needed; record the premise.

### N2. Observability parity for `permission-denied` needs no monitor-log kind — and walk step 8 will have nothing to stash for step 6

`useMonitorSession.ts:992-993` — the event log is created only AFTER `transport.connect`
succeeds; `:904-908` — the stash writes only when `logRef` is non-null. No scan-phase
failure logs today, so the new reason is at parity with `scan-dismissed`/`bluetooth-off`
unlogged. Corollary: a denial-only session leaves `ergomatic:last-monitor-log` untouched;
the §11 interface-notes entry is manual, which the spec already says.

### N3. `openAppSettings` rides the same serialized BleClient queue

(bleClient.js, read this session.) Unreachable conflict in practice — a pending
`requestDevice` and the permission card cannot coexist (denial means initialize rejected,
so no scan started) — but worth one sentence in the plan so nobody adds a BleClient call
to the picking phase later.

### N4. The plugin's "Already scanning. Stopping now." rejection is unreachable through BleClient

`DeviceManager.swift:132-135` rejects a second concurrent `startScanning`; the JS queue
serializes `requestDevice` calls so two can never be in flight natively. No classifier
arm needed.

### N5. The picking-backdrop blast radius is as small as §5 claims

Grep of `e2e/` for picking-render pins found only unrelated matches (news articles, pain
chips); the sole pin is `ConnectedInterstitial.test.tsx:236-240`
(`it.each(["idle","picking"]) "phase %s renders nothing"` → `toBeEmptyDOMElement`), which
§5 already names for splitting. Verified this session.

### N6. Walk step 6 will traverse an app relaunch, not a resume

iOS terminates a running app when its privacy permission is toggled in Settings. "Open
Settings lands on Ergomatic's settings page; re-allow there → connect works" is still the
right acceptance, but the return trip is a cold launch from WorkoutDetail, not the
permission card. The §7 body copy ("come back and try again") is compatible; the walk
should expect the relaunch rather than reading it as a crash.

---

## Key plugin questions, answered from source (all read this session)

| Q | Answer | Evidence |
|---|---|---|
| (a) `displayMode` per-call or config-only? | **Per-call.** Option on `RequestBleDeviceOptions`; read from the call with default `"alert"`; no config equivalent (config carries only `displayStrings`). | `definitions.d.ts:57`; `Plugin.swift:165-170`; `Plugin.swift:588-596` |
| (b) `setDisplayStrings` before `initialize`? | **Yes.** Native handler has no init guard; `requestDevice` re-applies current strings itself. | `Plugin.swift:143-152`, `:157`; `bleClient.js` (queue only) |
| (c) `initialize()` rejection texts | Denied AND restricted (`.unauthorized`) → `"BLE permission denied"`; simulator/unsupported → `"BLE unsupported"`; never-prompted → the call PENDS until the prompt is answered; **Bluetooth off → RESOLVES** (`"BLE powered off"`), never rejects. | `DeviceManager.swift:48-70` |
| (d) Programmatic dismissal of `requestDevice` UI? | **No.** Nothing dismisses the alert/sheet; `stopScan` only retitles. User Cancel or row-tap are the only closers. | `DeviceManager.swift:138-162`; `DeviceListView.swift:95-98`, `:116-120` |
| (e) `isEnabled()` uninitialized? | **Rejects** `"Bluetooth LE not initialized."`; never triggers initialize. | `Plugin.swift:74-80`, `:598-604` |
| (f) Abandoned-scan state leakage? | Native scanning stops at 30s (`isScanning` false → later scans take the fresh path), so the RADIO doesn't leak. What leaks: the still-presented modal sheet (blocks a second `present`), and the still-pending native call **blocking BleClient's serialized queue** — every later BleClient call waits until the user cancels/picks. | `DeviceManager.swift:103`, `:117-123`, `:138-162`; `queue.js`; `bleClient.js` |
