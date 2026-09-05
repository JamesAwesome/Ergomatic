import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(within(dialog).queryByText("DIFFICULTY")).not.toBeInTheDocument();
    // Phase SF PR2: TIME is the two-thumb range, not four cells.
    expect(
      within(dialog).getByRole("slider", { name: "Shortest" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("slider", { name: "Longest" }),
    ).toBeInTheDocument();
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
      within(dialog).getByRole("button", { name: "ERGOMATIC LIBRARY" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "MY WORKOUTS" }),
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
      durationRange: { min: 45, max: 60 },
      painLevels: [3, 4],
      lastDone: "under21",
      source: "global",
    };
    renderSheet({ draft });

    expect(screen.getByRole("slider", { name: "Shortest" })).toHaveAttribute(
      "aria-valuenow",
      "45",
    );
    expect(screen.getByRole("slider", { name: "Longest" })).toHaveAttribute(
      "aria-valuenow",
      "60",
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
    expect(
      screen.getByRole("button", { name: "ERGOMATIC LIBRARY" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  // Consumes filters.ts's own `toggleDifficulty` (M-10: the sheet must use
  // the named helper, not an inlined equivalent spread).

  it("stepping a TIME thumb reports the new range in the draft", () => {
    const { onChangeDraft } = renderSheet();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Longest" }), {
      key: "ArrowLeft",
    });
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      durationRange: { min: 0, max: 115 },
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
    await userEvent.click(screen.getByRole("button", { name: "MY WORKOUTS" }));
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      source: "custom",
    });
  });

  it("clicking the GLOBAL SOURCE cell reports the set draft", async () => {
    const { onChangeDraft } = renderSheet();
    await userEvent.click(
      screen.getByRole("button", { name: "ERGOMATIC LIBRARY" }),
    );
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      source: "global",
    });
  });

  // Fix round (whole-branch review, finding B): CLEAR resets exactly the
  // sheet's OWN groups (DIFFICULTY/TIME/PAIN/LAST DONE/SOURCE) — `types`,
  // the chip row's own group with no control inside this sheet at all, is
  // untouched. Seeding a non-empty `types` here is the point: against the
  // old `clearFilters()` behaviour this draft would have come back with
  // `types: []`, which this assertion would catch.
  it("CLEAR resets the sheet's own groups but leaves types untouched, without calling onApply/onDismiss", async () => {
    const { onChangeDraft, onApply, onDismiss } = renderSheet({
      draft: { ...EMPTY_FILTERS, types: ["O2"], source: "custom" },
    });
    await userEvent.click(screen.getByRole("button", { name: "CLEAR" }));
    expect(onChangeDraft).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      types: ["O2"],
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // library-filter-unification round, Task 2 (spec §3): the primary adopts
  // Today's own "Apply Filter" constant — the count moves OUT of the
  // button's accessible name entirely, at every resultCount, plural or not.
  it("the primary reads the constant 'Apply Filter' regardless of resultCount, and calls onApply", async () => {
    const { onApply } = renderSheet({ resultCount: 12 });
    const primary = screen.getByRole("button", { name: "Apply Filter" });
    expect(primary).not.toBeDisabled();
    await userEvent.click(primary);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("the primary is disabled at resultCount 0, still reading 'Apply Filter'", () => {
    renderSheet({ resultCount: 0 });
    expect(screen.getByRole("button", { name: "Apply Filter" })).toBeDisabled();
  });

  // The count (and the only explanation of why the button disables at 0)
  // lives in a caption above the primary, wired by aria-describedby —
  // TodayFilterSheet.tsx's own COUNT_ID idiom, copied here.
  describe("the result-count caption", () => {
    it("reads '{n} WORKOUTS' at a plural count", () => {
      renderSheet({ resultCount: 12 });
      expect(screen.getByText("12 WORKOUTS")).toBeInTheDocument();
    });

    it("reads the singular '1 WORKOUT' at exactly one match", () => {
      renderSheet({ resultCount: 1 });
      expect(screen.getByText("1 WORKOUT")).toBeInTheDocument();
      expect(screen.queryByText("1 WORKOUTS")).not.toBeInTheDocument();
    });

    it("reads 'NO WORKOUTS MATCH' at zero matches", () => {
      renderSheet({ resultCount: 0 });
      expect(screen.getByText("NO WORKOUTS MATCH")).toBeInTheDocument();
    });

    it("is wired to the primary via aria-describedby", () => {
      renderSheet({ resultCount: 12 });
      const primary = screen.getByRole("button", { name: "Apply Filter" });
      const captionId = primary.getAttribute("aria-describedby");
      expect(captionId).toBeTruthy();
      expect(document.getElementById(captionId!)).toHaveTextContent(
        "12 WORKOUTS",
      );
    });
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
      const primary = screen.getByRole("button", { name: "Apply Filter" });
      expect(clear).toHaveFocus();

      await userEvent.tab({ shift: true });
      expect(primary).toHaveFocus();

      await userEvent.tab();
      expect(clear).toHaveFocus();
    });
  });
});
