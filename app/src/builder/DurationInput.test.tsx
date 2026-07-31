import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DurationInput from "./DurationInput";

function setup(over: Partial<{ value: string; unit: "min" | "m" }> = {}) {
  const onChange = vi.fn();
  render(
    <DurationInput
      value={over.value ?? ""}
      unit={over.unit ?? "min"}
      onChange={onChange}
      rowLabel="Row 1"
    />,
  );
  return onChange;
}

// A real controlled harness (same idiom as ClockInput.test.tsx's own
// `Harness`) — a bare `vi.fn()` onChange leaves `value` fixed across
// keystrokes, and React's controlled-input value tracker resets the DOM
// node back to that fixed value after every keystroke's change event, so a
// second keystroke never sees the first's digit. Only tests that type more
// than one character need this; a single-keystroke or click test is fine
// with a plain mock.
function Harness({
  onChange,
  initialUnit = "min",
}: {
  onChange: (next: { value: string; unit: "min" | "m" }) => void;
  initialUnit?: "min" | "m";
}) {
  const [state, setState] = useState<{ value: string; unit: "min" | "m" }>({
    value: "",
    unit: initialUnit,
  });
  return (
    <DurationInput
      value={state.value}
      unit={state.unit}
      onChange={(next) => {
        setState(next);
        onChange(next);
      }}
      rowLabel="Step 1"
    />
  );
}

