# NF-PRODUCT-v2 — Scan NFC product walk (v2 · 2026-09-06 · awaiting PM readiness PASS)

**Status:** DRAFT v2. v1 (ten legs, 25 min) was judged NOT READY by the
`product-manager` on 2026-09-06 (entry in `.claude/agents/pm-ledger.md`,
"Phase NF product walk readiness"); v2 is its cut: **five legs, three
blocks, ≤ 15 minutes, ≤ 6 reader starts**, every retired leg named with the
evidence that settles it instead (design spec, "Native hardware walk").
Requires (1) the product PR's automated gates green on the required tree,
(2) the signed device build verified (entitlement + usage description),
(3) a `product-manager` readiness PASS attached to THIS versioned runsheet,
and (4) James's separate agreement and **go**. Every phone install needs its
own explicit permission. The Flipper comes (standing rule, 2026-09-05). No
clock runs until James says go.

## Purpose (one line)

Prove, on James's iPhone and PM5, that the SHIPPED Scan NFC route reads the
real tag, connects to exactly that PM5 without a picker, programs the
workout to `armed`, and that the terminal paths only the erg can decide
return safely.

## Primary evidence target

Leg 1: a valid tag → success haptic → no picker → the exact PM5 name →
connect → program → READY (`armed` verified) → one pull → END → log screen,
on the product build.

## Build identity (v2, 2026-09-06)

- Branch: `codex/phase-nf-nfc-design`. **The walk uses the PR head at the
  time of the go**; this section is re-run against that head and its SHA
  written here before the invitation (v1 was verified at `9bd11520`, merged
  with `origin/main` at `2a6ba780`).
- Build: `cd app && pnpm exec vite build && npx cap sync ios` (no tracked
  change; measured 2026-09-06), then
  `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath <scratch> CURRENT_PROJECT_VERSION=9001 -allowProvisioningUpdates build`
  → `BUILD SUCCEEDED`. NOT `pnpm ios:build`, which rewrites tracked version
  stamps from the tag.
- **Debug is the right configuration, and it is the same product code.**
  Every `#if DEBUG` block in `app/patches/@capgo__capacitor-nfc@8.2.5.patch`
  is logging only (the `NFC_GATE_DIAGNOSTIC` sink and its tests) — no
  behaviour differs between Debug and Release (checked block by block at the
  PM readiness gate, 2026-09-06), so a criterion verified here is verified on
  the shipped code (RF24).
- Verified on the built `.app` (2026-09-06, `codesign -d --entitlements :-`
  and `plutil -p Info.plist`): `com.apple.developer.nfc.readersession.formats = [TAG]`,
  `application-identifier = QYA37BHP3N.haus.waffle.ergomatic`,
  `NFCReaderUsageDescription = "Scan a PM5 to connect and program your workout."`,
  `TeamIdentifier=QYA37BHP3N`.
- **Identity hazard, and the rule it produces:** the tree stamps
  `CFBundleShortVersionString 0.23.0` / `CFBundleVersion 789` — the SAME
  identity as the retired Gate -1 diagnostic build that was installed on
  the phone (`ZERO-SCAN-SETUP-V3-RESULT.md`). The walk build therefore sets
  `CURRENT_PROJECT_VERSION=9001` on the xcodebuild line (the tracked pbxproj
  is never committed with it) and the install receipt records
  `0.23.0/9001`. Anything reporting `/789` is the OLD probe and the walk
  stops.
- Install: ONE install, with James's explicit permission for that install,
  recorded with `xcrun devicectl device info apps` as provenance. **Recheck
  identity before assuming it is installed** — TestFlight builds replace
  local installs.

## Hard preconditions (the controller verifies each before the invitation)

- **Wired to the Mac, with a live console.** The app is launched by the
  controller with
  `xcrun devicectl device process launch --terminate-existing --console --device <id> haus.waffle.ergomatic`
  (the v8 method) and the console stream is the walk's evidence: the
  patched plugin's `NFC_GATE_DIAGNOSTIC` lines (native endings, attempt
  identity) and the WebView's forwarded console. Not optional: the abort
  condition below keys on a native ending code that reaches nobody through
  the UI (PM readiness gate B5).
- **Zero-scan desk dry run to green, immediately before the invitation**
  (the standing rule from `RECOVERY-WALK-V5-RESULT.md` and the
  `nfc-walk-realtime-prep` memory): identity check, console launch, WebView
  loaded, the walk workout visible with **Scan NFC** present. All three
  blocks below are pre-written before go and sent end-of-turn, so
  **go → present-tag has no host work between**.
- Phone unlocked, **screen awake for the whole cap** (Auto-Lock: Never, or
  the keep-awake control).
