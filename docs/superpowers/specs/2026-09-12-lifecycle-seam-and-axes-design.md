# Phase MD PR 2 — a lifecycle seam on `useMonitorSession`, and publish `axes`

**Not TRIAD.** No number changes meaning, no stored shape changes, no auth. So:
no PM final-PR gate, no Gate 0 (nothing a rower sees changes), an antagonist
DELTA pass on this spec (one invented mechanism: an injectable lifecycle
registrar), and `/harden` on the plan.

**Revision 2.1, 2026-09-12** — plus the plan's paste-test corrections (§4's ring kind now matches §3; 20 hook blocks and 6 replay specs, not 22 and 7; 24 of 26 freed). **Revision 2** folds the antagonist delta pass (4 blocking, 3 major, 4 held-with-additions); §9 records what revision 1 got wrong. Written from the census at
`docs/superpowers/audits/2026-09-12-architecture-walk/pr2-census.md` (every
number below carries its command there). Five corrections to the ROADMAP row it
implements are listed in §7 rather than silently absorbed (RF10).

## What and why

The hook that runs a connected session takes nine-plus injectable dependencies
and no way to inject the one input this repo has already been burned by: the
app going to the background and coming back (RF19 — a red LOST THE MONITOR
banner fired nine times over a link that never dropped, and no instrument saw
it). Today the only way a test can deliver a background/foreground event is to
replace the adapter module — `vi.doMock` + `vi.resetModules()` + a dynamic
import — which is why 29 such mocks sit under `src/monitor/` and why a replay
recording's own `lifecycle` track cannot reach the hook without that ceremony.

Separately, five screens each rebuild the same five-field object out of the
session to ask "what are the axes right now", and the rule that screens read
AXES rather than `session.phase` is enforced by a comment.

**This PR adds one optional dependency (the lifecycle registrar, defaulting to
the adapter) and publishes `axes` and `linkLoss` once from the hook.** Tests
then deliver lifecycle events by passing a function, the seven replay specs
lose their appLifecycle mock, five screens stop deriving, and the axes
derivation has one home. Nothing a rower sees changes.

## 1. Research pass and does-it-exist

- **Does the platform own anything here?** The lifecycle EVENTS are owned by
  iOS/Capacitor and the browser; this PR does not change how they are
  observed (`adapters/appLifecycle.ts` is untouched — its web arm stays a
  no-op, its native arm stays the Capacitor `App` plugin). It changes only how
  the hook obtains the registrar. Research already recorded:
  `docs/superpowers/research/` (lifecycle design 2026-08-31, `§0.4`), cited
  not redone.
- **Is a new mechanism being invented?** One: a dependency-injected registrar.
  It is the same shape as the hook's existing `createTransport` dep (an
  optional field on `MonitorSessionDeps`, read as `depsRef.current.x ??
  default` at call time — the census §1a names the resolution mechanism).
  Nothing about ordering, identity or lifetime is new: the registrar is called
  at the two existing sites and its return handled by the existing code.
- **Does the underlying system have the concept?** "Axes" are our own
  derivation over our own state (`connectedAxes.ts`); publishing them moves a
  pure function's call site, asserts nothing on any system's behalf.
- **Prior art in this repo:** `MonitorSessionDeps.createTransport` (the seam
  this copies), `src/test/statusSubscriptions.ts` (the driver-level harness
  that already exists), `monitor/connectedPhaseReaders.test.ts` (the pin that
  governs who reads `ConnectedPhase`; it bites both ways — §4).
- **Nothing found** under `docs/superpowers/research/` on dependency
  injection for React hooks; there was nothing to re-read.

## 2. Census — verified, with the command that produced each (census doc §)

