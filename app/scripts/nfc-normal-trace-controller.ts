import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import {
  classifyGateConsoleEvidence,
  type GateConsoleDecision,
} from "./nfc-gate-console-receipt.js";

const DEVICE = "Kaito";
const BUNDLE = "haus.waffle.ergomatic";
const ARTIFACT =
  "/tmp/ergomatic-phase-nf-ready.WQJqQu/Build/Products/Debug-iphoneos/App.app";
const HARD_BUDGET_MS = 8 * 60 * 1_000;
const CLEANUP_RESERVE_MS = 45 * 1_000;

export interface ConsoleHandle {
  wait: () => Promise<number>;
  stopHost: () => void;
}

export interface NormalTraceDependencies {
  now: () => number;
  acknowledge: (
    prompt: string,
    expected: "READY" | "PM5" | "VISIBLE",
    deadlineMs: number,
  ) => Promise<string>;
  notify: (message: string) => void;
  sleepUntil: (deadlineMs: number) => Promise<void>;
  run: (args: string[]) => Promise<void>;
  launchConsole: (args: string[], logPath: string) => Promise<ConsoleHandle>;
}

export interface NormalTraceResult {
  cleanupVerified: boolean;
  decision: GateConsoleDecision;
}

function collectProcessIdentifiers(value: unknown, found: Set<number>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectProcessIdentifiers(entry, found);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      key === "processIdentifier" &&
      typeof entry === "number" &&
      Number.isSafeInteger(entry) &&
      entry > 0
    )
      found.add(entry);
    else collectProcessIdentifiers(entry, found);
  }
}

export function findUniqueProcessIdentifier(value: unknown): number {
  const found = new Set<number>();
  collectProcessIdentifiers(value, found);
  if (found.size !== 1)
    throw new Error(
      "Launch result did not contain exactly one process identifier",
    );
  return [...found][0]!;
}

