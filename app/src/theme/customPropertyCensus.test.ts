// EVERY `var(--x)` IN THE STYLESHEETS NAMES A PROPERTY SOMETHING DEFINES.
//
// Written after a shipped defect, not from first principles. Phase AV's
// AUTO VERIFY label was authored as `font-family: var(--mono)`. The token is
// `--font-mono`; `--mono` had ONE reference and ZERO definitions anywhere in
// the repo. An undefined custom property makes the declaration invalid at
// computed-value time, so the label silently inherited the body sans while
// every neighbouring label stayed IBM Plex Mono — no error, no warning, no
// failing test. It reached two committed captures and was caught by a human
// reading the PNGs (RF7's own lesson, one layer over).
//
// WHY A CENSUS AND NOT A LINT RULE: stylelint is not in this repo, and the
// failure class here is narrow and mechanical — a name that resolves to
// nothing. This test is the cheapest thing that can go red on it.
//
// WHAT IT CANNOT SEE, said plainly rather than implied: a property defined
// somewhere but never applied to the element that reads it (a cascade or
// scoping mistake), and a property whose VALUE is wrong. It catches names
// that resolve to nothing, which is the defect that shipped.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

function cssFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".css")) out.push(p);
    }
  };
  walk(SRC);
  return out;
}

describe("custom-property census", () => {
  it("every var(--x) reference names a property some stylesheet defines", () => {
    const files = cssFiles();
    expect(files.length).toBeGreaterThan(0);
    const all = files.map((f) => readFileSync(f, "utf8"));
    const joined = all.join("\n");

    // A DEFINITION is `--name:` at a declaration position. A REFERENCE is
    // `var(--name`. Both patterns are deliberately loose: a false DEFINITION
    // would let a real hole through, so the definition side is anchored to a
    // line whose `--name:` is preceded only by whitespace, `{`, or `;`.
    const defined = new Set<string>();
    for (const m of joined.matchAll(/(?:^|[{;\s])(--[A-Za-z0-9_-]+)\s*:/gm)) {
      defined.add(m[1]!);
    }
    const referenced = new Map<string, string>();
    files.forEach((file, i) => {
      for (const m of all[i]!.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
        if (!referenced.has(m[1]!)) referenced.set(m[1]!, file);
      }
    });

    const orphans = [...referenced.entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, file]) => `${name} (first seen in ${file})`)
      .sort();
    expect(orphans).toStrictEqual([]);
  });

  it("finds the defect that produced it — a name with no definition is reported", () => {
    // The census's own probe, inline: without this, a regex that matched
    // nothing would read as a clean bill of health forever (RF21). The two
    // patterns are the same ones the test above uses.
    const sample =
      ":root { --font-mono: monospace; }\n.x { font-family: var(--mono); }";
    const defined = new Set(
      [...sample.matchAll(/(?:^|[{;\s])(--[A-Za-z0-9_-]+)\s*:/gm)].map(
        (m) => m[1]!,
      ),
    );
    const referenced = [...sample.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map(
      (m) => m[1]!,
    );
    expect(defined.has("--font-mono")).toBe(true);
    expect(referenced.filter((n) => !defined.has(n))).toStrictEqual(["--mono"]);
  });
});
