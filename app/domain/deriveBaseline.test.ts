import { describe, it, expect } from "vitest";
import {
  K2_K6_OFFSET_SECONDS,
  deriveK2FromK6,
  deriveK6FromK2,
} from "./deriveBaseline.js";

describe("K2_K6_OFFSET_SECONDS", () => {
  it("is the fixed 7-second heuristic offset", () => {
    expect(K2_K6_OFFSET_SECONDS).toBe(7);
  });
});

describe("deriveK2FromK6", () => {
  it("subtracts the offset — a 2k runs faster than a 6k", () => {
    expect(deriveK2FromK6(122)).toBe(115);
  });

  it("uses the real seeded reference values from BaselineEditor's own handoff numbers", () => {
    // 122.0 s/500m is the handoff's own 6k seed (BaselineEditor.tsx's
    // SEED_K6) — a realistic input, not an arbitrary round number.
    expect(deriveK2FromK6(122)).toBe(112 + 3);
  });
});

describe("deriveK6FromK2", () => {
  it("adds the offset — a 6k runs slower than a 2k", () => {
    expect(deriveK6FromK2(112)).toBe(119);
  });
});

describe("deriveK2FromK6 and deriveK6FromK2 together", () => {
  it("are inverses of each other", () => {
    const k6 = 122;
    expect(deriveK6FromK2(deriveK2FromK6(k6))).toBe(k6);
  });
});
