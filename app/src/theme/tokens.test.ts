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
// `@media (orientation: landscape)` query.
//
// Both blocks are located by `scopedRuleBodies` (`../test/cssView`), a
// brace-depth scanner, and both lookups assert `toHaveLength(1)`. The
// earlier hand-rolled version of this file claimed exactly those two
// properties and proved neither — the test-integrity sweep's P8 and P9.
// `.exec(/:root\s*\{([^}]*)\}/)` returns the FIRST match and never looks at
// a second, so appending `:root { --size-hero: 999px; }` to `tokens.css` —
// later in source order at equal specificity, so `--size-hero` genuinely
// resolves to 999px app-wide — left 22/22 green. And `slice(indexOf("@media
// (orientation: landscape)"))` found the FIRST landscape query
// (`index.css:3457`, the countdown one), then ran to EOF across four query
// boundaries, so hoisting this whole token block out of its media query to
// top level — which renders portrait phones at landscape type sizes — also
// left 22/22 green. Both mutations now fail.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  commentStrippedSource,
  cssRules,
  scopedRuleBodies,
} from "../test/cssView";

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

const LANDSCAPE_QUERY = "@media (orientation: landscape)";

const tokensCss = commentStrippedSource(
  readFileSync(thisDirPath("tokens.css"), "utf-8"),
);
const indexCss = commentStrippedSource(
  readFileSync(thisDirPath("../index.css"), "utf-8"),
);

/** The portrait half: every TOP-LEVEL `:root` block in `tokens.css`.
 *  `at: []` is what makes "top-level" a checked fact rather than an
 *  assumption; the count is pinned by its own test below, not here, so a
 *  second block fails as a named test rather than as a collection error
 *  that reports zero tests run. */
const PORTRAIT_ROOTS = scopedRuleBodies(tokensCss, ":root");

/** The landscape half: every `:root` block genuinely nested inside a
 *  `@media (orientation: landscape)` query. `index.css` carries FIVE such
 *  queries; this searches all of them and none of the top-level CSS
 *  between or after them. */
const LANDSCAPE_ROOTS = scopedRuleBodies(indexCss, ":root", [LANDSCAPE_QUERY]);

const PORTRAIT_ROOT = PORTRAIT_ROOTS[0] ?? "";
const LANDSCAPE_ROOT = LANDSCAPE_ROOTS[0] ?? "";

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
  // connected-revamp Task 7's own ninth step (revision §5: "Countdown
  // 128px landscape / 118px portrait") — declared and redefined in both
  // `:root` blocks exactly like the original eight, so it belongs in this
  // same table rather than a parallel one.
  { name: "--size-countdown", portrait: 118, landscape: 128 },
] as const;

// `--size-elapsed` (connected-revamp Task 7, revision §5: "ELAPSED beneath
// at 26px" — one figure, no landscape/portrait split) is declared ONLY in
// `tokens.css`'s portrait `:root`; the landscape block never redefines it
// because there is nothing to redefine — the same cascade that reaches
// every other undeclared-in-landscape token would carry it forward anyway.
// Kept OUT of `SCALE` (whose two-column shape asserts a landscape
// re-declaration must exist) and out of the "exactly N names" counts below,
// with its own dedicated assertions instead.
const ELAPSED_NAME = "--size-elapsed";
const ELAPSED_PX = 26;

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
  // P9. Not "at least one": a SECOND `:root` later in source order at equal
  // specificity wins the cascade, and the old `.exec` never looked at it.
  it("tokens.css declares exactly one :root block, at the top level", () => {
    expect(PORTRAIT_ROOTS).toHaveLength(1);
  });

  // P8. Two halves, both previously unproven: the block is inside a
  // landscape query (hoisting it to top level used to pass), and it is the
  // only `:root` index.css has anywhere (`:root` at top level would apply
  // in BOTH orientations while looking, to the old slice, exactly like this
  // one).
  it("index.css declares exactly one :root block, and it is inside a landscape media query", () => {
    expect(LANDSCAPE_ROOTS).toHaveLength(1);
    expect(scopedRuleBodies(indexCss, ":root")).toStrictEqual([]);
    expect(
      cssRules(indexCss).filter((rule) => rule.selectors.includes(":root")),
    ).toHaveLength(1);
  });

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

  it("names exactly nine tokens in the landscape block, ten in portrait (the ninth plus --size-elapsed) — no extra, none missing", () => {
    const namesIn = (block: string) =>
      Array.from(block.matchAll(/(--size-[a-z-]+)\s*:/g))
        .map((m) => m[1])
        .toSorted();
    const scaleNames = SCALE.map((s) => s.name);
    expect(namesIn(PORTRAIT_ROOT)).toStrictEqual(
      [...scaleNames, ELAPSED_NAME].toSorted(),
    );
    expect(namesIn(LANDSCAPE_ROOT)).toStrictEqual(scaleNames.toSorted());
  });

  it(`${ELAPSED_NAME}: ${ELAPSED_PX}px in tokens.css's :root, exactly once, and absent from the landscape block`, () => {
    expect(declarationCount(PORTRAIT_ROOT, ELAPSED_NAME, ELAPSED_PX)).toBe(1);
    expect(LANDSCAPE_ROOT).not.toContain(ELAPSED_NAME);
  });

  it("differs between orientations exactly where spec §8 says it differs, never where it doesn't", () => {
    // HONEST SCOPE (test-integrity sweep, S0d — adjudicated and disclosed
    // rather than deleted): this cannot be the SOLE failure. The two
    // `it.each` blocks above already pin each name to its exact px in each
    // block via `declarationCount(...) === 1`, and `declaredValue` reads
    // that same single declaration, so `actualPortrait === actualLandscape`
    // is determined by SCALE's own two columns once those pass. It is kept
    // because it states spec §8's differ/don't-differ shape in one place
    // and names the offending token in its diff; it is NOT a second,
    // independent check, and nothing here should be counted as one.
    //
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
    // canonical eight — this greps both whole sources (not just the :root
    // blocks) for the tell-tale shape and fails loudly if found.
    for (const source of [tokensCss, indexCss]) {
      expect(source).not.toMatch(/--size-[a-z-]+-landscape/);
      expect(source).not.toMatch(/--size-[a-z-]+-portrait/);
    }
  });
});
