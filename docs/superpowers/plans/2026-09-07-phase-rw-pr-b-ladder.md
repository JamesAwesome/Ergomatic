# Phase RW PR B — The ladder and unblocking: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every workout is rowable with no baseline set: where a split would appear the rower reads STEADY · MODERATE · HARD · ALL OUT, derived from the step's own pace ref; Start, Connect and Log it after all enable; `EASY` is retired as a work word.

**Architecture:** One pure function, `intensityWord(ref)`, maps any pace ref to one of four words by 2k-equivalent threshold. `phases(steps, null)` stops throwing and emits, for a split ref, the effort-kind phase shape plus the ref, so the Timer, the PM5 compiler and the judge need no branch. Three consumers do branch and are rewritten (the log seed at all three doors, `pieceList`, the Builder's split slot). Every no-baseline gate on Start, Connect, Log and the Countdown redirect goes. No stored shape changes: a log row records the word as its label, which is what effort rows already do.

**Tech Stack:** TypeScript, React 19, Vitest (`unit`, `client`), Playwright (`pnpm e2e`, `pnpm screenshots`).

**Spec:** `docs/superpowers/specs/2026-09-06-row-without-baselines-design.md` §1.1, §1.2, §2 (all of it), §5, §7, §9. Gate 0 approved 2026-09-07 as rendered (`docs/design/rw-gate0/`): the portrait Timer word at 40px, notation kept on the left slot, the log stores the word, thresholds stand.

## Global Constraints

- `app/domain/` imports no framework and no `node:` module. The seeded-library census test lives under `domain/` but imports only `../server/seed/library/index.js`'s data (the existing `archetype.test.ts` idiom) — check that file for the import path it uses and copy it.
- No em-dashes in user-facing strings. Copy is Gate 0's: detail caption `Targets are words until you set a baseline. Set one up`; reset confirm line `This clears both baseline splits. Workouts show effort words in place of pace targets until you set a baseline again. Today offers the setup doors.`
- The ladder is the truth about pace: one scalar, one word. No base-aware or type-aware branch (James, 2026-09-06).
- `off` on a `PieceRow` is the RAW `ref.off`, never the 2k-equivalent (spec §1.2, lens 2 F6).
- The log label for a split ref rowed with no baseline is the WORD form, `5:00 @ MODERATE`, at all three doors (James, 2026-09-06). The stored `LogStep` shape is unchanged.
- Tests pin independent literals (RF21). Every new assertion has a stated mutation. **Confirm every commit LANDED (`git log -1`) before running any probe: a hook-blocked commit leaves the file dirty and the probe's revert eats the edit (PR A, Task 5).**
- Run `git rev-parse --show-toplevel` before every commit; it must print `/Users/james/projects/github/jamesawesome/Ergomatic-wt-rw`.
- Single-file test runs: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project <unit|client> <file>` from `app/`.
- Gates on this PR: PM final gate (a split becomes a word), the two-stage branch review, `pnpm e2e`, `pnpm screenshots`. No antagonist delta (the anchor pass's §9 is the vetted ground; the plan invents nothing), no walk (§5).

---

### Task 0: The owed CLAUDE.md sentence

**Files:**
- Modify: `CLAUDE.md`, recurring failure 22 (the paragraph beginning `**`git checkout -- <file>` to revert a mutation probe`)

- [ ] **Step 1:** After the sentence `**commit the real change BEFORE running any mutation probe**, so every probe's revert is a no-op against a clean file, and the probe can never take anything with it.` insert:

```
**And confirm the commit LANDED before the probe (`git log -1`): on
2026-09-07 (Phase RW PR A, Task 5) the commit was blocked by the
pre-commit typecheck, the file stayed dirty, and the probe's
`git checkout --` erased forty lines of the real change** — the exact
class this entry exists for, one step later in the sequence.
```
Hand-wrap to the surrounding width; never Prettier on root markdown.

- [ ] **Step 2: Commit** `git add CLAUDE.md && git commit -m "CLAUDE.md RF22: confirm the commit landed before a probe (PR A, Task 5)"`.

---

### Task 1: The ladder

**Files:**
- Modify: `app/domain/pace.ts` (after `ASSUMED_BASELINES`)
- Test: `app/domain/pace.test.ts` (append)
- Create: `app/domain/intensityCensus.test.ts`

**Interfaces:**
- Produces: `export type IntensityWord = "STEADY" | "MODERATE" | "HARD" | "ALL OUT"`; `export const INTENSITY_ALL_OUT_MAX = -3`, `INTENSITY_HARD_MAX = 4`, `INTENSITY_MODERATE_MAX = 12` (2k-equivalent seconds, inclusive upper bounds); `export function intensityWord(ref: PaceRef): IntensityWord`; `export function intensityWordSpoken(word: IntensityWord): "steady" | "moderate" | "hard" | "all out"`; `paceWordLabel(effort): "ALL OUT" | "STEADY"`; `paceWordFromLabel(word: "ALL OUT" | "STEADY"): PaceWord`; `paceWordSpoken(effort): "at max effort" | "steady"`.

- [ ] **Step 1: Failing tests.** Append to `pace.test.ts` (add `intensityWord`, `intensityWordSpoken` to its `./pace.js` import):

```ts
describe("intensityWord (Phase RW PR B, spec §1.1)", () => {
  // Every boundary as a literal on BOTH sides, never the exported constant.
  it.each([
    [{ base: "2k", off: -4 }, "ALL OUT"],
    [{ base: "2k", off: -3 }, "ALL OUT"],
    [{ base: "2k", off: -2 }, "HARD"],
    [{ base: "2k", off: 4 }, "HARD"],
    [{ base: "2k", off: 5 }, "MODERATE"],
    [{ base: "2k", off: 12 }, "MODERATE"],
    [{ base: "2k", off: 13 }, "STEADY"],
    [{ base: "2k", off: 30 }, "STEADY"],
    // 6k refs sit 7 s slower than the 2k (deriveBaseline's constant):
    // 6k-4 is 2k+3 (HARD), 6k-3 is 2k+4 (HARD), 6k-2 is 2k+5 (MODERATE),
    // 6k+5 is 2k+12 (MODERATE), 6k+6 is 2k+13 (STEADY).
    [{ base: "6k", off: -10 }, "ALL OUT"],
    [{ base: "6k", off: -4 }, "HARD"],
    [{ base: "6k", off: -3 }, "HARD"],
    [{ base: "6k", off: -2 }, "MODERATE"],
    [{ base: "6k", off: 5 }, "MODERATE"],
    [{ base: "6k", off: 6 }, "STEADY"],
    [{ base: "6k", off: 15 }, "STEADY"],
    [{ effort: "max" }, "ALL OUT"],
    [{ effort: "min" }, "STEADY"],
  ] as const)("%j reads %s", (ref, word) => {
    expect(intensityWord(ref)).toBe(word);
  });

  it("the same pace reads the same word whichever base wrote it (2k+6 is 6k-1)", () => {
    expect(intensityWord({ base: "2k", off: 6 })).toBe(
      intensityWord({ base: "6k", off: -1 }),
    );
  });

  it("speaks each word in lower case, 'all out' with the space", () => {
    expect(intensityWordSpoken("ALL OUT")).toBe("all out");
    expect(intensityWordSpoken("MODERATE")).toBe("moderate");
  });
});

describe("pace words retire EASY (Phase RW PR B)", () => {
  it("MIN renders STEADY and round-trips", () => {
    expect(paceWordLabel("min")).toBe("STEADY");
    expect(paceWordFromLabel("STEADY")).toBe("min");
    expect(paceWordSpoken("min")).toBe("steady");
  });
});
```
Also change every `"EASY"` literal already in `pace.test.ts` to `"STEADY"` and every `"easy"` expectation to `"steady"`.

Create `domain/intensityCensus.test.ts` (copy `archetype.test.ts`'s import of the seeded library):

```ts
import { describe, expect, it } from "vitest";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import { intensityWord, isPaceWordRef } from "./pace.js";
import { phases } from "./expand.js";
import type { IntensityWord } from "./pace.js";

/** Spec §1.1's accepted cost, pinned so a seed edit that moves a word is
 *  seen (and the counts James decided on stay the counts). */
const RANK: Record<IntensityWord, number> = {
  STEADY: 0,
  MODERATE: 1,
  HARD: 2,
  "ALL OUT": 3,
};

function words(w: { steps: Parameters<typeof phases>[0] }): IntensityWord[] {
  return phases(w.steps, null)
    .filter((p) => p.type === "work" && p.ref !== undefined)
    .map((p) => intensityWord(p.ref!));
}

describe("the ladder over the seeded library", () => {
  it("never inverts a build: a strictly faster ref never reads an easier word", () => {
    for (const w of LIBRARY_WORKOUTS) {
      const ps = phases(w.steps, null).filter(
        (p) => p.type === "work" && p.ref !== undefined && !isPaceWordRef(p.ref!),
      );
      for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1]!.ref as { base: "2k" | "6k"; off: number };
        const b = ps[i]!.ref as { base: "2k" | "6k"; off: number };
        const eq = (r: typeof a) => (r.base === "2k" ? r.off : r.off + 7);
        if (eq(b) < eq(a)) {
          expect(RANK[intensityWord(b)]).toBeGreaterThanOrEqual(
            RANK[intensityWord(a)],
          );
        }
      }
    }
  });

  it("reads one word on every rung of exactly the 76 multi-ref workouts the spec accepts", () => {
    const collapsed = LIBRARY_WORKOUTS.filter((w) => {
      const refs = new Set(
        w.steps
          .filter((s) => s.k === "w" && !isPaceWordRef(s.ref))
          .map((s) => JSON.stringify(s.ref)),
      );
      return refs.size >= 2 && new Set(words(w)).size === 1;
    });
    expect(collapsed).toHaveLength(76);
  });

  it("contradicts its own type badge on every step in exactly the nine named workouts", () => {
    const BADGE: Record<string, IntensityWord> = {
      AN: "ALL OUT",
      TR: "HARD",
      AT: "MODERATE",
      O2: "STEADY",
    };
    const contradict = LIBRARY_WORKOUTS.filter((w) => {
      const ws = words(w);
      return ws.length > 0 && ws.every((x) => x !== BADGE[w.type]);
    })
      .map((w) => w.title)
      .sort();
    expect(contradict).toStrictEqual(
      [
        "Beam Sea",
        "Bora",
        "Canary Current",
        "Crepuscular Rays",
        "Grec",
        "Moderate Breeze",
        "Polar Blast",
        "Roaring Forties",
        "Warm Sector",
      ].sort(),
    );
  });
});
```
(The census test depends on Task 2's `phases(steps, null)`; write it now, expect it to throw until Task 2, and note that in Step 2.)

- [ ] **Step 2: Run red.** `pace.test.ts` fails on `intensityWord` not exported; the census fails on `phases` throwing. Check both summary lines.

- [ ] **Step 3: Implement** in `domain/pace.ts`, directly after `ASSUMED_BASELINES`:

```ts
import { K2_K6_OFFSET_SECONDS } from "./deriveBaseline.js";

/** Phase RW (spec §1.1): the four-word ladder a split ref reads as when
 *  the rower has no baseline. One scalar, one word: a ref is expressed in
 *  2k-equivalent seconds (a 6k ref sits K2_K6_OFFSET_SECONDS slower) and
 *  bucketed on these inclusive upper bounds. Never base- or type-aware
 *  (James, 2026-09-06): 2k+6 and 6k-1 are the same pace and read the same
 *  word. The thresholds are exported so a test can name them, and pinned
 *  by independent literals in pace.test.ts. */
export type IntensityWord = "STEADY" | "MODERATE" | "HARD" | "ALL OUT";
export const INTENSITY_ALL_OUT_MAX = -3;
export const INTENSITY_HARD_MAX = 4;
export const INTENSITY_MODERATE_MAX = 12;

export function intensityWord(ref: PaceRef): IntensityWord {
  if (isPaceWordRef(ref)) return ref.effort === "max" ? "ALL OUT" : "STEADY";
  const eq = ref.base === "2k" ? ref.off : ref.off + K2_K6_OFFSET_SECONDS;
  if (eq <= INTENSITY_ALL_OUT_MAX) return "ALL OUT";
  if (eq <= INTENSITY_HARD_MAX) return "HARD";
  if (eq <= INTENSITY_MODERATE_MAX) return "MODERATE";
  return "STEADY";
}

/** The spoken form for an accessible name ("5 minutes moderate"). */
export function intensityWordSpoken(
  word: IntensityWord,
): "steady" | "moderate" | "hard" | "all out" {
  return word === "ALL OUT"
    ? "all out"
    : (word.toLowerCase() as "steady" | "moderate" | "hard");
}
```
Then in the same file: `paceWordLabel` returns `"ALL OUT" | "STEADY"` (`min` → `"STEADY"`); `paceWordFromLabel(word: "ALL OUT" | "STEADY")`; `paceWordSpoken` returns `"at max effort" | "steady"`. Rewrite the three doc comments that say EASY. Move the `K2_K6_OFFSET_SECONDS` import up with the other imports.

- [ ] **Step 4: Run** `pace.test.ts` green; `pnpm typecheck` will list every `"EASY"` cast (`logDraft.ts` ×2, tests): fix the two casts in `logDraft.ts` to `"ALL OUT" | "STEADY"` NOW (Task 4 rewrites those branches anyway) and any test literal.

- [ ] **Step 5: Commit** `git add app/domain/pace.ts app/domain/pace.test.ts app/domain/intensityCensus.test.ts app/src/session/logDraft.ts && git commit -m "Phase RW PR B: the four-word ladder (intensityWord); EASY becomes STEADY"`. Probes (after `git log -1` shows the commit): `INTENSITY_HARD_MAX = 5` → the `2k+5 → MODERATE` row fails; `+ K2_K6_OFFSET_SECONDS` → `- K2_K6_OFFSET_SECONDS` → the `6k` rows and the same-pace test fail.

---

### Task 2: `phases(steps, null)` and the compiler proof

**Files:**
- Modify: `app/domain/expand.ts` (the `Phase.ref` doc comment, lines ~22-30; the split branch of `case "w"`, lines ~170-200)
- Modify: `app/domain/needsBaselines.ts` (header comment)
- Modify: `app/domain/monitor/program.ts` (the three EASY comments: `:61`, `:293`, `:469`, wording only)
- Test: `app/domain/expand.test.ts`, `app/domain/monitor/program.test.ts`

**Interfaces:**
- Produces: for a split-ref work step under `null` baselines, `phases()` yields `{ type: "work", targetKind: "effort", label: intensityWord(ref), ref, spm, set, originalStepIndex, seconds | meters }` with NO `targetSplit`. Rest emission unchanged.

- [ ] **Step 1: Failing tests.** In `expand.test.ts`, replace the test `throws for a split-ref workout under null baselines` (if it still exists after PR A) and add:

```ts
describe("phases with null baselines (Phase RW PR B, spec §1.2)", () => {
  const splitStep: Step = {
    k: "w",
    duration: { kind: "time", minutes: 5 },
    ref: { base: "2k", off: 6 },
    spm: 24,
    restMinutes: 1.5,
  };

  it("emits an effort-kind phase carrying the ref and the word, no targetSplit", () => {
    const [work, rest] = phases([splitStep], null);
    expect(work).toStrictEqual({
      type: "work",
      targetKind: "effort",
      label: "MODERATE",
      ref: { base: "2k", off: 6 },
      spm: 24,
      seconds: 300,
      originalStepIndex: 0,
    });
    expect(rest).toMatchObject({ type: "rest", seconds: 90, label: "Rest" });
  });

  it("carries meters for a distance step and still no targetSplit", () => {
    const [work] = phases(
      [{ k: "w", duration: { kind: "distance", meters: 2000 }, ref: { base: "6k", off: 10 } }],
      null,
    );
    expect(work).toMatchObject({ targetKind: "effort", label: "STEADY", meters: 2000 });
    expect(work).not.toHaveProperty("targetSplit");
  });

  it("is unchanged with real baselines: split kind, number, ref", () => {
    const [work] = phases([splitStep], { k2Seconds: 112, k6Seconds: 122 });
    expect(work).toMatchObject({ targetKind: "split", targetSplit: 118, label: "1:58.0" });
  });
});
```
In `program.test.ts`, beside the existing effort-phase compile test:

```ts
it("programs no pace target for a split ref rowed with no baseline (Phase RW PR B)", () => {
  const ps = phases(
    [
      { k: "w", duration: { kind: "time", minutes: 5 }, ref: { base: "2k", off: 2 } },
      { k: "w", duration: { kind: "distance", meters: 1000 }, ref: { base: "6k", off: 8 } },
    ],
    null,
  );
  const compiled = compileProgram(ps);
  if ("code" in compiled) throw new Error(compiled.message);
  for (const interval of compiled.intervals) {
    expect(interval.targetSplit).toBeNull();
  }
});
```
(Read `program.test.ts`'s existing effort test for the exact field name of the compiled interval's pace target and the `WorkoutProgram` shape; use that name.)

- [ ] **Step 2: Run red** (`phases` throws).

- [ ] **Step 3: Implement.** In `expand.ts` `case "w"`, replace the `if (baselines === null) { throw … }` block inside the split branch with:

```ts
          if (baselines === null) {
            // Phase RW PR B (spec §1.2): a split ref with no baseline is
            // rowed to a WORD. The phase takes the effort-kind shape the
            // Timer, the PM5 compiler and the judge already handle (no
            // targetSplit, so nothing is programmed or judged) and keeps
            // its ref so the log and the piece list can say which ref the
            // word stood for.
            base = {
              type: "work",
              targetKind: "effort",
              label: intensityWord(s.ref),
              ref: s.ref,
              spm: s.spm,
              set,
              originalStepIndex,
            };
          } else {
            const split = resolveSplit(baselines, s.ref);
            base = { …the existing split object… };
          }
```
restructured so the duration/rest tail below runs for both. Import `intensityWord` from `./pace.js`. Rewrite the `Phase.ref` doc comment: `ref` is set for a split-kind phase AND for an effort-kind phase that stands in for a split ref with no baseline (Phase RW); a true `max`/`min` phase has none. Rewrite `needsBaselines.ts`'s header: no longer a gate; the predicate for "this workout has numbers waiting behind a baseline", used by the detail caption. Reword the three `program.ts` comments (`"ALL OUT"/"EASY"` → `"ALL OUT"/"STEADY"` and the words the ladder adds).

- [ ] **Step 4: Run** `expand.test.ts`, `program.test.ts`, `intensityCensus.test.ts` (now green: 76 and the nine), then `pnpm typecheck`.

- [ ] **Step 5: Commit** `… -m "Phase RW PR B: phases(steps, null) rows a split ref to a word; the compiler programs no target for it"`. Probes: emit `targetKind: "split"` with `targetSplit: 0` in the null branch → the compiler test fails on a non-null target and the shape test fails; drop `ref: s.ref` → the shape test fails.

---

### Task 3: `pieceList` and `workAndTotal` without baselines

**Files:**
- Modify: `app/domain/display/stepDetail.ts` (`pieceList` signature and effort branch, `workAndTotal` signature)
- Test: `app/domain/display/stepDetail.test.ts`

- [ ] **Step 1: Failing tests** (use the file's own seeded-workout lookup if it has one; else `LIBRARY_WORKOUTS.find((w) => w.title === …)`):

```ts
describe("pieceList without a baseline (Phase RW PR B)", () => {
  const B = { k2Seconds: 112, k6Seconds: 122 };
  it("keeps every row and the peak of a six-rung ladder (Tehuantepecer), swapping the split for the word", () => {
    const w = seeded("Tehuantepecer");
    const withB = pieceList(w.steps, B);
    const without = pieceList(w.steps, null);
    expect(without).toHaveLength(withB.length);
    expect(peakIndex(without, 8)).toBe(peakIndex(withB, 8));
    expect(without.every((r) => r.split === null)).toBe(true);
    expect(without.map((r) => r.paceWordText)).toStrictEqual(
      withB.map(() => "HARD"),
    );
    expect(without.map((r) => r.off)).toStrictEqual(withB.map((r) => r.off));
    expect(without[0]!.refTextFull).toBe(withB[0]!.refTextFull);
  });

  it("keeps a 6k pyramid's peak where the baseline view has it (Squall Line, raw off)", () => {
    const w = seeded("Squall Line");
    expect(peakIndex(pieceList(w.steps, null), 8)).toBe(
      peakIndex(pieceList(w.steps, B), 8),
    );
    expect(peakIndex(pieceList(w.steps, null), 8)).toBe(1);
  });

  it("workAndTotal prices through estimateMinutes with null", () => {
    const w = seeded("Laminar");
    expect(workAndTotal(w.steps, null).totalMinutes).toBe(16);
  });
});
```
(`PIECE_CAP` in Today is 8; if `peakIndex`'s second argument is named differently, use the file's own.)

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement.** `pieceList(steps, baselines: Baselines | null)`; in the `targetKind === "effort"` branch:

```ts
      // Phase RW PR B: an effort-kind phase that stands in for a split
      // ref (null baselines) keeps the notation (James: the left slot
      // keeps it) and its RAW off, so joinsRun/peakIndex roll and rank
      // rows exactly as the baseline view does; only the split text is
      // the word. A true max/min phase has no ref and behaves as before.
      const sref = p.ref !== undefined && !isPaceWordRef(p.ref) ? p.ref : null;
      rows.push({
        duration,
        refTextFull:
          sref === null
            ? null
            : sref.off === 0
              ? `at ${sref.base} pace`
              : `at ${sref.base} ${fmtOff(sref.off)}`,
        paceWordText: p.label.toUpperCase(),
        restText: null,
        split: null,
        spm: p.spm ?? null,
        off: sref === null ? null : sref.off,
        count: 1,
      });
```
`workAndTotal(steps, baselines: Baselines | null)`. Import `isPaceWordRef`.

- [ ] **Step 4: Run** the file, `pnpm typecheck`.

- [ ] **Step 5: Commit** `… -m "Phase RW PR B: pieceList keeps rows, notation and raw off under null baselines; the split text is the word"`. Probes: `off: sref === null ? null : sref.off + 7` → Squall Line's peak moves to 3; `off: null` → Tehuantepecer's row count drops.

---

### Task 4: The log label at all three doors

**Files:**
- Modify: `app/src/session/logDraft.ts` (`buildLogSteps` preferred + fallback paths, `buildLogSeed`, `buildManualLogSteps`; the RF18 comment)
- Test: `app/src/session/logDraft.test.ts`

- [ ] **Step 1: Failing tests** (use the file's own fixtures for a run/draft; the shape is: a workout with one `5:00 @ 2k+6` step, `buildRun(draft, null, now)`):

```ts
describe("a split ref rowed with no baseline logs the WORD at every door (Phase RW PR B)", () => {
  const step: Step = { k: "w", duration: { kind: "time", minutes: 5 }, ref: { base: "2k", off: 6 } };
  it("timer door, matched draft: 5:00 @ MODERATE, no targetSplit", () => {
    const draft = buildDraft({ id: "w", title: "T", type: "TR", steps: [step] });
    const run = buildRun(draft, null, new Date("2026-09-07T10:00:00Z"));
    const [s] = buildLogSteps(run, draft);
    expect(s).toStrictEqual({ label: "5:00 @ MODERATE" });
  });
  it("timer door, no draft (fallback): the same label", () => {
    const draft = buildDraft({ id: "w", title: "T", type: "TR", steps: [step] });
    const run = buildRun(draft, null, new Date("2026-09-07T10:00:00Z"));
    expect(buildLogSteps(run, null)[0]!.label).toBe("5:00 @ MODERATE");
  });
  it("connected door: 5:00 @ MODERATE and no pace recorded", () => {
    const draft = buildDraft({ id: "w", title: "T", type: "TR", steps: [step] });
    const run = buildRun(draft, null, new Date("2026-09-07T10:00:00Z"));
    const seed = buildLogSeed(run.phases, null);
    expect(seed.steps[0]!.label).toBe("5:00 @ MODERATE");
    expect(seed.paces).toStrictEqual({});
  });
  it("manual door: 5:00 @ MODERATE, no targetSplit, no actualSplit, no throw", () => {
    expect(buildManualLogSteps({ steps: [step] }, null)).toStrictEqual([
      { label: "5:00 @ MODERATE" },
    ]);
  });
  it("a true MIN step still logs its chip word at every door", () => {
    const min: Step = { k: "w", duration: { kind: "time", minutes: 5 }, ref: { effort: "min" } };
    expect(buildManualLogSteps({ steps: [min] }, null)[0]!.label).toBe("5:00 @ MIN");
  });
  it("with a baseline the timer door still logs the ref and the number", () => {
    const draft = buildDraft({ id: "w", title: "T", type: "TR", steps: [step] });
    const run = buildRun(draft, { k2Seconds: 112, k6Seconds: 122 }, new Date("2026-09-07T10:00:00Z"));
    expect(buildLogSteps(run, draft)[0]!.label).toBe("5:00 @ 2k +6");
  });
});
```
(Read the existing tests for how `buildDraft`/`buildRun` are imported and how `refPaceLabel` formats `2k +6`; match the exact literal they produce today with a baseline.)

- [ ] **Step 2: Run red** (the first four fail: `MIN`, `2k +6`, a throw).

- [ ] **Step 3: Implement.** In `buildLogSteps`, before `if (draftStep !== undefined)`:

```ts
    if (phase.targetKind === "effort" && phase.ref !== undefined) {
      // Phase RW PR B (James, 2026-09-06): a split ref rowed with no
      // baseline logs the WORD the rower read, at every door, never the
      // ref (they never saw a number) and never MIN (the effort arm below
      // would map any word but ALL OUT to it).
      label = `${durationText(phase)} @ ${phase.label}`;
    } else if (draftStep !== undefined) {
```
Same guard first in `buildLogSeed`'s loop. In `buildManualLogSteps`: when `!isPaceWord && baselines === null`, push `{ label: `${durationLabel} @ ${intensityWord(step.ref)}` }` and `continue` before the `resolveSplit` block. Rewrite the RF18 comment ("the cast is safe: this branch only runs when targetKind === effort …") to name the new first branch, and `buildLogSeed`'s doc comment (the "throws loudly" paragraph goes). Delete the throw at the bottom of `buildLogSeed`'s split branch if it still exists. Import `intensityWord`.

- [ ] **Step 4: Run** the file and `pnpm typecheck`.

- [ ] **Step 5: Commit** `… -m "Phase RW PR B: a split ref rowed with no baseline logs the word at all three doors"`. Probes: move the new guard below the `isPaceWord` branch → the connected-door test fails on `MIN`; in `buildLogSteps` delete the guard → the matched-draft test fails on `2k +6`.

---

### Task 5: The surfaces

**Files:**
- Modify: `app/src/workout/StepRow.tsx` (right slot, spoken form; drop the `Link` import if unused)
- Modify: `app/src/workout/WorkoutDetail.tsx` (`startBlocked`, the Connect guard at ~300-309, the Log link ternary at ~617-630, `.step-row-no-target` at ~559; add the caption)
- Modify: `app/src/session/Countdown.tsx` (`blocksWithoutBaselines` and its two consumers)
- Modify: `app/src/session/LogSession.tsx` (the block at ~1902-1912; `ManualDoorLog`'s own gate)
- Modify: `app/src/builder/Builder.tsx` (`splitLabelFor`)
- Modify: `app/src/you/ResetBaselineSetup.tsx` (the confirm line)
- Modify: `app/src/session/TimerTargets.tsx` (the word modifier class)
- Modify: `app/src/index.css` (`.timer-card-value-word`; add `.workout-detail-caption`; delete `.step-row-no-target` and its two sub-rules once no renderer is left, RF5)
- Modify: `docs/design/DEVIATIONS.md` rows 62 (Start no longer blocks) and 55 (the "Set baselines" link idiom is gone from StepRow)
- Test: `StepRow.test.tsx`, `WorkoutDetail.test.tsx`, `Countdown.test.tsx`, `LogSession.test.tsx`, `Builder.test.tsx`, `ResetBaselineSetup.test.tsx`, `TimerTargets`/`Timer.test.tsx`

- [ ] **Step 1: Failing tests**, one per surface; the assertion each pins:
  - `StepRow`: a `5:00 @ 2k+6` step with `baselines={null}` renders `.step-row-range` reading `MODERATE`, the left label still `5:00 @ 2k +6`, accessible name `5 minutes at 2k +6, moderate`; the `EASY` pins in the file become `STEADY` / "30 seconds steady".
  - `WorkoutDetail`: with `NO_BASELINES` and a split-ref workout, `Start Timer` is enabled, `Connect` proceeds (no `Set your baselines first` error), `Log it after` is a link, the caption `Targets are words until you set a baseline.` renders with a `Set one up` link to `/today`; an effort-only workout renders no caption; with baselines set no caption. Mutation for each: re-add the gate.
  - `Countdown`: with `null` baselines and a split-ref draft, no redirect to `/today`; the run builds; the label shows `MODERATE`.
  - `LogSession`: the manual door with `null` baselines and a split-ref workout renders the form (no `no target` block) and saves a step labelled `5:00 @ MODERATE`.
  - `Builder`: a collapsed `2000 m @ 2k` row with `null` baselines shows `HARD` in the split slot.
  - `ResetBaselineSetup`: the armed confirm reads the new sentence verbatim.
  - `TimerTargets`: an effort-kind phase's value span carries `timer-card-value-word`; a split-kind one does not. The CSS pin (`Timer.test.tsx`'s rule-body idiom): `.timer-card-value-word` is `40px` and the landscape media block restores `--size-subhero`.

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement.**
  - `StepRow.tsx`: replace the `: baselines ? (…) : (<span className="step-row-no-target">…)` tail with one `<span className="step-row-range">{baselines ? fmtSplit(resolveSplit(baselines, step.ref, nudge)) : intensityWord(step.ref)}</span>`; `leftSpoken` for a split ref with null baselines is `` `${durationSpoken} at ${pace}, ${intensityWordSpoken(intensityWord(step.ref))}` ``.
  - `WorkoutDetail.tsx`: delete the Connect guard block and its `setConnectError("Set your baselines first…")`; `startBlocked` and the `no target` span go (find every reader of `startBlocked`: the disabled prop and the caption); the Log link renders unconditionally; after the actions, `{baselines === null && needsBaselines(workout.steps) && (<p className="workout-detail-caption">Targets are words until you set a baseline. <Link to="/today">Set one up</Link></p>)}`.
  - `Countdown.tsx`: delete `blocksWithoutBaselines`, its `Navigate` arm and its build-effect gate; `buildRun(draft, baselines, …)` with `baselines` possibly null already works after Task 2.
  - `LogSession.tsx`: delete the `no target` block; `ManualDoorLog` passes `baselines` (possibly null) straight through.
  - `Builder.tsx` `splitLabelFor`: `if (baselines === null) return intensityWord(ref);` after building `ref`.
  - `ResetBaselineSetup.tsx`: the sentence from Global Constraints.
  - `TimerTargets.tsx`: `className={phase.targetKind === "effort" ? "timer-card-value timer-card-value-word" : "timer-card-value"}` on the TARGET SPLIT value.
  - `index.css`: after `.timer-card-value`:
    ```css
    /* Phase RW PR B (Gate 0, docs/design/rw-gate0/timer-measure.json): a
       word in the TARGET SPLIT card is up to eight characters against the
       digits' seven, and at the subhero size the portrait card grid
       overflowed (370px of content in a 350px track, FREE clipped). The
       word renders one size down in portrait; landscape measured 310 of
       310 at the subhero size and keeps it. */
    .timer-card-value-word {
      font-size: 40px;
    }
    @media (orientation: landscape) {
      .timer-card-value-word {
        font-size: var(--size-subhero);
      }
    }
    .workout-detail-caption {
      margin: 12px 0 0;
      color: var(--ink-3);
      font-size: 13px;
      line-height: 1.4;
    }
    .workout-detail-caption a {
      color: var(--ink);
    }
    ```
    and delete `.step-row-no-target`, `.step-row-no-target em`, `.step-row-no-target a` once `grep -rn step-row-no-target src e2e` returns nothing but the design test you rewrite in Task 7.
  - DEVIATIONS: row 62's "Start is blocked…" column becomes "Start, Connect and Log it after all enable with no baseline; a split-ref step reads a word from the four-rung ladder (Phase RW, spec §1.1); the Countdown no longer redirects" with the Why updated; row 55 drops `StepRow.tsx`'s "Set baselines" from its list of selectable links.

- [ ] **Step 4: Run** every touched test file, `pnpm typecheck`, `pnpm lint`, then `pnpm test --project unit --project client`.

- [ ] **Step 5: Commit** `… -m "Phase RW PR B: every surface reads the word; Start, Connect, Log and the Countdown stop gating on a baseline; the Timer word one size down in portrait"`. Probes: restore `startBlocked` → the detail test fails; drop the `-word` class → the TimerTargets test fails; restore the Countdown redirect → its test fails.

---

### Task 6: Copy retirements, the article, the seam test

**Files:**
- Modify: comments naming `EASY`/`Easy` in `domain/expand.ts`, `src/workout/connected/surfaceModel.ts` (also its dead `Easy` from Phase WU), `src/workout/connected/PaneLive.tsx`, `src/session/TimerTargets.tsx`, `src/session/Countdown.tsx`, `src/today/Today.tsx`, `src/session/postTestOffer.ts`, `src/builder/StepEditor.tsx`, `src/session/draft.ts`, `src/session/Timer.tsx`, `domain/fixtures.ts` (grep `EASY\|Easy\b` and reword each; `EASY BREATH` in `builderState.ts` and the v0.39.0 release note stay)
- Modify: `app/src/news/content/bodies/baselines.tsx` (one sentence at the end of the "Don't overthink the first one" paragraph)
- Test: `app/src/session/rowWithoutBaseline.seam.test.tsx` (create)

- [ ] **Step 1: The article sentence**, appended inside that paragraph:

```tsx
        Until a baseline is set, every workout still runs: where a split
        would show you read a word instead, steady, moderate, hard or all
        out, and distance workouts show a rough length marked with a tilde.
```

- [ ] **Step 2: The seam test (RF24).** A client test that starts upstream of the producer and asserts at the reader: mock a fresh account (baselines both `null`, the seeded `Tehuantepecer` as the workout), render the detail route, click `Start Timer`, follow to the countdown and `SKIP`, assert the Timer's TARGET SPLIT card reads `HARD`, drive the run to its end (the file's existing `advance` helpers), open the log form and assert the first step label the save request carries is `2:00 @ HARD`. Read `LogSession.test.tsx`'s timer-door save test for the request-capture idiom and reuse it. Mutation: make `phases()`'s null branch emit `label: "EASY"` → the Timer assertion fails.

- [ ] **Step 3: Run**, then `grep -rn "EASY\|Easy\b" app/src app/domain app/e2e` and account for every hit (only the bulk token, `EASY BREATH`, the release note and history should remain).

- [ ] **Step 4: Commit** `… -m "Phase RW PR B: EASY retired from every comment and the article says words stand in; one seam test from Start to the saved label"`.

---

### Task 7: e2e, captures, design pins

**Files:**
- Modify: `app/e2e/design.spec.ts` (the "Start Timer renders disabled/dashed…" test and its `no target` caption assertions, ~1118-1150: rewrite to "Start enabled, the caption in --ink-3, the step row word in --accent"; `EASY`-free)
- Modify: `app/e2e/library.spec.ts` (add a Start leg to the no-baseline describe: open Laminar, Start, SKIP, Timer reads `STEADY`; then Log it after on Sea Fret and assert the saved step label via the API)
- Modify: `app/e2e/screenshots.spec.ts` (`workout-detail-no-target` → `workout-detail-no-baseline`: Start enabled, words in the rows, the caption; add `timer-no-baseline` and `timer-no-baseline-landscape` on a `5:00 2k+6` + `5:00 2k-3 @28` import; delete the old `workout-detail-no-target.png`)
- Modify: `app/e2e/builder.spec.ts:918-931`, `onboarding.spec.ts:219`, `retest.spec.ts:71` stay (`ALL OUT` survives); `concept2.spec.ts:968` and `log.spec.ts:851` comments about the "Set baselines stub" reword.

- [ ] **Step 1:** Write the three test changes and the two captures.
- [ ] **Step 2:** `pnpm e2e` then `pnpm screenshots`; open `workout-detail-no-baseline.png`, `timer-no-baseline.png`, `timer-no-baseline-landscape.png` and compare against `docs/design/rw-gate0/detail-imported.png`, `timer.png`, `timer-landscape.png`. Revert date-only capture moves (`git status` will list ~60; keep only the ones this PR changes and say which in the PR body).
- [ ] **Step 3: Commit** `… -m "Phase RW PR B: e2e walks a fresh account from Start to the saved word; captures"`.

---

### Task 8: The PR, the PM final gate, the review

- [ ] Push; PR body per CLAUDE.md (~120 words above the fold, Record below), captures inline, the Gate 0 record cited, gates spoken (PM final gate REQUIRED: a split becomes a word; review two-stage; no antagonist delta; no walk).
- [ ] Dispatch the branch review; fold; then the PM final gate with the artifact; present both verdicts and stop. No merge without James's word. Release: none until PR C (PM ruling).
