# Phase NF — Scan NFC to connect and program a PM5

**Date:** 2026-09-03
**Status:** DRAFT 1 — interaction, architecture, failure contract, and the base
Gate 0 were approved by James in-session on 2026-09-03. The written record and
its supplemental native/failure states are awaiting his review.
**Branch:** `codex/phase-nf-nfc-design`, based on `main@c2182ef5`.
**Risk:** architectural platform-input and radio-concurrency work; no stored
shape, authentication, or server change.
**Design baseline:** `pnpm --dir app test` — 255 files passed, 6,963 tests
passed, 1 skipped.
**Gate 0:**
[`docs/design/handoffs/2026-09-03-phase-nf-scan-nfc/gate0.html`](../../design/handoffs/2026-09-03-phase-nf-scan-nfc/gate0.html).

## What and why

Workout detail already has the complete PM5 programming handoff, but choosing a
monitor still opens a list. A rower standing at one erg should be able to use the
NFC tag built into that PM5 to identify it, then let Ergomatic connect and program
the workout without a Bluetooth picker or a second confirmation.

On an NFC-capable iPhone, workout detail gains a filled muted-green **Scan NFC**
button immediately above the existing filled blue **Connect** button. The two
are equal primary hardware routes. A successful read gives success haptics and a
brief `✓ PM5 found` state, then enters the existing connected interstitial,
connects only to the advertised PM5 name encoded by the tag, and programs the
already-compiled workout. The existing **Connect** path remains unchanged.

This phase is a convenience path, not a new monitor session. NFC identifies a
candidate; the established Bluetooth transport, `useMonitorSession`, PM5 driver,
`armed` acceptance point, connected surface, and logging flow remain authoritative.

## Approved rulings

1. The trigger is explicit. Ergomatic does not listen merely because workout
   detail is open.
2. The label is exactly **Scan NFC**.
3. The button appears only when the native NFC adapter reports supported
   hardware. Unsupported devices, the simulator, and web render no placeholder.
4. It sits directly above **Connect**, uses a muted fern fill, and has the same
   56 px primary geometry and visual weight as **Connect**.
5. After a valid PM5 record, Ergomatic confirms success and automatically
   connects and programs. There is no second app tap.
6. NFC narrows discovery to the tag's advertised PM5 name. It never falls back
   to a general picker or a strongest-signal guess.
7. If that PM5 is not advertising, show:
   `Open Connect Device on this PM5, then try again.`
8. A non-PM5 record shows: `Unsupported NFC tag`.
9. The NFC route uses the same stale/unlogged-session safety authorization as
   **Connect**. It cannot bypass or duplicate that guard.
10. Phase NF ships for the native iOS app only. Android is a future adapter;
    web remains a test harness and never displays the button.

## Does the underlying system have the concept?

Yes, with hardware proof still owed.

- Concept2's PM5 Bluetooth interface definition says a PM5 exposes an NFC-A NDEF
  tag. Its first record is the external type
  `concept2.com:bleconnectinfo`, containing a six-byte BLE address, a one-byte
  address type, and an advertising name of up to 31 bytes. Concept2 states that
  the record is sufficient to establish a BLE connection. The same document
  says the PM5 advertises while on **Connect Device**. Those are real PM5
  concepts, not identifiers invented by Ergomatic.
- iOS Core NFC can read NDEF external-type records in a foreground reader
  session. It cannot silently listen while workout detail is open, and the PM5's
  external record cannot use iOS's URI-only background-tag launch route. A
  user-initiated system scan sheet is therefore the native shape.
- CoreBluetooth gives the app an opaque peripheral identifier, not the BLE
  address in the NFC payload. The hardware address is ignored on iOS. The bridge
  from NFC to CoreBluetooth is the PM5 advertising name.
- `@capacitor-community/bluetooth-le@8.3.0` exposes a non-picker
  `requestLEScan` callback whose `localName` comes from the current advertisement
  packet. That is the field to compare. Its `device.name` and native
  `CBPeripheral.name` can be cached and are not identity evidence.

The load-bearing owed fact is exact string identity on James's actual PM5: the
ASCII name decoded from the complete NFC record must equal the same unit's live
CoreBluetooth `localName`.
The checked-in Flipper capture does not prove this. It stops after the NDEF
header; it proves compatible TNF/type-length/payload-length fields, not the
literal type or payload bytes.

## Gate -1 — real hardware truth before product implementation

No product UI or connection behavior is implemented until a disposable native
probe on a real iPhone and PM5 proves all of the following:

1. `@capgo/capacitor-nfc@8.2.5`, using `iosSessionType: "ndef"`, receives the
   PM5 record as raw `tnf`, `type`, and `payload` byte arrays.
