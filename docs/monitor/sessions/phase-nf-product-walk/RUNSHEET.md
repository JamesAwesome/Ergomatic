# NF-PRODUCT-v6 — Scan NFC product walk (v6 · 2026-09-06 · hardened as a TIMED PROTOCOL; awaiting PM readiness PASS on this version)

**Status:** v6 — v5 had the PM readiness PASS (2026-09-06); James then asked
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
the console) and a three-way outcome. v6 needs its own PM pass because legs,
blocks and observables changed.
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
- Flipper in hand with `C2_pm5_rebuilt.nfc` loaded (the CONTROL tag: on any
  no-tag ending, read the control tag first to name the layer).
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
| 2 | One reader session per system | state | any live sheet | that sheet's ending | A tap within ~1 s of a sheet closing → code 203 `SystemIsBusy` → `NFC scan stopped. Try again.` | D |
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
| 13 | `END` → `TAP AGAIN` | **4 s** | first END tap | second tap or expiry | Leg 1: a glance at the PM5 between taps disarms it | D (`useStagedDiscard.ts`) |
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
- Per-block estimates (INFERENCE from action counts and the v8 measured
  1:46 for one scan-and-connect; not measured): A ≈ 6 min, B ≈ 3 min,
  C ≈ 3 min, plus two 90 s turns. Sum 15 at the cap; the cap wins.
- Physical interactions, EXTRACTED mechanically from the `(n)` marks in the
  table's "James does" column ONLY (the rule: sum every `(n)` in that
  column per block; prose columns carry literals like `(200)` that are not
  marks): **37** (A: 17, B: 12, C: 8). Typing/paste
  by James: **0**.
- Rowing: **one pull** (leg 1), then END. No piece is rowed to completion.
- Reader starts: **at most 6, plus at most one control-tag read** — leg 1:
  1 (+1 retry, scoped below), leg 2: 1, leg 3: 2, leg 4: 1, leg 5: 0. The
  control-tag read is only ever the last thing the walk does. Consent is
  consumed by reader starts, not the clock (2026-09-05 ruling); the budget
  IS the consent, and an exhausted budget ends the walk without a
  re-invitation. **Minimum 3 s between a sheet closing and any tap that
  could open another** (row 2).
- **The one retry (leg 1) covers exactly one case:** James reports he did
  not get the phone to the logo before the sheet ended (his own miss). A
  no-tag ending on a PROPER hold is NOT retried — it goes straight to the
  control-tag stop rule below. Nothing else is re-scanned.
- Captures: one photo, INSIDE leg 1 at READY, before the pull (the only
  instant the state exists): phone READY beside the PM5 showing the
  program. Priced at ~10 s; the controller says "photo now" as its own
  step, and no other capture is taken mid-leg.

## The walk workout

