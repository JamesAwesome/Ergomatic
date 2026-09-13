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
  nativeGoogleProof: seam.googleProof,
  nativeGoogleProofAfterInit: seam.googleProof,
  nativeSignOut: seam.nativeSignOut,
}));
vi.mock("../native/session", () => ({ storeToken: seam.storeToken }));
vi.mock("./webNavigate", () => ({ navigateWeb: seam.navigateWeb }));

import { useAuthFlow } from "./authFlow";
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
    act(() => result.current.prepareLink("apple"));
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
    act(() => auth.prepareLink("apple"));
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
          <button onClick={() => auth.prepareLink("apple")}>Add Apple</button>
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

  it("keeps a newly prepared link when an older provider cancellation finishes cleanup", async () => {
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
          <button onClick={() => auth.prepareLink("apple")}>Add Apple</button>
          <button onClick={() => auth.prepareLink("google")}>Add Google</button>
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
    expect(screen.getByRole("heading", { name: "Add Google" })).toBeVisible();
    await act(async () => {
      cancelResponse.resolve(new Response(null, { status: 204 }));
      await Promise.resolve();
    });
    expect(auth.view).toStrictEqual({
      kind: "link_confirm",
      targetProvider: "google",
    });
    expect(screen.getByRole("heading", { name: "Add Google" })).toBeVisible();
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
      throw new Error(`unexpected ${path}`);
    });

    let auth!: ReturnType<typeof useAuthFlow>;
    function Harness() {
      auth = useAuthFlow(() => {});
      return (
        <>
          <button onClick={() => auth.prepareLink("google")}>Add Google</button>
          <button onClick={() => auth.prepareLink("apple")}>Add Apple</button>
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
    act(() => result.current.prepareLink("apple"));
    await act(async () => result.current.startPreparedLink());

    expect(seam.googleProof).toHaveBeenCalledWith("reauth-nonce");
    expect(result.current.view).toStrictEqual({
      kind: "link_authorize",
      targetProvider: "apple",
      provider: "apple",
      existingProofComplete: true,
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
    act(() => result.current.prepareLink("google"));
    act(() => result.current.abandon());
    expect(result.current.view).toStrictEqual({ kind: "idle" });
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
    act(() => result.current.prepareLink("apple"));
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
