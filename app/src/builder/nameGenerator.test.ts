import { describe, it, expect } from "vitest";
import { NAME_POOL_SIZE, generateName } from "./nameGenerator";
import { STARTER_WORKOUTS } from "../../server/seed/starter";

describe("generateName", () => {
  it("offers a pool large enough that collisions are rare", () => {
    expect(NAME_POOL_SIZE).toBeGreaterThan(1000);
  });

  it("is deterministic for a given seed", () => {
    expect(generateName([], 42)).toBe(generateName([], 42));
  });

  it("varies with the seed", () => {
    const names = new Set([1, 2, 3, 4, 5].map((s) => generateName([], s)));
    expect(names.size).toBeGreaterThan(1);
  });

  it("skips names already in the library", () => {
    const first = generateName([], 7);
    expect(generateName([first], 7)).not.toBe(first);
  });

  it("is case-insensitive about what counts as taken", () => {
    const first = generateName([], 11);
    expect(generateName([first.toUpperCase()], 11)).not.toBe(first);
  });

  it("still returns a usable name when everything is taken", () => {
    const all = Array.from({ length: NAME_POOL_SIZE }, (_, i) =>
      generateName([], i),
    );
    const fallback = generateName(all, 0);
    expect(typeof fallback).toBe("string");
    expect(fallback.length).toBeGreaterThan(0);
  });

  it("never returns a name longer than the domain's 80-character title bound", () => {
    for (let s = 0; s < 200; s++) {
      expect(generateName([], s).length).toBeLessThanOrEqual(80);
    }
  });

  // The seven tests above are the brief's required cases, verbatim. The two
  // below are supplementary: they exercise the numbered-fallback branches
  // (skipping a taken number, and exhausting every numbered fallback) that
  // the brief's own exhaustion test doesn't reach on its own.

  it("moves past an already-taken numbered fallback to the next number", () => {
    const pool = Array.from({ length: NAME_POOL_SIZE }, (_, i) =>
      generateName([], i),
    );
    const base = generateName([], 0);
    const existing = [...pool, `${base} 2`];
    expect(generateName(existing, 0)).toBe(`${base} 3`);
  });

  it("truncates to the title bound if every numbered fallback is also taken", () => {
    const pool = Array.from({ length: NAME_POOL_SIZE }, (_, i) =>
      generateName([], i),
    );
    const base = generateName([], 0);
    const allNumberedFallbacks = Array.from(
      { length: NAME_POOL_SIZE },
      (_, i) => `${base} ${i + 2}`,
    );
    const existing = [...pool, ...allNumberedFallbacks];
    expect(generateName(existing, 0)).toBe(base.slice(0, 80));
  });

  it("gives a different name on each press against the real starter library", () => {
    // Regression: the generator probed linearly forward from a seed-derived
    // start index. Its noun list opens with the same weather words the starter
    // library uses, so every seed inside that taken cluster slid to the same
    // first-free slot and repeated presses returned "Riptide" forever. Every
    // prior test used an empty or one-name library, so this was invisible.
    const titles = STARTER_WORKOUTS.map((w) => w.title);
    const picks = [0, 1, 2, 3].map((seed) => generateName(titles, seed));
    expect(new Set(picks).size).toBe(4);
  });

  it("never returns a name the library already has", () => {
    const titles = STARTER_WORKOUTS.map((w) => w.title);
    const taken = new Set(titles.map((t) => t.toLowerCase()));
    for (let seed = 0; seed < 50; seed++) {
      expect(taken.has(generateName(titles, seed).toLowerCase())).toBe(false);
    }
  });
});
