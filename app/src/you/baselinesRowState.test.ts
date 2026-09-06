import { describe, expect, it } from "vitest";
import { baselinesRowState } from "./baselinesRowState";
import type { BaselinesState } from "../api/useBaselines";

const ready = (
  k2Seconds: number | null,
  k6Seconds: number | null,
): BaselinesState => ({
  state: "ready",
  baselines: { k2Seconds, k6Seconds },
  save: async () => {},
});

describe("baselinesRowState — the five cells the You row can show", () => {
  it("names both splits when both are set", () => {
    expect(baselinesRowState(ready(112.3, 125))).toBe("2K 1:52.3 · 6K 2:05.0");
  });

  it("says NOT SET, in words, when neither side has a number", () => {
    expect(baselinesRowState(ready(null, null))).toBe("NOT SET");
  });

  it("dashes the missing side when the other one is set", () => {
    expect(baselinesRowState(ready(112.3, null))).toBe("2K 1:52.3 · 6K —");
    expect(baselinesRowState(ready(null, 125))).toBe("2K — · 6K 2:05.0");
  });

  it("says COULDN'T READ when the read failed", () => {
    expect(baselinesRowState({ state: "error", retry: () => {} })).toBe(
      "COULDN'T READ",
    );
  });

  it("says nothing at all while the read is still in flight", () => {
    // A row that guessed NOT SET here would tell a rower with baselines
    // that they have none, for as long as the fetch takes.
    expect(baselinesRowState({ state: "loading" })).toBeNull();
  });

  it("formats to a tenth, the same way every other split on screen does", () => {
    expect(baselinesRowState(ready(60, 240))).toBe("2K 1:00.0 · 6K 4:00.0");
  });
});
