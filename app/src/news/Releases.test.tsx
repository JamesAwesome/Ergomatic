import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Releases from "./Releases";
import { RELEASE_NOTES } from "./content/releaseNotes";
import { releaseDate } from "./newsDates";

function renderReleases() {
  return render(
    <MemoryRouter>
      <Releases />
    </MemoryRouter>,
  );
}

describe("Releases", () => {
  it("renders all three seeded versions, in registry order (newest first)", () => {
    renderReleases();

    const versionEls = screen.getAllByText(/^v\d+\.\d+\.\d+ ·/);
    expect(versionEls).toHaveLength(RELEASE_NOTES.length);
    expect(versionEls.map((el) => el.textContent)).toStrictEqual(
      RELEASE_NOTES.map((r) => `${r.version} · ${releaseDate(r.date)}`),
    );
    // Registry order IS newest-first (releaseNotes.ts's own invariant,
    // proven by articles.test.tsx's "release notes" describe block) — this
    // asserts the screen doesn't re-sort or reverse it.
    const dates = RELEASE_NOTES.map((r) => r.date);
    expect([...dates].sort().reverse()).toStrictEqual(dates);
  });

  it("renders each release's version, date, and every item", () => {
    renderReleases();

    for (const release of RELEASE_NOTES) {
      expect(
        screen.getByText(new RegExp(`^${release.version} ·`)),
      ).toBeVisible();
      for (const item of release.items) {
        expect(screen.getByText(item)).toBeVisible();
      }
    }
  });

  it("shows no read-state anywhere on the screen", () => {
    const { container } = renderReleases();
    expect(container.querySelectorAll(".news-square")).toHaveLength(0);
    expect(screen.queryByText(/UNREAD/)).not.toBeInTheDocument();
  });

  it("carries a BACK link falling back to /news", () => {
    renderReleases();
    expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/news",
    );
  });

  it('has the "Release notes" screen title', () => {
    renderReleases();
    expect(
      screen.getByRole("heading", { name: "Release notes" }),
    ).toBeVisible();
  });

  // Round 4 (architectural): this screen scrolls in its own overlay element
  // instead of the window (see .overlay-screen, index.css) — a freshly
  // mounted scroller starts at scrollTop 0 by construction, so there is no
  // scrollTo call to spy on any more. `tabIndex={0}` matches Plan.tsx's
  // 84-row sequence (Phase 6A): it puts the scroll region in the tab order
  // so a keyboard user can Tab to it and scroll with arrow/Page keys.
  it("the root carries the overlay-screen class and is keyboard-tabbable (tabIndex 0)", () => {
    const { container } = renderReleases();

    const root = container.querySelector("main");
    expect(root).toHaveClass("overlay-screen");
    expect((root as HTMLElement).tabIndex).toBe(0);
  });
});
