import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PainBar from "./PainBar";

describe("PainBar", () => {
  it("always renders five segments (pain is 1–5, not 1–10)", () => {
    render(<PainBar pain={3} type="O2" />);
    expect(screen.getByLabelText("pain 3 of 5").children).toHaveLength(5);
  });

  it("fills exactly `pain` segments", () => {
    render(<PainBar pain={2} type="O2" />);
    const filled = Array.from(
      screen.getByLabelText("pain 2 of 5").children,
    ).filter((seg) => seg.getAttribute("data-filled") === "true");
    expect(filled).toHaveLength(2);
  });
});
