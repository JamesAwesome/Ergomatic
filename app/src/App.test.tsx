import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";
import App from "./App";

function mockMe(status: number, body?: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body ?? {}), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("App", () => {
  it("shows the sign-in screen when signed out", async () => {
    mockMe(401);
    render(<App />);
    expect(
      await screen.findByRole("link", { name: /continue with google/i }),
    ).toBeInTheDocument();
  });

  it("shows the shell + You when signed in", async () => {
    window.history.replaceState(null, "", "/you");
    mockMe(200, { user: { id: "u1", email: "a@x.com", name: "Ada Rower" } });
    render(<App />);
    expect(await screen.findByText("Ada Rower")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "YOU" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("surfaces the denied notice from ?denied=", async () => {
    window.history.replaceState(null, "", "/?denied=b%40y.com");
    mockMe(401);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/b@y\.com/)).toBeInTheDocument();
      expect(screen.getByText(/isn't invited/i)).toBeInTheDocument();
    });
  });

  it("claims scroll restoration from the browser on mount (device report: iOS Safari re-scrolled the reader after our scroll-to-top)", async () => {
    window.history.scrollRestoration = "auto";
    mockMe(200, { user: { id: "u1", email: "a@x.com", name: "Ada Rower" } });
    render(<App />);
    await screen.findByRole("link", { name: "TODAY" });
    expect(window.history.scrollRestoration).toBe("manual");
  });

  it("surfaces a retry notice from ?error=signin_failed", async () => {
    window.history.replaceState(null, "", "/?error=signin_failed");
    mockMe(401);
    render(<App />);
    expect(await screen.findByText(/didn't work/i)).toBeInTheDocument();
  });
  // THE WHOLE WEB DELETE RETURN, from the URL the callback lands on to the
  // screen the rower reads: the return-parameter reader, `destinationFor`,
  // App's navigation effect and the route's own view guard, in one test.
  // `/api/me` is deferred so the attempt read always wins the race the two
  // of them run on every OAuth return.
  //
  // THE MIDDLE ASSERTION IS THE POINT. The END state is identical with and
  // without App's `me.state === "loading"` guard, because jsdom's router
  // picks the pushed location up either way — asserting only the screen
  // gates nothing about WHEN the URL moved. So this pins the moment
  // between: the attempt read has resolved, `me` has not, and the route
  // tree that owns the URL is therefore unmounted. Nothing may write the
  // URL there, because `AppRoutes`'s own root redirect will replace
  // whatever it finds when it mounts.
  it("resumes a web delete return into the confirm screen, and not before the route tree exists", async () => {
    window.history.replaceState(null, "", "/?authAttempt=del-app");
    let resolveMe!: (response: Response) => void;
    let attemptAnswered!: () => void;
    const attemptRead = new Promise<void>((resolve) => {
      attemptAnswered = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/me")) {
          return new Promise<Response>((resolve) => {
            resolveMe = resolve;
          });
        }
        if (url.includes("/api/auth/options")) {
          return new Response(
            JSON.stringify({
              frontDoorEnabled: true,
              apple: { native: true, web: true },
              google: { native: true, web: true },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/auth/web/attempts/del-app")) {
          const answer = new Response(
            JSON.stringify({
              outcome: "delete_ready",
              attemptId: "del-app",
              purpose: "delete",
              targetProvider: "apple",
              expiresAt: "2026-09-14T00:05:00.000Z",
            }),
            { status: 200 },
          );
          attemptAnswered();
          return answer;
        }
        return new Response(JSON.stringify({}), { status: 404 });
      }),
    );
    render(<App />);
    await waitFor(() => expect(resolveMe).toBeDefined());
    await attemptRead;
    // Everything the attempt read sets off — the json parse, `acceptStep`,
    // the view commit and the navigation effect — has run by here.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The route tree is not mounted yet. Nothing may move the URL.
    expect(window.location.pathname).toBe("/");

    resolveMe(
      new Response(
        JSON.stringify({ user: { id: "u1", email: "a@x.com", name: "Ada" } }),
        { status: 200 },
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Delete this account?" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/you/sign-in-methods");
  });

  // AND A SIGNED-OUT TREE NEVER MOVES THE URL. This is the native rower's
  // whole confirmation: `onSignedIn` is withheld until they choose, so `me`
  // stays out, `SignIn` draws the screen itself and the route tree does not
  // exist. `destinationFor(attach_confirm)` still says
  // `/you/sign-in-methods` — it has to, for the web frame — and writing that
  // path here would leave a location under a tree that owns no routes.
  //
  // THE SURFACE IS SIMULATED, AND THAT IS THE LAYER THIS TEST WORKS AT: it
  // reaches the view through the web return because that is the producer
  // available in jsdom, and holds `me` OUT to put the app in the tree the
  // native rower is actually in. It gates App's effect, not the native
  // transport.
  it("holds the auth destination while the rower is signed out", async () => {
    window.history.replaceState(null, "", "/?authAttempt=att-2");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/me"))
          return new Response(JSON.stringify({}), { status: 401 });
        if (url.includes("/api/auth/options"))
          return new Response(
            JSON.stringify({
              frontDoorEnabled: true,
              apple: { native: true, web: true },
              google: { native: true, web: true },
            }),
            { status: 200 },
          );
        if (url.endsWith("/api/auth/web/attempts/att-2"))
          return new Response(
            JSON.stringify({
              outcome: "link_ready",
              attemptId: "att-2",
              purpose: "signin",
              targetProvider: "apple",
              expiresAt: "2026-09-15T00:05:00.000Z",
              profile: {
                email: "9m3x@privaterelay.appleid.com",
                name: "Rower",
              },
              session: {
                outcome: "signed_in",
                user: {
                  id: "u1",
                  email: "maya@example.com",
                  name: "Maya Chen",
                },
                expiresAt: "2026-11-14T00:00:00.000Z",
              },
            }),
            { status: 200 },
          );
        return new Response(JSON.stringify({}), { status: 404 });
      }),
    );
    render(<App />);
    // The screen is on — drawn by `SignIn`, which needs no route at all.
    expect(
      await screen.findByRole("heading", {
        name: "Attach Apple to this account?",
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  // WAVE A PR2: THE WHOLE WEB ATTACH RETURN, AND THE LANDING IS THE POINT.
  // James ruled the rower ends on Today, signed in, with no notice
  // (Gate 0, 2026-09-15) — and that ruling has already been reversed once as
  // a SIDE EFFECT of giving the confirmation a frame: the view went `idle`,
  // `destinationFor(idle)` is `null`, nothing navigated, and the route's own
  // fallback left them on `/you`.
  //
  // NOTHING BELOW THIS LAYER CAN SEE THAT. The view tests assert `attached`
  // and `destinationFor` asserts "/", and both stayed true the whole time
  // the rower was being put on a settings subpage — a destination is an
  // intention, and only App's navigation effect plus the route tree turn it
  // into a location. The sibling delete flow has had this test since PR1;
  // the flow whose regression WAS a landing did not.
  it("lands a web attach on Today, signed in, when the rower attaches", async () => {
    window.history.replaceState(null, "", "/?authAttempt=att-1");
    const user = { id: "u1", email: "maya@example.com", name: "Maya Chen" };
    const finalized = vi.fn();
    let finalizeMethod: string | undefined;
    let release!: (response: Response) => void;
    const held = {
      promise: new Promise<Response>((resolve) => {
        release = resolve;
      }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // THE COOKIE IS ALREADY SET when this document loads: the web
        // callback sets it before its 303, which is why `me` resolves IN
        // while the attempt is still open and why `AppRoutes` — not
        // `SignIn` — is the tree that has to hold the confirmation.
        if (url.includes("/api/me"))
          return new Response(JSON.stringify({ user }), { status: 200 });
        if (url.includes("/api/auth/options"))
          return new Response(
            JSON.stringify({
              frontDoorEnabled: true,
              apple: { native: true, web: true },
              google: { native: true, web: true },
            }),
            { status: 200 },
          );
        if (url.endsWith("/api/auth/web/attempts/att-1"))
          return new Response(
            JSON.stringify({
              outcome: "link_ready",
              attemptId: "att-1",
              purpose: "signin",
              targetProvider: "apple",
              expiresAt: "2026-09-15T00:05:00.000Z",
              profile: {
                email: "9m3x@privaterelay.appleid.com",
                name: "Rower",
              },
              session: {
                outcome: "signed_in",
                user,
                expiresAt: "2026-11-14T00:00:00.000Z",
              },
            }),
            { status: 200 },
          );
        if (url.endsWith("/api/auth/web/attempts/att-1/finalize")) {
          finalized();
          finalizeMethod = init?.method;
          // HELD, so the in-flight screen is observable rather than raced
          // past. Released at the bottom of the test.
          return held.promise;
        }
        return new Response(JSON.stringify({}), { status: 404 });
      }),
    );
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name: "Attach Apple to this account?",
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/you/sign-in-methods");

    await userEvent.click(screen.getByRole("button", { name: "Attach Apple" }));
    expect(finalized).toHaveBeenCalledOnce();
    expect(finalizeMethod).toBe("POST");

    // THE IN-FLIGHT SCREEN, FROM THE REAL PRODUCER. The view-layer tests
    // assert that `busy` CARRIES the identities; the screen tests assert
    // that a hand-built one DRAWS them. Neither watches the join, which is
    // where this defect lived three times: the payload the server's own
    // `link_ready` produced has to reach the rendered screen and survive the
    // flip to `busy`. Both controls inert, both identities still named.
    expect(screen.getByRole("button", { name: "Attach Apple" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
    expect(
      screen.getByText("9m3x@privaterelay.appleid.com"),
    ).toBeInTheDocument();
    expect(screen.getByText("maya@example.com")).toBeInTheDocument();

    await act(async () => {
      release(
        new Response(JSON.stringify({ outcome: "linked" }), { status: 200 }),
      );
    });
    expect(
      await screen.findByRole("heading", { name: "Today" }),
    ).toBeInTheDocument();
    // THE LANDING ITSELF. `/you` here is the regression this test exists for.
    await waitFor(() => expect(window.location.pathname).toBe("/today"));
    // AND NO NOTICE — the other half of the ruling. `attached` draws nothing;
    // if it ever grows copy, the rower is told about a settings change they
    // just made on screen.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
