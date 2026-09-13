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
// `api()` does. That is not tidiness: this file's BASELINES-row test stubs
// `fetch` and answers `/api/baselines` through it, so a factory that
// answered everything itself would silently break it (the row's read would
// never resolve and its state line would never render). The baseline-reset
// test this note used to cite moved to `you/BaselinesScreen.test.tsx` with
// the editor it drives.
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

  // Phase PS PR 1 (career-stats spec §7 invariant 16, §14 ruling 10): the
  // hero IS the door and the ONLY door — one link named Stats on the whole
  // screen, and `.you-doors` gains no STATS row. The hero's own test cannot
  // see this file, so the `.you-doors` half lives here.
  it("renders exactly one link named Stats and no STATS door", async () => {
    renderYou(user);
    expect(await screen.findAllByRole("link", { name: "Stats" })).toHaveLength(
      1,
    );
    const doors = document.querySelector(".you-doors");
    expect(doors).not.toBeNull();
    const doorTexts = Array.from(doors!.children, (c) => c.textContent ?? "");
    expect(doorTexts.length).toBeGreaterThan(0);
    expect(doorTexts.some((t) => t.includes("STATS"))).toBe(false);
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

  // AUD-014. The DANGEROUS state was never reachable — `onSignedOut` runs
  // after the await, so a rejection already left the app signed in. These
  // pin the half that WAS missing: that the rower is told.
  it("says the sign-out failed, and does NOT sign the rower out, when the adapter rejects", async () => {
    const onSignedOut = vi.fn();
    const authSignOut = vi.fn(() => Promise.reject(new Error("keychain")));
    vi.doMock("./adapters/auth", () => ({ signOut: authSignOut }));
    const { default: AdapterYou } = await import("./You");
    render(
      <MemoryRouter>
        <AdapterYou user={user} onSignedOut={onSignedOut} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/that sign-out didn't work/i);
    expect(alert).toHaveTextContent(/still signed in/i);
    // The whole point: a failure must not look like a success.
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("says nothing on a sign-out that works, and still signs the rower out", async () => {
    const onSignedOut = vi.fn();
    const authSignOut = vi.fn(() => Promise.resolve());
    vi.doMock("./adapters/auth", () => ({ signOut: authSignOut }));
    const { default: AdapterYou } = await import("./You");
    render(
      <MemoryRouter>
        <AdapterYou user={user} onSignedOut={onSignedOut} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears a previous failure when the rower tries again and it works", async () => {
    const onSignedOut = vi.fn();
    const authSignOut = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("keychain"))
      .mockResolvedValueOnce(undefined);
    vi.doMock("./adapters/auth", () => ({ signOut: authSignOut }));
    const { default: AdapterYou } = await import("./You");
    render(
      <MemoryRouter>
        <AdapterYou user={user} onSignedOut={onSignedOut} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole("button", { name: /sign out/i });
    await userEvent.click(btn);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(btn);
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
    // A stale failure left standing after a success would be its own lie.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // The baseline editor, the re-test shortcut and Reset baseline setup all
  // left You for `/you/baselines` (Gate 0, 2026-09-05). Their wiring — the
  // reset's remount of the editor included — is pinned in
  // `you/BaselinesScreen.test.tsx` now; what You owes is the ROW.
  it("carries a BASELINES row into the doors group, with the numbers on it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/baselines"
          ? new Response(JSON.stringify({ k2Seconds: 112.3, k6Seconds: 125 }), {
              status: 200,
            })
          : new Response(JSON.stringify([]), { status: 200 }),
      ),
    );
    renderYou(user);
    const row = await screen.findByRole("link", { name: /BASELINES/ });
    expect(row).toHaveAttribute("href", "/you/baselines");
    expect(screen.getByText("2K 1:52.3 · 6K 2:05.0")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "More" })).toContainElement(
      row,
    );
  });

  it("no longer renders the editor, the shortcut or the reset on You itself", async () => {
    renderYou(user);
    // A positive observable first: the row the editor's controls were
    // replaced BY, so this absence is read off a settled screen.
    await screen.findByRole("link", { name: /BASELINES/ });
    expect(screen.queryByRole("textbox", { name: "2k split" })).toBeNull();
    expect(screen.queryByRole("link", { name: "RACE THE 2K" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Reset baseline setup/i }),
    ).toBeNull();
  });

  // Task 3 (Gate 0 rev 2/3): the quiet DIAGNOSTICS row at the bottom of
  // You, navigating to the menu screen — not Monitor logs directly.
  it("carries a DIAGNOSTICS row navigating to /you/diagnostics", () => {
    renderYou(user);
    const row = screen.getByRole("link", { name: "DIAGNOSTICS" });
    expect(row).toHaveAttribute("href", "/you/diagnostics");
  });

  // Phase JC (Gate 0 ruling 3): the SETTINGS door — the judged-colour
  // slots. It renders on every account, unlike CONCEPT2, so this case
  // does not need an available:true read; the four-row ORDER is pinned in
  // the Concept2 describe below, where the third row exists.
  it("carries a SETTINGS row navigating to /you/settings, inside the doors group", () => {
    renderYou(user);
    const row = screen.getByRole("link", { name: "SETTINGS" });
    expect(row).toHaveAttribute("href", "/you/settings");
    expect(screen.getByRole("navigation", { name: "More" })).toContainElement(
      row,
    );
  });
});

describe("You: the Concept2 row (Wave E PR A, spec §5.1)", () => {
  const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };

  it("renders all four doors in the ruled order, inside one group (R7, ruling 7; Phase JC Gate 0 ruling 3)", async () => {
    // DOCUMENT ORDER, not presence: ruling 7 puts CONCEPT2 above
    // DIAGNOSTICS and keeps DIAGNOSTICS You's last child, and Phase JC's
    // Gate 0 ruling 3 (James, 2026-09-08: "put settings under concept 2 but
    // above diagnostics") fixes SETTINGS between them. Presence alone would
    // pass any of the 24 permutations.
    c2Link.body = { available: true, linked: false };
    renderYou(user);
    const row = await screen.findByRole("link", { name: /CONCEPT2/ });
    const diagnostics = screen.getByRole("link", { name: /DIAGNOSTICS/ });
    const baselines = screen.getByRole("link", { name: /BASELINES/ });
    const settings = screen.getByRole("link", { name: "SETTINGS" });
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    // BASELINES, then CONCEPT2, then SETTINGS, then DIAGNOSTICS.
    expect(baselines.compareDocumentPosition(row) & following).toBeTruthy();
    expect(row.compareDocumentPosition(settings) & following).toBeTruthy();
    expect(
      settings.compareDocumentPosition(diagnostics) & following,
    ).toBeTruthy();
    const group = screen.getByRole("navigation", { name: "More" });
    expect(group).toContainElement(row);
    expect(group).toContainElement(settings);
    expect(group).toContainElement(diagnostics);
    expect(settings).toHaveAttribute("href", "/you/settings");
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
