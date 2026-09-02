# Wave F — door **PR A** (the stored word) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A saved row says what happened to it. A connected row stopped short
of its plan reads `STOPPED EARLY · 2 of 5 intervals measured` (or the right
sentence for whoever ended it) on the detail screen and wears a short chip in
History. A connected session that measured nothing reads `NO MONITOR READING`
with its clock time instead of `LOGGED BY HAND`. A nameless erg stores
`MONITOR`, not an invented model number. Plus the three stale server riders
that ride this migration by James's ruling. **The `source` sunset is NOT in
this plan any more** — it shipped on its own in #273 / v0.35.0 on 2026-09-02
(see "What #273 already landed" below).

**Architecture:** One new `log_source` enum member (`no-reading`) through ten
mirrors and a Postgres `ALTER TYPE`; one new pure predicate over the stored
row (`partialCloseReason`) that the detail screen renders directly and the
History list reaches through an equivalent SQL boolean in the list
projection; a literal swap at seven `?? "PM5"` sites; a `DROP COLUMN`, two
comment reconciliations and one legacy-guard removal.

**Tech Stack:** React 19 client; Express 5 server; Drizzle/Postgres migration
0022; Vitest (unit / client / integration projects); Playwright (e2e +
screenshots).

**Spec:** `docs/superpowers/specs/2026-09-02-door-partial-design.md` — §1, §2,
§3, §4, §6, §8.1, §9, §10. **PR B / §5 is NOT in this plan.** Read §1–§4
before any task; every behavioural rule below is argued there.

**Gate 0-A (APPROVED, copy is FINAL):**
`docs/superpowers/specs/2026-09-02-door-gate-a.html`. Every user-visible
string in this plan is copied from that artifact, not from the spec's draft
table. Where the two differ, the artifact wins.

---

## Global Constraints

These are the spec's binding lines. They are constraints, not suggestions;
each one already cost somebody a round somewhere.

- **Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-door`
  (branch `wave-f-door`, base head `fcf2d4f9`). Run
  `git rev-parse --show-toplevel` before EVERY commit and confirm it prints
  that path. **Every shell write uses an absolute worktree path or a `cd` in
  the SAME command** (RF20 — five stray main-checkout writes so far).
- All commands run in `<worktree>/app/` unless stated. Node 26:
  `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"`.
