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
});
