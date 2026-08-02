import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LIBRARY_SCROLL_KEY,
  clearLibraryScroll,
  loadLibraryScroll,
  saveLibraryScroll,
} from "./libraryScroll";

beforeEach(() => sessionStorage.clear());

describe("saveLibraryScroll / loadLibraryScroll", () => {
  it("round-trips a saved position", () => {
    saveLibraryScroll(1234);
    expect(loadLibraryScroll()).toBe(1234);
  });

  it("stores under the documented key so other modules (TabBar) can share it", () => {
    saveLibraryScroll(42);
    expect(sessionStorage.getItem(LIBRARY_SCROLL_KEY)).toBe("42");
  });

  it("returns null when nothing is stored", () => {
    expect(loadLibraryScroll()).toBeNull();
  });

  it("returns null for a non-numeric stored value instead of NaN", () => {
    sessionStorage.setItem(LIBRARY_SCROLL_KEY, "not-a-number");
    expect(loadLibraryScroll()).toBeNull();
  });

  it("round-trips zero (a falsy-but-valid position)", () => {
    saveLibraryScroll(0);
    expect(loadLibraryScroll()).toBe(0);
  });

  it("swallows a storage write failure instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded");
      });
    expect(() => saveLibraryScroll(10)).not.toThrow();
    spy.mockRestore();
  });

  it("swallows a storage read failure and returns null instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("storage disabled");
      });
    expect(() => loadLibraryScroll()).not.toThrow();
    expect(loadLibraryScroll()).toBeNull();
    spy.mockRestore();
  });
});

describe("clearLibraryScroll", () => {
  it("removes a previously saved position", () => {
    saveLibraryScroll(500);
    clearLibraryScroll();
    expect(loadLibraryScroll()).toBeNull();
  });

  it("is a no-op when nothing was stored", () => {
    expect(() => clearLibraryScroll()).not.toThrow();
    expect(loadLibraryScroll()).toBeNull();
  });

  it("swallows a storage removal failure instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("storage disabled");
      });
    expect(() => clearLibraryScroll()).not.toThrow();
    spy.mockRestore();
  });
});
