# Walk 2026-09-03 — the resume edge, and the clock through a mid-work stop

**Purpose.** Two observations Wave F owed, in one 100-second piece:
the §4 resume-edge false positive (`2026-08-31-lifecycle-design.md` §4),
and the `rowingActive` row's item (d) — does `MonitorFrame.elapsedSeconds`
run or freeze when the rower stops pulling MID-WORK.

**Device and build.** James's PM5 (serial not captured this walk; firmware
not captured). Phone walk on the TestFlight build carrying #267's timing
instrument (any build ≥ v0.34.0). No recording exists — the recording tap
is a dev/web seam and native builds ship without it, so the diagnostics
ring is the whole evidence. Nothing here generalises past this device and
this run.

**Piece.** `93 | Walk Resume | O2 | easy | 1` — `w 2' 6k @20`, one
2-minute interval, no rest. Rowed ~100 s, ended by the app's End (the
row's own `endedBy=rower`, `terminate-sent` at seq 40-42).

**Evidence.** `ring.json` — the diagnostics export, 68 entries, seq 0-67,
copied from You → DIAGNOSTICS → Monitor logs. No photos.

## The timeline, from the ring

| seq | t (ms) | what |
|---|---|---|
| 24 | 1788434974193 | first rowing frame, elapsed 0.85 s |
| 26 | 1788435031575 | `liveness-silence` — stream quiet 2500 ms (phone locked) |
| 28 | 1788435031604 | `app-lifecycle` resume, **gap 35468 ms**, silent, latched |
| 29 | — | `resume-frames` phase=live **framesWhileHidden=1** rowingActive=true distanceIncreased=false |
| 31 | 1788435031705 | `resume-first-frame` gapMs=35468 **stale=false** rawRowingState=1 |
| 32 | 1788435032059 | `resume-first-frame` **nextGapsMs=[84,180,90]** |
| 33 | 1788435053839 | twd-sample elapsed **80.52 s** distance **247.1 m** |
| 34 | 1788435054021 | `pause-declared` frames=4 d=247.1 split=155.75 spm=26 **gapsMs=[90,90,180] sinceResumeMs=22417** |
| 36 | 1788435065449 | twd-sample elapsed **92.11 s** distance **249.6 m** |
| 43 | 1788435073280 | terminal frame elapsed 99.92 distance 271.9 |

## Finding 1 — §4's resume-edge false positive did NOT reproduce

The lock lasted 35.5 s and exactly one frame arrived while hidden; the
first frame back was **not** stale (`stale=false`, and `distanceIncreased`
false only because that single hidden frame had already been counted).
The three inter-arrival gaps after the resume were **84, 180, 90 ms**, and
the 22.4 s of rowing that followed declared **no pause at all**.

The one `pause-declared` in this ring is the GENUINE one: it fired at
`sinceResumeMs=22417`, seven seconds into the deliberate mid-work stop, on
a frozen 247.1 m with the elapsed clock still advancing. Its own four
frames arrived **90, 90, 180 ms** apart — the same shape as the
post-resume gaps.

**So timing does not discriminate on this device:** bunched ~90 ms
arrivals are this link's ordinary delivery, both after a resume and during
a genuine pause. And there was nothing to discriminate — one instrumented
capture of the exact gesture that produced the original complaint yielded
zero false positives.

**Ruling (James, 2026-09-03): §4 is UNREPRODUCED and INSTRUMENTED, and
closes as a Wave F exit item.** Designing a discriminator on a defect that
an instrumented capture of its own gesture cannot reproduce would be
inventing a mechanism. The instrument stays in; the next occurrence
arrives with `gapsMs` and `sinceResumeMs` already on it, and a design can
be built from numbers instead of from a story. Same posture as F-1
(6-MIN), CR2's unreproduced item.

## Finding 2 — the interval clock RUNS through a mid-work stop

Between seq 33 and seq 36, with the rower sitting still, **elapsed went
80.52 s → 92.11 s (+11.6 s) while distance went 247.1 → 249.6 m** (2.5 m
of flywheel coast, then nothing). The `pause-declared` at seq 34 is the
predicate seeing exactly that: four frames, distance frozen, clock moving.

This settles the residual `2026-09-02-door-partial-design.md` §5.1 marked
UNSETTLED at door PR B's PM gate, and it settles it in favour of the
spec's conclusion:

- `domain/monitor/types.ts:189-191` (*"There is NO paused state on the
  wire — mid-workout the clock runs whether or not the rower pulls"*) is
  **CONFIRMED for the mid-WORK case**, on this device, by the +11.6 s
  above.
- `domain/monitor/types.ts:134` (*"the per-interval clock … FREEZES
  whenever `rowingActive` goes false"*) is **correct only for its own
  measured case, a REST**. It over-reaches as written and is corrected at
  its site by this walk.

**Consequence for PR B (shipped):** `partialSeconds` is interval elapsed
INCLUDING any idle time before the close — which is what §5.1 already
says and what the row's copy already avoids deriving a pace from. No
shipped behaviour changes.

## What this walk did NOT settle

- Whether the false positive exists at all on other devices, other iOS
  versions, or longer backgrounds. One capture cannot show absence.
- The `rowingActive` byte's own value through the stop: this build's ring
  carries no raw-byte diagnostic (that is item (c) on the `rowingActive`
  row, still open). The clock's behaviour is settled; the byte's is not.
- `framesWhileHidden=1` at 35.5 s of background is one more sample for the
  suspended-not-throttled reading, not a new claim.
