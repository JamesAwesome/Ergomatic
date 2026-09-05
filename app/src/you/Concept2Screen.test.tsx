import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Concept2Screen from "./Concept2Screen";
import { api } from "../api";

// The dev-only probe now mounts HERE (moved from You, Gate 0 A12); same
// reason `You.test.tsx` used to mock it — `import.meta.env.DEV` is true
// under Vitest and the real lazy import would resolve in every test.
vi.mock("../monitor/Concept2LinkProbe", () => ({ default: () => null }));

// `./api`'s one export mocked; `"pending"` never settles — that is how the
// "read still in flight" state is reached honestly (see Concept2Row.test).
const c2Link = vi.hoisted(() => ({
  body: { available: false } as unknown,
  status: 200,
}));
vi.mock("../api", () => ({
  api: vi.fn(async (path: string, init?: RequestInit) => {
    if (path !== "/api/concept2/link") return fetch(path, init);
    if (c2Link.body === "pending") return new Promise<Response>(() => {});
    return new Response(JSON.stringify(c2Link.body), {
      status: c2Link.status,
      headers: { "Content-Type": "application/json" },
    });
  }),
}));

function YouProbe() {
  const loc = useLocation();
  return <p>YOU SCREEN at {loc.pathname}</p>;
}

function renderScreen(
  initialEntries: (string | { pathname: string; state: unknown })[] = [
    "/you/concept2",
  ],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/you" element={<YouProbe />} />
        <Route
          path="/you/concept2"
          element={<Concept2Screen email="a@x.com" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  c2Link.body = { available: false };
  c2Link.status = 200;
  vi.mocked(api).mockClear();
});
afterEach(() => {
  localStorage.clear();
});

describe("Concept2Screen — /you/concept2 (spec §5.1 R5, R6)", () => {
  it("renders BackLink and the Concept2 title before the first read resolves — a pending read is NOT a redirect", async () => {
    c2Link.body = "pending";
    renderScreen();
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
    expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/you",
    );
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    // Still here after the read is in flight: the AUD-015 shape this guards
    // against is a screen that bounces on every mount because `null` read
    // as "unavailable".
    expect(screen.queryByText(/YOU SCREEN/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
  });

  it("renders chrome AND the card's read-failed panel when the read fails, retained link or not", async () => {
    c2Link.body = { error: "upstream" };
    c2Link.status = 502;
    renderScreen();
    expect(await screen.findByText("COULDN'T READ CONCEPT2")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.getByRole("link", { name: /BACK/ })).toBeVisible();
  });

  it("mounts the card unchanged: an available, unlinked account sees CONNECT TO CONCEPT2 under the title", async () => {
    c2Link.body = { available: true, linked: false };
    renderScreen();
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeEnabled();
    // R6: the card's own head is still there — Gate 0 §8.5b kept it.
    expect(screen.getByRole("heading", { name: "CONCEPT2" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
  });

  it("returns the rower to /you when a SUCCESSFUL read says the surface is unavailable (typed URL, stale history)", async () => {
    c2Link.body = { available: false };
    renderScreen();
    expect(await screen.findByText("YOU SCREEN at /you")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Concept2" })).toBeNull();
  });

  it("the screen's own read and the card's can disagree: a card gone unavailable while the screen's read failed leaves chrome over an empty body — the known window", async () => {
    // TWO reads per mount, one per hook instance, and React runs the CHILD's
    // effect first — so the card's read is call 1 and the screen's is call
    // 2. Answering call 1 `available:false` and call 2 with a 502 is the
    // disagreement directly: the card goes silent (its own `!link.available`
    // return), the screen's `link` stays null with `failed` set, and its
    // redirect predicate (`link !== null && !link.available`) cannot fire.
    // The same shape arises in production when the card's Retry succeeds
    // with available:false after both reads failed. Pinned so a change to
    // either predicate — or to the effect order — is a red test, not a
    // silently blank screen.
    // Deferred, so BOTH answers are APPLIED before any assertion: a call
    // count only proves the requests STARTED, and `.c2-card` is absent at
    // mount anyway (the card returns null while `link === null`), so neither
    // is a readiness observable — measured: a screen mutated to redirect on
    // a FAILED read stayed green against the count-gated version. React
    // runs the CHILD's effect first, so resolver 0 is the card's read and
    // resolver 1 is the screen's.
    const answer: Array<(r: Response) => void> = [];
    vi.mocked(api).mockImplementation((path: string) => {
      if (path !== "/api/concept2/link")
        return Promise.resolve(new Response(null, { status: 204 }));
      return new Promise<Response>((resolve) => answer.push(resolve));
    });
    renderScreen();
    await waitFor(() => expect(answer).toHaveLength(2));
    await act(async () => {
      answer[0]!(
        new Response(JSON.stringify({ available: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    await act(async () => {
      answer[1]!(
        new Response(JSON.stringify({ error: "upstream" }), { status: 502 }),
      );
    });
    // Both answers applied. Chrome stays, BACK works, no redirect, card silent.
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
    expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/you",
    );
    expect(screen.queryByText("YOU SCREEN at /you")).toBeNull();
    expect(document.querySelector(".c2-card")).toBeNull();
    expect(screen.queryByText("COULDN'T READ CONCEPT2")).toBeNull();
  });

  it("BACK targets /you — the row's from=/you and the screen's fallback are the same place, so one assertion covers a warm entry and a cold load", async () => {
    c2Link.body = { available: true, linked: false };
    renderScreen([{ pathname: "/you/concept2", state: { from: "/you" } }]);
    expect(await screen.findByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/you",
    );
  });
});
