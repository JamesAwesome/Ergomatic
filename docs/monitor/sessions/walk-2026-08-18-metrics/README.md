# Phase CM exit walk — 2026-08-18 (PR #123, the connected metrics)

**Verdict: every hardware criterion PASSED, and the walk closed Phase CS's
open swipe question as a bonus.**

Medium: Chrome on the laptop (Web Bluetooth + the recording tap) against a
real PM5 (432331249), stack built from branch `connected-metrics` at
`51cd9ea`; plus a native build on James's iPhone for the zero-stroke swipe
leg. Rowing: one piece, 1300m programmed, all three intervals to
completion — inside the approved budget.

## Provenance

| Artifact | What |
| --- | --- |
| `pyramid-pm5-recording-1787090555458.jsonl.gz` | The full wire recording of the pyramid (1087×0x0031, 1086×0x0032/0x0033, 4×0x0037/0x0038). **The repo's first varied-target rest-bearing capture** — the one criterion 3's value-based catch has been waiting for. |
| `summary-screen.png` | The post-session summary (criterion 2's third total). |
| rest-1 / rest-2 photos | Same-frame laptop+PM5, transcribed below; originals retained by James (large HEIC). |

**Program (Walk Pyramid, distinct targets):** `w 300m 6k @22 r1 · w 700m
6k-4 @24 r1 · w 300m 6k+4 @22` — last interval deliberately rest-free, so
the session ends `rowing → finished` (the unsettled final-interval case).

## Criterion 2 — the totals against the machine (the Sun-fret protocol)

| Instant | PM5 (SCREEN) | App (SCREEN) | Δ |
| --- | --- | --- | --- |
| Rest 1 (photo) | `325 m total` | `325.4m` | 0.4m |
| Rest 2 (photo) | `1043 m total` | `1,042.1m` | 0.9m |
| Finish (wire + summary) | `1347` (TWD terminal) | accumulator `1346.7m` · summary DISTANCE `1347` | ≤0.3m |

**Three independent derivations — monitor, live accumulator, summary Σ —
agree sub-metre across one session.** The PM gate's "unproven equality"
condition is answered on hardware. (The planned mid-WORK photo was not
taken — soft-pedalling for a shot mid-piece proved impractical; the
mid-rest pair plus the wire-side reconstruction below covers the frozen-
counter case the mid-work shot was for.)

## Criterion 3 — the AVG at rest, against the machine's own average

Rest-2 photo, both screens in one frame:
- PM5: `Interval 2 · 2:11.7 ave /500m`
- App baseline row: `1:58.5  6K -4  AVG 2:11.7` — **digit-identical**, the
  FINISHED interval's own target beside it, judged **red (slower)**
  (2:11.7 vs 1:58.5), colour verified against the ink target beside it in
  the full-resolution crop.
- The chain held end to end: the same 2:11.7 appears on the summary's
  interval row 2. Wire: `0x0033` read 131.72 (=2:11.72) flat through the
  rest, agreeing with the `0x0038` boundary record.

## The final interval — the limit is confirmed, and the summary carries it

The session went `rowing → finished` with no trailing rest (ring seq
44-45); the connected pane never had a rest window in which to judge
interval 3. **The summary is where its verdict lives** (row 3: `2:19.1
+6.0`, red). Release notes must say so. Interval 3's boundary arrived
inside the finish grace and was recorded (3 of 3 actuals) — the driver's
handoff-hold behaving exactly as walk-5 designed it.

## Wire findings (decoded from the recording, not hand-gathered)

- **State 9 observed for the first time** (t=413187, the 700m boundary) —
  the distance-interval analogue Task 2's fix left un-gated with "zero
  occurrences in six captures". On THIS hardware the interval count and
  the state byte flipped on the SAME tick (count 1→2 arrived with state
  5→9, not before), i.e. no early-increment poison of the state-8 kind.
  The rest-2 photo proves the screen's referent was correct through the
  window. **Follow-up stands:** wire this capture into the replay suite so
  the state-9 path is pinned by test, not by photo.
- **TWD non-monotone excursion, second sighting:** 1347 → 1047 → 1347
  within 500ms mid-final-interval (ring seq 42-44), confirming the spec's
  "observed non-monotone" and vindicating the accumulator-not-TWD source
  decision — the display never flinched.
- **0x0031 cadence** ~450-540ms per tick throughout, consistent with the
  ~2.2/s baseline.
- **Terminal-frame artifact, minor:** the finished tick reported
  `spm=101` (ring seq 45) — a garbage stroke rate on the terminal frame.
  Nothing renders it (the pane is gone at finished), noted for the record.

## The swipe leg (zero strokes, native build, Swipe Long Grid armed)

The `pointercancel` readout produced its first field evidence — three
cancels, deltas on the record:

```
dx=-447.7 dy=-259.3   (~30° off horizontal)
dx=-420.7 dy=-250.3   (~31°)
dx=-575.0 dy=-281.7   (~26°)
```

All three were **horizontal-dominant** — our 45° rule would have paged
every one — and travelled 8-12× the threshold. WebKit claimed and
cancelled each mid-gesture. James: **"only the genuinely flat moved it."**

**Phase CS's open question is closed:** the intermediate band (~25-35° off
horizontal, inside a scrolling grid) is cancelled by WebKit's directional
lock — the behaviour the closed spec issue (#303/PR #351) says a UA SHOULD
NOT have, live on this device — and is NOT our threshold's doing. Flat
drags page; ≥45° is ours by design. The honest rower-facing line: drag
flat, or use the rail.

## Operator-experience finding (fixed this walk)

The lab card printed `http://localhost:PORT` while the stack's origin
allowlist derives from `SITE_URL = http://127.0.0.1:PORT` — the backdoor
403'd ("bad origin") until the tab used 127.0.0.1. Card corrected in
`walk-lab.sh` the same day. Recurring failure #13's shape, in the walk
tooling itself.
