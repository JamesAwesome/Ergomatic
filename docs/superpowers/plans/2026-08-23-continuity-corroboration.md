# Continuity Corroboration (F2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The continuity guard convicts only on a full monitor-reset signature — TWD, elapsed AND distance all strictly backward in one reading — so a single flaky TWD reading can never again close a healthy row as link-lost.

**Architecture:** `continuity.ts`'s `ContinuityReading` grows `elapsedSeconds` and `distanceMeters` (required); `check` becomes a three-way conjunction over strict decreases; the distance-goal suppression stays untouched and first. `useMonitorSession.ts`'s `lastTwdRef` becomes a three-field snapshot ref, and `applyContinuityCheck` passes full readings. No other decision logic moves.

**Tech Stack:** TypeScript, Vitest (client project — both files are under `app/src`), the committed capture corpus + walk-2026-08-23 rings as replay fixtures.

**Spec:** `docs/superpowers/specs/2026-08-23-continuity-corroboration-design.md` (post-antagonist revision — its six corrections are IN it; on conflict, say so in your report).

## Global Constraints

- Worktree `.claude/worktrees/rc-f2a`, branch `rc-f2a`. `git rev-parse --show-toplevel` before every commit. `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` in every shell (hooks block on Node 25).
- TDD: failing test first. Gates FOREGROUND. Vitest at PROJECT scope only (`pnpm test --project client`; single-FILE runs escape jsdom — check the "Test Files" count). **NOT `pnpm exec vitest run` (final-review LOW-2, 2026-08-23): that form bypasses `package.json`'s own `NODE_OPTIONS=--no-experimental-webstorage`, and on this repo's Node 26, Node's experimental WebStorage shadows jsdom's `localStorage` — 29 failed files / 1,153 failed tests that have nothing to do with the diff.**
- Conviction predicate, verbatim from the spec: `"reset"` ONLY when `after.totalWorkDistanceMeters < before.totalWorkDistanceMeters && after.elapsedSeconds < before.elapsedSeconds && after.distanceMeters < before.distanceMeters` — strict `<` on all three, zero tolerance, and the distance-goal suppression short-circuits FIRST, unchanged.
- NO fixture may carry defaulted zeros for the new fields — every reading in every test uses real values from its source frame (a zeroed fixture makes the suppression tests vacuous; antagonist blocking 5).
- The walk's real pairs pin only the TWD clause — the per-clause pins in Task 1 are the tests that CAN go red; the implementing task self-mutates each clause and shows the kill.
- TRIAD: this changes when records close. PM final-PR gate follows; nothing merges on green alone.

## File map

- Modify: `app/src/monitor/continuity.ts` (~:82 `ContinuityReading`, ~:129 `check`), `app/src/monitor/continuity.test.ts` (new pins + real-valued fixtures + corpus gate), `app/src/monitor/useMonitorSession.ts` (`lastTwdRef` :1146, snapshot write :1559, `applyContinuityCheck` :465-505 and its call :1609), `app/src/monitor/useMonitorSession.test.ts` (the Task-4-era continuity tests), `ROADMAP.md` (three riders).

---

### Task 1: The three-axis predicate in `continuity.ts`

**Files:**
- Modify: `app/src/monitor/continuity.ts`
- Test: `app/src/monitor/continuity.test.ts`

**Interfaces:**
- Produces (Task 2 relies on these exact shapes): `ContinuityReading` gains two REQUIRED fields — `elapsedSeconds: number; distanceMeters: number` (alongside the existing `totalWorkDistanceMeters` and `distanceGoal`). `check(before, after)` signature unchanged.

- [ ] **Step 1: Write the failing tests.** In `continuity.test.ts`, a new describe block. The named real pairs (values transcribed from the committed rings — cite file+seq in each test name):

