# Phase LM PR 1, fix round 2 — the lost-monitor alarm keys on a measurement, not a guess

## What and why

On 2026-08-26 James took PR 1 to the erg and the red `LOST THE MONITOR /
Nothing kept.` banner fired the instant he tapped "Show me the numbers", then
kept flapping while he rowed. The link was never lost. His verdict: *"This is
REALLY FUCKING BUGGY."*

**That was a FAILED walk, not a blocked one.** Exit criteria 9 and 10 were never
attempted — the screen under test was unusable. Evidence:
`docs/monitor/sessions/walk-2026-08-26/`.

The alarm is raised by an app-lifecycle event that says nothing about the
monitor, **three lines before the code reads the evidence that refutes it**.
This spec makes the alarm key on the measurement that already exists.

## The finding, in one line each

- **Nine latches in 288 s**, three of them within five seconds of each other.
- **233 frames arrived across the nine supposed gaps**; `liveness-recovery`
  followed every latch within 3-72 ms.
- **The real measurement fired TWICE.** Two `liveness-silence` events against
  nine lifecycle latches — the watchdog disagreed with the proxy seven times
  out of nine, and the proxy won.
- **Banner up ≥ 90 s of 288 s.**

## Root cause (PRIMARY, implementation source)

`src/native/appLifecycle.ts` subscribes to `@capacitor/app`'s `appStateChange`,
which that plugin's own iOS source fires from
`UIApplication.didBecomeActiveNotification` / `willResignActiveNotification` —
**active/inactive**, iOS's transient-interruption signal. The same file wires a
separate **`pause`/`resume`** pair to `didEnterBackgroundNotification` /
`willEnterForegroundNotification` (`AppPlugin.swift:22-40`; both typed at
`definitions.d.ts:223,234`). We subscribed to the wrong pair.

`useMonitorSession.ts:2732` then latches `update({ frameSilence: true })`
unconditionally on foreground, and reads `framesWhileHidden` at `:2745` — after.

**Apple's own docs could not be retrieved** (JS-rendered; two fetches returned
titles only). This rests on the plugin's implementation source and the UIKit
notification names, not a paraphrase of Apple.

**The repo already held the observation and drew the wrong conclusion, twice.**
The handler's own comment names *"a Control Center swipe, a notification peek —
routine, not an edge case; reproduced empirically: 30 healthy frames over 15s,
banner still up"* — and a prior review fixed the RECOVERY path instead of asking
why it fired. Phase LL minor 9 disarmed the **web** arm for the identical
symptom and filed it as a platform difference. It was never a platform
difference; both arms fired on a transition that says nothing about the stream.

## The blast radius is wider than a banner (EM, verified)

`frameSilence` is not just the banner. It drives `deriveLink() === "lost"`
(`connectedAxes.ts:178`) → `surfaceModel.ts:811`'s `stale`, so every judged
value greys, pace and rate blank, the caption gains `· LOST`, and heroes gain
`LAST SEEN`. **The rower loses the live readout, not merely gains a banner.**

And it is the **arming gate for `applyContinuityCheck`**
(`useMonitorSession.ts:509`, `if (!frameSilence) return`), the detector that can
close a live run as `endedBy: "link-lost"`. Post-F2a an actual false close needs
TWD, elapsed and distance all backward in one reading, so the probability is
LOW — but **not zero, and it means this change touches the trigger of a
stored-record decision. NOT fast path.**

## What we are NOT allowed to conclude

**All nine events measured `active`/`inactive`. ZERO were real backgrounds.**
So the ring proves the trigger is wrong and says **nothing** about whether a
genuinely suspended WebView serves stale frames on resume. Deleting lifecycle
distrust is not licensed by this evidence — that would be recurring failure #11
in its amended form, an oracle measuring a different quantity. W6 stays open.

The watchdog is also **not** self-sufficient in the case that matters: a drained
backlog **rearms** the timer (`noteStatusArrival` → `rearmTimer`), so stale
arrivals can silence the very watchdog we would be handing the whole job to.

## The decision

**Rejected — watchdog only.** The rearm hole above.

