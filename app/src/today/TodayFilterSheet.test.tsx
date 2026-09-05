import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TodayFilterSheet, { type TodayFilterDraft } from "./TodayFilterSheet";

const EMPTY_DRAFT: TodayFilterDraft = {
  durationRange: { min: 0, max: 60 },
  painLevels: [],
  lastDone: null,
  source: null,
};

/** Today's own `opener` is a caller-owned ref to a real button (unlike
 *  Library's FilterSheet, which captures `document.activeElement` inside
 *  itself) — every render needs a real element behind the ref for
 *  SheetShell's focus-restore effect to have somewhere to send focus back
 *  to, so this helper always renders one. */
function Harness({
  draft = EMPTY_DRAFT,
  onChangeDraft = vi.fn(),
  poolCount = 5,
  onApply = vi.fn(),
  onDismiss = vi.fn(),
  render: shouldRender = true,
}: Partial<{
  draft: TodayFilterDraft;
  onChangeDraft: (next: TodayFilterDraft) => void;
  poolCount: number;
  onApply: () => void;
  onDismiss: () => void;
  render: boolean;
}>) {
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" ref={opener}>
        FILTER ⌄
      </button>
      {shouldRender && (
        <TodayFilterSheet
          draft={draft}
          onChangeDraft={onChangeDraft}
          poolCount={poolCount}
          opener={opener}
          onApply={onApply}
          onDismiss={onDismiss}
        />
      )}
    </>
  );
}

function renderSheet(
  overrides: Partial<{
    draft: TodayFilterDraft;
    onChangeDraft: (next: TodayFilterDraft) => void;
    poolCount: number;
    onApply: () => void;
    onDismiss: () => void;
  }> = {},
) {
  const onChangeDraft = overrides.onChangeDraft ?? vi.fn();
  const onApply = overrides.onApply ?? vi.fn();
  const onDismiss = overrides.onDismiss ?? vi.fn();
  const utils = render(
    <Harness
      draft={overrides.draft}
      onChangeDraft={onChangeDraft}
      poolCount={overrides.poolCount}
      onApply={onApply}
      onDismiss={onDismiss}
    />,
  );
  return { ...utils, onChangeDraft, onApply, onDismiss };
}

