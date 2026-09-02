import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { commentStrippedSource, cssRules } from "../test/cssView";
import FreeRowChip from "./FreeRowChip";

/** `index.css` with every comment stripped — `ConnectedInterstitial.test.tsx`'s
 *  own view of the stylesheet, for its reason: a rule's PROSE must never be
 *  able to satisfy an assertion about its declarations. Same
 *  `import.meta.url` surgery, same directory depth. */
const CHIP_CSS = commentStrippedSource(
  readFileSync(
    import.meta.url
      .replace(/^file:\/\//, "")
      .replace(/workout\/[^/]+\.test\.tsx$/, "index.css"),
    "utf-8",
  ),
);

/**
 * Just Row unconnected spec (2026-09-02), §Mechanism piece 7: the chip is
 * DERIVED from the PAIR `isFreeRow(workoutId, workoutType)` and never
 * stored. Its class is `free-row-chip`, NEVER `type-badge`, so Phase JR
 * PR 1's exit criterion 2 ("no `.type-badge` for a free row") stays a true
 * structural pin with the chip on screen.
 */
describe("FreeRowChip", () => {
  it("(null, null): renders JR in a .free-row-chip and no .type-badge", () => {
    const { container } = render(
      <FreeRowChip workoutId={null} workoutType={null} />,
    );
    const chip = container.querySelector(".free-row-chip");
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe("JR");
    expect(container.querySelector(".type-badge")).toBeNull();
  });

  // The deleted-workout retry shape: a row whose workout is gone but whose
  // type survived is NOT a free row — it had an intensity. Keying the chip
  // on the id alone would badge it JR beside its own O2 badge.
  it("(null, 'O2'): the deleted-workout retry shape renders NO chip", () => {
    const { container } = render(
      <FreeRowChip workoutId={null} workoutType="O2" />,
    );
    expect(container.querySelector(".free-row-chip")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("('w1', null): a typed-null row with a workout renders NO chip", () => {
    const { container } = render(
      <FreeRowChip workoutId="w1" workoutType={null} />,
    );
    expect(container.querySelector(".free-row-chip")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  // Handoff README "The JR chip" (rev 2e): `.workout-row-custom`'s hollow
  // metadata treatment in TypeBadge's box. Pinned as ONE rule so a second,
  // drifting copy (RF5's "two copies, one forgotten" class) cannot appear
  // and so deleting the rule goes red. Contrast is computed, not eyeballed
  // (RF6): --ink-3 #57544c on --page #f4f1e8 = 6.69:1, on --surface
  // #fffdf7 = 7.43:1 — both clear the 4.5:1 AA floor, and only if the rule
  // actually names those two tokens.
  it("wears exactly one .free-row-chip rule: hollow, --rule-3 border, --ink-3 text, never composed with .type-badge", () => {
    const rules = cssRules(CHIP_CSS).filter((r) =>
      r.selectors.includes(".free-row-chip"),
    );
    expect(rules, "expected exactly one .free-row-chip rule").toHaveLength(1);
    const rule = rules[0]!;
    expect(rule.selectors).toStrictEqual([".free-row-chip"]);
    expect(rule.at).toStrictEqual([]);
    expect(rule.body).toContain("background: transparent");
    expect(rule.body).toContain("border: 1px solid var(--rule-3)");
    expect(rule.body).toContain("color: var(--ink-3)");
    expect(rule.body).toContain("font-family: var(--font-mono)");
    // TypeBadge's box: `.type-badge` is `padding: 3px 7px` with no border;
    // the chip's 1px border is compensated in padding (2px 6px), the same
    // arithmetic `.plan-row-badge-unknown` records, so the outer box matches.
    expect(rule.body).toContain("padding: 2px 6px");
    expect(rule.body).toContain("font-size: 12px");
    expect(rule.body).toContain("font-weight: 600");
    // No rule anywhere composes the two classes.
    const composed = cssRules(CHIP_CSS).filter((r) =>
      r.selectors.some(
        (s) => s.includes(".free-row-chip") && s.includes(".type-badge"),
      ),
    );
    expect(composed).toStrictEqual([]);
  });
});
