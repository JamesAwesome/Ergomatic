# Phase TD — the debt Phases LP and AV left behind

**Status: SPEC WRITTEN 2026-09-12, awaiting the antagonist anchor pass and the
PM open gate.** Shape approved by James the same day: **three rows, one PR**
(TD-1, TD-4, TD-5). TD-2 and TD-3 were removed from the phase at the same
gate and leave as dated rows — see §9.

## What and why

Three pieces of this app are correct but unproven, and each one has already
cost a review round to rediscover. A send whose Concept2 reconciliation fails
still succeeds, and nothing checks that. The log detail asks the server twice
for the same Concept2 link on every single view, including rows that have no
machine block to show. And the free row's end-of-workout summary — six tiles
a rower actually reads — has no committed screenshot, so no reviewer has ever
looked at it.

None of the three is a defect a rower can hit today. All three are places
where the gate that should be watching is either missing or cannot fail. That
is why they are grouped: the entry condition for this phase is a quiet week,
not an incident.

**What changed between the row being filed and this spec being written.** A
research pass and one spike refuted the stated premise of both remaining
capture rows, and corrected the advice inside a third. The ROADMAP's claim
that two of these rows "share one blocker and should be done together" is
false. The detail is §1.

## 1. Research pass

Run 2026-09-12, before any design. Every claim is tagged PRIMARY (read in
this repo's code or a committed vendor document), SECONDARY (a repo doc or
comment transcribing something) or INFERENCE.

### 1.1 Prior art check (RF18)

`ls docs/superpowers/research/` holds sixteen entries, four of them Concept2
files, and **nothing** on the fake's summary path, the free row, or the link
read. `docs/monitor/fake-vs-parser-audit.md:143` documents `deliverSummary`
as "not on the timeline; delivered on demand" and says nothing about the
free-row arm. **Nothing found** — none of this was previously settled here.
That is itself the result. (PRIMARY.)

### 1.2 The free-row summary: both stated causes are wrong

The ROADMAP row says the open question is whether the free-row arm DECLINES
`deliverSummary` or whether the fake needs 0x003A. Neither.

- **"The free-row arm declines it" — REFUTED.** The chain is mode-blind.
  `noteSummary` (`driver.ts:3540`) reads `activeRun`, which `beginFreeRow()`
  populates at `driver.ts:6998-7013`. The terminate door at `driver.ts:3635`
  (`if (run.terminatedAwaitingSummary)`) has no `freeRow` conjunct.
  `appendSummaryObservations` (`monitorRun.ts:1181-1195`) gates only on
  `completedAt`, `endedBy ∈ {finished, rower}` and write-once. (PRIMARY.)
- **"The fake needs 0x003A" — REFUTED for the emit.**
  `driver.ts:4811-4841` folds 0x003A in only when a stashed frame carries a
  matching stamp, logs `summary-1-missing` when it does not, and **emits
  anyway**. A bare 0x0039 produces `summary-observations` on the terminate
  path. (PRIMARY.)

### 1.3 What the spike measured, at production defaults

