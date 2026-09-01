import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Web: tested against the REAL `adapters/appLifecycle.ts` (unmocked) —
// `isNative()` is always `false` under Vitest (no Capacitor native runtime
// in a browser context, `appLifecycle.ts`'s own comment states the same
// fact for its platform branch), so `registerAppLifecycleListener` really
// does take its genuine web no-op arm here, and the hook's own composition
// (plan correction 2: ride `registerWebAppLifecycleListener` directly on
// web) is what has to fire `cb`. Dispatching real `visibilitychange`
// exercises that composition end to end, the same shape
// `appLifecycle.test.ts` itself uses for the identical DOM event.

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../adapters/appLifecycle");
  vi.doUnmock("../adapters/externalBrowser");
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});

describe("useForegroundRefetch (web arm, real DOM)", () => {
  it("fires cb once when the tab becomes visible", async () => {
    const { useForegroundRefetch } = await import("./useForegroundRefetch");
    const cb = vi.fn();
    renderHook(() => useForegroundRefetch(cb));

    setVisibility("hidden");
    setVisibility("visible");

    expect(cb).toHaveBeenCalledOnce();
  });

  it("never fires cb on background (hidden)", async () => {
    const { useForegroundRefetch } = await import("./useForegroundRefetch");
    const cb = vi.fn();
    renderHook(() => useForegroundRefetch(cb));

    setVisibility("hidden");

    expect(cb).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount — a later event fires nothing", async () => {
    const { useForegroundRefetch } = await import("./useForegroundRefetch");
    const cb = vi.fn();
    const { unmount } = renderHook(() => useForegroundRefetch(cb));

    unmount();
    setVisibility("hidden");
    setVisibility("visible");

    expect(cb).not.toHaveBeenCalled();
  });
});

describe("useForegroundRefetch (native path, mocked adapter)", () => {
  it("subscribes via the adapter's native path AND browserFinished, forwards only foreground/finished, and awaits+calls both Promise unsubscribes on unmount", async () => {
    const unsubscribe = vi.fn();
    const registerAppLifecycleListener = vi.fn(
      async (onEvent: (e: "background" | "foreground") => void) => {
        // Mirrors the real native contract: both transitions can arrive.
        onEvent("background");
        onEvent("foreground");
        return unsubscribe;
      },
    );
    const registerWebAppLifecycleListener = vi.fn();
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener,
      registerWebAppLifecycleListener,
    }));

    // Fix round 2 (P1a): the modal-dismiss signal `resume` alone misses.
    const browserFinishedUnsubscribe = vi.fn();
    let fireBrowserFinished: () => void = () => undefined;
    const onBrowserFinished = vi.fn(async (finishedCb: () => void) => {
      fireBrowserFinished = finishedCb;
      return browserFinishedUnsubscribe;
    });
    vi.doMock("../adapters/externalBrowser", () => ({ onBrowserFinished }));

    vi.resetModules();
    const { useForegroundRefetch } = await import("./useForegroundRefetch");
    const cb = vi.fn();

    const { unmount } = renderHook(() => useForegroundRefetch(cb));
    // Let both mocked Promises settle before asserting/unmounting.
    await vi.waitFor(() => {
      expect(registerAppLifecycleListener).toHaveBeenCalledOnce();
      expect(onBrowserFinished).toHaveBeenCalledOnce();
    });

    // Foreground filtering: only the "foreground" call reached `cb` so far.
    expect(cb).toHaveBeenCalledOnce();
    // The native path never also rides the raw web mapping.
    expect(registerWebAppLifecycleListener).not.toHaveBeenCalled();

    // The modal-dismiss path: `SFSafariViewController` closing WITHOUT any
    // background/foreground transition — `browserFinished` is the only
    // signal that fires here.
    fireBrowserFinished();
    expect(cb).toHaveBeenCalledTimes(2);

    unmount();
    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(browserFinishedUnsubscribe).toHaveBeenCalledOnce();
    });
  });

  it("unmounting BEFORE the browserFinished Promise settles still unsubscribes it, once it resolves — no listener leaks past unmount", async () => {
    const registerAppLifecycleListener = vi.fn(async () => vi.fn());
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener,
      registerWebAppLifecycleListener: vi.fn(),
    }));

    const browserFinishedUnsubscribe = vi.fn();
    let resolveBrowserFinished: (unsubscribe: () => void) => void = () =>
      undefined;
    const onBrowserFinished = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveBrowserFinished = resolve;
        }),
    );
    vi.doMock("../adapters/externalBrowser", () => ({ onBrowserFinished }));
    vi.resetModules();
    const { useForegroundRefetch } = await import("./useForegroundRefetch");

    const { unmount } = renderHook(() => useForegroundRefetch(vi.fn()));
    unmount();
    // Settles AFTER unmount — the `cancelled` branch this guards against
    // calls the just-resolved unsubscribe immediately instead of stashing
    // it for a cleanup that already ran, same race as the lifecycle
    // listener's own version of this test below.
    resolveBrowserFinished(browserFinishedUnsubscribe);

    await vi.waitFor(() => {
      expect(browserFinishedUnsubscribe).toHaveBeenCalledOnce();
    });
  });

  it("unmounting BEFORE the native Promise settles still unsubscribes, once it resolves — no listener leaks past unmount", async () => {
    const unsubscribe = vi.fn();
    let resolveRegister: (unsub: () => void) => void = () => undefined;
    const registerAppLifecycleListener = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveRegister = resolve;
        }),
    );
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener,
      registerWebAppLifecycleListener: vi.fn(),
    }));
    vi.resetModules();
    const { useForegroundRefetch } = await import("./useForegroundRefetch");

    const { unmount } = renderHook(() => useForegroundRefetch(vi.fn()));
    unmount();
    // The registration only settles AFTER unmount — the `cancelled` branch
    // this guards against calls the just-resolved unsubscribe immediately
    // instead of stashing it for a cleanup that already ran.
    resolveRegister(unsubscribe);

    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
  });
});
