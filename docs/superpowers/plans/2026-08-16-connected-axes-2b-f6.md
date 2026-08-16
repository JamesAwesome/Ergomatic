# CR2 spec 2b (F6): the interrupted-session row — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a reload kills a connected session, Today offers a choice ("Log it" / Discard) instead of the app asserting anything on the machine's behalf; the logged record carries an honest actuals-derived duration, never wall-clock.

**Architecture:** A `MonitorRun`-shaped twin of Today's existing `UnloggedRow` idiom. Four layers, one task each: (1) the record gains an additive optional `endedBy: "interrupted"` field plus a stamping writer and a pure duration computation in `monitorRun.ts`; (2) the Connect door stops calling a dead run "in progress"; (3) `monitorLogTotals` branches on `endedBy` to compute recorded work + programmed rest for completed intervals; (4) the Today twin row wires it together. e2e/screenshots close it out.

**Tech Stack:** React 19 + Vite client, Vitest, Playwright. No server, no domain/ changes, no migration.

**Spec:** `docs/superpowers/specs/2026-08-15-connected-axes-design.md` §F6 (~line 173), PR-split §4 (~line 306), exit criterion 5. All rulings in the spec are James's or the PM gate's; nothing here re-opens them.

## Global Constraints

- **No wall-clock duration anywhere in the interrupted path** (James's ruling): duration = recorded work (Σ `IntervalActual.elapsedSeconds`) + programmed rest (Σ `restSeconds`) for COMPLETED intervals only. Never `completedAt − startedAt` for an interrupted record.
- **Discard clears the record ONLY.** `clearMonitorRun()` and nothing else. The diagnostics stash (`sessionStorage` keys `ergomatic:last-monitor-log`, `ergomatic:last-rowed-log`) is KEPT (James's ruling). Never call `useStagedDiscard().fire()` for a MonitorRun — it clears `clearDraft()`/`clearRun()`, the wrong records (precedent: `LogSession.tsx:1271-1279`).
- **Never-migrate discipline** (`monitorRun.ts` header): `endedBy` is additive and optional; `v` stays `1 | 2`; a v1/v2 record without the field reads as a normal completion. No version bump, no migration on read.
- **No reader of a LOADED program consults `ProgramInterval.type`** (`monitorRun.ts:100-137`, `program.ts:109-118`) — a stored program may predate the field. The duration computation walks `program.intervals` by index and reads only `restSeconds`.
- **The row describes evidence, never asserts machine state:** copy is "interrupted connected session.", never "ended"/"finished"/"paused".
- **`IntervalActual.index === null` must never be read as interval 0** (`domain/monitor/types.ts:153-158`): unattributable actuals contribute work seconds only, no rest.
- House copy style: no em-dashes in user-facing strings. 44px hit targets (reuse the existing `.today-unlogged-*` classes, which already comply).
- `app/src/today/todayGuard.pin.test.ts` pins the stale-draft guard byte-for-byte. This plan does not edit the guard body; the pin must stay green untouched.
- Adoption (resuming a live session after reload) is OUT — reconnect's spec. A COMPLETED-but-unlogged MonitorRun Today row is OUT (filed, ruled out of 2b).
- All commands run in `app/`. Failing test first for every behaviour. Per-file coverage inspected for every touched file (recurring failure #2). e2e + screenshots run before done (recurring failure #1) since `app/src/` UI changes.

### Decisions this plan makes (spec left them to the plan, with "say why")

1. **The honest duration lives in `monitorLogTotals` (a branch on `endedBy`), NOT in a back-dated `completedAt`.** The spec offered two routes. Back-dating loses twice: `IntervalActual` carries no wall-clock timestamp, so "the last measured boundary" would itself be a reconstruction (`startedAt` + derived seconds); and `completedAt`'s other readers (`connectGuardStage`, the stale-draft guard, `anyLiveSession`) all read it as "when the record closed" — back-dating would falsify that meaning for every one of them. `completedAt` stays honest (the moment the rower chose), and the totals function stops trusting it for duration on interrupted records.
2. **`dateLabel` for an interrupted record comes from `startedAt`, not `completedAt`.** `completedAt` on an interrupted record is the moment the rower clicked "Log it", possibly days after the row; the row happened at `startedAt`. (The normal-completion branch keeps `completedAt` — there the two are seconds apart.)
3. **The last completed interval's programmed rest counts.** "Work + programmed rest for completed intervals" (James's verbatim ruling) narrows `logSummaryTotals`'s all-intervals rest sum to completed ones; it does not further prorate the final rest. Simple, stated, testable.
4. **`terminated` is untouched by the interrupted stamp.** It means "a terminate was dispatched"; an interrupted session dispatched none. `endedBy: "interrupted"` is the discriminator.
5. **Named latent, deliberately NOT changed:** the Start door (`useStartWorkout.ts:115-134`) still maps a live-shaped MonitorRun to "A session is in progress. Replace it?" — the same false-assertion shape criterion 5 fixes at the Connect door. The spec scopes criterion 5 to Connect; the Start twin is filed for the phase close-out, not smuggled in here.
6. **Name collision, named:** the hook-level `endedBy: "machine" | "user" | null` (`useMonitorSession.ts:288`) is in-memory session state; the record field `endedBy?: "interrupted"` is persisted. They never meet in code (the hook value is not written to the record), but reviewers should not conflate them.

## File Structure

- Modify: `app/src/monitor/monitorRun.ts` — `endedBy` field, validator clause, `completeInterruptedRun`, `interruptedTotalSeconds`, `connectGuardStage` MonitorRun branch
- Modify: `app/src/session/LogSession.tsx` — `monitorLogTotals` interrupted branch
- Modify: `app/src/today/Today.tsx` — `UnloggedMonitorRow` twin + render site + lazy `loadMonitorRun()` read
- Modify: `app/src/index.css` — only if `.today-unlogged-link` needs a button-element variant (Task 4 Step 6 decides)
- Tests: `app/src/monitor/monitorRun.test.ts`, `app/src/monitor/ConnectAction.test.tsx`, `app/src/session/LogSession.test.tsx`, `app/src/today/Today.test.tsx`, `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`

---

### Task 1: The record layer — `endedBy`, the stamping writer, the honest duration

**Files:**
- Modify: `app/src/monitor/monitorRun.ts`
- Test: `app/src/monitor/monitorRun.test.ts`

**Interfaces:**
- Consumes: existing `MonitorRun`, `isMonitorRun` (`:142-167`), `saveMonitorRun`, `IntervalActual` (`app/domain/monitor/types.ts:133-165`), `ProgramInterval.restSeconds` (`app/domain/monitor/program.ts:158`)
- Produces (later tasks rely on these exact names):
  - `MonitorRun.endedBy?: "interrupted"` (optional field)
  - `export function completeInterruptedRun(run: MonitorRun, now: Date): MonitorRun`
  - `export function interruptedTotalSeconds(run: MonitorRun): number`

- [ ] **Step 1: Write the failing tests** in `monitorRun.test.ts`. Use the file's existing fixture helpers (it has dense per-field coverage from `:110`; follow its idiom, notably building a realistic v2 record with a compiled program — recurring failure #3). Cases:

```ts
describe("endedBy: the additive interrupted marker (F6)", () => {
  it("round-trips endedBy through save/load", () => {
    // build a v2 record, set endedBy: "interrupted", saveMonitorRun, loadMonitorRun
    // expect loaded.endedBy === "interrupted"
  });
  it("a record without endedBy loads unchanged (never-migrate: reads as normal completion)", () => {
    // save a completed v2 record with no endedBy; loaded.endedBy is undefined; record intact
  });
  it("rejects a record whose endedBy is any other value", () => {
    // write JSON with endedBy: "garbage" straight into localStorage under MONITOR_RUN_KEY
    // loadMonitorRun() returns null AND the key is cleared (Resilience #5 discipline)
  });
});

describe("completeInterruptedRun: the rower's door (F6)", () => {
  it("stamps completedAt from now and endedBy interrupted, persists, leaves terminated untouched", () => {
    // run with completedAt: null, terminated: false
    // const out = completeInterruptedRun(run, new Date("2026-08-16T10:00:00Z"))
    // expect(out.completedAt).toBe("2026-08-16T10:00:00.000Z")
    // expect(out.endedBy).toBe("interrupted"); expect(out.terminated).toBe(false)
    // expect(loadMonitorRun()?.endedBy).toBe("interrupted")  // persisted
  });
  it("is idempotent: an already-completed record is returned unchanged and not re-stamped", () => {
    // completedAt already set (normal completion, no endedBy)
    // completeInterruptedRun returns the same record; endedBy stays undefined
  });
});

describe("interruptedTotalSeconds: work + programmed rest for completed intervals", () => {
  it("sums elapsed work plus each completed interval's restSeconds", () => {
    // program: 3 intervals with restSeconds 30, 45, 0; actuals for indices 0 and 1
    // (elapsedSeconds 60.5 and 120.2) — interval 2 never completed
    // expect: 60.5 + 30 + 120.2 + 45 === 255.7 (toBeCloseTo)
  });
  it("an unattributable actual (index null) contributes its work seconds and no rest", () => {
    // actuals: [{index: 0, elapsedSeconds: 60, ...}, {index: null, elapsedSeconds: 20, ...}]
    // program interval 0 restSeconds 30 → expect 60 + 30 + 20 === 110
  });
  it("an out-of-range index contributes work only (defensive; array position is not program position)", () => {
    // actual with index 7 against a 2-interval program → its elapsed counts, no rest lookup throw
  });
  it("no actuals means zero", () => {
    // expect(interruptedTotalSeconds(runWithNoActuals)).toBe(0)
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test --project unit -- monitorRun` (adjust to the repo's invocation if the file runs under a different project; `pnpm test -- monitorRun.test` also works)
Expected: FAIL — `completeInterruptedRun` / `interruptedTotalSeconds` not exported; endedBy cases fail.

- [ ] **Step 3: Implement.** In `monitorRun.ts`:

Add to the `MonitorRun` interface (after `terminated`), matching the file's comment style:

```ts
  /**
   * Present only when the rower closed an interrupted session through
   * Today's row (F6). Absent = normal completion. Additive and optional
   * on purpose: a v1/v2 record without it reads exactly as before, per
   * this file's never-migrate contract.
   */
  endedBy?: "interrupted";
```

Add to `isMonitorRun`, alongside the other per-field checks:

```ts
  if (!(value.endedBy === undefined || value.endedBy === "interrupted")) {
    return false;
  }
```

Add the two functions (doc comments in the file's voice — say WHY, notably why `terminated` is untouched and why rest is per-completed-interval):

```ts
export function completeInterruptedRun(run: MonitorRun, now: Date): MonitorRun {
  if (run.completedAt !== null) return run;
  const next: MonitorRun = {
    ...run,
    completedAt: now.toISOString(),
    endedBy: "interrupted",
  };
  saveMonitorRun(next);
  return next;
}

export function interruptedTotalSeconds(run: MonitorRun): number {
  let total = 0;
  for (const actual of run.actuals) {
    total += actual.elapsedSeconds;
    if (actual.index !== null) {
      const interval = run.program.intervals[actual.index];
      if (interval !== undefined) total += interval.restSeconds;
    }
  }
  return total;
}
```

(`interruptedTotalSeconds` deliberately never reads `interval.type` — loaded-program invariant — and never treats `index: null` as 0.)

- [ ] **Step 4: Run the tests, confirm pass; check per-file coverage for `monitorRun.ts` covers the new branches** (the `endedBy` reject branch, idempotent return, `index === null`, out-of-range).

- [ ] **Step 5: Commit** — `feat: the record learns how an interrupted session ends`

### Task 2: The Connect door stops calling a dead run "in progress"

**Files:**
- Modify: `app/src/monitor/monitorRun.ts:580-590` (`connectGuardStage`)
- Test: `app/src/monitor/monitorRun.test.ts` (the `connectGuardStage` describe at `:773`), `app/src/monitor/ConnectAction.test.tsx`

**Interfaces:**
- Consumes: `connectGuardStage` (existing), `ConnectAction`'s copy branch (`ConnectAction.tsx:83-87`)
- Produces: behaviour only — a MonitorRun at the Connect door always stages `"unlogged"`. Signature unchanged.

Spec exit criterion 5: "Connect never again asks 'Replace it?' about a dead run." Any MonitorRun visible at a Connect door is dead: the connected session lives on WorkoutDetail's surface, and both reload and navigation tear it down, so `completedAt === null` there means "interrupted", not "running". "A session is in progress. Replace it?" asserts machine state we do not have — the exact sin spec 2 exists to remove. The SessionRun branch is untouched (a phone timer genuinely runs in the background).

- [ ] **Step 1: Update/add the failing tests.** In `monitorRun.test.ts`'s `connectGuardStage` describe: the existing case asserting a live MonitorRun returns `"in-progress"` now expects `"unlogged"` — change it and rename the test to say why (dead-run truth, criterion 5, cite the spec). Add a case: a MonitorRun stamped via `completeInterruptedRun` also returns `"unlogged"`. SessionRun cases untouched. In `ConnectAction.test.tsx`: with a `completedAt: null` MonitorRun seeded, connecting stages the copy "You have an unlogged session. Connecting discards it." and NOT "A session is in progress. Replace it?".

- [ ] **Step 2: Run to verify the changed expectations fail** against current code.

- [ ] **Step 3: Implement** — in `connectGuardStage`, the MonitorRun branch becomes:

```ts
  const monitorRun = loadMonitorRun();
  if (monitorRun !== null) {
    // A MonitorRun visible at a Connect door is dead: the connected
    // session lives on WorkoutDetail's surface and reload/navigation
    // tears it down. "In progress" would assert machine state we do
    // not have (spec 2b, exit criterion 5).
    return "unlogged";
  }
```

Update the function's doc comment (`:523-579`) where it describes the old mapping.

- [ ] **Step 4: Run the full unit + client projects** (this function guards a door; its truth-table test and ConnectAction's tests must both agree).

- [ ] **Step 5: Commit** — `fix: the Connect door stops asserting a dead run is in progress`

### Task 3: The interrupted header stops reading wall-clock

**Files:**
- Modify: `app/src/session/LogSession.tsx:326-338` (`monitorLogTotals`)
- Test: `app/src/session/LogSession.test.tsx`

**Interfaces:**
- Consumes: `interruptedTotalSeconds` (Task 1), `formatLogDate` (`logDraft.ts:834`), existing `monitorLogTotals` (module-private, single caller at `:1247`)
- Produces: behaviour only — the log header for an `endedBy: "interrupted"` record shows actuals-derived minutes and the row's own date.

- [ ] **Step 1: Write the failing test.** In `LogSession.test.tsx`, beside the existing monitor-mode tests (`:1905` onward), following their seeding idiom (a realistic compiled program + logSeed — recurring failure #3): seed a MonitorRun with `endedBy: "interrupted"`, `startedAt` one day before `completedAt`, actuals summing to a known work total, program rest known. Render the monitor-mode log screen via the `?from=monitor` route. Assert the header shows `Math.round((work + completedRest) / 60)` minutes — a value deliberately FAR from the wall-clock day-long difference (e.g. work+rest ≈ 11 min vs wall-clock ≈ 1445 min) so a wall-clock regression cannot pass — and the dateLabel formats `startedAt`'s date, not `completedAt`'s. Add the inverse pin: a normal-completion record (no `endedBy`) still shows the wall-clock minutes (existing behaviour, now explicitly pinned against this change).

- [ ] **Step 2: Run to verify it fails** (current code shows ~1445).

- [ ] **Step 3: Implement:**

```ts
function monitorLogTotals(run: MonitorRun): {
  dateLabel: string;
  totalMinutes: number;
} {
  if (run.endedBy === "interrupted") {
    // Wall-clock is forbidden on the interrupted path (spec 2b, James's
    // ruling): completedAt is the moment the rower chose "Log it",
    // possibly days after the row. Duration is what was measured plus
    // the programmed rest the rower was owed; the date is the row's own.
    return {
      dateLabel: formatLogDate(run.startedAt),
      totalMinutes: Math.round(interruptedTotalSeconds(run) / 60),
    };
  }
  // ...existing wall-clock body unchanged...
}
```

Import `interruptedTotalSeconds` from `../monitor/monitorRun`. Update the function's doc comment (`:313-325`) to name the two branches.

- [ ] **Step 4: Run tests, confirm pass; per-file coverage on the new branch.**

- [ ] **Step 5: Commit** — `feat: an interrupted session's log header reads measured time, not wall-clock`

### Task 4: Today's twin row — the choice itself

**Files:**
- Modify: `app/src/today/Today.tsx` (new `UnloggedMonitorRow` beside `UnloggedRow:480`; lazy read beside `:284`; render site beside `:1160`; `TodayView` props at `:752`)
- Modify (only if Step 6 finds it needed): `app/src/index.css`
- Test: `app/src/today/Today.test.tsx`

**Interfaces:**
- Consumes: `loadMonitorRun`, `clearMonitorRun`, `completeInterruptedRun`, `MonitorRun` (from `../monitor/monitorRun`), `useStagedDiscard` (`../session/useStagedDiscard`), `useNavigate` (already imported in Today.tsx), the `.today-unlogged-*` CSS family
- Produces: `UnloggedMonitorRow` (module-private component); `TodayView` gains a `monitorRun: MonitorRun | null` prop.

Twin discipline: copy `UnloggedRow`'s structure (`:480-557`) including the armed-focus effect (`:496-498`, the structurally-different-node fix) and the row-owns-its-state doc rationale (`:1150-1159`). The differences, exhaustively: the copy ("interrupted connected session."), the Log it target (stamp then navigate to the monitor door), the discard body (`clearMonitorRun()` only), and the null-`workoutId` latent (no Log it).

- [ ] **Step 1: Write the failing tests** in `Today.test.tsx`, reusing its `makeMonitorRun` helper (`:1744-1757`) and mirroring the existing UnloggedRow describes (`:1940-2007` onward). Cases:

```ts
describe("Today (2b): the interrupted connected session row", () => {
  it("shows the row for a dead MonitorRun, naming the workout and the evidence", () => {
    // seed makeMonitorRun({ completedAt: null }) under MONITOR_RUN_KEY
    // expect text "interrupted connected session." with the run title in <strong>
    // expect a "Log it" control and the ✕ with aria-label "Discard without logging"
  });
  it("shows no row when the record is completed (ruled out of 2b) or absent", () => {});
  it("Log it stamps the interrupted door and lands on the monitor log route", async () => {
    // click Log it
    // expect loadMonitorRun()?.completedAt to be non-null and endedBy "interrupted"
    // expect navigation to `/library/${workoutId}/log?from=monitor`
    //   (mock or route-assert per the file's existing navigation idiom)
  });
  it("discard is staged: first tap arms in place, second tap clears ONLY the monitor record", async () => {
    // seed a completed-unlogged SessionRun AND a draft AND both sessionStorage stash keys
    // two taps on ✕ → MONITOR_RUN_KEY gone; RUN_KEY, draft key, and BOTH
    // sessionStorage keys untouched; row gone without navigation or fetch
  });
  it("armed row moves focus to the confirm button and blur disarms (parity with UnloggedRow)", async () => {});
  it("auto-disarms after 4s (parity)", () => { /* vi.useFakeTimers, ARM_TIMEOUT_MS */ });
  it("an anonymous run (workoutId null) gets the row without Log it", () => {
    // unreachable today (only WorkoutDetail programs) but the latent is stated in the spec
  });
});
```

The discard test's assertion set IS the ruling ("record discarded, diagnostics stash kept") — seed the stash keys with real exported-log-shaped strings, not empty strings, so the assertion means something.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement `UnloggedMonitorRow`** (beside `UnloggedRow`, with a doc comment explaining the twin relationship and pointing at the spec):

```tsx
function UnloggedMonitorRow({ run }: { run: MonitorRun }) {
  const discard = useStagedDiscard();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const armedButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (discard.armed) armedButtonRef.current?.focus();
  }, [discard.armed]);

  if (dismissed) return null;

  function handleDiscardClick() {
    if (discard.armed) {
      // Not discard.fire(): that clears the draft and the phone-timer
      // run, the wrong records for a MonitorRun. The stash is KEPT on
      // purpose (spec 2b: a rower reporting a bug right after
      // discarding keeps the evidence).
      discard.disarm();
      clearMonitorRun();
      setDismissed(true);
    } else {
      discard.arm();
    }
  }

  function handleLogIt() {
    // Stamping is the rower's ruling, not the app's: it is what opens
    // monitorModeRun's completedAt gate.
    completeInterruptedRun(run, new Date());
    navigate(`/library/${run.workoutId}/log?from=monitor`);
  }

  if (discard.armed) {
    return (
      <div className="today-unlogged-line today-unlogged-line-armed">
        <p className="today-unlogged-text">
          Discard <strong>{run.title}</strong> without logging?
        </p>
        <button
          type="button"
          ref={armedButtonRef}
          className="today-unlogged-discard-armed"
          onClick={handleDiscardClick}
          onBlur={discard.disarm}
        >
          Tap again
        </button>
      </div>
    );
  }

  return (
    <div className="today-unlogged-line">
      <p className="today-unlogged-text">
        <strong>{run.title}</strong>: interrupted connected session.
      </p>
      <div className="today-unlogged-actions">
        {run.workoutId !== null && (
          <button
            type="button"
            className="today-unlogged-link"
            onClick={handleLogIt}
          >
            Log it
          </button>
        )}
        <button
          type="button"
          className="today-unlogged-discard"
          onClick={handleDiscardClick}
          onBlur={discard.disarm}
          aria-label="Discard without logging"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire it.** In `Today()`: `const [monitorRun] = useState<MonitorRun | null>(() => loadMonitorRun());` beside the `loadRun()` read at `:284`; pass `monitorRun={monitorRun}` into `TodayView` (`:441`); add `monitorRun: MonitorRun | null;` to its props (`:752`); render beside `:1160`:

```tsx
{monitorRun !== null && monitorRun.completedAt === null && (
  <UnloggedMonitorRow run={monitorRun} />
)}
```

(The condition is `completedAt === null` on purpose: a completed-but-unlogged MonitorRun row is ruled OUT of 2b. Do not touch the stale-draft guard effect; `todayGuard.pin.test.ts` must pass unmodified.)

- [ ] **Step 5: Run the Today tests and the guard pin; confirm pass.**

- [ ] **Step 6: Check the Log it button's rendering.** `.today-unlogged-link` (`index.css:1781`) was written for an `<a>`. Render Today with the row in the dev server or jsdom-computed styles; if the button variant needs `background: none; border: none; font: inherit` etc. to match, extend the rule in `index.css` (keep the 44px hit target). If no change is needed, say so in the report.

- [ ] **Step 7: Per-file coverage for `Today.tsx` (the new component's branches: armed/default/null-workoutId/dismissed).**

- [ ] **Step 8: Commit** — `feat: a reload offers a choice, not an assertion`

### Task 5: e2e, design assertions, screenshots, full gates

**Files:**
- Modify: `app/e2e/design.spec.ts` (beside the unlogged-row describe at `:1379`), `app/e2e/screenshots.spec.ts` (beside `today-unlogged` at `:441`)
- Possibly: `docs/design/DEVIATIONS.md` reconciliation if any row describes the Connect guard copy or Today rows (check; recurring failure #9)

**Interfaces:**
- Consumes: everything from Tasks 1-4; the e2e seeding idiom the existing today-unlogged tests use (localStorage seeding against the compose stack).

- [ ] **Step 1: e2e flow test** (in the file the existing unlogged-row flows live in): seed a dead MonitorRun (realistic: a compiled program from a seeded library workout with logSeed, two actuals — copy the shape the client tests' `makeMonitorRun` builds, but with real library data; recurring failure #3), load Today, assert the row; click Log it; assert the log screen opens with the actuals-derived minutes in the header (assert the NUMBER, not just arrival — recurring failure #4).
- [ ] **Step 2: e2e design/structural assertions** mirroring the unlogged-row block (`design.spec.ts:1379`): hit-target ≥44px on Log it and ✕, armed-class swap, contrast tokens are the existing family (no new colors; if any new style lands in Step 6 of Task 4, compute its contrast ratio and put the number in the report — recurring failure #6).
- [ ] **Step 3: Screenshot** — add `today-interrupted` beside `today-unlogged` (`screenshots.spec.ts:441`), seeded with a real workout title; run `pnpm screenshots`, open both new and existing today captures and LOOK at them (recurring failure #7).
- [ ] **Step 4: Full scoped gates**, all in `app/`, e2e in the FOREGROUND: `pnpm lint`, `pnpm typecheck`, `pnpm test` (grep BOTH summary lines: "Tests" and "Test Files"), `pnpm test:coverage` with per-file inspection of the four touched product files, `pnpm e2e`, `pnpm screenshots`.
- [ ] **Step 5: Grep `docs/design/DEVIATIONS.md`** for rows touching the Connect guard copy or Today's unlogged row; reconcile any that now misdescribe current state.
- [ ] **Step 6: Commit** — `test: the interrupted row is walked end to end`

---

## Self-review (writing-plans checklist, run at authoring time)

- Spec coverage: F6 requirement 1 (evidence copy, no assertion) → Task 4; requirement 2 (the door, two product files, `endedBy`, latents) → Tasks 1+3+4; requirement 3 (honest duration, discard keeps stash) → Tasks 1+3 and Task 4's discard test; exit criterion 5's Connect clause → Task 2. Adoption/completed-unlogged-row/reducer: out, per spec.
- No placeholders: every step carries code or an exact assertion recipe.
- Type consistency: `completeInterruptedRun(run, now)` and `interruptedTotalSeconds(run)` named identically in Tasks 1, 3, 4.
