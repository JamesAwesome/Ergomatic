import { describe, it, expect, vi } from "vitest";
import { clientRng } from "./rng";
import { RNG_RANGE } from "../../domain/suggest.js";

describe("clientRng", () => {
  it("returns an integer in [0, RNG_RANGE) on every call, drawn from crypto.getRandomValues", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    for (let i = 0; i < 1000; i++) {
      const x = clientRng();
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(RNG_RANGE);
    }
    expect(spy).toHaveBeenCalledTimes(1000);
    spy.mockRestore();
  });

  it("is not a constant (a thousand draws are not all equal)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(clientRng());
    expect(seen.size).toBeGreaterThan(1);
  });
});
