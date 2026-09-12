> **Archived 2026-09-12** from `ROADMAP.md` (lines 539-832 at main `b2e26701`, with the exit-pass corrections of the close-out PR).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase MD — the monitor cluster's shallow seams

**Status: OPEN 2026-09-12 — four PRs and two explorations; PR 1 next.**
**TRIAD on PR 1 and PR 3** (both change a stored shape: PR 1 the
`MONITOR_RUN_KEY` localStorage record, PR 3 the series sample persisted to
BOTH that record and Postgres). **L.** · dies 2026-10-13 · a month from
opening; the monitor cluster is the repo's hottest area (`driver.ts`,
`useMonitorSession.ts`, their tests and `surfaceModel.ts` are 6 of the 10
most-touched files of the last 250 commits), so a phase that improves how it
is CHANGED rots faster than most — if it has not started by then it is being
outvoted by feature work and that is James's call to make, not a slide.

**Goal:** the monitor cluster gets fewer, deeper modules — a large amount of
behaviour behind a small interface, tested through that interface. Nothing a
rower sees changes in any PR here. The measure is not line count: it is
whether a test can reach a behaviour without a module mock, whether a renamed
field becomes a compile error, and whether a fixture seeds through the real
producer instead of past it.

**Where it came from:** an architecture walk on 2026-09-12 over the hot spots
of the last 250 commits — [findings](docs/superpowers/audits/2026-09-12-architecture-walk/findings.md),
which also records the six candidates that are NOT in this phase and the seven
things that were attacked and held. Opened through a PM slate gate and an
antagonist anchor pass on the same day; both are folded in below, and the
anchor pass BLOCKED PR 1's first spec on four findings.

**What this phase is NOT.** `driver.ts` was attacked and held: 7493 lines but
2152 code lines, behind an interface of 7 members, one `Transport` in and one
11-member event union out, with tests that reach past it nowhere. It is deep,
not a god-module, and splitting it re-opens settled wire attribution. The
`Transport` seam held too — four adapters, three decorators, a 23-line
composer and a CI gate (`scripts/transport-census.sh`). Neither is in scope,
and a later pass proposing either owes the findings document an answer.

Four PRs, then two explorations. **The explorations are NOT numbered PRs, on
purpose (PM gate, 2026-09-12):** a numbered PR reads as owed work to every
later sweep, and the existence of both of these is undecided. Each opens with
an investigation whose honest answer may be "no PR".

- [x] **PR 1 — one writer for the stored run (TRIAD: stored shape). LANDED
      as PR #408 (2026-09-12): one file, 27 exports (from 35),
      `clearMonitorRun` deleted rather than moved (zero production callers —
      plan, "The export count"), `MONITOR_RUN_KEY` kept exported (13
      files import it by name: 11 tests, 2 e2e specs).** Spec:
      `docs/superpowers/specs/2026-09-12-stored-run-module-design.md` (revision
      2 — the anchor pass blocked revision 1 and James ruled the re-scope).
      `monitorRun.ts` (1719 lines / 339 code) and `handoffStore.ts` (1016 /
      418) both own one localStorage key and neither may import the other, so
      the constraint is restated as a comment three times. The costs are
      countable: `saveMonitorRun` (`:600`) has ZERO production callers and 127
      fixture call sites across 5 files, every one of which seeds past the real
      producer (RF24), while duplicating `performDurableWrite`'s
      series-sacrifice ordering verbatim; `connectGuardStage(hasUnretired:
      boolean)` (`:1704`) takes a boolean its callers compute purely because
      the import is circular; and `retire(set, reason)`
      (`handoffStore.ts:861`) makes 12 of 13 call sites wrap an entry they
      already hold in a one-element array.
      **MOVE, NOT MERGE.** Revision 1 proposed concatenating the two files;
      the anchor pass costed the alternative revision 1 had named and never
      priced, and it reaches the same export target with less blast radius
      (RF30). `handoffStore.ts` absorbs the persistence half — the key, the
      three validators, `loadMonitorRun`, `clearMonitorRun`,
      `connectGuardStage` — and `monitorRun.ts` keeps the type and the pure
      builders with no storage call left in it. The cycle goes because the
      dependency runs one way, not because anything was merged.
      **This PR owns the hand-off store's legacy-reads residual** (below,
      under Codebase-audit owners): James ruled 2026-09-12 that
      `anyLiveSession` and `monitorRunState` are deleted and the anti-pattern
      documentation re-homed. `todayGuard.pin.test.ts` is rewritten in the
      same PR — its negative import pin would otherwise pass forever once the
      symbol is gone (RF21), and this PR breaks its two byte-exact import
      pins regardless by moving `loadMonitorRun`.
      Exit: ≤ 28 value exports (from 35), the pre-existing
      `scripts/handoffStoreBoundary.test.ts` EXTENDED rather than replaced,
      and a byte-compatibility gate whose fixtures are captured by driving the
      writer — including a thrown write, the only shape that can catch a
      renamed `seriesDropped`.
