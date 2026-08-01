import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Effort, PaceBase } from "../../domain/types.js";
import PaceRefInput from "./PaceRefInput";

function renderInput(
  over: Partial<{ base: PaceBase; off: number; effort: Effort | null }> = {},
  onChange: (next: {
    base: PaceBase;
    off: number;
    effort: Effort | null;
  }) => void = vi.fn(),
) {
  render(
    <PaceRefInput
      base={over.base ?? "6k"}
      off={over.off ?? 0}
      effort={over.effort ?? null}
      onChange={onChange}
      rowLabel="Row 1"
    />,
  );
  return onChange;
}

function setup(
  over: Partial<{ base: PaceBase; off: number; effort: Effort | null }> = {},
) {
  const onChange = vi.fn();
  renderInput(over, onChange);
  return onChange;
}

describe("PaceRefInput", () => {
  it("renders four chips in one radiogroup", () => {
    renderInput({ effort: null });
    const group = screen.getByRole("radiogroup", { name: "Row 1 pace base" });
    expect(within(group).getAllByRole("radio")).toHaveLength(4);
    expect(
      within(group).getByRole("radio", { name: "Row 1 pace 2K" }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("radio", { name: "Row 1 pace 6K" }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("radio", { name: "Row 1 pace MAX" }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("radio", { name: "Row 1 pace MIN" }),
    ).toBeInTheDocument();
  });

  it("marks the active base checked, with no effort chip checked", () => {
    setup({ base: "2k", effort: null });
    expect(screen.getByRole("radio", { name: "Row 1 pace 2K" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Row 1 pace MAX" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Row 1 pace MIN" }),
    ).not.toBeChecked();
  });

  it("marks the active effort chip checked, with no base chip checked", () => {
    setup({ base: "6k", effort: "max" });
    expect(screen.getByRole("radio", { name: "Row 1 pace MAX" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Row 1 pace 6K" }),
    ).not.toBeChecked();
  });

  it("reports a base change without disturbing the offset, clearing any effort", async () => {
    const onChange = setup({ base: "6k", off: -2, effort: null });
    await userEvent.click(screen.getByRole("radio", { name: "Row 1 pace 2K" }));
    expect(onChange).toHaveBeenCalledWith({
      base: "2k",
      off: -2,
      effort: null,
    });
  });

  it("hides the offset stepper while an effort is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderInput({ effort: null, off: -2 }, onChange);
    await user.click(screen.getByRole("radio", { name: "Row 1 pace MAX" }));
    expect(onChange).toHaveBeenLastCalledWith({
      base: "6k",
      off: -2,
      effort: "max",
    });
  });

  it("restores the held offset when a base chip is re-selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderInput({ effort: "max", off: -2 }, onChange);
    expect(
      screen.queryByLabelText("Row 1 pace faster"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Row 1 pace 6K" }));
    expect(onChange).toHaveBeenLastCalledWith({
      base: "6k",
      off: -2,
      effort: null,
    });
  });

  it("steps the offset down and up by one second", async () => {
    const onChange = setup({ off: 0 });
    await userEvent.click(screen.getByRole("button", { name: /faster/i }));
    expect(onChange).toHaveBeenCalledWith({
      base: "6k",
      off: -1,
      effort: null,
    });
    onChange.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /slower/i }));
    expect(onChange).toHaveBeenCalledWith({ base: "6k", off: 1, effort: null });
  });

  it("clamps at the domain's ±60 bound instead of running away", async () => {
    const onChange = setup({ off: 60 });
    await userEvent.click(screen.getByRole("button", { name: /slower/i }));
    expect(onChange).toHaveBeenCalledWith({
      base: "6k",
      off: 60,
      effort: null,
    });
  });

  it("shows the offset with a real minus sign and no sign at zero", () => {
    const { unmount } = render(
      <PaceRefInput
        base="6k"
        off={-2}
        effort={null}
        onChange={() => {}}
        rowLabel="Row 1"
      />,
    );
    expect(screen.getByText("6k −2")).toBeInTheDocument();
    unmount();
    render(
      <PaceRefInput
        base="2k"
        off={0}
        effort={null}
        onChange={() => {}}
        rowLabel="Row 1"
      />,
    );
    expect(screen.getByText("2k")).toBeInTheDocument();
  });

  // Mirrors the deleted PainPicker.test.tsx's "roving tabIndex" / "arrow
  // key navigation" suites for this control's own radiogroup — now four
  // chips (2K/6K/MAX/MIN), so "wraps" and "moves forward/back" are distinct
  // transitions again (they collapsed into the same one back when there
  // were only two chips). The handler (selectByIndex/handleKeyDown,
  // PaceRefInput.tsx) is the identical pattern and needs the identical
  // coverage, generalized to CHIPS.length instead of a hardcoded 2.
  describe("roving tabIndex", () => {
    it("makes only the checked base chip tabbable", () => {
      setup({ base: "2k", effort: null });
      expect(
        screen.getByRole("radio", { name: "Row 1 pace 2K" }),
      ).toHaveAttribute("tabIndex", "0");
      expect(
        screen.getByRole("radio", { name: "Row 1 pace 6K" }),
      ).toHaveAttribute("tabIndex", "-1");
      expect(
        screen.getByRole("radio", { name: "Row 1 pace MAX" }),
      ).toHaveAttribute("tabIndex", "-1");
      expect(
        screen.getByRole("radio", { name: "Row 1 pace MIN" }),
      ).toHaveAttribute("tabIndex", "-1");
    });

    it("makes the checked effort chip tabbable instead", () => {
      setup({ base: "6k", effort: "min" });
      expect(
        screen.getByRole("radio", { name: "Row 1 pace MIN" }),
      ).toHaveAttribute("tabIndex", "0");
      expect(
        screen.getByRole("radio", { name: "Row 1 pace 6K" }),
      ).toHaveAttribute("tabIndex", "-1");
    });
  });

  describe("arrow key navigation", () => {
    it("moves forward with ArrowRight from 2K to 6K, focuses it, and reports the change", async () => {
      const onChange = setup({ base: "2k", off: -2 });
      screen.getByRole("radio", { name: "Row 1 pace 2K" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith({
        base: "6k",
        off: -2,
        effort: null,
      });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: "Row 1 pace 6K" }),
      );
    });

    it("moves forward with ArrowDown from 6K to MAX", async () => {
      const onChange = setup({ base: "6k" });
      screen.getByRole("radio", { name: "Row 1 pace 6K" }).focus();
      await userEvent.keyboard("{ArrowDown}");
      expect(onChange).toHaveBeenCalledWith({
        base: "6k",
        off: 0,
        effort: "max",
      });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: "Row 1 pace MAX" }),
      );
    });

    it("moves forward from MAX to MIN", async () => {
      const onChange = setup({ base: "6k", effort: "max" });
      screen.getByRole("radio", { name: "Row 1 pace MAX" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith({
        base: "6k",
        off: 0,
        effort: "min",
      });
    });

    it("keyboard-navigates across all four chips and wraps: ArrowRight from MIN wraps to 2K", async () => {
      const onChange = setup({ base: "6k", effort: "min" });
      screen.getByRole("radio", { name: "Row 1 pace MIN" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith({
        base: "2k",
        off: 0,
        effort: null,
      });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: "Row 1 pace 2K" }),
      );
    });

    it("wraps backward from the first chip (2K) to the last (MIN) with ArrowLeft", async () => {
      const onChange = setup({ base: "2k" });
      screen.getByRole("radio", { name: "Row 1 pace 2K" }).focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith({
        base: "2k",
        off: 0,
        effort: "min",
      });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: "Row 1 pace MIN" }),
      );
    });

    it("moves back with ArrowUp from 6K to 2K", async () => {
      const onChange = setup({ base: "6k" });
      screen.getByRole("radio", { name: "Row 1 pace 6K" }).focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(onChange).toHaveBeenCalledWith({
        base: "2k",
        off: 0,
        effort: null,
      });
    });
  });

  it("is reachable by keyboard and selects the focused chip on activation", async () => {
    const onChange = setup({ base: "2k" });
    screen.getByRole("radio", { name: "Row 1 pace 2K" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    onChange.mockClear();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith({ base: "6k", off: 0, effort: null });
  });

  describe("error wiring (L1)", () => {
    it("marks the radiogroup invalid and describes it by the given id", () => {
      render(
        <PaceRefInput
          base="6k"
          off={0}
          effort={null}
          onChange={() => {}}
          rowLabel="Row 1"
          invalid
          errorId="row-1-ref-error"
        />,
      );
      const group = screen.getByRole("radiogroup");
      expect(group).toHaveAttribute("aria-invalid", "true");
      expect(group).toHaveAttribute("aria-describedby", "row-1-ref-error");
    });

    it("leaves the radiogroup unmarked when there is no error", () => {
      setup();
      const group = screen.getByRole("radiogroup");
      expect(group).toHaveAttribute("aria-invalid", "false");
      expect(group).not.toHaveAttribute("aria-describedby");
    });
  });
});
