import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TODAY_OVERRIDES_KEY,
  loadTodayOverrides,
  saveTodayOverrides,
  snapCap,
  type TodayOverrides,
} from "./todayOverrides";

const FULL: TodayOverrides = {
  date: "2026-08-01",
  planKey: "sprint",
  doneN: 11,
  swapType: "AT",
  difficulties: ["easy", "hard"],
  capMinutes: 45,
  painMax3: true,
};

beforeEach(() => localStorage.clear());

describe("saveTodayOverrides / loadTodayOverrides", () => {
  it("round-trips and returns the record when date, planKey, and doneN all match", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toStrictEqual(FULL);
  });

  it("round-trips a freestyle record (planKey and doneN both null)", () => {
    const freestyle: TodayOverrides = {
      ...FULL,
      planKey: null,
      doneN: null,
      swapType: null,
    };
    saveTodayOverrides(freestyle);
    expect(loadTodayOverrides("2026-08-01", null, null)).toStrictEqual(
      freestyle,
    );
  });

  it("round-trips capMinutes: null (NO CAP), not treating it as unset", () => {
    const noCap: TodayOverrides = { ...FULL, capMinutes: null };
    saveTodayOverrides(noCap);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toStrictEqual(noCap);
  });

  it("round-trips swapType: null (no swap) and an empty difficulties array", () => {
    const noSwap: TodayOverrides = {
      ...FULL,
      swapType: null,
      difficulties: [],
    };
    saveTodayOverrides(noSwap);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toStrictEqual(
      noSwap,
    );
  });

  it("returns null when nothing is stored", () => {
    expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toBeNull();
  });

  it("discards the stored record on a date change", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-02", "sprint", 11)).toBeNull();
  });

  it("discards the stored record when the plan switched", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", "head", 11)).toBeNull();
  });

  it("discards the stored record when doneN advanced (a session logged since)", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", "sprint", 12)).toBeNull();
  });

  it("discards a plan-mode record when read back in freestyle context", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", null, null)).toBeNull();
  });

  it("de-dupes duplicated difficulties from a tampered value", () => {
    localStorage.setItem(
      TODAY_OVERRIDES_KEY,
      JSON.stringify({ ...FULL, difficulties: ["easy", "easy", "hard"] }),
    );
    expect(
      loadTodayOverrides("2026-08-01", "sprint", 11)?.difficulties,
    ).toStrictEqual(["easy", "hard"]);
  });

  describe("rejects malformed stored values (falls back to null)", () => {
    const store = (value: string) =>
      localStorage.setItem(TODAY_OVERRIDES_KEY, value);

    it.each([
      ["garbage JSON", "not json {"],
      ["a JSON string", JSON.stringify("AT")],
      ["a JSON array", JSON.stringify(["AT"])],
      ["null", "null"],
      ["date not a string", JSON.stringify({ ...FULL, date: 20260801 })],
      ["planKey wrong shape", JSON.stringify({ ...FULL, planKey: 5 })],
      ["doneN wrong shape", JSON.stringify({ ...FULL, doneN: "11" })],
      ["unknown swapType code", JSON.stringify({ ...FULL, swapType: "XX" })],
      ["swapType wrong shape", JSON.stringify({ ...FULL, swapType: 2 })],
      [
        "difficulties not an array",
        JSON.stringify({ ...FULL, difficulties: "easy" }),
      ],
      [
        "unknown difficulty value",
        JSON.stringify({ ...FULL, difficulties: ["extreme"] }),
      ],
      [
        // Validation accepts ONLY the five values a cap chip can actually
        // render (30/45/60/90/null) — not merely "a positive finite
        // number" — so a value that would leave zero cap chips active
        // (the "exactly one is always active" invariant broken) can never
        // survive a load. 37 is the review's own probe value: finite,
        // positive, and still correctly rejected.
        "capMinutes not one of the five chip values (e.g. 37)",
        JSON.stringify({ ...FULL, capMinutes: 37 }),
      ],
      [
        "capMinutes zero (not a chip value either)",
        JSON.stringify({ ...FULL, capMinutes: 0 }),
      ],
      ["capMinutes negative", JSON.stringify({ ...FULL, capMinutes: -30 })],
      [
        // JSON.stringify(Infinity) itself serialises to `null` (a VALID no-
        // cap value), so this has to hand-craft raw JSON text containing a
        // numeric literal that overflows to Infinity on parse (`1e400` is
        // valid JSON syntax) to actually exercise the guard against a
        // capMinutes value outside the five chip values.
        "capMinutes overflows to Infinity on parse (e.g. 1e400)",
        JSON.stringify(FULL).replace('"capMinutes":45', '"capMinutes":1e400'),
      ],
      ["capMinutes wrong shape", JSON.stringify({ ...FULL, capMinutes: "45" })],
      ["painMax3 not boolean", JSON.stringify({ ...FULL, painMax3: "yes" })],
      [
        "missing field",
        JSON.stringify({ date: "2026-08-01", planKey: "sprint", doneN: 11 }),
      ],
    ])("%s", (_name, raw) => {
      store(raw);
      expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toBeNull();
    });
  });

  it("save and load never throw when storage itself throws", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      expect(() => saveTodayOverrides(FULL)).not.toThrow();
      expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toBeNull();
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });

  it("exposes the storage key used", () => {
    expect(TODAY_OVERRIDES_KEY).toBe("ergomatic.todayOverrides");
  });
});

describe("snapCap", () => {
  it("returns the pref itself when it lands exactly on a chip", () => {
    expect(snapCap(60)).toBe(60);
    expect(snapCap(45)).toBe(45);
    expect(snapCap(30)).toBe(30);
    expect(snapCap(90)).toBe(90);
  });

  it("rounds up to the next chip when pref falls between two", () => {
    expect(snapCap(40)).toBe(45);
    expect(snapCap(50)).toBe(60);
    expect(snapCap(1)).toBe(30);
  });

  it("returns null (NO CAP) when pref exceeds every chip", () => {
    expect(snapCap(100)).toBeNull();
    expect(snapCap(91)).toBeNull();
  });
});
