import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import DoorsCard from "./DoorsCard";

// Phase BL PR C — the three-door card (canvas Main). Three Links, and
// (Phase RW PR C) one button beneath them: the skip line, the card's only
// write. Each door's own flow screen is tested separately
// (Recommend/KnowBaseline/RowToFind).

function renderCard(onSkip: () => void = () => {}) {
  return render(
    <MemoryRouter>
      <DoorsCard onSkip={onSkip} />
    </MemoryRouter>,
  );
}

describe("DoorsCard", () => {
  it("renders the canvas heading, eyebrow and body copy", () => {
    renderCard();
    expect(screen.getByText("SET UP YOUR BASELINE")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How do you want to start?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Every workout's targets come from your 2k and 6k/),
    ).toBeInTheDocument();
  });

  it("renders three doors, outcome-framed, each linking to its own flow", () => {
    renderCard();
    const recommend = screen.getByRole("link", {
      name: /Recommend my baseline/,
    });
    const know = screen.getByRole("link", { name: /I know my baseline/ });
    const row = screen.getByRole("link", { name: /Row to find my baseline/ });
    expect(recommend).toHaveAttribute("href", "/onboarding/recommend");
    expect(know).toHaveAttribute("href", "/onboarding/know");
    expect(row).toHaveAttribute("href", "/onboarding/row");
  });

  it("door 3's sub-copy carries the strong-and-steady framing (James's ruling, 2026-08-23), not the retired 'relaxed'", () => {
    renderCard();
    expect(
      screen.getByText("A strong, steady 6k, or race a 2k. Your time sets it."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/relaxed/i)).not.toBeInTheDocument();
  });
});

describe("the skip line (Phase RW PR C)", () => {
  it("offers Row without one for now beneath the three doors, as a button", async () => {
    const onSkip = vi.fn();
    renderCard(onSkip);

    const skip = screen.getByRole("button", {
      name: "Row without one for now",
    });
    // Three doors, and the skip is NOT one of them: it writes, they navigate.
    expect(screen.getAllByRole("link")).toHaveLength(3);

    await userEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
