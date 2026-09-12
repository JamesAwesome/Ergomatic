# Phase MD PR 1 — one stored-run module

**TRIAD: stored shape.** The record under `ergomatic.monitorRun` is the
subject, so this carries a full antagonist pass on the spec and a PM
final-PR gate on the PR.

## What and why

Two modules own one localStorage key. `monitorRun.ts` declares the record,
builds it, and still carries a writer nothing in production calls;
`handoffStore.ts` does every production write and read, and cannot import
back the other way because the dependency already runs in that direction.
The result is that the key's rules are split across two files that must be
kept in step by comment, and three of those comments exist only to say so.

Nothing a rower sees changes. What changes is that the next person who has to
answer "what happens to the saved run when X" reads one module instead of two,
and that the ~150 test fixtures which currently write the key with a function
production never calls start writing it the way production does.

**The honest version of the claim, up front:** merging two files is not by
itself a deepening. Two shallow modules concatenated are one shallow module.
This PR only earns its name if the INTERFACE shrinks — §6 states the number it
has to hit and §9 makes it an exit criterion, because "we merged them" is
exactly the outcome that would look like success and be worth nothing.

## 1. Research pass and does-it-exist

- **Does the platform own anything here?** No. `localStorage` is the only
  platform surface and this PR changes neither the key, the bytes, nor the
  read/write calls. The quota and denial behaviour it must preserve is
  already researched and recorded in `monitorRun.ts:565-598` and the hand-off
  store design spec §8; this PR cites that work rather than redoing it
  (RF18 — this project re-researches settled things and the second pass is
  always the shallower one).
- **Is a new mechanism being invented?** One, and it is small: a
  `RetireReason` union replacing a free-form `reason: string`. Nothing else
  is new — every function in the merged module exists today.
- **Does the underlying system have the concept?** The concept in question is
  "one writer for one key", which is a property of our own code, not of a
  system we are asserting on behalf of. Nothing here reaches the PM5, the
  wire, or any number.
- **Prior art in this repo, read before writing this:** the hand-off store's
  own design spec and its two open residuals (`ROADMAP.md`, Codebase-audit
  owners). Residual 1 is this PR's business and §7 puts its decision to
  James rather than taking it.
- **Nothing found** on one point, recorded as a result: no research
  document under `docs/superpowers/research/` covers module merging or
  localStorage single-writer discipline. There was nothing to re-read.

## 2. Census — verified, with the command that produced each number

Every figure below was measured in the `phase-md` worktree at
`576b09e1`. Where the report that opened this phase disagreed, the
measurement wins and the difference is noted.

| Claim | Measured | Command |
| --- | --- | --- |
| `saveMonitorRun` production callers | **0** | `grep -rn 'saveMonitorRun(' src e2e --include='*.ts' --include='*.tsx' \| grep -v '\.test\.' \| grep -v monitorRun.ts` → empty |
| `saveMonitorRun` test occurrences | **148** across **10** files | same grep, `.test.`/e2e retained (report said 11 files) |
| `retire` call sites | **13**, of which **12** wrap an entry in a one-element array | `grep -rnE '(^\|[^A-Za-z])retireHandoff\(\|(^\|[^A-Za-z.])retire\('` non-comment |
| `anyLiveSession()` production call sites | **0** | `grep -rnE '(^\|[^A-Za-z_.])anyLiveSession\('` non-comment, outside its own file → empty |
| `monitorRunState()` production call sites | **0**; it is PRIVATE (`monitorRun.ts:1515`), called only by `anyLiveSession` | as above |
| `stripMalformedSeries` / `isMonitorRun` consumers outside `monitorRun.ts` | **`handoffStore.ts` only** (`:501`, `:503`) | as above |
| `measuredSessionSeconds` | an alias of `interruptedTotalSeconds` (`monitorRun.ts:1484`); the alias has **1** caller (`summaryModel.ts:1008`), the original has **0** | as above |
| Value exports today | **19** (`monitorRun.ts`) + **16** (`handoffStore.ts`) = **35** | `grep -nE '^export (function\|const)'` |

