import { describe, expect, it } from "vitest";
import { isCI, workerCap } from "./testEnv";

describe("isCI", () => {
  // CI is a STRING. Truthiness would make "false" and "0" enable CI mode
  // and silently remove both worker caps on the machine they protect.
  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["0", false],
    ["true", true],
    ["1", true],
  ])("isCI(%p) === %p", (v, expected) => {
    expect(isCI(v as string | undefined)).toBe(expected);
  });
});

describe("workerCap", () => {
  it.each([
    [undefined, 4],
    ["", 4],
    ["0", 4],
    ["abc", 4],
    ["true", 4],
    ["8", 8],
    ["-2", 1], // Playwright's resolveWorkers throws below 1
    ["1.5", 1], // a fractional worker count is not a setting
    ["999", 16], // an unbounded ceiling defeats the whole point
    ["Infinity", 16],
  ])("workerCap(%p, 4) === %p", (v, expected) => {
    expect(workerCap(v as string | undefined, 4)).toBe(expected);
  });

  it("uses the caller's fallback, not a baked-in 4", () => {
    expect(workerCap(undefined, 2)).toBe(2);
  });
});
