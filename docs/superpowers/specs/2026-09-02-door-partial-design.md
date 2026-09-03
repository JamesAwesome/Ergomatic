# The `door` item, re-scoped: PARTIAL, `no-reading`, and the in-flight metres

**Date:** 2026-09-02 · **Wave:** F · **Class:** TRIAD (a stored word's meaning
in PR A; a stored number's meaning in PR B) · **Status:** APPROVED by James 2026-09-02 (spec "looks good"; Gate 0-A approved
with one copy change — the `LINK LOST` line shortens to `LINK LOST · the app
lost the monitor`, a change to the shipped literal that PR A carries; chip in
the numbers-line slot; chip border left as the shipped Just Row chip's); the antagonist entries for this item are in `.claude/agents/antagonist-ledger.md` · **Gate 0:** two, one per PR, rendered before any implementation task
· **RE-SCOPED 2026-09-02, after approval:** §4's fourth item (the `source`
derive-when-absent sunset) SHIPPED SEPARATELY as #273 / v0.35.0 on the same
day and is no longer part of PR A. Nothing else moved.

## What and why

A rower who plans a 500 m piece and stops at 250 sees a saved row that looks
like a 250 m piece rowed to plan. James's words (2026-08-25): _"I want it to
say I stopped, not silently show a shorter piece that looks like I planned a
250 when I meant 500 and bailed."_ This spec makes the saved row say it. It
also settles two words the log has been getting wrong — a connected session
that measured nothing reads `LOGGED BY HAND` in the log but `NO MONITOR
READING` on the live screen, and an erg that advertises no name is stored as
`PM5`, a model number we do not know — and it ships the three stale server
riders James ruled ride this migration. (The `source` sunset §4 carried when
this was written shipped on its own as #273 / v0.35.0, 2026-09-02.)

The ROADMAP item this replaces was called "the `door` column". **The column
already shipped**: `session_logs.source` (`pm5 | timer | manual`) landed in
#268 / migration 0020 on 2026-09-02 (ROADMAP "the door clause is DELIVERED").
What this spec carries is what that left behind, split into two PRs by risk
model: **PR A changes what a stored WORD means; PR B changes what a stored
NUMBER means.** A reviewer never holds both at once.

- **PR A — the stored word.** A fourth `log_source` member `no-reading`; the
  PARTIAL read and its copy; RC-18's neutral fallback; the positive
  `timeLabel` gate; the three riders. Gate 0-A.
- **PR B — the stored number.** Lifecycle spec §5: the in-flight interval's
  metres survive a mid-row close in new step keys — the MACHINE's own
  reading, attributed by US to the interval it was in flight for, and the "N intervals kept" vocabulary including the lost banner.
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
2. `steps.length > 0` — a connected Just Row stores `steps: []` (two
   writers: `JustRowLog.tsx:209` pm5, `:178` timer) and ordinarily closes
   `endedBy: "rower"` (End or TERMINATE, `monitorRun.ts:184-188`,
   `useMonitorSession.ts:5010`); it can also close `link-lost` (same line,
   `linkGone`) or `interrupted` (Today's row), and the
   driver's terminal branch (`driver.ts:2605-2622`) has no free-row opt-out, so
   a piece set up at the PM5 while the app watches in Just Row could close
   `finished` (SUSPECTED, no capture). Whatever the close, a free row has no
   plan to be partial against; without this clause every successful Just Row
   is PARTIAL. This is the clause the first draft of this spec lacked.
3. At least one step carries no `actualSource` — an interval never reached
   already stores no `actualSource` (`logDraft.ts:913-917`, _"Unambiguous
   against the row-local discriminant"_). This discriminator exists today; the
   spec adds no field for it.
4. `endedBy ∈ {rower, link-lost, program-failed, program-dropped, interrupted}`
   — the six-member server enum (`schema.ts:76-83`) minus `finished`. `null`
   is NOT in the set and it DOES occur on `pm5` rows: `timer`/`manual` rows
   post no `endedBy`, and so does a legacy v1/v2 `MonitorRun` logged from
   Today (`monitorRun.ts:228-233`, `JustRowLog.tsx:244` spreads it
   conditionally; `routes/data.ts:1738` stores `?? null`). A `null` close is
   NOT partial. This is why the clause is an ALLOWLIST of five and never
   `endedBy !== "finished"`, which would mark every legacy row partial.

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
| `rower` | the rower (End, or the monitor's TERMINATE) | `STOPPED EARLY · N of M intervals measured` |
| `link-lost` | the app lost the monitor | existing `LINK LOST · the app lost the monitor`, plus the suffix when PARTIAL |
| `program-dropped` | the erg discarded the program | `THE MONITOR DROPPED THE PROGRAM · N of M intervals measured` |
| `program-failed` | our `program()` call failed against an already-open run (`useMonitorSession.ts:4946`); reaches the log only via Today's unlogged row, carrying the previous program's steps | `THE PROGRAM DID NOT LOAD · N of M intervals measured` |
| `interrupted` | the record was closed from Today's unlogged row with no wire evidence (`monitorRun.ts:1108-1119`) | `LEFT UNFINISHED · N of M intervals measured` |

**`N` = `steps.filter((s) => measuredElapsedSeconds(s) !== undefined).length`**
— the stored door's own generalisation (`storedSummary.ts:801`, over
`StoredLogStep`), whose doc comment (`:784-786`) says it _"generalizes
`summaryModel.ts`'s own per-door floor checks (`isMonitorRowMeasurable`/
`timerMeasurableElapsedSeconds`)"_. The shared primitive is
`isMeasuredReading` (`summaryModel.ts:613-619`: from the monitor AND
`elapsedSeconds >= 1`), which the live surface's lost banner counts by through
the non-exported `LogStep` adapter at `summaryModel.ts:987-989` (_"so the
connected surface's lost banner counts intervals by the same rule this screen
will judge them by"_). On a `pm5` row both reduce to `actualSource === "pm5"
&& actualSeconds >= 1`, so `N` counts intervals MEASURED — the same quantity
as "N intervals kept" on the live surface, one primitive under three
spellings, and the spec introduces no fourth. `M` = `steps.length`. **`N` is not progress:** after a lost
boundary (`logDraft.ts:804-806`) a rower who did two and a bit reads
`1 of 5 intervals measured`, which is true of what was measured and silent
about what was rowed; the copy says "measured", and that row (a stop after a
lost boundary) is IN Gate 0-A so James approves it rendered, not described.

**The close-reason line keeps its own trigger.** `LINK_LOST_LINE` renders on
`endedBy === "link-lost"` ALONE, steps-independent by design
(`storedSummary.ts:955-962`), and it is a release-noted promise
(`releaseNotes.ts:351`). It is NOT replaced and its trigger does NOT widen:
`link-lost` keeps its own ungated, steps-independent line exactly as today,
and gains the `· N of M intervals measured` suffix only when all four PARTIAL
clauses hold. **The other four words (`STOPPED EARLY`, `THE MONITOR DROPPED
THE PROGRAM`, `THE PROGRAM DID NOT LOAD`, `LEFT UNFINISHED`) render ONLY when
all four PARTIAL clauses hold**; a non-partial `rower`/`interrupted`/
`program-*` row renders nothing, as today. This matters because every
connected Just Row closes `rower` (`useMonitorSession.ts:5010`) and a planned
row Ended after its last interval does too — a steps-independent
`STOPPED EARLY` would print on both. A link-lost Just Row and a link-lost row
with every step measured keep their `LINK LOST` line, suffix-free. Both
allowlists are value equalities, never negations, so a future sixth close
reason renders nothing rather than a wrong word. PARTIAL ⟹ `N < M` (clause 3
guarantees an unmeasured step), so the suffix can never read `5 of 5`.

### 1.3 Where it renders

- **The saved row (`FromTheLog.tsx`)**: the marker line in the slot where
  `LINK LOST` renders today — ABOVE the heroes, between the black rule and
  `AVG SPLIT` (the first draft said "beneath"; the gate artboard, built from
  the real CSS, corrected it).
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
  projection gains a SQL-derived boolean `partial` over `steps` — the shape is
  migration 0020's own `EXISTS (SELECT 1 FROM jsonb_array_elements("steps") AS
  s WHERE …)` (a set predicate over the array; `stores/logs.ts:342-344`'s
  scalar path cast is the wrong idiom) evaluating the same four clauses
  server-side. Key absence in SQL (`NOT (s ? 'actualSource')`) equals
  `undefined` in TS because the route 400s `actualSource: null`
  (`routes/data.ts:472-479`) — attacked and held. List and detail agree by
  construction
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
four cases. Two readers key provenance on `deviceName === null` today and both stay
correct without change (0020's backfill CASE was `WHEN device_name IS NOT NULL
THEN 'pm5'`, and the contradiction rule has enforced the biconditional on
every write since — the rewrite is a true no-op, attacked and held):
`server/concept2/mapping.ts:49` and `storedSummary.ts:648`
(`buildStoredTotalLine`, whose comment at `:638-641` calls it _"the SAME
signal `sourceLabel`/`buildMeta` above already use"_ — a sentence PR A makes
false). PR A rewrites BOTH to `row.source !== "pm5"` and reconciles that
comment, because provenance is what the column is FOR and the null check was
convenient, not stated.

### 2.3 `timeLabel`, re-derived positively

`buildMeta` (`storedSummary.ts:329-339`) shows the wall-clock time when
`sourceLabel(row) !== "LOGGED BY HAND"` — a negation keyed on a resolved
word. A fourth member added without touching it silently gains a time the
live screen never shows (phase-lm.md:314-318 predicted exactly this). PR A
replaces it with an allowlist: `timeLabel` renders for `pm5`, `timer` and
`no-reading` (the session happened at a clock time the app witnessed), never
for `manual`. `sourceLabel`'s switch is already TOTAL over `LogSource` with
no `default` (`storedSummary.ts:299`), so the compiler forces this mirror to
move; it stays that way. The additive matrix's blank-word row below is an OLD
build's behaviour, which no arm in this PR can change.

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
| old client → new server | posts `manual` as today. **Since #273 / v0.35.0 an old client that posts NO `source` is already a 400**, whatever PR A does | none needed |
| **new client → old server** (deploy lag; `RELEASING.md:99-103` records six merges deploying nothing for eleven hours on 2026-09-01) | `LOG_SOURCES.includes` 400s `no-reading` on field `source`; the client's retry is scoped to `field === "workoutId"` (`LogSession.tsx:773-783`), so this 400 does not retry → **save fails, record held on the phone, the rower retries; a write outage, not data loss — `LogSession.tsx:806-808`** | server deploys on merge and the client reaches phones by TestFlight later, so the window is the deploy lag only; the rollback floor row (below) forbids rolling the API back past this tag |
| old client reads new row | `sourceLabel`'s switch has no `default` → blank source word, plus a `timeLabel` | cosmetic; stated in the release note |
| new client reads old row | unchanged | — |

**Rollback floor:** `docs/RELEASING.md`'s rollback table (`:168-171`) gains a row for the tag that
ships PR A: rolling the API back past it 400s every `no-reading` save.

**Mirror census (the schema comment says three; the real set is ELEVEN, and
four are not compile-enforced — lines re-verified at `fcf2d4f9`, after #272
and #273):** the pgEnum (`schema.ts:152`),
`domain/types.ts:101-102` `LOG_SOURCES`, the membership 400 message literal
(`data.ts:1676`, user-facing), `logSource.ts`'s switch, `storedSummary.ts:299`'s
switch, `e2e/screenshots.spec.ts:2570`'s type, `summaryModel.ts`'s live word,
`routes/source.integration.test.ts:180` and `:268` (the latter pins the exact
400 message and goes red on day one), the migration, and — added by #273 —
`e2e/log.spec.ts:89`'s own `postLog` `source?` type. All move in one
commit; BOTH "three mirrors" comments (`schema.ts:149-151`,
`domain/types.ts:98-100`) are corrected to count them. No single grep finds
the set (`grep -rn '"pm5", "timer", "manual"' app` returns only the three
array/literal forms), so the plan enumerates the eleven by name. Which are
compile-enforced: the two `switch`es (total over `LogSource`, no `default`,
so a fourth member errors on its own — no `assertNever` mechanism needed) and
the live-word import. The two e2e helper `source?` unions fail only where a
test SEEDS the new member, never on omission.
Which are NOT, and the dangerous one by name: **`LOG_SOURCES` is
`readonly LogSource[]` (`domain/types.ts:102`), not a tuple — a short array
compiles clean, and `routes/data.ts:1675` validates the wire against it, so
omitting `no-reading` there 400s every save of the new member with nothing
red.** The POST seam test (§8.1) is what makes that omission red.

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
  placeholder"_ is contradicted by `surfaceModel.ts:1890` (reachable);
  `JustRow.tsx:301` sits behind an arm that required `deviceName !== null`
  (`:114`) and may be as dead as `capacitorBle.ts:494`; `surfaceModel.ts:1890`
  is not behind a name filter but its callers' name provenance is untraced —
  the plan applies the same reachability test to BOTH before pinning either. The comment sweep also covers
  `LogSession.tsx:723` and `storedSummary.ts:295-298`, both describing the
  old fallback.
- **Why `MONITOR` is what makes a nameless erg's save LEGAL:** a `pm5` row
  must carry a name (the biconditional), so the fallback is not decoration —
  without one, a nameless erg's row would 400. A stored `MONITOR` is a caption
  in the device-name column and reads as one; no consumer compares the value
  (attacked and held) and the C2 payload carries no device name.
- No identity collision: every stored-row consumer of `deviceName` is a null
  check, never a value comparison (attacked and held).

---

## §4 — The riders (PR A) and the sunset (SHIPPED, #273)

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
2. **Legacy warm-up guards on `LogSeed.steps[].kind`** — the guard
   `if (seedStep.kind === "warmup") return;` at `logDraft.ts:864` and the
   union `kind: "warmup" | "work"` at `logDraft.ts:607` (`kind` stays the
   literal union, never `string`, per the sub-ruling; the ROADMAP's `:857`/
   `:600` are stale). The guard's own comment (`logDraft.ts:860-861`) names the
   consequence — _"Removing this guard adds a phantom warm-up row to what gets
   SAVED"_ — for the residual population: an unlogged pre-warm-up-removal
   `MonitorRun` still on a phone. That population is accepted in writing here
   (ten tags old, the Today door names such rows as stale). No reader re-runs
   `buildMonitorLogSteps` over STORED rows, so saved data is untouched.
   `storedSummary.ts:424-436` cites the warm-up skip as a live cause of a
   Σ-steps gap (verified by subject at `fcf2d4f9`; this spec first said
   `:427-433`); that comment is reconciled in the same commit.

   **LANDED 2026-09-02 as:** union narrowed to `"work"`; the guard KEPT
   behind `(seedStep.kind as string) === "warmup"` for the residual
   population (an unlogged `MonitorRun` authored before PR #150 / v0.16.0),
   mirroring `summaryModel.ts`'s `warmupIndex` — the whole-branch review
   found this zero-cost shape and the controller's accept-the-divergence
   ruling was reversed; no number moves. Removing both readers is one owed
   change (ROADMAP rider-2 row).
3. **RC-12's last unreconciled comment** — `onDisconnect`'s doc block at
   `domain/monitor/types.ts:630-631` (_"the phone's Bluetooth stack
   resetting"_ beside a `CORRECTED (Phase LL Task 2)` strike of the iOS
   backgrounding claim). `grep -n RC-12 domain/monitor/types.ts` returns
   nothing and the ROADMAP's `:607` is the `Transport` interface; the plan
   verifies by subject, not line. Reconciliation: the sentence states what the
   walks established (RC-12's finding), and the strike block is folded into
   it rather than left as a contradiction beneath it.

   **LANDED 2026-09-02, softened per PM-5:** "what the walks established"
   overstated it — the walks establish only the absence of our own evidence,
   never the radio's behaviour, so the landed comment strikes both causes as
   UNSOURCED (not disproven) and marks the Bluetooth-stack-reset case
   UNMEASURED (our logging records no such capture; `grep -rli "bluetooth
   stack\|stack reset" docs/monitor/sessions/` is empty).
4. **The `source` derive-when-absent SUNSET — SHIPPED SEPARATELY, NOT IN
   PR A.** It landed as **#273 / v0.35.0 on 2026-09-02**, the same day this
   spec was approved and before PR A's plan ran. Everything this item asked
   for is on main: `POST /api/logs` requires `source` and answers an absent
   one with `400 {error: "source is required", field: "source"}`
   (`routes/data.ts:1671-1674`); the route no longer calls `deriveLogSource`
   and the `source=derived` log line is gone; **`deriveLogSource` SURVIVED**
   as migration 0020's parity oracle
   (`routes/source.integration.test.ts:463`, _"the migration's own CASE and
   deriveLogSource agree on every row"_ — the only executable check on that
   backfill, cited by name in 0020's header); `RELEASING.md:45-49` records the
   API break; and the v0.35.0 note tells testers the floor. James's
   _"i can make sure they are by merge. remind me before we do."_ was
   discharged at #273's merge, not PR A's.

   **What PR A still owes from this item — one thing.** The client's
   deviceName-band guard (`LogSession.tsx:736-752`) fires when the advertised
   name is empty or over 64 characters. #273 had to make it state `manual`
   (`:751`) so the new 400 would not swallow the save, because the neutral
   caption did not exist yet. That stores a genuinely CONNECTED session as
   by-hand. §3's `MONITOR` is what the row actually needs: PR A keeps
   `source: "pm5"` and substitutes `NAMELESS_MONITOR_CAPTION` for the unusable
   name, so the door and its required `deviceName` stay together. The `pm5`
   narrowing is kept — the biconditional forbids a name on the other three
   members, so substituting one there would manufacture the contradiction the
   server 400s.

---

## §5 — The in-flight interval's metres (PR B; lifecycle spec §5)

### 5.1 What it stores and where

On a connected close that is not `finished`, the interval in flight — the one
with no boundary actual — stores its live frame reading in two NEW step keys,
`partialMeters` and `partialSeconds`, on the step that was in flight.
**Whose number it is, said precisely (PM final gate, 2026-09-03):** the pair
is `MonitorFrame.distanceMeters`/`elapsedSeconds`, which
`domain/monitor/types.ts:31-33` documents as _"0x0031's OWN Elapsed Time /
Distance, exactly as the machine reports them"_ — the QUANTITY is the
machine's. What is OURS is the ATTRIBUTION: §7 records that
`toActualIndex` returns `null` at terminate, so the machine reports the
reading and cannot say which interval it belongs to, and we do. Anything
else this spec ever said about the pair being "our number, never the
machine's" is superseded by this paragraph. Never in `actualMeters`/`actualSeconds`, never as a new
`actualSource` member. The reason is the server's own validator comment
(`routes/data.ts:594-596`): _"any extra keys the client sent are silently
dropped, not persisted."_ A partial carried in `actualMeters` plus a marker
reaches an OLDER server as the number without the marker, 201, in every sum
forever; a new `actualSource` member 400s the whole save with no retry. New
key names make the old-server degradation identical to not shipping §5:
both keys dropped together, the row reads as it does today. `steps` is
untyped `jsonb` (`schema.ts:195`); no migration. **But the NEW server drops
them too until its explicit field list grows** (`routes/data.ts:593-605`, ten
`if (x !== undefined) step.x = x` lines): PR B's task (0) widens `LogStep`,
the route's field list and its bounds, and the headline gate starts at
`POST /api/logs` and reads the row back through `GET` (RF24). **Two stored
shapes change, not one:** the partial is read at close inside `closeRecord`
(which builds the close through `completeMonitorRun`), while
`buildMonitorLogSteps` runs later off the loaded `MonitorRun` — so the partial
lives first on `MonitorRun` (a versioned localStorage record and the hand-off
store's durable bytes) and only then on the posted step. `isMonitorRun` has
no unknown-key check (its own comment: the positive conjunction tolerates new
fields), so no `v` bump; the spec names both shapes because a TRIAD PR that
changes two must. **On a link-lost close the pair is what we LAST RECEIVED,
not "so far":** `endSession`'s `linkGone` includes frame silence, so the
banked reading can be arbitrarily old. Gate 0-B approves that reading with
that word, or the copy changes.

**The pair is elapsed, not rowing time — SETTLED 2026-09-03 by the
resume-edge walk** (`docs/monitor/sessions/walk-2026-09-03-resume-edge/`:
with the rower still, elapsed ran 80.52 s → 92.11 s while distance sat at
247.1 → 249.6 m). The residual the PM gate marked UNSETTLED is discharged
in favour of this section's conclusion, on this device and this run: the
clock runs through a mid-WORK stop, and `types.ts:134`'s freeze claim is
true only of its own measured REST. The two citations below are kept
because the discriminator between them is what the walk went to find.

- `domain/monitor/types.ts:189-191`, the WIRE-DOC claim, tagged C4/H1:
  _"There is NO paused state on the wire — mid-workout the clock runs
  whether or not the rower pulls."_
- `domain/monitor/types.ts:134`, MEASURED and about the very same field,
  says the opposite in the same breath: `MonitorFrame.elapsedSeconds` is
  _"the per-interval clock, which FREEZES whenever `rowingActive` goes false
  — a rower sitting still through a rest stops it dead"_, measured against
  `walk-2026-08-16/session-2-wu-4unequal.jsonl`.
- The discriminator, and why this spec still says "elapsed": that measured
  freeze was watched **through a REST**, not through a mid-WORK stop, and a
  mid-work stop HAS been measured the other way. `useMonitorSession.ts`'s
  `PAUSED_FRAME_HOLD` doc comment records it as §17 item 20, ANSWERED by the
  2026-08-08 hardware recording: _"on a real PROGRAMMED timed interval the
  PM5's clock runs whether or not the rower pulls — the recording shows LEFT
  IN INTERVAL counting 4:38 → 3:47 while meters sat pinned at 30, split at
  4:16.1, rate at 68"_. That is the case a partial is banked in, and it says
  the clock runs.
- **What is therefore still open, precisely two things**, and neither
  changes what ships: (i) the same observation on a DISTANCE interval —
  `PAUSED_FRAME_HOLD`'s own caveat says the three-metric freeze "has only
  been WATCHED on a timed one"; (ii) the `rowingActive` byte's value through
  that stop, which the same comment records as **never observed** ("frames
  whose Rowing State behavior during a mid-piece stop has NEVER been
  observed"), so `types.ts:134`'s "whenever `rowingActive` goes false" has
  never been evaluated mid-work at all.
- **No committed capture settles (i) or (ii)**, checked by listing
  `docs/monitor/sessions/` by date and grepping every `rowingActive` mention
  in `docs/` (RF16's corpus check). **OWED AT THE NEXT WALK:** on a DISTANCE
  interval, stop pulling mid-interval for ≥10 s, keep the program running,
  then End — the recording then carries both the clock's behaviour and the
  byte through the same stop, and the loser of `types.ts:134` vs
  `types.ts:189-191` is corrected at its own site.

A rower who stops pulling and then presses End banks a `partialSeconds` that
includes idle time on the measured evidence above. **No split, pace or rate is
ever derived from the partial pair**; the step row shows the two numbers as
what they are (metres so far, interval clock so far). A `rowing` frame with
`intervalIndex: null` (the D3 divergence, `types.ts:152-159`) writes no
partial — absence over invention, the rule `logDraft` already applies to
null-index actuals.

### 5.2 Invariants (stated as invariants, not mechanisms — RF27)

- **I-B1** A partial is written only on a close whose `endedBy` is one of the
  FOUR WIRE-CLOSE reasons: `rower`, `link-lost`, `program-dropped`,
  `program-failed`. **An allowlist, never `≠ finished`** (SHIPPED as
  `PARTIAL_WRITE_REASONS` in `monitorRun.ts`; this bullet used to read
  "`endedBy ≠ finished`" and that wording is withdrawn): `withPartial`'s own
  parameter type also admits `interrupted`, which §5.3 says writes none, so
  the negation is wrong by exactly one member — measured, in the plan's
  Measurements appendix, as the one row of eighteen that flips.
  Tier B2 (`isReconstructableClose` = `finished | null | undefined`,
  `storedSummary.ts:513-515`) therefore never sees one, and the GATED
  population stays "provably historical" (`:406`) and "genuinely closed,
  non-growing" (`:466`) — the block at `:390-400` records the earlier,
  ungated version of that claim being FALSE, which is why the gate exists.
- **I-B2** A partial is never an `IntervalActual`. `measuredIntervalCount`
  (`summaryModel.ts:648-653`) reads `run.actuals`, so "N intervals kept" does
  not move; a partial single-interval piece is still `kept = 0`.
- **I-B3** A partial belongs to an interval whose WORK BOUT is still
  running. The work bout ends at the first `resting` frame carrying that
  interval's index, or at that interval's own ACCEPTED actual — the clear
  lives INSIDE the accepted-commit branch, never before `applyProducerCommit`
  has had its chance to refuse the commit (Task 2 review, RF25: a refused
  commit that had already retired the reading would lose a partial the run
  still owns) — whichever comes first — the two are up to a full programmed rest apart (measured:
  59 941 ms on `walk-2026-08-28/rest-boundary-recording.jsonl.gz`, boundary at
  t=136430 against the resting transition at t=76489, with zero resting
  frames after the boundary; the mechanism is the wire: 0x0037 carries
  `intervalRestTimeSeconds` (`pm5/parse.ts`, bytes 12-13), so the machine
  cannot emit the interval's actual before its rest has finished). A close
  after the work bout ends writes no partial, whether or not the actual ever
  landed. **The first draft cleared the ref on the boundary actual alone;
  that fires ~60 s late on a rested program, and an End during the rest
  would have stored a COMPLETED interval as a partial and counted it
  unmeasured — the inverse of the complaint this spec exists for.**
- **I-B4** A stale re-emitted frame UNDER-counts, never over: the partial is
  the last rowing frame's reading, and a re-emission repeats an earlier,
  smaller number (zero non-monotonic rowing samples across three committed
  captures). §4's freeze discriminator (open) does not gate this; the bound
  is stated instead of assumed. Re-emission is not the only under-counter:
  a link-lost close banks what was last received (§5.1), which is why the
  row's copy says what the pair IS rather than "so far".
- **I-B5** Every reader that sums step actuals ignores partial keys by
  construction: `stepActualSums`, `tierBAvgSplitSeconds`, `hasStepActuals`,
  `buildStoredRest`, `heroDistanceMeters` read `actualMeters`/`actualSeconds`
  and never the partial keys; the partial renders only on its own step row
  and never enters a hero, a tier, or the Concept2 mapping (which reads
  `work_meters`/`work_seconds` and is fenced to `finished` rows anyway). No
  reader iterates step keys generically (no spread, `Object.entries` or
  `Object.keys` over a `LogStep` anywhere in `src`, `server`, `domain`), and
  `PATCH /api/logs/:id` accepts only `held`/`pain`/`thumbs`/`notes`, so no
  edit path can strip the keys. **The step type has THREE declarations and
  task (0) widens all three:** `LogStep` in `src/session/logDraft.ts` (the
  write shape), `LogStep` in `server/stores/logs.ts` (the server shape), and
  `StoredLogStep` in `src/log/storedSummary.ts` (the read shape the row
  renders from).
- **I-B6** A partial is never written for an interval that already carries an
  `IntervalActual` on the run — checked against `run.actuals` at write time,
  never inferred from boundary timing. `MonitorFrame.intervalIndex` lags the
  machine's own interval reset by up to two frames (measured 810 ms on
  `walk-2026-08-16/session-1-keystone-2x250r0.jsonl`: boundary index 0 at
  t=80417, then `state=rowing idx=0 d=0` at t=80957, `idx=1` only at
  t=81227), so a rowing frame can carry the index of an interval whose actual
  is already banked and re-mint the ref onto it; without this invariant a
  close in that window writes `partialMeters: 0` beside `actualMeters: 250`.

### 5.3 Lifetime table (session-scoped state, RF27)

**AS SHIPPED** (this table was rewritten at Task 8's docs sweep against the
code; the version written before implementation said "four per-run reset
sites" and "six sites", counted no `program()` split, and named three of them
as gated. One is gated. The rest are declared defensive, each with the guard
that makes it unreachable, and none of them carries a mutation because none
of them can go red — RF21.)

| state | mint | clear | survives teardown / relaunch / re-arm |
|---|---|---|---|
| in-flight interval reading (`lastRowingFrameRef`: `{ intervalIndex, meters, seconds }`) | every `state === "rowing"` frame of the live run whose `intervalIndex` is non-null and whose interval carries no accepted actual yet (I-B6, checked against the record) | **event-shaped (I-B3), both gated:** the first `resting` frame carrying that interval's index; and that interval's own ACCEPTED actual, cleared INSIDE the accepted-commit branch (never before `applyProducerCommit` can refuse). **per-run, ONE gated site:** `program()`, at BOTH exits — success and its own `program-failed` catch — placed AFTER the close it performs, not beside `rowingStreakRef`'s clear at the top, because `program()` is the only arming site that also closes the run it replaces and that close is one of the five producers. **per-run, FIVE DEFENSIVE sites,** ungated and stated as such: the RC-37 `programDropped`/ready exit (its live arm returns first; its guard admits only `programming`/`ready`, phases that cannot hold a reading), `beginFreeRow()` and `cancel()` (every route into them passes `fail()` or the `disconnected` handler, and `cancel()` nulls `runRef`, so every later `closeRecord` returns at its no-record guard), and `connect()`/`teardown()` (TRIPWIRES: reachable only because no surface offers Connect with a run still open and nothing unmounts this hook and then closes the run it was holding — R10 reconnect would arm them) | no / no / no |
| mint-refusal dedupe (`partialMintRefusedRef`: `Set<number>`) | the first mint refusal for an interval index, so the ring's `partial-mint-refused reason=… idx=…` is recorded ONCE per index rather than per frame | with the reading above, at every one of the same sites — the Set is per RUN, and its own leg (M2.9) is what proves the dedupe is per-index rather than per-frame | no / no / no |

A partial is written on every close whose `endedBy` is in clause 4's
allowlist — five producers, not three. Four commit through `closeRecord` in
`useMonitorSession.ts` (the End arm, which writes `rower` or `link-lost` by
`linkGone`; `endByMachine`'s `terminated` arm, the PM5's own Menu, writing
`rower`; the live `programDropped` arm; and `program()`'s catch writing
`program-failed`), so the read belongs INSIDE `closeRecord`, gated on
I-B1's four-member allowlist and on I-B3/I-B6 — one site, never per arm.
The fifth, the continuity reset (`completeContinuityReset` → `link-lost`,
committed through `applyProducerCommit`), never touches `closeRecord` and
needs the same read at its own commit. `interrupted` (Today's unlogged row,
`completeWithoutWireEvidence`) runs outside the hook and writes none; a
partial cannot be written twice (`closeRecord` returns on
`completedAt !== null`). **The arm the first draft omitted — the machine's
TERMINATE — is the one every committed capture exercises, because a replay
cannot press a button; it delivers workout state 11.**

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
  `MACHINE CONFIRMED · WORK ONLY`, a stop AFTER a lost boundary (the
  `1 of 5 intervals measured` row, so the "measured, not progress" reading is
  approved on sight), a link-lost row with every step measured (line, no
  suffix), and the History list chip. Rendered as
  `2026-09-02-door-gate-a.html` (23 frames, contrast table); it asks five
  approvals — the marker words, "measured not progress", the time on the
  no-reading line, `MONITOR`, and the chip's slot (leading slot truncates the
  title; the numbers-line slot is recommended and leaves Today's last-three
  rows chipless). Every colour
  pairing's contrast ratio stated.
- **Gate 0-B (before PR B's tasks):** the step row carrying a partial for
  BOTH interval kinds — a distance interval (250 m / 1:03 against 500 m) and
  a time interval (2:10 / 480 m against 3:00; the target slot holds a
  duration and the partial pair holds metres and clock) — beside a measured
  row; the same row on a link-lost close, where the pair is what was last
  received (§5.1); the saved-row heroes unchanged by it (I-B5 made visible);
  and the lost banner both arms. **APPROVED by James 2026-09-02
  (`2026-09-02-door-gate-b.html`, all recommendations taken):** (a) the pair
  `250 m · 1:03` then the dash on a distance row; (b) `2:10 · 480 m` against a
  `3:00` time row; (c) the link-lost reading marked by a caption under the
  table in the targets-only caption's type, replacing that caption on a
  single-interval link-lost row (an inline word collapses the pace-ref cell
  to zero, measured); (d) an over-target partial (`503 m` against `500 m`)
  still reads as partial — no pace, no rate; (e) the lost banner's zero-kept
  arm renders the title alone, AND the two sibling surfaces that say "Nothing
  kept." — the connected surface's ended-frame line and `LogSession.tsx`'s
  dropped-program strip — drop it the same way in this PR, since the strip
  would otherwise sit above a step row showing the metres (RF23's shape);
  (f) no split, pace or rate is derived from the pair; (g) the row's
  `aria-label` APPENDS the spoken pair to `, not measured` (the accessible
  name may not claim more than the visible row, which still ends on the dash),
  in the artboard's own TWO forms — the draft written into this section
  before the gate said "stopped at 250 m · 1:03" and is superseded by what
  James approved and what shipped: `, not measured, stopped at 250 m after
  1:03` on a `rower`/`program-*`/`interrupted` close, and `, not measured,
  last reading 250 m after 1:03` on a `link-lost` one, where the pair is what
  GOT THROUGH. The middle dot goes (it carries no meaning aloud) and the
  METRES lead on BOTH interval kinds, unlike the visible order, because "2:10
  after 480 m" says the metres are a duration. The DISTANCE
  hero already counts the abandoned interval's rowed metres while the rows
  cannot show them, so a rower can subtract and find a gap; James accepted
  the gap silently — the pair never enters a hero (I-B5) and no sentence is
  owed. Cannot be approved
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
  as an unmarked short row. Filed alongside (RF14): **a connected Just Row closed by End or
  TERMINATE cannot reach Concept2** under that fence (`rower`); whether the
  driver's terminal branch can close a free row `finished` is SUSPECTED and
  unsettled (§1.1 clause 2).
- **The PM5 has the concept**: WORKOUTSTATE distinguishes WORKOUTEND from
  TERMINATE (`domain/monitor/types.ts`, WORKOUTSTATE doc); we store the
  derivative (`endedBy`), and our End button also writes `terminated`, so
  venue is lost by design.
- **At a terminate the PM5 DOES send the in-flight interval's own
  0x0037/0x0038** (`walk-2026-08-28/end-on-interval-1-recording.jsonl.gz`,
  t=15442: el=8.5 d=15) and we decline it, because `toActualIndex` returns
  `null` for `state === "terminated"` — CSAFE-DEF footnote 12 says the
  interval number "will change depending on where you are in the interval",
  so the machine reports the QUANTITY but cannot ATTRIBUTE it. That is
  exactly what "ours" means here and all it means: the ATTRIBUTION is ours,
  the two numbers are the machine's own. **This section used to say "our
  number, never the machine's", which reads as a claim about PROVENANCE and
  is wrong as one** (PM final gate, 2026-09-03): the pair is
  `MonitorFrame.distanceMeters`/`elapsedSeconds`, and `types.ts:31-33` says
  those are _"0x0031's OWN Elapsed Time / Distance, exactly as the machine
  reports them"_. The sentence mattered because it invites the next agent to
  compare the pair against the PM5's own in-flight reading and call the
  agreement a check — same bytes, RF11's mirror. The first implementer to
  see that declined 0x0037/0x0038 event must still not reach for it.
- `ls docs/superpowers/research/` covers nothing here (RF18 check run).

---

## §8 — Decomposition, gates, and what makes each one red

### 8.1 PR A — the stored word (TRIAD: word meaning; antagonist DELTA on the plan; PM final gate)

Tasks: (1) migration 0022 + the eleven mirrors + `logSource.ts` four-case
contradiction + rollback-floor row; (2) `no-reading` posted from
`connectedArrivalWithNoRecord` + `sourceLabel`/`buildMeta` positive gate +
`mapping.ts:49` on `source`; (3) the PARTIAL predicate as one pure function
over `StoredLog` + the SQL-derived list boolean + the allowlist marker, both
surfaces; (4) RC-18's seven sites + the reconciled comment + the
deviceName-band guard's `pm5`-preserving substitution; (5) riders 1–3;
(6) e2e + screenshots. **The sunset's own task is gone — #273 shipped it.**

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
device with `name: undefined`); the nameless-erg save posting
`source: "pm5"` with the substituted caption (mutate by restoring
`body.source = "manual"` → `expected 'manual' to be 'pm5'`). **The sunset's
gates are NOT PR A's to claim** — they shipped with #273 and live at
`source.integration.test.ts:139` and `:463`.

### 8.2 PR B — the stored number (TRIAD: number meaning; antagonist FULL pass on its plan — a new stored shape; PM final gate)

Tasks: (0) widen the THREE step types + the route's explicit field list and
bounds (non-negative, finite; no upper bound against the target — a partial
can legitimately exceed a distance target by the last stroke); (1) the ref
and its lifetime on `MonitorRun` (both stored shapes, §5.1); (2) ONE read
inside `closeRecord` gated on I-B1/I-B3/I-B6, plus the same read at the
continuity reset's commit — five producers, two sites; (3) the step row
rendering for both interval kinds; (4) I-B5's reader census as a test (every
summing reader over a row with partial keys equals the same row without
them); (5) the lost banner; (6) e2e + screenshots.

Gates. **The headline gate is two tests joined by one asserted body fixture**
— nothing can host both halves: the replay half needs jsdom (`client`,
`src/**`) and the POST→GET half is a supertest route test (`unit`,
`server/**`, `data.test.ts`'s idiom). The fixture is ONE exported declaration
(`src/session/partialGateFixture.ts`) that both halves import.

**AS SHIPPED — five replay legs, and what each one gates** (this section was
written before implementation; it named two captures and a synthetic frame.
The shipped set is below, and every value in it was MEASURED by
`partialReplay.test.ts` against the committed captures, not inferred):

- **Leg A** — `walk-2026-08-28/end-on-interval-1-recording.jsonl.gz`, closed
  by the WIRE terminate 8.3 s into interval 1. Zero attributable actuals, so
  the partial (`{ intervalIndex: 0, meters: 15, seconds: 8.28 }`) is the only
  number the row has. **Biting mutation: Task 3's read reverted** (`const
  banked = withFinalSeries`) → `expected undefined to strictly equal
  { intervalIndex: +0, meters: 15, …(1) }`.
- **Leg B** — `rest-boundary-recording.jsonl.gz`, same wire close, in interval
  2: the banked boundary actual is untouched and the pair
  (`{ intervalIndex: 1, meters: 37.6, seconds: 10.9 }`) rides the NEXT step.
  Same biting mutation.
- **Leg C1** — the END-BUTTON arm, as a constructed ordering (RF26): the same
  capture cut at `e.t <= 76200` (between the last rowing frame at t=76039 and
  the first resting frame at t=76489), then `endSession()`. Banks
  `{ intervalIndex: 0, meters: 196.6, seconds: 59.74 }` — the spec's own
  inference, MEASURED and identical. The only POSITIVE End-arm gate.
- **Leg C2** — I-B3 under an End close: the same capture cut DURING the rest.
  Nothing is banked. **Biting mutation: M7.1**, the `resting` clear deleted →
  the completed interval is stored as a partial reading 196.6 m / 59.74 s.
- **Leg D** — `walk-2026-08-25/rests-finished-recording.jsonl.gz`, the corpus's
  own NATURAL finish. The close fires on the WORKOUTEND frame 180 ms before
  the final boundary arrives, and a WORKOUTEND frame is neither `rowing` nor
  `resting`, so a live reading (`{ intervalIndex: 2, meters: 215.7, seconds:
  59.52 }`) is still held at the instant `closeRecord` runs. **Every gate
  except I-B1's allowlist would let it through** — which is what makes I-B1
  load-bearing rather than defensive, and why this leg was added. It also
  asserts `measuredIntervalCount(actuals) === 3` (I-B2 on a row that really
  did finish).
- **One expected divergence per replay**, declared: each capture's own barrier
  timeout on its last transmit (`tx#75`, `tx#839`), an artifact of replaying a
  transmit nothing answers.

(b) That same fixture posted and read back through `GET`
(`data.test.ts`; mutate M0.1 — remove the new `if` lines → the keys vanish →
`expected { label: '1:00 @ 2:32', …(2) } to strictly equal { …(4) }`).
**M7.3 (change one number in the fixture module) reddens the REPLAY half and
leaves the ROUTE half green, by design and measured** (`Tests 1798 passed`):
the route leg posts the fixture and asserts the fixture, so it is an identity
over whatever the declaration says. What it gates is the round trip; what
M0.1 gates is the field list. No single mutation reddens both, and saying so
is the honest form of the claim.

I-B6: a synthetic frame carrying a banked interval's index after its actual →
no partial (mutate the `run.actuals` check → red). The old-server direction of
the additive matrix is NOT tested — a hand-written copy of the old allowlist
would be a mirror (RF11) — it is argued in §5.1 from the validator's own
comment and stated as such.

**M2.3 (the MINT-side I-B6 guard) is GREEN BY DESIGN and stays**: the record
is byte-identical with it deleted, because `withPartial` re-checks I-B6 at the
close. Its value is the ring entry it writes (`partial-mint-refused`), which
is what a diagnostics reader needs to see the lag window happen at all. Stated
here rather than left as an unexplained green (RF21).

### 8.3 Owed before PR B's plan, no hardware

**SETTLED 2026-09-02 at the harden pass (PRIMARY, by replay through the real
driver over committed captures):** `IntervalActual` N arrives at the END of
N's programmed rest (59 941 ms after the work→rest frame on
`walk-2026-08-28/rest-boundary-recording.jsonl.gz`; 180 ms after the last
rowing frame on the r0 keystone `walk-2026-08-16/session-1-keystone-2x250r0.jsonl`
— the lateness is a property of programmed rest). I-B3 is written from it.
§1.1's "all matched, `endedBy = rower`" case is therefore reachable only by an
End pressed in the instant between the last interval's actual and WORKOUTEND
— on an r0 program, ~180 ms.

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

- ROADMAP register: **a connected Just Row closed by End/TERMINATE cannot be
  sent to Concept2** (`mapping.ts:50`); the `finished` path is unsettled.
- ROADMAP sunset row: **DONE** — the blast-radius correction (all saving, not
  the derive path) and the tester-floor confirmation both landed with
  #273 / v0.35.0 on 2026-09-02, which reconciled that row itself. Nothing
  owed here.
- `storedSummary.ts:74` and `:81` both point at a `## Phase LM` ROADMAP heading
  that no longer exists; PR A repoints both at this spec.
