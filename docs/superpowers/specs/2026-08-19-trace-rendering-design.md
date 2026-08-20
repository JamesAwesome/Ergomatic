# The row, drawn: rendering the trace (Phase LT spec 3)

## What and why

Spec 2 started keeping a per-second trace of every connected session and
renders none of it. This draws it: one chart under the interval list that
answers the question the rows cannot — not "did I hit each target" but
what the row actually looked like. Where you faded, where you surged,
whether your rate drifted while your pace held. Pace by default; stroke
rate and heart rate one tap away.

**James's rulings (2026-08-19):**

1. **One session-wide chart**, under the INTERVALS list, on both the live
   summary and the from-the-log view. Not per-row sparklines, not a
   screen behind a tap.
2. **Pace draws by default; rate and HR are toggles.**
3. **Hand-rolled inline SVG, with the scale/axis primitives extracted
   from the first commit** so Phase 6J inherits a foundation. The
   library question was argued and MEASURED, not asserted: Recharts
   3.10.1, forced into the bundle behind a runtime gate (a first probe
   showed zero growth because tree-shaking removed an unrendered
   component — a false green, caught), costs **+94 KB gzipped, 153 → 247
   KB, a 61% increase** on the primary iOS surface. Deferred to 6J's own
   chart-spec design pass, which re-runs that probe against whatever
   candidate it favours, with four real chart requirements in hand.
   **Tripwire:** if 6J needs tick formatting, legends, stacked layouts
   and interaction, adopt rather than extend — swapping a module behind
   our own interface is cheap; removing a dependency from shipped iOS
   builds is not.
4. **Percentile clip, marked** — the vertical scale question spec 2
   handed forward.

## §1 The surfaces

