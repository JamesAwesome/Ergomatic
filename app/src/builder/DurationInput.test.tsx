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

describe("DurationInput", () => {
  it("reports digits typed into the value field, unit unchanged", () => {
    const onChange = setup({ value: "", unit: "min" });
    fireEvent.change(screen.getByRole("textbox", { name: /Row 1 duration/i }), {
      target: { value: "25" },
    });
    expect(onChange).toHaveBeenCalledWith({ value: "25", unit: "min" });
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

  it("reports a unit change while leaving the value untouched", async () => {
    const onChange = setup({ value: "10", unit: "min" });
    await userEvent.click(
      screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
    );
    expect(onChange).toHaveBeenCalledWith({ value: "10", unit: "m" });
  });

  // Mirrors PainPicker.test.tsx / PaceRefInput.test.tsx's roving-tabIndex
  // and arrow-key suites for this control's own radiogroup — only two
  // chips (MIN/M), so "wraps" and "moves forward/back" collapse into the
  // same transition, but the handler is the identical roving-tabindex
  // pattern and needs the identical coverage.
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
    it("moves forward with ArrowRight, focuses the next chip, and reports the change", async () => {
      const onChange = setup({ value: "10", unit: "min" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit minutes/i })
        .focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith({ value: "10", unit: "m" });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
      );
    });

    it("moves forward with ArrowDown and reports the change", async () => {
      const onChange = setup({ value: "10", unit: "min" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit minutes/i })
        .focus();
      await userEvent.keyboard("{ArrowDown}");
      expect(onChange).toHaveBeenCalledWith({ value: "10", unit: "m" });
    });

    it("wraps backward from the first chip to the last with ArrowLeft", async () => {
      const onChange = setup({ value: "10", unit: "min" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit minutes/i })
        .focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith({ value: "10", unit: "m" });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: /Row 1 duration unit meters/i }),
      );
    });

    it("moves back with ArrowUp and reports the change", async () => {
      const onChange = setup({ value: "10", unit: "min" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit minutes/i })
        .focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(onChange).toHaveBeenCalledWith({ value: "10", unit: "m" });
    });

    it("wraps forward from the last chip to the first with ArrowRight", async () => {
      const onChange = setup({ value: "10", unit: "m" });
      screen
        .getByRole("radio", { name: /Row 1 duration unit meters/i })
        .focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith({ value: "10", unit: "min" });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }),
      );
    });
  });

  it("is reachable by keyboard and selects the focused chip on activation", async () => {
    const onChange = setup({ value: "10", unit: "min" });
    screen.getByRole("radio", { name: /Row 1 duration unit minutes/i }).focus();
    await userEvent.keyboard("{ArrowRight}");
    onChange.mockClear();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith({ value: "10", unit: "m" });
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
});
