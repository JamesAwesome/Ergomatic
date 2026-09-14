import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({
  native: false,
  api: vi.fn(),
  appleAuthorize: vi.fn(),
  googleInit: vi.fn(),
  googleProof: vi.fn(),
  nativeSignOut: vi.fn(),
  storeToken: vi.fn(),
  navigateWeb: vi.fn(),
}));

vi.mock("../platform", () => ({ isNative: () => seam.native }));
vi.mock("../api", () => ({ api: seam.api }));
vi.mock("../native/appleAuth", () => ({
  AppleAuth: { authorize: seam.appleAuthorize },
}));
vi.mock("../native/signin", () => ({
  initNativeAuth: seam.googleInit,
  nativeGoogleProofAfterInit: seam.googleProof,
  nativeSignOut: seam.nativeSignOut,
}));
vi.mock("../native/session", () => ({ storeToken: seam.storeToken }));
vi.mock("./webNavigate", () => ({ navigateWeb: seam.navigateWeb }));

import { destinationFor, useAuthFlow } from "./authFlow";
import type { AuthFlowView } from "./authFlow";
import LinkSignInMethod from "../auth/LinkSignInMethod";
import You from "../You";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const options = {
  frontDoorEnabled: true,
  apple: { native: true, web: true },
  google: { native: true, web: true },
};

