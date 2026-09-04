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

export type GateScenario =
  | "normal"
  | "stop-during-connect"
  | "stop-during-query"
  | "stop-during-read"
  | "background"
  | "webview-reload";

export type ReaderEndingAction =
  "sheet-cancel" | "no-tag-timeout" | "forced-invalidation";
export type ReaderEndingReason =
  "userCancelled" | "sessionTimeout" | "invalidated";

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
    capabilityLatencyMs: number | null;
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
    action: ReaderEndingAction;
    observedReason: ReaderEndingReason | null;
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
  const values: unknown[] = Array.from(value);
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
  const isPm5BleInfo =
    record.tnf === 4 &&
    record.type.length === PM5_NFC_TYPE_BYTES.length &&
    record.type.every((byte, index) => byte === PM5_NFC_TYPE_BYTES[index]);
  if (!isPm5BleInfo) {
    return {
      tnf: record.tnf,
      type: [...record.type],
      id: [...record.id],
      payload: [...record.payload],
    };
  }
  if (record.payload.length < 7) {
    throw new Error("PM5 NFC payload is too short");
  }
  return {
    tnf: record.tnf,
    type: [...record.type],
    id: [...record.id],
    payload: [0, 0, 0, 0, 0, 0, ...record.payload.slice(6)],
  };
}

const CRITERIA_KEYS = [
  "rawNdefShape",
  "exactType",
  "paddingRuleObserved",
  "exactLocalNameBridge",
  "pickerFreeBleConnect",
  "signedReader",
  "readerEndingSemanticsObserved",
  "nativeIdentityAndDrain",
  "staleACannotAffectB",
] as const;

const ENDING_REASONS = new Set<ReaderEndingReason>([
  "userCancelled",
  "sessionTimeout",
  "invalidated",
]);

function criterionVerdict(criteria: NfcGateReceiptV1["criteria"]): boolean {
  return CRITERIA_KEYS.every((key) => criteria[key] === true);
}

function requireReceiptShape(receipt: Omit<NfcGateReceiptV1, "verdict">): void {
  if (receipt.schema !== "ergomatic/nfc-gate-minus-one/v1") {
    throw new Error("Invalid receipt schema");
  }
  if (
    !Array.isArray(receipt.attempts) ||
    !Array.isArray(receipt.readerEndings)
  ) {
    throw new Error("Invalid receipt collection");
  }
  for (const key of CRITERIA_KEYS) {
    if (typeof receipt.criteria[key] !== "boolean") {
      throw new Error(`Invalid receipt criterion: ${key}`);
    }
  }
  for (const ending of receipt.readerEndings) {
    if (
      !["sheet-cancel", "no-tag-timeout", "forced-invalidation"].includes(
        ending.action,
      )
    ) {
      throw new Error("Invalid reader ending action");
    }
    if (
      ending.observedReason !== null &&
      !ENDING_REASONS.has(ending.observedReason)
    ) {
      throw new Error("Invalid reader ending reason");
    }
  }
  const text = (value: unknown) => {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      Array.from(value).some((character) => character.charCodeAt(0) < 32)
    )
      throw new Error("Invalid receipt text");
  };
  const timestamp = (value: unknown) => {
    text(value);
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    )
      throw new Error("Invalid receipt timestamp");
  };
  const number = (value: unknown, integer = false) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      (integer && !Number.isSafeInteger(value))
    )
      throw new Error("Invalid receipt measurement");
  };
  const boolean = (value: unknown) => {
    if (typeof value !== "boolean") throw new Error("Invalid receipt boolean");
  };
  timestamp(receipt.capturedAtUtc);
  for (const value of [
    receipt.iphone.model,
    receipt.iphone.iosVersion,
    receipt.pm5.model,
    receipt.pm5.firmware,
    receipt.pm5.advertisedNameShown,
  ])
    text(value);
  if (
    !Array.isArray(receipt.signedEntitlement) ||
    receipt.signedEntitlement.length > 1 ||
    (receipt.signedEntitlement.length === 1 &&
      receipt.signedEntitlement[0] !== "TAG")
  )
    throw new Error("Invalid signed entitlement");
  if (
    receipt.package !== "@capgo/capacitor-nfc@8.2.5" ||
    receipt.usageDescription !==
      "Scan a PM5 to connect and program your workout."
  )
    throw new Error("Invalid receipt build identity");
  for (const entry of receipt.attempts) {
    if (
      ![
        "normal",
        "stop-during-connect",
        "stop-during-query",
        "stop-during-read",
        "background",
        "webview-reload",
      ].includes(entry.scenario)
    )
      throw new Error("Invalid receipt scenario");
    timestamp(entry.atUtc);
    for (const value of [
      entry.capabilityLatencyMs,
      entry.firstMatchingAdvertisementMs,
    ])
      if (value !== null) number(value);
    for (const value of [entry.decodedName, entry.liveLocalName])
      if (value !== null) text(value);
    for (const value of [
      entry.matchingDeviceCount,
      entry.staleIdDroppedCount,
      entry.staleAttemptSettlementCount,
    ])
      number(value, true);
    boolean(entry.connected);
    boolean(entry.disconnected);
    bytes(entry.trailingPayloadBytes, "trailing payload");
    if (!Array.isArray(entry.matchingAdvertisementIntervalsMs))
      throw new Error("Invalid receipt intervals");
    for (const interval of entry.matchingAdvertisementIntervalsMs)
      number(interval);
    decodeNfcEvent({
      attemptId: "validation",
      tag: { ndefMessage: entry.records },
    });
  }
}