| Property | Value |
|---|---|
| Hosts | The live summary (`PostWorkoutSummary`) and the from-the-log view — ONE component, two data sources, the same rules on both (spec 1's own two-renderers-one-rule discipline; `SummaryIntervalsBlock` is the precedent for a shared block) |
| Placement | Below the INTERVALS list, above the save stack on the live door / above the plan footer on the stored one |
| Live source | The session's own `MonitorRun.series` (the record the door already loads) |
| Stored source | The fetched log's `series` (`GET /api/logs/:id` carries it; the history list does not, and must not start) |
| ABSENT when | No series at all: every timer/by-hand session, every session logged before spec 2 shipped, and any whose trace was sacrificed at either storage boundary. **No chart, no empty frame, no placeholder** — the absence idiom this phase uses everywhere |
| Never | The history list (the column is deliberately outside its projection — a chart there would reintroduce the payload the list exists without) |

## §2 The chart and its module

| Decision | Value |
|---|---|
| Drawing | Inline SVG: one `<polyline>` per drawn measure over a `viewBox`, plus axis labels, boundary marks, and clip marks as plain elements. No canvas (the design sweep asserts computed styles and geometry — canvas is invisible to it), no dependency (§ ruling 3) |
| The module | `app/src/charts/` — `scale.ts` (linear domain→range mapping, percentile computation, the clip decision) and `axis.ts` (tick selection + label formatting) are SEPARATE from the trace component and know nothing about traces. 6J's bars and stacked bars consume the same two files or the tripwire fires |
| Styling | The app's own tokens only (`--judge-faster`/`--judge-slower` are NOT reused — a trace line is not a verdict; the line takes ink, the boundary marks `--rule-3`). Contrast computed with numbers in the report |
| Measures | `pace` (default), `rate`, `hr`. One drawn at a time — the toggle switches, it does not overlay (three lines on one axis with three units is a legend problem this spec does not need) |
| The HR toggle | ABSENT when no sample in the session carries `hr` — never present-and-disabled. A session whose early samples lack `hr` and whose later ones carry it is NORMAL (spec 2's cold-strap finding, device-witnessed): the line starts where the data starts, and the gap is not interpolated |
| Toggle idiom | The house segmented control (`PaceRefInput`/the connected LIVE\|GRID switcher are the shipped patterns — reuse, do not hand-roll; recurring failure #8) |

## §3 The scale — where the honesty lives

| Rule | Value |
|---|---|
| Vertical domain | The 5th-95th percentile of THIS session's own samples for the drawn measure, padded to a round number |
| Outliers | Drawn CLIPPED at the axis edge with a visible mark, never dropped and never allowed to set the scale. James's real 164 spm (short quick strokes at ~0.37 s between drives — a true measurement, spec 2's withdrawn finding) is the fixture |
| Pace direction | **INVERTED — faster is UP.** Everywhere else in this app faster is the good direction (blue, `UNDER · FASTER`); a pace chart where improvement points down would contradict the vocabulary the rower just learned |
| Rate/HR direction | Normal (higher is up) |
| Horizontal domain | The session's work seconds, 0 → the last sample's `t` |
| Render decimation | At most ~2 points per horizontal pixel, min/max preserved per column so a spike is never smoothed away. A 4-hour trace is 14,400 samples against ~350 px; drawing them all is slow AND a lie about visible resolution |
| Empty-ish sessions | Fewer than 3 samples (a session ended in seconds): no chart — a two-point line is noise, not a shape |

## §4 Interval boundaries come from the STEPS, never the trace

The series is a WORK clock: rests are absent by design (spec 2's proven
frozen-clock finding), so a gap in `t` is not a boundary and must never
be read as one. Boundary marks sit at each interval's cumulative work
seconds, computed from the log's own stored steps (`actualSeconds` where
present, the prescribed duration otherwise). A session whose steps and
series disagree in total length draws the marks it can and stops — it
never stretches either to fit the other, and the divergence is recorded
in the task report rather than silently reconciled.

## §5 Accessibility (this phase already got it wrong once)

Spec 1 shipped its new numbers invisible to screen readers and a review
caught it. A chart is worse: it is invisible by default.

- The chart carries a text alternative naming the measure, its range,
  and the direction of travel across the session (e.g. "Pace, 2:14.9 at
  the start to 1:58.2 at the end, fastest 1:56.0"), plus the interval
  count — computed from the same model that draws, never hand-written.
- The toggle is a real control with an accessible name per measure.
- 44px targets on the toggle; WCAG AA contrast on every new pairing,
  computed with numbers in the report.

## §6 Research note (house rule)

- **Mechanism:** nothing invented — SVG polylines, linear scales, and
  percentile clipping are standard. The library question was settled by
  MEASUREMENT (§ ruling 3), which is the repo's own rule for bundle
  claims (recurring failure #12), including catching the tree-shaken
  false green.
- **Does the system have the concept?** A per-second trace: yes, spec 2
  stores it and a device pass witnessed pace, rate and HR on real
  hardware. Interval boundaries within a trace: NO — the wire's clock
  freezes across rests, so boundaries exist only in the steps, which is
  why §4 reads them from there.
- Nothing found contradicting; the spec-2 handoffs (§6b of that spec)
  are carried here verbatim as §3's clip rule, §2's cold-strap rule and
  §4's boundary rule.

## §7 Exit criteria

1. Every §1-§4 row has a named witness; the absence cases (no series,
   <3 samples, no HR) each render NOTHING and are asserted as absence.
2. The clip rule proven with James's own 164: the rate chart's scale is
   set by the 5th-95th percentile, the outlier draws clipped WITH its
   mark, and removing the clip logic reddens the test.
3. The inverted pace axis has its own witness (a faster sample renders
   HIGHER — a coordinate assertion, not a class check).
4. Boundary marks derive from steps: a fixture whose series has a rest
   gap draws marks at the STEP boundaries, and a mutation reading them
   from the trace's gaps goes red.
5. Decimation: a 14,400-sample fixture renders ≤ ~2 points per pixel
   with min/max preserved (a spike survives decimation — red-provable by
   dropping the min/max rule).
6. The text alternative is asserted with real values on both surfaces;
   the toggle's accessible names and 44px targets witnessed live.
7. Captures: the summary and the from-the-log view each recaptured with
   a real multi-interval trace visible, opened and described, with the
   chart's own shape checked against the row values in the same frame
   (the sharpened recurring-failure-7 rule).
8. The notes clause for the release that ships this: your connected
   sessions now draw a trace — pace by default, stroke rate and heart
   rate a tap away; sessions rowed before this release have no trace to
   draw.

## §8 Vetted ground inherited

Spec 2's ground carries (the work clock and its rest freeze, the sound
sacrifice orderings, the storage numbers measured on device, the
instantaneous-vs-average spm distinction, the cold-strap normality).
Spec 1's carries (the absence idiom, the option-B vocabulary, one
component two renderers, the aria lesson). The antagonist pass is a
DELTA pass — this spec invents no mechanism and touches no stored shape
or wire semantics; the new ground is the scale/clip rule and the
steps-not-trace boundary rule, and those are what it should attack.
