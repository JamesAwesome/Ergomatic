import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JUDGE_COLORS_KEY,
  JUDGE_COLOR_DEFAULTS,
  JUDGE_SLOT_PROPERTIES,
  applyJudgeColors,
  loadJudgeColors,
  saveJudgeColors,
  type JudgeColors,
} from "./judgeColors";

/** `src/test/setup.ts` is one line (`import "@testing-library/jest-dom"`) and
 *  clears NOTHING. Both of this module's outputs are global and sticky: the
 *  localStorage key survives every test in the file, and
 *  `document.documentElement.style` survives the whole run. Reset both, or
 *  state leaks forward and a later test reads an earlier test's write. */
beforeEach(() => {
  localStorage.removeItem(JUDGE_COLORS_KEY);
  document.documentElement.removeAttribute("style");
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Writes the store's key EXACTLY as given, bypassing `saveJudgeColors`, so a
 *  corruption case describes a byte sequence on disk rather than something
 *  this module could have produced. */
function writeRaw(raw: string): void {
  localStorage.setItem(JUDGE_COLORS_KEY, raw);
}

/** Non-default in all four slots (defaults are blue/red/blue/red), so no
 *  assertion against it can pass by accidentally agreeing with a default. */
const ALL_FOUR_NON_DEFAULT: JudgeColors = {
  paceFaster: "off",
  paceSlower: "blue",
  spmFaster: "red",
  spmSlower: "off",
};

describe("judgeColors defaults (I-1: a rower who never opens the screen)", () => {
  it("ships blue-faster / red-slower on both metrics", () => {
    expect(JUDGE_COLOR_DEFAULTS).toStrictEqual({
      paceFaster: "blue",
      paceSlower: "red",
      spmFaster: "blue",
      spmSlower: "red",
    });
  });

  it("maps each slot to its own resolved custom property", () => {
    expect(JUDGE_SLOT_PROPERTIES).toStrictEqual({
      paceFaster: "--judge-pace-faster",
      paceSlower: "--judge-pace-slower",
      spmFaster: "--judge-spm-faster",
      spmSlower: "--judge-spm-slower",
    });
  });
});

describe("loadJudgeColors — I-2: the read is total PER FIELD", () => {
  it("a device that has never written the key reads the defaults", () => {
    expect(loadJudgeColors()).toStrictEqual(JUDGE_COLOR_DEFAULTS);
  });

  // Every whole-store corruption: nothing survives, so all four slots fall
  // back. Each asserts the WHOLE object, so one field bleeding into another
  // fails here rather than in production.
  it.each([
    ["unparseable text", "not json"],
    ["the JSON literal null", "null"],
    ["an array", "[]"],
    ["an empty object", "{}"],
    ["a JSON string", '"red"'],
    ["a JSON number", "7"],
    ["a JSON boolean", "true"],
  ])("%s reads as the defaults", (_label, raw) => {
    writeRaw(raw);
    expect(loadJudgeColors()).toStrictEqual(JUDGE_COLOR_DEFAULTS);
  });

  it("one field alone survives, and the other three fall back to THEIR defaults", () => {
    // `paceFaster: "red"` is non-default (the default is blue), so a reader
    // that answers `JUDGE_COLOR_DEFAULTS` wholesale on any malformed field
    // loses it. This is the case that separates total-per-field from
    // total-per-key.
    writeRaw('{"paceFaster":"red"}');
    expect(loadJudgeColors()).toStrictEqual({
      paceFaster: "red",
      paceSlower: "red",
      spmFaster: "blue",
      spmSlower: "red",
    });
  });

  // One corrupt slot against three GOOD non-default neighbours. If the three
  // neighbours were left at their defaults, a wholesale-default reader would
  // pass every row of this table.
  const CORRUPT_VALUES: readonly [string, string][] = [
    ["a colour outside the union", '"green"'],
    ["the empty string", '""'],
    ["a number", "0"],
    ["null", "null"],
    ["an object", "{}"],
    ["an array", "[]"],
    ["a boolean", "false"],
    [
      "the key simply absent (JSON has no undefined)",
      null as unknown as string,
    ],
  ];

  for (const slot of [
    "paceFaster",
    "paceSlower",
    "spmFaster",
    "spmSlower",
  ] as const) {
    it.each(CORRUPT_VALUES)(
      `${slot} holding %s falls back alone; the other three keep their stored values`,
      (_label, badJson) => {
        const fields = { ...ALL_FOUR_NON_DEFAULT };
        const entries = Object.entries(fields)
          .filter(([k]) => k !== slot)
          .map(([k, v]) => `"${k}":"${v}"`);
        // `badJson === null` models the key being absent entirely — the
        // closest JSON can come to `undefined`, which it cannot encode.
        if (badJson !== null) entries.push(`"${slot}":${badJson}`);
        writeRaw(`{${entries.join(",")}}`);

        expect(loadJudgeColors()).toStrictEqual({
          ...ALL_FOUR_NON_DEFAULT,
          [slot]: JUDGE_COLOR_DEFAULTS[slot],
        });
      },
    );
  }

  it("an unknown extra key is ignored and the four real slots still read", () => {
    writeRaw('{"paceFaster":"off","v":1,"spmFaster":"red"}');
    expect(loadJudgeColors()).toStrictEqual({
      paceFaster: "off",
      paceSlower: "red",
      spmFaster: "red",
      spmSlower: "red",
    });
  });

  it("returns a fresh object each call — a caller mutating it cannot poison the defaults", () => {
    const first = loadJudgeColors();
    first.paceFaster = "off";
    expect(loadJudgeColors().paceFaster).toBe("blue");
    expect(JUDGE_COLOR_DEFAULTS.paceFaster).toBe("blue");
  });
});

describe("loadJudgeColors — I-9: a storage failure yields defaults and never throws", () => {
  it("getItem throwing a SecurityError yields the defaults", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    expect(loadJudgeColors()).toStrictEqual(JUDGE_COLOR_DEFAULTS);
  });

  it("the localStorage GETTER throwing a TypeError yields the defaults, not a white screen", () => {
    // The detached-document shape the 2026-09-03 research names: WebKit's
    // `nullptr` paths make `window.localStorage` null, so the access itself
    // throws a TypeError rather than a SecurityError. This module runs at
    // module scope before `createRoot`, so an escape here is a blank app,
    // which is why the catch is BARE and this case is not only SecurityError.
    const original = Object.getOwnPropertyDescriptor(
      window,
      "localStorage",
    ) as PropertyDescriptor;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new TypeError(
          "Cannot read properties of null (reading 'getItem')",
        );
      },
    });
    try {
      expect(() => loadJudgeColors()).not.toThrow();
      expect(loadJudgeColors()).toStrictEqual(JUDGE_COLOR_DEFAULTS);
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
    // The descriptor really was restored, or every later test in this file
    // would be running against a throwing store.
    expect(() => localStorage.getItem(JUDGE_COLORS_KEY)).not.toThrow();
  });
});

