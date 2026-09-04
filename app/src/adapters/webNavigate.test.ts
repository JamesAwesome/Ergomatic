import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateWeb, openWebInNewTab } from "./webNavigate";

// jsdom throws "Not implemented: navigation (except hash changes)" if the
// REAL `window.location.assign` actually runs, and a direct `vi.spyOn(
// window.location, "assign")` fails outright ("Cannot redefine property:
// assign" — the property is non-configurable). The standard jsdom
// navigation workaround sidesteps both: replace `window.location` itself
// (a configurable property on `window`, unlike its own `assign` method)
// with a plain object carrying a spy, so the real navigation code path
// never runs at all — this drives `navigateWeb`'s REAL implementation,
// not a mock standing in for it.
describe("navigateWeb", () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      configurable: true,
    });
  });

  it("calls location.assign with the given url", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign },
      configurable: true,
    });

    navigateWeb("https://log.concept2.com/oauth/authorize");

    expect(assign).toHaveBeenCalledExactlyOnceWith(
      "https://log.concept2.com/oauth/authorize",
    );
  });
});

describe("openWebInNewTab", () => {
  it("opens a NEW context and never navigates this document", () => {
    // The distinction is the whole point (plan observation 10):
    // `navigateWeb` unloads the SPA, which is right for the OAuth hop and
    // would lose the rower's log row for a read-only look.
    const open = vi.fn();
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    });
    const originalOpen = window.open;
    window.open = open as unknown as typeof window.open;
    try {
      openWebInNewTab("https://log-dev.concept2.com/profile/2211/log/339");
      expect(open).toHaveBeenCalledWith(
        "https://log-dev.concept2.com/profile/2211/log/339",
        "_blank",
        "noopener,noreferrer",
      );
      expect(assign).not.toHaveBeenCalled();
    } finally {
      window.open = originalOpen;
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });
});
