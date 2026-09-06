import { render, screen, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useKeyboardOpen } from "./keyboardOpen";

/** jsdom implements no `visualViewport`, so every case installs its own —
 *  which is also the honest shape of the production code, since the
 *  property is absent on old engines too. */
function installViewport(height: number) {
  const listeners = new Set<() => void>();
  const vv = {
    height,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  Object.defineProperty(window, "visualViewport", {
    value: vv,
    configurable: true,
    writable: true,
  });
  return {
    resizeTo(next: number) {
      vv.height = next;
      act(() => listeners.forEach((cb) => cb()));
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function Probe() {
  return <p>{useKeyboardOpen() ? "OPEN" : "CLOSED"}</p>;
}

afterEach(() => {
  Reflect.deleteProperty(window, "visualViewport");
});

describe("useKeyboardOpen", () => {
  // INDEPENDENT LITERALS, never the production constant (RF21's first smell
  // from PR #228): 800 − 651 = 149 is closed and 800 − 649 = 151 is open, so
  // retuning the threshold has to move these by hand.
  it("is closed at 149px of occlusion and open at 151px", () => {
    window.innerHeight = 800;
    const vp = installViewport(651);
    render(<Probe />);
    expect(screen.getByText("CLOSED")).toBeVisible();
    vp.resizeTo(649);
    expect(screen.getByText("OPEN")).toBeVisible();
    vp.resizeTo(651);
    expect(screen.getByText("CLOSED")).toBeVisible();
  });

  it("is open from the very first render when the keyboard is already up", () => {
    // A screen mounted while a field is focused elsewhere — the initial
    // snapshot has to answer, not just the resize that follows.
    window.innerHeight = 800;
    installViewport(400);
    render(<Probe />);
    expect(screen.getByText("OPEN")).toBeVisible();
  });

  it("says closed, not undefined, on an engine with no visualViewport", () => {
    window.innerHeight = 800;
    render(<Probe />);
    expect(screen.getByText("CLOSED")).toBeVisible();
  });

  it("unsubscribes on unmount", () => {
    window.innerHeight = 800;
    const vp = installViewport(800);
    const { unmount } = render(<Probe />);
    expect(vp.listenerCount).toBe(1);
    unmount();
    expect(vp.listenerCount).toBe(0);
  });
});
