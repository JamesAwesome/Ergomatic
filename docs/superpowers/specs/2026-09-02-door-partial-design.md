# The `door` item, re-scoped: PARTIAL, `no-reading`, and the in-flight metres

**Date:** 2026-09-02 · **Wave:** F · **Class:** TRIAD (a stored word's meaning
in PR A; a stored number's meaning in PR B) · **Status:** DRAFT, awaiting
James's review; anchor pass RUN 2026-09-02 (ledger entry landed with this
spec) · **Gate 0:** two, one per PR, rendered before any implementation task.

## What and why

A rower who plans a 500 m piece and stops at 250 sees a saved row that looks
like a 250 m piece rowed to plan. James's words (2026-08-25): _"I want it to
say I stopped, not silently show a shorter piece that looks like I planned a
250 when I meant 500 and bailed."_ This spec makes the saved row say it. It
also settles two words the log has been getting wrong — a connected session
that measured nothing reads `LOGGED BY HAND` in the log but `NO MONITOR
READING` on the live screen, and an erg that advertises no name is stored as
`PM5`, a model number we do not know — and it ships the three stale server
riders James ruled ride this migration, plus the now-due `source` sunset.

The ROADMAP item this replaces was called "the `door` column". **The column
already shipped**: `session_logs.source` (`pm5 | timer | manual`) landed in
#268 / migration 0020 on 2026-09-02 (ROADMAP "the door clause is DELIVERED").
What this spec carries is what that left behind, split into two PRs by risk
model: **PR A changes what a stored WORD means; PR B changes what a stored
NUMBER means.** A reviewer never holds both at once.

- **PR A — the stored word.** A fourth `log_source` member `no-reading`; the
  PARTIAL read and its copy; RC-18's neutral fallback; the positive
  `timeLabel` gate; the three riders and the sunset. Gate 0-A.
- **PR B — the stored number.** Lifecycle spec §5: the in-flight interval's
  metres survive a mid-row close as OUR number, never the machine's, in new
  step keys, and the "N intervals kept" vocabulary including the lost banner.
  Gate 0-B. Lands after A.

The decisions below were taken with James on 2026-09-02 and then attacked in
a full anchor pass the same day; two fell and were corrected before this was
written. Each section names what held and what was corrected.

---

## §1 — PARTIAL: what a stopped piece says (PR A)

### 1.1 The predicate, and who owns each input

**PARTIAL** ⟺ all four hold:

1. `source = 'pm5'` — only the connected door stores planned-vs-measured
   steps. `buildMonitorLogSteps` is the ONLY writer of `actualMeters` /
   `actualSeconds` (`logDraft.ts:910-911`); the timer builder writes
   neither, and a timer step never rowed emits `actualSplit = targetSplit,
   actualSource: "assumed"` — byte-identical to a step rowed to plan. A timer
   row cannot be partial in stored data at all: `/session/log` is reached only
   from `isComplete(run)` (`Timer.tsx:477-483`), and the abandon path's own
   copy is _"Nothing will be saved: no log, no actuals."_ (`Timer.tsx:815`).
2. `steps.length > 0` — a connected Just Row stores `steps: []` and always
   closes `endedBy: "rower"` (its only exit is TERMINATE, `monitorRun.ts:184-188`;
   `JustRowLog.tsx:243`). Without this clause every successful Just Row is
   PARTIAL. This is the clause the first draft of this spec lacked.
