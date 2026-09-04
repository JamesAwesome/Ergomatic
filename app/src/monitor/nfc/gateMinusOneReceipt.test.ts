import { describe, expect, it } from "vitest";
import {
  decodeNfcEvent,
  matchAdvertisedName,
  redactNfcRecord,
  frameGateReceipt,
  reassembleGateReceiptFrames,
  serializeGateReceipt,
} from "./gateMinusOneReceipt";
import type { NfcGateReceiptV1 } from "./gateMinusOneReceipt";

const PM5_TYPE = Array.from(
  new TextEncoder().encode("concept2.com:bleconnectinfo"),
);

describe("Gate -1 receipt", () => {
  it("rejects malformed bridge bytes", () => {
    expect(() =>
      decodeNfcEvent({
        attemptId: "a",
        tag: { ndefMessage: [{ tnf: 4, type: [256], id: [], payload: [] }] },
      }),
    ).toThrow();
    expect(() =>
      decodeNfcEvent({
        attemptId: "a",
        tag: { ndefMessage: [{ tnf: 4, type: [1.5], id: [], payload: [] }] },
      }),
    ).toThrow();
  });

  it("matches only byte-exact printable ASCII at payload offset seven", () => {
    const payload = [1, 2, 3, 4, 5, 6, 0, 80, 77, 53, 32, 52, 50, 0, 0];
    expect(matchAdvertisedName(payload, "PM5 42")).toStrictEqual({
      decodedName: "PM5 42",
      trailingPayloadBytes: [0, 0],
    });
    expect(matchAdvertisedName(payload, "PM5 4X")).toBeNull();
    expect(matchAdvertisedName(payload, "pm5 42")).toBeNull();
  });

  it("zeros only PM5 address bytes and preserves sidecar records byte-for-byte", () => {
    expect(
      redactNfcRecord({
        tnf: 4,
        type: PM5_TYPE,
        id: [8],
        payload: [1, 2, 3, 4, 5, 6, 1, 80, 77, 53],
      }),
    ).toStrictEqual({
      tnf: 4,
      type: PM5_TYPE,
      id: [8],
      payload: [0, 0, 0, 0, 0, 0, 1, 80, 77, 53],
    });
    expect(
      redactNfcRecord({ tnf: 1, type: [84], id: [], payload: [1, 2] }),
    ).toStrictEqual({ tnf: 1, type: [84], id: [], payload: [1, 2] });
    expect(() =>
      redactNfcRecord({ tnf: 4, type: PM5_TYPE, id: [], payload: [1, 2] }),
    ).toThrow("PM5 NFC payload is too short");
  });

  it("derives NO-GO and strips untrusted identity fields", () => {
    const receipt = makeCompleteReceipt({ staleACannotAffectB: false });
    Object.assign(receipt, { attemptId: "attempt-a" });
    Object.assign(receipt.attempts[0]!, { deviceId: "device-id" });
    Object.assign(receipt.attempts[0]!.records[0]!, {
      deviceId: "device-id",
    });
    Object.assign(receipt.pm5, { deviceId: "device-id" });
    Object.assign(receipt.readerEndings[0]!, { attemptId: "attempt-a" });
    Object.assign(receipt.criteria, { deviceId: "device-id" });
    const serialized = serializeGateReceipt(receipt);
    expect(JSON.parse(serialized).verdict).toBe("NO-GO");
    expect(serialized).not.toContain("attempt-a");
    expect(serialized).not.toContain("device-id");
  });

  it("reconstructs a receipt larger than Capacitor's 4068-character console argument cap", () => {
    const receipt = makeCompleteReceipt();
    receipt.attempts = Array.from({ length: 40 }, () => ({
      ...receipt.attempts[0]!,
      records: [
        {
          tnf: 4,
          type: [99],
          id: [],
          payload: Array.from({ length: 240 }, (_, index) => index % 256),
        },
      ],
    }));
    const serialized = serializeGateReceipt(receipt);
    expect(serialized.length).toBeGreaterThan(4068);
    const nativeConsole = frameGateReceipt(serialized).map((message) =>
      message.slice(0, 4068),
    );
    expect(reassembleGateReceiptFrames(nativeConsole)).toBe(serialized);
    expect(() =>
      reassembleGateReceiptFrames(nativeConsole.slice(0, -1)),
    ).toThrow("Incomplete receipt frames");
  });
});

function makeCompleteReceipt(
  criteriaOverride: Partial<NfcGateReceiptV1["criteria"]> = {},
): Omit<NfcGateReceiptV1, "verdict"> {
  return {
    schema: "ergomatic/nfc-gate-minus-one/v1",
    capturedAtUtc: "2026-09-03T20:00:00.000Z",
    iphone: { model: "iPhone test model", iosVersion: "26.5" },
    pm5: {
      model: "PM5",
      firmware: "test firmware",
      advertisedNameShown: "P",
    },
    signedEntitlement: ["TAG"],
    usageDescription: "Scan a PM5 to connect and program your workout.",
    package: "@capgo/capacitor-nfc@8.2.5",
    attempts: [
      {
        scenario: "normal",
        atUtc: "2026-09-03T20:00:00.000Z",
        capabilityLatencyMs: 12,
        records: [
          { tnf: 4, type: [99], id: [], payload: [1, 2, 3, 4, 5, 6, 1, 80, 0] },
        ],
        decodedName: "P",
        liveLocalName: "P",
        trailingPayloadBytes: [0],
        firstMatchingAdvertisementMs: 34,
        matchingAdvertisementIntervalsMs: [77],
        matchingDeviceCount: 1,
        connected: true,
        disconnected: true,
        staleIdDroppedCount: 1,
        staleAttemptSettlementCount: 0,
      },
    ],
    readerEndings: [
      { action: "sheet-cancel", observedReason: "userCancelled" },
      { action: "no-tag-timeout", observedReason: "sessionTimeout" },
      { action: "forced-invalidation", observedReason: "invalidated" },
    ],
    criteria: {
      rawNdefShape: true,
      exactType: true,
      paddingRuleObserved: true,
      exactLocalNameBridge: true,
      pickerFreeBleConnect: true,
      signedReader: true,
      readerEndingSemanticsObserved: true,
      nativeIdentityAndDrain: true,
      staleACannotAffectB: true,
      ...criteriaOverride,
    },
  };
}
