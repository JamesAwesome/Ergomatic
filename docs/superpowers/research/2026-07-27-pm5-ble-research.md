# Concept2 PM5 Bluetooth Integration — Research Reference

Date: 2026-07-27
Scope: feasibility and implementation reference for a mobile-first React web app (PWA-ish, HTTPS) reading live PM5 data and, optionally, programming workouts onto the PM5, via Web Bluetooth.

---

## 1. PM5 BLE interface (Concept2 PM Bluetooth Smart Communication Interface Definition, Rev 1.30)

Source PDF: `PM5_BluetoothSmartInterfaceDefinition.pdf` (see Sources). This is the authoritative spec; last revised 3/2/2022, first published 2015, still current as of PM5 firmware in 2026.

### Role model
The PM5 is always the BLE **Peripheral**; your phone/browser is the **Central**. It supports single-PM-to-single-device, and (for coaching/racing tools) multiple-PMs-to-one-device.

### Base UUID / UUID pattern
All PM5 proprietary services/characteristics share one 128-bit base UUID, with a 16-bit slot substituted in:

```
CE06xxxx-43E5-11E4-916C-0800200C9A66
```

This is a Version-1 (time+MAC-based) UUID per RFC 4122, chosen so apps can filter BLE scan results specifically for Concept2 devices. GAP/GATT standard services (0x1800, 0x1801) also appear using standard 16-bit Bluetooth SIG UUIDs.

### Services (all GATT primary services under the base UUID)

| UUID slot | Service |
|---|---|
| `0x0010` | C2 Device Information Service |
| `0x0020` | C2 PM Control Service (CSAFE tunnel) |
| `0x0030` | C2 PM Rowing Service (telemetry) |

Device name in GAP (0x2A00) is literally `"PM5 <serial>"`, e.g. `PM5 430000000` — useful for filtering `requestDevice` scan results without needing the full 128-bit UUID if you also match on name prefix.

### Device Information Service (0x0010) — key characteristics
- `0x0011` Model number string ("PM5")
- `0x0012` Serial number string
- `0x0013` Hardware revision string
- `0x0014` Firmware revision string
- `0x0015` Manufacturer name ("Concept2")
- `0x0016` Erg Machine Type (enum, 1 byte) — Row/Ski/Bike/Slides/Dyno/MultiErg, firmware-version-gated
- `0x0017` ATT MTU characteristic (2 bytes)
- `0x0018` LL Data Length Extension characteristic (2 bytes)
All READ-only, no notifications.

### Control Service (0x0020) — for sending commands, incl. workout programming
- `0x0021` **C2 PM receive characteristic** — WRITE. Up to 20 bytes; body is a raw CSAFE command frame sent to the PM.
- `0x0022` **C2 PM transmit characteristic** — READ/NOTIFY. CSAFE response frame from the PM.

This pair is a generic byte-pipe for the CSAFE protocol (see §5) — used both to read one-off status (e.g. heart-rate belt info) and to program/control workouts.

### Rowing Service (0x0030) — telemetry, for the "passive monitor" use case
Every rowing characteristic is READ + NOTIFY. Enable notifications via the standard CCCD (0x2902, write `01:00`). Broadcast rate is controlled by:

- `0x0034` **Sample rate characteristic** (1 byte, WRITE/READ). Values: `0`=1 s, `1`=500 ms (**default**), `2`=250 ms, `3`=100 ms. This governs General Status + Additional Status 1/2 notification cadence; stroke-triggered characteristics fire once per stroke event regardless of this setting.

Telemetry characteristics (all lengths exclude the 1-byte header when accessed via the multiplexed characteristic; direct-characteristic lengths shown are the full payload):

