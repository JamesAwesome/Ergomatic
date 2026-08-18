# Connected metrics: the interval average, and total meters back on the bar

**Date:** 2026-08-18 · **Status:** drafted from James's brainstorm answers;
awaiting his spec approval, then the full antagonist pass. · **Phase code
CM.**

## What and why

Testers asked for two numbers back on the connected screen: how far they
have gone this session, and how the interval they are in is averaging. The
first is a number the rower can already see on the monitor and wants on the
phone; the second is the one thing the LIVE pane never told them — it shows
the split *right now*, which jumps every stroke, and the split they were
*asked* for, but nothing that says whether the interval as a whole is on
pace while there is still time to fix it.

Both numbers exist on the PM5's wire and both are already decoded by
`domain/monitor/pm5/parse.ts`. **Neither is computed by us.** That is the
spec's central constraint, and it is not stylistic: on 2026-08-13 this app
displayed 16938 m against the monitor's own 4384 m, and every gate we had
passed, because each one checked the app against itself. A number the
machine also reports is read from the machine.

Mockups: `4a-meters-on-bar.png` and `README-4a-amendments.md` from James's
design handoff. This spec follows them except where his brainstorm answers
or the wire facts below overrule them, and each departure is named.

## Research pass

### Does the underlying system have these concepts?

**Yes, both, and this was checked before anything was designed.**

- **Total work distance** — `0x0031` (general status) bytes 11-13, whole
  meters, no scale annotation. PRIMARY: C2 BLE spec via
  `docs/monitor/pm5-interface-notes.md:459`; already parsed as
  `GeneralStatus.totalWorkDistanceMeters` (`parse.ts:113`).
- **Rest distance** — `0x0032` (additional status 1) bytes 11-12, whole
  meters. PRIMARY: same doc, `:486`; parsed as
  `AdditionalStatus1.restDistanceMeters` (`parse.ts:151`).
- **Split/interval average pace** — `0x0033` (additional status 2) bytes
  8-9, **0.01 sec/lsb**. PRIMARY: same doc; parsed as
  `AdditionalStatus2.splitAvgPace` (`parse.ts:183`). Arrives at the status
  cadence (~2 Hz).
- **The finished interval's own average pace** — `0x0038` (interval data)
  bytes 6-7, **0.1 sec/lsb**. PRIMARY: same doc; parsed as
  `splitIntervalAvgPace` (`parse.ts:254`).

### The fact that shapes everything below

**The PM5 counts work distance and rest distance separately.** There is no
single "total meters" field. `Total Work Distance` (`0x0031`), `Rest
Distance` (`0x0032`), `Interval Rest Distance` (`0x0037`) and `Total Rest
Distance` (end-of-workout summary) are four distinct fields. So the
handoff's "cumulative meters incl. rest-phase meters (matches PM5 total)"
is not achievable as a single read, and cannot be both things it claims.
INFERENCE, from the field list: `Total Work Distance` excludes rest meters.

**James's ruling (2026-08-18):** the live number means the same as the
summary screen's DISTANCE — work plus rest — so one rower sees one meaning
of "total meters" in one app.

### The hazard this feature is most likely to ship

`0x0033`'s average pace is **0.01 sec/lsb** and `0x0038`'s is **0.1
sec/lsb**. `parse.ts:250-254` already flags that the vendor doc "prints
them identically in both copies of this characteristic's table." Two fields
with the same name, the same meaning and a 10× scale difference, and this
feature reads BOTH — one live, one held. A swap renders `2:11.8` as
`21:58.0` or `0:13.1`, and only a test that knows the difference will catch
it.

Secondary hazard, SECONDARY (measured in this repo, not vendor-documented):
`pm5-interface-notes.md` records a `0x0033` checkpoint reading zero through
interval indices 0-1 and lagging a boundary. **A zero average is treated as
absent, never displayed.**

## The two numbers

### 1. Total meters (whole session)

- **Value:** `totalWorkDistanceMeters` (`0x0031`) + `restDistanceMeters`
  (`0x0032`). Both are the machine's own live cumulative counters. **We do
  not accumulate, and we do not sum boundary records** — that is what the
  summary screen does (`summaryModel.ts:326-340`, Σ over interval actuals),
  and re-deriving a live number that way is the Sun-fret failure mode.
- **Format:** thousands separator, `m` suffix — `3,842m`.
- **Placement:** right end of the session progress-bar row, bar flexes,
  counter is `flex: none` (handoff §2). Both orientations.
- **Present in every phase**, including rest and the pre-first-stroke
  frame, where it reads `0m`.
- **Absent** when either source frame has never arrived: render nothing
  rather than a partial sum. A number that silently omits rest meters is
  worse than no number.

### 2. Average split (current interval)

- **While a WORK interval runs:** `splitAvgPace` (`0x0033`, ÷100).
- **From the interval's end through the rest:** the just-finished
  interval's own average from the boundary record (`0x0038`, ÷10), held
  until the next work interval starts. **James's ruling, departing from the
  handoff, which blanks AVG during rest:** the rest is when the rower asks
  "how did that one go", and it is the only moment they are not pulling.
