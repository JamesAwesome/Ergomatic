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

describe("useReturnToApp (web arm, real DOM)", () => {
  it("fires cb once when the tab becomes visible", async () => {
    const { useReturnToApp } = await import("./useReturnToApp");
    const cb = vi.fn();
    renderHook(() => useReturnToApp(cb));

    setVisibility("hidden");
    setVisibility("visible");

    expect(cb).toHaveBeenCalledOnce();
  });

  it("never fires cb on background (hidden)", async () => {
    const { useReturnToApp } = await import("./useReturnToApp");
    const cb = vi.fn();
    renderHook(() => useReturnToApp(cb));

    setVisibility("hidden");

    expect(cb).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount — a later event fires nothing", async () => {
    const { useReturnToApp } = await import("./useReturnToApp");
    const cb = vi.fn();
    const { unmount } = renderHook(() => useReturnToApp(cb));

    unmount();
    setVisibility("hidden");
    setVisibility("visible");

    expect(cb).not.toHaveBeenCalled();
  });
});

describe("useReturnToApp (native path, mocked adapter)", () => {
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
    const { useReturnToApp } = await import("./useReturnToApp");
    const cb = vi.fn();

    const { unmount } = renderHook(() => useReturnToApp(cb));
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
    const { useReturnToApp } = await import("./useReturnToApp");

    const { unmount } = renderHook(() => useReturnToApp(vi.fn()));
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
    const { useReturnToApp } = await import("./useReturnToApp");

    const { unmount } = renderHook(() => useReturnToApp(vi.fn()));
    unmount();
    // The registration only settles AFTER unmount — the `cancelled` branch
    // this guards against calls the just-resolved unsubscribe immediately
    // instead of stashing it for a cleanup that already ran.
    resolveRegister(unsubscribe);

    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
  });

  it("holds cb in a ref: re-rendering with a NEW cb identity does not re-subscribe (fix round 3, antagonist finding 1 — the headline break), and the LATEST cb is what fires — via BOTH the appLifecycle listener AND browserFinished", async () => {
    let capturedOnEvent: ((e: "background" | "foreground") => void) | undefined;
    const registerAppLifecycleListener = vi.fn(
      async (onEvent: (e: "background" | "foreground") => void) => {
        capturedOnEvent = onEvent;
        return vi.fn();
      },
    );
    // Round 4 finding (IMPORTANT): captured the same way the earlier
    // native test above already does (`fireBrowserFinished`), so THIS
    // test can fire it AFTER the rerender — the freshness gap
    // `onBrowserFinished(() => cbRef.current())` guards against had NO
    // biting mutation before this: `onBrowserFinished(cb)` (closing over
    // the STALE `cb1` at subscribe time) left every prior test green,
    // because none of them ever fired browserFinished after a rerender.
    let fireBrowserFinished: () => void = () => undefined;
    const onBrowserFinished = vi.fn(async (finishedCb: () => void) => {
      fireBrowserFinished = finishedCb;
      return vi.fn();
    });
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener,
      registerWebAppLifecycleListener: vi.fn(),
    }));
    vi.doMock("../adapters/externalBrowser", () => ({ onBrowserFinished }));
    vi.resetModules();
    const { useReturnToApp } = await import("./useReturnToApp");

    const cb1 = vi.fn();
    const { rerender } = renderHook(({ cb }) => useReturnToApp(cb), {
      initialProps: { cb: cb1 },
    });
    await vi.waitFor(() => {
      expect(registerAppLifecycleListener).toHaveBeenCalledOnce();
      expect(onBrowserFinished).toHaveBeenCalledOnce();
    });

    const cb2 = vi.fn();
    rerender({ cb: cb2 });

    // The whole point: a NEW `cb` identity across a re-render must NOT
    // tear down and re-add the subscription. Before the fix, `[cb]`
    // deps made this fire a second time on every re-render — exactly the
    // async re-subscribe window a real `browserFinished`/`resume` could
    // land in and be silently dropped.
    expect(registerAppLifecycleListener).toHaveBeenCalledOnce();
    expect(onBrowserFinished).toHaveBeenCalledOnce();

    // The listener captured at the ONE subscribe time must still call
    // whichever `cb` is CURRENT, not the one captured at subscribe time —
    // checked on BOTH signals, not just the appLifecycle one.
    capturedOnEvent!("foreground");
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledOnce();

    fireBrowserFinished();
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(2);
  });
});

describe("useReturnToApp's ready flag (fix round 5, P1 — the first-open race)", () => {
  it("web: ready is true once the (synchronous) subscription effect has run", async () => {
    const { useReturnToApp } = await import("./useReturnToApp");
    const { result } = renderHook(() => useReturnToApp(vi.fn()));

    await vi.waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
  });

  it("native: ready stays false until BOTH the appLifecycle and browserFinished Promises resolve, then flips true", async () => {
    let resolveLifecycle: (unsub: () => void) => void = () => undefined;
    const registerAppLifecycleListener = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveLifecycle = resolve;
        }),
    );
    let resolveBrowserFinished: (unsub: () => void) => void = () => undefined;
    const onBrowserFinished = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveBrowserFinished = resolve;
        }),
    );
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener,
      registerWebAppLifecycleListener: vi.fn(),
    }));
    vi.doMock("../adapters/externalBrowser", () => ({ onBrowserFinished }));
    vi.resetModules();
    const { useReturnToApp } = await import("./useReturnToApp");

    const { result } = renderHook(() => useReturnToApp(vi.fn()));
    expect(result.current.ready).toBe(false);

    // Only ONE of the two has settled — still not ready. This is the
    // exact case the reviewer's finding names: a caller free to act the
    // instant ONE signal looks live would still be racing the other.
    resolveLifecycle(vi.fn());
    await vi.waitFor(() => {
      expect(registerAppLifecycleListener).toHaveBeenCalledOnce();
    });
    expect(result.current.ready).toBe(false);

    resolveBrowserFinished(vi.fn());
    await vi.waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
  });

  it("native: still reaches ready even if onBrowserFinished somehow returns synchronously (defensive branch, not a real code path — both calls read the same isNative())", async () => {
    const registerAppLifecycleListener = vi.fn(async () => vi.fn());
    const onBrowserFinished = vi.fn(() => vi.fn());
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener,
      registerWebAppLifecycleListener: vi.fn(),
    }));
    vi.doMock("../adapters/externalBrowser", () => ({ onBrowserFinished }));
    vi.resetModules();
    const { useReturnToApp } = await import("./useReturnToApp");

    const { result } = renderHook(() => useReturnToApp(vi.fn()));

    await vi.waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
  });
});
