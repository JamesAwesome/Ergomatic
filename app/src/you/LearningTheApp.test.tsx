import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import LearningTheApp from "./LearningTheApp";
import { START_HERE_STEPS } from "../today/startHereSteps";
import type { ArticleReadsState } from "../api/useArticleReads";
import type { PreferencesData, PreferencesState } from "../api/usePreferences";

const mockUseArticleReads = vi.fn<() => ArticleReadsState>();
vi.mock("../api/useArticleReads", () => ({
  useArticleReads: () => mockUseArticleReads(),
}));

const mockUsePreferences = vi.fn<() => PreferencesState>();
vi.mock("../api/usePreferences", () => ({
  usePreferences: () => mockUsePreferences(),
}));

function readyReads(readSlugs: string[]): ArticleReadsState {
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
  save = vi.fn(),
): PreferencesState {
  return {
    state: "ready",
    preferences: { ...PREFS_DEFAULTS, ...overrides },
    save,
  };
}

function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return (
    <p>
      PROBE path={location.pathname} from={String(from)}
    </p>
  );
}

function renderLearning() {
  return render(
    <MemoryRouter initialEntries={["/you/learning"]}>
      <Routes>
        <Route path="/you/learning" element={<LearningTheApp />} />
        <Route path="/news/:slug" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseArticleReads.mockReturnValue(readyReads([]));
  mockUsePreferences.mockReturnValue(readyPrefs());
});

