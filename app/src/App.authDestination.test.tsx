import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// APP'S NAVIGATION EFFECT, ISOLATED, BECAUSE THE BUG IS ITS BOOKKEEPING AND
// NOT ANY FLOW'S. `useMe` and `useAuthFlow` are doubled so this test can put
// the app through a signed-in → signed-out → signed-in round trip in ONE
// document, which is native's whole lifecycle and which no fetch-driven test
// here can stage. The DECIDING SOURCE is untouched: App's own effect, its
// `consumedAuthDestination` ref, and the real router.
const stub = vi.hoisted(() => ({
  me: { state: "in", user: { id: "u1", email: "a@x.com", name: "Ada" } } as
    | { state: "loading" }
    | { state: "out" }
    | { state: "in"; user: { id: string; email: string; name: string } },
  destination: null as string | null,
}));

vi.mock("./useMe", () => ({ useMe: () => [stub.me, vi.fn(), vi.fn()] }));
vi.mock("./adapters/authFlow", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    useAuthFlow: () => ({
      options: { state: "loading" },
      view: { kind: "idle" },
      targetAuthorizationBusy: false,
      destination: stub.destination,
      startSignIn: vi.fn(),
      confirmAccount: vi.fn(),
      useUsualSignIn: vi.fn(),
      confirmAttach: vi.fn(),
      declineAttach: vi.fn(),
      prepareLink: vi.fn(),
      startPreparedLink: vi.fn(),
      authorizeLinkTarget: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
      abandon: vi.fn(),
      removeMethod: vi.fn(),
      startDelete: vi.fn(),
      confirmDelete: vi.fn(),
    }),
  };
});

import App from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
  stub.me = { state: "in", user: { id: "u1", email: "a@x.com", name: "Ada" } };
  stub.destination = null;
  window.history.replaceState(null, "", "/");
});

async function settle(render: () => void) {
  await act(async () => {
    render();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("App's auth destination across a sign-out", () => {
  // THE SECOND ATTACH IN ONE APP LAUNCH, which is an ordinary thing to do:
  // "Not now" is designed to bring the offer back on the next sign-in with
  // the unattached provider, and on native there is no document reload
  // between the two.
  //
  // WHAT IT GATES IS A REF, NOT A FLOW. `consumedAuthDestination` holds the
  // last destination this effect acted on, so it can tell a new destination
  // from a re-render. If the signed-out runs return without touching it, it
  // survives the whole signed-out period carrying `/` — the value an attach
  // terminal writes — and the SECOND `attached` then matches it, takes the
  // early return, and leaves the rower wherever they were standing.
  it("lands a second attach on Today rather than on the You subpage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    window.history.replaceState(null, "", "/you");
    const { rerender } = render(<App />);

    // 1. The first attach terminal: `attached`, destination "/".
    stub.destination = "/";
    await settle(() => rerender(<App />));
    expect(window.location.pathname).toBe("/today");

    // 2. Sign out from You. `abandon()` and `onSignedOut()` are called in one
    //    handler, so the view resets and `me` goes out in a single commit.
    window.history.replaceState(null, "", "/you");
    stub.me = { state: "out" };
    stub.destination = null;
    await settle(() => rerender(<App />));

    // 3. Sign in again with the still-unattached provider and attach. Same
    //    destination as step 1, same document, same ref.
    stub.me = {
      state: "in",
      user: { id: "u1", email: "a@x.com", name: "Ada" },
    };
    stub.destination = "/";
    await settle(() => rerender(<App />));
    expect(window.location.pathname).toBe("/today");
  });

  // THE NATIVE ORDERING, WHICH IS THE OTHER HALF AND PULLS THE OPPOSITE WAY.
  // On native `confirmAttach` sets `attached` and calls `onSignedIn` in one
  // tick, so the destination is `/` a whole `/api/me` round trip before `me`
  // catches up — the rower is still on the sign-in tree when this effect
  // first sees it. The destination must SURVIVE that window and be acted on
  // when `me` returns.
  //
  // IT IS THE REASON THE SIGNED-OUT BRANCH FORGETS RATHER THAN CONSUMES, and
  // it is not hypothetical: the first draft of that fix consumed, which
  // marked this destination done while nobody could act on it and left the
  // rower on `/you` — the same missed landing as the test above, through the
  // opposite door. The two tests fail under opposite mutations, which is
  // what makes them a pair rather than a repetition.
  it("acts on a destination that arrived while the rower was still signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    window.history.replaceState(null, "", "/you");
    stub.me = { state: "out" };
    stub.destination = null;
    const { rerender } = render(<App />);

    // `attached`, with the session read still in flight.
    stub.destination = "/";
    await settle(() => rerender(<App />));

    // `/api/me` answers.
    stub.me = {
      state: "in",
      user: { id: "u1", email: "a@x.com", name: "Ada" },
    };
    await settle(() => rerender(<App />));
    expect(window.location.pathname).toBe("/today");
  });
});
