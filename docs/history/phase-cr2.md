> **Archived 2026-08-28** from `ROADMAP.md` (lines 5829-6376 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase CR2 — Connected cleanup

**Status:** IN FLIGHT as three spec cycles (James, 2026-08-15): spec 1
"numbers" (R0 + item 0 + F7) MERGED (PR #99, 2026-08-15, `7c2be9f`) — its
follow-on dev-only record-and-replay harness merged too (PR #100 Stage A,
PR #101's stack-reap fix); F6 moved to spec 2 by ruling, then split again.
**Spec 2 "state axes" (items 3 + 1 + F6) is now two PRs** (James's ruling,
design spec §4): **spec 2a** — axes, mirror surface, pause state, driver
lifecycle, the interval clock fix, the terminal path, the suspicion verdict
— MERGED (PR #102, 2026-08-16, `d7271a3`); **spec 2b** — F6
alone, the one piece carrying a stored-shape field (`endedBy`) and a
destructive action — MERGED (PR #105, 2026-08-16, `beaef4f`). **Spec 3
"redesign" is IN FLIGHT** (branch `cr2-redesign`; spec
`docs/superpowers/specs/2026-08-16-connected-redesign-design.md`,
approved 2026-08-16 with the design-gate rulings: tester colors and the
32px row ruling govern over the handoff's stale values; CAL/ZONE, the
pane slide, and the swipe handler are all OUT). **Queued follow-up, no
phase owner yet — "session calories, folded":** the PM design gate
falsified the handoff's calorie premise by decoding both walk-2026-08-16
recordings — 0x0033's `totalCalories` is INTERVAL-scoped (resets to 0 at
every boundary; keystone ends reading 15 for a ~30-cal session) and the
0x0039 summary carries no calorie field, so an honest session CAL needs
the same register-fold discipline spec 1 built for distance, plus an
honest ramping fake (today's emits a constant 0 — nothing can go red) and
a walk row photographing the PM5's calorie display beside the phone. ZONE
rides behind it, needing a strap plus a max-HR source the app does not
have. Neither is CR2's; schedule when a phase wants them.
**A fourth SDD cycle
rode the 2026-08-16 walk's own finding: the rest-keying fix (PR #104,
spec `docs/superpowers/specs/2026-08-16-rest-keying-fix-design.md`) —
the stale-count rest clamp plus both walk recordings as permanent CI
regression tests. RELEASE-NOTE OBLIGATION for the phase tag: connected
session totals now read LOWER and correct (two independent corrections —
#99's register map and #104's clamp — lower the same number); the notes
must say so plainly so a tester can check rather than guess. The phase
walk before the tag owes a REST-BEARING row with both screens in one
frame — the 2×250 r0 keystone contains no resting frames and cannot
exercise the clamp on hardware.** The reducer this spec
once proposed is DEFERRED to its own spec. Spec 3 "redesign" (items 2 + 4,
design handoff committed at `docs/design/handoffs/2026-08-15-connected-v2/`)
is MERGED (PR #109, 2026-08-17, `3dc3b06`) — ALL FIVE CR2 code cycles are
in main, and the exit walk's WIRE PASS ran the same day and PASSED
(`docs/monitor/sessions/walk-2026-08-17/`): the keystone re-run within
0.2m, PR #104's clamp fired twice live and keyed correctly, F6's row and
Log it landed, END finals written, the READY frame photographed, and
James's real-device screenshot banked the landscape-notch check. One
finding, F-1 (the 6-MIN reading), is UNREPRODUCED after a full bisect —
see the walk README; instrumented for re-observation. The close-out PR (#111)
and notes PR (#112) MERGED and v0.10.0 TAGGED 2026-08-17; the phone
pass's items (portrait rotation, mis-hit, triple-tap, the iOS-26 100dvh
portrait eye, the on-device bottom-gap ruling) plus F-1's re-observation
are OWED POST-TAG against the shipped build — counted at the next gate,
per the PW phase-open PM's own finding that they outlived the tag they
were meant to gate.
**Close-out queue after #109 merges, before the tag (PM phase-close gate +
antagonist exit pass, 2026-08-16):** (1) the STALE-WHILE-ARMED ruling —
stale beats armed in `connectedAxes`' precedence, so a link lost before
stroke one drops every armed protection at once (READY becomes a gold
session-left on GRID, up-next shifts, the bar fills); the exit walk's
Session 4 observation row records what it actually shows, then James rules;
(2) spec 2b's v1 fall-through test + the manual-door-save record decision
(PR #105 final review Minor 3); (3) the Start door's "in progress" copy for
a dead MonitorRun (2b plan Decision 5); (4) the CARRIED-DEBT DISPOSITION —
the exit criterion's own words are "cleared or explicitly re-parked with a
reason" and the eleven-bullet block below has zero dispositions; the
close-out PR writes one per bullet, with the iOS 26 `100dvh` bullet
getting a real answer (this PR rebuilt the surface height model that
construction underpins). **(5)-(7), James's walk-day flags (2026-08-17,
from the mobile-view screenshot):** (5) the landscape header sits flush
with the top edge where the safe-area inset is 0 — §2A's own 20px top
padding was dropped in favor of the bare inset; fix is
`max(20px, env(safe-area-inset-top))`; (6) dead space below the band,
MEASURED (close-out fix round, 2026-08-17): the visible gap under the
band = the pane's own 12px design padding (§2A's stated bottom padding)
+ the device's home-indicator inset; shrinking it means overriding the
handoff's own 12px in landscape and/or letting content approach the
indicator zone — James rules ON DEVICE at the phone pass; the
2026-08-17 close-out's first attempt moved the inset into the band's
unpainted box and changed nothing, reverted; (7) the landscape up-next
line prepends `NEXT · ` ALWAYS
(`NEXT · REST 3:00 · then WORK 2:09.0`, `NEXT · FINISH`) — James's
ruling direction: a bare `FINISH` floats without the label layer, and
uniform beats special-casing; portrait keeps its stacked `UP NEXT` label,
no double-labeling. **(8) the walk's 6-MIN question:** the F6 log header
showed `AUG 17 · 6 MIN` where the wire's completed intervals compute 5
(60+60+120 work + 0+30+30 rest = 300s); a NUMBER discrepancy → triad →
full treatment; reproduction assigned offline against the committed
session-2 wire + ring. Originally scoped by James 2026-08-13 immediately
after v0.9.0 shipped: "I want to work next on cleanup for this phase" —
three items, below. **AMENDED the same evening**, after he rowed "Sun
fret" on v0.9.0 and photographed the PM5 beside the phone: two more items,
and one of them (item 0) is a correctness bug in numbers the rower reads,
so it leads. **Items 2 and 4 are both going through Claude design first**
— they are the same question asked twice, and answering them apart risks
two answers. **Phase CP ("the pause that isn't") is folded in as
item 1 and no longer has its own section**; it was filed 2026-08-12 and
would otherwise be a second home for the same work. **Release deferred to
the whole phase** (James's ruling): CR2 releases only when specs 2 and 3
are both done; the walk rides the phase's next erg session, not this PR's
merge.
**Goal:** finish what Phase CR started. Everything here was found by the
wave itself, by its adversarial reviews, or by James on the erg, and every
item is written down with the evidence rather than the symptom, because
the phase is being PARKED at this line and whoever picks it up will not
have the conversation.

---

### Item 0 — The session totals are wrong on the wire (NEW, 2026-08-13, and the most serious thing here)

**Found by James rowing "Sun fret" on a real PM5, with the monitor
photographed beside the phone.** Two symptoms, almost certainly ONE cause,
and both are numbers a rower reads and trusts.

**Symptom A — TOTAL M is badly wrong.** The PM5's own screen read
`4384 m total` (interval 2, 3933 m in that interval, 2:17.3 average). The
app read **`TOTAL M 16938`** on the same piece at the same moment. Roughly
3.9x. An earlier shot in the same session, during interval 1's rest, read
`TOTAL M 12529`.

**Symptom B — TOTAL LEFT hit 0:00 during the FIRST rest and never
recovered.** The bar was fully filled with `WORK 2:15.0 · then FINISH`
still up next, and stayed that way through interval 2. James: "the progress
bar filled up prematurely at rest and never recovered."

**Why one cause is likely.** `surfaceModel.ts` computes
`totalLeftSeconds = max(0, totalSeconds - frame.sessionElapsedSeconds)`, and
the METERS cell is `frame.sessionDistanceMeters` — the same accumulator
pair. Over-accumulate the pair and you get exactly this: meters far too
high, and TOTAL LEFT driven past zero, where the `max(0, …)` clamps it
permanently.

**Where it lives.** `app/src/monitor/driver.ts:1681-1692`, "THE SESSION
FOLD". 0x0031's elapsed and distance both reset at each new work interval,
so the driver banks the previous interval's pair into
`offsetElapsed`/`offsetDistance` when it sees the clock DROP by more than
`SESSION_RESET_ELAPSED_DROP` (2 s, `:830`).

**THE CAUSE IS KNOWN. The hypothesis previously written here was WRONG on
both counts and is kept only so nobody re-derives it** (see
`docs/monitor/state-architecture-review.md` §F2, which measured it).

It guessed that the clock drops at work/rest boundaries. Measured on the
committed captures: work→rest **never** drops the clock (0 of 7 — it runs
straight through the rest), and rest→work drops exactly once and correctly
(4 of 4). An investigator following the old text would have confirmed four
boundaries, four banks, and found nothing.

**What actually happens:** the fold's founding premise — asserted in the
driver at `:1062-1063` and again on the public type at `types.ts:37-39`,
that "BOTH fields reset TOGETHER at each new work interval" — is false on
the wire. Across the captures there are 25 elapsed-drops over the 2 s
threshold and **9 of them do not reset distance at all**. Every one of
those carrying real distance is a TERMINATE: elapsed jumps backwards to a
smaller NON-ZERO value while distance stands exactly still (CSAFE-DEF
footnote 12, quoted in the driver's own comments twenty lines above the
bug). The fold banks a distance the machine never cleared, then keeps
counting it. Reproduced three times independently, twice through the real
`createPm5Driver`: a 24 m piece ended by Terminate reports **47.8 m,
exactly 2.00x**; a segment with no completed interval at all reports
108.4 m against a truth of 0.

**No threshold change fixes it** — six of the nine bad drops are between
11 s and 87 s, far above anything that still catches a real 60 s interval.

**The oracle previously prescribed here is also unsound** and would have
misled. It proposed summing the `boundary` actuals; the captures contain
zero events of that name (14 are `intervalComplete`), some intervals emit
none at all, and the two quantities are not the same thing even when both
are right — 0x0031's per-interval pair includes the trailing rest, and one
measured 30 s rest contributed **76.1 m** of coasting. On the one sound
segment in the record that oracle reports a 2.14x failure for a fold that
is correct. **The sound oracle is the sum of each interval's own final
pre-reset reading**, independent of the boundary path.

**The fix is a change of kind, not of tuning:** the accumulator is
edge-triggered where it must be level-triggered. The machine already
publishes an absolute Total Work Distance; the captures carry it
(`totalWorkDistanceMeters`, seven samples). Concept2 ship an
accumulate-it-yourself counter on ANT+ and an absolute total on BLE, and
we implemented the ANT+ model on the BLE interface. Still do not revert
the fold blindly — it was the walk-4 fix for the opposite bug (TOTAL LEFT
rising at interval 2, METERS falling 109 -> 50).

**AND IT IS A PREREQUISITE, NOT A PARALLEL ITEM.** The same nine lines
that overcount today undercount by up to the whole session across a link
gap: a measured 237.0 m reported for a 455.1 m piece, and one outage shape
where an entire 261 m interval vanishes with no event, no log line and no
visual difference. A fold cannot survive a gap by construction. **The
parked reconnect work depends on fixing this first.**

**Do R0 before designing anything.** `logSummaryTotals`
(`driver.ts:2001-2018`) already prints 0x0039's decoded whole-workout
totals; it does not print the accumulator. Add
`sessionElapsedSeconds`/`sessionDistanceMeters` and
`raw.totalWorkDistanceMeters` beside them, plus a `divergence` entry when
the fold banks. One string, no behaviour change. On "Sun fret" it would
have printed `0x0039 decoded: distance=4384m` next to an accumulator
holding 16938, in the app's own stash, with no camera — and BOTH of this
item's verification routes are blocked without it, since the iPhone has no
per-frame capture, only the ring.

**What makes this findable now and not before:** the erg's own total was
photographed next to the app's. Any fix should be walked the same way, with
both screens in one frame.

**REPRODUCIBLE WITHOUT HARDWARE — and already reproduced.** The captures in
`docs/monitor/sessions/` were replayed through the real `createPm5Driver`
during the architecture review and the overcount falls out at 2.00x on the
Terminate segment. Use the SOUND oracle described above (each interval's
final pre-reset reading), not the boundary sum. Write the failing test
first; it fails today on committed data.

---

### Item 1 — Fix the pause behaviour (was Phase CP)

**The confirmation, from our own record.** There is no paused state on the
PM5 wire. `MonitorFrame.state` is
`idle | armed | rowing | resting | finished | terminated`, its own comment
says "There is NO paused state on the wire", and a test asserts `state`
never equals `"paused"`. We send the monitor nothing when we show PAUSED:
no pause command exists in the driver, and none is implementable — the PM
starts on the first stroke and `SET_STARTTYPE` is `<Not implemented>` in
rev 0.27. **The clock keeps running**, on hardware: the 2026-08-08
recording shows LEFT IN INTERVAL counting 4:38 -> 3:47 with meters pinned
at 30, split at 4:16.1 and rate at 68. That fact is already load-bearing —
it is WHY `elapsedSeconds` is excluded from `freezeKey`, since a key
containing a running clock never repeats and PAUSED could never fire.

**So one word means opposite things on two surfaces the revamp taught to
look alike.** On the phone timer `pause` is a COMMAND: `engine.ts` sets
`pausedAt` as the clock's right edge and `resume` folds the span into
`pausedTotalMs`, so time genuinely does not accrue. In connected mode
PAUSED is an OBSERVATION derived from three metrics freezing for
`PAUSED_FRAME_HOLD` frames. Nothing is suspended; the interval is draining
the whole time the word is on screen.

**And the block hides the evidence.** `.connected-paused` is
`position: absolute; bottom: 0; height: 52px` on an opaque `--ink` fill, so
it OCCLUDES TOTAL LEFT and the progress bar — the two elements that would
show the clock still running. James confirmed this on hardware
2026-08-13 ("the total left") and ruled it into this phase rather than
judging it in isolation: "we're revisiting pause in a future phase because
it's fake."

**Open questions, none decided:**

1. Is the honest word STOPPED, or RESTING, or "NOT ROWING"? `PULL TO
RESUME` already carries the instruction; the noun above it overstates.
2. Should the block stop occluding TOTAL LEFT and the bar — or go further
   and make the still-draining clock the LOUDEST thing on screen while the
   rower is stopped?
3. Does the phone timer's real pause deserve visual separation from the
   connected observation, now that they share a design language?
4. Is there anything worth doing about the underlying reality — telling the
   rower how much of their interval they spent stopped, on the finish
   screen or in the log?
5. Distance intervals are UNWATCHED. The clock is expected to run on them
   identically, but the freeze has only ever been observed on a timed
   piece (the caveat `PAUSED_FRAME_HOLD` already carries).

**Also here:** the paused RATE hero has no suppression equivalent to the
split's (`livePace` suppresses at `surfaceModel.ts:367-370`; `rate` has
nothing at `:441-446`), so a stopped rower sees a dash beside a pinned
nonzero rate, both labelled NOW — and `surfaceModel.test.ts:558-583` has a
rate-shaped hole in its `paused` describe that hid it.

---

### Item 2 — Move the live/grid controls

**James is commissioning a design recommendation for this one** (his words,
2026-08-13: "i'll have claude design make a recommendation"). Do not
implement ahead of it. What follows is the constraint envelope any
recommendation has to live inside — all of it measured or primary-sourced
this week, in `<scratchpad>/revamp-artifacts/notch-research.md` (993 lines,
111 cited URLs, claims tagged PRIMARY/SECONDARY/INFERENCE) and
`gutter-thin-report.md`.

**What James wants:** the gutter thinner, the display wider. His own
framing: "what if we just always put the controls on the opposite of the
notch? And have a thinner band there? Goal is to maximize width used for
display."

**Six facts that bound it:**

1. **Apple states the landscape side inset protects the sensor housing AND
   the display's rounded corners**, and says to inset controls to avoid
   both (Tech Talk 801). The corner is not spare space.
2. **The corner, not the camera, sets the floor.** On these devices the
   landscape inset is almost exactly the corner radius (55 vs 59; 62 vs
   62). LIVE and GRID sit in the two corners. Pushed to the edge, the LIVE
   target loses 14% of its area off-display at r=55 and 19.6% at r=62 —
   an effective 40.8x40.8 against a hard 44x44 rule. Measured in James's
   own photos: the display boundary cuts 23.5-24.4px into the target.
3. **The notch's vertical extent is obtainable by nobody.** `css-env-1`
   defines four scalars; the variables we would want are CSSWG issue #4721,
   open and unimplemented since January 2020. The corner radius is private
   API even natively.
4. **The island is not a fixed size.** Apple publishes 230pt compact and
   371pt expanded while a Live Activity runs; at expanded, both targets sit
   inside it.
5. **iOS reports the inset on BOTH sides regardless of which side the
   housing is on** (44/44 through 68/68), and CSS cannot tell which side it
   is — by design. But `screen.orientation.angle` (90 vs 270) CAN, and that
   is the hinge James's idea turns on. It needs a device spike: the shell
   must be shown to report it correctly and update on rotation.
6. **Device spread matters** — deployment target is iOS 15.0, where the
   clearance collapses to 1px on a 12 mini and 6px on an X.

**Therefore:** switching sides alone reclaims nothing, because all four
corners are rounded. The win only exists if the switchers ALSO leave the
corners for the middle of the edge, which is the one region clear of both
the housing and both corners. Then the notch side keeps its content
clearance and carries no controls, the other side needs only the 44px the
targets occupy, and content goes from roughly 676 to roughly 738.

**What that costs, and what the design recommendation must rule on:** the
rail changes sides when the phone is rotated; the switchers move from the
corners to the edge's middle, changing thumb reach; and JavaScript enters
layout, on a screen read mid-piece.

**A 65px middle path exists and was rejected for now** — the corner-radius
floor rather than the camera's, a 37% narrowing with both targets whole and
content unmoved. It hard-codes a radius `env()` never exposes and that
already grew 55 -> 62 on the 16 Pro, and it still sits inside the strip the
OS expands its island into.

---

### Item 3 — Handle the red 0

**The symptom:** before the first stroke the PM5 reports `spm: 0`, a real
number, so it is judged against the rate target and the hero paints RED.
The screen tells a rower who has not started that they are behind. The
split has no reading at all, so it renders the house DASH at
`--size-hero` — a 104px black rectangle. James, at the erg: "spm starts red
as 0 but should start -".

**It is not a value bug, it is an unmodelled state.** `surfaceStatusFor`
returns `null` for `ready` and `surfaceModel.ts:397` launders it with
`?? "live"`, while `ConnectedInterstitial.tsx:486-536` falls through to the
surface with the phase still `ready` the moment the rower taps "Show me the
numbers". **The whole model is told LIVE while the machine is ARMED.** The
red zero is one symptom; `nowLabel` reading NOW, the gold counting-cell
mark, and a full TOTAL LEFT bar are the others.

**A zero-rule would be wrong.** An armed PM5 reports the PREVIOUS piece's
rate — eight armed frames in our own captures read 13/16/43/46/50/80/88/96
with matching nonzero splits. So on piece TWO of any session the hero shows
a large number judged BLUE at a rower who has not pulled. James's "leave
spm 0" ruling covers the red zero and does not cover that.

**JAMES'S DESIGN DIRECTION, and the whole answer to the seam question**
(2026-08-13): "Let the erg drive. That's our golden rule. Match the erg,
even in pre-row state." The erg in WAITTOBEGIN does not tell a rower they
are behind. Mirror the machine; do not judge before the first stroke. That
keeps 0 on screen (0 is what the erg shows) and removes the verdict.

**HARDWARE QUESTION OWED, and it decides the fix:** on piece TWO, before
the rower pulls, what does the PM5's own screen show for rate? Our captures
prove the WIRE carries the previous piece's value; whether the MONITOR
displays it is unknown, and it decides whether we blank or mirror.

**Two traps for whoever implements this.** `transports/fake.ts`'s
`zeroedStatus` zeroes spm and split on re-arm, so tests written against the
carried-over case pass while proving nothing. And there is currently **ZERO
honest coverage of the armed state**: `buildSurfaceModel` is never called
with `phase: "ready"` anywhere in the tree, while `surfaceModel.test.ts:265`
pins `surfaceStatusFor("ready") === null` — the suite certifies both halves
of the contradiction separately and never composes them. Fifteen browser
tests walk THROUGH the broken state via `walkToSurface()` and immediately
`pumpUntilText()` past it. The gap is a missing fixture, not a missing
capability.

---

### Item 4 — Small type is unreadable at full pull (NEW, 2026-08-13)

**James, after rowing "Sun fret":** "any font smaller than WORK above the
target bar is hard to read. Not a problem in some places but makes
'warm-up', '1 of 2' and the 'now' above targets very difficult to read when
at full pull."

**He wants this worked through with Claude design**, alongside item 2 — the
two are the same question asked twice (what a rower can actually resolve
mid-stroke at arm's length), and answering them separately risks two
different answers.

**What is implicated.** Everything at `--size-label` (10px) and the
interval caption on the connected surface: the `WARM-UP` / `1 OF 2 · WORK`
line top-right, the `NOW` above each hero, `TARGET`, and the metric row's
own labels (`LEFT IN INTERVAL`, `TOTAL M`, `HR`). The `/500m` and `SPM`
units added the same day are the same size.

**Note the tension before redesigning.** Arm's-length legibility of the
BIG numbers was verified on hardware the same day and passed — "yes",
both heroes and the grid rows readable mid-stroke. So this is specifically
about the small supporting type, and the fix cannot come out of the heroes'
budget without re-walking (c). The landscape metric row already fits three
labels on one line, which is why `TOTAL M` is abbreviated at all.

**Related, already recorded:** the `--ink-4` floor (5.29:1 on `--surface`,
4.76:1 on `--page`, and BANNED at this size against `--surface-sunken`
where it measures 4.48:1) constrains how much contrast can be traded for
size, and `design.spec.ts`'s `assertNoFailingInk4Labels` sweep enforces it.

---

### Infrastructure — PM5 record-and-replay harness (NEW 2026-08-15)

**Not a rower-facing item — filed here because this phase is where it pays
off first.** Serves CLAUDE.md recurring failure #11 (when the machine
reports a number we also compute, compare them) by making that comparison
possible in CI with no hardware. Full design, research pass and scope
ruling: `docs/superpowers/specs/2026-08-15-pm5-record-replay-design.md`.

**Stage A — shipped this PR.** The recording tap
(`app/src/monitor/transports/recording.ts`) captures every transport event
unfiltered and undecoded (scan, connect, subscribe, notification, write,
disconnect) behind the existing `fakeMonitorEnabled` gate, dev-only and
dead-code-eliminated from production; a "Download recording" control in the
connected log sheet's diagnostics saves it gzipped via the
`window.__pm5Recording__` seam. The barrier-gated replay transport
(`replay.ts`) holds recorded rx events until the driver issues the matching
recorded write, never on the recorded clock — a recorded gap between
subscribe and the first programming write is how long a rower took to press
a button, not a delay replay should reproduce. A record-to-replay round trip
over a synthesized session (the fake transport driven through a real
`createPm5Driver`, replayed into a fresh driver, outputs compared) proves
the tap and scheduler; `app/scripts/dist-grep.sh` carries a new
`pm5-recording/v1` string-literal needle, proven to bite.

**Stage B — gated on spec 2's hardware walk**, which must run Chrome/Web
Bluetooth from the dev server with the recording tab foregrounded (the
phone's native adapter routes past the tap and records nothing). **The walk
protocol opens with a download dry run, before any rowing** (PM final-gate
note, 2026-08-15): no test can reach `downloadRecording`'s gzip arm under
jsdom, so the one file the walk exists to produce is written by an
untested path. Chrome exposes `navigator.bluetooth`, so the tap and seam
exist before any PM5 connection: open the connected screen, open the log
sheet, click Download, gunzip the file, run it through `parseRecording`.
Two minutes, no erg; a failure found here costs nothing instead of a
re-walk. Evaluate exit criterion 2's inter-arrival distribution BEFORE
trusting the walk's numbers — the tap now sits in the walk's own path and
is a suspect that did not exist last time. A Vitest
CI rung drives the real driver through the committed real recording and
asserts our derived totals against the machine's own wire numbers, decoded
by a reader that never shares code with the driver under test. Exit
criteria, each independently falsifiable:

1. **The keystone replays** — a recorded 2x250m r0 row reproduces the
   accumulator against machine TWD to the re-walk's tolerance, with no
   hardware and zero divergences.
2. **Recording does not change the session** — the walk's app numbers still
   agree with the photographed PM5 screen, and the recorded 0x0031
   inter-arrival distribution matches the committed baseline.
3. **The rung can go red** — a deliberate mutation of the register map's
   write rule turns it red; restore, green.
4. **The instrument captures the boundary** — every work/rest boundary in
   the walk carries the full 0x0031 state-byte sequence and every 0x0033
   sample with its Interval Count, in arrival order.

**UI replay rung — filed as a spec 3 follow-on, not this phase.** The
full-UI e2e rung and the dev replay viewer are cut from Stage A/B: the
surface they would assert against is what spec 3 is about to rebuild
(`docs/design/handoffs/2026-08-15-connected-v2/`), and asserting byte-level
injection needs a type `FakeScript` doesn't have (it is semantic, not
byte-carrying).

**Tier 2 on-device recording — trigger-gated, not scheduled.** Fires only
when a defect surfaces on-device that the dev/web recorder cannot see.
Prerequisites before it is built: a hard byte bound, a persist trigger that
is not the terminal transition, an export path that exists (there is
currently zero IndexedDB in `src/`), and the on-device delivered rate
confirmed. **The on-device rate cannot come from this phase's dev/web
walk** — the iOS cadence is already documented as a platform difference
(~90-180ms status-tick spacing vs the desktop's ~2/s,
`pm5-interface-notes.md` §21 item 3), not something a desktop walk can
measure.

---

### Carried debt — DISPOSITIONED at phase close (2026-08-17, the exit's own "cleared or explicitly re-parked with a reason" clause)

- **Correct the record first (the rotation-fix artefact).** CLEARED —
  `DEVIATIONS.md`'s safe-area row was amended 2026-08-13 with exactly this
  truth (the `max()` is INERT on iOS, KEPT for Android's `DisplayCutout`),
  and spec 3's safe-area relocation carried the corrected story into the
  moved declaration's own comment.
- **`MONITOR_SPM_MIN = 0`** persists a zero average rate as real. RE-PARKED
  — still true at `logDraft.ts:677`; changing the floor changes what gets
  PERSISTED (a dropped-vs-kept reading), which is triad territory, not a
  close-out one-liner. Owner: **Phase LT spec 1** (re-owned 2026-08-18;
  Phase LG closed without it — the floor becomes 1, justified by the
  field's u8 type).
- **The phone timer's landscape gutter absorbs no left inset.** RE-PARKED —
  untouched by CR2 BY RULING (spec 3's fork condition: the redesign must
  not reach the phone timer). Fix known and cheap; owner: the next phase
  that touches the timer surface.
- **Portrait's dead 26px on the connected surface.** CLEARED by
  supersession — spec 3 rebuilt the portrait frame outright (54px control
  bar as the last row, full-height column) and re-shot every portrait
  capture; the live pane's no-dead-scroll assertions pin the new frame.
- **`LEFT IN INTERVAL` wraps to two lines.** CLEARED by deletion — the cell
  no longer exists (spec 3 cut it from LIVE; the countdown lives in the
  grid's active row).
- **iPhone 17 / Air 20pt landscape top inset.** CLEARED by ruling — spec 3
  §1: no device constant assumed anywhere; the header honours
  `env(safe-area-inset-top)`, the close-out added the `max(20px, …)` floor,
  and the grid's visible-row count is pinned at zero inset with scrolling
  under any nonzero one.
- **`height: 100dvh` under `viewport-fit=cover` broken on iOS 26 (WebKit
  315945).** RE-PARKED WITH EVIDENCE — the construction survived spec 3's
  rebuild unchanged, and James's real-device landscape screenshot
  (2026-08-17) renders the full frame correctly; the phone pass's portrait
  check is the remaining eye. The WebKit bug stays open upstream; if the
  phone pass shows a broken height, it becomes a pre-tag fix.
- **`stableBoundingBox` returns an unsettled box after 20 rAF.** RE-PARKED
  — still true (`e2e/helpers.ts:59`); no gate has flaked on it since the
  design-assertion rewrite (the §2 sweep reads computed style far more than
  boxes now). Infra hygiene; owner: next e2e-touching round.
- **`stack-env.sh` port collision odds (`% 400` vs `% 100000`).** RE-PARKED
  — still true (`stack-env.sh:29-34`); with per-worktree stacks torn down
  at merge per the standing teardown rule, live-stack counts stay low
  single digits and the birthday odds are negligible in practice. Infra;
  fold into the next scripts change.
- **The ordinal-guard substitute (less `frame.state`-to-surface integration
  coverage).** CLEARED by supersession — 2a's exhaustive axes table plus
  spec 3's per-frame property sweep (armed/live/stale/finished each with
  named e2e witnesses against real fixtures) now cover the state-to-surface
  path more heavily than the pre-CR wave did.

**Exit:** items 0-4 shipped and walked on a real PM5, R0 and F7 (spec 1) and
F6 (spec 2) delivered, and the carried debt either cleared or explicitly
re-parked with a reason. (The record correction that was listed here
shipped early, in PR #91. R0/F6/F7 were added to the phase 2026-08-15,
inside spec 1's and spec 2's scope, without this line naming them until
now — PM ruling.)

**Walk the exit the way item 0 was found:** the erg's own screen
photographed in the same frame as the phone's. Every number this phase
touches — session metres, TOTAL LEFT, the interval count — is checkable
against the monitor, and the app disagreeing with the erg by 3.9x survived
a nine-task wave, three adversarial reviews and a five-item hardware walk
because nobody had put the two displays side by side.
