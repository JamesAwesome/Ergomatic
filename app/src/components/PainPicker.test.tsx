import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PainPicker from "./PainPicker";

describe("PainPicker", () => {
  it("offers exactly five choices (pain is 1–5, not 1–10)", () => {
    render(<PainPicker value={null} onChange={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("always shows the numeral beside the face, never a face alone", () => {
    render(<PainPicker value={null} onChange={() => {}} />);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(
        screen.getByRole("radio", { name: `Pain ${n}` }),
      ).toHaveTextContent(String(n));
    }
  });

  it("marks only the selected value as checked", () => {
    render(<PainPicker value={3} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Pain 3" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Pain 1" })).not.toBeChecked();
  });

  it("reports the chosen value", async () => {
    const onChange = vi.fn();
    render(<PainPicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Pain 4" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  describe("roving tabIndex", () => {
    it("makes only the checked cell tabbable", () => {
      render(<PainPicker value={3} onChange={() => {}} />);
      expect(screen.getByRole("radio", { name: "Pain 3" })).toHaveAttribute(
        "tabIndex",
        "0",
      );
      for (const n of [1, 2, 4, 5]) {
        expect(
          screen.getByRole("radio", { name: `Pain ${n}` }),
        ).toHaveAttribute("tabIndex", "-1");
      }
    });

    it("makes the first cell tabbable when nothing is selected", () => {
      render(<PainPicker value={null} onChange={() => {}} />);
      expect(screen.getByRole("radio", { name: "Pain 1" })).toHaveAttribute(
        "tabIndex",
        "0",
      );
      for (const n of [2, 3, 4, 5]) {
        expect(
          screen.getByRole("radio", { name: `Pain ${n}` }),
        ).toHaveAttribute("tabIndex", "-1");
      }
    });
  });

  describe("arrow key navigation", () => {
    it("moves forward with ArrowRight and reports the next value", async () => {
      const onChange = vi.fn();
      render(<PainPicker value={2} onChange={onChange} />);
      const cell = screen.getByRole("radio", { name: "Pain 2" });
      cell.focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith(3);
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: "Pain 3" }),
      );
    });

    it("moves forward with ArrowDown and reports the next value", async () => {
      const onChange = vi.fn();
      render(<PainPicker value={2} onChange={onChange} />);
      screen.getByRole("radio", { name: "Pain 2" }).focus();
      await userEvent.keyboard("{ArrowDown}");
      expect(onChange).toHaveBeenCalledWith(3);
    });

    it("moves back with ArrowLeft and reports the previous value", async () => {
      const onChange = vi.fn();
      render(<PainPicker value={3} onChange={onChange} />);
      const cell = screen.getByRole("radio", { name: "Pain 3" });
      cell.focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith(2);
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: "Pain 2" }),
      );
    });

    it("moves back with ArrowUp and reports the previous value", async () => {
      const onChange = vi.fn();
      render(<PainPicker value={3} onChange={onChange} />);
      screen.getByRole("radio", { name: "Pain 3" }).focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(onChange).toHaveBeenCalledWith(2);
    });

    it("wraps backward from the first cell to the last", async () => {
      const onChange = vi.fn();
      render(<PainPicker value={1} onChange={onChange} />);
      screen.getByRole("radio", { name: "Pain 1" }).focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith(5);
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: "Pain 5" }),
      );
    });

    it("wraps forward from the last cell to the first", async () => {
      const onChange = vi.fn();
      render(<PainPicker value={5} onChange={onChange} />);
      screen.getByRole("radio", { name: "Pain 5" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith(1);
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: "Pain 1" }),
      );
    });
  });

  it("is reachable by keyboard and selects the focused cell on activation", async () => {
    const onChange = vi.fn();
    render(<PainPicker value={null} onChange={onChange} />);
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Pain 1" }),
    );
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
