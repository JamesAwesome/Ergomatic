import { describe, expect, it } from "vitest";
import { commentStrippedSource } from "./cssView";

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
