# AUD-016 Durable Hand-off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the ended hand-off verifies writability once and refuses to end
silently on a failed write — held-error frame, retry, and a memory carry
that keeps the erg's own numbers.

**Architecture:** `saveMonitorRun` gains a four-exit verdict; the verify
runs at every ended hand-off with a completed run (hold release AND
no-hold closes); `"failed"` enters a timer-less held-error state whose
exits are RETRY, LOG IT ANYWAY, and an enumerated teardown-escape stash;
a one-shot module slot carries the run (with the burst folded in memory
when the append declines against empty storage) to `monitorModeRun`,
slot-first after the `from=monitor` guard.

**Tech Stack:** the #228 hold machinery in `useMonitorSession.ts`,
`monitorRun.ts`, `ConnectedSurface.tsx`, the `summaryHoldReplay.test.ts`
replay harness, Vitest jsdom, the fixture/screenshot pipeline.

**Spec:** `docs/superpowers/specs/2026-08-29-aud016-durable-handoff-design.md`
— read §1 (mechanism, placement rules, the fold), §3 (slot lifecycle and
the honest reload sentence), §4 (Gate-0-approved strings, exact), §5
(ring-only receipts), §6 (two stub shapes) before any code.

## Global Constraints

- SDLC: worktree `Ergomatic-wt-aud016` (branch `wave-f-aud016-spec`),
  `git rev-parse --show-toplevel` before every commit, no merge without
  James.
- TDD: Tasks 1–2 write the gate legs RED first (commit red plainly with
  `// RED until Task 3/4/5` comments; hooks run format/lint/typecheck at
  commit, not tests).
