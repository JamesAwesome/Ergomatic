import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthFlowController, AuthFlowView } from "../adapters/authFlow";
import { api } from "../api";
import SignInMethods from "./SignInMethods";

vi.mock("../api", () => ({ api: vi.fn() }));

beforeEach(() => {
  vi.mocked(api).mockReset();
});

function controller(view: AuthFlowView): AuthFlowController {
  return {
    options: {
      state: "ready",
      frontDoorEnabled: true,
      legacyGoogle: false,
      apple: true,
      google: true,
    },
    view,
    targetAuthorizationBusy: false,
    destination: null,
    startSignIn: vi.fn(),
    confirmAccount: vi.fn(),
    useUsualSignIn: vi.fn(),
    prepareLink: vi.fn(),
    startPreparedLink: vi.fn(),
    authorizeLinkTarget: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    abandon: vi.fn(),
    removeMethod: vi.fn(),
    startDelete: vi.fn(),
    confirmDelete: vi.fn(),
  };
}

/** Both providers connected — the only shape in which Remove is offered at
 *  all, so every removal test starts from it rather than from a hand-built
 *  minimum that cannot reach the control. */
function bothConnected() {
  vi.mocked(api).mockImplementation(
    async () =>
      new Response(JSON.stringify({ apple: true, google: true }), {
        status: 200,
      }),
  );
}

