// The size-token scale (connected-revamp Task 2, design spec §8) — pinned
// in a fix round after review (Important-2): sixteen load-bearing numbers
// and eight names shipped with nothing asserting any of them, and nothing
// consumes them yet either (Tasks 3/5/7 are the first real callers), so a
// typo'd name or a transposed portrait/landscape pair would have failed
// silently until someone eyeballed a screenshot. This is the repo's own
// `spec-blind-tests` rule: an unconsumed semantic helper needs a spec
// re-derivation at review, first consumer in the same task where possible.
// Neither happened at Task 2 time; this file is the re-derivation.
//
// jsdom never loads either stylesheet as real rules — Vitest mocks every
// `.css` import to an empty string for this project (`TimerTargets.test.tsx`'s
// own header documents the empirical check) — so this reads both files'
// source text straight off disk, the same `node:fs` + `commentStrippedSource`
// idiom `ConnectedSurface.test.tsx`'s `indexCssPath()` and
// `TimerTargets.test.tsx`'s own CSS-source tests already use, for the exact
// same reason: pinning the resolved declaration structurally, not "we
// looked and it seemed right."
//
// ONE name, two values (tokens.css's own comment on the scale): the
// portrait half lives in `tokens.css`'s single `:root` block, the landscape
// half in `index.css`'s own single `:root` block — the ONLY `:root` block
// that file contains — nested inside the connected surface's existing
// `@media (orientation: landscape)` query. Both `:root` blocks are located
// by a plain single-match regex on purpose: if either file ever grows a
// second `:root` block, that regex breaks LOUDLY (`.exec` returns a match
// for the FIRST occurrence only, and a second one silently goes unchecked)
// rather than silently checking the wrong one — a future editor adding a
// second block is exactly the trap review Minor-13 flagged.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commentStrippedSource } from "../test/cssView";

function thisDirPath(filename: string): string {
  // Same plain string surgery `TimerTargets.test.tsx` uses and documents:
  // this project's jsdom environment resolves `new URL(...)` against
  // `http://localhost:3000/` instead of the given `file://` base. Replaces
  // only this file's OWN basename, so `filename` is relative to `theme/`
  // (this file's own directory) — `"tokens.css"` resolves inside `theme/`,
  // `"../index.css"` climbs out of it, both correctly.
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/tokens\.test\.ts$/, filename);
}

function rootBlockOf(source: string): string {
  const stripped = commentStrippedSource(source);
  const match = /:root\s*\{([^}]*)\}/.exec(stripped);
  expect(match, "expected exactly one :root block").not.toBeNull();
  return match![1];
}

const tokensCss = readFileSync(thisDirPath("tokens.css"), "utf-8");
const indexCss = readFileSync(thisDirPath("../index.css"), "utf-8");

const PORTRAIT_ROOT = rootBlockOf(tokensCss);

// `index.css` has exactly one `:root` block in the whole file (grep-verified
// this task), and it lives inside `@media (orientation: landscape)` — this
// extracts the block bounded by that query specifically, not just "the
// first :root in the file", so a future `:root` added OUTSIDE the landscape
// query would not be silently accepted as this one.
function landscapeRootBlockOf(source: string): string {
  const stripped = commentStrippedSource(source);
  const mediaStart = stripped.indexOf("@media (orientation: landscape)");
  expect(mediaStart, "expected a landscape media query").toBeGreaterThan(-1);
  const afterMedia = stripped.slice(mediaStart);
  const match = /:root\s*\{([^}]*)\}/.exec(afterMedia);
  expect(
    match,
    "expected a :root block inside the landscape media query",
  ).not.toBeNull();
  return match![1];
}

const LANDSCAPE_ROOT = landscapeRootBlockOf(indexCss);

/** Design spec §8 / revision's own §3-§6 tables, exactly as the brief
 *  states them (portrait/landscape order — the brief and the spec's own
 *  §8 list both write it this way; the revision's §6 recap uses the
 *  opposite landscape/portrait order for the identical values, cross-
 *  checked against its per-element tables at implementation time). */