- **Reset:** at each work interval start.
- **Placement:** the target baseline row under the split hero, extended to
  `TGT 2:13.0 · AVG 2:11.8` (handoff §1 geometry).

## States (each row is a real frame, not a hypothetical)

| Frame | TGT | AVG |
| --- | --- | --- |
| Work interval, split target, average reported | target value | live average, judged |
| Work interval, average absent or zero | target value | nothing |
| Work interval, effort target (no split) | the effort word | live average, plain ink |
| Rest, after a completed work interval | the next interval's target | the finished interval's average, held |
| Rest, before any completed work interval | as today | nothing |
| Warm-up | as today (`Easy`) | live average, plain ink — a warm-up has no pace to judge, and judging it would contradict the standing rule that the rower must see a warm-up is not a working interval |
| Free piece, no split target | nothing | live average, plain ink |
| Stale / disconnected | as today | the last value, subject to the same staleness treatment the rest of the pane already uses |

## The judgement

Three states, and the framing matters because the summary screen ships two:

- The summary judges a **finished** row against the session average, where
  "even" does not exist — a row is a deviation of some size
  (`summaryModel.ts:208-224`, pinned by its own test). **That rule does not
  change.** Changing it would be a triad change to shipped semantics and
  does not belong here.
- The live average judges a **moving** number against a fixed target, where
  sitting on target is the state the rower is trying to achieve.
  `0x0033` updates ~2 Hz, so a two-bucket rule repaints the successful
  state up to twice a second. The dead band exists for that reason.

So: **faster** (blue) / **slower** (red) / **on target** (ink), where on
target is `|avg − target| <= ON_TARGET_BAND_SECONDS`, a named exported
constant initialised to **0.5** s/500m. The band is an empirical guess and
the walk is asked to judge it (below). Direction reuses the house rule's
sign convention; only the neutral state is new, and it is reachable only by
a live number.

Colours come from existing tokens; this spec introduces no new colour.

## Blast radius

- `domain/monitor/` — no new parsing. `restDistanceMeters` and
  `splitAvgPace` already exist; `splitIntervalAvgPace` already exists.
- The driver/session seam must carry three values it does not carry today:
  the two distance counters and the live average, plus the finished
  interval's average at a boundary. Name them so the SCALE is unambiguous
  at the type level, not just at the parse site.
- `workout/connected/surfaceModel.ts` — the AVG cell, the held-average
  state machine, the judgement.
- `PaneLive.tsx` + `index.css` — the extended baseline row; the
  progress-bar row gains a counter.
- Fixtures, e2e exact strings, screenshots.
- The connected screenshots and the six frozen `connected-*.html` fixtures
  will move.

## Exit criteria (each can fail)

1. **The live total equals the summary's DISTANCE for the same session**,
   verified on hardware at the end of a real piece. If they disagree, that
   is a defect in one of them and this ships only once we know which.
2. **The live total equals the monitor's own number**, photographed in one
   frame with the phone — the Sun-fret protocol, and the only check that
   does not grade us against ourselves. Both mid-work and mid-rest, because
   the two sources diverge exactly where rest meters land.
3. **A scale swap is caught by a test.** Feeding a `0x0038` average through
   the `0x0033` path (or the reverse) must fail a named test, not merely
   look wrong to a reader.
4. **A zero or absent average renders nothing**, proven against a replay of
   a committed capture that contains the early-interval zero.
5. **The held average holds** across the whole rest and clears at the next
   work start, proven by replay rather than by construction.
6. Full gates green; per-file coverage at the bar; screenshots re-captured
   and eyeballed with real data.

## What the walk must answer

1. **Does the PM5's "split" equal our interval?** If a programmed interval
   is not the PM's split, `splitAvgPace` is the average of something else,
   and the whole AVG cell is mislabelled. Photograph the monitor's own
   average beside ours, mid-interval.
2. **Both totals in one frame**, mid-work and mid-rest (criterion 2).
3. **Does ±0.5 s/500m feel right** as the on-target band, or does the
   number sit in ink when it should be moving?
4. **Riding along, unrelated to this feature:** a *shallow* off-horizontal
   drag starting inside the grid rows, on a `VITE_ENABLE_FAKE_MONITOR=1`
   build so the console records a `pointercancel` if one fires. This
   settles whether Phase CS's diagonal-drag case is WebKit's arbitration or
   our own 45° dominance rule — the question the exit pass left open.

## Honest limits

- The held average depends on a boundary record arriving. An interval that
  produces no boundary leaves the previous value on screen through the
  rest; the spec accepts that over blanking, but the antagonist should
  attack it.
- `restDistanceMeters` is a `0x0032` field this app has never displayed. It
  is parsed and typed, but "parsed" is not "trusted" — criterion 2 is what
  makes it trustworthy.
- Nothing here improves the summary screen's own accumulation, which
  remains a Σ over boundary records with the known zero-frame gap recorded
  in its own type comment.
