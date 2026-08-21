# `fake.ts` field audit — every decoded PM5 field, classified

Read-only audit against the main checkout. Sources: `app/domain/monitor/pm5/parse.ts`
(decode), `app/domain/monitor/pm5/statusFrames.ts` (encode, the fake's only path
to the wire), `app/src/monitor/transports/fake.ts` (what the fake actually sends —
`statusBundle`/`boundaryBundle`/`armedBundle`, lines ~701-940), and a field-by-field
grep of `app/src/` + `app/domain/` for real consumers, excluding test files and the
three files above. `docs/monitor/pm5-interface-notes.md` is the transcribed C2 doc
authority (PRIMARY where cited).

## Headline findings

1. **CORRECTED — the dangerous bucket is NOT empty; `restSeconds` is its first
   occupant.** This audit was landed as a read-only snapshot, and the EST LEFT task
   (`docs/superpowers/specs/2026-08-20-est-left-design.md`) gave `restSeconds` a
   real consumer in the SAME commit range: `surfaceModel.ts`'s `estElapsedRaw`
   reads it as the live term for a rest in progress. `fake.ts` was taught to accept
   a script-authored `FakeStatusEvent.restSeconds` in that same task, but **no
   existing fixture in the repo — no e2e spec, no screenshot script — ever sets
   it**, so every fake-driven test still gets the same constant `0` this audit
   originally found (`fake.test.ts`'s own "unscripted fixture" test confirms this
   is unchanged, deliberately, from before). That is exactly the HARDCODED bucket's
   definition: a field with a real consumer, pinned constant in the fake.
   **What this does NOT mean: no live defect is hiding today.** The consumer's own
   correctness is independently proven against REAL wire bytes — a replay test
   drives the actual PM5 parser/driver over a committed capture
   (`docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`) and
   asserts `estElapsed` tracks wall time through three real rests, never touching
   the fake at all. What IS true: any e2e or screenshot-level test exercising a
   rest through the FAKE has zero discriminating power over this mechanism — a
   wrong scale, sign, or offset in how the fake's `restSeconds` would be consumed
   could not be caught at that layer, only at the unit/replay layer. Every OTHER
   field that reaches `MonitorFrame`/`IntervalActual`/a driver decision remains
   realistically modelled (bucket M) — this is a correction of one row, not of the
   audit's method.
2. **~15 flat zeros is about right — I count 14** flat-`0` fields plus one
   `HEARTRATE_NO_BELT`(=0)-by-convention field, all UNCONSUMED (table below). A
   further 4 fields (`ergMachineType` ×2, `dragFactor`, `splitAvgDragFactor`) are
   non-zero constants, also UNCONSUMED. `AdditionalStatus1.averageSplit` is a fifth
   quasi-hardcode worth flagging on its own: the fake sets it to `e.currentSplit`
   (line 744) rather than modelling it as its own quantity — harmless today only
   because it too is UNCONSUMED.
3. **`restSeconds` (0x0032) and `intervalRestTimeSeconds` (0x0037) are genuinely
   different fields on the wire**, not two copies of one idea — see the dedicated
   section below. **CORRECTED:** `restSeconds` is no longer unconsumed —
   `surfaceModel.ts` reads it (EST LEFT task, same commit range as this
   correction) — though the fake still hardcodes it to `0` for every existing
   fixture (finding 1, above). `intervalRestTimeSeconds` remains genuinely
   UNCONSUMED and hardcoded to `0`; wiring it up today would still ship with zero
   fake-level test coverage of its real behaviour.