| UUID | Name | Bytes | Key fields | Rate |
|---|---|---|---|---|
| `0x0031` | General Status | 19 | Elapsed Time (0.01s, 3B LE), Distance (0.1m, 3B), Workout Type (enum), Interval Type (enum), Workout State (enum), Rowing State (enum), Stroke State (enum), Total Work Distance, Workout Duration + Duration Type, Drag Factor | per sample-rate setting (default 500ms) |
| `0x0032` | Additional Status 1 | 17 | Elapsed Time, Speed (0.001 m/s), Stroke Rate (spm), Heart Rate (bpm, 255=invalid), Current Pace (0.01s/500m), Average Pace, Rest Distance, Rest Time, (+ Average Power / Erg Machine Type in some firmware variants) | per sample-rate |
| `0x0033` | Additional Status 2 | 20 | Elapsed Time, Interval Count, Average Power, Total Calories, Split/Interval Avg Pace, Split/Interval Avg Power, Split/Interval Avg Calories, Last Split Time, Last Split Distance | per sample-rate |
| `0x0035` | Stroke Data | 20 | Elapsed Time, Distance, Drive Length, Drive Time, Stroke Recovery Time, Stroke Distance, Peak Drive Force, Average Drive Force, Work Per Stroke, Stroke Count | **once per stroke** (catch→finish event) |
| `0x0036` | Additional Stroke Data | 15 | Elapsed Time, Stroke Power (W), Stroke Calories (cal/hr), Stroke Count, Projected Work Time, Projected Work Distance | once per stroke |
| `0x0037` | Split/Interval Data | 18 | Elapsed Time, Distance, Split/Interval Time, Split/Interval Distance, Interval Rest Time, Interval Rest Distance, Split/Interval Type, Split/Interval Number | **once per split/interval boundary** |
| `0x0038` | Additional Split/Interval Data | 19 | Elapsed Time, Split/Interval Avg Stroke Rate, Work/Rest Heartrate, Split/Interval Avg Pace, Total/Avg Calories, Split/Interval Speed, Split/Interval Power, Split Avg Drag Factor, Split/Interval Number, Erg Machine Type | once per split/interval |
| `0x0039` | End-of-Workout Summary | 20 | Log Entry Date/Time, Elapsed Time, Distance, Avg Stroke Rate, Ending/Avg/Min/Max Heart Rate, Drag Factor Avg, Recovery Heart Rate (re-sent revised ~1 min after workout ends), Workout Type, Avg Pace | **once at workout end** (+ revised update ~60s later for recovery HR) |
| `0x003A` | End-of-Workout Additional Summary 1 | 19 | Log Entry Date/Time, Split/Interval Type & Size & Count, Total Calories, Watts, Total Rest Distance, Interval Rest Time, Avg Calories | once at workout end |
| `0x003B` | Heart Rate Belt Info | 6 | Manufacturer ID, Device Type, Belt ID (paired BLE/ANT+ HR strap identity) | on change |
| `0x003C` | End-of-Workout Additional Summary 2 | 10 | Log Entry Date/Time, Avg Pace, Game ID / "Workout Verified" flag, Game Score, Erg Machine Type | once at workout end |
| `0x003D` | Force Curve Data | 2–288 (multi-packet) | Per-stroke force/handle curve, split across successive notifications (header nibbles = total characteristics / word count + sequence number). **Not supported on PM5v1.** | once per stroke, multi-packet |
| `0x0080` | **Multiplexed information characteristic** | ≤20 | First byte = ID of the payload being carried (one of 0x31/32/33/35/36/37/38/39/3A/3B/3C); remaining bytes = that characteristic's payload minus its own ID byte | mirrors whichever sub-characteristic fired |

**Multiplexing note (important for Android but harmless to always use):** Android BLE stacks historically capped concurrent notification subscriptions (4 on Android 4.3, 7 on 4.4). Concept2's fix is characteristic `0x0080`: subscribe to *only* this one characteristic and the PM5 multiplexes all the others onto it (first byte = which payload it is), **as long as you have NOT also separately enabled notifications on the individual 0x31/32/33/35–3C characteristics** — enabling both is explicitly documented as producing duplicate/undefined behavior. For a modern browser (no Android 4.x-era subscription limit), it is simplest and most robust to just enable notifications on 0x31 (General Status) + 0x32 (Additional Status 1) directly, and add 0x35 (Stroke Data) if you want per-stroke granularity — you don't need the multiplex characteristic unless you want everything through one pipe.

For live distance/pace/stroke-rate/elapsed-time dashboards, **0x0031 + 0x0032** at the default 500 ms rate (or 250/100 ms via 0x0034) covers essentially everything asked for. Add 0x0039 for the end-of-workout summary.

### Units/encoding conventions worth internalizing
- Multi-byte fields are little-endian, split across "Lo/Mid/High" or "Lo/Hi" named bytes.
- Elapsed Time: 0.01 sec LSB, 3 bytes (24-bit) → max ~46.6 hours.
- Distance: 0.1 m LSB, 3 bytes.
- Pace fields: 0.01 sec per 500m, 2 bytes.
- Speed: 0.001 m/s, 2 bytes.
- Enums (Workout Type, Interval Type, Workout State, Rowing State, Stroke State, Erg Machine Type) are documented in the spec's Appendix A with explicit C `enum` definitions — reproduce these as TS enums rather than magic numbers.

