import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import News, { ArticleRow } from "./News";
import type { ArticleReadsState } from "../api/useArticleReads";
import type { NewsArticle } from "./content/types";
import { RELEASE_NOTES } from "./content/releaseNotes";

// The registry is real (recurring-failure #3: an empty/synthetic fixture
// hid two shipped defects before) — every scenario below reads through the
// actual ARTICLES/RELEASE_NOTES content, not a hand-built minimum. Only
// useArticleReads is mocked, per scenario.
const mockUseArticleReads = vi.fn<() => ArticleReadsState>();
vi.mock("../api/useArticleReads", () => ({
  useArticleReads: () => mockUseArticleReads(),
}));

function renderNews() {
  return render(
    <MemoryRouter>
      <News />
    </MemoryRouter>,
  );
}

function readyState(readSlugs: string[]): ArticleReadsState {
  return {
    state: "ready",
    readSlugs: new Set(readSlugs),
    markRead: vi.fn(),
    markUnread: vi.fn(),
  };
}

describe("News", () => {
  it("ready with nothing read: both pins and both latest stories render, 4 UNREAD, every square unread", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    const { container } = renderNews();

    expect(
      screen.getByText("The four workout types, and how hard each should feel"),
    ).toBeVisible();
    expect(
      screen.getByText("What a baseline is, and why every pace comes from one"),
    ).toBeVisible();
    expect(
      screen.getByText("Picking a workout by how much it should hurt"),
    ).toBeVisible();
    expect(
      screen.getByText("The pain scale, without a heart rate monitor"),
    ).toBeVisible();

    expect(screen.getByText("4 UNREAD")).toBeVisible();

    const squares = container.querySelectorAll(".news-square");
    expect(squares).toHaveLength(4);
    for (const sq of squares) {
      expect(sq).toHaveAttribute("data-read", "false");
    }
  });

  it("baselines read: count drops to 3 UNREAD, only the baselines square/meta flip to read", () => {
    mockUseArticleReads.mockReturnValue(readyState(["baselines"]));
    const { container } = renderNews();

    expect(screen.getByText("3 UNREAD")).toBeVisible();

    const baselinesRow = screen
      .getByText("What a baseline is, and why every pace comes from one")
      .closest(".news-row");
    expect(baselinesRow).toHaveAttribute("data-read", "true");
    expect(baselinesRow!.querySelector(".news-square")).toHaveAttribute(
      "data-read",
      "true",
    );
    expect(baselinesRow!.textContent).toMatch(/ERGOMATIC · 3 MIN · READ/);

    const otherSquares = [...container.querySelectorAll(".news-square")].filter(
      (sq) => sq !== baselinesRow!.querySelector(".news-square"),
    );
    expect(otherSquares).toHaveLength(3);
    for (const sq of otherSquares) {
      expect(sq).toHaveAttribute("data-read", "false");
    }
  });

  it("everything read: no UNREAD count renders at all", () => {
    mockUseArticleReads.mockReturnValue(
      readyState([
        "workout-types",
        "baselines",
        "picking-a-workout",
        "pain-scale",
      ]),
    );
    renderNews();

    expect(screen.queryByText(/UNREAD/)).not.toBeInTheDocument();
  });

  it("error state: rows still render, but no squares and no count — never claims a wrong number", () => {
    mockUseArticleReads.mockReturnValue({ state: "error" });
    const { container } = renderNews();

    expect(
      screen.getByText("The four workout types, and how hard each should feel"),
    ).toBeVisible();
    expect(container.querySelectorAll(".news-square")).toHaveLength(0);
    expect(screen.queryByText(/UNREAD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/READ/)).not.toBeInTheDocument();
  });

  it("loading state: rows render with no squares and no count either", () => {
    mockUseArticleReads.mockReturnValue({ state: "loading" });
    const { container } = renderNews();

    expect(
      screen.getByText("The four workout types, and how hard each should feel"),
    ).toBeVisible();
    expect(container.querySelectorAll(".news-square")).toHaveLength(0);
    expect(screen.queryByText(/UNREAD/)).not.toBeInTheDocument();
  });

  it("the workout-types pinned row shows the four type chips in O2/AT/TR/AN order", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    const { container } = renderNews();

    const chips = container.querySelectorAll(".type-badge");
    expect([...chips].map((c) => c.textContent)).toStrictEqual([
      "O2",
      "AT",
      "TR",
      "AN",
    ]);
  });

  it("WHAT'S NEW shows the latest release's version, items, and the ALL RELEASE NOTES link", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    renderNews();

    const latest = RELEASE_NOTES[0]!;
    expect(screen.getByText(new RegExp(latest.version))).toBeVisible();
    for (const item of latest.items) {
      expect(screen.getByText(item)).toBeVisible();
    }
    const link = screen.getByRole("link", { name: "ALL RELEASE NOTES" });
    expect(link).toHaveAttribute("href", "/news/releases");
  });

  it("carries no level-1 button anywhere — News never starts a row", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    const { container } = renderNews();

    expect(container.querySelectorAll(".button-l1")).toHaveLength(0);
  });

  it("a first-party row links to its reader with the BackLink 'from' contract", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    renderNews();

    const link = screen.getByRole("link", {
      name: /The pain scale, without a heart rate monitor/,
    });
    expect(link).toHaveAttribute("href", "/news/pain-scale");
  });
});

describe("ArticleRow (linked kind — no linked article exists in the real registry yet, so this exercises the branch directly)", () => {
  const linkedArticle: NewsArticle = {
    slug: "external-piece",
    title: "Your 2k predicts less about your 10k than you think",
    minutes: 9,
    kind: "linked",
    pinned: false,
    publishedAt: "2026-08-01",
    linked: {
      url: "https://example.com/2k-10k",
      sourceName: "ROWING NEWS",
      commentary: "Worth it for the table halfway down.",
    },
  };

  it("renders an external row with ↗, italic commentary, and a browser-opens source line; clicking marks it read", () => {
    const markRead = vi.fn();
    const reads: ArticleReadsState = {
      state: "ready",
      readSlugs: new Set(),
      markRead,
      markUnread: vi.fn(),
    };
    render(
      <MemoryRouter>
        <ArticleRow article={linkedArticle} reads={reads} />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", {
      name: /Your 2k predicts less about your 10k than you think/,
    });
    expect(link).toHaveAttribute("href", linkedArticle.linked!.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(link.textContent).toContain("↗");
    expect(screen.getByText(linkedArticle.linked!.commentary)).toBeVisible();
    expect(link.textContent).toMatch(
      /ROWING NEWS · 9 MIN · OPENS YOUR BROWSER/,
    );

    link.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(markRead).toHaveBeenCalledWith("external-piece");
  });

  it("suppresses the square and READ suffix for a linked row too when reads is not ready, and clicking it never touches markRead (no such function exists on that state)", () => {
    const { container } = render(
      <MemoryRouter>
        <ArticleRow article={linkedArticle} reads={{ state: "error" }} />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll(".news-square")).toHaveLength(0);

    const link = screen.getByRole("link", {
      name: /Your 2k predicts less about your 10k than you think/,
    });
    // Would throw ("reads.markRead is not a function") if the onClick guard
    // ever called through on a non-ready state — the click completing
    // cleanly IS the assertion.
    expect(() =>
      link.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    ).not.toThrow();
  });
});
