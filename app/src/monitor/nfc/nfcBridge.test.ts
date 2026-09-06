import { describe, expect, it } from "vitest";
import { decodeNfcEvent } from "./nfcBridge";
import { loadPm5NfcFixture } from "./fixtures";

const ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const OTHER = "9d1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const fixture = loadPm5NfcFixture().records;

function nativeEvent(overrides: Record<string, unknown> = {}): unknown {
  return {
    attemptId: ATTEMPT,
    type: "ndef",
    tag: {
      id: [1, 2, 3],
      ndefMessage: fixture.map((r) => ({
        tnf: r.tnf,
        type: [...r.type],
        id: [...r.id],
        payload: [...r.payload],
      })),
    },
    ...overrides,
  };
}

describe("decodeNfcEvent", () => {
  it("decodes the fixture wrapped as a native event, keeping tnf/type/payload only", () => {
    const decoded = decodeNfcEvent(nativeEvent(), ATTEMPT);
    expect("error" in decoded).toBe(false);
    if ("error" in decoded) throw new Error("unreachable");
    expect(decoded.attemptId).toBe(ATTEMPT);
    expect(decoded.records).toHaveLength(3);
    expect(Object.keys(decoded.records[0]!)).toStrictEqual([
      "tnf",
      "type",
      "payload",
    ]);
    expect(decoded.records[0]!.payload).toStrictEqual([...fixture[0]!.payload]);
  });

  it("drops a retained event for another attempt as stale-id", () => {
    expect(decodeNfcEvent(nativeEvent(), OTHER)).toStrictEqual({
      error: "stale-id",
    });
  });

  it("rejects an unattributable shape as invalid", () => {
    const cases: unknown[] = [
      null,
      undefined,
      "string",
      42,
      {},
      nativeEvent({ attemptId: "" }),
      nativeEvent({ attemptId: 7 }),
    ];
    for (const value of cases) {
      expect(decodeNfcEvent(value, ATTEMPT)).toStrictEqual({
        error: "invalid",
      });
    }
  });

  it("rejects a malformed event that carries THIS attempt's ID as invalid-for-attempt (a real producer: readNDEF failed, no ndefMessage)", () => {
    const cases: unknown[] = [
      nativeEvent({ tag: { id: [1, 2, 3] } }),
      nativeEvent({ tag: null }),
      nativeEvent({ tag: {} }),
      nativeEvent({ tag: { ndefMessage: "abc" } }),
      nativeEvent({ tag: { ndefMessage: [null] } }),
      nativeEvent({
        tag: { ndefMessage: [{ tnf: 1.5, type: [], payload: [] }] },
      }),
      nativeEvent({
        tag: { ndefMessage: [{ tnf: 8, type: [], payload: [] }] },
      }),
      nativeEvent({
        tag: { ndefMessage: [{ tnf: 4, type: [256], payload: [] }] },
      }),
      nativeEvent({
        tag: { ndefMessage: [{ tnf: 4, type: [], payload: [-1] }] },
      }),
      nativeEvent({
        tag: { ndefMessage: [{ tnf: 4, type: [], payload: "abc" }] },
      }),
      nativeEvent({
        tag: { ndefMessage: [{ tnf: 4, type: null, payload: [] }] },
      }),
      nativeEvent({
        tag: { ndefMessage: [{ tnf: 4, type: ["a"], payload: [] }] },
      }),
    ];
    for (const value of cases) {
      expect(decodeNfcEvent(value, ATTEMPT)).toStrictEqual({
        error: "invalid-for-attempt",
      });
    }
  });

  it("an empty message is valid (zero records) and left to the parser", () => {
    expect(
      decodeNfcEvent(nativeEvent({ tag: { ndefMessage: [] } }), ATTEMPT),
    ).toStrictEqual({ attemptId: ATTEMPT, records: [] });
  });
});