function boundedTimeoutSeconds(
  nowMs: number,
  deadlineMs: number,
  capSeconds: number,
): number {
  const remaining = Math.floor((deadlineMs - nowMs) / 1_000);
  const timeout = Math.min(remaining, capSeconds);
  if (timeout < 1) throw new Error("Controller deadline exhausted");
  return timeout;
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function containsProcessIdentifier(value: unknown, pid: number): boolean {
  const found = new Set<number>();
  collectProcessIdentifiers(value, found);
  return found.has(pid);
}

async function replaceAndTerminateBundle(
  prefix: string,
  captureDir: string,
  deadlineMs: number,
  deps: NormalTraceDependencies,
): Promise<void> {
  const launchJson = join(captureDir, `${prefix}-replacement-launch.json`);
  const launchLog = join(captureDir, `${prefix}-replacement-launch.log`);
  const launchTimeout = boundedTimeoutSeconds(deps.now(), deadlineMs, 15);
  await deps.run([
    "devicectl",
    "device",
    "process",
    "launch",
    "--device",
    DEVICE,
    "--terminate-existing",
    "--start-stopped",
    "--timeout",
    String(launchTimeout),
    "--json-output",
    launchJson,
    "--log-output",
    launchLog,
    BUNDLE,
  ]);
  const replacementPid = findUniqueProcessIdentifier(json(launchJson));

  const terminateJson = join(captureDir, `${prefix}-terminate.json`);
  const terminateLog = join(captureDir, `${prefix}-terminate.log`);
  const terminateTimeout = boundedTimeoutSeconds(deps.now(), deadlineMs, 10);
  await deps.run([
    "devicectl",
    "device",
    "process",
    "terminate",
    "--device",
    DEVICE,
    "--pid",
    String(replacementPid),
    "--kill",
    "--timeout",
    String(terminateTimeout),
    "--json-output",
    terminateJson,
    "--log-output",
    terminateLog,
  ]);

  const processesJson = join(captureDir, `${prefix}-processes.json`);
  const processesLog = join(captureDir, `${prefix}-processes.log`);
  const processesTimeout = boundedTimeoutSeconds(deps.now(), deadlineMs, 8);
  await deps.run([
    "devicectl",
    "device",
    "info",
    "processes",
    "--device",
    DEVICE,
    "--timeout",
    String(processesTimeout),
    "--json-output",
    processesJson,
    "--log-output",
    processesLog,
  ]);
  if (containsProcessIdentifier(json(processesJson), replacementPid))
    throw new Error("Replacement app process remained after termination");
}

function atomicDecision(path: string, decision: GateConsoleDecision): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(decision, null, 2)}\n`, {
    flag: "wx",
  });
  renameSync(temporary, path);
}

export async function runNormalTraceController(
  captureDir: string,
  deps: NormalTraceDependencies,
): Promise<NormalTraceResult> {
  const startedMs = deps.now();
  const hardDeadlineMs = startedMs + HARD_BUDGET_MS;
  const cleanupDeadlineMs = hardDeadlineMs - CLEANUP_RESERVE_MS;

  await deps.acknowledge(
    "Connect the iPhone by USB and unlock it, then reply READY.",
    "READY",
    startedMs + 45_000,
  );
  try {
    const installTimeout = boundedTimeoutSeconds(
      deps.now(),
      cleanupDeadlineMs,
      60,
    );
    await deps.run([
      "devicectl",
      "device",
      "install",
      "app",
      "--device",
      DEVICE,
      "--timeout",
      String(installTimeout),
      "--json-output",
      join(captureDir, "install.json"),
      "--log-output",
      join(captureDir, "install.log"),
      ARTIFACT,
    ]);

    // A bundle-scoped suspended replacement proves the exact cleanup mechanism
    // before James is asked to touch the PM5 or start NFC.
    await replaceAndTerminateBundle(
      "cleanup-rehearsal",
      captureDir,
      cleanupDeadlineMs,
      deps,
    );
  } catch (error) {
    let cleanupVerified = false;
    try {
      await replaceAndTerminateBundle(
        "prelaunch-abort-cleanup",
        captureDir,
        hardDeadlineMs,
        deps,
      );
      cleanupVerified = true;
    } catch {
      deps.notify(
        "Press the iPhone side button once to lock it; no reply needed.",
      );
    }
    const decision: GateConsoleDecision = {
      outcome: "inconclusive",
      reasons: [
        error instanceof Error ? error.message : "controller prelaunch failed",
      ],
    };
    atomicDecision(join(captureDir, "evidence.json"), decision);
    return { cleanupVerified, decision };
  }

  const consoleLog = join(captureDir, "normal-console.log");
  const consoleTimeout = boundedTimeoutSeconds(
    deps.now(),
    cleanupDeadlineMs,
    6 * 60,
  );
  let consoleHandle: ConsoleHandle;
  try {
    consoleHandle = await deps.launchConsole(
      [
        "devicectl",
        "device",
        "process",
        "launch",
        "--device",
        DEVICE,
        "--terminate-existing",
        "--console",
        "--timeout",
        String(consoleTimeout),
        "--json-output",
        join(captureDir, "normal-launch.json"),
        BUNDLE,
      ],
      consoleLog,
    );
  } catch (error) {
    let cleanupVerified = false;
    try {
      await replaceAndTerminateBundle(
        "console-launch-abort-cleanup",
        captureDir,
        hardDeadlineMs,
        deps,
      );
      cleanupVerified = true;
    } catch {
      deps.notify(
        "Press the iPhone side button once to lock it; no reply needed.",
      );
    }
    const decision: GateConsoleDecision = {
      outcome: "inconclusive",
      reasons: [
        error instanceof Error ? error.message : "console launch failed",
      ],
    };
    atomicDecision(join(captureDir, "evidence.json"), decision);
    return { cleanupVerified, decision };
  }

  let runError: unknown = null;
  try {
    await deps.acknowledge(
      "Wake the PM5, open More Options > Connect Device, leave it on Ready for App Connection, then reply PM5.",
      "PM5",
      startedMs + 3 * 60_000,
    );
    await deps.acknowledge(
      "On the iPhone, tap YOU and scroll to NFC GATE -1 PROBE, then reply VISIBLE.",
      "VISIBLE",
      startedMs + 3.5 * 60_000,
    );
    deps.notify(
      "No heart-rate gear or rowing is needed. Tap Run normal sample, then hold the phone at the same PM5 NFC spot that worked earlier. Do nothing else; I am collecting the result.",
    );

    await deps.sleepUntil(cleanupDeadlineMs);
  } catch (error) {
    runError = error;
  }

  let cleanupVerified = false;
  try {
    await replaceAndTerminateBundle(
      "normal-cleanup",
      captureDir,
      hardDeadlineMs,
      deps,
    );
    cleanupVerified = true;
  } catch {
    deps.notify(
      "Press the iPhone side button once to lock it; no reply needed.",
    );
  } finally {
    consoleHandle.stopHost();
    try {
      await consoleHandle.wait();
    } catch (error) {
      runError ??= error;
    }
  }

  let decision: GateConsoleDecision;
  if (runError !== null) {
    decision = {
      outcome: "inconclusive",
      reasons: [
        runError instanceof Error ? runError.message : "controller run aborted",
      ],
    };
  } else if (!cleanupVerified) {
    decision = {
      outcome: "inconclusive",
      reasons: ["bundle-scoped cleanup could not be verified"],
    };
  } else if (!existsSync(consoleLog)) {
    decision = {
      outcome: "inconclusive",
      reasons: ["console log was not captured"],
    };
  } else {
    decision = classifyGateConsoleEvidence(readFileSync(consoleLog, "utf-8"));
  }
  atomicDecision(join(captureDir, "evidence.json"), decision);
  return { cleanupVerified, decision };
}

function runXcrun(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("xcrun", args, { stdio: "ignore" });
    const timeoutAt = args.indexOf("--timeout");
    const timeoutSeconds = Number(args[timeoutAt + 1]);
    const guard = setTimeout(
      () => child.kill("SIGKILL"),
      (Number.isFinite(timeoutSeconds) ? timeoutSeconds : 1) * 1_000 + 2_000,
    );
    child.once("error", (error) => {
      clearTimeout(guard);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(guard);
      if (code === 0) resolve();
      else reject(new Error(`xcrun exited ${String(code)}`));
    });
  });
}

function launchXcrunConsole(
  args: string[],
  logPath: string,
): Promise<ConsoleHandle> {
  const descriptor = openSync(logPath, "wx");
  const child = spawn("xcrun", args, {
    stdio: ["ignore", descriptor, descriptor],
  });
  closeSync(descriptor);
  const timeoutAt = args.indexOf("--timeout");
  const timeoutSeconds = Number(args[timeoutAt + 1]);
  const guard = setTimeout(
    () => child.kill("SIGKILL"),
    (Number.isFinite(timeoutSeconds) ? timeoutSeconds : 1) * 1_000 + 2_000,
  );
  const settled = new Promise<number>((resolve, reject) => {
    child.once("error", (error) => {
      clearTimeout(guard);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(guard);
      resolve(code ?? 1);
    });
  });
  return Promise.resolve({
    wait: () => settled,
    stopHost: () => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    },
  });
}

function acknowledgeFromStdin(
  prompt: string,
  expected: "READY" | "PM5" | "VISIBLE",
  deadlineMs: number,
): Promise<string> {
  console.log(`OPERATOR: ${prompt}`);
  return new Promise((resolve, reject) => {
    const input = createInterface({ input: process.stdin, terminal: true });
    const timeout = setTimeout(
      () => {
        input.close();
        reject(new Error(`Timed out waiting for ${expected}`));
      },
      Math.max(0, deadlineMs - Date.now()),
    );
    input.once("line", (line) => {
      clearTimeout(timeout);
      input.close();
      if (line.trim() !== expected) reject(new Error(`Expected ${expected}`));
      else resolve(expected);
    });
  });
}

const processArgv = (globalThis as unknown as { process: { argv: string[] } })
  .process.argv;
const invokedPath = processArgv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const [mode, captureDir] = processArgv.slice(2);
  if (mode !== "run" || !captureDir)
    throw new Error(
      "Usage: pnpm exec tsx scripts/nfc-normal-trace-controller.ts run <capture-dir>",
    );
  const result = await runNormalTraceController(captureDir, {
    now: Date.now,
    acknowledge: acknowledgeFromStdin,
    notify: (message) => console.log(`OPERATOR: ${message}`),
    sleepUntil: async (deadlineMs) => {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, deadlineMs - Date.now())),
      );
    },
    run: runXcrun,
    launchConsole: launchXcrunConsole,
  });
  console.log(`OUTCOME: ${result.decision.outcome}`);
}
