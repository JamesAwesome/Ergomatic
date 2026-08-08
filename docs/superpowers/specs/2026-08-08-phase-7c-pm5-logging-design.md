# Phase 7C — PM5 logging (design)

**Date:** 2026-08-08 · **Authority:** ROADMAP §Phase 7C; the `MonitorRun`
record Phase 7B writes (`app/src/monitor/monitorRun.ts`); the 6C log
split (`logDraft.ts` builders + `LogSession.tsx` as the one save path).
**Product rulings (James, 2026-08-08):** partials log what the erg saw;
PM5 splits are read-only on the form; HR is stored, not shown; the seam
must not foreclose a future Concept2 Logbook sync.

## 1. Goal and shape

A session fully driven by a connected PM5 saves a log indistinguishable
in shape from a phone-timer session, with real monitor-measured splits
(`actualSource: "pm5"` — the third member `ActualSource` has typed since
6C and nothing has ever produced). One save path: the existing
`LogSession` form, prefilled by a new monitor-side builder, mirroring
the manual builder exactly the way ROADMAP's own bullet frames it.

NON-GOALS: no Concept2 Logbook sync (only its raw material — §5); no HR
UI anywhere; no changes to the phone-timer path's builders or payloads;
no reconnect/backfill (7B's descope stands).

## 2. The builder: `buildMonitorLogSteps`

New builder in `logDraft.ts` beside `buildLogSteps`/`buildManualLogSteps`,
same `LogStep[]` output:

`buildMonitorLogSteps(run: MonitorRun, phases: EnginePhase[]): LogStep[]`

Per program interval, matched to its authored step via the program's own
order (the program was compiled FROM these phases; `originalIndex` is the
carried key):

| LogStep field | Source | Notes |
|---|---|---|
| `label` | the authored step, house format | identical to the manual builder's text |
| `targetSplit` | `ProgramInterval.targetSplit` | the FROZEN compile-time target, null for effort/warmup |
| `actualSplit` | `IntervalActual.avgSplit` | verbatim seconds, no display rounding |
| `actualSource` | `"pm5"` | only when a matched actual exists |
| `spm` | `IntervalActual.avgSpm` | |
| `meters` / `seconds` | the authored duration | unchanged from the manual builder |
| `avgHr` | `IntervalActual.avgHeartRateBpm` | NEW optional `LogStep` field; written only by this builder ("store it, show nothing") |
| `actualSeconds` | `IntervalActual.elapsedSeconds` | NEW optional field, pm5-only: the interval's own MEASURED work time, verbatim (the manual path never has one) |
| `actualMeters` | `IntervalActual.distanceMeters` | NEW optional field, pm5-only: the interval's own MEASURED distance, verbatim |

**The three honest gaps, all rendered as NO actual** (no `actualSplit`,
no `actualSource`, never `"assumed"`):

1. **Never reached** — the run ended (either side) before this interval:
   partials log what the erg saw.
2. **Lost boundary** — `run.actuals` shorter than the program with no
   entry for this index (the D4 class the record's own header documents).
3. **Unmatched index** — an actual with `index: null` (the D3 case)
   matches NO step and is DROPPED from the log entirely: it cannot be
   attributed to an interval, so no sync could ever submit it either;
   its diagnostic life is the wire log's, not the database's. Matching
   is by `IntervalActual.index` against the program interval's
   position — never by array position (the record's own comment,
   verbatim constraint).

Rest rows render from the program's folded `restSeconds`, house format,
no actuals — identical to the manual builder's rest treatment.

Effort-target intervals (`targetSplit: null` on the wire) still get
their PM5 actual: the machine measured a split even when the app set no
target; the row shows the actual with no target, exactly what the
connected surface's own grid did live.

## 3. The screen: one form, a monitor branch

`LogSession` (route `/library/:id/log`, where every connected session
already lands) engages the monitor branch when ALL of:
`loadMonitorRun()` returns a record, `completedAt !== null`, and
`workoutId` matches the route's workout. Any miss falls through to
today's manual form untouched (the existing workoutId-mismatch residual
test becomes load-bearing and is extended, not replaced).

In the monitor branch:

- Steps come from `buildMonitorLogSteps`; rows with a PM5 actual are
  READ-ONLY (ruling 2) — rendered as values, not inputs, with the same
  visual weight the manual rows have so the form does not read as
  broken. Rows with no actual show the dash placeholder.
- One caption line in the diagnostics vocabulary, under the step list:
  `FROM <deviceName> · N OF M INTERVALS MEASURED` (mono, `--ink-3`,
  no em-dash anywhere in any new copy — house rule). When N = M the
  count reads `ALL M INTERVALS MEASURED`.
- Date and duration come from the run: `formatLogDate(completedAt)`,
  duration from `startedAt → completedAt` wall span, both replacing the
  manual path's estimates. Totals (meters) sum the actuals' verbatim
  `distanceMeters`.
- Pain and held-targets stay exactly as they are: editable, required,
  the reason this form exists.
- A `terminated` run gets no special chrome beyond what the gaps already
  say (ruling 1's "the early end is visible in the missing actuals").

## 4. Record lifecycle

- **Save** (success only): `clearMonitorRun()`. This also retires the
  standing annoyance where a saved session still triggers Connect/Start
  confirm panels (walks 2-4).
- **Discard without logging**: `clearMonitorRun()` too — the existing
  discard control, same confirm it has today.
- Nothing else writes or clears the record; 7B's guards and the
  unlogged-run staged confirms behave exactly as before for a record
  that has not reached one of those two doors.

## 5. The Concept2 seam: verbatim fields, no sidecar

(Revised at spec review, James: "I wouldn't want it long term if it's
only needed for concept 2 logbook, I wanna be mindful of how much we
put in the db.")

A Concept2 Logbook submission needs, per interval: time, distance,
split, stroke rate, heart rate. The display steps already carry three
(`actualSplit`, `spm`, `avgHr`); §2 adds the other two as verbatim
pm5-only step fields (`actualSeconds`, `actualMeters`). The session
itself carries ONE new optional string, `deviceName`, as provenance.
Total database cost: two or three numbers per PM5 step and one string
per PM5 session, inside the existing steps JSON — no sidecar, no full
record, nothing retained that only a sync would read.

Seam rules:

- The future sync's predicate is `actualSource === "pm5"` on a step;
  its payload is assembled from the step fields alone.
- Nothing display-rounds the verbatim fields: `actualSplit`,
  `actualSeconds`, `actualMeters` are stored exactly as
  `IntervalActual` carried them; only RENDERING formats them.
- Anything richer the driver ever learns to capture (drag factor,
  stroke data) is added as another verbatim step field WHEN a consumer
  exists — never hoarded in advance.
- Dropped, deliberately: orphaned `index: null` actuals (unsyncable,
  diagnostic-grade — the wire log is their home), arrival order, and a
  stored `terminated` flag (a partial session is already visible as
  steps with no actual).

## 6. Server

`POST /api/logs` (`server/routes/data.ts`) validation grows, additively:
`actualSource` admits `"pm5"`; steps admit optional `avgHr` (an integer
in 30-250, the belt-plausible band; anything else rejects the payload),
`actualSeconds` (positive number), and `actualMeters` (positive
number); the payload admits an optional `deviceName` string (length
1-64). Stored in the logs' existing JSON persistence — no migration for
existing rows; absent fields stay absent. Reads return whatever was
stored (the existing behavior for unknown-to-the-UI fields).

## 7. Testing

- The builder is tested against WALK 4's real record shape (2×100 m,
  both actuals present, machine numbering already normalized) and its
  mutations: a lost boundary (delete one actual), a null index (dropped
  entirely, absent from steps), an early End (trailing steps bare),
  an effort-target interval (actual without target).
- Spec-derivation rule (the [[spec-blind-tests]] lesson): the builder's
  reviewer walks one concrete example from THIS table — walk 4's
  interval 0 (`avgSplit` from the wire) — through to the rendered row,
  not through the test file's own vocabulary.
- Screen tests: monitor branch engages/falls through on each §3
  condition; read-only rows expose no inputs (a11y: they are text, not
  disabled controls); save payload carries `pm5` sources, `avgHr`, the
  verbatim `actualSeconds`/`actualMeters`, and `deviceName`; save and
  discard each clear the record exactly once.
- Server: accepts the grown payload; rejects an out-of-band `avgHr` and
  a non-positive verbatim field; round-trips everything stored.
- e2e: the existing connected walk extends through Save with a
  seeded-workout assertion on the stored log's sources (the walk already
  ends on this form) — plus the screenshot pair for the prefilled form,
  portrait and landscape.

## 8. Exit

A session fully driven by a connected PM5 saves a log whose steps carry
real monitor splits (`actualSource: "pm5"`), whose partial honesty
matches ruling 1, whose record lifecycle closes at save/discard, and
whose PM5 steps carry the verbatim wire numbers (split, work time,
distance, stroke rate, heart rate) a Concept2 Logbook sync could be
assembled from without touching 7C's code again — at a database cost of
a few numbers per step and one provenance string per session.
