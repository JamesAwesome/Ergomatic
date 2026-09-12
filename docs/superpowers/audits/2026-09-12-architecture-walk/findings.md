# Architecture walk — 2026-09-12

Twelve deepening candidates, from a read-only walk over the hot spots of the
last 250 commits. Three agents, one per cluster: monitor, session/log, server.
Nothing in the repo was changed by the walk.

**This document is a RECORD, not a backlog.** Six of the twelve became
`ROADMAP.md`'s Phase MD. The other six have no phase and are listed here with
their evidence so that scheduling them is a decision someone makes rather than
a rediscovery. Per the audit overlay's own precedent — *"the audit report is
not a second backlog"* — a candidate that gets scheduled gets a ROADMAP row,
and this file is not that row.

## How the scope was chosen

`git log --name-only --pretty=format: -250 -- app/src app/server app/domain`,
counted by file. The ten most-touched files were `index.css` (100),
`releaseNotes.ts` (57), `useMonitorSession.test.ts` (41), `LogSession.test.tsx`
(39), `useMonitorSession.ts` (33), `server/routes/data.ts` (33),
`surfaceModel.ts` (31), `driver.ts` (31), `driver.test.ts` (31),
`surfaceModel.test.ts` (30). Six of the ten are the monitor cluster, which is
why the monitor half became a phase first.

## Vocabulary

The walk used the deep-module vocabulary throughout: **module** (anything with
an interface and an implementation), **interface** (everything a caller must
know — signature, invariants, ordering, error modes, lifetimes), **depth**
(behaviour exercisable per unit of interface learned), **seam** (where the
interface lives), **adapter** (a thing satisfying an interface at a seam),
**leverage** (what callers get from depth), **locality** (what maintainers
get). The **deletion test** — would deleting this concentrate complexity or
merely move it — decided every candidate.

---

## Scheduled: Phase MD (the monitor six)

Full text in `ROADMAP.md`, `## Phase MD`. Summarised here only so the twelve
read as one list.

1. **One stored-run module** — `monitorRun.ts` + `handoffStore.ts` both own
   `MONITOR_RUN_KEY`. Spec:
   `docs/superpowers/specs/2026-09-12-stored-run-module-design.md`.
2. **A lifecycle seam on `useMonitorSession`** — nine deps injected, lifecycle
   statically imported, 29 `vi.doMock`s across 7 files.
3. **One `Sample` shape in `domain/monitor/`** — five hand-written
   declarations, RF33 reproducible by rename.
4. **Publish `axes`** — five sites build the same five-field literal;
   `failureLeavesLinkUp` has no production producer.
5. **Exploration: the freeze/resume observer** — 12 of 38 refs, 6 test-only
   exports.
6. **Exploration: one replay harness** — 8 session-level specs, ~45 lines of
   setup each, capture paths derived by filename surgery.

---

## Unscheduled: the session/log three

### S1 — the machine tier is derived twice, and the two derivations disagree

**The only rower-visible defect the walk found.** Not a deepening; a wrong
number, and it is listed first for that reason.

- Live door: `app/src/session/summaryModel.ts:1255` —
  `finished: run.endedBy === "finished" || run.mode === "justrow"`.
- Reopened door: `app/src/log/storedSummary.ts:780` —
  `const finished = row.endedBy === "finished" || row.endedBy == null;`
- `StoredLog` carries no `mode`. A connected free row's `endedBy` is always
  `"rower"` (`summaryModel.ts:1247-1249`, from a measured capture) and it
  stores `steps: []` (`JustRowLog.tsx:294`).
- So the reopened door takes the terminated branch with zero weighable
  splits, and `sessionStrokeRate` returns `undefined`
  (`app/src/session/logbookDerived.ts:53-62`).

**Result: the RATE tile reads the monitor's own average live and a dash when
the row is reopened.** Same row, same trace.

**The fix is one clause and needs no migration.** `StoredLog` already carries
`workoutId` and `workoutType`, and `domain/types.ts:38` already exports
`isFreeRow`. Verified independently at the PM open gate.

**Its gate is the whole point:** one test that saves a connected free row
through the live door and reads it back through the stored door, asserting the
two RATE values are EQUAL. Neither suite does this today — RF24's
producer-to-consumer shape. No existing test pairs a `workoutId: null` fixture
with a rate assertion.

