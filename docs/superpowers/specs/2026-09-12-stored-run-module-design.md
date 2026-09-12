# Phase MD PR 1 — one writer for the stored run

**TRIAD: stored shape.** The record under `ergomatic.monitorRun` is the
subject, so this carries a full antagonist pass on the spec and a PM
final-PR gate on the PR.

**Revision 2, 2026-09-12.** The anchor pass blocked revision 1 on four
findings and James ruled the re-scope. **The merge is gone.** Revision 1
proposed concatenating `monitorRun.ts` and `handoffStore.ts`; the pass costed
the cheaper alternative revision 1 had named in a clause and never priced, and
it reaches the same export target with materially less blast radius (RF30,
pointed at this spec's own option list). What changed is recorded in §11 rather
than appended beneath the claims it replaces.

## What and why

Two modules own one localStorage key. `monitorRun.ts` declares the record,
builds it, reads it, and still carries a writer nothing in production calls;
`handoffStore.ts` does every production write and cannot import back the other
way, because the dependency already runs in that direction. The key's rules are
therefore split across two files kept in step by comment, and three of those
comments exist only to say so.

**This PR moves the persistence half out of `monitorRun.ts` instead of merging
the two files.** Afterwards `monitorRun.ts` is the record and its pure
builders, with no storage in it at all, and `handoffStore.ts` is the only
module that touches the key. The dependency runs one way — persistence imports
the type — so the cycle that forced the boolean parameter is gone without
anything being concatenated.

Nothing a rower sees changes. What changes is that the next person who has to
answer "what happens to the saved run when X" reads one module, and that the
127 test fixtures which currently write the key with a function production
never calls start writing it the way production does.

## 1. Research pass and does-it-exist

- **Does the platform own anything here?** No. `localStorage` is the only
  platform surface and this PR changes neither the key, the bytes, nor the
  read/write calls. The quota and denial behaviour it must preserve is
  already researched and recorded in `monitorRun.ts:565-598` and the hand-off
  store design spec §8; this PR cites that work rather than redoing it.
- **Is a new mechanism being invented?** One, and it is small: a
  `RetireReason` union replacing a free-form `reason: string`. Everything else
  already exists and only changes address.
- **Does the underlying system have the concept?** "One writer for one key" is
  a property of our own code, not something we are asserting on a system's
  behalf. Nothing here reaches the PM5, the wire, or any number.
- **Prior art in this repo — and revision 1 missed the most important piece.**
  `app/scripts/handoffStoreBoundary.test.ts` (54 KB, `unit` project per
  `vitest.config.ts:22`) has enforced this PR's headline invariant since
  2026-08-30, across four syntactic forms, with its own red/green detector
  tests. Revision 1 proposed replacing it with a grep pasted into a PR body.
  §9 now extends that gate instead. RF18's exact shape: the repo solved this
  once and the spec was re-solving it shallower.
- **Also prior art:** the hand-off store's own design spec and its two open
  residuals (`ROADMAP.md`, Codebase-audit owners). Residual 1 is this PR's
  business; §7 put its decision to James and he ruled A on 2026-09-12.
- **Nothing found** on one point, recorded as a result: no document under
  `docs/superpowers/research/` covers module boundaries or localStorage
  single-writer discipline. There was nothing to re-read.

## 2. Census — verified, with the command that produced each number

Measured in the `phase-md` worktree. Where the walk that opened this phase
disagreed, the measurement wins and the difference is noted.

| Claim | Measured | Command |
| --- | --- | --- |
| `saveMonitorRun` production callers | **0** | `grep -rn 'saveMonitorRun(' src e2e --include='*.ts' --include='*.tsx' \| grep -v '\.test\.' \| grep -v monitorRun.ts` → empty |
| `saveMonitorRun` fixture CALL SITES | **127** across **5** files | `grep -rn 'saveMonitorRun(' src e2e --include='*.ts' --include='*.tsx' \| grep '\.test\.\|e2e/'` — `LogSession.test.tsx` 76, `monitorRun.test.ts` 34, `WorkoutDetail.test.tsx` 11, `useStartWorkout.test.tsx` 5, `ConnectAction.test.tsx` 1 |
| `retire` call sites | **13**, of which **12** wrap an entry in a one-element array | `grep -rnE '(^\|[^A-Za-z])retireHandoff\(\|(^\|[^A-Za-z.])retire\('` non-comment |
| `RetireReason` distinct production values | **9**, every one a literal; nothing built at runtime | all 13 arguments read individually (anchor pass) |
| `anyLiveSession()` production call sites | **0** | `grep -rnE '(^\|[^A-Za-z_.])anyLiveSession\('` non-comment, outside its own file → empty |
| `monitorRunState()` | **0** call sites, and **NOT EXPORTED** (`monitorRun.ts:1515`) — removing it changes the export count by zero | as above |
| `MONITOR_RUN_KEY` consumers outside the two modules | **tests only** | `grep -rn 'MONITOR_RUN_KEY' src e2e scripts` minus the two files |
| `loadMonitorRun` production consumers | **1** — `Today.tsx:45`, used at `:464` | as above |
| `isPlainRecord` / `stripMalformedSeries` / `isMonitorRun` cross-module value consumers | **`handoffStore.ts` only** (`:67`, `:500`, `:501`, `:503`) | as above |
| `measuredSessionSeconds` | an alias of `interruptedTotalSeconds` (`monitorRun.ts:1484`); the alias has the only PRODUCTION caller (`summaryModel.ts:1008`), the original has none, though it carries 6 test assertions | as above |
| Value exports today | **19** (`monitorRun.ts`) + **16** (`handoffStore.ts`) = **35** | `grep -nE '^export (function\|const)'`, enumerated |

**The circular-import constraint is real and exactly four values wide.**
`handoffStore.ts:63-70` imports `MONITOR_RUN_KEY`, `isMonitorRun`,
`isPlainRecord` and `stripMalformedSeries` from `monitorRun.ts` (plus the
erased type). `connectGuardStage`'s doc comment (`monitorRun.ts:1690-1703`)
gives the boolean parameter's whole reason: *"this function cannot call the
store itself: `handoffStore.ts` imports `MONITOR_RUN_KEY`/`isMonitorRun` FROM
this file ... so the reverse import would be circular."* Four values is the
entire cycle, and §4 moves them.

**Found in passing, deliberately NOT taken (RF34 — say so rather than let it
look considered-and-dismissed):** `isPlainRecord` is re-declared privately in
**four** other places — `builder/builderDraft.ts:47`, `session/draft.ts:85`,
and `session/run.ts:75` (revision 1 said three copies; the anchor pass found
the fourth). Folding them in means editing the builder and two draft modules
for a refactor about the monitor's stored run. It gets a ROADMAP row at this
PR's hand-back gate, not a fix here.

## 3. The invariants this owes — not the mechanism (RF27)

1. **One writer.** After this PR, exactly one function writes
   `MONITOR_RUN_KEY`, and no exported symbol lets a caller write it another
   way. A test fixture is a caller. **This is already gated** — see §9.
2. **The bytes are unchanged.** A record written by the pre-PR code reads
   back identically under the post-PR code, and vice versa. No field is
   added, removed, renamed or re-typed. §5 gates it rather than asserting it.
3. **The sacrifice ordering survives.** On a thrown write with a `series`
   present, the writer retries once WITHOUT the series and stamps
   `seriesDropped: true`; a record with no series skips the retry; a second
   throw is swallowed. After this PR there is one copy of it, not two.
4. **A read destroys nothing.** Malformed durable bytes are not cleared
   during a read; the store records the malformed state, treats the key as
   absent, receipts it, and clears at the next retire or accepted commit.
5. **Retire is key-bound, and a superseded revision is receipted, never
   refused.** *Corrected in revision 2 — the anchor pass proved the old
   wording ("a stale entry cannot retire a newer one") FALSE about the code it
   described.* `handoffStore.ts:876-901`: the lookup matches on `sessionKey`
   alone, removal is unconditional, and `superseded = entry.revision !==
   authorizedRevision` is computed and emitted AFTER the removal. This is
   deliberate — it protects a late burst from a torn-down hook racing the
   rower on the confirm panel. A gate written for the old wording goes red
   against correct code, and an implementer "restoring" it deletes a
   documented protection.

**Lifetime table** — every ref, guard and counter the store owns; its mint
site; its clear sites; what survives teardown, relaunch and re-arm — is owed by
the PLAN and the plan does not pass review without it. PR #258's three lifetime
bugs all lived in state minted per-attempt, cleared per-teardown, and claiming
to be per-session.

## 4. What moves — the re-scoped shape

**`handoffStore.ts` absorbs the persistence half of `monitorRun.ts`:** the key,
the three validators, `loadMonitorRun`, `clearMonitorRun`, and
`connectGuardStage`. **`monitorRun.ts` keeps the `MonitorRun` type and the pure
builders** (`createMonitorRun`, `recordActual`, `completeMonitorRun`,
`completeInterruptedRun`, `withPartial`, `partialRefusal`,
`completeContinuityReset`, `appendSummaryObservations`,
`interruptedTotalSeconds`) and after this PR contains no storage call at all.
The dependency runs one way — persistence imports the type — so no cycle
exists and nothing is concatenated.

- `saveMonitorRun` is **deleted**. Its 127 fixture call sites across 5 files
  become `commit(...)`, which is what production does. This is the bulk of the
  diff and the point of the PR: the fixtures stop seeding past the producer
  (RF24).
- `MONITOR_RUN_KEY`, `isMonitorRun`, `isPlainRecord` and `stripMalformedSeries`
  become **private to `handoffStore.ts`**. Their only cross-module value
  consumer is the store itself; the tests that import the key are updated.
- `loadMonitorRun` and `clearMonitorRun` move and stay exported.
  **`Today.tsx:45`'s import changes file**, which is budgeted in §7 because a
  pin asserts on that exact line.
- `retire(set, reason: string)` becomes `retire(entry, reason: RetireReason)`.
  The union is closable over nine production literals (§2). Twelve of thirteen
  sites stop building a one-element array. `deriveClaim`
  (`handoffStore.ts:596`) branches on `"save-success"` and that comparison
  becomes compiler-checked.
  **Two open sub-decisions the plan must rule, not discover:** (a) the
  thirteenth site (`useMonitorSession.ts:3880`) passes `staged` from
  `takeStagedRetire`, so `stageRetire`'s array shape is a second interface
  this change touches; (b) two tests pass reasons no production code uses —
  `useMonitorSession.test.ts:4405` `"test-simulated-save-while-burst-open"`
  and `:5002` `"test-simulated-discard"` — and widening the union to admit
  them un-closes it, while reassigning them is not free because the first
  asserts a save that must NOT take `deriveClaim`'s consumed branch.
- **`replaceStale(reason)` covers THREE sites, not four.** *Corrected in
  revision 2.* The three are `justrow/JustRow.tsx:646-652`,
  `session/useStartWorkout.ts:117-123` and `workout/WorkoutDetail.tsx:424-430`,
  byte-identical apart from the reason string. The fourth,
  `useMonitorSession.ts:3274-3286`, **must not join them**: it branches on
  `sameKeyStale`, retires only when the key differs, and reuses
  `stale.revision` so its commit is an update rather than a create. Its own
  comment (`:3259-3273`) names the defect folding it in produces — *"retiring
  it here would be self-defeating: `retire()` tombstones unconditionally, so
  the create-commit two lines below would find its OWN key freshly retired and
  be refused."* RF23's shape.
- `connectGuardStage()` loses its boolean parameter and reads the store
  itself. **Sold honestly:** its two callers do not stop reading the store —
  `ConnectAction.tsx:199-217` and `JustRow.tsx:657-663` both call
  `currentUnretiredHandoff()` for `setUnsavedCount` regardless. Net is −1
  argument and +1 storage read, so the count the rower sees and the decision
  to show the panel come from two reads where today they come from one. This
  is consistency with the existing double-read of `loadRun()`, not a
  simplification. Note also that `connectGuardStage` reads `session/run.ts`'s
  `SessionRun`, so the store's dependency set gains the phone-timer record.
- `anyLiveSession` is deleted per §7's ruling, taking the private
  `monitorRunState` with it.
- `measuredSessionSeconds`/`interruptedTotalSeconds`: one name survives. The
  alias holds the only production caller, so the alias's NAME is the one to
  keep — the opposite of what tidying by instinct would do.
- The `handoffStore` namespace object (`handoffStore.ts:1002-1016`) is an exact
  duplicate of 13 named exports and is deleted. It has three live consumers
  (`Today.test.tsx:3170`, `LogSession.test.tsx:6363`, `:6482`), so it is a
  removal with edits, not a free one.

## 5. The byte-compatibility gate — rebuilt, because revision 1's could not go red

The anchor pass built revision 1's gate against the real module and ran the two
mutations it named as its proof. Results:

| | leg 1 (fixture → reader → deep-equal) | leg 2 (new writer → old validator) |
| --- | --- | --- |
| mutation 1, writer adds a field | **passed** | red |
| mutation 2, rename `seriesDropped` | **passed** | **passed** |

**Leg 1 cannot go red for anything**, because `loadMonitorRun` returns the
parsed object unmodified (`monitorRun.ts:671-674`) — no key whitelist, no
normalisation. **Mutation 2 escapes both legs** because `isMonitorRun` is a
positive conjunction whose own comment (`:548-553`) states it has *"no
unknown-key check anywhere in this validator"*, so a renamed optional collapses
to `undefined === undefined`. That is RF33's mechanism one layer up, at the
stored-record validator rather than the compiler — and this repo's own
antagonist ledger had already recorded `isMonitorRun`'s unknown-key tolerance
as a BENEFIT without anyone asking what it costs a gate whose reader it is.

The rebuilt gate:

- **Leg 1 is deleted.** A deep-equal against a static fixture through a reader
  that returns its input unmodified is decoration. What replaces it is a
  **key-set assertion**: the parsed record's own key set equals a pinned
  literal list, so an added or renamed field fails on the reader side.
- **Leg 2 stays, and its fixtures are captured by DRIVING THE WRITER, not
  hand-written.** The rename is invisible unless the fixture came from the
  **sacrifice path** — the only writer that STAMPS `seriesDropped` rather than
  copying it from the caller. Measured by the pass: `main` emits
  `"seriesDropped":true`, the mutant emits `"seriesTrimmed":true`, and leg 2
  goes red; a hand-written fixture containing `seriesDropped: true` leaves the
  rename invisible on both legs.
- **The fixture set, and what each shape can catch** — the plan states this
  table and the PR body reproduces it with results: an ordinary write; a
  **thrown** write with `series` present (the sacrifice — the only shape that
  catches a `seriesDropped` rename); a series-less thrown write; a `v: 1`
  record; a `partial`; a `summaryDetail`; a `mode: "justrow"`.
- **Captured from `main`, before the first line of the change.** A fixture
  generated afterwards is a mirror one step later (RF11).

## 6. The number this PR has to hit

35 value exports today. **Revision 1's arithmetic was wrong** — it counted the
private `monitorRunState` as a removal, which changes the export count by zero,
and pre-committed a removal §7 reserved for James.

Under §4's shape, 35 − 4 removals (`saveMonitorRun`, `anyLiveSession`, one
session-seconds name, the `handoffStore` namespace object) − 4 demotions to
private (`MONITOR_RUN_KEY`, `isMonitorRun`, `isPlainRecord`,
`stripMalformedSeries`) = **27**.