Import via bulk (canonical Phase DE header; paste-tested against the
grammar in `e2e/connected.spec.ts`'s `BULK_TEXT`):

```
NFC Walk | AN | 3
w 250m max @22
w 250m max
```

## Every hold, spelled out (James reads these; the legs cite them)

While the phone is held to the erg its screen faces AWAY from James, so he
cannot see the state change a leg asks him to observe. The only cue is the
system sheet disappearing — and that is OUR code's stop, which runs before
the parse, the buzz, and any Bluetooth work. **No hold is ever needed past
the sheet.**

- **HOLD-A (a real read; legs 1, 2, 3's second scan).** Hold the phone flat
  to the PM5 logo until **the scan sheet disappears** — normally a few
  seconds, at most 60. Then bring the phone back and WATCH it; the rest is
  Bluetooth and does not need the phone near the erg. You will see, in
  order: `CONNECT` / `Choosing your monitor` with no buttons (normal, usually
  1-2 s; in leg 2 about 10 s and up to 20 s — that wait IS leg 2's
  evidence), then `CONNECTING`, then the PM5's name, then `SENDING THE
  WORKOUT`, then `<name> · PROGRAMMED` / `Ready when you pull`. If instead
  the workout screen comes back with red text, read it to me and stop.
- **HOLD-NONE (leg 3's first scan).** Tap **Scan NFC** and immediately tap
  the sheet's own **Cancel**. Keep the phone away from the erg. Wait 3
  seconds before the next tap.
- **HOLD-LOCK (leg 4).** Tap **Scan NFC**. Do NOT go near the erg — this leg
  is about the lock, not the tag. With the sheet up, press the side button
  once. Wait 3 seconds, unlock, and tell me exactly what the phone shows:
  the workout screen with nothing new, the workout screen with red text
  (read it to me), or the connecting screen.
- **END (leg 1).** Tap **END**, then **TAP AGAIN** within 4 seconds. If it
  reads END again, tap the pair again.

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
| 1 | A | Primary target | Library → the walk workout (2); tap **Scan NFC** (1); HOLD-A (1); at `Ready when you pull`: the photo (1); one pull (1); END per the END rule (2); the ONE summary screen shows: tap **Save without logging** (a plan is active; the lead button `Log against plan` is NEVER tapped) (1) → Today; Library → the walk workout again (2) | **Scan NFC** above **Connect**; NO device list; the HOLD-A sequence in order (`Choosing your monitor` → `CONNECTING` → the exact PM5 name → `SENDING THE WORKOUT` → `<PM5 name> · PROGRAMMED` / `Ready when you pull`, which this runsheet calls READY); the PM5 shows the program; first frame live; END → the one summary → the save → Today. The buzz is SUPPORTING only (iOS gives its own feedback on a tag read, INFERENCE); the discriminator is picker-free + the exact name | a picker sheet; a wrong name; `Unsupported NFC tag` (named STOP: the parser has never met the real tag on the product path); never READY; wrong program |
| 2 | A | Not advertising | PM5 shows the post-END screen, not Connect Device — James confirms by eye, within seconds of leg 1's save (0); tap **Scan NFC** (1); HOLD-A (1); watch `Choosing your monitor` for ~10 s (up to 20 s); read the card; PM5: Menu → Connect Device (2); tap **Try again** (1); at READY tap **Cancel** (1) → detail | `Open Connect Device on this PM5, then try again.` with **Try again**, no picker, after ~10 s (up to 20 s: the scan deadline plus the stop-scan cleanup bound); Try again → CONNECTING with NO second NFC sheet → READY. **PREMISE, INFERENCE, unestablished in this repo:** that leaving Connect Device stops the PM5 advertising within the deadline. **Inconclusive branch:** if the scan CONNECTS instead (READY with no card), tap Cancel, record leg 2 INCONCLUSIVE (premise false), no retry, continue | picker; generic copy; a second sheet |
| 3 | B | Re-arm (mandatory) | PM5: Menu → Connect Device (2); **Scan NFC** (1) → HOLD-NONE: Cancel the sheet (1); wait 3 s; **Connect** (1) → cancel the picker (1) → the failure screen shows: tap **Cancel** (1) → detail → PM5: Menu → Connect Device (2) → **Scan NFC** (1); HOLD-A (1); at READY tap **Cancel** (1) | one session; READY once; every button back after each cancel; the picker cancel lands on the failure screen (Try again / Row on the phone timer instead / View connection log / Cancel), never on a stuck screen | two sessions; a stuck busy state; Scan NFC missing after a cancel (see the stop rules: re-open once) |
| 4 | C | Background during a live reader — now a DECIDED leg, not an experiment | Tap **Scan NFC** (1); HOLD-LOCK: side button while the sheet is up (1); wait 3 s; unlock (1); say what the screen shows | THREE outcomes, two of them PASS, and the console tells them apart by the ending's raw `code`: **200** = our `pause`-abort ended the reader first → quiet return, both buttons back; **202** (`SessionTerminatedUnexpectedly` — `NFCNDEFReaderSession.h`: the session ends "when the client application enters the background state") = iOS ended it first → `NFC scan stopped. Try again.` in red on the workout screen, both buttons back. Both are correct product behaviour; 202 is also a CORRECTION to the design spec's "no operator action forces 202", landed 2026-09-06. FAIL = an interstitial on resume, or no ending line at all | interstitial on resume; no ending line within 60 s |
| 5 | C | Manual Connect unchanged | PM5: Menu → Connect Device (2); tap **Connect** (1); pick the PM5 (1); at READY tap **Cancel** (1) | today's picker; the same workout to READY | anything new |

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
  The spec's "PM5 NFC availability" section records two 60 s no-tag windows
  with no identified cause and forbids conditioning any rule on a PM5 power
  cycle. So: one no-tag ending on the PM5 → read the CONTROL tag → if the
  control tag reads, the walk is **INCONCLUSIVE on the PM5 tag** and James
  is released. No power cycle, no "one more scan".
- A no-tag ending on the CONTROL tag (phone stack): STOP.
- `Unsupported NFC tag` on the real PM5 tag (leg 1): STOP, photograph View
  connection log (`parser-rejected` is the line that matters).
- **Scan NFC missing on the workout screen:** go back and re-open the
  workout ONCE (the 2 s capability probe can lose a race on an uncached
  mount and renders nothing for that mount). Still missing → STOP.
- `NFC scan stopped. Try again.` on any leg other than 4: a reader start
  within 3 s of the last sheet (code 203) or a backgrounding (code 202) —
  the console says which; do not retry; STOP and record.
- A `/789` identity, a dead console (checked at each boundary), or the cap:
  STOP.
- No live repair, rebuild, surprise leg or extra scan.

## Record

Results go to `docs/monitor/sessions/phase-nf-product-walk/RESULT.md`
(new), the spec's walk section, and the ROADMAP NF block.
