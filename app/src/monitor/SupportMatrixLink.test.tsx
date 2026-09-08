import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import SupportMatrixLink from "./SupportMatrixLink";

/** Renders wherever the link lands and reports the router state it arrived
 *  with — the only way to see the thing that actually matters here. */
function Landed() {
  const location = useLocation();
  return (
    <div data-testid="landed">
      {JSON.stringify(location.state ?? null)}
      <span data-testid="path">{location.pathname}</span>
    </div>
  );
}

describe("SupportMatrixLink", () => {
  it("points at the connect-the-monitor article", () => {
    render(
      <MemoryRouter initialEntries={["/library/abc"]}>
        <SupportMatrixLink />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: /which ergs work/i }),
    ).toHaveAttribute("href", "/news/connect-the-monitor");
  });

  /**
   * THE ASSERTION THAT EARNS ITS PLACE (RF4: assert it works, not that it
   * exists).
   *
   * A test that only checked the href would stay green with `state` deleted,
   * and the resulting bug is invisible until someone taps ✕: `Reader`
   * resolves `origin ?? "/news"`, so a link with no `from` drops the rower on
   * the News tab instead of back where they were. That is `ArticleLink.tsx`'s
   * own recorded field bug, and this is the gate that stops it recurring on
   * the first product screen ever to link into an article.
   *
   * It reads the state off the LANDED route rather than off the anchor,
   * because the anchor cannot show it — router state never appears in the
   * DOM.
   */
  it("carries the route it came from, so the article's close button can return there", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/library/abc"]}>
        <Routes>
          <Route path="/library/:id" element={<SupportMatrixLink />} />
          <Route path="/news/connect-the-monitor" element={<Landed />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("link", { name: /which ergs work/i }));

    expect(screen.getByTestId("path")).toHaveTextContent(
      "/news/connect-the-monitor",
    );
    // The literal is independent of the component: a test deriving it from
    // `location.pathname` at render time would agree with a broken component.
    expect(screen.getByTestId("landed")).toHaveTextContent(
      '{"from":"/library/abc"}',
    );
  });

  it("carries the free-row door's own route, not a hardcoded one", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/justrow"]}>
        <Routes>
          <Route path="/justrow" element={<SupportMatrixLink />} />
          <Route path="/news/connect-the-monitor" element={<Landed />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("link", { name: /which ergs work/i }));

    expect(screen.getByTestId("landed")).toHaveTextContent(
      '{"from":"/justrow"}',
    );
  });
});
