import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TokenRow } from "./TokenRow";

describe("TokenRow", () => {
  it("renders null with no tokens and no trailing content", () => {
    const { container } = render(<TokenRow tokens={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one pill per token with its own removable control", () => {
    render(
      <TokenRow
        tokens={[
          { key: "type", label: "AT", onClear: vi.fn() },
          { key: "pain", label: "PAIN 3", onClear: vi.fn() },
        ]}
      />,
    );
    expect(
      screen.getByText("AT", { selector: ".filter-token-label" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove AT filter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove PAIN 3 filter" }),
    ).toBeInTheDocument();
  });

  it("clicking a token's remove control calls that token's own onClear", async () => {
    const onClear = vi.fn();
    render(<TokenRow tokens={[{ key: "type", label: "AT", onClear }]} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove AT filter" }),
    );
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("leaves the background unset for the default 'ink' fill", () => {
    render(
      <TokenRow
        tokens={[{ key: "pain", label: "PAIN 3", onClear: vi.fn() }]}
      />,
    );
    const pill = screen.getByText("PAIN 3", {
      selector: ".filter-token-label",
    }).parentElement!;
    expect(pill).not.toHaveAttribute("style");
  });

  it("applies a non-'ink' fill as the pill's own inline background", () => {
    render(
      <TokenRow
        tokens={[
          {
            key: "type",
            label: "O2",
            onClear: vi.fn(),
            fill: "var(--type-o2)",
          },
        ]}
      />,
    );
    const pill = screen.getByText("O2", {
      selector: ".filter-token-label",
    }).parentElement!;
    expect(pill).toHaveAttribute("style", expect.stringContaining("--type-o2"));
  });

  it("renders trailing content after the tokens even when tokens is empty", () => {
    render(
      <TokenRow
        tokens={[]}
        trailing={<button type="button">CLEAR ALL</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "CLEAR ALL" }),
    ).toBeInTheDocument();
  });

  // Fix round 1 (whole-branch review M2): the row's own layout now lives
  // on TokenRow's own wrapper, not left to whatever the caller wraps it
  // in — Library.tsx happened to supply it (`.library-filter-row`), a
  // caller that renders `<TokenRow>` bare (Today.tsx) didn't, and the
  // result (caught live, not in jsdom) was tokens butting into one
  // continuous ink bar with `trailing` wrapping onto its own line.
  it("wraps its tokens and trailing content in its own row container, not a bare fragment", () => {
    const { container } = render(
      <TokenRow
        tokens={[{ key: "type", label: "AT", onClear: vi.fn() }]}
        trailing={<button type="button">CLEAR ALL</button>}
      />,
    );
    const row = container.querySelector<HTMLElement>(".token-row");
    expect(row).toBeInTheDocument();
    expect(
      within(row!).getByText("AT", { selector: ".filter-token-label" }),
    ).toBeInTheDocument();
    expect(
      within(row!).getByRole("button", { name: "CLEAR ALL" }),
    ).toBeInTheDocument();
  });
});
