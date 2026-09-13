import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuthFlowController, AuthFlowView } from "../adapters/authFlow";
import LinkSignInMethod from "./LinkSignInMethod";

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
    destination: "/you/sign-in-methods",
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

describe("LinkSignInMethod", () => {
  it("renders nothing outside the linking route states", () => {
    const { container } = render(
      <LinkSignInMethod auth={controller({ kind: "idle" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
  it("explains both proofs before starting an Apple link", async () => {
    const auth = controller({ kind: "link_confirm", targetProvider: "apple" });
    render(<LinkSignInMethod auth={auth} />);
    expect(screen.getByRole("heading", { name: "Add Apple" })).toBeVisible();
    expect(screen.getByText("Confirm your usual Google sign-in")).toBeVisible();
    expect(screen.getByText("Sign in with Apple")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm with Google" }),
    );
    expect(auth.startPreparedLink).toHaveBeenCalledOnce();
  });

  it("marks the first proof complete before authorizing the target", async () => {
    const auth = controller({
      kind: "link_authorize",
      targetProvider: "google",
      provider: "google",
      existingProofComplete: true,
    });
    render(<LinkSignInMethod auth={auth} />);
    expect(screen.getByLabelText("Usual sign-in confirmed")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(auth.authorizeLinkTarget).toHaveBeenCalledOnce();
  });

  it("cancels without claiming a link changed", async () => {
    const auth = controller({ kind: "link_confirm", targetProvider: "google" });
    render(<LinkSignInMethod auth={auth} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(auth.cancel).toHaveBeenCalledOnce();
    expect(screen.queryByText(/connected/i)).not.toBeInTheDocument();
  });

  it("the header cancel uses the same bound cancellation", async () => {
    const auth = controller({ kind: "link_confirm", targetProvider: "apple" });
    render(<LinkSignInMethod auth={auth} />);
    await userEvent.click(screen.getByRole("button", { name: "← CANCEL" }));
    expect(auth.cancel).toHaveBeenCalledOnce();
  });
});
