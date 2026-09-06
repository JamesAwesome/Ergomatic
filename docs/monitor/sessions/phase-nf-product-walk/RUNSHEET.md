# NF-PRODUCT-v1 — Scan NFC product walk (v1 · 2026-09-06 · awaiting PM readiness PASS)

**Status:** DRAFT. Not a ready runsheet. Requires (1) the product PR's
automated gates green on the required tree, (2) the signed device build
verified (entitlement + usage description, Task 11 step 1 of the plan),
(3) a `product-manager` readiness PASS attached to THIS versioned runsheet,
and (4) James's separate agreement and **go**. Every phone install needs
its own explicit permission. The Flipper comes (standing rule, 2026-09-05).
No clock runs until James says go.

## Purpose (one line)

Prove, on James's iPhone and PM5, that the SHIPPED Scan NFC route reads the
real tag, connects to exactly that PM5 without a picker, programs the
workout to `armed`, and that every terminal path the spec names returns
safely — the ten legs of the design spec's "Native hardware walk".

## Primary evidence target

Leg 3: a valid tag → `✓ PM5 found` → connect → program → READY (`armed`
verified) → first pull → terminal logging, on the product build. Legs 1, 2,
4-6 and 10 decide the ship call; 7-9 are stress legs run only inside the cap.

## Build identity (v1, 2026-09-06)

- Branch and head SHA: `codex/phase-nf-nfc-design` @ `9bd11520`, merged
  with `origin/main` at `2a6ba780`. The walk uses the PR head at the time
  of the go; a later head re-runs this section.
- Build: `cd app && pnpm exec vite build && npx cap sync ios` (no tracked
  change; measured 2026-09-06), then
  `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath <scratch> -allowProvisioningUpdates build`
  → `BUILD SUCCEEDED`. NOT `pnpm ios:build`, which rewrites tracked version
  stamps from the tag.
- Verified on the built `.app` (2026-09-06, `codesign -d --entitlements :-`
  and `plutil -p Info.plist`): `com.apple.developer.nfc.readersession.formats = [TAG]`,
  `application-identifier = QYA37BHP3N.haus.waffle.ergomatic`,
  `NFCReaderUsageDescription = "Scan a PM5 to connect and program your workout."`,
  `TeamIdentifier=QYA37BHP3N`.
- **Identity hazard, and the rule it produces:** the tree stamps
  `CFBundleShortVersionString 0.23.0` / `CFBundleVersion 789` — the SAME
  identity as the retired Gate -1 diagnostic build that was installed on
  the phone (`ZERO-SCAN-SETUP-V3-RESULT.md`). An installed-app check keyed
  on version would not tell them apart. **The walk build sets a distinct
  `CURRENT_PROJECT_VERSION` (e.g. `9001`) for the walk only** (a
  `-derivedDataPath` build with `CURRENT_PROJECT_VERSION=9001` on the
  xcodebuild line; the tracked pbxproj is never committed with it), and
  the install receipt records `0.23.0/9001`. Anything reporting `/789` is
  the OLD probe and the walk stops.
- Install: ONE install, with James's explicit permission for that install,
  recorded with `xcrun devicectl device info apps` as provenance. **Recheck
  identity before assuming it is installed** — TestFlight builds replace
  local installs.

## Readiness state (James confirms each before go)

- Phone unlocked, screen awake for the whole cap (Auto-Lock: Never, or the
  keep-awake control), wired to the Mac if capture is wanted.
- PM5 on, on **Connect Device** for legs 3, 8; off Connect Device for leg 4.
- Flipper in hand with `C2_pm5_rebuilt.nfc` loaded (control tag for a
  no-tag ending: on any Core NFC 201, read the CONTROL tag first).
- Ergomatic signed in; baselines set; the walk workout imported (below).

## Operator cap and budget

- TOTAL operator wall-clock cap: **25 minutes** from go, installs and
  captures included. At the cap: STOP, preserve evidence, release James.
- Rowing: **one pull** (leg 3), then END. No piece is rowed to completion.
- Reader starts: at most 10 (one per leg plus one pre-approved retry for
  leg 3 only). Consent is consumed by reader starts, not the clock.
- Captures: one photo (leg 3: phone READY beside the PM5 showing the
  program), taken between legs, never mid-leg.

## The walk workout

Import via bulk (paste-tested against the grammar in `e2e/connected.spec.ts`'s
`BULK_TEXT`):

```
NFC Walk | AN | easy | 1
w 250m max @22
w 250m max
```

## Legs (numbered; one instruction at a time, then STOP)

| # | Leg | James does | Observable (pass) | Fail / inconclusive |
| --- | --- | --- | --- | --- |
| 1 | Button present | Open the walk workout | `Scan NFC` above `Connect`, both 56 px | absent, or below Connect |
| 2 | Valid tag, no picker | Tap Scan NFC, hold phone to the PM5 logo | sheet → `✓ PM5 found` → no device list → CONNECTING with the exact PM5 name | a picker sheet; a wrong name |
| 3 | Program to armed, one pull | (continues from 2) then one pull | READY; PM5 shows the program; first frame live; END → log screen | never READY; wrong program |
| 4 | Not advertising | PM5 leaves Connect Device (Menu); tap Scan NFC | `Open Connect Device on this PM5, then try again.` card, **Try again** present, no picker; then PM5 → Connect Device, tap Try again → CONNECTING without a second NFC read | picker; generic copy |
| 5 | Unsupported tag | Tap Scan NFC, hold to the Flipper emulating a NON-PM5 NDEF text tag (Flipper: NTAG213 text demo) | `Unsupported NFC tag` inline; no BLE scan (no CONNECTING) | any interstitial |
| 6 | Cancel and timeout | Tap Scan NFC, tap the sheet's Cancel; then tap Scan NFC and hold nothing until the sheet times out | quiet return; then `No NFC tag detected. Try again.` inline; both buttons back | error on Cancel; sheet stuck |
| 7 | Rapid alternation | Scan NFC → Cancel → Connect → Cancel → Scan NFC (valid) | one session; READY once | two sessions, a stuck busy state |
| 8 | Held target | With the app connected (leg 3 state, or a fresh connect), tap Cancel back to detail, tap Scan NFC | `End this PM5's current connection, then try again.`; END/disconnect, Try again → CONNECTING | picker, or a connect to the held device |
| 9 | Background | Tap Scan NFC; press the side button (lock) while the sheet is up; unlock | quiet return, buttons back, no late interstitial | interstitial appears on resume |
| 10 | Manual Connect unchanged | Tap Connect | today's picker; same workout to READY | anything new |

Leg 9 is a stress leg; skip it if the cap is within 5 minutes.

## Evidence the controller gathers (James pastes nothing)

- The interstitial diagnostics export after leg 3 (the trace prefix) and
  after leg 4 — read via the diagnostics sheet's own export.
- The Xcode device console during legs 2-4 (`NFC_GATE_DIAGNOSTIC` lines are
  DEBUG-only and absent from a Release build; the product trace is what
  counts).
- One photo (leg 3). Redaction: no BLE `deviceId`, no tag UID, no address
  bytes in the committed record (`docs/monitor/nfc/README.md` rules).

## Abort conditions

Broken capture, a no-tag ending on the CONTROL tag (phone stack), an
install identity mismatch, or the cap. No live repair, rebuild, surprise leg
or "one more scan".

## Record

Results go to `docs/monitor/sessions/phase-nf-product-walk/RESULT.md`
(new), the spec's walk section, and the ROADMAP NF block.
