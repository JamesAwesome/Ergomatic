import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import ArticleLink from "./ArticleLink";

// Crosslink round (field bug, James's 2026-08-09 recording): the two
// in-prose body cross-links (workoutTypes.tsx, pickingAWorkout.tsx) used to
// render a raw `react-router-dom` `Link` — no `replace`, no origin carried
// — so BACK/✕ from a cross-linked article fell back to /news instead of
// wherever the rower actually started. This is the ONE component that owns
// both halves of the fix; these tests prove each half directly, the same
// `createMemoryRouter` + `router.navigate(-1)` idiom Reader.test.tsx's own
// "NEXT replaces the current history entry" test uses to prove `replace`.

function Source({ to, label }: { to: string; label: string }) {
  return <ArticleLink to={to}>{label}</ArticleLink>;
}

function StateEcho() {
  const location = useLocation();
  return <p>state:{JSON.stringify(location.state ?? null)}</p>;
}

describe("ArticleLink", () => {
  it("renders the given text as a link to the given target", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/news/a",
          Component: () => <Source to="/news/b" label="Next article" />,
        },
        { path: "/news/b", Component: () => <p>B Screen</p> },
      ],
      { initialEntries: ["/news/a"] },
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByRole("link", { name: "Next article" })).toHaveAttribute(
      "href",
      "/news/b",
    );
  });

  it("carries the reading chain's origin forward when it entered with one", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "/news/a",
          Component: () => <Source to="/news/b" label="Next article" />,
        },
        { path: "/news/b", Component: StateEcho },
      ],
      { initialEntries: [{ pathname: "/news/a", state: { from: "/today" } }] },
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole("link", { name: "Next article" }));

    expect(await screen.findByText('state:{"from":"/today"}')).toBeVisible();
  });

  it("carries no state at all (not {from: undefined}) when it entered with no origin", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "/news/a",
          Component: () => <Source to="/news/b" label="Next article" />,
        },
        { path: "/news/b", Component: StateEcho },
      ],
      { initialEntries: ["/news/a"] },
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole("link", { name: "Next article" }));

    expect(await screen.findByText("state:null")).toBeVisible();
  });

  it("replaces the current history entry — one BACK from the target skips the cross-link hop entirely", async () => {
    const router = createMemoryRouter(
      [
        { path: "/today", Component: () => <p>Today Screen</p> },
        {
          path: "/news/a",
          Component: () => <Source to="/news/b" label="Next article" />,
        },
        { path: "/news/b", Component: () => <p>B Screen</p> },
      ],
      {
        initialEntries: [
          "/today",
          { pathname: "/news/a", state: { from: "/today" } },
        ],
        initialIndex: 1,
      },
    );
    render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole("link", { name: "Next article" }));
    await screen.findByText("B Screen");

    router.navigate(-1);

    // The /news/a entry was REPLACED, not pushed alongside — one BACK from
    // the cross-linked article lands on /today (the entry before it), never
    // back on the article the link was clicked from.
    await screen.findByText("Today Screen");
    expect(screen.queryByText("B Screen")).not.toBeInTheDocument();
  });
});
