import { describe, expect, it } from "vitest";
import { isFreeRow } from "./types.js";

/**
 * THE PREDICATE THE PLAN REFUSAL AND THE EMPTY-STEPS ALLOWANCE SHARE
 * (Phase JR PR 1 Task 1; spec rev 4's F3 correction; James's sign-off
 * 2026-09-01).
 *
 * A "free row" is a Just Row: no workout was chosen, so no intensity was
 * prescribed. It must never advance a plan, and it is the only row allowed
 * to store empty `steps`.
 *
 * The pair matters. Keying on `workoutId` alone is UNSAFE, and the second
 * case below is why: `LogSession.tsx:780-790` retries a save with
 * `workoutId: null` when the server 400s specifically on `workoutId` — the
 * workout was deleted between the door's mount and the Save click. That is
 * a legitimate plan-advancing session posting a null workout id, and a
 * predicate keyed on the id alone would silently stop advancing its plan:
 * a 201, and `SESSION n OF 84` does not move.
 */
describe("isFreeRow", () => {
  it("is true only when BOTH the workout id and the type are absent", () => {
    expect(isFreeRow(null, null)).toBe(true);
  });

  // The deleted-workout retry. `resolveWorkoutType` still resolves a type
  // through its `?? "O2"` last resort (`LogSession.tsx:475`), which spec
  // rev 4 keeps in place precisely so this row stays distinguishable.
  it("is false for a null workout id that still carries a type", () => {
    expect(isFreeRow(null, "O2")).toBe(false);
  });

  // The unmatched phone-timer session: a real workout, type resolved.
  it("is false for a row that names a workout", () => {
    expect(isFreeRow("7f1c2b9e-0000-4000-8000-000000000001", "O2")).toBe(false);
  });

  // Defensive, and reachable: nothing stops a client posting this shape,
  // and it is not a free row — a workout was chosen.
  it("is false for a named workout with no type", () => {
    expect(isFreeRow("7f1c2b9e-0000-4000-8000-000000000001", null)).toBe(false);
  });
});