```ts
describe("continuity.check: the three-axis full-reset signature (F2a, spec 2026-08-23)", () => {
  // ring-phone-2-background-continuity-kill.json seq 30 -> 33: the walk's
  // own false kill. TWD backward, elapsed AND distance advancing.
  const beforeHealthy = {
    totalWorkDistanceMeters: 81, elapsedSeconds: 56.11,
    distanceMeters: 81.2, distanceGoal: false,
  };
  const afterTwdOnlyBackward = {
    totalWorkDistanceMeters: 0, elapsedSeconds: 59.33,
    distanceMeters: 83.3, distanceGoal: false,
  };
  it("the 2026-08-23 false kill cannot regress: ring-phone-2 seq 30->33 is a continuation", () => {
    expect(check(beforeHealthy, afterTwdOnlyBackward)).toBe("continuation");
  });
  // ring-phone-4 seq 7-8 shape: a genuinely reset monitor reads zeros on
  // all three axes.
  it("a full reset (all three axes backward) still convicts", () => {
    expect(check(beforeHealthy, {
      totalWorkDistanceMeters: 0, elapsedSeconds: 0,
      distanceMeters: 0, distanceGoal: false,
    })).toBe("reset");
  });
  // Per-clause pins (antagonist blocking 4): exactly one axis backward,
  // two advancing -> continuation, one pin per axis so deleting ANY
  // clause of the conjunction goes red.
  it("elapsed-only backward is a continuation (per-interval clocks legally re-base)", () => {
    expect(check(beforeHealthy, {
      totalWorkDistanceMeters: 95, elapsedSeconds: 2.1,
      distanceMeters: 90.0, distanceGoal: false,
    })).toBe("continuation");
  });
  it("distance-only backward is a continuation (per-interval distance legally resets)", () => {
    expect(check(beforeHealthy, {
      totalWorkDistanceMeters: 95, elapsedSeconds: 60.0,
      distanceMeters: 1.9, distanceGoal: false,
    })).toBe("continuation");
  });
  it("TWD-only backward is a continuation (the non-monotonic key, walk F5)", () => {
    expect(check(beforeHealthy, afterTwdOnlyBackward)).toBe("continuation");
  });
  it("two of three backward is still a continuation (a boundary shape, never a reset)", () => {
    expect(check(beforeHealthy, {
      totalWorkDistanceMeters: 95, elapsedSeconds: 0.5,
      distanceMeters: 1.9, distanceGoal: false,
    })).toBe("continuation");
  });
  it("0 -> 0 TWD is not backward (strict less-than; the five-zeros regime)", () => {
    expect(check(
      { totalWorkDistanceMeters: 0, elapsedSeconds: 11.27, distanceMeters: 33.3, distanceGoal: false },
      { totalWorkDistanceMeters: 0, elapsedSeconds: 15.0, distanceMeters: 40.1, distanceGoal: false },
    )).toBe("continuation");
  });
  // Antagonist blocking 5: the suppression must be pinned NON-vacuously —
  // a distance-goal pair with ALL THREE axes backward (the 0/250/500
  // boundary flicker shape) is a continuation ONLY because of the
  // suppression. Delete the suppression line and THIS test goes red.
  it("distance-goal suppression is load-bearing: a triple-backward flicker pair stays a continuation", () => {
    expect(check(
      { totalWorkDistanceMeters: 500, elapsedSeconds: 69.75, distanceMeters: 248.5, distanceGoal: true },
      { totalWorkDistanceMeters: 0, elapsedSeconds: 0.5, distanceMeters: 1.9, distanceGoal: true },
    )).toBe("continuation");
  });
});
```

- [ ] **Step 2: Verify failures at project scope** — `pnpm test --project client`. The new describe fails to COMPILE first (missing required fields on existing fixtures elsewhere in the file) — that compile error is part of the point: fix every existing `ContinuityReading` fixture in the file with REAL values from its source frames (the corpus block decodes 0x0031 already — thread its decoded `elapsedSeconds`/`distanceMeters` through; never default zeros). Then the behavior tests fail against the old single-axis `check`.
- [ ] **Step 3: Implement** — add the two required fields to `ContinuityReading`; rewrite `check`'s body:

```ts
export function check(
  before: ContinuityReading,
  after: ContinuityReading,
): ContinuityVerdict {
  if (before.distanceGoal || after.distanceGoal) return "continuation";
  const resetSignature =
    after.totalWorkDistanceMeters < before.totalWorkDistanceMeters &&
    after.elapsedSeconds < before.elapsedSeconds &&
    after.distanceMeters < before.distanceMeters;
  return resetSignature ? "reset" : "continuation";
}
```