3. At least one step carries no `actualSource` — an interval never reached
   already stores no `actualSource` (`logDraft.ts:917-923`, _"Unambiguous
   against the row-local discriminant"_). This discriminator exists today; the
   spec adds no field for it.
4. `endedBy ∈ {rower, link-lost, program-failed, program-dropped, interrupted}`
   — the six-member server enum (`schema.ts:76-83`) minus `finished`, and
   never `null` (`timer`/`manual` rows post no `endedBy`; `routes/data.ts:1740`
   stores `?? null`).

**Authority.** `endedBy` owns HOW THE SESSION ENDED — End button or machine
TERMINATE both write `rower`, so venue is lost by design and this spec does
not pretend otherwise. `steps` owns WHAT WAS MEASURED. Neither derives from
the other and they can legally disagree:

- **Short step, `endedBy = finished`** is MEASUREMENT LOSS, not a partial
  piece. Two producers are named in the code: _"a lost boundary whose pair
  never both arrived"_ (`logDraft.ts:804-806`) and _"an interval that produces
  ZERO frames is lost entirely"_ (`domain/monitor/types.ts:62-63`). Clause 4
  excludes it, and the copy for that row stays what it is today.
- **All steps measured, `endedBy = rower`** (a last boundary landed, WORKOUTEND
  did not, End pressed) — clause 3 excludes it; the row reads as complete.
  Mechanism named, no capture (SUSPECTED); the replay in §8.3 settles how
  reachable it is.

The predicate is DETERMINISTIC: every input is a stored fact the machine or
the rower produced; there is no threshold.

### 1.2 The copy — Gate 0-A substance, not a footnote

"I stopped" is true for `rower` only. The other four are different stories:

| `endedBy` | who ended it | marker (draft, Gate 0-A decides the words) |
|---|---|---|
| `rower` | the rower (End, or the monitor's TERMINATE) | `STOPPED EARLY · N of M intervals` |
| `link-lost` | the app lost the monitor | existing `LINK LOST · the app lost the monitor before the end` line, plus `N of M intervals` |
| `program-dropped` | the erg discarded the program | `THE MONITOR DROPPED THE PROGRAM · N of M intervals` |
| `program-failed` | our `program()` call failed | `THE PROGRAM DID NOT LOAD · N of M intervals` |
| `interrupted` | the record was closed from Today's unlogged row, no close event | `LEFT UNFINISHED · N of M intervals` |

`N` = steps carrying `actualSource`; `M` = `steps.length`. The marker follows
`LINK_LOST_LINE`'s structural rule (`storedSummary.ts:953-962`): an ALLOWLIST
on the value, never a negation, so a future sixth close reason renders nothing
rather than a wrong word. The existing `LINK LOST` line is subsumed (one line
per row, never two).

### 1.3 Where it renders

- **The saved row (`FromTheLog.tsx`)**: the marker line beneath the heroes,
  where `LINK LOST` renders today.
- **`MachineConfirmedBlock` is IN SCOPE.** It renders on `machineWorkSeconds
  !== null` alone and bypasses the view model by spec (`FromTheLog.tsx:61-66`);
  `appendSummaryObservations` admits `rower`, so a terminated partial with a
  burst shows `MACHINE CONFIRMED · WORK ONLY` over a partial number with no
  marker — walk-2026-09-01 piece 2 (Menu-terminated, code `D338-90E8`) is a
  live instance. The block keeps its "reads the row and nothing else"
  constraint; the PARTIAL marker renders ABOVE it as a sibling, from the view
  model, so the block's own text does not change. Gate 0-A shows that pairing.
- **History / Today list rows.** `LOG_LIST_COLUMNS` carries `source` and
  `endedBy` but not `steps`, so the list cannot evaluate clause 3. The list
  projection gains a SQL-derived boolean `partial` over `steps` (the
  `machineAvgPaceSecondsPer500m` idiom, `stores/logs.ts:342-344`) evaluating
  the same four clauses server-side, so list and detail agree by construction
  — the divergence class that burned at `HistoryList.test.tsx:459`. The list
  row renders a short `STOPPED EARLY` / `LINK LOST` / etc. chip from the same
  allowlist. No new column.

---

## §2 — `no-reading`: the fourth `log_source` member (PR A)

### 2.1 The word

A connected arrival with no record (`connectedArrivalWithNoRecord`,
`LogSession.tsx:387-389` — `from=monitor` AND an empty store) posts
`source: "no-reading"`. The log renders `NO MONITOR READING`, the live
screen's word (`summaryModel.ts`'s `NO_MONITOR_READING_SOURCE`). This closes
the LM exception to James's 2026-08-18 ruling (one fact never reads as two
words live vs from the log); the exception's own trigger — "the next
stored-shape change to the logs table" — is this PR.

### 2.2 No device name — the corrected decision