**Evidence status:** the divergence is confirmed in code, read directly at all
four sites. That a saved free row carries `endedBy: "rower"` rests on
`summaryModel.ts`'s own measured comment and the fixture at
`storedSummary.test.ts:1866`, not on a run against a real row. The test above
settles it either way.

**Held beside it:** `machineSplitRows`, the per-interval table, IS correctly
shared by both doors (`summaryModel.ts:274-275`, `storedSummary.ts:1327-1333`).
Only the hero tile skipped the pattern.

### S2 — five hand-built copies of the log wire payload

`LogSession.tsx` `:1529-1541`, `:1927-1944`, `:2237-2290`; `JustRowLog.tsx`
`:258-274`, `:289-338`. `submit()` (`LogSession.tsx:719-899`) centralises the
common tail, but which of
`avgSplitSeconds`/`machineSummary`/`series`/`endedBy`/`completionStamp` to
include, and from which source object, is re-assembled as a fresh object
literal at each of the five doors. No function's interface is "door + source
record → payload".

Deletion test: concentrates — delete any one and its door breaks with no other
consumer. The same logic concentrated five times instead of once.

Consequence for tests: payload shape is only checkable by rendering the whole
door and intercepting `fetch`. `LogSession.test.tsx` is 6553 lines partly
because of it.

### S3 — reflection state lifted for one reader

`held`/`effort`/`thumbs`/`notes` live in `useLogForm` (`LogSession.tsx:707-899`)
and are read by exactly one site — `submit()`'s closure at `:733-736`. They are
threaded as 8 of `PostWorkoutSummary`'s 26 props, wired identically at three
doors (`:1566-1573`, `:2018-2025`, `:2339-2346`).

The stated reason for lifting them (`:710-714`, "must survive a failed save")
does not require it: `saveError` is itself a prop the card renders inline, so
it never unmounts on a failed save.

Deletion test: **moves, not concentrates** — this is the pass-through verdict,
and the weakest of the twelve.

**Open check before this is worth doing:** confirm no door ever *remounts*
`PostWorkoutSummary` (as opposed to re-rendering it) between a failed save and
the retry. The walk found no such remount in three doors but did not
exhaustively trace every conditional return above each one.

---

## Unscheduled: the server three

### V1 — the Concept2 send workflow is an 840-line closure inside a route handler

`app/server/routes/concept2.ts:863-1702`, one
`router.post("/api/concept2/results/:logId")`. It contains locked token refresh
(`:1016`), two-source weight-class resolution with a side-effect reconciliation
write (`:1187`), three independent retry tiers (`:1337-1456`), duplicate
handling and result recording — as nested closures over mutable `let`s.

Deletion test: concentrates. Every closure is called exactly once from exactly
this handler. The logic is real and correctly reasoned — the concurrency
invariants are enforced — it is packaged as a request handler instead of a
module.

Nothing is reachable except by sending an HTTP request through the whole
Express app. `concept2.test.ts` is 5150 lines of supertest as a result;
`concept2Send.integration.test.ts` (902) tests through real Postgres and would
be unaffected.

### V2 — six enum value sets, hand-mirrored three or four times

`db/schema.ts:72-75` states the defect in its own words: *"this array,
`server/stores/logs.ts`'s hand-copied `EndedBy` union, and
`server/routes/data.ts`'s `ENDED_BY_VALUES` are three independent mirrors of
the same value set with no shared source, so widening one without the other
two typechecks clean and fails only at runtime on a phone."*

`HeldResult` has four copies (`schema.ts:55`, `stores/logs.ts:28`,
`routes/data.ts:63`, `src/api/useRecentLogs.ts:17`). `TestDistance` is bare
string literals at `data.ts:1186`.

The fix is precedented in the same tree: `stores/baselines.ts:8` derives
`BASELINE_SOURCES` from `baselineSourceEnum.enumValues`.

Deletion test: moves, not concentrates — but the duplication has no
anti-corruption purpose, which is what separates it from the held item below.
No test today asserts the three arrays agree.

The client-side mirrors cross the seam and are a separate decision, not a
mechanical fix.

### V3 — `data.ts`'s validators imprisoned in a 2297-line route file