### Authentication / pairing
**No BLE bonding/PIN/passkey pairing is required to subscribe to telemetry notifications.** The "pairing" the spec describes is a *discovery UX ritual on the PM5's own screen* (user must go to More Options → Turn Wireless ON → "Connect Device" screen), not cryptographic BLE bonding — the PM5 then advertises and any Central that connects can read Device Info and subscribe to Rowing Service notifications with no authentication step. This matches real-world experience: Chrome's `requestDevice()` GATT connect to a PM5 in discovery mode just works, no OS Bluetooth pairing dialog, no PIN. (The spec's NFC section describes an *optional* NFC-based "tap to pair" convenience flow using an NDEF record containing the PM5's raw BLE MAC address + advertising name — again just a connection shortcut, not an auth secret.) The PM5 unpairs from the mobile device whenever the monitor powers off or the app disconnects, so each session typically needs the discovery UX repeated. There is a separate, unrelated `CSAFE_PM_SET_AUTHENPASSWORD` CSAFE command referenced in the CSAFE spec (§5) tied to HW address + password, but this appears to be for a specific proprietary/venue racing use case, not a gate on normal telemetry or control access.

---

## 2. Web Bluetooth reality check (July 2026)

| Platform | Status |
|---|---|
| Chrome / Edge desktop (macOS, Windows 10 1703+, ChromeOS) | Full support, no flag, has been stable for years |
| Chrome on Android (6.0+) | Full support |
| Samsung Internet, Opera (desktop/Android) | Supported (Chromium-based) |
| Firefox (any platform) | **Not supported.** Mozilla's official standards position explicitly opposes implementing Web Bluetooth (privacy/fingerprinting concerns) — "not supported and no plan to support it." |
| Safari — macOS, iOS, iPadOS | **Not supported**, and per the Web Bluetooth CG's own implementation-status tracking, WebKit has stated it has "no plan to support it in the near future," citing fingerprinting/tracking-prevention concerns. No change is evident going into iOS 19/26-era Safari releases through mid-2026 — this has been WebKit's stance since Web Bluetooth's inception and shows no sign of shifting. |
| Chrome/Edge/any browser on iOS | Irrelevant — all iOS browsers (Chrome, Edge, Firefox, etc.) are required by Apple to use WebKit as their engine, so **none** of them get Web Bluetooth on iOS regardless of branding. |

**HTTPS + user gesture requirements** (standard Web Bluetooth constraints, apply on the platforms that do support it):
- Must be a "secure context" — HTTPS (or `localhost` in dev). Your PWA already being HTTPS-served satisfies this.
- `navigator.bluetooth.requestDevice()` must be invoked from within a user-activation event handler (a real click/tap), not on page load or a timer — this is the browser's anti-drive-by-scanning gate. Reconnection to an already-`requestDevice()`-granted device (e.g. via `getDevices()` + `.gatt.connect()`) can sometimes be done without a fresh gesture, but the *initial* device picker always needs one.
- No OS-level Bluetooth pairing dialog is triggered by Web Bluetooth GATT connections in Chrome (consistent with §1's finding that PM5 doesn't require bonding) — the picker UI is Chrome's own device-chooser, separate from OS Bluetooth Settings.

**Practical story for an iPhone user at the gym:** Native mobile Safari/Chrome is a hard no — there is no path to `navigator.bluetooth` in any iOS browser today, and nothing in Apple's public roadmap suggests this changes. The only way to get Web Bluetooth working in *some* browser on an iPhone is a **third-party specialty browser that bridges to CoreBluetooth via a native app wrapper**, of which **Bluefy – Web BLE Browser** is the most commonly cited (iOS 11+, App Store). A newer alternative floated in the ecosystem is **iOSWebBLE**, a Safari *Web Extension* that polyfills `navigator.bluetooth` inside actual Safari by bridging to CoreBluetooth (rather than requiring you to leave Safari for a separate browser app) — this is a more elegant integration if the user is willing to install the extension, but it is still unofficial/community and not an Apple-sanctioned API. Either way: for a normal user landing on your HTTPS React PWA in default mobile Safari, Web Bluetooth is simply absent; you'd need to explicitly instruct iPhone users to install and use Bluefy (or Safari + iOSWebBLE) to get BLE features, which is a real UX/support burden and a non-starter for anonymous/casual users.