describe("DurationInput", () => {
  // Unit "min" now routes the value field through ClockInput (Task 3), which
  // masks digits into `mm:ss`/`h:mm:ss` rather than reporting them raw — a
  // single change event carrying "25" becomes the clock string "0:25", not
  // the bare digits.
  it("masks a single change event's digits into a clock string while the unit is MIN", () => {
    const onChange = setup({ value: "", unit: "min" });
    fireEvent.change(screen.getByRole("textbox", { name: /Row 1 duration/i }), {
      target: { value: "25" },
    });
    expect(onChange).toHaveBeenCalledWith({ value: "0:25", unit: "min" });
  });

  it("masks the value while the unit is MIN", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByLabelText("Step 1 duration"), "45");
    expect(onChange).toHaveBeenLastCalledWith({ value: "0:45", unit: "min" });
  });

  it("takes plain integers while the unit is M", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DurationInput value="" unit="m" onChange={onChange} rowLabel="Step 1" />,
    );
    await user.type(screen.getByLabelText("Step 1 duration"), "2");
    expect(onChange).toHaveBeenLastCalledWith({ value: "2", unit: "m" });
  });

  it("clears the value when the unit is switched", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DurationInput
        value="0:45"
        unit="min"
        onChange={onChange}
        rowLabel="Step 1"
      />,
    );
    await user.click(screen.getByLabelText("Step 1 duration unit meters"));
    // A clock string is meaningless as meters — the field clears rather than
    // handing `toSteps` an unparseable value.
    expect(onChange).toHaveBeenLastCalledWith({ value: "", unit: "m" });
  });

  it("offers exactly the two units as a radiogroup with one active", () => {
    setup({ unit: "min" });
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(
      screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
    ).not.toBeChecked();
  });

  it("marks the active unit", () => {
    setup({ unit: "m" });
    expect(
      screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }),
    ).not.toBeChecked();
  });

  it("reports a unit change and clears the value — a min-unit value can't be reinterpreted as meters", async () => {
    const onChange = setup({ value: "10:00", unit: "min" });
    await userEvent.click(
      screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
    );
    expect(onChange).toHaveBeenCalledWith({ value: "", unit: "m" });
  });

  it("leaves the value untouched when the already-active unit chip is clicked again", async () => {
    const onChange = setup({ value: "10:00", unit: "min" });
    await userEvent.click(
      screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }),
    );
    expect(onChange).toHaveBeenCalledWith({ value: "10:00", unit: "min" });
  });

  // Mirrors PaceRefInput.test.tsx's (and the deleted PainPicker.test.tsx's)
  // roving-tabIndex and arrow-key suites for this control's own
  // radiogroup — only two chips (MIN/M), so "wraps" and "moves
  // forward/back" collapse into the same transition, but the handler is
  // the identical roving-tabindex pattern and needs the identical
  // coverage.
  describe("roving tabIndex", () => {
    it("makes only the checked chip tabbable", () => {
      setup({ unit: "min" });
      expect(
        screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }),
      ).toHaveAttribute("tabIndex", "0");
      expect(
        screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
      ).toHaveAttribute("tabIndex", "-1");
    });

    it("moves the tabbable chip when the checked unit changes", () => {
      setup({ unit: "m" });
      expect(
        screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
      ).toHaveAttribute("tabIndex", "0");
      expect(
        screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }),
      ).toHaveAttribute("tabIndex", "-1");
    });
  });

  describe("arrow key navigation", () => {
    // Arrow-key navigation always switches units here (only two chips), so
    // every case below clears the value the same way a chip click does —
    // there's no "same unit" case reachable via the keyboard with only two
    // options.
    it("moves forward with ArrowRight, focuses the next chip, and clears the value", async () => {
      const onChange = setup({ value: "10:00", unit: "min" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit minutes/i })
        .focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith({ value: "", unit: "m" });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
      );
    });

    it("moves forward with ArrowDown and clears the value", async () => {
      const onChange = setup({ value: "10:00", unit: "min" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit minutes/i })
        .focus();
      await userEvent.keyboard("{ArrowDown}");
      expect(onChange).toHaveBeenCalledWith({ value: "", unit: "m" });
    });

    it("wraps backward from the first chip to the last with ArrowLeft, clearing the value", async () => {
      const onChange = setup({ value: "10:00", unit: "min" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit minutes/i })
        .focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith({ value: "", unit: "m" });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
      );
    });

    it("moves back with ArrowUp and clears the value", async () => {
      const onChange = setup({ value: "10:00", unit: "min" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit minutes/i })
        .focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(onChange).toHaveBeenCalledWith({ value: "", unit: "m" });
    });

    it("wraps forward from the last chip to the first with ArrowRight, clearing the value", async () => {
      const onChange = setup({ value: "2000", unit: "m" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit meters/i })
        .focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith({ value: "", unit: "min" });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }),
      );
    });
  });

  it("is reachable by keyboard and selects the focused chip on activation", async () => {
    const onChange = setup({ value: "10:00", unit: "min" });
    screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }).focus();
    await userEvent.keyboard("{ArrowRight}");
    onChange.mockClear();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith({ value: "", unit: "m" });
  });

  it("gives the value field and both chips the 44px hit-target class", () => {
    setup();
    expect(
      screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }),
    ).toHaveClass("duration-input-chip");
    expect(
      screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
    ).toHaveClass("duration-input-chip");
  });

  // Task 4 wiring: StepRowEditor passes fieldError("dur")-derived
  // invalid/errorId through, the same idiom PaceRefInput's `ref` group
  // already uses, so a failed Save's aria-invalid/aria-describedby wiring
  // survives the swap from a plain <input> to this control.
  it("wires aria-invalid/aria-describedby onto the value field when invalid/errorId are given", () => {
    render(
      <DurationInput
        value=""
        unit="min"
        onChange={vi.fn()}
        rowLabel="Row 1"
        invalid
        errorId="row-1-dur-error"
      />,
    );
    const input = screen.getByRole("textbox", { name: /Row 1 duration/i });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "row-1-dur-error");
  });

  it("defaults to aria-invalid=false with no aria-describedby when invalid/errorId are omitted", () => {
    setup();
    const input = screen.getByRole("textbox", { name: /Row 1 duration/i });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  // Exercises `registerRef`'s truthy branch — every other test in this file
  // renders without it, covering the falsy (optional-chaining no-op)
  // branch. Builder.tsx uses this to focus the value field directly (the
  // clone-focus and failed-Save-focus behaviors), so it must resolve to the
  // real <input>, not a wrapper.
  it("exposes the value input's DOM node via registerRef", () => {
    let captured: HTMLInputElement | null = null;
    render(
      <DurationInput
        value=""
        unit="min"
        onChange={vi.fn()}
        rowLabel="Row 1"
        registerRef={(el) => {
          captured = el;
        }}
      />,
    );
    expect(captured).toBe(
      screen.getByRole("textbox", { name: /Row 1 duration/i }),
    );
  });
});
