# The "say which number this is" design pass

**Status: SPEC WRITTEN 2026-09-14.** Scope ruled by James the same day:
**"everything agrees"** — labelling, the chart, and making live and stored
quantities agree where they diverge. Awaiting the antagonist anchor pass,
the PM open gate, and Gate 0.

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

This pass rules all of it at once, on one Gate 0, because approving a third
of a screen at a time is how the screen came to mix quantities in the first
place (James, 2026-08-31).

**It also carries one defect a rower can see today**, photographed on
James's phone on 2026-09-14: the Season chart's y-axis reads `L50,000` and
`L00,000` — the leading `1` clipped off by a hand-tuned gutter.

## 1. Research pass

Run 2026-09-14, before any design. Tags: PRIMARY (read in this repo's code,
a committed capture, or a committed vendor document), SECONDARY (a repo doc
or comment transcribing something), INFERENCE.

### 1.1 Prior art (RF18)

`ls docs/superpowers/research/` holds 21 entries. **Nothing on number
provenance, axis semantics, or chart labelling.** Nothing found — itself the
result. (PRIMARY.)

What the repo HAS already settled, and which this spec must not re-derive:

- **Whose arithmetic, ruled.** James, §3.1 of the logbook-parity spec: the
  logbook's formula. The arithmetic was ruled; the LABEL was not. (SECONDARY
  — `docs/superpowers/specs/2026-09-06-logbook-parity-design.md`.)
- **"Derived versus measured" is not a real axis.** `pm5-interface-notes.md`
  §27.5 measures the PM5's own watts field against `2.80/pace³` and finds
  agreement under 1 W, so the monitor's watts is itself a derivation of
  pace. Nothing on that strip is measured. The honest axis is WHOSE
  ARITHMETIC. (PRIMARY.)
- **The real disagreement band.** Watts ≤1 W; cal/hr **24-78 on six of nine
  sessions**. The `931`/`929` pair quoted in the ROADMAP section is an e2e
  SEED, not a record — a Gate 0 board built on it would show a 2 cal/hr gap
  where the real one reaches 78. (PRIMARY, `2026-09-06-logbook-parity-design.md`.)

### 1.2 Does the system have the concept? (the standing brainstorm question)

**The monitor has no session wall clock, and this is the finding that shapes
PR 3.**

- 0x0039's Elapsed Time is a **whole-workout total and WORK-ONLY** —
  confirmed on the wire, superseding an earlier UNCONFIRMED flag:
  `walk-2026-08-25/rests-finished-recording.jsonl.gz` reads 254.8 s against
  three intervals summing to exactly 254.8 s, over a program carrying 120 s
  of rest **it excludes entirely**. Pinned by `oracleCorpusReplay.test.ts`.
  (PRIMARY — `pm5-interface-notes.md` §27.1 and its table row at 4-6.)
