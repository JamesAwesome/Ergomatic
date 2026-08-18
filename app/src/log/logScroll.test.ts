import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LOG_SCROLL_KEY,
  clearLogScroll,
  loadLogScroll,
  resetLogScrollTombstone,
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

// Final whole-branch review (2026-08-18), finding IMPORTANT 2: the
// tombstone that closes the race between the tab bar's synchronous
// `clearLogScroll()` and `HistoryList`'s own deferred unmount-flush save
// (`logScroll.ts`'s own `LOG_SCROLL_CLEARED_KEY` comment has the full
// mechanism). This reproduces the race directly at the module level —
// `saveLogScroll` called AFTER `clearLogScroll`, exactly the order React's
// passive-effect scheduling produces — rather than through a live
// component mount, since the ordering is the whole bug and this is the
// smallest thing that can assert it deterministically.
describe("clearLogScroll's tombstone (final-review fix round, 2026-08-18)", () => {
  it("a save landing strictly after clearLogScroll — the unmount-flush race — is declined, not written", () => {
    saveLogScroll(500);
    clearLogScroll();
    // Simulates HistoryList's own unmount-flush cleanup firing after the
    // tab bar's synchronous clear (React defers a passive effect's
    // cleanup until after paint) — the exact live-probe sequence the
    // review reproduced: scrolled 623, TODAY tap, storage read "623" again.
    saveLogScroll(623);
    expect(loadLogScroll()).toBeNull();
  });

  it("resetLogScrollTombstone lets a later, genuine HistoryList mount save normally again", () => {
    saveLogScroll(500);
    clearLogScroll();
    saveLogScroll(623); // the same defeated race as above
    expect(loadLogScroll()).toBeNull();

    resetLogScrollTombstone();
    saveLogScroll(77);
    expect(loadLogScroll()).toBe(77);
  });

  it("is a no-op when nothing was cleared, so an ordinary save is never blocked", () => {
    resetLogScrollTombstone();
    saveLogScroll(9);
    expect(loadLogScroll()).toBe(9);
  });

  it("swallows a storage removal failure instead of throwing", () => {
    const spy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("storage disabled");
      });
    expect(() => resetLogScrollTombstone()).not.toThrow();
    spy.mockRestore();
  });
});
