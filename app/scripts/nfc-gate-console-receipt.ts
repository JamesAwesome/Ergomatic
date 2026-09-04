import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  reassembleGateReceiptFrames,
  serializeGateReceipt,
} from "../src/monitor/nfc/gateMinusOneReceipt.js";
import type { NfcGateReceiptV1 } from "../src/monitor/nfc/gateMinusOneReceipt.js";

export interface GateConsoleEvidence {
  diagnostics: string[];
  exportId: string;
  frames: string[];
  receipt: NfcGateReceiptV1;
}

export interface GateConsoleDecision {
  outcome: "positive" | "negative" | "inconclusive";
  reasons: string[];
  evidence?: GateConsoleEvidence;
}

const EXPECTED_PM5_NAME = "PM5 432331249 Row";
const EXPECTED_RECORDS = [
  {
    tnf: 4,
    type: [
      99, 111, 110, 99, 101, 112, 116, 50, 46, 99, 111, 109, 58, 98, 108, 101,
      99, 111, 110, 110, 101, 99, 116, 105, 110, 102, 111,
    ],
    id: [],
    payload: [
      0, 0, 0, 0, 0, 0, 1, 80, 77, 53, 32, 52, 51, 50, 51, 51, 49, 50, 52, 57,
      32, 82, 111, 119, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  {
    tnf: 4,
    type: [
      97, 110, 100, 114, 111, 105, 100, 46, 99, 111, 109, 58, 112, 107, 103,
    ],
    id: [],
    payload: [
      99, 111, 109, 46, 99, 111, 110, 99, 101, 112, 116, 50, 46, 101, 114, 103,
      100, 97, 116, 97,
    ],
  },
  {
    tnf: 1,
    type: [85],
    id: [],
    payload: [
      0, 104, 116, 116, 112, 115, 58, 47, 47, 119, 119, 119, 46, 99, 111, 110,
      99, 101, 112, 116, 50, 46, 99, 111, 109,
    ],
  },
] as const;

interface DiagnosticEvent {
  event: string;
  generation: number;
  processUptimeMs: number;
}

function parseDiagnostics(lines: readonly string[]): DiagnosticEvent[] | null {
  const parsed: DiagnosticEvent[] = [];
  for (const line of lines) {
    try {
      const value = JSON.parse(
        line.slice("NFC_GATE_DIAGNOSTIC ".length),
      ) as Record<string, unknown>;
      if (
        typeof value !== "object" ||
        value === null ||
        typeof value.event !== "string" ||
        !Number.isSafeInteger(value.generation) ||
        (value.generation as number) < 1 ||
        !Number.isSafeInteger(value.processUptimeMs) ||
        (value.processUptimeMs as number) < 0
      )
        return null;
      parsed.push({
        event: value.event,
        generation: value.generation as number,
        processUptimeMs: value.processUptimeMs as number,
      });
    } catch {
      return null;
    }
  }
  return parsed;
}

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/** Selects the newest started export and fails closed when that export is bad. */
export function extractGateConsoleEvidence(raw: string): GateConsoleEvidence {
  const diagnostics: string[] = [];
  const envelopes = new Map<string, { frames: string[]; startedAt: number }>();
  for (const [lineIndex, line] of raw.split(/\r?\n/).entries()) {
    const diagnosticAt = line.indexOf("NFC_GATE_DIAGNOSTIC ");
    if (diagnosticAt >= 0) diagnostics.push(line.slice(diagnosticAt).trim());

    const receiptAt = line.indexOf("NFC_GATE_RECEIPT ");
    if (receiptAt < 0) continue;
    const frame = line.slice(receiptAt).trim();
    const identity = /^NFC_GATE_RECEIPT v1 ([a-z0-9.-]+) /.exec(frame);
    if (!identity) throw new Error("Invalid receipt marker line");
    const envelope = envelopes.get(identity[1]!) ?? {
      frames: [],
      startedAt: lineIndex,
    };
    envelope.frames.push(frame);
    envelopes.set(identity[1]!, envelope);
  }
  const newest = Array.from(envelopes.entries()).sort(
    ([, left], [, right]) => right.startedAt - left.startedAt,
  )[0];
  if (!newest) throw new Error("No receipt export found");

  try {
    const serialized = reassembleGateReceiptFrames(newest[1].frames);
    const receipt = JSON.parse(serialized) as NfcGateReceiptV1;
    if (serializeGateReceipt(receipt) !== serialized)
      throw new Error("Noncanonical receipt export");
    return {
      diagnostics,
      exportId: newest[0],
      frames: newest[1].frames,
      receipt,
    };
  } catch {
    throw new Error("Newest receipt export is incomplete or invalid");
  }
}

/** Applies the one-attempt normal-trace decision table to a frozen raw log. */
export function classifyGateConsoleEvidence(raw: string): GateConsoleDecision {
  let evidence: GateConsoleEvidence;
  try {
    evidence = extractGateConsoleEvidence(raw);
  } catch (error) {
    return {
      outcome: "inconclusive",
      reasons: [error instanceof Error ? error.message : "Invalid evidence"],
    };
  }

  const diagnostics = parseDiagnostics(evidence.diagnostics);
  if (diagnostics === null || diagnostics.length === 0)
    return {
      outcome: "inconclusive",
      reasons: ["native diagnostics were missing or malformed"],
      evidence,
    };
  if (diagnostics.some(({ generation }) => generation !== 1))
    return {
      outcome: "inconclusive",
      reasons: ["native diagnostics did not contain only generation 1"],
      evidence,
    };

  const requiredEvents = [
    "ndef.begin.initiated",
    "ndef.begin.returned",
    "ndef.rf.active",
  ] as const;
  const positions = requiredEvents.map((event) =>
    diagnostics.findIndex((entry) => entry.event === event),
  );
  if (
    positions.some((position) => position < 0) ||
    !(positions[0]! < positions[1]! && positions[1]! < positions[2]!) ||
    requiredEvents.some(
      (event) =>
        diagnostics.filter((entry) => entry.event === event).length !== 1,
    )
  )
    return {
      outcome: "inconclusive",
      reasons: [
        "required native diagnostic events were absent, duplicated, or unordered",
      ],
      evidence,
    };

  if (
    evidence.receipt.attempts.length !== 1 ||
    evidence.receipt.attempts[0]?.scenario !== "normal"
  )
    return {
      outcome: "inconclusive",
      reasons: ["receipt did not contain exactly one normal attempt"],
      evidence,
    };

  const attempt = evidence.receipt.attempts[0];
  const reasons: string[] = [];
  if (evidence.receipt.pm5.advertisedNameShown !== EXPECTED_PM5_NAME)
    reasons.push("expected PM5 metadata did not match");
  if (!sameJson(attempt.records, EXPECTED_RECORDS))
    reasons.push("PM5 NDEF records did not match");
  if (attempt.decodedName !== EXPECTED_PM5_NAME)
    reasons.push("decoded PM5 name did not match");
  if (attempt.liveLocalName !== EXPECTED_PM5_NAME)
    reasons.push("live PM5 name did not match");
  if (!sameJson(attempt.trailingPayloadBytes, Array(16).fill(0)))
    reasons.push("PM5 payload padding did not match");
  if (attempt.matchingDeviceCount !== 1)
    reasons.push("matching BLE device count was not one");
  if (!attempt.connected)
    reasons.push("targeted BLE connection did not complete");
  if (!attempt.disconnected)
    reasons.push("targeted BLE disconnection did not complete");
  if (!evidence.receipt.criteria.pickerFreeBleConnect)
    reasons.push("picker-free BLE connection was not recorded");

  return {
    outcome: reasons.length === 0 ? "positive" : "negative",
    reasons,
    evidence,
  };
}

const processArgv = (globalThis as unknown as { process: { argv: string[] } })
  .process.argv;
const invokedPath = processArgv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const input = processArgv[2];
  if (!input) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/nfc-gate-console-receipt.ts <console-log>",
    );
  }
  console.log(
    JSON.stringify(
      classifyGateConsoleEvidence(readFileSync(input, "utf-8")),
      null,
      2,
    ),
  );
}
