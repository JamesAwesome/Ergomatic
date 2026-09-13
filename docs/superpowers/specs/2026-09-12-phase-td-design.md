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

### 1.3 What the spike actually measured

A throwaway client-level probe drove the real hook against
`createFakeTransport`, armed a free row, streamed two rowing frames, called
`endSession()`, then delivered the summary after a varying number of ticks.
Committed as `b452bfd8` on the `td-spike` branch, which will never merge.
Command:

```
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client \
  --reporter=verbose src/monitor/tdSpike.freeRowEndSummary.test.ts
```

Ring entries, verbatim (PRIMARY):

- **Zero ticks after `endSession()`** —
  `summary-reconciled :: out-of-window — 0x0039 arrived with no open finish
  grace (the run is still open — no finish has happened); nothing filed`, and
  `summaryTotals = undefined`.
- **One tick** — `frame :: state=terminated`, then
  `summary-reconciled :: terminate-observations`, then
  `summary-recorded :: totals={"workElapsedSeconds":393.6,"workDistanceMeters":1396}`,
  then `handoff-released :: burst-heard`.
- **Four ticks** — identical verdict.

**Conclusion: one status tick is the whole blocker, and no production change
is needed.** The free-row terminate does route through the fake's *prepare*
handler rather than the *armed* one, so the terminated frame is a tick later
than on the programmed arm — but a tick is enough. (PRIMARY for the
observations; INFERENCE for the attribution of the 2026-09-07 silence, which
this probe never reproduced at the hook layer in four orderings.)

**Why the original attempt saw nothing.** `teardown` defers hang-up for
`BURST_LINGER_MS = 2000` (`useMonitorSession.ts:883`), so the driver outlives
the navigate by two seconds. Delivery later than that reaches no live
listener, which is the only route left to total silence. (INFERENCE.) The
attempt proved its hold was open by asserting "Wrapping up" —
`ConnectedSurface.tsx:466-472` says in its own comment that this text
"replaces 'That is the session' on EVERY ended state, held or not", so that
assertion proved nothing. The working programmed walk adds a URL check
(`connected.spec.ts:916`) that the free-row attempt did not. (PRIMARY.)

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
the row claims, and the block renders unconditionally at `:594` beside
`<Concept2SendBlock row={row} />` at `:615`. (PRIMARY.) But
`Concept2SendBlock.tsx:29` destructures **three** values, not one:
`const { link, failed, reload } = useConcept2Link();`, with `failed` used in
the silence guard at `:78` and `reload` in the gone/reauth branch at `:59`.
(PRIMARY.) The ROADMAP says "pass `link` to both blocks". That is not
enough, and lifting `reload` makes the two blocks share a refresh — a
behaviour change, recorded here as one rather than sold as a pure refactor.

### 1.7 The existing link gate cannot bite (RF21)

`e2e/concept2.spec.ts:105` already maintains a `linkReads` counter. Every
assertion on it — `:351, :383, :392, :497, :911, :927, :958, :1054, :1093,
:1313` — is `toBeGreaterThan`. None pins an exact count, so the gate that
looks like it watches this cannot fail on it. (PRIMARY.)

## 2. Does the system have the concept?

Asked for each row, because designing a state the real system lacks is how
this repo shipped a PAUSED state the PM5 cannot have.

- **TD-1.** Does Postgres let one UPDATE fail while a later UPDATE on a
  different row in the same request succeeds? Yes — a row-scoped `CHECK` or a
  `BEFORE UPDATE ... WHEN (OLD.id = ...)` trigger is exactly that, and raw
  DDL in an integration test is already precedent here
  (`schema.integration.test.ts:201`). (PRIMARY.)
- **TD-4.** Does `useConcept2Link` have any shared cache that would make two
  callers one request? No — it is a per-call fetch with its own generation
  ref, which is why the second caller is a second request. (PRIMARY.)
- **TD-5.** Does the fake have any concept of an end-of-workout summary on a
  free row? Yes, via `deliverSummary`, and §1.3 measured it working. What it
  has no concept of is 0x003A's calorie payload on this path — see §4.3,
  where we accept the consequence rather than invent it.

## 3. Scope

Three rows. TD-2 (the unparsable 409) and TD-3 (the `VERIFIED ✓` capture)
were removed from this phase by James on 2026-09-12 and leave as dated rows
(§9).

## 4. The three changes

### 4.1 TD-1 — the reconciliation gate

**Invariant (I1):** when the Concept2 reconciliation throws, the send still
answers 200 and the result is still recorded.

The catch at `routes/concept2.ts:1254` warns rather than swallowing
silently — that was the real defect and it is already fixed. What has never
been tested is the other half. The test goes in
`app/server/routes/concept2Send.integration.test.ts`, which runs against a
real Postgres via Testcontainers (`:189-192`, `postgres:18.4`, assigned to
the `integration` project by `app/vitest.config.ts:40-43`) and already
carries the two-send reconciliation template at `:445-527`.

