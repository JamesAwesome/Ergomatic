# Piece Roll-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consecutive runs of identical pieces roll into one Today-card row (`9 × 1000m at +2, 1′ r`), per the spec's seven binding rules.

**Architecture:** A grouping pass at the end of `pieceList` (PieceRow gains `count`); the Today renderer prefixes `N × ` and the `+N more` row sums piece counts. Library line, detail screen, APIs untouched.

**Spec:** `docs/superpowers/specs/2026-08-11-piece-rollup-design.md` (James's consecutive-runs ruling, 2026-08-11).

## Global Constraints

- Worktree `.claude/worktrees/ostro-rollup`, branch `ostro-rollup`. `git rev-parse --show-toplevel` before every commit.
- `app/domain/**` purity + 100×4 pin on `stepDetail.ts` must hold.
- No em dashes in user-facing strings; `×` is U+00D7 (the existing idiom), `′` U+2032.
- `today-capped.png` (the pyramid) must be CONTENT-unchanged — the no-runs regression guard.
- Every behavioral test self-mutates. `pnpm test`, never bare vitest.

---

### Task 1: the rolling pass in `pieceList`

**Files:**
- Modify: `app/domain/display/stepDetail.ts` (PieceRow + a `rollRuns` pass), `app/domain/display/stepDetail.test.ts` (additions; existing row-count expectations that assumed per-piece rows will need deliberate updates — each one updated is a REVIEWED decision, note them)
- Possibly: `app/src/today/Today.tsx` compiles against the new field without change (count unused until Task 2) — verify typecheck only.

**Interfaces:**
- Produces: `PieceRow.count: number` (≥1). All other fields keep run-shared values. `pieceList` returns ROLLED rows; `peakIndex`/`workAndTotal` signatures unchanged.

- [ ] **Step 1: failing tests** (add to `stepDetail.test.ts`):

```typescript
describe("pieceList rolls consecutive identical runs (2026-08-11 spec)", () => {
  const wm = (
    meters: number,
    off: number,
    spm?: number,
    restMinutes?: number,
  ): Step => ({
    k: "w",
    duration: { kind: "distance", meters },
    ref: { base: "6k", off },
    ...(spm !== undefined ? { spm } : {}),
    ...(restMinutes !== undefined ? { restMinutes } : {}),
  });

  it("the Ostro shape: nine identical 1000m pieces roll to ONE row (trailing-rest exception)", () => {
    const steps: Step[] = [
      { k: "reps", count: 9 },
      wm(1000, 2, 26, 1),
    ];
    // NOTE: verify against the real seed — Ostro is server/seed/library/
    // at.ts:1371 (6k+2, spm 26, restMinutes 1, 1000m). If its authored
    // shape differs from this reconstruction (e.g. no reps marker, or a
    // restless final step), use the REAL steps via LIBRARY_WORKOUTS and
    // adjust nothing else.
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      count: 9,
      duration: "1000m",
      restText: "1′ r",
      spm: 26,
      off: 2,
    });
  });

  it("a rest boundary splits runs: identical pieces back-to-back then rested", () => {
    const steps: Step[] = [wm(500, 4), wm(500, 4, undefined, 1), wm(500, 4, undefined, 1)];
    // piece 1 has NO rest after it, pieces 2-3 rest 1′ — piece 1 cannot
    // join the rested run (rule 1); pieces 2+3: piece 3 is final and
    // restless? No — piece 2 rests 1′, piece 3 rests 1′ trailing. Both
    // carry 1′ → one run of 2.
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(2);
    expect(rows[0].count).toBe(1);
    expect(rows[0].restText).toBeNull();
    expect(rows[1]).toMatchObject({ count: 2, restText: "1′ r" });
  });

  it("a final piece with a DIFFERENT trailing rest does not join", () => {
    const steps: Step[] = [wm(500, 4, undefined, 1), wm(500, 4, undefined, 3)];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(2);
    expect(rows[1].restText).toBe("3′ r");
  });

  it("lead + repeated block: 2:00 then 3 × 5:00 gives two rows", () => {
    const steps: Step[] = [
      w(2, 6, 22, 2),
      { k: "reps", count: 3 },
      w(5, 6, 22, 2),
    ];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ count: 1, duration: "2:00" });
    expect(rows[1]).toMatchObject({ count: 3, duration: "5:00" });
  });

  it("a pyramid has no runs: seven rows, all count 1", () => {
    const rows = pieceList(
      [w(2, 6, 22, 2), w(4, 4, 24, 2), w(6, 2, 26, 2), w(8, 0, 28, 2), w(6, 2, 26, 2), w(4, 4, 24, 2), w(2, 6, 22)],
      B,
    );
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.count === 1)).toBe(true);
  });

  it("an effort run rolls; an spm mismatch splits", () => {
    const eff = (min: number, spm?: number): Step => ({
      k: "w",
      duration: { kind: "time", minutes: min },
      ref: { effort: "max" },
      ...(spm !== undefined ? { spm } : {}),
      restMinutes: 1,
    });
    expect(pieceList([eff(0.75), eff(0.75), eff(0.75)], B)).toHaveLength(1);
    expect(pieceList([eff(0.75, 28), eff(0.75, 30)], B)).toHaveLength(2);
  });

  it("test rows never roll, even when identical", () => {
    const steps: Step[] = [
      { k: "test", label: "All out" },
      { k: "test", label: "All out" },
    ];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.count === 1)).toBe(true);
  });

  it("peak can land on a rolled row", () => {
    const steps: Step[] = [
      w(2, 6, 22, 2),
      { k: "reps", count: 3 },
      w(5, 0, 26, 2),
    ];
    const rows = pieceList(steps, B);
    expect(peakIndex(rows, 4)).toBe(1); // the rolled 3×5:00 at offset 0
  });
});
```

Plus: audit EXISTING tests whose row-count expectations change under
rolling (the reps-expansion test `3 × 5:00` now expects ONE row with
count 3 — update it to assert the rolled shape deliberately; the
uniform-pieces workAndTotal case is arithmetic-only and survives).
List every updated expectation in your report — each is a reviewed
spec-amendment consequence, not a convenience edit.

- [ ] **Step 2: run, verify the new tests fail** (`pnpm test --project unit`).

- [ ] **Step 3: implement.** In `stepDetail.ts`: add `count: number` to `PieceRow`; every existing row constructor sets `count: 1`; append the grouping pass before `pieceList` returns:

```typescript
/** Rolls consecutive identical rows into one (2026-08-11 spec, James's
 *  consecutive-runs ruling). Identity: duration, ref rendering, effort,
 *  spm, split, off, AND rest all equal — a rest boundary breaks a run.
 *  The workout's FINAL row may join the run before it when it differs
 *  only by carrying no trailing rest (rule 2); the rolled row keeps the
 *  run's inter-piece rest. Test rows (no split, no effort) never roll
 *  (rule 3). */
function rollRuns(rows: PieceRow[]): PieceRow[] {
  const out: PieceRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prev = out[out.length - 1];
    if (prev !== undefined && joinsRun(prev, row, i === rows.length - 1)) {
      prev.count += 1;
      continue;
    }
    out.push({ ...row });
  }
  return out;
}

function joinsRun(prev: PieceRow, row: PieceRow, isFinal: boolean): boolean {
  const isWork = row.split !== null || row.effortText !== null;
  if (!isWork) return false; // test rows stay single
  const sameCore =
    prev.duration === row.duration &&
    prev.refTextFull === row.refTextFull &&
    prev.effortText === row.effortText &&
    prev.spm === row.spm &&
    prev.split === row.split &&
    prev.off === row.off;
  if (!sameCore) return false;
  if (prev.restText === row.restText) return true;
  return isFinal && row.restText === null && prev.restText !== null;
}
```

(Exact wiring is the implementer's; the identity fields and the two
rest clauses are binding. `prev.count += 1` mutating the copied row is
fine — `out` holds copies.)

- [ ] **Step 4: green**, whole unit project + the 100×4 pin re-read from the HTML report.
- [ ] **Step 5: self-mutations** (minimum): drop the `isFinal` clause → the Ostro test fails; compare only duration in `joinsRun` (ignore rest) → the rest-boundary test fails; let test rows roll → the test-rows test fails; skip the pass entirely → every roll test fails, the pyramid test still passes (proving it asserts something).
- [ ] **Step 6: gates + commit** (`feat: pieceList rolls consecutive identical runs`).

---

### Task 2: the renderer, the more-row arithmetic, and the visual record

**Files:**
- Modify: `app/src/today/Today.tsx` (duration prefix; `+N more` sums; sub-line tokens)
- Test: `app/src/today/Today.test.tsx` additions, `app/e2e/today.spec.ts` (adjust the existing piece-region test if its 7-piece custom workout was uniform — read it first), `app/e2e/screenshots.spec.ts` (new `today-rolled` capture)

**Behavior contract (binding):**
1. A rolled row renders `9 × 1000m` in the duration slot (both row forms); everything else reads from the run's shared fields. The `×` is U+00D7 with single spaces, exactly like the Library line's idiom.
2. `+N more pieces` counts PIECES: `N = sum of rows.slice(cap).map(r => r.count)`. Its sub-line lists unseen ROW tokens — `3 × 5:00` for a rolled row, `6:00` for a single — first three rows then `…`.
3. The `· N PIECES` foot suffix appears only when the ROW list is capped, and still names total pieces (sum of all counts — which equals the phases-derived count it names today; assert they agree in a test rather than picking one silently).
4. The Ostro card (real seed via fixtures) renders exactly one piece row reading `9 × 1000m at +2, 1′ r` with the split and `26` SPM, no more-row, no PIECES suffix.
5. The pyramid card (the existing 7-piece e2e/screenshot subject) is unchanged in every assertion.

- [ ] **Step 1: failing client tests** for the contract (real fixtures: Ostro itself via `fromWorkout`/`LIBRARY_WORKOUTS`; the pyramid; a mixed lead+block set for more-row arithmetic — build it long enough to cap).
- [ ] **Step 2: red. Step 3: implement. Step 4: green** (unit+client).
- [ ] **Step 5: e2e + screenshots.** Read the existing "piece region" e2e test first — if its custom 7-piece workout contains identical runs it now rolls and the test's row expectations change; prefer adjusting the WORKOUT (make it a pyramid) over weakening assertions, and say which you did. Add `today-rolled.png`: seed/pick Ostro deterministically (the filter-narrowing idiom), capture the one-row card, open and describe it. Recapture `today-capped.png` and verify CONTENT-unchanged (the pyramid guard); revert byte-noise. Full `pnpm e2e` + `pnpm screenshots`.
- [ ] **Step 6: self-mutations** (minimum): drop the `N × ` prefix → the Ostro client test fails; sum rows instead of counts in the more-row → the arithmetic test fails.
- [ ] **Step 7: full gates for app/src product code. Step 8: commit** (`feat: Today rolls repeated sets into one row`).
