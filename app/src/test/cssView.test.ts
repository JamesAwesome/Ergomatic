import { describe, expect, it } from "vitest";
import {
  atRuleBodies,
  commentStrippedSource,
  cssRules,
  scopedRuleBodies,
} from "./cssView";

describe("commentStrippedSource", () => {
  it("strips a CSS block comment, leaving the declaration it decorated", () => {
    const css = `.foo {\n  /* min-height: 0 lives in the comment, not the rule */\n  color: red;\n}`;
    expect(commentStrippedSource(css)).toBe(`.foo {\n  \n  color: red;\n}`);
  });

  it("THE DEFECT ITSELF, reproduced and closed: a declaration that is GONE, but whose doc comment still says the words, no longer satisfies a naive toContain() once stripped", () => {
    const css = `/* min-height: 0 used to be here */\n.foo {\n  color: red;\n}`;
    const stripped = commentStrippedSource(css);
    // Un-stripped, this would wrongly pass:
    expect(css).toContain("min-height: 0");
    // Stripped, it correctly does not:
    expect(stripped).not.toContain("min-height: 0");
  });

  it("strips a whole-line TSX // comment", () => {
    const tsx = `function f() {\n  // this mentions <SheetShell> too\n  return <div />;\n}`;
    const stripped = commentStrippedSource(tsx);
    expect(stripped).not.toContain("//");
    expect(stripped).toContain("return <div />;");
  });

  it("leaves a trailing same-line // comment alone (only whole-line comments are stripped, matching the three prior call sites)", () => {
    const tsx = `const x = 1; // not stripped`;
    expect(commentStrippedSource(tsx)).toBe(tsx);
  });

  it("strips multiple block comments and multiple line comments together", () => {
    const src = [
      "/* one */",
      ".a { color: blue; }",
      "// two",
      ".b { color: green; }",
      "/* three\n   spanning lines */",
      ".c { color: red; }",
    ].join("\n");
    const stripped = commentStrippedSource(src);
    expect(stripped).not.toContain("one");
    expect(stripped).not.toContain("two");
    expect(stripped).not.toContain("three");
    expect(stripped).toContain(".a { color: blue; }");
    expect(stripped).toContain(".b { color: green; }");
    expect(stripped).toContain(".c { color: red; }");
  });

  it("is a no-op on source with no comments at all", () => {
    const src = ".a { color: blue; }\n.b { color: green; }";
    expect(commentStrippedSource(src)).toBe(src);
  });
});

// The stylesheet the scanner tests below run against: deliberately shaped
// like the real defects the sweep proved (a base rule and a media override
// for the SAME class; two `@media (orientation: landscape)` queries, not
// one; top-level rules sitting AFTER the last media query, which is where
// `slice(lastIndexOf(...))` wrongly looked).
const SHEET = [
  ":root {",
  "  --size-hero: 104px;",
  "}",
  ".row {",
  "  height: 40px;",
  "  box-sizing: border-box;",
  "}",
  "@media (orientation: portrait) {",
  "  .only-portrait {",
  "    display: block;",
  "  }",
  "}",
  "@media (orientation: landscape) {",
  "  .timer-screen {",
  "    display: flex;",
  "  }",
  "}",
  "@media (orientation: landscape) {",
  "  :root {",
  "    --size-hero: 112px;",
  "  }",
  "  .pane .row {",
  "    height: 32px;",
  "  }",
  "  .spm,",
  "  .hr {",
  "    flex: 0.6;",
  "  }",
  "}",
  ".after-the-last-query {",
  "  height: 32px;",
  "}",
].join("\n");

describe("cssRules", () => {
  it("tags every rule with the at-rule chain that really encloses it", () => {
    expect(
      cssRules(SHEET).map((rule) => [rule.selectors, rule.at]),
    ).toStrictEqual([
      [[":root"], []],
      [[".row"], []],
      [[".only-portrait"], ["@media (orientation: portrait)"]],
      [[".timer-screen"], ["@media (orientation: landscape)"]],
      [[":root"], ["@media (orientation: landscape)"]],
      [[".pane .row"], ["@media (orientation: landscape)"]],
      [[".spm", ".hr"], ["@media (orientation: landscape)"]],
      [[".after-the-last-query"], []],
    ]);
  });

  it("returns each rule's own body, not the enclosing query's", () => {
    const bodies = cssRules(SHEET)
      .filter((rule) => rule.selectors.includes(":root"))
      .map((rule) => rule.body.trim());
    expect(bodies).toStrictEqual([
      "--size-hero: 104px;",
      "--size-hero: 112px;",
    ]);
  });

  it("throws on unbalanced braces rather than silently mis-scoping", () => {
    expect(() => cssRules("@media (x) { .a { color: red; }")).toThrow(
      /unbalanced CSS/,
    );
    expect(() => cssRules(".a { color: red; } }")).toThrow(/unbalanced CSS/);
  });
});

