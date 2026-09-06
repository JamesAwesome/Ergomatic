# NF-PRODUCT-v3 — Scan NFC product walk (v3 · 2026-09-06 · awaiting PM readiness PASS)

**Status:** DRAFT v3. v1 (ten legs, 25 min) and v2 (the five-leg cut) were
both judged NOT READY by the `product-manager` on 2026-09-06 (entries in
`.claude/agents/pm-ledger.md`, "Phase NF product walk readiness"). v2's
shape stands — **five legs, three blocks, ≤ 15 minutes, ≤ 6 reader starts**,
every retired leg named with its substitute evidence (design spec, "Native
hardware walk") — and v3 fixes what v2's gate found by BUILDING and by
walking the state machine: the build identity rule was inert (the plist
holds a literal), the build reached no server (no `VITE_API_BASE`), leg 3
strands the operator on the failure screen, and leg 1's unsaved row would
have hijacked leg 2's first tap.
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
- Build, from `app/` — the SAME env `pnpm ios:build` supplies, minus its
  tag-derived version stamp (v2's gate found a hand-rolled line had dropped
  `VITE_API_BASE`, so the native build fetched relative to the WebView origin
  and could reach no library, workout or save):

  ```
  VITE_API_BASE=https://ergomatic.waffle.haus \
  VITE_GOOGLE_IOS_CLIENT_ID=$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist) \
  pnpm exec vite build && npx cap sync ios
  (cd ios/App && agvtool new-version -all 9001)
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
    -destination 'generic/platform=iOS' -derivedDataPath <scratch> \
    -allowProvisioningUpdates build
  git restore ios/App/App/Info.plist ios/App/App.xcodeproj/project.pbxproj
  git status --short   # must be empty: the 9001 stamp is never committed
  ```

  `VITE_GOOGLE_IOS_CLIENT_ID` is derived the way `ios:release` derives it;
  an empty value builds fine and leaves native Google sign-in silently dead
  (CLAUDE.md, "Commands"), which would strand the walk at sign-in.
  `agvtool` is the ONLY thing that reaches `CFBundleVersion`: `Info.plist`
  holds the literal `789`, so v2's `CURRENT_PROJECT_VERSION=9001` on the
  xcodebuild line produced an `.app` that still read `0.23.0/789` (built and
  read at the v2 gate). NOT `pnpm ios:build`, which stamps from the tag.
- **Debug is the right configuration, and it is the same product code.**
  All nine `#if DEBUG` blocks in `app/patches/@capgo__capacitor-nfc@8.2.5.patch`
  are logging only (the `NfcDiagnosticTrace` class, its property, seven
  emit calls) — no behavioural branch; checked block by block at the v2 PM
  readiness gate, 2026-09-06 — so a criterion verified here is verified on
  the shipped code (RF24).
- Verified on the built `.app` at the dry run, every time (`codesign -d
  --entitlements :-` and `plutil -p Info.plist` on the PRODUCED app, RF12):
  `CFBundleVersion = 9001` (the discriminator — v2's rule was inert and its
  stop condition fired on the correct build),
  `com.apple.developer.nfc.readersession.formats = [TAG]`,
  `application-identifier = QYA37BHP3N.haus.waffle.ergomatic`,
  `NFCReaderUsageDescription = "Scan a PM5 to connect and program your workout."`,
  `TeamIdentifier=QYA37BHP3N`.
- **Identity hazard, and the rule it produces:** the tree stamps
  `CFBundleShortVersionString 0.23.0` / `CFBundleVersion 789` — the SAME
  identity as the retired Gate -1 diagnostic build that was installed on
  the phone (`ZERO-SCAN-SETUP-V3-RESULT.md`). The walk build therefore
  stamps build `9001` with `agvtool` (restored before anything is
  committed) and the install receipt records `0.23.0/9001`, read off the
  produced `.app` AND off the phone. Anything reporting `/789` is the OLD
  probe and the walk stops.
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
  the keep-awake control). **System Haptics ON** (Settings → Sounds &
  Haptics), or the buzz observation cannot produce a NO.
- PM5 on and on **Connect Device** at the start of legs 1, 3 (its final
  scan) and 5; leg 2 turns it off and back on. **Whether a PM5 resumes
  advertising after a disconnect is not established anywhere in this repo
  (INFERENCE: it does not), so every connect is preceded by an explicit
  "PM5: Menu → Connect Device" step** rather than assumed.
- Flipper in hand with `C2_pm5_rebuilt.nfc` loaded (the CONTROL tag: on any
  no-tag ending, read the control tag first to name the layer).
- Ergomatic signed in; baselines set; the walk workout imported (below).

## Operator cap and budget

- TOTAL operator wall-clock cap: **15 minutes** from go, captures included.
  At the cap: STOP, preserve evidence, release James.
- Per-block estimates (INFERENCE from action counts and the v8 measured
  1:46 for one scan-and-connect; not measured): A ≈ 5 min, B ≈ 6 min,
  C ≈ 4 min. Sum 15, at the cap; the cap wins.
- Physical interactions, counted step by step from the table: **38**
  (A: 11, B: 21, C: 6). Typing/paste by James: **0**.