const SCALE = [
  { name: "--size-hero", portrait: 104, landscape: 112 },
  { name: "--size-hero-tenths", portrait: 54, landscape: 58 },
  { name: "--size-subhero", portrait: 52, landscape: 56 },
  { name: "--size-target", portrait: 44, landscape: 46 },
  // These three are DELIBERATELY identical in both orientations — not an
  // oversight, the spec's own table gives them one figure each ("metric
  // 30", "total 22", "row 19"). Asserted here anyway, in both blocks, so a
  // future edit that accidentally diverges them is caught the same way a
  // deliberate divergence is.
  { name: "--size-metric", portrait: 30, landscape: 30 },
  { name: "--size-total", portrait: 22, landscape: 22 },
  { name: "--size-row", portrait: 19, landscape: 19 },
  { name: "--size-label", portrait: 10, landscape: 11 },
] as const;

function declarationCount(block: string, name: string, px: number): number {
  const re = new RegExp(
    `${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*${px}px\\s*;`,
    "g",
  );
  return (block.match(re) ?? []).length;
}

/** The value a name actually resolves to in a block — read off the real
 *  source, not the `SCALE` table's own expectation, so the "differs
 *  between orientations" check below is a fact about the CSS rather than a
 *  tautology about the fixture. */
function declaredValue(block: string, name: string): number {
  const re = new RegExp(
    `${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([0-9]+)px\\s*;`,
  );
  const match = re.exec(block);
  expect(match, `expected ${name} declared in this block`).not.toBeNull();
  return Number(match![1]);
}

describe("the size-token scale (tokens.css portrait + index.css landscape)", () => {
  it.each(SCALE)(
    "$name: portrait $portrait px in tokens.css's :root, exactly once",
    ({ name, portrait }) => {
      expect(declarationCount(PORTRAIT_ROOT, name, portrait)).toBe(1);
    },
  );

  it.each(SCALE)(
    "$name: landscape $landscape px in index.css's landscape :root, exactly once",
    ({ name, landscape }) => {
      expect(declarationCount(LANDSCAPE_ROOT, name, landscape)).toBe(1);
    },
  );

  it("names exactly eight tokens in each block — no extra, none missing", () => {
    const namesIn = (block: string) =>
      Array.from(block.matchAll(/(--size-[a-z-]+)\s*:/g))
        .map((m) => m[1])
        .toSorted();
    const expected = SCALE.map((s) => s.name).toSorted();
    expect(namesIn(PORTRAIT_ROOT)).toStrictEqual(expected);
    expect(namesIn(LANDSCAPE_ROOT)).toStrictEqual(expected);
  });

  it("differs between orientations exactly where spec §8 says it differs, never where it doesn't", () => {
    // Reads the ACTUAL declared value out of each real `:root` block —
    // not the `SCALE` fixture's own two columns compared to each other,
    // which would be a tautology about the test, not a fact about the CSS.
    // Compares SAMENESS as a boolean rather than branching into a
    // conditional `expect` (lint's own `vitest/no-conditional-expect`): one
    // unconditional assertion per token, so a mismatch in either direction
    // still fails loudly and names which token and which way.
    for (const { name, portrait, landscape } of SCALE) {
      const actualPortrait = declaredValue(PORTRAIT_ROOT, name);
      const actualLandscape = declaredValue(LANDSCAPE_ROOT, name);
      // `name` is asserted first so a failure's own diff names which token
      // broke, without a message argument (this project's vitest config
      // takes only the one `expect()` argument).
      expect([name, actualPortrait === actualLandscape]).toStrictEqual([
        name,
        portrait === landscape,
      ]);
    }
  });

  it("never introduces a second name for one role (one name, two values)", () => {
    // A second token spelling either block might use instead of redefining
    // the same one (e.g. a landscape-only `--size-hero-landscape`) would
    // slip past the exact-eight-names check above if it also kept the
    // canonical eight — this greps both raw sources (not just the :root
    // blocks) for the tell-tale shape and fails loudly if found.
    for (const source of [tokensCss, indexCss]) {
      const stripped = commentStrippedSource(source);
      expect(stripped).not.toMatch(/--size-[a-z-]+-landscape/);
      expect(stripped).not.toMatch(/--size-[a-z-]+-portrait/);
    }
  });
});
