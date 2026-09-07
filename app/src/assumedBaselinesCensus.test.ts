import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Phase RW spec §1.3 / §9 item 8: `ASSUMED_BASELINES` prices DURATIONS
 *  and nothing else. A `Phase` built against it carries a real-looking
 *  `targetSplit`, one refactor away from `pieceList`, the PM5 compiler
 *  or a log seed. This census pins who may import the constant; a new
 *  importer fails here and has to argue its case in review. Same shape
 *  as `judgeBand.test.ts`: read the source, not the runtime. */
const ROOT = path.resolve(__dirname, "..");
const ALLOWED = new Set([
  "domain/pace.ts",
  "domain/expand.ts",
  "src/builder/builderState.ts",
]);

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("ASSUMED_BASELINES census", () => {
  it("is imported only where a duration is priced", () => {
    const files = [
      ...walk(path.join(ROOT, "domain"), []),
      ...walk(path.join(ROOT, "src"), []),
    ];
    const importers = files
      .filter((f) => readFileSync(f, "utf-8").includes("ASSUMED_BASELINES"))
      .map((f) => path.relative(ROOT, f))
      .sort();
    expect(importers).toStrictEqual([...ALLOWED].sort());
  });
});
