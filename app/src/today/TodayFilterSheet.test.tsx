import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TodayFilterSheet, { type TodayFilterDraft } from "./TodayFilterSheet";

const EMPTY_DRAFT: TodayFilterDraft = {
  difficulties: [],
  durations: ["<30", "30-45", "45-60"],
  painLevels: [],
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
  it("renders as a labelled dialog holding DIFFICULTY/TIME/PAIN, and no TYPE group", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Filter" });
    expect(dialog).toBeInTheDocument();
    for (const label of ["DIFFICULTY", "TIME", "PAIN"]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    for (const label of ["EASY", "MEDIUM", "HARD"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    for (const label of ["<30′", "30–45′", "45–60′", "60′+"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    for (const level of ["1", "2", "3", "4", "5"]) {
      expect(screen.getByRole("button", { name: level })).toBeInTheDocument();
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
    for (const label of ["DIFFICULTY", "TIME", "PAIN"]) {
      expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
    }
    expect(
      within(screen.getByRole("group", { name: "DIFFICULTY" })).getByRole(
        "button",
        { name: "EASY" },
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "PAIN" })).getByRole("button", {
        name: "3",
      }),
    ).toBeInTheDocument();
  });

  it("aria-pressed on each cell reflects the draft prop, not internal state", () => {
    renderSheet({
      draft: {
        difficulties: ["easy", "hard"],
        durations: ["30-45", "60+"],
        painLevels: [2, 4],
      },
    });
    expect(screen.getByRole("button", { name: "EASY" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "MEDIUM" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "HARD" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "30–45′" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "<30′" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "45–60′" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "60′+" })).toHaveAttribute(
      "aria-pressed",
      "true",
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
  });

  describe("DIFFICULTY (multi-select)", () => {
    it("clicking an unselected cell adds it to the draft", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, difficulties: ["easy"] },
      });
      await userEvent.click(screen.getByRole("button", { name: "MEDIUM" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        difficulties: ["easy", "medium"],
      });
    });

    it("clicking an already-selected cell removes it (deselecting every difficulty is allowed)", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, difficulties: ["easy"] },
      });
      await userEvent.click(screen.getByRole("button", { name: "EASY" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        difficulties: [],
      });
    });
  });

  // Amendment (2026-08-04 PR #50 round): TIME unifies on the Library's own
  // bucket UNION — the old cap single-select ("exactly one always active")
  // is gone; clicking a cell now toggles it independently, same union
  // semantics as DIFFICULTY/PAIN above.
  describe("TIME (multi-select union)", () => {
    it("clicking an unselected bucket adds it to the union", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, durations: ["<30"] },
      });
      await userEvent.click(screen.getByRole("button", { name: "60′+" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        durations: ["<30", "60+"],
      });
    });

    it("clicking an already-selected bucket removes it (deselecting every bucket is allowed — TIME off)", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, durations: ["<30"] },
      });
      await userEvent.click(screen.getByRole("button", { name: "<30′" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        durations: [],
      });
    });

    it("selecting every bucket leaves all four active — a real (if functionally inert) union", async () => {
      const { onChangeDraft } = renderSheet({
        draft: { ...EMPTY_DRAFT, durations: ["<30", "30-45", "45-60"] },
      });
      await userEvent.click(screen.getByRole("button", { name: "60′+" }));
      expect(onChangeDraft).toHaveBeenCalledWith({
        ...EMPTY_DRAFT,
        durations: ["<30", "30-45", "45-60", "60+"],
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

  describe("primary button (Show N options)", () => {
    it("reads 'Show N options' from poolCount and calls onApply", async () => {
      const { onApply } = renderSheet({ poolCount: 12 });
      const primary = screen.getByRole("button", { name: "Show 12 options" });
      expect(primary).not.toBeDisabled();
      await userEvent.click(primary);
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it("reads the singular 'Show 1 option' at poolCount 1, and is NOT disabled there (only 0 disables)", () => {
      renderSheet({ poolCount: 1 });
      const primary = screen.getByRole("button", { name: "Show 1 option" });
      expect(primary).toBeInTheDocument();
      expect(primary).not.toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "Show 1 options" }),
      ).not.toBeInTheDocument();
    });

    it("disables at poolCount 0", () => {
      renderSheet({ poolCount: 0 });
      expect(
        screen.getByRole("button", { name: "Show 0 options" }),
      ).toBeDisabled();
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

    it("moves focus into the sheet on open — the first control, EASY", () => {
      renderSheet();
      expect(screen.getByRole("button", { name: "EASY" })).toHaveFocus();
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