Two probes were run. **The first is superseded and is recorded here only
because its error is instructive**; the load-bearing measurement is the
second, committed as `1ae217e1` on the `td-spike` branch (pushed, so this
citation resolves — RF16's corollary).

**The first probe (`b452bfd8`) was wrong for three reasons**, found by the
anchor pass. It set `settleTicks: 0`, `prepareSettleTicks: 0` and a no-op
`burstLingerSchedule`. At production defaults `driver.terminate()` awaits
`settleAfterTerminate()`, which waits for `ticksNeeded` NEW arrivals with
`DEFAULT_SETTLE_TICKS = 3` (`driver.ts:741`, `:6375-6381`, `:7426`), and
`useMonitorSession.ts:6203` awaits it — measured: resolved after 0/1/2 ticks
`false`, after 3 ticks `true`. So its "zero ticks" red case is unreachable
outside jsdom. Worse, the no-op `burstLingerSchedule` never invokes its
callback, which made the linger window **infinite rather than zero** — so its
unmount case was green only because the deadline had been disabled.
**And its ring evidence could not have come from the command it cited:**
under this runner `console.log` from a client test never reaches stdout,
while `process.stdout.write` does (PRIMARY — a one-test probe printed
`HELLO_FROM_STDOUT` and swallowed `HELLO_FROM_TEST`). The second probe routes
every readout through `process.stdout.write` and commits its verbatim output
at `app/src/monitor/tdSpike.prodDefaults.output.txt`.

**The measurement (PRIMARY).** Command, from `app/`:

```
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client \
  src/monitor/tdSpike.prodDefaults.test.ts
```

`Test Files 1 passed (1)` / `Tests 8 passed (8)`, exit 0, stable across three
runs. Six orderings, varying only when the 0x0039 is delivered:

| Ordering | Result | Ring |
| --- | --- | --- |
| A — before `endSession()` resolves, 0 ticks | **RED** | `summary-half :: (run open, state=rowing)`, then `out-of-window ... nothing filed`; `summaryTotals = undefined` |
| A1 — 1 tick, `endSession()` still unresolved | GREEN | `(run closed, state=terminated)`, `terminate-observations`, `summary-recorded`, `handoff-released :: burst-heard` |
| A2 (2 ticks), B (3, resolved), C (5), D (resolved → unmount → deliver inside the real linger) | GREEN | identical to A1 |
| E — resolved → unmount → real 2000 ms linger EXPIRES → deliver | **RED** | `handoff-released :: burst-timeout`, `disconnect-requested :: caller-initiated`, then `terminate-observations` — but **no `summary-recorded`**; `summaryTotals = undefined` |

**The corrected rule. Both the first probe's mechanism AND the anchor pass's
proposed replacement are wrong.** It is not "one status tick", because
`endSession()` needs three. It is not "once `endSession()` has resolved the
summary lands", because ORDER E resolves and still loses the totals.

> **The totals are filed iff the 0x0039 arrives (a) AFTER the driver has seen
> the `terminated` status frame — one new status tick past the terminate ack
> — and (b) BEFORE the hook's ended hand-off burst linger closes at
> `BURST_LINGER_MS` = 2000 ms.** `endSession()`'s own resolution is neither
> bound: it lands three ticks after the ack, strictly later than (a) and
> strictly earlier than (b).

The `summary-half` line carries the discriminator in plain text:
`(run open, state=rowing)` loses, `(run closed, state=terminated)` wins.

**A fourth outcome nobody had named, and it corrects the oracle.** ORDER E
logs `terminate-observations` and files nothing. **So the reconcile verdict
is NOT proof the totals landed** — the oracle is `summary-recorded` plus the
store read, never the verdict alone. Any gate written against
`terminate-observations` would be green on a run that lost the data.

**This finally explains the 2026-09-07 silence**, and it is Candidate B: the
hook stashes, hangs up, and a summary arriving after the 2 s deadline
reconciles into a ring nobody commits. The first probe was built to test
exactly that and had disabled the deadline it was testing.

**Consequence for the capture, and it is tighter than "add a tick".** The
delivery must land inside a 2 s window that opens one status frame after the
terminate ack. Waiting for `endSession()` to resolve satisfies (a) with
margin and is safe, but at a real 2 Hz cadence it burns roughly 1.5 s of the
2 s budget — so a capture that also navigates or unmounts in between has very
little room. §4.3 and §7.3 are written against the measured rule, not against
the tick count.

### 1.4 The ROADMAP's grouping premise is FALSE

The section header states that two of its rows share one blocker and
"whoever unblocks that gets both captures from one piece of work". §1.3
shows the free-row capture was an ordering bug. The `VERIFIED ✓` capture is
blocked on something unrelated: the screenshots stack is Concept2-DARK by
construction (`compose.yml` passes `C2_LINK_ENABLED: ${C2_LINK_ENABLED:-}`,
`screenshots.sh` exports nothing, `scripts/compose-env.test.sh` enforces it),
so `POST /api/concept2/results/:logId` — the only writer of `verified`, as it
is the only writer of `c2_result_id` — 403s before it writes anything.
(PRIMARY.) Unblocking one does nothing for the other. **This spec corrects
that header.**

### 1.5 The reconciliation gate: the row's own advice is wrong

The ROADMAP row proposes making `markC2Verified` "fail at the DB". That
cannot mean the column, the table or privileges: `markC2Verified` writes
`session_logs.verified` (`db/schema.ts:414`), `recordC2Result` writes the
same column on the same table (`stores/logs.ts:1104-1108`), and `logs.get`
selects it on the handler's first statement (`routes/concept2.ts:904`).
Dropping, renaming or revoking breaks the request — very likely the same
self-inflicted 500 that killed all four previous attempts. A lock is no good
either: `db/pool.ts:4` sets no `statement_timeout`, so the send hangs to the
120 s cap rather than erroring. (PRIMARY.)

### 1.6 The link-read row understates its own scope

`FromTheLog.tsx:57` declares `MachineConfirmedBlock({ row }: { row:
StoredLog })`, `:63` calls `useConcept2Link()`, and `:64` is the
`row.machineWorkSeconds === null` early return — so the hook is above it, as
the row claims. (PRIMARY.)

**But "the block renders unconditionally" is FALSE, and the ROADMAP row says
it too.** Both blocks sit inside the ready-row guard opened at
`FromTheLog.tsx:474` (`{row !== null && view !== null && (`) and closed at
`:661-662`, and `row` is non-null only in the `ready` state (`:284`;
`FetchState` has four members at `:175-187`). (PRIMARY.) **This matters to the
change, not just to the prose:** lifting the hook to `FromTheLog` (`:275`)
fires the read at PARENT mount, so the `loading`, `error` and `not-found`
states go from zero link reads to one — and each `pageshow`/`visibilitychange`
on those states fires one too. The lift is a reduction on the guarded path and
an ADDITION on three others. I2 still holds as stated, but the phase's
headline framing ("twice on every single view") does not, and both this spec
and the ROADMAP row are corrected. But
`Concept2SendBlock.tsx:29` destructures **three** values, not one:
`const { link, failed, reload } = useConcept2Link();`, with `failed` used in
the silence guard at `:78` and `reload` in the gone/reauth branch at `:59`.
(PRIMARY.) The ROADMAP says "pass `link` to both blocks". That is not
enough, and lifting `reload` makes the two blocks share a refresh — a
behaviour change, recorded here as one rather than sold as a pure refactor.

### 1.7 The existing link gate cannot bite (RF21)

`e2e/concept2.spec.ts:105` maintains a `linkReads` counter, and every
existing use of it is `toBeGreaterThan`. **An earlier revision called these a
broken gate. That was wrong and the correction matters**, because a later
agent acting on it would either "fix" correct code into flakes or bless a
real RF21 population. The file says what they are at `:337-351`: `linkReads`
there is "a precondition, not a readiness nicety" — a `toBeGreaterThan` used
to AWAIT an async read is correct, not decoration. (PRIMARY.) Five of the ten
line numbers that revision cited were the `readsBefore` assignments rather
than the assertions.

**They are left exactly as they are.** What is true is the narrower thing:
**no existing assertion pins an EXACT count, so nothing in the suite can go
red on a duplicate read.** That is the hole this phase fills, by adding one
exact-delta assertion — not by touching the ten readiness polls.

## 2. Does the system have the concept?

Asked for each row, because designing a state the real system lacks is how
this repo shipped a PAUSED state the PM5 cannot have.

- **TD-1.** Does Postgres let one UPDATE fail while a later UPDATE on a
  different row in the same request succeeds? Yes — a
  `BEFORE UPDATE ... WHEN (OLD.id = ...)` trigger is exactly that, and
  `markC2Verified` is a single pooled `UPDATE ... RETURNING id`
  (`stores/logs.ts:1174-1198`), so the trigger fires on precisely that
  statement. (PRIMARY.)
  **But the precedent this spec claimed does not exist.** An earlier revision
  said "raw DDL in an integration test is already precedent here
  (`schema.integration.test.ts:201`)". That line is
  `db.execute(sql.raw(migrationSql))` over `drizzle/0008_strip_wu_steps.sql`,
  whose only statement is an **`UPDATE`** — precedent for running arbitrary
  SQL TEXT against the Testcontainer, which is what the mechanism needs, but
  not for DDL. **No `CREATE TRIGGER` or `ALTER TABLE` exists in any server
  test in this repo** (four `sql.raw` hits total:
  `schema.integration.test.ts:201, :241, :302`,
  `source.integration.test.ts:508`). TD-1's trigger would be the first, and
  the implementer must know that rather than discover it. The nearest real
  precedent for raw SQL EXPECTED TO FAIL is
  `source.integration.test.ts:464-483`, using `pool.query` directly and
  asserting on the Postgres error code.
- **TD-4.** Does `useConcept2Link` have any shared cache that would make two
  callers one request? No — it is a per-call fetch with its own generation
  ref, which is why the second caller is a second request. (PRIMARY.)
- **TD-5.** Does the fake have any concept of an end-of-workout summary on a
  free row? Yes, via `deliverSummary`, and §1.3 measured it working. What it
  has no concept of is 0x003A's calorie payload on this path — see §4.3,
  where we accept the consequence rather than invent it.

## 3. Scope

**TWO rows landed: TD-1 and TD-4.** TD-2 (the unparsable 409) and TD-3 (the
`VERIFIED ✓` capture) were removed by James on 2026-09-12, and **TD-5 (the
free-row capture) came back out on 2026-09-13, measured** — three attempts
could not land the delivery inside the window and the next honest step is a
browser-side ring dump, not a fourth timing guess. All three leave as dated
rows.

**§4.3 below is retained in full rather than deleted**, because its tile
table and the measured window are exactly what the next attempt needs, and
deleting a section whose work was done is how a phase pays for the same
research twice. Read it as the brief for the row, not as landed work.

**What the TD-5 attempts established** (all PRIMARY, from runs on
2026-09-13): `window.__pm5FakeControls__` was asserted PRESENT at delivery
time, so this is not an unreachable-seam problem; delivering straight after
the second End tap is ORDER A (too early — the terminated frame has not
arrived); and waiting for `Wrapping up` first does not fix it, which is
consistent with `ConnectedSurface.tsx:466-472` saying that text renders on
every ended state. **The missing piece is a browser-side observable for "the
terminated frame has landed".** The ring has one — `summary-half` reads
`(run closed, state=terminated)` — and the DOM does not.

## 4. The three changes

### 4.1 TD-1 — the reconciliation gate

**Invariant (I1):** when the reconciliation's **store write** throws — that
is, `markC2Verified` — the send still answers 200 and the result is still
recorded.

**The narrow wording is deliberate.** Only `markC2Verified` is inside the
`try` at `routes/concept2.ts:1239-1254`. `logs.sentC2ResultIds` (`:1206`) and
`client.fetchResults` (`:1195`) sit OUTSIDE it, and either throwing 500s the
send. A gate that claimed "the reconciliation cannot fail the send" would be
claiming something false about two of its three steps.

The catch at `routes/concept2.ts:1254` warns rather than swallowing
silently — that was the real defect and it is already fixed. What has never
been tested is the other half. The test goes in
`app/server/routes/concept2Send.integration.test.ts`, which runs against a
real Postgres via Testcontainers (`:189-192`, `postgres:18.4`, assigned to
the `integration` project by `app/vitest.config.ts:40-43`) and already
carries the two-send reconciliation template at `:445-527`.

**Mechanism: a `BEFORE UPDATE ... WHEN (OLD.id = <olderId>)` trigger that
raises. One form, chosen, with the reason.** The `CHECK` alternative is
rejected: `ALTER TABLE ... ADD CONSTRAINT ... CHECK` validates existing rows
on creation and would fail on the very row it targets, so it needs
`NOT VALID` to work at all — and this row has already burned four attempts on
precisely the class of "a 500 from the FIXTURE rather than from the code
under test". A trigger has no such trap. Secondary hazard, recorded because
§1.5 found its cause: `ALTER TABLE` takes ACCESS EXCLUSIVE and `db/pool.ts:4`
sets no `statement_timeout`, so a stray open transaction hangs the test to
the 120 s cap instead of failing it.

The second send's `recordC2Result` targets a different row and passes.

**Three things the implementer must not discover the hard way.** (1) The
trigger needs a `CREATE FUNCTION` beside it, and both persist in the
container every test in this file SHARES — so they are created and dropped
inside a `try`/`finally`, and the `WHEN (OLD.id = ...)` is keyed to the id
`postLog` just minted, which no sibling test can hold. (2) This file imports
no `sql` from `drizzle-orm` and uses neither `db.execute` nor `pool.query`
today; `pool` (`:183`) and `db` (`:184`) are both `describe`-scoped and
either works. Use `pool.query`, as `source.integration.test.ts:466` does.
(3) A new `it` needs a new email in `SEND_EMAILS` (`:121`) and its own
`C2_USER_*` literal — `concept2_links.c2_user_id` is UNIQUE for the whole
database and every test here shares one container, so a reused id reds a
SIBLING test rather than this one.

**Fallback, if the trigger proves unworkable:**
`vi.spyOn(stores.logs, "markC2Verified").mockRejectedValueOnce(...)` — weaker,
being a method replacement rather than a real store failure, but still the
real app and the real route, so it does not carry the fixture hazard that
killed the four earlier attempts. Recorded so the implementer has a stated
second option rather than inventing one under pressure. `markC2Verified` runs on the pool, not inside
`withLinkLock`'s transaction (`stores/concept2.ts:300-339`, entered only at
`:1023`/`:1129`, both returned before `:1357`), so nothing downstream is
poisoned.