**Exit criterion: at most 28, with the before and after lists printed in the
PR body.** The extra one is slack for a demotion the plan finds it cannot take.
If the plan cannot get under 28 without inventing a facade, it says so and this
PR is re-scoped — a facade re-exporting 35 symbols through one name is
shallower than the two modules it replaced.

## 7. RULED BY JAMES, 2026-09-12: option A

**Delete `anyLiveSession` and `monitorRunState`, re-home the anti-pattern
documentation, and rewrite the pin.**

**The pin work is bigger than revision 1 said, in two ways the anchor pass
found.**

1. **The negative import pin dies with the symbol.**
   `todayGuard.pin.test.ts:91` asserts
   `expect(source).not.toMatch(/import\s*\{[^}]*\banyLiveSession\b/)`. Once the
   symbol does not exist, no file can import it and the assertion can never
   fail (RF21). It **can** go red today — the pass proved it by adding the
   import to `Today.tsx` as a separate statement, leaving the pinned import
   line intact: *"AssertionError: expected 'import { useEffect, useRef,
   useState …' not to match"*, 1 failed / 2 passed. So a live gate becomes a
   dead one unless it is rewritten to bind against the RULE (Today's guard
   reads the record directly).
2. **The merge-independent half: this PR breaks the pin's OTHER two
   assertions.** `todayGuard.pin.test.ts:87-92` pins `Today.tsx`'s two monitor
   imports byte-exactly, and §4 moves `loadMonitorRun` to another file, so
   assertion 1 breaks by construction. The pin's own header says *"If a LATER
   phase legitimately changes this guard, update this constant in the same
   commit and say why in the report. Do not delete the pin."* That is now
   budgeted.

