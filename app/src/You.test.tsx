import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import You from "./You";
import { api } from "./api";

// Fix round 2 (P1a-device): same idiom `AppRoutes.test.tsx` already uses
// for `JustRowObserver` — `import.meta.env.DEV` is `true` under Vitest, so
// You's own conditional `lazy()` import would otherwise really resolve
// this dev-only card in every test here. It has its own dedicated test
// file (`monitor/Concept2LinkProbe.test.tsx`); no test in this file cares
// about its content.
vi.mock("./monitor/Concept2LinkProbe", () => ({ default: () => null }));

// Wave E PR2 Task 8: You now mounts the PRODUCT Concept2 card, whose hook
// reads `GET /api/concept2/link` on every mount. That read has to be
// answered for the WHOLE FILE, not only in the new cases — before this
// mock every test here ran the read through the real `src/api.ts`, whose
// relative-URL `fetch` rejects under jsdom, and the rejection landed after
// the assertions as a `setFailed` outside `act()`, painting the
// read-failed panel (which renders the text `CONCEPT2`) onto tests that
// never asked for a card.
//
// `./api` is mocked rather than `./api/useConcept2Link`, which would test
// the mock. `src/api.ts` exports exactly one symbol, so this factory is
// total. The card's DEFAULT answer is `{available:false}` — the state
// every deployment is in today — so no existing test's screen changes; a
// case that wants a card sets `c2Link.body` first.
//
// EVERY OTHER PATH IS DELEGATED TO GLOBAL `fetch`, which is what the real
// `api()` does. That is not tidiness: this file's baseline-reset test
// stubs `fetch` and counts `/api/baselines` GETs through it, so a factory
// that answered everything itself would silently break it (the editor
// would never load and its `2k split` field would never be found).
//
// `vi.hoisted` because `vi.mock`'s factory is hoisted above ordinary
// declarations: a plain `const` referenced inside it throws "Cannot access
// before initialization".
const c2Link = vi.hoisted(() => ({ body: { available: false } as unknown }));

vi.mock("./api", () => ({
  api: vi.fn(async (path: string, init?: RequestInit) =>
    path === "/api/concept2/link"
      ? new Response(JSON.stringify(c2Link.body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : fetch(path, init),
  ),
}));

beforeEach(() => {
  c2Link.body = { available: false };
  vi.mocked(api).mockClear();
});

function renderYou(user = { id: "u1", email: "a@x.com", name: "Ada Rower" }) {
  return render(
    <MemoryRouter>
      <You user={user} onSignedOut={() => {}} />
    </MemoryRouter>,
  );
}

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

      // The editor's first mount fetched and shows the stored pair (the
      // typed field's resting value since Option T).
      expect(
        await screen.findByRole("textbox", { name: "2k split" }),
      ).toHaveValue("1:58.0");
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

  // Task 3 (Gate 0 rev 2/3): the quiet DIAGNOSTICS row at the bottom of
  // You, navigating to the menu screen — not Monitor logs directly.
  it("carries a DIAGNOSTICS row navigating to /you/diagnostics", () => {
    renderYou(user);
    const row = screen.getByRole("link", { name: "DIAGNOSTICS" });
    expect(row).toHaveAttribute("href", "/you/diagnostics");
  });
});

describe("You: the Concept2 card", () => {
  const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };

  it("renders the Concept2 card between the baseline reset and the diagnostics row", async () => {
    // DOCUMENT ORDER, not presence: the DIAGNOSTICS row's own comment
    // requires it stay the LAST child, and presence alone would pass with
    // the card sitting below it.
    c2Link.body = { available: true, linked: false };
    renderYou(user);
    const card = await screen.findByRole("region", { name: "CONCEPT2" });
    const reset = screen.getByRole("button", { name: /Reset baseline setup/i });
    const diagnostics = screen.getByRole("link", { name: /DIAGNOSTICS/ });
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(reset.compareDocumentPosition(card) & following).toBeTruthy();
    expect(card.compareDocumentPosition(diagnostics) & following).toBeTruthy();
  });

  it("passes the signed-in rower's own email to the card, so the identity line names both principals", async () => {
    // Gate 0 amendment 1c. The card cannot fetch this: `Me` is You's prop,
    // and the whole point of the line is that it names BOTH principals.
    c2Link.body = {
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: "jamesawesome",
      needsReauth: false,
      logbookBaseUrl: "https://log-dev.concept2.com",
    };
    renderYou({ id: "u1", email: "james@jamestheaweso.me", name: "James A" });
    expect(
      await screen.findByText(
        "Concept2 jamesawesome · Ergomatic james@jamestheaweso.me",
      ),
    ).toBeTruthy();
  });

  it("renders no Concept2 card at all when the server reports the surface unavailable", async () => {
    // The whole-screen half of Concept2Card's own unit case: You itself
    // must not reserve space, add a heading, or draw a hairline for an
    // absent card. Awaiting POSITIVE observables first — a section of You
    // that is always there, and the card's own mount read — so the absence
    // is asserted against a settled screen rather than one that has not
    // rendered yet.
    renderYou(user);
    expect(await screen.findByText("BASELINES")).toBeTruthy();
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    expect(screen.queryByRole("region", { name: "CONCEPT2" })).toBeNull();
    expect(screen.queryByText("CONNECT TO CONCEPT2")).toBeNull();
  });
});
