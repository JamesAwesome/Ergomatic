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
});
