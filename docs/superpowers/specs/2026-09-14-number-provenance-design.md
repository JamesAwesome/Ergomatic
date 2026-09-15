# The "say which number this is" design pass

**Status: SPEC REVISED 2026-09-14** against the antagonist anchor pass and
the PM open gate, both run the same day and both recorded in §11. The first
draft was materially wrong in four places; every correction below is marked
**[CORRECTED]** so a reader of the first draft can see what moved.

Scope ruled by James 2026-09-14: **"everything agrees"** — labelling, the
chart, and making live and stored quantities agree where they diverge.

Opened against the ROADMAP section of the same name, whose trigger fired
2026-09-04 and which had gone 10 days unopened while accreting members.

## What and why

A rower looks at one screen and sees several numbers that disagree with each
other. The six tiles after a piece say `PM5 · PER INTERVAL` over two columns
the PM5 did not compute. The AVG HR tile and the HR column beneath it differ
by up to 15 bpm. The chart's axis under three numbers marked WORK ONLY is
neither work-only nor wall clock — it is whatever the rower happened to do
during the rests, which is why five identical 1:30 rests drew five bands of
different widths and two of them slivers. The live screen's running total is
work plus rest; the stored total for the same session is work only; neither
says so. And on You → Stats, METRES and TIME describe more rows than AVG
WATTS is computed from.

None of that is a wrong calculation. Every number is correct about
something. What is missing is the sentence saying **which thing** — and in
four places, two numbers that a rower reads as the same quantity genuinely
are not.

**It also carries one defect a rower can see today**, photographed on
James's phone on 2026-09-14: the Season chart's y-axis reads `L50,000` and
`L00,000` — the leading `1` clipped off by a hand-tuned gutter. Measuring
that defect for this revision found **two more of the same class** nobody
had seen, one of them on a second screen (§1.3).

## 1. Research pass

Run 2026-09-14, before any design; re-run after the anchor pass. Tags:
PRIMARY (read in this repo's code, a committed capture, a committed vendor
document, or measured here with the command named), SECONDARY (a repo doc or
comment transcribing something), INFERENCE.

### 1.1 Prior art (RF18)

`ls docs/superpowers/research/` holds 21 entries. **Nothing on number
provenance, axis semantics, or chart labelling.** Nothing found — itself the
result. (PRIMARY.)

What the repo HAS already settled, and which this spec must not re-derive:

- **Whose arithmetic, ruled.** James, §3.1 of the logbook-parity spec: the
  logbook's formula. The arithmetic was ruled; the LABEL was not.
  (SECONDARY — `docs/superpowers/specs/2026-09-06-logbook-parity-design.md`.)
- **"Derived versus measured" is not a real axis.** `pm5-interface-notes.md`
  §27.5 measures the PM5's own watts field against `2.80/pace³` and finds
  agreement under 1 W. **[CORRECTED]** §27.5's own words are "PRIMARY
  (independent formula, not a mirror of anything we compute)" — it measures
  AGREEMENT, not causation, so "the monitor's watts is itself a derivation
  of pace" is INFERENCE, not PRIMARY. What survives either way: nothing on
  that strip is a direct measurement of power, and the honest axis is WHOSE
  ARITHMETIC. (Agreement: PRIMARY. Causation: INFERENCE.)
- **The real disagreement band.** Watts ≤1 W; cal/hr **24-78 on six of nine
  sessions**. The `931`/`929` pair quoted in the ROADMAP section is an e2e
  SEED, not a record — a Gate 0 board built on it would show a 2 cal/hr gap
  where the real one reaches 78. (SECONDARY —
  `docs/superpowers/specs/2026-09-06-logbook-parity-design.md`; the first
  draft tagged this file both SECONDARY and PRIMARY in one section.)

**[CORRECTED] Three members reverse rulings this repo already made on
evidence.** The first draft listed none of them, which is how a design pass
re-decides a settled question without noticing:

- **M2's "read the same source the column does" is option C, already
  rejected at a Gate 0 on 2026-09-07.** `domain/monitor/derivedHeartRate.ts`'s
  header records the ruling, the measurement and the reason: the column runs
  "3.5 to 15.2 bpm ABOVE the trace on all four captures", and "Concept2
  documents that field only as 'Split/Interval Work Heartrate', never saying
  whether it is a mean, a final reading or a peak". Its own words on the
  disagreement: **"Two different quantities, honestly labelled … Worth
  knowing before anyone 'fixes' the tile to match the rows."** So M2 is a
  LABELLING gap only — the code already knows what the screen does not say.
  (PRIMARY.)
- **M5's silence is a fix-round safety gate, not an oversight.**
  `src/log/storedSummary.ts`'s `buildStoredRest` block: rung 2 is gated on
  `isReconstructableClose(row.endedBy)` because "a row whose `endedBy` names
  an incomplete-by-construction close DECLINES to FALLBACK instead … rather
  than risk this rung firing on a growing, un-bounded population" (fix round
  2, finding I1). Making the stored line speak means either widening that
  gate or sourcing the clause elsewhere. (PRIMARY.)
- **M7's missing caption was struck by rulings 18 and 19.**
  `src/you/stats/TotalsGroup.tsx:6-12`: "NO prose: rulings 18 and 19 struck
  every caption, the seam line and the n OF m footnote included." (PRIMARY.)