**Mechanism.** Between the two sends, install a row-scoped failure keyed to
the OLDER row's id — a `CHECK` constraint or a `BEFORE UPDATE ... WHEN
(OLD.id = <olderId>)` trigger. The second send's `recordC2Result` targets a
different row and passes. `markC2Verified` runs on the pool, not inside
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
`{ row, link, failed, reload }`. Delete the now-false comment at
`FromTheLog.tsx:57-62` and the stale one at `FromTheLog.test.tsx:192-198`.

**Stated behaviour change (I3):** both blocks now share one `reload`, so a
refresh triggered by either is seen by both. This is a consequence of the
lift, not an incidental detail, and the PR body says so.

**Out of scope, deliberately:** the four other `useConcept2Link` callers, all
on the You surface (`you/Concept2Card.tsx:445`, `you/Concept2Screen.tsx:60`,
`you/Concept2Row.tsx:40`). `Concept2Screen.tsx:53` documents its second
instance as intentional — "A SECOND `useConcept2Link` INSTANCE, on purpose"
— so the You screen is not this row's business.

### 4.3 TD-5 — the free-row summary capture

**Invariant (I4):** the free-row summary capture is taken with the driver
still live, so the machine tiles render.

No production change. `screenshots.spec.ts`'s free-row capture delivers the
summary **after at least one status tick has followed `endSession()`**, and
while still on the pre-navigation URL — the free-row analogue of
`connected.spec.ts:916`'s check, replacing the "Wrapping up" assertion that
§1.3 showed proves nothing.

**Accepted and stated: four of the six tiles render dashes.**
`machineTierFromRun` (`summaryModel.ts:1232-1271`) takes `calories` from
`detail?.totalCalories` and leaves `calPerHour` undefined when calories are;
`totalCalories` lives only on 0x003A, which `deliverSummary` never writes.
So calories, avg watts, avg cal/hr and rest distance are dashes, and
elapsed and distance carry figures.

**This is the truthful frame, not a degraded one** — it is exactly what a
real run with no 0x003A renders, and `driver.ts:4811-4841`'s own log line
says "the screen renders a dash, never 0". Ruled by James 2026-09-12: take
the partial capture. The alternative was rejected with its cost recorded
(RF30): a stamp-matched 0x003A means either a zero-stamped constant or a
raw-bytes override, and `statusFrames.ts:281-287` deliberately writes that
stamp as zeros because "a fake that invented a plausible date/time would be
asserting a layout nobody has read". `KEYSTONE_ADDITIONAL_SUMMARY_BYTES`
(`fake.ts:952`) decodes to 2026-08-23 09:28, so `stampsEqual` would fail and
the frame would be dropped regardless.

### 4.4 Riders

- `fake.ts:376-380` documents `FakeBurst.additionalSummaryBytes` as "nothing
  decodes this characteristic". False since Phase LP —
  `parseAdditionalSummary` feeds `run.additionalSummary` and four tiles.
  Campsite fix.
- The ROADMAP's Phase TD header claims two rows share one blocker. §1.4
  falsifies it. Corrected in the same PR.

## 5. Where the risk is

1. **TD-4 is the only one that touches code a rower runs.** Its risk is not
   the extra request; it is the shared `reload`. A reviewer must see that
   stated (I3) rather than discover it.
2. **TD-5's capture can go green while proving nothing (RF41).** The fixture
   streams frames, and the first rowing frame opens the run and renders the
   connected surface regardless of any flag. An assertion about the summary
   must be bounded below the fixture's own behaviour, and the capture must be
   opened and looked at (RF7).
3. **TD-1's constraint could break the request instead of the
   reconciliation**, which is the failure mode that killed four previous
   attempts. The gate is that the send returns **200** — a 500 means the
   fixture broke, not the code.

## 6. Invariants

- **I1** — a throwing reconciliation leaves the send at 200 and the result
  recorded.
- **I2** — one log-detail view issues exactly one `GET /api/concept2/link`.
- **I3** — both log-detail Concept2 blocks share one link read and one
  `reload`.
- **I4** — the free-row summary capture is taken with the driver still live.

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

1. **Production invariant:** one view, one link read.
2. **Supported producer and ordering:** a real log-detail navigation, on
   both a machine row and a manual row (the second is where the ROADMAP's
   original wording was imprecise, and it is the case that bites).
3. **Independent observable:** the `linkReads` counter, asserted as an
   **exact** delta of 1 — the existing ten `toBeGreaterThan` assertions stay
   where they are and are not the gate.
4. **Deciding-source mutation:** restore the second `useConcept2Link()` call
   inside `Concept2SendBlock`. Expected failure: the delta reads 2.
5. **Strongest conclusion permitted:** that the log detail reads the link
   once. Not that the app reads it once — the You surface deliberately does
   not, per §4.2.

`Concept2SendBlock.test.tsx` (29 `it`s, `renderBlock` at `:133`) moves to
passing props; the five assertions keyed on the block's own fetch (`:142,
:149, :160, :182`, mock arms at `:88, :117, :232`) move up to
`FromTheLog.test.tsx` or are rewritten.

### 7.3 I4 — the capture

1. **Production invariant:** the free-row summary renders machine tiles.
2. **Supported producer and ordering:** the real free-row flow, ended by the
   rower, summary delivered after one status tick, pre-navigation.
3. **Independent observable:** the tiles present in the committed PNG, and a
   URL assertion proving the delivery was pre-navigation.
4. **Deciding-source mutation:** remove the tick. Expected failure: the ring
   reads `out-of-window` and the tiles are absent — the exact pair §1.3
   measured.
5. **Strongest conclusion permitted:** that the capture shows a real
   free-row summary with two of six tiles populated. Not that the summary
   path is fully exercised — 0x003A is not.

**Commit narrowly (RF1/TESTING.md §8):** only the captures for screens this
diff touches; `git checkout -- docs/screenshots/` discards the rest.

## 8. PR shape and gates

**One PR.** Three small non-triad rows in one area; a reviewer holds one
risk model, which is the grouping rule's own test.

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
2. `docs/screenshots/justrow-log.png` (or its named successor) shows the
   free-row machine tiles, and the PR body states which four are dashes.
3. The ROADMAP's Phase TD header no longer claims two rows share one
   blocker.
4. TD-2 and TD-3 are filed as dated rows with their real blockers written
   down, not left implied by their removal.
5. `fake.ts:376-380`'s stale claim is corrected.

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
  — a larger fake than anything in this phase.
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
