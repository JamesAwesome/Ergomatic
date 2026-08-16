// The header segmented control (CR2 spec 3, task 1 — design spec §3
// "Components"). Replaces `PagerRail`'s labelled dots-in-a-gutter with a
// two-button pill: one shape now serves both the landscape header slot and
// the portrait bottom bar, positioned by CSS alone (see `index.css`'s own
// comment on `.connected-control`), never by a second markup.
//
// RULING (antagonist correction 2, task-1 brief): the accessible names KEEP
// PagerRail's values — `aria-label="Live pane"` / `"Grid pane"` — because
// ~27 existing selectors across unit/e2e/fixtures already anchor on them
// and renaming is a 27-site sweep for zero rower-facing benefit. The
// visible `LIVE`/`GRID` text is `aria-hidden`, matching the rail's own
// shipped pattern (both a spoken name and a printed word exist; only one of
// them is exposed to a screen reader, so neither reads twice).
//
// KEYBOARD (task-1 brief step 1): no roving tabindex — two independent
// `<button>`s in normal tab order, the same semantics the rail already
// shipped (PagerRail never had a tablist; nothing here invents one either,
// matching the spec's own "no APG tablist invention" line, §3).

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SegmentedControl, { PANES } from "./SegmentedControl";

describe("SegmentedControl (CR2 spec 3 task 1)", () => {
  it("renders two halves carrying the visible words LIVE and GRID", () => {
    render(<SegmentedControl active="live" onSelect={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Connected panes" });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => b.textContent)).toStrictEqual(["LIVE", "GRID"]);
  });

  it("has exactly two panes, live then grid", () => {
    expect(PANES).toStrictEqual(["live", "grid"]);
  });

  it("marks the active half with aria-current and the active class, and only that one", () => {
    render(<SegmentedControl active="grid" onSelect={vi.fn()} />);
    const live = screen.getByRole("button", { name: "Live pane" });
    const grid = screen.getByRole("button", { name: "Grid pane" });
    expect(grid).toHaveAttribute("aria-current", "page");
    expect(grid.className).toContain("connected-control-half-active");
    expect(live).not.toHaveAttribute("aria-current");
    expect(live.className).not.toContain("connected-control-half-active");
    // Both still carry the base class — only the active one gets the second.
    expect(live.className).toContain("connected-control-half");
  });

  it("carries the wrapping class the shell's CSS positions (control, not header child)", () => {
    render(<SegmentedControl active="live" onSelect={vi.fn()} />);
    expect(
      screen.getByRole("navigation", { name: "Connected panes" }),
    ).toHaveClass("connected-control");
  });

  it("click calls onSelect with the pane id AND the pressed element", async () => {
    const onSelect = vi.fn();
    render(<SegmentedControl active="live" onSelect={onSelect} />);
    const grid = screen.getByRole("button", { name: "Grid pane" });
    await userEvent.click(grid);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("grid", grid);
  });

  it("both halves are real buttons in normal tab order — no roving tabindex", async () => {
    render(<SegmentedControl active="live" onSelect={vi.fn()} />);
    const live = screen.getByRole("button", { name: "Live pane" });
    const grid = screen.getByRole("button", { name: "Grid pane" });
    // Neither carries an explicit tabindex of its own — a roving-tabindex
    // widget would set one of them to -1 and manage arrow-key focus; this
    // control does neither, matching the rail's own shipped semantics.
    expect(live).not.toHaveAttribute("tabindex");
    expect(grid).not.toHaveAttribute("tabindex");
    live.focus();
    expect(document.activeElement).toBe(live);
    await userEvent.tab();
    expect(document.activeElement).toBe(grid);
  });

  it("the visible word is aria-hidden — the spoken name is the aria-label alone", () => {
    render(<SegmentedControl active="live" onSelect={vi.fn()} />);
    const live = screen.getByRole("button", { name: "Live pane" });
    const word = live.querySelector("span");
    expect(word).not.toBeNull();
    expect(word).toHaveAttribute("aria-hidden", "true");
    expect(word!.textContent).toBe("LIVE");
  });
});
