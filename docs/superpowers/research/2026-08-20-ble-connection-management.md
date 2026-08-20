# Phase LL research pass — BLE connection management: buy, build, or use the platform

Date: 2026-08-20
Commissioned by: `ROADMAP.md` § "Phase LL — The link can be lost, and the app
has to say so", the pass its first checkbox describes.
Status: **a document, not a decision.** No spec follows from it until James
has read it.

---

## What and why, in plain words

On 2026-08-20 the app told James it was armed and ready while the Bluetooth
link to his PM5 was gone, and then would not talk to that PM5 again until he
deleted and reinstalled it. He also reports the mirror image: being offered a
Connect button when the app was in fact already connected. Both come from one
thing — **the app decides whether it is connected by remembering, never by
asking.** Phase LL exists to fix that, and James asked that it start by
checking whether someone has already solved this, "in case we could be
leveraging a library rather than hand-rolling something we're not destined to
be good at."

The short version of what this pass found is that we are not, in fact, short
of code. **iOS already has the primitive we would otherwise invent, and our
plugin actively throws it away; our plugin already ships the two "are we
connected?" calls we have never once called; and the plugin's Bluetooth
on/off channel — which is exactly what James toggled — is sitting unused with
a callback slot open.** The one thing nobody sells us, and the one thing that
turns out to matter most, is knowing what the PM5 itself is capable of: it has
no concept of resuming a session, so "reconnect" can only ever mean "start
watching again", and no copy may ever promise more than that.

The recommendation is at the bottom, with its reasoning and its holes exposed.

## How to read the tags

Every load-bearing claim carries one:

- **PRIMARY** — a vendor document, a published specification, or source code
  I read this session at the path/URL given.
- **SECONDARY** — a third party's documentation or a maintainer's issue reply.
- **INFERENCE** — my reasoning over the above. Never a fact.

Where nothing authoritative exists, this document says **"nothing
authoritative found"** in those words and stops there. It does not fill the
gap with a plausible synthesis. Three of this repo's worst hours went to
confident claims nobody checked, and the house rule that came out of them
binds this file too.

Versions are read from the registry or from installed source this session,
never from memory. Commands and their output are shown where a version is
load-bearing.

---

## 0. The one number to fix before reading further

The installed plugin is **`@capacitor-community/bluetooth-le@8.2.0`**
(`app/package.json:34` declares `^8.2.0`;
`app/node_modules/@capacitor-community/bluetooth-le/package.json` reports
`"version": "8.2.0"`). PRIMARY.

The current published version is **8.3.0** (`npm view
@capacitor-community/bluetooth-le version` → `8.3.0`). PRIMARY.

**Upgrading changes nothing for this phase.** I unpacked 8.3.0 and diffed its
iOS sources against the installed tree:

```
diff -q <8.3.0>/ios/Sources/BluetoothLe/DeviceManager.swift <installed>/…/DeviceManager.swift   # identical
diff  <installed>/…/Plugin.swift  <8.3.0>/…/Plugin.swift                                        # no output
```

Both files are byte-identical between 8.2.0 and 8.3.0. The only API addition
in 8.3.0's `definitions.d.ts` is `allowExtendedAdvertising`, whose own doc
comment ends "**It is ignored on older Android versions and has no effect on
iOS or web**". PRIMARY. So no upgrade is a fix here, and none is a
prerequisite for anything below.

---

## 1. The third option, settled first: iOS's own "connect when it comes back"

The ROADMAP asked that this be settled before anything else is costed,
because if it holds we are about to hand-roll a replacement for a primitive we
currently disarm. **It holds, with one correction to how the brief describes
it and one cost the brief does not mention.**

### 1a. What the plugin does with a connect request

`Plugin.swift:280-303` (installed 8.2.0), `connect`:

```swift
let timeout = self.getTimeout(call, defaultTimeout: CONNECTION_TIMEOUT)
…
device.setOnConnected(timeout, skipDescriptorDiscovery, {(success, message) in
    if success { call.resolve() } else {
        self.deviceManager?.cancelConnect(device)
        call.reject(message)
    }
})
…
self.deviceManager?.connect(device, timeout, …)
```

`Plugin.swift:7` — `let CONNECTION_TIMEOUT: Double = 10`. PRIMARY.

`DeviceManager.swift:266-276`:

```swift
self.centralManager.connect(device.getPeripheral(), options: nil)
self.setConnectionTimeout(key, "Connection timeout.", device, connectionTimeout)
```

`DeviceManager.swift:398-411`:

```swift
private func setConnectionTimeout(…) {
    self.timeoutMap.removeValue(forKey: connectionKey)?.cancel()
    let workItem = DispatchWorkItem {
        self.cancelConnect(device)
        self.reject(connectionKey, message)
    }
    self.timeoutMap[connectionKey] = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + connectionTimeout, execute: workItem)
}
```

and `cancelConnect` (`DeviceManager.swift:312-319`) calls
`self.centralManager.cancelPeripheralConnection(device.getPeripheral())` after
first _deleting_ the `onDisconnected` callback so the cancellation is silent.
PRIMARY.

**So: ten seconds after we ask iOS to connect, the plugin cancels the request
and reports "Connection timeout."** That is the disarming the ROADMAP
describes.

**Correction to the brief, recorded rather than worked around:** the ROADMAP
and F-2's write-up call this "a JS timeout". It is not — it is a Swift
`DispatchWorkItem` on the main queue, inside the plugin's native arm
(`DeviceManager.swift:398-411` above). The JS layer's `connect`
(`dist/esm/bleClient.js:148-161`) adds no timer of its own; it only registers
the disconnect listener and forwards `options`. The mechanism the brief
describes is real and the file:line it cites is right; the layer it names is
wrong, which matters because it changes where a fix would live. The brief's
line numbers (397-411) are one off from the installed source's 398-411.

### 1b. It is configurable from JS, and that is the cheap lever

`dist/esm/definitions.d.ts:163-177`. PRIMARY:

```ts
export interface TimeoutOptions {
    /** Timeout in milliseconds for plugin call.
     *  Default is 10000 for `connect` and 5000 for other plugin methods. */
    timeout?: number;
}
export interface ConnectClientOptions extends TimeoutOptions { … }
```

and `bleClient.d.ts:117`:
`connect(deviceId, onDisconnect?, options?: ConnectClientOptions): Promise<void>`.

`app/src/monitor/transports/capacitorBle.ts` calls
`await BleClient.connect(id, handleDisconnect)` — **no options object at all**,
so it takes the 10 s default. PRIMARY (read this session).

A single argument — `{ timeout: <large> }` — moves the cancellation out to
whatever bound we choose. **That is not the same as "no timeout", and the
difference is a real cost, not a quibble.** The same `timeout` value is
handed to `device.setOnConnected(timeout, …)` (`Plugin.swift:284-286`), which
bounds **service discovery**, not just the radio connect. A large value
therefore also un-bounds a stuck discovery. And there is a live way for
discovery to stick: `Device.swift:81-91`, `didDiscoverCharacteristicsFor`
returns early on error **without incrementing `servicesDiscovered`**, so its
`shouldResolve` condition can never become true and the only thing that ends
the call is the timeout we just made large. PRIMARY. Any change here has to
say what bounds discovery instead.

### 1c. Apple's contract for the underlying call

See §3 Q1. In short, and stated there with the quoted text: Apple documents
that connection requests do not time out, which is what makes a pending
`connect` iOS's own "connect this peripheral when it comes back into range".

### 1d. What this means for the phase

**INFERENCE, and the pivot of this document:** the recovery problem
("a way back that is not deleting the app") does not obviously need an
invented reconnect state machine. It needs (i) the app to stop cancelling
iOS's pending connect at ten seconds, or to re-issue it deliberately, and
(ii) the app to stop assuming it must scan-then-connect from scratch every
time — see §2. Both are argument changes and call sites, not new mechanisms.
That does not make them free; it makes them cheap enough that "buy" has a
much higher bar to clear than it looked like it had.

---

## 2. What the plugin already exposes that we have never called

I enumerated every `BleClient.*` call in our source:

```
grep -rno "BleClient\.[a-zA-Z]*" app/src/
  12 requestDevice   12 initialize   9 startNotifications   6 stopNotifications
   6 isEnabled        6 disconnect    6 connect             5 setDisplayStrings
   3 write            2 openAppSettings
```

PRIMARY. **Zero calls to `getConnectedDevices`, `getDevices`,
`startEnabledNotifications`, `isBonded`, `readRssi`, `getServices`.** This
confirms F-6's grep from the other direction: not "no already-connected
guard on the connect path" but "the three relevant APIs are unreferenced in
the whole client".

### 2a. `getConnectedDevices(services)` — ask the system, don't remember

`Plugin.swift:261-278` → `DeviceManager.swift:260-264`:

```swift
func getConnectedDevices(_ serviceUUIDs: [CBUUID]) -> [CBPeripheral] {
    return self.centralManager.retrieveConnectedPeripherals(withServices: serviceUUIDs)
}
```

PRIMARY. This is the direct answer to F-6 — the app can ask iOS "is a PM5
already connected?" instead of offering a Connect button on a stale belief.

Note the plugin's own side effect, which is useful: every peripheral it
returns is passed through `getOrCreateDevice` and lands in the plugin's
`deviceMap` (`Plugin.swift:271-276`, `:739-747`), which is the map
`getDevice(call)` consults. So a device found this way is immediately
addressable by `connect`/`write`/`startNotifications` **without a scan**.
PRIMARY.

