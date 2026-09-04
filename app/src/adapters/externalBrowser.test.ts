import { afterEach, describe, expect, it, vi } from "vitest";

// The web arm is NOT tested by calling the real `window.location.assign` —
// jsdom throws "Not implemented: navigation (except hash changes)" the
// moment that call is actually invoked, and a direct `vi.spyOn(window.
// location, "assign")` fails outright with "TypeError: Cannot redefine
// property: assign" (verified empirically against this repo's jsdom
// version). A same-module `vi.spyOn` on this module's own call to a
// co-located helper was tried first and also failed to intercept (the
// real, unmocked navigation ran and threw) — Vitest/Vite's ESM transform
// binds a same-file call to the local declaration, not the mutable exports
// object. `webNavigate.ts` therefore exists as its own module purely so
// `vi.doMock` — the established idiom for `../platform`/`../native/*` — can
// replace it.
//
// **PR B: `../platform` is still mocked here, and that is the POINT.**
// Neither export branches on platform any more, so each case below is run
// with `isNative()` forced BOTH ways and asserts the SAME destination. A
// reintroduced `isNative()` branch fails these tests rather than sliding
// past them (mutation recorded in the PR body). No gate in this repo can
// observe what the phone actually does with `window.open` — that is the
// device walk's job, and only the walk's.
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../platform");
  vi.doUnmock("./webNavigate");
});

describe.each([
  ["web", false],
  ["native", true],
])("openExternalUrl (%s)", (_label, native) => {
  it("navigates THIS document via webNavigate's navigateWeb, synchronously (no Promise)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => native }));
    const navigateWeb = vi.fn();
    const openWebInNewTab = vi.fn();
    vi.doMock("./webNavigate", () => ({ navigateWeb, openWebInNewTab }));
    vi.resetModules();
    const { openExternalUrl } = await import("./externalBrowser");

    const result = openExternalUrl("https://log.concept2.com/oauth/authorize");

    expect(result).toBeUndefined();
    expect(navigateWeb).toHaveBeenCalledExactlyOnceWith(
      "https://log.concept2.com/oauth/authorize",
    );
    expect(openWebInNewTab).not.toHaveBeenCalled();
  });
});

describe.each([
  ["web", false],
  ["native", true],
])("openReadOnlyUrl (%s)", (_label, native) => {
  it("opens a NEW context, never this document — the same destination on both platforms", async () => {
    vi.doMock("../platform", () => ({ isNative: () => native }));
    const navigateWeb = vi.fn();
    const openWebInNewTab = vi.fn();
    vi.doMock("./webNavigate", () => ({ navigateWeb, openWebInNewTab }));
    vi.resetModules();
    const { openReadOnlyUrl } = await import("./externalBrowser");

    const result = openReadOnlyUrl(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );

    expect(result).toBeUndefined();
    expect(openWebInNewTab).toHaveBeenCalledExactlyOnceWith(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );
    expect(navigateWeb).not.toHaveBeenCalled();
  });
});
