import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import HistoryList from "./HistoryList";
import type { LogHistoryState } from "./useLogHistory";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { RecentLog } from "../api/useRecentLogs";
import { LOG_SCROLL_KEY, saveLogScroll } from "./logScroll";

const mockUseLogHistory = vi.fn<() => LogHistoryState>();
vi.mock("./useLogHistory", () => ({
  useLogHistory: () => mockUseLogHistory(),
}));

// Realistic fixtures, per repo convention: real library titles/types
// (app/server/seed/library/) rather than hand-built placeholder strings.
const SEA_FRET = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;
const OCCLUDED_FRONT = LIBRARY_WORKOUTS.find(
  (w) => w.title === "Occluded Front",
)!;

function makeLog(id: string, overrides: Partial<RecentLog> = {}): RecentLog {
  return {
    id,
    workoutId: null,
    workoutTitle: SEA_FRET.title,
    workoutType: SEA_FRET.type,
    loggedAt: "2026-07-25T12:00:00.000Z",
    held: null,
    pain: null,
    thumbs: null,
    avgSplitSeconds: null,
    timeSeconds: null,
    distanceMeters: null,
    planKey: null,
    planIndex: null,
    ...overrides,
  };
}

function readyState(
  logs: RecentLog[],
  overrides: Partial<{ loadMore: () => void; exhausted: boolean }> = {},
): LogHistoryState {
  return {
    state: "ready",
    logs,
    loadMore: overrides.loadMore ?? vi.fn(),
    exhausted: overrides.exhausted ?? true,
  };
}

