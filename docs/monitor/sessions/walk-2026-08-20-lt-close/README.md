# Walk 2026-08-20 — Phase LT close-out

**Purpose:** the five parked device items travelling together as Phase LT's
close-out bundle (ROADMAP's "THE PHASE-CLOSE ERG BUNDLE"), as revised by the
phase-exit antagonist pass the same morning.

**Build under test:** TestFlight **v0.14.0 (688)**, cut this morning, running
against **prod**. No lab stack was raised; the phone talks to
`ergomatic.waffle.haus`, and the one piece that ended up on the laptop used
the same prod deployment.

**Operator:** James at the erg + phone. **Belt worn** (resting 65-70 bpm at
the start), per the plan's explicit heart-rate declaration.

**Rowing budget:** 1 piece, ~4 min. **Honoured** — one piece was rowed, plus a
handful of abandoned strokes during the link-loss item (see F-1) that produced
no session.

## Provenance

| Artifact | What it is |
|---|---|
| `photo-armed-portrait.jpg` | The armed connected surface, portrait, as mounted. Item A. |
| `photo-armed-landscape.jpg` | Same, landscape. Item A. |
| `photo-pm5-view-detail.jpeg` | The PM5's own `View Detail` memory screen for the rowed piece. The external oracle for item E. |
| ring (inline below) | `MONITOR LOG · COPY` off the post-piece summary, laptop/web session. |

**No wire recording exists for the phone half.** `adapters/monitorTransport.ts`
takes the Capacitor arm whenever `isNative()`, and the recording tap lives only
inside `resolveDefaultTransport`'s web arm — so a TestFlight build cannot
record. This was known before the walk and is why the plan asked for photos.

## Items and outcomes

| Item | Outcome |
|---|---|
| **A** — both-rotations occlusion + iOS-26 `100dvh` | **PASS**, both rotations. |
| **B** — mis-hit toward END | **PASS**. No near-miss with deliberately sloppy thumb taps. |
| **C** — triple-tap diagnostics | **PASS** on the phone. Previously proven only on the laptop. |
| **D** — stale-while-armed | **FAILED, and worse than the parked note predicted.** See F-1 and F-2. |
| **E** — the rest-bearing piece | **Rowed on web** (the phone was bricked by F-2). DISTANCE oracle **CLOSED**; the phone→server trace leg is **still owed**. |

### A transcription note on item A

The operator's first report was "everything is under notch", which the
controller read as occlusion and escalated. It meant the opposite — everything
sits *below* the notch, i.e. correct. The photo was read, the reading
contradicted the report, and the contradiction was raised rather than filed.
Recorded because reading the artifact is what caught it, and because
"escalate on ambiguous operator shorthand, then check the photo" is the
behaviour worth repeating.

## F-1 — an armed screen that lies through a dead link

**Observed:** armed a workout, walked out of BLE range, then cycled the
phone's Bluetooth off and on again. The surface **never changed** — it held
`1 OF 3 · READY` throughout. He then **started rowing, and nothing happened**.

**The runsheet's written prediction was measured FALSE, and that is a result
in its own right.** `walk-phase-cr2-exit/RUNSHEET.md:196` predicted that on a
pre-stroke link kill "stale beats armed in the axes' precedence, so the armed
protections drop" — the header showing a gold session-left instead of
`READY`. **The stale axis never engaged at all.** Recorded here so the next
reader does not inherit a falsified prediction as a finding.

**Why it matters more than the parked note said.** The parked observation
predicted the armed protections would drop and the header might show a gold
session-left instead of `READY`. The reality is worse and quieter: the screen
asserts a healthy armed state it cannot know, and there is no moment at which
a rower learns otherwise. A rower would row an entire piece into nothing and
find out at the end, if at all. This is the same class as the PAUSED state
CLAUDE.md already records — a state we display on the machine's behalf that
the machine never told us about.

**Evidence limitation, stated plainly:** the diagnostics ring for this state
was **lost**. It lives in `sessionStorage` and renders only on the summary
screen; the run was discarded before the ring was copied. So we have the
operator's description and no wire detail. On a TestFlight build there is no
second route — see F-3.

## F-2 — after a link loss, the native app is bricked until reinstalled

**Observed, in order:** reconnect attempts reached programming and timed out
with `LINK-FAILED`. Force-quitting the app did not help. Restarting the PM5
did not help. **The same PM5 then programmed successfully from the laptop web
build**, immediately. **Deleting and reinstalling the app fixed the phone.**

**What that isolates.** The PM5 was healthy and programmable throughout, so
this is not a machine fault and not a BLE-radio fault. It is specific to the
**native path**. That much holds.

**CORRECTED 2026-08-20, same day, by the phase-open PM gate — the first
version of this section over-claimed and its named leads are dead.** It said
the reinstall "implicates app-local state that survives process death" and
named `ergomatic.lastMonitorDevice` and a stranded `ergomatic.monitorRun`.
Both are refuted, and the reasoning was refuted with them:

- **`lastMonitorDevice` cannot affect connecting.** It stores a device
  **name**, for the `LAST USED ·` caption (`ConnectedInterstitial.tsx`'s
  `saveLastDevice(name: string)`), while `connect()` uses `device.deviceId`
  (`capacitorBle.ts`). The original note also claimed nothing outside that
  file reads it; that was wrong — `WorkoutDetail.tsx:196,302` calls
  `loadLastDevice()`. The grep behind the claim searched for the key
  constant, and the consumers import the helper functions instead.
- **A stranded `monitorRun` cannot brick anything either** — it raises a
  confirm panel whose "Connect anyway" proceeds unconditionally
  (`ConnectAction.tsx:104`).
- The PM's storage census found **no persisted key in this app is an input to
  `scan()`, `connect()`, `program()`, or any driver decision**. So
  `localStorage.clear()` would not have fixed the phone.

**"Deleting the app fixed it, therefore app-local state" is a guess about a
BOUNDARY, not a mechanism.** A reinstall resets far more than web storage.
**Why a force-quit did not clear it is UNESTABLISHED**, is the central
mystery of this finding, and is most likely iOS-side. Nothing here should be
read as pointing at a storage key.

**Also refuted, and it matters for the release conversation:** this defect is
not v0.14.0's. `git diff --stat v0.13.0 v0.14.0 -- app/src/monitor/transports/
app/src/adapters/` is **empty** — the native BLE arm is unchanged since
v0.10.0.

**What the surface's own state machine proves, though.** `1 OF 3 · READY` is
structurally impossible once `phase === "disconnected"` (`surfaceModel.ts:787`,
`ConnectedSurface.tsx:404-410`, `connectedAxes.ts:145-146`). Its persistence
is therefore not a rendering mystery: it **proves the phase never moved**, so
the app never learned the link was gone. The app's only lost-link detector is
the plugin's disconnect callback; there is **no frame-silence watchdog
anywhere**, and the plugin resolves that callback only inside
`didDisconnectPeripheral` — a Bluetooth power-off runs `stopScan()` +
`emitState()` and nothing per-device. That is a mechanism, and it is
consistent with everything observed.

**Related, same session, unproven as the same cause:** switching from one
loaded workout to a different one also misbehaved on the phone.

**Severity note for whoever picks this up:** v0.14.0 (688) is on TestFlight
with this defect. The only escape a tester has is deleting the app.

## F-6 — "sometimes when I go to Connect, we're actually still connected"

**Operator observation, James, 2026-08-20**, offered after the walk and not
part of its plan. Recorded because it is the SAME defect pointing the other
way, and because it has a mechanism.

F-1 is the app believing it is connected when it is not. This is the app
offering to connect when it already is. Both follow from one thing: **the
app's connection state is a local belief, never an observation.**

**Checked, not assumed:** there is no already-connected guard anywhere on the
connect path. `grep` for `isConnected` / `getConnectedDevices` /
`connectedDevices` across `capacitorBle.ts` and `useMonitorSession.ts` returns
**nothing**, and `createTransport` builds a fresh transport per attempt
(`useMonitorSession.ts:1531-1534`). The app never asks iOS whether it already
holds this peripheral; it scans and connects from scratch every time.

**Why this may be the missing half of F-2.** If iOS still holds a connection
the app has forgotten, a fresh connect-then-program is a plausible route to
`LINK-FAILED`.

**CORRECTED 2026-08-20 by the Phase LL research pass — "the PM5 is
single-central" HAS NO SOURCE.** It appears nowhere in Concept2's BLE or
CSAFE documents and nowhere in our own record; it is a documented absence
plus consistently singular language, and it was stated as fact here and to
James during the walk. It must not be inherited as vetted ground. The
observation in this finding stands on its own — the absent guard and the
per-attempt transport are both verified — but the single-central premise
is an assumption awaiting a one-line device probe.

**Stated as a hypothesis, not a finding.** Nobody has observed iOS's own view
of the connection during a failure, and there is no route to on a TestFlight
build (F-3). What IS established is the absent guard and the per-attempt
transport. The Capacitor plugin exposes `getConnectedDevices`; we have never
called it.

## F-2 addendum — it is not a CONNECT failure, it is a PROGRAM failure

**Established by the Phase LL research pass, 2026-08-20, reading the code
against this record's own wording.** This README says the retries "reached
programming" — which means **connect kept succeeding** and programming kept
failing. That reframes the finding.

The loop is closed by construction, and all three parts are verified:
`program()`'s catch never disconnects and never clears `driverRef` (contrast
`connect()`'s catch at `useMonitorSession.ts:1607`); `handleTryAgain`
(`ConnectedInterstitial.tsx:311-313`) reprograms over that same dead driver;
and `connect()` early-returns while `driverRef` is set, so nothing can ever
rebuild it. Retrying could not have worked.

**Strongest instrumentable candidate for the underlying link death:** every
connect attempt builds a **new `CBCentralManager`** (the plugin's
`Plugin.swift:62-71` replaces its DeviceManager unconditionally) while its
`deviceMap` retains peripherals from previous centrals. **It does not explain
the force-quit survival**, which remains the open question.

## F-3 — the field cannot self-diagnose this class of bug at all

`WKWebView.isInspectable` has defaulted to `false` since iOS 16.4. Capacitor
sets it from `CAPACITOR_DEBUG`, whose xcconfig is the base configuration for
the **Debug** configurations only, while `scripts/ios-release.sh` archives
`-configuration Release`. So Safari Web Inspector cannot attach to a
TestFlight build, and neither storage nor console is reachable. Combined with
the absent recording tap on native, a native-only defect like F-2 leaves
**no machine-readable evidence whatsoever** — only what the operator can
describe. Established by the phase-exit pass before the walk, and the walk
then demonstrated the cost.

**Sharpened by the PM gate, and the sharper version is the actionable one:**
the problem is not only that TestFlight cannot be inspected. It is that the
app's one field diagnostic, `MONITOR LOG · COPY`, lives on the log screen
(`LogSession.tsx:668`) and is reachable only **after a session finishes** —
which is **downstream of the very door this bug locks**. Ask which surface a
diagnostic is reachable from, and whether the failure under study prevents
reaching it.

## F-4 — the DISTANCE oracle: CLOSED, and the 2m gap is the erg's own

The summary's DISTANCE hero read **1156**. The wire's `final-totals` entry
reported `accumulator=1154.9m machineTotal=1154m`. Two of our own derivations
disagreeing by ~1m, with the one shown to the rower as the outlier — which is
exactly what this check exists to surface.

The PM5's own `View Detail` screen settles it. Transcribed from
`photo-pm5-view-detail.jpeg` (`v1:00/1:00r...3`, Aug 20 2026, Total Time
6:14.9):

| row | time | meter | /500m | s/m | HR |
|---|---|---|---|---|---|
| **total** | 4:14.9 | **899** | 2:21.7 | 26 | |
| interval 1 | 1:00.0 | 198 | 2:31.5 | 26 | 111 |
| rest 1 | r1:00 | 134 | | | |
| interval 2 | 2:14.9 | 500 | 2:14.9 | 27 | 135 |
| rest 2 | r1:00 | 121 | | | |
| interval 3 | 1:00.0 | 203 | 2:27.7 | 24 | 137 |
| rest 3 | r:00 | 0 | | | |

**The PM5 disagrees with itself.** Its own interval rows sum to
198 + 500 + 203 = **901**; its own stated total work distance is **899**. A 2m
self-disagreement from rounding each displayed row.

Both of our numbers then fall out exactly, computed not eyeballed:

- **901 + (134 + 121 + 0) = 1156** — our DISTANCE hero, to the metre. The hero
  sums the machine's **per-interval** work and rest distances
  (`summaryModel.ts`'s `monitorDistanceMeters`), so it inherits the machine's
  per-row rounding.
- **899 + 255 = 1154** — the machine's own Total Work Distance, which our
  register accumulator tracks to 0.9m (1154.9).

**Neither derivation is wrong.** They track two different PM5 numbers that the
PM5 itself does not reconcile. This is the first time we have had the
machine's row-level breakdown to prove it, and it is a genuine external
oracle: the machine's own screen, digit-matching our hero through an identity
we did not choose.

**Wire-note candidate** (`pm5-interface-notes.md`): the PM5's displayed
per-interval distances are rounded and their sum may exceed its own Total Work
Distance. Any oracle built on summing displayed rows carries that error.

## F-5 — heart rate, independently confirmed

The PM5's own memory record carries HR per interval — **111 / 135 / 137**,
climbing across the piece. This is machine-side confirmation of the belt leg,
independent of anything we decoded. Spec 3's HR line has a real source.

## Open, from the ring's own numbers

**A 13.4 s shortfall on interval 2's register elapsed.** Computed from the
`final-totals` entry (`registers=3 of 3 programmed 0:(122.2s,332m)
1:(181.5s,620.3m) 2:(60s,202.6m)`) against the PM5's own rows:

| interval | our register elapsed | PM5 work + programmed rest | gap |
|---|---|---|---|
| 0 | 122.2 s | 60.0 + 60 = 120.0 s | +2.2 s |
| 1 | 181.5 s | 134.9 + 60 = 194.9 s | **−13.4 s** |
| 2 | 60.0 s | 60.0 + 0 = 60.0 s | 0.0 s |

The ring's own samples explain the shape but not the significance: interval 1's
work completed at elapsed 135.22 s (matching the PM5's 2:14.9), and the last
rest sample landed at 180.94 s — so the final pre-reset reading was taken
about 14 s before the rest actually ended. That is a **limitation of the
"final pre-reset reading" oracle**, not necessarily a defect in what we store.

**It does not follow that the TIME hero is wrong**, because R-D computes TIME
as Σ work seconds + programmed rest for completed intervals, not from the
register elapsed — and that formula gives 254.9 + 120 = 374.9 s = **6:14.9**,
matching the PM5's Total Time exactly. **The TIME hero was not read off the
screen during the walk, so this is a derivation, not an observation.** One
line of a future walk closes it.

## Still owed

- **The phone→server trace leg.** The piece ended up on web, so
  `MonitorRun.series` has still never made the trip from a phone into the prod
  `series` column. One short connected session on the phone, no rests needed.
- **The TIME hero read off the screen**, per the paragraph above.
- **F-1's wire detail**, if a route to it ever exists (see F-3).
