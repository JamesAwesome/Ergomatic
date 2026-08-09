# Phase 7C — PM5 logging (design)

**Date:** 2026-08-08, adversarially revised same day (23 findings, 4
blocking — `2026-08-08-phase-7c-adversarial-review.md`; every B/M
finding is resolved in the section that owned it).
**Authority:** ROADMAP §Phase 7C; the `MonitorRun` record
(`app/src/monitor/monitorRun.ts`); the 6C log split (`logDraft.ts`
builders + `LogSession.tsx`); the walk-4 hardware record (§18
2026-08-08). **Product rulings (James):** partials log what the erg
saw; PM5 splits read-only; HR stored not shown; DB-lean seam for a
future Concept2 Logbook sync (verbatim step fields, no sidecar).

## 1. Goal and shape

A session fully driven by a connected PM5 saves a log indistinguishable
in shape from a phone-timer session, with real monitor-measured splits
(`actualSource: "pm5"` — typed since 6C, admitted by the server since
6C (`data.ts` `ACTUAL_SOURCES`), produced by nothing until now). One
save path: `LogSession`, with an explicit monitor MODE fed by a new
builder.

NON-GOALS: no Concept2 sync (only its raw material, §5); no HR UI; no
changes to the phone-timer builders or payloads; no logging for
ANONYMOUS runs (`workoutId: null` — no library door exists to log them
through; their records still clear through the existing connect/start
guards, and a ROADMAP line records the gap).

## 2. The log seed (B1/B2's resolution, new)

`buildMonitorLogSteps` cannot derive labels or warmup-ness from
`MonitorRun` today: `ProgramInterval` carries no `originalIndex`, the
run stores no phases, and the connect path persists no draft
(adversarial B1). So the run learns, at creation, the ONE small thing
the log needs:

```ts
// MonitorRun (v bumps 1 -> 2; a v1 record loads as today and simply
// never qualifies for the monitor mode):
logSeed?: {
  // Aligned 1:1 with program.intervals, BUILT FROM THE SAME PHASES the
  // program was compiled from, at the same moment:
  steps: { label: string; kind: "warmup" | "work" }[];
  // The PACES LOCKED panel's values, captured at connect (the manual
  // path recovers them from step targetSplits; the monitor mode cannot
  // — adversarial scope note):
  paces: { k2?: number; k6?: number };
}
```

