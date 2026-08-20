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
