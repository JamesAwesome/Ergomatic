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
  };
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

  it.each([
    [
      {
        kind: "error",
        purpose: "link",
        code: "attempt_expired",
        targetProvider: "google",
      },
      "This linking attempt expired. Nothing changed. Start linking again.",
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
      "That linking attempt didn’t work. Nothing changed. Start linking again.",
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
});
