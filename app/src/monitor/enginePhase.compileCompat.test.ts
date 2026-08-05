import { describe, expect, it } from "vitest";
import type { EnginePhase } from "../session/engine";
import type { CompiledPhase } from "../../domain/monitor/program.js";

// Compile-time-ONLY compatibility contract (Task 2 brief, "the plan's
// resolution of the import-direction constraint"): `domain/monitor/
// program.ts` cannot import `EnginePhase` (it lives in src/session/
// engine.ts, and domain/ never imports src/), so it declares
// `CompiledPhase` — the structural subset of `EnginePhase` this compiler's
// contract needs — instead. This file is the enforcement: it lives in the
// CLIENT project specifically because it's the one place allowed to import
// BOTH `EnginePhase` (src/) and `CompiledPhase` (domain/) in the same file.
//
// TWO checks, because they catch different drift classes (Task 2 review,
// M1): the assignment check below only proves EnginePhase is assignable to
// CompiledPhase, which is blind to a field being dropped ENTIRELY rather
// than retyped — every field CompiledPhase declares except `type`/
// `originalIndex` is optional, so an EnginePhase missing `targetKind` (the
// H8 discriminant) entirely would still satisfy the assignment; three
// `Omit<EnginePhase, ...>` variants proved this passes `tsc` for exactly
// the fields that matter. The `keyof` membership check below the
// assignment closes that gap: it fails to typecheck the moment a field
// this compiler's contract names is no longer a key of `EnginePhase` at
// all, independent of optionality.
//
// If a future edit to `Phase` (domain/expand.ts) or `EnginePhase`
// (src/session/engine.ts) removes or retypes a field either check
// declares, THIS FILE fails `pnpm typecheck` — not `pnpm test`, and not at
// runtime. That's deliberate: drift here is a compile error, never a
// runtime surprise a screen discovers mid-workout.

/** Every field name `compileProgram`'s contract (`CompiledPhase`) declares.
 *  Kept as an explicit string union, not `keyof CompiledPhase`, so this
 *  check states the field LIST independently of `CompiledPhase`'s own
 *  declaration — a typo or a field silently dropped from BOTH sides at
 *  once would otherwise still trivially satisfy `keyof CompiledPhase
 *  extends keyof EnginePhase`. */
type CompilerReads =
  | "type"
  | "seconds"
  | "meters"
  | "targetSplit"
  | "targetKind"
  | "spm"
  | "originalIndex";

type Assert<T extends true> = T;

// The check itself: every name in CompilerReads must be a key of
// EnginePhase. If one is removed or renamed on EnginePhase, this becomes
// `Assert<false>` and fails to typecheck right here — see the verification
// note below for how this was proven to actually fire (a temporary
// `Omit<EnginePhase, "targetKind">` variant with `@ts-expect-error`,
// confirmed to report a real error and then removed; not left in the
// codebase since a permanent scratch variant would itself need its own
// upkeep for no ongoing benefit over this check).
// Exported (rather than left as an unreferenced local) so `noUnusedLocals`
// doesn't need to special-case a type that exists purely for its
// assertion side effect at the type level — the export itself is the
// "use". Nothing imports it; it is not part of any public API.
export type _CompilerReadsExistOnEnginePhase = Assert<
  CompilerReads extends keyof EnginePhase ? true : false
>;

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
    // check — but the load-bearing checks (this assignment, and the
    // module-level `_CompilerReadsExistOnEnginePhase` type above) already
    // happened at typecheck time, before this line ever ran.
    expect(compatible).toStrictEqual([]);
  });
});
