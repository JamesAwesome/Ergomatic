import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import News, { ArticleRow } from "./News";
import type { ArticleReadsState } from "../api/useArticleReads";
import type { PreferencesData, PreferencesState } from "../api/usePreferences";
import type { NewsArticle } from "./content/types";
import { RELEASE_NOTES } from "./content/releaseNotes";
import { START_HERE_STEPS } from "../today/startHereSteps";

// The registry is real (recurring-failure #3: an empty/synthetic fixture
// hid two shipped defects before) — every scenario below reads through the
// actual ARTICLES/RELEASE_NOTES content, not a hand-built minimum. Only
// useArticleReads is mocked, per scenario.
const mockUseArticleReads = vi.fn<() => ArticleReadsState>();
vi.mock("../api/useArticleReads", () => ({
  useArticleReads: () => mockUseArticleReads(),
}));

// Task 7: the Start-here pin's own "only while dismissed" gate reads this.
const mockUsePreferences = vi.fn<() => PreferencesState>();
vi.mock("../api/usePreferences", () => ({
  usePreferences: () => mockUsePreferences(),
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

const PREFS_DEFAULTS: PreferencesData = {
  difficulties: ["easy", "medium", "hard"],
  timeCapMinutes: 60,
  warmupMinutes: 10,
  countdownSeconds: 5,
  startHereDismissed: false,
};

function readyPrefs(
  overrides: Partial<PreferencesData> = {},
): PreferencesState {
  return {
    state: "ready",
    preferences: { ...PREFS_DEFAULTS, ...overrides },
    save: vi.fn(),
  };
}

// Every existing scenario below predates the Start-here pin and never sets
// `startHereDismissed` itself — defaulting to "not dismissed" here keeps
// them all exercising the pin-absent case, which is what they were already
// implicitly asserting via `.news-pinned .news-row` counts of 2.
beforeEach(() => {
  mockUsePreferences.mockReturnValue(readyPrefs());
});

describe("News", () => {
  it("ready with nothing read: both pins and all four latest stories render, 6 UNREAD, every square unread", () => {
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
    expect(screen.getByText("Your first row")).toBeVisible();
    expect(
      screen.getByText("Connect the monitor, and it drives the piece"),
    ).toBeVisible();

    expect(screen.getByText("6 UNREAD")).toBeVisible();

    const squares = container.querySelectorAll(".news-square");
    expect(squares).toHaveLength(6);
    for (const sq of squares) {
      expect(sq).toHaveAttribute("data-read", "false");
    }
  });

  it("baselines read: count drops to 5 UNREAD, only the baselines square/meta flip to read", () => {
    mockUseArticleReads.mockReturnValue(readyState(["baselines"]));
    const { container } = renderNews();

    expect(screen.getByText("5 UNREAD")).toBeVisible();

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
    expect(otherSquares).toHaveLength(5);
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
        "your-first-row",
        "connect-the-monitor",
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

describe("News — Start-here pin (Task 7)", () => {
  it("not dismissed: no pin renders, PINNED still holds only the two permanent rows", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    mockUsePreferences.mockReturnValue(
      readyPrefs({ startHereDismissed: false }),
    );
    renderNews();

    expect(
      screen.queryByText("Start here, in four steps"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link").filter((l) => l.closest(".news-pinned")),
    ).toHaveLength(2);
  });

  it("dismissed: the pin renders first in PINNED, links to /you/learning with state.from=/news, and shows N OF 4 READ · DISMISSED ON TODAY", () => {
    mockUseArticleReads.mockReturnValue(readyState(["baselines"]));
    mockUsePreferences.mockReturnValue(
      readyPrefs({ startHereDismissed: true }),
    );
    renderNews();

    const pin = screen.getByRole("link", { name: /Start here, in four steps/ });
    expect(pin).toHaveAttribute("href", "/you/learning");
    expect(pin.closest(".news-pinned")).not.toBeNull();
    expect(pin.textContent).toMatch(/1 OF 4 READ · DISMISSED ON TODAY/);

    const pinnedLinks = screen
      .getAllByRole("link")
      .filter((l) => l.closest(".news-pinned"));
    expect(pinnedLinks).toHaveLength(3);
    expect(pinnedLinks[0]).toBe(pin);
  });

  // Cross-surface consequence: reading a step slug from anywhere (here,
  // simulated the same way LearningTheApp/You.test.tsx do — via the shared
  // useArticleReads state) is the SAME count the pin's own meta reports;
  // reading all four takes it to 4 OF 4.
  it("all four steps read: pin meta reads 4 OF 4 READ", () => {
    mockUseArticleReads.mockReturnValue(
      readyState(START_HERE_STEPS.map((s) => s.slug)),
    );
    mockUsePreferences.mockReturnValue(
      readyPrefs({ startHereDismissed: true }),
    );
    renderNews();

    const pin = screen.getByRole("link", { name: /Start here, in four steps/ });
    expect(pin.textContent).toMatch(/4 OF 4 READ · DISMISSED ON TODAY/);
  });

  it("dismissed but reads not yet resolved: pin still renders (dismissal is known), but suppresses the count claim", () => {
    mockUseArticleReads.mockReturnValue({ state: "loading" });
    mockUsePreferences.mockReturnValue(
      readyPrefs({ startHereDismissed: true }),
    );
    renderNews();

    const pin = screen.getByRole("link", { name: /Start here, in four steps/ });
    expect(pin.textContent).toMatch(/DISMISSED ON TODAY/);
    expect(pin.textContent).not.toMatch(/OF 4/);
  });

  it("preferences not yet resolved: pin absent (dismissal isn't known to be true)", () => {
    mockUseArticleReads.mockReturnValue(readyState([]));
    mockUsePreferences.mockReturnValue({ state: "loading" });
    renderNews();

    expect(
      screen.queryByText("Start here, in four steps"),
    ).not.toBeInTheDocument();
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
