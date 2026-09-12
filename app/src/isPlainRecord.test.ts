import { describe, expect, it } from "vitest";
import { isPlainRecord } from "./isPlainRecord";

describe("isPlainRecord — the one JSON-shape guard every localStorage reader shares", () => {
  it("accepts a plain object, including an empty one", () => {
    expect(isPlainRecord({})).toBe(true);
    expect(isPlainRecord({ v: 1 })).toBe(true);
  });

  it("rejects null, arrays and primitives — each is `typeof object` or a JSON value that must NOT read as a record", () => {
    expect(isPlainRecord(null)).toBe(false);
    expect(isPlainRecord([])).toBe(false);
    expect(isPlainRecord([{ v: 1 }])).toBe(false);
    expect(isPlainRecord("{}")).toBe(false);
    expect(isPlainRecord(1)).toBe(false);
    expect(isPlainRecord(undefined)).toBe(false);
  });
});
