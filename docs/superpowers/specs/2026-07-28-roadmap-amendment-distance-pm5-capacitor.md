# Roadmap Amendment: Distance Steps, PM5, and the Capacitor iOS Shell — Design

Approved in conversation 2026-07-27/28, before Phase 3 began. Amends ROADMAP.md.

## Decisions

| Question | Decision |
|---|---|
| Distance-based workouts (e.g. `2500m at 2k-4, 5' rest, ×5`) | **Core domain requirement, not a feature**: work steps are `{kind:'time'}` OR `{kind:'distance'}` from the domain engine's first commit. Retrofit rejected (schema migration + timer rework later violates expand-only economics) |
| Tracking without hardware | **Manual mode is a first-class citizen forever**: distance phases show meters + count-up stopwatch + "NEXT →"; elapsed time yields a real average split with zero hardware (`actualSource:'stopwatch'`) |
| PM5 integration scope (v1) | Read-only live monitor: pace/rate/distance in the timer, auto-advance distance steps, per-step actual splits (`actualSource:'pm5'`). No writing to the PM5 (CSAFE programming = triggered follow-on) |
| Device landscape | Household rows with iPhone/iPad AND Android. Web Bluetooth is Chromium-only (iOS WebKit: never). Therefore: capability-gated everywhere, nothing requires a PM5 |
| Native iOS path | **Capacitor, promoted to Phase 3 (next)** at James's direction — research scored it 91:63 over React Native (full web-UI reuse; `@capacitor-community/bluetooth-le` mirrors Web Bluetooth so the transport seam gets a native transport nearly free; solo-dev economics). React Native rejected: full UI rewrite, permanent dual maintenance |
| Distribution | Internal TestFlight (no App Review, 90-day re-upload cadence). App Store optional later |
| Apple sign-in | **Triggered follow-on, not scheduled**: mandatory only for external TestFlight / App Store (guideline 4.8). Compatible with the openid-client stack; private-relay-email vs allowlist needs design when triggered |
| Apple Health | Triggered follow-on (needs the native shell; entitlements; plugin re-verified at build time) |

Research inputs (committed alongside):
- `docs/superpowers/research/2026-07-27-pm5-ble-research.md`
- `docs/superpowers/research/2026-07-27-capacitor-vs-react-native.md`

## Resulting phase structure

0–2 done. **3: iOS shell (Capacitor)** → **4: Domain engine & schema** (+distance axis, +actuals fields) → **5: Library & baselines** (+meters in builder) → **6: Session flow** (+manual NEXT/stopwatch splits) → **7: PM5 over Bluetooth** (one client, three transports: Web Bluetooth / Capacitor BLE / mock) → 8: Plan & Progress → 9: Preferences → 10: Multi-rower & polish → Triggered follow-ons.

## Design highlights (binding on the affected phases)

### Distance steps (Phases 4–6)
- Step model: `{kind:'time', minutes}` | `{kind:'distance', meters}`; pace ref/SPM/rest identical across kinds. Pace resolution unchanged.
- Displayed duration for distance steps = estimate from resolved target pace, labeled as estimate; keeps Library durations and the time-cap suggestion filter working.
- Builder + bulk import take explicit units (`10'` vs `2500m`).
- Log schema from day one: per-step `{targetSplit, actualSplit?, actualSource: 'assumed'|'stopwatch'|'pm5'}`.

### PM5 (Phase 7)
- `pm5/` client (adapted from `ergarcade/pm5-base`, MIT) behind a transport interface; C2 Rowing Service subscribe-only, no pairing, no CSAFE.
- Transports: Web Bluetooth (Chromium), Capacitor BLE (iOS shell), mock (CI). Connect button renders only where a transport exists.
- Disconnect degrades silently to manual mode; manual NEXT is always present.
- Exit gate includes a live-hardware verification AND a mid-workout disconnect drill.

### Capacitor shell (Phase 3)
- Bundled local assets (never remote-URL mode — App Store 4.2 risk and cookie chaos).
- Auth: system-browser Google flow → `serverAuthCode` → new Express exchange endpoint → opaque bearer token (same hashed `sessions` row) in iOS Keychain. Web cookie flow untouched.
- `requireUser` accepts cookie OR bearer; bearer requests bypass the Origin check (no ambient credential → no CSRF surface).
- Keep-awake during the live timer (WKWebView suspends JS when locked; same pattern as Concept2's ErgData).
- Constraint accepted: no background BLE/screen-locked capture in the shell — that would demand custom Swift and is out of scope indefinitely.

## Out of scope

Apple sign-in, HealthKit, CSAFE programming, Logbook sync (all listed as triggered follow-ons in ROADMAP.md with explicit triggers).
