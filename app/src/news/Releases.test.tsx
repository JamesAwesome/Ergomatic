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

  // READ THE DOM ONCE. This test used to call `screen.getByText` once per
  // release and once per item; each of those scans the WHOLE rendered tree,
  // so its cost was the product of the two and grew as the SQUARE of a list
  // that gets an entry every release. Measured 2026-09-15 on this file by
  // rendering truncated copies of RELEASE_NOTES: 35ms at 13 releases, 83ms
  // at 26, 175ms at 39, 361ms at 52 — 4.3x for 2x the list. The whole test
  // was 541ms, the slowest SYNCHRONOUS test in the client project by 3.1x
  // (runner-up: nameGenerator's 175ms), against vitest's 5000ms deadline,
  // and it had been timing out in CI on a render with nothing to await.
  // Walking the sections instead is linear and asserts MORE: each release's
  // items are pinned to that release's own card, in order, rather than found
  // anywhere on the screen, and the date is actually checked (the old body
  // matched `^<version> ·` and stopped, so the title's "date" was a promise
  // the assertions did not keep).
  it("renders each release's version, date, and every item", () => {
    const { container } = renderReleases();

    const sections = [...container.querySelectorAll("section.news-whatsnew")];
    expect(sections).toHaveLength(RELEASE_NOTES.length);

    RELEASE_NOTES.forEach((release, i) => {
      const section = sections[i]!;

      const version = section.querySelector(".news-release-version");
      expect(version).toBeVisible();
      expect(version!.textContent).toBe(
        `${release.version} · ${releaseDate(release.date)}`,
      );

      const items = [...section.querySelectorAll(".news-release-items li")];
      expect(items.map((el) => el.textContent)).toStrictEqual(release.items);
      for (const el of items) expect(el).toBeVisible();
    });
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
