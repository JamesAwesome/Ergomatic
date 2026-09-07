import { describe, expect, it } from "vitest";
import {
  displayVerificationCode,
  verificationWords,
  wireVerificationCode,
} from "./verificationCode.js";

// The exit-7 walk's real 0x003F payload (seq 64): `06 47 99 af 54 b0 21 c0
// 82 16 01 00 94 00 00 00 00 00 00`. Words derived by hand, LE u32:
// 0xaf<<24 | 0x99<<16 | 0x47<<8 | 0x06 = 0xAF994706 → AF99-4706;
// 0xc0<<24 | 0x21<<16 | 0xb0<<8 | 0x54 = 0xC021B054 → C021-B054.
const EXIT7 = [
  0x06, 0x47, 0x99, 0xaf, 0x54, 0xb0, 0x21, 0xc0, 0x82, 0x16, 0x01, 0x00, 0x94,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

describe("verificationCode", () => {
  it("reads the two LE u32 words the PM5's own screen shows", () => {
    expect(verificationWords(EXIT7)).toStrictEqual(["AF99-4706", "C021-B054"]);
  });
  it("display form: a space between words; wire form: the dash Concept2 accepted live", () => {
    expect(displayVerificationCode(EXIT7)).toBe("AF99-4706 C021-B054");
    expect(wireVerificationCode(EXIT7)).toBe("AF99-4706-C021-B054");
  });
  it("pads a small word to eight hex digits rather than shortening the code", () => {
    expect(wireVerificationCode([1, 0, 0, 0, 2, 0, 0, 0])).toBe(
      "0000-0001-0000-0002",
    );
  });
  it("is null under eight bytes — never a padded guess", () => {
    expect(verificationWords(EXIT7.slice(0, 7))).toBeNull();
    expect(wireVerificationCode([])).toBeNull();
  });
});
