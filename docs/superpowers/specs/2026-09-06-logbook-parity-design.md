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
reproduce Concept2's arithmetic — settled at the desk against James's own
logbook row, six cells of six, before any code exists. Manual and by-feel
rows are untouched. Machine rows saved before this ships render `—` where
the field never existed.

**Rev 2 (2026-09-06, same day):** folds the antagonist anchor pass (REVISE:
five BLOCKING, seven MAJOR) and the PM open gate (PASS WITH CONDITIONS,
build now). Everything they overturned is marked _rev 1 said_ so the record
shows the correction where it was used, not only where it was argued.

**Decisions James made in the brainstorm (2026-09-06):**

- **Machine rows only.** New columns and tiles appear on PM5 rows; manual
  rows keep today's table with no dashes.
- **Dashes for old machine rows.** One table shape for every machine row;
  an absent field renders the app's own `DASH` glyph (`—`,
  `surfaceModel.ts`), never Concept2's hyphen — two placeholder glyphs in
  one app is the failure. _Rev 1 said `-`._
- **Reproduce Concept2's arithmetic exactly** for the figures it derives.
- **Extend the upload** to everything the logbook API accepts.
- **Approach A** (read the machine; derive only what Concept2 derives) over
  B (compute from pace): the PM's calorie count on James's 6k is 372; the
  formula from its 162 W average gives 369. B cannot match.
- **Layout B + B**, now drawn as ONE artboard (§3, mockup
  `docs/design/logbook-parity/03-chosen-composed.html`): today's INTERVALS
  table stays; a second table titled **MACHINE SUMMARY** (`PM5 · PER
  INTERVAL`) scrolls sideways beneath it with `#` pinned; six smaller tiles
  under the hero's three carry the session figures. _Rev 1 composed two
  mockups that each carried the session figures — the tiles AND a bold ALL
  row — so the six numbers rendered twice; the ALL row is gone. Rev 1's
  strip also repeated SPM, which the INTERVALS table already shows beside
  its target (`24 / 22`) — RF23's shape; SPM is gone from the strip._
  James: _"can b say like 'machine summary' tho its more clear."_

**Gate class, spoken.** **TRIAD, twice**: PR 1 changes a stored shape; PR 2
changes what numbers mean on the wire to a third party. Antagonist anchor
pass RUN (ledger 2026-09-06, Phase LP); PM open RUN (pm-ledger 2026-09-06);
PM close on the walk; PM final gate on each PR. **Gate 0 on the phone** for
PR 1 (§3.3). **Build now** (PM ruling): the PM5 sends these fields today,
`parse.ts` decodes them, and `driver.ts` discards them every session with no
backfill possible — the seventh phase to open ahead of Wave A, said aloud.
Not fast path. **Not** the "say which number this is" design pass — _rev 1
claimed to absorb its summary half; James's 2026-08-31 ruling was "ONE
design pass with ONE Gate 0, rather than approving a third of a screen at a
time", so a half-absorption is what the ruling forbids. That pass stays
whole; LP's new work-only tiles above a rest-inclusive chart are one more
thing it will reconcile (§3.4)._

## 1. Research (the platform owns the numbers)

### 1.1 What the PM5 sends, and what we already decode

- **PRIMARY — the repo's own BLE table** (`docs/superpowers/research/2026-07-27-pm5-ble-research.md`
  and `docs/monitor/pm5-interface-notes.md` §10, §23 — the BLE rev 1.30
  byte tables; _rev 1 cited a non-existent `interface-notes.md`; the file
  is `pm5-interface-notes.md`_): `0x0038` Additional Split/Interval Data
  carries avg stroke rate, work/rest HR, avg pace, total/avg calories,
  speed, power, split avg drag factor, split number, once per split;
  `0x003A` End-of-Workout Additional Summary 1 carries split type/size/
  count, Total Calories, Watts, Total Rest Distance, Interval Rest Time,
  Avg Calories, once at workout end.