**Rejected alternative, with the receipt:** `vi.spyOn(stores.logs,
"markC2Verified")` would also work and is cheaper, but it is a method
replacement, and the DB-constraint version is strictly stronger because it
exercises the real store. Recorded rather than silently dropped (RF30).

### 4.2 TD-4 — one link read per log detail view

**Invariant (I2):** viewing a log detail issues exactly ONE
`GET /api/concept2/link`, whatever the row's kind.

Lift `useConcept2Link()` into `FromTheLog` (`:275`, which does not call it
today) and pass its values down. `MachineConfirmedBlock`'s signature goes
`{ row }` → `{ row, link }`; `Concept2SendBlock`'s goes `{ row }` →
`{ row, link, failed, reload }`. Delete the now-false comment at `FromTheLog.tsx:57-62`. **Do NOT delete
`FromTheLog.test.tsx:192-198`** — an earlier revision said to, and that was
backwards: it explains a deliberately SCOPED assertion in the error→Retry
test, and since the lift adds a link read on the error state (§1.6), the
scoping is needed more, not less. Update it to say why.

**Stated behaviour change (I3), in rower terms: the lift FIXES a stale
verification mark.** `useConcept2Link` registers `pageshow` and
`visibilitychange` PER INSTANCE, so two instances issue two reads on every
foreground — not only on mount — and the two hold independent `link` state.
Today a rower who relinks to a different Concept2 account through the send
block's reauth branch keeps a stale `VERIFIED ✓` on the same screen until the
next foreground or remount. That is exactly the account gate
`MachineConfirmedBlock` exists for (`FromTheLog.tsx:66-84`: "a row verified
on one Concept2 account keeps its tick after relinking to another that never
saw it"), defeated by its own second read. After the lift the mark
re-evaluates with the send block. **This is an improvement and the PR body
presents it as one.**

**Four further consequences, none of them incidental** (RF27 — a spec owes
invariants, not one mechanism):

1. **Shared generation ref.** `useConcept2Link.ts:238-246` gives each
   instance its own counter today, so a post-send `reload()` and a foreground
   `pageshow` read both apply. Sharing one counter makes the later START
   silently discard the other — cross-block supersede becomes possible.
2. **A failed first read now blanks BOTH blocks deterministically.** Two
   independent reads currently give `VERIFIED ✓` a second chance under a
   flaky link read. That is the same disagreement window
   `Concept2Screen.tsx:33-41` documents and explicitly ACCEPTS on You; the
   lift removes it here, which is a real trade and is recorded as one.
3. **The shared `reload` can turn `VERIFIED ✓` ON mid-view** without a
   remount, on a row whose `c2UserId` matches a newly-read link. The OFF
   direction is unreachable — no Send affordance exists while the tick shows.
4. **Whole-screen re-render on every link transition**, including the
   unmemoized `buildStoredSummary(row)` at `FromTheLog.tsx:430` and
   `TraceChart`'s per-render SVG geometry. No effect re-fires and no draft is
   lost. Cost, not a defect.

**Out of scope, deliberately:** the three other `useConcept2Link` callers, all
on the You surface (`you/Concept2Card.tsx:445`, `you/Concept2Screen.tsx:60`,
`you/Concept2Row.tsx:40`). `Concept2Screen.tsx:53` documents its second
instance as intentional — "A SECOND `useConcept2Link` INSTANCE, on purpose"
— so the You screen is not this row's business.

### 4.3 TD-5 — the free-row summary capture

**Invariant (I4):** the free-row summary capture is taken with the driver
still live, so the machine tiles render.

No production change. `screenshots.spec.ts`'s free-row capture delivers the
0x0039 inside the measured window (§1.3): **after the driver has seen the
`terminated` status frame, and before the 2000 ms hand-off linger closes.**
The "Wrapping up" assertion the 2026-09-07 attempt relied on is replaced —
§1.3 showed it proves nothing, because `ConnectedSurface.tsx:466-472` says it
renders on every ended state, held or not.

**The capture must not navigate or unmount before delivering.** The window is
2 s wide and waiting for `endSession()` to resolve already spends ~1.5 s of
it at a real 2 Hz cadence. The positive check is the free-row analogue of
`connected.spec.ts:919`: assert the URL is still the pre-navigation one.
(`:916` is the "Wrapping up" visibility assertion; `:919` is the URL one.)
**Both are net additions** — the `justrow-log` capture has no
`deliverSummary` anywhere on its path today, and its only URL assertion
(`screenshots.spec.ts:6699`) fires AFTER the navigation. The nearest in-file
style model is `screenshots.spec.ts:5818-5823`, where the PROGRAMMED capture
already delivers a summary on its End flow.

**Accepted and stated: THREE of the six tiles render dashes, and three carry
figures.** An earlier revision of this section said four dashed including
AVG WATTS, and was wrong in three separate ways — it read
`driver.ts:4836`'s log sentence, which names `MachineSummaryDetail` FIELDS,
as if it were the list of rendered tiles. **The tile list is read off the
RENDERER.** The six are `AVG WATTS · CALORIES · CAL / HOUR · RATE · DRAG ·
AVG HR` (`PostWorkoutSummary.tsx:368-387`); elapsed and distance are HEROES,
not tiles (`SummaryHeroesBlock`, `:392-419`); and there is no REST tile at
all — James ruled it out on 2026-09-07 (`PostWorkoutSummary.tsx:384-387`:
"AVG HR in the sixth cell, not REST — rest metres already live on the total
line").

On this fixture, with a bare 0x0039:

| Tile | Outcome | Source |
| --- | --- | --- |
| AVG WATTS | **125** | `logbookWatts(t, d)` off `summaryTotals` (`summaryModel.ts:1238`) — derived from the delivered totals, so it can never dash while totals exist |
| CALORIES | — | `detail?.totalCalories`, 0x003A only |
| CAL / HOUR | — | undefined whenever calories are |
| RATE | **24** | `fake.ts:921` `avgStrokeRate: 24`, written from 0x0039 unconditionally |
| DRAG | **128** | `fake.ts:935` `dragFactorAverage: 128`, likewise |
| AVG HR | — | `fake.ts:932` `avgHeartRateBpm: null`, and all 90 fixture frames carry `heartRateBpm: null` (`screenshots.spec.ts:6534`), so the `deriveAverageHeartRate` fallback is empty too |

**RULED (James, 2026-09-12), re-affirmed on this corrected cost:** take the
capture. The first ruling was taken on the wrong number — RF30 binds the
option CHOSEN as hard as the one struck, so it was put back to him and
stands.

**What this frame is NOT: "exactly what a real run renders".** An earlier
revision claimed that and it is unsupported. The only real free row this repo
holds carries 0x003A: `justRowReplay.test.ts:350-355` drives the 2026-08-31
walk's own bytes through the real driver, hook and store and asserts
`AVG WATTS125 / CALORIES80 / CAL / HOUR731 / RATE25 / DRAG101 / AVG HR—` —
five of six. So this capture deliberately shows a state the observed hardware
does not produce, and `screenshots.spec.ts`'s header and the PR body both say
so in one line rather than letting the frame imply otherwise.

**Why the capture is still worth taking:** today `docs/screenshots/justrow-log.png`
cannot show the tier block AT ALL — `app/src/justrow/JustRowLog.tsx:380-384`
gates it on
`summaryTotals !== undefined && workDistanceMeters > 0 && workElapsedSeconds > 0`.
The deliverable is not the PNG; it is a capture STEP that currently produces
a frame missing the thing it exists to show, which is worse than no step
because it reads as evidence.

The alternative was rejected with its cost recorded (RF30): a stamp-matched
0x003A means either a zero-stamped constant or a raw-bytes override, and
`statusFrames.ts:281-287` deliberately writes that stamp as zeros because "a
fake that invented a plausible date/time would be asserting a layout nobody
has read". `KEYSTONE_ADDITIONAL_SUMMARY_BYTES` (`fake.ts:952`) decodes to
2026-08-23 09:28, so `stampsEqual` would fail and the frame would be dropped
regardless.

### 4.4 Riders

- `fake.ts:376-380` documents `FakeBurst.additionalSummaryBytes` as "nothing
  decodes this characteristic". False since Phase LP —
  `parseAdditionalSummary` feeds `run.additionalSummary`, and through it
  CALORIES and CAL / HOUR. **The identical false claim also sits at
  `fake.ts:949-951`** ("nothing in this codebase decodes this
  characteristic"); both are corrected, because fixing one and leaving the
  other is the partial reconciliation CLAUDE.md forbids. Campsite fix.
- The ROADMAP's Phase TD header claims two rows share one blocker. §1.4
  falsifies it. Corrected in the same PR.

## 5. Where the risk is

1. **TD-4 is the only one that touches code a rower runs.** Its risk is not
   the extra request; it is the shared `reload`. A reviewer must see that
   stated (I3) rather than discover it.
2. **TD-5's capture can go green while proving nothing, in two distinct ways
   (RF41 and RF21).** The fixture streams frames, and the first rowing frame
   opens the run and renders the connected surface regardless of any flag, so
   "the surface appeared" is free. And §1.3's ORDER E shows the ring can log
   `terminate-observations` while filing nothing — so a verdict-keyed
   assertion is green on a run that lost the data. The gate takes a DOM
   locator, the oracle is `summary-recorded`, and the capture is opened and
   looked at (RF7).
3. **TD-1's constraint could break the request instead of the
   reconciliation**, which is the failure mode that killed four previous
   attempts. The gate is that the send returns **200** — a 500 means the
   fixture broke, not the code.

## 6. Invariants

- **I1** — a throwing reconciliation STORE WRITE (`markC2Verified`) leaves
  the send at 200 and the result recorded. Says nothing about
  `logs.sentC2ResultIds` or `client.fetchResults`, which are outside the
  `try` and do fail the send.
- **I2** — one log-detail view issues exactly one `GET /api/concept2/link`.
- **I3** — both log-detail Concept2 blocks share one link read and one
  `reload`.
- **I4** — the free-row summary capture is taken with the driver still live.
  **NOT DELIVERED. TD-5 left the phase 2026-09-13 (§3);** this invariant is
  still the right one and is now the ROADMAP row's brief.

## 7. Testing — each gate with RF26's five-part contract

### 7.1 I1 — integration (`concept2Send.integration.test.ts`)

1. **Production invariant:** a failed reconciliation does not fail the send.
2. **Supported producer and ordering:** two real sends through the real
   route against real Postgres, the second reconciling the first.
3. **Independent observable:** the HTTP status is 200 and `recordC2Result`'s
   row is present — not the warn line, which is a log, not a contract.
4. **Deciding-source mutation:** delete the `try`/`catch` at
   `routes/concept2.ts:1239`/`:1254`. Expected failure: 500 instead of 200.
5. **Strongest conclusion permitted:** that a reconciliation failure at the
   store layer is contained. It says nothing about a reconciliation that
   fails *partway*, which is not tested and must not be claimed.

### 7.2 I2/I3 — e2e (`concept2.spec.ts`) and client

1. **Production invariant:** one ready-row log-detail view, one link read.
2. **Supported producer and ordering:** a real log-detail navigation on a
   READY row. An earlier revision said "on both a machine row and a manual
   row, the second being the case that bites". **Both halves were wrong.**
   Both hooks sit ABOVE their guards (`FromTheLog.tsx:63-64`,
   `Concept2SendBlock.tsx:29` vs `:77-80`), so the delta is 2 on every ready
   row alike and no row kind bites harder. And a machine-row leg is not
   constructible as the suite stands: `postMonitorLog`
   (`concept2.spec.ts:211-245`) never sends `machineWorkSeconds` and
   `server/routes/data.ts:2033-2034` stores `?? null`, so
   `MachineConfirmedBlock` has never rendered in that spec at all. One ready
   row is the leg; adding a machine-row fixture is out of scope and said so.
3. **Independent observable:** the `linkReads` counter, asserted as an
   **exact** delta of 1. The ten existing `toBeGreaterThan` uses are
   readiness preconditions (§1.7) and are neither touched nor relied on.
4. **Deciding-source mutation — measured BEFORE the fix, not after
   (RF35).** An earlier revision proposed restoring the deleted hook call in
   the fixed tree, which tests the fix's shape rather than the defect. The
   honest order costs one run: write the exact-delta assertion FIRST, run it
   against `97fc7cc9`'s unmodified tree, and record that it reads **2** with
   the command and output. Only then lift the hook.
5. **Shape of the assertion: two-step, not one poll.**
   `expect.poll(() => fake.linkReads).toBe(n + 1)` evaluates on entry and can
   sample BETWEEN the two increments on the unfixed build, passing by luck.
   This file already learned that — `concept2.spec.ts:1303-1307`: "the poll
   above passes the instant the count reaches 1, so a duplicate landing
   afterwards would be invisible to it; re-asserted after the navigation and
   detail load that followed". The gate takes the same shape.
6. **Strongest conclusion permitted:** that a ready-row log detail reads the
   link once. NOT that the app reads it once — the You surface deliberately
   does not (§4.2) — and NOT that the screen reads it once in every state:
   §1.6 records that `loading`, `error` and `not-found` gain a read they did
   not have.

`Concept2SendBlock.test.tsx` (29 `it`s, `renderBlock` declared at `:130`)
moves to passing props; the **four** assertions keyed on the block's own
fetch (`:142, :149, :160, :182` — an earlier revision called them five, and
the list was right while the count was one high; mock arms at `:88, :117,
:232`) move up to `FromTheLog.test.tsx` or are rewritten.

### 7.3 I4 — the capture

1. **Production invariant:** the free-row summary renders machine tiles.
2. **Supported producer and ordering:** the real free-row flow, ended by the
   rower, the 0x0039 delivered inside §1.3's measured window, pre-navigation.
3. **Independent observable: a DOM locator, not the PNG.** An earlier
   revision named "the tiles present in the committed PNG" — **a PNG is not
   an assertion and nothing can go red on it.** The gate asserts
   `[data-testid="summary-machine-tier"]` (`PostWorkoutSummary.tsx:367`)
   before the shot is taken, plus the URL check proving pre-navigation.
   Individual tiles are reachable by role+name — each is `role="group"` with
   `aria-label={label}` (`PostWorkoutSummary.tsx:342-352`) — which is how
   §4.3's table is checked tile by tile rather than by eye. The committed
   image is the record; the locator is the gate.
4. **Deciding-source mutation: delay the delivery past the 2000 ms linger,
   not "remove the tick".** An earlier revision said remove the tick, and
   that mutation is vacuous — the browser fake self-ticks every 100 ms on an
   interval `endSession` never stops (`transports/index.ts:223`, `:255`,
   since `endSession` terminates rather than disconnects), and the repo's own
   comments say that clock both stalls (`screenshots.spec.ts:5771-5775`) and
   throttles to ~1/s when backgrounded (`transports/index.ts:138-146`), so it
   would be a coin flip in both directions. The linger deadline is a real
   `setTimeout` and is deterministic: ORDER E in §1.3 is the expected
   failure, and it fails with the tier block absent.
5. **The oracle is `summary-recorded` plus the store read, never the
   reconcile verdict.** §1.3's ORDER E logs `terminate-observations` and
   files nothing, so a gate keyed on the verdict would be green on a run that
   lost the data.
6. **Strongest conclusion permitted:** that the capture shows a real free-row
   summary with THREE of six tiles populated (§4.3's table). Not that the
   summary path is fully exercised — 0x003A is not — and not that the frame
   matches hardware, which §4.3 records that it deliberately does not.

**Commit narrowly (RF1/TESTING.md §8):** only the captures for screens this
diff touches; `git checkout -- docs/screenshots/` discards the rest.

## 8. PR shape and gates

**One PR.** Not because they are "one area" — an earlier revision said that
and it is false: TD-1 and TD-4 share the Concept2 link/send risk model, and
TD-5 shares nothing with either, being the PM5 fake, the driver's summary
window and a screenshot. The honest justification, which is the grouping
rule's actual test: three independent evidence gaps, each individually
reviewable, none TRIAD, none rower-visible, and **none constraining another**
— so bundling them costs a reviewer nothing.

Gates that RUN:

- **antagonist — ANCHOR pass** (phase open): the decomposition plus TD-4 as
  the riskiest member.
- **product-manager — phase OPEN gate** on this slate.
- The scoped test gates, `pnpm lint`, `pnpm typecheck`, and the full e2e
  suite read on the PR (RF1).

Gates that SKIP, with the reason said aloud:

- **dba — SKIP.** No migration, no column, no index, no generated column, no
  changed jsonb key set, and no production query-shape change. The only DDL
  is test-scoped and dies with the Testcontainer.
- **Gate 0 — SKIP.** No rower-visible copy or layout changes. TD-5
  photographs an existing screen; it adds no string.
- **TRIAD — does not apply.** No number's meaning changes, no stored shape,
  no auth.
- **Hardware walk — none.** Nothing here reaches the wire.

## 9. Exit criteria

1. I1-I4 each have a gate, and each gate has a recorded biting mutation and
   what its failure said.
2. **I2's gate was run against `97fc7cc9`'s unmodified tree BEFORE the lift
   and read 2**, with the command and its output recorded (RF35 — a mutation
   of the fixed code tests the fix's shape, not the defect).
3. ~~The free-row capture shows its machine tier block.~~ **WITHDRAWN
   2026-09-13** — TD-5 left the phase (§3). Its evidence is in the ROADMAP
   row and in §4.3, which stands as that row's brief.
4. ~~The capture was opened and looked at (RF7).~~ **WITHDRAWN with
   criterion 3.** Nothing in this PR commits a capture, and
   `git checkout -- docs/screenshots/` discarded the frames the attempts
   rewrote.
5. **The Icebox twin of TD-1 is PUT TO JAMES in the PR's hand-back list, and
   removed only on his ruling.** `ROADMAP.md:3475-3483` carries "'A failing
   reconciliation does not fail the send' has no test — Phase AV,
   2026-09-08" with its own trigger, and TD-1's row says "Keep them in step".
   The file's contract is one home per body of work, and a tripwire for a
   gate that now exists is furniture — so the recommendation is REMOVE. But
   removing a row is a STRIKE, and nothing is struck without James (RF30:
   striking an item is a decision he does not get to make again). An earlier
   revision of this criterion said the PR removes it; that was the spec
   proposing to break the rule the spec is written under.
   **One fact in that entry must survive wherever it lands**, because TD-1's
   own row does not carry it: "a forced `throw` placed inside the route's own
   try returns 200 and only the row assertion fails" — the invariant is known
   to HOLD; what is missing is only the gate.
6. **Phase TD's own disposition is recorded, per James's ruling 2026-09-12:**
   the section STAYS OPEN as the standing home for debt rows
   (`ROADMAP.md:43`) and `/close-phase` is explicitly NOT run on it. The
   heading's `dies 2026-09-26` governs THIS slate of three rows; the section
   survives it. Landing these three empties the section to zero rows, and
   archiving it would delete the convention along with the phase.
7. The ROADMAP's Phase TD header no longer claims two rows share one
   blocker, and its TD-4 row no longer says the block renders
   unconditionally (§1.6).
8. TD-2 and TD-3 are filed as dated rows with their real blockers written
   down, not left implied by their removal.
9. `fake.ts:376-380` AND `fake.ts:949-951`'s stale claims are both
   corrected.

## 10. Out of scope

- **TD-2 — the unparsable Concept2 409.** Split out 2026-09-12. The research
  killed its proposed fix: the only captured 409
  (`docs/monitor/c2-crossconnect-2026-09/raw-output.txt:110-116`) carries a
  top-level `"id": 85560` exactly where `client.ts:417` reads it, so that
  body takes the duplicate arm and never sticks; its message text is the two
  words `Duplicate Result`, which contain no id to parse. Concept2's API
  documentation is not committed to this repo in any form, so no vendor
  sentence defines the 409 shape. The only evidence-grounded closure is a
  rower-visible "Concept2 already has this" state, which carries copy and a
  Gate 0 and belongs to its own piece of work.
- **TD-3 — no committed capture shows `VERIFIED ✓`.** Split out 2026-09-12.
  Blocked on the Concept2-dark stack (§1.4), which needs the row READ routed
  — a larger fake than anything in this phase. **What this row is NOT:** the
  mark is not un-reviewed. James approved it as rendered at Gate 0
  `555f1eaa-624c-434e-b7cd-d882eb88b173` on 2026-09-07
  (`docs/superpowers/specs/2026-09-07-verify-by-hand-design.md:9-13`). The
  gap is BUILT versus APPROVED, which is RC-24's lesson exactly — a shape
  approved on a description shipped as `display: none` on the very surface
  whose complaint produced it.
- The four You-surface `useConcept2Link` callers (§4.2).
- Anything touching 0x003A's fake payload (§4.3).

## 11. Rows to file

Presented to James at the PR, per the register rule. Nothing is struck
without him.

- **TD-2 — an unparsable Concept2 409 leaves a row permanently stuck as
  unsent.** `dies 2026-10-12` · a row and not a fix now because its only
  evidence-grounded closure is rower-visible copy needing a Gate 0, and the
  stuck state has never been observed — the one captured 409 takes the
  duplicate arm correctly. **S**
- **TD-3 — no committed capture shows `VERIFIED ✓`.** `dies 2026-11-10` · a
  row and not a fix now because the screenshots stack is Concept2-dark by
  construction and the only writer of `verified` 403s in it; closing this
  means routing a read against a dark stack, which is its own piece of work.
  **M**

## 12. Gate record

Filled in when the anchor and PM passes return. This section is the phase's
VETTED GROUND — claims attacked and held are recorded here and later specs
in this phase inherit them.
