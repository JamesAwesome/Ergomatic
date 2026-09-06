# Phase LP — Logbook parity: every number Concept2 shows, and the same number

**What and why.** After a connected row, our summary shows the machine's
time, distance and average split, and a per-interval table of target
against actual pace. Concept2's logbook shows more for the same piece —
per split: watts, calories, cal/hr, heart rate, stroke rate; per session:
average stroke rate, target stroke rate, average power, total calories,
average cal/hr, rest distance, drag factor. James (2026-09-06): _"I want to
show everything that Concept2's logbook shows, with the exception of
weight class"_ — and, because our app now uploads to that logbook, _"I want
to be absolutely certain our numbers match Concept2's … in case somebody
uploads the workout."_ So this phase does three things that are really one:
it keeps every figure the PM5 already sends us per split and per session
instead of dropping it; it shows them on the post-row summary and the log
detail in a table a rower can scroll sideways, next to the target-vs-actual
table we have; and it sends them to Concept2 in the upload, so a rower who
opens the same piece in both apps reads the same numbers in both. Where the
logbook derives a figure rather than storing it (watts, cal/hr), we
reproduce Concept2's arithmetic exactly and prove it against a real logbook
row. Manual and by-feel rows are untouched. Machine rows saved before this
ships render `-` where the field never existed.

**Decisions James made in the brainstorm (2026-09-06):**

- **Machine rows only.** The new columns and tiles appear on PM5 rows;
  manual rows keep today's table with no dashes.
- **Dashes for old machine rows.** One table shape for every machine row;
  a field the machine did not send renders `-`, Concept2's own convention.
- **Reproduce Concept2's arithmetic exactly** for the figures it derives.
- **Extend the upload** to everything the logbook API accepts, so the
  logbook entry is as complete as ErgData's and equal to our screen.
- **Approach A** (read the machine; derive only what Concept2 derives) over
  B (compute from pace): the PM's calorie count on James's 6k is 372; the
  formula from its 162 W average gives 369. B cannot match.
- **Layout B + B** (visual companion, both mockups committed under
  `docs/design/logbook-parity/`): today's INTERVALS table stays as it is;
  a second table titled **MACHINE SUMMARY** (`PM5 · PER INTERVAL`) scrolls
  sideways beneath it with the `#` column pinned; six smaller tiles sit
  under the hero's three. James: _"can b say like 'machine summary' tho
  its more clear."_

