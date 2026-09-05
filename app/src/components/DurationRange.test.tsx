import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DurationRange } from "./DurationRange";
import type { DurationRange as Range } from "../../domain/duration.js";

function renderRange(value: Range) {
  const onChange = vi.fn();
  render(<DurationRange label="TIME" value={value} onChange={onChange} />);
  return {
    onChange,
    shortest: screen.getByRole("slider", { name: "Shortest" }),
    longest: screen.getByRole("slider", { name: "Longest" }),
  };
}

describe("DurationRange", () => {
  it("renders two sliders in one labelled group carrying the APG value attributes and the sentinel texts", () => {
    const { shortest, longest } = renderRange({ min: 0, max: 120 });
    expect(screen.getByRole("group", { name: "TIME" })).toBeInTheDocument();
    expect(shortest).toHaveAttribute("aria-valuemin", "0");
    expect(shortest).toHaveAttribute("aria-valuemax", "120");
    expect(shortest).toHaveAttribute("aria-valuenow", "0");
    expect(longest).toHaveAttribute("aria-valuemin", "0");
    expect(longest).toHaveAttribute("aria-valuemax", "120");
    expect(shortest).toHaveAttribute("aria-valuetext", "any");
    expect(longest).toHaveAttribute("aria-valuenow", "120");
    expect(longest).toHaveAttribute("aria-valuetext", "no limit");
    expect(screen.getByText("ANY")).toBeInTheDocument();
    expect(screen.getByText("120′+")).toBeInTheDocument();
  });

  it("advertises the dependent bounds: the lower thumb's max is the upper's value and the upper's min is the lower's (APG multi-thumb)", () => {
    const { shortest, longest } = renderRange({ min: 25, max: 60 });
    expect(shortest).toHaveAttribute("aria-valuemin", "0");
    expect(shortest).toHaveAttribute("aria-valuemax", "60");
    expect(longest).toHaveAttribute("aria-valuemin", "25");
    expect(longest).toHaveAttribute("aria-valuemax", "120");
  });

  it("is in the tab sequence: both thumbs are reachable with Tab", async () => {
    const { shortest, longest } = renderRange({ min: 25, max: 35 });
    await userEvent.tab();
    expect(shortest).toHaveFocus();
    await userEvent.tab();
    expect(longest).toHaveFocus();
  });

  // Independent literals throughout (RF21): 5 and 15 are typed here, never
  // read off DURATION_STEP, so retuning the step retunes nothing here.
  it("ArrowRight/ArrowUp step the lower thumb up by 5, ArrowLeft/ArrowDown down by 5", () => {
    const { shortest, onChange } = renderRange({ min: 25, max: 60 });
    fireEvent.keyDown(shortest, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 30, max: 60 });
    fireEvent.keyDown(shortest, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 30, max: 60 });
    fireEvent.keyDown(shortest, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 20, max: 60 });
    fireEvent.keyDown(shortest, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 20, max: 60 });
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("PageUp/PageDown step by 15", () => {
    const { longest, onChange } = renderRange({ min: 25, max: 60 });
    fireEvent.keyDown(longest, { key: "PageUp" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 25, max: 75 });
    fireEvent.keyDown(longest, { key: "PageDown" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 25, max: 45 });
  });

  it("Home/End take the lower thumb to 0 and to the upper thumb; the upper thumb to the lower thumb and to 120", () => {
    const { shortest, longest, onChange } = renderRange({ min: 25, max: 60 });
    fireEvent.keyDown(shortest, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 0, max: 60 });
    fireEvent.keyDown(shortest, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 60, max: 60 });
    fireEvent.keyDown(longest, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 25, max: 25 });
    fireEvent.keyDown(longest, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 25, max: 120 });
  });

  it("thumbs cannot cross: the mover stops at the other's value, and the bounds clamp", () => {
    const { shortest, longest, onChange } = renderRange({ min: 30, max: 35 });
    fireEvent.keyDown(shortest, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 35, max: 35 });
    onChange.mockClear();
    fireEvent.keyDown(longest, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith({ min: 30, max: 30 });
    onChange.mockClear();
    // At a point (30, 30) neither can pass the other; a step INTO the other
    // is a no-op (no change emitted), a step away moves.
    const point = renderPoint();
    fireEvent.keyDown(point.shortest, { key: "ArrowRight" });
    expect(point.onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(point.longest, { key: "ArrowLeft" });
    expect(point.onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(point.longest, { key: "ArrowRight" });
    expect(point.onChange).toHaveBeenLastCalledWith({ min: 30, max: 35 });
  });

  function renderPoint() {
    const onChange = vi.fn();
    const { getAllByRole } = render(
      <DurationRange
        label="POINT"
        value={{ min: 30, max: 30 }}
        onChange={onChange}
      />,
    );
    const sliders = getAllByRole("slider");
    return {
      onChange,
      shortest: sliders[sliders.length - 2],
      longest: sliders[sliders.length - 1],
    };
  }

  it("does not move below 0 or above 120", () => {
    const { shortest, longest, onChange } = renderRange({ min: 0, max: 120 });
    fireEvent.keyDown(shortest, { key: "ArrowLeft" });
    fireEvent.keyDown(longest, { key: "ArrowRight" });
    fireEvent.keyDown(longest, { key: "PageUp" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores keys the pattern does not name (Enter, Space, a letter)", () => {
    const { shortest, onChange } = renderRange({ min: 25, max: 60 });
    fireEvent.keyDown(shortest, { key: "Enter" });
    fireEvent.keyDown(shortest, { key: " " });
    fireEvent.keyDown(shortest, { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  // Pointer geometry: jsdom has no layout, so the rail's box is stubbed at
  // 0..240 px, making every 5-minute step exactly 10 px.
  function stubRail() {
    const rail = document.querySelector(".duration-range-rail") as HTMLElement;
    rail.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 240,
        top: 0,
        height: 4,
        right: 240,
        bottom: 4,
        x: 0,
        y: 0,
        toJSON() {},
      }) as DOMRect;
    return rail;
  }

  it("dragging a thumb maps pointer x to the nearest 5-minute step and never crosses the other thumb", () => {
    const { shortest, onChange } = renderRange({ min: 0, max: 60 });
    stubRail();
    shortest.setPointerCapture = vi.fn();
    shortest.releasePointerCapture = vi.fn();
    shortest.hasPointerCapture = vi.fn(() => true);
    fireEvent.pointerDown(shortest, { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(shortest, { pointerId: 1, clientX: 52 }); // 26 min -> 25
    expect(onChange).toHaveBeenLastCalledWith({ min: 25, max: 60 });
    fireEvent.pointerMove(shortest, { pointerId: 1, clientX: 200 }); // 100 min -> clamps to 60
    expect(onChange).toHaveBeenLastCalledWith({ min: 60, max: 60 });
    fireEvent.pointerUp(shortest, { pointerId: 1 });
    expect(shortest.releasePointerCapture).toHaveBeenCalledWith(1);
    onChange.mockClear();
    // After release, a stray move does nothing.
    fireEvent.pointerMove(shortest, { pointerId: 1, clientX: 20 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a tap outside a COLLAPSED range moves the thumb on that side (no dead tap at a point)", () => {
    const { onChange } = renderRange({ min: 30, max: 30 });
    const rail = stubRail();
    fireEvent.pointerDown(rail, { pointerId: 4, clientX: 100 }); // 50 min, above the point
    expect(onChange).toHaveBeenLastCalledWith({ min: 30, max: 50 });
    fireEvent.pointerDown(rail, { pointerId: 5, clientX: 20 }); // 10 min, below the point
    expect(onChange).toHaveBeenLastCalledWith({ min: 10, max: 30 });
  });

  it("a tap on the rail moves the NEARER thumb to the tapped value", () => {
    const { onChange } = renderRange({ min: 20, max: 100 });
    const rail = stubRail();
    fireEvent.pointerDown(rail, { pointerId: 2, clientX: 60 }); // 30 min, nearer the lower thumb
    expect(onChange).toHaveBeenLastCalledWith({ min: 30, max: 100 });
    fireEvent.pointerDown(rail, { pointerId: 3, clientX: 180 }); // 90 min, nearer the upper thumb
    expect(onChange).toHaveBeenLastCalledWith({ min: 20, max: 90 });
  });
});
