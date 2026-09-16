#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { constants } from "node:os";
import { fileURLToPath } from "node:url";
import { hostedMode, readHost } from "./local-work/host.mjs";
import { inspectOwner, recoverOwner } from "./local-work/owner.mjs";
import { runWorkload } from "./local-work/run.mjs";
import { workloadPhases, testScope } from "./local-work/workloads.mjs";

export const exclusions = [
  "integration/full tests containing integration",
  "browser/Compose",
  "native",
  "watch/dev",
  "install/bootstrap",
  "mutation",
  "independent clones and older worktrees",
  "pre-push exact union/dedup (legacy three populations retained)",
];
const refuse = (message) =>
  Object.assign(new Error(message), { exitCode: 75, code: "RESOURCE_REFUSED" });

function context(cwd) {
  const git = (...args) => {
    const result = spawnSync("git", ["rev-parse", ...args], {
      cwd,
      encoding: "utf8",
      timeout: 2000,
    });
    if (result.status !== 0)
      throw refuse("Cannot resolve Git coordination directory");
    return fs.realpathSync(path.resolve(cwd, result.stdout.trim()));
  };
  const worktree = git("--show-toplevel");
  const commonDir = git("--git-common-dir");
  const root = path.join(commonDir, "ergomatic-local-work");
  try {
    fs.mkdirSync(root, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const stat = fs.lstatSync(root);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o077) !== 0 ||
    fs.realpathSync(root) !== root
  )
    throw refuse("Coordination root must be canonical and private");
  return { root, commonDir, worktree, app: path.join(worktree, "app") };
}

// Hosted jobs and excluded legacy adapters preserve their original foreground
// lifecycle. They never claim local ownership or verified descendant cleanup.
export async function runUnmanaged(phases, write = console.error) {
  for (const phase of typeof phases === "function" ? await phases() : phases) {
    const outcome = await new Promise((resolve) => {
      const env = { ...phase.env };
      delete env.ERGOMATIC_TEST_OUTCOME;
      const child = spawn(phase.command, phase.args, {
        cwd: phase.cwd,
        env,
        stdio: "inherit",
        detached: true,
      });
      let interrupted = null;
      const signal = (s) => {
        interrupted ??= s;
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          try {
            process.kill(-child.pid, s);
          } catch (error) {
            if (error.code !== "ESRCH") write(error.message);
          }
        }
      };
      const interrupt = () => signal("SIGINT"),
        terminate = () => signal("SIGTERM");
      process.on("SIGINT", interrupt);
      process.on("SIGTERM", terminate);
      const finish = (code, signal) => {
        process.off("SIGINT", interrupt);
        process.off("SIGTERM", terminate);
        resolve({ code, signal, interrupted });
      };
      child.once("error", (error) => {
        write(error.message);
        finish(127, null);
      });
      child.once("exit", finish);
    });
    if (outcome.signal || outcome.interrupted) {
      write(`local-work: signal ${outcome.signal ?? outcome.interrupted}`);
      return 128 + constants.signals[outcome.signal ?? outcome.interrupted];
    }
    if (outcome.code !== 0) return outcome.code ?? 1;
  }
  return 0;
}

export async function main(
  argv,
  {
    cwd = process.cwd(),
    env = process.env,
    observe = readHost,
    write = console.error,
  } = {},
) {
  try {
    const [operation, name, ...args] = argv;
    if (
      !["status", "recover", "run"].includes(operation) ||
      (operation === "status" && name !== undefined) ||
      (operation === "recover" && (!name || args.length)) ||
      (operation === "run" && !name)
    )
      throw new Error(
        "Usage: local-work.mjs status | recover <generation> | run <workload> [args]",
      );
    const hosted = hostedMode(env);
    if (operation === "run" && hosted) {
      const app = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
      );
      const phases = workloadPhases({ app, name, args, env, hosted, write });
      return await runUnmanaged(
        name === "test-capture"
          ? phases.map((phase) => ({
              ...phase,
              command: process.execPath,
              args: [
                path.join(app, "scripts/test-evidence.mjs"),
                "run",
                "vitest",
                "--",
                phase.command,
                ...phase.args,
              ],
            }))
          : phases,
        write,
      );
    }
    const ctx = context(cwd);
    if (operation === "status") {
      write(
        JSON.stringify(
          {
            ...inspectOwner(ctx.root),
            ...ctx,
            pressure: observe().pressure,
            exclusions,
          },
          null,
          2,
        ),
      );
      return 0;
    }
    if (operation === "recover") {
      recoverOwner(ctx.root, name, (record) => {
        const rows = observe().processes?.value;
        if (
          !rows ||
          record.commonDir !== ctx.commonDir ||
          rows.some((p) => p.pid === record.pid && p.started === record.start)
        )
          return false;
        // No PID-only, TTL or active-phase recovery. A crash between launch and
        // durable child publication is inherently unknown in this increment.
        return record.phase === "idle";
      });
      write(
        `local-work: recovered stale idle generation ${name}; no process was killed`,
      );
      return 0;
    }
    const test = [
      "test",
      "test-capture",
      "test-full",
      "test-coverage",
    ].includes(name);
    const projects = test
      ? testScope(args, env, ["test-full", "test-coverage"].includes(name))
      : [];
    if (name === "test-capture" && projects.includes("integration"))
      throw new Error(
        "Local capture admits unit/client only; integration ownership is not installed",
      );
    const excluded = projects.includes("integration");
    const phases = workloadPhases({
      app: ctx.app,
      name,
      args,
      env,
      allowExcluded: excluded,
      write,
    });
    const host = observe();
    const self = host.processes?.value?.find(
      (p) => p.pid === process.pid && p.uid === process.getuid(),
    );
    if (!self) throw refuse("Cannot establish owner process-start identity");
    if (excluded) {
      write(
        `local-work: EXCLUDED lifecycle; projects: ${projects.join(", ")}. Integration cleanup is not managed; controller coordination required.`,
      );
      if (host.pressure?.state !== "normal")
        throw refuse(
          `Pressure ${host.pressure?.state ?? "unknown"}; excluded workload not launched`,
        );
      const state = inspectOwner(ctx.root);
      if (state.status !== "free")
        throw refuse(`Owner ${state.status}; run local-work.mjs status`);
      return await runUnmanaged(phases, write);
    }
    const metadata = {
      id: randomUUID(),
      uid: process.getuid(),
      commonDir: ctx.commonDir,
      worktree: ctx.worktree,
      pid: process.pid,
      start: self.started,
      phase: "idle",
    };
    const receipt = await runWorkload({
      root: ctx.root,
      metadata,
      phases,
      observe,
      invocation: {
        argv: [process.execPath, fileURLToPath(import.meta.url), ...argv],
        cwd: ctx.app,
        env,
        scope: { workload: name, args, projects },
      },
    });
    write(
      `local-work: ${receipt.classification}; exit=${receipt.exitCode}; signal=${receipt.signal ?? "none"}; cleanup=${receipt.cleanup}; receipt=${receipt.directory}`,
    );
    return receipt.exitCode;
  } catch (error) {
    write(
      `local-work: ${error.exitCode === 75 ? "resource-refused" : "invalid-command"}: ${error.message}. No automatic retry; inspect local-work.mjs status.`,
    );
    return error.exitCode ?? 64;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await main(process.argv.slice(2));
