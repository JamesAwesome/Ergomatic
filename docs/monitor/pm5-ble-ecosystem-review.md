# PM5 BLE ecosystem review (2026-08-11)

> **RECONCILED 2026-08-21** by a second, adversarial pass that judged our
> connected state against a new standard: whether our rows would reconcile
> with the **Concept2 Online Logbook**. That pass amended cross-check rows
> d, e and g, added rows h-k, and roughly doubled the survey ledger. Its
> findings are scoped as work in ROADMAP **Phase RC** and as spec inputs to
> **Phase LL**; the full report's reasoning lives in the
> `antagonist-ledger.md` entry of the same date. Where this document and a
> committed capture disagree, the capture wins.

A survey of open-source PM5/Concept2 BLE implementations, compared against
this project's hardware-proven build (the comparison spine is
`pm5-interface-notes.md` §20-§22; the code baseline is
`app/src/monitor/driver.ts`, `app/src/monitor/transports/capacitorBle.ts`,
`app/src/monitor/transports/webBluetooth.ts`, and `app/domain/monitor/pm5/`).
Written for one question: what did the ecosystem already know that validates
or refutes our field findings, and what should we adopt or deliberately not
adopt. §19.10 already tallied the CSAFE status-byte handling across OSS;
this review does not re-litigate that and goes to the BLE/mobile layer
instead.

Evidence discipline: every claim about another project's behavior links a
file or doc section checked live on 2026-08-11. Anything not verified
against a live URL is marked UNVERIFIED.

## 0. Our baseline, restated in one paragraph

Discovery filters on the name prefix `PM5` with no service filter (0x0030 is
not advertised, §20 item 21; `capacitorBle.ts:326-335`). The driver
subscribes the FIVE individual status characteristics — 0x0031, 0x0032,
0x0033, 0x0037, 0x0038 (`driver.ts:1999-2236`) — never the multiplexed
0x0080, plus the CSAFE transmit characteristic 0x0022 with a
drain-until-null reassembler (`driver.ts:1261-1270`). Sample rate 0x0034 is
written once at driver construction to `0x03` = 100 ms, fire-and-forget
(`driver.ts:1256`, `commands.ts:94`). Programming is a three-phase
`program()` — terminate-shaped prepare, conditional prepare-settle, ack-gated
multi-frame CSAFE send, then verification against the machine's own reported
`armed` state AND a structural readback of 0x0031's workoutType/duration
fields (driver header, §19.13). End-of-workout: the final interval's
0x0037/0x0038 arrive LATER than one status tick after `finished` and inside
3 s, so the driver holds a 3000 ms wall-clock finish grace
(`FINISH_GRACE_MS`, `driver.ts:736`; §22 item 5) and the app holds its
hand-off on the same clock. iOS transport multiplexes the plugin's
one-listener-per-characteristic behavior behind a fan-out registry
(`capacitorBle.ts:381-439`; §21 item 1). Writes: acked on iOS
(`BleClient.write`), without-response on web (`webBluetooth.ts:253-260`,
flagged as an untested assumption, §17 item 10).

## 1. Per-project profiles

### 1.1 ErgometerJS (tijmenvangulik) — the TypeScript reference

**What it is:** the long-standing JS/TS Concept2 driver, BLE + USB, with
pluggable BLE backends (Web Bluetooth, cordova-plugin-ble-central, Bleat,
SimpleBLE). <https://github.com/tijmenvangulik/ErgometerJS>
**Maturity:** alive but sparse — last substantive commits 2026-03-22/23;
126 stars, 0 open issues; Apache 2.0 (LICENSE.txt mixes in MIT notices for
bundled deps). PM5 BLE logic in
`api/typescript/ergometer/performancemonitorBle.ts` (1528 lines), CSAFE
engine in `performancemonitorBase.ts`, commands in
`csafe/proprietary_program_commands.ts`.

What they do differently, verified live 2026-08-11:

- **Multiplexed 0x0080 is a manual opt-in, not the default.** Individual
  characteristics (0x0031-0x003B) are subscribed per-event-with-subscribers
  (`performancemonitorBle.ts#L547`); a user-set `multiplex` flag (default
  `false`, L146) flips everything to one 0x0080 subscription, documented as
  a workaround for "some android phones [that] can connect to a limited
  number of events" (L224-227). They DO carry separate `PM_Mux_*` payload
  enums for the divergent multiplexed layouts of 0x0032/0x0033 and branch
  on `byteLength` (`ble/typedefinitions.ts#L99-L170`,
  `performancemonitorBle.ts#L1128-L1170`) — corroborating §20 item 19's
  "not byte-identical" trap.
- **Sample rate: they READ 0x0034 on connect and never proactively write
  it** (`readSampleRate()`, L1034-1040); a `sampleRate` property setter
  writes a single uint8 only on app request (L470-481). Their enum matches
  our 0/1/2/3 = 1s/500ms/250ms/100ms mapping
  (`ergometer/typedefinitions.ts#L150-L155`). They ride the 500 ms default.
- **0x0037/0x0038 are subscribed independently and never paired.** Two
  separate pub/sub events; each payload exposes `intervalNumber` but the
  library does no joining, buffering, or ordering
  (`performancemonitorBle.ts#L1248-L1291`). Dedup is
  `JSON.stringify(prev) !== JSON.stringify(parsed)`.
- **No end-of-workout timing handling at all.** No grace, no delayed
  teardown, no comment acknowledging the late final split; notifications
  simply stay live until the app disconnects. No prior art for our finish
  grace.
- **Programming: full support including variable interval (workoutType 8),
  zero verification.** Same 0x76-wrapped command set as ours
  (`proprietary_program_commands.ts`; 0x01/0x03/0x04/0x05/0x06/0x13/0x14/
  0x17/0x18). All SET commands registered `waitForResponse:false`
  (`command_core.ts#L143`); readback getters exist but nothing consumes
  them to confirm an arm. README's variable-interval example repeats
  `setConfigureWorkout` per interval and splits sends at 20 bytes.
- **Status byte: bitfield-masked, 0x81 is an accept** —
  `currentByte & SLAVESTATE_MSK`, `(currentByte & PREVFRAMESTATUS_MSK)>>4`
  (`performancemonitorBase.ts#L519-L529`) — corroborating §19.1/§19.10. But
  the parsed `prevFrameState` is only stored/traced; nothing REJECTS on
  PrevReject. We act on it; they record it.
- **Writes: with-response everywhere** (Web Bluetooth `writeValue`,
  `DriverWebBlueTooth.ts#L171-L199`; cordova `ble.withPromises.write`,
  `DriverBleCentral.ts#L58-L61`). BLE frames over 20 bytes are REFUSED
  rather than chunked (`_splitCommandsWhenToBigErrorMessage=true`,
  `performancemonitorBle.ts#L788`; error at `performancemonitorBase.ts#L408`),
  which is why their programming sequences are fragmented into multiple
  ≤20-byte frames each sent as its own CSAFE frame. Ack gating is one
  request frame in flight, released on response parse or a 1000 ms timeout
  (`_commandTimeout=1000`, L220; `checkSendBuffer`,
  `performancemonitorBase.ts#L348-L359`).
