// Phase NF (design spec 2026-09-03 §2): the runtime boundary between the
// Capacitor NFC plugin and the domain parser. A plugin event enters as
// `unknown` — a TypeScript declaration is not runtime validation — and
// leaves as validated integer arrays, or as a named rejection. The domain
// parser (`domain/monitor/nfc.ts`) then never sees a shape it did not ask
// for.
//
// Rejections are distinguished because the reader gives each a different
// terminal; see `DecodedNfcEvent` below.

import type { NfcRecord } from "../../../domain/monitor/nfc.js";
import type { ConnectionAttemptId } from "../../../domain/monitor/types.js";

// Three rejections, because the reader needs three different terminals:
// `stale-id` is a retained event for another attempt (dropped, keep
// waiting); `invalid` cannot be attributed at all (dropped, keep waiting);
// `invalid-for-attempt` carries THIS attempt's ID and is still malformed —
// a real producer exists (the plugin publishes a tag event with no
// `ndefMessage` when `readNDEF` fails on a read-write tag, and does not
// invalidate), so the reader must settle on it or wait forever
// (antagonist delta pass, 2026-09-06, F3).
export type DecodedNfcEvent =
  | { attemptId: ConnectionAttemptId; records: readonly NfcRecord[] }
  | { error: "stale-id" | "invalid" | "invalid-for-attempt" };

function byteArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "number" || !Number.isInteger(item)) return null;
    if (item < 0 || item > 255) return null;
    out.push(item);
  }
  return out;
}

export function decodeNfcEvent(
  value: unknown,
  expectedAttemptId: ConnectionAttemptId,
): DecodedNfcEvent {
  if (typeof value !== "object" || value === null) return { error: "invalid" };
  const event = value as { attemptId?: unknown; tag?: unknown };
  if (typeof event.attemptId !== "string" || event.attemptId.length === 0) {
    return { error: "invalid" };
  }
  if (event.attemptId !== expectedAttemptId) return { error: "stale-id" };
  const mine = { error: "invalid-for-attempt" as const };
  if (typeof event.tag !== "object" || event.tag === null) return mine;
  const message = (event.tag as { ndefMessage?: unknown }).ndefMessage;
  if (!Array.isArray(message)) return mine;
  const records: NfcRecord[] = [];
  for (const raw of message as unknown[]) {
    if (typeof raw !== "object" || raw === null) return mine;
    const record = raw as { tnf?: unknown; type?: unknown; payload?: unknown };
    if (
      typeof record.tnf !== "number" ||
      !Number.isInteger(record.tnf) ||
      record.tnf < 0 ||
      record.tnf > 7
    ) {
      return mine;
    }
    const type = byteArray(record.type);
    const payload = byteArray(record.payload);
    if (type === null || payload === null) return mine;
    records.push({ tnf: record.tnf, type, payload });
  }
  return { attemptId: event.attemptId, records };
}
