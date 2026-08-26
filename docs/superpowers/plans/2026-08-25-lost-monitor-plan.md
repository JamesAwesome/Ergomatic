# Phase LM PR 1 — The session that never started · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower whose phone never saw a first pull is told so, before and during, and the row they save stops claiming they typed it in by hand.

**Architecture:** Four independent tasks. Task 1 adds diagnostics that survive the never-rowed case (a `localStorage` stash, because the existing ring is run-gated and unreadable on a phone). Task 2 stops the surface throwing away armed-ness when it goes stale — one root cause behind four wrong displays — and adds a four-word warning to the ready screen. Task 3 cuts the lost banner's copy and branches it on whether anything was measured. Task 4 stops a connected session that recorded nothing rendering through the manual door as a hand-log.

**Tech Stack:** React 19 + TypeScript, Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-25-lost-monitor-design.md` — read it before Task 1. Gate 0 is APPROVED; its rulings are binding.

## Global Constraints

- **No copy, comment, test name or PR text may state a CAUSE for the zero.** Three producers are undistinguished (spec, "What we do NOT know"). This is the rule revision 2 broke.
- **Copy length is a hard constraint.** James, 2026-08-25: *"Too much prose. Holy fuck why is everything a whole sentence. This is a workout app people aren't going to read a fucking novel of warnings."* The ready-screen warning is FOUR WORDS. The lost banner is a title plus at most four words.
- **No em-dashes in user-facing strings** (periods, colons, middle dots). House style.
- **Contrast is computed, never eyeballed**, and the number goes in the report. Floor 4.5:1. WCAG AA and 44px hit targets are hard requirements.
- **Failing test first, every task.** docs/TESTING.md governs. Assert the rendered string a rower sees, never that a helper exists.
- **Fixtures must look like the failure**: the flagship is a surface that is stale AND never rowed, and a `from=monitor` arrival with NO record. A fixture with actuals passes while the real path fails.
- **`pnpm e2e` is mandatory** for any task touching `app/src/` (recurring failure #1). `pnpm screenshots` only if layout changes, never for wording-only.
- **Check per-file coverage** for files you touch; the repo-wide gate hides new uncovered branches.
- **SDLC:** work in the worktree `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/lost-monitor` (branch `lost-monitor`). Run `git rev-parse --show-toplevel` before every commit and confirm it prints that path. Every shell WRITE uses an absolute path or a `cd` in the same command (recurring failure #19). Never merge; never remove the worktree.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `app/src/monitor/useMonitorSession.ts` | ring entries, wall clock, unconditional stash | 1 |
| `app/src/session/LogSession.tsx` | readout affordance for the never-rowed case; `monitorModeRun` miss reason | 1, 4 |
| `app/src/workout/ConnectedSurface.tsx` | status derivation (armed vs stale), banner props | 2, 3 |
| `app/src/workout/connected/surfaceModel.ts` | `armedMirror` decoupled from link state | 2 |
| `app/src/workout/ConnectedInterstitial.tsx` | ready-screen warning | 2 |
| `app/src/index.css` | warning strip, filled alert banner, `LAST SEEN` | 2, 3 |
| `app/src/session/summaryModel.ts` | exported "measured anything" rule | 3 |
| `app/src/news/content/releaseNotes.ts` | reconcile v0.17.0 items | 3, 4 |

---

### Task 1: Diagnostics that survive the never-rowed case

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` (stash at `:2285-2300`; `endSession`/`closeRecord` at `:1477`)
- Modify: `app/src/session/LogSession.tsx` (`monitorModeRun` at `:254-268`; `MonitorLogRow` at `:734-743`)
- Test: `app/src/monitor/useMonitorSession.test.ts`, `app/src/session/LogSession.test.tsx`

**Interfaces:**
- Produces: a `localStorage` key `ergomatic:last-session-log`, written unconditionally on every teardown, and a copy affordance on the log screen that renders whether or not a run exists. Later tasks do not consume it.