Update the file's header comment: the bound is now the full-reset signature; state the traded-away conviction class (spec §2b, one paragraph) and that "never observed in 3,637 wire pairs" is the claim, not "cannot". `CONTINUITY_BACKWARD_TOLERANCE_METERS` is deleted OR kept at 0 with its comment retargeted — prefer delete (strict `<` needs no tolerance constant; grep for consumers first).
- [ ] **Step 4: The corpus gate with real values** — the existing corpus-derivation block feeds `check` from decoded frames; thread real `elapsedSeconds`/`distanceMeters` from the same decode into every reading it constructs. Expected: still zero convictions across all 1,026 non-distance-goal pairs (regression floor; it cannot go red for this change — the per-clause pins above are the teeth). Add the three real NON-DISTANCE boundary pairs as named replays (step-3 recording seq 411→416 and 953→956, session-2 recording seq 776→781 — extract the actual straddling readings with the block's own decode helpers) → all `"continuation"`.
- [ ] **Step 5: Full client project green; per-file coverage on continuity.ts checked.**
- [ ] **Step 6: Self-mutation, one clause at a time** — delete each of the three `<` clauses in turn; at least one Step-1 pin must go red for EACH (record which test kills which mutant in your report); delete the suppression line → the flicker-pair test goes red. Restore, re-run green.
- [ ] **Step 7: Commit** `fix: a reset conviction takes all three axes, not one flaky reading`.

### Task 2: Wiring, riders, gates

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` (`lastTwdRef` :1146, its write :1559, `applyContinuityCheck` :465-505, call site :1609), `app/src/monitor/useMonitorSession.test.ts`, `ROADMAP.md`
- Test: `app/src/monitor/useMonitorSession.test.ts`

**Interfaces:**
- Consumes: Task 1's `ContinuityReading` (four required fields), `check` unchanged signature.
- Produces: nothing new outside the hook.

- [ ] **Step 1: Failing tests** — in `useMonitorSession.test.ts`, find the Phase LL Task-4 continuity tests (grep `continuity-reset`). Add/adjust: (a) replay the ring-phone-2 shape through the HOOK (frame stream: healthy frames to TWD 81/elapsed 56.11/distance 81.2, silence past the watchdog, then a resume frame TWD 0/elapsed 59.33/distance 83.3) → the run STAYS OPEN, no `continuity-reset` ring entry, no `completeContinuityReset`; (b) the full-reset shape (resume frame zeros on all three) → still closes as link-lost with the ring entry now naming all three axes.
- [ ] **Step 2: Verify (a) fails** (the old wiring convicts it), (b) already passes.
- [ ] **Step 3: Implement** — `lastTwdRef: number | null` becomes `lastContinuityRef: { totalWorkDistanceMeters: number; elapsedSeconds: number; distanceMeters: number } | null`; the :1559 write snapshots all three off the frame (only when `frame.totalWorkDistanceMeters !== undefined`, preserving today's null semantics); `applyContinuityCheck`'s params `lastTwd: number | null, frameTwd: number | undefined` become `last: { totalWorkDistanceMeters: number; elapsedSeconds: number; distanceMeters: number } | null` and `frame: MonitorFrame` (read the three fields off it); the ring `continuity-reset` entry logs all three axes (`twd A->B elapsed C->D distance E->F`); the call site passes `lastContinuityRef.current` and `frame`.
- [ ] **Step 4: Full client project green** (`pnpm test` both summary lines); per-file coverage on useMonitorSession.ts unchanged or better.
- [ ] **Step 5: ROADMAP riders** — (1) tick F2a's checkbox in Phase RC with "shipped, see continuity.ts + spec 2026-08-23"; (2) one line in the LL walk card's corrected-F2 bullet: "F2a defuse SHIPPED (PR <n>); F2b remains open in RC-1"; (3) add to Phase PROD's checklist: `- [ ] **app/e2e/ is not typechecked** (James, 2026-08-23 — owner assigned; previously a trap note): tsconfig.app.json covers only src/domain/scripts and Playwright erases types; a hand-rolled config over e2e/ surfaced 14 pre-existing errors when last tried. Fix the errors, wire the config into pnpm typecheck.` Also update the Release-posture cohort sentence's first arm from "F2a is merged" to cite the PR number once known (leave a `PR #` placeholder for the controller to fill at PR time — the controller does this, not you, if the number is unknown when you commit).
- [ ] **Step 6: `pnpm e2e` foreground** (src touched; expect the full 404-ish count). No screenshots (no visual change — the ring entry is text; if any capture diffs appear, investigate, do not commit).
- [ ] **Step 7: Commit** `fix: the guard reads all three axes off the wire, and the riders land`.

---

## Self-review (done at write time)

- **Spec coverage:** §2 predicate+fields → Task 1; §2 wiring → Task 2; §4 tests 1-6 → Task 1 (1,2,3-as-boundaries,4,5,6) and Task 2 (hook-level replays); §5 riders → Task 2 Step 5; §2b comment → Task 1 Step 3. Exit criteria 1-3 → Task 1; 4 → the PR itself.
- **Type consistency:** `ContinuityReading` four required fields named identically in both tasks; `check` signature unchanged everywhere.
- **No placeholders.**
- **One PR**, TRIAD, PM final gate after.
