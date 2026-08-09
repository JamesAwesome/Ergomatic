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

  // BACK-walks-the-stack round (James's 2026-08-09 recordings, taken
  // together): report 1 (pre-✕) — escaping N articles took N backs and the
  // origin got lost — shipped the ui-notes round's replace-collapse + ✕
  // (#66/#69), which made BACK and ✕ resolve the SAME single value. Report
  // 2, same day: ← BACK from a cross-linked article jumped straight to
  // Today instead of the previous article — exactly what a single shared
  // value can't avoid once the two doors need to disagree. This round
  // REVERSES the collapse: NEXT/ArticleLink push again, carrying a
  // walkable `trail` array (not just a `back`/`origin` PAIR of scalars —
  // see `useReadingTrail`'s own doc comment for why a plain pair can't
  // support a SECOND ← BACK press correctly) plus `origin`. ← BACK
  // retraces the stack one article at a time while ✕ still exits directly
  // to the true origin from any depth.
  describe("the reading chain: BACK retraces the stack, ✕ exits to the origin (BACK-walks-the-stack round)", () => {
    it("on the first article, BACK and ✕ both resolve the entry surface — there is no earlier article to retrace to yet", () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      renderReaderWithState("/news/baselines", { from: "/today" });

      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/today",
      );
      const close = screen.getByRole("link", { name: "Close" });
      expect(close).toHaveAttribute("href", "/today");
      // Today's own unlogged-row ✕ idiom (Today.tsx, ui-fix round Task 3),
      // reused rather than a second hand-rolled 44px icon control
      // (recurring-failure #8).
      expect(close).toHaveClass("today-unlogged-discard");
    });

    it("both BACK and the ✕ close control fall back to /news when there is no state at all", () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      renderReader("/news/baselines");

      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/news",
      );
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/news",
      );
    });

    it("NEXT preserves the origin across the whole chain while BACK retraces one article per hop — the reversal this round makes: BACK no longer jumps straight to the origin", async () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      const user = userEvent.setup();
      renderReaderWithState("/news/workout-types", { from: "/today" });

      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      await screen.findByRole("heading", { name: BASELINES_TITLE });
      // Pre-reversal (ui-notes round) behavior this guards against: BACK
      // here used to read "/today" (the collapsed origin) — it must now
      // read the article just left instead.
      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/news/workout-types",
      );
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/today",
      );

      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      await screen.findByRole("heading", { name: PICKING_A_WORKOUT_TITLE });
      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/news/baselines",
      );
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/today",
      );
    });

    it("BACK retraces to the previous article even when no origin was ever known, and ✕ falls back to that same article — origin defaults to `from` at every hop, not only the very first", async () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      const user = userEvent.setup();
      renderReader("/news/workout-types");

      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      await screen.findByRole("heading", { name: BASELINES_TITLE });

      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/news/workout-types",
      );
      // No origin was ever recorded (direct entry, no state) — the
      // defaulting rule ("origin defaults to `from`") isn't special-cased
      // to only the very first hop, so ✕ resolves to workout-types too:
      // the first article the rower actually saw functions as their
      // reading session's own origin, direct URL entry or not.
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/news/workout-types",
      );
    });

    // The regression a click-through test alone would have caught before
    // the e2e suite did: every OTHER test in this block only ever presses
    // ← BACK ONCE and asserts its href. ← BACK PUSHES a fresh entry rather
    // than truly going back (see useReadingTrail's own doc comment), so a
    // href-only assertion can't distinguish "retraces correctly" from
    // "landed on the right article but silently dropped its OWN trail,
    // stranding a SECOND press" — clicking twice in sequence is the only
    // way to prove the popped trail was actually threaded forward.
    it("pressing ← BACK a SECOND time (from the article the first press landed on) keeps retracing — the actual click, not just the first press's href", async () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      const user = userEvent.setup();
      renderReaderWithState("/news/workout-types", { from: "/today" });

      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      await screen.findByRole("heading", { name: BASELINES_TITLE });
      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      await screen.findByRole("heading", { name: PICKING_A_WORKOUT_TITLE });

      await user.click(screen.getByRole("link", { name: /BACK/ }));
      expect(
        await screen.findByRole("heading", { name: BASELINES_TITLE }),
      ).toBeVisible();

      // The press that a href-only assertion can't see failing: BACK from
      // here must reach workout-types, not fall through to /news because
      // the previous press's own trail got lost along the way.
      await user.click(screen.getByRole("link", { name: /BACK/ }));
      expect(
        await screen.findByRole("heading", { name: WORKOUT_TYPES_TITLE }),
      ).toBeVisible();

      await user.click(screen.getByRole("link", { name: /BACK/ }));
      expect(await screen.findByText("Today Screen")).toBeVisible();
    });

    it("NEXT pushes a new history entry — one browser BACK from two hops in lands on the article just left, not the origin", async () => {
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
      expect(
        await screen.findByRole("heading", { name: WORKOUT_TYPES_TITLE }),
      ).toBeVisible();

      await userEvent.click(screen.getByRole("link", { name: /NEXT/ }));
      expect(
        await screen.findByRole("heading", { name: BASELINES_TITLE }),
      ).toBeVisible();
      await userEvent.click(screen.getByRole("link", { name: /NEXT/ }));
      expect(
        await screen.findByRole("heading", { name: PICKING_A_WORKOUT_TITLE }),
      ).toBeVisible();

      // The reversal: workout-types and baselines were PUSHED past, not
      // replaced — one BACK from depth 2 lands back on baselines (the
      // article just left), never straight through to /today.
      router.navigate(-1);
      expect(
        await screen.findByRole("heading", { name: BASELINES_TITLE }),
      ).toBeVisible();

      router.navigate(-1);
      expect(
        await screen.findByRole("heading", { name: WORKOUT_TYPES_TITLE }),
      ).toBeVisible();

      router.navigate(-1);
      expect(await screen.findByText("Today Screen")).toBeVisible();
    });

    it("✕ exits directly to the origin from depth 2, skipping the stack entirely", async () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      const user = userEvent.setup();
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
      expect(
        await screen.findByRole("heading", { name: WORKOUT_TYPES_TITLE }),
      ).toBeVisible();

      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      expect(
        await screen.findByRole("heading", { name: BASELINES_TITLE }),
      ).toBeVisible();
      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      expect(
        await screen.findByRole("heading", { name: PICKING_A_WORKOUT_TITLE }),
      ).toBeVisible();

      await user.click(screen.getByRole("link", { name: "Close" }));
      expect(await screen.findByText("Today Screen")).toBeVisible();
    });

    it("guards `back` and `origin` independently: an unsafe origin falls back to a safe `back` rather than poisoning it", () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      renderReaderWithState("/news/baselines", {
        from: "/today",
        origin: "//evil.example",
      });

      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/today",
      );
      // The unsafe `origin` is discarded outright; ✕ falls back to `back`
      // ("/today"), not to /news — `back` itself is unaffected by the bad
      // `origin` value.
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/today",
      );
    });

    it("guards `back` and `origin` independently the other way: an unsafe `from` falls BACK back to /news while a safe `origin` still resolves ✕", () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      renderReaderWithState("/news/baselines", {
        from: "//evil.example",
        origin: "/today",
      });

      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/news",
      );
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/today",
      );
    });

    it("an unsafe element anywhere in `trail` invalidates the WHOLE array (never a partially-trusted trail) and falls back to the legacy `from`", () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      renderReaderWithState("/news/baselines", {
        trail: ["/today", "//evil.example"],
        from: "/today",
        origin: "/today",
      });

      // The bad second element condemns the whole array — BACK/✕ resolve
      // via the legacy `from` fallback, not "/today" (the array's own,
      // otherwise-safe first element) surviving on its own.
      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/today",
      );
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/today",
      );
    });

    it("an unsafe element in `trail`, with no `from` to fall back to either, leaves both BACK and ✕ at the /news fallback", () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      renderReaderWithState("/news/baselines", {
        trail: ["//evil.example"],
      });

      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/news",
      );
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/news",
      );
    });

    it("origin survives a NEXT + cross-link mix: entering via the same {trail, origin} shape ArticleLink's cross-link hop writes still resolves BACK to the hop just left and ✕ to the ORIGINAL origin, and a further NEXT keeps threading both", async () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      const user = userEvent.setup();
      // Simulates arriving at pain-scale via ArticleLink's own cross-link
      // hop from picking-a-workout (itself entered from Today) — the exact
      // shape ArticleLink.tsx writes (`{ trail: [...trail, <article just
      // left>], origin }`), not a NEXT hop. Reader can't (and shouldn't)
      // tell the two doors apart — that's the point of the shared shape.
      renderReaderWithState("/news/pain-scale", {
        trail: ["/today", "/news/picking-a-workout"],
        origin: "/today",
      });

      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/news/picking-a-workout",
      );
      expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
        "href",
        "/today",
      );

      await user.click(screen.getByRole("link", { name: /NEXT/ }));
      expect(
        await screen.findByRole("link", { name: "Close" }),
      ).toHaveAttribute("href", "/today");
      expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
        "href",
        "/news/pain-scale",
      );
    });
  });
});
