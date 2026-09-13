import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuthFlowController, AuthFlowView } from "./adapters/authFlow";
import SignIn from "./SignIn";

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
  };
}

describe("SignIn front door", () => {
  it("puts Apple before Google and begins the selected provider", async () => {
    const auth = controller({ kind: "idle" });
    const { container } = render(<SignIn auth={auth} />);
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".auth-provider-button"),
      (button) => button.textContent,
    );
    expect(buttons).toStrictEqual([
      "Continue with Apple",
      "Continue with Google",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Apple" }),
    );
    expect(auth.startSignIn).toHaveBeenCalledWith("apple");
  });

  it("shows the unseen identity and waits for explicit account creation", async () => {
    const auth = controller({
      kind: "confirm",
      targetProvider: "apple",
      profile: {
        name: "Rower",
        email: "9m3x7k2p1r@privaterelay.appleid.com",
      },
    });
    render(<SignIn auth={auth} />);
    expect(
      screen.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
    expect(screen.getByText("Rower")).toBeVisible();
    expect(
      screen.getByText("9m3x7k2p1r@privaterelay.appleid.com"),
    ).toBeVisible();
    expect(
      screen.getByText(/This makes a new Ergomatic account/),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    expect(auth.confirmAccount).toHaveBeenCalledOnce();
    await userEvent.click(
      screen.getByRole("button", { name: "I already have an account" }),
    );
    expect(auth.useUsualSignIn).toHaveBeenCalledOnce();
  });

  it("handles missing Apple email without claiming an account was created", async () => {
    const auth = controller({
      kind: "error",
      purpose: "signin",
      code: "email_required",
      targetProvider: "apple",
    });
    render(<SignIn auth={auth} />);
    expect(screen.getByRole("heading", { name: "Email needed" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This Apple account didn’t provide an email address. Continue with Google.",
    );
    expect(screen.getByText(/^No account was created\./)).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(auth.startSignIn).toHaveBeenCalledWith("google");
  });

  it("renders the usual-provider guidance and both provider variants", async () => {
    const apple = controller({ kind: "usual", provider: "apple" });
    const { rerender } = render(<SignIn auth={apple} />);
    expect(screen.getByText(/add Google/)).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Apple" }),
    );
    expect(apple.startSignIn).toHaveBeenCalledWith("apple");

    const google = controller({ kind: "usual", provider: "google" });
    rerender(<SignIn auth={google} />);
    expect(screen.getByText(/add Apple/)).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(google.startSignIn).toHaveBeenCalledWith("google");
  });

  it("shows a bounded retry and starts Google from the welcome screen", async () => {
    const auth = controller({
      kind: "error",
      purpose: "signin",
      code: "signin_failed",
    });
    render(<SignIn auth={auth} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That sign-in didn’t work. Give it another try.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(auth.startSignIn).toHaveBeenCalledWith("google");
  });

  it("uses R when the confirmed identity has no usable initials", () => {
    const auth = controller({
      kind: "confirm",
      targetProvider: "google",
      profile: { name: "", email: "maya@example.com" },
    });
    render(<SignIn auth={auth} />);
    expect(screen.getByText("R")).toBeVisible();
    expect(screen.getByText(/add Google from You/)).toBeVisible();
  });

  it("preserves the legacy Google door when old-server fallback is active", () => {
    const auth = controller({ kind: "idle" });
    auth.options = {
      state: "ready",
      frontDoorEnabled: false,
      legacyGoogle: true,
      apple: false,
      google: true,
    };
    render(<SignIn auth={auth} />);
    expect(
      screen.getByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute("href", "/api/auth/signin");
  });
});
