import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { emitGateReceipt } from "../src/monitor/nfc/gateMinusOneReceipt.js";
import {
  classifyGateConsoleEvidence,
  extractGateConsoleEvidence,
} from "./nfc-gate-console-receipt.js";
import type { NfcGateReceiptV1 } from "../src/monitor/nfc/gateMinusOneReceipt.js";

const sessionDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../docs/monitor/sessions/phase-nf-gate-minus-one",
);
const frames = (name: string): string[] =>
  JSON.parse(readFileSync(join(sessionDir, name), "utf-8")) as string[];
const decorate = (value: string) => `device stdout: ⚡️  [info] - ${value}`;
const execFileAsync = promisify(execFile);
const diagnostic = (event: string, generation = 1) =>
  decorate(
    `NFC_GATE_DIAGNOSTIC ${JSON.stringify({ event, generation, processUptimeMs: 42 })}`,
  );
const positiveDiagnostics = [
  diagnostic("ndef.begin.initiated"),
  diagnostic("ndef.begin.returned"),
  diagnostic("ndef.rf.active"),
];
const repairedReceipt = (): NfcGateReceiptV1 =>
  JSON.parse(
    readFileSync(join(sessionDir, "repaired-normal-receipt.json"), "utf-8"),
  ) as NfcGateReceiptV1;

describe("NFC Gate -1 controller receipt extraction", () => {
  it("selects the newest complete export from decorated console lines and retains diagnostics", () => {
    const older = frames("pre-repair.frames.json");
    const newer = frames("repaired-normal.frames.json");
    const diagnostic =
      'NFC_GATE_DIAGNOSTIC {"event":"ndef.rf.active","generation":1,"processUptimeMs":42}';
    const raw = [
      "unrelated devicectl output",
      decorate(diagnostic),
      ...older.map(decorate),
      ...newer.map(decorate),
    ].join("\n");

    const evidence = extractGateConsoleEvidence(raw);

    expect(evidence.diagnostics).toStrictEqual([diagnostic]);
    expect(evidence.frames).toStrictEqual(newer);
    expect(evidence.receipt.capturedAtUtc).toBe("2026-09-04T16:14:33.366Z");
    expect(evidence.receipt.attempts).toHaveLength(1);
  });

  it("rejects a truncated newest export instead of falling back to an older complete one", () => {
    const older = frames("pre-repair.frames.json");
    const truncatedNewest = frames("repaired-normal.frames.json").slice(0, -1);
    const raw = [...older, ...truncatedNewest].map(decorate).join("\n");

    expect(() => extractGateConsoleEvidence(raw)).toThrow(
      "Newest receipt export is incomplete or invalid",
    );
  });

  it("classifies a positive trace through the production logger boundary", () => {
    const emitted: string[] = [];
    emitGateReceipt(repairedReceipt(), (line) => emitted.push(decorate(line)));

    expect(
      classifyGateConsoleEvidence(
        [...positiveDiagnostics, ...emitted].join("\n"),
      ),
    ).toMatchObject({ outcome: "positive", reasons: [] });
  });

  it("prints the classified decision through the real CLI file boundary", async () => {
    const emitted: string[] = [];
    emitGateReceipt(repairedReceipt(), (line) => emitted.push(decorate(line)));
    const input = join(
      mkdtempSync(join(tmpdir(), "nfc-classifier-test.")),
      "raw.log",
    );
    writeFileSync(input, [...positiveDiagnostics, ...emitted].join("\n"));

    const { stdout } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "scripts/nfc-gate-console-receipt.ts", input],
      { cwd: join(sessionDir, "../../../../app") },
    );

    expect(JSON.parse(stdout)).toMatchObject({
      outcome: "positive",
      reasons: [],
    });
  });

  it("classifies an RF-active exact-target rejection as negative", () => {
    const receipt = repairedReceipt();
    receipt.attempts[0]!.liveLocalName = "PM5 000000000 Row";
    receipt.criteria.exactLocalNameBridge = false;
    receipt.criteria.pickerFreeBleConnect = false;
    const emitted: string[] = [];
    emitGateReceipt(receipt, (line) => emitted.push(decorate(line)));

    expect(
      classifyGateConsoleEvidence(
        [...positiveDiagnostics, ...emitted].join("\n"),
      ),
    ).toMatchObject({
      outcome: "negative",
      reasons: expect.arrayContaining(["live PM5 name did not match"]),
    });
  });

  it.each([
    ["missing diagnostics", []],
    ["malformed diagnostics", [decorate("NFC_GATE_DIAGNOSTIC not-json")]],
    [
      "wrong generation",
      [
        diagnostic("ndef.begin.initiated", 2),
        diagnostic("ndef.begin.returned", 2),
        diagnostic("ndef.rf.active", 2),
      ],
    ],
    [
      "wrong event order",
      [
        diagnostic("ndef.begin.returned"),
        diagnostic("ndef.begin.initiated"),
        diagnostic("ndef.rf.active"),
      ],
    ],
  ])("classifies %s as inconclusive", (_name, diagnostics) => {
    const emitted: string[] = [];
    emitGateReceipt(repairedReceipt(), (line) => emitted.push(decorate(line)));

    expect(
      classifyGateConsoleEvidence([...diagnostics, ...emitted].join("\n")),
    ).toMatchObject({ outcome: "inconclusive" });
  });
});
