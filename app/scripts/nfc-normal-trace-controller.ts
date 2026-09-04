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
  isRunning: () => boolean;
  wait: () => Promise<number>;
  stopHost: () => void;
}

export interface NormalTraceDependencies {
  now: () => number;
  signal?: AbortSignal;
  notify: (message: string) => void;
  sleepUntil: (deadlineMs: number) => Promise<void>;
  run: (args: string[]) => Promise<void>;
  launchConsole: (args: string[], logPath: string) => Promise<ConsoleHandle>;
}

export interface NormalTraceResult {
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
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

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function assertInstalledAppMatches(
  install: unknown,
  listing: unknown,
): Record<string, unknown> {
  const installations = record(record(install).result).installedApplications;
  const apps = record(record(listing).result).apps;
  const matchingInstalls = Array.isArray(installations)
    ? installations.map(record).filter((app) => app.bundleID === BUNDLE)
    : [];
  const matchingApps = Array.isArray(apps)
    ? apps.map(record).filter((app) => app.bundleIdentifier === BUNDLE)
    : [];
  const installed = matchingInstalls[0];
  const app = matchingApps[0];
  if (
    matchingInstalls.length !== 1 ||
    matchingApps.length !== 1 ||
    app?.version !== "0.23.0" ||
    app.bundleVersion !== "789" ||
    typeof app.url !== "string" ||
    !app.url.startsWith("file:///") ||
    app.url !== installed?.installationURL
  )
    throw new Error("Installed app did not match the pinned installation");
  return app;
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

export function assertProcessIdentifierAbsent(
  value: unknown,
  pid: number,
  executable?: string,
): void {
  const found = new Set<number>();
  collectProcessIdentifiers(value, found);
  if (found.size === 0)
    throw new Error("Process listing did not expose process identifiers");
  const processes = record(record(value).result).runningProcesses;
  if (
    executable !== undefined &&
    (!Array.isArray(processes) ||
      processes.some(
        (entry) =>
          typeof record(entry).executable !== "string" ||
          !Number.isSafeInteger(record(entry).processIdentifier),
      ))
  )
    throw new Error("Process listing did not expose runningProcesses");
  const appRemains =
    executable !== undefined &&
    Array.isArray(processes) &&
    processes.some((process) => record(process).executable === executable);
  if (found.has(pid) || appRemains)
    throw new Error("Replacement app process remained after termination");
}

async function replaceAndTerminateBundle(
  prefix: string,
  captureDir: string,
  deadlineMs: number,
  deps: NormalTraceDependencies,
  executable: string,
): Promise<void> {
  const launchJson = join(captureDir, `${prefix}-replacement-launch.json`);
  const launchLog = join(captureDir, `${prefix}-replacement-launch.log`);
  const launchTimeout = boundedTimeoutSeconds(deps.now(), deadlineMs, 12);
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
  const terminateTimeout = boundedTimeoutSeconds(deps.now(), deadlineMs, 8);
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
  const processesTimeout = boundedTimeoutSeconds(deps.now(), deadlineMs, 6);
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
  assertProcessIdentifierAbsent(
    json(processesJson),
    replacementPid,
    executable,
  );
}

function atomicResult(path: string, result: unknown): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  renameSync(temporary, path);
}

async function installedApps(
  captureDir: string,
  prefix: string,
  deadlineMs: number,
  deps: NormalTraceDependencies,
): Promise<unknown> {
  const path = join(captureDir, `${prefix}.json`);
  await deps.run([
    "devicectl",
    "device",
    "info",
    "apps",
    "--device",
    DEVICE,
    "--timeout",
    String(boundedTimeoutSeconds(deps.now(), deadlineMs, 20)),
    "--json-output",
    path,
    "--log-output",
    join(captureDir, `${prefix}.log`),
  ]);
  return json(path);
}

function timing(startedMs: number, deps: NormalTraceDependencies) {
  const finishedMs = deps.now();
  return {
    startedAt: new Date(startedMs).toISOString(),
    finishedAt: new Date(finishedMs).toISOString(),
    elapsedMs: finishedMs - startedMs,
  };
}

export async function prepareNormalTraceController(
  captureDir: string,
  deps: NormalTraceDependencies,
) {
  const startedMs = deps.now();
  const deadlineMs = startedMs + 120_000;
  let reason: string | undefined;
  try {
    await deps.run([
      "devicectl",
      "device",
      "install",
      "app",
      "--device",
      DEVICE,
      "--timeout",
      "60",
      "--json-output",
      join(captureDir, "install.json"),
      "--log-output",
      join(captureDir, "install.log"),
      ARTIFACT,
    ]);
    const app = assertInstalledAppMatches(
      json(join(captureDir, "install.json")),
      await installedApps(captureDir, "installed-apps", deadlineMs, deps),
    );
    await replaceAndTerminateBundle(
      "cleanup-rehearsal",
      captureDir,
      deadlineMs,
      deps,
      `${String(app.url)}App`,
    );
  } catch (error) {
    reason = error instanceof Error ? error.message : "Preparation failed";
  }
  const result = {
    ready: reason === undefined,
    ...timing(startedMs, deps),
    ...(reason === undefined ? {} : { reason }),
  };
  atomicResult(join(captureDir, "preparation.json"), result);
  return result;
}

export async function runNormalTraceController(
  captureDir: string,
  hardDeadlineMs: number,
  deps: NormalTraceDependencies,
): Promise<NormalTraceResult> {
  const startedMs = deps.now();
  if (
    !Number.isFinite(hardDeadlineMs) ||
    hardDeadlineMs - startedMs <= CLEANUP_RESERVE_MS ||
    hardDeadlineMs - startedMs > HARD_BUDGET_MS
  )
    throw new Error(
      "Capture deadline must leave cleanup time and be within eight minutes",
    );
  if (
    ["normal-console.log", "evidence.json"].some((name) =>
      existsSync(join(captureDir, name)),
    )
  )
    throw new Error("Directory already contains capture evidence");
  // Human setup and permission happen in chat before this explicit invocation.
  // The caller supplies the agreed deadline, so setup time is not reset here.
  const install = json(join(captureDir, "install.json"));
  const prepared = assertInstalledAppMatches(
    install,
    json(join(captureDir, "installed-apps.json")),
  );
  const executable = `${String(prepared.url)}App`;
  const consoleLog = join(captureDir, "normal-console.log");
  let consoleHandle: ConsoleHandle | undefined;
  let consoleLaunchAttempted = false;
  let runError: unknown = null;
  let cleanupVerified = false;
  let finish: (() => void) | undefined;
  try {
    assertInstalledAppMatches(
      install,
      await installedApps(
        captureDir,
        "capture-installed-apps",
        hardDeadlineMs - CLEANUP_RESERVE_MS,
        deps,
      ),
    );
    if (deps.signal?.aborted)
      throw new Error("capture stopped before console launch");
    {
      const launchTimeout = boundedTimeoutSeconds(
        deps.now(),
        hardDeadlineMs,
        8 * 60,
      );
      // A rejected preflight must not launch any app, even for cleanup.
      // Once launch is attempted, an ambiguous failure still needs cleanup.
      consoleLaunchAttempted = true;
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
          String(launchTimeout),
          "--json-output",
          join(captureDir, "normal-launch.json"),
          BUNDLE,
        ],
        consoleLog,
      );
      if (!consoleHandle.isRunning())
        throw new Error("attached console exited before capture");
      // SIGINT is an agent-owned finish request; it does not authorize a scan.
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      deps.signal?.addEventListener("abort", finish!, { once: true });
      if (deps.signal?.aborted) finish!();
      deps.notify("CAPTURE_ATTACHED");
      await Promise.race([
        finished,
        deps.sleepUntil(hardDeadlineMs - CLEANUP_RESERVE_MS),
        consoleHandle.wait().then((code) => {
          throw new Error(`attached console exited before capture (${code})`);
        }),
      ]);
      if (!consoleHandle.isRunning())
        throw new Error("attached console exited before capture");
    }
  } catch (error) {
    runError = error;
  } finally {
    if (finish) deps.signal?.removeEventListener("abort", finish);
    if (consoleLaunchAttempted) {
      try {
        await replaceAndTerminateBundle(
          "normal-cleanup",
          captureDir,
          hardDeadlineMs,
          deps,
          executable,
        );
        cleanupVerified = true;
      } catch {
        // Device state is unknown; the host must not invent a phone instruction.
      }
    }
    consoleHandle?.stopHost();
    try {
      await consoleHandle?.wait();
    } catch (error) {
      runError ??= error;
    }
  }
  const reasons = [
    ...(runError === null
      ? []
      : [
          runError instanceof Error
            ? runError.message
            : "controller run aborted",
        ]),
    ...(consoleLaunchAttempted && !cleanupVerified
      ? ["bundle-scoped cleanup could not be verified"]
      : []),
  ];
  const decision: GateConsoleDecision =
    reasons.length > 0
      ? { outcome: "inconclusive", reasons }
      : existsSync(consoleLog)
        ? classifyGateConsoleEvidence(readFileSync(consoleLog, "utf-8"))
        : {
            outcome: "inconclusive",
            reasons: ["console log was not captured"],
          };
  const result = { ...timing(startedMs, deps), cleanupVerified, decision };
  atomicResult(join(captureDir, "evidence.json"), result);
  return result;
}