- Rowing: **one pull** (leg 1), then END. No piece is rowed to completion.
- Reader starts: **at most 6** — leg 1: 1 (+1 retry, scoped below), leg 2:
  1, leg 3: 2, leg 4: 1, leg 5: 0. A control-tag read is a seventh start and
  only ever the last thing the walk does. Consent is consumed by reader
  starts, not the clock (2026-09-05 ruling); the budget IS the consent, and
  an exhausted budget ends the walk without a re-invitation.
- **The one retry (leg 1) covers exactly one case:** James reports he did
  not get the phone to the logo before the sheet ended (his own miss). A
  no-tag ending on a PROPER hold is NOT retried — it goes straight to the
  control-tag stop rule below. Nothing else is re-scanned.
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
| 1 | A | Primary target | Library → the walk workout (2); tap **Scan NFC** (1); hold the phone to the PM5 logo (1); when READY shows, one pull (1); tap END, then TAP AGAIN (2); on the summary tap **Save** (1); on the Log screen tap **Save** (1) → Today; Library → the walk workout again (2) | **Scan NFC** above **Connect**; NO device list; the header reads CONNECTING and then the exact PM5 name (a sequence, not one state); READY; the PM5 shows the program; first frame live; END → summary → Log → Today. The buzz is a SUPPORTING signal only (iOS gives its own feedback on a tag read, INFERENCE); the discriminator is picker-free + the exact name | a picker sheet; a wrong name; `Unsupported NFC tag` (named STOP: the parser has never met the real tag on the product path); never READY; wrong program |
| 2 | B | Not advertising | PM5: Menu, leave Connect Device (2); tap **Scan NFC** (1), hold to the tag (1); read the card; PM5: Menu → Connect Device (2); tap **Try again** (1); at READY tap **Cancel** (1) → detail | `Open Connect Device on this PM5, then try again.` with **Try again**, no picker; Try again → CONNECTING with NO second NFC sheet → READY | picker; generic copy; a second sheet |
| 3 | B | Re-arm (mandatory) | PM5: Menu → Connect Device (2); **Scan NFC** (1) → Cancel the sheet (1) → **Connect** (1) → cancel the picker (1) → the interstitial's failure screen shows: tap **Cancel** (1) → detail → PM5: Menu → Connect Device (2) → **Scan NFC** (1), hold to the tag (1); at READY tap **Cancel** (1) | one session; READY once; every button back after each cancel; the picker cancel lands on the failure screen (Try again / Row on the phone timer / Cancel), never on a stuck screen | two sessions; a stuck busy state; Scan NFC missing after a cancel |
| 4 | C | Background during a live reader (bounded feasibility experiment) | Tap **Scan NFC** (1); press the side button while the sheet is up (1); unlock (1) | quiet return, both buttons back, no late interstitial — OR a recorded "lock did not deliver pause". The console discriminates NATIVELY: a `pause`-driven abort calls `stopScanning({attemptId})`, which the patch records as a forced ending with a cause; a Core NFC-driven ending carries its own code and no cause. (There is no `console.*` in the JS NFC path; the WebView console carries nothing from the trace.) | interstitial appears on resume |
| 5 | C | Manual Connect unchanged | PM5: Menu → Connect Device (2); tap **Connect** (1); pick the PM5 (1); at READY tap **Cancel** (1) | today's picker; the same workout to READY | anything new |

State residue, walked leg by leg: leg 1 SAVES its log before block B, so no
unretired `MonitorRun` remains and leg 2's first tap opens no unsaved-workout
panel (v2 would have let "Connect anyway" retire leg 1's row at leg 2's
`armed`). Legs 2-5 reach READY and Cancel before any pull, so they leave no
run to save. Every Cancel from READY returns to workout detail with both
hardware buttons rendered.

Retired legs and their substitute evidence are listed in the design spec's
"Native hardware walk" (former legs 1, 5, 6, 8).

## Evidence the controller gathers (James pastes nothing)

- The console capture (`devicectl --console`, retained by the controller):
  native ending lines for legs 1-4 and the WebView console. Redaction before
  commit: no BLE `deviceId`, no tag UID, no address bytes
  (`docs/monitor/nfc/README.md` rules).
- The app's own **View connection log** carries the attempt trace on the
  failure screen (the `nfc-attempt:` prefix; product export window landed
  2026-09-06) — the ONLY place the JS trace kinds (`parser-accepted`,
  `parser-rejected`, `ble-scan-matched`) are visible on a product build. It
  is READ ON THE PHONE only if a leg fails, and photographed then; it is
  never copied or pasted.
- One photo (leg 1).

## Stop rules

- **The likely one first: the control tag reads and the PM5 tag is dark.**
  The spec's "PM5 NFC availability" section records two 60 s no-tag windows
  with no identified cause and forbids conditioning any rule on a PM5 power
  cycle. So: one no-tag ending on the PM5 → read the CONTROL tag → if the
  control tag reads, the walk is **INCONCLUSIVE on the PM5 tag** and James
  is released. No power cycle, no "one more scan".
- A no-tag ending on the CONTROL tag (phone stack): STOP.
- `Unsupported NFC tag` on the real PM5 tag (leg 1): STOP, photograph View
  connection log (`parser-rejected` is the line that matters).
- A `/789` identity, a dead console, or the cap: STOP.
- No live repair, rebuild, surprise leg or extra scan.

## Record

Results go to `docs/monitor/sessions/phase-nf-product-walk/RESULT.md`
(new), the spec's walk section, and the ROADMAP NF block.