beforeEach(() => {
  seam.native = false;
  seam.api.mockReset();
  seam.appleAuthorize.mockReset();
  seam.googleInit.mockReset();
  seam.googleInit.mockResolvedValue(undefined);
  seam.googleProof.mockReset();
  seam.nativeSignOut.mockReset();
  seam.nativeSignOut.mockResolvedValue(undefined);
  seam.storeToken.mockReset();
  seam.navigateWeb.mockReset();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAuthFlow", () => {
  it("falls back to the legacy Google door when an older server has no options endpoint", async () => {
    seam.api.mockResolvedValue(new Response(null, { status: 404 }));
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    expect(result.current.options).toStrictEqual({
      state: "ready",
      frontDoorEnabled: false,
      legacyGoogle: true,
      apple: false,
      google: true,
    });
  });

  it("does not resurrect a native link begin after the flow is abandoned", async () => {
    seam.native = true;
    let resolveBegin!: (response: Response) => void;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return new Promise<Response>((resolve) => {
          resolveBegin = resolve;
        });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.prepareLink("apple"));
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.startPreparedLink();
      await Promise.resolve();
    });

    act(() => result.current.abandon());
    await act(async () => {
      resolveBegin(
        ok({
          outcome: "authorize",
          attemptId: "late-link",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "google",
          stage: "reauth",
          nonce: "late-nonce",
          state: "late-state",
          bindingSecret: "late-binding",
        }),
      );
      await pending;
    });

    expect(seam.googleProof).not.toHaveBeenCalled();
    expect(result.current.view).toStrictEqual({ kind: "idle" });
  });

  it("abandons a held native link begin through the real You sign-out control", async () => {
    seam.native = true;
    const begin = deferred<Response>();
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/methods") {
        return ok({ apple: false, google: true });
      }
      if (path === "/api/auth/native/attempts") return begin.promise;
      return new Response(null, { status: 404 });
    });
    const onSignedOut = vi.fn();
    let auth!: ReturnType<typeof useAuthFlow>;
    let pending!: Promise<void>;
    function Harness() {
      auth = useAuthFlow(() => {});
      return (
        <MemoryRouter>
          <You
            user={{ id: "rower", name: "Rower", email: "rower@example.test" }}
            onSignedOut={onSignedOut}
            authFlow={auth}
          />
        </MemoryRouter>
      );
    }
    render(<Harness />);
    await waitFor(() => expect(auth.options.state).toBe("ready"));
    await act(async () => auth.prepareLink("apple"));
    await act(async () => {
      pending = auth.startPreparedLink();
      await Promise.resolve();
    });

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(seam.nativeSignOut).toHaveBeenCalledOnce();
    expect(onSignedOut).toHaveBeenCalledOnce();

    await act(async () => {
      begin.resolve(
        ok({
          outcome: "authorize",
          attemptId: "late-you-link",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "google",
          stage: "reauth",
          nonce: "late-nonce",
          state: "late-state",
          bindingSecret: "late-binding",
        }),
      );
      await pending;
    });

    expect(seam.googleProof).not.toHaveBeenCalled();
    expect(auth.view).toStrictEqual({ kind: "idle" });
  });

  it("keeps one rendered native target action in flight through provider, proof, and finalization", async () => {
    seam.native = true;
    seam.googleProof.mockResolvedValue({ idToken: "google-proof" });
    const appleProof = deferred<{
      idToken: string;
      authorizationCode: string;
      state: string;
    }>();
    const targetProof = deferred<Response>();
    const finalization = deferred<Response>();
    seam.appleAuthorize.mockReturnValue(appleProof.promise);
    let proofCount = 0;
    let cancelCount = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "single-flight",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "google",
          stage: "reauth",
          nonce: "google-nonce",
          state: "google-state",
          bindingSecret: "single-binding",
        });
      }
      if (path === "/api/auth/native/attempts/single-flight/proof") {
        proofCount += 1;
        if (proofCount === 1) {
          return ok({
            outcome: "authorize",
            attemptId: "single-flight",
            purpose: "link",
            targetProvider: "apple",
            expiresAt: "soon",
            provider: "apple",
            stage: "target",
            nonce: "apple-nonce",
            state: "apple-state",
          });
        }
        return targetProof.promise;
      }
      if (path === "/api/auth/native/attempts/single-flight/finalize") {
        return finalization.promise;
      }
      if (path === "/api/auth/native/attempts/single-flight/cancel") {
        cancelCount += 1;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });

    let auth!: ReturnType<typeof useAuthFlow>;
    function Harness() {
      auth = useAuthFlow(() => {});
      return (
        <>
          <button onClick={() => void auth.prepareLink("apple")}>
            Add Apple
          </button>
          <LinkSignInMethod auth={auth} />
        </>
      );
    }
    render(<Harness />);
    await waitFor(() => expect(auth.options.state).toBe("ready"));
    fireEvent.click(screen.getByRole("button", { name: "Add Apple" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm with Google" }),
    );
    const target = await screen.findByRole("button", {
      name: "Continue with Apple",
    });

    act(() => {
      fireEvent.click(target);
      fireEvent.click(target);
    });
    await waitFor(() => expect(seam.appleAuthorize).toHaveBeenCalledOnce());
    expect(target).toBeDisabled();
    expect(cancelCount).toBe(0);

    await act(async () => {
      appleProof.resolve({
        idToken: "apple-proof",
        authorizationCode: "apple-code",
        state: "apple-state",
      });
      await waitFor(() => expect(proofCount).toBe(2));
    });
    await act(async () => auth.authorizeLinkTarget());
    expect(seam.appleAuthorize).toHaveBeenCalledOnce();
    expect(cancelCount).toBe(0);

    await act(async () => {
      targetProof.resolve(
        ok({
          outcome: "link_ready",
          attemptId: "single-flight",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "soon",
        }),
      );
      await Promise.resolve();
    });
    await act(async () => auth.authorizeLinkTarget());
    expect(seam.appleAuthorize).toHaveBeenCalledOnce();
    expect(cancelCount).toBe(0);

    await act(async () => {
      finalization.resolve(ok({ outcome: "linked" }));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(auth.view).toStrictEqual({
        kind: "linked",
        targetProvider: "apple",
      }),
    );
    expect(cancelCount).toBe(0);
  });

  it("waits for older provider cancellation before preparing a new link", async () => {
    seam.native = true;
    seam.googleProof.mockResolvedValue({ idToken: "google-proof" });
    seam.appleAuthorize.mockRejectedValue({ code: "cancelled" });
    const cancelResponse = deferred<Response>();
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "stale-cancel",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "google",
          stage: "reauth",
          nonce: "google-nonce",
          state: "google-state",
          bindingSecret: "cancel-binding",
        });
      }
      if (path === "/api/auth/native/attempts/stale-cancel/proof") {
        return ok({
          outcome: "authorize",
          attemptId: "stale-cancel",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "apple",
          stage: "target",
          nonce: "apple-nonce",
          state: "apple-state",
        });
      }
      if (path === "/api/auth/native/attempts/stale-cancel/cancel") {
        return cancelResponse.promise;
      }
      throw new Error(`unexpected ${path}`);
    });

    let auth!: ReturnType<typeof useAuthFlow>;
    function Harness() {
      auth = useAuthFlow(() => {});
      return (
        <>
          <button onClick={() => void auth.prepareLink("apple")}>
            Add Apple
          </button>
          <button onClick={() => void auth.prepareLink("google")}>
            Add Google
          </button>
          <LinkSignInMethod auth={auth} />
        </>
      );
    }
    render(<Harness />);
    await waitFor(() => expect(auth.options.state).toBe("ready"));
    fireEvent.click(screen.getByRole("button", { name: "Add Apple" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm with Google" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue with Apple" }),
    );
    await waitFor(() =>
      expect(seam.api).toHaveBeenCalledWith(
        "/api/auth/native/attempts/stale-cancel/cancel",
        expect.anything(),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Google" }));
    expect(screen.getByRole("heading", { name: "Add Apple" })).toBeVisible();
    await act(async () => {
      cancelResponse.resolve(new Response(null, { status: 204 }));
      await Promise.resolve();
    });
    expect(
      await screen.findByRole("heading", { name: "Add Google" }),
    ).toBeVisible();
  });

  it("does not launch Google after initialization loses its operation", async () => {
    seam.native = true;
    seam.appleAuthorize.mockResolvedValue({
      idToken: "apple-proof",
      authorizationCode: "apple-code",
      state: "apple-state",
    });
    const initialization = deferred<void>();
    seam.googleInit.mockReturnValue(initialization.promise);
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "held-init",
          purpose: "link",
          targetProvider: "google",
          expiresAt: "soon",
          provider: "apple",
          stage: "reauth",
          nonce: "apple-nonce",
          state: "apple-state",
          bindingSecret: "init-binding",
        });
      }
      if (path === "/api/auth/native/attempts/held-init/proof") {
        return ok({
          outcome: "authorize",
          attemptId: "held-init",
          purpose: "link",
          targetProvider: "google",
          expiresAt: "soon",
          provider: "google",
          stage: "target",
          nonce: "google-nonce",
          state: "google-state",
        });
      }
      if (path === "/api/auth/native/attempts/held-init/cancel") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });

    let auth!: ReturnType<typeof useAuthFlow>;
    function Harness() {
      auth = useAuthFlow(() => {});
      return (
        <>
          <button onClick={() => void auth.prepareLink("google")}>
            Add Google
          </button>
          <button onClick={() => void auth.prepareLink("apple")}>
            Add Apple
          </button>
          <LinkSignInMethod auth={auth} />
        </>
      );
    }
    render(<Harness />);
    await waitFor(() => expect(auth.options.state).toBe("ready"));
    fireEvent.click(screen.getByRole("button", { name: "Add Google" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm with Apple" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue with Google" }),
    );
    await waitFor(() => expect(seam.googleInit).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Add Apple" }));
    await waitFor(() =>
      expect(auth.view).toStrictEqual({
        kind: "link_confirm",
        targetProvider: "apple",
      }),
    );
    await act(async () => {
      initialization.resolve();
      await Promise.resolve();
    });
    expect(seam.googleProof).not.toHaveBeenCalled();
    expect(auth.view).toStrictEqual({
      kind: "link_confirm",
      targetProvider: "apple",
    });
  });

  it("keeps native Apple credentials and the binding secret out of the screen view", async () => {
    seam.native = true;
    seam.appleAuthorize.mockResolvedValue({
      idToken: "apple-id-token",
      authorizationCode: "apple-code",
      state: "apple-state",
      name: "Maya Chen",
    });
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "attempt-1",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "2026-09-13T00:05:00.000Z",
          provider: "apple",
          stage: "signin",
          nonce: "apple-nonce",
          state: "apple-state",
          bindingSecret: "device-binding",
        });
      }
      if (path === "/api/auth/native/attempts/attempt-1/proof") {
        return ok({
          outcome: "confirm",
          attemptId: "attempt-1",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "2026-09-13T00:10:00.000Z",
          profile: {
            email: "9m3x7k2p1r@privaterelay.appleid.com",
            name: "Maya Chen",
          },
        });
      }
      throw new Error(`unexpected ${path}`);
    });

    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("apple"));

    expect(seam.appleAuthorize).toHaveBeenCalledWith({
      nonce: "apple-nonce",
      state: "apple-state",
    });
    const proofCall = seam.api.mock.calls.find(
      ([path]) => path === "/api/auth/native/attempts/attempt-1/proof",
    );
    expect(proofCall).toBeDefined();
    expect(
      JSON.parse((proofCall![1] as RequestInit).body as string),
    ).toStrictEqual({
      bindingSecret: "device-binding",
      state: "apple-state",
      idToken: "apple-id-token",
      authorizationCode: "apple-code",
      name: "Maya Chen",
    });
    expect(result.current.view).toStrictEqual({
      kind: "confirm",
      targetProvider: "apple",
      profile: {
        email: "9m3x7k2p1r@privaterelay.appleid.com",
        name: "Maya Chen",
      },
    });
    expect(JSON.stringify(result.current.view)).not.toMatch(
      /apple-id-token|apple-code|apple-state|device-binding|apple-nonce/,
    );
  });

  it("forces nonce-bound Google reauthentication before exposing the target-provider step", async () => {
    seam.native = true;
    seam.googleProof.mockResolvedValue({ idToken: "google-proof" });
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "link-1",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "2026-09-13T00:05:00.000Z",
          provider: "google",
          stage: "reauth",
          nonce: "reauth-nonce",
          state: "reauth-state",
          bindingSecret: "link-binding",
        });
      }
      if (path === "/api/auth/native/attempts/link-1/proof") {
        return ok({
          outcome: "authorize",
          attemptId: "link-1",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "2026-09-13T00:10:00.000Z",
          provider: "apple",
          stage: "target",
          nonce: "target-nonce",
          state: "target-state",
        });
      }
      throw new Error(`unexpected ${path}`);
    });

    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.prepareLink("apple"));
    await act(async () => result.current.startPreparedLink());

    expect(seam.googleProof).toHaveBeenCalledWith("reauth-nonce");
    expect(result.current.view).toStrictEqual({
      kind: "link_authorize",
      targetProvider: "apple",
      provider: "apple",
    });
  });

  it("stores only the returned Ergomatic token before announcing native sign-in", async () => {
    seam.native = true;
    seam.googleProof.mockResolvedValue({ idToken: "google-proof" });
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "signin-1",
          purpose: "signin",
          targetProvider: "google",
          expiresAt: "2026-09-13T00:05:00.000Z",
          provider: "google",
          stage: "signin",
          nonce: "google-nonce",
          state: "google-state",
          bindingSecret: "binding",
        });
      }
      return ok({
        outcome: "signed_in",
        user: { id: "u1", email: "maya@example.com", name: "Maya" },
        expiresAt: "2026-11-12T00:00:00.000Z",
        token: "ergomatic-session",
      });
    });
    const onSignedIn = vi.fn();
    const { result } = renderHook(() => useAuthFlow(onSignedIn));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("google"));
    expect(seam.storeToken).toHaveBeenCalledWith("ergomatic-session");
    expect(onSignedIn).toHaveBeenCalledOnce();
    expect(result.current.view).toStrictEqual({ kind: "idle" });
  });

  it("consumes a web attempt query before resuming its account confirmation", async () => {
    window.history.replaceState(null, "", "/?authAttempt=attempt-web&keep=1");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/attempt-web") {
        return ok({
          outcome: "confirm",
          attemptId: "attempt-web",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "2026-09-13T00:05:00.000Z",
          profile: { email: "relay@privaterelay.appleid.com", name: "Rower" },
        });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));
    expect(window.location.search).toBe("?keep=1");
  });

  it("maps a web account-switch rejection to the exact link notice without raw text", async () => {
    window.history.replaceState(
      null,
      "",
      "/?authError=account_changed&authPurpose=link&authProvider=apple",
    );
    seam.api.mockResolvedValue(ok(options));
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("error"));
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "link",
      code: "account_changed",
      targetProvider: "apple",
    });
    expect(window.location.search).toBe("");
  });

  it("navigates the server-owned web URL and confirms an unseen account", async () => {
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "web-signin",
          purpose: "signin",
          targetProvider: "google",
          expiresAt: "soon",
          provider: "google",
          stage: "signin",
          nonce: "nonce",
          state: "state",
          authorizationUrl: "https://accounts.example/authorize",
        });
      }
      if (path === "/api/auth/web/attempts/web-signin/confirm") {
        return ok({
          outcome: "signed_in",
          user: { id: "u1", email: "maya@example.com", name: "Maya" },
          expiresAt: "later",
        });
      }
      throw new Error(`unexpected ${path}`);
    });
    const onSignedIn = vi.fn();
    const { result } = renderHook(() => useAuthFlow(onSignedIn));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("google"));
    expect(seam.navigateWeb).toHaveBeenCalledWith(
      "https://accounts.example/authorize",
    );

    window.history.replaceState(null, "", "/?authAttempt=web-confirm");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/web-confirm") {
        return ok({
          outcome: "confirm",
          attemptId: "web-confirm",
          purpose: "signin",
          targetProvider: "google",
          expiresAt: "soon",
          profile: { email: "maya@example.com", name: "Maya" },
        });
      }
      if (path === "/api/auth/web/attempts/web-confirm/confirm") {
        return ok({
          outcome: "signed_in",
          user: { id: "u1", email: "maya@example.com", name: "Maya" },
          expiresAt: "later",
        });
      }
      throw new Error(`unexpected ${path}`);
    });
    const second = renderHook(() => useAuthFlow(onSignedIn));
    await waitFor(() =>
      expect(second.result.current.view.kind).toBe("confirm"),
    );
    await act(async () => second.result.current.confirmAccount());
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it("cancels confirmation before directing an existing rower to the usual provider", async () => {
    window.history.replaceState(null, "", "/?authAttempt=usual");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/usual") {
        return ok({
          outcome: "confirm",
          attemptId: "usual",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          profile: { email: "relay@apple.test", name: "Rower" },
        });
      }
      if (path === "/api/auth/web/attempts/usual/cancel") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));
    await act(async () => result.current.useUsualSignIn());
    expect(result.current.view).toStrictEqual({
      kind: "usual",
      provider: "google",
    });
    act(() => result.current.reset());
    expect(result.current.view).toStrictEqual({ kind: "idle" });
    await act(async () => result.current.prepareLink("google"));
    act(() => result.current.abandon());
    expect(result.current.view).toStrictEqual({ kind: "idle" });
  });

  it("keeps confirmation active when usual-sign-in cleanup is uncertain, then advances after a successful retry", async () => {
    window.history.replaceState(null, "", "/?authAttempt=usual-retry");
    let cancellations = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/usual-retry") {
        return ok({
          outcome: "confirm",
          attemptId: "usual-retry",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          profile: { email: "relay@apple.test", name: "Rower" },
        });
      }
      if (path === "/api/auth/web/attempts/usual-retry/cancel") {
        cancellations += 1;
        return cancellations === 1
          ? ok({ error: "signin_failed" }, 503)
          : new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));

    await act(async () => result.current.useUsualSignIn());
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "signin_failed",
      targetProvider: "apple",
    });

    await act(async () => result.current.useUsualSignIn());
    expect(result.current.view).toStrictEqual({
      kind: "usual",
      provider: "google",
    });
    expect(cancellations).toBe(2);
  });

  it("retains a rejected explicit cancellation for a later successful cleanup", async () => {
    window.history.replaceState(null, "", "/?authAttempt=cancel-retry");
    let cancellations = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/cancel-retry") {
        return ok({
          outcome: "authorize",
          attemptId: "cancel-retry",
          purpose: "link",
          targetProvider: "google",
          expiresAt: "soon",
          provider: "google",
          stage: "target",
          nonce: "nonce",
          state: "state",
          authorizationUrl: "https://accounts.example/target",
        });
      }
      if (path === "/api/auth/web/attempts/cancel-retry/cancel") {
        cancellations += 1;
        if (cancellations === 1) {
          throw new Error("server deleted the attempt but delivery was lost");
        }
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() =>
      expect(result.current.view.kind).toBe("link_authorize"),
    );

    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "link",
      code: "signin_failed",
      targetProvider: "google",
    });

    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "link",
      targetProvider: "google",
    });
    expect(cancellations).toBe(2);
  });

  it("a bfcache restore clears a busy view left behind by navigating to the provider", async () => {
    // THE REPORTED BUG. On web, `start()` sets `busy` and then hands the
    // browser to Apple. `busy` disables BOTH provider buttons (SignIn.tsx).
    // If the rower comes back with Back — or Apple's own cancel returns them
    // that way — Safari and Chrome restore the page from the back/forward
    // cache with React state INTACT, so `busy` is still true and both buttons
    // are dead. Only a reload rebuilds the app at idle, which is exactly what
    // was reported from staging. Nothing in the flow listened for `pageshow`.
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts")
        return ok({
          outcome: "authorize",
          attemptId: "bfc-1",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "apple",
          stage: "signin",
          nonce: "n",
          state: "s",
          authorizationUrl: "https://appleid.apple.com/auth/authorize",
        });
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));

    await act(async () => {
      await result.current.startSignIn("apple");
    });
    // The browser has been handed to Apple and the view is busy.
    expect(seam.navigateWeb).toHaveBeenCalled();
    expect(result.current.view.kind).toBe("busy");

    // Back: the SAME document is restored from bfcache. No remount, no
    // reload — `persisted: true` is the only signal there is.
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: true }),
      );
    });
    expect(result.current.view.kind).toBe("idle");
  });

  it("an ORDINARY load's pageshow does not wipe the busy view an OAuth return is using", async () => {
    // `persisted` is the whole guard, and without this case it is an unbitten
    // branch (RF21): `pageshow` fires on every ordinary load too, after mount
    // and after effects. The return-URL effect sets `busy` while it fetches
    // `/?authAttempt=<id>`, so a clear that did not check `persisted` would
    // strand EVERY OAuth return on an idle Welcome screen — a worse bug than
    // the one being fixed, and invisible to the restore test above.
    window.history.replaceState(null, "", "/?authAttempt=return-1");
    let resolveRead!: (response: Response) => void;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/return-1")
        return new Promise<Response>((done) => {
          resolveRead = done;
        });
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("busy"));

    // The ordinary load event: same document, NOT restored.
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: false }),
      );
    });
    expect(result.current.view.kind).toBe("busy");

    // And the return still completes into its real screen.
    await act(async () => {
      resolveRead(
        ok({
          outcome: "confirm",
          attemptId: "return-1",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          profile: { email: "r@a.test", name: "Rower" },
        }),
      );
    });
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));
  });

  it("shows a busy view while an attempt is being minted, and routes it nowhere", async () => {
    // `busy` is what disables BOTH provider buttons during the round-trip
    // (SignIn.tsx), and nothing built it. Deleting `setView({kind:"busy"})`
    // from `start` was green, and a double-tap on Continue with Apple then
    // mints a second attempt that cancels the first. `destinationFor` must
    // also return null for it — a busy view that routed would navigate the
    // rower away mid-mint.
    let release!: (response: Response) => void;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts")
        return new Promise<Response>((done) => {
          release = done;
        });
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));

    let started!: Promise<void>;
    act(() => {
      started = result.current.startSignIn("apple");
    });
    await waitFor(() =>
      expect(result.current.view).toStrictEqual({
        kind: "busy",
        purpose: "signin",
      }),
    );
    expect(result.current.destination).toBeNull();

    await act(async () => {
      release(
        ok({
          outcome: "authorize",
          attemptId: "busy-1",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "apple",
          stage: "signin",
          nonce: "n",
          state: "s",
          authorizationUrl: "/?authAttempt=busy-1",
        }),
      );
      await started;
    });
    // On web the operation's terminal is the redirect, not a view change —
    // the page is leaving. `navigateWeb` is mocked, so the view legitimately
    // STAYS busy here; asserting it changed would be asserting a behaviour
    // this surface does not have.
    expect(seam.navigateWeb).toHaveBeenCalledWith("/?authAttempt=busy-1");
  });

  it.each([
    ["confirm", "/"],
    ["usual", "/"],
    ["link_confirm", "/you/sign-in-methods"],
    ["link_authorize", "/you/sign-in-methods"],
    ["linked", "/you"],
    ["idle", null],
    ["busy", null],
  ] as const)("routes a %s view to %s", (kind, expected) => {
    // Independent route literals, never imported from the component tree.
    const view = (
      kind === "confirm"
        ? { kind, targetProvider: "apple", profile: { email: "", name: "" } }
        : kind === "usual"
          ? { kind, provider: "apple" }
          : kind === "link_confirm" || kind === "linked"
            ? { kind, targetProvider: "apple" }
            : kind === "link_authorize"
              ? {
                  kind,
                  targetProvider: "apple",
                  provider: "google",
                }
              : kind === "busy"
                ? { kind, purpose: "signin" }
                : { kind }
    ) as AuthFlowView;
    expect(destinationFor(view)).toStrictEqual(expected);
  });

  it.each([
    ["signin", "/"],
    ["link", "/you"],
  ] as const)(
    "routes a terminal %s outcome back to the surface that started it",
    (purpose, expected) => {
      // cancelled and error share the purpose split, and it is the half that
      // decides whether a signed-in rower ever SEES the failure: a link error
      // routed to "/" lands somewhere that renders no link notice at all.
      expect(destinationFor({ kind: "cancelled", purpose })).toStrictEqual(
        expected,
      );
      expect(
        destinationFor({ kind: "error", purpose, code: "signin_failed" }),
      ).toStrictEqual(expected);
    },
  );

  it("releases a cancellation the server refuses, so an expired binding cannot wedge the flow", async () => {
    // The web binding cookie and the attempt both live 300s. Hesitate on the
    // confirmation screen past that and `webBinding` rejects the cancel with
    // 401 before the server's DELETE is ever reached. A refused binding can
    // never complete the attempt either, so retaining it locally buys nothing
    // and blocks every control; only a network-level or 5xx failure is worth
    // a retry, and those keep their existing retain-and-retry behaviour.
    window.history.replaceState(null, "", "/?authAttempt=cancel-refused");
    let cancellations = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/cancel-refused") {
        return ok({
          outcome: "confirm",
          attemptId: "cancel-refused",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          profile: { email: "relay@apple.test", name: "Rower" },
        });
      }
      if (path === "/api/auth/web/attempts/cancel-refused/cancel") {
        cancellations += 1;
        return ok({ error: "invalid_proof" }, 401);
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));

    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "signin",
      targetProvider: "apple",
    });

    // The operation is released, so an ordinary retry reaches the server
    // instead of re-entering cleanup.
    await act(async () => result.current.startSignIn("apple"));
    expect(cancellations).toBe(1);
  });

  it("releases a cancellation refused for a missing binding cookie", async () => {
    // THE case the release exists for, and it is a 400, not a 401: an absent
    // `erg_auth_attempt` cookie reaches `requiredText(undefined)` in
    // `webBinding`, which throws `invalid_request`. A malformed cookie is the
    // 401 above. Both are spent bindings; this is the one a five-minute pause
    // on the confirmation screen actually produces.
    window.history.replaceState(null, "", "/?authAttempt=cancel-nocookie");
    let cancellations = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/cancel-nocookie") {
        return ok({
          outcome: "confirm",
          attemptId: "cancel-nocookie",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          profile: { email: "relay@apple.test", name: "Rower" },
        });
      }
      if (path === "/api/auth/web/attempts/cancel-nocookie/cancel") {
        cancellations += 1;
        return ok({ error: "invalid_request" }, 400);
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));

    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "signin",
      targetProvider: "apple",
    });
    expect(cancellations).toBe(1);
  });

  it("keeps a rate-limited cancellation for retry rather than releasing it", async () => {
    // 429 is the one 4xx the server did not act on: the attempt and its
    // binding both survive, so this must retain like a 5xx.
    window.history.replaceState(null, "", "/?authAttempt=cancel-limited");
    let cancellations = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/cancel-limited") {
        return ok({
          outcome: "confirm",
          attemptId: "cancel-limited",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          profile: { email: "relay@apple.test", name: "Rower" },
        });
      }
      if (path === "/api/auth/web/attempts/cancel-limited/cancel") {
        cancellations += 1;
        return cancellations === 1
          ? ok({ error: "rate_limited" }, 429)
          : new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));

    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "signin_failed",
      targetProvider: "apple",
    });

    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "signin",
      targetProvider: "apple",
    });
    expect(cancellations).toBe(2);
  });

  it("turns native provider cancellation into a silent provider-aware terminal state", async () => {
    seam.native = true;
    seam.appleAuthorize.mockRejectedValue({ code: "cancelled" });
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "cancel-native",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "apple",
          stage: "signin",
          nonce: "nonce",
          state: "state",
          bindingSecret: "binding",
        });
      }
      if (path === "/api/auth/native/attempts/cancel-native/cancel") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("apple"));
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "signin",
      targetProvider: "apple",
    });
  });

  it("reports uncertain provider-cancellation cleanup and keeps its binding retryable", async () => {
    seam.native = true;
    seam.appleAuthorize.mockRejectedValue({
      code: "cancelled",
      idToken: "must-not-survive",
      authorizationCode: "must-not-survive-either",
    });
    let cancellations = 0;
    let proofPosts = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "provider-cancel-retry",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "apple",
          stage: "signin",
          nonce: "nonce",
          state: "state",
          bindingSecret: "binding",
        });
      }
      if (path === "/api/auth/native/attempts/provider-cancel-retry/cancel") {
        cancellations += 1;
        if (cancellations === 1) {
          throw new Error("server deleted the attempt but delivery was lost");
        }
        return new Response(null, { status: 204 });
      }
      if (path === "/api/auth/native/attempts/provider-cancel-retry/proof") {
        proofPosts += 1;
        throw new Error("cancelled proof must not be posted");
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));

    await act(async () => result.current.startSignIn("apple"));
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "signin_failed",
      targetProvider: "apple",
    });
    expect(JSON.stringify(result.current)).not.toContain("must-not-survive");

    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "signin",
      targetProvider: "apple",
    });
    expect(seam.appleAuthorize).toHaveBeenCalledOnce();
    expect(proofPosts).toBe(0);
  });

  it("recognizes the Google plugin's interactive cancellation code", async () => {
    seam.native = true;
    seam.googleProof.mockRejectedValue({ code: "USER_CANCELLED" });
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "cancel-google",
          purpose: "signin",
          targetProvider: "google",
          expiresAt: "soon",
          provider: "google",
          stage: "signin",
          nonce: "nonce",
          state: "state",
          bindingSecret: "binding",
        });
      }
      return new Response(null, { status: 204 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("google"));
    expect(result.current.view.kind).toBe("cancelled");
  });

  it("maps a native proof rejection to its allowlisted code and erases the attempt", async () => {
    seam.native = true;
    seam.appleAuthorize.mockResolvedValue({
      idToken: "id",
      authorizationCode: "code",
      state: "state",
    });
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "bad-proof",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "apple",
          stage: "signin",
          nonce: "nonce",
          state: "state",
          bindingSecret: "binding",
        });
      }
      if (path === "/api/auth/native/attempts/bad-proof/proof") {
        return ok({ error: "invalid_proof" }, 401);
      }
      if (path === "/api/auth/native/attempts/bad-proof/cancel") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("apple"));
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "invalid_proof",
      targetProvider: "apple",
    });
  });

  it("finishes both nonce-bound native link proofs and finalizes", async () => {
    seam.native = true;
    seam.googleProof.mockResolvedValue({ idToken: "google-id" });
    seam.appleAuthorize.mockResolvedValue({
      idToken: "apple-id",
      authorizationCode: "apple-code",
      state: "apple-state",
    });
    let proof = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "link-complete",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "google",
          stage: "reauth",
          nonce: "google-nonce",
          state: "google-state",
          bindingSecret: "binding",
        });
      }
      if (path === "/api/auth/native/attempts/link-complete/proof") {
        proof += 1;
        return ok(
          proof === 1
            ? {
                outcome: "authorize",
                attemptId: "link-complete",
                purpose: "link",
                targetProvider: "apple",
                expiresAt: "soon",
                provider: "apple",
                stage: "target",
                nonce: "apple-nonce",
                state: "apple-state",
              }
            : {
                outcome: "link_ready",
                attemptId: "link-complete",
                purpose: "link",
                targetProvider: "apple",
                expiresAt: "soon",
              },
        );
      }
      if (path === "/api/auth/native/attempts/link-complete/finalize") {
        return ok({ outcome: "linked" });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.prepareLink("apple"));
    await act(async () => result.current.startPreparedLink());
    await act(async () => result.current.authorizeLinkTarget());
    expect(result.current.view).toStrictEqual({
      kind: "linked",
      targetProvider: "apple",
    });
  });

  it.each([
    ["/?authResult=signed_in", { signedCalls: 1, kind: "idle" }],
    [
      "/?authResult=cancelled&authPurpose=link&authProvider=google",
      { signedCalls: 0, kind: "cancelled" },
    ],
    [
      "/?authError=made_up&authPurpose=signin",
      { signedCalls: 0, kind: "error" },
    ],
  ])("consumes terminal web return %s", async (url, expected) => {
    window.history.replaceState(null, "", url);
    seam.api.mockResolvedValue(ok(options));
    const onSignedIn = vi.fn();
    const { result } = renderHook(() => useAuthFlow(onSignedIn));
    await waitFor(() =>
      expect({
        signedCalls: onSignedIn.mock.calls.length,
        kind: result.current.view.kind,
      }).toStrictEqual(expected),
    );
    expect(window.location.search).toBe("");
  });

  it("preserves and scrubs a web access denial with its verified relay email", async () => {
    window.history.replaceState(
      null,
      "",
      "/?keep=1&authError=access_denied&authEmail=relay%40privaterelay.appleid.com&authPurpose=signin&authProvider=apple#return",
    );
    seam.api.mockResolvedValue(ok(options));
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("error"));
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "access_denied",
      email: "relay@privaterelay.appleid.com",
      targetProvider: "apple",
    });
    expect(window.location.search).toBe("?keep=1");
    expect(window.location.hash).toBe("#return");
  });

  it("preserves a native JSON access denial with the server-provided account email", async () => {
    seam.native = true;
    seam.appleAuthorize.mockResolvedValue({
      idToken: "id",
      authorizationCode: "code",
      state: "state",
    });
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "denied-native",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "apple",
          stage: "signin",
          nonce: "nonce",
          state: "state",
          bindingSecret: "binding",
        });
      }
      if (path === "/api/auth/native/attempts/denied-native/proof") {
        return ok({ error: "access_denied", email: "saved@example.test" }, 403);
      }
      if (path === "/api/auth/native/attempts/denied-native/cancel") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("apple"));
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "access_denied",
      email: "saved@example.test",
      targetProvider: "apple",
    });
  });

  it("keeps access denial actionable when its cleanup acknowledgement is lost", async () => {
    seam.native = true;
    seam.appleAuthorize.mockResolvedValue({
      idToken: "id",
      authorizationCode: "code",
      state: "state",
    });
    let cancellations = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "denied-cleanup-retry",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "apple",
          stage: "signin",
          nonce: "nonce",
          state: "state",
          bindingSecret: "binding",
        });
      }
      if (path === "/api/auth/native/attempts/denied-cleanup-retry/proof") {
        return ok({ error: "access_denied", email: "saved@example.test" }, 403);
      }
      if (path === "/api/auth/native/attempts/denied-cleanup-retry/cancel") {
        cancellations += 1;
        if (cancellations === 1) throw new Error("acknowledgement lost");
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));

    await act(async () => result.current.startSignIn("apple"));
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "access_denied",
      email: "saved@example.test",
      targetProvider: "apple",
    });

    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "signin",
      targetProvider: "apple",
    });
    expect(cancellations).toBe(2);
  });

  it("retains the operation when server-error cleanup has no acknowledgement", async () => {
    seam.native = true;
    seam.appleAuthorize.mockResolvedValue({
      idToken: "id",
      authorizationCode: "code",
      state: "state",
    });
    let cancellations = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "authorize",
          attemptId: "server-error-cancel-retry",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "apple",
          stage: "signin",
          nonce: "nonce",
          state: "state",
          bindingSecret: "binding",
        });
      }
      if (
        path === "/api/auth/native/attempts/server-error-cancel-retry/proof"
      ) {
        return ok({ error: "invalid_proof" }, 400);
      }
      if (
        path === "/api/auth/native/attempts/server-error-cancel-retry/cancel"
      ) {
        cancellations += 1;
        if (cancellations === 1) throw new Error("acknowledgement lost");
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));

    await act(async () => result.current.startSignIn("apple"));
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "signin_failed",
      targetProvider: "apple",
    });

    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "signin",
      targetProvider: "apple",
    });
    expect(cancellations).toBe(2);
  });

  it("refuses direct link entry unless both providers are available on this surface", async () => {
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") {
        return ok({
          ...options,
          apple: { native: false, web: false },
          google: { native: true, web: true },
        });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.prepareLink("apple"));
    await act(async () => result.current.startPreparedLink());
    expect(result.current.view).toStrictEqual({ kind: "idle" });
    expect(seam.api).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/?authResult=cancelled&authPurpose=signin", "cancelled", undefined],
    [
      "/?authError=account_conflict&authPurpose=signin",
      "error",
      "account_conflict",
    ],
  ])(
    "keeps an unbound generic return providerless: %s",
    async (url, kind, code) => {
      window.history.replaceState(null, "", url);
      seam.api.mockResolvedValue(ok(options));
      const { result } = renderHook(() => useAuthFlow(() => {}));
      await waitFor(() => expect(result.current.view.kind).toBe(kind));
      expect(result.current.view).toStrictEqual({
        kind,
        purpose: "signin",
        ...(code ? { code } : {}),
      });
      expect(window.location.search).toBe("");
    },
  );

  it.each([
    null,
    {},
    { apple: {} },
    { apple: { native: true, web: true }, google: {} },
  ])("falls back when options are malformed: %j", async (body) => {
    seam.api.mockResolvedValue(ok(body));
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() =>
      expect(result.current.options).toStrictEqual({
        state: "ready",
        frontDoorEnabled: false,
        legacyGoogle: true,
        apple: false,
        google: true,
      }),
    );
  });

  it("resumes a web target proof, navigates it, and cancels the bound operation", async () => {
    window.history.replaceState(null, "", "/?authAttempt=web-link");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/web-link") {
        return ok({
          outcome: "authorize",
          attemptId: "web-link",
          purpose: "link",
          targetProvider: "google",
          expiresAt: "soon",
          provider: "google",
          stage: "target",
          nonce: "nonce",
          state: "state",
          authorizationUrl: "https://accounts.example/target",
        });
      }
      if (path === "/api/auth/web/attempts/web-link/cancel") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() =>
      expect(result.current.view.kind).toBe("link_authorize"),
    );
    await act(async () => result.current.authorizeLinkTarget());
    expect(seam.navigateWeb).toHaveBeenCalledWith(
      "https://accounts.example/target",
    );
    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "link",
      targetProvider: "google",
    });
  });

  it("resumes link_ready and performs web finalization", async () => {
    window.history.replaceState(null, "", "/?authAttempt=web-ready");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/web-ready") {
        return ok({
          outcome: "link_ready",
          attemptId: "web-ready",
          purpose: "link",
          targetProvider: "google",
          expiresAt: "soon",
        });
      }
      if (path === "/api/auth/web/attempts/web-ready/finalize") {
        return ok({ outcome: "linked" });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("linked"));
    expect(result.current.view).toStrictEqual({
      kind: "linked",
      targetProvider: "google",
    });
  });

  it.each([
    [ok({ error: "rate_limited" }, 429), "rate_limited"],
    [new Response("not-json", { status: 500 }), "signin_failed"],
  ])(
    "maps a failed web resume without surfacing its body",
    async (response, code) => {
      window.history.replaceState(
        null,
        "",
        "/?authAttempt=failed&authProvider=apple",
      );
      seam.api.mockImplementation(async (path: string) =>
        path === "/api/auth/options" ? ok(options) : response,
      );
      const { result } = renderHook(() => useAuthFlow(() => {}));
      await waitFor(() => expect(result.current.view.kind).toBe("error"));
      expect(result.current.view).toStrictEqual({
        kind: "error",
        purpose: "signin",
        code,
        targetProvider: "apple",
      });
    },
  );

  it("confirms a native account with its binding and stores the session token", async () => {
    seam.native = true;
    let confirmBody: unknown;
    seam.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts") {
        return ok({
          outcome: "confirm",
          attemptId: "native-confirm",
          purpose: "signin",
          targetProvider: "google",
          expiresAt: "soon",
          profile: { email: "maya@example.com", name: "Maya" },
          bindingSecret: "binding",
        });
      }
      if (path === "/api/auth/native/attempts/native-confirm/confirm") {
        confirmBody = JSON.parse(init!.body as string);
        return ok({
          outcome: "signed_in",
          user: { id: "u1", email: "maya@example.com", name: "Maya" },
          expiresAt: "later",
          token: "session-token",
        });
      }
      throw new Error(`unexpected ${path}`);
    });
    const onSignedIn = vi.fn();
    const { result } = renderHook(() => useAuthFlow(onSignedIn));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("google"));
    await act(async () => result.current.confirmAccount());
    expect(confirmBody).toStrictEqual({ bindingSecret: "binding" });
    expect(seam.storeToken).toHaveBeenCalledWith("session-token");
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it("rejects native signed_in without an Ergomatic token", async () => {
    seam.native = true;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      return ok({
        outcome: "signed_in",
        user: { id: "u1", email: "maya@example.com", name: "Maya" },
        expiresAt: "later",
      });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("google"));
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "signin_failed",
      targetProvider: "google",
    });
  });

  it("makes controller guards and an empty cancel safe no-ops", async () => {
    seam.api.mockResolvedValue(ok(options));
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.confirmAccount());
    await act(async () => result.current.useUsualSignIn());
    await act(async () => result.current.startPreparedLink());
    await act(async () => result.current.authorizeLinkTarget());
    await act(async () => result.current.cancel());
    expect(result.current.view).toStrictEqual({
      kind: "cancelled",
      purpose: "signin",
    });
  });
});
