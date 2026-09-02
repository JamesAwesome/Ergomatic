# Just Row without the monitor (time only) — design

**Status: Gate 0 PASSED (rev 2e, James, 2026-09-02). Spec rev 1, awaiting the
antagonist pass and James's read.** Phase JR follow-on items 3 (unconnected
mode) and 4 (the JR chip), built together as one PR.
Handoff: `docs/design/handoffs/2026-09-02-just-row-unconnected/` (boards,
the mechanical reference captures, contrast table).

## What and why

A tester asked for a Just Row that works with no erg link: an infinite
timer and the ability to log. A rower whose Bluetooth fails, or who has
no PM5 at all, can still time a row on the phone and keep it. The app
writes exactly one number it can vouch for — elapsed time from the wall
clock — and nothing else: no distance, no average split, no
machine-confirmation block. James's rulings (2026-09-02): **time only**,
distance is never typed and never fabricated; the door's action is the
workout detail's own `Start Timer`; every label is the shipped screen's.

The JR chip rides along because a plan-visible free row (follow-on item 5,
later) lands in lists with a null type, and James wants free rows marked
like the other kinds. It is a **hollow** chip — the CUSTOM tag's
treatment — because every filled chip is an intensity and a free row has
none.

## Rulings recorded

1. Time only. No distance field, typed or derived. (James, 2026-09-02.)
2. Door action: `Start Timer`, the workout detail's own second action, in
   its shipped slot under Connect. Meta line drops `NEEDS THE MONITOR`.
3. Mechanical copy: every label on the boards is lifted from a captured
   shipped screen (handoff README table). Two words change on the Timer:
   the STEP slot reads `JUST ROW`, TARGET SPLIT reads `Free`.
4. JR chip: hollow (`.workout-row-custom` treatment) in TypeBadge's
   geometry, on the door's badge row and History rows; not on the detail
   or the log door, where no row shows a chip. (Rev 2c → 2e, James: "not
   to conflict with TR" — `--type-tr` is literally `var(--ink)`.)

## Research (RF18 checked: `ls docs/superpowers/research/`, grep ROADMAP)

- **Does the system have the concept?** Yes: a wall clock. `Timer.tsx`
  computes elapsed from `phaseStartedAt` timestamps and repaints on
  `visibilitychange` (`Timer.tsx:419-423`), so a locked or backgrounded
  phone loses nothing when the view returns — PRIMARY, our own code.
  WebKit suspends the WebContent process when the view leaves the
  foreground (`docs/superpowers/research/2026-08-20-ble-connection-management.md`
  §"process throttler", SECONDARY) — which is exactly why the clock is
  timestamp-based and not tick-counted. No wake lock: the shipped Timer
  holds none (`grep -rl keepAwake src` → JustRow.tsx and adapters only).
- **The count-up already exists.** `bigNumberSeconds` returns
  `elapsedSeconds` for a phase with no `seconds` (`Timer.tsx:104-114`); a
  `Step { k: "test" }` produces such a phase; `Timer.test.tsx` pins it.
  Captured through the real app on 2026-09-02
  (handoff `mechanical-reference/3-timer.png`).
- **Storage.** `session_logs.distance_meters` and `time_seconds` are both
  nullable (`server/db/schema.ts:229-230`); the free-row validator keys on
  `isFreeRow(workoutId, workoutType)` for the empty-`steps` allowance and
  the plan refusal (`data.ts:1630`, `:1396`). A time-only free row is
  storable today with no migration. INFERENCE to verify in the plan: the
  validator accepts `distanceMeters` absent on a free row (its check at
  `data.ts:1528` is `!== undefined && !== null` guarded, i.e. optional).

## Mechanism

**One new stored field, on `SessionRun` (localStorage), TRIAD.**
`mode?: "justrow"` — the same word `MonitorRun.mode` already uses, so one
vocabulary names a free row on both records. Expand-only record, loose
`isSessionRun`, no `v` bump. Alternatives rejected: `workoutId === null`
as the marker (free today, silent tomorrow — nothing prevents a future
producer); a `title === "Just Row"` check (a rower can name a workout
that).

### Lifetime table (RF27)

| state | minted | cleared | survives teardown / relaunch | re-arm |
| --- | --- | --- | --- | --- |
| `SessionRun.mode = "justrow"` | `buildFreeRowRun(now)` at the door's Start Timer press, written by the existing `saveRun` | with the run: `clearRun()` (abandon, discard, or the log door's successful save) | yes — it IS the run, in localStorage under the existing key | n/a: a new Start Timer mints a new run through the existing coexistence guard |
| the run's `startedAt`/`phaseStartedAt` (the clock) | same call | same | yes (wall clock, not ticks) | n/a |

Invariant, not mechanism: **a Just Row timer run is one `SessionRun`
whose `mode` is `"justrow"`, `workoutId` is `null`, and whose single
phase is an open-ended `test`; nothing else ever has `mode`.** Every
reader below branches on `mode === "justrow"` and nothing else.

### Pieces

1. **`buildFreeRowRun(now: Date): SessionRun`** beside `buildRun` in
   `session/engine.ts`: `{ v: 1, mode: "justrow", workoutId: null,
   title: "Just Row", phases: [one test phase, label "Just Row"], index: 0,
   phaseStartedAt: now, pausedAt: null, pausedTotalMs: 0, actuals: {},
   startedAt: now, completedAt: null }`. Built directly — no synthetic
   `SessionDraft` (its `type: WorkoutType` is required and a free row has
   none).