**The circular-import constraint is real and stated by the code itself.**
`connectGuardStage`'s doc comment (`monitorRun.ts:1690-1703`) gives the boolean
parameter's whole reason: *"this function cannot call the store itself:
`handoffStore.ts` imports `MONITOR_RUN_KEY`/`isMonitorRun` FROM this file
... so the reverse import would be circular."* That is the constraint the
merge removes, and it is the merge's only structural justification.

**One thing found in passing and deliberately NOT taken (RF34 says say so
rather than let it look considered-and-dismissed):** `isPlainRecord` is
exported from `monitorRun.ts` and independently re-declared in
`builder/builderDraft.ts:47` and `session/draft.ts:85`. Three copies of a
four-line predicate in three unrelated module families. It is not this PR's —
folding it in would mean editing the builder and the timer draft for a
refactor about the monitor's stored run, which is exactly the scope creep the
fast-path rule exists to stop. It gets a ROADMAP row at this PR's hand-back
gate, not a fix here.

## 3. The invariant this owes — not the mechanism (RF27)

The plan for PR #258 specified a mechanism and owed an invariant, and five
review rounds discovered the invariant a clause at a time. The invariants
here, stated before any code:

1. **One writer.** After this PR, exactly one function writes
   `MONITOR_RUN_KEY`, and no exported symbol lets a caller write it another
   way. A test fixture is a caller.
2. **The bytes are unchanged.** A record written by the pre-PR code reads
   back identically under the post-PR code, and vice versa. No field is
   added, removed, renamed or re-typed. There is no migration because there
   is nothing to migrate — and §5 says how that is gated rather than
   asserted.
3. **The sacrifice ordering survives.** On a thrown write with a `series`
   present, the writer retries once WITHOUT the series and stamps
   `seriesDropped: true`; a record with no series skips the retry; a second
   throw is swallowed. This is `monitorRun.ts:598-618`'s behaviour and
   `performDurableWrite`'s, and after the merge there is one copy of it.
4. **A read destroys nothing.** Malformed durable bytes are not cleared
   during a read; the store records the malformed state, treats the key as
   absent, receipts it, and clears at the next retire or accepted commit.
   This was falsified once already by the legacy loader and fixed at the
   store's final round; the merge must not re-open it.
5. **Retire is key-bound.** A retire authorises removal of a specific
   `{sessionKey, revision}`; a stale entry cannot retire a newer one. The
   signature changes shape in this PR and the binding does not.

**Lifetime table** — every piece of module state the merged module owns, its
mint site, its clear sites, and what survives teardown, relaunch and re-arm —
is owed by the PLAN, not this spec, and the plan does not pass review without
it. PR #258's three lifetime bugs all lived in state that was minted
per-attempt, cleared per-teardown, and claimed to be per-session.

## 4. What moves, in one list

- `handoffStore.ts` absorbs `monitorRun.ts`'s persistence half. The record's
  TYPE and its pure builders (`createMonitorRun`, `recordActual`,
  `completeMonitorRun`, `completeInterruptedRun`, `withPartial`,
  `partialRefusal`, `completeContinuityReset`, `appendSummaryObservations`)
  stay where they are or move with it — the plan decides one file or two, and
  either is acceptable as long as §6's count holds. What is NOT acceptable is
  two files that both write.
- `saveMonitorRun` is deleted. Its 148 test occurrences become `commit(...)`,
  which is what production does. This is the whole point: the fixtures stop
  seeding past the producer (RF24).
- `retire(set, reason: string)` becomes `retire(entry, reason: RetireReason)`.
  Twelve of thirteen call sites stop building a one-element array. The union
  is closed over the reasons the code actually uses; `deriveClaim` branches on
  `"save-success"` today and that branch becomes a compiler-checked member
  rather than a string comparison.
