// Phase NF (spec §2, "A strict parser produces the only cross-radio
// value"). Pure: validated integer arrays in, ONE advertising name out.
// Nothing here knows about Capacitor, Core NFC, React or the PM5 driver.
//
// The payload rule is CAPTURE-PROVEN, not spec-derived: Concept2's interface
// definition describes three fields (six-byte BLE address, one-byte address
// type, a name of up to 31 bytes) and says nothing about the record's
// length. Gate -1 read the same PM5 three times
// (`docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json`,
// `REMAINING-PROOF.md` criterion 3): a 40-byte payload, the complete name at
// offset 7, zero bytes to the end. So: exactly 40 bytes, name from offset 7
// to the first 0x00, only 0x00 after it. Other PM5 firmware may differ; the
// parser fails closed on anything else and the rower keeps manual Connect.

export interface NfcRecord {
  tnf: number;
  type: readonly number[];
  payload: readonly number[];
}

export interface Pm5NfcTarget {
  advertisingName: string;
}

export type Pm5NfcParseFailure = { code: "unsupported"; reason: string };

/** TNF 0x04 = NFC Forum external type. */
export const PM5_NFC_TNF_EXTERNAL = 0x04;
/** ASCII bytes of `concept2.com:bleconnectinfo`. */
export const PM5_NFC_TYPE_BYTES: readonly number[] = Array.from(
  "concept2.com:bleconnectinfo",
  (c) => c.charCodeAt(0),
);
export const PM5_NFC_PAYLOAD_BYTES = 40;
const PM5_NFC_NAME_OFFSET = 7;
/** Concept2's own limit for the advertising name. */
export const PM5_ADVERTISING_NAME_MAX_BYTES = 31;
const PM5_NAME_PREFIX = "PM5 ";

function isPrintableAscii(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

function isPm5Record(record: NfcRecord): boolean {
  return (
    record.tnf === PM5_NFC_TNF_EXTERNAL &&
    record.type.length === PM5_NFC_TYPE_BYTES.length &&
    record.type.every((b, i) => b === PM5_NFC_TYPE_BYTES[i])
  );
}

/** Strict printable-ASCII `PM5 …` name within Concept2's 31-byte limit.
 *  Used by the parser AND by the targeted-scan boundary
 *  (`capacitorBle.ts`'s request validation) so both name one rule. */
export function isValidPm5AdvertisingName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length <= PM5_NAME_PREFIX.length) return false;
  if (value.length > PM5_ADVERTISING_NAME_MAX_BYTES) return false;
  if (!value.startsWith(PM5_NAME_PREFIX)) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (!isPrintableAscii(value.charCodeAt(i))) return false;
  }
  return true;
}

function unsupported(reason: string): Pm5NfcParseFailure {
  return { code: "unsupported", reason };
}

export function parsePm5NfcTarget(
  records: readonly NfcRecord[],
): Pm5NfcTarget | Pm5NfcParseFailure {
  const matches = records.filter(isPm5Record);
  if (matches.length === 0) return unsupported("no PM5 record");
  if (matches.length > 1) return unsupported("more than one PM5 record");
  const payload = matches[0]!.payload;
  if (payload.length !== PM5_NFC_PAYLOAD_BYTES) {
    return unsupported(
      `payload is ${payload.length} bytes, not ${PM5_NFC_PAYLOAD_BYTES}`,
    );
  }
  // Bytes 0-5 (address) and 6 (address type) are validated only
  // structurally, by the length check above; their values are ignored.
  const body = payload.slice(PM5_NFC_NAME_OFFSET);
  const end = body.indexOf(0x00);
  if (end === -1) return unsupported("name is not zero-terminated");
  if (end === 0) return unsupported("empty name");
  if (end > PM5_ADVERTISING_NAME_MAX_BYTES)
    return unsupported("name exceeds 31 bytes");
  for (let i = end + 1; i < body.length; i += 1) {
    if (body[i] !== 0x00)
      return unsupported("non-zero byte after the name terminator");
  }
  const nameBytes = body.slice(0, end);
  if (!nameBytes.every(isPrintableAscii))
    return unsupported("name is not printable ASCII");
  // Bytewise decode: no TextDecoder("ascii") (its label aliases
  // Windows-1252, which would accept bytes this rule rejects).
  const advertisingName = String.fromCharCode(...nameBytes);
  if (!isValidPm5AdvertisingName(advertisingName)) {
    return unsupported("name is not a PM5 advertising name");
  }
  return { advertisingName };
}
