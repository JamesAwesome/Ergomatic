import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  NEWS_SCROLL_KEY,
  clearNewsScroll,
  loadNewsScroll,
  saveNewsScroll,
} from "./newsScroll";

beforeEach(() => sessionStorage.clear());

describe("saveNewsScroll / loadNewsScroll", () => {
  it("round-trips a saved position", () => {
    saveNewsScroll(1234);
    expect(loadNewsScroll()).toBe(1234);
  });

  it("stores under the documented key so other modules (TabBar) can share it", () => {
    saveNewsScroll(42);
    expect(sessionStorage.getItem(NEWS_SCROLL_KEY)).toBe("42");
  });

  it("returns null when nothing is stored", () => {
    expect(loadNewsScroll()).toBeNull();
  });

  it("returns null for a non-numeric stored value instead of NaN", () => {
    sessionStorage.setItem(NEWS_SCROLL_KEY, "not-a-number");
    expect(loadNewsScroll()).toBeNull();
  });

  it("round-trips zero (a falsy-but-valid position)", () => {
    saveNewsScroll(0);
    expect(loadNewsScroll()).toBe(0);
  });

  it("swallows a storage write failure instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded");
      });
    expect(() => saveNewsScroll(10)).not.toThrow();
    spy.mockRestore();
  });

  it("swallows a storage read failure and returns null instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("storage disabled");
      });
    expect(() => loadNewsScroll()).not.toThrow();
    expect(loadNewsScroll()).toBeNull();
    spy.mockRestore();
  });
});

describe("clearNewsScroll", () => {
  it("removes a previously saved position", () => {
    saveNewsScroll(500);
    clearNewsScroll();
    expect(loadNewsScroll()).toBeNull();
  });

  it("is a no-op when nothing was stored", () => {
    expect(() => clearNewsScroll()).not.toThrow();
    expect(loadNewsScroll()).toBeNull();
  });

  it("swallows a storage removal failure instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("storage disabled");
      });
    expect(() => clearNewsScroll()).not.toThrow();
    spy.mockRestore();
  });
});
