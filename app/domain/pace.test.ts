import { describe, it, expect } from "vitest";
import { parsePaceRef, resolveSplit, toleranceRange } from "./pace.js";

const B = { k2Seconds: 112, k6Seconds: 122 };

describe("parsePaceRef", () => {
  it.each([
    ["2k", { base: "2k", off: 0 }],
    ["6k", { base: "6k", off: 0 }],
    ["6k-2", { base: "6k", off: -2 }],
    ["2k+4", { base: "2k", off: 4 }],
    ["6k -2.5", { base: "6k", off: -2.5 }],
    ["2K + 1", { base: "2k", off: 1 }],
  ])("parses %s", (input, expected) => {
    expect(parsePaceRef(input)).toStrictEqual(expected);
  });
  it.each(["5k", "2k*3", "", "k2", "2k--1", "2k-"])("rejects %s", (input) => {
    expect(parsePaceRef(input)).toBeNull();
  });
  it("rejects a ref with junk before it instead of stripping the prefix", () => {
    // A pasted line like "xx2k+5" must not be parsed as "2k+5" by matching
    // the ref anywhere in the string — the whole input has to be the ref.
    expect(parsePaceRef("xx2k+5")).toBeNull();
  });
  it("rejects an offset so large it overflows to a non-finite number", () => {
    expect(parsePaceRef(`2k+${"9".repeat(400)}`)).toBeNull();
  });
});

describe("resolveSplit", () => {
  it("is baseline + off + nudge, minus = faster", () => {
    expect(resolveSplit(B, { base: "6k", off: -2 })).toBe(120);
    expect(resolveSplit(B, { base: "2k", off: 4 })).toBe(116);
    expect(resolveSplit(B, { base: "6k", off: -2 }, -1)).toBe(119);
    expect(resolveSplit(B, { base: "6k", off: -2 }, 2)).toBe(122);
  });
});

describe("toleranceRange", () => {
  it("builds the ± band with formatted label", () => {
    expect(toleranceRange(120, 1)).toStrictEqual({
      lo: 119,
      hi: 121,
      label: "1:59.0–2:01.0",
    });
  });
  it("tol 0 is a single value", () => {
    expect(toleranceRange(120, 0).label).toBe("2:00.0");
  });
});
