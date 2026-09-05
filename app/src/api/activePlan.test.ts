import { describe, it, expect, vi } from "vitest";
import { activePlan } from "./activePlan";
import type { PlanData, PlanState } from "./usePlan";

// Independent literals, never the production symbol (recurring failure 21):
// a plan is 84 sessions long on the wire, so `doneN` 84 is the first value
// with no session left to log against, and 83 the last with one.
function plan(doneN: number, length = 84): PlanData {
  return {
    planKey: "sprint",
    doneN,
    sequence: Array.from({ length }, (_, i) => ({
      index: i,
      code: "O2",
      status: i < doneN ? "done" : i === doneN ? "today" : "upcoming",
    })),
  };
}

function ready(p: PlanData): PlanState {
  return { state: "ready", plan: p, choose: vi.fn(), reset: vi.fn() };
}

describe("activePlan", () => {
  it("returns the plan when one is chosen and a session remains at doneN", () => {
    const p = plan(3);
    expect(activePlan(ready(p))).toBe(p);
  });

  it("returns the plan on its last session (doneN 83 of 84)", () => {
    const p = plan(83);
    expect(activePlan(ready(p))).toBe(p);
  });

  it("returns null once every session is logged (doneN 84 of 84) — the same rule Today uses to show FREESTYLE", () => {
    expect(activePlan(ready(plan(84)))).toBeNull();
  });

  it("returns null when doneN has run past the end (doneN 85 of 84)", () => {
    expect(activePlan(ready(plan(85)))).toBeNull();
  });

  it("returns null when no plan is chosen (the server's own no-plan body)", () => {
    expect(
      activePlan(ready({ planKey: null, doneN: 0, sequence: [] })),
    ).toBeNull();
  });

  it("returns null while the fetch is loading or has errored — logging is never hostage to the plan fetch", () => {
    expect(activePlan({ state: "loading" })).toBeNull();
    expect(activePlan({ state: "error", retry: vi.fn() })).toBeNull();
  });
});
