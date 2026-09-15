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
  clearToken: vi.fn(),
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
vi.mock("../native/session", () => ({
  storeToken: seam.storeToken,
  clearToken: seam.clearToken,
}));
vi.mock("./webNavigate", () => ({ navigateWeb: seam.navigateWeb }));

import { destinationFor, useAuthFlow } from "./authFlow";
import type { AuthFlowController, AuthFlowView } from "./authFlow";
import LinkSignInMethod from "../auth/LinkSignInMethod";
import You from "../You";
import DeleteAccount from "../you/DeleteAccount";

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
  seam.clearToken.mockReset();
  seam.clearToken.mockResolvedValue(undefined);
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

  // WAVE A PR2 REPLACES BOTH OF THE TESTS THAT WERE HERE. They asserted the
  // dead end: `useUsualSignIn` cancelled the attempt, destroying a subject the
  // rower had just proved, and the second covered a retry of that cancel. The
  // attempt is now carried forward, so a cancel on this path is not a step
  // whose failure needs retrying — it is not a step at all. Replaced rather
  // than deleted, so the change of contract is visible in the file.
  it("PR2: useUsualSignIn carries the attempt forward instead of cancelling it", async () => {
    window.history.replaceState(null, "", "/?authAttempt=usual");
    let cancelled = false;
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
      if (path === "/api/auth/web/attempts/usual/follow-through") {
        return ok({
          outcome: "authorize",
          attemptId: "usual",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "google",
          stage: "reauth",
          nonce: "n2",
          state: "s2",
          authorizationUrl: "https://accounts.google.test/authorize",
        });
      }
      if (path === "/api/auth/web/attempts/usual/cancel") {
        cancelled = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));
    await act(async () => result.current.useUsualSignIn());
    // THE CONSEQUENCE, not the absence of a call: the attempt survived and
    // the flow advanced to the rower's usual provider carrying it.
    expect(cancelled).toBe(false);
    expect(seam.navigateWeb).toHaveBeenCalledWith(
      "https://accounts.google.test/authorize",
    );
  });

  // THE TESTS NO TYPE CAN REPLACE. Widening `AuthStep`'s `link_ready` member
  // breaks the SERVER producer and produces ZERO client errors (measured), so
  // the client's obligation to consume the delivered session is covered here
  // or nowhere. Both drive the REAL resume path — `?authAttempt=` is exactly
  // how a web rower returning from their provider arrives — rather than a
  // seam added to production for a test's convenience.
  // NO `token`, BECAUSE `view()` SENDS NONE. This fixture is served from
  // `/api/auth/web/attempts/ft`, the web RE-READ endpoint, and the browser
  // already holds the session cookie — so a token here would be a field
  // production never sends, and asserting against it is RF24's exact shape:
  // a gate that cannot fail on the one defect that matters. An earlier
  // version of this fixture carried one, and the whole web follow-through
  // was dead behind it.
  const session = {
    outcome: "signed_in",
    user: { id: "u1", email: "maya@test", name: "Maya Chen" },
    expiresAt: "later",
  };
  function resumeAs(step: Record<string, unknown>, onFinalize?: () => void) {
    return async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/ft") return ok(step);
      if (path === "/api/auth/web/attempts/ft/finalize") {
        onFinalize?.();
        return ok({ outcome: "linked" });
      }
      if (path === "/api/auth/web/attempts/ft/cancel")
        return new Response(null, { status: 204 });
      throw new Error(`unexpected ${path}`);
    };
  }
  const readyStep = (purpose: "signin" | "link") => ({
    outcome: "link_ready",
    attemptId: "ft",
    purpose,
    targetProvider: "apple",
    expiresAt: "soon",
    profile: { email: "relay@apple.test", name: "Rower" },
    session: purpose === "signin" ? session : null,
  });

  it("PR2: a signin link_ready shows the confirmation and attaches NOTHING", async () => {
    window.history.replaceState(null, "", "/?authAttempt=ft");
    let finalized = false;
    seam.api.mockImplementation(
      resumeAs(readyStep("signin"), () => {
        finalized = true;
      }),
    );
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() =>
      expect(result.current.view.kind).toBe("attach_confirm"),
    );
    // James's confirm-after-the-proof ruling, gated in the client: NO attach
    // happened, and the screen names BOTH identities — the carried one and
    // the account it would join.
    expect(finalized).toBe(false);
    expect(result.current.view).toStrictEqual({
      kind: "attach_confirm",
      targetProvider: "apple",
      carried: { email: "relay@apple.test", name: "Rower" },
      account: { id: "u1", email: "maya@test", name: "Maya Chen" },
    });
  });

  // THE WINDOW BETWEEN THE TAP AND THE ANSWER, which is where this defect
  // has now hidden four times. Both exits leave the confirmation on screen,
  // inert, until their request answers — and BOTH FRAMES that draw it read
  // the identities off the `busy` view, so a `busy` that drops them is the
  // native rower watching the screen fall through to the welcome page.
  //
  // It is asserted at THIS layer, and for both exits, because the screen
  // tests can only assert what a view already carries. Dropping the payload
  // from `declineAttach` alone reddened nothing across 163 of them.
  it.each([
    ["confirmAttach", (flow: AuthFlowController) => flow.confirmAttach()],
    ["declineAttach", (flow: AuthFlowController) => flow.declineAttach()],
  ])(
    "PR2: %s keeps the identities on screen until its request answers",
    async (_name, exit) => {
      window.history.replaceState(null, "", "/?authAttempt=ft");
      const held = deferred<Response>();
      seam.api.mockImplementation(async (path: string) => {
        if (path === "/api/auth/options") return ok(options);
        if (path === "/api/auth/web/attempts/ft")
          return ok(readyStep("signin"));
        // BOTH EXITS' REQUESTS ARE HELD, so the in-flight view is observable
        // rather than raced past. Releasing them is the last step.
        if (
          path === "/api/auth/web/attempts/ft/finalize" ||
          path === "/api/auth/web/attempts/ft/cancel"
        )
          return held.promise;
        throw new Error(`unexpected ${path}`);
      });
      const { result } = renderHook(() => useAuthFlow(() => {}));
      await waitFor(() =>
        expect(result.current.view.kind).toBe("attach_confirm"),
      );
      act(() => void exit(result.current));
      await waitFor(() => expect(result.current.view.kind).toBe("busy"));
      expect(result.current.view).toStrictEqual({
        kind: "busy",
        purpose: "signin",
        attaching: {
          targetProvider: "apple",
          carried: { email: "relay@apple.test", name: "Rower" },
          account: { id: "u1", email: "maya@test", name: "Maya Chen" },
        },
      });
      await act(async () => {
        held.resolve(ok({ outcome: "linked" }));
      });
      await waitFor(() => expect(result.current.view.kind).toBe("attached"));
    },
  );

  it("PR2: a LINK link_ready still finalizes immediately, unchanged", async () => {
    window.history.replaceState(null, "", "/?authAttempt=ft");
    let finalized = false;
    seam.api.mockImplementation(
      resumeAs(readyStep("link"), () => {
        finalized = true;
      }),
    );
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("linked"));
    // The shipped behaviour, protected. A rower who started from You already
    // consented on the way in; making THEM confirm twice would be the fix
    // overshooting into the flow it was not about.
    expect(finalized).toBe(true);
  });

  it("PR2: confirming the attach signs the rower in and lands them on Today", async () => {
    window.history.replaceState(null, "", "/?authAttempt=ft");
    const onSignedIn = vi.fn();
    seam.api.mockImplementation(resumeAs(readyStep("signin")));
    const { result } = renderHook(() => useAuthFlow(onSignedIn));
    await waitFor(() =>
      expect(result.current.view.kind).toBe("attach_confirm"),
    );
    await act(async () => result.current.confirmAttach());
    // Gate 0 ruling: Today, signed in, NO notice. ASSERT THE DESTINATION,
    // not just the view — every earlier version of this test checked
    // `{kind:"idle"}` and `onSignedIn`, which stayed true while the rower was
    // silently being left on You. A view assertion cannot see a landing.
    expect(result.current.view).toStrictEqual({ kind: "attached" });
    expect(result.current.destination).toBe("/");
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it("PR2: a failed attach still lands a signed-in rower in the app", async () => {
    window.history.replaceState(null, "", "/?authAttempt=ft");
    const onSignedIn = vi.fn();
    let finalizeAttempts = 0;
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/web/attempts/ft/finalize") {
        finalizeAttempts += 1;
        return ok({ error: "signin_failed" }, 503);
      }
      return resumeAs(readyStep("signin"))(path);
    });
    const { result } = renderHook(() => useAuthFlow(onSignedIn));
    await waitFor(() =>
      expect(result.current.view.kind).toBe("attach_confirm"),
    );
    await act(async () => result.current.confirmAttach());
    // By this point the session was minted and the rower is authenticated.
    // A "That sign-in didn't work" screen would be false twice over — the
    // sign-in worked, and what failed was the attach.
    expect(result.current.view).toStrictEqual({ kind: "attached" });
    expect(result.current.destination).toBe("/");
    expect(onSignedIn).toHaveBeenCalledOnce();
    // THE END STATE ALONE CANNOT TELL A FAILED ATTACH FROM A SUCCESSFUL ONE —
    // the success test asserts the same `attached` + one `onSignedIn`. Pin the
    // attempt itself, so a mutation that stops `postJson` throwing is caught
    // here rather than passing as "the rower ended up in the app".
    expect(finalizeAttempts).toBe(1);
  });

  it("PR2: Not now leaves them signed in, with nothing attached", async () => {
    window.history.replaceState(null, "", "/?authAttempt=ft");
    const onSignedIn = vi.fn();
    let finalized = false;
    seam.api.mockImplementation(
      resumeAs(readyStep("signin"), () => {
        finalized = true;
      }),
    );
    const { result } = renderHook(() => useAuthFlow(onSignedIn));
    await waitFor(() =>
      expect(result.current.view.kind).toBe("attach_confirm"),
    );
    await act(async () => result.current.declineAttach());
    // REFUSING IS NOT CANCELLING. The session was earned by the rower's own
    // credential at their own provider, so they stay signed in; only the
    // attach is declined.
    expect(finalized).toBe(false);
    expect(result.current.view).toStrictEqual({ kind: "attached" });
    expect(result.current.destination).toBe("/");
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  // NATIVE, AND IT IS THE HALF THAT MATTERS. The web tests above left two
  // things ungated, measured with mutations: deleting `storeToken` reddened
  // nothing, and reverting `authorizeNative`'s call site to `finalizeLink` —
  // the exact incomplete fix revision 4 prescribed — also reddened nothing,
  // because nothing drove the native route. Native is the primary surface and
  // `authorizeNative` RETURNS before `acceptStep` is reached, so a web-only
  // suite cannot see either.
  it("PR2 native: the follow-through stores the session and confirms before attaching", async () => {
    seam.native = true;
    let finalized = false;
    seam.googleProof.mockResolvedValue({ idToken: "google-id-token" });
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts")
        return ok({
          outcome: "confirm",
          attemptId: "nft",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          profile: { email: "relay@apple.test", name: "Rower" },
          bindingSecret: "binding",
        });
      if (path === "/api/auth/native/attempts/nft/follow-through")
        return ok({
          outcome: "authorize",
          attemptId: "nft",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          provider: "google",
          stage: "reauth",
          nonce: "n2",
          state: "s2",
        });
      if (path === "/api/auth/native/attempts/nft/proof")
        return ok({
          outcome: "link_ready",
          attemptId: "nft",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          profile: { email: "relay@apple.test", name: "Rower" },
          session: {
            outcome: "signed_in",
            user: { id: "u1", email: "maya@test", name: "Maya Chen" },
            expiresAt: "later",
            token: "adopted-token",
          },
        });
      if (path === "/api/auth/native/attempts/nft/finalize") {
        finalized = true;
        return ok({ outcome: "linked" });
      }
      throw new Error(`unexpected ${path}`);
    });
    const onSignedIn = vi.fn();
    const { result } = renderHook(() => useAuthFlow(onSignedIn));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startSignIn("apple"));
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));

    await act(async () => result.current.useUsualSignIn());
    await waitFor(() =>
      expect(result.current.view.kind).toBe("attach_confirm"),
    );
    // THE TOKEN IS STORED BEFORE ANYTHING ELSE. `finalize` sits behind
    // `requireUser`; without this the phone would answer 401 on a flow that
    // had already succeeded on the server.
    expect(seam.storeToken).toHaveBeenCalledWith("adopted-token");
    // AND NOTHING WAS ATTACHED YET, on the surface where the missed call
    // site would have attached silently.
    expect(finalized).toBe(false);
    expect(onSignedIn).not.toHaveBeenCalled();

    await act(async () => result.current.confirmAttach());
    expect(finalized).toBe(true);
    expect(result.current.view).toStrictEqual({ kind: "attached" });
    expect(result.current.destination).toBe("/");
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it("PR2: a failed follow-through leaves the rower a way forward", async () => {
    window.history.replaceState(null, "", "/?authAttempt=usual-fail");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/usual-fail") {
        return ok({
          outcome: "confirm",
          attemptId: "usual-fail",
          purpose: "signin",
          targetProvider: "apple",
          expiresAt: "soon",
          profile: { email: "relay@apple.test", name: "Rower" },
        });
      }
      if (path === "/api/auth/web/attempts/usual-fail/follow-through") {
        return ok({ error: "signin_failed" }, 503);
      }
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.view.kind).toBe("confirm"));
    await act(async () => result.current.useUsualSignIn());
    // PR #444 spent a Gate 0 on this screen's dead ends. A follow-through
    // that fails does not get to grow a new one: the rower lands on an
    // error state that names the purpose and the provider, which is what
    // the sign-in screen renders its recovery from.
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "signin",
      code: "signin_failed",
      targetProvider: "apple",
    });
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
    // `attach_confirm` ROUTES TO THE AUTH SURFACE, not "/", and the reason is
    // the defect it was shipped with. `onSignedIn` is withheld until the
    // rower chooses, so on NATIVE `me` stays out and `App` renders `SignIn`
    // directly, ignoring routes. On WEB the callback sets the session cookie
    // before its 303, so the return resolves `me` IN — and "/" in the
    // signed-in tree is Today, which left the rower in the app with the
    // confirmation set on a component that had no frame.
    ["attach_confirm", "/you/sign-in-methods"],
    // The terminal both exits reach. It draws nothing — it exists so the
    // rower is routed HOME rather than left standing on the auth surface,
    // where the route's own fallback would send them to You.
    ["attached", "/"],
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
        : kind === "attach_confirm"
          ? {
              kind,
              targetProvider: "apple",
              carried: { email: "", name: "" },
              account: { id: "u1", email: "", name: "" },
            }
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

  it("resumes a web delete return into the delete_ready view", async () => {
    // The supported producer: the delete callback redirects to
    // `/?authAttempt=<id>` and this effect GETs the attempt. Without
    // acceptStep's delete_ready branch nothing sets the view and the rower
    // who has just re-proved their provider sees no transition at all.
    window.history.replaceState(null, "", "/?authAttempt=delete-1");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/delete-1")
        return ok({
          outcome: "delete_ready",
          attemptId: "delete-1",
          purpose: "delete",
          targetProvider: "google",
          expiresAt: "2026-09-13T00:05:00.000Z",
        });
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() =>
      expect(result.current.view).toStrictEqual({ kind: "delete_ready" }),
    );
    // Task 4: the confirm screen lives on the auth-flow route.
    expect(result.current.destination).toBe("/you/sign-in-methods");
  });
  // RF24's seam, on the client. `removeMethod` writes server-side and
  // `useAuthMethods` is the read; if the refresh key does not move, the row
  // keeps rendering CONNECTED with a live Remove for a provider that is
  // already gone. The test therefore CLICKS THROUGH the real control rather
  // than rendering a fixture, and starts upstream of the write.
  it("stops showing a method as connected once it is removed", async () => {
    let reads = 0;
    let unlinks = 0;
    seam.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/methods") {
        reads += 1;
        return ok(
          reads === 1
            ? { apple: true, google: true }
            : { apple: false, google: true },
        );
      }
      if (path === "/api/auth/methods/apple" && init?.method === "DELETE") {
        unlinks += 1;
        return ok({ outcome: "unlinked", appleRevoked: true });
      }
      return new Response(null, { status: 404 });
    });
    let auth!: ReturnType<typeof useAuthFlow>;
    function Harness() {
      auth = useAuthFlow(() => {});
      return (
        <MemoryRouter>
          <You
            user={{ id: "rower", name: "Rower", email: "rower@example.test" }}
            onSignedOut={() => {}}
            authFlow={auth}
          />
        </MemoryRouter>
      );
    }
    render(<Harness />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove Apple" }),
    );
    expect(
      await screen.findByRole("button", { name: "Add Apple" }),
    ).toBeInTheDocument();
    expect(unlinks).toBe(1);
    expect(reads).toBe(2);
  });

  // A SECOND TAP IS NOT A SECOND REMOVAL. `removeMethod` sets `busy` and
  // the methods screen draws nothing for it, so the control has to go
  // inert on its own or the round trip stays tappable: two DELETEs, the
  // second answering `not_connected`, which renders a refusal notice for a
  // removal that actually succeeded.
  it("goes inert for the whole removal, so one tap cannot become two DELETEs", async () => {
    const unlink = deferred<Response>();
    let deletes = 0;
    seam.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/methods")
        return ok({ apple: true, google: true });
      if (path === "/api/auth/methods/apple" && init?.method === "DELETE") {
        deletes += 1;
        return unlink.promise;
      }
      return new Response(null, { status: 404 });
    });
    let auth!: ReturnType<typeof useAuthFlow>;
    function Harness() {
      auth = useAuthFlow(() => {});
      return (
        <MemoryRouter>
          <You
            user={{ id: "rower", name: "Rower", email: "rower@example.test" }}
            onSignedOut={() => {}}
            authFlow={auth}
          />
        </MemoryRouter>
      );
    }
    render(<Harness />);
    const remove = await screen.findByRole("button", { name: "Remove Apple" });
    await userEvent.click(remove);
    expect(screen.getByRole("button", { name: "Remove Apple" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Remove Apple" }));
    expect(deletes).toBe(1);
    await act(async () => {
      unlink.resolve(ok({ outcome: "unlinked", appleRevoked: true }));
      await unlink.promise;
    });
    expect(auth.view).toStrictEqual({ kind: "unlinked", provider: "apple" });
  });

  // All four unlink outcomes are HTTP 200. Reading the status tells you
  // nothing; only the body says what happened.
  it.each([["last_provider"], ["not_connected"], ["account_gone"]] as const)(
    "reads a refused unlink (%s) out of the body, not the status",
    async (outcome) => {
      seam.api.mockImplementation(async (path: string) => {
        if (path === "/api/auth/options") return ok(options);
        if (path === "/api/auth/methods/apple") return ok({ outcome });
        return new Response(null, { status: 404 });
      });
      const { result } = renderHook(() => useAuthFlow(() => {}));
      await waitFor(() => expect(result.current.options.state).toBe("ready"));
      await act(async () => result.current.removeMethod("apple"));
      expect(result.current.view).toStrictEqual({
        kind: "unlink_refused",
        provider: "apple",
        reason: outcome,
      });
    },
  );

  // `appleRevoked` is vacuously true for a Google unlink -- no Apple call
  // happens there at all -- so the view must carry no trace of it. This
  // asserts the whole object, which is what makes the absence load-bearing.
  it("never carries an Apple revoke claim out of a Google removal", async () => {
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/methods/google")
        return ok({ outcome: "unlinked", appleRevoked: true });
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.removeMethod("google"));
    expect(result.current.view).toStrictEqual({
      kind: "unlinked",
      provider: "google",
    });
  });

  it("keeps a failed removal separate from a refused one, and carries the server's code", async () => {
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/methods/apple")
        return ok({ error: "rate_limited" }, 429);
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.removeMethod("apple"));
    expect(result.current.view).toStrictEqual({
      kind: "unlink_failed",
      provider: "apple",
      code: "rate_limited",
    });
  });

  it("survives a removal the network never answered", async () => {
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/methods/apple") throw new TypeError("offline");
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.removeMethod("apple"));
    expect(result.current.view).toStrictEqual({
      kind: "unlink_failed",
      provider: "apple",
      code: "signin_failed",
    });
  });

  // Finding I1: the return-parameter reader used to coerce every purpose it
  // did not recognise to "signin", so a failed delete re-auth landed a
  // signed-in rower on a screen that renders no signin notice at all --
  // nothing happened, as far as the rower could tell.
  it("keeps a failed web delete on the delete purpose", async () => {
    window.history.replaceState(
      null,
      "",
      "/?authError=invalid_proof&authPurpose=delete&authProvider=google",
    );
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() =>
      expect(result.current.view).toStrictEqual({
        kind: "error",
        purpose: "delete",
        code: "invalid_proof",
        targetProvider: "google",
      }),
    );
    expect(result.current.destination).toBe("/you");
  });

  it("hands the erg's own delete route a re-proof attempt, not a sign-in", async () => {
    const bodies: string[] = [];
    seam.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts") {
        bodies.push(String(init?.body));
        return ok({
          outcome: "authorize",
          attemptId: "del-9",
          purpose: "delete",
          targetProvider: "google",
          expiresAt: "2026-09-13T00:05:00.000Z",
          provider: "google",
          stage: "reauth",
          nonce: "n",
          state: "s",
          authorizationUrl: "https://accounts.example.test/authorize",
        });
      }
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startDelete("google"));
    expect(bodies).toStrictEqual([
      JSON.stringify({ purpose: "delete", provider: "google" }),
    ]);
    expect(seam.navigateWeb).toHaveBeenCalledWith(
      "https://accounts.example.test/authorize",
    );
  });

  it("deletes through the live session and reports Apple's own outcome", async () => {
    const calls: string[] = [];
    let refetched = 0;
    // The supported producer: the web callback lands on `/?authAttempt=<id>`
    // and the return effect reads the attempt out to `delete_ready`.
    window.history.replaceState(null, "", "/?authAttempt=del-9");
    seam.api.mockImplementation(async (path: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/del-9")
        return ok({
          outcome: "delete_ready",
          attemptId: "del-9",
          purpose: "delete",
          targetProvider: "google",
          expiresAt: "2026-09-13T00:05:00.000Z",
        });
      if (path === "/api/auth/web/attempts/del-9/delete")
        return ok({ outcome: "deleted", appleRevoked: false });
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => refetched++));
    await waitFor(() =>
      expect(result.current.view).toStrictEqual({ kind: "delete_ready" }),
    );
    await act(async () => result.current.confirmDelete());
    expect(calls).toContain("POST /api/auth/web/attempts/del-9/delete");
    expect(result.current.view).toStrictEqual({
      kind: "deleted",
      appleRevoked: false,
    });
    // `refetch` is how the app learns the session is gone: /api/me now 401s,
    // useMe becomes signed out, and the Welcome screen renders the notice.
    expect(refetched).toBe(1);
  });

  // L2-5: the OPPOSITE ordering to nativeSignOut. There the network call is
  // best-effort cleanup and the local clear goes first; here the call IS the
  // operation and the route is behind requireUser, so the token must still
  // be live when it runs.
  it("clears this device's credential only after the server confirms", async () => {
    seam.native = true;
    const order: string[] = [];
    seam.clearToken.mockImplementation(async () => {
      order.push("clear");
    });
    seam.appleAuthorize.mockResolvedValue({
      idToken: "apple-id-token",
      authorizationCode: "apple-code",
      state: "s",
    });
    seam.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/native/attempts")
        return ok({
          outcome: "authorize",
          attemptId: "del-n",
          purpose: "delete",
          targetProvider: "apple",
          expiresAt: "2026-09-13T00:05:00.000Z",
          provider: "apple",
          stage: "reauth",
          nonce: "n",
          state: "s",
          bindingSecret: "bind-n",
        });
      if (path === "/api/auth/native/attempts/del-n/proof")
        return ok({
          outcome: "delete_ready",
          attemptId: "del-n",
          purpose: "delete",
          targetProvider: "apple",
          expiresAt: "2026-09-13T00:05:00.000Z",
        });
      if (path === "/api/auth/native/attempts/del-n/delete") {
        order.push(`delete:${String(init?.body)}`);
        return ok({ outcome: "deleted", appleRevoked: true });
      }
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startDelete("apple"));
    await waitFor(() =>
      expect(result.current.view).toStrictEqual({ kind: "delete_ready" }),
    );
    await act(async () => result.current.confirmDelete());
    expect(order).toStrictEqual([
      `delete:${JSON.stringify({ bindingSecret: "bind-n" })}`,
      "clear",
    ]);
    expect(result.current.view).toStrictEqual({
      kind: "deleted",
      appleRevoked: true,
    });
  });

  // THE IRREVERSIBLE TWIN of the Remove test above, and the one that
  // actually costs something. Two POSTs means the second finds no session
  // and answers `account_changed`; landing after the first, it overwrites
  // `deleted` with an error the Welcome screen renders nothing for — the
  // account gone and the screen silent. Driven through the real control,
  // counting what the server saw.
  it("goes inert for the whole deletion, so one tap cannot become two POSTs", async () => {
    const del = deferred<Response>();
    let posts = 0;
    window.history.replaceState(null, "", "/?authAttempt=del-twice");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/del-twice")
        return ok({
          outcome: "delete_ready",
          attemptId: "del-twice",
          purpose: "delete",
          targetProvider: "google",
          expiresAt: "2026-09-14T00:05:00.000Z",
        });
      if (path === "/api/auth/web/attempts/del-twice/delete") {
        posts += 1;
        return del.promise;
      }
      return new Response(null, { status: 404 });
    });
    let auth!: ReturnType<typeof useAuthFlow>;
    function Harness() {
      auth = useAuthFlow(() => {});
      return <DeleteAccount auth={auth} onDeleted={() => {}} />;
    }
    render(<Harness />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    // The screen is still mounted — a redirect here would take it out from
    // under a request that has already committed server-side.
    expect(
      screen.getByRole("heading", { name: "Delete this account?" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete account" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete account" }),
    );
    expect(posts).toBe(1);
    await act(async () => {
      del.resolve(ok({ outcome: "deleted", appleRevoked: false }));
      await del.promise;
    });
    expect(auth.view).toStrictEqual({ kind: "deleted", appleRevoked: false });
  });

  // `cancel()` bumps the generation, which makes `confirmDelete`'s own
  // generation check swallow a success it has already committed: the
  // account is deleted and the app says cancelled, then keeps rendering a
  // signed-in You until the next /api/me 401s.
  it("puts Cancel out of reach while the deletion is in flight", async () => {
    const del = deferred<Response>();
    window.history.replaceState(null, "", "/?authAttempt=del-cancel");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/del-cancel")
        return ok({
          outcome: "delete_ready",
          attemptId: "del-cancel",
          purpose: "delete",
          targetProvider: "google",
          expiresAt: "2026-09-14T00:05:00.000Z",
        });
      if (path === "/api/auth/web/attempts/del-cancel/delete")
        return del.promise;
      if (path.endsWith("/cancel"))
        throw new Error("cancel must be unreachable");
      return new Response(null, { status: 404 });
    });
    let auth!: ReturnType<typeof useAuthFlow>;
    function Harness() {
      auth = useAuthFlow(() => {});
      return <DeleteAccount auth={auth} onDeleted={() => {}} />;
    }
    render(<Harness />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "← CANCEL" })).toBeDisabled();
    await act(async () => {
      del.resolve(ok({ outcome: "deleted", appleRevoked: true }));
      await del.promise;
    });
    expect(auth.view).toStrictEqual({ kind: "deleted", appleRevoked: true });
  });

  // A 200 means the account is gone; the deletion commits before the
  // response is written. An unreadable body cost an unhandled rejection
  // over an account that no longer exists.
  it("still reports a deletion whose 200 carried a body it could not read", async () => {
    window.history.replaceState(null, "", "/?authAttempt=del-garbage");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/del-garbage")
        return ok({
          outcome: "delete_ready",
          attemptId: "del-garbage",
          purpose: "delete",
          targetProvider: "google",
          expiresAt: "2026-09-14T00:05:00.000Z",
        });
      if (path === "/api/auth/web/attempts/del-garbage/delete")
        return new Response("<html>gateway</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() =>
      expect(result.current.view).toStrictEqual({ kind: "delete_ready" }),
    );
    await act(async () => result.current.confirmDelete());
    expect(result.current.view).toStrictEqual({
      kind: "deleted",
      appleRevoked: false,
    });
  });

  it("carries the server's own refusal code off a failed delete", async () => {
    window.history.replaceState(null, "", "/?authAttempt=del-x");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/del-x")
        return ok({
          outcome: "delete_ready",
          attemptId: "del-x",
          purpose: "delete",
          targetProvider: "google",
          expiresAt: "2026-09-13T00:05:00.000Z",
        });
      if (path === "/api/auth/web/attempts/del-x/delete")
        return ok({ error: "account_changed" }, 409);
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() =>
      expect(result.current.view).toStrictEqual({ kind: "delete_ready" }),
    );
    await act(async () => result.current.confirmDelete());
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "delete",
      code: "account_changed",
    });
    expect(result.current.destination).toBe("/you");
  });

  it("deletes nothing when no re-proved attempt is live", async () => {
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      throw new Error(`unexpected ${path}`);
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.confirmDelete());
    expect(result.current.view).toStrictEqual({ kind: "idle" });
  });

  // AN ATTEMPT IS NOT AN AUTHORISATION. A live LINK attempt carries the
  // same `attemptId` shape, and the guard is what stops `confirmDelete`
  // posting a delete against it — `!active` alone cannot, because here
  // there is an active operation.
  it("refuses to delete against a live attempt that proved something else", async () => {
    const posts: string[] = [];
    seam.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") posts.push(path);
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts")
        return ok({
          outcome: "authorize",
          attemptId: "link-live",
          purpose: "link",
          targetProvider: "apple",
          expiresAt: "2026-09-14T00:05:00.000Z",
          provider: "google",
          stage: "reauth",
          nonce: "n",
          state: "s",
        });
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.prepareLink("apple"));
    await act(async () => result.current.startPreparedLink());
    await act(async () => result.current.confirmDelete());
    expect(posts).not.toContain("/api/auth/web/attempts/link-live/delete");
    expect(result.current.view).not.toStrictEqual({
      kind: "deleted",
      appleRevoked: false,
    });
  });

  it("says nothing was deleted when the delete request never reached the server", async () => {
    window.history.replaceState(null, "", "/?authAttempt=del-offline");
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options") return ok(options);
      if (path === "/api/auth/web/attempts/del-offline")
        return ok({
          outcome: "delete_ready",
          attemptId: "del-offline",
          purpose: "delete",
          targetProvider: "google",
          expiresAt: "2026-09-14T00:05:00.000Z",
        });
      if (path === "/api/auth/web/attempts/del-offline/delete")
        throw new TypeError("offline");
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() =>
      expect(result.current.view).toStrictEqual({ kind: "delete_ready" }),
    );
    await act(async () => result.current.confirmDelete());
    expect(result.current.view).toStrictEqual({
      kind: "error",
      purpose: "delete",
      code: "signin_failed",
    });
  });

  it("refuses to start a delete on a provider this surface cannot re-prove", async () => {
    seam.api.mockImplementation(async (path: string) => {
      if (path === "/api/auth/options")
        return ok({ ...options, apple: { native: false, web: false } });
      return new Response(null, { status: 404 });
    });
    const { result } = renderHook(() => useAuthFlow(() => {}));
    await waitFor(() => expect(result.current.options.state).toBe("ready"));
    await act(async () => result.current.startDelete("apple"));
    expect(result.current.view).toStrictEqual({ kind: "idle" });
  });

  it.each([
    ["unlinked", null],
    ["unlink_refused", null],
    ["unlink_failed", null],
    ["deleted", null],
    ["delete_ready", "/you/sign-in-methods"],
  ] as const)("routes a %s view to %s", (kind, expected) => {
    const view = (
      kind === "unlinked"
        ? { kind, provider: "apple" }
        : kind === "unlink_refused"
          ? { kind, provider: "apple", reason: "last_provider" }
          : kind === "unlink_failed"
            ? { kind, provider: "apple", code: "signin_failed" }
            : kind === "deleted"
              ? { kind, appleRevoked: true }
              : { kind }
    ) as AuthFlowView;
    expect(destinationFor(view)).toStrictEqual(expected);
  });

  it("routes a terminal delete outcome back to the methods surface", () => {
    expect(
      destinationFor({ kind: "cancelled", purpose: "delete" }),
    ).toStrictEqual("/you");
    expect(
      destinationFor({
        kind: "error",
        purpose: "delete",
        code: "signin_failed",
      }),
    ).toStrictEqual("/you");
  });
});
