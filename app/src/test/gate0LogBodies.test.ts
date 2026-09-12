import { describe, expect, it } from "vitest";
import {
  rowContribution,
  statsRowInput,
} from "../../domain/stats/rowContribution.js";
import { GATE0_ROWS } from "../../domain/stats/gate0Seed.js";
import { GATE0_LOG_BODIES } from "./gate0LogBodies";

// The API-shaped transcription lands every seed row in the seed's own
// tier with the seed's metres, seconds, rest and calories (spec §8.5).
describe("gate0LogBodies — each POST body reproduces its seed row through rowContribution", () => {
  it.each(GATE0_ROWS.map((r) => [r.id, r] as const))("%s", (id, seed) => {
    const b = GATE0_LOG_BODIES.find((x) => x.id === id)!.body;
    // Through the ONE builder, `steps` handed over as the body carries it
    // — so the builder's own step-key mapping is what this test exercises,
    // not a second hand-written map of it (RF24).
    const num = (k: string) => (b[k] as number | undefined) ?? null;
    const c = rowContribution(
      statsRowInput({
        endedBy: (b.endedBy as string | undefined) ?? null,
        machineWorkSeconds: num("machineWorkSeconds"),
        machineWorkMeters: num("machineWorkMeters"),
        workSeconds: num("workSeconds"),
        workMeters: num("workMeters"),
        distanceMeters: num("distanceMeters"),
        timeSeconds: num("timeSeconds"),
        restSeconds: num("restSeconds"),
        restMeters: num("restMeters"),
        steps: b.steps,
        totalCalories: (
          b.machineSummary as { totalCalories?: number } | undefined
        )?.totalCalories,
      }),
    );
    expect({
      tier: c.tier,
      workMeters: c.workMeters,
      workSeconds: c.workSeconds,
      restMeters: c.restMeters,
      calories: c.calories,
      source: b.source,
      type: b.workoutType,
    }).toStrictEqual({
      tier: seed.tier,
      workMeters: seed.workMeters,
      workSeconds: seed.workSeconds,
      restMeters: seed.restMeters,
      calories: seed.calories,
      source: seed.source,
      type: seed.workoutType,
    });
  });
});
