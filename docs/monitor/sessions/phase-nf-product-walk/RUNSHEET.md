# NF-PRODUCT-v8 — Scan NFC product walk (v8 · 2026-09-06 · hardened as a TIMED PROTOCOL, both lenses; v7 PM gate: one record clause, fixed here; awaiting the PM delta PASS)

**Status:** v8 — v5 had the PM readiness PASS (2026-09-06); James then asked
for the walk to be hardened as a TIMED PROTOCOL ("minimal gaps between human
actions so the phone screen and PM5 don't time out; and I'm not holding my
phone up forever without understanding why"). `/harden` lens 1 (antagonist,
timed-protocol lens; ledger entry "Phase NF product walk, timed-protocol
lens") produced the TIMER TABLE, the per-hold instructions, the block re-cut
(leg 2 joins block A so no leg's premise rides on a controller gap), the
controller-turn cap, and one correction of fact: a side-button lock during a
live reader is vendor-documented to end it with code 202
(`SessionTerminatedUnexpectedly`), which the app renders as `NFC scan
stopped. Try again.` — so leg 4 now has a real discriminator (200 vs 202 on
the console) and a three-way outcome. Lens 2 (an operator read, step by
step from James's seat) then rewrote every instruction in SCREEN TEXT,
drafted the three blocks he will actually receive (below, "Operator
blocks"), templated the reports, scoped the no-tag stop rule to a real hold,
priced every step (≈ 8 min, worst ≈ 9:30, against the 15 min cap), and found
the `Unsupported NFC tag` evidence line unreachable on a product build, the
control-tag read's own consequences undescribed, and the PM5 menu path
wrong by one press. v7's PM gate (sixth) found one blocker, in the RECORD
not the actions: leg 4 wrote 200/202 as a bijection, and only the 202 half
holds — our invalidate cannot produce 202, so 202 ⇒ iOS ended it; but a 200
has more than one producer (the phase's own `BACKGROUND-OBSERVATIONS.md`
records a Cancel-200 arriving BEFORE a delivered pause, from a gesture whose
cause was never identified), so a 200 attributes nothing. v8 fixes that
clause, gives block A step 4 a ceiling and a then-what, closes the
save-failure branch in block A, states the interaction count as a range,
and re-tags timer row 2.
v1 (ten legs, 25 min), v2 (the five-leg cut), v3 and v4 were each judged NOT
READY the same day (five entries in `.claude/agents/pm-ledger.md`, "Phase NF
product walk readiness"). v5 answers v4's three: the summary's save label depends on
whether James has an ACTIVE PLAN (both labels named; `Log against plan` is
forbidden — it would write the walk's row into his real plan); leg 4 has
NO discriminator between "iOS ended the reader" and "our pause-abort ended
it" (the phase's own receipt shows iOS invalidating before pause is
delivered, and both produce the identical Cancel-200 line), so the leg is
stated as what it buys; and leg 2's NO-condition assumed that leaving
Connect Device STOPS advertising, which nothing in this repo establishes —
now tagged INFERENCE with an inconclusive branch. v2's shape stands — **five legs, three blocks, ≤ 15 minutes,
≤ 6 reader starts**, every retired leg named with its substitute evidence
(design spec, "Native hardware walk"). v3 fixed the build (agvtool stamp,
`ios:build`'s env) and the state-machine breaks; v4 fixes what v3's fixes
introduced: leg 1 prescribed a Save on a screen that does not exist (END →
ONE summary → Save → Today), leg 4 named a diagnostic field the emitter
never writes, the interaction recount did not reconcile with its own table
(now extracted mechanically), and the one photo was specified at a state
that exists only mid-leg.
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
- Build — run by the CONTROLLER (bash), never handed to James, in the
  WORKTREE's app directory, absolute:
  `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design/app`
  (the v2 gate's build ran in the MAIN checkout and left its stamp there;
  `git restore` and `git status` are checkout-scoped and pass in the wrong
  tree while cleaning nothing). The SAME env `pnpm ios:build` supplies, minus
  its tag-derived version stamp (v2's gate found a hand-rolled line had
  dropped `VITE_API_BASE`, so the native build fetched relative to the
  WebView origin and could reach no library, workout or save — and leg 1's
  Save is a real `POST /api/logs`):

  ```bash
  cd /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design/app
  VITE_API_BASE=https://ergomatic.waffle.haus \
  VITE_GOOGLE_IOS_CLIENT_ID=$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist) \
  pnpm exec vite build && npx cap sync ios
  cd ios/App; agvtool new-version -all 9001; cd ../..
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
    -destination 'generic/platform=iOS' -derivedDataPath <scratch> \
    -allowProvisioningUpdates build
  git restore ios/App/App/Info.plist ios/App/App.xcodeproj/project.pbxproj
  git status --short   # must be empty; if not, the file to look at is
                       # ios/App/CapApp-SPM/Package.swift (cap sync rewrites it)
  xcrun devicectl device install app --device <id> <scratch>/Build/Products/Debug-iphoneos/App.app
  xcrun devicectl device info apps --device <id> --json-output <scratch>/installed-apps.json
  # the retained provenance (the phase's own precedent, RECOVERY-COMMAND-CARD.md);
  # the walk record quotes the haus.waffle.ergomatic entry's version + build from it
  ```

  **Paste-tested 2026-09-06 (harden, phase 0):** the block above, run
  verbatim in the worktree app dir, exited 0 in one pass; the produced
  `App.app` read `CFBundleShortVersionString 0.23.0`, `CFBundleVersion
  9001`, the exact `NFCReaderUsageDescription`, entitlement
  `com.apple.developer.nfc.readersession.formats = [TAG]`,
  `QYA37BHP3N`; `git status` after the two restores was EMPTY
  (`Package.swift` unchanged by `cap sync`). The install lines were not run
  (no install without James's permission).
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

- **Wired to the Mac, with a live console, with an explicit timeout.** The
  app is launched by the controller with
  `xcrun devicectl device process launch --terminate-existing --console -t 1200 --device <id> haus.waffle.ergomatic`
  (the v8 method; `-t 1200` because `--help` documents "the overall command
  timeout in seconds" with NO stated default, and the walk's only evidence
  channel must not die silently at minute five). The console stream is the
  walk's evidence: the patched plugin's `NFC_GATE_DIAGNOSTIC` lines (native
  endings with their raw `code`, attempt identity) and the WebView's
  forwarded console. **At every block boundary the controller confirms the
  console is still streaming** (the launch process is alive:
  `xcrun devicectl device info processes --device <id>` names the PID) before
  sending the next block; a dead console is a STOP, and this is how it is
  detected.
- **Zero-scan desk dry run to green, immediately before the invitation**
  (the standing rule from `RECOVERY-WALK-V5-RESULT.md` and the
  `nfc-walk-realtime-prep` memory): identity check (`0.23.0/9001` off the
  phone), console launch, WebView loaded, the walk workout visible with
  **Scan NFC** present, the plan-state label confirmed (`Save without
  logging`). All three blocks below are pre-written before go and sent
  end-of-turn, so **go → present-tag has no host work between**.
- **Auto-Lock: Never** (Settings → Display & Brightness), shown to the
  controller at the dry run, not reported. There is NO operator keep-awake
  control in the app: `keepAwakeOn` runs only while the connecting
  interstitial, Countdown, Timer or Just Row is mounted, and none of the
  screens this walk WAITS on (workout detail, the NFC sheet, Today, the
  summary) is one of them. v5's phone locked on exactly such a screen
  (`RECOVERY-WALK-V5-RESULT.md`).
- **Focus / Do Not Disturb ON.** An incoming call backgrounds the app, which
  aborts a live attempt (the `pause` event) and, mid-reader, produces leg 4's
  code-202 ending on a leg that is not leg 4.
- **System Haptics ON** (Settings → Sounds & Haptics), or the buzz cannot
  produce a NO.
- **PM5 state per leg is re-established, never assumed.** Leg 1 starts on
  **Connect Device**. Every later connect is preceded by an explicit "PM5:
  Menu → Connect Device" step, which is also a WAKE: a woken PM5 "stays awake
  for a few minutes with no rower input" (`pm5-interface-notes.md`,
  unmeasured), and whether it resumes advertising after a disconnect is
  established nowhere in this repo (INFERENCE: it does not).
- Flipper in hand with `C2_pm5_rebuilt.nfc` loaded (the CONTROL tag: on a
  no-tag ending from a REAL hold, read the control tag first to name the
  layer). **The control tag is a rebuild of the real tag, so the app ACCEPTS
  it and runs the targeted BLE scan for the real PM5's name**: James will
  see `Choosing your monitor` for 10-20 s and then either the not-advertising
  card or, if the PM5 is on Connect Device, a full connect. The Flipper block
  (sent only on that turn) says: the sheet closing is the whole result;
  whatever follows, wait for a button and tap Cancel.
- **A second camera** (the photo's subject is the phone).
- **The dry run leaves the phone ON the walk workout's detail screen** with
  Scan NFC present; block A starts there (no re-navigation).
- Ergomatic signed in; baselines set (a state, not a screen: `/you/baselines`
  since #315; the walk workout's `max` refs need none, but leg 5's manual
  Connect path is unchanged and expects them); the walk workout imported
  (below).
- **Plan state: ACTIVE (James, 2026-09-06).** So leg 1's summary shows
  `Log against plan · SESSION n OF N` as the LEAD button and
  `Save without logging` beneath it — the walk taps **Save without
  logging**, and `Log against plan` is FORBIDDEN: tapping it advances his
  real plan by one session with a 2 × 250 m test row. **The walk never
  writes to his plan; that is a stop rule, not a preference.** (With no
  plan the button would read `Save`; the dry run re-confirms the label.)

## The timer table (every clock the walk depends on)

D = the machine documents it; H = inferred. Sources in the antagonist ledger
entry "Phase NF product walk, timed-protocol lens, 2026-09-06".

| # | Clock | Value | Starts | Cleared by | Can a walk gap expire it? | D/H |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Core NFC reader sheet | **60 s** hard limit → code 201 `SessionTimeout` | each **Scan NFC** tap | tag read + our stop; Cancel; backgrounding | It IS the hold budget; the only clock James can watch | D (`NFCNDEFReaderSession.h`) |
| 2 | One reader session per system | state (the header documents the CONDITION, no grace period) | any live sheet | that sheet's ending | A tap while the previous session is still ending → code 203 `SystemIsBusy` → `NFC scan stopped. Try again.`; "count to three" is a conservative rule, not a documented value | D for the condition, H for the 3 s |
| 3 | Backgrounding ends the reader | immediate | lock, call, swipe | — | Leg 4 stages it on purpose → code **202** | D |
| 4 | Phone auto-lock | Never (precondition) | idle screen | any touch | The clock that killed the v5 recovery walk; no app protection on detail | H (unreadable from the host) |
| 5 | App keep-awake | while the interstitial/Countdown/Timer/JustRow is mounted | mount | unmount | Covers NO screen this walk waits on | D |
| 6 | PM5 awake/advertising after a wake | "a few minutes", unmeasured | any button or stroke | rower input | Yes: the controller gap (row 16) | H (`pm5-interface-notes.md`) |
| 7 | Targeted BLE scan deadline | **10 s**, armed at entry | Scan NFC's read completing | first exact-name match | Leg 2's expected path | D (`capacitorBle.ts`) |
| 8 | Collision window | **1 s** on every successful NFC connect | first match | second distinct match → ambiguous | always paid | D |
| 9 | `stopLEScan()` cleanup bound | a second **10 s** after settle | every settle | stop resolves | Leg 2's card can arrive at **20 s**, not 10 | D |
| 10 | GATT connect | **10 s** | `connect` | resolves | only on failure | D (plugin source) |
| 11 | Manual picker | plugin scan 30 s, outer 35 s | **Connect** | pick or cancel | legs 3, 5 cancel early | D |
| 12 | NFC capability probe | **2 s** per uncached detail mount; a miss renders NO Scan NFC | detail mount | a success caches for the process | any mount that misses the cache | D (`WorkoutDetail.tsx`) |
| 13 | `END` → `TAP AGAIN` | **4 s** | first END tap | second tap, expiry, or focus leaving the control | Leg 1: a pause between the two taps disarms it (a glance alone does not) | D (`useStagedDiscard.ts`) |
| 14 | READY (armed) | no timer on either machine | — | — | Safe to sit on | D |
| 15 | `devicectl --console` | `-t 1200` (explicit; default undocumented) | launch | app exit | with `-t` it outlives the cap | D (`--help`) |
| 16 | **The controller turn** | **≤ 90 s**, told to James | his last action of a block | the next block arriving | Drives rows 4 and 6; the only clock that had no number | — |

## Operator cap and budget

- TOTAL operator wall-clock cap: **15 minutes** from go, captures included.
  At the cap: STOP, preserve evidence, release James.
- **Controller turns: two, each ≤ 90 s** (row 16). James is told the number.
  During a turn James does exactly this and nothing else: **"Put the phone
  down face up. Do not press the side button. If the screen goes dark, tap
  the glass — not the side button — and tell me."**
- Per-block estimates (lens 2, INFERENCE from per-step counts, the v5
  receipt's 2.7-4.2 s reads and the measured 202 ms program accept; not
  measured end to end): A ≈ 2:40 (130 s of action + a templated report),
  B ≈ 1:15, C ≈ 1:15, plus two turns at ≤ 90 s → **≈ 8:10; worst case
  ≈ 9:30** (a second 20 s `Choosing your monitor`, a dead 35 s picker, a
  Face ID fumble). A proper-hold no-tag on leg 1 or 2 spends ≈ 3 min more
  and ends the walk INCONCLUSIVE inside the cap. The cap wins.
- **Reports are typed by James, and are the only typing:** one templated
  report at the end of each block (letters, y/n, one verbatim string;
  ~20-30 s each), never free text mid-block — mid-block instructions say
  "note it", the block's report carries it.
- Physical interactions, EXTRACTED mechanically from the `(n)` marks in the
  table's "James does" column ONLY (the rule: sum every `(n)` in that
  column per block; prose columns carry literals like `(200)` that are not
  marks; leg 3 carries a literal `(0-3)`, so the count is a RANGE): **39-42**
  (A: 19, B: 11-14, C: 9). Typing by James: the three block reports
  (above); paste: **0**.
- Rowing: **one pull** (leg 1), then END. No piece is rowed to completion.
- Reader starts: **at most 6, plus at most one control-tag read** — leg 1:
  1 (+1 retry, scoped below), leg 2: 1, leg 3: 2, leg 4: 1, leg 5: 0. The
  control-tag read is only ever the last thing the walk does. Consent is
  consumed by reader starts, not the clock (2026-09-05 ruling); the budget
  IS the consent, and an exhausted budget ends the walk without a
  re-invitation. **Minimum 3 s between a sheet closing and any tap that
  could open another** (row 2).
- **The one retry (leg 1) covers exactly one case, and James decides it
  alone, inline** (the controller is not live mid-block, and a no-tag ending
  carries no `rf.active` on the console, so "not at the spot" and "tag dark"
  are byte-identical there): if the phone honestly never reached the spot
  before the sheet closed → count to three (row 2) and tap Scan NFC once
  more; if it was there the whole time → stop and report. Nothing else is
  re-scanned.
- Captures: one photo, a NUMBERED STEP inside leg 1 at `Ready when you
  pull`, before the pull (the only instant the state exists), taken with
  the second camera: phone beside the PM5 showing the workout. Nothing is
  timing out at that state (row 14); ~20 s. No other capture mid-leg.

## The walk workout

Import via bulk (canonical Phase DE header; paste-tested against the
grammar in `e2e/connected.spec.ts`'s `BULK_TEXT`):

```
NFC Walk | AN | 3
w 250m max @22
w 250m max
```

## Every hold, spelled out (James reads these; the legs cite them)

While the phone is held to the erg James is looking at the erg, not at a
state change; the cue he can rely on is the system sheet disappearing — and
that is OUR code's stop, which runs before the parse, the buzz, and any
Bluetooth work. **No hold is ever needed past the sheet.** The sheet also
disappears on its own 60 s timeout and on Cancel, so "sheet gone" is not
"read succeeded": after every hold he reads the workout screen for red text.

- **HOLD-A (a real read; legs 1, 2, 3's second scan).** Hold the top of the
  phone flat on the PM5's NFC spot until **the scan sheet disappears** —
  usually 2-5 s, iOS gives up at 60. Then bring the phone back and WATCH it;
  the rest is Bluetooth and does not need the phone near the erg. Screen
  text, in order: `Choosing your monitor` with no buttons (usually 1-2 s; in
  leg 2 about 10 s and up to 20 s — that wait IS leg 2's evidence), then
  `Connecting` (a FOUND ✓ checklist, with Cancel), then `Sending the
  workout`, then `<PM5 name> · PROGRAMMED` / `Ready when you pull` /
  `KEEP YOUR PHONE SCREEN ON`. If instead the workout screen comes back with
  red text, note the words (the block's report carries them).
- **HOLD-NONE (leg 3's first scan).** Tap **Scan NFC** and immediately tap
  the sheet's own **Cancel**. Keep the phone away from the erg. Wait 3
  seconds before the next tap.
- **HOLD-LOCK (leg 4).** Tap **Scan NFC**. Do NOT go near the erg — this leg
  is about the lock, not the tag. With the sheet up, press the side button
  once; the screen goes dark (if it does not, press once more right away).
  Count to three, unlock as normal; Ergomatic comes back by itself. Note
  which: (a) the workout screen, nothing new; (b) the workout screen with
  red text (note the words); (c) `Choosing your monitor` — wait for a
  button, at most 20 s, then Cancel; (d) the scan sheet still showing — tap
  its Cancel. Every letter is a result; no retry. A 60 s timeout here
  (`No NFC tag detected`) is leg 4 INCONCLUSIVE, never the dark-tag rule.
- **END (leg 1).** Phone in the cradle BEFORE the pull (the pull needs both
  hands; END is a header control he must reach within 4 s of the first
  tap). Tap **END**, then **TAP AGAIN** within 4 seconds. If it reads END
  again, tap the pair again.

## Legs, in three blocks (A = {1, 2}, B = {3}, C = {4, 5}; one block per turn, then STOP and wait)

Block boundaries sit where BOTH machines are in a stable state and the next
block's first action RE-ESTABLISHES what it needs: block B opens with a PM5
menu press (a wake), block C opens with a leg that needs no PM5. Leg 2 is in
block A because its premise (a PM5 taken off Connect Device is not
advertising) would otherwise be measured across a controller gap in which
the PM5 may simply have slept (row 6), making a PASS meaningless and a
dark-tag stop rule fire from a cause the controller created.

| # | Block | Leg | James does | Observable (pass) | Fail / inconclusive |
| --- | --- | --- | --- | --- | --- |
| 1 | A | Primary target | On the walk workout's detail screen (the dry run left it there): PM5 reads `Ready for App Connection`, else Menu, More Options, Connect Device (1); tap **Scan NFC** (1) — if a `Replace it?` panel or an unsaved-workout warning appears instead of the sheet: Cancel, stop, report (a diagnostic-build leftover in localStorage); HOLD-A (1); at `Ready when you pull`: the photo, second camera (1); phone in the cradle (1); one pull (1); END per the END rule (2); the ONE summary screen shows: tap the LOWER button **Save without logging** (a plan is active; the top accent button `Log against plan` is NEVER tapped) (1) → Today; Library → the walk workout again (2) | **Scan NFC** above **Connect**; NO device list; the HOLD-A sequence in order (`Choosing your monitor` → `CONNECTING` → the exact PM5 name → `SENDING THE WORKOUT` → `<PM5 name> · PROGRAMMED` / `Ready when you pull`, which this runsheet calls READY); the PM5 shows the program; first frame live; END → the one summary → the save → Today. The buzz is SUPPORTING only (iOS gives its own feedback on a tag read, INFERENCE); the discriminator is picker-free + the exact name | a picker sheet; a wrong name; `Unsupported NFC tag` (named STOP: the parser has never met the real tag on the product path); never READY; wrong program |
| 2 | A | Not advertising | Glance at the PM5: it must NOT read `Ready for App Connection`; if it is DARK, press Menu once (awake but off Connect Device — a dark PM5 passes the eye test and may also be a dark tag) (1); tap **Scan NFC** (1); HOLD-A (1); watch `Choosing your monitor` for ~10 s (up to 20 s); note the card; PM5: Menu, More Options, Connect Device → `Ready for App Connection` (3); tap **Try again** (1); at `Ready when you pull` tap **Cancel** (1) → detail; phone down face up | `Open Connect Device on this PM5, then try again.` with **Try again**, no picker, after ~10 s (up to 20 s: the scan deadline plus the stop-scan cleanup bound); Try again → CONNECTING with NO second NFC sheet → READY. **PREMISE, INFERENCE, unestablished in this repo:** that leaving Connect Device stops the PM5 advertising within the deadline. **Inconclusive branch:** if the scan CONNECTS instead (READY with no card), tap Cancel, record leg 2 INCONCLUSIVE (premise false), no retry, continue | picker; generic copy; a second sheet |
| 3 | B | Re-arm (mandatory) | PM5: Menu, More Options, Connect Device → `Ready for App Connection` (3); **Scan NFC** (1) → HOLD-NONE: the sheet's Cancel (1); count to three; **Connect** (1) → the `Looking for your PM5` list sheet: its **Cancel**, listed or not (1) → the card `No monitor was picked.` (Try again / Row on the phone timer instead / View connection log / Cancel): tap **Cancel** (1) → detail; glance at the PM5: if it STILL reads `Ready for App Connection` leave it (nothing connected), else Menu, More Options, Connect Device (0-3); **Scan NFC** (1); HOLD-A (1); at `Ready when you pull` tap **Cancel** (1); phone down face up | one session; READY once; every button back after each cancel; the picker cancel lands on the failure screen (Try again / Row on the phone timer instead / View connection log / Cancel), never on a stuck screen | two sessions; a stuck busy state; Scan NFC missing after a cancel (see the stop rules: re-open once) |
| 4 | C | Background during a live reader — a DECIDED leg, not an experiment | Phone away from the erg; tap **Scan NFC** (1); HOLD-LOCK: side button while the sheet is up (1); count to three; unlock (1); note the letter (a)-(d) | Outcomes (a)-(d) per HOLD-LOCK; (a) and (b) are PASS, and the console's raw ending `code` is read ONE WAY: **202** (`SessionTerminatedUnexpectedly` — `NFCNDEFReaderSession.h`: the session ends "when the client application enters the background state"; our own invalidate can only ever produce Cancel-200, patch comment) ⇒ iOS ended the reader → `NFC scan stopped. Try again.` in red, both buttons back; 202 is also a CORRECTION to the design spec's "no operator action forces 202", landed 2026-09-06. **200 attributes NOTHING:** our `pause`-abort is one producer, and `BACKGROUND-OBSERVATIONS.md` records a Cancel-200 arriving BEFORE a delivered pause from a cause that was never identified — on a 200 the walk records the outcome letter and the code, not a winner. FAIL = an interstitial on resume; (d) a sheet that survived the lock = INCONCLUSIVE | interstitial on resume; no ending line within 60 s (the sheet survived the lock: outcome (d), INCONCLUSIVE, not the dark-tag rule) |
| 5 | C | Manual Connect unchanged | PM5: any button if dark, then Menu, More Options, Connect Device (3); tap **Connect** (1); the `Looking for your PM5` sheet lists the PM5 within a few seconds: tap it (1) (not listed after 15 s: the sheet's Cancel, then Cancel on the card, note it); at `Ready when you pull` tap **Cancel** (1) | today's picker; the same workout to READY | anything new |

State residue, walked leg by leg on BOTH machines: leg 1 SAVES its log
before leg 2, so no unretired `MonitorRun` remains and leg 2's first tap
opens no unsaved-workout panel; leg 1's END terminates the erg
(`Terminate → Rearm → WaitToBegin`), which is exactly leg 2's starting
state and is reached seconds before leg 2, not across a turn. Legs 2-5 reach
READY and Cancel before any pull, so they leave no run to save, and each
Cancel from READY terminates the erg, so every later connect re-navigates
the PM5 to Connect Device. Every Cancel from READY returns to workout detail
with both hardware buttons rendered.

Both machines at each boundary: **A → B** phone on detail (Auto-Lock:
Never is the only protection), PM5 terminated and awake; block B's first
action is a PM5 menu press. **B → C** the same; block C's first leg needs no
PM5, and leg 5 opens with a PM5 menu press.

Retired legs and their substitute evidence are listed in the design spec's
"Native hardware walk" (former legs 1, 5, 6, 8).

## Operator blocks (VERBATIM, what James receives; screen text only)

Sent one per turn, end-of-turn, pre-written before go. The controller replies
within 90 s of each report. Each block is under ~280 words.

**BLOCK A**

> Phone on the NFC Walk screen, camera within reach. Do the whole list, then send the report at the bottom. I reply within 90 seconds.
>
> 1. PM5: if it doesn't read **Ready for App Connection**, press Menu, More Options, Connect Device.
> 2. Tap **Scan NFC**. A sheet appears at once: "Hold your iPhone near the PM5." (If a panel asks "Replace it?" or warns about an unsaved workout instead: tap Cancel, stop, tell me.)
> 3. Hold the top of the phone flat on the PM5's NFC spot until the sheet disappears. Usually 2-5 s; iOS gives up at 60.
> 4. Bring it back and watch: Choosing your monitor (usually 1-2 s, no buttons — up to 20 s is still normal; past 20 s with no button, wait for one and tap Cancel, note "stuck") → Connecting → Sending the workout → **"<PM5 name> · PROGRAMMED / Ready when you pull"**. Usually under 10 s, at most about 30. If the workout screen comes back with red text, note the words. "No NFC tag detected": if the phone honestly never reached the spot, count to three and tap Scan NFC once more; if it was there the whole time, stop and report. "Unsupported NFC tag": photograph the screen, stop, report.
> 5. Photo with the other camera: phone at Ready when you pull beside the PM5 showing the workout. Nothing is timing out; take your time.
> 6. Phone in the cradle. One pull. The live screen appears within a second.
> 7. Tap **END** (top right), then **TAP AGAIN** within 4 s. The log screen appears.
> 8. Tap the LOWER button, **Save without logging**. NOT the top one, "Log against plan". Today appears in ~3 s. (Red text: tap it once more; still red, note it and carry on.)
> 9. Library tab → NFC Walk (My Workouts). Scan NFC should be there.
> 10. Glance at the PM5: it must NOT read Ready for App Connection. If it's dark, press Menu once.
> 11. Tap Scan NFC (if step 8 stayed red, a panel warns about an unsaved workout here: tap Cancel, stop, report), hold as in 3, bring it back. **Choosing your monitor with no buttons for 10-20 s is the test.** Then a card: "Open Connect Device on this PM5, then try again." (If it reaches Ready when you pull instead: tap Cancel, note "connected".)
> 12. PM5: Menu, More Options, Connect Device. Tap **Try again**. Connecting → Ready when you pull, no sheet.
> 13. Tap **Cancel**. Phone down, face up. Don't press the side button.
>
> Report: (a) PM5 name shown; (b) any red text, exact words; (c) photo y/n; (d) which save button you tapped; (e) step 11: card text and rough wait; (f) step 12 reached Ready when you pull y/n.

**BLOCK B**

> 1. PM5: Menu, More Options, Connect Device → **Ready for App Connection**.
> 2. Tap **Scan NFC**. The sheet appears; tap ITS **Cancel** straight away. Keep the phone away from the erg. The workout screen is unchanged with both buttons live. That is all you will see.
> 3. Count to three.
> 4. Tap **Connect**. A list sheet "Looking for your PM5" appears; the PM5 may or may not be listed. Tap the sheet's **Cancel** either way. A card appears: "No monitor was picked." with Try again / Row on the phone timer instead / View connection log / Cancel.
> 5. Tap **Cancel** (the last button). Workout screen, both buttons back.
> 6. Glance at the PM5: if it still reads Ready for App Connection, leave it. Otherwise Menu, More Options, Connect Device.
> 7. Tap **Scan NFC**, hold at the spot until the sheet disappears (2-5 s, at most 60), bring it back: Choosing your monitor → Connecting → Sending the workout → **Ready when you pull**, under 10 s. Red text instead: note the words, stop.
> 8. Tap **Cancel**. Phone down, face up. Don't press the side button.
>
> Report: (a) step 2 anything odd; (b) step 4 was the PM5 listed; (c) step 7 reached Ready when you pull y/n; (d) any red text, exact words.

**BLOCK C**

> 1. Phone away from the erg. Tap **Scan NFC**. The sheet appears.
> 2. Press the side button once. The screen goes dark. (If it doesn't, press once more right away.)
> 3. Count to three. Unlock as normal. Ergomatic comes back by itself.
> 4. Note which: (a) workout screen, nothing new; (b) workout screen with red text (note the words); (c) a "Choosing your monitor" screen: wait for a button, at most 20 s, then Cancel; (d) the scan sheet still showing: tap its Cancel. Every letter is a result. No retry.
> 5. PM5: press any button if it's dark, then Menu, More Options, Connect Device.
> 6. Tap **Connect**. The list sheet "Looking for your PM5" shows the PM5 within a few seconds; tap it. Connecting → Sending the workout → **Ready when you pull**, under 10 s. (Not listed after 15 s: tap the sheet's Cancel, then Cancel on the card.)
> 7. Tap **Cancel**. Workout screen. That's the end of the walk. Phone down.
>
> Report: (a) step 4's letter and any red words exactly; (b) step 6 reached Ready when you pull y/n.

**FLIPPER BLOCK** (only if block A stops at step 4 or 11 on a no-tag ending
from a real hold; sent on that turn, never pre-embedded)

> Flipper: NFC → Saved → C2_pm5_rebuilt → Emulate. Count to three, tap Scan NFC, hold the phone's top to the Flipper's back until the sheet disappears. The sheet closing is the whole result; whatever screen follows, wait for a button and tap Cancel. Report: did the sheet close on its own, or did it time out.

## Evidence the controller gathers (James pastes nothing)

- The console capture (`devicectl --console`, retained by the controller):
  native ending lines with their raw `code` for legs 1-4 (leg 4's 200/202
  is the verdict) and the WebView console. Redaction before commit: no BLE
  `deviceId`, no tag UID, no address bytes (`docs/monitor/nfc/README.md`
  rules).
- The app's own **View connection log** carries the attempt trace on the
  failure screen (the `nfc-attempt:` prefix; product export window landed
  2026-09-06) — the ONLY place the JS trace kinds (`parser-accepted`,
  `parser-rejected`, `ble-scan-matched`) are visible on a product build. It
  is READ ON THE PHONE only if a leg fails, and photographed then; it is
  never copied or pasted.
- One photo (leg 1).

## Stop rules

- **The likely one first: the control tag reads and the PM5 tag is dark.**
  Scoped to a REAL HOLD (HOLD-A with the phone at the spot; never leg 3's
  HOLD-NONE or leg 4's HOLD-LOCK, whose 60 s timeouts mean something else).
  The spec's "PM5 NFC availability" section records two 60 s no-tag windows
  with no identified cause and forbids conditioning any rule on a PM5 power
  cycle. So: one no-tag ending on a real hold → the Flipper block (next
  turn) → if the control tag reads, the walk is **INCONCLUSIVE on the PM5
  tag** and James is released. No power cycle, no "one more scan".
- A no-tag ending on the CONTROL tag (phone stack): STOP.
- `Unsupported NFC tag` on the real PM5 tag (leg 1): STOP; James
  photographs the phone SCREEN (the red text). The `parser-rejected` trace
  kind reaches NO surface on a product build for an inline error (the trace
  is completed on detail and never handed to the session's export window,
  and `View connection log` exists only on the interstitial's failure
  screen); the evidence is the red text plus the console's native ending
  line — code 200 with an rf-active read proves a tag WAS read, so 200 +
  `Unsupported NFC tag` = the parser refused it (or a multi-tag rejection),
  by elimination.
- **Scan NFC missing on the workout screen:** go back and re-open the
  workout ONCE (the 2 s capability probe can lose a race on an uncached
  mount and renders nothing for that mount). Still missing → STOP. **Scan
  NFC greyed out** is different: an attempt never settled (`busy`) → STOP,
  report.
- **The save: `Log against plan` tapped by mistake is unrecoverable and is
  the plan stop rule already executed** — report it; the block names the
  button by text AND position (lower) so it does not happen. A failed save
  (`Couldn't save this session. Try again.`) is retried once by tapping the
  SAME lower button; still red → note it, carry on (leg 2 then meets the
  unsaved-workout panel: Cancel, stop, report).
- `NFC scan stopped. Try again.` on any leg other than 4: a reader start
  within 3 s of the last sheet (code 203) or a backgrounding (code 202) —
  the console says which; do not retry; STOP and record.
- A `/789` identity, a dead console (checked at each boundary), or the cap:
  STOP.
- No live repair, rebuild, surprise leg or extra scan.

## Record

Results go to `docs/monitor/sessions/phase-nf-product-walk/RESULT.md`
(new), the spec's walk section, and the ROADMAP NF block.
