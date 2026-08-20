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
   KB, a 61% increase** — and on iOS the honest cost is the RAW bytes
   and parse time (the bundle ships inside the app; nothing is
   transferred), which is +325 KB raw, 506 → 831 KB. Deferred to 6J's own
   chart-spec design pass, which re-runs that probe against whatever
   candidate it favours, with four real chart requirements in hand.
   **Tripwire:** if 6J needs tick formatting, legends, stacked layouts
   and interaction, adopt rather than extend — swapping a module behind
   our own interface is cheap; removing a dependency from shipped iOS
   builds is not.
4. **Full range of real readings, no clip** (RULED 2026-08-19 AFTER the
   antagonist's delta pass measured the percentile rule against the
   committed captures and broke it — see §3). Nothing is clipped,
   nothing is marked: the line shows what the row was, noise included.
5. **No interval boundary marks in this spec** (same pass: the stored
   shape provably cannot recover the warm-up the trace starts inside, so
   marks would land a whole warm-up too far left on the from-the-log
   view — silently. Cut rather than shipped broken or split across
   surfaces; §4 records the whole finding for whoever revisits it).

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
| Drawing | Inline SVG: one `<polyline>` per drawn measure over a `viewBox`, plus axis labels as plain elements (no boundary marks — §4; no clip marks — §3). No canvas (the design sweep asserts computed styles and geometry — canvas is invisible to it), no dependency (§ ruling 3) |
| The module | `app/src/charts/` — `scale.ts` (linear domain→range mapping, domain-from-readings with the per-measure floor) and `axis.ts` (tick selection + label formatting) are SEPARATE from the trace component and know nothing about traces. 6J's bars and stacked bars consume the same two files or the tripwire fires |
| Styling | The app's own tokens only (`--judge-faster`/`--judge-slower` are NOT reused — a trace line is not a verdict; the line takes ink, the axis `--rule-3`). Contrast computed with numbers in the report |
| Measures | `pace` (default), `rate`, `hr`. One drawn at a time — the toggle switches, it does not overlay (three lines on one axis with three units is a legend problem this spec does not need) |
| SENTINELS ARE NOT READINGS (antagonist, PROVEN on the captures) | `seriesRecorder.ts` stores `p: Math.round((f.currentSplit ?? 0) * 10)`, collapsing "no reading" and "the machine said 0" into the same stored 0 — and the wire really sends it: **26% of samples across the committed captures carry `p === 0`, 262 of them in state `rowing`, in 12 runs up to 85 s long**. A pace of zero is NOT a speed; on a faster-is-up axis it would render as infinitely fast, twelve times per session. **Every renderer treats `p === 0` as ABSENT** — excluded from the domain, excluded from the line (the line breaks, exactly as it does across a missing-`hr` stretch), never drawn as a value. Same rule per measure: an `spm === 0` sample is a stroke rate nobody rowed |
| Owed upstream, NOT fixed here | That collapse is a CAPTURE-side ambiguity in shipped code (spec 2). This spec renders honestly around it; a follow-up should decide whether the recorder omits `p`/`spm` at zero rather than storing a sentinel — a stored-shape question with its own gate. Recorded in ROADMAP, not smuggled in here |
| The HR toggle | ABSENT when no sample in the session carries `hr` — never present-and-disabled. A session whose early samples lack `hr` and whose later ones carry it is NORMAL (spec 2's cold-strap finding, device-witnessed): the line starts where the data starts, and the gap is not interpolated |
| Toggle idiom | The house segmented control (`PaceRefInput`/the connected LIVE\|GRID switcher are the shipped patterns — reuse, do not hand-roll; recurring failure #8) |

## §3 The scale — where the honesty lives

**RULED after measurement, not argument.** The original percentile-clip
rule was broken by the antagonist's replay of the committed captures:
excluding the `p === 0` sentinels entirely, a 5th-95th percentile still
clipped **~10% of the samples in every session** — instantaneous 1 Hz
pace is simply that noisy — so the "exceptional outlier" mark would have
fired dozens of times per trace while the exit criterion's tidy fixture
(steady rowing plus one 164 spm) passed. That is oracle blindness, and
it died before implementation.

| Rule | Value |
|---|---|
| Vertical domain | The FULL range of the drawn measure's REAL readings (sentinels per §2 excluded), padded to a round number. No clipping, no outlier marks, no percentile |
| Minimum domain height | A stated floor per measure (pace 10 s/500m, rate 6 spm, hr 20 bpm) so a near-constant session — `p5 === p95` is ORDINARY for `spm` and `hr` over a short piece, not pathological — never divides by a zero-height domain |
| Noise is shown, not smoothed | A jagged session draws jagged. Smoothing was considered and declined: it is a new mechanism that hides real spikes, and James's own 164 (short quick strokes — a true measurement) is exactly what a smoother would erase |
| Pace direction | **INVERTED — faster is UP.** Consistent with every shipped surface (the antagonist found none where faster is down; the neighbouring deviation bar draws faster LEFT of a centre tick, which does not contradict it) |
| Rate/HR direction | Normal (higher is up) |
| Horizontal domain | The session's work seconds, 0 → the last sample's `t`, computed ONCE over the session and shared by every measure — so a heart-rate line that starts a third of the way across (a cold strap, device-witnessed) reads as a late start rather than being re-scaled to look complete |
| Render decimation | At most ~2 points per horizontal pixel, min/max preserved per column, **computed PER MEASURE** (columns computed once on pace and reused would drop the rate's own extremes) |
| Real gaps | The captures carry 5-6 gaps per session, largest 41 s, from rejected reset candidates and dropped frames — NOT from rests (the work clock freezes; a rest crosses no new second, so it leaves no gap). The line BREAKS across a gap of more than 3 s and is never interpolated |
| Too little to draw | Fewer than 3 REAL readings **for the measure being drawn** — the gate is per-measure, so a session with 500 pace samples and 2 heart-rate samples offers no HR toggle rather than a two-point line |

## §4 Interval boundaries: CUT from this spec, and why

**Ruled out after the delta pass proved the derivation impossible on one
of the two surfaces.** The original design said marks come from the
stored steps' cumulative durations. Two independent breaks, both PROVEN
against the code:

1. **The warm-up hole.** The recorder opens at the first rowing-active
   frame, which is the WARM-UP (a real programmed interval), while
   `buildMonitorLogSteps` deliberately emits no step for a warm-up and
   `storedSummary.ts` states outright that the stored shape has nothing
   to derive one from. Every mark would land one whole warm-up too far
   left — a ten-minute warm-up displaces every boundary by 600 s — and
   the spec's own "totals disagree" guard would never fire, because the
   disagreement IS the warm-up.
2. **The fallback does not exist.** A work step carries `meters` XOR
   `seconds` by construction, so "the prescribed duration otherwise"
   resolves to `undefined` for exactly the case it was written for (a
   distance interval with no `actualSeconds`).

Also surfaced and worth carrying: the repo ALREADY has
`src/session/intervalBoundaries.ts` (fold, lead-in, warm-up cap, an
"honest stop" for an unpriceable piece, distance priced from its split)
— any future attempt reuses that rather than reinventing it; and
`actualSeconds` carries an unverified work-vs-work-plus-rest unit caveat
that is bounded per row (spec 1) but COMPOUNDS once cumulated, which
makes summing it new ground rather than inherited.

**This spec draws no boundary marks.** The chart answers "what did the
row look like" without them; the live and stored surfaces keep ONE rule
between them, which splitting the feature would have broken. Revisit
only if the chart reads badly without them — and if it does, the honest
route is storing what is needed (a stored-shape change with its own
gate), not deriving what the shape cannot support.

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
2. THE SENTINEL RULE, proven against a REAL capture (not a fixture):
   replaying a committed recording, every `p === 0` sample is absent
   from both the domain and the line, the line breaks there, and the
   domain's fast edge is set by a real reading. Red-provable by treating
   0 as a value. The same test states the measured share (~26% of
   samples in the captures) so the next reader knows the scale of it.
3. The inverted pace axis has its own witness (a faster sample renders
   HIGHER — a coordinate assertion, not a class check) AND the axis tick
   labels are asserted at their coordinates, so inverting the line while
   computing ticks off the un-inverted domain cannot pass.
4. NO boundary marks render on either surface (the §4 cut, asserted as
   absence so a future re-add is a deliberate act); and the line's
   gap behaviour is witnessed against a REAL gap from the captures
   (5-6 per session, largest 41 s — NOT a rest, which leaves no gap at
   all), not a synthesized one.
5. Decimation: a 14,400-sample fixture renders ≤ ~2 points per pixel
   with min/max preserved PER MEASURE (a spike survives decimation on
   the measure being drawn — red-provable both by dropping the min/max
   rule and by computing columns once and reusing them across measures).
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