- **Reassembly: partial frames across notifications yes**
  (`_receivePartialBuffers=true`, state carried in `WaitResponseBuffer`,
  `performancemonitorBase.ts#L53-L67`); **two frames in one notification
  no** — the parse loop exits at frame completion (L481), moot for them
  because only one request is ever outstanding. We hit the coalescing case
  on real hardware (§20 item 21); their design dodges it structurally.
- **Discovery: service filter on the ADVERTISED base service
  `ce060000-...` plus a `PM\d` name regex**, with 0x0010/0x0020/0x0030 in
  `optionalServices` (`performancemonitorBle.ts#L772-L778`,
  `DriverWebBlueTooth.ts#L117-L146`) — implicit agreement that 0x0030
  cannot be a discovery filter, and a live alternative to our
  name-prefix-only approach: filtering on the advertised BASE service
  ce060000 works on Web Bluetooth.
- **iOS: cordova-only, no Capacitor, no backgrounding handling.** Known
  warts they encode: 1 s delayed scan retry because iOS BLE "is not yet
  active" at start-scan (`DriverBleCentral.ts#L29-L49`); scan-twice for
  iOS 13 (ChangeLog 1.4.5); `autoReConnect` default-false because
  reconnecting against a PM turning its radio off "causes some strange
  state on the device which breaks communcation" (L149-151).

### 1.2 c2bluetooth (CrewLAB → OpenRowingCommunity) — the only other mobile programmer

**What it is:** Flutter package (v0.1.6, LGPL-3.0, last push 2025-06-05,
BLE via `flutter_ble_lib_ios_15`, CSAFE via the separate `csafe_fitness`
Dart package). <https://github.com/OpenRowingCommunity/c2bluetooth>
The only mobile-framework library besides ours that PROGRAMS workouts over
BLE.

- **Subscribes ONLY the end-of-workout summary pair 0x0039 + 0x003A** and
  `Rx.zip2`s the two streams into one `WorkoutSummary.fromBytes`
  (`lib/models/ergometer.dart`). No live status streaming at all (0x0031-33
  constants exist unconsumed; "planned" per README). No 0x0080, no 0x0034.
  Their zip-pairing of a two-characteristic boundary is the same problem
  our `noteBoundaryHalf` solves for 0x0037/0x0038 — theirs assumes strict
  1:1 ordering, ours matches on the boundary identity.
- **Programming**: standard-CSAFE path (`SetHorizontalGoal`/`SetTimeGoal` →
  optional `SetSplitDuration`/`SetPower` → `SetProgram` → `CSAFE_GOINUSE`)
  or proprietary path (`PM_SET_WORKOUTTYPE` → durations → split →
  `SetScreenState(PREPARETOROWWORKOUT)`), each command in its own 0x76
  wrapper "so that its more likely to fit within the 20 byte limit";
  writes to 0x0021 with response=true. **Variable interval (workoutType 8)
  explicitly unimplemented** — throws `FormatException` from an
  `unimplementedWorkouts` list. No verification of any kind after
  programming.
- **Discovery: scans by the advertised BASE service `CE060000`**
  (`lib/models/ergblemanager.dart`), with iOS `restoreStateIdentifier`
  state restoration — a CoreBluetooth facility we do not use.
- **Documented timing quirks**: the summary's recovery-heart-rate field
  arrives only after a full minute of post-workout rest and "may never
  arrive"; iOS BLE throughput ~640 B/s vs Android ~1000 B/s (README).

### 1.3 Python/desktop lineage and the rest of the field

