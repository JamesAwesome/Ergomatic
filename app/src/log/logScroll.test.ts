import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LOG_SCROLL_KEY,
  clearLogScroll,
  loadLogScroll,
  saveLogScroll,
} from "./logScroll";

beforeEach(() => sessionStorage.clear());

describe("saveLogScroll / loadLogScroll", () => {
  it("round-trips a saved position", () => {
    saveLogScroll(1234);
    expect(loadLogScroll()).toBe(1234);
  });

  it("stores under the documented key so other modules (TabBar) can share it", () => {
    saveLogScroll(42);
    expect(sessionStorage.getItem(LOG_SCROLL_KEY)).toBe("42");
  });

  it("returns null when nothing is stored", () => {
    expect(loadLogScroll()).toBeNull();
  });

  it("returns null for a non-numeric stored value instead of NaN", () => {
    sessionStorage.setItem(LOG_SCROLL_KEY, "not-a-number");
    expect(loadLogScroll()).toBeNull();
  });

  it("round-trips zero (a falsy-but-valid position)", () => {
    saveLogScroll(0);
    expect(loadLogScroll()).toBe(0);
  });

  it("swallows a storage write failure instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded");
      });
    expect(() => saveLogScroll(10)).not.toThrow();
    spy.mockRestore();
  });

  it("swallows a storage read failure and returns null instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("storage disabled");
      });
    expect(() => loadLogScroll()).not.toThrow();
    expect(loadLogScroll()).toBeNull();
    spy.mockRestore();
  });
});

describe("clearLogScroll", () => {
  it("removes a previously saved position", () => {
    saveLogScroll(500);
    clearLogScroll();
    expect(loadLogScroll()).toBeNull();
  });

  it("is a no-op when nothing was stored", () => {
    expect(() => clearLogScroll()).not.toThrow();
    expect(loadLogScroll()).toBeNull();
  });

  it("swallows a storage removal failure instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("storage disabled");
      });
    expect(() => clearLogScroll()).not.toThrow();
    spy.mockRestore();
  });
});
