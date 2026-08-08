# Phase 7C — PM5 logging design spec, adversarial review

**Date:** 2026-08-08 · **Subject:**
`docs/superpowers/specs/2026-08-08-phase-7c-pm5-logging-design.md` ·
**Scope:** the spec against the code it claims to build on, the hardware
record, `docs/design/DEVIATIONS.md`, and ROADMAP §7C. Read-only on code;
every finding cites file:line.

**Verdict: SOUND AFTER EDITS — but the edits are not small.** The
product shape (one form, a monitor branch, partials log what the erg saw,
verbatim seam fields, no sidecar) survives every attack. The MAPPING does
not: §2 rests on a key that does not exist on the record, and on an
interval numbering that is off by one warmup for 300 of the 300 seeded
workouts. §5/§6's storage story is impossible as written. Four BLOCKING,
eight MAJOR, eleven MINOR.

---

## BLOCKING

### B1 — `buildMonitorLogSteps(run, phases)` has no source for `phases`, and `originalIndex` is not on the record

**Spec (§2):** "Per program interval, matched to its authored step via the
program's own order (the program was compiled FROM these phases;
`originalIndex` is the carried key)" — signature
`buildMonitorLogSteps(run: MonitorRun, phases: EnginePhase[]): LogStep[]`.

**Code:** `originalIndex` lives on `CompiledPhase` — the compiler's INPUT
(`app/domain/monitor/program.ts:60-72`) — and is explicitly not carried
into the output: `compileProgram` "never reads this field"
(`program.ts:69-71`), and `ProgramInterval`
(`app/domain/monitor/program.ts:74-110`) is `{kind, value, targetSplit,
displaySpm, restSeconds}`. No `originalIndex`, no `type`, no back-
reference of any kind. `MonitorRun` (`app/src/monitor/monitorRun.ts:40-67`)
stores `program`, `actuals`, `workoutId`, `title`, `deviceName`,
`startedAt`, `completedAt`, `terminated` — **no phases**.

Worse, the phases the program was compiled from are ephemeral. The connect
path builds them in memory and never persists them:
`WorkoutDetail.handleConnectProceed` does `buildNudgedDraft(workout,
nudges)` → `buildRun(draft, baselines, …)` → `compileProgram(run.phases)`
(`app/src/workout/WorkoutDetail.tsx:392-394`) with **no `saveDraft`, no
`saveRun`** (contrast `handleRowInstead`, `:428`, which does save). By the
time `handleConnectedEnded` navigates to `/library/:id/log`
(`WorkoutDetail.tsx:445-448`) the phases, the draft, and the confirm-time
`nudges` (a `useState` on `WorkoutDetail`) are gone.

So the log screen can supply `phases` only by RE-DERIVING them from
`workout.steps` at CURRENT baselines — which silently drops every nudge
(the connected session was programmed at nudged targets, `:392`) and moves
with any baseline edit. That is the exact class of defect
`logDraft.ts:161-172`'s `withEffectiveOff` comment exists to prevent
("label, the PACES LOCKED reconstruction, and the stored split mutually
consistent").

**Proposed change:** §2 must name where the authored-step key comes from,
and it has to be one of:

- (a) **Widen the record** — `MonitorRun` gains a `steps: LogStepSeed[]`
  or `phases: CompiledPhase[]` frozen at `createMonitorRun` time, written
  once alongside `program`, so the log screen reads the SAME phases that
  were compiled and nudged. This is an additive field on a `v: 1` record
  (`isMonitorRun`, `monitorRun.ts:81-96`, validates only the fields readers
  destructure, so an older record simply lacks it → falls through to the
  manual form). Preferred: it is the only option that keeps nudges.
- (b) Re-derive and ACCEPT the drift, stated in the spec as a known
  deviation with a DEVIATIONS row.

Either way, delete "`originalIndex` is the carried key" — it is false at
the `ProgramInterval` level.

### B2 — Warmups ARE program intervals; `LogStep`s are never warmups. §2 double-counts, and the actual index is off by one for 300/300 seeded workouts

**Spec (§2):** "Per program interval, matched to its authored step" …
"`targetSplit` | `ProgramInterval.targetSplit` | the FROZEN compile-time
target, null for effort/warmup" — i.e. the table contemplates a warmup ROW.

**Code:** `compileProgram` pushes an interval for EVERY non-rest phase,
warmup included (`program.ts:467`; the "no-work" error's own wording,
`:472-475`, and the `phases()` `case "wu"` → `type: "warmup"`,
`app/domain/expand.ts:127-135`). `IntervalActual.index` is normalized
against that program's length (`toActualIndex`, cited in
`app/domain/monitor/types.ts:100-126` and `DEVIATIONS.md:168`), so
`index: 0` is the WARMUP for any workout that has one.