- **No backfill in 0022.** PostgreSQL 18, PRIMARY, verbatim: _"If `ALTER TYPE
  ... ADD VALUE` … is executed inside a transaction block, the new value
  cannot be used until after the transaction has been committed."_
  (https://www.postgresql.org/docs/18/sql-altertype.html). Drizzle's migrator
  runs each file in one transaction, so ANY statement in 0022 that writes
  `'no-reading'` fails. Old `manual` rows that were really no-reading are
  indistinguishable and stay `LOGGED BY HAND`, permanently.
- **A `no-reading` row carries NO `deviceName`**, like `manual` and `timer`.
  The only name reachable on that path is `loadLastDevice()`, a best-effort
  LAST-USED name, and posting it was already rejected in writing at the site
  (`src/log/storedSummary.ts:66-73`) and by a recorded PM ruling
  (`pm-ledger.md:2710-2716`, _"Prefer the false negative."_).
- **The biconditional SURVIVES:** `deviceName ≠ null ⟺ source = 'pm5'`.
  `pm5` REQUIRES a name; `timer`, `manual` and `no-reading` all FORBID one.
  `server/logSource.ts`'s switch widens to four cases saying exactly that.
- **`N` = `steps.filter((s) => measuredElapsedSeconds(s) !== undefined).length`**
  — the stored door's own generalisation
  (`src/log/storedSummary.ts:801`), never a new count. `M = steps.length`.
  Do NOT re-implement the rule; call the function. **PARTIAL ⟹ `N < M`** (clause
  3 guarantees an unmeasured step), so the suffix can never read `5 of 5`.
- **Only `link-lost` keeps an ungated line.** `LINK_LOST_LINE` renders on
  `endedBy === "link-lost"` ALONE, steps-independent, exactly as today
  (`storedSummary.ts:960-962`; a release-noted promise,
  `releaseNotes.ts:351`). It gains the `· N of M intervals measured` suffix
  only when all four PARTIAL clauses hold. **The other four words render ONLY
  when all four clauses hold.**
- **Allowlists, never negations.** Clause 4 is a five-value allowlist, never
  `endedBy !== "finished"` (which would mark every legacy `null` row partial).
  The marker table is keyed by value equality, so a future sixth close reason
  renders NOTHING rather than a wrong word.
- **`MONITOR` is an uppercase LITERAL.** Nothing uppercases the source line
  (`grep -c text-transform app/src/index.css` → 1, not on `.summary-meta`).
  `"monitor"` would render lowercase beside `TIMER` and `LOGGED BY HAND`.
- **Fix-forward only, no backfill for RC-18.** Rows already carrying `"PM5"`
  are indistinguishable from ergs that genuinely advertised "PM5" (the common
  case). A backfill would corrupt correct data to fix a rare one.
- **`LogSeed.steps[].kind` stays the literal union** `"warmup" | "work"` →
  `"work"`, never widened to `string` (Phase WU's binding sub-ruling).
- **`deriveLogSource` SURVIVED the sunset** as migration 0020's parity oracle
  (`server/routes/source.integration.test.ts:463`, _"the migration's own CASE
  and deriveLogSource agree on every row"_; 0020's own header cites that test
  by name). #273 already deleted the route's call and added the SUNSET
  paragraph at `server/logSource.ts:11-16`. **One residual is still owed and
  Task 1 carries it:** `logSource.ts:28` still ends the older paragraph with
  _"at the first tag after this ships, `source` becomes required on POST and
  this function is deleted"_ — the sunset fired and the function was kept, so
  that sentence is now false. Task 1 already edits this file (the four-case
  switch); the reconciliation rides there.
- **The ELEVEN mirrors, by name** (§2.4). Only mirrors 4, 5 and 7 error on
  their own if you forget them; every other one is a string, an array, a
  helper union that fails only at a seeding site, or SQL. Each line
  re-verified at `fcf2d4f9`; mirror 11 is NEW — #273 created it:
  1. `server/db/schema.ts:152` — the pgEnum array.
  2. `app/domain/types.ts:101-102` — `LogSource` + `LOG_SOURCES`.
  3. `server/routes/data.ts:1676` — the user-facing membership 400 message
     literal (`"source must be one of pm5, timer, manual"`). **Not `:1672`**,
     which is #273's separate `"source is required"` refusal and lists no
     members.
  4. `server/logSource.ts:65-82` — `logSourceContradiction`'s switch
     (compile-enforced: total, no `default`).
  5. `src/log/storedSummary.ts:299-308` — `sourceLabel`'s switch
     (compile-enforced: total, no `default`).
  6. `app/e2e/screenshots.spec.ts:2570` — the `postLog` helper's `source?` type.
  7. `src/session/summaryModel.ts:1210` — `NO_MONITOR_READING_SOURCE`, the
     live word the new stored arm must equal (import it; do not retype it).
  8. `server/routes/source.integration.test.ts:180` — the list-projection
     `arrayContaining` (NOT self-red: `arrayContaining` passes with a short
     array; extend it deliberately).
  9. `server/routes/source.integration.test.ts:268` — pins the exact
     membership 400 message; goes red on day one.
  10. `drizzle/0022_*.sql` — the migration itself.
  11. `app/e2e/log.spec.ts:89` — `postLog`'s own `source?` type, added by
     #273. Compile-enforced (a leg seeding `no-reading` through this helper
     will not typecheck against a short union), so it goes red on use, not on
     omission — widen it only if a Task 7 leg seeds `no-reading` here.
  **The dangerous one:** `LOG_SOURCES` is `readonly LogSource[]`
  (`domain/types.ts:102`), NOT a tuple — a short array compiles clean, and
  `routes/data.ts:1675` validates the wire against it, so omitting
  `no-reading` there 400s every save of the new member with nothing red. The
  POST seam test (Task 1) is what makes that omission red.
  **Census command that actually finds them** (the spec's prescribed
  `grep -rn '"pm5", "timer", "manual"' app` returns THREE and cannot go red):
  ```
  grep -rEn 'pm5.{0,4}timer.{0,4}manual' app | grep -v node_modules
  ```
  It returns 9 hits at `fcf2d4f9` (re-run after #272 and #273; same count,
  different lines), and every one is classified:
  `schema.ts:152` (mirror 1), `domain/types.ts:102` (mirror 2's TUPLE only),
  `data.ts:1676` (mirror 3), `screenshots.spec.ts:2565` (a comment beside
  mirror 6), `source.integration.test.ts:180` (mirror 8), `:268` (mirror 9),
  `:447` (a genuinely stale TITLE), `drizzle/0020_*.sql:33` (the enum's
  creation, not mirror 10 — 0022 does not exist yet), and
  `source.integration.test.ts:427`, which is **NOT stale**: it names what
  0020's backfill produced for pre-0020 rows, an outcome list rather than the
  enum's membership. Do not touch it.
  **The census MISSES four mirrors — say so rather than trusting it alone.**
  `domain/types.ts:101`'s type alias escapes the window (`" | "` between the
  members is 5 characters, over `.{0,4}`), mirrors 4, 5 and 7 put their
  members on separate `case` lines, and mirror 11
  (`e2e/log.spec.ts:89`) is a `" | "`-separated union like the alias. Those
  are the compile-enforced ones, which
  is why the omission is survivable — but a census that silently drops the
  UNION beside the tuple it does find is the RF11 shape, and the tuple is the
  half that compiles clean when short.
- **Re-check the migration index AT GENERATION.** 0019, 0020 and 0021 were
  all regenerated on rebase. Before `pnpm db:generate`, run
  `gh pr list --state open --json number,title` and check every open PR for a
  competing `drizzle/` file. Record the check in the migration header, the way
  `drizzle/0021_crazy_gamma_corps.sql:26-27` does.
- **The additive matrix is stated per task where it bites** (Tasks 1, 2).
  A fourth ENUM MEMBER is NOT additive the way its COLUMN was: an old server
  ignores an unknown body KEY but 400s an unknown enum MEMBER at
  `data.ts:1675` with no client retry (the client's only retry strips
  `workoutId`).
- **Every new assertion gets a NAMED mutation with the failure text it must
  produce** (RF21), recorded in the task report. **Commit the real change
  BEFORE running any mutation probe** (RF22) so every revert is a no-op
  against a clean file. `git stash` is forbidden (shared stack).
- Typed-lint ratchet: no new suppressions. TDD: failing test first. Per-file
  coverage for every file touched (RF2), read from `app/coverage/`, not the
  aggregate gate.
- **Test invocation footguns:** never bare `vitest run` (Node 26 webStorage vs
  jsdom → ~445 phantom failures). `pnpm test --project client -- <pattern>`
  silently runs the FULL suite. `pnpm exec vitest run --project client <file>`
  runs client files OUTSIDE jsdom. Scope with
  `pnpm exec vitest run --project client -t "<name>"`. **Read BOTH summary
  lines** — "Tests" says all-passed while a file that failed to LOAD collects
  zero; grep "Test Files" too.
- House style: no em-dashes in user-facing copy (middle dot `·`); CSS custom
  properties only, never raw hex; hit targets ≥44×44; contrast computed and
  stated as a number, never judged by eye.

---

## What #273 already landed (re-scope, 2026-09-02)

This plan was written at `03352ea2`, before two merges landed on main. It is
re-scoped here against `fcf2d4f9`.

- **#273 / v0.35.0 shipped the `source` sunset on its own.** `POST /api/logs`
  already requires `source`: absent is `400 {error: "source is required",
  field: "source"}` (`server/routes/data.ts:1671-1674`), the `deriveLogSource`
  call and the `source=derived` console line are gone, every server and e2e
  fixture already names its door, `docs/RELEASING.md:45-49` records the API
  break, and the v0.35.0 release note states the floor. **Old Task 7 is
  DELETED**; what did not ship rides Task 5 (below). The ROADMAP's own sunset
  row was reconciled by #273 and is not touched again here.
- **#273 did NOT do three things old Task 7 planned, and two of them were
  deliberate reversals of this plan's DELTA verdicts.** (a) The three frozen
  `V0_*_LOG_BODY` fixtures were NOT inverted into 400 legs (verdict B3) —
  they each GAINED `source` with a comment naming it the one deliberate
  departure from the frozen wire shape (`data.test.ts:1143`, `:2997`,
  `:3327`, inside the bodies at `:1123`, `:2974`, `:3310`), and the sunset's
  own gate is the single 400 leg at `source.integration.test.ts:139`.
  (b) Both e2e `postLog` helpers got a blanket derive-emulating default
  (`log.spec.ts:93-99`, `screenshots.spec.ts:2644-2650`), which verdict M-4
  and old Task 7's step 5 both
  forbade as a hand-copy of `deriveLogSource`. Both are SHIPPED and are not
  this PR's to relitigate — recorded so a reviewer is not surprised to find
  the plan's ruling and main's code disagreeing.
  (c) `logSource.ts:28` still promises the function will be deleted; Task 1
  reconciles it.
- **#272 (a Just Row stands in for a plan session) changed nothing this plan
  depends on.** `LogInput.advancesPlan` became optional and `PlanLink` gained
  `workoutId` (`stores/logs.ts`), but `source`, `endedBy`, `deviceName` and
  the `LOG_LIST_COLUMNS` projection are untouched — `source` is still
  `logs.ts:306` and `endedBy` still `:316` inside the same projection object,
  now `:288-359`. Both Just Row doors still post `steps: []`
  (`JustRowLog.tsx:201`, `:232`), so Task 3's clause-2 argument and Task 4's
  `jsonb_array_length > 0` leg stand unchanged. #272 DID add four more
  `.free-row-chip` assertions (seven now, listed below), which widens the
  blast radius of reusing that class and strengthens Task 4's own-class
  decision.

---

## Reachability and citations verified at `fcf2d4f9`

Every file:line this plan uses, verified by reading the file at THIS head
(not transcribed from the spec, the ROADMAP, or this plan's own previous
revision — the last three antagonist passes each caught a stale
transcription, and two merges have moved these lines since).

| Subject | Verified location | Note |
| --- | --- | --- |
| pgEnum `log_source` | `app/server/db/schema.ts:152` | "Three mirrors" comment at `:144-151` |
| `LogSource` / `LOG_SOURCES` | `app/domain/types.ts:101` / `:102` | "Three mirrors" comment at `:98-100` |
| Membership 400 message literal | `app/server/routes/data.ts:1676` | the membership refusal at `:1675-1678`. #273's separate absent-`source` 400 (`"source is required"`) is `:1671-1674` and names no members |
| `logSourceContradiction` switch | `app/server/logSource.ts:65-82` | three cases; total, no `default` |
| `deriveLogSource` | `app/server/logSource.ts:59-63` | SURVIVED #273; its SUNSET paragraph is `:11-16`. `:28`'s _"this function is deleted"_ is the residual Task 1 reconciles |
| `sourceLabel` switch | `app/src/log/storedSummary.ts:299-308` | `?? "PM5"` at `:302`, its comment at `:295-298` |
| `buildMeta` negation gate | `app/src/log/storedSummary.ts:329-338` | `if (source !== "LOGGED BY HAND")` at `:335` |
| `buildStoredTotalLine` null check | `app/src/log/storedSummary.ts:648` | its comment at `:630-642`, the false sentence at `:638-640` |
| Dead `## Phase LM` pointers | `app/src/log/storedSummary.ts:74` and `:81` | both repoint at this spec |
| Warm-up Σ-gap comment | `app/src/log/storedSummary.ts:424-436` | spec said `:427-433`; verified by subject |
| `measuredElapsedSeconds` | `app/src/log/storedSummary.ts:801`, doc `:782-800` | floor `MIN_MEASURABLE_ELAPSED_SECONDS = 1` (`summaryModel.ts:577`) |
| `LINK_LOST_LINE` (shipped literal) | `app/src/log/storedSummary.ts:953` | `"LINK LOST · the app lost the monitor before the end"` |
| `buildLinkLostLine` | `app/src/log/storedSummary.ts:960-962` | `endedBy === "link-lost"` ALONE |
| `buildStoredSummary` return | `app/src/log/storedSummary.ts:970-978` | `linkLostLine` is the field to rename |
| `StoredLog.endedBy` | `app/src/log/storedSummary.ts:191` | `(CloseReason \| "interrupted") \| null`, optional |
| `StoredLog.source` / `.steps` | `app/src/log/storedSummary.ts:158` / `:159` | `source` non-null by construction |
| `StoredLogStep.actualSource` | `app/src/log/storedSummary.ts:113` | `?: "assumed" \| "stopwatch" \| "pm5"` |
| Detail render slot | `app/src/log/FromTheLog.tsx:450-452` | `<p className="summary-meta">`, ABOVE `SummaryHeroesBlock` (`:453`) |
| `MachineConfirmedBlock` | `app/src/log/FromTheLog.tsx:65-66`, rendered `:535` | untouched; marker is a sibling ABOVE it |
| The three old-literal pins | `storedSummary.test.ts:1330`, `FromTheLog.test.tsx:391`, `:406` | exactly three; `FromTheLog.test.tsx:408` is a `/^LINK LOST/` regex and survives |
| Release-noted promise | `app/src/news/content/releaseNotes.ts:366` | says "LINK LOST appears on the session detail" — shortening the sentence does not falsify it |
| `NO_MONITOR_READING_SOURCE` | `app/src/session/summaryModel.ts:1210` | exported const |
| Live no-reading meta (no timeLabel) | `app/src/session/summaryModel.ts:1234-1245` | its comment claims the stored screen gates on the same bucket — **PR A makes that FALSE** (Task 2) |
| `connectedArrivalWithNoRecord` | `app/src/session/LogSession.tsx:387-389` | `from=monitor` AND `readHandoff() === null` |
| `connectedNoRecord` state | `app/src/session/LogSession.tsx:1582-1584` | mount-time `useState`, read at `:2096`/`:2200` |
| Manual door `handleSave` | `app/src/session/LogSession.tsx:2113-2130` | posts `source: "manual"` (`:2126`), NO `deviceName` |
| Monitor door post | `app/src/session/LogSession.tsx:1877-1878` | `deviceName` + `source: "pm5"` |
| **The deviceName-band guard** | `app/src/session/LogSession.tsx:736-752` | #273 changed it from `delete body.source` to `body.source = "manual"` (`:751`); the connected door is still LOST — **Task 5 substitutes `MONITOR` and keeps `pm5`** |
| `useLogForm` (shared submit) | `app/src/session/LogSession.tsx:695` onward | all three doors post through it |
| JR door posts | `app/src/justrow/JustRowLog.tsx:201-207` (timer), `:232-237` (pm5), `:267` (endedBy spread) | both post `steps: []`; #272 moved the lines and changed nothing else |
| `LOG_LIST_COLUMNS` | `app/server/stores/logs.ts:288-359` | `source` at `:306`, `endedBy` at `:316` |
| jsonb-scalar SQL idiom | `app/server/stores/logs.ts:348-350` | the SCALAR path cast — the wrong idiom for a set predicate |
| `EXISTS` set-predicate precedent | `app/drizzle/0020_wooden_millenium_guard.sql:36-39` | `EXISTS (SELECT 1 FROM jsonb_array_elements("steps") AS s WHERE …)` |
| `RecentLog` | `app/src/api/useRecentLogs.ts:19-77` | **carries no `endedBy` today** although the projection selects it |
| `LogRow` render | `app/src/log/LogRow.tsx:201-232` | hero span gated `snippet !== ""` at `:230`; `heroSnippet` at `:179-188` can return `""` |
| `LogRow` consumers | `HistoryList.tsx:195` (`hero`), `Today.tsx:1690` (no `hero`) | Today's last three get no chip — the approved cost |
| `.free-row-chip` rule | `app/src/index.css:548-572` | #272 added the badge-column centring block, so the rule is longer than the plan first read it. **`FreeRowChip.test.tsx:64-70` still pins `rule.selectors` to exactly `[".free-row-chip"]`** — the partial chip needs its OWN class (Task 4) |
| `.free-row-chip` counters | **SEVEN** at this head: `e2e/justrow.spec.ts:165`, `:252`, `:416`; `e2e/screenshots.spec.ts:1251`, `:1260`, `:1265` (`toHaveCount(2)`), `:5044` (`toHaveCount(2)`) | #272 added four (the Plan tab's chip); reusing the class breaks all seven |
| `.today-log-hero` | `app/src/index.css:2446-2452` | `flex: 1 0 100%` — Gate slot B adds flex row + 8px gap |
| RC-18 sites (six + read side) | `driver.ts:1035`, `capacitorBle.ts:465`, `capacitorBle.ts:494`, `webBluetooth.ts:296`, `JustRow.tsx:301`, `surfaceModel.ts:1890`, `storedSummary.ts:302` | census exact |
| `namePrefix: "PM5"` scan filters | `webBluetooth.ts:288`, `capacitorBle.ts:480` | discovery, not copy — DO NOT change |
| "no screen ever renders" claim | `app/src/monitor/useMonitorSession.ts:1100` | contradicted by `surfaceModel.ts:1890` |
| `session.deviceName` provenance | `useMonitorSession.ts:4528`, `:4746` (`update({ deviceName: device.name })`); `INITIAL_STATE` `deviceName: null` at `:1489` | so `surfaceModel.ts:1890`'s null input IS reachable |
| `JustRow.tsx` arm gate | `app/src/justrow/JustRow.tsx:114` (`session.deviceName !== null` before `beginFreeRow`) | `ready` at `:296` requires `armed`, which requires that call — the `:301` fallback is likely dead |
| RC-18 comment sweep sites | `LogSession.tsx:723`, `storedSummary.ts:295-298` | |
| Warm-up guard / union | `app/src/session/logDraft.ts:864` / `:607` | ROADMAP `:754-758` already carries the corrected numbers |
| `preferences.warmup` column | `app/server/db/schema.ts:425` | **ROADMAP says `:369` — stale**; PUT already 400s the field at `data.ts:1862-1863` |
| RC-12 comment | `app/domain/monitor/types.ts:630-631`, strike block `:635-646` | one site only; `schema.ts:237-251` already carries the other CORRECTED block |
| RC-12's finding | `docs/history/phase-rc.md:2054-2056` | _"it covers neither (Phase LM's lifecycle work is the evidence)"_ |
| Rollback table | `docs/RELEASING.md:168-171` | gains a row (0022's `ALTER TYPE` + `DROP COLUMN`) |
| Additive-only API note | `docs/RELEASING.md:45-49` | #273 already added the v0.35.0 break line; **PR A adds nothing here** |
| Deploy-lag evidence | `docs/RELEASING.md:99-103` | six merges, eleven hours, 2026-09-01 |
| `M` is work intervals | `app/src/session/logDraft.ts:856` | `run.program.intervals.forEach` — no rest rows |
| Lost-boundary producer | `app/src/session/logDraft.ts:804-806` | |
| Zero-frame producer | `app/domain/monitor/types.ts:62-63` | |
| Unmatched-interval discriminator | `app/src/session/logDraft.ts:913-917` | no `actualSource` at all |
| `actualMeters`/`actualSeconds` writers | `app/src/session/logDraft.ts:910-911` | inside `buildMonitorLogSteps` only |
| Route 400s explicit `actualSource: null` | `app/server/routes/data.ts:472-480` | so SQL `NOT (s ? 'actualSource')` ≡ TS `undefined` |
| `eligibilityFailure` | `app/server/concept2/mapping.ts:43-55`, null check at `:49` | `SessionLogRow` at `:19-30`; `toMappingRow` at `routes/concept2.ts:136-157`; caller at `:627` |
| Latest migration | `app/drizzle/0021_crazy_gamma_corps.sql` | next index is **0022** |
| Screenshot precedents | `screenshots.spec.ts:2880` (`log-detail`), `:2810` (`log-history`), `:5009` (`justrow-history-chip`), `:971`/`:1034` (`log-monitor-dropped` portrait+landscape pair) | |
| e2e `postLog` helpers | `screenshots.spec.ts:2544-2670`, `log.spec.ts:66-119` | **neither posts `endedBy`** — that is what Task 7 step 1 extends. Both now post `source`, via #273's derive-emulating default |
| e2e frozen old-client helpers | `log.spec.ts:126` and `screenshots.spec.ts:2771` (both `postV0110Log`) | both already carry `source: "timer"` with #273's own comment; **nothing owed here** |

**The sunset blast-radius table is GONE.** It existed to size old Task 7's
fixture sweep across 15 files; #273 performed that sweep. Every POST site
under `app/server` and `app/e2e` already states its `source`, verified by
re-running the table's own two commands at `fcf2d4f9`:

```
grep -rn 'fetch("/api/logs"' app/e2e
grep -rn 'post("/api/logs")' app/server
```

The only sweep this PR still owes is the FOURTH member's own seeding, which
is Task 1's job and lives there.

---

## Deviations from the spec's §8.1 task list, and why

Stated up front so a reviewer is not surprised.

1. **§8.1's task (5) is now RIDERS ONLY (Task 6); its sunset half SHIPPED
   SEPARATELY** as #273 / v0.35.0 on 2026-09-02, before this plan ran. The
   plan originally split task (5) into Task 6 (riders 1–3) and Task 7 (the
   sunset), on the criterion that a reviewer could accept a `DROP COLUMN`
   with no reader and reject a change that makes every pre-v0.34.0 install
   unable to save. That split held; the sunset simply went first and alone.
   **Old Task 7 is deleted and old Task 8 is now Task 7** — this plan has
   SEVEN tasks.
2. **Three defects the spec did not name are carried here**, each with its own
   step and gate. They are findings, not scope creep:
   - **The deviceName-band guard throws away the connected door** (now
     Task 5, step 6). `LogSession.tsx:736-752` fires when the advertised name
     is `""` or >64 chars. It used to `delete body.source`; #273 changed that
     to `body.source = "manual"` (`:751`) so the sunset would not 400 the
     save. Either way the row LIES about its door: a genuinely connected
     session is stored as by-hand. PR A is where the fix belongs, because PR A
     introduces the neutral literal the guard can substitute for the unusable
     name — keeping `source: "pm5"` and its required `deviceName` together.
   - **The partial chip cannot reuse `.free-row-chip`** (Task 4, step 3).
     `FreeRowChip.test.tsx:64-70` asserts exactly one rule whose selectors are
     exactly `[".free-row-chip"]`, and **seven** e2e assertions count or read
     the text of that class (#272 added four). The chip gets its OWN class
     with the same declarations, plus a structural test pinning the two rules
     equal.
   - **The SQL boolean returns NULL, not `false`, on a legacy row** (Task 4,
     step 3). `endedBy` is nullable; `true AND NULL` is NULL in SQL, so a
     `pm5` row with a null close reason would reach the client as
     `partial: null`. `coalesce(..., false)` is required and gets its own leg.
3. **`summaryModel.ts:1234-1245`'s comment becomes false** and is reconciled
   in Task 2. It says the live no-reading screen shows no `timeLabel` because
   "the stored screen gates its own `timeLabel` on the same bucket". After
   §2.3 the stored no-reading row DOES show a time (Gate 0-A decision (c)),
   so the comment's premise inverts. The live screen is out of PR A's scope;
   the comment states the accepted divergence and the question is filed.
4. **`StoredSummaryView.linkLostLine` is RENAMED to `closeLine`** (Task 3). A
   field named `linkLostLine` carrying `STOPPED EARLY` is a stale name, which
   is a defect by this repo's own rule. The DOM slot and CSS class are
   unchanged; only the model field name and its three test references move.
5. **`RecentLog` gains `endedBy` as well as `partial`** (Task 4).
   `LOG_LIST_COLUMNS` has selected `endedBy` since Phase LL Task 4
   (`stores/logs.ts:316`) but `RecentLog` never declared it. Declaring it lets
   the chip's word come from the ONE client allowlist the detail line uses,
   instead of a second copy of the word table in SQL.

---

### Task 1: Migration 0022, the eleven mirrors, and the four-case contradiction

**Files:**
- Create: `app/drizzle/0022_<generated-name>.sql`
- Modify: `app/server/db/schema.ts:144-152` (pgEnum + the "three mirrors"
  comment), `app/domain/types.ts:98-102` (union, tuple, comment),
  `app/server/routes/data.ts:1676` (membership 400 message),
  `app/server/logSource.ts:17-31` (the stale "this function is deleted"
  sentence at `:28`) and `:65-82` (switch),
  `app/src/log/storedSummary.ts:288-308` (`sourceLabel` + its comment),
  `app/e2e/screenshots.spec.ts:2565-2570` (comment + type),
  `docs/RELEASING.md:168-171` (rollback floor row)
- Test: `app/server/routes/source.integration.test.ts` (extend `:180`'s array
  and its seeding loop, `:268`'s message, the stale title at `:447`, and add
  the new POST seam legs)

**Interfaces:**
- Produces: `LogSource = "pm5" | "timer" | "manual" | "no-reading"` — every
  later task imports this from `app/domain/types.ts`.
- Produces: `logSourceContradiction(source: LogSource, evidence: LogSourceEvidence): string | null`
  — four cases, `pm5` requires a name, the other three forbid one.

**Additive matrix, restated because it bites HERE** (§2.4): old client → new
server is already settled — since #273 an old client that posts no `source`
is a 400 whatever this PR does, and one that posts `manual` is unaffected.
**New client → old server 400s `no-reading` on field `source` and the save is
LOST** — the client's only retry strips `workoutId`. The window is the deploy
lag alone (server deploys on merge; the client reaches phones by TestFlight
later), and the rollback-floor row forbids rolling the API back past this tag.
Old client reads new row: `sourceLabel`'s switch has no `default`, so an old
build renders a blank source word plus a `timeLabel` — cosmetic, an OLD
build's behaviour no arm in this PR can change, stated in the release note.

- [ ] **Step 1: Run the mirror census FIRST and paste its output into the task
      report.**
      ```
      grep -rEn 'pm5.{0,4}timer.{0,4}manual' app | grep -v node_modules
      ```
      Nine hits at `fcf2d4f9`, each already classified in Global Constraints
      above — confirm the output still matches that classification exactly.
      Sweep-only: `:447`'s title and `screenshots.spec.ts:2565`'s comment.
      **Leave `source.integration.test.ts:427` alone** (it describes 0020's
      backfill outcome, not the enum). **And do not treat the census as
      complete**: it misses `domain/types.ts:101`, mirrors 4, 5, 7 and mirror
      11 (`e2e/log.spec.ts:89`) — the eleven-item list is the authority, the
      census is a cross-check. A hit you cannot classify is a finding —
      report it.
- [ ] **Step 2: Write the failing POST seam legs** in
      `server/routes/source.integration.test.ts`, modelled verbatim on its
      existing per-value legs (read `:186-273` first and copy the
      `postThenGet` shape):

      ```ts
      it("posted source no-reading with no deviceName is stored as posted (the connected arrival that measured nothing)", async () => {
        const bearer = await bearerToken();
        const row = await postThenGet(bearer, {
          workoutTitle: "No reading",
          steps: [],
          source: "no-reading",
        });
        expect(row.source).toBe("no-reading");
        expect(row.deviceName).toBeNull();
      });

      it("no-reading WITH a deviceName is a 400 naming the field (the biconditional)", async () => {
        const bearer = await bearerToken();
        const res = await request(app)
          .post("/api/logs")
          .set("Authorization", bearer)
          .send(body({ source: "no-reading", deviceName: "PM5 432331249" }));
        expect(res.status).toBe(400);
        expect(res.body).toStrictEqual({
          error: "source no-reading requires deviceName to be absent",
          field: "source",
        });
      });
      ```
- [ ] **Step 3: Run them; verify they fail.** Docker up.
      `pnpm test --project integration -t "no-reading"`. Expect the 201 leg to
      fail with `expected 400 to be 201` (the `LOG_SOURCES.includes` check at
      `data.ts:1675` rejects the unknown member) and the 400 leg to fail on the
      message (`"source must be one of pm5, timer, manual"` ≠ the
      contradiction string). **Quote both failures in the report.**
- [ ] **Step 4: Widen the two compile-enforced switches first** — they are the
      compiler's own census. `server/logSource.ts`:

      ```ts
      export function logSourceContradiction(
        source: LogSource,
        evidence: LogSourceEvidence,
      ): string | null {
        switch (source) {
          case "pm5":
            return evidence.deviceName === null
              ? "source pm5 requires a deviceName"
              : null;
          case "timer":
          case "manual":
          case "no-reading":
            // Door spec (2026-09-02) §2.2: the biconditional
            // `deviceName ≠ null ⟺ source = 'pm5'` SURVIVES the fourth
            // member. `no-reading` is a connected arrival that measured
            // NOTHING, so the only name reachable on that path is
            // `loadLastDevice()`'s best-effort LAST-USED name — posting it
            // would have the row assert that a named erg supplied numbers
            // that came off nothing (`src/log/storedSummary.ts:66-73`;
            // PM ruling, "prefer the false negative").
            return evidence.deviceName !== null
              ? `source ${source} requires deviceName to be absent`
              : null;
        }
      }
      ```
      **Note the message is now interpolated**, which changes `timer`/`manual`
      strings not at all (`"source timer requires deviceName to be absent"`)
      — verify by grepping the two literals across `server/` and `e2e/` before
      and after, and say so in the report. If any test pins them, keep three
      explicit `case` arms with literal strings instead; do not let a refactor
      silently move a user-facing 400.
- [ ] **Step 5: Widen `sourceLabel`** (`src/log/storedSummary.ts:299`) with a
      fourth arm returning the LIVE screen's own constant, imported, never
      retyped:

      ```ts
      import { NO_MONITOR_READING_SOURCE } from "../session/summaryModel";
      // …
      case "no-reading":
        // Door spec (2026-09-02) §2.1: the live screen's own word
        // (`summaryModel.ts`'s NO_MONITOR_READING_SOURCE), imported so one
        // fact never reads as two words live vs from the log (James's
        // 2026-08-18 ruling). This closes the LM exception the module
        // header above describes — its trigger was "the next stored-shape
        // change to the logs table", which is this PR.
        return NO_MONITOR_READING_SOURCE;
      ```
      `storedSummary.ts` already imports from `../session/summaryModel`
      (`:91-102`) — add to that import, do not open a second one.
- [ ] **Step 6: Widen the non-enforced mirrors and the enum, and reconcile
      `logSource.ts:28`.**
      `domain/types.ts:101-102`; `schema.ts:152`; `data.ts:1676` becomes
      `"source must be one of pm5, timer, manual, no-reading"`;
      `e2e/screenshots.spec.ts:2570` becomes
      `source?: "pm5" | "timer" | "manual" | "no-reading";`.
      **Mirror 11 (`e2e/log.spec.ts:89`) is widened ONLY IF a Task 7 e2e leg
      seeds `no-reading` through that helper** — it is compile-enforced, so
      leaving it short can only fail loudly at the seeding site, never
      silently. Say which way you went.
      **Correct BOTH "three mirrors" comments** (`schema.ts:148-151`,
      `domain/types.ts:98-100`) to say ELEVEN and to name which are
      compile-enforced and which are not — quoting the `LOG_SOURCES`-is-not-a-
      tuple hazard by name.
      **Reconcile `logSource.ts:28` in the same edit** — this task already
      opens that file for step 4's switch. Its older paragraph still ends
      _"at the first tag after this ships, `source` becomes required on POST
      and this function is deleted"_. The sunset fired at v0.35.0 (#273) and
      the function was KEPT as migration 0020's oracle; #273 added that fact
      as a new paragraph at `:11-16` but left the old promise standing
      beneath it. Replace the false clause in place — do not append a third
      paragraph correcting the second.
- [ ] **Step 7: Update mirrors 8 and 9 and the ONE stale test title.**
      **`source.integration.test.ts:180`'s `arrayContaining` GAINS
      `"no-reading"`, and its seeding loop gains the matching row.** #273
      already put an explicit-`source` seeding loop inside that same test
      (`:162-175`: one `postThenGet` per member — `pm5` with a `deviceName`,
      `timer` with a stopwatch step, `manual` with neither), which discharged
      the old B4 coupling to the deleted sunset task. **Add a fourth entry —
      `body({ source: "no-reading" })`, no `deviceName` — to that loop, in the
      same commit as the array extension.** Extending the array without
      seeding the row is decoration: `arrayContaining` passes against a short
      array and cannot go red.
      `:268`'s expected message becomes the new literal.
      **`:447`'s title only** gets the fourth member ("the column is the
      enum: Postgres refuses a value outside pm5 | timer | manual"); its body
      still posts `'bogus'` and still expects `22P02`, unchanged.
      **`:427` is NOT stale and must NOT be touched** (found by reading it at
      `fcf2d4f9`): "rows inserted BEFORE 0020 read back pm5 / pm5 / timer /
      manual / manual after it" describes what 0020's BACKFILL produced for
      pre-0020 rows — an outcome list, not the enum's membership. Rows that
      predate 0020 cannot read back a member added in 0022. The census hit
      there is a false positive; record it as one.
- [ ] **Step 8: Generate the migration.** First
      `gh pr list --state open --json number,title,files` (or
      `gh pr diff <n> --name-only`) and confirm no open PR carries a
      `drizzle/` file. Then `pnpm db:generate`. Verify the emitted SQL is
      exactly:
      ```sql
      ALTER TYPE "public"."log_source" ADD VALUE 'no-reading';
      ```
      **Add the rider in the same file** (Task 6 owns its rationale; the
      statement lands here so there is ONE migration):
      ```sql
      --> statement-breakpoint
      ALTER TABLE "preferences" DROP COLUMN "warmup";
      ```
      Prepend a header in this repo's own migration style (model it on
      `drizzle/0020_wooden_millenium_guard.sql` and `0021_crazy_gamma_corps.sql`):

      ```sql
      -- Door PR A (spec `docs/superpowers/specs/2026-09-02-door-partial-design.md`
      -- §2.4 and §4, TRIAD — a stored WORD's meaning). Two statements.
      --
      -- 1. `log_source` gains a fourth member, `no-reading`: a connected
      --    arrival the app holds no reading for. It reads NO MONITOR READING,
      --    the word the LIVE screen has used since Phase LM — one fact, one
      --    word, on both screens.
      --
      --    NO BACKFILL, and not only because it would fail. PostgreSQL 18,
      --    `ALTER TYPE`, verbatim: "If ALTER TYPE ... ADD VALUE ... is
      --    executed inside a transaction block, the new value cannot be used
      --    until after the transaction has been committed."
      --    (https://www.postgresql.org/docs/18/sql-altertype.html). Drizzle's
      --    migrator runs each file in ONE transaction, so any statement here
      --    writing 'no-reading' fails outright. Independently: an old `manual`
      --    row that was really a no-reading arrival is INDISTINGUISHABLE from
      --    a genuine by-hand entry (that is the whole reason the member
      --    exists), so there is nothing to backfill FROM. Those rows stay
      --    LOGGED BY HAND permanently. Stated rather than promised.
      --
      --    ROLLBACK POSTURE: `docs/RELEASING.md`'s rollback table gains a row
      --    for the tag that ships this. A server older than this migration
      --    400s every `no-reading` save (`domain/types.ts`'s LOG_SOURCES,
      --    checked at `routes/data.ts`), and the client's only 400 retry
      --    strips `workoutId` — the save is LOST, not degraded.
      --
      -- 2. `preferences.warmup` is DROPPED (spec §4 rider 1). No reader in
      --    either direction: `routes/data.ts:1862-1863` already 400s the
      --    field on PUT ("warmup is no longer a preference"), and the only
      --    other hit in the tree is `schema.ts` itself. ONE-WAY DDL: rolling
      --    the image back past this tag against a post-drop DB gives a
      --    schema/model mismatch on `preferences` that no code path
      --    exercises — practical risk nil, recorded in the rollback row.
      --    Drizzle's generated DROP COLUMN carries no data-loss guard; the
      --    census above is the guard. Phase WU set this rider's trigger at
      --    "the first server-touching phase after TWO tags"; ten have shipped.
      --
      -- Index 0022: `gh pr list` showed no other open PR carrying a drizzle
      -- file at generation (<DATE/PR NUMBERS — fill in from the actual run>).
      -- RE-CHECK BEFORE MERGE: 0019, 0020 and 0021 were each regenerated on
      -- rebase, and a duplicate index is silently skipped by drizzle's
      -- timestamp ordering.
      ```
- [ ] **Step 9: Add the rollback-floor row** to `docs/RELEASING.md`'s table
      (after `:171`), naming the tag that ships PR A, and say both halves: the
      `no-reading` 400 and the one-way `DROP COLUMN`. **Root markdown is never
      Prettier-formatted — wrap by hand to match the surrounding rows.**
- [ ] **Step 10: Run** `pnpm test --project integration -t "source"` and
      `pnpm test --project unit`, then `pnpm lint && pnpm typecheck && pnpm format:check`.
      All green; both Step-2 legs pass. Read BOTH summary lines.
- [ ] **Step 11: Commit** (`git rev-parse --show-toplevel` first):
      `feat: log_source gains no-reading; drop preferences.warmup (migration 0022)`
- [ ] **Step 12: Mutations (RF21), each reverted against the now-clean file.**
      - **M1.1** Remove `"no-reading"` from `LOG_SOURCES`
        (`domain/types.ts:102`) ONLY — leave the type union. It compiles
        clean (the array is `readonly LogSource[]`, not a tuple). Re-run the
        Step-2 legs: the **201 leg must go red** with
        `expected 400 to be 201` and the body
        `{ error: "source must be one of pm5, timer, manual, no-reading", field: "source" }`.
        This is the compiler-blindness probe §2.4 names by hand.
      - **M1.2** Delete the `case "no-reading":` label from
        `logSourceContradiction`'s combined arm (leave `timer`/`manual`) —
        TypeScript will now error that the switch is not total, which is
        itself the proof that mirror 4 is compile-enforced. Record the
        compiler error text. Then, to prove the RUNTIME leg, instead move
        `"no-reading"` into the `pm5` arm: the **400 leg must go red**,
        reporting `expected 201 to be 400` (a `no-reading` body WITH a
        deviceName now passes). Restore.
      - **M1.3** Change `sourceLabel`'s new arm to return `"LOGGED BY HAND"`.
        No test in this task covers it yet — record that it stays GREEN here
        and is gated by Task 2's `storedSummary.test.ts` leg. (Stating what a
        mutation does NOT catch is part of the record.)