**Gate class, spoken.** **TRIAD, twice**: PR 1 changes a stored shape
(new fields on `LogStep` and the log row) and PR 2 changes what numbers
mean on the wire (the upload). Full antagonist anchor pass on this spec;
PM at open (this slate) and close (the walk), plus a PM final gate on each
PR. **Gate 0 on the phone** for PR 1: the table and tiles rendered on a real
machine row, portrait and landscape, beside today's screen. This phase is
also the vehicle for the ROADMAP's owed **"say which number this is" design
pass** — its Gate 0 rule ("render the whole summary before and after, both
orientations") is this Gate 0 — and it closes the owed **Session calories**
row (0x003A is the honest total). Not fast path.

## 1. Research (the platform owns the numbers)

### 1.1 What the PM5 sends, and what we already decode

- **PRIMARY — the repo's own PM5 BLE research**
  (`docs/superpowers/research/2026-07-27-pm5-ble-research.md`, characteristic
  table): `0x0038` Additional Split/Interval Data carries _"Elapsed Time,
  Split/Interval Avg Stroke Rate, Work/Rest Heartrate, Split/Interval Avg
  Pace, Total/Avg Calories, Split/Interval Speed, Split/Interval Power,
  Split Avg Drag Factor, Split/Interval Number, Erg Machine Type"_, once
  per split; `0x003A` End-of-Workout Additional Summary 1 carries _"Log
  Entry Date/Time, Split/Interval Type & Size & Count, Total Calories,
  Watts, Total Rest Distance, Interval Rest Time, Avg Calories"_, once at
  workout end; `0x0039` carries the avg stroke rate, HR set, drag factor
  average and avg pace we already store.
- **PRIMARY — our decoder already reads most of it.**
  `app/domain/monitor/pm5/parse.ts` `parseAdditionalSplitIntervalData`
  (0x0038) returns `splitIntervalTotalCalories`, `splitIntervalAvgCalories`,
  `splitIntervalPowerWatts`, `splitAvgDragFactor`,
  `splitIntervalWorkHeartRateBpm`, `splitIntervalRestHeartRateBpm`,
  `splitIntervalAvgPace`, `splitIntervalAvgStrokeRate`,
  `splitIntervalSpeedMetersPerSecond`, `splitIntervalNumber` — and the
  driver keeps only pace, stroke rate and work HR on `IntervalActual`
  (`app/domain/monitor/types.ts`, `IntervalActual`: `avgSplit`, `avgSpm`,
  `avgHeartRateBpm`, `restDistanceMeters`). `parseAdditionalSummaryRest`
  (0x003A) returns only `totalRestDistanceMeters` and `intervalRestSeconds`;
  the frame's Total Calories, Watts and Avg Calories are not decoded.
  **The spec's first task is therefore a decode EXTENSION of 0x003A and a
  RETENTION change for 0x0038, not new wire work** — the antagonist's job is
  the byte offsets and units of the three 0x003A fields we add, transcribed
  from the CSAFE spec, and confirmation that `splitIntervalTotalCalories`
  is per-split (not cumulative) and `splitIntervalAvgCalories` is cal/hr.
  _Dangling citation to fix on the way:_ `driver.ts`'s 0x0039 comments cite
  `docs/monitor/interface-notes.md §23`, a file that does not exist in the
  tree (RF16 corollary); the decode task cites the CSAFE spec by field.

### 1.2 What the logbook accepts and what it derives

- **PRIMARY — Concept2 Logbook API documentation**
  (`log.concept2.com/developers/documentation/`, results resource, fetched
  2026-09-06; field tables transcribed):
  - Result: `distance` (int, m — _"for interval workouts this is work
    distance only"_), `time` (int, tenths — work only), `weight_class`
    (_"Required if type is rower"_), `stroke_rate` (int, average),
    `heart_rate` {average, min, max, ending, recovery}, `stroke_count`,
    `calories_total` (int), `wattminutes_total` (int), `drag_factor` (int,
    _"Average drag factor (to nearest whole number)"_), `rest_distance` /
    `rest_time` (interval workouts; tenths for time), `workout_type`,
    `verified` / `verification_code`, `workout` {splits | intervals | targets}.
  - Split/interval: `distance`, `time` (tenths, work only), `stroke_rate`,
    `calories_total`, `wattminutes_total`, `heart_rate` {average, min, max,
    ending, rest, recovery}, `type` (_"time, distance, calorie,
    wattminute"_), `rest_time` (intervals), `rest_distance` (variable
    intervals).
  - Targets (workout or interval level): `stroke_rate` (0–255), `pace`
    (tenths), `watts`, `calories`, `heart_rate_zone`.
  - **No `watts` and no calories-per-hour field is accepted anywhere.**
    INFERENCE from the tables: the logbook page's Watts and Cal/hr columns
    are derived server-side from what was uploaded.
- **PRIMARY — Concept2, "Pace and Watts Calculators"**
  (`concept2.com/training/watts-calculator`): _"watts = 2.80/pace³"_ and
  _"pace = ³√(2.80/watts)"_ where _"pace is time in seconds over distance
  in meters"_; worked example _"a 2:05/500m split = 125 seconds/500 meters
  or a 0.25 pace. Watts are then calculated as (2.80/0.25 ^ 3) …, which
  equals 179.2."_
- **SECONDARY — the cal/hr formula.** Concept2's calorie-calculator page
  gives only the body-weight correction (_"True Calories/hour burned =
  Calories on the PM − 300 + (1.714 × weight)"_, baseline _"175 pound/79.5
  kg"_). The watts→cal/hr relation `Cal/hr = 300 + 4 × W × 0.8604` is
  forum-sourced (c2forum.com t=206262) and is treated as a HYPOTHESIS to be
  measured, not a fact (§4.2).
- **MEASURED, James's logbook row (2026-09-06, the 6k, photographed):**
  summary `Ave. Power 162 W`, `Total Calories 372`, `Ave. Calories Per
  Hour 863`, `Drag Factor 101`, `Ave. Stroke Rate 26`; splits 157/164/162/
  162/167 W, 73/75/74/75/75 cal, 838/873/859/870/878 cal/hr, HR 55/55/55/
  55/170 (the last a belt artefact), 27/26/27/27/27 s/m; time 25:50.1,
  6000 m, pace 2:09.1. These are the oracle values for §4.2.

### 1.3 Prior art in this repo (RF18)

- ROADMAP "Session calories" row (open-item register): _"0x0033's
  `totalCalories` is INTERVAL-scoped … the 0x0039 summary carries no
  calorie field, so an honest session CAL needs …"_ 0x003A. This phase
  closes it.
- ROADMAP "The 'say which number this is' design pass (post-Wave F,
  unopened)": one Gate 0 for the whole summary, both orientations. This
  phase's Gate 0 is that gate; the chart-axis items in that pass are NOT
  in this phase's scope and stay listed there — the pass's Gate 0 is
  satisfied for the summary tiles and tables, not the chart.
- Wave E's verification spec (`2026-09-05-concept2-verification.md`) and
  the `weight_class` ruling (ROADMAP, 2026-09-03: _"I don't want that set in
  our app. I want it to be set on Concept2's side"_) — both untouched.
- `docs/monitor/sessions/` — the replay corpus §4.1 uses.

## 2. The record (PR 1, stored shape)

**Invariant:** every figure the app renders or uploads for a machine row
is either (a) a value the PM5 sent, stored verbatim at the time it was
sent, or (b) Concept2's own published derivation of such a value, computed
at render/upload time and never stored. Nothing else.

### 2.1 Per split — `LogStep` gains (all optional)

| Field | Source | Unit | Notes |
| --- | --- | --- | --- |
| `machineCalories` | 0x0038 `splitIntervalTotalCalories` | cal | the split's own total (antagonist: confirm per-split, not cumulative) |
| `machineCalPerHour` | 0x0038 `splitIntervalAvgCalories` | cal/hr | the wire's average; §3 says which cal/hr the screen shows |
| `machineWatts` | 0x0038 `splitIntervalPowerWatts` | W | provenance; the screen shows the derived figure (§3) |
| `machineDragFactor` | 0x0038 `splitAvgDragFactor` | — | |
| `machineRestHr` | 0x0038 `splitIntervalRestHeartRateBpm` | bpm | with existing `avgHr` (work HR) |
| `restSeconds` / `restMeters` | 0x0037 (already on `IntervalActual`) | s / m | per interval |

`avgHr`, `actualSpm`, `actualSplit`, `actualSeconds`, `actualMeters`,
`targetSplit` and the target rate are already there.

### 2.2 Per session — the log row gains (all nullable)

| Column | Source | Unit |
| --- | --- | --- |
| `machine_calories` | 0x003A Total Calories | cal |
| `machine_avg_watts` | 0x003A Watts | W |
| `machine_cal_per_hour` | 0x003A Avg Calories | cal/hr |
| `machine_rest_meters` | 0x003A Total Rest Distance | m |
| `machine_rest_seconds` | 0x003A Interval Rest Time | s |

`machineSummary` (0x0039: avg stroke rate, HR min/avg/max/ending/recovery,
drag factor average, avg pace) is already stored.

### 2.3 Ordering and lifetime (a stored-shape spec states these)

- **Migration is additive:** five nullable columns; `steps` jsonb gains
  optional keys. No backfill. No read path revalidates: every reader treats
  a missing field as "the machine did not send it" and renders `-`.
- **Deploy order:** server first (columns exist before any client writes
  them); an old client against the new server writes nothing new and reads
  nothing new; a new client against an old server is impossible (main is
  deployed before the tag).
- **The client-side `MonitorRun` (localStorage)** gains the same per-split
  and session fields at the point the driver builds `IntervalActual` and
  the summary; its lifetime is unchanged (one run, cleared by the door).
- **Authority:** for every field the machine is the only writer; there is
  no second producer to disagree with (contrast the two distance
  derivations the ROADMAP still owes a cross-pin for).

## 3. The screen (PR 1, Gate 0)

Rendered wherever a machine row's summary renders — the session door
(`PostWorkoutSummary`), the log detail (`FromTheLog`/`ReviewSession`) and
Just Row's log — one component, so one behaviour.

- **Hero, second tier** (mockup `02-summary-options.html`, option B): under
  AVG SPLIT · TIME · DISTANCE, six smaller tiles — **AVG WATTS**, **CALORIES**,
  **CAL / HR**, **RATE · TARGET**, **DRAG**, **REST**. Values: `machine_avg_watts`,
  `machine_calories`, `machine_cal_per_hour` (§3.1 decides derived vs
  wire), `machineSummary.avgStrokeRate` with the session target rate,
  `machineSummary.dragFactorAverage`, `machine_rest_meters`. A field the
  row lacks renders `—` in the tile.
- **Today's INTERVALS table is unchanged** — target, actual, Δ, the bars.
- **MACHINE SUMMARY** (`PM5 · PER INTERVAL`) beneath it (mockup
  `01-split-table-options.html`, option B): a horizontally scrolling table,
  `#` pinned (`position: sticky`), columns **SPM · HR · WATTS · CAL · CAL/HR ·
  DRAG · REST m**, with a bold **ALL** row first carrying the session
  figures. Sideways scroll, never wrapping; the scroll container owns
  `overflow-x: auto`, the pinned column paints `--page` with a soft right
  shadow so scrolled cells pass visibly under it. On the web and desktop
  the table simply fits when it can.
- **TARGET STROKE RATE:** Concept2 shows one session target; ours is per
  interval. The tile shows a rate only when every interval's target agrees;
  otherwise `—`, and the per-interval targets stay in the INTERVALS table.
- **Copy:** `MACHINE SUMMARY`, `PM5 · PER INTERVAL`, `ALL`, tile labels as
  above; units in the small trailing style the hero already uses (`m`,
  `s/m`, `W`, `cal`). No em-dashes in strings (house style; the dash glyph
  for an absent value is the data placeholder `—`, exempt).
- **Manual rows:** none of this renders. **Old machine rows:** every tile
  and column renders, absent values as `—`.

### 3.1 Which watts and which cal/hr the screen shows

The logbook derives both; the wire also sends both. The screen shows
**what the logbook will show**, so that "same number in both apps" holds:

- **Watts = Concept2's `2.80 / pace³`** from the stored split pace,
  rounded as the logbook rounds (integer). Measured on James's row: split 1
  pace 2:10.6 → 0.2612 s/m → 2.80/0.01782 = 157.1 → **157** ✓; split 5
  2:08.0 → 0.256 → 166.9 → **167** ✓; session 2:09.1 → 0.2582 → 162.6 →
  **162** ✓ (the logbook truncates, or the unrounded pace is slower — the
  antagonist decides which from the tenths).
- **Cal/hr — HYPOTHESIS, decided by §4.2:** if `300 + 4 × 0.8604 × W`
  reproduces the logbook's split cells to the digit from OUR watts, the
  screen computes it; if not, the screen shows the wire's
  `splitIntervalAvgCalories` and the discrepancy is filed as a finding
  against the logbook, not hidden. (First check, split 1: 300 + 3.4416 ×
  157 = 840.3 vs the logbook's 838 — already a 2-unit miss, so the wire
  value is the likely answer; the walk settles it.)
- **Calories** are never derived: the wire's per-split total and 0x003A's
  session total, verbatim — the same values the upload sends and the
  logbook then shows.

### 3.2 Colour pairings (Gate 0 states the numbers)

No new colour. Tiles and table cells use `--ink` on `--page` / `--surface`
and `--ink-2` labels, the pairings the hero and today's INTERVALS table
already carry (all ≥ 7:1 — recompute and state at Gate 0 from
`theme/tokens.css`). The pinned column's shadow is decoration, not text.

## 4. Proving the numbers match

### 4.1 By construction, in the repo

- Unit tests on the 0x003A decode extension against the CSAFE byte layout,
  and on retention: a synthetic 0x0038 frame's every field reaches
  `IntervalActual` and `LogStep` unchanged.
- **Replay corpus:** every capture in `docs/monitor/sessions/` that carries
  0x0038/0x003A frames replays through the driver and the test asserts each
  new stored field equals the frame's decoded value — no rounding, no
  arithmetic, per split and per session.
- `buildC2Payload` (PR 2): a test asserts every emitted field equals the
  stored value for a fixture row with every field present, and that every
  absent field is OMITTED (not zero) for a fixture with none.
- The screen: a client test renders a machine row with all fields and
  asserts every tile and cell; a second renders an old machine row and
  asserts `—` in each new position; a third renders a manual row and asserts
  the MACHINE SUMMARY table and tiles are absent.

### 4.2 The derived pair, measured against a real logbook row

Before PR 1's watts/cal-hr rendering is final: a unit test pins the watts
formula against James's 6k logbook values (five splits + session) as
independent literals; the cal/hr hypothesis is run the same way. Whichever
outcome, the test that ships pins what the screen SHOWS against what the
logbook SHOWED — that is the contract.

### 4.3 The walk (the only layer that is not a mirror — RF11)

After PR 2 merges: one interval piece and one single-distance piece, rowed
on the PM5, saved, uploaded by our send. Then the logbook's workout page
and our detail screen photographed side by side, every split cell and
every summary tile compared. Any cell that differs is a finding; the walk
is not passed by explaining it. The transcribed logbook values become a
permanent replay assertion for those two captures. This is the phase's
exit evidence and the PM close's artifact.

## 5. The upload (PR 2, wire meaning)

`app/server/concept2/mapping.ts` `buildC2Payload` emits, from the stored
record and nothing else:

- Result: `calories_total` ← `machine_calories`; `drag_factor` ←
  `machineSummary.dragFactorAverage` rounded to the integer the API asks
  for; `heart_rate` {average, min, max, ending, recovery} ←
  `machineSummary`; `rest_distance` ← `machine_rest_meters` and
  `rest_time` ← `machine_rest_seconds` in tenths (replacing today's sum of
  our own interval rests — the machine's number, like the totals);
  `stroke_rate` and `workout_type` as today; `time`/`distance`/
  `verification_code`/`weight_class` untouched (verification spec; the
  2026-09-03 ruling).
- `workout.intervals[]` (interval pieces) / `workout.splits[]` (single
  pieces): per stored step — `time` (tenths), `distance`, `stroke_rate`,
  `calories_total` ← `machineCalories`, `heart_rate` {average ← `avgHr`,
  rest ← `machineRestHr`}, `rest_time`/`rest_distance` per interval, `type`
  from the plan's step kind. `wattminutes_total` is not sent (not on our
  wire; the logbook derives watts from pace).
- `targets` per interval: `pace` (tenths) and `stroke_rate` from the plan,
  where the plan sets them — so the logbook's Target Pace / Target Stroke
  Rate rows read what ours do.
- **Omit, never zero.** A step or row without a field emits no key.
- Additive only: every new key is optional to the API (§1.2 tables), so a
  client on v0.39.x and the new server disagree about nothing.

## 6. PR shape and gates

- **PR 1 — record + screen** (TRIAD: stored shape). Decode extension and
  retention; migration; `MonitorRun` fields; the tiles and the MACHINE
  SUMMARY table; the derived-pair tests; DEVIATIONS rows. **Gate 0** before
  merge: the session door and the log detail on the phone, a fresh
  machine row and an OLD machine row (dashes), portrait and landscape,
  beside v0.39.2's screen; contrast numbers stated.
- **PR 2 — the upload** (TRIAD: wire meaning). `buildC2Payload` per §5;
  its tests; the verification spec's record reconciled.
- **The walk** (§4.3) after PR 2 is on the phone; then the ROADMAP ledger
  row, and the release.
- **Gates:** antagonist anchor pass on this spec (via `/harden`; lens 2
  when the plan carries prescribed decode code); PM open on this slate and
  close on the walk; PM final gate on each PR. Not fast path.

## 7. Instruments (RF19)

- The replay corpus is the instrument for the wire (RF19 built it for
  exactly this); its gap — no capture carries 0x003A's calorie bytes
  decoded yet — closes when the first PR-1 walk capture lands.
- The logbook photograph is the instrument for the derived pair and for
  the upload; nothing in the repo can stand in for it.

## 8. Exit

- Gate 0 approved; PR 1 and PR 2 merged with their PM gates; the walk's
  side-by-side photographs committed with every cell compared and no
  unexplained difference; the two walk captures replaying green with the
  logbook's numbers as literals.
- Release note in rower words: _"Your rows now show everything the PM5
  measured: watts, calories, heart rate and stroke rate per split, plus
  drag factor and rest. What you see here is what Concept2's logbook shows
  when you send it."_
- ROADMAP: the "Session calories" row closed; the "say which number this
  is" pass marked "summary half done in Phase LP; chart axes remain".