2. **The door** (`JustRow.tsx`): `Start Timer` under Connect, through the
   SAME staged coexistence guard Connect uses (an unlogged run gets the
   confirm). On proceed: `saveRun(buildFreeRowRun(new Date()))` then
   navigate to the Timer route. The Countdown is skipped: it exists to
   set targets, and there are none. Meta line: `NO TARGETS · NO PLAN`.
3. **Timer** (`Timer.tsx`), three branches on `run.mode === "justrow"`:
   the STEP slot reads `JUST ROW`; TARGET SPLIT reads `Free` (RATE already
   does for a test phase); the completion effect navigates to
   `/justrow/log` instead of `/session/log`. The finish path is the
   shipped one (▶ → `Finish this session?` → `Finish session`), and it
   MUST record the phase's stopwatch actual: today `applyDistanceActual`
   returns early with no metres (`Timer.tsx:575-578`), which is why the
   shipped test-workout row read `LOGGED BY HAND` in its detail
   (`mechanical-reference/9-detail.png`). For a free row the actual is
   `{ elapsedSeconds, splitSeconds: NaN → omitted, actualSource:
   "stopwatch" }` — the plan decides the exact shape against
   `PhaseActual`'s type; the invariant is that `elapsedSeconds` reaches
   the run.
4. **The log door** (`JustRowLog.tsx`) takes a second entry kind:
   `{ kind: "timer", run: SessionRun }` beside the monitor entry. Totals
   for it are `{ seconds: elapsedSeconds of the one actual, meters: null }`
   — `freeRowTotals` widens its `meters` to `number | null` and every
   consumer (Today's copy, the ended frame's `kept`) handles null by
   omitting the metres clause. The card renders TIME alone; meta line
   `SEP 2 · TIMER`. Posted body: `{ workoutId: null, workoutType: null,
   steps: [], timeSeconds, advancesPlan: false, pain, notes }` — no
   `distanceMeters`, no `avgSplitSeconds`, no machine fields. Save
   disabled only when there is no actual (the run never finished).
   On success: `clearRun()`, then the shipped post-save navigation.
5. **Today**: the existing completed-but-unlogged `SessionRun` line's
   `Log it` routes to `/justrow/log` when `run.mode === "justrow"`; the
   live-run affordance is unchanged (it already resumes the Timer).
6. **Reading it back.** History: `LogRow.heroSnippet` already returns `""`
   with no avg and no distance — title and date only, by construction.
   Detail: `SummaryHeroesBlock` already renders TIME alone when only
   `time` is defined. Provenance word: the detail must read `TIMER`, so
   `summaryModel`'s provenance predicate must classify a row with
   `timeSeconds` and no steps as timer-sourced — the plan reads that
   predicate and pins it with the row this PR produces (RF24: the test
   starts at the door and asserts at the detail).
7. **The JR chip** — a new `FreeRowChip` component with its own class
   (`free-row-chip`), NEVER `.type-badge` (exit criterion 2's structural
   pin stays true: no `.type-badge` for a free row). Rendered where
   `isFreeRow(workoutId, workoutType)` holds — the PAIR, per PR 1's
   ruling — on `LogRow` (History and Today's rows) and on the Just Row
   door's badge row. `TypeBadge` is untouched. Derived, never stored:
   `"JR"` can never live in `workout_type`.

## What does NOT change

- No server change, no migration. The connected Just Row is untouched.
- No wake lock, no background mode, no distance entry.
- `advancesPlan` stays `false`; item 5 (substitution) is its own PR.
- v0.32.0's notes said "connect to the erg" and "no type chip, on
  purpose"; the next notes entry acknowledges both reversals in one
  sentence each (PM close ruling, 2026-09-01).

## Exit criteria (frozen at spec approval)

1. Door → Start Timer → ▶ → Finish session → Save this row posts a body
   with `timeSeconds` equal to the run's elapsed (independent literal,
   within 1 s), `steps: []`, both ids null, `advancesPlan: false`, and NO
   `distanceMeters` key — one test starting at the door (RF24).
2. `plan_state.done_n` unchanged across that save (rides the existing
   integration test's shape with a time-only body).
3. The saved row's detail reads `TIMER` in its meta line and renders TIME
   alone — no AVG SPLIT, no DISTANCE, no INTERVALS, no machine block.
4. History renders the row with no second line and a `.free-row-chip`,
   and no `.type-badge` (criterion 2 of the parent spec, still true).
5. Backgrounding: a run whose `phaseStartedAt` is 10 minutes in the past
   renders `10:00`+ on mount with zero ticks — the wall-clock invariant,
   pinned with `vi.setSystemTime`.
6. Coexistence: Start Timer over an unlogged run stages the shipped
   confirm and, cancelled, leaves the record byte-identical.
7. `mode` lifetime: abandon, discard and a successful save each leave no
   run; relaunch mid-row (reload with the key present) resumes the same
   clock.
8. Every string on the shipped boards appears verbatim in the rendered
   screens (`STEP` slot `JUST ROW`, `Free`, `UP NEXT · FINISH`,
   `Finish this session?`, `SEP · TIMER`, `Save this row`).

## PR shape

One PR, TRIAD (the `SessionRun.mode` stored field): antagonist pass on
this spec (delta against Phase JR's vetted ground — new: the stored field
and its lifetime, the Timer finish for a metre-less phase, the provenance
predicate), then the plan, then implementation, then the PM final-PR
gate. Fast path does not apply (stored shape; two product files).