The first draft required a `deviceName` "like `pm5`". **Corrected:** a
`no-reading` row carries NO device name, like `manual` and `timer`. The only
name reachable on that path is `loadLastDevice()`, a best-effort LAST-USED
name, and posting it was already rejected in writing at the site
(`storedSummary.ts:69-72`: _"would have the row assert that a named erg
supplied numbers that came off nothing"_) and by a recorded PM ruling
(`pm-ledger.md:2710-2716`: _"Prefer the false negative."_). Requiring it would
also 400 the save through `logSourceContradiction` with no client retry — the
row lost on the exact arrival the member exists to serve (RF25's shape).

So the biconditional `deviceName ≠ null ⟺ source = 'pm5'` SURVIVES: `pm5`
requires a name, the other three forbid one. `logSource.ts:60-75` widens to
four cases. `server/concept2/mapping.ts:49` keys monitor provenance on
`deviceName === null` today and stays correct without change; the spec still
rewrites it to `row.source !== "pm5"` in PR A, because provenance is what the
column is FOR and the null check was convenient, not stated.

### 2.3 `timeLabel`, re-derived positively

`buildMeta` (`storedSummary.ts:329-339`) shows the wall-clock time when
`sourceLabel(row) !== "LOGGED BY HAND"` — a negation keyed on a resolved
word. A fourth member added without touching it silently gains a time the
live screen never shows (phase-lm.md:314-318 predicted exactly this). PR A
replaces it with an allowlist: `timeLabel` renders for `pm5`, `timer` and
`no-reading` (the session happened at a clock time the app witnessed), never
for `manual`. `sourceLabel` gains the fourth arm and a `default` that returns
the column value verbatim rather than `undefined`.

### 2.4 The migration, and why it is not additive the way the column was

Migration **0022** (re-check the index at generation; 0019–0021 were all
regenerated on rebase): `ALTER TYPE "log_source" ADD VALUE 'no-reading';`
plus the riders (§4). **No backfill** — and not only because old `manual`
rows that were really no-reading are indistinguishable (they stay `LOGGED BY
HAND`, permanently; this spec says so rather than promising a backfill it
cannot do). PostgreSQL 18, `ALTER TYPE`, PRIMARY, verbatim: _"If `ALTER TYPE
... ADD VALUE` … is executed inside a transaction block, the new value cannot
be used until after the transaction has been committed."_
(https://www.postgresql.org/docs/18/sql-altertype.html). Drizzle's migrator
runs each file in one transaction, so any statement in 0022 that writes
`'no-reading'` fails. The migration header states this.

**Additive matrix, both directions, stated because the column's introduction
was additive and the member's is NOT:**

| direction | outcome | mitigation |
|---|---|---|
| old client → new server | posts `manual` as today; derived path until the sunset | none needed |
| **new client → old server** (deploy lag; `RELEASING.md:95-97` records six merges deploying nothing for eleven hours on 2026-09-01) | `LOG_SOURCES.includes` 400s `no-reading` on field `source`; the client retries only `workoutId` → **save lost** | server deploys on merge and the client reaches phones by TestFlight later, so the window is the deploy lag only; the rollback floor row (below) forbids rolling the API back past this tag |
| old client reads new row | `sourceLabel`'s switch has no `default` → blank source word, plus a `timeLabel` | cosmetic; stated in the release note |
| new client reads old row | unchanged | — |

**Rollback floor:** `docs/RELEASING.md`'s table gains a row for the tag that
ships PR A: rolling the API back past it 400s every `no-reading` save.

**Mirror census (the schema comment says three; the real set is eight and
two are not compile-enforced):** the pgEnum (`schema.ts:152`),
`domain/types.ts:101-102` `LOG_SOURCES`, the 400 message literal
(`data.ts:1678`, user-facing), `logSource.ts`'s switch, `storedSummary.ts:299`'s
switch, `e2e/screenshots.spec.ts:2470`'s type, `summaryModel.ts`'s live word,
and the migration. All move in one commit; the schema comment is corrected to
count them.

---

## §3 — RC-18: the neutral fallback (PR A)

`device.name ?? "PM5"` bakes a model number into a stored, rower-visible
field (`phase-rc.md:1846-1869`). PR A replaces the fallback with the literal
**`MONITOR`** at every `?? "PM5"` site — six, census complete under attack:
`webBluetooth.ts:296`, `capacitorBle.ts:465`, `capacitorBle.ts:494`,
`driver.ts:1035` (the one that reaches storage via `capabilities.deviceName`
→ `useMonitorSession.ts:2830`), `JustRow.tsx:301`, `surfaceModel.ts:1890`,
plus the read-side `storedSummary.ts:302`. The two `namePrefix: "PM5"` scan
filters (`webBluetooth.ts:288`, `capacitorBle.ts:480`) are discovery, not
copy, and do not change.

- **Why the literal is uppercase:** nothing uppercases the source line
  (`grep -c text-transform app/src/index.css` → 1, not on `.summary-meta`);
  `TIMER` and `LOGGED BY HAND` are literals and a real erg supplies its own
  caps (`PM5 432331249`). `"monitor"` would render lowercase beside them.
  Gate 0-A shows `MONITOR` in place.
- **Reachability, per site:** `capacitorBle.ts:494` sits behind a picker whose
  only filter is `namePrefix: "PM5"`, so its fallback is DEAD CODE — it changes
  for consistency and gets no test (a test there cannot go red through the
  supported producer, RF21). `capacitorBle.ts:465` (`getConnectedDevices`) and
  `webBluetooth.ts:296` (OR'd service filter) are reachable and are the gated
  sites.
- **Fix-forward only, no backfill:** existing rows carrying `"PM5"` are
  indistinguishable from ergs that genuinely advertised "PM5" (the common
  case). A backfill would corrupt correct data to fix a rare one.
- `useMonitorSession.ts:1100`'s claim _"no screen ever renders the `"PM5"`
  placeholder"_ is false beside `JustRow.tsx:301`; reconciled in PR A.
- No identity collision: every stored-row consumer of `deviceName` is a null
  check, never a value comparison (attacked and held).

---

## §4 — The riders and the sunset (PR A)

James's ruling (2026-08-31): the three stale riders ride the door migration.
PR A is that migration.

1. **`ALTER TABLE "preferences" DROP COLUMN "warmup";`** — no reader in either
   direction (`routes/data.ts:1860-1861` already 400s the field on PUT; the
   only other hit is `schema.ts`). **Rollback posture, stated:** one-way DDL.
   Rolling the image back past this tag against the post-drop DB gives a
   schema/model mismatch on `preferences` that no code path exercises;
   practical risk nil, and the rollback-floor row records it. Drizzle's
   generated `DROP COLUMN` carries no data-loss guard; the census above is the
   guard.
2. **Legacy warm-up guards on `LogSeed.steps[].kind`** — `logDraft.ts:865-871`
   and the union at `:600` (`kind` stays the literal union, never `string`,
   per the sub-ruling). `storedSummary.ts:427-433` cites the warm-up skip as a
   live cause of a Σ-steps gap; that comment is reconciled in the same commit.
3. **RC-12's last unreconciled comment** at `domain/monitor/types.ts:607`.
4. **The `source` derive-when-absent SUNSET — DUE.** `v0.34.0` is tagged at
   `138dbe8c` and contains #268, so the sunset's trigger ("the tag after the
   one that ships #268") is the tag that ships PR A. `source` becomes REQUIRED
   on `POST /api/logs`; `deriveLogSource` and the `source=derived` log line
   are deleted; `RELEASING.md`'s API note records the break. **Blast radius,
   larger than the ROADMAP row said:** every install older than v0.34.0 loses
   the ability to save ANY log, not just the derive path. **James (2026-09-02):
   "i can make sure they are by merge. remind me before we do."** PR A's
   ready-for-merge comment carries that reminder verbatim, and the release
   note says the floor is v0.34.0.

---

## §5 — The in-flight interval's metres (PR B; lifecycle spec §5)

### 5.1 What it stores and where

On a connected close that is not `finished`, the interval in flight — the one
with no boundary actual — stores its live frame reading as **our** number in
two NEW step keys, `partialMeters` and `partialSeconds`, on the step that was
in flight. Never in `actualMeters`/`actualSeconds`, never as a new
`actualSource` member. The reason is the server's own validator comment
(`routes/data.ts:594-596`): _"any extra keys the client sent are silently
dropped, not persisted."_ A partial carried in `actualMeters` plus a marker
reaches an OLDER server as the number without the marker, 201, in every sum
forever; a new `actualSource` member 400s the whole save with no retry. New
key names make the old-server degradation identical to not shipping §5:
both keys dropped together, the row reads as it does today. `steps` is
untyped `jsonb` (`schema.ts:195`); no migration.

### 5.2 Invariants (stated as invariants, not mechanisms — RF27)

- **I-B1** A partial is written only on a close with `endedBy ≠ finished`.
  Tier B2 (`isReconstructableClose` = `finished | null`) therefore never sees
  one, and its "provably historical, non-growing" population
  (`storedSummary.ts:390-400`) stays true.
- **I-B2** A partial is never an `IntervalActual`. `measuredIntervalCount`
  (`summaryModel.ts:648-653`) reads `run.actuals`, so "N intervals kept" does
  not move; a partial single-interval piece is still `kept = 0`.
- **I-B3** A partial is captured only while `state === "rowing"`.
  `MonitorFrame.distanceMeters` is per-interval and spans work plus trailing
  rest (`domain/monitor/types.ts:33-39`, settled on hardware walk 4), so a
  reading taken while resting is interval N's work plus rest for an interval
  whose actual may already be banked — a double count. Resting → no partial.
- **I-B4** A stale re-emitted frame UNDER-counts, never over: the partial is
  the last rowing frame's reading, and a re-emission repeats an earlier,
  smaller number. §4's freeze discriminator (open, see the antagonist ledger
  2026-09-02) does not gate this; the bound is stated instead of assumed.
- **I-B5** Every reader that sums step actuals ignores partial keys by
  construction: `stepActualSums`, `tierBAvgSplitSeconds`, `hasStepActuals`,
  `buildStoredRest`, `heroDistanceMeters` read `actualMeters`/`actualSeconds`
  and never the partial keys; the partial renders only on its own step row
  and never enters a hero, a tier, or the Concept2 mapping (which reads
  `work_meters`/`work_seconds` and is fenced to `finished` rows anyway).

### 5.3 Lifetime table (session-scoped state, RF27)

| state | mint | clear | survives teardown / relaunch / re-arm |
|---|---|---|---|
| in-flight interval reading (`lastRowingFrameRef`: `{ intervalIndex, meters, seconds }`) | every `state === "rowing"` frame of the live run | each boundary actual for that interval (the in-flight interval advanced); per-run resets; teardown | no / no / no |

The close arms that write a partial: the user End arm, the live-drop arm
(`program-dropped`), and the link-lost arm — each reads the ref once at close
and never afterwards. `interrupted` (Today's unlogged row) has no live frame
and writes none.

### 5.4 The kept vocabulary and the lost banner

The lost banner's `kept === 0` arm drops its body ("Nothing kept."); `kept
>= 1` keeps "N intervals kept." (ROADMAP register row, James 2026-09-02). I-B2
means §5 does not make this redundant — it makes it necessary: a partial
single-interval piece is still `kept = 0` while the reconnect is nullifying
the loss. Gate 0-B shows the banner, the step row with a partial, and the
saved row together, one vocabulary.

---

## §6 — Gate 0, twice, in forced order

- **Gate 0-A (before PR A's tasks):** the saved-row screen for a terminated
  connected row AS IT RENDERS TODAY (no partial number yet), in both
  orientations, against the current screen: the PARTIAL marker for each of
  the five close reasons, `NO MONITOR READING` in place of `LOGGED BY HAND`
  with its time, `MONITOR` where `PM5` sat, the marker above
  `MACHINE CONFIRMED · WORK ONLY`, and the History list chip. Every colour
  pairing's contrast ratio stated.
- **Gate 0-B (before PR B's tasks):** the step row carrying a partial (how a
  250 of 500 reads beside a measured 500), the saved-row heroes unchanged by
  it (I-B5 made visible), and the lost banner both arms. Cannot be approved
  before §5's shape is decided, which is why it is not folded into 0-A (RC-24:
  a shape approved on a description).

---

## §7 — Does it exist, and what we assert on whose behalf

- **Concept2's logbook has no partial/abandoned concept** (PRIMARY, negative
  result: the result object at
  https://log.concept2.com/developers/documentation/ carries no such field and
  `workout_type`'s enumeration has no such member). PARTIAL is asserted
  entirely on our own behalf; the C2 fence (`mapping.ts:50`, `endedBy ===
  "finished"`) excludes every partial, so a PARTIAL row can never appear on C2
  as an unmarked short row. Filed alongside (RF14): **no connected Just Row can
  ever reach Concept2** under that fence, since a JR always closes `rower`.
- **The PM5 has the concept**: WORKOUTSTATE distinguishes WORKOUTEND from
  TERMINATE (`domain/monitor/types.ts:186-192`); we store the derivative
  (`endedBy`), and our End button also writes `terminated`, so venue is lost
  by design.
- `ls docs/superpowers/research/` covers nothing here (RF18 check run).

---

## §8 — Decomposition, gates, and what makes each one red

### 8.1 PR A — the stored word (TRIAD: word meaning; antagonist DELTA on the plan; PM final gate)

Tasks: (1) migration 0022 + the eight mirrors + `logSource.ts` four-case
contradiction + rollback-floor row; (2) `no-reading` posted from
`connectedArrivalWithNoRecord` + `sourceLabel`/`buildMeta` positive gate +
`mapping.ts:49` on `source`; (3) the PARTIAL predicate as one pure function
over `StoredLog` + the SQL-derived list boolean + the allowlist marker, both
surfaces; (4) RC-18's seven sites + the reconciled comment; (5) riders 1–3 +
the sunset + release-note lines; (6) e2e + screenshots.

Gates that must go red under a named mutation (RF21, recorded per task):
`POST /api/logs` seam test driving a `no-reading` body to 201 and a
`no-reading`+`deviceName` body to 400 (mutate the contradiction switch);
the predicate's seven-state table over `endedBy` × steps × source, including
Just Row (`steps: []`, `rower`) → NOT partial and `finished`+short step → NOT
partial (mutate clause 2, clause 4); list/detail agreement over a seeded
partial row read through BOTH `LOG_LIST_COLUMNS` and the detail fetch (mutate
the SQL boolean); `timeLabel` absent for `manual`, present for the other three
(mutate the allowlist); the reachable RC-18 sites through their real producers
(a nameless `getConnectedDevices` entry; a service-matched Web Bluetooth
device with `name: undefined`); the sunset: a POST without `source` → 400
(mutate by restoring the derive call).

### 8.2 PR B — the stored number (TRIAD: number meaning; antagonist FULL pass on its plan — a new stored shape; PM final gate)

Tasks: (1) the ref and its lifetime; (2) the three close arms writing the
partial keys; (3) the step row rendering; (4) I-B5's reader census as a test
(every summing reader over a row with partial keys equals the same row
without them); (5) the lost banner; (6) e2e + screenshots.

Gates: a replay over a committed multi-interval capture closed by End
mid-interval (the real driver, the real hook, storage read back — RF24's
"start upstream of the producer") asserting the partial keys on the in-flight
step and NO change to `actuals`, heroes, or `measuredIntervalCount`; a
resting-state close asserting no partial (mutate I-B3); an old-server
simulation (validator allowlist without the keys) asserting the row equals
today's (this is the additive matrix as a test).

### 8.3 Owed before PR B's plan, no hardware

One replay settles when `IntervalActual` N arrives — at the work→rest
boundary or at the end of N's rest (`pm5-interface-notes.md:713-715` shows a
work→work case only). It decides I-B3's exclusion precisely and how reachable
§1.1's "all matched, `endedBy = rower`" case is.

### 8.4 Skips, spoken

- No PM open gate beyond this spec's review: the scope was ruled by James
  item by item today.
- PR A's antagonist pass is a DELTA on the plan against this pass's vetted
  ground (§9); PR B's is FULL — it invents a stored shape and a
  session-scoped ref (RF27: never skip for a novel mechanism).

---

## §9 — Vetted ground (attacked and held, 2026-09-02)

`steps` needs no migration for a new key; `ALTER TYPE ADD VALUE` is legal in
drizzle's transaction given no backfill; the never-reached discriminator
(`actualSource` absent) already exists; the `?? "PM5"` census is complete and
collides with no identity read; `DROP COLUMN preferences.warmup` has no
reader; the C2 mapping reads no step field and no device-name value; tier B2
is unreachable by a partial given I-B1; `from=monitor` is intent, not
evidence (the predicate requires an empty store).

## §10 — Filed outside this spec (RF14)

- ROADMAP register: **no connected Just Row can ever be sent to Concept2**
  (`mapping.ts:50`).
- ROADMAP sunset row: blast radius corrected (all saving, not the derive
  path); rides PR A; James confirms the tester floor at merge.
- `storedSummary.ts:80-82` points at a `## Phase LM` ROADMAP heading that no
  longer exists; PR A repoints it at this spec.
