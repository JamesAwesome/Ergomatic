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
// HONEST SCOPE (Task 2 review, M3): this sweep runs every seeded workout
// as a PRISTINE draft — nothing removed, nothing edited. That proves
// nothing about the removal class: eight real starters reach
// `leading-rest` through a LEGAL single-tap row removal on Confirm
// (removing the first work row). Seven of them — Moonbow, Sun Dog,
// Pogonip, Sun Pillar, Hazy Sunshine, Favonius, Nimbostratus — are shaped
// `[w, r, w]` in server/seed/library/o2.ts, so removing row 0 leaves the
// "r" step as the new first entry directly. Virazon is NOT that shape:
// it's `[w, r, w, r, w]` (two work/rest pairs, o2.ts). Removing row 0
// still leaves an "r" step first (`[r, w, r, w]`) — the same leading-rest
// outcome — because the "r" immediately after the first work step was
// always going to become the new head regardless of how many work/rest
// pairs follow. (Both shapes carried a leading `wu` row until
// 2026-08-09's warmup setting, which is why this used to take TWO taps.)
// `leading-rest`'s message is user-facing, shown on a real screen after a
// real user action — not a synthetic-fixture-only branch. See the separate
// "removal dimension" describe block below, which drives the same real
// `SessionDraft.removed` path this sweep does not exercise.
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
    // contain today). Sea Smoke (o2.ts) is the known largest — 24 IR
    // intervals (25 until 2026-08-09's warmup setting took every seeded
    // workout's `wu` step out; Phase WU then removed the preference that
    // used to prepend one back, so 24 is simply what the library holds).
    const maxIntervals = Math.max(
      ...compiled.map((r) => (r.outcome === "compiled" ? r.intervalCount : 0)),
    );
    expect(maxIntervals).toBe(24);
    const largest = compiled.find(
      (r) => r.outcome === "compiled" && r.intervalCount === maxIntervals,
    );
    expect(largest?.title).toBe("Sea Smoke");
  });
});

// The removal dimension (Task 2 review, M3): `leading-rest` reached
// through a LIVE user action, not a hand-built CompiledPhase[] fixture.
// Seven of the eight titles below (all but Virazon) are `[w, r, w]` in
// server/seed/library/o2.ts (verified by reading each entry); removing
// row 0 — the first work step, one tap on Confirm's per-row remove
// control — leaves `[r, w]` as the effective steps directly. Virazon is
// `[w, r, w, r, w]` (two work/rest pairs); removing the same row leaves
// `[r, w, r, w]` — still rest-first, for the same reason (only the FIRST
// work step is removed, so the "r" immediately following it becomes the
// new head regardless of what follows). This drives the REAL
// `SessionDraft.removed` field through the REAL `effectiveSteps` (via
// `buildRun`), not a reimplemented filter, for the same "one algorithm,
// not two copies" reason `sweepOne` above uses `buildDraft`/`buildRun`
// rather than hand-assembling phases.
const REMOVAL_LEADING_REST_TITLES = [
  "Moonbow",
  "Sun Dog",
  "Pogonip",
  "Sun Pillar",
  "Hazy Sunshine",
  "Favonius",
  "Nimbostratus",
  "Virazon",
];

describe("compileProgram: the removal dimension — leading-rest is live, not synthetic", () => {
  it.each(REMOVAL_LEADING_REST_TITLES)(
    "%s: removing the first work row on Confirm produces leading-rest",
    (title) => {
      const workout = LIBRARY_WORKOUTS.find((w) => w.title === title);
      if (!workout) throw new Error(`fixture workout not found: ${title}`);
      const draft = {
        ...buildDraft({
          id: `removal-${title}`,
          title: workout.title,
          type: workout.type,
          steps: workout.steps,
        }),
        removed: [0],
      };
      const run = buildRun(draft, DESIGN_BASELINES, NOW);
      const result = compileProgram(run.phases);
      expect(result).toStrictEqual({
        code: "leading-rest",
        message:
          "This workout starts with rest before any work. The PM5 has no way to program a rest before the first interval.",
        phaseIndex: 0,
      });
    },
  );
});

// PHASE WU deleted the describe that stood here, `compileProgram: the
// warm-up SETTING reaches interval 0` — a 300-workout sweep plus three
// cases pinning that `buildRun`'s prepended warm-up phase compiled to a
// target-less interval 0, and to nothing at all with the preference off.
// `buildRun` has no warm-up argument and `Phase["type"]` has no warm-up
// member, so there is no prepend left to sweep for. The one case worth
// keeping is below: a real seeded workout compiling end to end, through the
// same `buildDraft -> buildRun -> compileProgram` assembly the Connect door
// runs, to exactly the intervals its own steps describe.
describe("compileProgram: a real seeded workout compiles to its own steps and nothing more", () => {
  function programFor(title: string): ReturnType<typeof compileProgram> {
    const workout = LIBRARY_WORKOUTS.find((w) => w.title === title)!;
    const draft = buildDraft({
      id: `compile-${title}`,
      title: workout.title,
      type: workout.type,
      steps: workout.steps,
    });
    return compileProgram(buildRun(draft, DESIGN_BASELINES, NOW).phases);
  }

  it("Beam Sea compiles to its single 2000 m interval, with nothing in front of it", () => {
    const result = programFor("Beam Sea");
    expect(result).toStrictEqual({
      intervals: [
        {
          type: "work",
          kind: "distance",
          value: 2000,
          targetSplit: 106,
          displaySpm: 24,
          restSeconds: 0,
        },
      ],
    });
  });
});