---

### Task 2: The client `no-reading` write, the positive `timeLabel` gate, and the two biconditional readers

**Files:**
- Modify: `app/src/session/LogSession.tsx:2113-2130` (manual door's
  `handleSave`, `source: "manual"` at `:2126`), `:557-563` (the
  `LogFormFields.source` doc comment)
- Modify: `app/src/log/storedSummary.ts:310-338` (`buildMeta`'s gate + its
  comment), `:630-648` (`buildStoredTotalLine` + its comment), `:74` and `:81`
  (dead `## Phase LM` pointers)
- Modify: `app/server/concept2/mapping.ts:19-30` (`SessionLogRow`), `:37-55`
  (`eligibilityFailure` + its comment);
  `app/server/routes/concept2.ts:136-157` (`toMappingRow`)
- Modify: `app/src/session/summaryModel.ts:1234-1245` (the comment PR A
  falsifies)
- Test: `app/src/log/storedSummary.test.ts`,
  `app/src/session/LogSession.test.tsx`,
  `app/server/concept2/mapping.test.ts`

**Interfaces:**
- Consumes: Task 1's `LogSource` and `sourceLabel`'s fourth arm.
- Produces: a `no-reading` row on the wire from the manual door when
  `connectedArrivalWithNoRecord` held at mount.