function runXcrun(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("xcrun", args, { stdio: "ignore" });
    const timeoutAt = args.indexOf("--timeout");
    const timeoutSeconds = Number(args[timeoutAt + 1]);
    const guard = setTimeout(
      () => child.kill("SIGKILL"),
      (Number.isFinite(timeoutSeconds) ? timeoutSeconds : 1) * 1_000,
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
  const descriptor = openSync(logPath, "wx", 0o600);
  const child = spawn("xcrun", args, {
    stdio: ["ignore", descriptor, descriptor],
  });
  closeSync(descriptor);
  const timeoutAt = args.indexOf("--timeout");
  const timeoutSeconds = Number(args[timeoutAt + 1]);
  const guard = setTimeout(
    () => child.kill("SIGKILL"),
    (Number.isFinite(timeoutSeconds) ? timeoutSeconds : 1) * 1_000,
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
    isRunning: () => child.exitCode === null && child.signalCode === null,
    wait: () => settled,
    stopHost: () => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    },
  });
}

const processArgv = (globalThis as unknown as { process: { argv: string[] } })
  .process.argv;
const invokedPath = processArgv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const [mode, captureDir, deadline] = processArgv.slice(2);
  if (
    (mode !== "prepare" && mode !== "capture") ||
    !captureDir ||
    (mode === "capture" && !deadline)
  )
    throw new Error(
      "Usage: pnpm exec tsx scripts/nfc-normal-trace-controller.ts prepare <capture-dir> | capture <capture-dir> <deadline-ISO>",
    );
  const stop = new AbortController();
  const finish = () => stop.abort();
  process.on("SIGINT", finish);
  process.on("SIGTERM", finish);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deps: NormalTraceDependencies = {
      now: Date.now,
      signal: stop.signal,
      notify: (message) => console.log(message),
      sleepUntil: (deadlineMs) =>
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, Math.max(0, deadlineMs - Date.now()));
        }),
      run: runXcrun,
      launchConsole: launchXcrunConsole,
    };
    const result =
      mode === "prepare"
        ? await prepareNormalTraceController(captureDir, deps)
        : await runNormalTraceController(
            captureDir,
            Date.parse(deadline!),
            deps,
          );
    console.log(
      JSON.stringify(result, (_key, value: unknown) =>
        _key === "evidence" ? undefined : value,
      ),
    );
  } finally {
    if (timer) clearTimeout(timer);
    process.off("SIGINT", finish);
    process.off("SIGTERM", finish);
  }
}
