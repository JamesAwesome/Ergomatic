import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commentStrippedSource, cssRules } from "../test/cssView";

/**
 * EVERY FULL-SCREEN `<main>` PADS ITS OWN TOP AND SIDES BY THE SAFE-AREA
 * INSET, and this is the only instrument in the repo that can say so.
 *
 * The defect it exists for has now happened twice. Phase SB (the 2026-09-06
 * capture) found `← BACK` rendering under the status-bar clock; the fix
 * was `.screen`'s inset padding plus the `.status-backdrop` blur strip. Wave
 * A then added two NEW layout roots — `.signin` and `.auth-flow-screen` —
 * that are bare `<main>` elements rather than `.screen`, so they took the
 * flat `main { padding: 6px 20px 20px }` and put a 44px `← BACK` button back
 * under the clock, with the header running under the notch in landscape.
 *
 * WHY IT HAS TO LIVE HERE, at the source layer, rather than in a browser:
 * `env(safe-area-inset-*)` resolves to 0 in desktop Chromium, so every
 * Playwright capture and every design-spec assertion in this repo is blind to
 * it — a real device is the only runtime that can see the bug, and we have no
 * automated device. RF19's rule applies: the instrument that would catch this
 * does not exist, so build it in the same change. A source census proves
 * STRUCTURE, not runtime (RF26) — the claim here is exactly "every layout
 * root declares the inset", never "the inset renders correctly".
 *
 * The class list is DERIVED from the TSX, never typed out (RF37's rule). A
 * new `<main className="whatever">` added tomorrow joins this census
 * automatically and fails until it declares the inset — which is the whole
 * point, and is what would have caught Wave A.
 */

function thisDirPath(filename: string): string {
  // Same plain string surgery `tokens.test.ts` and `judgeTokens.test.tsx`
  // use and document: this project's jsdom environment resolves `new URL(...)`
  // against `http://localhost:3000/` instead of the given `file://` base.
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/[^/]+$/, "")
    .concat(filename);
}

function tsxFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFilesUnder(full);
    return full.endsWith(".tsx") && !full.endsWith(".test.tsx") ? [full] : [];
  });
}

const srcDir = thisDirPath("..");
const indexCss = commentStrippedSource(
  readFileSync(thisDirPath("../index.css"), "utf-8"),
);
const rules = cssRules(indexCss);

/**
 * The FIRST class on every `<main>` in `src/` — the layout root, the element
 * that owns the page's outer padding. Later classes are modifiers that style
 * within it (`screen you-screen`, `screen overlay-screen`).
 */
function layoutRootClasses(): string[] {
  const roots = new Set<string>();
  for (const file of tsxFilesUnder(srcDir)) {
    const source = commentStrippedSource(readFileSync(file, "utf-8"));
    for (const match of source.matchAll(/<main\s+className="([^"]+)"/g)) {
      roots.add(match[1].trim().split(/\s+/)[0]);
    }
  }
  return [...roots].sort();
}

/** Every top-level declaration block whose selector list includes `.cls`. */
function topLevelBodiesFor(cls: string): string[] {
  return rules
    .filter(
      (rule) =>
        rule.at.length === 0 &&
        rule.selectors.some((selector) => selector.trim() === `.${cls}`),
    )
    .map((rule) => rule.body);
}

describe("safe-area census: every full-screen <main> pads its own insets", () => {
  const classes = layoutRootClasses();

  it("finds the layout roots by reading the TSX, so a new screen joins automatically", () => {
    // Independent literals, not a count derived from the census itself: these
    // three are the roots that exist today. A fourth appearing is not a
    // failure here — it is a new row in the census below, which is the point.
    expect(classes).toStrictEqual(
      expect.arrayContaining(["auth-flow-screen", "screen", "signin"]),
    );
    expect(classes.length).toBeGreaterThanOrEqual(3);
  });

  it.each(layoutRootClasses().map((cls) => [cls] as const))(
    "`.%s` declares the top inset",
    (cls) => {
      const bodies = topLevelBodiesFor(cls);
      expect(
        bodies.length,
        `no top-level rule for .${cls} in index.css`,
      ).toBeGreaterThan(0);
      expect(
        bodies.some((body) => body.includes("env(safe-area-inset-top")),
        `.${cls} is a <main> layout root but declares no safe-area top inset, so its first control renders under the status bar on a real device`,
      ).toBe(true);
    },
  );

  it.each(layoutRootClasses().map((cls) => [cls] as const))(
    "`.%s` declares both side insets, for landscape",
    (cls) => {
      const bodies = topLevelBodiesFor(cls);
      for (const side of ["left", "right"]) {
        expect(
          bodies.some((body) => body.includes(`env(safe-area-inset-${side}`)),
          `.${cls} declares no safe-area ${side} inset, so it runs under the notch and the rounded corners in landscape`,
        ).toBe(true);
      }
    },
  );
});