Built by a new `logDraft.ts` helper `buildLogSeed(phases, baselines)`
on the workout detail (which holds phases and baselines at Connect —
`ConnectedInterstitial`'s own props), threaded through
`RunIdentity` → `program()` → `createMonitorRun`. A few strings per
run in localStorage; nothing new on the wire.

## 3. The builder: `buildMonitorLogSteps(run: MonitorRun): LogStep[]`

Walks `run.program.intervals` beside `run.logSeed.steps` (same length
by construction; a length mismatch or missing seed disqualifies the
record from the monitor mode entirely — fall through to manual, never
guess).

**Warmup intervals produce NO step** — the manual path has never
emitted warmup rows (`logDraft.ts` skips `wu`; adversarial B2), and
shape-parity governs. A warmup's measured actual appears nowhere in
steps; its time is still inside the session's wall-clock duration.
**Rest rows: none** — the manual builder emits none (adversarial M4).

Per WORK interval, one `LogStep`:

| field | source | notes |
|---|---|---|
| `label` | `logSeed.steps[i].label` | the authored step text, frozen at connect |
| `targetSplit` | `ProgramInterval.targetSplit ?? undefined` | the frozen compile-time target |
| `seconds`/`meters` | `ProgramInterval.value` by `kind` | the authored duration |
| `actualSplit` | `IntervalActual.avgSplit`, only if `> 0` | stored unrounded; `0` means the wire had no reading; also omitted when `> MONITOR_SPLIT_MAX` (6000) — a wire-representable but server-band-exceeding reading drops the field, it never rejects the log (branch review Medium-1) |
| `actualSource` | `"pm5"` | present iff the interval HAS a matched actual (see pairing note) |
| `spm` | `IntervalActual.avgSpm` | omitted when outside `MONITOR_SPM_MIN..MONITOR_SPM_MAX` (0..99) — same drop-the-field rule as `actualSplit`/`avgHr` (branch review Medium-1) |
| `avgHr` | `IntervalActual.avgHeartRateBpm` | NEW optional field; omitted when null OR outside 20-254 (never rejects a save — adversarial m2) |
| `actualSeconds` | `IntervalActual.elapsedSeconds` | NEW, pm5-only, `>= 0` |
| `actualMeters` | `IntervalActual.distanceMeters` | NEW, pm5-only, `>= 0` |

**Pairing rule, loosened for pm5 only** (adversarial B3): the manual
contract pairs `actualSplit` with `actualSource`. A pm5 step carries
`actualSource: "pm5"` whenever a matched actual exists, even if
`avgSplit` was unusable — the verbatim fields are still measurements.
`logDraft.ts`'s pairing comment and the server rule both learn this.

**Matching** is by `IntervalActual.index` (already OUR normalized
0-based program index — the driver's `toProgramIndex`, D3) against the
program interval's position. The honest gaps all render as NO actual
(never `"assumed"`): never-reached (partials ruling), lost boundary
(D4), and `index: null` actuals are DROPPED (unattributable;
unsyncable; their diagnostic life is the wire log's). `MonitorRun`'s
header comment and the DEVIATIONS table each gain a line for the drop
(adversarial m10: the record's comment currently implies 7C would
surface them).

**Unit caveat, carried in code**: `IntervalActual.elapsedSeconds` maps
from 0x0037's Split/Interval Time under §10's documented scale; whether
that field is WORK time or work-plus-rest has never been read against a
stopwatch (adversarial m1). Stored under the documented meaning; §17
gains an open item; if hardware later says work-plus-rest, the seam
field is re-derived then (subtract `restSeconds`), in the builder, not
in storage.

**Effort-target intervals** keep their measured actual with no target —
a departure from 5G's effort semantics that gets its own DEVIATIONS row
(adversarial m6).

## 4. The screen: an explicit monitor mode

`handleConnectedEnded` navigates to `/library/:id/log?from=monitor`.
The MONITOR MODE engages only when ALL hold (adversarial M2 — the same
route is also the manual "Log it after" door, which must never be
hijacked by a stale record):

1. the `from=monitor` flag is present,
2. `loadMonitorRun()` returns a record with `completedAt !== null`,
3. its `workoutId` matches the route's workout,
4. `logSeed` exists and aligns with the program (§3).

Any miss falls through to today's manual form untouched. The flag
without the record (a reload after save, a stale URL) also falls
through — the flag is an intent, the record is the evidence, both are
required.

In monitor mode:

- The step list renders from `buildMonitorLogSteps`. TODAY'S step list
  has no inputs at all — actuals render behind an
  `actualSource === "stopwatch"` gate (`LogSession.tsx`, adversarial
  M3); that gate widens to `"stopwatch" | "pm5"` and the pm5 rows are
  text like every other row. No new read-only treatment is needed; the
  form was already read-only (the earlier "same visual weight" framing
  was designing against a form that didn't exist).
- PACES LOCKED renders from `logSeed.paces` (the manual recovery path
  cannot run here).
- One caption line, mono `--ink-3`, no em-dash:
  `FROM <deviceName> · N OF M INTERVALS MEASURED` (`ALL M ...` when
  complete). M counts WORK intervals only.
- Date and duration from the run's `startedAt`/`completedAt` stamps.
  (No totals surface exists on this screen; nothing is added —
  adversarial M5.)
- Pain and held-targets: editable, required, unchanged.
- A DISCARD control: the manual door has none (`discardSlot` is null
  there — adversarial M1), so the monitor mode supplies its own staged
  discard in the session door's idiom, whose fire clears the
  MonitorRun and navigates back to the detail. It is monitor-mode-only;
  the manual door stays storage-free and DEVIATIONS row 41's
  justification is AMENDED to name this mode as the exception
  (adversarial M7).

## 5. Record lifecycle

- **Save** (success only): `clearMonitorRun()` — also retiring the
  stale confirm panels between walks.
- **The monitor-mode discard** (§4): `clearMonitorRun()`.
- **Leaving any other way** (BackLink, tab bar, reload — adversarial
  m5): the record persists, exactly as today, and the existing
  unlogged-run staged confirms remain its safety net. No new
  destruction paths.
- A phone `SessionRun` coexisting changes nothing: the monitor mode
  reads and clears only its own record (the M-2 coexistence contract;
  adversarial m11 noted, behavior unchanged).

## 6. Server

`POST /api/logs` (`data.ts`) — `"pm5"` is ALREADY an admitted source
(adversarial M6); what actually changes:

- Steps admit optional `avgHr` (integer 20-254), `actualSeconds`
  (number `>= 0`), `actualMeters` (number `>= 0`) — each independently
  optional; `avgHr` never arrives out-of-band because the CLIENT omits
  it (§3), and the server band still rejects a hand-crafted liar.
- The pm5 pairing exception (§3): `actualSource: "pm5"` is valid
  without `actualSplit`; the existing paired-unit rule stays for
  `"stopwatch"`/`"assumed"`.
- The split band (today 30-600) and spm band (10-60) get a pm5-only
  widening: split `> 0 and <= 6000`, spm `0-99` — walk-4 hardware
  produced avgSpm 66 and splits past 600 on light rowing (adversarial
  B3); the manual bands do not move (a stopwatch 66 spm still rejects).
  These server bands now guard hand-crafted payloads only: the client
  (`buildMonitorLogSteps`) mirrors them as `MONITOR_SPLIT_MAX`/
  `MONITOR_SPM_MIN`/`MAX` and drops `actualSplit`/`spm` rather than
  posting a value its own server would 400 on (branch review Medium-1).
- The payload admits optional `deviceName` (string, 1-64 chars) —
  stored in a NEW NULLABLE COLUMN on the logs table via a drizzle
  migration (adversarial B4: `steps` is an array; the earlier "no
  migration" claim was impossible). Existing rows read back null;
  nothing backfills.
- The existing 200-step ceiling stands and is now stated (adversarial
  m9).

## 7. Testing

- Builder tests against WALK 4's record VALUES, in the repo as a
  fixture literal (adversarial m7): a 2×100 m distance program with
  rest, actuals for indexes 0 and 1 carrying the §18 entry's numbers;
  then the mutations — lost boundary, `index: null` dropped, early End
  (bare trailing steps), effort-with-actual, avgSplit 0 (source
  present, split absent), avgHr out-of-band (field omitted),
  missing/misaligned `logSeed` (mode disqualified).
- Spec-derivation rule ([[spec-blind-tests]]): the reviewer walks walk
  4's interval 0 from the wire numbers to the rendered row through THIS
  table, not the test file's vocabulary.
- Screen: each §4 condition engages/falls through independently
  (including flag-without-record and record-without-flag — the hijack
  case); the widened render gate shows pm5 splits; save posts `pm5`
  sources + verbatim fields + `deviceName`; save and the monitor
  discard each clear the record exactly once; the manual door with a
  stale record behaves byte-for-byte as today.
- Server: the pm5 pairing exception; the pm5-band widening admits
  walk-4's 66 spm while the manual bands reject it; the migration
  round-trips `deviceName` null and set.
- e2e: the connected walk extends through Save (the walk already ends
  on this form) asserting the stored log's sources; screenshots of the
  monitor-mode form, portrait + landscape.

## 8. Exit

A session fully driven by a connected PM5 saves a log whose work steps
carry real monitor splits (`actualSource: "pm5"`) plus the verbatim
wire numbers (split, work time, distance, stroke rate, heart rate) a
Concept2 Logbook sync could be assembled from without touching 7C
again; partials read honestly; the record's life ends at save or the
monitor discard; the manual door is bit-identical to today.