**Why this task exists, and the trap it is fixing:** the spec's first draft planned to write these entries into the existing ring. `ergomatic:last-rowed-log` is written only inside `if (runRef.current !== null)` (`:2296`), which is `null` by definition in the case this phase is about; `MonitorLogRow` renders only when that key exists; the recording-download row is dev-only; and there is no console on iOS. The evidence would have been unreachable on the one device that matters.

- [ ] **Step 1: Write the failing test — the never-rowed teardown still stashes**

```ts
it("stashes the diagnostics log even when no run was ever created (the never-rowed case)", async () => {
  const { teardown } = await arriveArmedWithoutRowing();
  await teardown();
  const stash = localStorage.getItem("ergomatic:last-session-log");
  expect(stash).not.toBeNull();
  expect(JSON.parse(stash!).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run it, confirm it fails** — `pnpm test --project client -t "never-rowed case"`. Expected: FAIL, `stash` is `null`.

- [ ] **Step 3: Write unconditionally, to `localStorage`**

In `stash()` (`useMonitorSession.ts:2284`), alongside the existing two `sessionStorage` writes, add one that is NOT run-gated. Use `localStorage`, deliberately: a WebContent process kill is one of the probe's own three outcomes and would destroy `sessionStorage`, i.e. the instrument would erase the result it exists to catch.

```ts
localStorage.setItem("ergomatic:last-session-log", exported);
```

Keep it inside the existing `try/catch` — quota or privacy mode must never break a teardown.

- [ ] **Step 4: Add the wall clock to the ring.** The ring has no wall clock today. Add an ISO timestamp per entry. This is what turns the diagnostics into the probe.

- [ ] **Step 5: Failing tests for the three new ring entries, then implement.** Each asserts the entry's presence AND its content, not that a logger was called.
  - `endSession` closing with no record (`closeRecord`'s `run === null` early return at `:1477`) records `kind: "close-no-record"` naming that nothing was closed. Today it returns silently, which is why this cost a tester a workout.
  - On resume (the app-lifecycle listener, `:2649-2661`), record frames-seen-while-hidden and what the ready gate saw (`rowingActive`, whether distance increased).
  - `monitorModeRun` returning `null` records WHICH of its five conditions missed. **Five, not four** — `from !== "monitor"`, `run === null`, `completedAt === null`, `workoutId` mismatch, `buildMonitorLogSteps` throwing.

- [ ] **Step 6: Failing test for the readout, then implement.** The log screen must offer a copy affordance for the never-rowed case. Assert the control renders when no run exists and that activating it copies the stash — invoke it and assert the consequence.

- [ ] **Step 7: Gates.** `pnpm test --project unit --project client`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`. Per-file coverage for both files.

- [ ] **Step 8: Commit** — `git rev-parse --show-toplevel` first.

```bash
git add app/src/monitor/useMonitorSession.ts app/src/session/LogSession.tsx app/src/monitor/useMonitorSession.test.ts app/src/session/LogSession.test.tsx
git commit -m "feat(monitor): diagnostics that survive a session with no record"
```

---

### Task 2: Stop erasing the ready state, and warn on the ready screen