describe("SignInMethods", () => {
  it("renders Apple first, connected state, and the available add action", async () => {
    vi.mocked(api).mockResolvedValue(
      new Response(JSON.stringify({ apple: false, google: true }), {
        status: 200,
      }),
    );
    const auth = controller({ kind: "idle" });
    const { container } = render(<SignInMethods auth={auth} />);
    await screen.findByText("CONNECTED");
    expect(
      Array.from(
        container.querySelectorAll(".auth-method-name"),
        (node) => node.textContent,
      ),
    ).toStrictEqual(["Apple", "Google"]);
    await userEvent.click(screen.getByRole("button", { name: "Add Apple" }));
    expect(auth.prepareLink).toHaveBeenCalledWith("apple");
  });

  it.each([
    ["apple", false, true],
    ["google", true, false],
  ] as const)(
    "keeps disconnected %s visible but disables Add unless both proofs are available",
    async (provider, apple, google) => {
      vi.mocked(api).mockResolvedValue(
        new Response(
          JSON.stringify({
            apple: provider === "apple" ? false : true,
            google: provider === "google" ? false : true,
          }),
          { status: 200 },
        ),
      );
      const auth = controller({ kind: "idle" });
      auth.options = {
        state: "ready",
        frontDoorEnabled: true,
        legacyGoogle: false,
        apple,
        google,
      };
      render(<SignInMethods auth={auth} />);
      const add = await screen.findByRole("button", {
        name: `Add ${provider === "apple" ? "Apple" : "Google"}`,
      });
      expect(add).toBeDisabled();
      await userEvent.click(add);
      expect(auth.prepareLink).not.toHaveBeenCalled();
      expect(screen.getByText("CONNECTED")).toBeVisible();
    },
  );

  it("disables link retry when either required proof is unavailable", async () => {
    vi.mocked(api).mockResolvedValue(
      new Response(JSON.stringify({ apple: false, google: true }), {
        status: 200,
      }),
    );
    const auth = controller({
      kind: "error",
      purpose: "link",
      code: "account_changed",
      targetProvider: "apple",
    });
    auth.options = {
      state: "ready",
      frontDoorEnabled: true,
      legacyGoogle: false,
      apple: false,
      google: true,
    };
    render(<SignInMethods auth={auth} />);
    const retry = await screen.findByRole("button", {
      name: "Start linking again",
    });
    expect(retry).toBeDisabled();
    await userEvent.click(retry);
    expect(auth.prepareLink).not.toHaveBeenCalled();
  });

  it("shows exact terminal link notices and refreshes methods after success", async () => {
    vi.mocked(api).mockImplementation(
      async () =>
        new Response(JSON.stringify({ apple: true, google: true }), {
          status: 200,
        }),
    );
    const auth = controller({ kind: "linked", targetProvider: "apple" });
    const { rerender } = render(<SignInMethods auth={auth} />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Apple is now connected. You can sign in either way.",
    );
    await waitFor(() => expect(api).toHaveBeenCalled());
    const retryAuth = controller({
      kind: "error",
      purpose: "link",
      code: "account_changed",
      targetProvider: "apple",
    });
    rerender(<SignInMethods auth={retryAuth} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your account changed. Start linking again. Neither account was modified.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start linking again" }),
    );
    expect(retryAuth.prepareLink).toHaveBeenCalledWith("apple");
  });

  it("refetches authoritative methods before showing an uncertain finalize result", async () => {
    let reads = 0;
    vi.mocked(api).mockImplementation(async () => {
      reads += 1;
      return new Response(
        JSON.stringify(
          reads === 1
            ? { apple: false, google: true }
            : { apple: true, google: true },
        ),
        { status: 200 },
      );
    });
    const { rerender } = render(
      <SignInMethods auth={controller({ kind: "idle" })} />,
    );
    expect(
      await screen.findByRole("button", { name: "Add Apple" }),
    ).toBeVisible();

    rerender(
      <SignInMethods
        auth={controller({
          kind: "error",
          purpose: "link",
          code: "signin_failed",
          targetProvider: "apple",
        })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t confirm the result. Check your sign-in methods and try again.",
    );
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.queryByRole("button", { name: "Add Apple" })).toBeNull();
    expect(screen.getAllByText("CONNECTED")).toHaveLength(2);
  });

  it.each([
    [
      {
        kind: "error",
        purpose: "link",
        code: "attempt_expired",
        targetProvider: "google",
      },
      "We couldn’t confirm the result. Check your sign-in methods and try again.",
    ],
    [
      {
        kind: "error",
        purpose: "link",
        code: "account_conflict",
        targetProvider: "google",
      },
      "That Google sign-in is already connected to another Ergomatic account. Nothing changed.",
    ],
    [
      { kind: "error", purpose: "link", code: "signin_failed" },
      "We couldn’t confirm the result. Check your sign-in methods and try again.",
    ],
  ] as const)("renders the bounded link terminal copy", async (view, copy) => {
    vi.mocked(api).mockImplementation(
      async () =>
        new Response(JSON.stringify({ apple: true, google: true }), {
          status: 200,
        }),
    );
    render(<SignInMethods auth={controller(view)} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
  });

  it("uses the invitation denial instead of uncertain-link wording", async () => {
    vi.mocked(api).mockResolvedValue(
      new Response(JSON.stringify({ apple: false, google: true }), {
        status: 200,
      }),
    );
    render(
      <SignInMethods
        auth={controller({
          kind: "error",
          purpose: "link",
          code: "access_denied",
          email: "saved@example.test",
          targetProvider: "apple",
        })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "saved@example.test isn't invited to this Ergomatic. Ask the owner to add you.",
    );
    expect(screen.queryByText(/couldn’t confirm/)).not.toBeInTheDocument();
  });

  it("keeps cancellation silent and hides the block while the feature is disabled", async () => {
    vi.mocked(api).mockImplementation(
      async () =>
        new Response(JSON.stringify({ apple: true, google: true }), {
          status: 200,
        }),
    );
    const cancelled = controller({
      kind: "cancelled",
      purpose: "link",
      targetProvider: "apple",
    });
    const { rerender } = render(<SignInMethods auth={cancelled} />);
    await screen.findByText("SIGN-IN METHODS");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    cancelled.options = {
      state: "ready",
      frontDoorEnabled: false,
      legacyGoogle: true,
      apple: false,
      google: true,
    };
    rerender(<SignInMethods auth={cancelled} />);
    expect(screen.queryByText("SIGN-IN METHODS")).not.toBeInTheDocument();
  });

  it("keeps a terminal notice visible when the methods read fails", async () => {
    vi.mocked(api).mockResolvedValue(new Response(null, { status: 503 }));
    render(
      <SignInMethods
        auth={controller({
          kind: "error",
          purpose: "link",
          code: "account_conflict",
          targetProvider: "apple",
        })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That Apple sign-in is already connected",
    );
  });

  it("offers Remove only where removing is possible", async () => {
    bothConnected();
    const auth = controller({ kind: "idle" });
    render(<SignInMethods auth={auth} />);
    const removals = await screen.findAllByRole("button", {
      name: /^Remove /,
    });
    expect(
      removals.map((button) => button.getAttribute("aria-label")),
    ).toStrictEqual(["Remove Apple", "Remove Google"]);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Google" }),
    );
    expect(auth.removeMethod).toHaveBeenCalledWith("google");
  });

  it("offers no Remove on the last remaining method", async () => {
    vi.mocked(api).mockResolvedValue(
      new Response(JSON.stringify({ apple: false, google: true }), {
        status: 200,
      }),
    );
    render(<SignInMethods auth={controller({ kind: "idle" })} />);
    await screen.findByText("CONNECTED");
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it.each([
    ["last_provider", "Add another sign-in method before removing this one."],
    ["not_connected", "That sign-in method isn’t connected to this account."],
    ["account_gone", "This account no longer exists. Nothing was changed."],
  ] as const)(
    "says exactly why a removal changed nothing (%s)",
    async (reason, copy) => {
      bothConnected();
      render(
        <SignInMethods
          auth={controller({
            kind: "unlink_refused",
            provider: "apple",
            reason,
          })}
        />,
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(copy);
    },
  );

  it("tells a rower whose account is gone the truth, not the last-provider line", async () => {
    bothConnected();
    render(
      <SignInMethods
        auth={controller({
          kind: "unlink_refused",
          provider: "apple",
          reason: "account_gone",
        })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no longer exists/i,
    );
    expect(screen.queryByText(/sign-in method before removing/i)).toBeNull();
  });

  it("says the result is unknown when the removal request itself failed", async () => {
    bothConnected();
    render(
      <SignInMethods
        auth={controller({
          kind: "unlink_failed",
          provider: "apple",
          code: "rate_limited",
        })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t confirm the result. Check your sign-in methods and try again.",
    );
  });

  it("renders a failed delete re-auth instead of bouncing the rower to a silent screen", async () => {
    bothConnected();
    render(
      <SignInMethods
        auth={controller({
          kind: "error",
          purpose: "delete",
          code: "invalid_proof",
        })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t confirm it was you. Nothing was deleted.",
    );
  });

  it("quarantines deletion in its own section and starts it on a connected provider", async () => {
    bothConnected();
    const auth = controller({ kind: "idle" });
    render(<SignInMethods auth={auth} />);
    const remove = await screen.findByRole("button", {
      name: "Delete account",
    });
    expect(screen.getByRole("heading", { name: "ACCOUNT" })).toBeVisible();
    expect(remove.closest(".auth-danger-zone")).not.toBeNull();
    await userEvent.click(remove);
    expect(auth.startDelete).toHaveBeenCalledWith("apple");
  });

  it("starts the delete on the provider the rower actually holds", async () => {
    vi.mocked(api).mockResolvedValue(
      new Response(JSON.stringify({ apple: false, google: true }), {
        status: 200,
      }),
    );
    const auth = controller({ kind: "idle" });
    render(<SignInMethods auth={auth} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    expect(auth.startDelete).toHaveBeenCalledWith("google");
  });

  it("disables Delete account when no held provider can be re-proved here", async () => {
    vi.mocked(api).mockResolvedValue(
      new Response(JSON.stringify({ apple: true, google: false }), {
        status: 200,
      }),
    );
    const auth = controller({ kind: "idle" });
    auth.options = {
      state: "ready",
      frontDoorEnabled: true,
      legacyGoogle: false,
      apple: false,
      google: true,
    };
    render(<SignInMethods auth={auth} />);
    const remove = await screen.findByRole("button", {
      name: "Delete account",
    });
    expect(remove).toBeDisabled();
    await userEvent.click(remove);
    expect(auth.startDelete).not.toHaveBeenCalled();
  });
});
