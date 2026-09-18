import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CALLERS = {
  "WorkoutDetail.tsx": "src/workout/WorkoutDetail.tsx",
  "ConnectedInterstitial.tsx": "src/workout/ConnectedInterstitial.tsx",
  "JustRow.tsx": "src/justrow/JustRow.tsx",
} as const;

type CallerName = keyof typeof CALLERS;

function source(name: CallerName): string {
  return readFileSync(join(process.cwd(), CALLERS[name]), "utf-8");
}

function namedImports(text: string, module: string): string[] {
  const imports = Array.from(
    text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g),
  );
  const declaration = imports.find((match) => match[2] === module);
  if (declaration === undefined) return [];
  return declaration[1]!
    .split(",")
    .map((name) => name.trim().replace(/^type\s+/, ""))
    .filter(Boolean);
}

const REQUIRED_ENTRY_IMPORTS: ReadonlyArray<
  readonly [CallerName, "useConnectionEntry" | "useConnectionEntryLifetime"]
> = [
  ["WorkoutDetail.tsx", "useConnectionEntry"],
  ["ConnectedInterstitial.tsx", "useConnectionEntryLifetime"],
  ["JustRow.tsx", "useConnectionEntry"],
  ["JustRow.tsx", "useConnectionEntryLifetime"],
];

const LIFETIME_CALLERS: CallerName[] = [
  "ConnectedInterstitial.tsx",
  "JustRow.tsx",
];

const FORBIDDEN_ENTRY_OWNERSHIP = [
  /\bMonitorDiscoveryRequest\b/,
  /\bConnectionAttemptTrace\b/,
  /\bdiscardStagedRetire\b/,
  /\bclaimMountLease\b/,
  /\bonMountLeaseLost\b/,
  /\bsession\s*\.\s*connect\s*\(/,
  /\bsession\s*\.\s*cancel\s*\(/,
];

describe("connection-entry caller boundary", () => {
  it.each(REQUIRED_ENTRY_IMPORTS)(
    "%s imports %s from the connection-entry owner",
    (caller, hook) => {
      expect(
        namedImports(source(caller), "../monitor/connectionEntry"),
      ).toContain(hook);
    },
  );

  it.each(LIFETIME_CALLERS)(
    "%s declares the opaque attempt lifetime",
    (caller) => {
      expect(source(caller)).toMatch(/\buseConnectionEntryLifetime\s*\(/);
    },
  );

  it.each(Object.keys(CALLERS) as CallerName[])(
    "%s does not reclaim request, trace, lease, connect, or Cancel ownership",
    (caller) => {
      const text = source(caller);
      for (const forbidden of FORBIDDEN_ENTRY_OWNERSHIP) {
        expect(text, `${caller} contains ${forbidden.source}`).not.toMatch(
          forbidden,
        );
      }
    },
  );
});
