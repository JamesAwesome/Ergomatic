import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { commentStrippedSource, cssRules } from "../test/cssView";

/** `index.css` with every comment stripped — `FreeRowChip.test.tsx`'s own
 *  view of the stylesheet, for its reason: a rule's PROSE must never be
 *  able to satisfy an assertion about its declarations.
 *
 *  ITS OWN PATH REGEX, deliberately. `FreeRowChip.test.tsx:15` resolves the
 *  same file with `.replace(/workout\/[^/]+\.test\.tsx$/, "index.css")`,
 *  which is scoped to `src/workout/` and would silently fail to substitute
 *  from here — the read would then point at THIS file and every rule lookup
 *  would come back empty, a gate green by vacuity (RF21). The
 *  non-empty assertion below is the tripwire for exactly that. */
const CSS_PATH = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/log\/[^/]+\.test\.tsx?$/, "index.css");
const CHIP_CSS = commentStrippedSource(readFileSync(CSS_PATH, "utf-8"));

/** A rule body as a normalised SET of `prop: value` declarations, so two
 *  rules compare on what they DECLARE rather than on whitespace or the
 *  order the properties happen to be written in. */
function declarations(body: string): string[] {
  return body
    .split(";")
    .map((d) => d.trim().replace(/\s+/g, " "))
    .filter((d) => d !== "")
    .sort();
}

function ruleFor(selector: string) {
  const rules = cssRules(CHIP_CSS).filter((r) =>
    r.selectors.includes(selector),
  );
  expect(rules, `expected exactly one ${selector} rule`).toHaveLength(1);
  return rules[0]!;
}

/**
 * Door spec (2026-09-02) §1.3, Gate 0-A decision (e), APPROVED by James:
 * the History list's partial chip wears `.free-row-chip`'s exact
 * treatment — same 12px mono, same `--ink-3` on `--page`, same 1px
 * `--rule-3` hollow border, same TypeBadge-box padding arithmetic.
 *
 * It gets its OWN CLASS rather than joining `.free-row-chip`'s selector
 * list, and this file is what stops the two copies drifting apart. The
 * own-class decision is not a preference: `FreeRowChip.test.tsx:68` pins
 * that rule to EXACTLY ONE rule and `:70` pins its selector list to
 * exactly `[".free-row-chip"]`, so a grouped selector goes red on sight;
 * and SEVEN e2e assertions count or read the text of `.free-row-chip`
 * (`e2e/justrow.spec.ts:165,252,416`, `e2e/screenshots.spec.ts:1251,1260,
 * 1265,5044`), which a partial row sharing the class would perturb.
 */
describe("the History partial chip's CSS", () => {
  it("reads a non-empty index.css (the path regex actually substituted)", () => {
    expect(CSS_PATH.endsWith("/src/index.css")).toBe(true);
    expect(CHIP_CSS.length).toBeGreaterThan(1000);
    expect(cssRules(CHIP_CSS).length).toBeGreaterThan(100);
  });

  it("declares .log-partial-chip with EXACTLY .free-row-chip's declarations — one treatment, two classes, held equal here", () => {
    const chip = ruleFor(".log-partial-chip");
    const freeRow = ruleFor(".free-row-chip");
    expect(chip.at).toStrictEqual([]);
    expect(freeRow.at).toStrictEqual([]);
    expect(chip.selectors).toStrictEqual([".log-partial-chip"]);
    expect(declarations(chip.body)).toStrictEqual(declarations(freeRow.body));
    // Named explicitly as well as compared, so deleting a declaration from
    // BOTH rules cannot keep this file green. Contrast computed, not
    // eyeballed (RF6): --ink-3 #57544c on --page #f4f1e8 = 6.69:1, on
    // --surface #fffdf7 = 7.43:1 — both clear the 4.5:1 AA floor.
    expect(declarations(chip.body)).toStrictEqual(
      expect.arrayContaining([
        "color: var(--ink-3)",
        "background: transparent",
        "border: 1px solid var(--rule-3)",
        "font-family: var(--font-mono)",
        "font-size: 12px",
        "font-weight: 600",
        "padding: 2px 6px",
      ]),
    );
  });

  // The chip must NEVER be added to `.free-row-chip`'s selector list (see
  // this describe's own comment) and must never be composed with
  // `.type-badge` — Phase JR PR 1's exit criterion 2 counts on that class
  // meaning one thing.
  it("is never grouped with .free-row-chip or .type-badge in any rule", () => {
    const shared = cssRules(CHIP_CSS).filter(
      (r) =>
        r.selectors.some((s) => s.includes(".log-partial-chip")) &&
        r.selectors.some(
          (s) => s.includes(".free-row-chip") || s.includes(".type-badge"),
        ),
    );
    expect(shared).toStrictEqual([]);
  });

  // Gate 0-A slot B's own note: the numbers line becomes a two-item flex
  // row when a chip is on it, so the chip and the numbers sit on one
  // baseline with a real gap rather than running together.
  it("declares .today-log-hero-chipped as the numbers line's chipped modifier", () => {
    const chipped = ruleFor(".today-log-hero-chipped");
    expect(chipped.at).toStrictEqual([]);
    expect(declarations(chipped.body)).toStrictEqual([
      "align-items: center",
      "display: flex",
      "gap: 8px",
    ]);
  });
});