**Rejected — swap the event and keep latching.** It reduces frequency and leaves
the logic wrong: a genuine 800 ms backgrounding would still raise `Nothing
kept.` over a healthy stream. **The event swap must not be sold as the fix**, and
no walk can tell "fixed" from "less frequent" without a counter.

**Rejected — a soft middle banner ("we may have missed some").** Three reasons,
and the third settles it: we cannot populate it honestly (three producers of a
silence remain undistinguished), it carries no action, and **it is where false
positives get routed instead of fixed** — the instant it exists, the loud one
keeps its bad predicate forever. The honest third state is temporally elsewhere
(see "Filed, not built").

**CHOSEN.** Two changes, and the second is the fix:

1. **Subscribe to `pause`/`resume`** rather than `appStateChange`, so the
   trigger means what its name says.
2. **On resume, evaluate rather than assert.** Read the liveness snapshot we
   already hold (`LivenessSnapshot.lastArrivalMs`, `liveness.ts:91`) against the
   same `Date.now` clock (`useMonitorSession.ts:1370`) and latch **only** if the
   measured gap ≥ `SILENCE_THRESHOLD_MS` (2500), or `snapshot.silent` is already
   true. Otherwise record the resume and the frame count in the ring and change
   nothing.

`Date.now()` is wall-clock and advances *through* an iOS suspension, which is
exactly the direction this predicate needs. Edge: a negative gap (NTP step
backwards) is **no evidence** — do not latch; let the watchdog own it.

**Do NOT call `markSuspect()` when not latching.** It does `stopTimer(); silent
= true` — with no latch and no further arrival to rearm, `onSilence` could never
fire, and a resume followed by genuine total silence would show nothing at all.
Leaving the pending timer alone is the fail-safe: the clock advances through
suspension and the timer matures on resume.

**Patterns invoked, by name:** alarm on the **level** (stream health), not the
**edge** (a lifecycle event) — use the edge only as a prompt to re-measure.
Corroboration before alarming, with the corroborating evidence **read rather
than awaited** (which is why "wait 2.5 s and see" is rejected: past silence is
already recorded, so a real background latches instantly). Fail-closed when the
measurement says the gap was real, fail-open when it says frames never stopped.
The 10 s retract hysteresis is correct and untouched.

## The red stays

**Prominence and trigger were approved together at Gate 0 and must be judged
apart.** The treatment is right — a genuine mid-piece loss deserves the loudest
element on the screen, and `--judge-slower` at 7.94:1 is the correct answer to
"do not trust these numbers." **Only the trigger is defective.** Softening the
red would pay for a trigger bug with the one signal that has to land. Refuse
that trade. No redesign, no re-approval, no re-capture.

## Tasks

**Task 1 — the trigger.** Failing test first. Both changes above, in one commit.
Add a unit test that **mocks `@capacitor/app` and pins the event strings** —
today's suite mocks `../adapters/appLifecycle` and `src/native/**` is
`v8 ignore`d, so **the wrong-event bug was invisible to the suite by
construction. That is why it shipped**, and the test that closes it is the point
of this task, not an extra.

**Task 2 — enumerate every `rowingActive` conjunction and state each one's
fate.** The premise is now FALSIFIED, not merely unobserved: the byte read
`false` through an entire real row. `surfaceModel.ts:915-918`'s
`midSessionMirror` already degenerates to a distance-only test. Correct
`pm5-interface-notes.md` fact 13, which records the byte as reliable. **No
behaviour change without evidence** — this task's deliverable is the enumeration
and the corrected note.

**Task 3 — make the diagnostics row render on a first-ever connected session**
(the row re-homed to Phase LM). Promoted from tidy-up to dependency: Task 2
requires measuring which path opens the record on every session, and that
instrument is invisible to exactly the tester most likely to hit it. One effect
in one component; needs its own test and mutation.

**Task 4 — teach the recording format about lifecycle, so this class stops
being untestable.** James asked the right question: *"why wasn't this caught by
replaying a normal-ish recording?"* Because it CANNOT be. **Four instruments are
blind to it simultaneously, by construction:**