- Verdict type and names, verbatim across tasks:
  `type SaveVerdict = "saved" | "saved-without-series" | "failed"`;
  exit mapping `:477→saved`, `:486→saved-without-series`, `:479` AND
  `:490→failed` (four exits — the `:479` no-series-to-sacrifice throw is
  a FAILURE; the spec's §1.1 warns an implementer will misread it).
- Session field `holdError: "storage-failed" | null`; hook methods
  `retryHandoffSave()` and `proceedHandoff()`; slot functions
  `stashHandoffRun` / `takeHandoffRun` / `clearHandoffRun` in
  `monitorRun.ts`.
- Receipt kinds, ring-only (`logRef.record`, NEVER `recordLogDoorMiss` —
  spec §5, RF21): `release-save`, `summary-folded-in-memory`,
  `hold-error-entered`, `hold-error-retry`, `hold-error-proceed`,
  `handoff-stashed` (reason: proceed / teardown-escape /
  post-unmount-burst / without-series / superseded).
- Placement rules (spec §1.2, binding): `releaseHandoff("teardown")`
  NEVER verifies; a post-unmount `resolveHandoffCondition` release
  stashes to the slot instead of rendering; the verify never runs twice
  per hand-off; no-hold closes verify synchronously in their `ended`
  patch before `handoffHeld` is computed.
- The held-error state has NO timer — the spec's stated exception to
  bounded backstops; do not add one.
- UI strings exactly as Gate-0 approved (spec §4):
  `COULD NOT KEEP THE RECORD ON THIS PHONE.` on `.connected-keep-on`;
  `Retry` (`.button-l2`) then `Log it anyway` (`.button-l1`). No
  em-dashes, never "PM5".
- Per-file coverage (RF2); `pnpm e2e` before done (RF1); mutations per
  RF21/RF22, including one ABOVE the seam (#228's lesson, now in RF21).
- The vitest footguns (CLAUDE.md): full run is
  `pnpm test --project unit --project client`; never
  `pnpm exec vitest run --project client <file>`.

---

### Task 1: Gate leg A — denied from the first write, red

**Files:**
- Modify: `app/src/monitor/summaryHoldReplay.test.ts`
- Read first: the existing harness end to end; spec §6 leg A; the delta
  pass's probe description in the spec's evidence base (denied from
  first write, RESTORED before the burst is the probe's shape — the LEG
  keeps the stub throwing throughout).

**Interfaces:**
- Produces: a `stubStorageWrites(when: "from-open" | "from-release")`
  helper Task 2 reuses; leg A's describe block.

- [ ] **Step 1:** Build the stub: `localStorage.setItem` throws a
  `QuotaExceededError`-shaped error for the monitor-run key from session
  open onward (leave the ring/diagnostic keys writable — the receipts
  must still record; spec §5 relies on the ring's sessionStorage stash
  fallback anyway, but do not stub what you do not need to).
- [ ] **Step 2:** Leg A over leg 1's recording (Menu terminate), stub
  from open. Assertions in sequence: (1) the burst append DECLINES
  (`summary-append-rejected` receipt present) AND `runRef`'s run gains
  the machine numbers anyway — assert via the new
  `summary-folded-in-memory` receipt and the released run's
  `summaryTotals` (RED until Task 3); (2) the hand-off enters held-error:
  `handoffHeld` stays true, `holdError === "storage-failed"`,
  `hold-error-entered` receipt (RED until Task 3); (3)
  `retryHandoffSave()` with the stub still throwing records
  `hold-error-retry` and stays held (RED until Task 3); (4)
  `proceedHandoff()` releases, and a fresh `LogSession` mount serves the
  SLOT-carried run — the POST carries `machineWorkSeconds` /
  `machineWorkMeters` / verification bytes with storage still empty
  (assert `loadMonitorRun() === null` at mount time) (RED until Task 5).
- [ ] **Step 3:** Run; record the exact red output; commit.

### Task 2: Gate leg B + the no-hold arm, red

**Files:**
- Modify: `app/src/monitor/summaryHoldReplay.test.ts`

**Interfaces:**
- Consumes: Task 1's `stubStorageWrites`.

- [ ] **Step 1:** Leg B over leg 1's recording, stub `from-release`
  (earlier writes green). Assertions: held-error entered after the burst
  was appended TO STORAGE normally; un-stub then `retryHandoffSave()`
  heals — releases, POST carries machine columns from storage (RED until
  Task 3); the honest reload assertion: with the slot unconsumed
  discarded (simulate reload by clearing the slot), `monitorModeRun`
  serves the STORED complete record — no `no-run` miss (this assertion
  is about CURRENT behavior and may be green early; state which).
- [ ] **Step 2:** The no-hold arm: replay `end-on-interval-1` but drive
  `endSession` with the link forced gone (set up the `frameSilence`/
  `disconnected` state the recording allows, or drive the hook's
  `endSession` after injecting a disconnect) so the close is
  `endedBy: "link-lost"` — no burst hold opens — with leg B's stub.
  Assert the `ended` patch itself carries `handoffHeld: true` +
  `holdError` (the §1.2(b) branch; RED until Task 3). If the recording
  cannot produce a link-lost End cleanly, say so in the report and build
  this as a unit test against the hook with injected deps instead —
  documenting the substitution (RF10).
- [ ] **Step 3:** Run; record reds; commit.

### Task 3: The verify, the fold, the held-error state, the slot — legs' hook halves green

**Files:**
- Modify: `app/src/monitor/monitorRun.ts` (SaveVerdict + four-exit
  mapping + doc-comment rewrite; slot trio + supersede receipt hook),
  `app/src/monitor/useMonitorSession.ts` (verify at both §1.2 branches,
  holdError state + methods, the fold, stash-on-teardown-escape,
  post-unmount stash, without-series stash, receipts).
- Test: legs A (1)–(3), leg B, no-hold arm go green; Task 1's (4) stays
  red (reader not yet slot-aware). Existing suites stay green — list any
  expectation updates old→new (there should be few: #228's tests fire
  timers to release; a green verify releases identically).

**Interfaces:**
- Produces: everything in Global Constraints' names; `MonitorSession`
  gains `holdError`, `retryHandoffSave`, `proceedHandoff`.

- [ ] **Step 1:** `SaveVerdict` + mapping + comment rewrite. Unit tests
  for all four exits (drive with a throwing/size-limited localStorage
  stub).
- [ ] **Step 2:** The slot trio with consume-once, supersede-with-receipt,
  and clear; unit tests (consume-once, supersede, clear).
- [ ] **Step 3:** The verify at the release funnel (inside the
  both-refs-null guard so it cannot run twice) and at the no-hold `ended`
  patches; the four-verdict branch (`saved` release; `saved-without-series`
  release + stash + receipt; `failed` → holdError patch). Skip when
  `runRef.current === null`.
- [ ] **Step 4:** The fold: in the `summary-observations` handler, when
  `appendSummaryObservations` returns null AND `loadMonitorRun()` is
  null (the empty-storage decline specifically), fold
  totals/detail/verificationBytes onto `runRef.current` at-most-once with
  `summary-folded-in-memory`; writer-gate declines keep declining.
- [ ] **Step 5:** `retryHandoffSave` / `proceedHandoff` + receipts;
  teardown-escape stash (teardown sees `holdError` set → stash +
  `handoff-stashed reason=teardown-escape` before its normal work);
  post-unmount linger release stashes instead of rendering.
- [ ] **Step 6:** Full unit+client run (both summary lines); legs' hook
  halves green; commit.

### Task 4: The held-error frame — Gate 0's exact strings

**Files:**
- Modify: `app/src/workout/ConnectedSurface.tsx` (held-error branch on
  the ended frame), `app/src/workout/ConnectedSurface.test.tsx`,
  `app/src/workout/ConnectedSurface.screens.test.tsx` (NEW fixture
  snapshot `connected-ended-error.html`), `app/e2e/screenshots.spec.ts`
  (add `connected-ended-error` to the connected-states loop),
  `app/src/index.css` ONLY if `.connected-keep-on` needs a
  surface-context tweak (it should not — say so either way).

**Interfaces:**
- Consumes: Task 3's `holdError`, `retryHandoffSave`, `proceedHandoff`.

- [ ] **Step 1:** Failing component tests: held-error renders the strip
  text + both buttons in order, wired to the two methods; every
  non-error state renders exactly as before (pin all three body-line
  branches + the plain held state).
- [ ] **Step 2:** Implement the branch — strings verbatim from spec §4,
  `.connected-keep-on` / `.button-l2` / `.button-l1`, document order
  Retry → Log it anyway.
- [ ] **Step 3:** New fixture snapshot + screenshots-loop entry; run
  `pnpm screenshots`; open `connected-ended-error{,-landscape}.png` and
  LOOK (RF7) — they must match the Gate 0 renders; commit only the two
  new PNGs + fixture (revert unrelated date-drift churn, the #228
  precedent).
- [ ] **Step 4:** `pnpm e2e`; commit.

### Task 5: The reader — slot first, after the guard

**Files:**
- Modify: `app/src/session/LogSession.tsx` (`monitorModeRun` slot
  consult AFTER the `from=monitor` guard at ~:327; discard path clears
  the slot; save-success clears it beside `clearMonitorRun`),
  `app/src/session/LogSession.test.tsx`.

**Interfaces:**
- Consumes: the slot trio.

- [ ] **Step 1:** Failing tests: slot-carried run renders through the
  monitor door and POSTs its machine fields; an ordinary manual visit
  (no `from=monitor`) does NOT consume the slot; discard clears it;
  save-success clears it; StrictMode's double-initializer is covered by
  an assertion that the committed render used the slot value (the
  dev-only spurious miss is a comment, not a test).
- [ ] **Step 2:** Implement; leg A assertion (4) goes green — the whole
  suite now green.
- [ ] **Step 3:** Full run + commit.

### Task 6: Mutations, coverage, gates, ROADMAP — close out

- [ ] **Step 1:** The five named mutations (spec §6), one at a time, RF22:
  (a) release ignores the verdict → legs A/B fail; (b) remove the fold →
  leg A machine-columns fails; (c) ABOVE the seam: parent forges
  `holdError: null` into the surface → component/e2e gate fails;
  (d) break slot consume-once → unit fails; (e) held-error copy pinned
  with literals (mutate the string constant → the pin fails). Report
  each: what, failure text, revert.
- [ ] **Step 2:** Per-file coverage for every touched file (RF2); cover
  naked branches.
- [ ] **Step 3:** Full gates: lint, format:check, typecheck, `pnpm test`,
  `pnpm e2e` (screenshots ran in Task 4 — say so, don't re-run by
  reflex).
- [ ] **Step 4:** ROADMAP: mark the AUD-016 item implemented-and-gated
  (not merged); reconcile DEVIATIONS if any row touches the ended frame
  (Task 4 added a state — check). Commit.

## Self-review (run, findings folded in)

- Spec coverage: §1.1→T3S1; §1.2→T3S3 (+T1/T2 red); §1.3→T3S3; §1.4
  (fold)→T3S4 (+T1 red); §1.5→T3S5+T4; §1.6→T3S5; §2→T2S2; §3→T5 (+T2's
  honest-reload assertion); §4→T4; §5→T3 receipts asserted across T1-T5;
  §6→T1/T2/T6.
- No placeholders; names consistent (SaveVerdict, holdError, slot trio,
  receipt kinds identical across tasks).
- The PM final gate, prod-recount interaction, and release call are
  PR-time controller work.
