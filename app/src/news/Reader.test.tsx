import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Reader from "./Reader";
import type { ArticleReadsState } from "../api/useArticleReads";
import type { NewsArticle } from "./content/types";

// Real registry, real content (recurring-failure #3: an empty/synthetic
// fixture hid two shipped defects before) — every scenario below reads
// through the actual ARTICLES data, not a hand-built minimum. Only
// useArticleReads is mocked, per scenario, same pattern as News.test.tsx.
const mockUseArticleReads = vi.fn<() => ArticleReadsState>();
vi.mock("../api/useArticleReads", () => ({
  useArticleReads: () => mockUseArticleReads(),
}));

// The real registry currently has zero articles with `updatedAt` set (no
// article has been updated since launch yet) and zero linked-kind articles
// published, so neither the "· UPDATED ..." meta branch nor the
// linked-kind-slug redirect branch has a live example to render through.
// Same technique News.test.tsx's own linked-kind describe block uses for
// the same reason ("no linked article exists in the real registry yet, so
// this exercises the branch directly"): keep the real registry for every
// other field and slug, and layer in `updatedAt` for "baselines" and a
// synthetic linked-kind fixture at "external-piece" (same slug/shape
// News.test.tsx's own linked fixture uses).
const LINKED_FIXTURE: NewsArticle = {
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

vi.mock("./content/articles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./content/articles")>();
  return {
    ...actual,
    articleBySlug: (slug: string) => {
      if (slug === LINKED_FIXTURE.slug) return LINKED_FIXTURE;
      const article = actual.articleBySlug(slug);
      return article && slug === "baselines"
        ? { ...article, updatedAt: "2026-07-01" }
        : article;
    },
  };
});

function readyState(readSlugs: string[]): ArticleReadsState {
  return {
    state: "ready",
    readSlugs: new Set(readSlugs),
    markRead: vi.fn(),
  };
}

function renderReader(initialPath = "/news/baselines") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/news/:slug" element={<Reader />} />
        <Route path="/news" element={<p>News Screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Reader", () => {
  it("renders the title, the ERGOMATIC · N MIN meta, and a distinctive sentence from the article body", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    renderReader("/news/baselines");

    expect(
      screen.getByRole("heading", {
        name: "What a baseline is, and why every pace comes from one",
      }),
    ).toBeVisible();
    expect(screen.getByText(/ERGOMATIC · 3 MIN/)).toBeVisible();
    expect(
      screen.getByText(
        /A baseline is nothing more than the average split \(your time per 500 m\) you can hold for the/,
      ),
    ).toBeVisible();
  });

  it("marks the article read once reads is ready, but not while it is still loading", () => {
    const markRead = vi.fn();
    mockUseArticleReads.mockReturnValue({ state: "loading" });
    const { rerender } = render(
      <MemoryRouter initialEntries={["/news/baselines"]}>
        <Routes>
          <Route path="/news/:slug" element={<Reader />} />
          <Route path="/news" element={<p>News Screen</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(markRead).not.toHaveBeenCalled();

    mockUseArticleReads.mockReturnValue({
      state: "ready",
      readSlugs: new Set(),
      markRead,
    });
    rerender(
      <MemoryRouter initialEntries={["/news/baselines"]}>
        <Routes>
          <Route path="/news/:slug" element={<Reader />} />
          <Route path="/news" element={<p>News Screen</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(markRead).toHaveBeenCalledWith("baselines");
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("redirects to /news for a slug that doesn't exist in the registry", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    renderReader("/news/no-such-article");

    expect(screen.getByText("News Screen")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /baseline/i }),
    ).not.toBeInTheDocument();
  });

  it("NEXT footer names the next unread article in registry order", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    renderReader("/news/baselines");

    const next = screen.getByRole("link", {
      name: /NEXT · 2 MIN — Picking a workout by how much it should hurt/,
    });
    expect(next).toHaveAttribute("href", "/news/picking-a-workout");
  });

  it("renders no NEXT footer once every other article is already read", () => {
    mockUseArticleReads.mockReturnValue(
      readyState(["workout-types", "picking-a-workout", "pain-scale"]),
    );
    renderReader("/news/baselines");

    expect(
      screen.queryByRole("link", { name: /NEXT/ }),
    ).not.toBeInTheDocument();
  });

  it("on a reads error the article still renders fully, with no NEXT footer and no markRead call", () => {
    mockUseArticleReads.mockReturnValue({ state: "error" });
    renderReader("/news/baselines");

    expect(
      screen.getByRole("heading", {
        name: "What a baseline is, and why every pace comes from one",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /A baseline is nothing more than the average split \(your time per 500 m\) you can hold for the/,
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /NEXT/ }),
    ).not.toBeInTheDocument();
  });

  it("carries a BACK link falling back to /news", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    renderReader("/news/baselines");

    expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/news",
    );
  });

  it("appends the UPDATED label when the article carries an updatedAt", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    renderReader("/news/baselines");

    expect(
      screen.getByText("ERGOMATIC · 3 MIN · UPDATED JUL 2026"),
    ).toBeVisible();
  });

  it("redirects to /news for a linked-kind slug, and never calls markRead for it (review finding: the mark-read effect must not fire before the redirect)", () => {
    const markRead = vi.fn();
    mockUseArticleReads.mockReturnValue({
      state: "ready",
      readSlugs: new Set(),
      markRead,
    });
    renderReader(`/news/${LINKED_FIXTURE.slug}`);

    expect(screen.getByText("News Screen")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: LINKED_FIXTURE.title }),
    ).not.toBeInTheDocument();
    expect(markRead).not.toHaveBeenCalled();
  });

  it("scrolls the window to the top on mount, and again when the NEXT footer navigates to a different slug (item 1: the reader used to open mid-page against the feed's own scroll position)", async () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    const user = userEvent.setup();

    renderReader("/news/workout-types");
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    scrollToSpy.mockClear();

    await user.click(screen.getByRole("link", { name: /NEXT/ }));
    expect(
      await screen.findByRole("heading", {
        name: "What a baseline is, and why every pace comes from one",
      }),
    ).toBeVisible();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);

    scrollToSpy.mockRestore();
  });

  it("redirects to /news when rendered with no slug param at all", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    render(
      <MemoryRouter initialEntries={["/reader-no-slug"]}>
        <Routes>
          <Route path="/reader-no-slug" element={<Reader />} />
          <Route path="/news" element={<p>News Screen</p>} />
        </Routes>
      </MemoryRouter>,
    );

    // Reader has no `:slug` to read here (a defensive guard against a
    // future route misconfiguration, not a path a real Route ever takes —
    // AppRoutes.tsx always mounts Reader at `/news/:slug`) — it must
    // redirect exactly like an unknown slug does, never crash on
    // `article.minutes` etc. against `undefined`.
    expect(screen.getByText("News Screen")).toBeVisible();
  });
});
