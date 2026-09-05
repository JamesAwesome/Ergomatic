import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearConcept2Seen,
  concept2SeenKey,
  readConcept2Seen,
  writeConcept2Seen,
} from "./concept2Seen";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("concept2Seen (ruling 6's persisted fact, invariants I-A..I-G)", () => {
  it("is false for an account nobody has written — the fresh-device default", () => {
    expect(readConcept2Seen("u1")).toBe(false);
  });

  it("a successful available:true read mints it, and it reads back true", () => {
    writeConcept2Seen("u1", true);
    expect(readConcept2Seen("u1")).toBe(true);
    // The stored value is our own literal, not a boolean coerced to a string
    // by accident — pinned as an INDEPENDENT literal (RF21).
    expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBe("1");
  });

  it("I-C: a successful available:false read clears it in the same pass", () => {
    writeConcept2Seen("u1", true);
    writeConcept2Seen("u1", false);
    expect(readConcept2Seen("u1")).toBe(false);
    expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBeNull();
  });

  it("I-A: one fact per account — another account on the same device reads false", () => {
    writeConcept2Seen("u1", true);
    expect(readConcept2Seen("u2")).toBe(false);
    expect(concept2SeenKey("u2")).not.toBe(concept2SeenKey("u1"));
  });

  it("I-D: clearConcept2Seen removes exactly that account's fact", () => {
    writeConcept2Seen("u1", true);
    writeConcept2Seen("u2", true);
    clearConcept2Seen("u1");
    expect(readConcept2Seen("u1")).toBe(false);
    expect(readConcept2Seen("u2")).toBe(true);
  });

  it("I-B: a foreign value under our key is NOT a claim — only our own literal reads as seen", () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "true");
    expect(readConcept2Seen("u1")).toBe(false);
  });

  it("I-G: a store that throws on read answers false, never a claim", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readConcept2Seen("u1")).toBe(false);
  });

  it("I-G: a store that throws on the CLEAR leaves the old fact — the one direction that is not fail-closed, named", () => {
    writeConcept2Seen("u1", true);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => writeConcept2Seen("u1", false)).not.toThrow();
    vi.restoreAllMocks();
    // Still "1": a swallowed CLEAR cannot un-say a claim. Bounded by I-C
    // retrying on every successful read and by I-A keeping it to this
    // account; the module header says so.
    expect(readConcept2Seen("u1")).toBe(true);
  });

  it("I-G: a store that throws on write is swallowed, and the fact degrades to not-seen", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeConcept2Seen("u1", true)).not.toThrow();
    vi.restoreAllMocks();
    expect(readConcept2Seen("u1")).toBe(false);
  });
});