**Corrected costs.** Revision 1 said "~5 test cases"; it is **12** —
`monitorRun.test.ts:1226-1280` is an `it.each` over nine cases plus a
"all nine cells are covered exactly once" meta-test, plus the two `DISAGREES`
tests at `:1387` and `:1394`. A 2.4x undercount in the section that invokes
RF30. Revision 1 also said "eight files, seven outside `monitorRun.ts`"; the
ruling comment names eight ITEMS, six of them files other than `monitorRun.ts`,
two being in-file doc comments.

The option list that produced the ruling is preserved in git history at
revision 1 rather than reprinted here, per the file's corrections-are-applied
rule.

## 8. Tests — replace, don't layer

- The 127 `saveMonitorRun` fixture seeds become `commit(...)`. This is the
  change that closes RF24 on this key and the bulk of the diff.
- `monitorRun.test.ts` (2343) loses its persistence half to
  `handoffStore.test.ts` (1273); what remains tests the builders as pure
  functions. Tests that reach past an interface are deleted, not ported.
- **One test starts upstream of the producer**: it commits, then mounts the
  reader, and asserts what the reader shows — no seeded record, no mocked
  store. Both halves being well tested is exactly the condition that hides a
  broken seam.
- A refused durable write yields `saved-without-series` **and the fixture path
  sees it** — today the fixture path cannot, because it does not go through
  the writer that produces the verdict.