- Produces: `eligibilityFailure(row: { source: LogSource; endedBy: string | null; workSeconds: number | null; workMeters: number | null })`
  — `deviceName` leaves the parameter shape; `source` replaces it.

**Additive matrix, restated because it bites HERE:** this is the task that
makes a NEW CLIENT post the new member. Until the tag deploys, a phone running
this build against an older API loses the save entirely on this one arrival.
That is the deploy-lag window in Task 1's matrix, and the reason the
ready-for-merge comment carries the tester-floor reminder.

- [ ] **Step 1: Failing tests first, all four surfaces.**
      - `storedSummary.test.ts` — the fourth arm and the allowlist. Build the
        fixture from the file's fullest existing stored row (copy it; do not
        hand-roll a minimum — RF3):

        ```ts
        it("a no-reading row reads NO MONITOR READING and DOES carry a wall-clock time", () => {
          const view = buildStoredSummary(baseStoredRow({ source: "no-reading", deviceName: null }));
          expect(view.meta.sourceLabel).toBe("NO MONITOR READING");
          expect(view.meta.timeLabel).toBeDefined();
        });

        it.each([["pm5"], ["timer"], ["no-reading"]] as const)(
          "%s carries a timeLabel (the app witnessed the moment)",
          (source) => {
            const row = baseStoredRow({
              source,
              deviceName: source === "pm5" ? "PM5 432331249" : null,
            });
            expect(buildStoredSummary(row).meta.timeLabel).toBeDefined();
          },
        );

        it("manual carries NO timeLabel (an off-app session has no moment the app knows)", () => {
          const row = baseStoredRow({ source: "manual", deviceName: null });
          expect(buildStoredSummary(row).meta.timeLabel).toBeUndefined();
        });
        ```
      - `storedSummary.test.ts` — `buildStoredTotalLine` on provenance, not
        `deviceName`: a `pm5` row with a name gets its total line; a
        `no-reading` row with no name does not; **and a hypothetical `pm5` row
        whose `deviceName` is null cannot be constructed on the wire, so the
        leg asserts the SOURCE is the deciding input** by using a `timer` row
        with a non-null `deviceName` — impossible in production but the exact
        discriminator between the two predicates. Comment it as such.
      - `LogSession.test.tsx` — the posted body. Find the existing
        `?from=monitor`-with-empty-store test (`:2526` names the symptom) and
        add a leg asserting the intercepted POST body:
        `expect(posted.source).toBe("no-reading")` and
        `expect(posted).not.toHaveProperty("deviceName")`.
      - `mapping.test.ts` — `eligibilityFailure` returns `"not_monitor"` for
        `source: "no-reading"`, `"timer"` and `"manual"`, and passes `"pm5"`.
- [ ] **Step 2: Run; verify each fails.**
      `pnpm exec vitest run --project client -t "no-reading"` (client project,
      inside jsdom) and `pnpm test --project unit -t "eligibilityFailure"`.
      Expect: `expected 'LOGGED BY HAND' to be 'NO MONITOR READING'`;
      `expected undefined to be defined` on the `no-reading` timeLabel;
      `expected 'manual' to be 'no-reading'` on the posted body; and a
      TypeScript error on `mapping.test.ts` (the row shape has no `source`).
      **Quote each.**
- [ ] **Step 3: The write.** `LogSession.tsx`'s manual-door `handleSave`
      (`:2105`):

      ```ts
      steps: logSteps,
      // Door spec (2026-09-02) §2.1: a connected arrival with no record
      // (`connectedArrivalWithNoRecord`, computed once at mount at :1574 for
      // the same reason it is read at :2088 — a later render must not change
      // what the screen already told the rower) names its own door. No
      // `deviceName` rides with it: the biconditional forbids one on every
      // member but `pm5`, and the only name reachable here is a best-effort
      // LAST-USED name (see this file's :557 comment and
      // `storedSummary.ts:66-73`).
      source: connectedNoRecord ? "no-reading" : "manual",
      ```
      Reconcile `LogSession.tsx:557-563`'s doc comment. It is stale TWICE
      over: it says the manual branch says `manual` "including the no-reading
      arrival" (which this step falsifies), and its last sentence — _"The
      server derives the member only for a body that omits it … a path with a
      sunset"_ — describes a path #273 deleted at v0.35.0. Rewrite both
      clauses; `source` is required on the wire and nothing derives it.
- [ ] **Step 4: `buildMeta`'s positive gate.** Replace the resolved-word
      negation at `storedSummary.ts:335` with an allowlist over the COLUMN:

      ```ts
      // Door spec (2026-09-02) §2.3. Re-derived POSITIVELY, over the column,
      // after the negation below it (`sourceLabel(row) !== "LOGGED BY HAND"`)
      // was found to hand a fourth member a wall-clock time by accident —
      // phase-lm.md:314-318 predicted exactly this. The three members that
      // carry a time are the three whose moment the APP WITNESSED: the
      // connected door, the phone clock, and a connected arrival that
      // measured nothing (Gate 0-A decision (c) — it gains the time BECAUSE
      // the app was there). `manual` is an off-app session and shows none,
      // which is byte-identical to what `buildManualModel` does live.
      // An ALLOWLIST, never a negation: a future fifth member shows no time
      // rather than silently gaining one.
      const TIME_LABEL_SOURCES: readonly LogSource[] = ["pm5", "timer", "no-reading"];
      // …
      if (TIME_LABEL_SOURCES.includes(row.source)) {
        meta.timeLabel = formatTimeOfDay(row.loggedAt);
      }
      ```
- [ ] **Step 5: The two biconditional readers, rewritten to provenance.**
      `storedSummary.ts:648`:
      ```ts
      if (workSeconds === undefined || row.source !== "pm5") return undefined;
      ```
      and reconcile `:638-640`, which currently claims `row.deviceName !== null`
      is _"the SAME signal `sourceLabel`/`buildMeta` above already use"_ — a
      sentence this task makes false. State instead that provenance is what
      the column is FOR, that the null check was convenient rather than
      stated, and that the rewrite is a true no-op for every stored row
      (0020's backfill CASE was `WHEN device_name IS NOT NULL THEN 'pm5'`, and
      `logSourceContradiction` has enforced the biconditional on every write
      since — attacked and held, spec §9).

      `mapping.ts`: `SessionLogRow` swaps `deviceName: string | null` for
      `source: LogSource`; `eligibilityFailure`'s first check becomes
      `if (row.source !== "pm5") return "not_monitor";`; `toMappingRow`
      (`routes/concept2.ts:136`) accepts and forwards `source`. **Check the
      call site at `:627`**: `row` comes from the logs store's `get()`, which
      selects every column, so `source` is present — confirm by typecheck, and
      say so.