- A `replaceStale(reason)` covers the four sites that do the identical
  "retire whatever stale entry exists before starting" — the plan names the
  four from the census, and if it turns out they are not identical, it says
  so and drops this bullet rather than forcing them together.
- `connectGuardStage()` loses its boolean parameter and reads the store
  itself. Its two callers (`ConnectAction.tsx:217`, `JustRow.tsx:664`) stop
  computing it.
- `stripMalformedSeries` and `isMonitorRun` stop being exported — after the
  merge their only consumer is inside the module.
- `measuredSessionSeconds`/`interruptedTotalSeconds`: one name survives. The
  alias has the only caller, so the alias's NAME is the one to keep and the
  original's is the one to drop, which is the opposite of what tidying by
  instinct would do.

## 5. Stored shape: unchanged, and how that is gated

This is the TRIAD half and it gets a gate, not a sentence. Asserting "the
bytes do not change" is exactly the claim RF21 says arrives as decoration.

- **The gate:** a test that writes a record with the PRE-merge writer (pinned
  as a byte-exact fixture captured before the change, not as a call to the new
  code), reads it with the POST-merge reader, and asserts the parsed record is
  deep-equal to the original — and the mirror, new writer to a reader pinned
  against the old shape.
- **The mutation that must make it fail:** add one field to the written
  record, and separately rename `seriesDropped`. Both must go red. If either
  stays green, the gate is measuring the writer against itself (a mirror,
  RF11) and does not count.
- **The fixture is captured from `main`, before the first line of the merge
  is written.** A fixture generated after the change is the same mirror one
  step later.

## 6. The number this PR has to hit

35 value exports today. The census makes five removals certain
(`saveMonitorRun`, `anyLiveSession`, the private `monitorRunState` that dies
with it, one of the two session-seconds names, and the `handoffStore`
namespace object if it proves to be a duplicate of its own named exports) and
two demotions to internal (`stripMalformedSeries`, `isMonitorRun`).

**Exit criterion: the merged module exports at most 28 values, and the PR
body prints the before and after list.** If the plan finds it cannot get
under that without inventing a facade, it says so and this PR is re-scoped
rather than shipped as a file move. A facade that re-exports 35 symbols
through one name is a shallower module than the two it replaced, not a deeper
one.

## 7. The open question for James — asked before the work, not after

**`anyLiveSession()` and its private `monitorRunState()` have zero production
callers, and the code argues in detail for keeping them anyway.**
`monitorRun.ts:1499-1514` records the 2026-08-30 ruling: the functions are
cited BY NAME as the documented anti-pattern that a real shipped data-loss bug
(ROADMAP M-1, the F5 data-loss class) warns every future guard away from, and
deleting them orphans that documentation.

**Measured, because the comment's own count is off and the difference
matters.** The comment names eight files. Seven cite the pair outside
`monitorRun.ts`, and they split two ways:

- **Comment-only, 5 files** — `ConnectAction.tsx:67-69`,
  `useMonitorSession.ts:19-20`, `useStartWorkout.ts:138`, `Today.tsx:407-421`,
  `WorkoutDetail.test.tsx:856`. Prose edits, no behaviour.
- **Executable, 2 files** — `monitorRun.test.ts` imports it (`:29`) and asserts
  on it in a truth table plus three named tests (`:1226`, `:1272`, `:1387-1398`);
  those die with the function. And `todayGuard.pin.test.ts:51,91`, which is
  **not a pin on the function at all** — it reads `Today.tsx`'s SOURCE TEXT and
  asserts it does not `import { anyLiveSession }`.

