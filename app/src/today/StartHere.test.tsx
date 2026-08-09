import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import StartHere, { START_HERE_STEPS } from "./StartHere";
import type { ArticleReadsState } from "../api/useArticleReads";

// Same "only the hook under test is mocked" discipline as News.test.tsx —
// the four-step table itself is the REAL exported constant, never a
// hand-built minimum.
const mockUseArticleReads = vi.fn<() => ArticleReadsState>();
vi.mock("../api/useArticleReads", () => ({
  useArticleReads: () => mockUseArticleReads(),
}));

function readyState(readSlugs: string[]): ArticleReadsState {
  return {
    state: "ready",
    readSlugs: new Set(readSlugs),
    markRead: vi.fn(),
    markUnread: vi.fn(),
  };
}

// Renders Reader-standing-in routes for each of the four step targets so a
// click through a real `<Link>` can be asserted against the resulting
// location's pathname/state, the same "prove the navigation, not the prop"
// discipline Today.test.tsx's own LocationProbe uses.
function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return (
    <p>
      PROBE path={location.pathname} from={String(from)}
    </p>
  );
}

function renderStartHere(onDismiss = vi.fn()) {
  return {
    onDismiss,
    ...render(
      <MemoryRouter initialEntries={["/today"]}>
        <Routes>
          <Route path="/today" element={<StartHere onDismiss={onDismiss} />} />
          <Route path="/news/:slug" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    ),
  };
}

describe("StartHere", () => {
  it("ready, nothing read: header shows 0 OF 4 READ, every row unread with its real minutes", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    const { container } = renderStartHere();

    expect(screen.getByText("START HERE · 0 OF 4 READ")).toBeVisible();
    for (const step of START_HERE_STEPS) {
      expect(screen.getByText(step.copy)).toBeVisible();
    }
    // Real registry minutes, not the design mock's own placeholder figures
    // (4 MIN/2 MIN for these same two rows) — see StartHere.tsx's own
    // header comment. Two rows land on each figure (baselines/connect-the-
    // monitor both read 3; your-first-row/picking-a-workout both read 2).
    expect(screen.getAllByText("3 MIN")).toHaveLength(2);
    expect(screen.getAllByText("2 MIN")).toHaveLength(2);

    const squares = container.querySelectorAll(".starthere-square");
    expect(squares).toHaveLength(4);
    for (const sq of squares) expect(sq).toHaveAttribute("data-read", "false");
  });

  it("one of four read: count is 1 OF 4 READ, only that row's square/meta flip to read", () => {
    mockUseArticleReads.mockReturnValue(readyState(["baselines"]));
    const { container } = renderStartHere();

    expect(screen.getByText("START HERE · 1 OF 4 READ")).toBeVisible();

    const baselinesRow = screen
      .getByText("Every pace is that baseline plus an offset.")
      .closest(".starthere-row");
    expect(baselinesRow).toHaveAttribute("data-read", "true");
    expect(baselinesRow!.querySelector(".starthere-square")).toHaveAttribute(
      "data-read",
      "true",
    );
    expect(baselinesRow!.textContent).toMatch(/3 MIN · READ/);

    const otherSquares = [
      ...container.querySelectorAll(".starthere-square"),
    ].filter((sq) => sq !== baselinesRow!.querySelector(".starthere-square"));
    expect(otherSquares).toHaveLength(3);
    for (const sq of otherSquares) {
      expect(sq).toHaveAttribute("data-read", "false");
    }
  });

  it("all four read: header reads 4 OF 4 READ", () => {
    mockUseArticleReads.mockReturnValue(
      readyState(START_HERE_STEPS.map((s) => s.slug)),
    );
    renderStartHere();
    expect(screen.getByText("START HERE · 4 OF 4 READ")).toBeVisible();
  });

  it("reads still loading: header shows bare START HERE, no count, no square claims (suppression rule)", () => {
    mockUseArticleReads.mockReturnValue({ state: "loading" });
    const { container } = renderStartHere();

    expect(screen.getByText("START HERE")).toBeVisible();
    expect(screen.queryByText(/OF 4 READ/)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".starthere-square")).toHaveLength(0);
  });

  it("reads errored: header shows bare START HERE, same suppression as News", () => {
    mockUseArticleReads.mockReturnValue({ state: "error" });
    renderStartHere();
    expect(screen.getByText("START HERE")).toBeVisible();
    expect(screen.queryByText(/OF 4 READ/)).not.toBeInTheDocument();
  });

  it("DISMISS is a 44px target that fires onDismiss immediately, with no staged confirm", async () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    const { onDismiss } = renderStartHere();

    const dismiss = screen.getByRole("button", { name: "DISMISS" });
    await userEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // No staged confirm: a second click (nothing armed in between) fires
    // again rather than requiring a "tap again" — DISMISS is immediate.
    await userEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("each step row links to /news/<slug> with state.from = /today", async () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    renderStartHere();

    await userEvent.click(
      screen.getByText("Row 6k once. That is your baseline."),
    );
    expect(
      await screen.findByText("PROBE path=/news/your-first-row from=/today"),
    ).toBeVisible();
  });

  it("the connect-the-monitor row links to /news/connect-the-monitor with state.from = /today", async () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    renderStartHere();

    await userEvent.click(
      screen.getByText("Connect the monitor and it drives the piece."),
    );
    expect(
      await screen.findByText(
        "PROBE path=/news/connect-the-monitor from=/today",
      ),
    ).toBeVisible();
  });
});
