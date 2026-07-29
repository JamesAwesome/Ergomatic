import { describe, it, expect } from "vitest";
import { isAllowed, parseAllowlist } from "./allowlist.js";

describe("parseAllowlist", () => {
  it("trims whitespace and drops empties (the trailing-comma footgun)", () => {
    const set = parseAllowlist(" a@x.com, B@Y.com ,, ");
    expect(set).toEqual(new Set(["a@x.com", "b@y.com"]));
  });
  it("empty or missing means nobody", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
  });
});

describe("isAllowed", () => {
  it("is case-insensitive on the candidate too", () => {
    expect(isAllowed(parseAllowlist("a@x.com"), " A@X.COM ")).toBe(true);
  });
  it("denies when not listed", () => {
    expect(isAllowed(parseAllowlist("a@x.com"), "b@y.com")).toBe(false);
  });
});