- [ ] **Step 6: The two dead pointers and the falsified live comment.**
      `storedSummary.ts:74` and `:81` both point at a `## Phase LM` ROADMAP
      heading that no longer exists — repoint both at
      `docs/superpowers/specs/2026-09-02-door-partial-design.md` §2, and
      rewrite `:74-81` from "what the no-reading row does NOW" (posts
      `manual`, renders `LOGGED BY HAND`, diverges from the live screen) to
      what it does after this PR. Do not append a correction beneath the old
      claim — replace it.

      `summaryModel.ts:1234-1245`: its reason for the live screen showing no
      `timeLabel` ("the stored screen gates its own `timeLabel` on the same
      bucket … so adding one here would put a reading on the live screen that
      the log screen never shows") is now FALSE — the log screen shows one.
      Reconcile it to state the accepted divergence: the STORED no-reading row
      carries a time by Gate 0-A decision (c); the LIVE screen keeps none, and
      whether it should is out of PR A's scope. Also strike the "KNOWN AND
      ACCEPTED DIVERGENCE" paragraph at `:1204-1209`, which says the stored row
      "still reads `LOGGED BY HAND`" — this PR is what retires it.
- [ ] **Step 7: Grep sweep for the retired claim** (the RF-"corrected where
      argued, left where used" rule). Run:
      ```
      grep -rn "LOGGED BY HAND" app/src app/server app/e2e docs/design | grep -v node_modules
      grep -rn "Phase LM" app/src app/server ROADMAP.md
      ```
      Reconcile every hit that asserts the stored no-reading row reads
      `LOGGED BY HAND`, or state why it stands (`releaseNotes.ts:269` and
      `:468` are HISTORICAL note text for shipped versions and must NOT be
      edited — release notes are a record of what each version did).
- [ ] **Step 8: Run** `pnpm test --project unit --project client`, then
      `lint`/`typecheck`/`format:check`. Green.
- [ ] **Step 9: Commit:**
      `feat: a connected arrival with no reading stores no-reading, not manual`
- [ ] **Step 10: Mutations.**
      - **M2.1** Flip `TIME_LABEL_SOURCES` back to the negation
        (`if (sourceLabel(row) !== "LOGGED BY HAND")`). The **`manual` leg must
        stay green and the `no-reading` leg must stay green** — this mutation
        does NOT bite, which is exactly the point: record it and then run the
        one that does. **M2.1b** Change the allowlist to
        `["pm5", "timer", "manual"]`: the `no-reading` timeLabel leg must go
        red with `expected undefined to be defined`. **M2.1c** Change it to
        include `"manual"`: the manual leg must go red with
        `expected '08:15' to be undefined`.
      - **M2.2** Change the manual door's post to `source: "manual"`
        unconditionally: the `LogSession.test.tsx` body leg must go red with
        `expected 'manual' to be 'no-reading'`.
      - **M2.3** Restore `row.deviceName === null` in `eligibilityFailure`:
        the `mapping.test.ts` `no-reading` leg must go red with
        `expected 'not_monitor' to be null`… — **verify the direction**: a
        `no-reading` row has a null `deviceName`, so the old predicate ALSO
        returns `not_monitor`. **This mutation does not bite.** The biting one
        is a row with `source: "timer"` and a non-null `deviceName` (impossible
        on the wire, legal in the type): the new predicate says `not_monitor`,
        the old says `not_finished`. Write THAT leg, mutate, and record it —
        and comment in the test that the row is unreachable in production and
        exists only to make the two predicates distinguishable.
      - **M2.4** Change `buildStoredTotalLine` back to `row.deviceName === null`:
        the Step-1 discriminator leg (the `timer` row with a name) must go red.

---

### Task 3: The PARTIAL predicate and the detail-screen marker

**Files:**
- Modify: `app/src/log/storedSummary.ts` — new exports near
  `measuredElapsedSeconds` (`:782-815`) and replacing
  `LINK_LOST_LINE`/`buildLinkLostLine` (`:947-962`); `StoredSummaryView`
  (`:279-286`) and `buildStoredSummary` (`:970-978`)
- Modify: `app/src/log/FromTheLog.tsx:434-452` (the slot + its comment)
- Modify: `app/src/log/storedSummary.test.ts:1330`,
  `app/src/log/FromTheLog.test.tsx:391`, `:406` (the three old-literal pins)
- Test: `app/src/log/storedSummary.test.ts` (the state table),
  `app/src/log/FromTheLog.test.tsx` (the render)

**Interfaces:**
- Consumes: Task 1's `LogSource`; `measuredElapsedSeconds` (module-private,
  same file).
- Produces, all exported from `src/log/storedSummary.ts`:
  ```ts
  /** The five close reasons that name WHO ended a session. The server enum
   *  (`schema.ts`'s endedByEnum) minus `finished`. A value-equality
   *  allowlist, never `!== "finished"`: `null` is NOT a member and DOES
   *  occur on pm5 rows (a legacy v1/v2 MonitorRun logged from Today —
   *  `monitorRun.ts:228-233`, `routes/data.ts:1738` stores `?? null`), and
   *  a negation would mark every one of them partial. */
  export const PARTIAL_CLOSE_REASONS = [
    "rower", "link-lost", "program-dropped", "program-failed", "interrupted",
  ] as const;
  export type PartialCloseReason = (typeof PARTIAL_CLOSE_REASONS)[number];

  /** The close reason when the row is genuinely PARTIAL, else undefined.
   *  All four spec §1.1 clauses, in the order they are cheapest to refute. */
  export function partialCloseReason(
    row: Pick<StoredLog, "source" | "steps" | "endedBy">,
  ): PartialCloseReason | undefined;

  /** The short word the History chip carries for a close reason, or
   *  undefined for a value outside the allowlist. Shared with the detail
   *  line so the two surfaces cannot name one close two ways. */
  export function partialChipWord(
    endedBy: (CloseReason | "interrupted") | null | undefined,
  ): string | undefined;

  /** THE LIST'S WHOLE RULE, so the two surfaces cannot disagree about the
   *  WORD (DELTA verdict M-3). `link-lost` is UNGATED here exactly as it is
   *  in `buildCloseLine`: a link-lost row the PARTIAL predicate EXCLUDES —
   *  a link-lost Just Row, or one with every step measured — still reads
   *  `LINK LOST · the app lost the monitor` on the detail screen, so a chip
   *  gated on `partial` alone would leave History silent about the one row
   *  the detail screen shouts about. The other four words render only when
   *  the row is partial. Both branches are value equalities, never
   *  negations. */
  export function historyChipWord(row: {
    partial: boolean;
    endedBy: (CloseReason | "interrupted") | null;
  }): string | undefined;
  ```
- Produces: `StoredSummaryView.closeLine?: string` (renamed from
  `linkLostLine`) — `FromTheLog.tsx` renders it in the same slot.

- [ ] **Step 1: The failing state table.** In `storedSummary.test.ts`, one
      `it.each` over the FULL cross product the spec names — seven `endedBy`
      states (the five allowlist members + `finished` + `null`) × four steps
      shapes (`[]`, all measured, one unmeasured, lost-boundary) × two sources
      (`pm5`, `timer`). Build steps from a real library workout via the file's
      existing fixture helper, not by hand (RF3). The named rows the spec
      demands, each asserted explicitly and named in the test title:

      ```ts
      // Just Row: a free row has no plan to be partial against. Every
      // connected JR closes `rower` (useMonitorSession.ts:5010), so this is
      // the leg that would go red if the rule ever stopped excluding it.
      // NOTE (DELTA verdict B1): clause 2 is NOT what excludes it — clause 3
      // already does, because `[].some(...)` is false. The mutation that
      // bites here is clause 3 → `.every` (M3.1), never deleting clause 2.
      expect(partialCloseReason({ source: "pm5", steps: [], endedBy: "rower" }))
        .toBeUndefined();

      // Measurement loss, not a stopped piece: a short step on a `finished`
      // row is a lost boundary (logDraft.ts:804-806) or a zero-frame
      // interval (domain/monitor/types.ts:62-63). Clause 4 excludes it.
      expect(partialCloseReason({ source: "pm5", steps: LOST_BOUNDARY_STEPS, endedBy: "finished" }))
        .toBeUndefined();

      // A legacy row: `endedBy` null occurs on pm5 rows and is NOT partial.
      expect(partialCloseReason({ source: "pm5", steps: LOST_BOUNDARY_STEPS, endedBy: null }))
        .toBeUndefined();

      // All steps measured, ended by the rower: clause 3 excludes it.
      expect(partialCloseReason({ source: "pm5", steps: ALL_MEASURED_STEPS, endedBy: "rower" }))
        .toBeUndefined();

      // A timer row cannot be partial in stored data at all (spec §1.1
      // clause 1: `/session/log` is reached only from isComplete(run),
      // Timer.tsx:477-483, and the abandon path saves nothing).
      expect(partialCloseReason({ source: "timer", steps: ONE_UNMEASURED_STEPS, endedBy: "rower" }))
        .toBeUndefined();
      ```
      Plus **the invariant leg**: over every row the table marks PARTIAL,
      assert `N < M` — clause 3 guarantees it, so the suffix can never read
      `5 of 5`.
- [ ] **Step 2: The failing copy legs**, every literal taken from the Gate 0-A
      artifact (`2026-09-02-door-gate-a.html:168-174`), not from the spec:

      | `endedBy` | detail line (PARTIAL) | chip |
      | --- | --- | --- |
      | `rower` | `STOPPED EARLY · 2 of 5 intervals measured` | `STOPPED EARLY` |
      | `link-lost` | `LINK LOST · the app lost the monitor · 2 of 5 intervals measured` | `LINK LOST` |
      | `program-dropped` | `THE MONITOR DROPPED THE PROGRAM · 1 of 5 intervals measured` | `PROGRAM DROPPED` |
      | `program-failed` | `THE PROGRAM DID NOT LOAD · 1 of 5 intervals measured` | `PROGRAM NOT LOADED` |
      | `interrupted` | `LEFT UNFINISHED · 1 of 5 intervals measured` | `UNFINISHED` |

      And the two ungated `link-lost` legs: a link-lost Just Row (`steps: []`)
      and a link-lost row with EVERY step measured both render exactly
      `LINK LOST · the app lost the monitor`, **suffix-free** — this is the
      release-noted line, and the antagonist's own finding is that a
      "subsumed" marker silently deletes it from exactly these rows.
- [ ] **Step 3: Run; verify red.**
      `pnpm exec vitest run --project client -t "partial"` — `partialCloseReason`
      does not exist (`TypeError: partialCloseReason is not a function` /
      a TS error). **Quote it.**
- [ ] **Step 4: Implement the predicate**, beside `measuredElapsedSeconds`:

      ```ts
      export function partialCloseReason(
        row: Pick<StoredLog, "source" | "steps" | "endedBy">,
      ): PartialCloseReason | undefined {
        // Clause 1 (spec §1.1): only the connected door stores
        // planned-vs-measured steps. `buildMonitorLogSteps` is the ONLY
        // writer of actualMeters/actualSeconds (logDraft.ts:910-911); a
        // timer step never rowed emits actualSplit = targetSplit,
        // actualSource "assumed" — byte-identical to one rowed to plan.
        if (row.source !== "pm5") return undefined;
        // Clause 2: a connected Just Row stores `steps: []` and has no
        // plan to be partial against. Redundant given clause 3 (`[].some`
        // is false); kept as an explicit statement of the rule, not as the
        // thing that enforces it.
        if (row.steps.length === 0) return undefined;
        // Clause 3: an interval never reached carries no `actualSource` at
        // all (logDraft.ts:913-917, "Unambiguous against the row-local
        // discriminant"). `undefined` is the only absence the wire can
        // produce — routes/data.ts:472-479 400s an explicit null.
        if (!row.steps.some((s) => s.actualSource === undefined)) return undefined;
        // Clause 4: an ALLOWLIST of five, never `!== "finished"`.
        const endedBy = row.endedBy ?? null;
        return PARTIAL_CLOSE_REASONS.find((r) => r === endedBy);
      }
      ```
      Then the marker table and the line builder, replacing
      `LINK_LOST_LINE`/`buildLinkLostLine`:

      ```ts
      // Gate 0-A (2026-09-02-door-gate-a.html §(a)/(e), APPROVED): one row
      // per close reason, the full sentence for the detail screen and a
      // short form for the list row (THE MONITOR DROPPED THE PROGRAM is
      // ~240px on a 332px row). Keyed by VALUE, so a future sixth close
      // reason renders nothing rather than a wrong word.
      //
      // `link-lost`'s line SHORTENED here (James, Gate 0-A): it read
      // "LINK LOST · the app lost the monitor before the end" since the
      // cohort-unlock spec; the trailing clause goes so the combined
      // partial line fits. The release note's promise
      // (releaseNotes.ts:351) is that LINK LOST appears on the detail —
      // unchanged.
      // DECLARED FIRST: `CLOSE_REASON_WORDS` reads it in its initialiser,
      // and a `const` below would be a TDZ ReferenceError at module load.
      const LINK_LOST_LINE = "LINK LOST · the app lost the monitor";

      const CLOSE_REASON_WORDS: Record<PartialCloseReason, { line: string; chip: string }> = {
        rower: { line: "STOPPED EARLY", chip: "STOPPED EARLY" },
        "link-lost": { line: LINK_LOST_LINE, chip: "LINK LOST" },
        "program-dropped": { line: "THE MONITOR DROPPED THE PROGRAM", chip: "PROGRAM DROPPED" },
        "program-failed": { line: "THE PROGRAM DID NOT LOAD", chip: "PROGRAM NOT LOADED" },
        interrupted: { line: "LEFT UNFINISHED", chip: "UNFINISHED" },
      };

      // §1.2: `link-lost` keeps its OWN ungated, steps-independent trigger
      // exactly as it has since the cohort-unlock spec — it is a
      // release-noted promise and it renders on rows the PARTIAL predicate
      // EXCLUDES (a link-lost Just Row; a link-lost row with every step
      // measured). The other four words render ONLY when all four clauses
      // hold. Both branches are value equalities, never negations.
      function buildCloseLine(row: StoredLog): string | undefined {
        const reason = partialCloseReason(row);
        if (reason === undefined) {
          return row.endedBy === "link-lost" ? LINK_LOST_LINE : undefined;
        }
        const measured = row.steps.filter(
          (s) => measuredElapsedSeconds(s) !== undefined,
        ).length;
        // "measured", never "progress": after a lost boundary a rower who
        // did two and a bit reads `1 of 5`, true of what the machine
        // reported and silent about what was rowed (Gate 0-A decision (b),
        // approved on the rendered frame). PARTIAL ⟹ measured < steps.length
        // by clause 3, so this can never read `5 of 5`.
        return `${CLOSE_REASON_WORDS[reason].line} · ${measured} of ${row.steps.length} intervals measured`;
      }

      export function partialChipWord(
        endedBy: (CloseReason | "interrupted") | null | undefined,
      ): string | undefined {
        const reason = PARTIAL_CLOSE_REASONS.find((r) => r === endedBy);
        return reason === undefined ? undefined : CLOSE_REASON_WORDS[reason].chip;
      }
      ```
      **`N` calls `measuredElapsedSeconds`, never a reimplementation** — that
      function is the stored door's generalisation of the live surface's own
      `isMonitorRowMeasurable`/`timerMeasurableElapsedSeconds` (its doc comment
      at `:782-800` says so), and the same quantity the lost banner counts.
      There is no fourth definition in this PR.
- [ ] **Step 5: Rename the view field and update the slot.**
      `StoredSummaryView.linkLostLine` → `closeLine`, with its doc comment
      (`:280-285`) rewritten from "present only when
      `row.endedBy === 'link-lost'`" to the two-trigger rule.
      `buildStoredSummary` (`:976`) calls `buildCloseLine`.
      `FromTheLog.tsx:450-452` renders `view.closeLine` — **the DOM and the
      `.summary-meta` class do not change**, so the contrast figure in the
      existing comment (`--ink-3` on `--page`, **6.69:1**, floor 4.5:1) still
      holds; extend that comment rather than replacing it, and add the Gate
      0-A citation. **`MachineConfirmedBlock` is untouched** — the marker is a
      sibling ABOVE it, from the view model, so the block keeps its "reads the
      row and nothing else" constraint (`FromTheLog.tsx:57-64`).
- [ ] **Step 6: Update the three old-literal pins** — `storedSummary.test.ts:1330`,
      `FromTheLog.test.tsx:391`, `:406`. `FromTheLog.test.tsx:408`'s
      `/^LINK LOST/` regex survives unchanged; confirm and say so.
      Then grep the shortened literal's OLD form across the tree:
      ```
      grep -rn "lost the monitor before the end" app docs ROADMAP.md | grep -v node_modules
      ```
      At `fcf2d4f9` this returns **9** hits: **4** code/test (updated here —
      `storedSummary.ts:953`, `storedSummary.test.ts:1330`,
      `FromTheLog.test.tsx:391` and `:406`), 1 in `docs/history/phase-ll.md`,
      2 in `docs/superpowers/plans/2026-08-23-cohort-unlock.md` (`:17`, `:70`)
      — **both of those are RECORDS of what shipped then and must NOT be
      edited** — and 2 in THIS plan (the citations table and Task 3's own
      snippet), which move with the change. The plan previously said "6 hits:
      3 code/test"; that was wrong on both halves and is corrected here. Say
      the recount in the report.
- [ ] **Step 7: Run** `pnpm exec vitest run --project client -t "partial"` and
      the full client + unit projects. Green, both summary lines read.
- [ ] **Step 8: Commit:**
      `feat: a stopped connected row says so, with N of M intervals measured`
- [ ] **Step 9: Mutations.**
      - **M3.1** (rewritten by the DELTA pass — the old version could not
        bite). **Do NOT delete clause 2**: `[].some(...)` is false, so clause
        3 already returns `undefined` for a Just Row and every test stays
        green. Mutate **clause 3** instead, to the form that makes the empty
        case TRUE:
        ```ts
        if (!row.steps.every((s) => s.actualSource === undefined)) return undefined;
        ```
        `[].every()` is `true`, so the Just Row now falls through to clause 4
        and comes back `rower`. The **Just Row leg must go red** with
        `expected 'rower' to be undefined`, and the render leg reads
        `STOPPED EARLY · 0 of 0 intervals measured`. Record the exact text.
        (Run the old mutation too, once, and record that it stays GREEN —
        that green is the evidence for clause 2's comment.)
      - **M3.2** Delete clause 4 (return the raw `endedBy`, unfiltered): the
        `finished` + short-step leg must go red — the row now renders a
        marker where the spec says the copy stays what it is today. Record.
      - **M3.3** Change `N` to count `actualSource` presence
        (`s.actualSource !== undefined`) instead of calling
        `measuredElapsedSeconds`: the LOST-BOUNDARY leg's count must change
        (a step with `actualSource: "pm5"` but `actualSeconds` below the
        1-second floor counts under the mutation and not under the rule).
        **Build the fixture so the two genuinely disagree** — a step with
        `actualSource: "pm5"` and `actualSeconds: 0.4`. If they agree, the
        fixture is wrong, not the mutation.
      - **M3.4** Widen `buildCloseLine`'s non-partial branch to
        `PARTIAL_CLOSE_REASONS.includes(row.endedBy)` (the over-correction the
        DELTA pass caught): the link-lost Just Row leg stays green and the
        **`rower` Just Row leg must go red** with `STOPPED EARLY` appearing on
        a row that should render nothing. This is the mutation that proves
        the ungated line is scoped to `link-lost` alone.
      - **M3.5** Delete the non-partial `link-lost` branch entirely: the two
        suffix-free link-lost legs must go red with
        `expected undefined to be 'LINK LOST · the app lost the monitor'`.

---

### Task 4: The History list — SQL-derived `partial` and the chip

**Files:**
- Modify: `app/server/stores/logs.ts:288-359` (`LOG_LIST_COLUMNS`)
- Modify: `app/src/api/useRecentLogs.ts:19-77` (`RecentLog` gains `partial`
  and `endedBy`)
- Modify (fixtures — `RecentLog.partial` is REQUIRED, so every existing
  builder stops compiling): `app/src/log/HistoryList.test.tsx:24` (`makeLog`),
  `app/src/log/useLogHistory.test.ts:18` (`makeLog`),
  `app/src/today/Today.test.tsx:178` (`const LOGS: RecentLog[]`). Verified by
  grepping `RecentLog` across `src/` at `fcf2d4f9` — these three plus
  `useRecentLogs.ts` itself are every declaration site.
- Modify: `app/src/log/LogRow.tsx:201-232`
- Modify: `app/src/index.css` (a new chip rule beside `.free-row-chip`,
  `:548-572`, and the `.today-log-hero` modifier, `:2446-2452`)
- Test: `app/server/routes/source.integration.test.ts` or a new
  `app/server/routes/partial.integration.test.ts` (list/detail agreement),
  `app/src/log/HistoryList.test.tsx`, `app/src/log/LogRow` coverage via
  `HistoryList.test.tsx`, and a NEW structural test in `app/src/log/`
  (declarations-equal pin; L9 — it needs its own `index.css` path regex,
  see step 5). **`app/src/workout/FreeRowChip.test.tsx` is NOT edited**: its
  one-rule/one-selector pins (`:68`, `:70`) are what forbid the grouped
  selector, and they only stay meaningful untouched.

**Interfaces:**
- Consumes: Task 3's `partialCloseReason` (as the TS oracle in the agreement
  test) and `historyChipWord` (the list's whole word rule, `partialChipWord`
  plus `link-lost`'s ungated arm — DELTA verdict M-3).
- Produces: `RecentLog.partial: boolean` and
  `RecentLog.endedBy: (CloseReason | "interrupted") | null` — both additive on
  the response; `LOG_LIST_COLUMNS` already selects `endedBy`
  (`stores/logs.ts:308`), so only the client type moves for that one.

**Additive matrix note:** `partial` is a DERIVED column, computed at read
time. No migration, no stored shape, nothing to roll back. An old client
reading a new list response ignores an unknown key.

- [ ] **Step 1: The failing list/detail agreement test** (the gate
      `pm-ledger.md:2596` asks for, and RF24's "start upstream of the
      producer" — it POSTs through the real route, then reads through BOTH
      endpoints):

      ```ts
      it("the list's SQL `partial` equals the client predicate over the detail row, for every seeded shape", async () => {
        const bearer = await bearerToken();
        // Seeded through POST /api/logs, never inserted: the producer is the
        // supported one (RF24). Four rows, each a shape the predicate must
        // separate.
        const seeded = [
          { name: "partial", body: { source: "pm5", deviceName: "PM5 432331249", endedBy: "rower", steps: PARTIAL_STEPS } },
          { name: "just row", body: { source: "pm5", deviceName: "PM5 432331249", endedBy: "rower", steps: [] } },
          { name: "finished short", body: { source: "pm5", deviceName: "PM5 432331249", endedBy: "finished", steps: PARTIAL_STEPS } },
          { name: "legacy null close", body: { source: "pm5", deviceName: "PM5 432331249", steps: PARTIAL_STEPS } },
          // DELTA verdict M-3: the divergence class is one field to the LEFT
          // of the boolean. This row is NOT partial (clause 3 excludes an
          // empty steps array) and the detail screen still says LINK LOST.
          { name: "link-lost just row", body: { source: "pm5", deviceName: "PM5 432331249", endedBy: "link-lost", steps: [] } },
        ];
        // …POST each, GET the detail for each id, GET the list once…
        for (const { name, id } of created) {
          const detail = detailById.get(id)!;
          const listRow = listById.get(id)!;
          expect(listRow.partial, name).toBe(
            partialCloseReason(detail) !== undefined,
          );
          // A legacy row must read `false`, never `null` — SQL's
          // `true AND NULL` is NULL, and the client type says boolean.
          expect(typeof listRow.partial, name).toBe("boolean");
          // AND THE WORD, not only the boolean (DELTA verdict M-3). The two
          // surfaces carry different-LENGTH forms of one close reason
          // (`PROGRAM DROPPED` vs `THE MONITOR DROPPED THE PROGRAM`), so
          // what must agree is that they SPEAK on the same rows — a
          // boolean-only agreement passes while `link-lost just row` says
          // LINK LOST on the detail screen and nothing in History.
          expect(historyChipWord(listRow) !== undefined, name).toBe(
            buildStoredSummary(detail).closeLine !== undefined,
          );
        }
        // The divergence this row exists for, named explicitly: NOT partial,
        // and both surfaces still say it.
        expect(historyChipWord(listById.get(linkLostJustRowId)!)).toBe(
          "LINK LOST",
        );
        expect(
          buildStoredSummary(detailById.get(linkLostJustRowId)!).closeLine,
        ).toBe("LINK LOST · the app lost the monitor");
      });
      ```
      **`partialCloseReason`, `historyChipWord` and `buildStoredSummary` are
      all imported from `src/log/storedSummary.ts` into a server test.** If the integration project's config forbids that
      import, put the test in the client project driving a mocked API and
      keep a server-side leg asserting the raw SQL values instead — say which
      you did and why, and do NOT hand-copy the predicate into the test (that
      would be a mirror, RF11).
- [ ] **Step 2: Run; verify red.** `pnpm test --project integration -t "partial"`.
      Expect `expected undefined to be true` — the column does not exist.
      **Quote it.**
- [ ] **Step 3: Implement the SQL boolean** in `LOG_LIST_COLUMNS`, using
      migration 0020's own set-predicate idiom (`0020_*.sql:36-39`), NOT the
      scalar path cast beside it (`stores/logs.ts:341-343`):

      ```ts
      // Door spec (2026-09-02) §1.3: the list cannot evaluate clause 3 —
      // `steps` is deliberately excluded from this projection — so the
      // four clauses are evaluated SERVER-SIDE and the row carries one
      // derived boolean. The shape is migration 0020's own EXISTS set
      // predicate over the array, not the scalar `->>` cast below (a
      // different idiom for a different question).
      //
      // Key ABSENCE in SQL (`not (s ? 'actualSource')`) is exactly TS's
      // `actualSource === undefined`, because `routes/data.ts:472-479`
      // 400s an explicit `actualSource: null` — there is no third state.
      //
      // COALESCE IS LOAD-BEARING: `ended_by` is nullable, and SQL's
      // `true and null` is NULL, not false. Without it a legacy pm5 row
      // with no close reason reaches the client as `partial: null` while
      // the type says boolean. Gated by the "legacy null close" row in
      // the list/detail agreement test.
      //
      // The allowlist is the server enum minus 'finished' — a value list,
      // never `<> 'finished'`, which would mark every legacy row partial.
      partial: sql<boolean>`coalesce(
        ${sessionLogs.source} = 'pm5'
        and jsonb_array_length(${sessionLogs.steps}) > 0
        and ${sessionLogs.endedBy} in ('rower','link-lost','program-dropped','program-failed','interrupted')
        and exists (
          select 1 from jsonb_array_elements(${sessionLogs.steps}) as s
          where not (s ? 'actualSource')
        ), false)`,
      ```
      **`steps` is safe unguarded — this is settled by evidence, not by a
      "confirm on a real row"** (L10): the route rejects a non-array outright
      (`routes/data.ts:1629-1630`, `"steps must be an array"`, and the column
      is NOT NULL), and migration 0020 already ran
      `jsonb_array_elements("steps")` over EVERY row in the table
      (`drizzle/0020_wooden_millenium_guard.sql:36-39`) — it shipped, so no
      stored row can be a non-array. State that; do not re-open it.
      **One thing genuinely to prove at the DB, not by reading:** that the `?`
      operator survives drizzle's parameterisation (drizzle uses `$n`, not
      `?`, so it should — but prove it by the test going green).
- [ ] **Step 4: `RecentLog` gains the two fields**, each with a doc comment in
      the file's own convention (required-and-nullable for `endedBy`,
      required-boolean for `partial`), naming `LOG_LIST_COLUMNS` as the
      source and stating that `endedBy` has been projected since Phase LL
      Task 4 and is only now declared client-side.