describe("atRuleBodies", () => {
  it("returns EVERY matching query, in source order — not the first, not the last", () => {
    const landscape = atRuleBodies(SHEET, "@media (orientation: landscape)");
    expect(landscape).toHaveLength(2);
    expect(landscape[0]).toContain(".timer-screen");
    expect(landscape[1]).toContain("--size-hero: 112px;");
  });

  it("stops at the query's own close brace, so top-level CSS after it is excluded", () => {
    const landscape = atRuleBodies(SHEET, "@media (orientation: landscape)");
    expect(landscape.join("\n")).not.toContain("after-the-last-query");
  });

  it("returns nothing for a query the sheet does not contain", () => {
    expect(atRuleBodies(SHEET, "@media (min-width: 900px)")).toStrictEqual([]);
  });
});

describe("scopedRuleBodies", () => {
  it("finds a top-level rule at `at: []`", () => {
    expect(scopedRuleBodies(SHEET, ".row")).toStrictEqual([
      "\n  height: 40px;\n  box-sizing: border-box;\n",
    ]);
  });

  it("finds a rule genuinely inside a media query", () => {
    expect(
      scopedRuleBodies(SHEET, ":root", ["@media (orientation: landscape)"]),
    ).toStrictEqual(["\n    --size-hero: 112px;\n  "]);
  });

  // THE DEFECT ITSELF, closed: `slice(indexOf("@media …"))` on this sheet
  // returns a window that contains BOTH `:root` blocks and every top-level
  // rule after the query, so the naive idiom cannot tell "declared inside
  // this query" from "declared anywhere below its opening line".
  it("does NOT find a declaration that lives OUTSIDE the target block", () => {
    // `--size-hero: 104px` is real, and it is at the top level.
    expect(SHEET).toContain("--size-hero: 104px");
    const inLandscape = scopedRuleBodies(SHEET, ":root", [
      "@media (orientation: landscape)",
    ]);
    expect(inLandscape.join("")).not.toContain("104px");

    // `.after-the-last-query { height: 32px }` sits past the final query's
    // close brace; the flat-string idiom used to sweep it up.
    const naive = SHEET.slice(
      SHEET.lastIndexOf("@media (orientation: landscape)"),
    );
    expect(naive).toContain("after-the-last-query");
    const scoped = atRuleBodies(SHEET, "@media (orientation: landscape)").join(
      "\n",
    );
    expect(scoped).not.toContain("after-the-last-query");
  });

  it("hoisting a rule out of its query makes the scoped lookup empty", () => {
    const hoisted = SHEET.replace(
      "  .pane .row {\n    height: 32px;\n  }\n",
      "",
    ).concat("\n.pane .row {\n  height: 32px;\n}\n");
    expect(hoisted).toContain("height: 32px");
    expect(
      scopedRuleBodies(hoisted, ".pane .row", [
        "@media (orientation: landscape)",
      ]),
    ).toStrictEqual([]);
    expect(scopedRuleBodies(hoisted, ".pane .row")).toHaveLength(1);
  });

  it("matches a selector-list entry exactly, never as a substring", () => {
    // `.row` and `.pane .row` are different rules in different scopes; the
    // substring idiom conflated them.
    expect(scopedRuleBodies(SHEET, ".row")).toHaveLength(1);
    expect(
      scopedRuleBodies(SHEET, ".pane .row", [
        "@media (orientation: landscape)",
      ]),
    ).toHaveLength(1);
    expect(scopedRuleBodies(SHEET, "row")).toStrictEqual([]);
  });

  it("splits a comma-joined selector list so either half is findable", () => {
    const at = ["@media (orientation: landscape)"];
    expect(scopedRuleBodies(SHEET, ".spm", at)).toStrictEqual([
      "\n    flex: 0.6;\n  ",
    ]);
    expect(scopedRuleBodies(SHEET, ".hr", at)).toStrictEqual([
      "\n    flex: 0.6;\n  ",
    ]);
  });

  it("collapses whitespace in both the query and the selector, so a reformatted stylesheet still matches", () => {
    const reflowed = ".pane\n  .row  {\n  color: red;\n}";
    expect(scopedRuleBodies(reflowed, ".pane .row")).toStrictEqual([
      "\n  color: red;\n",
    ]);
  });
});
