# Derivation audit — `app/src/workout/connected/surfaceModel.ts` (+ render consumers)

Scope: `surfaceModel.ts` (1818 lines) audited completely. `PaneLive.tsx`,
`PaneGrid.tsx`, `ConnectedSurface.tsx` audited only for derivations they perform
themselves rather than read off the model.

Read-only pass. Nothing edited, committed or branched.

Authority baseline established from `app/domain/monitor/types.ts:30-240`,
`app/domain/monitor/pm5/parse.ts`, `app/domain/monitor/pm5/intervalIndex.ts`
and `app/src/monitor/driver.ts`. The load-bearing wire facts this audit leans on:

- `MonitorFrame.state` (`types.ts:177`) is the ONLY frame field that can say a
  rest is running. Decoded from 0x0031 offset 8 through `WORKOUTSTATE_TO_STATE`
  (`parse.ts:517-532`). **WORKOUTSTATE 8/9 (work→rest transition) map to
  `"rowing"`; 6/7 (rest→work transition) map to `"resting"`.** So `state` both
  LAGS the entry to a rest and OVERHANGS its exit, by an ephemeral tick each.
- `frame.intervalIndex` is `toProgramIndex`'s output, written over the raw value
  in `maybeEmitFrame` (`driver.ts:2107-2113`, `2425-2453`). It maps a resting
  tick back one (`machineIndex - 1`), clamps one step outside either end, and
  returns **`null`** for any state outside rowing/resting, for `programLength <= 0`,
  and for a machine index more than one step outside the program (the D3
  divergence, which the driver logs).
- **There is no boundary flag on the frame.** Boundaries are an asynchronous
  EVENT (`intervalComplete`, `driver.ts:4454-4458`); nothing on a frame says
  "this is the last frame of interval N".
- The driver's only totals, `sessionElapsedSeconds`/`sessionDistanceMeters`
  (`driver.ts:2454-2470`), are the session register map summed. Each entry is
  an interval's own 0x0031 pair, which **spans work PLUS trailing rest**. They
  cannot be split into work vs rest.
- **Rest DISTANCE never reaches a consumer.** 0x0032 offset 11
  `restDistanceMeters` is parsed (`parse.ts:168`) and dropped by
  `toMonitorFrame`. 0x003A's total is a log verdict only. So no consumer can
  render it, and no derivation in this file could have consumed it.
- `frame.restSeconds` (0x0032 offsets 13-15) is a live countdown, passed
  through untouched, **unspecified outside a rest** (measured: reads the
  interval's programmed rest all through work, `0.00` on a zero-rest interval).

---

## Counts

| Class | Count |
|---|---|
| INVENTED-HEURISTIC | 17 |
| RE-DERIVED | 8 |
| CONSUMES-AUTHORITY | 22 |
| NOT-A-DERIVATION | 18 |

---

## INVENTED-HEURISTIC — the findings

### IH-1. `midSessionMirror` / `MID_SESSION_RESET_METERS = 1`
**file:line** `surfaceModel.ts:737` (constant), `:944-947` (use).
**Signal + constant** `!armedMirror && frame.rowingActive === false && frame.distanceMeters <= 1`.
Class: **boundary**.

**Authority?** *None exists — this is legitimate.* The frame carries no
boundary flag, and the `intervalComplete` event is asynchronous relative to the
frame stream, so a pure per-frame consumer genuinely cannot be told "you are
between pieces". `rowingActive` (0x0031 offset 9) and `distanceMeters` (0x0031
offset 3, per-interval, resets at the boundary) are the only per-frame signals
that speak to it.

**What a rower sees on disagreement** False negative (the counter has not reset
yet but the piece is over): both heroes carry the PREVIOUS piece's ghost split
and rate, and the split is judged against the NEW piece's target — a wrong
NUMBER wearing a wrong COLOUR. False positive (a rower genuinely stalled under
1 m into a piece): both heroes read `0`, unjudged, which is what the machine's
own screen shows there anyway — benign.

**Evidence base is thin but honest** Tuned against three observed values at
this exact boundary (`docs/monitor/sessions/walk-2026-08-15/`: 0, 0.8, 0). The
1 m window sits 0.2 m above the largest observed reading.

**Pinned?** Yes — `surfaceModel.test.ts:501` (the mirror fires on the walk's own
observed frame), `:526` (the guard: advancing distance ends the mirror even with
`rowingActive` still false).

---

### IH-2. `restCountdown`'s `frame.restSeconds > 0` term (the LIVE hero)
**file:line** `surfaceModel.ts:962-965`. Threshold: `> 0`. Class: **rest state**.

**Authority?** *None — legitimate.* The wire has no "is this rest real" flag.
`restSeconds` reading `0.00` is the measured proxy for a zero-rest interval
(recorded at `:1480-1484`).

**What a rower sees on disagreement** No countdown on the split hero, and no
REST label — so the hero falls back to `model.paceWhole`, the coasting
flywheel's split, wearing its judgement class. See **DANGER-1**.