| Claim | Measured | § |
| --- | --- | --- |
| `MonitorSessionDeps` fields | **10** (ROADMAP said nine); `createSessionId` injected by nobody | 1a |
| `registerAppLifecycleListener` call sites in the hook | **2** — the scan lease (awaited, try/catch, records `listener-registration-failed`) and the session listener (NOT awaited, NO `.catch`, records nothing on failure) | 1b |
| Other production importer of the adapter | `monitor/nfc/useNfcEntry.ts` — NOT this hook, not this PR | 1b |
| `vi.doMock(".*appLifecycle")` STATEMENTS | **26 / 7 files** under `src/monitor/` (20 in `useMonitorSession.test.ts`, 6 replay specs — plan Task 0 re-measured; rev 2 said 22 + 7), **29 / 9** repo-wide (`grep -rn 'vi.doMock("../adapters/appLifecycle"' … \| grep -vE ':\s*(//\|\*)'`); the ROADMAP's 29/32 are raw line counts including three PROSE lines (`useMonitorSession.test.ts:4527`, `:11261`, `lifecycleReplay.test.ts:12`) that stay | 2, delta pass B3 |
| Test blocks the seam actually frees of `resetModules` + dynamic import | **6 of 19** in `useMonitorSession.test.ts`; the other 13 and all 7 replay specs ALSO mock `../adapters/monitorTransport`, because `createTransport?: () => …` takes no arguments while the default path calls `defaultTransport(livenessDepsRef.current)` — a replay spec that must hand the replay clock to `withLiveness` cannot use the dep | delta pass M2 |
| Other `vi.doMock` under `src/monitor/` this PR does NOT touch | 65 (32 of them `../adapters/monitorTransport`) — the replay specs keep `resetModules` for those | 2 |
| `AxesInput` build sites | **5**, field-identical; **4 call `deriveAxes`, 1 calls `deriveLinkLoss`** (`JustRow.tsx:152`) | 3 |
| Tests passing `failureLeavesLinkUp` non-null | **3**, all in `connectedAxes.test.ts` (ROADMAP said five); 27 more `: null` lines break as excess properties | 3 |
| Dead branch once the field goes | exactly one: `link: "up"` at `phase === "failed"` | 3 |
| `ConnectedPhase` importers | 1 production (`connectedAxes.ts`), 5 test files | 4 |
| `session.phase` raw reads a published `axes` does NOT replace | `ConnectedInterstitial.tsx` 11, `ConnectedSurface.tsx` 3 — allowlisted "migrating debt" in `connectedPhaseReaders.test.ts` | 4 |
| `lifecycleUnsubRef`/`lifecycleAttemptRef` diagnostic emits | **0** across 22 sites | 6d |

## 3. The invariants this owes (RF27 — invariants, not mechanisms)

1. **Each site calls the registrar current at its own call time.** With the
   dep omitted, both sites call the adapter export (a module binding — one
   value). With it supplied, each site reads `depsRef.current` at the moment it
   runs, and `update({ phase: "pairing" })` between the scan lease and the
   session registration is a commit that refreshes `depsRef` — so a test that
   mints a new closure per render sees two different functions. Test rule: the
   dep is a stable `const` hoisted out of the render callback; one test
   rerenders with a fresh dep between the sites and shows the divergence is
   harmless. One test asserts the default resolves to the adapter export
   (`vi.spyOn` on the import namespace — probed green under this repo's
   vitest — in a test that does NOT also `resetModules`).
2. **A failed session-listener registration for a LIVE attempt is one ring
   entry; for a cancelled attempt it is silent.** The promise arm of the
   session registration gains a `.catch` that opens with the same
   `if (lifecycleAttempt.cancelled) return;` the `.then` arm already has, then
   `log.record("lifecycle-registration-failed", "session")` — into the session
   RING (`log`, created before GATT and already closed over by this handler),
   NOT the NFC attempt trace: that trace is drained into the ring and
   `complete()`d before the session registration runs, and is `undefined` on
   every non-NFC connect, so a `trace?.record` there reaches nothing (delta
   pass B1). The scan lease's `trace?.record` survives only because it fires
   before the drain — an asymmetry, not a defect. The synchronous arm is
   unchanged and deliberate: a registrar that THROWS lands in `connect()`'s
   existing `catch` → `fail(mapRadioFailure(err))`. Whether a native
   `App.addListener` can actually reject is unproven; this is hardening on a
   path the seam makes injectable, filed as such.
3. **One derivation.** `session.axes` and `session.linkLoss` are computed by the
   hook from the same four fields the five screens used to forward, and no
   production file outside the hook calls `deriveAxes`/`deriveLinkLoss`. Gated
   structurally: `connectedPhaseReaders.test.ts` gains a second scan — no
   non-test file outside `useMonitorSession.ts` and `connectedAxes.ts` matches
   `/\bderive(Axes|LinkLoss)\(/`.
