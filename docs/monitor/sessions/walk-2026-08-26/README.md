# Walk 2026-08-26 — Phase LM PR 1, leg A. **FAILED.**

This walk did not fail to complete; **it failed**. Exit criteria 9 and 10 were
never attempted, because the screen under test spent roughly a third of the
session covered in a red banner claiming a loss that never happened. James, on
seeing it: *"This is REALLY FUCKING BUGGY."*

Recorded here because a fix is being specced from it, and hardware claims cite a
committed capture, never a conversation.

## Provenance

| Artefact | What it is |
| --- | --- |
| `phone-ring.json` | the diagnostics ring, verbatim, copied off the device (build 775, this branch at `86586ee`) |
| `phone-ready-screen-warning.png` | the ready screen. `KEEP THE SCREEN ON` renders correctly — the one thing that worked as designed |
| `phone-banner-at-show-me-the-numbers.png` | landscape, `1 OF 1 · READY`, `0m`, and the red banner **already up**, before a stroke was taken |
| `phone-banner-while-rowing-33m.png` | `1 OF 1 · WORK`, counter at 33 m and climbing, banner still claiming `Nothing kept.` |
| `phone-banner-while-rowing-64m.png` | same, 64 m, `LAST SEEN` captioning numbers that were live |
| `phone-retracted-pull-to-resume.png` | the banner retracted, `PULL TO RESUME` showing, link square filled |

No recording (`.jsonl.gz`) — the walk was abandoned before a download, and the
ring is what carries the finding.

## What the ring says, computed not eyeballed

Session span **288.1 s**. Figures below are from `phone-ring.json` directly.

- **Nine `app-lifecycle: resumed from background` events.** Gaps between them:
  7.4, 35.0, 13.6, 22.2, **2.0, 2.7, 4.4**, 186.9 seconds. Three of those gaps
  are inside five seconds of each other — nobody backgrounds an app four times
  in ten seconds while rowing.
- **233 frames arrived across the nine supposed gaps** (`framesWhileHidden` of
  32, 33, 7, 61, 27, 15, 18, 33, 7). Four carry `distanceIncreased=true`. The
  stream never stopped.
- **`liveness-recovery` follows each latch in 3 to 72 ms.** Every one.
- **The actual measurement fired TWICE.** Two `liveness-silence` events in the
  whole session, against nine lifecycle latches. **The watchdog — which
  measures whether frames stopped — disagreed with the proxy seven times out of
  nine, and the proxy won.**
- **Banner-up time ≥ 90 s of 288 s**, a lower bound: nine latches ×
  `BANNER_RETRACT_HYSTERESIS_MS` (10 s), and the 2.0/2.7/4.4 s cluster
  guarantees at least one unbroken block longer than that.

## Root cause (PRIMARY, implementation source)

`src/native/appLifecycle.ts` subscribes to `@capacitor/app`'s
`appStateChange`. **That plugin's own iOS source fires `appStateChange` from
`UIApplication.didBecomeActiveNotification` / `willResignActiveNotification`**
— iOS's *transient interruption* signal — while a **separate `pause`/`resume`
pair** is wired to `didEnterBackgroundNotification` /
`willEnterForegroundNotification`, the true background transitions
(`AppPlugin.swift:22-40`, and both are typed in the plugin's own
`definitions.d.ts:223,234`). **We subscribed to the wrong pair.**

`useMonitorSession.ts` then latches `update({ frameSilence: true })`
unconditionally on every foreground — **three lines before it reads
`framesWhileHidden`, the evidence that refutes it.**

**The repo already contained the observation and drew the wrong conclusion
from it.** The comment above that handler reads: *"a Control Center swipe, a
notification peek — routine, not an edge case; reproduced empirically: 30
healthy frames over 15s, banner still up."* A prior review fixed the RECOVERY
path so the banner would clear, and never asked why it fired. Phase LL minor 9
disarmed the WEB arm for the identical symptom and filed it as a platform
difference — *"a browser tab switch does not interrupt Web Bluetooth the way
iOS suspends a webview."* It was never a platform difference. Both arms were
firing on a transition that says nothing about the stream.

**Apple's own documentation could not be retrieved this session** (JS-rendered;
two fetches returned page titles only), so the active-vs-background distinction
here rests on the plugin's implementation source and the UIKit notification
names, not on a paraphrase of Apple.

## What this walk does NOT establish

**Whether a genuinely suspended WebView serves stale frames on resume.** Every
one of the nine events measured `active`/`inactive`; **zero were real
backgrounds.** So the ring proves the trigger is wrong and says nothing about
whether resume-distrust has a job left once the trigger is corrected. Treating
these nine as evidence that lifecycle distrust is unnecessary would be the
recurring-failure-#11 mistake — an oracle measuring a different quantity.
Walk item W6 remains open.

Also unestablished: whether the 2.0/2.7/4.4 s cluster was four genuine iOS
transitions or one transition double-delivered by the plugin. If the latter,
the count is evidence about us, not about iOS.

## Second finding, and it is not a footnote

**`rowingActive` read `false` on every frame of an entire real row**, including
`state=rowing elapsed=24.03 distance=32.9 rowingActive=false spm=24` (seq 34).
The decode is not misaligned — elapsed and distance advance sanely throughout.

The session only recorded because the five-frame distance-streak fallback
caught it (`rowing-active-fallback`, seq 34). `useMonitorSession.ts:989` states
the stakes plainly: on real hardware that byte *"is not a third confirmation,
it IS the gate"*, and a stuck-Inactive byte means silent total data loss.

**This is the fallback's first observed real save on hardware**, converting a
HIGH-1 hypothetical into measured behaviour — and it means the premise is now
FALSIFIED, not merely unobserved. Every predicate that ANDs `rowingActive` is
weaker than designed and needs enumerating; `surfaceModel.ts:915-918`'s
`midSessionMirror` already degenerates to a distance-only test.

## Third finding, corroboration only

`machineTotal` alternates 0 ↔ 2000 through the row (seq 29, 35, 39, 40, 41).
This matches behaviour `continuity.ts` already documents twice — the
distance-goal lag and F2a's flaky zeros — at the scale of a 2000 m program. TWD
is never stored, and RC-9c already retired the verdict that consumed it. No
code change; logged so the next reader does not rediscover it.
