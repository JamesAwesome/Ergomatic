import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaceRefInput from "./PaceRefInput";

function setup(over: Partial<{ base: "2k" | "6k"; off: number }> = {}) {
  const onChange = vi.fn();
  render(
    <PaceRefInput
      base={over.base ?? "6k"}
      off={over.off ?? 0}
      onChange={onChange}
      rowLabel="row 1"
    />,
  );
  return onChange;
}

describe("PaceRefInput", () => {
  it("offers only the two bases the domain understands", () => {
    setup();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /2K/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /6K/ })).toBeInTheDocument();
  });

  it("marks the active base", () => {
    setup({ base: "2k" });
    expect(screen.getByRole("radio", { name: /2K/ })).toBeChecked();
  });

  it("reports a base change without disturbing the offset", async () => {
    const onChange = setup({ base: "6k", off: -2 });
    await userEvent.click(screen.getByRole("radio", { name: /2K/ }));
    expect(onChange).toHaveBeenCalledWith({ base: "2k", off: -2 });
  });

  it("steps the offset down and up by one second", async () => {
    const onChange = setup({ off: 0 });
    await userEvent.click(screen.getByRole("button", { name: /faster/i }));
    expect(onChange).toHaveBeenCalledWith({ base: "6k", off: -1 });
    onChange.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /slower/i }));
    expect(onChange).toHaveBeenCalledWith({ base: "6k", off: 1 });
  });

  it("clamps at the domain's ±60 bound instead of running away", async () => {
    const onChange = setup({ off: 60 });
    await userEvent.click(screen.getByRole("button", { name: /slower/i }));
    expect(onChange).toHaveBeenCalledWith({ base: "6k", off: 60 });
  });

  it("shows the offset with a real minus sign and no sign at zero", () => {
    const { unmount } = render(
      <PaceRefInput base="6k" off={-2} onChange={() => {}} rowLabel="row 1" />,
    );
    expect(screen.getByText("6k −2")).toBeInTheDocument();
    unmount();
    render(
      <PaceRefInput base="2k" off={0} onChange={() => {}} rowLabel="row 1" />,
    );
    expect(screen.getByText("2k")).toBeInTheDocument();
  });

  // Mirrors PainPicker.test.tsx's "roving tabIndex" / "arrow key navigation"
  // suites for this control's own radiogroup — only two chips here (2k/6k),
  // so "wraps" and "moves forward/back" collapse into the same transition,
  // but the handler (selectByIndex/handleKeyDown, PaceRefInput.tsx:43-67)
  // is the identical pattern and needs the identical coverage.
  describe("roving tabIndex", () => {
    it("makes only the checked chip tabbable", () => {
      setup({ base: "2k" });
      expect(screen.getByRole("radio", { name: /2K/ })).toHaveAttribute(
        "tabIndex",
        "0",
      );
      expect(screen.getByRole("radio", { name: /6K/ })).toHaveAttribute(
        "tabIndex",
        "-1",
      );
    });

    it("moves the tabbable chip when the checked base changes", () => {
      setup({ base: "6k" });
      expect(screen.getByRole("radio", { name: /6K/ })).toHaveAttribute(
        "tabIndex",
        "0",
      );
      expect(screen.getByRole("radio", { name: /2K/ })).toHaveAttribute(
        "tabIndex",
        "-1",
      );
    });
  });

  describe("arrow key navigation", () => {
    it("moves forward with ArrowRight, focuses the next chip, and reports the change", async () => {
      const onChange = setup({ base: "2k", off: -2 });
      screen.getByRole("radio", { name: /2K/ }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith({ base: "6k", off: -2 });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: /6K/ }),
      );
    });

    it("moves forward with ArrowDown and reports the change", async () => {
      const onChange = setup({ base: "2k" });
      screen.getByRole("radio", { name: /2K/ }).focus();
      await userEvent.keyboard("{ArrowDown}");
      expect(onChange).toHaveBeenCalledWith({ base: "6k", off: 0 });
    });

    it("wraps backward from the first chip to the last with ArrowLeft", async () => {
      const onChange = setup({ base: "2k" });
      screen.getByRole("radio", { name: /2K/ }).focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith({ base: "6k", off: 0 });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: /6K/ }),
      );
    });

    it("moves back with ArrowUp and reports the change", async () => {
      const onChange = setup({ base: "2k" });
      screen.getByRole("radio", { name: /2K/ }).focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(onChange).toHaveBeenCalledWith({ base: "6k", off: 0 });
    });

    it("wraps forward from the last chip to the first with ArrowRight", async () => {
      const onChange = setup({ base: "6k" });
      screen.getByRole("radio", { name: /6K/ }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith({ base: "2k", off: 0 });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: /2K/ }),
      );
    });
  });

  it("is reachable by keyboard and selects the focused chip on activation", async () => {
    const onChange = setup({ base: "2k" });
    screen.getByRole("radio", { name: /2K/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    onChange.mockClear();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith({ base: "6k", off: 0 });
  });

  describe("error wiring (L1)", () => {
    it("marks the radiogroup invalid and describes it by the given id", () => {
      render(
        <PaceRefInput
          base="6k"
          off={0}
          onChange={() => {}}
          rowLabel="row 1"
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