- PM5 on and on **Connect Device** for leg 1; leg 2 turns it off and back on.
- Flipper in hand with `C2_pm5_rebuilt.nfc` loaded (the CONTROL tag: on any
  no-tag ending, read the control tag first to name the layer).
- Ergomatic signed in; baselines set; the walk workout imported (below).

## Operator cap and budget

- TOTAL operator wall-clock cap: **15 minutes** from go, captures included.
  At the cap: STOP, preserve evidence, release James.
- Per-block estimates (INFERENCE from action counts and the v8 measured
  1:46 for one scan-and-connect; not measured): A ≈ 4 min, B ≈ 6 min,
  C ≈ 4 min. Sum 14.
- Physical interactions, counted: **28** (A: 6, B: 16, C: 6). Typing/paste
  by James: **0**.
- Rowing: **one pull** (leg 1), then END. No piece is rowed to completion.
- Reader starts: **at most 6** — leg 1: 1 (+1 pre-approved retry), leg 2: 1,
  leg 3: 2, leg 4: 1, leg 5: 0. Consent is consumed by reader starts, not
  the clock (2026-09-05 ruling); the budget IS the consent, and an exhausted
  budget ends the walk without a re-invitation.
- Captures: one photo (leg 1: phone READY beside the PM5 showing the
  program), taken between blocks, never mid-leg.

## The walk workout

Import via bulk (canonical Phase DE header; paste-tested against the
grammar in `e2e/connected.spec.ts`'s `BULK_TEXT`):

```
NFC Walk | AN | 3
w 250m max @22
w 250m max
```

## Legs, in three blocks (one block per turn, then STOP and wait)

| # | Block | Leg | James does | Observable (pass) | Fail / inconclusive |
| --- | --- | --- | --- | --- | --- |
| 1 | A | Primary target | Open the walk workout; tap **Scan NFC**; hold the phone to the PM5 logo; when READY shows, one pull; then END | **Scan NFC** present above **Connect**; the phone BUZZES on the read; no device list; CONNECTING with the exact PM5 name; READY; the PM5 shows the program; first frame live; END → log screen | a picker sheet; a wrong name; never READY; wrong program |
| 2 | B | Not advertising | PM5: Menu, leave Connect Device; tap **Scan NFC**, hold to the tag; read the card; PM5 back to Connect Device; tap **Try again** | `Open Connect Device on this PM5, then try again.` with **Try again**, no picker; Try again → CONNECTING with NO second NFC sheet | picker; generic copy; a second sheet |
| 3 | B | Re-arm (mandatory) | Cancel back to detail; **Scan NFC** → Cancel the sheet → **Connect** → cancel the picker → **Scan NFC**, hold to the tag; Cancel at READY | one session; READY once; every button back after each cancel | two sessions; a stuck busy state |
| 4 | C | Background during a live reader (bounded feasibility experiment) | Tap **Scan NFC**; press the side button while the sheet is up; unlock | quiet return, both buttons back, no late interstitial — OR a recorded "lock did not deliver pause" (the console says which) | interstitial appears on resume |
| 5 | C | Manual Connect unchanged | Tap **Connect**; pick the PM5; Cancel at READY | today's picker; the same workout to READY | anything new |

Retired legs and their substitute evidence are listed in the design spec's
"Native hardware walk" (former legs 1, 5, 6, 8).

## Evidence the controller gathers (James pastes nothing)

- The console capture (`devicectl --console`, retained by the controller):
  native ending lines for legs 1-4 and the WebView console. Redaction before
  commit: no BLE `deviceId`, no tag UID, no address bytes
  (`docs/monitor/nfc/README.md` rules).
- The app's own **View connection log** carries the attempt trace on the
  failure screen (the `nfc-attempt:` prefix; product export window landed
  2026-09-06). It is READ ON THE PHONE only if a leg fails, and photographed
  then; it is never copied or pasted.
- One photo (leg 1).

## Stop rules

- **The likely one first: the control tag reads and the PM5 tag is dark.**
  The spec's "PM5 NFC availability" section records two 60 s no-tag windows
  with no identified cause and forbids conditioning any rule on a PM5 power
  cycle. So: one no-tag ending on the PM5 → read the CONTROL tag → if the
  control tag reads, the walk is **INCONCLUSIVE on the PM5 tag** and James
  is released. No power cycle, no "one more scan".
- A no-tag ending on the CONTROL tag (phone stack): STOP.
- A `/789` identity, a dead console, or the cap: STOP.
- No live repair, rebuild, surprise leg or extra scan.

## Record

Results go to `docs/monitor/sessions/phase-nf-product-walk/RESULT.md`
(new), the spec's walk section, and the ROADMAP NF block.
