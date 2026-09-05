import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TODAY_PICK_KEY,
  loadTodayPick,
  saveTodayPick,
  todayDateString,
  type TodayPick,
} from "./todayPick";

beforeEach(() => localStorage.clear());

describe("todayDateString", () => {
  it("formats a local date as YYYY-MM-DD, zero-padded", () => {
    expect(todayDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(todayDateString(new Date(2026, 10, 23))).toBe("2026-11-23");
  });
});

describe("saveTodayPick / loadTodayPick", () => {
  const base: TodayPick = {
    date: "2026-08-01",
    planKey: "sprint",
    doneN: 11,
    workoutId: "w-42",
    shownIds: ["w-1", "w-42"],
    shuffled: true,
    session: 0,
  };

  it("round-trips and returns the id, the shown list AND the shuffled flag when date, planKey, and doneN all match", () => {
    expect(saveTodayPick(base)).toBe(true);
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toStrictEqual({
      workoutId: "w-42",
      shownIds: ["w-1", "w-42"],
      shuffled: true,
    });
  });

  it("rejects a record whose shuffled flag is missing or not a boolean", () => {
    localStorage.setItem(
      TODAY_PICK_KEY,
      JSON.stringify({ ...base, shuffled: undefined }),
    );
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
    localStorage.setItem(
      TODAY_PICK_KEY,
      JSON.stringify({ ...base, shuffled: "yes" }),
    );
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
  });

  // Phase SF PR1: the shown list is new and REQUIRED — a same-day record
  // from before the deploy has none and fails whole (a daily convenience,
  // per the spec's stated cost), never a half-object with `shownIds`
  // undefined that `nextShuffle` would have to guard.
  it("rejects a pre-PR1 record with no shownIds, and one whose shownIds holds a non-string", () => {
    localStorage.setItem(
      TODAY_PICK_KEY,
      JSON.stringify({
        date: "2026-08-01",
        planKey: "sprint",
        doneN: 11,
        workoutId: "w-42",
      }),
    );
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
    localStorage.setItem(
      TODAY_PICK_KEY,
      JSON.stringify({ ...base, shownIds: ["w-1", 7] }),
    );
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
  });

  it("round-trips a freestyle pick (planKey and doneN both null)", () => {
    const freestyle: TodayPick = {
      date: "2026-08-01",
      planKey: null,
      doneN: null,
      workoutId: "w-9",
      shownIds: ["w-9"],
      shuffled: false,
      session: 2,
    };
    saveTodayPick(freestyle);
    expect(loadTodayPick("2026-08-01", null, null, 2)).toStrictEqual({
      workoutId: "w-9",
      shownIds: ["w-9"],
      shuffled: false,
    });
  });

  it("discards the pick when a session has been logged since (freestyle re-roll key, James 2026-09-04) or the field is malformed", () => {
    saveTodayPick(base);
    expect(loadTodayPick("2026-08-01", "sprint", 11, 1)).toBeNull();
    localStorage.setItem(
      TODAY_PICK_KEY,
      JSON.stringify({ ...base, session: -1 }),
    );
    expect(loadTodayPick("2026-08-01", "sprint", 11, -1)).toBeNull();
    localStorage.setItem(
      TODAY_PICK_KEY,
      JSON.stringify({ ...base, session: "0" }),
    );
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
  });

  it("discards the pick on a date change", () => {
    saveTodayPick(base);
    expect(loadTodayPick("2026-08-02", "sprint", 11, 0)).toBeNull();
  });

  it("discards the pick when the plan switched", () => {
    saveTodayPick(base);
    expect(loadTodayPick("2026-08-01", "head", 11, 0)).toBeNull();
  });

  it("discards the pick when doneN advanced (a session logged since)", () => {
    saveTodayPick(base);
    expect(loadTodayPick("2026-08-01", "sprint", 12, 0)).toBeNull();
  });

  it("discards a plan-mode pick when read back in freestyle context", () => {
    saveTodayPick(base);
    expect(loadTodayPick("2026-08-01", null, null, 2)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
  });

  // Storage-denial spec (2026-09-03) §1, I-1/I-2 — same idiom
  // `session/run.ts`'s own leg. This loader never clears on a mismatch
  // either way, so there is no "nothing cleared" half to assert here
  // (unlike run.ts/draft.ts).
  it("returns null when the storage GETTER itself throws (storage-denial spec §1 I-1/I-2)", () => {
    saveTodayPick(base);
    const real = Storage.prototype.getItem;
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(function (this: Storage, key: string): string | null {
        if (key === TODAY_PICK_KEY) {
          throw new DOMException("storage is denied", "SecurityError");
        }
        return real.call(this, key);
      });
    try {
      expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
    } finally {
      spy.mockRestore();
    }
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)?.workoutId).toBe(
      "w-42",
    );
  });

  it("returns null for garbage JSON", () => {
    localStorage.setItem(TODAY_PICK_KEY, "{not json");
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
  });

  it("returns null when the stored value parses to a non-object (e.g. a bare number)", () => {
    localStorage.setItem(TODAY_PICK_KEY, JSON.stringify(42));
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
  });

  it("returns null (not a throw) when the stored value parses to JSON null", () => {
    // typeof null === "object" in JS — isTodayPick's guard has to check
    // for null explicitly, not just "typeof !== object", or this throws
    // trying to read a property off null instead of returning false.
    localStorage.setItem(TODAY_PICK_KEY, "null");
    expect(() => loadTodayPick("2026-08-01", "sprint", 11, 0)).not.toThrow();
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
  });

  it("returns null for well-formed JSON that isn't a TodayPick shape", () => {
    localStorage.setItem(TODAY_PICK_KEY, JSON.stringify({ foo: "bar" }));
    expect(loadTodayPick("2026-08-01", "sprint", 11, 0)).toBeNull();
  });

  it("returns false without throwing when localStorage.setItem fails (quota)", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    expect(() => saveTodayPick(base)).not.toThrow();
    expect(saveTodayPick(base)).toBe(false);
    spy.mockRestore();
  });

  it("exposes the storage key used", () => {
    expect(TODAY_PICK_KEY).toBe("ergomatic.todayPick");
  });
});