**Pinned?** Yes — `surfaceModel.test.ts:902` ("the zero-rest artifact"), `:881`
(wire fact 2: `restSeconds` alone never says a rest is running).

---

### IH-3. `restingNow`'s `restSeconds > 0` term (the GRID's active row)
**file:line** `surfaceModel.ts:1526`. `!armed && resting && restSeconds > 0`.
Class: **rest state**.

Same threshold as IH-2, **but a different guard set: it has no `!stale` term.**
See **DANGER-2**. Pinned for the zero-rest and armed cases
(`surfaceModel.test.ts:739`, `:749`); NOT pinned for the stale case.

---

### IH-4. `livePace`'s zero-split sentinel
**file:line** `surfaceModel.ts:669`. `frame.currentSplit === 0 ? null : …`.
Class: **judgement** (whether there is a value to judge at all).

**Authority?** *None — legitimate.* `types.ts:77` and `parse.ts:166` document
`currentSplit` as an unconditional pass-through with no invalid sentinel. The
PM reports Current Pace `0` before the first pull and in rests/boundary frames;
we assert `0` means "no reading" on the wire's behalf.

**What a rower sees on disagreement** Without it, `0:00.0` painted in the
faster-than-target colour at a rower who has not pulled (observed on hardware
walk 2). With it, a dash.

**Pinned?** Yes — `surfaceModel.test.ts:2178`.

---

### IH-5. `PACE_HERO_CAP_SECONDS = 599.9`
**file:line** `surfaceModel.ts:719` (constant), `:968-969` (use).
Class: **judgement**.

**Authority?** *None, and none is possible* — this is a LAYOUT constraint (the
hero has no width bound), not a wire fact.

**What a rower sees on disagreement** A genuinely slow split (slower than
9:59.9/500m — reachable on the first stroke of a piece or during a very light
drill) renders as `—`, unjudged, rather than as a number. Deliberately leaks
into pane C's `/500M` cell too (`:708-718`) so the two panes cannot disagree.

**Pinned?** Yes — `surfaceModel.test.ts:1504`.

---