describe("LearningTheApp", () => {
  it("shows the Learning the app title and a BackLink to /you", () => {
    renderLearning();
    expect(
      screen.getByRole("heading", { name: "Learning the app" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/you",
    );
  });

  it("progress: nothing read shows 0 OF 4 READ", () => {
    renderLearning();
    expect(screen.getByText("0 OF 4 READ")).toBeVisible();
  });

  // Cross-surface consequence: reading `baselines` from anywhere (News, a
  // cross-link) legitimately advances THIS screen's own count too — same
  // real `article_reads` set, no separate onboarding-only counter.
  it("progress: reading baselines from elsewhere shows 1 OF 4 READ", () => {
    mockUseArticleReads.mockReturnValue(readyReads(["baselines"]));
    renderLearning();
    expect(screen.getByText("1 OF 4 READ")).toBeVisible();
  });

  it("progress: all four read shows 4 OF 4 READ", () => {
    mockUseArticleReads.mockReturnValue(
      readyReads(START_HERE_STEPS.map((s) => s.slug)),
    );
    renderLearning();
    expect(screen.getByText("4 OF 4 READ")).toBeVisible();
  });

  it("progress suppressed while reads are loading/errored — no count claim", () => {
    mockUseArticleReads.mockReturnValue({ state: "loading" });
    renderLearning();
    expect(screen.queryByText(/OF 4/)).not.toBeInTheDocument();
  });

  it("renders all four step rows with their real copy, each linking to /news/<slug> with state.from = /you/learning", async () => {
    renderLearning();
    for (const step of START_HERE_STEPS) {
      expect(screen.getByText(step.copy)).toBeVisible();
    }
    await userEvent.click(
      screen.getByText("Row 6k once. That is your baseline."),
    );
    expect(
      await screen.findByText(
        "PROBE path=/news/your-first-row from=/you/learning",
      ),
    ).toBeVisible();
  });

  it("a read step row flips to read styling, mirroring StartHere's own square/meta convention", () => {
    mockUseArticleReads.mockReturnValue(readyReads(["baselines"]));
    const { container } = renderLearning();
    const baselinesRow = screen
      .getByText("Every pace is that baseline plus an offset.")
      .closest(".starthere-row");
    expect(baselinesRow).toHaveAttribute("data-read", "true");
    expect(baselinesRow!.textContent).toMatch(/3 MIN · READ/);
    const otherSquares = [
      ...container.querySelectorAll(".starthere-square"),
    ].filter((sq) => sq !== baselinesRow!.querySelector(".starthere-square"));
    expect(otherSquares).toHaveLength(3);
    for (const sq of otherSquares) {
      expect(sq).toHaveAttribute("data-read", "false");
    }
  });

  describe("dismissed status line + PUT IT BACK ON TODAY", () => {
    it("not dismissed: no status line, PUT IT BACK ON TODAY absent", () => {
      mockUsePreferences.mockReturnValue(
        readyPrefs({ startHereDismissed: false }),
      );
      renderLearning();
      expect(
        screen.queryByText("DISMISSED ON TODAY · STILL PINNED IN NEWS"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "PUT IT BACK ON TODAY" }),
      ).not.toBeInTheDocument();
    });

    it("dismissed: shows the status line and the PUT IT BACK ON TODAY control", () => {
      mockUsePreferences.mockReturnValue(
        readyPrefs({ startHereDismissed: true }),
      );
      renderLearning();
      expect(
        screen.getByText("DISMISSED ON TODAY · STILL PINNED IN NEWS"),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "PUT IT BACK ON TODAY" }),
      ).toBeVisible();
    });

    it("PUT IT BACK ON TODAY calls save({startHereDismissed:false}) — a real consequence, not just a click", async () => {
      const save = vi.fn();
      mockUsePreferences.mockReturnValue(
        readyPrefs({ startHereDismissed: true }, save),
      );
      renderLearning();
      await userEvent.click(
        screen.getByRole("button", { name: "PUT IT BACK ON TODAY" }),
      );
      expect(save).toHaveBeenCalledWith({ startHereDismissed: false });
    });
  });

  describe("MARK ALL FOUR UNREAD (staged tap-again confirm)", () => {
    it("first tap arms (button reads TAP AGAIN) without calling markUnread or save yet", async () => {
      const markUnread = vi.fn();
      const save = vi.fn();
      mockUseArticleReads.mockReturnValue({
        state: "ready",
        readSlugs: new Set(START_HERE_STEPS.map((s) => s.slug)),
        markRead: vi.fn(),
        markUnread,
      });
      mockUsePreferences.mockReturnValue(
        readyPrefs({ startHereDismissed: true }, save),
      );
      renderLearning();

      await userEvent.click(
        screen.getByRole("button", { name: "MARK ALL FOUR UNREAD" }),
      );
      expect(screen.getByRole("button", { name: /TAP AGAIN/i })).toBeVisible();
      expect(markUnread).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it("second tap (armed) calls markUnread for all four step slugs AND clears the dismissed flag", async () => {
      const markUnread = vi.fn();
      const save = vi.fn();
      mockUseArticleReads.mockReturnValue({
        state: "ready",
        readSlugs: new Set(START_HERE_STEPS.map((s) => s.slug)),
        markRead: vi.fn(),
        markUnread,
      });
      mockUsePreferences.mockReturnValue(
        readyPrefs({ startHereDismissed: true }, save),
      );
      renderLearning();

      const button = screen.getByRole("button", {
        name: "MARK ALL FOUR UNREAD",
      });
      await userEvent.click(button);
      await userEvent.click(screen.getByRole("button", { name: /TAP AGAIN/i }));

      for (const step of START_HERE_STEPS) {
        expect(markUnread).toHaveBeenCalledWith(step.slug);
      }
      expect(markUnread).toHaveBeenCalledTimes(START_HERE_STEPS.length);
      expect(save).toHaveBeenCalledWith({ startHereDismissed: false });
      // Disarms back to the resting label after firing.
      expect(
        screen.getByRole("button", { name: "MARK ALL FOUR UNREAD" }),
      ).toBeVisible();
    });

    it("blurring the RESTING (unarmed) control is a safe no-op", async () => {
      renderLearning();
      const button = screen.getByRole("button", {
        name: "MARK ALL FOUR UNREAD",
      });
      // disarm() runs against a timer that was never set — the `else`
      // half of its own guard, exercised nowhere else in this suite.
      button.blur();
      expect(button).toBeVisible();
    });

    it("blurring the armed control disarms it without calling markUnread", async () => {
      const markUnread = vi.fn();
      mockUseArticleReads.mockReturnValue({
        state: "ready",
        readSlugs: new Set(),
        markRead: vi.fn(),
        markUnread,
      });
      renderLearning();

      await userEvent.click(
        screen.getByRole("button", { name: "MARK ALL FOUR UNREAD" }),
      );
      const armedButton = screen.getByRole("button", { name: /TAP AGAIN/i });
      armedButton.blur();
      expect(
        await screen.findByRole("button", { name: "MARK ALL FOUR UNREAD" }),
      ).toBeVisible();
      expect(markUnread).not.toHaveBeenCalled();
    });

    it("is available even when the reads hook has not resolved yet — arming still works, firing is a safe no-op", async () => {
      mockUseArticleReads.mockReturnValue({ state: "loading" });
      renderLearning();
      const button = screen.getByRole("button", {
        name: "MARK ALL FOUR UNREAD",
      });
      await userEvent.click(button);
      // Would throw if firing ever assumed a "ready" reads/preferences
      // state without checking — the click completing cleanly is the
      // assertion, same idiom as News.test.tsx's linked-row error-state
      // click test.
      await expect(
        userEvent.click(screen.getByRole("button", { name: /TAP AGAIN/i })),
      ).resolves.not.toThrow();
    });

    it("fires markUnread even when preferences have not resolved yet, without calling save", async () => {
      const markUnread = vi.fn();
      mockUseArticleReads.mockReturnValue({
        state: "ready",
        readSlugs: new Set(),
        markRead: vi.fn(),
        markUnread,
      });
      mockUsePreferences.mockReturnValue({ state: "loading" });
      renderLearning();

      await userEvent.click(
        screen.getByRole("button", { name: "MARK ALL FOUR UNREAD" }),
      );
      await userEvent.click(screen.getByRole("button", { name: /TAP AGAIN/i }));

      expect(markUnread).toHaveBeenCalledTimes(START_HERE_STEPS.length);
    });
  });
});