`app/server/routes/data.ts:133-1015`. Ten dependency-free pure functions
operating on `unknown`; only `tzError` (`:354`) and `createDataRouter` (`:1021`)
are exported. Every boundary case therefore costs a supertest round trip
through Express with fake stores wired — `data.test.ts` is 4839 lines with
~300 `request(app)` calls.

Deletion test: concentrates. POST and PATCH `/api/logs` genuinely share these
validators (`:126-130` says so).

Lowest urgency of the six unscheduled: no correctness risk today, purely
testability and locality.

---

## Attacked and held

Six things that looked like candidates and are not. Each was suspected for a
stated reason and survived it. **A later pass proposing any of these owes this
section an answer.**

- **`driver.ts` is deep, not a god-module.** 7493 lines but 2152 code lines
  (~71% comment). Behind the interface: 7 members, one `Transport` in, one
  11-member `MonitorEvent` union out, 9 optional knobs all of which are clocks
  or tick counts. `driver.test.ts` reaches past the interface nowhere and has
  already learned RF21's independent-literal lesson (`:660`, `:13380`,
  `:14047`). Locality inside is poor — ~48 mutable variables in one closure,
  and the summary-reconciliation sub-cluster (`:2289-4071`) is 561 code lines
  across 15 functions — but nothing about its **interface** is shallow, and
  splitting it re-opens settled wire attribution.
- **The `Transport` seam is real and policed.** Four adapters (`webBluetooth`,
  `capacitorBle`, `fake`, `replay`), three decorators (`liveness`, `holdOpen`,
  `recording`), one 23-code-line composer (`adapters/monitorTransport.ts`), and
  a CI gate — `scripts/transport-census.sh` fails the build if a transport file
  omits its `scanTarget` stance. One interface with an explicitly-policed
  optional capability, not three informal ones.
- **`transports/replay.ts`** — 219 code lines behind
  `createReplayTransport(recording, opts) → {transport, clock, run}`, with a
  virtual clock and a write barrier. Nothing to deepen.
- **The real-Postgres / in-memory-fake contract suite.** Suspected of having
  grown into a third implementation nobody runs. It has not:
  `contracts.real.integration.test.ts` runs first against Testcontainers
  Postgres 18.4 and *is* the specification; `contracts.fake.test.ts` runs the
  identical cases against `makeFakeStores()`. Two historical regressions
  (empty-prefs-patch, non-UUID workout id) are pinned as permanent cases
  precisely because they once slipped past fakes-only coverage. `docs/TESTING.md:145-155`
  states the rule. A genuine two-adapter seam. One real cost, named and not
  recommended for change: `fakes.ts:438-484` hand-reimplements the "newest row
  wins per plan index" tiebreak that `stores/logs.ts:576-644` does in SQL.
- **`useConcept2Link`'s independent wire shape** (`src/api/useConcept2Link.ts:1-75`).
  Looks like V2's duplication and is its opposite: the route returns three
  shapes, and a client that `undefined`-checked would misread a flag-off server
  (`{available:false}`) as "unlinked" — a trap `Concept2LinkProbe.tsx` already
  hit. `normalizeLink` (`:77-129`) coerces defensively so an old server fails
  closed. Deliberate anti-corruption at the seam.
- **`surfaceModel.ts`'s `SurfaceModelInput`** (`:322-528`). Genuinely deep and
  hardened: every field's doc comment cites the specific historical bug a
  default would have reintroduced (e.g. the retired `?? "live"` laundering,
  `:328-344`), and fields are required so a caller's omission is a compile
  error. This is the shape the fixes above should reach.
- **`Today.tsx`'s `sessionFallback`** (`:112-115`, `:948-977`) already
  implements RF21's Phase RN corollary correctly — assign only on the refused
  path, clear on success — and cites RF25 in its own comment. A live example of
  the in-memory-fallback trap being avoided, not a candidate.

## One thing outside the deepening frame

`app/domain/monitor/derivedHeartRate.ts` has no test file under `domain/`; its
only coverage is `src/monitor/derivedHeartRate.replay.test.ts`, which runs in
the `client` project. A domain function computing a heart rate a rower reads,
exercised only from the client tree. Worth a glance before Phase MD's PR 3
moves anything near it.
