import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  Routes,
  RouterProvider,
} from "react-router-dom";
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
// Registry order (content/articles.tsx): workout-types, baselines,
// picking-a-workout, pain-scale, your-first-row, connect-the-monitor — the
// same real order the multi-hop NEXT chain tests below walk.
const WORKOUT_TYPES_TITLE =
  "The four workout types, and how hard each should feel";
const BASELINES_TITLE = "What a baseline is, and why every pace comes from one";
const PICKING_A_WORKOUT_TITLE = "Picking a workout by how much it should hurt";

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
    markUnread: vi.fn(),
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

// ui-notes round, item 1: a `history` entry array literal is the only way
// to render Reader WITH incoming `location.state` (MemoryRouter's own
// `initialEntries` accepts `{pathname, state}` objects, not a bare string)
// — `renderReader` above only ever exercises the no-`from`/fallback path.
function renderReaderWithState(pathname: string, state: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <Routes>
        <Route path="/news/:slug" element={<Reader />} />
        <Route path="/news" element={<p>News Screen</p>} />
        <Route path="/today" element={<p>Today Screen</p>} />
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
      markUnread: vi.fn(),
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
      name: /NEXT · 2 MIN · Picking a workout by how much it should hurt/,
    });
    expect(next).toHaveAttribute("href", "/news/picking-a-workout");
  });

  it("renders no NEXT footer once every other article is already read", () => {
    mockUseArticleReads.mockReturnValue(
      readyState([
        "workout-types",
        "picking-a-workout",
        "pain-scale",
        "your-first-row",
        "connect-the-monitor",
      ]),
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
      markUnread: vi.fn(),
    });
    renderReader(`/news/${LINKED_FIXTURE.slug}`);

    expect(screen.getByText("News Screen")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: LINKED_FIXTURE.title }),
    ).not.toBeInTheDocument();
    expect(markRead).not.toHaveBeenCalled();
  });

  // Round 4 (architectural): the reader scrolls in its own overlay element
  // instead of the window (see .overlay-screen, index.css) — a freshly
  // mounted scroller starts at scrollTop 0 by construction, so there is no
  // scrollTo call to spy on any more. `tabIndex={0}` matches Plan.tsx's
  // 84-row sequence (Phase 6A): it puts the scroll region in the tab order
  // so a keyboard user can Tab to it and scroll with arrow/Page keys.
  it("the root carries the overlay-screen class and is keyboard-tabbable (tabIndex 0)", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    const { container } = renderReader("/news/baselines");

    const root = container.querySelector("main");
    expect(root).toHaveClass("overlay-screen");
    expect((root as HTMLElement).tabIndex).toBe(0);
  });

  it("NEXT navigation remounts the root: a fresh scroller for the new article, not the same DOM node reused mid-scroll", async () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    const user = userEvent.setup();
    const { container } = renderReader("/news/workout-types");

    const firstRoot = container.querySelector("main");
    await user.click(screen.getByRole("link", { name: /NEXT/ }));

    expect(
      await screen.findByRole("heading", {
        name: "What a baseline is, and why every pace comes from one",
      }),
    ).toBeVisible();
    const secondRoot = container.querySelector("main");
    expect(secondRoot).not.toBe(firstRoot);
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

  // ui-notes round, item 1 — root cause: NEXT used to PUSH with
  // `state={{from: location.pathname}}` (the article being LEFT, not the
  // chain's true origin), so mid-chain the real origin was gone and
  // BACK/✕ fell back to /news. The fix threads `location.state.from`
  // through unchanged on every hop.
  describe("the reading chain remembers its origin (ui-notes round, item 1)", () => {
    it("carries a ✕ close control resolving the same origin BACK does", () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      renderReaderWithState("/news/baselines", { from: "/today" });

      const close = screen.getByRole("link", { name: "Close" });
      expect(close).toHaveAttribute("href", "/today");
      // Today's own unlogged-row ✕ idiom (Today.tsx, ui-fix round Task 3),
      // reused rather than a second hand-rolled 44px icon control
      // (recurring-failure #8).
      expect(close).toHaveClass("today-unlogged-discard");
    });

    it("the ✕ close control falls back to /news, same as BACK, when there is no origin in state", () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      renderReader("/news/baselines");

      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/news",
      );
    });

    it("NEXT preserves the origin across the whole chain: after two hops, BACK's href and the ✕'s target both still point at the ORIGINAL origin, not the article just left", async () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      const user = userEvent.setup();
      renderReaderWithState("/news/workout-types", { from: "/today" });

      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      await screen.findByRole("heading", { name: BASELINES_TITLE });
      // Pre-fix behavior this guards against: NEXT set `from` to
      // "/news/workout-types" (the article just left) instead of carrying
      // "/today" through — the assertion below would see "/news/workout-
      // types", not "/today", if that regressed.
      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/today",
      );

      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      await screen.findByRole("heading", { name: PICKING_A_WORKOUT_TITLE });
      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/today",
      );
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/today",
      );
    });

    it("NEXT omits `from` (falls back to /news) rather than hardcoding a resolved origin, when it entered with none", async () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      const user = userEvent.setup();
      renderReader("/news/workout-types");

      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      await screen.findByRole("heading", { name: BASELINES_TITLE });

      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/news",
      );
    });

    it("NEXT replaces the current history entry — one browser BACK afterward lands on the origin, not the just-departed article", async () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      const router = createMemoryRouter(
        [
          { path: "/today", Component: () => <p>Today Screen</p> },
          { path: "/news/:slug", Component: Reader },
          { path: "/news", Component: () => <p>News Screen</p> },
        ],
        {
          initialEntries: [
            "/today",
            { pathname: "/news/workout-types", state: { from: "/today" } },
          ],
          initialIndex: 1,
        },
      );
      render(<RouterProvider router={router} />);
      await screen.findByRole("heading", { name: WORKOUT_TYPES_TITLE });

      await userEvent.click(screen.getByRole("link", { name: /NEXT/ }));
      await screen.findByRole("heading", { name: BASELINES_TITLE });

      router.navigate(-1);
      // The workout-types entry was REPLACED, not pushed alongside — one
      // BACK from baselines lands on /today (the entry before it), never
      // back on workout-types.
      await screen.findByText("Today Screen");
      expect(
        screen.queryByRole("heading", { name: WORKOUT_TYPES_TITLE }),
      ).not.toBeInTheDocument();
    });
  });
});