- **PRIMARY — our decoder already reads the split fields.**
  `app/domain/monitor/pm5/parse.ts` `parseAdditionalSplitIntervalData`
  returns `splitIntervalTotalCalories`, `splitIntervalAvgCalories`,
  `splitIntervalPowerWatts`, `splitAvgDragFactor`,
  `splitIntervalWorkHeartRateBpm`, `splitIntervalRestHeartRateBpm`,
  `splitIntervalAvgPace`, `splitIntervalAvgStrokeRate`; the driver keeps
  only pace, stroke rate and work HR on `IntervalActual`. Every 0x0038
  offset, width and scale was re-checked against §10 by the anchor pass
  (held). `parseAdditionalSummaryRest` (0x003A) reads only
  `totalRestDistanceMeters` and `intervalRestSeconds`; Total Calories
  (`[8..9]`), Watts (`[10..11]`) and Avg Calories (`[17..18]`) are not
  decoded — offsets confirmed by identities independent of our code (§4.1).
- **MEASURED on the committed corpus** (anchor pass and PM, by hand, over
  the raw `.jsonl.gz` frames in `docs/monitor/sessions/` — 23 `0x0038`
  frames, 9 `0x003A` frames, 11 of 20 recordings carry 0x003A):
  - `splitIntervalTotalCalories` is the split's own total, not cumulative:
    the per-split sum equals 0x003A's Total Calories on **9 of 9** captures
    that carry both (28/28, 53/53, 6/6, 29/29, 0/0, 10/10, 30/30, 10/10,
    80/80). This also closes the ROADMAP's **Session calories** row.
  - `splitIntervalAvgCalories` is cal/hr — **the PM5's own**, computed as
    `300 + 4 × 0.8604 × W` from its unrounded watts (matched to the unit on
    five frames). It is NOT calories ÷ time, and it is NOT what the logbook
    shows (§3.1).
  - 0x003A Total Rest Distance is a genuine session total (274 m = 130 +
    144 in `walk-2026-08-25/rests`).
  - **0x003A Interval Rest Time reads `0` on 9 of 9 captures**, including
    two with genuine 60 s rests; every capture ends on a work interval, so
    the corpus cannot tell "final interval's rest" from "always 0" from
    "dead". `parse.ts` calls its meaning UNKNOWN; `pm5-interface-notes.md`
    §27.4 calls it settled. **It is not stored and not sent** (§2.2, §5).
    _Rev 1 made it a column and Concept2's `rest_time`._
  - Wire `splitIntervalPowerWatts` equals `round(2.80/(t/d)³)` on **15 of
    15** splits; the session-level 0x003A Watts differs from the derived
    figure by 1 W on 1 of 9 sessions (139 vs 138.35).
  - **0x0039's average stroke rate reads exactly 2× the per-split rate on
    2 of 9 captures**, both terminated pieces (`workoutType` ordinal 1) —
    `pm5-interface-notes.md` §27.6: _"never display 0x0039's average stroke
    rate for a terminated piece. Use 0x0038's per-split value."_ Today's
    upload already sends that doubled value as `stroke_rate` for that row
    class (§5 fixes it).

### 1.2 What the logbook accepts and what it derives