4. **`failureLeavesLinkUp` is gone and its ruling is not.** The
   NOT_A_MACHINE_REFUSAL ruling (a transport-side failure reads `lost`; a
   genuine `ProgramRejection` the PM5 itself sent would read `up`) lives as a
   comment at the hook's axes derivation — the only place a real value could
   ever be produced — and `deriveLink`'s `failed` case returns `"lost"`
   unconditionally, with the comment naming the branch that died.
5. **Lifetime: nothing new.** The dep is read at call time from `depsRef`;
   no new ref, guard or counter. The lifetime table for the refs the
   registrar's callbacks touch is Exploration A's (§A of its report) and this
   PR changes none of their mint or clear sites, except as §5's riders say.

## 4. What changes

- **`MonitorSessionDeps.registerAppLifecycleListener?: typeof registerAppLifecycleListener`.**
  Both call sites read `depsRef.current.registerAppLifecycleListener ??
  registerAppLifecycleListener`. The static import stays (it IS the default).
- **The session registration gets its `.catch`** (invariant 2): the promise arm
  opens with `if (lifecycleAttempt.cancelled) return;` and records
  `lifecycle-registration-failed` / `"session"` into the session ring via
  `log.record` (the NFC attempt trace is drained and closed by then — §3.2);
  it does not rethrow. The synchronous arm is unchanged.
- **`MonitorSession.axes: ConnectedAxes` and `MonitorSession.linkLoss:
  LinkLossAxis`**, derived in the hook's return from `state.phase`,
  `state.frozen`, `state.runOpen`, `state.frameSilence`. `linkLoss` is
  published because it is NOT a function of `axes`: over the full
  9 phases × frozen × runOpen × frameSilence cross-product (delta pass H1,
  enumerated against the real module) the axes tuple `lost|none|none|unknown`
  is produced by both `pairing`+frameSilence (`linkLoss: "inferred"`) and
  `disconnected` (`"reported"`) — the exact pair whose conflation is the Phase
  RN Gate 0 defect (offering a reconnect that cannot run). This overrides
  `connectedAxes.ts`'s own sentence that `deriveLinkLoss` is "exported as its
  own reader rather than added to `ConnectedAxes` because exactly one screen
  needs it": one derivation site now beats one narrow shape, and the comment
  is rewritten to say so.
- **`createTransport` widens to `(liveness: LivenessDeps) => Transport | null | Promise<…>`**
  (delta pass M2): source-compatible with all 41 existing zero-argument
  injections (a narrower function is assignable), and it is what lets a replay
  spec hand the replay clock to `withLiveness` through the dep instead of
  replacing `../adapters/monitorTransport`. With both deps injectable the
  six replay specs and all 20 hook-test blocks lose their `resetModules` +
  dynamic import for THESE two modules; two replay specs (`justRowReplay`,
  `summaryHoldReplay`) also mock `../api*` and keep `resetModules` for that —
  so the honest after-count is 24 of 26 blocks freed, and the exit criterion
  prints the measured figure.
- **The five sites** (`JustRowObserver.tsx`, `JustRow.tsx` ×2,
  `ConnectedSurface.tsx`, `ConnectedInterstitial.tsx`) read `session.axes` /
  `session.linkLoss`. `JustRow.tsx`'s "AXES, NEVER `session.phase`" comment
  becomes a one-line pointer at the hook.
- **`AxesInput.failureLeavesLinkUp` is deleted** (James, 2026-09-12): the field,
  `deriveLink`'s ternary (→ `return "lost"`), the 27 `: null` lines and the 3
  non-null assertions in `connectedAxes.test.ts`. The ruling paragraph moves,
  verbatim, to the hook's derivation site, prefixed with when and why it moved.
- **`ConnectedPhase` STAYS exported** (§7 — the ROADMAP row said stop; the
  census shows `connectedAxes.ts` needs it and five test files cast to it).
  `connectedPhaseReaders.test.ts`'s allowlist is unchanged: all four files
  still read the type; `ConnectedInterstitial.tsx`/`ConnectedSurface.tsx`'s
  raw `session.phase` reads are the allowlisted migrating debt and are NOT
  this PR's.
