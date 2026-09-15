// THE NATIVE ATTACH, FROM THE REAL PRODUCER TO THE SCREEN THE ROWER ENDS ON.
//
// WHY THIS FILE EXISTS. Five of this PR's seven defects lived on the native
// surface, and every one of them was a LANDING: the rower ending on `/you`,
// or the confirmation vanishing mid-request. Each was fixed and re-broken,
// and each time the tests that should have seen it were watching one layer
// too low — a `renderHook` asserting `destination === "/"` proves an
// INTENTION, and the intention stayed true the whole time the rower was
// being put on a settings subpage. Nothing in the repo joined the real
// native producer to a real location.
//
// WHAT IS REAL HERE AND WHAT IS NOT. Real: `useAuthFlow`'s native path, the
// server's own step fixtures, `useMe`, `App`'s navigation effect and its
// ref, `AppRoutes`, the router, and You's own Sign out button. Doubled: only
// the four Capacitor seams a jsdom process cannot have — `isNative`, the
// token store, and the two provider plugins. That split is the point: the
// deciding sources are all production code.
//
// THE THIRD CASE IS THE ONE THAT CANNOT BE FAKED. It attaches, signs out
// through the real control, and attaches AGAIN in the same document, which
// is native's whole lifecycle — no reload between the two. Both of this
// round's defects are reachable only there: consuming the destination on
// sign-out reds case 1, and returning bare reds case 3.

import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({
  token: null as string | null,
  navs: [] as string[],
}));

vi.mock("./platform", () => ({ isNative: () => true }));
vi.mock("./native/session", () => ({
  getStoredToken: async () => seam.token,
  storeToken: async (t: string) => {
    seam.token = t;
  },
  clearToken: async () => {
    seam.token = null;
  },
}));
vi.mock("./native/appleAuth", () => ({
  AppleAuth: {
    authorize: async () => ({ idToken: "apple-id-token" }),
  },
}));
// THE KEYBOARD SEAM, AND IT IS NOT OPTIONAL BOOKKEEPING. `isNative()` being
// true turns on every other native arm too, and the shell's keyboard
// subscription then reaches the real `@capacitor/keyboard`, which rejects
// with "not implemented on web". The tests still PASS — the rejection is
// unhandled rather than thrown — and vitest fails the JOB with
// `Errors 8 errors`, which is the green-list-red-job shape this PR already
// fixed once in `attempts.integration.test.ts`. Caught by the pre-push hook,
// which runs the whole project where a scoped run had shown four passes.
vi.mock("./native/keyboard", () => ({
  nativeSetAccessoryBarVisible: async () => undefined,
  nativeSubscribeKeyboard: () => () => undefined,
}));
vi.mock("./native/signin", () => ({
  initNativeAuth: async () => undefined,
  nativeGoogleProofAfterInit: async () => ({ idToken: "google-id-token" }),
  nativeSignOut: async () => undefined,
}));

import App from "./App";

const user = { id: "u1", email: "maya@example.com", name: "Maya Chen" };

afterEach(() => {
  vi.unstubAllGlobals();
  seam.token = null;
  seam.navs = [];
  window.history.replaceState(null, "", "/");
});

function nativeAttachFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status });
    if (url.includes("/api/me")) {
      return seam.token ? json({ user }) : json({}, 401);
    }
    if (url.includes("/api/auth/options"))
      return json({
        frontDoorEnabled: true,
        apple: { native: true, web: true },
        google: { native: true, web: true },
      });
    if (url.endsWith("/api/auth/native/attempts"))
      return json({
        outcome: "confirm",
        attemptId: "nft",
        purpose: "signin",
        targetProvider: "apple",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: { email: "9m3x@privaterelay.appleid.com", name: "Rower" },
        bindingSecret: "binding",
      });
    if (url.endsWith("/api/auth/native/attempts/nft/follow-through"))
      return json({
        outcome: "authorize",
        attemptId: "nft",
        purpose: "signin",
        targetProvider: "apple",
        expiresAt: "2099-01-01T00:00:00.000Z",
        provider: "google",
        stage: "reauth",
        nonce: "n2",
        state: "s2",
      });
    if (url.endsWith("/api/auth/native/attempts/nft/proof"))
      return json({
        outcome: "link_ready",
        attemptId: "nft",
        purpose: "signin",
        targetProvider: "apple",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: { email: "9m3x@privaterelay.appleid.com", name: "Rower" },
        session: {
          outcome: "signed_in",
          user,
          expiresAt: "2099-01-01T00:00:00.000Z",
          token: "adopted-token",
        },
      });
    if (url.endsWith("/api/auth/native/attempts/nft/finalize"))
      return json({ outcome: "linked" });
    return json({}, 404);
  });
}

async function driveToAttachConfirm() {
  vi.stubGlobal("fetch", nativeAttachFetch());
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Continue with Apple" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "I already have an account" }),
  );
  expect(
    await screen.findByRole("heading", {
      name: "Attach Apple to this account?",
    }),
  ).toBeInTheDocument();
}

describe("the native attach, real producer to real landing", () => {
  // THE DOCUMENT IS STANDING SOMEWHERE ELSE, which is what makes the guard
  // matter at all. From `/` the root redirect would save the landing however
  // the guard behaved; from `/you` only the guard can.
  it("lands on Today from a document standing at /you", async () => {
    window.history.replaceState(null, "", "/you");
    await driveToAttachConfirm();
    // The signed-out tree never moved the URL.
    expect(window.location.pathname).toBe("/you");
    await userEvent.click(screen.getByRole("button", { name: "Attach Apple" }));
    expect(
      await screen.findByRole("heading", { name: "Today" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/today");
  });

  // The same flow from `/`, so a failure in the case above can be read as
  // "the guard", not "the flow".
  it("lands on Today from a document standing at /", async () => {
    window.history.replaceState(null, "", "/");
    await driveToAttachConfirm();
    expect(window.location.pathname).toBe("/");
    await userEvent.click(screen.getByRole("button", { name: "Attach Apple" }));
    expect(
      await screen.findByRole("heading", { name: "Today" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/today");
  });

  // NATIVE'S LIFECYCLE IN ONE TEST. The offer is DESIGNED to come back on
  // the next sign-in with the unattached provider, so a second attach in one
  // document is ordinary, not exotic — and it is the only case that can see
  // a ref carrying `/` from the previous session.
  it("REAL ROUND TRIP: attach, sign out, attach again, still lands on Today", async () => {
    window.history.replaceState(null, "", "/");
    await driveToAttachConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Attach Apple" }));
    expect(
      await screen.findByRole("heading", { name: "Today" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/today");

    // To You, and sign out through the real control.
    await userEvent.click(screen.getByRole("link", { name: "YOU" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Sign out" }),
    );
    expect(
      await screen.findByRole("button", { name: "Continue with Apple" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/you");

    // The second attach, same document, same ref.
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Apple" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "I already have an account" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Attach Apple" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Today" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/today");
  });

  // BOTH EXITS, because they share a terminal and the decline half had no
  // landing assertion at any layer.
  it("DECLINE: Not now from /you also lands on Today", async () => {
    window.history.replaceState(null, "", "/you");
    await driveToAttachConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(
      await screen.findByRole("heading", { name: "Today" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/today");
  });
});
