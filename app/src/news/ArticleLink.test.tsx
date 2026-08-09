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
// wherever the rower actually started.
//
// BACK-walks-the-stack round (James's report 2, same day): a cross-link hop
// now PUSHES (the ui-notes round's `replace` reversed) and carries the
// `{ trail, origin }` shape `useReadingTrail` reads — `trail` grows by the
// SOURCE article's own path (so BACK from the linked article retraces
// here, and a further hop can keep retracing beyond it — see
// useReadingTrail's own doc comment for why this has to be a real array,
// not a `back`/`origin` pair), `origin` threads the reading chain's true
// origin forward unchanged. These tests prove both halves directly, the
// same `createMemoryRouter` + `router.navigate(-1)` idiom Reader.test.tsx's
// own depth tests use.

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

  it("grows `trail` by its own path AND carries the reading chain's origin forward when it entered with one", async () => {
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

    // `trail` is `["/today", "/news/a"]` — the legacy single `from` it
    // entered with (read as an implicit one-element trail), plus the
    // source's own path appended (what BACK from "/news/b" must retrace
    // to first). `origin` is "/today", threaded through unchanged via
    // `useReadingTrail`'s defaulting.
    expect(
      await screen.findByText(
        'state:{"trail":["/today","/news/a"],"origin":"/today"}',
      ),
    ).toBeVisible();
  });

  it("still grows `trail` by its own path (never dropping it) when it entered with no origin at all — `origin` is simply omitted", async () => {
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

    // JSON.stringify drops an `undefined`-valued key — this is the direct,
    // observable proof that `origin` came back `undefined` (never a
    // resolved fallback smuggled in as the raw value), while `trail` is
    // still always present, seeded with just the source's own path since
    // there was nothing else to inherit.
    expect(
      await screen.findByText('state:{"trail":["/news/a"]}'),
    ).toBeVisible();
  });

  it("pushes a new history entry — one BACK from the target lands back on the SOURCE article, not past it", async () => {
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

    // The reversal: /news/a is PUSHED past, not replaced — one BACK from
    // the cross-linked article lands back on /news/a (the article the link
    // was clicked from), never straight through to /today.
    await screen.findByText("Next article");
    expect(screen.queryByText("B Screen")).not.toBeInTheDocument();
  });
});
