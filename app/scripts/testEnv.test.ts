import { describe, expect, it } from "vitest";
import { isCI, workerCap } from "./testEnv";

describe("isCI", () => {
  // CI is a STRING. Truthiness would make "false" and "0" enable CI mode
  // and silently remove both worker caps on the machine they protect.
  //
  // `undefined` is deliberately excluded from this table: isCI's parameter
  // defaults to `process.env.CI`, and in JavaScript passing `undefined`
  // explicitly still triggers the default -- so `isCI(undefined)` does not
  // test "absent value", it reads the ambient environment. Under GitHub
  // Actions (CI=true) that made this table assert `isCI(undefined) ===
  // false` while the real read was `true`, passing everywhere except CI.
  // Every case here pins the pure function on an EXPLICIT string argument;
  // the default-parameter behaviour gets its own case below, with the
  // environment under the test's own control.
  it.each([
    ["", false],
    ["false", false],
    ["0", false],
    ["true", true],
    ["1", true],
  ])("isCI(%p) === %p", (v, expected) => {
    expect(isCI(v)).toBe(expected);
  });

  it("with no argument, reads process.env.CI", () => {
    const original = process.env.CI;
    try {
      process.env.CI = "true";
      expect(isCI()).toBe(true);
      delete process.env.CI;
      expect(isCI()).toBe(false);
    } finally {
      if (original === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = original;
      }
    }
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
