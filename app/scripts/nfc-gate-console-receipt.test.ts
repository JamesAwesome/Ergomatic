import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractGateConsoleEvidence } from "./nfc-gate-console-receipt.js";

const sessionDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../docs/monitor/sessions/phase-nf-gate-minus-one",
);
const frames = (name: string): string[] =>
  JSON.parse(readFileSync(join(sessionDir, name), "utf-8")) as string[];
const decorate = (value: string) => `device stdout: ⚡️  [info] - ${value}`;

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
});
