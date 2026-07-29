import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import SignIn from "./SignIn";

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.resetModules();
  vi.doUnmock("./adapters/auth");
});

describe("SignIn", () => {
  it("shows the heading, tagline, and a Google sign-in link with no notice", () => {
    render(<SignIn />);
    expect(
      screen.getByRole("heading", { name: /ergomatic/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/rowing workout tracker/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /continue with google/i });
    expect(link).toHaveAttribute("href", "/api/auth/signin");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a denied notice with the rejected email from ?denied=", () => {
    window.history.replaceState(null, "", "/?denied=b%40y.com");
    render(<SignIn />);
    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent("b@y.com");
    expect(notice).toHaveTextContent(/isn't invited/i);
  });

  it("shows a retry notice from ?error=signin_failed", () => {
    window.history.replaceState(null, "", "/?error=signin_failed");
    render(<SignIn />);
    expect(screen.getByRole("alert")).toHaveTextContent(/didn't work/i);
  });

  // Platform branching (web link vs. native button, native sign-in success/
  // failure paths) is the adapter's own contract and is covered by
  // src/adapters/auth.test.tsx. These tests only check that SignIn wires
  // the adapter's callbacks through correctly — composition, not platform
  // behavior — so they don't duplicate the adapter suite.
  it("passes onSignedIn through to the adapter's SignInButton", async () => {
    const onSignedIn = vi.fn();
    vi.doMock("./adapters/auth", () => ({
      SignInButton: ({ onSignedIn }: { onSignedIn?: () => void }) => (
        <button onClick={onSignedIn}>Continue with Google</button>
      ),
    }));
    const { default: MockedSignIn } = await import("./SignIn");
    render(<MockedSignIn onSignedIn={onSignedIn} />);
    await userEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it("surfaces the adapter's onError message in the role=alert notice", async () => {
    vi.doMock("./adapters/auth", () => ({
      SignInButton: ({ onError }: { onError: (message: string) => void }) => (
        <button onClick={() => onError("b@y.com isn't invited")}>
          Continue with Google
        </button>
      ),
    }));
    const { default: MockedSignIn } = await import("./SignIn");
    render(<MockedSignIn />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "b@y.com isn't invited",
    );
  });
});
