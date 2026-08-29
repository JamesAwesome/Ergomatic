# Machine-Summary Hold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold the ended hand-off until the PM5's summary burst is written,
so a saved connected row carries the erg's own numbers (tier A) instead of
our arithmetic — 0 of 16 production rows do today.

**Architecture:** Extend the existing `handoffHeld` gate from one owed
condition (the final split) to two (split + burst), opened at all THREE
burst-eligible `ended` transitions (machine finish, Menu terminate, user
End), resolved on the burst's write attempt or a corpus-derived backstop.
The reader (`LogSession`) does not change; the write now lands before the
mount. Receipts instrument the one uninstrumented link.

**Tech Stack:** React hook state machine (`useMonitorSession.ts`), the
`transports/replay.ts` barrier engine for the gate suite, Vitest jsdom.

**Spec:** `docs/superpowers/specs/2026-08-29-machine-summary-hold-design.md`
— revised through the full antagonist pass (2026-08-29) and Gate 0
approved by James the same day. The plan argues from the spec; read it
first, especially §2 (the three arms and the true burst-first mechanism),
§3 (exit owners), §6 (the gate's three legs and the two-clocks trap).

## Global Constraints

- SDLC: work in the worktree `Ergomatic-wt-summary-hold` (branch
  `wave-f-summary-hold-spec`), `git rev-parse --show-toplevel` before every
  commit, no merge without James.
- TDD: the gate legs are written failing first (Tasks 1–2 precede Task 3).
- `BURST_HANDOFF_HOLD_MS = 2000`, its own constant, NOT shared with
  `BURST_LINGER_MS` (spec §2's coupling argument); its comment carries the
  corpus derivation verbatim from the spec (271–542 ms n=10 on the machine
  arms; +558.6 ms n=1 from the flip on the End arm; native unmeasured).
- The write-resolution is the append RETURN (attempt), never durability —
  spec §3 exit 3b is AUD-016's seam; do not add a durable-write signal here.
- `LogSession.tsx:1487`'s mount snapshot stays. The teardown linger stays.
- The ONLY UI change is spec §4's two approved copy lines on the ended
  frame (Gate 0, 2026-08-29): headline `Wrapping up` (all ended states),
  and body line `Getting the monitor's own numbers.` while `handoffHeld`.
  Exact strings, no em-dashes, "monitor" never "PM5".
- Every new assertion gets a named mutation (RF21); per-file coverage for
  every touched file (RF2); `pnpm e2e` before done (RF1 — the diff touches
  `app/src/`).
- No release-notes change in this PR: the three corrections ship in the
  NEXT tag's notes entry per RF15 range accounting (spec §7; the PR body
  and ROADMAP keep the owe visible; clock ~2026-09-11).

---

### Task 1: Gate leg 1 — Menu terminate, red

**Files:**
- Create: `app/src/monitor/summaryHoldReplay.test.ts`
- Read first: `app/src/monitor/burstReplay.test.ts` (the whole header and
  harness — this suite follows its idiom one screen further),
  `app/src/session/LogSession.test.tsx` (mount idiom, router/searchParams,
  fetch mocking), spec §6.

**Interfaces:**
- Produces: the file, its `SESSIONS_DIR` path surgery, and a
  `mountLogSessionAndSave()` helper Task 2 and Task 4 reuse in-file.

- [ ] **Step 1: Write the harness.** Copy `burstReplay.test.ts`'s
  composition (`createReplayTransport` + `vi.doMock("../adapters/monitorTransport")`
  + `vi.resetModules()` + dynamic re-import, `now`/`schedule` bound to the
  replay clock) over
  `docs/monitor/sessions/walk-2026-08-25/smoke-terminated-recording.jsonl.gz`.
  Hand-transcribe its `WorkoutProgram` from the walk README + recorded
  programming frames, byte-verified (the `burstReplay.test.ts:100-123`
  discipline). **The one addition (spec §6, antagonist REVISE 6): pass
  `schedule: (cb, ms) => replay.clock.schedule(cb, ms)` into
  `MonitorSessionDeps` too** — without it the hold's backstop runs on real
  time while the wire runs on virtual time.
- [ ] **Step 2: Write leg 1's assertions** (spec §6, in sequence): (1) at
  the `ended` flip (`phase === "ended"`), `handoffHeld` is `true` and still
  `true` immediately after (today's code hardcodes `held = false` on the
  terminated branch — `useMonitorSession.ts:2201`); (2) after the recorded
  burst plays, `handoffHeld` is `false` AND `loadMonitorRun()`'s record
  carries `summaryTotals` whose `distanceMeters`/`elapsedSeconds` equal the
  recording's own decoded 0x0039 pair — assert the release happened
  after/with the write attempt, not before; (3) a fresh `LogSession` mount
  over that storage (jsdom, mocked `fetch`) then Save produces a POST whose
  body carries `machineWorkSeconds`, `machineWorkMeters` and the
  verification bytes, values equal to the replayed burst's decode.
- [ ] **Step 3: Run it; expected RED at assertion (1)** —
  `handoffHeld` is `false` at the terminated flip. Record the exact failure
  text in the task report. Place the file so it runs under the jsdom
  project (check `vitest.config` — `burstReplay.test.ts`'s own project is
  the reference).
- [ ] **Step 4: Commit** the red test with a message saying it is the
  gate's leg 1, red on purpose (reference spec §6). Pre-push hooks run
  unit+client — a deliberately red committed test would block a push, so
  mark it `test.fails` at commit time with a `// RED until Task 3` comment
  IF the hook would otherwise block; Task 3 flips it back.

### Task 2: Gate leg 2 — user End, red

**Files:**
- Modify: `app/src/monitor/summaryHoldReplay.test.ts`
- Read first: spec §6 leg 2; `walk-2026-08-28/README.md` (the 3×1:00/1:00r
  program at line ~12); the recording's seq 13–19 programming tx and seq 75
  terminate tx.

**Interfaces:**
- Consumes: Task 1's harness and `mountLogSessionAndSave()`.

- [ ] **Step 1: Transcribe the program** for
  `walk-2026-08-28/end-on-interval-1-recording.jsonl.gz` (3×1:00 time
  intervals, 1:00 rests) and byte-verify against the recorded programming
  frames. The antagonist did NOT verify this transcription — if the bytes
  disagree with the README, the bytes win and the report says so (RF10).
- [ ] **Step 2: Drive the End press.** Seq 75's terminate tx is a replay
  BARRIER: schedule `void result.current.end()` on the replay clock just
  before the barrier's timestamp (~t=15155) so the hook's own
  `driver.terminate()` write meets the recorded, byte-identical frame and
  the recorded ack settles it (spec §6 leg 2).
- [ ] **Step 3: Same three assertions as leg 1** — at the End-press flip
  `handoffHeld` is `true` (today `endSession` opens nothing); burst write
  then release; LogSession mount + POST carries the machine values from
  THIS recording's burst.
- [ ] **Step 4: Run; expected RED at assertion (1). Commit** (same
  red-on-purpose convention as Task 1).

### Task 3: The two-condition hold, three arms, receipts — legs 1–2 green

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` — the constant block
  (`FINISH_HANDOFF_HOLD_MS`/`BURST_LINGER_MS` neighborhood, ~:700-770),
  `releaseHandoff`/`openHandoffHold` (~:1779-1838), `endByMachine`'s patch
  (~:2194-2207), the `final-boundary` release (~:2307), the
  `summary-observations` handler (~:2361-2403), `endSession` (~:3192-3239).
- Test: Task 1–2's legs go green; existing suites stay green.

**Interfaces:**
- Produces: exported `BURST_HANDOFF_HOLD_MS = 2000`; ring entry kinds
  `summary-recorded` / `summary-append-rejected` / `summary-no-run`;
  `handoff-released` reasons widened to
  `"final-boundary" | "burst-heard" | "burst-timeout" | "backstop" | "teardown"`.
  Task 5's unit tests name all of these.

- [ ] **Step 1: The conditions model** (spec §2). Split the single
  `handoffHoldRef` into two owed-condition slots (split, burst), each with
  its own cancel; a shared resolve helper cancels one condition and
  performs the release (one `handoffHeld: false` update + one
  `handoff-released` ring entry naming the resolving reason) only when no
  condition remains owed. `releaseHandoff("teardown")` still releases
  everything unconditionally and stays idempotent.
- [ ] **Step 2: The burst condition.** Owed when
  `run.completedAt !== null && (run.endedBy === "finished" || run.endedBy === "rower") && run.summaryTotals === undefined`
  (keep the `summaryTotals` clause as documented defence-in-depth — spec
  §2's "true mechanism" paragraph is the comment's content). Backstop
  `BURST_HANDOFF_HOLD_MS = 2000` via `depsRef.current.schedule`, resolving
  `"burst-timeout"`. Its doc comment carries the spec's corpus derivation
  including the End-arm anchor correction.
- [ ] **Step 3: The three arms.** `endByMachine`: both branches may owe the
  burst — `terminated` owes burst only, natural finish owes split
  (existing `openHandoffHold()`) AND burst; make sure BOTH openers run
  (no short-circuit) and `handoffHeld` is their OR, still in the same
  single `update` patch. `endSession`: open the burst hold in its `ended`
  patch (link-lost closes are not burst-eligible and open nothing —
  the predicate already excludes them).
- [ ] **Step 4: Resolutions.** The `final-boundary` release site becomes
  "resolve the split condition". The `summary-observations` handler, after
  its existing append: record the receipt (`summary-recorded` with run
  identity + totals when `appended !== null`; `summary-append-rejected`
  when `null`; `summary-no-run` when `run === null`) and resolve the burst
  condition (`"burst-heard"` / `"append-rejected"` → both release-paths;
  the no-run case resolves nothing — spec §3's fourth path). The existing
  `lingerFinishRef.current?.()` call stays exactly where it is.
- [ ] **Step 5: Run legs 1–2 (green), then the full unit+client suites**
  — `pnpm test --project unit --project client`, and grep BOTH summary
  lines (Test Files + Tests). Existing hold/ended tests that assumed
  user-End navigates immediately will need their expectations updated —
  update them to the spec's behavior, and list each in the report.
- [ ] **Step 6: Commit.**

### Task 4: Gate leg 3 — timeout

**Files:**
- Modify: `app/src/monitor/summaryHoldReplay.test.ts`

**Interfaces:**
- Consumes: Task 1's harness; Task 3's `BURST_HANDOFF_HOLD_MS` and
  `"burst-timeout"` reason.

- [ ] **Step 1: The surgery** (spec §6 leg 3): on leg 1's recording,
  extend the `stripBurst` idiom (`burstReplay.test.ts:177-186`) to strip
  the burst events AND append one synthetic trailing rx event at terminal
  +2500 ms — the virtual clock only advances at recorded events
  (`replay.ts:270`), so this is what carries it past the backstop.
- [ ] **Step 2: Assert:** hold releases at `BURST_HANDOFF_HOLD_MS` with
  ring reason `burst-timeout`; the save POST carries NO machine columns;
  the record's `summaryTotals` stays `undefined`.
- [ ] **Step 3: Prove the leg can fail:** temporarily set the trailing
  event to terminal +1500 ms — the backstop must never fire and the leg
  must FAIL (this is the spec's fifth named mutation, run here where the
  surgery is fresh). Restore +2500. Commit the real change BEFORE this
  probe (RF22).
- [ ] **Step 4: Run leg 3 green. Commit.**

### Task 5: Unit-test extensions and e2e reconciliation

**Files:**
- Modify: `app/src/monitor/useMonitorSession.test.ts`,
  `app/e2e/connected.spec.ts` (the ended hand-off comment/assertions at
  ~:150 and ~:696-712), and `app/src/workout/ConnectedSurface`'s test if
  its deferral expectations encode "user End navigates immediately".
- Read first: spec §2/§5; `transports/fake.ts`'s scripted terminate burst
  (~:1559, storage-spine §2) — the e2e fake DOES deliver a burst on
  terminate, so e2e End flows release on `burst-heard`, not the backstop.

- [ ] **Step 1: Unit tests, one per new behavior**, driving the hook with
  injected `schedule`: Menu terminate opens the hold and releases on
  burst-heard; user End opens the hold; a natural finish with the split
  already in hand still owes the burst; timeout releases at 2000 with
  `burst-timeout`; append-rejected releases with its receipt;
  `summary-no-run` records without touching a hold; link-lost End opens
  nothing. Assert consequences (release reason in the ring, `handoffHeld`
  transitions), not existence (RF4).
- [ ] **Step 2: The two approved copy lines (spec §4, exact strings).** In
  `ConnectedSurface.tsx`'s ended branch (~:434-445): the serif line becomes
  `Wrapping up` unconditionally; the body line renders
  `Getting the monitor's own numbers.` when `session.handoffHeld`, else the
  existing three-way ternary unchanged. Failing component test first
  (held → new line; not held → each existing branch still renders); update
  the existing expectations at `ConnectedSurface.test.tsx:2040-2122` for
  the headline.
- [ ] **Step 3: Regenerate the fixture snapshot and captures.**
  `ConnectedSurface.screens.test.tsx`'s `toMatchFileSnapshot` regenerates
  `e2e/fixtures/connected-ended.html` (run via `pnpm test --project client`
  with snapshot update — NEVER `pnpm exec vitest run --project client
  <file>`, the CLAUDE.md jsdom footgun). Then `pnpm screenshots` so the
  committed `connected-ended{,-landscape}.png` show the approved copy —
  open both PNGs and look (RF7).
- [ ] **Step 4: Reconcile `connected.spec.ts`** — the "one-render flash"
  comment and any timing-coupled assertion now describe the hold
  (navigation follows the fake's terminate burst), and any assertion on
  the ended frame's text uses the approved strings. Run `pnpm e2e` in the
  worktree; every spec green.
- [ ] **Step 5: Commit.**

### Task 6: Mutations, coverage, gates, ROADMAP — close out

**Files:**
- Modify: `ROADMAP.md` (the Wave F machine-summary item: mark the fix's
  state, point to the spec and gate suite; the note-corrections owe stays
  open with its clock), `docs/design/DEVIATIONS.md` only if it mentions
  the ended hand-off (check; reconcile if so — RF9).
- Delete: `app/e2e/gate0-hold.spec.ts` (untracked Gate 0 throwaway).

- [ ] **Step 1: Run the four remaining named mutations (RF21), one at a
  time, committing the real change first (RF22), reporting what was
  mutated and what failed:** (a) reorder the burst resolve before the
  append call — leg assertions (2) must fail; (b) restore `held = false`
  on the terminated branch — leg 1 (1) must fail; (c) remove `endSession`'s
  hold opening — leg 2 (1) must fail; (d) drop `machineWorkSeconds` from
  the POST body construction it asserts on — assertion (3) must fail.
  (The fifth, leg 3's +1500 ms clock probe, ran in Task 4.)
- [ ] **Step 2: Per-file coverage** (`pnpm test:coverage`) for
  `useMonitorSession.ts` and the new suite — read the per-file lines, not
  the aggregate (RF2). Cover any new branch the report shows naked.
- [ ] **Step 3: Full gates in the worktree:** `pnpm lint`, `pnpm format:check`,
  `pnpm typecheck`, `pnpm test`, `pnpm e2e`. `pnpm screenshots` is NOT
  needed (no layout change) — say so in the report rather than running it
  by reflex.
- [ ] **Step 4: ROADMAP + DEVIATIONS reconciliation, delete the throwaway
  spec, commit.**

## Self-review (run, findings folded in)

- Spec coverage: §2 → Task 3; §3 → Task 3 step 4 (exits 1/2/3a; 3b stays
  AUD-016's, constraint block); §4 → Gate 0 already approved, no UI task
  by design; §5 → Task 3 step 4 + Task 5 step 1; §6 → Tasks 1/2/4 +
  mutations split across Task 4/6; §7 → constraint block (notes deferred
  to tag) + Task 6 ROADMAP; §8 → constraints.
- The 0-of-16 prod re-count and PM final gate are PR-time controller
  work, not implementation tasks — they happen at PR presentation.
