# Connected metrics: the interval average, and total meters back on the bar

**Date:** 2026-08-18 · **Status:** REVISED after the antagonist's full pass
BLOCKED the first draft. Both numbers changed source; one invented mechanism
was deleted as impossible; one product decision is open and marked. ·
**Phase code CM.**

## What and why

Testers asked for two numbers back on the connected screen: how far they
have gone this session, and how the interval they are in is averaging. The
first is a number the rower can see on the monitor and wants on the phone;
the second is the one thing the LIVE pane never told them — it shows the
split *right now*, which jumps every stroke, and the split they were
*asked* for, but nothing saying whether the interval as a whole is on pace
while there is still time to fix it.

**What the first draft got wrong, and why it matters more than the fix.**
The draft said both numbers would be read straight off the wire and never
computed by us, citing the 2026-08-13 Sun-fret incident (this app showed
16938 m against the monitor's 4384 m). That principle was right and the
implementation of it was wrong in a way that would have reproduced the
incident. Decoding 2,363 raw frames from our own committed captures:

- **`Total Work Distance` (`0x0031`) already includes rest meters.** Final
  TWD on `walk-2026-08-16/session-2-wu-4unequal.jsonl` is **1599**, and
  Σ interval distance (1535) + Σ interval rest distance (64) = **1599**,
  exactly. The draft's `TWD + restDistance` sum double-counts the current
  rest — measured overshoot **+30 m**.
- **TWD is not a live counter.** It is a step function, frozen for the whole
  work interval, advancing only at boundaries and during rests — 62 changes
  across 983 frames. Mid-interval the draft's number would read **360 m
  where the machine has 809 m**; worst measured understatement **449 m**.

So "read the machine's field" is not automatically safer than computing.
**The real principle is narrower and is what this spec now enforces: our
number must never drift from the machine's without something noticing.**

Mockups: `4a-meters-on-bar.png` and `README-4a-amendments.md`. This spec
follows them except where James's rulings or the wire overrule them, and
each departure is named.

## Research pass

### Fields, and what they actually do

| Field | Where | Scale | Behaviour (SECONDARY: measured across 5 committed captures) |
| --- | --- | --- | --- |
| `totalWorkDistanceMeters` | `0x0031` b11-13 | whole m | **Includes rest meters. Frozen during work**, steps at boundaries and ticks during rests. Non-monotone once observed (250→500→250 in `step-2`). |
| `restDistanceMeters` | `0x0032` b11-12 | whole m | Per-rest, resets at each work start; lags ~3 frames at the transition. |
| `splitAvgPace` | `0x0033` b8-9 | 0.01 s/lsb | The programmed interval's own average, live. Resets at work-interval start; reads `0` at workout start and on the first frame of each interval. **Holds flat through the whole rest**, agreeing with the boundary record to ≤0.2 s across all five recorded rests. |
| `splitIntervalAvgPace` | `0x0038` b6-7 | 0.1 s/lsb | The finished interval's average — but the record carries that interval's rest time and distance, so **it cannot arrive until the rest is over**. |

PRIMARY for every offset and scale: C2 BLE spec via
`docs/monitor/pm5-interface-notes.md`. The 10× scale difference is real and
already handled at the parse site (`parse.ts:200` ÷100, `:274` ÷10);
confirmed at nine committed boundaries, where `0x0038` raw ÷10 reproduces
`500 × splitTime / splitDistance` exactly.

### Does the underlying system have these concepts?

Yes — but not in the shape the handoff assumed. There is no single "total
meters" field: work and rest distance are separate everywhere they appear.
And "the finished interval's average, during the rest" is a thing the
machine already does for us in `0x0033`, which is why this spec no longer
builds it.

## The two numbers

### 1. Total meters (whole session)

- **Value:** `MonitorFrame.sessionDistanceMeters` — the driver's Σ over its
  max-merge register map (`driver.ts:2002-2005`). Live every frame, work +
  rest by construction, hardened across Phase CR2, and its only consumer
  (`TOTAL M`) was cut three days ago, so this restores a render site rather
  than inventing one.
- **Why ours and not the machine's, given Sun fret:** because the machine's
  own TWD is unusable live (frozen mid-interval, includes rest, observed
  non-monotone), and because the drift protection is not the source of the
  number — it is `recordTwdVerdict` (`driver.ts:2518-2543`), which already
  compares our accumulator against TWD **every frame** and logs divergence.
  Sun fret happened because nothing compared. Something compares now.
- **Meaning:** work + rest — James's ruling, and identical to what TWD
  itself means, so the live number, the summary's DISTANCE and the
  monitor's own total are all the same quantity.
- **Format:** `3,842m`. **Placement:** right end of the progress-bar row,
  bar flexes, counter `flex: none` (handoff §2), both orientations.
- **Absent** until the first frame arrives; `0m` thereafter.

### 2. Average split (current interval)

- **Value:** `splitAvgPace` (`0x0033`), read continuously. Nothing else.
- **This single field satisfies James's holding ruling by itself:** it
  already holds the finished interval's average flat through the entire
  rest and resets at the next work start. The draft's held-average state
  machine — snapshot the boundary record, hold it through the rest — is
  **deleted**: the record it depended on does not arrive until the rest has
  ended, so through the rest the newest record is the *previous*
  interval's. On `session-2` that renders the warm-up's **2:28.5** where
  interval 2 averaged **2:11.0**: not a stale number, a wrong one, on every
  rest-bearing program.
- **Zero is absent, never displayed** — the wire genuinely reads `0.00` at
  workout start and on each interval's first frame.
- **Placement:** the target baseline row, `TGT 2:13.0 · AVG 2:11.8`
  (handoff §1 geometry).

## States

| Frame | TGT | AVG |
| --- | --- | --- |
| Work, split target, average > 0 | this interval's target | live average, **plain ink, unjudged** |
| Work, average absent or zero | this interval's target | nothing |
| Work, effort target (no split) | effort word | live average, plain ink |
| Rest, after a completed work interval | **the FINISHED interval's target** | that interval's average, held by the machine, **judged** |
| Rest, before any work interval completes | as today | nothing |
| Warm-up | as today (`Easy`) | live average, plain ink — never judged, per the standing rule that a warm-up must not read as a working interval |
| Free piece, no split target | nothing | live average, plain ink |
| Stale / disconnected | as today | last value, under the pane's existing staleness treatment |

## The judgement — SETTLED: suppressed while rowing, shown at rest

**Why it cannot be live.** Measured across seven work runs, the interval
average does not come within ±0.5 s of its own final value until **65-99%
of the interval has elapsed** (median ~80%): the standing start dominates
the running average. A judged cell would read SLOWER for most of every
interval no matter how well the rower is pulling, and only become truthful
when there is least time left to act. No value of the band fixes a
transient.

**James's ruling (2026-08-18):** show the average unjudged while the
interval runs, and judge it only during the rest, when it is final.

- **While rowing:** `AVG 2:11.8` in plain ink. Informational, climbing, no
  colour, no verdict.
- **At rest:** the finished interval's average, now settled, judged
  faster / slower / on target against **that interval's** target, using
  `ON_TARGET_BAND_SECONDS` (0.5 s/500m, a named constant).

**Consequence this spec accepts, and states rather than discovers:** during
a rest the baseline row is entirely about the interval that just finished,
so `TGT` shows **that** interval's target, not the next one's. Pairing a
verdict with the next interval's target would read as a judgement against a
number the rower never rowed. The next interval's target is not lost — the
footer's NEXT line has named it since #116 (`NEXT · WORK 2000m · 2:06.0
@22`), which is what makes this affordable.

Direction reuses the house rule (`summaryModel.ts:208-224`, unchanged and
still two-bucket for finished rows); the on-target state is new and, by
this ruling, only ever reached at rest.

## Blast radius

- `domain/monitor/` — no new parsing.
- The session seam must expose `splitAvgPace`; `sessionDistanceMeters`
  already exists on `MonitorFrame`.
- `workout/connected/surfaceModel.ts`, `PaneLive.tsx`, `index.css`.
- **`monitor/transports/fake.ts` — mandatory, not optional.** It zero-fills
  `splitAvgPace` (`:672`) and `restDistanceMeters` (`:690`), and models TWD
  as the current interval's distance (`:592-630`), which the captures
  contradict. Until the fake emits realistic values, **every** fake-driven
  gate — e2e, the frozen `connected-*.html` fixtures, screenshots,
  `VITE_ENABLE_FAKE_MONITOR=1` — is structurally blind to both new numbers:
  the AVG cell renders nothing and the total adds zero.
- Fixtures, e2e exact strings, screenshots.

## Exit criteria (each can fail)

1. **Replay-based, mid-session:** replaying
   `walk-2026-08-16/session-2-wu-4unequal.jsonl`, the displayed total equals
   the machine's own session meters **at sampled instants mid-work and
   mid-rest**, not merely at the end. The first draft's end-of-session
   equality could not fail — at the terminal frame every candidate
   implementation, correct or double-counting or frozen, agrees.
2. **Hardware, one frame:** phone and monitor photographed together,
   mid-work and mid-rest. The only check that does not grade us against
   ourselves.
3. **The AVG shown during a rest equals the interval that just finished**,
   by value, against the replay's own boundary record (±0.2 s). Phrased as a
   value check because "the number holds constant" is true of the broken
   implementation too.
4. **A zero average renders nothing** — provable today: `session-2` carries
   34 zero frames, the first twelve consecutive.
5. **The fake emits both numbers plausibly**, so the visual gates can see
   them; screenshots re-captured and eyeballed with a non-zero AVG and a
   non-zero total.
6. Full gates green; per-file coverage at the bar.

## What the walk must answer

1. **Does an interval longer than any we have captured still make
   `splitAvgPace` our interval's average?** No committed capture holds an
   interval beyond 500 m / 129 s, so the multiple-splits-per-interval case
   is genuinely unsettled.
2. **Both totals in one frame**, mid-work and mid-rest (criterion 2).
3. **Does the judgement rule chosen above behave** on a real standing start?
4. **Riding along, unrelated:** a *shallow* off-horizontal drag starting in
   the grid rows, on a `VITE_ENABLE_FAKE_MONITOR=1` build, to settle whether
   Phase CS's diagonal case was WebKit or our own 45° rule.

## Honest limits

- TWD's freeze-during-work is SECONDARY: five recordings, one PM5, one
  firmware. Every capture agrees and the banked-at-boundary mechanism is
  coherent, but C2's spec says nothing about when the field advances.
- We do not know what the monitor's own screen displays as total meters
  mid-interval; criterion 2's photograph is the only way to find out.
- Nothing here changes the summary screen's accumulation.
- **A rest-free program never shows a verdict.** Judgement lives in the
  rest, so an `r0` interval program or a continuous piece gets the average
  but never the colour. Accepted: the post-workout summary is where those
  sessions read their verdict, and inventing a boundary-flash window to
  cover them would put a judgement on screen at the one moment the rower is
  starting the next effort.
