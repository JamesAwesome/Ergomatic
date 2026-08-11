# Fast-Follow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dropped final split can no longer cost data, no connect path can hang, and starting a workout has one nudge model and one visual hierarchy.

**Architecture:** R1 adds a narrow summary-fallback gate beside (never inside) the split path's vouched channel; R2-web mirrors the iOS native connect bound; the UI work deletes ConfirmTargets and rewires its five entry points onto the countdown directly, with the card as the only nudge surface and Connect as the single primary.

**Tech Stack:** existing.

**Spec:** `docs/superpowers/specs/2026-08-11-fast-follow-design.md` (adversarially revised; its § numbers govern — every task brief below cites its §). Adversarial review: `...-fast-follow-adversarial-review.md` (B1-B3/I1-I10 are folded into the spec text; the review carries the evidence lines).

## Global Constraints

- Worktree `.claude/worktrees/fast-follow`, branch `fast-follow` (main `ea3dec6` + spec commits). Node 26 PATH before everything; `pnpm test` only from `app/` (`-t` name filters; NEVER bare vitest with file args); per-worktree stack for browser gates; never run e2e/screenshots concurrently with unit or each other.
- Baseline MEASURED at plan time: **156 unit files / 3629 passed + 1 skipped**; e2e 273; screenshots 60 (post-#83 `today-rolled` joined). Additions only, except the §7-sanctioned retirements (ConfirmTargets suites, confirm.png, the confirm describe).
- Split precedence VERBATIM (spec §5): split immediate and authoritative inside the grace window; summary fills ONLY at grace expiry; one final boundary per run across both sources.
- `FINISH_GRACE_MS` stays 3000; `FINISH_HANDOFF_HOLD_MS` rises to **3500**; both coupled-constant comments update with the now-strict inequality and its reason.
- Copy: `Start Timer` exact; no em-dash user-facing. Token `--action-connect: #2a6275` + hover step; class `.button-connect`; the "accent means exactly four things" comments amended, never deleted.
- `startedAt` stamps at every rewired entry (`saveDraft(startDraft(buildNudgedDraft(...)))`); CANCEL clears draft AND run.
- Interface-notes layout BEFORE parser offsets (spec §5, I6): no 0x0039/0x003A byte offset appears in code before the notes carry the layout with its C2-spec citation.
- NO merge without James's explicit word; the erg confirmation row is the phase exit.

---

### Task 1: The summary pair — layout, parsers, subscriptions (spec §5 first half)

**Files:**
- Modify: `docs/monitor/pm5-interface-notes.md` (the 0x0039/0x003A layout §, from the official C2 BLE spec with section citation — FIRST commit of the task), `app/domain/monitor/pm5/uuids.ts` (+`END_OF_WORKOUT_SUMMARY_UUID` 0x0039, `END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID` 0x003A), both `SERVICE_OF` maps (`capacitorBle.ts:55`, `webBluetooth.ts:95`), the driver's construction-time subscription list (grep its status-loop; add both chars)
- Create: the summary parser beside the split parsers in `app/domain/monitor/pm5/` — `parseEndOfWorkoutSummary(bytes: Uint8Array): WorkoutSummary | null` returning `{ totalElapsedSeconds: number; totalMeters: number }` plus whatever avg fields the committed layout names (null on length mismatch, the split parsers' idiom)
- Test: parser fixtures hand-built FROM the committed layout doc (cite the notes § in the test header); SERVICE_OF membership pinned on BOTH transports; subscription-list pin in `driver.test.ts`

**Interfaces:**
- Produces: the two UUID constants; `parseEndOfWorkoutSummary` + `WorkoutSummary` type; `summary-half` wire-log entries on receipt of either char (driver-side, alongside `split-half`'s site).

- [ ] **Step 1:** interface-notes layout § written and committed alone (`docs: what 0x0039 and 0x003A actually carry`) — the C2 BLE spec section named, every field's offset/width/scale, and which fields ride 0x003A because 0x0039 overflowed.
- [ ] **Step 2:** failing parser tests from the layout (happy path, short-buffer null, scale factors); failing SERVICE_OF/subscription pins.
- [ ] **Step 3:** constants + maps + parser + subscriptions + `summary-half` log entries.
- [ ] **Step 4:** `pnpm test` full, ≥ baseline. Commit — `feat: the driver hears the summary pair`.

### Task 2: The summary-fallback gate (spec §5 second half)

**Files:**
- Modify: `app/src/monitor/driver.ts` (the gate: store the latest parsed summary during a natural-finish grace window; a wall-clock reconcile timer from the natural finish — same injected `now()`/timer discipline the grace already uses — fires at `FINISH_GRACE_MS`: if the final interval is still missing AND a summary arrived in-window, synthesize the boundary), `app/src/monitor/useMonitorSession.ts` (`FINISH_HANDOFF_HOLD_MS` 3000 → 3500 + both coupled comments)
- Test: `driver.test.ts` (the gate's arms), `useMonitorSession.test.ts` (hold timing retarget), a hook-level end-to-end replaying the dropped-split sequence

**Interfaces:**
- Consumes: Task 1's parser and log kinds.
- Produces: nothing new downstream — the synthesized boundary rides the EXISTING `finalBoundary: true` emit (`driver.ts:1930` region), hook release, and `acceptableFinalBoundary`, all unchanged.

- [ ] **Step 1 (failing tests):** (a) split arrives at t+200ms → recorded, summary at expiry does NOT re-fire (consumed-once across sources); (b) split never arrives, summary at t+400ms → at t+3000 the gate synthesizes index = last interval, elapsed/meters = summary totals (single-interval) → `record-actual accepted`, hold releases with 1 measured; (c) multi-interval with ALL priors recorded → subtraction derivation pinned to exact values; (d) multi-interval with a MISSING prior → gate declines, `summary-reconciled: declined` with reason, no write; (e) 0x0039 re-fire at t+60s → `out-of-window` logged, nothing filed; (f) terminate (not natural finish) → gate never arms; (g) avg fields omitted from the synthesized actual (assert absent, not zero).
- [ ] **Step 2:** implement; the reconcile emits `summary-reconciled` verdicts (`split-won` / `filled-from-summary` / `declined` / `out-of-window`).
- [ ] **Step 3:** hold 3500 + coupled comments both sides (the inequality is now STRICT: hold > grace because the fill happens AT expiry and must beat navigation).
- [ ] **Step 4:** full suite ≥ baseline; self-mutants: precedence inversion (summary displaces early split) dies; subtraction-off-by-one dies; the declined arm's guard dies. Commit — `feat: the finish gets a fallback that never lies`.

### Task 3: R2-web — the bounded connect (spec §6)

**Files:**
- Modify: `app/src/monitor/transports/webBluetooth.ts` (`connect()` wraps `gatt.connect()` in a 10_000ms race; on expiry reject `new Error("Connection timeout.")` — the iOS plugin's literal; the late-resolve arm calls `gatt.disconnect()` on the zombie before dropping)
- Test: `webBluetooth.test.ts` (fake timers: timeout rejects with the literal; late resolve → `disconnect()` called on the zombie, pinned; in-time connect unchanged; late reject swallowed)

- [ ] Steps: failing tests → implement → full suite → commit — `fix: the web connect learns the ten second rule`.

### Task 4: ConfirmTargets dies; the entries rewire (spec §3)

**Files:**
- Delete: `app/src/session/ConfirmTargets.tsx`, `app/src/session/ConfirmTargets.test.tsx`
- Modify: `app/src/session/useStartWorkout.ts` (gains `nudges: Record<number, number>` param; destination `/session/countdown`; draft built via `buildNudgedDraft` + `startDraft` stamp), `app/src/workout/WorkoutDetail.tsx` (Start passes live `nudges`; the §3 guard: disabled + caption when `needsBaselines`), `app/src/today/BaselineCard.tsx` (passes `{}`; no guard — spec §3 entry 3), `app/src/session/Countdown.tsx` (CANCEL clears draft AND run then `/library/{workoutId}` with `/today` fallback; no-baselines bounce → `/today`), `app/src/shell/AppRoutes.tsx` (`/session/confirm` → redirect shim: started draft → `/session/run`, live unstarted → `/session/countdown`, none → `/today`) + `AppRoutes.test.tsx`'s tab-bar list, `app/src/session/draft.ts` (`loadDraftWithNotice` folds into `loadDraft` as a silent strip; `cancelStart` removed)
- Test: `useStartWorkout.test.tsx` (nudge threading + startedAt stamped + destination), `Countdown.test.ts` (CANCEL/bounce retargets), shim tests (three arms), `WorkoutDetail.test.tsx` guard tests; the ~25 whole-string `"Start"` pins rename in Task 5 (this task keeps the label `Start` so the diff stays reviewable — order matters)

- [ ] **Step 1 (failing):** `useStartWorkout` called with nudges `{0: 2}` → saved draft's nudges carry it AND `startedAt` non-null AND navigate `/session/countdown`; CANCEL → draft null, run null, location `/library/w1`; shim arms ×3; guard disabled-state render.
- [ ] **Step 2:** rewire + delete the screen + the route swap + silent strip (its notice tests retire with `ConfirmTargets.test.tsx`; `draft.ts`'s strip logic keeps its own unit tests, renamed away from "notice").
- [ ] **Step 3:** e2e sweep for this task: helpers `startFromLibrary`/`startAndSkipCountdown` drop the confirm click; `onboarding.spec.ts:180-184` and `flows.spec.ts:354` rewrite; the confirm describe (`design.spec.ts:1451-1626`) and `confirm.png` capture retire; `screenshots.spec.ts:625`'s test dies. Run `pnpm e2e` + `pnpm screenshots` once here (not the ×2 — that's Task 6): flows must pass with the screen gone.
- [ ] **Step 4:** full unit suite; commit — `feat: one door to the countdown, and the nudge finally rides along`.

### Task 5: Connect goes blue and first (spec §4)

**Files:**
- Modify: `app/src/theme/tokens.css` (`--action-connect: #2a6275`, `--action-connect-hover: #224f5e`, the four-things comment amended to five with the §4 rationale), `app/src/index.css` (`.button-connect` on the L1 base; dashed selectors `.connect-block-dashed .button-l2` → `.button-connect`; the `index.css:280-283` rule comment amended), `app/src/monitor/ConnectAction.tsx` (`button-l2` → `button-connect`), `app/src/workout/WorkoutDetail.tsx` (ConnectBlock first in the action stack; Start button copy `Start Timer`, class `.button-l2`)
- Test: `WorkoutDetail.test.tsx` (~25 pins rename to `Start Timer`; order pin: Connect precedes Start Timer in the stack; dashed-state render survives), `design.spec.ts:586-600` retarget (one 56px primary = `.button-connect` text `Connect`; Start Timer pinned L2; token joins the palette allowlist), `design.spec.ts:591` retarget

- [ ] Steps: failing pins first (order, copy, class, dashed survival) → token + class + swap + reorder → unit suite → `pnpm e2e` once for the design describe → screenshots: `workout-detail` captures update (LEGIT — commit with reason), revert unrelated re-encode noise → commit — `feat: the flagship path wears its own color`.

### Task 6: Docs, gates ×2, close-out (spec §8)

**Files:** `ROADMAP.md` (fast-follow phase entry; CL2's nudge filing moves here with the "rate display only" resolution; the step-detail memory's owed CL2 line; R3/R4 recorded as remaining follow-ons), draft next-release notes (NOT wired into `releaseNotes.ts` — a `docs/` draft covering #80/#81/#83 + this wave, dated at tag time), full gates ×2

- [ ] Steps: ROADMAP (hand-formatted, no prettier); the notes draft; gates ×2 sequentially (unit / e2e / screenshots / build+dist:grep / lint+typecheck+format) with counts recorded in the ledger; capture noise reverted; commit — `docs: the wave closes its own books`.

### Task 7: The erg confirmation row (JAMES GATE — phase exit)

Controller-run with James, one step at a time ([[hardware-session-pacing]]). Dev build via `pnpm ios:build` + ⌘R.

- [ ] (a) Nudge → Connect → row 1' → save: ALL measured; stash shows `summary-half` ×2 and `summary-reconciled: split-won` (the normal path) alongside the split chain.
- [ ] (b) Timer path on the phone: card nudge → **Start Timer** → countdown DIRECTLY (no confirm screen) → nudged target visible in the session.
- [ ] (c) The walk's facts (summary layout verified on wire, reconcile verdict observed) land in the interface notes; any FAIL loops back as a fix round. Then the PR (rich body, screenshots of the reordered stack + blue Connect) and James's merge word.

## Execution notes

- Order strict 1→7; radio (1-3) before UI (4-5) so an erg-blocking surprise surfaces earliest.
- Models: T1 sonnet; T2 the most capable available (the gate composes with three days of finish-path machinery); T3 haiku (small, shape-complete); T4 standard-capable (widest blast radius); T5 sonnet; T6 sonnet.
- Every dispatch: the SDLC briefing, the worktree path, the Node-26 line, the no-concurrent-suites rule, and its spec § verbatim via task-brief.
- The T2 reviewer re-reads the five grace bounds and the coupled constants BY EYE — the same mocks-can't-see-it discipline the phone-BLE reviews used.