function renderHistoryList() {
  return render(
    <MemoryRouter>
      <HistoryList />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return <p>PROBE from={String(from)}</p>;
}

function renderHistoryListWithProbe() {
  return render(
    <MemoryRouter initialEntries={["/today/log"]}>
      <Routes>
        <Route path="/today/log" element={<HistoryList />} />
        <Route path="/today/log/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  mockUseLogHistory.mockReset();
});

describe("HistoryList", () => {
  it("shows LOADING… while the fetch is in flight", () => {
    mockUseLogHistory.mockReturnValue({ state: "loading" });
    renderHistoryList();
    expect(screen.getByText("LOADING…")).toBeVisible();
    expect(screen.getByRole("heading", { name: "History" })).toBeVisible();
  });

  it("shows an error message with a retry that calls the hook's retry", async () => {
    const retry = vi.fn();
    mockUseLogHistory.mockReturnValue({ state: "error", retry });
    renderHistoryList();
    expect(screen.getByText("Couldn't load your sessions.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows the exact empty-state string Today already uses when nothing has been logged", () => {
    mockUseLogHistory.mockReturnValue(readyState([]));
    renderHistoryList();
    expect(screen.getByText("No sessions logged yet.")).toBeVisible();
  });

  // §5G, the row idiom + the hero snippet's own literal example.
  it("renders title, calendar date, the held/pain meta line, and the AVG/DISTANCE hero snippet", () => {
    mockUseLogHistory.mockReturnValue(
      readyState([
        makeLog("log-1", {
          workoutTitle: OCCLUDED_FRONT.title,
          workoutType: OCCLUDED_FRONT.type,
          held: "held",
          pain: 2,
          avgSplitSeconds: 124.5,
          distanceMeters: 5000,
        }),
      ]),
    );
    renderHistoryList();
    expect(screen.getByText("Occluded Front")).toBeVisible();
    expect(screen.getByText("JUL 25 · HELD · 2/5")).toBeVisible();
    expect(screen.getByText("AVG 2:04.5 · 5,000 m")).toBeVisible();
  });

  // Exit criterion 2: a session saved on v0.11.0 (no hero keys posted at
  // all) renders with the meta line intact and no hero snippet — never a
  // dash, never a recomputed stand-in (§2B's absence idiom).
  it("renders a null-hero old row (the frozen v0.11.0 POST shape) with no hero snippet line at all", () => {
    mockUseLogHistory.mockReturnValue(
      readyState([
        makeLog("log-old", {
          workoutTitle: "Steady State",
          workoutType: "AT",
          held: "held",
          pain: 2,
          // avgSplitSeconds/timeSeconds/distanceMeters/planKey/planIndex
          // all null — exactly what a v0.11.0 client's POST (no hero
          // keys) reads back as.
        }),
      ]),
    );
    renderHistoryList();
    const row = screen.getByText("Steady State").closest("li")!;
    expect(within(row).getByText("JUL 25 · HELD · 2/5")).toBeVisible();
    expect(within(row).queryByText(/AVG/)).not.toBeInTheDocument();
  });

  it("renders only the present hero segment when the other stored hero is null", () => {
    mockUseLogHistory.mockReturnValue(
      readyState([
        makeLog("log-avg-only", {
          workoutId: "w-avg",
          avgSplitSeconds: 124.5,
          distanceMeters: null,
        }),
        makeLog("log-dist-only", {
          workoutId: "w-dist",
          avgSplitSeconds: null,
          distanceMeters: 5000,
        }),
      ]),
    );
    renderHistoryList();
    expect(screen.getByText("AVG 2:04.5")).toBeVisible();
    expect(screen.getByText("5,000 m")).toBeVisible();
  });

  it("links each row to /today/log/:id carrying location.state.from = '/today/log'", async () => {
    mockUseLogHistory.mockReturnValue(
      readyState([makeLog("log-42", { workoutTitle: OCCLUDED_FRONT.title })]),
    );
    renderHistoryListWithProbe();
    const link = screen.getByRole("link", { name: /Occluded Front/ });
    expect(link).toHaveAttribute("href", "/today/log/log-42");
    await userEvent.click(link);
    expect(await screen.findByText("PROBE from=/today/log")).toBeVisible();
  });

  it("BackLink falls back to /today on a cold deep link (no location.state)", () => {
    mockUseLogHistory.mockReturnValue(readyState([]));
    renderHistoryList();
    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/today",
    );
  });
});

// N2's own witness (spec §4): the isConnected-guarded throttled save,
// restore-on-mount with clamp, and the disconnected-root instrumented-
// write assertion — News.tsx:200-220's EXACT pair, PR #84's recipe,
// re-targeted at this screen's own key/root.
describe("HistoryList scroll (spec §4 N2)", () => {
  beforeEach(() => {
    mockUseLogHistory.mockReturnValue(
      readyState([makeLog("log-1"), makeLog("log-2")]),
    );
  });

  // Found on a real Chromium e2e run, not in review: unlike News (which
  // renders its full row set immediately, no LOADING branch), this screen
  // DOES have a genuinely shorter loading state — mounting it after a
  // BACK return clamps `window.scrollY` down to fit on a real browser,
  // firing a real `scroll` event on this STILL-CONNECTED root before the
  // real content (and the restore effect) ever mount. `isConnected`
  // alone doesn't catch it (the root never disconnects); not attaching
  // the save listener until loading has settled does.
  it("never saves while the fetch is still loading (a same-root clamp echo from the short LOADING branch, not a real scroll of this screen)", () => {
    mockUseLogHistory.mockReturnValue({ state: "loading" });
    renderHistoryList();

    Object.defineProperty(window, "scrollY", {
      value: 0,
      configurable: true,
    });
    window.dispatchEvent(new Event("scroll"));

    expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBeNull();
  });

  // The consequence framing (review finding 2): a bare "nothing written"
  // assertion above would still pass a mutant that writes 0 over an
  // EXISTING real position, as long as nothing was there to begin with —
  // this seeds a genuine prior save (the shape a real BACK return leaves
  // behind) and proves the loading-phase clamp echo does not clobber it.
  it("a real prior saved position survives a scroll event that fires while still loading (the clamp echo never overwrites it)", () => {
    saveLogScroll(623);
    mockUseLogHistory.mockReturnValue({ state: "loading" });
    renderHistoryList();

    Object.defineProperty(window, "scrollY", {
      value: 0,
      configurable: true,
    });
    window.dispatchEvent(new Event("scroll"));

    expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("623");
  });

  it("saves scrollY to sessionStorage, throttled to ~100ms (the trailing value survives)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderHistoryList();

      Object.defineProperty(window, "scrollY", {
        value: 111,
        configurable: true,
      });
      window.dispatchEvent(new Event("scroll"));
      expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("111");

      Object.defineProperty(window, "scrollY", {
        value: 222,
        configurable: true,
      });
      window.dispatchEvent(new Event("scroll"));
      Object.defineProperty(window, "scrollY", {
        value: 333,
        configurable: true,
      });
      window.dispatchEvent(new Event("scroll"));
      expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("111");

      await vi.advanceTimersByTimeAsync(100);
      expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("333");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes the CURRENT position on unmount even mid-throttle-window, instead of dropping it", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { unmount } = renderHistoryList();

      Object.defineProperty(window, "scrollY", {
        value: 500,
        configurable: true,
      });
      window.dispatchEvent(new Event("scroll"));
      Object.defineProperty(window, "scrollY", {
        value: 777,
        configurable: true,
      });
      window.dispatchEvent(new Event("scroll"));
      expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("500");

      unmount();

      expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("777");
    } finally {
      vi.useRealTimers();
    }
  });

  // The PR #84 recipe, verbatim (News.test.tsx's own twin): a scroll
  // event that fires after this screen's own root is no longer connected
  // to the document (the disconnected-root echo — a real navigation's
  // `.overlay-screen`/tab-swap clamping `window.scrollY` to ~0) must be
  // ignored, not overwrite a real, already-saved position.
  it("ignores a scroll event that fires after this screen's own root has been removed from the document (a disconnected-root echo, not a real scroll of THIS screen) — the instrumented-write assertion", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { container } = renderHistoryList();

      Object.defineProperty(window, "scrollY", {
        value: 300,
        configurable: true,
      });
      window.dispatchEvent(new Event("scroll"));
      expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("300");

      const root = container.querySelector("main.history-screen")!;
      Object.defineProperty(root, "isConnected", {
        value: false,
        configurable: true,
      });

      // Past the throttle window, so a mutant that dropped the guard
      // would flush this IMMEDIATELY (elapsed >= 100ms) rather than
      // merely queueing it.
      vi.advanceTimersByTime(200);
      Object.defineProperty(window, "scrollY", {
        value: 0,
        configurable: true,
      });
      window.dispatchEvent(new Event("scroll"));

      // The real, pre-detachment position survives — never a 0 saved
      // over a real offset (PR #84's own naming).
      expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("300");
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the saved position once ready, clamped by the browser's own scrollTo (never higher than what's actually loaded)", () => {
    sessionStorage.setItem(LOG_SCROLL_KEY, "900");
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    renderHistoryList();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 900);
    scrollToSpy.mockRestore();
  });

  it("does not restore again on a later re-render once already restored", () => {
    sessionStorage.setItem(LOG_SCROLL_KEY, "900");
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    const { rerender } = renderHistoryList();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    mockUseLogHistory.mockReturnValue(
      readyState([makeLog("log-1"), makeLog("log-2"), makeLog("log-3")]),
    );
    rerender(
      <MemoryRouter>
        <HistoryList />
      </MemoryRouter>,
    );

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    scrollToSpy.mockRestore();
  });

  it("does nothing when nothing was saved (a genuinely fresh visit)", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    renderHistoryList();
    expect(scrollToSpy).not.toHaveBeenCalled();
    scrollToSpy.mockRestore();
  });
});