Meanwhile `logDraft.ts`'s pinned reading is unambiguous: "Warm-up and rest
phases never become a `LogStep`" (`app/src/session/logDraft.ts:33-35`),
enforced by `if (phase.type !== "work") return` (`:270`) and `if (step.k
!== "w") continue` (`:392`).

**This is not an edge case.** Every one of the 300 seeded workouts opens
with a warmup: `grep -c 'k: "wu"' app/server/seed/library/*.ts` returns
60/75/90/75 = 300, one per workout, and each is `steps[0]`
(e.g. `app/server/seed/library/o2.ts:22-23`). So a builder that walks
program intervals 1:1 into `LogStep`s either (i) emits a warmup row no
manual log has ever had — breaking §1's "indistinguishable in shape" — or
(ii) attributes actual `index: 1` (the first WORK interval) to
`LogStep[1]` (the SECOND work step), shifting every actual one row early,
for the entire library.

**Proposed change:** §2 states the algorithm explicitly: walk the PHASES;
maintain a program-interval counter that increments on every NON-REST
phase (warmup, work, test) exactly as `compileProgram` does; emit a
`LogStep` only for `work`/`test` phases (the manual builder's rule,
unchanged); join `actuals` by `IntervalActual.index === thatCounter`,
never by `LogStep` position and never by `actuals` array position. Add:
"a warmup interval's actual is DISCARDED — a warmup was never a logged
step on either existing door." Pin it with a fixture whose workout has a
warmup (i.e. any real library workout), because a warmup-free fixture
passes a broken builder.

### B3 — Real PM5 `avgSpm`/`avgSplit` fall OUTSIDE the server bands the spec never touches: the whole save 400s, and CI cannot see it

**Spec (§2):** `actualSplit` ← `IntervalActual.avgSplit`, `spm` ←
`IntervalActual.avgSpm`, "verbatim … no display rounding". **Spec (§6)**
grows validation only for `avgHr`, `actualSeconds`, `actualMeters`,
`deviceName`.

**Code:** `validateLogStepEntry` already enforces, on the EXISTING fields:
`actualSplit` must be a number **30..600** (`app/server/routes/data.ts:141-146`)
and `spm` must be an **integer 10..60** (`:156-161`). A single bad step
`badRequest`s the whole payload (`:462-470`) — the rower loses the log, and
`useLogForm`'s only retry policy is the `workoutId` one
(`app/src/session/LogSession.tsx:336-346`), which will not fire.

**The hardware record breaks both bands.** From the committed captures
(`docs/monitor/sessions/pm5-session3-final.log.gz`, decoded
`intervalComplete` events):

| line | avgSplit | avgSpm | verdict |
|---|---|---|---|
| 417 | 163 | 26 | ok |
| 2294 | 340.9 | **57** | ok / ok |
| 2474 | 365.8 | **13** | ok |
| 2836 | **405.4** | **66** | spm > 60 → 400 |
| 1034 | **1200** | **4** | both out of band |
| 1729 | **882.3** | 19 | split > 600 |
| 1127 | **3785.6** | **0** | both out of band |

A 405 s/500m split with a 66 spm reading is a real thing this machine
emits at low load. CI cannot catch it: the e2e fake scripts
`avgSplit: 112, avgSpm: 24` (`app/e2e/connected.spec.ts:186-187`) and
`design.spec.ts:3680`, comfortably inside both bands. **Green suite,
broken hardware** — the exact failure mode walks 1-4 kept producing.

