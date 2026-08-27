# Phase RC close-out: the derivation audit

**Asked for by James, 2026-08-25.** Enumerate every CONSUMER-SIDE derivation
of a wire fact the driver already resolves, classify each
consume-the-authority vs invented-heuristic, and queue fixes for the
heuristics.

**Why:** the series-truth defect was the THIRD of its class here — the
recorder's key derivation, Phase LL's boundary fold, and the CM-era boundary
heuristic. Each time a consumer re-derived something the driver had already
resolved, and the two could disagree.

Run 2026-08-27 by three independent readers over ~7,000 lines. Their full
tables sit beside this file:
`2026-08-27-derivations-useMonitorSession.md`, `-surfaceModel.md`,
`-storage.md`.

## The answer to the question that was asked

**The series-truth class does NOT recur for interval membership, rest state,
or totals.** Every actual is filed under the driver's `toProgramIndex`-
normalised index; rest state is read from `frame.state`, never inferred. The
thing this audit existed to find is not there.

**What is there is a different class, and it is worse.** The dangerous
derivations are not about which interval a number belongs to. They are about
**link and lifecycle state** — and unlike a membership error, several of them
write a stored record or send a command to the erg.

## Totals

| | invented-heuristic | re-derived | consumes-authority | not-a-derivation |
| --- | --- | --- | --- | --- |
| `useMonitorSession.ts` | 13 | 7 | 13 | 7 |
| `surfaceModel.ts` + panes | 17 | 8 | 22 | 18 |
| storage group | 10 | 3 | 8 | 7 |
| **total (133 sites)** | **40** | **18** | **43** | **32** |

`PaneGrid.tsx` derives nothing. `PaneLive.tsx` derives one thing.
`Timer.tsx` consumes **zero** monitor frames — the brief said otherwise and
was wrong.

**An invented heuristic is not automatically a defect.** Where the wire
carries no such fact, inventing one is the only option;
`PAUSED_FRAME_HOLD` / `PULL_EVIDENCE_FRAMES` are the clean example — the PM5
has no paused state at all (`types.ts:181`), and they are cosmetic by
construction because `phase` never leaves `"live"`. The findings below are
the ones that DUPLICATE an authority, or that decide something durable on a
threshold nobody has pinned in the failing direction.

## The findings, ranked by what a disagreement costs

### 1. A 2.5 s banner threshold writes a stored field and suppresses a wire command

`useMonitorSession.ts:3145` — `linkGone = phase === "disconnected" || frameSilence`.
It writes `endedBy: "link-lost"` AND `:3155` skips `driver.terminate()`. So a
false latch stores a lie **and leaves the PM5 running the piece**.

The false positive is measured, not hypothetical: nine banners in 288 s over
a link that never dropped (`docs/monitor/sessions/walk-2026-08-26/`). Phase
LM fixed the LIFECYCLE producer of that silence; **the watchdog producer is
untouched**, and no test pins the false-positive direction.

### 2. Teardown can terminate a live piece

`useMonitorSession.ts:2513-2522` sends TERMINATE keyed on our DERIVED
`phase === "ready"`, not on `frame.state`. While that gate lags — a stuck
Inactive byte, up to ~5 s at the 1 Hz capture cadence — any unmount kills the
rower's piece on the erg. No test covers the lagging-gate case.

This is the only finding in the audit that reaches out and changes the
machine.

### 3. RC-28 is real, and far wider than the r0 case it was filed as

`surfaceModel.ts:253` + `:893` + `:962`, `PaneLive.tsx:151`. When the wire
says `resting` but no rest phase exists, everything falls through to the WORK
phase and the hero paints a coasting flywheel's split with a verdict colour
against the work target.

**RC-28 was filed as a zero-rest-interval edge case. It is not.** Because
`WORKOUTSTATE` 8/9 map to `"rowing"` and 6/7 to `"resting"`
(`parse.ts:517-532`), the same fallthrough fires for a tick at **every
boundary**, on every interval, of every rest-bearing program. Pinned only as
intended behaviour (`surfaceModel.test.ts:309`); no test asserts the colour.

