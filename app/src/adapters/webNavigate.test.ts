import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateWeb } from "./webNavigate";

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
