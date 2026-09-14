import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO USER-FACING STRING NAMES A PERSON.
 *
 * The defect this exists for reached a real rower. "Ask James to add you."
 * shipped on three surfaces; a household member outside the allowlist tried to
 * sign in and was shown the owner's first name by an app she had no account
 * on. It had already been asked for once — the instruction was to stop using
 * the name in prose — and it was read as covering comments and records but not
 * product copy, so the copy kept saying it.
 *
 * A census is the right instrument precisely because the failure is a WORD
 * rather than a behaviour: no rendering test, no type, and no review round
 * catches a name that is spelled correctly and reads naturally.
 *
 * IT IS NOT THE SAME INSTRUMENT AS THE PM5-IN-COPY RULE, and an earlier draft
 * of this file said it was. That rule uses `src/test/renderedCopy.ts`, a sweep
 * over RENDERED text and attributes. This is a source scan, which trades a
 * different set of errors: it reaches files no test renders, and it pays for
 * that by needing to know what is copy and what is commentary.
 *
 * TWO THINGS IT GETS RIGHT ON PURPOSE, both learned by getting them wrong:
 *
 * 1. It scans `domain/`, `src/` AND `server/`, matching the precedent in
 *    `assumedBaselinesCensus.test.ts`. Scanning `src/` alone — the first
 *    draft — left the 300 seeded workout titles in `server/seed/library/` and
 *    the step labels in `domain/` unguarded while the title claimed every
 *    rendering surface.
 * 2. It matches only inside QUOTED STRINGS and JSX TEXT, never whole lines.
 *    The first draft stripped comments with a helper whose own docs warn it
 *    only handles whole-line `//` — so the first trailing `foo(); // James
 *    ruled X` in a 240-file tree would have failed CI telling its author that
 *    their COPY names a person. A comment explaining a ruling may name whoever
 *    made it, and the record should.
 */

const ROOT = path.resolve(__dirname, "..", "..");

/** Names that must never appear in something a rower can read. */
const FORBIDDEN = ["James"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    const isSource = /\.tsx?$/.test(full);
    const isTest =
      /\.test\.tsx?$/.test(full) || full.includes(`${path.sep}test${path.sep}`);
    return isSource && !isTest ? [full] : [];
  });
}

/**
 * Every quoted string and every run of JSX text in `source`, with comments and
 * import paths excluded. Deliberately simple: it over-collects (a quoted
 * className is "copy" to it) rather than under-collecting, because a false
 * positive is a conversation and a false negative is a rower reading a name.
 */
function readableText(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const withoutImports = withoutComments.replace(
    /^\s*(import|export)\s.*?from\s.*$/gm,
    "",
  );
  const out: string[] = [];
  // Quoted strings and template literals.
  for (const m of withoutImports.matchAll(
    /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g,
  )) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  // JSX text: between a closing > and an opening <, on lines that are prose.
  for (const m of withoutImports.matchAll(/>([^<>{}]{2,})</g)) out.push(m[1]);
  return out;
}

describe("copy census: no rendering surface names a person", () => {
  const files = [
    ...walk(path.join(ROOT, "domain")),
    ...walk(path.join(ROOT, "src")),
    ...walk(path.join(ROOT, "server")),
  ];

  it("walks a real, non-trivial set of source files across all three roots", () => {
    // Independent floor: a silently-empty walk would make every assertion
    // below pass vacuously (RF21).
    expect(files.length).toBeGreaterThan(200);
    for (const root of ["domain", "src", "server"]) {
      expect(
        files.some((f) => f.includes(`${path.sep}${root}${path.sep}`)),
        `walk reached no files under ${root}/`,
      ).toBe(true);
    }
  });

  it.each(FORBIDDEN)("no quoted string or JSX text contains %s", (name) => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      for (const text of readableText(source)) {
        if (!text.includes(name)) continue;
        // The GitHub org is a path, not copy.
        if (/JamesAwesome/.test(text)) continue;
        offenders.push(
          `${path.relative(ROOT, file)}: ${text.trim().slice(0, 60)}`,
        );
      }
    }
    expect(
      offenders,
      `user-facing copy must not name a person; found:\n  ${offenders.join("\n  ")}`,
    ).toStrictEqual([]);
  });
});
