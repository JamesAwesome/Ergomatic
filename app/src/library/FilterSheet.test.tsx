import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_FILTERS, type Filters } from "./filters";
import FilterSheet from "./FilterSheet";

function renderSheet(
  overrides: Partial<{
    draft: Filters;
    resultCount: number;
    onChangeDraft: (next: Filters) => void;
    onApply: () => void;
    onDismiss: () => void;
  }> = {},
) {
  const onChangeDraft = overrides.onChangeDraft ?? vi.fn();
  const onApply = overrides.onApply ?? vi.fn();
  const onDismiss = overrides.onDismiss ?? vi.fn();
  const { unmount } = render(
    <FilterSheet
      draft={overrides.draft ?? EMPTY_FILTERS}
      onChangeDraft={onChangeDraft}
      resultCount={overrides.resultCount ?? 35}
      onApply={onApply}
      onDismiss={onDismiss}
    />,
  );
  return { onChangeDraft, onApply, onDismiss, unmount };
}

describe("FilterSheet", () => {
  it("renders as a labelled dialog holding all four groups", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Filter" });
    for (const label of ["TIME", "PAIN", "LAST DONE", "SOURCE"]) {
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    }
    for (const bucket of ["<30′", "30–45′", "45–60′", "60′+"]) {
      expect(
        within(dialog).getByRole("button", { name: bucket }),
      ).toBeInTheDocument();
    }
    for (const level of ["1", "2", "3", "4", "5"]) {
      expect(
        within(dialog).getByRole("button", { name: level }),
      ).toBeInTheDocument();
    }
    expect(
      within(dialog).getByRole("button", { name: "<21D" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "21D+" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "GLOBAL" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "CUSTOM" }),
    ).toBeInTheDocument();
  });

  // library-filter-unification round, Task 1 (pulled forward from Task 2's
  // own contract item 4): TYPE left the sheet entirely — no "TYPE" group
  // label, no type-coded cell, nothing named after a WorkoutType code.
  // Task 2 puts the chip row above the list instead; until then this
  // branch simply has no type-filtering UI, and this test is what pins
  // that honestly rather than leaving the old sheet-based assertions
  // silently describing a control that no longer exists.
  it("has no TYPE group and no type-coded cell — TYPE left the sheet entirely", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Filter" });
    expect(within(dialog).queryByText("TYPE")).not.toBeInTheDocument();
    for (const type of ["O2", "AT", "TR", "AN"]) {
      expect(
        within(dialog).queryByRole("button", { name: type }),
      ).not.toBeInTheDocument();
    }
  });

  it("aria-pressed on each cell reflects the draft prop, not internal state", () => {
    const draft: Filters = {
      ...EMPTY_FILTERS,
      durations: ["45-60"],
      painLevels: [3, 4],
      lastDone: "under21",
      source: "global",
    };
    renderSheet({ draft });

    expect(screen.getByRole("button", { name: "45–60′" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "5" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "<21D" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "GLOBAL" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clicking a TIME cell reports the toggled draft", async () => {
    const { onChangeDraft } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "45–60′" }));
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      durations: ["45-60"],
    });
  });

  it("clicking a PAIN cell reports the toggled draft", async () => {
    const { onChangeDraft } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "4" }));
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      painLevels: [4],
    });
  });

  it("clicking the under21 LAST DONE cell reports the set draft", async () => {
    const { onChangeDraft } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "<21D" }));
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      lastDone: "under21",
    });
  });

  it("clicking the over21 LAST DONE cell reports the set draft", async () => {
    const { onChangeDraft } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "21D+" }));
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      lastDone: "over21",
    });
  });

  it("clicking the CUSTOM SOURCE cell reports the set draft", async () => {
    const { onChangeDraft } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "CUSTOM" }));
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      source: "custom",
    });
  });

  it("clicking the GLOBAL SOURCE cell reports the set draft", async () => {
    const { onChangeDraft } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "GLOBAL" }));
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      source: "global",
    });
  });

  it("CLEAR reports an empty draft without calling onApply/onDismiss", async () => {
    const { onChangeDraft, onApply, onDismiss } = renderSheet({
      draft: { ...EMPTY_FILTERS, source: "custom" },
    });
    await userEvent.click(screen.getByRole("button", { name: "CLEAR" }));
    expect(onChangeDraft).toHaveBeenCalledWith(EMPTY_FILTERS);
    expect(onApply).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("the primary reads 'Show N workouts' from resultCount and calls onApply", async () => {
    const { onApply } = renderSheet({ resultCount: 12 });
    const primary = screen.getByRole("button", { name: "Show 12 workouts" });
    expect(primary).not.toBeDisabled();
    await userEvent.click(primary);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  // Fix round 2 (whole-branch review M2): "Show 1 workouts" shipped
  // unconditionally plural — this pins the singular-aware copy.
  it("the primary reads the singular 'Show 1 workout' at resultCount 1", () => {
    renderSheet({ resultCount: 1 });
    expect(
      screen.getByRole("button", { name: "Show 1 workout" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show 1 workouts" }),
    ).not.toBeInTheDocument();
  });

  it("the primary reads 'No workouts match' and disables at resultCount 0", () => {
    renderSheet({ resultCount: 0 });
    expect(
      screen.getByRole("button", { name: "No workouts match" }),
    ).toBeDisabled();
  });

  it("clicking the backdrop calls onDismiss", async () => {
    const { onDismiss } = renderSheet();
    // The dialog's own parent IS the backdrop element carrying the onClick.
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clicking inside the panel does not call onDismiss (stopPropagation)", async () => {
    const { onDismiss } = renderSheet();
    await userEvent.click(screen.getByText("TIME"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("Escape calls onDismiss", async () => {
    const { onDismiss } = renderSheet();
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("a key other than Escape does not call onDismiss", async () => {
    const { onDismiss } = renderSheet();
    await userEvent.keyboard("{Enter}");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // Md4 (whole-branch review): this was the codebase's first `role="dialog"`
  // with no focus management at all — `aria-modal="true"` asserted to
  // assistive tech that everything outside was inert while the list and tab
  // bar behind it stayed genuinely focusable. These three pin the fix.
  describe("focus management (Md4)", () => {
    it("moves focus into the sheet on open — the first control, CLEAR", () => {
      renderSheet();
      expect(screen.getByRole("button", { name: "CLEAR" })).toHaveFocus();
    });

    it("restores focus to whatever had focus before the sheet opened, once it closes", () => {
      render(<button type="button">trigger</button>);
      const trigger = screen.getByRole("button", { name: "trigger" });
      trigger.focus();
      expect(trigger).toHaveFocus();

      const { unmount } = renderSheet();
      expect(trigger).not.toHaveFocus();
      unmount();

      expect(trigger).toHaveFocus();
    });

    it("Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last", async () => {
      renderSheet();
      const clear = screen.getByRole("button", { name: "CLEAR" });
      const primary = screen.getByRole("button", {
        name: /^Show \d+ workouts?$/,
      });
      expect(clear).toHaveFocus();

      await userEvent.tab({ shift: true });
      expect(primary).toHaveFocus();

      await userEvent.tab();
      expect(clear).toHaveFocus();
    });
  });
});
