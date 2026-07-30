import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Stepper from "./Stepper";

describe("Stepper", () => {
  it("renders the value between the two cells", () => {
    render(
      <Stepper
        label="SPM"
        value="20"
        onDecrement={vi.fn()}
        onIncrement={vi.fn()}
      />,
    );
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("calls onDecrement when − is pressed and onIncrement when + is pressed", async () => {
    const onDecrement = vi.fn();
    const onIncrement = vi.fn();
    render(
      <Stepper
        label="SPM"
        value="20"
        onDecrement={onDecrement}
        onIncrement={onIncrement}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "SPM down" }));
    await userEvent.click(screen.getByRole("button", { name: "SPM up" }));
    expect(onDecrement).toHaveBeenCalledTimes(1);
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it("builds both accessible names from the given label — `${label} down` / `${label} up`", () => {
    render(
      <Stepper
        label="REST"
        value="NONE"
        onDecrement={vi.fn()}
        onIncrement={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "REST down" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "REST up" })).toBeInTheDocument();
  });

  it("gives both stepper cells the 44px hit-target class (design.spec.ts's real px sweep verifies the pixels)", () => {
    render(
      <Stepper
        label="SPM"
        value="20"
        onDecrement={vi.fn()}
        onIncrement={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "SPM down" })).toHaveClass(
      "stepper-btn",
    );
    expect(screen.getByRole("button", { name: "SPM up" })).toHaveClass(
      "stepper-btn",
    );
  });

  it("defaults the value cell to flex (fills the row) when valueWidth is omitted", () => {
    render(
      <Stepper
        label="SPM"
        value="20"
        onDecrement={vi.fn()}
        onIncrement={vi.fn()}
      />,
    );
    expect(screen.getByText("20")).not.toHaveAttribute("style");
  });

  // REPEAT's own value cell (Task 5) is a fixed 52px, not flex — the one
  // place this control's value width isn't "fill the row".
  it("fixes the value cell to the given pixel width when valueWidth is a number", () => {
    render(
      <Stepper
        label="REPEAT"
        value="×4"
        onDecrement={vi.fn()}
        onIncrement={vi.fn()}
        valueWidth={52}
      />,
    );
    expect(screen.getByText("×4")).toHaveStyle({ width: "52px" });
  });

  it("applies an optional extra class to the value cell (used for the FREE/NONE muted state)", () => {
    render(
      <Stepper
        label="SPM"
        value="FREE"
        onDecrement={vi.fn()}
        onIncrement={vi.fn()}
        valueClassName="stepper-value-muted"
      />,
    );
    expect(screen.getByText("FREE")).toHaveClass(
      "stepper-value",
      "stepper-value-muted",
    );
  });
});