- **PRIMARY — Concept2 Logbook API documentation**
  (`log.concept2.com/developers/documentation/`, results resource, fetched
  2026-09-06 twice):
  - Result: `distance` (int, m, work only), `time` (int, tenths, work
    only), `weight_class` (required for rower), `stroke_rate` (int,
    average), `heart_rate` {average, min, max, ending, recovery},
    `stroke_count`, `calories_total` (int), `wattminutes_total` (int),
    `drag_factor` (int, _"Average drag factor (to nearest whole number)"_),
    `rest_distance` / `rest_time` (interval workouts; _"the value in tenths
    of a second of total time spent in rest intervals"_), `workout_type`,
    `verified` / `verification_code`, `workout` {splits | intervals |
    targets}.
  - Split/interval object: `distance` **Required**, `time` **Required**
    (tenths), `type` **Required for intervals** (_"time, distance, calorie,
    wattminute"_), `rest_time` **Required for intervals**, `stroke_rate`,
    `calories_total`, `wattminutes_total`, `heart_rate` {average, min, max,
    ending, rest, recovery}, `rest_distance` (variable intervals). _Rev 1
    said "every new key is optional to the API" — true of the `workout`
    object as a whole, false of the four keys inside every interval object._
  - Targets: workout-level for splits and fixed intervals; per-interval
    **only for VariableInterval** (`stroke_rate` 0–255, `pace` tenths,
    `watts`, `calories`, `heart_rate_zone`). _Rev 1 said per interval
    unconditionally._
  - **No `watts` and no cal/hr field is accepted anywhere** (a seven-hit
    census of `watt` across the doc: `wattminutes_total`, enum members,
    the Targets `watts`). The logbook page's Watts and Cal/hr are derived
    server-side.
  - Duplicate rule: _"will return a Duplicate Entry error if you post a
    workout which has the same date, time and distance as an existing
    workout"_ (409). The verification code checks _"date, time, distance,
    workout_type and machine type"_ only — adding calories, HR, drag,
    splits and targets cannot invalidate it, provided
    `C2_WORKOUT_TYPE_BY_ORDINAL` stays frozen.
  - _"Sending across a decimal value or a string where an integer is
    expected (e.g. stroke_rate or calories_total) will result in the
    workout failing."_
- **PRIMARY — Concept2, "Pace and Watts Calculators"**
  (`concept2.com/training/watts-calculator`): _"watts = 2.80/pace³"_, _"pace
  is time in seconds over distance in meters"_.
- **MEASURED — James's logbook row (the 6k, ErgData-uploaded, photographed
  2026-09-06):** splits 313.5 s/1200 m … 307.4 s/1200 m; session 1550.1 s /
  6000 m; watts 157 · 164 · 162 · 162 · 167 · 162; cal 73 · 75 · 74 · 75 ·
  75 · 372; cal/hr 838 · 873 · 859 · 870 · 878 · 863; drag 101; stroke rate
  26. **The formulas, verified 6/6 by the controller, the PM and the
  antagonist independently:**
  - `watts = round(2.80 / (seconds / metres)³)` — from time and distance,
    which are what we upload. From the displayed pace (tenths) it is 5/6
    under `round` and 5/6 under `truncate`; the pace is quantised and no
    rounding rule repairs it. _Rev 1 derived from pace and its two worked
    examples needed different rounding rules — the input was wrong, not the
    rule._
  - `cal/hr = floor(calories_total × 3600 / seconds)` — from the two
    integers we upload. The forum formula `300 + 4×0.8604×W` misses every
    cell (it is the PM5's own formula, §1.1). _Rev 1 ruled the derived
    option out on that miss and proposed showing the wire's value — which
    would have DISAGREED with the logbook by 24–78 cal/hr on six of nine
    corpus sessions (751→727, 776→749, 711→686, 817→788, 702→624,
    646→600 …)._

### 1.3 Prior art in this repo (RF18)

- ROADMAP "Session calories" row — closed by §1.1's 9/9 identity.
- ROADMAP "The 'say which number this is' design pass" — NOT absorbed
  (see the gate-class paragraph); LP adds to its backlog.
- Wave E: `buildC2Payload` is Wave E's, and Wave E's live text still says
  _"the `intervals` array is out of scope and rides the auto-upload
  follow-on."_ LP PR 2 is that follow-on; the Wave E section is reconciled
  in the same commit as this spec's ROADMAP edit (hand-over stated, PR B
  #298 and PR C #307 ticked — both merged and still unchecked). The
  `weight_class` ruling (2026-09-03) and the verification spec are
  untouched.
- Wave E's anchor already ruled the oracle question this spec first got
  wrong: _"An export of a row you just posted is an ECHO … The genuinely
  independent oracle here is ErgData posting the same physical row."_ §4.

## 2. The record (PR 1, stored shape)

**Invariant:** every figure the app renders or uploads for a machine row
is either (a) a value the PM5 sent, stored verbatim at the time it was
sent, with its provenance (which frame, which split number), or (b)
Concept2's own published or measured derivation of such values, computed
at render/upload time from the same integers we upload, never stored.
Nothing else. **Absence is `undefined`/`null`, never falsy** — `calories_total
= 0` is a real reading on `walk-2026-08-28/end-on-interval-1` and must
render `0`, not `—`.

### 2.1 Per split — `LogStep` gains (all optional)

| Field | Source | Unit | Notes |
| --- | --- | --- | --- |
| `machineCalories` | 0x0038 `splitIntervalTotalCalories` | cal | the split's own total (PROVEN, §1.1) |
| `machineCalPerHour` | 0x0038 `splitIntervalAvgCalories` | cal/hr | the PM5's own; provenance only — the screen shows the logbook's (§3.1) |
| `machineWatts` | 0x0038 `splitIntervalPowerWatts` | W | provenance; equals the derived figure on 15/15 splits |
| `machineDragFactor` | 0x0038 `splitAvgDragFactor` | — | already `readU8`; integer |
| `machineRestHr` | 0x0038 `splitIntervalRestHeartRateBpm` | bpm | C2's split `heart_rate.rest`; `avgHr` stays the WORK HR |

Already there: `avgHr`, `actualSpm`, `actualSplit`, `actualSeconds`,
`actualMeters`, `targetSplit`, `spm` (the per-interval target rate), and
`restDistanceMeters` on `IntervalActual`.

### 2.2 Per session — the log row gains (all nullable)

| Column | Source | Unit |
| --- | --- | --- |
| `machine_calories` | 0x003A Total Calories `[8..9]` | cal |
| `machine_avg_watts` | 0x003A Watts `[10..11]` | W |
| `machine_cal_per_hour` | 0x003A Avg Calories `[17..18]` | cal/hr (the PM5's; provenance) |
| `machine_rest_meters` | 0x003A Total Rest Distance `[12..14]` | m |

_Rev 1 also stored 0x003A Interval Rest Time; struck (§1.1)._
`machineSummary` (0x0039) is already stored. Every new numeric key gets an
integer validation band on the server, the way `STROKE_RATE_MIN/MAX`
already guards `stroke_rate` — the API rejects a decimal or a string.

### 2.3 Lifetime, ordering, attribution (RF27 — invariants, not mechanisms)

| Value | Minted | Cleared | Survives |
| --- | --- | --- | --- |
| per-split fields on `IntervalActual` → `LogStep` | the driver's boundary pairing (`noteBoundaryHalf`: 0x0037 + 0x0038 paired on Split/Interval Number; `toActualIndex` maps to the plan's step) | with the `MonitorRun` (the door clears it) | a mid-piece disconnect (the run persists); a recovery resume (same run) |
| session fields on `MonitorRun` → log row | the driver's summary stash when 0x003A drains after 0x0039 | with the run | same |

- **Index, not value, is the disagreement surface** (_rev 1 said "the
  machine is the only writer; there is no second producer"_ — true of the
  value). Facts the anchor pass established, which the new fields inherit
  by riding `IntervalActual`: an unpaired half discards the whole
  interval's actual (so a lost 0x0038 loses pace too — no partial-field
  row); `toActualIndex` absorbs one step of forward attribution by
  clamping; `index === null` actuals are dropped by `buildMonitorLogSteps`;
  the summary-fallback arm that synthesises a final `IntervalActual` from
  0x0039 sets `avgSplit: null` by stated rule ("OMITTED, not 0") — **every
  new field is omitted there too**.
- **0x003A must drain before the run is sealed.** Nothing today waits for
  it: `openBurstHold` keys on `summaryTotals` (0x0039), and the drain
  conditions are 0x003F/burst/backstop. On every capture 0x003A lands ~1 ms
  after 0x0039 and 0x003F ~38 ms after, so it is inside the window — an
  observation, not a guarantee. **PR 1 names the owner:** the driver's
  summary stash treats 0x003A as part of the summary burst (a drain
  condition alongside 0x003F); if the hold releases without it, the four
  session columns are `null`, a diagnostic line records `summary-1-missing`,
  and the row renders `—` — best-effort, said so, RF25's one owner.
- **Migration is additive:** four nullable columns; `steps` jsonb gains
  optional keys. No backfill. No read path revalidates. Server deploys
  first; an old client against the new server writes nothing new.
- **Already-uploaded rows never gain the new fields:** there is no PATCH
  to Concept2 in the repo and a resend short-circuits to the old result
  id. The walk uses a fresh row.
- **No step-edit path exists** (`data.ts` patches only held/effort/thumbs/
  notes), so a manual edit cannot desynchronise stored machine fields; the
  ~60 s 0x0039 re-fire cannot reach a saved row.

## 3. The screen (PR 1, Gate 0)

Rendered wherever a machine row's summary renders — the session door,
the log detail, Just Row's log — one component.

- **Hero, second tier** — six smaller tiles under AVG SPLIT · TIME ·
  DISTANCE: **AVG WATTS** (derived, §3.1), **CALORIES** (`machine_calories`),
  **CAL / HR** (derived, §3.1), **RATE · TARGET** (§3.2), **DRAG**
  (`machineSummary.dragFactorAverage`), **REST** (`machine_rest_meters`,
  metres). Absent → `—`.
- **Today's INTERVALS table is unchanged** — target, actual, Δ, SPM with
  its target, the bars.
- **MACHINE SUMMARY** (`PM5 · PER INTERVAL`) beneath it: sideways-scrolling,
  `#` pinned, columns **HR · WATTS · CAL · CAL/HR · DRAG · REST m**. No ALL
  row (the tiles are the session), no SPM (the INTERVALS table has it with
  its target). Renders only when the row has steps: **a Just Row stores
  `steps: []`**, so it gets the tiles and no strip — the PM5's own 5-minute
  auto-splits for a Just Row are on the wire (two 0x0038 frames on
  `walk-2026-08-31-justrow`) and have no home in the record; that is a
  ROADMAP row (§8), not this phase.
- **Sticky column, stated rules** (both mechanisms are new to this
  codebase — zero `position: sticky` and zero `overflow-x` today):
  `border-collapse: separate` with per-cell borders, because collapsed
  borders belong to the table and do not travel with a stuck cell
  (WebKit bug 128486; csswg-drafts #3136); the pinned cell paints `--page`
  with a soft right shadow. The e2e guard measures the sticky CELL's box,
  never an inline child.
- **What an OLD machine row actually renders** (PM, from the stored
  shape): tiles **3 of 6** populate — AVG WATTS (derivable from stored
  time/distance), RATE · TARGET, DRAG; CALORIES, CAL/HR, REST are `—`.
  Strip **3 of 6** columns populate — HR, WATTS, REST m; CAL, CAL/HR, DRAG
  are `—`. Not a wall of dashes; Gate 0 shows a real old row.
- **Copy:** `MACHINE SUMMARY`, `PM5 · PER INTERVAL`, tile labels as above,
  units in the hero's small trailing style. No em-dashes in strings; the
  `—` placeholder is the data glyph, exempt.

### 3.1 Which watts and which cal/hr — a Gate 0 option, with the costs measured

Two machines compute these from different inputs. The PM5 shows its own
(`splitIntervalPowerWatts`; cal/hr from its unrounded watts). The logbook
shows its own (`round(2.80/(t/d)³)`; `floor(cal×3600/t)`). They differ:
**watts by ≤1 W** (1 of 9 sessions, 0 of 15 splits); **cal/hr by 24–78** on
six of nine corpus sessions. James asked for the logbook's — _"reproduce
their arithmetic exactly"_ — and the spec's default is the logbook's, so
that our screen equals the logbook page for the same uploaded row. **But
the default is not the decision** (RF30; "a number change is a design
question too"): Gate 0 lists both, side by side on the same real row, with
the measured deltas, and James picks:

| Option | Matches | Differs from |
| --- | --- | --- |
| **Logbook's arithmetic (default)** | the logbook page after upload, cell for cell | the PM5's own screen by ≤1 W and 24–78 cal/hr |
| PM5's wire values | the monitor's own summary screen | the logbook page by the same amounts |

Whichever he picks, the other is stored (§2) and the walk's expected
difference is pre-declared, so the walk cannot fail on an expected
disagreement.

### 3.2 RATE · TARGET and the doubled stroke rate

The tile's rate is **0x0039's average for a natural finish, and the
time-weighted mean of the per-split 0x0038 rates for a terminated piece**
(`pm5-interface-notes.md` §27.6 rule; 2 of 9 captures read exactly 2×). The
same value feeds the upload's `stroke_rate` (§5) — today's send ships the
doubled figure for that row class. The TARGET half shows a rate only when
every interval's `spm` target agrees; otherwise `—`, the per-interval
targets staying in the INTERVALS table.

### 3.3 Gate 0 — rendered, on the phone, one artboard first

1. **Artboard `03-chosen-composed.html`** (this branch): B + B as one
   screen, no ALL row, no SPM in the strip, the HR column showing a real
   belt artefact (55 · 55 · 55 · 55 · 170 under an average of 78 — that is
   what a real row looks like), and the §3.1 option pair drawn on the same
   row. James approves the artboard before the implementation task starts.
2. **Then the build on Kaito** (ASK before every install — standing rule):
   a fresh machine row and a REAL old machine row, session door and log
   detail, portrait and landscape, beside v0.39.2's screen; the number of
   machine rows in production stated (Wave E PR0 counted 20 rows, 6
   PM5-eligible, 2026-08-31 — run the query again).
3. **Colour pairings:** no new colour; tiles and cells use `--ink` on
   `--page`/`--surface` and `--ink-2` labels, the pairings the hero and
   INTERVALS table carry — the ratios recomputed from `theme/tokens.css` and
   stated at the gate.

### 3.4 What this screen does to the "say which number this is" pass

The six new tiles are work-only quantities (0x0039/0x003A are work-only —
§27.1). They sit above a chart whose axes are rest-inclusive and whose rest
bands James already flagged. LP makes that pass's problem larger by six
numbers and one REST tile; it does not discharge any of its four bullets.
The pass keeps its own Gate 0.

## 4. Proving the numbers match — sorted by what each proof can see

### 4.1 In the repo, before any walk

- **Retention** (a mirror, and named as one): synthetic 0x0038/0x003A
  frames reach `IntervalActual`, `LogStep` and the row unchanged; the
  summary-fallback arm omits every new field.
- **Cross-characteristic identities (real oracles — they do not share our
  arithmetic):** over every committed capture, (1) the per-split
  `machineCalories` sum equals 0x003A Total Calories (9/9 today); (2) the
  wire `splitIntervalPowerWatts` equals `round(2.80/(t/d)³)` from the
  split's own 0x0037 time and distance (15/15 today), and the session Watts
  is within 1 W. These are replay assertions in PR 1, not walk items.
- **The derived pair against the logbook:** a unit test pins
  `round(2.80/(t/d)³)` and `floor(cal×3600/t)` against James's six
  logbook figures as independent literals (§1.2). Already true at the desk;
  the test is what keeps it true.
- **The fake transport** (`transports/fake.ts`) currently hardcodes
  calories 0, cal/hr 0, watts 0, drag 130 for every split: every
  fake-driven test and screenshot would render honest-looking zeros. PR 1
  teaches it real values (the PM5's own relations: watts from pace, cal/hr
  from watts, calories from cal/hr × time; drag 101) so a zero can only mean
  "unwired".
- **Upload:** `buildC2Payload` emits exactly the stored value for every
  field on a full fixture and omits (never zeroes) every absent key on an
  empty one; a mutation that zeroes one absent key must fail it.
- **Screen:** a full machine row renders every tile and cell; a real old
  row's fixture renders the 3-of-6 / 3-of-6 truth; a manual row renders
  neither; a Just Row renders tiles and no strip.

### 4.2 The walk — two oracles, each named for what it can see

1. **The logbook page beside our screen, after OUR upload** — a real oracle
   for the two DERIVED cells (Concept2 recomputes them from our integers)
   and for encoding (units, rounding, timezone). **A mirror for every field
   we uploaded** (we send 372, it shows 372). Said so; not the phase's
   proof of decode correctness.
2. **The PM5's own Memory → View Detail screens photographed for the same
   piece, beside our screen** — the independent oracle for the stored
   half (per-split calories, watts, HR, drag; session calories, rest
   distance, stroke rate). Artifact types named (a phone PNG beside a
   monitor JPEG is two frames, not one — JR close ruling). This is how the
   stroke-rate doubling was found (§27.7).
3. **Pre-declared expected differences** (§3.1): the app shows the
   logbook's derived watts/cal-hr, so the PM5 screen WILL differ by ≤1 W
   and 24–78 cal/hr on those two columns; everything else must be equal.
   Any other cell that differs is a finding.
4. **ErgData cross-upload** is NOT free: Concept2 dedups on date + time +
   distance (409), so it needs our row deleted and the piece re-uploaded
   from ErgData — a sequenced experiment, filed as optional under the same
   walk, not required for exit.
5. **Dependency named:** a live send needs `C2_LINK_ENABLED` for James's
   account, which Wave E still lists as owed pending Concept2's write
   approval. This walk joins Wave E's owed flag-flip trip (auto-send's
   AUTOMATIC save, PR C's confirming send, LP's parity photograph — three
   verifications, one trip; ROADMAP names it).

## 5. The upload (PR 2, wire meaning)

`buildC2Payload` emits, from the stored record and nothing else:

- **Result:** `calories_total` ← `machine_calories`; `drag_factor` ←
  `machineSummary.dragFactorAverage` (already an integer); `heart_rate`
  {average, min, max, ending, recovery} ← `machineSummary`; `rest_distance`
  ← `machine_rest_meters`; **`rest_time` stays what it is today** — our
  summed interval rests (`row.restSeconds`, pinned at 1200 tenths by
  `mapping.test.ts`) — _rev 1 replaced it with 0x003A's field, which reads
  0 on 9/9 captures and would have uploaded "no rest" on a piece with two
  minutes of it_; `stroke_rate` per §3.2 (fixes the doubled value on
  terminated pieces); `workout_type`, `time`, `distance`,
  `verification_code`, `weight_class` untouched.
- **`workout.intervals[]`** (interval pieces) / **`workout.splits[]`**
  (single pieces): one object per stored step with the four required keys
  always present — `time` (tenths), `distance`, `type` (`time`/`distance`
  from the plan's step kind), `rest_time` (tenths; the same per-interval
  readback that today's session `rest_time` is summed from — the PM5
  counts a fixed rest down to the programmed value, INFERENCE, stated) —
  plus `stroke_rate`, `calories_total` ← `machineCalories`, `heart_rate`
  {average ← `avgHr`, rest ← `machineRestHr`}, `rest_distance` per interval
  for variable pieces. **A Just Row (`steps: []`) sends no `workout`
  array** — its per-split data is not in the record (§3, §8).
- **`targets`:** workout-level `pace`/`stroke_rate` for single pieces and
  fixed intervals; per-interval only for variable intervals — the API's
  own rule.
- **`wattminutes_total` is not sent.** Concept2 then derives watts from
  time/distance, the path our formula reproduces. Open question, one
  upload settles it: whether the logbook prefers `wattminutes_total` when
  ErgData sends it — if so, our rows and ErgData's could show different
  watts for the same piece; the walk photographs both.
- **Omit, never zero; `0` is a value.**
- Idempotency unchanged: a resend of an already-uploaded row short-circuits
  and gains nothing.

## 6. PR shape and gates

- **PR 1 — record + screen** (TRIAD: stored shape): 0x003A decode
  extension (three fields, §23's table quoted in the code), retention of
  the 0x0038 fields, the summary-burst drain condition, migration,
  `MonitorRun` fields, the fake's real values, tiles and MACHINE SUMMARY,
  the identity and derived-pair tests, DEVIATIONS rows, the stale
  `parse.ts` comments swept ("a wider parser would be undecoded surface
  with no reader" — it has readers now). Gate 0 per §3.3.
- **PR 2 — the upload** (TRIAD: wire meaning): §5; the verification spec's
  record reconciled; Wave E's `intervals` sentence corrected.
- **The walk** (§4.2) on the flag-flip trip; then the ROADMAP ledger row,
  and the release.
- **If PR 1 has not merged within two weeks** (PM), split the decode +
  retention out as a fast PR 0: every connected row until then permanently
  loses calories, watts, drag and rest HR.

## 7. Instruments (RF19)

- The replay corpus already carries the bytes: 11 of 20 recordings have
  0x003A, every recording since 2026-08-23. §4.1's identities run today.
- The PM5's own screens are the instrument for the stored half; the
  logbook page for the derived half. Nothing in the repo stands in for
  either, and the spec no longer claims otherwise.

## 8. Exit

- Gate 0 approved (artboard, then the phone); PR 1 and PR 2 merged with
  their PM gates; the walk's photographs committed — PM5 screens and
  logbook page beside ours — with every cell compared and only the
  pre-declared differences present.
- ROADMAP: "Session calories" closed; Wave E reconciled and the hand-over
  stated; a new row for **Just Row auto-splits** (the PM5 sends 0x0038 per
  5-minute split for a Just Row and the record has nowhere to put them);
  the flag-flip trip lists three verifications.
- Release note, rower words (rewritten per the PM — the old note claimed
  "everything the PM5 measured" for a watts figure we derive): _"Rows you
  row with the PM5 connected now show watts, calories, heart rate and
  stroke rate for every split, plus drag factor and rest for the session.
  They are the same figures Concept2's logbook shows for that row."_
