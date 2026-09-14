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
});
