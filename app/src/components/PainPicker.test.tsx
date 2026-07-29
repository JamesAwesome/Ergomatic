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
});