**Files:**
- Modify: `app/src/workout/ConnectedSurface.tsx:441-448` (the status ternary)
- Modify: `app/src/workout/connected/surfaceModel.ts` (`armedMirror` at `:836`; `staleFor` at `:115`; the model's inputs at `:298`/`:375`)
- Modify: `app/src/workout/ConnectedInterstitial.tsx:638-647` (the programmed/ready body)
- Modify: `app/src/index.css`
- Test: `app/src/workout/ConnectedSurface.test.tsx`, `app/src/workout/connected/surfaceModel.test.ts`, `app/src/workout/ConnectedInterstitial.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `buildSurfaceModel` gains an independent link-lost input; `armedMirror` no longer implies a healthy link. Task 3 consumes the same `stale` notion for the banner.

**The root cause, verified:** `ConnectedSurface.tsx:441` resolves status as `axes.link === "lost" ? "stale" : axes.program === "armed" && axes.session === "none" ? "armed" : …`. **Lost is checked first**, and `SurfaceStatus` is a single union (`:70`), so a stale surface can never be armed. `armedMirror = status === "armed"` (`:836`) then flips four things at once:

| Consumer | Armed | Once stale (what the walk showed) |
| --- | --- | --- |
| `intervalLabelShort` (`:1122`) | `1 OF 1 · READY` | `1 OF 1 · WORK` |
| `paceActual` (`:855`) | mirrors the target | `LAST 0:00.0` |
| `rateActual` (`:867`) | `0` | `LAST 0` |
| `totalLeftSeconds`/`elapsedSeconds` (`:1067`,`:1077`) | un-started | `EST LEFT 8:24` |

**`EST LEFT` is a number a rower reads, so this task carries NUMBER weight.** It is not fast path and the tests must pin each of the four consumers separately.

**The fix shape (decided here, do not re-litigate):** make link-lost an INDEPENDENT input rather than a member competing with `armed`. `status` keeps describing activity; a separate boolean carries the link. `staleFor` and every `stale` consumer read the boolean. `armedMirror` becomes "programmed and no session yet", regardless of link.

Do NOT fix this by reordering the ternary — putting `armed` first would make a stale armed surface stop reporting the loss, trading one wrong screen for another.

- [ ] **Step 1: Failing test — a stale surface that never rowed still reads READY**

```ts
it("keeps the READY caption when the link is lost before the first pull", () => {
  const model = buildSurfaceModel(armedNeverRowed({ linkLost: true }));
  expect(model.intervalLabelShort).toBe("1 OF 1 · READY");
});
```

- [ ] **Step 2: Run it, confirm it fails.** Expected: receives `"1 OF 1 · WORK"`.

- [ ] **Step 3: Three more failing tests, one per remaining consumer** — the pace mirror, the rate zero, and `EST LEFT`/elapsed staying un-started. Assert values, not that a branch was taken.

- [ ] **Step 4: Implement the decoupling.** Thread the link state independently; update `armedMirror`; keep `stale` behaviour identical for every non-armed status so nothing else moves.

- [ ] **Step 5: Sweep for the same collapse elsewhere.** The union makes every status mutually exclusive, so anything keyed on a member is a candidate for the identical bug. Check the grid and the progress bar. **Report what you find even if it is nothing** — a stated "nothing found" is a result.

- [ ] **Step 6: Failing test for the ready-screen warning, then implement.** In `ConnectedInterstitial`'s programmed state, under "The monitor starts the clock on your first stroke.", add a sunken strip with a `--marker` left rule reading exactly:

```
KEEP THE SCREEN ON
```

Four words. Every session, quiet (Gate 0 ruling). It asserts no cause and promises no sufficiency. Contrast: `--marker` on `--surface` 6.49:1, on `--surface-sunken` 5.50:1 — recompute and put both numbers in your report.

- [ ] **Step 7: Gates.** Full test run, typecheck, lint, `pnpm e2e`, and `pnpm screenshots` (this task changes layout). Open the captures and look at them.

- [ ] **Step 8: Commit.**

---

### Task 3: The lost banner, branched and cut to the bone

**Files:**
- Modify: `app/src/workout/ConnectedSurface.tsx:557` and `:615-624` (`LostBanner`, currently propless)
- Modify: `app/src/session/summaryModel.ts` (export the measured-anything rule; `targetsOnlyCaption` at `:1107`, `isMonitorRowMeasurable` at `:872`)
- Modify: `app/src/index.css` (filled alert treatment, `LAST SEEN`)
- Modify: `app/src/news/content/releaseNotes.ts` (v0.17.0 items at `:155`, `:156`)
- Test: `app/src/workout/ConnectedSurface.test.tsx`, `app/src/session/summaryModel.test.ts`

**Interfaces:**
- Consumes: Task 2's independent link state.
- Produces: an exported measured-anything rule; Task 4 may consume it.

**Gate 0 rulings, binding:** filled red (`--judge-slower` ground, `--surface` text, **7.94:1**). `LAST` becomes `LAST SEEN` on both heroes. Everything stale greys to `--ink-3` together, including the metres — the existing house idiom, not a new treatment. The banner does NOT render on the pre-row state at all.

- [ ] **Step 1: Failing tests for both branches.**
  - Something measured: title `LOST THE MONITOR`, body names the count, e.g. `2 intervals kept.`
  - Nothing measured: must not claim anything was kept, and must name no cause.

- [ ] **Step 2: Run them, confirm they fail.**

- [ ] **Step 3: Export ONE measured-anything rule from `summaryModel.ts`.** The three consumers hold different shapes — `targetsOnlyCaption` takes `SummaryRow[]`, `isMonitorRowMeasurable` takes a `LogStep`, the banner renders from `session.actuals: IntervalActual[]` (`ConnectedSurface.tsx:456`). So this is **one rule plus one adapter per consumer, with the adapters tested against each other**, not one function called twice. A naive "any actual" predicate disagrees with the caption on a sub-second actual: the banner would say an interval was kept while the summary says `TARGETS ONLY · NOTHING MEASURED`.

- [ ] **Step 4: Implement the banner branch and the filled treatment.** Recompute the 7.94:1 and put it in your report.

- [ ] **Step 5: Reconcile both release notes, checking rather than assuming.**
  - `:155` quotes the eyebrow and the freeze, and names a phone call as a cause. It may remain accurate — read it and decide.
  - `:156` says a session under the lost banner "stores it as link-lost". Task 4 can falsify this; coordinate.

- [ ] **Step 6: Gates**, including `pnpm e2e`. Screenshots only if layout moved.

- [ ] **Step 7: Commit.**

---

### Task 4: A connected session that recorded nothing must not pose as hand-logged

**Files:**
- Modify: `app/src/session/LogSession.tsx` (`monitorModeRun` `:254`; manual-door save `:1605-1612`)
- Modify: `app/src/log/storedSummary.ts` only if option 1 is taken
- Test: `app/src/session/LogSession.test.tsx`, `app/src/log/storedSummary.test.ts`

**Interfaces:**
- Consumes: Task 1's `monitorModeRun` miss reason.

**This is the TRIAD task.** Read the spec's Task 4 in full before starting; it enumerates why the obvious fixes are wrong.

**Two options. Pick one, justify it in your report, and do not silently take the cheapest.**

1. **Carry the door.** NOT decidable until you name a field, a value and a migration. `endedBy` is a Postgres `pgEnum` of exactly five values (`server/db/schema.ts:68-74`) and **none means "connected, never saw a pull"**; `link-lost` asserts a cause the constraints forbid; a sixth value is a migration, and `buildLinkLostLine` (`storedSummary.ts:881`) is a deliberate equality check that would render it invisibly. `deviceName` alone flips `sourceLabel` (`storedSummary.ts:252`) to the erg's name on a row with **zero measured data**, claiming PM5 provenance for numbers that came off nothing.
2. **Live screen only, stored row explicitly left wrong.** Acceptable at this scope **only if the PR states the full cost in plain words**: the stored row stays permanently and unbackfillably indistinguishable from a genuine hand-log, for this row and every earlier one.

**Do NOT introduce `LINK LOST` as a `sourceLabel` value.** Source answers "where did these numbers come from"; `endedBy` answers "how did this close". They agree only on the zero-measured case — on a link dropping after 3 of 4 intervals it would stamp failure over genuinely PM5-measured rows.

- [ ] **Step 1: Failing test** — a `from=monitor` arrival with NO record does not render `LOGGED BY HAND`. The fixture is no record at all, not a record with zero actuals.
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Implement the chosen option.** If you take option 1, the migration and its `pgEnum` change are part of this task and follow the Drizzle timestamp-ordering rule.
- [ ] **Step 4:** Confirm all three exits still render (`Log against plan` included and undemoted — James's ruling). This is already true via the shared `PostWorkoutSummary`; assert it rather than assuming.
- [ ] **Step 5: Gates**, including `pnpm e2e` and per-file coverage.
- [ ] **Step 6: Commit.**

---

## Out of scope for this plan

- `UIBackgroundModes` as a shipped change. The §D1e probe builds a throwaway variant; **PR 1 merges no plist change.**
- Correct resume — that is PR 2.
- The walks. Criteria 9 and 10 need hardware and **block the merge** (James, 2026-08-25: *"Have the walks block"*), but they are not implementation tasks.