**That last one is the finding, and it changes the option list.** If
`anyLiveSession` is deleted, that pin passes forever and can never go red — no
file can import a symbol that does not exist. It becomes decoration that reads
as a guard (RF21), on the exact anti-pattern it was written to prevent. So
option A is not "delete and update comments": it necessarily includes
rewriting that pin to bind against the RULE (Today's guard reads the record
directly) rather than against a deleted name. If A is chosen and the pin is
left alone, this PR ships an RF21 gate.

Two options, costs measured (RF30 — an invented cost picks the design for him):

- **A. Delete both, re-home the documentation, and rewrite the pin.** Cost:
  5 comment-only edits, ~5 test cases deleted with the function, and one pin
  rewritten so it still bites — the pin rewrite is the only part carrying
  risk, and it needs its own mutation proving it goes red. Benefit: two dead
  functions go, and nothing can accidentally start calling them.
- **B. Keep both, unchanged.** Cost: the merged module ships a dead export
  and a dead private function, which is RF29's shape — dead code with no row
  to remove it — so it needs a row and the question returns later. Benefit:
  zero risk to the documentation a real data-loss bug paid for, and the pin
  keeps whatever bite it has today (untested either way: nobody has checked
  whether that pin can currently go red, and this spec does not claim it can).

**Recommendation: A**, because the documentation's value is the RULE, not the
function that illustrates it, and a rule stated in the module that enforces it
is harder to orphan than one attached to a function nobody calls. But this is
his call, it is the exact decision the ROADMAP residual reserved for "whoever
next touches these functions", and the work does not start until he rules.

## 8. Tests — replace, don't layer

- `monitorRun.test.ts` (2343 lines) and `handoffStore.test.ts` (1273) become
  one suite driving commit → read → retire → rehydrate through the merged
  interface. Old tests that reach past the interface are deleted, not ported;
  the interface is the test surface.
- The 148 `saveMonitorRun` fixture seeds become `commit(...)`. This is the
  change that closes RF24 on this key, and it is the bulk of the diff.
- **One test must start upstream of the producer**: it commits, then mounts
  the reader, and asserts what the reader shows — no seeded record, no mocked
  store. Both halves being well tested is exactly the condition that hides a
  broken seam.
- A refused durable write yields `saved-without-series` **and the fixture
  path sees it** — today the fixture path cannot, because it does not go
  through the writer that produces the verdict.
- `anyLiveSession`'s five tests are deleted with the function if James rules
  A.

## 9. Exit criteria

1. `grep -rn 'saveMonitorRun' app/src app/e2e` returns nothing.
2. Exactly one function in the repo calls `localStorage.setItem` with
   `MONITOR_RUN_KEY`, shown by grep in the PR body.
3. The merged module exports ≤ 28 values; before/after lists in the PR body.
4. §5's byte-compatibility gate is green, and the PR body states both
   mutations and what their failures said.
5. `pnpm test`, `pnpm typecheck`, `pnpm lint`, and a full `pnpm e2e` run whose
   result has been read (RF1 — this diff touches `app/src/`).
6. No behaviour change: no screenshot in `docs/screenshots/` differs, and the
   PR says so rather than committing refreshed captures.

## 10. What an antagonist should attack

- The §6 export count: is 28 achievable, or does the census undercount what
  the two modules genuinely owe their callers? A number pulled from a census
  of what is EASY to delete is not a design target.
- Whether the two files should merge at all, versus keeping `monitorRun.ts` as
  the record's declaration and moving only the writer. The circular import is
  removed by moving `MONITOR_RUN_KEY` and `isMonitorRun`, which may not
  require a merge.
- The `RetireReason` union: is `reason` genuinely closed, or does some caller
  pass a string built at runtime? The census counted call sites, not their
  arguments.
- §5's fixture: a "pre-merge writer" fixture captured on `main` is only
  byte-exact for the record shapes it happens to contain. Which shapes must it
  contain — and is `seriesDropped: true` one of them?
- Whether `replaceStale` is four identical sites or three plus one that looks
  similar. RF23's shape: two mechanisms writing one value, where the
  better-informed one loses silently.
