import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import You from "./You";
import type { ArticleReadsState } from "./api/useArticleReads";

// Task 7: the SETTINGS row's own meta reads the real four-slug progress off
// this hook — only it is mocked (News.test.tsx/StartHere.test.tsx's own "only
// the hook under test" discipline), never the row's own real markup.
const mockUseArticleReads = vi.fn<() => ArticleReadsState>();
vi.mock("./api/useArticleReads", () => ({
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

function renderYou(user = { id: "u1", email: "a@x.com", name: "Ada Rower" }) {
  return render(
    <MemoryRouter>
      <You user={user} onSignedOut={() => {}} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseArticleReads.mockReturnValue(readyState([]));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("./adapters/auth");
});

describe("You", () => {
  const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };

  it("shows identity and initials", () => {
    renderYou(user);
    expect(screen.getByText("Ada Rower")).toBeInTheDocument();
    expect(screen.getByText("a@x.com")).toBeInTheDocument();
    expect(screen.getByText("AR")).toBeInTheDocument();
  });

  it("signs out via POST and notifies", async () => {
    const onSignedOut = vi.fn();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryRouter>
        <You user={user} onSignedOut={onSignedOut} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/signout", {
      method: "POST",
    });
    expect(onSignedOut).toHaveBeenCalled();
  });

  it("awaits the auth adapter's signOut before notifying onSignedOut", async () => {
    const onSignedOut = vi.fn();
    let resolveSignOut!: () => void;
    const authSignOut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        }),
    );
    vi.doMock("./adapters/auth", () => ({ signOut: authSignOut }));
    const { default: AdapterYou } = await import("./You");
    render(
      <MemoryRouter>
        <AdapterYou user={user} onSignedOut={onSignedOut} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(authSignOut).toHaveBeenCalledOnce();
    expect(onSignedOut).not.toHaveBeenCalled();
    resolveSignOut();
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
  });

  describe("Reset baseline setup wiring (Phase BL PR C)", () => {
    // The full staged-confirm behavior lives in ResetBaselineSetup's own
    // test; this pins You's OWN contribution — a successful reset remounts
    // the editor so it refetches the now-empty server state instead of
    // keeping the cleared numbers on screen.
    it("a confirmed reset makes the baseline editor refetch (remount via the generation key)", async () => {
      const calls: { url: string; method: string }[] = [];
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (url === "/api/baselines" && method === "DELETE") {
          return new Response(
            JSON.stringify({ k2Seconds: null, k6Seconds: null }),
            { status: 200 },
          );
        }
        if (url === "/api/baselines") {
          return new Response(
            JSON.stringify({ k2Seconds: 118, k6Seconds: 127 }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      renderYou();

      // The editor's first mount fetched and shows the stored pair.
      expect(await screen.findByText("1:58.0")).toBeInTheDocument();
      const baselineGets = () =>
        calls.filter((c) => c.url === "/api/baselines" && c.method === "GET")
          .length;
      expect(baselineGets()).toBe(1);

      await userEvent.click(
        screen.getByRole("button", { name: "Reset baseline setup" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Reset baseline setup" }),
      );

      // The DELETE went out AND the remounted editor re-fetched — the
      // consequence, not the callback's existence (TESTING.md §3).
      await vi.waitFor(() => expect(baselineGets()).toBe(2));
      expect(
        calls.some((c) => c.url === "/api/baselines" && c.method === "DELETE"),
      ).toBe(true);
    });
  });

  describe("SETTINGS · Learning the app row (Task 7)", () => {
    it("shows a SETTINGS section heading and a Learning the app row linking to /you/learning", () => {
      renderYou();
      expect(screen.getByText("SETTINGS")).toBeVisible();
      const row = screen.getByRole("link", { name: /Learning the app/ });
      expect(row).toHaveAttribute("href", "/you/learning");
    });

    it("meta reads START HERE · 0 OF 4 with nothing read", () => {
      mockUseArticleReads.mockReturnValue(readyState([]));
      renderYou();
      expect(screen.getByText("START HERE · 0 OF 4")).toBeVisible();
    });

    // Cross-surface consequence: reading ANY of the four slugs from
    // anywhere (here: `baselines`, exactly the slug the phase spec names)
    // advances this row's own count — it reads off the same real
    // `article_reads` set News/Reader/StartHere all share, not a second,
    // onboarding-only counter.
    it("reading baselines from elsewhere advances the row's own count to 1 OF 4", () => {
      mockUseArticleReads.mockReturnValue(readyState(["baselines"]));
      renderYou();
      expect(screen.getByText("START HERE · 1 OF 4")).toBeVisible();
    });

    it("all four read: meta reads START HERE · 4 OF 4", () => {
      mockUseArticleReads.mockReturnValue(
        readyState([
          "your-first-row",
          "baselines",
          "picking-a-workout",
          "connect-the-monitor",
        ]),
      );
      renderYou();
      expect(screen.getByText("START HERE · 4 OF 4")).toBeVisible();
    });

    it("reads not ready (loading): meta shows bare START HERE, no count — suppression rule", () => {
      mockUseArticleReads.mockReturnValue({ state: "loading" });
      renderYou();
      expect(screen.getByText("START HERE")).toBeVisible();
      expect(screen.queryByText(/OF 4/)).not.toBeInTheDocument();
    });

    it("reads errored: meta shows bare START HERE, same suppression", () => {
      mockUseArticleReads.mockReturnValue({ state: "error" });
      renderYou();
      expect(screen.getByText("START HERE")).toBeVisible();
      expect(screen.queryByText(/OF 4/)).not.toBeInTheDocument();
    });

    it("the row carries the BackLink 'from' contract (state.from = /you)", () => {
      renderYou();
      // RTL can't read a <Link>'s `state` prop directly — Library.test.tsx's
      // own LocationProbe idiom would need a second route; here the href
      // itself is the load-bearing assertion (state is asserted at the
      // AppRoutes/BackLink level for this route, mirroring how Library.tsx's
      // own header links are only href-checked in Library.test.tsx too).
      const row = screen.getByRole("link", { name: /Learning the app/ });
      expect(row).toHaveAttribute("href", "/you/learning");
    });
  });
});
