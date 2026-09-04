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
  // The composed test at the bottom of this file is the only one that mocks
  // these two, and it is the only one that must NOT mock `../adapters/linkFlow`
  // -- it drives the real adapter. Both unmocks belong here rather than in that
  // test, so a future test added above it cannot inherit a native platform.
  vi.doUnmock("../platform");
  vi.doUnmock("../native/webAuth");
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

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

  it("says the link needs re-auth beside the account, rather than reading as a plain healthy link", async () => {
    mockLink({
      available: true,
      linked: true,
      c2UserId: 2211,
      needsReauth: true,
    });
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(
      await screen.findByText(
        /Link status: linked \(C2 user 2211, needs re-auth\)/i,
      ),
    ).toBeInTheDocument();
  });

  it("shows the linked account when the server says linked", async () => {
    mockLink({
      available: true,
      linked: true,
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

  it("tapping Start real link calls startLink with NO argument (ruling i: nothing about the rower travels to the mint)", async () => {
    const startLink = vi.fn(async () => ({ kind: "cancelled" }) as const);
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(
      screen.getByRole("button", { name: /start real link/i }),
    );

    expect(startLink).toHaveBeenCalledExactlyOnceWith();
  });

  it("reports a successful link AND whether the callback carried state (the walk's own measurement)", async () => {
    const startLink = vi.fn(
      async () =>
        ({
          kind: "linked",
          c2UserId: 2211,
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

  it("disables the RE-READ button too while a link is in flight, so a mid-flight read cannot race the one onStart already owes", async () => {
    let release: (o: { kind: "cancelled" }) => void = () => undefined;
    const startLink = vi.fn(
      () =>
        new Promise<{ kind: "cancelled" }>((resolve) => {
          release = resolve;
        }),
    );
    const { api } = mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    const reRead = screen.getByRole("button", { name: /re-read link status/i });
    await userEvent.click(
      screen.getByRole("button", { name: /start real link/i }),
    );
    await waitFor(() => expect(reRead).toBeDisabled());
    // The invariant, not just the label: a tap while disabled reaches no
    // request, so the mount read is still the only `/link` call so far.
    await userEvent.click(reRead);
    expect(
      api.mock.calls.filter((c) => c[0] === "/api/concept2/link"),
    ).toHaveLength(1);

    release({ kind: "cancelled" });
    await waitFor(() => expect(reRead).toBeEnabled());
  });

  it("shows a plugin rejection's code AND message, which reach no server log at all", async () => {
    // A plugin rejection is raised inside the Swift, BEFORE any request leaves
    // the phone: no `auth_via` line, no network capture, nothing in the dev
    // server's log. `Last outcome: pluginError` on its own would tell a walk
    // operator that something failed and nothing about what.
    const startLink = vi.fn(
      async () =>
        ({
          kind: "pluginError",
          code: "cannotStart",
          message: "the session refused to start",
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

    const line = await screen.findByText(/Last outcome: pluginError/i);
    expect(line).toHaveTextContent("cannotStart");
    expect(line).toHaveTextContent("the session refused to start");
  });

  it("shows a server hop's status AND its error string when the body carried one", async () => {
    const startLink = vi.fn(
      async () =>
        ({
          kind: "exchangeFailed",
          status: 502,
          error: "c2_error",
          stateEchoed: true,
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

    const line = await screen.findByText(/Last outcome: exchangeFailed/i);
    expect(line).toHaveTextContent("502");
    expect(line).toHaveTextContent("c2_error");
  });

  it("renders a BARE status for the two server-hop outcomes that carry no error string, never `: null` or `: undefined`", async () => {
    // `serverError` has no `error` field at all; `mintFailed`'s may be `null`
    // (a mint answered by an old image's HTML mid-deploy). The walk operator
    // reads this line to tell "Concept2 refused us" from "our own server is
    // mid-deploy", and a trailing `: null` would read as a third thing.
    const startLink = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "serverError",
        status: 502,
        stateEchoed: true,
      })
      .mockResolvedValue({ kind: "mintFailed", status: 503, error: null });
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);
    const button = screen.getByRole("button", { name: /start real link/i });

    await userEvent.click(button);
    const first = await screen.findByText(/Last outcome: serverError/i);
    expect(first).toHaveTextContent("502");
    expect(first).not.toHaveTextContent("null");
    expect(first).not.toHaveTextContent("undefined");

    await userEvent.click(button);
    const second = await screen.findByText(/Last outcome: mintFailed/i);
    expect(second).toHaveTextContent("503");
    expect(second).not.toHaveTextContent("null");
  });

  it("shows a networkError's message, which is the only description a dropped request has", async () => {
    const startLink = vi.fn(
      async () => ({ kind: "networkError", message: "Load failed" }) as const,
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
      await screen.findByText(/Last outcome: networkError \(Load failed\)/i),
    ).toBeInTheDocument();
  });

  it("reports `yes` for a stateMismatch, the one parsed-callback outcome carrying no stateEchoed field", async () => {
    // `stateMismatch` is only reachable when a state WAS echoed -- an absent
    // one cannot mismatch -- so `n/a` here would tell the walk no callback was
    // parsed about the outcome that proves one was.
    const startLink = vi.fn(async () => ({ kind: "stateMismatch" }) as const);
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(
      screen.getByRole("button", { name: /start real link/i }),
    );

    expect(
      await screen.findByText(/Last outcome: stateMismatch/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Callback carried state: yes/i),
    ).toBeInTheDocument();
  });

  it("drives a whole native link through the REAL startLink: mint, plugin callback, exchange, and the re-read that follows", async () => {
    // RF24. Every other test in this file mocks `../adapters/linkFlow` and
    // hands the card a pre-baked outcome, so all of them start DOWNSTREAM of
    // the producer: the card and the adapter are each well tested and the seam
    // between them is gated by nothing. This is the one test that begins before
    // `startLink` runs and asserts after the card has rendered its result --
    // the mocks sit at the platform boundary (`../platform`,
    // `../native/webAuth`, `../api`), mirroring `linkFlow.test.ts`'s own idiom,
    // so the real adapter runs in between.
    vi.doMock("../platform", () => ({ isNative: () => true }));
    vi.doMock("../native/webAuth", () => ({
      WebAuth: {
        start: vi.fn(async () => ({
          callbackUrl:
            "haus.waffle.ergomatic://oauth/callback?code=CODE9&state=abc",
        })),
      },
    }));
    // `/link` answers `not linked` FIRST and `linked` afterwards, so the final
    // `Link status` assertion is a consequence of the flow rather than
    // something the mount read already put on screen. A card that never
    // re-read would still be showing `not linked` here.
    let linkReads = 0;
    const api = vi.fn(async (path: string) => {
      if (path === "/api/concept2/connect")
        return jsonResponse({
          authorizeUrl:
            "https://log-dev.concept2.com/oauth/authorize?client_id=1&state=abc",
          state: "abc",
        });
      if (path === "/api/concept2/exchange")
        return jsonResponse({ linked: true, c2UserId: 2211 });
      if (path === "/api/concept2/link") {
        linkReads += 1;
        return linkReads === 1
          ? jsonResponse({ available: true, linked: false })
          : jsonResponse({
              available: true,
              linked: true,
              c2UserId: 2211,
              needsReauth: false,
            });
      }
      throw new Error(`unexpected api path ${path}`);
    });
    vi.doMock("../api", () => ({ api }));
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
    expect(
      screen.getByText(/Callback carried state: yes/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/Link status: linked \(C2 user 2211\)/i),
      ).toBeInTheDocument();
    });
  });
});