describe("TodayFilterSheet", () => {
  it("renders as a labelled dialog holding all four groups (TIME/PAIN/LAST DONE/SOURCE), and no TYPE or DIFFICULTY group", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Filter" });
    expect(dialog).toBeInTheDocument();
    for (const label of ["TIME", "PAIN", "LAST DONE", "SOURCE"]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.queryByText("DIFFICULTY")).not.toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Shortest" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Longest" })).toBeInTheDocument();
    for (const level of ["1", "2", "3", "4", "5"]) {
      expect(screen.getByRole("button", { name: level })).toBeInTheDocument();
    }
    // Round 2 (2026-08-04): the Library's own LAST DONE/SOURCE pair.
    for (const label of ["<21D", "21D+", "ERGOMATIC LIBRARY", "MY WORKOUTS"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // No TYPE group — the type-swap chips stay on the plan line, untouched
    // by this sheet (the collapsible-filter spec's own "Type swap stays on
    // the plan line" decision).
    expect(screen.queryByText("TYPE")).not.toBeInTheDocument();
  });

  // Fix round 1 (whole-branch review M3): CellGrid (Task 1's extraction)
  // now carries `role="group"` + `aria-labelledby` pointing at its own
  // visible label — restores the accessible group name Today's pre-Task-2
  // hand-rolled chip groups had (fix round 2, M4).
  it("each group exposes an accessible name matching its own visible label", () => {
    renderSheet();
    for (const label of ["TIME", "PAIN", "LAST DONE", "SOURCE"]) {
      expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("group", { name: "DIFFICULTY" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "PAIN" })).getByRole("button", {
        name: "3",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "LAST DONE" })).getByRole(
        "button",
        { name: "<21D" },
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "SOURCE" })).getByRole(
        "button",
        { name: "MY WORKOUTS" },
      ),
    ).toBeInTheDocument();
  });

  it("aria-pressed on each cell reflects the draft prop, not internal state", () => {
    renderSheet({
      draft: {
        durationRange: { min: 30, max: 120 },
        painLevels: [2, 4],
        lastDone: "under21",
        source: "global",
      },
    });
    expect(screen.getByRole("slider", { name: "Shortest" })).toHaveAttribute(
      "aria-valuenow",
      "30",
    );
    expect(screen.getByRole("slider", { name: "Longest" })).toHaveAttribute(
      "aria-valuenow",
      "120",
    );
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "<21D" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "21D+" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "ERGOMATIC LIBRARY" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "MY WORKOUTS" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  describe("DIFFICULTY (multi-select)", () => {
    it("clicking an unselected cell adds it to the draft", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT },
      });
      await userEvent.click(screen.getByRole("button", { name: "3" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        painLevels: [3],
      });
    });

    it("clicking an already-selected cell removes it (deselecting every pain level is allowed)", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, painLevels: [2] },
      });
      await userEvent.click(screen.getByRole("button", { name: "2" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        painLevels: [],
      });
    });
  });

  // Amendment (2026-08-04 PR #50 round): TIME unifies on the Library's own
  // bucket UNION — the old cap single-select ("exactly one always active")
  // is gone; clicking a cell now toggles it independently, same union
  // semantics as DIFFICULTY/PAIN above.
  describe("TIME (a minutes range)", () => {
    it("stepping the upper thumb reports the new range in the draft, other groups untouched", () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, durationRange: { min: 0, max: 30 } },
      });
      fireEvent.keyDown(screen.getByRole("slider", { name: "Longest" }), {
        key: "End",
      });
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        durationRange: { min: 0, max: 120 },
      });
    });

    it("stepping the lower thumb reports the new range too, and the thumbs cannot cross", () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, durationRange: { min: 25, max: 30 } },
      });
      fireEvent.keyDown(screen.getByRole("slider", { name: "Shortest" }), {
        key: "PageUp",
      });
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        durationRange: { min: 30, max: 30 },
      });
    });
  });

  describe("PAIN (multi-select union)", () => {
    it("clicking an unselected level adds it, sorted", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, painLevels: [4] },
      });
      await userEvent.click(screen.getByRole("button", { name: "2" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        painLevels: [2, 4],
      });
    });

    it("clicking an already-selected level removes it", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, painLevels: [2, 4] },
      });
      await userEvent.click(screen.getByRole("button", { name: "2" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        painLevels: [4],
      });
    });
  });

  // Round 2 (2026-08-04): the Library's own half-width LAST DONE/SOURCE
  // pair — mutually-exclusive toggle-off semantics, same as the Library's
  // FilterSheet.tsx (setLastDone/setSource in src/library/filters.ts).
  describe("LAST DONE (mutually exclusive, toggle-off)", () => {
    it("clicking under21 sets it, replacing any previous value", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, lastDone: "over21" },
      });
      await userEvent.click(screen.getByRole("button", { name: "<21D" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        lastDone: "under21",
      });
    });

    it("clicking the already-active cell clears it (toggle-off)", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, lastDone: "under21" },
      });
      await userEvent.click(screen.getByRole("button", { name: "<21D" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        lastDone: null,
      });
    });

    it("clicking over21 sets it", async () => {
      const { onChangeDraft } = renderSheet();
      await userEvent.click(screen.getByRole("button", { name: "21D+" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        lastDone: "over21",
      });
    });
  });

  describe("SOURCE (mutually exclusive, toggle-off)", () => {
    it("clicking CUSTOM sets it, replacing any previous value", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, source: "global" },
      });
      await userEvent.click(
        screen.getByRole("button", { name: "MY WORKOUTS" }),
      );
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        source: "custom",
      });
    });

    it("clicking the already-active cell clears it (toggle-off)", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, source: "custom" },
      });
      await userEvent.click(
        screen.getByRole("button", { name: "MY WORKOUTS" }),
      );
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        source: null,
      });
    });

    it("clicking GLOBAL sets it", async () => {
      const { onChangeDraft } = renderSheet();
      await userEvent.click(
        screen.getByRole("button", { name: "ERGOMATIC LIBRARY" }),
      );
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        source: "global",
      });
    });
  });

  // Revision (mid-round, James): the button's copy dropped Show/Shuffle
  // entirely in favour of the constant "Apply Filter" — no count, no
  // singular/plural variant. The live count (and the disabled-at-0
  // explanation the button's old copy used to carry) moved to a small mono
  // caption directly above it.
  describe("primary button (Apply Filter) and the live count caption", () => {
    it("always reads 'Apply Filter', regardless of poolCount, and calls onApply", async () => {
      const { onApply } = renderSheet({ poolCount: 12 });
      const primary = screen.getByRole("button", { name: "Apply Filter" });
      expect(primary).not.toBeDisabled();
      await userEvent.click(primary);
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it("the caption reads 'N OPTIONS' for poolCount 12", () => {
      renderSheet({ poolCount: 12 });
      expect(screen.getByText("12 OPTIONS")).toBeVisible();
    });

    it("the caption is singular-aware: '1 OPTION' at poolCount 1, not '1 OPTIONS'", () => {
      renderSheet({ poolCount: 1 });
      expect(screen.getByText("1 OPTION")).toBeVisible();
      expect(screen.queryByText("1 OPTIONS")).not.toBeInTheDocument();
      // The button itself never varies with poolCount — same "Apply Filter"
      // whether the count is 1 or 12.
      expect(
        screen.getByRole("button", { name: "Apply Filter" }),
      ).not.toBeDisabled();
    });

    it("disables the button at poolCount 0, with the caption reading '0 OPTIONS'", () => {
      renderSheet({ poolCount: 0 });
      expect(
        screen.getByRole("button", { name: "Apply Filter" }),
      ).toBeDisabled();
      expect(screen.getByText("0 OPTIONS")).toBeVisible();
    });

    // Fix round (M1, 2026-08-04 whole-branch review): the count left the
    // button's own accessible NAME once it became the constant "Apply
    // Filter" — a disabled button isn't focusable, so without this a
    // screen-reader user landing on it (or announcing it via other means)
    // never learns WHY nothing is pressable at 0. `aria-describedby`
    // (never `aria-live`, which would announce every draft toggle) links
    // the caption in as the button's accessible DESCRIPTION instead.
    it("the button's accessible description is the live count caption, at any poolCount", () => {
      renderSheet({ poolCount: 7 });
      expect(
        screen.getByRole("button", { name: "Apply Filter" }),
      ).toHaveAccessibleDescription("7 OPTIONS");
    });

    it("the disabled button at poolCount 0 still carries the count as its accessible description — the one path left to learn why, since a disabled control never receives focus", () => {
      renderSheet({ poolCount: 0 });
      expect(
        screen.getByRole("button", { name: "Apply Filter" }),
      ).toHaveAccessibleDescription("0 OPTIONS");
    });
  });

  // The dialog machinery itself (backdrop/Escape/focus trap) is SheetShell's
  // own, tested exhaustively in SheetShell.test.tsx (Task 1) — these are
  // spot checks proving Today's own instance is wired to it correctly, per
  // the collapsible-filter spec's own testing note ("shared shell —
  // spot-assert on Today's instance").
  describe("shared shell wiring (spot checks)", () => {
    it("clicking the backdrop calls onDismiss", async () => {
      const { onDismiss } = renderSheet();
      await userEvent.click(screen.getByRole("dialog").parentElement!);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("Escape calls onDismiss", async () => {
      const { onDismiss } = renderSheet();
      await userEvent.keyboard("{Escape}");
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("moves focus into the sheet on open — the first control, the TIME rail's Shortest thumb (DIFFICULTY left in Phase DE PR 1)", () => {
      renderSheet();
      expect(screen.getByRole("slider", { name: "Shortest" })).toHaveFocus();
    });

    // The one genuinely different wiring vs. Library's FilterSheet.tsx:
    // `opener` is a caller-owned ref to Today's own FILTER ⌄ button, not
    // something SheetShell/this component captures from
    // `document.activeElement` itself.
    it("restores focus to the caller's own opener ref once the sheet closes", () => {
      const { rerender } = renderSheet();
      const filterButton = screen.getByRole("button", { name: "FILTER ⌄" });
      expect(filterButton).not.toHaveFocus();

      rerender(<Harness render={false} />);
      expect(filterButton).toHaveFocus();
    });
  });
});
