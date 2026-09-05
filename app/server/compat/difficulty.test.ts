import { describe, it, expect } from "vitest";
import { derivedDifficulty } from "./difficulty.js";

describe("derivedDifficulty (Phase DE PR 1 compat write, spec §3.2)", () => {
  it.each([
    [1, "easy"],
    [2, "easy"],
    [3, "medium"],
    [4, "hard"],
    [5, "hard"],
  ] as const)("pain %i → %s", (pain, word) => {
    expect(derivedDifficulty(pain)).toBe(word);
  });
});