### IH-6. `paceActual`'s armed target-preview substitution
**file:line** `surfaceModel.ts:979-983`. `mirrored ? (armedMirror ? targetSplitSeconds : 0) : cappedPace`.
Class: **judgement** (it fabricates the ACTUAL slot's value).

**Authority?** N/A — this is a designed substitution, not a claim about the
wire. The judging target is forced `null` alongside it (`:984`), deliberately
rather than relying on the diff happening to be zero.

**What a rower sees on disagreement** At armed the split hero shows a number
nobody has rowed. It is ghosted (`connected-hero-ghost`, ink-4) to say so.
**Known hole, disclosed in `PaneLive.tsx:73-79`:** since Phase LM let `armed`
and `stale` coexist, the ghost class wins on source order over
`.timer-card-actual-stale`, so an armed-and-unheard surface paints a target
preview at full ghost ink rather than greying with everything else.

**Pinned?** Yes — `surfaceModel.test.ts:465`, `:1003`; `PaneLive.test.tsx:637`.

---

### IH-7. `avgActual`'s zero sentinel
**file:line** `surfaceModel.ts:1054`. `rawAvg === 0 → null`. Class: **judgement**.

**Authority?** *None — legitimate.* `types.ts:89-118` documents `splitAvgPace`
as an unconditional pass-through. `0` is the wire's "no sample yet" reading and
we assert that meaning.

**What a rower sees** Nothing at all where the AVG cell would be (the design's
"nothing, never a dash"). **Pinned?** Yes — `surfaceModel.test.ts:1735`.

---

### IH-8. `estElapsed`'s monotonic clamp
**file:line** `surfaceModel.ts:1182`. `Math.max(estElapsedRaw, input.previousElapsedSeconds ?? 0)`.
Class: **totals**.

**Authority?** *None — the wire offers no monotonic guarantee,* and the driver
does not clamp on the surface's behalf. But note what this clamp MASKS: three
named wire causes, each measured (`:1172-1181`) — the finished-frame collapse
(−428.5 s), a work→work boundary race where 0x0031's counters reset one
notification before 0x0033's Interval Count (−29.25 s), and a mid-rest elapsed
re-base (−5.97 s). The clamp suppresses all three without diagnosing any.

**What a rower sees on disagreement** EST LEFT freezes rather than jumping
backward. A real backward jump — which would be evidence of a genuine machine
reset — is hidden rather than reported. Also: the memory comes from the
CALLER's `useState` (`ConnectedSurface.tsx:351`), so a caller that omits
`previousElapsedSeconds` silently gets an unclamped estimate; the field is
optional (`:365`).

**Pinned?** Yes, heavily — `surfaceModel.test.ts:3102`, `:3112` (replayed
frame-by-frame over a whole real capture, including the finished frame),
`:3505` (a distance capture).

---

### IH-9. `totalLeftSeconds`'s zero floor
**file:line** `surfaceModel.ts:1193`. `Math.max(0, totalSeconds - estElapsed)`.
Class: **totals**.

**Authority?** N/A — a display floor. **What a rower sees** `0:00 LEFT` in the
band and (grid pane) in the gold header countdown, while they are still rowing,
whenever the session overruns its programmed length. **Pinned?**
`surfaceModel.test.ts:1684`.

---

### IH-10. `elapsedSeconds`'s 100% cap
**file:line** `surfaceModel.ts:1201`. `Math.min(estElapsed, totalSeconds)`.
Class: **totals**.

**Authority?** N/A — load-bearing so `ConnectedProgressBar`'s fill cannot
exceed 100%. **What a rower sees** A bar pinned at full while pieces remain.
**Pinned?** `surfaceModel.test.ts:1389`.

---

### IH-11. The interval clamp's `?? 0` laundering
**file:line** `surfaceModel.ts:860-864`.
`const rawIndex = frame.intervalIndex ?? 0` then
`Math.min(Math.max(rawIndex, 0), Math.max(intervals - 1, 0))`.
Class: **interval membership**. See **DANGER-3**.

**Authority?** *Yes, and it is being discarded.* `frame.intervalIndex === null`
is a deliberate business rule with two distinct meanings
(`types.ts:143-155`): (a) armed/idle/finished/terminated, and (b) **a real
interval IS current but the machine's value cannot be explained by the
program** — the D3 divergence, which `driver.ts` logs as `"divergence"`. This
line collapses both to "interval 0".

The `Math.min`/`Math.max` clamp itself is dead by construction —
`toProgramIndex` already range-checks and clamps one layer down
(`intervalIndex.ts:190-196`), which the file's own comment at `:258-261`
acknowledges ("this is defence, not an expected path"). The `?? 0` is the live
part.

**What a rower sees on disagreement** On a divergence frame the whole surface
names interval 1: the header reads `1 OF 4`, the grid marks row 1 active and
counts down interval 1's programmed dimension, the split and rate targets are
interval 1's, and `upNext` names interval 1's successor. No banner, no
indication. Every one of those is wrong if the rower is on interval 3.

**Two consumers already refuse it, each after a measured defect** — `avg`
(`:1038-1043`, "laundering it to 0 would pair AVG with interval 0's referent")
and `estElapsed` (`:1159-1160`, a captured `finished` frame collapsed phase
index 7 to 0 for a measured −428.5 s jump). The pattern is that the laundering
has bitten twice and was patched per-consumer rather than at the source.

**Pinned?** Yes, but pinned as INTENDED — `surfaceModel.test.ts:2296` ("treats
a null interval index as the first, never as a crash") and `:2288` (the
past-the-program clamp). Nothing pins the divergence case as a defect.

---

### IH-12. `phaseIndexForInterval`'s past-the-end pin
**file:line** `surfaceModel.ts:261`. `return Math.max(0, phases.length - 1)`.
Class: **interval membership**.

**Authority?** Partly — `toProgramIndex` already clamps one step past the end
to `programLength - 1`, so this fires only for a program/phases mismatch. Same
silent-fallthrough shape as DANGER-1: when the phase it wants does not exist,
it falls through to a NEIGHBOURING one.

**What a rower sees** The final interval's target, label and up-next line for a
machine that ran past the program. **Pinned?** `surfaceModel.test.ts:299`.

---

### IH-13. `countdownDisplayFor`'s kind-mismatch fallback
**file:line** `surfaceModel.ts:1667-1678`.
`remaining !== null && remaining.kind === interval.kind ? remaining.value : interval.value`.
Class: **boundaries/totals** (the active row's countdown).

**Authority?** *Yes — `frame.intervalRemaining` is driver-computed
(`driver.ts:316-322`) and carries its own `kind`.* A kind mismatch means the
driver's armed program and the `ProgramInterval` this row was built from
disagree about the interval's dimension. The fallback discards the driver's
number and shows the PROGRAMMED full value instead.

**What a rower sees on disagreement** The active row's countdown standing
still at the full programmed value — a wrong NUMBER claiming no progress —
in whichever cell the countdown mark is on. Silent: nothing distinguishes it
from a genuinely un-started piece.

**Pinned?** **None.** The only test touching this path uses `remaining: null`
(`PaneGrid.test.tsx:1101`); no test constructs a kind mismatch. Its sibling
`accruedDisplayFor` (`:1690-1699`) takes the honest DASH on the same condition,
so the two treat the same disagreement differently and only the safe one is
untested-but-harmless.

---

### IH-14. `kindWord`'s `"WORK"` default
**file:line** `surfaceModel.ts:1205`. `phase ? phaseKindWord(phase.type) : "WORK"`.
Class: **interval membership** (the caption's word).

**Authority?** None — with no phase there is no kind. **What a rower sees** The
caption asserts `WORK` on a surface with no phase at all (empty program only).
**Pinned?** `surfaceModel.test.ts:2312`.

---

### IH-15. `NO_FRAME.intervalIndex = 0`
**file:line** `surfaceModel.ts:304-319`, specifically `:315`.
Class: **interval membership**.

**Authority?** *Yes, and this fixture contradicts it.* A real driver frame in
this state (`state: "armed"`) would carry `intervalIndex: null` —
`toProgramIndex` returns `null` for any state outside rowing/resting
(`intervalIndex.ts:183`). The fixture asserts `0`.

**What a rower sees** Nothing today: `splitAvgPace` is `null` and
`elapsedSeconds`/`restSeconds` are `0`, so both consumers that branch on the
raw null (`avgAbsentByReferent`, `estElapsedRaw`) reach the same answer either
way. It is a latent trap: a future consumer that branches on
`frame.intervalIndex === null` to mean "no interval" gets a different answer
from `NO_FRAME` than from the driver's real armed frame.

**Pinned?** `surfaceModel.test.ts:2272` renders the no-frame case but asserts
nothing about the index.

---

### IH-16. `phaseSeconds(...) ?? 0` in the completed-phase sum
**file:line** `surfaceModel.ts:1165` (and its twin in
`session/Timer.tsx:213`'s `totalSessionSecondsOf`, which `:1125` calls).
Class: **totals**.

**Authority?** N/A — `phaseSeconds` returns `null` for a genuinely unpriceable
phase (`domain/expand.ts:96-104`: no `seconds`, and no `meters`+`targetSplit`
pair). Both the numerator and the denominator silently treat that as **zero
seconds**.

**What a rower sees** Because both sides drop it, EST LEFT stays internally
consistent — but the whole session is priced SHORT by the real duration of
every unpriceable phase. The bar reaches 100% early and EST LEFT reads `0:00`
(floored by IH-9) with real pieces left.

**The guard does not catch the mixed case.** `hasRemainingEstimate`
(`session/Timer.tsx:158-166`) is an **ANY** over forward phases: a single
priced phase anywhere ahead returns `true`, so `PaneLive` keeps the bar and the
EST LEFT cell on screen (`PaneLive.tsx:184`, `:360`) and `headerTrailing` keeps
the gold countdown (`ConnectedSurface.tsx:155`). The guard only fires when
EVERY forward phase is unpriced.

**Pinned?** Only the all-unpriced case (`PaneLive.test.tsx:373-401`) and the
boundaries analogue (`surfaceModel.test.ts:2621`). **No test mixes a priced and
an unpriced phase in one session**, which is the case the guard misses.

---

### IH-17. `livePace`/`liveRate`'s paused-vs-lost precedence
**file:line** `surfaceModel.ts:668`, `:693`. `if (status === "paused" && !linkLost) return null;`
Class: **judgement**.

**Authority?** The `paused` axis is the CALLER's, from
`useMonitorSession`'s freeze predicate ("distance/split/rate unchanged across N
frames"). Worth naming per CLAUDE.md's own standing note: **the PM5 has no
paused state** (`types.ts:177`'s union has no such member) — this is a state we
assert on the machine's behalf. The precedence written here is a genuine
invention: which of two independently-true facts wins.

**What a rower sees** With the link down over a frozen erg, the pane keeps the
last reading greyed rather than blanking it to the paused dash.
**Pinned?** `surfaceModel.test.ts:1112`, `:1124`.

---

## RE-DERIVED

### RD-1. `phaseIndexForInterval`'s non-rest walk
**file:line** `surfaceModel.ts:243-262`. Class: **interval membership**.

Walks `phases[]` skipping `type === "rest"` to find the `intervalIndex`-th
non-rest phase — the declared inverse of `compileProgram`'s rest-folding
(`domain/monitor/program.ts:270-278`).

**What the driver/compiler already answers** `compileProgram` performed the
fold and knows exactly which phase produced which `ProgramInterval`; it does not
emit that mapping, so this reconstructs it. Two implementations of one
correspondence.

**If they disagree** Any change to which phase kinds become intervals (a new
`Phase["type"]`, a change to the leading-rest rejection, consecutive-rest
summing) moves the compiler without moving this walk, and the surface names the
wrong phase: wrong TGT number, wrong hero colour, wrong up-next line, wrong
AVG referent. Typecheck would not catch it — the walk tests `type === "rest"`
by string, not exhaustively the way `connectedNextText` does (`:218-223`).

**Pinned?** `surfaceModel.test.ts:274-318` (four cases, including the rest fold
and the past-the-end pin) and `:265` (the fixture is the shape claimed).

---

### RD-2. `isRestPhase` as the rest discriminant
**file:line** `surfaceModel.ts:893`. `phase?.type === "rest"`. Class: **rest state**.

The file states plainly (`:881-892`) that `isRestPhase`, not the wire's
`resting`, is "the real discriminant". So the surface holds **two answers to
"is a rest running"** — the wire's `state === "resting"` and the program's
`phase.type === "rest"` — and routes different consumers to different ones:

| Consumer | Reads |
|---|---|
| `restCountdown` (LIVE hero, `:962`) | `resting` (wire) |
| `restingNow` (GRID row, `:1526`) | `resting` (wire) |
| `finishedWorkPhase` / `targetSplit` (`:899`, `:1110`) | `isRestPhase` (program) |
| `avgSuppressedByRest` (`:1044`) | `isRestPhase` (program) |
| `estElapsed`'s live term (`:1167`) | `isRestPhase` (program) |

`isRestPhase ⟹ resting` holds one-directionally (the phase can only BE a rest
phase because `phaseIndexForInterval` was told `resting`), so the disagreement
is always `resting && !isRestPhase`. That is **DANGER-1**.

**Pinned?** The r0 direction is pinned as intended behaviour
(`surfaceModel.test.ts:309`), not as a defect.

---

### RD-3. `finishedWorkPhase` and `targetSplitPhase`
**file:line** `surfaceModel.ts:899-902`, `:1110`.
`isRestPhase && phases[phaseIndex - 1]?.type === "work" ? phases[phaseIndex - 1] : undefined`,
then `targetSplitPhase = finishedWorkPhase ?? phase`.
Class: **interval membership** + **judgement referent**.

**Authority?** *Partly — and the driver already has a better answer.*
`toProgramIndex` maps a resting tick to `machineIndex - 1`
(`intervalIndex.ts:186-187`), so `frame.intervalIndex` during a rest ALREADY
names the interval that just finished. This walks one PHASE back instead, which
is the same answer by a different route.

**If they disagree** Both the TGT number the rower reads and the AVG cell's
judging target come from this one lookup. Name the wrong phase and the rower
sees a wrong TARGET NUMBER beside a real average, tinted by comparing the two.

**The `?? phase` fallthrough at `:1110` is the same shape as DANGER-1**: when
the just-finished phase does not exist, TGT silently names the NEIGHBOURING
(current) phase rather than saying it has no referent. Also note the
`=== "work"` test excludes a `type: "test"` piece, so a rest after a test
interval gets no referent and AVG goes absent.

**Pinned?** `surfaceModel.test.ts:1837` (judged against THAT interval's
target), `:1899` (a leading rest suppresses), `:1776` (an effort-target
predecessor stays unjudged).

---

### RD-4. `avgVerdict` — the second judgement path
**file:line** `surfaceModel.ts:781-789`, band at `../../judgeBand.js`
(`ON_TARGET_BAND_SECONDS = 0.5`). Class: **judgement**.

A dedicated faster/slower/within comparator that deliberately does NOT call
`domain/judge.ts`'s `judgeActual`, using a **0.5 s** band where `judgeActual`
uses `PACE_TOLERANCE_SECONDS` (2 s), and re-implementing the direction rule
("+ = slower") from `summaryModel.ts:208-224` rather than from `judgeActual`'s
`fasterThanTarget` branch.

**If they disagree** The two judge different quantities (a live split vs a
settled interval average), so a same-frame disagreement is expected and
correct. The real exposure is drift: a change to `judgeActual`'s sign
convention or `Judgement` semantics does not reach this function, and the
rower gets a wrong COLOUR on the AVG cell — the one cell that carries a verdict
on a finished piece.

**Pinned?** `surfaceModel.test.ts:1711` (the band value), `:1837`, `:1881`,
`judgeBand.test.ts` (a drift test pinning the re-export by reference).

---

### RD-5. `estElapsedRaw` — a second session-elapsed total
**file:line** `surfaceModel.ts:1159-1171`. Class: **totals**.

Computes session elapsed as Σ(completed phases' PROGRAMMED lengths) + a live
term, deliberately in place of the driver's own `frame.sessionElapsedSeconds`.

**What the driver already answers** `sessionElapsedSeconds`
(`driver.ts:2454-2465`), the session register map summed. The file's reason for
refusing it is sound and measured (`:1127-1143`): that clock is built from
0x0031's per-interval elapsed, which FREEZES when `rowingActive` goes false, so
it under-credits a rest a rower sits through — measured 491.1 s of wall time
against 419.76 s credited across one capture (`surfaceModel.test.ts:3076`).

**If they disagree** They disagree by design, and BOTH are on the same surface:
`elapsedSeconds`/`totalLeftDisplay` (this estimate) drive the bar, the EST LEFT
cell and the grid header's gold countdown, while `elapsedDisplay` (`:1322`)
renders the DRIVER's number as the log sheet's `SESSION m:ss`. A rower who
opens the log sheet sees two different elapsed times for the same session.
Disclosed at `:1312-1321` as answering a different question; still two numbers.

Additional named limitation: a distance phase is priced at TARGET pace
(`domain/expand.ts:100-102`), so a rower slower than target makes EST LEFT stand
still — measured 6.6 s and 20.8 s holds at two handovers, accepted and pinned.
The null-index fallback branch reads the driver's number, so the field's
DEFINITION changes across frames.

**Pinned?** Extensively — `surfaceModel.test.ts:3005-3101` (the wire premise
against a real capture), `:3102-3200` (monotonicity across a whole capture),
`:3418-3520` (the distance-work limit, measured on a replay).

---

### RD-6. `buildGridModel`'s positional row states
**file:line** `surfaceModel.ts:1516` (`index === activeIndex`), `:1569`
(`index < activeIndex`). Class: **interval membership**.

A row's state is decided by POSITION against `activeIndex`, "never by whether
an actual happens to exist for it" (`:1399-1407`).

**What the driver already answers** The driver files an `IntervalActual` per
completed interval via the `intervalComplete` event
(`driver.ts:4454-4458`); `input.actuals` is that list, and it is the authority
on what was actually finished. `SurfaceModel.measuredIntervals` already reads it
through `measuredIntervalCount`.

**If they disagree** A row before `activeIndex` with no actual on record renders
as "completed" showing dashes — documented and accepted. The unstated direction
is worse: if `activeIndex` is wrong (IH-11's laundering, or the clamp), rows are
marked completed that were never rowed, and the rower's own record of what they
have done is wrong on the one pane whose job is to show it.

**Pinned?** The dash case is covered across `PaneGrid.test.tsx`; the
disagreement-with-actuals direction is not.

---

### RD-7. PaneLive re-derives rest state from a display string
**file:line** `PaneLive.tsx:151`. `const resting = model.restCountdown !== null;`
Class: **rest state**. See **DANGER-1**.

**What the model already answers** Nothing — and that is the finding.
`SurfaceModel` exposes `restCountdown: string | null` but **no rest boolean**,
so the pane infers the fact from the presence of a formatted string. Three
renderings key on it (`:152-156`, `:238`, `:239`): the gold
`connected-hero-value-rest` class, the countdown replacing the split numeral,
and the suppression of the tenths span AND of the judgement class.

**If they disagree** `restCountdown` is null for THREE reasons that are not
"not resting" — `restSeconds === 0` (r0, and the ephemeral rest-exit tick),
`armedMirror`, and `stale` (`:962-965`). In every one the pane concludes NOT
resting and renders `model.paceWhole` with `judgedClass(...)` applied — a
coasting flywheel's split wearing a verdict colour.

**Pinned?** The healthy paths are (`PaneLive.test.tsx:423`, `:503`, `:519`) and
the label precedence is pinned by a forced model (`:535`). Nothing pins the
r0-with-a-work-target case at the pane.

---

### RD-8. Two elapsed numbers, two definitions
**file:line** `surfaceModel.ts:1201` (`elapsedSeconds`) vs `:1322`
(`elapsedDisplay`). Class: **totals**. Consequence of RD-5; listed separately
because it is what a rower can actually put side by side. Disclosed as
deliberate.

---

## CONSUMES-AUTHORITY (22)

| # | Site | Field read |
|---|---|---|
| CA-1 | `:866` `resting` | `frame.state === "resting"` — the one authority |
| CA-2 | `:1038` `avgAbsentByReferent` | RAW `frame.intervalIndex === null`, explicitly refusing the `?? 0` laundering |
| CA-3 | `:1160` `estElapsedRaw` null branch | RAW `frame.intervalIndex`, same refusal |
| CA-4 | `:1161` | `frame.sessionElapsedSeconds` (driver-accumulated) |
| CA-5 | `:851` `sessionDistanceMeters` | `frame.sessionDistanceMeters`, checked against `input.frame` so "absent" ≠ a real `0` |
| CA-6 | `:840` `stale` | `input.linkLost`, one read, one local |
| CA-7 | `:943` `armedMirror` | the caller's resolved `status` |
| CA-8 | `:964`, `:1543` | `frame.restSeconds` |
| CA-9 | `:1204`, `:1517` | `frame.intervalRemaining` (driver-computed) |
| CA-10 | `:1362`, `:1518` | `frame.intervalAccrued` (driver-computed; the two rejected local derivations are named at `:1418-1430`) |
| CA-11 | `:1049` | `frame.splitAvgPace`, trusting the driver's provenance nulling rather than re-deriving it |
| CA-12 | `:1025` | `frame.heartRateBpm` |
| CA-13 | `:694` | `frame.spm` |
| CA-14 | `:669` | `frame.currentSplit` |
| CA-15 | `:1240` | `measuredIntervalCount(input.actuals)` — imported from `summaryModel.ts`, not re-derived |
| CA-16 | `:1391`, `:1503` | `IntervalActual.index !== null` contract honoured in both places |
| CA-17 | `:875-879` | `phase.targetKind`/`targetSplit`/`spm` — domain-resolved |
| CA-18 | `:1311` | `intervalBoundaries(...)` delegation |
| CA-19 | `:1202` | `hasRemainingEstimate` delegation to `session/Timer.tsx` |
| CA-20 | `:1125` | `totalSessionSecondsOf` delegation |
| CA-21 | `:1515`, `:1754`, `:1219` | `numbering.ordinals[...]` — one array, three read sites, cannot drift |
| CA-22 | `ConnectedSurface.tsx:483-503` | `status`/`linkLost` from `deriveAxes` — the sanctioned caller derivation |

`PaneGrid.tsx` is entirely in this class: every cell, every state and the
caption arrive decided on `SurfaceModel.grid`. It performs no derivation of its
own. `cellClass`, `countdownClass` and the `row.countdown === "rest"` ternaries
are model reads.

---

## NOT-A-DERIVATION (18)

`connectedNextText` (`:195`, built from `EnginePhase.label`, exhaustive over
`Phase["type"]` with a `never` default) · `nextLineExtent` (`:158`) ·
`judgedValue` (`:120`, delegates to `judgeActual`) · `avgValue`'s display half
(`:800`) · `formatRestCountdown` (`:829`) · `splitHero` (`:1802`) ·
`deviceCaptionFor` (`:1812`) · `articleFor` (`:1784`) · `distanceCaptionFor`
(`:1747`) · `footerCaptionFor` (`:1719`) · `intervalNumbering` (`:293`) ·
`accruedDisplayFor` (`:1690`, DASH on mismatch — the honest sibling of IH-13) ·
`measuredWorkSeconds` (`:1386`) · `counted`/`readyLabel`/`intervalOrdinalLabel`
composition (`:1221-1235`) · `PaneLive.fmtMeters` (`:126`) ·
`PaneLive.judgedClass` (`:90`) · `PaneLive.splitHeroLabel` (`:149`) ·
`ConnectedSurface.headerTrailing` (`:142`).

---

## The three most dangerous

### DANGER-1 — RC-28 confirmed, and it is wider than r0
`surfaceModel.ts:253` + `:893` + `:962` + `PaneLive.tsx:151`

**Mechanism, confirmed.** `phaseIndexForInterval` returns the rest phase only
when `phases[i + 1]?.type === "rest"`. `domain/expand.ts:193` gates rest-phase
emission on `if (s.restMinutes)`, so a zero-rest interval produces **no rest
phase at all**. A machine briefly reporting `resting` there therefore resolves
to the WORK phase; `isRestPhase` is false; `finishedWorkPhase` is `undefined`;
`targetSplitPhase` falls through to the work phase; and `paceJudgeTarget`
(`:984`) is the WORK target. Meanwhile `restSeconds` reads `0.00`, so
`restCountdown` is null (IH-2), so `PaneLive`'s `resting` is false (RD-7), so
the hero renders `model.paceWhole` — the coasting flywheel's split — **with
`judgedClass` applied against the work target**. A coasting split is slow, so
the verdict is SLOWER. The rower sees a number that is not a reading, painted
as a verdict on work they are not doing, with no REST label, no gold, and an
un-sunken grid row.

**It is wider than r0.** `WORKOUTSTATE_TO_STATE` (`parse.ts:517-532`) maps 8/9
(INTERVALWORKTIMETOREST / INTERVALWORKDISTANCETOREST) to `"rowing"` and 6/7
(INTERVALRESTEND…) to `"resting"`. So `state` lags rest ENTRY and overhangs
rest EXIT by an ephemeral tick each. At entry the surface is on the work phase
with the work target while the flywheel is already coasting; `midSessionMirror`
cannot rescue it because `distanceMeters` has not reset yet. At exit,
`restSeconds` has reached 0 while `resting` is still true, so the countdown
drops and the coast split reappears in the hero for a tick. The same
fallthrough, three causes, at every interval boundary rather than only on
zero-rest programs.

**Authority?** Genuinely absent for "which programmed rest is this" — the wire
says only `resting`. But `frame.state` DOES answer "is a rest running", and the
surface overrides it with a program-shape test that can be false when the wire's
answer is true. The honest fix shape is a rest state that cannot silently
become a work judgement: when `resting` is true and no rest phase exists,
suppress the judging target rather than falling through to the neighbour's.

**Pinned?** As intended behaviour, not as a defect —
`surfaceModel.test.ts:309` ("an interval whose phase has no rest after it stays
on its own phase"), `:902`, `:739`. No test asserts what COLOUR the hero wears
in that state.

**Same-shape siblings found by sweeping for the pattern** (a rule that falls
through to a neighbour when its own referent does not exist): `targetSplitPhase
= finishedWorkPhase ?? phase` (`:1110`, RD-3); `phaseIndexForInterval`'s
past-the-end pin to the last phase (`:261`, IH-12); `frame.intervalIndex ?? 0`
(`:860`, IH-11); `kindWord`'s `"WORK"` default (`:1205`, IH-14);
`countdownDisplayFor`'s fallback to the programmed full value (`:1672`,
IH-13); `phaseSeconds(...) ?? 0` (`:1165`, IH-16); `numbering.ordinals[index]
?? index + 1` (`:1515`, benign — caller and callee share one program).

---

### DANGER-2 — the grid's rest countdown ignores the lost link
`surfaceModel.ts:1526` vs `:962-965`

**Mechanism, confirmed by reading both guards.**

```
hero:  resting && frame.restSeconds > 0 && !armedMirror && !stale
grid:  !armed  && resting && restSeconds > 0
```

The grid's guard has no `!stale` term, and `buildGridModel` receives no `stale`
parameter at all — its own doc comment (`:1444-1450`) asserts "There is no
`stale` parameter, deliberately … Nothing in this function needs to know."
That was true when the function received only pre-judged `JudgedValue`s. RC-24
then handed it two RAW frame fields, `resting` and `restSeconds` (`:1473-1485`),
and the comment was not revisited.

**What a rower sees.** Lose the link mid-rest and the two panes disagree in the
same frame. Pane B correctly drops the countdown, captions `LAST SEEN` and
greys. Pane C's active row stays sunken (`connected-grid-resting`), keeps the
gold marker, and renders `R 0:42` **frozen at its last value** in both the
`/500M` cell and the REST column — a countdown standing still while claiming to
count. That is verbatim the defect the hero's own `!stale` term exists to
prevent: "a countdown frozen at its last value is a false claim of motion,
which is the whole defect class this fixes" (`:958-961`). The repo's own
recurring-failure 19 records a link that dropped nine times in 288 s, so this
is not a rare state.

**Authority?** Yes, and it is available — `input.linkLost` is already read into
`stale` at `:840` and could be threaded like `armed` and `resting` are.

**Pinned?** **None.** `surfaceModel.test.ts:917` asserts only `m.restCountdown`
(the hero) under `linkLost: true`; the hero/grid agreement test (`:932`) uses a
healthy link and is explicitly guarded against passing on two nulls, so it
cannot reach this case either. A test asserting
`m.grid.rows[m.grid.activeIndex]!.countdown` under `linkLost: true` with
`state: "resting"` would go red today.

---

### DANGER-3 — `frame.intervalIndex ?? 0` launders a divergence into "interval 1"
`surfaceModel.ts:860`

**Mechanism.** `toProgramIndex` returns `null` for two very different reasons
(`intervalIndex.ts:180-196`, `types.ts:143-155`): the machine is
armed/idle/finished/terminated, OR **a real interval is current and the
machine's own count cannot be explained by the program** — the D3 divergence,
which `driver.ts` considers notable enough to log as `"divergence"`. `?? 0`
collapses both to interval 0.

**What a rower sees.** On a divergence frame the entire surface names the first
interval: `1 OF 4` in the header, the grid marking row 1 active and counting
down row 1's programmed dimension, row 1's split and rate targets under both
heroes, row 1's successor on the NEXT line, and every row before it painted
"completed". Nothing on screen says the machine and the program have stopped
agreeing. Cost per occurrence is the highest of the three — it is not one wrong
number, it is a wrong screen.

**Authority?** Yes, and it is being discarded at this line. Two downstream
consumers have already had to opt out individually, each after a measured
defect: `avg` (`:1038-1043`) and `estElapsed` (`:1159-1160`, a captured
`finished` frame collapsing phase index 7 to 0 for a −428.5 s jump). Everything
else on the surface still consumes the laundered value.

**Pinned?** The behaviour is pinned as INTENDED
(`surfaceModel.test.ts:2296`: "treats a null interval index as the first, never
as a crash"), which is the honest choice for the armed/idle/finished half. The
divergence half — a real interval running under a null index — has no test and
no rendering that distinguishes it.

---

## Open questions — could not determine

1. **Should the grid consume `frame.attributedIntervalIndex`?** The frame
   carries a SECOND interval identity (`types.ts:208`, set at
   `driver.ts:2447`) — the register key the driver's own accumulator actually
   used this tick. `seriesRecorder` keys on it and never on `intervalIndex`.
   `surfaceModel.ts` reads only `intervalIndex`. Whether the two can disagree
   in a way a rower would see, and whether the grid's active row should follow
   the accumulator rather than `toProgramIndex`, needs a driver-side answer I
   could not settle by reading this file.

2. **Can `resting && restSeconds > 0` be true while `isRestPhase` is false?**
   That would need the machine to report a real, counting rest on an interval
   our program compiled with no rest — i.e. the armed program and the machine's
   loaded program disagreeing about rest. If reachable, the surface splits
   cleanly in half: the hero and grid both show a rest countdown (they read the
   wire) while TGT names the WORK phase and the pace is judged against the work
   target (they read the program). I found no capture establishing whether this
   is reachable.

3. **Is `sessionDistanceMeters` the quantity a rower thinks it is?** `PaneLive`
   renders it as the session meters counter. Per `driver.ts:2454-2470` it is
   the session register map summed, and each register entry spans an interval's
   work PLUS its trailing rest — so the counter is work+rest metres, the exact
   quantity Concept2's logbook does not store (CLAUDE.md recurring failure 11).
   This is a read-through, not a derivation by this file, and the model's own
   doc comment discloses it ("work + rest by construction"). Whether the number
   on the pane should be that quantity is a product question, not an audit
   finding.
