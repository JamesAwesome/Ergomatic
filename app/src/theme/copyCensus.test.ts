import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commentStrippedSource } from "../test/cssView";

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
 * A grep is the right instrument precisely because the failure is a WORD
 * rather than a behaviour: no rendering test, no type, and no review round
 * catches a name that is spelled correctly and reads naturally. This is the
 * same shape as the repo's PM5-in-copy rule, and it runs for the same reason.
 *
 * Scope is deliberately narrow. It reads STRING LITERALS and JSX TEXT in
 * `src/**`, with comments stripped first — a comment explaining a ruling may
 * name whoever made it, and the record should. Test files are excluded: their
 * fixtures quote copy on purpose, and they are not a rendering surface.
 */

function thisDirPath(filename: string): string {
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/[^/]+$/, "")
    .concat(filename);
}

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFilesUnder(full);
    const isSource = /\.tsx?$/.test(full);
    const isTest = /\.test\.tsx?$/.test(full) || full.includes("/test/");
    return isSource && !isTest ? [full] : [];
  });
}

/** Names that must never appear in something a rower can read. */
const FORBIDDEN = ["James"];

describe("copy census: no rendering surface names a person", () => {
  const files = sourceFilesUnder(thisDirPath(".."));

  it("reads a real, non-trivial set of source files", () => {
    // Independent floor: if the walk silently returned nothing, every
    // assertion below would pass vacuously (RF21).
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(FORBIDDEN)("no string literal or JSX text contains %s", (name) => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = commentStrippedSource(readFileSync(file, "utf-8"));
      for (const [index, line] of source.split("\n").entries()) {
        if (!line.includes(name)) continue;
        // A path or URL carrying the GitHub org is not copy.
        if (/JamesAwesome|github\.com/.test(line)) continue;
        offenders.push(`${file.split("/src/")[1] ?? file}:${index + 1}`);
      }
    }
    expect(
      offenders,
      `user-facing copy must not name a person; found in:\n  ${offenders.join("\n  ")}`,
    ).toStrictEqual([]);
  });
});