- **The 29 appLifecycle doMocks go**: `useMonitorSession.test.ts`'s 22 become a
  `registerAppLifecycleListener` dep on the `renderHook` deps object; the
  seven replay specs pass `createReplayTransport(..., { onLifecycle })`'s
  callback straight through as the dep. The 3 hoisted `vi.mock`s for
  `useNfcEntry`'s consumer and the 2 in `justrow/JustRow.test.tsx` (a
  component test that cannot inject a hook dep) and the adapter's own test
  stay — the phase close reports the count before and after.
- **Exploration A's riders (same file, one line each):** (a) `export` dropped
  from `ROWING_ACTIVE_FALLBACK_FRAMES` (zero importers); (b)
  `resumeEdgeArmedRef`'s doc no longer claims to mirror `framesWhileHiddenRef`
  (five clear sites versus two — the comment, not the code, is corrected:
  `framesWhileHiddenRef` reaches exactly one `resume-frames` ring string with
  one test consumer, the absent per-run clear is DELIBERATE, and the first
  real consumer of `resume-frames` inherits the question — said in the
  comment so the next reader does not re-open it); (c) `framesEverEmittedRef`'s
  doc says its lifetime is the MOUNT (no teardown clear exists).
- **The re-homed ruling** loses its two dangling pointers ("`deriveLink`'s
  own case, above", "out of scope for this task") and points at
  `ConnectedInterstitial.tsx`'s existing NOT_A_MACHINE_REFUSAL markers, which
  are the ruling's OTHER home (six mentions) — this PR adds the derivation-site
  paragraph, it does not create the concept's first home.
- **The flake row** (`useMonitorSession.test.ts`, `listSessionLogs()` 1 → 2):
  the census bounds the mechanism to cross-test leakage through the single
  `beforeEach` reset (INFERENCE — the only producer consistent with "passed
  on three isolated re-runs"). **No hunt is run** (delta pass M3): a filtered
  re-run removes the very producers the mechanism needs, and a new global
  timer-flushing `afterEach` in a file carrying 28 `useFakeTimers` would
  mutate the suite under investigation. The row closes as "mechanism bounded
  to cross-test leakage; unreproduced; re-opens on the next firing", which is
  what its own text asks for.

## 5. Tests — replace, don't layer

- **The seam test** (RF24, starts upstream of the producer): a replay recording
  with a `lifecycle` track drives the hook through BOTH deps — no doMock, no
  resetModules — and the hook's ring shows the `app-lifecycle` entries the
  recording carries. This is the test the ROADMAP says cannot be written
  today.
- **The default test**: with the dep omitted, the registrar the hook calls IS
  the adapter export — `vi.spyOn` on the import namespace, in a test with no
  `resetModules` (a reset gives a different registry's namespace).
- **The failure tests** (invariant 2): a dep returning a rejected promise for
  a live attempt yields exactly one `lifecycle-registration-failed` /
  `"session"` ring entry and a session that continues; the same for an attempt
  cancelled before the promise settles yields NONE. Mutations: remove the
  `.catch` (first test red on the missing entry, vitest reports the unhandled
  rejection); remove the `cancelled` guard (second test red).
- **The two-sites test** (invariant 1): rerender with a fresh dep between the
  scan lease and the session registration; assert each site called the value
  current at its time, and nothing else changed.
- **Axes**: one test per former site asserts the screen renders the same
  thing for `session.axes` as it did for its own derivation — the existing
  screen tests already assert on axes-driven output; the change is that they
  stop passing `phase`/`frozen`/... fixtures and pass `axes` instead. Plus the
  structural scan in `connectedPhaseReaders.test.ts` with its own red/green
  detector case, like its siblings.
- **`connectedAxes.test.ts`**: the `failed` row collapses to one case (`lost`);
  the `:443-462` `deriveLinkLoss ⇔ deriveLink` contract test stays and still
  holds (census §3).
- The 22 hook tests re-expressed through the dep are ported by hand, not
  regex: each one's `vi.fn((cb) => { lifecycleCb = cb; ... })` becomes the dep
  value, and its `resetModules`/dynamic import stays only if another mock in
  the same test needs it (the census says the replay specs' transport mock
  does).

## 6. Exit criteria

1. `grep -rn 'vi.doMock("../adapters/appLifecycle"' app/src/monitor | grep -vE ':\s*(//|\*)' | wc -l` → **0** (from 26 statements); repo-wide → **3** (from 29), the PR body names the three; the three prose lines stay, reworded to past tense. And the phase-exit metric the ROADMAP asked for is restated per TEST BLOCK: hook-test blocks and replay specs that reach a lifecycle event or a replay transport WITHOUT `resetModules` + dynamic import — 0 of 26 before, all 26 after (the number is re-measured, not this sentence).
2. `grep -rn 'failureLeavesLinkUp' app/src ROADMAP.md` → empty (it catches the two dangling comment references at `ConnectedSurface.tsx` and `ConnectedInterstitial.tsx` and the live ROADMAP row); the re-homed paragraph is pinned by a phrase that is RED on main — `grep -c 'a genuine .ProgramRejection. the PM5 itself sent reads' app/src/monitor/useMonitorSession.ts` → 1 (0 today) — and shown red by deleting the paragraph. (`grep NOT_A_MACHINE_REFUSAL` already hits `:239` on main and proves nothing.)
3. `grep -rnE '\bderive(Axes|LinkLoss)\(' app/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -vE '^app/src/monitor/(useMonitorSession|connectedAxes)\.ts:'` → empty (filter by PATH, not by any line mentioning the filenames; on main it returns exactly the five sites, so it is red today), and the structural test that enforces it is shown red under one mutation (a re-added call in `JustRow.tsx`). The detector strips `/* */` and whole-line `//` only, so JustRow's replacement pointer comment is a leading-line comment, and the detector gets its own "does not fire on prose" case in that shape.
4. The seam test drives a recording's `lifecycle` track through the dep.
5. `listener-registration-failed` / `"session lifecycle"` has a test and a
   biting mutation.
6. `pnpm test`, `pnpm typecheck`, `pnpm lint`, a full `pnpm e2e` whose result
   was read (RF1); no screenshot committed.
7. The PR body's first sentence: which module got deeper and what its
   interface now is (phase exit).

## 7. Deviations from the ROADMAP row, stated (RF10)

- "Nine injectable deps" → ten (`createSessionId`, injected by nobody — left
  alone; deleting an unused dep is not this PR's question and it is filed
  nowhere because it costs nothing).
- "Five sites build `AxesInput`" → four build it for `deriveAxes`, one for
  `deriveLinkLoss`; hence `linkLoss` is published too.
- "Stop exporting `ConnectedPhase`" → NOT done: `connectedAxes.ts` needs the
  type and five test files cast to it; the pin that governs readers stays as
  is. The row's intent — screens read axes, not the phase — is met at the five
  sites; the 14 remaining raw reads are allowlisted debt with their own row.
- "`replay.ts` … cannot reach the hook at all" → it can, through a doMock; the
  accurate claim is "no injectable path", which is what this PR adds.
- "5 test assertions pass it non-null" → 3.
- "29 / 32 doMocks" → 26 / 29 statements; three are prose.
- `ConnectedSurface.tsx` survives the `ConnectedPhase` readers pin on exactly ONE line (`if (session.phase === "ended")`); if any PR rewrites that line the allowlist's no-dead-entries test goes red and the entry comes off in the same PR — recorded here so it is not a surprise.

## 9. What revision 2 changed, and why

- Invariant 2 wrote to the NFC attempt trace, which is drained and completed before the session registration and absent on ordinary connects — zero evidence on every path. Now the session ring, guarded by `cancelled`.
- Invariant 1 claimed one registrar for both sites; the depsRef refresh between them makes that false for an inline test closure. Reworded, with the test rule.
- Exit criterion 1 counted prose; criterion 2's second half was green on main; criterion 3's filter matched lines not paths.
- `linkLoss`'s justification was the weak one; the collision is the reason.
- `createTransport` widening added — the doMock win was 6 of 19 blocks without it.
- The flake hunt is dropped: the prescribed experiment removed the mechanism it hunted.

## 8. Ruled by James, 2026-09-12

`AxesInput.failureLeavesLinkUp` is deleted; the NOT_A_MACHINE_REFUSAL ruling is
re-homed as a comment at the hook's axes derivation. The flake row and
Exploration A's three riders ride this PR.