**Unsettled, and it must be settled on hardware before anything is built on
it:** `retrieveConnectedPeripherals(withServices:)` matches on services, and
our own record says the C2 rowing service `0x0030` **is not advertised**
(`pm5-interface-notes.md:4360-4366`, §21 item 1 of the transport facts: "The
C2 Rowing service (`0x0030`) is NOT advertised. Filtering discovery on it
leaves Chrome's picker empty forever"). Advertisement and GATT presence are
different things, and Apple's retrieval API is documented against the
system's knowledge of the peripheral rather than its advertisement (§3 Q5) —
but **I could not establish from any document that this call returns a PM5
whose services the system has never discovered.** It is a one-line probe on
device and it must be run before a design leans on it.

### 2b. `getDevices(deviceIds)` — reconnect without a picker

`DeviceManager.swift:254-258` → `centralManager.retrievePeripherals(withIdentifiers:)`.
PRIMARY. Same `deviceMap` registration. This is the "we know which PM5, go
get it" call, and it is the natural partner to a long-lived pending connect
(§1). We have never called it, and we do not currently persist a device id to
call it with — `lastMonitorDevice` stores a **name**, for a caption
(pm-ledger, phase-open gate entry; confirmed by that entry's own citation of
`ConnectedInterstitial.tsx`'s `saveLastDevice(name: string)`).

Storing an id would be a **stored-shape change** and therefore triad work
under CLAUDE.md's rule. Worth saying out loud now so a later spec does not
discover it at a gate.

### 2c. The enabled-state channel — the one that would have caught F-1's second half

`Plugin.swift:94-102`:

```swift
@objc func startEnabledNotifications(_ call: CAPPluginCall) {
    deviceManager.registerStateReceiver({(enabled) in
        self.notifyListeners("onEnabledChanged", data: ["value": enabled]) })
```

and `DeviceManager.swift:48-70`, `centralManagerDidUpdateState`:

```swift
case .poweredOff:
    self.stopScan()
    self.resolve(initializeKey, "BLE powered off")
    self.emitState(enabled: false)
```

PRIMARY. **James toggled Bluetooth off and on.** That transition runs through
this exact switch, and the plugin will push `false` then `true` to any
registered receiver. We register none, so the app heard nothing.

This matters more than its size: it is a _positive, immediate_ signal for one
of the two ways F-1 was produced, available today, with no invention, no new
dependency, and no timing heuristic. It does **not** cover the out-of-range
half — see §3 Q2 and Q3 for what does and what remains genuinely unknown.

---

## 3. Apple, PRIMARY — the four questions

Apple's documentation site is a JavaScript shell, so plain fetches of the
human-readable pages return nothing usable. Every Apple quote below was
pulled from Apple's own documentation JSON (`developer.apple.com/tutorials/
data/documentation/…`), which is the content those pages render, or by
`curl`-ing the archived guide and the PDF and extracting the text. **The
quotes in Q1, Q2, Q3 and the auto-reconnect finding were each re-fetched and
re-extracted independently of the agent that first found them, and matched
verbatim.**

One methodology note that belongs in the record because it is exactly the
failure mode this repo keeps hitting: during this research a summarising
fetch returned a confident, well-formatted Apple section titled _"What
Happens When the App is Terminated or Force-Quit"_. That section **does not
exist** — downloading the chapter and grepping it finds no occurrence of
"force", "quit", or "force-quit" anywhere. It was fabricated. It was caught
by re-fetching the raw document and grepping, which is the only thing that
would have caught it.

### Q1 — Does `centralManager.connect` ever time out? **No, and Apple says so in one sentence.**

**PRIMARY.** `CBCentralManager.connect(_:options:)`, Discussion, verbatim
(https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/connect(_:options:)):

> "After successfully establishing a local connection to a peripheral, the
> central manager object calls the `centralManager(_:didConnect:)` method of
> its delegate object. If the connection attempt fails, the central manager
> object calls the `centralManager(_:didFailToConnect:error:)` method of its
> delegate object instead. **Attempts to connect to a peripheral don't time
> out.** To explicitly cancel a pending connection to a peripheral, call the
> `cancelPeripheralConnection(_:)` method. **Deallocating `peripheral` also
> implicitly calls `cancelPeripheralConnection(_:)`.**"

**PRIMARY.** Core Bluetooth Programming Guide, "Performing Long-Term Actions
in the Background" — Apple presents the pending connect as _the_ idiom for
"come back into range":

> "When the user leaves home, the iOS device may eventually become out of
> range of the lock, causing the connection to the lock to be lost. At this
> point, the app can simply call the `connectPeripheral:options:` method of
> the `CBCentralManager` class, and **because connection requests do not time
> out, the iOS device will reconnect when the user returns home.**"

**PRIMARY.** `centralManager(_:didFailToConnect:error:)`:

> "The manager invokes this method when a connection initiated with the
> `connect(_:options:)` method fails to complete. **Because connection
> attempts don't time out, a failed connection usually indicates a transient
> issue,** in which case you may attempt connecting to the peripheral again."

**Cancelling.** `cancelPeripheralConnection(_:)`, PRIMARY:

> "This method is nonblocking, and any `CBPeripheral` class commands that are
> still pending to `peripheral` may not complete. **Because other apps may
> still have a connection to the peripheral, canceling a local connection
> doesn't guarantee that the underlying physical link is immediately
> disconnected.** From the app's perspective, however, the peripheral is
> effectively disconnected, and the central manager object calls the
> `centralManager(_:didDisconnectPeripheral:error:)` method of its delegate
> object."

**Is `didFailToConnect` ever called for an out-of-range peripheral?**
Apple does not document this negative directly. INFERENCE, tagged: given
"attempts don't time out" plus the guide's out-of-range example in which the
pending connect simply waits, out-of-range cannot itself be the trigger.

**Verdict on the ROADMAP's premise: it holds.** We disarm a documented
platform primitive ten seconds in, and Apple's own recommended pattern for
the exact situation Phase LL is about — device out of range, come back later
— is the thing we cancel.

### Q1b — a second platform primitive nobody mentioned: `EnableAutoReconnect`

Found while enumerating the connect options, and it is material enough to
have its own heading. **PRIMARY**, `CBConnectPeripheralOptionEnableAutoReconnect`
(https://developer.apple.com/documentation/corebluetooth/cbconnectperipheraloptionenableautoreconnect),
complete text:

> Abstract: "A Boolean value that specifies whether the system automatically
> reconnects with a peripheral."
>
> Discussion: "**After a peripheral device connects, this setting enables the
> system to initiate a connection to the peer device automatically when the
> link drops.** The system uses
> `centralManager(_:didDisconnectPeripheral:timestamp:isReconnecting:error:)`
> to notify the caller about the disconnection."

Availability, read from the same document's platform metadata: **iOS 17.0**,
macOS 14.0, watchOS 10.0. PRIMARY. Our app's deployment target is **iOS
15.0** (`app/ios/App/App.xcodeproj/project.pbxproj`, four
`IPHONEOS_DEPLOYMENT_TARGET = 15.0` entries; the plugin's podspec pins the
same floor), so this needs an `@available` guard, not a floor bump.

The paired delegate method exists —
`centralManager(_:didDisconnectPeripheral:timestamp:isReconnecting:error:)` —
and I checked its page: it carries a **declaration only, with no discussion
text at all.** The semantics are documented on the option, not on the
callback. Recorded as a limit of the source, not glossed over.

**This is iOS's built-in auto-reconnect, with a built-in "we are trying"
signal (`isReconnecting`).** It is genuinely the thing a hand-rolled
reconnect layer would be a worse copy of.

**And it is unreachable from where we stand.** The incumbent plugin passes
`options: nil` to `centralManager.connect` (`DeviceManager.swift:274`,
quoted in §1a) and its JS `ConnectClientOptions` exposes only `timeout` and
`skipDescriptorDiscovery` — there is no passthrough for CoreBluetooth
connect options. PRIMARY, both read this session. Using it means patching or
forking the plugin, or upstreaming a PR. That is a real cost and it belongs
in the buy-vs-build arithmetic in §7, not hidden here.

### Q2 — `.poweredOff` and live connections. **Half documented, and the important half is not.**

**(a) Are existing connections invalidated?** PRIMARY,
`centralManagerDidUpdateState(_:)`, Discussion, verbatim:

> "You implement this required method to ensure that the central device
> supports Bluetooth low energy and that it's available to use. You should
> issue commands to the central manager only when the central manager's
> `state` indicates it's powered on. **A state with a value lower than
> `poweredOn` implies that scanning has stopped, which in turn disconnects
> any previously-connected peripherals. If the state moves below
> `poweredOff`, all `CBPeripheral` objects obtained from this central
> manager become invalid; you must retrieve or discover these peripherals
> again.** For a complete list of possible states, see `CBManagerState`."

Read precisely, Apple draws two lines at different heights, and the
distinction is load-bearing:

- **below `poweredOn`** (which includes `.poweredOff`) → peripherals are
  **disconnected**.
- **below `poweredOff`** (`.unauthorized`, `.unsupported`, `.resetting`,
  `.unknown`) → the `CBPeripheral` **objects become invalid** and must be
  re-retrieved.

So on the plain user Bluetooth toggle James performed, Apple documents
disconnection but **does not** say the peripheral objects go invalid.

**(b) Is `didDisconnectPeripheral` delivered through that transition?**

**Apple does not document this.** Stated in those words deliberately. What
was checked and found silent, each PRIMARY:

- `centralManagerDidUpdateState(_:)` — the full text is quoted above; it
  names no delegate callback.
- `centralManager(_:didDisconnectPeripheral:error:)` — "The manager invokes
  this method when disconnecting a peripheral previously connected with the
  `connect(_:options:)` method." No mention of power-off.
- `CBManagerState.poweredOff` — abstract only ("A state that indicates
  Bluetooth is currently powered off"); **the symbol has no discussion
  section**.
- `CBCentralManager` class overview — nothing on power-off teardown.
- The archived Core Bluetooth Programming Guide, five relevant chapters
  downloaded and grepped: **zero occurrences** of "powered off",
  "poweredOff", "turned off", or "Bluetooth is off".

**Why this is the most consequential negative in the document.** Our entire
lost-link detector is the plugin's disconnect callback, which the plugin
fires only from `didDisconnectPeripheral` (`DeviceManager.swift:338-353`,
PRIMARY). If Apple does not deliver that callback on a power-off transition,
detection is _structurally_ absent for the exact thing James did — and
nothing in Apple's documentation lets us decide either way. **This cannot be
settled by reading. It is settled by instrumenting one phone.**

It also means the design must not rest on the answer: the plugin's
`startEnabledNotifications` channel (§2c) reports the power-off transition
directly and does not depend on the disconnect callback at all. That is
belt-and-braces by construction rather than by taste.

### Q3 — What bounds the delay on an out-of-range drop? **Nothing Apple documents.**

**The spec's numbers, PRIMARY.** Bluetooth Core Specification 6.0, Vol 6,
Part B, §4.5.2 "Supervision timeout":

> "Connection supervision timeout (`connSupervisionTimeout`) is a parameter
> that defines the maximum time between two received Data Channel PDUs or
> Connected Isochronous PDUs before the connection is considered lost. **The
> `connSupervisionTimeout` shall be a multiple of 10 ms in the range 100 ms
> to 32.0 s** … If, at any time in Connection State outside a connection
> event after the connection has been established, the timer
> `T_LLconnSupervision` reaches the `connSupervisionTimeout` value, the
> connection shall be considered lost."

So the 32 s ceiling in the brief is correct.

**Apple's own guidance, PRIMARY.** Accessory Design Guidelines for Apple
Devices, **Release R30**, §58.6 "Connection Parameters" (verified by
downloading the PDF and extracting the text myself; the release string is on
the PDF's own line 4):

> "Connection parameter requests may be rejected if they do not meet these
> guidelines. General connection parameter request guidelines:
> Peripheral Latency ≤ 30 connection intervals. **Supervision Timeout from 6
> seconds to 18 seconds.** …"

**Read what that is and is not.** It is the window in which Apple will
_accept an accessory's request_. It is **not** a statement of the value iOS
negotiates, and Apple does not publish that value.

Two adjacent numbers in the same PDF that must not be quoted here, both
checked: §57.9's "2 seconds or greater" is **Bluetooth Classic** and applies
to the accessory when the accessory is Central; §20.4.7.3's "2–6 seconds" is
inside the **Spatial Accessories** chapter and is class-specific.

**No API exposes or controls it.** I enumerated the complete
Peripheral Connection Options group: `EnableAutoReconnect`,
`EnableTransportBridgingKey`, `NotifyOnConnectionKey`,
`NotifyOnDisconnectionKey`, `NotifyOnNotificationKey`, `RequiresANCS`,
`StartDelayKey`. PRIMARY. **None** touches connection interval, latency, or
supervision timeout.

**The answer to the question the ROADMAP actually asked** — is a
frame-silence watchdog mandatory or belt-and-braces? **Apple does not
document a bound, so on Apple's evidence alone the watchdog is mandatory.**
INFERENCE, tagged: if the PM5 requests and is granted a value inside §58.6's
window, detection would land around 6–18 s — but the negotiated value is
unobservable through CoreBluetooth, so it can never be a product guarantee.

The watchdog's other input is ours and it is well-sourced: we set the PM5's
status sample rate to its fastest setting, and the PM5's own BLE
specification states the cadence. **PRIMARY**, Concept2 PM Bluetooth Smart
Communication Interface Definition Rev 1.30, characteristic `0x0034`:

> "Determines how often slave sends general status and additional status data
> as notifications. Set rate as follows: 0 – 1 sec; 1 - 500ms (default if
> characteristic is not explicitly set by the app); 2 – 250ms; **3 – 100ms**"

and `app/domain/monitor/pm5/commands.ts:94` — `const FASTEST_SAMPLE_RATE =
0x03;` — which `driver.ts:1520` writes to `SAMPLE_RATE_UUID` on every
connect. PRIMARY. Our own device measurement puts the observed spacing at
90–180 ms on iOS (`pm5-interface-notes.md` §21 item 3). **So a watchdog has a
documented nominal tick of 100 ms to work against, and a multi-second
threshold is tens of missed frames, not a guess.**

### Q4 — Does the peripheral identifier survive delete-and-reinstall? **Apple is silent.**

**Apple does not document this.** In those words.

What Apple does say, and it contains a correction to the brief's premise.
**PRIMARY**, `CBPeer.identifier` (`CBPeripheral.identifier` is inherited;
the `cbperipheral/identifier` document is a 404):

> "The value of this property represents the unique identifier of the peer.
> **The first time a local manager encounters a peer, the system assigns the
> peer a UUID, represented by a new UUID object.** Peers use UUID instances
> to identify themselves…"

**The page does not say "specific to the app".** The brief (and a good deal
of folklore) asserts a per-app scoping that the current wording does not
carry. It says "the first time a _local manager_ encounters a peer".

**Cross-launch stability is documented, by implication that Apple intends
you to rely on it. PRIMARY**, Programming Guide, "Retrieving a List of Known
Peripherals":

> "The first time you discover a peripheral, the system generates an
> identifier (a UUID…) to identify the peripheral. **You can then store this
> identifier (using, for instance, the resources of the `NSUserDefaults`
> class), and later use it to try to reconnect to the peripheral using the
> `retrievePeripheralsWithIdentifiers:` method.**"

**The one documented reason it changes is address randomisation, not app
lifecycle. PRIMARY**, same page:

> "**Note:** A peripheral device may not be available to be connected to for
> a few reasons… **some Bluetooth low energy devices use a random device
> address that changes periodically. Therefore, even if the device is nearby,
> the address of the device may have changed since the last time it was
> discovered by the system**, in which case the `CBPeripheral` object you are
> trying to connect to doesn't correspond to the actual peripheral device.
> If you cannot reconnect to the peripheral because its address has changed,
> you must rediscover it using the `scanForPeripheralsWithServices:options:`
> method."

**SECONDARY**, and labelled: an Apple Developer Forums reply (thread 47167)
establishes only that the UUID differs between _different iOS devices_.
Nothing about reinstall.

**INFERENCE, low confidence, and I would not build on it:** the "the system
assigns" / "connected to the system" language suggests the mapping lives in
the OS Bluetooth daemon rather than the app container, which would imply it
survives a reinstall. Apple never states this and the daemon's persistence
rules are undocumented.

**Practical consequence for us, which is the part that actually matters:**
we do not persist a peripheral id today (§2b), so the identifier's
reinstall behaviour is currently irrelevant to our brick — and it becomes
relevant only if a design chooses to store one.

### Q5 — Force-quit versus delete, and the walk's central unexplained fact

**Apple does not document force-quit teardown semantics for CoreBluetooth.**
In those words.

What the Programming Guide documents is **system** termination to reclaim
memory, never a user action. PRIMARY:

> "Even if your app supports one or both of the Core Bluetooth background
> execution modes, it can't run forever. **At some point, the system may need
> to terminate your app to free up memory for the current foreground
> app—causing any active or pending connections to be lost, for instance.**
> As of iOS 7, Core Bluetooth supports saving state information for central
> and peripheral manager objects and restoring that state at app launch
> time."

> "…for a given `CBCentralManager` object, the system keeps track of: the
> services the central manager was scanning for…; **the peripherals the
> central manager was trying to connect to or had already connected to**; the
> characteristics the central manager was subscribed to."

> "As an example, **if your central manager object had any active or pending
> connections at the time your app was terminated, the system continued to
> monitor them on your app's behalf.**"

**Restoration is strictly opt-in. PRIMARY**: "**Core Bluetooth preserves the
state of only those objects that have a restoration identifier**", and
`centralManager(_:willRestoreState:)`: "This method only applies to your app
if it opts in to state restoration by providing
`CBCentralManagerOptionRestoreIdentifierKey` when initializing a
`CBCentralManager`."

**We are not opted in, and cannot be without patching the plugin.** The
plugin constructs its central as `CBCentralManager(delegate: self, queue:
DispatchQueue.main)` — `DeviceManager.swift:40`, no options argument at all
— and grepping the whole of `ios/Sources/` for `RestoreIdentifier` and
`willRestoreState` returns **no matches**, against a control grep for
`CBCentralManager` that hits. PRIMARY. Nor do we declare the background
mode: `app/ios/App/App/Info.plist` has **no `UIBackgroundModes` key** (only
`NSBluetoothAlwaysUsageDescription`). PRIMARY. Our own hardware record
already noted the same thing from the other side —
`pm5-interface-notes.md` §21 item 7: "A 15-20s screen lock did NOT drop the
GATT link (**no `bluetooth-central` background mode declared**…)".

**Whether restoration strictly requires the `bluetooth-central` background
mode: could not establish.** The guide presents restoration inside the
background-modes chapter but never states the dependency; the modern
reference is silent.

**The two retrieval methods, exact sentences.**

`retrieveConnectedPeripherals(withServices:)` — PRIMARY, complete
Discussion:

> "**The list of connected peripherals can include those that other apps have
> connected. You need to connect these peripherals locally using the
> `connect(_:options:)` method before using them.**"

with the return value: "A list of the peripherals that are currently
connected to **the system** and that contain any of the services specified in
the `serviceUUID` parameter." And the Guide's fuller version, PRIMARY:
"Another way to reconnect to a peripheral is by checking to see whether the
peripheral you're looking for is already connected to the system (for
instance, by another app)… **(Even though the device is already connected to
the system, you must still connect it locally to your app to begin exploring
and interacting with it.)**"

`retrievePeripherals(withIdentifiers:)` — PRIMARY, and **there is less here
than the brief assumed**: the page carries a declaration, a parameters
block and a return value, and **no Discussion section at all**. Everything
Apple provides is: "Returns a list of known peripherals by their
identifiers"; "A list of peripherals that the central manager is able to
match to the provided identifiers"; "A list of peripheral identifiers
(represented by `NSUUID` objects) from which `CBPeripheral` objects can be
retrieved." The "connect without scanning" answer comes from the Guide
instead, PRIMARY: "The central manager tries to match the identifiers you
provided to the identifiers of previously discovered peripherals… When the
user selects a peripheral, try to connect to it by calling the
`connectPeripheral:options:` method… **If the peripheral device is still
available to be connected to, the central manager calls the
`centralManager:didConnectPeripheral:` method**."

**On the asymmetry itself — a connection problem that survived a force-quit
and a PM5 power-cycle but was cured by a reinstall:**

**Nothing in Apple's documentation explains this asymmetry.** Apple
documents no difference in CoreBluetooth teardown between force-quit and app
deletion; it does not document force-quit in this context at all; and it
documents nothing about what deleting an app does to Bluetooth state, bonds,
cached identifiers, or preserved restoration state. The two documented
mechanisms that _could_ bear on it — state preservation (which we have not
opted into) and system-held connections visible via
`retrieveConnectedPeripherals` — are quoted above. **I am not going to build
a mechanism out of them.** §6 lists what our own code contributes and what
would discriminate between the candidates.

### Q6 — Already-connected peripherals and multiple centrals

**Apple documents that several apps can hold the same peripheral
concurrently.** PRIMARY, `cancelPeripheralConnection(_:)`: "**Because other
apps may still have a connection to the peripheral, canceling a local
connection doesn't guarantee that the underlying physical link is
immediately disconnected.**" Combined with the `retrieveConnectedPeripherals`
text, Apple's model is: one **system-level** physical link, and each app
holds its own **local** reference over it; a new app must still call
`connect()`, and Apple frames that as a local operation.

**Apple does not document a limit on how many centrals a BLE peripheral
accepts**, and that is correctly not Apple's to specify — it is the
peripheral's firmware and controller resources. The Accessory Design
Guidelines' only nearby text (§57.4, scatternets) is Bluetooth Classic.
See §5 for what the PM5's own document does and does not say.

---

## 4. The BUY side, taken seriously

James's framing was the right one: a BLE reconnect layer's bugs only appear
on real hardware, and that is precisely when borrowing battle-tested code
pays. So this section tries to find something worth buying rather than
looking for reasons not to.

**Every version and every repository fact below was read from the registry
or from a downloaded tarball this session.** Where I re-verified a claim
independently, I say so.

| Candidate                                                            | Version (registry, today) | Capacitor-usable?          | Auto-reconnect                    | State restoration |
| -------------------------------------------------------------------- | ------------------------- | -------------------------- | --------------------------------- | ----------------- |
| `@capacitor-community/bluetooth-le` **(incumbent, 8.2.0 installed)** | **8.3.0**                 | yes, native                | no — cancels at 10 s              | **no**            |
| `cordova-plugin-ble-central`                                         | **2.0.0**                 | yes (Cordova-in-Capacitor) | **yes**, `ble.autoConnect`        | **yes**           |
| `cordova-plugin-bluetoothle`                                         | **6.7.4**                 | probably                   | `reconnect()`                     | yes, undocumented |
| `@capgo/capacitor-bluetooth-low-energy`                              | **8.2.0**                 | yes, native                | **advertised but misimplemented** | no                |
| `react-native-ble-plx` / `react-native-ble-manager`                  | 3.5.1 / 12.5.1            | **no — eliminated**        | —                                 | —                 |
| `Bluejay`, `RxBluetoothKit`, `BlueCap`, `AsyncBluetooth` (Swift)     | see below                 | only via a custom plugin   | mixed                             | mixed             |

```
npm view @capacitor-community/bluetooth-le version        → 8.3.0
npm view cordova-plugin-ble-central version               → 2.0.0
npm view cordova-plugin-bluetoothle version               → 6.7.4
npm view @capgo/capacitor-bluetooth-low-energy version    → 8.2.0
```

### 4a. Eliminated outright, and why it needs saying

**React Native BLE libraries.** `react-native-ble-plx` and
`react-native-ble-manager` are the two largest results in any BLE package
search, so they need ruling out explicitly rather than silently omitting.
They bind to the React Native bridge/TurboModule runtime, which does not
exist in a Capacitor app — our React runs in a WKWebView, not RN's JSI host.
INFERENCE, but not a close call.

**Web Bluetooth wrappers.** There is nothing to eliminate: the search
surfaced only `@types/web-bluetooth`, a types package. WKWebView ships no
`navigator.bluetooth`. **Nothing authoritative found** for any JS/web library
claiming BLE reconnection for hybrid apps — the category does not exist,
because the web layer has no BLE to reconnect.

### 4b. `@capgo/capacitor-bluetooth-low-energy` — the trap, verified myself

Its README advertises exactly what we are shopping for: an `autoConnect`
boolean, "Whether to automatically connect when the device becomes
available."

**The implementation does not do that.** I downloaded the 8.2.0 tarball and
read the iOS source (PRIMARY,
`ios/Sources/BluetoothLowEnergyPlugin/BluetoothLowEnergy.swift:143-147`):

```swift
if autoConnect {
    options = [CBConnectPeripheralOptionNotifyOnConnectionKey: true]
}
centralManager?.connect(peripheral, options: options)
```

`CBConnectPeripheralOptionNotifyOnConnectionKey` displays a **system alert
when the peripheral connects while the app is suspended**. It is not
automatic connection, and — pointedly — it is not
`CBConnectPeripheralOptionEnableAutoReconnect`, which is the constant that
would have done what the README promises (§3 Q1b). The flag is wired to the
wrong constant, not merely worded loosely.

The irony worth recording: this plugin sets **no** connect timer at all, so
its connect is the infinite-pending CoreBluetooth connect we want — arriving
by omission rather than by the feature that claims it. At 470 weekly
downloads and 9 stars, against a plugin whose one connection-management
feature is misimplemented, this is not a dependency to move a hardware path
onto.

### 4c. `cordova-plugin-ble-central` — the only serious BUY candidate

Capacitor runs Cordova plugins (PRIMARY, capacitorjs.com/docs/plugins/cordova:
"When developing an app that uses Capacitor, it's possible to use Cordova
plugins"), and this one is not on the known-incompatible list.

**Auto-reconnect, verified from the downloaded 2.0.0 tarball's own README
(PRIMARY, `README.md:511`):**

> "Automatically connect to a device when it is in range of the phone. When
> the device connects, the connect callback is called with a peripheral
> object. **The call to autoConnect will not time out. It will wait forever
> until the device is in range.** When the peripheral disconnects, the
> disconnect callback is called with a peripheral object. … Calling
> `ble.disconnect` will stop the automatic reconnection."

**State restoration, verified from the same tarball's iOS source (PRIMARY,
`src/ios/BLECentralPlugin.m:50` and `:78`):**

```objc
options[CBCentralManagerOptionRestoreIdentifierKey] = restoreIdentifier;
…
- (void)centralManager:(CBCentralManager *)central willRestoreState:(NSDictionary *)state
```

It also ships `ble.isConnected`, `ble.connectedPeripheralsWithServices`, and
`ble.restoredBluetoothState`.

**The catch, and it is real.** PRIMARY, the same Capacitor doc: "Capacitor
does not support Cordova install variables, auto configuration, or hooks …
you'll need to apply those configuration settings manually by mapping between
the plugin's `plugin.xml` and required settings on iOS and Android." The
restore-state switch is precisely a Cordova install variable
(`BLUETOOTH_RESTORE_STATE` → a `<preference>` read at runtime through
`[[self commandDelegate] settings]`), so it would have to be hand-written
into the generated `ios/App/App/config.xml`. Workable — and exactly the kind
of instruction CLAUDE.md's recurring-failure 13 exists about. It must be
proven on device before it appears in any walk card.

**The migration cost is the part that decides it.** Adopting this is not a
dependency swap. `capacitorBle.ts` is not a thin file: it carries the
one-listener-per-characteristic fan-out that a phone walk proved is
mandatory (`pm5-interface-notes.md` §21 item 1 — a second
`startNotifications` on the same characteristic silently unplugs the first,
which is the stuck-at-"sending the workout" hang), the modal-sheet queue
invariant, the caller-initiated-disconnect guard, the scan-pipeline race and
its two abandoned-loser arms, and the plugin-prose-to-typed-error
translation. Every one of those is calibrated to _this plugin's_ semantics.
A different plugin's notification, queueing and cancellation semantics are
all different, and none of that difference is visible to CI — it lives on
the hardware path where we have no automated coverage at all
(`capacitorBle.ts`'s own header: excluded from the coverage gate, "there is
no BLE radio in CI").

`cordova-plugin-bluetoothle` also implements the restore key and has
`reconnect()`/`isConnected()`/`retrieveConnected()`, but it is undocumented
in its own README, last pushed 2024-03, and carries 252 open issues.
Strictly worse than ble-central.

### 4d. Swift libraries — cost the plugin, then look at the dates

All four (`Bluejay`, `RxBluetoothKit`, `BlueCap`, `AsyncBluetooth`) require
**writing and maintaining a custom Capacitor plugin**: a `CAPPlugin`
subclass, a method table, JSON marshalling for every read/write/notification,
a TS definitions file, and a web-arm equivalent to keep
`adapters/monitorTransport.ts`, the Playwright harness and the fake seam
working. That is not buying a library; it is taking ownership of our BLE
layer with someone else's helper inside it.

Against that cost: **Bluejay** is the best fit on paper (auto-reconnect on by
default, a full `BackgroundRestoreConfig`) and its own README warns
"Background restoration is tricky and difficult to get right" — last commit
2024-01-10, last release 2021, pre-1.0. **RxBluetoothKit**: last release
2020, and it drags RxSwift in. **BlueCap**: last commit 2023-02, no releases.
**AsyncBluetooth** is the only actively maintained one (6.2.2, 2026-05-30)
and has neither reconnect nor restoration — it is a concurrency wrapper, not
a connection manager. None is archived; three are simply stale.

**INFERENCE:** buying a stale Swift library to get auto-reconnect, at the
price of owning a plugin, when iOS 17 ships `EnableAutoReconnect` as a
dictionary key (§3 Q1b), is a bad trade at today's prices.

### 4e. What the BUY survey actually establishes

Two things, and they point in opposite directions:

1. **Nothing on offer beats the platform.** Every candidate's headline
   connection-management feature is a wrapper over the same two CoreBluetooth
   facilities we can reach ourselves: a pending connect that does not time
   out, and state restoration. `cordova-plugin-ble-central`'s
   "will wait forever until the device is in range" **is**
   `centralManager.connect` with nothing cancelling it.
2. **But the incumbent structurally cannot reach one of them.** State
   restoration needs `CBCentralManagerOptionRestoreIdentifierKey` at
   `CBCentralManager` construction, and the incumbent passes no options at
   all (§3 Q5). `EnableAutoReconnect` needs a connect-options passthrough the
   incumbent does not have. Both are upstream-PR-or-fork territory.

Whether that second point matters depends entirely on which problem we are
solving, and that is a product question, not a library question. Restoration
earns its keep only if we want **the system to relaunch a terminated app** to
keep logging. If the requirement is "survive a dropout while the app is in
the foreground and the rower is on the erg", restoration is answering a
question nobody asked.

---

## 5. The does-it-exist question, asked of the PM5

The lesson this repo paid for once: we shipped a PAUSED state the PM5 does
not have, on a monitor whose clock keeps running, and the block we drew
covered the one number that would have told the rower. So before any design
says "reconnecting", establish what the machine has.

Sources: the two Concept2 PDFs, **re-fetched and re-extracted this session**
from the `.nl` mirror our own notes name (`pdftotext -layout`) —
`PM5_BluetoothSmartInterfaceDefinition.pdf` Rev 1.30 and
`PM5_CSAFECommunicationDefinition.pdf` Rev 0.27 — plus
`docs/monitor/pm5-interface-notes.md`.

### 5a. The machine has no notion of a session being resumed. **PRIMARY, by exhaustive enumeration.**

The PM5's workout state machine has exactly fourteen states
(`pm5-csafe.pdf`, `OBJ_WORKOUTSTATE_T`):

```
WAITTOBEGIN(0) WORKOUTROW(1) COUNTDOWNPAUSE(2) INTERVALREST(3)
INTERVALWORKTIME(4) INTERVALWORKDISTANCE(5) INTERVALRESTENDTOWORKTIME(6)
INTERVALRESTENDTOWORKDISTANCE(7) INTERVALWORKTIMETOREST(8)
INTERVALWORKDISTANCETOREST(9) WORKOUTEND(10) TERMINATE(11)
WORKOUTLOGGED(12) REARM(13)
```

**None of them is about the link.** Every transition in Appendix E's "PM
State Transitions" is driven by the rower or by a CSAFE command; a BLE
disconnect appears nowhere in the diagram. And a grep of the whole 8,030-line
CSAFE text extract for "resume", "reconnect", "connection lost" and "link
lost" returns nothing about session continuity — the only hits are a GATT
"Reconnection address characteristic" (`0x2A03`, a standard Bluetooth SIG
attribute, not a Concept2 concept) and unrelated ANT/RF error enum names.

**Nothing authoritative found** for a PM5 concept of "the session I was
part-way through, continued after a link loss". Not "we could not find the
command" — the state machine is enumerated and closed, and there is no state
for it.

### 5b. What DOES continue — and it is not nothing

The workout continues **on the machine**, because the machine was never
depending on us. Our own record establishes the general principle from
hardware: `pm5-interface-notes.md` §19.4, on a related silence we once
misattributed to the monitor —

> "**The monitor never stops responding.** … The silence is ours … A driver
> that wants to keep working after `workoutComplete` should send terminate
> and carry on, not drop the connection."

So the honest product statement is: **the erg keeps counting; only our view
of it stops.** That is exactly what the shipped `LOST THE MONITOR` copy
already says — "Row on. The erg is still counting and End keeps what we
saw." That copy is correct and it may stay.

**And a reconnect can genuinely recover the numbers, without any resume
concept existing**, because the PM5 publishes its _current_ state, not a
delta: `0x0031`'s Distance/Elapsed pair is per-interval and resets at each
boundary (`pm5-interface-notes.md` §20 items 12/24, settled against a
replayed capture), and the split/summary characteristics carry the machine's
own totals. A central that starts watching again mid-piece reads where the
machine **is**. INFERENCE, and it is the design-relevant one: "start watching
again" is weaker than "resume" but stronger than "start over".

**What cannot be recovered is the gap** — the strokes and boundaries that
occurred while nobody was listening. There is no replay: CSAFE is strictly
poll-response with no unsolicited uploads (`pm5-interface-notes.md` §19.4
citing [CSAFE-DEF] Table 17), and the only retrospective store is the
machine's log of a **completed** workout: characteristic `0x003F` ("C2
rowing logged workout characteristic", 15 bytes, NOTIFY) carries a Logged
Workout Hash plus an **Internal Log Address and Size**, addressable through
`CSAFE_PM_GET_INTERNALLOGPARAMS` (`0x99`) and `CSAFE_PM_GET_INTERNALLOGMEMO`
(`0x6A`). PRIMARY, all from the CSAFE PDF. **That is an after-the-fact
retrieval of a finished piece, not a mid-piece backfill**, and we have never
implemented or observed any of it. Recorded because it is the only thing in
either document that could ever fill a gap, so a future spec should know it
exists and know what it is not.

### 5c. The copy constraint that falls out

**Binding, and it is the strongest constraint this pass produces:** no
surface may say or imply that a reconnect picks up where it left off,
because the machine has no such concept and we would be asserting it on the
machine's behalf. `LOST THE MONITOR` (no `RECONNECTING`) remains the right
call, and DEVIATIONS row 75's ruling — that every element of the designed
banner promises a reconnect attempt that does not exist — is _re-confirmed_
by this pass rather than merely inherited. If reconnect is ever built, the
honest vocabulary is about **watching**, not about **resuming**, and any
recovered rows are recovered from the machine's own current readings, with
the gap acknowledged rather than papered over.

### 5d. A claim in the walk record I could not source: "the PM5 is single-central"

F-6 states, as the mechanism behind its hypothesis, "The PM5 is
single-central." **I could not find a source for that in the PM5's own
documentation or in our record**, and I looked in both. Reporting it rather
than working around it, per the briefing.

What the BLE document actually says, PRIMARY:

> "In Bluetooth terminology, the PM5 assumes the Peripheral role and the
> mobile device assumes the Central role."

and it enumerates the supported scenarios as (1) _Single PM5 To Single Mobile
Device_, (2) _Multiple PM5s To Single Mobile Device_, (3) _[future] Multiple
PM5s to single PM5_. **There is no "multiple mobile devices to a single PM5"
scenario in the list.** It also says, under "PM Logic – Unpairing":

> "The PM will unpair from the mobile device when it powers down, or when the
> Mobile Device signals to end the session."

— singular "the mobile device" throughout.

That is a **documented absence plus consistently singular language**, which
is real evidence but is not the same as a stated limit. Tagged INFERENCE:
the PM5 most likely accepts one central at a time. Two consequences follow
and both matter:

- F-6's hypothesis is **weaker than it reads**, and should not be treated as
  vetted ground by a later spec.
- The unpairing sentence is PRIMARY evidence for something F-2 already
  observed: **restarting the PM5 clears the machine's side.** James did
  restart it, and it did not help — which is consistent with the machine
  never having been the problem, and is one more reason to stop looking at
  the PM5 for the brick.

Also PRIMARY, and useful for §3 Q3: the same document describes the
supervision timeout mechanism from the PM5's side —

> "A supervision timeout determines if the connection is good. Both the
> master and slave are aware of the timeout value. The supervision timer is
> reset whenever a valid packet is received. If the timer elapses, the
> master/slave issues a Disconnect event to the application layer and the
> radio returns to an unconnected state."

It does not state the value either.

---

## 6. Our own prior art, and what it means for testability

Quoted, not re-derived — `docs/monitor/pm5-interface-notes.md:2500-2506`,
under "Also fixed live this session":

> "…the GATT characteristic cache surviving reconnects (`InvalidStateError`
> on every post-reconnect write — **would have broken the driver's whole
> reconnect path on real hardware while passing CI, since the fake had no
> handle invalidation**); a duplicate `gattserverdisconnected` listener on
> reconnect…"

and the same fact stated as a transport rule at `:4364`:

> "GATT characteristic handles do not survive a reconnect: every write after
> one throws `InvalidStateError` until the characteristics are re-fetched."

### What this implies, per option

**It is an argument about the FAKE, not about any of the three options.** No
library and no platform primitive changes it. Under buy, build, or
use-the-platform alike, `app/src/monitor/transports/fake.ts` models a
transport whose handles never go stale, so any test of a reconnect path
passes against a fiction. The ROADMAP already draws this conclusion — "**The
fake models handle invalidation**… This is a real work item and it lands
first" — and this pass confirms it applies unchanged whichever option is
chosen.

**It is sharper than "add invalidation to the fake", though.** The defect
class is: _a test whose transport cannot express the failure the real one
produces._ On the native arm the same class has more members than handle
invalidation, and each is a thing the fake would have to be able to express
before a reconnect test means anything:

- a `connect` that is **pending** rather than resolved or rejected (§1c) —
  the fake has no such state;
- a **Bluetooth-off transition** delivered on a channel other than the
  disconnect callback (§2c) — the fake has no enabled-state channel because
  the transport interface has no seam for one;
- **notification silence without a disconnect** — the case a watchdog exists
  for, and the case F-1 actually was;
- a peripheral that is **already connected** when we go to connect it (§2a).

**INFERENCE, and it is a scoping input rather than a design:** whichever
option is chosen, the fake and the `Transport` interface have to grow before
detection or recovery can be tested at all — and that growth is roughly the
same size in all three worlds. It is therefore not a discriminator between
them, which is worth knowing before it is used as one.

**The second half of the same lesson, from the other direction:** this repo's
recurring-failure 11 says every gate we have checks the app against itself.
A reconnect test that passes against our own fake proves nothing about the
erg. The only oracles that have ever caught this class here are hardware with
both screens in one frame, and replay of a committed capture. There is **no
committed capture of a link loss** — F-1's diagnostics ring was lost, and F-3
establishes there was no second route to it on a TestFlight build. **So the
first artifact this phase should produce is a capture of the failure, not a
fix for it.**

---

## 7. Mechanism candidates for F-2, from reading our own code

Not asked for, but the buy-vs-build answer is unusable without it: if the
brick is a defect in our call sequence, no library purchase touches it. Each
item below is read from source this session, and each is stated as a
**candidate to instrument**, never as the cause.

### 7a. The `LINK-FAILED` loop is real and is by construction. **VERIFIED.**

`program()`'s catch (`useMonitorSession.ts:1618-1640`) closes the record,
best-effort-terminates and calls `fail(error)` — **it never disconnects the
transport and never clears `driverRef`.** Contrast `connect()`'s catch
(`:1578-1581`), which does `bestEffort(transport.disconnect())` at `:1580`.

`ConnectedInterstitial.tsx:298-317`, `handleTryAgain` (the branch at `:311-313`): when
`session.deviceName !== null` — which it always is once `connect()` reached
`pairing`, since `driverRef.current = driver` (`useMonitorSession.ts:1570`)
and `update({ deviceName: device.name })` (`:1577`) sit in one synchronous
block — Try Again calls
`session.program(...)` again, **over the same driver and the same transport**.

And there is a second lock behind the first: `connect()` opens with
`if (connectingRef.current || driverRef.current !== null) return;`
(`:1521`). `driverRef` is cleared in only two places
(`:1406` in `teardown`, `:1694` in `cancel`). **So after a failed `program()`,
`connect()` is a no-op** — the only route back to a fresh connect is Cancel
out of the interstitial (`handleCancel` → `session.cancel()` → teardown) and
press Connect again. That door exists and is non-destructive; it is simply
not the one the failure screen offers.

**This sharpens F-2 in a way the walk record does not.** F-2 says "reconnect
attempts reached programming and timed out with `LINK-FAILED`". If they
reached programming, **connect succeeded** — repeatedly. The brick is not
"cannot connect". It is "connects, then cannot program". Any design that
treats it as a connection-establishment problem is aiming at the wrong
target.

### 7b. Every connect attempt builds a new `CBCentralManager`. **VERIFIED, and it is the strongest candidate.**

`useMonitorSession.ts:1533-1535` resolves a transport per attempt:
`await (depsRef.current.createTransport ?? defaultTransport)()`, and
`adapters/monitorTransport.ts`'s `defaultTransport` returns
`createCapacitorBleTransport()` — **a fresh closure with a fresh
`initPromise`** — on every call. It is the only transport construction site
in the app (grep, this session).

`capacitorBle.ts`'s `ensureInitialized` memoises `BleClient.initialize()`
**per transport instance**. So attempt N calls `initialize()` again. And
`Plugin.swift:62-71`:

```swift
@objc func initialize(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
        self.deviceManager = DeviceManager(self.bridge?.viewController, …)
```

**unconditionally replaces** the plugin's `DeviceManager`, whose `init`
constructs `CBCentralManager(delegate: self, queue: DispatchQueue.main)`
(`DeviceManager.swift:40`). PRIMARY. Our own file already names the hazard in
a comment written before anyone had seen this bug: "a scan->connect
double-init hands the picked `CBPeripheral` to a central that never
discovered it — cross-central use CoreBluetooth does not define."

**What is NOT reset alongside it:** `Plugin.swift:55`'s `deviceMap` is a
plugin-level dictionary, untouched by `initialize`. It retains `Device`
objects holding `CBPeripheral`s vended by **previous** central managers.
`getOrCreateDevice` (`:739-747`) reuses the existing `Device` and only swaps
its peripheral. Apple's own sentence from §3 Q1 is the reason this is worth
instrumenting: "**Deallocating `peripheral` also implicitly calls
`cancelPeripheralConnection(_:)`**" — a retained peripheral is _not_
deallocated, so whatever the old central was holding is not implicitly
released either.

**Honest limits on this candidate**, both checked rather than assumed:

- I checked the obvious adjacent hypothesis and **falsified it**:
  `Device.swift:72-75` resets `servicesCount`/`servicesDiscovered`/
  `characteristicsCount` at the top of `didDiscoverServices`, so a reused
  `Device` does not inherit stale discovery counters. That was a plausible
  "connect succeeds, programming fails" story and it does not hold.
- **This cannot explain the force-quit survival.** Every object named here
  dies with the process.

### 7c. A genuine plugin bug in the discovery path, adjacent to §1b

`Device.swift:81-91`: `didDiscoverCharacteristicsFor` returns early on error
**without incrementing `servicesDiscovered`**, so its `shouldResolve`
condition can never be met and the connect call is ended only by the
timeout. PRIMARY. Not our bug and not obviously F-2's, but it is the thing
that would bite if §1b's "make the connect timeout large" were adopted
naively.

### 7d. What remains unexplained, stated as such

**Why a force-quit did not clear it is UNESTABLISHED.** The walk record says
so, the PM gate says so, Apple's documentation does not explain it (§3 Q5),
and nothing I read in our code or the plugin's changes that. I am not going
to name a mechanism.

What I can say is what would discriminate, and it is cheap: **the app's
diagnostics ring, reachable from the failure screen** (the ROADMAP's
diagnosability item), plus one call to `getConnectedDevices` logged at the
moment of failure. Those two together answer "did iOS think we were
connected?", which is the single fact that splits the remaining hypotheses.
That is an argument for sequencing diagnosability **first**, not third.

---

## 8. Recommendation

**Use the platform, call the functions we already have, and buy nothing.**
Specifically, and in this order:

1. **Diagnosability first, not third.** The one fact that would collapse the
   remaining hypotheses — iOS's own view of the connection at the moment of
   failure — is unobtainable today, and every other item on the phase's list
   is being designed partly blind because of it. Put the ring behind the
   failure and connected surfaces, and log `getConnectedDevices` at connect
   time. This is also the smallest item.
2. **Detection: two signals, not one.** Register
   `startEnabledNotifications` — the plugin's Bluetooth-power channel, which
   covers exactly what James did and requires no invention (§2c) — **and**
   add a frame-silence watchdog. Apple documents no bound on out-of-range
   disconnection latency (§3 Q3), and does not document whether
   `didDisconnectPeripheral` arrives on a power-off at all (§3 Q2), so the
   watchdog is **mandatory rather than belt-and-braces**. It has a documented
   100 ms nominal tick to work against.
3. **Recovery: fix the loop, then ask the system.** Have the failure path
   disconnect and clear the driver so Try Again can genuinely reconnect
   (§7a), and call `getConnectedDevices`/`getDevices` before scanning, so
   the app observes rather than remembers (§2a, §2b).
4. **Leave the connect timeout alone for now, and revisit it with the
   pending-connect idea in hand.** Raising it is one argument (§1b), but it
   also un-bounds service discovery, and there is a live path where discovery
   never resolves (§7c). It is the right lever and it needs its own bound
   first.
5. **Do not buy.** Nothing surveyed beats the platform; the one thing the
   incumbent structurally cannot reach (state restoration, and iOS 17's
   `EnableAutoReconnect`) answers a question — "relaunch my terminated app to
   keep logging" — that this phase is not asking. If that question is ever
   asked, the answer is a small upstream PR to the incumbent adding a
   connect-options passthrough and a restore identifier, not a migration.

### What would have made me recommend differently

- **If Apple documented that `didDisconnectPeripheral` fires reliably on
  `.poweredOff`**, the watchdog would drop to belt-and-braces and detection
  would be nearly free. It does not, so it does not.
- **If the incumbent were unmaintained**, `cordova-plugin-ble-central` would
  be a serious proposal on the strength of its restoration support alone. It
  is not: 8.3.0 published a week ago, ~67k weekly downloads.
- **If the requirement were "keep logging while the app is backgrounded or
  killed"**, this flips: that need is genuinely served by state restoration
  and `bluetooth-central`, the incumbent cannot express either, and a fork or
  a Cordova migration would be back on the table. **This is the question to
  put to James**, because it is the one input that changes the answer, and it
  is a product decision rather than a technical one.
- **If F-2's failures had been failures to CONNECT**, the pending-connect
  primitive would be the headline fix. They were not — they reached
  programming (§7a) — so the connect primitive is an improvement, not the
  cure.
- **If the PM5 had any resume concept**, recovery would be a much larger
  design with a backfill in it. It has none (§5a), which makes the recovery
  work smaller and the copy rules stricter.

### What I could not establish

Stated plainly, because each of these is a place a design could go wrong
quietly:

1. **Whether `didDisconnectPeripheral` is delivered when Bluetooth is powered
   off.** Apple does not document it. Settled only by instrumenting a phone.
2. **Any documented bound on out-of-range disconnection latency.** Apple
   documents only the 6–18 s window in which it will _accept_ an accessory's
   parameter request, exposes no API, and does not publish what it
   negotiates.
3. **Whether the peripheral identifier survives delete-and-reinstall.** Apple
   is silent; the "specific to the app" premise is not in the current
   wording at all.
4. **Why the brick survived a force-quit.** Nothing in Apple's documentation
   explains the asymmetry, and nothing in our code or the plugin's does
   either. Every plugin-side candidate I found dies with the process.
5. **Whether `retrieveConnectedPeripherals(withServices:)` returns a PM5
   given that the rowing service `0x0030` is not advertised.** A one-line
   probe on device settles it, and §2a's whole value depends on it.
6. **Whether CoreBluetooth state restoration strictly requires the
   `bluetooth-central` background mode.** The guide implies it by placement;
   neither the guide nor the modern reference states it.
7. **Whether the PM5 accepts more than one central.** Its documentation lists
   no multi-central scenario and speaks of "the mobile device" throughout,
   which is a documented absence, not a stated limit. F-6 asserts
   single-central as fact; it should not be inherited as vetted ground.

---

## Appendix — provenance

**Read from installed source this session** (all paths relative to the repo
root):
`app/package.json`; `app/node_modules/@capacitor-community/bluetooth-le/`
(`package.json`, `ios/Sources/BluetoothLe/{Plugin,DeviceManager,Device}.swift`,
`dist/esm/{bleClient.js,bleClient.d.ts,definitions.d.ts}`);
`app/src/monitor/transports/capacitorBle.ts`;
`app/src/monitor/transports/index.ts`; `app/src/adapters/monitorTransport.ts`;
`app/src/monitor/useMonitorSession.ts`; `app/src/monitor/driver.ts`;
`app/src/monitor/connectedAxes.ts`; `app/src/workout/ConnectedSurface.tsx`;
`app/src/workout/ConnectedInterstitial.tsx`;
`app/src/workout/connected/surfaceModel.ts`;
`app/domain/monitor/pm5/commands.ts`; `app/ios/App/App/Info.plist`;
`app/ios/App/App.xcodeproj/project.pbxproj`.

**Registry / tarballs, this session:** `npm view … version` for the four
plugin candidates; `npm pack` + extract for
`@capacitor-community/bluetooth-le@8.3.0` (diffed against installed 8.2.0),
`cordova-plugin-ble-central@2.0.0`, `@capgo/capacitor-bluetooth-low-energy@8.2.0`.

**Apple, fetched this session** via the documentation JSON API and `curl`:
`CBCentralManager.connect(_:options:)`; `cancelPeripheralConnection(_:)`;
`centralManager(_:didFailToConnect:error:)`;
`centralManagerDidUpdateState(_:)`;
`centralManager(_:didDisconnectPeripheral:error:)`;
`centralManager(_:didDisconnectPeripheral:timestamp:isReconnecting:error:)`;
`CBConnectPeripheralOptionEnableAutoReconnect`; the Peripheral Connection
Options group; `CBPeer.identifier`; `centralManager(_:willRestoreState:)`;
`CBCentralManagerOptionRestoreIdentifierKey`;
`retrieveConnectedPeripherals(withServices:)`;
`retrievePeripherals(withIdentifiers:)`; the archived Core Bluetooth
Programming Guide chapters; **Accessory Design Guidelines Release R30**
(PDF, 39 MB, text-extracted).

**Bluetooth SIG:** Core Specification 6.0, Vol 6 Part B §4.5.2, from the
published HTML specification.

**Concept2, re-fetched and re-extracted this session** (`pdftotext -layout`)
from the `.nl` mirror our notes name:
`PM5_BluetoothSmartInterfaceDefinition.pdf` (Rev 1.30, 39 pp) and
`PM5_CSAFECommunicationDefinition.pdf` (Rev 0.27, 162 pp).

**In-repo record cited:** `docs/monitor/pm5-interface-notes.md` (§19.4, §20
items 12/24, §21 items 1/3/7, `:2500-2506`, `:4360-4366`);
`docs/monitor/pm5-ble-ecosystem-review.md`;
`docs/monitor/sessions/walk-2026-08-20-lt-close/README.md` (F-1, F-2, F-3,
F-6); `.claude/agents/pm-ledger.md` (phase-open gate, 2026-08-20);
`docs/design/DEVIATIONS.md` row 75; `ROADMAP.md` § Phase LL.

**Not consulted, and it should be said:** no blog posts or StackOverflow
answers are cited anywhere in this document. One Apple Developer Forums
thread is cited once, in §3 Q4, and is labelled SECONDARY there.

---

# DELTA — 2026-08-20, later the same day: James answered the open question

**Status: still a document, not a decision.** This section EXTENDS the pass
above; nothing above it is rewritten or withdrawn except where a heading
below says so in those words.

## Why there is a delta

The pass above ended with one input that would flip its recommendation:
"whether the app should keep logging while backgrounded or terminated…
**This is the question to put to James**, because it is the one input that
changes the answer." He answered:

> **BACKGROUNDED YES. TERMINATED NO.**
>
> "backgrounded could happen by accident if a person gets an urgent text or
> a call and they answer mid-row."

That answer is narrower and more useful than the question was. It is not a
request for background workouts. It is: **do not lose a rower's row to an
interruption they did not choose.** The screen stays lit for the whole row
(`keep-awake`, §D5), so the app is foregrounded in the normal case. This
work exists for the exception.

Two consequences for scope, before anything else:

- **State restoration leaves scope, mostly.** Restoration exists to let the
  system relaunch a TERMINATED app; TERMINATED is out. One caveat that is
  not a quibble and is developed in §D2c: the archived guide's termination
  case is _the system killing a backgrounded app to reclaim memory_, which
  is exactly what a long phone call can produce. "Terminated: no" disposes
  of the user's force-quit; it does not dispose of memory pressure.
- **A live background-execution question enters scope**, and it turns out
  to have an answer nobody in this project had checked.

## D0. The short version

**Declaring `bluetooth-central` would keep the LINK up and keep frames
arriving at our NATIVE layer. On the evidence I can read, it would not keep
our JavaScript running — and every line of the pipeline that turns frames
into a row is JavaScript.** "The link stays up" and "we keep logging the
row" are, as the brief suspected, different claims, and a background mode
buys only the first.

The mechanism is not Apple's app lifecycle at all. It is WebKit's own
process throttler, which suspends the WebContent process when the view stops
being visible, on a rule that never consults `UIBackgroundModes` (§D1).
There is exactly one source-visible escape hatch and it hinges on a
RunningBoard attribute I cannot read from any document (§D1c) — so the final
answer is **could not be established by reading, and the probe that settles
it is one build and one tap** (§D1e).

The recommendation is **correct resume, not a background mode** (§D8), and
**BUY does not reopen** (§D7) — but for a different reason than the pass
above gives, and the pass above's stated flip condition is therefore
_narrowed rather than triggered_.

---

## D1. Does our JavaScript keep running when the app is backgrounded?

This is the question the brief asked to have settled first, and it deserves
its own chain of custody. Nothing here comes from a summarising fetch: every
WebKit quotation below was `curl`ed as raw source from
`raw.githubusercontent.com/WebKit/WebKit/main/...` this session and grepped
locally. Line numbers are that tree's, today.

### D1a. What our pipeline actually is, so the stakes are clear

Everything above the transport is JavaScript in the WKWebView:
`src/monitor/driver.ts` (the register-map accumulator, boundary detection,
terminal-state machine), `src/monitor/seriesRecorder.ts` (the 1 Hz
recorder), `src/monitor/useMonitorSession.ts` (the flushes and the run
record). The native side ends at the plugin. PRIMARY, read this session.

The one thing that is genuinely good news, and it is load-bearing later:
**that pipeline is almost entirely free of the wall clock.** `driver.ts`'s
own header states the policy — "never `Date.now()`/`setTimeout`" — and the
file holds exactly ONE clock read (`driver.ts:860`, `options.now`, feeding
three predicates) and ONE timer (`driver.ts:867`, `options.schedule`, one
deadline). `seriesRecorder.ts` reads no clock at all: its header says the
work clock is "0x0031's own `elapsedSeconds`/`distanceMeters`… **never the
wall clock**". PRIMARY, both read this session.

### D1b. The chain, read from WebKit's own source

**Step 1 — backgrounding tells WebKit the view is not visible.** PRIMARY,
`Source/WebKit/UIProcess/ios/WKApplicationStateTrackingView.mm`:

```objc
- (void)_applicationDidEnterBackground
{
    RefPtr page = [_webViewToTrack.get() _page].get();
    if (!page) return;
    page->applicationDidEnterBackground();
    page->activityStateDidChange(WebCore::allActivityStates() - WebCore::ActivityState::IsInWindow);
}
```

and `Source/WebKit/UIProcess/ios/PageClientImplIOS.mm:225-238`:

```cpp
bool PageClientImpl::isViewVisibleOrOccluded() { return isActiveViewVisible(); }
bool PageClientImpl::isVisuallyIdle()          { return !isActiveViewVisible(); }
```

whose `isActiveViewVisible()` returns false once `[webView _isBackground]`
is true (`:163-175`), and `_isBackground` is the app-state tracker's
`isInBackground` (`WKApplicationStateTrackingView.mm:141`).

**Step 2 — losing visibility drops the only activity our page holds.**
PRIMARY, `Source/WebKit/UIProcess/WebPageProxy.cpp:3762-3827`,
`WebPageProxy::updateThrottleState()`. The complete set of things that take
a process activity there is three:

```cpp
    if (isViewVisible()) { … takeVisibleActivity(); }
    else if (hasValidVisibleActivity()) { … dropVisibleActivity(); }

    bool isAudible = internals().activityState.contains(ActivityState::IsAudible);
    …            takeAudibleActivity();
    bool isCapturingMedia = internals().activityState.contains(ActivityState::IsCapturingMedia);
    …            takeCapturingActivity();
```

**Visible, audible, capturing. That is the whole list.** A running
`setInterval`, a pending Promise, an open BLE subscription and an
in-progress workout are not on it, and there is nothing to put them there.

**Step 3 — no activities means the process is suspended.** PRIMARY,
`Source/WebKit/UIProcess/ProcessThrottler.cpp:243-250`:

```cpp
ProcessThrottleState ProcessThrottler::expectedThrottleState()
{
    if (!m_foregroundActivities.isEmptyIgnoringNullReferences()) return ProcessThrottleState::Foreground;
    if (!m_backgroundActivities.isEmptyIgnoringNullReferences()) return ProcessThrottleState::Background;
    return ProcessThrottleState::Suspended;
}
```

The transition is a handshake, not a timer: `updateThrottleStateIfNeeded`
(`:355-386`) sends `PrepareToSuspend` and moves the process to the
`Background` assertion, and when the web process replies
`processReadyToSuspend` (`:422-431`) the state goes to `Suspended`. The
20-second constant (`:49`, `static constexpr Seconds
processSuspensionTimeout { 20_s }`) is only the safety net for a web process
that never replies — **it is not a grace period you can count on.** The web
process's own side of the handshake (`WebProcess::prepareToSuspend`,
`Source/WebKit/WebProcess/WebProcess.cpp:1786-1837`) sets
`m_processIsSuspended = true`, calls `releaseMemory`, `freezeAllLayerTrees`,
`destroyRenderingResources` and `markAllLayersVolatile`, then reports ready.

**Step 4 — even before suspension, timers are throttled to 1 Hz.** PRIMARY,
`Source/WebCore/page/Page.cpp:3109-3127` and `:3157-3172`: a page that is
`IsVisuallyIdle` enters `TimerThrottlingState::Enabled`, whose alignment
interval is `DOMTimer::hiddenPageAlignmentInterval()`. PRIMARY,
`Source/WebCore/page/DOMTimer.h:56`:

```cpp
    static constexpr Seconds hiddenPageAlignmentInterval() { return 1_s; }
```

and the setting that gates it defaults ON for us. PRIMARY,
`Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml:3965-3978`:

```yaml
HiddenPageDOMTimerThrottlingEnabled:
  defaultValue:
    WebKit:
      "PLATFORM(COCOA) || PLATFORM(GTK)": true
```

**Nothing in any of the four steps reads `UIBackgroundModes`, a background
task assertion, or anything else about why the host app is still alive.**
That is the finding. WebKit suspends the WebContent process because the view
stopped being visible, and a background mode does not make a view visible.

### D1c. The one link I could not close — and it is the whole answer

There is exactly one place in `WebPageProxy` where an `evaluateJavaScript`
call takes a process activity of its own, and every BLE notification we
receive travels through it (§D4a). PRIMARY,
`Source/WebKit/UIProcess/WebPageProxy.cpp:7580-7586`:

```cpp
    RefPtr<ProcessThrottler::Activity> activity;
#if USE(RUNNINGBOARD)
    if (RefPtr pageClient = this->pageClient(); pageClient && pageClient->canTakeForegroundAssertions())
        activity = protect(processContainingFrame(frameID)->throttler())->foregroundActivity("WebPageProxy::runJavaScriptInFrameInScriptWorld"_s);
#endif
```

If that activity is taken, the WebContent process is held runnable for the
duration of the call — which, at one call per notification and a documented
100 ms notification cadence, would mean **our JavaScript keeps running while
backgrounded.** If it is not taken, the message is queued to a suspended
process and nothing runs.

The guard decides it. PRIMARY,
`Source/WebKit/UIProcess/ios/PageClientImplIOS.mm:208-220`, complete:

```cpp
bool PageClientImpl::canTakeForegroundAssertions()
{
    if (EndowmentStateTracker::singleton().isVisible()) {
        // If the application is visible according to the UIKit visibility endowment then we can take
        // foreground assertions. …
        return true;
    }

    // If there is no run time limitation, then it means that the process is allowed to run for an extended
    // period of time in the background (e.g. a daemon) and we let such processes take foreground assertions.
    return [RBSProcessHandle currentProcess].activeLimitations.runTime == RBSProcessTimeLimitationNone;
}
```

A backgrounded app is not visible, so the answer reduces to: **does a
process running under the `bluetooth-central` background mode have
`RBSProcessTimeLimitationNone`?**

**I could not establish this.** In those words. `RBSProcessHandle` and
`RBSProcessTimeLimitation` are private RunningBoard SPI; Apple publishes no
reference for them, and Apple publishes no mapping from a `UIBackgroundModes`
value to a runtime limitation. What Apple does say points AWAY from
`None` — the archived Core Bluetooth guide's own rule for background-mode
apps is "**Upon being woken up, an app has around 10 seconds to complete a
task**" (quoted in full in §D3), which is the description of a finite
limitation, not of none. But an inference from prose to a private
enumeration is not evidence, and I am tagging it as what it is.

**INFERENCE, and the honest reading of the whole chain:** JavaScript almost
certainly stops. Steps 1-4 are unconditional and documented in source; the
escape hatch requires a RunningBoard grant that Apple's own "around 10
seconds" guidance argues against. But this is precisely the class of claim
this repo has been burned by three times — a flag that could not work, a
bundle probe that was a false green, an operator instruction that was
impossible — and all three were caught by producing the artifact, never by
reading. So: **not established by reading. §D1e is the probe.**

### D1d. Two corroborations, and what each is worth

Neither settles §D1c's private-SPI question, and I am not going to pretend
they do. Both point the same way as the source chain.

**(i) Apple staff, on this exact question.** Labelled **SECONDARY** to stay
consistent with §3 Q4's treatment of Apple Developer Forums, but noting the
badge: the reply carries Apple's "Frameworks Engineer" staff badge.
https://developer.apple.com/forums/thread/64150, on a question titled
"WKWebView javascript execution when app is backgrounded":

> "This is by design, for the same reasons \*any\* app that is suspended no
> longer gets to execute code.
>
> This might've been relaxed a little bit in iOS releases since you posed
> the question, but only for a few seconds."

A second Apple-staff thread, same label, is worth having beside it because
it names the mechanism our case would depend on and denies the guarantee —
https://developer.apple.com/forums/thread/764096, DTS Engineer, on whether
the `audio` background mode guarantees non-suspension:

> "Strictly speaking, no. The "audio" background category allows your app
> to remain awake while your audio session is active, which isn't quite the
> same as guaranteeing it will not be suspended."

**(ii) Ionic built a whole second JavaScript runtime because of this.**
PRIMARY, `@capacitor/background-runner`'s own README (the text that renders
at capacitorjs.com/docs/apis/background-runner), section "About Background
Runner":

> "The challenge with standard Capacitor applications is that **the webview
> is not available when these background events occur**, requiring you to
> write native code to handle these events. This is where the Background
> Runner plugin comes in."

and its opening line:

> "Background Runner provides an event-based standalone JavaScript
> environment for executing your Javascript code **outside of the web
> view**."

PRIMARY, its iOS implementation
(`packages/capacitor-plugin/ios/Sources/RunnerEngine/Context.swift`) imports
`JavaScriptCore` and builds a `JSContext` — a separate interpreter, not the
WebView's. And PRIMARY, its own "Runner Lifetimes" section rules it out for
us on its own terms:

> "runners are not long lived. **State is not maintained between calls to
> events in the runner.** Each call to `dispatchEvent()` creates a new
> context in which your runner code is loaded and executed, and once
> `resolve()` or `reject()` is called, the context is destroyed."

A stateless, short-lived context that cannot see the DOM cannot host
`driver.ts`'s register-map accumulator. **Background Runner is not a
candidate for this work**, and it is worth saying so explicitly because it
is the first thing anyone searching "Capacitor background" will find.

Capacitor's own maintainer says the flat version, SECONDARY (an issue
comment on Ionic's tracker, jcesarmobile,
ionic-team/capacitor#3340, 2021-05-24): "**Sadly the WKWebView pauses all
the javascript execution once the app enters into background.** The
background task plugin was for extending the time some code could be
executed after the app goes into background, but only works with native code
(plugins), not with javascript."

### D1e. The probe that settles it — and it needs no native code

**One TestFlight build, one tap, ninety seconds.** Have the connected
surface append `{seq, Date.now()}` to a capped array in `localStorage` on
every 0x0031 frame (or reuse the existing diagnostics ring, adding a wall
clock to it for this build only — see §D9 item 4, the ring has none today).
Row, background the app for ~60 s, return, read the record.

- Stamps spanning the background window → JS ran. `canTakeForegroundAssertions()`
  returned true, and §D1c's escape hatch is real for us.
- A hole with a matching gap → JS was frozen. Everything in §D1b applies.
- **A hole AND the app on its home screen with an empty session** → the
  WebContent process was killed and Capacitor reloaded the page (§D2c).

Run it twice: once with `bluetooth-central` declared and once without. The
delta between those two runs is the entire value of the background mode, and
it is currently unmeasured. **Do not write a spec that assumes either
answer.**

---

## D2. If JavaScript does not survive, what would?

The brief asks for the alternatives named honestly: native-side buffering, a
bridge queue that drains on resume, timestamped catch-up, or nothing. Taking
them in order of how much they already exist.

### D2a. A bridge queue that drains on resume — this one may already exist, unbuilt and unbounded

The path a PM5 notification takes, PRIMARY, all read this session:

1. `Device.swift:230` — CoreBluetooth's `didUpdateValueFor` fires in the
   plugin's native arm.
2. `Plugin.swift:553-555` —
   `self.notifyListeners("notification|<device>|<service>|<char>", data: ["value": value])`.
3. `@capacitor/ios`'s `CAPPlugin.m:82-103` — `notifyListeners` looks up the
   registered listeners. **With no listener registered and
   `retainUntilConsumed:NO` (the default the plugin uses), the payload is
   dropped on the floor.** With one registered — our case — it calls
   `call.successHandler`.
4. `CapacitorBridge.swift:578-596` — `toJs` does
   `DispatchQueue.main.async { self.webView?.evaluateJavaScript("window.Capacitor.fromNative({…})") }`.

So **there is no native buffer of our own anywhere on this path.** The only
queue is WebKit's IPC send queue, and it is the same queue §D1c described:
each `evaluateJavaScript` becomes a `RunJavaScriptInFrameInScriptWorld`
message. PRIMARY,
`Source/WebKit/Platform/IPC/Connection.cpp:643-679`: outgoing messages append
to `m_outgoingMessages` without a cap; there is a
`largeOutgoingMessageQueueCountThreshold` but its only effect is a
`RELEASE_LOG_ERROR` ("Too many messages (%zu) in the queue…") and a client
callback — **not a drop and not a bound.** PRIMARY,
`Source/WebKit/Platform/IPC/cocoa/ConnectionCocoa.mm:231-247`: a mach send
that times out stashes the message in `m_pendingOutgoingMachMessage` for
later rather than discarding it.

**INFERENCE, and it is the operative one:** if the app is alive in the
background (it must be, or step 2 never runs), the frames pile up in the
UI process's memory as un-sent IPC and, on return to foreground, drain into
JavaScript in order. That is a drained backlog, arriving for free, with
nobody having designed it.

**What I could not establish, in those words:** whether that backlog
actually survives a multi-minute background window in practice, or whether
memory pressure collects it first (§D2c). It is unbounded by construction,
which is not the same as reliable — an unbounded queue under memory pressure
is a jetsam candidate, not a guarantee. **This is measured by the same probe
as §D1e**, by counting frames rather than reading stamps.

### D2b. Apple documents a system-level queue too — and it applies to us TODAY

This one surprised me and it is the single most useful new fact in the
delta. PRIMARY, the archived Core Bluetooth Programming Guide,
"Performing Tasks While Your App Is in the Background", on **foreground-only
apps** — which is exactly what Ergomatic is right now:

> "All Bluetooth-related events that occur while a foreground-only app is in
> the suspended state are **queued by the system and delivered to the app
> only when it resumes to the foreground.**"

and, from the same page:

> "imagine that you are interacting with the data on a peripheral that
> you're currently connected to. Now imagine that your app moves to the
> suspended state… **If the connection to the peripheral is lost while your
> app is suspended, you won't be aware that any disconnection occurred until
> your app resumes to the foreground.**"

Read together with §D2a, that is a two-stage queue — the system's, then
WebKit's — and both are already in place with zero code written.

**Two things it does NOT say, and both matter.** It states no depth, no
duration and no eviction policy for that queue: **whether iOS holds 1,800
notification events across a three-minute call could not be established.**
And it explicitly warns that the disconnect itself is only learned on
resume — so a link that dropped during the call is not detectable until the
rower comes back, no matter what we build.

### D2c. The failure mode that beats every queue: the WebContent process gets killed

PRIMARY, `@capacitor/ios`'s `WebViewDelegationHandler.swift:158-162`,
complete:

```swift
open func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    CAPLog.print("⚡️  WebView process terminated")
    bridge?.reset()
    webView.reload()
}
```

**Capacitor's response to a killed WebContent process is to reload the
page.** Every piece of in-memory JavaScript state — the driver, the
accumulator, the series recorder, the live `MonitorRun` reference, the BLE
subscriptions — is destroyed, and the app restarts at the SPA's entry. A
suspended WebContent process holding an unbounded backlog is precisely the
kind of process iOS reclaims first.

What survives is what was already written down: `ergomatic.monitorRun` in
`localStorage`. And its cadence is the problem. PRIMARY,
`useMonitorSession.ts:327-336` and `:899-930`: the series flush is
**a 30-second repeating `setInterval`**, plus a flush at each interval
boundary and one at close. A `setInterval` is a DOM timer — throttled to 1 s
alignment while hidden and frozen entirely once the process suspends
(§D1b step 4). **So the last flush before a kill is up to 30 seconds stale,
and after backgrounding no further flush will ever run.**

This is where I must contradict my own brief, gently and on the record. The
brief says James's "TERMINATED NO" removes state restoration from scope
because restoration exists to relaunch a terminated app. That is right about
restoration. It is not right that termination is out: Apple's own framing of
termination in this context is **the system killing a backgrounded app to
free memory**, not the user force-quitting —

> "**At some point, the system may need to terminate your app to free up
> memory for the current foreground app**—causing any active or pending
> connections to be lost, for instance."

and the WebContent-process kill above is a strictly smaller, strictly more
likely version of the same event that Capacitor already handles by throwing
our state away. **"Terminated: no" disposes of the force-quit. It does not
dispose of memory pressure, and memory pressure is what a three-minute call
on a busy phone produces.**

### D2d. Could our pipeline consume a late backlog? Mostly yes — with three named exceptions

The brief asks this directly, on the grounds that PM5 frames carry their own
elapsed and distance. The answer is better than I expected and it has a
sharp edge.

**Yes, for the series.** `seriesRecorder.ts` reads no clock: its work clock
is `baseSeconds + elapsed` from the wire, its decimation buckets are whole
work-seconds, and its own header says "never the wall clock". A backlog that
drains **complete and in order** produces byte-identical samples to a live
stream. PRIMARY.

**Yes, for the driver's core.** `driver.ts` is frame-driven; its programming
budgets are counted in general-status TICKS, never milliseconds
(`driver.ts:148-159`). PRIMARY.

**The three exceptions, each read this session:**

1. `STRUCTURE_MISMATCH_WINDOW_MS = 2000` (`driver.ts:735`, read at `:3598`)
   — a programming-verify window. Not crossed mid-row. Harmless.
2. `activeRun.finishGraceUntil = now() + FINISH_GRACE_MS` (`driver.ts:2328`,
   tested at `:3125`) — set on a terminal frame. If the terminal arrives in
   the backlog, the grace is stamped at drain time and behaves; if it was
   stamped BEFORE the gap, it is long expired by the time the backlog
   drains, and the HRM re-fire the grace exists to absorb would be judged
   out of window. Narrow, real, and worth a test.
3. The summary-fallback deadline (`driver.ts:867`'s `schedule`, the file's
   only timer) — a DOM timer, therefore frozen while suspended and fired
   late. Same shape as #2.

**And the sharp edge, which is a WRONG-NUMBER risk and belongs in any spec:**
the "complete and in order" qualifier is doing all the work. If frames are
**dropped** rather than queued, `seriesRecorder`'s boundary fold breaks
silently. PRIMARY, `seriesRecorder.ts:247-262`: the fold adds
`lastReading.elapsedSeconds`/`.distanceMeters` — the last frame seen BEFORE
the gap — and it only folds at all if `isGenuineBoundary(lastReading.elapsedSeconds, distance)`
holds, which requires the post-reset distance to be under
`MAX_BOUNDARY_RESET_METERS = 3.0`. So a gap that spans an interval boundary
gives two bad outcomes and no good one:

- **Gate accepts** (the rower is barely into the new interval on return):
  the fold banks the stale pre-gap reading, so `baseSeconds`/`baseMeters`
  under-count the missed tail of the completed interval — for the rest of
  the piece.
- **Gate rejects** (the rower has covered more than 3 m): nothing folds at
  all, the work clock drops below its high-water mark, and the recorder's
  own first-bucket-wins guard (`:271-274`) drops every sample until the
  clock climbs back past it — then resumes, permanently understated.

The recorder's own comment already anticipates the benign half of this ("a
reconnect, a stale gap… can only ever produce a MISSING bucket, never a
repeated one") — it is right that nothing duplicates, and that is not the
same as nothing being wrong. **A silent under-count of time and distance is
exactly the class recurring-failure 11 is about.** Whichever option this
phase takes, the recorder has to be TOLD about a gap rather than left to
infer it from a stream that lies to it by omission.

### D2e. Native-side buffering and timestamped catch-up, costed

**Native-side buffering** — a fork or patch of the plugin that accumulates
`didUpdateValueFor` payloads in a Swift array while `UIApplication.shared
.applicationState != .active`, and drains them into
`notifyListeners` on `willEnterForeground`. Twenty lines of Swift in a
plugin we would then own. It converts §D2a's implicit, unbounded IPC queue
into an explicit, bounded, inspectable one, and it fixes nothing else. **It
only helps if the app process is alive to run it** — which requires the
background mode. So it is not an alternative to a background mode; it is a
second purchase on top of one.

**Timestamped catch-up** — stamping each frame natively so JS can
reconstruct real time on drain. Cheap to add, and it would answer #2 and #3
above. But note what the PM5 already gives us for free: each 0x0031 frame
carries its own per-interval elapsed and distance, so **the row is
reconstructable from the frames themselves without any stamp**; a stamp
would only serve the app's own wall-clock predicates. Worth ~10 lines
whenever a native fork happens for another reason. Not worth a fork on its
own.

**Nothing** — see §D6, which is the recommendation.

---

## D3. What `bluetooth-central` actually grants, and what it costs

Every quote in this section is PRIMARY from Apple, fetched this session; the
archived guide is still served as real HTML at the URL in the appendix and
was grepped locally rather than summarised.

### D3a. It is a wake-on-event grant, not a keep-running grant

Apple's current per-value wording no longer lives on the `UIBackgroundModes`
page at all — that page's `possibleValues` entries carry empty `content`
arrays — and has moved to the Xcode configuration page. PRIMARY,
developer.apple.com/documentation/xcode/configuring-background-execution-modes,
the table row, verbatim:

> "Uses Bluetooth LE accessories — `bluetooth-central` — The app
> communicates with a Bluetooth accessory while in the background."

and the same page's Overview, which is the framing that matters:

> "Typically, an app is in a suspended state when it's in the background.
> However, there are a limited number of background execution modes your app
> can support that enable it to run when in the background… For apps that
> adopt one or more of these modes, **the system launches or resumes the
> app, in the background, and affords it time to process any related
> events.**"

The archived Core Bluetooth guide is more specific about what we would get:

> "When an app that implements the central role includes the
> UIBackgroundModes key with the bluetooth-central value in its Info.plist
> file, the Core Bluetooth framework allows your app to run in the
> background to perform certain Bluetooth-related tasks. **While your app is
> in the background you can still discover and connect to peripherals, and
> explore and interact with peripheral data.** In addition, the system wakes
> up your app when any of the CBCentralManagerDelegate or CBPeripheralDelegate
> delegate methods are invoked…"

and it bounds the wake explicitly, in the section titled "Use Background
Execution Modes Wisely":

> "Apps woken up for any Bluetooth-related events should process them and
> return as quickly as possible so that the app can be suspended again."
>
> "- Apps should be **session based and provide an interface that allows the
> user to decide when to start and stop the delivery of Bluetooth-related
> events.**
>
> - **Upon being woken up, an app has around 10 seconds to complete a task.**
>   Ideally, it should complete the task as fast as possible and allow itself
>   to be suspended again. Apps that spend too much time executing in the
>   background can be throttled back by the system or killed."

**So the shape of what we would buy is: the link stays up, `didUpdateValueFor`
keeps firing into Swift, and the app is woken in ~10-second slices to handle
it.** That is a coherent picture for a native app that writes each sample to
a database in a few milliseconds. It is not a picture in which a React
render tree keeps ticking, which is the §D1 finding restated from Apple's
side.

For completeness, the general-purpose statement, PRIMARY,
developer.apple.com/documentation/uikit/preparing-your-ui-to-run-in-the-background:

> "When your app is in the background, it should do as little as possible,
> and preferably nothing."
>
> "Apps don't normally receive any extra execution time after they enter the
> background. However, UIKit does grant execution time to apps that support
> any of the following time-sensitive capabilities: … **Communication with
> Bluetooth LE accessories**, or conversion of the device into a Bluetooth LE
> accessory. …"

### D3b. What it costs on the scan side — and one fact that bites us specifically

PRIMARY, `scanForPeripherals(withServices:options:)`, Discussion:

> "Your app can scan for Bluetooth devices in the background by specifying
> the `bluetooth-central` background mode. To do this, **your app must
> explicitly scan for one or more services by specifying them in the
> `serviceUUIDs` parameter.** The CBCentralManager scan option has no effect
> while scanning in the background."

and the archived guide:

> "- The CBCentralManagerScanOptionAllowDuplicatesKey scan option key is
> ignored, and multiple discoveries of an advertising peripheral are
> coalesced into a single discovery event.
>
> - If all apps that are scanning for peripherals are in the background, the
>   interval at which your central device scans for advertising packets
>   increases. As a result, it may take longer to discover an advertising
>   peripheral."

**And our scan cannot satisfy that requirement as written.** PRIMARY,
`app/src/monitor/transports/capacitorBle.ts:330-338` — the call passes **no
`services` key at all**, only `namePrefix: "PM5"`, with a comment giving the
reason: "0x0030 is not advertised and the plugin ANDs `services` with
`namePrefix` at CoreBluetooth". Our own transport record says the same
(`pm5-interface-notes.md:4360-4363`). A background scan MUST name services;
ours names none, and the one service we care about is not advertised.
Filtering on the device-information service (`0x180A`, which the PM5 does
advertise — same note) would be legal but is a service nearly every BLE
accessory publishes, so a background scan on it is close to unfiltered.

Background scan is already OUT of this phase's scope. Recording it here so a
later spec does not discover it at a gate.

### D3c. A carve-out that did not exist when the earlier pass was written

PRIMARY, developer.apple.com/documentation/corebluetooth, Overview,
verbatim:

> "In iOS 26 and later, your app can continue certain activities in the
> background if the app starts a Live Activity before it goes to the
> background. If your app has an instantiated `CBManager` and starts a Live
> Activity, **it can use the same privileges while in the background that it
> uses when it is in the foreground.** This means activities like scanning
> without providing service UUID's and scanning with duplicates filter
> disabled will be allowed while in the background."

This is Apple's own, current, sanctioned mechanism for a session-style app
to hold foreground-equivalent Bluetooth privileges while backgrounded, and
it is tied to something the rower can SEE — a Live Activity on the Lock
Screen — rather than to a silent assertion. It answers §D3b's scan
restrictions completely.

**It does not answer §D1.** A Live Activity restores _Bluetooth_ privileges;
nothing in that paragraph or anywhere else says it changes WebKit's process
throttling, and §D1b's chain does not consult it. Stating that plainly
because it is exactly the kind of adjacent-sounding fact this repo has
turned into a wrong assumption before.

It is also a genuinely attractive PRODUCT idea for the very scenario James
described — a rower on a phone call, glancing at the Lock Screen and seeing
the row still counting. That is new scope, needs ActivityKit, needs iOS 26,
and is not something this phase should absorb. Recorded for the roadmap, not
proposed.

### D3d. App Review's posture, which is milder than the brief supposes

The brief says `bluetooth-central` is "a reviewed entitlement-adjacent
declaration and apps have been rejected for declaring it without a
qualifying use". **I could not establish that from Apple's own text**, and I
am saying so rather than repeating it.

PRIMARY, the App Store Review Guidelines
(developer.apple.com/app-store/review/guidelines/, footer "Last Updated:
June 8, 2026"). Guideline 2.5.4 **in full — this is the entire guideline**:

> "2.5.4 Multitasking apps may only use background services for their
> intended purposes: VoIP, audio playback, location, task completion, local
> notifications, etc."

**A case-insensitive grep of the entire guidelines page for "bluetooth"
returns zero matches.** Bluetooth is not named anywhere in the App Store
Review Guidelines. The nearest adjacent rule, PRIMARY, 2.4.2:

> "Design your app to use power efficiently… Apps, including any third-party
> advertisements displayed within them, may not run unrelated background
> processes, such as cryptocurrency mining."

**INFERENCE:** 2.5.4 restricts _use_, not _declaration_, and unlike
guidelines 2.5.3 and 2.5.9 it carries no "will be rejected" clause. Its list
ends in "etc.", so it reads as illustrative rather than exhaustive. An app
that genuinely talks to a Bluetooth rowing monitor and declares
`bluetooth-central` is using a background service for its intended purpose.
**The review risk here is low and I would not let it drive the decision.**
The rule's teeth are aimed at the misuse pattern — declaring `audio` and
playing silence to stay alive — which is a thing we should not do for
several reasons and which §D1d(i)'s second quote suggests would not reliably
work inside a WKWebView anyway.

---

## D4. Does the incumbent plugin support any of this?

**For the background mode: nothing needs to change in the plugin, and that
is the point.** The declaration is an `Info.plist` key
(`app/ios/App/App/Info.plist` has no `UIBackgroundModes` key today —
verified, and re-verified this session). CoreBluetooth keeps delivering to
`DeviceManager`/`Device` because those are `CBCentralManagerDelegate` /
`CBPeripheralDelegate` implementations and the system wakes the app to call
them. The plugin's own README says as much, SECONDARY (a third-party
README): "If the app needs to use Bluetooth while it is in the background,
you also have to add `bluetooth-central` to `UIBackgroundModes`." **It makes
no claim about JavaScript continuing to run** — and neither does any other
vendor document I found.

**So the plugin is not the constraint. The WebView is.** That is a
correction to the shape the brief anticipated: this is not a
fork-or-patch question the way `EnableAutoReconnect` and the restore
identifier were (§3 Q1b, §3 Q5). A fork buys nothing here unless we also
want §D2e's native buffer, which only pays if §D1c's answer is "JS is
frozen" AND we choose the background route anyway.

**One thing the plugin does that a background design would have to reckon
with**, PRIMARY, `@capacitor/ios`'s `CAPPlugin.m:82-94`: `notifyListeners`
with `retainUntilConsumed:NO` — which is what `Plugin.swift:555` passes —
**discards the payload entirely when no listener is registered.** After a
WebContent-process reload (§D2c) the JS listeners are gone while the native
`Device` is still subscribed, so frames arriving in that window are
destroyed, not queued. That is a real hole and it exists today, background
mode or not.

---

## D5. The keep-awake interaction

`@capacitor-community/keep-awake@8.0.1` is installed and its iOS arm is
three lines. PRIMARY,
`node_modules/@capacitor-community/keep-awake/ios/Sources/KeepAwakePlugin/KeepAwakePlugin.swift:21-22`:

```swift
if !UIApplication.shared.isIdleTimerDisabled {
    UIApplication.shared.isIdleTimerDisabled = true
}
```

`isIdleTimerDisabled` suppresses the **auto-lock** timer. It has no bearing
on backgrounding: a phone call, a tapped notification, or a swipe to another
app backgrounds the app with the idle timer disabled exactly as without it.
Our adapter already knows the wake lock is fragile across visibility
changes — `src/adapters/keepAwake.ts:7` — and re-acquires on
`visibilitychange`.

**Does this change the cost/benefit? Yes, decisively, and in the direction
of doing less.** Because the screen stays lit, the app is foregrounded for
the entire normal row. The background window is not a mode the app operates
in; it is an accident with a duration measured in the length of a text
glance or a phone call. A background mode is a permanent architectural
commitment — a reviewed `Info.plist` declaration, a scan path that must
change (§D3b), a battery story, and (if §D1c goes the wrong way) a fork for
native buffering — bought to serve a window the product is otherwise
designed to never enter.

**And here is the asymmetry that decides it.** If JS is frozen (the likely
case), a background mode delivers _nothing at all_ for the interruption
scenario: the link stays up, Swift keeps receiving, and the row still is not
logged, because the thing that logs is asleep. If JS is not frozen, the
interruption scenario is already handled without the mode for as long as the
frames queue (§D2a/§D2b). **The background mode's value is bounded above by
an answer we do not have, and is plausibly zero.** A correct resume path is
valuable under BOTH answers.

---

## D6. The cheaper alternative, taken seriously: make the RESUME correct

The brief asked for this compared on **what the rower ends up with**, not on
elegance. So, the two columns, for the scenario James actually described —
a two-minute phone call at minute 8 of a 20-minute piece.

|                              | Background mode (`bluetooth-central`, JS frozen — the likely case)                      | Do nothing in the background; make resume correct                |
| ---------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| The link                     | Stays up.                                                                               | Stays up too, if iOS holds it — Apple documents no bound, §3 Q3. |
| Frames during the call       | Delivered to Swift, then queued as IPC to a frozen WebView (§D2a).                      | Queued by the system, delivered on resume (§D2b).                |
| The row's numbers on return  | Whatever drains, plus §D2d's silent under-count if anything was dropped.                | Same — identically.                                              |
| If memory pressure hits      | WebContent killed → Capacitor reloads → session lost, up to 30 s of series lost (§D2c). | Identical. The mode does not protect the WebView.                |
| What the rower is TOLD       | Nothing. No gap detection exists.                                                       | "You were away 2:04. The erg's own totals are what we kept."     |
| What the rower must DO       | Unknown — no resume path exists either way.                                             | One tap, and the row continues.                                  |
| New risk surface             | Info.plist declaration, scan path (§D3b), battery, possibly a plugin fork.              | None outside our own JS.                                         |
| Cost if the premise is wrong | Total. Ships a capability that does not work and nobody notices until hardware.         | Small. A resume path is right under every answer to §D1c.        |

**The two columns differ in exactly one row, and it is the row about talking
to the rower.** That is the whole argument. Under James's framing — "don't
lose the row to an accident" — the correct resume delivers most of the value
because the _numbers_ were never the fragile part: the PM5 kept counting the
whole time and republishes its current state (§5b above), so "start watching
again" recovers where the machine IS. What is missing today is not data
recovery. It is that the app has no idea it was ever away.

**What "correct resume" concretely means here**, each anchored:

1. **Know that it happened.** The app has exactly ONE lifecycle listener
   today — `visibilitychange`, inside `src/adapters/keepAwake.ts:46`, for
   the wake lock — and no `@capacitor/app` listener anywhere (grep, this
   session). Capacitor's `App` plugin maps `resume` to
   `UIApplication.willEnterForegroundNotification` on iOS (PRIMARY, its
   README), which is the seam. Cost: a listener.
2. **Measure the gap with something that has a clock.** The diagnostics ring
   deliberately has none — `eventLog.ts:5-13`, "No wall clock: entries are
   ordered by an internal monotonic `seq` counter" — but `MonitorRun.startedAt`
   is an ISO timestamp (`monitorRun.ts:58`, `:391`), so wall-clock elapsed
   is available and can be compared against the machine's own work clock on
   the first frame back.
3. **Tell the recorder, do not let it infer.** §D2d's fold corruption is the
   sharp edge; a resume that hands `seriesRecorder` an explicit
   "discontinuity here" is a small, testable change and it is the difference
   between a gapped row and a wrong one.
4. **Say it in the machine's vocabulary, not ours.** §5c above is binding
   and unchanged: no surface may imply the gap is filled. The honest
   sentence is about **watching** — "we stopped watching for 2:04; the erg
   kept counting" — and the totals shown are the machine's.
5. **Survive the reload case.** If §D2c fires, the app comes back on Today
   with a `SESSION IN PROGRESS` card (`Today.tsx:1257-1266`) pointing at a
   run whose series is up to 30 s stale and whose BLE session is gone. That
   is a reachable, non-destructive path — nothing like deleting the app —
   but nobody has ever walked it, and it should be walked before it is
   trusted.

**The honest cost of this option, stated rather than buried:** it does not
make the app log a background row, and if James's real want turns out to be
"my 20-minute piece survives a 10-minute interruption intact", this does not
deliver it and no amount of resume polish will. His stated want is narrower
than that, which is why this is the recommendation — but it is a product
judgement resting on his sentence, not a technical proof, and he should be
the one to confirm it.

---

## D7. Does BUY reopen? **No — and the pass above's flip condition is narrowed, not triggered**

The pass above wrote: "**If the requirement were 'keep logging while the app
is backgrounded or killed'**, this flips: that need is genuinely served by
state restoration and `bluetooth-central`, the incumbent cannot express
either, and a fork or a Cordova migration would be back on the table."

That sentence was conditioned on a premise this delta has undermined.
**"Backgrounded" is not served by `bluetooth-central` for an app whose
logging lives in a WebView** — the mode keeps the app and the link alive, and
WebKit suspends the WebView anyway on a rule that never looks at the mode
(§D1b). The half of the flip condition that WAS live ("or killed") James has
ruled out. So:

- **`cordova-plugin-ble-central` does not become a candidate.** Its two
  advantages are auto-reconnect (a pending `connect`, which we can reach
  ourselves — §4e) and state restoration (which serves TERMINATED, which is
  out). Neither helps a suspended WebView. The migration cost the pass
  costed at §4c is unchanged and still dominant.
- **A fork of the incumbent does not become necessary.** The background mode
  needs no plugin change at all (§D4). The only fork worth anything here is
  §D2e's native buffer, and it is contingent on an unmeasured answer and on
  choosing the background route.
- **`@capacitor/background-runner` is eliminated on its own documentation**
  (§D1d(ii)): stateless, DOM-less, destroyed after each event. It cannot
  host our accumulator.

**BUY stays closed.** What the delta changes is not the buy/build answer but
where the risk sits: it is no longer "which library reconnects best", it is
"what does our own JavaScript do when the screen goes away", and no vendor
sells that.

---

## D8. Recommendation

**Do not declare `bluetooth-central`. Build the resume path. Measure §D1c
before anyone writes a spec that depends on the answer.**

In order:

1. **Run the §D1e probe first.** One build, two runs (with and without the
   Info.plist key), ninety seconds each. It is cheaper than the paragraph
   arguing about it, and it converts the delta's largest INFERENCE into a
   fact. **Nothing below depends on the outcome**, which is the point — but
   the roadmap's next decision does.
2. **Add the resume seam** — a `@capacitor/app` `resume`/`appStateChange`
   listener and a gap computation from `MonitorRun.startedAt` against the
   machine's work clock. Small, self-contained, valuable under every answer.
3. **Tell `seriesRecorder` about discontinuities explicitly** (§D2d). This
   is the only wrong-NUMBER item in the delta and it is therefore TRIAD work
   under CLAUDE.md's rule: full antagonist pass on its spec, PM gate on its
   PR.
4. **Say what was missed, in the machine's vocabulary** (§D6 item 4, §5c
   above). No wording may imply a gap was filled.
5. **Walk the reload case** (§D2c/§D6 item 5) before trusting it. It is
   reachable today and has never been exercised.
6. **Leave `bluetooth-central` on the shelf with its price tag written
   down**, so a future "background workouts" ask starts from §D3 rather than
   from scratch. If that ask ever comes, the honest answer is not a
   background mode — it is moving the accumulator out of the WebView, which
   is a different and much larger project.

This slots in behind the pass above's sequence (**diagnosability →
detection → recovery**) rather than displacing it. Items 2-4 are recovery;
item 1 is diagnosability by another name.

---

## D9. What I could not establish

Each stated in those words, because each is a place a design could go wrong
quietly.

1. **Whether a `bluetooth-central` process has `RBSProcessTimeLimitationNone`,
   and therefore whether `evaluateJavaScript` wakes the WebContent process
   while backgrounded.** `RBSProcessHandle`/`RBSProcessTimeLimitation` are
   private RunningBoard SPI with no published reference, and Apple publishes
   no mapping from a background mode to a runtime limitation. **This is the
   single fact the whole of §D1 turns on.** §D1e settles it.
2. **How deep or how long iOS's own queue of Bluetooth events for a
   suspended app runs.** Apple states the queue exists and states nothing
   about its bounds (§D2b).
3. **Whether WebKit's unbounded IPC send queue survives a multi-minute
   background window in practice.** Unbounded in source (§D2a) is not the
   same as reliable under memory pressure.
4. **How long a gap actually was, from the app's own record.** The
   diagnostics ring records `seq`, not time (`eventLog.ts:5-13`), by
   deliberate design. Any gap measurement needs a second source; §D6 item 2
   names one.
5. **Whether apps have been rejected for declaring `bluetooth-central`
   without a qualifying use.** Apple's guidelines never mention Bluetooth
   (§D3d). The brief asserts this; I could not source it.
6. **Whether the iOS 26 Live Activity carve-out affects WebKit's process
   throttling.** Apple's paragraph is about Bluetooth privileges and says
   nothing about the WebView; nothing in WebKit's throttler consults it.
   Assume not until measured.

## D10. What would have made me recommend differently

- **If the §D1e probe showed JS running while backgrounded under
  `bluetooth-central`**, the mode would be worth its price: the interruption
  case would be genuinely solved, and §D2d's fold corruption would mostly
  stop mattering because nothing would be missing. **This is the one result
  that flips this delta, and it is one build away.**
- **If James's want had been "a 20-minute piece survives a 10-minute
  interruption"**, none of this delivers it, and the honest answer would be
  to move the accumulator out of the WebView — a much larger project, and
  the point at which `@capacitor/background-runner`'s stateless model or a
  native rewrite would need real evaluation.
- **If the app did not keep the screen awake**, backgrounding would be a
  routine event rather than an accident, and the calculus in §D5 would
  change entirely.
- **If Capacitor recovered a killed WebContent process by restoring state
  rather than reloading** (§D2c), the memory-pressure case would be much
  less severe and the 30-second flush cadence would matter less.

## Appendix — provenance for this delta

**WebKit, fetched as raw source this session** from
`raw.githubusercontent.com/WebKit/WebKit/main/…` and grepped locally
(never summarised by a fetch tool):
`Source/WebKit/UIProcess/ProcessThrottler.cpp`;
`Source/WebKit/UIProcess/WebPageProxy.cpp`;
`Source/WebKit/UIProcess/ios/WKApplicationStateTrackingView.mm`;
`Source/WebKit/UIProcess/ios/PageClientImplIOS.mm`;
`Source/WebKit/UIProcess/ios/WebPageProxyIOS.mm`;
`Source/WebKit/UIProcess/Cocoa/ProcessAssertionCocoa.mm`;
`Source/WebKit/WebProcess/WebProcess.cpp`;
`Source/WebKit/Platform/IPC/Connection.cpp`;
`Source/WebKit/Platform/IPC/cocoa/ConnectionCocoa.mm`;
`Source/WebCore/page/Page.cpp`; `Source/WebCore/page/DOMTimer.{cpp,h}`;
`Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml`.
**Caveat, stated:** this is WebKit trunk today, not the WebKit binary on any
particular iOS release. The mechanism has been stable for years but the line
numbers are trunk's.

**Apple, fetched this session** via the documentation JSON endpoint, the
`.md` rendering, or plain HTML:
`documentation/xcode/configuring-background-execution-modes`;
`documentation/bundleresources/information-property-list/uibackgroundmodes`;
`documentation/corebluetooth` (Overview, incl. the iOS 26 Live Activity
paragraph); `CBCentralManager.scanForPeripherals(withServices:options:)`;
`CBCentralManagerOptionRestoreIdentifierKey`;
`centralManager(_:willRestoreState:)`;
`UIApplication.LaunchOptionsKey.bluetoothCentrals`;
`UIApplication.beginBackgroundTask(withName:expirationHandler:)`;
`UIApplication.backgroundTimeRemaining`;
`documentation/uikit/preparing-your-ui-to-run-in-the-background`;
the archived **Core Bluetooth Programming Guide**, chapter "Performing Tasks
While Your App Is in the Background" (still served as real HTML, HTTP 200,
47,625 bytes, footer "Updated: 2013-09-18"); the **App Store Review
Guidelines** (plain HTML, footer "Last Updated: June 8, 2026"), §2.4.2 and
§2.5.4.

**Apple Developer Forums, labelled SECONDARY** (Apple-staff-badged replies):
threads 64150 (Frameworks Engineer, WKWebView JS when backgrounded) and
764096 (DTS Engineer, audio background mode and suspension).

**Ionic / Capacitor, fetched this session:**
`@capacitor/background-runner` README and its
`ios/Sources/RunnerEngine/Context.swift`; the `@capacitor/app` README;
ionic-team/capacitor issue 3340 (maintainer comment, SECONDARY).

**Read from installed source this session:**
`app/node_modules/@capacitor/ios/Capacitor/Capacitor/{CapacitorBridge.swift,
CAPPlugin.m,WebViewDelegationHandler.swift}`;
`app/node_modules/@capacitor-community/bluetooth-le/ios/Sources/BluetoothLe/{Plugin,Device}.swift`;
`app/node_modules/@capacitor-community/keep-awake@8.0.1/ios/Sources/KeepAwakePlugin/KeepAwakePlugin.swift`;
`app/src/monitor/{driver.ts,seriesRecorder.ts,useMonitorSession.ts,eventLog.ts,monitorRun.ts}`;
`app/src/monitor/transports/capacitorBle.ts`;
`app/src/adapters/keepAwake.ts`; `app/src/today/Today.tsx`;
`app/ios/App/App/Info.plist`.

**In-repo record cited:** `docs/monitor/pm5-interface-notes.md` (§21 items
1/3/7, `:4360-4366`); `ROADMAP.md` § Phase LL; this document's own §3, §4,
§5 and §8.

**Not consulted:** no blog post is cited as evidence anywhere in this delta.
Two forum threads are cited, both labelled SECONDARY at their point of use.
