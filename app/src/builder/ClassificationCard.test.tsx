import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Difficulty, WorkoutType } from "../../domain/types.js";
import ClassificationCard from "./ClassificationCard";

type Handlers = {
  type: WorkoutType;
  difficulty: Difficulty;
  pain: number | null;
  onTypeChange: (type: WorkoutType) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onPainChange: (pain: number) => void;
};

function setup(overrides: Partial<Handlers> = {}) {
  const props = {
    type: "O2" as WorkoutType,
    difficulty: "easy" as Difficulty,
    pain: null as number | null,
    onTypeChange: vi.fn<(type: WorkoutType) => void>(),
    onDifficultyChange: vi.fn<(difficulty: Difficulty) => void>(),
    onPainChange: vi.fn<(pain: number) => void>(),
    ...overrides,
  };
  const view = render(<ClassificationCard {...props} />);
  return { ...props, container: view.container };
}

describe("ClassificationCard", () => {
  it("renders all three groups inside a single card", () => {
    const { container } = setup();
    const card = container.querySelector(".classification-card");
    expect(card).not.toBeNull();
    expect(card).toContainElement(screen.getByText("TYPE"));
    expect(card).toContainElement(screen.getByText("DIFFICULTY"));
    expect(card).toContainElement(screen.getByText("EXPECTED PAIN"));
  });

  describe("TYPE", () => {
    it("fills the selected chip with that type's own colour and cream text, leaving the rest unstyled", () => {
      setup({ type: "AN" });
      const selected = screen.getByRole("button", { name: "AN" });
      expect(selected).toHaveAttribute(
        "style",
        expect.stringContaining("--type-an"),
      );
      expect(selected).toHaveAttribute(
        "style",
        expect.stringContaining("--on-color"),
      );
      expect(screen.getByRole("button", { name: "O2" })).not.toHaveAttribute(
        "style",
      );
    });

    it("reports the chosen type", async () => {
      const onTypeChange = vi.fn();
      setup({ onTypeChange });
      await userEvent.click(screen.getByRole("button", { name: "TR" }));
      expect(onTypeChange).toHaveBeenCalledWith("TR");
    });

    // James's 2026-08-08 ordering decision: every left-to-right type row
    // reads O2 · AT · TR · AN app-wide (the pyramid's base-first order), not
    // the AN-first order this card used before.
    it("renders the TYPE chips left-to-right as O2, AT, TR, AN", () => {
      const { container } = setup();
      const labels = Array.from(
        container.querySelectorAll(".classification-chip-type"),
      ).map((el) => el.textContent);
      expect(labels).toStrictEqual(["O2", "AT", "TR", "AN"]);
    });

    // TYPE always has a selection (unlike PAIN, which starts at null), so
    // the summary word is present from the very first render — there's no
    // "nothing selected yet" state to assert here, only that it tracks the
    // prop and updates when a different type is chosen (the parent owns
    // `type`; this component is controlled, so re-rendering with a new prop
    // is what a real chip click ultimately produces).
    it.each([
      ["AN", "SPEED WORK"],
      ["O2", "LOW & SLOW"],
      ["AT", "COMFORTABLY HARD"],
      ["TR", "HARD INTERVALS"],
    ] as const)("shows %s's summary word as %s", (type, word) => {
      setup({ type });
      expect(screen.getByText(word)).toBeInTheDocument();
    });

    it("updates the word when the type prop changes", () => {
      const props = {
        type: "O2" as WorkoutType,
        difficulty: "easy" as Difficulty,
        pain: null as number | null,
        onTypeChange: vi.fn(),
        onDifficultyChange: vi.fn(),
        onPainChange: vi.fn(),
      };
      const { rerender } = render(<ClassificationCard {...props} />);
      expect(screen.getByText("LOW & SLOW")).toBeInTheDocument();

      rerender(<ClassificationCard {...props} type="AN" />);
      expect(screen.queryByText("LOW & SLOW")).not.toBeInTheDocument();
      expect(screen.getByText("SPEED WORK")).toBeInTheDocument();
    });

    // The word is a plain, non-interactive <p> — same convention as PAIN's
    // level word (ClassificationCard.tsx's doc comment) — so it must not be
    // reachable by Tab and must not get pulled into any button's accessible
    // name via containment or aria-labelledby.
    it("the word is not focusable and is not any chip's accessible name", () => {
      setup({ type: "AT" });
      const word = screen.getByText("COMFORTABLY HARD");
      expect(word.tagName).toBe("P");
      expect(word).not.toHaveAttribute("tabindex");
      for (const label of ["O2", "AT", "TR", "AN"]) {
        expect(
          screen.getByRole("button", { name: label }),
        ).not.toHaveAccessibleName("COMFORTABLY HARD");
      }
    });
  });

  describe("DIFFICULTY", () => {
    it("fills the selected chip with ink, not accent — no inline style, no accent-named class", () => {
      setup({ difficulty: "hard" });
      const selected = screen.getByRole("button", { name: "HARD" });
      expect(selected).toHaveAttribute("aria-pressed", "true");
      expect(selected).not.toHaveAttribute("style");
      expect(selected.className).not.toMatch(/accent/i);
    });

    it("never puts the accent-named class on any DIFFICULTY chip, selected or not", () => {
      setup({ difficulty: "medium" });
      for (const label of ["EASY", "MEDIUM", "HARD"]) {
        expect(
          screen.getByRole("button", { name: label }).className,
        ).not.toMatch(/accent/i);
      }
    });

    it("reports the chosen difficulty", async () => {
      const onDifficultyChange = vi.fn();
      setup({ onDifficultyChange });
      await userEvent.click(screen.getByRole("button", { name: "MEDIUM" }));
      expect(onDifficultyChange).toHaveBeenCalledWith("medium");
    });
  });

  describe("EXPECTED PAIN", () => {
    it("renders numerals only — no face graphic markup", () => {
      const { container } = setup({ pain: 3 });
      expect(container.querySelector("svg")).toBeNull();
      for (const n of [1, 2, 3, 4, 5]) {
        expect(
          screen.getByRole("button", { name: `Pain ${n}` }),
        ).toHaveTextContent(String(n));
      }
    });

    it("shows the selected level's word from PAIN_WORDS on the right of the label row (pain 3 -> WORKING)", () => {
      setup({ pain: 3 });
      expect(screen.getByText("WORKING")).toBeInTheDocument();
    });

    it.each([
      [1, "EASY BREATH"],
      [2, "COMFORTABLE"],
      [3, "WORKING"],
      [4, "HURTS"],
      [5, "BRUTAL"],
    ])("shows %s's word as %s", (level, word) => {
      setup({ pain: level });
      expect(screen.getByText(word)).toBeInTheDocument();
    });

    it("shows no level word when nothing is selected yet", () => {
      setup({ pain: null });
      for (const word of [
        "EASY BREATH",
        "COMFORTABLE",
        "WORKING",
        "HURTS",
        "BRUTAL",
      ]) {
        expect(screen.queryByText(word)).not.toBeInTheDocument();
      }
    });

    // Task 1 (ui-fix round): PAIN's selected fill moved off its own
    // per-level ramp colour onto plain ink (DESIGN.md: "Builder's gold pain
    // selection goes") — same no-inline-style, ink-only-in-CSS treatment as
    // DIFFICULTY's own test just above.
    it("fills the selected chip with ink, not accent or a ramp colour — no inline style", () => {
      setup({ pain: 2 });
      const selected = screen.getByRole("button", { name: "Pain 2" });
      expect(selected).toHaveAttribute("aria-pressed", "true");
      expect(selected).not.toHaveAttribute("style");
      expect(selected.className).not.toMatch(/accent/i);
      expect(
        screen.getByRole("button", { name: "Pain 1" }),
      ).not.toHaveAttribute("style");
    });

    it("reports the chosen pain level", async () => {
      const onPainChange = vi.fn();
      setup({ onPainChange });
      await userEvent.click(screen.getByRole("button", { name: "Pain 4" }));
      expect(onPainChange).toHaveBeenCalledWith(4);
    });
  });

  it("gives every chip in every group the 44px hit-target class", () => {
    setup({ pain: 1 });
    const labels = ["O2", "AT", "TR", "AN", "EASY", "MEDIUM", "HARD"];
    for (const label of labels) {
      expect(screen.getByRole("button", { name: label })).toHaveClass(
        "classification-chip",
      );
    }
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("button", { name: `Pain ${n}` })).toHaveClass(
        "classification-chip",
      );
    }
  });
});
