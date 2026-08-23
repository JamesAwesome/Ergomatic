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
});
