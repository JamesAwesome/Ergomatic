# Just Row without the monitor (time only) — design

**Status: Gate 0 PASSED (rev 2e, James, 2026-09-02). Spec REV 2 after the
antagonist delta pass (2026-09-02, verdict BLOCK on rev 1's mechanism —
eleven findings, all folded in below and marked ⟨F#⟩); awaiting James's
read.** The product shape did not change; the mechanism did. Phase JR follow-on items 3 (unconnected
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
  storable today with no migration. HELD by the antagonist: the validator
  accepts `distanceMeters` absent (`data.ts:1512-1514` short-circuits on
  `undefined`), and `freeRow.integration.test.ts:86-106` already posts a
  body with neither number and gets 201. **`workoutTitle` is REQUIRED**
  (`data.ts:1369-1372`, non-empty string) — every shipping free-row body
  carries `"Just Row"` ⟨F2⟩.
- **Provenance is not a column.** The detail's meta word comes from
  `storedSummary.ts:272-276` `sourceLabel`: `deviceName` if present,
  else `TIMER` if any step carries `actualSource: "stopwatch"`, else
  `LOGGED BY HAND` — and `buildMeta:300` drops the time-of-day segment
  for `LOGGED BY HAND`. `summaryModel.ts` is the LIVE door's model and is
  not what the detail reads; rev 1 named the wrong module and claimed
  `timeSeconds` drives the word, which it never reads ⟨F3⟩. `session_logs`
  has no row-level source column (the `source` enum at `schema.ts:130` is
  the workouts table's).

## Mechanism

**Two stored-shape changes, both on `SessionRun` (localStorage), TRIAD.**
(a) `mode?: "justrow"` — the same word `MonitorRun.mode` already uses, so
one vocabulary names a free row on both records. No `v` bump, but
**validated, not loose**: `isSessionRun` gains the clause
`monitorRun.ts:489` already carries for the twin record
(`value.mode === undefined || value.mode === "justrow"`) — Phase JR PR 1's
own review found that declaring `mode?` and never checking it let
`mode: "corrupt"` load as a valid record ⟨F7⟩. (b) `PhaseActual.splitSeconds`
becomes OPTIONAL: a metre-less phase has no split, `NaN` is not a legal
value (it serialises to `null` and round-trips as a typed `number`), and
omitting it must be representable ⟨F5⟩. Every reader of `splitSeconds`
(`logDraft.ts:466` writes `actualSplit` from it) skips when undefined.
Alternatives rejected: `workoutId === null` as the marker (free today,
silent tomorrow — nothing prevents a future producer); a
`title === "Just Row"` check (a rower can name a workout that).

### Lifetime table (RF27)

| state | minted | cleared | survives teardown / relaunch | re-arm |
| --- | --- | --- | --- | --- |
| `SessionRun.mode = "justrow"` | `buildFreeRowRun(now)` at the door's Start Timer press, written by the existing `saveRun` | with the run, at EVERY `clearRun()` site (census ⟨F8⟩, `grep -rn "clearRun(" src`): `Timer.tsx:521` abandon; `LogSession.tsx:1257` and the Just Row log door's successful save; `useStagedDiscard.ts:84` discard; `useStartWorkout.ts:114` `confirmReplace`; `Countdown.tsx:376`; `WorkoutDetail.tsx:331`; `monitorRun.ts:737` via `createMonitorRun` (Connect) | yes — it IS the run, in localStorage under the existing key; every engine transition spreads `...run` (`engine.ts:170/179/192/203/220/229/243/278`, HELD by the antagonist) | n/a: a new Start Timer mints a new run through the coexistence guard |
| the run's `startedAt`/`phaseStartedAt` (the clock) | same call | same | yes (wall clock, not ticks — `engine.ts:104-110`) | n/a |
| the one `PhaseActual` (elapsed) | `handleConfirmFinish`'s finish branch (see piece 3) | with the run | yes | n/a |

**Which of those clear sites are GUARDED for a live Just Row** — the
table is only honest with this column ⟨F8⟩: Connect is (`connectGuardStage`,
`monitorRun.ts:1544-1550`, stages for any `SessionRun`, HELD). **`Start` on
any workout is NOT**: `useStartWorkout.ts:149` stages a replace-confirm
only for a COMPLETED run, and a live run is protected solely by the
started-DRAFT check at `:166` — a draft-less Just Row trips neither, so
Start reaches `confirmReplace()`'s unguarded `clearRun()` mid-row. This PR
extends that guard to stage for a live `SessionRun` too (the 6B F5
data-loss shape, closed at the guard rather than at one caller).

Invariant, not mechanism: **a Just Row timer run is one `SessionRun`
whose `mode` is `"justrow"`, `workoutId` is `null`, and whose single
phase is an open-ended `test`; no other `SessionRun` ever has `mode`**
(`MonitorRun` has its own, and `Today.tsx` reads both — the plan names
which record each branch holds). Every reader below branches on
`mode === "justrow"` and nothing else.

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
   navigate to `/session/run`. The Countdown is skipped: it exists to
   set targets, and there are none. Meta line: `NO TARGETS · NO PLAN`.
3. **Timer** (`Timer.tsx`), branches on `run.mode === "justrow"`:
   - **It renders at all** ⟨F1⟩: today `Timer.tsx:456` returns
     `<Navigate to="/today">` when `draft === null`, and `:478` reads the
     header name from `draft.title`. A draft-less run would bounce. The
     guard becomes `run === null || (draft === null && run.mode !== "justrow")`
     and the name is `run.mode === "justrow" ? run.title : draft.title`.
     (Minting a synthetic draft is rejected: `SessionDraft.type` is a
     required `WorkoutType`.)
   - The STEP slot reads `JUST ROW`; TARGET SPLIT reads `Free` (RATE
     already does for a test phase); the completion effect navigates to
     `/justrow/log` instead of `/session/log`; `AppRoutes.tsx:114-119`'s
     `CompleteRedirect` does the same for a completed Just Row ⟨F9⟩.
   - **The finish records the actual.** The shipped path is ▶ →
     `Finish this session?` → `Finish session`. A `test` phase has no
     `meters`, so `isDistance` is false (`Timer.tsx:481`,
     `domain/expand.ts:149`), ▶ stages `finishStaged`, and
     `handleConfirmFinish` takes its `else` branch, `apply(advance)`,
     which writes NO actual — that, not `applyDistanceActual` (unreachable
     here; rev 1 cited a doc comment), is why the shipped test-workout row
     read `LOGGED BY HAND` ⟨F4⟩. For a free row that branch records
     `{ elapsedSeconds, actualSource: "stopwatch" }` (no `splitSeconds`,
     per (b) above) before advancing.
   - **▶ freezes the clock** ⟨F10⟩: `handleNext` today only stages the
     confirm, so the whole deliberation over `Finish this session?` would
     bank into the row. The distance path already pauses for exactly this
     reason (`Timer.tsx:604-618`, review F3) and so does END
     (`:491-504`); a free row's ▶ pauses the run when it stages, and
     `Keep going` resumes it — the same pattern as `handleKeepGoing`.
     Pinned with a clock gap between ▶ and Finish.
4. **The log door** (`JustRowLog.tsx`) takes a second entry kind:
   `{ kind: "timer", run: SessionRun }` beside the monitor entry. Its
   seconds are the one actual's `elapsedSeconds`, derived AT THE DOOR;
   `freeRowTotals` is `(run: MonitorRun)` and is not touched ⟨F6⟩ — no
   connected-path file changes for this piece. The card renders TIME
   alone; the meta line is the door's own hand-rolled line
   (`JustRowLog.tsx:131-137`, date · `deviceName`) with `TIMER` in the
   device slot. Posted body: `{ workoutId: null, workoutType: null,
   workoutTitle: "Just Row", steps: [], timeSeconds, advancesPlan: false,
   pain, notes }` ⟨F2⟩ — no `distanceMeters`, no `avgSplitSeconds`, no
   machine fields. Save disabled only when there is no actual (the run
   never finished). On success: `clearRun()`, then the shipped post-save
   navigation.
5. **Today**: the existing completed-but-unlogged `SessionRun` line's
   `Log it` routes to `/justrow/log` when `run.mode === "justrow"`; the
   live-run affordance is unchanged (it already resumes the Timer).
6. **Reading it back.** History: `LogRow.heroSnippet` already returns `""`
   with no avg and no distance — title and date only, by construction.
   Detail: `SummaryHeroesBlock` already renders TIME alone when only
   `time` is defined. **Provenance** ⟨F3, F11⟩: `storedSummary.ts`'s
   `sourceLabel` gains one clause between the device check and the
   stopwatch-step check: `isFreeRow(row.workoutId, row.workoutType) &&
   row.steps.length === 0 && row.deviceName === null` ⇒ `TIMER`, which
   also restores the time-of-day segment. **This is a closed-world rule,
   stated as such:** a free row has exactly two producers — the connected
   Just Row door, which always stores a `deviceName` (`MonitorRun.deviceName`
   is non-null, `monitorRun.ts:167`; the server requires 1–64 chars,
   `data.ts:1481-1486`) — and this phone timer. The Just Row door offers no
   `Log it after`, so no hand-logged free row exists, and follow-on item 5
   (substitution) reuses these same two producers. The rule's false
   positive is named: **a future manual free-row door would read `TIMER`
   unless it stores its provenance** — the predicate carries that sentence
   as a tripwire comment, and the alternative (posting one stopwatch
   `LogStep`) was rejected because it would put an INTERVALS table on the
   detail the approved board does not show and break the parent's
   `steps: []` shape. Pinned RF24-style: the test starts at the door and
   asserts `SEP · hh:mm · TIMER` at the detail.
7. **The JR chip** — a new `FreeRowChip` component with its own class
   (`free-row-chip`), NEVER `.type-badge` (exit criterion 2's structural
   pin stays true: no `.type-badge` for a free row). Rendered where
   `isFreeRow(workoutId, workoutType)` holds — the PAIR, per PR 1's
   ruling — on `LogRow` (History and Today's rows) and on the Just Row
   door's badge row. `TypeBadge` is untouched. Derived, never stored:
   `"JR"` can never live in `workout_type`.

## What does NOT change

- No server change, no migration. The connected Just Row's behaviour is
  untouched; its files are (`JustRow.tsx` gains the second action,
  `JustRowLog.tsx` the second entry kind).
- No wake lock, no background mode, no distance entry.
- `advancesPlan` stays `false`; item 5 (substitution) is its own PR.
- v0.32.0's notes said "connect to the erg" and "no type chip, on
  purpose"; the next notes entry acknowledges both reversals in one
  sentence each (PM close ruling, 2026-09-01).

## Exit criteria (frozen at spec approval)

1. Door → Start Timer → ▶ → Finish session → Save this row posts a body
   with `timeSeconds` equal to the clock at the ▶ press (independent
   literal; a 30 s gap between ▶ and Finish under fake timers does NOT
   move it ⟨F10⟩), `workoutTitle: "Just Row"`, `steps: []`, both ids null,
   `advancesPlan: false`, and NO `distanceMeters` key — one test starting
   at the door (RF24).
2. `plan_state.done_n` unchanged across that save (rides the existing
   integration test's shape with a time-only body).
3. The saved row's detail reads `TIMER` in its meta line and renders TIME
   alone — no AVG SPLIT, no DISTANCE, no INTERVALS, no machine block.
4. History renders the row with no second line and a `.free-row-chip`,
   and no `.type-badge` (criterion 2 of the parent spec, still true).
5. Backgrounding: a run whose `phaseStartedAt` is 10 minutes in the past
   renders `10:00`+ on mount with zero ticks — the wall-clock invariant,
   pinned with `vi.setSystemTime`.
6. Coexistence, both directions: Start Timer over an unlogged run stages
   the shipped confirm and, cancelled, leaves the record byte-identical;
   AND Start on any library workout over a LIVE Just Row stages a
   confirm rather than clearing it ⟨F8⟩ — a mutation deleting the new
   guard clause must go red.
7. `mode` lifetime: abandon, discard and a successful save each leave no
   run; relaunch mid-row (reload with the key present) resumes the same
   clock; `isSessionRun` rejects `mode: "corrupt"` ⟨F7⟩.
8. Every string on the shipped boards appears verbatim in the rendered
   screens (`STEP` slot `JUST ROW`, `Free`, `UP NEXT · FINISH`,
   `Finish this session?`, `SEP · TIMER`, `Save this row`).

## PR shape

One PR, TRIAD (two `SessionRun` stored-shape changes). The antagonist's
delta pass ran on rev 1 (BLOCK; every finding folded here — the ledger
entry rides this branch); the plan follows James's read of rev 2, then
implementation, then the PM final-PR gate. Fast path does not apply
(stored shapes; roughly eleven product files: `run.ts`, `engine.ts`,
`Timer.tsx`, `JustRow.tsx`, `JustRowLog.tsx`, `Today.tsx`,
`storedSummary.ts`, `LogRow.tsx`, `useStartWorkout.ts`, `AppRoutes.tsx`,
a new `FreeRowChip.tsx`). Capture note for the plan: a History row that
carries BOTH a hero snippet and the chip is a new fifth flex child on
`.today-log-row` (`LogRow.tsx:189-199`'s wrap comment) — `pnpm screenshots`
on that row.
