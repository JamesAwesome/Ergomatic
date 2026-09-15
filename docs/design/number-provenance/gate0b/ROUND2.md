# Gate 0B — round 2: what James's ruling turned into, rendered

James ruled on board 1 (2026-09-15): **"go with the recommendation."** That
recommendation was a direction, not a design — neither half had been drawn —
so this round renders both and measures the costs the board could only
assert. **Nothing here is approved.**

Captured by `app/e2e/gate0b.spec.ts` (the board-1 harness, extended;
throwaway, deleted by the implementing PR) against this worktree's compose
stack at 390x844 and 844x390.

## ONE PART OF THE RULING IS WITHDRAWN, AND IT IS MINE

The recommendation's third paragraph said AVG HR was "the case worth
reopening". **It is not, and the repo already said so.**
`domain/monitor/derivedHeartRate.ts:20-42` records that James settled this on
**2026-09-07 as Gate 0 option A**: the tile is the time-weighted mean over
working strokes, within 0.5 bpm of a whole-session mean on four captures.
Using the table's column instead was **option C and was rejected with
numbers** — it runs 3.5 to 15.2 bpm above the trace, and Concept2 documents
that field only as "Split/Interval Work Heartrate", never saying whether it
is a mean, a final reading or a peak (`pm5-interface-notes.md` §10). The
comment ends: *"Worth knowing before anyone 'fixes' the tile to match the
rows."*

That is RF18 — re-researching what this repo had already settled — and the
speculation that went with it (that the tile might be wrong because rest
samples leak in) is refuted: `deriveAverageHeartRate` excludes `r === true`
explicitly. What is actually owed on AVG HR is only that the SCREEN does not
say what the code knows, which is the same fix as everything else here.

## The census the board never stated

Six machine tiles, and they are **2/2/2**, not 4/2:

| tile | source | switches? |
| --- | --- | --- |
| AVG WATTS | computed here (`logbookWatts`) | no |
| CAL / HOUR | computed here (`logbookCalPerHour`) | no |
| CALORIES | the monitor's (`detail.totalCalories`) | no |
| DRAG | the monitor's (`detail.dragFactorAverage`) | no |
| **RATE** | either | **on `finished`** |
| **AVG HR** | either | **on whether the monitor sent one** |

**The two conditional tiles switch on DIFFERENT predicates**, which is why no
static grouping and no fixed label can be true of both, and why the drill-down
is per-row.

`MachineTier` carries values only — so a renderer **cannot** re-derive which
branch produced `rate` or `avgHr`. Provenance is therefore stamped at the
same site that picks the value. Re-deriving it downstream would make two
copies of one predicate, and `summaryModel.ts:1229` already records that
exact failure happening once this phase ("the alternative is two that drift,
which is how the tile and the wire came to disagree").

## Ruling 2 — the grouped table, and why column ORDER decides it

Measured, not asserted (`*/geometry.json`, 2 intervals, 390px portrait):

| variant | table width | content box | overflow | group labels fit? |
| --- | --- | --- | --- | --- |
| baseline (`main`) | 379.64 | 350 | **29.64** | n/a |
| grouped, monitor first | 379.64 | 350 | **29.64** | yes |
| grouped, computed first | 379.64 | 350 | **29.64** | yes |

**Grouping costs ZERO horizontal pixels**, and the ~30px overflow is
PRE-EXISTING on `main` — the component's own comment already said the strip
"overflows a 390px screen by a few px today". Option B's cost is one row of
height, not width.

**But the order is the whole design, and only the capture shows it.** The
table scrolls sideways, so whatever sits rightmost is invisible at rest:

- **Monitor first** (`round2/table-grouped-portrait.png`) clips `WATTS` and
  `CAL/HOUR` and truncates `COMPUTED HERE` itself. At rest a rower sees
  "REPORTED BY THE PM5" over everything legible — **it hides the disclosure
  the change exists to make**, and arguably reads worse than today.
- **Computed first** (`round2-computed-first/table-grouped-portrait.png`)
  shows both headings whole and clips `REST m` — exactly the column `main`
  already clips.

**Recommended: computed first.** The measurement said the two variants were
identical; the picture is what separated them.

A copy correction rides with it: the board said the second group was "ours".
It is not. `AVG WATTS` and `CAL/HOUR` run **Concept2's own published logbook
formula** over measured inputs — the formula is theirs and only the running
of it is ours — so the honest pair is **REPORTED / COMPUTED**, never
theirs/ours, and never "estimated", which is what the tilde already means on
the baselines surface.

## Ruling 1 — the drill-down

Apple Health's pattern: nothing on the tile face, the answer one level down
(`round2-sheet/sheet-open-*.png`). Deliberately NOT Strava's rename, because
Strava's axis encodes QUALITY and ours does not — on a terminated piece the
computed 26 is what the monitor's own View Detail screen shows and its
reported 52 is wrong (§27.6), so a mark on the tile face would brand the
MORE correct number as the less trustworthy one.

The sheet groups by what each tile's source **is for this row**, so the
grouping is always true rather than true on average, and it reuses the
table's two words so a rower learns one distinction rather than two.

**Opener hit target measured at exactly 44px** in both orientations
(`opener-*.json`) — the house hard requirement.

**A defect found by looking at the first capture, and fixed before this
board:** the first draft put *"Concept2's own published formula, run on this
piece"* as a heading over all four computed rows — **true of exactly two of
them**. RATE is a weighted mean of the splits; AVG HR is a time-weighted mean
of the trace. A heading over-claiming what sits under it is the precise
defect this whole pass exists to remove. The formula sentence now sits on the
two rows it is true of; the group note says only what is true of all four.

## Contrast, measured

**8 pairings**, every element round 2 adds, measured from the LIVE cascade
with the sheet OPEN (half of them do not exist until it is) —
`round2-computed-first/contrast-round2.json`. **Lowest 6.69:1, highest
17.11:1**, against WCAG AA's 4.5:1. One `SELECTORS` list feeds both the
measurement and the coverage assertion, so a selector that matches nothing
fails the test; board 1's version spelled its list twice, which is a drift
waiting to happen even though both copies agree today.

Label ink against its span at the final size, both comfortable:
`COMPUTED HERE` 98.81 in 144.20, `REPORTED BY THE PM5` 144.41 in 215.63.

**A type-scale correction the measurement caught.** The group row was drawn
at 9.5px — smaller than anything else on that table, where the column
headers are 10px. That was a new size invented to make the row feel
secondary, and it is now **10px** like its neighbours, with the hierarchy
carried by letter-spacing and the rule beneath instead. Contrast is
unchanged (the colour did not move); the labels still fit.

## What is NOT done

- **Only the STORED door is wired.** `storedMachineTier` (`storedSummary.ts`)
  is what `/today/log/:id` renders, so it is what these captures exercise.
  `machineTierFromRun` feeds the live screen and Just Row and is NOT stamped.
  **The implementing PR must stamp both or the sheet is honest on one door
  and silent on the other (RF24)**; the field's own comment says so.
- `MachineTier.sources` is OPTIONAL only because this is a prototype. It
  should be required once both producers stamp it, so the compiler is the
  gate rather than a comment.
- No unit tests. This is capture scaffolding, not an implementation.
- Boards 2 and 3 of Gate 0B remain unbuilt.
