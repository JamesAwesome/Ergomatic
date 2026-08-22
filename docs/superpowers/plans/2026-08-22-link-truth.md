# Link Truth Implementation Plan (Phase LL)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app observes its Bluetooth link instead of believing in it — a lost link says so on screen within a bounded time, Try Again works without deleting the app, and a lost-link ending is distinguishable from a rower's End in the stored row.

**Architecture:** A production-safe liveness decorator at the transport seam on both arms (injected clock; the byte recorder stays a separate build-time-gated decorator); frame silence routed as one new `AxesInput` through the existing `stale`/`LostBanner` derivation; recovery rebuilt as "failure disposes" keyed on the field the retry actually branches on; the existing `endedBy` union widened and mirrored to the server row.

**Tech Stack:** Existing only (buy-nothing ruling).

## Global Constraints

- VALUE AUTHORITY: `docs/superpowers/specs/2026-08-22-link-truth-design.md`. THE SPEC GOVERNS — report a mismatch rather than working around it. Its §8 exclusions are binding: NO reconnect, NO "reconnecting" UI state, NO background-mode work, NO finish hold (§5 moved to Phase RC).
- **TRIAD** (stored shape: the widened `endedBy` on the server row; plus when live numbers visibly freeze). Antagonist pass on the spec: DONE, 2026-08-22, folded — its vetted ground is in `antagonist-ledger.md` and its measured tables govern the constants. PM final-PR gate owed on the PR.
- **The watchdog ARMS at the first valid 0x0031 after connect, never earlier.** Measured: every committed capture is silent 3775–4454 ms between subscribe and the first status frame; armed earlier, 6 of 6 healthy captures go red. Threshold 2500 ms; the constant's comment carries the MEASURED numbers (worst in-stream gap 810.3 ms over 3,442 gaps ⇒ 3.09× margin) and must NOT cite the "native ~100 ms cadence", which is an unhonoured request (`useMonitorSession.ts:537-539`).
- **The liveness decorator takes an injected `now`/`schedule`.** The replay harness's virtual clock is the driver's, the fake is tick-driven, and `replay.ts`'s barrier timeout is a real `setTimeout` — a wall-clock watchdog in the decorator is unprovable by either harness, and `vi.useFakeTimers()` over a replay hangs the barrier. Bind `ReplayHandle.clock` to the decorator in replay tests.
- **Tests assert the COMPOSITION** (`adapters/monitorTransport.ts`), not just the decorator — injecting `MonitorSessionDeps.createTransport` bypasses the seam.
- **`app/e2e/` is NOT typechecked** — no step may claim the compiler catches anything there. **pnpm eats scoped-run flags in both suites**: use `pnpm exec playwright test --grep` / `pnpm exec vitest run`, and CHECK THE RUN COUNT — a full-suite count means the filter was eaten. **All gates FOREGROUND** (blocking, 590000ms) — a subagent's background waits die when it idles.
- Failing test first; self-mutation on every behavioural test, byte-identical restore; per-file coverage; `pnpm e2e` + `pnpm screenshots` foreground for anything rendering. `git rev-parse --show-toplevel` before every commit. Read both vitest summary lines.
- Migration index: next free under `app/drizzle/` (0012 at plan time — RE-CHECK at implementation; parallel sessions land migrations).

---

### Task 1: The liveness decorator, the ring's growth, and the bypass fixes (§1)

**Files:**
- Create: `app/src/monitor/transports/liveness.ts` (+test)
- Modify: `app/src/adapters/monitorTransport.ts` (compose it on BOTH arms)
- Modify: `app/src/monitor/driver.ts` (0x0039/0x003A ring bypass; 0x003A bytes param)
- Modify: `app/src/monitor/useMonitorSession.ts` (ring: timestamps + liveness numbers; failure-screen retrieval)
- Modify: the failure screen component (ring door — locate via the `LINK-FAILED` render path)
- Test: unit + a replay test binding `ReplayHandle.clock` to the decorator

**Interfaces:**
- Produces: `withLiveness(transport: Transport, deps: { now(): number; schedule(fn, ms): CancelFn; onSilence(ms: number): void; onRecovery(): void }): Transport` — wraps subscribe/write/disconnect, records per-characteristic last-arrival timestamps and counters, NO payload bytes. Arms its silence timer at the FIRST 0x0031 only. Exposes `snapshot(): LivenessSnapshot` for the ring.
- Produces: ring entries gain `atMs` (monotonic, from the injected now); the ring is readable from the failure screen.
- The recorder decorator is UNTOUCHED and stays behind its build-time constant.

