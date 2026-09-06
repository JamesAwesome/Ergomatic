import { describe, expect, it } from "vitest";
import {
  isValidPm5AdvertisingName,
  parsePm5NfcTarget,
  PM5_NFC_TYPE_BYTES,
  type NfcRecord,
} from "./nfc.js";
import {
  FIXTURE_PM5_NAME,
  loadPm5NfcFixture,
} from "../../src/monitor/nfc/fixtures";

const fixture = loadPm5NfcFixture().records;
const pm5 = fixture[0]!;

function withPayload(payload: number[]): NfcRecord {
  return { tnf: pm5.tnf, type: pm5.type, payload };
}

describe("parsePm5NfcTarget", () => {
  it("decodes the canonical capture to the literal advertised name", () => {
    expect(parsePm5NfcTarget(fixture)).toStrictEqual({
      advertisingName: FIXTURE_PM5_NAME,
    });
  });

  it("accepts the PM5 record when it is not first", () => {
    expect(parsePm5NfcTarget([fixture[2]!, fixture[1]!, pm5])).toStrictEqual({
      advertisingName: FIXTURE_PM5_NAME,
    });
  });

  it("rejects an empty message", () => {
    expect(parsePm5NfcTarget([])).toStrictEqual({
      code: "unsupported",
      reason: "no PM5 record",
    });
  });

  it("rejects a wrong TNF with the right type bytes", () => {
    expect(parsePm5NfcTarget([{ ...pm5, tnf: 1 }])).toMatchObject({
      code: "unsupported",
    });
  });

  it("rejects a type that differs by one byte", () => {
    const type = [...PM5_NFC_TYPE_BYTES];
    type[type.length - 1] = 0x78; // trailing 'o' → 'x'
    expect(parsePm5NfcTarget([{ ...pm5, type }])).toMatchObject({
      code: "unsupported",
    });
  });

  it("rejects two PM5 records even when identical", () => {
    expect(parsePm5NfcTarget([pm5, pm5])).toStrictEqual({
      code: "unsupported",
      reason: "more than one PM5 record",
    });
  });

  it("rejects a payload shorter than the capture-proven 40 bytes", () => {
    expect(
      parsePm5NfcTarget([withPayload(pm5.payload.slice(0, 39))]),
    ).toMatchObject({
      code: "unsupported",
    });
  });

  it("rejects a payload longer than 40 bytes", () => {
    expect(parsePm5NfcTarget([withPayload([...pm5.payload, 0])])).toMatchObject(
      {
        code: "unsupported",
      },
    );
  });

  it("rejects a name with no zero terminator inside the payload", () => {
    const payload = [
      ...pm5.payload.slice(0, 7),
      ...Array.from("PM5 " + "A".repeat(29), (c) => c.charCodeAt(0)),
    ];
    expect(payload).toHaveLength(40);
    expect(parsePm5NfcTarget([withPayload(payload)])).toMatchObject({
      code: "unsupported",
    });
  });

  it("rejects a 32-byte name that IS zero-terminated inside the 40 bytes (the overlong-name branch)", () => {
    // 7 header bytes + "PM5 " + 28 chars (32 bytes) + one 0x00 = 40 bytes:
    // terminated, so the no-terminator branch does not fire first.
    const payload = [
      ...pm5.payload.slice(0, 7),
      ...Array.from("PM5 " + "B".repeat(28), (c) => c.charCodeAt(0)),
      0x00,
    ];
    expect(payload).toHaveLength(40);
    expect(parsePm5NfcTarget([withPayload(payload)])).toStrictEqual({
      code: "unsupported",
      reason: "name exceeds 31 bytes",
    });
  });

  it("rejects a non-zero byte after the terminator (bad padding)", () => {
    const payload = [...pm5.payload];
    payload[39] = 0x41;
    expect(parsePm5NfcTarget([withPayload(payload)])).toMatchObject({
      code: "unsupported",
    });
  });

  it("rejects an embedded control character and a non-ASCII byte", () => {
    for (const bad of [0x09, 0x7f, 0xc3]) {
      const payload = [...pm5.payload];
      payload[9] = bad;
      expect(parsePm5NfcTarget([withPayload(payload)])).toMatchObject({
        code: "unsupported",
      });
    }
  });

  it("rejects an empty name and a name without the PM5 prefix", () => {
    const empty = [...pm5.payload.slice(0, 7), ...new Array(33).fill(0)];
    expect(parsePm5NfcTarget([withPayload(empty)])).toMatchObject({
      code: "unsupported",
    });
    const other = [...pm5.payload];
    other[7] = 0x50;
    other[8] = 0x4d;
    other[9] = 0x34; // "PM4 "
    expect(parsePm5NfcTarget([withPayload(other)])).toMatchObject({
      code: "unsupported",
    });
  });

  it("ignores the address and address-type bytes after structural validation", () => {
    const payload = [...pm5.payload];
    payload[0] = 0xff;
    payload[5] = 0xff;
    payload[6] = 0x00;
    expect(parsePm5NfcTarget([withPayload(payload)])).toStrictEqual({
      advertisingName: FIXTURE_PM5_NAME,
    });
  });

  it("returns only the advertising name (no payload, address or type leaks)", () => {
    expect(Object.keys(parsePm5NfcTarget(fixture))).toStrictEqual([
      "advertisingName",
    ]);
  });
});

describe("isValidPm5AdvertisingName", () => {
  it("accepts the fixture name and rejects the boundary cases", () => {
    expect(isValidPm5AdvertisingName(FIXTURE_PM5_NAME)).toBe(true);
    expect(isValidPm5AdvertisingName("PM5 " + "x".repeat(27))).toBe(true); // 31 bytes
    expect(isValidPm5AdvertisingName("PM5 " + "x".repeat(28))).toBe(false); // 32 bytes
    expect(isValidPm5AdvertisingName("PM5")).toBe(false);
    expect(isValidPm5AdvertisingName("PM5 ")).toBe(false);
    expect(isValidPm5AdvertisingName("pm5 432331249 Row")).toBe(false);
    expect(isValidPm5AdvertisingName("PM5 4323\u000031249")).toBe(false);
    expect(isValidPm5AdvertisingName("PM5 é")).toBe(false);
    expect(isValidPm5AdvertisingName(undefined)).toBe(false);
    expect(isValidPm5AdvertisingName(42)).toBe(false);
  });
});
