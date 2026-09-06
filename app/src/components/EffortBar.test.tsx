import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EffortBar from "./EffortBar";

describe("EffortBar", () => {
  it("always renders five segments (effort is 1–5, not 1–10)", () => {
    render(<EffortBar effort={3} type="O2" />);
    expect(screen.getByLabelText("effort 3 of 5").children).toHaveLength(5);
  });

  it("fills exactly `effort` segments", () => {
    render(<EffortBar effort={2} type="O2" />);
    const filled = Array.from(
      screen.getByLabelText("effort 2 of 5").children,
    ).filter((seg) => seg.getAttribute("data-filled") === "true");
    expect(filled).toHaveLength(2);
  });
});