---

## 3. Existing libraries

| Project | Language/Platform | Approach | Maintenance (as of Jul 2026) |
|---|---|---|---|
| [`ergarcade/pm5-base`](https://github.com/ergarcade/pm5-base) | JS, browser | Dependency-free lib; **Web Bluetooth, Web HID (USB), and a mock transport**, all behind one interface. Talks the plain C2 Rowing Service characteristics directly (not CSAFE frames). | Actively maintained — pushed **2026-07-25** (2 days before this research). 41 stars. Basis for other ergarcade tools (pm5-detail, pm5-overlay, pm5-dump). |
| [`GoogleChromeLabs/rowing-monitor`](https://github.com/GoogleChromeLabs/rowing-monitor) | JS PWA | Full PWA using Web Bluetooth against Discovery/Info/Rowing/Control services, IndexedDB-backed workout logbook. Explicitly labeled "not a Google product" despite the org. | Recently active — pushed **2026-04-07**. 113 stars. |
| [`tijmenvangulik/ErgometerJS`](https://github.com/tijmenvangulik/ErgometerJS) | JS/TS, multi-platform (browser via Web Bluetooth, Node via `noble`, Cordova/Electron) | Cross-platform ergometer driver supporting BLE and USB. Broadest platform reach of the JS options. | Active — pushed **2026-03-23**. 126 stars, the most-starred option. |
| [`raralabs/pm5-emulator`](https://github.com/raralabs/pm5-emulator) | — | Emulates a PM5 as a BLE GATT *server* (useful for testing clients without hardware). | Stale — last push 2023-08. 29 stars. Useful for CI/dev only. |
| [`droogmic/Py3Row`](https://github.com/droogmic/Py3Row) | Python | **USB (PyUSB), not Bluetooth.** Sends/receives raw CSAFE commands. The "Py3Row equivalent" the prompt asked about — but it's the USB sibling to the BLE spec, and its own README admits "may not function as advertised," incomplete docs, only tested on Arch Linux. | Effectively dormant — last push 2022-03. 56 stars. Good as a CSAFE-command reference/prior art, not as a dependency. |
| [`JeffG05/bluetooth-rower`](https://github.com/JeffG05/bluetooth-rower) | Swift/iOS | Native iOS app bridging PM5 BLE → Zwift-compatible FTMS/CSC. Not web-relevant but shows the "native wrapper" pattern iOS forces you into. | Stale — last push 2021-01. 5 stars. |

**Recommendation:** For a React PWA, **`ergarcade/pm5-base`** (freshest, dependency-free, explicit Web Bluetooth + Web HID + mock modes — the mock mode is great for developing the UI without a physical erg) or **`tijmenvangulik/ErgometerJS`** (most stars, broadest platform coverage if you ever want a companion Electron/Node tool) are the strongest starting points. Both are thin enough that many teams end up forking/vendoring rather than taking a hard dependency, given how small and stable the actual BLE surface is.

**Hand-rolled vs. CSAFE-over-BLE:** For the passive-monitor use case (distance, pace, stroke rate, elapsed time, summaries), essentially everyone — including all the libraries above — talks the **plain C2 Rowing Service characteristics (0x0031 etc.) directly**, not CSAFE. This is deliberate: Concept2 designed the Rowing Service specifically so mobile/web developers don't need a CSAFE parser at all for telemetry; CSAFE-over-BLE (via the 0x0021/0x0022 Control Service pair) is reserved for **command-and-control** — reading device config, heart-rate-belt pairing, and, notably, **programming workouts onto the erg** (see §5). If your app is purely a live dashboard, you can ignore CSAFE entirely and just parse Rowing Service byte arrays.

---

## 4. Alternative paths

- **Concept2 Logbook API** (`log.concept2.com/developers/documentation/`) — cloud REST API, **OAuth2** (Authorization Code, Refresh, Client Credentials, Password grants; app registration + Client ID/Secret required; scopes like `results:read`/`results:write`). Lets you pull/push **completed** workout results (distance, time, HR, calories, stroke-by-stroke data; bulk upload up to 250/request; CSV/FIT/TCX export). **Post-workout sync only — no live/streaming data.** No stated rate limit currently, but "abuse ... will result in rate limits or removal of access." Good complementary path if your app wants historical stats/leaderboards without needing BLE at all, but useless for a live in-workout display.
- **ANT+** — no standard web API exists; there is no browser equivalent of Web Bluetooth for ANT+ (no `navigator.ant` or similar), and the search turned up nothing indicating this has changed. ANT+ access from a browser would require a WebUSB-based ANT+ USB stick driver (non-trivial, niche, and PM5's ANT+ support is oriented at ANT+ head units/watches, not browsers). Effectively **dead for a web app** — don't pursue.
- **WASP** (npe-inc.com) — a commercial BLE/ANT+-to-WiFi bridge box mentioned on Concept2's own developer page; turns the erg's wireless output into a network-reachable stream, sidestepping BLE entirely (and thus sidestepping the iOS Web Bluetooth gap) at the cost of extra hardware per erg. Worth knowing about if gym-wide/multi-erg deployment with iOS users is a hard requirement.
- **RasPiRowing** — Raspberry Pi-based integration also referenced on Concept2's developer page; relevant only if you want a fixed on-erg companion device rather than the user's own phone browser.
- **PM5 USB Host / serial (CSAFE over USB)** — the PM5 also has a USB port and can be driven by CSAFE over serial (this is what Py3Row and the legacy Concept2 Windows/Mac SDKs use). In a browser this maps to **Web HID or Web Serial** instead of Web Bluetooth — same browser-support ceiling (Chromium-only, no iOS Safari), but could be a fallback for laptop/desktop users who plug in.

---

## 5. Programming workouts onto the PM5 via BLE (so the erg counts down itself)

**Yes, possible — via CSAFE frames sent over the Control Service (0x0021 write / 0x0022 read/notify), not via the Rowing Service.** Source: `Concept2 PM CSAFE Communication Definition` (Rev 0.27) — the companion "Related Document" cited by the BLE spec.

### How it works
1. The PM's CSAFE stack is a state machine (Ready → Idle → HaveID → InUse → Finished, etc., defined by the public CSAFE spec). You drive state transitions with public short commands like `CSAFE_GOIDLE_CMD` (0x82), `CSAFE_GOHAVEID_CMD` (0x83), `CSAFE_GOINUSE_CMD` (0x85), `CSAFE_GOFINISHED_CMD` (0x86).
2. To configure a workout goal you send goal-setting commands such as `CSAFE_SETHORIZONTAL_CMD` (0x21, sets a distance goal, 100m–50,000m historically, since extended to 1,000,000m on newer firmware) or `CSAFE_SETTWORK_CMD` (time goal, 0:20–9:59:59), then commit with `CSAFE_SETPROGRAM_CMD` (0x24) — this is the "public CSAFE" path, portable across PM3/4/5.
3. Concept2 also exposes a **proprietary shortcut**, `CSAFE_PM_CONFIGURE_WORKOUT` (0x14), which wraps multiple parameters (interval type via `CSAFE_PM_SET_INTERVALTYPE` 0x17, interval count via `CSAFE_PM_SET_WORKOUTINTERVALCOUNT` 0x18, split duration via `CSAFE_PM_SET_SPLITDURATION` 0x05, rest duration, target watts/pace, etc.) into fewer round trips than pure public CSAFE — this is the path most third-party PM5 apps (ErgData included) actually use for anything beyond a single JustRow goal.
4. Non-PM-specific "wrapper" commands like `CSAFE_SETUSERCFG1_CMD` (0x1A) bundle several proprietary sub-commands into one CSAFE frame, reducing BLE round-trips (each BLE write/notify round trip costs a connection interval or more — meaningful given the 100ms–1s cadence discussed in §1).
5. Every command has documented min/max limits (Table 18/19 in the CSAFE spec) — e.g. distance goal 100m–1,000,000m (firmware-dependent), split duration bounded so total splits ≤ 30 (PM3/4) or ≤ 50 (PM5); violating a limit gets the whole configuration rejected with a `PrevReject` frame status, requiring a `CSAFE_PM_GET_ERRORVALUE`-style follow-up to diagnose.
6. Once configured you transition the PM to `INUSE` (`CSAFE_GOINUSE_CMD`) and the erg's own screen shows and counts down the programmed workout exactly as if the user had keyed it in on the front panel — your app can then just passively watch the Rowing Service characteristics (§1) for live progress, and read the End-of-Workout Summary characteristics (0x39/0x3A/0x3C) at completion.

### Difficulty vs. passive monitoring
Meaningfully harder, but not a different order of magnitude:
- **Passive monitoring** = subscribe to 2–3 notify characteristics, parse fixed byte layouts. A day or two of work including UI.
- **Workout programming** = implement a CSAFE frame encoder/decoder (length-prefixed command byte, status/PrevReject response parsing, the wrapper-command nesting for `SETUSERCFG1`), drive an explicit state machine with timeouts (HaveID→Idle timeout 10s, InUse-inactivity→Paused 6s, Paused→Finished 220s — miss these and the PM bails out from under you), and handle validation-limit edge cases per Table 18/19. Realistically another 3–5 days of focused work plus real-hardware testing, since the CSAFE examples in the spec are given as sequence diagrams (images) rather than copy-pasteable byte tables for every scenario — you'll be cross-referencing the command tables and reverse-engineering a couple of the multi-step sequences (e.g. the exact SETUSERCFG1-wrapped `CONFIGURE_WORKOUT` → `SETSPLITDURATION` → `SETPROGRAM` ordering) against forum threads and existing OSS implementations (ErgometerJS and Py3Row both implement "set workout" flows worth reading as reference, even though Py3Row's is over USB not BLE — the CSAFE payloads are identical, only the transport differs).
- No additional BLE permission/pairing burden versus passive monitoring — same Control Service characteristics are available the moment you connect, no extra authentication step.

---

## Sources

- [Concept2 Software Development landing page](https://www.concept2.com/support/software-development)
- [Concept2 PM Bluetooth Smart Communication Interface Definition (PDF, Rev 1.30)](http://www.concept2.co.in/files/pdf/us/monitors/PM5_BluetoothSmartInterfaceDefinition.pdf)
- [Concept2 Performance Monitor CSAFE Communication Definition (PDF, Rev 0.27)](http://www.concept2.co.in/files/pdf/us/monitors/PM5_CSAFECommunicationDefinition.pdf)
- [Concept2 PM CSAFE Communication Definition PDF, alternate current hosting](https://cms.concept2.com/sites/default/files/2026-03/Concept2%20PM%20CSAFE%20Communication%20Definition.pdf)
- [caniuse.com — Web Bluetooth](https://caniuse.com/web-bluetooth)
- [MDN — Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [WebBluetoothCG/web-bluetooth implementation-status.md](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)
- [Google Chrome Community — Web Bluetooth on iOS](https://support.google.com/chrome/thread/33293081/use-web-bluetooth-api-with-google-chrome-on-ios?hl=en)
- [Bluefy – Web BLE Browser (App Store)](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)
- [ergarcade/pm5-base (GitHub)](https://github.com/ergarcade/pm5-base)
- [ergarcade/pm5-base live demo](https://ergarcade.github.io/pm5-base/)
- [ergarcade/pm5-detail (GitHub)](https://github.com/ergarcade/pm5-detail)
- [GoogleChromeLabs/rowing-monitor (GitHub)](https://github.com/GoogleChromeLabs/rowing-monitor)
- [tijmenvangulik/ErgometerJS (GitHub)](https://github.com/tijmenvangulik/ErgometerJS)
- [raralabs/pm5-emulator (GitHub)](https://github.com/raralabs/pm5-emulator)
- [droogmic/Py3Row (GitHub)](https://github.com/droogmic/Py3Row)
- [JeffG05/bluetooth-rower (GitHub)](https://github.com/JeffG05/bluetooth-rower)
- [Fitness Tracking with Web Bluetooth (bandarra.me)](https://bandarra.me/2017/02/20/Fitness-Tracking-with-Web-Bluetooth/)
- [Concept2 Logbook API developer documentation](https://log.concept2.com/developers/documentation/)
- [Concept2 Logbook Help Pages](https://log.concept2.com/help)
- [OpenRowingCommunity/c2logbook — Dart wrapper for Logbook API](https://github.com/OpenRowingCommunity/c2logbook)
- [Concept2 Forum — Bluetooth Implementation](https://c2forum.com/viewtopic.php?t=94488)
- [Concept2 Forum — PM5 and Bluetooth Smart](https://www.c2forum.com/viewtopic.php?t=96042)
- [Concept2 Forum — CSAFE + BLE Characteristic](https://c2forum.com/viewtopic.php?f=15&t=93321)
- [Concept2 Forum — Proper CSAFE sequence for initiating a fixed time workout](https://www.c2forum.com/viewtopic.php?t=5497)
- [Concept2 Forum — Configuring a Programmed Workout via API](https://c2forum.com/viewtopic.php?t=200049)
- [Concept2 Forum — REST API available?](https://www.c2forum.com/viewtopic.php?t=195121)
