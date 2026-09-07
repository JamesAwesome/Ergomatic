import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Phase RW spec §1.3 / §9 item 8: `ASSUMED_BASELINES` prices DURATIONS
 *  and nothing else. A `Phase` built against it carries a real-looking
 *  `targetSplit`, one refactor away from `pieceList`, the PM5 compiler
 *  or a log seed. The claim this test pins, exactly: no non-test file
 *  under `domain/`, `src/` or `server/` IMPORTS the constant except the
 *  two duration pricers, and `domain/pace.ts` is its one definition. A
 *  new importer fails here and argues its case in review. Matches the
 *  import statement, not the bare name, so a comment may mention it.
 *  Same shape as `judgeBand.test.ts`: read the source, not the runtime. */
const ROOT = path.resolve(__dirname, "..");
/** Every importer prices a DURATION and returns numbers only. No `Phase`
 *  built against the assumed pair leaves any of them:
 *  - `expand.ts` — `estimateMinutes` (PR A).
 *  - `builderState.ts` — `rowMinutes` (PR A).
 *  - `display/stepDetail.ts` — `workAndTotal`'s WORK half (PR B), which
 *    must price against the same pair TOTAL does or the two disagree. */
const ALLOWED_IMPORTERS = [
  "domain/expand.ts",
  "domain/display/stepDetail.ts",
  "src/builder/builderState.ts",
];
const DEFINITION = "domain/pace.ts";
const IMPORT_RE =
  /import\s+(?:type\s+)?\{[^}]*\bASSUMED_BASELINES\b[^}]*\}\s+from\s+"[^"]*pace\.js"/;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("ASSUMED_BASELINES census", () => {
  const files = [
    ...walk(path.join(ROOT, "domain"), []),
    ...walk(path.join(ROOT, "src"), []),
    ...walk(path.join(ROOT, "server"), []),
  ];

  it("is imported only where a duration is priced (domain, src and server)", () => {
    const importers = files
      .filter((f) => IMPORT_RE.test(readFileSync(f, "utf-8")))
      .map((f) => path.relative(ROOT, f))
      .sort();
    expect(importers).toStrictEqual([...ALLOWED_IMPORTERS].sort());
  });

  it("is defined once, in domain/pace.ts", () => {
    const definers = files
      .filter((f) =>
        /export const ASSUMED_BASELINES\b/.test(readFileSync(f, "utf-8")),
      )
      .map((f) => path.relative(ROOT, f));
    expect(definers).toStrictEqual([DEFINITION]);
  });
});
