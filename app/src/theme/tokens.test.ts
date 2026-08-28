// The size-token scale (connected-revamp Task 2, design spec §8) — pinned
// in a fix round after review (Important-2): sixteen load-bearing numbers
// and eight names shipped with nothing asserting any of them, and at Task 2
// time nothing consumed them either (Tasks 3/5/7 were to be the first real
// callers), so a typo'd name or a transposed portrait/landscape pair would
// have failed silently until someone eyeballed a screenshot. This is the
// repo's own `spec-blind-tests` rule: an unconsumed semantic helper needs a
// spec re-derivation at review, first consumer in the same task where
// possible. Neither happened at Task 2 time; this file is the
// re-derivation. Eight of the nine did get their caller; `--size-total` did
// not until the fix round below, which is why the consumer census at the
// bottom of this file now exists.
//
// FIVE OF THE ORIGINAL NINE RETIRED (CR2 spec 3 Tasks 4 and 5): the
// connected surface forked onto its own `--c-size-*` family, which was
// these five's only real consumer despite the "shared" name — Task 4 took
// four (`--size-hero`, `--size-hero-tenths`, `--size-target`,
// `--size-metric`), Task 5 the fifth (`--size-row`, once the connected grid
// migrated its last remaining `var(--size-row)` onto `--c-size-row`).
// `SCALE` below is the CURRENT membership, four names plus
// `--size-elapsed`, not the original nine this header paragraph describes
// as history.
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