export function serializeGateReceipt(
  receipt: Omit<NfcGateReceiptV1, "verdict">,
): string {
  requireReceiptShape(receipt);
  const criteria = receipt.criteria;
  const verdict = criterionVerdict(criteria) ? "GO" : "NO-GO";
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

const FRAME_PREFIX = "NFC_GATE_RECEIPT";
const FRAME_VERSION = "v1";
const FRAME_CHUNK_SIZE = 3000;

function base64Encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Bounded console messages survive Capacitor's per-argument 4068-char cap. */
export function frameGateReceipt(serialized: string): string[] {
  const encoded = base64Encode(serialized);
  // Independent framing identity: never an NFC attempt or device identifier.
  const exportId = Array.from(
    crypto.getRandomValues(new Uint32Array(4)),
    (value) => value.toString(16).padStart(8, "0"),
  ).join("");
  const total = Math.max(1, Math.ceil(encoded.length / FRAME_CHUNK_SIZE));
  const frames = Array.from({ length: total }, (_, index) => {
    const chunk = encoded.slice(
      index * FRAME_CHUNK_SIZE,
      (index + 1) * FRAME_CHUNK_SIZE,
    );
    return `${FRAME_PREFIX} ${FRAME_VERSION} ${exportId} fragment ${index + 1}/${total} ${encoded.length} ${chunk}`;
  });
  frames.push(
    `${FRAME_PREFIX} ${FRAME_VERSION} ${exportId} end ${total} ${encoded.length}`,
  );
  return frames;
}

export function reassembleGateReceiptFrames(frames: readonly string[]): string {
  const chunks = new Map<number, string>();
  let total: number | null = null;
  let ended = false;
  let exportId: string | null = null;
  let length: number | null = null;
  for (const frame of frames) {
    const fragment =
      /^NFC_GATE_RECEIPT v1 ([a-z0-9.-]+) fragment (\d+)\/(\d+) (\d+) ([A-Za-z0-9+/=]+)$/.exec(
        frame,
      );
    if (fragment !== null) {
      const index = Number(fragment[2]);
      const declaredTotal = Number(fragment[3]);
      const declaredLength = Number(fragment[4]);
      if (
        ended ||
        (exportId !== null && exportId !== fragment[1]) ||
        (length !== null && length !== declaredLength) ||
        !Number.isSafeInteger(declaredLength) ||
        declaredLength < 1 ||
        Math.ceil(declaredLength / FRAME_CHUNK_SIZE) !== declaredTotal ||
        fragment[5]!.length !==
          Math.min(
            FRAME_CHUNK_SIZE,
            declaredLength - (index - 1) * FRAME_CHUNK_SIZE,
          ) ||
        !Number.isSafeInteger(index) ||
        !Number.isSafeInteger(declaredTotal) ||
        index < 1 ||
        index > declaredTotal ||
        (total !== null && total !== declaredTotal) ||
        chunks.has(index)
      ) {
        throw new Error("Invalid receipt fragment");
      }
      total = declaredTotal;
      exportId = fragment[1]!;
      length = declaredLength;
      chunks.set(index, fragment[5]!);
      continue;
    }
    const end = /^NFC_GATE_RECEIPT v1 ([a-z0-9.-]+) end (\d+) (\d+)$/.exec(
      frame,
    );
    if (end !== null) {
      if (
        ended ||
        total === null ||
        end[1] !== exportId ||
        Number(end[2]) !== total ||
        Number(end[3]) !== length ||
        chunks.size !== total
      ) {
        throw new Error("Invalid receipt end frame");
      }
      ended = true;
    } else if (frame.startsWith(FRAME_PREFIX)) {
      throw new Error("Invalid receipt frame");
    }
  }
  if (!ended || total === null || chunks.size !== total) {
    throw new Error("Incomplete receipt frames");
  }
  return base64Decode(
    Array.from({ length: total }, (_, index) => chunks.get(index + 1)!).join(
      "",
    ),
  );
}

export function emitGateReceipt(
  receipt: Omit<NfcGateReceiptV1, "verdict">,
  logger: (message: string) => void = console.info,
): string {
  const serialized = serializeGateReceipt(receipt);
  for (const frame of frameGateReceipt(serialized)) logger(frame);
  return serialized;
}