4. **0x0039's averages get a deliberately realistic non-zero default**
   (`deliverSummary`, fake.ts:2134) specifically so a gate that copies them across
   by mistake fails a test (fake.ts:2116-2124's own comment). The ~14 flat-zero
   fields elsewhere on 0x0032/33/37/38 get no such treatment — an inconsistency in
   how carefully different parts of this fake were built, worth carrying forward if
   any of them gets consumed later.

---

## Table

Legend: **M** = MODELLED, **H** = HARDCODED (consumed + constant), **U** = UNCONSUMED.

### 0x0031 — General Status (`GeneralStatus`)

| Field | Bucket | Fake value | Consumer(s) |
|---|---|---|---|
| `elapsedSeconds` | M | `e.elapsedSeconds`, varies per tick | `MonitorFrame.elapsedSeconds`/`sessionElapsedSeconds` (driver.ts accumulator); read everywhere a live clock is shown |
| `distanceMeters` | M | `e.distanceMeters`, varies | `MonitorFrame.distanceMeters`/`sessionDistanceMeters`; same breadth |
| `workoutType` | M | `structureForTick()` (fix-3 Task 5, real encoding of the armed program) | `driver.ts` structural readback (`verifyArmed`, ~3409-3424, 3703-3719) — decides whether an arm is accepted as matching the sent program |
| `intervalType` | U | `isDistance ? 1 : 0` (correctly derived, not a flat constant) | none found in `src/`/`domain/` outside `pm5/parse.ts`/`statusFrames.ts`/tests |
| `workoutState` | M | `e.workoutState`, script-driven | `toMonitorState()` → `MonitorFrame.state`; gates almost everything (`rowing`/`resting`/`armed`/etc.) |
| `rowingState` | M | `e.rowingState ?? (state==="rowing" ? 1 : 0)` | `MonitorFrame.rowingActive` (`useMonitorSession.ts`) — the coasting-flywheel guard, walk-3 finding |
| `strokeState` | U (H-shaped: literal `0`) | `0`, fake.ts:756 | none found |
| `totalWorkDistanceMeters` | M | `totalWorkDistanceFor(...)`, session-shaped since 2026-08-18 spec | `driver.ts` TWD divergence log (~2540-2693, 3439-3449) — cross-checks the driver's own accumulator against the machine's |
| `workoutDurationRaw` | M | `structureForTick()` | `driver.ts` structural readback, same call sites as `workoutType` |
| `workoutDurationType` | M | `structureForTick()` | same, plus the `=== 128` distance-duration check at driver.ts:2690 |
| `dragFactor` | U (non-zero constant `130`) | `130`, fake.ts:768 | none found |

### 0x0032 — Additional Status 1 (`AdditionalStatus1`)

| Field | Bucket | Fake value | Consumer(s) |
|---|---|---|---|
| `elapsedSeconds` | M | shared field, see above | — |
| `speedMetersPerSecond` | U (flat `0`) | `0`, fake.ts:735 | none found |
| `spm` | M | `e.spm`, varies | `MonitorFrame.spm`; `judge.ts`, `seriesRecorder.ts`, surface UI |
| `heartRateBpm` | M | `e.heartRateBpm ?? HEARTRATE_NO_BELT` (D5-correct, `0` not `255` for beltless) | `MonitorFrame.heartRateBpm`; `judge.ts`, surface UI |
| `currentSplit` | M | `e.currentSplit`, varies | `MonitorFrame.currentSplit`; `surfaceModel.ts`'s armed-carry-over/ghost logic, `judge.ts` |
| `averageSplit` | U (quasi-hardcode, `= e.currentSplit`) | not independently modelled | none found |
| `restDistanceMeters` | U (flat `0` in `armedBundle`; session-tracked elsewhere but still never read downstream) | `sessionMetrics.restDistanceMeters` | none found — **not** the same field as `IntervalActual.restDistanceMeters`, which comes from 0x0037 (see below) |
| `restSeconds` | **H — CORRECTED, the field this audit exists for, now the dangerous bucket's first occupant** | `0` for every existing fixture (script-authorable since the EST LEFT task, but nothing sets it), fake.ts | `surfaceModel.ts`'s `estElapsedRaw` (EST LEFT task) — the rest-phase live term. See dedicated section. |
| `ergMachineType` | U (non-zero constant `1`) | `1`, fake.ts:747 | none found |

### 0x0033 — Additional Status 2 (`AdditionalStatus2`)

| Field | Bucket | Fake value | Consumer(s) |
|---|---|---|---|
| `elapsedSeconds` | M | shared | — |
| `intervalCount` | M | `toMachineIndex(programIntervalIndex, state)` — the D3 forward-attribution model | `MonitorFrame.intervalIndex` (raw, pre-`toProgramIndex` normalization), `driver.ts`'s divergence check (~1834, 2186, 3357-3370) |
| `averagePowerWatts` | U (flat `0`) | `0`, fake.ts:725 | none found |
| `totalCalories` | U (flat `0`) | `0`, fake.ts:726 | none found |
| `splitAvgPace` | M | `sessionMetrics.splitAvgPace` (`updateSplitAvgPace`, holds through rest per design doc) | `MonitorFrame.splitAvgPace`; `driver.ts`'s provenance-staleness null-out (~2125-2138), `surfaceModel.ts`'s judged-average row |
| `splitAvgPowerWatts` | U (flat `0`) | `0`, fake.ts:728 | none found |
| `splitAvgCalories` | U (flat `0`) | `0`, fake.ts:729 | none found |
| `lastSplitTimeSeconds` | U (carefully modelled — `wireLastSplit`'s measured lag-one-boundary semantics — but still unread) | non-zero, tracked | none found (comment at fake.ts:687-692 says explicitly nothing downstream still subtracts this pair since the 2026-08-18 checkpoint deletion) |
| `lastSplitDistanceMeters` | U (same as above) | non-zero, tracked | none found |

### 0x0037 — Split/Interval Data (`SplitIntervalData`)

| Field | Bucket | Fake value | Consumer(s) |
|---|---|---|---|
| `elapsedSeconds` (cumulative) | U — decoded but `RawPm5Status`'s merged shape never distinguishes it from the per-interval 0x0031 field of the same name, and neither `toMonitorFrame` nor `toIntervalActual` reads it off this characteristic specifically | `e.cumulativeElapsedSeconds` | none found reading it as *this* characteristic's field |
| `distanceMeters` (cumulative) | U, same shape as above | `e.cumulativeDistanceMeters` | none found |
| `splitIntervalTimeSeconds` | M | `actual.elapsedSeconds` (script-authored) | `IntervalActual.elapsedSeconds` via `toIntervalActual` — the interval's logged duration (`logDraft.ts`) |
| `splitIntervalDistanceMeters` | M | `actual.distanceMeters` | `IntervalActual.distanceMeters` — same path |
| `intervalRestTimeSeconds` | **U — the "second rest-time field". See dedicated section.** | `0`, fake.ts:856, always | **none** |
| `intervalRestDistanceMeters` | M | `actual.restDistanceMeters` (script-authored, R-B) | `IntervalActual.restDistanceMeters` → `summaryModel.ts:580`'s DISTANCE hero total |
| `splitIntervalType` | U (flat `0`) | `0`, fake.ts:863 | none found |
| `splitIntervalNumber` | M | `toMachineIndex(actual.index, machineState)` | `IntervalActual.index`; `driver.ts`'s boundary-half bookkeeping (~3208, 3381, 3632) |

### 0x0038 — Additional Split/Interval Data (`AdditionalSplitIntervalData`)

| Field | Bucket | Fake value | Consumer(s) |
|---|---|---|---|
| `elapsedSeconds` | U, same shared-name caveat as 0x0037's copy | shared | — |
| `splitIntervalAvgStrokeRate` | M | `actual.avgSpm ?? 0` | `IntervalActual.avgSpm` |
| `splitIntervalWorkHeartRateBpm` | M | `actual.avgHeartRateBpm ?? HEARTRATE_NO_BELT` | `IntervalActual.avgHeartRateBpm` |
| `splitIntervalRestHeartRateBpm` | U — **decoded but explicitly has no slot**, per `parse.ts`'s own doc comment on `toIntervalActual` (line ~544: *"has no slot here"*) | `HEARTRATE_NO_BELT` (0), always, fake.ts:838 | none — self-documented dead end |
| `splitIntervalAvgPace` | M | `derivedAvgSplit(actual.elapsedSeconds, actual.distanceMeters)` — the PM's own computed-from-time/distance identity, per the 2026-08-17 PM gate ruling | `IntervalActual.avgSplit` |
| `splitIntervalTotalCalories` | U (flat `0`) | `0`, fake.ts:843 | none found |
| `splitIntervalAvgCalories` | U (flat `0`) | `0`, fake.ts:844 | none found |
| `splitIntervalSpeedMetersPerSecond` | U (flat `0`) | `0`, fake.ts:845 | none found |
| `splitIntervalPowerWatts` | U (flat `0`) | `0`, fake.ts:846 | none found |
| `splitAvgDragFactor` | U (non-zero constant `130`) | `130`, fake.ts:847 | none found |
| `splitIntervalNumber` | M | shared with 0x0037's copy | `driver.ts:3381` |
| `ergMachineType` | U (non-zero constant `1`) | `1`, fake.ts:849 | none found |

### 0x0039 — End of Workout Summary (`WorkoutSummary`)

Not on the timeline; delivered on demand via `FakeControls.deliverSummary()`
(fake.ts:2126), defaults deliberately realistic (see headline finding 4).

| Field | Bucket | Fake default | Consumer(s) |
|---|---|---|---|
| `elapsedSeconds` | M | required param, no default | `driver.ts`'s summary-reconciliation arithmetic (~2564, 2889-2914) — fills the final interval's actual when the last 0x0037/38 boundary never arrived |
| `meters` | M | required param | same reconciliation path |
| `avgStrokeRate` | U (deliberate: design spec §5 B3 says drop whole-workout averages) | `24` | none — dropped by design, not oversight |
| `endingHeartRateBpm` | U (B3) | `168` | none |
| `avgHeartRateBpm` | U (B3) | `152` | none |
| `minHeartRateBpm` | U (B3) | `96` | none |
| `maxHeartRateBpm` | U (B3) | `175` | none |
| `dragFactorAverage` | U (B3) | `128` | none |
| `recoveryHeartRateBpm` | U (B3) | `120` | none |
| `workoutType` | U — read only inside a diagnostic log template string (driver.ts:2565), never a decision | `8` | log line only |
| `avgPaceSecondsPer500m` | U (B3) | `125` | none |

---

## The two rest-time fields

**PRIMARY, `docs/monitor/pm5-interface-notes.md` §10** (transcribed BLE Interface
Definition rev 1.30 pp.13-20):

| | `restSeconds` | `intervalRestTimeSeconds` |
|---|---|---|
| Wire location | 0x0032 offset 13-15, "Rest Time" | 0x0037 offset 12-13, "Interval Rest Time" |
| Scale | **0.01 sec/lsb** (centiseconds) | **whole seconds** (1 sec/lsb) |
| Characteristic family | 0x0031/32/33 — the **live/per-tick status** trio, streamed continuously at the connect-time sample rate (driver requests the fastest documented rate, `0x03` = **100 ms / 10 Hz** — `commands.ts:94`, PRIMARY §4; not literally "twice a second" as this task's brief put it, but the same idea: a live, high-frequency number) | 0x0037/38 — the **boundary/settled** pair, delivered once when a completed interval's split data goes out |
| What it represents | A **live, running** rest clock — the sibling of Current Pace (same characteristic, same live-per-tick nature) — almost certainly what the PM5 is counting during `INTERVALREST`, updated every status tick | The **final, settled** rest duration attributed to one just-completed interval, alongside that interval's Split/Interval Time and Split/Interval Distance |
| Sibling already shipped | none | `intervalRestDistanceMeters` (offset 14-15, same characteristic) — **already wired**, via R-B, into `IntervalActual.restDistanceMeters` and consumed by `summaryModel.ts`'s DISTANCE hero. `intervalRestTimeSeconds` is its unshipped time-side twin. |

**Which should a consumer prefer, and for what:**

- A **live "resting: 0:23"** readout on the connected surface (the exact thing
  today's spec tried to reconstruct with an accumulator, per this task's brief)
  wants **`restSeconds`** (0x0032) — it is the number the machine is already
  incrementing twice-a-tick during a rest, no reconciliation needed, matching the
  precedent already set for `currentSplit`/`restDistanceMeters` (0x0032 fields
  read live and shown live). Confidence: the argument from the field's placement
  and cadence is strong (PRIMARY: same characteristic as other live fields,
  same scale precision as Current Pace); nobody has watched a real `0x0032`
  stream during a rest to confirm it counts *up* rather than reporting something
  else, so tag that specific behaviour INFERENCE, not confirmed.
- A **completed interval's rest duration for the log/record** (to sit next to
  the already-shipped `restDistanceMeters` on `IntervalActual` — "rest: 1:00 /
  64m" instead of the distance-only figure the log shows today) wants
  **`intervalRestTimeSeconds`** (0x0037) — same characteristic, same delivery
  moment, same one-shot settled semantics as its distance sibling. This is
  SECONDARY/INFERENCE reasoning by analogy to R-B's already-shipped pattern, not
  a re-derivation from a fresh capture.

**CORRECTED:** `restSeconds` is UNCONSUMED no longer — the EST LEFT task wired it
into `surfaceModel.ts` in the same commit range this correction lands in — but the
fake's own value is still `0` for every existing fixture (script-authorable, never
scripted), so the situation this task's brief warned about happened to
`restSeconds` exactly as predicted: it inherited a fake that cannot disprove a
wrong scale, wrong offset, or a sign flip AT THE FAKE-DRIVEN (e2e/screenshot)
layer — the real-wire replay test that DOES prove it correct lives one layer
below, against the actual parser and a committed capture, never the fake.
`intervalRestTimeSeconds` remains UNCONSUMED and hardcoded to `0`; the warning
still applies to it in full.

---

## Rules-check: is the ~15 figure right?

**Roughly, yes.** Counting only the flat-`0` fields the fake writes unconditionally
(excluding the two rest-time fields, already counted above, and excluding non-zero
constants): `strokeState`, `speedMetersPerSecond`, `averagePowerWatts`,
`totalCalories`, `splitAvgPowerWatts`, `splitAvgCalories`, `splitIntervalType`,
`splitIntervalTotalCalories`, `splitIntervalAvgCalories`,
`splitIntervalSpeedMetersPerSecond`, `splitIntervalPowerWatts` = **11**, plus
`restSeconds` and `intervalRestTimeSeconds` = **13**, plus
`splitIntervalRestHeartRateBpm` (hardcoded to the `0`-valued `HEARTRATE_NO_BELT`
sentinel, functionally a flat zero) = **14**. Four more fields are hardcoded to a
non-zero constant rather than zero (`ergMachineType` ×2, `dragFactor`,
`splitAvgDragFactor`) — not "flat zeros" literally, but the same failure shape.
So: **14 flat zeros + 4 non-zero constants = 18 hardcoded fields total**, all
UNCONSUMED. The brief's "~15" undercounts slightly if non-zero constants are
included, and overcounts slightly if read as "flat zeros" strictly — both readings
land within a few of the real number. No field was found hardcoded that the brief's
list missed in a way that changes the shape of the finding.

---

## What each UNCONSUMED field would enable (one line each)

- `restSeconds` (0x0032) — a live rest-countdown/elapsed readout on the connected
  surface, replacing any accumulator built to approximate it.
- `intervalRestTimeSeconds` (0x0037) — completes `IntervalActual`'s rest record
  (pairs with the already-shipped `restDistanceMeters`) for the log/summary.
- `speedMetersPerSecond` — an instantaneous speed readout as an alternative/companion
  to pace; nothing in the current surface asks for one.
- `strokeState` — a per-stroke phase indicator (catch/drive/recovery); could drive a
  stroke-cadence animation, but nothing currently renders per-stroke detail.
- `averagePowerWatts` / `splitAvgPowerWatts` / `splitIntervalPowerWatts` — a live or
  per-interval power (watts) readout; this app has never surfaced power anywhere.
- `totalCalories` / `splitAvgCalories` / `splitIntervalTotalCalories` /
  `splitIntervalAvgCalories` — calorie displays; same as above, no existing surface.
- `intervalType` (0x0031) — already correctly derivable client-side from the program
  (`ProgramInterval.kind`); nothing obvious it would add if consumed from the wire
  instead.
- `splitIntervalType` (0x0037) — nothing obvious; likely mirrors `intervalType`.
- `ergMachineType` (×2) — would let the app detect a non-rowing erg (bike/ski) if
  Concept2 hardware other than a rower is ever supported; nothing obvious for
  rowing-only Ergomatic today.
- `dragFactor` / `splitAvgDragFactor` — a drag-factor readout, useful for rowers who
  tune resistance, but no design has asked for one.
- `lastSplitTimeSeconds` / `lastSplitDistanceMeters` — nothing obvious; the driver
  explicitly deleted its own consumer of this pair (2026-08-18 checkpoint-subtraction
  removal) after measuring it unreliable for progress-tracking.
- `averageSplit` (0x0032, distinct from `splitAvgPace` on 0x0033) — nothing obvious;
  likely a redundant reading given `splitAvgPace` already serves this need.
- `restDistanceMeters` (0x0032, live) — nothing obvious beyond what
  `IntervalActual.restDistanceMeters` (from 0x0037, already shipped) already
  provides at the boundary; a live version could animate a rest-distance counter
  the way a live rest-time counter would (see `restSeconds` above).
- `splitIntervalRestHeartRateBpm` — a rest-heart-rate reading distinct from the
  work-average; `parse.ts` itself already names the gap (`IntervalActual` "bundles
  an interval's trailing rest into itself... `splitIntervalRestHeartRateBpm` is
  decoded but has no slot here") — a recovery-HR row on the log.
- 0x0039 averages (`avgStrokeRate`, `endingHeartRateBpm`, `avgHeartRateBpm`,
  `minHeartRateBpm`, `maxHeartRateBpm`, `dragFactorAverage`, `recoveryHeartRateBpm`,
  `avgPaceSecondsPer500m`) — nothing obvious **and deliberately so**: design spec §5
  ruling B3 says these are the whole workout's averages, not any one interval's, and
  dropping them was a considered decision, not a gap.
- `workoutType` (0x0039 copy) — nothing obvious beyond the diagnostic logging it
  already gets.

## Which HARDCODED fields could hide a live defect right now

**CORRECTED — one: `restSeconds`.** This section originally said "None," the
moment before the exposure it predicted materialized: `restSeconds` gained a
consumer (`surfaceModel.ts`, EST LEFT task) in the same commit range, and the
fake's value for it stayed pinned at `0` for every existing fixture — the
dangerous combination this audit exists to catch. It does NOT currently hide a
live DEFECT (the consumer is independently proven correct against real wire bytes
via a replay test over a committed capture, never the fake — see finding 1), but
it does mean the fake-driven layer (e2e, screenshots) has zero discriminating
power over this specific mechanism: a wrong scale, sign, or offset in how a
script's `restSeconds` would be consumed could ship undetected at that layer.
Every OTHER field that is both consumed and modelled by the fake still varies
realistically (table above, bucket M). The exposure for every remaining
UNCONSUMED field is still prospective, as originally written: the moment one of
them gets a consumer, it inherits a hardcoded fake with no falsifying test unless
the fake is updated in the same change — which is precisely what happened here,
half-done (the fake CAN speak; nothing yet asks it to).