import { readdirSync, readFileSync } from "node:fs";
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
// FIVE NAMES RETIRED (CR2 spec 3 Tasks 4 and 5): `--size-hero`, `--size-
// hero-tenths`, `--size-target` and `--size-metric` were, in practice,
// connected-only — the redesign forks the connected surface onto its own
// `--c-size-*` family entirely, leaving these four with zero consumers
// anywhere in `index.css`. Task 5 retires the fifth, `--size-row`: the
// connected grid was its last real consumer and migrated onto
// `--c-size-row` instead, completing design spec §1's "connected rules
// stop consuming `--size-*` entirely". `tokens.css`'s own comment on the
// portrait `:root` block has the full reasoning; this table shrinks to
// match the CSS it pins.
const SCALE = [
  { name: "--size-subhero", portrait: 52, landscape: 56 },
  // Identical in both orientations — not an oversight, the spec's own
  // table gives it one figure ("total 22"). Asserted here anyway, in both
  // blocks, so a future edit that accidentally diverges it is caught the
  // same way a deliberate divergence is.
  { name: "--size-total", portrait: 22, landscape: 22 },
  { name: "--size-label", portrait: 10, landscape: 11 },
  // connected-revamp Task 7's own extra step (revision §5: "Countdown
  // 128px landscape / 118px portrait") — declared and redefined in both
  // `:root` blocks exactly like the roles above, so it belongs in this
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

  it("names exactly four tokens in the landscape block, five in portrait (the four plus --size-elapsed) — no extra, none missing", () => {
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

  // THE DEAD TOKEN, AND THE RULE THAT KEEPS ANOTHER ONE FROM SHIPPING
  // (final review, Minor-1; the sweep's S0d confirms it independently).
  // `--size-total` shipped declared in both `:root` blocks and pinned three
  // ways by the tests above, with nothing in `index.css` referencing it —
  // while `.timer-total-value` carried a hardcoded `font-size: 22px`. So
  // 22px lived in three places, the tests guarded a number no pixel
  // depended on, and this file's own header invoked the repo's
  // `spec-blind-tests` rule ("Tasks 3/5/7 are the first real callers")
  // while that promise went unkept for one of nine. The literal is now
  // `var(--size-total)` and this asserts the general rule: every name in
  // the scale has at least one real consumer. Counted off the
  // comment-stripped source, so a prose mention cannot satisfy it.
  it("every token in the scale is actually CONSUMED by index.css — no more dead names", () => {
    const consumers = (name: string) =>
      indexCss.split(`var(${name})`).length - 1;
    for (const name of [...SCALE.map((s) => s.name), ELAPSED_NAME]) {
      expect([name, consumers(name) > 0]).toStrictEqual([name, true]);
    }
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

// ---------------------------------------------------------------------------
// THE CONNECTED-ONLY SCALE, `--c-size-*` (CR2 spec 3 task 1, design spec §1:
// "Type scale — connected-scoped tokens, NOT the shared `--size-*` family").
// Same shape as the `--size-*` pin above, deliberately: this is the SAME
// "one name, two values, never a second name" rule, applied to a family
// scoped to `.connected-surface` instead of `:root` — antagonist finding 2
// on the parent spec is what forced the scoping (the shared `--size-*` pair
// reaches the phone timer too; a connected-only family declared on `:root`
// would have been invisible to nobody).
//
// TEN OF TEN NOW WIRED (CR2 spec 3 Tasks 1, 4, 5 and 6): `--c-size-control`
// (Task 1, `SegmentedControl`), `--c-size-hero`/`-hero-2`/`-tenths`/
// `-target`/`-band` (Task 4, the heroes and the band), `--c-size-row`/
// `-thead` (Task 5, the grid's own row values and table head,
// `.connected-grid-row > span`/`.connected-grid-head > span`) and, closing
// the one holdout Task 5 left named, `--c-size-status` (Task 6,
// `.connected-line-trailing` — the header status caption every pane
// shares, `ConnectionLine.tsx`'s own comment has the wiring). The test
// below used to name the holdout explicitly rather than skip the "every
// token is consumed" check entirely; now every token has a real consumer,
// so the exception is gone rather than left beside a token that no longer
// needs it (this block's own prior comment named that as the trigger to
// drop it, not to add a second one).
// ---------------------------------------------------------------------------

const C_SIZE_SCALE = [
  { name: "--c-size-hero", portrait: 100, landscape: 112 },
  { name: "--c-size-hero-2", portrait: 84, landscape: 92 },
  { name: "--c-size-tenths", portrait: 52, landscape: 58 },
  { name: "--c-size-target", portrait: 36, landscape: 40 },
  { name: "--c-size-band", portrait: 28, landscape: 30 },
  { name: "--c-size-status", portrait: 21, landscape: 22 },
  { name: "--c-size-row", portrait: 19, landscape: 19 },
  { name: "--c-size-label", portrait: 14, landscape: 15 },
  { name: "--c-size-control", portrait: 13, landscape: 13 },
  { name: "--c-size-thead", portrait: 12, landscape: 12 },
] as const;

const CONNECTED_SURFACE_SELECTOR = ".connected-surface";

/** Both halves live in `index.css` — portrait ON the class at the top
 *  level, landscape redefined inside the SAME `@media (orientation:
 *  landscape)` query the `--size-*` landscape half uses (that block's own
 *  comment explains why a second landscape query must never exist). */
const C_SIZE_PORTRAIT_ROOTS = scopedRuleBodies(
  indexCss,
  CONNECTED_SURFACE_SELECTOR,
);
const C_SIZE_LANDSCAPE_ROOTS = scopedRuleBodies(
  indexCss,
  CONNECTED_SURFACE_SELECTOR,
  [LANDSCAPE_QUERY],
);
const C_SIZE_PORTRAIT_ROOT = C_SIZE_PORTRAIT_ROOTS[0] ?? "";
const C_SIZE_LANDSCAPE_ROOT = C_SIZE_LANDSCAPE_ROOTS[0] ?? "";

describe("the --c-size-* connected-only scale (index.css, on .connected-surface)", () => {
  it("`.connected-surface` resolves to exactly one top-level rule and one landscape rule", () => {
    // The same P8/P9 shape as the `--size-*` pin above: a second rule for
    // this exact selector at the same specificity would win the cascade on
    // whichever property it redeclared, silently, and `.exec`-style
    // first-match tests would never see it.
    expect(C_SIZE_PORTRAIT_ROOTS).toHaveLength(1);
    expect(C_SIZE_LANDSCAPE_ROOTS).toHaveLength(1);
  });

  it.each(C_SIZE_SCALE)(
    "$name: portrait $portrait px on .connected-surface, exactly once",
    ({ name, portrait }) => {
      expect(declarationCount(C_SIZE_PORTRAIT_ROOT, name, portrait)).toBe(1);
    },
  );

  it.each(C_SIZE_SCALE)(
    "$name: landscape $landscape px on .connected-surface, exactly once",
    ({ name, landscape }) => {
      expect(declarationCount(C_SIZE_LANDSCAPE_ROOT, name, landscape)).toBe(1);
    },
  );

  // CR2 spec 3 Task 6: all ten now have a real consumer in `index.css` —
  // counted off the comment-stripped source, so a prose mention cannot
  // satisfy it, the same idiom the `--size-*` version of this test above
  // uses. `--c-size-status` was the one deliberate exception through Task
  // 5; this task's own wiring (`ConnectionLine.tsx`'s comment) is what
  // closes it.
  it("all ten tokens are CONSUMED by index.css", () => {
    const consumers = (name: string) =>
      indexCss.split(`var(${name})`).length - 1;
    for (const { name } of C_SIZE_SCALE) {
      expect([name, consumers(name) > 0]).toStrictEqual([name, true]);
    }
  });

  it("names exactly the ten tokens in both blocks — no extra, none missing", () => {
    const namesIn = (block: string) =>
      Array.from(block.matchAll(/(--c-size-[a-z0-9-]+)\s*:/g))
        .map((m) => m[1])
        .toSorted();
    const scaleNames = C_SIZE_SCALE.map((s) => s.name).toSorted();
    expect(namesIn(C_SIZE_PORTRAIT_ROOT)).toStrictEqual(scaleNames);
    expect(namesIn(C_SIZE_LANDSCAPE_ROOT)).toStrictEqual(scaleNames);
  });

  it("differs between orientations exactly where the spec says it differs, never where it doesn't", () => {
    // Same honest-scope disclosure as the `--size-*` version of this test:
    // not a second independent check, kept because it states the
    // differ/don't-differ shape in one place and names the offending token.
    for (const { name, portrait, landscape } of C_SIZE_SCALE) {
      const actualPortrait = declaredValue(C_SIZE_PORTRAIT_ROOT, name);
      const actualLandscape = declaredValue(C_SIZE_LANDSCAPE_ROOT, name);
      expect([name, actualPortrait === actualLandscape]).toStrictEqual([
        name,
        portrait === landscape,
      ]);
    }
  });

  it("never introduces a second name for one role, and never leaks onto :root", () => {
    for (const source of [tokensCss, indexCss]) {
      expect(source).not.toMatch(/--c-size-[a-z0-9-]+-landscape/);
      expect(source).not.toMatch(/--c-size-[a-z0-9-]+-portrait/);
    }
    // The whole point of scoping to `.connected-surface` (design spec §1,
    // antagonist finding 2): declared on `:root`, the family would reach
    // the phone timer too. This greps the ACTUAL `:root` blocks this file
    // already isolates above, so a `--c-size-*` declaration accidentally
    // added to either one fails here, not by a reviewer noticing.
    expect(PORTRAIT_ROOT).not.toMatch(/--c-size-/);
    expect(LANDSCAPE_ROOT).not.toMatch(/--c-size-/);
  });

  // THE FULL SPEC EXIT CRITERION, NOW ALL OF IT (design spec §1: "connected
  // rules stop consuming `--size-*` entirely"). Task 1 shipped this pin
  // scoped to only the rules it touched itself (the header and the
  // segmented control, `PagerRail`'s replacement), because every pane kept
  // its own internals — and therefore its own `--size-*` reads — until
  // Tasks 4 and 5 migrated them. Task 4 moved the two heroes' family onto
  // `--c-size-*` entirely; Task 5 (this widening) moves the grid's last
  // holdout, `--size-row` → `--c-size-row` (`.connected-grid-row > span`,
  // `index.css`), which is what makes the WHOLE `.connected-*` selector
  // family — not a scoped subset — safe to assert here.
  it("EVERY `.connected-*` rule in index.css never consumes var(--size-*)", () => {
    const rules = cssRules(indexCss).filter((rule) =>
      rule.selectors.some((s) => /(^|[\s,])\.connected-[\w-]+/.test(`${s} `)),
    );
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect([rule.selectors.join(", "), rule.body]).toStrictEqual([
        rule.selectors.join(", "),
        expect.not.stringContaining("var(--size-"),
      ]);
    }
  });
});

// The two censuses above prove no dead name inside their own scales. This one
// generalises the same rule to EVERY token tokens.css defines, because the
// gap between them is where `--pain-ramp-1..5` lived.
//
// WHAT IT COST TO NOT HAVE THIS: the ramp outlived its only consumer by
// weeks, and THREE separate comments — `index.css`, `ClassificationCard.tsx`
// and `docs/design/DEVIATIONS.md` — each asserted `LogSession.tsx` was still
// using it. Nothing was. This is recurring failure 5's fourth instance
// (`.col-*`, `.set-toggle`, `.field-dur`/`.field-spm`, then the ramp), and it
// is the one variant no existing gate could see: a defined-but-unread custom
// property is invisible to tsc, to eslint, and to every runtime assertion in
// the suite, because it neither breaks nor renders.
//
// SCOPE, and why it is wider than `indexCss`: four `--type-*` tokens are read
// only from `PyramidFigure.tsx`, so an index.css-only census would call them
// dead. It reads `src/` and `e2e/` — everywhere a token can actually be
// consumed — off comment-stripped source, so a prose mention of a name (which
// is exactly what the ramp had three of) cannot keep it alive.
const CONSUMER_ROOTS = ["src", "e2e"];

function sourceFilesUnder(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFilesUnder(full, acc);
    else if (/\.(ts|tsx|css|html)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe("the token palette as a whole", () => {
  it("defines no token that nothing reads — a dead token is invisible to every other gate", () => {
    const defined = [
      ...new Set(
        [...PORTRAIT_ROOT.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]),
      ),
    ];

    // Not decoration: if the parse ever stops matching, `dead` is empty and
    // the real assertion passes vacuously — the "gate that cannot go red"
    // shape this repo has shipped twice (recurring failure 21).
    expect(defined.length).toBeGreaterThan(20);

    const haystack = CONSUMER_ROOTS.flatMap((root) =>
      sourceFilesUnder(thisDirPath(`../../${root}`)),
    )
      .map((file) => commentStrippedSource(readFileSync(file, "utf-8")))
      .join("\n");

    // `var(--x)` and `var(--x, fallback)` both count as a read.
    const dead = defined.filter(
      (token) => !new RegExp(`var\\(\\s*${token}\\s*[,)]`).test(haystack),
    );

    expect(dead).toStrictEqual([]);
  });
});
