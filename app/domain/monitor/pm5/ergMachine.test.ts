import { describe, expect, it } from "vitest";
import { unsupportedErgMachine } from "./ergMachine.js";

/**
 * THE TABLE IS WRITTEN FROM THE VENDOR ENUM, NOT FROM THE MODULE'S OWN MAP
 * (RF21's first smell). Every literal below is transcribed from PM5 Bluetooth
 * Smart Communication Interface Definition rev 1.30, Appendix A "Erg Machine
 * Type", which the design spec quotes verbatim. A test that imported the
 * module's constants would make a mistyped value self-consistent and prove
 * nothing about it.
 *
 * The rule under test, in one sentence: refuse every value the vendor NAMES as
 * not rowing, allow everything else — named or not.
 */
describe("unsupportedErgMachine", () => {
  describe("refuses every value the vendor names as not rowing", () => {
    it("64 (STATIC_DYNO) is a strength machine, not an erg we can record", () => {
      expect(unsupportedErgMachine(64)).toBe("dyno");
    });

    it("128 (STATIC_SKI) and 143 (STATIC_SKI_SIMULATOR) are skiing", () => {
      expect(unsupportedErgMachine(128)).toBe("ski");
      expect(unsupportedErgMachine(143)).toBe("ski");
    });

    it("192, 193, 194 (BIKE, _ARMS, _NOARMS) and 207 (_SIMULATOR) are cycling", () => {
      expect(unsupportedErgMachine(192)).toBe("bike");
      expect(unsupportedErgMachine(193)).toBe("bike");
      expect(unsupportedErgMachine(194)).toBe("bike");
      expect(unsupportedErgMachine(207)).toBe("bike");
    });
  });

  /**
   * 224 and 225 are ADJACENT and disagree, which makes them the pair most
   * likely to be typo'd into agreement — so they get their own assertions and
   * this title says why. A MultiErg reports which machine the CURRENT interval
   * is on (rev 1.30, footnote 23 on 0x003C), so `MULTIERG_ROW` is a rower and
   * `MULTIERG_SKI`/`_BIKE` are not.
   */
  describe("splits the MultiErg subfamily by what the interval actually is", () => {
    it("224 (MULTIERG_ROW) is rowing and proceeds", () => {
      expect(unsupportedErgMachine(224)).toBeNull();
    });

    it("225 (MULTIERG_SKI) is refused, though it sits next to 224", () => {
      expect(unsupportedErgMachine(225)).toBe("ski");
    });

    it("226 (MULTIERG_BIKE) is refused", () => {
      expect(unsupportedErgMachine(226)).toBe("bike");
    });
  });

  describe("allows every rowing machine the vendor names", () => {
    it.each([
      [0, "STATIC_D"],
      [1, "STATIC_C"],
      [2, "STATIC_A"],
      [3, "STATIC_B"],
      [5, "STATIC_E"],
      [7, "STATIC_SIMULATOR"],
      [8, "STATIC_DYNAMIC"],
      [16, "SLIDES_A"],
      [17, "SLIDES_B"],
      [18, "SLIDES_C"],
      [19, "SLIDES_D"],
      [20, "SLIDES_E"],
      [32, "SLIDES_DYNAMIC"],
    ])("%i (%s) proceeds", (value) => {
      expect(unsupportedErgMachine(value)).toBeNull();
    });
  });

  /**
   * THE FAIL DIRECTION, and the whole reason this is a denylist (James,
   * 2026-09-08). An allowlist would refuse a RowErg model Concept2 adds after
   * rev 1.30, turning a working erg into an unusable one. These values are the
   * gaps and the tail of the vendor's own table.
   */
  describe("allows values the vendor's list does not name", () => {
    it.each([
      [4],
      [6],
      [9],
      [63],
      [65],
      [127],
      [144],
      [191],
      [208],
      [223],
      [227],
      [255],
    ])(
      "%i is unnamed by rev 1.30, so it proceeds rather than being refused",
      (value) => {
        expect(unsupportedErgMachine(value)).toBeNull();
      },
    );
  });

  /**
   * ABSENCE IS NOT A REFUSAL. Pre-V1.26/V1.27 firmware omits the field
   * entirely, and refusing on ignorance would break a working erg. The
   * parameter is REQUIRED with `null` meaning absent (RF33): an optional
   * parameter would let a call site that forgets the field fail OPEN and no
   * assertion could see it.
   */
  it("null (the field was absent from the frame) proceeds", () => {
    expect(unsupportedErgMachine(null)).toBeNull();
  });
});