describe("HistoryList infinite scroll (spec §1: loads more on scroll)", () => {
  function nearBottom() {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });
    // distance from bottom = 2000 - 1700 - 800 = -500, well under the
    // 600px trigger threshold.
    Object.defineProperty(window, "scrollY", {
      value: 1700,
      configurable: true,
    });
  }

  function farFromBottom() {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 5000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(window, "scrollY", {
      value: 0,
      configurable: true,
    });
  }

  it("calls loadMore once scrolled near the bottom, ignoring the very first scroll tick after mount", () => {
    const loadMore = vi.fn();
    mockUseLogHistory.mockReturnValue(
      readyState([makeLog("log-1")], { loadMore, exhausted: false }),
    );
    renderHistoryList();
    nearBottom();

    // Spec §4 N2's honesty rule: the first tick after mount may be the
    // restore effect's own programmatic jump — swallowed, not chased.
    window.dispatchEvent(new Event("scroll"));
    expect(loadMore).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("scroll"));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("does not call loadMore while far from the bottom", () => {
    const loadMore = vi.fn();
    mockUseLogHistory.mockReturnValue(
      readyState([makeLog("log-1")], { loadMore, exhausted: false }),
    );
    renderHistoryList();
    farFromBottom();

    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    expect(loadMore).not.toHaveBeenCalled();
  });

  it("never calls loadMore once the list is already exhausted", () => {
    const loadMore = vi.fn();
    mockUseLogHistory.mockReturnValue(
      readyState([makeLog("log-1")], { loadMore, exhausted: true }),
    );
    renderHistoryList();
    nearBottom();

    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    expect(loadMore).not.toHaveBeenCalled();
  });
});
