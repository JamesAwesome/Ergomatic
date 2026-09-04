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
      extractGateConsoleEvidence(readFileSync(input, "utf-8")),
      null,
      2,
    ),
  );
}
