import { useState } from "react";
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

  // Phase 5E Task 5, fix-wave item 4: SPM/REST used to anchor their
  // save-time error to a role-less wrapping <div aria-invalid> in
  // StepEditor.tsx — a failed Save's `.focus()` landed on a target nothing
  // announced. Stepper now carries its own real `role="group"`, the same
  // way PaceRefInput already anchors to a real `role="radiogroup"`, so
  // `invalid`/`errorId` land on a properly-announced target.
  it("wires invalid/errorId onto its own role=group, named from the same label the buttons use", () => {
    render(
      <Stepper
        label="Row 1 rest"
        value="NONE"
        onDecrement={vi.fn()}
        onIncrement={vi.fn()}
        invalid
        errorId="row-1-rest-error"
      />,
    );
    const group = screen.getByRole("group", { name: "Row 1 rest" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAttribute("aria-describedby", "row-1-rest-error");
  });

  it("defaults aria-invalid to false and omits aria-describedby when no error is given", () => {
    render(
      <Stepper
        label="SPM"
        value="20"
        onDecrement={vi.fn()}
        onIncrement={vi.fn()}
      />,
    );
    const group = screen.getByRole("group", { name: "SPM" });
    expect(group).toHaveAttribute("aria-invalid", "false");
    expect(group).not.toHaveAttribute("aria-describedby");
  });

  // Exposes the group element itself (not either button) — what makes it
  // possible for a caller's fieldRefs map to `.focus()` this control at all,
  // since a bare role="group" div isn't natively focusable.
  it("exposes its own group element via registerRef, and makes it focusable", () => {
    const registerRef = vi.fn();
    render(
      <Stepper
        label="Row 1 rest"
        value="NONE"
        onDecrement={vi.fn()}
        onIncrement={vi.fn()}
        registerRef={registerRef}
      />,
    );
    const group = screen.getByRole("group", { name: "Row 1 rest" });
    expect(registerRef).toHaveBeenCalledWith(group);
    expect(group).toHaveAttribute("tabIndex", "-1");
    group.focus();
    expect(document.activeElement).toBe(group);
  });

  it("keeps a plain span when no onValueChange is supplied", () => {
    render(
      <Stepper
        label="Repeat"
        value="×4"
        onDecrement={() => {}}
        onIncrement={() => {}}
      />,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  // A stateful wrapper, not the static mock every other test in this file
  // uses: a controlled input that never echoes the new value back through
  // `value` reverts on every keystroke (a real React/DOM behaviour, not a
  // quirk of this component) — `user.type`'s "2" then "7" would otherwise
  // land as two independent keystrokes against the same unchanged "" value
  // and this assertion would see only the last one ("7"), not "27".
  it("accepts typing when onValueChange is supplied", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <Stepper
          label="Step 1 stroke rate"
          value={value}
          onValueChange={(next) => {
            onValueChange(next);
            setValue(next);
          }}
          onDecrement={() => {}}
          onIncrement={() => {}}
        />
      );
    }
    render(<Harness />);
    await user.type(screen.getByLabelText("Step 1 stroke rate value"), "27");
    expect(onValueChange).toHaveBeenLastCalledWith("27");
  });
});