- [ ] **Step 5: The chip's own CSS class.** It CANNOT reuse `.free-row-chip`:
      `FreeRowChip.test.tsx:64-70` asserts exactly one rule whose selectors
      are exactly `[".free-row-chip"]` (so a grouped selector fails), and
      **SEVEN** e2e assertions read or count that class at `fcf2d4f9` (#272
      added four): `e2e/justrow.spec.ts:165`, `:252`, `:416`
      (`toHaveText("JR")`) and `e2e/screenshots.spec.ts:1251`, `:1260`
      (`toHaveText("JR")`), `:1265`, `:5044` (`toHaveCount(2)`). Add a sibling
      rule:

      ```css
      /* Door spec (2026-09-02) §1.3, Gate 0-A (e): the History list's
         partial chip. Its declarations are `.free-row-chip`'s
         (index.css:548-572, including #272's badge-column centring block)
         VERBATIM — same 12px mono, --ink-3 on --page at 6.69:1 (floor 4.5:1,
         PASS), same 1px --rule-3 hollow border at 1.56:1, inherited
         unchanged and decorative (the chip's meaning is entirely its text;
         flagged and accepted at Gate 0-A rather than silently decided).
         A SEPARATE RULE, not a grouped selector: FreeRowChip.test.tsx:64-70
         pins `.free-row-chip`'s rule to exactly one selector, and SEVEN e2e
         assertions count or read the text of that class. `LogRow.partialChip.test`
         pins the two rules' declarations equal so they cannot drift. */
      .log-partial-chip { /* … same declarations … */ }
      ```
      Add a structural test asserting the two rules' declaration sets are
      identical (the same `cssRules`/`commentStrippedSource` idiom
      `FreeRowChip.test.tsx:64-70` uses — its one-rule pin is `:68`, its
      one-selector pin `:70`). **Write the new test its OWN path regex**
      (L9): `FreeRowChip.test.tsx:15` resolves `index.css` with
      `.replace(/workout\/[^/]+\.test\.tsx$/, "index.css")`, which is scoped
      to `src/workout/` and silently fails to substitute from `src/log/` —
      the read would then point at the test file itself and the rule lookup
      would come back empty (a green-by-vacuity gate, RF21). Use
      `/log\/[^/]+\.test\.tsx$/` and assert the loaded CSS is non-empty
      before asserting anything about a rule.
- [ ] **Step 6: `LogRow` renders the chip on the numbers line** (Gate 0-A slot
      B — approved: the chip sits beside the numbers it qualifies; Today's
      last three render no numbers line and therefore no chip, the accepted
      cost):

      ```tsx
      const chip = hero ? historyChipWord(log) : undefined;
      // …
      {(snippet !== "" || chip !== undefined) && (
        <span className={`today-log-hero${chip !== undefined ? " today-log-hero-chipped" : ""}`}>
          {chip !== undefined && <span className="log-partial-chip">{chip}</span>}
          {snippet}
        </span>
      )}
      ```
      **The `snippet !== "" || chip` condition is a deliberate widening of
      `:230`'s existing gate** — a partial row with no hero numbers would
      otherwise say nothing at all in the list, which is the exact silence
      this spec exists to break. Gate 0-A rendered the chip only beside
      numbers, so this one shape (chip alone on the hero line) is NOT on the
      approved artboard; name it in the PR's risk note. `.today-log-hero-chipped`
      is the two-line flex change the gate's own note describes
      (`display: flex; align-items: center; gap: 8px`).
- [ ] **Step 7: Failing client tests, written BEFORE step 6's code** (reorder
      locally if you like, but the commit history must show red first): in
      `HistoryList.test.tsx`, a partial row renders its chip on the hero line
      with the right short word; a `partial: false` row renders none; a Today
      row (`hero` false) renders none even when `partial: true`; and the
      chip's element is `.log-partial-chip`, never `.type-badge` or
      `.free-row-chip`. **Plus M-3's two legs:** a `partial: false` row with
      `endedBy: "link-lost"` DOES render `LINK LOST` (the ungated word, in
      lockstep with the detail line), and a `partial: false` row with
      `endedBy: "rower"` renders nothing. Run them red first and quote the
      failure.
- [ ] **Step 8: Run** `pnpm test --project unit --project client` and
      `pnpm test --project integration -t "partial"`. Green.
- [ ] **Step 9: Commit:**
      `feat: History rows wear a short chip when a session stopped early`
- [ ] **Step 10: Mutations.**
      - **M4.1** (rewritten by the DELTA pass — the old version could not
        bite). **Dropping `jsonb_array_length(...) > 0` changes nothing**:
        `exists (select 1 from jsonb_array_elements('[]'::jsonb) …)` is
        already false, exactly as `[].some(...)` is in TS. Mutate the EXISTS
        to its negation instead:
        ```sql
        and not exists (
          select 1 from jsonb_array_elements(${sessionLogs.steps}) as s
          where not (s ? 'actualSource')
        )
        ```
        The **Just Row list row flips to `true` while its detail row says
        `false`** — the agreement test must go red with
        `expected true to be false` on the "just row" name. This is the
        list/detail divergence gate; record its exact message. (Run the old
        mutation once and record that it stays GREEN.)
      - **M4.2** Remove `coalesce(..., false)`: the "legacy null close" leg
        must go red on `expected 'object' to be 'boolean'` (SQL NULL arrives
        as `null`). If it does not, the coalesce is not load-bearing and that
        is itself a finding — report it rather than keeping a decorative wrap.
      - **M4.3 is DROPPED (DELTA verdict M-1).** `<> 'finished'` cannot be
        made to bite by any row this system can produce: `null <> 'finished'`
        is NULL, which the `coalesce` turns into the same `false` the
        allowlist gives, and a sixth `ended_by` value cannot be inserted
        (`ended_by` is a pgEnum — an unknown member 400s at the route and
        `22P02`s at the DB). **State plainly that the allowlist-not-negation
        property is UNGATEABLE in SQL** and that it rests on the comment plus
        the TS side's own clause-4 gate (M3.2), rather than shipping a
        mutation claim that cannot fail. RF21: a claim you cannot make red is
        decoration.
      - **M4.4** Change `LogRow`'s gate from `log.partial` to `true`: the
        `partial: false` leg must go red with a chip rendering on a complete
        row.
      - **M4.5 is DROPPED (DELTA verdict M-2).** Pointing the chip at
        `.free-row-chip` only breaks `e2e/justrow.spec.ts` if a PARTIAL row
        is on the same Just Row pages those assertions count — and none of
        its fixtures seeds one, so the mutation runs green and proves
        nothing. Do NOT seed one just to feed the probe. **The own-class
        decision rests on `FreeRowChip.test.tsx:68` and `:70`** — one rule,
        selectors exactly `[".free-row-chip"]` — which go red on sight if the
        chip is added to that rule as a grouped selector. Say that in the
        report instead of claiming an e2e probe.

---

### Task 5: RC-18 — `MONITOR` where `PM5` was invented, and the nameless-erg save

**Files:**
- Modify: `app/src/monitor/driver.ts:1035`,
  `app/src/monitor/transports/capacitorBle.ts:465` and `:494`,
  `app/src/monitor/transports/webBluetooth.ts:296`,
  `app/src/justrow/JustRow.tsx:301`,
  `app/src/workout/connected/surfaceModel.ts:1890`,
  `app/src/log/storedSummary.ts:302` (read side)
- Modify: `app/src/session/LogSession.tsx:736-752` (**the deviceName-band
  guard — step 6; moved here from the deleted sunset task**)