Compounding it: `IntervalActual.avgSplit` and `avgSpm` are
`number | null` (`app/domain/monitor/types.ts:129-130`). A matched actual
with `avgSplit: null` plus `actualSource: "pm5"` violates the server's
paired-unit rule ("actualSplit and actualSource must both be present or
both be absent", `data.ts:133-140`) → 400.

**Proposed change:** §2 and §6 both grow a REJECTION-FREE mapping rule,
stated as such:

- `actualSplit`/`actualSource` are written **only** when `avgSplit` is a
  number AND inside the server's 30..600 band; otherwise the row is a
  fourth honest gap (no actual, no source) — same rendering as §2's three.
- `spm` is written only when `avgSpm` is an integer in 10..60; otherwise
  OMITTED (the field is optional — omitting it costs a display line, not
  the save).
- §6 states the principle: **an out-of-band monitor number drops its own
  field; it never rejects the rower's log.** Apply the same rule to the
  new fields (see m2/m3).
- §7 adds a test whose fixture is walk-shaped, not e2e-shaped: an actual
  carrying `avgSplit: 405.4, avgSpm: 66` (real, from the capture above)
  must save successfully with those two fields dropped.

Alternative considered and rejected here: widening the server bands. They
protect against the phone door's own garbage too, and `spm > 60` from a
PM5 is a measurement artifact, not a rowing rate worth persisting.

### B4 — `deviceName` has nowhere to go: §5 says "inside the existing steps JSON", §6 says "no migration". Both cannot be true

**Spec (§5):** "The session itself carries ONE new optional string,
`deviceName`, as provenance. Total database cost: two or three numbers per
PM5 step and one string per PM5 session, **inside the existing steps
JSON**." **Spec (§6):** "the payload admits an optional `deviceName`
string (length 1-64). Stored in the logs' existing JSON persistence — **no
migration**."

**Code:** `session_logs` (`app/server/db/schema.ts:90-116`) is
`{id, userId, workoutId, workoutTitle, workoutType, loggedAt, baselineK2,
baselineK6, held, pain, notes, steps}`. `steps` is `jsonb` and is an
ARRAY of `LogStep` (`app/server/stores/logs.ts:19-26`); `LogInput`
(`:28-47`) has no free-form session JSON, and `create` inserts an explicit
column list (`:80-93`). There is **no session-level JSON column**. A
session-scoped string therefore needs either a new column (a real drizzle
migration — `app/drizzle/0000..0004` are the existing ones) or duplication
onto every PM5 step, which contradicts §5's own "mindful of how much we
put in the db" ruling that produced the section.

**Proposed change:** §5/§6 pick one and say so:

- (a) `device_name text` column on `session_logs` + a drizzle migration
  (nullable, no backfill — "no migration for EXISTING ROWS" is true; "no
  migration" is not). `GET /api/logs` is `db.select()` over the table
  (`stores/logs.ts:53-59`) so it returns automatically.
- (b) Drop `deviceName` from 7C entirely; the wire log already carries the
  device and §5's own rule is "added WHEN a consumer exists — never
  hoarded in advance". A Logbook sync is not a consumer yet.

Recommendation: **(b)**, on §5's own stated principle. If (a), §6 must
also name `stores/logs.ts`'s `LogInput`/`create` and the schema file, not
just `routes/data.ts`.

---

## MAJOR

### M1 — The monitor branch lands on the MANUAL door, which has no Discard control at all

**Spec (§4):** "**Discard without logging**: `clearMonitorRun()` too — the
existing discard control, same confirm it has today."

**Code:** the connected session navigates to `/library/${workout.id}/log`
(`WorkoutDetail.tsx:445-448`) — `LogSession`'s MANUAL door
(`LogSession.tsx:390-397`: "`id`'s presence IS the door"). `ManualDoorLog`
passes **`discardSlot={null}`** with the comment "Nothing to discard (the
brief's own words)" (`LogSession.tsx:1049-1051`). The staged Discard
exists only on `SessionDoorLog` (`:834-843`), a route the connected
session never reaches.

Second half: the natural implementation of "clear at discard" is
`useStagedDiscard`'s `fire()` — but that hook is shared by
SessionComplete/Today/LogSession and clears draft+run unconditionally
(`app/src/session/useStagedDiscard.ts:79-83`). Adding `clearMonitorRun()`
there creates a NEW unguarded destruction path at three surfaces, the
exact hazard `monitorRun.ts:145-150` warns about ("Do not add a second
unguarded caller").

**Proposed change:** §4 says the monitor branch RENDERS a discard control
(the L4 armed-in-place idiom, `LogSession.tsx:834-843`, copy unchanged)
which the manual door does not otherwise have, and that the clear happens
**at the call site**, never inside `useStagedDiscard.fire()` — with that
sentence quoted from `monitorRun.ts`'s own warning. Add to §7: a test that
`fire()` still clears exactly draft+run and nothing else.

### M2 — `/library/:id/log` is ALSO the "Log it after" off-app door; §3's condition cannot tell the two apart, and Save then destroys the record

**Spec (§3):** the branch engages when `loadMonitorRun()` returns a
record, `completedAt !== null`, and `workoutId` matches the route's
workout.

**Code:** the same route is reached from `WorkoutDetail`'s "Log it after"
link (`WorkoutDetail.tsx:592-596`) for a purely off-app row. A rower who
connected, rowed, ended, then left the log screen without saving or
discarding (the `BackLink` exit, `LogSession.tsx:482`) leaves a completed
`MonitorRun` on record. Their NEXT "Log it after" on the same workout —
days later, for an entirely different, off-app row — silently becomes a
PM5-prefilled form, and Save destroys the monitor record they may still
have wanted (`clearMonitorRun`, §4).

**Proposed change:** §3 adds a fourth condition — an explicit
navigation-state discriminator set by the ONE caller that means it:
`navigate(\`/library/${workout.id}/log\`, { state: { from: "monitor" } })`
in `handleConnectedEnded` (`WorkoutDetail.tsx:447`), read via
`useLocation()`. Or, if a record must survive a reload of that URL, keep
the three conditions AND require the record to be recent (a bounded
`completedAt` age) and state the bound. Silence here is a data-loss path,
not a nicety.

### M3 — The step list has no inputs today; the change §3 actually needs is a render condition it never names

**Spec (§3):** "rows with a PM5 actual are READ-ONLY (ruling 2) — rendered
as values, not inputs, with the same visual weight the manual rows have so
the form does not read as broken."

**Code:** `LogScreen`'s step list is already pure text — `<span
className="log-step-label">` + `<span className="log-step-target">` +
optionally `<span className="log-step-actual">`
(`LogSession.tsx:498-525`). There is not a single input, on either door.
"Read-only, not inputs" is the status quo; ruling 2 is satisfied by
construction and costs nothing.

The change that IS needed is unstated: the ACTUAL line renders only when
`step.actualSource === "stopwatch"` (`LogSession.tsx:516-521`), with a
comment explaining why `"assumed"` is suppressed. A `"pm5"` step would
render its label and target and **nothing else** — the monitor split the
whole phase exists to show would be invisible.

**Proposed change:** §3 replaces the read-only paragraph with the real
one: the actual line's condition widens to `actualSource === "stopwatch"
|| actualSource === "pm5"` (`LogSession.tsx:516`), with the existing
comment extended to say why `"pm5"` joins `"stopwatch"` and not
`"assumed"` (a monitor reading can genuinely differ from the target; an
assumed one cannot). Drop the a11y line in §7 about "text, not disabled
controls" — there was never a control.

### M4 — The manual builder emits NO rest rows; §2's "identical to the manual builder's rest treatment" is false

**Spec (§2):** "Rest rows render from the program's folded `restSeconds`,
house format, no actuals — identical to the manual builder's rest
treatment."

**Code:** `buildManualLogSteps` skips everything that is not `"w"` or
`"test"` (`logDraft.ts:388-392`); `buildLogSteps` skips everything that is
not `work`/`test` (`:259-270`). The module header states it as a PINNED
READING: "Warm-up and rest phases never become a `LogStep` — §7 never
mentions either" (`logDraft.ts:33-36`). The manual builder's rest
treatment is: **there are no rest rows**.

Adding them to the PM5 door alone breaks §1's own "indistinguishable in
shape from a phone-timer session" and would need a DEVIATIONS row against
`docs/design/README.md` §7.

**Proposed change:** delete the rest-rows paragraph from §2. Replace with
one sentence: "Rest is not a `LogStep` on any door (`logDraft.ts`'s pinned
reading); a program interval's folded `restSeconds` is not rendered and
not stored."

### M5 — §3's "Totals (meters)" describes a surface the Log screen does not have

**Spec (§3):** "Totals (meters) sum the actuals' verbatim
`distanceMeters`."

**Code:** the Log screen's header is exactly `{dateLabel} · {totalMinutes}
MIN` (`LogSession.tsx:484-489`). There is no meters total anywhere on
either door, and `logTotals` returns only `{dateLabel, totalMinutes}`
(`logDraft.ts:476-494`).

**Proposed change:** either delete the clause, or state plainly that 7C
ADDS a meters total to `LogScreen`'s meta line for both doors (a
cross-door UI change with a DEVIATIONS row against §7's own header mock)
— and then say what the manual door's meters total is, since it has no
actuals to sum. Recommend deleting it: it is new surface, unasked for by
ROADMAP's two bullets.

### M6 — §6's headline claim is already true: the server admits `"pm5"` today

**Spec (§6):** "`POST /api/logs` … validation grows, additively:
`actualSource` admits `"pm5"`".

**Code:** `const ACTUAL_SOURCES: ActualSource[] = ["assumed",
"stopwatch", "pm5"]` (`app/server/routes/data.ts:41`), checked at `:147-155`
with the error string "actualSource must be one of
assumed|stopwatch|pm5". `server/stores/logs.ts:5` types it the same way.
6C shipped the third member end to end.

This matters beyond pedantry: it is the one server sentence in §6 that is
FALSE-because-already-done, sitting next to the one that is
false-because-impossible (B4) and standing in for the one that is
genuinely required and missing (B3's bands). A plan written from §6 as it
stands does the wrong server work.

**Proposed change:** rewrite §6 from the code: "no change needed for
`actualSource`" + B3's band/drop rule + the new fields + B4's resolution +
`stores/logs.ts`'s `LogStep` interface (`:19-26`) growing in step with
`validateLogStepEntry`'s explicit field list (`data.ts:178-187`, which
drops unknown keys — a new field not added there is silently discarded,
which would make §7's "round-trips everything stored" test pass or fail
for reasons unrelated to the route's validation).

### M7 — The monitor branch contradicts DEVIATIONS row 41's stated justification for the manual door

**DEVIATIONS.md:41:** the manual door keeps the tab bar visible, and the
reason of record is: "the manual door **touches no storage whatsoever**
(it never reads or writes the draft/run records, and nothing is staged
server-side until a successful POST), so **there is nothing an early exit
could leave dangling**" — pinned by `AppRoutes.test.tsx` and an
`e2e/design.spec.ts` sweep. `ManualDoorLog`'s own header states the same
as a hard constraint: "This component never imports `./draft` or `./run`
at all — there is nothing here that COULD touch either, by construction,
not by discipline" (`LogSession.tsx:858-863`).

7C's monitor branch makes that door read localStorage and, at Save and
Discard, destroy a record. The BackLink early exit
(`LogSession.tsx:482`) now genuinely leaves something dangling: a
completed `MonitorRun` that keeps arming `connectGuardStage`'s "unlogged"
confirm (`monitorRun.ts:417-427`) — which is §4's own "standing
annoyance", not retired but relocated.

**Proposed change:** §3 or §4 adds the DEVIATIONS amendment as an explicit
deliverable (row 41 gains: the constraint held for the DRAFT/RUN records
and still does; the monitor record is a third record this door now reads
and clears, and the tab-bar reasoning is re-grounded on "no server-side
staging" alone). And §4 rules on the third door explicitly: leaving via
BackLink clears NOTHING (correct — the rower may come back), and that is
stated, not left as an omission.

### M8 — §3 misidentifies the "existing workoutId-mismatch residual test"

**Spec (§3):** "the existing workoutId-mismatch residual test becomes
load-bearing and is extended, not replaced."

**Code:** that test is `describe("LogSession: the ledger residual
(workoutId mismatch)")` at `app/src/session/LogSession.test.tsx:609`, and
its subject is `SessionRun.workoutId === SessionDraft.workoutId` on the
**session door** (`LogSession.tsx:722-723`, `matchedDraft`) — a
run-vs-draft guard protecting step labels, PACES LOCKED, and the
workoutType fallback (`LogSession.tsx:664-673`). It has nothing to do with
a route param, nothing to do with `MonitorRun`, and lives on the door the
connected session never visits.

**Proposed change:** §3 names the real work: NEW tests on the manual door
for each engage/fall-through condition, and a note that the session door's
residual test is untouched by this phase.

---

## MINOR

**m1 — "verbatim off the wire" overstates it; and the work-vs-work+rest
question is UNVERIFIED, not settled.** §2 calls `actualSplit` and
`actualSeconds` "verbatim". They are already NORMALIZED by
`app/domain/monitor/pm5/parse.ts`: `splitIntervalAvgPace = readU16LE(…)/10`
(`:274`, the documented 0.1 s/lsb trap, `pm5-interface-notes.md:531`) and
`splitIntervalTimeSeconds = readU24LE(…)/10` (`:234`,
`interface-notes.md:516`). Both reach `IntervalActual` in SECONDS
(`parse.ts:446-455`) — so the spec's mapping is unit-safe, but the word
should be "as `IntervalActual` carries them (parse.ts has already applied
the 0.1/0.01 scales)", not "off the wire". Separately, §2 asserts
`elapsedSeconds` is "the interval's own MEASURED **work** time". The
document supports it — 0x0037 carries "Interval Rest Time" as a SEPARATE
field at offset 12-13 (`interface-notes.md:518`), and it is a different
characteristic from 0x0031, whose per-interval clock demonstrably spans
work+rest (walk 4, `interface-notes.md:2136-2145`) — but **no hardware
reading has ever confirmed it**, and `parse.ts:424-445`'s own comment
argues the point from `ProgramInterval` symmetry, not observation. Mark it
UNVERIFIED in §2 and add a reading to `interface-notes.md` §17's owed
list: at a boundary with a known non-zero rest, does
`splitIntervalTimeSeconds` equal the work bout or work+rest?

**m2 — the `avgHr` 30-250 band rejects the whole payload.** §6: "an
integer in 30-250 … anything else rejects the payload". `heartRate()`
already maps both 0 and 255 to `null` (`parse.ts:71-74`, D5), so the
survivors are single bytes 1-254; a spurious 25 or 251 would 400 an
otherwise-good log. Same rule as B3: drop the field, never the log.

**m3 — `actualMeters` "positive number" rejects a legitimate 0.**
`IntervalActual.distanceMeters` is whole meters (`parse.ts:235`,
`interface-notes.md:517`) and is 0 for an interval the rower never moved
in; the capture shows values as low as 1
(`pm5-session3-final.log.gz:1127`). Say non-negative, or omit at 0.

**m4 — an anonymous run (`workoutId: null`) can never match any route.**
`MonitorRun.workoutId` is `string | null` (`monitorRun.ts:42`) and
`RunIdentity` supports it deliberately
(`app/src/monitor/useMonitorSession.ts:146-155`). §3's match condition
means such a record is unloggable AND never cleared, so it arms
`connectGuardStage`'s "unlogged" confirm forever
(`monitorRun.ts:417-427`). Unreachable today — `ANONYMOUS_RUN`
(`useMonitorSession.ts:155`) is consumed only by `NO_IDENTITY`
(`:162-166`), whose own comment says that value is never read — so this is a stated RULING, not a feature:
§3 adds "a `workoutId: null` record falls through (no product path creates
one); if one ever ships, it needs its own door."

**m5 — the manual door's own early returns swallow a completed
`MonitorRun`.** Workout not in the library (`LogSession.tsx:958-966`) and
the partial/missing-baselines degradation (`:975-994`) both return before
any step list is built. A connected session whose workout was deleted, or
whose baselines were cleared in another tab, lands on a screen with no
prefill and no way to clear the record. §3 should say what happens (fall
through is fine; silence is not).

**m6 — effort intervals getting a PM5 actual is a deliberate departure
from the 5G rule.** §2: "Effort-target intervals (`targetSplit: null` on
the wire) still get their PM5 actual". Both existing builders omit
`actualSplit`/`actualSource` entirely for an effort step
(`logDraft.ts:333-343` and `:401-406`, "no actual is ever attributed to an
estimate that was never a target"). The spec's call is defensible — the
machine really did measure it, and the target is genuinely absent rather
than estimated — but it is a departure, and `LogScreen` will render the
target cell as `—` beside a real actual (`LogSession.tsx:503-507`). Needs
a DEVIATIONS row, named in §7.

**m7 — §7's headline fixture does not exist in the repo.** "the builder is
tested against WALK 4's real record shape (2×100 m, both actuals present,
machine numbering already normalized)". `docs/monitor/sessions/README.md`
lists exactly three captures — sessions 3, 4a, 4b — and §18's walk-4 entry
(`interface-notes.md:2129-2160`) records FRAMES (`state=resting
elapsed=37.81 distance=101.8`), not `intervalComplete` actuals. Walk 4's
actual values are not on record. §7 should cite the captures that DO carry
actuals (`pm5-session3-final.log.gz:417/2294/2474/2836`) — which is also
where B3's out-of-band numbers come from.

**m8 — `logTotals` is `SessionRun`-shaped.** §3's "duration from
`startedAt → completedAt` wall span" is exactly `logTotals`
(`logDraft.ts:476-494`), but its parameter is a `SessionRun`. §2/§3 should
name the monitor twin (or a narrowed `{startedAt, completedAt}` parameter
so the two doors share one implementation — the same "cannot diverge"
argument `refPaceLabel` carries at `logDraft.ts:152-160`).

**m9 — the step-count ceiling is 200 and unlikely to bind, but the payload
grows.** `data.ts:451-461` caps `steps` at 200 entries; PM5 programs cap at
50 intervals (`program.ts:170`), so no interaction. Worth one sentence in
§6 confirming it, since §6 currently says nothing about ceilings.

**m10 — §5 drops `terminated`, but the record's own comment says 7C is why
it exists.** `MonitorRun.terminated`'s doc: "A future consumer (7C) needs
both: '12 of 12 logged' reads differently from 'abandoned at interval 8'"
(`monitorRun.ts:33-39`; the same claim in
`app/domain/monitor/types.ts:95-97`). §3 rules "a `terminated` run gets no
special chrome" and §5 drops storing it. That may well be right — the
caption's `N OF M` carries the honest fact, and DEVIATIONS row 81 already
refused to build an undesigned MISSED treatment — but the spec should SAY
it is overruling those two comments, so the next reader does not find the
contradiction and re-open it. Best: a one-line amendment to
`monitorRun.ts`'s comment in this phase's own diff.

**m11 — the M-2 coexistence case is unstated but benign.** A `SessionRun`
can coexist with a `MonitorRun` via the `Countdown` deep link
(`monitorRun.ts:322-336`). Because the two doors are different ROUTES
(`/session/log` vs `/library/:id/log`, `LogSession.tsx:390-397`), there is
no ambiguity about which record a form was born from, and clearing only
`MonitorRun` at Save is correct. One sentence in §4 saying so closes the
question rather than leaving it to be rediscovered.

---

## Scope check (ROADMAP §7C, `ROADMAP.md:1484-1499`)

Both bullets are covered: `IntervalActual` → per-step actual with
`actualSource: 'pm5'` (§2), and the monitor-side log-writing path
mirroring 6C's `logDraft.ts`/`LogScreen` split (§2/§3). The exit line is
met by §8, subject to B1-B4.

**Nothing found belonging to Phase 8, 9, or 6J.** §5's Concept2 seam is
beyond ROADMAP's two bullets but is explicitly sanctioned by the
2026-08-08 product ruling quoted in §1, and it is a shape constraint
rather than a feature — legitimate, provided B4 resolves in favour of
dropping `deviceName` or paying for a column honestly.

**One thing ROADMAP implies and the spec under-serves:** "the same
fidelity a phone-timer session does" (`ROADMAP.md:1487-1488`). The PACES
LOCKED panel is part of that fidelity on both existing doors
(`LogSession.tsx:491-496`) and §3 never mentions it. On the monitor
branch, `lockedBaseline` cannot run (no `SessionRun`/`SessionDraft`) and
`manualLockedBaseline` would read CURRENT baselines
(`LogSession.tsx:187-201`) — which for a connected session is a number
that has nothing to do with what was programmed (B1's nudge problem
again). §3 must rule: omit the panel on the monitor branch (honest,
`pacesLockedText` already returns `null` and the caller omits it,
`:159-164`), or reconstruct it from a widened record.
