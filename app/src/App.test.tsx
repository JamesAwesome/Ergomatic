import { render, screen, waitFor } from "@testing-library/react";
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

  it("surfaces a retry notice from ?error=signin_failed", async () => {
    window.history.replaceState(null, "", "/?error=signin_failed");
    mockMe(401);
    render(<App />);
    expect(await screen.findByText(/didn't work/i)).toBeInTheDocument();
  });
});
