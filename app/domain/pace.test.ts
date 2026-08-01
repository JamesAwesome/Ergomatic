import { describe, it, expect } from "vitest";
import {
  parsePaceRef,
  resolveSplit,
  toleranceRange,
  isEffortRef,
  effortWord,
  effortSpoken,
  refLabel,
  estimationSplit,
} from "./pace.js";

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

describe("effort refs", () => {
  it.each([
    ["max", { effort: "max" }],
    ["MAX", { effort: "max" }],
    ["min", { effort: "min" }],
    [" Min ", { effort: "min" }],
  ])("parses %s", (input, expected) => {
    expect(parsePaceRef(input)).toStrictEqual(expected);
  });

  it.each(["max+2", "min-1", "max 2", "maxx", "2kmax"])(
    "rejects %s — efforts take no offset",
    (input) => {
      expect(parsePaceRef(input)).toBeNull();
    },
  );

  it("still parses every split form unchanged", () => {
    expect(parsePaceRef("6k-2")).toStrictEqual({ base: "6k", off: -2 });
    expect(parsePaceRef("2k")).toStrictEqual({ base: "2k", off: 0 });
  });

  it("discriminates the arms", () => {
    expect(isEffortRef({ effort: "max" })).toBe(true);
    expect(isEffortRef({ base: "2k", off: 0 })).toBe(false);
  });

  it("maps efforts to the display pair", () => {
    expect(effortWord("max")).toBe("ALL OUT");
    expect(effortWord("min")).toBe("EASY");
  });

  // The spoken pair a screen reader gets instead of the chip word — "MIN"
  // read aloud is indistinguishable from "minutes", the exact confusion the
  // display-word pair (effortWord) exists to prevent visually, so the
  // spoken form needs its own vocabulary rather than reusing the chip text.
  it("maps efforts to the spoken pair, not the chip word", () => {
    expect(effortSpoken("max")).toBe("at max effort");
    expect(effortSpoken("min")).toBe("easy");
  });

  it("labels refs with the chip word", () => {
    expect(refLabel({ effort: "max" })).toBe("MAX");
    expect(refLabel({ effort: "min" })).toBe("MIN");
    expect(refLabel({ base: "6k", off: -2 })).toBe("6k −2");
    expect(refLabel({ base: "2k", off: 0 })).toBe("2k");
    expect(refLabel({ base: "2k", off: 3 })).toBe("2k +3");
  });

  describe("estimationSplit — the ONLY place an effort becomes a number", () => {
    const baselines = { k2Seconds: 112, k6Seconds: 122 };
    it("resolves split refs exactly like resolveSplit", () => {
      expect(estimationSplit(baselines, { base: "6k", off: -2 })).toBe(120);
    });
    it("prices max from the 2k baseline", () => {
      expect(estimationSplit(baselines, { effort: "max" })).toBe(112);
    });
    it("prices min from 6k + 20", () => {
      expect(estimationSplit(baselines, { effort: "min" })).toBe(142);
    });
  });

  it("throws on resolveSplit with an effort ref", () => {
    const baselines = { k2Seconds: 112, k6Seconds: 122 };
    expect(() => resolveSplit(baselines, { effort: "max" })).toThrow(
      "resolveSplit requires a split ref",
    );
  });
});