- 0x0031's Elapsed Time is **per-interval**, proved by hardware walk 4, and
  advances during a rest only while the rower keeps the flywheel moving.
  (PRIMARY — §10, and `traceModel.ts`'s own header for the behaviour.)
- The live running total we display is the machine's own session distance,
  **work plus rest by construction** (`surfaceModel.ts:562-574`, its own
  words, read straight through). (PRIMARY.)

So the machine reports a work-only total and a per-interval clock. **It does
not report, anywhere, how long the session took.** A wall-clock axis is
therefore a quantity we would assert on the machine's behalf, derived from
programmed rest seconds plus work elapsed — and we would be wrong whenever
the rower rests longer than the program says, which is the ordinary case at
a real erg. This is the same shape as the PAUSED state we shipped that the
PM5 cannot have (CLAUDE.md's own example). **PR 3 must name who is wrong
when it matters, or not draw that axis.**

### 1.3 What this spec measured

**The axis probe** (throwaway, branch `number-provenance`, commit
`6b76f902`; `2 passed`): every SVG tick label's own box in user units, its
clearance from the card edge, the rendered per-glyph advance, and whether
the intended face is drawing it.

- IBM Plex Mono IS the face (`plexLoaded: true`), and its advance is
  **5.94 units at 9 px**. Every gutter constant in the four charts was
  tuned against roughly 5.67 — all four are ~5% under-sized. (PRIMARY.)
- Every six-glyph metres label (`10,000`, `15,000`, `20,000`, `60,000`) is
  **35.64 wide starting at x = 2.36** — 0.4 of a glyph from the SVG's own
  edge, identically on all three Stats charts. Nothing clips at the e2e
  seed. (PRIMARY.)
- A seven-glyph label (`100,000`) needs 41.58 units into a 38-unit gutter,
  overflowing by 3.58. **INFERENCE from a measured advance, not rendered** —
  the probe's attempt to seed a season past 100,000 m did not move the
  season's own maximum, so this frame was not produced in Chromium.
- **It is produced on James's phone.** His 2026-09-14 screenshot of Season
  2027 (104,153 m today) reads `L50,000` and `L00,000`. (PRIMARY — the
  photograph.) `50,000` below them, six glyphs, renders whole.

**This is the third occurrence of one class.** `TraceChart`'s `LEFT_PAD`
went 36 → 42 after a clipped `1` read as `L` (`L:40.0`); `WeekBarsGroup`'s
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
  the Stats column**. This spec adds an **eighth** (the clipped ticks) and
  an appendix (the CUSTOM echo line), both from James on 2026-09-14.
- The eyebrow really is over the TABLE (`MachineSummaryTable.tsx`), not the
  tiles; `MachineTierBlock` carries no provenance label of any kind. So the
  derived tiles are UNLABELLED rather than mislabelled. (PRIMARY, confirmed
  again here.)
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

### M2 — AVG HR is derived from the trace

The tile is our mean over the recorded trace; the HR column beneath it is
the monitor's own per-interval reading, measured 3.5-15.2 bpm lower. Two
numbers, one screen, no statement of difference. **Agrees when** the tile
says it is ours, or reads the same source the column does.

### M3 — the chart's axis is a quantity with no name

`traceModel.ts`'s own header: "NEITHER `t` NOR `d` IS A WORK-ONLY
QUANTITY … each is CONDITIONAL ON ROWER BEHAVIOUR DURING RESTS — a frozen
rest contributes nothing to either axis; an advancing rest contributes all
of itself." It sits directly under `MACHINE CONFIRMED · WORK ONLY`.
**Agrees when** the axis is a defined quantity and the screen says which —
see §1.2 for why "wall clock" is an assertion, not a reading.

### M4 — the same session's total is two different numbers

Live: `surfaceModel.ts`'s `sessionDistanceMeters`, "work + rest by
construction, read straight through". Stored: 0x0039's work-only total.
Neither screen labels which. **Agrees when** one of them changes, or both
are labelled such that a rower reading them an hour apart is not told two
different things about one row.

### M5 — the interrupted TOTAL line

An interrupted session shows a rest clause LIVE and none STORED for the
identical row. Silent. **Agrees when** the stored line says the same thing
the live one did, or says why it cannot.

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
caption that would have explained it — `k ROWS PREDATE WORK-ONLY TOTALS ·
NOT IN AVG WATTS` — was struck by rulings 18 and 19
(`TotalsGroup.tsx`: "NO prose"). Measured ZERO on production 2026-09-13;
latent, and the first stored-tier row carrying a distance makes it visible.
**Agrees when** the three cells describe one population, or the column says
they do not.

### M8 — the y-axis clips its own numbers (NEW, and live today)

§1.3. Four charts, four hand-guessed gutters, an advance 5% wider than any
of them assumed, and a rendered production frame reading `L00,000`.
**Agrees when** no gutter is a guess: each is derived from the widest
formatted tick that chart can produce.

**Ruled already (James, 2026-09-14): shorten the labels** — metres ticks
become `150k` / `100k` / `50k`. Two consequences ride to Gate 0 rather than
being decided here: the same frame prints `104,153 TODAY` in full beside
them, and the trace chart's pace ticks can shorten the same way (`1:50`,
not `1:50.0`) with house precedent — Phase PS added a `split` tick kind
because "pace prints tenths, which a gridline never needs"
(`charts/axis.ts`).

### Appendix — CUSTOM shows the dates twice

`StatsScreen.tsx` renders `fmtRangeLine(range, …)` under the filter bar; on
CUSTOM with both ends set that is `fmtRange(from, to)`, which is exactly
what the two date inputs already show. The line's one non-redundant state is
`NO ROWS · <range>`. **Ruled by James 2026-09-14: drop the echo on CUSTOM,
keep `NO ROWS`.** Presets keep their line — there the caption is the only
place the dates appear.

## 3. Scope

**In:** all eight members and the appendix, one Gate 0.

**Out:**

- Anything that changes what we SEND to Concept2. The logbook's arithmetic
  is ruled and is not reopened.
- The `MONITOR_SPM_MIN` and bar-axes rows, which are separate register
  items about different quantities.
- Retiring any tier of `rowContribution.ts`'s ladder. M7 is about what the
  column SAYS, not about collapsing the ladder.

## 4. Gate 0 — what the board must show

Five surfaces × two orientations, every colour pairing's contrast computed
and stated as a number, and — because members 4, 5 and 7 change stored
figures — **the before and after side by side for a row James already has**,
so a moved number reads as an improvement rather than as a row that quietly
changed.

Boards owed:

1. The post-workout summary / log detail: tiles + eyebrow + table (M1, M2).
2. The trace chart, work-only and wall-clock candidates, with five equal
   rests drawn under each (M3, M6).
3. The connected live surface's total beside the stored total for the same
   session (M4, M5).
4. You → Stats: the MACHINE column (M7), the shortened ticks with a
   seven-glyph value present (M8), and the CUSTOM filter with and without
   its echo line (appendix).
5. The `L00,000` frame itself, as the "what it replaces" half of board 4.

**Every cost attached to an option on this board is a factual claim and gets
the same evidence bar as the design (RF30).** The option ruled out in a
clause is the one that needs the receipt.

## 5. The PRs

| PR | Members | Risk model |
| --- | --- | --- |
| 1 | M1, M2 | Copy on a rendered surface. No number moves. |
| 2 | M8 + appendix | Layout across four charts; one copy deletion. No number moves. |
| 3 | M3, M6 | Changes what an axis IS. Antagonist pass. No stored data. |
| 4 | M4, M5, M7 | **TRIAD** — stored figures render differently. dba + antagonist + PM. |

Grouped by risk model rather than by screen so each PR carries one kind of
review (CLAUDE.md's grouping tie-break: a reviewer should not have to hold
two risk models at once). PR 2 lands first among the visible ones if James
wants the clipped axis fixed before the rest — it is the only member with a
live sighting.

## 6. Invariants

- **I1.** No number on these five surfaces is presented without the screen
  being able to say whose arithmetic it is.
- **I2.** Two numbers a rower reads as the same quantity are either equal or
  labelled as different quantities. Silence is not an option.
- **I3.** A chart axis is a defined quantity, named in the file that builds
  it and on the screen that draws it.
- **I4.** No axis gutter is a constant chosen by looking at a chart. Each is
  derived from the widest formatted tick its own data can produce.
- **I5.** A caption that exists only to repeat a control's own value is
  deleted; a caption carrying a state the control cannot show is kept.

## 7. Testing

Each gate gets RF26's five-part proof contract in its own PR's plan. The
three that need naming here:

- **M8's gate must be able to go red on the real defect**, which our
  captures cannot produce today (§1.3). So the test fixture must carry a
  seven-glyph tick, and the assertion is the label's own box against its
  SVG's origin — not a screenshot. The biting mutation is restoring a
  hand-tuned constant.
- **M7's gate starts upstream of the producer (RF24):** one test builds a
  stored-tier row carrying a distance and asserts what all three cells say,
  because the defect is invisible on every row the seed holds today.
- **M3/M6's gate cannot be a colour or class assertion** (RF37): Vitest
  imports CSS as `""` and jsdom does not resolve `var()`. Band geometry is
  asserted in the browser.

## 8. Gates

- **Antagonist — ANCHOR PASS at phase open**, on this decomposition plus
  PR 3's spec (the riskiest: it invents an axis semantic). Then a delta pass
  on PR 4, which touches stored meaning.
- **PM — open gate on this slate**, and a final gate on PR 4 (TRIAD).
- **dba — PR 4 only.** PRs 1-3 touch no `app/server/db`, no store, no bulk
  read: SKIP, said aloud.
- **Gate 0 — required, all five boards, before any implementation task.**
- **Hardware walk — none.** Nothing here reaches the wire.

## 9. Exit criteria

1. Gate 0 approved on the rendered boards, both orientations.
2. All eight members have either shipped or been ruled out by James at Gate
   0 with the cost recorded.
3. `L00,000` cannot recur: a gate fails on a seven-glyph tick in any chart.
4. No surface in the pass carries a number whose provenance the screen
   cannot state (I1), checked by reading each board, not by grep.
5. The ROADMAP section's members are struck as they land, each with the PR
   that landed it.

## 10. Rows to file

None proposed yet. Rows will be proposed at the final PR's hand-back, per
CLAUDE.md's gate, once Gate 0 says which members ship and which are ruled
out.

## 11. Gate record

| Gate | When | Verdict |
| --- | --- | --- |
| Scope ruling (James) | 2026-09-14 | "everything agrees", plus M8 and the appendix |
| M8 label shape (James) | 2026-09-14 | shorten metres ticks to `150k` |
| Appendix (James) | 2026-09-14 | drop the CUSTOM echo, keep `NO ROWS` |
| Antagonist anchor | — | owed |
| PM open | — | owed |
| Gate 0 | — | owed |
