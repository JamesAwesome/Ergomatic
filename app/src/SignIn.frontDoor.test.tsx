import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuthFlowController, AuthFlowView } from "./adapters/authFlow";
import SignIn from "./SignIn";

/** Hoisted so the email_required cases below read as one pair. */
const EMAIL_NEEDED_COPY = /didn.t provide an email address/i;

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
    confirmAttach: vi.fn(),
    declineAttach: vi.fn(),
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

  it("does NOT show the Apple email-needed screen when the provider was Google", async () => {
    // `EmailNeeded` hardcodes "This Apple account ... Continue with Google",
    // so it is only true behind the `targetProvider === "apple"` clause in
    // SignIn.tsx. Nothing built the Google case, so deleting that clause was
    // green while telling a Google rower their APPLE account had no email and
    // offering them Google as the way out — the provider they just came from.
    // This is the other half of the pair above.
    const auth = controller({
      kind: "error",
      purpose: "signin",
      code: "email_required",
      targetProvider: "google",
    });
    render(<SignIn auth={auth} />);
    expect(
      screen.queryByRole("heading", { name: "Email needed" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(EMAIL_NEEDED_COPY)).not.toBeInTheDocument();
  });

  // WAVE A PR2 DELETED THE SCREEN THIS TESTED. `useUsualSignIn` no longer
  // parks the rower on "Sign in to your account / then open You → Sign-in
  // methods to add {provider}" — it carries the attempt through the second
  // authorization and returns to the post-proof confirmation, so nothing
  // produces `kind: "usual"` any more. The test constructed that view BY
  // HAND, which is what kept an unreachable screen looking covered.
  // Its replacement is the attach confirmation below.
  it("PR2: renders the post-proof confirmation naming both identities", async () => {
    const auth = controller({
      kind: "attach_confirm",
      targetProvider: "apple",
      carried: { email: "9m3x@privaterelay.appleid.com", name: "Rower" },
      account: { id: "u1", email: "maya@example.com", name: "Maya Chen" },
    });
    render(<SignIn auth={auth} />);
    expect(
      screen.getByRole("heading", { name: "Attach Apple to this account?" }),
    ).toBeVisible();
    // THE RELAY ADDRESS IN FULL. The spec's constraint is that the
    // confirmation names the provider AND the relay address; a truncated one
    // does not name it.
    expect(screen.getByText("9m3x@privaterelay.appleid.com")).toBeVisible();
    // AND THE DESTINATION, which is what makes this a control rather than a
    // notice: "attach this to WHICH account?"
    expect(screen.getByText("maya@example.com")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Attach Apple" }));
    expect(auth.confirmAttach).toHaveBeenCalledOnce();
  });

  it("PR2: Not now declines the attach rather than cancelling the sign-in", async () => {
    const auth = controller({
      kind: "attach_confirm",
      targetProvider: "apple",
      carried: { email: "9m3x@privaterelay.appleid.com", name: "Rower" },
      account: { id: "u1", email: "maya@example.com", name: "Maya Chen" },
    });
    render(<SignIn auth={auth} />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(auth.declineAttach).toHaveBeenCalledOnce();
    expect(auth.cancel).not.toHaveBeenCalled();
  });

  // THE SAME SCREEN, THROUGH ITS OWN REQUEST, ON THE SURFACE THAT MATTERS.
  // `AppRoutes` keeps the confirmation mounted while `finalize` runs, but
  // `AppRoutes` only exists once `me` resolves IN — and on native it never
  // does before the rower chooses. `SignIn` is the whole tree there, so if
  // its dispatch drops the screen the moment the view goes `busy`, the
  // native rower watches the confirmation vanish into the Ergomatic welcome
  // screen and back out to Today. `disabled={busy}` cannot save a component
  // that is not on screen.
  it("PR2: keeps the confirmation drawn and inert through its own request", () => {
    const auth = controller({
      kind: "busy",
      purpose: "signin",
      attaching: {
        targetProvider: "apple",
        carried: { email: "9m3x@privaterelay.appleid.com", name: "Rower" },
        account: { id: "u1", email: "maya@example.com", name: "Maya Chen" },
      },
    });
    render(<SignIn auth={auth} />);
    expect(
      screen.getByRole("heading", { name: "Attach Apple to this account?" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Attach Apple" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
    // AND THE WELCOME SCREEN IS NOT UNDERNEATH IT. This is the assertion
    // that fails on the bounce: the provider buttons are what the rower saw
    // instead of the confirmation.
    expect(
      screen.queryByRole("button", { name: "Continue with Apple" }),
    ).not.toBeInTheDocument();
  });

  // THE OTHER HALF, AND THE REASON THE DISCRIMINATOR IS ON THE VIEW RATHER
  // THAN ON `purpose`. An ordinary sign-in is `busy`/`signin` too, and it has
  // never been near this flow. Owning every such view would hand a rower
  // waiting on a plain sign-in a confirmation with no identities to name.
  it("PR2: an ordinary sign-in in flight still shows the welcome screen", () => {
    const auth = controller({ kind: "busy", purpose: "signin" });
    render(<SignIn auth={auth} />);
    expect(
      screen.getByRole("button", { name: "Continue with Apple" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("heading", { name: "Attach Apple to this account?" }),
    ).not.toBeInTheDocument();
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

  it("shows the existing invitation denial for a saved or relay email", () => {
    const auth = controller({
      kind: "error",
      purpose: "signin",
      code: "access_denied",
      email: "relay@privaterelay.appleid.com",
      targetProvider: "apple",
    });
    render(<SignIn auth={auth} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "relay@privaterelay.appleid.com isn't invited to this Ergomatic. Ask the owner to add you.",
    );
    expect(screen.queryByText(/didn’t work/)).not.toBeInTheDocument();
  });

  it("keeps a providerless access denial dedicated when the server has no email", () => {
    const auth = controller({
      kind: "error",
      purpose: "signin",
      code: "access_denied",
    });
    render(<SignIn auth={auth} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This account isn't invited to this Ergomatic. Ask the owner to add you.",
    );
    expect(screen.queryByText(/didn’t work/)).not.toBeInTheDocument();
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

  // The deletion succeeded either way; `appleRevoked` says only whether
  // anything is still outstanding AT APPLE. The notice states the resulting
  // STATE the rower can act on, never our failure to reach Apple.
  it("hands back Apple's own remedy when the revoke did not land", () => {
    render(
      <SignIn auth={controller({ kind: "deleted", appleRevoked: false })} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your account is deleted. Ergomatic is still listed in your Apple ID settings, under Sign in with Apple. You can remove it there.",
    );
  });

  it("says nothing about Apple when the revoke landed", () => {
    render(
      <SignIn auth={controller({ kind: "deleted", appleRevoked: true })} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your account is deleted.",
    );
    expect(screen.queryByText(/Apple ID settings/i)).toBeNull();
  });

  it("still offers both doors after a deletion", () => {
    render(
      <SignIn auth={controller({ kind: "deleted", appleRevoked: true })} />,
    );
    expect(
      screen.getByRole("button", { name: "Continue with Apple" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
  });
});
