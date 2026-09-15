# Gate 0B — round 2: what James's ruling turned into, rendered

James ruled on board 1 (2026-09-15): **"go with the recommendation."** That
recommendation was a direction, not a design — neither half had been drawn —
so this round rendered both and measured the costs the board could only
assert. **APPROVED by James on 2026-09-15** (artifact
`TuGUWZaKj9BxiGaCR7Sb6A`) and implemented on branch `gate0b-round2`; this file
is the record of the gate, not a live proposal.

Captured by `app/e2e/gate0b.spec.ts` (the board-1 harness, extended) at
390x844 and 844x390 against this worktree's compose stack. **That harness
has since been DELETED and replaced by `app/e2e/provenance.spec.ts`, which
asserts this behaviour rather than capturing it** — the frames below are
what it produced while it lived.

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
copies of one predicate, and `machineTierFromRun`'s own doc comment already records that
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

### The words

**`DERIVED` / `MEASURED` (James, 2026-09-15.)** The board said the second
group was "ours". It is not — `AVG WATTS` and `CAL/HOUR` run **Concept2's own
logbook's own figures**, so the arithmetic is theirs and only the running of
it is ours. "Estimated" was never available either: the tilde already means
that on the baselines surface.

**An objection was raised against MEASURED and OVERRULED, and it is recorded
rather than dropped** (`MachineSummaryTable.tsx`): "measured" is loose over
`CAL` and `DRAG`, which the monitor almost certainly computes from flywheel
data. **That is NOT sourced from this repo.** `pm5-interface-notes.md`
documents both as wire fields (`0x0039[6-7]`, `0x0038[16]`) and says nothing
about how the monitor arrives at them — so the objection rests on outside
knowledge and was put more confidently than the evidence supported. If a
capture or a Concept2 sentence ever settles it, that comment is where to
come back.

Two things fell out of the change. It **resolved an inconsistency James
caught by asking**: the table had said `REPORTED BY THE PM5` while the sheet
said `REPORTED BY THE MONITOR` — the same distinction in two different
words, which is exactly what this design claims to avoid. `MEASURED` has no
"by the ..." clause, so both surfaces now carry the identical two words. And
the labels got **shorter** (7 and 8 characters against 13 and 19), leaving
room for the two-digit `#` the component's own comment warns about.

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

### THE LESSON, and it cost three rounds inside the fix for it

**A group heading is a claim about EVERY row under it, and it is the easiest
place in an interface to over-claim.** `PM5 · PER INTERVAL` over two columns
that are not the PM5's is the defect this whole pass exists to remove — and
while building the fix I wrote the same defect three times:

1. *"Concept2's own published formula, run on this piece"* over all four
   derived rows. True of **two**: RATE is a weighted mean of the splits and
   AVG HR a time-weighted mean of the trace.
2. *"Worked out on this device, from what the monitor measured"* — still
   wrong for AVG HR, which comes from the **belt's** trace.
3. *"Worked out on this device from the monitor's own figures"* — the same
   error again, reworded.

The group note became **"Worked out on this device. Each line says from
what."** — and **that was WRONG TOO, found by the second review.** A row with
no value now says "This piece has no number here", so "each line says from
what" was false of those lines, and "Straight from the monitor, as it sent
them" sat over figures the monitor never sent. **THE GROUP NOTES ARE GONE.** A
heading cannot be checked against a value; only a row can. The headings now
say nothing but which group this is, and every claim lives on a row.

**That is three attempts at one sentence**, which is the strongest evidence
this file holds for its own lesson: the safe number of claims to make in a
heading is zero.

**None of the three was caught by a number.** The geometry file said "fits",
the contrast file said 6.69:1, and every gate was green. All three were
caught by opening the PNG and reading it — which is why RF7 exists, and why
the design gate is a rendered artifact rather than a description.

**And a fourth, in a different medium: AN EDIT SCRIPT'S SUCCESS MESSAGE IS A
CLAIM ABOUT ITS OWN DIFF.** The script fixing defect 3 printed `ok`, asserted
its anchor matched exactly once, and changed NOTHING — the next capture still
carried the old sentence. It was caught by opening the PNG again, not by the
script, the formatter, the typecheck or the suite. The habit that closes it:
**read the file back from disk after writing and assert the new text is there
and the old text is gone**, which is what the corrected script does. This is
the same lesson this pass already learned once as "a fix-round summary is a
claim about its own diff", now earned a second time in code.

## Contrast, measured

**8 pairings** as captured, every element round 2 added at the time, measured (one of the eight, `.tile-source-group-note`, no longer exists — the committed JSON is the record of what was measured then, not of what ships) from the LIVE cascade
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

**[ALL BUT THE LAST WERE CLOSED BY THE IMPLEMENTING WORK — kept here so the
gate's own state at the time is legible.]**

- ~~Only the STORED door is wired.~~ **DONE:** both `storedMachineTier` and
  `machineTierFromRun` stamp, each from the same predicate its value took.
- ~~`MachineTier.sources` is OPTIONAL.~~ **DONE:** it is REQUIRED, so the
  compiler is the gate rather than a comment — it caught two hand-built
  fixtures the moment it changed.
- ~~No unit tests.~~ **DONE:** `tileProvenance.test.ts` and
  `TileSourceSheet.test.tsx`. **One of them did NOT bite and was rewritten**: the
  row-order assertion reduced to `i === 0 || …`, true of any non-empty list, and
  a fully reversed ORDER passed it 4/4 and the whole suite 8597/8597.
- **Boards 2 and 3 of Gate 0B remain unbuilt.** Still true.
