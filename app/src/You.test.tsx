import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import You from "./You";
import { api } from "./api";

// Wave E PR2 Task 8 (card), PR A (row): You mounts the Concept2 ROW, whose
// hook reads `GET /api/concept2/link` on every mount. That read has to be
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
const c2Link = vi.hoisted(() => ({
  body: { available: false } as unknown,
  status: 200,
}));

vi.mock("./api", () => ({
  api: vi.fn(async (path: string, init?: RequestInit) =>
    path === "/api/concept2/link"
      ? new Response(JSON.stringify(c2Link.body), {
          status: c2Link.status,
          headers: { "Content-Type": "application/json" },
        })
      : fetch(path, init),
  ),
}));

beforeEach(() => {
  c2Link.body = { available: false };
  c2Link.status = 200;
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
  // Wave E PR A: the row writes `ergomatic.concept2Seen.<id>` on every
  // successful read (`you/concept2Seen.ts`). `src/test/setup.ts` clears no
  // storage, so without this the I-D case would inherit a `u1` key minted
  // two tests earlier and its "MINTED by this mount" precondition would be
  // satisfied by leakage (found at the plan's hardening).
  localStorage.clear();
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

describe("You: the Concept2 row (Wave E PR A, spec §5.1)", () => {
  const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };

  it("renders the CONCEPT2 row ABOVE the DIAGNOSTICS row, both inside one doors group (R7, ruling 7)", async () => {
    // DOCUMENT ORDER, not presence: ruling 7 puts CONCEPT2 first and keeps
    // DIAGNOSTICS You's last child; presence alone would pass either order.
    c2Link.body = { available: true, linked: false };
    renderYou(user);
    const row = await screen.findByRole("link", { name: /CONCEPT2/ });
    const diagnostics = screen.getByRole("link", { name: /DIAGNOSTICS/ });
    const reset = screen.getByRole("button", { name: /Reset baseline setup/i });
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(reset.compareDocumentPosition(row) & following).toBeTruthy();
    expect(row.compareDocumentPosition(diagnostics) & following).toBeTruthy();
    const group = screen.getByRole("navigation", { name: "More" });
    expect(group).toContainElement(row);
    expect(group).toContainElement(diagnostics);
    expect(row).toHaveAttribute("href", "/you/concept2");
    expect(screen.getByText("NOT LINKED")).toBeInTheDocument();
  });

  it("renders NO card on You any more — the card lives behind the row (R10)", async () => {
    c2Link.body = { available: true, linked: false };
    renderYou(user);
    await screen.findByRole("link", { name: /CONCEPT2/ });
    expect(screen.queryByRole("region", { name: "CONCEPT2" })).toBeNull();
    expect(screen.queryByText("CONNECT TO CONCEPT2")).toBeNull();
  });

  it("renders no Concept2 row at all when the server reports the surface unavailable", async () => {
    // Awaiting POSITIVE observables first — a section of You that is always
    // there, and the row's own mount read — so the absence is asserted
    // against a settled screen rather than one that has not rendered yet.
    renderYou(user);
    expect(await screen.findByText("BASELINES")).toBeTruthy();
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    expect(screen.queryByRole("link", { name: /CONCEPT2/ })).toBeNull();
    expect(screen.queryByText("CONCEPT2")).toBeNull();
    // The doors group is then the lone DIAGNOSTICS row, drawn as before.
    expect(screen.getByRole("link", { name: /DIAGNOSTICS/ })).toBeVisible();
  });

  it("I-D: signing out clears this account's persisted Concept2 'seen' fact before notifying", async () => {
    // The row's OWN mount read must say available:true here, so the fact is
    // MINTED by this mount (I-B) and can only be gone afterwards because
    // sign-out cleared it. With the default `{available:false}` answer the
    // row itself clears the key (I-C) and this test cannot tell the two
    // clears apart — measured: with the sign-out clear deleted, that
    // version stayed green.
    localStorage.setItem("ergomatic.concept2Seen.u2", "1");
    c2Link.body = { available: true, linked: false };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const onSignedOut = vi.fn();
    const first = render(
      <MemoryRouter>
        <You user={user} onSignedOut={onSignedOut} />
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: /CONCEPT2/ });
    await waitFor(() =>
      expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBe("1"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
    expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBeNull();
    // Another account's fact on the same device is not this sign-out's to
    // clear (I-A keeps them apart; I-D clears the one signing out).
    expect(localStorage.getItem("ergomatic.concept2Seen.u2")).toBe("1");

    // THE SEAM, not just the write (RF24): a fresh mount for the SAME
    // account whose read now fails must draw nothing (cell 2a) rather than
    // inheriting the door the pre-sign-out mint would have given it. The
    // signed-out You is unmounted first — the app does the same (App.tsx
    // swaps to SignIn) — so the row found below can only be the new mount's.
    first.unmount();
    c2Link.body = { error: "upstream" };
    c2Link.status = 502;
    vi.mocked(api).mockClear();
    render(
      <MemoryRouter>
        <You user={user} onSignedOut={() => {}} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link", { name: /CONCEPT2/ })).toBeNull();
  });
});
