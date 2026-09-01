import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// P1a-device: this component IS the dist-grep-gated dev harness card
// (`docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md` carries the
// on-device walk and the RF12 build-with/without-the-flag red proof —
// neither is a unit-test concern). These tests cover its own two jobs:
// the button reaches `openExternalUrl`, and the counter reaches
// `useReturnToApp`'s already-tested composition (real DOM
// `visibilitychange`, same idiom `useReturnToApp.test.tsx` itself
// uses for its web arm — this file does not re-test that hook's native
// path or its ref-based subscription-lifetime fix (fix round 3), both
// already covered there).

function setVisibility(state: "visible" | "hidden"): void {
  act(() => {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
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
  vi.doUnmock("../adapters/externalBrowser");
  vi.doUnmock("../adapters/appLifecycle");
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});

describe("Concept2LinkProbe", () => {
  it("carries the dist-grep needle as a data attribute", async () => {
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(document.querySelector("[data-c2-link-probe]")).toHaveAttribute(
      "data-c2-link-probe",
      "C2 link probe (dev harness)",
    );
  });

  it("tapping Open calls openExternalUrl with the dev-only probe URL", async () => {
    const openExternalUrl = vi.fn();
    vi.doMock("../adapters/externalBrowser", () => ({ openExternalUrl }));
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    await userEvent.click(
      screen.getByRole("button", { name: /open consent browser/i }),
    );

    expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith(
      "https://log-dev.concept2.com",
    );
  });

  it("increments the visible counter when the foreground signal fires", async () => {
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    expect(screen.getByText("Returns detected: 0")).toBeInTheDocument();

    setVisibility("hidden");
    setVisibility("visible");

    expect(screen.getByText("Returns detected: 1")).toBeInTheDocument();
  });

  it("disables the opener until BOTH useReturnToApp subscriptions settle (fix round 5, P1 — the first-open race the reviewer proved), then enables it and lets a real tap through", async () => {
    const openExternalUrl = vi.fn();
    // The native branch calls `onBrowserFinished` too — must be present on
    // this mock or `useReturnToApp` throws (`onBrowserFinished is not a
    // function`), the same reason the OTHER tests in this file, which stay
    // on the web branch, get away with mocking `openExternalUrl` alone.
    const onBrowserFinished = vi.fn(async () => vi.fn());
    vi.doMock("../adapters/externalBrowser", () => ({
      openExternalUrl,
      onBrowserFinished,
    }));
    let resolveLifecycle: (unsubscribe: () => void) => void = () => undefined;
    const registerAppLifecycleListener = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveLifecycle = resolve;
        }),
    );
    vi.doMock("../adapters/appLifecycle", () => ({
      registerAppLifecycleListener,
      registerWebAppLifecycleListener: vi.fn(),
    }));
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    // Unsettled: reads "Arming…", disabled, and — the actual invariant,
    // not just the label — a tap does NOT reach openExternalUrl.
    const armingButton = screen.getByRole("button", { name: /arming/i });
    expect(armingButton).toBeDisabled();
    await userEvent.click(armingButton);
    expect(openExternalUrl).not.toHaveBeenCalled();

    // Settle the lifecycle registration (onBrowserFinished's mock above
    // already resolves on its own microtask) — NOW ready flips true.
    await act(async () => {
      resolveLifecycle(vi.fn());
    });

    const openButton = await screen.findByRole("button", {
      name: /open consent browser/i,
    });
    expect(openButton).toBeEnabled();
    await userEvent.click(openButton);
    expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith(
      "https://log-dev.concept2.com",
    );
  });
});