- `anyLiveSession`'s twelve cases are deleted with the function (§7).
- **`todayGuard.pin.test.ts` is rewritten** so all three assertions still
  bite, and ships with a mutation proving it: make `Today.tsx`'s guard read
  through the store instead of reading the record directly, and the pin must
  fail.

## 9. Exit criteria

1. `grep -rn 'saveMonitorRun(' app/src app/e2e` returns nothing. **Call sites,
   not the bare string** — six comments record real history
   (`you/concept2Seen.ts:11,42`, `handoffStore.ts:86,537,953`,
   `useMonitorSession.ts:2408`, `e2e/connected.spec.ts:1616`), two of which
   predicted this PR: *"Task 3 removes that function's own copy once its
   callers move onto this store."* Those get reworded, not deleted, and the PR
   says so.
2. **`app/scripts/handoffStoreBoundary.test.ts` is EXTENDED, not replaced, and
   is green.** Specifically: `monitorRun.ts` is removed from `SRC_ALLOWLIST`
   (`:119-133`) — leaving an exemption for a file that no longer needs one is
   RF21 and re-opens the invariant this PR closes; the *"monitorRun.ts holds
   EXACTLY the three sanctioned raw key operations"* count (`:536-551`) is
   updated to zero or the assertion is moved; and `STORE_FILE` (`:89`) plus the
   module-scope-binding exemption (`:596`) are reconciled with §4's shape.
   **A grep in a PR body does not satisfy this** — it is a one-time
   observation where a standing gate already catches the string-literal form,
   the `key:`-property indirection and legacy-writer calls.