- **PyRow / Py3Row** (<https://github.com/wemakewaves/PyRow> BSD-2, push
  2024-04-07; <https://github.com/droogmic/Py3Row> BSD-2, push 2022-03-24):
  USB HID only, no BLE. CSAFE framing matches ours exactly — XOR checksum,
  0xF0-0xF3 byte stuffing (`csafe_cmd.py`). Status byte: only
  `& 0xF` for slave state; the prev-frame bits are IGNORED entirely (the
  §19.10 finding, re-confirmed live). Programming is the STANDARD-CSAFE
  path (`CSAFE_RESET_CMD` → `SETHORIZONTAL`/`SETTWORK` → `SETUSERCFG1`
  split → `SETPROGRAM` → `GOINUSE`) with no state pre-check and **no
  interval support at all**. `uvd/pyrow` and `ergarcade/pyrow` do not
  exist (404, checked live).
- **ergarcade/pm5-base** (<https://github.com/ergarcade/pm5-base> MIT,
  ACTIVE — last push 2026-07-25): dependency-free JS, Web Bluetooth +
  WebHID + mock replay. **Multiplexed-only for BLE**: "On real hardware
  every rowing sub-message arrives multiplexed on 0x0080" (`lib/pm5-ble.js`)
  — demuxed to per-message callbacks including end-of-workout and
  additional-split. 0x0034 defined, never written. Discovery: filter on
  `CE060000`, rowing service in `optionalServices` — the clearest live
  corroboration that 0x0030 is not advertised. CSAFE on the HID side only.
  One quirk we should note: `device.gatt.connect()` can hang forever on a
  stale OS bond, so they wrap connect in a timeout — our scan pipeline is
  raced but our `connect()` is NOT.
- **BoutFitness/Concept2-SDK** (Swift, MIT, dormant 2021): blanket
  `setNotifyValue(true)` on every discovered characteristic INCLUDING
  0x0080 alongside the individual chars (redundant double traffic);
  CSAFE command file is an empty stub. Sample-rate model exists; a write
  call was not found (UNVERIFIED).
- **doug-hoffman/ha-c2_pm5** (Home Assistant, Apache-2.0, push 2026-01-06,
  bleak): hybrid subscribe — 0x0033, 0x0035, 0x0039, 0x003A AND 0x0080
  simultaneously (`custom_components/c2_pm5/pm5_ble.py`). **The one other
  project that codes for late end-of-workout data**: on idle it terminates
  and then sleeps `TERMINATE_GRACE_SECONDS` explicitly "to allow
  end-of-workout summaries (0039/003A)" before disconnecting — the same
  shape as our finish grace, independently derived.
- **React Native**: no verifiable PM5 library exists. ErgometerJS's own
  README says its RN BLE backend cannot read/write characteristics, so "the
  csafe commands and the power curve do not work".
- **Kotlin/Android native, Swift beyond the above**: nothing verifiable
  with protocol substance (paschmann/concept2_rower is a 3-commit display
  PoC; JeffG05/bluetooth-rower is a peripheral-role Zwift bridge).
  qdomyos-zwift has C2 support but was not verified at file level
  (UNVERIFIED).
- **Concept2 forum threads** (Cloudflare-blocked; snippet-verified only,
  wording UNVERIFIED): (a) "PM5 Bluetooth Message Has A Chance Of Being
  Lost" (<https://c2forum.com/viewtopic.php?f=16&p=597026>) — 0x0037-0x003A
  notifications can be DROPPED, especially at workout end; **ErgData's own
  mitigation is pulling the full log via the CSAFE 0x6A interface after
  finishing**, and 0x0039 can fire a second time ~1 min later when an HRM
  is active. (b) "Very Long Configuration CSAFE Commands"
  (<https://www.c2forum.com/viewtopic.php?t=204541>) — config frames over
  ~120 bytes fail; apps supporting ~50 intervals use the variable-interval
  framework for ALL interval types, strung across multiple frames — which
  is exactly our `framer.ts` 120-byte cap and multi-frame send, and the
  first outside corroboration that our workoutType=8-for-everything
  compile strategy is what commercial apps do. (c) "Bluetooth
  Implementation" (<https://c2forum.com/viewtopic.php?t=94488>) — 0x0034
  sets the rate; notifications arrive at that rate even when values have
  not changed.

### 1.4 OpenRowingMonitor (JaapvanEkris fork; laberning original archived)

**What it is:** Raspberry Pi rowing computer that EMULATES a PM5 as a BLE
peripheral so ErgZone/EXR/Kinomap/ErgData connect to it. Their code and
`docs/PM5_Interface.md` (355 lines, fork only, derived from Bluetooth traces
of a REAL PM5 and tested against ErgData "as the definitive source") encode
what real C2 apps expect on the wire — the best available mirror for our
§20-§22.
<https://github.com/JaapvanEkris/openrowingmonitor> (GPL-3.0, active, last
push 2026-07-28; original laberning repo archived 2026-04).
Emulation lives in `app/peripherals/ble/pm5/` (control-service,
csafe-service, rowing-service). Their own config still says "not
functionally complete yet".

- **The app subscription matrix** (PM5_Interface.md): EXR = CSAFE +
  0x0031/32/33/35/36/3D; **ErgZone = everything** (adds 0x003E, 0x0037/38,
  0x0039/3A, 0x003F LoggedWorkout); Kinomap = ErgZone minus CSAFE/0x003F;
  Regatta = 0x0031-33 only. **No app in their matrix uses 0x0080** — the
  multiplexed char exists in their emulation purely as an Android
  notification-limit fallback (a characteristic falls back to
  0x0080 only when nobody subscribed it individually). Our
  individual-characteristics choice is what every real app does.
- **Sample rate 0x0034**: implemented crudely (0 → 1000 ms, any nonzero →
  250 ms, flagged TODO); their default broadcast interval is 1000 ms. No
  app is documented as requiring a specific rate.
- **Notification ordering at boundaries** (`Pm5RowingService.js
  notifyData()`): on split end — status burst (0x0031, 32, 33, 3E in that
  order) THEN 0x0037 THEN 0x0038; on session stop — status burst, splits,
  THEN summaries (0x0039, 0x003A, 0x003F). They emulate the real PM5's
  attribution quirk deliberately: 0x0037/38 "are sent **after** the split
  rollover and report about the metrics of the previous split, but uses
  the `interval count` of the **current interval**" — our §19.8
  forward-attribution finding, independently trace-derived, and their
  final-splits-after-finished-status ordering is our §21 item 4/§22 item 5
  ordering exactly.
- **Per-interval 0x0031** (PM5_Interface.md, from real-PM5 traces): "At an
  interval rollover, this timer is reset to zero. At a split rollover, the
  timer is NOT reset"; distance likewise; session-cumulative distance goes
  in Total Work Distance, "only increased at the end of the interval".
  Confirms our §20 item 12. ONE DIVERGENCE: they document the elapsed
  timer as STOPPED during a planned rest, where our walk-4 reading
  (elapsed=37.81 at state=resting on a 2x100m) was recorded as the
  interval's count spanning work plus trailing rest — a frozen-at-rest
  timer would produce the same single reading, so our §20 item 12 phrasing
  overstates what one sample can prove. One raw capture mid-rest (two
  ticks, is elapsed moving?) settles it. Flagged for the next walk.
- **CSAFE service**: 0x0021 declared `['write','write-without-response']`,
  0x0022 notify. Response status byte generated as
  `frameToggle << 7 | previousStatus | stateMachineState`
  (`CsafeResponseFrame.js:118`) with accept = `(status & 0x30) === 0` —
  the emitter-side mirror of our §19.1 bitfield, and their captured ack
  `f1 81 76 1c 18 01 17 03 04 14 14 18...` is an 0x81-accept in the wild.
  Two bugs they fixed making ErgZone happy (issue #118): byte-unstuffing
  must precede checksum verification, and a DUPLICATED ack for
  CONFIGURE_WORKOUT made ErgZone loop re-sending the workout ("two ACK's
  make a NACK") — evidence that real apps ack-gate frame-by-frame as we
  do.
- **The ecosystem-standard programming sequence** (PM5_Interface.md
  §Workout Mapping + issue #118's raw ErgZone capture): per interval
  `SET_WORKOUTINTERVALCOUNT, SET_WORKOUTTYPE, SET_INTERVALTYPE,
  SET_WORKOUTDURATION, SET_RESTDURATION, CONFIGURE_WORKOUT`, closed with
  `SET_SCREENSTATE(PREPARETOROWWORKOUT)` — our §12 template. The #118
  capture shows ErgZone sending a 5-interval variable workout as ONE CSAFE
  frame split over six 20-byte BLE writes — i.e. ErgZone CHUNKS frames
  exactly as our `framer.ts` does, settling that our chunked-frame
  approach (vs ErgometerJS's fragment-into-small-frames) is what
  commercial apps do.
- **workoutType=8 in the wild** (PM5_Interface.md note at L100): ErgData
  and ErgZone "optimise" — three equal 8:00/2:00 intervals are sent as
  `FIXEDTIME_INTERVAL`, not type 8; "If one would add a single second to
  any of the individual intervals, it becomes a
  `WORKOUTTYPE_VARIABLE_INTERVAL`, and all intervals are programmed
  manually." So real apps only use type 8 for unequal intervals, where we
  compile everything to it. Their emulator expands fixed-interval types
  into 25 work+rest pairs to mimic the PM5's 50-split cap.
  `VARIABLE_UNDEFINEDREST_INTERVAL`: not implemented.
- **EXR sends TERMINATEWORKOUT at the START of a session** — routinely, per
  their comment in `CsafeManagerService.js` ("EXR and the PM5 routinely
  send this at the START of a rowing session"; they map it to
  startOrResume to avoid blocking sessions). A real commercial app leads
  with a terminate exactly like our terminate-shaped `sendPrepare` —
  ecosystem corroboration our §19.5 prepare step never had.
- **State machine**: they only ever EMIT states 0-10; Terminate(11)/
  WorkoutLogged(12)/Rearm(13) are defined but never sent — so ORM is
  silent on the post-finish `WorkoutLogged` parking behavior we handle
  (§20 item 9). ErgData's finish behavior from issue #118: on the
  End-of-Workout message ErgData "will skip the last rest minute" — apps
  treat the finish message as authoritative and cut trailing rest.
- **Odds and ends encoding real-app expectations**: heart rate written as
  0 when absent despite the "255 if invalid" comment on the same line
  (`AdditionalStatusCharacteristic.js:44-45` — the 0-sentinel we found on
  hardware, §20 item 18, visible as an emulator-side discrepancy); a
  documented SPEC ERROR — 0x0033's Last Split Time is 0.01 s accuracy,
  not the spec's 0.1 s; ErgZone requires the DIS manufacturer string to
  identify the data source; ErgData connection is "hit or miss" tied to
  their MTU characteristic TODO; ErgData's logbook chain is deliberately
  unsupported (issue #117: the workout-signing cryptographic hash "we
  simply can't create (nor should we)").

### 1.5 @capacitor-community/bluetooth-le — the plugin itself as ecosystem

Not a PM5 project, but the layer our iOS transport sits on; surveyed for
whether our multiplex workaround is the community answer. All refs at tag
v8.2.0, which IS current main (compare `v8.2.0...main` = 0 commits;
npm latest = 8.2.0, published 2026-05-25) — no unreleased fixes pending.

- **One-listener-per-key confirmed AND documented as intended.**
  `startNotifications` removes the prior listener for the key
  `notification|deviceId|service|characteristic` before adding its own
  (<https://github.com/capacitor-community/bluetooth-le/blob/v8.2.0/src/bleClient.ts#L679-L702>).
  The README says so out loud: "you should only start the notifications
  once per characteristic in your app and share the data and not call
  `startNotifications` in every component that needs the data." Our §21
  item 1 finding is the plugin's designed contract, not a bug; the
  divergence from Web Bluetooth's stacking listeners is never contrasted
  anywhere in their docs.
- **No built-in fan-out exists or is proposed.** No issue/PR adds
  multi-listener support; the nearest issues (#222 device hand-over between
  components, #304, #548 the same one-slot pattern on `onDisconnected`)
  were closed with "manage it in your own state layer"
  (<https://github.com/capacitor-community/bluetooth-le/issues/222>). Our
  transport-level refcounted fan-out (first subscriber opens, last
  unsubscribe closes) is a refinement of the endorsed idiom — nobody
  upstream even addresses the close-on-last-unsubscribe half.
- **The JS promise queue is GLOBAL, across devices and calls**
  (`src/queue.ts`; maintainer confirmation in #678, including an
  undocumented `BleClient.disableQueue()` escape hatch "with other side
  effects"). Our B3.3 queue invariant (no BleClient call between
  ScanTimeoutError and sheet dismissal) is the correct reading; open issue
  #734 ("BleClient Becomes Non-Responsive / Hangs Indefinitely") is
  consistent with that queue jamming.
- **iOS write paths** (`Device.swift` L289-309): `write` (with response)
  resolves on `didWriteValueFor` under a timeout; `writeWithoutResponse`
  resolves IMMEDIATELY with **zero CoreBluetooth backpressure** — no
  `canSendWriteWithoutResponse`/`peripheralIsReady` anywhere in
  Device.swift. Burst without-response writes can be silently dropped by
  the CB buffer. This retro-justifies the iOS transport's acked-write
  choice for chunked CSAFE.
- **The modal list sheet**: `DeviceListView.swift` L14
  `isModalInPresentation = true`, no programmatic dismissal API; iOS scan
  hardcodes 30 s in `Plugin.swift`, after which the sheet retitles but rows
  stay tappable and the promise stays pending — all three of our §21 item 6
  observations confirmed in their source.
- **Notification pipeline history worth knowing**: #635 out-of-order
  callback delivery, fixed by PR #637 (dedicated callback thread, well
  before 8.2.0); #688 (OPEN) value coalescing under fast notifies — N fast
  notifications delivering the latest value N times, so far reproduced only
  on one Android 8 device, but it names a real bridge-side failure mode for
  a 100 ms status stream; #630 iOS thread-safety crash at 50-120
  notify/sec, fixed, with continued hardening through 8.1.3 (#803's iOS
  reconnect batch, in our version).

## 2. Cross-check table (our findings a-g vs the ecosystem)

Verdict vocabulary: **CONFIRMED** (independent evidence agrees),
**REFUTED** (independent evidence disagrees), **NO-DATA** (nobody else has
looked), plus enrichments where the ecosystem adds something ours missed.

| # | Our finding (source) | Ecosystem evidence | Verdict |
| --- | --- | --- | --- |
| a | 0x0030 rowing service not advertised; name-prefix discovery is the way (§20 item 21) | ergarcade/pm5-base filters on `CE060000` with 0x0030 in `optionalServices` (`lib/pm5-ble.js`); ErgometerJS filters on `ce060000` + `PM\d` name regex with 0x0010/20/30 in optionalServices (`performancemonitorBle.ts#L772-778`); c2bluetooth scans by `C2_ROWING_BASE_UUID` (CE060000); ORM advertises only CE060000 (scan response) + the `PM5 ...` name and every real app finds it (`Pm5Peripheral.js`) | **CONFIRMED** — nobody filters on 0x0030. ENRICHMENT: the BASE service CE060000 IS advertised in practice (three projects filter-scan on it against real hardware), so name-prefix-only is not the only way; see recommendation R4 |
| b | Status chars tick ~90-180 ms on iOS after writing 0x0034=3; rate enum 0=1s/1=500ms/2=250ms/3=100ms (§21 item 3, §4) | Enum confirmed byte-for-byte by ErgometerJS (`ergometer/typedefinitions.ts#L150-155`); forum t=94488 (snippet): notifications arrive at the set rate even when values unchanged. Rates others run: ErgometerJS rides the 500 ms default and only writes 0x0034 on app request; nobody else writes it at all (pm5-base defines-never-writes; c2bluetooth/BoutFitness/ha-c2_pm5 silent); ORM's emulator defaults 1000 ms and honors writes crudely (0→1000, else→250, TODO) | **CONFIRMED (mechanism)** / **NO-DATA (measured cadence)** — no other project measures delivered tick spacing on any platform; we are the only client running 100 ms. Watch item: plugin issue #688's bridge-side value coalescing under fast notifies |
| c | PM5 populates 0x0031's structure fields in two steps after programming, ~180 ms type-then-duration (§21 item 2) | No project reads structure back after programming at all (ErgometerJS `waitForResponse:false`; c2bluetooth none; pyrow none; ORM is the peripheral side) — nothing to observe it with | **NO-DATA** — ours is the only observation on record |
| d | End-of-workout split (0x0037/38) arrives LATER than one status tick after `finished`, inside 3 s (§22 item 5) | ORM's emulation emits final splits strictly AFTER the finished-status burst (`Pm5RowingService.js notifyData()` — trace-derived from a real PM5); ha-c2_pm5 sleeps `TERMINATE_GRACE_SECONDS` before disconnect explicitly to let 0x0039/3A land (`pm5_ble.py`); c2forum p=597026 (snippet): end-of-workout messages 0x0037-0x003A can be DROPPED entirely, and ErgData's mitigation is pulling the log via CSAFE 0x6A after finish | **CONFIRMED (ordering + lateness)** — and ENRICHED with a harder truth: the ecosystem says the final split can be LOST, not merely late, so a bounded wait needs a fallback (recommendation R1). Our 1-tick-to-3 s bound remains the only measurement anywhere **AMENDED 2026-08-21 (ecosystem review under THE BAR): the measurement was WRONG.** Measured across four committed captures, the final split's arrival relative to the terminal frame is **-179.9, +90.2, -89.7, +7.6 ms** — the sign VARIES, and in two of four the split arrives FIRST, so `FINISH_HANDOFF_HOLD_MS = 3500` buys nothing in half of all finishes. The "~1 ms after" figure in `ConnectedSurface.tsx:52-55` rests on a single walk-day-2 observation that every capture since contradicts. **And the harder fact R1 anticipated:** 0x0039/0x003A have delivered ZERO frames across five natural finishes while appearing in every recording's subscribe list, and we disconnect 22-107 ms after the terminal frame — the summary path has never once been exercised at the erg. |
| e | 0x0031 elapsed/distance are PER-INTERVAL, resetting at next work (§20 item 12) | ORM PM5_Interface.md, from real-PM5 traces: elapsed "reset to zero" at interval rollover, NOT at split rollover; distance likewise; session-cumulative lives in Total Work Distance, updated only at interval end | **CONFIRMED** — with one sub-detail DIVERGENCE: ORM documents elapsed as STOPPED during a planned rest, while our §20 item 12 says the interval's count spans work + trailing rest; our single resting-state sample (37.81) cannot distinguish a running from a frozen timer. Next-walk item **SETTLED 2026-08-21 — the open sub-detail is closed.** The interval clock keeps RUNNING into the rest and then freezes (session-2: frozen at 133.08 for 26 s while `restSeconds` ran 26.91 → 1.85), so neither ORM's "stopped" nor a plain "spans the rest" is right on its own. Also settled, and it CONTRADICTS ORM `PM5_Interface.md:262`: **Total Work Distance includes rest-coast metres** (1535 work + 64 rest = 1599 terminal TWD; 1300 + 47 = 1347). That matters beyond this row — it is why our own TWD oracle cannot see the work-vs-work+rest gap Concept2's schema cares about (Phase RC). |
| f | Acked vs without-response writes for chunked CSAFE on iOS: we ack on iOS, without-response on web (recorded divergence; §17 item 10) | With-response is the ecosystem norm: ErgometerJS `writeValue`/`ble.withPromises.write` everywhere; c2bluetooth `response=true` on 0x0021. Plugin `Device.swift` L289-309: `writeWithoutResponse` resolves immediately with ZERO CoreBluetooth backpressure (no `peripheralIsReady`), so burst chunks can silently drop. ORM's peripheral declares 0x0021 write AND write-without-response, so the PM5 side presumably tolerates both (their choice, not a real-PM5 capture — weak evidence) | **CONFIRMED (acked is right for chunked CSAFE)** — our iOS choice matches the field; our web transport's without-response preference is the ecosystem outlier (recommendation R3) |
| g | workoutType=8 (variable interval) quirks (§12 template, 25-interval 7-frame sends, §20 items 10/11) | ORM PM5_Interface.md + issue #118: the per-interval command string ErgZone sends is exactly our §12 sequence; ErgZone chunks ONE frame over six 20-byte writes (our framer's approach); apps only send type 8 when intervals are UNEQUAL — equal intervals get "optimised" to FIXEDTIME/DIST_INTERVAL; the PM5 caps at 50 splits (ORM expands fixed intervals to 25 work+rest pairs); forum t=204541 (snippet): config frames >~120 bytes fail and big-interval apps string multiple frames — our `framer.ts` 120-byte cap and multi-frame accumulation, corroborated | **CONFIRMED + ENRICHED** — sequence, chunking, frame cap, and multi-frame stringing all match commercial-app behavior. New facts: real apps prefer fixed-interval types for equal intervals (we always compile type 8 — legal, ErgZone-compatible, but not what ErgData would send); EXR routinely sends TERMINATEWORKOUT at session START, validating our terminate-shaped prepare **ENRICHED 2026-08-21:** every piece we program reads back workoutType 8 in 3447 of 3448 committed frames (the one exception is an empty arm), and ergMachineType reads 0 in 3448 of 3448. |
| h | Last Split Time decoded at 0.1 s/lsb, per BOTH Concept2 documents (four printings) | ORM `PM5_Interface.md:288` states the specifications contain an error and the true accuracy is 0.01 s. Nine of our own capture pairs agree (0x0033's u24LE@14 is the exact hundredths value whose truncation to tenths is 0x0037's split time), and the PM5's own memory screen agrees (7476 → 1:14.7, `walk-2026-08-17/README.md:14`) | **REFUTED — the documents, and us.** Our decode is 10x TOO LARGE (`parse.ts:203`). Dormant since CR2 spec 2a Task 6, and `statusFrames.ts:222` mirrors the same error, so neither a round trip nor a hand-built fixture could ever have caught it. Must-settle 3 CLOSED, no erg required |
| i | Log Entry Date/Time bit-packing is "not stated on the page" (§23), so we key on arrival instead | ORM `C2toORMMapper.js:194-198, :220-222` WRITES it; VirtualPM5's independent samples 0x34B7/0x34F7 decode to 2026-07-11 and 2026-07-15 under the same formula, across three separate bit-fields | **SETTLED as a decode (INVERTED — their writer specifies our reader).** date `uint16` = month \| day<<4 \| (year-2000)<<9; time `uint16` = minutes \| hours<<8. Must-settle 2 CLOSED. **Residual that inverts the headline:** the wire is MINUTE-resolution and Concept2 stores seconds, so the wire cannot supply C2's dedup key as-is |
| j | "The ecosystem's ultimate authority is the monitor's own log, and we have no route to it" (`state-architecture-review.md:876`) | CSAFE Rev 0.27 publishes the log READ COMMANDS (0x6A, `GET_INTERNALLOGPARAMS`) and names ten log structure identifiers **while defining the field layout of none of them** | **STANDS — must-settle 1 ANSWERED.** The commands are public, the format is not. Reconciliation with Concept2 must be achieved WITHOUT the monitor's log |
| k | Concept2 verification might be a hash we can compute | Published logbook API: `verified` is a trusted-client relationship ("Only trusted clients are able to verify workouts. Please contact Concept2"); `verification_code` is a monitor-computed 16-digit code readable on 0x003F, accepted only if date, time, distance, workout_type and machine type match what it was computed over | **CLOSED (`verified`) / OPEN (`verification_code`).** No OSS project anywhere has reconciled a row with the Concept2 logbook — there is no prior art for this and we are first. See Phase RC |

Cross-checks beyond the a-g brief that the survey settled:

- **0x81 is an accept** (§19.1): ORM GENERATES the toggle
  (`CsafeResponseFrame.js:118`) and its captured `f1 81 76 1c ...` ack is
  an 0x81-accept a real app (ErgZone) consumed happily; ErgometerJS masks
  the bitfield (`performancemonitorBase.ts#L519-529`). Py3Row/PyRow ignore
  the high bits entirely (re-confirmed live). CONFIRMED, again.
- **0x0037/0x0038 pairing** (§20 items 15/16): ORM emits 0x0037 before
  0x0038 and reproduces the forward-attribution off-by-one on purpose
  ("uses the interval count of the current interval") — both halves of
  our reading confirmed from the peripheral side.
- **Heart-rate 0-sentinel** (§20 item 18): ORM writes 0 for absent HR
  directly beside a "255 if invalid" comment — the ecosystem's emulator
  exhibits the same 0-vs-255 muddle we measured; both-sentinels-null
  stands.
- **One-listener-per-characteristic** (§21 item 1): plugin source +
  README + maintainer issue answers confirm it as designed behavior with
  "share it yourself" as the official idiom. Our fan-out is the community
  answer, refined.
- **Modal scan sheet, 30 s stop, tappable stale rows** (§21 item 6): all
  confirmed in plugin Swift source.

## 3. Recommendations (ranked)

Each: what, why, effort guess, and whether it touches the release-gating
path or is follow-on material.

**R1. Subscribe the end-of-workout summary pair 0x0039/0x003A as the
finish-data reconciler (consider 0x003F LoggedWorkout too).**
The ecosystem treats the SUMMARY characteristics, not the final split, as
the finish authority: c2bluetooth builds its entire workout result from
0x0039+0x003A and nothing else; ha-c2_pm5's grace sleep exists for
0x0039/3A; ErgZone subscribes all four; and the forum thread says
0x0037-0x003A notifications can be dropped outright — ErgData's own answer
is to re-pull the log over CSAFE after finishing. Our finish grace makes
the late split survivable; a summary subscription makes a LOST split
survivable, and gives the record a second, independent source for the
final interval's actual (plus whole-workout averages we currently
accumulate ourselves). Known wrinkle to design around: 0x0039 can fire a
second time ~1 min later when an HRM is active (recovery HR), so consume
once and ignore the re-fire.
*Effort:* medium — two new parse tables (BLE doc pp.21-24), two
subscriptions through the existing `mergeStatus` path, one reconciliation
rule in the record. *Path:* follow-on (the shipped finish grace covers the
common case; this closes the loss case). Highest value item found.

**R2. Race `connect()` with a timeout, like the scan pipeline already is.**
ergarcade/pm5-base wraps `gatt.connect()` in a timeout because it "can
hang forever when the OS stack holds a stale bond" — an active,
hardware-tested project's scar. Our `SCAN_TIMEOUT_MS` race covers the scan
pipeline only; `Transport.connect()` has no bound on either transport, so
a stale-bond hang would leave the session in `connecting` with no card
forever — exactly the hang class ruling 2 exists to kill. Plugin-side open
issue #734 (BleClient hangs indefinitely) makes an unbounded connect more
plausible, not less.
*Effort:* small — reuse the raceScanTimeout shape with its own constant
and typed error; classifier arm for the card copy.
*Path:* release-gating adjacent — it is on the session-start path and is
a genuine stuck-forever without it.

**R3. Switch `webBluetooth.ts` to acked `writeValue` and close §17 item
10.** The without-response preference was flagged at review as an untested
radio assumption. The survey answers it: every surveyed client writes
CSAFE with response (ErgometerJS on both its backends, c2bluetooth), our
own iOS path writes acked and has now programmed real workouts over it,
and the plugin's iOS source shows what without-response costs (immediate
resolve, zero backpressure). No surveyed evidence says the PM5 needs
without-response.
*Effort:* trivial — delete the preference branch, keep `writeValue`.
*Path:* follow-on (web transport is the dev/desktop path, not the iOS
release path); cheap insurance against a chunk silently dropping
mid-frame on the laptop harness.

**R4. Try `services: [CE060000]` in discovery at the next hardware walk.**
Three projects filter-scan on the C2 BASE service CE060000 against real
hardware (ErgometerJS, c2bluetooth, pm5-base), and ORM puts it in its scan
response for real apps to find — strong evidence real PM5s advertise it
(directly UNVERIFIED by us; our walk only proved namePrefix-with-empty-
services works). If the PM5 advertises it through the Capacitor plugin's
AND-semantics, adding it would stop scanning-for-everything and shrink the
picker sheet to ergs. Keep `namePrefix: "PM5"` regardless.
*Effort:* one-line change + one walk step to verify; revert instantly if
the sheet goes empty (the §3.1 lesson in reverse).
*Path:* follow-on; discovery works today.

**R5. Note for the reconnect/backgrounding phase: CoreBluetooth state
restoration exists and the plugin does not expose it.** c2bluetooth passes
`restoreStateIdentifier` (flutter_ble_lib); @capacitor-community/
bluetooth-le has no equivalent (UNVERIFIED that no fork adds it). If
Phase-later backgrounding needs sessions to survive suspension, this is a
plugin-level gap to plan around (bluetooth-central background mode +
restoration), not something to bolt on late.
*Effort:* n/a now — a design input, recorded so the reconnect phase reads
it. *Path:* follow-on.

**R6. Keep the wall-clock discipline; two ecosystem facts reinforce it.**
(i) Forum t=94488: the PM5 notifies at the configured rate even when
values have not changed — so tick counting measures the radio, never
progress; every gate we moved to wall clock (§21 item 3, §22 item 5) is
the right species. (ii) Plugin issue #688 (open): the bridge can deliver
N fast notifications as the latest value N times on at least one device —
one more reason a tick is not a sample. No action; recorded as
ammunition.

## 4. DO NOT ADOPT

Patterns the survey found that we should deliberately NOT copy, recorded so
a future reading of these projects doesn't import them:

- **Trusting the ack as programming success** (universal: ErgometerJS
  `waitForResponse:false`, c2bluetooth, pyrow). Three of our hardware arms
  acked everything while holding nothing (§19.13). The ecosystem has never
  hit this because nobody programs against a machine that might be
  mid-piece; we do.
- **Ordering-assumed pairing of two-characteristic data** (c2bluetooth's
  `Rx.zip2` of 0x0039+0x003A). Our D4 diagnosis (0x0038 after 0x0037,
  pair by boundary identity, §20 item 16) is strictly safer; zip breaks on
  one dropped half and mis-pairs forever after.
- **Fragmenting programming into many small CSAFE frames instead of
  chunking one frame** (ErgometerJS refuses frames >20 bytes outright).
  Works, but ErgZone's captured behavior (one frame, six 20-byte writes,
  ORM #118) matches our framer, and per-command frames multiply
  ack-latency on a 25-interval program.
- **Blanket-subscribing everything including 0x0080** (BoutFitness):
  doubles notification traffic for zero information.
- **`BleClient.disableQueue()`** (plugin #678's escape hatch): tempting if
  the global queue ever bites, but the maintainer's own "might have other
  side effects" plus our B3.3 invariant say no.
- **Terminate-at-idle mapped to start** (ORM maps EXR's session-start
  TERMINATEWORKOUT to startOrResume): peripheral-side hack, but the
  underlying fact (real apps fire terminate liberally) supports keeping
  our prepare's outcome-swallowing exactly as loose as it is.

**Additions, 2026-08-21 reconciliation.** Patterns found and deliberately
rejected in the second pass, or fixes it proposed and its own verification
killed:

- **Do not use ORM's 0x0039 writer as an oracle for Avg Pace.**
  `WorkoutSummaryCharacteristic.js:63-64` comments `// Avg Pace (0.1 sec)` and then
  writes `Math.round(data.workout.pace.average)` — whole seconds. Their writer
  contradicts its own comment, so it specifies nothing for our reader.
- **Do not adopt ORM's Total Work Distance description.** `PM5_Interface.md:262`
  says TWD "only increased at the end of the interval". Our captures show it ticking
  continuously through a WORKOUTROW interval (session-2 s758-776: 354→360) while
  holding constant through an INTERVALWORKDISTANCE interval. Partial at best.
- **Do not treat VirtualPM5's null result as refuting Concept2's own document.** Its
  `pm5-older-logs-truths.md:51` says the "~1 min late" summary re-fire "is not
  supported by either log" — but LOG11 had no strap paired (so no recovery HR to
  revise) and LOG15 re-armed within ~9 s of every completion, which is C2's stated
  disqualifying condition. A null result with a fully-explaining confound. The
  `describeClosedGrace` comment stays.
- **Do not make the refused-open emitted-index mirror unconditional.** Tempting
  one-liner, and our own history refutes it: `driver.ts:1862-1897` records that it was
  implemented, went green, and regressed two driver tests, because the guard fires in
  two shapes and only one is a lie. Extend to state 9 and stop.
- **Do not persist two folds of the same wire and reconcile them as "independent".**
  Proposed and refuted here: `seriesRecorder`'s fold is DOWNSTREAM of the driver's
  (same post-clamp key source, same inputs), so a zero-frame interval is skipped by
  both and the delta is exactly zero in the case it was meant to catch.
- **Do not accept a byte-inverse encoder OR a hand-built fixture as an oracle for a
  scale.** This is literally how the Last Split Time 10x survived: `statusFrames.ts`
  mirrors the parser and `parse.test.ts:198` pins `1234/10` by hand. Only a capture
  or the machine's own screen can settle a scale.
- **Do not copy RowTracer's `LIVENESS_STALE_MS = 5000` or ORM's 6000 ms.** Both are
  unmeasured, and RowTracer's own docs say its transport work has never passed a
  physical PM5. Our threshold comes from our own 3,442 measured gaps.
- **Do not apply one `withDiagnostics` decorator across both transport arms.** It
  dissolves the build-time gate that keeps `recording.ts` out of production `dist/`
  (recurring failure 12's own scar). Two decorators, different gates.
- **Do not claim 0x0037's rest time is a measurement.** Every committed value equals
  the programmed rest exactly, and no PM5 mechanism is known that would separate them.
  Carry the field; describe it honestly.
- **Do not chase c2forum thread t=200769.** Still Cloudflare-403 to curl with a
  browser UA and to WebFetch. It is ORM's cited source for the date bit-packing; read
  `C2toORMMapper.js:189-223` instead, which implements it.

## 5. Things we do that nobody else does

Worth knowing either way — each is either a genuine edge or a place where
we carry risk alone with no ecosystem prior art to lean on.

1. **Post-program STRUCTURE verification** (`verifyArmed` reading 0x0031's
   workoutType/duration back, §19.13): no surveyed project verifies
   programming at all, by readback or even by state. Unique, and earned —
   the empty-arm failure it catches is real and undocumented anywhere.
2. **The prepare-settle guard** (programming over a running piece arms
   empty): nobody else even sends a program mid-piece; §19.10's earlier
   survey and this one agree. EXR's terminate-at-start is the nearest
   ecosystem behavior and it validates the prepare, not the guard — the
   guard's territory is still ours alone.
3. **A measured end-of-workout split arrival bound** (one tick to 3 s,
   §22 item 5): ha-c2_pm5 has a blunt grace sleep; nobody else has a
   measurement. Our finish grace is the only clock in the ecosystem tied
   to an observation.
4. **Acting on CSAFE PrevReject with a `GetErrorType` follow-up**:
   ErgometerJS parses the bitfield and files it; Python ignores it; we are
   the only client that fails a programming call on it and asks the
   machine why (§19.7 — reply shape still unconfirmed on hardware).
5. **Drain-until-null CSAFE reassembly for coalesced notifications**
   (§20 item 21): ErgometerJS handles partial frames but structurally
   cannot see two frames in one callback; we proved the case on hardware
   and pinned it with a regression test.
6. **The two-step structure transition window** (§21 item 2): observed by
   nobody else, because nobody else subscribes fast enough AND reads
   structure back. Any future fast-subscribing verifier in the ecosystem
   will rediscover it; ours is the only written record.
7. **Field-level band guards on wire-legal-but-absurd readings** (§20's
   consumer rule): no surveyed project validates decoded ranges at all.
8. **100 ms sample rate in production**: nobody else writes 0x0034 to 3.
   We get the countdown fidelity; we also uniquely carry any fast-notify
   bridge risk (#688) — worth one eye at each future walk.

**Additions, 2026-08-21 reconciliation.** (9) A barrier-gated replay harness
that feeds committed wire bytes through the real driver with an INDEPENDENT
decoder as its oracle. (10) Measured BLE inter-arrival statistics on a real
PM5 (3,442 consecutive 0x0031 gaps across seven captures: max 810 ms, mean
508 ms). (11) A build-time gate proven by `dist/` grep that keeps the capture
tooling out of production. **Amend (3):** our end-of-workout split bound is
now four measured values with a VARYING SIGN (-179.9, +90.2, -89.7,
+7.6 ms), not "one tick to 3 s".

## 6. Survey ledger

Projects examined at file level, live, 2026-08-11: ErgometerJS,
OpenRowingMonitor (JaapvanEkris + laberning), c2bluetooth (+ OpenErgView),
ergarcade/pm5-base, BoutFitness/Concept2-SDK (+ RowBotics variant),
PyRow/Py3Row, doug-hoffman/ha-c2_pm5, @capacitor-community/bluetooth-le,
paschmann/concept2_rower, JeffG05/bluetooth-rower — 13 repos, plus
raralabs/pm5-emulator and qdomyos-zwift noted but not verified at file
level (UNVERIFIED), and three c2forum threads snippet-verified only
(Cloudflare-blocked; exact wording UNVERIFIED).

Searched for and confirmed NONEXISTENT (404/no results, checked live):
uvd/pyrow, ergarcade/pyrow, "krow", "OpenErgConsole", "TrackMyRow",
"RowingCoach", npm "pm5-bluetooth", npm "concept2-ble", any React Native
PM5 library.

### Additions, 2026-08-21 reconciliation

**Opened at file level this review, live 2026-08-20/21:**

| Project / source | Layer read | Licence | Verdict |
|---|---|---|---|
| **Concept2 Online Logbook API**, `log.concept2.com/developers/documentation/` (note the trailing slash; `/developers` 403s) | Full published row schema, splits/intervals/targets/strokes/metadata, dedup rule, error codes, `log-dev` sandbox, `export/{csv,fit,tcx}` | Concept2 docs, not OSS | **PRIMARY and decisive.** Outranks every other source for the bar. A public JSON validator also exists |
| **JaapvanEkris/openrowingmonitor** | Re-opened at: central-side HRM client (`ble/hrm/HrmService.js`, `PeripheralManager.js:392-424`), the INVERTED writers (`WorkoutSummaryCharacteristic.js`, `LoggedWorkoutCharacteristic.js`, `C2toORMMapper.js`), recorders, `docs/Integrations.md` | GPL-3.0 (facts only, no code) | Alive, 2026-07-28. **Has central-side code** (HRM) — settled, and it is the best watchdog prior art. Its `Integrations.md` contains zero occurrences of "concept2" or "logbook" |
| **cagnulein/qdomyos-zwift** (was UNVERIFIED in the ledger) | `src/devices/concept2skierg/concept2skierg.cpp` (518 lines) | GPL-3.0 | Alive, 2026-08-21, 832★. **Now verified at file level.** Central-side, re-observes link state every 200 ms rather than storing it. Note: it is a **SkiErg** driver — lifecycle transfers, field decoding does not |
| **cbikkula/pm5-dashboard ("RowTracer")** — NEW | `pm5web/transport.js` (the whole state machine, liveness watchdog, gap recorder, continuity rule, capture-quality metadata), `docs/known-issues.md` | **MIT — legally borrowable** | Alive, 2026-07-24. The closest thing to our product shape (Web Bluetooth PWA). Its own docs say it has never passed a physical PM5 |
| **john-occasionally-blogs/VirtualPM5** — NEW | `docs/pm5-older-logs-truths.md`, `pm5-rirt-lifecycle.md`, `pm5-csafe-catalog.md`, one committed real-PM5 capture | **Apache-2.0** | Created 2026-07-28, alive 2026-08-21, 0★, single author. Swift PERIPHERAL emulator. Its capture-derived timing claims describe private logs it does not ship — **SECONDARY, capture-derived testimony**, not CAPTURE |
| **OpenRowingCommunity/c2logbook** — NEW | `lib/src/types/c2_full_results.dart` and siblings | LGPL-3.0 | Alive 2026-01-24. Typed C2 client; useful only to CORROBORATE the published schema |
| **sanderroosendaal/rowingdata** | `rowingdata.py` (7105 lines) grepped for the C2 upload path | MIT | Alive. **The brief's Tier 2 lead is wrong: it does NOT talk to the C2 logbook.** `uploadtoc2` does not exist in the module; only vestigial `c2username`/`c2password` fields remain. TCX/FIT comparator only |
| **sanderroosendaal/rowsandallclient** | `main.go` + real TCX/FIT/JSON artifacts | MIT | Dormant 2024-12-07. Upload path is a multipart FILE post, not a row schema |
| **OpenRowingCommunity/c2bluetooth** | Re-opened at session level per the brief | LGPL-3.0 | Alive but STALE (2025-06-05). Nothing new at the session layer |
| **Concept2 BLE Rev 1.30 + CSAFE Rev 0.27 PDFs** | Full attribute tables, appendices | Concept2 | **The `.co.uk` URLs ORM cites now 404.** The `.co.in` mirror serves both |
| **Apple CoreBluetooth documentation** | `centralManagerDidUpdateState`, `CBManagerState.resetting`, `retrieveConnectedPeripherals`, `didDisconnectPeripheral` | Apple | PRIMARY. Two of our contract comments are falsified by it |
| **@capacitor-community/bluetooth-le 8.2.0** | `Plugin.swift`, `DeviceManager.swift`, `Device.swift`, `dist/esm/bleClient.js` | MIT | Re-opened at the init/deviceMap/callbackMap layer, which the 2026-08-11 review did not reach |

**Confirmed NONEXISTENT or useless, checked live 2026-08-20/21 (do not re-hunt):**
Painsled (no public source — the only GitHub org hit has zero BLE code), BoatCoach (no
public source; two unrelated CSV-utility repos), rowsandall.com developer API
(`/developers/` and `/api/` both 404), FTMS 1.0.1 spec PDF (403 — use the SIG XML
mirrors), Concept2 SDK page (404), `stevescot/OpenRowingCode` (Arduino reed sensors),
`OpenRowingCommunity/csafe-fitness` (generic CSAFE framing only, layer already
settled), `mrverrall/go-row` (185-line PM5 module), `skitchbeatz/concept2-esphome`
(one YAML, no licence), `gamalamadingdong/logbook-companion` (downstream of the
published API), any NEW React Native / Kotlin / Swift PM5 **central** library (three
searches, still none), c2forum t=200769 (still Cloudflare-403).

**Standing result worth its own line:** **no OSS project anywhere has reconciled erg
data with the Concept2 logbook.** ORM integrates with rowsandall, intervals.icu, TCX
and FIT, and never with C2's own API. There is no prior art for the bar; we are first.