- Modify (comments): `app/src/monitor/useMonitorSession.ts:1099-1101`,
  `app/src/session/LogSession.tsx:727-736` (the band rationale) and
  `:741-750` (#273's `manual` rationale, rewritten by step 6),
  `app/src/log/storedSummary.ts:295-298`
- Test: `app/src/monitor/transports/capacitorBle.test.ts`,
  `app/src/monitor/transports/webBluetooth.test.ts`,
  `app/src/workout/connected/surfaceModel.test.ts`,
  `app/src/session/LogSession.test.tsx` (the existing guard leg — step 6)

**Interfaces:** no signature changes. The literal `"PM5"` becomes `"MONITOR"`
at seven sites, exported once as `NAMELESS_MONITOR_CAPTION` so step 6 can
reuse it rather than typing it an eighth time. **`namePrefix: "PM5"` at
`webBluetooth.ts:288` and `capacitorBle.ts:480` is DISCOVERY, not copy — do
not touch it.**

- [ ] **Step 1: Two of the three gates ALREADY EXIST — edit them, do not
      claim new ones** (L3). Read each at `fcf2d4f9` first:
      - **`capacitorBle.test.ts:433`** — the test at `:425`, "a held device
        with no advertised name falls back to 'PM5', same as the picker
        path", already drives `getConnectedDevices` with
        `name: undefined as unknown as string` and pins
        `[{ id: "held-1", name: "PM5" }]`. This is the existing gate: change
        the pin to `"MONITOR"` **and the title with it** (a title naming the
        old literal is a stale rationale, which is a defect here). It goes
        red on the literal change alone, before you touch the source.
      - **`surfaceModel.test.ts:2354` and `:2356-2358`** — the test at `:2349`
        ("never renders the `PM5` placeholder unless the picker gave us
        nothing") already asserts `deviceCaption` is `"PM5"` and
        `"PM5 · LOST"` from `deviceName: null`. Same treatment; this is
        Step 2's surfaceModel leg, already written.
      - **`webBluetooth.test.ts` is the only genuinely NEW leg**: its sole
        `"PM5"` today is the discovery filter at `:243`. Write it — a device
        matched by the OR'd SERVICE filter (not the `namePrefix` one) with
        `name: undefined`, asserting the mapped entry's `name` is
        `"MONITOR"`.
- [ ] **Step 2: Apply the reachability test to the two UNSETTLED sites before
      pinning either** (spec §3, and RF21's "a fallback can be unreachable by
      construction and still get a test"):
      - `surfaceModel.ts:1890` — `deviceCaptionFor(deviceName, linkLost)` is
        called from `surfaceModel.ts:1283` with the model's `deviceName`,
        which `ConnectedSurface.tsx:631` passes straight from
        `session.deviceName`. That field is `null` in `INITIAL_STATE`
        (`useMonitorSession.ts:1489`) and is re-nulled by the `failed`
        (`:4302`) and cancel (`:4384`) patches. **VERDICT (verify, do not
        assume): reachable.** The leg already exists —
        `surfaceModel.test.ts:2349-2358` builds the model with
        `deviceName: null` and pins both captions (L3). Retarget it at
        `MONITOR` / `MONITOR · LOST`; do not write a second one.
      - `JustRow.tsx:301` — `ready` is `axes.program === "armed"` (`:296`),
        and the only caller of `beginFreeRow()` is the effect at `:108-118`,
        which requires `session.deviceName !== null`. **VERDICT (verify by
        reading every `beginFreeRow` call site): if that is the only arm,
        the fallback is dead** — change it for consistency, add NO test, and
        say why in a comment beside it, exactly as `capacitorBle.ts:494` is
        treated. If you find a second arm, it is reachable and gets a test —
        report the contradiction with your brief.
      - `capacitorBle.ts:494` — behind a picker whose only filter is
        `namePrefix: "PM5"` (`:480`), so a returned device always has a name
        starting `PM5`. **DEAD.** Change it, no test, and state the reason in
        a comment (a test there cannot go red through the supported producer).
      - `driver.ts:1035` — `options.deviceName` comes from the picker result,
        which after this task already reads `MONITOR`; this is a second-order
        default. It IS the one that reaches storage
        (`capabilities.deviceName` → `useMonitorSession.ts:2830`), so change
        it and note the ordering.
- [ ] **Step 3: Run; verify red.**
      `pnpm exec vitest run --project client -t "MONITOR"`. Expect
      `expected 'PM5' to be 'MONITOR'` at each gated site. Quote them.
- [ ] **Step 4: Implement.** Replace the seven literals, **exporting the word
      ONCE as `NAMELESS_MONITOR_CAPTION`** (put it beside the driver or in
      `src/monitor/transports/`, and say where) rather than typing it seven
      times — step 6 is its eighth consumer. **The name is
      `NAMELESS_MONITOR_CAPTION`, NOT `MONITOR_DEVICE_NAME`** (L6):
      `e2e/design.spec.ts:2146` already binds `MONITOR_DEVICE_NAME` to
      `"PM5 432331249 Row"`, a REAL advertised name used at `:2190` and
      `:5486`, so that identifier already means the opposite thing in this
      tree. At the read side
      (`storedSummary.ts:302`) rewrite the comment at `:295-298`: it currently
      explains why the `?? "PM5"` arm exists at all (the server refuses `pm5`
      without a name, so the fallback only keeps the function total). That
      reasoning is unchanged; only the literal moves — and add the sentence
      that makes `MONITOR` load-bearing rather than decorative: **a `pm5` row
      MUST carry a name (the biconditional), so without a neutral fallback a
      nameless erg's row would 400.**
- [ ] **Step 5: Reconcile the three comments.**
      - `useMonitorSession.ts:1100`'s _"no screen ever renders the `"PM5"`
        placeholder"_ is contradicted by `surfaceModel.ts:1890`. Rewrite it
        against whatever Step 2 established — state the reachable site by
        name and that the literal is now `MONITOR`.
      - `LogSession.tsx:727-736` (the band-guard rationale, which cites
        `device.name ?? "PM5"`) and `storedSummary.ts:295-298` both describe
        the old fallback. `LogSession.tsx:741-750` is step 6's, not this
        step's — leave it until then.
      - **Three more the plan's first pass missed** (L8, all found by
        `grep -rn '"PM5"' app/src` at `fcf2d4f9`): `driver.ts:647` and
        `driver.ts:1013` both name _"the literal `"PM5"` placeholder"_ in
        `DriverOptions.deviceName`'s doc and beside `capabilities`, and
        `useMonitorSession.ts:2826` says the stored name is _"never the
        `"PM5"` placeholder"_. All three are the sentence this task
        falsifies. `ConnectedSurface.tsx:520` (_"never `"PM5"` (RC-18
        standing rule)"_) stays correct as written — check it, do not edit
        it.
      - Then sweep: `grep -rn '"PM5"' app/src | grep -v node_modules` and
        classify every remaining hit as discovery-filter, test fixture, or
        stale prose.
- [ ] **Step 6: The nameless-erg save — keep `pm5`, substitute the caption**
      (`LogSession.tsx:736-752`). **Moved here from the deleted sunset task**;
      #273 already did the half that stops the save 400ing, and this is the
      half only PR A can do.
      **What is there now:** the guard fires when the advertised name is `""`
      or >64 chars. It deletes `body.deviceName`, then — since #273 — sets
      `body.source = "manual"` (`:751`) because `pm5` without a `deviceName`
      is a contradiction the server 400s. So a genuinely CONNECTED session is
      stored as by-hand, and the log says `LOGGED BY HAND` about a row the
      monitor produced. #273 could not fix that: `MONITOR` did not exist yet.
      **What it becomes:** keep the true door and give it a usable name.

      ```ts
      if (
        typeof body.deviceName === "string" &&
        (body.deviceName.length === 0 || body.deviceName.length > 64)
      ) {
        // Door PR A (spec §3 + §4): the advertised name is unusable, but the
        // DOOR is still the connected one, and `pm5` REQUIRES a name (the
        // biconditional, `server/logSource.ts`). Before the v0.35.0 sunset
        // this branch deleted the door claim and let the server derive;
        // #273 changed that to stating `manual`, because an absent `source`
        // is now its own 400. Both stored a connected session as by-hand.
        // RC-18's neutral literal is what the row actually needs: the door
        // stays `pm5` and the device-name column reads as the caption it is.
        //
        // THE `pm5` NARROWING IS KEPT (L5): the biconditional forbids a name
        // on `timer`, `manual` and `no-reading`, so substituting one on a
        // non-pm5 body would manufacture the very contradiction the server
        // 400s. Only the connected door gets a substituted caption; every
        // other door drops the field, exactly as today.
        //
        // THE TRADE, STATED (L7): a name longer than 64 characters is real
        // and gets REPLACED by a caption, so its tail is not stored. That is
        // the same posture the empty-name case has always had (nothing was
        // stored at all), and it is preferred to losing the door. Both arms
        // are UNOBSERVED HARDENING — no capture in `docs/monitor/sessions/`
        // has ever shown a PM5 advertising an empty or 65+-character name —
        // not a defect being fixed.
        if (body.source === "pm5") {
          body.deviceName = NAMELESS_MONITOR_CAPTION;
        } else {
          delete body.deviceName;
        }
      }
      ```
      **The existing test leg FLIPS; it is not added.** It is
      `LogSession.test.tsx:3887`, _"an empty or >64-char deviceName is omitted
      from the POST body — the save still succeeds (branch review Minor)"_,
      and it asserts `"deviceName" in body === false` (`:3907`) plus
      `body.source === "manual"` (`:3913`; #273 changed that line from
      `expect("source" in body).toBe(false)`). Both expectations invert: the
      posted body carries `source: "pm5"` and `deviceName` equal to
      `NAMELESS_MONITOR_CAPTION`, and the save still succeeds. **The TITLE
      inverts too** — "omitted from the POST body" becomes false, and a title
      naming the old behaviour is a stale rationale, a defect here.
      Rewrite the `:3908-3912` comment with it; the one there now argues for
      `manual`.
      **Verified at `fcf2d4f9`: that leg drives only the EMPTY-name case**
      (`buildMonitorFixture({ deviceName: "" })` at `:3888`) although its
      title claims both. Add the >64-char leg — it is the arm that discards
      real characters, and the step's own comment claims the trade is
      accepted, so it needs a gate rather than a sentence.
      **Reconcile `LogSession.tsx:741-750`'s comment in full** (it is the
      block the snippet above replaces) and re-check `:727-736`, which step 5
      already touched.
- [ ] **Step 7: Run** the client + unit projects. Green.
- [ ] **Step 8: Commit:**
      `feat: a nameless erg stores MONITOR, and its save keeps the pm5 door`
- [ ] **Step 9: Mutations.**
      - **M5.1-M5.3** Restore `"PM5"` at each of the three GATED sites one at
        a time; each covering test must go red with
        `expected 'PM5' to be 'MONITOR'`. Record all three. **State explicitly
        that `capacitorBle.ts:494` and (if Step 2 confirms) `JustRow.tsx:301`
        carry no gate and why** — an ungated change is honest; a green test on
        an unreachable fallback is decoration.
      - **M5.4** Restore `body.source = "manual"` in the guard (step 6): the
        flipped `LogSession.test.tsx` leg must go red on the DOOR
        (`expected 'manual' to be 'pm5'`), and the save must still succeed —
        if the leg instead goes red on the save failing, the guard's
        `else` arm is dropping `deviceName` on a `pm5` body and the server is
        400ing it, which is a real defect, not a probe artefact. Record which
        happened.
      - **M5.5** Point the substitution at the `else` arm (substitute on every
        door, drop the narrowing): the server's contradiction check must 400
        a `timer`/`manual` body carrying a name. If nothing goes red, the
        `pm5` narrowing is ungated — say so and add the leg rather than
        leaving the claim in a comment alone.

---

### Task 6: The three riders

**Files:**
- Modify: `app/src/session/logDraft.ts:607` (union), `:858-864` (guard + its
  comment), `:593-601` (the `LogSeed` interface's own comment)
- Modify: `app/src/log/storedSummary.ts:424-436` (the Σ-gap comment)
- Modify: `app/domain/monitor/types.ts:630-646` (RC-12)
- Modify: `ROADMAP.md:749-763` (tick the three rider rows; lines re-verified at `fcf2d4f9`)
- Test: `app/src/session/logDraft.test.ts`

(The `DROP COLUMN` statement itself lands in Task 1's migration file — one
migration, per the spec. Its rationale is written there.)

- [ ] **Step 1: Failing test for the guard's removal.** Find the existing
      `logDraft.test.ts` case that seeds a `kind: "warmup"` step and asserts
      it produces NO stored step; invert it into the new contract: a legacy
      seed carrying `kind: "warmup"` now produces a step like any other. If no
      such case exists, that is a finding — say so, and write the new one
      against a realistic `LogSeed` built from a real library workout.
- [ ] **Step 2: Run; verify red.** Quote the failure.
- [ ] **Step 3: Remove the guard and narrow the union.**
      `logDraft.ts:864`'s `if (seedStep.kind === "warmup") return;` goes;
      `:607` becomes `steps: { label: string; kind: "work" }[];`
      (**the literal union, never `string`** — Phase WU's binding sub-ruling).
      Rewrite `:593-601` and `:858-863`, and **accept the residual population
      in writing** at the removal site:

      ```ts
      // Phase WU's owed removal, discharged by door PR A (spec §4 rider 2).
      // The guard existed for one population: an UNLOGGED, pre-Phase-WU
      // `MonitorRun` still sitting on a phone, whose persisted `LogSeed`
      // carries `kind: "warmup"`. Ten tags have shipped since; the Today
      // door already names such rows as stale. That population is ACCEPTED
      // here, explicitly: if one is logged after this ships it gains a
      // phantom warm-up row in the saved steps (and therefore in `M`).
      // Nothing produces the value any more (`buildLogSeed` above cannot),
      // and no reader re-runs `buildMonitorLogSteps` over STORED rows, so
      // saved data is untouched.
      ```
- [ ] **Step 4: Reconcile `storedSummary.ts:424-436`**, which cites the
      warm-up skip as a LIVE cause of the Σ-steps gap. After this change the
      null-index actual is the only remaining cause. Replace the claim; do not
      append a correction beneath it. **Then grep the phrasing** — the
      withdrawn words, not just the subject:
      ```
      grep -rn "warm-up\|warmup" app/src/log app/src/session docs/design | grep -v node_modules
      ```
      and reconcile or justify each hit.
- [ ] **Step 5: RC-12.** `domain/monitor/types.ts:630-646`: the doc block
      names "the phone's Bluetooth stack resetting" among `onDisconnect`'s
      causes and then carries a `CORRECTED (Phase LL Task 2)` strike of the
      iOS-backgrounding claim beneath it. Fold the strike INTO the sentence:
      state what the walks established — **it covers neither** (Phase LM's
      lifecycle work is the evidence; `docs/history/phase-rc.md:2054-2056`)
      — rather than leaving a contradiction under a claim. Cite the layer
      (backgrounding is detected at `src/adapters/appLifecycle.ts` and
      handled by `useMonitorSession`'s `frameSilence`, a SEPARATE mechanism,
      never a producer of this callback — that sentence is already correct at
      `:643-646` and is what the new text builds on).
      **Verify by SUBJECT, not by line** (`grep -n "Bluetooth stack" app/domain/monitor/types.ts`)
      — the ROADMAP's numbers have been stale twice on this exact comment.
      **Note:** RC-12's other named site, `schema.ts:165-167`'s
      `distance_meters` claim, is ALREADY corrected (the CORRECTED block sits
      at `schema.ts:237-251`); `docs/history/phase-rc.md:2056-2058` is the
      stale record, and `docs/history/` is a RECORD — do not edit it, and do
      not "fix" a site that is already right.
- [ ] **Step 6: ROADMAP.** Tick the three rider rows at `ROADMAP.md:749-763`
      with the PR number. **Correct `:751`'s `server/db/schema.ts:369`** — the
      `warmup` column is at `:425`. Wrap by hand; root markdown is never
      Prettier-formatted, and `prettier --write` on it reflows ~100 lines and
      buries the edit.
- [ ] **Step 7: Run** `pnpm test --project unit --project client`,
      `lint`/`typecheck`/`format:check`. Green.
- [ ] **Step 8: Commit:**
      `chore: discharge the three stale riders (warm-up guards, RC-12 comment)`
- [ ] **Step 9: Mutation.** Restore the `kind === "warmup"` guard: the Step-1
      leg must go red (`expected 3 to be 4` on the step count, or equivalent).
      Record. The comment reconciliations carry no runtime gate — say so.

---

### Task 7: e2e, screenshots, and the whole-branch gates

**Files:**
- Modify: `app/e2e/log.spec.ts` (detail marker + the shortened LINK LOST),
  `app/e2e/today.spec.ts` or `app/e2e/log.spec.ts` (the list chip),
  `app/e2e/screenshots.spec.ts` (two new captures)
- Modify: `ROADMAP.md` (tick the door item), `docs/design/DEVIATIONS.md`
  (only if a row describes the log detail's meta line or the list row — check;
  RF9)

- [ ] **Step 1: e2e legs through the real stack.** Both `postLog` helpers need
      `endedBy` and `steps[].actualSource` support to seed a partial row —
      extend their signatures (`log.spec.ts:66-90`,
      `screenshots.spec.ts:2544-2643`). **If a leg seeds `no-reading` through
      either helper, widen that helper's `source?` union too** — mirror 6
      (`screenshots.spec.ts:2570`) and mirror 11 (`log.spec.ts:89`).
      Legs:
      - Detail: a seeded `pm5` row, `endedBy: "rower"`, five steps of which two
        carry `actualSource: "pm5"` with real `actualSeconds`, renders
        `STOPPED EARLY · 2 of 5 intervals measured` above the heroes.
      - Detail: a seeded `link-lost` row with EVERY step measured renders
        `LINK LOST · the app lost the monitor` and NOT `intervals measured`.
      - List: the same partial row's History entry carries a
        `.log-partial-chip` reading `STOPPED EARLY`, and a complete row
        carries none.
      - Just Row: the existing `.free-row-chip` assertions still pass with
        exactly the counts they assert today — **all SEVEN of them**
        (`justrow.spec.ts:165`, `:252`, `:416`; `screenshots.spec.ts:1251`,
        `:1260`, `:1265`, `:5044`; #272 added four, including the Plan tab's).
        This is the regression the separate chip class exists to avoid.
      - **THE `no-reading` SEAM, START TO FINISH (DELTA verdict M-5, RF24).**
        Every other gate on `no-reading` in this plan enters the pipe
        downstream of the thing that decides it: `LogSession.test.tsx` reads
        an intercepted body, `storedSummary.test.ts` builds a row by hand,
        the integration legs POST an explicit `source`. **Nothing starts
        upstream of the producer**, which is `connectedNoRecord` — a
        MOUNT-TIME `useState` at `LogSession.tsx:1582-1584` reading
        `connectedArrivalWithNoRecord(searchParams)` (`:387-389`). A snapshot
        taken once at mount is precisely the shape RF24's measured defect
        had. The leg: sign in, `page.goto('/library/<id>/log?from=monitor')`
        with an EMPTY handoff store (the deep-link idiom is already used at
        `design.spec.ts:5466` and `session.spec.ts:1549` — the latter arrives
        at the plain manual form for exactly this reason), fill and Save, then
        open the row from History and assert the detail screen reads
        `NO MONITOR READING` **with a wall-clock time beside it** (§2.3's
        allowlist, the half a hand-built row cannot prove reached storage).
        One leg, one browser, both halves of the seam.
- [ ] **Step 2: `pnpm e2e`** (RF1 — this diff touches `app/src/`). Green, all
      specs, not just the new ones.
- [ ] **Step 3: Screenshots.** Add two captures modelled on
      `screenshots.spec.ts:2880` (`log-detail`) and `:5009`
      (`justrow-history-chip`):
      - `log-detail-partial` **and `log-detail-partial-landscape`** (the
        portrait/landscape pair idiom `log-monitor-dropped` uses at `:971`/
        `:1034`) — seeded so the marker renders ABOVE a
        `MACHINE CONFIRMED · WORK ONLY` block (Gate 0-A shows that pairing;
        seed `machineWorkSeconds`), and seeded so the hero numbers are real
        (RF7: no fallback dashes).
      - `log-history-partial-chip` — a partial row above a complete one.
      Run `pnpm screenshots`, then **open each image and describe what you
      see** in the report (RF7). **Recompute the headline from the rows by
      eye** — if the detail capture shows `2 of 5 intervals measured`, count
      the measured rows in the same frame and confirm it is 2.
- [ ] **Step 4: `pnpm build && pnpm dist:grep`.** The production-bundle gate.
- [ ] **Step 5: Full `pnpm test`** (all projects, Docker up),
      `pnpm lint && pnpm typecheck && pnpm format:check`.
- [ ] **Step 6: Per-file coverage (RF2).** Read `app/coverage/`'s HTML report,
      not the aggregate. Report the per-file rows for every file touched, and
      name any uncovered branch you are knowingly leaving (the two ungated
      RC-18 fallbacks are expected; anything else is a finding).
- [ ] **Step 7: ROADMAP + DEVIATIONS.** Tick the Wave F door item with the PR
      number, one line, wrapped by hand. Check
      `docs/design/DEVIATIONS.md` for any row describing the log detail's
      secondary meta line or the History row's hero line and reconcile it —
      DEVIATIONS documents CURRENT state, not history (RF9).
- [ ] **Step 8: Commit, push, open the PR** with the body below. **Present and
      STOP — James merges.**

---

## Gates, and the mutation each must fail under

| Gate | Lives in | Mutation that must make it red |
| --- | --- | --- |
| `POST /api/logs` accepts `no-reading` (201) | `source.integration.test.ts` | remove `"no-reading"` from `LOG_SOURCES` (compiles clean) → 400 |
| `no-reading` + `deviceName` → 400 on field `source` | `source.integration.test.ts` | move `"no-reading"` into `logSourceContradiction`'s `pm5` arm → 201 |
| `sourceLabel` renders `NO MONITOR READING` | `storedSummary.test.ts` | return `"LOGGED BY HAND"` from the fourth arm |
| `timeLabel` present for `pm5`/`timer`/`no-reading`, absent for `manual` | `storedSummary.test.ts` | flip the allowlist to include `"manual"` / exclude `"no-reading"` |
| The posted body says `no-reading` | `LogSession.test.tsx` | post `"manual"` unconditionally |
| `buildStoredTotalLine` keys on `source` | `storedSummary.test.ts` | restore `row.deviceName === null` (needs the `timer`-with-a-name discriminator row) |
| C2 eligibility keys on `source` | `mapping.test.ts` | restore `row.deviceName === null` (same discriminator row) |
| Just Row is NOT partial | `storedSummary.test.ts` | clause 3 → `.every` (`[].every()` is true) → reads `STOPPED EARLY`. **Deleting clause 2 does NOT bite** — see M3.1 |
| `finished` + short step is NOT partial | `storedSummary.test.ts` | drop clause 4 → renders a marker |
| `N` counts MEASURED, not `actualSource` presence | `storedSummary.test.ts` | count `actualSource !== undefined` → the lost-boundary row's count changes |
| `link-lost` keeps its ungated line | `storedSummary.test.ts` | delete the non-partial `link-lost` branch |
| Only `link-lost` is ungated | `storedSummary.test.ts` | widen the ungated branch to all five → `rower` Just Row reads `STOPPED EARLY` |
| **List `partial` == detail predicate** | integration | `exists` → `not exists` → Just Row list `true`, detail `false`. **Dropping `jsonb_array_length > 0` does NOT bite** — see M4.1 |
| List `partial` is a boolean, never null | integration | remove `coalesce(…, false)` |
| The chip renders only on partial hero rows | `HistoryList.test.tsx` | gate on `true` instead of `log.partial` |
| **List and detail agree on the WORD, not just the boolean** | integration | gate the chip on `partial` alone → the `link-lost just row` row says `LINK LOST` on the detail and nothing in History (M-3) |
| **A `no-reading` row survives mount → POST → storage → detail** | `e2e` | force `connectedNoRecord` to `false` → the row saves `manual` and the detail reads `LOGGED BY HAND` with no time (M-5, RF24) |
| The chip is not the JR chip | `e2e/justrow.spec.ts` | point it at `.free-row-chip` |
| `MONITOR` at the two reachable transport sites | transport tests | restore `"PM5"` at each |
| `MONITOR` in the connected caption | `surfaceModel.test.ts` | restore `"PM5"` |
| The warm-up guard is gone | `logDraft.test.ts` | restore the guard |
| An unusable device name still saves, AS A CONNECTED ROW | `LogSession.test.tsx` | restore `body.source = "manual"` → `expected 'manual' to be 'pm5'` (M5.4) |
| The caption is substituted ONLY on `pm5` | `LogSession.test.tsx` / integration | substitute on every door → a `timer` body with a name 400s (M5.5) |

(The two sunset gates this table used to carry — "`source` is required on
POST" and "`deriveLogSource` survives as 0020's oracle" — SHIPPED in #273 and
live on main at `source.integration.test.ts:139` and `:463`. They are not
this PR's to claim.)

**Ungated by design, each stated in a comment beside the code:**
`capacitorBle.ts:494` (dead behind `namePrefix: "PM5"`), `JustRow.tsx:301`
(dead behind the `deviceName !== null` arm, if Step 5.2 confirms), and every
comment reconciliation in Tasks 5 and 6.

---

## PR body skeleton

Above the fold: **~120 words, ~25 words per bullet. Count, don't feel.**

```markdown
This PR makes a saved row say what happened to it.

- A connected session you stopped short reads `STOPPED EARLY · 2 of 5
  intervals measured` on its detail screen, and a short chip in History.
- A connected session that measured nothing reads `NO MONITOR READING` with
  its clock time, not `LOGGED BY HAND`, the word the live screen already uses.
- A nameless erg stores `MONITOR`, not an invented model number — and a save
  from one is finally stored as connected, not as logged by hand.
- Try it: stop a connected piece mid-workout and open it from the log.

<details><summary>Record (for agents and audits)</summary>

- Spec: `docs/superpowers/specs/2026-09-02-door-partial-design.md` §1–§4.
  Gate 0-A: `docs/superpowers/specs/2026-09-02-door-gate-a.html`, APPROVED.
- Riders (no tester-visible surface, moved off the fold): `preferences.warmup`
  dropped, the legacy warm-up guards removed, one RC-12 comment reconciled.
- Head SHA, commit count, test counts, e2e duration — reproduced, not cited.
- Every mutation from the gates table with the exact failure text it produced,
  and the three ungated changes with why each carries no gate.
- Per-file coverage rows for every touched file.
- Contrast: `--ink-3` on `--page` = **6.69:1** (floor 4.5:1, PASS) for both the
  marker line and the chip text; the chip's `--rule-3` border is **1.56:1**,
  inherited unchanged from the shipped JR chip and decorative — flagged at
  Gate 0-A rather than silently decided.
- The additive matrix, both directions, per §2.4. **The `source` sunset is NOT
  in this PR** — it shipped alone as #273 / v0.35.0 on 2026-09-02, and this
  plan was re-scoped against `fcf2d4f9` afterwards.
- Rollback floor: `docs/RELEASING.md` gains a row for this tag — one-way
  `DROP COLUMN` plus a 400 on every `no-reading` save below it.
- Three defects found while planning and fixed here: the deviceName-band guard
  that stored a connected session as by-hand (#273's `manual` substitution
  kept the save and lost the door); the chip class collision with seven
  shipped `.free-row-chip` assertions; the SQL `NULL` that would have reached
  the client as `partial: null`.
- Risk note (what I'd have asked a reviewer to probe): the SQL predicate and
  the TS predicate are two copies of one rule — the list/detail agreement test
  is the only thing holding them together, and its biting mutation is
  recorded above.
- One shape Gate 0-A did NOT render: a partial row with no hero numbers, where
  the chip sits alone on the hero line.
- Filed outside this PR (RF14): the LIVE no-reading screen still shows no
  wall-clock time while the stored row now does — an accepted divergence,
  recorded at `summaryModel.ts`.

</details>
```

---

## Self-review

**Spec coverage — every §1–§4 requirement maps to a task.**

| Spec | Requirement | Task |
| --- | --- | --- |
| §1.1 | The four-clause predicate, deterministic, allowlist clause 4 | 3 |
| §1.2 | Five marker words, `N`/`M`, `link-lost`'s own trigger, PARTIAL ⟹ N<M | 3 |
| §1.3 | Detail slot above the heroes; `MachineConfirmedBlock` untouched | 3 |
| §1.3 | List: SQL `EXISTS` boolean, chip from the same allowlist, no new column | 4 |
| §2.1 | `no-reading` posted from `connectedArrivalWithNoRecord`; the live word | 1 (label), 2 (write) |
| §2.2 | No device name; the biconditional; both readers rewritten to `source` | 1 (switch), 2 (readers) |
| §2.3 | `timeLabel` re-derived as a positive allowlist | 2 |
| §2.4 | Migration 0022, no backfill, PG18 sentence, the eleven mirrors, rollback floor | 1 |
| §3 | Seven `?? "PM5"` sites → `MONITOR`; reachability per site; comment sweep; the nameless-erg save keeps its `pm5` door | 5 |
| §4 rider 1 | `DROP COLUMN preferences.warmup` | 1 (statement), 6 (ROADMAP) |
| §4 rider 2 | Warm-up guard + union; residual accepted; Σ-gap comment | 6 |
| §4 rider 3 | RC-12's `onDisconnect` comment | 6 |
| §4 sunset | **SHIPPED SEPARATELY** as #273 / v0.35.0, 2026-09-02 — not in this PR. Its one residual, the guard that stored a connected save as `manual`, is Task 5 step 6 | — |
| §6 | Gate 0-A is APPROVED; its copy is quoted verbatim in Task 3 | — |
| §8.1 | Every named gate has a named mutation | gates table |
| §10 | The two dead `## Phase LM` pointers | 2 |

**Placeholder scan:** no `TBD`, no "add validation", no "similar to task N".
ONE deliberate fill-in, marked, and it requires a real command's output rather
than a guess: the migration header's PR-census line (Task 1 step 8). The
second fill-in this section used to list — the sunset's 400 message literal —
is settled: #273 shipped it as
`{ error: "source is required", field: "source" }` (`data.ts:1672`).

**Type consistency across tasks:** `LogSource` (Task 1) is imported by Tasks
2 and 4 — never re-declared. `PartialCloseReason` (Task 3) is the ONE
allowlist; the SQL in Task 4 encodes the same five values and the agreement
test is what proves they have not drifted. `RecentLog.endedBy` (Task 4) is
typed `(CloseReason | "interrupted") | null`, matching `StoredLog.endedBy`'s
union at `storedSummary.ts:191`. `NAMELESS_MONITOR_CAPTION` (Task 5, used by both its
literal swap and its step 6) is one exported constant, not two literals — and
NOT `MONITOR_DEVICE_NAME`, which `e2e/design.spec.ts:2146` already binds to a
real advertised name.
