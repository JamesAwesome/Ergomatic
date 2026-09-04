export const PM5_NFC_TYPE_BYTES = Array.from(
  new TextEncoder().encode("concept2.com:bleconnectinfo"),
);

export interface RedactedNfcRecord {
  tnf: number;
  type: number[];
  id: number[];
  payload: number[];
}

export interface DecodedNfcEvent {
  attemptId: string;
  records: RedactedNfcRecord[];
}

type GateScenario =
  | "normal"
  | "stop-during-connect"
  | "stop-during-query"
  | "stop-during-read"
  | "reload"
  | "stress";

export interface NfcGateReceiptV1 {
  schema: "ergomatic/nfc-gate-minus-one/v1";
  capturedAtUtc: string;
  iphone: { model: string; iosVersion: string };
  pm5: { model: string; firmware: string; advertisedNameShown: string };
  signedEntitlement: string[];
  usageDescription: string;
  package: string;
  attempts: Array<{
    scenario: GateScenario;
    atUtc: string;
    capabilityLatencyMs: number;
    records: RedactedNfcRecord[];
    decodedName: string | null;
    liveLocalName: string | null;
    trailingPayloadBytes: number[];
    firstMatchingAdvertisementMs: number | null;
    matchingAdvertisementIntervalsMs: number[];
    matchingDeviceCount: number;
    connected: boolean;
    disconnected: boolean;
    staleIdDroppedCount: number;
    staleAttemptSettlementCount: number;
  }>;
  readerEndings: Array<{
    action: "sheet-cancel" | "no-tag-timeout" | "forced-invalidation";
    observedReason: string | null;
  }>;
  criteria: {
    rawNdefShape: boolean;
    exactType: boolean;
    paddingRuleObserved: boolean;
    exactLocalNameBridge: boolean;
    pickerFreeBleConnect: boolean;
    signedReader: boolean;
    readerEndingSemanticsObserved: boolean;
    nativeIdentityAndDrain: boolean;
    staleACannotAffectB: boolean;
  };
  verdict: "GO" | "NO-GO";
}

function bytes(value: unknown, field: string): number[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const values = value as unknown[];
  if (
    values.some(
      (item) =>
        !Number.isInteger(item) ||
        (item as number) < 0 ||
        (item as number) > 255,
    )
  ) {
    throw new Error(`Invalid ${field}`);
  }
  return values.map((item) => item as number);
}

export function decodeNfcEvent(value: unknown): DecodedNfcEvent {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid NFC event");
  }
  const event = value as { attemptId?: unknown; tag?: unknown };
  if (typeof event.attemptId !== "string" || event.attemptId.length === 0) {
    throw new Error("Invalid attemptId");
  }
  if (typeof event.tag !== "object" || event.tag === null) {
    throw new Error("Invalid tag");
  }
  const tag = event.tag as { ndefMessage?: unknown };
  if (!Array.isArray(tag.ndefMessage)) {
    throw new Error("Invalid tag.ndefMessage");
  }
  return {
    attemptId: event.attemptId,
    records: tag.ndefMessage.map((value, index) => {
      if (typeof value !== "object" || value === null) {
        throw new Error(`Invalid tag.ndefMessage[${index}]`);
      }
      const record = value as {
        tnf?: unknown;
        type?: unknown;
        id?: unknown;
        payload?: unknown;
      };
      if (
        !Number.isInteger(record.tnf) ||
        (record.tnf as number) < 0 ||
        (record.tnf as number) > 7
      ) {
        throw new Error(`Invalid tag.ndefMessage[${index}].tnf`);
      }
      return {
        tnf: record.tnf as number,
        type: bytes(record.type, `tag.ndefMessage[${index}].type`),
        id: bytes(record.id, `tag.ndefMessage[${index}].id`),
        payload: bytes(record.payload, `tag.ndefMessage[${index}].payload`),
      };
    }),
  };
}

export function matchAdvertisedName(
  payload: readonly number[],
  localName: unknown,
) {
  if (typeof localName !== "string" || localName.length === 0) return null;
  const nameBytes = Array.from(localName, (character) =>
    character.charCodeAt(0),
  );
  if (nameBytes.some((value) => value < 0x20 || value > 0x7e)) return null;
  const body = payload.slice(7);
  if (body.length < nameBytes.length) return null;
  if (
    body
      .slice(0, nameBytes.length)
      .some((value, index) => value !== nameBytes[index])
  )
    return null;
  const trailingPayloadBytes = body.slice(nameBytes.length);
  return {
    decodedName: localName,
    trailingPayloadBytes: [...trailingPayloadBytes],
  };
}

export function redactNfcRecord(record: RedactedNfcRecord): RedactedNfcRecord {
  if (record.payload.length < 7) throw new Error("NFC payload is too short");
  return {
    tnf: record.tnf,
    type: [...record.type],
    id: [...record.id],
    payload: [0, 0, 0, 0, 0, 0, ...record.payload.slice(6)],
  };
}

export function serializeGateReceipt(
  receipt: Omit<NfcGateReceiptV1, "verdict">,
): string {
  const criteria = receipt.criteria;
  const verdict = Object.values(criteria).every((value) => value)
    ? "GO"
    : "NO-GO";
  const safeReceipt: NfcGateReceiptV1 = {
    schema: receipt.schema,
    capturedAtUtc: receipt.capturedAtUtc,
    iphone: {
      model: receipt.iphone.model,
      iosVersion: receipt.iphone.iosVersion,
    },
    pm5: {
      model: receipt.pm5.model,
      firmware: receipt.pm5.firmware,
      advertisedNameShown: receipt.pm5.advertisedNameShown,
    },
    signedEntitlement: receipt.signedEntitlement.map((format) => format),
    usageDescription: receipt.usageDescription,
    package: receipt.package,
    attempts: receipt.attempts.map((attempt) => ({
      scenario: attempt.scenario,
      atUtc: attempt.atUtc,
      capabilityLatencyMs: attempt.capabilityLatencyMs,
      records: attempt.records.map((record) => redactNfcRecord(record)),
      decodedName: attempt.decodedName,
      liveLocalName: attempt.liveLocalName,
      trailingPayloadBytes: attempt.trailingPayloadBytes.map((byte) => byte),
      firstMatchingAdvertisementMs: attempt.firstMatchingAdvertisementMs,
      matchingAdvertisementIntervalsMs:
        attempt.matchingAdvertisementIntervalsMs.map((interval) => interval),
      matchingDeviceCount: attempt.matchingDeviceCount,
      connected: attempt.connected,
      disconnected: attempt.disconnected,
      staleIdDroppedCount: attempt.staleIdDroppedCount,
      staleAttemptSettlementCount: attempt.staleAttemptSettlementCount,
    })),
    readerEndings: receipt.readerEndings.map((ending) => ({
      action: ending.action,
      observedReason: ending.observedReason,
    })),
    criteria: {
      rawNdefShape: criteria.rawNdefShape,
      exactType: criteria.exactType,
      paddingRuleObserved: criteria.paddingRuleObserved,
      exactLocalNameBridge: criteria.exactLocalNameBridge,
      pickerFreeBleConnect: criteria.pickerFreeBleConnect,
      signedReader: criteria.signedReader,
      readerEndingSemanticsObserved: criteria.readerEndingSemanticsObserved,
      nativeIdentityAndDrain: criteria.nativeIdentityAndDrain,
      staleACannotAffectB: criteria.staleACannotAffectB,
    },
    verdict,
  };
  return `${JSON.stringify(safeReceipt, null, 2)}\n`;
}
