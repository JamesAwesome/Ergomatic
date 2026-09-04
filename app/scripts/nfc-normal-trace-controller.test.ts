import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitGateReceipt } from "../src/monitor/nfc/gateMinusOneReceipt.js";
import type { NfcGateReceiptV1 } from "../src/monitor/nfc/gateMinusOneReceipt.js";
import {
  assertProcessIdentifierAbsent,
  findUniqueProcessIdentifier,
  runNormalTraceController,
} from "./nfc-normal-trace-controller.js";

const sessionDir = join(
  import.meta.dirname,
  "../../docs/monitor/sessions/phase-nf-gate-minus-one",
);

function positiveLog(): string {
  const receipt = JSON.parse(
    readFileSync(join(sessionDir, "repaired-normal-receipt.json"), "utf-8"),
  ) as NfcGateReceiptV1;
  const lines = [
    "ndef.begin.initiated",
    "ndef.begin.returned",
    "ndef.rf.active",
  ].map(
    (event) =>
      `device stdout: NFC_GATE_DIAGNOSTIC ${JSON.stringify({ event, generation: 1, processUptimeMs: 42 })}`,
  );
  emitGateReceipt(receipt, (line) => lines.push(`device stdout: ${line}`));
  return lines.join("\n");
}

describe("NFC normal-trace controller", () => {
  it("binds a unique launch-result PID and rejects ambiguous results", () => {
    expect(
      findUniqueProcessIdentifier({
        result: { process: { processIdentifier: 321 } },
      }),
    ).toBe(321);
    expect(() =>
      findUniqueProcessIdentifier({
        one: { processIdentifier: 321 },
        two: { processIdentifier: 654 },
      }),
    ).toThrow("exactly one process identifier");
    expect(() => assertProcessIdentifierAbsent({ result: [] }, 321)).toThrow(
      "did not expose process identifiers",
    );
    expect(() =>
      assertProcessIdentifierAbsent(
        { result: [{ processIdentifier: 999 }] },
        321,
      ),
    ).not.toThrow();
  });

  it("runs one shell-independent command path, freezes after cleanup, and classifies atomically", async () => {
    const captureDir = mkdtempSync(join(tmpdir(), "nfc-controller-test."));
    const commands: string[][] = [];
    const prompts: string[] = [];
    const notices: string[] = [];
    let consoleArgs: string[] = [];
    let nowMs = 1_000_000;
    let replacement = 0;
    const result = await runNormalTraceController(captureDir, {
      now: () => nowMs,
      acknowledge: async (prompt, expected) => {
        prompts.push(prompt);
        return expected;
      },
      notify: (message) => notices.push(message),
      sleepUntil: async (deadlineMs) => {
        nowMs = deadlineMs;
      },
      run: async (args) => {
        commands.push(args);
        const jsonAt = args.indexOf("--json-output");
        const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
        if (args.includes("--start-stopped")) {
          replacement += 1;
          writeFileSync(
            jsonPath!,
            JSON.stringify({
              result: { process: { processIdentifier: 100 + replacement } },
            }),
          );
        } else if (args.includes("processes")) {
          writeFileSync(
            jsonPath!,
            JSON.stringify({ result: [{ processIdentifier: 999 }] }),
          );
        } else if (jsonPath) writeFileSync(jsonPath, JSON.stringify({}));
      },
      launchConsole: async (args, logPath) => {
        consoleArgs = args;
        writeFileSync(logPath, positiveLog());
        return { wait: async () => 0, stopHost: () => undefined };
      },
    });

    expect(result.decision.outcome).toBe("positive");
    expect(prompts).toHaveLength(3);
    expect(
      notices.some((message) => message.includes("Run normal sample")),
    ).toBe(true);
    expect(
      consoleArgs.slice(consoleArgs.indexOf("--timeout"), -1),
    ).toStrictEqual([
      "--timeout",
      "480",
      "--json-output",
      join(captureDir, "normal-launch.json"),
    ]);
    expect(
      commands.filter((args) => args.includes("--start-stopped")),
    ).toHaveLength(2);
    expect(
      commands
        .filter((args) => args.includes("--start-stopped"))
        .every(
          (args) =>
            args.includes("--terminate-existing") &&
            args.includes("haus.waffle.ergomatic"),
        ),
    ).toBe(true);
    expect(
      JSON.parse(readFileSync(join(captureDir, "evidence.json"), "utf-8")),
    ).toMatchObject({ outcome: "positive" });
  });

  it("fails closed and asks only for containment when bundle cleanup cannot be verified", async () => {
    const captureDir = mkdtempSync(join(tmpdir(), "nfc-controller-test."));
    const prompts: string[] = [];
    const notices: string[] = [];
    let nowMs = 1_000_000;
    let launches = 0;
    const result = await runNormalTraceController(captureDir, {
      now: () => nowMs,
      acknowledge: async (prompt, expected) => {
        prompts.push(prompt);
        return expected;
      },
      notify: (message) => notices.push(message),
      sleepUntil: async (deadlineMs) => {
        nowMs = deadlineMs;
      },
      run: async (args) => {
        const jsonAt = args.indexOf("--json-output");
        const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
        if (args.includes("--start-stopped")) {
          launches += 1;
          if (launches === 2) throw new Error("replacement failed");
          writeFileSync(
            jsonPath!,
            JSON.stringify({ result: { processIdentifier: 101 } }),
          );
        } else if (args.includes("processes")) {
          writeFileSync(
            jsonPath!,
            JSON.stringify({ result: [{ processIdentifier: 999 }] }),
          );
        } else if (jsonPath) writeFileSync(jsonPath, JSON.stringify({}));
      },
      launchConsole: async (_args, logPath) => {
        writeFileSync(logPath, positiveLog());
        return { wait: async () => 0, stopHost: () => undefined };
      },
    });

    expect(result.cleanupVerified).toBe(false);
    expect(result.decision).toMatchObject({ outcome: "inconclusive" });
    expect(notices.at(-1)).toContain("side button");
  });

  it("routes a post-launch operator abort through immediate bundle cleanup", async () => {
    const captureDir = mkdtempSync(join(tmpdir(), "nfc-controller-test."));
    const commands: string[][] = [];
    let nowMs = 1_000_000;
    let replacement = 0;
    const result = await runNormalTraceController(captureDir, {
      now: () => nowMs,
      acknowledge: async (_prompt, expected) => {
        if (expected === "VISIBLE") throw new Error("unexpected screen");
        return expected;
      },
      notify: () => undefined,
      sleepUntil: async (deadlineMs) => {
        nowMs = deadlineMs;
      },
      run: async (args) => {
        commands.push(args);
        const jsonAt = args.indexOf("--json-output");
        const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
        if (args.includes("--start-stopped")) {
          replacement += 1;
          writeFileSync(
            jsonPath!,
            JSON.stringify({
              result: { processIdentifier: 100 + replacement },
            }),
          );
        } else if (args.includes("processes")) {
          writeFileSync(
            jsonPath!,
            JSON.stringify({ result: [{ processIdentifier: 999 }] }),
          );
        } else if (jsonPath) writeFileSync(jsonPath, JSON.stringify({}));
      },
      launchConsole: async (_args, logPath) => {
        writeFileSync(logPath, positiveLog());
        return { wait: async () => 0, stopHost: () => undefined };
      },
    });

    expect(result).toMatchObject({
      cleanupVerified: true,
      decision: { outcome: "inconclusive" },
    });
    expect(
      commands.filter((args) => args.includes("--start-stopped")),
    ).toHaveLength(2);
  });

  it("routes a console-launch failure through bundle cleanup", async () => {
    const captureDir = mkdtempSync(join(tmpdir(), "nfc-controller-test."));
    let replacement = 0;
    const result = await runNormalTraceController(captureDir, {
      now: () => 1_000_000,
      acknowledge: async (_prompt, expected) => expected,
      notify: () => undefined,
      sleepUntil: async () => undefined,
      run: async (args) => {
        const jsonAt = args.indexOf("--json-output");
        const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
        if (args.includes("--start-stopped")) {
          replacement += 1;
          writeFileSync(
            jsonPath!,
            JSON.stringify({
              result: { processIdentifier: 100 + replacement },
            }),
          );
        } else if (args.includes("processes")) {
          writeFileSync(
            jsonPath!,
            JSON.stringify({ result: [{ processIdentifier: 999 }] }),
          );
        } else if (jsonPath) writeFileSync(jsonPath, JSON.stringify({}));
      },
      launchConsole: async () => {
        throw new Error("console attach failed");
      },
    });

    expect(result).toMatchObject({
      cleanupVerified: true,
      decision: {
        outcome: "inconclusive",
        reasons: ["console attach failed"],
      },
    });
    expect(replacement).toBe(2);
  });
});
