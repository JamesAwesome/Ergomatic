import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import You from "./You";

// Fix round 2 (P1a-device): same idiom `AppRoutes.test.tsx` already uses
// for `JustRowObserver` — `import.meta.env.DEV` is `true` under Vitest, so
// You's own conditional `lazy()` import would otherwise really resolve
// this dev-only card in every test here. It has its own dedicated test
// file (`monitor/Concept2LinkProbe.test.tsx`); no test in this file cares
// about its content.
vi.mock("./monitor/Concept2LinkProbe", () => ({ default: () => null }));

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
