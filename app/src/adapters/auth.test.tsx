import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("adapters/auth signOut", () => {
  it("POSTs /api/auth/signout on web", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { signOut } = await import("./auth");
    await signOut();
    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/signout", {
      method: "POST",
    });
  });

  it("signs out via the native Keychain path when isNative()", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const nativeSignOut = vi.fn(async () => {});
    vi.doMock("../native/signin", () => ({ nativeSignOut }));
    const { signOut } = await import("./auth");
    await signOut();
    expect(nativeSignOut).toHaveBeenCalledOnce();
  });
});

describe("adapters/auth SignInButton", () => {
  it("renders the web sign-in as a link to /api/auth/signin", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const { SignInButton } = await import("./auth");
    render(<SignInButton onError={() => {}} />);
    const link = screen.getByRole("link", { name: "Continue with Google" });
    expect(link).toHaveAttribute("href", "/api/auth/signin");
  });

  it("renders a native button and calls onSignedIn after a successful sign-in", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const initNativeAuth = vi.fn(async () => {});
    const nativeSignIn = vi.fn(async () => true);
    vi.doMock("../native/signin", () => ({ initNativeAuth, nativeSignIn }));
    const onSignedIn = vi.fn();
    const { SignInButton } = await import("./auth");
    render(<SignInButton onSignedIn={onSignedIn} onError={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(initNativeAuth).toHaveBeenCalledOnce();
    expect(nativeSignIn).toHaveBeenCalledOnce();
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it("renders a native button and reports sign-in failures via onError", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    vi.doMock("../native/signin", () => ({
      initNativeAuth: vi.fn(async () => {}),
      nativeSignIn: vi.fn(async () => {
        throw new Error("boom");
      }),
    }));
    const onError = vi.fn();
    const { SignInButton } = await import("./auth");
    render(<SignInButton onError={onError} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("falls back to a generic message when the native sign-in throws a non-Error", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    vi.doMock("../native/signin", () => ({
      initNativeAuth: vi.fn(async () => {}),
      nativeSignIn: vi.fn(async () => {
        throw "nope";
      }),
    }));
    const onError = vi.fn();
    const { SignInButton } = await import("./auth");
    render(<SignInButton onError={onError} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(onError).toHaveBeenCalledWith(
      "That sign-in didn't work. Give it another try.",
    );
  });
});