| Instrument | Why it cannot see this bug |
| --- | --- |
| record/replay | `RecordedEvent` is `scan \| connect \| subscribe \| unsubscribe \| disconnect \| link-drop \| tx \| rx` (`recording.ts:14-27`). **No lifecycle event exists in the vocabulary.** The recorder sits at the transport seam; this bug enters from iOS above it. |
| unit tests | they mock `../adapters/appLifecycle` — the seam that is wrong is replaced by the test |
| coverage | `src/native/**` is `v8 ignore`d by policy, and that is the arm with the bug |
| e2e | runs on web, where the lifecycle arm is a deliberate no-op since Phase LL minor 9 |

Add a lifecycle event kind to `RecordedEvent` and have the replay driver emit
it, so a recording can carry "the app backgrounded here / foregrounded here" and
a desk replay can reproduce the whole class. **Then write the replay test that
would have caught THIS bug** — a recording with a healthy frame stream and a
lifecycle foreground in the middle of it, asserting the banner never raises.

The wider lesson belongs in `CLAUDE.md`, not only here: **our verification stack
stops at the wire. Any defect whose trigger enters ABOVE the transport seam —
platform lifecycle, permissions, backgrounding, OS interruptions — is invisible
to every gate we own.** Ask, for any new platform-sourced input: which instrument
would catch it if it were wrong?

## Exit criteria

1. A Control Center swipe and a notification peek produce **zero**
   `app-lifecycle` suspect latches.
2. A real lock/unlock produces **exactly one**, and only if the gap exceeded
   threshold.
3. **The stated bar, because this walk failed on a number nobody had set:
   ZERO suspect latches across a healthy leg, counted from the ring, with the
   ring showing the resumes did occur.** A count, not an impression.
4. The ring records every resume either way, with the measured gap and
   `framesWhileHidden`, and **its wording asserts no cause** — today's
   `"resumed from background"` line asserts one nobody checked.
5. Which path opened the record (declared vs fallback) is visible in the ring.
6. Re-walk leg A passes: `1 OF 1 · READY`, no banner, live numbers while rowing.
7. **A desk replay reproduces the old bug and proves the fix** — a recording
   carrying a lifecycle foreground over a healthy stream, red before the fix,
   green after. Until this exists, the only thing standing between this class of
   defect and a rower is James at an erg.

## Filed, not built

- **The honest "there was a gap" report belongs on the SUMMARY**, after the
  piece, where the rower has time and a decision — not as a mid-piece banner. It
  needs a new derived or stored fact, so it rides the `door`-column slot already
  queued for the next stored-shape change to the logs table.
- **`machineTotal` 0 ↔ 2000**: matches behaviour `continuity.ts` documents
  twice; TWD is never stored. Logged, no change.
- **Whether the 2.0/2.7/4.4 s cluster was four iOS transitions or one
  double-delivered by the plugin.** If the latter, the count is evidence about
  us, not iOS.

## Release note debt this uncovered

`releaseNotes.ts` (shipped, v0.17.0) promises the banner *"stays up until the
stream has been genuinely healthy for ten seconds, so it cannot flicker at
you"* — **it flickered nine times in five minutes** — and attributes the trigger
to *"a phone call taking the app to the background"*, **a CAUSE**, for something
that in fact fires on Control Center swipes and has never been observed on a
call. The phase's own cause-free constraint was already violated in a shipped
string, and #198's PM gate re-checked that item clause by clause and passed it.
**Re-checking an old note against the new CODE is not the same as re-checking it
against the CONSTRAINT.** The correction goes in the **v0.24.0** entry in full;
a correction appended to v0.17.0's entry has an audience of zero.

## Gates

Not fast path (it touches the trigger of a stored-record decision). Rides PR 1's
branch as its own commit with its own scoped review — the grouping tie-break
asks whether a reviewer must hold two unrelated risk models, and they need not:
PR 1's TRIAD weight is what a stored row claims; this is a live-screen
predicate. **One walk validates both, and the erg session is the scarce
resource, not the review.** PR 1 does not merge until a re-run walk passes.
