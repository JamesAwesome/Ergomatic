import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitGateReceipt } from "../src/monitor/nfc/gateMinusOneReceipt.js";
import type { NfcGateReceiptV1 } from "../src/monitor/nfc/gateMinusOneReceipt.js";
import {
  assertInstalledAppMatches,
  prepareNormalTraceController,
  assertProcessIdentifierAbsent,
  findUniqueProcessIdentifier,
  runNormalTraceController,
  type ConsoleHandle,
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

function liveConsoleHandle(): ConsoleHandle {
  let running = true;
  let settle!: (code: number) => void;
  const exited = new Promise<number>((resolve) => {
    settle = resolve;
  });
  return {
    isRunning: () => running,
    wait: () => exited,
    stopHost: () => {
      running = false;
      settle(0);
    },
  };
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

  it("rejects cleanup while the original app remains or the process list shape is missing", () => {
    expect(() =>
      assertProcessIdentifierAbsent(
        {
          result: {
            runningProcesses: [
              {
                processIdentifier: 654,
                executable: "file:///pinned/App.app/App",
              },
            ],
          },
        },
        321,
        "file:///pinned/App.app/App",
      ),
    ).toThrow("remained after termination");
    expect(() =>
      assertProcessIdentifierAbsent(
        { result: [{ processIdentifier: 654 }] },
        321,
        "file:///pinned/App.app/App",
      ),
    ).toThrow("runningProcesses");
  });

  it("does not certify cleanup with an unreadable process executable", () => {
    expect(() =>
      assertProcessIdentifierAbsent(
        { result: { runningProcesses: [{ processIdentifier: 654 }] } },
        321,
        "file:///pinned/App.app/App",
      ),
    ).toThrow("runningProcesses");
  });

  it("records inconclusive when finishing before this capture launches", async () => {
    const captureDir = mkdtempSync(join(tmpdir(), "nfc-controller-test."));
    const installed = {
      bundleIdentifier: "haus.waffle.ergomatic",
      bundleVersion: "789",
      version: "0.23.0",
      url: "file:///pinned/App.app/",
    };
    const install = {
      result: {
        installedApplications: [
          { bundleID: "haus.waffle.ergomatic", installationURL: installed.url },
        ],
      },
    };
    writeFileSync(join(captureDir, "install.json"), JSON.stringify(install));
    writeFileSync(
      join(captureDir, "installed-apps.json"),
      JSON.stringify({ result: { apps: [installed] } }),
    );
    const abort = new AbortController();
    const result = await runNormalTraceController(captureDir, 1480000, {
      now: () => 1000000,
      signal: abort.signal,
      notify: () => undefined,
      sleepUntil: async () => undefined,
      launchConsole: async () => {
        throw new Error("Should not launch");
      },
      run: async (args) => {
        const path = args[args.indexOf("--json-output") + 1]!;
        if (args.includes("apps")) abort.abort();
        writeFileSync(
          path,
          JSON.stringify(
            args.includes("apps")
              ? { result: { apps: [installed] } }
              : args.includes("--start-stopped")
                ? { result: { process: { processIdentifier: 321 } } }
                : {
                    result: {
                      runningProcesses: [
                        {
                          processIdentifier: 999,
                          executable: "file:///other/App",
                        },
                      ],
                    },
                  },
          ),
        );
      },
    });
    expect(result).toMatchObject({
      cleanupVerified: true,
      decision: {
        outcome: "inconclusive",
        reasons: ["capture stopped before console launch"],
      },
    });
  });

  it("preserves earlier capture files before any device command", async () => {
    for (const name of ["normal-console.log", "evidence.json"]) {
      const captureDir = mkdtempSync(join(tmpdir(), "nfc-controller-test."));
      writeFileSync(join(captureDir, name), "earlier evidence");
      const deps = {
        now: () => 1000000,
        notify: () => undefined,
        sleepUntil: async () => undefined,
        run: async () => {
          throw new Error("Device must not run");
        },
        launchConsole: async () => liveConsoleHandle(),
      };
      await expect(
        runNormalTraceController(captureDir, 1480000, deps),
      ).rejects.toThrow("already contains capture evidence");
      expect(readFileSync(join(captureDir, name), "utf-8")).toBe(
        "earlier evidence",
      );
    }
  });

  it("prepares without asking for acknowledgement or starting capture", async () => {
    const captureDir = mkdtempSync(join(tmpdir(), "nfc-controller-test."));
    const commands: string[][] = [];
    const notices: string[] = [];
    const installed = {
      bundleIdentifier: "haus.waffle.ergomatic",
      bundleVersion: "789",
      version: "0.23.0",
      url: "file:///pinned/App.app/",
    };
    const install = {
      result: {
        installedApplications: [
          { bundleID: "haus.waffle.ergomatic", installationURL: installed.url },
        ],
      },
    };
    let now = 1000000;
    const result = await prepareNormalTraceController(captureDir, {
      now: () => now,
      notify: (message) => notices.push(message),
      sleepUntil: async () => {
        throw new Error("Preparation must not wait for people");
      },
      launchConsole: async () => {
        throw new Error("Preparation must not capture");
      },
      run: async (args) => {
        commands.push(args);
        const path = args[args.indexOf("--json-output") + 1]!;
        writeFileSync(
          path,
          JSON.stringify(
            args.includes("install")
              ? install
              : args.includes("apps")
                ? { result: { apps: [installed] } }
                : args.includes("--start-stopped")
                  ? { result: { process: { processIdentifier: 321 } } }
                  : {
                      result: {
                        runningProcesses: [
                          {
                            processIdentifier: 999,
                            executable: "file:///other/App",
                          },
                        ],
                      },
                    },
          ),
        );
        now += 1000;
      },
    });
    expect(result).toMatchObject({ ready: true, elapsedMs: 5000 });
    expect(commands[0]).toContain("install");
    expect(commands[1]).toContain("apps");
    expect(notices).toStrictEqual([]);
    expect(
      JSON.parse(readFileSync(join(captureDir, "preparation.json"), "utf-8")),
    ).toStrictEqual(result);
  });

  it("rejects installed identity or installation URL differing from the pinned install", () => {
    const installed = {
      bundleIdentifier: "haus.waffle.ergomatic",
      bundleVersion: "789",
      version: "0.23.0",
      url: "file:///pinned/App.app/",
    };
    const install = {
      result: {
        installedApplications: [
          { bundleID: "haus.waffle.ergomatic", installationURL: installed.url },
        ],
      },
    };
    expect(
      assertInstalledAppMatches(install, { result: { apps: [installed] } }),
    ).toStrictEqual(installed);
    for (const changed of [
      { ...installed, bundleIdentifier: "wrong" },
      { ...installed, bundleVersion: "788" },
      { ...installed, version: "0.22.0" },
      { ...installed, url: "file:///other/App.app/" },
    ]) {
      expect(() =>
        assertInstalledAppMatches(install, { result: { apps: [changed] } }),
      ).toThrow("Installed app did not match");
    }
  });

  it("captures without reinstall or scan prompts and permits finish-now with evidence classification", async () => {
    const captureDir = mkdtempSync(join(tmpdir(), "nfc-controller-test."));
    const installed = {
      bundleIdentifier: "haus.waffle.ergomatic",
      bundleVersion: "789",
      version: "0.23.0",
      url: "file:///pinned/App.app/",
    };
    writeFileSync(
      join(captureDir, "install.json"),
      JSON.stringify({
        result: {
          installedApplications: [
            {
              bundleID: "haus.waffle.ergomatic",
              installationURL: installed.url,
            },
          ],
        },
      }),
    );
    writeFileSync(
      join(captureDir, "installed-apps.json"),
      JSON.stringify({ result: { apps: [installed] } }),
    );
    const commands: string[][] = [];
    const notices: string[] = [];
    const abort = new AbortController();
    const handle = liveConsoleHandle();
    const result = await runNormalTraceController(captureDir, 1480000, {
      now: () => 1000000,
      signal: abort.signal,
      notify: (message) => notices.push(message),
      sleepUntil: () => {
        abort.abort();
        return new Promise(() => undefined);
      },
      run: async (args) => {
        commands.push(args);
        const path = args[args.indexOf("--json-output") + 1]!;
        writeFileSync(
          path,
          JSON.stringify(
            args.includes("apps")
              ? { result: { apps: [installed] } }
              : args.includes("--start-stopped")
                ? { result: { process: { processIdentifier: 321 } } }
                : {
                    result: {
                      runningProcesses: [
                        {
                          processIdentifier: 999,
                          executable: "file:///other/App",
                        },
                      ],
                    },
                  },
          ),
        );
      },
      launchConsole: async (_args, path) => {
        writeFileSync(path, positiveLog());
        return handle;
      },
    });
    expect(result).toMatchObject({
      cleanupVerified: true,
      decision: { outcome: "positive" },
    });
    expect(commands.filter((args) => args.includes("install"))).toHaveLength(0);
    expect(
      commands.filter((args) => args.includes("--start-stopped")),
    ).toHaveLength(1);
    expect(notices).toStrictEqual(["CAPTURE_ATTACHED"]);
    expect(handle.isRunning()).toBe(false);
    expect(
      JSON.parse(readFileSync(join(captureDir, "evidence.json"), "utf-8")),
    ).toStrictEqual(result);
  });

  it("refuses expired or over-budget capture deadlines before device commands", async () => {
    const run = async () => {
      throw new Error("Device must not run");
    };
    const deps = {
      now: () => 1000000,
      notify: () => undefined,
      sleepUntil: async () => undefined,
      run,
      launchConsole: async () => liveConsoleHandle(),
    };
    await expect(
      runNormalTraceController("/unused", 1030000, deps),
    ).rejects.toThrow("deadline");
    await expect(
      runNormalTraceController("/unused", 1480001, deps),
    ).rejects.toThrow("deadline");
  });
});
