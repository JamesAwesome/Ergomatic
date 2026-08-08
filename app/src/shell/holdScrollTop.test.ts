import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdScrollTop } from "./holdScrollTop";

// Fakes requestAnimationFrame/cancelAnimationFrame as a manually-pumped
// queue: each pumpFrame() invokes exactly the callbacks scheduled since the
// last pump, mirroring one real animation frame. holdScrollTop's `hold`
// loop schedules its own next frame from inside itself, so pumping once
// drives the loop forward by exactly one iteration.
let rafQueue: number[] = [];
let idToCallback = new Map<number, FrameRequestCallback>();
let nextRafId = 0;

function pumpFrame() {
  const queue = rafQueue;
  rafQueue = [];
  for (const id of queue) {
    const cb = idToCallback.get(id);
    idToCallback.delete(id);
    cb?.(0);
  }
}

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", {
    value,
    writable: true,
    configurable: true,
  });
}

describe("holdScrollTop", () => {
  beforeEach(() => {
    rafQueue = [];
    idToCallback = new Map();
    nextRafId = 0;
    setScrollY(0);
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        const id = ++nextRafId;
        idToCallback.set(id, cb);
        rafQueue.push(id);
        return id;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      idToCallback.delete(id);
      rafQueue = rafQueue.filter((queuedId) => queuedId !== id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("calls scrollTo(0, 0) immediately on invocation", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});

    holdScrollTop();

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  });

  it("re-asserts scrollTo(0, 0) when scrollY is nonzero on a later frame", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});

    holdScrollTop();
    scrollToSpy.mockClear();
    setScrollY(150);
    pumpFrame();

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it("leaves an already-at-0 page alone: exactly one scrollTo call across several frames", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});

    holdScrollTop();
    for (let frame = 0; frame < 5; frame++) {
      pumpFrame();
    }

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  });

  it("aborts on touchstart: no further scrollTo even if scrollY moves afterward", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});

    holdScrollTop();
    scrollToSpy.mockClear();
    window.dispatchEvent(new Event("touchstart"));
    setScrollY(150);
    pumpFrame();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("aborts on wheel: no further scrollTo even if scrollY moves afterward", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});

    holdScrollTop();
    scrollToSpy.mockClear();
    window.dispatchEvent(new Event("wheel"));
    setScrollY(150);
    pumpFrame();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("stops re-asserting once the hold window elapses", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});

    holdScrollTop();
    scrollToSpy.mockClear();
    // 31 pumps: HOLD_FRAMES (30) is checked pre-increment, so the loop
    // stops itself on the 31st invocation without scheduling another frame.
    for (let frame = 0; frame < 31; frame++) {
      pumpFrame();
    }
    setScrollY(150);
    pumpFrame();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("the returned cleanup cancels the loop and removes listeners", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});

    const stop = holdScrollTop();
    scrollToSpy.mockClear();
    stop();
    setScrollY(150);
    pumpFrame();

    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(() => window.dispatchEvent(new Event("touchstart"))).not.toThrow();
  });
});