describe("saveJudgeColors — I-6: the caller can branch on the write", () => {
  it("returns true when the write lands, and the value is readable back", () => {
    expect(saveJudgeColors(ALL_FOUR_NON_DEFAULT)).toBe(true);
    expect(localStorage.getItem(JUDGE_COLORS_KEY)).not.toBeNull();
  });

  it("returns FALSE when setItem throws, and never throws itself", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    // Independent literal: `false`, not `!somethingDerivedFromTheModule`.
    expect(saveJudgeColors(ALL_FOUR_NON_DEFAULT)).toBe(false);
  });

  it("a failed write leaves nothing behind — the next read is the defaults", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    saveJudgeColors(ALL_FOUR_NON_DEFAULT);
    vi.restoreAllMocks();
    expect(loadJudgeColors()).toStrictEqual(JUDGE_COLOR_DEFAULTS);
  });
});

describe("I-10: what saveJudgeColors writes is what loadJudgeColors reads", () => {
  it("round trips a value non-default in ALL FOUR slots", () => {
    // Starts UPSTREAM of the producer (RF24): nothing here hand-writes the
    // stored bytes, so a serialisation the reader does not follow fails here
    // and in no I-2 case, because no I-2 case calls the writer at all.
    expect(saveJudgeColors(ALL_FOUR_NON_DEFAULT)).toBe(true);
    expect(loadJudgeColors()).toStrictEqual(ALL_FOUR_NON_DEFAULT);
  });

  it("round trips every member of the union in every slot", () => {
    for (const color of ["red", "blue", "off"] as const) {
      const all: JudgeColors = {
        paceFaster: color,
        paceSlower: color,
        spmFaster: color,
        spmSlower: color,
      };
      expect(saveJudgeColors(all)).toBe(true);
      expect(loadJudgeColors()).toStrictEqual(all);
    }
  });

  it("a second save overwrites the first", () => {
    saveJudgeColors(ALL_FOUR_NON_DEFAULT);
    const next: JudgeColors = { ...ALL_FOUR_NON_DEFAULT, spmSlower: "blue" };
    saveJudgeColors(next);
    expect(loadJudgeColors()).toStrictEqual(next);
  });
});

describe("applyJudgeColors writes the four root properties", () => {
  // These assert the property VALUE this module produced — a string it wrote,
  // never a computed colour. jsdom does not resolve `var()`, so
  // `getComputedStyle(el).color` would return the literal reference and pass
  // against a completely broken cascade (spec, "How each invariant is gated").
  it("maps red / blue / off to the raw ink, the raw ink, and --ink", () => {
    applyJudgeColors({
      paceFaster: "red",
      paceSlower: "blue",
      spmFaster: "off",
      spmSlower: "red",
    });
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--judge-pace-faster")).toBe(
      "var(--judge-red)",
    );
    expect(style.getPropertyValue("--judge-pace-slower")).toBe(
      "var(--judge-blue)",
    );
    expect(style.getPropertyValue("--judge-spm-faster")).toBe("var(--ink)");
    expect(style.getPropertyValue("--judge-spm-slower")).toBe(
      "var(--judge-red)",
    );
  });

  it("writes all four properties for the defaults, none left unset", () => {
    applyJudgeColors(JUDGE_COLOR_DEFAULTS);
    const style = document.documentElement.style;
    for (const property of Object.values(JUDGE_SLOT_PROPERTIES)) {
      expect(style.getPropertyValue(property)).not.toBe("");
    }
  });

  it("a later apply overwrites an earlier one in place", () => {
    applyJudgeColors(JUDGE_COLOR_DEFAULTS);
    applyJudgeColors({ ...JUDGE_COLOR_DEFAULTS, paceSlower: "off" });
    expect(
      document.documentElement.style.getPropertyValue("--judge-pace-slower"),
    ).toBe("var(--ink)");
  });

  it("touches nothing but its own four properties", () => {
    document.documentElement.style.setProperty("--ink", "#000000");
    applyJudgeColors(ALL_FOUR_NON_DEFAULT);
    expect(document.documentElement.style.getPropertyValue("--ink")).toBe(
      "#000000",
    );
    // I-3/I-4: the raw inks a rower may choose are never rewritten, so the
    // LOST-THE-MONITOR alarm's red cannot move with a preference.
    expect(document.documentElement.style.getPropertyValue("--judge-red")).toBe(
      "",
    );
    expect(
      document.documentElement.style.getPropertyValue("--judge-blue"),
    ).toBe("");
  });
});
