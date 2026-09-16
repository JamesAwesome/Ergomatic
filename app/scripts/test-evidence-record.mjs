import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { platform, release } from "node:os";

// Passive record operations shared by the hosted observer and local owner.
// No process ownership, host census, signal handlers or periodic sampler here.
export function command(
  bin,
  args,
  { cwd = process.cwd(), env = process.env } = {},
) {
  const result = spawnSync(bin, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 2000,
    maxBuffer: 1024 * 1024,
  });
  return result.status === 0
    ? { value: result.stdout.trim() }
    : {
        unavailable:
          result.error?.message ??
          result.stderr?.trim() ??
          `exit ${result.status}`,
      };
}

export function atomic(path, data) {
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
  renameSync(`${path}.tmp`, path);
}

export function reportDigest(path) {
  if (lstatSync(path).isSymbolicLink() || !statSync(path).isFile())
    throw new Error("report is not a regular invocation file");
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function provenance({
  cwd = process.cwd(),
  source = cwd,
  env = process.env,
} = {}) {
  const diff = command("git", ["diff", "HEAD", "--binary"], {
    cwd: source,
    env,
  });
  const sha = command("git", ["rev-parse", "HEAD"], { cwd: source, env });
  const versions = { node: process.version };
  const unavailable = {};
  for (const pkg of [
    "vitest",
    "@playwright/test",
    "typescript",
    "vite",
    "eslint",
    "lint-staged",
  ]) {
    try {
      const version = JSON.parse(
        readFileSync(resolve(cwd, "node_modules", pkg, "package.json"), "utf8"),
      ).version;
      if (typeof version !== "string" || !version.trim())
        throw new Error("missing installed version");
      versions[pkg] = version;
    } catch (error) {
      versions[pkg] = null;
      unavailable[pkg] = error.message;
    }
  }
  const pnpm = command("pnpm", ["--version"], { cwd, env });
  versions.pnpm = pnpm.value ?? null;
  if (pnpm.unavailable !== undefined) unavailable.pnpm = pnpm.unavailable;
  return {
    sha,
    trackedDiff:
      diff.value === undefined
        ? diff
        : {
            dirty: diff.value.length > 0,
            sha256: createHash("sha256").update(diff.value).digest("hex"),
          },
    sourceIdentity: {
      status:
        sha.value && diff.value !== undefined ? "recorded" : "unavailable",
      scope:
        "HEAD and tracked working-tree/index diff; untracked files are not fingerprinted",
    },
    versions,
    unavailableVersions: unavailable,
    os: { platform: platform(), release: release() },
    ci: Object.fromEntries(
      [
        "CI",
        "GITHUB_RUN_ID",
        "GITHUB_RUN_ATTEMPT",
        "GITHUB_JOB",
        "GITHUB_WORKFLOW",
        "RUNNER_NAME",
      ].map((key) => [key, env[key] ?? null]),
    ),
    configuration: Object.fromEntries(
      [
        "ERGOMATIC_TEST_WORKERS",
        "ERGOMATIC_E2E_WORKERS",
        "ERGOMATIC_EVIDENCE_TRACE",
        "E2E_BASE_URL",
        "COMPOSE_PROJECT_NAME",
        "ERGO_STACK",
      ].map((key) => [key, env[key] ?? null]),
    ),
  };
}

export function evidenceReceipt({
  id,
  root,
  directory,
  runner = null,
  argv,
  cwd = process.cwd(),
  source = cwd,
  env = process.env,
}) {
  return {
    schema: 1,
    id,
    root,
    directory,
    runner,
    terminal: false,
    start: new Date().toISOString(),
    end: null,
    argv,
    cwd,
    ...provenance({ cwd, source, env }),
    exitCode: null,
    signal: null,
    diagnosticErrors: [],
  };
}

export function bindNativeReport(receipt) {
  try {
    receipt.reportSha256 = reportDigest(join(receipt.directory, "report.json"));
  } catch (error) {
    receipt.reportError = error.message;
  }
}

export function recordResources(directory, sample) {
  appendFileSync(
    join(directory, "resources.jsonl"),
    JSON.stringify(sample) + "\n",
    { mode: 0o600 },
  );
}

export function captureLogs(directory, errors) {
  const fds = [];
  const failed = new Set();
  const streamFailure = (index, error) => {
    if (failed.has(index)) return;
    failed.add(index);
    errors.push(`${index === 0 ? "stdout" : "stderr"}: ${error.message}`);
  };
  let allocation = false,
    tail = "";
  try {
    for (const name of ["stdout", "stderr"])
      fds.push(openSync(join(directory, `${name}.log`), "wx", 0o600));
  } catch (error) {
    for (const fd of fds) closeSync(fd);
    throw error;
  }
  return {
    get allocationFailure() {
      return allocation;
    },
    attach(child) {
      const closed = new Promise((done) => child.once("close", done));
      for (const [index, stream] of [child.stdout, child.stderr].entries()) {
        stream.pipe(index === 0 ? process.stdout : process.stderr, {
          end: false,
        });
        stream.on("data", (chunk) => {
          try {
            for (let offset = 0; !failed.has(index) && offset < chunk.length;) {
              const written = writeSync(
                fds[index],
                chunk,
                offset,
                chunk.length - offset,
              );
              if (!written)
                throw new Error("evidence stream write made no progress");
              offset += written;
            }
          } catch (error) {
            streamFailure(index, error);
          }
          if (index === 1) {
            const text = tail + chunk.toString();
            allocation ||= text.includes("Allocation failed");
            tail = text.slice(-1024);
          }
        });
        stream.on("error", (error) => streamFailure(index, error));
      }
      return async () => {
        let timer;
        await Promise.race([
          closed,
          new Promise((done) => {
            timer = setTimeout(() => {
              errors.push(
                "stdio drain exceeded 2000 ms after child exit; output may be incomplete",
              );
              child.stdout.destroy();
              child.stderr.destroy();
              done();
            }, 2000);
          }),
        ]);
        clearTimeout(timer);
      };
    },
    close() {
      for (const [index, fd] of fds.entries()) {
        try {
          closeSync(fd);
        } catch (error) {
          streamFailure(index, error);
        }
      }
    },
  };
}
