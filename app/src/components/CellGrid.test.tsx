import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CellGrid } from "./CellGrid";

describe("CellGrid", () => {
  it("renders the group label and one button per cell, aria-pressed from the pressed field", () => {
    render(
      <CellGrid
        label="PAIN"
        cells={[
          { value: "1", label: "1", pressed: false },
          { value: "2", label: "2", pressed: true },
        ]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("PAIN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("derives the column-count class from cells.length", () => {
    const { container } = render(
      <CellGrid
        label="TYPE"
        cells={[
          { value: "a", label: "A", pressed: false },
          { value: "b", label: "B", pressed: false },
          { value: "c", label: "C", pressed: false },
        ]}
        onToggle={vi.fn()}
      />,
    );
    expect(container.querySelector(".filter-sheet-grid-3")).toBeInTheDocument();
  });

  it("clicking a cell reports its own value via onToggle, not the caller's active state", async () => {
    const onToggle = vi.fn();
    render(
      <CellGrid
        label="TIME"
        cells={[{ value: "45-60", label: "45–60′", pressed: false }]}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "45–60′" }));
    expect(onToggle).toHaveBeenCalledWith("45-60");
  });

  it("applies a cell's own inline style when given (the TYPE-color hook)", () => {
    render(
      <CellGrid
        label="TYPE"
        cells={[
          {
            value: "O2",
            label: "O2",
            pressed: true,
            style: { background: "var(--type-o2)" },
          },
        ]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "O2" })).toHaveAttribute(
      "style",
      expect.stringContaining("--type-o2"),
    );
  });

  it("appends an optional className modifier to its own group class", () => {
    const { container } = render(
      <CellGrid
        label="SOURCE"
        className="filter-sheet-group-half"
        cells={[{ value: "global", label: "GLOBAL", pressed: false }]}
        onToggle={vi.fn()}
      />,
    );
    const group = container.querySelector(".filter-sheet-group");
    expect(group).toHaveClass("filter-sheet-group-half");
  });
});
