import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TypeBadge from "./TypeBadge";

/**
 * EXIT CRITERION 2 (Phase JR PR 1 Task 2; spec rev 4's F6).
 *
 * Two DIFFERENT failures live here and only the structural assertion can
 * convict both — which is why the criterion was rewritten away from a
 * contrast measurement:
 *
 *  - an unknown STRING renders invisible text: `--on-color` #fffdf7 on
 *    `--page` #f4f1e8 is 1.110:1, and 1.000:1 on `--surface`, because
 *    `var(--type-JustRow)` is not a declared property and the whole
 *    `background` declaration is dropped at parse time;
 *  - `null` renders NOTHING as a React child, so there is no text to
 *    measure at all. What remained was a `display: inline-block` span with
 *    `padding: 3px 7px` and no background — an empty padded gap, which is
 *    exactly the "empty badge" this criterion forbids. A contrast
 *    assertion passes it happily.
 */
describe("TypeBadge", () => {
  it("renders NO element at all for a null type — an absence, never an empty badge", () => {
    const { container } = render(<TypeBadge type={null} />);
    expect(container.querySelector(".type-badge")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the type's own colour for a known type", () => {
    render(<TypeBadge type="O2" />);
    const badge = screen.getByText("O2");
    expect(badge).toHaveClass("type-badge");
    expect(badge.style.background).toBe("var(--type-o2)");
  });

  // A type string this build does not know — a row written by a newer
  // client, or the documented historical drift this column has always
  // tolerated on READ. It must stay legible rather than degrade to
  // near-invisible text on a dropped custom property.
  it("renders an unknown type string on the neutral fill, never a dropped background", () => {
    render(<TypeBadge type="JustRow" />);
    const badge = screen.getByText("JustRow");
    expect(badge).toHaveClass("type-badge");
    expect(badge.style.background).toBe("var(--ink-3)");
  });
});