3. The merged surface exports ≤ 28 values; before/after lists in the PR body.
4. §5's rebuilt gate is green, and the PR body prints the fixture-shape table,
   both mutations, and what each failure said.
5. `grep -rn 'anyLiveSession\|monitorRunState' app/src` returns nothing, and
   the rewritten `todayGuard` pin is shown to go red under §8's mutation — a
   pin that passes because its subject no longer exists is the failure this
   criterion exists to catch.
6. `pnpm test`, `pnpm typecheck`, `pnpm lint`, and a full `pnpm e2e` run whose
   result has been read (RF1 — this diff touches `app/src/`).
7. No behaviour change, stated the way `docs/TESTING.md` §8 rules it: **no
   screenshot is committed.** *Corrected in revision 2 — revision 1 required
   that no capture DIFFER, which the repo measured as impossible on
   2026-09-12 (a 7-pixel floor with every clock frozen and a fresh database).
   A criterion nobody can meet teaches people to waive criteria.*

## 10. What the plan must still resolve

Carried from the anchor pass as open, not answered here:

- Whether `handoffStore.ts` stays one file once it absorbs the persistence
  half, or splits — `handoffStoreBoundary.test.ts:89`/`:596` constrains the
  choice and the cheaper side was not worked out.
- The two `retire` sub-decisions in §4 (the staged-array shape; the two
  test-only reasons).
- The lifetime table (§3).

## 11. What revision 2 changed, and why

Recorded here so the record replaces the claim rather than sitting beneath it.

- **The merge is gone.** Revision 1's §10 named the cheaper option — relocate
  the four values that form the cycle — and attached no cost to it, then used
  an export-count argument to justify the merge. The anchor pass costed it:
  the target is reachable without concatenating a line, while merging
  additionally breaks two byte-exact import pins and forces a call on the
  boundary gate's `STORE_FILE`. RF30, pointed at this spec.
- **§3 invariant 5 was false** about the code it described.
- **§5's gate could not go red** for either mutation it named; rebuilt.
- **§9 criterion 2 was weaker than a gate that already exists**; it now
  extends that gate.
- **`replaceStale` is three sites, not four.**
- **§6's arithmetic** counted a private function as an export.
- **§7's cost was a 2.4x undercount**, and missed that this PR breaks the
  pin's other assertions regardless of the ruling.
- **§9 criterion 7 was unsatisfiable.**
- **The `saveMonitorRun` figure** is 127 call sites across 5 files; the
  earlier 148/10 was the bare string over test files, 21 of which are imports,
  comments and source-text pins.
