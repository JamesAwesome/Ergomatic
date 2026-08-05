import { describe, expect, it } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines } from "../../domain/types.js";
import {
  compileProgram,
  type CompileError,
} from "../../domain/monitor/program.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";

// The 300-workout sweep (Task 2 brief, design spec §Testing/§Exit criteria):
// every seeded library workout, run through EXACTLY the assembly the phone
// timer itself uses to start a session (`buildDraft` -> `buildRun`, which
// internally calls `effectiveSteps` -> `phases()` — see src/session/
// engine.ts's `buildRun`), then compiled. Lives here (the client project,
// not domain/monitor/program.test.ts) because it needs `src/session/
// engine.ts`'s `buildRun` and `draft.ts`'s `buildDraft` — domain/ cannot
// import src/, and importing the REAL assembly function (rather than
// hand-reassembling its steps) is what makes this a faithful replica
// instead of a second copy that could silently drift from it (the same
// "one algorithm, not two copies" reasoning `buildRun`'s own header comment
// gives for resolving `originalStepIndex` through a lookup rather than
// reimplementing `phases()`'s reps-expansion).
//
// DESIGN_BASELINES: copied from app/e2e/design.spec.ts (the screenshot
// suite's fixed pair) for the same reason it's used there — deterministic,
// arbitrary-but-fixed baselines with no dependency on stored/live state.
// Not imported directly: e2e specs are a separate Playwright project, not
// reachable from a vitest client-project test.
const DESIGN_BASELINES: Baselines = { k2Seconds: 100, k6Seconds: 120 };

// Fixed, arbitrary instant — buildRun stamps timestamps with it but nothing
// in this test reads them; kept fixed anyway (no wall clock in tests, the
// 6B rule the briefing repeats) rather than `new Date()`.
const NOW = new Date("2026-01-01T00:00:00.000Z");

type SweepResult =
  | { title: string; type: string; outcome: "compiled"; intervalCount: number }
  | {
      title: string;
      type: string;
      outcome: "error";
      code: CompileError["code"];
      message: string;
    };

function sweepOne(
  index: number,
  workout: (typeof LIBRARY_WORKOUTS)[number],
): SweepResult {
  const draft = buildDraft({
    id: `sweep-${index}`,
    title: workout.title,
    type: workout.type,
    steps: workout.steps,
  });
  const run = buildRun(draft, DESIGN_BASELINES, NOW);
  // run.phases is EnginePhase[]; compileProgram takes CompiledPhase[].
  // Structural assignment, no cast — see enginePhase.compileCompat.test.ts
  // for the enforced compatibility contract this relies on.
  const result = compileProgram(run.phases);
  if ("intervals" in result) {
    return {
      title: workout.title,
      type: workout.type,
      outcome: "compiled",
      intervalCount: result.intervals.length,
    };
  }
  return {
    title: workout.title,
    type: workout.type,
    outcome: "error",
    code: result.code,
    message: result.message,
  };
}

describe("compileProgram: the 300-workout sweep", () => {
  it("every seeded library workout compiles or produces a typed CompileError — never throws, never an unrecognized shape", () => {
    const results = LIBRARY_WORKOUTS.map((w, i) => sweepOne(i, w));

    const compiled = results.filter((r) => r.outcome === "compiled");
    const errored = results.filter((r) => r.outcome === "error");

    // The contract every result must satisfy, regardless of outcome —
    // proven by construction (sweepOne's own return type), asserted here
    // too so a future refactor that widens SweepResult can't silently drop
    // this guarantee.
    for (const r of results) {
      expect(r.outcome === "compiled" || r.outcome === "error").toBe(true);
    }

    // PINNED BASELINE, not an assumed invariant: as of this task, all 300
    // seeded workouts compile cleanly (see the report accompanying this
    // commit for the full breakdown). If this assertion ever fails, that
    // is NOT necessarily a test bug — per the design spec and the task
    // brief, a real starter failing to compile (or newly requiring a
    // CompileError) is a James-level finding. Whoever investigates a
    // failure here must determine which it is (genuine new-content edge
    // case vs. compiler regression) before touching this pinned number —
    // do not "fix" this test by adjusting the count without that check.
    expect(errored).toStrictEqual([]);
    expect(compiled).toHaveLength(LIBRARY_WORKOUTS.length);
    expect(compiled).toHaveLength(300);

    // The max interval count actually reached (informational: pins the
    // real ceiling within the 50-interval limit, distinct from the
    // synthetic 50/51 boundary fixtures in domain/monitor/program.test.ts,
    // which test the LIMIT itself rather than what the library happens to
    // contain today). Sea Smoke (o2.ts) is the known largest — 25 IR
    // intervals, matching the adversarial review's independent count.
    const maxIntervals = Math.max(
      ...compiled.map((r) => (r.outcome === "compiled" ? r.intervalCount : 0)),
    );
    expect(maxIntervals).toBe(25);
    const largest = compiled.find(
      (r) => r.outcome === "compiled" && r.intervalCount === maxIntervals,
    );
    expect(largest?.title).toBe("Sea Smoke");
  });
});
