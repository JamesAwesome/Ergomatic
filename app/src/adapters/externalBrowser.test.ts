import { afterEach, describe, expect, it, vi } from "vitest";

// Same `vi.doMock("../platform")` + `vi.resetModules()` idiom
// `appLifecycle.test.ts`/`monitorTransport.test.ts` already establish for
// this exact platform-branch question (agent-briefing.md's own citation
// for this task).
//
// The web arm is NOT tested by calling the real `window.location.assign` —
// jsdom throws "Not implemented: navigation (except hash changes)" the
// moment that call is actually invoked, and a direct `vi.spyOn(window.
// location, "assign")` fails outright with "TypeError: Cannot redefine
// property: assign" (verified empirically against this repo's jsdom
// version — no existing test in this repo mocks location.assign/href, so
// there was no precedent to follow either way). A same-module `vi.spyOn`
// on `openExternalUrl`'s own call to a co-located `navigateWeb` was tried
// first and also failed to intercept (the real, unmocked navigation ran
// and threw) — Vitest/Vite's ESM transform binds a same-file call to the
// local declaration, not the mutable exports object. `webNavigate.ts`
// therefore exists as its own module purely so `vi.doMock` — the
// established idiom for `../platform`/`../native/*` — can replace it.
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../platform");
  vi.doUnmock("../native/externalBrowser");
  vi.doUnmock("./webNavigate");
});

describe("openExternalUrl", () => {
  it("web: navigates via webNavigate's navigateWeb, synchronously (no Promise)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const navigateWeb = vi.fn();
    vi.doMock("./webNavigate", () => ({ navigateWeb }));
    vi.resetModules();
    const { openExternalUrl } = await import("./externalBrowser");

    const result = openExternalUrl("https://log.concept2.com/oauth/authorize");

    expect(result).toBeUndefined();
    expect(navigateWeb).toHaveBeenCalledExactlyOnceWith(
      "https://log.concept2.com/oauth/authorize",
    );
  });

  it("native: reaches the native module's export via a dynamic import, and never touches the web seam", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const openNativeExternalUrl = vi.fn(async () => undefined);
    vi.doMock("../native/externalBrowser", () => ({ openNativeExternalUrl }));
    const navigateWeb = vi.fn();
    vi.doMock("./webNavigate", () => ({ navigateWeb }));
    vi.resetModules();
    const { openExternalUrl } = await import("./externalBrowser");

    const result = openExternalUrl("https://log.concept2.com/oauth/authorize");

    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(openNativeExternalUrl).toHaveBeenCalledExactlyOnceWith(
      "https://log.concept2.com/oauth/authorize",
    );
    expect(navigateWeb).not.toHaveBeenCalled();
  });
});

// Fix round 2 (P1a): the modal-dismiss signal `useForegroundRefetch.ts`
// composes alongside `resume` — see that adapter's own tests for the
// composition; these two cover `onBrowserFinished`'s own platform dispatch
// in isolation, the same split `openExternalUrl`'s tests above already use.
describe("onBrowserFinished", () => {
  it("web: is a genuine no-op — returns a callable unsubscribe synchronously and never calls cb", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    vi.resetModules();
    const { onBrowserFinished } = await import("./externalBrowser");
    const cb = vi.fn();

    const result = onBrowserFinished(cb);

    expect(result).not.toBeInstanceOf(Promise);
    expect(() => (result as () => void)()).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });

  it("native: reaches the native module's browserFinished binding via a dynamic import", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const unsubscribe = vi.fn();
    const onNativeBrowserFinished = vi.fn(async () => unsubscribe);
    vi.doMock("../native/externalBrowser", () => ({
      onNativeBrowserFinished,
    }));
    vi.resetModules();
    const { onBrowserFinished } = await import("./externalBrowser");
    const cb = vi.fn();

    const result = onBrowserFinished(cb);

    expect(result).toBeInstanceOf(Promise);
    const resolvedUnsubscribe = await result;
    expect(onNativeBrowserFinished).toHaveBeenCalledExactlyOnceWith(cb);
    expect(resolvedUnsubscribe).toBe(unsubscribe);
  });
});