- [x] **PR 2 — a lifecycle seam on `useMonitorSession`, and publish `axes`. LANDED
      as PR #413 (2026-09-12) — one dep (`registerAppLifecycleListener`, plus
      `createTransport` widened to take the liveness deps), one derivation
      site (`session.axes` and `session.linkLoss`), 26 appLifecycle doMock
      STATEMENTS retired under `src/monitor/` (29 → 3 repo-wide, in the
      adapter's own test and `JustRow.test.tsx`). Three of this row's figures
      were wrong (RF10): 29/32 were raw line counts including prose (26/29
      statements); "five sites build `AxesInput`" is four for `deriveAxes` and
      one for `deriveLinkLoss`, which is why `linkLoss` is published too (the
      axes tuple `lost|none|none|unknown` cannot tell `pairing` from
      `disconnected`); "stop exporting `ConnectedPhase`" was NOT done —
      `connectedAxes.ts` needs the type and five test files cast to it, and
      the readers pin's allowlist is unchanged. The ring records a failed
      session-listener registration now (RF19), and the dead `AxesInput`
      link-up field is gone with its ruling re-homed at the hook's
      derivation (spec §4).**
      **Carries three one-line riders from Exploration A (2026-09-12):** (1)
      drop the dead `export` on `ROWING_ACTIVE_FALLBACK_FRAMES` (zero
      importers); (2) `resumeEdgeArmedRef`'s doc claims to mirror
      `framesWhileHiddenRef`'s lifetime — five clear sites versus two — correct
      the comment; (3) `framesEverEmittedRef`'s doc says "cleared at teardown"
      and no clear site exists — its lifetime is the MOUNT. Plus the RF19
      finding that `lifecycleUnsubRef`/`lifecycleAttemptRef` emit no ring entry
      on any path, which the seam PR owns. Spec drafted and antagonist-passed
      2026-09-12 (rev 2, in the controller's scratchpad until the PR opens);
      the PM re-runs the one-risk-model grouping test at its gate now that the
      riders are in.
      *Two candidates grouped into one PR at the PM gate (2026-09-12): both
      change this hook's published interface, both are test-facing, and a
      reviewer holds one risk model rather than two.*
      **(a) The lifecycle seam.** `MonitorSessionDeps` (`:1112`) carries nine
      injectable deps and no lifecycle; `registerAppLifecycleListener` is a
      static import (`:104`, called `:5315`/`:5620`). So the one input this
      repo has already been burned by (RF19 — a platform-sourced input no
      instrument could see) is reachable in tests only through `vi.doMock` +
      `vi.resetModules()` + dynamic import: **29 occurrences across 7 files
      under `src/monitor/`, or 32 across 9 repo-wide** — the extra two are
      `justrow/JustRow.test.tsx` (a component test that cannot inject a hook
      dep) and `adapters/appLifecycle.test.ts` (the adapter's own test), and
      neither is deleted by this change. Meanwhile `replay.ts` already carries
      `lifecycle` events and an `onLifecycle` hook and cannot reach the hook at
      all. Add one optional dep defaulting to the adapter; three adapters then
      sit at the seam.
      **(b) Publish `axes`.** Five production sites repeat the identical
      five-field literal to build `AxesInput` (`connectedAxes.ts:103`) out of
      the session (`JustRowObserver.tsx:39`, `JustRow.tsx:145` and `:152`,
      `ConnectedSurface.tsx:603`, `ConnectedInterstitial.tsx:919`), and
      "AXES, NEVER `session.phase`" is enforced by a comment
      (`JustRow.tsx:138-141`) because nothing structural does. Derive once
      inside the hook, publish `MonitorSession.axes`, stop exporting
      `ConnectedPhase`.
      **`AxesInput.failureLeavesLinkUp` is dead and its deletion carries PR 1's
      question, which this row originally failed to ask (PM gate).** It is
      hardcoded `null` at all five production sites while 5 test assertions
      pass it non-null, AND `connectedAxes.ts:116-135` is the only written home
      of the NOT_A_MACHINE_REFUSAL ruling — *"a transport-side failure reads
      `lost`, a genuine `ProgramRejection` the PM5 itself sent reads `up`"* —
      whose own comment says *"whoever FIRST passes a real value inherits"* it.
      Same shape as `anyLiveSession`: deleting is probably right, asking where
      the ruling lives afterwards is mandatory. **Put it to James before
      implementation, the way PR 1 did.**
- [x] **PR 3 — one `Sample` shape (TRIAD: stored shape). LANDED as PR #412
      (2026-09-12) — with four corrections to this row's own claims (RF10):
      SIX declarations, not five (`server/routes/concept2.ts`'s cast is a
      sixth, UPSTREAM of the mapping); the +19.1% belongs to `r: null`, which
      the PR does not write — a required KEY valued `undefined` is ZERO bytes,
      measured on four serializers; the promised recorder-driven test already
      existed on the CLIENT and the missing one was the SERVER seam
      (`server/routes/seriesSeam.test.ts`); and the caveat below about
      `stores/logs.ts:120-127`'s deliberate mirror is ANSWERED, not honoured —
      that comment's reason ("server code never imports from `src/`") stopped
      covering the case the moment `Sample` moved to `domain/`, which the
      server already compiles and imports, so the mirror is gone and six
      declarations became TWO.** Was: Five hand-written
      declarations of one wire-and-storage shape with no compiler link between
      producer and any consumer: `seriesRecorder.ts`,
      `domain/monitor/derivedHeartRate.ts`, `server/stores/logs.ts:128`,
      `server/routes/data.ts:810-880`, and an inline re-declaration at
      `server/concept2/mapping.ts:64`. This is where RF33 bit — the rest flag
      was spelled `rest`, structural typing accepted the real `Sample` with the
      key absent, and the exclusion was dead on every production path while
      every test passed. **The landed fix was a comment**
      (`derivedHeartRate.ts:50-58`); `r?: true` is still optional in both, so
      the identical rename would reproduce it. *Not a live defect — both sides
      spell it `r` today and the average is correct. The defect is that
      nothing stops the next rename.*
      **This is TRIAD and the first draft said it was not.** `Sample` sits
      inside `SeriesData` inside `MonitorRun.series`, which is
      `JSON.stringify`'d whole to `MONITOR_RUN_KEY`, and also reaches Postgres
      via `stores/logs.ts`. Making `r` required with `null` meaning absent —
      CLAUDE.md's own prescription — writes `"r":null` on every WORK sample:
      **+9 bytes each, +127 KiB and +19.1% at `SERIES_SAMPLE_CAP` = 14400**, on
      the record whose size already forced the series-sacrifice mechanism, and
      whose own comment says the absent idiom exists so *"a work sample costs
      zero extra bytes."* **The zero-byte reading is what RF33 actually
      prescribes:** required on the domain FUNCTION'S INPUT INTERFACE, not on
      the persisted shape. The spec must also engage
      `stores/logs.ts:120-127`, which states the server mirror is DELIBERATE —
      *"a server-side MIRROR ... not a shared import"* — rather than treating
      it as drift.
      **Orders against PR 1:** whichever runs second inherits or invalidates
      the other's byte-compatibility fixture.
      One new test builds its input by driving `createSeriesRecorder` and never
      names a field. *The `MAX_GAP_DECISECONDS` boundary pin this row
      originally promised ALREADY SHIPPED in #345 —
      `derivedHeartRate.replay.test.ts:113`, independent literals, 59 → 100 and
      60 → null. Half this row's test work is done.*
- [x] **Exploration A — the freeze/resume observer.** The hook holds 38
      `useRef`s; twelve are one concern (background, frame silence, freeze,
      resume). Six symbols are exported ONLY so the test can reach them —
      `defaultLivenessSchedule`, `recordLivenessSilence`,
      `recordLivenessRecovery`, `handleFrameRecovery`, `nextRowingStreak`,
      `ROWING_ACTIVE_FALLBACK_FRAMES`, each with `useMonitorSession.test.ts` as
      its sole non-self consumer. That is the textbook "pure functions
      extracted for testability while the bugs live in how they are CALLED",
      at the largest scale in the repo, and RF27 came out of this same file
      having moved only five fields into `LogicalSession`.
      **Decides ONE question: do the twelve refs move with the observer, or
      only the pure helpers?** If they move, a `createFreezeObserver({now,
      schedule})` is a real 3-in/4-out interface and complexity concentrates.
      If they stay behind, complexity MOVES and there is no PR.
      **Its output is worth having either way (PM gate):** a lifetime table
      over the twelve refs — mint site, clear sites, what survives teardown,
      relaunch and re-arm — is the artifact RF27 says a plan owes anyway, and
      RF19's blind-instrument defect lived in exactly these refs. Fund it on
      that basis, not on the PR that may follow.
      **Exploration A — answered 2026-09-12: NO PR.** The refs were re-counted
      (38 total, confirmed) and the concern re-drawn: it is **14**, not twelve,
      and they are three concerns with three different lifetimes — 7
      instrument-only refs that reach no published value, 5 predicate refs
      behind `frozen`/`frameSilence`, and 2 app-lifecycle unsubscribe handles
      that belong to PR 2. A `createFreezeObserver` serving all 14 call sites
      prices at **5 deps + 10 methods + 2 outputs = 17 members**, not the
      3-in/4-out the row assumed, because its busiest writer — the
      foreground-edge handler — also reads the liveness snapshot, increments
      `LogicalSession`'s own `resumes`/`latches`, calls `update()`, reads
      `stateRef`, and calls `transport.markSuspect()`; those five couplings
      become parameters. No call site disappears and no `vi.doMock`
      disappears (all target `adapters/appLifecycle` and are PR 2's to
      remove). Deletion test: **moves, not concentrates.** The artifact the
      row was funded for — the RF27 lifetime table over the refs — is
      delivered: `docs/superpowers/audits/2026-09-12-architecture-walk/exploration-a-freeze-observer.md`.
      Three one-line riders ride PR 2 (named in PR 2's row). Re-open only if PR 2 lands and the
      foreground handler, with lifecycle injected, still reads as a module
      wanting an owner.
- [x] **Exploration B — one replay harness. Runs after PR 2, never before.**
      · dies 2026-10-13 (campsite: given the phase's own date on the way past
      by PR 2, 2026-09-12; its opener has always been "maybe no PR") ·
      Eight session-level replay specs — the `src/monitor/*Replay*.test.ts`
      files that drive `renderHook`: `burstReplay`, `lifecycleReplay`,
      `summaryHoldReplay`, `handoffStoreReplay`, `justRowReplay`,
      `partialReplay`, `liveDropSeamReplay`, `structureWatchSessionReplay`
      (`oracleCorpusReplay` and the driver-level replay specs are NOT in this
      set) — each re-hand-roll the same ~45 lines of setup: gunzip +
      `parseRecording`, `createReplayTransport` + `withLiveness`, two
      `vi.doMock`s, `resetModules`, a dynamic import, a `renderHook` deps
      object. The driver level already has a shared harness
      (`src/test/statusSubscriptions.ts`); the session level has none. 36 test
      files reference `docs/monitor/sessions`.
      **One justification is WITHDRAWN.** This row first claimed that renaming
      a spec "silently" stops its fixture matching. The anchor pass produced
      the condition — copy the spec to a new filename so the
      `import.meta.url` surgery cannot match — and it fails LOUDLY, with the
      malformed path printed: `ENOENT ... burstReplayRenamed.test.tskeystone-pm5-recording-….jsonl.gz`,
      `Test Files 1 failed`. The path surgery is ugly and worth fixing; it is
      not a silent-failure hazard, and the row no longer claims it is.
      **Decides two things: how much of the ~45 lines is genuinely IDENTICAL
      across the eight rather than eight similar-looking setups with
      load-bearing differences, and how much value survives if PR 2 does not
      land** (most of it comes from the mocks disappearing, which is PR 2's
      doing). A shared harness built over differences that matter is a worse
      module than eight honest copies.
      **Exploration B — answered 2026-09-12: NO HARNESS.** Measured on main
      `bed5c1e4` (census:
      `docs/superpowers/audits/2026-09-12-architecture-walk/exploration-b-census.md`).
      Normalising the eight runner cores (comments stripped, constant names
      unified) gives 109 distinct lines; **8 appear in all eight, four of them
      punctuation**, and 59 appear in exactly one file. (Exit pass 2026-09-12:
      the 8-in-all row reproduces exactly; 109 and 59 depend on where the core
      is cut — the census states two boundaries, giving 161/8/101 and 80/8/40 —
      and the roughly-half-unique conclusion holds under all three, so quote
      the 8/8 row, not the totals.) Every one of the eight
      has an assertion that dies if its setup is swapped: `burstReplay` and
      `summaryHoldReplay` call the runner twice per test and need a fresh
      module graph (the comment records the failure), `handoffStoreReplay`
      needs a `Storage.prototype.setItem` denial in the hook's own epoch,
      `justRowReplay` never calls `program()`, `partialReplay` pins one-element
      divergence lists only reachable at `barrierTimeoutMs: 250`,
      `liveDropSeamReplay` needs `extendClock` + `injectable`,
      `structureWatchSessionReplay` needs a counting transport BETWEEN replay
      and `withLiveness`, `lifecycleReplay` needs `onLifecycle` + the real
      liveness spread. The row's premise ("two `vi.doMock`s, `resetModules`, a
      dynamic import" each) described two of the eight after #413; the ten
      `vi.doMock`s that remain in the set all mock `../api*` for a screen the
      hook never imports, so no hook dep can reach them. **What DID ride
      (Exploration B's PR):** the `import.meta.url` path surgery — 8 of 8 used
      it, each regex embedding its own filename, 25 files repo-wide — became
      one loader in `src/test/captures.ts`; and the last two transport
      `vi.doMock`s AMONG THE EIGHT became `createTransport` deps (six remain
      under `src/monitor/`, all in `useMonitorSession.test.ts`'s own
      composition tests — exit pass, 2026-09-12). One
      divergence recorded, no row: five of the eight stub the hook's
      `onSilence`/`onRecovery` and three spread the real ones; inert (none of
      the five asserts `frameSilence`), and a replay spec that asserts silence
      says which it is.

**Exit:** every PR that lands states which module got deeper and what its
interface now is, in one sentence, at the top of its body. Phase close reports:
the `vi.doMock` count under `app/src/monitor/` before and after; `saveMonitorRun`
gone with `scripts/handoffStoreBoundary.test.ts` extended and green; a grep
proving no second declaration of the series sample shape survives —
`grep -rnE '(^|[^a-zA-Z])r\??: true' app/src app/domain app/server --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
prints exactly three lines (the domain declaration, the server witness's
`r: true`, PR 1's hand-authored rest fixture) and no declaration outside
`domain/monitor/types.ts` — **and the exit pass (2026-09-12) showed that grep
measures a SPELLING:** a decoy `rest?: true` declaration left it at three.
What holds the invariant is `server/stores/logs.ts`'s
`-readonly [K in keyof Sample]` mapped type, `concept2/mapping.ts`'s `Pick`,
and the `SERIES_SAMPLE_FIELDS` witness; cite the derivation, not the grep. And,
for the
two explorations, either the PR or the written "no PR, because…". **No hardware
walk** — nothing here reaches the wire, the pace math, or any number a rower
reads, and a PR in this phase that finds itself changing one has left the
phase. **One caveat on that claim (PM gate):** it holds for PR 3 only if the
series shape stays optional on the wire; the 19.1% inflation above is a
tester-visible failure mode with no screen to show it on.

