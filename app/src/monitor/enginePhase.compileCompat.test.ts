import { describe, expect, it } from "vitest";
import type { EnginePhase } from "../session/engine";
import type { CompiledPhase } from "../../domain/monitor/program.js";

// Compile-time-ONLY compatibility contract (Task 2 brief, "the plan's
// resolution of the import-direction constraint"): `domain/monitor/
// program.ts` cannot import `EnginePhase` (it lives in src/session/
// engine.ts, and domain/ never imports src/), so it declares
// `CompiledPhase` — the structural subset of `EnginePhase` `compileProgram`
// actually reads — instead. This file is the enforcement: it lives in the
// CLIENT project specifically because it's the one place allowed to import
// BOTH `EnginePhase` (src/) and `CompiledPhase` (domain/) in the same file.
//
// If a future edit to `Phase` (domain/expand.ts) or `EnginePhase`
// (src/session/engine.ts) removes or retypes a field `CompiledPhase`
// declares, THIS FILE fails `pnpm typecheck` — not `pnpm test`, and not at
// runtime. That's deliberate: drift here is a compile error, never a
// runtime surprise a screen discovers mid-workout.
describe("EnginePhase / CompiledPhase compile-time compatibility", () => {
  it("EnginePhase is assignable to CompiledPhase (tsd-style satisfies, enforced by typecheck, not this assertion)", () => {
    // The assignment on the next line IS the check. A variable of type
    // `EnginePhase[]` assigned to a `CompiledPhase[]`-typed binding only
    // typechecks if every property CompiledPhase requires (type, and the
    // optional seconds/meters/targetSplit/targetKind/spm, plus the required
    // originalIndex) exists on EnginePhase with a compatible type.
    const compatible: CompiledPhase[] = [] as EnginePhase[];
    // A real runtime assertion so lint's vitest/expect-expect rule (and
    // anyone skimming for "what does this test check") sees a genuine
    // check — but the load-bearing check already happened above, at
    // typecheck time, before this line ever ran.
    expect(compatible).toStrictEqual([]);
  });
});
