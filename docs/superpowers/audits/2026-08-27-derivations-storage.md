# Derivation audit — the STORAGE group

Worktree: `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/rest-countdown`
Files: `app/src/monitor/seriesRecorder.ts`, `app/src/monitor/continuity.ts`,
`app/src/monitor/monitorRun.ts`, `app/src/session/Timer.tsx`.
Read-only. Nothing changed.

Class counts: **CONSUMES-AUTHORITY 8 · INVENTED-HEURISTIC 10 · RE-DERIVED 3 ·
NOT-A-DERIVATION 7** (28 sites).

---

## Landmarks — verified

**1. `seriesRecorder.ts`'s header sentence.** Full sentence (lines 31-33):
"This module now marks every sample's own `r` field from the winning frame's
`state` directly (below) rather than relying on any assumption that a rest can
never produce one." It is about the **rest mark only**, not about attribution.
The code matches: line 421, `...(f.state === "resting" ? { r: true } : {})`.
`MonitorFrame.state` is an honest map of the wire's WORKOUTSTATE
(`domain/monitor/types.ts:177-184`, set by `parse.ts`'s `toMonitorFrame`), so
this is **CONSUMES-AUTHORITY**.

**Did the key-derivation fix generalise?** Mostly yes, with one live gap. The
module no longer derives a key at all — line 333-335 reads
`f.attributedIntervalIndex`, which `driver.ts:2447` sets to `activeKey ??
undefined`, i.e. the exact key the driver's own register fold used *after* its
stale-count rest clamp and open-on-reset guard. That is a genuine "one deriver
in the system" fix. **But the header's premise for the ABSENT arm is false.**
It claims (lines 87-89) "only non-driver test fixtures ever produce an absent
field on an open run — driver-emitted frames always carry it once a run is
open". `driver.ts:2175-2229`: `activeKey` is `intervalIndex ?? (rowing |
resting | finished ? max(seen) : null)`. **`terminated`, `idle` and `armed` are
deliberately excluded**, so `activeKey` is `null` and
`attributedIntervalIndex` is `undefined` on those frames. And such a frame DOES
reach the recorder in production: `useMonitorSession.ts:1987` feeds every live
frame to `onFrame` at the *top* of the `phase === "live"` branch; terminal
handling runs off the driver's `workoutComplete`/`terminated` **events**, not
off the frame, so the terminated frame is recorded first. See finding **S2**.

**2. `continuity.ts` → `endedBy: "link-lost"`.** Confirmed, and it is the
highest-stakes derivation in this group. Trace:
`liveness.ts:137 SILENCE_THRESHOLD_MS = 2500` watchdog (or
`useMonitorSession.decideResumeLatch`, same 2500 threshold, on a native
lifecycle resume) → `handleFrameSilence` latches `frameSilence: true` →
`applyContinuityCheck` (`useMonitorSession.ts:572-629`) → `continuity.check` →
`completeContinuityReset` (`monitorRun.ts:995`) → `completeWithoutWireEvidence`
writes `completedAt` + `endedBy: "link-lost"` and `saveMonitorRun`s it. After
that, `recordActual`'s own `completedAt !== null` guard refuses every later
boundary. Findings **C1**, **C2**, **C4**.

**3. `computeWorkRestSums` and the `monitorTimeSeconds` gap.** Confirmed.
`computeWorkRestSums` (`monitorRun.ts:756-783`) runs only under
`endedBy === "finished"` — two call sites, `completeMonitorRun:918` and
`recordActual:852`. **The gap is a DEFINITION, not a derivation defect, and the
file states it correctly** (lines 714-740): `workSeconds`/`restSeconds` sum the
**wire's** per-actual `elapsedSeconds`/`restSeconds` over every actual
unconditionally, while `monitorTimeSeconds` calls `measuredSessionSeconds`
(= `interruptedTotalSeconds:1151`), which sums `Σ elapsedSeconds` plus, only
for actuals with a non-null `index`, that interval's **PROGRAMMED**
`restSeconds` out of `program.intervals`. Two different populations of two
different quantities under one English name. The metres side *does* mirror
(`summaryModel.monitorDistanceMeters` uses the identical decomposition). This
is ROADMAP RC-5's own row. It is still worth a finding (**M5**) because the two
now live on the same record and nothing stops a future reader treating them as
the same number.

**4. `Timer.tsx` reads `MonitorFrame.intervalIndex`. — FALSE.** Verified two
ways. `grep -rn "intervalIndex" app/src app/domain` returns zero hits in
`Timer.tsx`; the only mention is a **doc comment** at line 207 explaining why
the index-based twins (`totalSessionSecondsOf`, `upNextTextAt`,
`thenNextTextAt`) exist *for a different caller*. `Timer.tsx` imports nothing
from `src/monitor/`; it drives phase progression from `SessionRun.index` via
`engine.ts` (`tick`/`advance`/`rewind`/`nextDistance`), a phone-timer wall
clock. The real consumer of `frame.intervalIndex` is
`src/workout/connected/surfaceModel.ts:854-867` (a different auditor's file).
**Timer.tsx consumes zero monitor frames and zero monitor interval state.** Its
in-scope surface is therefore empty; the three phone-side entries below are
listed for completeness and flagged out-of-scope.

---

## The table

Ordered by what a disagreement WRITES, most dangerous first.

### `continuity.ts`

| # | Site | Class | Authority? | What is WRITTEN on disagreement | Pinned by |
|---|---|---|---|---|---|
| **C1** | `check`, three-axis reset signature — `continuity.ts:287-290`. No constant, no tolerance: `after.totalWorkDistanceMeters < before && after.elapsedSeconds < before && after.distanceMeters < before`. | **INVENTED-HEURISTIC** | **NONE, and legitimately so.** The PM5 has no "I reset" report on any characteristic this codebase decodes. There is no field to read; a signature is the only way to learn the fact. This is the honest case, not a duplicated authority. | `MonitorRun.completedAt` + `endedBy: "link-lost"`, persisted, and **the record is sealed** — `recordActual`'s `completedAt` guard refuses every later boundary. FALSE POSITIVE = a healthy row is killed mid-pull; this already shipped (F2a, `walk-2026-08-23/ring-phone-2-…-continuity-kill.json`, TWD 81→0 while elapsed and distance both advanced). FALSE NEGATIVE = the run MERGES, and `driver.ts`'s per-key `Math.max` then silently absorbs post-reset metres under the re-entered key — the file's own worked example: 300 m + reset + 200 m stores ≈300 m, not 500 m, with no visible tell. The blind window is quantified in the header: ~14% of a 180 s interval at a 30 s gap, ~64% at two minutes. | Yes, densely. `continuity.test.ts` PART 3 (lines 145-260) pins each of the three clauses independently (the mutation target is dropping any one `<`); the false-kill regression at :160; the corpus sweep at :600-656; hook-level at `useMonitorSession.test.ts:7621` and `:7989`. |
| **C2** | `check`, F2b interval-count bound — `continuity.ts:291-294`: `after.intervalCount < before.intervalCount`, both `!== undefined`. | **INVENTED-HEURISTIC** | Partial. `rawIntervalCount` is a real wire field (0x0033 offset 3, carried unclamped by `driver.ts:2452` specifically for this bound) — but it is a *count*, not a reset report, and its base (0- vs 1-based) is recorded UNCONFIRMED (`types.ts:224`, interface-notes §15 #1). The bound is an inference from the field, not a read of it. | Identical to C1 — `completedAt` + `endedBy: "link-lost"`, record sealed. This bound exists precisely to convict where C1 cannot, i.e. where the two per-interval clocks read forward again, so it is the arm with the *least* corroboration and the *same* consequence. | Yes for behaviour (`continuity.test.ts:302-431`, plus the `!== undefined` vs truthiness pin at :319 and the hook-path pin at `useMonitorSession.test.ts:7673`). **NO for corpus evidence** — see C3. |
| **C3** | The distance-goal suppression — `continuity.ts:286`, `if (before.distanceGoal \|\| after.distanceGoal) return "continuation"`. Fed by `programHasDistanceGoal(run.program)` (`useMonitorSession.ts:507`). | **CONSUMES-AUTHORITY** (of our own armed program, which *is* the authority for "did we arm a distance interval") | n/a | Nothing directly; it *blocks* C1/C2 from writing. | Yes: `continuity.test.ts:58/64/70/262/431`. **The finding is what the tests measured, not whether they pass:** `continuity.test.ts:974` records that the PRODUCTION predicate suppresses **every one of the 6 committed captures — 0 non-suppressed pairs ever compared**. So C2 ships with a clean sweep that is *vacuous*. The file names this and records the decision as KEPT. Worth re-stating because a green sweep here reads as evidence and is not. |
| **C4** | The trigger, upstream: `frameSilence` — `liveness.ts:137 SILENCE_THRESHOLD_MS = 2500`, or `decideResumeLatch(gap >= 2500)` (`useMonitorSession.ts:480-491`). `applyContinuityCheck:585` short-circuits on `!frameSilence`. | **INVENTED-HEURISTIC** (not in my four files; reported because it arms C1/C2) | None — "the link is suspect" is not a wire fact. | Nothing on its own; it is the gate that lets C1/C2 write. A wrong latch is what made the 2026-08-26 nine-banner episode possible. | Yes: `useMonitorSession.test.ts:6327-6395` (both sides of the threshold, the 810 ms corpus worst case, the negative-gap case) and `:6684`. |

### `monitorRun.ts`

| # | Site | Class | Authority? | What is WRITTEN on disagreement | Pinned by |
|---|---|---|---|---|---|
| **M1** | `acceptableFinalBoundary` — `monitorRun.ts:618-627`. Three re-derived questions: `index !== null`, `index === run.program.intervals.length - 1`, and `!run.actuals.some(a => a.index === actual.index)`. | **RE-DERIVED** | **YES — `opts.finalBoundary`, the driver's own vouch** (`driver.ts`'s `emitIntervalComplete` and `reconcileSummary`, which also clears `finishGraceUntil` after the first). The record re-decides it anyway. The file argues the case honestly (the record outlives the driver instance, it is in localStorage), and the CONSUMED-ONCE bit is *deliberately* re-derived from "names the last interval" rather than stored — but it is still two deciders for one fact. | The final interval's `IntervalActual` — **accepted, or dropped forever**. A wrongly-refused vouch means the last interval never reaches `actuals`, so the log renders `N-1 OF N INTERVALS MEASURED` and `workSeconds`/`workMeters`/`restSeconds`/`restMeters` are permanently short by one interval (they are re-summed at `:852` only on the accept path). This is the exact defect class the finish grace was built for (hardware walk 5: `0 OF 1 INTERVALS MEASURED`). The `index !== null` clause is the fragile one — a boundary the driver could not attribute (`toActualIndex` → `null`) is refused here even when it *is* the final one. | Yes for the accept ordering: `monitorRun.test.ts:1079` (sums computed twice, never permanently missing the interval) and `:1124` (a late actual after TERMINATE gets no sums). I found **no test that drives a flagged final boundary with `index: null`** through this guard. |
| **M3** | `restComplete` all-or-nothing — `monitorRun.ts:765-768`, `actuals.every(a => a.restSeconds !== undefined && a.restDistanceMeters !== undefined)`. | **INVENTED-HEURISTIC** (a deliberate policy, not a guess) | None per-actual: `IntervalActual.restSeconds`/`restDistanceMeters` are additive-optional and genuinely absent on the summary-synthesised final interval. | `restSeconds`/`restMeters` present on the record, or **both absent entirely**. The policy is the right one — a partial sum would silently drop a real interval's rest and look complete. The residual risk is the opposite: one synthesised final interval erases the rest split for the whole session, and there is no `restDropped` marker to say so. | Yes: `monitorRun.test.ts:993` (one actual missing rest data omits the pair from the whole record) and `:909` (the real session-2 capture discriminating 1535 m work from 64 m rest). |
| **M5** | `interruptedTotalSeconds` / `measuredSessionSeconds` — `monitorRun.ts:1151-1161`. `Σ elapsedSeconds` + (for `index !== null`) `program.intervals[index].restSeconds`. | **RE-DERIVED** | The same record now carries `restSeconds` = the **wire's** 0x0037 rest. Two answers to "how long was this session", on one record, provably different: they diverge whenever the final interval's own 0x0037 rest reads other than its programmed rest (the exit-7 capture decodes 60 s / 95 m of rest on the FINAL interval — interface-notes §26) and whenever an actual's `index` is `null`. | **Nothing stored.** Its only consumer is `summaryModel.monitorTimeSeconds:709` → display. The saved log's per-step numbers come from `actual.elapsedSeconds`/`distanceMeters` directly (`logDraft.ts:903-904`), never from this. That is why it ranks below M1 despite being the more conceptually tangled site. Open hardware finding F-1 ("6 MIN where the wire computes 5", `walk-2026-08-17/README.md`) is unresolved against this formula. | Yes: `monitorRun.test.ts:1447-1528`, including the F-1 discrimination at `:1528`. |
| **M8** | `connectGuardStage`'s MonitorRun arm — `monitorRun.ts:1370-1377`. Returns `"unlogged"` **regardless of `completedAt`**, deliberately ignoring the stored field. | **INVENTED-HEURISTIC** (a lifecycle assertion: "any MonitorRun visible at this door is dead") | `completedAt` exists and says otherwise for a live record. The file's argument is sound — the connected session lives on WorkoutDetail and reload/navigation tears the hook down without touching the record — but it is an inference about machine state, and it is asserted, not observed. | Only **which confirm sentence** the rower sees. The destructive action (`createMonitorRun` → unconditional `clearRun()` + `saveMonitorRun` overwrite) fires after the confirm either way, so this cannot lose a record on its own. Low stakes. | Yes: `monitorRun.test.ts:1235`. |
| **M7** | `anyLiveSession` live/live tie-break → `"monitor"` — `monitorRun.ts:1262-1268`. | **INVENTED-HEURISTIC** | None — both records claim live; there is no arbiter. | Nothing. Gates resume/guard callers only. The 9-cell table at `:1214-1224` pins every cell, and the reachable path (Countdown creating a `SessionRun` by deep link mid-connected-session) is documented. | Yes, the table's cells are covered in `monitorRun.test.ts`. |
| **M2** | `computeWorkRestSums` gate — `monitorRun.ts:852` (`wasClosed && base.endedBy === "finished"`) and `:918` (`args.endedBy === "finished"`). | **CONSUMES-AUTHORITY** | `endedBy` is a stored field whose type (`CloseReason`) is **required** on `completeMonitorRun`, so "every writer names one" is compiler-checked, one writer per value. | n/a — the gate reads, it does not decide. | Yes: `monitorRun.test.ts:1035`. |
| **M6** | `monitorRunState()` / `sessionRunState()` — `:1189`, `:1195`, `completedAt === null ⇒ "live"`. | **CONSUMES-AUTHORITY** | The stored field. | n/a | Yes (via the 9-cell table). |
| **M10** | `stillLive(startedAt)` — `:1021-1025`. Re-reads storage and compares `startedAt`. | **CONSUMES-AUTHORITY** | Stored identity. | Correctly *declines* a late write onto a cleared or replaced record (the `BURST_LINGER_MS` resurrection race). Note the LOW-1 correction at `:816-831`: `recordActual` now uses `stillLive`'s **return value** as its base, not the stale `run` argument. Good. | Yes: `monitorRun.test.ts:1839+`. |
| **M12** | `appendSummaryObservations` burst gate — `:1095-1101` (`completedAt !== null`, `endedBy ∈ {finished, rower}`, `summaryTotals === undefined`). | **CONSUMES-AUTHORITY** | Stored fields only. | Write-once; a second burst is refused. | Yes: `monitorRun.test.ts:2002`, `:2026`. |
| **M4** | Empty `actuals` → `{}` — `:762`. | NOT-A-DERIVATION | — | Prevents four honest-looking `0`s on a finish grace that delivered no boundary. Correct. | `monitorRun.test.ts:872+`. |
| **M9** | `hasValidSeries` / `stripMalformedSeries` — `:359-399`. | NOT-A-DERIVATION (shape validation) | — | Worth naming: the loaded record loses `series`, and the file's own "honest limit" notes the STORED copy stays dirty until the next `saveMonitorRun` **overwrites the whole key** — at which point the trace is gone permanently. The trade (lose the trace, keep the run) is right and matches §3's sacrifice ordering. | Yes. |
| **M11** | `saveMonitorRun`'s sacrifice retry — `:475-492`. Writes `seriesDropped: true`. | NOT-A-DERIVATION | — | Permanently discards the trace on a quota throw. Correct ordering (trace sacrificed, never the run). `seriesDropped` is **written and read by nothing** — stated in the file, not hidden. | Yes. |
| **M13** | `isMonitorRun` version arm + the "no reader of a LOADED program consults `ProgramInterval.type`" invariant — `:310-347`, `:401-447`. | NOT-A-DERIVATION | — | The invariant is real and load-bearing: adding such a reader reintroduces a miscount on the records of rowers most likely to be mid-session. Nothing enforces it mechanically. | Partially (`monitorRun.test.ts:228`, `:331`). |

### `seriesRecorder.ts`

| # | Site | Class | Authority? | What is WRITTEN on disagreement | Pinned by |
|---|---|---|---|---|---|
| **S3** | The work clock fold — `seriesRecorder.ts:349-358`. `Σ over keys < currentKey of register.max` + `f.elapsedSeconds`; ditto metres at `:396`. | **RE-DERIVED** | **YES.** `driver.ts:2462-2469` folds the SAME register map into `frame.sessionElapsedSeconds`/`sessionDistanceMeters` — but as `Σ over ALL keys of register.max`. Different formula, same underlying registers. The header explicitly refuses to read the driver's value ("never `sessionElapsedSeconds` — a different, driver-owned derived sum with its own defects, B2"), so this is a *knowing* second deriver of the session total. | `series[].t` and `series[].d` — the stored 1 Hz trace, in tenths. The two folds agree exactly whenever `f.elapsedSeconds === register[currentKey].max` (the monotone case, which is every emitted sample in a healthy run — a lagging tick reads lower, so the recorder's value is lower and the bucket rule drops the sample anyway). They can only diverge if the recorder misses frames the driver saw; the recorder is created at run-open (`useMonitorSession.ts:1911`) and the driver writes no register while `armed`, so I found no reachable divergence today. **The risk is structural, not present:** two folds over one register map, in two files, with no test comparing them. | Absolute values pinned against real captures: `seriesRecorder.test.ts:281` (139 samples, step-2), `:356` (243 samples, both boundaries' exact fold value), `:442`, `:859`, `:1489`, `:1513`. **No test compares the recorder's work clock against `frame.sessionElapsedSeconds`.** That is the gate this pair does not have. |
| **S2** | ABSENT `attributedIntervalIndex` continues the last key — `:333-335` (the implicit else). | **INVENTED-HEURISTIC** | The authority exists (`attributedIntervalIndex`) but is genuinely **absent on `terminated`/`idle`/`armed` frames**, because `driver.ts:2175-2229` leaves `activeKey` null there. **The header's claim that only non-driver test fixtures produce absence on an open run is FALSE** (see Landmark 1). A terminated frame reaches `onFrame` at `useMonitorSession.ts:1987` before any terminal handling runs. | The terminated frame's reading max-merges into the **previous interval's register** and produces a work-clock value from a re-based elapsed. Damage is bounded, not zero: `Math.max` protects the register (CSAFE-DEF footnote 12 — on TERMINATE elapsed re-bases backward while distance *holds exactly*, so `max` is a no-op on metres), and a backward work clock fails the `bucket <= lastEmittedBucket` test at `:386` and is dropped. So today the consequence is "no sample", not "a wrong sample". The finding is that the **premise** protecting `series[].t/d` is wrong, and the next frame shape that lands in this arm with a *forward* reading would write into the wrong register with nothing to stop it. | Behaviour pinned: `seriesRecorder.test.ts:932` (continues the last key), `:959` (all-absent run accumulates under one synthetic key), `:1171`. **The premise is pinned by nothing** — no test drives a real terminated frame from the driver into the recorder. |
| **S6** | spm band `SPM_MIN = 10` / `SPM_MAX = 60` — `:194-195`, applied at `:405`. | **INVENTED-HEURISTIC** | None. The wire's spm is an instantaneous rate; both out-of-band artifacts (64 spm first-stroke estimator, 101 spm workout-end transition) are real, coherent readings, not parse noise. There is no authority saying which readings are "real". | `series[].spm` is forced to the existing `0` sentinel. The ceiling has two captured artifacts as evidence. **The floor has none** — the file says so itself (`:181-193`): decoding every 0x0032 byte across all seven committed captures gives nothing between 1 and 21, so `SPM_MIN = 10` has never fired and has never been shown to be safe. A light warm-up stroke below 10 would be silently zeroed in the stored trace. Self-documented, not hidden. | Yes: `seriesRecorder.test.ts:707/714/721/728/735/742/749` — both band edges and both sides of each. |
| **S7** | hr band `HR_MIN = 20` / `HR_MAX = 254` — `:161-162`, applied at `:413`. | **INVENTED-HEURISTIC** | Deliberate mirror, not a duplicated authority: the same band `logDraft.ts`'s `MONITOR_HR_MIN`/`MAX` applies one step downstream. Copied rather than imported to avoid a cycle (`seriesRecorder` is a lower-layer primitive `logDraft` depends on). | `hr` is omitted from the sample. Correct direction — before this, the server's `data.ts` `HR_MIN` band **400ed the whole POST** on one out-of-band byte, discarding the entire trace. Residual risk: three copies of one band in three files, kept in sync by comment. | Yes: `seriesRecorder.test.ts:646/653/660`. |
| **S8** | `backwardBucketCount` three-term predicate — `:372-379`: `bucket < lastEmittedBucket && !emittedBuckets.has(bucket) && bucket > firstEmittedBucket`. | **INVENTED-HEURISTIC** | None — it is a diagnostic for "a second the series will never have". | **Nothing stored.** Deliberately absent from `SeriesData`/`snapshot()` because the server route's reconstruction has no field to carry it; a caller reads it off the recorder. Refined twice against measured over-firing (1 and 18 false counts on two clean captures under the first cut; zero under this one). | Yes, thoroughly: `seriesRecorder.test.ts:1195-1396`, including the counterfactual at `:1583` that reproduces the pre-fix defect's ~57 never-emitted buckets. |
| **S1** | `currentKey = f.attributedIntervalIndex` — `:333-334`. No comparison, no forward-only clamp. | **CONSUMES-AUTHORITY** | `driver.ts:2447`, the key the driver's own fold used after both its guards. This is the fix that retired the prior defect. | n/a | Yes: `seriesRecorder.test.ts:1140` (attribution wins over a disagreeing `intervalIndex` — RED before the change, GREEN after). |
| **S5** | `r: true` from `f.state === "resting"` — `:421`. | **CONSUMES-AUTHORITY** | `MonitorFrame.state`, an honest WORKOUTSTATE map. | n/a — this is the site that replaced the falsified "rest ⇒ zero samples" assumption. | Yes: `seriesRecorder.test.ts:1058` against a real capture with a non-frozen rest. |
| **S4** | `bucket = Math.floor(workClock + 1e-9)` (`:246`, `:359`) + first-frame-wins (`:386`). | NOT-A-DERIVATION | The wire has no 1 Hz series; decimation policy is ours by definition. | Which frame wins each second. | Yes: `:498` (10 Hz decimates identically), `:799`, `:809`. |
| **S9** | `SERIES_SAMPLE_CAP = 14_400` + `truncated` (`:143`, `:391`). | NOT-A-DERIVATION | Storage policy. | Appending stops; `truncated: true` set once. | Yes: `:521`. |

### `Timer.tsx` — no in-scope sites

The audit scope ("parts that consume monitor frames or interval state") is
**empty** for this file; see Landmark 4. Listed for completeness, all
out-of-scope:

| # | Site | Class | Note |
|---|---|---|---|
| **T1** | `isSuspectActual` — `Timer.tsx:326-335`, `elapsed > estimate * 2 \|\| elapsed < estimate / 2`. | INVENTED-HEURISTIC | Phone-timer only, no monitor involvement. Stages a choice rather than recording silently; the rower's answer is what writes `PhaseActual`. `stagedElapsed` is frozen at tap time (`:616`, `:630`) so deliberation cannot inflate the recorded split — that is the right shape. |
| **T2** | `applyDistanceActual` — `:583-597`, `splitSeconds = (elapsed / meters) * 500`, `actualSource: "stopwatch"`. | NOT-A-DERIVATION | Arithmetic on a wall clock, with no machine reading in existence to disagree with. Writes `SessionRun.actuals` (a stored record) — but on the phone side, outside this audit's rubric. |
| **T3** | `runIntervalBoundaries` — `:196-200`, measured = `run.actuals[group.workIndex]?.elapsedSeconds`. | CONSUMES-AUTHORITY | Reads the stored record; delegates the arithmetic to `intervalBoundaries.ts`, shared verbatim with the connected surface so the two bars cannot drift. |

---

## Open questions (stated, not guessed)

1. **M1's `index: null` clause.** I could not establish whether the driver can
   ever set `finalBoundary: true` on an actual whose `toActualIndex` returned
   `null`. If it can, the record refuses the final interval and the loss is
   permanent and silent. Settling it means reading `emitIntervalComplete` and
   `reconcileSummary` in `driver.ts` together — outside my four files.
2. **S3's two folds.** I found no *reachable* divergence between the
   recorder's work clock and `frame.sessionElapsedSeconds` today, but I proved
   that by reasoning about `activeKey`'s null arms, not by running a replay
   that compares them. A replay assertion over the committed captures would
   settle it; none exists.
3. **C2's base.** `rawIntervalCount`'s 0- vs 1-based origin is recorded
   UNCONFIRMED. `after < before` is invariant under a constant offset, so the
   bound survives — but only if the offset really is constant across a reset,
   which no capture in the corpus demonstrates (all 6 are suppressed).