- [ ] Failing test: a replayed capture with the decorator composed and `ReplayHandle.clock` bound — assert `onSilence` never fires across ANY committed capture (the arming rule makes this pass; arming at subscribe must make it fail — write that as the mutation).
- [ ] Failing test: suppress the stream mid-capture (drop frames after time T in the replay) — `onSilence` fires at T+2500 ms virtual, and `onRecovery` fires on the next delivered frame.
- [ ] Implement; compose on both arms in `adapters/monitorTransport.ts`.
- [ ] Ring: timestamps on every entry; liveness snapshot appended on failure; retrievable from the failure screen (the walk lost F-1's evidence because the ring's only door was downstream of the failure — this is exit criterion 7 and it is proven on the FAILURE path).
- [ ] 0x0039/0x003A route through the ring; 0x003A's callback gains its bytes parameter.
- [ ] Criterion 8: `pnpm build` + string grep over `dist/` in BOTH directions proving the recorder's module graph is absent from production. Prove the probe can go red (grep for a string you know IS in the bundle).
- [ ] Self-mutations; full gates; commit.

### Task 2: Detection — the four mechanisms and the banner's honest lifecycle (§2, §2a)

**Files:**
- Modify: `app/src/monitor/transports/capacitorBle.ts` (enabled-notifications subscribe; per-characteristic criticality on subscribe rejection; attribute drops by device+attempt not global boolean)
- Modify: `app/src/monitor/useMonitorSession.ts` / `app/src/workout/connected/connectedAxes.ts` / `surfaceModel.ts` (the `frameSilence` AxesInput → existing `stale` status; hysteresis)
- Modify: app-lifecycle listener registration (adapter layer ONLY — `src/adapters/` or `src/native/`; platform conditionals are lint-enforced to the adapter layer)
- Modify: `app/src/monitor/transports/fake.ts` (suppressible stream; per-characteristic subscribe failure; enabled-state events)
- Modify: `domain/monitor/types.ts:429-433` (the false backgrounding claim in `onDisconnect`'s doc comment — comment fix, same PR)
- Modify: `docs/design/DEVIATIONS.md` row 75 (the banner may retract, with hysteresis — reconcile, do not contradict)
- Test: unit + client + e2e witnesses

**Interfaces:**
- Consumes Task 1's `withLiveness` callbacks.
- Produces: `AxesInput.frameSilence: boolean`; `deriveLink` maps it to the EXISTING `stale`; the banner latches and retracts only after **10 s of continuous healthy frames** (constant's comment: ≈18 frames at the measured ~540 ms median cadence).
- Produces in the fake: `setEnabled(false/true)` events, `failSubscribe(characteristic)`, `suppressFrames(fromTick, toTick)` — each specified against OBSERVED wire behaviour only (the Rest Time lesson: a fake that cannot produce the failure cannot prove the detector).

- [ ] Failing tests, one per mechanism: (1) enabled-off → banner within its bound; (2) lifecycle background/resume → stream treated suspect until §4's continuity rule passes it; (3) CSAFE-characteristic subscribe rejection stays FATAL (the hang guard survives — pin it) while a STATUS-characteristic rejection degrades without ending the session, the recorder is told, and the ring names the dead characteristic; (4) a genuine drop inside the caller-initiated window is attributed correctly.
- [ ] Failing test: the banner cannot blink — silence → banner → one healthy frame → banner STAYS → 10 s continuous → retracts. Mutation: drop the hysteresis, test reds.
- [ ] Implement, including the DEVIATIONS row 75 reconciliation and the `types.ts` comment fix.
- [ ] Self-mutations; `pnpm e2e` + `pnpm screenshots` foreground (the banner renders); open the captures; commit.

### Task 3: Recovery — failure disposes, and the already-connected guard (§3)

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` (disposal on failed connect/program: transport down, driver ref null, **`deviceName` cleared** — the field the retry branches on)
- Modify: `app/src/workout/ConnectedInterstitial.tsx` (Try Again path)
- Modify: `app/src/monitor/transports/capacitorBle.ts` (`getConnectedDevices([ROWING_SERVICE_UUID, CONTROL_SERVICE_UUID])` guard before scan; `initialize()` memo hoisted to module scope)
- Test: unit + client; e2e witness for the Try Again flow

**Interfaces:**
- Consumes: nothing new. Produces: no new exported surface expected — if one becomes necessary, that is a finding for the report, not a silent addition (the EST LEFT plan got this wrong; do not repeat its mistake in either direction).

- [ ] Failing test reproducing the LINK-FAILED precondition against today's code: fail `program()`, assert the driver ref survives and `deviceName` survives (today's bug); after the fix, assert BOTH are cleared and the transport is down before the failure screen renders (exit criterion 2).
- [ ] Failing test: Try Again after an induced failure reaches a fresh scan/connect/program — asserted structurally: no path from the failure state to `program()` without passing transport construction (exit criterion 3).
- [ ] The guard: both outcomes tested — device returned → offered, no second connect against a held machine; nothing returned → degrade to today's flow, ring says so (exit criterion 4). The modal-sheet hazard note (`capacitorBle.ts:305-316`) binds: no BleClient call between `ScanTimeoutError` and sheet dismissal — do not touch that ordering.
- [ ] The memo hoist (one line) with its stated caveat kept in the comment: it does not survive `webView.reload()` and does not claim to explain the force-quit brick.
- [ ] Self-mutations; full gates; commit.

### Task 4: The honest close — `endedBy` widened, mirrored, and the continuity rule (§4)

**Files:**
- Modify: `app/src/monitor/monitorRun.ts` (the union widens: `"finished" | "rower" | "link-lost" | "program-failed" | "interrupted"`; each writer sets its value per the spec's table)
- Modify: `app/src/monitor/useMonitorSession.ts` (writers: `linkGone` is computed one line above the close — use it)
- Create: `app/src/monitor/continuity.ts` (+test — RowTracer's SHAPE, our constants: keyed on `totalWorkDistanceMeters` going backward or stroke count dropping; thresholds DERIVED from the corpus in this task and validated like the watchdog — no healthy capture's own resumes may trip it)
- Modify: `app/server/db/schema.ts` + migration (additive-optional `ended_by` on the log row), `app/server/routes/data.ts` (validate: known values or absent; reject unknown), `app/server/stores/logs.ts`
- Modify: `app/src/session/LogSession.tsx` (thread it into the POST)
- Test: unit + integration round-trip + the resume simulation

**Interfaces:**
- Consumes Task 2's suspect-stream signal (a resumed stream passes through `continuity.check(before, after)` before folding into the register map).
- Produces: `endedBy` on `MonitorRun` and the server row; `continuity.check` returning `continuation | reset`, with `reset` preserving the interrupted record and starting clean — NEVER merging.

- [ ] Failing tests per writer, from the spec's table — including the previously unmapped program-failure path, and legacy `"interrupted"` rows reading back unchanged.
- [ ] Integration: round-trips POST→GET; rejects unknown values; link-lost distinguishable from rower's End in the stored row (exit criterion 5).
- [ ] The continuity constants: derive from the corpus (the anchor pass's simulation script shape — slide a 30 s gap across every frame of every capture), pin the derived thresholds with the zero-false-positive validation, and pin one TRUE reset built from a real capture's frames (exit criterion 6).
- [ ] Self-mutations; full gates; commit.

### Task 5: Walk card, ROADMAP, DEVIATIONS reconciliation, notes clause (§7 criteria 9/9a/10)

**Files:** `ROADMAP.md` (walk items W5/W6/W7 + the native gap-distribution deliverable 9a; tick what this plan closes), `docs/design/DEVIATIONS.md` (any rows the implementation touched), release-notes clause queued for the next tag.

- [ ] W5 (power-cycle armed, not rowing), W6 (background 30 s mid-piece), W7 (PM5 menu navigation mid-session — a possible legitimate quiet period) on the walk card with their questions stated.
- [ ] 9a: the native inter-frame gap distribution recorded as a walk deliverable — the liveness decorator's first output on a real phone.
- [ ] The notes clause: a lost link now says so, and a lost-link ending is recorded as such.
- [ ] Commit. (Docs only — say the e2e skip aloud.)

---

## Self-review

- **Spec coverage:** §1→T1; §2/§2a→T2; §3→T3; §4→T4; §5 is CUT (moved to RC — no task, correct); §6's harness rules→Global Constraints + T1's clock binding; §7: 1→T1/T2, 2→T3, 3→T3, 4→T3, 5→T4, 6→T4, 7→T1, 8→T1, 9/9a→T5, 10→T5.
- **Placeholders:** none. Two locations left deliberately symbolic — "the failure screen component" (T1) and the lifecycle listener's exact adapter file (T2) — each with the search that finds it, because naming a wrong file verbatim is how the EST LEFT plan shipped a wrong claim.
- **Type consistency:** `withLiveness` (T1) is what T2's callbacks consume; `AxesInput.frameSilence` (T2) is the one new axes field; `endedBy`'s union is written identically in T4 and the spec's §4; `continuity.check` (T4) is the only new module-level API.
