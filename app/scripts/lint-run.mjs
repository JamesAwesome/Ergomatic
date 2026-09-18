import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const CACHE_INPUTS = [
  "pnpm-lock.yaml",
  "eslint.config.js",
  "eslint-suppressions.json",
];

const PARTITIONS = [
  ["src/monitor/**/*.test.{ts,tsx}", "--no-error-on-unmatched-pattern"],
  [
    "src/session/**/*.test.{ts,tsx}",
    "src/workout/**/*.test.{ts,tsx}",
    "--no-error-on-unmatched-pattern",
  ],
  [
    "src/**/*.test.{ts,tsx}",
    "domain/**/*.test.{ts,tsx}",
    "scripts/**/*.test.{ts,tsx}",
    "shared/**/*.test.{ts,tsx}",
    "--ignore-pattern",
    "src/monitor/**",
    "--ignore-pattern",
    "src/session/**",
    "--ignore-pattern",
    "src/workout/**",
    "--no-error-on-unmatched-pattern",
  ],
  [
    "src",
    "domain",
    "scripts",
    "shared",
    "--ignore-pattern",
    "**/*.test.{ts,tsx}",
  ],
  ["server"],
  ["e2e"],
  ["*.{js,mjs,cjs,ts,tsx}"],
  ["."],
];

const defaultCwd = fileURLToPath(new URL("..", import.meta.url));

function systemPressure() {
  const result = spawnSync(
    "sysctl",
    ["-n", "kern.memorystatus_vm_pressure_level"],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`sysctl exited ${String(result.status)}`);
  }
  return result.stdout;
}

export function cacheFingerprint({ nodeVersion, files }) {
  const hash = createHash("sha256");
  hash.update("ergomatic-eslint-cache-v1\0");
  hash.update(nodeVersion);
  for (const [name, contents] of files) {
    hash.update("\0");
    hash.update(name);
    hash.update("\0");
    hash.update(contents);
  }
  return hash.digest("hex");
}

export function lintInvocations({ cacheLocation, prune = false }) {
  if (prune) return [[".", "--prune-suppressions"]];
  const cache = [
    "--cache",
    "--cache-strategy",
    "content",
    "--cache-location",
    cacheLocation,
  ];
  return PARTITIONS.map((args) => [...args, ...cache]);
}

export function runLint({
  cwd = defaultCwd,
  platform = process.platform,
  nodeVersion = process.version,
  prune = false,
  readPressure = systemPressure,
  runChild = spawnSync,
  resignal = (signal) => process.kill(process.pid, signal),
  logError = console.error,
} = {}) {
  if (platform === "darwin") {
    let pressure;
    try {
      pressure = readPressure().trim();
    } catch {
      pressure = "";
    }
    if (pressure !== "1") {
      logError(
        "lint deferred: macOS memory pressure is not normal (exit 75); no ESLint child started",
      );
      return 75;
    }
  }

  let cacheLocation = "";
  let completionMarker = "";
  let warmCache = false;
  if (!prune) {
    const files = CACHE_INPUTS.map((name) => [
      name,
      readFileSync(path.join(cwd, name)),
    ]);
    const fingerprint = cacheFingerprint({ nodeVersion, files });
    const cacheDirectory = path.join(cwd, "node_modules", ".cache", "eslint");
    cacheLocation = path.join(cacheDirectory, `${fingerprint}.cache`);
    completionMarker = path.join(cacheDirectory, `${fingerprint}.complete`);
    warmCache = existsSync(cacheLocation) && existsSync(completionMarker);
    mkdirSync(cacheDirectory, { recursive: true });
  }

  const executable = path.join(
    cwd,
    "node_modules",
    ".bin",
    platform === "win32" ? "eslint.cmd" : "eslint",
  );
  const invocations = lintInvocations({ cacheLocation, prune });
  const scheduledInvocations = warmCache ? invocations.slice(-1) : invocations;
  for (const args of scheduledInvocations) {
    const result = runChild(executable, args, { cwd, stdio: "inherit" });
    if (result.signal) {
      resignal(result.signal);
      return 1;
    }
    if (result.status !== 0) return result.status ?? 1;
  }
  if (!prune) writeFileSync(completionMarker, "");
  return 0;
}

const isCli =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isCli) {
  process.exitCode = runLint({
    prune: process.argv.slice(2).includes("--prune"),
  });
}
