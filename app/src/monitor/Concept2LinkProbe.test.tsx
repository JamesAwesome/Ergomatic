import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Wave E PR1.75b: this component IS the dist-grep-gated dev harness card
// (`docs/superpowers/plans/2026-09-02-concept2-pr175b-walk.md` carries the
// on-device walk; neither the walk nor the RF12 build-with/without-the-flag
// red proof is a unit-test concern). Its three jobs: it still carries the
// dist-grep needle, the button reaches `startLink`, and every outcome the
// walk has to READ reaches the screen -- including whether the callback
// carried `state`, which is one of the two measurements the walk owes
// (design exit criterion 4).

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../adapters/linkFlow");
  vi.doUnmock("../api");
});

// `_path` is DECLARED but unused, and both halves of that are load-bearing.
// Declared: `vi.fn(async () => …)` types the mock's calls as `[]`, so the
// re-read test's `api.mock.calls.filter((c) => c[0] === "/api/concept2/link")`
// fails `TS2493: Tuple type '[]' of length '0' has no element at index '0'`
// (measured 2026-09-02 by placing this block at its real path and running
// `pnpm typecheck`). Underscore-prefixed: unprefixed, it fails
// `noUnusedParameters` and `@typescript-eslint/no-unused-vars`.
function mockLink(status: unknown, startLink = vi.fn()) {
  const api = vi.fn(
    async (_path: string) =>
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.doMock("../api", () => ({ api }));
  vi.doMock("../adapters/linkFlow", () => ({ startLink }));
  return { api, startLink };
}

describe("Concept2LinkProbe", () => {
  it("carries the dist-grep needle as a data attribute", async () => {
    mockLink({ available: true, linked: false });
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(document.querySelector("[data-c2-link-probe]")).toHaveAttribute(
      "data-c2-link-probe",
      "C2 link probe (dev harness)",
    );
  });

  it("reads the link status on mount and distinguishes a flag-off server from an unlinked account", async () => {
    mockLink({ available: false });
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(
      await screen.findByText(/Link status: not available/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not linked/i)).not.toBeInTheDocument();
  });

  it("shows the linked account when the server says linked", async () => {
    mockLink({
      available: true,
      linked: true,
      weightClass: "H",
      c2UserId: 2211,
    });
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(await screen.findByText(/Link status: linked/i)).toBeInTheDocument();
    expect(screen.getByText(/2211/)).toBeInTheDocument();
  });

  it("says the status is UNREADABLE when the MOUNT read throws, instead of a perpetual `reading...` line", async () => {
    // The walk runs over a cloudflared quick tunnel; a dropped request is a
    // normal event there, and the failure mode this guards is an operator
    // reading a status line that describes a moment before the request that
    // never answered.
    const api = vi.fn(() => Promise.reject(new Error("Load failed")));
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(
      await screen.findByText(
        /Link status: unreadable \(the request failed\)/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/reading\.\.\./i)).not.toBeInTheDocument();
  });

  it("flips a GOOD status line to unreadable when a RE-READ throws, instead of leaving the stale line", async () => {
    // The mount test above can only ever reach the `status === null` state, so
    // it cannot tell a correct check order from a swapped one. This is the
    // STALE half of the same guard: the first read succeeded, so `status` is
    // non-null, and a swapped order would fall straight through to `not
    // linked` -- an operator reading a server state that stopped being true one
    // failed request ago. Reached through the button, which is the only path a
    // walk operator has.
    const api = vi
      .fn<(path: string) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ available: true, linked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValue(new Error("Load failed"));
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(
      screen.getByRole("button", { name: /re-read link status/i }),
    );

    expect(
      await screen.findByText(
        /Link status: unreadable \(the request failed\)/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Link status: not linked/i),
    ).not.toBeInTheDocument();
  });

  it("tapping Start real link calls startLink with weight class H (the card offers no selector)", async () => {
    const startLink = vi.fn(async () => ({ kind: "cancelled" }) as const);
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(
      screen.getByRole("button", { name: /start real link/i }),
    );

    expect(startLink).toHaveBeenCalledExactlyOnceWith({ weightClass: "H" });
  });

  it("reports a successful link AND whether the callback carried state (the walk's own measurement)", async () => {
    const startLink = vi.fn(
      async () =>
        ({
          kind: "linked",
          c2UserId: 2211,
          weightClass: "H",
          stateEchoed: false,
        }) as const,
    );
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(
      screen.getByRole("button", { name: /start real link/i }),
    );

    expect(
      await screen.findByText(/Last outcome: linked/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Callback carried state: no/i)).toBeInTheDocument();
  });

  it("shows `yes` when the callback DID carry state", async () => {
    const startLink = vi.fn(
      async () => ({ kind: "declined", stateEchoed: true }) as const,
    );
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(
      screen.getByRole("button", { name: /start real link/i }),
    );

    expect(
      await screen.findByText(/Last outcome: declined/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Callback carried state: yes/i),
    ).toBeInTheDocument();
  });

  it("shows `n/a` for an outcome that never parsed a callback", async () => {
    const startLink = vi.fn(async () => ({ kind: "cancelled" }) as const);
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(
      screen.getByRole("button", { name: /start real link/i }),
    );

    expect(
      await screen.findByText(/Last outcome: cancelled/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Callback carried state: n\/a/i),
    ).toBeInTheDocument();
  });

  it("re-reads the link status after a successful link, so the card cannot claim linked while the server disagrees", async () => {
    const startLink = vi.fn(
      async () =>
        ({
          kind: "linked",
          c2UserId: 2211,
          weightClass: "H",
          stateEchoed: true,
        }) as const,
    );
    const { api } = mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(
      screen.getByRole("button", { name: /start real link/i }),
    );

    await waitFor(() => {
      expect(
        api.mock.calls.filter((c) => c[0] === "/api/concept2/link"),
      ).toHaveLength(2);
    });
  });

  it("disables the button while a link is in flight", async () => {
    let release: (o: { kind: "cancelled" }) => void = () => undefined;
    const startLink = vi.fn(
      () =>
        new Promise<{ kind: "cancelled" }>((resolve) => {
          release = resolve;
        }),
    );
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    const button = screen.getByRole("button", { name: /start real link/i });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    release({ kind: "cancelled" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(startLink).toHaveBeenCalledOnce();
  });
});
