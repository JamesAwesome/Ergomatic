import { describe, expect, expectTypeOf, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { StatsRow } from "../../../domain/stats/statsRow.js";

// Spec §8.4 / invariant 12: no Concept2 identifier appears in the stats
// code — STRUCTURE, not runtime behaviour (RF26). Case-INSENSITIVE: the
// real module is `useConcept2Link.ts`, capital C.
const FORBIDDEN = [
  "verified",
  "c2resultid",
  "c2userid",
  "concept2",
  "/api/concept2",
];

// Vitest's client project runs under jsdom, where `import.meta.url` is not
// a file: URL — so paths resolve from the vitest root (`app/`).
const ROOT = process.cwd();
const here = path.join(ROOT, "src/you/stats/");
const SCANNED_DIRS = [path.join(ROOT, "domain/stats/"), here];
const SCANNED_FILES = [path.join(ROOT, "src/api/useStatsRows.ts")];

function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const dir of SCANNED_DIRS) {
    for (const name of readdirSync(dir)) {
      if (
        !/\.(ts|tsx)$/.test(name) ||
        name.endsWith(".test.ts") ||
        name.endsWith(".test.tsx")
      )
        continue;
      out.push({ path: dir + name, text: readFileSync(dir + name, "utf8") });
    }
  }
  for (const path of SCANNED_FILES)
    out.push({ path, text: readFileSync(path, "utf8") });
  return out;
}

describe("stats code is Concept2-free (spec §8.4, invariant 12)", () => {
  it("scans at least the domain, the you/stats components and the adapter", () => {
    const paths = sources().map((s) => s.path);
    expect(paths.some((p) => p.endsWith("domain/stats/aggregate.ts"))).toBe(
      true,
    );
    expect(paths.some((p) => p.endsWith("you/stats/YouStatsHero.tsx"))).toBe(
      true,
    );
    expect(paths.some((p) => p.endsWith("api/useStatsRows.ts"))).toBe(true);
  });

  it("no scanned file contains a Concept2 identifier, case-insensitively", () => {
    const hits = sources().flatMap(({ path, text }) =>
      FORBIDDEN.filter((needle) => text.toLowerCase().includes(needle)).map(
        (needle) => `${path}: ${needle}`,
      ),
    );
    expect(hits).toStrictEqual([]);
  });

  it("YouStatsHero.tsx's import specifiers name no Concept2 module", () => {
    const text = readFileSync(`${here}YouStatsHero.tsx`, "utf8");
    const specifiers = Array.from(text.matchAll(/from\s+"([^"]+)"/g)).map((m) =>
      m[1]!.toLowerCase(),
    );
    expect(specifiers.length).toBeGreaterThan(0);
    expect(
      specifiers.filter((s) => FORBIDDEN.some((n) => s.includes(n))),
    ).toStrictEqual([]);
  });

  it("StatsRow carries exactly the ten §4.3 keys", () => {
    type Expected =
      | "id"
      | "loggedAt"
      | "source"
      | "workoutType"
      | "tier"
      | "workMeters"
      | "workSeconds"
      | "restMeters"
      | "restSeconds"
      | "calories";
    expectTypeOf<keyof StatsRow>().toEqualTypeOf<Expected>();
    const probe: Record<keyof StatsRow, true> = {
      id: true,
      loggedAt: true,
      source: true,
      workoutType: true,
      tier: true,
      workMeters: true,
      workSeconds: true,
      restMeters: true,
      restSeconds: true,
      calories: true,
    };
    expect(Object.keys(probe)).toHaveLength(10);
  });
});