### 4. F2b's clean sweep is vacuous

`continuity.ts` — the F2b count bound writes `completedAt` +
`endedBy: "link-lost"` and seals the record. Its clean sweep **excludes all
six committed captures, so zero pairs were compared** (`continuity.test.ts:974`).
The gate reports clean because it never ran.

**This is recurring failure #21's third instance in two days**, after RC-24's
two. The pattern is now established well enough to be worth stating as a
rule: this repo produces inert gates at a rate that ordinary review does not
catch.

### 5. The grid's rest countdown ignores a lost link — a defect shipped yesterday

`surfaceModel.ts:1526` — `restingNow = !armed && resting && restSeconds > 0`.
No `!stale` term, and `buildGridModel` takes no `stale` parameter (its
comment "nothing in this function needs to know" predates RC-24 handing it
two raw frame fields).

So a link lost mid-rest leaves pane C sunken and gold with a **frozen**
`R 0:42`, while pane B correctly reverts to `LAST SEEN`. The hero's own guard
(`:962`) has `!stale` and its comment explains exactly why: *"a countdown
frozen at its last value is a false claim of motion, which is the whole
defect class this fixes."*

**RC-24 and RC-27 are the same change on two surfaces, and only one got the
guard.** The controller wrote that reasoning into RC-27's comment a day after
shipping RC-24 without it, and neither review caught the asymmetry. The
lost-link test at `:917` asserts only the hero.

### 6. `acceptableFinalBoundary` re-derives the driver's own vouch

`monitorRun.ts:618-627` recomputes `finalBoundary` from
`index === intervals.length - 1`. A wrong refusal **drops the final
interval's actual forever**, short-summing all four RC-1 fields and rendering
`N-1 OF N INTERVALS MEASURED`. No test drives a flagged final boundary with
`index: null` through it.

### 7. The series recorder's absent-key arm rests on a false premise

`seriesRecorder.ts:333-358` assumes `attributedIntervalIndex` is present.
`driver.ts:2175-2229` leaves it undefined on `terminated`/`idle`/`armed`, and
a terminated frame DOES reach `onFrame` (`useMonitorSession.ts:1987`) before
terminal handling. Damage is bounded today only by accident — max-merge and a
bucket drop.

Same file also folds the driver's register map a second time
(`driver.ts:2462-2469` sums it differently) while writing `series[].t/d`,
with no test comparing the two.

### 8. `frame.intervalIndex ?? 0` collapses a deliberate null

`surfaceModel.ts:860`. The driver's `null` also means "a real interval is
current but diverged"; `?? 0` turns that into interval 0, so the surface says
`1 OF 4`, marks grid row 1 active, and shows row 1's targets — silently. Two
consumers already opted out individually after measured defects (`:1038`,
`:1159`); the source was never fixed.

## Also flagged, unpinned, lower cost

- `countdownDisplayFor`'s kind-mismatch fallback to the full programmed value
  (`surfaceModel.ts:1672`).
- `phaseSeconds(...) ?? 0` prices unpriced phases at zero in BOTH numerator
  and denominator, while `hasRemainingEstimate` is an ANY rather than an ALL
  — so the progress bar and EST LEFT stay on screen built partly on zeros.
- Nothing asserts `FINISH_HANDOFF_HOLD_MS > FINISH_GRACE_MS` despite the
  comment requiring it. Cheapest missing gate in the audit.

## Open questions, recorded rather than guessed

1. Does any upstream layer resolve "degraded but not dropped"? If one does,
   findings 1 and 2 reclassify.
2. Is `resting && restSeconds > 0 && !isRestPhase` reachable in practice?
3. Is the meters counter's work+rest quantity the one intended?
4. `attributedIntervalIndex` appears unread by one consumer that looks like it
   should read it.

## The model to copy

`decideResumeLatch` (`useMonitorSession.ts`). Measured constant, both boundary
sides pinned, and it **defers to `snapshot.silent` when the watchdog has
already spoken** rather than forming a second opinion. Every finding above is
a place that does the opposite.
