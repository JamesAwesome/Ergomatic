import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SpmInput from "./SpmInput";

function setup(value = "") {
  const onChange = vi.fn();
  render(<SpmInput value={value} onChange={onChange} rowLabel="Row 1" />);
  return onChange;
}

describe("SpmInput", () => {
  it("renders empty when value is empty (spm stays optional)", () => {
    setup("");
    expect(
      screen.getByRole("textbox", { name: /Row 1 stroke rate/i }),
    ).toHaveValue("");
  });

  it("wakes at exactly 20 when + is pressed from empty", async () => {
    const onChange = setup("");
    await userEvent.click(
      screen.getByRole("button", { name: /Row 1 stroke rate increase/i }),
    );
    expect(onChange).toHaveBeenCalledWith("20");
  });

  it("wakes at exactly 20 when − is pressed from empty (not 19)", async () => {
    const onChange = setup("");
    await userEvent.click(
      screen.getByRole("button", { name: /Row 1 stroke rate decrease/i }),
    );
    expect(onChange).toHaveBeenCalledWith("20");
  });

  it("steps up by one from a set value", async () => {
    const onChange = setup("20");
    await userEvent.click(
      screen.getByRole("button", { name: /Row 1 stroke rate increase/i }),
    );
    expect(onChange).toHaveBeenCalledWith("21");
  });

  it("steps down by one from a set value", async () => {
    const onChange = setup("20");
    await userEvent.click(
      screen.getByRole("button", { name: /Row 1 stroke rate decrease/i }),
    );
    expect(onChange).toHaveBeenCalledWith("19");
  });

  it("clamps at the domain's 60 ceiling on +", async () => {
    const onChange = setup("60");
    await userEvent.click(
      screen.getByRole("button", { name: /Row 1 stroke rate increase/i }),
    );
    expect(onChange).toHaveBeenCalledWith("60");
  });

  it("clamps at the domain's 10 floor on −", async () => {
    const onChange = setup("10");
    await userEvent.click(
      screen.getByRole("button", { name: /Row 1 stroke rate decrease/i }),
    );
    expect(onChange).toHaveBeenCalledWith("10");
  });

  it("passes typed text straight through, unclamped", () => {
    const onChange = setup("20");
    fireEvent.change(
      screen.getByRole("textbox", { name: /Row 1 stroke rate/i }),
      { target: { value: "45" } },
    );
    expect(onChange).toHaveBeenCalledWith("45");
  });

  it("can be cleared back to empty, and a press afterward wakes at 20 again", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SpmInput value="20" onChange={onChange} rowLabel="Row 1" />,
    );
    const input = screen.getByRole("textbox", { name: /Row 1 stroke rate/i });
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");

    // Simulate the parent committing the cleared value, then press +.
    rerender(<SpmInput value="" onChange={onChange} rowLabel="Row 1" />);
    onChange.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: /Row 1 stroke rate increase/i }),
    );
    expect(onChange).toHaveBeenCalledWith("20");
  });

  it("treats an unparseable value the same as empty — wakes at 20", () => {
    const onChange = setup("abc");
    fireEvent.click(
      screen.getByRole("button", { name: /Row 1 stroke rate increase/i }),
    );
    expect(onChange).toHaveBeenCalledWith("20");
  });

  it("gives both step buttons accessible names including the row label and the 44px hit-target class", () => {
    setup("20");
    const dec = screen.getByRole("button", {
      name: /Row 1 stroke rate decrease/i,
    });
    const inc = screen.getByRole("button", {
      name: /Row 1 stroke rate increase/i,
    });
    expect(dec).toHaveClass("spm-input-step");
    expect(inc).toHaveClass("spm-input-step");
  });

  // Task 4 wiring: StepRowEditor passes fieldError("spm")-derived
  // invalid/errorId through, same idiom as DurationInput/PaceRefInput, so a
  // failed Save's aria-invalid/aria-describedby wiring survives the swap
  // from a plain <input> to this control.
  it("wires aria-invalid/aria-describedby onto the value field when invalid/errorId are given", () => {
    render(
      <SpmInput
        value=""
        onChange={vi.fn()}
        rowLabel="Row 1"
        invalid
        errorId="row-1-spm-error"
      />,
    );
    const input = screen.getByRole("textbox", { name: /Row 1 stroke rate/i });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "row-1-spm-error");
  });

  it("defaults to aria-invalid=false with no aria-describedby when invalid/errorId are omitted", () => {
    setup("");
    const input = screen.getByRole("textbox", { name: /Row 1 stroke rate/i });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  // Exercises `registerRef`'s truthy branch — every other test in this file
  // renders without it, covering the falsy (optional-chaining no-op)
  // branch.
  it("exposes the value input's DOM node via registerRef", () => {
    let captured: HTMLInputElement | null = null;
    render(
      <SpmInput
        value=""
        onChange={vi.fn()}
        rowLabel="Row 1"
        registerRef={(el) => {
          captured = el;
        }}
      />,
    );
    expect(captured).toBe(
      screen.getByRole("textbox", { name: /Row 1 stroke rate/i }),
    );
  });
});
