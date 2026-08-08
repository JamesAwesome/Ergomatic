import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SheetShell } from "./SheetShell";

/** A minimal composed sheet: one visible-labelled title (the `titleId`
 *  target) plus a single extra button, so the focus-trap tests below have
 *  more than one focusable control to wrap between. */
function renderShell(
  overrides: Partial<{
    open: boolean;
    onDismiss: () => void;
    primary: { label: string; disabled: boolean; onPress: () => void };
  }> = {},
) {
  const onDismiss = overrides.onDismiss ?? vi.fn();
  const onPress = vi.fn();
  const opener = createRef<HTMLElement | null>();
  const utils = render(
    <SheetShell
      open={overrides.open ?? true}
      titleId="test-sheet-title"
      onDismiss={onDismiss}
      opener={opener}
      primary={
        overrides.primary ?? { label: "Apply", disabled: false, onPress }
      }
    >
      <h2 id="test-sheet-title">Test sheet</h2>
      <button type="button">Middle</button>
    </SheetShell>,
  );
  return { ...utils, onDismiss, onPress, opener };
}

describe("SheetShell", () => {
  it("renders null when closed", () => {
    renderShell({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders a labelled dialog naming the titleId target", () => {
    renderShell();
    expect(
      screen.getByRole("dialog", { name: "Test sheet" }),
    ).toBeInTheDocument();
  });

  it("renders the primary control from the primary prop, disabled state included", () => {
    const onPress = vi.fn();
    renderShell({ primary: { label: "Show 3", disabled: true, onPress } });
    const primary = screen.getByRole("button", { name: "Show 3" });
    expect(primary).toBeDisabled();
  });

  it("clicking the primary calls its own onPress", async () => {
    const onPress = vi.fn();
    renderShell({ primary: { label: "Go", disabled: false, onPress } });
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop calls onDismiss", async () => {
    const { onDismiss } = renderShell();
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clicking inside the panel does not call onDismiss", async () => {
    const { onDismiss } = renderShell();
    await userEvent.click(screen.getByText("Test sheet"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("Escape calls onDismiss", async () => {
    const { onDismiss } = renderShell();
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the first focusable control on open", () => {
    renderShell();
    expect(screen.getByRole("button", { name: "Middle" })).toHaveFocus();
  });

  it("restores focus to the opener ref once it closes", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const opener = createRef<HTMLElement | null>();
    opener.current = trigger;
    const { unmount } = render(
      <SheetShell
        open
        titleId="t"
        onDismiss={vi.fn()}
        opener={opener}
        primary={{ label: "Go", disabled: false, onPress: vi.fn() }}
      >
        <h2 id="t">T</h2>
      </SheetShell>,
    );
    expect(trigger).not.toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last", async () => {
    renderShell();
    const middle = screen.getByRole("button", { name: "Middle" });
    const primary = screen.getByRole("button", { name: "Apply" });
    expect(middle).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(primary).toHaveFocus();

    await userEvent.tab();
    expect(middle).toHaveFocus();
  });
  // --- The optional primary (Phase 7B Task 7) ---------------------------

  describe("without a primary", () => {
    /** The connected-mode diagnostics sheet's shape: a level-3 commit and a
     *  level-2 dismiss, and NO level 1 — the house allows one L1 per screen
     *  and this sheet's actions are neither. */
    function renderPrimaryless() {
      const opener = createRef<HTMLElement | null>();
      return render(
        <SheetShell
          open
          titleId="test-sheet-title"
          onDismiss={vi.fn()}
          opener={opener}
        >
          <h2 id="test-sheet-title">Test sheet</h2>
          <button type="button" className="button-l3">
            Act
          </button>
          <button type="button" className="button-l2">
            Close
          </button>
        </SheetShell>,
      );
    }

    it("renders no level-1 button of its own", () => {
      renderPrimaryless();
      expect(screen.getByRole("dialog").querySelector(".button-l1")).toBeNull();
      expect(
        screen.getAllByRole("button").map((b) => b.textContent),
      ).toStrictEqual(["Act", "Close"]);
    });

    it("EVERY caller ships an action — the shell no longer guarantees one", () => {
      // The pin the task-7 review asked for (adjudication 2). Making
      // `primary` optional means a future sheet can render a title and no
      // buttons at all: dismissible by backdrop and Escape, but with no
      // visible way out and nothing to say so.
      //
      // A SOURCE SWEEP, via Vite's own `?raw` glob rather than a directory
      // walk — the client tsconfig deliberately carries no `@types/node`
      // (`src/session/node-fs-raw.d.ts` explains why), and this needs no
      // new ambient type at all.
      const sources = import.meta.glob("../**/*.tsx", {
        eager: true,
        query: "?raw",
        import: "default",
      }) as Record<string, string>;

      // COMMENTS STRIPPED FIRST, for the same reason `PaneGrid.test.tsx`
      // strips `index.css` (task-7 review, M1): this file's own prose says
      // `button-l3` twice, and a sweep that reads prose is a sweep that
      // passes for a sheet whose buttons were deleted. Caught by mutating
      // exactly that.
      const code = (text: string): string =>
        text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

      const callers = Object.entries(sources)
        .filter(([file]) => !file.includes(".test."))
        .map(([file, text]) => [file, code(text)] as const)
        .filter(([, text]) => text.includes("<SheetShell"));

      // Three today: Library's FilterSheet, Today's FilterSheet, and the
      // connected-mode ConnectionLogSheet. A fourth is exactly the thing
      // this assertion exists to look at.
      expect(callers.length).toBeGreaterThanOrEqual(3);
      const actionless = callers
        .filter(
          ([, text]) => !/primary=\{/.test(text) && !/button-l[23]/.test(text),
        )
        .map(([file]) => file);
      expect(actionless).toStrictEqual([]);
    });

    it("still traps focus, across the CALLER's own buttons", async () => {
      renderPrimaryless();
      const act = screen.getByRole("button", { name: "Act" });
      const close = screen.getByRole("button", { name: "Close" });
      expect(act).toHaveFocus();

      await userEvent.tab({ shift: true });
      expect(close).toHaveFocus();

      await userEvent.tab();
      expect(act).toHaveFocus();
    });
  });
});