### 1.2 Does the system have the concept? (the standing brainstorm question)

**[CORRECTED — this section's first draft was falsified by the anchor
pass.]** It said "the monitor has no session wall clock" and built PR 3 on
it. The monitor reports per-interval REST time, we store it, and we already
ship it to Concept2. A wall-clock axis is **derivable**, not asserted.

- 0x0039's Elapsed Time is a **whole-workout total and WORK-ONLY** —
  `walk-2026-08-25/rests-finished-recording.jsonl.gz` reads 254.8 s against
  three intervals summing to exactly 254.8 s, over a program carrying 120 s
  of rest it excludes entirely. Pinned by `oracleCorpusReplay.test.ts`.
  (PRIMARY — `pm5-interface-notes.md` §27.1 and its table row at 4-6.)
- 0x0031's Elapsed Time is **per-interval**, proved by hardware walk 4, and
  advances during a rest only while the rower keeps the flywheel moving.
  (PRIMARY — §10, and `traceModel.ts`'s own header.)
- **0x0037 `[12..13]` is the interval's own REST TIME in seconds.**
  `pm5-interface-notes.md` §27.3, verbatim: "Per-interval rest also lives
  here: `[12..13]` (1 s) and `[14..15]` (1 m)", with its table giving 60 s /
  60 s / 0 s for the rest-bearing capture's three splits. We store it
  (`src/log/storedSummary.ts:152` `machineRestSeconds`) and send it
  (`app/server/concept2/intervals.ts:76` `rest_time`). (PRIMARY.)
- **The arithmetic closes.** Replaying that capture's 0x0031 against its own
  host timestamps: wall clock **374.76 s** against work-only 254.8 + machine
  rest 120 = **374.8 s**. (PRIMARY — anchor pass, ledger 2026-09-14.)
- The live running total we display is the machine's own session distance,
  **work plus rest by construction** (`surfaceModel.ts:562-574`). (PRIMARY.)

**[CORRECTED] The stated failure mode was also false.** "Wrong whenever the
rower rests longer than the program says" — the two measured rests ran
59.5 s and 59.0 s against 60 s programmed, and `commands.ts:29-31` plus
`docs/monitor/undefined-rest.md` establish we never emit an undefined rest.
**The rower has no mechanism to extend one.** (PRIMARY.)

**So the honest argument for a work-only axis is a different one**, and PR 3
must make it on these terms rather than on "the machine cannot tell us":
work-only is recoverable from the series alone, and it has a machine oracle
(0x0039) that wall clock does not.

**The question that is genuinely open, and PR 3 needs it:** does 0x0031's
elapsed freeze during a **work** interval when the rower stops? **If it does,
`wall = work + machineRest` breaks for programmed rows too.**

**[CORRECTED 2026-09-14] It is NOT answerable at a desk, and this spec said
it was.** Both halves of the corpus were swept and neither can settle it:

- **The wire recordings: 13 of them, zero instances.** Decoding 0x0031 per
  §10 (elapsed `0-2` at 0.01 s, distance `3-5` at 0.1 m, workout state byte
  8, rowing state byte 9) and looking for elapsed frozen across consecutive
  frames while the workout state is an ACTIVE WORK state (§5's 1, 4, 5, 6,
  7) and elapsed is already past zero: **every hit is `wstate = 1`,
  `WORKOUTROW` — a free row.** Not one frame pair anywhere sits in
  `INTERVALWORKTIME` or `INTERVALWORKDISTANCE` with a stopped clock. The
  programmed walks were all rowed continuously. (PRIMARY — measured
  2026-09-14.)
- **Two apparent hits are false, and both are worth naming** so the next
  sweep does not re-find them. `walk-2026-08-23/keystone`'s 89.64 s freeze
  at elapsed 68.55 / 250.0 m is `wstate = 12`, `WORKOUTLOGGED` — it is that
  walk's README's own "90.3 s held-open window" AFTER the piece ended.
  `walk-2026-08-31-justrow/waiting`'s 896.77 s is a free row, and its
  filename says what it is. A sweep that filters only on "elapsed stopped"
  reports both as pauses.
- **The saved rows cannot settle it either, and the reason generalises.**
  `seriesRecorder` emits one sample per work-clock SECOND, and the work
  clock IS 0x0031's elapsed — so a frozen clock emits NOTHING for the pause
  and the trace is seamless, while a running clock emits a run of samples
  whose distance sits flat. **The signature of "it froze" is therefore
  indistinguishable from "the rower never stopped".** Measured on staging
  2026-09-14: across every `source = 'pm5'` row carrying steps and a
  series, **the longest flat-distance run in the whole database is 4
  seconds** — ordinary between-stroke coasting, not a pause. That is
  evidence only if paired with a rower who remembers stopping in a named
  row, and James does not (asked 2026-09-14, "not sure").

**So the honest options are a hardware walk leg (one programmed piece, stop
mid-interval ~30 s, resume) or an assumption carried at Gate 0B.** The
consequence for the board is in §4: exactly one of the three axis candidates
is immune to the answer.

### 1.3 What this spec measured

**The axis probe** (throwaway, branch `number-provenance`,
`app/e2e/axisProbe.spec.ts`; `pnpm e2e e2e/axisProbe.spec.ts`, three tests,
readouts through `process.stdout.write` per TESTING.md §11). **It asserts
nothing about geometry — its only `expect` is that a heading is visible. Do
not cite its pass count as evidence of anything; cite its readouts.**

**[CORRECTED] There are two advances, not one, and neither is 5.67.**

| class | size | letter-spacing | measured advance |
| --- | --- | --- | --- |
| `.stats-tick` | 9 px | `0.06em` (`index.css:12674`) | **5.94** |
| `.trace-tick-label`, `.stats-point-label`, `.stats-bar-label` | 9 px | none | **5.40** |

`plexLoaded: true` is `document.fonts.check`, which **returns true for a
fabricated family** — it proves nothing about the face, and a Plex-free
control measured the identical 5.942. The advance is what matters and the
advance was measured. (PRIMARY.)

**[CORRECTED] The mechanism is a seventh glyph, not the 5 % advance error.**
At the constants' own assumed ~5.67, seven glyphs still need 39.69 into a
38-unit gutter. The advance error is real and makes it worse; it is not the
cause.

**[CORRECTED] Seven constants reserve space for text, not four**, and three
of them are short. Widths measured, not computed, except where marked:

| constant | value | room | widest label | width | verdict |
| --- | --- | --- | --- | --- | --- |
| `TraceChart` `LEFT_PAD` | 42 | 36 | `1:50.0` (6 @ 5.40) | 32.40 | 3.60 slack |
| `WeekBarsGroup` `PAD_L` | 44 | 38 | `100,000` (7 @ 5.94) | 41.59 | **CLIPS 3.59** |
| `SeasonGroup` `PAD_L` | 44 | 38 | `200,000` (7 @ 5.94) | 41.59 | **CLIPS 3.59** |
| `TestTrendGroup` `PAD_L` | 40 | 34 | `2:05` (4 @ 5.94) | 23.77 | 10.23 slack |
| `TestTrendGroup` `LABEL_ROOM` | 58 | 50 after its 8 px gap | `2K 1:54.0` (9 @ 5.40) | 48.63 | 1.37 slack |
| `SeasonGroup` `LABEL_ROOM` | 78 | 70 after its 8 px gap | `163,012 TODAY` (13 @ 5.40) | 70.22 | **0.22 short** at the worst placement its own rule allows (INFERENCE — computed at `tx = 242`; the rendered frame sat left of it) |
| `TraceChart` `RIGHT_PAD` | 8 | 8 of half-width, the last x tick being centred | `0:40` (4 @ 5.40) | 21.60 | **CLIPS RIGHT 2.80** |

Two of those are new to this pass and neither had been seen:

- **The trace chart clips its last x-axis tick, on the other screen.**
  Measured `x = 301.2`, width `21.60`, viewBox width 320 → `rightSlack
  = −2.80`. The last tick lands on the plot's right edge (`CHART_WIDTH −
  RIGHT_PAD = 312`) with `textAnchor="middle"`, so any x label wider than
  16 units overhangs; every one of them is 4 glyphs. It fires whenever
  `chooseTicks` puts a tick on the domain's end. (PRIMARY — probe test 3.)
- **`SeasonGroup`'s `LABEL_ROOM` prices the wrong thing.** Its comment
  prices `43,012 TODAY` at "12 glyphs … ≈ 70 px" = 5.83/glyph. The class
  measures 5.40, so 78 holds 13 glyphs to within 0.22 — correct today by
  luck, and wrong the moment a season reaches seven digits (15 glyphs =
  81.0 + 8 = 89.0 into 78).

**[CORRECTED] The first draft's other four sub-claims:** "the four charts"
named three (`TestTrendGroup.tsx:23` is the fourth); "all four ~5 %
under-sized" is false (only the two metres gutters clip); "all three Stats
charts" draw metres ticks — **only two do**, `TestTrendGroup` draws splits;
and the trace chart's page was never opened by the first probe.

**The reproduction, in Chromium.** Probe test 2 seeds a 120,000 m row
backdated INSIDE the season window and both metres charts then render
`100,000` / `150,000` / `200,000` at **x = −3.59**. The first attempt missed
it because the row was left at server-now, two days past the browser's
pinned clock, so `rowsInRange` (`season.ts:76`) excluded it — a fixture bug,
not a system property. (PRIMARY.)

**It is produced on James's phone too.** His 2026-09-14 screenshot of Season
2027 (104,153 m) reads `L50,000` and `L00,000`, committed at
`docs/design/number-provenance/evidence/`. (PRIMARY.)

**This is the fourth and fifth occurrence of one class.** `TraceChart`'s
`LEFT_PAD` went 36 → 42 after a clipped `1` read as `L`; `WeekBarsGroup`'s
`PAD_L` went 36 → 44 for the same reason; `SeasonGroup` copied 44. Each fix
moved one constant and none removed the guess. (PRIMARY — those constants'
own comments.)

**No gate we own can see this class.** The screenshot suite runs Chromium at
a seed whose widest tick is six glyphs, so the clip lives beyond the data
our captures produce, not beyond our assertions.

### 1.4 Corrections to the ROADMAP section's own bookkeeping

The section warns that it has been wrong three ways at once (RF10). Checked
for this spec:

- The member count is right as of the 2026-09-13 census: **six, seven with
  the Stats column**. This spec adds an **eighth** (the clipped ticks), a
  **ninth** (the free row, §2), and an appendix (the CUSTOM echo line).
- The eyebrow really is over the TABLE (`MachineSummaryTable.tsx`), not the
  tiles; `MachineTierBlock` carries no provenance label of any kind. So the
  derived tiles are UNLABELLED rather than mislabelled. (PRIMARY.)
- The Stats gap measured EXACTLY ZERO on production on 2026-09-13 and is
  latent, not live. Unchanged by this spec.

## 2. The members

Each: what a rower sees, the mechanism with its citation, and what
"everything agrees" means for it.

### M1 — `PM5 · PER INTERVAL` over arithmetic the PM5 did not do

WATTS and CAL/HOUR in the machine-summary table are the logbook's formula
(James's §3.1 ruling), differing from the monitor's own by ≤1 W and 24-78
cal/hr. The eyebrow names the monitor for all of it. **Agrees when** the
label says whose arithmetic each column is, or the columns are split so one
eyebrow is true of what it covers.

**[SHARPENED 2026-09-14, building Gate 0B's board 1.] The table is six data
columns and two of them are ours**, which `summaryModel.ts:204-210` states in
its own words: "`watts`/`calPerHour` are the LOGBOOK's arithmetic off the
step's own seconds/metres/calories (§3.1); `calories`/`drag`/`restMeters` are
the machine's own." `hr` is the machine's per-split reading. So under one
eyebrow reading `PM5 · PER INTERVAL`:

| column | whose arithmetic |
| --- | --- |
| HR | the monitor's (0x0038 per-interval) |
| **WATTS** | **ours** (`logbookWatts`) |
| CAL | the monitor's |
| **CAL / HOUR** | **ours** (`logbookCalPerHour`) |
| DRAG | the monitor's |
| REST m | the monitor's |

### M2 — AVG HR is derived from the trace

The tile is our time-weighted mean over working strokes; the HR column
beneath it is the monitor's own 0x0038 per-interval reading, measured
3.5-15.2 bpm higher. Two numbers, one screen, no statement of difference.
**Agrees when** the tile says it is ours. **[CORRECTED] The "or reads the
same source the column does" arm is option C and was rejected at a Gate 0 on
2026-09-07** (§1.1) — reopening it needs James, and it would make PR 1
TRIAD, because a number a rower has already saved would render differently.

### M1b — two of the six TILES change whose arithmetic they are, per row (NEW)

**[FOUND 2026-09-14 building Gate 0B's board 1, and it changes what board 1
can propose.]** `MachineTierBlock`'s six tiles are unlabelled (§1.4), and
labelling them is not simply a matter of writing six labels, because **two of
them are not a fixed source at all:**

| tile | whose arithmetic | fixed? |
| --- | --- | --- |
| AVG WATTS | ours (`logbookWatts`) | yes |
| CALORIES | the monitor's | yes |
| CAL / HOUR | ours (`logbookCalPerHour`) | yes |
| **RATE** | **the monitor's own `avgStrokeRate` IF the piece finished; OUR time-weighted mean over the splits if it did not** | **NO — switches on `endedBy`** |
| DRAG | the monitor's | yes |
| **AVG HR** | **the monitor's `avgHeartRateBpm` if present; OURS from the trace otherwise** — and no capture we hold carries one, so in practice always ours | **NO — switches on data presence** |

(PRIMARY — `logbookDerived.ts:38-53`'s `sessionStrokeRate`, whose first line
is `if (input.finished) return input.avgStrokeRate;`, and
`storedSummary.ts:816`'s `ms?.avgHeartRateBpm ?? deriveAverageHeartRate(...)`.)

**[SHARPENED] Neither conditional is an accident, and one has a photographed
receipt — so "remove the conditional" is NOT on the table for RATE.**
`pm5-interface-notes.md` §27.6: **"0x0039's Average Stroke Rate reads exactly
DOUBLE on a terminate"**, with the monitor's own View Detail screen siding
against the wire (46 on 0x0039, 23 on 0x0038, **23 photographed on the PM5**),
and a second terminate capture showing the same 2×. Its stated operational
rule is "never display 0x0039's average stroke rate for a terminated piece."
**The RATE tile switches source because the monitor lies by exactly 2× on one
arm.** (PRIMARY.)

The two conditionals are therefore different in KIND, and a board that treats
them alike gets the design wrong:

- **RATE switches because the monitor is WRONG** on terminated pieces. Ours is
  the better number there, and the switch protects the rower.
- **AVG HR falls back because the monitor sends NOTHING** — not because it is
  wrong. It is a gap-filler, and `derivedHeartRate.ts` records how narrow the
  evidence for "always empty" really is (two belted recordings, one walk).

**[RENDERED 2026-09-14, board 1's core evidence.] The conditional is
INVISIBLE because it works, and that is the actual defect.** Three frames,
`docs/design/number-provenance/gate0b/`, the same row twice plus one
prototype:

| frame | what the wire said | what the screen says | source |
| --- | --- | --- | --- |
| `before/tiles-finished-portrait.png` | `avgStrokeRate: 26` | **RATE 26** | the monitor's |
| `before/tiles-terminated-portrait.png` | `avgStrokeRate: 52` | **RATE 26** | **ours** — the guard dropped the monitor's |
| `guard-removed/tiles-terminated-portrait.png` | `avgStrokeRate: 52` | **RATE 52** | the monitor's, which is the §27.6 double |

Verified in the database rather than inferred: `ended_by = 'rower'` stored on
the second row and `machine_summary->>'avgStrokeRate'` reads `52`, while the
screen reads 26 — so the branch fired. **The first two frames are
pixel-identical in the RATE tile.** A rower cannot tell which number they are
looking at, and the reason the screen looks fine is that the guard is
silently declining the monitor's own field. The third frame is what that tile
says without it.

**So the design question is narrower and harder than labelling six tiles: can
one label be true of a tile whose source switches for a documented reason?**
And board 1 must answer it knowing the switch produces no visible symptom —
there is no wrong number on screen to point at, only an unstated one.

**The house's existing mark does NOT answer it.** The tilde is already a
provenance-adjacent mark here — `Builder.tsx:633`, `WorkoutRow`, and the
baselines article's own words: "distance workouts show a rough length marked
with a tilde". But it means ESTIMATED, not OURS, and most of these figures
are not estimates: `logbookWatts` is exact arithmetic on measured inputs, and
so is `logbookCalPerHour`. Reusing it would conflate the two axes this pass
exists to separate. (Asked and answered per the brainstorming rule: the house
has a mark, and it is the wrong one.)
Three ways out, and the board shows them rather than assuming one — compute
the label per row from the same predicate the value came from; group the tiles
so one honest eyebrow covers each group; or say the switch out loud on the
rows where it happens. **Removing the conditional is ruled out for RATE by
§27.6** and for AVG HR would mean showing a dash where a real number exists.

### M3 — the chart's axis is a quantity with no name

`traceModel.ts`'s own header: "NEITHER `t` NOR `d` IS A WORK-ONLY
QUANTITY … each is CONDITIONAL ON ROWER BEHAVIOUR DURING RESTS — a frozen
rest contributes nothing to either axis; an advancing rest contributes all
of itself." It sits directly under `MACHINE CONFIRMED · WORK ONLY`.
**Agrees when** the axis is a defined quantity and the screen says which.
**[CORRECTED]** Wall clock is one of the available options (§1.2), subject
to the open freeze question; it is not ruled out by the machine's silence.

### M4 — the same session's total is two different numbers

Live: `surfaceModel.ts`'s `sessionDistanceMeters`, work + rest by
construction. Stored: 0x0039's work-only total. Neither screen labels which.
**[CORRECTED] The live number is not the machine's own field either.**
`driver.ts:3034` sums the session register map, which
`domain/monitor/types.ts:62-64` calls "A DISPLAY ESTIMATE, never a record:
an interval that produces ZERO frames is lost entirely". So this is one
quantity beside a **lossy estimate of a different one**. **Agrees when** one
of them changes, or both are labelled such that a rower reading them an hour
apart is not told two different things about one row — see I2's third arm.

### M5 — the interrupted TOTAL line

An interrupted session shows a rest clause LIVE and none STORED for the
identical row. Silent. **[CORRECTED] The silence is deliberate** (§1.1):
`isReconstructableClose` declines the fallback on an incomplete close rather
than misattribute an abandoned interval's rowed work as rest. **Agrees
when** the stored line says WHY it cannot speak, or the clause is sourced
from something the gate does not refuse. "Say the same thing the live one
did" reverses the fix-round ruling and is not on the table without James.

### M6 — rest bands are as wide as the rower kept moving

James, 2026-08-31: _"it's weird the rests only show in the bottom graph if I
rowed. It makes it look like the rests were different lengths"_. Five
identical 1:30 rests, five visibly different widths, two slivers. Mechanism:
the axis is conditional on rest behaviour (M3), and the pace series drops
`p === 0` samples before bands are derived from contiguous rest-marked
points (`traceModel.ts:181`, `TraceChart.tsx`'s `restBandsForSegment`). The
legend `BAND = REST` is read as "band width = rest length", which it never
was. **Agrees when** a band's width means one stated thing.

### M7 — Stats' MACHINE column mixes two populations

`domain/stats/aggregate.ts`: `totals()` sums `workMeters ?? 0` over every
machine row; the watts accumulator skips `r.tier !== "stored"`. So METRES
and TIME describe a superset of the rows AVG WATTS is computed from. The
caption that would have explained it was struck by rulings 18 and 19
(§1.1). Measured ZERO on production 2026-09-13; latent, and the first
stored-tier row carrying a distance makes it visible.

**RULED at Gate 0A (James, 2026-09-14): option C, NO CAPTION.** Rulings 18
and 19 stand — the struck line was `k ROW(S) PREDATE WORK-ONLY TOTALS`,
struck by name, and re-adding it would have been its third attempt. **So
M7's second arm is CLOSED: the column may not say the cells differ.**
**Agrees when** the three cells describe ONE population — which moves a
stored figure, so M7 stays TRIAD and stays in PR 4.

**Which rows reach the stored tier, measured for the ruling** (correcting
the career-stats spec, which says a `link-lost` close lands there):
`monitorRun.ts`'s own contract is that `workSeconds`/`workMeters` are
"otherwise unconditional" over any non-empty `actuals`, so a dropped link
or a terminated piece still lands in the `work-pair` tier and DOES feed AVG
WATTS. The stored tier needs a monitor row with no measured interval at
all — a legacy row from before those columns, or the "0 OF 1 INTERVALS
MEASURED" case where the finish grace delivers no boundary. (PRIMARY —
`src/monitor/monitorRun.ts:686-692`.)

### M8 — charts clip their own labels (NEW, and live today)

§1.3. **[CORRECTED] Seven constants reserving space for text, three of them
short, across two screens** — the two metres gutters clip a seventh glyph by
3.59, the trace chart clips its last x tick by 2.80, and `SeasonGroup`'s
`LABEL_ROOM` is 0.22 short at the worst placement its own rule permits.
**Agrees when** no constant reserving space for text is a guess: each is
derived from the widest formatted string its own data can produce, at its
own class's measured advance.

**SHIPPED in PR 2.** All seven constants are derived by `labelRoom`; metres
ticks print `150k`; trace pace ticks print whole seconds; the trace chart's
end labels anchor inward. The gate is `e2e/stats.spec.ts`'s "no chart label
escapes its own viewBox", which goes red on the real defect (measured: the
restored grouping reports `100,000` at x = −11.59, the restored centred
anchor reports `0:40` at x = 301.2 in a 320 viewBox).

**Ruled already (James, 2026-09-14): shorten the labels** — metres ticks
become `150k` / `100k` / `50k`. Survived an attack at the low end: `niceMax`
floors at `base = 1000` (`charts/axis.ts:128-130`), so every metres tick is
a whole thousand, no `0k` collapse is reachable, and 1,000,000 prints
`1000k`. (PRIMARY.)

Three consequences ride to Gate 0A rather than being decided here: the same
frame prints `104,153 TODAY` in full beside the shortened ticks; the trace
chart's pace ticks can shorten the same way (`1:50`, not `1:50.0`) with
house precedent (`charts/axis.ts`'s `split` kind, added by Phase PS because
"pace prints tenths, which a gridline never needs"); and **shortening the
ticks does not touch either of the two new defects**, which need their own
fix.

### M9 — the free row's pause is invisible to every axis, including today's (NEW)

**[CORRECTED — promoted from a hole the anchor pass found in Gate 0's board
list.]** `walk-2026-08-31-justrow`: 104.63 s of wall clock against 1.69 s of
monitor elapsed, frozen at 185.81 m / 656.7 for 104 consecutive frames; the
row ran 499.52 s wall against 393.58 s elapsed — 26.9 % of it not rowing.
A free row has no program, no steps and no rest-marked samples, **so the
pause is invisible to both candidate axes AND to the one we draw today**,
which runs the line continuous across it. (PRIMARY — capture replay, anchor
pass.) **Agrees when** the chart of a free row does not assert continuity it
cannot have. Gate 0B's board 2 must show this frame; "five equal rests"
cannot.

### Appendix — CUSTOM shows the dates twice

`StatsScreen.tsx` renders `fmtRangeLine(range, …)` under the filter bar; on
CUSTOM with both ends set that is `fmtRange(from, to)`, which is exactly
what the two date inputs already show. The line's one non-redundant state is
`NO ROWS · <range>`. **Ruled by James 2026-09-14: drop the echo on CUSTOM,
keep `NO ROWS`.** Presets keep their line — there the caption is the only
place the dates appear.

**SHIPPED in PR 2, and narrower than the board drew it.** Writing the test
found that I5 governs this line from the other side too: the drop is
CONDITIONAL on the line actually being an echo. Two states leave the inputs
showing a pair that is not the pair being counted — a TO typed past today is
clamped, and an out-of-order pair leaves the last valid range in force — and
an unconditional drop silenced both. The rule is now "identical to the
inputs means redundant; anything else means the inputs are not what is being
counted".

## 3. Scope

**In:** all nine members and the appendix.

**Out:**

- Anything that changes what we SEND to Concept2. The logbook's arithmetic
  is ruled and is not reopened.
- The `MONITOR_SPM_MIN` and bar-axes rows, which are separate register
  items about different quantities.
- Retiring any tier of `rowContribution.ts`'s ladder. M7 is about what the
  column SAYS, not about collapsing the ladder.
- **Reversing rulings 18/19, the 2026-09-07 HR Gate 0, or the
  `isReconstructableClose` fix-round gate.** Each is James's to reopen; a
  member that needs one says so at its Gate 0 board rather than assuming it.

## 4. Gate 0 — split into 0A and 0B (PM, 2026-09-14)

**0A — You → Stats.** M7, M8 and the appendix: one open question and two
decisions already ruled. PR 2 ships off 0A without waiting for 0B.

**0B — the session screens.** M1-M6 and M9.

The split was argued FROM the 2026-08-31 ruling, not against it: its words
are "a third of a SCREEN at a time", and each half approves a whole screen.
**Two mitigations are owed and are part of 0A:** its tick board shows **all
four charts**, because M8 binds `TraceChart` — whose pace ticks and whose
newly-measured x-tick clip both live on 0B's screen — and 0B uses 0A's
provenance vocabulary verbatim or states a deviation.

**0A's boards:**

1. The shortened metres ticks with a seven-glyph value present, all four
   charts, both orientations, before and after, every colour pairing's
   contrast computed and stated as a number.
2. The `L00,000` frame itself as the "what it replaces" half of board 1.
3. The trace chart's clipped last x tick, before and after — **the second
   screen M8 reaches**, so 0A approves it or PR 2 leaves it.
4. The MACHINE column (M7), with its one open question: does a caption come
   back, and if so does that reopen rulings 18/19.
5. The CUSTOM filter with and without its echo line.

**0B's boards:**

1. The post-workout summary / log detail: tiles + eyebrow + table (M1, M1b,
   M2) — and because two tiles switch source per row (M1b), the board draws
   the SAME screen twice, once for a finished piece and once for a
   terminated one, so a static label's falsehood is visible rather than
   argued.
2. The trace chart: **three candidates**, five equal rests drawn under each,
   **and the free row's frozen 104 s (M9)**, which every one of them must be
   shown against because it is invisible to all three and to today's axis.

   | candidate | what the x axis is | survives the open freeze question? |
   | --- | --- | --- |
   | **A · work-only, named** | today's quantity, finally labelled | **yes** — recoverable from the series alone, and 0x0039 is its oracle |
   | **B · wall clock** | `work + machineRest` | **NO** — it is exactly what a frozen work clock breaks (§1.2) |
   | **C · work-only + fixed-width rest gaps** (PM, unargued) | work-only, each rest a separator printing the interval's own rest seconds | **yes** — asserts nothing about time during a rest |

   **[ADDED 2026-09-14] The open question is now a decision input, not a
   footnote.** Since it cannot be settled at a desk (§1.2), candidate B
   goes to the gate carrying an unquantified risk that A and C do not: if
   elapsed freezes during work, B silently under-reports the session's real
   duration by however long the rower stood still, and nothing on the
   screen would say so. **C is the only candidate that both fixes M6
   completely AND is immune** — the gap is a separator, the number is a
   fact about the program.
3. The connected live surface's total beside the stored total for the same
   session (M4, M5).

Because members 4, 5 and 7 change stored figures, those boards carry **the
before and after side by side for a row James already has**, so a moved
number reads as an improvement rather than as a row that quietly changed.

**Every cost attached to an option on either board is a factual claim and
gets the same evidence bar as the design (RF30).** The option ruled out in a
clause is the one that needs the receipt.

## 5. The PRs

| PR | Members | Risk model | State |
| --- | --- | --- | --- |
| 1 | M1, M2 | Copy on a rendered surface. No number moves. | after 0B |
| 2 | M8 + appendix | Layout across four charts, two screens; one copy deletion. No number moves. | **LANDED** |
| 3 | M3, M6, M9 | Changes what an axis IS. Antagonist pass. No stored data. | **PROVISIONAL** |
| 4 | M4, M5, M7 | **TRIAD** — stored figures render differently. dba + antagonist + PM. | **PROVISIONAL** |

Grouped by risk model rather than by screen so each PR carries one kind of
review (CLAUDE.md's grouping tie-break).

**[CORRECTED] PRs 3 and 4 are PROVISIONAL and cannot be settled before their
Gate 0.** Four members' options span two risk models: M2 option B would make
PR 1 TRIAD; M7 moves to PR 2's group if Gate 0A rules it a label and stays
in PR 4 only if it rules it a population change; M3 and M4 split ONE
mechanism (the register-map sum) across two PRs, which the plan must either
justify or undo.

**[CORRECTED] PRs 1 and 3 are the same screen** (`PostWorkoutSummary.tsx`
renders `MachineTierBlock`:438, `MachineSummaryTable`:824,
`TraceChart`:833). Between them the screen labels twelve figures while the
chart beneath sits unnamed under `MACHINE CONFIRMED · WORK ONLY` — and PR 1
makes that gap MORE conspicuous. **Ruled (PM): same release, and PR 1
introduces no screen-level provenance claim it cannot keep. I1 is true at
the END of the pass and cannot gate PRs 1-3.**

**Ordering constraint (PM):** PR 4 should not be live when Wave A's
`dies 2026-10-10` arrives.

## 6. Invariants

- **I1.** No number on these surfaces is presented without the screen being
  able to say whose arithmetic it is. True at the END of the pass.
- **I2.** Two numbers a rower reads as the same quantity are either (a)
  equal, (b) labelled as different quantities, or **[CORRECTED] (c) one is a
  lossy estimate of the other and says so** — the third arm M4 needs, since
  the live total can silently lose a frameless interval entirely. Silence is
  not an option.
- **I3.** A chart axis is a defined quantity, named in the file that builds
  it and on the screen that draws it.
- **I4. [CORRECTED] No constant reserving space for text is chosen by
  looking at a chart** — not only axis gutters. Each is derived from the
  widest formatted string its own data can produce, at its own class's
  measured advance. Seven constants are in scope (§1.3's table); the first
  draft stated I4 over one of the places it governs (RF34).
- **I5.** A caption that exists only to repeat a control's own value is
  deleted; a caption carrying a state the control cannot show is kept.

## 7. Testing

**[CORRECTED] All three gates named in the first draft were unsound. These
replace them.** Each gets RF26's five-part proof contract in its own PR's
plan.

- **M8 cannot be gated in `client`.** jsdom 30 leaves `getBBox` undefined
  and every rect zero, and the repo has no `@vitest/browser`. So M8's gate
  is a **Playwright** assertion of each label's own `getBBox` against its
  SVG's viewBox, on a fixture that produces the widest string each constant
  must hold — a seven-glyph metres tick, a 13-glyph `TODAY` label, a 4-glyph
  last x tick landing on the domain's end. The biting mutation restores the
  hand-tuned constant; the report states what it was and what the failure
  said.
- **M7's proposed gate already exists and is green.** `gate0Seed.ts:28` is a
  stored-tier pm5 row carrying 6,240 m, and `StatsScreen.test.tsx:292`
  already asserts it beside `AVG WATTS —`. The exclusion is a
  mutation-pinned ruling, so the new gate must go red on the missing
  **EXPLANATION**, not on the arithmetic — which means it cannot be written
  until Gate 0A says what the screen will say.
- **M3/M6/M9's gate cannot be a colour or class assertion** (RF37): Vitest
  imports CSS as `""` and jsdom does not resolve `var()`. Band and gap
  geometry are asserted in the browser — **and the fixture set includes a
  free row with a frozen span (M9)**, which the first draft's gate could not
  have failed on.

## 8. Gates

- **Antagonist — ANCHOR PASS run 2026-09-14** on this decomposition and PR
  3's semantic; its findings are folded in above and its vetted ground is in
  §11. A DELTA pass is owed on PR 4 (stored meaning) and on PR 3's revised
  axis argument, which is now a different argument.
- **PM — open gate run 2026-09-14**, approved with four amendments, all
  folded in. Final gate on PR 4 (TRIAD).
- **dba — PR 4 only.** PRs 1-3 touch no `app/server/db`, no store, no bulk
  read: SKIP, said aloud.
- **Gate 0A — required before PR 2. Gate 0B — required before PRs 1, 3, 4.**
- **Hardware walk — [CORRECTED] none for PRs 1, 2 and 4; PR 3 may need one.**
  Nothing in this pass reaches the wire, but §1.2's open question is NOT
  desk-answerable after all — the corpus was swept and cannot discriminate.
  A walk leg for it would be one programmed piece with a ~30 s mid-interval
  stop, and it is PR 3's to propose with a PM readiness PASS, not this
  pass's to assume.

## 9. Exit criteria

1. Gate 0A and Gate 0B both approved on rendered boards, both orientations.
2. All nine members have either shipped or been ruled out by James at a Gate
   0 with the cost recorded.
3. **[CORRECTED]** I4 holds as a census over the shipped tree: every
   constant reserving space for text names the widest string it must hold
   and the advance it was derived from, and a browser gate fails when one is
   too small. (The first draft pinned "a seven-glyph tick", which the
   approved `150k` fix probably makes unreachable — a gate that cannot go
   red, RF21.)
4. **[CORRECTED]** A census derived from the SHIPPED TREE, not from the
   boards: every figure on the pass's surfaces is listed with the sentence
   the screen uses to say whose it is, or is named as ruled-out with its
   ruling. (The first draft said "checked by reading each board", which
   checks the design, not the product.)
5. **[ADDED, PM]** The release notes name each changed figure and why the
   new one is right — a before/after board reaches James, not a tester.
6. The ROADMAP section's members are struck as they land, each with the PR
   that landed it.

## 10. Rows to file

None proposed yet. Rows will be proposed at the final PR's hand-back, per
CLAUDE.md's gate, once both Gate 0s say which members ship.

**Housekeeping, settled here so it is not a row (RF29): PR 2 deletes
`app/e2e/axisProbe.spec.ts`** — 213 lines of throwaway that asserts nothing.
Whatever of it PR 2's real gate needs is rewritten as an asserting test in
that PR; the probe itself does not survive the branch, and neither does
`HANDOFF-number-provenance.md`.

## 11. Gate record

| Gate | When | Verdict |
| --- | --- | --- |
| Scope ruling (James) | 2026-09-14 | "everything agrees", plus M8 and the appendix |
| M8 label shape (James) | 2026-09-14 | shorten metres ticks to `150k` |
| Appendix (James) | 2026-09-14 | drop the CUSTOM echo, keep `NO ROWS` |
| Gate 0 split (James) | 2026-09-14 | 0A first, PR 2 ships off it |
| Antagonist anchor | 2026-09-14 | findings folded in; vetted ground below |
| PM open | 2026-09-14 | APPROVED with four amendments, all folded in |
| Gate 0A | 2026-09-14 | **APPROVED as rendered** (James: "approved") — artifact `MZsVEJ1rSsxYLFQRuCrbtS` rev 1, boards at `docs/design/number-provenance/gate0a/`. Rulings 1, 3 and 4 take the option the boards rendered; **ruling 2 (the MACHINE caption) RULED C by James the same day: NO CAPTION** — rulings 18/19 stand, and M7's "or the column says they do not" arm is closed. M7 survives only as the population change, which moves a stored figure and stays TRIAD in PR 4 |
| Gate 0B | — | owed |

**The phase's VETTED GROUND** (attacked and held, so later specs inherit it
without re-deriving): 0x0039 is work-only; the trace axis is neither
work-only nor wall clock (357.55 / 254.8 / 374.76 on one capture); M1's
subject (`MachineSummaryTable.tsx:34` against an unlabelled
`MachineTierBlock`); M2's magnitude; M6's mechanism
(`TraceChart.tsx:182-205`); the `split` precedent (`axis.ts:99-105`) and
that the trace chart does not use it; the `L`-as-clipped-`1` signature; the
committed photograph as evidence THAT it clips; the appendix; and the ruled
`150k` label at the low end.