2. The observed record has TNF `0x04` and literal type bytes decoding exactly to
   `concept2.com:bleconnectinfo`.
3. The payload's actual padding/termination rule is recorded. The Concept2 table
   describes the three fields but does not explain the partial capture's
   40-byte payload, so implementation must not guess where the variable-length
   name ends.
4. On three fresh NFC/BLE attempts, the ASCII-decoded advertising name equals
   the live `ScanResult.localName` string from that same PM5 exactly. The BLE
   plugin exposes no raw advertising-name bytes, so this gate does not claim a
   byte comparison across that seam.
5. `requestLEScan` discovers the PM5 with no device sheet and its returned
   `deviceId` connects successfully.
6. A signed device build starts a reader session with the NFC Tag Reading
   capability, nonempty `NFCReaderUsageDescription`, and generated
   `com.apple.developer.nfc.readersession.formats` entitlement present in the
   built app.
7. On-device receipts distinguish user cancellation, the system no-tag timeout,
   and a forced generic invalidation. If the released plugin collapses those
   native endings, the product copy collapses with it rather than guessing.

The proof receipt records the iPhone model and iOS version, PM5 model and
firmware, UTC timestamp, captured record bytes, decoded name, live `localName`,
and observed time from BLE scan start to first matching advertisement for each
of the three attempts. It adds a complete, redacted native-shaped capture beside
`docs/monitor/nfc/pm5-tag-2026-08-31-partial.nfc` and corrects that README's
current overclaim that the partial file proves the literal type. Redaction may
zero the six address bytes, but must preserve record framing, address type,
padding, and advertising-name bytes so the parser fixture stays faithful.

Failure of claims 1–6 is NO-GO for this architecture. Failure of claim 7 forces
one honest reader-ended state and copy rather than inferred distinctions. Do not
replace exact matching with RSSI, a `PM5` prefix, a cached name, or the NFC MAC
address. Return to design.

## Product scope

### In

- Native iOS capability probe and conditional workout-detail action.
- Foreground NDEF scan of one tag per attempt.
- Strict PM5 record parsing into an ephemeral advertising-name target.
- Success haptic/check state followed immediately by the existing connected
  interstitial.
- Picker-free exact-name BLE discovery, including an already-connected-device
  check.
- Existing safety guard, programming, `armed` acceptance, retry, cancellation,
  connected surface, and log flow.
- Redacted instrumentation and a replayable native-shaped NFC fixture.
- iOS entitlement, usage description, dependency, project, signing, and release
  verification.

### Out

- Background NFC reading or launching Ergomatic with the app closed.
- Android NFC/AAR handling.
- Web NFC.
- Pairing a PM5 that is not on **Connect Device**.
- Using the six-byte BLE address on iOS.
- Trusting NFC as authentication. A copied/spoofed tag or an unobserved
  duplicate advertised name can misdirect this convenience lookup.
- Persisting tag identifiers, raw payloads, BLE addresses, or a preferred PM5.
- Replacing the manual **Connect** picker.
- Automatically putting the PM5 into advertising mode.
- General NFC actions, workout selection from a tag, or starting a phone-timer
  session.
- Any PM5 driver, CSAFE, workout compilation, monitor-run, or log schema change.

## Gate 0 — interaction and visual contract

### Placement and hierarchy

Workout detail's action stack becomes:

1. **Scan NFC** — 56 px, filled `--action-nfc` fern.
2. **Connect** — the existing 56 px `--action-connect` blue.
3. **Start Timer** — existing L2.
4. **Log it after** — existing L2.
5. Existing owner actions.

