import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import OptionGroup from "./OptionGroup";

// Phase BL PR C — the questionnaire's single-select control. Roving-
// tabindex radiogroup, PaceRefInput's pattern; these keyboard tests are
// copied from PaceRefInput.test.tsx's own "roving tabIndex" / arrow-key
// suites (recurring-failure #8: every hand-rolled radiogroup here shipped
// untested and needed a follow-up — this one starts WITH the tests).

const OPTIONS = [
  { value: "never", label: "Never, or once or twice" },
  { value: "a-little", label: "A little. I know the stroke" },
  { value: "regularly", label: "Regularly, on and off" },
  { value: "a-lot", label: "A lot. I have raced or trained" },
] as const;

function renderGroup(
  value: (typeof OPTIONS)[number]["value"] | null = null,
  onChange = vi.fn(),
) {
  render(
    <OptionGroup
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="How much have you rowed?"
    />,
  );
  return onChange;
}

describe("OptionGroup", () => {
  it("renders one radiogroup with all four options as radios, none checked initially", () => {
    renderGroup();
    const group = screen.getByRole("radiogroup", {
      name: "How much have you rowed?",
    });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    for (const radio of radios) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
  });

  it("checks exactly the selected option", () => {
    renderGroup("regularly");
    expect(
      screen.getByRole("radio", { name: "Regularly, on and off" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: "Never, or once or twice" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("reports a click on an option", async () => {
    const onChange = renderGroup();
    await userEvent.click(
      screen.getByRole("radio", { name: "A little. I know the stroke" }),
    );
    expect(onChange).toHaveBeenCalledExactlyOnceWith("a-little");
  });

  describe("roving tabIndex", () => {
    it("with nothing selected, the FIRST option is the single tab stop", () => {
      renderGroup(null);
      const radios = screen.getAllByRole("radio");
      expect(radios[0]).toHaveAttribute("tabIndex", "0");
      expect(radios[1]).toHaveAttribute("tabIndex", "-1");
      expect(radios[2]).toHaveAttribute("tabIndex", "-1");
      expect(radios[3]).toHaveAttribute("tabIndex", "-1");
    });

    it("the selected option is the single tab stop", () => {
      renderGroup("a-lot");
      const radios = screen.getAllByRole("radio");
      expect(radios[3]).toHaveAttribute("tabIndex", "0");
      expect(radios[0]).toHaveAttribute("tabIndex", "-1");
      expect(radios[1]).toHaveAttribute("tabIndex", "-1");
      expect(radios[2]).toHaveAttribute("tabIndex", "-1");
    });
  });

  describe("arrow-key navigation (moves focus AND selection, wrapping)", () => {
    it("ArrowRight moves from the 1st to the 2nd option, focuses it, and reports the change", async () => {
      const onChange = renderGroup("never");
      screen.getByRole("radio", { name: "Never, or once or twice" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledExactlyOnceWith("a-little");
      expect(
        screen.getByRole("radio", { name: "A little. I know the stroke" }),
      ).toHaveFocus();
    });

    it("ArrowDown also moves forward", async () => {
      const onChange = renderGroup("a-little");
      screen
        .getByRole("radio", { name: "A little. I know the stroke" })
        .focus();
      await userEvent.keyboard("{ArrowDown}");
      expect(onChange).toHaveBeenCalledExactlyOnceWith("regularly");
    });

    it("ArrowLeft moves backward", async () => {
      const onChange = renderGroup("regularly");
      screen.getByRole("radio", { name: "Regularly, on and off" }).focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledExactlyOnceWith("a-little");
    });

    it("ArrowUp also moves backward", async () => {
      const onChange = renderGroup("a-little");
      screen
        .getByRole("radio", { name: "A little. I know the stroke" })
        .focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(onChange).toHaveBeenCalledExactlyOnceWith("never");
    });

    it("wraps forward from the last option to the first", async () => {
      const onChange = renderGroup("a-lot");
      screen
        .getByRole("radio", { name: "A lot. I have raced or trained" })
        .focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledExactlyOnceWith("never");
    });

    it("wraps backward from the first option to the last", async () => {
      const onChange = renderGroup("never");
      screen.getByRole("radio", { name: "Never, or once or twice" }).focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledExactlyOnceWith("a-lot");
    });
  });

  it("is reachable by keyboard and selects the focused option on Enter", async () => {
    const onChange = renderGroup(null);
    await userEvent.tab();
    expect(
      screen.getByRole("radio", { name: "Never, or once or twice" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("never");
  });

  // James's auto-advance feedback (2026-08-23): picking an option should
  // carry the rower forward. The seam is a separate CONFIRM callback so
  // the roving-tabindex contract above survives untouched — arrows move
  // selection, and only a deliberate activation (tap/click, Enter, Space)
  // confirms. Wiring advance into onChange instead would make arrowing
  // yank a keyboard user through the questionnaire; the arrow test below
  // is the one that goes red if anyone does.
  describe("confirm (the auto-advance seam)", () => {
    function renderWithConfirm(
      value: (typeof OPTIONS)[number]["value"] | null = null,
    ) {
      const onChange = vi.fn();
      const onConfirm = vi.fn();
      render(
        <OptionGroup
          options={OPTIONS}
          value={value}
          onChange={onChange}
          onConfirm={onConfirm}
          ariaLabel="How much have you rowed?"
        />,
      );
      return { onChange, onConfirm };
    }

    it("a pointer click selects AND confirms the option, selection first", async () => {
      const order: string[] = [];
      const onChange = vi.fn(() => order.push("change"));
      const onConfirm = vi.fn(() => order.push("confirm"));
      render(
        <OptionGroup
          options={OPTIONS}
          value={null}
          onChange={onChange}
          onConfirm={onConfirm}
          ariaLabel="How much have you rowed?"
        />,
      );
      await userEvent.click(
        screen.getByRole("radio", { name: "A little. I know the stroke" }),
      );
      expect(onChange).toHaveBeenCalledExactlyOnceWith("a-little");
      expect(onConfirm).toHaveBeenCalledExactlyOnceWith("a-little");
      expect(order).toStrictEqual(["change", "confirm"]);
    });

    it("clicking the already-selected option confirms it again (the re-entry tap)", async () => {
      const { onConfirm } = renderWithConfirm("a-little");
      await userEvent.click(
        screen.getByRole("radio", { name: "A little. I know the stroke" }),
      );
      expect(onConfirm).toHaveBeenCalledExactlyOnceWith("a-little");
    });

    it("LOAD-BEARING: arrow keys move selection WITHOUT confirming — arrowing must never advance", async () => {
      const { onChange, onConfirm } = renderWithConfirm("never");
      screen.getByRole("radio", { name: "Never, or once or twice" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      await userEvent.keyboard("{ArrowDown}");
      await userEvent.keyboard("{ArrowLeft}");
      await userEvent.keyboard("{ArrowUp}");
      expect(onChange).toHaveBeenCalledTimes(4);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("Enter on the focused option confirms it", async () => {
      const { onConfirm } = renderWithConfirm("a-little");
      screen
        .getByRole("radio", { name: "A little. I know the stroke" })
        .focus();
      await userEvent.keyboard("{Enter}");
      expect(onConfirm).toHaveBeenCalledExactlyOnceWith("a-little");
    });

    it("Space on the focused option confirms it", async () => {
      const { onConfirm } = renderWithConfirm("regularly");
      screen.getByRole("radio", { name: "Regularly, on and off" }).focus();
      await userEvent.keyboard(" ");
      expect(onConfirm).toHaveBeenCalledExactlyOnceWith("regularly");
    });

    it("without an onConfirm the control still selects on click (the prop is optional)", async () => {
      const onChange = renderGroup();
      await userEvent.click(
        screen.getByRole("radio", { name: "Regularly, on and off" }),
      );
      expect(onChange).toHaveBeenCalledExactlyOnceWith("regularly");
    });
  });
});

// Phase JC Task 5 — the control is generalised so a second caller (the
// judge-colour settings screen) can reuse the keyboard contract above
// with its own stylesheet and a swatch beside each word. Three additive
// props: `label` widens to ReactNode, plus `className`/`optionClassName`.
//
// THE GATE THAT DID NOT EXIST. `grep -rn "onb-option" src e2e` returns
// five lines — two emitters here, three rules in index.css, and ZERO
// tests. Every suite that renders this control (only `Recommend.test.tsx`
// does; KnowBaseline and RowToFind never mount it) reaches it through
// `role="radiogroup"` / `role="radio"`, so nothing in the repo could go
// red if the class defaults moved. These first two tests are what makes
// "every onboarding render stays byte-identical" a claim with a probe
// behind it.
//
// The fixture is Task 6's real shape (recurring failure 3): three colour
// slots, each label a swatch element plus its word, under non-default
// class names — never a hand-built minimum that happens to be a string.

type JudgeColor = "red" | "blue" | "off";

const COLOR_OPTIONS: readonly { value: JudgeColor; label: ReactNode }[] = [
  {
    value: "red",
    label: (
      <>
        <span className="judge-swatch" data-color="red" aria-hidden="true" />
        RED
      </>
    ),
  },
  {
    value: "blue",
    label: (
      <>
        <span className="judge-swatch" data-color="blue" aria-hidden="true" />
        BLUE
      </>
    ),
  },
  {
    value: "off",
    label: (
      <>
        <span className="judge-swatch" data-color="off" aria-hidden="true" />
        OFF
      </>
    ),
  },
];

function renderColors(
  value: JudgeColor = "red",
  onChange = vi.fn(),
): ReturnType<typeof vi.fn> {
  render(
    <OptionGroup
      options={COLOR_OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Pace faster"
      className="judge-options"
      optionClassName="judge-option"
    />,
  );
  return onChange;
}

describe("OptionGroup styling hooks", () => {
  it("defaults the group to onb-options and every option to onb-option", () => {
    renderGroup();
    expect(
      screen.getByRole("radiogroup", { name: "How much have you rowed?" }),
    ).toHaveClass("onb-options");
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    for (const radio of radios) {
      expect(radio).toHaveClass("onb-option");
    }
  });

  it("supplied class names REPLACE the onboarding defaults on both levels", () => {
    renderColors();
    const group = screen.getByRole("radiogroup", { name: "Pace faster" });
    expect(group).toHaveClass("judge-options");
    expect(group).not.toHaveClass("onb-options");
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toHaveClass("judge-option");
      expect(radio).not.toHaveClass("onb-option");
    }
  });

  it("renders a ReactNode label's own elements, and the option is still named by its words", () => {
    renderColors();
    const blue = screen.getByRole("radio", { name: "BLUE" });
    const swatch = blue.querySelector(".judge-swatch");
    expect(swatch).toBeInTheDocument();
    expect(swatch).toHaveAttribute("data-color", "blue");
    // The swatch is decoration; the word carries the meaning (WCAG 1.4.1),
    // so it must not leak into the accessible name.
    expect(swatch).toHaveAttribute("aria-hidden", "true");
  });
});

// The assertion Task 6 actually relies on: the keyboard contract is a
// property of the control, not of the stylesheet it happens to wear.
// These are the roving-tabindex/arrow suites above, re-run against a
// group whose classes are BOTH non-default.
describe("OptionGroup keyboard contract under non-default class names", () => {
  it("the selected option is the single tab stop", () => {
    renderColors("blue");
    const radios = screen.getAllByRole("radio");
    expect(radios[1]).toHaveAttribute("tabIndex", "0");
    expect(radios[0]).toHaveAttribute("tabIndex", "-1");
    expect(radios[2]).toHaveAttribute("tabIndex", "-1");
  });

  it("ArrowRight moves focus and selection together", async () => {
    const onChange = renderColors("red");
    screen.getByRole("radio", { name: "RED" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("blue");
    expect(screen.getByRole("radio", { name: "BLUE" })).toHaveFocus();
  });

  it("ArrowUp moves backward", async () => {
    const onChange = renderColors("off");
    screen.getByRole("radio", { name: "OFF" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("blue");
    expect(screen.getByRole("radio", { name: "BLUE" })).toHaveFocus();
  });

  it("wraps forward from the last option to the first", async () => {
    const onChange = renderColors("off");
    screen.getByRole("radio", { name: "OFF" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("red");
    expect(screen.getByRole("radio", { name: "RED" })).toHaveFocus();
  });

  it("wraps backward from the first option to the last", async () => {
    const onChange = renderColors("red");
    screen.getByRole("radio", { name: "RED" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("off");
    expect(screen.getByRole("radio", { name: "OFF" })).toHaveFocus();
  });

  it("a click still selects and confirms", async () => {
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <OptionGroup
        options={COLOR_OPTIONS}
        value="red"
        onChange={onChange}
        onConfirm={onConfirm}
        ariaLabel="Pace faster"
        className="judge-options"
        optionClassName="judge-option"
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "OFF" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("off");
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("off");
  });
});