The user selected the two-equal-routes option. This deliberately supersedes the
current source comments and design assertion that **Connect** is the screen's
single primary (`ConnectAction.tsx:28-35`, `WorkoutDetail.tsx:468-475`, and
`e2e/design.spec.ts`'s primary-action check). Implementation creates a
screen-specific `.button-nfc`, not a stray `.button-l1`, and amends the design
test and design reference in the same PR.

The NFC-absent layout is exactly today's layout: no disabled button, empty gap,
caption, or reserved height. During the initial async capability state it is
also absent. Capability may be cached for the app process after first resolution;
it is never persisted.

### Tokens and accessibility

| Use                       | Token/value                   |                Measured contrast |
| ------------------------- | ----------------------------- | -------------------------------: |
| NFC rest fill             | `--action-nfc: #49624f`       | cream text `#fffdf7`: **6.57:1** |
| NFC boundary against page | `#49624f` / `#f4f1e8`         |                       **5.92:1** |
| NFC pressed fill          | `--action-nfc-hover: #3f5545` |           cream text: **7.95:1** |
| Existing Connect fill     | `#2a6275`                     |           cream text: **6.65:1** |
| Existing secondary        | ink / surface                 |                      **17.11:1** |
| Inline message            | ink / sunken                  |                      **14.50:1** |
| Failure marker            | accent / sunken               |                       **5.03:1** |
| iOS-sheet sample text     | `#111111` / `#f2f2f7`         |                      **16.92:1** |
| iOS-sheet sample glyph    | fern / white                  |                       **6.68:1** |

Both hardware buttons retain the 56 px control height, exceeding the 44 px
target floor. Text and filled boundaries clear WCAG AA. Focus treatment follows
the existing screen-level control rule and must remain visible against both
fills.

The accepted portrait cost is 68 px: 56 px control plus the stack's 12 px gap.
On a 390×844 personal-workout detail, **Delete workout** moves below the initial
fold and remains reachable by normal vertical scroll. The workout and all happy
paths remain in the first viewport. Landscape keeps today's centered, scrolling
document column; Phase NF does not invent a landscape reflow.

### User-visible states and copy

| State                     | Surface                     | Copy/behavior                                                      |
| ------------------------- | --------------------------- | ------------------------------------------------------------------ |
| ready                     | workout detail              | `Scan NFC`                                                         |
| system scan               | iOS NFC sheet               | `Hold your iPhone near the PM5.`                                   |
| accepted                  | NFC button position         | `✓ PM5 found`; success haptic; no intentional delay                |
| wrong/malformed record    | workout detail inline error | `Unsupported NFC tag`                                              |
| user cancelled sheet      | workout detail              | quiet return; no error                                             |
| system reader timeout     | workout detail inline error | `No NFC tag detected. Try again.`                                  |
| reader invalidated        | workout detail inline error | `NFC scan stopped. Try again.`                                     |
| target not advertising    | connected failure card      | approved copy; exact-target **Try again** or **Cancel**            |
| exact target already held | connected failure card      | `A PM5 is already connected. Use Connect.`; no targeted retry      |
| duplicate exact targets   | connected failure card      | `More than one PM5 has this name. Use Connect.`; no targeted retry |
| Bluetooth/program failure | connected flow              | existing mapped copy and actions                                   |

`NFCReaderUsageDescription` is:
`Scan a PM5 to connect and program your workout.`

The approved not-advertising copy remains
`Open Connect Device on this PM5, then try again.` The new targeted error
reasons suppress the existing generic `End whatever is showing...` sentence.
For an already-held or ambiguous target, **Cancel** returns to workout detail,
where the unchanged manual **Connect** action is available; those cards do not
offer a targeted **Try again** that cannot safely resolve the identity conflict.

The success haptic is best-effort. `@capacitor/haptics` failure must not delay or
fail Bluetooth discovery; the visual state remains the confirmation.

## Architecture

### 1. One platform adapter owns NFC

Add an adapter port with no React, workout, PM5-driver, or persistence knowledge:

```ts
type NfcCapability = "supported" | "unsupported";

interface NfcRecord {
  tnf: number;
  type: readonly number[];
  payload: readonly number[];
}

interface NfcReader {
  capability(): Promise<NfcCapability>;
  readOne(options: {
    alertMessage: string;
    signal: AbortSignal;
  }): Promise<readonly NfcRecord[]>;
}
```

The production adapter dynamically imports `@capgo/capacitor-nfc` only on iOS.
Web and simulator resolve `unsupported`; no production web bundle imports native
NFC code. Tests inject a scripted reader that replays native-shaped records and
session endings.

The adapter installs `nfcEvent` and `nfcSessionEnd` listeners before calling
`startScanning`. It uses `iosSessionType: "ndef"` and
`invalidateAfterFirstRead: false` deliberately. The plugin implements Core NFC's
optional read-write delegate route; in the inspected 8.2.5 source a successful
read does not reliably auto-invalidate. Ergomatic explicitly stops every session.

`startScanning()` resolves when the reader is requested, not when Core NFC is
active. `stopScanning()` resolves before the native invalidation callback. A
module-level session owner serializes start/stop and drains the matching
`nfcSessionEnd` before another attempt begins. The attempt token, not plugin
callback order, decides which completion is current.

### 2. A strict parser produces the only cross-radio value

The parser is pure domain code over integer arrays. It:

1. requires the captured PM5 record structure established by Gate -1;
2. requires external TNF `0x04`;
3. requires exact ASCII type `concept2.com:bleconnectinfo`;
4. validates the captured payload length/padding rule;
5. ignores the six-byte address and address-type value after structural
   validation;
6. decodes the advertising name with the capture-proven termination rule;
7. requires a nonempty `PM5 ` advertising name within Concept2's 31-byte limit;
8. rejects duplicates, malformed UTF-8/ASCII, embedded control characters,
   truncation, and extra ambiguous matching records.

It returns only:

```ts
interface Pm5NfcTarget {
  advertisingName: string;
}
```

No raw record, tag UID, address, address type, or payload crosses into workout or
session state.

### 3. One connection-entry owner shares the safety lock

`ConnectAction` currently owns both the button and the replacement authorization
(`ConnectAction.tsx:112-201`). Duplicating it for NFC would create two local
stages and two independently staged retire receipts. Phase NF extracts or
generalizes that ownership so the hardware-entry group has exactly one guard and
one pending intent:

```ts
type ConnectionEntryIntent = { kind: "manual" } | { kind: "nfc" };
```

A press stages the existing `connectGuardStage` authorization before opening
either native sheet. If confirmation is required, the panel replaces the
hardware-entry group and retains which intent is pending. **Cancel** discards the
staged retire receipt and returns both buttons. **Connect anyway** resumes the
same intent. Execution of retirement remains downstream at the existing wire
`armed` event; Phase NF does not move that acceptance point.

Only one entry attempt may exist. Starting NFC disables both hardware buttons.
Manual Connect cannot begin until NFC has settled and drained; NFC cannot begin
while the connected interstitial owns a monitor attempt.

### 4. Workout detail resolves NFC before the existing handoff

For manual intent, `handleConnectProceed` keeps today's behavior.

For NFC intent:

1. run the shared safety authorization;
2. start the NFC reader;
3. on one record event, claim the attempt and explicitly close the reader;
4. parse the PM5 target or show `Unsupported NFC tag` and remain on detail;
5. fire best-effort success haptics and render `✓ PM5 found`;
6. compile the same nudged workout, phases, identity, baselines, and log seed as
   today's `handleConnectProceed` (`WorkoutDetail.tsx:224-277`);
7. add the ephemeral discovery request to the in-memory `connecting` handoff;
8. render the existing `ConnectedInterstitial`.

The success visual adds no timer or artificial delay. It remains visible only
for the bridge work before the interstitial render.

```ts
type MonitorDiscoveryRequest =
  { kind: "picker" } | { kind: "advertised-name"; exactName: string };
```

`ConnectedInterstitial` passes this request to `session.connect(request)` on its
existing mount-once effect (`ConnectedInterstitial.tsx:300-327`). Retry preserves
the same request. A targeted failure retries the same exact name; it never opens
the picker and does not require a second NFC read.

### 5. Transport gains targeted discovery without PM5 logic above it

Extend `Transport.scan()` with options carrying both discovery intent and
cancellation rather than adding a Capacitor type check inside
`useMonitorSession`:

```ts
interface MonitorScanOptions {
  discovery?: MonitorDiscoveryRequest;
  signal?: AbortSignal;
}

interface Transport {
  scan(options?: MonitorScanOptions): Promise<DiscoveredMonitor[]>;
  // existing connect/write/subscribe/disconnect/onDisconnect unchanged
}
```

`undefined` and `{ discovery: { kind: "picker" } }` preserve every current
caller and adapter. Fake/replay transports accept the options, record discovery,
and honor abort. Web never produces the targeted request in production. Existing
manual picker behavior remains unchanged; the new signal is load-bearing for
the nonmodal targeted scan.

The Capacitor adapter's targeted branch is:

1. initialize once, preserving today's order;
2. query
   `getConnectedDevices([ROWING_SERVICE_UUID, CONTROL_SERVICE_UUID])` because
   the plugin drops already-connected peripherals from scan callbacks;
3. never select a held device from cached `device.name`; if any held device's
   available name equals `exactName`, fail closed with
   `TargetAlreadyConnectedError` and direct the rower to manual **Connect**;
4. verify Bluetooth is enabled;
5. start `requestLEScan` with no device-list mode, name filter, or PM5 service
   filter;
6. compare only `ScanResult.localName === exactName`, deduplicating repeat
   callbacks by opaque `deviceId`;
7. wait up to the targeted deadline for the first live match, then keep scanning
   for a one-second, test-injected collision window;
8. one unique live match wins, while any second distinct device with the same
   exact name fails closed with `TargetMonitorAmbiguousError`;
9. await `stopLEScan()` before returning the sole match's opaque
   `device.deviceId` or reporting ambiguity;
10. on the targeted timeout, await `stopLEScan()` and throw a named
    `TargetMonitorNotAdvertisingError` mapped to the approved copy;
11. on `signal.abort`, claim that terminal path, await `stopLEScan()`, and reject
    with `AbortError` only after the native scan is stopped.

Do not pass `{ name: exactName }`: the inspected iOS plugin filters
`CBPeripheral.name`, which may be cached. Do not pass the rowing/control service
UUIDs: the existing adapter already records that 0x0030 is not advertised
(`capacitorBle.ts:429-489`), and CoreBluetooth combines filters. Scan broadly at
the native radio seam, expose nothing broadly to the user, and settle only on the
exact live advertisement name.

Use a 10-second targeted BLE deadline and one-second post-match collision
window, both injected in tests. `requestLEScan` has no native timeout. Gate -1
records real scan latency; it may lengthen either policy before implementation,
but may not remove collision detection. Every settle path awaits
`stopLEScan()` before connect/retry/abort resolution so BleClient's serialized
queue cannot carry a stale scan into the next operation.

The Capacitor adapter also owns a module-level scan-drain barrier shared by
targeted scans and today's manual picker scan. A scan installs its drain promise
before its first native radio call. Abort begins `stopLEScan`; the promise
settles only after that stop completes. Every later `scan()` first awaits the
prior drain. This ownership survives interstitial unmount and a fresh hook or
transport instance, so fire-and-forget navigation cannot overlap an old
targeted scan with a new manual picker.

Map the three target failures to explicit connected-error reasons:
`target-not-advertising`, `target-already-connected`, and `target-ambiguous`.
They are lookup failures, not machine refusals, and never inherit the existing
generic instruction to end what is showing on the PM5. Only
`target-not-advertising` enables the existing retry control; the other two keep
**Cancel** as the route back to the manual **Connect** action.

### 6. Existing monitor-session authority remains unchanged

`useMonitorSession.connect` already rejects re-entry, allocates an attempt token,
checks supersession across awaits, and owns the driver (`useMonitorSession.ts:
4323-4549`). `program` synchronously enters programming to suppress duplicates,
and `cancel`/unmount invalidate the attempt (`useMonitorSession.ts:3840-3867,
4886-4939, 5117-5222`). Phase NF adds a per-attempt `AbortController` owned by
the hook: it is stored before awaiting `transport.scan`, passed in
`MonitorScanOptions`, and aborted synchronously at the start of Cancel, unmount,
or supersession. The UI may navigate immediately; the adapter-level drain
barrier blocks the next native scan until cleanup completes. Phase NF passes the
discovery request through those existing gates; it does not create a parallel
driver path.

The established sequence remains:

```text
detail authorization
  → NFC target (NFC route only)
  → compile + in-memory handoff
  → interstitial
  → session.connect(discovery request)
  → transport scan + connect
  → session.program
  → driver verifies armed
  → existing ready/live/ended flow
```

Nothing creates or retires a `MonitorRun` before the existing `armed` acceptance
point. Nothing changes first-rowing-frame run creation or terminal logging.

## State and lifetime ledger

| State                      | Owner                              | Begins                                    | Ends                                                      | Persisted?             |
| -------------------------- | ---------------------------------- | ----------------------------------------- | --------------------------------------------------------- | ---------------------- |
| NFC capability             | NFC adapter cache                  | first probe                               | app process ends                                          | no                     |
| pending entry intent       | shared detail guard                | hardware-button press                     | cancel or authorized continuation                         | no                     |
| staged retire receipt      | existing handoff store             | safety check                              | existing armed/cancel rules                               | existing behavior only |
| NFC reader owner/token     | NFC adapter                        | authorized NFC start                      | read, cancel, timeout, invalidation, abort                | no                     |
| raw NDEF records           | parser call                        | one native event                          | parse returns/throws                                      | no                     |
| `Pm5NfcTarget`             | detail attempt                     | successful parse                          | targeted discovery settles or detail unmounts             | no                     |
| success check/haptic       | detail render                      | target accepted                           | interstitial replaces detail                              | no                     |
| discovery request          | connecting handoff/session attempt | compile succeeds                          | connect attempt/cancel/unmount                            | no                     |
| scan abort controller      | monitor-session attempt            | before `transport.scan`                   | scan settle/cancel/unmount/supersession                   | no                     |
| targeted BLE scan          | Capacitor transport                | interstitial connect                      | held conflict, live match, timeout, error, cancel/unmount | no                     |
| native scan drain          | Capacitor adapter module           | before first native scan call             | matching stop/settle barrier completes                    | no                     |
| monitor session/driver/run | existing owners                    | existing connect/armed/first-frame points | existing cancel/terminal rules                            | unchanged              |

## Failure and concurrency contract

- One attempt token owns the chain from NFC start through interstitial handoff.
  Any callback carrying an older token is ignored after performing only its own
  idempotent cleanup.
- The first terminal NFC outcome wins: record, user cancel, timeout,
  invalidation, abort, or start rejection. Duplicate plugin events cannot parse,
  connect, or report twice.
- A record event closes/drains Core NFC before starting BLE. BLE stops before
  connect. These radios do not overlap after the tag read.
- Detail unmount aborts the reader, removes every listener, and prevents a late
  event from mounting the interstitial.
- Interstitial cancel and unmount use the existing session attempt invalidation
  and synchronously abort the targeted scan. A new manual/NFC native scan awaits
  that scan's module-level `stopLEScan()` drain even after the old hook unmounts.
- Haptic rejection is swallowed after instrumentation. It cannot become a
  connection failure.
- Invalid tags never reach Bluetooth. Target timeouts never degrade to manual
  discovery. Programming failures never return to NFC.
- No held device is auto-selected from cached `device.name`. A held exact-name
  conflict directs the rower to manual **Connect**; a different held PM5 does
  not win merely because it is already connected.
- Zero exact matches time out; more than one distinct exact match fails closed.
  Neither outcome may choose a device by arrival order or signal strength.
- `Try again` after target-not-advertising reuses the in-memory exact target. The
  target disappears when the rower cancels back to detail.
- Bluetooth permission/off failures and programming/link failures retain their
  current named classification and recovery behavior.

## Instrumentation and replay

This is a new platform input above the current transport recorder. Without a new
seam, every browser/e2e/replay gate would replace the code most likely to be
wrong. Phase NF adds both:

1. **Scripted NFC reader.** Unit/integration tests feed native-shaped record and
   session-end events through the production parser and detail coordinator. The
   Gate -1 capture becomes the canonical valid fixture.
2. **Redacted pre-connect trace.** Record timestamps and outcome kinds only:
   capability result, session requested, tag event, parser accepted/rejected,
   reader settled, held-device conflict checked, BLE scan started/matched/timed
   out, abort requested, scan drain settled, and handoff accepted. Never record
   tag UID, BLE address, raw payload, or arbitrary scanned device names. The
   accepted PM5 display name may join the existing connection log only once it
   is the chosen device.

The producer-to-consumer seam test must replay the canonical native-shaped NDEF
fixture through:

```text
Capacitor-shaped NFC event
  → NfcReader
  → PM5 record parser
  → exact-name discovery request
  → fake Transport.scan({ discovery, signal })
  → useMonitorSession.connect
  → driver program
  → armed
```

That test is distinct from parser unit tests and from a mocked native plugin call
test. It proves the value reaches the established consumer.

## Validation contract

### Automated

- Parser table: canonical capture, wrong TNF, wrong type, missing record,
  duplicate record, truncated address/type/name, capture-proven bad padding,
  empty/overlong/control-character/non-PM5 name, malformed bytes.
- NFC adapter: listener-before-start ordering, start rejection, record success,
  user cancellation, system timeout, generic invalidation, abort, duplicate
  event, late event after abort, explicit stop, shutdown drain, and a new start
  blocked until the prior session ends.
- Capability: supported renders **Scan NFC** above **Connect**; unknown,
  unsupported, web, and simulator do not render it.
- Shared guard: manual and NFC stage the identical warnings/receipt; cancel
  clears it; confirm resumes the correct pending intent; rapid cross-button
  presses produce one attempt.
- Targeted transport: exact-name held-device conflict, nonmatching held device,
  unfiltered requestLEScan, `localName` match, deliberate nonselection from
  cached `device.name`, missing `localName`, duplicate callback deduplication,
  two distinct exact-name devices, target timeout, abort-before-match,
  abort-after-match, stop-before-connect, cleanup on every settle path, and a
  new targeted/manual scan blocked until the prior abort drain resolves.
- Handoff: NFC target survives detail → interstitial → retry; manual has no
  target and still opens the existing picker.
- Session: NFC path connects once, programs once, accepts `armed` once, preserves
  staged-retire timing, and tears down on navigation/cancel/program failure.
- UI: approved copy, order, 56 px geometry, fern token, contrast, absent-layout
  parity, portrait scroll, and landscape action region.
- Bundle/config: web production bundle excludes NFC/Haptics native code; built
  iOS app contains the usage description and signed NFC entitlement.

### Self-mutation

At minimum, temporarily mutate each load-bearing seam and prove a named test
fails:

1. accept a nonmatching record type;
2. use `device.name` instead of `localName`;
3. remove exact equality or allow prefix matching;
4. remove NFC stop/drain;
5. remove BLE stop on timeout;
6. remove the shared single-flight guard;
7. drop the discovery request at detail/interstitial/session handoff;
8. move staged retirement before `armed`;
9. render the button while capability is unknown/unsupported.
10. connect immediately to the first exact-name result without checking for a
    second distinct match.
11. auto-select an exact-name held device from cached `device.name`.
12. drop or ignore the targeted scan's abort signal on Cancel/unmount.
13. let a new manual or targeted scan bypass the prior scan-drain barrier.

Commit before probes and revert each mutation immediately afterward. The final
tree must be clean.

### Native hardware walk

After automated gates, a real iPhone and PM5 walk proves:

1. button absent in web/simulator and present in the signed NFC-capable build;
2. valid tag → success haptic/check → no Bluetooth picker → correct PM5 name;
3. PM5 on **Connect Device** → connect, program, verified `armed`, first pull,
   terminal logging;
4. PM5 not advertising → approved targeted message, no general picker; opening
   **Connect Device** then **Try again** connects without another NFC read;
5. unsupported tag → approved inline copy and no BLE scan;
6. NFC sheet cancel and 60-second system timeout return safely;
7. rapid scan/cancel/retry and NFC/manual alternation never create two sessions;
8. an already-held exact-name PM5 fails closed to manual **Connect**; a different
   held PM5 does not win, and two live exact-name matches fail closed;
9. background/foreground and navigation during NFC and targeted BLE leave no
   sheet, scan, listener, or late interstitial;
10. manual **Connect** still opens its current picker and completes the same
    workout.

Keep the redacted NFC capture and connection log under `docs/monitor/sessions/`
or `docs/monitor/nfc/` per the hardware-walk contract. Teardown the per-worktree
stack after the walk.

## Scheduling gate

This design fires Phase NF's trigger; it does not silently reorder the roadmap.
The existing roadmap places this polish behind the front-door Wave A work.
Product implementation begins only after James explicitly schedules NF. That
ruling may place it ahead of Wave A or keep it behind Wave A; Wave A clearing
does not itself grant authority. Written-spec approval is not that scheduling
decision.

## Phase/PR shape

### Proof task — disposable, before feature commits

Run Gate -1 in the feature worktree. The probe may temporarily install/configure
the dependency and expose diagnostics, but the probe UI is not product code. Its
durable output is the redacted capture, the corrected NFC README, and the stated
GO/NO-GO result. Delete disposable code before beginning the product PR.

### One atomic product PR

After Gate -1 is green, one product PR owns the complete rower outcome:

- locked NFC and Haptics dependencies;
- iOS capability, usage description, entitlement/signing configuration;
- NFC adapter, strict parser, scripted/replay fixture, and instrumentation;
- optional target-aware `Transport.scan` request;
- Capacitor held-device conflict + picker-free exact-`localName` scan;
- fake/replay/web parity and unit/self-mutation proof;
- shared connection-entry guard/intent;
- conditional **Scan NFC** action and tokens;
- success/error/haptic states;
- target handoff through interstitial/session and targeted retry;
- design reference, browser/e2e, screenshots, bundle assertions; and
- the full native hardware walk.

Exit: all ten walk legs and the normal lint/typecheck/format/unit/client/e2e/
screenshot gates pass twice on the merged-with-main worktree. The PR remains
open until James explicitly approves merge.

Native configuration without its consumer is not a complete rower outcome and
creates provisioning surface prematurely. Review-size pressure may be handled
with internal commits, but not stacked product PRs: configuration, radio seams,
UI, and the working rower outcome are reviewed and released in one PR.

### Release and provisioning

Ship in the next available minor release; do not reserve a version during
design. Before merge, verify the Near Field Communication Tag Reading
capability on the App ID and Xcode target, the nonempty usage description, the
regenerated provisioning profile, and the signed archive's effective
`com.apple.developer.nfc.readersession.formats = [TAG]` entitlement. After
merge, send the release candidate through TestFlight and exercise it before
release.

The main checkout already contains user-owned edits to `Info.plist` and the
Xcode project. Feature implementation remains isolated and reconciles those
files explicitly; it never overwrites or reverts them.

## Countable phase exits

Phase NF closes only when:

1. Gate -1 claims 1–6 are green on real hardware; claim 7 is either green or
   produces one explicitly approved collapsed reader-ended state and copy.
2. The approved Gate 0 artifact and copy match the shipped UI in portrait and
   landscape.
3. Supported iPhones show **Scan NFC**; every unsupported surface shows no trace
   of it.
4. One valid PM5 scan reaches the same existing `armed`/ready/live/log path with
   no Bluetooth picker and no second app confirmation.
5. Unsupported tags and nonadvertising PM5s produce the approved, distinct copy
   and no untargeted connection.
6. Manual **Connect** is behaviorally unchanged.
7. NFC and BLE scanners/listeners are absent after every terminal path proven
   by automated tests and the hardware walk.
8. The native-shaped producer-to-consumer replay and all thirteen mutation
   probes bite.
9. iOS archive, entitlement inspection, signed-device install, complete
   project gates ×2, and the ten-leg hardware walk are green.
10. The one product PR receives explicit merge approval; no agent merges or
    tears down a live worktree early.
11. James has explicitly scheduled NF, either ahead of or behind Wave A.

## Rejected approaches

- **Listen whenever detail opens.** Core NFC requires a foreground session and
  system sheet; unsolicited presentation is noisy and not the user-approved
  trigger.
- **Call `requestDevice({ name })` after NFC.** It still presents a second device
  UI and violates automatic connection.
- **Use `requestLEScan({ name })`.** The plugin filters cached
  `CBPeripheral.name`, not the live advertisement field.
- **Use the NFC BLE address.** CoreBluetooth does not expose a comparable MAC on
  iOS.
- **Choose nearest/strongest or any `PM5` prefix.** A gym can contain many PM5s;
  this can program the wrong machine.
- **Fallback to the picker on timeout.** It silently changes an exact-target
  request into a different-device request and contradicts the approved recovery.
- **Build a new native BLE bridge.** The installed plugin already exposes the
  non-picker scan and opaque connect identifier needed.
- **Use raw `NFCTagReaderSession`.** The PM5 is NDEF-formatted and the plugin's
  NDEF session exposes the raw external record fields. Raw tag access adds
  entitlement and polling complexity without product value.

## Residuals accepted for review

- Advertising-name equality is deterministic targeting, not authentication. A
  cloned tag or one spoofed advertiser can still misdirect the lookup. Multiple
  concurrently observed exact-name devices fail closed, but absence from the
  finite collision window is not proof of uniqueness.
- If a PM5 firmware version encodes or advertises its name differently, exact
  matching fails closed with the Connect Device instruction. It never guesses.
- NFC capability probing reports device support, not valid code signing. Archive
  and device gates remain necessary.
- The 10-second targeted deadline and one-second collision window are Ergomatic
  policies, not platform facts. Hardware evidence may lengthen them before
  implementation; changing fallback or identity rules requires a design delta.
- **Delete workout** moving below the initial portrait fold was visible in Gate
  0 and accepted. No compensating layout compression ships in this phase.

## Primary sources and inspected implementation

- Concept2, _PM5 Bluetooth Smart Communications Interface Definition_, rev 1.30,
  pp. 6 and 35:
  <https://www.concept2.nl/files/pdf/us/monitors/PM5_BluetoothSmartInterfaceDefinition.pdf>
- Apple, _Building an NFC Tag-Reader App_:
  <https://developer.apple.com/documentation/corenfc/building-an-nfc-tag-reader-app>
- Apple, NFC Human Interface Guidelines:
  <https://developer.apple.com/design/human-interface-guidelines/nfc>
- Apple, NFC reader-session formats entitlement:
  <https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.nfc.readersession.formats>
- Apple, background tag reading (URI-record constraint):
  <https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading>
- Capgo NFC 8.2.5 source, pinned inspected revision:
  <https://github.com/Cap-go/capacitor-nfc/blob/b9e1d8f8132abbf7f795b27c8c9f8c13ad585d71/ios/Sources/NfcPlugin/NfcPlugin.swift>
- Capacitor Community Bluetooth LE 8.3.0 iOS source, pinned inspected revision:
  <https://github.com/capacitor-community/bluetooth-le/blob/13f2bac3ac0c89a7fe8f8f74afdf69279b408e17/ios/Sources/BluetoothLe/Plugin.swift>
- Installed local sources at design time:
  `app/node_modules/@capacitor-community/bluetooth-le/ios/Sources/BluetoothLe/`
  and an isolated `npm pack @capgo/capacitor-nfc@8.2.5` probe.

One secondary clarification is recorded rather than promoted to platform law:
an Apple engineer states that the old `NDEF` entitlement value has been replaced
by `TAG` and can fail distribution validation:
<https://developer.apple.com/forums/thread/781403>. The implementation plan must
recheck this against the installed SDK, generated entitlements, and signed
archive rather than trusting forum prose alone.

## Next gate

James reviews this written record, including the supplemental iOS-sheet/failure
states and the atomic-PR correction. After approval: run the repository's
two-pass hardening skill, present any material delta, then write the
implementation plan. Scheduling remains a separate explicit ruling. No app
implementation starts from this draft.
